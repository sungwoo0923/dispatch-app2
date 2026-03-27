// ======================= src/mobile/MobileApp.jsx (PART 1/3) =======================
import React, { useState, useMemo, useEffect } from "react";

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../firebase";

// 🔥 role 기반 컬렉션 분기
const role = localStorage.getItem("role") || "user";
const collName = "dispatch";
// 🔙 뒤로가기 아이콘 버튼
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
    for (const m of ["00", "30"]) {
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? "오전" : "오후";
      list.push(`${ampm} ${hour12}:${m}`);
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
    `📦 오더복사 (${todayStr})`,
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
// 🚨 긴급 오더 판단 (PC/모바일 공통)
const isUrgentOrder = (o = {}) => {
  return o.긴급 === true;
};
const normalizePhone = (p = "") =>
  String(p).replace(/[^\d+]/g, "");
// ======================================================================
//  메인 컴포넌트
// ======================================================================

export default function MobileApp() {
  const [page, setPage] = useState("list");
  const [showSimilarPopup, setShowSimilarPopup] = useState(false);
const [fallbackData, setFallbackData] = useState([]);
  // 🔕 알림 ON/OFF 상태 (기본 ON)
const [alarmEnabled, setAlarmEnabled] = useState(
  localStorage.getItem("alarmEnabled") !== "false"
);
const [handovers, setHandovers] = useState([]);
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

  const showToast = (msg) => {
  if (toastMuted) return;   // 🔥 추가
  setToast(msg);
  setTimeout(() => setToast(""), 2000);
};

  // --------------------------------------------------
  // 1. Firestore 실시간 연동 (🔥 전체 데이터 — PC와 동일)
  // --------------------------------------------------
  const [orders, setOrders] = useState([]);
  
  const [drivers, setDrivers] = useState([]);
  const [clients, setClients] = useState([]);
  const [places, setPlaces] = useState([]);
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

  const collections = ["dispatch", "orders"]; // 🔥 핵심

  collections.forEach((name) => {
    const unsub = onSnapshot(collection(db, name), (snap) => {
      const list = snap.docs.map((d) => ({
        _id: d.id,
        id: d.id,
        __col: name, // 🔥 출처 저장
        ...d.data(),
      }));

      setOrders((prev) => {
        const filtered = prev.filter((o) => o.__col !== name);
        return [...filtered, ...list];
      });
    });

    unsubs.push(unsub);
  });

  return () => unsubs.forEach((u) => u());
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

  setToast(`⚠️ 상차 임박 ${nearOrders.length}건! 확인하세요`);
  navigator.vibrate?.(200);
}
  };

  // ✅ 즉시 1회 실행
  checkNearPickup();

  // ✅ 이후 1분마다 재평가 (PC와 동일한 동작)
  const timer = setInterval(checkNearPickup, 60 * 1000);

  return () => clearInterval(timer);
}, [orders, alarmEnabled]);
// 🚨 긴급 오더 등록 즉시 알림 (등록되는 순간 1회)
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
    `🚨 긴급 오더 등록\n${o.거래처명 || ""} ${o.상차시간 || ""}`
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

  return {
    id: d.id,
    거래처명: name,
    주소: address,
  };
});

    setPlaces(list);
  });

  return () => unsub();
}, []);

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
    if (statusTab === "전체") {
  // 전체 = TODAY 최우선 → 차량번호 없는(배차중) → 최신 날짜순
  base.sort((a, b) => {
    // 🔔 TODAY 우선
    const today = todayStr();
    const aToday = getPickupDate(a) === today;
    const bToday = getPickupDate(b) === today;

    if (aToday && !bToday) return -1;
    if (!aToday && bToday) return 1;

    // 🚚 배차중(차량번호 없음) 우선
    const aEmpty = !String(a.차량번호 || "").trim();
    const bEmpty = !String(b.차량번호 || "").trim();

    if (aEmpty && !bEmpty) return -1;
    if (!aEmpty && bEmpty) return 1;

    // 📅 날짜 최신순
    const da = getPickupDate(a) || "";
    const db = getPickupDate(b) || "";
    return db.localeCompare(da);
  });
}
 else {
      // 배차중/배차완료 탭은 최신 날짜순
      base.sort((a, b) => {
          const today = todayStr();
  const aToday = getPickupDate(a) === today;
  const bToday = getPickupDate(b) === today;

  if (aToday && !bToday) return -1;
  if (!aToday && bToday) return 1;

        const da = getPickupDate(a) || "";
        const db = getPickupDate(b) || "";
        return db.localeCompare(da);
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
    (o) => !String(o.차량번호 || "").trim()
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

  // 날짜별 그룹핑 메모
  const groupedByDate = useMemo(() => {
    const map = new Map();
    for (const o of filteredOrders) {
      const d = getPickupDate(o) || "기타";
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(o);
    }
    return map;
  }, [filteredOrders]);

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
      하차일: form.하차일 || "",
      하차시간: form.하차시간 || "",
      지급방식: form.지급방식 || "",
      배차방식: form.배차방식 || "",
      혼적여부: form.혼적여부 || "독차",
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

      updatedAt: serverTimestamp(),
    };

    // 🔹 수정 모드
    if (form._editId) {
      await updateDoc(doc(db, selectedOrder.__col, form._editId), {
        ...docData,
        _id: form._editId,
        id: form._editId,
      });
      showToast("수정 완료!");
      setPage("list");
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

      showToast("등록 완료!");
      setPage("list");
    } catch (e) {
      console.error(e);
      alert("등록 실패!");
    }
  };
  // 📦 오더복사 → 등록창 이동 (오늘 날짜 기준)
const handleOrderDuplicate = (order) => {
 const today = todayKST();

  setForm({
    거래처명: order.거래처명 || "",

    상차일: today,
    상차시간: order.상차시간 || "",
    하차일: today,
    하차시간: order.하차시간 || "",

    상차지명: order.상차지명 || "",
    상차지주소: order.상차지주소 || "",
    하차지명: order.하차지명 || "",
    하차지주소: order.하차지주소 || "",

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

    _editId: null,
    _returnToDetail: false,
  });

  setSelectedOrder(null);
  setPage("form");
  window.scrollTo(0, 0);
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

    let driver = drivers.find(
      (d) => norm(d.차량번호) === norm(차량번호)
    );

    if (!driver) {
      const newId = await upsertDriver({
        차량번호,
        이름: 이름 || "",
        전화번호: 전화번호 || "",
      });

      driver = {
        id: newId,
        차량번호,
        이름: 이름 || "",
        전화번호: 전화번호 || "",
      };
    }

    await updateDoc(doc(db, selectedOrder.__col, selectedOrder.id), {
      기사명: driver.이름,
      차량번호: driver.차량번호,
      전화번호: driver.전화번호,
    });

    setSelectedOrder((prev) =>
      prev
        ? {
          ...prev,
          배차상태: "배차완료",
          상태: "배차완료",
          기사명: driver.이름,
          차량번호: driver.차량번호,
          전화번호: driver.전화번호,
        }
        : prev
    );

    alert(`기사 배차 완료: ${driver.이름} (${driver.차량번호})`);
  };

  const cancelAssign = async () => {
    if (!selectedOrder) return;

    // 🔥 차량번호/기사정보만 제거 → 상태는 자동으로 "배차중"
    await updateDoc(doc(db, selectedOrder.__col, selectedOrder.id), {
      기사명: "",
      차량번호: "",
      전화번호: "",
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
    setPage("list");
    alert("오더가 삭제되었습니다.");
  };

  const handleRefresh = () => {
    window.location.reload();
  };
  // 🔴 전체삭제 비활성화
  const deleteAllOrders = async () => {
    alert("🚫 전체 삭제 기능이 비활성화되었습니다.");
    return;
  };


const title =
  page === "list" ? "등록내역"
  : page === "form" ? (form._editId ? "수정하기" : "화물등록")
  : page === "notice" ? "공지사항"
  : page === "schedule" ? "일정"
  : page === "fare" ? "표준운임표"
  : page === "status" ? "배차현황"
  : page === "unassigned" ? "미배차현황"
  : "상세보기";

  // ------------------------------------------------------------------
  // 렌더링
  // ------------------------------------------------------------------
 return (
  <div className="w-full max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col relative">
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
      <div className="text-sm font-bold mb-2">📝 메모</div>

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

      <MobileHeader
  title={title}
  onBack={
    page === "form"
      ? () => {
          if (form._editId && form._returnToDetail) {
            setPage("detail");
            return;
          }
          setPage("list");
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
      : page === "notice" || page === "schedule" || page === "unassigned"
? () => setPage("list")
: undefined
  }
  onRefresh={page === "list" ? handleRefresh : undefined}
  onMenu={page === "list" ? () => setShowMenu(true) : undefined}
/>
      {showMenu && (
        <MobileSideMenu
          onClose={() => setShowMenu(false)}
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
          onGoStatus={() => {
            setPage("status");
            setShowMenu(false);
          }}
          onGoUnassigned={() => {
            setUnassignedTypeFilter("전체");
            setPage("unassigned");
            setShowMenu(false);
          }}

          onDeleteAll={deleteAllOrders}
          setUiScale={setUiScale}
          uiScale={uiScale}
        />
      )}

      <div className="flex-1 overflow-y-auto pb-24">
        {page === "notice" && (
  <div className="px-4 py-3 space-y-3">
    {notices.length === 0 && (
      <div className="text-sm text-gray-400 text-center">
        등록된 공지가 없습니다.
      </div>
    )}

    {notices.map(n => (
      <div
        key={n.id}
        className="bg-white rounded-xl border shadow-sm p-4"
      >
        {/* 제목 */}
        <div className="text-sm font-semibold text-gray-900">
          📢 {n.title}
        </div>

        {/* 메타 정보 */}
        <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-1">
          <span>
            {n.createdAt?.seconds
              ? new Date(n.createdAt.seconds * 1000).toLocaleDateString("ko-KR")
              : ""}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-gray-100">
            공지
          </span>
        </div>

        {/* 내용 */}
        <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {n.content}
        </div>
      </div>
    ))}
  </div>
)}

{/* ================= 일정 ================= */}
{page === "schedule" && (
  <div className="px-4 py-3 space-y-3">
    {schedules.length === 0 && (
      <div className="text-sm text-gray-400 text-center">
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
    📅 {startDate}
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
{selectedSchedule && (
  <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
    <div className="bg-white w-[90%] rounded-2xl p-5">

      <div className="text-lg font-bold mb-2">
        {selectedSchedule.type || selectedSchedule.title}
      </div>

      <div className="text-sm text-gray-500 mb-2">
        {(selectedSchedule.startDate || selectedSchedule.start)}
        {" ~ "}
        {(selectedSchedule.endDate || selectedSchedule.end)}
      </div>

      <div className="text-sm text-gray-700 whitespace-pre-wrap">
        {selectedSchedule.memo || selectedSchedule.reason}
      </div>

      <button
        className="mt-4 w-full bg-blue-600 text-white py-2 rounded-xl"
        onClick={() => setSelectedSchedule(null)}
      >
        닫기
      </button>

    </div>
  </div>
)}
{/* ================= 인수인계 ================= */}
{page === "handover" && (
  <div className="px-4 py-3 space-y-3">
    {handovers.length === 0 && (
      <div className="text-sm text-gray-400 text-center">
        등록된 인수인계가 없습니다.
      </div>
    )}

    {handovers.map(h => (
      <div
        key={h.id}
        className="bg-white rounded-xl border shadow-sm p-4"
      >
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>작성자: {h.author || "-"}</span>
          <span>{getHandoverDate(h)}</span>
        </div>

        <div className="text-sm font-semibold mb-1">
          받는사람: {h.receiver || "-"}
        </div>

        <div className="text-sm text-gray-700 whitespace-pre-wrap">
          {h.text || ""}
        </div>
      </div>
    ))}
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
  setSelectedOrder(o);
  setDetailFrom("list");   // 🔥 list에서 들어온 거
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
          />
        )}

        {page === "form" && (
          <MobileOrderForm
            form={form}
            setForm={setForm}
            clients={places}
            onSave={handleSave}
            setPage={setPage}
            showToast={showToast}
            drivers={drivers}
            upsertDriver={upsertDriver}
          />
        )}

        {page === "detail" && selectedOrder && (
          <MobileOrderDetail
            order={selectedOrder}
            drivers={drivers}
            onDuplicate={handleOrderDuplicate}
            onAssignDriver={assignDriver}
            onCancelAssign={cancelAssign}
            onCancelOrder={cancelOrder}
            setPage={setPage}
            setForm={setForm}
            setSelectedOrder={setSelectedOrder}
            showToast={showToast}
            upsertDriver={upsertDriver}
          />
        )}

        {page === "fare" && (
          <MobileStandardFare onBack={() => setPage("list")} />
        )}

        {page === "status" && (
          <MobileStatusTable
            title="배차현황"
            orders={filteredStatusOrders}
            onBack={() => setPage("list")}
          />
        )}

        {page === "unassigned" && (
  <MobileUnassignedList
    title="미배차 / 정보미전달"
    orders={{
      unassigned: unassignedOrders,     // 차량번호 없음
      undelivered: undeliveredOrders,   // 배차완료 포함
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
  />
)}

      </div>

      {page === "list" && !showMenu && (
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
            setSelectedOrder(null);
            setPage("form");
          }}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-blue-500 text-white text-3xl flex items-center justify-center shadow-lg active:scale-95"
        >
          +
        </button>
      )}
      {/* ⭐⭐⭐ 글씨 크기 wrapper 닫힘 */}
  </div>
  </div>
);
}
// ======================= src/mobile/MobileApp.jsx (PART 2/3) =======================

// ----------------------------------------------------------------------
// 공통 헤더 / 사이드 메뉴
// ----------------------------------------------------------------------
function MobileHeader({ title, onBack, onRefresh, onMenu }) {
  const isListPage = title === "등록내역";

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-b sticky top-0 z-30">
      <div className="w-12">
        {isListPage ? (
          <button
            onClick={onMenu}
            className="text-sm font-semibold text-blue-600"
          >
            MENU
          </button>
        ) : (
          onBack && <BackIconButton onClick={onBack} />
        )}
      </div>

      <div className="font-semibold text-base text-gray-800">
        {title}
      </div>

      <div className="w-8 flex justify-end">
        {onRefresh && (
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full"
            onClick={onRefresh}
          >
            ⟳
          </button>
        )}
      </div>
    </div>
  );
}


function MobileSideMenu({
  onClose,
  onGoList,
  onGoCreate,
  onGoFare,
  onGoStatus,
  onGoUnassigned,
  onGoNotice,     // ✅ 추가
  onGoSchedule,
    hasNewNotice,        // ⭐ 추가
  hasNewSchedule,      // ⭐ 추가
  onDeleteAll,
  onGoHandover,
  setUiScale,   // ⭐ 추가
  uiScale, 
  alarmEnabled,
 toggleAlarm,
}) {

  const logout = () => {
  if (!window.confirm("로그아웃 하시겠습니까?")) return;

  // 모든 캐시 제거
  localStorage.clear();

  // 앱 전체 새로고침 + 올바른 로그인 화면으로 이동
  setTimeout(() => {
    window.location.replace("/driver-login");
  }, 100);
};


  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-xl flex flex-col">

        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold text-base">(주)돌캐 모바일</div>
          <button className="text-gray-500 text-xl" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <MenuSection title="모바일">
            <MenuItem label="등록내역" onClick={onGoList} />
            <MenuItem label="화물등록" onClick={onGoCreate} />
          </MenuSection>

          <MenuSection title="공지 / 일정">
  <MenuItem
  label="공지사항"
  onClick={onGoNotice}
  badge={hasNewNotice ? "NEW" : null}
/>
<MenuItem
  label="일정"
  onClick={onGoSchedule}
  badge={hasNewSchedule ? "NEW" : null}
/>
  <MenuItem
  label="인수인계"
  onClick={onGoHandover}
/>

</MenuSection>

<MenuSection title="현황 / 운임표">
  <MenuItem label="표준운임표" onClick={onGoFare} />
  <MenuItem label="배차현황" onClick={onGoStatus} />
  <MenuItem label="미배차현황" onClick={onGoUnassigned} />
</MenuSection>


        </div>
        {/* 🔕 알림 ON/OFF */}
<div className="border-t px-4 py-3">
  <button
    onClick={toggleAlarm}
    className={`w-full py-2 rounded-lg text-sm font-semibold
      ${
        alarmEnabled
          ? "bg-green-500 text-white"
          : "bg-gray-300 text-gray-700"
      }`}
  >
    {alarmEnabled ? "🔔 알림 켜짐" : "🔕 알림 꺼짐"}
  </button>
</div>
{/* 🔍 화면 크기 조절 */}
<div className="border-t px-4 py-3">
  <div className="text-xs text-gray-400 mb-2">화면 크기</div>
  <div className="flex gap-2">
    {[1, 1.1, 1.2].map((v) => (
      <button
        key={v}
        onClick={() => {
          setUiScale(v);
          localStorage.setItem("uiScale", v);
        }}
        className={`flex-1 py-1.5 rounded-full text-xs font-semibold border
          ${
            uiScale === v
              ? "bg-blue-500 text-white border-blue-500"
              : "bg-white text-gray-600 border-gray-300"
          }`}
      >
        {v === 1 ? "기본" : v === 1.1 ? "크게" : "아주 크게"}
      </button>
    ))}
  </div>
</div>
        {/* 🔥 로그아웃 버튼 추가 */}
        <div className="border-t px-4 py-3">
          <button
            onClick={logout}
            className="w-full py-2 bg-red-500 text-white rounded-lg text-sm font-semibold active:scale-95"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
  

function MenuSection({ title, children }) {
  return (
    <div className="mt-2">
      <div className="px-4 py-1 text-xs text-gray-400">{title}</div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function MenuItem({ label, onClick, badge }) {
  return (
    <button
      className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-100"
      onClick={onClick}
    >
      <span>{label}</span>

      {badge && (
<span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-500 text-white">
  {badge}
</span>
      )}
    </button>
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
}) {
  // 🔥 탭: 전체 / 배차중 / 배차완료 (배차전/배차취소 없음)
  const tabs = ["전체", "배차중", "배차완료"];

  const dates = Array.from(groupedByDate.keys()).sort((a, b) =>
    a.localeCompare(b)
  );
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
    <div>
      {/* 상태 탭 */}
      <div className="flex bg-white border-b">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setStatusTab(t)}
            className={`flex-1 py-2 text-sm font-medium border-b-2 ${statusTab === t
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500"
              }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 날짜/퀵범위/필터 */}
      <div className="bg-white border-b px-4 py-3 space-y-2">
        {/* 상단 범위 텍스트 (11.24 ~ 11.24) */}
        {/* 🔥 KPI 요약 */}
<div className="grid grid-cols-3 gap-2 mt-2">
  <div className="bg-blue-50 rounded-xl p-2 text-center">
    <div className="text-[11px] text-gray-500">청구</div>
    <div className="text-sm font-bold text-blue-700">
      {summary.totalClaim.toLocaleString()}원
    </div>
  </div>

  <div className="bg-gray-100 rounded-xl p-2 text-center">
    <div className="text-[11px] text-gray-500">기사</div>
    <div className="text-sm font-bold text-gray-700">
      {summary.totalDriver.toLocaleString()}원
    </div>
  </div>

  <div className="bg-green-50 rounded-xl p-2 text-center">
    <div className="text-[11px] text-gray-500">수수료</div>
    <div className="text-sm font-bold text-green-700">
      {summary.totalFee.toLocaleString()}원
    </div>
  </div>
</div>
        <div className="flex items-center justify-between">
  {/* 조회 기간 텍스트 */}
  <div className="text-xs font-semibold text-gray-600">
    {formatRangeShort(startDate, endDate)}
  </div>

  {/* 당일 / 내일 버튼 */}
  <div className="flex gap-1">
    <button
      onClick={setTodayRange}
      className="px-2 py-0.5 rounded-full text-[11px] font-semibold
                 border bg-blue-50 text-blue-700 border-blue-300"
    >
      당일
    </button>

    <button
      onClick={setTomorrowRange}
      className="px-2 py-0.5 rounded-full text-[11px] font-semibold
                 border bg-indigo-50 text-indigo-700 border-indigo-300"
    >
      내일
    </button>
  </div>
</div>
        {/* 시작/종료 날짜 */}
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            className="flex-1 border rounded-full px-3 py-1.5 text-sm bg-gray-50"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span className="text-xs text-gray-400">~</span>
          <input
            type="date"
            className="flex-1 border rounded-full px-3 py-1.5 text-sm bg-gray-50"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        
        {/* 차량종류 / 배차상태 드롭다운 */}
        <div className="flex gap-2 text-sm">
          <select
            className="flex-1 border rounded-full px-3 py-1.5 bg-gray-50"
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
            className="flex-1 border rounded-full px-3 py-1.5 bg-gray-50"
            value={assignFilter}
            onChange={(e) => setAssignFilter(e.target.value)}
          >
            <option value="">배차 전체</option>
            <option value="배차중">배차중</option>
            <option value="배차완료">배차완료</option>
          </select>
        </div>

        {/* 🔍 검색줄 */}
        <div className="flex gap-2 text-sm mt-2">
          <select
            className="w-28 border rounded-full px-3 py-1.5 bg-gray-50"
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
  className="flex-1 border rounded-full px-3 py-1.5 bg-gray-50"
  placeholder={
    searchType === "상차지주소"
      ? "상차지 주소 검색"
      : searchType === "하차지주소"
      ? "하차지 주소 검색"
      : "검색어 입력"
  }
  value={searchText}
  onChange={(e) => setSearchText(e.target.value)}
/>

        </div>
      </div>

      {/* 카드 목록 */}
      <div className="px-3 py-3 space-y-4">
        {dates.length === 0 && (
          <div className="py-10 text-center text-gray-400 text-sm">
            조회된 배차내역이 없습니다.
          </div>
        )}

        {dates.map((dateKey) => {
          const list = groupedByDate.get(dateKey) || [];
          return (
            <div key={dateKey}>
              {/* 날짜 헤더 (카드 바깥 상단) */}
              <div className="text-sm font-bold text-gray-700 mb-2 px-1">
                {formatDateHeader(dateKey)}
              </div>
              <div className="space-y-3">
                {list.map((o) => (
                  <div key={o.id}>
                    <MobileOrderCard
  order={o}
  showUndeliveredOnly={false}
  onSelect={() => onSelect(o)}
  onOpenMemo={setOpenMemo}
/>
                  </div>

                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
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

function MobileOrderCard({
  order,
  onSelect,
  onOpenMemo,
  showUndeliveredOnly,
  onConfirmDeliver,
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

  return (
    <div
      className="relative bg-white rounded-2xl shadow border px-3 py-3"
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
                 bg-yellow-100 text-yellow-800
                 border border-yellow-300
                 text-[10px] font-semibold"
    >
       메모
    </span>
  </div>
)}

      {/* ▶ 상태 + 냉장/냉동 */}
<div className="flex justify-end items-center gap-1 mb-0.5">

  {showUndeliveredOnly && (
    <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-[10px] font-bold border border-yellow-300">
      미전달
    </span>
  )}

  {!showUndeliveredOnly && isUrgentOrder(order) && (
    <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold">
      🚨 긴급
    </span>
  )}

  {!showUndeliveredOnly && isToday && (
    <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
      TODAY
    </span>
  )}

  {isCold && (
    <span className="px-2 py-0.5 rounded-full bg-cyan-600 text-white text-[10px] font-bold">
      ❄ 냉장/냉동
    </span>
  )}

  <span className={"px-2 py-0.5 rounded-full border text-[11px] font-semibold " + stateBadgeClass}>
    {state}
  </span>
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
                ⚠ 임박
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
}
// ======================================================================
// 상세보기
// ======================================================================
function MobileOrderDetail({
  order,
  drivers,
  onDuplicate,
  onAssignDriver,
  onCancelAssign,
  onCancelOrder,
  setPage,
  setForm,
  setSelectedOrder,
  showToast,
  upsertDriver,
}) {
  const [confirmDeliver, setConfirmDeliver] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
    const [confirmUndoDeliver, setConfirmUndoDeliver] = useState(false);
const [expandMemo, setExpandMemo] = useState(false);
  const [carNo, setCarNo] = useState(order.차량번호 || "");
  const [name, setName] = useState(order.기사명 || "");
  const [phone, setPhone] = useState(order.전화번호 || "");

  // 차량번호 입력 시 기사 자동매칭
  useEffect(() => {
    const norm = (s = "") =>
      String(s).replace(/\s+/g, "").toLowerCase();
    if (!carNo) return;
    const d = drivers.find(
      (dr) => norm(dr.차량번호) === norm(carNo)
    );
    if (d) {
      setName(d.이름 || "");
      setPhone(d.전화번호 || "");
    }
  }, [carNo]); // 🔥 수정: drivers 제거!

  // 차량번호 지우면 이름/전화번호 자동 초기화
  useEffect(() => {
    if (!carNo) {
      setName("");
      setPhone("");
    }
  }, [carNo]);

  const openMap = (type) => {
    const addr =
      type === "pickup"
        ? order.상차지주소 || order.상차지명
        : order.하차지주소 || order.하차지명;
    if (!addr) {
      alert("주소 정보가 없습니다.");
      return;
    }
    const url = `https://map.kakao.com/?q=${encodeURIComponent(addr)}`;
    window.open(url, "_blank");
  };

  

  const claim = getClaim(order);
  const sanjae = getSanjae(order);
  const state = getStatus(order); // 🔥 상태 계산 일원화
    const isDelivered =
    order?.업체전달상태 === "전달완료" ||
    order?.정보전달완료 === true;

  const 상차일시 =
    order.상차일시 ||
    `${order.상차일 || ""} ${order.상차시간 || ""}`.trim();
  const 하차일시 =
    order.하차일시 ||
    `${order.하차일 || ""} ${order.하차시간 || ""}`.trim();

  const handleAssignClick = () => {
    if (!carNo) {
      alert("차량번호를 입력해주세요.");
      return;
    }
    if (!name || !phone) {
      if (
        !window.confirm(
          "기사 이름/연락처가 비어 있습니다. 그대로 배차하시겠습니까?"
        )
      )
        return;
    }
    onAssignDriver({
      차량번호: carNo,
      이름: name,
      전화번호: phone,
    });
  };

  return (
    <div className="px-4 py-3 space-y-4">
      {/* 기본 정보 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
        {/* 📝 메모 (접힘/펼치기) */}
{(order.메모 || order.적요) && (
  <div className="mb-3 bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3">
    <div
      className="text-sm font-semibold text-yellow-800 mb-1 cursor-pointer"
      onClick={() => setExpandMemo(v => !v)}
    >
      📝 메모 {expandMemo ? "▲" : "▼"}
    </div>

    <div
      className={`text-sm text-gray-800 whitespace-pre-wrap ${
        expandMemo ? "" : "line-clamp-3"
      }`}
    >
      {order.메모 || order.적요}
    </div>
  </div>
)}

        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="text-xs text-gray-400 mb-1">
              {order.거래처명 || "-"}
            </div>
            <div className="text-sm font-semibold text-blue-600">
              {order.상차지명}
            </div>
            {order.상차지주소 && (
              <div className="text-xs text-gray-500">
                {order.상차지주소}
              </div>
            )}

            <div className="mt-2 text-sm text-gray-800">
              {order.하차지명}
            </div>
            {order.하차지주소 && (
              <div className="text-xs text-gray-500">
                {order.하차지주소}
              </div>
            )}
          </div>

          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 border text-gray-700">
            {state}
          </span>
        </div>

        <div className="text-xs text-gray-500 mb-1">
          상차일시: {상차일시 || "-"}
        </div>
        <div className="text-xs text-gray-500 mb-2">
          하차일시: {하차일시 || "-"}
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-gray-700 mb-3">
          {(order.차량톤수 || order.톤수) && (
            <span className="border rounded-full px-2 py-0.5 bg-gray-50">
              {order.차량톤수 || order.톤수}
            </span>
          )}
          {(order.차량종류 || order.차종) && (
            <span className="border rounded-full px-2 py-0.5 bg-gray-50">
              {order.차량종류 || order.차종}
            </span>
          )}
          {order.화물내용 && (
            <span className="border rounded-full px-2 py-0.5 bg-gray-50">
              {order.화물내용}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm mb-1">
          <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-xs">
            청구운임
          </span>
          <span className="font-semibold">
            {fmtMoney(claim)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm mb-1">
          <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-xs">
            기사운임
          </span>
          <span className="font-semibold">
            {fmtMoney(order.기사운임 || 0)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm mb-2">
          <span className="px-2 py-0.5 rounded-full bg-green-600 text-white text-xs">
            산재보험료
          </span>
          <span className="font-semibold">
            {fmtMoney(sanjae)}
          </span>
        </div>

        {order.혼적여부 && (
          <div className="mt-1 text-xs text-gray-600">
            혼적/독차: {order.혼적여부}
          </div>
        )}
      </div>
      {/* 📌 공유 & 운임조회 (지도보다 위로 이동!) */}
<div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
  <div className="text-sm font-semibold mb-2">공유 & 운임조회</div>
<div className="flex gap-2">
  {/* 오더복사 */}
<button
  onClick={() => onDuplicate(order)}
  className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold"
>
  📦 오더복사
</button>


  {/* 기존 복사 */}
  <button
    onClick={() => setShowCopyModal(true)}
    className="flex-1 py-2 rounded-lg bg-gray-700 text-white text-sm font-semibold"
  >
    📋 복사하기
  </button>

{/* 운임조회 */}
<button
  onClick={() => {
    // 🔥 운임조회 자동 입력용 preset 저장
    window.__farePreset__ = {
      pickup: order.상차지명 || "",
      pickupAddr: order.상차지주소 || "",
      drop: order.하차지명 || "",
      dropAddr: order.하차지주소 || "",
      ton: order.차량톤수 || order.톤수 || "",
      cargo: order.화물내용 || "",
    };

    // 🔥 자동 조회 플래그
    window.__forceFareSearch__ = true;

    window.scrollTo(0, 0);
    setPage("fare");
  }}
  className="flex-1 py-2 rounded-lg bg-indigo-500 text-white text-sm font-semibold"
>
  운임조회
</button>

  </div>
</div>
{/* 🚚 업체 전달 상태 변경 */}
<div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
  <div className="text-sm font-semibold mb-2">업체 전달 상태</div>

  {!isDelivered ? (
    <button
      onClick={() => setConfirmDeliver(true)}
      className="w-full py-3 rounded-lg
                 bg-emerald-500 text-white
                 text-sm font-semibold"
    >
      전달완료로 변경
    </button>
  ) : (
    <button
      onClick={() => setConfirmUndoDeliver(true)}
      className="w-full py-3 rounded-lg
                 bg-red-500 text-white
                 text-sm font-semibold"
    >
      전달완료 취소 (미전달)
    </button>
  )}
</div>

{/* 📞 전화 / 💬 문자 */}
{order.전화번호 && (
  <div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
    <div className="text-sm font-semibold mb-2">기사 연락</div>
    <div className="flex gap-2">
      <a
  href={`tel:${normalizePhone(order.전화번호)}`}
  className="flex-1 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold text-center"
>
  📞 전화
</a>

<a
  href={`sms:${normalizePhone(order.전화번호)}`}
  className="flex-1 py-2 rounded-lg bg-sky-500 text-white text-sm font-semibold text-center"
>
        💬 문자
      </a>
    </div>
  </div>
)}
      {/* 지도 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
        <div className="text-sm font-semibold mb-2">지도 보기</div>
        <div className="flex gap-2">
          <button
            onClick={() => openMap("pickup")}
            className="flex-1 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium"
          >
            상차지 지도
          </button>
          <button
            onClick={() => openMap("drop")}
            className="flex-1 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium"
          >
            하차지 지도
          </button>
        </div>
      </div>
      {/* 기사 배차 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm space-y-3">
        <div className="text-sm font-semibold mb-1">기사 배차</div>

        <div className="text-xs text-gray-500 mb-1">
          현재 상태:{" "}
          <span
            className={
              state === "배차완료"
                ? "text-green-600 font-semibold"
                : "text-gray-700"
            }
          >
            {state}
          </span>
          {order.기사명 && (
            <>
              {" / "}기사: {order.기사명}({order.차량번호})
            </>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <input
            className="w-full border rounded px-2 py-1"
            placeholder="차량번호"
            value={carNo}
            onChange={(e) => setCarNo(e.target.value)}
          />
          <input
            className="w-full border rounded px-2 py-1"
            placeholder="기사 이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full border rounded px-2 py-1"
            placeholder="기사 연락처"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <button
          onClick={handleAssignClick}
          className="w-full py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold mt-2"
        >
          기사 배차하기
        </button>

        {/* 신규 기사 등록 버튼 */}
        {carNo && !drivers.some((d) => d.차량번호 === carNo) && (
          <div className="mt-2">
            <button
              onClick={() => {
                upsertDriver({
                  차량번호: carNo,
                  이름: name || "",
                  전화번호: phone || "",
                });
                showToast("신규 기사 등록 완료");
              }}
              className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-semibold"
            >
              🚚 신규 기사 등록하기
            </button>
          </div>
        )}

        {state === "배차완료" && (
          <button
            onClick={onCancelAssign}
            className="w-full py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold mt-1"
          >
            배차 취소하기
          </button>
        )}

        <button
          onClick={onCancelOrder}
          className="w-full py-2 rounded-lg bg-red-100 text-red-700 text-sm font-semibold mt-1"
        >
          오더 취소(삭제)
        </button>
      </div>

      {/* 수정하기 / 배차정보 유지 옵션 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            id="keepDriver"
            checked={order._keepDriver || false}
            onChange={(e) => {
              setSelectedOrder((prev) => ({
                ...prev,
                _keepDriver: e.target.checked,
              }));
            }}
          />
          <label htmlFor="keepDriver" className="text-sm text-gray-700">
            배차정보(기사/차량번호/연락처) 유지하고 수정하기
          </label>
        </div>

        <button
          onClick={() => {
            window.scrollTo(0, 0);
            setPage("form");

            setForm({
              거래처명: order.거래처명 || "",
              상차일: order.상차일 || "",
              상차시간: order.상차시간 || "",
              하차일: order.하차일 || "",
              하차시간: order.하차시간 || "",
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
              수수료: order.수수료 || 0,
              산재보험료: order.산재보험료 || 0,
              차량번호: order.차량번호 || "",
              혼적여부: order.혼적여부 || "독차",
              적요: order.메모 || "",
              기사명: order._keepDriver ? order.기사명 : "",
              전화번호: order._keepDriver ? order.전화번호 : "",
              _editId: order.id,
              _returnToDetail: true,
            });
          }}
          className="w-full py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold mt-2"
        >
          수정하기
          
        </button>
          {showCopyModal && (
  <CopySelectModal
    order={order}
    onClose={() => setShowCopyModal(false)}
    onAfterFullCopy={() => {
      setShowCopyModal(false);
      setConfirmDeliver(true); // 🔥 여기서 팝업 띄움
    }}
  />
)}
{confirmDeliver && (
  <div
    className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
    onClick={() => setConfirmDeliver(false)}
  >
    <div
      className="bg-white rounded-xl p-5 w-[80%] max-w-xs"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-sm font-semibold mb-2">
        복사되었습니다
      </div>

      <div className="text-sm text-gray-600 mb-4">
        전달상태를<br />
        <b className="text-gray-900">전달완료</b>로 변경할까요?
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setConfirmDeliver(false)}
          className="flex-1 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold"
        >
          아니오 (ESC)
        </button>

        <button
          onClick={async () => {
            await updateDoc(
              doc(db, collName, order.id),
              {
                업체전달상태: "전달완료",
                전달완료일시: serverTimestamp(),
                정보전달완료: true,
                정보전달상태: "전달완료",
              }
            );

            setConfirmDeliver(false);
            showToast("전달완료 처리되었습니다");
          }}
          className="flex-1 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold"
        >
          확인 (Enter)
        </button>
      </div>
    </div>
  </div>
)}
{confirmUndoDeliver && (
  <div
    className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
    onClick={() => setConfirmUndoDeliver(false)}
  >
    <div
      className="bg-white rounded-xl p-5 w-[80%] max-w-xs"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-sm font-semibold mb-2 text-red-600">
        전달완료 취소
      </div>

      <div className="text-sm text-gray-600 mb-4">
        전달상태를<br />
        <b className="text-gray-900">미전달</b>로 되돌릴까요?
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setConfirmUndoDeliver(false)}
          className="flex-1 py-2 rounded-lg
                     bg-gray-200 text-gray-700
                     text-sm font-semibold"
        >
          아니오
        </button>

        <button
          onClick={async () => {
            await updateDoc(
              doc(db, collName, order.id),
              {
                업체전달상태: "미전달",
                정보전달완료: false,
                정보전달상태: "미전달",
                전달완료일시: null, // ⭐ 핵심
              }
            );

            setConfirmUndoDeliver(false);
            showToast("미전달로 되돌렸습니다");
          }}
          className="flex-1 py-2 rounded-lg
                     bg-red-500 text-white
                     text-sm font-semibold"
        >
          확인
        </button>
      </div>
    </div>
  </div>
)}
      </div>
    </div>
    
  );
}

// ======================= src/mobile/MobileApp.jsx (PART 3/3) =======================

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
  // 🔍 거래처 자동검색 state
const [clientQuery, setClientQuery] = useState("");
const [matchedClients, setMatchedClients] = useState([]);
  // ▶ 거래처 선택 후 '상차/하차에 어디로 적용할지' 선택 팝업용
  const [showClientApplyModal, setShowClientApplyModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);

// 🔍 거래처 검색 함수
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
// 🔄 거래처 선택 시 주소 자동반영
const chooseClient = (c) => {
  setMatchedClients([]);
  update("거래처명", c.거래처명);
  update("상차지명", c.거래처명);
  update("상차지주소", c.주소 || c.상차지주소 || c.하차지주소 || "");
};

  const [showNewDriver, setShowNewDriver] = useState(false);

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

    // 🔥 입력값과 완전 동일 (원문 기준도 체크)
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
    setQueryPickup("");
    setShowPickupList(false);
  };

  const pickDrop = (c) => {
  update("하차지명", c.거래처명 || c.하차지명 || "");
  update("하차지주소", c.주소 || c.하차지주소 || c.상차지주소 || "");
  setQueryDrop("");
  setShowDropList(false);
};

  return (
    <div className="px-4 py-3 space-y-3">
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
            <div className="flex gap-2">
              <input
                type="date"
                className="flex-1 border rounded px-2 py-1 text-sm"
                value={form.상차일}
                onChange={(e) => update("상차일", e.target.value)}
              />
              <select
  className="flex-1 border rounded px-2 py-1 text-sm"
  value={form.상차시간}
  onChange={(e) => update("상차시간", e.target.value)}
>
  <option value="">상차시간</option>
  {HALF_HOUR_TIMES.map((t) => (
    <option key={t} value={t}>{t}</option>
  ))}
</select>

            </div>
          }
        />

        <RowLabelInput
          label="하차일시"
          input={
            <div className="flex gap-2">
              <input
                type="date"
                className="flex-1 border rounded px-2 py-1 text-sm"
                value={form.하차일}
                onChange={(e) => update("하차일", e.target.value)}
              />
              <select
  className="flex-1 border rounded px-2 py-1 text-sm"
  value={form.하차시간}
  onChange={(e) => update("하차시간", e.target.value)}
>
  <option value="">하차시간</option>
  {HALF_HOUR_TIMES.map((t) => (
    <option key={t} value={t}>{t}</option>
  ))}
</select>

            </div>
          }
        />

      </div>

      {/* 거래처명 */}
<div className="bg-white rounded-lg border shadow-sm">
  <RowLabelInput
    label="거래처명"
    input={
      <div className="relative">
        <input
          className="w-full border rounded px-2 py-1 text-sm"
          value={form.거래처명}
          onChange={(e) => {
            const val = e.target.value;
            update("거래처명", val);
            update("상차지명", val);
            setClientQuery(val);
            searchClient(val);
          }}
          onFocus={() => {
            if (form.거래처명) searchClient(form.거래처명);
          }}
          onBlur={async () => {
  // 자동완성 클릭 직후 blur 방지
  setTimeout(() => setMatchedClients([]), 200);

  const val = form.거래처명.trim();
  if (!val) return;

  const normVal = normalizeCompany(val);

  // ✅ 1️⃣ 자동완성으로 이미 선택된 경우 → 종료
  if (selectedClient) {
    return;
  }

  // ✅ 2️⃣ 주소가 이미 있으면 = 기존 거래처 → 종료
  if (form.상차지주소 || form.하차지주소) {
    return;
  }

  // ✅ 3️⃣ clients 기준 기존 거래처 존재 여부
  const existing = clients.find(
    (c) => normalizeCompany(c.거래처명) === normVal
  );

  // ✅ 4️⃣ 진짜 신규일 때만 팝업
  if (!existing && val.length >= 2) {
    const ok = window.confirm(
      "📌 등록되지 않은 거래처입니다.\n신규 등록할까요?"
    );
    if (ok) {
      await addDoc(collection(db, "places"), {
  거래처명: val,
  주소: "",
  createdAt: serverTimestamp(),
});
      showToast("신규 거래처 등록 완료!");
    }
  }
}}
        />
        {/* 🔽 자동완성 리스트 */}
        {matchedClients.length > 0 && (
          <ul className="absolute z-50 bg-white border shadow rounded mt-1 w-full max-h-40 overflow-auto">
            {matchedClients.map((c) => (
              <li
  key={c.id}
  className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
  onMouseDown={() => {
  // 🔥 1. 거래처 확정 반영 (blur 전에!)
  update("거래처명", c.거래처명);
  update("상차지명", c.거래처명);
  update(
    "상차지주소",
    c.주소 || c.상차지주소 || c.하차지주소 || ""
  );

  // 🔥 2. 선택 상태 저장
  setSelectedClient(c);
  setShowClientApplyModal(true);

  // 🔥 3. 자동완성 닫기
  setMatchedClients([]);
}}

>
                <div className="font-semibold text-gray-800">
                  {c.거래처명}
                </div>
                <div className="text-xs text-gray-500">
                  {c.주소 || "- 주소 미등록"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    }
  />
</div>


      {/* 상/하차 + 주소 + 자동완성 */}
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
      🔄
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

  const primary =
    Array.isArray(found.담당자목록)
      ? found.담당자목록.find(m => m.대표) ||
        found.담당자목록[0]
      : null;

  update("상차지담당자", primary?.이름 || "");
  update("상차지담당자번호", primary?.번호 || "");
}

            }}
            onFocus={() => {
              if (form.상차지명) setShowPickupList(true);
            }}
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
      </div>
    }
  />
  {/* 🔴 하차지 */}
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

  const primary =
    Array.isArray(found.담당자목록)
      ? found.담당자목록.find(m => m.대표) ||
        found.담당자목록[0]
      : null;

  update("하차지담당자", primary?.이름 || "");
  update("하차지담당자번호", primary?.번호 || "");
}
            }}
            onFocus={() => {
              if (form.하차지명) setShowDropList(true);
            }}
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
      </div>
    }
  />
      </div>

      {/* 톤수/차종/화물내용 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="톤수 / 차종 / 화물"
          input={
            <div className="grid grid-cols-3 gap-2">
              <input
                className="border rounded px-2 py-1 text-sm"
                placeholder="톤수"
                value={form.톤수}
                onChange={(e) => update("톤수", e.target.value)}
              />
              <select
                className="border rounded px-2 py-1 text-sm"
                value={form.차종}
                onChange={(e) => update("차종", e.target.value)}
              >
                <option value="">차량종류</option>
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
              <input
                className="border rounded px-2 py-1 text-sm"
                placeholder="화물내용"
                value={form.화물내용}
                onChange={(e) => update("화물내용", e.target.value)}
              />
            </div>
          }
        />
      </div>

      {/* 상/하차방법 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="상/하차방법"
          input={
            <div className="flex gap-2">
              <select
                className="flex-1 border rounded px-2 py-1 text-sm"
                value={form.상차방법}
                onChange={(e) => update("상차방법", e.target.value)}
              >
                <option value="">상차방법</option>
                <option value="지게차">지게차</option>
                <option value="수작업">수작업</option>
                <option value="직접수작업">직접수작업</option>
                <option value="수도움">수도움</option>
              </select>
              <select
                className="flex-1 border rounded px-2 py-1 text-sm"
                value={form.하차방법}
                onChange={(e) => update("하차방법", e.target.value)}
              >
                <option value="">하차방법</option>
                <option value="지게차">지게차</option>
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
            <div className="flex gap-2">
              <select
                className="flex-1 border rounded px-2 py-1 text-sm"
                value={form.지급방식}
                onChange={(e) => update("지급방식", e.target.value)}
              >
                <option value="">지급방식</option>
                <option value="계산서">계산서</option>
                <option value="착불">착불</option>
                <option value="선불">선불</option>
                <option value="손실">손실</option>
                <option value="개인">개인</option>
                <option value="기타">기타</option>
              </select>
              <select
                className="flex-1 border rounded px-2 py-1 text-sm"
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
          🚚 신규 기사 등록하기
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
          className="w-full py-3 rounded-lg bg-blue-500 text-white text-base font-semibold shadow"
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
            className="w-full py-3 rounded-lg bg-gray-300 text-gray-800 text-base font-semibold shadow"
          >
            수정취소
          </button>
        )}
      </div>
      {/* =============================
    거래처 적용 선택 팝업
============================== */}
{showClientApplyModal && selectedClient && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
    <div className="bg-white rounded-xl shadow-xl p-5 w-72">

      <div className="text-sm font-semibold mb-3">
        선택한 거래처를 어디에 적용할까요?
      </div>

      <div className="mb-4 text-xs text-gray-500">
        {selectedClient.거래처명}
        <br />
        {selectedClient.주소 || "- 주소 없음"}
      </div>

      <button
        className="w-full py-2 mb-2 bg-blue-500 text-white rounded-lg text-sm"
        onClick={() => {
          update("상차지명", selectedClient.거래처명);
          update("상차지주소", selectedClient.주소 || "");
          setShowClientApplyModal(false);
        }}
      >
        상차지에 적용
      </button>

      <button
        className="w-full py-2 mb-2 bg-indigo-500 text-white rounded-lg text-sm"
        onClick={() => {
          update("하차지명", selectedClient.거래처명);
          update("하차지주소", selectedClient.주소 || "");
          setShowClientApplyModal(false);
        }}
      >
        하차지에 적용
      </button>

      <button
        className="w-full py-2 bg-gray-300 text-gray-700 rounded-lg text-sm"
        onClick={() => setShowClientApplyModal(false)}
      >
        취소
      </button>
    </div>
  </div>
)}

    </div>
  );
}

function CopySelectModal({ order, onClose, onAfterFullCopy }) {
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
        header = `익일 하차 건 (상차: ${md(order.상차일)} → 하차: ${md(
          order.하차일
        )})`;
      } else if (dayDiff >= 2) {
        header = `지정 하차 건 (상차: ${md(order.상차일)} → 하차: ${md(
          order.하차일
        )})`;
      }

      const pickupTime = timeOrNow(order.상차시간);
      const dropTimeRaw = timeOrNow(order.하차시간);
      const dropTime =
        dayDiff >= 1
          ? `${md(order.하차일)} ${dropTimeRaw}`
          : dropTimeRaw;
  // ✅ 여기! 문자열 밖
  const pallet =
    extractPallet(order.화물내용) ||
    extractPallet(order.화물정보) ||
    "";
      text = `
${header ? header + "\n\n" : ""}${order.상차일} ${getYoil(order.상차일)}

상차지 : ${order.상차지명}
${order.상차지주소}
담당자 : ${order.상차지담당자} (${order.상차지담당자번호})
상차시간 : ${pickupTime}

하차지 : ${order.하차지명}
${order.하차지주소}
담당자 : ${order.하차지담당자} (${order.하차지담당자번호})
하차시간 : ${dropTime}

중량 : ${normalizeTon(order.차량톤수)}${
  pallet ? ` / ${pallet}파렛트` : ""
} ${order.차량종류 || order.차종}

${order.차량번호} ${driverName} ${driverPhone}
${Number(order.청구운임 || 0).toLocaleString()}원 부가세별도 배차되었습니다.
`.trim();
    }

    /* =========================
   4️⃣ 기사 전달용 (상세 + 전달메시지)
========================= */
else if (type === "driver") {
  // ❄️ 냉장 / 냉동 여부 판단
  const carTypeText = String(order.차량종류 || order.차종 || "");
  const isCold =
    carTypeText.includes("냉장") || carTypeText.includes("냉동");

  const NOTICE = isCold ? COLD_NOTICE : NORMAL_NOTICE;

  const tonText = normalizeTon(order.차량톤수 || order.톤수);

  const pickupManagerLine = buildManagerLine(
    order.상차지담당자,
    order.상차지담당자번호
  );

  const dropManagerLine = buildManagerLine(
    order.하차지담당자,
    order.하차지담당자번호
  );

  const pallet =
    extractPallet(order.화물내용) ||
    extractPallet(order.화물정보) ||
    "";

  text = `
${NOTICE}

${order.상차일} ${getYoil(order.상차일)}

상차지 : ${order.상차지명}
${order.상차지주소}
${pickupManagerLine}
상차시간 : ${timeOrNow(order.상차시간)}

하차지 : ${order.하차지명}
${order.하차지주소}
${dropManagerLine}
하차시간 : ${timeOrNow(order.하차시간)}

중량 : ${tonText}${pallet ? ` / ${pallet}파` : ""} ${order.차량종류 || order.차종}
`.replace(/\n{2,}/g, "\n\n").trim();
}

await navigator.clipboard.writeText(text);

if (type === "full") {
  onAfterFullCopy?.();   // 🔥 확인 팝업 트리거
  return;
}

alert("복사되었습니다.");
onClose();
  };

  /* ===============================
     UI
  =============================== */

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-xl shadow-xl p-5 w-80 space-y-2">
        <div className="text-sm font-semibold text-center">
          📋 복사 방식 선택
        </div>

        <button
          onClick={() => copy("simple")}
          className="w-full py-2 bg-gray-100 rounded text-sm"
        >
          차량번호 / 기사명 / 전화번호
        </button>

        <button
          onClick={() => copy("fare")}
          className="w-full py-2 bg-blue-100 rounded text-sm"
        >
          운임 포함 (부가세/선불/착불)
        </button>

        <button
          onClick={() => copy("full")}
          className="w-full py-2 bg-green-100 rounded text-sm"
        >
          전체 상세 (상하차 + 화물정보 + 차량)
        </button>

        <button
          onClick={() => copy("driver")}
          className="w-full py-2 bg-emerald-200 rounded text-sm font-semibold"
        >
          기사 전달용 (상세 + 전달메시지)
        </button>

        <button
          onClick={onClose}
          className="w-full py-2 bg-gray-300 rounded text-sm"
        >
          취소
        </button>
      </div>
      
    </div>
  );
}
// ======================================================================
// 공통 RowLabelInput
// ======================================================================
function RowLabelInput({ label, input, right }) {
  return (
    <div className="flex border-b last:border-b-0">
      <div className="w-24 px-3 py-2 text-xs text-gray-600 bg-gray-50 flex items-center justify-between">
        <span>{label}</span>
        {right}
      </div>
      <div className="flex-1 px-3 py-2">{input}</div>
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

  // 🔥 Firestore 로딩
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, collName));
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setDispatchData(arr);
    })();
  }, []);

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

// 🔥 박스/잡짐 → 톤수만 비교
if (isInputBox || isRowBox) {
  return rowTon === inputTonNum2;
}

// 🔥 파렛트 아닌 경우 → 톤수만
if (!isInputPallet || !isRowPallet) {
  return rowTon === inputTonNum2;
}

// 🔥 파렛트 → 화물 + 톤수
return (
  rowCargo === inputCargoNum &&
  rowTon === inputTonNum2
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
    <div className="px-4 py-4 space-y-4">
      {/* 뒤로가기 */}
      <button
        onClick={onBack}
        className="px-3 py-1 bg-gray-200 text-sm rounded"
      >
        ◀
      </button>

      <div className="bg-white border rounded-xl p-4 shadow-sm space-y-3">

  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

    {/* 1️⃣ 상/하차지명 */}
    <div className="space-y-2">
      <div className="text-sm font-semibold text-blue-600">
        상/하차지명
      </div>

      <input
        className="w-full border rounded px-2 py-2 text-sm"
        placeholder="상차지명"
        value={pickup}
        onChange={(e) => setPickup(e.target.value)}
      />

      <input
        className="w-full border rounded px-2 py-2 text-sm"
        placeholder="하차지명"
        value={drop}
        onChange={(e) => setDrop(e.target.value)}
      />
    </div>

    {/* 2️⃣ 상/하차지주소 */}
    <div className="space-y-2">
      <div className="text-sm font-semibold text-blue-600">
        상/하차지주소
      </div>

      <input
        className="w-full border rounded px-2 py-2 text-sm"
        placeholder="상차지주소"
        value={pickupAddr}
        onChange={(e) => setPickupAddr(e.target.value)}
      />

      <input
        className="w-full border rounded px-2 py-2 text-sm"
        placeholder="하차지주소"
        value={dropAddr}
        onChange={(e) => setDropAddr(e.target.value)}
      />
    </div>

    {/* 3️⃣ 화물 / 차량 */}
    <div className="space-y-2">
      <div className="text-sm font-semibold text-blue-600">
        화물 / 차량
      </div>

      <input
        className="w-full border rounded px-2 py-2 text-sm"
        placeholder="톤수"
        value={ton}
        onChange={(e) => setTon(e.target.value)}
      />

      <input
        className="w-full border rounded px-2 py-2 text-sm"
        placeholder="화물내용"
        value={cargo}
        onChange={(e) => setCargo(e.target.value)}
      />
<label className="flex items-center gap-2 text-sm mt-1">
  <input
    type="checkbox"
    checked={strictMatchOnly}
    onChange={(e) => setStrictMatchOnly(e.target.checked)}
  />
  화물/톤수 완전일치만 보기
</label>

      <select
        className="w-full border rounded px-2 py-2 text-sm"
        value={vehicle}
        onChange={(e) => setVehicle(e.target.value)}
      >
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

  </div>

  {/* 🔥 운임 조회 버튼 유지 */}
  <button
    id="fare-search-button"
    onClick={calcFareMobile}
    className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold"
  >
    🔍 운임조회
  </button>

</div>

      {/* 결과 */}
{(result || matchedRows.length > 0) && (
  <div className="bg-white border p-4 rounded-xl shadow-sm space-y-3">

    <div className="font-semibold">
      건수: {matchedRows.length}건
    </div>

    {/* ✅ result 있을 때만 평균 */}
    {result && (
      <>
        <div>평균운임: {result.avg.toLocaleString()}원</div>
        <div>
          최근운임: {result.latestFare.toLocaleString()}원 (
          {result.latest?.상차일?.slice(0, 10) || "-"})
        </div>
      </>
    )}

    {/* 🔥 fallback일 때 안내 */}
    {!result && (
      <div className="text-sm text-orange-500 font-semibold">
        ⚠️ 동일 조건 없음 → 유사 데이터 표시
      </div>
    )}

    {/* AI 추천 */}
    {result && aiFare && (
      <div className="mt-3 p-3 rounded-lg bg-indigo-50 border border-indigo-200">
        <div className="text-sm text-indigo-800">
          🔮 추천 운임(예측):{" "}
          <span className="font-bold">
            {aiFare.aiValue.toLocaleString()}원
          </span>
        </div>
        <div className="text-xs text-indigo-500">
          정확도 {aiFare.confidence}%
        </div>
      </div>
    )}

    <div className="text-xs text-gray-600">
      과거 운임 기록:
    </div>

    {/* 리스트 */}
    <div className="mt-4 space-y-3">
      {matchedRows.map((r) => {

        const rawFare = Number(r.청구운임 || 0);
        const fare = rawFare.toLocaleString();

        const driverRaw = Number(r.기사운임 || 0);
        const driver = driverRaw.toLocaleString();
        const profit = rawFare - driverRaw;

        const rowCargoNum = extractCargoNumber(r.화물내용);

        const samePalletGroup = matchedRows.filter(item => {
          const num = extractCargoNumber(item.화물내용);
          return num === rowCargoNum;
        });

        const palletAvg = samePalletGroup.length
          ? Math.round(
              samePalletGroup.reduce((sum, item) =>
                sum + Number(String(item.청구운임 || 0).replace(/[^\d]/g, "")),
              0) / samePalletGroup.length
            )
          : rawFare;

        const diff = rawFare - palletAvg;
        const percent = palletAvg
          ? Math.round((diff / palletAvg) * 100)
          : 0;

        const isHigh = percent > 3;
        const isLow  = percent < -3;

        return (
          <div
            key={r.id}
            className="bg-white shadow-sm rounded-xl p-4 border border-gray-200"
          >
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">
                {r.상차일?.slice(5) || "-"}
              </span>

              <span
                className={`text-lg font-semibold ${
                  isHigh
                    ? "text-red-600"
                    : isLow
                    ? "text-blue-600"
                    : "text-gray-800"
                }`}
              >
                {fare}원
                {isHigh && " 🔺"}
                {isLow && " 🔻"}
              </span>
            </div>

            {result && (
              <div
                className={`text-xs mt-1 ${
                  isHigh
                    ? "text-red-500"
                    : isLow
                    ? "text-blue-500"
                    : "text-gray-400"
                }`}
              >
                평균 대비 {percent > 0 ? "+" : ""}
                {percent}%
              </div>
            )}

            <div className="mt-3">
              <div className="text-sm font-semibold text-gray-800">
                {r.상차지명 || "-"} → {r.하차지명 || "-"}
              </div>

              <div className="text-xs text-gray-500 mt-1">
                {shortAddr(r.상차지주소)} → {shortAddr(r.하차지주소)}
              </div>
            </div>

            <div className="mt-3 text-xs text-gray-700 font-medium">
              {r.화물내용 || "-"}
              <span className="mx-2 text-gray-300">|</span>
              {r.차량톤수 || "-"}
              <span className="mx-2 text-gray-300">|</span>
              {r.차량종류 || "-"}
            </div>

            <div className="mt-3 text-xs text-gray-600 border-t pt-2 flex justify-between">
              <span>기사 {driver}원</span>
              <span>수수료 {profit.toLocaleString()}원</span>
            </div>
          </div>
        );
      })}
    </div>

  </div>
)}
      {showSimilarPopup && (
  <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center">
    <div className="bg-white w-[320px] rounded-2xl p-5">

      <div className="text-lg font-bold mb-2">
        🔍 검색 결과 없음
      </div>

      <div className="text-sm text-gray-600 mb-4">
        동일한 화물 기록이 없습니다.<br />
        비슷한 조건으로 검색합니다.
      </div>

      <button
        onClick={() => {
          setShowSimilarPopup(false);
          setMatchedRows(fallbackData);
        }}
        className="w-full bg-blue-600 text-white py-2 rounded-lg"
      >
        확인
      </button>

    </div>
  </div>
)}
{showNoResultPopup && (
  <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center">
    <div className="bg-white p-5 rounded-xl w-[320px]">

      <div className="text-lg font-bold mb-2">
        조회 결과 없음
      </div>

      <div className="text-sm text-gray-600 mb-4">
        해당 상/하차지 기록이 없습니다.
      </div>

      <button
        onClick={() => setShowNoResultPopup(false)}
        className="w-full py-2 bg-gray-600 text-white rounded-lg"
      >
        확인
      </button>

    </div>
  </div>
)}
{showAddressConfirmPopup && (
  <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center">
    <div className="bg-white p-5 rounded-xl w-[340px]">

      <div className="text-lg font-bold mb-2">
        조회 결과 없음
      </div>

      <div className="text-sm text-gray-600 mb-4">
        동일한 상/하차지 기록이 없습니다.<br />
        주소 기준으로 조회하시겠습니까?
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setShowAddressConfirmPopup(false)}
          className="flex-1 py-2 bg-gray-200 rounded-lg"
        >
          취소
        </button>

        <button
          onClick={() => {
            setShowAddressConfirmPopup(false);
            searchByAddress();
          }}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg"
        >
          확인
        </button>
      </div>

    </div>
  </div>
)}
{showFareSummaryPopup && fareSummary && (
  <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center">

    <div className="bg-white w-[360px] rounded-2xl p-5 shadow-2xl">

      <div className="text-lg font-bold mb-4 text-gray-800">
        📊 운임 이력 비교
      </div>

      <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200">
  <div className="text-sm text-red-500 font-semibold mb-1">
    최고 운임
  </div>

  <div className="text-xl font-bold text-red-600">
    {Number(fareSummary.highest.청구운임 || 0).toLocaleString()}원
  </div>

  <div className="text-sm text-gray-600 mt-1">
    {fareSummary.highest.상차일?.slice(0,10)}
  </div>

  <div className="text-base mt-2 font-semibold">
    {fareSummary.highest.상차지명} → {fareSummary.highest.하차지명}
  </div>

  <div className="text-sm text-gray-700 mt-1">
    {fareSummary.highest.화물내용 || "-"} / {fareSummary.highest.차량톤수 || "-"}
  </div>

  <div className="text-sm text-gray-500 mt-2">
    {fareSummary.highest.메모 || "메모 없음"}
  </div>
</div>

      <div className="mb-4 p-4 rounded-xl bg-blue-50 border border-blue-200">
        <div className="text-xs text-blue-500 font-semibold mb-1">
          최저 운임
        </div>

        <div className="text-lg font-bold text-blue-600">
          {Number(fareSummary.lowest.청구운임 || 0).toLocaleString()}원
        </div>

        <div className="text-sm text-gray-600 mt-1">
          {fareSummary.lowest.상차일?.slice(0,10)}
        </div>

        <div className="text-base mt-2 font-semibold">
          {fareSummary.lowest.상차지명} → {fareSummary.lowest.하차지명}
        </div>
          <div className="text-sm text-gray-700 mt-1">
    {fareSummary.highest.화물내용 || "-"} / {fareSummary.highest.차량톤수 || "-"}
  </div>

        <div className="text-sm text-gray-500 mt-2">
          {fareSummary.lowest.메모 || "메모 없음"}
        </div>
      </div>

      <button
        onClick={() => setShowFareSummaryPopup(false)}
        className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold"
      >
        확인
      </button>

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


  const [confirmTarget, setConfirmTarget] = useState(null);
  const handleConfirmDeliver = async () => {
  if (!confirmTarget) return;

  await updateDoc(
    doc(db, collName, confirmTarget.id),
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

  // ✅ 탭 상태
const [tab, setTab] = useState("미배차"); 
// "미배차" | "정보미전달"

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
    <div className="px-3 py-3">
      
      {/* 🔥 미배차 / 정보미전달 탭 */}
<div className="flex rounded-xl overflow-hidden mb-4 border bg-gray-100">
  
  {["미배차", "정보미전달"].map((t) => (
    <button
      key={t}
      onClick={() => {
        setTab(t);
        setUnassignedTypeFilter("전체"); // 🔥 탭 바뀔 때 필터 초기화
      }}
      className={`flex-1 py-2.5 text-sm font-bold
        ${
          tab === t
            ? "bg-blue-600 text-white shadow"
            : "bg-transparent text-gray-500"
        }`}
    >
      {t}
    </button>
  ))}
</div>


      {/* 🔎 상태 필터 (조건) */}
<div className="flex gap-2 mb-4 px-1">
  {(tab === "정보미전달"
    ? ["전체", "배차중", "배차완료"]
    : ["전체", "냉장/냉동", "일반"]
  ).map((t) => (
    <button
      key={t}
      onClick={() => setUnassignedTypeFilter(t)}
      className={`px-3 py-1 rounded-full text-xs font-semibold border
        transition
        ${
          unassignedTypeFilter === t
            ? "bg-blue-50 text-blue-700 border-blue-400"
            : "bg-white text-gray-500 border-gray-300"
        }`}
    >
      {t}
    </button>
  ))}
</div>
{/* 🔢 미배차 요약 바 */}
{tab === "미배차" && (
  <div className="mb-3 px-3 py-2 rounded-xl
                  bg-white border shadow-sm
                  flex justify-between items-center
                  text-xs font-semibold text-gray-700">
    <span>
      총 <b className="text-blue-600">{totalCount}</b>건
    </span>

    <div className="flex gap-2">
      <span className="px-2 py-0.5 rounded-full
                       bg-cyan-100 text-cyan-700 text-[11px] font-bold">
        ❄ 냉장/냉동 {coldCount}
      </span>

      <span className="px-2 py-0.5 rounded-full
                       bg-gray-100 text-gray-700 text-[11px] font-bold">
        🚚 일반 {normalCount}
      </span>
    </div>
  </div>
)}

      <div className="mb-2 text-xs text-gray-500">
        {title}
      </div>
      {sortedDates.map((dateStr) => {
  const list = dateMap.get(dateStr) || [];

  return (
    <div key={dateStr} className="mb-6">
      <div className="text-sm font-bold text-gray-700 mb-2 px-1">
        {formatDateHeader(dateStr)}
      </div>

      <div className="space-y-3">
        {list.map((o) => (
          <MobileOrderCard
            key={o.id}
            order={o}
            onSelect={() => {
              setSelectedOrder(o);
              setDetailFrom("unassigned");
              setPage("detail");
              window.scrollTo(0, 0);
            }}
            onOpenMemo={setOpenMemo}
            showUndeliveredOnly={tab === "정보미전달"}
            onConfirmDeliver={() => setConfirmTarget(o)}
          />
        ))}
      </div>
    </div>
  );
})}
      {confirmTarget && (
  <div
    className="fixed inset-0 bg-black/40 z-50
               flex items-center justify-center"
    onClick={() => setConfirmTarget(null)}
  >
    <div
      className="bg-white rounded-xl p-5 w-[80%] max-w-xs"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-sm font-semibold mb-2">
        정보전달 완료
      </div>

      <div className="text-sm text-gray-600 mb-4">
        이 오더를<br />
        <b className="text-gray-900">전달완료</b> 처리하시겠습니까?
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setConfirmTarget(null)}
          className="flex-1 py-2 rounded-lg
                     bg-gray-200 text-gray-700
                     text-sm font-semibold"
        >
          취소
        </button>

        <button
          onClick={handleConfirmDeliver}
          className="flex-1 py-2 rounded-lg
                     bg-emerald-500 text-white
                     text-sm font-semibold"
        >
          확인
        </button>
      </div>
    </div>
  </div>
)}

    </div>
  );
}