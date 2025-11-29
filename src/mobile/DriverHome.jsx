// ======================= src/mobile/DriverHome.jsx =======================
import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import DriverOrderDetail from "./DriverOrderDetail";

export default function DriverHome() {
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const q = query(
      collection(db, "dispatch"),
      where("driverUid", "==", uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setOrders(list);
    });

    return () => unsub();
  }, []);

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-xl font-bold">📌 배차된 운행</h2>

      {orders.length === 0 && (
        <p className="text-center text-gray-500">배차 내역이 없습니다.</p>
      )}

      {orders.map((o) => (
        <div
          key={o.id}
          className="border rounded p-3 bg-white shadow-sm cursor-pointer"
          onClick={() => setSelected(o)}
        >
          <p className="font-bold">{o.화물내용 || "화물"}</p>
          <p>상차: {o.상차지명}</p>
          <p>하차: {o.하차지명}</p>
          <p>시간: {o.상차시간 || "-"}</p>
        </div>
      ))}

      {/* 상세 모달 */}
      {selected && (
        <DriverOrderDetail order={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
