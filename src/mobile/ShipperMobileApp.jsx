// ======================= src/mobile/ShipperMobileApp.jsx =======================
import React, { useState, useEffect, useMemo } from "react";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import {
  collection, query, where, onSnapshot,
  doc, getDoc, addDoc, updateDoc, serverTimestamp, getDocs,
} from "firebase/firestore";

// ======================================================================
// 유틸
// ======================================================================
const todayStr = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

const getDate = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

const fmtMoney = (v) => `${Number(v || 0).toLocaleString("ko-KR")}원`;

const HALF_HOUR_TIMES = (() => {
  const list = [];
  for (let h = 0; h < 24; h++) {
    for (const m of ["00", "30"]) {
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? "오전" : "오후";
      list.push(`${ampm} ${hour12}:${m}`);
    }
  }
  return list;
})();

const getStatusBadge = (o) => {
  if (o.차량번호) return { label: "배차완료", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" };
  return { label: "배차중", cls: "bg-blue-100 text-blue-700 border-blue-300" };
};

// ======================================================================
// 메인
// ======================================================================
export default function ShipperMobileApp() {
  const [page, setPage] = useState("home"); // home | order | history | detail
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [toast, setToast] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  // 인증
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        window.location.replace("/shipper-login");
        return;
      }
      setUser(u);
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) setUserData(snap.data());
    });
    return () => unsub();
  }, []);

  // 오더 구독
  useEffect(() => {
    if (!user || !userData) return;
    const q = query(
      collection(db, "orders"),
      where("shipperCompany", "==", userData.company)
    );
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user, userData]);

  // KPI
  const kpi = useMemo(() => ({
    total: orders.length,
    배차중: orders.filter((o) => !o.차량번호).length,
    완료: orders.filter((o) => !!o.차량번호).length,
    today: orders.filter((o) => String(o.상차일 || "").slice(0, 10) === todayStr()).length,
  }), [orders]);

  const logout = async () => {
    if (!window.confirm("로그아웃 하시겠습니까?")) return;
    await signOut(auth);
    window.location.replace("/shipper-login");
  };

  if (!user || !userData) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="text-gray-400 text-sm">권한 확인 중...</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col relative">

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50
                        bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* 사이드 메뉴 */}
      {showMenu && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMenu(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-xl flex flex-col">
            <div className="px-4 py-4 border-b flex items-center justify-between bg-[#1e3a5f]">
              <div className="text-white font-bold">KP-Flow 화주</div>
              <button className="text-white text-xl" onClick={() => setShowMenu(false)}>×</button>
            </div>
            <div className="flex-1 px-4 py-4 space-y-1">
              <MMenuItem label="🏠 홈" onClick={() => { setPage("home"); setShowMenu(false); }} />
              <MMenuItem label="📦 배차요청" onClick={() => { setPage("order"); setShowMenu(false); }} />
              <MMenuItem label="📋 운송내역" onClick={() => { setPage("history"); setShowMenu(false); }} />
            </div>
            <div className="border-t px-4 py-3">
              <div className="text-xs text-gray-400 mb-1">{userData.company}</div>
              <div className="text-sm text-gray-600 mb-3">{user.email}</div>
              <button
                onClick={logout}
                className="w-full py-2 bg-red-500 text-white rounded-lg text-sm font-semibold"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1e3a5f] sticky top-0 z-30">
        <button onClick={() => setShowMenu(true)} className="text-white text-sm font-semibold">
          MENU
        </button>
        <div className="text-white font-bold text-base">KP-Flow 화주</div>
        <div className="w-12" />
      </div>

      {/* 페이지 */}
      <div className="flex-1 overflow-y-auto pb-24">
        {page === "home" && (
          <ShipperHomeM
            kpi={kpi}
            orders={orders}
            onSelect={(o) => { setSelectedOrder(o); setPage("detail"); }}
            onGoOrder={() => setPage("order")}
          />
        )}
        {page === "order" && (
          <ShipperOrderM
            user={user}
            userData={userData}
            showToast={showToast}
            onDone={() => { setPage("history"); showToast("배차요청 완료!"); }}
            onBack={() => setPage("home")}
          />
        )}
        {page === "history" && (
          <ShipperHistoryM
            orders={orders}
            onSelect={(o) => { setSelectedOrder(o); setPage("detail"); }}
            onBack={() => setPage("home")}
          />
        )}
        {page === "detail" && selectedOrder && (
          <ShipperDetailM
            order={selectedOrder}
            onBack={() => setPage("history")}
          />
        )}
      </div>

      {/* 하단 탭바 */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md
                      bg-white border-t flex z-30">
        <TabBtn icon="🏠" label="홈" active={page === "home"} onClick={() => setPage("home")} />
        <TabBtn icon="📦" label="배차요청" active={page === "order"} onClick={() => setPage("order")} />
        <TabBtn icon="📋" label="운송내역" active={page === "history"} onClick={() => setPage("history")} />
      </div>
    </div>
  );
}

