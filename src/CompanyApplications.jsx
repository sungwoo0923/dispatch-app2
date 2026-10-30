// src/CompanyApplications.jsx
import { publishCompany } from "./publicCompanies";
import React, { useState, useEffect, useMemo } from "react";
import { kpConfirm } from "./kpDialog";
import { imeFocusRef } from "./imeFocus";
import { db, auth } from "./firebase";
import {
  collection, onSnapshot, doc, updateDoc, getDoc, setDoc, serverTimestamp, query, where, deleteDoc, addDoc,
} from "firebase/firestore";
import { EditableText } from "./EditMode";

// 전화번호 하이픈 자동 포맷 (DispatchApp.jsx formatPhone과 동일 규칙)
const formatPhone = (phone) => {
  const p = String(phone ?? "").replace(/[^\d]/g, "");
  if (p.length === 11) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
  if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
  return p;
};

const generateCompanyCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "SF-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const generateTransportCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "TP-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const todayStr = () => {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

const fmtDate = (ts) => {
  if (!ts?.seconds) return "-";
  return new Date(ts.seconds * 1000).toLocaleString("ko-KR", {
    year: "2-digit", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

const statusLabel = (s) =>
  s === "approved" ? "승인" : s === "rejected" ? "거절" : "대기";

const StatusBadge = ({ status }) => {
  const cls = status === "approved" ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
    : status === "rejected" ? "bg-white text-[#7A89A3] border-[#C9D3E3] line-through"
    : "bg-[#EEF3FC] text-[#2D4C82] border-[#8FB0F0]";
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border whitespace-nowrap ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === "approved" ? "bg-[#8FB0F0]" : status === "rejected" ? "bg-[#C9D3E3]" : "bg-[#2D4C82]"}`} />
      {statusLabel(status)}
    </span>
  );
};

const InfoRow = ({ label, value }) => (
  <div className="flex items-start px-4 py-2.5 border-b border-[#EEF1F6] last:border-b-0 min-w-0">
    <span className="text-[12px] text-[#7A89A3] w-24 shrink-0 whitespace-nowrap"><EditableText id={`companyApp.infoRow.${label}`} defaultText={label} /></span>
    <span className="text-[13px] font-semibold text-[#0F1A30] min-w-0 break-all">{value || "-"}</span>
  </div>
);

const PLANS = [["lite", "라이트"], ["basic", "베이직"], ["standard", "스탠다드"], ["pro", "프로"]];
const planName = (id) => (PLANS.find(([k]) => k === id) || [])[1] || id || "-";
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
// 상세 패널의 섹션 카드
const Sec = ({ title, en, children, right }) => (
  <div className="rounded-2xl border border-[#E3E8F0] bg-white overflow-hidden">
    <div className="px-4 py-2.5 flex items-center justify-between gap-2 border-b border-[#EEF1F6] bg-[#F7F9FC]">
      <div className="min-w-0 flex items-baseline gap-2">
        {en && <span className="text-[9.5px] font-extrabold tracking-[0.22em] text-[#8FB0F0] whitespace-nowrap" style={{ fontFamily: MONO }}>{en}</span>}
        <span className="text-[13px] font-black text-[#0F1A30] whitespace-nowrap">{title}</span>
      </div>
      {right}
    </div>
    {children}
  </div>
);

export default function CompanyApplications() {
  const [activeTab, setActiveTab] = useState("화주");

  const [companyApps, setCompanyApps] = useState([]);
  const [transportApps, setTransportApps] = useState([]);
  const [driverApps, setDriverApps] = useState([]);
  const [editRequests, setEditRequests] = useState([]);

  const [statusFilter, setStatusFilter] = useState("pending");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [managingApp, setManagingApp] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [codeNotice, setCodeNotice] = useState(null);
  const [showCodeLookup, setShowCodeLookup] = useState(false);
  const [codeLookupQuery, setCodeLookupQuery] = useState("");
  const [appUserPerms, setAppUserPerms] = useState(null);
  const [reviewingEdit, setReviewingEdit] = useState(null);
  const [editRejectReason, setEditRejectReason] = useState("");
  const [showEditRejectInput, setShowEditRejectInput] = useState(false);
  const [viewLimitDraft, setViewLimitDraft] = useState("");
  // 💳 회사별 요금제(companyPlans/{회사}) — 목록에 표시 + 상세 패널에서 최고관리자가 변경
  const [plans, setPlans] = useState({});
  const [planDraft, setPlanDraft] = useState("");
  const [planSaving, setPlanSaving] = useState(false);
  useEffect(() => onSnapshot(collection(db, "companyPlans"), (s) => {
    const m = {}; s.docs.forEach((d) => { m[d.id] = d.data(); }); setPlans(m);
  }, () => setPlans({})), []);
  useEffect(() => { setPlanDraft(""); }, [managingApp?.id]);
  const savePlan = async (company, pid) => {
    if (!company || !pid) return;
    const prev = plans[company]?.planId;
    if (prev === pid) return;
    if (!await kpConfirm(`"${company}" 요금제를 ${planName(prev)} → ${planName(pid)}(으)로 바꿀까요?\n그 회사 화면의 메뉴가 바로 바뀝니다.`)) return;
    setPlanSaving(true);
    try {
      const hist = [...(plans[company]?.history || []), { at: new Date().toISOString(), from: prev || null, to: pid, by: auth.currentUser?.email || "" }].slice(-30);
      await setDoc(doc(db, "companyPlans", company), { planId: pid, since: new Date().toISOString().slice(0, 10), updatedAt: serverTimestamp(), history: hist }, { merge: true });
      setPlanDraft("");
    } catch (e) { alert("요금제 변경 실패: " + (e?.message || e)); } finally { setPlanSaving(false); }
  };

  useEffect(() => {
    setViewLimitDraft(managingApp?.viewLimitUnlockedUntil || "");
  }, [managingApp?.id]);

  const saveViewLimitUnlock = async (untilValue) => {
    setProcessing(true);
    try {
      await updateDoc(doc(db, "companyApplications", managingApp.id), {
        viewLimitUnlockedUntil: untilValue || null,
        viewLimitUnlockedBy: auth.currentUser?.email || "",
        viewLimitUnlockedAt: serverTimestamp(),
      });
      setManagingApp((prev) => (prev ? { ...prev, viewLimitUnlockedUntil: untilValue || null } : null));
      setViewLimitDraft(untilValue || "");
      alert(untilValue ? `조회제한이 ${untilValue}까지 해제되었습니다.` : "조회제한이 다시 적용되었습니다.");
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "companyApplications"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setCompanyApps(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "transportApplications"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setTransportApps(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "users"),
      where("role", "==", "driver"),
      where("approved", "==", false)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, uid: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setDriverApps(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "companyEditRequests"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setEditRequests(list);
    });
    return () => unsub();
  }, []);

  // 관리 모달에서 화주 유저 권한 로드
  useEffect(() => {
    if (!managingApp?.userId || activeTab !== "화주") { setAppUserPerms(null); return; }
    getDoc(doc(db, "users", managingApp.userId)).then(snap => {
      setAppUserPerms(snap.exists() ? (snap.data().permissions || {}) : {});
    });
  }, [managingApp?.userId, activeTab]);

  // 👤 운송사 가입자 계정 권한(최고관리자) — 역할·마스터 여부를 가입신청관리에서 바로 바꾼다
  const [tUser, setTUser] = useState(null);
  const [tRole, setTRole] = useState("admin");
  const [tMaster, setTMaster] = useState(false);
  const [tSaving, setTSaving] = useState(false);
  useEffect(() => {
    if (!managingApp?.userId || activeTab !== "운송") { setTUser(null); return; }
    getDoc(doc(db, "users", managingApp.userId)).then((snap) => {
      const u = snap.exists() ? snap.data() : null;
      setTUser(u); setTRole(u?.role || "admin"); setTMaster(u?.isMaster === true);
    }).catch(() => setTUser(null));
  }, [managingApp?.userId, activeTab]);
  const saveTransportRole = async () => {
    if (!managingApp?.userId) return;
    setTSaving(true);
    try {
      const history = [...(tUser?.personnelHistory || []), { date: new Date().toISOString().slice(0, 10), type: "권한변경(최고관리자)", detail: `${tUser?.role || "-"} → ${tRole}${tMaster ? " · 마스터" : ""}` }];
      await updateDoc(doc(db, "users", managingApp.userId), { role: tRole, isMaster: tMaster, personnelHistory: history });
      setTUser((p) => ({ ...(p || {}), role: tRole, isMaster: tMaster, personnelHistory: history }));
      alert("계정 권한을 저장했습니다. 그 사람이 다시 들어오면 바로 적용됩니다.");
    } catch (e) { alert("저장 실패: " + (e?.message || e)); } finally { setTSaving(false); }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setStatusFilter("pending");
    setTypeFilter("all");
    setSearchQuery("");
    setManagingApp(null);
    setShowRejectModal(false);
    setRejectReason("");
    setReviewingEdit(null);
    setEditRejectReason("");
    setShowEditRejectInput(false);
  };

  const approveEditRequest = async (req) => {
    setProcessing(true);
    try {
      const d = req.requestedData || {};
      if (req.transportApplicationId) {
        const updatePayload = {};
        if (d.companyName) updatePayload.companyName = d.companyName;
        if (d.representative) { updatePayload.representative = d.representative; updatePayload.대표자 = d.representative; }
        if (d.address) { updatePayload.address = d.address; updatePayload.주소 = d.address; }
        if (d.businessNumber) { updatePayload.businessNumber = d.businessNumber; updatePayload.사업자번호 = d.businessNumber; }
        if (d.phone) { updatePayload.phone = d.phone; updatePayload.연락처 = d.phone; }
        if (d.fax) { updatePayload.fax = d.fax; updatePayload.팩스 = d.fax; }
        if (d.email) updatePayload.email = d.email;
        await updateDoc(doc(db, "transportApplications", req.transportApplicationId), updatePayload);
      }
      await updateDoc(doc(db, "companyEditRequests", req.id), {
        status: "approved",
        processedAt: serverTimestamp(),
        notifiedRequester: false,
      });
      setReviewingEdit(null);
    } finally {
      setProcessing(false);
    }
  };

  const rejectEditRequest = async (req, reason) => {
    setProcessing(true);
    try {
      await updateDoc(doc(db, "companyEditRequests", req.id), {
        status: "rejected",
        rejectReason: reason || "",
        processedAt: serverTimestamp(),
        notifiedRequester: false,
      });
      setReviewingEdit(null);
      setEditRejectReason("");
      setShowEditRejectInput(false);
    } finally {
      setProcessing(false);
    }
  };

  const activeData = activeTab === "화주" ? companyApps : activeTab === "운송" ? transportApps : activeTab === "기사" ? driverApps : editRequests;
  const pendingEditCount = editRequests.filter(r => r.status === "pending").length;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list;
    if (activeTab === "기사") {
      if (statusFilter === "all") list = activeData;
      else if (statusFilter === "pending") list = activeData.filter((a) => a.approved === false && a.status !== "rejected");
      else if (statusFilter === "approved") list = activeData.filter((a) => a.approved === true);
      else if (statusFilter === "rejected") list = activeData.filter((a) => a.status === "rejected");
      else list = activeData;
    } else {
      list = activeData.filter((a) => {
        const matchStatus = statusFilter === "all" ? true : a.status === statusFilter;
        const matchType = typeFilter === "all" ? true : a.type === typeFilter;
        return matchStatus && matchType;
      });
    }
    if (q) {
      list = list.filter((a) =>
        (a.companyName || "").toLowerCase().includes(q) ||
        (a.name || a.displayName || "").toLowerCase().includes(q) ||
        (a.phone || "").includes(q) ||
        (a.email || "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (a.companyName || a.name || "").localeCompare(b.companyName || b.name || ""));
  }, [activeData, statusFilter, typeFilter, activeTab, searchQuery]);

  // --- 처리 함수 ---

  const approveCompany = async (app) => {
    setProcessing(true);
    try {
      let companyCode = app.companyCode;
      if (!companyCode) {
        if (app.type === "기존") {
          const parent = companyApps.find(
            (a) => a.companyName === app.companyName && a.type === "신규" && a.status === "approved" && a.companyCode
          );
          companyCode = parent?.companyCode || generateCompanyCode();
        } else {
          companyCode = generateCompanyCode();
        }
      }
      await updateDoc(doc(db, "companyApplications", app.id), {
        status: "approved",
        companyCode,
        processedAt: serverTimestamp(),
      });
      if (app.userId && app.userId !== auth.currentUser?.uid) {
        const isFirstMaster = app.type === "신규";
        const userPayload = {
          approved: true,
          companyCode,
          companyName: app.companyName,
          businessNumber: app.businessNumber || "",
        };
        if (isFirstMaster) {
          userPayload.permissions = { master: true, subMaster: false, settlement: false, transport: false };
        }
        await updateDoc(doc(db, "users", app.userId), userPayload);
      }
      setManagingApp(null);
      setCodeNotice({ companyName: app.companyName, companyCode, email: app.email, phone: app.phone, appType: "화주" });
    } finally {
      setProcessing(false);
    }
  };

  const rejectCompany = async (app, reason) => {
    setProcessing(true);
    try {
      await updateDoc(doc(db, "companyApplications", app.id), {
        status: "rejected",
        rejectionReason: reason || "",
        processedAt: serverTimestamp(),
      });
      setShowRejectModal(false);
      setRejectReason("");
      setManagingApp(null);
    } finally {
      setProcessing(false);
    }
  };

  const [approvePlan, setApprovePlan] = useState("");
  useEffect(() => { setApprovePlan(""); }, [managingApp?.id]);
  const approveTransport = async (app) => {
    setProcessing(true);
    try {
      publishCompany(app.companyName, app.type === "신규" ? app.address : "").catch(() => {});
      let companyCode = app.companyCode;
      if (!companyCode) {
        if (app.type === "기존") {
          const parent = transportApps.find(
            (a) => a.companyName === app.companyName && a.type === "신규" && a.status === "approved" && a.companyCode
          );
          companyCode = parent?.companyCode || generateTransportCode();
        } else {
          companyCode = generateTransportCode();
        }
      }
      await updateDoc(doc(db, "transportApplications", app.id), {
        status: "approved",
        companyCode,
        processedAt: serverTimestamp(),
      });
      // 💳 요금제 연결 — 신청한(또는 승인 때 고른) 요금제로 회사 메뉴가 열린다
      if (app.type !== "기존" && app.companyName) {
        const pid = approvePlan || app.requestedPlan || "standard";
        try {
          await setDoc(doc(db, "companyPlans", app.companyName.trim()), { planId: pid, since: new Date().toISOString().slice(0, 10), updatedAt: serverTimestamp() }, { merge: true });
          await updateDoc(doc(db, "transportApplications", app.id), { approvedPlan: pid });
        } catch (_) {}
      }
      // 🚀 신규 운송사 → 그 회사 관리자가 처음 들어올 때 튜토리얼 + 초기 설정 마법사를 띄운다(Onboarding.jsx)
      if (app.type !== "기존" && app.companyName) {
        try { await setDoc(doc(db, "companySettings", app.companyName.trim()), { onboarding: { pending: true, approvedAt: serverTimestamp() } }, { merge: true }); } catch (_) {}
      }
      if (app.userId && app.userId !== auth.currentUser?.uid) {
        try {
          await updateDoc(doc(db, "users", app.userId), {
            approved: true,
            companyCode,
            companyName: app.companyName,
            // 👑 신규 운송사를 처음 가입한 사람 = 그 회사의 마스터(이후 직원 권한·부서·직책을 정한다)
            ...(app.type !== "기존" ? { isMaster: true, role: "admin" } : {}),
          });
        } catch (_) {}
      }
      setManagingApp(null);
      setCodeNotice({ companyName: app.companyName, companyCode, email: app.email, phone: app.phone, appType: "운송" });
    } catch (err) {
      alert("승인 처리 중 오류가 발생했습니다: " + (err?.message || err));
    } finally {
      setProcessing(false);
    }
  };

  const rejectTransport = async (app, reason) => {
    setProcessing(true);
    try {
      await updateDoc(doc(db, "transportApplications", app.id), {
        status: "rejected",
        rejectionReason: reason || "",
        processedAt: serverTimestamp(),
      });
      setShowRejectModal(false);
      setRejectReason("");
      setManagingApp(null);
    } finally {
      setProcessing(false);
    }
  };

  const approveDriver = async (app) => {
    setProcessing(true);
    try {
      await updateDoc(doc(db, "users", app.uid), {
        approved: true,
        processedAt: serverTimestamp(),
      });
      try { await updateDoc(doc(db, "drivers", app.uid), { approved: true }, { merge: true }); } catch (_) {}
      setManagingApp(null);
    } finally {
      setProcessing(false);
    }
  };

  const rejectDriver = async (app, reason) => {
    setProcessing(true);
    try {
      await updateDoc(doc(db, "users", app.uid), {
        approved: false,
        status: "rejected",
        rejectionReason: reason || "",
        processedAt: serverTimestamp(),
      });
      setShowRejectModal(false);
      setRejectReason("");
      setManagingApp(null);
    } finally {
      setProcessing(false);
    }
  };

  const changeUserStatus = async (app, newStatus) => {
    setProcessing(true);
    try {
      const appCollection = activeTab === "화주" ? "companyApplications" : "transportApplications";
      if (app.userId && app.userId !== auth.currentUser?.uid) {
        await updateDoc(doc(db, "users", app.userId), { userStatus: newStatus });
      }
      await updateDoc(doc(db, appCollection, app.id), { userStatus: newStatus });
      setManagingApp((prev) => (prev ? { ...prev, userStatus: newStatus } : null));
    } finally {
      setProcessing(false);
    }
  };

  const deleteAccount = async (app) => {
    if (!await kpConfirm(`"${app.companyName || app.name}" 계정을 삭제하고 가입 전 상태로 초기화하시겠습니까?\n사용자는 재가입이 가능합니다.`)) return;
    setProcessing(true);
    try {
      const appCollection = activeTab === "화주" ? "companyApplications" : "transportApplications";
      await deleteDoc(doc(db, appCollection, app.id));
      if (app.userId && app.userId !== auth.currentUser?.uid) {
        await deleteDoc(doc(db, "users", app.userId));
      }
      setManagingApp(null);
    } finally {
      setProcessing(false);
    }
  };

  const handleApprove = (app) => {
    if (activeTab === "화주") return approveCompany(app);
    if (activeTab === "운송") return approveTransport(app);
    if (activeTab === "기사") return approveDriver(app);
  };

  const handleReject = (app, reason) => {
    if (activeTab === "화주") return rejectCompany(app, reason);
    if (activeTab === "운송") return rejectTransport(app, reason);
    if (activeTab === "기사") return rejectDriver(app, reason);
  };

  const statsCards = useMemo(() => {
    const data = activeData;
    if (activeTab === "기사") {
      return [
        { label: "전체", en: "TOTAL", value: data.length },
        { label: "대기", en: "PENDING", value: data.filter((a) => a.approved === false && a.status !== "rejected").length, hot: true },
        { label: "승인", en: "APPROVED", value: data.filter((a) => a.approved === true).length },
        { label: "거절", en: "REJECTED", value: data.filter((a) => a.status === "rejected").length },
      ];
    }
    return [
      { label: "전체", en: "TOTAL", value: data.length },
      { label: "검토 대기", en: "PENDING", value: data.filter((a) => a.status === "pending").length, hot: true },
      { label: "승인 완료", en: "APPROVED", value: data.filter((a) => a.status === "approved").length },
      { label: "거절", en: "REJECTED", value: data.filter((a) => a.status === "rejected").length },
    ];
  }, [activeData, activeTab]);

  const driverStatus = (app) => {
    if (app.status === "rejected") return "rejected";
    if (app.approved === true) return "approved";
    return "pending";
  };

  return (
    <div className="min-h-screen bg-[#F3F6FA] p-4 md:p-6">
      {/* 헤더 — 네이비 히어로 + KPI */}
      <div className="rounded-[22px] overflow-hidden mb-4 shadow-[0_10px_26px_rgba(15,26,48,0.12)]" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div className="px-5 md:px-7 pt-5 pb-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0] whitespace-nowrap" style={{ fontFamily: MONO }}>APPLICATIONS · 가입 심사</div>
            <h1 className="text-[22px] font-black text-white whitespace-nowrap"><EditableText id="companyApp.header.title" defaultText="가입신청 관리" /></h1>
            <p className="text-[12.5px] text-white/60 whitespace-nowrap">
              {activeTab === "화주" ? <EditableText id="companyApp.header.subtitle.화주" defaultText="화주 신청 관리" /> : activeTab === "운송" ? <EditableText id="companyApp.header.subtitle.운송" defaultText="운송사 신청 관리" /> : activeTab === "기사" ? <EditableText id="companyApp.header.subtitle.기사" defaultText="기사 신청 관리" /> : "회사 정보 수정 요청"}
              {activeTab === "운송" && " · 요금제 확인·변경"}
            </p>
          </div>
          <button
            onClick={() => { setShowCodeLookup(true); setCodeLookupQuery(""); }}
            className="h-9 px-4 rounded-xl text-[12.5px] font-black bg-white/10 ring-1 ring-white/25 text-white hover:bg-white/15 transition whitespace-nowrap"
          >
            <EditableText id="companyApp.header.회사코드조회" defaultText="회사코드 조회" />
          </button>
        </div>
        {activeTab !== "수정요청" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 border-t border-white/10">
            {statsCards.map(({ label, en, value, hot }) => (
              <button key={label} type="button"
                onClick={() => setStatusFilter(en === "TOTAL" ? "all" : en === "PENDING" ? "pending" : en === "APPROVED" ? "approved" : "rejected")}
                className={`text-left px-5 py-3 transition ${hot && value > 0 ? "bg-[#2D4C82]/60" : "bg-[#0B1428]/40"} hover:bg-white/10`}>
                <div className="text-[9.5px] font-extrabold tracking-[0.22em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{en}</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[24px] font-black text-white tabular-nums" style={{ fontFamily: MONO }}>{value}</span>
                  <span className="text-[12px] text-white/60 whitespace-nowrap"><EditableText id={`companyApp.stat.${label}`} defaultText={label} /></span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 탭 — 세그먼트 */}
      <div className="inline-flex p-1 rounded-2xl bg-white border border-[#E3E8F0] mb-4 gap-1 max-w-full overflow-x-auto">
        {[
          { key: "화주", label: "화주 신청", n: companyApps.filter((a) => a.status === "pending").length },
          { key: "운송", label: "운송 신청", n: transportApps.filter((a) => a.status === "pending").length },
          { key: "기사", label: "기사 신청", n: driverApps.filter((a) => a.approved === false && a.status !== "rejected").length },
          { key: "수정요청", label: "수정 요청", n: pendingEditCount },
        ].map(({ key, label, n }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`h-9 px-4 rounded-xl text-[13px] font-black transition whitespace-nowrap inline-flex items-center gap-1.5 ${
              activeTab === key ? "bg-[#1B2B4B] text-white" : "text-[#5B6B85] hover:bg-[#F3F6FA]"
            }`}
          >
            <EditableText id={`companyApp.tab.${key}`} defaultText={label} />
            {n > 0 && (
              <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-black flex items-center justify-center ${activeTab === key ? "bg-[#8FB0F0] text-[#0B1428]" : "bg-[#1B2B4B] text-white"}`}>{n}</span>
            )}
          </button>
        ))}
      </div>

      {/* 수정 요청 탭 */}
      {activeTab === "수정요청" && (
        <div className="space-y-3">
          {editRequests.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-[13px]">
              수정 요청 내역이 없습니다
            </div>
          ) : (
            editRequests
              .filter(r => statusFilter === "all" ? true : r.status === statusFilter)
              .map(req => (
              <div key={req.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="text-[14px] font-bold text-gray-900">{req.companyName || "-"}</div>
                      <div className="text-[12px] text-gray-400 mt-0.5">
                        {req.requestedByEmail || "-"} &nbsp;|&nbsp; {req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString("ko-KR") : "-"}
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${req.status === "approved" ? "bg-[#1B2B4B] border-[#1B2B4B] text-white" : req.status === "rejected" ? "bg-white border-[#C9D3E3] text-[#7A89A3]" : "bg-[#EEF3FC] border-[#8FB0F0] text-[#2D4C82]"}`}>
                      {req.status === "approved" ? <EditableText id="companyApp.editReq.승인됨" defaultText="승인됨" /> : req.status === "rejected" ? <EditableText id="companyApp.editReq.거절됨" defaultText="거절됨" /> : <EditableText id="companyApp.editReq.검토대기" defaultText="검토 대기" />}
                    </span>
                  </div>
                  {req.status === "pending" && (
                    <button
                      className="px-4 py-2 bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[12px] font-semibold rounded-lg transition"
                      onClick={() => { setReviewingEdit(req); setEditRejectReason(""); setShowEditRejectInput(false); }}>
                      <EditableText id="companyApp.editReq.검토" defaultText="검토" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}

          {/* 수정 요청 검토 모달 */}
          {reviewingEdit && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999999]" onClick={() => setReviewingEdit(null)}>
              <div className="bg-white rounded-2xl w-[560px] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between sticky top-0">
                  <div>
                    <h3 className="text-white font-bold text-[15px]"><EditableText id="companyApp.editReviewModal.title" defaultText="회사 정보 수정 요청 검토" /></h3>
                    <p className="text-white/55 text-[12px] mt-0.5">{reviewingEdit.companyName} — {reviewingEdit.requestedByEmail}</p>
                  </div>
                  <button className="text-white/50 hover:text-white text-lg transition" onClick={() => setReviewingEdit(null)}>✕</button>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ["회사명", "companyName"],
                      ["대표자", "representative"],
                      ["주소", "address"],
                      ["사업자번호", "businessNumber"],
                      ["연락처", "phone"],
                      ["팩스", "fax"],
                      ["이메일", "email"],
                    ].map(([label, key]) => {
                      const orig = (reviewingEdit.originalData || {})[key] || "-";
                      const req = (reviewingEdit.requestedData || {})[key] || "-";
                      const changed = orig !== req;
                      return (
                        <div key={key} className={`rounded-xl p-3 border ${changed ? "border-[#1B2B4B]/30 bg-[#1B2B4B]/5" : "border-gray-100 bg-gray-50"}`}>
                          <div className="text-[11px] font-semibold text-gray-400 mb-1"><EditableText id={`companyApp.editReviewModal.label.${key}`} defaultText={label} /></div>
                          <div className="text-[12px] text-gray-500 line-through">{orig}</div>
                          <div className={`text-[13px] font-bold ${changed ? "text-[#1B2B4B]" : "text-gray-600"}`}>{req}</div>
                        </div>
                      );
                    })}
                  </div>

                  {showEditRejectInput && (
                    <div>
                      <label className="block text-[12px] font-semibold text-gray-500 mb-1.5"><EditableText id="companyApp.editReviewModal.거절사유" defaultText="거절 사유" /></label>
                      <div className="flex gap-2 mb-2 flex-wrap">
                        {["정보 불일치", "서류 미첨부", "사업자번호 오류", "직접 입력"].map(r => (
                          <button key={r} className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition ${editRejectReason === r ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
                            onClick={() => setEditRejectReason(r === "직접 입력" ? "" : r)}>
                            <EditableText id={`companyApp.rejectReason.${r}`} defaultText={r} />
                          </button>
                        ))}
                      </div>
                      <textarea
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:border-[#1B2B4B] resize-none"
                        rows={2}
                        placeholder="거절 사유 입력"
                        value={editRejectReason}
                        onChange={e => setEditRejectReason(e.target.value)}
                      />
                    </div>
                  )}
                </div>
                <div className="px-6 pb-5 flex gap-3 border-t border-gray-100 pt-4">
                  {!showEditRejectInput ? (
                    <>
                      <button
                        className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"
                        onClick={() => setShowEditRejectInput(true)}>
                        <EditableText id="companyApp.editReviewModal.거절" defaultText="거절" />
                      </button>
                      <button
                        className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition disabled:opacity-50"
                        disabled={processing}
                        onClick={() => approveEditRequest(reviewingEdit)}>
                        {processing ? <EditableText id="companyApp.처리중" defaultText="처리 중..." /> : <EditableText id="companyApp.editReviewModal.승인" defaultText="승인" />}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"
                        onClick={() => setShowEditRejectInput(false)}>
                        <EditableText id="companyApp.editReviewModal.취소" defaultText="취소" />
                      </button>
                      <button
                        className="flex-1 py-2.5 rounded-xl bg-[#0B1428] hover:bg-[#1B2B4B] text-white text-[13px] font-bold transition disabled:opacity-50"
                        disabled={processing || !editRejectReason.trim()}
                        onClick={() => rejectEditRequest(reviewingEdit, editRejectReason)}>
                        {processing ? <EditableText id="companyApp.처리중" defaultText="처리 중..." /> : <EditableText id="companyApp.editReviewModal.거절확정" defaultText="거절 확정" />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 기존 탭 필터 + 테이블 */}
      <div style={{ display: activeTab === "수정요청" ? "none" : "block" }}>
      <div className="bg-white rounded-2xl border border-[#E3E8F0] px-4 py-3 mb-3 flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {[["all", "전체"], ["pending", "대기"], ["approved", "승인"], ["rejected", "거절"]].map(([v, l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`h-8 px-3.5 rounded-lg text-[12px] font-black border transition whitespace-nowrap ${statusFilter === v ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#5B6B85] border-[#DCE3EE] hover:bg-[#F3F6FA]"}`}>
              {l}
            </button>
          ))}
        </div>
        {activeTab !== "기사" && (
          <>
            <div className="w-px h-5 bg-gray-200" />
            <div className="flex gap-1.5">
              {[["all", "전체 유형"], ["신규", "신규"], ["기존", "기존"]].map(([v, l]) => (
                <button key={v} onClick={() => setTypeFilter(v)}
                  className={`h-8 px-3.5 rounded-lg text-[12px] font-black border transition whitespace-nowrap ${typeFilter === v ? "bg-[#2D4C82] text-white border-[#2D4C82]" : "bg-white text-[#5B6B85] border-[#DCE3EE] hover:bg-[#F3F6FA]"}`}>
                  {l}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="회사명·이름·연락처 검색"
            className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] focus:outline-none focus:border-[#2D4C82] w-48 bg-[#F7F9FC]"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-gray-400 hover:text-gray-600 text-[12px]">✕</button>
          )}
          <span className="text-[13px] text-[#1B2B4B] font-black tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{filtered.length}건</span>
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-2xl border border-[#E3E8F0] overflow-x-auto">
        {activeTab !== "기사" ? (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#0B1428]">
                {["신청일시", "유형", "회사명", "사업자번호", "이름", "연락처", "직책", activeTab === "운송" ? "요금제" : "약관동의", "상태", "관리"].map((h) => (
                  <th key={h} className="px-3 py-3 text-center text-[11.5px] font-black text-[#C9D6EE] whitespace-nowrap tracking-wide">
                    <EditableText id={`companyApp.table1.header.${h}`} defaultText={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF1F6]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-[13px] text-gray-400">신청 내역이 없습니다</td>
                </tr>
              ) : (
                filtered.map((app, idx) => (
                  <tr key={app.id}
                    onClick={() => setManagingApp(app)}
                    className={`cursor-pointer hover:bg-[#EEF3FC] transition ${managingApp?.id === app.id ? "bg-[#EEF3FC]" : idx % 2 === 0 ? "bg-white" : "bg-[#FAFBFD]"}`}>
                    <td className="px-3 py-3 text-center text-[12px] text-gray-500 whitespace-nowrap">{fmtDate(app.createdAt)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border whitespace-nowrap ${app.type === "신규" ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#5B6B85] border-[#DCE3EE]"}`}>
                        {app.type}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center font-black text-[#0F1A30] whitespace-nowrap">{app.companyName}</td>
                    <td className="px-3 py-3 text-center text-gray-500 text-[12px]">{app.businessNumber || "-"}</td>
                    <td className="px-3 py-3 text-center text-gray-800">{app.name}</td>
                    <td className="px-3 py-3 text-center text-gray-500 text-[12px]">{app.phone ? formatPhone(app.phone) : app.phone}</td>
                    <td className="px-3 py-3 text-center text-gray-500 text-[12px]">{app.position || "-"}</td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {activeTab === "운송" ? (() => {
                        const cur = plans[(app.companyName || "").trim()]?.planId;
                        return app.type === "기존" ? <span className="text-[11.5px] text-[#9AA9C3]">회사 요금제</span>
                          : cur ? <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-[#EEF3FC] text-[#1B2B4B] border border-[#8FB0F0]">{planName(cur)}</span>
                          : <span className="text-[11.5px] text-[#7A89A3]">신청 {planName(app.requestedPlan || "standard")}</span>;
                      })() : (
                        <span className={`text-[11px] font-bold ${app.termsAgreed && app.privacyAgreed ? "text-[#1B2B4B]" : "text-[#9AA9C3] line-through"}`}>
                          {app.termsAgreed && app.privacyAgreed ? "동의" : "미동의"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <StatusBadge status={app.status} />
                        {/* 화주 탭: 운송사 1차 승인 표시 */}
                        {activeTab === "화주" && app.transportApprovalStatus === "approved" && app.status === "pending" && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[#1B2B4B]/10 text-[#1B2B4B] border border-[#1B2B4B]/20">
                            <span className="w-1 h-1 rounded-full bg-[#1B2B4B]" />
                            1차 승인
                          </span>
                        )}
                        {app.status === "approved" && app.companyCode && (
                          <div className="text-[10px] text-gray-400 font-mono">{app.companyCode}</div>
                        )}
                        {app.status === "approved" && app.userStatus === "suspended" && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                            <span className="w-1 h-1 rounded-full bg-[#2D4C82]" />정지
                          </span>
                        )}
                        {app.status === "approved" && app.userStatus === "banned" && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                            <span className="w-1 h-1 rounded-full bg-[#0B1428]" />영구정지
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => setManagingApp(app)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-[#1B2B4B] text-white hover:bg-[#2D4C82] transition whitespace-nowrap"
                      >
                        관리
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          /* 기사 탭 */
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#0B1428]">
                {["신청일시", "이름", "차량번호", "차종", "연락처", "상태", "관리"].map((h) => (
                  <th key={h} className="px-3 py-3 text-center text-[11.5px] font-black text-[#C9D6EE] whitespace-nowrap tracking-wide">
                    <EditableText id={`companyApp.table2.header.${h}`} defaultText={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF1F6]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-[13px] text-gray-400">신청 내역이 없습니다</td>
                </tr>
              ) : (
                filtered.map((app, idx) => {
                  const st = driverStatus(app);
                  return (
                    <tr key={app.id}
                      onClick={() => setManagingApp(app)}
                    className={`cursor-pointer hover:bg-[#EEF3FC] transition ${managingApp?.id === app.id ? "bg-[#EEF3FC]" : idx % 2 === 0 ? "bg-white" : "bg-[#FAFBFD]"}`}>
                      <td className="px-3 py-3 text-center text-[12px] text-gray-500 whitespace-nowrap">{fmtDate(app.createdAt)}</td>
                      <td className="px-3 py-3 text-center font-black text-[#0F1A30] whitespace-nowrap">{app.name || app.displayName || "-"}</td>
                      <td className="px-3 py-3 text-center text-gray-500 text-[12px]">{app.vehicleNumber || app.licensePlate || "-"}</td>
                      <td className="px-3 py-3 text-center text-gray-500 text-[12px]">{app.vehicleType || "-"}</td>
                      <td className="px-3 py-3 text-center text-gray-500 text-[12px]">{(app.phone || app.phoneNumber) ? formatPhone(app.phone || app.phoneNumber) : "-"}</td>
                      <td className="px-3 py-3 text-center"><StatusBadge status={st} /></td>
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => setManagingApp(app)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-[#1B2B4B] text-white hover:bg-[#2D4C82] transition whitespace-nowrap"
                        >
                          관리
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ====== 통합 관리 팝업 ====== */}
      {managingApp && !showRejectModal && (
        <div className="fixed inset-0 bg-[#0B1428]/45 flex justify-end z-50"
          onClick={() => setManagingApp(null)}>
          <div className="bg-[#F3F6FA] shadow-2xl w-full max-w-[760px] h-full overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 flex items-start justify-between gap-3 sticky top-0 z-10" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)" }}>
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold tracking-[0.26em] text-[#8FB0F0] whitespace-nowrap" style={{ fontFamily: MONO }}>
                  {activeTab === "기사" ? "DRIVER" : activeTab === "운송" ? "CARRIER" : "SHIPPER"} · {managingApp.type === "기존" ? "기존 회사 추가" : activeTab === "기사" ? "기사 신청" : "신규 가입"}
                </div>
                <div className="text-white text-[20px] font-black whitespace-nowrap overflow-hidden text-ellipsis">
                  {activeTab === "기사" ? (managingApp.name || managingApp.displayName || "-") : (managingApp.companyName || "-")}
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <StatusBadge status={activeTab === "기사" ? driverStatus(managingApp) : managingApp.status} />
                  {activeTab !== "기사" && <span className="text-[12px] text-white/70 whitespace-nowrap">{managingApp.name}{managingApp.position ? ` · ${managingApp.position}` : ""}</span>}
                  {activeTab === "운송" && plans[(managingApp.companyName || "").trim()]?.planId && <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-[#8FB0F0] text-[#0B1428] whitespace-nowrap">{planName(plans[(managingApp.companyName || "").trim()].planId)}</span>}
                </div>
              </div>
              <button onClick={() => setManagingApp(null)} className="w-9 h-9 shrink-0 rounded-xl bg-white/10 ring-1 ring-white/20 text-white/80 hover:text-white">✕</button>
            </div>

            <div className="p-5 space-y-4 flex-1">
              {/* 💳 요금제 (운송 탭) — 신청 요금제·현재 요금제 확인, 최고관리자 변경 */}
              {activeTab === "운송" && (() => {
                const co = (managingApp.companyName || "").trim();
                const curPlan = plans[co];
                const approved = managingApp.status === "approved";
                const sel = planDraft || curPlan?.planId || "";
                return (
                  <Sec title="요금제" en="PLAN" right={curPlan?.since && <span className="text-[11.5px] text-[#7A89A3] whitespace-nowrap">{curPlan.since}부터</span>}>
                    <div className="px-4 py-3 grid grid-cols-3 gap-2">
                      {[["신청한 요금제", managingApp.type === "기존" ? "-" : planName(managingApp.requestedPlan || "standard")], ["현재 요금제", curPlan?.planId ? planName(curPlan.planId) : "미지정"], ["변경 이력", `${(curPlan?.history || []).length}회`]].map(([k, v]) => (
                        <div key={k} className="rounded-xl bg-[#F7F9FC] border border-[#EEF1F6] px-3 py-2 min-w-0">
                          <div className="text-[11px] text-[#7A89A3] whitespace-nowrap">{k}</div>
                          <div className="text-[15px] font-black text-[#0F1A30] whitespace-nowrap">{v}</div>
                        </div>
                      ))}
                    </div>
                    {approved && co ? (
                      <div className="px-4 pb-4">
                        <div className="text-[12px] font-bold text-[#5B6B85] mb-1.5">요금제 변경 (최고관리자) · 저장하면 그 회사 메뉴가 바로 바뀝니다</div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {PLANS.map(([id, nm]) => (
                            <button key={id} type="button" onClick={() => setPlanDraft(id)}
                              className={`h-10 rounded-xl text-[13px] font-black whitespace-nowrap transition ${sel === id ? "bg-[#1B2B4B] text-white" : "bg-white border border-[#DCE3EE] text-[#1B2B4B] hover:bg-[#F3F6FA]"}`}>
                              {nm}{curPlan?.planId === id ? " ✓" : ""}
                            </button>
                          ))}
                        </div>
                        <button type="button" disabled={planSaving || !planDraft || planDraft === curPlan?.planId} onClick={() => savePlan(co, planDraft)}
                          className="mt-2 w-full h-10 rounded-xl bg-[#2D4C82] text-white text-[13px] font-black disabled:opacity-40">{planSaving ? "저장 중…" : "요금제 변경 저장"}</button>
                        {(curPlan?.history || []).length > 0 && (
                          <div className="mt-2 space-y-0.5">
                            {[...curPlan.history].reverse().slice(0, 3).map((h, i) => (
                              <div key={i} className="text-[11.5px] text-[#7A89A3] whitespace-nowrap overflow-hidden text-ellipsis">{String(h.at || "").slice(0, 10)} · {planName(h.from) || "미지정"} → {planName(h.to)}{h.by ? ` · ${h.by}` : ""}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="px-4 pb-3 text-[12px] text-[#7A89A3]">{managingApp.type === "기존" ? "기존 회사 추가 가입은 그 회사 요금제를 따릅니다." : "승인할 때 아래에서 요금제를 고르면 바로 적용됩니다."}</div>
                    )}
                  </Sec>
                );
              })()}
              {/* 기본 정보 */}
              <div className="rounded-2xl border border-[#E3E8F0] bg-white overflow-hidden">
                <div className="bg-[#F7F9FC] px-4 py-2.5 text-[13px] font-black text-[#0F1A30] border-b border-[#EEF1F6]">
                  {activeTab === "기사" ? <EditableText id="companyApp.managingApp.section.기사정보" defaultText="기사 정보" /> : <EditableText id="companyApp.managingApp.section.신청정보" defaultText="신청 정보" />}
                </div>
                {activeTab !== "기사" ? (
                  <div className="grid md:grid-cols-2 md:[&>*:nth-child(odd)]:border-r md:[&>*]:border-[#EEF1F6]">
                    <InfoRow label="신청 유형" value={managingApp.type === "신규" ? "신규 가입신청" : "기존 회사 추가 가입"} />
                    <InfoRow label="신청 일시" value={fmtDate(managingApp.createdAt)} />
                    <InfoRow label="회사명" value={managingApp.companyName} />
                    <InfoRow label="사업자번호" value={managingApp.businessNumber} />
                    <InfoRow label="이메일" value={managingApp.email} />
                    <InfoRow label="이름" value={managingApp.name} />
                    <InfoRow label="연락처" value={managingApp.phone ? formatPhone(managingApp.phone) : managingApp.phone} />
                    <InfoRow label="직책" value={managingApp.position} />
                    <InfoRow label="주소" value={managingApp.address} />
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 md:[&>*:nth-child(odd)]:border-r md:[&>*]:border-[#EEF1F6]">
                    <InfoRow label="신청 일시" value={fmtDate(managingApp.createdAt)} />
                    <InfoRow label="이름" value={managingApp.name || managingApp.displayName} />
                    <InfoRow label="이메일" value={managingApp.email} />
                    <InfoRow label="연락처" value={(managingApp.phone || managingApp.phoneNumber) ? formatPhone(managingApp.phone || managingApp.phoneNumber) : ""} />
                    <InfoRow label="차량번호" value={managingApp.vehicleNumber || managingApp.licensePlate} />
                    <InfoRow label="차종" value={managingApp.vehicleType} />
                    <InfoRow label="주소" value={managingApp.address} />
                  </div>
                )}
              </div>

              {/* 연결 운송사 (화주 탭만) */}
              {activeTab === "화주" && managingApp.linkedTransportCompany && (
                <div className="rounded-2xl border border-[#E3E8F0] bg-white overflow-hidden">
                  <div className="bg-[#F7F9FC] px-4 py-2.5 text-[13px] font-black text-[#0F1A30] border-b border-[#EEF1F6]">
                    <EditableText id="companyApp.managingApp.section.연결운송사" defaultText="연결 운송사" />
                  </div>
                  <InfoRow label="운송사명" value={managingApp.linkedTransportCompany.companyName} />
                  <InfoRow label="운송사 코드" value={managingApp.linkedTransportCompany.companyCode} />
                  <InfoRow label="대표자" value={managingApp.linkedTransportCompany.representative} />
                  {managingApp.transportApprovalStatus === "approved" && (
                    <>
                      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-50">
                        <span className="text-[12px] text-gray-400 w-28 shrink-0"><EditableText id="companyApp.managingApp.운송사승인" defaultText="운송사 승인" /></span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border bg-[#1B2B4B] text-white border-[#1B2B4B]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#8FB0F0]" />
                          <EditableText id="companyApp.managingApp.1차승인완료" defaultText="1차 승인 완료" />
                        </span>
                      </div>
                      <InfoRow label="1차 승인자" value={managingApp.transportApprovedBy} />
                    </>
                  )}
                  {managingApp.transportApprovalStatus === "rejected" && (
                    <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-50">
                      <span className="text-[12px] text-gray-400 w-28 shrink-0"><EditableText id="companyApp.managingApp.운송사결과" defaultText="운송사 결과" /></span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border bg-white text-[#7A89A3] border-[#C9D3E3]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C9D3E3]" />
                        <EditableText id="companyApp.managingApp.운송사거절" defaultText="운송사 거절" />
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* 약관 동의 (화주/운송) */}
              {activeTab !== "기사" && (
                <div className="rounded-2xl border border-[#E3E8F0] bg-white overflow-hidden">
                  <div className="bg-[#F7F9FC] px-4 py-2.5 text-[13px] font-black text-[#0F1A30] border-b border-[#EEF1F6]">
                    <EditableText id="companyApp.managingApp.section.약관동의" defaultText="약관 동의" />
                  </div>
                  {[
                    ["서비스 이용약관", managingApp.termsAgreed],
                    ["개인정보처리방침", managingApp.privacyAgreed],
                  ].map(([label, agreed]) => (
                    <div key={label} className="flex items-center justify-between px-4 py-3 border-t border-gray-50 first:border-t-0">
                      <span className="text-[13px] text-gray-600"><EditableText id={`companyApp.managingApp.terms.${label}`} defaultText={label} /></span>
                      <span className={`text-[12px] font-bold ${agreed ? "text-[#1B2B4B]" : "text-[#9AA9C3] line-through"}`}>
                        {agreed ? <EditableText id="companyApp.managingApp.동의" defaultText="동의" /> : <EditableText id="companyApp.managingApp.미동의" defaultText="미동의" />}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* 처리 상태 */}
              <div className="rounded-2xl border border-[#E3E8F0] bg-white overflow-hidden">
                <div className="bg-[#F7F9FC] px-4 py-2.5 text-[13px] font-black text-[#0F1A30] border-b border-[#EEF1F6]"><EditableText id="companyApp.managingApp.section.처리상태" defaultText="처리 상태" /></div>
                <div className="px-4 py-3 flex items-center justify-between">
                  {(() => {
                    const st = activeTab === "기사" ? driverStatus(managingApp) : managingApp.status;
                    return (
                      <>
                        <StatusBadge status={st} />
                        <div className="flex items-center gap-2">
                          {activeTab !== "기사" && managingApp.status === "approved" && managingApp.companyCode && (
                            <span className="text-[13px] font-mono font-bold text-[#1B2B4B]">{managingApp.companyCode}</span>
                          )}
                          {managingApp.status === "approved" && managingApp.userStatus === "suspended" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#2D4C82]" />사용정지
                            </span>
                          )}
                          {managingApp.status === "approved" && managingApp.userStatus === "banned" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#0B1428]" />영구정지
                            </span>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
                {(managingApp.status === "rejected" || driverStatus(managingApp) === "rejected") && managingApp.rejectionReason && (
                  <div className="px-4 py-3 border-t border-gray-50">
                    <span className="text-[12px] text-gray-400 block mb-1"><EditableText id="companyApp.managingApp.거절사유" defaultText="거절 사유" /></span>
                    <span className="text-[13px] text-gray-700">{managingApp.rejectionReason}</span>
                  </div>
                )}
              </div>

              {/* 운송목록 조회기간 제한 (화주 탭 + 승인된 회사) */}
              {activeTab === "화주" && managingApp.status === "approved" && (
                <div className="rounded-2xl border border-[#E3E8F0] bg-white overflow-hidden">
                  <div className="bg-[#F7F9FC] px-4 py-2.5 text-[13px] font-black text-[#0F1A30] border-b border-[#EEF1F6]">
                    <EditableText id="companyApp.managingApp.section.조회기간제한" defaultText="운송목록 조회기간 제한" />
                  </div>
                  <div className="px-4 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] text-gray-600"><EditableText id="companyApp.managingApp.현재상태" defaultText="현재 상태" /></span>
                      {managingApp.viewLimitUnlockedUntil && managingApp.viewLimitUnlockedUntil >= todayStr() ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#1B2B4B] text-white border border-[#1B2B4B]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#8FB0F0]" />
                          {managingApp.viewLimitUnlockedUntil}<EditableText id="companyApp.managingApp.까지확장허용" defaultText="까지 확장 허용" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          <EditableText id="companyApp.managingApp.기본6개월제한" defaultText="기본 6개월 제한 적용 중" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="date" value={viewLimitDraft} onChange={(e) => setViewLimitDraft(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px]" />
                      <button onClick={() => saveViewLimitUnlock(viewLimitDraft)} disabled={processing || !viewLimitDraft}
                        className="px-3 py-2 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-semibold hover:bg-[#243a60] transition disabled:opacity-50 whitespace-nowrap">
                        <EditableText id="companyApp.managingApp.확장허용" defaultText="확장 허용" />
                      </button>
                    </div>
                    {managingApp.viewLimitUnlockedUntil && (
                      <button onClick={() => saveViewLimitUnlock(null)} disabled={processing}
                        className="w-full py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">
                        <EditableText id="companyApp.managingApp.지금다시잠그기" defaultText="지금 다시 잠그기" />
                      </button>
                    )}
                    <p className="text-[11px] text-gray-400">해제 만료일까지는 6개월 이전 데이터도 화주사 화면(PC/모바일)에서 조회할 수 있습니다.</p>
                  </div>
                </div>
              )}

              {/* 계정 권한 (운송 탭 — 최고관리자) */}
              {activeTab === "운송" && managingApp.userId && tUser && (
                <div className="rounded-2xl border border-[#E3E8F0] bg-white overflow-hidden">
                  <div className="bg-[#F7F9FC] px-4 py-2.5 text-[13px] font-black text-[#0F1A30] border-b border-[#EEF1F6]">계정 권한</div>
                  <div className="px-4 py-4 space-y-3">
                    <div className="text-[12.5px] text-gray-500">지금: <b className="text-[#1B2B4B]">{({ admin: "관리자", hrManager: "인사관리자", user: "실무자", test: "정산·회계", viewer: "조회전용" })[tUser.role] || tUser.role || "-"}</b>{tUser.isMaster ? " · 마스터" : ""}</div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[["admin", "관리자"], ["hrManager", "인사관리자"], ["user", "실무자"], ["test", "정산·회계"], ["viewer", "조회전용"]].map(([k, l]) => (
                        <button key={k} type="button" onClick={() => setTRole(k)} className={`h-9 rounded-lg text-[12px] font-bold whitespace-nowrap ${tRole === k ? "bg-[#1B2B4B] text-white" : "border border-gray-200 text-[#1B2B4B]"}`}>{l}</button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-[13px] font-semibold text-[#1B2B4B]">
                      <input type="checkbox" checked={tMaster} onChange={(e) => { setTMaster(e.target.checked); if (e.target.checked) setTRole("admin"); }} />
                      마스터 계정 (그 회사 직원의 승인·권한·부서·직책을 정함)
                    </label>
                    <button type="button" disabled={tSaving} onClick={saveTransportRole}
                      className="w-full py-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition disabled:opacity-50">{tSaving ? "저장 중…" : "계정 권한 저장"}</button>
                  </div>
                </div>
              )}

              {/* 권한 관리 (화주 탭 + userId 있는 경우) */}
              {activeTab === "화주" && managingApp.userId && appUserPerms !== null && (
                <div className="rounded-2xl border border-[#E3E8F0] bg-white overflow-hidden">
                  <div className="bg-[#F7F9FC] px-4 py-2.5 text-[13px] font-black text-[#0F1A30] border-b border-[#EEF1F6]"><EditableText id="companyApp.managingApp.section.권한관리" defaultText="권한 관리" /></div>
                  <div className="px-4 py-4">
                    <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { key: "master", label: "마스터", desc: "전체 권한" },
                      { key: "subMaster", label: "부마스터", desc: "권한 부여 제외" },
                      { key: "settlement", label: "경리", desc: "정산 탭" },
                      { key: "transport", label: "운송", desc: "운송 탭" },
                    ].map(({ key, label, desc }) => (
                      <label key={key} className={`flex flex-col items-center gap-1.5 cursor-pointer rounded-xl border px-2 py-2.5 transition ${!!appUserPerms[key] ? "border-[#1B2B4B] bg-[#1B2B4B]/5" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                        <input
                          type="checkbox"
                          checked={!!appUserPerms[key]}
                          onChange={(e) => setAppUserPerms(prev => ({ ...prev, [key]: e.target.checked }))}
                          className="w-4 h-4 rounded"
                        />
                        <div className="text-center">
                          <div className="text-[12px] font-semibold text-gray-800"><EditableText id={`companyApp.managingApp.perm.${key}.label`} defaultText={label} /></div>
                          <div className="text-[10px] text-gray-400 leading-tight"><EditableText id={`companyApp.managingApp.perm.${key}.desc`} defaultText={desc} /></div>
                        </div>
                      </label>
                    ))}</div>
                    <button
                      onClick={async () => {
                        await updateDoc(doc(db, "users", managingApp.userId), { permissions: appUserPerms });
                        alert("권한이 저장되었습니다.");
                      }}
                      className="w-full py-2 mt-1 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition"
                    >
                      <EditableText id="companyApp.managingApp.권한저장" defaultText="권한 저장" />
                    </button>
                  </div>
                </div>
              )}

              {/* 액션 버튼 — 패널 아래 고정 */}
              <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-4 bg-white border-t border-[#E3E8F0] space-y-2 shadow-[0_-8px_20px_rgba(15,26,48,0.06)]">
                {(() => {
                  const st = activeTab === "기사" ? driverStatus(managingApp) : managingApp.status;
                  if (st === "pending") {
                    return (
                      <>
                        {activeTab === "운송" && managingApp.type !== "기존" && (
                          <div className="rounded-xl border border-[#DCE3EE] p-3">
                            <div className="text-[12px] font-bold text-gray-500 mb-1.5">요금제 (승인하면 이 요금제의 메뉴로 열립니다)</div>
                            <div className="grid grid-cols-4 gap-1.5">
                              {[["lite", "라이트"], ["basic", "베이직"], ["standard", "스탠다드"], ["pro", "프로"]].map(([id, nm]) => {
                                const cur = approvePlan || managingApp.requestedPlan || "standard";
                                return <button key={id} type="button" onClick={() => setApprovePlan(id)} className={`h-9 rounded-lg text-[12.5px] font-black whitespace-nowrap ${cur === id ? "bg-[#1B2B4B] text-white" : "border border-gray-200 text-[#1B2B4B]"}`}>{nm}</button>;
                              })}
                            </div>
                            {managingApp.requestedPlan && <div className="text-[11.5px] text-gray-500 mt-1.5">신청한 요금제: {({ lite: "라이트", basic: "베이직", standard: "스탠다드", pro: "프로" })[managingApp.requestedPlan] || managingApp.requestedPlan} · 처음 가입자는 이 회사의 마스터 계정이 됩니다</div>}
                          </div>
                        )}
                        <button onClick={() => handleApprove(managingApp)} disabled={processing}
                          className="w-full py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition disabled:opacity-50">
                          <EditableText id="companyApp.managingApp.승인" defaultText="승인" />
                        </button>
                        <button onClick={() => setShowRejectModal(true)}
                          className="w-full py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 transition">
                          <EditableText id="companyApp.managingApp.거절" defaultText="거절" />
                        </button>
                      </>
                    );
                  }
                  if (st === "approved" && activeTab !== "기사") {
                    return (
                      <div className="grid grid-cols-3 gap-2 [&>button]:!w-full">
                        {managingApp.userStatus !== "suspended" && managingApp.userStatus !== "banned" ? (
                          <>
                            <button onClick={() => changeUserStatus(managingApp, "suspended")} disabled={processing}
                              className="w-full py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50">
                              <EditableText id="companyApp.managingApp.사용정지" defaultText="사용 정지" />
                            </button>
                            <button onClick={() => changeUserStatus(managingApp, "banned")} disabled={processing}
                              className="w-full py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50">
                              <EditableText id="companyApp.managingApp.영구정지" defaultText="영구 정지" />
                            </button>
                          </>
                        ) : (
                          <button onClick={() => changeUserStatus(managingApp, "active")} disabled={processing}
                            className="w-full py-2.5 rounded-xl border border-[#1B2B4B]/40 text-[13px] font-semibold text-[#1B2B4B] hover:bg-[#1B2B4B]/10 transition disabled:opacity-50">
                            <EditableText id="companyApp.managingApp.정지해제" defaultText="정지 해제" />
                          </button>
                        )}
                        <button onClick={() => deleteAccount(managingApp)} disabled={processing}
                          className="w-full py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-500 hover:bg-gray-50 transition disabled:opacity-50">
                          <EditableText id="companyApp.managingApp.삭제초기화" defaultText="삭제 (가입 전 초기화)" />
                        </button>
                      </div>
                    );
                  }
                  if (st === "rejected") {
                    return (
                      <button onClick={() => deleteAccount(managingApp)} disabled={processing}
                        className="w-full py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-500 hover:bg-gray-50 transition disabled:opacity-50">
                        <EditableText id="companyApp.managingApp.삭제초기화" defaultText="삭제 (가입 전 초기화)" />
                      </button>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 거절 사유 모달 */}
      {showRejectModal && managingApp && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] overflow-hidden">
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-[15px]"><EditableText id="companyApp.rejectModal.title" defaultText="거절 사유 입력" /></h3>
              <button onClick={() => { setShowRejectModal(false); setRejectReason(""); }} className="text-white/60 hover:text-white text-lg">✕</button>
            </div>
            <div className="p-6">
              <p className="text-[13px] text-gray-500 mb-4">
                {activeTab === "기사"
                  ? (managingApp.name || managingApp.displayName || "-")
                  : `${managingApp.companyName} — ${managingApp.name}`}
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="거절 사유를 입력해주세요 (선택사항)"
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[13px] focus:outline-none focus:border-[#1B2B4B] resize-none mb-4"
              />
              <div className="flex gap-3">
                <button onClick={() => { setShowRejectModal(false); setRejectReason(""); }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition">
                  <EditableText id="companyApp.rejectModal.취소" defaultText="취소" />
                </button>
                <button onClick={() => handleReject(managingApp, rejectReason)} disabled={processing}
                  className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition disabled:opacity-50">
                  <EditableText id="companyApp.rejectModal.거절확인" defaultText="거절 확인" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 승인 코드 안내 모달 */}
      {codeNotice && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70]"
          onClick={() => setCodeNotice(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[460px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-[15px]"><EditableText id="companyApp.codeNotice.title" defaultText="승인 완료 — 코드 발급" /></h3>
                <p className="text-white/60 text-[12px] mt-0.5">{codeNotice.companyName} ({codeNotice.appType})</p>
              </div>
              <button onClick={() => setCodeNotice(null)} className="text-white/60 hover:text-white text-lg">✕</button>
            </div>
            <div className="p-6">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-center mb-5">
                <p className="text-[12px] text-gray-500 mb-2"><EditableText id="companyApp.codeNotice.발급된회사코드" defaultText="발급된 회사코드" /></p>
                <p className="text-[28px] font-extrabold text-[#1B2B4B] tracking-widest font-mono">{codeNotice.companyCode}</p>
                <button
                  onClick={() => navigator.clipboard.writeText(codeNotice.companyCode)}
                  className="mt-3 px-4 py-1.5 rounded-lg text-[12px] font-semibold bg-[#1B2B4B] text-white hover:bg-[#243d6a] transition"
                >
                  <EditableText id="companyApp.codeNotice.클립보드복사" defaultText="클립보드 복사" />
                </button>
              </div>
              <div className="border border-gray-100 rounded-xl overflow-hidden mb-5">
                <div className="bg-gray-50 px-4 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100"><EditableText id="companyApp.codeNotice.신청자연락처" defaultText="신청자 연락처" /></div>
                {[["이메일", codeNotice.email || "-"], ["핸드폰", codeNotice.phone ? formatPhone(codeNotice.phone) : "-"]].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3 border-t border-gray-50 first:border-t-0">
                    <span className="text-[12px] text-gray-400"><EditableText id={`companyApp.codeNotice.label.${label}`} defaultText={label} /></span>
                    <span className="text-[13px] font-semibold text-gray-800">{value}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2.5 mb-5">
                {codeNotice.email && (
                  <a
                    href={`mailto:${codeNotice.email}?subject=${encodeURIComponent("[S-Flow] 가입 승인 및 회사코드 안내")}&body=${encodeURIComponent(`안녕하세요, ${codeNotice.companyName} 담당자님.\n\nS-Flow 물류 관리 시스템 가입이 승인되었습니다.\n\n발급된 회사코드: ${codeNotice.companyCode}\n\n로그인 시 회사코드를 입력해주세요.\n\n감사합니다.\nS-Flow 관리팀`)}`}
                    className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition"
                  >
                    <span className="text-[13px] font-semibold text-gray-700"><EditableText id="companyApp.codeNotice.이메일로코드발송" defaultText="이메일로 코드 발송" /></span>
                    <span className="text-[12px] text-gray-500">{codeNotice.email}</span>
                  </a>
                )}
                {codeNotice.phone && (
                  <div className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
                    <span className="text-[13px] font-semibold text-gray-700"><EditableText id="companyApp.codeNotice.핸드폰으로직접전달" defaultText="핸드폰으로 직접 전달" /></span>
                    <span className="text-[12px] font-mono text-gray-600">{formatPhone(codeNotice.phone)}</span>
                  </div>
                )}
              </div>
              <button onClick={() => setCodeNotice(null)}
                className="w-full py-2.5 rounded-xl bg-[#1B2B4B] text-white font-bold text-[14px] hover:bg-[#243d6a] transition">
                <EditableText id="companyApp.codeNotice.확인" defaultText="확인" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 회사코드 조회 모달 */}
      {showCodeLookup && (() => {
        const allApproved = [
          ...companyApps.filter(a => a.status === "approved" && a.companyCode).map(a => ({ ...a, appType: "화주" })),
          ...transportApps.filter(a => a.status === "approved" && a.companyCode).map(a => ({ ...a, appType: "운송" })),
        ];
        const q = codeLookupQuery.trim().toLowerCase();
        const lookupResults = q
          ? allApproved.filter(a => (a.companyName || "").toLowerCase().includes(q))
          : allApproved;
        const grouped = Object.values(
          lookupResults.reduce((acc, a) => {
            const key = a.companyName;
            if (!acc[key]) acc[key] = { companyName: key, code: a.companyCode, types: [] };
            if (!acc[key].types.includes(a.appType)) acc[key].types.push(a.appType);
            return acc;
          }, {})
        ).sort((a, b) => (a.companyName || "").localeCompare(b.companyName || ""));

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80]"
            onClick={() => setShowCodeLookup(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[70vh] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-white font-bold text-[15px]"><EditableText id="companyApp.codeLookup.title" defaultText="회사코드 조회" /></h3>
                  <p className="text-white/60 text-[12px] mt-0.5"><EditableText id="companyApp.codeLookup.subtitle" defaultText="회사명으로 코드를 검색합니다" /></p>
                </div>
                <button onClick={() => setShowCodeLookup(false)} className="text-white/60 hover:text-white text-lg">✕</button>
              </div>
              <div className="px-5 py-3 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-2 border border-gray-200 rounded-xl overflow-hidden bg-white focus-within:border-[#1B2B4B] transition">
                  <svg className="ml-3 w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input
                    ref={imeFocusRef}
                    value={codeLookupQuery}
                    onChange={e => setCodeLookupQuery(e.target.value)}
                    placeholder="회사명 입력"
                    className="flex-1 px-2 py-2.5 text-[13px] outline-none"
                  />
                  {codeLookupQuery && (
                    <button onClick={() => setCodeLookupQuery("")} className="mr-2 text-gray-400 hover:text-gray-600 text-[12px]">✕</button>
                  )}
                </div>
              </div>
              <div className="overflow-y-auto flex-1">
                {grouped.length === 0 ? (
                  <div className="py-12 text-center text-[13px] text-gray-400">
                    {q ? "검색 결과가 없습니다" : "승인된 회사가 없습니다"}
                  </div>
                ) : (
                  <table className="w-full text-[13px]">
                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500"><EditableText id="companyApp.linkTable.header.회사명" defaultText="회사명" /></th>
                        <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500"><EditableText id="companyApp.linkTable.header.유형" defaultText="유형" /></th>
                        <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500"><EditableText id="companyApp.linkTable.header.회사코드" defaultText="회사코드" /></th>
                        <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500"><EditableText id="companyApp.linkTable.header.복사" defaultText="복사" /></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {grouped.map((g) => (
                        <tr key={g.companyName} className="hover:bg-blue-50/20">
                          <td className="px-4 py-3 font-semibold text-gray-800">{g.companyName}</td>
                          <td className="px-4 py-3 text-center">
                            {g.types.map(t => (
                              <span key={t} className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mr-1 bg-[#1B2B4B]/10 text-[#1B2B4B]">{t}</span>
                            ))}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-[13px] font-bold text-[#1B2B4B]">{g.code}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => navigator.clipboard.writeText(g.code)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#1B2B4B] border border-[#1B2B4B]/30 hover:bg-[#1B2B4B]/10 transition"
                            >
                              복사
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="px-5 py-3 border-t border-gray-100 text-[11px] text-gray-400 shrink-0">
                총 {grouped.length}개 회사
              </div>
            </div>
          </div>
        );
      })()}
    </div>
      </div>
  );
}
