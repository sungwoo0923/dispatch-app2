// ======================= src/mobile/MobileApp.jsx =======================
import React, { useState, useMemo, useEffect } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";

// 🔹 공통: 숫자만 추출
const toNumber = (v) =>
  Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;

// 🔹 공통: 금액표시
const fmt = (v) => `${Number(v || 0).toLocaleString("ko-KR")}원`;

// 🔹 공통: 상차일 필터용 날짜 뽑기 (PC / 모바일 데이터 둘 다 대응)
const getPickupDate = (o = {}) => {
  if (o.상차일) return String(o.상차일).slice(0, 10);
  if (o.상차일시) return String(o.상차일시).slice(0, 10);
  if (o.등록일) return String(o.등록일).slice(0, 10);
  return "";
};

// 🔹 공통: 청구운임(또는 인수증) 가져오기 (PC/모바일 혼합 대응)
const getClaim = (o = {}) =>
  o.청구운임 ?? o.인수증 ?? 0;

// 🔹 공통: 산재보험료
const getSanjae = (o = {}) => o.산재보험료 ?? 0;

// 🔹 카톡 공유용 문자열 생성
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
    `차량: ${
      order.차량톤수 || order.톤수 || ""
    } ${order.차량종류 || order.차종 || ""}`.trim() || "차량 정보 없음"
  );

  const claim = getClaim(order);
  const driverFare = order.기사운임 ?? 0;
  const fee = order.수수료 ?? claim - driverFare;

  lines.push(`청구운임: ${claim.toLocaleString("ko-KR")}원`);
  lines.push(`기사운임: ${driverFare.toLocaleString("ko-KR")}원`);
  lines.push(`수수료: ${fee.toLocaleString("ko-KR")}원`);

  if (order.화물내용 || order.화물중량) {
    lines.push("");
    lines.push(
      `[화물] ${order.화물내용 || order.화물중량 || ""}`
    );
  }

  if (order.비고 || order.메모) {
    lines.push("");
    lines.push(`[비고] ${order.비고 || order.메모}`);
  }

  return lines.join("\n");
}

