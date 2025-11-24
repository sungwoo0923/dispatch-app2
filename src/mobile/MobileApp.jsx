// ======================= src/Mobile/MobileApp.jsx =======================
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
import { db } from "../firebase"; // 🔥 경로 확인 (기존 DispatchApp랑 동일하게)

// ======================================================================
//  모바일 버전 기능 요약
//  1) Firestore dispatch / drivers 실시간 연동 (PC랑 같은 DB 사용)
//  2) 화면 구조: 리스트(list) / 등록(form) / 상세(detail)
//  3) 상세에서 지도 열기(카카오맵) + 기사 배차
//  4) 상세에서 "카톡 공유용 텍스트 복사" 버튼
// ======================================================================

export default function MobileApp() {
  // --------------------------------------------------
  // 1. Firestore 실시간 연동
  // --------------------------------------------------
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);

  // dispatch 실시간
  useEffect(() => {
    const q = query(
      collection(db, "dispatch"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders(list);
    });

    return () => unsub();
  }, []);

  // drivers 실시간
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "drivers"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setDrivers(list);
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
  // 3. 등록 폼
  // --------------------------------------------------
  const [form, setForm] = useState({
    상차일: "",
    상차시간: "",
    하차일: "",
    하차시간: "",
    상차지명: "",
    하차지명: "",
    톤수: "",
    차종: "",
    화물중량: "",
    차주운임: 0,
    수수료: 0,
    산재보험료: 0,
    적요: "",
  });

  // --------------------------------------------------
  // 4. 유틸 함수 (금액/필터)
  // --------------------------------------------------
  const formatMoney = (v) =>
    `${Number(v || 0).toLocaleString("ko-KR")}원`;

  const quickRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (statusTab !== "전체" && o.상태 !== statusTab) return false;
      const d = (o.상차일시 || "").slice(0, 10);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }, [orders, statusTab, startDate, endDate]);

  // --------------------------------------------------
  // 5. Firestore 신규 저장
  // --------------------------------------------------
  const handleSave = async () => {
    if (!form.상차지명 || !form.하차지명) {
      alert("상차지명 / 하차지명은 필수입니다.");
      return;
    }

    const order = {
      상태: "배차전",
      상차일시: `${form.상차일} ${form.상차시간}`,
      하차일시: `${form.하차일} ${form.하차시간}`,
      상차지명: form.상차지명,
      하차지명: form.하차지명,
      톤수: form.톤수,
      차종: form.차종,
      인수증: form.차주운임 || 0,
      산재보험료: form.산재보험료 || 0,
      비고: form.적요 || "",
      기사명: "",
      차량번호: "",
      기사전화: "",
      createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, "dispatch"), order);

    alert("신규 배차 등록 완료");

    // 폼 초기화
    setForm((p) => ({
      ...p,
      상차일: "",
      상차시간: "",
      하차일: "",
      하차시간: "",
      상차지명: "",
      하차지명: "",
      톤수: "",
      차종: "",
      화물중량: "",
      차주운임: 0,
      수수료: 0,
      산재보험료: 0,
      적요: "",
    }));

    setPage("list");
  };

  // --------------------------------------------------
  // 6. 기사 배차 (상세에서 호출)
  // --------------------------------------------------
  const assignDriver = async (driverId) => {
    if (!selectedOrder) return;
    const d = drivers.find((v) => v.id === driverId);
    if (!d) {
      alert("기사를 선택해주세요.");
      return;
    }

    await updateDoc(doc(db, "dispatch", selectedOrder.id), {
      상태: "배차완료",
      기사명: d.이름,
      차량번호: d.차량번호,
      기사전화: d.전화번호,
    });

    // 로컬 상세도 즉시 반영
    setSelectedOrder((prev) =>
      prev
        ? {
            ...prev,
            상태: "배차완료",
            기사명: d.이름,
            차량번호: d.차량번호,
            기사전화: d.전화번호,
          }
        : prev
    );

    alert(`기사 배차 완료: ${d.이름} (${d.차량번호})`);
  };

  const handleRefresh = () => {
    // 필요하면 나중에 날짜 초기화 같은 걸 추가해도 됨
    window.location.reload();
  };

  const title =
    page === "list" ? "등록내역" :
    page === "form" ? "화물등록" : "상세보기";

  // --------------------------------------------------
  // 7. 렌더링
  // --------------------------------------------------
  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col relative">
      {/* 상단 헤더 */}
      <MobileHeader
        title={title}
        onBack={page !== "list" ? () => setPage("list") : undefined}
        onRefresh={page === "list" ? handleRefresh : undefined}
        onMenu={page === "list" ? () => setShowMenu(true) : undefined}
      />

      {/* 사이드 메뉴 */}
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

      {/* 본문 */}
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
            formatMoney={formatMoney}
            onCardClick={(o) => {
              setSelectedOrder(o);
              setPage("detail");
            }}
          />
        )}

        {page === "form" && (
          <MobileOrderForm
            form={form}
            setForm={setForm}
            formatMoney={formatMoney}
            onSave={handleSave}
          />
        )}

        {page === "detail" && selectedOrder && (
          <MobileOrderDetail
            order={selectedOrder}
            drivers={drivers}
            onAssignDriver={assignDriver}
            formatMoney={formatMoney}
          />
        )}
      </div>

      {/* 우측 하단 + 버튼 */}
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
    공통 UI 컴포넌트들
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
          <button
            className="text-gray-500 text-xl"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <MenuSection title="모바일">
            <MenuItem label="등록내역" onClick={onGoList} />
            <MenuItem label="화물등록" onClick={onGoCreate} />
          </MenuSection>

          <MenuSection title="PC 전용 메뉴">
            <MenuItem
              label="배차현황 / 정산 등"
              onClick={() =>
                alert("상세 배차현황 / 정산 / 지급관리는 PC 버전에서 이용해주세요.")
              }
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
   등록내역 리스트 + 필터
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
  formatMoney,
  onCardClick,
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
          <div key={o.id} onClick={() => onCardClick(o)}>
            <MobileOrderCard order={o} formatMoney={formatMoney} />
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

