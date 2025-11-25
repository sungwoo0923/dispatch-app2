// ======================= src/mobile/MobileApp.jsx (PART 1/4) =======================
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
import { db } from "../firebase";

// ------------------------------------------------------------------
// 공통 유틸
// ------------------------------------------------------------------
const toNumber = (v) =>
  Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;

const fmtMoney = (v) =>
  `${Number(v || 0).toLocaleString("ko-KR")}원`;

// 상차일 기준 날짜 뽑기(PC/모바일 공통 대응)
const getPickupDate = (o = {}) => {
  if (o.상차일) return String(o.상차일).slice(0, 10);
  if (o.상차일시) return String(o.상차일시).slice(0, 10);
  if (o.등록일) return String(o.등록일).slice(0, 10);
  return "";
};

// 청구운임 / 인수증
const getClaim = (o = {}) =>
  o.청구운임 ?? o.인수증 ?? 0;

// 산재보험료
const getSanjae = (o = {}) => o.산재보험료 ?? 0;

// 짧은 주소 (시/구까지만)
const shortAddr = (addr = "") => {
  const parts = String(addr).split(/\s+/);
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
  if (parts.length === 1) return parts[0];
  return "";
};

// 날짜 헤더: 2025-11-24 → 11.24
const weekday = ["일", "월", "화", "수", "목", "금", "토"];
const formatDateHeader = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}.${day}`;
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
  // 그 외에는 MM/DD
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
    `차량: ${order.차량톤수 || order.톤수 || ""} ${
      order.차량종류 || order.차종 || ""
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

// 상태 문자열(배차중 -> 배차전으로 보이게)
function normalizeState(raw) {
  if (!raw) return "배차전";
  if (raw === "배차중") return "배차전";
  return raw;
}

// ======================================================================
//  메인 컴포넌트
// ======================================================================
export default function MobileApp() {
    const [toast, setToast] = useState("");
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

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "dispatch"), (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      // 상차일/등록일 기준으로 최신순 정렬
      list.sort((a, b) => {
        const da = getPickupDate(a);
        const db_ = getPickupDate(b);
        return (db_ || "").localeCompare(da || "");
      });
      setOrders(list);
    });
    return () => unsub();
  }, []);

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

  // --------------------------------------------------
  // 2. 화면 상태 / 필터
  // --------------------------------------------------
  const [page, setPage] = useState("list"); // list | form | detail | fare | status | unassigned
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusTab, setStatusTab] = useState("전체");
  const [showMenu, setShowMenu] = useState(false);

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());

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

  // 🔥 반드시 추가!
  _editId: null,
  _returnToDetail: false,
});


  // --------------------------------------------------
  // 4. 필터링
  // --------------------------------------------------
  const quickRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const rawState = o.배차상태 || o.상태 || "배차전";
      const state = normalizeState(rawState);

      // 상단 상태 탭 (전체/배차전/배차완료/배차취소)
      if (statusTab !== "전체" && state !== statusTab) return false;

      // 드롭다운 배차상태 필터
      if (assignFilter) {
        const aState = normalizeState(rawState);
        if (aState !== assignFilter) return false;
      }

      // 차량종류 필터
      if (vehicleFilter) {
        const carType = String(o.차량종류 || o.차종 || "").toLowerCase();
        if (!carType.includes(vehicleFilter.toLowerCase())) return false;
      }

      // 날짜 필터
      const d = getPickupDate(o);
      if (startDate && d && d < startDate) return false;
      if (endDate && d && d > endDate) return false;
          // 🔍 검색 필터
    if (searchText.trim()) {
      const t = searchText.trim().toLowerCase();

      const map = {
        거래처명: o.거래처명 || "",
        기사명: o.기사명 || "",
        차량번호: o.차량번호 || "",
        상차지명: o.상차지명 || "",
        하차지명: o.하차지명 || "",
      };

      const v = String(map[searchType] || "").toLowerCase();
      if (!v.includes(t)) return false;
    }

      return true;
    });
  }, [
  orders,
  statusTab,
  startDate,
  endDate,
  vehicleFilter,
  assignFilter,
  searchType,   // 🔍 추가
  searchText,   // 🔍 추가
]);


  // 배차현황용
  const filteredStatusOrders = filteredOrders;
  const unassignedOrders = useMemo(
    () =>
      filteredOrders.filter((o) => {
        const state = normalizeState(o.배차상태 || o.상태 || "배차전");
        return state === "배차전";
      }),
    [filteredOrders]
  );

  // 날짜별 그룹핑
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
  // 5. 신규 저장 (PC 컬럼과 동일 구조로 저장)
  // --------------------------------------------------
  const handleSave = async () => {
  const isEdit = !!form._editId;   // 🔥 수정모드 여부

  if (!form.상차지명 || !form.하차지명) {
    alert("상차지 / 하차지는 필수입니다.");
    return;
  }

  const 청구운임 = toNumber(form.청구운임);
  const 기사운임 = toNumber(form.기사운임);
  const 수수료 = 청구운임 - 기사운임;

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
    메모: form.적요 || "",
    혼적여부: form.혼적여부 || "독차",
    차량번호: form.차량번호 || "",
    기사명: form.기사명 || "",
    전화번호: form.전화번호 || "",
    청구운임,
    기사운임,
    수수료,
  };

  // --------------------------------------------------
  // 🔵 수정모드 처리
  // --------------------------------------------------
  if (isEdit) {
  await updateDoc(doc(db, "dispatch", form._editId), docData);

  // 🔥 토스트 알림 (아래에서 정의)
  showToast("수정이 완료되었습니다.");

  if (form._returnToDetail) {
    setSelectedOrder({ id: form._editId, ...docData });
    setPage("detail");
    return;
  }

  setPage("list");

  // 🔥 목록 맨 위로 자동 스크롤
  setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);

  return;
}


  // --------------------------------------------------
  // 🔵 신규등록 처리 (기존 코드)
  // --------------------------------------------------
  await addDoc(collection(db, "dispatch"), {
    ...docData,
    배차상태: "배차전",
    등록일: new Date().toISOString().slice(0, 10),
    createdAt: serverTimestamp(),
  });

  alert("등록되었습니다.");
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

};
// --------------------------------------------------
// 🔵 (추가) 모바일 전용 upsertDriver — ★★★ 바로 여기 넣기 ★★★
// --------------------------------------------------
const upsertDriver = async ({ 차량번호, 이름, 전화번호 }) => {
  if (!차량번호) return;

  const norm = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();

  // 기존 기사 검색
  const existing = drivers.find(
    (d) => norm(d.차량번호) === norm(차량번호)
  );

  // 기존 문서 업데이트
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

  // 신규 문서 생성
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
  // 6. 기사 배차 / 배차취소 / 오더취소(=삭제)
  // --------------------------------------------------
  const assignDriver = async ({ 차량번호, 이름, 전화번호 }) => {
    if (!selectedOrder) return;
    const norm = (s = "") =>
      String(s).replace(/\s+/g, "").toLowerCase();

    let driver = drivers.find(
      (d) => norm(d.차량번호) === norm(차량번호)
    );

    // 없는 차량번호면 기사 DB에 신규 등록
    if (!driver) {
      if (!driver) {
  const newId = await upsertDriver({
    차량번호,
    이름: 이름 || "",
    전화번호: 전화번호 || "",
  });

  driver = { id: newId, 차량번호, 이름: 이름 || "", 전화번호: 전화번호 || "" };
}

    }

    await updateDoc(doc(db, "dispatch", selectedOrder.id), {
      배차상태: "배차완료",
      상태: "배차완료",
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

    await updateDoc(doc(db, "dispatch", selectedOrder.id), {
      배차상태: "배차전",
      상태: "배차전",
      기사명: "",
      차량번호: "",
      전화번호: "",
    });

    setSelectedOrder((prev) =>
      prev
        ? {
            ...prev,
            배차상태: "배차전",
            상태: "배차전",
            기사명: "",
            차량번호: "",
            전화번호: "",
          }
        : prev
    );

    alert("배차가 취소되었습니다.");
  };

  // 🔴 오더 취소 = 실제 삭제 (PC와 동일)
  const cancelOrder = async () => {
    if (!selectedOrder) return;
    if (
      !window.confirm(
        "해당 오더를 삭제(배차취소) 하시겠습니까?\n삭제 후에는 복구할 수 없습니다."
      )
    )
      return;

    await deleteDoc(doc(db, "dispatch", selectedOrder.id));
    setSelectedOrder(null);
    setPage("list");
    alert("오더가 삭제되었습니다.");
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const title =
  page === "list"
    ? "등록내역"
    : page === "form"
    ? (form._editId ? "수정하기" : "화물등록")   // ← 수정 포인트!!!
    : page === "fare"
    ? "표준운임표"
    : page === "status"
    ? "배차현황"
    : page === "unassigned"
    ? "미배차현황"
    : "상세보기";

  // --------------------------------------------------
  // 7. 렌더링
  // --------------------------------------------------
  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col relative">
         {/* 🔔 토스트 알림 */}
    {toast && (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 
                      bg-black text-white px-4 py-2 rounded-lg 
                      text-sm shadow-lg z-[9999]">
        {toast}
      </div>
    )}
      <MobileHeader
        title={title}
        onBack={
  page === "form"
    ? () => {
        // 폼에서 뒤로가기 → 상세보기로 복귀
        if (form._editId && form._returnToDetail) {
          setPage("detail");
          return;
        }

        // 신규등록 폼이면 목록으로
        setPage("list");
      }
    : page === "detail"
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

  setPage("form");        // ← 🔥 반드시 있어야 함
  setShowMenu(false);     // ← 🔥 이것도 반드시 있어야 함
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
            setPage("unassigned");
            setShowMenu(false);
          }}
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
              setPage("detail");
            }}
            vehicleFilter={vehicleFilter}
            setVehicleFilter={setVehicleFilter}
            assignFilter={assignFilter}
            setAssignFilter={setAssignFilter}
            // 🔍 검색 추가
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
  upsertDriver={upsertDriver}   // 🔥🔥 이거 추가해야 신규등록 됨!!
/>


)}


       {page === "fare" && (
  <MobileStandardFare
    onBack={() => setPage("list")}   // ← 뒤로가기 추가
  />
)}

