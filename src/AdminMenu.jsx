// src/AdminMenu.jsx
import React, { useEffect, useState, useMemo } from "react";
import { auth, db } from "./firebase";
import {
  collection,
  setDoc,
  deleteDoc,
  doc,
  onSnapshot,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";

const generateCompanyCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "SF-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const fmtDate = (ts) => {
  if (!ts?.seconds) return "-";
  return new Date(ts.seconds * 1000).toLocaleString("ko-KR", {
    year: "2-digit", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

const ROLE_LABELS = {
  totalMaster: "최고관리자",
  admin: "관리자",
  user: "실무자",
  driver: "기사",
  shipper: "화주",
  test: "경리/회계",
};

const DotBadge = ({ active, label, activeLabel, inactiveLabel }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-gray-400"}`} />
    {label || (active ? activeLabel : inactiveLabel)}
  </span>
);

export default function AdminMenu({ parentRole = "", parentCompany = "" }) {
  const [adminTab, setAdminTab] = useState("members");
  const [users, setUsers] = useState([]);
  const [allShipperApps, setAllShipperApps] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [manageUser, setManageUser] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  // 연동 운송사 탭 state
  const [managingLinkedApp, setManagingLinkedApp] = useState(null);
  const [rejectLinkedReason, setRejectLinkedReason] = useState("");
  const [showRejectLinked, setShowRejectLinked] = useState(false);
  const [linkedSearch, setLinkedSearch] = useState("");
  const [linkedStatusFilter, setLinkedStatusFilter] = useState("pending");

  const [myRole, setMyRole] = useState("");
  const [myCompany, setMyCompany] = useState("");

  const me = auth.currentUser;
  const isTotalMaster = parentRole === "totalMaster" || me?.email === TOTAL_MASTER_EMAIL || myRole === "totalMaster";
  const ROLES = isTotalMaster
    ? ["totalMaster", "admin", "user", "driver", "shipper", "test"]
    : ["admin", "user", "driver", "shipper", "test"];
  const effectiveCompany = myCompany || parentCompany || localStorage.getItem("userCompany") || "돌캐";

  useEffect(() => {
    if (!me) return;
    const unsub = onSnapshot(doc(db, "users", me.uid), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setMyRole(d.role || "");
        setMyCompany(d.companyName || "");
      }
    });
    return () => unsub();
  }, [me?.uid]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsers(list);
    });
    return () => unsub();
  }, []);

  // 화주 신청 구독 (연동운송사 탭용)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "companyApplications"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setAllShipperApps(list);
    });
    return () => unsub();
  }, []);

  const visibleUsers = useMemo(() => {
    if (isTotalMaster) return users;
    return users.filter(u =>
      u.email !== TOTAL_MASTER_EMAIL &&
      u.role !== "totalMaster" &&
      (u.companyName || "돌캐") === effectiveCompany
    );
  }, [users, isTotalMaster, effectiveCompany]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleUsers.filter((u) => {
      const matchSearch = !q
        ? true
        : [u.email, u.name, u.phone, u.role, u.companyName].join(" ").toLowerCase().includes(q);
      const matchRole = roleFilter === "all" ? true : u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [search, visibleUsers, roleFilter]);

  // 연동운송사 탭 데이터
  const linkedShipperApps = useMemo(() => {
    if (isTotalMaster) {
      // 최고관리자: 1차 승인됐지만 최종 미승인인 것들
      return allShipperApps.filter(a =>
        a.transportApprovalStatus === "approved" && a.status !== "approved"
      );
    } else {
      // 운송사 관리자: 내 회사에 연결된 화주 신청 전체
      return allShipperApps.filter(a =>
        a.linkedTransportCompany?.companyName === effectiveCompany
      );
    }
  }, [allShipperApps, isTotalMaster, effectiveCompany]);

  const filteredLinked = useMemo(() => {
    const q = linkedSearch.trim().toLowerCase();
    let list = linkedShipperApps;
    if (!isTotalMaster) {
      // 운송사 관리자: 상태별 필터
      if (linkedStatusFilter === "pending") {
        list = list.filter(a => !a.transportApprovalStatus || a.transportApprovalStatus === "pending");
      } else if (linkedStatusFilter === "approved") {
        list = list.filter(a => a.transportApprovalStatus === "approved");
      } else if (linkedStatusFilter === "rejected") {
        list = list.filter(a => a.transportApprovalStatus === "rejected");
      }
    }
    if (q) {
      list = list.filter(a =>
        (a.companyName || "").toLowerCase().includes(q) ||
        (a.name || "").toLowerCase().includes(q) ||
        (a.phone || "").includes(q)
      );
    }
    return list;
  }, [linkedShipperApps, linkedSearch, linkedStatusFilter, isTotalMaster]);

  // 관리 기능
  const toggleApprove = async (u) => {
    if (!isTotalMaster && (u.companyName || "돌캐") !== effectiveCompany) return;
    const status = !u.approved;
    const updateData = { approved: status };
    if (u.role === "shipper" && status === true) {
      updateData.isMaster = true;
      if (!u.permissions?.master) {
        updateData.permissions = { master: true, subMaster: false, settlement: false, transport: false };
      }
    }
    await setDoc(doc(db, "users", u.id), updateData, { merge: true });
    await setDoc(doc(db, "drivers", u.id), { active: status, updatedAt: new Date() }, { merge: true });
    if (manageUser?.id === u.id) setManageUser(prev => ({ ...prev, approved: status }));
  };

  const removeUser = async (u) => {
    if (me?.uid === u.id) return alert("본인 계정은 삭제할 수 없습니다.");
    if (!isTotalMaster && (u.companyName || "돌캐") !== effectiveCompany) return;
    if (!window.confirm(`"${u.name || u.email}" 계정을 삭제하시겠습니까?\n가입신청 내역도 함께 삭제됩니다.`)) return;
    await deleteDoc(doc(db, "users", u.id));
    try {
      const tSnap = await getDocs(query(collection(db, "transportApplications"), where("userId", "==", u.id)));
      for (const d of tSnap.docs) await deleteDoc(doc(db, "transportApplications", d.id));
    } catch (_) {}
    try {
      const cSnap = await getDocs(query(collection(db, "companyApplications"), where("userId", "==", u.id)));
      for (const d of cSnap.docs) await deleteDoc(doc(db, "companyApplications", d.id));
    } catch (_) {}
    setManageUser(null);
  };

  const openManage = (u) => {
    setManageUser(u);
    setEditName(u.name || "");
    setEditPhone(u.phone || "");
    setEditRole(u.role || "user");
    setEditCompany(u.companyName || "");
    setEditMode(false);
  };

  const saveEdit = async () => {
    if (!editName.trim()) return alert("이름을 입력하세요.");
    if (editRole === "totalMaster" && !isTotalMaster) return alert("totalMaster 권한은 부여할 수 없습니다.");
    const payload = {
      name: editName.trim(),
      phone: editPhone.trim(),
      role: editRole,
      companyName: editCompany.trim(),
    };
    try {
      await setDoc(doc(db, "users", manageUser.id), payload, { merge: true });
      setManageUser(null);
      setEditMode(false);
    } catch (err) {
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  // 운송사 관리자 1차 승인
  const approveShipper1st = async (app) => {
    const myName = users.find(u => u.id === me?.uid)?.name || me?.email || "관리자";
    await updateDoc(doc(db, "companyApplications", app.id), {
      transportApprovalStatus: "approved",
      transportApprovedAt: serverTimestamp(),
      transportApprovedBy: myName,
    });
    setManagingLinkedApp(prev => prev ? { ...prev, transportApprovalStatus: "approved", transportApprovedBy: myName } : null);
  };

  // 운송사 관리자 1차 거절
  const rejectShipper1st = async (app, reason) => {
    await updateDoc(doc(db, "companyApplications", app.id), {
      transportApprovalStatus: "rejected",
      transportRejectionReason: reason || "",
      transportApprovedAt: serverTimestamp(),
    });
    setShowRejectLinked(false);
    setRejectLinkedReason("");
    setManagingLinkedApp(null);
  };

  // 최고관리자 2차 최종 승인
  const approveShipper2nd = async (app) => {
    let companyCode = app.companyCode;
    if (!companyCode) {
      if (app.type === "기존") {
        const parent = allShipperApps.find(
          a => a.companyName === app.companyName && a.type === "신규" && a.status === "approved" && a.companyCode
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
    if (app.userId) {
      const isFirstMaster = app.type === "신규";
      const updatePayload = {
        approved: true,
        companyCode,
        companyName: app.companyName,
        businessNumber: app.businessNumber || "",
      };
      if (isFirstMaster) {
        updatePayload.permissions = { master: true, subMaster: false, settlement: false, transport: false };
      }
      await updateDoc(doc(db, "users", app.userId), updatePayload);
    }
    setManagingLinkedApp(null);
  };

  // 최고관리자 2차 거절
  const rejectShipper2nd = async (app, reason) => {
    await updateDoc(doc(db, "companyApplications", app.id), {
      status: "rejected",
      rejectionReason: reason || "",
      processedAt: serverTimestamp(),
    });
    setShowRejectLinked(false);
    setRejectLinkedReason("");
    setManagingLinkedApp(null);
  };

  const linkedPendingCount = isTotalMaster
    ? linkedShipperApps.length
    : linkedShipperApps.filter(a => !a.transportApprovalStatus || a.transportApprovalStatus === "pending").length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-[#1B2B4B]">관리자 메뉴</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">사용자 계정 권한 및 승인 관리</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-[#1B2B4B]/10 rounded-xl px-4 py-2 text-center">
            <div className="text-[22px] font-bold text-[#1B2B4B]">{visibleUsers.length}</div>
            <div className="text-[11px] text-gray-500">전체 사용자</div>
          </div>
          <div className="bg-emerald-50 rounded-xl px-4 py-2 text-center">
            <div className="text-[22px] font-bold text-emerald-600">{visibleUsers.filter(u => u.approved).length}</div>
            <div className="text-[11px] text-gray-500">승인 완료</div>
          </div>
          <div className="bg-amber-50 rounded-xl px-4 py-2 text-center">
            <div className="text-[22px] font-bold text-amber-500">{visibleUsers.filter(u => !u.approved).length}</div>
            <div className="text-[11px] text-gray-500">승인 대기</div>
          </div>
          <button
            onClick={() => setShowMobilePreview(v => !v)}
            className={`px-4 py-2.5 rounded-xl text-[13px] font-semibold shadow-sm transition ${showMobilePreview ? "bg-gray-700 text-white" : "bg-[#1B2B4B] text-white hover:bg-[#243a60]"}`}
          >
            모바일 미리보기
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setAdminTab("members")}
          className={`px-5 py-2 rounded-lg text-[13px] font-semibold border transition ${adminTab === "members" ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"}`}
        >
          회원 관리
        </button>
        <button
          onClick={() => setAdminTab("linked")}
          className={`relative px-5 py-2 rounded-lg text-[13px] font-semibold border transition ${adminTab === "linked" ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"}`}
        >
          연동 화주사
          {linkedPendingCount > 0 && (
            <span className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${adminTab === "linked" ? "bg-white text-[#1B2B4B]" : "bg-[#1B2B4B] text-white"}`}>
              {linkedPendingCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">

          {/* ====== 회원 관리 탭 ====== */}
          {adminTab === "members" && (
            <>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 border border-gray-200 rounded-xl overflow-hidden bg-white flex-1 min-w-[200px] max-w-[320px] focus-within:border-[#1B2B4B] transition">
                    <svg className="ml-3 w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="이메일 · 이름 · 회사명 검색"
                      className="flex-1 px-2 py-2 text-[13px] outline-none" />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {["all", ...ROLES].map(r => (
                      <button key={r} onClick={() => setRoleFilter(r)}
                        className={`h-[36px] px-3.5 rounded-full text-[12px] font-semibold border transition ${roleFilter === r ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                        {r === "all" ? "전체" : (ROLE_LABELS[r] || r)}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto text-[13px] text-gray-400 font-medium">{filtered.length}명 표시 중</div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#1B2B4B]">
                      {["이메일", "이름", "연락처", "권한", "회사명", "승인", "관리"].map(h => (
                        <th key={h} className="px-4 py-3 text-center text-[13px] font-semibold text-white whitespace-nowrap border-b border-white/10">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.length === 0 ? (
                      <tr><td colSpan={7} className="py-16 text-center text-[13px] text-gray-400">검색 결과가 없습니다</td></tr>
                    ) : filtered.map((u, idx) => {
                      const isMe = me?.uid === u.id;
                      const canManage = isTotalMaster || (u.companyName || "돌캐") === effectiveCompany;
                      return (
                        <tr key={u.id} className={`transition hover:bg-blue-50/40 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                          <td className="px-4 py-3 text-center">
                            <div className="text-[13px] text-gray-700 font-medium">{u.email}</div>
                            {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-semibold">나</span>}
                            {u.email === TOTAL_MASTER_EMAIL && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold ml-1">총마스터</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-[13px] font-semibold text-gray-800">{u.name || <span className="text-gray-300">-</span>}</td>
                          <td className="px-4 py-3 text-center text-[13px] text-gray-600">{u.phone || <span className="text-gray-300">-</span>}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#1B2B4B]/10 text-[#1B2B4B] border border-[#1B2B4B]/30">
                              {ROLE_LABELS[u.role || "user"] || u.role || "실무자"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-[13px] text-gray-600">
                            {u.companyName || <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <DotBadge active={u.approved} activeLabel="승인" inactiveLabel="대기" />
                          </td>
                          <td className="px-4 py-3 text-center">
                            {canManage ? (
                              <button
                                onClick={() => openManage(u)}
                                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-[#1B2B4B]/40 text-[#1B2B4B] hover:bg-[#1B2B4B]/10 transition"
                              >
                                관리
                              </button>
                            ) : <span className="text-gray-300 text-[12px]">-</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ====== 연동 화주사 탭 ====== */}
          {adminTab === "linked" && (
            <>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {!isTotalMaster && (
                    <div className="flex gap-1.5">
                      {[["pending", "승인 대기"], ["approved", "1차 승인"], ["rejected", "거절"], ["all", "전체"]].map(([v, l]) => (
                        <button key={v} onClick={() => setLinkedStatusFilter(v)}
                          className={`h-8 px-3.5 rounded-full text-[12px] font-semibold border transition ${linkedStatusFilter === v ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 border border-gray-200 rounded-xl overflow-hidden bg-white min-w-[200px] max-w-[280px] focus-within:border-[#1B2B4B] transition">
                    <svg className="ml-3 w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input value={linkedSearch} onChange={e => setLinkedSearch(e.target.value)}
                      placeholder="회사명·이름 검색"
                      className="flex-1 px-2 py-2 text-[13px] outline-none" />
                  </div>
                  <div className="ml-auto text-[13px] text-gray-400">{filteredLinked.length}건</div>
                </div>
              </div>

              {isTotalMaster && filteredLinked.length > 0 && (
                <div className="bg-[#1B2B4B]/5 border border-[#1B2B4B]/20 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1B2B4B] shrink-0" />
                  <span className="text-[13px] font-semibold text-[#1B2B4B]">운송사 1차 승인 완료 — 최종 승인 대기 중인 화주사입니다.</span>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#1B2B4B]">
                      {(isTotalMaster
                        ? ["신청일시", "유형", "화주사명", "이름", "연락처", "연결 운송사", "1차 승인자", "상태", "관리"]
                        : ["신청일시", "유형", "화주사명", "이름", "연락처", "상태", "관리"]
                      ).map(h => (
                        <th key={h} className="px-3 py-3 text-center text-[12px] font-semibold text-white whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredLinked.length === 0 ? (
                      <tr>
                        <td colSpan={isTotalMaster ? 9 : 7} className="py-16 text-center text-[13px] text-gray-400">
                          {isTotalMaster ? "2차 승인 대기 중인 화주사가 없습니다" : "연동된 화주사 신청이 없습니다"}
                        </td>
                      </tr>
                    ) : filteredLinked.map((app, idx) => {
                      const tStatus = app.transportApprovalStatus || "pending";
                      return (
                        <tr key={app.id} className={`hover:bg-blue-50/30 transition ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}>
                          <td className="px-3 py-3 text-center text-[12px] text-gray-500 whitespace-nowrap">{fmtDate(app.createdAt)}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${app.type === "신규" ? "bg-[#1B2B4B]/10 text-[#1B2B4B] border-[#1B2B4B]/20" : "bg-gray-100 text-gray-600 border-gray-200"}`}>
                              {app.type}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center font-semibold text-gray-800">{app.companyName}</td>
                          <td className="px-3 py-3 text-center text-gray-700">{app.name}</td>
                          <td className="px-3 py-3 text-center text-gray-500 text-[12px]">{app.phone}</td>
                          {isTotalMaster && (
                            <>
                              <td className="px-3 py-3 text-center text-[12px] text-gray-600">{app.linkedTransportCompany?.companyName || "-"}</td>
                              <td className="px-3 py-3 text-center text-[12px] text-gray-600">{app.transportApprovedBy || "-"}</td>
                            </>
                          )}
                          <td className="px-3 py-3 text-center">
                            {isTotalMaster ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border bg-[#1B2B4B]/10 text-[#1B2B4B] border-[#1B2B4B]/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#1B2B4B]" />
                                2차 승인 필요
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
                                tStatus === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                tStatus === "rejected" ? "bg-red-50 text-red-600 border-red-200" :
                                "bg-gray-100 text-gray-500 border-gray-200"
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${tStatus === "approved" ? "bg-emerald-500" : tStatus === "rejected" ? "bg-red-400" : "bg-gray-400"}`} />
                                {tStatus === "approved" ? "1차 승인" : tStatus === "rejected" ? "거절" : "대기"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={() => setManagingLinkedApp(app)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-[#1B2B4B]/40 text-[#1B2B4B] hover:bg-[#1B2B4B]/10 transition"
                            >
                              관리
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* 모바일 미리보기 */}
        {showMobilePreview && (
          <div className="w-[420px] shrink-0">
            <div className="sticky top-4 bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden">
              <div className="bg-[#1B2B4B] px-4 py-3 flex items-center justify-between">
                <span className="text-white font-semibold text-[14px]">모바일 미리보기</span>
                <button onClick={() => setShowMobilePreview(false)} className="text-white/60 hover:text-white text-lg">✕</button>
              </div>
              <div className="p-3">
                <iframe src="/mobile" title="mobile-preview" className="w-full h-[760px] border border-gray-200 rounded-xl" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ====== 회원 관리 팝업 ====== */}
      {manageUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setManageUser(null); setEditMode(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-[460px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-[15px]">회원 관리</h3>
                <p className="text-white/60 text-[12px] mt-0.5">{manageUser.email}</p>
              </div>
              <button onClick={() => { setManageUser(null); setEditMode(false); }} className="text-white/60 hover:text-white text-lg">✕</button>
            </div>

            {!editMode ? (
              <>
                {/* 회원 정보 */}
                <div className="border-b border-gray-100">
                  {[
                    ["이름", manageUser.name || "-"],
                    ["연락처", manageUser.phone || "-"],
                    ["권한", ROLE_LABELS[manageUser.role] || manageUser.role || "-"],
                    ["회사명", manageUser.companyName || "-"],
                    ["승인 상태", manageUser.approved ? "승인됨" : "미승인"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center px-6 py-3 border-b border-gray-50 last:border-b-0 odd:bg-gray-50/50">
                      <span className="text-[12px] text-gray-400 w-24 shrink-0">{label}</span>
                      <span className="text-[13px] font-medium text-gray-800">{value}</span>
                    </div>
                  ))}
                </div>
                {/* 액션 버튼 */}
                <div className="p-5 space-y-2">
                  <button
                    onClick={() => toggleApprove(manageUser)}
                    className="w-full py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 transition"
                  >
                    {manageUser.approved ? "승인 해제" : "승인"}
                  </button>
                  <button
                    onClick={() => setEditMode(true)}
                    className="w-full py-2.5 rounded-xl border border-[#1B2B4B]/40 text-[13px] font-semibold text-[#1B2B4B] hover:bg-[#1B2B4B]/10 transition"
                  >
                    정보 수정
                  </button>
                  {me?.uid !== manageUser.id && (
                    <button
                      onClick={() => removeUser(manageUser)}
                      className="w-full py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-red-500 hover:bg-red-50 transition"
                    >
                      계정 삭제
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* 수정 폼 */}
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1">회사명</label>
                    <input value={editCompany} onChange={e => setEditCompany(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1">이름</label>
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1">핸드폰번호</label>
                    <input value={editPhone}
                      onChange={e => {
                        let v = e.target.value.replace(/[^0-9]/g, "");
                        if (v.length > 7) v = v.replace(/(\d{3})(\d{4})(\d+)/, "$1-$2-$3");
                        else if (v.length > 3) v = v.replace(/(\d{3})(\d+)/, "$1-$2");
                        setEditPhone(v);
                      }}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1">권한</label>
                    <select value={editRole} onChange={e => setEditRole(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-[#1B2B4B] bg-white">
                      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 px-6 pb-6">
                  <button onClick={() => setEditMode(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition">
                    취소
                  </button>
                  <button onClick={saveEdit}
                    className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">
                    저장
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ====== 연동 화주사 관리 팝업 ====== */}
      {managingLinkedApp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setManagingLinkedApp(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between sticky top-0">
              <div>
                <h3 className="text-white font-bold text-[15px]">
                  {isTotalMaster ? "2차 최종 승인" : "화주사 승인 관리"}
                </h3>
                <p className="text-white/60 text-[12px] mt-0.5">{managingLinkedApp.companyName} / {managingLinkedApp.name}</p>
              </div>
              <button onClick={() => setManagingLinkedApp(null)} className="text-white/60 hover:text-white text-lg">✕</button>
            </div>

            <div className="p-6">
              {isTotalMaster && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#1B2B4B]/5 border border-[#1B2B4B]/15 mb-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1B2B4B] shrink-0" />
                  <span className="text-[12px] font-semibold text-[#1B2B4B]">
                    {managingLinkedApp.linkedTransportCompany?.companyName || "-"} 운송사에서 1차 승인 완료
                  </span>
                </div>
              )}

              {/* 신청 정보 */}
              <div className="border border-gray-100 rounded-xl overflow-hidden mb-5">
                <div className="bg-gray-50 px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">신청 정보</div>
                {[
                  ["신청 유형", managingLinkedApp.type === "신규" ? "신규 가입" : "기존 회사 추가"],
                  ["화주사명", managingLinkedApp.companyName],
                  ["사업자번호", managingLinkedApp.businessNumber || "-"],
                  ["이름", managingLinkedApp.name],
                  ["연락처", managingLinkedApp.phone],
                  ["직책", managingLinkedApp.position || "-"],
                  ["이메일", managingLinkedApp.email || "-"],
                  ["신청일", fmtDate(managingLinkedApp.createdAt)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start px-4 py-3 border-b border-gray-50 last:border-b-0 odd:bg-gray-50/50">
                    <span className="text-[12px] text-gray-400 w-28 shrink-0">{label}</span>
                    <span className="text-[13px] font-medium text-gray-800">{value}</span>
                  </div>
                ))}
              </div>

              {/* 연결 운송사 */}
              {managingLinkedApp.linkedTransportCompany && (
                <div className="border border-gray-100 rounded-xl overflow-hidden mb-5">
                  <div className="bg-gray-50 px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">연결 운송사</div>
                  {[
                    ["운송사명", managingLinkedApp.linkedTransportCompany.companyName || "-"],
                    ["운송사 코드", managingLinkedApp.linkedTransportCompany.companyCode || "-"],
                    ["대표자", managingLinkedApp.linkedTransportCompany.representative || "-"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-start px-4 py-3 border-b border-gray-50 last:border-b-0 odd:bg-gray-50/50">
                      <span className="text-[12px] text-gray-400 w-28 shrink-0">{label}</span>
                      <span className="text-[13px] font-medium text-gray-800">{value}</span>
                    </div>
                  ))}
                  {managingLinkedApp.transportApprovalStatus === "approved" && (
                    <div className="flex items-start px-4 py-3 border-t border-gray-50 odd:bg-gray-50/50">
                      <span className="text-[12px] text-gray-400 w-28 shrink-0">1차 승인자</span>
                      <span className="text-[13px] font-medium text-gray-800">{managingLinkedApp.transportApprovedBy || "-"}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 액션 버튼 */}
              <div className="space-y-2">
                {isTotalMaster ? (
                  <>
                    <button
                      onClick={() => approveShipper2nd(managingLinkedApp)}
                      className="w-full py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition"
                    >
                      최종 승인
                    </button>
                    <button
                      onClick={() => setShowRejectLinked(true)}
                      className="w-full py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition"
                    >
                      거절
                    </button>
                  </>
                ) : (
                  (() => {
                    const tStatus = managingLinkedApp.transportApprovalStatus || "pending";
                    return (
                      <>
                        {tStatus !== "approved" && (
                          <button
                            onClick={() => approveShipper1st(managingLinkedApp)}
                            className="w-full py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition"
                          >
                            1차 승인
                          </button>
                        )}
                        {tStatus !== "rejected" && (
                          <button
                            onClick={() => setShowRejectLinked(true)}
                            className="w-full py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition"
                          >
                            {tStatus === "approved" ? "1차 승인 취소" : "거절"}
                          </button>
                        )}
                        {tStatus === "rejected" && (
                          <button
                            onClick={() => approveShipper1st(managingLinkedApp)}
                            className="w-full py-2.5 rounded-xl border border-[#1B2B4B]/40 text-[13px] font-semibold text-[#1B2B4B] hover:bg-[#1B2B4B]/10 transition"
                          >
                            거절 취소 (대기로 변경)
                          </button>
                        )}
                      </>
                    );
                  })()
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 거절 사유 입력 */}
      {showRejectLinked && managingLinkedApp && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] overflow-hidden">
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-[15px]">거절 사유 입력</h3>
              <button onClick={() => { setShowRejectLinked(false); setRejectLinkedReason(""); }} className="text-white/60 hover:text-white text-lg">✕</button>
            </div>
            <div className="p-6">
              <p className="text-[13px] text-gray-500 mb-4">{managingLinkedApp.companyName} — {managingLinkedApp.name}</p>
              <textarea
                value={rejectLinkedReason}
                onChange={e => setRejectLinkedReason(e.target.value)}
                placeholder="거절 사유를 입력해주세요 (선택사항)"
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[13px] focus:outline-none focus:border-[#1B2B4B] resize-none mb-4"
              />
              <div className="flex gap-3">
                <button onClick={() => { setShowRejectLinked(false); setRejectLinkedReason(""); }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition">
                  취소
                </button>
                <button
                  onClick={() => isTotalMaster
                    ? rejectShipper2nd(managingLinkedApp, rejectLinkedReason)
                    : rejectShipper1st(managingLinkedApp, rejectLinkedReason)
                  }
                  className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">
                  거절 확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
