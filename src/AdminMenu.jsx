// src/AdminMenu.jsx
import React, { useEffect, useState, useMemo } from "react";
import { auth, db, storage } from "./firebase";
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
  orderBy,
  limit,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

import { POSITION_OPTIONS, TEAM_OPTIONS, EMPLOYMENT_STATUS_OPTIONS } from "./hrConstants";
import { CustomSelect } from "./CustomSelect";
import RolePermissionsPanel from "./RolePermissionsPanel";
import { useCustomRoles } from "./customRoles";
import { EditableText } from "./EditMode";

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
  const [sessionLogs, setSessionLogs] = useState([]);
  const [sessionLogEventFilter, setSessionLogEventFilter] = useState("all");
  const [sessionLogPage, setSessionLogPage] = useState(1);
  const SESSION_LOG_PAGE_SIZE = 10;
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

  // 화주사 문의 탭 state
  const [allInquiries, setAllInquiries] = useState([]);
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [inquiryReplyText, setInquiryReplyText] = useState("");
  const [inquiryReplying, setInquiryReplying] = useState(false);

  // 도입 문의(홈페이지 랜딩페이지) 탭 state
  const [landingInquiries, setLandingInquiries] = useState([]);
  const [selectedLandingInquiry, setSelectedLandingInquiry] = useState(null);
  const [landingStatusSaving, setLandingStatusSaving] = useState(false);

  const [myRole, setMyRole] = useState("");
  const [myCompany, setMyCompany] = useState("");
  const [myCompanyCode, setMyCompanyCode] = useState("");
  const [appUserPerms, setAppUserPerms] = useState(null);

  const me = auth.currentUser;
  const isTotalMaster = parentRole === "totalMaster" || me?.email === TOTAL_MASTER_EMAIL || myRole === "totalMaster";
  const customRoles = useCustomRoles();
  const roleLabels = { ...ROLE_LABELS, ...Object.fromEntries(customRoles.map(r => [r.key, r.label])) };
  const ROLES = isTotalMaster
    ? ["totalMaster", "admin", "hrManager", "user", "viewer", "driver", "shipper", "test", ...customRoles.map(r => r.key)]
    : ["admin", "user", "viewer", "driver", "shipper", "test", ...customRoles.map(r => r.key)];
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

  // 최고관리자 전용 접속이력(로그인/로그아웃) — 탭을 열었을 때만 구독한다.
  useEffect(() => {
    if (!isTotalMaster || adminTab !== "sessionLogs") return;
    const q = query(collection(db, "sessionLogs"), orderBy("at", "desc"), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      setSessionLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [isTotalMaster, adminTab]);

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

  // 화주사 문의 구독
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "inquiries"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setAllInquiries(list);
    });
    return () => unsub();
  }, []);

  // 도입 문의(홈페이지 랜딩페이지 도입문의 폼) 구독 — 최고관리자만
  useEffect(() => {
    if (!isTotalMaster) return;
    const unsub = onSnapshot(collection(db, "landingInquiries"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setLandingInquiries(list);
    });
    return () => unsub();
  }, [isTotalMaster]);

  const newLandingInquiryCount = landingInquiries.filter(q => (q.status || "신규") === "신규").length;

  const updateLandingInquiryStatus = async (id, status) => {
    setLandingStatusSaving(true);
    try {
      await updateDoc(doc(db, "landingInquiries", id), { status });
      setSelectedLandingInquiry(prev => (prev && prev.id === id ? { ...prev, status } : prev));
    } finally {
      setLandingStatusSaving(false);
    }
  };

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

  // ====== 화주사 문의 탭 ======
  const linkedShipperCompanyNames = useMemo(
    () => new Set(approvedLinkedShippers.map(a => a.companyName)),
    [approvedLinkedShippers]
  );
  const myLinkedInquiries = useMemo(() => {
    return allInquiries.filter(q => {
      const author = users.find(u => u.id === q.userId);
      return author && linkedShipperCompanyNames.has(author.companyName);
    }).map(q => ({ ...q, __authorCompany: users.find(u => u.id === q.userId)?.companyName || "" }));
  }, [allInquiries, users, linkedShipperCompanyNames, isTotalMaster]);
  const unansweredInquiryCount = myLinkedInquiries.filter(q => q.status !== "답변완료").length;

  const handleReplyInquiry = async () => {
    if (isViewer) { _viewerAlert(); return; }
    if (!selectedInquiry || !inquiryReplyText.trim()) return;
    setInquiryReplying(true);
    try {
      await updateDoc(doc(db, "inquiries", selectedInquiry.id), {
        reply: inquiryReplyText.trim(),
        status: "답변완료",
        repliedAt: serverTimestamp(),
        repliedBy: me?.email || "",
      });
      setSelectedInquiry(null);
      setInquiryReplyText("");
    } catch (e) {
      alert("답변 등록 실패: " + e.message);
    } finally {
      setInquiryReplying(false);
    }
  };

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
    경유상차목록: Array.isArray(r.경유상차목록) ? r.경유상차목록 : (Array.isArray(r.경유지_상차) ? r.경유지_상차 : []),
    경유하차목록: Array.isArray(r.경유하차목록) ? r.경유하차목록 : (Array.isArray(r.경유지_하차) ? r.경유지_하차 : []),
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
    // ⚠️ 1차 승인은 운송사 관리자 확인일 뿐 — 최종 로그인 허용(users.approved)과
    // companyApplications.status="approved"는 최고관리자의 2차 승인(approveShipper2nd)에서만
    // 설정해야 한다. 여기서 같이 켜버리면 1차만 하고도 로그인이 되고, 최고관리자의
    // "2차 승인 대기" 목록(status !== "approved" 조건)에서도 즉시 빠져버린다.
    await updateDoc(doc(db, "companyApplications", app.id), {
      transportApprovalStatus: "approved",
      transportApprovedAt: serverTimestamp(),
      transportApprovedBy: myName,
    });
    setManagingLinkedApp(prev => prev ? { ...prev, transportApprovalStatus: "approved", transportApprovedBy: myName } : null);
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

  // ⭐ 관리자메뉴 상단 버튼이 한 줄에 9개까지 늘어서 지저분해 보인다는 요청 —
  // 관련 있는 것끼리 묶어 "그룹(1단 탭) 안에 하위 탭(2단 탭)" 구조로 재구성했다.
  // REQUIRES_MASTER에 있는 하위 탭은 최고관리자에게만 보인다(기존 isTotalMaster
  // 게이팅과 동일한 기준을 그대로 옮긴 것 — 권한 자체는 안 바뀜).
  const REQUIRES_MASTER_TABS = new Set([
    "landingInquiries", "sessionLogs", "forceUpdate", "permissions", "gsheetBackfill",
    "landingEdit", "notifTemplate",
  ]);
  const TAB_LABELS = {
    members: "회원 관리",
    linked: "연동 화주사",
    transmit: "화주사 전송",
    inquiries: "화주사 문의",
    landingInquiries: "도입 문의",
    sessionLogs: "접속이력",
    forceUpdate: "화주사 강제 업데이트",
    permissions: "권한 관리",
    gsheetBackfill: "구글시트 백필",
    landingEdit: "랜딩페이지 편집",
    notifTemplate: "알림 문구 설정",
  };
  const tabGroups = [
    { key: "members", label: "회원 관리", tabs: ["members"] },
    { key: "shipperMgmt", label: "화주사 관리", tabs: ["linked", "transmit", "inquiries", "landingInquiries"] },
    { key: "ops", label: "운영 관리", tabs: ["sessionLogs", "forceUpdate", "permissions", "gsheetBackfill"] },
    { key: "settings", label: "환경 설정", tabs: ["landingEdit", "notifTemplate"] },
  ]
    .map((g) => ({ ...g, tabs: g.tabs.filter((t) => !REQUIRES_MASTER_TABS.has(t) || isTotalMaster) }))
    .filter((g) => g.tabs.length > 0);
  const activeGroup = tabGroups.find((g) => g.tabs.includes(adminTab)) || tabGroups[0];
  const tabBadgeCounts = { linked: linkedPendingCount, inquiries: unansweredInquiryCount, landingInquiries: newLandingInquiryCount };
  const groupBadgeTotal = (g) => g.tabs.reduce((sum, t) => sum + (tabBadgeCounts[t] || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-[#1B2B4B]"><EditableText id="adminMenu.header.title" defaultText="관리자 메뉴" /></h1>
          <p className="text-[13px] text-gray-500 mt-0.5"><EditableText id="adminMenu.header.subtitle" defaultText="사용자 계정 권한 및 승인 관리" /></p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-[#1B2B4B]/10 rounded-xl px-4 py-2 text-center">
            <div className="text-[22px] font-bold text-[#1B2B4B]">{visibleUsers.length}</div>
            <div className="text-[11px] text-gray-500"><EditableText id="adminMenu.header.전체사용자" defaultText="전체 사용자" /></div>
          </div>
          <div className="bg-emerald-50 rounded-xl px-4 py-2 text-center">
            <div className="text-[22px] font-bold text-emerald-600">{visibleUsers.filter(u => u.approved).length}</div>
            <div className="text-[11px] text-gray-500"><EditableText id="adminMenu.header.승인완료" defaultText="승인 완료" /></div>
          </div>
          <div className="bg-amber-50 rounded-xl px-4 py-2 text-center">
            <div className="text-[22px] font-bold text-amber-500">{visibleUsers.filter(u => !u.approved).length}</div>
            <div className="text-[11px] text-gray-500"><EditableText id="adminMenu.header.승인대기" defaultText="승인 대기" /></div>
          </div>
          <button
            onClick={() => setShowMobilePreview(v => !v)}
            className={`px-4 py-2.5 rounded-xl text-[13px] font-semibold shadow-sm transition ${showMobilePreview ? "bg-gray-700 text-white" : "bg-[#1B2B4B] text-white hover:bg-[#243a60]"}`}
          >
            <EditableText id="adminMenu.header.모바일미리보기" defaultText="모바일 미리보기" />
          </button>
        </div>
      </div>

      {/* 탭 — 1단(그룹) + 2단(하위 탭) 구조. 그룹 안에 탭이 하나뿐이면(회원 관리)
          하위 탭 줄 자체를 안 그린다. */}
      <div className="flex gap-2 mb-2 flex-wrap">
        {tabGroups.map((group) => {
          const active = group.key === activeGroup.key;
          const badge = groupBadgeTotal(group);
          return (
            <button
              key={group.key}
              onClick={() => setAdminTab(group.tabs[0])}
              className={`relative px-5 py-2 rounded-lg text-[13px] font-semibold border transition ${active ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"}`}
            >
              <EditableText id={`adminMenu.group.${group.key}`} defaultText={group.label} />
              {badge > 0 && (
                <span className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${active ? "bg-white text-[#1B2B4B]" : "bg-[#1B2B4B] text-white"}`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeGroup.tabs.length > 1 ? (
        <div className="flex gap-2 mb-4 pl-3 ml-1 border-l-2 border-gray-200 flex-wrap">
          {activeGroup.tabs.map((t) => {
            const active = adminTab === t;
            const badge = tabBadgeCounts[t] || 0;
            return (
              <button
                key={t}
                onClick={() => setAdminTab(t)}
                className={`relative px-4 py-1.5 rounded-md text-[12px] font-semibold border transition ${active ? "bg-[#2C4270] text-white border-[#2C4270]" : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50"}`}
              >
                <EditableText id={`adminMenu.tab.${t}`} defaultText={TAB_LABELS[t]} />
                {badge > 0 && (
                  <span className={`absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center ${active ? "bg-white text-[#2C4270]" : "bg-[#2C4270] text-white"}`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mb-4" />
      )}

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">

          {/* ====== 회원 관리 탭 (목록 + 상세) ====== */}
          {adminTab === "members" && (
            <div className="flex gap-4" style={{ minHeight: 560 }}>
              {/* 좌측 목록 */}
              <div className="w-[330px] flex-shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col" style={{ maxHeight: 720 }}>
                <div className="p-3 border-b border-gray-100 space-y-2">
                  <div className="flex items-center gap-2 border border-gray-200 rounded-xl overflow-hidden bg-white focus-within:border-[#1B2B4B] transition">
                    <svg className="ml-3 w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
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
                      <option key={r} value={r}>{roleLabels[r] || r}</option>
                    ))}
                  </select>
                  <div className="text-[11px] text-gray-500">{filtered.length}명 표시 중</div>
                </div>
                <div className="overflow-y-auto flex-1">
                  {filtered.length === 0 ? (
                    <div className="py-16 text-center text-[12px] text-gray-400">검색 결과가 없습니다</div>
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
                        <div className="text-[11px] text-gray-500 mt-0.5 truncate">{u.email}</div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 font-semibold">{u.team || "미배정"}</span>
                          <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-[#1B2B4B]/5 text-[#1B2B4B] font-semibold">{roleLabels[u.role || "user"] || u.role}</span>
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
                  <div className="h-full flex items-center justify-center text-[13px] text-gray-400 py-24">왼쪽에서 회원을 선택하세요</div>
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
                          <p className="text-[12px] text-gray-500 mt-0.5">{u.email}</p>
                        </div>
                        {canManage && !editMode && (
                          <div className="flex items-center gap-2">
                            <button onClick={() => setEditMode(true)} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-[#1B2B4B]/40 text-[#1B2B4B] hover:bg-[#1B2B4B]/10 transition"><EditableText id="adminMenu.members.정보수정" defaultText="정보 수정" /></button>
                            <button onClick={() => setResignStatus(u, !resigned)} className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition ${resigned ? "border-gray-200 text-gray-600 hover:bg-gray-50" : "border-red-200 text-red-500 hover:bg-red-50"}`}>
                              {resigned ? <EditableText id="adminMenu.members.복직처리" defaultText="복직 처리" /> : <EditableText id="adminMenu.members.퇴사처리" defaultText="퇴사 처리" />}
                            </button>
                            {me?.uid !== u.id && (
                              <button onClick={() => removeUser(u)} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50 transition"><EditableText id="adminMenu.members.계정삭제" defaultText="계정 삭제" /></button>
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
                              ["권한", roleLabels[u.role] || u.role || "-"],
                              ["회사명", u.companyName || "-"],
                            ].map(([label, value], i) => (
                              <div key={label} className={`flex items-center px-4 py-3 ${i % 2 === 0 ? "border-r border-gray-100" : ""} ${i < 4 ? "border-b border-gray-50" : ""}`}>
                                <span className="text-[12px] text-gray-500 w-16 shrink-0"><EditableText id={`adminMenu.members.infoLabel.${label}`} defaultText={label} /></span>
                                <span className="text-[13px] font-medium text-gray-800">{value}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <button onClick={() => toggleApprove(u)} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
                              {u.approved ? <EditableText id="adminMenu.members.승인해제" defaultText="승인 해제" /> : <EditableText id="adminMenu.members.승인" defaultText="승인" />}
                            </button>
                          </div>

                          {/* 인사발령 이력 */}
                          <div className="mt-5">
                            <div className="text-[12.5px] font-bold text-gray-600 border-l-4 border-[#1B2B4B] pl-2 mb-2"><EditableText id="adminMenu.members.인사발령이력" defaultText="인사발령 이력" /></div>
                            {(u.personnelHistory || []).length === 0 ? (
                              <div className="text-[12px] text-gray-400 px-1">등록된 발령 이력이 없습니다</div>
                            ) : (
                              <div className="border border-gray-100 rounded-xl divide-y divide-gray-50">
                                {[...(u.personnelHistory || [])].reverse().map((h, i) => (
                                  <div key={i} className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
                                    <span className="text-gray-500 w-24 shrink-0">{h.date}</span>
                                    <span className="font-semibold text-gray-600 w-16 shrink-0">{h.type}</span>
                                    <span className="text-gray-700">{h.detail}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="p-5">
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-500 mb-1">회사명</label>
                              <input value={editCompany} onChange={e => setEditCompany(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]" />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-500 mb-1">이름</label>
                              <input value={editName} onChange={e => setEditName(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]" />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-500 mb-1">직책</label>
                              <CustomSelect value={editPosition} onChange={e => setEditPosition(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#1B2B4B] bg-white">
                                <option value="">선택 안 함</option>
                                {(editPosition && !POSITION_OPTIONS.includes(editPosition)) && (
                                  <option value={editPosition}>{editPosition}</option>
                                )}
                                {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                              </CustomSelect>
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-500 mb-1">부서</label>
                              <CustomSelect value={editTeam} onChange={e => setEditTeam(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#1B2B4B] bg-white">
                                <option value="">미배정</option>
                                {TEAM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                              </CustomSelect>
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-500 mb-1">핸드폰번호</label>
                              <input value={editPhone}
                                onChange={e => {
                                  let v = e.target.value.replace(/[^0-9]/g, "");
                                  if (v.length > 7) v = v.replace(/(\d{3})(\d{4})(\d+)/, "$1-$2-$3");
                                  else if (v.length > 3) v = v.replace(/(\d{3})(\d+)/, "$1-$2");
                                  setEditPhone(v);
                                }}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]" />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-500 mb-1">권한</label>
                              <CustomSelect value={editRole} onChange={e => setEditRole(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#1B2B4B] bg-white">
                                {ROLES.map(r => <option key={r} value={r}>{roleLabels[r] || r}</option>)}
                              </CustomSelect>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setEditMode(false)}
                              className="flex-1 py-2 rounded-lg border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition">
                              취소
                            </button>
                            <button onClick={saveEdit}
                              className="flex-1 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">
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
                    <svg className="ml-3 w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input value={linkedSearch} onChange={e => setLinkedSearch(e.target.value)}
                      placeholder="회사명·이름 검색"
                      className="flex-1 px-2 py-2 text-[13px] outline-none" />
                  </div>
                  <div className="ml-auto text-[13px] text-gray-500">{filteredLinked.length}건</div>
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
                        <th key={h} className="px-3 py-3 text-center text-[12px] font-semibold text-white whitespace-nowrap"><EditableText id={`adminMenu.applyTable.header.${h}`} defaultText={h} /></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredLinked.length === 0 ? (
                      <tr>
                        <td colSpan={isTotalMaster ? 9 : 7} className="py-16 text-center text-[13px] text-gray-500">
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
                        <th className="px-3 py-2 text-left font-semibold"><EditableText id="adminMenu.transmitTable.header.상차일" defaultText="상차일" /></th>
                        <th className="px-3 py-2 text-left font-semibold"><EditableText id="adminMenu.transmitTable.header.상차지" defaultText="상차지" /></th>
                        <th className="px-3 py-2 text-left font-semibold"><EditableText id="adminMenu.transmitTable.header.하차지" defaultText="하차지" /></th>
                        <th className="px-3 py-2 text-left font-semibold"><EditableText id="adminMenu.transmitTable.header.청구운임" defaultText="청구운임" /></th>
                        <th className="px-3 py-2 text-center font-semibold"><EditableText id="adminMenu.transmitTable.header.상태" defaultText="상태" /></th>
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

          {/* ====== 화주사 문의 탭 ====== */}
          {adminTab === "inquiries" && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {myLinkedInquiries.length === 0 ? (
                <div className="text-[13px] text-gray-500 text-center py-16">연동된 화주사의 문의가 없습니다.</div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#1B2B4B] text-white">
                      <th className="px-4 py-2.5 text-left font-semibold"><EditableText id="adminMenu.inquiryTable.header.회사" defaultText="회사" /></th>
                      <th className="px-4 py-2.5 text-left font-semibold"><EditableText id="adminMenu.inquiryTable.header.제목" defaultText="제목" /></th>
                      <th className="px-4 py-2.5 text-left font-semibold"><EditableText id="adminMenu.inquiryTable.header.작성자" defaultText="작성자" /></th>
                      <th className="px-4 py-2.5 text-center font-semibold"><EditableText id="adminMenu.inquiryTable.header.등록일" defaultText="등록일" /></th>
                      <th className="px-4 py-2.5 text-center font-semibold"><EditableText id="adminMenu.inquiryTable.header.상태" defaultText="상태" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {myLinkedInquiries.map(q => (
                      <tr key={q.id} onClick={() => { setSelectedInquiry(q); setInquiryReplyText(q.reply || ""); }} className="cursor-pointer hover:bg-gray-50 transition">
                        <td className="px-4 py-3 text-gray-600">{q.__authorCompany}</td>
                        <td className="px-4 py-3 font-semibold text-gray-800">{q.title}</td>
                        <td className="px-4 py-3 text-gray-500">{q.name}</td>
                        <td className="px-4 py-3 text-center text-gray-500">{q.createdAt?.seconds ? new Date(q.createdAt.seconds * 1000).toLocaleDateString("ko-KR") : "-"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${q.status === "답변완료" ? "bg-emerald-100 text-emerald-700" : "bg-amber-50 text-amber-600"}`}>
                            {q.status || "접수중"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ====== 접속이력 탭 (최고관리자 전용) ====== */}
          {adminTab === "sessionLogs" && isTotalMaster && (() => {
            const filteredLogs = sessionLogs.filter(l => sessionLogEventFilter === "all" || l.event === sessionLogEventFilter);
            const totalPages = Math.max(1, Math.ceil(filteredLogs.length / SESSION_LOG_PAGE_SIZE));
            const page = Math.min(sessionLogPage, totalPages);
            const pageLogs = filteredLogs.slice((page - 1) * SESSION_LOG_PAGE_SIZE, page * SESSION_LOG_PAGE_SIZE);
            return (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                <span className="text-[13px] font-semibold text-gray-600">최근 50건 중 {filteredLogs.length}건 · 10건씩 표시</span>
                <select
                  value={sessionLogEventFilter}
                  onChange={e => { setSessionLogEventFilter(e.target.value); setSessionLogPage(1); }}
                  className="ml-auto h-[32px] px-2.5 rounded-lg text-[12px] font-semibold border border-gray-300 bg-white text-gray-700 outline-none"
                >
                  <option value="all">전체</option>
                  <option value="login">로그인만</option>
                  <option value="logout">로그아웃만</option>
                </select>
              </div>
              {filteredLogs.length === 0 ? (
                <div className="text-[13px] text-gray-500 text-center py-16">접속 이력이 없습니다.</div>
              ) : (
                <>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#1B2B4B] text-white">
                      <th className="px-2 py-2.5 text-center font-semibold w-[70px]"><EditableText id="adminMenu.sessionLogTable.header.구분" defaultText="구분" /></th>
                      <th className="px-2 py-2.5 text-center font-semibold"><EditableText id="adminMenu.sessionLogTable.header.회사명" defaultText="회사명" /></th>
                      <th className="px-2 py-2.5 text-center font-semibold"><EditableText id="adminMenu.sessionLogTable.header.이름" defaultText="이름" /></th>
                      <th className="px-2 py-2.5 text-center font-semibold"><EditableText id="adminMenu.sessionLogTable.header.이메일" defaultText="이메일" /></th>
                      <th className="px-2 py-2.5 text-center font-semibold w-[80px]"><EditableText id="adminMenu.sessionLogTable.header.권한" defaultText="권한" /></th>
                      <th className="px-2 py-2.5 text-center font-semibold w-[140px]"><EditableText id="adminMenu.sessionLogTable.header.시각" defaultText="시각" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pageLogs.map(l => (
                      <tr key={l.id} className="hover:bg-gray-50 transition">
                        <td className="px-2 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${l.event === "login" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                            {l.event === "login" ? "로그인" : "로그아웃"}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center text-gray-700 truncate max-w-[120px]">{l.companyName || "-"}</td>
                        <td className="px-2 py-2.5 text-center text-gray-700 truncate max-w-[100px]">{l.name || "-"}</td>
                        <td className="px-2 py-2.5 text-center text-gray-500 truncate max-w-[160px]">{l.email || "-"}</td>
                        <td className="px-2 py-2.5 text-center text-gray-500">{roleLabels[l.role] || l.role || "-"}</td>
                        <td className="px-2 py-2.5 text-center text-gray-500 whitespace-nowrap">
                          {l.at?.seconds ? new Date(l.at.seconds * 1000).toLocaleString("ko-KR") : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-center gap-1 py-3 border-t border-gray-100">
                  <button
                    onClick={() => setSessionLogPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-2.5 py-1 rounded-md text-[12px] font-semibold border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50"
                  >이전</button>
                  <span className="text-[12px] text-gray-500 px-2">{page} / {totalPages}</span>
                  <button
                    onClick={() => setSessionLogPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-2.5 py-1 rounded-md text-[12px] font-semibold border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50"
                  >다음</button>
                </div>
                </>
              )}
            </div>
            );
          })()}

          {/* ====== 화주사 강제 업데이트 탭 (최고관리자 전용) ====== */}
          {adminTab === "forceUpdate" && isTotalMaster && (
            <ShipperForceUpdatePanel currentVersion={__APP_VERSION__} />
          )}

          {/* ====== 도입 문의 탭 (홈페이지 랜딩페이지, 최고관리자 전용) ====== */}
          {adminTab === "landingInquiries" && isTotalMaster && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {landingInquiries.length === 0 ? (
                <div className="text-[13px] text-gray-500 text-center py-16">홈페이지로 들어온 도입 문의가 없습니다.</div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#1B2B4B] text-white">
                      <th className="px-4 py-2.5 text-left font-semibold"><EditableText id="adminMenu.landingInquiryTable.header.회사명" defaultText="회사명" /></th>
                      <th className="px-4 py-2.5 text-left font-semibold"><EditableText id="adminMenu.landingInquiryTable.header.담당자" defaultText="담당자" /></th>
                      <th className="px-4 py-2.5 text-left font-semibold"><EditableText id="adminMenu.landingInquiryTable.header.연락처" defaultText="연락처" /></th>
                      <th className="px-4 py-2.5 text-center font-semibold"><EditableText id="adminMenu.landingInquiryTable.header.접수일" defaultText="접수일" /></th>
                      <th className="px-4 py-2.5 text-center font-semibold"><EditableText id="adminMenu.landingInquiryTable.header.상태" defaultText="상태" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {landingInquiries.map(q => (
                      <tr key={q.id} onClick={() => setSelectedLandingInquiry(q)} className="cursor-pointer hover:bg-gray-50 transition">
                        <td className="px-4 py-3 font-semibold text-gray-800">{q.companyName}</td>
                        <td className="px-4 py-3 text-gray-600">{q.name}</td>
                        <td className="px-4 py-3 text-gray-600">{q.phone}</td>
                        <td className="px-4 py-3 text-center text-gray-500">{q.createdAt?.seconds ? new Date(q.createdAt.seconds * 1000).toLocaleDateString("ko-KR") : "-"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            q.status === "완료" ? "bg-emerald-100 text-emerald-700"
                            : q.status === "상담중" ? "bg-blue-50 text-blue-600"
                            : "bg-amber-50 text-amber-600"
                          }`}>
                            {q.status || "신규"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ====== 권한 관리 탭 (최고관리자 전용) ====== */}
          {adminTab === "permissions" && isTotalMaster && (
            <RolePermissionsPanel />
          )}

          {/* ====== 구글시트 백필 탭 (최고관리자 전용, 임시 · 1회성) ====== */}
          {adminTab === "gsheetBackfill" && isTotalMaster && (
            <>
              <GsheetBackfillPanel />
              <GsheetClientBackfillPanel />
            </>
          )}

          {/* ====== 랜딩페이지 편집 탭 (최고관리자 전용) ====== */}
          {adminTab === "landingEdit" && isTotalMaster && <LandingPageEditPanel />}

          {/* ====== 알림 문구 설정 탭 (최고관리자 전용) ====== */}
          {adminTab === "notifTemplate" && isTotalMaster && <NotifTemplatePanel />}
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
                  {isTotalMaster ? <EditableText id="adminMenu.linkedPopup.title2" defaultText="2차 최종 승인" /> : <EditableText id="adminMenu.linkedPopup.title1" defaultText="화주사 승인 관리" />}
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
                <div className="bg-gray-50 px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100"><EditableText id="adminMenu.linkedPopup.section.신청정보" defaultText="신청 정보" /></div>
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
                    <span className="text-[12px] text-gray-500 w-28 shrink-0"><EditableText id={`adminMenu.linkedPopup.label.${label}`} defaultText={label} /></span>
                    <span className="text-[13px] font-medium text-gray-800">{value}</span>
                  </div>
                ))}
              </div>

              {/* 연결 운송사 */}
              {managingLinkedApp.linkedTransportCompany && (
                <div className="border border-gray-100 rounded-xl overflow-hidden mb-5">
                  <div className="bg-gray-50 px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100"><EditableText id="adminMenu.linkedPopup.section.연결운송사" defaultText="연결 운송사" /></div>
                  {[
                    ["운송사명", managingLinkedApp.linkedTransportCompany.companyName || "-"],
                    ["운송사 코드", managingLinkedApp.linkedTransportCompany.companyCode || "-"],
                    ["대표자", managingLinkedApp.linkedTransportCompany.representative || "-"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-start px-4 py-3 border-b border-gray-50 last:border-b-0 odd:bg-gray-50/50">
                      <span className="text-[12px] text-gray-500 w-28 shrink-0"><EditableText id={`adminMenu.linkedPopup.label.${label}`} defaultText={label} /></span>
                      <span className="text-[13px] font-medium text-gray-800">{value}</span>
                    </div>
                  ))}
                  {managingLinkedApp.transportApprovalStatus === "approved" && (
                    <div className="flex items-start px-4 py-3 border-t border-gray-50 odd:bg-gray-50/50">
                      <span className="text-[12px] text-gray-500 w-28 shrink-0"><EditableText id="adminMenu.linkedPopup.label.1차승인자" defaultText="1차 승인자" /></span>
                      <span className="text-[13px] font-medium text-gray-800">{managingLinkedApp.transportApprovedBy || "-"}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 권한 관리 (최고관리자 전용) */}
              {isTotalMaster && managingLinkedApp.userId && appUserPerms !== null && (
                <div className="border border-gray-100 rounded-xl overflow-hidden mb-5">
                  <div className="bg-gray-50 px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100"><EditableText id="adminMenu.linkedPopup.section.권한관리" defaultText="권한 관리" /></div>
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
                          <div className="text-[13px] font-semibold text-gray-800"><EditableText id={`adminMenu.linkedPopup.perm.${key}.label`} defaultText={label} /></div>
                          <div className="text-[10px] text-gray-500"><EditableText id={`adminMenu.linkedPopup.perm.${key}.desc`} defaultText={desc} /></div>
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
                      <EditableText id="adminMenu.linkedPopup.권한저장" defaultText="권한 저장" />
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
                      <EditableText id="adminMenu.linkedPopup.최종승인" defaultText="최종 승인" />
                    </button>
                    <button
                      onClick={() => setShowRejectLinked(true)}
                      className="w-full py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition"
                    >
                      <EditableText id="adminMenu.linkedPopup.거절" defaultText="거절" />
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
                            <EditableText id="adminMenu.linkedPopup.1차승인" defaultText="1차 승인" />
                          </button>
                        )}
                        {tStatus !== "rejected" && (
                          <button
                            onClick={() => setShowRejectLinked(true)}
                            className="w-full py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition"
                          >
                            {tStatus === "approved" ? <EditableText id="adminMenu.linkedPopup.1차승인취소" defaultText="1차 승인 취소" /> : <EditableText id="adminMenu.linkedPopup.거절" defaultText="거절" />}
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

      {/* ====== 화주사 문의 답변 팝업 ====== */}
      {selectedInquiry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setSelectedInquiry(null); setInquiryReplyText(""); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <div className="font-bold text-[15px] text-[#1B2B4B]">{selectedInquiry.title}</div>
                <div className="text-[12px] text-gray-500 mt-0.5">{selectedInquiry.__authorCompany} · {selectedInquiry.name}</div>
              </div>
              <button onClick={() => { setSelectedInquiry(null); setInquiryReplyText(""); }} className="text-gray-500 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <div className="text-[11px] font-semibold text-gray-500 mb-1">문의 내용</div>
                <div className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-3">{selectedInquiry.content}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-gray-500 mb-1">답변</div>
                <textarea
                  value={inquiryReplyText}
                  onChange={e => setInquiryReplyText(e.target.value)}
                  rows={5}
                  placeholder="답변 내용을 입력하세요"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] resize-none"
                />
              </div>
              <button
                onClick={handleReplyInquiry}
                disabled={inquiryReplying || isViewer || !inquiryReplyText.trim()}
                className="w-full py-2.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold disabled:opacity-40"
              >
                {inquiryReplying ? "등록 중..." : (selectedInquiry.status === "답변완료" ? "답변 수정" : "답변 등록")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== 도입 문의 상세 팝업 ====== */}
      {selectedLandingInquiry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedLandingInquiry(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <div className="font-bold text-[15px] text-[#1B2B4B]">{selectedLandingInquiry.companyName}</div>
                <div className="text-[12px] text-gray-500 mt-0.5">
                  {selectedLandingInquiry.name} · {selectedLandingInquiry.phone}
                  {selectedLandingInquiry.createdAt?.seconds && ` · ${new Date(selectedLandingInquiry.createdAt.seconds * 1000).toLocaleString("ko-KR")}`}
                </div>
              </div>
              <button onClick={() => setSelectedLandingInquiry(null)} className="text-gray-500 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {selectedLandingInquiry.email && (
                <div>
                  <div className="text-[11px] font-semibold text-gray-500 mb-1">이메일</div>
                  <div className="text-[13px] text-gray-700">{selectedLandingInquiry.email}</div>
                </div>
              )}
              <div>
                <div className="text-[11px] font-semibold text-gray-500 mb-1">문의 내용</div>
                <div className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-3 min-h-[48px]">
                  {selectedLandingInquiry.message || "-"}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-gray-500 mb-1">진행 상태</div>
                <div className="flex gap-2">
                  {["신규", "상담중", "완료"].map(s => (
                    <button
                      key={s}
                      disabled={landingStatusSaving}
                      onClick={() => updateLandingInquiryStatus(selectedLandingInquiry.id, s)}
                      className={`flex-1 py-2 rounded-lg text-[13px] font-bold border transition disabled:opacity-50 ${
                        (selectedLandingInquiry.status || "신규") === s
                          ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
                          : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ====== 화주사 강제 업데이트 (최고관리자 전용) ======
// 화주사 클라이언트가 자체 서비스워커 갱신을 놓치는 경우에 대비해, 최고관리자가
// systemConfig/forceUpdate 문서의 minVersion을 직접 올리면 화주사 프로그램(ShipperApp.jsx)이
// 자신의 __APP_VERSION__과 비교해 뒤처진 경우 강제로 업데이트 배너를 띄운다.
// ⚠️ 임시 기능 — 구글시트 실시간 연동을 붙이기 전에 이미 등록/수정돼 있던 오더를
// 한 번에 시트로 밀어넣기 위한 1회성 버튼. Cloud Function(backfillGsheetMonth)이
// 그 달 탭을 통째로 비우고 프로그램(앱) 기준으로 다시 채워넣는다 — 그래서 매번
// 눌러도 결과는 항상 "지금 프로그램에 있는 내용 그대로"로 수렴한다(중복 걱정 없음).
// 다 쓰면(백필 다 끝내면) 이 패널/탭은 지워도 된다.
function GsheetBackfillPanel() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");

  const handleRun = async () => {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      alert("월 형식이 올바르지 않습니다. 예: 2026-09");
      return;
    }
    if (!window.confirm(`"${month}" 탭을 통째로 비우고, 프로그램에 지금 있는 오더로 다시 채웁니다.\n(그 탭에 시트에서만 직접 입력해둔 값이 있었다면 사라집니다)\n계속할까요?`)) return;

    setRunning(true);
    setResult("");
    try {
      const url = `https://us-central1-dispatch-app-9b92f.cloudfunctions.net/backfillGsheetMonth?key=dolkae-backfill-2026&month=${encodeURIComponent(month)}`;
      const res = await fetch(url);
      const text = await res.text();
      setResult(text);
    } catch (e) {
      setResult(`요청 실패: ${e?.message || e}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-xl">
      <div className="text-[14px] font-bold text-gray-800 mb-1">구글시트 백필 (임시 · 1회성)</div>
      <p className="text-[12px] text-gray-500 mb-5 leading-relaxed">
        구글시트 실시간 연동이 붙기 전에 이미 등록/수정돼 있던 오더를, 지정한 달 전체
        기준으로 시트에 한 번에 밀어넣습니다. 대상 탭을 통째로 비운 뒤 프로그램(앱)
        기준으로 다시 채우는 방식이라, 여러 번 눌러도 결과는 항상 지금 프로그램에
        있는 내용 그대로로 맞춰집니다.
      </p>
      <div className="flex items-center gap-2 mb-4">
        <label className="text-[12px] text-gray-600 font-semibold">대상 월</label>
        <input
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          placeholder="2026-09"
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-[13px] w-32"
        />
      </div>
      <button
        onClick={handleRun}
        disabled={running}
        className="px-5 py-2.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition disabled:opacity-40"
      >
        {running ? "실행 중... (몇 분 걸릴 수 있어요)" : `"${month}" 백필 실행`}
      </button>
      {result && (
        <div className="mt-4 bg-gray-50 rounded-lg px-4 py-3 text-[12px] text-gray-700 whitespace-pre-wrap break-words">
          {result}
        </div>
      )}
    </div>
  );
}

// ⭐ 기본거래처(clients)/하차지거래처(places)를 구글시트로 전송 — "기본거래처관리"/
// "하차지거래처관리" 탭은 미리 만들어둘 필요 없다(없으면 Cloud Function이 새로
// 만든다). 컬럼명/순서는 화면(거래처관리 목록)에 있는 그대로 코드에 고정돼 있어서,
// 실행할 때마다 헤더까지 항상 그 컬럼명으로 다시 써준다 — 사용자가 시트에 헤더를
// 미리 넣어둘 필요가 없다.
function GsheetClientBackfillPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");

  const handleRun = async () => {
    if (!window.confirm(`"기본거래처관리"/"하차지거래처관리" 탭을 통째로 비우고, 프로그램에 지금 등록된 거래처로 다시 채웁니다.\n계속할까요?`)) return;
    setRunning(true);
    setResult("");
    try {
      const url = `https://us-central1-dispatch-app-9b92f.cloudfunctions.net/backfillGsheetClients?key=dolkae-backfill-2026`;
      const res = await fetch(url);
      const text = await res.text();
      setResult(text);
    } catch (e) {
      setResult(`요청 실패: ${e?.message || e}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-xl mt-6">
      <div className="text-[14px] font-bold text-gray-800 mb-1">거래처 구글시트 전송</div>
      <p className="text-[12px] text-gray-500 mb-5 leading-relaxed">
        기본거래처/하차지거래처에 등록된 정보를 "기본거래처관리"/"하차지거래처관리" 탭에
        한 번에 반영합니다. 탭이 없으면 새로 만들고, 컬럼명도 화면에 있는 그대로(제외:
        기본거래처는 등급/안내사항, 하차지거래처는 등급/안내사항/삭제) 실행할 때마다
        다시 써줍니다 — 컬럼명을 미리 준비할 필요 없이 그냥 실행만 하면 됩니다.
      </p>
      <button
        onClick={handleRun}
        disabled={running}
        className="px-5 py-2.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition disabled:opacity-40"
      >
        {running ? "실행 중..." : "거래처 전송 실행"}
      </button>
      {result && (
        <div className="mt-4 bg-gray-50 rounded-lg px-4 py-3 text-[12px] text-gray-700 whitespace-pre-wrap break-words">
          {result}
        </div>
      )}
    </div>
  );
}

// ⭐ 알림 문구 설정 — 최고관리자가 푸시 알림 본문에 어떤 필드를 넣을지 종류별로
// 고른다(제목은 고정값이라 여기선 안 건드림). 실제 발송 로직(functions/index.js)의
// NOTIF_TEMPLATE_FIELD_LABELS/NOTIF_TEMPLATE_DEFAULTS와 필드 키/순서를 반드시
// 맞춰야 한다 — 여기서 저장하는 값을 Cloud Functions가 그대로 읽어서 쓴다.
const NOTIF_FIELD_OPTIONS = [
  { key: "거래처명", label: "거래처명" },
  { key: "상차지명", label: "상차지" },
  { key: "하차지명", label: "하차지" },
  { key: "상차일", label: "상차일" },
  { key: "상차시간", label: "상차시간" },
  { key: "화물내용", label: "화물정보" },
  { key: "차량톤수", label: "차량톤수" },
  { key: "차량종류", label: "차량종류" },
  { key: "차량번호", label: "차량번호" },
  { key: "기사명", label: "기사명" },
  { key: "전화번호", label: "전화번호" },
];
const NOTIF_TYPE_DEFS = [
  { key: "배차등록", label: "배차등록 (일반 신규오더 등록)", defaultFields: ["거래처명", "상차지명", "하차지명"] },
  { key: "긴급배차", label: "긴급배차 (긴급 신규오더 등록)", defaultFields: ["거래처명", "상차지명", "하차지명"] },
  { key: "배차완료", label: "배차완료 (기사 배정됨)", defaultFields: ["거래처명", "상차지명", "하차지명", "기사명", "차량번호"] },
  { key: "미배차", label: "미배차 임박", defaultFields: ["거래처명", "상차지명", "하차지명", "상차시간"] },
];
function notifFieldsFor(cfg, typeKey, defaultFields) {
  const f = cfg?.[typeKey]?.fields;
  return Array.isArray(f) && f.length ? f : defaultFields;
}

function NotifTemplatePanel() {
  const [config, setConfig] = useState(null); // null = 로딩중
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "siteConfig", "notificationTemplate"),
      (snap) => setConfig(snap.exists() ? snap.data() || {} : {}),
      () => setConfig({})
    );
    return () => unsub();
  }, []);

  const toggleField = (typeKey, defaultFields, fieldKey) => {
    setConfig((prev) => {
      const cur = new Set(notifFieldsFor(prev, typeKey, defaultFields));
      if (cur.has(fieldKey)) cur.delete(fieldKey);
      else cur.add(fieldKey);
      // 항상 NOTIF_FIELD_OPTIONS 정의 순서로 정렬해서 저장한다 — 발송 쪽에서
      // "상차지 바로 다음에 하차지가 오면 화살표로 잇는다"는 로직이 순서에
      // 의존하기 때문에, 체크한 순서가 아니라 항상 같은 순서를 유지해야 한다.
      const ordered = NOTIF_FIELD_OPTIONS.map((o) => o.key).filter((k) => cur.has(k));
      return { ...(prev || {}), [typeKey]: { fields: ordered } };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "siteConfig", "notificationTemplate"), config || {}, { merge: true });
      alert("저장했습니다. 다음 알림부터 바로 반영됩니다.");
    } catch (e) {
      alert("저장 실패: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-3xl">
      <div className="text-[14px] font-bold text-gray-800 mb-1">알림 문구 설정</div>
      <p className="text-[12px] text-gray-500 mb-5 leading-relaxed">
        푸시 알림의 제목은 고정이고, 본문에 어떤 정보를 넣을지만 알림 종류별로 고를 수
        있습니다. 상차지·하차지를 둘 다 선택하면 "상차지 → 하차지"로 화살표로
        이어집니다. (재배차·배차취소 알림은 정해진 안내 문구라 여기서 설정할 수
        없습니다.)
      </p>
      {config === null ? (
        <div className="text-[13px] text-gray-400 py-8 text-center">불러오는 중...</div>
      ) : (
        <div className="space-y-4">
          {NOTIF_TYPE_DEFS.map(({ key, label, defaultFields }) => {
            const selected = new Set(notifFieldsFor(config, key, defaultFields));
            return (
              <div key={key} className="border border-gray-100 rounded-lg p-4">
                <div className="text-[13px] font-bold text-gray-700 mb-2">{label}</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {NOTIF_FIELD_OPTIONS.map((opt) => {
                    const on = selected.has(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => toggleField(key, defaultFields, opt.key)}
                        className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"}`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] text-gray-400">
                  미리보기: {NOTIF_FIELD_OPTIONS.filter((o) => selected.has(o.key)).map((o) => o.label).join(" · ") || "(선택 없음)"}
                </div>
              </div>
            );
          })}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition disabled:opacity-40"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      )}
    </div>
  );
}

// ⭐ 랜딩페이지 편집 — 로그인 전 첫 화면(src/Login.jsx)의 배경/문구/색/글씨체를
// 최고관리자가 바꾼다. siteConfig/landing 문서 하나에 다 저장하고, Login.jsx가
// 그 문서를 실시간 구독해서 반영한다(firestore.rules에서 이 문서는 get은 누구나,
// write는 최고관리자만 되도록 막아뒀다).
const DEFAULT_BADGE = "물류 관리 플랫폼";
const DEFAULT_HEADLINE_1 = "더 스마트한";
const DEFAULT_HEADLINE_2 = "물류 관리";
const DEFAULT_SUBTITLE_1 = "배차 관리부터 차주 관리, 운임 정산까지";
const DEFAULT_SUBTITLE_2 = "KP-Flow 하나로 물류 업무를 최적화하세요.";
const DEFAULT_CTA_TRANSPORT = "운송사 시작하기";
const DEFAULT_CTA_DRIVER = "차주 시작하기";
const DEFAULT_CTA_SHIPPER = "화주사 시작하기";
const DEFAULT_FOOTER = "© 2025 KP-Flow Logistics. All rights reserved.";
const DEFAULT_LANDING_FEATURES = [
  { title: "배차 관리", desc: "실시간 배차 등록 및 현황 관리" },
  { title: "차주 관리", desc: "차주 정보 및 운행 현황 통합 관리" },
  { title: "운임 정산", desc: "청구운임 및 기사운임 자동 정산" },
  { title: "거래처 관리", desc: "화주사 및 거래처 통합 관리" },
];
const LANDING_FONT_OPTIONS = [
  { key: "noto", label: "Noto Sans KR (기본)" },
  { key: "nanum", label: "나눔고딕" },
  { key: "gothicA1", label: "Gothic A1" },
];

function FieldRow({ label, value, onChange, placeholder }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-gray-500 mb-1">{label}</div>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-[13px]"
      />
    </div>
  );
}

function LandingPageEditPanel() {
  const [form, setForm] = useState(null); // null = 로딩중
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "siteConfig", "landing"),
      (snap) => setForm(snap.exists() ? { ...snap.data() } : {}),
      () => setForm({})
    );
    return () => unsub();
  }, []);

  const set = (key, value) => setForm((prev) => ({ ...(prev || {}), [key]: value }));
  const setFeature = (idx, key, value) => {
    setForm((prev) => {
      const base = Array.isArray(prev?.features) && prev.features.length === 4
        ? prev.features.map((f) => ({ ...f }))
        : DEFAULT_LANDING_FEATURES.map((f) => ({ ...f }));
      base[idx] = { ...base[idx], [key]: value };
      return { ...(prev || {}), features: base };
    });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("이미지 파일만 업로드할 수 있습니다."); return; }
    if (file.size > 8 * 1024 * 1024) { alert("이미지 용량은 8MB 이하로 올려주세요."); return; }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `siteConfig/landing-bg-${Date.now()}.${ext}`;
      const r = storageRef(storage, path);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      set("backgroundImageUrl", url);
      // 이미지는 올리자마자 바로 저장/반영 — 아래 다른 텍스트/색상은 "저장" 버튼으로 따로 적용.
      await setDoc(doc(db, "siteConfig", "landing"), { backgroundImageUrl: url }, { merge: true });
    } catch (e) {
      alert("이미지 업로드 실패: " + (e?.message || e));
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = async () => {
    set("backgroundImageUrl", "");
    try {
      await setDoc(doc(db, "siteConfig", "landing"), { backgroundImageUrl: "" }, { merge: true });
    } catch {}
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "siteConfig", "landing"), form || {}, { merge: true });
      alert("저장했습니다. 로그인 전 첫 화면에 바로 반영됩니다.");
    } catch (e) {
      alert("저장 실패: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (form === null) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-[13px] text-gray-400">
        불러오는 중...
      </div>
    );
  }

  const features = Array.isArray(form.features) && form.features.length === 4 ? form.features : DEFAULT_LANDING_FEATURES;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-3xl">
      <div className="text-[14px] font-bold text-gray-800 mb-1">랜딩페이지 편집</div>
      <p className="text-[12px] text-gray-500 mb-5 leading-relaxed">
        로그인 전 첫 화면(PC/모바일 공통)의 배경·문구·색·글씨체를 바꿉니다. 저장하면
        방문자 화면에 새로고침 없이 바로 반영됩니다.
      </p>

      {/* 배경 이미지 */}
      <div className="mb-6">
        <div className="text-[12px] font-bold text-gray-600 mb-2">배경 이미지</div>
        {form.backgroundImageUrl ? (
          <img
            src={form.backgroundImageUrl}
            alt="배경 미리보기"
            className="w-full max-w-md h-32 object-cover rounded-lg border border-gray-200 mb-2"
          />
        ) : (
          <div className="text-[11px] text-gray-400 mb-2">
            설정 안 함 — 기본 영상 배경(/videos/bg-truck.mp4)이 그대로 나갑니다.
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-[12px] font-semibold cursor-pointer hover:bg-gray-200 transition">
            {uploading ? "업로드 중..." : "이미지 업로드"}
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
          </label>
          {form.backgroundImageUrl && (
            <button
              onClick={handleRemoveImage}
              className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-500 text-[12px] font-semibold hover:bg-gray-50 transition"
            >
              이미지 제거(영상으로 복귀)
            </button>
          )}
        </div>
      </div>

      {/* 오버레이 색상 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <div className="text-[12px] font-bold text-gray-600 mb-1">배경 위 오버레이 색</div>
          <input
            type="color"
            value={form.overlayColor || "#0B2554"}
            onChange={(e) => set("overlayColor", e.target.value)}
            className="w-full h-9 rounded border border-gray-300"
          />
        </div>
        <div>
          <div className="text-[12px] font-bold text-gray-600 mb-1">오버레이 진하기 ({form.overlayOpacity ?? 82}%)</div>
          <input
            type="range"
            min="0"
            max="100"
            value={form.overlayOpacity ?? 82}
            onChange={(e) => set("overlayOpacity", Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      {/* 글씨체 */}
      <div className="mb-6">
        <div className="text-[12px] font-bold text-gray-600 mb-1">글씨체</div>
        <select
          value={form.fontFamily || "noto"}
          onChange={(e) => set("fontFamily", e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-[13px]"
        >
          {LANDING_FONT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* 문구 색상 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <div className="text-[12px] font-bold text-gray-600 mb-1">기본 글씨 색</div>
          <input
            type="color"
            value={form.textColor || "#ffffff"}
            onChange={(e) => set("textColor", e.target.value)}
            className="w-full h-9 rounded border border-gray-300"
          />
        </div>
        <div>
          <div className="text-[12px] font-bold text-gray-600 mb-1">강조 글씨 색(헤드라인 2번째 줄)</div>
          <input
            type="color"
            value={form.accentColor || "#93c5fd"}
            onChange={(e) => set("accentColor", e.target.value)}
            className="w-full h-9 rounded border border-gray-300"
          />
        </div>
      </div>

      {/* 텍스트 */}
      <div className="space-y-3 mb-6">
        <FieldRow label="상단 배지 문구" value={form.badgeText} onChange={(v) => set("badgeText", v)} placeholder={DEFAULT_BADGE} />
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="헤드라인 1번째 줄" value={form.headlineLine1} onChange={(v) => set("headlineLine1", v)} placeholder={DEFAULT_HEADLINE_1} />
          <FieldRow label="헤드라인 2번째 줄(강조색)" value={form.headlineLine2} onChange={(v) => set("headlineLine2", v)} placeholder={DEFAULT_HEADLINE_2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="부제목 1번째 줄" value={form.subtitleLine1} onChange={(v) => set("subtitleLine1", v)} placeholder={DEFAULT_SUBTITLE_1} />
          <FieldRow label="부제목 2번째 줄" value={form.subtitleLine2} onChange={(v) => set("subtitleLine2", v)} placeholder={DEFAULT_SUBTITLE_2} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FieldRow label="운송사 버튼 문구" value={form.ctaTransportLabel} onChange={(v) => set("ctaTransportLabel", v)} placeholder={DEFAULT_CTA_TRANSPORT} />
          <FieldRow label="차주 버튼 문구" value={form.ctaDriverLabel} onChange={(v) => set("ctaDriverLabel", v)} placeholder={DEFAULT_CTA_DRIVER} />
          <FieldRow label="화주사 버튼 문구" value={form.ctaShipperLabel} onChange={(v) => set("ctaShipperLabel", v)} placeholder={DEFAULT_CTA_SHIPPER} />
        </div>
        <FieldRow label="하단 푸터 문구" value={form.footerText} onChange={(v) => set("footerText", v)} placeholder={DEFAULT_FOOTER} />
      </div>

      {/* 기능 카드 4개 */}
      <div className="mb-6">
        <div className="text-[12px] font-bold text-gray-600 mb-2">기능 카드 4개</div>
        <div className="grid grid-cols-2 gap-3">
          {features.map((f, i) => (
            <div key={i} className="border border-gray-100 rounded-lg p-3">
              <input
                value={f.title || ""}
                onChange={(e) => setFeature(i, "title", e.target.value)}
                placeholder={DEFAULT_LANDING_FEATURES[i].title}
                className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] font-bold mb-1"
              />
              <input
                value={f.desc || ""}
                onChange={(e) => setFeature(i, "desc", e.target.value)}
                placeholder={DEFAULT_LANDING_FEATURES[i].desc}
                className="w-full border border-gray-300 rounded px-2 py-1 text-[11px]"
              />
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-5 py-2.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition disabled:opacity-40"
      >
        {saving ? "저장 중..." : "저장"}
      </button>
    </div>
  );
}

function ShipperForceUpdatePanel({ currentVersion }) {
  const [minVersion, setMinVersion] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "systemConfig", "forceUpdate"), (snap) => {
      if (snap.exists()) {
        setMinVersion(snap.data().minVersion || null);
        setUpdatedAt(snap.data().updatedAt || null);
      }
    });
    return () => unsub();
  }, []);

  const handleForceUpdate = async () => {
    setSending(true);
    try {
      await setDoc(doc(db, "systemConfig", "forceUpdate"), {
        minVersion: currentVersion,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email || "",
      });
      alert(`화주사 강제 업데이트를 발송했습니다. (기준 버전 v${currentVersion})`);
    } catch (e) {
      alert("발송 실패: " + e.message);
    } finally {
      setSending(false);
    }
  };

  const isCurrentAlreadyMin = minVersion === currentVersion;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-xl">
      <div className="text-[14px] font-bold text-gray-800 mb-1">화주사 강제 업데이트</div>
      <p className="text-[12px] text-gray-500 mb-5 leading-relaxed">
        화주사 프로그램(PC)이 새 버전을 자동으로 못 받아오는 경우를 대비한 기능입니다.
        아래 버튼을 누르면 현재 운송사 프로그램의 버전(v{currentVersion})을 기준으로,
        이보다 낮은 버전을 쓰고 있는 모든 화주사 화면 상단에 업데이트 안내가 강제로 표시됩니다.
      </p>
      <div className="bg-gray-50 rounded-lg px-4 py-3 mb-5 text-[12px] text-gray-600 space-y-1">
        <div>현재 최신 버전 (운송사 기준): <span className="font-bold text-[#1B2B4B]">v{currentVersion}</span></div>
        <div>
          화주사 강제 최소 버전: <span className="font-bold">{minVersion ? `v${minVersion}` : "설정 안 됨"}</span>
          {isCurrentAlreadyMin && <span className="ml-2 text-emerald-600 font-semibold">(최신 상태로 반영됨)</span>}
        </div>
        <div>마지막 발송: {updatedAt?.seconds ? new Date(updatedAt.seconds * 1000).toLocaleString("ko-KR") : "-"}</div>
      </div>
      <button
        onClick={handleForceUpdate}
        disabled={sending}
        className="px-5 py-2.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition disabled:opacity-40"
      >
        {sending ? "발송 중..." : "화주사 강제 업데이트 발송"}
      </button>
    </div>
  );
}
