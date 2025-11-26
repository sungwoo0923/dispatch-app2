// ======================= src/mobile/MobileApp.jsx (PART 1/10) =======================
import React, { useState, useMemo, useEffect } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
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

// 상태 → 배차중/배차완료만 유지 (배차전 없음)
const getStatus = (form) =>
  form.차량번호 ? "배차완료" : "배차중";

// 상차일 기준 날짜 뽑기
const getPickupDate = (o = {}) => {
  if (o.상차일) return String(o.상차일).slice(0, 10);
  if (o.상차일시) return String(o.상차일시).slice(0, 10);
  if (o.등록일) return String(o.등록일).slice(0, 10);
  return "";
};

// 날짜 헤더
const weekday = ["일", "월", "화", "수", "목", "금", "토"];
const formatDateHeader = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
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

// 시간만
const onlyTime = (dt = "") => {
  const s = String(dt).trim();
  const parts = s.split(" ");
  return parts[1] || "";
};

const shortAddr = (addr = "") => {
  const parts = String(addr).split(/\s+/);
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
  if (parts.length === 1) return parts[0];
  return "";
};

/* -------------------------------------------------------------
   공유메시지 생성
------------------------------------------------------------- */
function buildKakaoMessage(order) {
  const lines = [];

  lines.push(`상차일시: ${(order.상차일 || "")} ${(order.상차시간 || "")}`.trim());
  lines.push(`하차일시: ${(order.하차일 || "")} ${(order.하차시간 || "")}`.trim());

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

  const claim = order.청구운임 || 0;
  const fee = order.기사운임 || 0;
  lines.push(`청구운임: ${fmtMoney(claim)}`);
  lines.push(`기사운임: ${fmtMoney(fee)}`);
  lines.push(`수수료: ${fmtMoney(claim - fee)}`);

  if (order.메모) {
    lines.push("");
    lines.push(`[비고] ${order.메모}`);
  }

  return lines.join("\n");
}

