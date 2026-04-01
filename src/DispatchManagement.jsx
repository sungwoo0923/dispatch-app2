// ======================= src/DispatchManagement.jsx =======================
import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { encryptData } from "./utils/crypt"; // ⬅ 24시콜 테스트 서버 암호화용

// 숫자만 추출해서 number
const toNumber = (v) => parseInt(String(v).replace(/[^\d]/g, ""), 10) || 0;

export default function DispatchManagement({
  dispatchData,
  setDispatchData,
  clients,
  role, // admin | user | test
}) {
  const isTest = role === "test";

  // ================= 기본 폼 구조 =================
  const emptyForm = {
    _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    등록일: new Date().toISOString().slice(0, 10),
    상차일: "",
    상차시간: "",
    하차일: "",
    하차시간: "",
    거래처명: "",
    상차지명: "",
    하차지명: "",
    화물내용: "",
    차량종류: "",
    차량톤수: "",
    차량번호: "",
    이름: "",
    전화번호: "",
    배차상태: "",
    지급방식: "",
    배차방식: "",
    청구운임: "",
    기사운임: "",
    수수료: "",
    메모: "",
  };

  const [form, setForm] = useState(emptyForm);

  /* ================= 24시콜 테스트 서버 전송 ================= */
  async function testSend24Call() {
    const payload = {
      authKey: process.env.REACT_APP_AUTH_KEY,
      data: encryptData({
        startAddr: form.상차지명 || "인천",
        endAddr: form.하차지명 || "서울",
        cargo: form.화물내용 || "테스트 화물",
      }),
    };

    try {
      const res = await fetch(
        `${process.env.REACT_APP_API_URL}/order/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const result = await res.json();
      console.log("📨 테스트 서버 응답:", result);
      alert("테스트 서버 전송 완료! (Console 확인)");
    } catch (err) {
      console.error("❌ 통신 오류:", err);
      alert("API 요청 실패! Console 확인!");
    }
  }

  // ================= dispatch 실시간 구독 =================
  useEffect(() => {
    if (isTest) {
      setDispatchData([]);
      return;
    }

    const unsub = onSnapshot(collection(db, "dispatch"), (snap) => {
      const list = snap.docs.map((d) => ({
        _id: d.id,
        ...d.data(),
      }));
      setDispatchData(list);
    });

    return () => unsub();
  }, [isTest, setDispatchData]);

  // ================= 배차 저장 =================
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isTest) return alert("🚫 테스트 계정은 등록 불가!");
    if (!form.거래처명) return alert("거래처명을 선택해주세요");

    const id = doc(db, "dispatch").id;
    await setDoc(doc(db, "dispatch", id), {
      ...form,
      청구운임: toNumber(form.청구운임),
      기사운임: toNumber(form.기사운임),
      수수료: toNumber(form.수수료),
      updatedAt: serverTimestamp(),
    });

    alert("배차 등록 완료!");
    setForm(emptyForm);
  };

  const disabled = isTest ? "bg-gray-200 pointer-events-none" : "";

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">배차관리</h2>

      {/* ================= 배차 입력 폼 ================= */}
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-6 gap-3 text-sm bg-gray-50 p-4 rounded"
      >
        {/* 거래처명 */}
        <div className="col-span-2">
          <label className="block text-xs mb-1">거래처명</label>
          <select
            value={form.거래처명}
            onChange={(e) =>
              setForm({ ...form, 거래처명: e.target.value })
            }
            disabled={isTest}
            className={`border p-2 w-full rounded ${disabled}`}
          >
            <option value="">거래처 선택</option>
            {(clients || []).map((c, i) => (
              <option key={i} value={c.거래처명}>
                {c.거래처명}
              </option>
            ))}
          </select>
        </div>

        {/* 화물내용 */}
        <div className="col-span-6">
          <label className="block text-xs mb-1">화물내용</label>
          <input
            value={form.화물내용}
            onChange={(e) =>
              setForm({ ...form, 화물내용: e.target.value })
            }
            disabled={isTest}
            className={`border p-2 w-full rounded ${disabled}`}
            placeholder="예: 10파렛트"
          />
        </div>

        {/* 버튼 */}
        <div className="col-span-6 text-center mt-3 flex gap-3 justify-center">
          <button
            type="submit"
            disabled={isTest}
            className={`px-6 py-2 rounded ${
              isTest
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            등록하기
          </button>

          <button
            type="button"
            onClick={testSend24Call}
            className="px-6 py-2 rounded bg-orange-500 text-white hover:bg-orange-600"
          >
            24시콜 테스트 🚚
          </button>
        </div>
      </form>

      {isTest && (
        <div className="text-center mt-3 text-red-500 font-bold">
          🚫 테스트 계정은 조회/저장/수정/삭제가 제한됩니다.
        </div>
      )}

      {/* 🔥 화주 요청 오더 영역 */}
      <ShipperOrderQueue />
    </div>
  );
}

/* ===================================================================
   🔥 화주 요청 오더 큐 + 배차 생성 연결 (완성본)
=================================================================== */
function ShipperOrderQueue() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
   const q = query(
  collection(db, "orders"),
  where("배차상태", "==", "요청"),
  orderBy("createdAt", "desc")
);

    const unsub = onSnapshot(q, (snap) => {
      setOrders(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }))
      );
    });

    return () => unsub();
  }, []);

  if (orders.length === 0) return null;

  return (
    <div className="mt-6 bg-white border rounded-xl p-5">
      <h3 className="font-bold mb-4">📦 화주 요청 오더</h3>

      <div className="space-y-3">
        {orders.map((o) => (
          <div
            key={o.id}
            className="border rounded-lg p-4 flex justify-between items-center"
          >
            <div>
              <div className="font-semibold">
                {o.pickup} → {o.dropoff}
              </div>
              <div className="text-sm text-gray-500">
                {o.date} {o.time} · {o.vehicle}
              </div>
            </div>

            <button
              onClick={() => createDispatchFromShipperOrder(o)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              배차 생성
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===================================================================
   🔗 화주 오더 → dispatch 생성 + 상태 변경
=================================================================== */
async function createDispatchFromShipperOrder(order) {
  // 1️⃣ dispatch 생성
  const dispatchRef = doc(collection(db, "dispatch"));

  await setDoc(dispatchRef, {
    등록일: new Date().toISOString().slice(0, 10),
    상차일: order.date || "",
    상차시간: order.time || "",
    하차일: order.date || "",
    하차시간: "",
    거래처명: order.company || "화주",
    상차지명: order.pickup,
    하차지명: order.dropoff,
    화물내용: order.memo || "",
    차량종류: "",
    차량톤수: order.vehicle || "",
    차량번호: "",
    이름: "",
    전화번호: "",
    배차상태: "배차중",
    지급방식: "",
    배차방식: "화주",
    청구운임: 0,
    기사운임: 0,
    수수료: 0,

    // 🔗 연결 키
    shipperOrderId: order.id,
    shipperUid: order.shipperUid,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 2️⃣ 화주 오더 상태 변경
await setDoc(
  doc(db, "orders", order.id),
  { 배차상태: "배차중" },
  { merge: true }
);
}
/* ===================================================================
   ✅ 배차 완료 처리 (dispatch + shipper_orders 동기화)
=================================================================== */
async function completeDispatch(dispatch) {
  // 1️⃣ dispatch 상태 완료
  await setDoc(
    doc(db, "dispatch", dispatch._id),
    {
      배차상태: "배차완료",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // 2️⃣ 화주 오더가 연결돼 있으면 같이 완료 처리
  if (dispatch.shipperOrderId) {
    await setDoc(
      doc(db, "shipper_orders", dispatch.shipperOrderId),
      { status: "배차완료" },
      { merge: true }
    );
  }
}
