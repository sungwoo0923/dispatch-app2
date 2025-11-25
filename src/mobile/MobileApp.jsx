// ======================= src/mobile/MobileApp.jsx (PART 1/8) =======================
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

/* -------------------------------------------------------------
   공통 유틸
------------------------------------------------------------- */
const toNumber = (v) =>
  Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;

const fmtMoney = (v) =>
  `${Number(v || 0).toLocaleString("ko-KR")}원`;

const getPickupDate = (o = {}) => {
  if (o.상차일) return String(o.상차일).slice(0, 10);
  if (o.상차일시) return String(o.상차일시).slice(0, 10);
  if (o.등록일) return String(o.등록일).slice(0, 10);
  return "";
};

const getClaim = (o = {}) =>
  o.청구운임 ?? o.인수증 ?? 0;

const shortAddr = (addr = "") => {
  const parts = String(addr).split(/\s+/);
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
  return parts[0] || "";
};

const formatDateHeader = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}.${day}`;
};

const formatRangeShort = (s, e) => {
  if (!s && !e) return "";
  const ss = s ? s.slice(5).replace("-", ".") : "";
  const ee = e ? e.slice(5).replace("-", ".") : "";
  return `${ss} ~ ${ee || ss}`;
};

function normalizeState(raw) {
  if (!raw) return "배차전";
  if (raw === "배차중") return "배차전";
  return raw;
}

/* -------------------------------------------------------------
   메인 컴포넌트 시작
------------------------------------------------------------- */
export default function MobileApp() {
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [clients, setClients] = useState([]);
  /* -------------------------------------------------------------
   🔥 수정모드용 폼 상태 생성
------------------------------------------------------------- */
const [editForm, setEditForm] = useState(null); // null = 수정모드 아님

  // 🔵 전체 오더 실시간 연동
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "dispatch"), (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      list.sort((a, b) => {
        const da = getPickupDate(a);
        const db_ = getPickupDate(b);
        return (db_ || "").localeCompare(da || "");
      });

      setOrders(list);
    });
    return () => unsub();
  }, []);

  // 🔵 기사
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "drivers"), (snap) => {
      setDrivers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // 🔵 거래처
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "clients"), (snap) => {
      setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  /* -------------------------------------------------------------
     화면 상태
  ------------------------------------------------------------- */
  const [page, setPage] = useState("list"); // list | form | detail | fare | status
  const [selectedOrder, setSelectedOrder] = useState(null);

  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [statusTab, setStatusTab] = useState("전체");

  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());

  // 🔵 추가 필터
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [assignFilter, setAssignFilter] = useState("");

  // 🔵 검색 필터 (거래처 / 기사 / 차량번호 / 상하차지)
  const [searchType, setSearchType] = useState("거래처명");
  const [searchText, setSearchText] = useState("");

  /* -------------------------------------------------------------
     화물 신규등록 폼
  ------------------------------------------------------------- */
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

  const quickRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };
// ======================= src/mobile/MobileApp.jsx (PART 2/8) =======================

// -------------------------------------------------------------
//  필터링 (상태탭 + 기간 + 차량종류 + 배차상태 + 검색필터)
// -------------------------------------------------------------
const filteredOrders = useMemo(() => {
  return orders.filter((o) => {
    const rawState = o.배차상태 || o.상태 || "배차전";
    const state = normalizeState(rawState);

    // 상단 탭
    if (statusTab !== "전체" && state !== statusTab) return false;

    // 배차상태 드롭다운
    if (assignFilter && state !== assignFilter) return false;

    // 차종 필터
    if (vehicleFilter) {
      const car = String(o.차량종류 || o.차종 || "").toLowerCase();
      if (!car.includes(vehicleFilter.toLowerCase())) return false;
    }

    // 날짜 필터
    const d = getPickupDate(o);
    if (startDate && d && d < startDate) return false;
    if (endDate && d && d > endDate) return false;

    // 검색 필터
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

// 미배차
const unassignedOrders = useMemo(
  () =>
    filteredOrders.filter(
      (o) => normalizeState(o.배차상태) === "배차전"
    ),
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

// -------------------------------------------------------------
//  신규 저장 (PC와 100% 동일하게 저장됨)
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// 기사 배차 (자동 신규등록 포함)
// -------------------------------------------------------------
const assignDriver = async ({ 차량번호, 이름, 전화번호 }) => {
  if (!selectedOrder) return;

  const norm = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();
  let driver = drivers.find(
    (d) => norm(d.차량번호) === norm(차량번호)
  );

  // 🔴 없으면 신규 기사 자동등록
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

  setSelectedOrder((p) =>
    p
      ? {
          ...p,
          배차상태: "배차완료",
          상태: "배차완료",
          기사명: driver.이름,
          차량번호: driver.차량번호,
          전화번호: driver.전화번호,
        }
      : p
  );

  alert(`배차 완료: ${driver.이름} (${driver.차량번호})`);
};

// -------------------------------------------------------------
// 배차 취소
// -------------------------------------------------------------
const cancelAssign = async () => {
  if (!selectedOrder) return;

  await updateDoc(doc(db, "dispatch", selectedOrder.id), {
    배차상태: "배차전",
    상태: "배차전",
    기사명: "",
    차량번호: "",
    전화번호: "",
  });

  setSelectedOrder((p) =>
    p
      ? {
          ...p,
          배차상태: "배차전",
          상태: "배차전",
          기사명: "",
          차량번호: "",
          전화번호: "",
        }
      : p
  );

  alert("배차 취소되었습니다.");
};

// -------------------------------------------------------------
// 오더 삭제
// -------------------------------------------------------------
const cancelOrder = async () => {
  if (!selectedOrder) return;
  if (!window.confirm("정말 삭제하시겠습니까?")) return;

  await deleteDoc(doc(db, "dispatch", selectedOrder.id));
  setSelectedOrder(null);
  setPage("list");

  alert("삭제되었습니다.");
};

// 새로고침
const handleRefresh = () => {
  window.location.reload();
};

// 화면 제목
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
    ? "미배차"
    : "상세보기";
// ======================= src/mobile/MobileApp.jsx (PART 3/8) =======================

return (
  <div className="w-full max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col relative">
    {/* -------------------------------------------------------------
       Header
    ------------------------------------------------------------- */}
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

    {/* -------------------------------------------------------------
       사이드 메뉴
    ------------------------------------------------------------- */}
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

    {/* -------------------------------------------------------------
       메인 콘텐츠 스크롤 영역
    ------------------------------------------------------------- */}
    <div className="flex-1 overflow-y-auto pb-24">
      {/* 리스트 */}
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

      {/* 신규등록 */}
      {page === "form" && (
        <MobileOrderForm
          form={form}
          setForm={setForm}
          clients={clients}
          onSave={handleSave}
        />
      )}

      {/* 상세보기 */}
      {page === "detail" && selectedOrder && (
        <MobileOrderDetail
          order={selectedOrder}
          drivers={drivers}
          onAssignDriver={assignDriver}
          onCancelAssign={cancelAssign}
          onCancelOrder={cancelOrder}
          onEdit={() => {
            setEditForm(selectedOrder); // A + B + C 구조 중 A방식 반영
            setPage("edit");
          }}
        />
      )}

      {/* 오더 수정 페이지 (🔥신규추가) */}
      {page === "edit" && editForm && (
        <MobileOrderEditForm
          form={editForm}
          setForm={setEditForm}
          onSave={handleEditSave}
          onCancel={() => setPage("detail")}
        />
      )}

      {/* 표준운임표 */}
      {page === "fare" && <MobileStandardFare />}

      {/* 배차현황 */}
      {page === "status" && (
        <MobileStatusTable title="배차현황" orders={filteredOrders} />
      )}

      {/* 미배차현황 */}
      {page === "unassigned" && (
        <MobileStatusTable title="미배차" orders={unassignedOrders} />
      )}
    </div>

    {/* -------------------------------------------------------------
       + 버튼 (신규등록)
    ------------------------------------------------------------- */}
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

/* -------------------------------------------------------------
   Header
------------------------------------------------------------- */
function MobileHeader({ title, onBack, onRefresh, onMenu }) {
  const hasLeft = !!onBack || !!onMenu;
  const leftFn = onBack || onMenu;
  const leftLabel = onBack ? "◀" : "≡";

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-b sticky top-0 z-30">
      <button
        className="w-8 h-8 text-xl flex items-center justify-center text-gray-700"
        onClick={hasLeft ? leftFn : undefined}
      >
        {hasLeft ? leftLabel : ""}
      </button>

      <div className="font-semibold text-base">{title}</div>

      <button
        className="w-8 h-8 text-lg flex items-center justify-center text-gray-700"
        onClick={onRefresh}
      >
        {onRefresh ? "⟳" : ""}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------
   Side Menu
------------------------------------------------------------- */
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
          <div className="font-semibold">(주)돌캐 모바일</div>
          <button className="text-xl text-gray-500" onClick={onClose}>
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
          모바일 버전은 조회·등록 중심입니다.
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
      className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
// ======================= src/mobile/MobileApp.jsx (PART 4/8) =======================

/* -------------------------------------------------------------
   등록내역 리스트 (검색/필터포함)
------------------------------------------------------------- */
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
            className={`flex-1 py-2 text-sm border-b-2 font-medium ${
              statusTab === t
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 날짜 / 필터 / 검색 */}
      <div className="bg-white border-b px-4 py-3 space-y-3">
        {/* 기간 표시 */}
        <div className="text-xs font-semibold text-gray-600">
          {formatRangeShort(startDate, endDate)}
        </div>

        {/* 날짜 선택 */}
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            className="flex-1 border rounded-full px-3 py-1.5 bg-gray-50"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span className="text-xs text-gray-400">~</span>
          <input
            type="date"
            className="flex-1 border rounded-full px-3 py-1.5 bg-gray-50"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        {/* 퀵범위 */}
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

        {/* 차종 / 배차상태 */}
        <div className="flex gap-2">
          <select
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            className="flex-1 border rounded-full px-3 py-1.5 bg-gray-50"
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
            value={assignFilter}
            onChange={(e) => setAssignFilter(e.target.value)}
            className="flex-1 border rounded-full px-3 py-1.5 bg-gray-50"
          >
            <option value="">배차 전체</option>
            <option value="배차전">배차전</option>
            <option value="배차완료">배차완료</option>
          </select>
        </div>

        {/* 검색 필터 */}
        <div className="flex gap-2">
          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
            className="w-28 border rounded-full px-3 py-1.5 bg-gray-50 text-sm"
          >
            <option>거래처명</option>
            <option>기사명</option>
            <option>차량번호</option>
            <option>상차지명</option>
            <option>하차지명</option>
          </select>

          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="검색어 입력"
            className="flex-1 border rounded-full px-3 py-1.5 text-sm bg-gray-50"
          />
        </div>
      </div>

      {/* 오더 카드 리스트 */}
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

