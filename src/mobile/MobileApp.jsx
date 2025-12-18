// ======================= src/mobile/MobileApp.jsx (PART 1/3) =======================
import React, { useState, useMemo, useEffect } from "react";

import {
  collection,
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
const collName = role === "test" ? "dispatch_test" : "dispatch";
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
// ✅ ⬆⬆⬆ 여기까지 ⬆⬆⬆
// 상차일 기준 날짜 뽑기(PC/모바일 공통 대응)
const getPickupDate = (o = {}) => {
  return String(o.상차일 || "").slice(0, 10);
};

// 청구운임 / 인수증
const getClaim = (o = {}) => o.청구운임 ?? o.인수증 ?? 0;

// 산재보험료
const getSanjae = (o = {}) => o.산재보험료 ?? 0;

// 짧은 주소 (시/구까지만)
const shortAddr = (addr = "") => {
  const parts = String(addr).split(/\s+/);
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
  if (parts.length === 1) return parts[0];
  return "";
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

// 시간 부분만 추출: "2025-11-24 08:00" → "08:00"
const onlyTime = (dt = "") => {
  const s = String(dt).trim();
  const parts = s.split(" ");
  return parts[1] || "";
};

// 오늘 / 내일 / 기타 → 당일/내일/어제 or MM/DD
const getDayBadge = (dateStr) => {
  if (!dateStr) return "";
  const today = new Date();
  const target = new Date(dateStr);

  const diff =
    Math.floor(
      (target.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) /
      (1000 * 60 * 60 * 24)
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

// 카톡 공유용 문자열
function buildKakaoMessage(order) {
  const lines = [];

  const 상차일시 =
    order.상차일시 ||
    `${order.상차일 || ""} ${order.상차시간 || ""}`.trim();
  const 하차일시 =
    order.하차일시 ||
    `${order.하차일 || ""} ${order.하차시간 || ""}`.trim();

  if (상차일시) lines.push(`상차일시: ${상차일시}`);
  if (하차일시) lines.push(`하차일시: ${하차일시}`);

  lines.push("");
  lines.push("[거래처]");
  lines.push(order.거래처명 || "-");

  lines.push("");
  lines.push("[상차지]");
  lines.push(order.상차지명 || "-");
  if (order.상차지주소) lines.push(order.상차지주소);

  lines.push("");
  lines.push("[하차지]");
  lines.push(order.하차지명 || "-");
  if (order.하차지주소) lines.push(order.하차지주소);

  lines.push("");
  lines.push(
    `차량: ${order.차량톤수 || order.톤수 || ""} ${order.차량종류 || order.차종 || ""
      }`.trim() || "차량 정보 없음"
  );

  const claim = getClaim(order);
  lines.push(`청구운임: ${claim.toLocaleString("ko-KR")}원`);
  lines.push(
    `기사운임: ${(order.기사운임 ?? 0).toLocaleString("ko-KR")}원`
  );
  lines.push(
    `수수료: ${(
      order.수수료 ?? claim - (order.기사운임 ?? 0)
    ).toLocaleString("ko-KR")}원`
  );

  if (order.비고 || order.메모) {
    lines.push("");
    lines.push(`[비고] ${order.비고 || order.메모}`);
  }

  return lines.join("\n");
}

// 🔥 상태 문자열: 차량번호 유무로만 결정
// 차량번호 없음 → "배차중", 있으면 → "배차완료"
const getStatus = (o = {}) => {
  const car = String(o.차량번호 || "").trim();
  return car ? "배차완료" : "배차중";
};

// ======================================================================
//  메인 컴포넌트
// ======================================================================

export default function MobileApp() {


  // -------------------------------------------------------------
  // 🔥 추가: 빠른 날짜 선택 (1/3/7/15일 버튼)
  // -------------------------------------------------------------
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // 🔍 UI 크기 스케일 (1 = 기본, 1.1 = 크게, 1.2 = 아주 크게)
  const [uiScale, setUiScale] = useState(
    Number(localStorage.getItem("uiScale") || 1)
  );
  const quickRange = (days) => {
    const today = new Date();
    const end = today.toISOString().slice(0, 10);
    const startObj = new Date();
    startObj.setDate(today.getDate() - (days - 1));
    const start = startObj.toISOString().slice(0, 10);
    setStartDate(start);
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
  const [quickAssignTarget, setQuickAssignTarget] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  // --------------------------------------------------
  // 1. Firestore 실시간 연동 (🔥 전체 데이터 — PC와 동일)
  // --------------------------------------------------
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [clients, setClients] = useState([]);
  // 🔥 FCM Token 관리자만 저장
useEffect(() => {
  const role = localStorage.getItem("role"); // 저장된 role 가져오기
  if (role !== "admin") return; // 관리자가 아니면 스킵

  import("../firebase").then(({ saveFcmToken }) => {
    auth.onAuthStateChanged((user) => {
      if (user) {
        saveFcmToken(user); // 🔥 FCM 토큰 저장
      }
    });
  });
}, []);
// 🔔 앱 켜져 있을 때 알림 표시
useEffect(() => {
  import("../firebase").then(({ initForegroundFCM }) => {
    initForegroundFCM((payload) => {
      setToast(`${payload.notification.title} - ${payload.notification.body}`);
      navigator.vibrate?.(200);
    });
  });
}, []);


  useEffect(() => {
    const unsub = onSnapshot(collection(db, collName), (snap) => {
      const list = snap.docs.map((d) => ({
        _id: d.id,
        id: d.id,
        ...d.data(),
      }));
      // 상차일/등록일 기준으로 최신순 정렬
      list.sort((a, b) => {
        const da = getPickupDate(a);
        const db = getPickupDate(b);
        return (db || "").localeCompare(da || "");
      });

      setOrders(list);
    });
    return () => unsub();
  }, []);
  // 🔔 상차 임박 2시간 이내 감지
  useEffect(() => {
    if (!orders.length) return;

    const now = new Date();
    const TWO_HOURS = 120; // 분

    const nearOrders = orders.filter(o => {
      if (!o.상차일 || !o.상차시간) return false;
      if (o.차량번호) return false; // 🔥 배차중(차량번호 없는) 것만 체크


      const dt = new Date(
  `${o.상차일} ${normalizeKoreanTime(o.상차시간)}`
);
      const diffMin = (dt - now) / (1000 * 60);

      return diffMin > 0 && diffMin <= TWO_HOURS;
    });

    if (nearOrders.length > 0) {
      setToast(`⚠️ 상차 임박 ${nearOrders.length}건! 확인하세요`);
      navigator.vibrate?.(200); // 진동 (모바일)
    }
  }, [orders]);


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

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "clients"), (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setClients(list);
    });
    return () => unsub();
  }, []);

  // 🔥 하차지 거래처(places)도 자동매칭
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "places"), (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        거래처명: d.data().거래처명 || d.data().상차지명 || d.data().하차지명 || "",
        주소: d.data().주소 || d.data().상차지주소 || d.data().하차지주소 || "",
      }));

      setClients((prev) => {
        const merged = [...prev];
        list.forEach((item) => {
          if (!merged.some((c) => c.거래처명 === item.거래처명)) {
            merged.push(item);
          }
        });
        return merged;
      });
    });

    return () => unsub();
  }, []);
  


  // --------------------------------------------------
  // 2. 화면 상태 / 필터
  // --------------------------------------------------
  const [page, setPage] = useState("list"); // list | form | detail | fare | status | unassigned
  const [selectedOrder, setSelectedOrder] = useState(null);
  // 🔙 상세보기 진입 출처 (list | unassigned | status)
