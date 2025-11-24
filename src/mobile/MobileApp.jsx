// ======================= MobileApp.jsx — PART 1 / 5 =======================
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

/* ------------------------------------------------------------------
   🔵 공통 유틸
-------------------------------------------------------------------*/

// 숫자만 추출
const toNumber = (v) =>
  Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;

// 금액 포맷
const fmt = (v) => `${Number(v || 0).toLocaleString("ko-KR")}원`;

// 상차일 필터 기준 날짜 추출 (PC/모바일 데이터 모두 대응)
const getPickupDate = (o = {}) => {
  if (o["상차일"]) return String(o["상차일"]).slice(0, 10);
  if (o["상차일시"]) return String(o["상차일시"]).slice(0, 10);
  if (o["등록일"]) return String(o["등록일"]).slice(0, 10);
  return "";
};

// 청구운임 or 인수증
const getClaim = (o = {}) => o["청구운임"] ?? o["인수증"] ?? 0;

// 기사운임
const getDriverFare = (o = {}) => o["기사운임"] ?? 0;

// 산재보험료
const getSanjae = (o = {}) => o["산재보험료"] ?? 0;

/* ------------------------------------------------------------------
   🔵 카카오톡 공유용 텍스트 생성
-------------------------------------------------------------------*/
function buildKakaoMessage(order) {
  const lines = [];

  const 상차일시 =
    order["상차일시"] ||
    `${order["상차일"] || ""} ${order["상차시간"] || ""}`.trim();

  const 하차일시 =
    order["하차일시"] ||
    `${order["하차일"] || ""} ${order["하차시간"] || ""}`.trim();

  if (상차일시) lines.push(`상차일시: ${상차일시}`);
  if (하차일시) lines.push(`하차일시: ${하차일시}`);

  lines.push("");
  lines.push("[거래처]");
  lines.push(order["거래처명"] || "-");

  lines.push("");
  lines.push("[상차지]");
  lines.push(order["상차지명"] || "-");
  if (order["상차지주소"]) lines.push(order["상차지주소"]);

  lines.push("");
  lines.push("[하차지]");
  lines.push(order["하차지명"] || "-");
  if (order["하차지주소"]) lines.push(order["하차지주소"]);

  lines.push("");
  lines.push(
    `차량: ${(order["차량톤수"] || order["톤수"] || "")} ${
      order["차량종류"] || order["차종"] || ""
    }`.trim() || "차량 정보 없음"
  );

  lines.push(`청구운임: ${fmt(getClaim(order))}`);
  lines.push(`기사운임: ${fmt(getDriverFare(order))}`);
  lines.push(`수수료: ${fmt(getClaim(order) - getDriverFare(order))}`);

  if (order["비고"] || order["메모"]) {
    lines.push("");
    lines.push(`[비고] ${order["비고"] || order["메모"]}`);
  }

  return lines.join("\n");
}

/* ======================================================================
   🔵 메인 시작 (실시간 연동 포함)
====================================================================== */
export default function MobileApp() {
  // --------------------------------------------------
  // 1. Firestore 실시간 연동 (PC 버전과 동일 컬렉션 사용)
  // --------------------------------------------------
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [clients, setClients] = useState([]);

  // dispatch
  useEffect(() => {
    const q = query(collection(db, "dispatch"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 전체 날짜 다 보이게 수정 (오늘만 나오던 문제 해결)
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

  // clients (거래처/하차지 자동완성)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "clients"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setClients(list);
    });
    return () => unsub();
  }, []);

  /* --------------------------------------------------
     2. 화면 상태
  --------------------------------------------------*/
  const [page, setPage] = useState("list"); // list | form | detail | table
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showMenu, setShowMenu] = useState(false);

  // 날짜 필터
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());

  // 상태 필터
  const [statusTab, setStatusTab] = useState("전체");

  // 추가 필터: 차량종류/배차상태
  const [filterCarType, setFilterCarType] = useState("");
  const [filterAssign, setFilterAssign] = useState("");

  // --------------------------------------------------
  // 3. 등록 폼 (PC 기준으로 필드 통일)
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
    혼적여부: "독차",
    차량번호: "", // 🔥 추가: 배차 등록 시 차량번호 입력 가능
    청구운임: 0,
    기사운임: 0,
    수수료: 0,
    산재보험료: 0,
    적요: "",
  });

  /* ======================================================================
     PART 1 / 5 끝 — 다음(part 2/5) 보내줘 라고 말하면 바로 보냄
  ======================================================================*/