/* -------------------------------------------------------------
   메인 컴포넌트
------------------------------------------------------------- */
export default function MobileApp() {
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [clients, setClients] = useState([]);

  const [toast, setToast] = useState("");
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  // Firestore 실시간 연동
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "dispatch"), (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      list.sort((a, b) =>
        (getPickupDate(b) || "").localeCompare(getPickupDate(a) || "")
      );
      setOrders(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "drivers"), (snap) => {
      setDrivers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "clients"), (snap) => {
      setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const [page, setPage] = useState("list");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusTab, setStatusTab] = useState("전체");
  const [showMenu, setShowMenu] = useState(false);

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [assignFilter, setAssignFilter] = useState("");
  const [searchType, setSearchType] = useState("거래처명");
  const [searchText, setSearchText] = useState("");

  /* -------------------------------------------------------------
     등록 Form 초기값
  ------------------------------------------------------------- */
  const initialForm = {
    거래처명: "",
    상차일: "",
    상차시간: "",
    하차일: "",
    하차시간: "",
    상차지명: "",
    상차지주소: "",
    하차지명: "",
    하차지주소: "",
    차량번호: "",
    기사명: "",
    전화번호: "",
    톤수: "",
    차종: "",
    화물내용: "",
    지급방식: "",
    배차방식: "",
    청구운임: 0,
    기사운임: 0,
    수수료: 0,
    혼적여부: "독차",
    메모: "",
    _editId: null,
    _returnToDetail: false,
  };

  const [form, setForm] = useState(initialForm);
// ======================= src/mobile/MobileApp.jsx (PART 2/10) =======================

  /* -------------------------------------------------------------
     필터 + 그룹핑
  ------------------------------------------------------------- */
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const state = o.배차상태 || o.상태 || "배차중"; // 배차전 제거 완료

      if (statusTab !== "전체" && state !== statusTab) return false;
      if (assignFilter && state !== assignFilter) return false;

      const carType = String(o.차량종류 || o.차종 || "").toLowerCase().trim();
      if (vehicleFilter && !carType.includes(vehicleFilter.toLowerCase()))
        return false;

      const d = getPickupDate(o);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;

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

  // 날짜 그룹핑
  const groupedByDate = useMemo(() => {
    const map = new Map();
    filteredOrders.forEach((o) => {
      const d = getPickupDate(o) || "미정";
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(o);
    });
    return map;
  }, [filteredOrders]);

  // 미배차 (차량번호 없는 경우)
  const unassignedOrders = useMemo(() => {
    return filteredOrders.filter(
      (o) => !o.차량번호 || String(o.차량번호).trim() === ""
    );
  }, [filteredOrders]);

  // 날짜 퀵 적용
  const quickRange = (days) => {
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (days - 1)
    )
      .toISOString()
      .slice(0, 10);
    const end = todayStr();
    setStartDate(start);
    setEndDate(end);
  };

  /* -------------------------------------------------------------
     저장(중복생성 완전 제거) / 수정
  ------------------------------------------------------------- */
  const handleSave = async () => {
    if (!form.상차지명 || !form.하차지명) {
      alert("상차지 / 하차지는 필수입니다.");
      return;
    }

    const isEdit = !!form._editId;

    const 청구 = toNumber(form.청구운임);
    const 기사 = toNumber(form.기사운임);
    const 수수료 = 청구 - 기사;

    const docData = {
      거래처명: form.거래처명 || "",
      상차지명: form.상차지명,
      상차지주소: form.상차지주소 || "",
      하차지명: form.하차지명,
      하차지주소: form.하차지주소 || "",
      화물내용: form.화물내용 || "",
      상차일: form.상차일 || "",
      상차시간: form.상차시간 || "",
      하차일: form.하차일 || "",
      하차시간: form.하차시간 || "",
      차량번호: form.차량번호 || "",
      기사명: form.기사명 || "",
      전화번호: form.전화번호 || "",
      차량종류: form.차종 || "",
      차량톤수: form.톤수 || "",
      혼적여부: form.혼적여부 || "독차",
      지급방식: form.지급방식 || "",
      배차방식: form.배차방식 || "",
      메모: form.메모 || "",
      청구운임: 청구,
      기사운임: 기사,
      수수료,
      상태: getStatus(form),
      배차상태: getStatus(form),
    };

    // ✨ 수정
    if (isEdit) {
      await updateDoc(doc(db, "dispatch", form._editId), {
        ...docData,
        updatedAt: serverTimestamp(),
      });

      showToast("수정되었습니다.");
      setSelectedOrder({ id: form._editId, ...docData });
      setPage("detail");
      return;
    }

    // ✨ 신규 저장 (중복 생성 제거!)
    const newId = crypto.randomUUID();
    await setDoc(doc(db, "dispatch", newId), {
      ...docData,
      등록일: todayStr(),
      createdAt: serverTimestamp(),
    });

    showToast("등록 완료");
    setPage("list");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* -------------------------------------------------------------
     기사 등록/업데이트(자동)
  ------------------------------------------------------------- */
  const upsertDriver = async ({ 차량번호, 이름, 전화번호 }) => {
    if (!차량번호) return;
    const norm = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();

    const exist = drivers.find(
      (d) => norm(d.차량번호) === norm(차량번호)
    );

    if (exist) {
      await updateDoc(doc(db, "drivers", exist.id), {
        차량번호,
        이름: 이름 || "",
        전화번호: 전화번호 || "",
        updatedAt: serverTimestamp(),
      });
      return exist.id;
    }

    const ref = await addDoc(collection(db, "drivers"), {
      차량번호,
      이름: 이름 || "",
      전화번호: 전화번호 || "",
      createdAt: serverTimestamp(),
    });

    return ref.id;
  };
// ======================= src/mobile/MobileApp.jsx (PART 3/10) =======================

  /* -------------------------------------------------------------
     배차 / 배차취소 / 오더삭제 — PC와 데이터 100% 동일하게 반영
  ------------------------------------------------------------- */

  // 기사 배차
  const assignDriver = async ({ 차량번호, 이름, 전화번호 }) => {
    if (!selectedOrder) return;

    const norm = (s = "") =>
      String(s).replace(/\s+/g, "").toLowerCase();

    let driver = drivers.find(
      (d) => norm(d.차량번호) === norm(차량번호)
    );

    // 기사 없으면 자동 신규등록
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

    await updateDoc(doc(db, "dispatch", selectedOrder.id), {
      배차상태: "배차완료",
      상태: "배차완료",
      기사명: driver.이름,
      차량번호: driver.차량번호,
      전화번호: driver.전화번호,
      updatedAt: serverTimestamp(),
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

    showToast(`배차완료: ${driver.이름} (${driver.차량번호})`);
  };

  // 배차 취소 → 상태를 배차중으로
  const cancelAssign = async () => {
    if (!selectedOrder) return;

    await updateDoc(doc(db, "dispatch", selectedOrder.id), {
      배차상태: "배차중",
      상태: "배차중",
      기사명: "",
      차량번호: "",
      전화번호: "",
      updatedAt: serverTimestamp(),
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

    showToast("배차 취소되었습니다.");
  };

  // 오더 삭제 — 진짜 삭제
  const cancelOrder = async () => {
    if (!selectedOrder) return;
    if (!window.confirm("해당 오더를 삭제하시겠습니까?")) return;

    await deleteDoc(doc(db, "dispatch", selectedOrder.id));
    setSelectedOrder(null);
    setPage("list");
    showToast("삭제 완료");
  };

  /* -------------------------------------------------------------
     페이지/헤더 제어
  ------------------------------------------------------------- */

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

  const handleRefresh = () => window.location.reload();

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col relative">
      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black text-white px-4 py-2 rounded-lg text-sm shadow-lg z-[9999]"
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
            setForm(blankForm);
            setSelectedOrder(null);
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

      {/* Body */}
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

        {page === "fare" && <MobileStandardFare onBack={() => setPage("list")} />}
        {page === "status" && (
          <MobileStatusTable title="배차현황" orders={filteredOrders} onBack={() => setPage("list")} />
        )}
        {page === "unassigned" && (
          <MobileStatusTable title="미배차현황" orders={unassignedOrders} onBack={() => setPage("list")} />
        )}
      </div>

      {page === "list" && !showMenu && (
        <button
          onClick={() => {
            setForm(blankForm);
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
// ======================= src/mobile/MobileApp.jsx (PART 3/10) =======================

  /* -------------------------------------------------------------
     배차 / 배차취소 / 오더삭제 — PC와 데이터 100% 동일하게 반영
  ------------------------------------------------------------- */

  // 기사 배차
  const assignDriver = async ({ 차량번호, 이름, 전화번호 }) => {
    if (!selectedOrder) return;

    const norm = (s = "") =>
      String(s).replace(/\s+/g, "").toLowerCase();

    let driver = drivers.find(
      (d) => norm(d.차량번호) === norm(차량번호)
    );

    // 기사 없으면 자동 신규등록
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

    await updateDoc(doc(db, "dispatch", selectedOrder.id), {
      배차상태: "배차완료",
      상태: "배차완료",
      기사명: driver.이름,
      차량번호: driver.차량번호,
      전화번호: driver.전화번호,
      updatedAt: serverTimestamp(),
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

    showToast(`배차완료: ${driver.이름} (${driver.차량번호})`);
  };

  // 배차 취소 → 상태를 배차중으로
  const cancelAssign = async () => {
    if (!selectedOrder) return;

    await updateDoc(doc(db, "dispatch", selectedOrder.id), {
      배차상태: "배차중",
      상태: "배차중",
      기사명: "",
      차량번호: "",
      전화번호: "",
      updatedAt: serverTimestamp(),
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

    showToast("배차 취소되었습니다.");
  };

  // 오더 삭제 — 진짜 삭제
  const cancelOrder = async () => {
    if (!selectedOrder) return;
    if (!window.confirm("해당 오더를 삭제하시겠습니까?")) return;

    await deleteDoc(doc(db, "dispatch", selectedOrder.id));
    setSelectedOrder(null);
    setPage("list");
    showToast("삭제 완료");
  };

  /* -------------------------------------------------------------
     페이지/헤더 제어
  ------------------------------------------------------------- */

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

  const handleRefresh = () => window.location.reload();

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col relative">
      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black text-white px-4 py-2 rounded-lg text-sm shadow-lg z-[9999]"
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
            setForm(blankForm);
            setSelectedOrder(null);
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

      {/* Body */}
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

        {page === "fare" && <MobileStandardFare onBack={() => setPage("list")} />}
        {page === "status" && (
          <MobileStatusTable title="배차현황" orders={filteredOrders} onBack={() => setPage("list")} />
        )}
        {page === "unassigned" && (
          <MobileStatusTable title="미배차현황" orders={unassignedOrders} onBack={() => setPage("list")} />
        )}
      </div>

      {page === "list" && !showMenu && (
        <button
          onClick={() => {
            setForm(blankForm);
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
// ======================= src/mobile/MobileApp.jsx (PART 5/10) =======================
//
// 카드 표시 관련 함수들
//

// 카드 날짜 상태: 당상/당착/낼상/낼착/MM/DD 형식
function getDayStatusForCard(dateStr, type) {
  if (!dateStr) return "";
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return "";

  const today = new Date();
  const t0 = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const n0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((t0 - n0) / (1000 * 60 * 60 * 24));

  if (diff === 0) return type === "pickup" ? "당상" : "당착";
  if (diff === 1) return type === "pickup" ? "낼상" : "낼착";

  const m = String(target.getMonth() + 1).padStart(2, "0");
  const d = String(target.getDate()).padStart(2, "0");
  return `${m}/${d}`;
}

// 작업 코드 (지: 지게차 / 수: 수작업 / 직수 / 수도)
function methodCode(v) {
  if (!v) return "";
  if (/지게|지입|지/.test(v)) return "지"; // 주황
  if (/수작업|수 /.test(v)) return "수"; // 노란
  if (/직수/.test(v)) return "직수"; // 별도
  if (/수도/.test(v)) return "수도"; // 검정
  return "";
}

// 배차상태 표기 변환 (배차중만 표시, 배차전 제거)
function normalizeState(s) {
  if (!s) return "";
  if (s === "배차중") return "배차중";
  if (s === "배차완료") return "배차완료";
  return "배차중";
}

/* =============================================================
   📌 카드 하나 렌더링
============================================================= */
function MobileOrderCard({ order }) {
  const claim = getClaim(order);
  const fee = order.기사운임 ?? 0;

  const state = normalizeState(order.배차상태 || order.상태 || "배차중");

  const badgeClass =
    state === "배차완료"
      ? "border-green-500 text-green-600"
      : "border-gray-500 text-gray-600";

  const pickupStatus = getDayStatusForCard(order.상차일, "pickup");
  const dropStatus = getDayStatusForCard(order.하차일, "drop");

  const pickupCode = methodCode(order.상차방법);
  const dropCode = methodCode(order.하차방법);

  const pickupShort = shortAddr(order.상차지주소);
  const dropShort = shortAddr(order.하차지주소);

  const chips = [
    order.톤수 || order.차량톤수,
    order.차량종류 || order.차종,
    order.화물내용,
  ].filter(Boolean);

  return (
    <div className="bg-white rounded-2xl shadow px-4 py-3 border">
      {/* 거래처 */}
      <div className="text-[12px] text-gray-400 mb-1">
        {order.거래처명 || "-"}
      </div>

      {/* 상차/하차 + 상태 */}
      <div className="flex justify-between items-start">
        <div>
          <div className="text-[15px] font-bold text-blue-600">
            {order.상차지명}
            {pickupShort && (
              <span className="text-[11px] text-gray-500 ml-1">
                ({pickupShort})
              </span>
            )}
          </div>

          <div className="mt-1 text-[14px] text-gray-900 font-semibold">
            {order.하차지명}
            {dropShort && (
              <span className="text-[11px] text-gray-500 ml-1">
                ({dropShort})
              </span>
            )}
          </div>
        </div>

        <span
          className={`px-3 py-1 rounded-full border text-[11px] font-medium ${badgeClass}`}
        >
          {state}
        </span>
      </div>

      {/* 당상/당착 + 작업코드 줄 */}
      <div className="flex items-center gap-4 text-[11px] font-semibold mt-2">
        {(pickupStatus || pickupCode) && (
          <div className="flex items-center gap-1">
            {pickupStatus && (
              <span className="text-blue-500">{pickupStatus}</span>
            )}
            {pickupCode && (
              <span className="text-orange-500">{pickupCode}</span>
            )}
          </div>
        )}

        {(dropStatus || dropCode) && (
          <div className="flex items-center gap-1">
            {dropStatus && (
              <span className="text-blue-500">{dropStatus}</span>
            )}
            {dropCode && (
              <span className="text-orange-500">{dropCode}</span>
            )}
          </div>
        )}
      </div>

      {/* chips */}
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {chips.map((c, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 rounded-full border text-[10px] text-gray-700 bg-gray-50"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {/* 금액 */}
      <div className="flex justify-between items-center mt-3">
        <div className="text-[13px] font-bold text-gray-900">
          청구 {fmtMoney(claim)}
        </div>
        <div className="text-[13px] font-bold text-blue-600">
          기사 {fmtMoney(fee)}
        </div>
      </div>
    </div>
  );
}
// ======================= src/mobile/MobileApp.jsx (PART 6/10) =======================
//
// 상세보기 화면
//
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
    if (!carNo) return;
    const norm = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();
    const d = drivers.find((dr) => norm(dr.차량번호) === norm(carNo));
    if (d) {
      setName(d.이름 || "");
      setPhone(d.전화번호 || "");
    }
  }, [carNo, drivers]);

  // 차량번호 지우면 기사정보 초기화
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
    if (!addr) return alert("주소 정보 없음");
    window.open(`https://map.kakao.com/?q=${encodeURIComponent(addr)}`, "_blank");
  };

  const handleCopyKakao = async () => {
    const text = buildKakaoMessage(order);
    try {
      await navigator.clipboard.writeText(text);
      alert("카톡 공유 텍스트 복사 완료");
    } catch {
      alert("복사 오류 — 수동 복사해주세요");
    }
  };

  const state = order.배차상태 || order.상태 || "배차중";

  const claim = getClaim(order);
  const fee = order.기사운임 ?? 0;
  const sanjae = getSanjae(order);

  const pickupDT =
    order.상차일시 || `${order.상차일 || ""} ${order.상차시간 || ""}`.trim();
  const dropDT =
    order.하차일시 || `${order.하차일 || ""} ${order.하차시간 || ""}`.trim();

  const handleAssign = () => {
    if (!carNo) return alert("차량번호 필요");
    onAssignDriver({ 차량번호: carNo, 이름: name, 전화번호: phone });
  };

  return (
    <div className="px-4 py-3 space-y-4">
      {/* 기본 정보 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="text-xs text-gray-400 mb-1">{order.거래처명}</div>

            <div className="text-sm font-semibold text-blue-600">
              {order.상차지명}
            </div>
            {order.상차지주소 && (
              <div className="text-xs text-gray-500">{order.상차지주소}</div>
            )}

            <div className="mt-2 text-sm text-gray-800">{order.하차지명}</div>
            {order.하차지주소 && (
              <div className="text-xs text-gray-500">{order.하차지주소}</div>
            )}
          </div>

          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 border text-gray-700">
            {state}
          </span>
        </div>

        <div className="text-xs text-gray-500 mb-1">상차: {pickupDT || "-"}</div>
        <div className="text-xs text-gray-500 mb-2">하차: {dropDT || "-"}</div>

        <div className="flex flex-wrap gap-1 text-xs text-gray-700 mb-3">
          {order.차량톤수 && (
            <span className="border rounded-full px-2 py-0.5 bg-gray-50">
              {order.차량톤수}
            </span>
          )}
          {order.차량종류 && (
            <span className="border rounded-full px-2 py-0.5 bg-gray-50">
              {order.차량종류}
            </span>
          )}
          {order.화물내용 && (
            <span className="border rounded-full px-2 py-0.5 bg-gray-50">
              {order.화물내용}
            </span>
          )}
        </div>

        <div className="flex gap-4 text-sm mb-1">
          <span className="text-gray-600">청구</span>
          <span className="font-bold text-gray-900">{fmtMoney(claim)}</span>
        </div>

        <div className="flex gap-4 text-sm mb-1">
          <span className="text-gray-600">기사</span>
          <span className="font-bold text-blue-600">{fmtMoney(fee)}</span>
        </div>

        <div className="flex gap-4 text-sm mb-2">
          <span className="text-green-600 font-bold">산재보험료</span>
          <span className="font-semibold">{fmtMoney(sanjae)}</span>
        </div>
      </div>

      {/* 지도 버튼 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
        <div className="text-sm font-semibold mb-2">지도 보기</div>
        <div className="flex gap-2">
          <button
            onClick={() => openMap("pickup")}
            className="flex-1 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium"
          >
            상차지
          </button>
          <button
            onClick={() => openMap("drop")}
            className="flex-1 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium"
          >
            하차지
          </button>
        </div>
      </div>

      {/* 카카오 공유 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
        <div className="text-sm font-semibold mb-2">공유</div>
        <button
          onClick={handleCopyKakao}
          className="w-full py-2 rounded-lg bg-yellow-400 text-black text-sm font-semibold"
        >
          카톡 공유문구 복사
        </button>
      </div>

      {/* 기사 배차 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm space-y-3">
        <div className="text-sm font-semibold mb-1">기사 배차</div>

        <div className="text-xs text-gray-500 mb-1">
          현재:{" "}
          <span
            className={
              state === "배차완료"
                ? "text-green-600 font-bold"
                : "text-gray-700 font-bold"
            }
          >
            {state}
          </span>
          {order.기사명 && ` / ${order.기사명} (${order.차량번호})`}
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

        {/* 배차하기 */}
        <button
          onClick={handleAssign}
          className="w-full py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold"
        >
          배차완료 처리
        </button>

        {/* 배차중이면 배차취소 존재 X → 숨김 */}

        {/* 오더 삭제 */}
        <button
          onClick={onCancelOrder}
          className="w-full py-2 rounded-lg bg-red-100 text-red-700 text-sm font-semibold"
        >
          오더 삭제
        </button>
      </div>

      {/* 수정하기 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
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
              차종: order.차종 || order.차량종류 || "",
              톤수: order.톤수 || order.차량톤수 || "",
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
              기사명: order.기사명 || "",
              전화번호: order.전화번호 || "",
              혼적여부: order.혼적여부 || "독차",
              메모: order.메모 || "",
              _editId: order.id,
              _returnToDetail: true,
            });

            setSelectedOrder(order);
          }}
          className="w-full py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold"
        >
          수정하기
        </button>
      </div>
    </div>
  );
}
// ======================= src/mobile/MobileApp.jsx (PART 7/10) =======================
//
// 등록/수정 폼 화면
//
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
  const handleChange = (key, val) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const handleClientSelect = (name) => {
    handleChange("거래처명", name);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") onSave();
  };

  return (
    <div className="p-4 space-y-4">
      {/* 거래처명 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm space-y-2">
        <div className="text-sm font-semibold">거래처명</div>
        <input
          className="w-full border rounded px-3 py-1.5"
          placeholder="거래처명"
          value={form.거래처명 || ""}
          onChange={(e) => handleChange("거래처명", e.target.value)}
          onKeyDown={handleKeyPress}
        />

        {/* 기존 DB 자동완성 */}
        <div className="max-h-32 overflow-y-auto border rounded px-2 py-1 text-xs">
          {clients.map((c) => (
            <div
              key={c.id}
              className="cursor-pointer hover:bg-blue-50 px-2 py-1"
              onClick={() => handleClientSelect(c.거래처명 || c.이름 || "")}
            >
              {c.거래처명 || c.이름}
            </div>
          ))}
        </div>
      </div>

      {/* 상차 / 하차 정보 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border rounded-xl px-3 py-2 shadow-sm space-y-1.5">
          <div className="text-xs text-gray-500 font-medium">상차일</div>
          <input
            type="date"
            value={form.상차일 || ""}
            onChange={(e) => handleChange("상차일", e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs"
          />

          <div className="text-xs text-gray-500 font-medium">시간</div>
          <input
            type="time"
            value={form.상차시간 || ""}
            onChange={(e) => handleChange("상차시간", e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs"
          />

          <div className="text-xs text-gray-500 font-medium">상차지</div>
          <input
            value={form.상차지명 || ""}
            placeholder="상차지명"
            onChange={(e) => handleChange("상차지명", e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs"
          />

          <input
            value={form.상차지주소 || ""}
            placeholder="상차지 주소"
            onChange={(e) => handleChange("상차지주소", e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs"
          />

          <div className="text-xs text-gray-500 font-medium">방법</div>
          <input
            value={form.상차방법 || ""}
            placeholder="예: 지게차/수작업.."
            onChange={(e) => handleChange("상차방법", e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs"
          />
        </div>

        <div className="bg-white border rounded-xl px-3 py-2 shadow-sm space-y-1.5">
          <div className="text-xs text-gray-500 font-medium">하차일</div>
          <input
            type="date"
            value={form.하차일 || ""}
            onChange={(e) => handleChange("하차일", e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs"
          />

          <div className="text-xs text-gray-500 font-medium">시간</div>
          <input
            type="time"
            value={form.하차시간 || ""}
            onChange={(e) => handleChange("하차시간", e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs"
          />

          <div className="text-xs text-gray-500 font-medium">하차지</div>
          <input
            value={form.하차지명 || ""}
            placeholder="하차지명"
            onChange={(e) => handleChange("하차지명", e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs"
          />

          <input
            value={form.하차지주소 || ""}
            placeholder="하차지 주소"
            onChange={(e) => handleChange("하차지주소", e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs"
          />

          <div className="text-xs text-gray-500 font-medium">방법</div>
          <input
            value={form.하차방법 || ""}
            placeholder="예: 지게차/수작업.."
            onChange={(e) => handleChange("하차방법", e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs"
          />
        </div>
      </div>

      {/* 차량 정보 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm space-y-2">
        <div className="text-sm font-semibold">차량 정보</div>

        <input
          className="w-full border rounded px-3 py-1.5"
          placeholder="차종"
          value={form.차종 || ""}
          onChange={(e) => handleChange("차종", e.target.value)}
        />

        <input
          className="w-full border rounded px-3 py-1.5"
          placeholder="톤수"
          value={form.톤수 || ""}
          onChange={(e) => handleChange("톤수", e.target.value)}
        />
      </div>

      {/* 금액 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm space-y-2">
        <div className="text-sm font-semibold">금액</div>

        <input
          className="w-full border rounded px-3 py-1.5"
          placeholder="청구운임"
          value={form.청구운임 || ""}
          onChange={(e) =>
            handleChange("청구운임", toNumber(e.target.value))
          }
        />

        <input
          className="w-full border rounded px-3 py-1.5"
          placeholder="기사운임"
          value={form.기사운임 || ""}
          onChange={(e) =>
            handleChange("기사운임", toNumber(e.target.value))
          }
        />

        <input
          className="w-full border rounded px-3 py-1.5"
          placeholder="산재보험료"
          value={form.산재보험료 || ""}
          onChange={(e) =>
            handleChange("산재보험료", toNumber(e.target.value))
          }
        />
      </div>

      {/* 추가 정보 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm space-y-2">
        <div className="text-sm font-semibold">기타</div>

        <select
          className="w-full border rounded px-3 py-1.5 text-sm"
          value={form.혼적여부 || "독차"}
          onChange={(e) => handleChange("혼적여부", e.target.value)}
        >
          <option value="독차">독차</option>
          <option value="혼적">혼적</option>
        </select>

        <input
          className="w-full border rounded px-3 py-1.5"
          placeholder="지급방식"
          value={form.지급방식 || ""}
          onChange={(e) => handleChange("지급방식", e.target.value)}
        />

        <input
          className="w-full border rounded px-3 py-1.5"
          placeholder="배차방식"
          value={form.배차방식 || ""}
          onChange={(e) => handleChange("배차방식", e.target.value)}
        />

        <textarea
          rows={3}
          className="w-full border rounded px-3 py-1.5"
          placeholder="메모"
          value={form.메모 || ""}
          onChange={(e) => handleChange("메모", e.target.value)}
        />
      </div>

      {/* 저장 버튼 */}
      <button
        onClick={onSave}
        className="w-full py-3 rounded-lg bg-blue-600 text-white text-sm font-semibold active:scale-95"
      >
        저장
      </button>

      {/* 취소 */}
      <button
        onClick={() => setPage("list")}
        className="w-full py-3 rounded-lg bg-gray-200 text-gray-600 text-sm font-semibold active:scale-95"
      >
        취소
      </button>
    </div>
  );
}
// ======================= src/mobile/MobileApp.jsx (PART 8/10) =======================
//
// 배차현황 / 미배차현황 테이블
//
function MobileStatusTable({ title, orders, onBack }) {
  return (
    <div className="p-4 space-y-3">
      {/* 상단 헤더 */}
      <div className="flex justify-between items-center">
        <div className="text-base font-bold">{title}</div>
        <button
          onClick={onBack}
          className="text-sm text-gray-500 border rounded px-3 py-1 active:scale-95"
        >
          뒤로
        </button>
      </div>

      {/* 테이블 */}
      <div className="border bg-white rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="border px-2 py-2">상차일</th>
              <th className="border px-2 py-2">거래처</th>
              <th className="border px-2 py-2">상차지</th>
              <th className="border px-2 py-2">하차지</th>
              <th className="border px-2 py-2">상태</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td className="py-8 text-center text-gray-400" colSpan={5}>
                  데이터 없음
                </td>
              </tr>
            )}

            {orders.map((o) => {
              const state = normalizeState(o.배차상태 || o.상태);
              const badge =
                state === "배차완료"
                  ? "text-green-600"
                  : "text-gray-600";

              return (
                <tr key={o.id} className="hover:bg-blue-50">
                  <td className="border px-2 py-2">
                    {getPickupDate(o) || "-"}
                  </td>
                  <td className="border px-2 py-2">
                    {o.거래처명 || "-"}
                  </td>
                  <td className="border px-2 py-2">
                    {o.상차지명 || "-"}
                  </td>
                  <td className="border px-2 py-2">
                    {o.하차지명 || "-"}
                  </td>
                  <td className="border px-2 py-2 font-semibold">
                    <span className={badge}>{state}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ======================= src/mobile/MobileApp.jsx (PART 9/10) =======================
//
// 표준운임표 — PC 검색 규칙과 동일
//
function MobileStandardFare({ onBack }) {
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");

  const [cargo, setCargo] = useState("");
  const [ton, setTon] = useState("");
  const [vehicle, setVehicle] = useState("전체");

  const [pickupList, setPickupList] = useState([]);
  const [dropList, setDropList] = useState([]);

  const [matchedRows, setMatchedRows] = useState([]);
  const [result, setResult] = useState(null);
  const [aiFare, setAiFare] = useState(null);

  const clean = (s) =>
    String(s || "").trim().toLowerCase().replace(/\s+/g, "");

  const extractTon = (text = "") => {
    const m = text.replace(/톤|t/gi, "").match(/(\d+(\.\d+)?)/);
    return m ? Number(m[1]) : null;
  };

  const extractPallet = (text = "") => {
    const m = text.match(/(\d+)\s*(p|팔레트|pl)/i);
    return m ? Number(m[1]) : extractLeadingNum(text);
  };

  const extractLeadingNum = (text = "") => {
    const m2 = text.match(/^(\d+)/);
    return m2 ? Number(m2[1]) : null;
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "dispatch"), (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const pickupSet = new Set();
      const dropSet = new Set();
      arr.forEach((r) => {
        if (r.상차지명) pickupSet.add(r.상차지명);
        if (r.하차지명) dropSet.add(r.하차지명);
      });

      setPickupList(Array.from(pickupSet).sort());
      setDropList(Array.from(dropSet).sort());
    });

    return () => unsub();
  }, []);

  const calcFare = () => {
    if (!pickup.trim() || !drop.trim()) {
      alert("상차지 / 하차지를 입력하세요.");
      return;
    }

    const normPickup = clean(pickup);
    const normDrop = clean(drop);

    const inputTon = extractTon(ton);
    const inputPallet = extractPallet(cargo);

    let filtered = [];

    onSnapshot(collection(db, "dispatch"), (snap) => {
      filtered = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => {
          const rp = clean(r.상차지명);
          const rd = clean(r.하차지명);

          if (!rp.includes(normPickup) || !rd.includes(normDrop)) return false;

          if (vehicle !== "전체") {
            const rv = clean(r.차량종류 || "");
            const vv = clean(vehicle);
            if (!rv.includes(vv) && !vv.includes(rv)) return false;
          }

          if (inputTon != null) {
            const rTon = extractTon(r.차량톤수 || "");
            if (rTon != null && Math.abs(rTon - inputTon) > 0.5) return false;
          }

          if (inputPallet != null) {
            const rowPallet =
              extractPallet(r.화물내용 || "") ||
              extractLeadingNum(r.화물내용 || "");
            if (rowPallet != null && Math.abs(rowPallet - inputPallet) > 1)
              return false;
          }

          return true;
        });

      if (!filtered.length) {
        alert("검색된 내용이 없습니다.");
        setMatchedRows([]);
        setResult(null);
        setAiFare(null);
        return;
      }

      setMatchedRows(filtered);

      const fares = filtered.map((r) => toNumber(r.청구운임 || 0));
      const avg = Math.round(fares.reduce((a, b) => a + b, 0) / fares.length);

      const min = Math.min(...fares);
      const max = Math.max(...fares);

      const latest = filtered
        .slice()
        .sort((a, b) => (b.상차일 || "").localeCompare(a.상차일 || ""))[0];

      const latestFare = toNumber(latest?.청구운임 || 0);
      const aiValue = Math.round(latestFare * 0.6 + avg * 0.4);

      setAiFare({
        avg,
        min,
        max,
        latestFare,
        confidence: Math.min(95, 60 + filtered.length * 5),
      });

      setResult({
        count: filtered.length,
        avg,
        min,
        max,
        latestFare,
        latest,
      });
    });
  };

  return (
    <div className="p-4 space-y-4">
      {/* 뒤로가기 */}
      <button
        onClick={onBack}
        className="px-3 py-1 rounded bg-gray-200 text-gray-600 active:scale-95 text-sm"
      >
        ◀ 뒤로가기
      </button>

      {/* 검색 */}
      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <div className="font-semibold text-base mb-2">표준운임 검색</div>

        <AutoInput
          placeholder="상차지"
          value={pickup}
          list={pickupList}
          setValue={setPickup}
        />

        <AutoInput
          placeholder="하차지"
          value={drop}
          list={dropList}
          setValue={setDrop}
        />

        <input
          className="w-full border rounded-lg px-3 py-2 bg-gray-50 text-sm"
          placeholder="화물내용 (예: 16파렛)"
          value={cargo}
          onChange={(e) => setCargo(e.target.value)}
        />

        <input
          className="w-full border rounded-lg px-3 py-2 bg-gray-50 text-sm"
          placeholder="톤수 (예: 1톤)"
          value={ton}
          onChange={(e) => setTon(e.target.value)}
        />

        <select
          className="w-full border rounded-lg px-3 py-2 bg-gray-50 text-sm"
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
        >
          <option>전체</option>
          <option>다마스</option>
          <option>라보</option>
          <option>카고</option>
          <option>윙바디</option>
          <option>탑차</option>
          <option>냉장탑</option>
          <option>냉동탑</option>
          <option>오토바이</option>
        </select>

        <button
          onClick={calcFare}
          className="w-full py-2 rounded-lg bg-blue-500 text-white text-sm font-semibold active:scale-95"
        >
          🔍 검색하기
        </button>
      </div>

      {aiFare && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 shadow">
          <div className="text-base font-bold mb-2">AI 추천 운임</div>
          <div>평균: {fmtMoney(aiFare.avg)}</div>
          <div>최소: {fmtMoney(aiFare.min)} / 최대: {fmtMoney(aiFare.max)}</div>
          <div>최근: {fmtMoney(aiFare.latestFare)}</div>
          <div className="mt-2 text-amber-700 font-bold">
            추천가: {fmtMoney(aiFare.aiValue)}
          </div>
          <div className="text-xs text-gray-500">
            신뢰도 {aiFare.confidence}%
          </div>
        </div>
      )}

      {result && (
        <div className="bg-blue-50 rounded-xl border p-4 text-sm">
          총 {result.count}건 / 평균 {fmtMoney(result.avg)}
        </div>
      )}

      {/* 결과 테이블 */}
      <div className="bg-white border rounded-xl shadow overflow-auto max-h-[60vh]">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b sticky top-0">
            <tr>
              <th className="px-2 py-2 border-r">상차일</th>
              <th className="px-2 py-2 border-r">상차지</th>
              <th className="px-2 py-2 border-r">하차지</th>
              <th className="px-2 py-2 border-r">톤수</th>
              <th className="px-2 py-2">청구운임</th>
            </tr>
          </thead>
          <tbody>
            {matchedRows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <td className="px-2 py-2 border-r">{getPickupDate(r)}</td>
                <td className="px-2 py-2 border-r">{r.상차지명}</td>
                <td className="px-2 py-2 border-r">{r.하차지명}</td>
                <td className="px-2 py-2 border-r">{r.차량톤수}</td>
                <td className="px-2 py-2 text-right">{fmtMoney(r.청구운임)}</td>
              </tr>
            ))}

            {!matchedRows.length && (
              <tr>
                <td
                  colSpan={5}
                  className="text-center text-gray-400 py-5"
                >
                  검색 결과 없음
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ======================= src/mobile/MobileApp.jsx (PART 10/10) =======================
//
// 공통 자동완성 입력창
//
function AutoInput({ placeholder, value, list, setValue }) {
  const items = list.filter((i) =>
    String(i).toLowerCase().includes(value.toLowerCase())
  );

  return (
    <div className="relative">
      <input
        className="w-full border rounded-lg px-3 py-2 bg-gray-50 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {value && items.length > 0 && (
        <div className="absolute z-10 mt-1 bg-white border rounded-lg w-full max-h-32 overflow-y-auto shadow">
          {items.map((v, idx) => (
            <div
              key={idx}
              className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer"
              onClick={() => setValue(v)}
            >
              {v}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 짧은 주소 표시
function shortAddr(addr = "") {
  if (!addr) return "";
  const parts = addr.split(" ");
  return parts.length > 1 ? parts[1] : addr;
}

// 금액 변환
function toNumber(v) {
  return Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;
}
function fmtMoney(v) {
  return `${Number(v || 0).toLocaleString("ko-KR")}원`;
}

// 상태 처리 (배차전 삭제)
function normalizeState(s) {
  if (!s) return "배차중";
  if (s === "배차완료") return "배차완료";
  return "배차중";
}
function getStatus(o = {}) {
  if (o.차량번호) return "배차완료";
  return "배차중";
}

// 날짜
function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function getPickupDate(o = {}) {
  return (
    (o.상차일 && String(o.상차일).slice(0, 10)) ||
    (o.등록일 && String(o.등록일).slice(0, 10)) ||
    ""
  );
}

// 카톡 공유문구
function buildKakaoMessage(o = {}) {
  return `📦 배차정보
상차: ${o.상차지명} ${o.상차시간 || ""}
하차: ${o.하차지명} ${o.하차시간 || ""}
화물: ${o.화물내용 || ""}
청구: ${fmtMoney(o.청구운임)}`;
}

// 알림 토스트
function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg text-sm shadow z-50">
      {msg}
    </div>
  );
}

// 메인 화면 — 페이지 렌더링
function MobileApp() {
  const [page, setPage] = useState("list");
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);

  const [form, setForm] = useState({});
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [toast, setToast] = useState("");
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1500);
  };

  // 실시간 연동 (PC ↔ 모바일 100% 동기화 보장)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "dispatch"), (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders(arr);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsubD = onSnapshot(collection(db, "drivers"), (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setDrivers(arr);
    });
    return () => unsubD();
  }, []);

  // 신규 등록
  const onNew = () => {
    setForm({
      거래처명: "",
      상차일: todayStr(),
      하차일: todayStr(),
      혼적여부: "독차",
      차량번호: "",
      기사명: "",
      전화번호: "",
    });
    setSelectedOrder(null);
    setPage("form");
    window.scrollTo(0, 0);
  };

  return (
    <div className="bg-gray-100 min-h-screen pb-16">
      {page === "list" && (
        <OrderListPage
          orders={orders}
          drivers={drivers}
          onNew={onNew}
          setForm={setForm}
          setPage={setPage}
          setSelectedOrder={setSelectedOrder}
          showToast={showToast}
        />
      )}

      {page === "detail" && selectedOrder && (
        <MobileOrderDetail
          order={selectedOrder}
          drivers={drivers}
          setForm={setForm}
          setPage={setPage}
          setSelectedOrder={setSelectedOrder}
          showToast={showToast}
          upsertDriver={(info) =>
            upsertDriverDetailHandler(
              info,
              selectedOrder,
              setSelectedOrder,
              showToast
            )
          }
          onAssignDriver={(info) =>
            assignDriver(selectedOrder, info, setSelectedOrder)
          }
          onCancelOrder={() =>
            deleteOrder(selectedOrder, setPage, showToast)
          }
        />
      )}

      {page === "form" && (
        <MobileOrderForm
          form={form}
          setForm={setForm}
          clients={orders}
          drivers={drivers}
          upsertDriver={(info) =>
            upsertDriverDetailHandler(info, null, null, showToast)
          }
          onSave={() =>
            saveOrder(form, setForm, setPage, showToast, setSelectedOrder)
          }
          setPage={setPage}
          showToast={showToast}
        />
      )}

      {page === "fare" && (
        <MobileStandardFare onBack={() => setPage("list")} />
      )}

      <Toast msg={toast} />

      {/* 하단 메뉴 */}
      <MobileBottomBar page={page} setPage={setPage} />
    </div>
  );
}

// 🚩 기본 export
export default MobileApp;
