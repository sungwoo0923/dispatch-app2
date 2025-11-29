// ======================= src/mobile/DriverOrderDetail.jsx =======================
import React from "react";
import { db, auth } from "../firebase";
import { doc, updateDoc, serverTimestamp, setDoc } from "firebase/firestore";

export default function DriverOrderDetail({ order, onClose }) {
  const driverId = auth.currentUser?.uid;

  const callPhone = () => {
    if (!order.상차전화) return alert("전화번호 없음");
    window.location.href = `tel:${order.상차전화}`;
  };

  const sendSMS = () => {
    if (!order.상차전화) return alert("전화번호 없음");
    window.location.href = `sms:${order.상차전화}`;
  };

  const openNavi = () => {
    if (!order.상차주소) return alert("주소 없음");
    const url = `https://map.kakao.com/?q=${encodeURIComponent(order.상차주소)}`;
    window.open(url, "_blank");
  };

  const finishOrder = async () => {
    const today = new Date().toISOString().slice(0, 10);

    try {
      // 🔹 배차 데이터 상태 업데이트
      await updateDoc(doc(db, "dispatch", order.id), {
        상태: "하차완료",
        완료시간: serverTimestamp(),
      });

      // 🔹 위치 데이터도 상태만 "대기중"으로
      await updateDoc(doc(db, "driver_locations", driverId), {
        status: "대기중",
        lastUpdated: serverTimestamp(),
      });

      // 🔹 운행 종료 리포트 저장 (기초 버전)
      await setDoc(
        doc(db, "driver_reports", `${driverId}_${today}`),
        {
          driverId,
          orderId: order.id,
          date: today,
          finishedAt: serverTimestamp(),
        },
        { merge: true }
      );

      alert("하차 완료 처리했습니다! 🎉");
      onClose(); // 모달 닫기
    } catch (err) {
      console.error(err);
      alert("오류 발생: " + err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-white w-80 p-5 rounded-lg space-y-3 animate-fadeIn">
        <h3 className="text-lg font-bold mb-2">{order.화물내용}</h3>

        <p>상차지: {order.상차지명}</p>
        <p>하차지: {order.하차지명}</p>
        <p>상차주소: {order.상차주소}</p>

        <button className="w-full bg-blue-500 text-white py-2 rounded" onClick={callPhone}>📞 전화</button>
        <button className="w-full bg-green-600 text-white py-2 rounded" onClick={sendSMS}>✉ 문자</button>
        <button className="w-full bg-orange-500 text-white py-2 rounded" onClick={openNavi}>🧭 길안내</button>

        <button className="w-full bg-emerald-600 text-white py-2 rounded font-bold" onClick={finishOrder}>
          ✔ 하차 완료
        </button>

        <button className="w-full bg-red-500 text-white py-2 rounded" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
// ======================= END =======================