// ======================= MobileApp.jsx — PART 2 / 5 =======================

/* --------------------------------------------------
   4. 필터 유틸
--------------------------------------------------*/
const quickRange = (days, setStartDate, setEndDate) => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  setStartDate(start.toISOString().slice(0, 10));
  setEndDate(end.toISOString().slice(0, 10));
};

/* --------------------------------------------------
   5. 필터링된 전체 오더 목록
--------------------------------------------------*/
const useFilteredOrders = ({
  orders,
  statusTab,
  filterCarType,
  filterAssign,
  startDate,
  endDate,
}) => {
  return useMemo(() => {
    return orders.filter((o) => {
      const state = o["배차상태"] || o["상태"] || "배차전";

      // 상태 필터
      if (statusTab !== "전체" && state !== statusTab) return false;

      // 배차상태 필터 (배차전/배차완료/취소)
      if (filterAssign && state !== filterAssign) return false;

      // 차량 종류 필터
      if (filterCarType && o["차량종류"] !== filterCarType) return false;

      // 날짜 필터
      const d = getPickupDate(o);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;

      return true;
    });
  }, [orders, statusTab, filterCarType, filterAssign, startDate, endDate]);
};

/* --------------------------------------------------
   6. Firestore 저장 (배차 등록)
--------------------------------------------------*/
async function saveOrder(form, todayStr, setForm, setPage) {
  if (!form["상차지명"] || !form["하차지명"]) {
    alert("상차지/하차지는 필수입니다.");
    return;
  }

  const 청구운임 = toNumber(form["청구운임"]);
  const 기사운임 = toNumber(form["기사운임"]);
  const 수수료 = 청구운임 - 기사운임;

  const 상차일시 = `${form["상차일"] || ""} ${form["상차시간"] || ""}`.trim();
  const 하차일시 = `${form["하차일"] || ""} ${form["하차시간"] || ""}`.trim();

  const docData = {
    createdAt: serverTimestamp(),
    등록일: todayStr(),

    // 상태
    배차상태: "배차전",
    상태: "배차전",

    // 날짜
    상차일: form["상차일"],
    상차시간: form["상차시간"],
    하차일: form["하차일"],
    하차시간: form["하차시간"],
    상차일시,
    하차일시,

    // 거래처/상하차
    거래처명: form["거래처명"] || form["상차지명"],
    상차지명: form["상차지명"],
    상차지주소: form["상차지주소"],
    하차지명: form["하차지명"],
    하차지주소: form["하차지주소"],

    // 차량
    차량번호: form["차량번호"] || "",
    기사명: "",
    전화번호: "",

    톤수: form["톤수"],
    차량톤수: form["톤수"],
    차종: form["차종"],
    차량종류: form["차종"],
    화물중량: form["화물중량"],
    화물내용: form["화물중량"],

    // 혼적/독차
    혼적여부: form["혼적여부"],

    // 방법
    상차방법: form["상차방법"],
    하차방법: form["하차방법"],

    // 방식
    지급방식: form["지급방식"],
    배차방식: form["배차방식"],

    // 금액
    청구운임,
    기사운임,
    수수료,
    인수증: 청구운임,
    산재보험료: toNumber(form["산재보험료"]),

    // 메모
    비고: form["적요"],
    메모: form["적요"],
  };

  await addDoc(collection(db, "dispatch"), docData);

  alert("배차가 등록되었습니다.");

  // 초기화
  setForm((p) => ({
    ...p,
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
    혼적여부: "독차",
    차량번호: "",
    청구운임: 0,
    기사운임: 0,
    수수료: 0,
    산재보험료: 0,
    적요: "",
  }));

  setPage("list");
}