/* -------------------------------------------------------------
   카드 UI
------------------------------------------------------------- */
function MobileOrderCard({ order }) {
  const claim = getClaim(order);
  const fee = order.기사운임 ?? 0;

  const state = normalizeState(order.배차상태 || order.상태);

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

/* -------------------------------------------------------------
   상세보기 — 배차/취소/삭제 + 수정버튼 추가(A방식 기반)
------------------------------------------------------------- */
function MobileOrderDetail({
  order,
  drivers,
  onAssignDriver,
  onCancelAssign,
  onCancelOrder,
  onEdit,
}) {
  const [carNo, setCarNo] = useState(order.차량번호 || "");
  const [name, setName] = useState(order.기사명 || "");
  const [phone, setPhone] = useState(order.전화번호 || "");

  // 차량번호 입력 → 자동 기사매칭
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

  const state = normalizeState(order.배차상태);

  return (
    <div className="px-4 py-3 space-y-4">
      {/* 상단 정보 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
        <div className="flex justify-between">
          <div>
            <div className="text-xs text-gray-400">
              {order.거래처명}
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

        <div className="text-xs text-gray-500 mt-2">
          상차일시: {order.상차일} {order.상차시간}
        </div>
        <div className="text-xs text-gray-500">
          하차일시: {order.하차일} {order.하차시간}
        </div>

        <div className="mt-3 text-sm flex gap-2">
          <button
            onClick={onEdit}
            className="flex-1 py-2 rounded-lg bg-yellow-400 text-white font-semibold"
          >
            수정하기
          </button>
        </div>
      </div>

      {/* 지도 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
        <div className="font-semibold text-sm mb-2">지도 보기</div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              window.open(
                `https://map.kakao.com/?q=${encodeURIComponent(
                  order.상차지주소 || order.상차지명
                )}`,
                "_blank"
              )
            }
            className="flex-1 py-2 bg-blue-500 text-white rounded-lg text-sm"
          >
            상차지
          </button>
          <button
            onClick={() =>
              window.open(
                `https://map.kakao.com/?q=${encodeURIComponent(
                  order.하차지주소 || order.하차지명
                )}`,
                "_blank"
              )
            }
            className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm"
          >
            하차지
          </button>
        </div>
      </div>

      {/* 기사 배차 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm space-y-3">
        <div className="font-semibold text-sm mb-1">기사 배차</div>

        <div className="space-y-2 text-sm">
          <input
            value={carNo}
            onChange={(e) => setCarNo(e.target.value)}
            placeholder="차량번호"
            className="border rounded w-full px-2 py-1"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="기사 이름"
            className="border rounded w-full px-2 py-1"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="기사 연락처"
            className="border rounded w-full px-2 py-1"
          />
        </div>

        <button
          onClick={() =>
            onAssignDriver({
              차량번호: carNo,
              이름: name,
              전화번호: phone,
            })
          }
          className="w-full py-2 bg-emerald-500 text-white rounded-lg font-semibold text-sm"
        >
          기사 배차하기
        </button>

        {state === "배차완료" && (
          <button
            onClick={onCancelAssign}
            className="w-full py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold text-sm"
          >
            배차 취소하기
          </button>
        )}

        <button
          onClick={onCancelOrder}
          className="w-full py-2 bg-red-100 text-red-700 rounded-lg font-semibold text-sm"
        >
          오더 삭제
        </button>
      </div>
    </div>
  );
}
// ======================= src/mobile/MobileApp.jsx (PART 5/8) =======================

const handleEdit = () => {
  if (!selectedOrder) return;

  // 기존 오더값 → editForm 으로 복사
  setEditForm({
    ...selectedOrder,
    청구운임: selectedOrder.청구운임 ?? 0,
    산재보험료: selectedOrder.산재보험료 ?? 0,
    톤수: selectedOrder.차량톤수 || selectedOrder.톤수 || "",
    차종: selectedOrder.차량종류 || selectedOrder.차종 || "",
    적요: selectedOrder.메모 || selectedOrder.비고 || "",
  });

  setPage("edit");
};

/* -------------------------------------------------------------
   🔥 수정 저장 실행(update)
------------------------------------------------------------- */
const handleEditSave = async () => {
  if (!editForm.상차지명 || !editForm.하차지명) {
    alert("상차지 / 하차지는 필수입니다.");
    return;
  }

  const 청구운임 = toNumber(editForm.청구운임);
  const 기사운임 = toNumber(editForm.기사운임);
  const 수수료 = 청구운임 - 기사운임;

  const updateData = {
    거래처명: editForm.거래처명,
    상차지명: editForm.상차지명,
    상차지주소: editForm.상차지주소,
    하차지명: editForm.하차지명,
    하차지주소: editForm.하차지주소,
    화물내용: editForm.화물내용,
    차량종류: editForm.차종,
    차량톤수: editForm.톤수,
    상차방법: editForm.상차방법,
    하차방법: editForm.하차방법,
    상차일: editForm.상차일,
    상차시간: editForm.상차시간,
    하차일: editForm.하차일,
    하차시간: editForm.하차시간,
    지급방식: editForm.지급방식,
    배차방식: editForm.배차방식,
    메모: editForm.적요,
    차량번호: editForm.차량번호,
    혼적여부: editForm.혼적여부,
    청구운임,
    기사운임,
    수수료,
  };

  await updateDoc(doc(db, "dispatch", editForm.id), updateData);

  alert("수정 완료되었습니다.");

  // 수정모드 종료
  setEditForm(null);
  setSelectedOrder(null);

  // 리스트로 복귀
  setPage("list");
};

/* -------------------------------------------------------------
   🔥 수정 취소
------------------------------------------------------------- */
const handleEditCancel = () => {
  setEditForm(null);
  setSelectedOrder(null);
  setPage("list");
};
// ======================= 같은 파일 PART 5/8 이어짐 =======================

/* -------------------------------------------------------------
   🔥 수정 화면 렌더링
------------------------------------------------------------- */
function MobileOrderEditForm({ form, setForm, onSave, onCancel }) {
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

      {/* 상차일/시간 */}
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

      {/* 상차/하차 */}
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

      {/* 화물내용 */}
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

      {/* 지급/배차방식 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="지급방식"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.지급방식}
              onChange={(e) => update("지급방식", e.target.value)}
            />
          }
        />
        <RowLabelInput
          label="배차방식"
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

      {/* 저장 / 취소 */}
      <button
        onClick={onSave}
        className="w-full py-3 rounded-lg bg-blue-500 text-white text-base font-semibold shadow mt-4"
      >
        수정 저장
      </button>

      <button
        onClick={onCancel}
        className="w-full py-3 rounded-lg bg-gray-200 text-gray-700 text-base font-semibold shadow mb-8"
      >
        취소
      </button>
    </div>
  );
}

/* -------------------------------------------------------------
   🔥 표준운임표 전체 검색 가능한 버전
------------------------------------------------------------- */

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

  // 🔥 검색 강화: 띄어쓰기 무시 / 일부단어 포함 / 대소문자 무시
  const filtered = useMemo(() => {
    const norm = (v) => String(v ?? "").replace(/\s+/g, "").toLowerCase();
    const t = norm(q);

    if (!t) return rows;

    return rows.filter((r) => {
      const from = norm(r.출발지 || r.from);
      const to = norm(r.도착지 || r.to);
      const ton = norm(r.톤수 || r.ton);
      const car = norm(r.차종 || r.차량종류);
      const cargo = norm(r.화물 || "");

      return (
        from.includes(t) ||
        to.includes(t) ||
        ton.includes(t) ||
        car.includes(t) ||
        cargo.includes(t)
      );
    });
  }, [rows, q]);

  return (
    <div className="px-3 py-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="출발지/도착지/톤수/차종/화물 검색"
        className="w-full px-3 py-2 border rounded-full text-sm mb-3 bg-gray-50"
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
                  <td
                    colSpan={4}
                    className="px-3 py-4 text-center text-gray-400"
                  >
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
// ======================= src/mobile/MobileApp.jsx (PART 7/8) =======================

/* -------------------------------------------------------------
   🔵 배차현황 / 미배차현황 (표 현황)
------------------------------------------------------------- */
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
                <th className="px-2 py-1 border-r whitespace-nowrap">상차일</th>
                <th className="px-2 py-1 border-r">거래처</th>
                <th className="px-2 py-1 border-r">상차지</th>
                <th className="px-2 py-1 border-r">하차지</th>
                <th className="px-2 py-1 border-r whitespace-nowrap">
                  차량 / 기사
                </th>
                <th className="px-2 py-1 whitespace-nowrap">청구 / 기사</th>
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
                      {(o.차량톤수 || o.톤수) + " "}
                      {(o.차량종류 || o.차종) || ""}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {o.기사명}
                      {o.기사명 ? "(" + (o.차량번호 || "") + ")" : ""}
                    </div>
                  </td>

                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    청 {fmtMoney(getClaim(o))}
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

/* -------------------------------------------------------------
   🔵 공통 RowLabelInput
------------------------------------------------------------- */
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
