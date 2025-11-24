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
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";

// 🔹 도로명주소 → 행정동 변환용 (국가주소검색 API)
//    👉 반드시 실제 키로 교체해서 사용하세요.
const JUSO_API_KEY = "YOUR_JUSO_API_KEY_HERE"; // TODO: 여기에 실제 발급 키 입력

// 🔹 주소 캐시 (같은 주소 여러 번 호출 시 중복 요청 방지)
const addrCache = new Map();

// 🔹 주소 → "시/군/구 동" 으로 변환 시도
async function fetchDongFromJuso(rawAddr) {
  if (!rawAddr) return "";
  if (!JUSO_API_KEY || JUSO_API_KEY === "YOUR_JUSO_API_KEY_HERE") {
    // 키가 없으면 그냥 원본 주소 반환
    return rawAddr;
  }

  if (addrCache.has(rawAddr)) {
    return addrCache.get(rawAddr);
  }

  try {
    const url =
      "https://www.juso.go.kr/addrlink/addrLinkApi.do" +
      `?currentPage=1&countPerPage=1&keyword=${encodeURIComponent(
        rawAddr
      )}&confmKey=${JUSO_API_KEY}&resultType=json`;
    const res = await fetch(url);
    const data = await res.json();
    const juso = data?.results?.juso?.[0];
    if (!juso) {
      addrCache.set(rawAddr, rawAddr);
      return rawAddr;
    }

    // 지번주소 또는 도로명주소에서 "시도 시군구 동"까지만 파싱
    const baseAddr = juso.jibunAddr || juso.roadAddr || rawAddr;
    const parts = String(baseAddr).split(" ");
    // 예: ["인천광역시","서구","원창동","123-4"]
    if (parts.length >= 3) {
      const short = `${parts[0].replace("광역시", "")} ${parts[1]} ${
        parts[2]
      }`;
      addrCache.set(rawAddr, short);
      return short;
    }

    addrCache.set(rawAddr, rawAddr);
    return rawAddr;
  } catch (e) {
    console.error("주소 변환 오류:", e);
    return rawAddr;
  }
}

// 🔹 상/하차방법 약어
const METHOD_SHORT_MAP = {
  지게차: "지",
  수작업: "수",
  직접수작업: "직수",
  수도움: "수도움",
};

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
const getClaim = (o = {}) => o.청구운임 ?? o.인수증 ?? 0;

// 🔹 공통: 산재보험료
const getSanjae = (o = {}) => o.산재보험료 ?? 0;

// 🔹 공통: 상대 날짜 라벨 (당상/낼상/날짜, 당착/낼착/날짜)
function getRelativeDateLabel(dateStr, type /* "상" | "착" */) {
  if (!dateStr) return "-";
  const onlyDate = String(dateStr).slice(0, 10);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  if (onlyDate === todayStr) {
    return type === "상" ? "당상" : "당착";
  }
  if (onlyDate === tomorrowStr) {
    return type === "상" ? "낼상" : "낼착";
  }

  // 그 외는 MM-DD 로 표시
  return onlyDate.slice(5);
}