// ======================================================================
//  메인 컴포넌트
// ======================================================================
export default function MobileApp() {
  // --------------------------------------------------
  // 1. Firestore 실시간 연동 (PC 버전과 동일 컬렉션 사용)
  // --------------------------------------------------
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [clients, setClients] = useState([]); // 거래처/하차지 자동완성용

  // dispatch
  useEffect(() => {
    const q = query(collection(db, "dispatch"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders(list);
    });

    return () => unsub();
  }, []);

  // drivers
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "drivers"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setDrivers(list);
    });

    return () => unsub();
  }, []);

  // clients (거래처/하차지 주소 자동완성용)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "clients"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setClients(list);
    });

    return () => unsub();
  }, []);

  // --------------------------------------------------
  // 2. 화면 상태 / 필터
  // --------------------------------------------------
  const [page, setPage] = useState("list"); // list | form | detail
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusTab, setStatusTab] = useState("전체");
  const [showMenu, setShowMenu] = useState(false);

  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());

  // --------------------------------------------------
  // 3. 등록 폼 (PC 컬럼과 최대한 맞춤)
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
    화물중량: "",
    상차방법: "",
    하차방법: "",
    지급방식: "",
    배차방식: "",
    청구운임: 0,
    기사운임: 0,
    수수료: 0,
    산재보험료: 0,
    적요: "",
  });

  // --------------------------------------------------
  // 4. 필터 / 유틸
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
      if (
        statusTab !== "전체" &&
        o.배차상태 !== statusTab &&
        o.상태 !== statusTab
      ) {
        return false;
      }
      const d = getPickupDate(o);
      if (startDate && d && d < startDate) return false;
      if (endDate && d && d > endDate) return false;
      return true;
    });
  }, [orders, statusTab, startDate, endDate]);

  // --------------------------------------------------
  // 5. Firestore 신규 저장 (PC와 동일 구조로 넣기)
  // --------------------------------------------------
  const handleSave = async () => {
    if (!form.상차지명 || !form.하차지명) {
      alert("상차지 / 하차지는 필수입니다.");
      return;
    }

    const 청구운임 = toNumber(form.청구운임);
    const 기사운임 = toNumber(form.기사운임);
    const 수수료 = 청구운임 - 기사운임;

    const 상차일시 = `${form.상차일 || ""} ${form.상차시간 || ""}`.trim();
    const 하차일시 = `${form.하차일 || ""} ${form.하차시간 || ""}`.trim();

    const docData = {
      // 상태
      배차상태: "배차전",
      상태: "배차전",

      // 날짜/시간
      등록일: todayStr(),
      상차일: form.상차일 || "",
      상차시간: form.상차시간 || "",
      하차일: form.하차일 || "",
      하차시간: form.하차시간 || "",
      상차일시,
      하차일시,

      // 거래처 / 상하차
      거래처명: form.거래처명 || form.상차지명 || "",
      상차지명: form.상차지명,
      상차지주소: form.상차지주소 || "",
      하차지명: form.하차지명,
      하차지주소: form.하차지주소 || "",

      // 차량정보/화물내용
      차량톤수: form.톤수 || "",
      톤수: form.톤수 || "",
      차량종류: form.차종 || "",
      차종: form.차종 || "",
      화물내용: form.화물중량 || "",
      화물중량: form.화물중량 || "",

      // 방법 / 방식
      상차방법: form.상차방법 || "",
      하차방법: form.하차방법 || "",
      지급방식: form.지급방식 || "",
      배차방식: form.배차방식 || "",

      // 금액
      청구운임,
      기사운임,
      수수료,
      인수증: 청구운임,
      산재보험료: toNumber(form.산재보험료),

      // 기사
      기사명: "",
      차량번호: "",
      전화번호: "",

      // 메모
      메모: form.적요 || "",
      비고: form.적요 || "",

      createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, "dispatch"), docData);
    alert("배차가 등록되었습니다.");

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
      화물중량: "",
      상차방법: "",
      하차방법: "",
      지급방식: "",
      배차방식: "",
      청구운임: 0,
      기사운임: 0,
      수수료: 0,
      산재보험료: 0,
      적요: "",
    });

    setPage("list");
  };

  // --------------------------------------------------
  // 6. 기사 배차 / 배차취소 (차량번호 기준 + 신규기사 등록)
  // --------------------------------------------------
  const assignDriver = async ({ 차량번호, 이름, 전화번호 }) => {
    if (!selectedOrder) return;
    const norm = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();

    let driver = drivers.find((d) => norm(d.차량번호) === norm(차량번호));

    // 신규 기사면 drivers 컬렉션에 추가
    if (!driver) {
      const ref = await addDoc(collection(db, "drivers"), {
        차량번호,
        이름,
        전화번호,
        메모: "",
        createdAt: serverTimestamp(),
      });
      driver = { id: ref.id, 차량번호, 이름, 전화번호 };
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

  const handleRefresh = () => {
    window.location.reload();
  };

  const title =
    page === "list" ? "등록내역" : page === "form" ? "화물등록" : "상세보기";

  // --------------------------------------------------
  // 7. 렌더링
  // --------------------------------------------------
  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col relative">
      <MobileHeader
        title={title}
        onBack={page !== "list" ? () => setPage("list") : undefined}
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
        />
      )}

      <div className="flex-1 overflow-y-auto pb-24">
        {page === "list" && (
          <MobileOrderList
            orders={filteredOrders}
            statusTab={statusTab}
            setStatusTab={setStatusTab}
            startDate={startDate}
            endDate={endDate}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            quickRange={quickRange}
            // 🔹 카드 클릭 시 상세보기로 이동
            onSelect={(order) => {
              setSelectedOrder(order);
              setPage("detail");
            }}
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
          />
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

/* ======================================================================
   공통 UI
====================================================================== */

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

function MobileSideMenu({ onClose, onGoList, onGoCreate }) {
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

          <MenuSection title="PC 데이터 메뉴 (웹으로 열기)">
            <MenuItem
              label="표준운임표 (PC 화면)"
              onClick={() => (window.location.href = "/standard-fare")}
            />
            <MenuItem
              label="배차현황 / 미배차 (PC 화면)"
              onClick={() => (window.location.href = "/app?view=pc")}
            />
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

/* ---------------------------------------------------------------------
   리스트
--------------------------------------------------------------------- */
function MobileOrderList({
  orders,
  statusTab,
  setStatusTab,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  quickRange,
  onSelect,
}) {
  const tabs = ["전체", "배차전", "배차완료", "배차취소"];

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

      {/* 날짜 필터 */}
      <div className="bg-white border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            className="flex-1 border rounded px-2 py-1"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span>~</span>
          <input
            type="date"
            className="flex-1 border rounded px-2 py-1"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div className="flex gap-2 mt-2">
          {[1, 3, 7, 15].map((d) => (
            <button
              key={d}
              onClick={() => quickRange(d)}
              className="flex-1 py-1.5 rounded-full border text-sm bg-gray-100"
            >
              {d}일
            </button>
          ))}
        </div>
      </div>

      {/* 리스트 */}
      <div className="px-3 py-3 space-y-3">
        {orders.map((o) => (
          <div
            key={o.id}
            onClick={() => onSelect && onSelect(o)}
            className="cursor-pointer"
          >
            <MobileOrderCard order={o} />
          </div>
        ))}

        {orders.length === 0 && (
          <div className="py-10 text-center text-gray-400 text-sm">
            조회된 배차내역이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function MobileOrderCard({ order }) {
  const claim = getClaim(order);
  const sanjae = getSanjae(order);

  const state = order.배차상태 || order.상태 || "배차전";

  const stateColor =
    state === "배차완료"
      ? "bg-green-100 text-green-700 border-green-300"
      : state === "배차취소"
      ? "bg-red-100 text-red-700 border-red-300"
      : "bg-gray-100 text-gray-700 border-gray-200";

  const 상차일시 =
    order.상차일시 ||
    `${order.상차일 || ""} ${order.상차시간 || ""}`.trim();
  const 하차일시 =
    order.하차일시 ||
    `${order.하차일 || ""} ${order.하차시간 || ""}`.trim();

  return (
    <div className="bg-white rounded-xl shadow-sm px-4 py-3 border active:scale-[0.99] transition">
      <div className="flex justify-between items-start mb-1">
        <div className="text-sm font-semibold text-blue-600">
          {order.상차지명}
        </div>
        <span
          className={`px-2 py-0.5 text-xs rounded-full border ${stateColor}`}
        >
          {state}
        </span>
      </div>

      <div className="text-sm text-gray-800">{order.하차지명}</div>

      <div className="text-xs text-gray-500 mt-1">
        {상차일시} ~ {하차일시}
      </div>

      <div className="flex justify-between items-center mt-2 text-sm">
        <div>청구 {fmt(claim)}</div>
        {order.차량톤수 || order.톤수 ? (
          <span className="text-xs px-2 py-0.5 bg-gray-50 border rounded-full">
            {(order.차량톤수 || order.톤수)}/{order.차량종류 || order.차종}
          </span>
        ) : null}
      </div>

      <div className="text-xs text-gray-500 mt-1">
        산재보험료 {fmt(sanjae)}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   상세보기 (지도 / 카톡공유 / 기사배차)
--------------------------------------------------------------------- */
function MobileOrderDetail({ order, drivers, onAssignDriver, onCancelAssign }) {
  const [carNo, setCarNo] = useState(order.차량번호 || "");
  const [name, setName] = useState(order.기사명 || "");
  const [phone, setPhone] = useState(order.전화번호 || "");

  useEffect(() => {
    // 차량번호 변경 시 기존 기사 자동 매칭
    const norm = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();
    const d = drivers.find((dr) => norm(dr.차량번호) === norm(carNo));
    if (d) {
      setName(d.이름 || "");
      setPhone(d.전화번호 || "");
    }
  }, [carNo, drivers]);

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
  const driverFare = order.기사운임 ?? 0;
  const fee = order.수수료 ?? claim - driverFare;

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
    onAssignDriver({ 차량번호: carNo, 이름: name, 전화번호: phone });
  };

  return (
    <div className="px-4 py-3 space-y-4">
      {/* 기본 정보 카드 */}
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

        {/* 날짜/시간 */}
        <div className="text-xs text-gray-500 mb-1">
          상차일시: {상차일시 || "-"}
        </div>
        <div className="text-xs text-gray-500 mb-2">
          하차일시: {하차일시 || "-"}
        </div>

        {/* 화물내용 / 톤수 / 차량종류 */}
        <div className="text-xs text-gray-700 mb-1">
          화물내용:{" "}
          {order.화물내용 || order.화물중량 || "-"}
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-gray-700 mb-3">
          {(order.차량톤수 || order.톤수) && (
            <span className="border rounded-full px-2 py-0.5 bg-gray-50">
              톤수: {order.차량톤수 || order.톤수}
            </span>
          )}
          {(order.차량종류 || order.차종) && (
            <span className="border rounded-full px-2 py-0.5 bg-gray-50">
              차량종류: {order.차량종류 || order.차종}
            </span>
          )}
        </div>

        {/* 금액들 */}
        <div className="flex items-center gap-2 text-sm mb-1">
          <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-xs">
            청구운임
          </span>
          <span className="font-semibold">{fmt(claim)}</span>
        </div>

        <div className="flex items-center gap-2 text-sm mb-1">
          <span className="px-2 py-0.5 rounded-full bg-sky-200 text-sky-900 text-xs">
            기사운임
          </span>
          <span className="font-semibold">{fmt(driverFare)}</span>
        </div>

        <div className="flex items-center gap-2 text-sm mb-1">
          <span className="px-2 py-0.5 rounded-full bg-orange-200 text-orange-900 text-xs">
            수수료
          </span>
          <span className="font-semibold">{fmt(fee)}</span>
        </div>

        <div className="flex items-center gap-2 text-sm mb-2">
          <span className="px-2 py-0.5 rounded-full bg-green-600 text-white text-xs">
            산재보험료
          </span>
          <span className="font-semibold">{fmt(sanjae)}</span>
        </div>
      </div>

      {/* 지도 보기 */}
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
                : "text-gray-700"
            }
          >
            {state}
          </span>
          {order.기사명 && (
            <>
              {" / "}기사: {order.기사명} ({order.차량번호})
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

        {state === "배차완료" && (
          <button
            onClick={onCancelAssign}
            className="w-full py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold mt-1"
          >
            배차 취소하기
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   등록 폼
--------------------------------------------------------------------- */
function MobileOrderForm({ form, setForm, clients, onSave }) {
  const update = (key, value) => setForm((p) => ({ ...p, [key]: value }));

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

  // 🔹 거래처 / 상하차 자동완성용
  const [queryPickup, setQueryPickup] = useState("");
  const [queryDrop, setQueryDrop] = useState("");
  const [showPickupList, setShowPickupList] = useState(false);
  const [showDropList, setShowDropList] = useState(false);

  const norm = (s = "") => String(s).toLowerCase().replace(/\s+/g, "");

  const pickupOptions = useMemo(() => {
    if (!queryPickup) return [];
    return clients
      .filter((c) => norm(c.거래처명 || "").includes(norm(queryPickup)))
      .slice(0, 10);
  }, [clients, queryPickup]);

  const dropOptions = useMemo(() => {
    if (!queryDrop) return [];
    return clients
      .filter((c) => norm(c.거래처명 || "").includes(norm(queryDrop)))
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
          <div className="text-xs text-gray-500 mb-1">총운임(청구운임)</div>
          <div className="text-base font-semibold">{fmt(form.청구운임)}</div>
        </div>
        <div className="px-3 py-2">
          <div className="text-xs text-gray-500 mb-1">산재보험료</div>
          <input
            className="w-full border rounded px-2 py-1 text-right text-sm"
            value={form.산재보험료 || ""}
            onChange={(e) => updateMoney("산재보험료", e.target.value)}
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
                onFocus={() => form.상차지명 && setShowPickupList(true)}
              />
              <input
                className="w-full border rounded px-2 py-1 text-xs text-gray-700"
                placeholder="상차지 주소"
                value={form.상차지주소}
                onChange={(e) => update("상차지주소", e.target.value)}
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
                onFocus={() => form.하차지명 && setShowDropList(true)}
              />
              <input
                className="w-full border rounded px-2 py-1 text-xs text-gray-700"
                placeholder="하차지 주소"
                value={form.하차지주소}
                onChange={(e) => update("하차지주소", e.target.value)}
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

      {/* 톤수 / 차종 / 중량  → grid로 해서 안 넘치게 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="톤수 / 차종 / 중량"
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
                placeholder="중량/화물내용"
                value={form.화물중량}
                onChange={(e) => update("화물중량", e.target.value)}
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

      {/* 지급방식 / 배차방식 */}
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
      </div>

      {/* 청구/기사/수수료 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="청구운임"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-right text-sm"
              value={form.청구운임 || ""}
              onChange={(e) => updateMoney("청구운임", e.target.value)}
            />
          }
        />
        <RowLabelInput
          label="기사운임"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-right text-sm"
              value={form.기사운임 || ""}
              onChange={(e) => updateMoney("기사운임", e.target.value)}
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
        <button
          onClick={onSave}
          className="w-full py-3 rounded-lg bg-blue-500 text-white text-base font-semibold shadow"
        >
          등록하기
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   RowLabelInput
--------------------------------------------------------------------- */
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
