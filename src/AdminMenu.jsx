// src/AdminMenu.jsx
import React, { useEffect, useState, useMemo } from "react";
import { auth, db } from "./firebase";
import {
  collection,
  addDoc,
  setDoc,
  deleteDoc,
  doc,
  onSnapshot,
  getDocs,
  getDoc,
  query,
  where,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { POSITION_OPTIONS, TEAM_OPTIONS, EMPLOYMENT_STATUS_OPTIONS } from "./hrConstants";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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
  hrManager: "인사관리자",
  user: "실무자",
  viewer: "조회전용",
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

export default function AdminMenu({ parentRole = "", parentCompany = "", isViewer = false, dispatchData = [], places = [] }) {
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
  const [editPosition, setEditPosition] = useState("");
  const [editTeam, setEditTeam] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  // 연동 운송사 탭 state
  const [managingLinkedApp, setManagingLinkedApp] = useState(null);
  const [rejectLinkedReason, setRejectLinkedReason] = useState("");
  const [showRejectLinked, setShowRejectLinked] = useState(false);
  const [linkedSearch, setLinkedSearch] = useState("");
  const [linkedStatusFilter, setLinkedStatusFilter] = useState("pending");

  // 화주사 전송 탭 state
  const monthNow = new Date().toISOString().slice(0, 7);
  const [transmitCompanyQuery, setTransmitCompanyQuery] = useState("");
  const [transmitFromMonth, setTransmitFromMonth] = useState(monthNow);
  const [transmitToMonth, setTransmitToMonth] = useState(monthNow);
  const [transmitSearched, setTransmitSearched] = useState(false);
  const [transmitting, setTransmitting] = useState(false);
  const [transmitResult, setTransmitResult] = useState(null);

  const [myRole, setMyRole] = useState("");
  const [myCompany, setMyCompany] = useState("");
  const [myCompanyCode, setMyCompanyCode] = useState("");
  const [appUserPerms, setAppUserPerms] = useState(null);

  const me = auth.currentUser;
  const isTotalMaster = parentRole === "totalMaster" || me?.email === TOTAL_MASTER_EMAIL || myRole === "totalMaster";
  const ROLES = isTotalMaster
    ? ["totalMaster", "admin", "hrManager", "user", "viewer", "driver", "shipper", "test"]
    : ["admin", "user", "viewer", "driver", "shipper", "test"];
  const effectiveCompany = myCompany || parentCompany || localStorage.getItem("userCompany") || "돌캐";

  useEffect(() => {
    if (!me) return;
    const unsub = onSnapshot(doc(db, "users", me.uid), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setMyRole(d.role || "");
        setMyCompany(d.companyName || "");
        setMyCompanyCode(d.companyCode || "");
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

  useEffect(() => {
    if (!managingLinkedApp?.userId) { setAppUserPerms(null); return; }
    getDoc(doc(db, "users", managingLinkedApp.userId)).then(snap => {
      if (snap.exists()) setAppUserPerms(snap.data().permissions || {});
    });
  }, [managingLinkedApp?.userId]);

  const visibleUsers = useMemo(() => {
    if (isTotalMaster) return users;
    return users.filter(u =>
      u.email !== TOTAL_MASTER_EMAIL &&
      u.role !== "totalMaster" &&
      (u.companyName || "돌캐") === effectiveCompany
    );
  }, [users, isTotalMaster, effectiveCompany]);

  const ROLE_ORDER = ["totalMaster","admin","user","test","viewer","driver","shipper"];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleUsers
      .filter((u) => {
        const matchSearch = !q
          ? true
          : [u.email, u.name, u.phone, u.role, u.companyName].join(" ").toLowerCase().includes(q);
        const matchRole = roleFilter === "all" ? true : u.role === roleFilter;
        return matchSearch && matchRole;
      })
      .sort((a, b) => {
        const ia = ROLE_ORDER.indexOf(a.role || "user");
        const ib = ROLE_ORDER.indexOf(b.role || "user");
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
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

  // ====== 화주사 전송 탭 ======
  // 내 회사에 연동 승인된 화주사 목록 (거래처명 매칭 대상)
  const approvedLinkedShippers = useMemo(() => {
    return allShipperApps.filter(a =>
      a.linkedTransportCompany?.companyName === effectiveCompany &&
      a.transportApprovalStatus === "approved"
    );
  }, [allShipperApps, effectiveCompany]);

  const matchedShipper = useMemo(() => {
    const q = transmitCompanyQuery.trim();
    if (!q) return null;
    return approvedLinkedShippers.find(a => (a.companyName || "").trim() === q) || null;
  }, [approvedLinkedShippers, transmitCompanyQuery]);

  const transmitMatches = useMemo(() => {
    const q = transmitCompanyQuery.trim();
    if (!q || !transmitFromMonth || !transmitToMonth) return [];
    const fromKey = transmitFromMonth; // "YYYY-MM"
    const toKey = transmitToMonth;
    return (dispatchData || []).filter(r => {
      if ((r.거래처명 || "").trim() !== q) return false;
      const pickupDate = (r.상차일 || "").slice(0, 7);
      if (!pickupDate) return false;
      return pickupDate >= fromKey && pickupDate <= toKey;
    });
  }, [dispatchData, transmitCompanyQuery, transmitFromMonth, transmitToMonth]);

  const pendingTransmitMatches = useMemo(
    () => transmitMatches.filter(r => !r._transmittedToShipper),
    [transmitMatches]
  );
  const alreadyTransmittedCount = transmitMatches.length - pendingTransmitMatches.length;

  const combineTonString = (r) => {
    const ton = (r.차량톤수 || "").toString().trim();
    if (!ton) return "";
    if (/톤|kg|킬로/.test(ton)) return ton; // 이미 단위 포함
    const unit = (r.톤수타입 || "톤").trim();
    return `${ton}${unit}`;
  };

  const mapOrderForShipper = (r, shipperApp) => ({
    거래처명: shipperApp.companyName,
    shipperCompany: shipperApp.companyName,
    company: effectiveCompany,
    companyCode: myCompanyCode || "",
    운송사명: effectiveCompany,
    운송사코드: myCompanyCode || "",
    작성자: me?.email || "",
    상차지명: r.상차지명 || "",
    상차지주소: r.상차지주소 || "",
    상차담당자명: r.상차지담당자 || "",
    상차담당자번호: r.상차지담당자번호 || "",
    하차지명: r.하차지명 || "",
    하차지주소: r.하차지주소 || "",
    하차담당자명: r.하차지담당자 || "",
    하차담당자번호: r.하차지담당자번호 || "",
    등록일: r.등록일 || r.상차일 || "",
    상차일: r.상차일 || "",
    상차시간: r.상차시간 || "",
    상차시간구분: r.상차시간기준 || "정각",
    하차일: r.하차일 || "",
    하차시간: r.하차시간 || "",
    하차시간구분: r.하차시간기준 || "정각",
    차량종류: r.차량종류 || "",
    차량톤수: combineTonString(r),
    상차방법: r.상차방법 || "",
    하차방법: r.하차방법 || "",
    지급방식: r.지급방식 || "",
    화물내용: r.화물내용 || "",
    화물단위: r.화물타입 || "",
    청구운임: Number(r.청구운임) || 0,
    차량번호: r.차량번호 || "",
    이름: r.이름 || "",
    전화번호: r.전화번호 || "",
    배차상태: r.차량번호 ? "배차완료" : "배차중",
    source: "transport_transmit",
    originCol: r.__col || "dispatch",
    originId: r._id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const handleTransmit = async () => {
    if (isViewer) { _viewerAlert(); return; }
    if (!matchedShipper) { alert("연동 승인된 화주사 중 일치하는 거래처명이 없습니다. 화주사의 회사명과 거래처명이 정확히 일치해야 합니다."); return; }
    if (pendingTransmitMatches.length === 0) { alert("전송할 데이터가 없습니다."); return; }
    if (!window.confirm(`${matchedShipper.companyName}(으)로 ${pendingTransmitMatches.length}건을 전송하시겠습니까?`)) return;

    setTransmitting(true);
    let success = 0;
    let failed = 0;
    try {
      for (const r of pendingTransmitMatches) {
        try {
          const payload = mapOrderForShipper(r, matchedShipper);
          const newDocRef = await addDoc(collection(db, "orders"), payload);

          // 첨부파일 이전
          try {
            const attachSnap = await getDocs(collection(db, payload.originCol, r._id, "attachments"));
            for (const a of attachSnap.docs) {
              await setDoc(doc(db, "orders", newDocRef.id, "attachments", a.id), a.data());
            }
            if (attachSnap.size > 0) {
              await updateDoc(newDocRef, { attachCount: attachSnap.size });
            }
          } catch (e) {
            console.warn("첨부파일 이전 실패(무시하고 계속):", e);
          }

          // 하차지 → 화주사 주소록(places) 업서트
          if (payload.하차지명 && payload.하차지주소) {
            try {
              const dupKey = (payload.하차지명 || "").trim().toLowerCase();
              const existing = (places || []).find(p =>
                (p.company || "") === matchedShipper.companyName &&
                (p.name || "").trim().toLowerCase() === dupKey
              );
              if (!existing) {
                await addDoc(collection(db, "places"), {
                  name: payload.하차지명,
                  address: payload.하차지주소,
                  담당자명: payload.하차담당자명 || "",
                  담당자번호: payload.하차담당자번호 || "",
                  메모: "",
                  type: "하차",
                  company: matchedShipper.companyName,
                  userId: matchedShipper.uid || matchedShipper.userId || "",
                  createdAt: serverTimestamp(),
                });
              }
            } catch (e) {
              console.warn("주소록 이전 실패(무시하고 계속):", e);
            }
          }

          // 원본 오더에 전송 완료 표시 (중복 전송 방지)
          await updateDoc(doc(db, payload.originCol, r._id), {
            _transmittedToShipper: matchedShipper.companyName,
            _transmittedOrderId: newDocRef.id,
            _transmittedAt: Date.now(),
          });

          success++;
        } catch (e) {
          console.error("전송 실패:", r._id, e);
          failed++;
        }
      }
      setTransmitResult({ success, failed, shipper: matchedShipper.companyName });
    } finally {
      setTransmitting(false);
    }
  };

  const _viewerAlert = () => { alert("조회전용 권한으로는 수정/등록/삭제를 할 수 없습니다."); };

  // 관리 기능
  const toggleApprove = async (u) => {
    if (isViewer) return _viewerAlert();
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
    // transportApplications 상태도 동기화
    try {
      const tSnap = await getDocs(query(collection(db, "transportApplications"), where("userId", "==", u.id)));
      for (const d of tSnap.docs) {
        await updateDoc(doc(db, "transportApplications", d.id), {
          status: status ? "approved" : "pending",
          processedAt: serverTimestamp(),
        });
      }
    } catch (_) {}
    if (manageUser?.id === u.id) setManageUser(prev => ({ ...prev, approved: status }));
  };

  const removeUser = async (u) => {
    if (isViewer) return _viewerAlert();
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
    setEditPosition(u.position || "");
    setEditTeam(u.team || "");
    setEditMode(false);
  };

  const saveEdit = async () => {
    if (isViewer) return _viewerAlert();
    if (!editName.trim()) return alert("이름을 입력하세요.");
    if (editRole === "totalMaster" && !isTotalMaster) return alert("totalMaster 권한은 부여할 수 없습니다.");
    if (editRole === "hrManager" && !isTotalMaster) return alert("인사관리자 권한은 최고관리자만 부여할 수 있습니다.");
    const history = [...(manageUser.personnelHistory || [])];
    const prevPosition = manageUser.position || "";
    const nextPosition = editPosition.trim();
    if (prevPosition !== nextPosition && nextPosition) {
      history.push({ date: todayStr(), type: "직책변경", detail: `${prevPosition || "(미지정)"} → ${nextPosition}` });
    }
    const prevTeam = manageUser.team || "";
    if (prevTeam !== editTeam && editTeam) {
      history.push({ date: todayStr(), type: "부서변경", detail: `${prevTeam || "미배정"} → ${editTeam}` });
    }
    const payload = {
      name: editName.trim(),
      phone: editPhone.trim(),
      role: editRole,
      companyName: editCompany.trim(),
      position: nextPosition,
      team: editTeam,
      personnelHistory: history,
    };
    try {
      await setDoc(doc(db, "users", manageUser.id), payload, { merge: true });
      setManageUser(prev => ({ ...prev, ...payload }));
      setEditMode(false);
    } catch (err) {
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  const setResignStatus = async (u, resign) => {
    if (isViewer) return _viewerAlert();
    if (resign) {
      if (!window.confirm(`"${u.name || u.email}" 계정을 퇴사 처리하시겠습니까?\n퇴사 처리된 계정은 즉시 로그인이 차단됩니다.`)) return;
    }
    const history = [...(u.personnelHistory || []), { date: todayStr(), type: resign ? "퇴사" : "복직", detail: resign ? "퇴사 처리" : "복직 처리" }];
    const payload = resign
      ? { employmentStatus: "퇴사", resignedAt: todayStr(), personnelHistory: history }
      : { employmentStatus: "재직", resignedAt: null, personnelHistory: history };
    try {
      await setDoc(doc(db, "users", u.id), payload, { merge: true });
      if (manageUser?.id === u.id) setManageUser(prev => ({ ...prev, ...payload }));
    } catch (err) {
      alert("처리 중 오류가 발생했습니다.");
    }
  };

  // 운송사 관리자 1차 승인
  const approveShipper1st = async (app) => {
    if (isViewer) return _viewerAlert();
    const myName = users.find(u => u.id === me?.uid)?.name || me?.email || "관리자";
    await updateDoc(doc(db, "companyApplications", app.id), {
      transportApprovalStatus: "approved",
      transportApprovedAt: serverTimestamp(),
      transportApprovedBy: myName,
      status: "approved",
      processedAt: serverTimestamp(),
    });
    if (app.userId) {
      try {
        await updateDoc(doc(db, "users", app.userId), { approved: true, companyName: app.companyName });
      } catch (_) {}
    }
    setManagingLinkedApp(prev => prev ? { ...prev, transportApprovalStatus: "approved", transportApprovedBy: myName, status: "approved" } : null);
  };

  // 운송사 관리자 1차 거절
  const rejectShipper1st = async (app, reason) => {
    if (isViewer) return _viewerAlert();
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
    if (isViewer) return _viewerAlert();
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
    if (isViewer) return _viewerAlert();
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
        {!isTotalMaster && (
          <button
            onClick={() => setAdminTab("transmit")}
            className={`px-5 py-2 rounded-lg text-[13px] font-semibold border transition ${adminTab === "transmit" ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"}`}
          >
            화주사 전송
          </button>
        )}
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">

          {/* ====== 회원 관리 탭 (목록 + 상세) ====== */}
          {adminTab === "members" && (
            <div className="flex gap-4" style={{ minHeight: 560 }}>
              {/* 좌측 목록 */}
              <div className="w-[330px] flex-shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col" style={{ maxHeight: 720 }}>
                <div className="p-3 border-b border-gray-100 space-y-2">
                  <div className="flex items-center gap-2 border border-gray-200 rounded-xl overflow-hidden bg-white focus-within:border-[#1B2B4B] transition">
                    <svg className="ml-3 w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="이메일 · 이름 · 회사명 검색"
                      className="flex-1 px-2 py-2 text-[13px] outline-none" />
                  </div>
                  <select
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
                    className="w-full h-[34px] px-3 pr-8 rounded-lg text-[12.5px] font-semibold border border-gray-300 bg-white text-gray-700 outline-none cursor-pointer appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
                  >
                    <option value="all">전체 권한</option>
                    {ROLES.map(r => (
                      <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                    ))}
                  </select>
                  <div className="text-[11px] text-gray-400">{filtered.length}명 표시 중</div>
                </div>
                <div className="overflow-y-auto flex-1">
                  {filtered.length === 0 ? (
                    <div className="py-16 text-center text-[12px] text-gray-300">검색 결과가 없습니다</div>
                  ) : filtered.map(u => {
                    const isMe = me?.uid === u.id;
                    const resigned = u.employmentStatus === "퇴사";
                    return (
                      <div key={u.id} onClick={() => openManage(u)}
                        className={`px-3.5 py-2.5 border-b border-gray-50 cursor-pointer transition ${manageUser?.id === u.id ? "bg-blue-50" : "hover:bg-gray-50"} ${resigned ? "opacity-50" : ""}`}>
                        <div className="flex items-center justify-between">
                          <div className="text-[13px] font-semibold text-gray-800 truncate">{u.name || u.email}</div>
                          <DotBadge active={u.approved && !resigned} activeLabel={resigned ? "퇴사" : "승인"} inactiveLabel={resigned ? "퇴사" : "대기"} />
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5 truncate">{u.email}</div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 font-semibold">{u.team || "미배정"}</span>
                          <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-[#1B2B4B]/5 text-[#1B2B4B] font-semibold">{ROLE_LABELS[u.role || "user"] || u.role}</span>
                          {isMe && <span className="text-[10px] text-blue-500 font-semibold">나</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 우측 상세 패널 */}
              <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm min-w-0">
                {!manageUser ? (
                  <div className="h-full flex items-center justify-center text-[13px] text-gray-300 py-24">왼쪽에서 회원을 선택하세요</div>
                ) : (() => {
                  const u = manageUser;
                  const canManage = isTotalMaster || (u.companyName || "돌캐") === effectiveCompany;
                  const resigned = u.employmentStatus === "퇴사";
                  return (
                    <div>
                      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-[16px] font-bold text-gray-800">{u.name || u.email}</h3>
                            {u.email === TOTAL_MASTER_EMAIL && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">총마스터</span>}
                            {resigned && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200 font-semibold">퇴사 ({u.resignedAt || "-"})</span>}
                          </div>
                          <p className="text-[12px] text-gray-400 mt-0.5">{u.email}</p>
                        </div>
                        {canManage && !editMode && (
                          <div className="flex items-center gap-2">
                            <button onClick={() => setEditMode(true)} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-[#1B2B4B]/40 text-[#1B2B4B] hover:bg-[#1B2B4B]/10 transition">정보 수정</button>
                            <button onClick={() => setResignStatus(u, !resigned)} className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition ${resigned ? "border-gray-200 text-gray-600 hover:bg-gray-50" : "border-red-200 text-red-500 hover:bg-red-50"}`}>
                              {resigned ? "복직 처리" : "퇴사 처리"}
                            </button>
                            {me?.uid !== u.id && (
                              <button onClick={() => removeUser(u)} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-gray-200 text-gray-400 hover:bg-gray-50 transition">계정 삭제</button>
                            )}
                          </div>
                        )}
                      </div>

                      {!editMode ? (
                        <div className="p-6">
                          <div className="grid grid-cols-2 gap-x-8 gap-y-0 border border-gray-100 rounded-xl overflow-hidden mb-5">
                            {[
                              ["이름", u.name || "-"],
                              ["직책", u.position || "-"],
                              ["부서", u.team || "미배정"],
                              ["연락처", u.phone || "-"],
                              ["권한", ROLE_LABELS[u.role] || u.role || "-"],
                              ["회사명", u.companyName || "-"],
                            ].map(([label, value], i) => (
                              <div key={label} className={`flex items-center px-4 py-3 ${i % 2 === 0 ? "border-r border-gray-100" : ""} ${i < 4 ? "border-b border-gray-50" : ""}`}>
                                <span className="text-[12px] text-gray-400 w-16 shrink-0">{label}</span>
                                <span className="text-[13px] font-medium text-gray-800">{value}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <button onClick={() => toggleApprove(u)} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
                              {u.approved ? "승인 해제" : "승인"}
                            </button>
                          </div>

                          {/* 인사발령 이력 */}
                          <div className="mt-5">
                            <div className="text-[12.5px] font-bold text-gray-600 border-l-4 border-[#1B2B4B] pl-2 mb-2">인사발령 이력</div>
                            {(u.personnelHistory || []).length === 0 ? (
                              <div className="text-[12px] text-gray-300 px-1">등록된 발령 이력이 없습니다</div>
                            ) : (
                              <div className="border border-gray-100 rounded-xl divide-y divide-gray-50">
                                {[...(u.personnelHistory || [])].reverse().map((h, i) => (
                                  <div key={i} className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
                                    <span className="text-gray-400 w-24 shrink-0">{h.date}</span>
                                    <span className="font-semibold text-gray-600 w-16 shrink-0">{h.type}</span>
                                    <span className="text-gray-700">{h.detail}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="p-6">
                          <div className="grid grid-cols-2 gap-4 mb-4">
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
                              <label className="block text-[12px] font-semibold text-gray-500 mb-1">직책</label>
                              <select value={editPosition} onChange={e => setEditPosition(e.target.value)}
                                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-[#1B2B4B] bg-white">
                                <option value="">선택 안 함</option>
                                {(editPosition && !POSITION_OPTIONS.includes(editPosition)) && (
                                  <option value={editPosition}>{editPosition}</option>
                                )}
                                {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[12px] font-semibold text-gray-500 mb-1">부서</label>
                              <select value={editTeam} onChange={e => setEditTeam(e.target.value)}
                                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-[#1B2B4B] bg-white">
                                <option value="">미배정</option>
                                {TEAM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
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
                          <div className="flex gap-3">
                            <button onClick={() => setEditMode(false)}
                              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition">
                              취소
                            </button>
                            <button onClick={saveEdit}
                              className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">
                              저장
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
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
                          <td className="px-3 py-3 text-center text-gray-700">
                            <div>{app.name}</div>
                            {app.linkedTransportCompany?.companyName && (
                              <span className="text-[11px] text-blue-600">연동: {app.linkedTransportCompany.companyName}</span>
                            )}
                          </td>
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

          {/* ====== 화주사 전송 탭 ====== */}
          {adminTab === "transmit" && (
            <div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 mb-4">
                <div className="text-[13px] font-bold text-[#1B2B4B] mb-3">화주사로 오더 전송</div>
                <div className="flex items-end gap-3 flex-wrap">
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">거래처명</div>
                    <input
                      value={transmitCompanyQuery}
                      onChange={e => { setTransmitCompanyQuery(e.target.value); setTransmitSearched(false); setTransmitResult(null); }}
                      placeholder="예) 반찬단지"
                      list="admin-transmit-company-list"
                      className="w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B]"
                    />
                    <datalist id="admin-transmit-company-list">
                      {approvedLinkedShippers.map(a => <option key={a.id} value={a.companyName} />)}
                    </datalist>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">시작월</div>
                    <input type="month" value={transmitFromMonth} onChange={e => { setTransmitFromMonth(e.target.value); setTransmitSearched(false); setTransmitResult(null); }}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B]" />
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">종료월</div>
                    <input type="month" value={transmitToMonth} onChange={e => { setTransmitToMonth(e.target.value); setTransmitSearched(false); setTransmitResult(null); }}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B]" />
                  </div>
                  <button
                    onClick={() => { setTransmitSearched(true); setTransmitResult(null); }}
                    disabled={!transmitCompanyQuery.trim()}
                    className="h-[38px] px-5 rounded-lg text-[13px] font-semibold bg-[#1B2B4B] text-white disabled:opacity-40"
                  >
                    조회
                  </button>
                </div>

                {transmitCompanyQuery.trim() && !matchedShipper && (
                  <div className="mt-3 text-[12px] text-amber-600">
                    ⚠ "{transmitCompanyQuery.trim()}"(으)로 연동 승인된 화주사를 찾을 수 없습니다. 화주사의 회사명과 거래처명이 정확히 일치해야 전송할 수 있습니다.
                  </div>
                )}

                {transmitSearched && matchedShipper && (
                  <div className="mt-4 bg-[#1B2B4B]/5 border border-[#1B2B4B]/20 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3">
                    <div className="text-[13px] text-[#1B2B4B]">
                      <span className="font-bold">{matchedShipper.companyName}</span>에 전송할 데이터 총 <span className="font-bold">{transmitMatches.length}건</span>을 찾았습니다.
                      {alreadyTransmittedCount > 0 && (
                        <span className="text-gray-500"> (이미 전송됨 {alreadyTransmittedCount}건 제외 시 {pendingTransmitMatches.length}건)</span>
                      )}
                    </div>
                    <button
                      onClick={handleTransmit}
                      disabled={transmitting || isViewer || pendingTransmitMatches.length === 0}
                      className="h-9 px-5 rounded-lg text-[13px] font-semibold bg-emerald-600 text-white disabled:opacity-40"
                    >
                      {transmitting ? "전송 중..." : `전송 (${pendingTransmitMatches.length}건)`}
                    </button>
                  </div>
                )}

                {transmitResult && (
                  <div className="mt-3 text-[12px] text-emerald-700">
                    ✅ {transmitResult.shipper}(으)로 {transmitResult.success}건 전송 완료
                    {transmitResult.failed > 0 && <span className="text-red-500"> ({transmitResult.failed}건 실패)</span>}
                  </div>
                )}
              </div>

              {transmitSearched && matchedShipper && transmitMatches.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-[#1B2B4B] text-white">
                        <th className="px-3 py-2 text-left font-semibold">상차일</th>
                        <th className="px-3 py-2 text-left font-semibold">상차지</th>
                        <th className="px-3 py-2 text-left font-semibold">하차지</th>
                        <th className="px-3 py-2 text-left font-semibold">청구운임</th>
                        <th className="px-3 py-2 text-center font-semibold">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {transmitMatches.map(r => (
                        <tr key={r._id}>
                          <td className="px-3 py-2">{r.상차일}</td>
                          <td className="px-3 py-2">{r.상차지명}</td>
                          <td className="px-3 py-2">{r.하차지명}</td>
                          <td className="px-3 py-2">{Number(r.청구운임 || 0).toLocaleString()}원</td>
                          <td className="px-3 py-2 text-center">
                            {r._transmittedToShipper
                              ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">전송됨</span>
                              : <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">전송 대기</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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

              {/* 권한 관리 (최고관리자 전용) */}
              {isTotalMaster && managingLinkedApp.userId && appUserPerms !== null && (
                <div className="border border-gray-100 rounded-xl overflow-hidden mb-5">
                  <div className="bg-gray-50 px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">권한 관리</div>
                  <div className="px-4 py-4 space-y-3">
                    {[
                      { key: "master", label: "마스터", desc: "전체 권한" },
                      { key: "subMaster", label: "부마스터", desc: "마스터 권한 부여 제외" },
                      { key: "settlement", label: "경리", desc: "정산 탭 접근" },
                      { key: "transport", label: "운송", desc: "운송 탭 접근" },
                    ].map(({ key, label, desc }) => (
                      <label key={key} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!appUserPerms[key]}
                          onChange={(e) => setAppUserPerms(prev => ({ ...prev, [key]: e.target.checked }))}
                          className="w-4 h-4 rounded"
                        />
                        <div>
                          <div className="text-[13px] font-semibold text-gray-800">{label}</div>
                          <div className="text-[10px] text-gray-400">{desc}</div>
                        </div>
                      </label>
                    ))}
                    <button
                      onClick={async () => {
                        if (isViewer) { _viewerAlert(); return; }
                        try {
                          await updateDoc(doc(db, "users", managingLinkedApp.userId), { permissions: appUserPerms });
                          alert("권한이 저장되었습니다.");
                        } catch (err) {
                          alert("저장 중 오류가 발생했습니다: " + (err?.message || err));
                        }
                      }}
                      className="w-full py-2 mt-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold"
                    >
                      권한 저장
                    </button>
                  </div>
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