/* --------------------------------------------------
   7. 기사 배차
--------------------------------------------------*/
async function assignDriverToOrder({
  order,
  drivers,
  차량번호,
  이름,
  전화번호,
  setSelectedOrder,
}) {
  const norm = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();
  let driver = drivers.find((d) => norm(d.차량번호) === norm(차량번호));

  // 🔥 신규 기사 추가
  if (!driver) {
    const ref = await addDoc(collection(db, "drivers"), {
      차량번호,
      이름,
      전화번호,
      createdAt: serverTimestamp(),
      메모: "",
    });
    driver = { id: ref.id, 차량번호, 이름, 전화번호 };
  }

  await updateDoc(doc(db, "dispatch", order.id), {
    배차상태: "배차완료",
    상태: "배차완료",
    차량번호: driver.차량번호,
    기사명: driver.이름,
    전화번호: driver.전화번호,
  });

  // 🔥 즉시 반영 (화면 즉시 갱신)
  setSelectedOrder((prev) =>
    prev
      ? {
          ...prev,
          배차상태: "배차완료",
          상태: "배차완료",
          차량번호: driver.차량번호,
          기사명: driver.이름,
          전화번호: driver.전화번호,
        }
      : prev
  );

  alert("기사 배차 완료");
}

/* --------------------------------------------------
   8. 기사 배차취소
--------------------------------------------------*/
async function cancelAssign(order, setSelectedOrder) {
  await updateDoc(doc(db, "dispatch", order.id), {
    배차상태: "배차전",
    상태: "배차전",
    차량번호: "",
    기사명: "",
    전화번호: "",
  });

  // 즉시 반영
  setSelectedOrder((prev) =>
    prev
      ? {
          ...prev,
          배차상태: "배차전",
          상태: "배차전",
          차량번호: "",
          기사명: "",
          전화번호: "",
        }
      : prev
  );

  alert("배차 취소 완료");
}

/* --------------------------------------------------
   9. 오더 취소
--------------------------------------------------*/
async function cancelOrder(order, setSelectedOrder, setPage) {
  await updateDoc(doc(db, "dispatch", order.id), {
    배차상태: "배차취소",
    상태: "배차취소",
  });

  alert("오더가 취소되었습니다.");
  setSelectedOrder(null);
  setPage("list");
}

/* ======================================================================
   PART 2 / 5 끝 — "3/5 보내줘" 하면 다음 보내줄게
====================================================================== */
// ======================= MobileApp.jsx — PART 3 / 5 =======================