// ======================================================================
// 홈
// ======================================================================
function ShipperHomeM({ kpi, orders, onSelect, onGoOrder }) {
  const today = todayStr();
  const todayOrders = orders
    .filter((o) => String(o.상차일 || "").slice(0, 10) === today)
    .sort((a, b) => String(a.상차시간 || "").localeCompare(String(b.상차시간 || "")));

  const recentOrders = [...orders]
    .sort((a, b) => {
      const da = String(a.상차일 || "");
      const db = String(b.상차일 || "");
      return db.localeCompare(da);
    })
    .slice(0, 5);

  return (
    <div className="px-4 py-4 space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard title="전체 운송" value={kpi.total} color="text-gray-800" />
        <KpiCard title="오늘 운송" value={kpi.today} color="text-blue-600" />
        <KpiCard title="배차중" value={kpi.배차중} color="text-orange-500" />
        <KpiCard title="배차완료" value={kpi.완료} color="text-emerald-600" />
      </div>

      {/* 배차요청 버튼 */}
      <button
        onClick={onGoOrder}
        className="w-full py-4 bg-[#1e3a5f] text-white rounded-2xl font-bold text-base shadow"
      >
        + 배차요청
      </button>

      {/* 오늘 운송 */}
      <div>
        <div className="text-sm font-bold text-gray-700 mb-2">오늘 운송 ({todayOrders.length}건)</div>
        {todayOrders.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-6 bg-white rounded-xl border">
            오늘 운송 내역이 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {todayOrders.map((o) => (
              <OrderCard key={o.id} order={o} onSelect={() => onSelect(o)} />
            ))}
          </div>
        )}
      </div>

      {/* 최근 운송 */}
      <div>
        <div className="text-sm font-bold text-gray-700 mb-2">최근 운송</div>
        <div className="space-y-2">
          {recentOrders.map((o) => (
            <OrderCard key={o.id} order={o} onSelect={() => onSelect(o)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ======================================================================
// 배차요청 폼
// ======================================================================
// 교체 후
function ShipperOrderM({ user, userData, showToast, onDone, onBack }) {
  const [form, setForm] = useState({
    운송사명: "",
    운송사코드: "",
    상차지명: "",
    상차지주소: "",
    상차지담당자: "",
    상차지담당자번호: "",
    하차지명: "",
    하차지주소: "",
    하차지담당자: "",
    하차지담당자번호: "",
    상차일: getDate(0),
    상차시간: "오전 8:00",
    하차일: getDate(0),
    하차시간: "오후 12:00",
    차량종류: "",
    차량톤수: "",
    화물내용: "",
    상차방법: "",
    하차방법: "",
    지급방식: "",
  });

  const [transportList, setTransportList] = useState([]);
  const [fixedTransport, setFixedTransport] = useState(null);
  const [transportSuggestions, setTransportSuggestions] = useState([]);
  const [showTransportDrop, setShowTransportDrop] = useState(false);

  const [places, setPlaces] = useState([]);
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [dropSuggestions, setDropSuggestions] = useState([]);
  const [showPickupDrop, setShowPickupDrop] = useState(false);
  const [showDropDrop, setShowDropDrop] = useState(false);
  const [pickupIdx, setPickupIdx] = useState(-1);
  const [dropIdx, setDropIdx] = useState(-1);

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // 운송사 리스트 로드
  useEffect(() => {
    const saved = localStorage.getItem("transportList");
    if (saved) setTransportList(JSON.parse(saved));

    const fixed = localStorage.getItem("fixedTransport");
    if (fixed) {
      const p = JSON.parse(fixed);
      setFixedTransport(p);
      setForm(prev => ({ ...prev, 운송사명: p.name, 운송사코드: p.code || "" }));
    }
  }, []);

  // 교체 후
  // 장소 로드
  useEffect(() => {
    if (!user) return;

    const load = async () => {
      const snap = await getDocs(
        query(collection(db, "places"), where("userId", "==", user.uid))
      );
      const norm = (s = "") =>
        s.replace(/\(주\)|주식회사/g, "").replace(/\s/g, "").toLowerCase();
      const map = new Map();
      snap.docs.forEach((d) => {
        const data = d.data();
        const key = norm(data.name || "");
        if (
          !map.has(key) ||
          (data.createdAt?.seconds || 0) > (map.get(key).createdAt?.seconds || 0)
        ) {
          map.set(key, { id: d.id, ...data });
        }
      });
      setPlaces(Array.from(map.values()));
    };

    load();
  }, [user]);

  const searchPlaces = (val) => {
    if (!val.trim()) return [];
    const v = val.toLowerCase().replace(/\s/g, "");
    return places.filter(p => (p.name || "").toLowerCase().replace(/\s/g, "").includes(v)).slice(0, 8);
  };

  const applyPickup = (p) => {
    setForm(prev => ({
      ...prev,
      상차지명: p.name || "",
      상차지주소: p.address || "",
      상차지담당자: p.담당자명 || "",
      상차지담당자번호: p.담당자번호 || "",
    }));
    setShowPickupDrop(false);
    setPickupSuggestions([]);
    setPickupIdx(-1);
  };

  const applyDrop = (p) => {
    setForm(prev => ({
      ...prev,
      하차지명: p.name || "",
      하차지주소: p.address || "",
      하차지담당자: p.담당자명 || "",
      하차지담당자번호: p.담당자번호 || "",
    }));
    setShowDropDrop(false);
    setDropSuggestions([]);
    setDropIdx(-1);
  };

  const upsertPlace = async (name, address, 담당자명, 담당자번호, type) => {
    if (!name) return;
    const snap = await getDocs(
      query(collection(db, "places"), where("userId", "==", user.uid), where("name", "==", name))
    );
    if (!snap.empty) {
      await updateDoc(doc(db, "places", snap.docs[0].id), {
        address, 담당자명, 담당자번호, updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, "places"), {
        name, address, 담당자명, 담당자번호, type,
        userId: user.uid, createdAt: serverTimestamp(),
      });
    }
  };

  const submit = async () => {
    if (!form.상차지명 || !form.하차지명) {
      alert("상차지 / 하차지는 필수입니다.");
      return;
    }
    try {
      await upsertPlace(form.상차지명, form.상차지주소, form.상차지담당자, form.상차지담당자번호, "상차");
      await upsertPlace(form.하차지명, form.하차지주소, form.하차지담당자, form.하차지담당자번호, "하차");

      await addDoc(collection(db, "orders"), {
        ...form,
        shipperUid: user.uid,
        거래처명: userData.company,
        shipperCompany: userData.company,
        배차상태: "배차중",
        업체전달상태: "미전달",
        source: "shipper_mobile",
        createdAt: serverTimestamp(),
      });
      onDone();
    } catch (e) {
      console.error(e);
      alert("등록 실패");
    }
  };

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="text-gray-500">←</button>
        <div className="font-bold text-base">배차요청</div>
      </div>

      {/* 운송사 */}
      <Section title="운송사">
        <Row label="운송사명">
          <div className="relative">
            <input
              className="input-m"
              value={form.운송사명}
              disabled={!!fixedTransport}
              placeholder="운송사명 입력"
              onChange={(e) => {
                update("운송사명", e.target.value);
                const v = e.target.value.toLowerCase();
                const list = transportList.filter(t =>
                  (t.name || "").toLowerCase().includes(v)
                ).slice(0, 8);
                setTransportSuggestions(list);
                setShowTransportDrop(true);
              }}
              onBlur={() => setTimeout(() => setShowTransportDrop(false), 150)}
            />
            {showTransportDrop && transportSuggestions.length > 0 && (
              <div className="absolute z-50 w-full bg-white border rounded-lg shadow max-h-40 overflow-y-auto mt-1">
                {transportSuggestions.map((t, i) => (
                  <div key={i} className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50"
                    onMouseDown={() => {
                      update("운송사명", t.name);
                      update("운송사코드", t.code || "");
                      setShowTransportDrop(false);
                    }}>
                    {t.name}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <input type="checkbox" checked={!!fixedTransport}
              onChange={(e) => {
                if (e.target.checked) {
                  if (!form.운송사명) { alert("운송사를 먼저 선택하세요"); return; }
                  const d = { name: form.운송사명, code: form.운송사코드 };
                  setFixedTransport(d);
                  localStorage.setItem("fixedTransport", JSON.stringify(d));
                } else {
                  setFixedTransport(null);
                  localStorage.removeItem("fixedTransport");
                }
              }} />
            <span className="text-xs text-gray-500">운송사 고정</span>
          </div>
        </Row>
        <Row label="운송사코드">
          <input className="input-m bg-gray-50" value={form.운송사코드} readOnly placeholder="자동입력" />
        </Row>
      </Section>

      {/* 상차 */}
      <Section title="상차 정보">
        <Row label="상차지명">
          <div className="relative">
            <input
              className="input-m"
              value={form.상차지명}
              placeholder="상차지명"
              onChange={(e) => {
                update("상차지명", e.target.value);
                const list = searchPlaces(e.target.value);
                setPickupSuggestions(list);
                setShowPickupDrop(list.length > 0);
                setPickupIdx(-1);
              }}
              onKeyDown={(e) => {
                if (!showPickupDrop) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setPickupIdx(i => Math.min(i + 1, pickupSuggestions.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setPickupIdx(i => Math.max(i - 1, 0)); }
                if (e.key === "Enter" && pickupIdx >= 0) { e.preventDefault(); applyPickup(pickupSuggestions[pickupIdx]); }
                if (e.key === "Escape") setShowPickupDrop(false);
              }}
              onFocus={() => { if (form.상차지명) { const list = searchPlaces(form.상차지명); setPickupSuggestions(list); setShowPickupDrop(list.length > 0); } }}
              onBlur={() => setTimeout(() => setShowPickupDrop(false), 150)}
            />
            {showPickupDrop && pickupSuggestions.length > 0 && (
              <div className="absolute z-50 w-full bg-white border rounded-lg shadow max-h-40 overflow-y-auto mt-1">
                {pickupSuggestions.map((p, i) => (
                  <div key={p.id || i}
                    className={`px-3 py-2 text-sm cursor-pointer ${i === pickupIdx ? "bg-blue-100" : "hover:bg-gray-50"}`}
                    onMouseDown={() => applyPickup(p)}>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.address}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Row>
        <Row label="상차지주소"><input className="input-m" value={form.상차지주소} onChange={(e) => update("상차지주소", e.target.value)} placeholder="주소" /></Row>
        <Row label="담당자명"><input className="input-m" value={form.상차지담당자} onChange={(e) => update("상차지담당자", e.target.value)} placeholder="담당자명" /></Row>
        <Row label="담당자번호"><input className="input-m" value={form.상차지담당자번호} onChange={(e) => update("상차지담당자번호", e.target.value)} placeholder="연락처" /></Row>
        <Row label="상차일">
          <div className="flex gap-2">
            <input type="date" className="input-m flex-1" value={form.상차일} onChange={(e) => update("상차일", e.target.value)} />
            <button onClick={() => update("상차일", getDate(0))} className={`px-2 py-1 rounded text-xs border ${form.상차일 === getDate(0) ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}>당일</button>
            <button onClick={() => update("상차일", getDate(1))} className={`px-2 py-1 rounded text-xs border ${form.상차일 === getDate(1) ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}>내일</button>
          </div>
        </Row>
        <Row label="상차시간">
          <select className="input-m" value={form.상차시간} onChange={(e) => update("상차시간", e.target.value)}>
            {HALF_HOUR_TIMES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Row>
      </Section>

      {/* 하차 */}
      <Section title="하차 정보">
        <Row label="하차지명">
          <div className="relative">
            <input
              className="input-m"
              value={form.하차지명}
              placeholder="하차지명"
              onChange={(e) => {
                update("하차지명", e.target.value);
                const list = searchPlaces(e.target.value);
                setDropSuggestions(list);
                setShowDropDrop(list.length > 0);
                setDropIdx(-1);
              }}
              onKeyDown={(e) => {
                if (!showDropDrop) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setDropIdx(i => Math.min(i + 1, dropSuggestions.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setDropIdx(i => Math.max(i - 1, 0)); }
                if (e.key === "Enter" && dropIdx >= 0) { e.preventDefault(); applyDrop(dropSuggestions[dropIdx]); }
                if (e.key === "Escape") setShowDropDrop(false);
              }}
              onFocus={() => { if (form.하차지명) { const list = searchPlaces(form.하차지명); setDropSuggestions(list); setShowDropDrop(list.length > 0); } }}
              onBlur={() => setTimeout(() => setShowDropDrop(false), 150)}
            />
            {showDropDrop && dropSuggestions.length > 0 && (
              <div className="absolute z-50 w-full bg-white border rounded-lg shadow max-h-40 overflow-y-auto mt-1">
                {dropSuggestions.map((p, i) => (
                  <div key={p.id || i}
                    className={`px-3 py-2 text-sm cursor-pointer ${i === dropIdx ? "bg-blue-100" : "hover:bg-gray-50"}`}
                    onMouseDown={() => applyDrop(p)}>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.address}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Row>
        <Row label="하차지주소"><input className="input-m" value={form.하차지주소} onChange={(e) => update("하차지주소", e.target.value)} placeholder="주소" /></Row>
        <Row label="담당자명"><input className="input-m" value={form.하차지담당자} onChange={(e) => update("하차지담당자", e.target.value)} placeholder="담당자명" /></Row>
        <Row label="담당자번호"><input className="input-m" value={form.하차지담당자번호} onChange={(e) => update("하차지담당자번호", e.target.value)} placeholder="연락처" /></Row>
        <Row label="하차일">
          <div className="flex gap-2">
            <input type="date" className="input-m flex-1" value={form.하차일} onChange={(e) => update("하차일", e.target.value)} />
            <button onClick={() => update("하차일", getDate(0))} className={`px-2 py-1 rounded text-xs border ${form.하차일 === getDate(0) ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}>당일</button>
            <button onClick={() => update("하차일", getDate(1))} className={`px-2 py-1 rounded text-xs border ${form.하차일 === getDate(1) ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}>내일</button>
          </div>
        </Row>
        <Row label="하차시간">
          <select className="input-m" value={form.하차시간} onChange={(e) => update("하차시간", e.target.value)}>
            {HALF_HOUR_TIMES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Row>
      </Section>

      {/* 화물 */}
      <Section title="화물 / 차량">
        <Row label="차량종류">
          <select className="input-m" value={form.차량종류} onChange={(e) => update("차량종류", e.target.value)}>
            <option value="">선택</option>
            <option>라보/다마스</option><option>카고</option><option>윙바디</option>
            <option>탑차</option><option>냉장탑</option><option>냉동탑</option>
            <option>냉장윙</option><option>냉동윙</option><option>오토바이</option>
          </select>
        </Row>
        <Row label="톤수"><input className="input-m" value={form.차량톤수} onChange={(e) => update("차량톤수", e.target.value)} placeholder="예) 5톤" /></Row>
        <Row label="화물내용"><input className="input-m" value={form.화물내용} onChange={(e) => update("화물내용", e.target.value)} placeholder="화물내용" /></Row>
      </Section>

      {/* 작업방식/결제 */}
      <Section title="작업방식 / 결제">
        <Row label="상차방법">
          <select className="input-m" value={form.상차방법} onChange={(e) => update("상차방법", e.target.value)}>
            <option value="">선택</option><option>지게차</option><option>수작업</option><option>수도움</option>
          </select>
        </Row>
        <Row label="하차방법">
          <select className="input-m" value={form.하차방법} onChange={(e) => update("하차방법", e.target.value)}>
            <option value="">선택</option><option>지게차</option><option>수작업</option><option>수도움</option>
          </select>
        </Row>
        <Row label="지급방식">
          <select className="input-m" value={form.지급방식} onChange={(e) => update("지급방식", e.target.value)}>
            <option value="">선택</option><option>계산서</option><option>선불</option><option>착불</option>
          </select>
        </Row>
      </Section>

      <button onClick={submit}
        className="w-full py-4 bg-[#1e3a5f] text-white rounded-2xl font-bold text-base shadow mb-8">
        배차요청 등록
      </button>

      <style>{`.input-m { width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; font-size: 14px; background: white; }`}</style>
    </div>
  );
}
// ======================================================================
// 운송내역
// ======================================================================
function ShipperHistoryM({ orders, onSelect, onBack }) {
  const [startDate, setStartDate] = useState(getDate(-30));
  const [endDate, setEndDate] = useState(getDate(0));
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => {
    return orders
      .filter((o) => {
        const d = String(o.상차일 || "").slice(0, 10);
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        if (statusFilter) {
          const s = o.차량번호 ? "배차완료" : "배차중";
          if (s !== statusFilter) return false;
        }
        if (keyword) {
          const v = keyword.toLowerCase();
          return (
            (o.상차지명 || "").toLowerCase().includes(v) ||
            (o.하차지명 || "").toLowerCase().includes(v)
          );
        }
        return true;
      })
      .sort((a, b) => String(b.상차일 || "").localeCompare(String(a.상차일 || "")));
  }, [orders, startDate, endDate, keyword, statusFilter]);

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="text-gray-500">←</button>
        <div className="font-bold text-base">운송내역</div>
      </div>

      {/* 필터 */}
      <div className="bg-white border rounded-xl p-3 space-y-2">
        <div className="flex gap-2">
          <input type="date" className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
            value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span className="text-gray-400 self-center">~</span>
          <input type="date" className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
            value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
            placeholder="상/하차지 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <select className="border rounded-lg px-2 py-1.5 text-sm"
            value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">전체</option>
            <option value="배차중">배차중</option>
            <option value="배차완료">배차완료</option>
          </select>
        </div>
        <div className="text-xs text-gray-500">총 {filtered.length}건</div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-10">
          조회된 내역이 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <OrderCard key={o.id} order={o} onSelect={() => onSelect(o)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ======================================================================
// 상세보기
// ======================================================================
function ShipperDetailM({ order, onBack }) {
  const { label, cls } = getStatusBadge(order);

  const openMap = (addr) => {
    if (!addr) return alert("주소 정보가 없습니다.");
    window.open(`https://map.kakao.com/?q=${encodeURIComponent(addr)}`, "_blank");
  };

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="text-gray-500">←</button>
        <div className="font-bold text-base">운송 상세</div>
        <span className={`ml-auto px-2 py-0.5 rounded-full border text-xs font-semibold ${cls}`}>
          {label}
        </span>
      </div>

      {/* 기본정보 */}
      <Card>
        <DetailRow label="거래처" value={order.거래처명 || "-"} />
        <DetailRow label="상차일" value={`${order.상차일 || "-"} ${order.상차시간 || ""}`} />
        <DetailRow label="하차일" value={`${order.하차일 || "-"} ${order.하차시간 || ""}`} />
      </Card>

      {/* 상차지 */}
      <Card title="상차지">
        <DetailRow label="지명" value={order.상차지명 || "-"} />
        <DetailRow label="주소" value={order.상차지주소 || "-"} />
        {order.상차지담당자 && <DetailRow label="담당자" value={order.상차지담당자} />}
        {order.상차지담당자번호 && <DetailRow label="연락처" value={order.상차지담당자번호} />}
        <button onClick={() => openMap(order.상차지주소 || order.상차지명)}
          className="mt-2 w-full py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold">
          🗺 상차지 지도
        </button>
      </Card>

      {/* 하차지 */}
      <Card title="하차지">
        <DetailRow label="지명" value={order.하차지명 || "-"} />
        <DetailRow label="주소" value={order.하차지주소 || "-"} />
        {order.하차지담당자 && <DetailRow label="담당자" value={order.하차지담당자} />}
        {order.하차지담당자번호 && <DetailRow label="연락처" value={order.하차지담당자번호} />}
        <button onClick={() => openMap(order.하차지주소 || order.하차지명)}
          className="mt-2 w-full py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold">
          🗺 하차지 지도
        </button>
      </Card>

      {/* 화물 */}
      <Card title="화물 / 차량">
        <DetailRow label="차량종류" value={order.차량종류 || order.차종 || "-"} />
        <DetailRow label="톤수" value={order.차량톤수 || order.톤수 || "-"} />
        <DetailRow label="화물내용" value={order.화물내용 || "-"} />
        <DetailRow label="상차방법" value={order.상차방법 || "-"} />
        <DetailRow label="하차방법" value={order.하차방법 || "-"} />
      </Card>

      {/* 배차정보 */}
      {order.차량번호 && (
        <Card title="배차 정보">
          <DetailRow label="차량번호" value={order.차량번호} />
          <DetailRow label="기사명" value={order.기사명 || "-"} />
          <DetailRow label="연락처" value={order.전화번호 || "-"} />
          {order.전화번호 && (
            <div className="flex gap-2 mt-2">
              <a href={`tel:${order.전화번호}`}
                className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-sm font-semibold text-center">
                📞 전화
              </a>
              <a href={`sms:${order.전화번호}`}
                className="flex-1 py-2 bg-sky-500 text-white rounded-lg text-sm font-semibold text-center">
                💬 문자
              </a>
            </div>
          )}
        </Card>
      )}

      {/* 운임 */}
      <Card title="운임">
        <DetailRow label="청구운임" value={fmtMoney(order.청구운임)} />
        <DetailRow label="지급방식" value={order.지급방식 || "-"} />
      </Card>
    </div>
  );
}

// ======================================================================
// 공통 컴포넌트
// ======================================================================
function OrderCard({ order, onSelect }) {
  const { label, cls } = getStatusBadge(order);
  return (
    <div
      className="bg-white rounded-2xl border border-gray-200 shadow-sm px-3 py-3 active:scale-[0.99] transition"
      onClick={onSelect}
    >
      <div className="flex justify-between items-start mb-1">
        <div className="text-sm font-semibold text-gray-800 truncate flex-1">
          {order.상차지명 || "-"} → {order.하차지명 || "-"}
        </div>
        <span className={`ml-2 px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${cls}`}>
          {label}
        </span>
      </div>
      <div className="text-xs text-gray-500">
        {order.상차일 || "-"} {order.상차시간 || ""}
        {order.차량톤수 && ` · ${order.차량톤수}`}
        {order.차량종류 && ` ${order.차량종류}`}
      </div>
      {order.청구운임 > 0 && (
        <div className="text-xs text-blue-600 font-semibold mt-0.5">
          {fmtMoney(order.청구운임)}
        </div>
      )}
    </div>
  );
}

function KpiCard({ title, value, color }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
      <div className="text-xs text-gray-400 mb-1">{title}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b text-xs font-bold text-gray-600">{title}</div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-start px-3 py-2 gap-2">
      <div className="w-20 text-xs text-gray-500 pt-2 shrink-0">{label}</div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {title && (
        <div className="px-3 py-2 bg-gray-50 border-b text-xs font-bold text-gray-600">{title}</div>
      )}
      <div className="px-3 py-2 divide-y">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex py-1.5 gap-2">
      <div className="w-20 text-xs text-gray-400 shrink-0">{label}</div>
      <div className="flex-1 text-sm text-gray-800 font-medium">{value}</div>
    </div>
  );
}

function TabBtn({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center py-2 text-xs gap-0.5
        ${active ? "text-[#1e3a5f] font-bold" : "text-gray-400"}`}
    >
      <span className="text-lg">{icon}</span>
      {label}
    </button>
  );
}

function MMenuItem({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-100 text-sm font-medium"
    >
      {label}
    </button>
  );
}