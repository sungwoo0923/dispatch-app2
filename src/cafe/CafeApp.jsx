// ======================= src/cafe/CafeApp.jsx =======================
// 배차마당 — 운송사/화주/기사 누구나 가입해 오더를 올리고 서로 배차를 잡는
// 카페형 오더 공유 사이트. 디자인은 운송 프로그램과 동일한 네이비/그레이 톤을 쓴다.
import React, { useState, useEffect, useMemo } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { VEHICLE_TYPES, PAY_TYPES } from "./cafeConstants";
import { subscribeCafeOrders, subscribeMyCafeOrders } from "./cafeApi";
import CafeOrderCard from "./CafeOrderCard";
import CafeOrderForm from "./CafeOrderForm";
import CafeOrderDetail from "./CafeOrderDetail";

export default function CafeApp({ user }) {
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("board"); // board | live | mine
  const [orders, setOrders] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [q, setQ] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [payFilter, setPayFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid)).then(snap => {
      const d = snap.data() || {};
      setProfile({
        uid: user.uid, email: user.email,
        companyName: d.companyName || "", name: d.name || "", nickname: d.nickname || "", phone: d.phone || "",
      });
    });
  }, [user]);

  useEffect(() => {
    const unsub = subscribeCafeOrders(setOrders);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    const unsub = subscribeMyCafeOrders(profile.uid, setMyOrders);
    return () => unsub();
  }, [profile?.uid]);

  // 상세를 열어둔 채 실시간 갱신을 반영(신청중 → 배차완료 전환 등)
  useEffect(() => {
    if (!selectedOrder) return;
    const fresh = orders.find(o => o.id === selectedOrder.id) || myOrders.find(o => o.id === selectedOrder.id);
    if (fresh) setSelectedOrder(fresh);
  }, [orders, myOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const base = tab === "live" ? orders.filter(o => o.status === "open") : orders;
    const _q = q.trim().toLowerCase();
    return base.filter(o => {
      if (vehicleFilter && o.차량종류 !== vehicleFilter) return false;
      if (payFilter && o.지급방식 !== payFilter) return false;
      if (_q) {
        const hay = `${o.상차지명 || ""} ${o.하차지명 || ""} ${o.화물내용 || ""}`.toLowerCase();
        if (!hay.includes(_q)) return false;
      }
      return true;
    });
  }, [orders, tab, q, vehicleFilter, payFilter]);

  const logout = async () => { await signOut(auth); window.location.href = "/cafe-login"; };

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f6fa]">
        <div className="flex gap-2">
          {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-[#1B2B4B] animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />)}
        </div>
      </div>
    );
  }

  const listToShow = tab === "mine" ? myOrders : filtered;

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      {/* 상단 네비 */}
      <div className="bg-[#1B2B4B] sticky top-0 z-40">
        <div className="max-w-[1000px] mx-auto px-5 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-md bg-white/15 flex items-center justify-center text-white font-black text-[13px]">배</div>
            <span className="text-white font-black text-[15px] tracking-tight">배차마당</span>
          </div>
          <nav className="flex items-center gap-1 flex-1">
            {[["board", "홈"], ["live", "실시간현황"], ["mine", "내오더"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition ${tab === k ? "bg-white text-[#1B2B4B]" : "text-white/70 hover:bg-white/10"}`}>
                {l}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-white/70 text-[12px] hidden sm:inline">{profile.companyName} · {profile.nickname}</span>
            <button onClick={logout} className="text-white/60 hover:text-white text-[12px] font-semibold">로그아웃</button>
          </div>
        </div>
      </div>

      <div className="max-w-[1000px] mx-auto px-5 py-6">
        {tab !== "mine" && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="상/하차지, 화물내용 검색"
              className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] bg-white" />
            <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] bg-white">
              <option value="">차량종류 전체</option>
              {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={payFilter} onChange={e => setPayFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] bg-white">
              <option value="">지급방식 전체</option>
              {PAY_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <button onClick={() => { setEditingOrder(null); setFormOpen(true); }}
              className="px-4 py-2 rounded-lg bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition shrink-0">
              + 오더 등록
            </button>
          </div>
        )}

        {tab === "mine" && (
          <div className="flex items-center justify-between mb-5">
            <div className="text-[13px] text-gray-500">내가 등록한 오더 {myOrders.length}건</div>
            <button onClick={() => { setEditingOrder(null); setFormOpen(true); }}
              className="px-4 py-2 rounded-lg bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition">
              + 오더 등록
            </button>
          </div>
        )}

        {listToShow.length === 0 ? (
          <div className="py-24 text-center text-[13px] text-gray-400">등록된 오더가 없습니다.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {listToShow.map(o => (
              <CafeOrderCard key={o.id} order={o} onClick={() => setSelectedOrder(o)} />
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <CafeOrderForm
          profile={profile}
          editing={editingOrder}
          onClose={() => { setFormOpen(false); setEditingOrder(null); }}
          onSaved={() => { setFormOpen(false); setEditingOrder(null); }}
        />
      )}

      {selectedOrder && (
        <CafeOrderDetail
          order={selectedOrder}
          profile={profile}
          onClose={() => setSelectedOrder(null)}
          onEdit={(o) => { setSelectedOrder(null); setEditingOrder(o); setFormOpen(true); }}
        />
      )}
    </div>
  );
}
