// ======================= src/mobile/ShipperMobileApp.jsx =======================
import React, { useState, useEffect, useMemo, useRef } from "react";
import { signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth, db } from "../firebase";
import {
  collection, query, where, onSnapshot,
  doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs,
  orderBy, limit, arrayUnion, deleteField,
} from "firebase/firestore";
import InternalMessenger from "../InternalMessenger";
import html2canvas from "html2canvas";

// ======================================================================
// 유틸
// ======================================================================
const todayStr = () => {
  const kst = new Date(Date.now() + 9 * 3600000);
  return kst.toISOString().slice(0, 10);
};

const getDate = (offset = 0) => {
  const d = new Date(Date.now() + 9 * 3600000);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const get6MonthsAgo = () => {
  const d = new Date(Date.now() + 9 * 3600000);
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
};

const getMonthStart = (offset = 0) => {
  const d = new Date(Date.now() + 9 * 3600000);
  d.setMonth(d.getMonth() + offset, 1);
  return d.toISOString().slice(0, 10);
};

const getMonthEnd = (offset = 0) => {
  const d = new Date(Date.now() + 9 * 3600000);
  d.setMonth(d.getMonth() + offset + 1, 0);
  return d.toISOString().slice(0, 10);
};

const fmtMoney = (v) => `${Number(v || 0).toLocaleString("ko-KR")}원`;

const getViaListM = (v) => (Array.isArray(v) ? v.filter(s => s && (s.업체명 || s.주소)) : []);

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

const numberToKorean = (num) => {
  if (!num) return "영";
  const units = ["", "만", "억", "조"];
  const nums = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
  const tens = ["", "십", "백", "천"];
  let result = "";
  let n = Math.abs(Math.round(num));
  let unitIndex = 0;
  while (n > 0) {
    const chunk = n % 10000;
    if (chunk > 0) {
      let chunkStr = "";
      let c = chunk;
      for (let i = 0; i < 4; i++) {
        const digit = c % 10;
        if (digit > 0) {
          const digitStr = (digit === 1 && i > 0) ? "" : nums[digit];
          chunkStr = digitStr + tens[i] + chunkStr;
        }
        c = Math.floor(c / 10);
      }
      result = chunkStr + units[unitIndex] + result;
    }
    n = Math.floor(n / 10000);
    unitIndex++;
  }
  return result || "영";
};

const fmtDateTime = (ts) => {
  if (!ts) return "-";
  let d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
  if (!d) return String(ts).slice(0, 10);
  const kst = new Date(d.getTime() + 9 * 3600000);
  return kst.toISOString().slice(0, 16).replace("T", " ");
};

// PC(숫자 ms)와 모바일(Firestore Timestamp) 양쪽에서 기록되는 시각 필드를 모두 ms 숫자로 정규화
const toMillis = (v) => {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000 + (v.nanoseconds || 0) / 1e6;
  return 0;
};

const nowKSTStr = () => {
  const kst = new Date(Date.now() + 9 * 3600000);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const day = days[kst.getUTCDay()];
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const min = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${kst.getUTCFullYear()}.${mm}.${dd} (${day}) ${hh}:${min}`;
};

const TIME_OPTIONS = (() => {
  const list = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const h12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? "오전" : "오후";
      const label = `${ampm} ${h12}시${m > 0 ? ` ${m}분` : ""}`;
      list.push({ value, label });
    }
  }
  return list;
})();

const fmt12 = (t) => {
  if (!t) return "";
  if (t.includes("오전") || t.includes("오후")) {
    return t.replace(/:00$/, "시").replace(/:(\d{2})$/, (_, m) => `시 ${parseInt(m)}분`);
  }
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return t;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h < 12 ? "오전" : "오후"} ${h12}시${m > 0 ? ` ${m}분` : ""}`;
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

const getTransportEditEntries = (order) => {
  const hist = Array.isArray(order?.history) ? order.history.filter(h => h && h.field) : [];
  if (hist.length === 0) return [];
  const maxAt = Math.max(...hist.map(h => h.at || 0));
  return hist.filter(h => Math.abs((h.at || 0) - maxAt) < 5000);
};

const STATUS_DOT_STYLE = {
  취소: { dot: "#f87171", text: "#fecaca", ring: "rgba(248,113,113,0.4)" },
  배차완료: { dot: "#34d399", text: "#a7f3d0", ring: "rgba(52,211,153,0.4)" },
  배차요청: { dot: "#fbbf24", text: "#fde68a", ring: "rgba(251,191,36,0.4)" },
  요청보류: { dot: "#f87171", text: "#fecaca", ring: "rgba(248,113,113,0.4)" },
  배차중: { dot: "#60a5fa", text: "#bfdbfe", ring: "rgba(96,165,250,0.4)" },
  취소요청: { dot: "#f87171", text: "#fecaca", ring: "rgba(248,113,113,0.4)" },
  재배차요청: { dot: "#fb923c", text: "#fed7aa", ring: "rgba(251,146,60,0.4)" },
};

// 배차완료 이후 화주사가 걸어둔 요청(오더취소/기사변경)이 아직 운송사 승인 대기중일 때는
// "배차완료"가 아니라 요청 상태를 실시간으로 뱃지에 그대로 보여준다.
const getStatusBadge = (o) => {
  let label = "배차중";
  let blink = false;
  if (["취소", "배차취소", "오더취소"].includes(o.상태)) label = "취소";
  else if (o.취소요청 === true) { label = "취소요청"; blink = true; }
  else if (o.기사취소요청 === true) { label = "재배차요청"; blink = true; }
  else if (o.차량번호) label = "배차완료";
  else if (o.배차거절) label = "요청보류";
  else if (o.화주사확인대기) { label = "배차요청"; blink = true; }
  else { label = "배차중"; blink = true; }
  const s = STATUS_DOT_STYLE[label];
  return { label, blink, ...s };
};

// 목록 정렬 우선순위: 배차요청(+요청보류) -> 배차중 -> 배차완료(+취소/기사변경요청중) -> 취소.
// 운송사 프로그램의 배차현황과 동일하게, 상태 단계별로 먼저 묶고 그 안에서 날짜순 정렬한다.
const ORDER_SORT_TIER = { 배차요청: 0, 요청보류: 0, 배차중: 1, 배차완료: 2, 취소요청: 2, 재배차요청: 2, 취소: 3 };
const getOrderSortTier = (o) => ORDER_SORT_TIER[getStatusBadge(o).label] ?? 1;
// 배차완료 단계에서는 "방금 배차완료된" 오더가 가장 위로 오도록 배차완료일시 기준으로 정렬한다
// (없으면 상차일로 대체 — 과거 데이터 호환).
const getOrderSortTime = (o) => {
  if (getOrderSortTier(o) === 2) {
    return toMillis(o.배차완료일시) || toMillis(o.updatedAt) || 0;
  }
  return 0;
};

function StatusBadge({ order, className = "" }) {
  const { label, blink, dot, text, ring } = getStatusBadge(order);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide whitespace-nowrap ${className}`}
      style={{
        background: "linear-gradient(135deg,#1e3a5f,#0f2035)",
        color: text,
        border: `1px solid ${ring}`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{
          background: dot,
          boxShadow: `0 0 4px ${dot}`,
          animation: blink ? "dotPulse 1.4s ease-in-out infinite" : "none",
        }}
      />
      {label}
    </span>
  );
}

// 수정요청이 대기중인 오더를 다시 수정폼에 불러올 때는 아직 승인되지 않은
// 요청내용을 기준으로 편집을 이어가도록 병합한다.
const withPendingEdit = (order) => (order?.수정요청 && order?.수정요청데이터 ? { ...order, ...order.수정요청데이터 } : order);

// 운송사가 연동 승인된 거래처명으로 등록/전송한 오더는 화주사가 보는 문서가 원본(운송사)의
// "사본(mirror)"이다 — originCol/originId가 그 원본 문서를 가리킨다. 화주사 쪽에서
// 취소/삭제하면 운송사 목록에도 똑같이 반영되도록 원본에도 함께 써준다.
async function propagateToOrigin(order, patch) {
  if (!order?.originCol || !order?.originId) return;
  try { await updateDoc(doc(db, order.originCol, order.originId), patch); }
  catch (e) { console.error("원본 오더 동기화 실패:", e); }
}
async function propagateDeleteToOrigin(order) {
  if (!order?.originCol || !order?.originId) return;
  try { await deleteDoc(doc(db, order.originCol, order.originId)); }
  catch (e) { console.error("원본 오더 삭제 동기화 실패:", e); }
}

// 오더 삭제 / 배차취소요청 (PC ShipperStatus.jsx의 deleteOrders와 동일한 규칙)
// 배차 전(차량번호 없음) -> 즉시 삭제 / 배차완료 후 -> 취소요청 플래그만 설정, 운송사 승인 후 삭제
async function shipperDeleteOrRequestCancel(order, user) {
  const isDispatched = !!(order.차량번호 && String(order.차량번호).trim());
  if (isDispatched) {
    if (order.취소요청) {
      alert("이미 배차취소를 요청했습니다.\n운송사의 승인을 기다리고 있습니다.");
      return false;
    }
    if (!window.confirm("이미 배차완료된 오더입니다.\n배차취소를 요청하시겠습니까?\n(운송사 승인 후 삭제됩니다)")) return false;
    const patch = { 취소요청: true, 취소요청일시: serverTimestamp(), 취소요청자: user?.email || "" };
    await updateDoc(doc(db, "orders", order.id), patch);
    await propagateToOrigin(order, patch);
    return true;
  }
  if (!window.confirm("이 오더를 삭제하시겠습니까?\n삭제 후 복구가 불가능합니다.")) return false;
  await deleteDoc(doc(db, "orders", order.id));
  await propagateDeleteToOrigin(order);
  return true;
}

// 기사변경(재배차) 요청 — 오더 자체는 유지한 채 배정된 기사만 취소해달라고 요청한다.
// 배차취소요청(오더 자체 취소)과 달리 운송사가 승인하면 기사 정보만 초기화되고 오더는 남는다.
async function shipperRequestDriverSwap(order, user) {
  if (order.기사취소요청) {
    alert("이미 기사변경을 요청했습니다.\n운송사의 승인을 기다리고 있습니다.");
    return false;
  }
  if (!window.confirm(`배정된 기사(${order.이름 || order.차량번호 || "-"})를 취소하고 다시 배차해달라고 요청하시겠습니까?`)) return false;
  await updateDoc(doc(db, "orders", order.id), {
    기사취소요청: true, 기사취소요청일시: serverTimestamp(), 기사취소요청자: user?.email || "",
  });
  return true;
}

// 수정이력 뷰어 (운송사 앱/PC와 동일한 history 배열 포맷을 사용)
function HistoryViewerModal({ history = [], onClose }) {
  const items = [...history].filter(h => h && h.field).reverse();
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-t-3xl max-h-[75vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="px-4 pb-2 flex items-center justify-between shrink-0">
          <div className="font-bold text-[15px] text-gray-800">수정이력</div>
          <button onClick={onClose} className="text-gray-400 text-lg">×</button>
        </div>
        <div className="px-4 pb-6 overflow-y-auto space-y-2">
          {items.length === 0 && <div className="text-center text-gray-400 text-sm py-8">수정이력이 없습니다.</div>}
          {items.map((h, i) => (
            <div key={i} className="border-b border-gray-100 pb-2 last:border-b-0">
              <div className="flex items-center gap-2 text-[11px] text-gray-400 mb-0.5">
                <span>{new Date(h.at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                <span>{h.user}</span>
              </div>
              <div className="text-[13px] text-gray-700">
                <span className="font-bold">{h.field}</span>: <span className="text-gray-400">{String(h.before ?? "없음") || "없음"}</span> → <span className="font-bold text-[#1e3a5f]">{String(h.after ?? "없음") || "없음"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 운송사가 배차요청을 거절한 "요청보류" 오더에 대한 화주사측 조치 (재요청 / 삭제)
function RequestHoldActions({ order, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const reRequest = async (e) => {
    e?.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "orders", order.id), { 화주사확인대기: true, 배차거절: false, 재요청일시: serverTimestamp() });
    } catch {}
    setBusy(false);
  };
  const removeOrder = async (e) => {
    e?.stopPropagation();
    if (busy) return;
    if (!window.confirm("이 오더를 삭제하시겠습니까?\n삭제 후 복구가 불가능합니다.")) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, "orders", order.id));
      onDeleted?.();
    } catch {}
    setBusy(false);
  };
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 flex items-center justify-between gap-2">
      <div className="text-[12px] text-red-600 font-semibold leading-snug flex-1">
        운송사가 배차요청을 거절했습니다.<br />재요청하거나 삭제해주세요.
      </div>
      <div className="flex gap-1.5 shrink-0">
        <button disabled={busy} onClick={removeOrder} className="px-2.5 py-1.5 rounded-lg border border-red-300 text-red-500 text-[11px] font-bold">삭제</button>
        <button disabled={busy} onClick={reRequest} className="px-2.5 py-1.5 rounded-lg text-white text-[11px] font-bold" style={{ background: "#1e3a5f" }}>재요청</button>
      </div>
    </div>
  );
}

const parseTonnage = (val = "") => {
  if (!val) return { num: "", unit: "톤" };
  const kg = val.match(/^([\d.]+)\s*kg$/i);
  if (kg) return { num: kg[1], unit: "kg" };
  const ton = val.match(/^([\d.]*)\s*톤?$/);
  if (ton) return { num: ton[1].replace("톤", ""), unit: "톤" };
  return { num: val, unit: "없음" };
};

const 차량종류목록 = ["라보/다마스", "카고", "윙바디", "탑차", "냉장탑", "냉동탑", "냉장윙", "냉동윙", "냉장/냉동탑", "냉장/냉동윙", "오토바이"];
const 화물단위목록 = ["파레트", "박스", "없음", "개"];
const 톤수단위목록 = ["톤", "kg", "없음"];
const NAVY = "#1e3a5f";
const EMPTY_FORM = () => ({
  운송사명: "", 운송사코드: "",
  상차지명: "", 상차지주소: "", 상차지담당자: "", 상차지담당자번호: "",
  하차지명: "", 하차지주소: "", 하차지담당자: "", 하차지담당자번호: "",
  상차일: getDate(0), 상차시간: "08:00", 상차시간구분: "이후",
  하차일: getDate(0), 하차시간: "12:00", 하차시간구분: "이후",
  차량종류: "", 톤수값: "", 톤수단위: "톤",
  상차방법: "", 하차방법: "", 지급방식: "",
  독차: true, 혼적: false, 긴급: false,
});
const EMPTY_CARGO_ROW = () => ({ qty: "", unit: "파레트", palletCo: "" });

// 수정이력 추적 대상 필드 (운송사 앱/PC와 동일 포맷의 history 배열을 공유한다)
const HISTORY_TRACKED_FIELDS = [
  "상차지명", "상차지주소", "상차지담당자", "상차지담당자번호",
  "하차지명", "하차지주소", "하차지담당자", "하차지담당자번호",
  "차량종류", "톤수", "차량톤수", "화물내용",
  "상차방법", "하차방법", "지급방식", "배차방식",
  "상차일", "상차시간", "하차일", "하차시간",
];
function buildHistoryEntries(prev, next, userEmail) {
  const entries = [];
  HISTORY_TRACKED_FIELDS.forEach((f) => {
    if (!(f in (next || {}))) return;
    const before = prev?.[f] ?? "";
    const after = next?.[f] ?? "";
    if (String(before) !== String(after)) {
      entries.push({ at: Date.now(), user: userEmail || "unknown", field: f, before, after });
    }
  });
  return entries;
}

// ======================================================================
// 메인
// ======================================================================
export default function ShipperMobileApp() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [editOrderData, setEditOrderData] = useState(null);
  const [toast, setToast] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [menuTime, setMenuTime] = useState(nowKSTStr());
  const [showMessenger, setShowMessenger] = useState(false);
  const [messengerUnread, setMessengerUnread] = useState(0);
  const [uiScale, setUiScale] = useState(() => Number(localStorage.getItem("shipperUiScale") || 1));

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [orderCancelledNotice, setOrderCancelledNotice] = useState(false);

  // 상세화면을 열어둔 채로 운송사가 승인/거절 등 원격 변경을 하는 경우를 대비해
  // selectedOrder를 최신 orders 배열과 동기화한다. 운송사가 오더취소요청을
  // 승인해 오더 자체가 삭제된 경우(=orders에서 사라짐)에는 실시간으로 팝업을
  // 띄우고 확인 시 목록으로 돌려보낸다.
  useEffect(() => {
    if (!selectedOrder || !ordersLoaded) return;
    const latest = orders.find((o) => o.id === selectedOrder.id);
    if (latest) {
      setSelectedOrder((prev) => (prev ? { ...prev, ...latest } : prev));
    } else if (page === "detail") {
      setOrderCancelledNotice(true);
    }
  }, [orders, ordersLoaded, page]);

  const isMaster = userData?.permissions?.master === true || userData?.isMaster === true;
  const isSubMaster = userData?.permissions?.subMaster === true;
  const canViewSettlement = isMaster || isSubMaster || userData?.permissions?.settlement === true;

  useEffect(() => {
    const t = setInterval(() => setMenuTime(nowKSTStr()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) { window.location.replace("/shipper-login"); return; }
      setUser(u);
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) setUserData(snap.data());
    });
    return () => unsub();
  }, []);

  // 운송목록 조회기간 제한(기본 6개월) — PC와 동일하게 companyApplications 문서의
  // viewLimitUnlockedUntil로 운송사 관리자/최고관리자가 임시 해제할 수 있다.
  const [viewLimitUntil, setViewLimitUntil] = useState(undefined);
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
  const todayStr2 = todayStr();
  const viewLimitActive = viewLimitUntil !== null && !(viewLimitUntil && viewLimitUntil >= todayStr2);
  const minAllowedDate = viewLimitActive ? get6MonthsAgo() : undefined;

  useEffect(() => {
    if (!user || !userData) return;
    const q = query(collection(db, "orders"), where("shipperCompany", "==", userData.companyName));
    const unsub = onSnapshot(q, (snap) => {
      // 지급방식이 "손실"인 오더는 운송사가 화주사에게 청구하지 않고 자진 부담하는
      // 건이라 화주사 화면에는 아예 없었던 것처럼 제외한다 (운송사 화면엔 그대로 유지).
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((o) => o.지급방식 !== "손실");
      setOrders(docs);
      setOrdersLoaded(true);
    });
    return () => unsub();
  }, [user, userData]);

  // 배차완료 / 재배차 / 기사취소 등 상단 알림 배너 — PC 화주사 프로그램과 동일한
  // 카드형 토스트 스타일 + 동일한 문구/구분 로직(배차완료 vs 재배차완료 vs 재배차 진행중)
  const [dispatchNotifs, setDispatchNotifs] = useState([]); // [{ id, type, title, desc }]
  const notifIdRef = useRef(0);
  const pushNotif = (n) => {
    const id = ++notifIdRef.current;
    setDispatchNotifs((prev) => [...prev, { ...n, id }].slice(-4));
    setTimeout(() => setDispatchNotifs((prev) => prev.filter((x) => x.id !== id)), 7000);
  };

  // 차량번호 "문자열" 값 자체를 저장해 최초 배정(빈값→배정)과 재배차(다른 차량으로 교체),
  // 기사취소로 인한 재배차 진행중(배정값→빈값)을 PC와 동일하게 구분한다.
  const prevVehicleRef = useRef({});
  const vehicleFirstLoadRef = useRef(true);
  useEffect(() => {
    if (!orders.length) return;
    if (vehicleFirstLoadRef.current) {
      vehicleFirstLoadRef.current = false;
      orders.forEach((o) => { prevVehicleRef.current[o.id] = String(o.차량번호 || "").trim(); });
      return;
    }
    orders.forEach((o) => {
      const curPlate = String(o.차량번호 || "").trim();
      const prevPlate = prevVehicleRef.current[o.id];
      if (prevPlate !== undefined) {
        if (!prevPlate && curPlate) {
          pushNotif({ type: "dispatch", title: "배차완료", desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"} · ${o.차량번호} ${o.이름 || ""}` });
        } else if (prevPlate && curPlate && prevPlate !== curPlate) {
          pushNotif({ type: "dispatch", title: "재배차완료", desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"} · ${o.차량번호} ${o.이름 || ""}` });
        } else if (prevPlate && !curPlate) {
          pushNotif({ type: "dispatch", title: "재배차 진행중", desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"} · 기사 배정이 취소되어 재배차가 진행 중입니다` });
        }
      }
      prevVehicleRef.current[o.id] = curPlate;
    });
  }, [orders]);

  // 운송사가 배차요청을 거절 -> "요청보류" 전환 감지 (상단 알림 배너)
  const prevRejectRef = useRef({});
  const rejectFirstLoadRef = useRef(true);
  useEffect(() => {
    if (!orders.length) return;
    if (rejectFirstLoadRef.current) {
      rejectFirstLoadRef.current = false;
      orders.forEach((o) => { prevRejectRef.current[o.id] = o.배차거절 === true; });
      return;
    }
    orders.forEach((o) => {
      const cur = o.배차거절 === true;
      const prev = prevRejectRef.current[o.id];
      if (prev === false && cur === true) {
        pushNotif({ type: "cancel", title: "배차요청 거절", desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"} · 재요청하거나 삭제해주세요` });
      }
      prevRejectRef.current[o.id] = cur;
    });
  }, [orders]);

  // 운송사가 배차요청을 승인 -> "배차중" 전환 감지 (상단 알림 배너)
  const prevPendingRef = useRef({});
  const pendingFirstLoadRef = useRef(true);
  useEffect(() => {
    if (!orders.length) return;
    if (pendingFirstLoadRef.current) {
      pendingFirstLoadRef.current = false;
      orders.forEach((o) => { prevPendingRef.current[o.id] = o.화주사확인대기 === true; });
      return;
    }
    orders.forEach((o) => {
      const cur = o.화주사확인대기 === true;
      const prev = prevPendingRef.current[o.id];
      if (prev === true && cur === false && !o.배차거절) {
        pushNotif({ type: "dispatch", title: "배차요청 승인", desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"} · 배차중으로 전환됨` });
      }
      prevPendingRef.current[o.id] = cur;
    });
  }, [orders]);

  // 운송사가 배차정보(차량/기사/운임)를 수정 -> 상단 알림 배너
  const prevEditStampRef = useRef({});
  const editStampFirstLoadRef = useRef(true);
  useEffect(() => {
    if (!orders.length) return;
    if (editStampFirstLoadRef.current) {
      editStampFirstLoadRef.current = false;
      orders.forEach((o) => { prevEditStampRef.current[o.id] = o.최종수정일시?.seconds || 0; });
      return;
    }
    orders.forEach((o) => {
      const cur = o.최종수정일시?.seconds || 0;
      const prev = prevEditStampRef.current[o.id];
      if (o.최종수정출처 === "transport" && cur && prev !== undefined && cur !== prev) {
        pushNotif({ type: "shipperEdit", title: "배차정보 수정", desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"}` });
      }
      prevEditStampRef.current[o.id] = cur;
    });
  }, [orders]);

  // 화주사의 수정요청을 운송사가 승인/거절 -> 상단 알림 배너
  const prevEditReqRef = useRef({});
  const editReqFirstLoadRef = useRef(true);
  useEffect(() => {
    if (!orders.length) return;
    if (editReqFirstLoadRef.current) {
      editReqFirstLoadRef.current = false;
      orders.forEach((o) => { prevEditReqRef.current[o.id] = !!o.수정요청; });
      return;
    }
    orders.forEach((o) => {
      const cur = !!o.수정요청;
      const prev = prevEditReqRef.current[o.id];
      if (prev === true && cur === false) {
        pushNotif({
          type: o.수정거절 ? "cancel" : "dispatch",
          title: o.수정거절 ? "수정요청 거절" : "수정요청 승인",
          desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"}`,
        });
      }
      prevEditReqRef.current[o.id] = cur;
    });
  }, [orders]);

  const kpi = useMemo(() => ({
    total: orders.length,
    배차중: orders.filter((o) => !o.차량번호 && o.상태 !== "취소").length,
    완료: orders.filter((o) => !!o.차량번호).length,
    today: orders.filter((o) => String(o.상차일 || "").slice(0, 10) === todayStr()).length,
  }), [orders]);

  const logout = async () => {
    if (!window.confirm("로그아웃 하시겠습니까?")) return;
    await signOut(auth);
    window.location.replace("/shipper-login");
  };

  const navTo = (p) => { setPage(p); setShowMenu(false); };

  if (!user || !userData) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="text-gray-400 text-sm">권한 확인 중...</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col relative">
      <style>{`@keyframes dotPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(0.8); } }`}</style>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg text-sm">
          {toast}
        </div>
      )}

      {orderCancelledNotice && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 px-6">
          <div className="bg-white rounded-2xl w-full max-w-xs p-5 shadow-xl text-center">
            <div className="text-[15px] font-bold text-gray-800 mb-2">오더 취소</div>
            <div className="text-[13px] text-gray-500 mb-4 leading-relaxed">
              운송사가 오더취소 요청을 승인하여<br />오더가 취소되었습니다.
            </div>
            <button
              onClick={() => { setOrderCancelledNotice(false); setSelectedOrder(null); setPage("history"); }}
              className="w-full py-2.5 rounded-xl text-white text-[14px] font-semibold"
              style={{ background: NAVY }}
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 배차완료/재배차/수정 등 실시간 알림 — PC 화주사 프로그램과 동일한 카드형 토스트 스타일 */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9998] space-y-2 px-3" style={{ width: "min(480px, 94vw)" }}>
        <style>{`
          @keyframes shipperMNotifSlideDown { 0% { opacity:0; transform:translateY(-100%); } 100% { opacity:1; transform:translateY(0); } }
          .shipper-m-notif-enter { animation: shipperMNotifSlideDown 0.3s ease-out forwards; }
        `}</style>
        {dispatchNotifs.map((t) => (
          <div
            key={t.id}
            className="shipper-m-notif-enter cursor-pointer rounded-2xl shadow-2xl border overflow-hidden"
            style={{
              background: t.type === "cancel"
                ? "linear-gradient(135deg, #991b1b 0%, #ef4444 100%)"
                : t.type === "shipperEdit"
                ? "linear-gradient(135deg, #3b5998 0%, #0f2151 100%)"
                : "linear-gradient(135deg, #1B2B4B 0%, #2d4a7a 100%)",
            }}
            onClick={() => setDispatchNotifs((prev) => prev.filter((x) => x.id !== t.id))}
          >
            <div className="flex items-start gap-2.5 px-3.5 py-3">
              <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0 mt-0.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {t.type === "cancel" ? (
                    <><circle cx="12" cy="12" r="9"/><line x1="7" y1="7" x2="17" y2="17"/></>
                  ) : t.type === "shipperEdit" ? (
                    <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></>
                  ) : (
                    <><rect x="1" y="7" width="14" height="11" rx="1.5"/><path d="M15 11h4l3 3.5V18h-7z"/><circle cx="6.5" cy="19.5" r="1.8"/><circle cx="17" cy="19.5" r="1.8"/></>
                  )}
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-[13px] font-bold leading-snug">{t.title}</div>
                <div className="text-white/80 text-[11px] mt-0.5 leading-relaxed break-words">{t.desc}</div>
              </div>
              <button
                className="text-white/40 text-[16px] leading-none shrink-0 mt-0.5 px-1"
                onClick={(e) => { e.stopPropagation(); setDispatchNotifs((prev) => prev.filter((x) => x.id !== t.id)); }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 사이드 메뉴 */}
      {showMenu && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMenu(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-xl flex flex-col">
            <div className="px-4 py-4 border-b" style={{ background: NAVY }}>
              <div className="text-white font-bold text-base mb-1">KP-Flow 화주</div>
              <div className="text-blue-200 text-xs">{menuTime}</div>
            </div>
            <div className="flex-1 px-4 py-3 space-y-1 overflow-y-auto">
              <div className="text-xs text-gray-400 font-semibold px-2 py-1 mt-1">메뉴</div>
              <MMenuItem label="홈" active={page === "home"} onClick={() => navTo("home")} />
              <MMenuItem label="배차요청" active={page === "order"} onClick={() => navTo("order")} />
              <MMenuItem label="운송내역" active={page === "history"} onClick={() => navTo("history")} />
              {canViewSettlement && (
                <MMenuItem label="정산" active={page === "settlement"} onClick={() => navTo("settlement")} />
              )}
              <div className="text-xs text-gray-400 font-semibold px-2 py-1 mt-2">정보</div>
              <MMenuItem label="공지사항" active={page === "notice"} onClick={() => navTo("notice")} />
              <MMenuItem label="문의사항" active={page === "inquiry"} onClick={() => navTo("inquiry")} />
              <MMenuItem label="마이페이지" active={page === "mypage"} onClick={() => navTo("mypage")} />
              <MMenuItem label="설정" active={page === "settings"} onClick={() => navTo("settings")} />
            </div>
            <div className="border-t px-4 py-3">
              <div className="text-xs text-gray-400 mb-0.5">{userData.companyName}</div>
              <div className="text-sm text-gray-600 mb-3">{user.email}</div>
              <button onClick={logout} className="w-full py-2 bg-red-500 text-white rounded-lg text-sm font-semibold">
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 sticky top-0 z-30" style={{ background: NAVY }}>
        <button onClick={() => setShowMenu(true)} className="text-white text-sm font-semibold">MENU</button>
        <div className="text-white font-bold text-base">KP-Flow 화주</div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowMessenger(true)} className="relative text-white/90">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {messengerUnread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                {messengerUnread > 99 ? "99+" : messengerUnread}
              </span>
            )}
          </button>
          <button onClick={() => navTo("mypage")} className="text-white text-xs opacity-80">
            {userData.name || user.email?.split("@")[0]}
          </button>
        </div>
      </div>

      {/* 사내 메신저 */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99990, background: "#fff", display: "flex", flexDirection: "column", overflow: "hidden", visibility: showMessenger ? "visible" : "hidden", pointerEvents: showMessenger ? "auto" : "none" }}>
        <InternalMessenger
          user={user}
          userCompany={userData.companyName}
          linkedCompanyName={userData?.linkedTransportCompany?.companyName || ""}
          mobileMode={true}
          mobileVisible={showMessenger}
          onClose={() => setShowMessenger(false)}
          onUnreadChange={setMessengerUnread}
          themeColor="#1B2B4B"
          excludeRoles={["driver", "viewer"]}
        />
      </div>

      {/* 페이지 */}
      <div className="flex-1 overflow-y-auto pb-24" style={{ fontSize: uiScale === 1 ? "1rem" : uiScale === 1.1 ? "1.1rem" : "1.2rem" }}>
        {page === "home" && (
          <ShipperHomeM kpi={kpi} orders={orders}
            onSelect={(o) => { setSelectedOrder(o); setPage("detail"); }}
            onGoOrder={() => setPage("order")}
            onEdit={(o) => { setEditOrderData(withPendingEdit(o)); setPage("order"); }}
            user={user} />
        )}
        {page === "order" && (
          <ShipperOrderM user={user} userData={userData} orders={orders} showToast={showToast}
            editData={editOrderData}
            onDone={(msg) => { setEditOrderData(null); setPage("history"); showToast(msg || (editOrderData ? "수정 완료!" : "배차요청 완료!")); }}
            onBack={() => { setEditOrderData(null); setPage(editOrderData ? "history" : "home"); }} />
        )}
        {page === "history" && (
          <ShipperHistoryM orders={orders}
            onSelect={(o) => { setSelectedOrder(o); setPage("detail"); }}
            onBack={() => setPage("home")}
            onEdit={(o) => { setEditOrderData(withPendingEdit(o)); setPage("order"); }}
            user={user} minAllowedDate={minAllowedDate} />
        )}
        {page === "detail" && selectedOrder && (
          <ShipperDetailM order={selectedOrder} onBack={() => setPage("history")}
            onEdit={(o) => { setEditOrderData(withPendingEdit(o)); setPage("order"); }}
            user={user} />
        )}
        {page === "mypage" && (
          <ShipperMyPageM user={user} userData={userData} onBack={() => setPage("home")} showToast={showToast} orders={orders} />
        )}
        {page === "notice" && (
          <ShipperNoticeM onBack={() => setPage("home")} />
        )}
        {page === "inquiry" && (
          <ShipperInquiryM user={user} userData={userData} onBack={() => setPage("home")} showToast={showToast} />
        )}
        {page === "settlement" && canViewSettlement && (
          <ShipperSettlementM orders={orders} user={user} userData={userData} onBack={() => setPage("home")} />
        )}
        {page === "settings" && (
          <ShipperSettingsM onBack={() => setPage("home")} showToast={showToast} uiScale={uiScale} setUiScale={setUiScale} />
        )}
      </div>

      {/* 하단 탭바 */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t flex z-30">
        <TabBtn label="홈" active={page === "home"} onClick={() => setPage("home")} />
        <TabBtn label="배차요청" active={page === "order"} onClick={() => setPage("order")} />
        <TabBtn label="운송내역" active={page === "history"} onClick={() => setPage("history")} />
      </div>
    </div>
  );
}

// ======================================================================
// 홈
// ======================================================================
function ShipperHomeM({ kpi, orders, onSelect, onGoOrder, onEdit, user }) {
  const [viewDate, setViewDate] = useState(todayStr());
  const [queriedDate, setQueriedDate] = useState(todayStr());

  const viewOrders = orders
    .filter((o) => String(o.상차일 || "").slice(0, 10) === queriedDate && o.상태 !== "취소")
    .sort((a, b) => {
      const tierDiff = getOrderSortTier(a) - getOrderSortTier(b);
      if (tierDiff !== 0) return tierDiff;
      return String(a.상차시간 || "").localeCompare(String(b.상차시간 || ""));
    });

  const monthAmount = useMemo(() => {
    const start = getMonthStart(0), end = getMonthEnd(0);
    return orders
      .filter((o) => {
        const d = String(o.상차일 || "").slice(0, 10);
        return d >= start && d <= end && o.상태 !== "취소";
      })
      .reduce((sum, o) => sum + Number(o.청구운임 || 0), 0);
  }, [orders]);

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg, #0f1f33, #1e3a5f)" }}>
        <div className="text-[11px] font-semibold tracking-wide mb-1" style={{ color: "rgba(191,219,254,0.7)" }}>
          이번달 예상 정산액
        </div>
        <div className="text-3xl font-bold text-white tabular-nums" style={{ fontFamily: "monospace", textShadow: "0 0 10px rgba(96,165,250,0.45)" }}>
          <OdometerNumber value={monthAmount} suffix="원" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <KpiCard title="전체 운송" value={kpi.total} color="text-gray-800" />
        <KpiCard title="오늘 운송" value={kpi.today} color="text-blue-600" />
        <KpiCard title="배차중" value={kpi.배차중} color="text-orange-500" />
        <KpiCard title="배차완료" value={kpi.완료} color="text-emerald-600" />
      </div>

      <button onClick={onGoOrder}
        className="w-full py-4 text-white rounded-2xl font-bold text-base shadow"
        style={{ background: NAVY }}>
        + 배차요청
      </button>

      <div>
        {/* 날짜 조회 */}
        <div className="flex gap-2 mb-2">
          <input type="date" value={viewDate} onChange={(e) => setViewDate(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          <button onClick={() => setQueriedDate(viewDate)}
            className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg shrink-0"
            style={{ background: NAVY }}>
            조회
          </button>
          {queriedDate !== todayStr() && (
            <button onClick={() => { setViewDate(todayStr()); setQueriedDate(todayStr()); }}
              className="px-3 py-1.5 text-xs font-semibold border rounded-lg shrink-0 text-gray-600">
              오늘
            </button>
          )}
        </div>
        <div className="text-sm font-bold text-gray-700 mb-2">
          {queriedDate === todayStr() ? "오늘" : queriedDate} 운송 ({viewOrders.length}건)
        </div>
        {viewOrders.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-6 bg-white rounded-xl border">
            해당 날짜의 운송이 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {viewOrders.map((o) => <OrderCard key={o.id} order={o} onSelect={() => onSelect(o)} onEdit={onEdit} user={user} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ======================================================================
// 배차요청 폼
// ======================================================================
function ShipperOrderM({ user, userData, orders = [], showToast, onDone, onBack, editData = null }) {
  const isEdit = !!editData;
  const [form, setForm] = useState(() => {
    const base = EMPTY_FORM();
    if (!editData) return base;
    const { num, unit } = parseTonnage(editData.차량톤수 || "");
    const picked = {};
    Object.keys(base).forEach((k) => { if (editData[k] !== undefined) picked[k] = editData[k]; });
    return { ...base, ...picked, 톤수값: num || "", 톤수단위: unit || "톤" };
  });
  const [transportList, setTransportList] = useState([]);
  const [fixedTransport, setFixedTransport] = useState(null);
  const [transportSuggestions, setTransportSuggestions] = useState([]);
  const [showTransportDrop, setShowTransportDrop] = useState(false);
  const [places, setPlaces] = useState([]);
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [dropSuggestions, setDropSuggestions] = useState([]);
  const [showPickupDrop, setShowPickupDrop] = useState(false);
  const [showDropDrop, setShowDropDrop] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySearch, setCopySearch] = useState("");
  const [copyType, setCopyType] = useState("통합");
  const [copyResults, setCopyResults] = useState(null);
  const [cargoRows, setCargoRows] = useState(() => (
    editData && Array.isArray(editData.화물목록) && editData.화물목록.length
      ? editData.화물목록
      : [EMPTY_CARGO_ROW()]
  ));

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const updateCargoRow = (idx, key, value) => {
    setCargoRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  };
  const addCargoRow = () => {
    setCargoRows((prev) => (prev.length >= 3 ? prev : [...prev, EMPTY_CARGO_ROW()]));
  };
  const removeCargoRow = (idx) => {
    setCargoRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };
  const buildCargoSummary = (rows) => rows.filter((r) => r.qty).map((r) => `${r.qty}${r.unit}`).join("+");
  const buildPalletSummary = (rows) => {
    const totals = {};
    rows.forEach((r) => {
      if (r.unit !== "파레트" || !r.qty || !r.palletCo) return;
      const label = r.palletCo === "KPP" ? "K" : r.palletCo === "아주" ? "AJ" : r.palletCo;
      totals[label] = (totals[label] || 0) + Number(r.qty);
    });
    return Object.entries(totals).map(([label, n]) => `${label} ${n}장`).join("+");
  };

  // 운송사 리스트 — PC(ShipperOrder.jsx)와 동일하게 승인된 운송사 목록에서 회사코드까지 가져온다.
  useEffect(() => {
    getDocs(query(
      collection(db, "transportApplications"),
      where("type", "==", "신규"),
      where("status", "==", "approved"),
    )).then(snap => {
      const seen = new Map();
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.companyName && !seen.has(data.companyName)) {
          seen.set(data.companyName, { name: data.companyName, code: data.companyCode || "" });
        }
      });
      setTransportList(Array.from(seen.values()));
    }).catch(() => setTransportList([]));
    const fixed = localStorage.getItem("fixedTransport");
    if (fixed) {
      try {
        const p = JSON.parse(fixed);
        setFixedTransport(p);
        setForm(prev => ({ ...prev, 운송사명: p.name, 운송사코드: p.code || "" }));
      } catch {}
    }
  }, []);

  // 장소 로드
  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "places"), where("userId", "==", user.uid))).then(snap => {
      const map = new Map();
      snap.docs.forEach(d => {
        const data = d.data();
        const key = (data.name || "").replace(/\s/g, "").toLowerCase();
        if (!map.has(key) || (data.createdAt?.seconds || 0) > (map.get(key).createdAt?.seconds || 0))
          map.set(key, { id: d.id, ...data });
      });
      setPlaces(Array.from(map.values()));
    });
  }, [user]);


  const searchPlaces = (val) => {
    if (!val.trim()) return [];
    const v = val.toLowerCase().replace(/\s/g, "");
    return places.filter(p => (p.name || "").toLowerCase().replace(/\s/g, "").includes(v)).slice(0, 8);
  };

  const applyPickup = (p) => {
    setForm(prev => ({ ...prev, 상차지명: p.name || "", 상차지주소: p.address || "", 상차지담당자: p.담당자명 || "", 상차지담당자번호: p.담당자번호 || "" }));
    setShowPickupDrop(false); setPickupSuggestions([]);
  };
  const applyDrop = (p) => {
    setForm(prev => ({ ...prev, 하차지명: p.name || "", 하차지주소: p.address || "", 하차지담당자: p.담당자명 || "", 하차지담당자번호: p.담당자번호 || "" }));
    setShowDropDrop(false); setDropSuggestions([]);
  };

  // 오더 복사
  const doCopySearch = () => {
    const v = copySearch.toLowerCase();
    const result = orders.filter(o => {
      if (!v) return true;
      if (copyType === "상차지") return (o.상차지명 || "").toLowerCase().includes(v);
      if (copyType === "하차지") return (o.하차지명 || "").toLowerCase().includes(v);
      if (copyType === "거래처") return (o.거래처명 || "").toLowerCase().includes(v);
      return (o.상차지명 || "").toLowerCase().includes(v) ||
        (o.하차지명 || "").toLowerCase().includes(v) ||
        (o.거래처명 || "").toLowerCase().includes(v);
    }).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 50);
    setCopyResults(result);
  };

  // 운송사 프로그램의 "오더복사" 기능과 동일한 규칙: 날짜는 오늘로, 상하차시간은 원본과 동일하게,
  // 화물내용/톤수/파렛트사는 새로 입력하도록 비워둔다.
  const copyFrom = (src) => {
    setForm(prev => ({
      ...prev,
      운송사명: fixedTransport?.name || src.운송사명 || "",
      운송사코드: fixedTransport?.code || src.운송사코드 || "",
      상차지명: src.상차지명 || "", 상차지주소: src.상차지주소 || "",
      상차지담당자: src.상차지담당자 || src.상차담당자명 || "",
      상차지담당자번호: src.상차지담당자번호 || src.상차담당자번호 || "",
      하차지명: src.하차지명 || "", 하차지주소: src.하차지주소 || "",
      하차지담당자: src.하차지담당자 || src.하차담당자명 || "",
      하차지담당자번호: src.하차지담당자번호 || src.하차담당자번호 || "",
      상차일: getDate(0), 상차시간: src.상차시간 || "08:00", 상차시간구분: src.상차시간구분 || "이후",
      하차일: getDate(0), 하차시간: src.하차시간 || "12:00", 하차시간구분: src.하차시간구분 || "이후",
      차량종류: src.차량종류 || "", 톤수값: "", 톤수단위: "톤",
      상차방법: src.상차방법 || "", 하차방법: src.하차방법 || "",
      지급방식: src.지급방식 || "",
    }));
    setCargoRows([EMPTY_CARGO_ROW()]);
    setCopyOpen(false);
    showToast("오더 복사 완료");
  };

  const upsertPlace = async (name, address, 담당자명, 담당자번호, type) => {
    if (!name) return;
    const snap = await getDocs(query(collection(db, "places"), where("userId", "==", user.uid), where("name", "==", name)));
    if (!snap.empty) {
      await updateDoc(doc(db, "places", snap.docs[0].id), { address, 담당자명, 담당자번호, updatedAt: serverTimestamp() });
    } else {
      await addDoc(collection(db, "places"), { name, address, 담당자명, 담당자번호, type, userId: user.uid, company: userData?.companyName || "", createdAt: serverTimestamp() });
    }
  };

  const submit = async () => {
    if (!form.상차지명 || !form.하차지명) { alert("상차지 / 하차지는 필수입니다."); return; }
    if (!cargoRows.some((r) => r.qty)) { alert("화물내용을 입력해주세요."); return; }
    if (cargoRows.some((r) => r.unit === "파레트" && r.qty && !r.palletCo)) { alert("파렛트사를 선택해주세요."); return; }
    setSubmitting(true);
    try {
      await upsertPlace(form.상차지명, form.상차지주소, form.상차지담당자, form.상차지담당자번호, "상차");
      await upsertPlace(form.하차지명, form.하차지주소, form.하차지담당자, form.하차지담당자번호, "하차");
      const 차량톤수 = form.톤수단위 === "없음" ? "" : form.톤수값 ? `${form.톤수값}${form.톤수단위}` : "";
      // PC(ShipperOrder.jsx)와 동일하게 화물내용은 "수량+단위"를 하나로 합친 문자열로 저장한다
      // (분리 저장 시 상세화면에서 단위를 재조합하면서 "1파레트 파레트"처럼 중복 표시되던 버그의 원인)
      const 화물내용 = buildCargoSummary(cargoRows);
      const 파렛트사요약 = buildPalletSummary(cargoRows);
      const { 톤수값, 톤수단위, ...formToSave } = form;
      if (isEdit) {
        const isDispatched = !!editData?.차량번호;
        if (isDispatched) {
          const pendingData = { ...formToSave, 차량톤수, 화물내용, 화물목록: cargoRows, 파렛트사요약 };
          await updateDoc(doc(db, "orders", editData.id), {
            수정요청: true,
            수정요청데이터: pendingData,
            수정요청일시: serverTimestamp(),
            수정요청자: user?.email || "",
            수정거절: false,
          });
          onDone("수정요청을 전송했습니다. 운송사 승인 후 반영됩니다.");
          return;
        }
        const nextData = { ...formToSave, 차량톤수, 화물내용 };
        const historyEntries = buildHistoryEntries(editData, nextData, user?.email);
        const updatePayload = {
          ...formToSave,
          차량톤수,
          화물내용,
          화물목록: cargoRows,
          파렛트사요약,
          최종수정출처: "shipper",
          최종수정일시: serverTimestamp(),
          // 새로 수정할 때마다 운송사의 이전 확인 여부를 초기화한다.
          최종수정확인: deleteField(),
        };
        if (historyEntries.length > 0) updatePayload.history = arrayUnion(...historyEntries);
        await updateDoc(doc(db, "orders", editData.id), updatePayload);
      } else {
        await addDoc(collection(db, "orders"), {
          ...formToSave,
          차량톤수,
          화물내용,
          화물목록: cargoRows,
          파렛트사요약,
          shipperUid: user.uid,
          거래처명: userData.companyName,
          shipperCompany: userData.companyName,
          배차상태: "배차중",
          화주사확인대기: true,
          업체전달상태: "미전달",
          source: "shipper_mobile",
          createdAt: serverTimestamp(),
          등록일: todayStr(),
        });
      }
      onDone();
    } catch (e) {
      console.error(e);
      alert(isEdit ? "수정 실패" : "등록 실패");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-gray-500 text-lg">←</button>
          <div className="font-bold text-base">{isEdit ? "오더 수정" : "배차요청"}</div>
        </div>
        {!isEdit && (
          <button onClick={() => { setCopyOpen(true); doCopySearch(); }}
            className="px-3 py-1.5 text-xs border rounded-lg font-semibold text-gray-600 hover:bg-gray-100">
            오더 복사
          </button>
        )}
      </div>

      {/* 운송사 */}
      <MSection title="운송사">
        <MRow label="운송사명">
          <div className="relative">
            <input className="input-m" value={form.운송사명} disabled={!!fixedTransport}
              placeholder="운송사명 입력"
              onChange={(e) => {
                update("운송사명", e.target.value);
                const v = e.target.value.toLowerCase();
                setTransportSuggestions(transportList.filter(t => (t.name || "").toLowerCase().includes(v)).slice(0, 8));
                setShowTransportDrop(true);
              }}
              onBlur={() => setTimeout(() => setShowTransportDrop(false), 150)}
            />
            {showTransportDrop && transportSuggestions.length > 0 && (
              <div className="absolute z-50 w-full bg-white border rounded-lg shadow max-h-40 overflow-y-auto mt-1">
                {transportSuggestions.map((t, i) => (
                  <div key={i} className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50"
                    onMouseDown={() => { update("운송사명", t.name); update("운송사코드", t.code || ""); setShowTransportDrop(false); }}>
                    {t.name} {t.code ? <span className="text-gray-400 text-xs">({t.code})</span> : ""}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <input type="checkbox" checked={!!fixedTransport}
              onChange={(e) => {
                if (e.target.checked) {
                  if (!form.운송사명) { alert("운송사를 먼저 선택하세요"); return; }
                  const d = { name: form.운송사명, code: form.운송사코드 };
                  setFixedTransport(d); localStorage.setItem("fixedTransport", JSON.stringify(d));
                } else {
                  setFixedTransport(null); localStorage.removeItem("fixedTransport");
                }
              }} />
            <span className="text-xs text-gray-500">운송사 고정</span>
          </div>
        </MRow>
        <MRow label="운송사코드">
          <input className="input-m bg-gray-50" value={form.운송사코드}
            onChange={(e) => update("운송사코드", e.target.value)} placeholder="자동입력" />
        </MRow>
      </MSection>

      {/* 상차 */}
      <MSection title="상차 정보">
        <MRow label="상차지명">
          <div className="relative">
            <input className="input-m" value={form.상차지명} placeholder="상차지명"
              onChange={(e) => {
                update("상차지명", e.target.value);
                const list = searchPlaces(e.target.value);
                setPickupSuggestions(list); setShowPickupDrop(list.length > 0);
              }}
              onFocus={() => { if (form.상차지명) { const list = searchPlaces(form.상차지명); setPickupSuggestions(list); setShowPickupDrop(list.length > 0); } }}
              onBlur={() => setTimeout(() => setShowPickupDrop(false), 150)} />
            {showPickupDrop && pickupSuggestions.length > 0 && (
              <div className="absolute z-50 w-full bg-white border rounded-lg shadow max-h-40 overflow-y-auto mt-1">
                {pickupSuggestions.map((p, i) => (
                  <div key={p.id || i} className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                    onMouseDown={() => applyPickup(p)}>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.address}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </MRow>
        <MRow label="상차지주소"><input className="input-m" value={form.상차지주소} onChange={(e) => update("상차지주소", e.target.value)} placeholder="주소" /></MRow>
        <MRow label="담당자명"><input className="input-m" value={form.상차지담당자} onChange={(e) => update("상차지담당자", e.target.value)} placeholder="담당자명" /></MRow>
        <MRow label="담당자번호"><input className="input-m" value={form.상차지담당자번호} onChange={(e) => update("상차지담당자번호", e.target.value)} placeholder="연락처" /></MRow>
        <MRow label="상차일">
          <div className="flex gap-2">
            <input type="date" className="input-m flex-1" value={form.상차일} onChange={(e) => update("상차일", e.target.value)} />
            <button onClick={() => update("상차일", getDate(0))} className={`px-2 py-1 rounded text-xs border shrink-0 ${form.상차일 === getDate(0) ? "text-white border-blue-600" : "bg-white"}`} style={form.상차일 === getDate(0) ? { background: NAVY } : {}}>당일</button>
            <button onClick={() => update("상차일", getDate(1))} className={`px-2 py-1 rounded text-xs border shrink-0 ${form.상차일 === getDate(1) ? "text-white border-blue-600" : "bg-white"}`} style={form.상차일 === getDate(1) ? { background: NAVY } : {}}>내일</button>
          </div>
        </MRow>
        <MRow label="상차시간">
          <div className="flex gap-2">
            <select className="input-m" style={{ flex: 3 }} value={form.상차시간} onChange={(e) => update("상차시간", e.target.value)}>
              {TIME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select className="input-m" style={{ flex: 1, minWidth: 0 }} value={form.상차시간구분} onChange={(e) => update("상차시간구분", e.target.value)}>
              <option value="이후">이후</option>
              <option value="이전">이전</option>
              <option value="정각">정각</option>
            </select>
          </div>
        </MRow>
      </MSection>

      {/* 하차 */}
      <MSection title="하차 정보">
        <MRow label="하차지명">
          <div className="relative">
            <input className="input-m" value={form.하차지명} placeholder="하차지명"
              onChange={(e) => {
                update("하차지명", e.target.value);
                const list = searchPlaces(e.target.value);
                setDropSuggestions(list); setShowDropDrop(list.length > 0);
              }}
              onFocus={() => { if (form.하차지명) { const list = searchPlaces(form.하차지명); setDropSuggestions(list); setShowDropDrop(list.length > 0); } }}
              onBlur={() => setTimeout(() => setShowDropDrop(false), 150)} />
            {showDropDrop && dropSuggestions.length > 0 && (
              <div className="absolute z-50 w-full bg-white border rounded-lg shadow max-h-40 overflow-y-auto mt-1">
                {dropSuggestions.map((p, i) => (
                  <div key={p.id || i} className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                    onMouseDown={() => applyDrop(p)}>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.address}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </MRow>
        <MRow label="하차지주소"><input className="input-m" value={form.하차지주소} onChange={(e) => update("하차지주소", e.target.value)} placeholder="주소" /></MRow>
        <MRow label="담당자명"><input className="input-m" value={form.하차지담당자} onChange={(e) => update("하차지담당자", e.target.value)} placeholder="담당자명" /></MRow>
        <MRow label="담당자번호"><input className="input-m" value={form.하차지담당자번호} onChange={(e) => update("하차지담당자번호", e.target.value)} placeholder="연락처" /></MRow>
        <MRow label="하차일">
          <div className="flex gap-2">
            <input type="date" className="input-m flex-1" value={form.하차일} onChange={(e) => update("하차일", e.target.value)} />
            <button onClick={() => update("하차일", getDate(0))} className={`px-2 py-1 rounded text-xs border shrink-0 ${form.하차일 === getDate(0) ? "text-white border-blue-600" : "bg-white"}`} style={form.하차일 === getDate(0) ? { background: NAVY } : {}}>당일</button>
            <button onClick={() => update("하차일", getDate(1))} className={`px-2 py-1 rounded text-xs border shrink-0 ${form.하차일 === getDate(1) ? "text-white border-blue-600" : "bg-white"}`} style={form.하차일 === getDate(1) ? { background: NAVY } : {}}>내일</button>
          </div>
        </MRow>
        <MRow label="하차시간">
          <div className="flex gap-2">
            <select className="input-m" style={{ flex: 3 }} value={form.하차시간} onChange={(e) => update("하차시간", e.target.value)}>
              {TIME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select className="input-m" style={{ flex: 1, minWidth: 0 }} value={form.하차시간구분} onChange={(e) => update("하차시간구분", e.target.value)}>
              <option value="이후">이후</option>
              <option value="이전">이전</option>
              <option value="정각">정각</option>
            </select>
          </div>
        </MRow>
      </MSection>

      {/* 화물 / 차량 */}
      <MSection title="화물 / 차량">
        <MRow label="차량종류">
          <select className="input-m" value={form.차량종류} onChange={(e) => update("차량종류", e.target.value)}>
            <option value="">선택</option>
            {차량종류목록.map(v => <option key={v}>{v}</option>)}
          </select>
        </MRow>
        <MRow label="톤수">
          <div className="flex gap-2">
            <input className="input-m" style={{ flex: 2 }} value={form.톤수값}
              placeholder="숫자 입력" inputMode="decimal"
              onChange={(e) => update("톤수값", e.target.value.replace(/[^0-9.]/g, ""))} />
            <select className="input-m" style={{ flex: 1, minWidth: 0 }} value={form.톤수단위} onChange={(e) => update("톤수단위", e.target.value)}>
              {톤수단위목록.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
        </MRow>
        <MRow label={`화물내용 (최대 3개)`}>
          <div className="space-y-2">
            {cargoRows.map((row, idx) => (
              <div key={idx} className="flex gap-1.5 items-center">
                <input className="input-m" style={{ flex: 2 }} value={row.qty}
                  onChange={(e) => updateCargoRow(idx, "qty", e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="수량" inputMode="decimal" />
                <select className="input-m" style={{ flex: 1, minWidth: 0 }} value={row.unit}
                  onChange={(e) => updateCargoRow(idx, "unit", e.target.value)}>
                  {화물단위목록.map(v => <option key={v}>{v}</option>)}
                </select>
                {row.unit === "파레트" && (
                  <select className="input-m" style={{ flex: 1, minWidth: 0 }} value={row.palletCo}
                    onChange={(e) => updateCargoRow(idx, "palletCo", e.target.value)}>
                    <option value="">파렛트사</option>
                    <option value="아주">아주</option>
                    <option value="KPP">KPP</option>
                  </select>
                )}
                {cargoRows.length > 1 && (
                  <button type="button" onClick={() => removeCargoRow(idx)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-400 shrink-0">×</button>
                )}
              </div>
            ))}
            {cargoRows.length < 3 && (
              <button type="button" onClick={addCargoRow}
                className="w-full py-2 rounded-lg border border-dashed border-gray-300 text-gray-500 text-sm font-semibold">
                + 화물 추가 ({cargoRows.length}/3)
              </button>
            )}
            {cargoRows.some(r => r.qty) && (
              <div className="text-xs font-semibold" style={{ color: NAVY }}>{buildCargoSummary(cargoRows)}</div>
            )}
          </div>
        </MRow>
      </MSection>

      {/* 작업방식/결제 */}
      <MSection title="작업방식 / 결제">
        <MRow label="배차옵션">
          <div className="flex gap-2">
            <button type="button"
              onClick={() => setForm(p => ({ ...p, 독차: true, 혼적: false }))}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all"
              style={form.독차 ? { background: NAVY, color: "#fff", borderColor: NAVY } : { background: "#fff", color: "#4b5563", borderColor: "#d1d5db" }}>
              독차
            </button>
            <button type="button"
              onClick={() => setForm(p => ({ ...p, 혼적: true, 독차: false }))}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all"
              style={form.혼적 ? { background: NAVY, color: "#fff", borderColor: NAVY } : { background: "#fff", color: "#4b5563", borderColor: "#d1d5db" }}>
              혼적
            </button>
            <button type="button"
              onClick={() => update("긴급", !form.긴급)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${form.긴급 ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-300"}`}>
              긴급
            </button>
          </div>
        </MRow>
        <MRow label="상차방법">
          <select className="input-m" value={form.상차방법} onChange={(e) => update("상차방법", e.target.value)}>
            <option value="">선택</option><option>지게차</option><option>수작업</option><option>수도움</option><option>크레인</option>
          </select>
        </MRow>
        <MRow label="하차방법">
          <select className="input-m" value={form.하차방법} onChange={(e) => update("하차방법", e.target.value)}>
            <option value="">선택</option><option>지게차</option><option>수작업</option><option>수도움</option><option>크레인</option>
          </select>
        </MRow>
        <MRow label="지급방식">
          <select className="input-m" value={form.지급방식} onChange={(e) => update("지급방식", e.target.value)}>
            <option value="">선택</option><option>계산서</option><option>선불</option><option>착불</option><option>계좌이체</option>
          </select>
        </MRow>
      </MSection>

      <button onClick={submit} disabled={submitting}
        className="w-full py-4 text-white rounded-2xl font-bold text-base shadow mb-8 disabled:opacity-50"
        style={{ background: NAVY }}>
        {submitting ? (isEdit ? "저장중..." : "등록중...") : (isEdit ? "수정 저장" : "배차요청 등록")}
      </button>

      {/* 오더 복사 모달 */}
      {copyOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end">
          <div className="w-full bg-white rounded-t-2xl max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ background: NAVY }}>
              <div className="text-white font-bold">오더 복사</div>
              <button onClick={() => { setCopyOpen(false); setCopyResults(null); setCopySearch(""); }} className="text-white text-xl">×</button>
            </div>
            <div className="px-3 py-2 border-b space-y-2">
              <div className="flex gap-2">
                <div className="w-24 shrink-0">
                  <select className="input-m" value={copyType} onChange={(e) => setCopyType(e.target.value)}>
                    <option value="통합">통합</option>
                    <option value="상차지">상차지</option>
                    <option value="하차지">하차지</option>
                    <option value="거래처">거래처</option>
                  </select>
                </div>
                <input className="input-m flex-1" value={copySearch}
                  onChange={(e) => setCopySearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doCopySearch()}
                  placeholder="검색어 입력" />
                <button onClick={doCopySearch}
                  className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg shrink-0"
                  style={{ background: NAVY }}>
                  조회
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-3 py-2 space-y-2">
              {copyResults === null ? (
                <div className="text-center text-gray-400 text-sm py-10">
                  검색어를 입력하고 조회 버튼을 누르세요
                </div>
              ) : copyResults.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-10">검색 결과가 없습니다.</div>
              ) : copyResults.map(o => (
                <button key={o.id} className="w-full text-left bg-gray-50 border rounded-xl p-3 active:bg-blue-50"
                  onClick={() => copyFrom(o)}>
                  <div className="text-sm font-semibold text-gray-800">
                    {o.상차지명 || "-"} → {o.하차지명 || "-"}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {o.상차일 || "-"} · {o.차량종류 || ""} {o.차량톤수 || ""}
                  </div>
                  {o.운송사명 && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      운송사: {o.운송사명}{o.운송사코드 ? ` (${o.운송사코드})` : ""}
                    </div>
                  )}
                  {(o.상차지담당자 || o.상차담당자명) && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      상차 담당: {o.상차지담당자 || o.상차담당자명}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`.input-m { width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; font-size: 14px; background: white; outline: none; box-sizing: border-box; }`}</style>
    </div>
  );
}

// ======================================================================
// 카운트업 숫자 (디지털 다이얼)
// ======================================================================
function OdometerNumber({ value, suffix = "" }) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const to = Number(value) || 0;
    const start = performance.now();
    const duration = 700;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span>{display.toLocaleString("ko-KR")}{suffix}</span>;
}

// ======================================================================
// 운송내역
// ======================================================================
function ShipperHistoryM({ orders, onSelect, onBack, onEdit, user, minAllowedDate }) {
  const nowY = new Date(Date.now() + 9 * 3600000).getFullYear();
  const parseMD = (dateStr) => {
    const [, m, d] = (dateStr || "").split("-");
    return { month: Number(m) || 1, day: Number(d) || 1 };
  };
  const defaultStart = getMonthStart(0);
  const defaultEnd = getMonthEnd(0);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [draftStart, setDraftStart] = useState(parseMD(defaultStart));
  const [draftEnd, setDraftEnd] = useState(parseMD(defaultEnd));
  const [keyword, setKeyword] = useState("");
  const [searchType, setSearchType] = useState("통합");
  const [statusFilter, setStatusFilter] = useState("");

  const daysInMonth = (m) => new Date(nowY, m, 0).getDate();

  const applyDateQuery = () => {
    const pad = (n) => String(n).padStart(2, "0");
    let newStart = `${nowY}-${pad(draftStart.month)}-${pad(draftStart.day)}`;
    if (minAllowedDate && newStart < minAllowedDate) {
      newStart = minAllowedDate;
      alert(`조회 가능 기간은 최근 6개월까지입니다. (${minAllowedDate} 이후)\n더 이전 데이터가 필요하면 운송사 관리자에게 요청해 주세요.`);
    }
    setStartDate(newStart);
    setEndDate(`${nowY}-${pad(draftEnd.month)}-${pad(draftEnd.day)}`);
  };

  const filtered = useMemo(() => {
    return orders
      .filter((o) => {
        const d = String(o.상차일 || "").slice(0, 10);
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        if (statusFilter) {
          const s = o.차량번호 ? "배차완료" : "배차중";
          if (s !== statusFilter) return false;
        }
        if (keyword) {
          const v = keyword.toLowerCase();
          if (searchType === "상차지") return (o.상차지명 || "").toLowerCase().includes(v);
          if (searchType === "하차지") return (o.하차지명 || "").toLowerCase().includes(v);
          if (searchType === "거래처") return (o.거래처명 || "").toLowerCase().includes(v);
          if (searchType === "차량번호") return (o.차량번호 || "").toLowerCase().includes(v);
          return (o.상차지명 || "").toLowerCase().includes(v) ||
            (o.하차지명 || "").toLowerCase().includes(v) ||
            (o.거래처명 || "").toLowerCase().includes(v);
        }
        return true;
      })
      .sort((a, b) => {
        const tierDiff = getOrderSortTier(a) - getOrderSortTier(b);
        if (tierDiff !== 0) return tierDiff;
        // 같은 상태 안에서는 상차일(날짜)로 먼저 묶고, 같은 날짜 안에서만
        // 배차완료 시각 등 세부 시각으로 정렬한다 (날짜가 섞여 보이지 않도록).
        const dateDiff = String(b.상차일 || "").localeCompare(String(a.상차일 || ""));
        if (dateDiff !== 0) return dateDiff;
        return getOrderSortTime(b) - getOrderSortTime(a);
      });
  }, [orders, startDate, endDate, keyword, searchType, statusFilter]);

  const totalAmount = useMemo(() => filtered.reduce((sum, o) => sum + Number(o.청구운임 || 0), 0), [filtered]);

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="text-gray-500 text-lg">←</button>
        <div className="font-bold text-base">운송내역</div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-1 flex-wrap">
          <select className="border border-gray-200 rounded-lg px-1 py-1.5 text-sm min-w-0"
            value={draftStart.month} onChange={(e) => setDraftStart(p => ({ ...p, month: Number(e.target.value) }))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
          <select className="border border-gray-200 rounded-lg px-1 py-1.5 text-sm min-w-0"
            value={draftStart.day} onChange={(e) => setDraftStart(p => ({ ...p, day: Number(e.target.value) }))}>
            {Array.from({ length: daysInMonth(draftStart.month) }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}일</option>)}
          </select>
          <span className="text-gray-400 text-sm shrink-0">~</span>
          <select className="border border-gray-200 rounded-lg px-1 py-1.5 text-sm min-w-0"
            value={draftEnd.month} onChange={(e) => setDraftEnd(p => ({ ...p, month: Number(e.target.value) }))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
          <select className="border border-gray-200 rounded-lg px-1 py-1.5 text-sm min-w-0"
            value={draftEnd.day} onChange={(e) => setDraftEnd(p => ({ ...p, day: Number(e.target.value) }))}>
            {Array.from({ length: daysInMonth(draftEnd.month) }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}일</option>)}
          </select>
          <button onClick={applyDateQuery}
            className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg shrink-0" style={{ background: NAVY }}>
            조회
          </button>
        </div>
        {minAllowedDate && (
          <div className="text-[11px] text-gray-400">※ 최근 6개월까지 조회 가능</div>
        )}
        <div className="flex gap-2">
          <select className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-24 shrink-0"
            value={searchType} onChange={(e) => setSearchType(e.target.value)}>
            <option value="통합">통합</option>
            <option value="상차지">상차지</option>
            <option value="하차지">하차지</option>
            <option value="거래처">거래처</option>
            <option value="차량번호">차량번호</option>
          </select>
          <input className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
            placeholder="검색어 입력"
            value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {[{ label: "전체", value: "" }, { label: "배차중", value: "배차중" }, { label: "배차완료", value: "배차완료" }].map(s => (
            <button key={s.value} onClick={() => setStatusFilter(s.value)}
              className={`flex-1 py-1.5 text-xs rounded-lg border font-semibold transition ${statusFilter === s.value ? "text-white border-blue-600" : "border-gray-200 text-gray-600"}`}
              style={statusFilter === s.value ? { background: NAVY } : {}}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl p-4 grid grid-cols-2 gap-3"
        style={{ background: "linear-gradient(135deg, #0f1f33, #1e3a5f)" }}>
        <div>
          <div className="text-[11px] font-semibold tracking-wide mb-1" style={{ color: "rgba(191,219,254,0.7)" }}>조회 건수</div>
          <div className="text-2xl font-bold text-white tabular-nums" style={{ fontFamily: "monospace", textShadow: "0 0 10px rgba(96,165,250,0.45)" }}>
            <OdometerNumber value={filtered.length} suffix="건" />
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold tracking-wide mb-1" style={{ color: "rgba(191,219,254,0.7)" }}>총 청구운임</div>
          <div className="text-2xl font-bold text-white tabular-nums" style={{ fontFamily: "monospace", textShadow: "0 0 10px rgba(96,165,250,0.45)" }}>
            <OdometerNumber value={totalAmount} suffix="원" />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-10">조회된 내역이 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => <OrderCard key={o.id} order={o} onSelect={() => onSelect(o)} onEdit={onEdit} user={user} />)}
        </div>
      )}
    </div>
  );
}

// ======================================================================
// 상세보기
// ======================================================================
function DetailGroup({ label, children, last = false }) {
  return (
    <div className={last ? "" : "border-b border-gray-100"}>
      <div className="px-3 pt-3 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  );
}

function ShipperDetailM({ order, onBack, onEdit, user }) {
  const isCanceled = ["취소", "배차취소", "오더취소"].includes(order.상태);
  const isDispatched = !!(order.차량번호 && String(order.차량번호).trim());
  const handleDelete = async () => {
    const ok = await shipperDeleteOrRequestCancel(order, user);
    if (ok && !isDispatched) onBack?.();
  };
  const handleSwapDriver = async () => {
    await shipperRequestDriverSwap(order, user);
  };
  const [attachments, setAttachments] = useState([]);
  const [loadingAttach, setLoadingAttach] = useState(false);
  const [viewImg, setViewImg] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!order.id) return;
    setLoadingAttach(true);
    getDocs(collection(db, "orders", order.id, "attachments")).then(snap => {
      setAttachments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(() => {}).finally(() => setLoadingAttach(false));
  }, [order.id]);

  const timeLabel = (time, dir) => {
    const t = fmt12(time);
    return t && dir && dir !== "정각" ? `${t} ${dir}` : t || "-";
  };

  const downloadImg = (item) => {
    const src = item.base64 || item.url;
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = item.name || "첨부파일.jpg";
    a.click();
  };

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="text-gray-500 text-lg">←</button>
        <div className="font-bold text-base">운송 상세</div>
        <StatusBadge order={order} className="ml-auto" />
      </div>

      {order.수정요청 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-[12px] text-sky-700 font-semibold leading-snug">
          수정요청이 운송사 승인 대기중입니다. 승인되면 양쪽 화면에 동일하게 반영됩니다.
        </div>
      )}

      {!isCanceled && (
        <div className="flex gap-2">
          <button
            onClick={() => onEdit?.(order)}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold"
          >
            수정
          </button>
          {isDispatched && (
            <button
              onClick={handleSwapDriver}
              className="flex-1 py-2.5 rounded-xl border border-orange-200 text-orange-500 text-sm font-semibold"
            >
              기사변경요청
            </button>
          )}
          <button
            onClick={handleDelete}
            className="flex-1 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-semibold"
          >
            오더취소
          </button>
        </div>
      )}

      {!order.차량번호 && order.배차거절 === true && (
        <RequestHoldActions order={order} onDeleted={onBack} />
      )}

      {Array.isArray(order.history) && order.history.length > 0 && (
        <button
          onClick={() => setShowHistory(true)}
          className="w-full flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 text-[12px] font-bold text-gray-500"
        >
          <span>수정이력 ({order.history.length})</span>
          <span className="text-gray-400">보기 &gt;</span>
        </button>
      )}
      {showHistory && (
        <HistoryViewerModal history={order.history} onClose={() => setShowHistory(false)} />
      )}

      {order.수정요청 && order.수정요청데이터 && (
        <div className="bg-white rounded-xl border border-sky-200 overflow-hidden">
          <div className="px-3 py-2 bg-sky-50 text-[12px] font-bold text-sky-700 border-b border-sky-200">수정요청 내용 (승인 대기중)</div>
          <div className="px-3 py-2 space-y-1.5 max-h-52 overflow-y-auto">
            {Object.entries(order.수정요청데이터)
              .filter(([k, v]) => k !== "화물목록" && String(order[k] ?? "") !== String(v ?? ""))
              .map(([k, v]) => (
                <div key={k} className="text-[12px] text-gray-700">
                  <span className="font-semibold">{k}</span>: <span className="text-gray-400">{String(order[k] ?? "없음") || "없음"}</span> → <span className="font-semibold text-sky-700">{String(v ?? "없음") || "없음"}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <DetailGroup label="기본정보">
          <MDetailRow label="거래처" value={order.거래처명 || "-"} />
          <MDetailRow label="상차" value={`${order.상차일 || "-"} ${timeLabel(order.상차시간, order.상차시간구분)}`} />
          <MDetailRow label="하차" value={`${order.하차일 || "-"} ${timeLabel(order.하차시간, order.하차시간구분)}`} />
          <MDetailRow label="등록일시" value={fmtDateTime(order.createdAt)} />
        </DetailGroup>

        <DetailGroup label="상차지">
          <MDetailRow label="지명" value={order.상차지명 || "-"} />
          <MDetailRow label="주소" value={order.상차지주소 || "-"} />
          {order.상차지담당자 && <MDetailRow label="담당자" value={order.상차지담당자} />}
          {order.상차지담당자번호 && <MDetailRow label="연락처" value={order.상차지담당자번호} />}
          {order.상차메모 && <MDetailRow label="메모" value={order.상차메모} />}
          {getViaListM(order.경유상차목록).map((s, i) => (
            <MDetailRow key={i} label={`경유${i + 1}`} value={`${s.업체명 || ""} ${s.주소 || ""}`.trim() || "-"} />
          ))}
        </DetailGroup>

        <DetailGroup label="하차지">
          <MDetailRow label="지명" value={order.하차지명 || "-"} />
          <MDetailRow label="주소" value={order.하차지주소 || "-"} />
          {order.하차지담당자 && <MDetailRow label="담당자" value={order.하차지담당자} />}
          {order.하차지담당자번호 && <MDetailRow label="연락처" value={order.하차지담당자번호} />}
          {order.하차메모 && <MDetailRow label="메모" value={order.하차메모} />}
          {getViaListM(order.경유하차목록).map((s, i) => (
            <MDetailRow key={i} label={`경유${i + 1}`} value={`${s.업체명 || ""} ${s.주소 || ""}`.trim() || "-"} />
          ))}
        </DetailGroup>

        <DetailGroup label="화물 / 차량">
          <MDetailRow label="차량종류" value={order.차량종류 || order.차종 || "-"} />
          <MDetailRow label="톤수" value={order.차량톤수 || order.톤수 || "-"} />
          <MDetailRow label="화물내용" value={order.화물내용 || "-"} />
          {getPalletSummary(order) && <MDetailRow label="파렛트사" value={getPalletSummary(order)} />}
          <MDetailRow label="상차방법" value={order.상차방법 || "-"} />
          <MDetailRow label="하차방법" value={order.하차방법 || "-"} />
        </DetailGroup>

        <DetailGroup label="배차 / 기사 정보">
          {order.차량번호 ? (
            <>
              <MDetailRow label="차량번호" value={order.차량번호} />
              <MDetailRow label="기사명" value={order.이름 || order.기사명 || "-"} />
              <MDetailRow label="연락처" value={order.전화번호 || "-"} />
              <MDetailRow label="운송사" value={order.운송사명 || "-"} />
              {order.전화번호 && (
                <div className="flex gap-2 px-3 py-2.5">
                  <a href={`tel:${order.전화번호}`} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-lg text-sm font-semibold text-center">전화 연결</a>
                  <a href={`sms:${order.전화번호}`} className="flex-1 py-2.5 bg-sky-500 text-white rounded-lg text-sm font-semibold text-center">문자 전송</a>
                </div>
              )}
            </>
          ) : (
            <div className="py-4 text-center text-sm text-amber-600 font-medium">
              배차 완료 후 기사 정보가 표시됩니다
            </div>
          )}
        </DetailGroup>

        <DetailGroup label="운임">
          <MDetailRow label="청구운임" value={fmtMoney(order.청구운임)} />
          <MDetailRow label="지급방식" value={order.지급방식 || "-"} />
        </DetailGroup>

        <DetailGroup label={`첨부사진 ${attachments.length > 0 ? `(${attachments.length}장)` : ""}`} last>
          {loadingAttach ? (
            <div className="py-4 text-center text-sm text-gray-400">로딩 중...</div>
          ) : attachments.length === 0 ? (
            <div className="py-4 text-center text-sm text-gray-400">첨부된 파일이 없습니다</div>
          ) : (
            <div className="grid grid-cols-3 gap-2 px-3 py-2">
              {attachments.map(item => (
                <div key={item.id} className="rounded-lg overflow-hidden border">
                  <div className="aspect-square" onClick={() => setViewImg(item)}>
                    <img src={item.base64 || item.url} alt={item.name} className="w-full h-full object-cover" />
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadImg(item); }}
                    className="w-full py-1.5 bg-gray-50 text-gray-600 text-[11px] font-bold border-t"
                  >
                    저장
                  </button>
                </div>
              ))}
            </div>
          )}
        </DetailGroup>
      </div>

      {/* 사진 전체보기 */}
      {viewImg && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
          <div className="flex justify-between items-center px-4 py-3">
            <div className="text-white text-sm truncate flex-1">{viewImg.name || "첨부파일"}</div>
            <button onClick={() => setViewImg(null)} className="text-white text-2xl ml-3">×</button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <img src={viewImg.base64 || viewImg.url} alt={viewImg.name} className="max-w-full max-h-full object-contain rounded" />
          </div>
          <div className="px-4 pb-6">
            <button onClick={() => downloadImg(viewImg)}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm">
              다운로드
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================================================================
// 마이페이지
// ======================================================================
function ShipperMyPageM({ user, userData, onBack, showToast, orders }) {
  const [tab, setTab] = useState("info");
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);

  const thisMonth = useMemo(() => {
    const ym = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7);
    return orders.filter(o => String(o.상차일 || "").slice(0, 7) === ym);
  }, [orders]);

  const changePw = async () => {
    if (!pwForm.current || !pwForm.next) { alert("현재 비밀번호와 새 비밀번호를 입력하세요."); return; }
    if (pwForm.next !== pwForm.confirm) { alert("새 비밀번호가 일치하지 않습니다."); return; }
    if (pwForm.next.length < 6) { alert("비밀번호는 6자 이상이어야 합니다."); return; }
    setPwSaving(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, pwForm.current);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, pwForm.next);
      showToast("비밀번호가 변경되었습니다.");
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (e) {
      alert("비밀번호 변경 실패: " + (e.code === "auth/wrong-password" ? "현재 비밀번호가 틀립니다." : e.message));
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="text-gray-500 text-lg">←</button>
        <div className="font-bold text-base">마이페이지</div>
      </div>

      {/* 프로필 */}
      <div className="rounded-2xl p-5 text-center text-white" style={{ background: NAVY }}>
        <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold mx-auto mb-2">
          {(userData.name || user.email || "?")[0].toUpperCase()}
        </div>
        <div className="font-bold text-base">{userData.name || "-"}</div>
        <div className="text-blue-200 text-sm mt-0.5">{user.email}</div>
        <div className="text-blue-200 text-xs mt-0.5">{userData.companyName || ""}</div>
      </div>

      {/* 이번달 통계 */}
      <div className="grid grid-cols-3 gap-2">
        <KpiCard title="이번달 오더" value={thisMonth.length} color="text-blue-600" />
        <KpiCard title="배차완료" value={thisMonth.filter(o => !!o.차량번호).length} color="text-emerald-600" />
        <KpiCard title="전체 오더" value={orders.length} color="text-gray-700" />
      </div>

      {/* 탭 */}
      <div className="flex bg-white border rounded-xl overflow-hidden">
        <button onClick={() => setTab("info")}
          className={`flex-1 py-2.5 text-sm font-semibold transition ${tab === "info" ? "text-white" : "text-gray-500"}`}
          style={tab === "info" ? { background: NAVY } : {}}>
          내 정보
        </button>
        <button onClick={() => setTab("password")}
          className={`flex-1 py-2.5 text-sm font-semibold transition ${tab === "password" ? "text-white" : "text-gray-500"}`}
          style={tab === "password" ? { background: NAVY } : {}}>
          비밀번호 변경
        </button>
      </div>

      {tab === "info" && (
        <MCard>
          <MDetailRow label="이름" value={userData.name || "-"} />
          <MDetailRow label="이메일" value={user.email || "-"} />
          <MDetailRow label="회사명" value={userData.companyName || "-"} />
          <MDetailRow label="부서" value={userData.department || "-"} />
          <MDetailRow label="직책" value={userData.position || "-"} />
          <MDetailRow label="권한" value={userData.role === "shipper" ? "화주 마스터" : userData.permissions?.subMaster ? "화주 서브마스터" : "일반 사용자"} />
        </MCard>
      )}

      {tab === "password" && (
        <MCard>
          <div className="space-y-3 py-2">
            <div>
              <div className="text-xs text-gray-500 mb-1">현재 비밀번호</div>
              <input type="password" className="input-m" value={pwForm.current}
                onChange={(e) => setPwForm(p => ({ ...p, current: e.target.value }))} placeholder="현재 비밀번호" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">새 비밀번호</div>
              <input type="password" className="input-m" value={pwForm.next}
                onChange={(e) => setPwForm(p => ({ ...p, next: e.target.value }))} placeholder="6자 이상" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">새 비밀번호 확인</div>
              <input type="password" className="input-m" value={pwForm.confirm}
                onChange={(e) => setPwForm(p => ({ ...p, confirm: e.target.value }))} placeholder="비밀번호 재입력" />
            </div>
            <button onClick={changePw} disabled={pwSaving}
              className="w-full py-3 text-white rounded-xl font-semibold text-sm disabled:opacity-50"
              style={{ background: NAVY }}>
              {pwSaving ? "변경 중..." : "비밀번호 변경"}
            </button>
          </div>
          <style>{`.input-m { width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; font-size: 14px; background: white; outline: none; box-sizing: border-box; }`}</style>
        </MCard>
      )}
    </div>
  );
}

// ======================================================================
// 공지사항
// ======================================================================
function ShipperNoticeM({ onBack }) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) { setLoading(false); return; }
    (async () => {
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const linkedCompanyName = userSnap.exists() ? userSnap.data()?.linkedTransportCompany?.companyName : null;
        if (!linkedCompanyName) { setNotices([]); setLoading(false); return; }
        const snap = await getDocs(query(collection(db, "notices"), where("audience", "==", "shipper")));
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(n => n.companyName === linkedCompanyName)
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
          .slice(0, 50);
        setNotices(list);
      } catch {
        setNotices([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const fmtDate = (ts) => {
    if (!ts) return "";
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!d) return String(ts).slice(0, 10);
    return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  };

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="text-gray-500 text-lg">←</button>
        <div className="font-bold text-base">공지사항</div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 text-sm py-10">불러오는 중...</div>
      ) : notices.length === 0 ? (
        <div className="text-center py-14">
          <div className="text-gray-300 text-4xl mb-3">—</div>
          <div className="text-gray-400 text-sm font-medium">등록된 공지사항이 없습니다</div>
        </div>
      ) : (
        <div className="space-y-2">
          {notices.map(n => (
            <div key={n.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button className="w-full text-left px-4 py-3 flex items-start gap-2"
                onClick={() => setExpanded(expanded === n.id ? null : n.id)}>
                {n.pinned && (
                  <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style={{ background: NAVY }}>
                    중요
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{n.title || "제목 없음"}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{fmtDate(n.createdAt)}</div>
                </div>
                <span className="text-gray-400 text-sm shrink-0">{expanded === n.id ? "▲" : "▼"}</span>
              </button>
              {expanded === n.id && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  <div className="text-sm text-gray-700 whitespace-pre-wrap pt-3 leading-relaxed">{n.content || ""}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ======================================================================
// 문의사항
// ======================================================================
function ShipperInquiryM({ user, userData, onBack, showToast }) {
  const [tab, setTab] = useState("list");
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({ title: "", content: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "inquiries"), where("userId", "==", user.uid), orderBy("createdAt", "desc"), limit(50))).then(snap => {
      setInquiries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(() => setInquiries([])).finally(() => setLoading(false));
  }, [user]);

  const submit = async () => {
    if (!form.title.trim() || !form.content.trim()) { alert("제목과 내용을 모두 입력해주세요."); return; }
    setSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, "inquiries"), {
        title: form.title,
        content: form.content,
        userId: user.uid,
        company: userData?.companyName || "",
        name: userData?.name || user.email,
        status: "접수중",
        createdAt: serverTimestamp(),
      });
      setInquiries(prev => [{ id: docRef.id, ...form, status: "접수중", createdAt: null }, ...prev]);
      setForm({ title: "", content: "" });
      showToast("문의가 등록되었습니다.");
      setTab("list");
    } catch (e) {
      alert("등록 실패: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const fmtDate = (ts) => {
    if (!ts) return "방금";
    const d = ts?.toDate ? ts.toDate() : null;
    if (!d) return "";
    return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  };

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="text-gray-500 text-lg">←</button>
        <div className="font-bold text-base">문의사항</div>
      </div>

      <div className="flex bg-white border rounded-xl overflow-hidden">
        <button onClick={() => setTab("list")}
          className={`flex-1 py-2.5 text-sm font-semibold transition ${tab === "list" ? "text-white" : "text-gray-500"}`}
          style={tab === "list" ? { background: NAVY } : {}}>
          문의내역
        </button>
        <button onClick={() => setTab("write")}
          className={`flex-1 py-2.5 text-sm font-semibold transition ${tab === "write" ? "text-white" : "text-gray-500"}`}
          style={tab === "write" ? { background: NAVY } : {}}>
          문의하기
        </button>
      </div>

      {tab === "list" && (
        loading ? (
          <div className="text-center text-gray-400 text-sm py-10">불러오는 중...</div>
        ) : inquiries.length === 0 ? (
          <div className="text-center py-14">
            <div className="text-gray-300 text-4xl mb-3">—</div>
            <div className="text-gray-400 text-sm font-medium">등록된 문의가 없습니다</div>
            <button onClick={() => setTab("write")} className="mt-4 px-5 py-2 text-white text-sm rounded-xl font-semibold" style={{ background: NAVY }}>
              문의하기
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {inquiries.map(q => (
              <div key={q.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <button className="w-full text-left px-4 py-3 flex items-start gap-2"
                  onClick={() => setExpanded(expanded === q.id ? null : q.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="text-sm font-semibold text-gray-800 truncate flex-1">{q.title}</div>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${q.status === "답변완료" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {q.status || "접수중"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">{fmtDate(q.createdAt)}</div>
                  </div>
                  <span className="text-gray-400 text-sm shrink-0 mt-0.5">{expanded === q.id ? "▲" : "▼"}</span>
                </button>
                {expanded === q.id && (
                  <div className="px-4 pb-4 border-t border-gray-100 space-y-3">
                    <div className="pt-3">
                      <div className="text-xs text-gray-400 mb-1 font-semibold">문의 내용</div>
                      <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{q.content}</div>
                    </div>
                    {q.reply && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                        <div className="text-xs text-blue-500 font-semibold mb-1">답변</div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{q.reply}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {tab === "write" && (
        <MCard>
          <div className="space-y-3 py-2">
            <div>
              <div className="text-xs text-gray-500 mb-1">제목</div>
              <input className="input-m" value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder="문의 제목을 입력하세요" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">내용</div>
              <textarea className="input-m" rows={6} style={{ resize: "none" }} value={form.content}
                onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))} placeholder="문의 내용을 상세히 작성해주세요" />
            </div>
            <div className="text-xs text-gray-400">회사: {userData?.companyName || ""} · 담당자: {userData?.name || user.email}</div>
            <button onClick={submit} disabled={submitting}
              className="w-full py-3 text-white rounded-xl font-semibold text-sm disabled:opacity-50"
              style={{ background: NAVY }}>
              {submitting ? "등록 중..." : "문의 등록"}
            </button>
          </div>
          <style>{`.input-m { width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; font-size: 14px; background: white; outline: none; box-sizing: border-box; }`}</style>
        </MCard>
      )}
    </div>
  );
}

// ======================================================================
// 정산
// ======================================================================
function ShipperSettlementM({ orders = [], user, userData, onBack }) {
  const [startDate, setStartDate] = useState(getMonthStart(0));
  const [endDate, setEndDate] = useState(getMonthEnd(0));
  const [sortKey, setSortKey] = useState("date_desc");
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceTransport, setInvoiceTransport] = useState("");
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  // 정산 내역서는 표(720px 고정폭)로 만들어야 이미지 저장 시 깔끔하지만, 화면에는 폭에 맞게
  // 축소해서 보여줘야 좌우 스크롤 없이 한눈에 들어온다. 화면 미리보기는 CSS scale로 축소해
  // 보여주고, 이미지 저장은 화면 밖에 항상 원본 크기로 떠 있는 별도 사본에서 캡처한다.
  const invoicePreviewWrapRef = useRef(null);
  const invoicePreviewContentRef = useRef(null);
  const [invoiceScale, setInvoiceScale] = useState(1);
  const [invoiceContentH, setInvoiceContentH] = useState(0);

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (o.상태 === "취소") return false;
      const d = String(o.상차일 || "").slice(0, 10);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }, [orders, startDate, endDate]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sortKey === "date_asc") {
      list.sort((a, b) => {
        const tierDiff = getOrderSortTier(a) - getOrderSortTier(b);
        if (tierDiff !== 0) return tierDiff;
        return String(a.상차일 || "").localeCompare(String(b.상차일 || ""));
      });
    } else if (sortKey === "amount_desc") list.sort((a, b) => (Number(b.청구운임) || 0) - (Number(a.청구운임) || 0));
    else if (sortKey === "amount_asc") list.sort((a, b) => (Number(a.청구운임) || 0) - (Number(b.청구운임) || 0));
    else {
      list.sort((a, b) => {
        const tierDiff = getOrderSortTier(a) - getOrderSortTier(b);
        if (tierDiff !== 0) return tierDiff;
        const dateDiff = String(b.상차일 || "").localeCompare(String(a.상차일 || ""));
        if (dateDiff !== 0) return dateDiff;
        return getOrderSortTime(b) - getOrderSortTime(a);
      });
    }
    return list;
  }, [filtered, sortKey]);

  const total = filtered.reduce((s, o) => s + (Number(o.청구운임) || 0), 0);

  const SORT_OPTIONS = [
    ["date_desc", "최신순"], ["date_asc", "오래된순"],
    ["amount_desc", "금액높은순"], ["amount_asc", "금액낮은순"],
  ];

  // ── 정산 내역서 ──
  const invoiceTransportOptions = useMemo(() => {
    const set = new Set();
    filtered.forEach(o => { if (o.운송사명) set.add(o.운송사명); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [filtered]);

  const invoiceRows = useMemo(() => {
    const list = invoiceTransport ? filtered.filter(o => (o.운송사명 || "") === invoiceTransport) : filtered;
    return [...list].sort((a, b) => (a.상차일 || "").localeCompare(b.상차일 || "")).map((o, i) => ({
      idx: i + 1, 상차일: o.상차일 || "", 상차지: o.상차지명 || "", 하차지: o.하차지명 || "",
      화물: o.화물내용 || "", 차량번호: o.차량번호 || "",
      공급가액: Number(o.청구운임) || 0, 세액: Math.round((Number(o.청구운임) || 0) * 0.1),
    }));
  }, [filtered, invoiceTransport]);
  const invoiceSupply = invoiceRows.reduce((s, r) => s + r.공급가액, 0);
  const invoiceTax = invoiceRows.reduce((s, r) => s + r.세액, 0);
  const invoiceTotal = invoiceSupply + invoiceTax;

  useEffect(() => {
    if (!showInvoice) return;
    const measure = () => {
      const wrap = invoicePreviewWrapRef.current;
      const content = invoicePreviewContentRef.current;
      if (!wrap || !content) return;
      const w = wrap.clientWidth;
      if (w > 0) setInvoiceScale(Math.min(1, w / 720));
      if (content.scrollHeight > 0) setInvoiceContentH(content.scrollHeight);
    };
    measure();
    // 모달이 열리는 애니메이션/레이아웃이 끝나기 전에는 폭이 0으로 잡힐 수 있어
    // ResizeObserver로 실제 크기가 잡힐 때마다 다시 계산한다 (1회성 setTimeout보다 안전).
    const ro = new ResizeObserver(measure);
    if (invoicePreviewWrapRef.current) ro.observe(invoicePreviewWrapRef.current);
    window.addEventListener("resize", measure);
    return () => { window.removeEventListener("resize", measure); ro.disconnect(); };
  }, [showInvoice, invoiceRows.length, invoiceTransport]);

  const renderInvoiceDoc = (id) => (
    <div id={id} style={{ fontFamily: "'Malgun Gothic','Apple SD Gothic Neo',sans-serif", background: "#fff", width: 720, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ background: NAVY, padding: "16px 20px" }}>
        <div style={{ fontSize: 17, fontWeight: 900, color: "#fff" }}>정산 내역서</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 3 }}>거래기간 : {startDate} ~ {endDate}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ padding: 14, borderRight: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 6, letterSpacing: "0.06em" }}>화주사 정보</div>
          <InvoiceInfoRowM label="상호" value={userData?.companyName} />
          <InvoiceInfoRowM label="담당자" value={userData?.name} />
          <InvoiceInfoRowM label="연락처" value={userData?.phone} last />
        </div>
        <div style={{ padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 6, letterSpacing: "0.06em" }}>운송사 정보</div>
          <InvoiceInfoRowM label="상호" value={invoiceTransport || `전체(${invoiceTransportOptions.length}개사)`} />
          <InvoiceInfoRowM label="건수" value={`${invoiceRows.length}건`} last />
        </div>
      </div>
      <div style={{ padding: "10px 16px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>합계금액 (공급가액+부가세)</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginTop: 2 }}>
          일금 {numberToKorean(invoiceTotal)} 원정 <span style={{ fontSize: 11, fontWeight: 400, color: "#6b7280" }}>(W {invoiceTotal.toLocaleString()})</span>
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: NAVY }}>
            {["No", "날짜", "상차지", "하차지", "화물", "차량번호", "공급가액", "세액", "합계"].map(h => (
              <th key={h} style={{ padding: "7px 6px", fontSize: 10, color: "#fff", fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {invoiceRows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
              <td style={{ padding: "6px", textAlign: "center", fontSize: 10, color: "#9ca3af" }}>{r.idx}</td>
              <td style={{ padding: "6px", fontSize: 10, color: "#374151", whiteSpace: "nowrap" }}>{r.상차일}</td>
              <td style={{ padding: "6px", fontSize: 10, color: "#374151" }}>{r.상차지}</td>
              <td style={{ padding: "6px", fontSize: 10, color: "#374151" }}>{r.하차지}</td>
              <td style={{ padding: "6px", fontSize: 10, color: "#374151" }}>{r.화물}</td>
              <td style={{ padding: "6px", fontSize: 10, color: "#374151", whiteSpace: "nowrap" }}>{r.차량번호}</td>
              <td style={{ padding: "6px", textAlign: "right", fontSize: 10, color: "#374151" }}>{r.공급가액.toLocaleString()}</td>
              <td style={{ padding: "6px", textAlign: "right", fontSize: 10, color: "#374151" }}>{r.세액.toLocaleString()}</td>
              <td style={{ padding: "6px", textAlign: "right", fontSize: 10, fontWeight: 600, color: NAVY }}>{(r.공급가액 + r.세액).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: NAVY }}>
            <td colSpan={6} style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#fff", textAlign: "center" }}>소 계</td>
            <td style={{ padding: "8px 6px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#fff" }}>{invoiceSupply.toLocaleString()}</td>
            <td style={{ padding: "8px 6px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#93c5fd" }}>{invoiceTax.toLocaleString()}</td>
            <td style={{ padding: "8px 6px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#fde68a" }}>{invoiceTotal.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
      {invoiceRows.length === 0 && (
        <div style={{ padding: 30, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>선택한 조건에 해당하는 오더가 없습니다.</div>
      )}
    </div>
  );

  const openInvoice = () => {
    if (filtered.length === 0) { alert("조회된 오더가 없습니다."); return; }
    if (!invoiceTransport && invoiceTransportOptions.length === 1) setInvoiceTransport(invoiceTransportOptions[0]);
    setShowInvoice(true);
  };

  const saveInvoiceImage = async () => {
    setInvoiceSaving(true);
    try {
      const area = document.getElementById("shipperInvoiceAreaM");
      const canvas = await html2canvas(area, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `정산내역서_${invoiceTransport || "전체"}_${startDate}~${endDate}.png`;
      a.click();
    } catch {
      alert("이미지 저장에 실패했습니다.");
    }
    setInvoiceSaving(false);
  };

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="text-gray-500 text-lg">←</button>
        <div className="font-bold text-base">정산</div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="flex gap-2">
          <input type="date" className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
            value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span className="text-gray-400 self-center text-sm">~</span>
          <input type="date" className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
            value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {[["이번달", 0], ["지난달", -1], ["전전달", -2]].map(([label, offset]) => (
            <button key={label}
              onClick={() => { setStartDate(getMonthStart(offset)); setEndDate(getMonthEnd(offset)); }}
              className="flex-1 py-1.5 text-xs rounded-lg border font-semibold text-gray-600 border-gray-200 hover:bg-gray-50">
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <KpiCard title="조회 건수" value={`${filtered.length}건`} color="text-gray-800" />
        <KpiCard title="총 청구금액" value={fmtMoney(total)} color="text-[#1B2B4B]" />
      </div>

      <button onClick={openInvoice}
        className="w-full py-2.5 rounded-xl border font-semibold text-sm"
        style={{ borderColor: NAVY, color: NAVY }}>
        정산 내역서 보기
      </button>

      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-gray-700">오더 목록 ({sorted.length}건)</div>
        <select className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
          value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
          {SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-10 bg-white rounded-xl border">해당 기간 데이터가 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {sorted.map(o => <OrderCard key={o.id} order={o} onSelect={() => {}} />)}
        </div>
      )}

      {/* 정산 내역서 미리보기 */}
      {showInvoice && (
        <div className="fixed inset-0 z-[9999] flex flex-col justify-end" onClick={() => setShowInvoice(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-white rounded-t-3xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 shrink-0">
              <div>
                <div className="font-bold text-[15px]" style={{ color: NAVY }}>정산 내역서</div>
                <div className="text-[11px] text-gray-400">{startDate} ~ {endDate}</div>
              </div>
              <button onClick={() => setShowInvoice(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-lg font-bold">×</button>
            </div>
            <div className="px-4 py-2 border-b border-gray-100 shrink-0">
              <select value={invoiceTransport} onChange={e => setInvoiceTransport(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                <option value="">운송사 전체</option>
                {invoiceTransportOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex-1 overflow-auto p-3 bg-gray-100">
              {/* 화면 폭에 맞춰 축소 표시하되, 혹시 축소 계산이 늦거나 빗나가도
                  내용이 잘리지 않고 좌우로 스크롤해서 볼 수 있도록 한다. */}
              <div ref={invoicePreviewWrapRef}>
                <div style={{ height: invoiceContentH ? invoiceContentH * invoiceScale : undefined }}>
                  <div ref={invoicePreviewContentRef} style={{ transform: `scale(${invoiceScale})`, transformOrigin: "top left", width: 720 }}>
                    {renderInvoiceDoc()}
                  </div>
                </div>
              </div>
            </div>
            {/* 이미지 저장 전용 원본 크기 사본(화면에는 보이지 않음, 항상 720px 그대로 유지) */}
            <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }} aria-hidden="true">
              {renderInvoiceDoc("shipperInvoiceAreaM")}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 shrink-0" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
              <button onClick={saveInvoiceImage} disabled={invoiceSaving}
                className="w-full py-3 text-white rounded-xl font-semibold text-sm disabled:opacity-50" style={{ background: NAVY }}>
                {invoiceSaving ? "저장 중..." : "이미지로 저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceInfoRowM({ label, value, last = false }) {
  return (
    <div style={{ display: "flex", padding: "4px 0", borderBottom: last ? "none" : "1px solid #f3f4f6" }}>
      <div style={{ width: 48, color: "#6b7280", fontWeight: 600, fontSize: 11 }}>{label}</div>
      <div style={{ color: "#111827", fontWeight: 500, fontSize: 11 }}>{value || "-"}</div>
    </div>
  );
}

// ======================================================================
// 설정
// ======================================================================
function ShipperSettingsM({ onBack, showToast, uiScale, setUiScale }) {
  const [notifyEnabled, setNotifyEnabled] = useState(() => localStorage.getItem("messengerNotifyEnabled") !== "0");
  const [vibrateEnabled, setVibrateEnabled] = useState(() => localStorage.getItem("messengerVibrateEnabled") !== "0");

  const toggleNotify = () => {
    setNotifyEnabled(prev => {
      const next = !prev;
      localStorage.setItem("messengerNotifyEnabled", next ? "1" : "0");
      return next;
    });
  };
  const toggleVibrate = () => {
    setVibrateEnabled(prev => {
      const next = !prev;
      localStorage.setItem("messengerVibrateEnabled", next ? "1" : "0");
      return next;
    });
  };

  const clearCache = () => {
    if (!window.confirm("저장된 운송사 목록, 임시 설정을 초기화하시겠습니까?\n(등록된 오더 데이터에는 영향이 없습니다)")) return;
    ["transportList", "fixedTransport", "shipperUiScale"].forEach(k => localStorage.removeItem(k));
    showToast?.("초기화되었습니다.");
  };

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="text-gray-500 text-lg">←</button>
        <div className="font-bold text-base">설정</div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <SettingsGroup label="화면">
          <MRow label="글씨 크기">
            <div className="flex gap-1.5">
              {[["기본", 1], ["크게", 1.1], ["아주 크게", 1.2]].map(([label, v]) => (
                <button key={v} onClick={() => { setUiScale(v); localStorage.setItem("shipperUiScale", v); }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${uiScale === v ? "text-white border-transparent" : "text-gray-600 border-gray-200"}`}
                  style={uiScale === v ? { background: NAVY } : {}}>
                  {label}
                </button>
              ))}
            </div>
          </MRow>
        </SettingsGroup>

        <SettingsGroup label="알림">
          <MRow label="새 메시지 알림">
            <ToggleRow checked={notifyEnabled} onChange={toggleNotify} desc="메신저로 메시지가 오면 화면 상단에 알림을 표시합니다." />
          </MRow>
          <MRow label="진동 알림">
            <ToggleRow checked={vibrateEnabled} onChange={toggleVibrate} desc="새 메시지 수신 시 진동으로 알려줍니다." />
          </MRow>
        </SettingsGroup>

        <SettingsGroup label="기타" last>
          <MRow label="임시 데이터 초기화">
            <button onClick={clearCache} className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              초기화
            </button>
          </MRow>
          <MRow label="앱 버전">
            <span className="text-xs text-gray-400">KP-Flow 화주 모바일</span>
          </MRow>
        </SettingsGroup>
      </div>
    </div>
  );
}

function SettingsGroup({ label, children, last = false }) {
  return (
    <div className={last ? "" : "border-b border-gray-100"}>
      <div className="px-3 pt-3 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  );
}

function ToggleRow({ checked, onChange, desc }) {
  return (
    <div>
      <button onClick={onChange}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${checked ? "bg-blue-600" : "bg-gray-300"}`}
        style={checked ? { background: NAVY } : {}}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
      {desc && <div className="text-[11px] text-gray-400 mt-1.5 leading-snug">{desc}</div>}
    </div>
  );
}

// ======================================================================
// 공통 컴포넌트
// ======================================================================
function OrderCard({ order, onSelect, onEdit, user }) {
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showEditPopup, setShowEditPopup] = useState(false);
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);
  const isCanceled = ["취소", "배차취소", "오더취소"].includes(order.상태);
  const isRecentlyEditedByTransport = order.최종수정출처 === "transport" && (Date.now() - toMillis(order.최종수정일시)) < 1000 * 60 * 60 * 48;

  const startLongPress = () => {
    if (isCanceled) return;
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      navigator.vibrate?.(15);
      setShowActionSheet(true);
    }, 480);
  };
  const cancelLongPress = () => {
    clearTimeout(longPressTimer.current);
  };
  const handleClick = (e) => {
    if (longPressFired.current) { e.preventDefault(); e.stopPropagation(); longPressFired.current = false; return; }
    onSelect?.();
  };

  const handleEdit = () => {
    setShowActionSheet(false);
    onEdit?.(order);
  };
  const handleDelete = async () => {
    setShowActionSheet(false);
    await shipperDeleteOrRequestCancel(order, user);
  };
  const handleSwapDriver = async () => {
    setShowActionSheet(false);
    await shipperRequestDriverSwap(order, user);
  };

  return (
    <div
      className="relative bg-white rounded-2xl border border-gray-200 shadow-sm px-3 py-3 active:scale-[0.99] transition"
      onClick={handleClick}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onTouchCancel={cancelLongPress}
      onContextMenu={(e) => { e.preventDefault(); if (!isCanceled) setShowActionSheet(true); }}
    >
      <div className="flex justify-between items-start mb-1">
        <div className="text-sm font-semibold text-gray-800 truncate flex-1">
          {order.상차지명 || "-"} → {order.하차지명 || "-"}
        </div>
        <StatusBadge order={order} className="ml-2" />
      </div>
      <div className="text-xs text-gray-500">
        {order.상차일 || "-"} {order.상차시간 ? fmt12(order.상차시간) : ""}
        {order.상차시간구분 && order.상차시간구분 !== "정각" ? ` ${order.상차시간구분}` : ""}
        {order.차량톤수 && ` · ${order.차량톤수}`}
        {order.차량종류 && ` ${order.차량종류}`}
      </div>
      {(order.청구운임 > 0) && (
        <div className="text-xs text-blue-600 font-semibold mt-0.5">{fmtMoney(order.청구운임)}</div>
      )}
      {(order.attachCount > 0) && (
        <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">사진 {order.attachCount}장</div>
      )}
      {isRecentlyEditedByTransport && (
        <div className="mt-0.5">
          <style>{`@keyframes transportEditDotBlink { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowEditPopup(true); }}
            className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" style={{ animation: "transportEditDotBlink 1.6s ease-in-out infinite" }} />
            운송사 수정
          </button>
        </div>
      )}
      {showEditPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999] px-6" onClick={(e) => { e.stopPropagation(); setShowEditPopup(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[360px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-5 py-3.5">
              <h3 className="text-white font-bold text-[14px]">운송사 수정 내역</h3>
            </div>
            <div className="px-5 py-4 max-h-[320px] overflow-y-auto">
              {(() => {
                const entries = getTransportEditEntries(order);
                if (entries.length === 0) return <p className="text-[13px] text-gray-500">변경 내역을 확인할 수 없습니다.</p>;
                return (
                  <div className="space-y-3">
                    {entries.map((h, i) => (
                      <div key={i} className="text-[13px] text-gray-800 leading-relaxed pb-3 border-b border-gray-50 last:border-b-0 last:pb-0">
                        <span className="font-bold text-[#1B2B4B]">{order.운송사명 || "운송사"}</span>에서{" "}
                        <span className="font-bold">{TRANSPORT_EDIT_FIELD_LABELS[h.field] || h.field}</span>을(를) 변경했습니다.
                        <div className="mt-1 text-[12px] text-gray-500">
                          {String(h.before ?? "없음") || "없음"} <span className="mx-1 text-gray-300">→</span>{" "}
                          <span className="font-semibold text-emerald-700">{String(h.after ?? "없음") || "없음"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="border-t border-gray-100 px-5 py-3 bg-gray-50 flex justify-end">
              <button onClick={() => setShowEditPopup(false)} className="px-4 py-1.5 bg-[#1B2B4B] text-white text-[12px] font-bold rounded-lg">닫기</button>
            </div>
          </div>
        </div>
      )}
      {order.수정요청 && (
        <div className="mt-0.5">
          <span className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-300 px-1.5 py-0.5 rounded">수정승인대기</span>
        </div>
      )}
      {!order.차량번호 && order.배차거절 === true && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <RequestHoldActions order={order} />
        </div>
      )}
      {showActionSheet && (
        <OrderCardActionSheet
          order={order}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onSwapDriver={handleSwapDriver}
          onClose={() => setShowActionSheet(false)}
        />
      )}
    </div>
  );
}

function OrderCardActionSheet({ order, onEdit, onDelete, onSwapDriver, onClose }) {
  const isDispatched = !!(order.차량번호 && String(order.차량번호).trim());
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-t-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="px-4 pt-1 pb-2 text-[13px] text-gray-400 font-semibold truncate">
          {order.상차지명 || "-"} → {order.하차지명 || "-"}
        </div>
        <button onClick={onEdit} className="w-full text-left px-4 py-3.5 text-[15px] font-semibold text-gray-800 border-t border-gray-100">
          수정
        </button>
        {isDispatched && (
          <button onClick={onSwapDriver} className="w-full text-left px-4 py-3.5 text-[15px] font-semibold text-orange-500 border-t border-gray-100">
            기사변경요청
          </button>
        )}
        <button onClick={onDelete} className="w-full text-left px-4 py-3.5 text-[15px] font-semibold text-red-500 border-t border-gray-100">
          오더취소
        </button>
        <button onClick={onClose} className="w-full text-center px-4 py-3.5 text-[15px] font-semibold text-gray-400 border-t border-gray-100 mb-2">
          닫기
        </button>
      </div>
    </div>
  );
}

function KpiCard({ title, value, color }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
      <div className="text-xs text-gray-400 mb-1">{title}</div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}><OdometerNumber value={value} /></div>
    </div>
  );
}

function MSection({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 border-b text-xs font-bold text-white" style={{ background: NAVY }}>{title}</div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

function MRow({ label, children }) {
  return (
    <div className="flex items-start px-3 py-2 gap-2">
      <div className="w-20 text-xs text-gray-500 pt-2 shrink-0">{label}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function MCard({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {title && <div className="px-3 py-2 border-b text-xs font-bold text-white" style={{ background: NAVY }}>{title}</div>}
      <div className="px-3 py-2 divide-y">{children}</div>
    </div>
  );
}

function MDetailRow({ label, value }) {
  return (
    <div className="flex items-center py-1.5 gap-2">
      <div className="w-20 text-xs text-gray-400 shrink-0 text-center">{label}</div>
      <div className="flex-1 text-sm text-gray-800 font-medium">{value}</div>
    </div>
  );
}

function TabBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex-1 flex flex-col items-center py-3 text-xs gap-0.5 font-semibold ${active ? "text-[#1e3a5f]" : "text-gray-400"}`}>
      <div className={`w-1.5 h-1.5 rounded-full mb-0.5 ${active ? "bg-[#1e3a5f]" : "bg-transparent"}`} />
      {label}
    </button>
  );
}

function MMenuItem({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition ${active ? "text-white" : "hover:bg-gray-100 text-gray-700"}`}
      style={active ? { background: NAVY } : {}}>
      {label}
    </button>
  );
}