/* --------------------------------------------------
   등록내역 리스트 (MobileOrderList)
--------------------------------------------------*/
function MobileOrderList({
  orders,
  statusTab,
  setStatusTab,
  filterCarType,
  setFilterCarType,
  filterAssign,
  setFilterAssign,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  quickRange,
  onClickOrder,
}) {
  const tabs = ["전체", "배차전", "배차완료", "배차취소"];

  return (
    <div className="pt-2">
      
      {/* ===================== 상단 날짜 ===================== */}
      <div className="px-4 py-2 text-lg font-bold text-gray-800">
        {formatMonthDay(startDate)} ~ {formatMonthDay(endDate)}
      </div>

      {/* ===================== 필터 탭 ===================== */}
      <div className="flex bg-white border-b sticky top-12 z-10">
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

      {/* ===================== 필터 추가 (차량종류 / 배차상태) ===================== */}
      <div className="bg-white border-b px-4 py-3 space-y-2">

        {/* 날짜 */}
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

        {/* 기간 빠른 선택 */}
        <div className="flex gap-2">
          {[1, 3, 7, 15].map((d) => (
            <button
              key={d}
              onClick={() => quickRange(d, setStartDate, setEndDate)}
              className="flex-1 py-1.5 text-sm rounded-full bg-gray-100 border"
            >
              {d}일
            </button>
          ))}
        </div>

        {/* 차량종류 / 배차상태 */}
        <div className="flex gap-2">
          <select
            value={filterCarType}
            onChange={(e) => setFilterCarType(e.target.value)}
            className="flex-1 border px-2 py-1 rounded text-sm"
          >
            <option value="">차종 전체</option>
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

          <select
            value={filterAssign}
            onChange={(e) => setFilterAssign(e.target.value)}
            className="flex-1 border px-2 py-1 rounded text-sm"
          >
            <option value="">배차 전체</option>
            <option value="배차전">배차전</option>
            <option value="배차완료">배차완료</option>
            <option value="배차취소">배차취소</option>
          </select>
        </div>
      </div>

      {/* ===================== 리스트 ===================== */}
      <div className="px-3 py-3 space-y-3">
        {orders.map((o) => (
          <div key={o.id} onClick={() => onClickOrder(o)}>
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

/* ############################################################
   🔥 카드 디자인 (MobileOrderCard)
############################################################ */
function MobileOrderCard({ order }) {
  const claim = getClaim(order);
  const fee = order.기사운임 ?? 0;

  const state = order.배차상태 || order.상태 || "배차전";

  const color =
    state === "배차완료"
      ? "bg-green-100 text-green-700 border-green-300"
      : state === "배차취소"
      ? "bg-red-100 text-red-700 border-red-300"
      : "bg-gray-100 text-gray-700 border-gray-300";

  // 상/하차 날짜 상태 표시
  const 상차표시 = getDayStatus(order.상차일);
  const 하차표시 = getDayStatus(order.하차일);

  // 주소 간단 표기 (인천 서구)
  const pickupShort = shortAddr(order.상차지주소);
  const dropShort = shortAddr(order.하차지주소);

  return (
    <div className="bg-white rounded-xl shadow px-4 py-3 border active:scale-[0.99] transition">

      {/* 거래처명 */}
      <div className="text-[13px] text-gray-400 mb-1">
        {order.거래처명 || "-"}
      </div>

      {/* 상차 / 배차상태 */}
      <div className="flex justify-between items-start">
        <div>
          <div className="text-base font-bold text-blue-600">
            {order.상차지명}{" "}
            {pickupShort && <span className="text-xs text-gray-500">({pickupShort})</span>}
          </div>
          <div className="text-sm text-gray-700 mt-1">{order.하차지명}{" "}
            {dropShort && <span className="text-xs text-gray-500">({dropShort})</span>}
          </div>
        </div>

        <span className={`px-2 py-0.5 text-xs rounded-full border ${color}`}>
          {state}
        </span>
      </div>

      {/* 당상/당착 + 상하차방법 */}
      <div className="flex gap-3 text-[11px] text-gray-600 mt-2 font-semibold">
        <div className="flex items-center gap-1">
          <span className="text-blue-600 font-bold">{상차표시}</span>
          {order.상차방법 && (
            <span className="text-orange-600">{shortMethod(order.상차방법)}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-blue-600 font-bold">{하차표시}</span>
          {order.하차방법 && (
            <span className="text-orange-600">{shortMethod(order.하차방법)}</span>
          )}
        </div>
      </div>

      {/* 운임 */}
      <div className="flex justify-between items-center mt-3">
        <div className="text-sm font-semibold">청구 {fmt(claim)}</div>

        <div className="text-sm font-semibold text-blue-600">
          기사 {fmt(fee)}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------- */
/* 날짜 상태: 오늘/내일/기타 날짜 */
/* -------------------------------------------------- */
function getDayStatus(day) {
  if (!day) return "";
  const d = new Date(day);
  const today = new Date();
  const diff = Math.floor((d - today) / (1000 * 60 * 60 * 24));

  if (diff === 0) return "당상";
  if (diff === 1) return "내상";
  if (diff === -1) return "당착";
  if (diff === 2) return "모레";

  return day.slice(5); // mm-dd
}

/* -------------------------------------------------- */
/* 주소를 “인천 서구” 처럼 짧게 */
/* -------------------------------------------------- */
function shortAddr(addr) {
  if (!addr) return "";
  const sp = addr.split(" ");
  return sp.length >= 2 ? sp[0] + " " + sp[1] : addr;
}

/* -------------------------------------------------- */
/* 상/하차방법 축약 */
/* -------------------------------------------------- */
function shortMethod(str) {
  if (!str) return "";
  if (str === "지게차") return "지";
  if (str === "수작업") return "수";
  if (str === "직접수작업") return "직수";
  if (str === "수도움") return "수도움";
  return str;
}

/* -------------------------------------------------- */
/* 11-24 형식 날짜 */
/* -------------------------------------------------- */
function formatMonthDay(d) {
  if (!d) return "";
  return d.slice(5).replace("-", "-");
}

/* ======================================================================
   PART 3 / 5 끝 — “4/5 보내줘” 하면 다음 보냄
====================================================================== */
// ======================= MobileApp.jsx — PART 4 / 5 =======================

/* ####################################################################
   상세보기 (MobileOrderDetail)
#################################################################### */
function MobileOrderDetail({
  order,
  drivers,
  onAssignDriver,
  onCancelAssign,
  onCancelOrder,
}) {
  const [carNo, setCarNo] = useState(order.차량번호 || "");
  const [name, setName] = useState(order.기사명 || "");
  const [phone, setPhone] = useState(order.전화번호 || "");

  // 🔥 기사 자동매칭 (차량번호 변경 시 실시간 반영)
  useEffect(() => {
    const norm = (s = "") => String(s).replace(/\s+/g, "").toLowerCase();
    const d = drivers.find((dr) => norm(dr.차량번호) === norm(carNo));
    if (d) {
      setName(d.이름);
      setPhone(d.전화번호);
    }
  }, [carNo, drivers]);

  // 🔥 지도열기
  const openMap = (type) => {
    const addr =
      type === "pickup"
        ? order.상차지주소 || order.상차지명
        : order.하차지주소 || order.하차지명;
    if (!addr) return alert("주소 정보가 없습니다.");
    window.open(
      `https://map.kakao.com/?q=${encodeURIComponent(addr)}`,
      "_blank"
    );
  };

  // 🔥 카톡공유
  const handleCopyKakao = async () => {
    const text = buildKakaoMessage(order);
    try {
      await navigator.clipboard.writeText(text);
      alert("카카오톡 공유용 텍스트가 복사되었습니다.");
    } catch {
      alert("복사 실패. 직접 복사해주세요.");
    }
  };

  const claim = getClaim(order);
  const sanjae = getSanjae(order);
  const fee = order.기사운임 ?? 0;

  const state = order.배차상태 || order.상태 || "배차전";

  const 상차표시 = getDayStatus(order.상차일);
  const 하차표시 = getDayStatus(order.하차일);

  const pickupShort = shortAddr(order.상차지주소);
  const dropShort = shortAddr(order.하차지주소);

  return (
    <div className="px-4 py-3 space-y-4">

      {/* ============================================================
          🔵 기본 정보 카드
      ============================================================ */}
      <div className="bg-white border rounded-xl px-4 py-4 shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[13px] text-gray-400 mb-1">
              {order.거래처명 || "-"}
            </div>

            <div className="text-lg font-bold text-blue-600">
              {order.상차지명}{" "}
              {pickupShort && (
                <span className="text-xs text-gray-500">({pickupShort})</span>
              )}
            </div>

            {order.상차지주소 && (
              <div className="text-[12px] text-gray-500">
                {order.상차지주소}
              </div>
            )}

            <div className="mt-3 text-md font-semibold">
              {order.하차지명}{" "}
              {dropShort && (
                <span className="text-xs text-gray-500">({dropShort})</span>
              )}
            </div>
            {order.하차지주소 && (
              <div className="text-[12px] text-gray-500">
                {order.하차지주소}
              </div>
            )}
          </div>

          <span className="px-2 py-0.5 text-xs bg-gray-100 border rounded-full text-gray-700">
            {state}
          </span>
        </div>

        {/* 상/하차일시 */}
        <div className="text-xs text-gray-500 mt-3">
          상차일시: {order.상차일시 || "-"}
        </div>
        <div className="text-xs text-gray-500">
          하차일시: {order.하차일시 || "-"}
        </div>

        {/* 차량 정보 */}
        <div className="flex gap-2 mt-3 text-xs text-gray-700 font-semibold">
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
          {order.화물중량 && (
            <span className="border rounded-full px-2 py-0.5 bg-gray-50">
              {order.화물중량}
            </span>
          )}
        </div>

        {/* 운임 */}
        <div className="flex justify-between items-center mt-4">
          <div className="text-sm font-bold">청구 {fmt(claim)}</div>
          <div className="text-sm font-bold text-blue-600">
            기사 {fmt(fee)}
          </div>
        </div>
      </div>

      {/* ============================================================
          🔵 지도
      ============================================================ */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
        <div className="text-sm font-semibold mb-2">지도 보기</div>
        <div className="flex gap-2">
          <button
            onClick={() => openMap("pickup")}
            className="flex-1 py-2 rounded-lg bg-blue-500 text-white text-sm"
          >
            상차지 지도
          </button>
          <button
            onClick={() => openMap("drop")}
            className="flex-1 py-2 rounded-lg bg-indigo-500 text-white text-sm"
          >
            하차지 지도
          </button>
        </div>
      </div>

      {/* ============================================================
          🔵 카톡 공유
      ============================================================ */}
      <div className="bg-white border rounded-xl px-4 py-3 shadow-sm">
        <div className="text-sm font-semibold mb-2">카톡 공유</div>
        <button
          onClick={handleCopyKakao}
          className="w-full py-2 rounded-lg bg-yellow-400 text-black text-sm font-semibold"
        >
          공유 텍스트 복사
        </button>
      </div>

      {/* ============================================================
          🔵 기사 배차 / 배차 취소
      ============================================================ */}
      <div className="bg-white border rounded-xl px-4 py-4 shadow-sm">
        <div className="text-sm font-semibold mb-3">기사 배차</div>

        {/* 현 상태 */}
        <div className="text-xs text-gray-500 mb-2">
          현재 상태:{" "}
          <span
            className={
              state === "배차완료"
                ? "text-green-600 font-bold"
                : "text-gray-700"
            }
          >
            {state}
          </span>
          {order.기사명 && (
            <>
              {" "}
              / {order.기사명} ({order.차량번호})
            </>
          )}
        </div>

        {/* 입력 */}
        <div className="space-y-2">
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

        {/* 배차완료 버튼 */}
        <button
          onClick={() =>
            onAssignDriver({
              차량번호: carNo,
              이름: name,
              전화번호: phone,
            })
          }
          className="w-full py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold mt-3"
        >
          기사 배차하기
        </button>

        {/* 배차취소 버튼 */}
        {state === "배차완료" && (
          <button
            onClick={onCancelAssign}
            className="w-full py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold mt-2"
          >
            배차 취소하기
          </button>
        )}

        {/* 오더 자체 취소 (배차취소와 다름) */}
        <button
          onClick={onCancelOrder}
          className="w-full py-2 rounded-lg bg-red-500 text-white text-sm font-semibold mt-4"
        >
          오더 취소
        </button>
      </div>
    </div>
  );
}
/* ####################################################################
   등록 폼 (MobileOrderForm) — PART 5 / 5
#################################################################### */
function MobileOrderForm({ form, setForm, clients, onSave }) {
  const update = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const updateMoney = (key, value) =>
    setForm((p) => {
      const next = { ...p, [key]: toNumber(value) };
      const 청구 = toNumber(next.청구운임);
      const 기사 = toNumber(next.기사운임);
      next.수수료 = 청구 - 기사;
      return next;
    });

  // 입력 보조 함수
  const norm = (s = "") => String(s).toLowerCase().replace(/\s+/g, "");

  // ================================================================
  // 🔵 자동완성 상태
  // ================================================================
  const [pickupQuery, setPickupQuery] = useState("");
  const [dropQuery, setDropQuery] = useState("");
  const [clientQuery, setClientQuery] = useState("");

  const [showPickupList, setShowPickupList] = useState(false);
  const [showDropList, setShowDropList] = useState(false);
  const [showClientList, setShowClientList] = useState(false);

  // 거래처 자동완성
  const clientOptions = useMemo(() => {
    if (!clientQuery) return [];
    return clients
      .filter((c) => norm(c.거래처명).includes(norm(clientQuery)))
      .slice(0, 12);
  }, [clientQuery, clients]);

  // 상차자동완성
  const pickupOptions = useMemo(() => {
    if (!pickupQuery) return [];
    return clients
      .filter((c) => norm(c.거래처명).includes(norm(pickupQuery)))
      .slice(0, 12);
  }, [pickupQuery, clients]);

  // 하차자동완성
  const dropOptions = useMemo(() => {
    if (!dropQuery) return [];
    return clients
      .filter((c) => norm(c.거래처명).includes(norm(dropQuery)))
      .slice(0, 12);
  }, [dropQuery, clients]);

  // ================================================================
  // 🔵 자동완성 클릭 처리
  // ================================================================
  const pickClient = (c) => {
    update("거래처명", c.거래처명 || "");
    setClientQuery("");
    setShowClientList(false);
  };

  const pickPickup = (c) => {
    update("상차지명", c.거래처명 || "");
    update("상차지주소", c.주소 || "");
    setPickupQuery("");
    setShowPickupList(false);
  };

  const pickDrop = (c) => {
    update("하차지명", c.거래처명 || "");
    update("하차지주소", c.주소 || "");
    setDropQuery("");
    setShowDropList(false);
  };

  // ================================================================
  // 🔵 UI
  // ================================================================
  return (
    <div className="px-4 py-3 space-y-4">

      {/* #############################################################
          💰 운임 요약
      ############################################################# */}
      <div className="grid grid-cols-2 border rounded-lg shadow-sm overflow-hidden bg-white">
        <div className="border-r px-3 py-2">
          <div className="text-xs text-gray-500 mb-1">총운임 (청구운임)</div>
          <div className="text-lg font-extrabold text-gray-800">
            {fmt(form.청구운임)}
          </div>
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

      {/* #############################################################
          📆 상하차 날짜/시간
      ############################################################# */}
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
                placeholder="08:00"
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
                placeholder="14:00"
                className="flex-1 border rounded px-2 py-1 text-sm"
                value={form.하차시간}
                onChange={(e) => update("하차시간", e.target.value)}
              />
            </div>
          }
        />
      </div>

      {/* #############################################################
          🏢 거래처명 자동완성
      ############################################################# */}
      <div className="bg-white rounded-lg border shadow-sm relative">
        <RowLabelInput
          label="거래처명"
          input={
            <>
              <input
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="예: 반찬단지"
                value={form.거래처명}
                onChange={(e) => {
                  update("거래처명", e.target.value);
                  setClientQuery(e.target.value);
                  setShowClientList(true);
                }}
                onFocus={() => form.거래처명 && setShowClientList(true)}
              />

              {showClientList && clientOptions.length > 0 && (
                <div className="absolute left-0 right-0 top-full bg-white border rounded shadow max-h-48 overflow-y-auto z-30 text-xs">
                  {clientOptions.map((c) => (
                    <button
                      key={c.id}
                      className="w-full px-2 py-2 text-left hover:bg-gray-100"
                      onClick={() => pickClient(c)}
                    >
                      <div className="font-medium">{c.거래처명}</div>
                      <div className="text-gray-500 text-[11px]">
                        {c.주소 || ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          }
        />
      </div>

      {/* #############################################################
          🚚 상차지 + 주소 + 자동완성
      ############################################################# */}
      <div className="bg-white border rounded-lg shadow-sm">
        <RowLabelInput
          label="상차지"
          input={
            <div className="space-y-2 relative">
              <input
                className="w-full border rounded px-2 py-1 text-sm"
                value={form.상차지명}
                onChange={(e) => {
                  update("상차지명", e.target.value);
                  setPickupQuery(e.target.value);
                  setShowPickupList(true);
                }}
                onFocus={() => form.상차지명 && setShowPickupList(true)}
              />
              <input
                className="w-full border rounded px-2 py-1 text-xs"
                placeholder="상차지 주소"
                value={form.상차지주소}
                onChange={(e) => update("상차지주소", e.target.value)}
              />

              {showPickupList && pickupOptions.length > 0 && (
                <div className="absolute left-0 right-0 top-full bg-white border rounded max-h-48 overflow-y-auto shadow text-xs z-30">
                  {pickupOptions.map((c) => (
                    <button
                      key={c.id}
                      className="w-full px-2 py-1 text-left hover:bg-gray-100"
                      onClick={() => pickPickup(c)}
                    >
                      <div className="font-semibold">
                        {c.거래처명 || "-"}
                      </div>
                      <div className="text-gray-500 text-[11px]">
                        {c.주소}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          }
        />

        {/* #############################################################
            🚛 하차지
        ############################################################# */}
        <RowLabelInput
          label="하차지"
          input={
            <div className="space-y-2 relative">
              <input
                className="w-full border rounded px-2 py-1 text-sm"
                value={form.하차지명}
                onChange={(e) => {
                  update("하차지명", e.target.value);
                  setDropQuery(e.target.value);
                  setShowDropList(true);
                }}
                onFocus={() => form.하차지명 && setShowDropList(true)}
              />
              <input
                className="w-full border rounded px-2 py-1 text-xs"
                placeholder="하차지 주소"
                value={form.하차지주소}
                onChange={(e) => update("하차지주소", e.target.value)}
              />

              {showDropList && dropOptions.length > 0 && (
                <div className="absolute left-0 right-0 top-full bg-white border rounded max-h-48 overflow-y-auto shadow text-xs z-30">
                  {dropOptions.map((c) => (
                    <button
                      key={c.id}
                      className="w-full px-2 py-1 text-left hover:bg-gray-100"
                      onClick={() => pickDrop(c)}
                    >
                      <div className="font-semibold">
                        {c.거래처명 || "-"}
                      </div>
                      <div className="text-gray-500 text-[11px]">
                        {c.주소}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          }
        />
      </div>

      {/* #############################################################
          ⚙️ 톤수 / 차종 / 중량
      ############################################################# */}
      <div className="bg-white border rounded-lg shadow-sm">
        <RowLabelInput
          label="톤수/차종/중량"
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
                <option value="">차종</option>
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

      {/* #############################################################
          🏗 상/하차방법
      ############################################################# */}
      <div className="bg-white border rounded-lg shadow-sm">
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

      {/* #############################################################
          💵 지급방식 / 배차방식
      ############################################################# */}
      <div className="bg-white border rounded-lg shadow-sm">
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

      {/* #############################################################
          💵 청구/기사/수수료
      ############################################################# */}
      <div className="bg-white border rounded-lg shadow-sm">
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

      {/* #############################################################
          📝 적요
      ############################################################# */}
      <div className="bg-white border rounded-lg shadow-sm">
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

      {/* #############################################################
          🟦 등록 버튼
      ############################################################# */}
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
/* #############################################################
   공통: 레이블 + 입력 UI
############################################################# */
function RowLabelInput({ label, input }) {
  return (
    <div className="flex px-3 py-2 border-b items-center">
      <div className="w-24 text-xs text-gray-500">{label}</div>
      <div className="flex-1">{input}</div>
    </div>
  );
}

/* #############################################################
   🔵 MobileApp 메인 화면 렌더링
############################################################# */
return (
  <div className="min-h-screen bg-gray-100">
    {/* 상단 헤더 */}
    <div className="flex justify-between items-center px-4 py-3 bg-white shadow">
      <button onClick={() => setShowMenu(!showMenu)}>☰</button>
      <div className="font-bold">등록내역</div>
      <button onClick={() => window.location.reload()}>⟳</button>
    </div>

    {/* 메뉴 */}
    {showMenu && (
      <div className="bg-white border-b px-4 py-3 space-y-2 text-sm">
        <button className="block w-full text-left" onClick={() => setPage("list")}>
          📋 등록내역
        </button>
        <button className="block w-full text-left" onClick={() => setPage("table")}>
          📑 테이블(컬럼형)
        </button>
        <button className="block w-full text-left" onClick={() => setPage("form")}>
          ➕ 배차등록
        </button>
      </div>
    )}

    {/* 페이지 전환 */}
    {page === "list" && (
      <MobileOrderList
        orders={useFilteredOrders({
          orders,
          statusTab,
          filterCarType,
          filterAssign,
          startDate,
          endDate,
        })}
        statusTab={statusTab}
        setStatusTab={setStatusTab}
        filterCarType={filterCarType}
        setFilterCarType={setFilterCarType}
        filterAssign={filterAssign}
        setFilterAssign={setFilterAssign}
        startDate={startDate}
        endDate={endDate}
        setStartDate={setStartDate}
        setEndDate={setEndDate}
        quickRange={quickRange}
        onClickOrder={(o) => {
          setSelectedOrder(o);
          setPage("detail");
        }}
      />
    )}

    {page === "detail" && selectedOrder && (
      <MobileOrderDetail
        order={selectedOrder}
        drivers={drivers}
        onAssignDriver={(d) =>
          assignDriverToOrder({
            order: selectedOrder,
            drivers,
            ...d,
            setSelectedOrder,
          })
        }
        onCancelAssign={() =>
          cancelAssign(selectedOrder, setSelectedOrder)
        }
        onCancelOrder={() =>
          cancelOrder(selectedOrder, setSelectedOrder, setPage)
        }
      />
    )}

    {page === "form" && (
      <MobileOrderForm
        form={form}
        setForm={setForm}
        clients={clients}
        onSave={() =>
          saveOrder(form, todayStr, setForm, setPage)
        }
      />
    )}
  </div>
);
}   // ← ← ← **🔥 이게 MobileApp 함수 닫는 최종 괄호**
