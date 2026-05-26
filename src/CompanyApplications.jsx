// src/CompanyApplications.jsx
import React, { useState, useEffect, useMemo } from "react";
import { db } from "./firebase";
import {
  collection, onSnapshot, doc, updateDoc, serverTimestamp, query, where,
} from "firebase/firestore";

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

const fmtDate = (ts) => {
  if (!ts?.seconds) return "-";
  return new Date(ts.seconds * 1000).toLocaleString("ko-KR", {
    year: "2-digit", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

const statusLabel = (s) =>
  s === "approved" ? "승인" : s === "rejected" ? "거절" : "대기";
const statusStyle = (s) =>
  s === "approved"
    ? "bg-emerald-100 text-emerald-700 border-emerald-300"
    : s === "rejected"
    ? "bg-red-100 text-red-600 border-red-200"
    : "bg-amber-100 text-amber-600 border-amber-300";

export default function CompanyApplications() {
  const [activeTab, setActiveTab] = useState("화주");

  // 화주 데이터
  const [companyApps, setCompanyApps] = useState([]);
  // 운송 데이터
  const [transportApps, setTransportApps] = useState([]);
  // 기사 데이터
  const [driverApps, setDriverApps] = useState([]);

  const [statusFilter, setStatusFilter] = useState("pending");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedApp, setSelectedApp] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  // 화주 신청 구독
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "companyApplications"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setCompanyApps(list);
    });
    return () => unsub();
  }, []);

  // 운송 신청 구독
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "transportApplications"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setTransportApps(list);
    });
    return () => unsub();
  }, []);

  // 기사 신청 구독 (users where role=driver AND approved=false)
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

  // 탭 변경 시 필터 초기화
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setStatusFilter("pending");
    setTypeFilter("all");
    setSelectedApp(null);
    setShowRejectModal(false);
    setRejectReason("");
  };

  // 현재 탭에 맞는 데이터
  const activeData = activeTab === "화주" ? companyApps : activeTab === "운송" ? transportApps : driverApps;

  // 기사 탭용 필터 (typeFilter 없음)
  const filtered = useMemo(() => {
    if (activeTab === "기사") {
      if (statusFilter === "all") return activeData;
      if (statusFilter === "pending") return activeData.filter((a) => a.approved === false && a.status !== "rejected");
      if (statusFilter === "approved") return activeData.filter((a) => a.approved === true);
      if (statusFilter === "rejected") return activeData.filter((a) => a.status === "rejected");
      return activeData;
    }
    return activeData.filter((a) => {
      const matchStatus = statusFilter === "all" ? true : a.status === statusFilter;
      const matchType = typeFilter === "all" ? true : a.type === typeFilter;
      return matchStatus && matchType;
    });
  }, [activeData, statusFilter, typeFilter, activeTab]);

  // 화주 승인
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
      if (app.userId) {
        await updateDoc(doc(db, "users", app.userId), {
          approved: true,
          companyCode,
          companyName: app.companyName,
        });
      }
      setSelectedApp(null);
    } finally {
      setProcessing(false);
    }
  };

  // 화주 거절
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
      setSelectedApp(null);
    } finally {
      setProcessing(false);
    }
  };

  // 운송 승인
  const approveTransport = async (app) => {
    setProcessing(true);
    try {
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
      if (app.userId) {
        await updateDoc(doc(db, "users", app.userId), {
          approved: true,
          companyCode,
          companyName: app.companyName,
        });
      }
      setSelectedApp(null);
    } finally {
      setProcessing(false);
    }
  };

  // 운송 거절
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
      setSelectedApp(null);
    } finally {
      setProcessing(false);
    }
  };

  // 기사 승인
  const approveDriver = async (app) => {
    setProcessing(true);
    try {
      await updateDoc(doc(db, "users", app.uid), {
        approved: true,
        processedAt: serverTimestamp(),
      });
      try {
        await updateDoc(doc(db, "drivers", app.uid), { approved: true }, { merge: true });
      } catch (_) {
        // drivers doc may not exist - ignore
      }
      setSelectedApp(null);
    } finally {
      setProcessing(false);
    }
  };

  // 기사 거절
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
      setSelectedApp(null);
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

  // 통계 카드 데이터
  const statsCards = useMemo(() => {
    const data = activeData;
    if (activeTab === "기사") {
      return [
        { label: "전체", value: data.length, color: "text-[#1B2B4B]", bg: "bg-[#1B2B4B]/10" },
        { label: "대기", value: data.filter((a) => a.approved === false && a.status !== "rejected").length, color: "text-amber-600", bg: "bg-amber-50" },
        { label: "승인", value: data.filter((a) => a.approved === true).length, color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: "거절", value: data.filter((a) => a.status === "rejected").length, color: "text-red-500", bg: "bg-red-50" },
      ];
    }
    return [
      { label: "전체", value: data.length, color: "text-[#1B2B4B]", bg: "bg-[#1B2B4B]/10" },
      { label: "검토 대기", value: data.filter((a) => a.status === "pending").length, color: "text-amber-600", bg: "bg-amber-50" },
      { label: "승인 완료", value: data.filter((a) => a.status === "approved").length, color: "text-emerald-600", bg: "bg-emerald-50" },
      { label: "거절", value: data.filter((a) => a.status === "rejected").length, color: "text-red-500", bg: "bg-red-50" },
    ];
  }, [activeData, activeTab]);

  const tabTitle = activeTab === "화주" ? "화주 신청 관리" : activeTab === "운송" ? "운송사 신청 관리" : "기사 신청 관리";

  // 기사 탭 상태 판별 (기사는 approved 필드 기반)
  const driverStatus = (app) => {
    if (app.status === "rejected") return "rejected";
    if (app.approved === true) return "approved";
    return "pending";
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-bold text-[#1B2B4B]">가입신청 관리</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">{tabTitle}</p>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {statsCards.map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl px-4 py-2.5 text-center`}>
              <div className={`text-[22px] font-bold ${color}`}>{value}</div>
              <div className="text-[11px] text-gray-500">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-4">
        {[
          { key: "화주", label: "화주 신청" },
          { key: "운송", label: "운송 신청" },
          { key: "기사", label: "기사 신청" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`px-5 py-2 rounded-lg text-[13px] font-semibold border transition ${
              activeTab === key
                ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
                : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 필터 */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {[["all", "전체"], ["pending", "대기"], ["approved", "승인"], ["rejected", "거절"]].map(([v, l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`h-8 px-3.5 rounded-full text-[12px] font-semibold border transition ${statusFilter === v ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
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
                  className={`h-8 px-3.5 rounded-full text-[12px] font-semibold border transition ${typeFilter === v ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                  {l}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="ml-auto text-[13px] text-gray-400 font-medium">{filtered.length}건</div>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
        {activeTab !== "기사" ? (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#1B2B4B]">
                {["신청일시", "유형", "회사명", "사업자번호", "이름", "연락처", "직책", "약관동의", "상태", "처리"].map((h) => (
                  <th key={h} className="px-3 py-3 text-center text-[12px] font-semibold text-white whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-[13px] text-gray-400">
                    신청 내역이 없습니다
                  </td>
                </tr>
              ) : (
                filtered.map((app, idx) => (
                  <tr key={app.id}
                    className={`hover:bg-blue-50/30 transition ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}>
                    <td className="px-3 py-3 text-center text-[12px] text-gray-500 whitespace-nowrap">
                      {fmtDate(app.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${app.type === "신규" ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}>
                        {app.type}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center font-semibold text-gray-800">{app.companyName}</td>
                    <td className="px-3 py-3 text-center text-gray-500 text-[12px]">{app.businessNumber || "-"}</td>
                    <td className="px-3 py-3 text-center text-gray-800">{app.name}</td>
                    <td className="px-3 py-3 text-center text-gray-500 text-[12px]">{app.phone}</td>
                    <td className="px-3 py-3 text-center text-gray-500 text-[12px]">{app.position || "-"}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-[11px] font-bold ${app.termsAgreed && app.privacyAgreed ? "text-emerald-600" : "text-red-500"}`}>
                        {app.termsAgreed && app.privacyAgreed ? "동의" : "미동의"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div>
                        <span className={`px-2 py-1 rounded-full text-[11px] font-bold border ${statusStyle(app.status)}`}>
                          {statusLabel(app.status)}
                        </span>
                        {app.status === "approved" && app.companyCode && (
                          <div className="text-[10px] text-gray-400 font-mono mt-0.5">{app.companyCode}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {app.status === "pending" ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => handleApprove(app)} disabled={processing}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-emerald-600 border border-emerald-300 hover:bg-emerald-50 transition">
                            승인
                          </button>
                          <button onClick={() => { setSelectedApp(app); setShowRejectModal(true); }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition">
                            거절
                          </button>
                          <button onClick={() => setSelectedApp(app)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#1B2B4B] border border-[#1B2B4B]/30 hover:bg-[#1B2B4B]/10 transition">
                            상세
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setSelectedApp(app)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50 transition">
                          상세
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          /* 기사 탭 테이블 */
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#1B2B4B]">
                {["신청일시", "이름", "차량번호", "차종", "연락처", "상태", "처리"].map((h) => (
                  <th key={h} className="px-3 py-3 text-center text-[12px] font-semibold text-white whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-[13px] text-gray-400">
                    신청 내역이 없습니다
                  </td>
                </tr>
              ) : (
                filtered.map((app, idx) => {
                  const st = driverStatus(app);
                  return (
                    <tr key={app.id}
                      className={`hover:bg-blue-50/30 transition ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}>
                      <td className="px-3 py-3 text-center text-[12px] text-gray-500 whitespace-nowrap">
                        {fmtDate(app.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-gray-800">{app.name || app.displayName || "-"}</td>
                      <td className="px-3 py-3 text-center text-gray-500 text-[12px]">{app.vehicleNumber || app.licensePlate || "-"}</td>
                      <td className="px-3 py-3 text-center text-gray-500 text-[12px]">{app.vehicleType || "-"}</td>
                      <td className="px-3 py-3 text-center text-gray-500 text-[12px]">{app.phone || app.phoneNumber || "-"}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-[11px] font-bold border ${statusStyle(st)}`}>
                          {statusLabel(st)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {st === "pending" ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => handleApprove(app)} disabled={processing}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-emerald-600 border border-emerald-300 hover:bg-emerald-50 transition">
                              승인
                            </button>
                            <button onClick={() => { setSelectedApp(app); setShowRejectModal(true); }}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition">
                              거절
                            </button>
                            <button onClick={() => setSelectedApp(app)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#1B2B4B] border border-[#1B2B4B]/30 hover:bg-[#1B2B4B]/10 transition">
                              상세
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setSelectedApp(app)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50 transition">
                            상세
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 상세 모달 - 화주/운송 */}
      {selectedApp && !showRejectModal && activeTab !== "기사" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setSelectedApp(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[520px] max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between sticky top-0">
              <div>
                <h3 className="text-white font-bold text-[15px]">가입신청 상세</h3>
                <p className="text-white/60 text-[12px] mt-0.5">
                  {selectedApp.companyName} / {selectedApp.name}
                </p>
              </div>
              <button onClick={() => setSelectedApp(null)} className="text-white/60 hover:text-white text-lg">x</button>
            </div>
            <div className="p-6">
              <div className="space-y-0 border border-gray-100 rounded-xl overflow-hidden mb-6">
                {[
                  ["신청 유형", selectedApp.type === "신규" ? "신규 가입신청" : "기존 회사 추가 가입"],
                  ["신청 일시", fmtDate(selectedApp.createdAt)],
                  ["회사명", selectedApp.companyName],
                  ["사업자번호", selectedApp.businessNumber || "-"],
                  ["이메일", selectedApp.email || "-"],
                  ["이름", selectedApp.name],
                  ["핸드폰번호", selectedApp.phone],
                  ["직책", selectedApp.position || "-"],
                  ["주소", selectedApp.address || "-"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start px-4 py-3 border-b border-gray-50 last:border-b-0 odd:bg-gray-50/50">
                    <span className="text-[12px] text-gray-400 w-32 shrink-0">{label}</span>
                    <span className="text-[13px] font-medium text-gray-800">{value}</span>
                  </div>
                ))}
              </div>

              <div className="border border-gray-100 rounded-xl overflow-hidden mb-6">
                <div className="bg-gray-50 px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  약관 동의 현황
                </div>
                {[
                  ["서비스 이용약관", selectedApp.termsAgreed],
                  ["개인정보처리방침", selectedApp.privacyAgreed],
                ].map(([label, agreed]) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3 border-t border-gray-50">
                    <span className="text-[13px] text-gray-600">{label}</span>
                    <span className={`text-[12px] font-bold ${agreed ? "text-emerald-600" : "text-red-500"}`}>
                      {agreed ? "동의" : "미동의"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border border-gray-100 rounded-xl overflow-hidden mb-6">
                <div className="bg-gray-50 px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  처리 상태
                </div>
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className={`px-3 py-1 rounded-full text-[12px] font-bold border ${statusStyle(selectedApp.status)}`}>
                    {statusLabel(selectedApp.status)}
                  </span>
                  {selectedApp.status === "approved" && selectedApp.companyCode && (
                    <span className="text-[13px] font-mono font-bold text-[#1B2B4B]">
                      회사코드: {selectedApp.companyCode}
                    </span>
                  )}
                  {selectedApp.status === "rejected" && selectedApp.rejectionReason && (
                    <span className="text-[13px] text-red-500">{selectedApp.rejectionReason}</span>
                  )}
                </div>
              </div>

              {selectedApp.status === "pending" && (
                <div className="flex gap-3">
                  <button onClick={() => handleApprove(selectedApp)} disabled={processing}
                    className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold text-[14px] hover:bg-emerald-700 transition disabled:opacity-50">
                    승인
                  </button>
                  <button onClick={() => setShowRejectModal(true)}
                    className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-[14px] hover:bg-red-600 transition">
                    거절
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 상세 모달 - 기사 */}
      {selectedApp && !showRejectModal && activeTab === "기사" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setSelectedApp(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[520px] max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between sticky top-0">
              <div>
                <h3 className="text-white font-bold text-[15px]">기사 신청 상세</h3>
                <p className="text-white/60 text-[12px] mt-0.5">
                  {selectedApp.name || selectedApp.displayName || "-"}
                </p>
              </div>
              <button onClick={() => setSelectedApp(null)} className="text-white/60 hover:text-white text-lg">x</button>
            </div>
            <div className="p-6">
              <div className="space-y-0 border border-gray-100 rounded-xl overflow-hidden mb-6">
                {[
                  ["신청 일시", fmtDate(selectedApp.createdAt)],
                  ["이름", selectedApp.name || selectedApp.displayName || "-"],
                  ["이메일", selectedApp.email || "-"],
                  ["연락처", selectedApp.phone || selectedApp.phoneNumber || "-"],
                  ["차량번호", selectedApp.vehicleNumber || selectedApp.licensePlate || "-"],
                  ["차종", selectedApp.vehicleType || "-"],
                  ["주소", selectedApp.address || "-"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start px-4 py-3 border-b border-gray-50 last:border-b-0 odd:bg-gray-50/50">
                    <span className="text-[12px] text-gray-400 w-32 shrink-0">{label}</span>
                    <span className="text-[13px] font-medium text-gray-800">{value}</span>
                  </div>
                ))}
              </div>

              <div className="border border-gray-100 rounded-xl overflow-hidden mb-6">
                <div className="bg-gray-50 px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  처리 상태
                </div>
                <div className="px-4 py-3 flex items-center justify-between">
                  {(() => {
                    const st = driverStatus(selectedApp);
                    return (
                      <>
                        <span className={`px-3 py-1 rounded-full text-[12px] font-bold border ${statusStyle(st)}`}>
                          {statusLabel(st)}
                        </span>
                        {st === "rejected" && selectedApp.rejectionReason && (
                          <span className="text-[13px] text-red-500">{selectedApp.rejectionReason}</span>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {driverStatus(selectedApp) === "pending" && (
                <div className="flex gap-3">
                  <button onClick={() => handleApprove(selectedApp)} disabled={processing}
                    className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold text-[14px] hover:bg-emerald-700 transition disabled:opacity-50">
                    승인
                  </button>
                  <button onClick={() => setShowRejectModal(true)}
                    className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-[14px] hover:bg-red-600 transition">
                    거절
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 거절 사유 모달 */}
      {showRejectModal && selectedApp && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] p-6">
            <h3 className="text-[16px] font-bold text-[#1B2B4B] mb-1">거절 사유 입력</h3>
            <p className="text-[13px] text-gray-500 mb-4">
              {activeTab === "기사"
                ? (selectedApp.name || selectedApp.displayName || "-")
                : `${selectedApp.companyName} - ${selectedApp.name}`}
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
                취소
              </button>
              <button onClick={() => handleReject(selectedApp, rejectReason)} disabled={processing}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold text-[13px] hover:bg-red-600 transition disabled:opacity-50">
                거절 확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