{page === "status" && (
  <MobileStatusTable
    title="배차현황"
    orders={filteredStatusOrders}
    onBack={() => setPage("list")}   // ← 뒤로가기 추가
  />
)}

{page === "unassigned" && (
  <MobileStatusTable
    title="미배차현황"
    orders={unassignedOrders}
    onBack={() => setPage("list")}   // ← 뒤로가기 추가
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
    </div>
  );
}
// ======================= src/mobile/MobileApp.jsx (PART 2/4) =======================

// ----------------------------------------------------------------------
// 공통 헤더 / 사이드 메뉴
// ----------------------------------------------------------------------
function MobileHeader({ title, onBack, onRefresh, onMenu }) {
  const hasLeft = !!onBack || !!onMenu;
  const leftFn = onBack || onMenu;
  const leftLabel = onBack ? "◀" : "≡";

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-b sticky top-0 z-30">
      <button
        className="w-8 h-8 text-xl flex items-center justify-center text-gray-700"
        onClick={hasLeft ? leftFn : undefined}
        disabled={!hasLeft}
      >
        {hasLeft ? leftLabel : ""}
      </button>

      <div className="font-semibold text-base">{title}</div>

      <button
        className="w-8 h-8 text-lg flex items-center justify-center text-gray-700"
        onClick={onRefresh}
        disabled={!onRefresh}
      >
        {onRefresh ? "⟳" : ""}
      </button>
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
}) {
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

        <div className="px-4 py-3 border-t text-xs text-gray-400">
          모바일 화면은 조회·등록용 간단 버전입니다.
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
  // 탭 라벨은 '배차전'이지만, 실제 데이터의 '배차중'은 normalizeState 에서 '배차전'으로 변환
  const tabs = ["전체", "배차전", "배차완료", "배차취소"];

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
            className={`flex-1 py-2 text-sm font-medium border-b-2 ${
              statusTab === t
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
            <option value="배차전">배차전</option>
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
    <option value="하차지명">하차지명</option>
  </select>

  <input
    className="flex-1 border rounded-full px-3 py-1.5 bg-gray-50"
    placeholder="검색어 입력"
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
                  <div key={o.id} onClick={() => onSelect(o)}>
                    <MobileOrderCard order={o} />
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
// ======================= src/mobile/MobileApp.jsx (PART 3/4) =======================

// 카드에서 쓰는 날짜 상태: 당상/당착/낼상/낼착/그 외 MM/DD
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

  // 오늘
  if (diff === 0) {
    return type === "pickup" ? "당상" : "당착";
  }
  // 내일
  if (diff === 1) {
    return type === "pickup" ? "낼상" : "낼착";
  }

  // 그 외(어제 포함)는 MM/DD 로만 표시
  const m = String(target.getMonth() + 1).padStart(2, "0");
  const d = String(target.getDate()).padStart(2, "0");
  return `${m}/${d}`;
}

function MobileOrderCard({ order }) {
  const claim = getClaim(order);
  const fee = order.기사운임 ?? 0;

  // 상태 (배차중 -> 배차전으로 표시)
  const stateRaw = order.배차상태 || order.상태 || "배차전";
  const state = normalizeState(stateRaw);

  const stateBadgeClass =
    state === "배차완료"
      ? "border-green-400 text-green-600"
      : state === "배차취소"
      ? "border-red-400 text-red-600"
      : "border-gray-400 text-gray-600";

  // 날짜 상태(당상/당착/낼상/낼착/MM/DD)
  const pickupStatus = getDayStatusForCard(order.상차일, "pickup");
  const dropStatus = getDayStatusForCard(order.하차일, "drop");

  // 작업코드(지/수/직수/수도)
  const pickupMethodCode = methodCode(order.상차방법);
  const dropMethodCode = methodCode(order.하차방법);

  // 짧은 주소(시/구)
  const pickupShort = shortAddr(order.상차지주소 || "");
  const dropShort = shortAddr(order.하차지주소 || "");

  // 톤수 / 차종 / 화물내용 chips
  const ton = order.톤수 || order.차량톤수 || "";
  const carType = order.차량종류 || order.차종 || "";
  const cargo = order.화물내용 || "";

  const chips = [ton && String(ton), carType && String(carType), cargo && String(cargo)].filter(
    Boolean
  );

  return (
    <div className="bg-white rounded-2xl shadow px-4 py-3 border">
      {/* 거래처명 (위 회색 작은 글씨) */}
      <div className="text-[13px] text-gray-400 mb-1">
        {order.거래처명 || "-"}
      </div>

      {/* 상단: 상하차 + 상태 배지 */}
      <div className="flex justify-between items-start">
        <div>
          {/* 상차지명 (파란색) */}
          <div className="text-[17px] font-bold text-blue-600">
            {order.상차지명}
            {pickupShort && (
              <span className="text-[12px] text-gray-500 ml-1">
                ({pickupShort})
              </span>
            )}
          </div>

          {/* 하차지명 (검정) */}
          <div className="mt-1 text-[15px] text-gray-900 font-semibold">
            {order.하차지명}
            {dropShort && (
              <span className="text-[12px] text-gray-500 ml-1">
                ({dropShort})
              </span>
            )}
          </div>
        </div>

        {/* 상태 배지 */}
        <span
          className={`px-3 py-1 rounded-full border text-[12px] font-medium ${stateBadgeClass}`}
        >
          {state}
        </span>
      </div>

      {/* 당상/당착 + 작업코드 줄 */}
      <div className="flex items-center gap-4 text-[12px] font-semibold mt-3">
        {/* 상차 쪽 */}
        {(pickupStatus || pickupMethodCode) && (
          <div className="flex items-center gap-1">
            {pickupStatus && (
              <span className="text-blue-500">{pickupStatus}</span>
            )}
            {pickupMethodCode && (
              <span className="text-orange-500">{pickupMethodCode}</span>
            )}
          </div>
        )}

        {/* 하차 쪽 */}
        {(dropStatus || dropMethodCode) && (
          <div className="flex items-center gap-1">
            {dropStatus && (
              <span className="text-blue-500">{dropStatus}</span>
            )}
            {dropMethodCode && (
              <span className="text-orange-500">{dropMethodCode}</span>
            )}
          </div>
        )}
      </div>

      {/* 톤수 / 차종 / 화물내용 chips */}
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((label, idx) => (
            <span
              key={idx}
              className="px-3 py-1 rounded-full border text-[11px] text-gray-700 bg-gray-50"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* 금액 라인 */}
      <div className="flex justify-between items-center mt-4">
        <div className="text-[14px] font-bold text-gray-900">
          청구 {fmtMoney(claim)}
        </div>
        <div className="text-[14px] font-bold text-blue-600">
          기사 {fmtMoney(fee)}
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
  upsertDriver,   // 🔥 이거 추가!!
}) {



  const [carNo, setCarNo] = useState(order.차량번호 || "");
  const [name, setName] = useState(order.기사명 || "");
  const [phone, setPhone] = useState(order.전화번호 || "");

  // 차량번호 입력 시 기사 자동매칭 (PC와 동일 로직 느낌)
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
  }, [carNo, drivers]);
// 🔥 차량번호 지우면 이름/전화번호 자동 초기화
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
  const state = order.배차상태 || order.상태 || "배차전";

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

      {/* 카톡 공유 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
        <div className="text-sm font-semibold mb-2">카톡 공유</div>
        <button
          onClick={handleCopyKakao}
          className="w-full py-2 rounded-lg bg-yellow-400 text-black text-sm font-semibold"
        >
          카카오톡 공유용 텍스트 복사
        </button>
        <div className="mt-1 text-[11px] text-gray-500">
          버튼을 누른 후 카카오톡 대화방에 들어가서 붙여넣기 하시면 됩니다.
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
                : state === "배차취소"
                ? "text-red-600 font-semibold"
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


{/* 🔵 신규 기사 등록 버튼 — 정확히 여기!! */}
{carNo && !drivers.some(d => d.차량번호 === carNo) && (
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
      {/* 🔵 수정하기 / 배차정보 유지 옵션 */}
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

  {/* 🔵 상세보기에서 수정 버튼 1개만 */}
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
// ======================= src/mobile/MobileApp.jsx (PART 4/4) =======================

// ======================================================================
// 등록 폼
// ======================================================================
function MobileOrderForm({ form, setForm, clients, onSave, setPage, showToast, drivers, upsertDriver }) {
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
    update("하차지명", c.거래처명 || "");
    update("하차지주소", c.주소 || "");
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
              <input
                className="flex-1 border rounded px-2 py-1 text-sm"
                placeholder="예: 08:00"
                value={form.상차시간}
                onChange={(e) => update("상차시간", e.target.value)}
              />
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
              <input
                className="flex-1 border rounded px-2 py-1 text-sm"
                placeholder="예: 14:00"
                value={form.하차시간}
                onChange={(e) => update("하차시간", e.target.value)}
              />
            </div>
          }
        />
      </div>

      {/* 거래처명 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="거래처명"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.거래처명}
              onChange={(e) => update("거래처명", e.target.value)}
            />
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
                  update("상차지명", e.target.value);
                  setQueryPickup(e.target.value);
                  setShowPickupList(true);
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
                  update("하차지명", e.target.value);
                  setQueryDrop(e.target.value);
                  setShowDropList(true);
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
                <option value="24">24</option>
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

      {/* 차량번호 */}
{/* 차량번호 */}
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

          // 🔥 입력 중에는 신규등록 버튼 숨기기
          setShowNewDriver(false);

          const norm = (s = "") =>
            String(s).replace(/\s+/g, "").toLowerCase();

          // 🔥 기존 기사 자동 매칭
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
          // 🔥 다른 칸 클릭했을 때만 신규등록 가능하도록
          if (
            form.차량번호 &&
            form.차량번호.length >= 2 && // ← 최소 2글자
            !drivers.some((d) => d.차량번호 === form.차량번호)
          ) {
            setShowNewDriver(true);
          }
        }}
      />
    }
  />
</div>


{/* 기사 이름 */}
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

{/* 기사 전화번호 */}
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

{/* 신규 기사 등록 버튼 — blur 후에만 뜸 */}
{showNewDriver && (
  <button
    onClick={() => {
      upsertDriver({
        차량번호: form.차량번호,
        이름: form.기사명 || "",
        전화번호: form.전화번호 || "",
      });
      showToast("신규 기사 등록 완료");
      setShowNewDriver(false); // 등록 후 숨기기
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

      <div className="mt-4 mb-8">
  <div className="mt-4 mb-8 space-y-2">

  {/* 수정하기 / 등록하기 */}
  <button
    onClick={onSave}
    className="w-full py-3 rounded-lg bg-blue-500 text-white text-base font-semibold shadow"
  >
    {form._editId ? "수정하기" : "등록하기"}
  </button>

  {/* 🔥 수정취소 버튼 추가 */}
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

</div>
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
// 모바일 표준운임표 (간단 테이블)
// ======================================================================
function MobileStandardFare({ onBack }) {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "standardFare"), (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setRows(list);
    });
    return () => unsub();
  }, []);

  const norm = (s = "") => String(s).toLowerCase().replace(/\s+/g, "");

  const filtered = rows.filter((r) => {
    if (!query.trim()) return true;
    const q = norm(query);

    return (
      norm(r.출발지 || r.from || "").includes(q) ||
      norm(r.도착지 || r.to || "").includes(q) ||
      norm(r.톤수 || r.ton || "").includes(q)
    );
  });

  return (
    <div className="px-3 py-3">
      {/* 🔙 뒤로가기 버튼 */}
      <div className="mb-3">
        <button
          onClick={onBack}
          className="px-3 py-1 rounded bg-gray-200 text-gray-700 text-sm"
        >
          ◀ 뒤로가기
        </button>
      </div>

      {/* 검색창 */}
      <input
        className="w-full border rounded px-3 py-2 mb-3 text-sm"
        placeholder="출발지 / 도착지 / 톤수 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {/* 표준운임표 테이블 */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden max-h-[70vh]">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b sticky top-0">
            <tr>
              <th className="px-2 py-1 border-r">출발지</th>
              <th className="px-2 py-1 border-r">도착지</th>
              <th className="px-2 py-1 border-r">톤수</th>
              <th className="px-2 py-1">기준운임</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-1 border-r">{r.출발지 || r.from}</td>
                <td className="px-2 py-1 border-r">{r.도착지 || r.to}</td>
                <td className="px-2 py-1 border-r text-center">
                  {r.톤수 || r.ton}
                </td>
                <td className="px-2 py-1 text-right">
                  {fmtMoney(r.운임 || r.fare)}
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-gray-400">
                  검색된 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ======================================================================
// 모바일 배차현황 / 미배차현황 테이블 (컬럼형)
// ======================================================================
function MobileStatusTable({ title, orders, onBack }) {

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
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="px-2 py-1 border-r">상차일</th>
                <th className="px-2 py-1 border-r">거래처</th>
                <th className="px-2 py-1 border-r">상차지</th>
                <th className="px-2 py-1 border-r">하차지</th>
                <th className="px-2 py-1 border-r">차량/기사</th>
                <th className="px-2 py-1">청구/기사</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
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

              {orders.length === 0 && (
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
}
