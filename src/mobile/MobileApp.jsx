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

// ----------------------------------------------------------------------
// 공통 유틸
// ----------------------------------------------------------------------
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

// 짧은 주소
const shortAddr = (addr = "") => {
  const parts = String(addr).split(/\s+/);
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
  if (parts.length === 1) return parts[0];
  return "";
};

// 날짜 헤더: 2025-11-24 → 11.24
const formatDateHeader = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}.${day}`;
};

// 상단 범위 표시
const formatRangeShort = (s, e) => {
  if (!s && !e) return "";
  const ss = s ? s.slice(5).replace("-", ".") : "";
  const ee = e ? e.slice(5).replace("-", ".") : "";
  return `${ss} ~ ${ee || ss}`;
};

// 시간 부분 추출
const onlyTime = (dt = "") => {
  const s = String(dt).trim();
  const parts = s.split(" ");
  return parts[1] || "";
};

// 상/하차방법 코드
const methodCode = (m = "") => {
  if (!m) return "";
  if (m.includes("직접")) return "직수";
  if (m.includes("수도움")) return "수도";
  if (m.includes("지게차")) return "지";
  if (m.includes("수작업")) return "수";
  return "";
};

// 작업코드 컬러
const methodColor = (code) => {
  if (code === "수") return "bg-yellow-200 text-yellow-800";
  if (code === "지") return "bg-orange-200 text-orange-800";
  if (code === "수도") return "bg-black text-white";
  if (code === "직수") return "bg-blue-200 text-blue-800";
  return "bg-gray-100 text-gray-700";
};

// 카톡 공유 문자열
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

// 상태 문자열 (배차중 → 배차전)
function normalizeState(raw) {
  if (!raw) return "배차전";
  if (raw === "배차중") return "배차전";
  return raw;
}

// ======================================================================
//                         🔥 메인 컴포넌트
// ======================================================================
export default function MobileApp() {
  // --------------------------------------------------
  // Firestore 실시간 연동
  // --------------------------------------------------
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [clients, setClients] = useState([]);

  // 전체 오더
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "dispatch"), (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      // 날짜 최신순
      list.sort((a, b) => {
        const da = getPickupDate(a);
        const db_ = getPickupDate(b);
        return (db_ || "").localeCompare(da || "");
      });

      setOrders(list);
    });
    return () => unsub();
  }, []);

  // 기사
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

  // 거래처
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
  // 화면 상태
  // --------------------------------------------------
  const [page, setPage] = useState("list"); // list | form | detail | fare | status | unassigned
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showMenu, setShowMenu] = useState(false);

  const [statusTab, setStatusTab] = useState("전체");

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());

  // 🔵 추가 필터 : 차량종류 / 배차상태 / 검색필터
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [assignFilter, setAssignFilter] = useState("");

  // 🔵 검색 필터 추가 (거래처명 / 기사명 / 차량번호 / 상차지명 / 하차지명)
  const [searchType, setSearchType] = useState("거래처명");
  const [searchText, setSearchText] = useState("");

  // --------------------------------------------------
  // 신규등록 폼
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
    혼적여부: "독차",
    적요: "",
  });

  // --------------------------------------------------
  // 날짜 빠른 범위
  // --------------------------------------------------
  const quickRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };

// ======================= PART 1 끝 =======================
// ======================= src/mobile/MobileApp.jsx (PART 2/4) =======================

// --------------------------------------------------
//  필터링 (상태탭 + 날짜 + 차량종류 + 배차상태 + 검색필터)
// --------------------------------------------------
const filteredOrders = useMemo(() => {
  return orders.filter((o) => {
    const rawState = o.배차상태 || o.상태 || "배차전";
    const state = normalizeState(rawState);

    // 🔵 상단 탭 (전체 / 배차전 / 배차완료 / 배차취소)
    if (statusTab !== "전체" && state !== statusTab) return false;

    // 🔵 드롭다운 배차상태 필터
    if (assignFilter) {
      if (state !== assignFilter) return false;
    }

    // 🔵 차량종류 필터
    if (vehicleFilter) {
      const carType = String(o.차량종류 || o.차종 || "").toLowerCase();
      if (!carType.includes(vehicleFilter.toLowerCase())) return false;
    }

    // 🔵 날짜 필터
    const d = getPickupDate(o);
    if (startDate && d && d < startDate) return false;
    if (endDate && d && d > endDate) return false;

    // 🔵 검색 필터
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
  searchType,
  searchText,
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

// 날짜별 그룹
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
//  신규 저장
// --------------------------------------------------
const handleSave = async () => {
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
    기사명: "",
    전화번호: "",
    청구운임,
    기사운임,
    수수료,
    배차상태: "배차전",
    등록일: new Date().toISOString().slice(0, 10),
    createdAt: serverTimestamp(),
  };

  await addDoc(collection(db, "dispatch"), docData);
  alert("등록되었습니다.");

  // 초기화
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
    혼적여부: "독차",
    적요: "",
  });

  setPage("list");
};

// --------------------------------------------------
// 기사 배차 + 신규 기사등록 팝업
// --------------------------------------------------
const assignDriver = async ({ 차량번호, 이름, 전화번호 }) => {
  if (!selectedOrder) return;

  const norm = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();

  let driver = drivers.find(
    (d) => norm(d.차량번호) === norm(차량번호)
  );

  // 🔴 신규 기사 팝업 필요
  if (!driver) {
    const newDriver = {
      차량번호,
      이름,
      전화번호,
      메모: "",
      createdAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, "drivers"), newDriver);
    driver = { id: ref.id, ...newDriver };
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

  alert(`배차 완료: ${driver.이름} (${driver.차량번호})`);
};

// 배차취소
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

  alert("배차 취소되었습니다.");
};

// 🔴 오더 삭제
const cancelOrder = async () => {
  if (!selectedOrder) return;
  if (!window.confirm("정말 삭제하시겠습니까? 복구할 수 없습니다.")) return;

  await deleteDoc(doc(db, "dispatch", selectedOrder.id));
  setSelectedOrder(null);
  setPage("list");
  alert("삭제되었습니다.");
};

const handleRefresh = () => {
  window.location.reload();
};

// 제목
const title =
  page === "list"
    ? "등록내역"
    : page === "form"
    ? "화물등록"
    : page === "fare"
    ? "표준운임표"
    : page === "status"
    ? "배차현황"
    : page === "unassigned"
    ? "미배차현황"
    : "상세보기";

// ======================= PART 2 끝 =======================
// ======================= src/mobile/MobileApp.jsx (PART 3/4) =======================

return (
  <div className="w-full max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col relative">
    <MobileHeader
      title={title}
      onBack={
        page !== "list"
          ? () => {
              setPage("list");
              setSelectedOrder(null);
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
        />
      )}

      {page === "detail" && selectedOrder && (
        <MobileOrderDetail
          order={selectedOrder}
          drivers={drivers}
          onAssignDriver={assignDriver}
          onCancelAssign={cancelAssign}
          onCancelOrder={cancelOrder}
          setSelectedOrder={setSelectedOrder}
        />
      )}

      {page === "fare" && <MobileStandardFare />}

      {page === "status" && (
        <MobileStatusTable title="배차현황" orders={filteredStatusOrders} />
      )}

      {page === "unassigned" && (
        <MobileStatusTable title="미배차현황" orders={unassignedOrders} />
      )}
    </div>

    {page === "list" && !showMenu && (
      <button
        onClick={() => setPage("form")}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-blue-500 text-white text-3xl flex items-center justify-center shadow-lg active:scale-95"
      >
        +
      </button>
    )}
  </div>
);
}

// ======================================================================
// 공통 Header / SideMenu
// ======================================================================
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

// ======================= PART 3 끝 =======================
// ======================= src/mobile/MobileApp.jsx (PART 4/4) =======================

// ======================================================================
// 등록내역 리스트 + 검색필터 포함
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

      {/* 날짜/퀵범위/필터/검색 */}
      <div className="bg-white border-b px-4 py-3 space-y-3">
        {/* 기간 */}
        <div className="text-xs font-semibold text-gray-600">
          {formatRangeShort(startDate, endDate)}
        </div>

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

        {/* 차량종류 / 배차상태 */}
        <div className="flex gap-2">
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

        {/* 🔥 검색필터 (거래처명/기사명/차량번호/상차/하차) */}
        <div className="flex gap-2">
          <select
            className="w-28 border rounded-full px-3 py-1.5 bg-gray-50 text-sm"
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
          >
            <option>거래처명</option>
            <option>기사명</option>
            <option>차량번호</option>
            <option>상차지명</option>
            <option>하차지명</option>
          </select>

          <input
            className="flex-1 border rounded-full px-3 py-1.5 text-sm bg-gray-50"
            placeholder="검색어 입력"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </div>

      {/* 카드 리스트 */}
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

// ======================================================================
// 카드 UI
// ======================================================================
function MobileOrderCard({ order }) {
  const claim = getClaim(order);
  const fee = order.기사운임 ?? 0;

  const stateRaw = order.배차상태 || order.상태 || "배차전";
  const state = normalizeState(stateRaw);

  const badge =
    state === "배차완료"
      ? "border-green-400 text-green-600"
      : state === "배차취소"
      ? "border-red-400 text-red-600"
      : "border-gray-400 text-gray-600";

  return (
    <div className="bg-white rounded-2xl shadow px-4 py-3 border">
      <div className="text-[13px] text-gray-400 mb-1">
        {order.거래처명 || "-"}
      </div>

      <div className="flex justify-between items-start">
        <div>
          <div className="text-[17px] font-bold text-blue-600">
            {order.상차지명}
          </div>

          <div className="mt-1 text-[15px] text-gray-900 font-semibold">
            {order.하차지명}
          </div>
        </div>

        <span
          className={`px-3 py-1 rounded-full border text-[12px] font-medium ${badge}`}
        >
          {state}
        </span>
      </div>

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
// 상세보기 (기사배차 포함)
// ======================================================================
function MobileOrderDetail({
  order,
  drivers,
  onAssignDriver,
  onCancelAssign,
  onCancelOrder,
  setSelectedOrder,
}) {
    // 🔵 수정 모드용 상태
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ ...order });

  const [carNo, setCarNo] = useState(order.차량번호 || "");
  const [name, setName] = useState(order.기사명 || "");
  const [phone, setPhone] = useState(order.전화번호 || "");

  useEffect(() => {
    if (!carNo) {
      setName("");
      setPhone("");
      return;
    }
    const norm = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();
    const d = drivers.find((dr) => norm(dr.차량번호) === norm(carNo));
    if (d) {
      setName(d.이름 || "");
      setPhone(d.전화번호 || "");
    }
  }, [carNo, drivers]);

  const handleAssignClick = () => {
    if (!carNo) return alert("차량번호 입력");
    onAssignDriver({
      차량번호: carNo,
      이름: name,
      전화번호: phone,
    });
  };
    const handleEditSave = async () => {
  try {
    const payload = {
      ...editForm,
      청구운임: toNumber(editForm.청구운임),
      기사운임: toNumber(editForm.기사운임),
      수수료: toNumber(editForm.청구운임) - toNumber(editForm.기사운임),
    };

    await updateDoc(doc(db, "dispatch", order.id), payload);

    // 🔥 상세 화면도 즉시 반영되도록
    setSelectedOrder((p) => p ? { ...p, ...payload } : p);

    alert("수정되었습니다.");
    setEditMode(false);
  } catch (err) {
    console.error(err);
    alert("수정 중 오류 발생");
  }
};



  const openMap = (type) => {
    const addr =
      type === "pickup"
        ? order.상차지주소 || order.상차지명
        : order.하차지주소 || order.하차지명;
    if (!addr) return alert("주소 없음");
    const url = `https://map.kakao.com/?q=${encodeURIComponent(addr)}`;
    window.open(url, "_blank");
  };

  const state = normalizeState(order.배차상태);

  return (
    <div className="px-4 py-3 space-y-4">
      {/* 기본 정보 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
        <div className="flex justify-between items-start mb-2">
          <button
  onClick={() => {
    setEditForm({ ...order });
    setEditMode(true);
  }}
  className="ml-2 px-2 py-1 text-xs bg-yellow-200 text-yellow-800 rounded"
>
  수정
</button>
          <div>
            <div className="text-xs text-gray-400 mb-1">
              {order.거래처명 || "-"}
            </div>
            <div className="text-sm font-semibold text-blue-600">
              {order.상차지명}
            </div>
            <div className="mt-2 text-sm text-gray-800">
              {order.하차지명}
            </div>
          </div>

          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 border text-gray-700">
            {state}
          </span>
        </div>

        <div className="text-xs text-gray-500 mb-1">
          상차일시: {order.상차일} {order.상차시간}
        </div>
        <div className="text-xs text-gray-500 mb-2">
          하차일시: {order.하차일} {order.하차시간}
        </div>

        <div className="flex items-center gap-2 text-sm mb-1">
          <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-xs">
            청구운임
          </span>
          <span className="font-semibold">
            {fmtMoney(getClaim(order))}
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm mb-2">
          <span className="px-2 py-0.5 rounded-full bg-blue-200 text-blue-700 text-xs">
            기사운임
          </span>
          <span className="font-semibold">
            {fmtMoney(order.기사운임 || 0)}
          </span>
        </div>
      </div>

      {/* 지도 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
        <div className="text-sm font-semibold mb-2">지도 보기</div>
        <div className="flex gap-2">
          <button
            onClick={() => openMap("pickup")}
            className="flex-1 py-2 rounded-lg bg-blue-500 text-white text-sm"
          >
            상차지
          </button>
          <button
            onClick={() => openMap("drop")}
            className="flex-1 py-2 rounded-lg bg-indigo-500 text-white text-sm"
          >
            하차지
          </button>
        </div>
      </div>

      {/* 배차 입력 */}
      {editMode && (
  <div className="bg-white border rounded-xl px-4 py-3 shadow-sm space-y-3 mt-4">
    <div className="text-sm font-semibold mb-2">상세 정보 수정</div>

    {/* 거래처명 */}
    <input
      className="w-full border rounded px-2 py-1"
      value={editForm.거래처명}
      onChange={(e) => setEditForm((p) => ({ ...p, 거래처명: e.target.value }))}
      placeholder="거래처명"
    />

    {/* 상차/하차 */}
    <input
      className="w-full border rounded px-2 py-1"
      value={editForm.상차지명}
      onChange={(e) => setEditForm((p) => ({ ...p, 상차지명: e.target.value }))}
      placeholder="상차지명"
    />

    <input
      className="w-full border rounded px-2 py-1"
      value={editForm.상차지주소}
      onChange={(e) => setEditForm((p) => ({ ...p, 상차지주소: e.target.value }))}
      placeholder="상차지주소"
    />

    <input
      className="w-full border rounded px-2 py-1"
      value={editForm.하차지명}
      onChange={(e) => setEditForm((p) => ({ ...p, 하차지명: e.target.value }))}
      placeholder="하차지명"
    />

    <input
      className="w-full border rounded px-2 py-1"
      value={editForm.하차지주소}
      onChange={(e) => setEditForm((p) => ({ ...p, 하차지주소: e.target.value }))}
      placeholder="하차지주소"
    />

    {/* 일시 */}
    <div className="flex gap-2">
      <input
        type="date"
        className="flex-1 border rounded px-2 py-1"
        value={editForm.상차일}
        onChange={(e) => setEditForm((p) => ({ ...p, 상차일: e.target.value }))}
      />
      <input
        className="flex-1 border rounded px-2 py-1"
        value={editForm.상차시간}
        onChange={(e) => setEditForm((p) => ({ ...p, 상차시간: e.target.value }))}
      />
    </div>

    <div className="flex gap-2">
      <input
        type="date"
        className="flex-1 border rounded px-2 py-1"
        value={editForm.하차일}
        onChange={(e) => setEditForm((p) => ({ ...p, 하차일: e.target.value }))}
      />
      <input
        className="flex-1 border rounded px-2 py-1"
        value={editForm.하차시간}
        onChange={(e) => setEditForm((p) => ({ ...p, 하차시간: e.target.value }))}
      />
    </div>

    {/* 차량 정보 */}
    <div className="flex gap-2">
      <input
        className="flex-1 border rounded px-2 py-1"
        value={editForm.톤수}
        onChange={(e) => setEditForm((p) => ({ ...p, 톤수: e.target.value }))}
        placeholder="톤수"
      />
      <input
        className="flex-1 border rounded px-2 py-1"
        value={editForm.차종}
        onChange={(e) => setEditForm((p) => ({ ...p, 차종: e.target.value }))}
        placeholder="차종"
      />
    </div>

    <input
      className="w-full border rounded px-2 py-1"
      value={editForm.차량번호}
      onChange={(e) => setEditForm((p) => ({ ...p, 차량번호: e.target.value }))}
      placeholder="차량번호"
    />

    {/* 기사 정보 */}
    <input
      className="w-full border rounded px-2 py-1"
      value={editForm.기사명 || ""}
      onChange={(e) => setEditForm((p) => ({ ...p, 기사명: e.target.value }))}
      placeholder="기사명"
    />

    <input
      className="w-full border rounded px-2 py-1"
      value={editForm.전화번호 || ""}
      onChange={(e) => setEditForm((p) => ({ ...p, 전화번호: e.target.value }))}
      placeholder="전화번호"
    />

    {/* 운임 */}
    <input
      className="w-full border rounded px-2 py-1 text-right"
      value={editForm.청구운임}
      onChange={(e) =>
        setEditForm((p) => ({ ...p, 청구운임: toNumber(e.target.value) }))
      }
      placeholder="청구운임"
    />

    <input
      className="w-full border rounded px-2 py-1 text-right"
      value={editForm.기사운임}
      onChange={(e) =>
        setEditForm((p) => ({ ...p, 기사운임: toNumber(e.target.value) }))
      }
      placeholder="기사운임"
    />

    {/* 방법 / 혼적 */}
    <input
      className="w-full border rounded px-2 py-1"
      value={editForm.상차방법}
      onChange={(e) => setEditForm((p) => ({ ...p, 상차방법: e.target.value }))}
      placeholder="상차방법"
    />

    <input
      className="w-full border rounded px-2 py-1"
      value={editForm.하차방법}
      onChange={(e) => setEditForm((p) => ({ ...p, 하차방법: e.target.value }))}
      placeholder="하차방법"
    />

    {/* 지급 / 배차 */}
    <input
      className="w-full border rounded px-2 py-1"
      value={editForm.지급방식}
      onChange={(e) => setEditForm((p) => ({ ...p, 지급방식: e.target.value }))}
      placeholder="지급방식"
    />

    <input
      className="w-full border rounded px-2 py-1"
      value={editForm.배차방식}
      onChange={(e) => setEditForm((p) => ({ ...p, 배차방식: e.target.value }))}
      placeholder="배차방식"
    />

    {/* 비고 */}
    <textarea
      className="w-full border rounded px-2 py-1 h-20"
      value={editForm.메모 || ""}
      onChange={(e) => setEditForm((p) => ({ ...p, 메모: e.target.value }))}
      placeholder="비고"
    />

    {/* 버튼 */}
    <div className="flex gap-2 pt-2">
      <button
        onClick={handleEditSave}
        className="flex-1 py-2 bg-blue-500 text-white text-sm rounded-lg"
      >
        수정 저장
      </button>

      <button
        onClick={() => setEditMode(false)}
        className="flex-1 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg"
      >
        수정 취소
      </button>
    </div>
  </div>
)}


      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm space-y-3">
        <div className="text-sm font-semibold mb-1">기사 배차</div>

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
          className="w-full py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold"
        >
          기사 배차하기
        </button>

        {state === "배차완료" && (
          <button
            onClick={onCancelAssign}
            className="w-full py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold"
          >
            배차 취소하기
          </button>
        )}

        <button
          onClick={onCancelOrder}
          className="w-full py-2 rounded-lg bg-red-100 text-red-700 text-sm font-semibold"
        >
          오더 삭제
        </button>
      </div>
    </div>
  );
}