/* ---------------------------------------------------------------------
   오더 카드 (한 건)
--------------------------------------------------------------------- */
function MobileOrderCard({ order, formatMoney }) {
  const stateColor =
    order.상태 === "배차완료"
      ? "bg-green-100 text-green-700 border-green-300"
      : order.상태 === "배차취소"
      ? "bg-red-100 text-red-700 border-red-300"
      : "bg-gray-100 text-gray-700 border-gray-200";

  return (
    <div className="bg-white rounded-xl shadow-sm px-4 py-3 border active:scale-[0.99] transition">
      <div className="flex justify-between items-start mb-1">
        <div className="text-sm font-semibold text-blue-600">
          {order.상차지명}
        </div>
        <span
          className={`px-2 py-0.5 text-xs rounded-full border ${stateColor}`}
        >
          {order.상태 || "배차전"}
        </span>
      </div>

      <div className="text-sm text-gray-800">{order.하차지명}</div>

      <div className="text-xs text-gray-500 mt-1">
        {order.상차일시} ~ {order.하차일시}
      </div>

      <div className="flex justify-between items-center mt-2 text-sm">
        <div>인수증 {formatMoney(order.인수증)}</div>
        {order.톤수 && (
          <span className="text-xs px-2 py-0.5 bg-gray-50 border rounded-full">
            {order.톤수} / {order.차종}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   상세보기 + 지도 + 기사 배차 + 카톡 공유
--------------------------------------------------------------------- */

// 카톡 공유용 문자열 생성
function buildKakaoMessage(order) {
  const lines = [];

  if (order.상차일시) lines.push(`상차일시: ${order.상차일시}`);
  if (order.하차일시) lines.push(`하차일시: ${order.하차일시}`);

  lines.push("");
  lines.push("[상차지]");
  lines.push(order.상차지명 || "-");

  lines.push("");
  lines.push("[하차지]");
  lines.push(order.하차지명 || "-");

  lines.push("");
  lines.push(
    `차량: ${order.톤수 || ""} ${order.차종 || ""}`.trim() || "차량 정보 없음"
  );
  lines.push(`운임(인수증 기준): ${order.인수증?.toLocaleString("ko-KR") || 0}원`);

  if (order.비고) {
    lines.push("");
    lines.push(`[비고] ${order.비고}`);
  }

  return lines.join("\n");
}

function MobileOrderDetail({ order, drivers, onAssignDriver, formatMoney }) {
  const [dId, setDId] = useState("");

  const openMap = (type) => {
    const addr = type === "pickup" ? order.상차지명 : order.하차지명;
    if (!addr) {
      alert("주소 정보가 없습니다.");
      return;
    }
    const url = `https://map.kakao.com/?q=${encodeURIComponent(addr)}`;
    window.open(url, "_blank");
  };

  const handleShareKakao = async () => {
    const text = buildKakaoMessage(order);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // 구형 브라우저용 fallback
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      alert("카톡 공유용 텍스트가 복사되었습니다.\n카카오톡에서 붙여넣기 하면 됩니다.");
    } catch (e) {
      console.error(e);
      alert("복사 중 오류가 발생했습니다. 직접 복사해 주세요.");
    }
  };

  return (
    <div className="px-4 py-3 space-y-4">
      {/* 기본 정보 카드 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="text-sm font-semibold text-blue-600">
              {order.상차지명}
            </div>
            <div className="text-sm text-gray-800">{order.하차지명}</div>
          </div>
          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 border text-gray-700">
            {order.상태 || "배차전"}
          </span>
        </div>

        <div className="text-xs text-gray-500 mb-1">
          상차일시: {order.상차일시 || "-"}
        </div>
        <div className="text-xs text-gray-500 mb-2">
          하차일시: {order.하차일시 || "-"}
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-gray-700 mb-3">
          {order.톤수 && (
            <span className="border rounded-full px-2 py-0.5 bg-gray-50">
              {order.톤수}
            </span>
          )}
          {order.차종 && (
            <span className="border rounded-full px-2 py-0.5 bg-gray-50">
              {order.차종}
            </span>
          )}
          {order.비고 && (
            <span className="text-sm text-gray-600 break-words">
              {order.비고}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm mb-1">
          <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-xs">
            인수증
          </span>
          <span className="font-semibold">{formatMoney(order.인수증)}</span>
        </div>

        <div className="flex items-center gap-2 text-sm mb-2">
          <span className="px-2 py-0.5 rounded-full bg-green-600 text-white text-xs">
            산재보험료
          </span>
          <span className="font-semibold">
            {formatMoney(order.산재보험료)}
          </span>
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

      {/* 카톡 공유 버튼 */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
        <div className="text-sm font-semibold mb-2">카톡 공유</div>
        <button
          onClick={handleShareKakao}
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
              order.상태 === "배차완료"
                ? "text-green-600 font-semibold"
                : "text-gray-700"
            }
          >
            {order.상태 || "배차전"}
          </span>
          {order.기사명 && (
            <>
              {" / "}기사: {order.기사명} ({order.차량번호})
            </>
          )}
        </div>

        <select
          className="w-full border rounded px-2 py-2 text-sm"
          value={dId}
          onChange={(e) => setDId(e.target.value)}
        >
          <option value="">배차할 기사 선택</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.이름} / {d.차량번호} / {d.전화번호}
            </option>
          ))}
        </select>

        <button
          onClick={() => onAssignDriver(dId)}
          className="w-full py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold mt-2"
        >
          기사 배차하기
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   등록 폼
--------------------------------------------------------------------- */
function MobileOrderForm({ form, setForm, formatMoney, onSave }) {
  const update = (key, value) =>
    setForm((p) => ({ ...p, [key]: value }));

  const updateNum = (key, val) =>
    update(key, Number(String(val).replace(/[^\d]/g, "")) || 0);

  return (
    <div className="px-4 py-3 space-y-3">
      {/* 총운임 / 산재 */}
      <div className="grid grid-cols-2 border rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="border-r px-3 py-2">
          <div className="text-xs text-gray-500 mb-1">총운임(차주+수수료)</div>
          <div className="text-base font-semibold">
            {formatMoney(form.차주운임 + form.수수료)}
          </div>
        </div>
        <div className="px-3 py-2">
          <div className="text-xs text-gray-500 mb-1">산재보험료</div>
          <input
            className="w-full border rounded px-2 py-1 text-right text-sm"
            value={form.산재보험료 || ""}
            onChange={(e) => updateNum("산재보험료", e.target.value)}
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

      {/* 상차지 / 하차지 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="상차지"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.상차지명}
              onChange={(e) => update("상차지명", e.target.value)}
            />
          }
        />
        <RowLabelInput
          label="하차지"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.하차지명}
              onChange={(e) => update("하차지명", e.target.value)}
            />
          }
        />
      </div>

      {/* 톤수 / 차종 / 중량 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="톤수 / 차종 / 중량"
          input={
            <div className="flex gap-2">
              <input
                className="flex-1 border rounded px-2 py-1 text-sm"
                placeholder="톤수"
                value={form.톤수}
                onChange={(e) => update("톤수", e.target.value)}
              />
              <input
                className="flex-1 border rounded px-2 py-1 text-sm"
                placeholder="차종"
                value={form.차종}
                onChange={(e) => update("차종", e.target.value)}
              />
              <input
                className="flex-1 border rounded px-2 py-1 text-sm"
                placeholder="중량"
                value={form.화물중량}
                onChange={(e) => update("화물중량", e.target.value)}
              />
            </div>
          }
        />
      </div>

      {/* 차주운임 / 수수료 */}
      <div className="bg-white rounded-lg border shadow-sm">
        <RowLabelInput
          label="차주운임"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-right text-sm"
              value={form.차주운임 || ""}
              onChange={(e) => updateNum("차주운임", e.target.value)}
            />
          }
        />
        <RowLabelInput
          label="수수료"
          input={
            <input
              className="w-full border rounded px-2 py-1 text-right text-sm"
              value={form.수수료 || ""}
              onChange={(e) => updateNum("수수료", e.target.value)}
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

      {/* 등록 버튼 */}
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
   왼쪽 라벨 / 오른쪽 입력 공통
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