// 🔹 공통: 혼적/독차 텍스트
function getLoadType(order = {}) {
  const isMixed = order.혼적여부 || order.혼적;
  const isFull =
    order.독차여부 !== undefined
      ? order.독차여부
      : !isMixed; // 아무 값 없으면 독차

  return isMixed ? "혼적" : isFull ? "독차" : "독차";
}

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
    lines.push(`[화물] ${order.화물내용 || order.화물중량 || ""}`);
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
  // page: list | form | detail | fare | status | unassigned
  const [page, setPage] = useState("list");
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
    독차: false,
    혼적: false,
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

  const unassignedOrders = useMemo(
    () =>
      filteredOrders.filter(
        (o) => (o.배차상태 || o.상태 || "배차전") === "배차전"
      ),
    [filteredOrders]
  );

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

    const isMixed = !!form.혼적;
    const isFull = form.독차 || (!form.혼적 && !form.독차);

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

      // 혼적/독차
      혼적여부: isMixed,
      독차여부: isFull,

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
      독차: false,
      혼적: false,
    });

    setPage("list");
  };

  // --------------------------------------------------
  // 6. 기사 배차 / 배차취소 / 배차삭제
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

  const deleteDispatch = async () => {
    if (!selectedOrder) return;
    if (
      !window.confirm(
        "정말 이 배차를 완전히 삭제하시겠습니까? (복구 불가)"
      )
    )
      return;

    await deleteDoc(doc(db, "dispatch", selectedOrder.id));
    setSelectedOrder(null);
    setPage("list");
    alert("배차가 삭제되었습니다.");
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const title =
    page === "list"
      ? "등록내역"
      : page === "form"
      ? "화물등록"
      : page === "detail"
      ? "상세보기"
      : page === "fare"
      ? "표준운임표"
      : page === "status"
      ? "배차현황"
      : page === "unassigned"
      ? "미배차현황"
      : "";

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
        {(page === "list" || page === "status") && (
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

        {page === "unassigned" && (
          <MobileOrderList
            orders={unassignedOrders}
            statusTab={statusTab}
            setStatusTab={setStatusTab}
            startDate={startDate}
            endDate={endDate}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            quickRange={quickRange}
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
            onDelete={deleteDispatch}
          />
        )}

        {page === "fare" && (
          <MobileStandardFare
            orders={orders}
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

          <MenuSection title="배차/운임">
            <MenuItem label="배차현황" onClick={onGoStatus} />
            <MenuItem label="미배차현황" onClick={onGoUnassigned} />
            <MenuItem label="표준운임표" onClick={onGoFare} />
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
  const loadTypeText = getLoadType(order);

  const state = order.배차상태 || order.상태 || "배차전";

  const 상차일시 =
    order.상차일시 ||
    `${order.상차일 || ""} ${order.상차시간 || ""}`.trim();
  const 하차일시 =
    order.하차일시 ||
    `${order.하차일 || ""} ${order.하차시간 || ""}`.trim();

  const pickupLabel = getRelativeDateLabel(order.상차일, "상");
  const dropLabel = getRelativeDateLabel(order.하차일, "착");

  const pickupMethodShort = METHOD_SHORT_MAP[order.상차방법] || "";
  const dropMethodShort = METHOD_SHORT_MAP[order.하차방법] || "";

  const tonText = order.차량톤수 || order.톤수 || "";
  const payTypeText = order.지급방식 || "";
  const cargoText =
    order.화물내용 || order.화물중량 || order.차량종류 || order.차종 || "";

  const [pickupShortAddr, setPickupShortAddr] = useState(
    order.상차지주소 || ""
  );
  const [dropShortAddr, setDropShortAddr] = useState(order.하차지주소 || "");

  useEffect(() => {
    let ignore = false;

    async function run() {
      if (order.상차지주소) {
        const s = await fetchDongFromJuso(order.상차지주소);
        if (!ignore) setPickupShortAddr(s);
      } else {
        setPickupShortAddr("");
      }

      if (order.하차지주소) {
        const s2 = await fetchDongFromJuso(order.하차지주소);
        if (!ignore) setDropShortAddr(s2);
      } else {
        setDropShortAddr("");
      }
    }

    run();
    return () => {
      ignore = true;
    };
  }, [order.상차지주소, order.하차지주소]);

  return (
    <div className="bg-white rounded-xl shadow-sm px-4 py-3 border active:scale-[0.99] transition">
      {/* 거래처명 */}
      <div className="text-xs text-gray-400 mb-1">
        {order.거래처명 || "-"}
      </div>

      {/* 상차/하차 + 주소(동) */}
      <div className="flex justify-between text-sm">
        <div className="mr-2">
          <div>
            <span className="text-gray-500 mr-1">상차</span>
            <span className="font-semibold">{order.상차지명 || "-"}</span>
          </div>
          <div className="text-xs text-gray-500">
            {pickupShortAddr || order.상차지주소 || ""}
          </div>
        </div>
        <div className="text-right ml-2">
          <div>
            <span className="text-gray-500 mr-1">하차</span>
            <span className="font-semibold">{order.하차지명 || "-"}</span>
          </div>
          <div className="text-xs text-gray-500">
            {dropShortAddr || order.하차지주소 || ""}
          </div>
        </div>
      </div>

      {/* 당상/당착/낼상/낼착 + 상/하차방법 약어 */}
      <div className="flex justify-between items-center mt-1 text-xs text-gray-700">
        <div>
          <span className="font-semibold mr-1">{pickupLabel}</span>
          {pickupMethodShort && (
            <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
              {pickupMethodShort}
            </span>
          )}
        </div>
        <div>
          <span className="font-semibold mr-1">{dropLabel}</span>
          {dropMethodShort && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
              {dropMethodShort}
            </span>
          )}
        </div>
      </div>

      {/* 상하차 날짜/시간 */}
      <div className="text-xs text-gray-500 mt-1">
        {상차일시 || "-"} ~ {하차일시 || "-"}
      </div>

      {/* 청구/독차+지급방식/톤/화물 */}
      <div className="mt-2 text-sm">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-gray-600 mr-1">청구</span>
            <span className="font-semibold">{fmt(claim)}</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full border bg-gray-50 text-gray-700">
            {state}
          </span>
        </div>

        <div className="mt-1 text-xs text-gray-800">
          {loadTypeText} {payTypeText && `${payTypeText} `}
/{" "}
          {tonText || "-"} / {cargoText || "-"}
        </div>
      </div>

      {/* 산재보험료 */}
      <div className="text-xs text-gray-500 mt-1">
        산재보험료 {fmt(sanjae)}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   상세보기 (지도 / 카톡공유 / 기사배차 / 삭제)
--------------------------------------------------------------------- */
function MobileOrderDetail({
  order,
  drivers,
  onAssignDriver,
  onCancelAssign,
  onDelete,
}) {
  const [carNo, setCarNo] = useState(order.차량번호 || "");
  const [name, setName] = useState(order.기사명 || "");
  const [phone, setPhone] = useState(order.전화번호 || "");
  const [showDriverModal, setShowDriverModal] = useState(false);

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

    const norm = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();
    const d = drivers.find((dr) => norm(dr.차량번호) === norm(carNo));

    // 기존 기사 있으면 바로 배차
    if (d) {
      onAssignDriver({
        차량번호: d.차량번호,
        이름: d.이름,
        전화번호: d.전화번호,
      });
      return;
    }

    // 기존 기사 없으면 신규등록 모달 열기
    setShowDriverModal(true);
  };

  const handleConfirmNewDriver = () => {
    if (!name) {
      alert("기사 이름을 입력해주세요.");
      return;
    }
    if (!phone) {
      alert("기사 연락처를 입력해주세요.");
      return;
    }
    onAssignDriver({ 차량번호: carNo, 이름: name, 전화번호: phone });
    setShowDriverModal(false);
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
          화물내용: {order.화물내용 || order.화물중량 || "-"}
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

        {/* 배차 삭제 */}
        <button
          onClick={onDelete}
          className="w-full py-2 rounded-lg bg-red-500 text-white text-sm font-semibold mt-2"
        >
          배차 삭제하기
        </button>
      </div>

      {/* 신규 기사 등록 모달 */}
      {showDriverModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-11/12 max-w-sm p-4">
            <div className="flex justify-between items-center mb-2">
              <div className="font-semibold text-sm">신규 기사 등록</div>
              <button
                className="text-gray-400 text-lg"
                onClick={() => setShowDriverModal(false)}
              >
                ×
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <input
                className="w-full border rounded px-2 py-1"
                value={carNo}
                onChange={(e) => setCarNo(e.target.value)}
                placeholder="차량번호"
              />
              <input
                className="w-full border rounded px-2 py-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="기사 이름"
              />
              <input
                className="w-full border rounded px-2 py-1"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="기사 연락처"
              />
            </div>

            <button
              onClick={handleConfirmNewDriver}
              className="w-full mt-3 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold"
            >
              등록 후 배차하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   모바일 표준운임표 (최근 데이터 기반 간단 통계)
--------------------------------------------------------------------- */
function MobileStandardFare({ orders }) {
  // 상차/하차/톤수/차량종류 기준 평균 운임
  const rows = useMemo(() => {
    const map = new Map();
    (orders || []).forEach((o) => {
      const from = o.상차지명 || "";
      const to = o.하차지명 || "";
      const ton = o.차량톤수 || o.톤수 || "";
      const car = o.차량종류 || o.차종 || "";
      const claim = getClaim(o);
      if (!from || !to || !claim) return;
      const key = [from, to, ton, car].join("|");
      const prev = map.get(key) || {
        from,
        to,
        ton,
        car,
        total: 0,
        count: 0,
      };
      prev.total += claim;
      prev.count += 1;
      map.set(key, prev);
    });

    return Array.from(map.values())
      .map((r) => ({
        ...r,
        avg: Math.round(r.total / r.count),
      }))
      .sort((a, b) => b.avg - a.avg);
  }, [orders]);

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="text-sm text-gray-600 mb-2">
        최근 배차 데이터를 기반으로 상/하차지 + 톤수 + 차량종류별 평균 운임을
        보여줍니다.
      </div>

      {rows.length === 0 && (
        <div className="text-center text-gray-400 text-sm py-10">
          아직 표준운임을 계산할 수 있는 데이터가 없습니다.
        </div>
      )}

      {rows.map((r, idx) => (
        <div
          key={`${r.from}-${r.to}-${r.ton}-${r.car}-${idx}`}
          className="bg-white border rounded-xl px-4 py-3 shadow-sm text-sm"
        >
          <div className="flex justify-between items-center mb-1">
            <div className="font-semibold">
              {r.from} → {r.to}
            </div>
            <div className="text-xs text-gray-400">{r.count}건</div>
          </div>
          <div className="text-xs text-gray-600 mb-1">
            {r.ton && `${r.ton} `}
            {r.car}
          </div>
          <div className="text-sm">
            평균 운임:{" "}
            <span className="font-semibold">
              {fmt(r.avg).replace("원", "")}원
            </span>
          </div>
        </div>
      ))}
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

  const toggleDokcha = () =>
    setForm((p) => ({ ...p, 독차: !p.독차 }));
  const toggleHonjeok = () =>
    setForm((p) => ({ ...p, 혼적: !p.혼적 }));

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

      {/* 독차 / 혼적 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="독차 / 혼적"
          input={
            <div className="flex gap-4 items-center text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={!!form.독차}
                  onChange={toggleDokcha}
                />
                <span>독차</span>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={!!form.혼적}
                  onChange={toggleHonjeok}
                />
                <span>혼적</span>
              </label>
              <div className="text-[11px] text-gray-400">
                둘 다 해제 시 독차로 간주
              </div>
            </div>
          }
        />
      </div>

      {/* 톤수 / 차종 / 중량  → grid */}
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
                <option value="인수증">인수증</option>
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