// ======================================================================
// 표준운임표 (🔥 PC처럼 전체 검색 가능하게 수정됨)
// ======================================================================
function MobileStandardFare() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "standardFare"), (snap) => {
      setRows(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }))
      );
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      return (
        String(r.출발지 || r.from || "").toLowerCase().includes(t) ||
        String(r.도착지 || r.to || "").toLowerCase().includes(t) ||
        String(r.톤수 || r.ton || "").toLowerCase().includes(t) ||
        String(r.차종 || "").toLowerCase().includes(t) ||
        String(r.화물 || "").toLowerCase().includes(t)
      );
    });
  }, [rows, q]);

  return (
    <div className="px-3 py-3">
      <input
        className="w-full px-3 py-2 border rounded-full text-sm mb-3 bg-gray-50"
        placeholder="출발지, 도착지, 톤수, 차종, 화물 검색"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-3 py-2 border-b text-sm font-semibold">
          표준운임표
        </div>
        <div className="max-h-[70vh] overflow-auto">
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
                  <td className="px-2 py-1 border-r">{r.출발지}</td>
                  <td className="px-2 py-1 border-r">{r.도착지}</td>
                  <td className="px-2 py-1 border-r text-center">{r.톤수}</td>
                  <td className="px-2 py-1 text-right">{fmtMoney(r.운임)}</td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-gray-400">
                    검색 결과가 없습니다.
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

// ======================================================================
// 배차현황 / 미배차현황 테이블
// ======================================================================
function MobileStatusTable({ title, orders }) {
  return (
    <div className="px-3 py-3">
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
                  <td className="px-2 py-1 border-r">{o.거래처명}</td>
                  <td className="px-2 py-1 border-r">{o.상차지명}</td>
                  <td className="px-2 py-1 border-r">{o.하차지명}</td>
                  <td className="px-2 py-1 border-r">
                    <div>
                      {o.차량톤수 || o.톤수} {o.차량종류 || o.차종}
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

// ======================================================================
// 등록 폼
// ======================================================================
function MobileOrderForm({ form, setForm, clients, onSave }) {
  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="px-4 py-3 space-y-3">
      {/* 청구/산재 */}
      <div className="grid grid-cols-2 border rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="border-r px-3 py-2">
          <div className="text-xs text-gray-500 mb-1">청구운임</div>
          <input
            className="w-full border rounded px-2 py-1 text-right text-sm"
            value={form.청구운임}
            onChange={(e) => update("청구운임", toNumber(e.target.value))}
          />
        </div>
        <div className="px-3 py-2">
          <div className="text-xs text-gray-500 mb-1">산재보험료</div>
          <input
            className="w-full border rounded px-2 py-1 text-right text-sm"
            value={form.산재보험료}
            onChange={(e) => update("산재보험료", toNumber(e.target.value))}
          />
        </div>
      </div>

      {/* 일/시간 */}
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

      {/* 상차지 / 하차지 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="상차지명"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.상차지명}
              onChange={(e) => update("상차지명", e.target.value)}
            />
          }
        />
        <RowLabelInput
          label="상차지주소"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.상차지주소}
              onChange={(e) => update("상차지주소", e.target.value)}
            />
          }
        />

        <RowLabelInput
          label="하차지명"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.하차지명}
              onChange={(e) => update("하차지명", e.target.value)}
            />
          }
        />
        <RowLabelInput
          label="하차지주소"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.하차지주소}
              onChange={(e) => update("하차지주소", e.target.value)}
            />
          }
        />
      </div>

      {/* 톤수/차종 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="톤수/차종"
          input={
            <div className="grid grid-cols-2 gap-2">
              <input
                className="border rounded px-2 py-1 text-sm"
                value={form.톤수}
                onChange={(e) => update("톤수", e.target.value)}
              />
              <input
                className="border rounded px-2 py-1 text-sm"
                value={form.차종}
                onChange={(e) => update("차종", e.target.value)}
              />
            </div>
          }
        />
      </div>

      {/* 화물 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="화물내용"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.화물내용}
              onChange={(e) => update("화물내용", e.target.value)}
            />
          }
        />
      </div>

      {/* 지급/배차 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="지급방법"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.지급방식}
              onChange={(e) => update("지급방식", e.target.value)}
            />
          }
        />
        <RowLabelInput
          label="배차방법"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.배차방식}
              onChange={(e) => update("배차방식", e.target.value)}
            />
          }
        />
      </div>

      {/* 차량번호 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="차량번호"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.차량번호}
              onChange={(e) => update("차량번호", e.target.value)}
            />
          }
        />
      </div>

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

      <button
        onClick={onSave}
        className="w-full py-3 rounded-lg bg-blue-500 text-white text-base font-semibold shadow mt-4 mb-8"
      >
        등록하기
      </button>
    </div>
  );
}

// ======================================================================
// 공통 라벨+인풋
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

// ======================= END OF FILE =======================
