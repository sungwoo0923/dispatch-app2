// ======================= src/mobile/MobileApp.jsx (PART 1/3) =======================
import MobileFleetView from "./MobileFleetView";
import MobileIntelView from "./MobileIntelView";
import React, { useState, useMemo, useEffect, useRef, startTransition } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { signOut } from "firebase/auth";
import { version as APP_VERSION } from "../../package.json";



// 🔥 role 기반 컬렉션 분기
const role = localStorage.getItem("role") || "user";
const collName = "dispatch";

// 배차중 뱃지 pulse 애니메이션 CSS (한 번만 삽입)
if (typeof document !== "undefined" && !document.getElementById("__mobile-badge-style")) {
  const s = document.createElement("style");
  s.id = "__mobile-badge-style";
  s.textContent = `
    @keyframes dispatchingPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.2; }
    }
    .badge-dispatching {
      animation: dispatchingPulse 2.6s ease-in-out infinite;
    }
  `;
  document.head.appendChild(s);
}

// 🔙 뒤로가기 아이콘 버튼
// ── 스와이프 액션 로우 (iOS Messages 스타일) ──────────────────────────────
function SwipeableRow({ children, onDelete, onCopyOrder, onCopyDriver, disabled }) {
  const BUTTON_W = 220;
  const SNAP_THRESHOLD = 55;
  const DIR_THRESHOLD = 7; // px before deciding horiz vs vert

  const containerRef = React.useRef(null);
  const innerRef = React.useRef(null);
  const startX = React.useRef(0);
  const startY = React.useRef(0);
  const isHoriz = React.useRef(null); // null=undecided
  const dragging = React.useRef(false);
  const curX = React.useRef(0);
  const openRef = React.useRef(false);
  const [open, setOpen] = React.useState(false);

  const applyTranslate = (x, animate) => {
    const el = innerRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform 0.24s cubic-bezier(.4,0,.2,1)" : "none";
    el.style.transform = x === 0 ? "none" : `translate3d(${x}px,0,0)`;
  };

  const doClose = React.useCallback(() => {
    applyTranslate(0, true);
    curX.current = 0;
    openRef.current = false;
    setOpen(false);
  }, []);

  const doOpen = React.useCallback(() => {
    applyTranslate(-BUTTON_W, true);
    curX.current = -BUTTON_W;
    openRef.current = true;
    setOpen(true);
  }, []);

  // Native listeners — passive:false on touchmove so preventDefault() works
  React.useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const onStart = (e) => {
      if (disabled) return;
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      isHoriz.current = null;
      dragging.current = true;
      // Don't touch DOM yet — wait for direction
    };

    const onMove = (e) => {
      if (!dragging.current || disabled) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;

      if (isHoriz.current === null) {
        if (Math.abs(dx) > DIR_THRESHOLD || Math.abs(dy) > DIR_THRESHOLD) {
          isHoriz.current = Math.abs(dx) > Math.abs(dy);
          if (!isHoriz.current) {
            // Vertical — bail immediately
            dragging.current = false;
            return;
          }
          // Horizontal — freeze any running CSS transition at current position
          applyTranslate(curX.current, false);
        }
        return;
      }

      if (!isHoriz.current) return;
      e.preventDefault(); // Works because passive:false
      const base = openRef.current ? -BUTTON_W : 0;
      const next = Math.min(0, Math.max(-BUTTON_W, base + dx));
      applyTranslate(next, false);
      curX.current = next;
    };

    const onEnd = () => {
      if (!dragging.current) return;
      const wasHoriz = isHoriz.current;
      dragging.current = false;
      isHoriz.current = null;
      if (!wasHoriz) return;
      if (openRef.current) {
        curX.current > -BUTTON_W + SNAP_THRESHOLD ? doClose() : doOpen();
      } else {
        curX.current < -SNAP_THRESHOLD ? doOpen() : doClose();
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [disabled, doClose, doOpen]);

  // Close when tapping elsewhere
  React.useEffect(() => {
    if (!open) return;
    const onOut = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) doClose();
    };
    document.addEventListener("touchstart", onOut, { passive: true });
    return () => document.removeEventListener("touchstart", onOut);
  }, [open, doClose]);

  // Close when multiSelect activates
  React.useEffect(() => {
    if (disabled && openRef.current) doClose();
  }, [disabled, doClose]);

  return (
    <div ref={containerRef} className="relative overflow-hidden" style={{ borderRadius: "inherit", transform: "translateZ(0)" }}>
      {/* 액션 버튼 (카드 뒤에 숨어있다가 스와이프로 노출) */}
      <div className="absolute right-0 top-0 bottom-0 flex" style={{ width: BUTTON_W }}>
        <button
          className="flex-1 flex flex-col items-center justify-center gap-1"
          style={{ background: "#4B5563" }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); doClose(); onCopyOrder?.(); }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          <span style={{ color: "white", fontSize: 11, fontWeight: 600 }}>오더복사</span>
        </button>
        <button
          className="flex-1 flex flex-col items-center justify-center gap-1"
          style={{ background: "#2563EB" }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); doClose(); onCopyDriver?.(); }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="7" r="4"/>
            <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/>
            <path d="M19 8v6M22 11h-6"/>
          </svg>
          <span style={{ color: "white", fontSize: 11, fontWeight: 600 }}>기사복사</span>
        </button>
        <button
          className="flex-1 flex flex-col items-center justify-center gap-1"
          style={{ background: "#EF4444" }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); doClose(); onDelete?.(); }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
          <span style={{ color: "white", fontSize: 11, fontWeight: 600 }}>삭제</span>
        </button>
      </div>

      {/* 카드 슬라이딩 레이어 — white background으로 액션버튼 완전 차폐 */}
      <div
        ref={innerRef}
        style={{ background: "white", position: "relative", zIndex: 1 }}
      >
        {children}
      </div>
    </div>
  );
}

function BackIconButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded-full active:scale-95 bg-white"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        stroke="#222"
        strokeWidth="2.3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </button>
  );
}

// ------------------------------------------------------------------
// 공통 유틸
// ------------------------------------------------------------------
const toNumber = (v) =>
  Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;

const fmtMoney = (v) =>
  `${Number(v || 0).toLocaleString("ko-KR")}원`;
// 🔥 검색용 정규화 (여기에 추가)
const normalize = (s = "") =>
  String(s)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\w가-힣]/g, "");
    // 🔥 거래처/지명 공통 정규화 (★ 핵심)
const normalizeCompany = (s = "") =>
  String(s)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\uAC00-\uD7A3a-z0-9]/g, "");
    // ✅ 한국(KST) 기준 날짜 유틸 (🔥 여기!)
const todayKST = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

const thisMonthKST = () => todayKST().slice(0, 7);

// ✅ ⬇⬇⬇ 여기 추가 ⬇⬇⬇
const normalizeKoreanTime = (t = "") => {
  if (!t) return "";
  if (t.includes("오전")) {
    const n = Number(t.replace("오전", "").replace(":00", "").trim());
    return `${String(n).padStart(2, "0")}:00`;
  }
  if (t.includes("오후")) {
    const n = Number(t.replace("오후", "").replace(":00", "").trim());
    const h = n === 12 ? 12 : n + 12;
    return `${String(h).padStart(2, "0")}:00`;
  }
  return t;
};
// ✅ ✅ ✅ 여기 추가 (이 위치!)
const buildHalfHourTimes = () => {
  const list = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? "오전" : "오후";
      if (m === 0) {
        list.push(`${ampm} ${hour12}시`);
      } else {
        list.push(`${ampm} ${hour12}시 ${m}분`);
      }
    }
  }
  return list;
};

const HALF_HOUR_TIMES = buildHalfHourTimes();
// ✅ ⬆⬆⬆ 여기까지 ⬆⬆⬆
// 상차일 기준 날짜 뽑기(PC/모바일 공통 대응)
const getPickupDate = (o = {}) => {
  return String(o.상차일 || "").slice(0, 10);
};

// 청구운임 / 인수증
const getClaim = (o = {}) => o.청구운임 ?? o.인수증 ?? 0;

// 좁은 화면용 금액 축약 표시 (만원/억원)
const fmtM = (v) => {
  const n = Number(v) || 0;
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억원`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
};

// 경유지 배열 안전 파싱
const safeParseStops = (raw) => {
  if (Array.isArray(raw) && raw.length > 0) return raw;
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch {}
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const keys = Object.keys(raw);
    if (keys.length > 0 && keys.every(k => /^\d+$/.test(k)))
      return keys.sort((a, b) => Number(a) - Number(b)).map(k => raw[k]);
    if (raw.업체명) return [raw];
  }
  return [];
};

const validStops = (raw) =>
  safeParseStops(raw).filter(s => s && typeof s === "object" && (s.업체명?.trim() || s.주소?.trim()));

// 산재보험료
const getSanjae = (o = {}) => o.산재보험료 ?? 0;

const shortAddr = (addr = "") => {
  const parts = String(addr).trim().split(/\s+/);
  if (parts.length < 2) return "";

  // 1️⃣ 광역단위 축약
  let region = parts[0]
    .replace("특별시", "")
    .replace("광역시", "")
    .replace("자치시", "")
    .replace("특별자치시", "")
    .replace("도", "");

  // 🔹 경기도 → 경기
  if (region.endsWith("도")) {
    region = region.replace("도", "");
  }

  // 2️⃣ 두번째 행정단위 (시 or 구)
  const second = parts[1];

  // 서울 강남구
  if (second.endsWith("구")) {
    return `${region} ${second}`;
  }

  // 경기도 수원시
  if (second.endsWith("시")) {
    return `${region} ${second}`;
  }

  // 군 단위도 대응
  if (second.endsWith("군")) {
    return `${region} ${second}`;
  }

  return `${region} ${second}`;
};

// 날짜 헤더: 2025-11-24 → 11.24(월)
const weekday = ["일", "월", "화", "수", "목", "금", "토"];
const formatDateHeader = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const w = weekday[d.getDay()] ?? "";
  return `${m}.${day}(${w})`;
};

// 상단 범위 표시: 2025-11-24, 2025-11-24 → 11.24 ~ 11.24
const formatRangeShort = (s, e) => {
  if (!s && !e) return "";
  const ss = s ? s.slice(5).replace("-", ".") : "";
  const ee = e ? e.slice(5).replace("-", ".") : "";
  return `${ss} ~ ${ee || ss}`;
};
const getHandoverDate = (h) => {
  if (h?.date) return h.date;

  if (h?.createdAt?.seconds) {
    return new Date(h.createdAt.seconds * 1000)
      .toISOString()
      .slice(0, 10);
  }

  return "";
};
// 오늘 / 내일 / 기타 → 당일/내일/어제 or MM/DD
const getDayBadge = (dateStr) => {

  if (!dateStr) return "";
  const now = new Date();
const today = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const target = new Date(dateStr);

  const diff =
  Math.floor(
    (
      new Date(target.getFullYear(), target.getMonth(), target.getDate()) -
      new Date(today.getFullYear(), today.getMonth(), today.getDate())
    ) / (1000 * 60 * 60 * 24)
  );
  if (diff === 0) return "당일";
  if (diff === 1) return "내일";
  if (diff === -1) return "어제";
  const m = String(target.getMonth() + 1).padStart(2, "0");
  const d = String(target.getDate()).padStart(2, "0");
  return `${m}/${d}`;
};

// 상/하차방법 코드(지/수/직수/수도)
const methodCode = (m = "") => {
  if (!m) return "";
  if (m.includes("직접")) return "직수";
  if (m.includes("수도움")) return "수도";
  if (m.includes("지게차")) return "지";
  if (m.includes("수작업")) return "수";
  return "";
};

// 작업코드 색상: 수(노란) / 지(주황) / 수도(검정) / 직수(파랑)
const methodColor = (code) => {
  if (code === "수") return "bg-yellow-200 text-yellow-800";
  if (code === "지") return "bg-orange-200 text-orange-800";
  if (code === "수도") return "bg-black text-white";
  if (code === "직수") return "bg-blue-200 text-blue-800";
  return "bg-gray-100 text-gray-700";
};


function buildOrderCopyText(order) {
  // 날짜 + 요일
  const dateStr = order.상차일 || "";
  let weekday = "";
  if (dateStr) {
    const d = new Date(dateStr);
    const w = ["일", "월", "화", "수", "목", "금", "토"];
    weekday = `(${w[d.getDay()]})`;
  }

  // 지급방식 문구
  let payText = order.지급방식 || "";
  if (payText === "계산서") payText = "부가세별도";
  if (payText === "선불") payText = "선불";
  if (payText === "착불") payText = "착불";

  const money = Number(order.청구운임 || 0).toLocaleString();

  return [
    `${dateStr}${weekday}`,
    ``,
    `${order.상차지명 || "-"} → ${order.하차지명 || "-"}`,
    `${order.상차지주소 || "-"} → ${order.하차지주소 || "-"}`,
    ``,
    `${order.화물내용 || "-"} ${order.차량톤수 || order.톤수 || ""} ${order.차량종류 || order.차종 || ""}`.trim(),
    ``,
    `${order.차량번호 || "-"} ${order.기사명 || ""} ${order.전화번호 || ""}`.trim(),
    `${money}원 ${payText} 배차되었습니다.`,
  ].join("\n");
}
// ✅✅✅ 여기 (이 위치가 정답)
function buildOrderTemplateCopyText(order) {
  const todayStr = todayKST();

  return [
    `오더복사 (${todayStr})`,
    ``,
    `[상차]`,
    `${order.상차지명 || ""}`,
    `${order.상차지주소 || ""}`,
    ``,
    `[하차]`,
    `${order.하차지명 || ""}`,
    `${order.하차지주소 || ""}`,
    ``,
    `[조건]`,
    `배차방식: ${order.배차방식 || ""}`,
    `지급방식: ${order.지급방식 || ""}`,
    ``,
    `[차량]`,
    `차량종류: ${order.차량종류 || order.차종 || ""}`,
    `톤수: ${order.차량톤수 || order.톤수 || ""}`,
    ``,
    `[화물]`,
    `${order.화물내용 || ""}`,
    ``,
    `[작업방식]`,
    `상차: ${order.상차방법 || ""}`,
    `하차: ${order.하차방법 || ""}`,
    ``,
    `[청구운임]`,
    `${Number(order.청구운임 || 0).toLocaleString()}원`,
  ].join("\n");
}

// 🔥 상태 문자열: 차량번호 유무로만 결정
// 차량번호 없음 → "배차중", 있으면 → "배차완료"
const getStatus = (o = {}) => {
  const car = String(o.차량번호 || "").trim();
  return car ? "배차완료" : "배차중";
};
// 긴급 오더 판단 (PC/모바일 공통)
const isUrgentOrder = (o = {}) => {
  return o.긴급 === true;
};
const normalizePhone = (p = "") =>
  String(p).replace(/[^\d+]/g, "");
// ======================================================================
//  메인 컴포넌트
// ======================================================================

export default function MobileApp({ role, user, userCompany = "" }) {
  useEffect(() => {
    const root = document.getElementById("root");
    if (root) root.style.zoom = "1";
    // 모바일에서 핀치줌 비활성화 — 기본 크기 고정
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";
    return () => {
      if (meta) meta.content = "width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover";
    };
  }, []);
  const [page, setPage] = useState("list");
  const listScrollYRef = useRef(0); // 리스트 스크롤 위치 저장
  const unassignedScrollYRef = useRef(0); // 미배차/정보미전달 스크롤 위치 저장
  const [unassignedTab, setUnassignedTab] = useState("미배차"); // 탭 상태 (부모에서 관리)

  // 상세→리스트 복귀 시 스크롤 위치 복원
  useEffect(() => {
    if (page === "list" && listScrollYRef.current > 0) {
      const y = listScrollYRef.current;
      requestAnimationFrame(() => { window.scrollTo(0, y); });
    }
    if (page === "unassigned" && unassignedScrollYRef.current > 0) {
      const y = unassignedScrollYRef.current;
      requestAnimationFrame(() => { window.scrollTo(0, y); });
    }
  }, [page]);
  // 🎨 테마 상태 (기본: navy)
const [theme, setTheme] = useState(
  localStorage.getItem("appTheme") || "navy"
);

// 🎨 테마 적용
useEffect(() => {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("appTheme", theme);
}, [theme]);

const toggleTheme = () => {
  setTheme(prev => prev === "navy" ? "white" : "navy");
};
  const [prevPage, setPrevPage] = useState("list");
  const [showSimilarPopup, setShowSimilarPopup] = useState(false);
const [fallbackData, setFallbackData] = useState([]);
const [showUnassignedEntryPopup, setShowUnassignedEntryPopup] = useState(false);
const [ordersLoaded, setOrdersLoaded] = useState(false);
const [focusUnassignedOrderId, setFocusUnassignedOrderId] = useState(null);
const popupLastShownDateRef = useRef(null);        // 마지막으로 팝업을 띄운 KST 날짜(YYYY-MM-DD)
const pendingPopupRef = useRef(false);             // 자정에 list가 아니면, list로 돌아왔을 때 띄우기
const pageRef = useRef("list");
const unassignedCountRef = useRef(0);
const backPressCountRef = useRef(0);
const backPressTimerRef = useRef(null);

// 🔙 안드로이드 뒤로가기 2번 처리
useEffect(() => {
  window.history.pushState(null, '', window.location.href);

  const handlePopState = () => {
    if (pageRef.current !== "list") {
      setPage("list");
      window.history.pushState(null, '', window.location.href);
      backPressCountRef.current = 0;
    } else {
      backPressCountRef.current += 1;

      if (backPressCountRef.current === 1) {
        setToast("한 번 더 누르면 앱이 종료됩니다");
        if (backPressTimerRef.current) clearTimeout(backPressTimerRef.current);
        backPressTimerRef.current = setTimeout(() => {
          backPressCountRef.current = 0;
          window.history.pushState(null, '', window.location.href);
        }, 2000);
      }
      // 2번째는 history가 없어서 앱 자연 종료
    }
  };

  window.addEventListener('popstate', handlePopState);
  return () => {
    window.removeEventListener('popstate', handlePopState);
    if (backPressTimerRef.current) clearTimeout(backPressTimerRef.current);
  };
}, []);
const alarmEnabledRef = useRef(true);              // 🔔 알람 ref
const initialLoadDoneRef = useRef({});             // 🔔 최초로드 구분
const dispatchPrevStatus = React.useRef({});       // 🔔 배차상태 추적
const notifiedOrderIdsRef = useRef(new Set());     // 🔔 중복알림 방지
  // 🔕 알림 ON/OFF 상태 (기본 ON)
const [alarmEnabled, setAlarmEnabled] = useState(
  localStorage.getItem("alarmEnabled") !== "false"
);
const [handovers, setHandovers] = useState([]);
const [currentUser, setCurrentUser] = useState(null);
const [mobileUsers, setMobileUsers] = useState([]);
const [loginTime] = useState(() => new Date());
const [handoverOpen, setHandoverOpen] = useState(false);
const [handoverForm, setHandoverForm] = useState({ text: "", receiver: "", receiverUid: "", date: todayKST() });
const [selectedHandover, setSelectedHandover] = useState(null);
const [handoverEditMode, setHandoverEditMode] = useState(false);
// 🔁 토글 함수
const toggleAlarm = () => {
  setAlarmEnabled((prev) => {
    const next = !prev;
    localStorage.setItem("alarmEnabled", String(next));

    // 🔥 알림을 다시 켤 때 mute 해제
    if (next) {
      setToastMuted(false);
    }

    return next;
  });
};
// 🔔 Notification bell state
const [notifications, setNotifications] = useState(() => {
  try { return JSON.parse(localStorage.getItem("mobileNotifs") || "[]"); } catch { return []; }
});
const [showNotifPanel, setShowNotifPanel] = useState(false);
const unreadCount = notifications.filter(n => !n.read).length;

const addNotification = (type, orderData) => {
  const notifKey = `${type}_${orderData.id || ""}`;
  if (notifiedOrderIdsRef.current.has(notifKey)) return;
  notifiedOrderIdsRef.current.add(notifKey);

  const notif = {
    id: `${Date.now()}_${orderData.id || ""}`,
    type,
    orderId: orderData.id || "",
    거래처명: orderData.거래처명 || "",
    상차지명: orderData.상차지명 || "",
    하차지명: orderData.하차지명 || "",
    상차일: orderData.상차일 || "",
    차량번호: orderData.차량번호 || "",
    이름: orderData.이름 || "",
    date: new Date().toISOString(),
    read: false,
  };
  setNotifications(prev => {
    const next = [notif, ...prev].slice(0, 50);
    localStorage.setItem("mobileNotifs", JSON.stringify(next));
    return next;
  });
};

const markAllRead = () => {
  setNotifications(prev => {
    const next = prev.map(n => ({ ...n, read: true }));
    localStorage.setItem("mobileNotifs", JSON.stringify(next));
    return next;
  });
};

const clearNotifs = () => {
  setNotifications([]);
  localStorage.removeItem("mobileNotifs");
  // notifiedOrderIdsRef는 유지 → 기존 오더가 재연결 시 다시 뜨는 것 방지
  // (이후 새로 등록되는 오더만 알림 발생)
};

// 🔔 alarmEnabled → ref 동기화
useEffect(() => {
  alarmEnabledRef.current = alarmEnabled;
}, [alarmEnabled]);

// 🔔 알림 권한 요청 (최초 1회)
useEffect(() => {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission();
  }
}, []);
// 🔔 공지 / 일정 (PC 연동)
const [notices, setNotices] = useState([]);
const [schedules, setSchedules] = useState([]);
const sortedSchedules = [...schedules].sort((a, b) => {
  const da = a.startDate || a.start || "";
  const db = b.startDate || b.start || "";
  return db.localeCompare(da);
});
// 🆕 NEW 뱃지 상태
const [hasNewNotice, setHasNewNotice] = useState(false);
const [hasNewSchedule, setHasNewSchedule] = useState(false);
const [selectedSchedule, setSelectedSchedule] = useState(null);
const [selectedNotice, setSelectedNotice] = useState(null);
const [noticeOpen, setNoticeOpen] = useState(false);
const [noticeForm, setNoticeForm] = useState({ title: "", author: "", content: "" });
const [scheduleOpen, setScheduleOpen] = useState(false);
const [scheduleForm, setScheduleForm] = useState({ type: "휴가", start: "", end: "", memo: "" });
  // -------------------------------------------------------------
  // 🔥 추가: 빠른 날짜 선택 (1/3/7/15일 버튼)
  // -------------------------------------------------------------
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // ✅ 당일 / 내일 빠른 선택용
const setTodayRange = () => {
  const t = todayKST();
  setStartDate(t);
  setEndDate(t);
};

const setTomorrowRange = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setDate(kst.getDate() + 1);
  const tmr = kst.toISOString().slice(0, 10);
  setStartDate(tmr);
  setEndDate(tmr);
};
  // 🔍 UI 크기 스케일 (1 = 기본, 1.1 = 크게, 1.2 = 아주 크게)
  const [uiScale, setUiScale] = useState(
    Number(localStorage.getItem("uiScale") || 1)
  );
const quickRange = (days) => {
  const end = todayKST();

  const startObj = new Date();
  startObj.setDate(startObj.getDate() - (days - 1));

  const startKST = new Date(startObj.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  setStartDate(startKST);
  setEndDate(end);
};

  // 날짜별 그룹핑
  const groupByDate = (list = []) => {
    const map = new Map();
    for (const o of list) {
      const d = getPickupDate(o) || "기타";
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(o);
    }
    return map;
  };

  const [toast, setToast] = useState("");
  const [toastMuted, setToastMuted] = useState(false);
  const [quickAssignTarget, setQuickAssignTarget] = useState(null);
  const [successBanner, setSuccessBanner] = useState(null);

  const showToast = (msg) => {
  if (toastMuted) return;   // 🔥 추가
  setToast(msg);
  setTimeout(() => setToast(""), 2000);
};

  const showSuccess = (msg) => {
    setSuccessBanner(msg);
    setTimeout(() => setSuccessBanner(null), 2000);
};

  // --------------------------------------------------
  // 1. Firestore 실시간 연동 (🔥 전체 데이터 — PC와 동일)
  // --------------------------------------------------
  const [orders, setOrders] = useState([]);
  const pullStartYRef = useRef(0);
  const pullDistanceRef = useRef(0);
const [isRefreshing, setIsRefreshing] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [clients, setClients] = useState([]);
  const [places, setPlaces] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

// MobileApp 스코프: clients(Firestore) + places(Firestore) 통합 검색용 (places 우선)
// MobileOrderForm/Detail에는 이미 merged된 clients prop이 전달되므로 여기서만 사용
const mergedCompanies = useMemo(() => {
  const map = new Map();
  clients.forEach(c => { const k = normalizeCompany(c.거래처명); if (k) map.set(k, c); });
  places.forEach(p => { const k = normalizeCompany(p.거래처명); if (k) map.set(k, p); });
  return Array.from(map.values());
}, [clients, places]);
const handleRefresh = () => {
  if (isRefreshing) return;

  setIsRefreshing(true);
  showToast("새로고침 중...");

  setTimeout(() => {
    setRefreshKey(prev => prev + 1); // ⭐ 핵심
    setIsRefreshing(false);
    pullDistanceRef.current = 0;

    showToast("최신 데이터 반영 완료");
  }, 500);
};
// 🔥 모든 로그인 사용자 FCM 토큰 저장
useEffect(() => {
  import("../firebase").then(({ saveFcmToken }) => {
    auth.onAuthStateChanged((user) => {
      if (user) {
        saveFcmToken(user);
      }
    });
  });
}, []);

// 🔔 앱 켜져 있을 때 알림 표시 (FCM 포그라운드)
useEffect(() => {
  let unsubscribe;

  import("../firebase").then(({ initForegroundFCM }) => {
    unsubscribe = initForegroundFCM((payload) => {
      if (!alarmEnabled) return;
      if (toastMuted) return;

      const title = payload.notification?.title || "";
      const body = payload.notification?.body || "";

      if (!title && !body) return;

      setToast(`${title} ${body}`.trim());
      navigator.vibrate?.(200);
    });
  });

  return () => {
    if (typeof unsubscribe === "function") {
      unsubscribe();
    }
  };
}, [alarmEnabled, toastMuted]);


  useEffect(() => {
  const unsubs = [];

const collections = ["dispatch", "orders"];

collections.forEach((name) => {
    const unsub = onSnapshot(collection(db, name), (snap) => {
      const list = snap.docs.map((d) => ({
        _id: d.id,
        id: d.id,
        __col: name,
        ...d.data(),
      }));
      setOrdersLoaded(true);
      setOrders((prev) => {
        const filtered = prev.filter((o) => o.__col !== name);
        return [...filtered, ...list];
      });

      // 교체 후
      // 🔔 알림 감지 (최초 로드는 스킵)
      if (!initialLoadDoneRef.current[name]) {
        initialLoadDoneRef.current[name] = true;
        // Initialize prevStatusMap and mark all existing orders as already seen
        list.forEach(item => {
          if (!dispatchPrevStatus.current[name]) dispatchPrevStatus.current[name] = new Map();
          dispatchPrevStatus.current[name].set(item.id, String(item.배차상태 || "").trim());
          // 기존 오더는 이미 본 것으로 처리 → 재연결 시에도 알림 재발생 안 함
          notifiedOrderIdsRef.current.add(`등록_${item.id}`);
          notifiedOrderIdsRef.current.add(`배차완료_${item.id}`);
          notifiedOrderIdsRef.current.add(`취소_${item.id}`);
        });
        return;
      }

      if (!alarmEnabledRef.current) return;

      // Initialize prevStatusMap if needed
      if (!dispatchPrevStatus.current[name]) dispatchPrevStatus.current[name] = new Map();
      const prevMap = dispatchPrevStatus.current[name];

      // 🔥 모든 FCM 토큰 수집
      const sendPush = async (title, body) => {
        try {
          const snap = await getDocs(collection(db, "users"));
          const tokens = snap.docs
            .map(d => d.data().fcmToken)
            .filter(Boolean);
          if (!tokens.length) return;

          await fetch("/api/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokens, title, body }),
          });
        } catch (e) {
          console.error("푸시 실패", e);
        }
      };

      snap.docChanges().forEach((change) => {
        const data = { id: change.doc.id, ...change.doc.data() };

        if (change.type === "added" && data.상차지명) {
          sendPush(
            "신규 오더 등록",
            `${data.거래처명 || ""} ${data.상차지명} → ${data.하차지명 || ""}`
          );
          addNotification("등록", data);
        }

        if (change.type === "modified") {
          const prevStatus = prevMap.get(change.doc.id) || "";
          const nextStatus = String(data.배차상태 || "").trim();
          const nextCar = String(data.차량번호 || "").trim();
          if (nextStatus === "배차완료" && prevStatus !== "배차완료" && nextCar) {
            sendPush(
              "배차완료",
              `${data.거래처명 || ""} ${data.상차지명} → ${data.하차지명 || ""} | ${data.기사명 || ""} (${nextCar})`
            );
            addNotification("배차완료", data);
          }

          // 취소 감지
          const prevCancelStatus = change.doc._document?.data?.value?.mapValue?.fields?.상태?.stringValue || "";
          const nextCancelStatus = data.상태 || "";
          if (nextCancelStatus === "취소" && prevCancelStatus !== "취소") {
            addNotification("취소", data);
          }
        }

        // Update prevMap
        if (change.type === "removed") {
          prevMap.delete(change.doc.id);
        } else {
          prevMap.set(change.doc.id, String(data.배차상태 || "").trim());
        }
      });
    });

    unsubs.push(unsub);
  });

  return () => unsubs.forEach((u) => u());
}, [refreshKey]);
useEffect(() => {
  // pull-to-refresh is disabled — keep refs clean only
  return () => {
    pullDistanceRef.current = 0;
  };
}, []);
  // --------------------------------------------------
// 🔔 PC 공지사항 실시간 구독 (이 위치!)
// --------------------------------------------------
useEffect(() => {
  const unsub = onSnapshot(
    collection(db, "notices"),   // ⚠️ PC에서 쓰는 컬렉션명
    
    (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));
      list.sort(
        (a, b) =>
          (b.createdAt?.seconds || 0) -
          (a.createdAt?.seconds || 0)
      );
      setNotices(list);
    }
  );
  return () => unsub();
}, []);

// --------------------------------------------------
// 📅 PC 일정 실시간 구독 (이 위치!)
// --------------------------------------------------
useEffect(() => {
  const unsub = onSnapshot(
    collection(db, "schedules"), // ⚠️ PC에서 쓰는 컬렉션명
    (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));
      setSchedules(list);
    }
  );
  return () => unsub();
}, []);
// --------------------------------------------------
// 📝 인수인계 실시간 구독 (★ 여기 추가 ★)
// --------------------------------------------------
useEffect(() => {
  const unsub = onSnapshot(
    collection(db, "handovers"),
    (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));

      // 최신순 정렬
      list.sort(
        (a, b) =>
          (b.createdAt?.seconds || 0) -
          (a.createdAt?.seconds || 0)
      );

      setHandovers(list);
    }
  );

  return () => unsub();
}, []);

// 👤 현재 로그인 사용자 추적
useEffect(() => {
  const unsub = auth.onAuthStateChanged((u) => {
    setCurrentUser(u || null);
  });
  return () => unsub();
}, []);

// 👥 전체 사용자 목록 구독
useEffect(() => {
  const unsub = onSnapshot(collection(db, "users"), (snap) => {
    setMobileUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
  return () => unsub();
}, []);

// 🔔 상차 임박 2시간 이내 감지 (⏱ 시간 흐름 포함)
useEffect(() => {
  if (!orders.length || !alarmEnabled) return;

  const TWO_HOURS = 120; // 분

  const checkNearPickup = () => {
    const now = new Date();

    const nearOrders = orders.filter(o => {
      if (!o.상차일 || !o.상차시간) return false;
      if (o.차량번호) return false; // 배차중만

      const [y, m, d] = o.상차일.split("-").map(Number);
      const [hh, mm] = normalizeKoreanTime(o.상차시간)
        .split(":")
        .map(Number);

      const dt = new Date(y, m - 1, d, hh, mm);
      const diffMin = (dt - now) / 60000;

      return diffMin > 0 && diffMin <= TWO_HOURS;
    });

    if (nearOrders.length > 0) {
  if (toastMuted) return;   // 🔥 이 줄이 핵심

  setToast(`상차 임박 ${nearOrders.length}건! 확인하세요`);
  navigator.vibrate?.(200);
}
  };

  // ✅ 즉시 1회 실행
  checkNearPickup();

  // ✅ 이후 1분마다 재평가 (PC와 동일한 동작)
  const timer = setInterval(checkNearPickup, 60 * 1000);

  return () => clearInterval(timer);
}, [orders, alarmEnabled]);
// 긴급 오더 등록 즉시 알림 (등록되는 순간 1회)
useEffect(() => {
  if (!alarmEnabled || !orders.length) return;

  // 이미 알림 준 긴급 오더 기록 (중복 방지)
  const notified = JSON.parse(
    sessionStorage.getItem("urgentNotified") || "[]"
  );

  const newUrgentOrders = orders.filter(o => {
    return (
      o.긴급 === true &&
      !o.차량번호 &&          // 배차중
      !notified.includes(o.id)
    );
  });

  if (newUrgentOrders.length > 0) {
  if (toastMuted) return;   // 🔥 추가

  const o = newUrgentOrders[0];

  setToast(
    `긴급 오더 등록\n${o.거래처명 || ""} ${o.상차시간 || ""}`
  );
  navigator.vibrate?.([200, 100, 200]);

    const next = [...notified, ...newUrgentOrders.map(o => o.id)];
    sessionStorage.setItem(
      "urgentNotified",
      JSON.stringify(next)
    );
  }
}, [orders, alarmEnabled]);


  useEffect(() => {
    const unsub = onSnapshot(collection(db, "drivers"), (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setDrivers(list);
    });
    return () => unsub();
  }, []);

  // 🔥 하차지 거래처(places)도 clients에 병합
useEffect(() => {
  const unsub = onSnapshot(collection(db, "places"), (snap) => {
    const list = snap.docs.map((d) => {
      const data = d.data();

      const name =
        data.거래처명 ||
        data.업체명 ||
        data.상차지명 ||
        data.하차지명 ||
        "";

      const address =
        data.주소 ||
        data.상차지주소 ||
        data.하차지주소 ||
        "";

      // ★ contacts 배열에서 대표 담당자 추출 (PC 호환)
      const contacts = Array.isArray(data.contacts) ? data.contacts : [];
      const primary = contacts.find(c => c.isPrimary) || contacts[0] || null;

      // ★ 구형 포맷(담당자 직접 필드)도 호환
      const managerName = primary?.name || data.담당자 || "";
      const managerPhone = primary?.phone || data.담당자번호 || "";

      return {
        id: d.id,
        거래처명: name,
        주소: address,
        담당자: managerName,
        담당자번호: managerPhone,
        contacts: contacts,  // ★ 전체 contacts도 보관
        등급: data.등급 || "일반",
        메모: data.메모 || "",
      };
    });

    setPlaces(list);
  });

  return () => unsub();
}, []);

// 🏢 기본거래처(clients) 리스너
useEffect(() => {
  const co = userCompany || localStorage.getItem("userCompany") || "";
  const unsub = onSnapshot(collection(db, "clients"), (snap) => {
    const list = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => !co || !c.companyName || c.companyName === co)
      .map(d => ({
        id: d.id,
        거래처명: d.거래처명 || "",
        주소: d.주소 || "",
        담당자: d.담당자 || "",
        담당자번호: d.연락처 || d.담당자번호 || "",
        메모: d.메모 || "",
      }));
    setClients(list);
  });
  return () => unsub();
}, [userCompany]);

  // --------------------------------------------------
  // 2. 화면 상태 / 필터
  // --------------------------------------------------
  const [onlyToday, setOnlyToday] = useState(false);
  // list | form | detail | fare | status | unassigned | handover | undelivered
// list | form | detail | fare | status | unassigned | handover
  // 🆕 공지 NEW 판단 (데이터 기준)
useEffect(() => {
  if (!notices.length) {
    setHasNewNotice(false);
    return;
  }

  const lastRead = Number(
    localStorage.getItem("lastReadNoticeAt") || 0
  );

  const latest = Math.max(
    ...notices.map(n =>
      n.createdAt?.seconds ||
      n.updatedAt?.seconds ||
      0
    )
  );

  setHasNewNotice(latest > lastRead);
}, [notices]);



// 🆕 일정 NEW 판단
useEffect(() => {
  if (!schedules.length) {
    setHasNewSchedule(false);
    return;
  }

  const lastRead = Number(
    localStorage.getItem("lastReadScheduleAt") || 0
  );

  const latest = Math.max(
    ...schedules.map(s =>
      s.createdAt?.seconds ||
      s.updatedAt?.seconds ||
      (s.start ? Math.floor(new Date(s.start).getTime() / 1000) : 0)
    )
  );

setHasNewSchedule(
  schedules.some(s =>
    (s.createdAt?.seconds || 0) > lastRead
  )
);
}, [schedules]);



  const [selectedOrder, setSelectedOrder] = useState(null);
  const [openMemo, setOpenMemo] = useState(null);
  // 🔙 상세보기 진입 출처 (list | unassigned | status)
const [detailFrom, setDetailFrom] = useState(null);
  const [statusTab, setStatusTab] = useState("전체");
  const [showMenu, setShowMenu] = useState(false);
  const [cardVersionB, setCardVersionB] = useState(() => localStorage.getItem("cardVersion") === "B");
  const [fontScale, setFontScale] = useState(() => Number(localStorage.getItem("fontScale") || "1"));
  const appVersion = "1.0.0";

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("signOut error:", e);
    }
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace("/login");
  };
  // 🔥 미배차 차량 분류 필터 (전체 | 냉장/냉동 | 일반)
const [unassignedTypeFilter, setUnassignedTypeFilter] = useState("전체");

  const todayStr = () => todayKST();

  // 🔵 추가 드롭다운 필터 (차량종류 / 배차상태)
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [assignFilter, setAssignFilter] = useState("");

  // 🔍 검색 상태
  const [searchType, setSearchType] = useState("거래처명");
  const [searchText, setSearchText] = useState("");

  // --------------------------------------------------
  // 3. 등록 폼
  // --------------------------------------------------
  const [form, setForm] = useState({
    거래처명: "",
    상차일: "",
    상차시간: "",
    하차일: "",
    하차시간: "",
    상차지명: "",
    상차지주소: "",
    상차지담당자: "",
상차지담당자번호: "",
    하차지명: "",
    하차지주소: "",
    하차지담당자: "",
하차지담당자번호: "",
    톤수: "",
    차종: "",
    화물내용: "",
    상차방법: "",
    하차방법: "",
    지급방식: "",
    배차방식: "",
    청구운임: 0,
    기사운임: 0,
    수수료: 0,
    산재보험료: 0,
    차량번호: "",
    기사명: "",
    전화번호: "",
   혼적여부: "독차",
    적요: "",
    상차시간기준: null,
    하차시간기준: null,
    경유상차목록: [],
    경유하차목록: [],

    _editId: null,
    _returnToDetail: false,
  });

  // 🔥 앱 처음 로드 시 오늘 날짜 자동 설정 + 기본탭 배차중
useEffect(() => {
  const today = todayKST();

    // 날짜 선택 안 되어 있으면 자동으로 오늘 적용
    if (!startDate && !endDate) {
      setStartDate(today);
      setEndDate(today);
    }

    // ⭐ 기본 탭 = 배차중
    setStatusTab("배차중");
  }, []);

  // --------------------------------------------------
  // 4. 필터링
  // --------------------------------------------------
const thisMonth = thisMonthKST();

  const filteredOrders = useMemo(() => {
    let base = [...orders];

    // 🔹 오늘 / 날짜 선택 여부
    const today = todayStr();
    // ✅ 오늘 오더만 보기 스위치
if (onlyToday) {
  base = base.filter((o) => getPickupDate(o) === today);
}
 const dateSelected = !!(startDate || endDate);

 // 🔥 날짜 선택 안 한 경우에만 당월 필터 적용
 if (!dateSelected) {
   base = base.filter((o) => {
     const d = getPickupDate(o) || "";
     return d.startsWith(thisMonth);
   });
 }

    // 1-1) 날짜 선택 안 했고, 탭이 "전체"가 아닐 때(배차중/배차완료) → 당일만 자동 필터
    if (!dateSelected && statusTab !== "전체") {
      base = base.filter((o) => getPickupDate(o) === today);
    }

    // 2) 상단 탭: 전체 / 배차중 / 배차완료
    base = base.filter((o) => {
      if (statusTab === "전체") return true;
      const state = getStatus(o); // 🔥 차량번호 기준 상태
      return state === statusTab;
    });

    // 3) 드롭다운 배차상태 (배차 전체 / 배차중 / 배차완료)
    base = base.filter((o) => {
      if (!assignFilter) return true;
      const state = getStatus(o);
      return state === assignFilter;
    });

    // 4) 차량종류 필터
    base = base.filter((o) => {
      if (!vehicleFilter) return true;
      const carType = String(o.차량종류 || o.차종 || "").toLowerCase();
      return carType.includes(vehicleFilter.toLowerCase());
    });

    // 5) 날짜 필터 (직접 고른 경우만 동작)
    base = base.filter((o) => {
      const d = getPickupDate(o);
      if (!d) return false;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });

    // 6) 검색
base = base.filter((o) => {
  if (!searchText.trim()) return true;
  const q = normalize(searchText);

  if (searchType === "거래처명")
    return normalize(o.거래처명).includes(q);

  if (searchType === "기사명")
    return normalize(o.기사명).includes(q);

  if (searchType === "차량번호")
    return normalize(o.차량번호).includes(q);

  if (searchType === "상차지명")
    return normalize(o.상차지명).includes(q);

  if (searchType === "상차지주소")
    return normalize(o.상차지주소).includes(q);

  if (searchType === "하차지명")
    return normalize(o.하차지명).includes(q);

  if (searchType === "하차지주소")
    return normalize(o.하차지주소).includes(q);
if (searchType === "메모")
  return normalize(o.메모 || o.적요).includes(q);
  return true;
});



    // 7) 정렬
    // 🟢 After
if (statusTab === "전체") {
  // 전체 = 배차중 그룹 먼저, 그룹 내 updatedAt/createdAt 최신순
  base.sort((a, b) => {
    const aEmpty = !String(a.차량번호 || "").trim();
    const bEmpty = !String(b.차량번호 || "").trim();
    if (aEmpty && !bEmpty) return -1;
    if (!aEmpty && bEmpty) return 1;
     // 같은 그룹 내: 수정/등록 최신순
    const ta = a._lastModified || (a.updatedAt?.seconds || 0) * 1000 || 0;
    const tb = b._lastModified || (b.updatedAt?.seconds || 0) * 1000 || 0;
    return tb - ta;
  });
} else {
  // 배차중/배차완료 탭: 수정/등록 최신 상단 (수정하면 바로 상단)
  base.sort((a, b) => {
    const ta = a._lastModified || (a.updatedAt?.seconds || 0) * 1000 || 0;
    const tb = b._lastModified || (b.updatedAt?.seconds || 0) * 1000 || 0;
    return tb - ta;
  });
}

    return base;
  }, [
    orders,
    statusTab,
    assignFilter,
    vehicleFilter,
    startDate,
    endDate,
    searchType,
    searchText,
    thisMonth,
    onlyToday,
  ]);


  // 배차현황용
  const filteredStatusOrders = filteredOrders;
// ✅ 미배차 오더 (차량번호 없는 것)
const unassignedOrders = useMemo(() => {
  return orders.filter(
    (o) =>
      !String(o.차량번호 || "").trim() &&
      (o.상차지명 || o.하차지명) &&   // ★ 상/하차지 없는 빈 오더 제외
      getPickupDate(o)                  // ★ 날짜 없는 오더 제외
  );
}, [orders]);

// 📤 정보미전달 오더 (오늘 이후 + 전달미완료)
const undeliveredOrders = useMemo(() => {
  const today = todayStr();

  return orders
    .filter((o) => {
      const pickupDate = getPickupDate(o);

      if (!pickupDate) return false;
      if (pickupDate < today) return false;
      if (o.업체전달상태 === "전달완료") return false;

      return true;
    })
    .sort((a, b) => {
      const da = getPickupDate(a) || "";
      const db = getPickupDate(b) || "";
      return da.localeCompare(db);
    });
}, [orders]);
useEffect(() => {
  unassignedCountRef.current = unassignedOrders.length;
}, [unassignedOrders.length]);

// ✅ page ref 최신화 + pending 처리(list로 돌아오면 띄우기)
useEffect(() => {
  pageRef.current = page;

  if (page === "list" && pendingPopupRef.current) {
    pendingPopupRef.current = false;

    const today = todayKST();
    const hideKey = "hideUnassignedPopupDate";
    const hiddenDate = localStorage.getItem(hideKey);

    // 오늘 숨김이면 스킵
    if (hiddenDate === today) return;

    // 미배차 없으면 스킵
    if (unassignedOrders.length === 0) return;

    // 오늘 이미 한 번 띄웠으면 스킵(자정 지나면 ref 초기화됨)
    if (popupLastShownDateRef.current === today) return;

    popupLastShownDateRef.current = today;
    setShowUnassignedEntryPopup(true);
  }
}, [page, ordersLoaded, unassignedOrders.length]);

// ✅ 접속(로드) 시 1회 팝업 — 1.5초 지연으로 화면 먼저 렌더링
useEffect(() => {
  if (!ordersLoaded) return;

  const today = todayKST();
  const hideKey = "hideUnassignedPopupDate";
  const hiddenDate = localStorage.getItem(hideKey);

  if (hiddenDate === today) return;
  if (unassignedOrders.length === 0) return;
  if (page !== "list") return;
  if (popupLastShownDateRef.current === today) return;

  popupLastShownDateRef.current = today;

  // ★ 화면 렌더링 먼저, 팝업은 1.5초 후
  const timer = setTimeout(() => {
    setShowUnassignedEntryPopup(true);
  }, 1500);
  return () => clearTimeout(timer);
}, [ordersLoaded, unassignedOrders.length, page]);

// ✅ 자정(KST) 지나면: 숨김은 "오늘"만 적용이므로 날짜 바뀌면 다시 띄울 수 있어야 함
useEffect(() => {
  if (!ordersLoaded) return;

  const hideKey = "hideUnassignedPopupDate";
  let lastDay = todayKST();

  const timer = setInterval(() => {
    const nowDay = todayKST();
    if (nowDay === lastDay) return;

    // ✅ 날짜 바뀜(자정 넘어감)
    lastDay = nowDay;

    // 오늘 기준으로 다시 띄울 수 있게 초기화
    popupLastShownDateRef.current = null;

    // 오늘 숨김이면 스킵
    const hiddenDate = localStorage.getItem(hideKey);
    if (hiddenDate === nowDay) return;

    // 미배차가 있는 경우에만
    if (unassignedCountRef.current <= 0) return;

    // list면 즉시 띄우고, 아니면 pending
    if (pageRef.current === "list") {
      popupLastShownDateRef.current = nowDay;
      setShowUnassignedEntryPopup(true);
    } else {
      pendingPopupRef.current = true;
    }
  }, 30 * 1000); // 30초마다 체크(자정 직후 빠르게 반응)

  return () => clearInterval(timer);
}, [ordersLoaded]);
  // 날짜별 그룹핑 메모
const groupedByDate = useMemo(() => {
  const map = new Map();

  for (const o of filteredOrders) {

    const d = getPickupDate(o);

    // 🔥🔥🔥 이거 추가 (핵심)
    if (!d) continue;

    if (!map.has(d)) map.set(d, []);
    map.get(d).push(o);
  }

  return map;
}, [filteredOrders]);
  // ★ PC 거래처관리(places) 자동 동기화
  const syncPlaceFromOrder = async (docData) => {
    const normalizeKey = (s = "") =>
      String(s).toLowerCase().replace(/\s+/g, "").replace(/[^\uAC00-\uD7A3a-z0-9]/g, "");

    const syncOne = async (placeName, addr, manager, phone) => {
      if (!placeName?.trim()) return;

      const key = normalizeKey(placeName);

      // places 컬렉션에서 동일 업체 찾기
      const existing = places.find(
        (p) => normalizeKey(p.거래처명) === key
      );

      if (existing) {
        // 기존 업체: contacts 배열 업데이트
        let contacts = Array.isArray(existing.contacts) ? [...existing.contacts] : [];

        if (manager?.trim()) {
          const sameIdx = contacts.findIndex(c => (c.name || "").trim() === manager.trim());
          if (sameIdx >= 0) {
            // 동일 이름 → 전화번호 최신화 + primary 이동
            contacts = contacts.map((c, i) => ({
              ...c,
              phone: i === sameIdx ? (phone || c.phone) : c.phone,
              isPrimary: i === sameIdx,
            }));
          } else {
            // 새 담당자 → 추가
            contacts = contacts.map(c => ({ ...c, isPrimary: false }));
            contacts.push({ name: manager.trim(), phone: phone || "", isPrimary: true });
          }
        } else if (phone?.trim()) {
          // 이름 없고 연락처만 있을 때 → 자동 이름 생성 후 저장
          const samePhone = contacts.findIndex(c => (c.phone || "").replace(/\D/g, "") === phone.replace(/\D/g, ""));
          if (samePhone < 0) {
            const autoName = `담당자${contacts.length + 1}`;
            contacts = contacts.map(c => ({ ...c, isPrimary: false }));
            contacts.push({ name: autoName, phone: phone.trim(), isPrimary: true });
          }
        }

        const updatePayload = {
          업체명: placeName,
          주소: addr || existing.주소 || "",
          contacts: contacts,
          updatedAt: serverTimestamp(),
        };

        // 구형 필드도 동기화
        const primary = contacts.find(c => c.isPrimary) || contacts[0];
        if (primary) {
          updatePayload.담당자 = primary.name || "";
          updatePayload.담당자번호 = primary.phone || "";
        }

        await updateDoc(doc(db, "places", existing.id), updatePayload);
      } else {
        // 기존 업체 없음 → places에 신규 자동 등록
        const newContacts = manager?.trim()
          ? [{ name: manager.trim(), phone: phone || "", isPrimary: true }]
          : [];
        await addDoc(collection(db, "places"), {
          업체명: placeName,
          주소: addr || "",
          contacts: newContacts,
          등급: "일반",
          createdAt: serverTimestamp(),
        });
      }
    };

    // 상차지 동기화
    await syncOne(
      docData.상차지명,
      docData.상차지주소,
      docData.상차지담당자,
      docData.상차지담당자번호
    );

    // 하차지 동기화
    await syncOne(
      docData.하차지명,
      docData.하차지주소,
      docData.하차지담당자,
      docData.하차지담당자번호
    );
  };

  // --------------------------------------------------
  // 5. 저장 / 수정
  // --------------------------------------------------
  const handleSave = async () => {
    // 필수값 체크
    if (!form.상차지명 || !form.하차지명) {
      alert("상차지 / 하차지는 필수입니다.");
      return;
    }

    const 청구운임 = toNumber(form.청구운임);
    const 기사운임 = toNumber(form.기사운임);
    const 수수료 = 청구운임 - 기사운임;
    const today = todayStr();

    // 공통 데이터 (PC 호환 필드 포함)
    const docData = {
      거래처명: form.거래처명 || "",
      상차지명: form.상차지명,
      상차지주소: form.상차지주소 || "",
      상차지담당자: form.상차지담당자 || "",
상차지담당자번호: form.상차지담당자번호 || "",
      하차지명: form.하차지명,
      하차지주소: form.하차지주소 || "",
      하차지담당자: form.하차지담당자 || "",
하차지담당자번호: form.하차지담당자번호 || "",
      화물내용: form.화물내용 || "",
      차량종류: form.차종 || "",
      차량톤수: form.톤수 || "",
      상차방법: form.상차방법 || "",
      하차방법: form.하차방법 || "",
      상차일: form.상차일 || "",
      상차시간: form.상차시간 || "",
      상차시간기준: form.상차시간기준 || null,
      하차일: form.하차일 || "",
      하차시간: form.하차시간 || "",
      하차시간기준: form.하차시간기준 || null,
      지급방식: form.지급방식 || "",
      배차방식: form.배차방식 || "",
      혼적여부: form.혼적여부 || "독차",
      혼적: form.혼적여부 === "혼적",   // ← PC boolean 호환
      적요: form.적요 || "",
      메모: form.적요 || "",

      차량번호: form.차량번호 || "",
      기사명: form.기사명 || "",
      전화번호: form.전화번호 || "",

      // ⭐ PC 에서 쓰는 필드 필수!!
      이름: form.기사명 || "",
      전화: form.전화번호 || "",

      청구운임,
      기사운임,
      수수료,

      // 상태 PC/모바일 동일
      배차상태: (form.차량번호 || "").trim() ? "배차완료" : "배차중",
      상태: (form.차량번호 || "").trim() ? "배차완료" : "배차중",

      경유상차목록: validStops(form.경유상차목록),
      경유지_상차: validStops(form.경유상차목록),
      경유하차목록: validStops(form.경유하차목록),
      경유지_하차: validStops(form.경유하차목록),

      updatedAt: serverTimestamp(),
      _lastModified: Date.now(),
    };

    // 🔹 수정 모드
    if (form._editId) {
      await updateDoc(doc(db, selectedOrder.__col, form._editId), {
        ...docData,
        _id: form._editId,
        id: form._editId,
      });

      // ★ PC 거래처관리(places) 동기화
      await syncPlaceFromOrder(docData);

      // selectedOrder 최신화 (상세보기로 돌아갈 때 최신 데이터 반영)
      const updated = { ...selectedOrder, ...docData, _id: form._editId, id: form._editId };
      setSelectedOrder(updated);
      setOrders(prev => prev.map(o =>
        (o.id === form._editId || o._id === form._editId) ? updated : o
      ));

      showSuccess("수정 완료");
      // 상세보기에서 진입한 경우 → 상세보기로 복귀, 그 외 → 이전 페이지
      if (form._returnToDetail) {
        setPage("detail");
      } else {
        setPage(prevPage);
      }
      return;
    }


    // 🔹 신규 등록
    try {
      const ref = await addDoc(collection(db, collName), {
        ...docData,
        _id: "",    // 임시
        id: "",     // 임시
        등록일: today,
        createdAt: serverTimestamp(),
      });

      // 🔥 Firestore 문서 고유 ID 확정 저장
      await updateDoc(doc(db, collName, ref.id), {
        _id: ref.id,
        id: ref.id,
      });

      // ★ PC 거래처관리(places) 동기화
      await syncPlaceFromOrder(docData);

      showSuccess("등록 완료");
      setPage("list");

    } catch (e) {
      console.error(e);
      alert("등록 실패!");
    }
  };
  // 📦 오더복사 → 등록창 이동 (오늘 날짜 기준)
const handleOrderDuplicate = (order) => {
 const today = todayKST();

  const _pendingContactItems = [];
  [
    { fieldName: order.상차지명, type: "pickup" },
    { fieldName: order.하차지명, type: "drop" },
  ].forEach(({ fieldName, type }) => {
    if (!fieldName) return;
    const found = mergedCompanies.find(c => normalizeCompany(c.거래처명) === normalizeCompany(fieldName));
    if (!found) return;
    const contacts = (Array.isArray(found.contacts) ? found.contacts : []).filter(ct => ct.name?.trim());
    const unique = [...new Map(contacts.map(ct => [ct.name.trim(), ct])).values()];
    if (unique.length > 1) _pendingContactItems.push({ type, place: found, contacts: unique });
  });

  setForm({
    거래처명: order.거래처명 || "",

    상차일: today,
    상차시간: order.상차시간 || "",
    상차시간기준: order.상차시간기준 || null,
    하차일: today,
    하차시간: order.하차시간 || "",
    하차시간기준: order.하차시간기준 || null,

    상차지명: order.상차지명 || "",
상차지주소: order.상차지주소 || "",
상차지담당자: order.상차지담당자 || "",
상차지담당자번호: order.상차지담당자번호 || "",

하차지명: order.하차지명 || "",
하차지주소: order.하차지주소 || "",
하차지담당자: order.하차지담당자 || "",
하차지담당자번호: order.하차지담당자번호 || "",

    톤수: order.톤수 || order.차량톤수 || "",
    차종: order.차종 || order.차량종류 || "",
    화물내용: order.화물내용 || "",

    상차방법: order.상차방법 || "",
    하차방법: order.하차방법 || "",

    지급방식: order.지급방식 || "",
    배차방식: order.배차방식 || "",

    청구운임: order.청구운임 || 0,

    기사운임: 0,
    수수료: 0,
    산재보험료: 0,

    차량번호: "",
    기사명: "",
    전화번호: "",

    혼적여부: order.혼적여부 || "독차",
    적요: "",

    경유상차목록: validStops(order.경유상차목록 || order.경유지_상차),
    경유하차목록: validStops(order.경유하차목록 || order.경유지_하차),

    _editId: null,
    _returnToDetail: false,
    _pendingContactItems,
  });

  setSelectedOrder(null);
  setPrevPage("list");
  setPage("form");
  window.scrollTo(0, 0);
};

const handleOrderDuplicateWithDriver = (order) => {
  const today = todayKST();

  const _pendingContactItems = [];
  [
    { fieldName: order.상차지명, type: "pickup" },
    { fieldName: order.하차지명, type: "drop" },
  ].forEach(({ fieldName, type }) => {
    if (!fieldName) return;
    const found = mergedCompanies.find(c => normalizeCompany(c.거래처명) === normalizeCompany(fieldName));
    if (!found) return;
    const contacts = (Array.isArray(found.contacts) ? found.contacts : []).filter(ct => ct.name?.trim());
    const unique = [...new Map(contacts.map(ct => [ct.name.trim(), ct])).values()];
    if (unique.length > 1) _pendingContactItems.push({ type, place: found, contacts: unique });
  });

  setForm({
    거래처명: order.거래처명 || "",
    상차일: today,
    상차시간: order.상차시간 || "",
    상차시간기준: order.상차시간기준 || null,
    하차일: today,
    하차시간: order.하차시간 || "",
    하차시간기준: order.하차시간기준 || null,
    상차지명: order.상차지명 || "",
    상차지주소: order.상차지주소 || "",
    상차지담당자: order.상차지담당자 || "",
    상차지담당자번호: order.상차지담당자번호 || "",
    하차지명: order.하차지명 || "",
    하차지주소: order.하차지주소 || "",
    하차지담당자: order.하차지담당자 || "",
    하차지담당자번호: order.하차지담당자번호 || "",
    톤수: order.톤수 || order.차량톤수 || "",
    차종: order.차종 || order.차량종류 || "",
    화물내용: order.화물내용 || "",
    상차방법: order.상차방법 || "",
    하차방법: order.하차방법 || "",
    지급방식: order.지급방식 || "",
    배차방식: order.배차방식 || "",
    청구운임: order.청구운임 || 0,
    기사운임: order.기사운임 || 0,
    수수료: (Number(order.청구운임) || 0) - (Number(order.기사운임) || 0),
    산재보험료: order.산재보험료 || 0,
    차량번호: order.차량번호 || "",
    기사명: order.기사명 || "",
    전화번호: order.전화번호 || "",
    혼적여부: order.혼적여부 || "독차",
    적요: "",
    경유상차목록: validStops(order.경유상차목록 || order.경유지_상차),
    경유하차목록: validStops(order.경유하차목록 || order.경유지_하차),
    _editId: null,
    _returnToDetail: false,
    _pendingContactItems,
  });
  setSelectedOrder(null);
  setPrevPage("list");
  setPage("form");
  window.scrollTo(0, 0);
};

const deleteSingleOrder = async (order) => {
  const col = order.__col || collName;
  const id = order.id || order._id;
  if (!col || !id) return;
  await deleteDoc(doc(db, col, id));
  setOrders(prev => prev.filter(o => (o.id || o._id) !== id));
};

  // --------------------------------------------------
  // 🔵 모바일 전용 upsertDriver
  // --------------------------------------------------
  const upsertDriver = async ({ 차량번호, 이름, 전화번호 }) => {
    if (!차량번호) return;

    const norm = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();

    const existing = drivers.find(
      (d) => norm(d.차량번호) === norm(차량번호)
    );

    if (existing) {
      await updateDoc(doc(db, "drivers", existing.id), {
        차량번호: 차량번호 || "",
        이름: 이름 || "",
        전화번호: 전화번호 || "",
        메모: existing.메모 ?? "",
        updatedAt: serverTimestamp(),
      });
      return existing.id;
    }

    const ref = await addDoc(collection(db, "drivers"), {
      차량번호: 차량번호 || "",
      이름: 이름 || "",
      전화번호: 전화번호 || "",
      메모: "",
      createdAt: serverTimestamp(),
    });

    return ref.id;
  };

  // --------------------------------------------------
  // 6. 기사 배차 / 배차취소(상태는 배차중으로만) / 오더삭제
  // --------------------------------------------------
  const assignDriver = async ({ 차량번호, 이름, 전화번호 }) => {
    if (!selectedOrder) return;

    const norm = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();

    // 이름+차량번호 일치 우선, 없으면 차량번호만
    const existingDriver =
      drivers.find((d) => norm(d.차량번호) === norm(차량번호) && norm(d.이름) === norm(이름)) ||
      drivers.find((d) => norm(d.차량번호) === norm(차량번호));

    if (!existingDriver) {
      await upsertDriver({
        차량번호,
        이름: 이름 || "",
        전화번호: 전화번호 || "",
      });
    }

    // 사용자가 선택한 값(이름, 차량번호, 전화번호)을 그대로 저장
    await updateDoc(doc(db, selectedOrder.__col, selectedOrder.id), {
      기사명: 이름,
      이름: 이름,
      차량번호: 차량번호,
      전화번호: 전화번호,
      전화: 전화번호,
      배차상태: "배차완료",
      상태: "배차완료",
      배차완료일시: serverTimestamp(),
      updatedAt: serverTimestamp(),
      _lastModified: Date.now(),
    });

    setSelectedOrder((prev) =>
      prev
        ? {
          ...prev,
          배차상태: "배차완료",
          상태: "배차완료",
          기사명: 이름,
          차량번호: 차량번호,
          전화번호: 전화번호,
        }
        : prev
    );

    alert(`기사 배차 완료: ${이름} (${차량번호})`);
  };

  const cancelAssign = async () => {
    if (!selectedOrder) return;

    await updateDoc(doc(db, selectedOrder.__col, selectedOrder.id), {
  기사명: "",
  이름: "",
  차량번호: "",
  전화번호: "",
  전화: "",
  배차상태: "배차중",
  상태: "배차중",
  배차완료일시: null,
  updatedAt: serverTimestamp(),
  _lastModified: Date.now(),
});

    setSelectedOrder((prev) =>
      prev
        ? {
          ...prev,
          배차상태: "배차중",
          상태: "배차중",
          기사명: "",
          차량번호: "",
          전화번호: "",
        }
        : prev
    );

    alert("배차가 취소되었습니다.");
  };

  // 🔴 오더 취소 = 실제 삭제
  const cancelOrder = async () => {
    if (!selectedOrder) return;
    if (
      !window.confirm(
        "해당 오더를 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다."
      )
    )
      return;

    await deleteDoc(doc(db, selectedOrder.__col, selectedOrder.id));
    setSelectedOrder(null);
    showSuccess("오더 삭제 완료");
    setPage(prevPage);
  };
  // 🔴 전체삭제 비활성화
  const deleteAllOrders = async () => {
    alert("전체 삭제 기능이 비활성화되었습니다.");
    return;
  };

  const [multiSelectMode, setMultiSelectMode] = useState(false);

  const deleteSelectedOrders = async (selectedOrders) => {
    if (!window.confirm(`선택한 ${selectedOrders.length}개 오더를 삭제하시겠습니까?\n삭제 후 복구가 불가능합니다.`)) return;
    try {
      for (const order of selectedOrders) {
        const col = order.__col || collName;
        const id = order.id || order._id;
        if (col && id) await deleteDoc(doc(db, col, id));
      }
      const deletedIds = new Set(selectedOrders.map(o => o.id || o._id));
      setOrders(prev => prev.filter(o => !deletedIds.has(o.id) && !deletedIds.has(o._id)));
    } catch (e) {
      alert("삭제 중 오류가 발생했습니다: " + e.message);
    }
  };


const title =
  page === "list" ? "등록내역"
  : page === "ratecard" ? "단가표"
  : page === "form" ? (form._editId ? "수정하기" : "화물등록")
  : page === "notice" ? "공지사항"
  : page === "schedule" ? "일정"
  : page === "fare" ? "표준운임표"
  : page === "national-fare" ? "전국운임 조회"
  : page === "status" ? "배차현황"
  : page === "unassigned" ? "미배차현황"
  : page === "handover" ? "인수인계"
  : page === "myinfo" ? "내정보"
  : page === "settings" ? "설정"
  : page === "fleet" ? "지입차관리"
  : page === "intel" ? "경영인텔리전스"
  : "상세보기";

  // ------------------------------------------------------------------
  // 렌더링
  // ------------------------------------------------------------------
 return (
<div className="w-full min-h-screen flex flex-col relative"
  style={{ backgroundColor: "var(--bg-app)", color: "var(--text-primary)", transition: "background-color 0.3s, color 0.3s" }}>
    {/* 📝 메모 전체 보기 모달 */}
{openMemo && (
  <div
    className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
    onClick={() => setOpenMemo(null)}
  >
    <div
      className="bg-white rounded-2xl p-4 w-[90%] max-h-[70vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-sm font-bold mb-2">메모</div>

      <div className="text-sm whitespace-pre-wrap text-gray-800">
        {openMemo.메모 || openMemo.적요}
      </div>

      <button
        className="mt-4 w-full py-2 rounded-xl bg-gray-900 text-white text-sm"
        onClick={() => setOpenMemo(null)}
      >
        닫기
      </button>
    </div>
  </div>
)}

    {/* 🔍 글씨 크기 전용 래퍼 (화면 스케일 ❌, 글씨만 ⭕) */}
    <div
      className="flex flex-col flex-1"
      style={{
        fontSize:
          uiScale === 1
            ? "1rem"      // 기본
            : uiScale === 1.1
            ? "1.1rem"    // 크게
            : "1.25rem",  // 아주 크게
      }}
    >
      {/* 🔔 토스트 알림 */}
      {toast && (
  <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50
                  bg-black text-white px-4 py-3 rounded-xl shadow-lg
                  flex items-center gap-3 max-w-[90%]">
    <div className="text-sm whitespace-pre-line">
      {toast}
    </div>

    {/* ❌ 닫기 버튼 */}
   <button
  onClick={() => {
    setToast("");
    setToastMuted(true);   // 🔥 다시 안 뜨게 막음
  }}
  className="text-white/70 hover:text-white text-sm"
>
  ✕
</button>
  </div>
)}
{successBanner && (
  <div className="fixed inset-0 z-[99998] pointer-events-none flex items-center justify-center" style={{ paddingBottom: "20vh" }}>
    <div
      className={`flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl ${cardVersionB ? "bg-[#1B2B4B] text-white" : "bg-white text-gray-900"}`}
      style={{ animation: "successBannerIn 0.3s ease-out", minWidth: "180px", maxWidth: "70vw", border: cardVersionB ? "none" : "1px solid rgba(0,0,0,0.07)" }}
    >
      <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <span className="text-[15px] font-bold whitespace-nowrap">{successBanner}</span>
    </div>
  </div>
)}
{showUnassignedEntryPopup && page === "list" && (
  <div
    className="fixed inset-0 z-[80] flex items-end justify-center"
    style={{ background: "rgba(0,0,0,0.45)" }}
    onClick={() => setShowUnassignedEntryPopup(false)}
  >
    <div
      className="w-full max-w-lg overflow-hidden"
      style={{
        borderRadius: "20px 20px 0 0",
        background: cardVersionB ? "#fff" : "#fff",
        maxHeight: "80vh",
        display: "flex",
        flexDirection: "column",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 헤더 */}
      {cardVersionB ? (
        <div style={{ background: "#1B2B4B", padding: "16px 20px 14px" }}>
          <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, letterSpacing: "-0.3px" }}>미배차현황</div>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 3 }}>
            미배차 <span style={{ color: "#fff", fontWeight: 600 }}>{unassignedOrders.length}</span>건
            {undeliveredOrders.length > 0 && <> · 정보미전달 <span style={{ color: "#fff", fontWeight: 600 }}>{undeliveredOrders.length}</span>건</>}
          </div>
        </div>
      ) : (
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111", letterSpacing: "-0.3px" }}>미배차현황</div>
          <div style={{ fontSize: 12, color: "#999", marginTop: 3 }}>
            미배차 {unassignedOrders.length}건
            {undeliveredOrders.length > 0 && ` · 정보미전달 ${undeliveredOrders.length}건`}
          </div>
        </div>
      )}

      {/* 목록 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
        {unassignedOrders.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa", fontSize: 13 }}>
            미배차 오더가 없습니다
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[...unassignedOrders]
              .filter(o => o.상차지명 && o.하차지명 && getPickupDate(o))
              .sort((a, b) => {
                const da = getPickupDate(a) || "";
                const db = getPickupDate(b) || "";
                if (da !== db) return da.localeCompare(db);
                return String(a.상차시간 || "").localeCompare(String(b.상차시간 || ""));
              })
              .slice(0, 8)
              .map((o) => (
                <button
                  key={o.id}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 12px",
                    borderRadius: cardVersionB ? 10 : 12,
                    background: cardVersionB ? "#F5F7FA" : "#F8F8F8",
                    border: "none",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setUnassignedTypeFilter("전체");
                    setFocusUnassignedOrderId(o.id);
                    setPage("unassigned");
                    setShowUnassignedEntryPopup(false);
                    window.scrollTo(0, 0);
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      color: cardVersionB ? "#1B2B4B" : "#222",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {o.상차지명} → {o.하차지명}
                    </div>
                    <div style={{ fontSize: 11, color: "#999", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {formatDateHeader(getPickupDate(o))}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                    {[o.상차시간, o.차량톤수 || o.톤수, o.차량종류 || o.차종].filter(Boolean).join(" · ")}
                  </div>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* 하단 버튼 */}
      <div style={{ padding: "10px 14px 20px", display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #f0f0f0" }}>
        <button
          style={{
            padding: "13px 0", borderRadius: 12, fontSize: 14, fontWeight: 700,
            background: cardVersionB ? "#1B2B4B" : "#111",
            color: "#fff", border: "none", cursor: "pointer",
          }}
          onClick={() => {
            setFocusUnassignedOrderId(null);
            setUnassignedTypeFilter("전체");
            setPage("unassigned");
            setShowUnassignedEntryPopup(false);
            window.scrollTo(0, 0);
          }}
        >
          미배차현황 전체 보기
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={{
              flex: 1, padding: "11px 0", borderRadius: 12, fontSize: 13, fontWeight: 600,
              background: "#F0F0F0", color: "#555", border: "none", cursor: "pointer",
            }}
            onClick={() => {
              localStorage.setItem("hideUnassignedPopupDate", todayKST());
              setShowUnassignedEntryPopup(false);
            }}
          >
            오늘 하루 안 보기
          </button>
          <button
            style={{
              flex: 1, padding: "11px 0", borderRadius: 12, fontSize: 13, fontWeight: 600,
              background: "#F0F0F0", color: "#555", border: "none", cursor: "pointer",
            }}
            onClick={() => setShowUnassignedEntryPopup(false)}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  </div>
)}
      <MobileHeader
  title={title}
  cardVersionB={cardVersionB}
  onBack={
    page === "form"
      ? () => {
          if (form._editId && form._returnToDetail) {
            setPage("detail");
            return;
          }
          setPage(prevPage || "list");
        }
      : page === "detail"
      ? () => {
          if (detailFrom) {
            setPage(detailFrom);
            setDetailFrom(null);
          } else {
            setPage("list");
          }
        }
    : page === "notice" || page === "schedule" || page === "unassigned" || page === "handover" || page === "ratecard" || page === "myinfo" || page === "settings" || page === "fleet" || page === "intel"
      ? () => setPage("list")
      : page === "fare"
      ? () => setPage(prevPage || "list")
      : undefined
  }
  onRefresh={page === "list" ? handleRefresh : undefined}
  onMenu={page === "list" ? () => setShowMenu(true) : undefined}
  notifCount={unreadCount}
  onNotifClick={() => { setShowNotifPanel(true); markAllRead(); }}
/>
{showNotifPanel && (
  <NotificationPanel
    notifications={notifications}
    onClose={() => setShowNotifPanel(false)}
    onMarkAllRead={markAllRead}
    onClear={clearNotifs}
    alarmEnabled={alarmEnabled}
    onToggleAlarm={toggleAlarm}
    orders={orders}
  />
)}
      {showMenu && (
        <MobileSideMenu
  onClose={() => setShowMenu(false)}
  currentUser={currentUser}
  mobileUsers={mobileUsers}
  loginTime={loginTime}

  onGoSales={() => {
    setPage("sales");
    setShowMenu(false);
  }}

  onGoList={() => {
    setPage("list");
    setShowMenu(false);
  }}

          hasNewNotice={hasNewNotice}       // ⭐ 추가
  hasNewSchedule={hasNewSchedule}   // ⭐ 추가
  alarmEnabled={alarmEnabled}
 toggleAlarm={toggleAlarm}
           onGoHandover={() => {
    setPage("handover");
    setShowMenu(false);
          }}
          onGoCreate={() => {
  setForm({
    거래처명: "",
    상차일: "",
    상차시간: "",
    하차일: "",
    하차시간: "",
    상차지명: "",
    상차지주소: "",
    하차지명: "",
    하차지주소: "",
    톤수: "",
    차종: "",
    화물내용: "",
    상차방법: "",
    하차방법: "",
    지급방식: "",
    배차방식: "",
    청구운임: 0,
    기사운임: 0,
    수수료: 0,
    산재보험료: 0,
    차량번호: "",
    기사명: "",
    전화번호: "",
    혼적여부: "독차",
    적요: "",
    _editId: null,
    _returnToDetail: false,
  });
  setSelectedOrder(null);
  setPrevPage("list");
  setPage("form");
  setShowMenu(false);
}}
// ⭐⭐⭐ 여기 추가
    onGoNotice={() => {
  if (notices.length) {
    const latest = Math.max(
      ...notices.map(n =>
        n.createdAt?.seconds ||
        n.updatedAt?.seconds ||
        0
      )
    );

    if (latest > 0) {
      localStorage.setItem(
  "lastReadNoticeAt",
  Math.floor(Date.now() / 1000)
);
    }
  }

  setHasNewNotice(false);
  setPage("notice");
  setShowMenu(false);
}}

onGoSchedule={() => {
  if (schedules.length) {
    const latest = Math.max(
      ...schedules.map(s =>
        s.createdAt?.seconds ||
        s.updatedAt?.seconds ||
        (s.start ? Math.floor(new Date(s.start).getTime() / 1000) : 0)
      )
    );

    if (latest > 0) {
      localStorage.setItem(
  "lastReadScheduleAt",
  Math.floor(Date.now() / 1000)
);
    }
  }

  setHasNewSchedule(false);
  setPage("schedule");
  setShowMenu(false);
}}

          onGoFare={() => {
            setPage("fare");
            setShowMenu(false);
          }}
          onGoNationalFare={() => {
            setPage("national-fare");
            setShowMenu(false);
          }}
          onGoRateCard={() => {
            setPage("ratecard");
            setShowMenu(false);
          }}

          onGoUnassigned={() => {
            setUnassignedTypeFilter("전체");
            setPage("unassigned");
            setShowMenu(false);
          }}

          onGoMyInfo={() => {
            setPage("myinfo");
            setShowMenu(false);
          }}

          onGoSettings={() => {
            setPage("settings");
            setShowMenu(false);
          }}

          role={role}
          onGoFleet={() => { setPage("fleet"); setShowMenu(false); }}
          onGoIntel={() => { setPage("intel"); setShowMenu(false); }}
          onDeleteAll={deleteAllOrders}
          setUiScale={setUiScale}
          uiScale={uiScale}
          cardVersionB={cardVersionB}
          onToggleCardVersion={(v) => {
            setCardVersionB(v);
            localStorage.setItem("cardVersion", v ? "B" : "A");
          }}
        />
      )}

      <div className="flex-1 overflow-y-auto pb-24" style={{ WebkitOverflowScrolling: "touch" }}>
        {page === "notice" && (
  <div className="px-4 py-3 space-y-3">
    {/* 등록 버튼 */}
    <button
      onClick={() => {
        setSelectedNotice(null);
        setNoticeForm({ title: "", author: mobileUsers.find(u => u.id === currentUser?.uid)?.name || "", content: "" });
        setNoticeOpen(true);
      }}
      className="w-full py-2.5 rounded-xl bg-[#1B2B4B] text-white text-sm font-semibold"
    >
      + 공지사항 등록
    </button>

    {notices.length === 0 && (
      <div className="text-sm text-gray-400 text-center py-4">
        등록된 공지가 없습니다.
      </div>
    )}

    {notices.map(n => (
      <div
        key={n.id}
        onClick={() => setSelectedNotice(n)}
        className="bg-white rounded-xl border shadow-sm p-4 active:scale-[0.98] transition cursor-pointer"
      >
        {/* 제목 */}
        <div className="text-sm font-semibold text-gray-900">
          {n.title}
        </div>

        {/* 메타 정보 */}
        <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-1">
          <span>
            {n.createdAt?.seconds
              ? new Date(n.createdAt.seconds * 1000).toLocaleDateString("ko-KR")
              : ""}
          </span>
          {n.author && (
            <span className="px-1.5 py-0.5 rounded bg-gray-100">{n.author}</span>
          )}
          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">공지</span>
        </div>

        {/* 내용 미리보기 */}
        <div className="mt-2 text-sm text-gray-700 line-clamp-2 leading-relaxed">
          {n.content}
        </div>
      </div>
    ))}
  </div>
)}

{/* ================= 일정 ================= */}
{page === "schedule" && (
  <div className="px-4 py-3 space-y-3">
    {/* 등록 버튼 */}
    <button
      onClick={() => {
        setSelectedSchedule(null);
        setScheduleForm({ type: "휴가", start: "", end: "", memo: "" });
        setScheduleOpen(true);
      }}
      className="w-full py-2.5 rounded-xl bg-[#1B2B4B] text-white text-sm font-semibold"
    >
      + 일정 등록
    </button>

    {schedules.length === 0 && (
      <div className="text-sm text-gray-400 text-center py-4">
        등록된 일정이 없습니다.
      </div>
    )}

    {sortedSchedules.map(s => {
      const type = s.type || s.title;
      const writer = s.writer || s.name;
      const startDate = s.startDate || s.start;
      const endDate = s.endDate || s.end;
      const memo = s.memo || s.reason;

      return (
        <div
  key={s.id}
  onClick={() => setSelectedSchedule(s)}
  className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm
             active:scale-[0.98] transition"
>
  <div className="flex items-center justify-between">
    <div className="text-sm font-bold text-blue-600">
      {type}
    </div>
    <div className="text-sm font-semibold text-blue-600">
  {writer}
</div>
  </div>

  <div className="mt-2 text-xs text-gray-500">
    {startDate}
    {endDate && endDate !== startDate && ` ~ ${endDate}`}
  </div>

  {memo && (
    <div className="mt-2 text-sm text-gray-700 line-clamp-2">
      {memo}
    </div>
  )}
</div>
      );
    })}
  </div>
)}
{/* 🔥 일정 상세 팝업 */}
{selectedSchedule && !scheduleOpen && (
  <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
    <div className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
      <div className="flex justify-between items-center px-5 py-4 bg-[#1B2B4B]">
        <h3 className="font-bold text-white">일정 상세</h3>
        <button onClick={() => setSelectedSchedule(null)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
      </div>
      <div className="p-5 space-y-3 text-sm">
        <div>
          <div className="text-[11px] text-gray-400 mb-0.5">구분</div>
          <div className="font-semibold">{selectedSchedule.type || selectedSchedule.title}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400 mb-0.5">작성자</div>
          <div>{selectedSchedule.name || selectedSchedule.writer || "-"}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400 mb-0.5">기간</div>
          <div>{(selectedSchedule.startDate || selectedSchedule.start)} ~ {(selectedSchedule.endDate || selectedSchedule.end)}</div>
        </div>
        {(selectedSchedule.memo || selectedSchedule.reason) && (
          <div>
            <div className="text-[11px] text-gray-400 mb-0.5">메모</div>
            <div className="whitespace-pre-wrap bg-gray-50 rounded-lg p-3 text-gray-700">
              {selectedSchedule.memo || selectedSchedule.reason}
            </div>
          </div>
        )}
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={async () => {
              if (!window.confirm("삭제할까요?")) return;
              await deleteDoc(doc(db, "schedules", selectedSchedule.id));
              setSelectedSchedule(null);
            }}
            className="flex-1 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-semibold"
          >삭제</button>
          <button
            onClick={() => {
              setScheduleForm({
                type: selectedSchedule.type || "휴가",
                start: selectedSchedule.startDate || selectedSchedule.start || "",
                end: selectedSchedule.endDate || selectedSchedule.end || "",
                memo: selectedSchedule.memo || selectedSchedule.reason || "",
              });
              setScheduleOpen(true);
            }}
            className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-sm font-semibold"
          >수정</button>
        </div>
      </div>
    </div>
  </div>
)}

{/* 🔥 일정 등록/수정 모달 */}
{scheduleOpen && (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
    <div className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
      <div className="flex justify-between items-center px-5 py-4 bg-[#1B2B4B]">
        <h3 className="font-bold text-white">{selectedSchedule ? "일정 수정" : "일정 등록"}</h3>
        <button onClick={() => { setScheduleOpen(false); }} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
      </div>
      <div className="p-5 space-y-3">
        <select
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B2B4B]"
          value={scheduleForm.type}
          onChange={e => setScheduleForm(f => ({ ...f, type: e.target.value }))}
        >
          <option>휴가</option>
          <option>외근</option>
          <option>반차</option>
          <option>병가</option>
        </select>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] text-gray-400 mb-1">시작일</div>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B2B4B]"
              value={scheduleForm.start}
              onChange={e => setScheduleForm(f => ({ ...f, start: e.target.value }))}
            />
          </div>
          <div>
            <div className="text-[11px] text-gray-400 mb-1">종료일</div>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B2B4B]"
              value={scheduleForm.end}
              onChange={e => setScheduleForm(f => ({ ...f, end: e.target.value }))}
            />
          </div>
        </div>
        <textarea
          rows={3}
          placeholder="메모 (선택)"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B2B4B]"
          value={scheduleForm.memo}
          onChange={e => setScheduleForm(f => ({ ...f, memo: e.target.value }))}
        />
        <button
          onClick={async () => {
            if (!scheduleForm.start) { alert("시작일을 선택해주세요."); return; }
            const me = mobileUsers.find(u => u.id === currentUser?.uid);
            const userName = me?.name || "사용자";
            if (selectedSchedule?.id) {
              await updateDoc(doc(db, "schedules", selectedSchedule.id), {
                type: scheduleForm.type,
                name: userName,
                start: scheduleForm.start,
                end: scheduleForm.end || scheduleForm.start,
                memo: scheduleForm.memo,
              });
            } else {
              await addDoc(collection(db, "schedules"), {
                type: scheduleForm.type,
                name: userName,
                start: scheduleForm.start,
                end: scheduleForm.end || scheduleForm.start,
                memo: scheduleForm.memo,
                createdAt: serverTimestamp(),
              });
            }
            setScheduleOpen(false);
            setSelectedSchedule(null);
          }}
          className="w-full py-3 rounded-xl bg-[#1B2B4B] text-white text-sm font-bold"
        >저장</button>
      </div>
    </div>
  </div>
)}
{/* ================= 인수인계 ================= */}
{page === "handover" && (
  <div className="px-4 py-3 space-y-3">
    {/* 등록 버튼 */}
    <button
      onClick={() => {
        const me = mobileUsers.find(u => u.id === currentUser?.uid);
        setSelectedHandover(null);
        setHandoverEditMode(false);
        setHandoverForm({ text: "", receiver: "", receiverUid: "", date: todayKST() });
        setHandoverOpen(true);
      }}
      className="w-full py-2.5 rounded-xl bg-[#1B2B4B] text-white text-sm font-semibold"
    >
      + 인수인계 등록
    </button>

    {/* 범례 */}
    <div className="flex items-center gap-3 px-1">
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm bg-red-400"></div>
        <span className="text-xs text-gray-500">미확인</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm bg-emerald-400"></div>
        <span className="text-xs text-gray-500">확인완료</span>
      </div>
    </div>

    {handovers.length === 0 && (
      <div className="text-sm text-gray-400 text-center py-4">
        등록된 인수인계가 없습니다.
      </div>
    )}

    {handovers.map(h => {
      const receiverRead = h.readBy?.includes(h.receiverUid);
      const isReceiver = currentUser?.uid === h.receiverUid;
      const isAuthor = currentUser?.uid === h.authorUid;
      const unread = isReceiver && !receiverRead;
      return (
        <div
          key={h.id}
          onClick={async () => {
            setSelectedHandover(h);
            setHandoverEditMode(false);
            setHandoverForm({
              text: h.text || "",
              receiver: h.receiver || "",
              receiverUid: h.receiverUid || "",
              date: h.date || todayKST(),
            });
            if (isReceiver && !receiverRead) {
              await updateDoc(doc(db, "handovers", h.id), {
                readBy: [...(h.readBy || []), currentUser.uid],
              });
            }
          }}
          className={`bg-white rounded-xl border shadow-sm p-4 relative overflow-hidden cursor-pointer ${unread ? "bg-red-50" : ""}`}
        >
          {/* 왼쪽 컬러 바 */}
          {(isReceiver || isAuthor) && (
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${receiverRead ? "bg-emerald-400" : "bg-red-400"}`} />
          )}
          <div className="flex justify-between text-xs text-gray-500 mb-1 pl-1">
            <span>작성자: {h.author || "-"}</span>
            <span>{getHandoverDate(h)}</span>
          </div>
          <div className="text-sm font-semibold mb-1 pl-1">
            받는사람: {h.receiver || "-"}
            {(isReceiver || isAuthor) && (
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-semibold ${receiverRead ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}>
                {receiverRead ? "확인" : "미확인"}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-700 whitespace-pre-wrap pl-1">
            {h.text || ""}
          </div>
        </div>
      );
    })}
  </div>
)}

{/* ===== 공지사항 상세 모달 ===== */}
{selectedNotice && !noticeOpen && (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
    <div className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
      <div className="flex justify-between items-center px-5 py-4 bg-[#1B2B4B]">
        <h3 className="font-bold text-white">공지사항 상세</h3>
        <button onClick={() => setSelectedNotice(null)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
      </div>
      <div className="p-5 space-y-3 text-sm">
        <div>
          <div className="text-[11px] text-gray-400 mb-0.5">제목</div>
          <div className="font-semibold">{selectedNotice.title}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400 mb-0.5">작성자</div>
          <div>{selectedNotice.author}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400 mb-0.5">작성일</div>
          <div>{selectedNotice.createdAt?.seconds ? new Date(selectedNotice.createdAt.seconds * 1000).toLocaleDateString("ko-KR") : "-"}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400 mb-0.5">내용</div>
          <div className="whitespace-pre-wrap bg-gray-50 rounded-lg p-3 text-gray-700 leading-relaxed">{selectedNotice.content}</div>
        </div>
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={async () => {
              if (!window.confirm("삭제할까요?")) return;
              await deleteDoc(doc(db, "notices", selectedNotice.id));
              setSelectedNotice(null);
            }}
            className="flex-1 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-semibold"
          >삭제</button>
          <button
            onClick={() => {
              setNoticeForm({ title: selectedNotice.title, author: selectedNotice.author, content: selectedNotice.content });
              setNoticeOpen(true);
            }}
            className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-sm font-semibold"
          >수정</button>
        </div>
      </div>
    </div>
  </div>
)}

{/* ===== 공지사항 등록/수정 모달 ===== */}
{noticeOpen && (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
    <div className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
      <div className="flex justify-between items-center px-5 py-4 bg-[#1B2B4B]">
        <h3 className="font-bold text-white">{selectedNotice ? "공지사항 수정" : "공지사항 등록"}</h3>
        <button onClick={() => setNoticeOpen(false)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
      </div>
      <div className="p-5 space-y-3">
        <input
          placeholder="제목"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B2B4B]"
          value={noticeForm.title}
          onChange={e => setNoticeForm(f => ({ ...f, title: e.target.value }))}
        />
        <input
          placeholder="작성자"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B2B4B]"
          value={noticeForm.author}
          onChange={e => setNoticeForm(f => ({ ...f, author: e.target.value }))}
        />
        <textarea
          rows={4}
          placeholder="내용"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B2B4B]"
          value={noticeForm.content}
          onChange={e => setNoticeForm(f => ({ ...f, content: e.target.value }))}
        />
        <button
          onClick={async () => {
            if (!noticeForm.title.trim()) { alert("제목을 입력해주세요."); return; }
            if (selectedNotice?.id) {
              await updateDoc(doc(db, "notices", selectedNotice.id), {
                title: noticeForm.title,
                author: noticeForm.author,
                content: noticeForm.content,
              });
            } else {
              await addDoc(collection(db, "notices"), {
                title: noticeForm.title,
                author: noticeForm.author,
                content: noticeForm.content,
                createdAt: serverTimestamp(),
              });
            }
            setNoticeOpen(false);
            setSelectedNotice(null);
            setNoticeForm({ title: "", author: "", content: "" });
          }}
          className="w-full py-3 rounded-xl bg-[#1B2B4B] text-white text-sm font-bold"
        >저장</button>
      </div>
    </div>
  </div>
)}

{/* ===== 인수인계 등록 모달 ===== */}
{handoverOpen && (
  <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50" onClick={() => setHandoverOpen(false)}>
    <div className="bg-white rounded-t-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
      <div className="flex justify-between items-center mb-1">
        <h3 className="font-bold text-base text-gray-800">인수인계 등록</h3>
        <button onClick={() => setHandoverOpen(false)} className="text-gray-400 text-xl leading-none">✕</button>
      </div>
      <select
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
        value={handoverForm.receiver}
        onChange={e => {
          const s = mobileUsers.find(u => u.name === e.target.value);
          setHandoverForm({ ...handoverForm, receiver: s?.name || "", receiverUid: s?.uid || s?.id || "" });
        }}
      >
        <option value="">받는 사람 선택</option>
        {mobileUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
      </select>
      <input
        type="date"
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
        value={handoverForm.date}
        onChange={e => setHandoverForm({ ...handoverForm, date: e.target.value })}
      />
      <textarea
        rows={4}
        placeholder="인수인계 내용을 입력하세요"
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none"
        value={handoverForm.text}
        onChange={e => setHandoverForm({ ...handoverForm, text: e.target.value })}
      />
      <button
        onClick={async () => {
          if (!handoverForm.receiver) { alert("받는 사람을 선택하세요"); return; }
          if (!handoverForm.text.trim()) { alert("내용을 입력하세요"); return; }
          const me = mobileUsers.find(u => u.id === currentUser?.uid);
          await addDoc(collection(db, "handovers"), {
            ...handoverForm,
            author: me?.name || "사용자",
            authorUid: currentUser?.uid || "",
            createdAt: serverTimestamp(),
            readBy: [],
          });
          setHandoverForm({ text: "", receiver: "", receiverUid: "", date: todayKST() });
          setHandoverOpen(false);
        }}
        className="w-full py-3 rounded-xl bg-[#1B2B4B] text-white text-sm font-semibold"
      >
        저장
      </button>
    </div>
  </div>
)}

{/* ===== 인수인계 상세 / 수정 모달 ===== */}
{selectedHandover && (
  <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50" onClick={() => { setSelectedHandover(null); setHandoverEditMode(false); }}>
    <div className="bg-white rounded-t-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
      <div className="flex justify-between items-center mb-1">
        <h3 className="font-bold text-base text-gray-800">{handoverEditMode ? "인수인계 수정" : "인수인계 상세"}</h3>
        <button onClick={() => { setSelectedHandover(null); setHandoverEditMode(false); }} className="text-gray-400 text-xl leading-none">✕</button>
      </div>
      {handoverEditMode ? (
        <>
          <select
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
            value={handoverForm.receiver}
            onChange={e => {
              const s = mobileUsers.find(u => u.name === e.target.value);
              setHandoverForm({ ...handoverForm, receiver: s?.name || "", receiverUid: s?.uid || s?.id || "" });
            }}
          >
            <option value="">받는 사람 선택</option>
            {mobileUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select>
          <input
            type="date"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
            value={handoverForm.date}
            onChange={e => setHandoverForm({ ...handoverForm, date: e.target.value })}
          />
          <textarea
            rows={4}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none"
            value={handoverForm.text}
            onChange={e => setHandoverForm({ ...handoverForm, text: e.target.value })}
          />
          <div className="flex gap-2">
            <button onClick={() => setHandoverEditMode(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold">취소</button>
            <button
              onClick={async () => {
                const me = mobileUsers.find(u => u.id === currentUser?.uid);
                await updateDoc(doc(db, "handovers", selectedHandover.id), {
                  ...handoverForm,
                  author: me?.name || "사용자",
                  authorUid: currentUser?.uid || "",
                });
                setHandoverEditMode(false);
                setSelectedHandover(null);
              }}
              className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-sm font-semibold"
            >
              저장
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-3 text-sm">
            <div><div className="text-xs text-gray-400 mb-0.5">작성자</div><div className="font-semibold">{selectedHandover.author}</div></div>
            <div><div className="text-xs text-gray-400 mb-0.5">받는 사람</div><div>{selectedHandover.receiver}</div></div>
            <div><div className="text-xs text-gray-400 mb-0.5">기준 날짜</div><div>{selectedHandover.date}</div></div>
            <div><div className="text-xs text-gray-400 mb-0.5">내용</div><div className="whitespace-pre-wrap bg-gray-50 rounded-xl p-3 leading-relaxed">{selectedHandover.text}</div></div>
          </div>
          {currentUser?.uid === selectedHandover.authorUid && (
            <div className="flex gap-2 pt-2 border-t">
              <button
                onClick={async () => {
                  if (!window.confirm("삭제할까요?")) return;
                  await deleteDoc(doc(db, "handovers", selectedHandover.id));
                  setSelectedHandover(null);
                }}
                className="flex-1 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-semibold"
              >
                삭제
              </button>
              <button
                onClick={() => {
                  setHandoverForm({
                    text: selectedHandover.text || "",
                    receiver: selectedHandover.receiver || "",
                    receiverUid: selectedHandover.receiverUid || "",
                    date: selectedHandover.date || todayKST(),
                  });
                  setHandoverEditMode(true);
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-sm font-semibold"
              >
                수정
              </button>
            </div>
          )}
        </>
      )}
    </div>
  </div>
)}

        {page === "list" && (
          <MobileOrderList
            groupedByDate={groupedByDate}
            statusTab={statusTab}
            setStatusTab={setStatusTab}
            startDate={startDate}
            endDate={endDate}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            quickRange={quickRange}
            setTodayRange={setTodayRange}
  setTomorrowRange={setTomorrowRange}
            onlyToday={onlyToday}
setOnlyToday={setOnlyToday}
onSelect={(o) => {
  listScrollYRef.current = window.scrollY;
  setSelectedOrder(o);
  setDetailFrom("list");
  setPage("detail");
  window.scrollTo(0, 0);
}}
setOpenMemo={setOpenMemo}
            vehicleFilter={vehicleFilter}
            setVehicleFilter={setVehicleFilter}
            assignFilter={assignFilter}
            setAssignFilter={setAssignFilter}
            searchType={searchType}
            setSearchType={setSearchType}
            searchText={searchText}
            setSearchText={setSearchText}
            onDeleteSelected={deleteSelectedOrders}
            onDeleteOrder={deleteSingleOrder}
            onCopyOrder={handleOrderDuplicate}
            onCopyDriver={handleOrderDuplicateWithDriver}
            multiSelectMode={multiSelectMode}
            setMultiSelectMode={setMultiSelectMode}
            cardVersionB={cardVersionB}
            drivers={drivers}
          />
        )}
{page === "sales" && (
  <MobileSalesPage
    data={orders}   // ⚠ dispatchData 아님 → orders 써야함
    onBack={() => setPage("list")}
  />
)}
    {page === "form" && (
          <MobileOrderForm
            form={form}
            setForm={setForm}
            clients={[
              ...places,
              ...clients.filter(c =>
                c.거래처명 &&
                !places.some(p => normalizeCompany(p.거래처명) === normalizeCompany(c.거래처명))
              )
            ]}
            onSave={handleSave}
            setPage={setPage}
            showToast={showToast}
            drivers={drivers}
            upsertDriver={upsertDriver}
            orders={orders}
            cardVersionB={cardVersionB}
          />
        )}

        {page === "detail" && selectedOrder && (
          <MobileOrderDetail
            order={selectedOrder}
            onOrderUpdate={(id, patch) => {
    setOrders(prev => prev.map(o => (o.id === id || o._id === id) ? { ...o, ...patch } : o));
  }}
            drivers={drivers}
            orders={orders}
            clients={[
              ...places,
              ...clients.filter(c =>
                c.거래처명 &&
                !places.some(p => normalizeCompany(p.거래처명) === normalizeCompany(c.거래처명))
              )
            ]}
            onDuplicate={handleOrderDuplicate}
            onAssignDriver={assignDriver}
            onCancelAssign={cancelAssign}
            onCancelOrder={cancelOrder}
            setPage={setPage}
            setForm={setForm}
            setSelectedOrder={setSelectedOrder}
            showToast={showToast}
            showSuccess={showSuccess}
            upsertDriver={upsertDriver}
            setPrevPage={setPrevPage}
            cardVersionB={cardVersionB}
            onGoFare={() => {
              setPrevPage("detail");
              setPage("fare");
            }}
          />
        )}

       {page === "fare" && (
          <MobileStandardFare onBack={() => setPage("list")} />
        )}
        {page === "national-fare" && (
          <MobileNationalFare onBack={() => setPage("list")} />
        )}
        {page === "ratecard" && (
          <MobileRateCard
            dispatchData={orders}
            onBack={() => setPage("list")}
          />
        )}
        {page === "myinfo" && (
          <MobileMyInfo
            currentUser={currentUser}
            mobileUsers={mobileUsers}
            loginTime={loginTime}
            orders={orders}
            userCompany={userCompany || localStorage.getItem("userCompany") || ""}
            onBack={() => setPage("list")}
          />
        )}
        {page === "settings" && (
          <MobileSettingsPage
            onBack={() => setPage("list")}
            cardVersionB={cardVersionB}
            setCardVersionB={setCardVersionB}
            alarmEnabled={alarmEnabled}
            toggleAlarm={toggleAlarm}
            fontScale={fontScale}
            setFontScale={setFontScale}
            appVersion={appVersion}
            showSuccess={showSuccess}
            onLogout={logout}
            userCompany={userCompany}
          />
        )}
        {page === "fleet" && <MobileFleetView />}
        {page === "intel" && <MobileIntelView dispatchData={orders} />}

        {page === "unassigned" && (
  <MobileUnassignedList
    title="미배차 / 정보미전달"
    orders={{
      unassigned: unassignedOrders,
      undelivered: undeliveredOrders,
    }}
    unassignedTypeFilter={unassignedTypeFilter}
    setUnassignedTypeFilter={setUnassignedTypeFilter}
    setTodayRange={setTodayRange}
    setTomorrowRange={setTomorrowRange}
    onBack={() => setPage("list")}
    setSelectedOrder={setSelectedOrder}
    setPage={setPage}
    setDetailFrom={setDetailFrom}
    setOpenMemo={setOpenMemo}
    setPrevPage={setPrevPage}
    tab={unassignedTab}
    setTab={setUnassignedTab}
    onSaveScroll={() => { unassignedScrollYRef.current = window.scrollY; }}

    focusOrderId={focusUnassignedOrderId}
    onFocusDone={() => setFocusUnassignedOrderId(null)}
    cardVersionB={cardVersionB}
  />
)}

      </div>

      {page === "list" && !showMenu && !multiSelectMode && (
        <button
          onClick={() => {
            setForm({
              거래처명: "",
              상차일: todayKST(),
              상차시간: "",
              하차일: todayKST(),
              하차시간: "",
              상차지명: "",
              상차지주소: "",
              하차지명: "",
              하차지주소: "",
              톤수: "",
              차종: "",
              화물내용: "",
              상차방법: "",
              하차방법: "",
              지급방식: "",
              배차방식: "",
              청구운임: 0,
              기사운임: 0,
              수수료: 0,
              산재보험료: 0,
              차량번호: "",
              기사명: "",
              전화번호: "",
              혼적여부: "독차",
              적요: "",
              _editId: null,
              _returnToDetail: false,
            });
            setSelectedOrder(null);
            setPrevPage("list");
            setPage("form");
          }}
          className={`fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full text-white text-3xl flex items-center justify-center active:scale-95 transition-transform ${
            cardVersionB
              ? "bg-[#1B2B4B] shadow-[0_4px_20px_rgba(27,43,75,0.35)]"
              : "bg-blue-500 shadow-lg"
          }`}
        >
          +
        </button>
      )}
      {/* ⭐⭐⭐ 글씨 크기 wrapper 닫힘 */}
  </div>
  </div>
);
}
function MobileSalesPage({ data = [], onBack }) {
  const [month, setMonth] = useState(new Date(new Date().getTime() + 9*60*60*1000).toISOString().slice(0,7));
  const toInt = (v) => Number(String(v || "").replace(/[^\d]/g, "")) || 0;
  const fmtWon = (v) => Number(v).toLocaleString("ko-KR");

  const allBase = data.filter(r => r.상차일 && !(r.거래처명||"").includes("후레쉬물류"));
  const rows = allBase.filter(r => r.상차일.startsWith(month));

  const prevMonth = (() => { const d = new Date(month+"-01"); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7); })();
  const prevRows = allBase.filter(r => r.상차일.startsWith(prevMonth));

  const calcKPI = (list) => list.reduce((a, r) => {
    const s = toInt(r.청구운임), d = toInt(r.기사운임);
    return { sale: a.sale+s, driver: a.driver+d, fee: a.fee+(s-d), cnt: a.cnt+1 };
  }, { sale:0, driver:0, fee:0, cnt:0 });

  const cur = calcKPI(rows);
  const prev = calcKPI(prevRows);
  const profitRate = cur.sale > 0 ? (cur.fee / cur.sale * 100) : 0;
  const avgFare = cur.cnt > 0 ? Math.round(cur.sale / cur.cnt) : 0;
  const saleDiff = cur.sale - prev.sale;
  const saleDiffPct = prev.sale > 0 ? (saleDiff / prev.sale * 100) : null;

  // 최근 6개월 트렌드
  const trendData = Array.from({length: 6}, (_, i) => {
    const d = new Date(month+"-01"); d.setMonth(d.getMonth()-5+i);
    const ym = d.toISOString().slice(0,7);
    const rs = allBase.filter(r => r.상차일.startsWith(ym));
    const k = calcKPI(rs);
    return { ym: ym.slice(5)+"월", 매출: k.sale, 수익: k.fee, 건수: k.cnt };
  });

  // 거래처 TOP5
  const byClient = {};
  rows.forEach(r => { const c = r.거래처명||"미지정"; byClient[c] = (byClient[c]||0)+toInt(r.청구운임); });
  const top5 = Object.entries(byClient).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxClient = top5[0]?.[1] || 1;

  // 요일별
  const byDay = Array(7).fill(null).map((_,i) => ({ day:["일","월","화","수","목","금","토"][i], 건수:0, 매출:0 }));
  rows.forEach(r => {
    if (!r.상차일) return;
    const dow = new Date(r.상차일+"T00:00:00").getDay();
    byDay[dow].건수 += 1; byDay[dow].매출 += toInt(r.청구운임);
  });
  const maxDay = Math.max(...byDay.map(d=>d.건수), 1);
  const busyDayLabel = byDay.find(d=>d.건수===maxDay)?.day;

  // 스마트 인사이트 (모노톤)
  const insights = [
    saleDiffPct !== null ? {
      icon: saleDiff >= 0 ? "▲" : "▼",
      label: "전월 대비 매출",
      value: `${saleDiff>=0?"+":""}${saleDiffPct.toFixed(1)}%`,
      sub: `${Math.abs(saleDiff).toLocaleString()}원 ${saleDiff>=0?"증가":"감소"}`,
      positive: saleDiff >= 0,
    } : null,
    top5[0] ? {
      icon: "①",
      label: "이달 최고 거래처",
      value: top5[0][0],
      sub: `${top5[0][1].toLocaleString()}원 · 점유 ${Math.round(top5[0][1]/cur.sale*100)||0}%`,
      positive: true,
    } : null,
    {
      icon: "≈",
      label: "건당 평균 청구운임",
      value: `${avgFare.toLocaleString()}원`,
      sub: `총 ${cur.cnt}건 수주`,
      positive: true,
    },
    {
      icon: "%",
      label: "수익률",
      value: `${profitRate.toFixed(1)}%`,
      sub: `수익 ${cur.fee.toLocaleString()}원`,
      positive: profitRate >= 10,
    },
  ].filter(Boolean);

  const monthLabel = (() => {
    const [y, m] = month.split("-");
    return `${y}년 ${Number(m)}월`;
  })();

  // SVG 다이얼 게이지 컴포넌트
  const Dial = ({ pct, color, size = 72 }) => {
    const r = size * 0.38, cx = size / 2, cy = size / 2;
    const circ = 2 * Math.PI * r;
    const dash = Math.min(Math.max(pct, 0), 100) / 100 * circ;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E5E7EB" strokeWidth="6" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`} />
        <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="middle"
          fontSize={size*0.18} fontWeight="700" fill={color}>{Math.round(pct)}%</text>
      </svg>
    );
  };

  const maxSale = Math.max(cur.sale, prev.sale, 1);
  const kpiCards = [
    { label:"총 청구운임", value:cur.sale, sub:`${cur.cnt}건 수주`, pct: Math.min(cur.sale/maxSale*100,100), color:"#1B2B4B" },
    { label:"수익 (수수료)", value:cur.fee, sub:`수익률 ${profitRate.toFixed(1)}%`, pct: Math.min(profitRate,100), color: profitRate>=15?"#10B981":profitRate>=10?"#F59E0B":"#EF4444" },
    { label:"기사 운임", value:cur.driver, sub:"지급 합계", pct: cur.sale>0?Math.min(cur.driver/cur.sale*100,100):0, color:"#6B7280" },
    { label:"건당 평균", value:avgFare, sub:"청구운임 기준", pct: prev.cnt>0?Math.min(avgFare/Math.round(prev.sale/prev.cnt)*100,100):50, color:"#4F46E5" },
  ];

  return (
    <div className="bg-[#f4f5f8] min-h-screen pb-10">
      {/* 헤더 */}
      <div className="bg-[#1B2B4B] px-4 pt-5 pb-6">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={onBack} className="text-white/60">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div>
            <div className="text-white font-bold text-[16px] tracking-tight">매출관리</div>
            <div className="text-white/40 text-[11px]">{monthLabel} 실적</div>
          </div>
          <div className="ml-auto">
            <input type="month" value={month} onChange={e=>setMonth(e.target.value)}
              className="bg-white/10 text-white text-[12px] border border-white/20 rounded-lg px-2 py-1 outline-none" />
          </div>
        </div>
        {/* 헤더 내 핵심 지표 요약 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label:"총청구운임", value:cur.sale },
            { label:"수익", value:cur.fee },
            { label:"수익률", value:null, text:`${profitRate.toFixed(1)}%` },
          ].map((item,i) => (
            <div key={i} className="bg-white/8 rounded-xl px-3 py-2.5 border border-white/10">
              <div className="text-white/50 text-[10px] mb-1">{item.label}</div>
              <div className="text-white font-bold text-[13px] leading-tight">
                {item.text ?? `${fmtWon(item.value)}원`}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* 전월 대비 배너 */}
        <div className={`rounded-xl px-3 py-2.5 flex items-center justify-between text-[12px] font-semibold border ${saleDiff>=0?"bg-emerald-50 border-emerald-200 text-emerald-700":"bg-rose-50 border-rose-200 text-rose-600"}`}>
          <span className="shrink-0">전월 대비</span>
          <span className="text-right ml-2">{saleDiff>=0?"▲":"▼"} {fmtM(Math.abs(saleDiff))} {saleDiffPct!==null?`(${saleDiffPct>=0?"+":""}${saleDiffPct.toFixed(1)}%)`:"(전월 없음)"}</span>
        </div>

        {/* KPI 4카드 — 다이얼 게이지 */}
        <div className="grid grid-cols-2 gap-2">
          {kpiCards.map((k,i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2.5 flex flex-col items-center text-center gap-1">
              <Dial pct={k.pct} color={k.color} size={52} />
              <div className="w-full min-w-0">
                <div className="text-[9px] text-gray-400 font-semibold leading-tight">{k.label}</div>
                <div className="text-[12px] font-extrabold leading-tight text-gray-900">{fmtWon(k.value)}<span className="text-[9px] font-normal text-gray-400 ml-0.5">원</span></div>
                <div className="text-[9px] text-gray-400 mt-0.5">{k.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 스마트 인사이트 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-[#1B2B4B]">
            <div className="text-[13px] font-bold text-white tracking-tight">스마트 인사이트</div>
            <div className="text-[10px] text-white/40 mt-0.5">AI 기반 월별 분석 요약</div>
          </div>
          <div className="divide-y divide-gray-50">
            {insights.map((ins,i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[13px] font-bold shrink-0 ${ins.positive?"bg-gray-100 text-gray-600":"bg-rose-50 text-rose-500"}`}>{ins.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-gray-400">{ins.label}</div>
                  <div className={`text-[13px] font-bold truncate ${ins.positive?"text-gray-800":"text-rose-600"}`}>{ins.value}</div>
                </div>
                <div className="text-[10px] text-gray-400 text-right shrink-0 max-w-[70px] leading-tight">{ins.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 최근 6개월 트렌드 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-[13px] font-bold text-[#1B2B4B] mb-3">최근 6개월 매출 추이</div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{top:4,right:8,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="ym" tick={{fontSize:10,fill:"#9CA3AF"}} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v=>v>=1000000?`${(v/1000000).toFixed(0)}M`:v>=10000?`${Math.round(v/10000)}만`:`${v}`} tick={{fontSize:9,fill:"#9CA3AF"}} axisLine={false} tickLine={false} width={36} />
                <Tooltip formatter={(v,n)=>[`${v.toLocaleString()}원`, n]} contentStyle={{borderRadius:10,fontSize:11}} />
                <Line type="monotone" dataKey="매출" stroke="#1B2B4B" strokeWidth={2.5} dot={false} activeDot={{r:4}} />
                <Line type="monotone" dataKey="수익" stroke="#6B7280" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 mt-2 justify-center text-[11px] text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#1B2B4B] inline-block" />매출</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-gray-400 inline-block" />수익</span>
          </div>
        </div>

        {/* 거래처 TOP5 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-[13px] font-bold text-[#1B2B4B] mb-3">거래처 TOP 5</div>
          {top5.length === 0 && <div className="text-[12px] text-gray-400 text-center py-4">데이터 없음</div>}
          <div className="space-y-2.5">
            {top5.map(([name,sale],i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center ${i===0?"bg-[#1B2B4B] text-white":"bg-gray-100 text-gray-500"}`}>{i+1}</span>
                    <span className="text-[13px] font-semibold text-gray-800 truncate max-w-[150px]">{name}</span>
                  </div>
                  <span className="text-[12px] font-bold text-gray-700">{sale.toLocaleString()}원</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-[#1B2B4B]" style={{width:`${Math.round(sale/maxClient*100)}%`, opacity: 0.3+0.7*(1-i*0.15)}} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 요일별 수주 분석 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-[13px] font-bold text-[#1B2B4B] mb-3">요일별 수주 현황</div>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDay} barSize={22} margin={{top:0,right:4,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="day" tick={{fontSize:11,fill:"#6B7280"}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize:9,fill:"#9CA3AF"}} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{borderRadius:10,fontSize:11}} formatter={(v)=>[`${v}건`,"건수"]} />
                <Bar dataKey="건수" radius={[4,4,0,0]}>
                  {byDay.map((d,i) => <Cell key={i} fill={d.건수===maxDay?"#1B2B4B":"#D1D5DB"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-[11px] text-gray-400 text-center">가장 많은 수주 요일: <b className="text-[#1B2B4B]">{busyDayLabel}요일</b></div>
        </div>

      </div>
    </div>
  );
}
// ======================= src/mobile/MobileApp.jsx (PART 2/3) =======================

// ----------------------------------------------------------------------
// 공통 헤더 / 사이드 메뉴
// ----------------------------------------------------------------------
const MobileHeader = React.memo(function MobileHeader({ title, onBack, onRefresh, onMenu, notifCount = 0, onNotifClick, cardVersionB = false }) {
  const isListPage = title === "등록내역";
  const iconColor = cardVersionB ? "#ffffff" : "#374151";
  const bellColor = cardVersionB ? "#ffffff" : "#1f2937";

  return (
    <div className={`flex items-center justify-between px-4 sticky top-0 z-30 ${
      cardVersionB
        ? "bg-[#1B2B4B] py-3.5"
        : "bg-white border-b py-3"
    }`} style={{ willChange: "transform", transform: "translateZ(0)", WebkitTransform: "translateZ(0)" }}>
      <div className="w-12">
        {isListPage ? (
          <button
            onClick={onMenu}
            className={`text-[13px] font-bold tracking-wide ${cardVersionB ? "text-white/80 hover:text-white" : "text-blue-600"}`}
          >
            MENU
          </button>
        ) : (
          onBack && (
            <button onClick={onBack} className={`flex items-center ${cardVersionB ? "text-white" : "text-gray-600"}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
          )
        )}
      </div>

      <div className={`font-bold text-[15px] tracking-tight ${cardVersionB ? "text-white" : "text-gray-800"}`}>
        {title}
      </div>

      <div className="flex items-center gap-1 justify-end">
        {onRefresh && (
          <button
            className={`w-8 h-8 flex items-center justify-center rounded-full transition ${cardVersionB ? "active:bg-white/10" : "active:bg-gray-100"}`}
            onClick={onRefresh}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6"/>
              <path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
        )}
        <button
          className={`relative w-8 h-8 flex items-center justify-center rounded-full transition ${cardVersionB ? "active:bg-white/10" : "active:bg-gray-100"}`}
          onClick={onNotifClick}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={bellColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {notifCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
              {notifCount > 99 ? "99+" : notifCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
});
function NotificationPanel({ notifications, onClose, onMarkAllRead, onClear, alarmEnabled, onToggleAlarm, orders }) {
  const [expanded, setExpanded] = useState(null);

  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const typeStyle = {
    "등록": "bg-blue-100 text-blue-700",
    "배차완료": "bg-emerald-100 text-emerald-700",
    "취소": "bg-red-100 text-red-600",
    "수정": "bg-amber-100 text-amber-700",
  };

  const typeLabel = {
    "등록": "신규 등록",
    "배차완료": "배차완료",
    "취소": "취소",
    "수정": "수정",
  };

  const getOrderDetail = (orderId) => {
    return orders?.find(o => (o.id || o._id) === orderId) || null;
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" onClick={onClose}>
      <div
        className="bg-white w-full max-h-[80vh] flex flex-col shadow-2xl rounded-b-2xl border-b border-gray-100"
        onClick={e => e.stopPropagation()}
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.13)" }}
      >
        {/* 패널 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="font-bold text-[15px] text-gray-800">알림</span>
          <div className="flex items-center gap-3">
            {/* 알림 on/off 토글 */}
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-gray-500">알림</span>
              <button
                onClick={onToggleAlarm}
                className={`relative w-10 h-5 rounded-full transition-colors ${alarmEnabled ? "bg-emerald-500" : "bg-gray-300"}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${alarmEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
            {notifications.length > 0 && (
              <button onClick={onMarkAllRead} className="text-[12px] text-blue-500 font-semibold">전체읽음</button>
            )}
            {notifications.length > 0 && (
              <button onClick={onClear} className="text-[12px] text-gray-400">전체삭제</button>
            )}
            <button onClick={onClose} className="text-gray-400 ml-1">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* 알림 리스트 */}
        <div className="overflow-y-auto flex-1">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-gray-400">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <p className="text-[13px]">알림이 없습니다</p>
            </div>
          ) : (
            notifications.map((notif) => {
              const isExp = expanded === notif.id;
              const detail = isExp ? getOrderDetail(notif.orderId) : null;
              return (
                <div key={notif.id} className={`border-b border-gray-50 last:border-b-0 ${!notif.read ? "bg-blue-50/40" : "bg-white"}`}>
                  <button
                    className="w-full text-left px-4 py-3 active:bg-gray-50 transition"
                    onClick={() => setExpanded(isExp ? null : notif.id)}
                  >
                    <div className="flex items-start gap-2.5">
                      {!notif.read && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
                      {notif.read && <div className="w-1.5 h-1.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${typeStyle[notif.type] || "bg-gray-100 text-gray-600"}`}>
                            {typeLabel[notif.type] || notif.type}
                          </span>
                          <span className="text-[11px] text-gray-400">{fmtDate(notif.date)}</span>
                        </div>
                        <p className="text-[13px] text-gray-800 font-medium truncate">
                          {notif.거래처명 && `[${notif.거래처명}] `}{notif.상차지명 || "-"} → {notif.하차지명 || "-"}
                        </p>
                        {notif.상차일 && (
                          <p className="text-[11px] text-gray-400 mt-0.5">상차일: {notif.상차일}</p>
                        )}
                        {notif.type === "배차완료" && notif.이름 && (
                          <p className="text-[11px] text-emerald-600 mt-0.5">{notif.이름} {notif.차량번호}</p>
                        )}
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" className={`shrink-0 mt-1 transition-transform ${isExp ? "rotate-180" : ""}`}>
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </div>
                  </button>
                  {/* 확장된 상세 정보 */}
                  {isExp && (
                    <div className="px-4 pb-3 bg-gray-50 border-t border-gray-100">
                      {detail ? (
                        <div className="space-y-1.5 pt-2 text-[12px]">
                          <DetailRow label="거래처" value={detail.거래처명} />
                          <DetailRow label="상차지" value={detail.상차지명} />
                          <DetailRow label="하차지" value={detail.하차지명} />
                          <DetailRow label="상차일" value={detail.상차일} />
                          <DetailRow label="차량종류" value={`${detail.차량종류 || ""} ${detail.차량톤수 || ""}`} />
                          <DetailRow label="차량번호" value={detail.차량번호} />
                          <DetailRow label="기사명" value={detail.이름} />
                          <DetailRow label="청구운임" value={detail.청구운임 ? Number(detail.청구운임).toLocaleString() + "원" : ""} />
                          <DetailRow label="상태" value={detail.상태} />
                        </div>
                      ) : (
                        <p className="text-[12px] text-gray-400 pt-2">오더 정보를 불러올 수 없습니다.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-gray-400 w-14 shrink-0">{label}</span>
      <span className="text-gray-700 font-medium">{value}</span>
    </div>
  );
}

function MobileSideMenu({
  onClose,
  onGoList,
  onGoCreate,
  onGoFare,
  onGoNationalFare,
  onGoRateCard,
  onGoSales,
  onGoUnassigned,
  onGoNotice,
  onGoSchedule,
  hasNewNotice,
  hasNewSchedule,
  onDeleteAll,
  onGoHandover,
  onGoMyInfo,
  onGoSettings,
  setUiScale,
  uiScale,
  alarmEnabled,
  toggleAlarm,
  currentUser,
  mobileUsers,
  loginTime,
  cardVersionB,
  onToggleCardVersion,
  role,
  onGoFleet,
  onGoIntel,
}) {
  const myName =
    mobileUsers?.find(u => u.id === currentUser?.uid)?.name ||
    currentUser?.email ||
    "사용자";

  const fmtLoginTime = (date) => {
    if (!date) return "";
    return date.toLocaleString("ko-KR", {
      month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const logout = async () => {
    if (!window.confirm("로그아웃 하시겠습니까?")) return;
    try {
      await signOut(auth);
    } catch (e) {
      console.error("signOut error:", e);
    }
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace("/login");
  };

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
     <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl flex flex-col border-r border-gray-200">

       {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-[15px] font-extrabold text-[#1B2B4B] tracking-tight">(주)KP-Flow 모바일</div>
            <div className="text-[11px] text-gray-400 mt-0.5">DISPATCH MANAGEMENT</div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
              <span className="text-[12px] font-bold text-[#1B2B4B]">{myName}</span>
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              접속: {fmtLoginTime(loginTime)}
            </div>
          </div>
          <button
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition"
            onClick={onClose}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 메뉴 본문 */}
        <div className="flex-1 overflow-y-auto py-1">

          <MenuSection title="배차관리">
            <MenuItem label="등록내역" onClick={onGoList} />
            <MenuItem label="화물등록" onClick={onGoCreate} />
            <MenuItem label="미배차현황" onClick={onGoUnassigned} />
          </MenuSection>

          <MenuSection title="공지 / 일정">
            <MenuItem label="공지사항" onClick={onGoNotice} badge={hasNewNotice ? "NEW" : null} />
            <MenuItem label="일정" onClick={onGoSchedule} badge={hasNewSchedule ? "NEW" : null} />
            <MenuItem label="인수인계" onClick={onGoHandover} />
          </MenuSection>

          <MenuSection title="매출 / 운임표">
            <MenuItem label="표준운임표" onClick={onGoFare} />
            <MenuItem label="전국운임 조회" onClick={onGoNationalFare} />
            <MenuItem label="단가표" onClick={onGoRateCard} />
            <MenuItem label="매출관리" onClick={onGoSales} />
          </MenuSection>

          {role === "totalMaster" && (
            <MenuSection title="관리자 전용">
              <MenuItem label="지입차관리" onClick={onGoFleet} />
              <MenuItem label="경영인텔리전스" onClick={onGoIntel} />
            </MenuSection>
          )}

          <MenuSection title="내 계정">
            <MenuItem label="내정보" onClick={onGoMyInfo} />
            <MenuItem label="설정" onClick={onGoSettings} />
          </MenuSection>

        </div>

        {/* 하단 컨트롤 */}
        <div className="border-t border-gray-100">

          {/* 알림 토글 */}
          <div className="px-5 py-3 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-gray-700">알림</span>
            <button
              onClick={toggleAlarm}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                alarmEnabled ? "bg-emerald-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  alarmEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* 화면 크기 */}
          <div className="px-5 py-3 border-t border-gray-50">
            <div className="text-[11px] font-semibold text-gray-400 tracking-wider mb-2">화면 크기</div>
            <div className="flex gap-1.5">
              {[
                { v: 1, label: "기본" },
                { v: 1.1, label: "크게" },
                { v: 1.2, label: "아주 크게" },
              ].map(({ v, label }) => (
                <button
                  key={v}
                  onClick={() => {
                    setUiScale(v);
                    localStorage.setItem("uiScale", v);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                    uiScale === v
                      ? "bg-[#1B2B4B] text-white shadow-sm"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 카드 스타일 */}
          <div className="px-5 py-3 border-t border-gray-50">
            <div className="text-[11px] font-semibold text-gray-400 tracking-wider mb-2">카드 스타일</div>
            <div className="flex gap-1.5">
              {[
                { v: false, label: "A형 (기본)" },
                { v: true, label: "B형 (심플)" },
              ].map(({ v, label }) => (
                <button
                  key={String(v)}
                  onClick={() => onToggleCardVersion(v)}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                    cardVersionB === v
                      ? "bg-[#1B2B4B] text-white shadow-sm"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 로그아웃 */}
          <div className="px-5 py-3 border-t border-gray-100">
            <button
              onClick={logout}
              className={`w-full py-2.5 rounded-xl text-[13px] font-semibold active:scale-[0.98] transition ${
                cardVersionB
                  ? "bg-[#1B2B4B]/5 text-[#1B2B4B]/60 border border-[#1B2B4B]/10 hover:bg-[#1B2B4B]/10"
                  : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 font-bold"
              }`}
            >
              로그아웃
            </button>
          </div>
          {/* 버전 */}
          <div className="px-5 py-2 flex items-center justify-between">
            <span className="text-[11px] text-gray-400">버전</span>
            <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">v{APP_VERSION}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuSection({ title, children }) {
  return (
    <div className="mt-1 mb-1">
      <div className="px-5 pt-4 pb-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
        {title}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function MenuItem({ label, onClick, badge }) {
  return (
    <button
      className="w-full flex items-center justify-between px-5 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
      onClick={onClick}
    >
      <span>{label}</span>
      <div className="flex items-center gap-2">
        {badge && (
          <span className="px-1.5 py-0.5 text-[9px] font-extrabold rounded bg-blue-500 text-white leading-none">
            {badge}
          </span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
    </button>
  );
}


// ======================================================================
// 업로드링크 발송 모달
// ======================================================================
function UploadLinkModal({ orders = [], onClose }) {
  const baseUrl = window.location.origin;
  const [previewDriver, setPreviewDriver] = useState(null);

  // 기사별로 오더를 그룹핑 (전화번호 기준)
  const drivers = useMemo(() => {
    const map = new Map();
    orders.forEach(o => {
      const phone = (o.전화번호 || "").replace(/[^0-9]/g, "");
      if (!phone) return;
      if (!map.has(phone)) {
        map.set(phone, { name: o.기사명 || "기사", phone, vehicle: o.차량번호 || "", orders: [] });
      }
      map.get(phone).orders.push(o);
    });
    return Array.from(map.values());
  }, [orders]);

  // 기사별 개인화 메시지 생성
  const buildMsg = (driver) => {
    const { name, vehicle, orders: dOrders } = driver;
    const lines = [];
    lines.push("안녕하세요 돌캐 운송사입니다.\n");

    // 날짜 목록 (여러 오더면 복수 표시)
    const dates = [...new Set(dOrders.map(o => {
      const date = (o.상차일 || "").slice(0, 10);
      const [y, m, d] = date.split("-");
      return y && m && d ? `${y}년 ${parseInt(m)}월 ${parseInt(d)}일` : date;
    }).filter(Boolean))];
    if (dates.length > 0) lines.push(`📅 ${dates.join(", ")}`);
    if (dOrders.length > 1) lines.push(`총 ${dOrders.length}건`);

    lines.push("파렛전표 및 거래명세서, 타코기록지 등\n관련 서류 업로드를 부탁드립니다.\n미 확인 시 운임 지연이 발생할 수 있습니다.\n");
    lines.push("[인수증 업로드 안내]");
    lines.push("아래 링크에서 서류를 업로드해 주세요.\n");
    lines.push("📋 업로드 방법");
    lines.push("① 아래 링크 클릭");
    lines.push("② 날짜·차량번호·이름 확인");
    lines.push("③ 오더 선택 후 사진 업로드");
    lines.push("");

    // 개인화 URL (날짜·차량번호·이름 자동입력)
    const firstOrder = dOrders[0];
    const params = new URLSearchParams();
    if (firstOrder?.상차일) params.set("date", firstOrder.상차일.slice(0, 10));
    if (vehicle) params.set("vehicle", vehicle.replace(/\s/g, ""));
    if (name) params.set("name", name);
    const uploadUrl = `${baseUrl}/driver-upload?${params.toString()}`;
    lines.push(uploadUrl);

    return lines.join("\n");
  };

  const handleSendAll = () => {
    if (drivers.length === 0) return;
    // Android: 쉼표로 여러 수신자 (iOS 미지원)
    const phones = drivers.map(d => d.phone).join(",");
    // 전체 발송 시 첫 번째 기사 메시지 사용 (공통 부분 위주)
    const msg = buildMsg(drivers[0]);
    window.location.href = `sms:${phones}?body=${encodeURIComponent(msg)}`;
    onClose();
  };

  const previewMsg = previewDriver ? buildMsg(previewDriver) : (drivers[0] ? buildMsg(drivers[0]) : "");

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40">
      <div className="w-full max-w-md bg-white rounded-t-2xl shadow-xl px-4 pt-5 pb-8 max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <span className="text-[15px] font-bold text-gray-800">업로드링크 발송</span>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none">&times;</button>
        </div>

        {/* iOS 안내 */}
        <div className="bg-[#1B2B4B]/5 border border-[#1B2B4B]/20 rounded-xl px-3 py-2 mb-3 flex-shrink-0">
          <p className="text-[11px] text-[#1B2B4B] font-semibold">
            아이폰은 개별 발송을 이용해 주세요 (iOS 다중발송 미지원)
          </p>
        </div>

        {/* 메시지 미리보기 */}
        <div className="bg-gray-50 rounded-xl p-3 mb-3 text-[11px] text-gray-600 whitespace-pre-wrap border border-gray-200 overflow-y-auto flex-shrink-0" style={{ maxHeight: 160 }}>
          {previewMsg}
        </div>

        {/* 기사 목록 */}
        {drivers.length === 0 ? (
          <p className="text-[13px] text-gray-400 text-center py-4">전화번호가 등록된 기사가 없습니다.</p>
        ) : (
          <div className="space-y-2 mb-4 overflow-y-auto flex-grow">
            {drivers.map(d => (
              <div
                key={d.phone}
                className={`flex items-center justify-between rounded-xl px-3 py-2 cursor-pointer transition ${previewDriver?.phone === d.phone ? "bg-indigo-50 border border-indigo-200" : "bg-gray-50 border border-transparent"}`}
                onClick={() => setPreviewDriver(previewDriver?.phone === d.phone ? null : d)}
              >
                <div>
                  <span className="text-[13px] font-semibold text-gray-800">{d.name}</span>
                  <span className="ml-2 text-[11px] text-gray-500">{d.phone}</span>
                  <span className="ml-1 text-[11px] text-gray-400">{d.orders.length}건</span>
                </div>
                <a
                  href={`sms:${d.phone}?body=${encodeURIComponent(buildMsg(d))}`}
                  onClick={e => e.stopPropagation()}
                  className="text-[12px] text-indigo-600 font-semibold border border-indigo-200 rounded-lg px-2 py-1 bg-white"
                >
                  문자
                </a>
              </div>
            ))}
          </div>
        )}

        {/* 전체 발송 버튼 (Android용) */}
        <button
          onClick={handleSendAll}
          disabled={drivers.length === 0}
          className="w-full py-3 rounded-xl bg-indigo-600 text-white text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition flex-shrink-0"
        >
          전체 {drivers.length}명 일괄발송 (Android)
        </button>
      </div>
    </div>
  );
}

// ======================================================================
// 등록내역 리스트
// ======================================================================
function MobileOrderList({
  groupedByDate,
  statusTab,
  setStatusTab,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  quickRange,
  setTodayRange,
  setTomorrowRange,
  onSelect,
  setOpenMemo,
  vehicleFilter,
  setVehicleFilter,
  assignFilter,
  setAssignFilter,
  searchType,
  setSearchType,
  searchText,
  setSearchText,
  onlyToday,
  setOnlyToday,
  onDeleteSelected,
  onDeleteOrder,
  onCopyOrder,
  onCopyDriver,
  multiSelectMode,
  setMultiSelectMode,
  cardVersionB,
  drivers,
}) {
  const [attachViewOrder, setAttachViewOrder] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [uploadLinkModal, setUploadLinkModal] = useState(false);
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState(null);
  const [copyModalOrder, setCopyModalOrder] = useState(null);
  const [longPressOrder, setLongPressOrder] = useState(null);
  const [quickEditOrder, setQuickEditOrder] = useState(null);
  const longPressTimerRef = useRef(null);
  const longPressStartPos = useRef({ x: 0, y: 0 });

  // 현재 보이는 모든 오더 flat 배열
  const allVisibleOrders = useMemo(() => {
    const result = [];
    groupedByDate.forEach(list => list.forEach(o => result.push(o)));
    return result;
  }, [groupedByDate]);

  const selectedOrders = useMemo(
    () => allVisibleOrders.filter(o => selectedIds.has(o.id || o._id)),
    [allVisibleOrders, selectedIds]
  );

  const toggleSelect = (order) => {
    const id = order.id || order._id;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === allVisibleOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisibleOrders.map(o => o.id || o._id)));
    }
  };

  const exitMultiSelect = () => {
    setMultiSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleUploadLink = () => {
    setUploadLinkModal(true);
  };

  const handleDeleteSelected = async () => {
    if (selectedOrders.length === 0) return;
    await onDeleteSelected?.(selectedOrders);
    exitMultiSelect();
  };
  // 🔥 탭: 전체 / 배차중 / 배차완료 (배차전/배차취소 없음)
  const tabs = ["전체", "배차중", "배차완료"];

  const dates = Array.from(groupedByDate.keys()).sort((a, b) =>
  b.localeCompare(a)
);
  const statusCount = useMemo(() => {
  let ing = 0;
  let done = 0;

  groupedByDate.forEach(list => {
    list.forEach(o => {
      const status = o.차량번호 ? "배차완료" : "배차중";

      if (status === "배차완료") done++;
      else ing++;
    });
  });

  return { ing, done };
}, [groupedByDate]);
// 🔥 KPI 요약 (여기에 추가)
const summary = useMemo(() => {
  let totalClaim = 0;
  let totalDriver = 0;
  let totalFee = 0;

  groupedByDate.forEach(list => {
    list.forEach(o => {
      const claim = Number(o.청구운임 || 0);
      const driver = Number(o.기사운임 || 0);

      totalClaim += claim;
      totalDriver += driver;
      totalFee += (claim - driver);
    });
  });

  return {
    totalClaim,
    totalDriver,
    totalFee
  };
}, [groupedByDate]);
  return (
    <>
    <div>
      {/* 상태 탭 */}
      <div className={`flex border-b ${cardVersionB ? "bg-white" : "bg-white"}`}>
        {tabs.map((t) => {
          let count = null;
          if (statusTab === "전체") {
            if (t === "전체") count = allVisibleOrders.length;
            else if (t === "배차중") count = statusCount.ing;
            else if (t === "배차완료") count = statusCount.done;
          } else if (t === statusTab) {
            count = allVisibleOrders.length;
          }
          return (
            <button
              key={t}
              onClick={() => setStatusTab(t)}
              className={`flex-1 py-2.5 text-[13px] font-semibold border-b-2 transition-colors flex items-center justify-center gap-1 ${statusTab === t
                  ? cardVersionB
                    ? "border-[#1B2B4B] text-[#1B2B4B]"
                    : "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-400"
                }`}
            >
              {t}
              {count !== null && (
                <span className={`text-[10px] font-bold ${
                  statusTab === t ? "opacity-60" : "opacity-40"
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 날짜/퀵범위/필터 */}
      <div className={`border-b px-4 pt-3 pb-3 space-y-2 overflow-hidden ${cardVersionB ? "bg-white" : "bg-white"}`}>
        {/* KPI 요약 */}
{cardVersionB ? (
  <div className="flex border border-gray-200 rounded-xl overflow-hidden mt-2">
    {[
      { label: "청구", value: summary.totalClaim },
      { label: "기사", value: summary.totalDriver },
      { label: "수수료", value: summary.totalFee },
    ].map(({ label, value }, i) => (
      <div key={label} className={`flex-1 py-2.5 text-center ${i < 2 ? "border-r border-gray-200" : ""}`}>
        <div className="text-[10px] text-gray-400 mb-0.5">{label}</div>
        <div className="text-[13px] font-extrabold text-[#1B2B4B] whitespace-nowrap">{fmtM(value)}</div>
      </div>
    ))}
  </div>
) : (
  <div className="grid grid-cols-3 gap-2 mt-2">
    <div className="bg-blue-50 rounded-xl p-2 text-center">
      <div className="text-[11px] text-gray-500">청구</div>
      <div className="text-[12px] font-bold text-blue-700 whitespace-nowrap">{fmtM(summary.totalClaim)}</div>
    </div>
    <div className="bg-gray-100 rounded-xl p-2 text-center">
      <div className="text-[11px] text-gray-500">기사</div>
      <div className="text-[12px] font-bold text-gray-700 whitespace-nowrap">{fmtM(summary.totalDriver)}</div>
    </div>
    <div className="bg-green-50 rounded-xl p-2 text-center">
      <div className="text-[11px] text-gray-500">수수료</div>
      <div className="text-[12px] font-bold text-green-700 whitespace-nowrap">{fmtM(summary.totalFee)}</div>
    </div>
  </div>
)}
        <div className="flex items-center justify-between">
  {/* 조회 기간 텍스트 */}
  <div className="text-xs font-semibold text-gray-600">
    {formatRangeShort(startDate, endDate)}
  </div>

  {/* 당일 / 내일 버튼 */}
  <div className="flex gap-1">
    <button
      onClick={setTodayRange}
      className={`px-2.5 py-0.5 text-[11px] font-semibold border transition ${
        cardVersionB
          ? "rounded-lg bg-[#1B2B4B]/5 text-[#1B2B4B] border-[#1B2B4B]/20 hover:bg-[#1B2B4B]/10"
          : "rounded-full bg-blue-50 text-blue-700 border-blue-300"
      }`}
    >
      당일
    </button>
    <button
      onClick={setTomorrowRange}
      className={`px-2.5 py-0.5 text-[11px] font-semibold border transition ${
        cardVersionB
          ? "rounded-lg bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
          : "rounded-full bg-indigo-50 text-indigo-700 border-indigo-300"
      }`}
    >
      내일
    </button>
  </div>
</div>
        {/* 시작/종료 날짜 */}
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            className={`flex-1 border px-3 py-1.5 text-sm bg-gray-50 focus:outline-none focus:ring-1 ${
              cardVersionB ? "rounded-lg focus:ring-[#1B2B4B]/30 focus:border-[#1B2B4B]/40" : "rounded-full"
            }`}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span className="text-xs text-gray-400">~</span>
          <input
            type="date"
            className={`flex-1 border px-3 py-1.5 text-sm bg-gray-50 focus:outline-none focus:ring-1 ${
              cardVersionB ? "rounded-lg focus:ring-[#1B2B4B]/30 focus:border-[#1B2B4B]/40" : "rounded-full"
            }`}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        {/* 차량종류 / 배차상태 드롭다운 */}
        <div className="flex gap-2 text-sm">
          <select
            className={`flex-1 border px-3 py-1.5 bg-gray-50 ${cardVersionB ? "rounded-lg" : "rounded-full"}`}
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
          >
            <option value="">차종 전체</option>
            <option value="라보">라보</option>
            <option value="다마스">다마스</option>
            <option value="카고">카고</option>
            <option value="윙바디">윙바디</option>
            <option value="탑차">탑차</option>
            <option value="냉장탑">냉장탑</option>
            <option value="냉동탑">냉동탑</option>
            <option value="오토바이">오토바이</option>
          </select>

          <select
            className={`flex-1 border px-3 py-1.5 bg-gray-50 ${cardVersionB ? "rounded-lg" : "rounded-full"}`}
            value={assignFilter}
            onChange={(e) => setAssignFilter(e.target.value)}
          >
            <option value="">배차 전체</option>
            <option value="배차중">배차중</option>
            <option value="배차완료">배차완료</option>
          </select>
        </div>

        {/* 검색줄 */}
        <div className="flex gap-2 text-sm">
          <select
            className={`w-28 border px-3 py-1.5 bg-gray-50 ${cardVersionB ? "rounded-lg" : "rounded-full"}`}
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
          >
            <option value="거래처명">거래처명</option>
            <option value="기사명">기사명</option>
            <option value="차량번호">차량번호</option>
            <option value="상차지명">상차지명</option>
            <option value="상차지주소">상차지주소</option>
            <option value="하차지명">하차지명</option>
            <option value="하차지주소">하차지주소</option>
            <option value="메모">메모</option>
          </select>
          <input
            className={`flex-1 border px-3 py-1.5 bg-gray-50 ${cardVersionB ? "rounded-lg" : "rounded-full"}`}
            placeholder={
              searchType === "상차지주소" ? "상차지 주소 검색"
              : searchType === "하차지주소" ? "하차지 주소 검색"
              : "검색어 입력"
            }
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </div>

      {/* ── 조회 건수 + 선택 버튼 바 ── */}
      <div className={`flex items-center justify-between px-4 py-2 border-b ${cardVersionB ? "bg-gray-50 border-gray-100" : "bg-white border-gray-100"}`}>
        <span className={`text-[12px] ${cardVersionB ? "text-gray-500 font-medium" : "text-gray-500"}`}>
          총 <span className={cardVersionB ? "font-bold text-[#1B2B4B]" : ""}>{allVisibleOrders.length}</span>건
          {multiSelectMode && selectedIds.size > 0 && (
            <span className="ml-1.5 font-bold text-[#1B2B4B]">· {selectedIds.size}개 선택</span>
          )}
        </span>
        <button
          onClick={() => multiSelectMode ? exitMultiSelect() : setMultiSelectMode(true)}
          className={`text-[12px] font-semibold border transition-colors ${
            multiSelectMode
              ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
              : cardVersionB
                ? "bg-white text-[#1B2B4B] border-[#1B2B4B]/30 hover:bg-[#1B2B4B]/5"
                : "bg-white text-gray-600 border-gray-300 hover:border-[#1B2B4B] hover:text-[#1B2B4B]"
          } ${cardVersionB ? "px-3 py-1 rounded-lg" : "px-3 py-1 rounded-full"}`}
        >
          {multiSelectMode ? "선택 취소" : "다중선택"}
        </button>
      </div>

      {/* 카드 목록 */}
      <div className={`px-3 py-3 space-y-4 ${cardVersionB ? "bg-[#F0F3F8]" : ""}`}>
        {dates.length === 0 && (
          <div className="py-10 text-center text-gray-400 text-sm">
            조회된 배차내역이 없습니다.
          </div>
        )}

        {dates.map((dateKey) => {
          const list = groupedByDate.get(dateKey) || [];
          return (
            <div key={dateKey}>
            <div className={`flex items-center justify-between mb-2 px-1 ${cardVersionB ? "py-0.5" : ""}`}>

  {/* 날짜 */}
  <div className={`font-bold ${cardVersionB ? "text-[13px] text-[#1B2B4B] tracking-tight" : "text-sm text-gray-700"}`}>
    {formatDateHeader(dateKey)}
  </div>

  <div className="flex gap-1">
    {statusTab === "전체" && (
      <>
        {cardVersionB ? (
          <>
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#1B2B4B]/5 text-[#1B2B4B] font-semibold border border-[#1B2B4B]/10">
              배차중 {statusCount.ing}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 font-semibold">
              완료 {statusCount.done}
            </span>
          </>
        ) : (
          <>
            <span className="text-[11px] px-2 py-1 rounded-full bg-blue-50 text-blue-600 font-semibold">
              배차중 {statusCount.ing}
            </span>
            <span className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-semibold">
              완료 {statusCount.done}
            </span>
          </>
        )}
      </>
    )}

    {statusTab === "배차중" && (
      <span className={`text-[11px] font-semibold ${cardVersionB ? "px-2 py-0.5 rounded-md bg-[#1B2B4B]/5 text-[#1B2B4B] border border-[#1B2B4B]/10" : "px-2 py-1 rounded-full bg-blue-50 text-blue-600"}`}>
        배차중 {statusCount.ing}
      </span>
    )}

    {statusTab === "배차완료" && (
      <span className={`text-[11px] font-semibold ${cardVersionB ? "px-2 py-0.5 rounded-md bg-gray-100 text-gray-500" : "px-2 py-1 rounded-full bg-gray-100 text-gray-600"}`}>
        완료 {statusCount.done}
      </span>
    )}
  </div>

</div>
              <div className="space-y-3">
                {list.map((o) => {
                  const oid = o.id || o._id;
                  const isChecked = selectedIds.has(oid);
                  return (
                    <div key={oid} className={`relative rounded-xl ${multiSelectMode ? "pl-10 transition-all" : ""}`}
                      onTouchStart={multiSelectMode ? undefined : (e) => {
                        longPressStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                        longPressTimerRef.current = setTimeout(() => {
                          setLongPressOrder(o);
                          longPressTimerRef.current = null;
                        }, 500);
                      }}
                      onTouchMove={(e) => {
                        if (!longPressTimerRef.current) return;
                        const dx = Math.abs(e.touches[0].clientX - longPressStartPos.current.x);
                        const dy = Math.abs(e.touches[0].clientY - longPressStartPos.current.y);
                        if (dx > 8 || dy > 8) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
                      }}
                      onTouchEnd={() => { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }}
                      onTouchCancel={() => { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }}
                    >
                      {multiSelectMode && (
                        <button
                          className={`absolute left-2 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                            isChecked
                              ? "bg-[#1B2B4B] border-[#1B2B4B]"
                              : "bg-white border-gray-300"
                          }`}
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); toggleSelect(o); }}
                        >
                          {isChecked && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                      )}
                      <SwipeableRow
                        disabled={multiSelectMode}
                        onDelete={() => setDeleteConfirmOrder(o)}
                        onCopyOrder={() => onCopyOrder?.(o)}
                        onCopyDriver={() => setCopyModalOrder(o)}
                      >
                        <MobileOrderCard
                          order={o}
                          showUndeliveredOnly={false}
                          onSelect={multiSelectMode ? () => toggleSelect(o) : () => onSelect(o)}
                          onOpenMemo={multiSelectMode ? () => {} : setOpenMemo}
                          onOpenAttach={setAttachViewOrder}
                          selected={isChecked}
                          multiSelectMode={multiSelectMode}
                          cardVersionB={cardVersionB}
                        />
                      </SwipeableRow>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {attachViewOrder && (
      <CardAttachViewer order={attachViewOrder} onClose={() => setAttachViewOrder(null)} />
    )}

    {/* ── 삭제 확인 모달 ── */}
    {deleteConfirmOrder && (
      <div className="fixed inset-0 z-[9999] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
        <div
          className={`w-full max-w-md bg-white rounded-t-2xl px-5 pt-5 pb-8 shadow-2xl ${cardVersionB ? "" : ""}`}
          onClick={e => e.stopPropagation()}
        >
          <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-4" />
          <div className="flex items-center gap-2 mb-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
            <span className={`font-bold text-[15px] ${cardVersionB ? "text-[#1B2B4B]" : "text-gray-900"}`}>오더 삭제</span>
          </div>
          <div className="text-[13px] text-gray-500 mb-1 ml-6">
            {deleteConfirmOrder.거래처명 && <span className="font-semibold text-gray-700">{deleteConfirmOrder.거래처명} · </span>}
            {deleteConfirmOrder.상차지명} → {deleteConfirmOrder.하차지명}
          </div>
          <div className="text-[12px] text-gray-400 mb-5 ml-6">{deleteConfirmOrder.상차일 || ""}</div>
          <p className="text-[13px] text-gray-500 mb-5 text-center">삭제하면 복구할 수 없습니다. 진행하시겠습니까?</p>
          <div className="flex gap-3">
            <button
              className={`flex-1 py-3 rounded-xl text-[14px] font-semibold ${
                cardVersionB
                  ? "bg-gray-100 text-gray-600 border border-gray-200"
                  : "border border-gray-300 text-gray-600 bg-white"
              }`}
              onClick={() => setDeleteConfirmOrder(null)}
            >
              취소
            </button>
            <button
              className="flex-1 py-3 rounded-xl text-[14px] font-bold bg-red-500 text-white"
              onClick={async () => {
                const o = deleteConfirmOrder;
                setDeleteConfirmOrder(null);
                await onDeleteOrder?.(o);
              }}
            >
              삭제
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── 복사 형식 선택 모달 ── */}
    {copyModalOrder && (
      <CopySelectModal
        order={copyModalOrder}
        onClose={() => setCopyModalOrder(null)}
        onAfterFullCopy={() => setCopyModalOrder(null)}
        onCopySuccess={() => showSuccess("기사 복사 완료")}
        cardVersionB={cardVersionB}
      />
    )}

    {/* ── 길게 누르기 컨텍스트 메뉴 ── */}
    {longPressOrder && (
      <LongPressContextMenu
        order={longPressOrder}
        cardVersionB={cardVersionB}
        onClose={() => setLongPressOrder(null)}
        onEdit={() => { setQuickEditOrder(longPressOrder); setLongPressOrder(null); }}
        onCopyDriver={() => { setCopyModalOrder(longPressOrder); setLongPressOrder(null); }}
        onCopyOrder={() => { onCopyOrder?.(longPressOrder); setLongPressOrder(null); }}
        onDelete={() => { setDeleteConfirmOrder(longPressOrder); setLongPressOrder(null); }}
      />
    )}

    {/* ── 일부 수정 모달 ── */}
    {quickEditOrder && (
      <QuickEditModal
        order={quickEditOrder}
        drivers={drivers || []}
        cardVersionB={cardVersionB}
        onClose={() => setQuickEditOrder(null)}
        onSuccess={() => {}}
      />
    )}

    {/* ── 다중선택 하단 액션바 ── */}
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ${
        multiSelectMode ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="bg-white border-t border-gray-200 shadow-[0_-4px_24px_rgba(0,0,0,0.10)] px-4 pt-3 pb-safe-bottom">
        {/* 전체선택 + 건수 */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-[13px] font-semibold text-[#1B2B4B]"
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              selectedIds.size > 0 && selectedIds.size === allVisibleOrders.length
                ? "bg-[#1B2B4B] border-[#1B2B4B]"
                : selectedIds.size > 0
                  ? "bg-[#1B2B4B]/20 border-[#1B2B4B]"
                  : "border-gray-300"
            }`}>
              {selectedIds.size > 0 && (
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            전체선택
          </button>
          <span className="text-[13px] text-gray-500">
            {selectedIds.size === 0 ? "오더를 선택하세요" : <span className="font-bold text-[#1B2B4B]">{selectedIds.size}개 선택됨</span>}
          </span>
        </div>
        {/* 액션 버튼 */}
        <div className="flex gap-2 pb-1">
          <button
            onClick={handleUploadLink}
            disabled={selectedIds.size === 0}
            className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-[13px] font-bold disabled:opacity-40 active:scale-[0.97] transition"
          >
            업로드링크 발송
          </button>
          <button
            onClick={handleDeleteSelected}
            disabled={selectedIds.size === 0}
            className="flex-1 py-3 rounded-xl bg-rose-600 text-white text-[13px] font-bold disabled:opacity-40 active:scale-[0.97] transition"
          >
            선택삭제
          </button>
        </div>
      </div>
    </div>

    {/* ── 업로드링크 발송 모달 ── */}
    {uploadLinkModal && (
      <UploadLinkModal
        orders={selectedOrders}
        onClose={() => setUploadLinkModal(false)}
      />
    )}

    </>
  );
}

// 카드에서 쓰는 날짜 상태: 당상/당착/내상/내착/그 외 MM/DD
function getDayStatusForCard(dateStr, type) {
  if (!dateStr) return "";

  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return "";

  // ✅ 오늘 기준은 KST
  const now = new Date();
  const todayKSTDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  const n0 = new Date(
    todayKSTDate.getFullYear(),
    todayKSTDate.getMonth(),
    todayKSTDate.getDate()
  );

  const t0 = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  );

  const diff =
    (t0.getTime() - n0.getTime()) / (1000 * 60 * 60 * 24);

  if (diff === 0) {
    return type === "pickup" ? "당상" : "당착";
  }

  if (diff === 1) {
    return type === "pickup" ? "내상" : "내착";
  }

  const m = String(target.getMonth() + 1).padStart(2, "0");
  const d = String(target.getDate()).padStart(2, "0");
  return `${m}/${d}`;
}

// 당상/당착/내상/내착 뱃지 색상
function dayBadgeClass(label) {
  if (label === "당상" || label === "당착") {
    // 🔵 오늘
    return "bg-blue-50 text-blue-600 border-blue-200";
  }
  if (label === "내상" || label === "내착") {
    // 🔴 내일
    return "bg-red-50 text-red-600 border-red-200";
  }
  // 그 외 날짜 (예: 11/30)
  return "bg-gray-50 text-gray-500 border-gray-200";
}

// ======================================================================
// 카드에서 바로 열리는 첨부파일 뷰어 (하단 시트)
// ======================================================================
function CardAttachViewer({ order, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const attachStorageKey = `saved_attach_${order._id || order.id}`;
  const [saveStates, setSaveStates] = useState(() => {
    try { return JSON.parse(localStorage.getItem(attachStorageKey) || "{}"); } catch { return {}; }
  });
  const [confirmItem, setConfirmItem] = useState(null);

  useEffect(() => {
    const col = order.__col || order._col || "dispatch";
    const docId = order._id || order.id;
    setLoading(true);
    const unsub = onSnapshot(collection(db, col, docId, "attachments"), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [order]);

  const doSave = (item) => {
    try {
      const a = document.createElement("a");
      a.href = item.base64 || item.url;
      a.download = item.name || "attachment.jpg";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setSaveStates(prev => {
        const next = { ...prev, [item.id]: "success" };
        try { localStorage.setItem(attachStorageKey, JSON.stringify(next)); } catch {}
        return next;
      });
    } catch {
      setSaveStates(prev => ({ ...prev, [item.id]: "fail" }));
    }
  };
  const handleSave = (item) => {
    if (saveStates[item.id] === "success") { setConfirmItem(item); return; }
    doSave(item);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#1B2B4B] flex items-center justify-center shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div>
              <div className="font-bold text-[15px] text-[#1B2B4B]">
                첨부파일
                {!loading && <span className="text-[12px] font-normal text-gray-400 ml-1">{items.length}장</span>}
              </div>
              <div className="text-[11px] text-gray-400 truncate max-w-[220px]">
                {order.상차지명} → {order.하차지명}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-lg font-bold">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-[#1B2B4B] rounded-full animate-spin" />
              <span className="text-sm">불러오는 중...</span>
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <div className="text-sm text-gray-400 font-medium">업로드된 파일이 없습니다</div>
              <div className="text-xs text-gray-300">기사님께 인수증 업로드를 요청하세요</div>
            </div>
          )}
          {!loading && items.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {items.map(item => (
                <div key={item.id} className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                  <div className="aspect-[4/3] bg-gray-50 cursor-pointer" onClick={() => setSelected(item)}>
                    <img
                      src={item.base64 || item.url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      onError={e => { e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-gray-300 text-xs">미리보기 없음</div>'; }}
                    />
                  </div>
                  <div className="px-2.5 py-2 bg-white">
                    <div className="text-[10px] text-gray-400 truncate mb-1.5">{item.name || "파일"}{item.sizeKB ? ` · ${item.sizeKB}KB` : ""}</div>
                    <button
                      onClick={() => handleSave(item)}
                      className={`w-full py-1.5 rounded-lg text-white text-[11px] font-bold transition-colors ${
                        saveStates[item.id] === "success" ? "bg-emerald-500" :
                        saveStates[item.id] === "fail" ? "bg-red-500" : "bg-[#1B2B4B]"
                      }`}
                    >
                      {saveStates[item.id] === "success" ? "저장완료" :
                       saveStates[item.id] === "fail" ? "저장실패" : "저장"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {selected && (
        <div className="absolute inset-0 bg-black/95 z-10 flex flex-col items-center justify-center" onClick={() => setSelected(null)}>
          <img src={selected.base64 || selected.url} alt="full" className="max-w-full max-h-[75vh] object-contain" onClick={e => e.stopPropagation()} />
          <button className="absolute top-4 left-4 w-10 h-10 bg-white/15 rounded-full text-white flex items-center justify-center text-sm font-bold" onClick={() => setSelected(null)}>닫기</button>
          <button
            className={`absolute bottom-8 right-6 px-5 py-2.5 text-white rounded-xl text-sm font-bold transition-colors ${
              saveStates[selected.id] === "success" ? "bg-emerald-500" :
              saveStates[selected.id] === "fail" ? "bg-red-500" : "bg-[#1B2B4B]"
            }`}
            onClick={e => { e.stopPropagation(); handleSave(selected); }}
          >
            {saveStates[selected.id] === "success" ? "저장완료" :
             saveStates[selected.id] === "fail" ? "저장실패" : "저장"}
          </button>
        </div>
      )}
      {confirmItem && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50" onClick={() => setConfirmItem(null)}>
          <div className="bg-white rounded-2xl mx-6 p-5 w-full max-w-xs shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-[15px] font-bold text-[#1B2B4B] mb-2">이미 저장된 파일</div>
            <div className="text-[13px] text-gray-500 mb-4">이미 저장하신 파일입니다.<br />다시 저장하시겠습니까?</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmItem(null)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-[13px]">취소</button>
              <button onClick={() => { doSave(confirmItem); setConfirmItem(null); }} className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white font-bold text-[13px]">다시 저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 길게 누르기 컨텍스트 메뉴 (bottom sheet)
// ────────────────────────────────────────────────────────────────
function LongPressContextMenu({ order, cardVersionB, onClose, onEdit, onCopyDriver, onCopyOrder, onDelete }) {
  const menuItems = [
    {
      label: "일부 수정",
      desc: "운임·기사·배차방식 빠른 수정",
      action: onEdit,
      svg: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    },
    {
      label: "기사 복사",
      desc: "기사 전달용·상세 복사",
      action: onCopyDriver,
      svg: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M19 8v6M22 11h-6"/></svg>,
    },
    {
      label: "오더 복사",
      desc: "동일 오더를 새로 등록",
      action: onCopyOrder,
      svg: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
    },
    {
      label: "삭제",
      desc: "이 오더를 삭제합니다",
      action: onDelete,
      danger: true,
      svg: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
    },
  ];

  const bStyle = cardVersionB;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end" style={{ background: "rgba(0,0,0,0.48)" }} onClick={onClose}>
      <div
        className={`w-full pb-8 pt-3 shadow-2xl ${bStyle ? "bg-white rounded-t-2xl border-t-[3px] border-[#1B2B4B]" : "bg-white rounded-t-2xl"}`}
        style={{ maxHeight: "70vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div className={`w-10 h-1 rounded-full mx-auto mb-3 ${bStyle ? "bg-[#1B2B4B]/15" : "bg-gray-200"}`} />
        <div className={`px-4 pb-2 text-[12px] ${bStyle ? "font-bold text-[#1B2B4B]/50 tracking-wide uppercase" : "text-gray-400"}`}>
          {order.상차지명 || "-"} → {order.하차지명 || "-"}
        </div>
        {menuItems.map((item, i) => (
          <button
            key={i}
            className={`w-full flex items-center gap-3 px-4 py-3.5 text-left border-t ${
              bStyle
                ? `border-gray-100 ${item.danger ? "text-red-500" : "text-[#1B2B4B]"} active:bg-[#1B2B4B]/5`
                : `border-gray-100 ${item.danger ? "text-red-500" : "text-gray-800"} active:bg-gray-50`
            }`}
            onClick={() => { item.action?.(); onClose(); }}
          >
            <span className={item.danger ? "text-red-400" : (bStyle ? "text-[#1B2B4B]/70" : "text-gray-500")}>{item.svg}</span>
            <div>
              <div className={`text-[14px] font-semibold`}>{item.label}</div>
              <div className="text-[11px] text-gray-400 font-normal">{item.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 일부 수정 모달
// ────────────────────────────────────────────────────────────────
function QuickEditModal({ order, drivers, cardVersionB, onClose, onSuccess }) {
  const smartRef = useRef(null);
  const [smartMatched, setSmartMatched] = useState([]);
  const [carNo, setCarNo] = useState(order.차량번호 || "");
  const [driverName, setDriverName] = useState(order.기사명 || order.이름 || "");
  const [driverPhone, setDriverPhone] = useState(order.전화번호 || "");
  const [claim, setClaim] = useState(String(order.청구운임 || ""));
  const [fee, setFee] = useState(String(order.기사운임 || ""));
  const [payType, setPayType] = useState(order.지급방식 || "");
  const [dispType, setDispType] = useState(order.배차방식 || "");
  const [saving, setSaving] = useState(false);

  const nd = (s = "") => String(s).replace(/[-.\s]/g, "").toLowerCase();

  const handleSmartSearch = (val) => {
    if (!val.trim()) { setSmartMatched([]); return; }
    const { plate, phone, name } = parseDriverText(val);
    if (plate) {
      const results = (drivers || []).filter(d => nd(d.차량번호).includes(nd(plate)));
      setSmartMatched(results.slice(0, 6));
      if (results.length === 0) { setCarNo(plate); setDriverName(name || ""); setDriverPhone(phone || ""); }
      else { setCarNo(results[0].차량번호 || ""); setDriverName(results[0].이름 || ""); setDriverPhone(results[0].전화번호 || ""); }
      return;
    }
    if (phone) {
      const results = (drivers || []).filter(d => nd(d.전화번호) === nd(phone));
      setSmartMatched(results.slice(0, 6));
      if (results.length > 0) { setCarNo(results[0].차량번호 || ""); setDriverName(results[0].이름 || ""); setDriverPhone(results[0].전화번호 || ""); }
      return;
    }
    if (name && name.length >= 2) {
      const results = (drivers || []).filter(d => d.이름 && d.이름.includes(name));
      setSmartMatched(results.slice(0, 6));
    }
  };

  const selectDriver = (d) => {
    setCarNo(d.차량번호 || "");
    setDriverName(d.이름 || "");
    setDriverPhone(d.전화번호 || "");
    setSmartMatched([]);
    if (smartRef.current) smartRef.current.value = "";
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const col = order.__col || "orders";
      const id = order._id || order.id;
      const patch = {
        청구운임: Number(String(claim).replace(/[^\d]/g, "")) || 0,
        기사운임: Number(String(fee).replace(/[^\d]/g, "")) || 0,
        지급방식: payType,
        배차방식: dispType,
        updatedAt: serverTimestamp(),
        _lastModified: Date.now(),
      };
      if (carNo) {
        patch.차량번호 = carNo;
        patch.기사명 = driverName;
        patch.이름 = driverName;
        patch.전화번호 = driverPhone;
        patch.전화 = driverPhone;
        if (!order.차량번호) {
          patch.배차상태 = "배차완료";
          patch.상태 = "배차완료";
          patch.배차완료일시 = serverTimestamp();
        }
      }
      await updateDoc(doc(db, col, id), patch);
      onSuccess?.();
      onClose();
    } catch (e) {
      alert("저장 실패: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const bStyle = cardVersionB;
  const inputCls = `w-full px-3 py-2 text-[13px] border rounded-lg focus:outline-none focus:border-[#1B2B4B] bg-white ${bStyle ? "border-gray-300" : "border-gray-200"}`;
  const labelCls = `block text-[11px] font-semibold mb-1 ${bStyle ? "text-[#1B2B4B]/70" : "text-gray-500"}`;

  return (
    <div className="fixed inset-0 z-[10000] flex items-end" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div
        className={`w-full px-4 pb-8 pt-4 shadow-2xl ${bStyle ? "bg-white rounded-t-2xl border-t-[3px] border-[#1B2B4B]" : "bg-white rounded-t-2xl"}`}
        style={{ maxHeight: "92vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div className={`w-10 h-1 rounded-full mx-auto mb-3 ${bStyle ? "bg-[#1B2B4B]/15" : "bg-gray-200"}`} />
        <div className="flex items-center justify-between mb-4">
          <span className={`text-[15px] font-bold ${bStyle ? "text-[#1B2B4B]" : "text-gray-900"}`}>일부 수정</span>
          <button onClick={onClose} className="p-1 text-gray-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* 운임 */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls}>청구운임</label>
            <input type="number" className={inputCls} placeholder="0" value={claim} onChange={e => setClaim(e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <label className={labelCls}>기사운임</label>
            <input type="number" className={inputCls} placeholder="0" value={fee} onChange={e => setFee(e.target.value)} inputMode="numeric" />
          </div>
        </div>

        {/* 지급/배차방식 */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls}>지급방식</label>
            <select className={inputCls} value={payType} onChange={e => setPayType(e.target.value)}>
              <option value="">선택</option>
              {["계산서","착불","선불","손실","개인","취소"].map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>배차방식</label>
            <select className={inputCls} value={dispType} onChange={e => setDispType(e.target.value)}>
              <option value="">선택</option>
              {["24시","직접배차","인성","고정기사"].map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
        </div>

        {/* 기사 스마트검색 */}
        <div className="mb-3">
          <label className={labelCls}>기사 스마트검색</label>
          <div className="relative">
            <SmartTextarea textareaRef={smartRef} onSearch={handleSmartSearch} />
            {smartMatched.length > 0 && (
              <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden">
                {smartMatched.map((d, i) => (
                  <button key={i} className="w-full px-3 py-2.5 text-left border-b border-gray-50 last:border-0 active:bg-blue-50 transition"
                    onClick={() => selectDriver(d)}>
                    <span className="font-bold text-[13px] text-gray-800">{d.차량번호}</span>
                    <span className="text-gray-400 text-[12px] ml-2">{d.이름}</span>
                    <span className="text-gray-300 text-[11px] ml-1">{d.전화번호}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 기사 정보 */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div>
            <label className={labelCls}>차량번호</label>
            <input className={inputCls} value={carNo} onChange={e => setCarNo(e.target.value)} placeholder="00가0000" />
          </div>
          <div>
            <label className={labelCls}>기사명</label>
            <input className={inputCls} value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="이름" />
          </div>
          <div>
            <label className={labelCls}>연락처</label>
            <input className={inputCls} value={driverPhone} onChange={e => setDriverPhone(e.target.value)} placeholder="010-0000-0000" inputMode="tel" />
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full py-3 rounded-xl text-[14px] font-bold text-white bg-[#1B2B4B] hover:bg-[#243a60] transition disabled:opacity-50">
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

const MobileOrderCard = React.memo(function MobileOrderCard({
  order,
  onSelect,
  onOpenMemo,
  onOpenAttach,
  showUndeliveredOnly,
  onConfirmDeliver,
  flash = false,
  selected = false,
  multiSelectMode = false,
  cardVersionB = false,
}) {
  const claim = getClaim(order);
  const fee = order.기사운임 ?? 0;
  const state = getStatus(order);
const isToday =
  String(order.상차일 || "").slice(0, 10) === todayKST();
      useEffect(() => {
  if (!isToday) return;

  const key = `vibrated_${order.id}`;
  if (sessionStorage.getItem(key)) return;

  navigator.vibrate?.([60]);
  sessionStorage.setItem(key, "1");
}, [isToday, order.id]);

  const stateBadgeClass =
    state === "배차완료"
      ? "bg-emerald-50 text-emerald-700 border-emerald-300"
      : "bg-gray-100 text-gray-600 border-gray-300";

  const pickupName = order.상차지명 || "-";
  const dropName = order.하차지명 || "-";

  const pickupAddrShort = shortAddr(order.상차지주소 || "");
  const dropAddrShort = shortAddr(order.하차지주소 || "");

const pickupTime = order.상차시간 || "시간 없음";
const dropTime = order.하차시간 || "시간 없음";


  const pickupStatus = getDayStatusForCard(order.상차일, "pickup");
  const dropStatus = getDayStatusForCard(order.하차일, "drop");

  const ton = order.톤수 || order.차량톤수 || "";
  const carType = order.차량종류 || order.차종 || "";
  const cargo = order.화물내용 || "";
  const bottomText = [ton && `${ton}`, carType, cargo]
    .filter(Boolean)
    .join(" · ");

  const isCold =
    String(order.차량종류 || order.차종 || "").includes("냉장") ||
    String(order.차량종류 || order.차종 || "").includes("냉동");

  if (cardVersionB) {
    // ── B VERSION: Minimal, clean design ──
    return (
      <div
        className={
          "relative bg-white rounded-xl border transition-colors overflow-hidden " +
          (selected
            ? "border-[#1B2B4B] shadow-[0_0_0_2px_rgba(27,43,75,0.12)]"
            : flash
              ? "border-blue-300 shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
              : isToday
                ? "border-l-4 border-l-[#1B2B4B] border-t-gray-200 border-r-gray-200 border-b-gray-200"
                : "border-gray-200")
        }
        onClick={onSelect}
      >
        {/* 상단 정보 바 */}
        <div className={`px-3 py-1.5 flex items-center justify-between ${state === "배차완료" ? "bg-[#1B2B4B]/5" : "bg-gray-50/80"}`}>
          <div className="flex items-center gap-1.5">
            {state === "배차완료" ? (
              <span className="text-[0.72em] font-bold text-[#1B2B4B] border border-[#1B2B4B]/40 px-1.5 py-0.5 rounded">
                배차완료
              </span>
            ) : (
              <span className="badge-dispatching text-[0.72em] font-semibold text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded">배차중</span>
            )}
            {order.거래처명 && (
              <span className="text-[0.72em] font-semibold text-gray-500 truncate max-w-[90px]">{order.거래처명}</span>
            )}
            {isCold && (
              <span className="text-[0.68em] text-slate-500 font-semibold bg-slate-100 px-1.5 py-0.5 rounded">
                {String(order.차량종류 || order.차종 || "").includes("냉동") ? "냉동" : "냉장"}
              </span>
            )}
            {isUrgentOrder(order) && (
              <span className="text-[0.68em] font-bold text-red-500">긴급</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              style={{ touchAction: "manipulation" }}
              onClick={e => { e.stopPropagation(); onOpenAttach?.(order); }}
              className={`flex items-center gap-0.5 text-[0.68em] font-semibold ${
                (order.attachCount > 0) ? "text-gray-500" : "text-gray-300"
              }`}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              {(order.attachCount > 0) ? order.attachCount : "-"}
            </button>
            {(order.메모 || order.적요) && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenMemo(order); }}
                className="text-[0.68em] text-gray-400 font-semibold"
              >
                메모
              </button>
            )}
            <span className="text-[0.68em] text-gray-400">{String(order.상차일 || "").slice(5)}</span>
          </div>
        </div>

        {/* 본문 */}
        <div className="px-3 py-2.5">
          {/* 상/하차 */}
          <div className="flex items-stretch gap-2">
            <div className="flex flex-col items-center shrink-0 py-0.5">
              <div className="w-2 h-2 rounded-full border-2 border-[#1B2B4B] bg-white mt-1.5" />
              <div className="w-px flex-1 min-h-[20px] bg-gray-200 my-0.5" />
              <div className="w-2 h-2 rounded-full bg-gray-300 mb-1.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex-1 min-w-0 truncate">
                  <span className="text-[1em] font-bold text-gray-900">{pickupName}</span>
                  {pickupAddrShort && (
                    <span className="text-[0.75em] text-gray-400 ml-1">({pickupAddrShort})</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-1">
                  <span className="text-[0.75em] text-gray-500">{pickupTime}</span>
                  {pickupStatus && <span className={`text-[0.68em] px-1 py-0.5 rounded border ${dayBadgeClass(pickupStatus)}`}>{pickupStatus}</span>}
                </div>
              </div>
              {(() => {
                const pStops = validStops(order.경유상차목록 || order.경유지_상차);
                const dStops = validStops(order.경유하차목록 || order.경유지_하차);
                const all = [...pStops, ...dStops];
                if (!all.length) return null;
                return (
                  <div className="text-[0.68em] text-gray-400 mb-1.5 pl-0.5">
                    경유: {all.map(s => s.업체명 || "-").join(" → ")}
                  </div>
                );
              })()}
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0 truncate">
                  <span className="text-[1em] font-bold text-gray-900">{dropName}</span>
                  {dropAddrShort && (
                    <span className="text-[0.75em] text-gray-400 ml-1">({dropAddrShort})</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-1">
                  <span className="text-[0.75em] text-gray-500">{dropTime}</span>
                  {dropStatus && <span className={`text-[0.68em] px-1 py-0.5 rounded border ${dayBadgeClass(dropStatus)}`}>{dropStatus}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* 하단 정보 */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
            <span className="text-[0.75em] text-gray-500 truncate">
              {[ton && `${ton}`, carType, cargo].filter(Boolean).join(" · ") || "-"}
            </span>
            <span className="text-[0.85em] font-bold text-gray-700 whitespace-nowrap shrink-0 ml-2">
              {fmtMoney(claim)}
            </span>
          </div>

          {/* 배차완료 시 기사 연락 */}
          {state === "배차완료" && (order.이름 || order.차량번호) && (
            <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-dashed border-gray-100">
              <span className="text-[0.75em] text-gray-400 truncate flex-1">
                {[order.차량번호, order.이름].filter(Boolean).join(" · ")}
              </span>
              {order.전화번호 && (
                <a href={`tel:${order.전화번호}`} onClick={e => e.stopPropagation()} style={{ touchAction: "manipulation" }}
                  className="shrink-0 px-2.5 py-1 rounded-full bg-[#1B2B4B] text-white text-[0.68em] font-bold">
                  전화
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
   <div
  className={
    "relative bg-white rounded-2xl shadow border px-3 py-3 transition-colors " +
    (selected
      ? "border-[#1B2B4B] bg-[#1B2B4B]/[0.03] shadow-[0_0_0_2px_rgba(27,43,75,0.15)]"
      : flash
        ? "border-blue-400 order-flash-blue shadow-[0_0_0_4px_rgba(59,130,246,0.18),0_0_18px_rgba(59,130,246,0.35)]"
        : "border-gray-200")
  }
  onClick={onSelect}
>
      {/* 📝 메모 뱃지 */}
{(order.메모 || order.적요) && (
  <div
    className="absolute top-2 left-2"
    onClick={(e) => {
      e.stopPropagation();
      onOpenMemo(order);   // ✅ 기존 팝업 그대로 호출
    }}
  >
    <span
      className="inline-flex items-center gap-1
                 px-2 py-0.5 rounded-full
                 bg-[#1B2B4B]/10 text-[#1B2B4B]
                 border border-[#1B2B4B]/20
                 text-[10px] font-semibold"
    >
       메모
    </span>
  </div>
)}

      {/* ▶ 거래처명 + 상태 + 냉장/냉동 */}
<div className="flex justify-between items-center gap-1 mb-0.5">
  {order.거래처명 ? (
    <span className="text-[11px] font-semibold text-gray-600 truncate max-w-[45%]">{order.거래처명}</span>
  ) : <span />}
  <div className="flex items-center gap-1">

  {showUndeliveredOnly && (
    <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-[10px] font-bold border border-yellow-300">
      미전달
    </span>
  )}

  {!showUndeliveredOnly && isUrgentOrder(order) && (
    <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold">
      긴급
    </span>
  )}

  {!showUndeliveredOnly && isToday && (
    <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
      TODAY
    </span>
  )}

  {isCold && (
    <span className="px-2 py-0.5 rounded-full bg-cyan-600 text-white text-[10px] font-bold">
      냉장/냉동
    </span>
  )}

  <button
    style={{ touchAction: "manipulation" }}
    onClick={e => { e.stopPropagation(); onOpenAttach?.(order); }}
    className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
      (order.attachCount > 0)
        ? "bg-gray-50 border-gray-300 text-gray-600"
        : "bg-white border-dashed border-gray-200 text-gray-300"
    }`}
  >
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
    {(order.attachCount > 0) ? order.attachCount : "없음"}
  </button>

  <span className={"px-2 py-0.5 rounded-full border text-[11px] font-semibold " + stateBadgeClass}>
    {state}
  </span>
  </div>
</div>


      {/* ⚠ 상차 임박 */}
      {(() => {
        if (!order.상차일 || !order.상차시간) return null;
        const now = new Date(
  new Date().getTime() + 9 * 60 * 60 * 1000
);
       const [y, m, d] = order.상차일.split("-").map(Number);
const [hh, mm] = normalizeKoreanTime(order.상차시간)
  .split(":")
  .map(Number);

const dt = new Date(y, m - 1, d, hh, mm);
        const diffMin = (dt - now) / 60000;
        if (diffMin > 0 && diffMin <= 120) {
          return (
            <div className="text-right mb-0.5">
              <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                임박
              </span>
            </div>
          );
        }
        return null;
      })()}

      {/* ▶ 상차 */}
      <div className="flex items-center gap-2 mt-1">
        <span className="px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[11px] font-bold">
          상
        </span>
        <div className="flex-1 truncate text-[1em] font-semibold">
          {pickupName}
          {pickupAddrShort && (
            <span className="text-[12px] text-gray-500 ml-1">
              ({pickupAddrShort})
            </span>
          )}
        </div>
        <span className="text-[0.8em] text-gray-600">{pickupTime}</span>
        {pickupStatus && (
          <span
            className={
              "px-1 py-0.5 rounded-full border text-[11px] " +
              dayBadgeClass(pickupStatus)
            }
          >
            {pickupStatus}
          </span>
        )}
      </div>

      {/* 경유지 요약 */}
      {(() => {
        const pStops = validStops(order.경유상차목록 || order.경유지_상차);
        const dStops = validStops(order.경유하차목록 || order.경유지_하차);
        const all = [...pStops, ...dStops];
        if (all.length === 0) return null;
        const names = all.map(s => s.업체명 || "-").join(" → ");
        return (
          <div className="flex items-center gap-1.5 mt-0.5 pl-0.5">
            <span className="px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-600 text-[10px] font-bold shrink-0">경유</span>
            <div className="flex-1 truncate text-[0.78em] text-gray-500">{names}</div>
          </div>
        );
      })()}

      {/* ▶ 하차 */}
      <div className="flex items-center gap-2 mt-1">
        <span className="px-1.5 py-0.5 rounded-full bg-gray-500 text-white text-[11px] font-bold">
          하
        </span>
        <div className="flex-1 truncate text-[1em] font-semibold">
          {dropName}
          {dropAddrShort && (
            <span className="text-[12px] text-gray-500 ml-1">
              ({dropAddrShort})
            </span>
          )}
        </div>
        <span className="text-[0.8em] text-gray-600">{dropTime}</span>
        {dropStatus && (
          <span
            className={
              "px-1 py-0.5 rounded-full border text-[11px] " +
              dayBadgeClass(dropStatus)
            }
          >
            {dropStatus}
          </span>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-dashed border-gray-200" />

      {/* ▶ 하단 */}
      <div className="flex justify-between text-[0.8em] text-gray-700">
        <div className="truncate">{bottomText || "-"}</div>
        <div className="whitespace-nowrap">
          청구 {fmtMoney(claim)} · 기사 {fmtMoney(fee)}
        </div>
      </div>

      {/* ▶ 배차완료 → 기사 빠른 연락 */}
      {state === "배차완료" && (order.이름 || order.차량번호) && (
        <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-dashed border-gray-100">
          <span className="text-[11px] text-gray-400 truncate flex-1">
            {[order.차량번호, order.이름].filter(Boolean).join(" · ")}
          </span>
          {order.전화번호 && (
            <a
              href={`tel:${order.전화번호}`}
              onClick={e => e.stopPropagation()}
              style={{ touchAction: "manipulation" }}
              className="shrink-0 px-2.5 py-1 rounded-full bg-[#1B2B4B] text-white text-[10px] font-bold"
            >
              전화
            </a>
          )}
        </div>
      )}

      {/* ✅ 전달버튼은 여기 */}
{showUndeliveredOnly && (
  <div className="flex justify-end mt-2">
    <button
      onClick={(e) => {
        e.stopPropagation();
        onConfirmDeliver?.();
      }}
      className="text-[11px] px-2 py-1 rounded-full
                 border border-emerald-300
                 text-emerald-600
                 hover:bg-emerald-50"
    >
      업체전송
    </button>
  </div>
)}
</div>
  );
});
// ======================================================================
// 상세보기
// ======================================================================
function SectionHeader({ label }) {
  return (
    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
      {label}
    </div>
  );
}

function DetailCard({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 ${className}`}>
      {children}
    </div>
  );
}

function parseDriverText(text) {
  let name = "", phone = "", plate = "";

  const CITY_EXCLUDE = [
    "강원","서울","경기","인천","부산","대구","광주","대전","울산","세종",
    "경북","경남","전북","전남","충북","충남","제주",
    "하남","성남","수원","안양","부천","화성","평택","시흥","안산","군포",
    "의왕","오산","파주","고양","의정부","양주","김포","구리","남양주","이천",
    "여주","포천","광명","동두천","안성","용인","강남","강서","영등포",
    "마포","서초","종로","중구","동대문","성동","송파","강동","관악",
    "초장축윙","초장축","장축","윙바디","카고","탑차","냉장탑","냉동탑",
    "냉장윙","냉동윙","냉장","냉동","리프트","다마스","라보","차주정보",
    "차량정보","기사정보","차량번호",
  ];

  const hasTag = /\[(차주정보|기사정보|차량정보)\]/.test(text);

  if (hasTag) {
    const ownerBlock = text.match(/\[(차주정보|기사정보)\]\s*(.+?)(?=\[차량정보\]|$)/s);
    if (ownerBlock) {
      const block = ownerBlock[2].trim();
      const phoneM = block.match(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/);
      if (phoneM) {
        phone = phoneM[0].replace(/[-.\s]/g, "").replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
        const beforePhone = block.slice(0, block.indexOf(phoneM[0])).replace(/[/\s]+$/, "");
        const nameM = beforePhone.match(/[가-힣]{2,5}$/);
        if (nameM) name = nameM[0];
      } else {
        const nameOnly = block.match(/^[가-힣]{2,5}/);
        if (nameOnly) name = nameOnly[0];
      }
    }
    const vehicleLine = text.match(/\[차량정보\]\s*([^\n\[]+)/);
    if (vehicleLine) {
      const plateM = vehicleLine[1].match(/[가-힣]{0,3}\d{2,3}[가-힣]\d{4}/);
      if (plateM) plate = plateM[0];
    }
    if (!plate) {
      const plm = text.match(/[가-힣]{0,3}\d{2,3}[가-힣]\d{4}/);
      if (plm) plate = plm[0];
    }
    if (!phone) {
      const pm = text.match(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/);
      if (pm) phone = pm[0].replace(/[-.\s]/g, "").replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
    }
    return { phone, plate, name };
  }

  const noRoute = text.replace(/^.+?(?:->|→|→)\s*/u, "").trim() || text;

  const phoneMatch = noRoute.match(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/);
  phone = phoneMatch ? phoneMatch[0].replace(/[-.\s]/g, "").replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3") : "";

  const plateMatch = noRoute.match(/[가-힣]{2,3}\d{2}[가-힣]\d{4}|\d{2,3}[가-힣]\d{4}|[가-힣]{4,6}\d{3,4}/);
  plate = plateMatch ? plateMatch[0] : "";

  const stripped = noRoute
    .replace(phoneMatch?.[0] || "", "")
    .replace(plate || "", "")
    .replace(/\d+[톤kg]+/gi, "")
    .replace(/\d+/g, "")
    .replace(/[->→/()[\]]/g, " ");

  const nameMatch = stripped.match(/[가-힣]{2,5}/g) || [];
  name = nameMatch.find(n =>
    n.length >= 2 &&
    !CITY_EXCLUDE.includes(n) &&
    !/[구시군동읍면로길]$/.test(n) &&
    !/^(서|동|남|북|중)구$/.test(n)
  ) || "";

  return { phone, plate, name };
}

const SmartTextarea = React.memo(function SmartTextarea({ onSearch, textareaRef }) {
  const timerRef = React.useRef(null);
  return (
    <textarea
      ref={textareaRef}
      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none bg-gray-50 focus:outline-none focus:border-[#1B2B4B]"
      rows={2}
      placeholder="기사 스마트 검색 "
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck="false"
      inputMode="text"
      onChange={e => {
        const val = e.target.value;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => onSearch(val), 150);
      }}
    />
  );
});

function MobileOrderDetail({
  order,
  onOrderUpdate,
  drivers,
  clients,
  orders,
  onDuplicate,
  onAssignDriver,
  onCancelAssign,
  onCancelOrder,
  setPage,
  setForm,
  setSelectedOrder,
  showToast,
  showSuccess,
  upsertDriver,
  setPrevPage,
  onGoFare,
  cardVersionB = false,
}) {
  const [confirmDeliver, setConfirmDeliver] = useState(false);
  const [confirmUndoDeliver, setConfirmUndoDeliver] = useState(false);
  const [expandMemo, setExpandMemo] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [smartMatched, setSmartMatched] = useState([]);
  const [driverConflictPopup, setDriverConflictPopup] = useState(null);
  const [editingDriverId, setEditingDriverId] = useState(null);
  const [editingDriverData, setEditingDriverData] = useState({ 이름: "", 전화번호: "" });
  const smartTextareaRef = useRef(null);
   const clearSmartInput = () => {
    if (smartTextareaRef.current) smartTextareaRef.current.value = "";
    setSmartMatched([]);
  };
  const [carNo, setCarNo] = useState(order.차량번호 || "");
  const [name, setName] = useState(order.기사명 || "");
  const [phone, setPhone] = useState(order.전화번호 || "");

  useEffect(() => {
    setCarNo(order.차량번호 || "");
    setName(order.기사명 || "");
    setPhone(order.전화번호 || "");
  }, [order.차량번호, order.기사명, order.전화번호]);
  const [isNewDriver, setIsNewDriver] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [attachItems, setAttachItems] = useState([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachSelected, setAttachSelected] = useState(null);
  const [liveAttachCount, setLiveAttachCount] = useState(order.attachCount || 0);
  const detailAttachStorageKey = `saved_attach_${order._id || order.id}`;
  const [attachSaveStates, setAttachSaveStates] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`saved_attach_${order._id || order.id}`) || "{}"); } catch { return {}; }
  });
  const [attachConfirmItem, setAttachConfirmItem] = useState(null);
  const [showDetailFareHistory, setShowDetailFareHistory] = useState(false);
  const [detailFareFilter, setDetailFareFilter] = useState("all");
  const [detailFareDetailItem, setDetailFareDetailItem] = useState(null);

  useEffect(() => {
    if (showDetailFareHistory) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overscrollBehavior = "none";
      document.body.style.overscrollBehavior = "none";
      const preventPTR = (e) => {
        if (!e.target.closest("[data-fare-scroll]")) e.preventDefault();
      };
      document.addEventListener("touchmove", preventPTR, { passive: false });
      return () => {
        document.body.style.overflow = "";
        document.documentElement.style.overscrollBehavior = "";
        document.body.style.overscrollBehavior = "";
        document.removeEventListener("touchmove", preventPTR);
      };
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overscrollBehavior = "";
      document.body.style.overscrollBehavior = "";
    }
  }, [showDetailFareHistory]);

  const detailFareMatches = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    const ns = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();

    const extractArea = (addr = "") => {
      const s = String(addr).trim();
      if (!s) return "";
      const metros = ["서울", "부산", "인천", "대구", "대전", "광주", "울산", "세종", "제주"];
      for (const city of metros) { if (s.startsWith(city)) return city; }
      const parts = s.split(/\s+/);
      if (parts.length >= 2) return parts[1].replace(/[시군구]$/, "");
      return parts[0].replace(/[도시군구]$/, "") || "";
    };

    const pickupArea = extractArea(order.상차지주소 || "");
    const dropArea = extractArea(order.하차지주소 || "");
    if (!pickupArea && !dropArea) return [];

    const formVehicleRaw = ns(order.차종 || order.차량종류 || "");
    const isColdVehicle = (v = "") => v.includes("냉장") || v.includes("냉동");
    const formIsCold = isColdVehicle(formVehicleRaw);

    const formClient = ns(order.거래처명 || "");
    const cargo = (order.화물내용 || "").trim();
    const ton = (order.톤수 || order.차량톤수 || "").trim();

    const parseCargoQty = (s = "") => {
      const m = String(s).match(/(\d+(?:\.\d+)?)\s*(파레트|파렛트|팔레트|박스|통|pallet|box)/i);
      if (m) return { qty: parseFloat(m[1]), unit: m[2].replace(/팔레트|파렛트/g, "파레트") };
      const numOnly = String(s).match(/^(\d+(?:\.\d+)?)$/);
      if (numOnly) return { qty: parseFloat(numOnly[1]), unit: null };
      return null;
    };
    const cargoParsed = parseCargoQty(cargo);

    const areaMatch = (oAddr = "", area) => {
      if (!area) return true;
      const oArea = extractArea(oAddr);
      if (!oArea) return false;
      return ns(oArea).includes(ns(area)) || ns(area).includes(ns(oArea));
    };

    const candidates = [];

    orders.forEach(o => {
      if (o.id === order.id) return;
      if ((o.상차일 || "").slice(0, 10) === todayKST()) return;
      const claim = Number(o.청구운임 || 0);
      const drv = Number(o.기사운임 || 0);
      if (!claim && !drv) return;

      // 차종 필수 일치 (냉장/냉동 그룹핑)
      if (formVehicleRaw) {
        const oVehicle = ns(o.차종 || o.차량종류 || "");
        const oIsCold = isColdVehicle(oVehicle);
        if (formIsCold && !oIsCold) return;
        if (!formIsCold && oIsCold) return;
        if (!formIsCold && !oIsCold && !oVehicle.includes(formVehicleRaw) && !formVehicleRaw.includes(oVehicle)) return;
      }

      // 노선 지역 필수 일치
      const pickMatch = pickupArea ? areaMatch(o.상차지주소 || "", pickupArea) : true;
      const dropMatch = dropArea ? areaMatch(o.하차지주소 || "", dropArea) : true;
      if (!pickMatch || !dropMatch) return;

      let score = 50;
      const tags = ["경로일치"];

      // 거래처 일치 → 1순위 부스트
      const oClient = ns(o.거래처명 || "");
      const isClientMatch = formClient && oClient === formClient;
      if (isClientMatch) { score += 100; tags.push("거래처일치"); }

      // 화물내용 (최대 30pt)
      if (cargo) {
        const oCargoParsed = parseCargoQty(o.화물내용 || "");
        const normCargo = ns(cargo);
        const normOCargo = ns(o.화물내용 || "");
        if (normOCargo === normCargo) { score += 30; tags.push("화물일치"); }
        else if (cargoParsed && oCargoParsed) {
          const sameUnit = (!cargoParsed.unit && !oCargoParsed.unit) ||
            (cargoParsed.unit && oCargoParsed.unit && ns(cargoParsed.unit) === ns(oCargoParsed.unit));
          if (sameUnit) {
            const diff = Math.abs(cargoParsed.qty - oCargoParsed.qty);
            const pct = cargoParsed.qty > 0 ? diff / cargoParsed.qty : 1;
            if (diff === 0) { score += 30; tags.push("화물일치"); }
            else if (diff <= 1) { score += 22; tags.push("화물유사"); }
            else if (diff <= 2 || pct <= 0.2) { score += 15; tags.push("화물유사"); }
            else if (pct <= 0.4) { score += 8; tags.push("화물근사"); }
          } else if (cargoParsed.unit && oCargoParsed.unit) { score += 5; }
        } else if (normOCargo.includes(ns(cargo.replace(/\d+/g, "")))) { score += 8; }
      }

      // 상/하차지명 일치 보너스 (최대 20pt) — 같은 노선이 먼저 오도록
      const formPickupName = ns(order.상차지명 || "");
      const formDropName = ns(order.하차지명 || "");
      const pickNameMatch = formPickupName && ns(o.상차지명 || "").includes(formPickupName);
      const dropNameMatch = formDropName && ns(o.하차지명 || "").includes(formDropName);
      if (pickNameMatch) score += 10;
      if (dropNameMatch) score += 10;
      if (pickNameMatch && dropNameMatch) tags.push("지명일치");

      // 톤수 (최대 15pt)
      const oTon = o.톤수 || o.차량톤수 || "";
      if (ton && oTon) {
        if (ns(oTon) === ns(ton)) { score += 15; tags.push("톤수일치"); }
        else {
          const tn = parseFloat(ton); const otn = parseFloat(oTon);
          if (!isNaN(tn) && !isNaN(otn) && Math.abs(tn - otn) / (tn || 1) <= 0.1) score += 8;
        }
      }

      candidates.push({ order: o, score, tags, dateStr: o.상차일 || "", claim, drv, isClientMatch });
    });

    if (candidates.length === 0) return [];

    // 거래처 일치 이력이 있으면 1순위만, 없으면 전체
    const tier1 = formClient ? candidates.filter(c => c.isClientMatch) : [];
    const finalList = tier1.length > 0 ? tier1 : candidates;

    finalList.sort((a, b) => b.score !== a.score ? b.score - a.score : b.dateStr.localeCompare(a.dateStr));
    return finalList.slice(0, 50);
  }, [orders, order.상차지주소, order.하차지주소, order.상차지명, order.하차지명, order.차종, order.차량종류, order.거래처명, order.화물내용, order.톤수, order.차량톤수, order.id]);

  const goEditWithFare = (claim, drv) => {
    setShowDetailFareHistory(false);
    setDetailFareDetailItem(null);
    const _pendingContactItems = [];
    [
      { fieldName: order.상차지명, type: "pickup" },
      { fieldName: order.하차지명, type: "drop" },
    ].forEach(({ fieldName, type }) => {
      if (!fieldName) return;
      const found = (clients || []).find(c => normalizeCompany(c.거래처명) === normalizeCompany(fieldName));
      if (!found) return;
      const contacts = (Array.isArray(found.contacts) ? found.contacts : []).filter(ct => ct.name?.trim());
      const unique = [...new Map(contacts.map(ct => [ct.name.trim(), ct])).values()];
      if (unique.length > 1) _pendingContactItems.push({ type, place: found, contacts: unique });
    });
    window.scrollTo(0, 0);
    setPrevPage("detail");
    setPage("form");
    setForm({
      거래처명: order.거래처명 || "",
      상차일: order.상차일 || "",
      상차시간: order.상차시간 || "",
      상차시간기준: order.상차시간기준 || null,
      하차일: order.하차일 || "",
      하차시간: order.하차시간 || "",
      하차시간기준: order.하차시간기준 || null,
      상차지명: order.상차지명 || "",
      상차지주소: order.상차지주소 || "",
      상차지담당자: order.상차지담당자 || "",
      상차지담당자번호: order.상차지담당자번호 || "",
      하차지명: order.하차지명 || "",
      하차지주소: order.하차지주소 || "",
      하차지담당자: order.하차지담당자 || "",
      하차지담당자번호: order.하차지담당자번호 || "",
      톤수: order.톤수 || order.차량톤수 || "",
      차종: order.차종 || order.차량종류 || "",
      화물내용: order.화물내용 || "",
      상차방법: order.상차방법 || "",
      하차방법: order.하차방법 || "",
      지급방식: order.지급방식 || "",
      배차방식: order.배차방식 || "",
      청구운임: claim != null ? claim : (order.청구운임 || 0),
      기사운임: drv != null ? drv : (order.기사운임 || 0),
      수수료: (claim != null ? claim : (Number(order.청구운임)||0)) - (drv != null ? drv : (Number(order.기사운임)||0)),
      산재보험료: order.산재보험료 || 0,
      차량번호: order.차량번호 || "",
      혼적여부: order.혼적여부 || "독차",
      적요: order.메모 || "",
      기사명: order.기사명 || "",
      전화번호: order.전화번호 || "",
      경유상차목록: order.경유상차목록 || [],
      경유하차목록: order.경유하차목록 || [],
      _editId: order.id,
      _returnToDetail: true,
      _pendingContactItems,
    });
  };

  const claim = getClaim(order);
  const sanjae = getSanjae(order);
  const state = getStatus(order);
const [localDelivered, setLocalDelivered] = React.useState(
    order?.업체전달상태 === "전달완료" || order?.정보전달완료 === true
  );
  const isDelivered = localDelivered;

const pickupTimeText = order.상차시간
    ? `${order.상차시간}${order.상차시간기준 ? ` ${order.상차시간기준}` : ""}`
    : "";
  const dropTimeText = order.하차시간
    ? `${order.하차시간}${order.하차시간기준 ? ` ${order.하차시간기준}` : ""}`
    : "";
  const 상차일시 = order.상차일시 || [order.상차일, pickupTimeText].filter(Boolean).join(" ");
  const 하차일시 = order.하차일시 || [order.하차일, dropTimeText].filter(Boolean).join(" ");

  // 차량번호 자동매칭
  useEffect(() => {
    const norm = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();
    if (!carNo) return;
    const d = drivers.find((dr) => norm(dr.차량번호) === norm(carNo));
    if (d) { setName(d.이름 || ""); setPhone(d.전화번호 || ""); }
  }, [carNo]);

  useEffect(() => {
    if (!carNo) { setName(""); setPhone(""); }
  }, [carNo]);

  useEffect(() => {
    setLiveAttachCount(order.attachCount || 0);
  }, [order.attachCount]);

  useEffect(() => {
    if (!showAttachments) {
      setAttachItems([]);
      setAttachLoading(false);
      return;
    }
    setAttachLoading(true);
    const col = order.__col || "orders";
    const docId = order._id || order.id;
    const colRef = collection(db, col, docId, "attachments");
    const unsub = onSnapshot(colRef, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttachItems(items);
      setLiveAttachCount(items.length);
      setAttachLoading(false);
    });
    return () => unsub();
  }, [showAttachments]);

  const doAttachSave = (item) => {
    try {
      const a = document.createElement("a");
      a.href = item.base64 || item.url;
      a.download = item.name || "attachment.jpg";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setAttachSaveStates(prev => {
        const next = { ...prev, [item.id]: "success" };
        try { localStorage.setItem(detailAttachStorageKey, JSON.stringify(next)); } catch {}
        return next;
      });
    } catch {
      setAttachSaveStates(prev => ({ ...prev, [item.id]: "fail" }));
    }
  };
  const handleAttachSave = (item) => {
    if (attachSaveStates[item.id] === "success") { setAttachConfirmItem(item); return; }
    doAttachSave(item);
  };

  const normD = (s = "") => String(s).replace(/[-.\s]/g, "").toLowerCase();

  const fmtPhone = (p = "") => {
    const d = String(p).replace(/[^\d]/g, "");
    if (d.length === 11) return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
    if (d.length === 10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
    return p;
  };
  const handleSmartSearch = (text) => {
    if (!text.trim()) { setSmartMatched([]); return; }
    const { plate: pl } = parseDriverText(text);
    if (!pl) {
      // 차량번호 없으면 드롭다운 표시 안 함
      setSmartMatched([]);
      return;
    }
    const results = drivers.filter(d => normD(d.차량번호).includes(normD(pl)));
    setSmartMatched(results.slice(0, 8));
  };
  const driversRef = React.useRef(drivers);
  React.useEffect(() => { driversRef.current = drivers; }, [drivers]);

 const handleSmartInputCb = React.useCallback((val) => {
  if (!val.trim()) { setSmartMatched([]); setIsNewDriver(false); setCarNo(""); setName(""); setPhone(""); return; }
  const { plate: pl, name: nm, phone: ph } = parseDriverText(val);
  const nd = (s = "") => String(s).replace(/[-.\s]/g, "").toLowerCase();

  // 1️⃣ 차량번호 우선 검색
  if (pl) {
    const results = driversRef.current
      .filter(d => nd(d.차량번호) === nd(pl))
      .sort((a, b) => {
        const aExact = nd(a.이름) === nd(nm) && nd(a.전화번호) === nd(ph);
        const bExact = nd(b.이름) === nd(nm) && nd(b.전화번호) === nd(ph);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return 0;
      });
    setSmartMatched(results.slice(0, 8));
    if (results.length === 0) {
      setCarNo(pl); setName(nm || ""); setPhone(ph || ""); setIsNewDriver(true);
    } else {
      const exactMatch = results.find(d => nd(d.이름) === nd(nm));
      if (exactMatch) {
        setCarNo(exactMatch.차량번호); setName(exactMatch.이름 || ""); setPhone(exactMatch.전화번호 || ""); setIsNewDriver(false);
      } else {
        setCarNo(results[0].차량번호); setName(results[0].이름 || ""); setPhone(results[0].전화번호 || ""); setIsNewDriver(false);
      }
    }
    return;
  }

  // 2️⃣ 전화번호로 검색 (010-xxxx-xxxx / 010 xxxx xxxx / 01012341234)
  if (ph) {
    const results = driversRef.current.filter(d => nd(d.전화번호) === nd(ph));
    setSmartMatched(results.slice(0, 8));
    if (results.length === 0) {
      setName(nm || ""); setPhone(ph); setIsNewDriver(true);
    }
    return;
  }

  // 3️⃣ 이름으로 검색 (한글 2자 이상)
  if (nm && nm.length >= 2) {
    const results = driversRef.current.filter(d => d.이름 && d.이름.includes(nm));
    setSmartMatched(results.slice(0, 8));
    return;
  }

  setSmartMatched([]); setIsNewDriver(false);
}, []);
  const selectSmartDriver = (d) => {
    setCarNo(d.차량번호 || "");
    setName(d.이름 || "");
    setPhone(d.전화번호 || "");
    setIsNewDriver(false);
    clearSmartInput();
  };

  // blur/엔터 시 충돌 체크 (차량번호 우선, 전화번호 무시)
  const applySmartDriverInput = async (text) => {
    if (!text.trim()) return;
    const { phone: ph, plate: pl, name: nm } = parseDriverText(text);
    if (!pl && !nm && !ph) return;

    if (!pl) {
      // 차량번호 없으면 그냥 신규로 직접 입력 적용
      if (nm || ph) {
        setCarNo(""); setName(nm || ""); setPhone(ph || "");
        clearSmartInput();
      }
      return;
    }

    // 차량번호 기준 기존 기사 검색
    const byPlate = drivers.filter(d => normD(d.차량번호) === normD(pl));

    if (byPlate.length > 0) {
      const existing = byPlate[0];
      const sameName = normD(existing.이름) === normD(nm);

      if (sameName) {
        // 이름 동일 → 그냥 매칭 (전화번호는 무시)
        setCarNo(existing.차량번호); setName(existing.이름); setPhone(existing.전화번호);
        clearSmartInput();
      } else if (nm) {
        // 차량번호 같고 이름 다름 → 충돌 팝업
        clearSmartInput();
        setDriverConflictPopup({ mode: "name_diff", existing, input: { plate: pl, name: nm, phone: ph } });
      } else {
        setCarNo(existing.차량번호); setName(existing.이름); setPhone(existing.전화번호);
        clearSmartInput();
      }
      return;
    }

    // 기존 없음 → 신규 등록 확인 팝업
    clearSmartInput();
    setDriverConflictPopup({ mode: "new_driver", existing: null, input: { plate: pl, name: nm, phone: ph } });
  };

  const openMap = (type) => {
    const addr = type === "pickup" ? order.상차지주소 || order.상차지명 : order.하차지주소 || order.하차지명;
    if (!addr) { alert("주소 정보가 없습니다."); return; }
    window.open(`https://map.kakao.com/?q=${encodeURIComponent(addr)}`, "_blank");
  };

const handleAssignClick = () => {
    if (!carNo) { alert("차량번호를 입력해주세요."); return; }
    if (!name || !phone) {
      if (!window.confirm("기사 이름/연락처가 비어 있습니다. 그대로 배차하시겠습니까?")) return;
    }
    onAssignDriver({ 차량번호: carNo, 이름: name, 전화번호: phone });
  };

 const handleSaveDriverToOrder = async () => {
    if (!carNo) { alert("차량번호를 입력해주세요."); return; }
    try {
      const colName = order.__col || collName;
      const docId = order._id || order.id;

      await updateDoc(doc(db, colName, docId), {
  차량번호: carNo,
  기사명: name || "",
  이름: name || "",
  전화번호: phone || "",
  전화: phone || "",
  배차상태: "배차완료",
  상태: "배차완료",
  배차완료일시: serverTimestamp(),
  updatedAt: serverTimestamp(),
  _lastModified: Date.now(),
});

      // 신규 기사면 기사관리에 등록
      if (isNewDriver && carNo) {
        const nd = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();
        const existing = driversRef.current.find(d => nd(d.차량번호) === nd(carNo));
        if (!existing) {
          await upsertDriver({ 차량번호: carNo, 이름: name || "", 전화번호: phone || "" });
        }
      }

      setIsNewDriver(false);
      if (smartTextareaRef.current) smartTextareaRef.current.value = "";
      setSmartMatched([]);
      showToast("저장 완료!");
    } catch (e) {
      console.error("저장 오류:", e);
      alert("저장 실패: " + e.message);
    }
  };
  return (
    <div className="px-3 py-4 bg-gray-50 pb-10">
  {/* ── 통합 카드 ── */}
  <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">

    {/* 상단: 거래처 + 상태 + 메모 */}
    <div className="px-4 pt-4 pb-3 border-b border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-bold text-gray-700">{order.거래처명 || "-"}</span>
        <div className="flex flex-col items-end gap-0.5">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
            cardVersionB
              ? (state === "배차완료" ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-[#1B2B4B]/30 text-[#1B2B4B] bg-transparent")
              : (state === "배차완료" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-blue-50 text-blue-700 border-blue-200")
          }`}>{state}</span>
          {state === "배차완료" && order.배차완료일시?.seconds && (
            <span className="text-[10px] text-emerald-600">
              {new Date(order.배차완료일시.seconds * 1000).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} 완료
            </span>
          )}
        </div>
      </div>
      {(order.메모 || order.적요) && (
        <div className="bg-gray-50 rounded-xl px-3 py-2 cursor-pointer" onClick={() => setExpandMemo(v => !v)}>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[11px] font-bold text-gray-500">메모</span>
            <span className="text-[11px] text-gray-400">{expandMemo ? "접기" : "펼치기"}</span>
          </div>
          <div className={`text-[12px] text-gray-700 whitespace-pre-wrap leading-relaxed ${expandMemo ? "" : "line-clamp-2"}`}>
            {order.메모 || order.적요}
          </div>
        </div>
      )}
    </div>

    {/* 오더 정보 */}
    <div className="px-4 py-3 border-b border-gray-100">
      {/* 상차지 */}
      <div className="flex gap-2 mb-2">
        <span className="mt-0.5 w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">상</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-gray-900">{order.상차지명 || "-"}</div>
          {order.상차지주소 && (
            <div className="flex items-start gap-1 mt-0.5">
              <div className="text-[11px] flex-1 text-gray-500">{order.상차지주소}</div>
              <button onClick={() => openMap("pickup")} className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600 border border-blue-200 whitespace-nowrap">지도</button>
            </div>
          )}
          <div className="text-[11px] text-gray-400 mt-0.5">{상차일시 || "-"}</div>
        </div>
      </div>
      {validStops(order.경유상차목록 || order.경유지_상차).map((s, i) => (
        <div key={i} className="flex gap-2 mb-1 ml-3">
          <span className="mt-0.5 w-5 h-5 rounded-full bg-blue-300 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">상{i+1}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-blue-700">{s.업체명 || "-"}</div>
            {s.주소 && <div className="text-[11px] text-gray-400">{s.주소}</div>}
            {s.담당자 && <div className="text-[11px] text-gray-500">{s.담당자}{s.담당자번호 ? ` · ${s.담당자번호}` : ""}</div>}
            <div className="flex gap-2 mt-0.5 flex-wrap">
              {s.화물내용 && <span className="text-[10px] text-orange-600 bg-orange-50 px-1 py-0.5 rounded">{s.화물내용}</span>}
              {(s.차량톤수 || s.톤수값) && <span className="text-[10px] text-green-700 bg-green-50 px-1 py-0.5 rounded">{s.차량톤수 || s.톤수값}</span>}
              {s.상차시간 && <span className="text-[10px] text-gray-500">{s.상차시간}</span>}
            </div>
            {s.메모 && <div className="text-[10px] text-gray-600 bg-gray-50 rounded px-1.5 py-0.5 mt-0.5">{s.메모}</div>}
          </div>
        </div>
      ))}
      <div className="ml-[10px] w-px h-3 bg-gray-200 mb-2" />
      {validStops(order.경유하차목록 || order.경유지_하차).map((s, i) => (
        <div key={i} className="flex gap-2 mb-1 ml-3">
          <span className="mt-0.5 w-5 h-5 rounded-full bg-gray-400 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">하{i+1}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-gray-700">{s.업체명 || "-"}</div>
            {s.주소 && <div className="text-[11px] text-gray-400">{s.주소}</div>}
            {s.담당자 && <div className="text-[11px] text-gray-500">{s.담당자}{s.담당자번호 ? ` · ${s.담당자번호}` : ""}</div>}
            <div className="flex gap-2 mt-0.5 flex-wrap">
              {s.화물내용 && <span className="text-[10px] text-orange-600 bg-orange-50 px-1 py-0.5 rounded">{s.화물내용}</span>}
              {(s.차량톤수 || s.톤수값) && <span className="text-[10px] text-green-700 bg-green-50 px-1 py-0.5 rounded">{s.차량톤수 || s.톤수값}</span>}
              {s.하차시간 && <span className="text-[10px] text-gray-500">{s.하차시간}</span>}
            </div>
            {s.메모 && <div className="text-[10px] text-gray-600 bg-gray-50 rounded px-1.5 py-0.5 mt-0.5">{s.메모}</div>}
          </div>
        </div>
      ))}
      <div className="ml-[10px] w-px h-3 bg-gray-200 mb-2" />
      {/* 하차지 */}
      <div className="flex gap-2 mb-3">
        <span className="mt-0.5 w-5 h-5 rounded-full bg-gray-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">하</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-gray-900">{order.하차지명 || "-"}</div>
          {order.하차지주소 && (
            <div className="flex items-start gap-1 mt-0.5">
              <div className="text-[11px] flex-1 text-gray-500">{order.하차지주소}</div>
              <button onClick={() => openMap("drop")} className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap">지도</button>
            </div>
          )}
          <div className="text-[11px] text-gray-400 mt-0.5">{하차일시 || "-"}</div>
        </div>
      </div>
      {/* 차량/화물 정보 */}
      {((order.차량톤수 || order.톤수) || (order.차량종류 || order.차종) || order.화물내용 || order.혼적여부) && (
        <div className="flex justify-center gap-5 pt-2.5 border-t border-gray-100">
          {(order.차량톤수 || order.톤수) && (
            <div className="text-center">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">톤수</div>
              <div className="text-[12px] font-semibold text-gray-700">{order.차량톤수 || order.톤수}</div>
            </div>
          )}
          {(order.차량종류 || order.차종) && (
            <div className="text-center">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">차종</div>
              <div className="text-[12px] font-semibold text-gray-700">{order.차량종류 || order.차종}</div>
            </div>
          )}
          {order.화물내용 && (
            <div className="text-center">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">화물</div>
              <div className="text-[12px] font-semibold text-gray-700">{order.화물내용}</div>
            </div>
          )}
          {order.혼적여부 && order.혼적여부 !== "독차" && (
            <div className="text-center">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">혼적</div>
              <div className="text-[12px] font-semibold text-gray-700">{order.혼적여부}</div>
            </div>
          )}
        </div>
      )}
    </div>

    {/* 운임 정보 + 업체전달 */}
    <div className="px-4 py-3 border-b border-gray-100">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-3 gap-3 flex-1 mr-3">
          <div className="text-center">
            <div className="text-[10px] text-gray-400 mb-0.5">청구운임</div>
            <div className="text-[14px] font-extrabold text-[#1B2B4B]">{Number(claim || 0).toLocaleString()}<span className="text-[10px] font-normal text-gray-400 ml-0.5">원</span></div>
          </div>
          <div className="text-center border-x border-gray-100">
            <div className="text-[10px] text-gray-400 mb-0.5">기사운임</div>
            <div className="text-[14px] font-extrabold text-emerald-700">{Number(order.기사운임 || 0).toLocaleString()}<span className="text-[10px] font-normal text-gray-400 ml-0.5">원</span></div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-gray-400 mb-0.5">수수료</div>
            <div className="text-[14px] font-extrabold text-gray-700">{(Number(claim || 0) - Number(order.기사운임 || 0)).toLocaleString()}<span className="text-[10px] font-normal text-gray-400 ml-0.5">원</span></div>
          </div>
        </div>
        {/* 업체전달 토글 */}
        <div className="flex flex-col items-center gap-1 border-l border-gray-100 pl-3">
          <div className="text-[10px] text-gray-400">업체전달</div>
          <button
            type="button"
            onClick={() => isDelivered ? setConfirmUndoDeliver(true) : setConfirmDeliver(true)}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${isDelivered ? "bg-emerald-500" : "bg-gray-300"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${isDelivered ? "translate-x-5" : "translate-x-0"}`} />
          </button>
          <div className={`text-[10px] font-semibold ${isDelivered ? "text-emerald-600" : "text-gray-400"}`}>{isDelivered ? "완료" : "미전달"}</div>
        </div>
      </div>
    </div>

    {/* 첨부파일 */}
    <div className="border-b border-gray-100">
      <button onClick={() => setShowAttachments(true)} style={{ touchAction: "manipulation" }} className="w-full flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#1B2B4B] flex items-center justify-center shrink-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div className="text-left">
            <div className="text-[13px] font-bold text-gray-900">첨부파일</div>
            <div className="text-[11px] text-gray-400">{liveAttachCount > 0 ? `${liveAttachCount}개의 파일` : "업로드된 파일 없음"}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {liveAttachCount > 0 && <span className="min-w-[20px] h-5 px-1 rounded-full bg-[#1B2B4B] text-white text-[10px] font-bold flex items-center justify-center">{liveAttachCount}</span>}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </button>
    </div>

    {/* 빠른 액션 */}
    <div className="px-4 py-3 border-b border-gray-100">
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => onDuplicate(order)} style={{ touchAction: "manipulation" }}
          className="py-2 rounded-xl bg-gray-100 text-gray-700 text-[11px] font-bold">오더복사</button>
        <button onClick={() => setShowCopyModal(true)} style={{ touchAction: "manipulation" }}
          className="py-2 rounded-xl bg-gray-100 text-gray-700 text-[11px] font-bold">기사복사</button>
        <button style={{ touchAction: "manipulation" }}
          onClick={() => { setDetailFareFilter("all"); setShowDetailFareHistory(true); }}
          className="py-2 rounded-xl bg-[#1B2B4B] text-white text-[11px] font-bold">
          운임조회{detailFareMatches.length > 0 ? ` (${detailFareMatches.length})` : ""}
        </button>
      </div>
    </div>

    {/* 기사 배차 */}
    <div className="px-4 py-3 border-b border-gray-100">
      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">기사 배차</div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] text-gray-500">현재 상태</span>
        <span className={`text-[12px] font-bold ${carNo ? "text-emerald-600" : "text-blue-600"}`}>
          {carNo ? "배차완료" : "배차중"}{name && ` · ${name} (${carNo})`}
        </span>
      </div>
      <div className="text-[11px] font-semibold text-gray-500 mb-1.5">기사 검색 (이름 · 차량번호 · 연락처 · 문자복붙)</div>
      <div className="relative mb-3">
        <SmartTextarea textareaRef={smartTextareaRef} onSearch={handleSmartInputCb} />
        {smartMatched.length > 0 && (
          <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden">
            {smartMatched.map((d, i) => (
              <div key={d.id || i} className="border-b border-gray-100 last:border-0">
                {editingDriverId === (d.id || i) ? (
                  <div className="px-4 py-3 bg-blue-50">
                    <div className="text-[11px] font-semibold text-gray-500 mb-1">{d.차량번호}</div>
                    <input className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm mb-1.5 focus:outline-none focus:border-blue-400" placeholder="기사 이름" value={editingDriverData.이름} onChange={e => setEditingDriverData(p => ({ ...p, 이름: e.target.value }))} onPointerDown={e => e.stopPropagation()} />
                    <input className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm mb-2 focus:outline-none focus:border-blue-400" placeholder="전화번호" value={editingDriverData.전화번호} onChange={e => setEditingDriverData(p => ({ ...p, 전화번호: e.target.value }))} onPointerDown={e => e.stopPropagation()} />
                    <div className="flex gap-2">
                      <button type="button" className="flex-1 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold"
                        onPointerDown={async (e) => { e.preventDefault(); if (!editingDriverData.이름.trim()) return; await updateDoc(doc(db, "drivers", d.id), { 이름: editingDriverData.이름, 전화번호: editingDriverData.전화번호 }); setSmartMatched(prev => prev.map(m => m.id === d.id ? { ...m, 이름: editingDriverData.이름, 전화번호: editingDriverData.전화번호 } : m)); setEditingDriverId(null); }}>저장</button>
                      <button type="button" className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-xs" onPointerDown={e => { e.preventDefault(); setEditingDriverId(null); }}>취소</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <button type="button" className="flex-1 text-left px-4 py-3 hover:bg-gray-50" onPointerDown={e => { e.preventDefault(); selectSmartDriver(d); }}>
                      <div className="font-bold text-gray-900 text-[13px]">{d.이름 || "-"}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{d.차량번호} · {d.전화번호}</div>
                    </button>
                    <button type="button" className="px-3 py-3 text-gray-400 hover:text-blue-500 text-xs" onPointerDown={e => { e.preventDefault(); setEditingDriverId(d.id || i); setEditingDriverData({ 이름: d.이름 || "", 전화번호: d.전화번호 || "" }); }}>수정</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2 mb-3">
        {isNewDriver && (
          <div className="flex items-center gap-1.5 px-1 mb-1">
            <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 text-[11px] font-bold border border-orange-300">신규 기사</span>
            <span className="text-[11px] text-gray-400">저장 시 기사관리에 등록됩니다</span>
          </div>
        )}
        <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B2B4B]" placeholder="차량번호" value={carNo} onChange={e => { setCarNo(e.target.value); setIsNewDriver(false); }} />
        <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B2B4B]" placeholder="기사 이름" value={name} onChange={e => setName(e.target.value)} />
        <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B2B4B]" placeholder="기사 연락처" value={phone} onChange={e => setPhone(e.target.value)} />
      </div>
      {phone && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          <a href={`tel:${normalizePhone(phone)}`} className="py-2.5 rounded-xl bg-[#1B2B4B] text-white text-xs font-bold text-center flex items-center justify-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.59a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.7 16z"/></svg>
            전화
          </a>
          <a href={`sms:${normalizePhone(phone)}`} className="py-2.5 rounded-xl border border-[#1B2B4B] text-[#1B2B4B] text-xs font-bold text-center flex items-center justify-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            문자
          </a>
        </div>
      )}
      {state !== "배차완료" ? (
        <button onClick={handleAssignClick} className="w-full py-3 mb-2 rounded-xl bg-[#1B2B4B] text-white text-sm font-bold">기사 배차하기</button>
      ) : (
        <button onClick={onCancelAssign} className="w-full py-3 mb-2 rounded-xl border border-red-300 text-red-500 text-sm font-bold">기사 배차 취소</button>
      )}
      <div className="h-px bg-gray-100 my-1" />
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          onClick={() => {
            const _pendingContactItems = [];
            [{ fieldName: order.상차지명, type: "pickup" }, { fieldName: order.하차지명, type: "drop" }].forEach(({ fieldName, type }) => {
              if (!fieldName) return;
              const found = (clients || []).find(c => normalizeCompany(c.거래처명) === normalizeCompany(fieldName));
              if (!found) return;
              const contacts = (Array.isArray(found.contacts) ? found.contacts : []).filter(ct => ct.name?.trim());
              const unique = [...new Map(contacts.map(ct => [ct.name.trim(), ct])).values()];
              if (unique.length > 1) _pendingContactItems.push({ type, place: found, contacts: unique });
            });
            window.scrollTo(0, 0);
            setPrevPage("detail");
            setPage("form");
            setForm({
              거래처명: order.거래처명 || "", 상차일: order.상차일 || "", 상차시간: order.상차시간 || "",
              상차시간기준: order.상차시간기준 || null, 하차일: order.하차일 || "", 하차시간: order.하차시간 || "",
              하차시간기준: order.하차시간기준 || null, 상차지명: order.상차지명 || "", 상차지주소: order.상차지주소 || "",
              상차지담당자: order.상차지담당자 || "", 상차지담당자번호: order.상차지담당자번호 || "",
              하차지명: order.하차지명 || "", 하차지주소: order.하차지주소 || "",
              하차지담당자: order.하차지담당자 || "", 하차지담당자번호: order.하차지담당자번호 || "",
              톤수: order.톤수 || order.차량톤수 || "", 차종: order.차종 || order.차량종류 || "",
              화물내용: order.화물내용 || "", 상차방법: order.상차방법 || "", 하차방법: order.하차방법 || "",
              지급방식: order.지급방식 || "", 배차방식: order.배차방식 || "",
              청구운임: order.청구운임 || 0, 기사운임: order.기사운임 || 0,
              수수료: (Number(order.청구운임) || 0) - (Number(order.기사운임) || 0),
              산재보험료: order.산재보험료 || 0, 차량번호: carNo || "",
              혼적여부: order.혼적여부 || "독차", 적요: order.메모 || "",
              기사명: name || "", 전화번호: phone || "",
              경유상차목록: validStops(order.경유상차목록 || order.경유지_상차),
              경유하차목록: validStops(order.경유하차목록 || order.경유지_하차),
              _editId: order.id, _returnToDetail: true, _pendingContactItems,
            });
          }}
          className="py-3 rounded-xl bg-gray-700 text-white text-sm font-bold"
        >수정하기</button>
        <button onClick={onCancelOrder} className="py-3 rounded-xl border border-red-200 text-red-500 text-sm font-semibold">오더 삭제</button>
      </div>
    </div>

  </div>

      {/* ── 모달들 ── */}
      {showCopyModal && (
        <CopySelectModal
          order={order}
          onClose={() => setShowCopyModal(false)}
          onAfterFullCopy={() => { setShowCopyModal(false); setConfirmDeliver(true); }}
          onCopySuccess={() => showSuccess?.("기사 복사 완료")}
          cardVersionB={cardVersionB}
        />
      )}

      {confirmDeliver && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-6">
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs">
            <div className="text-sm font-bold text-gray-900 mb-1">복사 완료</div>
            <div className="text-sm text-gray-500 mb-4">전달상태를 <b className="text-gray-900">전달완료</b>로 변경할까요?</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeliver(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold">아니오</button>
              <button
                onClick={async () => {
                 // ✅ 즉시 UI 반영
                  setConfirmDeliver(false);
                  setLocalDelivered(true);
                  showToast("전달완료 처리되었습니다");
                  // 부모 orders 즉시 업데이트
                  if (typeof onOrderUpdate === "function") {
                    onOrderUpdate(order.id, { 업체전달상태: "전달완료", 정보전달완료: true, 정보전달상태: "전달완료" });
                  }
                  // 백그라운드 저장
                  updateDoc(doc(db, order.__col || collName, order.id), { 업체전달상태: "전달완료", 전달완료일시: serverTimestamp(), 정보전달완료: true, 정보전달상태: "전달완료" }).catch(console.error);
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold"
              >확인</button>
            </div>
          </div>
        </div>
      )}

      {confirmUndoDeliver && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-6">
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs">
            <div className="text-sm font-bold text-red-600 mb-1">전달완료 취소</div>
            <div className="text-sm text-gray-500 mb-4">전달상태를 <b className="text-gray-900">미전달</b>로 되돌릴까요?</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmUndoDeliver(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold">아니오</button>
              <button
               onClick={async () => {
               // ✅ 즉시 UI 반영
                  setConfirmUndoDeliver(false);
                  setLocalDelivered(false);
                  showToast("미전달로 되돌렸습니다");
                  if (typeof onOrderUpdate === "function") {
                    onOrderUpdate(order.id, { 업체전달상태: "미전달", 정보전달완료: false, 정보전달상태: "미전달", 전달완료일시: null });
                  }
                  // 백그라운드 저장
                  updateDoc(doc(db, order.__col || collName, order.id), { 업체전달상태: "미전달", 정보전달완료: false, 정보전달상태: "미전달", 전달완료일시: null }).catch(console.error);
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold"
              >확인</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 기사 정보 충돌 팝업 ===== */}
      {/* ── 첨부파일 모달 ── */}
      {showAttachments && (
        <div className="fixed inset-0 z-[9999] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowAttachments(false); setAttachSelected(null); }} />
          <div className="relative bg-white rounded-t-3xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            {/* 핸들바 */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#1B2B4B] flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div>
                  <div className="font-bold text-[15px] text-[#1B2B4B]">
                    첨부파일
                    {!attachLoading && <span className="text-[12px] font-normal text-gray-400 ml-1">{attachItems.length}장</span>}
                  </div>
                  <div className="text-[11px] text-gray-400">{order.상차지명} → {order.하차지명}</div>
                </div>
              </div>
              <button onClick={() => { setShowAttachments(false); setAttachSelected(null); }}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-lg">
                ×
              </button>
            </div>
            {/* 본문 */}
            <div className="flex-1 overflow-y-auto p-4">
              {attachLoading && (
                <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-[#1B2B4B] rounded-full animate-spin" />
                  <span className="text-sm">불러오는 중...</span>
                </div>
              )}
              {!attachLoading && attachItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <div className="text-sm text-gray-400 font-medium">업로드된 파일이 없습니다</div>
                  <div className="text-xs text-gray-300">기사님께 인수증 업로드를 요청하세요</div>
                </div>
              )}
              {!attachLoading && attachItems.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {attachItems.map((item) => (
                    <div key={item.id} className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                      <div className="aspect-[4/3] bg-gray-50 cursor-pointer relative"
                        onClick={() => setAttachSelected(item)}>
                        <img
                          src={item.base64 || item.url}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={e => {
                            e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-gray-300 text-xs">미리보기 없음</div>';
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 active:bg-black/10">
                          <span className="text-white text-[10px] font-bold bg-black/40 px-1.5 py-0.5 rounded-full opacity-0 active:opacity-100">확대</span>
                        </div>
                      </div>
                      <div className="px-2.5 py-2 bg-white">
                        <div className="text-[10px] text-gray-400 truncate mb-1.5">{item.name || "파일"}{item.sizeKB ? ` · ${item.sizeKB}KB` : ""}</div>
                        <button
                          onClick={() => handleAttachSave(item)}
                          className={`w-full py-1.5 rounded-lg text-white text-[11px] font-bold transition-colors ${
                            attachSaveStates[item.id] === "success" ? "bg-emerald-500" :
                            attachSaveStates[item.id] === "fail" ? "bg-red-500" : "bg-[#1B2B4B]"
                          }`}
                        >
                          {attachSaveStates[item.id] === "success" ? "저장완료" :
                           attachSaveStates[item.id] === "fail" ? "저장실패" : "저장"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* 전체화면 이미지 뷰 */}
          {attachSelected && (
            <div className="absolute inset-0 bg-black/95 z-10 flex flex-col items-center justify-center"
              onClick={() => setAttachSelected(null)}>
              <img
                src={attachSelected.base64 || attachSelected.url}
                alt="full"
                className="max-w-full max-h-[75vh] object-contain"
                onClick={e => e.stopPropagation()}
              />
              <button
                className="absolute top-4 left-4 w-10 h-10 bg-white/15 rounded-full text-white text-xl flex items-center justify-center"
                onClick={() => setAttachSelected(null)}>
                닫기
              </button>
              <button
                className={`absolute bottom-8 right-6 px-5 py-2.5 text-white rounded-xl text-sm font-bold transition-colors ${
                  attachSaveStates[attachSelected.id] === "success" ? "bg-emerald-500" :
                  attachSaveStates[attachSelected.id] === "fail" ? "bg-red-500" : "bg-[#1B2B4B]"
                }`}
                onClick={e => { e.stopPropagation(); handleAttachSave(attachSelected); }}>
                {attachSaveStates[attachSelected.id] === "success" ? "저장완료" :
                 attachSaveStates[attachSelected.id] === "fail" ? "저장실패" : "저장하기"}
              </button>
            </div>
          )}
          {attachConfirmItem && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50" onClick={() => setAttachConfirmItem(null)}>
              <div className="bg-white rounded-2xl mx-6 p-5 w-full max-w-xs shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mb-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <div className="text-[15px] font-bold text-gray-900 mb-1">이미 저장된 파일</div>
                <div className="text-[13px] text-gray-500 mb-4">이미 저장하신 파일입니다.<br />다시 저장하시겠습니까?</div>
                <div className="flex gap-2">
                  <button onClick={() => setAttachConfirmItem(null)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-[13px]">취소</button>
                  <button onClick={() => { doAttachSave(attachConfirmItem); setAttachConfirmItem(null); }} className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white font-bold text-[13px]">다시 저장</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {driverConflictPopup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={() => setDriverConflictPopup(null)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md pb-6" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="bg-[#1B2B4B] px-5 py-4 rounded-t-2xl flex items-start justify-between">
              <div>
                <div className="text-white font-bold text-sm">
                  {driverConflictPopup.existing ? "기사 정보 충돌" : "신규 기사 등록 확인"}
                </div>
                <div className="text-white/60 text-xs mt-0.5">
                  {driverConflictPopup.existing
                    ? "동일 차량번호에 다른 기사 정보가 감지되었습니다"
                    : "등록되지 않은 기사입니다. 신규 등록하시겠습니까?"}
                </div>
              </div>
              <button onClick={() => setDriverConflictPopup(null)} className="text-white/50 text-xl leading-none ml-3">✕</button>
            </div>

            <div className="px-5 pt-4 space-y-3">
              {/* 기존 정보 */}
              {driverConflictPopup.existing && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <div className="text-xs font-semibold text-gray-500 mb-1">기존 등록 정보</div>
                  <div className="text-sm font-bold text-gray-800">{driverConflictPopup.existing.이름}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {driverConflictPopup.existing.차량번호} · {fmtPhone(driverConflictPopup.existing.전화번호)}
                  </div>
                </div>
              )}
              {/* 신규 입력 정보 */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="text-xs font-semibold text-blue-600 mb-1">
                  {driverConflictPopup.existing ? "새로 입력한 정보" : "신규 등록할 정보"}
                </div>
                <div className="text-sm font-bold text-gray-800">{driverConflictPopup.input.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {driverConflictPopup.input.plate} · {fmtPhone(driverConflictPopup.input.phone)}
                </div>
              </div>
            </div>

            <div className="px-5 pt-4 space-y-2">
              {/* 기존 기사가 있을 때: 3버튼 */}
              {driverConflictPopup.existing && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      style={{ touchAction: "manipulation" }}
                      className="py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold"
                      onClick={() => {
                        const d = driverConflictPopup.existing;
                        setCarNo(d.차량번호); setName(d.이름); setPhone(d.전화번호);
                        setDriverConflictPopup(null);
                      }}
                    >기존 정보 사용</button>
                    <button
                      style={{ touchAction: "manipulation" }}
                      className="py-3 rounded-xl bg-[#1B2B4B] text-white text-sm font-bold"
                      onClick={async () => {
                        const { plate, name: nm, phone: ph } = driverConflictPopup.input;
                        await upsertDriver({ 차량번호: plate, 이름: nm, 전화번호: ph });
                        setCarNo(plate); setName(nm); setPhone(fmtPhone(ph));
                        setDriverConflictPopup(null);
                        showToast("기사 정보를 덮어썼습니다");
                      }}
                    >기존 정보 덮어쓰기</button>
                  </div>
                  <button
                    style={{ touchAction: "manipulation" }}
                    className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold"
                    onClick={async () => {
                      const { plate, name: nm, phone: ph } = driverConflictPopup.input;
                      await upsertDriver({ 차량번호: plate, 이름: nm, 전화번호: ph });
                      setCarNo(plate); setName(nm); setPhone(fmtPhone(ph));
                      setDriverConflictPopup(null);
                      showToast(`신규 기사 등록: ${nm || plate}`);
                    }}
                  >신규 기사로 별도 등록</button>
                </>
              )}
              {/* 완전 신규: 2버튼 */}
              {!driverConflictPopup.existing && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    style={{ touchAction: "manipulation" }}
                    className="py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold"
                    onClick={() => setDriverConflictPopup(null)}
                  >취소</button>
                  <button
                    style={{ touchAction: "manipulation" }}
                    className="py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold"
                    onClick={async () => {
                      const { plate, name: nm, phone: ph } = driverConflictPopup.input;
                      await upsertDriver({ 차량번호: plate, 이름: nm, 전화번호: ph });
                      setCarNo(plate); setName(nm); setPhone(fmtPhone(ph));
                      setDriverConflictPopup(null);
                      showToast(`신규 기사 등록: ${nm || plate}`);
                    }}
                  >신규 기사 등록</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== 상세보기 운임 조회 모달 ===== */}
      {showDetailFareHistory && (
        <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: "rgba(15,25,50,0.97)" }}>
          <div className="flex-1 min-h-[56px]" onClick={() => setShowDetailFareHistory(false)} />
          <div className="relative bg-white rounded-t-3xl flex flex-col" style={{ maxHeight: "calc(100dvh - 56px)" }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-0 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="bg-[#1B2B4B] px-5 py-4 shrink-0 rounded-t-none">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-white font-bold text-[16px]">운임 조회 결과</div>
                  <div className="text-white/60 text-[11px] mt-0.5 flex flex-wrap gap-1 items-center">
                    {(() => {
                      const extractArea = (addr = "") => {
                        const s = String(addr).trim(); if (!s) return "";
                        const metros = ["서울","부산","인천","대구","대전","광주","울산","세종","제주"];
                        for (const c of metros) { if (s.startsWith(c)) return c; }
                        const parts = s.split(/\s+/);
                        if (parts.length >= 2) return parts[1].replace(/[시군구]$/, "");
                        return parts[0].replace(/[도시군구]$/, "") || "";
                      };
                      const pA = extractArea(order.상차지주소 || "");
                      const dA = extractArea(order.하차지주소 || "");
                      return (<>
                        {pA && <span>{pA}</span>}
                        {pA && dA && <span className="text-white/30">→</span>}
                        {dA && <span>{dA}</span>}
                        {(order.차종 || order.차량종류) && <><span className="text-white/30">·</span><span>{order.차종 || order.차량종류}</span></>}
                        {order.거래처명 && detailFareMatches.some(r => r.isClientMatch) && <><span className="text-white/30">·</span><span className="text-yellow-300">{order.거래처명}</span></>}
                      </>);
                    })()}
                  </div>
                </div>
                <button onClick={() => setShowDetailFareHistory(false)}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-lg shrink-0">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain" data-fare-scroll>
              {(() => {
                const getLabel = (r) => {
                  const ce = r.tags.includes("화물일치");
                  const cp = r.tags.includes("화물유사");
                  const te = r.tags.includes("톤수일치");
                  const re = r.tags.includes("지명일치") || r.tags.includes("거래처일치");
                  if (ce && te && re) return "완전일치";
                  if (ce || cp) return "부분일치";
                  if (te) return "톤수일치";
                  return "노선일치";
                };
                const counts = { "완전일치": 0, "부분일치": 0, "톤수일치": 0, "노선일치": 0 };
                detailFareMatches.forEach(r => { const l = getLabel(r); counts[l] = (counts[l] || 0) + 1; });
                const visibleMatches = detailFareFilter === "all"
                  ? detailFareMatches
                  : detailFareMatches.filter(r => getLabel(r) === detailFareFilter);
                const claims = visibleMatches.map(r => r.claim).filter(v => v > 0);
                const fareMin = claims.length ? Math.min(...claims) : 0;
                const fareMax = claims.length ? Math.max(...claims) : 0;
                const fareAvg = claims.length ? Math.round(claims.reduce((a,b)=>a+b,0)/claims.length) : 0;
                const fareRange = fareMax - fareMin || 1;
                const getBarPct = (f) => fareRange > 0 ? Math.min(100, Math.max(0, ((f - fareMin) / fareRange) * 100)) : 50;
                const tabs = ["all", "완전일치", "부분일치", "톤수일치", "노선일치"];

                if (detailFareMatches.length === 0) return (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <div className="text-sm">유사한 과거 이력이 없습니다</div>
                  </div>
                );

                return (
                  <>
                    {order.거래처명 && !detailFareMatches.some(r => r.isClientMatch) && (
                      <div className="mx-4 mt-3 mb-0 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span className="text-[11px] text-amber-700 font-semibold">{order.거래처명} 이력 없음 · 동일 노선 다른 거래처 이력</span>
                      </div>
                    )}
                    <div className="px-4 pt-3 pb-2 border-b border-gray-100">
                      <div className="flex gap-1.5 flex-wrap">
                        {tabs.map(t => {
                          const cnt = t === "all" ? detailFareMatches.length : (counts[t] || 0);
                          if (t !== "all" && cnt === 0) return null;
                          return (
                            <button key={t} onClick={() => setDetailFareFilter(t)}
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition ${detailFareFilter === t ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-200"}`}>
                              {t === "all" ? `전체 ${cnt}` : `${t} ${cnt}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {claims.length > 0 && (
                      <div className="px-5 py-4 border-b border-gray-100">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                          조회 운임 범위 ({visibleMatches.length}건)
                        </div>
                        <div className="flex items-baseline gap-2 mb-3">
                          <span className="text-[26px] font-black text-[#1B2B4B] leading-none">{fareMin.toLocaleString()}</span>
                          <span className="text-[16px] font-bold text-gray-300">~</span>
                          <span className="text-[26px] font-black text-[#1B2B4B] leading-none">{fareMax.toLocaleString()}</span>
                          <span className="text-[13px] font-semibold text-gray-400 mb-0.5">원</span>
                        </div>
                        <div className="relative h-2 bg-gray-100 rounded-full mb-1.5">
                          <div className="absolute inset-0 bg-gray-200 rounded-full" />
                          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#1B2B4B] border-2 border-white shadow-md z-10"
                            style={{ left: `calc(${getBarPct(fareAvg)}% - 6px)` }} />
                        </div>
                        <div className="flex justify-between text-[10px] font-semibold text-gray-400">
                          <span>최저 {fareMin.toLocaleString()}원</span>
                          <span className="text-[#1B2B4B] font-bold">평균 {fareAvg.toLocaleString()}원</span>
                          <span>최고 {fareMax.toLocaleString()}원</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          {[
                            { label: "최저 운임", value: fareMin },
                            { label: "평균 운임", value: fareAvg },
                            { label: "최고 운임", value: fareMax },
                          ].map(({ label, value }) => (
                            <button key={label}
                              onClick={() => goEditWithFare(value, null)}
                              className="rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-center active:scale-95 transition">
                              <div className="text-[9px] font-bold text-gray-400 mb-1">{label}</div>
                              <div className="text-[15px] font-extrabold text-[#1B2B4B]">{value.toLocaleString()}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="px-4 py-3 space-y-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-extrabold text-[#1B2B4B]">과거 운송 기록</span>
                        <span className="text-[11px] text-gray-400">노선일치 · 최신순</span>
                      </div>
                      {visibleMatches.map((r, i) => {
                        const o = r.order;
                        const ce = r.tags.includes("화물일치");
                        const cp = r.tags.includes("화물유사");
                        const te = r.tags.includes("톤수일치");
                        const re = r.tags.includes("지명일치") || r.tags.includes("거래처일치");
                        const tagLabel = (ce && te && re) ? "완전일치" : (ce || cp) ? "부분일치" : te ? "톤수일치" : "노선일치";
                        const tagColor = tagLabel === "완전일치" ? "bg-[#1B2B4B] text-white"
                          : tagLabel === "부분일치" ? "bg-emerald-600 text-white"
                          : tagLabel === "톤수일치" ? "bg-gray-600 text-white"
                          : "bg-blue-100 text-blue-700";
                        const fare = r.claim;
                        const barPct = getBarPct(fare);
                        const fareLevel = barPct <= 33 ? "저렴" : barPct <= 66 ? "보통" : "높음";
                        const fareLevelCls = barPct <= 33 ? "bg-emerald-600 text-white" : barPct <= 66 ? "bg-gray-600 text-white" : "bg-orange-600 text-white";
                        const isTop = i === 0;
                        return (
                          <div key={i} onClick={() => setDetailFareDetailItem(o)} className={`bg-white border rounded-2xl overflow-hidden shadow-sm cursor-pointer active:scale-[0.99] transition ${isTop ? "border-[#1B2B4B]/30" : "border-gray-200"}`}>
                            {isTop && (
                              <div className="bg-[#1B2B4B] px-4 py-1 flex items-center gap-1">
                                <span className="text-yellow-300 text-[10px] font-bold">최근 유사 운송</span>
                              </div>
                            )}
                            <div className="px-4 pt-3 pb-0">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tagColor}`}>{tagLabel}</span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${fareLevelCls}`}>{fareLevel}</span>
                                    <span className="text-[11px] text-gray-400">{o.상차일 || ""}</span>
                                  </div>
                                  <div className="text-[13px] font-bold text-gray-900 truncate">
                                    {o.상차지명 || "-"} → {o.하차지명 || "-"}
                                  </div>
                                  {(o.상차지주소 || o.하차지주소) && (
                                    <div className="text-[11px] text-gray-400 mt-0.5">
                                      {shortAddr(o.상차지주소)} → {shortAddr(o.하차지주소)}
                                    </div>
                                  )}
                                  {o.거래처명 && <div className="text-[11px] text-gray-500 mt-0.5">{o.거래처명}</div>}
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {o.화물내용 && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${ce ? "bg-orange-100 text-orange-700" : cp ? "bg-orange-50 text-orange-500" : "bg-gray-100 text-gray-500"}`}>
                                        {o.화물내용}
                                      </span>
                                    )}
                                    {o.톤수 && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${te ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                        {o.톤수}
                                      </span>
                                    )}
                                    {(o.차종 || o.차량종류) && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">{o.차종 || o.차량종류}</span>}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-[11px] text-gray-400">청구</div>
                                  <div className="text-[17px] font-extrabold text-[#1B2B4B]">{fare.toLocaleString()}원</div>
                                  <div className="text-[11px] text-gray-400 mt-0.5">기사 {r.drv.toLocaleString()}원</div>
                                </div>
                              </div>
                              {claims.length > 1 && (
                                <div className="relative h-1.5 bg-gray-100 rounded-full mb-2.5">
                                  <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#1B2B4B] border-2 border-white shadow"
                                    style={{ left: `calc(${barPct}% - 5px)` }} />
                                </div>
                              )}
                              {(o.이름 || o.기사명) && (
                                <div className="text-[11px] text-gray-400 mb-2">
                                  기사 <span className="text-gray-700 font-semibold">{o.이름 || o.기사명}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex border-t border-gray-100 mt-0">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); goEditWithFare(r.claim, null); }}
                                className="flex-1 py-2.5 bg-[#1B2B4B] text-white text-[12px] font-bold text-center active:opacity-80"
                              >
                                청구운임 적용 ({r.claim.toLocaleString()})
                              </button>
                              {r.drv > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); goEditWithFare(r.claim, r.drv); }}
                                  className="flex-1 py-2.5 bg-[#2d4a7a] text-white text-[12px] font-bold text-center active:opacity-80 border-l border-white/20"
                                >
                                  기사포함 ({r.drv.toLocaleString()})
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ===== 상세보기 운임 상세 팝업 ===== */}
      {detailFareDetailItem && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDetailFareDetailItem(null)} />
          <div className="relative bg-white rounded-t-3xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-0">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="bg-[#1B2B4B] px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="text-white font-bold text-[15px]">운송 이력 상세</div>
                <button onClick={() => setDetailFareDetailItem(null)}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-lg">×</button>
              </div>
              <div className="text-white/60 text-[11px] mt-1">{detailFareDetailItem.상차일 || ""}</div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {detailFareDetailItem.거래처명 && (
                <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                  <span className="text-[11px] text-gray-400 w-16 shrink-0">거래처</span>
                  <span className="text-[14px] font-bold text-[#1B2B4B]">{detailFareDetailItem.거래처명}</span>
                </div>
              )}
              <div className="space-y-2">
                <div className="flex gap-3">
                  <div className="flex-1 bg-blue-50 rounded-xl p-3">
                    <div className="text-[10px] font-bold text-blue-400 mb-1">상차지</div>
                    <div className="text-[13px] font-bold text-gray-900">{detailFareDetailItem.상차지명 || "-"}</div>
                    {detailFareDetailItem.상차지주소 && <div className="text-[11px] text-gray-500 mt-0.5">{detailFareDetailItem.상차지주소}</div>}
                  </div>
                  <div className="flex-1 bg-orange-50 rounded-xl p-3">
                    <div className="text-[10px] font-bold text-orange-400 mb-1">하차지</div>
                    <div className="text-[13px] font-bold text-gray-900">{detailFareDetailItem.하차지명 || "-"}</div>
                    {detailFareDetailItem.하차지주소 && <div className="text-[11px] text-gray-500 mt-0.5">{detailFareDetailItem.하차지주소}</div>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {detailFareDetailItem.화물내용 && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-[10px] font-bold text-gray-400 mb-1">화물</div>
                    <div className="text-[12px] font-semibold text-gray-800">{detailFareDetailItem.화물내용}</div>
                  </div>
                )}
                {(detailFareDetailItem.톤수 || detailFareDetailItem.차량톤수) && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-[10px] font-bold text-gray-400 mb-1">톤수</div>
                    <div className="text-[12px] font-semibold text-gray-800">{detailFareDetailItem.톤수 || detailFareDetailItem.차량톤수}</div>
                  </div>
                )}
                {(detailFareDetailItem.차종 || detailFareDetailItem.차량종류) && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-[10px] font-bold text-gray-400 mb-1">차종</div>
                    <div className="text-[12px] font-semibold text-gray-800">{detailFareDetailItem.차종 || detailFareDetailItem.차량종류}</div>
                  </div>
                )}
              </div>
              <div className="bg-[#1B2B4B] rounded-xl p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-white/50 text-[10px] mb-1">청구운임</div>
                    <div className="text-white font-extrabold text-[16px]">{Number(detailFareDetailItem.청구운임||0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-white/50 text-[10px] mb-1">기사운임</div>
                    <div className="text-white font-extrabold text-[16px]">{Number(detailFareDetailItem.기사운임||0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-white/50 text-[10px] mb-1">수수료</div>
                    <div className="text-white font-extrabold text-[16px]">{(Number(detailFareDetailItem.청구운임||0)-Number(detailFareDetailItem.기사운임||0)).toLocaleString()}</div>
                  </div>
                </div>
              </div>
              {(detailFareDetailItem.이름 || detailFareDetailItem.기사명) && (
                <div className="text-[12px] text-gray-500">기사 <span className="font-semibold text-gray-700">{detailFareDetailItem.이름 || detailFareDetailItem.기사명}</span></div>
              )}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => goEditWithFare(Number(detailFareDetailItem.청구운임||0), null)}
                  className="flex-1 py-3 bg-[#1B2B4B] text-white font-bold rounded-xl text-[13px] active:opacity-80"
                >
                  청구운임 적용<br/><span className="text-[11px] font-normal">{Number(detailFareDetailItem.청구운임||0).toLocaleString()}원</span>
                </button>
                {Number(detailFareDetailItem.기사운임||0) > 0 && (
                  <button
                    onClick={() => goEditWithFare(Number(detailFareDetailItem.청구운임||0), Number(detailFareDetailItem.기사운임||0))}
                    className="flex-1 py-3 bg-[#2d4a7a] text-white font-bold rounded-xl text-[13px] active:opacity-80"
                  >
                    기사포함 적용<br/><span className="text-[11px] font-normal">{Number(detailFareDetailItem.기사운임||0).toLocaleString()}원</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================= src/mobile/MobileApp.jsx (PART 3/3) =======================

// ======================================================================
// 스마트 오더 분석
// ======================================================================
function SmartOrderParser({ clients, onApply, onClose }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [parsing, setParsing] = useState(false);

  const normalize = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();

  const parseTime = (str) => {
    if (!str) return null;
    const ampm = str.match(/(오전|오후)\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/);
    if (ampm) {
      let h = parseInt(ampm[2]);
      const m = ampm[3] ? parseInt(ampm[3]) : 0;
      if (ampm[1] === "오후" && h < 12) h += 12;
      if (ampm[1] === "오전" && h === 12) h = 0;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    const plain = str.match(/(\d{1,2})시(?:\s*(\d{1,2})분)?/);
    if (plain) {
      const h = parseInt(plain[1]);
      const m = plain[2] ? parseInt(plain[2]) : 0;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    const colon = str.match(/(\d{1,2}):(\d{2})/);
    if (colon) {
      const h = parseInt(colon[1]), m = parseInt(colon[2]);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    return null;
  };

  const matchClientByAddress = (addr) => {
    const normAddr = normalize(addr);
    if (normAddr.length < 10) return null;
    let best = null, bestScore = 0;
    for (const c of clients) {
      const ca = normalize(c.주소 || "");
      if (ca.length < 8) continue;
      let score = 0;
      const minLen = Math.min(normAddr.length, ca.length);
      for (let i = 0; i < minLen; i++) {
        if (normAddr[i] === ca[i]) score++;
        else break;
      }
      if (score > bestScore && score >= 8) { bestScore = score; best = c; }
    }
    return best;
  };

  const matchClientByName = (name) => {
    if (!name || name.length < 2) return null;
    const n = normalize(name);
    return (
      clients.find(c => normalize(c.거래처명 || "") === n) ||
      clients.find(c => {
        const cn = normalize(c.거래처명 || "");
        return cn.length >= 2 && (n.includes(cn) || cn.includes(n));
      }) ||
      null
    );
  };

  const extractClientInfo = (section, textBlock) => {
    const addrPat = /(서울|부산|인천|대구|대전|광주|울산|세종|경기|강원|충북|충청북도|충남|충청남도|전북|전라북도|전남|전라남도|경북|경상북도|경남|경상남도|제주)[^\n]{5,60}/g;
    const addrs = [...textBlock.matchAll(addrPat)].map(m => m[0].trim());
    let client = addrs.length > 0 ? matchClientByAddress(addrs[0]) : null;

    if (!client) {
      const firstLine = section.split("\n")[0]
        .replace(/[1-9]?\s*(?:상차지?|하차지?)[:：\s]*/gi, "").trim();
      client = matchClientByName(firstLine);
    }

    const info = {};
    if (client) {
      info.name = client.거래처명;
      info.addr = client.주소 || (addrs[0] || "");
      // Match contact
      const phonePat = section.match(/01[0-9][-\s]?\d{3,4}[-\s]?\d{4}/);
      const contactWithTitle = section.match(/([가-힣]{2,4})\s*(?:주임|팀장|대리|과장|부장|담당|매니저|실장|이사|사원|직원)/);
      const contactWithPhone = section.match(/([가-힣]{2,4})\s+01[0-9]/);
      const contactPat = contactWithTitle || contactWithPhone;
      const contacts = Array.isArray(client.contacts) ? client.contacts : [];
      let contact = null;
      if (contactPat) contact = contacts.find(c => c.name && c.name.includes(contactPat[1]));
      if (!contact && contacts.length > 0) contact = contacts[0];
      if (contact) {
        info.contact = contact.name || "";
        info.contactPhone = contact.phone || (phonePat ? phonePat[0] : "");
      } else {
        if (contactPat) info.contact = contactPat[1];
        if (phonePat) info.contactPhone = phonePat[0];
      }
    } else {
      if (addrs[0]) info.addr = addrs[0];
      const firstLine = section.split("\n").map(l => l.trim()).find(l =>
        l.length >= 2 && l.length <= 20 && /[가-힣]/.test(l) && !/^(서울|부산|인천|대구|대전|광주|울산|세종|경기|강원|충|전|경|제주)/.test(l)
      ) || "";
      if (firstLine) info.name = firstLine;
      const phonePat = section.match(/01[0-9][-\s]?\d{3,4}[-\s]?\d{4}/);
      if (phonePat) info.contactPhone = phonePat[0];
      const contactWithTitle2 = section.match(/([가-힣]{2,4})\s*(?:주임|팀장|대리|과장|부장|담당|매니저|실장)/);
      const contactWithPhone2 = section.match(/([가-힣]{2,4})\s+01[0-9]/);
      const contact2 = contactWithTitle2 || contactWithPhone2;
      if (contact2) info.contact = contact2[1];
    }
    return info;
  };

  const parse = () => {
    if (!text.trim()) return;
    setParsing(true);
    setTimeout(() => {
      try {
        const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
        const res = {};

        // ── Date ──
        const datePat = text.match(/(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/);
        if (datePat) {
          const yr = datePat[1] ? parseInt(datePat[1]) : new Date().getFullYear();
          res.상차일 = `${yr}-${String(parseInt(datePat[2])).padStart(2,"0")}-${String(parseInt(datePat[3])).padStart(2,"0")}`;
        }

        // ── Times ──
        const pickupTimeRaw = text.match(/상차\s*시간?\s*[:：\s]\s*([^\n]+)/i);
        if (pickupTimeRaw) {
          const t = parseTime(pickupTimeRaw[1]);
          if (t) res.상차시간 = t;
        }
        // Fallback: look for bare 오전/오후 time in first section of text
        if (!res.상차시간) {
          const bare = text.split(/하차/i)[0].match(/(오전|오후)\s*(\d{1,2})시/);
          if (bare) { const t = parseTime(bare[0]); if (t) res.상차시간 = t; }
        }
        const dropTimeRaw = text.match(/하차\s*시간?\s*[:：\s]\s*([^\n]+)/i);
        if (dropTimeRaw) {
          const raw = dropTimeRaw[1];
          const isNextDay = /익일|다음\s*날/.test(raw);
          const t = parseTime(raw);
          if (t) {
            res.하차시간 = t;
            if (/이전/.test(raw)) res.하차시간기준 = "이전";
            if (isNextDay && res.상차일) {
              const d = new Date(res.상차일);
              d.setDate(d.getDate() + 1);
              res.하차일 = d.toISOString().slice(0, 10);
            }
          }
        }

        // ── Vehicle ──
        const vehicleMap = [
          { p: /냉동/, v: "냉동탑" },
          { p: /냉장/, v: "냉장탑" },
          { p: /윙바디|윙\s*바디/, v: "윙바디" },
          { p: /카고|일반/, v: "카고" },
        ];
        for (const { p, v } of vehicleMap) {
          if (p.test(text)) { res.차종 = v; break; }
        }

        // ── Loading/Unloading Method ──
        const methodList = ["직접수작업", "지게차", "크레인", "수도움", "수작업"];
        for (const m of methodList) {
          if (text.includes(m)) { res.상차방법 = m; res.하차방법 = m; break; }
        }

        // ── Weight / Ton ──
        const kgM = text.match(/([\d,]+(?:\.\d+)?)\s*(?:KG|kg|킬로)/);
        if (kgM) {
          res.톤수 = `${kgM[1].replace(/,/g, "")}kg`;
        } else {
          const tonM = text.match(/(\d+(?:\.\d+)?)\s*(?:톤|t\b)/i);
          if (tonM) res.톤수 = `${tonM[1]}톤`;
        }

        // ── Cargo ──
        const palletM = text.match(/(\d+)\s*(?:파레트|파렛트|팔레트|pallet)/i);
        if (palletM) {
          res.화물내용 = `${palletM[1]}파레트`;
        } else {
          const boxM = text.match(/(\d+)\s*(?:박스|box)/i);
          if (boxM) res.화물내용 = `${boxM[1]}박스`;
        }

        // ── Sections: split text at 상차 and 하차 markers ──
        // handles: "상차지", "1.상차지", "1)상차지", "1. 상차지:", etc.
        let pickupSection = "", dropSection = "";
        let inPickup = false, inDrop = false;
        for (const line of lines) {
          if (/^[1-9]?[.)]*\s*상차지?\s*[:：]?\s*$/.test(line) || /^[1-9]?[.)]*\s*상차지?\s*[:：]\s*/.test(line)) {
            inPickup = true; inDrop = false;
            pickupSection += line.replace(/^[1-9]?[.)]*\s*상차지?\s*[:：]?\s*/, "") + "\n";
          } else if (/^[1-9]?[.)]*\s*하차지?\s*[:：]?\s*$/.test(line) || /^[1-9]?[.)]*\s*하차지?\s*[:：]\s*/.test(line)) {
            inPickup = false; inDrop = true;
            dropSection += line.replace(/^[1-9]?[.)]*\s*하차지?\s*[:：]?\s*/, "") + "\n";
          } else if (inPickup) {
            pickupSection += line + "\n";
          } else if (inDrop) {
            dropSection += line + "\n";
          }
        }

        if (pickupSection) {
          const info = extractClientInfo(pickupSection, pickupSection);
          if (info.name) res.상차지명 = info.name;
          if (info.addr) res.상차지주소 = info.addr;
          if (info.contact) res.상차지담당자 = info.contact;
          if (info.contactPhone) res.상차지담당자번호 = info.contactPhone;
        }
        if (dropSection) {
          const info = extractClientInfo(dropSection, dropSection);
          if (info.name) res.하차지명 = info.name;
          if (info.addr) res.하차지주소 = info.addr;
          if (info.contact) res.하차지담당자 = info.contact;
          if (info.contactPhone) res.하차지담당자번호 = info.contactPhone;
        }

        // Fallback: "하차지: 순수본" pattern
        if (!res.하차지명) {
          const m = text.match(/(?:하차지|도착지|하차\s*장소)\s*[:：]\s*([^\n\s☎]+)/);
          if (m) {
            const c = matchClientByName(m[1]);
            res.하차지명 = c ? c.거래처명 : m[1].trim();
            if (c) res.하차지주소 = c.주소;
          }
        }

        setResult(res);
      } catch (e) {
        console.error(e);
      }
      setParsing(false);
    }, 300);
  };

  const FIELD_LABELS = {
    상차일: "상차일", 하차일: "하차일",
    상차시간: "상차시간", 하차시간: "하차시간", 하차시간기준: "하차기준",
    상차지명: "상차지", 상차지주소: "상차 주소",
    상차지담당자: "상차 담당자", 상차지담당자번호: "상차 연락처",
    하차지명: "하차지", 하차지주소: "하차 주소",
    하차지담당자: "하차 담당자", 하차지담당자번호: "하차 연락처",
    톤수: "톤수", 차종: "차종", 화물내용: "화물",
    상차방법: "상차방법", 하차방법: "하차방법",
  };

  const hasResult = result && Object.keys(result).length > 0;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: "rgba(15,25,50,0.97)" }}>
      <div className="flex-1 min-h-[56px]" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl flex flex-col" style={{ maxHeight: "calc(100dvh - 56px)" }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-0 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="bg-[#1B2B4B] px-5 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-bold text-[16px]">스마트 오더 분석</div>
              <div className="text-white/60 text-[11px] mt-0.5">오더 내용을 붙여넣으면 자동으로 입력합니다</div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-lg shrink-0">×</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4" data-fare-scroll>
          <textarea
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-[13px] text-gray-800 resize-none focus:outline-none focus:border-[#1B2B4B] bg-gray-50"
            rows={7}
            placeholder={"오더 내용을 그대로 붙여넣으세요\n\n예:\n1.상차지\n반찬단지 물류센터\n인천 서구 북항로 28-29\n상차시간: 16시\n\n하차지: 순수본\n전라북도 익산시 왕궁면 무왕로 2182\n중량: 400KG / 1파렛트\n냉장차량"}
            value={text}
            onChange={e => { setText(e.target.value); setResult(null); }}
          />
          <button
            onClick={parse}
            disabled={!text.trim() || parsing}
            className="w-full mt-3 py-3 rounded-2xl bg-[#1B2B4B] text-white text-[13px] font-bold active:opacity-80 disabled:opacity-40"
          >
            {parsing ? "분석 중..." : "분석하기"}
          </button>

          {hasResult && (
            <div className="mt-4 space-y-2">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">분석 결과</div>
              <div className="bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden">
                {Object.entries(result).map(([key, val], i) => (
                  <div key={key} className={`flex items-baseline gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-gray-100" : ""}`}>
                    <span className="text-[10px] font-bold text-gray-400 w-20 shrink-0">{FIELD_LABELS[key] || key}</span>
                    <span className="text-[13px] font-semibold text-gray-800 flex-1">{val}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { onApply(result); onClose(); }}
                className="w-full mt-2 py-3 rounded-2xl bg-emerald-600 text-white text-[13px] font-bold active:opacity-80"
              >
                폼에 적용하기
              </button>
            </div>
          )}

          {result && !hasResult && (
            <div className="mt-4 py-6 text-center text-gray-400 text-[13px]">
              분석된 정보가 없습니다. 상차지/하차지 구분이 포함된 텍스트를 입력해주세요.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ======================================================================
// 등록 폼
// ======================================================================
function MobileOrderForm({
  form,
  setForm,
  clients,
  onSave,
  setPage,
  showToast,
  drivers,
  upsertDriver,
  orders = [],
  cardVersionB = false,
}) {
    const handleSwapPickupDrop = () => {
    setForm((prev) => ({
      ...prev,

      상차지명: prev.하차지명,
      상차지주소: prev.하차지주소,
      상차지담당자: prev.하차지담당자,
      상차지담당자번호: prev.하차지담당자번호,
      상차시간: prev.하차시간,

      하차지명: prev.상차지명,
      하차지주소: prev.상차지주소,
      하차지담당자: prev.상차지담당자,
      하차지담당자번호: prev.상차지담당자번호,
      하차시간: prev.상차시간,
    }));
  };
  // 거래처 검색 state
const [clientQuery, setClientQuery] = useState("");
const [matchedClients, setMatchedClients] = useState([]);
  // 거래처 선택 후 '상차/하차에 어디로 적용할지' 선택 팝업용
  const [showClientApplyModal, setShowClientApplyModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  // 신규 거래처 등록 모달
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientForm, setNewClientForm] = useState({ 거래처명: "", 주소: "", 담당자: "", 담당자번호: "" });
  // 거래처 검색 결과 모달 (조회 버튼 → 바텀시트)
  const [showClientSearchModal, setShowClientSearchModal] = useState(false);
  const [clientSearchResults, setClientSearchResults] = useState([]);
  const [clientSearchQuery, setClientSearchQuery] = useState("");

// 🔍 거래처 검색 함수 (clients prop은 MobileApp에서 이미 places+clients 통합 전달됨)
const searchClient = (q) => {
  if (!q.trim()) {
    setMatchedClients([]);
    return;
  }

  const nq = normalizeCompany(q);

  const exact = [];
  const starts = [];
  const includes = [];

  clients.forEach((c) => {
    const nameRaw = c.거래처명 || "";
    const name = normalizeCompany(nameRaw);

    // 1️⃣ 완전 동일 (원문)
    if (nameRaw.trim() === q.trim()) {
      exact.push(c);
    }
    // 2️⃣ 정규화 동일
    else if (name === nq) {
      exact.push(c);
    }
    // 3️⃣ 시작일치
    else if (name.startsWith(nq)) {
      starts.push(c);
    }
    // 4️⃣ 포함
    else if (name.includes(nq)) {
      includes.push(c);
    }
  });

  const sorted = [...exact, ...starts, ...includes].slice(0, 10);

  setMatchedClients(sorted);
};
// 거래처 선택 시 거래처명만 반영하고 적용 위치 선택 팝업 표시
const chooseClient = (c) => {
  setMatchedClients([]);
  update("거래처명", c.거래처명);
  setSelectedClient(c);
  setShowClientApplyModal(true);
};

const [showNewDriver, setShowNewDriver] = useState(false);
const [showOrderCopyModal, setShowOrderCopyModal] = useState(false);
const [contactPopup, setContactPopup] = useState(null);
const [contactQueue, setContactQueue] = useState([]);
const [stopSheet, setStopSheet] = useState(null); // null | "pickup" | "drop"
const [stopList, setStopList] = useState([]);
const [stopDropOpen, setStopDropOpen] = useState(null); // idx of open dropdown

const STOP_TIMES = [
  "","즉시","오전 6시","오전 7시","오전 8시","오전 9시","오전 10시","오전 11시",
  "오후 12시","오후 1시","오후 2시","오후 3시","오후 4시","오후 5시","오후 6시","오후 7시","오후 8시",
];
const emptyStop = () => ({ 업체명:"", 주소:"", 담당자:"", 담당자번호:"", 메모:"", 화물내용:"", 화물타입:"", 톤수값:"", 톤수타입:"", 차량톤수:"", 상차시간:"", 하차시간:"" });

const openStopSheet = (type) => {
  const existing = validStops(type === "pickup" ? form.경유상차목록 : form.경유하차목록);
  setStopList(existing.length ? existing.map(s => ({ ...emptyStop(), ...s })) : [emptyStop()]);
  setStopSheet(type);
};

const saveStopSheet = () => {
  const key = stopSheet === "pickup" ? "경유상차목록" : "경유하차목록";
  const cleaned = stopList.map(s => {
    const cargoVal = s.화물내용 || "";
    const cargoType = s.화물타입 || "";
    const tonVal = s.톤수값 || "";
    const tonType = s.톤수타입 || "";
    return {
      ...s,
      화물내용: cargoType ? `${cargoVal}${cargoType}` : cargoVal,
      차량톤수: tonType ? `${tonVal}${tonType}` : tonVal,
    };
  }).filter(s => s.업체명?.trim() || s.주소?.trim());
  update(key, cleaned);
  setStopSheet(null);
};
const [showFareHistory, setShowFareHistory] = useState(false);
const [mobileFareFilter, setMobileFareFilter] = useState("all");
const [fareDetailItem, setFareDetailItem] = useState(null);
const [showSmartParser, setShowSmartParser] = useState(false);

useEffect(() => {
  if (showFareHistory) {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overscrollBehavior = "none";
    const preventPTR = (e) => {
      if (!e.target.closest("[data-fare-scroll]")) e.preventDefault();
    };
    document.addEventListener("touchmove", preventPTR, { passive: false });
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overscrollBehavior = "";
      document.body.style.overscrollBehavior = "";
      document.removeEventListener("touchmove", preventPTR);
    };
  } else {
    document.body.style.overflow = "";
    document.documentElement.style.overscrollBehavior = "";
    document.body.style.overscrollBehavior = "";
  }
}, [showFareHistory]);

// ── 주소에서 지역 키워드 추출 ──
const extractAreaFromAddr = (addr = "") => {
  const s = String(addr).trim();
  if (!s) return "";
  const metros = ["서울", "부산", "인천", "대구", "대전", "광주", "울산", "세종", "제주"];
  for (const city of metros) {
    if (s.startsWith(city)) return city;
  }
  const parts = s.split(/\s+/);
  if (parts.length >= 2) return parts[1].replace(/[시군구]$/, "");
  return parts[0].replace(/[도시군구]$/, "") || "";
};

// ── 스마트 운임 조회 매칭 (주소 노선 기반) ──
const fareMatches = useMemo(() => {
  if (!orders || orders.length === 0) return [];

  const ns = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();

  const pickupArea = extractAreaFromAddr(form.상차지주소 || "");
  const dropArea = extractAreaFromAddr(form.하차지주소 || "");
  if (!pickupArea && !dropArea) return [];

  const formVehicle = ns(form.차종 || "");
  const formClient = ns(form.거래처명 || "");
  const cargo = (form.화물내용 || "").trim();
  const ton = (form.톤수 || "").trim();

  const parseCargoQty = (s = "") => {
    const m = String(s).match(/(\d+(?:\.\d+)?)\s*(파레트|파렛트|팔레트|박스|통|pallet|box)/i);
    if (m) return { qty: parseFloat(m[1]), unit: m[2].replace(/팔레트|파렛트/g, "파레트") };
    const numOnly = String(s).match(/^(\d+(?:\.\d+)?)$/);
    if (numOnly) return { qty: parseFloat(numOnly[1]), unit: null };
    return null;
  };
  const cargoParsed = parseCargoQty(cargo);

  const areaMatch = (oAddr = "", area) => {
    if (!area) return true;
    const oArea = extractAreaFromAddr(oAddr);
    if (!oArea) return false;
    return ns(oArea).includes(ns(area)) || ns(area).includes(ns(oArea));
  };

  const candidates = [];

  orders.forEach(o => {
    if ((o.상차일 || "").slice(0, 10) === todayKST()) return;
    const claim = Number(o.청구운임 || 0);
    const drv = Number(o.기사운임 || 0);
    if (!claim && !drv) return;

    // 차종 필수 일치 (냉장/냉동 그룹핑)
    if (formVehicle) {
      const oVehicle = ns(o.차종 || o.차량종류 || "");
      const isCold = (v = "") => v.includes("냉장") || v.includes("냉동");
      const formIsCold = isCold(formVehicle);
      const oIsCold = isCold(oVehicle);
      if (formIsCold && !oIsCold) return;
      if (!formIsCold && oIsCold) return;
      if (!formIsCold && !oIsCold && !oVehicle.includes(formVehicle) && !formVehicle.includes(oVehicle)) return;
    }

    // 노선 지역 필수 일치
    const pickMatch = pickupArea ? areaMatch(o.상차지주소 || "", pickupArea) : true;
    const dropMatch = dropArea ? areaMatch(o.하차지주소 || "", dropArea) : true;
    if (!pickMatch || !dropMatch) return;

    let score = 50;
    const tags = ["경로일치"];

    // 거래처 일치 → 1순위 부스트
    const oClient = ns(o.거래처명 || "");
    const isClientMatch = formClient && oClient === formClient;
    if (isClientMatch) { score += 100; tags.push("거래처일치"); }

    // 화물내용 (최대 30pt)
    if (cargo) {
      const oCargoParsed = parseCargoQty(o.화물내용 || "");
      const normCargo = ns(cargo);
      const normOCargo = ns(o.화물내용 || "");
      if (normOCargo === normCargo) { score += 30; tags.push("화물일치"); }
      else if (cargoParsed && oCargoParsed) {
        const sameUnit = (!cargoParsed.unit && !oCargoParsed.unit) ||
          (cargoParsed.unit && oCargoParsed.unit && ns(cargoParsed.unit) === ns(oCargoParsed.unit));
        if (sameUnit) {
          const diff = Math.abs(cargoParsed.qty - oCargoParsed.qty);
          const pct = cargoParsed.qty > 0 ? diff / cargoParsed.qty : 1;
          if (diff === 0) { score += 30; tags.push("화물일치"); }
          else if (diff <= 1) { score += 22; tags.push("화물유사"); }
          else if (diff <= 2 || pct <= 0.2) { score += 15; tags.push("화물유사"); }
          else if (pct <= 0.4) { score += 8; tags.push("화물근사"); }
        } else if (cargoParsed.unit && oCargoParsed.unit) { score += 5; }
      } else if (normOCargo.includes(ns(cargo.replace(/\d+/g, "")))) { score += 8; }
    }

    // 상/하차지명 일치 보너스 (최대 20pt) — 같은 노선이 먼저 오도록
    const formPickupName = ns(form.상차지명 || "");
    const formDropName = ns(form.하차지명 || "");
    const pickNameMatch = formPickupName && ns(o.상차지명 || "").includes(formPickupName);
    const dropNameMatch = formDropName && ns(o.하차지명 || "").includes(formDropName);
    if (pickNameMatch) score += 10;
    if (dropNameMatch) score += 10;
    if (pickNameMatch && dropNameMatch) tags.push("지명일치");

    // 톤수 (최대 15pt)
    const oTon = o.톤수 || o.차량톤수 || "";
    if (ton && oTon) {
      if (ns(oTon) === ns(ton)) { score += 15; tags.push("톤수일치"); }
      else {
        const tn = parseFloat(ton); const otn = parseFloat(oTon);
        if (!isNaN(tn) && !isNaN(otn) && Math.abs(tn - otn) / (tn || 1) <= 0.1) score += 8;
      }
    }

    candidates.push({ order: o, score, tags, dateStr: o.상차일 || "", claim, drv, isClientMatch });
  });

  if (candidates.length === 0) return [];

  // 거래처 일치 이력이 있으면 1순위만, 없으면 전체
  const tier1 = formClient ? candidates.filter(c => c.isClientMatch) : [];
  const finalList = tier1.length > 0 ? tier1 : candidates;

  finalList.sort((a, b) => b.score !== a.score ? b.score - a.score : b.dateStr.localeCompare(a.dateStr));
  return finalList.slice(0, 50);
}, [orders, form.상차지주소, form.하차지주소, form.상차지명, form.하차지명, form.차종, form.거래처명, form.화물내용, form.톤수]);

const openContactPopup = (items) => {
  if (!items || items.length === 0) return;
  const [first, ...rest] = items;
  setContactQueue(rest);
  setContactPopup(first);
};

useEffect(() => {
  if (form._pendingContactItems && form._pendingContactItems.length > 0) {
    openContactPopup(form._pendingContactItems);
    setForm(prev => ({ ...prev, _pendingContactItems: [] }));
  }
}, []);

const closeContactPopup = (selected) => {
  if (selected && contactPopup) {
    if (contactPopup.type === "pickup") {
      update("상차지담당자", selected.name || "");
      update("상차지담당자번호", selected.phone || "");
    } else {
      update("하차지담당자", selected.name || "");
      update("하차지담당자번호", selected.phone || "");
    }
  }
  setContactPopup(null);
  if (contactQueue.length > 0) {
    const [next, ...rest] = contactQueue;
    setContactQueue(rest);
    setTimeout(() => setContactPopup(next), 80);
  }
};
const [formSmartMatched, setFormSmartMatched] = useState([]);
const formSmartRef = useRef(null);
const handleFormSmartSearch = (val) => {
  if (!val.trim()) { setFormSmartMatched([]); setShowNewDriver(false); update("차량번호", ""); update("기사명", ""); update("전화번호", ""); return; }
  const nd = (s = "") => String(s).replace(/[-.\s]/g, "").toLowerCase();
  const { plate, phone, name } = parseDriverText(val);

  // 1️⃣ 차량번호 우선
  if (plate) {
    const results = (drivers || []).filter(d => nd(d.차량번호) === nd(plate));
    if (results.length === 0) {
      // 신규: 드롭다운에 "신규기사" 항목으로 표시
      setFormSmartMatched([{ 차량번호: plate, 이름: name || "", 전화번호: phone || "", _isNew: true }]);
    } else {
      setFormSmartMatched(results.slice(0, 5));
    }
    return;
  }

  // 2️⃣ 전화번호로 검색
  if (phone) {
    const results = (drivers || []).filter(d => nd(d.전화번호) === nd(phone));
    if (results.length === 0) {
      setFormSmartMatched([{ 차량번호: "", 이름: name || "", 전화번호: phone, _isNew: true }]);
    } else {
      setFormSmartMatched(results.slice(0, 5));
    }
    return;
  }

  // 3️⃣ 이름으로 검색
  if (name.length >= 2) {
    const results = (drivers || []).filter(d => d.이름 && d.이름.includes(name));
    setFormSmartMatched(results.slice(0, 5));
    return;
  }

  setFormSmartMatched([]);
};
const [orderCopySearch, setOrderCopySearch] = useState("");
const [orderCopySearchField, setOrderCopySearchField] = useState("all"); // 이 줄을 추가합니다.

// 톤수 분리 state
  const [톤수값, set톤수값] = useState(() => {
    return String(form.톤수||"").replace(/톤|kg/gi,"").trim();
  });
  const [톤수타입, set톤수타입] = useState(() => {
    if ((form.톤수||"").includes("kg")) return "kg";
    if ((form.톤수||"").includes("톤")) return "톤";
    return "";
  });
 // 화물내용 분리 state
  const CARGO_TYPES = ["파레트","박스","통"];

  const detectCargoType = (raw = "") => {
    const s = raw.toLowerCase().replace(/\s+/g, "");
    // 파레트 계열
    if (/파렛|파레트|파레|파|plt|p$/.test(s)) return "파레트";
    // 박스
    if (/박스|box/.test(s)) return "박스";
    // 통
    if (/통$/.test(s)) return "통";
    return "";
  };

  const detectCargoNum = (raw = "") => {
    const type = detectCargoType(raw);
    if (!type) return raw; // 타입 없으면 전체 텍스트 그대로
    // 숫자+타입키워드 패턴에서 숫자만 추출
    const m = raw.match(/^(\d+)/);
    return m ? m[1] : raw.replace(/(파렛|파레트|파레|파|plt|p|박스|box|통)/gi, "").trim();
  };

  const [화물수량, set화물수량] = useState(() => detectCargoNum(form.화물내용||""));
  const [화물타입, set화물타입] = useState(() => detectCargoType(form.화물내용||""));

  // Sync split local state when form values change from outside (e.g. SmartOrderParser apply)
  useEffect(() => {
    const t = String(form.톤수 || "");
    set톤수값(t.replace(/톤|kg/gi, "").trim());
    set톤수타입(t.includes("kg") ? "kg" : t.includes("톤") ? "톤" : "");
  }, [form.톤수]);
  useEffect(() => {
    set화물수량(detectCargoNum(form.화물내용 || ""));
    set화물타입(detectCargoType(form.화물내용 || ""));
  }, [form.화물내용]);

  const update = (key, value) =>
    setForm((p) => ({ ...p, [key]: value }));

  const updateMoney = (key, value) =>
    
    setForm((p) => {
      const next = { ...p, [key]: toNumber(value) };
      if (key === "청구운임" || key === "기사운임") {
        const 청구 = toNumber(next.청구운임);
        const 기사 = toNumber(next.기사운임);
        next.수수료 = 청구 - 기사;
      }
      return next;
    });

  const [queryPickup, setQueryPickup] = useState("");
  const [queryDrop, setQueryDrop] = useState("");
  const [showPickupList, setShowPickupList] = useState(false);
  const [showDropList, setShowDropList] = useState(false);

  const norm = (s = "") =>
    String(s).toLowerCase().replace(/\s+/g, "");

const pickupOptions = useMemo(() => {
  const base = queryPickup || form.상차지명;
  if (!base) return [];

  const nq = normalizeCompany(base);

  const exact = [];
  const starts = [];
  const includes = [];
  const addrMatch = [];

  clients.forEach((c) => {
    const nameRaw = c.거래처명 || "";
    const name = normalizeCompany(nameRaw);
    const addr = normalizeCompany(c.주소 || "");

    if (nameRaw.trim() === base.trim()) {
      exact.push(c);
    } else if (name === nq) {
      exact.push(c);
    } else if (name.startsWith(nq)) {
      starts.push(c);
    } else if (name.includes(nq)) {
      includes.push(c);
    } else if (addr.includes(nq)) {
      addrMatch.push(c);
    }
  });

  return [...exact, ...starts, ...includes, ...addrMatch].slice(0, 10);

}, [clients, queryPickup, form.상차지명]);
const dropOptions = useMemo(() => {
  if (!queryDrop) return [];

  const nq = normalizeCompany(queryDrop);

  const exact = [];
  const starts = [];
  const includes = [];
  const addrMatch = [];

  clients.forEach((c) => {
    const nameRaw = c.거래처명 || "";
    const name = normalizeCompany(nameRaw);
    const addr = normalizeCompany(c.주소 || "");

    if (nameRaw.trim() === queryDrop.trim()) {
      exact.push(c);
    } else if (name === nq) {
      exact.push(c);
    } else if (name.startsWith(nq)) {
      starts.push(c);
    } else if (name.includes(nq)) {
      includes.push(c);
    } else if (addr.includes(nq)) {
      addrMatch.push(c);
    }
  });

  return [...exact, ...starts, ...includes, ...addrMatch].slice(0, 10);

}, [clients, queryDrop]);

const pickPickup = (c) => {
    update("거래처명", c.거래처명 || "");
    update("상차지명", c.거래처명 || "");
    update("상차지주소", c.주소 || "");

    const contacts = (Array.isArray(c.contacts) ? c.contacts : []).filter(ct => ct.name?.trim());
    const unique = [...new Map(contacts.map(ct => [ct.name.trim(), ct])).values()];
    const primary = unique.find(ct => ct.isPrimary) || unique[0] || null;
    update("상차지담당자", primary?.name || c.담당자 || "");
    update("상차지담당자번호", primary?.phone || c.담당자번호 || "");

    setQueryPickup("");
    setShowPickupList(false);

    if (unique.length > 1) {
      openContactPopup([{ type: "pickup", place: c, contacts: unique }]);
    }
};
const pickDrop = (c) => {
  update("하차지명", c.거래처명 || c.하차지명 || "");
  update("하차지주소", c.주소 || c.하차지주소 || c.상차지주소 || "");

  const contacts = (Array.isArray(c.contacts) ? c.contacts : []).filter(ct => ct.name?.trim());
  const unique = [...new Map(contacts.map(ct => [ct.name.trim(), ct])).values()];
  const primary = unique.find(ct => ct.isPrimary) || unique[0] || null;
  update("하차지담당자", primary?.name || c.담당자 || "");
  update("하차지담당자번호", primary?.phone || c.담당자번호 || "");

  setQueryDrop("");
  setShowDropList(false);

  if (unique.length > 1) {
    openContactPopup([{ type: "drop", place: c, contacts: unique }]);
  }
};

  // ===== 음성 오더 등록 =====
  const [voiceSheet, setVoiceSheet] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceParsed, setVoiceParsed] = useState(null);
  const voiceRecogRef = useRef(null);

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("이 기기에서 음성인식을 지원하지 않습니다."); return; }
    const recog = new SR();
    recog.lang = "ko-KR";
    recog.interimResults = true;
    recog.maxAlternatives = 1;
    recog.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join("");
      setVoiceTranscript(t);
    };
    recog.onend = () => setVoiceListening(false);
    recog.onerror = () => setVoiceListening(false);
    voiceRecogRef.current = recog;
    recog.start();
    setVoiceListening(true);
  };

  const stopVoice = () => {
    voiceRecogRef.current?.stop();
    setVoiceListening(false);
  };

  const parseVoiceOrder = (text) => {
    const res = {};
    const t = text;

    // 날짜
    const todayDate = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    if (/모레/.test(t)) { const d = new Date(todayDate); d.setDate(d.getDate()+2); res.상차일 = fmt(d); }
    else if (/내일/.test(t)) { const d = new Date(todayDate); d.setDate(d.getDate()+1); res.상차일 = fmt(d); }
    else if (/오늘/.test(t)) res.상차일 = fmt(todayDate);
    const dm = t.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (dm) res.상차일 = `${todayDate.getFullYear()}-${dm[1].padStart(2,"0")}-${dm[2].padStart(2,"0")}`;

    // 시간
    const tm = t.match(/(오전|오후)\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/);
    if (tm) {
      let h = parseInt(tm[2]), mn = parseInt(tm[3]||"0");
      if (tm[1]==="오후" && h!==12) h+=12;
      if (tm[1]==="오전" && h===12) h=0;
      res.상차시간 = `${String(h).padStart(2,"0")}:${String(mn).padStart(2,"0")}`;
    }
    if (/즉시/.test(t)) res.상차시간 = "즉시";

    // 화물내용 + 타입
    const cargo = t.match(/(\d+)\s*(파레트|파렛트|팔레트|박스|통|롤|개)/);
    if (cargo) {
      res.화물내용 = cargo[1];
      const typeMap = { "파렛트": "파레트", "팔레트": "파레트" };
      res.화물타입 = typeMap[cargo[2]] || (["박스","통","롤"].includes(cargo[2]) ? cargo[2] : "파레트");
    }

    // 톤수
    const ton = t.match(/(\d+(?:\.\d+)?)\s*톤/);
    if (ton) res.톤수 = ton[1] + "톤";
    const kg = t.match(/(\d+)\s*킬로/);
    if (kg) res.톤수 = kg[1] + "kg";

    // 차량종류
    if (/냉동/.test(t)) res.차종 = "냉동";
    else if (/냉장/.test(t)) res.차종 = "냉장";
    else if (/윙/.test(t)) res.차종 = "윙바디";
    else if (/카고/.test(t)) res.차종 = "카고";

    // 업체명 - "에서"/"로"/"까지" 앞의 단어로 추출
    const pickupM = t.match(/(.{2,10}?)\s*에서/);
    if (pickupM) res.상차지명_후보 = pickupM[1].trim();
    const dropM = t.match(/(.{2,10}?)\s*(?:로|까지|으로)\s*(?:배달|배송|운송|가져)/);
    if (dropM) res.하차지명_후보 = dropM[1].trim();

    // 거래처 매칭
    if (res.상차지명_후보) {
      const nq = normalizeCompany(res.상차지명_후보);
      const found = clients.find(c => normalizeCompany(c.거래처명).includes(nq));
      if (found) { res.상차지명 = found.거래처명; res.상차지주소 = found.주소||""; }
      else res.상차지명 = res.상차지명_후보;
    }
    if (res.하차지명_후보) {
      const nq = normalizeCompany(res.하차지명_후보);
      const found = clients.find(c => normalizeCompany(c.거래처명).includes(nq));
      if (found) { res.하차지명 = found.거래처명; res.하차지주소 = found.주소||""; }
      else res.하차지명 = res.하차지명_후보;
    }
    delete res.상차지명_후보; delete res.하차지명_후보;
    return res;
  };

  const applyVoiceParsed = () => {
    if (!voiceParsed) return;
    const p = voiceParsed;
    if (p.상차일) update("상차일", p.상차일);
    if (p.상차시간) update("상차시간", p.상차시간);
    if (p.상차지명) update("상차지명", p.상차지명);
    if (p.상차지주소) update("상차지주소", p.상차지주소);
    if (p.하차지명) update("하차지명", p.하차지명);
    if (p.하차지주소) update("하차지주소", p.하차지주소);
    if (p.화물내용) update("화물내용", p.화물내용);
    if (p.화물타입) update("화물타입", p.화물타입);
    if (p.톤수) update("톤수", p.톤수);
    if (p.차종) update("차종", p.차종);
    setVoiceSheet(false);
    setVoiceTranscript("");
    setVoiceParsed(null);
  };

  return (
    <div className="px-4 py-3 space-y-3">
      {/* 음성 등록 버튼 */}
      {(window.SpeechRecognition || window.webkitSpeechRecognition) && (
        <button
          type="button"
          onClick={() => { setVoiceSheet(true); setVoiceTranscript(""); setVoiceParsed(null); }}
          className="w-full py-3 rounded-xl border-2 border-dashed border-[#1B2B4B]/40 bg-white flex items-center justify-center gap-2 text-[#1B2B4B] font-semibold text-sm active:bg-gray-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          음성으로 입력
        </button>
      )}

      {/* 스마트 분석 버튼 */}
      <button
        type="button"
        onClick={() => setShowSmartParser(true)}
        className="w-full mb-4 py-2.5 rounded-2xl border border-gray-200 bg-white text-[12px] font-semibold text-gray-600 flex items-center justify-center gap-2 active:bg-gray-50"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
        스마트 오더 분석
      </button>

      {/* 총운임 / 산재 */}
      <div className="grid grid-cols-2 border rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="border-r px-3 py-2">
          <div className="text-xs text-gray-500 mb-1">
            총운임(청구운임)
          </div>
          <div className="text-base font-semibold">
            {fmtMoney(form.청구운임)}
          </div>
        </div>
        <div className="px-3 py-2">
          <div className="text-xs text-gray-500 mb-1">
            산재보험료
          </div>
          <input
            className="w-full border rounded px-2 py-1 text-right text-sm"
            value={form.산재보험료 || ""}
            onChange={(e) =>
              updateMoney("산재보험료", e.target.value)
            }
          />
        </div>
      </div>

      {/* 상차/하차 일시 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
  label="상차일시"
  input={
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5 min-w-0">
        <input
          type="date"
          className="flex-1 min-w-[100px] border rounded px-2 py-1 text-sm"
          value={form.상차일}
          onChange={(e) => update("상차일", e.target.value)}
        />
        <select
          className="flex-1 min-w-[90px] border rounded px-1 py-1 text-sm"
          value={form.상차시간}
          onChange={(e) => update("상차시간", e.target.value)}
        >
          <option value="">상차시간</option>
          {HALF_HOUR_TIMES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      {form.상차시간 && (
        <div className="flex gap-1.5">
          {["이전", "이후"].map(v => (
            <button
              key={v}
              type="button"
              onClick={() => update("상차시간기준", form.상차시간기준 === v ? null : v)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${
                form.상차시간기준 === v
                  ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
                  : "bg-white text-[#1B2B4B] border-[#1B2B4B]/40"
              }`}
            >{v}</button>
          ))}
        </div>
      )}
    </div>
  }
/>

<RowLabelInput
  label="하차일시"
  input={
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5 min-w-0">
        <input
          type="date"
          className="flex-1 min-w-[100px] border rounded px-2 py-1 text-sm"
          value={form.하차일}
          onChange={(e) => update("하차일", e.target.value)}
        />
        <select
          className="flex-1 min-w-[90px] border rounded px-1 py-1 text-sm"
          value={form.하차시간}
          onChange={(e) => update("하차시간", e.target.value)}
        >
          <option value="">하차시간</option>
          {HALF_HOUR_TIMES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      {form.하차시간 && (
        <div className="flex gap-1.5">
          {["이전", "이후"].map(v => (
            <button
              key={v}
              type="button"
              onClick={() => update("하차시간기준", form.하차시간기준 === v ? null : v)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${
                form.하차시간기준 === v
                  ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
                  : "bg-white text-[#1B2B4B] border-[#1B2B4B]/40"
              }`}
            >{v}</button>
          ))}
        </div>
      )}
    </div>
  }
/>

      </div>

      {/* 거래처명 */}
<div className="bg-white rounded-lg border shadow-sm px-3 py-2">
  <div className="text-[11px] text-gray-500 mb-1">거래처명</div>
  <div className="flex gap-2">
    <div className="relative flex-1 min-w-0">
      <input
        className="w-full border rounded px-2 py-1.5 text-[13px]"
        value={form.거래처명}
        onChange={(e) => {
          const val = e.target.value;
          update("거래처명", val);
          setClientQuery(val);
          if (!val.trim()) { setMatchedClients([]); return; }
          searchClient(val);
        }}
        onFocus={() => {
          if (form.거래처명.trim()) searchClient(form.거래처명);
        }}
        onBlur={() => setTimeout(() => setMatchedClients([]), 200)}
        placeholder="거래처명 입력"
      />
      {/* 실시간 자동완성 드롭다운 */}
      {matchedClients.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-50 max-h-44 overflow-auto">
          {matchedClients.map((c) => (
            <li
              key={c.id || c.거래처명}
              className="px-3 py-2 active:bg-gray-100 cursor-pointer text-[13px] border-b last:border-b-0"
              onMouseDown={(e) => { e.preventDefault(); chooseClient(c); }}
            >
              <div className="font-semibold text-gray-800">{c.거래처명}</div>
              {c.주소 && <div className="text-[11px] text-gray-400">{c.주소}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
    <button
      type="button"
      className={`shrink-0 px-3 py-1.5 rounded text-[13px] font-medium ${
        cardVersionB
          ? "bg-[#1B2B4B] text-white"
          : "border border-[#1B2B4B] text-[#1B2B4B] bg-white"
      }`}
      onClick={() => {
        const q = form.거래처명.trim();
        const nq = normalizeCompany(q || "");
        const results = q
          ? (() => {
              const exact = [], starts = [], includes = [];
              clients.forEach((c) => {
                const n = normalizeCompany(c.거래처명 || "");
                if (n === nq) exact.push(c);
                else if (n.startsWith(nq)) starts.push(c);
                else if (n.includes(nq)) includes.push(c);
              });
              return [...exact, ...starts, ...includes].slice(0, 20);
            })()
          : [];
        setClientSearchQuery(q);
        setClientSearchResults(results);
        setShowClientSearchModal(true);
      }}
    >
      조회
    </button>
  </div>
</div>


{/* 오더 복사 버튼 */}
      <button
        type="button"
        onClick={() => { setOrderCopySearch(""); setShowOrderCopyModal(true); }}
        className="w-full py-2.5 rounded-xl border-2 border-dashed border-[#1B2B4B]/30 text-[#1B2B4B] text-[13px] font-semibold hover:bg-[#1B2B4B]/5 transition"
      >
        기존 오더 불러오기
      </button>

      {/* 상차/하차 + 주소 + 자동완성 */}
<div className="bg-white rounded-lg border shadow-sm p-3 space-y-3">

  {/* 🔵 상차지 */}
  <RowLabelInput
    label="상차지"
      right={
    <button
      type="button"
      onClick={handleSwapPickupDrop}
      className="ml-1 w-6 h-6 rounded-full bg-blue-50 border border-blue-300 text-blue-600 flex items-center justify-center text-[11px] active:scale-95"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
    </button>
  }
    input={
      <div className="space-y-1">

        {/* 상차지명 + 드롭다운 전용 */}
        <div className="relative">
          <input
            className="w-full border rounded px-2 py-1 text-sm"
            value={form.상차지명}
            onChange={(e) => {
              const val = e.target.value;
              update("상차지명", val);
              setQueryPickup(val);
              setShowPickupList(true);

              if (!val.trim()) {
                update("상차지주소", "");
                update("상차지담당자", "");
                update("상차지담당자번호", "");
                return;
              }

              const normVal = normalizeCompany(val);
              const found = clients.find(
                (c) => normalizeCompany(c.거래처명) === normVal
              );

              if (found) {
  update("상차지주소", found.주소 || "");

  // ★ contacts 배열 우선, 없으면 담당자 직접 필드
  const contacts = Array.isArray(found.contacts) ? found.contacts : [];
  const primary = contacts.find(c => c.isPrimary) || contacts[0] || null;

  update("상차지담당자", primary?.name || found.담당자 || "");
  update("상차지담당자번호", primary?.phone || found.담당자번호 || "");
}

            }}
            onFocus={() => {
              if (form.상차지명) setShowPickupList(true);
            }}
            onBlur={() => setTimeout(() => setShowPickupList(false), 150)}
          />

          {showPickupList && pickupOptions.length > 0 && (
            <div className="absolute z-50 w-full bg-white border rounded shadow max-h-40 overflow-y-auto text-xs">
              {pickupOptions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full text-left px-2 py-1 hover:bg-gray-100"
                  onClick={() => pickPickup(c)}
                >
                  <div className="font-semibold">
                    {c.거래처명 || c.상호 || "-"}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {c.주소 || ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          className="w-full border rounded px-2 py-1 text-xs"
          placeholder="상차지 주소"
          value={form.상차지주소}
          onChange={(e) =>
            update("상차지주소", e.target.value)
          }
        />

        <input
          className="w-full border rounded px-2 py-1 text-xs"
          placeholder="상차지 담당자"
          value={form.상차지담당자 || ""}
          onChange={(e) =>
            update("상차지담당자", e.target.value)
          }
        />

        <input
          className="w-full border rounded px-2 py-1 text-xs"
          placeholder="상차지 담당자번호"
          value={form.상차지담당자번호 || ""}
          onChange={(e) =>
            update("상차지담당자번호", e.target.value)
          }
        />

        {/* 경유 상차지 버튼 + 미리보기 */}
        {(() => {
          const stops = validStops(form.경유상차목록);
          return (
            <div>
              <button
                type="button"
                onClick={() => openStopSheet("pickup")}
                className={`text-[11px] font-bold px-3 py-1 rounded-full border transition ${
                  stops.length > 0
                    ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
                    : "bg-white text-[#1B2B4B] border-[#1B2B4B]"
                }`}
              >
                {stops.length > 0 ? `경유 상차 ${stops.length}곳` : "+ 경유 상차지"}
              </button>
              {stops.map((s, i) => (
                <div key={i} className="mt-1 pl-3 border-l-2 border-dashed border-blue-300">
                  <div className="text-[11px] font-bold text-blue-700">경유상차 {i+1}: {s.업체명}</div>
                  {s.주소 && <div className="text-[10px] text-gray-400">{s.주소}</div>}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    }
  />
  {/* 하차지 */}
  <RowLabelInput
    label="하차지"
    input={
      <div className="space-y-1">

        {/* 하차지명 + 드롭다운 전용 */}
        <div className="relative">
          <input
            className="w-full border rounded px-2 py-1 text-sm"
            value={form.하차지명}
            onChange={(e) => {
              const val = e.target.value;
              update("하차지명", val);
              setQueryDrop(val);
              setShowDropList(true);

              if (!val.trim()) {
                update("하차지주소", "");
                update("하차지담당자", "");
                update("하차지담당자번호", "");
                return;
              }

              const normVal = normalizeCompany(val);
              const found = clients.find(
                (c) => normalizeCompany(c.거래처명) === normVal
              );

              if (found) {
  update(
    "하차지주소",
    found.주소 ||
      found.하차지주소 ||
      found.상차지주소 ||
      ""
  );

  // ★ contacts 배열 우선, 없으면 담당자 직접 필드
  const contacts = Array.isArray(found.contacts) ? found.contacts : [];
  const primary = contacts.find(c => c.isPrimary) || contacts[0] || null;

  update("하차지담당자", primary?.name || found.담당자 || "");
  update("하차지담당자번호", primary?.phone || found.담당자번호 || "");
}

            }}
            onFocus={() => {
              if (form.하차지명) setShowDropList(true);
            }}
            onBlur={() => setTimeout(() => setShowDropList(false), 150)}
          />

          {showDropList && dropOptions.length > 0 && (
            <div className="absolute z-50 w-full bg-white border rounded shadow max-h-40 overflow-y-auto text-xs">
              {dropOptions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full text-left px-2 py-1 hover:bg-gray-100"
                  onClick={() => pickDrop(c)}
                >
                  <div className="font-semibold">
                    {c.거래처명 || c.상호 || "-"}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {c.주소 || ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          className="w-full border rounded px-2 py-1 text-xs"
          placeholder="하차지 주소"
          value={form.하차지주소}
          onChange={(e) =>
            update("하차지주소", e.target.value)
          }
        />

        <input
          className="w-full border rounded px-2 py-1 text-xs"
          placeholder="하차지 담당자"
          value={form.하차지담당자 || ""}
          onChange={(e) =>
            update("하차지담당자", e.target.value)
          }
        />

        <input
          className="w-full border rounded px-2 py-1 text-xs"
          placeholder="하차지 담당자번호"
          value={form.하차지담당자번호 || ""}
          onChange={(e) =>
            update("하차지담당자번호", e.target.value)
          }
        />

        {/* 경유 하차지 버튼 + 미리보기 */}
        {(() => {
          const stops = validStops(form.경유하차목록);
          return (
            <div>
              <button
                type="button"
                onClick={() => openStopSheet("drop")}
                className={`text-[11px] font-bold px-3 py-1 rounded-full border transition ${
                  stops.length > 0
                    ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
                    : "bg-white text-[#1B2B4B] border-[#1B2B4B]"
                }`}
              >
                {stops.length > 0 ? `경유 하차 ${stops.length}곳` : "+ 경유 하차지"}
              </button>
              {stops.map((s, i) => (
                <div key={i} className="mt-1 pl-3 border-l-2 border-dashed border-gray-400">
                  <div className="text-[11px] font-bold text-gray-700">경유하차 {i+1}: {s.업체명}</div>
                  {s.주소 && <div className="text-[10px] text-gray-400">{s.주소}</div>}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    }
  />
      </div>

      {/* 차량종류 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="차량종류"
          input={
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.차종}
              onChange={(e) => update("차종", e.target.value)}
            >
              <option value="">차량종류 선택</option>
              <option value="라보/다마스">라보/다마스</option>
              <option value="카고">카고</option>
              <option value="윙바디">윙바디</option>
              <option value="탑차">탑차</option>
              <option value="냉장탑">냉장탑</option>
              <option value="냉동탑">냉동탑</option>
              <option value="냉장윙">냉장윙</option>
              <option value="냉동윙">냉동윙</option>
              <option value="오토바이">오토바이</option>
              <option value="기타">기타</option>
            </select>
          }
        />
        {/* 톤수 */}
        <RowLabelInput
          label="톤수"
          input={
            <div className="flex items-center gap-2">
              <input
                className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[#1B2B4B]"
                placeholder="예: 1"
                value={톤수값}
                onChange={(e) => {
                  const v = e.target.value;
                  set톤수값(v);
                  update("톤수", 톤수타입 ? `${v}${톤수타입}` : v);
                }}
              />
              <select
                className="w-[62px] shrink-0 border-0 rounded-lg px-1 py-1.5 text-[12px] font-bold bg-[#1B2B4B] text-white outline-none"
                value={톤수타입}
                onChange={(e) => {
                  const t = e.target.value;
                  set톤수타입(t);
                  update("톤수", t ? `${톤수값}${t}` : 톤수값);
                }}
              >
                <option value="">없음</option>
                <option value="톤">톤</option>
                <option value="kg">kg</option>
              </select>
            </div>
          }
        />
        {/* 화물내용 */}
        <RowLabelInput
          label="화물내용"
          input={
            <div className="flex items-center gap-2">
              <input
                className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[#1B2B4B]"
                placeholder="예: 3"
                value={화물수량}
                onChange={(e) => {
                  const v = e.target.value;
                  set화물수량(v);
                  update("화물내용", 화물타입 ? `${v}${화물타입}` : v);
                }}
              />
              <select
                className="w-[76px] shrink-0 border-0 rounded-lg px-1 py-1.5 text-[12px] font-bold bg-[#1B2B4B] text-white outline-none"
                value={화물타입}
                onChange={(e) => {
                  const t = e.target.value;
                  set화물타입(t);
                  update("화물내용", t ? `${화물수량}${t}` : 화물수량);
                }}
              >
                <option value="">없음</option>
                <option value="파레트">파레트</option>
                <option value="박스">박스</option>
                <option value="통">통</option>
                <option value="롤">롤</option>
              </select>
            </div>
          }
        />
      </div>

      {/* 상/하차방법 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="상/하차방법"
          input={
            <div className="flex flex-wrap gap-1.5">
              <select
                className="flex-1 min-w-[90px] border rounded px-2 py-1 text-sm"
                value={form.상차방법}
                onChange={(e) => update("상차방법", e.target.value)}
              >
                <option value="">상차방법</option>
                <option value="지게차">지게차</option>
                <option value="크레인">크레인</option>
                <option value="수작업">수작업</option>
                <option value="직접수작업">직접수작업</option>
                <option value="수도움">수도움</option>
              </select>
              <select
                className="flex-1 min-w-[90px] border rounded px-2 py-1 text-sm"
                value={form.하차방법}
                onChange={(e) => update("하차방법", e.target.value)}
              >
                <option value="">하차방법</option>
                <option value="지게차">지게차</option>
                <option value="크레인">크레인</option>
                <option value="수작업">수작업</option>
                <option value="직접수작업">직접수작업</option>
                <option value="수도움">수도움</option>
              </select>
            </div>
          }
        />
      </div>

      {/* 지급/배차방식 + 혼적/독차 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="지급/배차방식"
          input={
            <div className="flex flex-wrap gap-1.5">
              <select
                className="flex-1 min-w-[90px] border rounded px-2 py-1 text-sm"
                value={form.지급방식}
                onChange={(e) => update("지급방식", e.target.value)}
              >
                <option value="">지급방식</option>
                <option value="계산서">계산서</option>
                <option value="착불">착불</option>
                <option value="선불">선불</option>
                <option value="손실">손실</option>
                <option value="개인">개인</option>
                <option value="취소">취소</option>
              </select>
              <select
                className="flex-1 min-w-[90px] border rounded px-2 py-1 text-sm"
                value={form.배차방식}
                onChange={(e) => update("배차방식", e.target.value)}
              >
                <option value="">배차방식</option>
                <option value="24시">24시</option>
                <option value="직접배차">직접배차</option>
                <option value="인성">인성</option>
                <option value="고정기사">고정기사</option>
              </select>
            </div>
          }
        />
        <RowLabelInput
          label="혼적/독차"
          input={
            <div className="flex gap-4 items-center text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="mix"
                  value="혼적"
                  checked={form.혼적여부 === "혼적"}
                  onChange={(e) => update("혼적여부", e.target.value)}
                />
                혼적
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="mix"
                  value="독차"
                  checked={form.혼적여부 !== "혼적"}
                  onChange={(e) => update("혼적여부", e.target.value)}
                />
                독차
              </label>
            </div>
          }
        />
      </div>

      {/* ── 과거 운임 참고 버튼 ── */}
      {(form.상차지주소 || form.하차지주소) && (
        <button
          type="button"
          onClick={() => setShowFareHistory(true)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1B2B4B] text-white shadow-sm active:opacity-80"
        >
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <div className="text-left">
              <div className="text-sm font-bold">과거 운임 조회</div>
              <div className="text-[11px] text-white/70">
                {fareMatches.length > 0 ? `${fareMatches.length}건의 유사 이력` : "유사 이력 없음"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {fareMatches.length > 0 && (
              <span className="bg-white/20 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                {(() => {
                  const hasCargoInput = !!(form.화물내용 || "").trim();
                  const hasTonInput = !!(form.톤수 || "").trim();
                  const perfect = fareMatches.filter(r => {
                    if (!r.tags.includes("경로일치")) return false;
                    const ce = r.tags.includes("화물일치");
                    const te = r.tags.includes("톤수일치");
                    return (!hasCargoInput || ce) && (!hasTonInput || te);
                  }).length;
                  return perfect > 0 ? `${perfect}건 완전일치` : `${fareMatches.length}건`;
                })()}
              </span>
            )}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </button>
      )}

      {/* 금액 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="청구운임"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-right text-sm"
              value={form.청구운임 || ""}
              onChange={(e) =>
                updateMoney("청구운임", e.target.value)
              }
            />
          }
        />
        <RowLabelInput
          label="기사운임"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-right text-sm"
              value={form.기사운임 || ""}
              onChange={(e) =>
                updateMoney("기사운임", e.target.value)
              }
            />
          }
        />
        <RowLabelInput
          label="수수료"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-right text-sm bg-gray-50"
              value={form.수수료 || 0}
              readOnly
            />
          }
        />
      </div>

{/* 기사 스마트검색 */}
      <div className="bg-white rounded-lg border shadow-sm p-3">
        <div className="text-[11px] text-gray-500 font-semibold mb-1.5">기사 검색 (차량번호/이름/번호 입력)</div>
        <div className="relative">
          <SmartTextarea textareaRef={formSmartRef} onSearch={handleFormSmartSearch} />
          {formSmartMatched.length > 0 && (
            <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden">
              {formSmartMatched.map((d, i) => (
                <button key={i} type="button"
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  onPointerDown={e => {
                    e.preventDefault();
                    update("차량번호", d.차량번호 || "");
                    update("기사명", d.이름 || "");
                    update("전화번호", d.전화번호 || "");
                    setFormSmartMatched([]);
                    if (formSmartRef.current) formSmartRef.current.value = "";
                    if (d._isNew) setShowNewDriver(true);
                  }}>
                  {d._isNew ? (
                    <>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 text-[11px] font-bold border border-orange-300">신규기사</span>
                        <span className="font-bold text-[13px] text-gray-900">{d.이름 || "(이름 없음)"}</span>
                      </div>
                      <div className="text-[11px] text-gray-400">{d.차량번호 || "-"} · {d.전화번호 || "-"}</div>
                    </>
                  ) : (
                    <>
                      <div className="font-bold text-[13px] text-gray-900">{d.이름 || "-"}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{d.차량번호} · {d.전화번호}</div>
                    </>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 차량번호 / 기사명 / 연락처 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="차량번호"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.차량번호}
              onChange={(e) => {
                const v = e.target.value;
                update("차량번호", v);
                setShowNewDriver(false);

                const norm = (s = "") =>
                  String(s).replace(/\s+/g, "").toLowerCase();

                const found = drivers.find(
                  (d) => norm(d.차량번호) === norm(v)
                );

                if (found) {
                  update("기사명", found.이름 || "");
                  update("전화번호", found.전화번호 || "");
                } else {
                  update("기사명", "");
                  update("전화번호", "");
                }
              }}
              onBlur={() => {
                if (
                  form.차량번호 &&
                  form.차량번호.length >= 2 &&
                  !drivers.some((d) => d.차량번호 === form.차량번호)
                ) {
                  setShowNewDriver(true);
                }
              }}
            />
          }
        />
      </div>

      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="기사명"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.기사명 || ""}
              onChange={(e) => update("기사명", e.target.value)}
            />
          }
        />
      </div>

      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="연락처"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.전화번호 || ""}
              onChange={(e) => update("전화번호", e.target.value)}
            />
          }
        />
      </div>

      {/* 신규 기사 등록 버튼 */}
      {showNewDriver && (
        <button
          onClick={() => {
            upsertDriver({
              차량번호: form.차량번호,
              이름: form.기사명 || "",
              전화번호: form.전화번호 || "",
            });
            showToast("신규 기사 등록 완료");
            setShowNewDriver(false);
          }}
          className="w-full py-2 mt-2 rounded bg-green-600 text-white text-sm font-semibold"
        >
          신규 기사 등록하기
        </button>
      )}

      {/* 적요 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="적요"
          input={
            <textarea
              className="w-full border rounded px-2 py-1 text-sm h-16"
              value={form.적요}
              onChange={(e) => update("적요", e.target.value)}
            />
          }
        />
      </div>

      <div className="mt-4 mb-8 space-y-2">
        <button
          onClick={onSave}
          className={`w-full py-3 rounded-lg text-white text-base font-semibold shadow ${
            cardVersionB ? "bg-[#1B2B4B] hover:bg-[#243a60]" : "bg-blue-500"
          }`}
        >
          {form._editId ? "수정하기" : "등록하기"}
        </button>

        {form._editId && (
          <button
            onClick={() => {
              setForm({
                거래처명: "",
                상차일: "",
                상차시간: "",
                하차일: "",
                하차시간: "",
                상차지명: "",
                상차지주소: "",
                하차지명: "",
                하차지주소: "",
                톤수: "",
                차종: "",
                화물내용: "",
                상차방법: "",
                하차방법: "",
                지급방식: "",
                배차방식: "",
                청구운임: 0,
                기사운임: 0,
                수수료: 0,
                산재보험료: 0,
                차량번호: "",
                기사명: "",
                전화번호: "",
                혼적여부: "독차",
                적요: "",
                _editId: null,
                _returnToDetail: false,
              });
            }}
            className={`w-full py-3 rounded-lg text-base font-semibold shadow ${
              cardVersionB
                ? "bg-gray-100 text-[#1B2B4B]/70 border border-gray-200"
                : "bg-gray-300 text-gray-800"
            }`}
          >
            수정취소
          </button>
        )}
      </div>
      {/* ===== 과거 운임 조회 모달 ===== */}
      {showFareHistory && (
        <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: "rgba(15,25,50,0.97)" }}>
          <div className="flex-1 min-h-[56px]" onClick={() => setShowFareHistory(false)} />
          <div className="relative bg-white rounded-t-3xl flex flex-col" style={{ maxHeight: "calc(100dvh - 56px)" }} onClick={e => e.stopPropagation()}>
            {/* 핸들바 */}
            <div className="flex justify-center pt-3 pb-0 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            {/* 헤더 */}
            <div className="bg-[#1B2B4B] px-5 py-4 shrink-0 rounded-t-none">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-white font-bold text-[16px]">운임 조회 결과</div>
                  <div className="text-white/60 text-[11px] mt-0.5 flex flex-wrap gap-1 items-center">
                    {extractAreaFromAddr(form.상차지주소) && <span>{extractAreaFromAddr(form.상차지주소)}</span>}
                    {extractAreaFromAddr(form.상차지주소) && extractAreaFromAddr(form.하차지주소) && <span className="text-white/30">→</span>}
                    {extractAreaFromAddr(form.하차지주소) && <span>{extractAreaFromAddr(form.하차지주소)}</span>}
                    {form.차종 && <><span className="text-white/30">·</span><span>{form.차종}</span></>}
                    {form.화물내용 && <><span className="text-white/30">·</span><span>{form.화물내용}</span></>}
                    {form.톤수 && <><span className="text-white/30">·</span><span>{form.톤수}</span></>}
                    {form.거래처명 && fareMatches.some(r => r.isClientMatch) && <><span className="text-white/30">·</span><span className="text-yellow-300">{form.거래처명}</span></>}
                  </div>
                </div>
                <button onClick={() => setShowFareHistory(false)}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-lg shrink-0">×</button>
              </div>
            </div>
            {/* 콘텐츠 */}
            <div className="flex-1 overflow-y-auto overscroll-contain" data-fare-scroll>
              {(() => {
                const hasCargoInput = !!(form.화물내용 || "").trim();
                const hasTonInput = !!(form.톤수 || "").trim();
                const getLabel = (r) => {
                  const ce = r.tags.includes("화물일치");
                  const cp = r.tags.includes("화물유사");
                  const te = r.tags.includes("톤수일치");
                  const re = r.tags.includes("지명일치") || r.tags.includes("거래처일치");
                  if ((!hasCargoInput || ce) && (!hasTonInput || te) && re) return "완전일치";
                  if (ce || cp) return "부분일치";
                  if (te) return "톤수일치";
                  return "노선일치";
                };
                const counts = { "완전일치": 0, "부분일치": 0, "톤수일치": 0, "노선일치": 0 };
                fareMatches.forEach(r => { const l = getLabel(r); counts[l] = (counts[l] || 0) + 1; });

                const visibleMatches = mobileFareFilter === "all"
                  ? fareMatches
                  : fareMatches.filter(r => getLabel(r) === mobileFareFilter);
                const claims = visibleMatches.map(r => r.claim).filter(v => v > 0);
                const fareMin = claims.length ? Math.min(...claims) : 0;
                const fareMax = claims.length ? Math.max(...claims) : 0;
                const fareAvg = claims.length ? Math.round(claims.reduce((a,b)=>a+b,0)/claims.length) : 0;
                const fareRange = fareMax - fareMin || 1;
                const getBarPct = (f) => fareRange > 0 ? Math.min(100, Math.max(0, ((f - fareMin) / fareRange) * 100)) : 50;

                const tabs = ["all", "완전일치", "부분일치", "톤수일치", "노선일치"];

                if (fareMatches.length === 0) return (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <div className="text-sm">유사한 과거 이력이 없습니다</div>
                  </div>
                );

                return (
                  <>
                    {form.거래처명 && !fareMatches.some(r => r.isClientMatch) && (
                      <div className="mx-4 mt-3 mb-0 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span className="text-[11px] text-amber-700 font-semibold">{form.거래처명} 이력 없음 · 동일 노선 다른 거래처 이력</span>
                      </div>
                    )}
                    {/* 필터 탭 */}
                    <div className="px-4 pt-3 pb-2 border-b border-gray-100">
                      <div className="flex gap-1.5 flex-wrap">
                        {tabs.map(t => {
                          const cnt = t === "all" ? fareMatches.length : (counts[t] || 0);
                          if (t !== "all" && cnt === 0) return null;
                          return (
                            <button key={t} onClick={() => setMobileFareFilter(t)}
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition ${mobileFareFilter === t ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-200"}`}>
                              {t === "all" ? `전체 ${cnt}` : `${t} ${cnt}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 운임 범위 요약 */}
                    {claims.length > 0 && (
                      <div className="px-5 py-4 border-b border-gray-100">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                          조회 운임 범위 ({visibleMatches.length}건)
                        </div>
                        <div className="flex items-baseline gap-2 mb-3">
                          <span className="text-[26px] font-black text-[#1B2B4B] leading-none">{fareMin.toLocaleString()}</span>
                          <span className="text-[16px] font-bold text-gray-300">~</span>
                          <span className="text-[26px] font-black text-[#1B2B4B] leading-none">{fareMax.toLocaleString()}</span>
                          <span className="text-[13px] font-semibold text-gray-400 mb-0.5">원</span>
                        </div>
                        <div className="relative h-2 bg-gray-100 rounded-full mb-1.5">
                          <div className="absolute inset-0 bg-gray-200 rounded-full" />
                          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#1B2B4B] border-2 border-white shadow-md z-10"
                            style={{ left: `calc(${getBarPct(fareAvg)}% - 6px)` }} />
                        </div>
                        <div className="flex justify-between text-[10px] font-semibold text-gray-400">
                          <span>최저 {fareMin.toLocaleString()}원</span>
                          <span className="text-[#1B2B4B] font-bold">평균 {fareAvg.toLocaleString()}원</span>
                          <span>최고 {fareMax.toLocaleString()}원</span>
                        </div>
                        {/* 빠른 적용 버튼 */}
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          {[
                            { label: "최저 운임", value: fareMin },
                            { label: "평균 운임", value: fareAvg },
                            { label: "최고 운임", value: fareMax },
                          ].map(({ label, value }) => (
                            <button key={label}
                              onClick={() => {
                                updateMoney("청구운임", String(value));
                                setShowFareHistory(false);
                                showToast(`운임 적용: ${value.toLocaleString()}원`);
                              }}
                              className="rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-center active:scale-95 transition">
                              <div className="text-[9px] font-bold text-gray-400 mb-1">{label}</div>
                              <div className="text-[15px] font-extrabold text-[#1B2B4B]">{value.toLocaleString()}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 과거 기록 목록 */}
                    <div className="px-4 py-3 space-y-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-extrabold text-[#1B2B4B]">과거 운송 기록</span>
                        <span className="text-[11px] text-gray-400">유사도순 · 최신순</span>
                      </div>
                      {visibleMatches.map((r, i) => {
                        const o = r.order;
                        const ce = r.tags.includes("화물일치");
                        const cp = r.tags.includes("화물유사");
                        const te = r.tags.includes("톤수일치");
                        const re = r.tags.includes("지명일치") || r.tags.includes("거래처일치");
                        const tagLabel = ((!hasCargoInput || ce) && (!hasTonInput || te) && re) ? "완전일치"
                          : (ce || cp) ? "부분일치"
                          : te ? "톤수일치"
                          : "노선일치";
                        const tagColor = tagLabel === "완전일치" ? "bg-[#1B2B4B] text-white"
                          : tagLabel === "부분일치" ? "bg-emerald-600 text-white"
                          : tagLabel === "톤수일치" ? "bg-gray-600 text-white"
                          : "bg-blue-100 text-blue-700";

                        const fare = r.claim;
                        const barPct = fareRange > 0 ? Math.min(100, Math.max(0, ((fare - fareMin) / fareRange) * 100)) : 50;
                        const fareLevel = barPct <= 33 ? "저렴" : barPct <= 66 ? "보통" : "높음";
                        const fareLevelCls = barPct <= 33 ? "bg-emerald-600 text-white" : barPct <= 66 ? "bg-gray-600 text-white" : "bg-orange-600 text-white";
                        const isTop = i === 0;

                        return (
                          <div key={i} onClick={() => setFareDetailItem(r.order)} className={`bg-white border rounded-2xl overflow-hidden shadow-sm cursor-pointer active:scale-[0.99] transition ${isTop ? "border-[#1B2B4B]/30" : "border-gray-200"}`}>
                            {isTop && (
                              <div className="bg-[#1B2B4B] px-4 py-1 flex items-center gap-1">
                                <span className="text-yellow-300 text-[10px] font-bold">최근 유사 운송</span>
                              </div>
                            )}
                            <div className="px-4 pt-3 pb-0">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tagColor}`}>{tagLabel}</span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${fareLevelCls}`}>{fareLevel}</span>
                                    <span className="text-[11px] text-gray-400">{o.상차일 || ""}</span>
                                  </div>
                                  <div className="text-[13px] font-bold text-gray-900 truncate">
                                    {o.상차지명 || "-"} → {o.하차지명 || "-"}
                                  </div>
                                  {(o.상차지주소 || o.하차지주소) && (
                                    <div className="text-[11px] text-gray-400 mt-0.5">
                                      {shortAddr(o.상차지주소)} → {shortAddr(o.하차지주소)}
                                    </div>
                                  )}
                                  {o.거래처명 && <div className="text-[11px] text-gray-500 mt-0.5">{o.거래처명}</div>}
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {o.화물내용 && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${ce ? "bg-orange-100 text-orange-700" : cp ? "bg-orange-50 text-orange-500" : "bg-gray-100 text-gray-500"}`}>
                                        {o.화물내용}
                                      </span>
                                    )}
                                    {o.톤수 && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${te ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                        {o.톤수}
                                      </span>
                                    )}
                                    {o.차종 && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">{o.차종}</span>}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-[11px] text-gray-400">청구</div>
                                  <div className="text-[17px] font-extrabold text-[#1B2B4B]">{fare.toLocaleString()}원</div>
                                  <div className="text-[11px] text-gray-400 mt-0.5">기사 {r.drv.toLocaleString()}원</div>
                                </div>
                              </div>
                              {/* 운임 위치 바 */}
                              {claims.length > 1 && (
                                <div className="relative h-1.5 bg-gray-100 rounded-full mb-2.5">
                                  <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#1B2B4B] border-2 border-white shadow"
                                    style={{ left: `calc(${barPct}% - 5px)` }} />
                                </div>
                              )}
                              {/* 기사 */}
                              {(o.이름 || o.기사명) && (
                                <div className="text-[11px] text-gray-400 mb-2">
                                  기사 <span className="text-gray-700 font-semibold">{o.이름 || o.기사명}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex border-t border-gray-100 mt-0">
                              <button
                                type="button"
                                onClick={() => {
                                  updateMoney("청구운임", String(r.claim));
                                  setShowFareHistory(false);
                                  showToast(`청구운임 적용: ${r.claim.toLocaleString()}원`);
                                }}
                                className="flex-1 py-2.5 bg-[#1B2B4B] text-white text-[12px] font-bold text-center active:opacity-80"
                              >
                                청구운임 적용 ({r.claim.toLocaleString()})
                              </button>
                              {r.drv > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateMoney("청구운임", String(r.claim));
                                    updateMoney("기사운임", String(r.drv));
                                    setShowFareHistory(false);
                                    showToast(`운임 적용: 청구 ${r.claim.toLocaleString()}원 / 기사 ${r.drv.toLocaleString()}원`);
                                  }}
                                  className="flex-1 py-2.5 bg-[#2d4a7a] text-white text-[12px] font-bold text-center active:opacity-80 border-l border-white/20"
                                >
                                  기사포함 ({r.drv.toLocaleString()})
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ===== 운임 이력 상세 팝업 ===== */}
      {fareDetailItem && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setFareDetailItem(null)} />
          <div className="relative bg-white rounded-t-3xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-0">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="bg-[#1B2B4B] px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="text-white font-bold text-[15px]">운송 이력 상세</div>
                <button onClick={() => setFareDetailItem(null)}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-lg">×</button>
              </div>
              <div className="text-white/60 text-[11px] mt-1">{fareDetailItem.상차일 || ""}</div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {fareDetailItem.거래처명 && (
                <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                  <span className="text-[11px] text-gray-400 w-16 shrink-0">거래처</span>
                  <span className="text-[14px] font-bold text-[#1B2B4B]">{fareDetailItem.거래처명}</span>
                </div>
              )}
              <div className="space-y-2">
                <div className="flex gap-3">
                  <div className="flex-1 bg-blue-50 rounded-xl p-3">
                    <div className="text-[10px] font-bold text-blue-400 mb-1">상차지</div>
                    <div className="text-[13px] font-bold text-gray-900">{fareDetailItem.상차지명 || "-"}</div>
                    {fareDetailItem.상차지주소 && <div className="text-[11px] text-gray-500 mt-0.5">{fareDetailItem.상차지주소}</div>}
                  </div>
                  <div className="flex-1 bg-orange-50 rounded-xl p-3">
                    <div className="text-[10px] font-bold text-orange-400 mb-1">하차지</div>
                    <div className="text-[13px] font-bold text-gray-900">{fareDetailItem.하차지명 || "-"}</div>
                    {fareDetailItem.하차지주소 && <div className="text-[11px] text-gray-500 mt-0.5">{fareDetailItem.하차지주소}</div>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {fareDetailItem.화물내용 && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-[10px] font-bold text-gray-400 mb-1">화물</div>
                    <div className="text-[12px] font-semibold text-gray-800">{fareDetailItem.화물내용}</div>
                  </div>
                )}
                {(fareDetailItem.톤수 || fareDetailItem.차량톤수) && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-[10px] font-bold text-gray-400 mb-1">톤수</div>
                    <div className="text-[12px] font-semibold text-gray-800">{fareDetailItem.톤수 || fareDetailItem.차량톤수}</div>
                  </div>
                )}
                {(fareDetailItem.차종 || fareDetailItem.차량종류) && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-[10px] font-bold text-gray-400 mb-1">차종</div>
                    <div className="text-[12px] font-semibold text-gray-800">{fareDetailItem.차종 || fareDetailItem.차량종류}</div>
                  </div>
                )}
              </div>
              <div className="bg-[#1B2B4B] rounded-xl p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-white/50 text-[10px] mb-1">청구운임</div>
                    <div className="text-white font-extrabold text-[16px]">{Number(fareDetailItem.청구운임||0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-white/50 text-[10px] mb-1">기사운임</div>
                    <div className="text-white font-extrabold text-[16px]">{Number(fareDetailItem.기사운임||0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-white/50 text-[10px] mb-1">수수료</div>
                    <div className="text-white font-extrabold text-[16px]">{(Number(fareDetailItem.청구운임||0)-Number(fareDetailItem.기사운임||0)).toLocaleString()}</div>
                  </div>
                </div>
              </div>
              {(fareDetailItem.이름 || fareDetailItem.기사명) && (
                <div className="text-[12px] text-gray-500">기사 <span className="font-semibold text-gray-700">{fareDetailItem.이름 || fareDetailItem.기사명}</span></div>
              )}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => {
                    updateMoney("청구운임", String(fareDetailItem.청구운임 || ""));
                    setFareDetailItem(null);
                    setShowFareHistory(false);
                    showToast(`청구운임 적용: ${Number(fareDetailItem.청구운임||0).toLocaleString()}원`);
                  }}
                  className="flex-1 py-3 bg-[#1B2B4B] text-white font-bold rounded-xl text-[13px] active:opacity-80"
                >
                  청구운임 적용<br/><span className="text-[11px] font-normal">{Number(fareDetailItem.청구운임||0).toLocaleString()}원</span>
                </button>
                {Number(fareDetailItem.기사운임||0) > 0 && (
                  <button
                    onClick={() => {
                      updateMoney("청구운임", String(fareDetailItem.청구운임 || ""));
                      updateMoney("기사운임", String(fareDetailItem.기사운임 || ""));
                      setFareDetailItem(null);
                      setShowFareHistory(false);
                      showToast(`운임 적용: 청구 ${Number(fareDetailItem.청구운임||0).toLocaleString()}원 / 기사 ${Number(fareDetailItem.기사운임||0).toLocaleString()}원`);
                    }}
                    className="flex-1 py-3 bg-[#2d4a7a] text-white font-bold rounded-xl text-[13px] active:opacity-80"
                  >
                    기사포함 적용<br/><span className="text-[11px] font-normal">{Number(fareDetailItem.기사운임||0).toLocaleString()}원</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 거래처 검색 결과 바텀시트 ===== */}
{showClientSearchModal && (
  <div className="fixed inset-0 z-[9998] flex flex-col justify-end">
    <div className="absolute inset-0 bg-black/50" onClick={() => setShowClientSearchModal(false)} />
    <div
      className="relative bg-white rounded-t-2xl shadow-xl flex flex-col"
      style={{ maxHeight: "70vh" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full bg-gray-200" />
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="text-[14px] font-bold text-[#1B2B4B]">
          거래처 조회 {clientSearchQuery ? `"${clientSearchQuery}"` : ""}
        </div>
        <button
          type="button"
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-lg"
          onClick={() => setShowClientSearchModal(false)}
        >×</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {clientSearchResults.length === 0 ? (
          <div className="px-4 py-6 space-y-3">
            <div className="text-center text-[13px] text-gray-400">
              {clientSearchQuery ? `"${clientSearchQuery}" 검색 결과 없음` : "거래처 전체 목록"}
            </div>
            <button
              type="button"
              className={`w-full py-2.5 rounded-lg text-[13px] font-semibold border ${
                cardVersionB ? "border-[#1B2B4B] text-[#1B2B4B]" : "border-[#1B2B4B] text-[#1B2B4B]"
              }`}
              onClick={() => {
                setShowClientSearchModal(false);
                setNewClientForm({ 거래처명: clientSearchQuery, 주소: "", 담당자: "", 담당자번호: "" });
                setShowNewClientModal(true);
              }}
            >
              신규 거래처로 등록
            </button>
          </div>
        ) : (
          <>
            {clientSearchResults.map((c, i) => (
              <button
                key={c.id || i}
                type="button"
                className="w-full text-left px-4 py-3 border-b border-gray-50 active:bg-gray-50"
                onClick={() => {
                  setShowClientSearchModal(false);
                  chooseClient(c);
                }}
              >
                <div className="text-[13px] font-semibold text-gray-800">{c.거래처명}</div>
                {c.주소 && <div className="text-[11px] text-gray-400 mt-0.5">{c.주소}</div>}
              </button>
            ))}
            <div className="px-4 py-3 border-t border-gray-100">
              <button
                type="button"
                className="w-full py-2.5 rounded-lg text-[13px] font-semibold border border-gray-300 text-gray-600"
                onClick={() => {
                  setShowClientSearchModal(false);
                  setNewClientForm({ 거래처명: clientSearchQuery, 주소: "", 담당자: "", 담당자번호: "" });
                  setShowNewClientModal(true);
                }}
              >
                신규 거래처로 등록
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  </div>
)}

      {/* =============================
    거래처 적용 선택 팝업
============================== */}
{showClientApplyModal && selectedClient && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
    <div className="bg-white rounded-xl shadow-xl p-5 w-72">

      <div className="text-sm font-semibold mb-1 text-[#1B2B4B]">
        거래처를 어디에 적용할까요?
      </div>

      <div className="mb-4 text-xs text-gray-500">
        <span className="font-medium text-gray-700">{selectedClient.거래처명}</span>
        <br />
        {selectedClient.주소 || "- 주소 없음"}
      </div>

      {/* 상차지에 적용 */}
      <button
        className={
          cardVersionB
            ? "w-full py-2 mb-2 rounded-lg text-sm font-medium bg-[#1B2B4B] text-white"
            : "w-full py-2 mb-2 rounded-lg text-sm font-medium border border-[#1B2B4B] text-[#1B2B4B] bg-white"
        }
        onClick={() => {
          const contacts = (Array.isArray(selectedClient.contacts) ? selectedClient.contacts : []).filter(ct => ct.name?.trim());
          const unique = [...new Map(contacts.map(ct => [ct.name.trim(), ct])).values()];
          const primary = unique.find(ct => ct.isPrimary) || unique[0] || null;
          update("상차지명", selectedClient.거래처명);
          update("상차지주소", selectedClient.주소 || "");
          update("상차지담당자", primary?.name || selectedClient.담당자 || "");
          update("상차지담당자번호", primary?.phone || selectedClient.담당자번호 || "");
          setShowClientApplyModal(false);
          if (unique.length > 1) openContactPopup([{ type: "pickup", place: selectedClient, contacts: unique }]);
        }}
      >
        상차지에 적용
      </button>

      {/* 하차지에 적용 */}
      <button
        className={
          cardVersionB
            ? "w-full py-2 mb-2 rounded-lg text-sm font-medium bg-[#1B2B4B] text-white"
            : "w-full py-2 mb-2 rounded-lg text-sm font-medium border border-[#1B2B4B] text-[#1B2B4B] bg-white"
        }
        onClick={() => {
          const contacts = (Array.isArray(selectedClient.contacts) ? selectedClient.contacts : []).filter(ct => ct.name?.trim());
          const unique = [...new Map(contacts.map(ct => [ct.name.trim(), ct])).values()];
          const primary = unique.find(ct => ct.isPrimary) || unique[0] || null;
          update("하차지명", selectedClient.거래처명);
          update("하차지주소", selectedClient.주소 || "");
          update("하차지담당자", primary?.name || selectedClient.담당자 || "");
          update("하차지담당자번호", primary?.phone || selectedClient.담당자번호 || "");
          setShowClientApplyModal(false);
          if (unique.length > 1) openContactPopup([{ type: "drop", place: selectedClient, contacts: unique }]);
        }}
      >
        하차지에 적용
      </button>

      {/* 둘 다 적용 */}
      <button
        className={
          cardVersionB
            ? "w-full py-2 mb-2 rounded-lg text-sm font-medium bg-[#1B2B4B] text-white"
            : "w-full py-2 mb-2 rounded-lg text-sm font-medium border border-[#1B2B4B] text-[#1B2B4B] bg-white"
        }
        onClick={() => {
          const contacts = (Array.isArray(selectedClient.contacts) ? selectedClient.contacts : []).filter(ct => ct.name?.trim());
          const unique = [...new Map(contacts.map(ct => [ct.name.trim(), ct])).values()];
          const primary = unique.find(ct => ct.isPrimary) || unique[0] || null;
          update("상차지명", selectedClient.거래처명);
          update("상차지주소", selectedClient.주소 || "");
          update("상차지담당자", primary?.name || selectedClient.담당자 || "");
          update("상차지담당자번호", primary?.phone || selectedClient.담당자번호 || "");
          update("하차지명", selectedClient.거래처명);
          update("하차지주소", selectedClient.주소 || "");
          update("하차지담당자", primary?.name || selectedClient.담당자 || "");
          update("하차지담당자번호", primary?.phone || selectedClient.담당자번호 || "");
          setShowClientApplyModal(false);
          if (unique.length > 1) openContactPopup([
            { type: "pickup", place: selectedClient, contacts: unique },
            { type: "drop", place: selectedClient, contacts: unique },
          ]);
        }}
      >
        둘 다 적용
      </button>

      {/* 거래처명만 */}
      <button
        className={
          cardVersionB
            ? "w-full py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 border border-gray-200"
            : "w-full py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-500 bg-white"
        }
        onClick={() => setShowClientApplyModal(false)}
      >
        거래처명만
      </button>
    </div>
  </div>
)}

{/* ===== 신규 거래처 등록 모달 ===== */}
{showNewClientModal && (
  <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[9999]">
    <div className="bg-white rounded-t-2xl shadow-xl w-full max-w-lg p-5 pb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-[#1B2B4B]">신규 거래처 등록</div>
        <button
          type="button"
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-lg"
          onClick={() => setShowNewClientModal(false)}
        >×</button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">거래처명</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={newClientForm.거래처명}
            onChange={(e) => setNewClientForm((p) => ({ ...p, 거래처명: e.target.value }))}
            placeholder="거래처명"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">주소</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={newClientForm.주소}
            onChange={(e) => setNewClientForm((p) => ({ ...p, 주소: e.target.value }))}
            placeholder="주소 (선택)"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">담당자</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={newClientForm.담당자}
            onChange={(e) => setNewClientForm((p) => ({ ...p, 담당자: e.target.value }))}
            placeholder="담당자 이름 (선택)"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">담당자 번호</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={newClientForm.담당자번호}
            onChange={(e) => setNewClientForm((p) => ({ ...p, 담당자번호: e.target.value }))}
            placeholder="연락처 (선택)"
          />
        </div>
      </div>

      <div className="flex gap-2 mt-5">
        <button
          type="button"
          className={
            cardVersionB
              ? "flex-1 py-2.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 border border-gray-200"
              : "flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-500 bg-white"
          }
          onClick={() => setShowNewClientModal(false)}
        >
          취소
        </button>
        <button
          type="button"
          className={
            cardVersionB
              ? "flex-1 py-2.5 rounded-lg text-sm font-medium bg-[#1B2B4B] text-white"
              : "flex-1 py-2.5 rounded-lg text-sm font-medium bg-[#1B2B4B] text-white"
          }
          onClick={async () => {
            const name = newClientForm.거래처명.trim();
            if (!name) return;
            const contacts = [];
            if (newClientForm.담당자.trim() || newClientForm.담당자번호.trim()) {
              contacts.push({
                name: newClientForm.담당자.trim(),
                phone: newClientForm.담당자번호.trim(),
                isPrimary: true,
              });
            }
            const primary = contacts[0] || null;
            const co = userCompany || localStorage.getItem("userCompany") || "";
            await addDoc(collection(db, "clients"), {
              거래처명: name,
              주소: newClientForm.주소.trim(),
              담당자: primary?.name || "",
              연락처: primary?.phone || "",
              companyName: co,
              createdAt: serverTimestamp(),
            });
            update("거래처명", name);
            showToast("신규 거래처 등록 완료");
            setShowNewClientModal(false);
          }}
        >
          등록
        </button>
      </div>
    </div>
  </div>
)}

{/* ===== 음성 오더 입력 바텀시트 ===== */}
{voiceSheet && (
  <div className="fixed inset-0 z-[9999] flex flex-col justify-end">
    <div className="absolute inset-0 bg-black/60" onClick={() => { stopVoice(); setVoiceSheet(false); }} />
    <div className="relative bg-white rounded-t-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="flex justify-center pt-3 pb-0 shrink-0">
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
        <div className="font-bold text-[15px] text-[#1B2B4B]">음성으로 오더 입력</div>
        <button onClick={() => { stopVoice(); setVoiceSheet(false); }}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-lg">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* 마이크 버튼 */}
        <div className="flex flex-col items-center gap-3 py-2">
          <button
            type="button"
            onClick={voiceListening ? stopVoice : startVoice}
            className={`w-20 h-20 rounded-full flex flex-col items-center justify-center gap-1 text-white font-bold shadow-lg transition-all ${
              voiceListening ? "bg-red-500 scale-110 animate-pulse" : "bg-[#1B2B4B]"
            }`}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            <span className="text-[11px]">{voiceListening ? "중지" : "시작"}</span>
          </button>
          <p className="text-xs text-gray-500 text-center">
            {voiceListening ? "듣고 있습니다... 말씀하세요" : "버튼을 눌러 음성 입력을 시작하세요"}
          </p>
        </div>

        {/* 예시 안내 */}
        {!voiceTranscript && !voiceListening && (
          <div className="bg-blue-50 rounded-xl p-3 text-[12px] text-blue-700 space-y-1">
            <div className="font-bold mb-1">음성 예시</div>
            <div>"내일 오전 10시에 테스트업체에서 박스 5개 주주물류로 배달"</div>
            <div>"오늘 즉시 3톤 냉장 후레쉬2공장에서 수원종합운동장으로"</div>
          </div>
        )}

        {/* 음성 인식 결과 */}
        {voiceTranscript && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-gray-500">인식된 내용</div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-800 min-h-[60px]">
              {voiceTranscript}
            </div>
            <button
              type="button"
              onClick={() => {
                const parsed = parseVoiceOrder(voiceTranscript);
                setVoiceParsed(parsed);
              }}
              className="w-full py-2.5 rounded-xl bg-[#1B2B4B] text-white text-sm font-bold"
            >
              분석하기
            </button>
          </div>
        )}

        {/* 파싱 결과 미리보기 */}
        {voiceParsed && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-gray-500">인식 결과 확인</div>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 text-sm">
              {[
                ["상차일", voiceParsed.상차일],
                ["상차시간", voiceParsed.상차시간],
                ["상차지", voiceParsed.상차지명],
                ["하차지", voiceParsed.하차지명],
                ["화물내용", voiceParsed.화물내용 ? `${voiceParsed.화물내용}${voiceParsed.화물타입 ? " "+voiceParsed.화물타입 : ""}` : ""],
                ["톤수", voiceParsed.톤수],
                ["차량종류", voiceParsed.차종],
              ].filter(([, v]) => v).map(([label, val]) => (
                <div key={label} className="flex items-center px-3 py-2 gap-3">
                  <span className="text-gray-400 text-xs w-14 shrink-0">{label}</span>
                  <span className="font-semibold text-[#1B2B4B]">{val}</span>
                </div>
              ))}
              {Object.values(voiceParsed).filter(Boolean).length === 0 && (
                <div className="px-3 py-3 text-gray-400 text-xs">인식된 정보가 없습니다. 다시 말씀해주세요.</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-6 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3 shrink-0">
        <button type="button" onClick={() => { stopVoice(); setVoiceSheet(false); }}
          className="py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold">취소</button>
        <button
          type="button"
          onClick={applyVoiceParsed}
          disabled={!voiceParsed || Object.values(voiceParsed).filter(Boolean).length === 0}
          className="py-3 rounded-xl bg-[#1B2B4B] text-white text-sm font-bold disabled:opacity-40"
        >
          폼에 적용
        </button>
      </div>
    </div>
  </div>
)}

{/* ===== 경유지 편집 바텀시트 ===== */}
{stopSheet && (
  <div className="fixed inset-0 z-[9999] flex flex-col justify-end">
    <div className="absolute inset-0 bg-black/60" onClick={() => setStopSheet(null)} />
    <div className="relative bg-white rounded-t-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="flex justify-center pt-3 pb-0 shrink-0">
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
        <div className="font-bold text-[15px] text-[#1B2B4B]">
          {stopSheet === "pickup" ? "경유 상차지 추가" : "경유 하차지 추가"}
        </div>
        <button onClick={() => setStopSheet(null)}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-lg">×</button>
      </div>
      {/* 경유지 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {stopList.map((stop, idx) => (
          <div key={idx} className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] font-bold text-[#1B2B4B]">경유지 {idx + 1}</span>
              {stopList.length > 1 && (
                <button type="button" onClick={() => setStopList(prev => prev.filter((_, i) => i !== idx))}
                  className="text-[11px] text-red-500 font-bold px-2 py-0.5 border border-red-200 rounded-full">삭제</button>
              )}
            </div>
            {/* 업체명 + 자동완성 드롭다운 */}
            {(() => {
              const query = stop.업체명 || "";
              const nq = normalizeCompany(query);
              const stopOptions = query.trim()
                ? (() => {
                    const exact = [], starts = [], includes = [], addrMatch = [];
                    clients.forEach(c => {
                      const nameRaw = c.거래처명 || "";
                      const name = normalizeCompany(nameRaw);
                      const addr = normalizeCompany(c.주소 || "");
                      if (nameRaw.trim() === query.trim() || name === nq) exact.push(c);
                      else if (name.startsWith(nq)) starts.push(c);
                      else if (name.includes(nq)) includes.push(c);
                      else if (addr.includes(nq)) addrMatch.push(c);
                    });
                    return [...exact, ...starts, ...includes, ...addrMatch].slice(0, 10);
                  })()
                : [];
              const isNewClient = query.trim() && stopOptions.length === 0;
              const showDrop = stopDropOpen === idx && stopOptions.length > 0;
              return (
                <div className="relative">
                  <div className="flex items-center gap-1">
                    <input
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1B2B4B]"
                      placeholder="업체명 / 경유지명"
                      value={stop.업체명 || ""}
                      onChange={e => {
                        const val = e.target.value;
                        setStopList(prev => prev.map((s, i) => i === idx ? { ...s, 업체명: val } : s));
                        setStopDropOpen(idx);
                        if (!val.trim()) {
                          setStopList(prev => prev.map((s, i) => i === idx ? { ...s, 업체명: val, 주소: "", 담당자: "", 담당자번호: "" } : s));
                        }
                      }}
                      onFocus={() => { if (stop.업체명) setStopDropOpen(idx); }}
                      onBlur={() => setTimeout(() => setStopDropOpen(null), 150)}
                    />
                    {isNewClient && (
                      <span className="text-[10px] font-bold text-orange-500 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">신규</span>
                    )}
                  </div>
                  {showDrop && (
                    <div className="absolute z-[10000] w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto text-xs mt-0.5">
                      {stopOptions.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50 last:border-0"
                          onMouseDown={() => {
                            const contacts = (Array.isArray(c.contacts) ? c.contacts : []).filter(ct => ct.name?.trim());
                            const unique = [...new Map(contacts.map(ct => [ct.name.trim(), ct])).values()];
                            const primary = unique.find(ct => ct.isPrimary) || unique[0] || null;
                            setStopList(prev => prev.map((s, i) => i === idx ? {
                              ...s,
                              업체명: c.거래처명 || "",
                              주소: c.주소 || "",
                              담당자: primary?.name || c.담당자 || "",
                              담당자번호: primary?.phone || c.담당자번호 || "",
                            } : s));
                            setStopDropOpen(null);
                          }}
                        >
                          <div className="font-semibold text-gray-800">{c.거래처명 || "-"}</div>
                          {c.주소 && <div className="text-[11px] text-gray-400 truncate">{c.주소}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1B2B4B]"
              placeholder="주소"
              value={stop.주소 || ""}
              onChange={e => setStopList(prev => prev.map((s, i) => i === idx ? { ...s, 주소: e.target.value } : s))}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1B2B4B]"
                placeholder="담당자"
                value={stop.담당자 || ""}
                onChange={e => setStopList(prev => prev.map((s, i) => i === idx ? { ...s, 담당자: e.target.value } : s))}
              />
              <input
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1B2B4B]"
                placeholder="연락처"
                value={stop.담당자번호 || ""}
                onChange={e => setStopList(prev => prev.map((s, i) => i === idx ? { ...s, 담당자번호: e.target.value } : s))}
              />
            </div>
            {/* 화물내용 + 타입 */}
            <div className="flex border border-gray-200 rounded-xl overflow-hidden bg-white">
              <input
                className="flex-1 px-3 py-2 text-sm outline-none"
                placeholder="화물내용 (예: 3)"
                value={stop.화물내용 || ""}
                onChange={e => setStopList(prev => prev.map((s, i) => i === idx ? { ...s, 화물내용: e.target.value } : s))}
              />
              <select
                className="px-2 py-1 text-[11px] font-bold bg-[#1B2B4B] text-white border-0 outline-none"
                value={stop.화물타입 || ""}
                onChange={e => setStopList(prev => prev.map((s, i) => i === idx ? { ...s, 화물타입: e.target.value } : s))}
              >
                <option value="">없음</option>
                <option value="파레트">파레트</option>
                <option value="박스">박스</option>
                <option value="통">통</option>
              </select>
            </div>
            {/* 톤수 */}
            <div className="flex border border-gray-200 rounded-xl overflow-hidden bg-white">
              <input
                className="flex-1 px-3 py-2 text-sm outline-none"
                placeholder="톤수 (예: 1)"
                value={stop.톤수값 || ""}
                onChange={e => setStopList(prev => prev.map((s, i) => i === idx ? { ...s, 톤수값: e.target.value } : s))}
              />
              <select
                className="px-2 py-1 text-[11px] font-bold bg-[#1B2B4B] text-white border-0 outline-none"
                value={stop.톤수타입 || ""}
                onChange={e => setStopList(prev => prev.map((s, i) => i === idx ? { ...s, 톤수타입: e.target.value } : s))}
              >
                <option value="">없음</option>
                <option value="톤">톤</option>
                <option value="kg">kg</option>
              </select>
            </div>
            {/* 시간 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] text-gray-500 font-semibold mb-1">상차시간</div>
                <select
                  className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none"
                  value={stop.상차시간 || ""}
                  onChange={e => setStopList(prev => prev.map((s, i) => i === idx ? { ...s, 상차시간: e.target.value } : s))}
                >
                  {STOP_TIMES.map(t => <option key={t} value={t}>{t || "시간 선택"}</option>)}
                </select>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 font-semibold mb-1">하차시간</div>
                <select
                  className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none"
                  value={stop.하차시간 || ""}
                  onChange={e => setStopList(prev => prev.map((s, i) => i === idx ? { ...s, 하차시간: e.target.value } : s))}
                >
                  {STOP_TIMES.map(t => <option key={t} value={t}>{t || "시간 선택"}</option>)}
                </select>
              </div>
            </div>
            {/* 메모 */}
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1B2B4B]"
              placeholder="메모 (예: 백게이트 진입)"
              value={stop.메모 || ""}
              onChange={e => setStopList(prev => prev.map((s, i) => i === idx ? { ...s, 메모: e.target.value } : s))}
            />
          </div>
        ))}
        {/* 경유지 추가 버튼 */}
        <button
          type="button"
          onClick={() => setStopList(prev => [...prev, emptyStop()])}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-[#1B2B4B]/30 text-[#1B2B4B] text-sm font-semibold"
        >
          + 경유지 추가
        </button>
      </div>
      {/* 저장/취소 버튼 */}
      <div className="px-4 pb-6 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3 shrink-0">
        <button type="button" onClick={() => setStopSheet(null)}
          className="py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold">취소</button>
        <button type="button" onClick={saveStopSheet}
          className="py-3 rounded-xl bg-[#1B2B4B] text-white text-sm font-bold">저장</button>
      </div>
    </div>
  </div>
)}

{/* ===== 담당자 선택 팝업 ===== */}
{contactPopup && (
  <div className="fixed inset-0 z-[9999] flex flex-col justify-end">
    <div className="absolute inset-0 bg-black/50" onClick={() => closeContactPopup(null)} />
    <div className="relative bg-white rounded-t-3xl" onClick={e => e.stopPropagation()}>
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>
      <div className="px-5 pt-2 pb-3 border-b border-gray-100">
        <div className="text-[15px] font-bold text-[#1B2B4B]">
          담당자 선택
        </div>
        <div className="text-[12px] text-gray-400 mt-0.5">
          {contactPopup.type === "pickup" ? "상차지" : "하차지"} · {contactPopup.place?.업체명 || contactPopup.place?.거래처명 || ""}
        </div>
      </div>
      <div className="px-4 py-3 space-y-2 max-h-[50vh] overflow-y-auto">
        {contactPopup.contacts.map((ct, i) => (
          <button
            key={i}
            type="button"
            onClick={() => closeContactPopup(ct)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-white active:bg-gray-50 text-left"
          >
            <div>
              <div className="text-sm font-bold text-gray-900">{ct.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{ct.phone || "번호 없음"}</div>
            </div>
            {ct.isPrimary && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1B2B4B] text-white">주담당</span>
            )}
          </button>
        ))}
      </div>
      <div className="px-4 pb-6 pt-2">
        <button
          type="button"
          onClick={() => closeContactPopup(null)}
          className="w-full py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold"
        >
          취소
        </button>
      </div>
    </div>
  </div>
)}

{/* ===== 오더 복사 모달 ===== */}
{showOrderCopyModal && (
  <div className="fixed inset-0 bg-black/50 flex flex-col justify-end z-[9999]" onClick={() => setShowOrderCopyModal(false)}>
    <div className="bg-white rounded-t-2xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="font-bold text-[15px] text-[#1B2B4B]">기존 오더 불러오기</span>
        <button onClick={() => setShowOrderCopyModal(false)} className="text-gray-400 text-xl">✕</button>
      </div>
            {/* 검색 */}
      <div className="px-4 py-2 border-b">
        <div className="flex gap-2">
          <select
            className="w-[115px] border border-gray-200 rounded-xl px-2 py-2 text-[13px] bg-white focus:outline-none focus:border-[#1B2B4B]"
            value={orderCopySearchField}
            onChange={e => setOrderCopySearchField(e.target.value)}
          >
            <option value="all">전체</option>
            <option value="거래처명">거래처명</option>
            <option value="상차지명">상차지명</option>
            <option value="하차지명">하차지명</option>
            <option value="기사명">기사명</option>
            <option value="차량번호">차량번호</option>
          </select>

          <input
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
            placeholder="검색어를 입력하세요"
            value={orderCopySearch}
            onChange={e => setOrderCopySearch(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {/* 목록 */}
      <div className="overflow-y-auto flex-1 px-4 py-2 space-y-2">
        {[...orders]
          .filter(o => {
            if (!o.상차지명 && !o.하차지명) return false;

            const q = orderCopySearch.trim().toLowerCase();
            if (!q) return true;

            const getValue = key => String(o[key] || "").toLowerCase();

            if (orderCopySearchField === "all") {
              return (
                getValue("거래처명").includes(q) ||
                getValue("상차지명").includes(q) ||
                getValue("하차지명").includes(q) ||
                getValue("기사명").includes(q) ||
                getValue("차량번호").includes(q)
              );
            }

            return getValue(orderCopySearchField).includes(q);
          })
          .sort((a, b) => (b.상차일 || "").localeCompare(a.상차일 || ""))
          .slice(0, 30)
          .map(o => (
            <button
              key={o._id || o.id}
              className="w-full text-left bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 active:scale-[0.99] transition"
              onClick={() => {
                setForm(prev => ({
                  ...prev,
                  거래처명: o.거래처명 || "",
                  상차지명: o.상차지명 || "",
                  상차지주소: o.상차지주소 || "",
                  상차지담당자: o.상차지담당자 || "",
                  상차지담당자번호: o.상차지담당자번호 || "",
                  하차지명: o.하차지명 || "",
                  하차지주소: o.하차지주소 || "",
                  하차지담당자: o.하차지담당자 || "",
                  하차지담당자번호: o.하차지담당자번호 || "",
                  톤수: o.톤수 || o.차량톤수 || "",
                  차종: o.차종 || o.차량종류 || "",
                  화물내용: o.화물내용 || "",
                  상차방법: o.상차방법 || "",
                  하차방법: o.하차방법 || "",
                  지급방식: o.지급방식 || "",
                  배차방식: o.배차방식 || "",
                  청구운임: o.청구운임 || 0,
                  혼적여부: o.혼적여부 || "독차",
                }));
                setShowOrderCopyModal(false);
                showToast("오더 정보가 불러와졌습니다");
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[13px] font-semibold text-gray-800 truncate">
                  {o.상차지명 || "-"} → {o.하차지명 || "-"}
                </span>
                <span className="text-[11px] text-gray-400 shrink-0">{o.상차일 || ""}</span>
              </div>
              <div className="text-[11px] text-gray-500">
                {o.거래처명 || ""}{o.차량톤수 || o.톤수 ? ` · ${o.차량톤수 || o.톤수}` : ""}{o.화물내용 ? ` · ${o.화물내용}` : ""}
              </div>
            </button>
          ))}
        {orders.filter(o => o.상차지명 || o.하차지명).length === 0 && (
          <div className="text-center text-gray-400 text-[13px] py-8">오더 데이터가 없습니다</div>
        )}
      </div>
    </div>
  </div>
)}

      {showSmartParser && (
        <SmartOrderParser
          clients={clients || []}
          onApply={(parsed) => {
            setForm(prev => ({
              ...prev,
              ...(parsed.상차일 && { 상차일: parsed.상차일 }),
              ...(parsed.하차일 && { 하차일: parsed.하차일 }),
              ...(parsed.상차시간 && { 상차시간: parsed.상차시간 }),
              ...(parsed.하차시간 && { 하차시간: parsed.하차시간 }),
              ...(parsed.하차시간기준 && { 하차시간기준: parsed.하차시간기준 }),
              ...(parsed.상차지명 && { 상차지명: parsed.상차지명 }),
              ...(parsed.상차지주소 && { 상차지주소: parsed.상차지주소 }),
              ...(parsed.상차지담당자 && { 상차지담당자: parsed.상차지담당자 }),
              ...(parsed.상차지담당자번호 && { 상차지담당자번호: parsed.상차지담당자번호 }),
              ...(parsed.하차지명 && { 하차지명: parsed.하차지명 }),
              ...(parsed.하차지주소 && { 하차지주소: parsed.하차지주소 }),
              ...(parsed.하차지담당자 && { 하차지담당자: parsed.하차지담당자 }),
              ...(parsed.하차지담당자번호 && { 하차지담당자번호: parsed.하차지담당자번호 }),
              ...(parsed.톤수 && { 톤수: parsed.톤수 }),
              ...(parsed.차종 && { 차종: parsed.차종 }),
              ...(parsed.화물내용 && { 화물내용: parsed.화물내용 }),
              ...(parsed.상차방법 && { 상차방법: parsed.상차방법 }),
              ...(parsed.하차방법 && { 하차방법: parsed.하차방법 }),
            }));
          }}
          onClose={() => setShowSmartParser(false)}
        />
      )}

    </div>
  );
}

function CopySelectModal({ order, onClose, onAfterFullCopy, onCopySuccess, cardVersionB = false }) {
  /* ===============================
     공통 유틸
  =============================== */

  const getYoil = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return [
      "일요일",
      "월요일",
      "화요일",
      "수요일",
      "목요일",
      "금요일",
      "토요일",
    ][d.getDay()];
  };
  

  const md = (dateStr) => {
    if (!dateStr) return "";
    const m = Number(dateStr.slice(5, 7));
    const d = Number(dateStr.slice(8, 10));
    return `${m}/${d}`;
  };
// 🔧 톤수 보정 (3 / 3톤 / 0.8톤 모두 대응)
// 🔧 중량 보정 (kg / g / 톤 혼용 대응)
const normalizeTon = (v = "") => {
  if (!v) return "";

  const s = String(v).trim();

  // 이미 단위가 들어간 경우 → 그대로 사용
  if (/(kg|g|톤|t|ton)/i.test(s)) {
    return s;
  }

  // 숫자만 있으면 → 톤으로 간주
  if (/^\d+(\.\d+)?$/.test(s)) {
    return `${s}톤`;
  }

  // 그 외는 그대로
  return s;
};

// 🔧 담당자 출력 포맷 (이름/번호 조건부)
const buildManagerLine = (name, phone) => {
  if (!name && !phone) return ""; // 둘 다 없으면 아예 출력 안 함

  const safeName = name || "";
  const safePhone = phone ? ` (${phone})` : "";

  return `담당자 : ${safeName}${safePhone}`;
};
// =======================
// 🚚 기사 전달용 공통 문구
// =======================

// ❄️ 냉장/냉동 차량 안내 (끝에 줄바꿈 ❌)
const COLD_NOTICE = `★★★필독★★★ 냉장(0~10도 유지), 냉동(-18도 이하)

인수증 및 거래명세서, 타코메타 기록지까지 꼭!! 한 장씩 찍어서 보내주세요. 인수증은 증명서입니다. 
반드시 사진 촬영 후 문자 전송 부탁드립니다. 
미공유 시 운임 지급이 지연될 수 있습니다.

만약 서류가 없으면 상/하차 사진이라도 꼭 전송 부탁드립니다.
상/하차지 이슈 발생 시 반드시 사전 연락 바랍니다.
(사진 전송 후 전화는 안 주셔도 됩니다)`;

// 🚚 일반 차량용
const NORMAL_NOTICE = `★★★필독★★★ 미공유 시 운임 지급이 지연될 수 있습니다.

인수증(파렛전표) 또는 거래명세서는 반드시 서명 후 문자 전송 바랍니다. 하차지에 전달하는 경우 사진 먼저 촬영 후 업체에 전달해 주시면 됩니다.

인수증이 없는 경우 문자로 내용만 전달주세요.
상·하차 이슈 발생 시 반드시 사전 연락 바랍니다. 감사합니다.`;

  const diffDays = (a, b) => {
    if (!a || !b) return 0;
    return Math.round(
      (new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24)
    );
  };

  const timeOrNow = (t) => (t && t.trim() ? t : "즉시");

  const driverName =
    order.기사명 || order.이름 || order.기사 || "-";
  const driverPhone =
    order.전화번호 || order.전화 || "-";
 // 🔧 파렛트 추출 (1파 / 2파 / 3파렛트 / 3PLT 대응)
  const extractPallet = (text) => {
  if (!text || typeof text !== "string") return "";

  const t = text.replace(/\s+/g, "");

  let m = t.match(/(\d+)(파)(?!렛)/);
  if (m) return m[1];

  m = t.match(/(\d+)파렛트/);
  if (m) return m[1];

  m = t.match(/(\d+)(PLT|plt|p)/);
  if (m) return m[1];

  return "";
};
  // 🔧 [여기까지 추가]
  /* ===============================
     복사 로직
  =============================== */

  const copy = async (type) => {
    let text = "";

    /* =========================
       1️⃣ 차량번호 / 기사명 / 전화번호
    ========================= */
    if (type === "simple") {
      text = `${order.차량번호 || "-"} ${driverName} ${driverPhone}`;
    }

    /* =========================
       2️⃣ 운임 포함 (기존 함수 유지)
    ========================= */
    else if (type === "fare") {
      text = buildOrderCopyText(order);
    }

    /* =========================
       3️⃣ 전체 상세 (요청 포맷)
    ========================= */
    else if (type === "full") {
      const dayDiff = diffDays(order.상차일, order.하차일);

      let header = "";
      if (dayDiff === 1) {
        header = `익일 하차 건 (상차: ${md(order.상차일)} → 하차: ${md(order.하차일)})`;
      } else if (dayDiff >= 2) {
        header = `지정 하차 건 (상차: ${md(order.상차일)} → 하차: ${md(order.하차일)})`;
      }

      const pickupTime = timeOrNow(order.상차시간);
      const dropTimeRaw = timeOrNow(order.하차시간);
      const dropTime = dayDiff >= 1 ? `${md(order.하차일)} ${dropTimeRaw}` : dropTimeRaw;

      // 경유지 파싱
      const _ssM=(v)=>{if(Array.isArray(v)&&v.length>0)return v;if(typeof v==="string"&&v.trim().startsWith("[")){try{const p=JSON.parse(v);if(Array.isArray(p))return p;}catch{}}if(v&&typeof v==="object"&&!Array.isArray(v)){const ks=Object.keys(v);if(ks.length&&ks.every(k=>/^\d+$/.test(k)))return ks.sort((a,b)=>Number(a)-Number(b)).map(k=>v[k]);if(v.업체명)return[v];}return[];};
      const _ctM=(s)=>{const raw=s.화물내용||"";if(/파레트|파렛트|박스|통/.test(raw))return raw;const qty=raw||s.화물수량||"";const tp=s.화물타입||"";if(!qty)return"";return tp&&tp!=="없음"?`${qty}${tp}`:qty;};
      const _ttM=(s)=>{const raw=s.차량톤수||"";if(/톤|kg/.test(raw))return raw;const val=s.톤수값||raw||"";const tp=s.톤수타입||"";if(!val)return"";return tp&&tp!=="없음"?`${val}${tp}`:val;};
      const _pkgM=(str)=>{const s=String(str||"").trim().replace(/,/g,"");if(!s)return 0;const kg=s.match(/([\d.]+)\s*kg/i);if(kg)return parseFloat(kg[1]);const ton=s.match(/([\d.]+)\s*톤/);return ton?parseFloat(ton[1])*1000:0;};
      const _fkgM=(kg)=>{if(!kg)return"";if(kg>=1000){const t=kg/1000;return t.toFixed(3).replace(/\.?0+$/,"")+"톤";}return`${kg}kg`;};
      const _scM=(main,stops)=>{const all=[main,...stops.map(_ctM)].filter(Boolean);const byU={};const unk=[];for(const c of all){let hit=false;for(const u of["파레트","파렛트","박스","통","바구니"]){if(c.endsWith(u)){const n=parseFloat(c.slice(0,-u.length));if(!isNaN(n)){const k=u==="파렛트"?"파레트":u;byU[k]=(byU[k]||0)+n;hit=true;break;}}}if(!hit&&c)unk.push(c);}return[...Object.entries(byU).map(([u,n])=>`${n}${u}`),...unk].join("+");};

      const _pStopsMf=_ssM(order.경유상차목록||order.경유지_상차).filter(s=>s?.업체명?.trim());
      const _dStopsMf=_ssM(order.경유하차목록||order.경유지_하차).filter(s=>s?.업체명?.trim());
      const _totKgMf=_pkgM(order.차량톤수)+_dStopsMf.reduce((a,s)=>a+_pkgM(_ttM(s)),0)+_pStopsMf.reduce((a,s)=>a+_pkgM(_ttM(s)),0);
      const _totTonMf=_fkgM(_totKgMf)||normalizeTon(order.차량톤수)||"-";
      const _totCargoMf=_scM(order.화물내용,[..._pStopsMf,..._dStopsMf])||order.화물내용||"";
      const _pHasMf=_pStopsMf.length>0;
      const _dHasMf=_dStopsMf.length>0;
      const _pNumMf=_pHasMf?`${_pStopsMf.length+1}.`:"";
      const _dNumMf=_dHasMf?`${_dStopsMf.length+1}.`:"";
      const _pConMf=buildManagerLine(order.상차지담당자,order.상차지담당자번호);
      const _dConMf=buildManagerLine(order.하차지담당자,order.하차지담당자번호);
      const _pStopsTextMf=_pHasMf?_pStopsMf.map((s,i)=>{const cargo=_ctM(s);const ton=_ttM(s);return`${i+1}.상차경유지 : ${s.업체명||"-"}\n${s.주소||""}${s.담당자?`\n담당자 : ${s.담당자}${s.담당자번호?` (${s.담당자번호})`:""}`:``}${s.상차시간?`\n상차시간 : ${s.상차시간}`:""}${cargo?`\n화물내용 : ${cargo}`:""}${ton?`\n화물톤수 : ${ton}`:""}${s.방법?`\n상차방법 : ${s.방법}`:``}`;}).join("\n"):"";
      const _dStopsTextMf=_dHasMf?_dStopsMf.map((s,i)=>{const cargo=_ctM(s);const ton=_ttM(s);return`${i+1}.하차경유지 : ${s.업체명||"-"}\n${s.주소||""}${s.담당자?`\n담당자 : ${s.담당자}${s.담당자번호?` (${s.담당자번호})`:""}`:``}${s.하차시간?`\n하차시간 : ${s.하차시간}`:""}${cargo?`\n화물내용 : ${cargo}`:""}${ton?`\n화물톤수 : ${ton}`:""}${s.방법?`\n하차방법 : ${s.방법}`:``}`;}).join("\n"):"";
      const _mainDCargoMf=(_dHasMf||_pHasMf)&&order.화물내용?`\n화물내용 : ${order.화물내용}`:"";
      const _mainDTonMf=(_dHasMf||_pHasMf)&&order.차량톤수?`\n화물톤수 : ${normalizeTon(order.차량톤수)}`:"";

      text = `
${header ? header + "\n\n" : ""}${order.상차일} ${getYoil(order.상차일)}

${_pStopsTextMf ? _pStopsTextMf+"\n\n" : ""}${_pNumMf}상차지 : ${order.상차지명||"-"}
${order.상차지주소||""}${_pConMf?`\n${_pConMf}`:""}
상차시간 : ${pickupTime}
상차방법 : ${order.상차방법||"-"}

${_dStopsTextMf ? _dStopsTextMf+"\n\n" : ""}${_dNumMf}하차지 : ${order.하차지명||"-"}
${order.하차지주소||""}${_dConMf?`\n${_dConMf}`:""}${_mainDCargoMf}${_mainDTonMf}
하차시간 : ${dropTime}
하차방법 : ${order.하차방법||"-"}

중량 : ${_totTonMf}${_totCargoMf?` / ${_totCargoMf}`:""} ${order.차량종류||order.차종||""}

${order.차량번호} ${driverName} ${driverPhone}
${Number(order.청구운임||0).toLocaleString()}원 부가세별도 배차되었습니다.
`.trim();
}
    else if (type === "driver") {
      const carTypeText = String(order.차량종류 || order.차종 || "");
      const isColdVeh = carTypeText.includes("냉장") || carTypeText.includes("냉동");
      const isBanchan = (order.거래처명 || "").includes("반찬단지");

      const noticeBlock = isBanchan
        ? `[반찬단지 주의사항]\n- 안전화 착용 필수 (슬리퍼/크록스 금지)\n- 입차 시 지게차 기사님께 하차지명 말씀\n- 임원 주차장/사무동 옆 주차 금지, 도크 옆 주차`
        : "";

      const uploadUrl = `${window.location.origin}/upload?id=${order._id || order.id}`;

      const pm = (n, p) => (!n && !p) ? "" : p ? `담당자 : ${n || ""} (${p})` : `담당자 : ${n}`;

      let dateNotice2 = "";
      let dropTimeText2 = timeOrNow(order.하차시간);
      if (order.상차일 && order.하차일) {
        const s0 = new Date(order.상차일);
        const e0 = new Date(order.하차일);
        const diff2 = Math.round((e0 - s0) / (1000 * 60 * 60 * 24));
        const sm = s0.getMonth()+1, sd = s0.getDate();
        const em = e0.getMonth()+1, ed = e0.getDate();
        if (diff2 === 1) { dateNotice2 = `익일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`; dropTimeText2 = `${em}/${ed} ${timeOrNow(order.하차시간)}`; }
        else if (diff2 >= 2) { dateNotice2 = `지정일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`; dropTimeText2 = `${em}/${ed} ${timeOrNow(order.하차시간)}`; }
      }

      // 경유지 파싱
      const _ssMd=(v)=>{if(Array.isArray(v)&&v.length>0)return v;if(typeof v==="string"&&v.trim().startsWith("[")){try{const p=JSON.parse(v);if(Array.isArray(p))return p;}catch{}}if(v&&typeof v==="object"&&!Array.isArray(v)){const ks=Object.keys(v);if(ks.length&&ks.every(k=>/^\d+$/.test(k)))return ks.sort((a,b)=>Number(a)-Number(b)).map(k=>v[k]);if(v.업체명)return[v];}return[];};
      const _ctMd=(s)=>{const raw=s.화물내용||"";if(/파레트|파렛트|박스|통/.test(raw))return raw;const qty=raw||s.화물수량||"";const tp=s.화물타입||"";if(!qty)return"";return tp&&tp!=="없음"?`${qty}${tp}`:qty;};
      const _ttMd=(s)=>{const raw=s.차량톤수||"";if(/톤|kg/.test(raw))return raw;const val=s.톤수값||raw||"";const tp=s.톤수타입||"";if(!val)return"";return tp&&tp!=="없음"?`${val}${tp}`:val;};
      const _pkgMd=(str)=>{const s=String(str||"").trim().replace(/,/g,"");if(!s)return 0;const kg=s.match(/([\d.]+)\s*kg/i);if(kg)return parseFloat(kg[1]);const ton=s.match(/([\d.]+)\s*톤/);return ton?parseFloat(ton[1])*1000:0;};
      const _fkgMd=(kg)=>{if(!kg)return"";if(kg>=1000){const t=kg/1000;return t.toFixed(3).replace(/\.?0+$/,"")+"톤";}return`${kg}kg`;};
      const _scMd=(main,stops)=>{const all=[main,...stops.map(_ctMd)].filter(Boolean);const byU={};const unk=[];for(const c of all){let hit=false;for(const u of["파레트","파렛트","박스","통","바구니"]){if(c.endsWith(u)){const n=parseFloat(c.slice(0,-u.length));if(!isNaN(n)){const k=u==="파렛트"?"파레트":u;byU[k]=(byU[k]||0)+n;hit=true;break;}}}if(!hit&&c)unk.push(c);}return[...Object.entries(byU).map(([u,n])=>`${n}${u}`),...unk].join("+");};

      const _pStopsMd=_ssMd(order.경유상차목록||order.경유지_상차).filter(s=>s?.업체명?.trim());
      const _dStopsMd=_ssMd(order.경유하차목록||order.경유지_하차).filter(s=>s?.업체명?.trim());
      const _totKgMd=_pkgMd(order.차량톤수)+_dStopsMd.reduce((a,s)=>a+_pkgMd(_ttMd(s)),0)+_pStopsMd.reduce((a,s)=>a+_pkgMd(_ttMd(s)),0);
      const _totTonMd=_fkgMd(_totKgMd)||normalizeTon(order.차량톤수)||"-";
      const _totCargoMd=_scMd(order.화물내용,[..._pStopsMd,..._dStopsMd])||order.화물내용||"";
      const _pHasMd=_pStopsMd.length>0;
      const _dHasMd=_dStopsMd.length>0;
      const _pNumMd=_pHasMd?`${_pStopsMd.length+1}.`:"";
      const _dNumMd=_dHasMd?`${_dStopsMd.length+1}.`:"";
      const pickupMgr = pm(order.상차지담당자, order.상차지담당자번호);
      const dropMgr = pm(order.하차지담당자, order.하차지담당자번호);
      const _pStopsTextMd=_pHasMd?_pStopsMd.map((s,i)=>{const cargo=_ctMd(s);const ton=_ttMd(s);return`${i+1}.상차경유지 : ${s.업체명||"-"}\n${s.주소||""}${s.담당자?`\n담당자 : ${s.담당자}${s.담당자번호?` (${s.담당자번호})`:""}`:``}${s.상차시간?`\n상차시간 : ${s.상차시간}`:""}${cargo?`\n화물내용 : ${cargo}`:""}${ton?`\n화물톤수 : ${ton}`:""}${s.방법?`\n상차방법 : ${s.방법}`:``}`;}).join("\n"):"";
      const _dStopsTextMd=_dHasMd?_dStopsMd.map((s,i)=>{const cargo=_ctMd(s);const ton=_ttMd(s);return`${i+1}.하차경유지 : ${s.업체명||"-"}\n${s.주소||""}${s.담당자?`\n담당자 : ${s.담당자}${s.담당자번호?` (${s.담당자번호})`:""}`:``}${s.하차시간?`\n하차시간 : ${s.하차시간}`:""}${cargo?`\n화물내용 : ${cargo}`:""}${ton?`\n화물톤수 : ${ton}`:""}${s.방법?`\n하차방법 : ${s.방법}`:``}`;}).join("\n"):"";
      const _mainDCargoMd=(_dHasMd||_pHasMd)&&order.화물내용?`\n화물내용 : ${order.화물내용}`:"";
      const _mainDTonMd=(_dHasMd||_pHasMd)&&order.차량톤수?`\n화물톤수 : ${normalizeTon(order.차량톤수)}`:"";

      text = `[파렛전표/거래명세서 업로드]
미 전송시 운임 지연 될 수 있습니다.
👇👇👇👇👇👇👇👇👇👇👇👇
${uploadUrl}

${dateNotice2}${order.상차일 || ""} ${getYoil(order.상차일)}

${_pStopsTextMd ? _pStopsTextMd+"\n\n" : ""}${_pNumMd}상차 : ${order.상차지명||"-"} / ${timeOrNow(order.상차시간)}
${order.상차지주소||""}${pickupMgr?`\n${pickupMgr}`:""}
상차방법 : ${order.상차방법||"-"}

${_dStopsTextMd ? _dStopsTextMd+"\n\n" : ""}${_dNumMd}하차 : ${order.하차지명||"-"} / ${dropTimeText2}
${order.하차지주소||""}${dropMgr?`\n${dropMgr}`:""}${_mainDCargoMd}${_mainDTonMd}
하차방법 : ${order.하차방법||"-"}

화물 : ${_totTonMd}${_totCargoMd?` / ${_totCargoMd}`:""} ${order.차량종류||order.차종||""}${noticeBlock?`\n\n${noticeBlock}`:""}

※ 인수증(파렛전표) 서명 받은 후 업로드
※ 거래명세서${isColdVeh ? "/타코메타 기록지" : ""} 함께 촬영
※ 서류/전표 없는 건이면 업로드 하지마세요.
※ 미업로드 시 운임 지급 지연될 수 있습니다`.replace(/\n{3,}/g, "\n\n").trim();
}

    // ── 클립보드 복사 + 완료 처리
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // iOS 등 clipboard API 미지원 시 fallback
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }

    if (type === "full" || type === "driver") {
      onCopySuccess?.("기사 문자 복사 완료");
      onAfterFullCopy?.();
      return;
    }

    alert("복사되었습니다.");
    onClose();
  };

  /* ===============================
     UI
  =============================== */

  const options = [
    {
      type: "simple",
      label: "차량 · 기사 · 연락처",
      desc: "차량번호 / 기사명 / 전화번호",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
      ),
    },
    {
      type: "fare",
      label: "운임 포함",
      desc: "부가세 / 선불 / 착불 형식",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
        </svg>
      ),
    },
    {
      type: "full",
      label: "전체 상세",
      desc: "상하차 + 화물 + 기사 정보",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
        </svg>
      ),
    },
    {
      type: "driver",
      label: "기사 전달용",
      desc: "운행 정보 + 업로드 링크 포함",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M19 8v6M22 11h-6"/>
        </svg>
      ),
      primary: true,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-2xl pb-8 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* 타이틀 */}
        <div className={`px-5 pb-3 border-b ${cardVersionB ? "border-gray-100" : "border-gray-100"}`}>
          <div className={`font-bold text-[15px] ${cardVersionB ? "text-[#1B2B4B]" : "text-gray-900"}`}>
            복사 형식 선택
          </div>
          <div className="text-[12px] text-gray-400 mt-0.5">
            {order.상차지명} → {order.하차지명}
          </div>
        </div>

        {/* 옵션 목록 */}
        <div className="px-4 py-3 space-y-2">
          {options.map(({ type, label, desc, icon, primary }) => (
            <button
              key={type}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-colors active:scale-[0.98] ${
                primary
                  ? cardVersionB
                    ? "bg-[#1B2B4B] text-white"
                    : "bg-[#1B2B4B] text-white"
                  : cardVersionB
                    ? "bg-gray-50 border border-gray-200 text-gray-800"
                    : "bg-gray-50 border border-gray-200 text-gray-800"
              }`}
              onClick={() => copy(type)}
            >
              <span className={primary ? "text-white/80" : "text-gray-400"}>
                {icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className={`text-[13px] font-semibold ${primary ? "text-white" : "text-gray-800"}`}>
                  {label}
                </div>
                <div className={`text-[11px] mt-0.5 ${primary ? "text-white/70" : "text-gray-400"}`}>
                  {desc}
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={primary ? "rgba(255,255,255,0.6)" : "#CBD5E1"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          ))}
        </div>

        {/* 취소 */}
        <div className="px-4">
          <button
            onClick={onClose}
            className={`w-full py-3 rounded-xl text-[13px] font-semibold ${
              cardVersionB ? "bg-gray-100 text-gray-500" : "border border-gray-200 text-gray-500 bg-white"
            }`}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
// ======================================================================
// 공통 RowLabelInput
// ======================================================================
function RowLabelInput({ label, input, right }) {
  return (
    <div className="flex border-b last:border-b-0 overflow-hidden">
      <div className="w-[88px] shrink-0 px-2 py-2 text-[11px] text-gray-600 bg-gray-50 flex items-center justify-between">
        <span className="whitespace-nowrap">{label}</span>
        {right && <span className="ml-1">{right}</span>}
      </div>
      <div className="flex-1 min-w-0 px-2 py-2 overflow-hidden">{input}</div>
    </div>
  );
}

// ======================================================================
// 📌 지명 자동완성 (표준운임표 상/하차지명)
// ======================================================================
function MobilePlaceSuggest({ value, onChange, names = [], placeholder }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);

  useEffect(() => { setQuery(value || ""); }, [value]);

  const filtered = useMemo(() => {
    const q = (query || "").replace(/\s+/g, "").toLowerCase();
    if (!q || q.length < 1) return [];
    return names
      .map(n => {
        const nc = n.replace(/\s+/g, "").toLowerCase();
        if (nc === q) return { name: n, score: 100 };
        if (nc.startsWith(q)) return { name: n, score: 80 };
        if (nc.includes(q)) return { name: n, score: 60 };
        if (q.includes(nc.slice(0, 2))) return { name: n, score: 40 };
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(x => x.name);
  }, [query, names]);

  return (
    <div className="relative">
      <input
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B] bg-gray-50"
        placeholder={placeholder}
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
          {filtered.map((n, i) => (
            <div
              key={i}
              className="px-4 py-2.5 text-[13px] cursor-pointer hover:bg-blue-50 text-gray-700 border-b border-gray-50 last:border-0"
              onMouseDown={() => { setQuery(n); onChange(n); setOpen(false); }}
            >
              {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ======================================================================
// 📌 내정보 페이지
// ======================================================================
function MobileMyInfo({ currentUser, mobileUsers, loginTime, orders = [], userCompany = "", onBack }) {
  const me = mobileUsers?.find(u => u.id === currentUser?.uid);
  const myName = me?.name || currentUser?.displayName || currentUser?.email?.split("@")[0] || "사용자";
  const myEmail = currentUser?.email || "";
  const myRole = me?.role || me?.직책 || "";
  const myPhone = me?.phone || me?.전화번호 || "";
  const myCompany = userCompany || me?.companyName || localStorage.getItem("userCompany") || "";

  const todayStr = new Date().toISOString().slice(0, 10);
  const thisMonth = new Date().toISOString().slice(0, 7);

  const myOrders = orders.filter(o => {
    const author = o.작성자 || o.등록자 || "";
    return author === myName || author === currentUser?.email;
  });
  const totalCount = myOrders.length;
  const thisMonthCount = myOrders.filter(o => (o.상차일 || "").startsWith(thisMonth)).length;
  const completedCount = myOrders.filter(o => o.배차상태 === "배차완료").length;
  const todayCount = myOrders.filter(o => (o.상차일 || "") === todayStr).length;

  const fmtTime = (date) => {
    if (!date) return "-";
    return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const avatarLetter = myName.slice(0, 1).toUpperCase();

  return (
    <div className="px-4 py-5 space-y-4 pb-24">
      {/* 프로필 카드 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-[#1B2B4B] px-5 py-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white text-[22px] font-extrabold border-2 border-white/30">
            {avatarLetter}
          </div>
          <div>
            <div className="text-white text-[17px] font-extrabold tracking-tight">{myName}</div>
            {myRole && <div className="text-white/60 text-[12px] mt-0.5">{myRole}</div>}
            <div className="text-white/50 text-[11px] mt-1">{myEmail}</div>
          </div>
        </div>
        <div className="px-5 py-4 space-y-2">
          {myCompany && (
            <div className="flex items-center justify-between py-1 border-b border-gray-50">
              <span className="text-[12px] text-gray-400">회사명</span>
              <span className="text-[13px] font-semibold text-gray-800">{myCompany}</span>
            </div>
          )}
          {myPhone && (
            <div className="flex items-center justify-between py-1 border-b border-gray-50">
              <span className="text-[12px] text-gray-400">연락처</span>
              <span className="text-[13px] font-semibold text-gray-800">{myPhone}</span>
            </div>
          )}
          <div className="flex items-center justify-between py-1 border-b border-gray-50">
            <span className="text-[12px] text-gray-400">로그인 시간</span>
            <span className="text-[13px] font-semibold text-gray-800">{fmtTime(loginTime)}</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-[12px] text-gray-400">계정</span>
            <span className="text-[12px] text-gray-500 font-mono">{currentUser?.uid?.slice(-8) || "-"}</span>
          </div>
        </div>
      </div>

      {/* 활동 통계 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-3">내 활동 통계</div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "오늘 등록", value: todayCount, color: "text-blue-600" },
            { label: "이번 달", value: thisMonthCount, color: "text-indigo-600" },
            { label: "배차완료", value: completedCount, color: "text-emerald-600" },
            { label: "전체 등록", value: totalCount, color: "text-gray-700" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
              <div className={`text-[22px] font-extrabold ${color}`}>{value}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 앱 정보 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider px-4 pt-4 pb-2">앱 정보</div>
        {[
          { label: "앱 이름", value: "(주)KP-Flow 모바일" },
          { label: "버전", value: `v${typeof APP_VERSION !== "undefined" ? APP_VERSION : "–"}` },
          { label: "플랫폼", value: navigator.userAgent.includes("Android") ? "Android" : navigator.userAgent.includes("iPhone") ? "iOS" : "Web" },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3 border-t border-gray-50">
            <span className="text-[12px] text-gray-400">{label}</span>
            <span className="text-[12px] font-semibold text-gray-700">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ======================================================================
// 📌 모바일 전국운임 조회 (T-Map 도로거리 기반)
// ======================================================================
const MOBILE_TMAP_KEY = "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer";

const MOBILE_FARE_TYPES = [
  { label: "라보",   base: 58000,  perKm: 405  },
  { label: "1톤",   base: 50000,  perKm: 633  },
  { label: "1.4톤", base: 55000,  perKm: 696  },
  { label: "2.5톤", base: 65000,  perKm: 823  },
  { label: "3.5톤", base: 72000,  perKm: 924  },
  { label: "5톤",   base: 82000,  perKm: 1051 },
  { label: "5톤축", base: 87000,  perKm: 1114 },
  { label: "11톤",  base: 105000, perKm: 1329 },
  { label: "14톤",  base: 112000, perKm: 1430 },
  { label: "18톤",  base: 125000, perKm: 1582 },
  { label: "25톤",  base: 132000, perKm: 1684 },
  { label: "장재물", base: null,   perKm: null  },
];

const MOBILE_VEHICLE_CATEGORIES = [
  { label: "카고",       multiplier: 1.0 },
  { label: "카고/윙",   multiplier: 1.0 },
  { label: "윙바디",    multiplier: 1.0 },
  { label: "리프트",    multiplier: 1.1 },
  { label: "리프트윙",  multiplier: 1.1 },
  { label: "탑",        multiplier: 1.05 },
  { label: "리프트탑",  multiplier: 1.15 },
  { label: "냉동탑",    multiplier: 1.4 },
  { label: "냉동윙바디", multiplier: 1.4 },
  { label: "냉장탑",    multiplier: 1.35 },
  { label: "냉장윙바디", multiplier: 1.35 },
  { label: "호루",      multiplier: 1.0 },
];

function MobileAddressSearch({ value, onChange, onSelect, placeholder }) {
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const debRef = useRef(null);

  useEffect(() => { setQuery(value || ""); }, [value]);

  const fetchSugg = async (kw) => {
    if (!kw.trim() || kw.length < 2) { setSuggestions([]); return; }
    try {
      const ADDR_NORM = [
        ["서울특별시","서울"],["서울시","서울"],["부산광역시","부산"],["대구광역시","대구"],
        ["인천광역시","인천"],["광주광역시","광주"],["대전광역시","대전"],["울산광역시","울산"],
        ["세종특별자치시","세종"],["세종시","세종"],["경기도","경기"],
        ["강원특별자치도","강원"],["강원도","강원"],
        ["충청북도","충북"],["충청남도","충남"],
        ["전라북도","전북"],["전북특별자치도","전북"],["전라남도","전남"],
        ["경상북도","경북"],["경상남도","경남"],
        ["제주특별자치도","제주"],["제주도","제주"],
      ];
      let normKw = kw;
      for (const [f, t] of ADDR_NORM) normKw = normKw.split(f).join(t);
      const kwWords = normKw.trim().split(/\s+/).filter(Boolean);

      const isGeneralSearch = kwWords.length <= 2 && !/(읍|면|동|리)$/.test(normKw.trim());
      const isDongSearch = /(동|읍|면)$/.test(normKw.trim());

      const addrSearchP = fetch(
        `https://apis.openapi.sk.com/tmap/searchAddress?version=1&format=json&queryVersion=1&addressFlag=F00&fullAddrOnOff=Y&searchKeyword=${encodeURIComponent(kw)}&countPerPage=20&appKey=${MOBILE_TMAP_KEY}`,
        { headers: { Accept: "application/json" } }
      ).then(r => r.json()).catch(() => null);

      const poisQueries = [
        { q: kw, count: 30 },
        ...(isGeneralSearch ? [
          { q: kw + " 면사무소", count: 20 },
          { q: kw + " 읍사무소", count: 10 },
          { q: kw + " 주민센터", count: 20 },
        ] : []),
        ...(isDongSearch ? [
          { q: kw + " 주민센터", count: 10 },
          { q: kw + " 행정복지센터", count: 10 },
        ] : []),
      ];
      const allPoisP = Promise.all(
        poisQueries.map(({ q, count }) =>
          fetch(`https://apis.openapi.sk.com/tmap/pois?version=1&format=json&searchKeyword=${encodeURIComponent(q)}&count=${count}&appKey=${MOBILE_TMAP_KEY}`,
            { headers: { Accept: "application/json" } })
            .then(r => r.json()).then(d => d?.searchPoiInfo?.pois?.poi || []).catch(() => [])
        )
      ).then(arr => arr.flat());

      const [addrSearch, allPois] = await Promise.all([addrSearchP, allPoisP]);

      const rawResults = [];
      const addrRaw = addrSearch?.searchAddressInfo?.addressInfo;
      const addrInfos = Array.isArray(addrRaw) ? addrRaw : (addrRaw ? [addrRaw] : []);
      for (const item of addrInfos) {
        const fullAddr = (item.fullAddress || item.fullAddressRoad || "").trim();
        if (!fullAddr) continue;
        rawResults.push({ address: fullAddr, specificity: 4, lat: parseFloat(item.lat || item.newLat || 0), lon: parseFloat(item.lon || item.newLon || 0) });
      }
      const kwStem = normKw.trim().replace(/[동읍면리]$/, "");
      for (const p of allPois) {
        const upper = p.upperAddrName || "";
        const middle = p.middleAddrName || "";
        const low = p.lowAddrName || "";
        if (!upper || !middle) continue;
        const addr = [upper, middle, low].filter(Boolean).join(" ");
        let addrNorm = addr.replace(/\s+/g, "");
        for (const [f, t] of ADDR_NORM) addrNorm = addrNorm.split(f).join(t);
        const matches = kwWords.every(w => {
          const wStem = w.replace(/[동읍면리]$/, "");
          return addrNorm.includes(w) || addrNorm.includes(wStem) || addrNorm.includes(kwStem);
        });
        if (!matches) continue;
        rawResults.push({ address: addr, specificity: low ? 3 : 2, lat: parseFloat(p.noorLat || p.frontLat || 0), lon: parseFloat(p.noorLon || p.frontLon || 0) });
        // lowAddrName 없을 때 POI 이름에서 동/읍/면 추출 보완
        if (!low) {
          const dm = (p.name || "").match(/([가-힣\d]+(?:동|읍|면))/);
          if (dm) rawResults.push({ address: [upper, middle, dm[1]].join(" "), specificity: 3, lat: parseFloat(p.noorLat || 0), lon: parseFloat(p.noorLon || 0) });
        }
      }

      if (rawResults.length > 0) {
        rawResults.sort((a, b) => b.specificity - a.specificity);
        const seen = new Set();
        const results = [];
        for (const item of rawResults) {
          if (seen.has(item.address)) continue;
          seen.add(item.address);
          results.push({ address: item.address, lat: item.lat, lon: item.lon });
          if (results.length >= 15) break;
        }
        if (results.length > 0) { setSuggestions(results); return; }
      }
      // fallback: fullAddrGeo
      const url2 = `https://apis.openapi.sk.com/tmap/geo/fullAddrGeo?version=1&format=json&fullAddr=${encodeURIComponent(kw)}`;
      const res2 = await fetch(url2, { headers: { appKey: MOBILE_TMAP_KEY, Accept: "application/json" } });
      const data2 = await res2.json();
      const coords = data2?.coordinateInfo?.coordinate || [];
      setSuggestions(
        coords.slice(0, 6)
          .map(c => ({ address: c.fullAddrjibun || c.fullAddrRoad || "", lat: parseFloat(c.lat || "0"), lon: parseFloat(c.lon || "0") }))
          .filter(s => s.address)
      );
    } catch { setSuggestions([]); }
  };

  const handleChange = (e) => {
    const v = e.target.value;
    setQuery(v); onChange(v); onSelect(null); setOpen(true);
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => fetchSugg(v), 300);
  };

  const handleSelect = (s) => {
    setQuery(s.address); onChange(s.address); onSelect(s);
    setSuggestions([]); setOpen(false);
  };

  return (
    <div className="relative">
      <input
        className="w-full px-3 py-2.5 text-[14px] rounded-xl border border-gray-200 bg-white focus:border-[#1B2B4B] focus:outline-none placeholder:text-gray-300"
        placeholder={placeholder}
        value={query}
        onChange={handleChange}
        onFocus={() => { setOpen(true); if (query.length >= 2) fetchSugg(query); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
          {suggestions.map((s, i) => (
            <div
              key={i}
              className="px-4 py-3 text-[13px] cursor-pointer hover:bg-blue-50 text-gray-700 border-b border-gray-50 last:border-0"
              onMouseDown={() => handleSelect(s)}
            >
              {s.address}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileNationalFare({ onBack }) {
  const [nfFrom, setNfFrom] = useState("");
  const [nfTo, setNfTo] = useState("");
  const [nfFromCoord, setNfFromCoord] = useState(null);
  const [nfToCoord, setNfToCoord] = useState(null);
  const [nfVehicleCat, setNfVehicleCat] = useState(0);
  const [nfLoading, setNfLoading] = useState(false);
  const [nfResult, setNfResult] = useState(null);
  const [nfError, setNfError] = useState("");

  const geocodeTmap = async (addr) => {
    const url = `https://apis.openapi.sk.com/tmap/geo/fullAddrGeo?version=1&format=json&fullAddr=${encodeURIComponent(addr)}`;
    const res = await fetch(url, { headers: { appKey: MOBILE_TMAP_KEY, Accept: "application/json" } });
    const data = await res.json();
    const coord = data?.coordinateInfo?.coordinate?.[0];
    if (!coord) throw new Error(`"${addr}" 주소를 찾을 수 없습니다`);
    return { lat: parseFloat(coord.lat), lon: parseFloat(coord.lon) };
  };

  const getRouteKm = async (from, to) => {
    const url = `https://apis.openapi.sk.com/tmap/routes?version=1&format=json&appKey=${MOBILE_TMAP_KEY}`;
    const body = new URLSearchParams({
      startX: String(from.lon), startY: String(from.lat),
      endX: String(to.lon),   endY: String(to.lat),
      reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO",
      searchOption: "0", startName: "출발지", endName: "도착지",
    });
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
    if (!res.ok) { const t = await res.text(); throw new Error(`경로 조회 실패 (${res.status}): ${t.slice(0, 80)}`); }
    const data = await res.json();
    const dist = data?.features?.[0]?.properties?.totalDistance;
    if (!dist) throw new Error("경로를 찾을 수 없습니다 (주소를 더 정확히 입력해 주세요)");
    return Math.round(dist / 1000);
  };

  const calcFare = (km, { base, perKm }, multiplier) => {
    if (!base) return null;
    let effKm = perKm;
    if (km > 100) effKm = perKm * (1 - Math.min(0.3, (km - 100) / 1000));
    return Math.round(((base + Math.round(effKm * km)) * multiplier) / 5000) * 5000;
  };

  const lookup = async () => {
    if (!nfFrom.trim() || !nfTo.trim()) { setNfError("출발지와 도착지를 모두 입력하세요"); return; }
    setNfLoading(true); setNfError(""); setNfResult(null);
    try {
      const fromCoord = nfFromCoord || await geocodeTmap(nfFrom);
      const toCoord = nfToCoord || await geocodeTmap(nfTo);
      const km = await getRouteKm(fromCoord, toCoord);
      setNfResult({ km, from: nfFrom, to: nfTo });
    } catch (err) { setNfError(err.message || "조회 중 오류가 발생했습니다"); }
    finally { setNfLoading(false); }
  };

  const cat = MOBILE_VEHICLE_CATEGORIES[nfVehicleCat];

  return (
    <div className="px-4 py-4 space-y-4">
      {/* 뒤로가기 */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[#1B2B4B] text-[13px] font-semibold py-1"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        뒤로가기
      </button>

      {/* 주소 입력 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div>
          <div className="text-[12px] font-bold text-gray-500 mb-1.5">출발지 주소</div>
          <MobileAddressSearch
            value={nfFrom}
            onChange={v => { setNfFrom(v); setNfFromCoord(null); }}
            onSelect={s => { if (s) { setNfFrom(s.address); setNfFromCoord(s); } }}
            placeholder="예: 인천광역시 서구 원창동"
          />
        </div>
        <div>
          <div className="text-[12px] font-bold text-gray-500 mb-1.5">도착지 주소</div>
          <MobileAddressSearch
            value={nfTo}
            onChange={v => { setNfTo(v); setNfToCoord(null); }}
            onSelect={s => { if (s) { setNfTo(s.address); setNfToCoord(s); } }}
            placeholder="예: 경기도 용인시 처인구"
          />
        </div>

        {/* 차량 유형 */}
        <div>
          <div className="text-[12px] font-bold text-gray-500 mb-1.5">차량 유형</div>
          <select
            className="w-full px-3 py-2.5 text-[14px] rounded-xl border border-gray-200 bg-white"
            value={nfVehicleCat}
            onChange={e => setNfVehicleCat(Number(e.target.value))}
          >
            {MOBILE_VEHICLE_CATEGORIES.map((c, i) => (
              <option key={i} value={i}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={lookup}
            disabled={nfLoading}
            className="flex-1 py-3 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {nfLoading ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                </svg>
                계산 중...
              </>
            ) : "조회하기"}
          </button>
          <button
            onClick={() => { setNfFrom(""); setNfTo(""); setNfFromCoord(null); setNfToCoord(null); setNfResult(null); setNfError(""); }}
            className="px-4 py-3 rounded-xl border border-gray-200 text-gray-500 text-[13px] font-semibold"
          >
            초기화
          </button>
        </div>

        {nfError && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-600">{nfError}</div>
        )}
      </div>

      {/* 운임 결과 */}
      {nfResult && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-[#1B2B4B] px-4 py-3">
            <div className="text-white font-bold text-[13px] truncate">{nfResult.from} → {nfResult.to}</div>
            <div className="text-white/60 text-[12px] mt-0.5">
              도로거리 {nfResult.km}km · {cat.label}
              {cat.multiplier > 1 && <span className="ml-1 text-blue-300">({Math.round((cat.multiplier-1)*100)}% 할증)</span>}
            </div>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-2 gap-0 border border-gray-100 rounded-xl overflow-hidden">
              {MOBILE_FARE_TYPES.map((ft, i) => {
                const fare = calcFare(nfResult.km, ft, cat.multiplier);
                return (
                  <div key={ft.label} className={`flex items-center justify-between px-3 py-2.5 border-b border-gray-50 ${i % 2 === 0 ? "border-r border-gray-100" : ""}`}>
                    <span className="text-[13px] font-semibold text-[#1B2B4B]">{ft.label}</span>
                    <span className="text-[13px] font-bold text-gray-800">
                      {fare ? `${fare.toLocaleString()}원` : <span className="text-[12px] text-gray-400 font-normal">별도협의</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="px-4 pb-4 space-y-1">
            <div className="text-[11px] text-gray-400">● 예상단가로 실제 운임은 수작업·상하차 조건 등에 따라 변동될 수 있습니다.</div>
            <div className="text-[11px] text-gray-400">● T-Map 도로거리 기준 산정, 실제 경로에 따라 차이가 있을 수 있습니다.</div>
          </div>
        </div>
      )}

      {!nfResult && !nfLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="mb-3 opacity-30">
            <rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 4v4h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
          </svg>
          <div className="text-[14px] font-semibold mb-1">출발지와 도착지를 입력하세요</div>
          <div className="text-[12px]">T-Map 도로거리 기반 차종별 예상 운임</div>
        </div>
      )}
    </div>
  );
}

// ======================================================================
// 📌 모바일 표준운임표 — 흰 화면 100% 해결 버전
// ======================================================================
function MobileStandardFare({ onBack }) {

  const [dispatchData, setDispatchData] = useState([]);

  const [pickup, setPickup] = useState("");
  const [showSimilarPopup, setShowSimilarPopup] = useState(false);
const [fallbackData, setFallbackData] = useState([]);
  const [showFareSummaryPopup, setShowFareSummaryPopup] = useState(false);
  const [fareSummary, setFareSummary] = useState(null);
  const [showNoResultPopup, setShowNoResultPopup] = useState(false);
const [showAddressConfirmPopup, setShowAddressConfirmPopup] = useState(false);
  const [pickupAddr, setPickupAddr] = useState("");
  const [drop, setDrop] = useState("");
  const [dropAddr, setDropAddr] = useState("");
  const [cargo, setCargo] = useState("");
  const [ton, setTon] = useState("");
  const [vehicle, setVehicle] = useState("전체");
  const [matchedRows, setMatchedRows] = useState([]);
  const [result, setResult] = useState(null);
  const [aiFare, setAiFare] = useState(null);
  const [strictMatchOnly, setStrictMatchOnly] = useState(false);
  const [fareDetailItemStd, setFareDetailItemStd] = useState(null);

  // 🔥 Firestore 로딩
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, collName));
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setDispatchData(arr);
    })();
  }, []);

  const pickupNames = useMemo(() =>
    [...new Set(dispatchData.map(r => r.상차지명).filter(Boolean))].sort(),
    [dispatchData]
  );
  const dropNames = useMemo(() =>
    [...new Set(dispatchData.map(r => r.하차지명).filter(Boolean))].sort(),
    [dispatchData]
  );

  // 🔥 preset 자동 입력
useEffect(() => {
  if (!window.__farePreset__) return;
  if (!dispatchData.length) return;

  const p = window.__farePreset__;

  setPickup(p.pickup || "");
  setPickupAddr(p.pickupAddr || "");
  setDrop(p.drop || "");
  setDropAddr(p.dropAddr || "");
  setTon(p.ton || "");
  setCargo(p.cargo || "");

  window.__farePreset__ = null;
window.__forceFareSearch__ = true;
}, [dispatchData]);
// 🔥 값 세팅 후 자동 조회 (핵심)
useEffect(() => {
  if (!pickup || !drop) return;

  if (window.__forceFareSearch__) {
    window.__forceFareSearch__ = false;
    calcFareMobile();
  }

}, [pickup, drop]);

// =======================
// 🔥 공통 유틸 함수 (정상 구조)
// =======================

// 문자열 정리
const clean = (s = "") =>
  String(s || "").trim().toLowerCase().replace(/\s+/g, "");

// 🔥 경유지 제거 + 메인 장소 추출
const extractMainPlace = (s = "") => {
  return String(s || "")
    .replace(/^\d+\./, "")
    .split(/\d+\./)[0]
    .trim();
};

// 🔥 검색용 정규화
const normalizePlace = (s = "") =>
  extractMainPlace(s)
    .toLowerCase()
    .replace(/\s+/g, "");

// 🔥 기존 코드 호환
const removeStopPrefix = (s = "") => extractMainPlace(s);

// 🔥 화물 숫자 추출
const extractCargoNumber = (text = "") => {
  const m = String(text).match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

// 🔥 톤수 추출
const extractTonNum = (text = "") => {
  
  const cleanText = String(text).replace(/톤|t/gi, "");
  const m = cleanText.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};
// 🔥 kg → ton 변환 (여기에 추가!!)
const convertKgToTon = (text = "") => {
  const t = String(text).toLowerCase();

  if (!t.includes("kg")) return null;

  const m = t.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;

  const kg = Number(m[1]);

  return kg / 1000; // 🔥 핵심
};
// =======================
// 🔥 주소 fallback용 (여기 따로 있어야 함)
// =======================

const extractRegion = (addr = "") => {
  const parts = addr.split(" ");
  return parts[1] || parts[0] || "";
};

const searchByAddress = () => {

  const pickupRegion = extractRegion(pickupAddr);
  const dropRegion = extractRegion(dropAddr);

  const result = dispatchData.filter(r => {
    if ((r.상차일 || "").slice(0, 10) === todayKST()) return false;
    const pAddr = r.상차지주소 || "";
    const dAddr = r.하차지주소 || "";

    return (
      pAddr.includes(pickupRegion) &&
      dAddr.includes(dropRegion)
    );
  });

  setMatchedRows(result);
};

// =======================
// 🔥 화물 유사도 (이건 따로)
// =======================

const cargoSimilarityScore = (inputCargo, rowCargo) => {

  const inputNum = extractCargoNumber(inputCargo);
  const rowNum = extractCargoNumber(rowCargo);

  if (inputNum == null || rowNum == null) return 30;

  const diff = Math.abs(inputNum - rowNum);

  if (diff === 0) return 100;
  if (diff <= 1) return 80;
  if (diff <= 2) return 65;
  if (diff <= 4) return 45;
  if (diff <= 6) return 30;

  return 15;
};
 useEffect(() => {
  (async () => {
    const snap = await getDocs(collection(db, collName));
    const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setDispatchData(arr);
  })();
}, []);

// 🔥 파렛트 여부 판단
const isPalletCargo = (text = "") => {
  const t = String(text).toLowerCase();

  return (
    /파렛|파레트|plt/.test(t) ||
    /^\d+$/.test(t)
  );
};

// 🔥 박스/잡짐 판단
const isBoxCargo = (text = "") => {
  const t = String(text).toLowerCase();

  return (
    t.includes("박스") ||
    t.includes("box") ||
    t.includes("롤") ||
    t.includes("짐")
  );
};
const calcFareMobile = () => {
  const isForced = window.__forceFareSearch__;
  window.__forceFareSearch__ = false;

 const hasPickup = pickup.trim() || pickupAddr.trim();
const hasDrop = drop.trim() || dropAddr.trim();

if (!isForced && (!hasPickup || !hasDrop)) {
  alert("상차지명 또는 주소 / 하차지명 또는 주소를 입력하세요.");
  return;
}

const normPickup = clean(pickup);
const normDrop   = clean(drop);
  const inputTonNum = extractTonNum(ton);
const inputCargoNum = extractCargoNumber(cargo);

let inputTonNum2 = extractTonNum(ton);

// 🔥 kg 입력 시 자동 변환 (여기!!)
if (inputTonNum2 == null) {
  inputTonNum2 = convertKgToTon(cargo);
}

let filtered = dispatchData.filter(r => {
  if ((r.상차일 || "").slice(0, 10) === todayKST()) return false;
  // 🔥 경유지 제거 유지 (이건 남기는게 좋다)
  if (/\d+\./.test(r.상차지명 || "") || /\d+\./.test(r.하차지명 || "")) {
    return false;
  }

const rowPickup = normalizePlace(r.상차지명 || "");
const rowDrop   = normalizePlace(r.하차지명 || "");

const rowPickupAddr = clean(r.상차지주소 || "");
const rowDropAddr   = clean(r.하차지주소 || "");

// 🔥 입력값 (지명 or 주소 둘 다 대응)
const inputPickup = normalizePlace(pickup || pickupAddr);
const inputDrop   = normalizePlace(drop || dropAddr);

const inputPickupAddr = clean(pickupAddr);
const inputDropAddr   = clean(dropAddr);

// 🔥 지명 + 주소 둘 다 허용 (핵심)
const pickupMatch =
  (inputPickup &&
    (rowPickup.includes(inputPickup) || inputPickup.includes(rowPickup)))
  ||
  (inputPickupAddr &&
    rowPickupAddr.includes(inputPickupAddr));

const dropMatch =
  (inputDrop &&
    (rowDrop.includes(inputDrop) || inputDrop.includes(rowDrop)))
  ||
  (inputDropAddr &&
    rowDropAddr.includes(inputDropAddr));

  return pickupMatch && dropMatch;
});
// 🔥 차종 필터
if (vehicle && vehicle !== "전체") {

  filtered = filtered.filter(r => {
    const car = clean(r.차량종류 || "");

    // 라보/다마스
    if (vehicle === "라보/다마스") {
      return car.includes("라보") || car.includes("다마스");
    }

    // 카고 그룹
    if (vehicle === "카고") {
      return (
        car.includes("카고") ||
        car.includes("윙") ||
        car.includes("탑")
      );
    }

    // 냉장 그룹
    if (vehicle === "냉장") {
      return (
        car.includes("냉장") ||
        car.includes("냉동")
      );
    }

    return car.includes(clean(vehicle));
  });
}

// =======================
// 🔥 화물 필터 (완전 수정)
// =======================

if (cargo) {

  const isInputPallet = isPalletCargo(cargo);
  const isInputBox = isBoxCargo(cargo);

  filtered = filtered.filter(r => {

    const rowCargo = r.화물내용 || "";

    const isRowPallet = isPalletCargo(rowCargo);
    const isRowBox = isBoxCargo(rowCargo);

    // 🔥 1️⃣ 파렛트 → 같은 그룹만
    if (isInputPallet) {
      return isRowPallet;
    }

    // 🔥 2️⃣ 박스/일반짐 → 전부 포함 (핵심)
    return !isRowPallet;
  });
}
// 🔥 완전일치 필터 (여기 넣는다)
if (strictMatchOnly) {
  filtered = filtered.filter(r => {
    const cargoMatch =
      cargo &&
      r.화물내용 &&
      r.화물내용.includes(cargo);

    const tonMatch =
      ton &&
      r.차량톤수 &&
      r.차량톤수 === ton;

    return cargoMatch || tonMatch;
  });
}

// 🔥 그 다음 정렬
filtered = filtered.map(r => {

  let score = 0;

  // 🔵 지명
  const rowPickup = normalizePlace(r.상차지명 || "");
  const rowDrop   = normalizePlace(r.하차지명 || "");

  // 🔵 주소
  const rowPickupAddr = clean(r.상차지주소 || "");
  const rowDropAddr   = clean(r.하차지주소 || "");

  // 🔵 입력값 (지명 or 주소 대응)
  const inputPickup = normalizePlace(pickup || pickupAddr);
  const inputDrop   = normalizePlace(drop || dropAddr);

  const inputPickupAddr = clean(pickupAddr);
  const inputDropAddr   = clean(dropAddr);

  // =========================
  // 1️⃣ 지명 + 주소 (최우선)
  // =========================
  if (
    (inputPickup &&
      (rowPickup.includes(inputPickup) || inputPickup.includes(rowPickup))) ||
    (inputPickupAddr &&
      (rowPickupAddr.includes(inputPickupAddr) || inputPickupAddr.includes(rowPickupAddr)))
  ) {
    score += 100;
  }

  if (
    (inputDrop &&
      (rowDrop.includes(inputDrop) || inputDrop.includes(rowDrop))) ||
    (inputDropAddr &&
      (rowDropAddr.includes(inputDropAddr) || inputDropAddr.includes(rowDropAddr)))
  ) {
    score += 100;
  }


  // 2️⃣ 화물
  if (cargo) {
    const cargoScore = cargoSimilarityScore(cargo, r.화물내용);
    score += cargoScore;
  }

  // 3️⃣ 톤수
  if (inputTonNum2 != null) {
    const rowTon = extractTonNum(r.차량톤수 || "");
    const diff = Math.abs((rowTon ?? 999) - inputTonNum2);
    score += (100 - diff * 10);
  }

  // 4️⃣ 차량
  if (vehicle && vehicle !== "전체") {
    const car = clean(r.차량종류 || "");

    if (
      (vehicle === "냉장탑" || vehicle === "냉동탑") &&
      (car.includes("냉장") || car.includes("냉동"))
    ) {
      score += 80;
    }

    else if (
      (vehicle === "카고" || vehicle === "윙바디") &&
      (car.includes("카고") || car.includes("윙") || car.includes("탑"))
    ) {
      score += 70;
    }

    else if (vehicle === "라보/다마스") {
      if (car.includes("라보") || car.includes("다마스")) {
        score += 60;
      }
    }

    else if (car.includes(clean(vehicle))) {
      score += 50;
    }
  }

  return {
    ...r,
    _score: score,
    _date: new Date(r.상차일 || 0).getTime()
  };
});

// 🔥 최종 정렬
filtered.sort((a, b) => {
  if (b._score !== a._score) return b._score - a._score;
  return b._date - a._date;
});
// ❗ 1️⃣ 지명 기준으로 아예 없는 경우만
if (!filtered.length) {
  setMatchedRows([]);
  setShowNoResultPopup(true);
  return;
}

// ❗ 2️⃣ 무조건 리스트 보여줌 (핵심)
setMatchedRows(filtered);

// ❗ 3️⃣ 동일 화물만 따로 체크
const sameExactRows = filtered.filter(r => {
  const rowCargo = extractCargoNumber(r.화물내용);
  const rowTon   = extractTonNum(r.차량톤수 || "");

  const isInputPallet = isPalletCargo(cargo);
  const isRowPallet   = isPalletCargo(r.화물내용);

  const isInputBox = isBoxCargo(cargo);
  const isRowBox   = isBoxCargo(r.화물내용);

// 🔥 톤수 없으면 → 파렛트만 숫자 비교
if (inputTonNum2 == null) {

  const isInputPallet = isPalletCargo(cargo);
  const isRowPallet = isPalletCargo(r.화물내용);

  // ✅ 파렛트 → 숫자 비교
  if (isInputPallet && isRowPallet) {
    return rowCargo === inputCargoNum;
  }

  // ✅ 일반짐 → 전부 허용 (핵심)
  return true;
}
const isTonSimilar = (inputTon, rowTon) => {
  if (inputTon == null || rowTon == null) return false;

  // 🔵 0.1 ~ 1.9톤 → 전부 같은 그룹
  if (inputTon < 2 && rowTon < 2) return true;

  // 🔵 그 이상 → ±0.5톤 허용
  return Math.abs(inputTon - rowTon) <= 0.5;
};
// 🔥 박스/잡짐 → 톤수 범위 비교
if (isInputBox || isRowBox) {
  return isTonSimilar(inputTonNum2, rowTon);
}

// 🔥 파렛트 아닌 경우 → 톤수 범위 비교
if (!isInputPallet || !isRowPallet) {
  return isTonSimilar(inputTonNum2, rowTon);
}

// 🔥 파렛트 → 화물 + 톤수 범위
return (
  rowCargo === inputCargoNum &&
  isTonSimilar(inputTonNum2, rowTon)
);
});
// ===============================
// 🔥 단계별 후보군 생성
// ===============================

let baseRows = sameExactRows;

// 2️⃣ 화물만 동일
if (!baseRows.length) {
  baseRows = filtered.filter(r => {
    const rowCargo = extractCargoNumber(r.화물내용);
    return rowCargo === inputCargoNum;
  });
}

// 3️⃣ 파렛트 근접 (🔥 가장 가까운 것만)
if (!baseRows.length && isPalletCargo(cargo)) {

  const diffs = filtered.map(r => {
    const rowCargo = extractCargoNumber(r.화물내용);
    return Math.abs((rowCargo ?? 999) - (inputCargoNum ?? 0));
  });

  const minDiff = Math.min(...diffs);

  baseRows = filtered.filter(r => {
    const rowCargo = extractCargoNumber(r.화물내용);
    const diff = Math.abs((rowCargo ?? 999) - (inputCargoNum ?? 0));

    return diff === minDiff; // 🔥 핵심
  });
}

// 4️⃣ 톤수 보정
if (!baseRows.length && inputTonNum2 != null) {
  baseRows = filtered
    .map(r => {
      const rowTon = extractTonNum(r.차량톤수 || "");
      const diff = Math.abs((rowTon ?? 999) - inputTonNum2);
      return { ...r, _tonDiff: diff };
    })
    .filter(r => r._tonDiff <= 1)
    .sort((a, b) => a._tonDiff - b._tonDiff);
}

// 5️⃣ fallback
if (!baseRows.length) {
  baseRows = filtered;
}

// ===============================
// 🔥 최고/최저 계산
// ===============================
const sortedByFare = [...baseRows].sort((a, b) => {
  return Number(a.청구운임 || 0) - Number(b.청구운임 || 0);
});

setFareSummary({
  lowest: sortedByFare[0],
  highest: sortedByFare[sortedByFare.length - 1]
});

setShowFareSummaryPopup(true);

const fares = baseRows.map((r) =>
  Number(String(r.청구운임 || 0).replace(/[^\d]/g, ""))
);
  const avg = Math.round(fares.reduce((a, b) => a + b, 0) / fares.length);

  const latest = filtered[0];
  const latestFare = Number(String(latest.청구운임 || 0).replace(/[^\d]/g, ""));

  const aiValue = Math.round(latestFare * 0.6 + avg * 0.4);

  setAiFare({
    avg,
    latestFare,
    aiValue,
    confidence: Math.min(95, 60 + filtered.length * 5),
  });

  setResult({ avg, latest, latestFare });
};


  return (
    <div className="bg-gray-50 min-h-screen pb-16">
      {/* 헤더 */}
      <div className="bg-[#1B2B4B] px-4 py-4 flex items-center gap-3">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div>
          <div className="text-white font-bold text-[16px]">과거 운임 조회</div>
          <div className="text-white/50 text-[11px]">상/하차지명 또는 주소로 검색</div>
        </div>
      </div>

      {/* 검색 카드 */}
      <div className="mx-4 mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 space-y-3">
          {/* 상/하차지명 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] font-bold text-gray-500 mb-1.5">상차지명</div>
              <MobilePlaceSuggest value={pickup} onChange={setPickup} names={pickupNames} placeholder="예: 인천 후레쉬2공장" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-gray-500 mb-1.5">하차지명</div>
              <MobilePlaceSuggest value={drop} onChange={setDrop} names={dropNames} placeholder="예: 반찬단지" />
            </div>
          </div>
          {/* 주소 검색 */}
          <div className="bg-blue-50 rounded-xl p-3 space-y-2">
            <div className="text-[11px] font-bold text-blue-500">주소로 검색 (선택)</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] text-blue-400 mb-1">상차지주소</div>
                <MobileAddressSearch
                  value={pickupAddr}
                  onChange={v => setPickupAddr(v)}
                  onSelect={s => s && setPickupAddr(s.address)}
                  placeholder="예: 인천시 서구 원창동"
                />
              </div>
              <div>
                <div className="text-[10px] text-blue-400 mb-1">하차지주소</div>
                <MobileAddressSearch
                  value={dropAddr}
                  onChange={v => setDropAddr(v)}
                  onSelect={s => s && setDropAddr(s.address)}
                  placeholder="예: 경기도 포천시"
                />
              </div>
            </div>
          </div>
          {/* 차종/톤수/화물 */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-[11px] font-bold text-gray-500 mb-1.5">차종</div>
              <select className="w-full border border-gray-200 rounded-xl px-2 py-2 text-[12px] bg-gray-50 focus:outline-none focus:border-[#1B2B4B]"
                value={vehicle} onChange={e=>setVehicle(e.target.value)}>
                <option value="전체">전체</option>
                <option value="라보/다마스">라보/다마스</option>
                <option value="카고">카고</option>
                <option value="윙바디">윙바디</option>
                <option value="냉장탑">냉장탑</option>
                <option value="냉동탑">냉동탑</option>
                <option value="냉장윙">냉장윙</option>
                <option value="냉동윙">냉동윙</option>
                <option value="오토바이">오토바이</option>
              </select>
            </div>
            <div>
              <div className="text-[11px] font-bold text-gray-500 mb-1.5">톤수</div>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B] bg-gray-50"
                placeholder="예: 1톤" value={ton} onChange={e=>setTon(e.target.value)} />
            </div>
            <div>
              <div className="text-[11px] font-bold text-gray-500 mb-1.5">화물</div>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B] bg-gray-50"
                placeholder="예: 3파렛트" value={cargo} onChange={e=>setCargo(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button id="fare-search-button" onClick={calcFareMobile}
              className="flex-1 py-3 bg-[#1B2B4B] text-white text-[14px] font-bold rounded-xl active:scale-95 transition">
              조회하기
            </button>
            <button onClick={() => { setPickup(""); setDrop(""); setPickupAddr(""); setDropAddr(""); setTon(""); setCargo(""); setVehicle("전체"); setMatchedRows([]); setResult(null); setAiFare(null); }}
              className="px-4 py-3 rounded-xl border border-gray-200 text-gray-500 text-[13px] font-semibold">
              초기화
            </button>
          </div>
        </div>
      </div>

      {/* 결과 */}
      {matchedRows.length > 0 && (
        <div className="mx-4 mt-4 space-y-3">
          {/* 운임 범위 요약 */}
          {(() => {
            const fares = matchedRows.map(r => Number(r.청구운임||0)).filter(v => v > 0);
            if (fares.length === 0) return null;
            const fareMin = Math.min(...fares);
            const fareMax = Math.max(...fares);
            const fareAvg = Math.round(fares.reduce((a,b)=>a+b,0)/fares.length);
            const fareRange = fareMax - fareMin || 1;
            const getBarPct = f => fareRange > 0 ? Math.min(100, Math.max(0, ((f-fareMin)/fareRange)*100)) : 50;
            return (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                  조회 운임 범위 ({matchedRows.length}건)
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-[26px] font-black text-[#1B2B4B] leading-none">{fareMin.toLocaleString()}</span>
                  <span className="text-[16px] font-bold text-gray-300">~</span>
                  <span className="text-[26px] font-black text-[#1B2B4B] leading-none">{fareMax.toLocaleString()}</span>
                  <span className="text-[13px] font-semibold text-gray-400 mb-0.5">원</span>
                </div>
                <div className="relative h-2 bg-gray-100 rounded-full mb-1.5">
                  <div className="absolute inset-0 bg-gray-200 rounded-full" />
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#1B2B4B] border-2 border-white shadow-md z-10"
                    style={{ left: `calc(${getBarPct(fareAvg)}% - 6px)` }} />
                </div>
                <div className="flex justify-between text-[10px] font-semibold text-gray-400">
                  <span>최저 {fareMin.toLocaleString()}원</span>
                  <span className="text-[#1B2B4B] font-bold">평균 {fareAvg.toLocaleString()}원</span>
                  <span>최고 {fareMax.toLocaleString()}원</span>
                </div>
              </div>
            );
          })()}

          {/* 기록 목록 */}
          <div className="flex items-center gap-2 px-1">
            <span className="text-[13px] font-extrabold text-[#1B2B4B]">과거 운송 기록</span>
            <span className="text-[11px] text-gray-400">유사도순 · 최신순</span>
          </div>
          {matchedRows.map((r, i) => {
            const fare = Number(r.청구운임||0);
            const drv = Number(r.기사운임||0);
            const fares = matchedRows.map(x => Number(x.청구운임||0)).filter(v => v > 0);
            const fareMin = fares.length ? Math.min(...fares) : 0;
            const fareMax = fares.length ? Math.max(...fares) : 0;
            const fareRange = fareMax - fareMin || 1;
            const barPct = fareRange > 0 ? Math.min(100, Math.max(0, ((fare-fareMin)/fareRange)*100)) : 50;
            const fareLevel = barPct <= 33 ? "저렴" : barPct <= 66 ? "보통" : "높음";
            const fareLevelCls = barPct <= 33 ? "bg-emerald-600 text-white" : barPct <= 66 ? "bg-gray-600 text-white" : "bg-orange-600 text-white";
            const isTop = i === 0;
            return (
              <div key={r.id || i} onClick={() => setFareDetailItemStd(r)} className={`bg-white border rounded-2xl overflow-hidden shadow-sm cursor-pointer active:scale-[0.99] transition ${isTop ? "border-[#1B2B4B]/30" : "border-gray-100"}`}>
                {isTop && (
                  <div className="bg-[#1B2B4B] px-4 py-1">
                    <span className="text-yellow-300 text-[10px] font-bold">최근 유사 운송</span>
                  </div>
                )}
                <div className="px-4 pt-3 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${fareLevelCls}`}>{fareLevel}</span>
                        <span className="text-[11px] text-gray-400">{(r.상차일||"").slice(0,10)}</span>
                      </div>
                      <div className="text-[13px] font-bold text-gray-900 truncate">
                        {r.상차지명||"-"} → {r.하차지명||"-"}
                      </div>
                      {(r.상차지주소 || r.하차지주소) && (
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {shortAddr(r.상차지주소)} → {shortAddr(r.하차지주소)}
                        </div>
                      )}
                      {r.거래처명 && <div className="text-[11px] text-gray-500 mt-0.5">{r.거래처명}</div>}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {r.화물내용 && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600 font-medium">{r.화물내용}</span>}
                        {r.차량톤수 && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600 font-medium">{r.차량톤수}</span>}
                        {r.차량종류 && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600 font-medium">{r.차량종류}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-gray-400">청구</div>
                      <div className="text-[17px] font-extrabold text-[#1B2B4B]">{fare.toLocaleString()}원</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">기사 {drv.toLocaleString()}원</div>
                    </div>
                  </div>
                  {fares.length > 1 && (
                    <div className="relative h-1.5 bg-gray-100 rounded-full mt-2">
                      <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#1B2B4B] border-2 border-white shadow"
                        style={{ left: `calc(${barPct}% - 5px)` }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!matchedRows.length && !result && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="mb-3 opacity-30">
            <rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 4v4h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
          </svg>
          <div className="text-[14px] font-semibold mb-1">상/하차지를 입력하세요</div>
          <div className="text-[12px]">지명 또는 주소로 검색 가능합니다</div>
        </div>
      )}

      {/* 운임 이력 상세 팝업 */}
      {fareDetailItemStd && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setFareDetailItemStd(null)} />
          <div className="relative bg-white rounded-t-3xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-0">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="bg-[#1B2B4B] px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="text-white font-bold text-[15px]">운송 이력 상세</div>
                <button onClick={() => setFareDetailItemStd(null)}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-lg">×</button>
              </div>
              <div className="text-white/60 text-[11px] mt-1">{fareDetailItemStd.상차일 || ""}</div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {fareDetailItemStd.거래처명 && (
                <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                  <span className="text-[11px] text-gray-400 w-16 shrink-0">거래처</span>
                  <span className="text-[14px] font-bold text-[#1B2B4B]">{fareDetailItemStd.거래처명}</span>
                </div>
              )}
              <div className="flex gap-3">
                <div className="flex-1 bg-blue-50 rounded-xl p-3">
                  <div className="text-[10px] font-bold text-blue-400 mb-1">상차지</div>
                  <div className="text-[13px] font-bold text-gray-900">{fareDetailItemStd.상차지명||"-"}</div>
                  {fareDetailItemStd.상차지주소 && <div className="text-[11px] text-gray-500 mt-0.5">{fareDetailItemStd.상차지주소}</div>}
                </div>
                <div className="flex-1 bg-orange-50 rounded-xl p-3">
                  <div className="text-[10px] font-bold text-orange-400 mb-1">하차지</div>
                  <div className="text-[13px] font-bold text-gray-900">{fareDetailItemStd.하차지명||"-"}</div>
                  {fareDetailItemStd.하차지주소 && <div className="text-[11px] text-gray-500 mt-0.5">{fareDetailItemStd.하차지주소}</div>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {fareDetailItemStd.화물내용 && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-[10px] font-bold text-gray-400 mb-1">화물</div>
                    <div className="text-[12px] font-semibold text-gray-800">{fareDetailItemStd.화물내용}</div>
                  </div>
                )}
                {fareDetailItemStd.차량톤수 && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-[10px] font-bold text-gray-400 mb-1">톤수</div>
                    <div className="text-[12px] font-semibold text-gray-800">{fareDetailItemStd.차량톤수}</div>
                  </div>
                )}
                {fareDetailItemStd.차량종류 && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-[10px] font-bold text-gray-400 mb-1">차종</div>
                    <div className="text-[12px] font-semibold text-gray-800">{fareDetailItemStd.차량종류}</div>
                  </div>
                )}
              </div>
              <div className="bg-[#1B2B4B] rounded-xl p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-white/50 text-[10px] mb-1">청구운임</div>
                    <div className="text-white font-extrabold text-[16px]">{Number(fareDetailItemStd.청구운임||0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-white/50 text-[10px] mb-1">기사운임</div>
                    <div className="text-white font-extrabold text-[16px]">{Number(fareDetailItemStd.기사운임||0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-white/50 text-[10px] mb-1">수수료</div>
                    <div className="text-white font-extrabold text-[16px]">{(Number(fareDetailItemStd.청구운임||0)-Number(fareDetailItemStd.기사운임||0)).toLocaleString()}</div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setFareDetailItemStd(null)}
                className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl text-[13px] active:opacity-80"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {showNoResultPopup && (
        <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center">
          <div className="bg-white p-5 rounded-2xl w-[300px] text-center">
            <div className="text-[16px] font-bold mb-2">조회 결과 없음</div>
            <div className="text-[13px] text-gray-500 mb-4">해당 상/하차지 기록이 없습니다.</div>
            <button onClick={() => setShowNoResultPopup(false)}
              className="w-full py-2.5 bg-[#1B2B4B] text-white rounded-xl font-bold text-[13px]">확인</button>
          </div>
        </div>
      )}
    </div>
  );
}
// ======================================================================
// 📌 모바일 단가표
// ======================================================================
function MobileRateCard({ dispatchData = [], onBack }) {
  const TON_BUCKETS = [
    { label: "다마스/라보", min: 0,    max: 0.6,  display: "다마스/라보" },
    { label: "1톤",         min: 0.6,  max: 1.2,  display: "1톤" },
    { label: "1.4톤",       min: 1.2,  max: 1.9,  display: "1.4톤" },
    { label: "2.5톤",       min: 1.9,  max: 3.0,  display: "2.5톤" },
    { label: "3.5톤",       min: 3.0,  max: 4.5,  display: "3.5톤" },
    { label: "5톤",         min: 4.5,  max: 6.5,  display: "5톤" },
    { label: "7.5톤",       min: 6.5,  max: 9.5,  display: "7.5톤" },
    { label: "11톤",        min: 9.5,  max: 13.5, display: "11톤" },
    { label: "15톤",        min: 13.5, max: 17.0, display: "15톤" },
    { label: "18톤",        min: 17.0, max: 22.0, display: "18톤" },
    { label: "25톤",        min: 22.0, max: 99,   display: "25톤" },
  ];
  const PALLET_BUCKETS = Array.from({ length: 18 }, (_, i) => ({
    label: `${i+1}파렛`, count: i+1, display: `${i+1}파렛`,
  }));
  const VEHICLE_GROUPS = [
    { label: "냉장/냉동 (탑·윙)", value: "COLD",  keywords: ["냉장","냉동"] },
    { label: "카고/윙바디/탑차",   value: "TRUCK", keywords: ["카고","윙바디","탑차","윙"] },
    { label: "다마스/라보",        value: "SMALL", keywords: ["다마스","라보"] },
    { label: "오토바이",           value: "BIKE",  keywords: ["오토바이"] },
    { label: "리프트",             value: "LIFT",  keywords: ["리프트"] },
  ];

  const cleanStr = (s) => String(s||"").replace(/\s/g,"").toLowerCase();
  const extractTon = (text) => {
    const s = String(text||"").trim();
    if (/kg/i.test(s)) { const m = s.match(/(\d+(\.\d+)?)\s*kg/i); return m ? Number(m[1])/1000 : null; }
    const m = s.replace(/톤|t/gi,"").match(/(\d+(\.\d+)?)/);
    return m ? Number(m[1]) : null;
  };
  const extractPallet = (text) => {
    const s = String(text||"").replace(/\s/g,"").toLowerCase();
    const m = s.match(/(\d+)\s*(파레트|파렛트|파렛|파레|파|pallet|p)/i);
    return m ? Number(m[1]) : null;
  };
  const getTonBucket = (t) => { if (t==null) return null; return TON_BUCKETS.find(b=>t>=b.min&&t<b.max)||null; };
  const getVehicleGroup = (v) => { const s=String(v||"").toLowerCase(); for (const g of VEHICLE_GROUPS) { if (g.keywords.some(k=>s.includes(k))) return g.value; } return "ETC"; };
  const roundDown10k = (n) => Math.floor(n/10000)*10000;

  const trimmedStats = (fares, rawRows) => {
    if (!fares.length) return null;
    if (fares.length<=2) { const avg=roundDown10k(fares.reduce((a,b)=>a+b,0)/fares.length); return {avg,min:Math.min(...fares),max:Math.max(...fares),count:fares.length,variance:0,rows:rawRows,trimmed:false}; }
    const sorted=[...fares].sort((a,b)=>a-b);
    const q1=sorted[Math.floor(sorted.length*0.25)], q3=sorted[Math.floor(sorted.length*0.75)];
    const iqr=q3-q1, lo=q1-1.5*iqr, hi=q3+1.5*iqr;
    const filtered=sorted.filter(v=>v>=lo&&v<=hi);
    const useFares=filtered.length>=2?filtered:sorted;
    const avg=roundDown10k(useFares.reduce((a,b)=>a+b,0)/useFares.length);
    return {avg,min:Math.min(...fares),max:Math.max(...fares),count:fares.length,trimmed:useFares.length<fares.length,variance:avg>0?Math.round(((Math.max(...useFares)-Math.min(...useFares))/avg)*100):0,rows:rawRows};
  };

  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [vGroup, setVGroup] = useState("");
  const [mixedFilter, setMixedFilter] = useState("전체");
  const [fareField, setFareField] = useState("청구운임");
  const [viewMode, setViewMode] = useState("톤수별");
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState(false);
  const [detailModal, setDetailModal] = useState(null);

  const handleSearch = () => {
    if (!pickup.trim()||!drop.trim()||!vGroup) { alert("상차지역, 하차지역, 차량종류를 모두 입력하세요."); return; }
    const pu=cleanStr(pickup), dr=cleanStr(drop);
    let matched = dispatchData.filter(r => {
      if ((r.상차일 || "").slice(0, 10) === todayKST()) return false;
      const pm=cleanStr(r.상차지명||"")+cleanStr(r.상차지주소||"");
      const dm=cleanStr(r.하차지명||"")+cleanStr(r.하차지주소||"");
      if (!pm.includes(pu)||!dm.includes(dr)) return false;
      if (getVehicleGroup(r.차량종류)!==vGroup) return false;
      return !!Number(String(r[fareField]||0).replace(/[^\d]/g,""));
    });
    if (mixedFilter==="혼적") matched=matched.filter(r=>r.혼적===true||r.혼적==="true"||r.혼적===1);
    else if (mixedFilter==="독차") matched=matched.filter(r=>!r.혼적||r.혼적===false||r.혼적==="false"||r.혼적===0);

    const BUCKETS = viewMode==="파렛수별" ? PALLET_BUCKETS : TON_BUCKETS;
    const bucketMap={}, bucketRowMap={};
    BUCKETS.forEach(b=>{bucketMap[b.label]=[];bucketRowMap[b.label]=[];});
    matched.forEach(r=>{
      const fare=Number(String(r[fareField]||0).replace(/[^\d]/g,""));
      if (!fare) return;
      if (viewMode==="파렛수별") {
        const p=extractPallet(r.화물내용); if (!p||p<1||p>18) return;
        const key=`${p}파렛`; if (!bucketMap[key]) return;
        bucketMap[key].push(fare); bucketRowMap[key].push(r);
      } else {
        const ton=extractTon(r.차량톤수), bucket=getTonBucket(ton); if (!bucket) return;
        bucketMap[bucket.label].push(fare); bucketRowMap[bucket.label].push(r);
      }
    });
    const rows=BUCKETS.map(b=>({...b,stats:trimmedStats(bucketMap[b.label],bucketRowMap[b.label])})).filter(b=>b.stats!==null);
    const groupLabel=VEHICLE_GROUPS.find(g=>g.value===vGroup)?.label||vGroup;
    setResult({rows,totalCount:matched.length,groupLabel,pickup:pickup.trim(),drop:drop.trim(),fareField,mixedFilter,viewMode});
    setSearched(true);
  };

  const confLabel = (c) => c>=10?"높음":c>=4?"보통":"낮음";
  const confColor = (c) => c>=10?"text-emerald-600":c>=4?"text-amber-500":"text-red-500";

  return (
    <div className="px-4 py-4 space-y-4 bg-gray-50 min-h-screen pb-20">

      {/* 검색 카드 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-[#1B2B4B] px-4 py-3">
          <div className="text-[13px] font-bold text-white">노선 조건 입력</div>
        </div>
        <div className="p-4 space-y-3">
          {/* 상/하차 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] font-semibold text-gray-500 mb-1">상차지역 *</div>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-blue-400 bg-gray-50" placeholder="예: 인천" value={pickup} onChange={e=>setPickup(e.target.value)} />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-gray-500 mb-1">하차지역 *</div>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-blue-400 bg-gray-50" placeholder="예: 부산" value={drop} onChange={e=>setDrop(e.target.value)} />
            </div>
          </div>

          {/* 차량종류 */}
          <div>
            <div className="text-[11px] font-semibold text-gray-500 mb-1">차량종류 *</div>
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:border-blue-400" value={vGroup} onChange={e=>setVGroup(e.target.value)}>
              <option value="">선택</option>
              {VEHICLE_GROUPS.map(g=><option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>

          {/* 조회 방식 */}
          <div>
            <div className="text-[11px] font-semibold text-gray-500 mb-1.5">조회 방식</div>
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              {["톤수별","파렛수별"].map(opt=>(
                <button key={opt} type="button" onClick={()=>setViewMode(opt)}
                  className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all ${viewMode===opt ? "bg-white text-[#1B2B4B] shadow-sm" : "text-gray-500"}`}>
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* 혼적 여부 */}
          <div>
            <div className="text-[11px] font-semibold text-gray-500 mb-1.5">혼적 여부</div>
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              {["전체","독차","혼적"].map(opt=>(
                <button key={opt} type="button" onClick={()=>setMixedFilter(opt)}
                  className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all ${mixedFilter===opt ? "bg-white text-[#1B2B4B] shadow-sm" : "text-gray-500"}`}>
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* 조회 기준 */}
          <div>
            <div className="text-[11px] font-semibold text-gray-500 mb-1.5">조회 기준</div>
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              {[["청구운임","청구가"],["기사운임","기사운임"]].map(([val,label])=>(
                <button key={val} type="button" onClick={()=>setFareField(val)}
                  className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all ${fareField===val ? "bg-[#1B2B4B] text-white shadow-sm" : "text-gray-500"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 버튼 */}
          <div className="flex gap-2 pt-1">
            <button onClick={handleSearch} className="flex-1 py-3 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-xl active:scale-95 transition">
              단가표 생성
            </button>
            <button onClick={()=>{setPickup("");setDrop("");setVGroup("");setMixedFilter("전체");setFareField("청구운임");setViewMode("톤수별");setResult(null);setSearched(false);}}
              className="px-4 py-3 bg-white border border-gray-200 text-gray-500 text-[13px] rounded-xl active:scale-95 transition">
              초기화
            </button>
          </div>
        </div>
      </div>

      {/* 결과 */}
      {searched && result && (
        <div className="space-y-3">
          {/* 헤더 정보 */}
          <div className="bg-[#1B2B4B] rounded-2xl px-4 py-4">
            <div className="text-[20px] font-black text-white tracking-tight mb-1">RUN25</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-bold text-[14px]">{result.pickup}</span>
              <span className="text-blue-300 font-bold">→</span>
              <span className="text-white font-bold text-[14px]">{result.drop}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-semibold">{result.groupLabel}</span>
              <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-semibold">{result.viewMode}</span>
              {result.mixedFilter!=="전체" && <span className="px-2 py-0.5 rounded-full bg-violet-400/60 text-white text-[11px] font-semibold">{result.mixedFilter}</span>}
              <span className="px-2 py-0.5 rounded-full bg-blue-400/50 text-white text-[11px] font-semibold">{result.fareField==="청구운임"?"청구가 기준":"기사운임 기준"}</span>
              <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[11px]">조회 {result.totalCount}건</span>
            </div>
          </div>

          {/* 단가 카드 목록 */}
          {result.rows.length===0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 py-12 text-center text-gray-400 text-[13px]">
              해당 조건에 맞는 데이터가 없습니다
            </div>
          ) : (
            <div className="space-y-2">
              {result.rows.map((row, i) => {
                const s = row.stats;
                const vLevel = s.variance>40?"높음":s.variance>20?"보통":"낮음";
                const vColor = s.variance>40?"text-red-500":s.variance>20?"text-amber-500":"text-emerald-600";
                return (
                  <div key={i} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[15px] font-bold text-[#1B2B4B]">{row.display}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-semibold ${confColor(s.count)}`}>{confLabel(s.count)}</span>
                        <span className={`text-[11px] font-semibold ${vColor}`}>{vLevel}</span>
                      </div>
                    </div>
                    <div className="text-[22px] font-black text-blue-700 mb-1">
                      {s.avg.toLocaleString()}<span className="text-[13px] font-semibold text-gray-400 ml-1">원</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-400">{roundDown10k(s.min).toLocaleString()} ~ {roundDown10k(s.max).toLocaleString()}원</span>
                      <button onClick={()=>setDetailModal({rows:s.rows,bucket:row.display})}
                        className="text-[12px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full active:scale-95">
                        {s.count}건 상세보기
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 안내 */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <div className="text-[12px] font-bold text-amber-800 mb-1">안내사항</div>
            <ul className="text-[11px] text-amber-700 space-y-0.5 leading-relaxed">
              <li>• 과거 실적 기반 참고 단가 (1만원 단위 절사)</li>
              <li>• 유가·수급 상황에 따라 실제 운임은 달라질 수 있습니다</li>
              <li>• 신뢰도 "낮음"은 샘플이 적어 변동 가능성이 높습니다</li>
            </ul>
          </div>

          {/* 하단 서명 */}
          <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex items-center justify-between">
            <div className="text-[11px] text-gray-400">본 자료는 영업 참고용입니다</div>
            <div className="flex items-center gap-2">
              <div className="text-right text-[11px] text-gray-600">
                <div className="font-bold text-[#1B2B4B]">RUN25</div>
                <div>박성우 팀장 010-5504-1821</div>
              </div>
              <div className="w-10 h-10 rounded-full border-2 border-[#1B2B4B] flex items-center justify-center text-[9px] font-black text-[#1B2B4B] text-center leading-tight">RUN<br/>25</div>
            </div>
          </div>
        </div>
      )}

      {/* 상세 팝업 */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center" onClick={()=>setDetailModal(null)}>
          <div className="bg-white rounded-2xl w-[96%] max-h-[80vh] overflow-hidden flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-white font-bold text-[14px]">{detailModal.bucket} 상세 내역</div>
                <div className="text-white/60 text-[11px]">총 {detailModal.rows.length}건</div>
              </div>
              <button onClick={()=>setDetailModal(null)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {detailModal.rows.map((r,i)=>{
                const fare=Number(String(r.청구운임||0).replace(/[^\d]/g,""));
                const driver=Number(String(r.기사운임||0).replace(/[^\d]/g,""));
                const margin=fare-driver;
                return (
                  <div key={i} className={`border rounded-xl px-3 py-2.5 ${i%2===0?"bg-white":"bg-gray-50"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-gray-400">{r.상차일||"-"} · {r.거래처명||"-"}</span>
                      <span className="text-[14px] font-black text-blue-700">{fare.toLocaleString()}원</span>
                    </div>
                    <div className="text-[12px] font-semibold text-gray-800 mb-1">{r.상차지명||"-"} → {r.하차지명||"-"}</div>
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>{r.차량종류||"-"} · {r.차량톤수||"-"} · {r.화물내용||"-"}</span>
                      <span>{r.혼적?<span className="text-emerald-600 font-semibold">혼적</span>:<span className="text-gray-400">독차</span>}</span>
                    </div>
                    <div className="flex gap-3 text-[11px] mt-1 pt-1 border-t border-dashed border-gray-200">
                      <span className="text-emerald-600">기사 {driver.toLocaleString()}원</span>
                      <span className="text-gray-500">수수료 {margin.toLocaleString()}원</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-gray-100 px-4 py-2.5 bg-gray-50 flex gap-4 text-[11px] text-gray-600">
              <span>평균 청구: <b className="text-blue-700">{Math.floor(detailModal.rows.reduce((s,r)=>s+Number(String(r.청구운임||0).replace(/[^\d]/g,"")),0)/detailModal.rows.length/10000)*10000}원</b></span>
              <span>평균 기사: <b className="text-emerald-600">{Math.floor(detailModal.rows.reduce((s,r)=>s+Number(String(r.기사운임||0).replace(/[^\d]/g,"")),0)/detailModal.rows.length/10000)*10000}원</b></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ======================================================================
// 모바일 배차현황 / 미배차현황 테이블 (날짜별 그룹형 UI)
// ======================================================================
function MobileStatusTable({ title, orders, onBack }) {

  const dateMap = new Map();
  for (const o of orders) {
    const d = getPickupDate(o) || "기타";
    if (!dateMap.has(d)) dateMap.set(d, []);
    dateMap.get(d).push(o);
  }
  const sortedDates = Array.from(dateMap.keys()).sort();

  return (
    <div className="px-3 py-3">
      {onBack && (
        <button
          onClick={onBack}
          className="mb-3 px-3 py-1 rounded bg-gray-200 text-gray-700 text-sm"
        >
          ◀ 뒤로가기
        </button>
      )}


      <div className="mb-2 text-xs text-gray-500">
        {title} (총 {orders.length}건)
      </div>

      {sortedDates.map((dateStr) => {
        const groupList = dateMap.get(dateStr);

        return (
          <div key={dateStr} className="mb-6">
            <div className="text-lg font-bold text-gray-800 mb-2">
              {dateStr.slice(5).replace("-", ".")}
            </div>

            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50 border-b sticky top-0">
                    <tr>
                      <th className="px-2 py-1 border-r">상차일</th>
                      <th className="px-2 py-1 border-r">거래처</th>
                      <th className="px-2 py-1 border-r">상차지</th>
                      <th className="px-2 py-1 border-r">하차지</th>
                      <th className="px-2 py-1 border-r">
                        차량/기사
                      </th>
                      <th className="px-2 py-1">청구/기사</th>
                    </tr>
                  </thead>

                  <tbody>
                    {groupList.map((o) => (
                      <tr key={o.id} className="border-t">
                        <td className="px-2 py-1 border-r whitespace-nowrap">
                          {getPickupDate(o)}
                        </td>
                        <td className="px-2 py-1 border-r">
                          {o.거래처명}
                        </td>
                        <td className="px-2 py-1 border-r">
                          {o.상차지명}
                        </td>
                        <td className="px-2 py-1 border-r">
                          {o.하차지명}
                        </td>
                        <td className="px-2 py-1 border-r">
                          <div>
                            {o.차량톤수 || o.톤수}{" "}
                            {o.차량종류 || o.차종}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            {o.기사명}({o.차량번호})
                          </div>
                        </td>
                        <td className="px-2 py-1 text-right whitespace-nowrap">
                          <div>청 {fmtMoney(getClaim(o))}</div>
                          <div className="text-[10px] text-gray-500">
                            기 {fmtMoney(o.기사운임 || 0)}
                          </div>
                        </td>
                      </tr>
                    ))}

                    {groupList.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-4 text-center text-gray-400"
                        >
                          데이터가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
// ======================================================================
// 📌 미배차현황 (카드형)
// ======================================================================
function MobileUnassignedList({
  title,
  orders, // { unassigned: [], undelivered: [] }
  unassignedTypeFilter,
  setUnassignedTypeFilter,
  setTodayRange,
  setTomorrowRange,
  onBack,
  setSelectedOrder,
  setPage,
  setDetailFrom,
  setOpenMemo,
  setPrevPage,
  tab,
  setTab,
  onSaveScroll,
  focusOrderId,
  onFocusDone,
  cardVersionB = false,
}) {
    // ============================
  // 🔢 미배차 요약 계산
  // ============================
  const unassigned = orders.unassigned || [];

  const coldCount = unassigned.filter(o =>
    String(o.차량종류 || o.차종 || "").includes("냉장") ||
    String(o.차량종류 || o.차종 || "").includes("냉동")
  ).length;

  const totalCount = unassigned.length;
  const normalCount = totalCount - coldCount;
  // ✅ 포커스 스크롤/하이라이트용 ref + 상태
  const orderRefs = useRef({}); // { [orderId]: HTMLElement }
  const [flashId, setFlashId] = useState(null);

  // ✅ focusOrderId가 들어오면: 해당 카드로 스크롤 → 파란 glow 1회 → 종료
  useEffect(() => {
    if (!focusOrderId) return;

    // 혹시 필터 때문에 카드가 안 보일 수 있으니(안전장치)
    setUnassignedTypeFilter("전체");

    let rafId;
    let tries = 0;
    let timeoutId;

    const run = () => {
      const el = orderRefs.current[focusOrderId];

      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });

        setFlashId(focusOrderId);

        timeoutId = setTimeout(() => {
          setFlashId(null);
          onFocusDone?.();
        }, 1200);

        return;
      }

      // 렌더 타이밍으로 ref가 아직 없을 수 있어 재시도
      if (tries++ < 20) {
        rafId = requestAnimationFrame(run);
      } else {
        onFocusDone?.();
      }
    };

    rafId = requestAnimationFrame(run);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, [focusOrderId, setUnassignedTypeFilter, onFocusDone]);


  const [confirmTarget, setConfirmTarget] = useState(null);
 const handleConfirmDeliver = async () => {
  if (!confirmTarget) return;

  await updateDoc(
    doc(db, confirmTarget.__col || collName, confirmTarget.id),

   {
  업체전달상태: "전달완료",
  전달완료일시: serverTimestamp(),

  // 🔥 PC 호환 필드 추가
  정보전달완료: true,
  정보전달상태: "전달완료",
}
  );

  setConfirmTarget(null);
};

  // 🔥 탭별 데이터 소스 완전 분리
const rawSource =
  tab === "미배차"
    ? orders.unassigned
    : orders.undelivered;

const source = rawSource.filter((o) => {
  // 🔹 정보미전달 탭
  if (tab === "정보미전달") {
    const state = getStatus(o); // 배차중 / 배차완료

    if (unassignedTypeFilter === "배차중")
      return state === "배차중";

    if (unassignedTypeFilter === "배차완료")
      return state === "배차완료";

    return true;
  }

  // 🔹 미배차 탭 (기존 로직 유지)
  const isCold =
    String(o.차량종류 || o.차종 || "").includes("냉장") ||
    String(o.차량종류 || o.차종 || "").includes("냉동");

  if (unassignedTypeFilter === "냉장/냉동") return isCold;
  if (unassignedTypeFilter === "일반") return !isCold;

  return true;
});



  const dateMap = new Map();
  for (const o of source) {
    const d = getPickupDate(o) || "기타";
    if (!dateMap.has(d)) dateMap.set(d, []);
    dateMap.get(d).push(o);
  }
  const sortedDates = Array.from(dateMap.keys()).sort();

return (
  <div className={`min-h-screen ${cardVersionB ? "bg-[#F0F3F8]" : "bg-gray-50"}`}>
    {/* 하이라이트 애니메이션 */}
    <style>{`
      @keyframes flashGlowBlue {
        0%   { box-shadow: none; }
        25%  { box-shadow: 0 0 0 3px rgba(59,130,246,.25), 0 0 14px rgba(59,130,246,.3); }
        100% { box-shadow: none; }
      }
      .order-flash-blue { animation: flashGlowBlue 1.2s ease-out; }
    `}</style>

    {/* ── 탭 ── */}
    {cardVersionB ? (
      <div className="flex bg-white border-b border-gray-100">
        {["미배차", "정보미전달"].map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setUnassignedTypeFilter("전체"); }}
            className={`flex-1 py-2.5 text-[13px] font-semibold border-b-2 transition-colors ${
              tab === t
                ? "border-[#1B2B4B] text-[#1B2B4B]"
                : "border-transparent text-gray-400"
            }`}
          >{t}</button>
        ))}
      </div>
    ) : (
      <div className="px-4 pt-3 pb-0">
        <div className="flex bg-gray-100 rounded-xl p-0.5">
          {["미배차", "정보미전달"].map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setUnassignedTypeFilter("전체"); }}
              className={`flex-1 py-2 rounded-[10px] text-[13px] font-semibold transition-all ${
                tab === t
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400"
              }`}
            >{t}</button>
          ))}
        </div>
      </div>
    )}

    {/* ── 필터 + 요약 ── */}
    <div className={`px-4 py-3 ${cardVersionB ? "bg-white border-b border-gray-100" : ""}`}>
      {/* 필터 칩 */}
      <div className="flex gap-1.5 mb-2.5">
        {(tab === "정보미전달"
          ? ["전체", "배차중", "배차완료"]
          : ["전체", "냉장/냉동", "일반"]
        ).map((t) => (
          <button
            key={t}
            onClick={() => setUnassignedTypeFilter(t)}
            className={`px-3 py-1 text-[12px] font-semibold border transition-colors ${
              cardVersionB
                ? `rounded-lg ${unassignedTypeFilter === t ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-500 border-gray-200"}`
                : `rounded-full ${unassignedTypeFilter === t ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-500 border-gray-300"}`
            }`}
          >{t}</button>
        ))}
      </div>

      {/* 요약 행 */}
      {tab === "미배차" && (
        cardVersionB ? (
          <div className="flex items-center gap-3 text-[12px]">
            <span className="text-gray-500">
              총 <span className="font-bold text-[#1B2B4B]">{source.length}</span>건
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">냉장/냉동 <span className="font-bold text-[#1B2B4B]">{coldCount}</span></span>
            <span className="text-gray-500">일반 <span className="font-bold text-gray-700">{normalCount}</span></span>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[12px] text-gray-500">
            <span>총 <b className="text-gray-900">{source.length}</b>건</span>
            <span className="text-gray-300">|</span>
            <span>냉장/냉동 <b className="text-gray-700">{coldCount}</b></span>
            <span>일반 <b className="text-gray-700">{normalCount}</b></span>
          </div>
        )
      )}
      {tab === "정보미전달" && (
        <div className={`text-[12px] ${cardVersionB ? "text-gray-500" : "text-gray-500"}`}>
          총 <b className={cardVersionB ? "text-[#1B2B4B]" : "text-gray-900"}>{source.length}</b>건
        </div>
      )}
    </div>

    {/* ── 카드 목록 ── */}
    <div className="px-3 pt-3 pb-24">
      {source.length === 0 && (
        <div className="py-16 text-center text-gray-400 text-[13px]">
          {tab === "미배차" ? "미배차 오더가 없습니다." : "정보미전달 오더가 없습니다."}
        </div>
      )}

      {sortedDates.map((dateStr) => {
        const list = dateMap.get(dateStr) || [];
        return (
          <div key={dateStr} className="mb-5">
            {/* 날짜 헤더 */}
            <div className={`flex items-center gap-2 mb-2 px-1 ${cardVersionB ? "" : ""}`}>
              <span className={`text-[12px] font-bold ${cardVersionB ? "text-[#1B2B4B]" : "text-gray-600"}`}>
                {formatDateHeader(dateStr)}
              </span>
              <span className={`text-[11px] font-semibold px-1.5 py-0.5 ${
                cardVersionB
                  ? "rounded-md bg-[#1B2B4B]/8 text-[#1B2B4B]"
                  : "rounded-full bg-gray-100 text-gray-500"
              }`}>{list.length}건</span>
            </div>

            <div className="space-y-2">
              {list.map((o) => (
                <div
                  key={o.id}
                  ref={(el) => { if (el) orderRefs.current[o.id] = el; }}
                  style={{ scrollMarginTop: 90 }}
                >
                  <MobileOrderCard
                    order={o}
                    onSelect={() => {
                      onSaveScroll?.();
                      setPrevPage("unassigned");
                      setSelectedOrder(o);
                      setDetailFrom("unassigned");
                      setPage("detail");
                      window.scrollTo(0, 0);
                    }}
                    onOpenMemo={setOpenMemo}
                    showUndeliveredOnly={tab === "정보미전달"}
                    onConfirmDeliver={() => setConfirmTarget(o)}
                    cardVersionB={cardVersionB}
                    flash={flashId === o.id}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>

    {/* ── 정보전달 확인 모달 ── */}
    {confirmTarget && (
      <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.45)" }}
        onClick={() => setConfirmTarget(null)}>
        <div className="w-full max-w-md bg-white rounded-t-2xl px-5 pt-5 pb-8 shadow-2xl"
          onClick={e => e.stopPropagation()}>
          <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-4" />
          <div className={`font-bold text-[15px] mb-1 ${cardVersionB ? "text-[#1B2B4B]" : "text-gray-900"}`}>
            정보전달 완료 처리
          </div>
          <div className="text-[13px] text-gray-500 mb-1">
            {confirmTarget.거래처명 && <span className="font-medium text-gray-700">{confirmTarget.거래처명} · </span>}
            {confirmTarget.상차지명} → {confirmTarget.하차지명}
          </div>
          <div className="text-[12px] text-gray-400 mb-5">{confirmTarget.상차일}</div>
          <div className="flex gap-3">
            <button onClick={() => setConfirmTarget(null)}
              className={`flex-1 py-3 rounded-xl text-[14px] font-semibold ${
                cardVersionB ? "bg-gray-100 text-gray-600" : "border border-gray-300 text-gray-600 bg-white"
              }`}>
              취소
            </button>
            <button onClick={handleConfirmDeliver}
              className={`flex-1 py-3 rounded-xl text-[14px] font-bold text-white ${
                cardVersionB ? "bg-[#1B2B4B]" : "bg-gray-800"
              }`}>
              전달완료
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
);
}

function MobileSettingsPage({ onBack, cardVersionB, setCardVersionB, alarmEnabled, toggleAlarm, fontScale, setFontScale, appVersion, showSuccess, onLogout, userCompany }) {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const SectionHeader = ({ title }) => (
    <div className="px-4 pt-5 pb-1.5">
      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{title}</span>
    </div>
  );

  const SettingRow = ({ label, sub, right, onClick, danger }) => (
    <div
      className={`w-full flex items-center justify-between px-4 py-3.5 bg-white border-b border-gray-50 ${onClick ? "active:bg-gray-50 cursor-pointer" : ""} ${danger ? "text-red-500" : ""}`}
      onClick={onClick}
    >
      <div className="text-left">
        <div className={`text-[13px] font-semibold ${danger ? "text-red-500" : "text-gray-800"}`}>{label}</div>
        {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );

  const Toggle = ({ value, onChange }) => (
    <button type="button" onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${value ? "bg-emerald-500" : "bg-gray-300"}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="flex-1 pb-10">

        <SectionHeader title="화면" />
        <div className="mx-4 rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
          <SettingRow
            label="디자인 테마"
            sub={cardVersionB ? "B형 (다크 네이비 헤더)" : "A형 (라이트)"}
            right={
              <div className="flex gap-1.5">
                {[false, true].map(v => (
                  <button key={String(v)} type="button"
                    onClick={() => { setCardVersionB(v); localStorage.setItem("cardVersion", v ? "B" : "A"); }}
                    className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all ${cardVersionB === v ? "bg-[#1B2B4B] text-white" : "bg-gray-100 text-gray-500"}`}>
                    {v ? "B형" : "A형"}
                  </button>
                ))}
              </div>
            }
          />
          <SettingRow
            label="글자 크기"
            sub="목록/상세 텍스트 크기"
            right={
              <div className="flex gap-1.5">
                {[{v:1,l:"기본"},{v:1.1,l:"크게"},{v:1.2,l:"더 크게"}].map(({v,l}) => (
                  <button key={v} type="button"
                    onClick={() => { setFontScale(v); localStorage.setItem("fontScale", String(v)); }}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all ${fontScale===v ? "bg-[#1B2B4B] text-white" : "bg-gray-100 text-gray-500"}`}>
                    {l}
                  </button>
                ))}
              </div>
            }
          />
        </div>

        <SectionHeader title="알림" />
        <div className="mx-4 rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
          <SettingRow
            label="푸시 알림"
            sub="신규 오더·배차 알림"
            right={<Toggle value={alarmEnabled} onChange={toggleAlarm} />}
          />
        </div>

        <SectionHeader title="데이터" />
        <div className="mx-4 rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
          <SettingRow
            label="앱 새로고침"
            sub="최신 데이터로 갱신"
            onClick={() => { showSuccess("새로고침 완료"); setTimeout(() => window.location.reload(), 800); }}
            right={<span className="text-[12px] text-blue-500 font-semibold">실행</span>}
          />
          <SettingRow
            label="캐시 초기화"
            sub="임시 저장 데이터 삭제"
            onClick={() => { localStorage.clear(); showSuccess("초기화 완료"); }}
            right={<span className="text-[12px] text-blue-500 font-semibold">실행</span>}
          />
        </div>

        <SectionHeader title="계정" />
        <div className="mx-4 rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
          <SettingRow label="회사" sub={userCompany || "-"} />
          <SettingRow
            label="로그아웃"
            danger
            onClick={() => setShowLogoutConfirm(true)}
          />
        </div>

        <SectionHeader title="앱 정보" />
        <div className="mx-4 rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
          <SettingRow label="버전" sub="KP-FLOW 배차관리" right={<span className="text-[12px] text-gray-400 font-mono">v{appVersion}</span>} />
          <SettingRow label="제작" right={<span className="text-[12px] text-gray-400">KP-FLOW Logistics</span>} />
        </div>

      </div>

      {/* 로그아웃 확인 모달 */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowLogoutConfirm(false)}>
          <div className="w-full bg-white rounded-t-3xl p-6" onClick={e => e.stopPropagation()}>
            <div className="text-[16px] font-bold text-gray-900 mb-1">로그아웃</div>
            <div className="text-[13px] text-gray-500 mb-5">정말 로그아웃 하시겠습니까?</div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShowLogoutConfirm(false)} className="py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">취소</button>
              <button onClick={onLogout} className="py-3 rounded-xl bg-red-500 text-white text-sm font-bold">로그아웃</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}