const [detailFrom, setDetailFrom] = useState(null);
  const [statusTab, setStatusTab] = useState("전체");
  const [showMenu, setShowMenu] = useState(false);
  // 🔥 미배차 차량 분류 필터 (전체 | 냉장/냉동 | 일반)
const [unassignedTypeFilter, setUnassignedTypeFilter] = useState("전체");

  const todayStr = () => new Date().toISOString().slice(0, 10);

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

  // 🔥 앱 처음 로드 시 오늘 날짜 자동 설정 + 기본탭 배차중
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);

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
  const thisMonth = new Date().toISOString().slice(0, 7);

  const filteredOrders = useMemo(() => {
    let base = [...orders];

    // 🔹 오늘 / 날짜 선택 여부
    const today = todayStr();
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

  const t = searchText.trim().toLowerCase();

  const map = {
    거래처명: o.거래처명 || "",
    기사명: o.기사명 || "",
    차량번호: o.차량번호 || "",
    상차지명: o.상차지명 || "",
    상차지주소: o.상차지주소 || "",   // ✅ 추가
    하차지명: o.하차지명 || "",
    하차지주소: o.하차지주소 || "",   // ✅ 추가
  };

  return String(map[searchType] || "")
    .toLowerCase()
    .includes(t);
});

    // 7) 정렬
    if (statusTab === "전체") {
      // 전체 = 차량번호 없는(배차중) 위로 + 최신 날짜순
      base.sort((a, b) => {
        const aEmpty = !String(a.차량번호 || "").trim();
        const bEmpty = !String(b.차량번호 || "").trim();

        if (aEmpty && !bEmpty) return -1;
        if (!aEmpty && bEmpty) return 1;

        const da = getPickupDate(a) || "";
        const db = getPickupDate(b) || "";
        return db.localeCompare(da);
      });
    } else {
      // 배차중/배차완료 탭은 최신 날짜순
      base.sort((a, b) => {
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
  ]);


  // 배차현황용
  const filteredStatusOrders = filteredOrders;

  // 미배차(차량번호 없는 전체 오더)
  const unassignedOrders = useMemo(() => {
  return orders
    .filter((o) => {
      // 1️⃣ 미배차만
      const noVehicle =
        !o.차량번호 || String(o.차량번호).trim() === "";
      if (!noVehicle) return false;

      // 2️⃣ 차량 분류 필터
      if (unassignedTypeFilter === "전체") return true;

      const carType = String(o.차량종류 || o.차종 || "");

      const isCold =
        carType.includes("냉장") || carType.includes("냉동");

      if (unassignedTypeFilter === "냉장/냉동") return isCold;
      if (unassignedTypeFilter === "일반") return !isCold;

      return true;
    })
    .sort((a, b) => {
      const ad = String(a.상차일 || "");
      const bd = String(b.상차일 || "");
      if (ad !== bd) return ad.localeCompare(bd);

      const at = String(a.상차시간 || a.상차일시 || "");
      const bt = String(b.상차시간 || b.상차일시 || "");
      if (at !== bt) return at.localeCompare(bt);

      return String(a.거래처명 || "").localeCompare(
        String(b.거래처명 || "")
      );
    });
}, [orders, unassignedTypeFilter]);


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
      하차지명: form.하차지명,
      하차지주소: form.하차지주소 || "",
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
      await updateDoc(doc(db, collName, form._editId), {
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

    await updateDoc(doc(db, collName, selectedOrder.id), {
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
    await updateDoc(doc(db, collName, selectedOrder.id), {
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

    await deleteDoc(doc(db, collName, selectedOrder.id));
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
    page === "list"
      ? "등록내역"
      : page === "form"
        ? form._editId
          ? "수정하기"
          : "화물등록"
        : page === "fare"
          ? "표준운임표"
          : page === "status"
            ? "배차현황"
            : page === "unassigned"
              ? "미배차현황"
              : "상세보기";


  // ------------------------------------------------------------------
  // 렌더링
  // ------------------------------------------------------------------
 return (
  <div className="w-full max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col relative">
    
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
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 
                     bg-black text-white px-4 py-2 rounded-lg 
                     text-sm shadow-lg z-[9999]"
        >
          {toast}
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
            setPage(detailFrom);   // 🔥 출처로 복귀
            setDetailFrom(null);   // 🔥 초기화
          } else {
            setPage("list");
          }
        }
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
          onGoCreate={() => {
            setPage("form");
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
onSelect={(o) => {
  setSelectedOrder(o);
  setDetailFrom("list");   // 🔥 list에서 들어온 거
  setPage("detail");
  window.scrollTo(0, 0);
}}
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
            clients={clients}
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
    title={`미배차현황 (${unassignedOrders.length})`}
    orders={unassignedOrders}
    unassignedTypeFilter={unassignedTypeFilter}
    setUnassignedTypeFilter={setUnassignedTypeFilter}
    onBack={() => setPage("list")}
    setSelectedOrder={setSelectedOrder}
    setPage={setPage}
    setDetailFrom={setDetailFrom}   // 🔥🔥🔥 이 줄 추가
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
  const isListPage = !!onMenu; // 리스트 화면인지 판별
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-b sticky top-0 z-30">
      {/* 왼쪽 버튼 */}
      <div className="w-12">
        {isListPage ? (
          /* 리스트 화면 = MENU 버튼 */
          <button
            onClick={onMenu}
            className="text-sm font-semibold text-blue-600"
          >
            MENU
          </button>
        ) : (
          /* 그 외 화면 = 뒤로가기 버튼 */
          onBack && (
            <button
              onClick={onBack}
              className="text-sm font-semibold text-gray-700"
            >
              ◀
            </button>
          )
        )}
      </div>

      {/* 중앙 제목 */}
      <div className="font-semibold text-base text-gray-800">{title}</div>

      {/* 오른쪽 버튼 */}
      <div className="w-8 flex justify-end">
        {onRefresh && (
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full active:scale-95 text-gray-700"
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
  onDeleteAll,
  setUiScale,   // ⭐ 추가
  uiScale, 
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

          <MenuSection title="현황 / 운임표">
            <MenuItem label="표준운임표" onClick={onGoFare} />
            <MenuItem label="배차현황" onClick={onGoStatus} />
            <MenuItem label="미배차현황" onClick={onGoUnassigned} />
          </MenuSection>
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

function MenuItem({ label, onClick }) {
  return (
    <button
      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
      onClick={onClick}
    >
      {label}
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
  onSelect,
  vehicleFilter,
  setVehicleFilter,
  assignFilter,
  setAssignFilter,
  searchType,
  setSearchType,
  searchText,
  setSearchText,
}) {
  // 🔥 탭: 전체 / 배차중 / 배차완료 (배차전/배차취소 없음)
  const tabs = ["전체", "배차중", "배차완료"];

  const dates = Array.from(groupedByDate.keys()).sort((a, b) =>
    a.localeCompare(b)
  );

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
        <div className="text-xs font-semibold text-gray-600">
          {formatRangeShort(startDate, endDate)}
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

        {/* 빠른 범위 버튼 */}
        <div className="flex gap-2">
          {[1, 3, 7, 15].map((d) => (
            <button
              key={d}
              onClick={() => quickRange(d)}
              className="flex-1 py-1.5 rounded-full border text-xs bg-gray-100"
            >
              {d}일
            </button>
          ))}
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
                      onSelect={() => onSelect(o)}
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

  const today = new Date();
  const t0 = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  );
  const n0 = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const diff = Math.round(
    (t0.getTime() - n0.getTime()) / (1000 * 60 * 60 * 24)
  );

  // 🔵 오늘 = 당상/당착
  if (diff === 0) {
    return type === "pickup" ? "당상" : "당착";
  }

  // 🔴 내일 = 내상/내착
  if (diff === 1) {
    return type === "pickup" ? "내상" : "내착";
  }

  // 그 외 날짜는 MM/DD만 보여줌
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

function MobileOrderCard({ order, onSelect }) {
  const claim = getClaim(order);
  const fee = order.기사운임 ?? 0;
  const state = getStatus(order);

  const stateBadgeClass =
    state === "배차완료"
      ? "bg-emerald-50 text-emerald-700 border-emerald-300"
      : "bg-gray-100 text-gray-600 border-gray-300";

  const pickupName = order.상차지명 || "-";
  const dropName = order.하차지명 || "-";

  const pickupAddrShort = shortAddr(order.상차지주소 || "");
  const dropAddrShort = shortAddr(order.하차지주소 || "");

  const pickupTime =
    onlyTime(order.상차시간 || order.상차일시) || "시간 없음";
  const dropTime =
    onlyTime(order.하차시간 || order.하차일시) || "시간 없음";

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
      {/* ▶ 상태 + 냉장/냉동 */}
      <div className="flex justify-end items-center gap-1 mb-0.5">
        {isCold && (
          <span className="px-2 py-0.5 rounded-full bg-cyan-600 text-white text-[10px] font-bold">
            ❄ 냉장/냉동
          </span>
        )}
        <span
          className={
            "px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap " +
            stateBadgeClass
          }
        >
          {state}
        </span>
      </div>

      {/* ⚠ 상차 임박 */}
      {(() => {
        if (!order.상차일 || !order.상차시간) return null;
        const now = new Date();
        const dt = new Date(
   `${order.상차일} ${normalizeKoreanTime(order.상차시간)}`
 );
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
    </div>
  );
}



// ======================================================================
// 상세보기
// ======================================================================
function MobileOrderDetail({
  order,
  drivers,
  onAssignDriver,
  onCancelAssign,
  onCancelOrder,
  setPage,
  setForm,
  setSelectedOrder,
  showToast,
  upsertDriver,
}) {
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

  const handleCopyKakao = async () => {
    const text = buildKakaoMessage(order);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      alert("카카오톡 공유용 텍스트가 복사되었습니다.");
    } catch (e) {
      console.error(e);
      alert("복사 중 오류가 발생했습니다. 직접 복사해 주세요.");
    }
  };

  const claim = getClaim(order);
  const sanjae = getSanjae(order);
  const state = getStatus(order); // 🔥 상태 계산 일원화

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
    
    {/* 카톡 공유 */}
    <button
      onClick={handleCopyKakao}
      className="flex-1 py-2 rounded-lg bg-yellow-400 text-black text-sm font-semibold"
    >
      카톡공유
    </button>

    {/* 운임조회 */}
    <button
      onClick={() => {
        window.__forceFareSearch__ = true; // ★ 추가!
        window.scrollTo(0, 0);
        setPage("fare");

        setTimeout(() => {
          const normalize = (v) => String(v || "").trim().replace(/\s+/g, "");
          const pickupVal = normalize(order.상차지명);
          const dropVal = normalize(order.하차지명);
          const tonVal = normalize(order.차량톤수 || order.톤수);
          const cargoVal = normalize(order.화물내용);

          const elPickup = document.querySelector("input[placeholder='상차지']");
          const elDrop = document.querySelector("input[placeholder='하차지']");
          const elTon = document.querySelector("input[placeholder='톤수 (예: 1톤)']");
          const elCargo = document.querySelector("input[placeholder='화물내용 (예: 16파렛)']");

          if (elPickup) elPickup.value = pickupVal;
          if (elDrop) elDrop.value = dropVal;
          if (elTon) elTon.value = tonVal;
          if (elCargo) elCargo.value = cargoVal;

          
          setTimeout(() => {
            const btn = document.querySelector("#fare-search-button");
            if (btn) btn.click();
          }, 200);
        }, 400);
      }}
      className="flex-1 py-2 rounded-lg bg-indigo-500 text-white text-sm font-semibold"
    >
      운임조회
    </button>
  </div>
</div>


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
  // 🔍 거래처 자동검색 state
const [clientQuery, setClientQuery] = useState("");
const [matchedClients, setMatchedClients] = useState([]);
  // ▶ 거래처 선택 후 '상차/하차에 어디로 적용할지' 선택 팝업용
  const [showClientApplyModal, setShowClientApplyModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);

// 🔍 거래처 검색 함수
const searchClient = (q) => {
  const norm = (s = "") => String(s).trim().toLowerCase();
  const nq = norm(q);

  if (!nq) return setMatchedClients([]);

  const list = clients
    .filter(c => norm(c.거래처명).includes(nq))
    .slice(0, 10);

  setMatchedClients(list);
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
    if (!queryPickup) return [];
    return clients
      .filter((c) =>
        norm(c.거래처명 || c.상호 || "").includes(norm(queryPickup))
      )
      .slice(0, 10);
  }, [clients, queryPickup]);

  const dropOptions = useMemo(() => {
    if (!queryDrop) return [];
    return clients
      .filter((c) =>
        norm(c.거래처명 || c.상호 || "").includes(norm(queryDrop))
      )
      .slice(0, 10);
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
                {[
                  "오전 1:00", "오전 2:00", "오전 3:00", "오전 4:00", "오전 5:00",
                  "오전 6:00", "오전 7:00", "오전 8:00", "오전 9:00", "오전 10:00",
                  "오전 11:00", "오후 12:00", "오후 1:00", "오후 2:00", "오후 3:00",
                  "오후 4:00", "오후 5:00", "오후 6:00", "오후 7:00", "오후 8:00",
                  "오후 9:00", "오후 10:00", "오후 11:00"
                ].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
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
                {[
                  "오전 1:00", "오전 2:00", "오전 3:00", "오전 4:00", "오전 5:00",
                  "오전 6:00", "오전 7:00", "오전 8:00", "오전 9:00", "오전 10:00",
                  "오전 11:00", "오후 12:00", "오후 1:00", "오후 2:00", "오후 3:00",
                  "오후 4:00", "오후 5:00", "오후 6:00", "오후 7:00", "오후 8:00",
                  "오후 9:00", "오후 10:00", "오후 11:00"
                ].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
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
            // 자동완성 클릭 직후 사라짐 방지
            setTimeout(() => setMatchedClients([]), 200);

            const val = form.거래처명.trim();
            if (!val) return;

            const normalized = val.toLowerCase();
            const existing = clients.find(
              (c) =>
                String(c.거래처명 || "").trim().toLowerCase() === normalized
            );

            // 신규 거래처 등록
if (!existing && val.length >= 2) {
  if (window.confirm("📌 등록되지 않은 거래처입니다.\n신규 등록할까요?")) {
    await addDoc(collection(db, "clients"), {
      거래처명: val,
      주소: form.상차지주소 || "",
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
    setSelectedClient(c);
    setShowClientApplyModal(true);
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
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="상차지"
          input={
            <div className="space-y-1">
              <input
                className="w-full border rounded px-2 py-1 text-sm"
                value={form.상차지명}
                onChange={(e) => {
  const val = e.target.value;
  update("상차지명", val);
  setQueryPickup(val);
  setShowPickupList(true);

  // ★ 입력이 비어 있으면 자동매칭 하지 말고 주소도 지움
  if (!val.trim()) {
    update("상차지주소", "");
    return;
  }

  // 입력이 완성됐을 때만 자동매칭 (완전 동일한 경우)
  const normalized = val.trim().toLowerCase();
  const found = clients.find(
    (c) =>
      String(c.거래처명 || "")
        .trim()
        .toLowerCase() === normalized
  );

  if (found) {
    update(
      "상차지주소",
      found.주소 || found.상차지주소 || found.하차지주소 || ""
    );
  }
}}

                onFocus={() =>
                  form.상차지명 && setShowPickupList(true)
                }
              />
              <input
                className="w-full border rounded px-2 py-1 text-xs text-gray-700"
                placeholder="상차지 주소"
                value={form.상차지주소}
                onChange={(e) =>
                  update("상차지주소", e.target.value)
                }
              />
              {showPickupList && pickupOptions.length > 0 && (
                <div className="border rounded bg-white max-h-40 overflow-y-auto text-xs">
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
          }
        />
        <RowLabelInput
          label="하차지"
          input={
            <div className="space-y-1">
              <input
                className="w-full border rounded px-2 py-1 text-sm"
                value={form.하차지명}
                onChange={(e) => {
  const val = e.target.value;
  update("하차지명", val);
  setQueryDrop(val);
  setShowDropList(true);

  // ★ 입력이 비어 있으면 주소도 지움
  if (!val.trim()) {
    update("하차지주소", "");
    return;
  }

  // 정확히 일치하는 경우에만 자동매칭
  const normalized = val.trim().toLowerCase();
  const found = clients.find(
    (c) =>
      String(c.거래처명 || "")
        .trim()
        .toLowerCase() === normalized
  );

  if (found) {
    update(
      "하차지주소",
      found.주소 || found.하차지주소 || found.상차지주소 || ""
    );
  }
}}



                onFocus={() =>
                  form.하차지명 && setShowDropList(true)
                }
              />
              <input
                className="w-full border rounded px-2 py-1 text-xs text-gray-700"
                placeholder="하차지 주소"
                value={form.하차지주소}
                onChange={(e) =>
                  update("하차지주소", e.target.value)
                }
              />
              {showDropList && dropOptions.length > 0 && (
                <div className="border rounded bg-white max-h-40 overflow-y-auto text-xs">
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
                <option value="24시(외주업체)">24시(외주업체)</option>
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

// ======================================================================
// 공통 RowLabelInput
// ======================================================================
function RowLabelInput({ label, input }) {
  return (
    <div className="flex border-b last:border-b-0">
      <div className="w-24 px-3 py-2 text-xs text-gray-600 bg-gray-50 flex items-center">
        {label}
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
  const [pickupAddr, setPickupAddr] = useState(""); // ✅ 추가
  const [drop, setDrop] = useState("");
  const [dropAddr, setDropAddr] = useState("");     // ✅ 추가

  const [cargo, setCargo] = useState("");
  const [ton, setTon] = useState("");
  const [vehicle, setVehicle] = useState("전체");
  

  const [matchedRows, setMatchedRows] = useState([]);
  const [result, setResult] = useState(null);
  const [aiFare, setAiFare] = useState(null);

 const clean = (s = "") =>
  String(s || "").trim().toLowerCase().replace(/\s+/g, "");

const extractCargoNumber = (text = "") => {
  const m = String(text).match(/(\d+)/);
  return m ? Number(m[1]) : null;
};
const extractTonNum = (text = "") => {
  const cleanText = String(text).replace(/톤|t/gi, "");
  const m = cleanText.match(/(\d+(?:\.\d+)?)/);  // ← 정규식 확정본
  return m ? Number(m[1]) : null;
};

 useEffect(() => {
  (async () => {
    const snap = await getDocs(collection(db, collName));
    const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setDispatchData(arr);
  })();
}, []);


const calcFareMobile = () => {
  const isForced = window.__forceFareSearch__;
  window.__forceFareSearch__ = false;

  if (!isForced && (!pickup.trim() || !drop.trim())) {
    alert("상차지 / 하차지를 입력하세요.");
    return;
  }

const normPickup = clean(pickup + pickupAddr);
const normDrop = clean(drop + dropAddr);
  const inputTonNum = extractTonNum(ton);

  let filtered = dispatchData
    .map((r) => {
      const rp = clean(r.상차지명 || "") + clean(r.상차지주소 || "");
      const rd = clean(r.하차지명 || "") + clean(r.하차지주소 || "");

      const okPickup = rp.includes(normPickup);
      const okDrop = rd.includes(normDrop);
      if (!okPickup || !okDrop) return null;

      // 주소 정확도 점수
      r._addrScore =
        (rp.startsWith(normPickup) ? 3 : okPickup ? 1 : 0) +
        (rd.startsWith(normDrop) ? 3 : okDrop ? 1 : 0);

      // 차량종류 필터
      if (vehicle !== "전체") {
        const rv = clean(r.차량종류 || "");
        const vv = clean(vehicle);
        if (!rv.includes(vv)) return null;
      }

      // 화물(파렛) 숫자 필터
      if (cargo.trim()) {
        const cargoNum = extractCargoNumber(cargo);
        const rowNum = extractCargoNumber(r.화물내용);
        if (cargoNum != null && rowNum != cargoNum) return null;
      }

      // 톤수 근사치 필터
      if (inputTonNum != null) {
        const rTon = extractTonNum(r.차량톤수 || "");
        if (rTon != null && Math.abs(rTon - inputTonNum) > 0.5) return null;
      }

      return r;
    })
    .filter(Boolean);

  if (!filtered.length) {
    alert("검색된 데이터가 없습니다.");
    setMatchedRows([]);
    setResult(null);
    setAiFare(null);
    return;
  }

  // 정렬
  filtered.sort((a, b) => {
    const da = new Date(a.상차일 || 0);
    const db = new Date(b.상차일 || 0);

    return (
      (b._addrScore || 0) - (a._addrScore || 0) ||
      db - da
    );
  });

  setMatchedRows(filtered);

  const fares = filtered.map((r) =>
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

      {/* 입력 */}
      <div className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
        <input
  className="w-full border rounded px-3 py-2 text-sm"
  placeholder="상차지"
  value={pickup}
  onChange={(e) => setPickup(e.target.value)}
/>

<input
  className="w-full border rounded px-3 py-2 text-sm"
  placeholder="상차지 주소"
  value={pickupAddr}
  onChange={(e) => setPickupAddr(e.target.value)}
/>

<input
  className="w-full border rounded px-3 py-2 text-sm"
  placeholder="하차지"
  value={drop}
  onChange={(e) => setDrop(e.target.value)}
/>

<input
  className="w-full border rounded px-3 py-2 text-sm"
  placeholder="하차지 주소"
  value={dropAddr}
  onChange={(e) => setDropAddr(e.target.value)}
/>

        <input
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="톤수 (예: 1톤)"
          value={ton}
          onChange={(e) => setTon(e.target.value)}
        />
        <select
          className="w-full border rounded px-3 py-2 text-sm"
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
        >
          <option value="전체">전체</option>
          <option value="라보">라보</option>
          <option value="다마스">다마스</option>
          <option value="카고">카고</option>
          <option value="윙바디">윙바디</option>
        </select>

        <button
          id="fare-search-button"
          onClick={calcFareMobile}
          className="w-full bg-blue-500 text-white py-2 rounded-lg text-sm font-semibold"
        >
          🔍 운임조회
        </button>
      </div>

      {/* 결과 */}
      {result && (
        <div className="bg-white border p-4 rounded-xl shadow-sm space-y-3">
          <div className="font-semibold">
            건수: {matchedRows.length}건
          </div>
          <div>평균운임: {result.avg.toLocaleString()}원</div>
          <div>
            최근운임: {result.latestFare.toLocaleString()}원 (
            {result.latest?.상차일?.slice(0, 10) || "-"})
          </div>

          {aiFare && (
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

          {/* 과거 금액 리스트 */}
          <div className="text-xs text-gray-600">
            과거 운임 기록:
          </div>
          {/* 📌 과거 운임 카드형 UI */}
          <div className="mt-4 space-y-3">
            {matchedRows.map((r) => {
              const fare = Number(r.청구운임 || 0).toLocaleString();
              const driver = Number(r.기사운임 || 0).toLocaleString();
              const profit = Number(r.청구운임 || 0) - Number(r.기사운임 || 0);

              return (
                <div
                  key={r.id}
                  className="bg-white shadow-sm rounded-xl p-3 border"
                >
                  {/* 날짜 + 금액 */}
                  <div className="flex justify-between text-sm font-semibold">
                    <span>{r.상차일?.slice(5) || "-"}</span>
                    <span className="text-blue-600">{fare}원</span>
                  </div>

                  {/* 경로 */}
                  <div className="text-xs text-gray-600 mt-1">
                    {r.상차지명} → {r.하차지명}
                  </div>

                  {/* 사양 */}
                  <div className="text-[11px] text-gray-500 mt-1 leading-tight">
                    {[r.화물내용, r.차량종류, r.차량톤수]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>

                  {/* 수수료 */}
                  <div className="text-[11px] text-gray-500 mt-1">
                    기사 {driver}원 · 수수료 {profit.toLocaleString()}원
                  </div>
                </div>
              );
            })}
          </div>



        </div>
      )}
    </div>
  );
}

// ======================================================================
// 모바일 배차현황 / 미배차현황 테이블 (날짜별 그룹형 UI)
// ======================================================================
function MobileStatusTable({ title, orders, onBack, onQuickAssign }) {

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
  orders,
  unassignedTypeFilter,
  setUnassignedTypeFilter,
  onBack,
  setSelectedOrder,
  setPage,
  setDetailFrom,
}) {
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
      {/* 🔥 냉장/냉동 / 일반 필터 버튼 */}
<div className="flex gap-2 mb-3">
  {["전체", "냉장/냉동", "일반"].map((t) => (
    <button
      key={t}
      onClick={() => setUnassignedTypeFilter(t)}
      className={`flex-1 py-1.5 rounded-full text-xs font-semibold border
        ${
          unassignedTypeFilter === t
            ? "bg-blue-500 text-white border-blue-500"
            : "bg-white text-gray-600 border-gray-300"
        }`}
    >
      {t}
    </button>
  ))}
</div>

      <div className="mb-2 text-xs text-gray-500">
        {title}
      </div>

      {sortedDates.map((dateStr) => {
        const list = dateMap.get(dateStr);

        return (
          <div key={dateStr} className="mb-6">
            <div className="text-sm font-bold text-gray-700 mb-2 px-1">
              {formatDateHeader(dateStr)}
            </div>

            <div className="space-y-3">
              {list.map((o) => (
                <div key={o.id} className="space-y-1">
                  {/* 카드 UI */}
                  <MobileOrderCard
  order={o}
  onSelect={() => {
    setSelectedOrder(o);
    setDetailFrom("unassigned"); // ⭐⭐⭐ 이 줄이 핵심
    setPage("detail");
    window.scrollTo(0, 0);
  }}
/>


                </div>
              ))}

            </div>
          </div>
        );
      })}
    </div>
  );

}