import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { db, auth } from "../../firebase";
import ShipperOrder from "./ShipperOrder";
import {
  collection,
  query,
  where,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  setDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";

const STATUS = {
  요청: { label: "요청", cls: "bg-slate-100 text-slate-700" },
  배차중: { label: "배차중", cls: "bg-amber-100 text-amber-800" },
  배차완료: { label: "배차완료", cls: "bg-emerald-100 text-emerald-800" },
  배차취소: { label: "취소", cls: "bg-rose-100 text-rose-800" },
};

const getTodayKST = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

const get3MonthsAgo = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

const fmt12 = (t) => {
  if (!t) return "-";
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return t;
  const isAM = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${isAM ? "오전" : "오후"} ${h12}시${m > 0 ? ` ${m}분` : ""}`;
};

const fmtTimeCell = (time, gubun) => {
  if (!time) return "즉시";
  return gubun && gubun !== "정각" ? `${fmt12(time)} ${gubun}` : fmt12(time);
};

const getViaList = (v) => (Array.isArray(v) ? v.filter(s => s && (s.업체명 || s.주소)) : []);

const getPalletSummary = (o) => {
  if (Array.isArray(o.화물목록) && o.화물목록.length) {
    const totals = {};
    o.화물목록.forEach(r => {
      if (r.unit !== "파레트" || !r.qty || !r.palletCo) return;
      const label = r.palletCo === "KPP" ? "K" : r.palletCo === "아주" ? "AJ" : r.palletCo;
      totals[label] = (totals[label] || 0) + Number(r.qty);
    });
    return Object.entries(totals).map(([label, n]) => `${label} ${n}장`).join("+");
  }
  return o.파렛트사요약 || "";
};

// 경유+N 뱃지 — 운송프로그램(StopInlineBadge)과 동일한 디자인/동작
function ShipperViaBadge({ count, label, onOpen }) {
  if (!count) return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#1B2B4B] text-white hover:bg-[#243d6a] cursor-pointer whitespace-nowrap"
    >
      경유+{count}
    </button>
  );
}

const fmtDate = (ts) => {
  if (!ts) return "-";
  if (ts?.toDate) return ts.toDate().toISOString().slice(0, 10);
  if (ts instanceof Date) return ts.toISOString().slice(0, 10);
  return String(ts).slice(0, 10);
};

const fmtDateTime = (ts) => {
  if (!ts) return "-";
  let d;
  if (ts?.toDate) d = ts.toDate();
  else if (ts instanceof Date) d = ts;
  else if (typeof ts === "number") d = new Date(ts);
  else return String(ts).slice(0, 16);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16).replace("T", " ");
};

export default function ShipperStatus() {
  const user = auth.currentUser;
  const [userData, setUserData] = useState(null);
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("전체");
  const [keyword, setKeyword] = useState("");
  const scrollRef = useRef(null);
  const prevAttachRef = useRef({});
  const [attachNotif, setAttachNotif] = useState(null);
  const [attachViewer, setAttachViewer] = useState(null);
  const prevVehicleRef = useRef({});
  const [dispatchNotif, setDispatchNotif] = useState(null);
  const [focusOrderId, setFocusOrderId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const rowRefs = useRef({});
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  const pushToast = (t) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { ...t, id }].slice(-4));
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 7000);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      if (e.shiftKey) { e.preventDefault(); el.scrollLeft += e.deltaY; }
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const [startDate, setStartDate] = useState(get3MonthsAgo());
  const [endDate, setEndDate] = useState(getTodayKST());
  const [searchType, setSearchType] = useState("통합");
  const [transportFilter, setTransportFilter] = useState("전체");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [hideCanceled, setHideCanceled] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 100;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ message: "", onConfirm: null });
  const [addrPopup, setAddrPopup] = useState(null);
  const [viaPopup, setViaPopup] = useState(null); // { label, list }
  const [palletPopup, setPalletPopup] = useState(null); // { text }
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, order }
  const [driverInfoPopup, setDriverInfoPopup] = useState(null); // order
  const [copyToast, setCopyToast] = useState(false);

  const openConfirm = (message, onConfirm) => {
    setConfirmConfig({ message, onConfirm });
    setConfirmOpen(true);
  };

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [ctxMenu]);

  const buildOrderCopyText = (o) => {
    const pallet = getPalletSummary(o);
    return [
      `[오더정보] ${o.거래처명 || "-"}`,
      `상차 : ${o.상차지명 || "-"} / ${fmtTimeCell(o.상차시간, o.상차시간구분)}`,
      o.상차지주소 ? `주소 : ${o.상차지주소}` : null,
      `하차 : ${o.하차지명 || "-"} / ${fmtTimeCell(o.하차시간, o.하차시간구분)}`,
      o.하차지주소 ? `주소 : ${o.하차지주소}` : null,
      `화물 : ${o.화물내용 || "-"}${pallet ? ` (파렛트사: ${pallet})` : ""}`,
      `차량 : ${o.차량종류 || "-"} / ${o.차량톤수 || "-"}`,
      `청구운임 : ${o.청구운임 ? Number(o.청구운임).toLocaleString() + "원" : "-"}`,
      `지급방식 : ${o.지급방식 || "-"}`,
      o.차량번호 ? `기사 : ${o.이름 || "-"} / ${o.차량번호} / ${o.전화번호 || "-"}` : null,
    ].filter(Boolean).join("\n");
  };

  const handleCopyOrder = async (o) => {
    try {
      await navigator.clipboard.writeText(buildOrderCopyText(o));
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    } catch {
      alert("복사 실패");
    }
  };

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) setUserData(snap.data());
    });
  }, [user]);

  useEffect(() => {
    if (!user || !userData) return;

    const isMaster = userData?.permissions?.master === true || userData?.isMaster === true;
    const isSubMaster = userData?.permissions?.subMaster === true;

    let q;
    if (isMaster || isSubMaster) {
      q = query(
        collection(db, "orders"),
        where("shipperCompany", "==", userData.companyName)
      );
    } else {
      // 운송사에서 전송한 오더에는 shipperUid가 없으므로(등록자=운송사),
      // 일반/운송권한 직원도 회사 전체 오더 목록을 봐야 함(개인 등록분만 보이던 버그 수정)
      const threeMonthsAgo = get3MonthsAgo();
      q = query(
        collection(db, "orders"),
        where("shipperCompany", "==", userData.companyName),
        where("상차일", ">=", threeMonthsAgo)
      );
    }

    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 첨부 증가 감지 -> 알림
      docs.forEach((o) => {
        const cur = o.attachCount || 0;
        const prev = prevAttachRef.current[o.id] ?? null;
        if (prev !== null && cur > prev) {
          setAttachNotif({
            id: o.id,
            text: `${o.거래처명 || o.상차지명 || "오더"}에 첨부파일이 추가되었습니다.`,
            order: o,
          });
          setTimeout(() => setAttachNotif(null), 5000);
          pushToast({ type: "attach", order: o, title: "첨부파일 추가", desc: `${o.상차지명 || "-"} → ${o.하차지명 || "-"}` });
        }
        prevAttachRef.current[o.id] = cur;
      });

      // 배차완료 전환 감지 -> 알림
      docs.forEach((o) => {
        const curHasVehicle = !!(o.차량번호 && o.차량번호.trim());
        const prev = prevVehicleRef.current[o.id];
        if (prev === false && curHasVehicle) {
          setDispatchNotif({
            id: o.id,
            text: `${o.거래처명 || o.상차지명 || "오더"} 배차가 완료되었습니다. (${o.차량번호} · ${o.이름 || ""})`,
            order: o,
          });
          setTimeout(() => setDispatchNotif(prev2 => prev2?.id === o.id ? null : prev2), 6000);
          pushToast({ type: "dispatch", order: o, title: "배차완료", desc: `${o.상차지명 || "-"} → ${o.하차지명 || "-"} · ${o.차량번호} ${o.이름 || ""}` });
        }
        prevVehicleRef.current[o.id] = curHasVehicle;
      });

      setOrders(docs);
      setLoading(false);
    });

    return () => unsub();
  }, [user, userData]);

  // 운송사에서 전송받은 오더(originCol/originId 보유)는 첨부파일이 원본(운송사) 쪽 서브컬렉션에
  // 먼저 올라간 뒤 이 화면 쪽으로 미러링되는데, 예전 건들 중 미러링이 안 된 채로 남아있는
  // 경우가 있어 목록을 불러올 때마다(오더당 1회) 자동으로 양쪽을 비교해 누락분을 보정한다.
  // (첨부 뷰어를 직접 열어야만 동기화되던 방식이라 목록의 첨부 개수 표시가 실제보다 적게 보였음)
  const attachAutoSyncRef = useRef(new Set());
  useEffect(() => {
    const targets = orders.filter(o => o.originCol && o.originId && !attachAutoSyncRef.current.has(o.id));
    if (!targets.length) return;
    (async () => {
      for (const o of targets) {
        attachAutoSyncRef.current.add(o.id);
        try {
          const [localSnap, originSnap] = await Promise.all([
            getDocs(collection(db, "orders", o.id, "attachments")),
            getDocs(collection(db, o.originCol, o.originId, "attachments")),
          ]);
          const localIds = new Set(localSnap.docs.map(d => d.id));
          const originIds = new Set(originSnap.docs.map(d => d.id));
          let addedLocal = 0, addedOrigin = 0;
          for (const d of originSnap.docs) {
            if (!localIds.has(d.id)) { await setDoc(doc(db, "orders", o.id, "attachments", d.id), d.data()); addedLocal++; }
          }
          for (const d of localSnap.docs) {
            if (!originIds.has(d.id)) { await setDoc(doc(db, o.originCol, o.originId, "attachments", d.id), d.data()); addedOrigin++; }
          }
          if (addedLocal) {
            const newCount = localIds.size + addedLocal;
            prevAttachRef.current[o.id] = newCount; // 자동 보정으로 인한 "첨부파일 추가" 오알림 방지
            await updateDoc(doc(db, "orders", o.id), { attachCount: newCount });
          }
          if (addedOrigin) await updateDoc(doc(db, o.originCol, o.originId), { attachCount: originIds.size + addedOrigin });
        } catch (e) { console.warn("첨부 자동 동기화 실패(무시):", o.id, e); }
      }
    })();
  }, [orders]);

  // 알림 클릭 -> 해당 오더로 포커스 이동 + 하이라이트
  const focusOnOrder = (order) => {
    setHideCanceled(false);
    setFilter("전체");
    setKeyword("");
    const orderDate = toYMD(order.상차일);
    if (orderDate && startDate && orderDate < startDate) setStartDate(orderDate);
    if (orderDate && endDate && orderDate > endDate) setEndDate(orderDate);
    setFocusOrderId(order.id);
  };

  // ---------------- 푸시 기능 (상차 1시간 전까지 미배차/미확정 시 운송사에 푸시 알림) ----------------
  const NUDGE_COOLDOWN_MS = 5 * 60 * 1000;
  const canNudge = useCallback((o) => {
    const st = getStatus(o);
    if (st !== "요청" && st !== "배차중") return false;
    if (!o.상차일 || !o.상차시간) return false;
    const target = new Date(`${o.상차일}T${o.상차시간}:00+09:00`);
    if (isNaN(target.getTime())) return false;
    return target.getTime() - Date.now() <= 60 * 60 * 1000;
  }, []);
  const handleNudge = async (o) => {
    const lastMs = typeof o.재촉일시 === "number" ? o.재촉일시 : (o.재촉일시?.toMillis ? o.재촉일시.toMillis() : 0);
    if (o.재촉대기 && lastMs && Date.now() - lastMs < NUDGE_COOLDOWN_MS) {
      const remain = Math.ceil((NUDGE_COOLDOWN_MS - (Date.now() - lastMs)) / 60000);
      alert(`이미 푸시를 보냈습니다. ${remain}분 후 다시 시도해주세요.`);
      return;
    }
    try {
      await updateDoc(doc(db, "orders", o.id), {
        재촉대기: true,
        재촉일시: Date.now(),
        재촉횟수: increment(1),
      });
      alert("운송사에 푸시를 보냈습니다.");
    } catch {
      alert("푸시 전송에 실패했습니다.");
    }
  };

  const getStatus = useCallback((o) => {
    if (["취소", "배차취소", "오더취소", "취소됨"].includes(o.상태)) return "배차취소";
    if (o.차량번호 && o.차량번호.trim()) return "배차완료";
    if (o.화주사확인대기 === true) return "요청"; // 운송사가 아직 확인하지 않은 신규 요청
    return "배차중"; // 운송사가 확인했거나(false) 필드가 없는 레거시/전송 건은 이미 처리중으로 간주
  }, []);

  const activeOrders = orders.filter(o => o.상태 !== "취소");
  const kpi = useMemo(() => ({
    total: activeOrders.length,
    요청: activeOrders.filter(o => o.화주사확인대기 === true && !(o.차량번호 && o.차량번호.trim())).length,
    배차완료: activeOrders.filter(o => o.차량번호).length,
    취소: orders.filter(o => o.상태 === "취소").length,
    총금액: activeOrders.reduce((sum, o) => sum + (Number(o.청구운임) || 0), 0),
  }), [orders]);

  const toYMD = (d) => {
    if (!d) return "";
    if (d?.toDate) return d.toDate().toISOString().slice(0, 10);
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
  };

  const toggleSelect = (id, checked) => {
    setSelectedIds(prev => checked ? [...prev, id] : prev.filter(v => v !== id));
  };

  const deleteOrders = (targets, onDone) => {
    if (targets.length === 0) { alert("선택된 항목 없음"); return; }
    const locked = targets.filter(o => o.차량번호 && o.차량번호.trim() && !o.취소요청);
    const deletable = targets.filter(o => !(o.차량번호 && o.차량번호.trim()));

    const requestCancelForLocked = async () => {
      for (const o of locked) {
        await updateDoc(doc(db, "orders", o.id), {
          취소요청: true, 취소요청일시: serverTimestamp(), 취소요청자: user?.email || "",
        });
      }
    };
    const deleteDeletable = async () => {
      for (const o of deletable) await deleteDoc(doc(db, "orders", o.id));
    };

    if (locked.length > 0 && deletable.length === 0) {
      openConfirm(
        `선택하신 ${locked.length}건은 이미 배차완료되어 직접 삭제할 수 없습니다. 운송사에 배차취소를 요청하시겠습니까?`,
        async () => { await requestCancelForLocked(); onDone?.(); setConfirmOpen(false); }
      );
    } else if (locked.length > 0) {
      openConfirm(
        `선택하신 항목 중 ${locked.length}건은 배차완료되어 삭제할 수 없습니다. 나머지 ${deletable.length}건만 삭제하고, 배차완료건은 운송사에 배차취소를 요청하시겠습니까?`,
        async () => { await requestCancelForLocked(); await deleteDeletable(); onDone?.(); setConfirmOpen(false); }
      );
    } else {
      openConfirm("정말 삭제하시겠습니까?", async () => { await deleteDeletable(); onDone?.(); setConfirmOpen(false); });
    }
  };

  const handleDeleteSelected = () => {
    const targets = orders.filter(o => selectedIds.includes(o.id));
    deleteOrders(targets, () => setSelectedIds([]));
  };

  const handleEditSelected = () => {
    if (selectedIds.length !== 1) { alert("1개만 선택하세요"); return; }
    const target = orders.find(o => o.id === selectedIds[0]);
    if (!target) { alert("데이터 못찾음"); return; }
    setEditData(target);
    setEditOpen(true);
  };

  const handleExcelDownload = () => {
    import("xlsx").then(XLSX => {
      const data = rows.map((o, i) => ({
        순번: i + 1,
        등록일: fmtDate(o.createdAt),
        상차일: o.상차일 || "",
        상차시간: o.상차시간 || "",
        하차일: o.하차일 || "",
        거래처: o.거래처명 || "",
        상차지: o.상차지명 || "",
        하차지: o.하차지명 || "",
        화물: o.화물내용 || "",
        파렛트사: getPalletSummary(o),
        차량종류: o.차량종류 || "",
        톤수: o.차량톤수 || "",
        차량번호: o.차량번호 || "",
        기사명: o.이름 || "",
        기사전화: o.전화번호 || "",
        청구운임: o.청구운임 || "",
        지급방식: o.지급방식 || "",
        상태: getStatus(o),
        운송사: o.운송사명 || "",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "운송목록");
      XLSX.writeFile(wb, `운송목록_${startDate}_${endDate}.xlsx`);
    });
  };

  const STATUS_SORT_ORDER = { 요청: 0, 배차중: 1, 배차완료: 2, 배차취소: 3 };

  const transportOptions = useMemo(() => {
    const set = new Set();
    orders.forEach(o => { if (o.운송사명) set.add(o.운송사명); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [orders]);

  const rows = useMemo(() => {
    const filtered = orders.filter((o) => {
      if (hideCanceled && filter !== "배차취소" && o.상태 === "취소") return false;
      const currentStatus = getStatus(o);
      if (filter !== "전체" && currentStatus !== filter) return false;
      if (transportFilter !== "전체" && (o.운송사명 || "") !== transportFilter) return false;
      const orderDate = toYMD(o.상차일);
      if (startDate && orderDate && orderDate < startDate) return false;
      if (endDate && orderDate && orderDate > endDate) return false;
      if (!keyword) return true;
      const val = keyword.toLowerCase();
      switch (searchType) {
        case "운송사명": return o.운송사명?.toLowerCase().includes(val);
        case "상차지명": return o.상차지명?.toLowerCase().includes(val);
        case "차량번호": return o.차량번호?.toLowerCase().includes(val);
        case "이름": return o.기사이름?.toLowerCase().includes(val);
        default:
          return (
            o.거래처명?.toLowerCase().includes(val) ||
            o.상차지명?.toLowerCase().includes(val) ||
            o.하차지명?.toLowerCase().includes(val) ||
            o.운송사명?.toLowerCase().includes(val) ||
            o.차량번호?.toLowerCase().includes(val) ||
            o.기사이름?.toLowerCase().includes(val)
          );
      }
    });

    const toMs = (ts) => {
      if (!ts) return 0;
      if (ts?.toMillis) return ts.toMillis();
      if (ts?.seconds) return ts.seconds * 1000;
      if (typeof ts === "number") return ts;
      if (ts instanceof Date) return ts.getTime();
      return 0;
    };

    if (filter === "전체") {
      filtered.sort((a, b) => {
        const sa = STATUS_SORT_ORDER[getStatus(a)] ?? 9;
        const sb = STATUS_SORT_ORDER[getStatus(b)] ?? 9;
        if (sa !== sb) return sa - sb;
        const st = getStatus(a);
        if (st === "요청") {
          // 요청은 입력한 순서대로(오래된 요청이 먼저)
          return toMs(a.createdAt) - toMs(b.createdAt);
        }
        if (st === "배차중") {
          // 요청에서 배차중으로 전환된 순(최근 전환건이 상단)
          const ma = toMs(a.배차중전환일시) || toMs(a.createdAt);
          const mb = toMs(b.배차중전환일시) || toMs(b.createdAt);
          return mb - ma;
        }
        if (st === "배차완료") {
          // 가장 최근에 배차완료된 건이 상단
          const ma = toMs(a.배차완료일시 || a.dispatchedAt) || toMs(a.createdAt);
          const mb = toMs(b.배차완료일시 || b.dispatchedAt) || toMs(b.createdAt);
          return mb - ma;
        }
        const da = toYMD(a.상차일), db = toYMD(b.상차일);
        return db.localeCompare(da);
      });
    }
    return filtered;
  }, [orders, filter, keyword, startDate, endDate, searchType, hideCanceled, getStatus, transportFilter]);

  // 알림 클릭으로 포커스 이동 -> 해당 오더가 있는 페이지로 이동 후 스크롤 + 하이라이트
  useEffect(() => {
    if (!focusOrderId) return;
    const idx = rows.findIndex(r => r.id === focusOrderId);
    if (idx === -1) return;
    const targetPage = Math.floor(idx / pageSize) + 1;
    if (targetPage !== page) { setPage(targetPage); return; }

    let rafId, tries = 0, timeoutId;
    const run = () => {
      const el = rowRefs.current[focusOrderId];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setFlashId(focusOrderId);
        timeoutId = setTimeout(() => { setFlashId(null); setFocusOrderId(null); }, 1600);
        return;
      }
      if (tries++ < 30) rafId = requestAnimationFrame(run);
      else setFocusOrderId(null);
    };
    rafId = requestAnimationFrame(run);
    return () => { cancelAnimationFrame(rafId); clearTimeout(timeoutId); };
  }, [focusOrderId, rows, page]);

  useEffect(() => { setPage(1); }, [startDate, endDate, filter, keyword]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page]);

  const totalPages = Math.ceil(rows.length / pageSize);

  const restoreOrder = (order) => {
    openConfirm("오더를 재등록하시겠습니까?", () => {
      setDetailOpen(false);
      setEditData({ ...order, 상태: "요청", 배차상태: "배차중", 취소알림대기: false, 화주사확인대기: true });
      setEditOpen(true);
      setConfirmOpen(false);
    });
  };

  const cancelOrder = (id) => {
    openConfirm("오더를 취소하시겠습니까?", async () => {
      // 운송사 배차현황에도 즉시 반영되도록 배차상태까지 함께 취소 처리
      await updateDoc(doc(db, "orders", id), { 상태: "취소", 배차상태: "배차취소", 취소알림대기: true });
      setSelectedOrder(prev => prev?.id === id ? { ...prev, 상태: "취소", 배차상태: "배차취소" } : prev);
      setConfirmOpen(false);
    });
  };

  if (loading) {
    return <div className="py-24 text-center text-gray-400">불러오는 중...</div>;
  }

  return (
    <div className="flex min-h-screen">

      {/* 배차완료 알림 배너 */}
      {dispatchNotif && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 999999,
            background: "#1B2B4B", color: "white", textAlign: "center",
            padding: "10px 16px", fontSize: "13px", fontWeight: 600,
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            animation: "bannerDown 0.4s ease-out forwards",
          }}
          onClick={() => { focusOnOrder(dispatchNotif.order); setDispatchNotif(null); }}
          className="cursor-pointer"
        >
          <style>{`@keyframes bannerDown { from { opacity:0; transform:translateY(-100%); } to { opacity:1; transform:translateY(0); } }`}</style>
          <span style={{ display:"inline-block", width:6, height:6, borderRadius:"50%", background:"#93c5fd", marginRight:8, verticalAlign:"middle" }} />
          {dispatchNotif.text}
          <span style={{ marginLeft:12, textDecoration:"underline", opacity:0.85 }}>클릭하여 확인</span>
        </div>
      )}

      {/* 첨부 알림 배너 */}
      {attachNotif && (
        <div
          style={{
            position: "fixed", top: dispatchNotif ? 40 : 0, left: 0, right: 0, zIndex: 999998,
            background: "#059669", color: "white", textAlign: "center",
            padding: "10px 16px", fontSize: "13px", fontWeight: 600,
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            animation: "bannerDown 0.4s ease-out forwards",
          }}
          onClick={() => { setAttachViewer(attachNotif.order); setAttachNotif(null); }}
          className="cursor-pointer"
        >
          <style>{`@keyframes bannerDown { from { opacity:0; transform:translateY(-100%); } to { opacity:1; transform:translateY(0); } }`}</style>
          <span style={{ display:"inline-block", width:6, height:6, borderRadius:"50%", background:"#a7f3d0", marginRight:8, verticalAlign:"middle" }} />
          {attachNotif.text}
          <span style={{ marginLeft:12, textDecoration:"underline", opacity:0.85 }}>클릭하여 확인</span>
        </div>
      )}

      {/* 알림 토스트 카드 (우측 하단) */}
      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 999997, display: "flex", flexDirection: "column", gap: 10, width: 320 }}>
        <style>{`@keyframes toastIn { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:translateX(0); } } @keyframes cancelReqBlink { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
        {toasts.map(t => (
          <div key={t.id}
            onClick={() => {
              if (t.type === "attach") setAttachViewer(t.order);
              else focusOnOrder(t.order);
              setToasts(prev => prev.filter(x => x.id !== t.id));
            }}
            style={{
              background: "#fff", borderRadius: 14, boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
              borderLeft: `4px solid ${t.type === "dispatch" ? "#1B2B4B" : "#059669"}`,
              padding: "12px 14px", cursor: "pointer", animation: "toastIn 0.25s ease-out",
            }}
          >
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12, fontWeight: 800, color: t.type === "dispatch" ? "#1B2B4B" : "#059669" }}>
                {t.title}
              </span>
              <button onClick={(e) => { e.stopPropagation(); setToasts(prev => prev.filter(x => x.id !== t.id)); }}
                className="text-gray-300 hover:text-gray-500 text-sm leading-none">×</button>
            </div>
            <div style={{ fontSize: 13, color: "#374151", marginTop: 4, fontWeight: 600 }}>{t.desc}</div>
          </div>
        ))}
      </div>

      {/* 메인 */}
      <div className="flex-1 min-w-0 px-8 py-6 bg-[#f4f7fb] space-y-6 transition-all duration-300">

        {/* KPI */}
        <div className="grid grid-cols-5 gap-4">
          <KPI title="전체 오더" value={kpi.total} />
          <KPI title="요청" value={kpi.요청} color="text-slate-700" />
          <KPI title="배차완료" value={kpi.배차완료} color="text-emerald-600" />
          <KPI title="취소" value={kpi.취소} color="text-rose-700" />
          <KPI title="총 운송료" value={`${kpi.총금액.toLocaleString()}원`} color="text-[#1B2B4B]" />
        </div>

        <div className="bg-white rounded-xl p-4 space-y-3 shadow-sm">

          {/* 상태 필터 */}
          <div className="flex gap-2 flex-wrap items-center justify-between">
            <div className="flex gap-2 flex-wrap items-center">
              {["전체", "요청", "배차중", "배차완료", "배차취소"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                    filter === s
                      ? "bg-[#1B2B4B] text-white"
                      : "bg-[#eef1f7] text-[#1B2B4B] hover:bg-[#e2e7f2]"
                  }`}
                >
                  {s}
                </button>
              ))}
              <label className="flex items-center gap-2 text-sm ml-4">
                <input type="checkbox" checked={hideCanceled} onChange={(e) => setHideCanceled(e.target.checked)} />
                취소 오더 숨기기
              </label>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#eef1f7] text-[13px] font-bold text-[#1B2B4B]">
              <span>조회결과 {rows.length.toLocaleString()}건</span>
              <span className="text-[#c7d1e3]">|</span>
              <span>총 청구운임 {rows.reduce((sum, o) => sum + (Number(o.청구운임) || 0), 0).toLocaleString()}원</span>
            </div>
          </div>

          <div className="flex justify-between items-center flex-wrap gap-2">

            {/* 검색 영역 */}
            <div className="flex gap-2 items-center flex-wrap">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
              <span>~</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />

              <button
                onClick={() => { const t = getTodayKST(); setStartDate(t); setEndDate(t); }}
                className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
              >당일</button>

              <button
                onClick={() => {
                  const d = new Date(); d.setDate(d.getDate() + 1);
                  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
                  const tmr = kst.toISOString().slice(0, 10);
                  setStartDate(tmr); setEndDate(tmr);
                }}
                className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
              >내일</button>

              <button
                onClick={() => { setStartDate(get3MonthsAgo()); setEndDate(getTodayKST()); }}
                className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
              >3개월</button>

              <select
                value={transportFilter}
                onChange={(e) => setTransportFilter(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm font-semibold text-[#1B2B4B]"
              >
                <option value="전체">운송사 전체</option>
                {transportOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <select
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
              >
                <option>통합검색</option>
                <option>운송사명</option>
                <option>상차지명</option>
                <option>차량번호</option>
                <option>이름</option>
              </select>

              <input
                className="border rounded-lg px-4 py-2 text-sm w-64"
                placeholder="검색어 입력"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

            {/* 버튼 */}
            <div className="flex gap-2">
              <button onClick={() => navigate("/shipper/order")} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold">+ 배차등록</button>
              <button onClick={handleEditSelected} className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-semibold">선택수정</button>
              <button onClick={handleDeleteSelected} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold">선택삭제</button>
              <button onClick={handleExcelDownload} className="px-4 py-2 bg-[#1B2B4B] text-white rounded-lg text-sm font-semibold">엑셀다운</button>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="border-collapse text-[14px]" style={{ minWidth: "2730px", width: "100%" }}>
            <colgroup>
              <col style={{ width: 40 }} /><col style={{ width: 60 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} /><col style={{ width: 100 }} />
              <col style={{ width: 110 }} /><col style={{ width: 100 }} />
              <col style={{ width: 140 }} /><col style={{ width: 140 }} />
              <col style={{ width: 200 }} /><col style={{ width: 140 }} />
              <col style={{ width: 200 }} /><col style={{ width: 140 }} />
              <col style={{ width: 120 }} /><col style={{ width: 110 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 120 }} /><col style={{ width: 120 }} />
              <col style={{ width: 120 }} /><col style={{ width: 110 }} />
              <col style={{ width: 110 }} /><col style={{ width: 120 }} />
              <col style={{ width: 75 }} />
            </colgroup>
            <thead>
              <tr className="bg-[#eef3fb] text-gray-800 font-extrabold text-[13px]">
                {[
                  <input key="chk" type="checkbox"
                    checked={selectedIds.length === rows.length && rows.length > 0}
                    onChange={(e) => setSelectedIds(e.target.checked ? rows.map(o => o.id) : [])} />,
                  "순번","등록일","운송사","상차일","상차시간","하차일","하차시간","거래처","상차지","상차지주소",
                  "하차지","하차지주소","화물","파렛트사","상태","차량","톤수","차량번호","이름","전화번호",
                  "청구운임","지급방식","첨부"
                ].map((h, idx) => (
                  <th key={idx} className="px-3 py-3 text-center border-r border-gray-200 last:border-r-0 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((o, i) => {
                const st = STATUS[getStatus(o)];
                const attachCnt = o.attachCount || 0;
                const isCanceled = getStatus(o) === "배차취소";
                const rowCls = isCanceled ? "bg-red-50 text-red-600" : "text-gray-800 hover:bg-[#eef1f7] cursor-pointer";
                const tdCls = "px-3 py-3 text-center border-r border-gray-100 last:border-r-0 align-middle";
                const pickupVia = getViaList(o.경유상차목록);
                const dropVia = getViaList(o.경유하차목록);
                const isFlashing = flashId === o.id;
                return (
                  <tr key={o.id}
                    ref={(el) => { if (el) rowRefs.current[o.id] = el; }}
                    className={`border-t border-gray-100 ${rowCls} transition-shadow duration-500`}
                    style={isFlashing ? { boxShadow: "inset 0 0 0 2px #1B2B4B, 0 0 14px rgba(27,43,75,0.45)", background: "#eef1f7" } : undefined}
                    onDoubleClick={() => { setSelectedOrder(o); setDetailOpen(true); }}
                    onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, order: o }); }}>
                    <td className={tdCls}>
                      <input type="checkbox" checked={selectedIds.includes(o.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => toggleSelect(o.id, e.target.checked)} />
                    </td>
                    <td className={tdCls}>{(page - 1) * pageSize + i + 1}</td>
                    <td className={`${tdCls} text-gray-500`}>{fmtDate(o.createdAt)}</td>
                    <td className={`${tdCls} font-semibold text-gray-900`}>{o.운송사명 || "-"}</td>
                    <td className={`${tdCls} font-semibold`}>{o.상차일 || "-"}</td>
                    <td className={`${tdCls} font-semibold whitespace-nowrap`}>{fmtTimeCell(o.상차시간, o.상차시간구분)}</td>
                    <td className={`${tdCls} font-semibold`}>{o.하차일 || "-"}</td>
                    <td className={`${tdCls} font-semibold whitespace-nowrap`}>{fmtTimeCell(o.하차시간, o.하차시간구분)}</td>
                    <td className={`${tdCls} font-bold text-gray-900`}>{o.거래처명 || "-"}</td>
                    <td className={tdCls}>
                      {o.상차지명 || "-"}
                      <ShipperViaBadge count={pickupVia.length} label="상차경유지" onOpen={() => setViaPopup({ label: "상차경유지", list: pickupVia })} />
                    </td>
                    <td className={`${tdCls} text-gray-600`}>
                      {(() => {
                        const text = o.상차지주소 || "";
                        const isLong = text.length > 14;
                        return (
                          <div className="flex items-center justify-center gap-1 min-w-0">
                            <span className="whitespace-nowrap overflow-hidden text-ellipsis" style={{ maxWidth: 120 }} title={text}>
                              {isLong ? text.slice(0, 14) + "…" : (text || "-")}
                            </span>
                            {isLong && (
                              <button type="button" className="text-[11px] text-[#1B2B4B] underline shrink-0 hover:opacity-70"
                                onClick={(e) => { e.stopPropagation(); setAddrPopup(text); }}>더보기</button>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className={tdCls}>
                      {o.하차지명 || "-"}
                      <ShipperViaBadge count={dropVia.length} label="하차경유지" onOpen={() => setViaPopup({ label: "하차경유지", list: dropVia })} />
                    </td>
                    <td className={`${tdCls} text-gray-600`}>
                      {(() => {
                        const text = o.하차지주소 || "";
                        const isLong = text.length > 14;
                        return (
                          <div className="flex items-center justify-center gap-1 min-w-0">
                            <span className="whitespace-nowrap overflow-hidden text-ellipsis" style={{ maxWidth: 120 }} title={text}>
                              {isLong ? text.slice(0, 14) + "…" : (text || "-")}
                            </span>
                            {isLong && (
                              <button type="button" className="text-[11px] text-[#1B2B4B] underline shrink-0 hover:opacity-70"
                                onClick={(e) => { e.stopPropagation(); setAddrPopup(text); }}>더보기</button>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className={`${tdCls} truncate max-w-[140px]`}>{o.화물내용 || "-"}</td>
                    <td className={tdCls}>
                      {(() => {
                        const text = getPalletSummary(o);
                        if (!text) return "-";
                        const isLong = text.length > 12;
                        return (
                          <div className="flex items-center justify-center gap-1 min-w-0">
                            <span className="whitespace-nowrap overflow-hidden text-ellipsis font-semibold" style={{ maxWidth: 90 }} title={text}>
                              {isLong ? text.slice(0, 12) + "…" : text}
                            </span>
                            {isLong && (
                              <button type="button" className="text-[11px] text-[#1B2B4B] underline shrink-0 hover:opacity-70"
                                onClick={(e) => { e.stopPropagation(); setPalletPopup(text); }}>더보기</button>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className={tdCls}>
                      {o.취소요청 && getStatus(o) !== "배차취소" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[12px] font-bold whitespace-nowrap bg-orange-100 text-orange-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" style={{ animation: "cancelReqBlink 1.6s ease-in-out infinite" }} />
                          취소요청중
                        </span>
                      ) : (
                        <span className={`px-2 py-1 rounded-full text-[12px] font-bold whitespace-nowrap ${st.cls}`}
                          style={(getStatus(o) === "요청" || getStatus(o) === "배차중") ? { animation: "cancelReqBlink 1.6s ease-in-out infinite" } : {}}>{st.label}</span>
                      )}
                    </td>
                    <td className={tdCls}>{o.차량종류 || "-"}</td>
                    <td className={tdCls}>{o.차량톤수 || "-"}</td>
                    <td className={`${tdCls} font-semibold`}>{o.차량번호 || "-"}</td>
                    <td className={tdCls}>{o.이름 || "-"}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{o.전화번호 || "-"}</td>
                    <td className={`${tdCls} font-bold text-[#1B2B4B] whitespace-nowrap`}>
                      {o.청구운임 ? Number(o.청구운임).toLocaleString() + "원" : "-"}
                    </td>
                    <td className={tdCls}>{o.지급방식 || "-"}</td>
                    <td className={tdCls}>
                      {(() => {
                        const isUnseen = attachCnt > 0 && (o.attachViewedCount || 0) < attachCnt;
                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setAttachViewer(o);
                              if (isUnseen) updateDoc(doc(db, "orders", o.id), { attachViewedCount: attachCnt }).catch(() => {});
                            }}
                            className={`relative flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] font-bold border transition mx-auto ${
                              attachCnt === 0
                                ? "border-gray-200 text-gray-400 hover:bg-gray-50"
                                : isUnseen
                                  ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
                                  : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                            }`}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                            </svg>
                            {attachCnt > 0 ? attachCnt : "-"}
                            {isUnseen && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />}
                          </button>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
              {pagedRows.length === 0 && (
                <tr><td colSpan={24} className="py-16 text-center text-gray-400 text-sm">해당 조건의 데이터가 없습니다</td></tr>
              )}
            </tbody>
          </table>

          {/* 페이지네이션 */}
          <div className="flex justify-center items-center gap-4 py-6 border-t bg-white">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 bg-gray-200 rounded disabled:opacity-30">이전</button>
            <div className="text-sm font-semibold">{page} / {totalPages || 1}</div>
            <button disabled={page === totalPages || totalPages === 0} onClick={() => setPage(p => p + 1)} className="px-4 py-2 bg-gray-200 rounded disabled:opacity-30">다음</button>
          </div>
        </div>
      </div>

      {/* 상세 패널 */}
      {detailOpen && selectedOrder && (
        <div className="fixed top-0 right-0 h-full w-[720px] bg-white shadow-2xl z-50 overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className={`text-[18px] font-bold ${selectedOrder?.상태 === "취소" ? "text-rose-700" : "text-[#1B2B4B]"}`}>
              {selectedOrder?.상태 === "취소" ? "배차취소 되었습니다." : selectedOrder?.차량번호 ? "배차완료 되었습니다." : "배차 요청중입니다."}
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <div className="flex gap-2">
                <button
                  disabled={selectedOrder?.상태 === "취소"}
                  onClick={() => { setEditData(selectedOrder); setEditOpen(true); }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${selectedOrder?.상태 === "취소" ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-gray-600 text-white hover:opacity-90"}`}
                >수정</button>
                <button
                  disabled={selectedOrder?.상태 === "취소"}
                  onClick={() => cancelOrder(selectedOrder.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${selectedOrder?.상태 === "취소" ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-red-600 text-white hover:opacity-90"}`}
                >오더취소</button>
                <button
                  onClick={() => setAttachViewer(selectedOrder)}
                  className="px-4 py-2 bg-[#1B2B4B] text-white rounded-lg text-sm font-semibold hover:opacity-90"
                >
                  첨부 {selectedOrder.attachCount > 0 ? `(${selectedOrder.attachCount})` : ""}
                </button>
                {selectedOrder?.상태 === "취소" && (
                  <button onClick={() => restoreOrder(selectedOrder)} className="px-4 py-2 bg-[#1B2B4B] text-white rounded-lg text-sm font-semibold hover:opacity-90">재등록</button>
                )}
                {selectedOrder && canNudge(selectedOrder) && (
                  <button onClick={() => handleNudge(selectedOrder)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:opacity-90">푸시</button>
                )}
              </div>
              <button onClick={() => setDetailOpen(false)} className="text-gray-500 hover:text-black text-xl">×</button>
            </div>
          </div>

          {/* 상단 요약 */}
          <div className="px-5 py-4 bg-gray-50 border-b grid grid-cols-2 gap-x-6 gap-y-2 text-[14px]">
            <div><span className="text-gray-400 text-[12px]">거래처</span><div className="font-bold text-gray-900">{selectedOrder?.거래처명 || "-"}</div></div>
            <div><span className="text-gray-400 text-[12px]">등록일시</span><div className="font-semibold text-gray-700">{fmtDateTime(selectedOrder?.createdAt)}</div></div>
            <div><span className="text-gray-400 text-[12px]">상차</span><div className="font-semibold text-gray-800">{selectedOrder?.상차일} {selectedOrder?.상차시간 ? fmt12(selectedOrder.상차시간) : ""}{selectedOrder?.상차시간구분 && selectedOrder.상차시간구분 !== "정각" ? ` ${selectedOrder.상차시간구분}` : ""}</div></div>
            <div><span className="text-gray-400 text-[12px]">청구운임</span><div className="font-bold text-[#1B2B4B]">{selectedOrder?.청구운임 ? Number(selectedOrder.청구운임).toLocaleString() + "원" : "-"}</div></div>
          </div>

          <div className="p-8 space-y-8 text-[20px]">
            {/* 배차 / 기사 정보 */}
            {selectedOrder?.차량번호 ? (
              <Section title="기사 / 배차 정보">
                <div className="grid grid-cols-2 gap-x-6">
                  <Row label="기사명" value={selectedOrder?.이름 || "-"} />
                  <Row label="차량번호" value={selectedOrder?.차량번호 || "-"} />
                  <Row label="전화번호" value={selectedOrder?.전화번호 || "-"} />
                  <Row label="운송사" value={selectedOrder?.운송사명 || "-"} />
                </div>
                <div className="border-t mt-2 pt-3">
                  <Row label="배차일시" value={fmtDateTime(selectedOrder?.dispatchedAt || selectedOrder?.배차완료일시)} />
                </div>
                {selectedOrder?.전화번호 && (
                  <div className="flex gap-2 mt-3">
                    <a href={`tel:${selectedOrder.전화번호}`}
                      className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-[13px] font-bold text-center hover:opacity-90">
                      전화 연결
                    </a>
                    <a href={`sms:${selectedOrder.전화번호}`}
                      className="flex-1 py-2 bg-[#1B2B4B] text-white rounded-lg text-[13px] font-bold text-center hover:opacity-90">
                      문자 전송
                    </a>
                  </div>
                )}
              </Section>
            ) : (
              <div
                className="flex items-center gap-3 rounded-xl px-5 py-3 text-[13px] font-semibold border"
                style={{ background: "#eef1f7", borderColor: "#c7d1e3", color: "#1B2B4B", animation: "pendingPulse 2.2s ease-in-out infinite" }}
              >
                <style>{`@keyframes pendingPulse { 0%,100% { opacity:1; } 50% { opacity:0.55; } }`}</style>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#1B2B4B" }} />
                아직 배차가 완료되지 않았습니다. 배차 완료 시 기사 정보가 표시됩니다.
              </div>
            )}

            <Section title="물품정보">
              <Row label="화물" value={selectedOrder?.화물내용 || "-"} />
              <Row label="파렛트사" value={selectedOrder ? (getPalletSummary(selectedOrder) || "-") : "-"} />
              <Row label="톤수" value={selectedOrder?.차량톤수 || "-"} />
              <div className="pt-3 border-t space-y-3">
                <Row label="전달사항" value={selectedOrder?.전달사항 || "-"} />
                <Row label="요청차량" value={selectedOrder?.차량종류 || "-"} />
                <Row label="추가정보" value={selectedOrder?.추가정보 || "-"} />
                <Row label="메모" value={selectedOrder?.메모 || "-"} />
              </div>
            </Section>
            <Section title="운송내역">
              <Timeline order={selectedOrder} />
            </Section>
          </div>
        </div>
      )}

      {/* 수정 모달 */}
      {editOpen && editData && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-center items-center">
          <div className="bg-white w-[1200px] h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <div className="text-xl font-bold">오더 수정</div>
              <button onClick={() => setEditOpen(false)} className="text-gray-500 hover:text-black text-2xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ShipperOrder editData={editData} onClose={() => setEditOpen(false)} />
            </div>
          </div>
        </div>
      )}

      {/* 확인 모달 */}
      {confirmOpen && (
        <ConfirmModal
          message={confirmConfig.message}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmOpen(false)}
        />
      )}

      {/* 첨부파일 뷰어 */}
      {attachViewer && (
        <ShipperAttachmentViewer
          order={attachViewer}
          onClose={() => setAttachViewer(null)}
        />
      )}

      {/* 주소 전체보기 팝업 */}
      {addrPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]" onClick={() => setAddrPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[440px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4">
              <h3 className="text-white font-bold text-[15px]">주소 전체보기</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-[14px] text-gray-800 leading-relaxed whitespace-pre-wrap break-words">{addrPopup}</p>
            </div>
            <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex justify-end">
              <button onClick={() => setAddrPopup(null)} className="px-5 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 파렛트사 전체보기 팝업 */}
      {palletPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]" onClick={() => setPalletPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[380px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4">
              <h3 className="text-white font-bold text-[15px]">파렛트사 전체보기</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-[14px] text-gray-800 leading-relaxed whitespace-pre-wrap break-words">{palletPopup}</p>
            </div>
            <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex justify-end">
              <button onClick={() => setPalletPopup(null)} className="px-5 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 경유지 팝업 */}
      {viaPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[99999]" onClick={() => setViaPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[460px] max-h-[75vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 flex items-center justify-between bg-[#1B2B4B]">
              <h3 className="text-white font-bold text-[16px]">{viaPopup.label} ({viaPopup.list.length}곳)</h3>
              <button onClick={() => setViaPopup(null)} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
              {viaPopup.list.map((s, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                  <div className="text-[13px] font-bold text-[#1B2B4B] mb-2">{i + 1}. {s.업체명 || "-"}</div>
                  {s.주소 && <div className="text-[12px] text-gray-600 mb-1">주소: {s.주소}</div>}
                  {(s.담당자 || s.담당자번호) && (
                    <div className="text-[12px] text-gray-600 mb-1">담당자: {s.담당자 || "-"} {s.담당자번호 ? `(${s.담당자번호})` : ""}</div>
                  )}
                  {s.화물내용 && <div className="text-[12px] text-gray-600 mb-1">화물: {s.화물내용}</div>}
                  {s.메모 && <div className="text-[12px] text-gray-500">메모: {s.메모}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 우클릭 컨텍스트 메뉴 */}
      {ctxMenu && (
        <div
          className="fixed z-[999999] bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 w-48 overflow-hidden"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { setSelectedIds([ctxMenu.order.id]); setEditData(ctxMenu.order); setEditOpen(true); setCtxMenu(null); }}
            className="w-full text-left px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-[#eef1f7] hover:text-[#1B2B4B] transition"
          >
            선택수정
          </button>
          <button
            onClick={() => { deleteOrders([ctxMenu.order]); setCtxMenu(null); }}
            className="w-full text-left px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-red-50 hover:text-red-600 transition"
          >
            선택삭제
          </button>
          <button
            onClick={() => { setSelectedOrder(ctxMenu.order); setDetailOpen(true); setCtxMenu(null); }}
            className="w-full text-left px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-[#eef1f7] hover:text-[#1B2B4B] transition"
          >
            오더정보
          </button>
          <button
            onClick={() => { setDriverInfoPopup(ctxMenu.order); setCtxMenu(null); }}
            className="w-full text-left px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-[#eef1f7] hover:text-[#1B2B4B] transition"
          >
            기사정보
          </button>
          <button
            onClick={() => { handleCopyOrder(ctxMenu.order); setCtxMenu(null); }}
            className="w-full text-left px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-[#eef1f7] hover:text-[#1B2B4B] transition"
          >
            오더내용복사
          </button>
        </div>
      )}

      {/* 기사정보 팝업 */}
      {driverInfoPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]" onClick={() => setDriverInfoPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[360px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4">
              <h3 className="text-white font-bold text-[15px]">기사정보</h3>
            </div>
            <div className="px-6 py-5 space-y-2 text-[14px] text-gray-700">
              {driverInfoPopup.차량번호 ? (
                <>
                  <div><span className="text-gray-400 text-[12px] mr-2">기사명</span>{driverInfoPopup.이름 || "-"}</div>
                  <div><span className="text-gray-400 text-[12px] mr-2">차량번호</span>{driverInfoPopup.차량번호 || "-"}</div>
                  <div><span className="text-gray-400 text-[12px] mr-2">전화번호</span>{driverInfoPopup.전화번호 || "-"}</div>
                  <div><span className="text-gray-400 text-[12px] mr-2">운송사</span>{driverInfoPopup.운송사명 || "-"}</div>
                </>
              ) : (
                <div className="text-gray-400">아직 배차가 완료되지 않았습니다.</div>
              )}
            </div>
            <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex justify-end">
              <button onClick={() => setDriverInfoPopup(null)} className="px-5 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 오더내용복사 완료 토스트 */}
      {copyToast && (
        <div className="fixed bottom-20 right-5 z-[999999] bg-[#1B2B4B] text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl shadow-2xl">
          오더내용이 복사되었습니다
        </div>
      )}
    </div>
  );
}

/* 첨부파일 뷰어 컴포넌트 */
function ShipperAttachmentViewer({ order, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [copyDone, setCopyDone] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [rotations, setRotations] = useState({});

  useEffect(() => {
    if (!order?.id) return;
    const colRef = collection(db, "orders", order.id, "attachments");
    const unsub = onSnapshot(colRef, (snap) => {
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setItems(loaded);
      setRotations(prev => {
        const next = { ...prev };
        loaded.forEach(item => { if (item.rotation && !next[item.id]) next[item.id] = item.rotation; });
        return next;
      });
      setLoading(false);
    });
    return () => unsub();
  }, [order]);

  // 예전에(동기화 기능 추가 전) 올라간 첨부는 원본/전송카피 한쪽에만 있을 수 있어
  // 첨부창을 열 때 양쪽을 비교해 누락분을 한 번 보정한다.
  useEffect(() => {
    if (!order?.id || !order?.originCol || !order?.originId) return;
    const mirror = { col: order.originCol, id: order.originId };
    (async () => {
      try {
        const [localSnap, mirrorSnap] = await Promise.all([
          getDocs(collection(db, "orders", order.id, "attachments")),
          getDocs(collection(db, mirror.col, mirror.id, "attachments")),
        ]);
        const localIds = new Set(localSnap.docs.map(d => d.id));
        const mirrorIds = new Set(mirrorSnap.docs.map(d => d.id));
        let addedLocal = 0, addedMirror = 0;
        for (const d of mirrorSnap.docs) {
          if (!localIds.has(d.id)) { await setDoc(doc(db, "orders", order.id, "attachments", d.id), d.data()); addedLocal++; }
        }
        for (const d of localSnap.docs) {
          if (!mirrorIds.has(d.id)) { await setDoc(doc(db, mirror.col, mirror.id, "attachments", d.id), d.data()); addedMirror++; }
        }
        if (addedLocal) await updateDoc(doc(db, "orders", order.id), { attachCount: localIds.size + addedLocal });
        if (addedMirror) await updateDoc(doc(db, mirror.col, mirror.id), { attachCount: mirrorIds.size + addedMirror });
      } catch (e) { console.warn("첨부 동기화 보정 실패(무시):", e); }
    })();
  }, [order?.id]);

  const getRotation = (id) => rotations[id] || 0;

  const handleRotate = async (item) => {
    const newRot = (getRotation(item.id) + 90) % 360;
    setRotations(prev => ({ ...prev, [item.id]: newRot }));
    if (selected?.id === item.id) setSelected(prev => ({ ...prev, rotation: newRot }));
    try {
      await updateDoc(doc(db, "orders", order.id, "attachments", item.id), { rotation: newRot });
    } catch (e) { console.error("rotate:", e); }
  };

  const downloadRotated = (item) => {
    const rot = getRotation(item.id);
    if (!rot) { handleDownload(item); return; }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const w = img.naturalWidth, h = img.naturalHeight;
      canvas.width = rot === 90 || rot === 270 ? h : w;
      canvas.height = rot === 90 || rot === 270 ? w : h;
      const ctx = canvas.getContext("2d");
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rot * Math.PI / 180);
      ctx.drawImage(img, -w / 2, -h / 2);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/jpeg", 0.92);
      a.download = item.name || "attachment.jpg";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    img.src = item.base64 || item.url;
  };

  const handleDownloadAll = () => {
    if (!items.length) return;
    items.forEach((item, i) => setTimeout(() => downloadRotated(item), i * 400));
  };

  useEffect(() => {
    if (!selected) return;
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "c") { e.preventDefault(); handleCopy(selected, `ctrl_${selected.id}`); }
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected]);

  const handleDownload = (item) => {
    const a = document.createElement("a");
    a.href = item.base64 || item.url;
    a.download = item.name || "attachment.jpg";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleCopy = async (item, id) => {
    const src = item.base64 || item.url;
    try {
      let blob;
      if (src && src.startsWith("data:")) {
        const parts = src.split(",");
        const mime = (parts[0].match(/:(.*?);/) || [])[1] || "image/png";
        const bytes = atob(parts[1]);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        blob = new Blob([arr], { type: mime });
      } else {
        const res = await fetch(src);
        blob = await res.blob();
      }
      const type = blob.type && blob.type !== "application/octet-stream" ? blob.type : "image/png";
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
      } else {
        throw new Error("unsupported");
      }
      setCopyDone(id); setTimeout(() => setCopyDone(null), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(item.url || "");
        setCopyDone(id); setTimeout(() => setCopyDone(null), 2000);
      } catch {
        alert("복사 실패 - 이미지를 길게 눌러 복사하세요");
      }
    }
  };

  const handleUpload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    // 운송사 원본 오더로 전송된 카피라면(originCol/originId) 원본 쪽에도 동일하게 반영
    const mirror = (order.originCol && order.originId) ? { col: order.originCol, id: order.originId } : null;
    for (const file of files) {
      try {
        const reader = new FileReader();
        const base64 = await new Promise((res, rej) => {
          reader.onload = e => res(e.target.result);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        const payload = {
          url: base64,
          base64,
          name: file.name,
          size: file.size,
          sizeKB: Math.round(file.size / 1024),
          uploadedBy: auth.currentUser?.email || "shipper",
          createdAt: serverTimestamp(),
        };
        const newId = doc(collection(db, "orders", order.id, "attachments")).id;
        await setDoc(doc(db, "orders", order.id, "attachments", newId), payload);
        await updateDoc(doc(db, "orders", order.id), { attachCount: increment(1) });
        if (mirror) {
          try {
            await setDoc(doc(db, mirror.col, mirror.id, "attachments", newId), payload);
            await updateDoc(doc(db, mirror.col, mirror.id), { attachCount: increment(1) });
          } catch (e) { console.warn("첨부 동기화 실패(무시):", e); }
        }
      } catch (e) { alert("업로드 실패: " + e.message); }
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[99999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="font-bold text-[15px] text-[#1B2B4B]">
              첨부파일 <span className="text-[13px] font-normal text-gray-400">{loading ? "" : `${items.length}장`}</span>
            </div>
            <div className="text-[12px] text-gray-400 mt-0.5">
              {order.상차지명} → {order.하차지명}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className={`px-3 py-1.5 text-white text-[12px] font-bold rounded-lg hover:opacity-90 transition cursor-pointer ${uploading ? "bg-gray-400" : "bg-emerald-600"}`}>
              {uploading ? "업로드중..." : "파일 추가"}
              <input type="file" multiple accept="image/*,.pdf" className="hidden"
                disabled={uploading}
                onChange={e => handleUpload(Array.from(e.target.files))} />
            </label>
            {items.length > 1 && (
              <button
                onClick={handleDownloadAll}
                className="px-3 py-1.5 bg-[#1B2B4B] text-white text-[12px] font-bold rounded-lg hover:opacity-90 transition"
              >
                {`전체저장 (${items.length}장)`}
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 text-lg">×</button>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-[#1B2B4B] rounded-full animate-spin" />
              <span className="text-[14px]">불러오는 중...</span>
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="text-[14px] text-gray-400 font-medium">첨부파일이 없습니다</div>
              <div className="text-[12px] text-gray-300">파일 추가 버튼으로 업로드하세요</div>
            </div>
          )}
          {!loading && items.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {items.map((item) => (
                <div key={item.id} className="border border-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="aspect-[4/3] bg-gray-50 cursor-zoom-in relative group" onClick={() => setSelected(item)}>
                    <img src={item.base64 || item.url} alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-200"
                      style={{ transform: `rotate(${getRotation(item.id)}deg)` }}
                      onError={e => { e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-gray-300 text-[12px]">미리보기 없음</div>'; }} />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 text-white text-[11px] font-bold bg-black/40 px-2 py-1 rounded-full transition-opacity">확대보기</span>
                    </div>
                  </div>
                  <div className="px-3 py-2.5 bg-white">
                    <div className="text-[11px] text-gray-400 truncate mb-2">{item.name || "파일"} {item.sizeKB ? `· ${item.sizeKB}KB` : ""}</div>
                    <div className="flex gap-1.5">
                      <button onClick={() => downloadRotated(item)}
                        className="flex-1 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[11px] font-bold hover:opacity-90 transition">
                        저장
                      </button>
                      <button onClick={() => handleCopy(item, item.id)}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition border ${
                          copyDone === item.id ? "bg-emerald-500 text-white border-emerald-500" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                        }`}>
                        {copyDone === item.id ? "복사됨" : "복사"}
                      </button>
                      <button onClick={e => { e.stopPropagation(); handleRotate(item); }}
                        className="px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-[11px] font-bold hover:bg-gray-50 transition"
                        title="90도 회전">
                        ↻
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 전체화면 뷰 */}
      {selected && (
        <div className="fixed inset-0 bg-black/95 z-[999999] flex items-center justify-center" onClick={() => setSelected(null)}>
          <img src={selected.base64 || selected.url} alt="full"
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg transition-transform duration-200"
            style={{ transform: `rotate(${getRotation(selected.id)}deg)` }} />
          <button className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full text-white text-xl transition" onClick={() => setSelected(null)}>×</button>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/40 text-[12px]">Ctrl+C 로 복사 | ESC 로 닫기</div>
          <div className="absolute bottom-6 flex gap-3">
            <button className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[13px] font-bold transition"
              onClick={e => { e.stopPropagation(); handleCopy(selected, `fs_${selected.id}`); }}>
              {copyDone === `ctrl_${selected.id}` || copyDone === `fs_${selected.id}` ? "복사됨" : "복사"}
            </button>
            <button className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[13px] font-bold transition"
              onClick={e => { e.stopPropagation(); handleRotate(selected); }}>
              회전 ↻
            </button>
            <button className="px-5 py-2.5 bg-[#1B2B4B] hover:opacity-90 text-white rounded-xl text-[13px] font-bold transition"
              onClick={e => { e.stopPropagation(); downloadRotated(selected); }}>
              저장하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ title, value, color = "text-gray-900" }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className="text-base text-gray-500">{title}</div>
      <div className={`text-3xl font-bold mt-2 ${color}`}>{value}</div>
    </div>
  );
}


function Section({ title, children }) {
  return (
    <div>
      <div className="text-[21px] font-bold text-gray-800 mb-4">{title}</div>
      <div className="bg-gray-50 rounded-xl p-6">{children}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between py-2 text-[18px]">
      <div className="text-gray-500 w-[110px]">{label}</div>
      <div className="font-semibold text-gray-900 text-right flex-1">{value || "-"}</div>
    </div>
  );
}

function Timeline({ order }) {
  const isDone = order?.차량번호 && order?.차량번호.trim();
  const isCanceled = order?.상태 === "취소" || order?.상태 === "오더취소" || order?.취소여부 === true;

  const steps = [
    { title: "배차접수", company: order?.운송사명 || "돌캐", ts: order?.createdAt },
    { title: "배차중", company: order?.운송사명 || "돌캐", ts: order?.배차중전환일시 },
    { title: "배차완료", company: order?.운송사명 || "돌캐", ts: order?.dispatchedAt || order?.배차완료일시 },
    { title: "상차완료", company: order?.운송사명 || "돌캐", location: order?.상차지명 },
    { title: "운송완료", company: order?.운송사명 || "돌캐", location: order?.하차지명 },
  ];

  let currentIndex = isDone ? 2 : 1;
  if (isCanceled) currentIndex = 1;

  return (
    <div className="relative pl-16">
      {/* 연결선: 지난 구간은 네이비, 남은 구간은 회색 */}
      {steps.slice(0, -1).map((_, i) => {
        const segDone = i < currentIndex && !isCanceled;
        return (
          <div key={`seg-${i}`}
            className="absolute w-[3px]"
            style={{
              left: 20, top: `${i * 108 + 20}px`, height: "88px",
              background: segDone ? "#1B2B4B" : "#e5e7eb",
              transition: "background 0.3s",
            }}
          />
        );
      })}
      {steps.map((step, i) => {
        const isPrev = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isCancelPoint = isCanceled && i === currentIndex;
        return (
          <div key={i} className="relative mb-12">
            {(isCurrent || isCancelPoint) && (
              <div className={`absolute left-[20px] top-[6px] -translate-x-1/2 w-7 h-7 rounded-full border-[4px] bg-white z-10 animate-pulseSlow`}
                style={{ borderColor: isCancelPoint ? "#e11d48" : "#1B2B4B" }} />
            )}
            <div className="absolute left-[20px] top-[14px] -translate-x-1/2 w-3 h-3 rounded-full z-10"
              style={{ background: isCancelPoint ? "#e11d48" : isCurrent ? "#1B2B4B" : isPrev ? "#1B2B4B" : "#d1d5db" }} />
            <div className="ml-14">
              <div className="text-[20px] font-bold"
                style={{ color: isCancelPoint ? "#e11d48" : isCurrent ? "#1B2B4B" : isPrev ? "#374151" : "#9ca3af" }}>
                {isCancelPoint ? "취소 [오더취소] 배차중" : step.title}
              </div>
              {step.company && <div className="text-[16px] text-gray-700 mt-1">{step.company}</div>}
              {step.location && <div className="text-[14px] text-gray-500">{step.location}</div>}
              {step.ts && <div className="text-[14px] text-gray-400 mt-1">{step.title} 시각: {fmtDateTime(step.ts)}</div>}
            </div>
          </div>
        );
      })}
      <style>{`
        .animate-pulseSlow { animation: pulseSlow 2s infinite; }
        @keyframes pulseSlow {
          0% { transform: translateX(-50%) scale(1); opacity: 1; }
          50% { transform: translateX(-50%) scale(1.2); opacity: 0.6; }
          100% { transform: translateX(-50%) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onClose }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Enter") onConfirm && onConfirm();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onConfirm, onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center">
      <div className="bg-white w-[380px] rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center text-white font-bold text-[14px] shrink-0">!</span>
          <h3 className="text-white font-bold text-[15px]">확인이 필요합니다</h3>
        </div>
        <div className="px-6 py-5 text-[14px] text-gray-700 leading-relaxed">{message}</div>
        <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-[13px] font-semibold">취소 (ESC)</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold">확인 (ENTER)</button>
        </div>
      </div>
    </div>
  );
}
