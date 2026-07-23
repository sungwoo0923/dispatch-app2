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

// 운송사 프로그램(DispatchApp.jsx StatusBadge)과 동일한 배지 디자인 — 단색 배경 + 흰 글씨 + rounded-lg
const STATUS = {
  요청: { label: "요청", cls: "bg-amber-500 text-white" },
  배차중: { label: "배차중", cls: "bg-amber-500 text-white" },
  배차완료: { label: "배차완료", cls: "bg-[#1B2B4B] text-white" },
  배차취소: { label: "취소", cls: "bg-red-600 text-white" },
};

// 운송사 수정 팝업에서 필드명을 사람이 읽기 쉬운 라벨로 표시하기 위한 매핑
const TRANSPORT_EDIT_FIELD_LABELS = {
  청구운임: "금액", 기사운임: "기사운임", 수수료: "수수료",
  차량번호: "차량정보", 이름: "기사명", 전화번호: "기사연락처",
  상차일: "상차일자", 하차일: "하차일자", 상차시간: "상차시간", 하차시간: "하차시간",
  차량종류: "차량종류", 차량톤수: "차량톤수", 화물내용: "화물내용",
  지급방식: "지급방식", 배차방식: "배차방식", 파렛트사: "파렛트사",
  상차지명: "상차지", 하차지명: "하차지",
  상차지주소: "상차지 주소", 하차지주소: "하차지 주소",
  상차지담당자: "상차지 담당자", 하차지담당자: "하차지 담당자",
  상차지담당자번호: "상차지 담당자 연락처", 하차지담당자번호: "하차지 담당자 연락처",
  전달사항: "전달사항", 요청차량: "요청차량", 추가정보: "추가정보",
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

const get6MonthsAgo = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

// 이번 달 1일 ~ 말일 (KST 기준) — 운송목록 진입 시 기본 조회 구간
const getMonthStartKST = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-01`;
};
const getMonthEndKST = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const lastDay = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + 1, 0));
  return lastDay.toISOString().slice(0, 10);
};

// 이전 달 1일 ~ 말일 (KST 기준)
const getPrevMonthStartKST = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 10);
};
const getPrevMonthEndKST = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const lastDay = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 0));
  return lastDay.toISOString().slice(0, 10);
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
  const [keywordInput, setKeywordInput] = useState("");
  const scrollRef = useRef(null);
  const prevAttachRef = useRef({});
  const attachPendingRef = useRef({}); // { [orderId]: { delta, order, timer } } — 여러 장을 연속 업로드해도 알림 1개로 묶기 위한 디바운스 누적
  const [attachViewer, setAttachViewer] = useState(null);
  const [liveLocViewer, setLiveLocViewer] = useState(null);
  const prevVehicleRef = useRef({}); // 차량번호 "문자열" 값 저장 (배차완료/재배차완료 구분용)
  const prevWatchedFieldsRef = useRef({}); // 차량배정과 무관한 "진짜 수정" 필드 값 저장
  const prevEditStampRef = useRef({});
  const editStampFirstLoadRef = useRef(true);
  const prevEditReqRef = useRef({});
  const editReqFirstLoadRef = useRef(true);
  const prevPendingRef = useRef({});
  const pendingFirstLoadRef = useRef(true);
  const prevCancelReqRef = useRef({});
  const cancelReqFirstLoadRef = useRef(true);
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

  const [startDate, setStartDate] = useState(getMonthStartKST());
  const [endDate, setEndDate] = useState(getMonthEndKST());
  const [searchType, setSearchType] = useState("통합");
  const [transportFilter, setTransportFilter] = useState("전체");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 100;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ message: "", onConfirm: null });
  const [addrPopup, setAddrPopup] = useState(null);
  const [viaPopup, setViaPopup] = useState(null); // { label, list }
  const [palletPopup, setPalletPopup] = useState(null); // { text }
  const [transportEditPopup, setTransportEditPopup] = useState(null); // { order, entries }
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, order }
  const [driverInfoPopup, setDriverInfoPopup] = useState(null); // order
  const [copyToast, setCopyToast] = useState(false);
  const [cancelReasonPopup, setCancelReasonPopup] = useState(null); // { ids: [] }

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

  // 운송목록 조회기간 제한(기본 6개월) — 운송사 관리자/최고관리자가 companyApplications
  // 문서에 임시로 걸어둔 확장 허용(viewLimitUnlockedUntil)이 있으면 해제된다.
  const [viewLimitUntil, setViewLimitUntil] = useState(undefined); // undefined=조회전, null=제한없음(관리자해제), "YYYY-MM-DD"=해제만료일
  useEffect(() => {
    if (!userData?.companyName) return;
    getDocs(query(
      collection(db, "companyApplications"),
      where("companyName", "==", userData.companyName),
      where("status", "==", "approved"),
    )).then(snap => {
      if (snap.empty) { setViewLimitUntil(null); return; }
      setViewLimitUntil(snap.docs[0].data()?.viewLimitUnlockedUntil ?? null);
    }).catch(() => setViewLimitUntil(null));
  }, [userData?.companyName]);

  const today = getTodayKST();
  const viewLimitActive = viewLimitUntil !== null && !(viewLimitUntil && viewLimitUntil >= today);
  const minAllowedDate = viewLimitActive ? get6MonthsAgo() : undefined;

  useEffect(() => {
    if (minAllowedDate && startDate < minAllowedDate) setStartDate(minAllowedDate);
  }, [minAllowedDate]);

  const handleStartDateChange = (v) => {
    if (minAllowedDate && v < minAllowedDate) {
      setStartDate(minAllowedDate);
      alert(`조회 가능 기간은 최근 6개월까지입니다. (${minAllowedDate} 이후)\n더 이전 데이터가 필요하면 운송사 관리자에게 요청해 주세요.`);
      return;
    }
    setStartDate(v);
  };

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
      // 지급방식이 "손실"인 오더는 운송사가 화주사에게 청구하지 않고 자진 부담하기로
      // 한 건이라, 화주사 화면에는 처음부터 존재하지 않았던 것처럼 전부 제외한다
      // (운송사 자신의 화면에는 그대로 남아있어야 하므로 여기 화주사 쪽에서만 필터링).
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((o) => o.지급방식 !== "손실");

      // 첨부 증가 감지 -> 알림
      // 기사가 여러 장을 연속으로 올리면 장수만큼 onSnapshot이 여러 번 발화해 알림도 그만큼
      // 여러 개 뜨던 문제 — 짧은 시간 내 증가분을 하나로 누적했다가 한 번만 알림을 띄운다.
      docs.forEach((o) => {
        const cur = o.attachCount || 0;
        const prev = prevAttachRef.current[o.id] ?? null;
        if (prev !== null && cur > prev) {
          const added = cur - prev;
          const pending = attachPendingRef.current[o.id];
          if (pending) {
            clearTimeout(pending.timer);
            pending.delta += added;
            pending.order = o;
          } else {
            attachPendingRef.current[o.id] = { delta: added, order: o, timer: null };
          }
          const entry = attachPendingRef.current[o.id];
          entry.timer = setTimeout(() => {
            const { delta, order } = attachPendingRef.current[o.id] || {};
            delete attachPendingRef.current[o.id];
            if (!delta) return;
            pushToast({ type: "attach", order, title: "첨부파일 추가", desc: `${order.거래처명 || ""} | ${order.상차지명 || "-"} → ${order.하차지명 || "-"} · ${delta}장` });
          }, 4000);
        }
        prevAttachRef.current[o.id] = cur;
      });

      // 배차완료/재배차완료 전환 감지 -> 알림
      // (차량번호 값 자체를 저장해 최초 배정(빈값→배정)과 재배차(다른 차량으로 교체)를 구분한다.
      //  이 패스에서 감지된 오더 id는 vehicleChangedThisPass에 모아, 차량배정 자체가 유일한
      //  변경사항일 때는 아래 "운송사가 수정" 알림과 중복으로 뜨지 않도록 한다.)
      const vehicleChangedThisPass = new Set();
      docs.forEach((o) => {
        const curPlate = String(o.차량번호 || "").trim();
        const prevPlate = prevVehicleRef.current[o.id];
        if (prevPlate !== undefined) {
          if (!prevPlate && curPlate) {
            vehicleChangedThisPass.add(o.id);
            pushToast({ type: "dispatch", order: o, title: "배차완료", desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"} · ${o.차량번호} ${o.이름 || ""}` });
          } else if (prevPlate && curPlate && prevPlate !== curPlate) {
            vehicleChangedThisPass.add(o.id);
            pushToast({ type: "dispatch", order: o, title: "재배차완료", desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"} · ${o.차량번호} ${o.이름 || ""}` });
          } else if (prevPlate && !curPlate) {
            // 운송사가 배정된 차량정보를 다시 비워 배차중으로 되돌린 경우 — 단순 "수정"이 아니라
            // 재배차가 진행 중임을 알려야 한다.
            vehicleChangedThisPass.add(o.id);
            pushToast({ type: "dispatch", order: o, title: "재배차 진행중", desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"} · 기사 배정이 취소되어 재배차가 진행 중입니다` });
          }
        }
        prevVehicleRef.current[o.id] = curPlate;
      });

      // 차량배정과 무관한 실제 내용(운임/지급방식/화물/일정/상하차지 등) 변경 여부 감지 —
      // 차량배정과 동시에 이런 필드도 같이 바뀌었다면 "수정" 알림도 함께 떠야 한다.
      const WATCHED_EDIT_FIELDS = ["청구운임", "지급방식", "화물내용", "차량종류", "차량톤수", "상차일", "상차시간", "하차일", "하차시간", "상차방법", "하차방법", "상차지명", "상차지주소", "하차지명", "하차지주소"];
      const otherFieldChangedThisPass = new Set();
      docs.forEach((o) => {
        const prevFields = prevWatchedFieldsRef.current[o.id];
        if (prevFields && WATCHED_EDIT_FIELDS.some((f) => String(prevFields[f] ?? "") !== String(o[f] ?? ""))) {
          otherFieldChangedThisPass.add(o.id);
        }
        prevWatchedFieldsRef.current[o.id] = Object.fromEntries(WATCHED_EDIT_FIELDS.map((f) => [f, o[f]]));
      });

      // 배차요청 승인 감지 (화주사확인대기 true -> false, 거절 아님) -> 알림
      // 이 패스에서 승인이 감지된 오더 id는 아래 "운송사가 수정" 감지에서 제외한다.
      // (기사배정으로 승인 처리하는 단일 쓰기에 차량번호 등 필드가 함께 실려 최종수정일시가
      //  같이 갱신되는데, 이는 "수정"이 아니라 "최초 승인"이므로 수정 알림이 중복으로 뜨면 안 된다.)
      const approvedThisPass = new Set();
      if (pendingFirstLoadRef.current) {
        pendingFirstLoadRef.current = false;
        docs.forEach((o) => { prevPendingRef.current[o.id] = !!o.화주사확인대기; });
      } else {
        docs.forEach((o) => {
          const cur = !!o.화주사확인대기;
          const prev = prevPendingRef.current[o.id];
          if (prev === true && cur === false && !o.배차거절) {
            approvedThisPass.add(o.id);
            pushToast({ type: "dispatch", order: o, title: "배차요청 승인", desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"} · 배차중으로 전환됨` });
          }
          prevPendingRef.current[o.id] = cur;
        });
      }

      // 운송사가 배차정보(차량/운임)를 수정 -> 알림
      if (editStampFirstLoadRef.current) {
        editStampFirstLoadRef.current = false;
        docs.forEach((o) => { prevEditStampRef.current[o.id] = o.최종수정일시?.seconds || 0; });
      } else {
        docs.forEach((o) => {
          const cur = o.최종수정일시?.seconds || 0;
          const prev = prevEditStampRef.current[o.id];
          const vehicleOnlyChange = vehicleChangedThisPass.has(o.id) && !otherFieldChangedThisPass.has(o.id);
          if (!approvedThisPass.has(o.id) && !vehicleOnlyChange && o.최종수정출처 === "transport" && cur && prev !== undefined && cur !== prev) {
            pushToast({ type: "dispatch", order: o, title: "배차정보 수정", desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"}`, kind: "transportEdit" });
          }
          prevEditStampRef.current[o.id] = cur;
        });
      }

      // 수정요청 승인/거절 감지 -> 알림
      if (editReqFirstLoadRef.current) {
        editReqFirstLoadRef.current = false;
        docs.forEach((o) => { prevEditReqRef.current[o.id] = !!o.수정요청; });
      } else {
        docs.forEach((o) => {
          const wasPending = prevEditReqRef.current[o.id];
          if (wasPending && !o.수정요청) {
            pushToast({
              type: o.수정거절 ? "cancel" : "dispatch",
              order: o,
              title: o.수정거절 ? "수정요청 거절" : "수정요청 승인",
              desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"}`,
            });
          }
          prevEditReqRef.current[o.id] = !!o.수정요청;
        });
      }

      // 배차취소 요청 승인/거절 감지 -> 알림 (승인 시에도 문서를 즉시 삭제하지 않고
      // 상태만 "취소"로 바꾸므로, 수정요청과 동일하게 같은 문서에서 취소요청 플래그 해제를 감지한다)
      if (cancelReqFirstLoadRef.current) {
        cancelReqFirstLoadRef.current = false;
        docs.forEach((o) => { prevCancelReqRef.current[o.id] = !!o.취소요청; });
      } else {
        docs.forEach((o) => {
          const wasPending = prevCancelReqRef.current[o.id];
          if (wasPending && !o.취소요청) {
            pushToast({
              type: o.취소거절 ? "dispatch" : "cancel",
              order: o,
              title: o.취소거절 ? "배차취소 거절" : "배차취소 승인",
              desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"}`,
            });
          }
          prevCancelReqRef.current[o.id] = !!o.취소요청;
        });
      }

      setOrders(docs);
      setLoading(false);
    });

    return () => unsub();
  }, [user, userData]);

  // 상세패널을 열어둔 채로 운송사가 승인/거절 등 원격 변경을 하는 경우를 대비해
  // selectedOrder를 최신 orders 배열과 동기화한다.
  useEffect(() => {
    if (!selectedOrder) return;
    const latest = orders.find((o) => o.id === selectedOrder.id);
    if (latest) setSelectedOrder((prev) => (prev ? { ...prev, ...latest } : prev));
  }, [orders]);

  // ShipperApp.jsx(전역 알림 배너)에서 클릭 시 이 페이지로 이동하며 남겨둔
  // 대상 오더 id를 읽어와 해당 행으로 스크롤 + 하이라이트한다.
  useEffect(() => {
    if (!orders.length) return;
    let pendingId;
    try { pendingId = sessionStorage.getItem("shipperFocusOrderId"); } catch { pendingId = null; }
    if (!pendingId) return;
    const target = orders.find((o) => o.id === pendingId);
    if (target) {
      try { sessionStorage.removeItem("shipperFocusOrderId"); } catch {}
      focusOnOrder(target);
    }
  }, [orders]);

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

  // 수정현황 컬럼 — 상태(배차중/배차완료/배차취소/요청) 컬럼과 분리해, 화주사의 수정요청이
  // 지금 어느 단계인지(요청/확인/승인/거절)를 별도로 보여준다.
  const getEditStatus = (o) => {
    if (o.수정요청) return o.수정확인 ? "수정확인" : "수정요청";
    const ts = o.수정처리일시?.seconds ? o.수정처리일시.seconds * 1000 : (typeof o.수정처리일시 === "number" ? o.수정처리일시 : 0);
    const recent = ts && (Date.now() - ts) < 1000 * 60 * 60 * 48;
    if (recent && o.수정처리 === "승인") return "수정승인";
    if (recent && o.수정처리 === "거절") return "수정거절";
    return null;
  };
  const EDIT_STATUS_STYLE = {
    수정요청: "bg-sky-100 text-sky-700",
    수정확인: "bg-indigo-100 text-indigo-700",
    수정승인: "bg-emerald-100 text-emerald-700",
    수정거절: "bg-rose-100 text-rose-700",
  };

  // "운송사 수정" 뱃지 클릭 시 — 가장 최근 수정 배치(같은 저장 시점에 함께 기록된 history 항목들)만
  // 골라 변경 전/후 값을 보여준다. patchDispatch가 한 번의 저장에서 만든 history 항목들은
  // 같은 Date.now() 값(at)을 공유하므로, 가장 최근 at 근처(오차 5초 이내) 항목만 추린다.
  const openTransportEditPopup = (o) => {
    const hist = Array.isArray(o.history) ? o.history.filter(h => h && h.field) : [];
    if (hist.length === 0) { setTransportEditPopup({ order: o, entries: [] }); return; }
    const maxAt = Math.max(...hist.map(h => h.at || 0));
    const entries = hist.filter(h => Math.abs((h.at || 0) - maxAt) < 5000);
    setTransportEditPopup({ order: o, entries });
  };

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

  // "오더취소" 버튼과 동일한 규칙으로 통일: 배차 전(차량번호 없음)이면 즉시 취소(배차취소 필터로 이동),
  // 배차완료(차량번호 있음)면 사유를 입력받아 운송사 승인을 요청한다.
  // permanent=true(배차취소 필터의 "선택삭제")일 때만 실제 Firestore 문서를 영구 삭제한다.
  // 운송사에서 연동 승인된 거래처명으로 등록/전송한 오더는 화주사 화면의 문서가
  // 원본(운송사)의 "사본(mirror)"이다 — originCol/originId가 그 원본 문서를 가리킨다.
  // 화주사 쪽에서 취소/삭제하면 운송사 목록에도 똑같이 반영되도록 원본에도 함께 써준다.
  const propagateToOrigin = async (order, patch) => {
    if (!order?.originCol || !order?.originId) return;
    try { await updateDoc(doc(db, order.originCol, order.originId), patch); }
    catch (e) { console.error("원본 오더 동기화 실패:", e); }
  };
  const propagateDeleteToOrigin = async (order) => {
    if (!order?.originCol || !order?.originId) return;
    try { await deleteDoc(doc(db, order.originCol, order.originId)); }
    catch (e) { console.error("원본 오더 삭제 동기화 실패:", e); }
  };

  const deleteOrders = (targets, onDone, { permanent = false } = {}) => {
    if (targets.length === 0) { alert("선택된 항목 없음"); return; }

    if (permanent) {
      openConfirm(
        `선택하신 ${targets.length}건을 영구 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.`,
        async () => {
          for (const o of targets) {
            await deleteDoc(doc(db, "orders", o.id));
            await propagateDeleteToOrigin(o);
          }
          onDone?.(); setConfirmOpen(false);
        }
      );
      return;
    }

    const locked = targets.filter(o => o.상태 !== "취소" && o.차량번호 && o.차량번호.trim() && !o.취소요청);
    const cancelable = targets.filter(o => o.상태 !== "취소" && !(o.차량번호 && o.차량번호.trim()));

    const cancelImmediately = async () => {
      for (const o of cancelable) {
        const patch = { 상태: "취소", 배차상태: "배차취소", 취소알림대기: true };
        await updateDoc(doc(db, "orders", o.id), patch);
        await propagateToOrigin(o, patch);
      }
    };

    if (locked.length > 0 && cancelable.length === 0) {
      setCancelReasonPopup({ ids: locked.map(o => o.id), onDone });
    } else if (locked.length > 0) {
      openConfirm(
        `선택하신 항목 중 ${locked.length}건은 배차완료되어 즉시 취소할 수 없습니다. 나머지 ${cancelable.length}건은 바로 취소하고, 배차완료건은 사유를 입력해 운송사에 취소를 요청하시겠습니까?`,
        async () => {
          await cancelImmediately();
          setConfirmOpen(false);
          setCancelReasonPopup({ ids: locked.map(o => o.id), onDone });
        }
      );
    } else if (cancelable.length > 0) {
      openConfirm(`선택하신 ${cancelable.length}건을 취소하시겠습니까?`, async () => {
        await cancelImmediately();
        onDone?.();
        setConfirmOpen(false);
      });
    } else {
      onDone?.();
    }
  };

  const handleDeleteSelected = () => {
    const targets = orders.filter(o => selectedIds.includes(o.id));
    deleteOrders(targets, () => setSelectedIds([]), { permanent: filter === "배차취소" });
  };

  const openEditWithPending = (order) => {
    const merged = order?.수정요청 && order?.수정요청데이터 ? { ...order, ...order.수정요청데이터 } : order;
    setEditData(merged);
    setEditOpen(true);
  };

  const handleEditSelected = () => {
    if (selectedIds.length !== 1) { alert("1개만 선택하세요"); return; }
    const target = orders.find(o => o.id === selectedIds[0]);
    if (!target) { alert("데이터 못찾음"); return; }
    openEditWithPending(target);
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
      // 배차취소(취소) 오더는 "배차취소" 필터에서만 보이고, 다른 모든 필터(전체 포함)에서는 완전히 제외한다.
      if (filter !== "배차취소" && o.상태 === "취소") return false;
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
        // 상태(tier)가 같으면 어떤 상태든 먼저 상차일(날짜) 내림차순으로 묶고,
        // 같은 날짜 안에서만 상태별 세부 기준으로 정렬한다 (날짜가 섞여 보이지 않도록).
        const da = toYMD(a.상차일), db = toYMD(b.상차일);
        if (da !== db) return db.localeCompare(da);
        const st = getStatus(a);
        if (st === "요청") {
          // 같은 날짜 안에서는 입력한 순서대로(오래된 요청이 먼저)
          return toMs(a.createdAt) - toMs(b.createdAt);
        }
        if (st === "배차중") {
          // 같은 날짜 안에서는 요청에서 배차중으로 전환된 순(최근 전환건이 상단)
          const ma = toMs(a.배차중전환일시) || toMs(a.createdAt);
          const mb = toMs(b.배차중전환일시) || toMs(b.createdAt);
          return mb - ma;
        }
        if (st === "배차완료") {
          // 같은 날짜 안에서는 가장 최근에 배차완료된 건이 상단에 오도록 정렬한다.
          const ma = toMs(a.배차완료일시 || a.dispatchedAt) || toMs(a.createdAt);
          const mb = toMs(b.배차완료일시 || b.dispatchedAt) || toMs(b.createdAt);
          return mb - ma;
        }
        return 0;
      });
    }
    return filtered;
  }, [orders, filter, keyword, startDate, endDate, searchType, getStatus, transportFilter]);

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
    const target = orders.find(o => o.id === id) || selectedOrder;
    const isDispatched = !!(target?.차량번호 && String(target.차량번호).trim());
    if (isDispatched) {
      if (target?.취소요청) { alert("이미 배차취소를 요청했습니다.\n운송사의 승인을 기다리고 있습니다."); return; }
      setCancelReasonPopup({ ids: [id] });
      return;
    }
    openConfirm("오더를 취소하시겠습니까?", async () => {
      // 운송사 배차현황에도 즉시 반영되도록 배차상태까지 함께 취소 처리
      const patch = { 상태: "취소", 배차상태: "배차취소", 취소알림대기: true };
      await updateDoc(doc(db, "orders", id), patch);
      await propagateToOrigin(target, patch);
      setSelectedOrder(prev => prev?.id === id ? { ...prev, 상태: "취소", 배차상태: "배차취소" } : prev);
      setConfirmOpen(false);
    });
  };

  // 배차완료된 오더의 취소 요청 — 사유를 입력받아 운송사 승인 대기 상태로 전환한다.
  const submitCancelRequest = async (reason) => {
    const popup = cancelReasonPopup;
    if (!popup) return;
    for (const id of popup.ids) {
      const target = orders.find(o => o.id === id);
      const patch = {
        취소요청: true,
        취소요청일시: serverTimestamp(),
        취소요청자: user?.email || "",
        취소요청사유: reason || "",
      };
      await updateDoc(doc(db, "orders", id), patch);
      if (target) await propagateToOrigin(target, patch);
    }
    setCancelReasonPopup(null);
    popup.onDone?.();
  };

  if (loading) {
    return <div className="py-24 text-center text-gray-400">불러오는 중...</div>;
  }

  return (
    <div className="flex min-h-screen">


      {/* 알림 토스트: 이제 ShipperApp.jsx(항상 마운트된 전역 레이아웃)에서 어느 메뉴에
          있어도 뜨도록 처리한다. 이 페이지 안에서만 뜨던 기존 배너는 중복 표시를 막기
          위해 렌더링을 제거했다(감지/추적 로직 자체는 오더 목록 상태 갱신에 계속 쓰이므로 유지). */}

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
              <input type="date" value={startDate} min={minAllowedDate} onChange={(e) => handleStartDateChange(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
              <span>~</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
              {viewLimitActive && (
                <span className="text-[11px] text-gray-400">※ 최근 6개월까지 조회 가능</span>
              )}

              <button
                onClick={() => { const t = getTodayKST(); setStartDate(t); setEndDate(t); }}
                className="px-3 py-2 bg-[#eef1f7] text-[#1B2B4B] rounded-lg text-sm font-semibold hover:bg-[#e2e7f2]"
              >당일</button>

              <button
                onClick={() => {
                  const d = new Date(); d.setDate(d.getDate() + 1);
                  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
                  const tmr = kst.toISOString().slice(0, 10);
                  setStartDate(tmr); setEndDate(tmr);
                }}
                className="px-3 py-2 bg-[#eef1f7] text-[#1B2B4B] rounded-lg text-sm font-semibold hover:bg-[#e2e7f2]"
              >내일</button>

              <button
                onClick={() => { setStartDate(getMonthStartKST()); setEndDate(getMonthEndKST()); }}
                className="px-3 py-2 bg-[#eef1f7] text-[#1B2B4B] rounded-lg text-sm font-semibold hover:bg-[#e2e7f2]"
              >이번달</button>

              <button
                onClick={() => { setStartDate(getPrevMonthStartKST()); setEndDate(getPrevMonthEndKST()); }}
                className="px-3 py-2 bg-[#eef1f7] text-[#1B2B4B] rounded-lg text-sm font-semibold hover:bg-[#e2e7f2]"
              >이전달</button>

              <select
                value={transportFilter}
                onChange={(e) => setTransportFilter(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm font-semibold text-[#1B2B4B]"
              >
                <option value="전체">운송사 전체</option>
                {transportOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              {/* 통합검색: 필터 드롭다운 + 검색어 입력 + 조회 버튼을 하나의 칸으로 결합 */}
              <div className="flex items-stretch border rounded-lg overflow-hidden">
                <select
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value)}
                  className="border-r px-2 text-sm bg-gray-50 text-gray-600 font-semibold outline-none"
                >
                  <option value="통합">통합검색</option>
                  <option>운송사명</option>
                  <option>상차지명</option>
                  <option>차량번호</option>
                  <option>이름</option>
                </select>

                <input
                  className="px-3 py-2 text-sm w-56 outline-none"
                  placeholder="검색어 입력 후 Enter"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") setKeyword(keywordInput); }}
                />
                <button
                  onClick={() => setKeyword(keywordInput)}
                  className="px-4 bg-[#1B2B4B] text-white text-sm font-semibold hover:bg-[#243a60] transition shrink-0"
                >
                  조회
                </button>
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-2">
              <button onClick={() => navigate("/shipper/order")} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold">+ 배차등록</button>
              <button onClick={handleEditSelected} className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-semibold">선택수정</button>
              <button onClick={handleDeleteSelected} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold">{filter === "배차취소" ? "선택삭제" : "오더삭제"}</button>
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
              <col style={{ width: 100 }} />
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
                  "하차지","하차지주소","화물","파렛트사","상태","수정현황","차량","톤수","차량번호","이름","전화번호",
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
                      <div className="relative inline-block">
                        {o.취소요청 && getStatus(o) !== "배차취소" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[12px] font-bold whitespace-nowrap bg-orange-100 text-orange-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" style={{ animation: "cancelReqBlink 1.6s ease-in-out infinite" }} />
                            취소요청중
                          </span>
                        ) : (
                          <span className={`px-3 py-1 rounded-lg text-[13px] font-bold whitespace-nowrap ${st.cls}`}
                            style={(getStatus(o) === "요청" || getStatus(o) === "배차중") ? { animation: "cancelReqBlink 1.6s ease-in-out infinite" } : {}}>{st.label}</span>
                        )}
                        {o.최종수정출처 === "transport" && (Date.now() - (o.최종수정일시?.seconds ? o.최종수정일시.seconds * 1000 : 0)) < 1000 * 60 * 60 * 48 && (
                          <button type="button"
                            title="운송사가 오더 정보를 수정했습니다 — 클릭하여 확인"
                            onClick={(e) => { e.stopPropagation(); openTransportEditPopup(o); }}
                            className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-amber-500 border-2 border-white cursor-pointer p-0"
                            style={{ animation: "cancelReqBlink 1.6s ease-in-out infinite" }}
                          />
                        )}
                      </div>
                    </td>
                    <td className={tdCls}>
                      {(() => {
                        const es = getEditStatus(o);
                        if (!es) return "-";
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${EDIT_STATUS_STYLE[es]}`}>
                            {(es === "수정요청" || es === "수정확인") && (
                              <span className={`w-1.5 h-1.5 rounded-full ${es === "수정요청" ? "bg-sky-500" : "bg-indigo-500"}`} style={{ animation: "cancelReqBlink 1.6s ease-in-out infinite" }} />
                            )}
                            {es}
                          </span>
                        );
                      })()}
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
                <tr><td colSpan={25} className="py-16 text-center text-gray-400 text-sm">해당 조건의 데이터가 없습니다</td></tr>
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
              {selectedOrder?.상태 === "취소" ? "배차취소 되었습니다."
                : selectedOrder?.차량번호 ? "배차완료 되었습니다."
                : selectedOrder?.화주사확인대기 ? "배차 요청중입니다."
                : "배차중입니다."}
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <div className="flex gap-2">
                <button
                  disabled={selectedOrder?.상태 === "취소"}
                  onClick={() => openEditWithPending(selectedOrder)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${selectedOrder?.상태 === "취소" ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-gray-600 text-white hover:opacity-90"}`}
                >수정</button>
                {/* 배차 전이면 즉시 취소, 배차완료 후면 사유를 입력받아 운송사 승인을 요청하는
                    단일 "오더취소" 버튼으로 통일한다(cancelOrder가 두 경우를 모두 처리). */}
                {selectedOrder?.상태 !== "취소" && (
                  <button
                    onClick={() => cancelOrder(selectedOrder.id)}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:opacity-90"
                  >오더취소</button>
                )}
                <button
                  onClick={() => setAttachViewer(selectedOrder)}
                  className="px-4 py-2 bg-[#1B2B4B] text-white rounded-lg text-sm font-semibold hover:opacity-90"
                >
                  첨부 {selectedOrder.attachCount > 0 ? `(${selectedOrder.attachCount})` : ""}
                </button>
                {selectedOrder?.차량번호 && (
                  <button
                    onClick={() => setLiveLocViewer(selectedOrder)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:opacity-90"
                  >
                    실시간 위치
                  </button>
                )}
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
            {/* 상하차 정보 */}
            <Section title="상하차 정보">
              <div className="grid grid-cols-2 gap-x-6">
                <div>
                  <Row label="상차지" value={selectedOrder?.상차지명 || "-"} />
                  <Row label="상차주소" value={selectedOrder?.상차지주소 || "-"} />
                  {getViaList(selectedOrder?.경유상차목록).length > 0 && (
                    <div className="flex justify-between py-2 text-[18px]">
                      <div className="text-gray-500 w-[110px]">상차경유지</div>
                      <div className="text-right flex-1">
                        <ShipperViaBadge
                          count={getViaList(selectedOrder?.경유상차목록).length}
                          label="상차경유지"
                          onOpen={() => setViaPopup({ label: "상차경유지", list: getViaList(selectedOrder?.경유상차목록) })}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <Row label="하차지" value={selectedOrder?.하차지명 || "-"} />
                  <Row label="하차주소" value={selectedOrder?.하차지주소 || "-"} />
                  {getViaList(selectedOrder?.경유하차목록).length > 0 && (
                    <div className="flex justify-between py-2 text-[18px]">
                      <div className="text-gray-500 w-[110px]">하차경유지</div>
                      <div className="text-right flex-1">
                        <ShipperViaBadge
                          count={getViaList(selectedOrder?.경유하차목록).length}
                          label="하차경유지"
                          onOpen={() => setViaPopup({ label: "하차경유지", list: getViaList(selectedOrder?.경유하차목록) })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Section>

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
            {selectedOrder?.수정요청 && selectedOrder?.수정요청데이터 && (
              <Section title="수정요청 (운송사 승인 대기중)">
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {Object.entries(selectedOrder.수정요청데이터)
                    .filter(([k, v]) => k !== "화물목록" && String(selectedOrder[k] ?? "") !== String(v ?? ""))
                    .map(([k, v]) => (
                      <div key={k} className="flex items-start gap-2 text-[13px] pb-2 border-b border-gray-50 last:border-b-0">
                        <span className="text-gray-700">
                          <span className="font-semibold">{k}</span>: <span className="text-gray-400">{String(selectedOrder[k] ?? "없음") || "없음"}</span> → <span className="font-semibold text-sky-700">{String(v ?? "없음") || "없음"}</span>
                        </span>
                      </div>
                    ))}
                </div>
              </Section>
            )}
            {Array.isArray(selectedOrder?.history) && selectedOrder.history.length > 0 && (
              <Section title={`수정이력 (${selectedOrder.history.length})`}>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {selectedOrder.history.filter(h => h && h.field).slice().reverse().map((h, i) => (
                    <div key={i} className="flex items-start gap-2 text-[13px] pb-2 border-b border-gray-50 last:border-b-0">
                      <span className="text-gray-400 whitespace-nowrap shrink-0">{new Date(h.at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="text-gray-500 shrink-0">{h.user}</span>
                      <span className="text-gray-700"><span className="font-semibold">{h.field}</span>: <span className="text-gray-400">{String(h.before ?? "없음") || "없음"}</span> → <span className="font-semibold text-[#1B2B4B]">{String(h.after ?? "없음") || "없음"}</span></span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
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

      {/* 배차완료 오더 취소요청 사유 입력 팝업 */}
      {cancelReasonPopup && (
        <CancelReasonModal
          count={cancelReasonPopup.ids.length}
          onSubmit={submitCancelRequest}
          onClose={() => setCancelReasonPopup(null)}
        />
      )}

      {/* 첨부파일 뷰어 */}
      {attachViewer && (
        <ShipperAttachmentViewer
          order={attachViewer}
          onClose={() => setAttachViewer(null)}
        />
      )}

      {liveLocViewer && (
        <ShipperLiveLocationPopup order={liveLocViewer} onClose={() => setLiveLocViewer(null)} />
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

      {/* 운송사 수정 내역 팝업 */}
      {transportEditPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]" onClick={() => setTransportEditPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4">
              <h3 className="text-white font-bold text-[15px]">운송사 수정 내역</h3>
            </div>
            <div className="px-6 py-5 max-h-[360px] overflow-y-auto">
              {transportEditPopup.entries.length === 0 ? (
                <p className="text-[14px] text-gray-500">변경 내역을 확인할 수 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {transportEditPopup.entries.map((h, i) => (
                    <div key={i} className="text-[14px] text-gray-800 leading-relaxed pb-3 border-b border-gray-50 last:border-b-0 last:pb-0">
                      <span className="font-bold text-[#1B2B4B]">{transportEditPopup.order?.운송사명 || "운송사"}</span>에서{" "}
                      <span className="font-bold">{TRANSPORT_EDIT_FIELD_LABELS[h.field] || h.field}</span>을(를) 변경했습니다.
                      <div className="mt-1 text-[13px] text-gray-500">
                        {String(h.before ?? "없음") || "없음"} <span className="mx-1 text-gray-300">→</span>{" "}
                        <span className="font-semibold text-emerald-700">{String(h.after ?? "없음") || "없음"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex justify-end">
              <button onClick={() => setTransportEditPopup(null)} className="px-5 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition">닫기</button>
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
          {ctxMenu.order.상태 === "취소" ? (
            <button
              onClick={() => { restoreOrder(ctxMenu.order); setCtxMenu(null); }}
              className="w-full text-left px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-[#eef1f7] hover:text-[#1B2B4B] transition"
            >
              재등록
            </button>
          ) : (
            <button
              onClick={() => { setSelectedIds([ctxMenu.order.id]); openEditWithPending(ctxMenu.order); setCtxMenu(null); }}
              className="w-full text-left px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-[#eef1f7] hover:text-[#1B2B4B] transition"
            >
              선택수정
            </button>
          )}
          <button
            onClick={() => { deleteOrders([ctxMenu.order], null, { permanent: ctxMenu.order.상태 === "취소" }); setCtxMenu(null); }}
            className="w-full text-left px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-red-50 hover:text-red-600 transition"
          >
            {ctxMenu.order.상태 === "취소" ? "선택삭제" : "오더삭제"}
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

/* 기사 실시간 위치 팝업 — 운송사 UploadPage.jsx(기사 업로드 링크)에서 위치 공유를 켠
   동안 오더 문서에 기록되는 위치/위치갱신일시 필드를 지도(Tmap)에 마커로 표시한다.
   index.html에 전역 로드된 window.Tmapv2를 그대로 사용 — 별도 API 키/스크립트 불필요. */
function ShipperLiveLocationPopup({ order, onClose }) {
  const [loc, setLoc] = useState(order?.위치 || null);
  const [updatedAt, setUpdatedAt] = useState(order?.위치갱신일시 || null);
  const mapObjRef = useRef(null);
  const markerObjRef = useRef(null);
  const mapElId = "shipper-live-loc-map";

  useEffect(() => {
    if (!order?.id) return;
    // 실제 GPS 좌표는 오더 문서가 아니라, 오더 목록 리스너에 영향을 주지 않도록
    // 완전히 분리된 liveLocations 컬렉션에 기록된다(운송사 PC의 LiveLocationPopup과 동일).
    const unsub = onSnapshot(doc(db, "liveLocations", order.id), (snap) => {
      const d = snap.data();
      if (d?.위치) { setLoc(d.위치); setUpdatedAt(d.위치갱신일시 || null); }
    });
    return () => unsub();
  }, [order?.id]);

  useEffect(() => {
    if (!loc) return;
    const draw = () => {
      if (!window.Tmapv2) { setTimeout(draw, 200); return; }
      const pos = new window.Tmapv2.LatLng(loc.lat, loc.lng);
      if (!mapObjRef.current) {
        mapObjRef.current = new window.Tmapv2.Map(mapElId, { center: pos, width: "100%", height: "340px", zoom: 15 });
      } else {
        mapObjRef.current.setCenter(pos);
      }
      if (markerObjRef.current) markerObjRef.current.setMap(null);
      markerObjRef.current = new window.Tmapv2.Marker({
        position: pos,
        map: mapObjRef.current,
        iconHTML: '<div style="width:16px;height:16px;border-radius:50%;background:#10b981;border:3px solid white;box-shadow:0 0 0 2px #10b981,0 2px 6px rgba(0,0,0,0.35)"></div>',
      });
    };
    draw();
  }, [loc]);

  const updatedLabel = (() => {
    const ms = updatedAt?.seconds ? updatedAt.seconds * 1000 : (typeof updatedAt === "number" ? updatedAt : null);
    if (!ms) return null;
    return new Date(ms).toLocaleString("ko-KR", { hour12: false });
  })();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999999]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[440px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-[15px]">실시간 기사 위치</h3>
            <p className="text-white/70 text-[12px] mt-0.5">{order?.이름 || "-"} · {order?.차량번호 || "-"}</p>
          </div>
          <button className="text-white/60 hover:text-white text-xl leading-none" onClick={onClose}>×</button>
        </div>
        {loc ? (
          <>
            <div id={mapElId} style={{ width: "100%", height: 340 }} />
            <div className="px-5 py-3 text-[12px] text-gray-500 border-t border-gray-100">
              {updatedLabel ? `${updatedLabel} 기준 위치` : "위치 정보 수신 중"}
            </div>
          </>
        ) : (
          <div className="px-5 py-16 text-center text-[13px] text-gray-400">
            아직 위치 공유 정보가 없습니다.<br />
            기사님이 배차 확인 화면에서 위치 공유를 켜면 여기 표시됩니다.
          </div>
        )}
      </div>
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
    <div className="relative">
      {steps.map((step, i) => {
        const isPrev = i < currentIndex && !isCanceled;
        const isCurrent = i === currentIndex;
        const isCancelPoint = isCanceled && i === currentIndex;
        const isLast = i === steps.length - 1;
        const accent = isCancelPoint ? "#e11d48" : "#1B2B4B";

        return (
          <div key={i} className="relative flex">
            {/* 아이콘 + 연결선 (flex라 항상 정확히 중앙정렬된다) */}
            <div className="relative flex flex-col items-center shrink-0" style={{ width: 36 }}>
              <div
                className="relative z-10 flex items-center justify-center rounded-full shrink-0 transition-all duration-300"
                style={{
                  width: 30, height: 30,
                  background: isPrev ? accent : "#fff",
                  border: isCurrent ? `2.5px solid ${accent}` : isPrev ? "none" : "2px solid #e1e6ef",
                  boxShadow: isPrev
                    ? "0 2px 5px rgba(27,43,75,0.25)"
                    : isCurrent
                    ? `0 0 0 5px ${isCancelPoint ? "rgba(225,29,72,0.12)" : "rgba(27,43,75,0.1)"}`
                    : "none",
                }}
              >
                {isPrev && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                {isCurrent && (
                  <span className="rounded-full shrink-0 animate-timelinePulse" style={{ width: 10, height: 10, background: accent }} />
                )}
              </div>
              {!isLast && (
                <div
                  className="w-[2px] flex-1"
                  style={{ minHeight: 44, background: isPrev ? accent : "#e5e9f2", transition: "background 0.3s" }}
                />
              )}
            </div>

            {/* 내용 카드 — 진행중 단계만 살짝 강조해 어디까지 왔는지 한눈에 보이게 */}
            <div className={`flex-1 min-w-0 ${isLast ? "pb-1" : "pb-7"} pl-4`}>
              <div
                className="rounded-xl px-4 py-2.5 transition-all duration-300"
                style={{
                  background: isCurrent ? (isCancelPoint ? "#fef2f2" : "#f4f6fb") : "transparent",
                  border: `1px solid ${isCurrent ? (isCancelPoint ? "#fecdd3" : "#dfe4f0") : "transparent"}`,
                  marginTop: -2,
                }}
              >
                <div
                  className="font-bold text-[15px] tracking-tight"
                  style={{ color: isCancelPoint ? "#e11d48" : isCurrent ? "#1B2B4B" : isPrev ? "#334155" : "#a3adc2" }}
                >
                  {isCancelPoint ? "취소 [오더취소] 배차중" : step.title}
                </div>
                {step.company && (
                  <div className="text-[13px] mt-0.5" style={{ color: isPrev || isCurrent ? "#64748b" : "#c1c8d6" }}>
                    {step.company}
                  </div>
                )}
                {step.location && (
                  <div className="text-[12.5px]" style={{ color: isPrev || isCurrent ? "#94a3b8" : "#c1c8d6" }}>
                    {step.location}
                  </div>
                )}
                {step.ts && (
                  <div className="text-[11.5px] text-gray-400 mt-1">
                    {step.title} 시각 · {fmtDateTime(step.ts)}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes timelinePulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.5; }
        }
        .animate-timelinePulse { animation: timelinePulse 1.6s ease-in-out infinite; }
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

function CancelReasonModal({ count, onSubmit, onClose }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white w-[420px] rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-red-600 px-6 py-4">
          <h3 className="text-white font-bold text-[15px]">배차취소 요청</h3>
          <p className="text-white/70 text-[12px] mt-0.5">
            {count > 1 ? `${count}건의 배차완료 오더를 취소요청합니다.` : "배차완료된 오더를 취소요청합니다."}
            {" "}운송사 승인 후 취소됩니다.
          </p>
        </div>
        <div className="px-6 py-5">
          <label className="text-[13px] font-semibold text-gray-600 mb-1.5 block">취소 사유</label>
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="취소 사유를 입력해주세요 (선택 입력)"
            rows={4}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#1B2B4B]"
          />
        </div>
        <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-[13px] font-semibold">취소</button>
          <button onClick={() => onSubmit(reason)} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold">취소요청 보내기</button>
        </div>
      </div>
    </div>
  );
}
