// ======================= src/mobile/ShipperMobileApp.jsx =======================
import React, { useState, useEffect, useMemo, useRef } from "react";
import { signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth, db } from "../firebase";
import {
  collection, query, where, onSnapshot,
  doc, getDoc, addDoc, updateDoc, serverTimestamp, getDocs,
  orderBy, limit,
} from "firebase/firestore";

// ======================================================================
// 유틸
// ======================================================================
const todayStr = () => {
  const kst = new Date(Date.now() + 9 * 3600000);
  return kst.toISOString().slice(0, 10);
};

const getDate = (offset = 0) => {
  const d = new Date(Date.now() + 9 * 3600000);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const fmtMoney = (v) => `${Number(v || 0).toLocaleString("ko-KR")}원`;

const fmtDateTime = (ts) => {
  if (!ts) return "-";
  let d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
  if (!d) return String(ts).slice(0, 10);
  const kst = new Date(d.getTime() + 9 * 3600000);
  return kst.toISOString().slice(0, 16).replace("T", " ");
};

const nowKSTStr = () => {
  const kst = new Date(Date.now() + 9 * 3600000);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const day = days[kst.getUTCDay()];
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const min = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${kst.getUTCFullYear()}.${mm}.${dd} (${day}) ${hh}:${min}`;
};

const TIME_OPTIONS = (() => {
  const list = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const h12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? "오전" : "오후";
      const label = `${ampm} ${h12}시${m > 0 ? ` ${m}분` : ""}`;
      list.push({ value, label });
    }
  }
  return list;
})();

const fmt12 = (t) => {
  if (!t) return "";
  if (t.includes("오전") || t.includes("오후")) {
    return t.replace(/:00$/, "시").replace(/:(\d{2})$/, (_, m) => `시 ${parseInt(m)}분`);
  }
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return t;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h < 12 ? "오전" : "오후"} ${h12}시${m > 0 ? ` ${m}분` : ""}`;
};

const getStatusBadge = (o) => {
  if (["취소", "배차취소", "오더취소"].includes(o.상태))
    return { label: "취소", cls: "bg-red-100 text-red-600 border-red-300" };
  if (o.차량번호) return { label: "배차완료", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" };
  return { label: "배차중", cls: "bg-blue-100 text-blue-700 border-blue-300" };
};

const parseTonnage = (val = "") => {
  if (!val) return { num: "", unit: "톤" };
  const kg = val.match(/^([\d.]+)\s*kg$/i);
  if (kg) return { num: kg[1], unit: "kg" };
  const ton = val.match(/^([\d.]*)\s*톤?$/);
  if (ton) return { num: ton[1].replace("톤", ""), unit: "톤" };
  return { num: val, unit: "없음" };
};

const 차량종류목록 = ["라보/다마스", "카고", "윙바디", "탑차", "냉장탑", "냉동탑", "냉장윙", "냉동윙", "오토바이"];
const 화물단위목록 = ["파레트", "박스", "없음", "개"];
const 톤수단위목록 = ["톤", "kg", "없음"];
const NAVY = "#1e3a5f";
const EMPTY_FORM = () => ({
  운송사명: "", 운송사코드: "",
  상차지명: "", 상차지주소: "", 상차지담당자: "", 상차지담당자번호: "",
  하차지명: "", 하차지주소: "", 하차지담당자: "", 하차지담당자번호: "",
  상차일: getDate(0), 상차시간: "08:00", 상차시간구분: "이후",
  하차일: getDate(0), 하차시간: "12:00", 하차시간구분: "이후",
  차량종류: "", 톤수값: "", 톤수단위: "톤",
  화물내용: "", 화물단위: "파레트",
  상차방법: "", 하차방법: "", 지급방식: "", 청구운임: "",
});

// ======================================================================
// 메인
// ======================================================================
export default function ShipperMobileApp() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [toast, setToast] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [menuTime, setMenuTime] = useState(nowKSTStr());

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  useEffect(() => {
    const t = setInterval(() => setMenuTime(nowKSTStr()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) { window.location.replace("/shipper-login"); return; }
      setUser(u);
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) setUserData(snap.data());
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || !userData) return;
    const q = query(collection(db, "orders"), where("shipperCompany", "==", userData.company));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user, userData]);

  const kpi = useMemo(() => ({
    total: orders.length,
    배차중: orders.filter((o) => !o.차량번호 && o.상태 !== "취소").length,
    완료: orders.filter((o) => !!o.차량번호).length,
    today: orders.filter((o) => String(o.상차일 || "").slice(0, 10) === todayStr()).length,
  }), [orders]);

  const logout = async () => {
    if (!window.confirm("로그아웃 하시겠습니까?")) return;
    await signOut(auth);
    window.location.replace("/shipper-login");
  };

  const navTo = (p) => { setPage(p); setShowMenu(false); };

  if (!user || !userData) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="text-gray-400 text-sm">권한 확인 중...</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col relative">

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* 사이드 메뉴 */}
      {showMenu && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMenu(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-xl flex flex-col">
            <div className="px-4 py-4 border-b" style={{ background: NAVY }}>
              <div className="text-white font-bold text-base mb-1">KP-Flow 화주</div>
              <div className="text-blue-200 text-xs">{menuTime}</div>
            </div>
            <div className="flex-1 px-4 py-3 space-y-1 overflow-y-auto">
              <div className="text-xs text-gray-400 font-semibold px-2 py-1 mt-1">메뉴</div>
              <MMenuItem label="홈" active={page === "home"} onClick={() => navTo("home")} />
              <MMenuItem label="배차요청" active={page === "order"} onClick={() => navTo("order")} />
              <MMenuItem label="운송내역" active={page === "history"} onClick={() => navTo("history")} />
              <div className="text-xs text-gray-400 font-semibold px-2 py-1 mt-2">정보</div>
              <MMenuItem label="공지사항" active={page === "notice"} onClick={() => navTo("notice")} />
              <MMenuItem label="문의사항" active={page === "inquiry"} onClick={() => navTo("inquiry")} />
              <MMenuItem label="마이페이지" active={page === "mypage"} onClick={() => navTo("mypage")} />
            </div>
            <div className="border-t px-4 py-3">
              <div className="text-xs text-gray-400 mb-0.5">{userData.company}</div>
              <div className="text-sm text-gray-600 mb-3">{user.email}</div>
              <button onClick={logout} className="w-full py-2 bg-red-500 text-white rounded-lg text-sm font-semibold">
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 sticky top-0 z-30" style={{ background: NAVY }}>
        <button onClick={() => setShowMenu(true)} className="text-white text-sm font-semibold">MENU</button>
        <div className="text-white font-bold text-base">KP-Flow 화주</div>
        <button onClick={() => navTo("mypage")} className="text-white text-xs opacity-80">
          {userData.name || user.email?.split("@")[0]}
        </button>
      </div>

      {/* 페이지 */}
      <div className="flex-1 overflow-y-auto pb-24">
        {page === "home" && (
          <ShipperHomeM kpi={kpi} orders={orders}
            onSelect={(o) => { setSelectedOrder(o); setPage("detail"); }}
            onGoOrder={() => setPage("order")} />
        )}
        {page === "order" && (
          <ShipperOrderM user={user} userData={userData} orders={orders} showToast={showToast}
            onDone={() => { setPage("history"); showToast("배차요청 완료!"); }}
            onBack={() => setPage("home")} />
        )}
        {page === "history" && (
          <ShipperHistoryM orders={orders}
            onSelect={(o) => { setSelectedOrder(o); setPage("detail"); }}
            onBack={() => setPage("home")} />
        )}
        {page === "detail" && selectedOrder && (
          <ShipperDetailM order={selectedOrder} onBack={() => setPage("history")} />
        )}
        {page === "mypage" && (
          <ShipperMyPageM user={user} userData={userData} onBack={() => setPage("home")} showToast={showToast} orders={orders} />
        )}
        {page === "notice" && (
          <ShipperNoticeM onBack={() => setPage("home")} />
        )}
        {page === "inquiry" && (
          <ShipperInquiryM user={user} userData={userData} onBack={() => setPage("home")} showToast={showToast} />
        )}
      </div>

      {/* 하단 탭바 */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t flex z-30">
        <TabBtn label="홈" active={page === "home"} onClick={() => setPage("home")} />
        <TabBtn label="배차요청" active={page === "order"} onClick={() => setPage("order")} />
        <TabBtn label="운송내역" active={page === "history"} onClick={() => setPage("history")} />
      </div>
    </div>
  );
}

// ======================================================================
// 홈
// ======================================================================
function ShipperHomeM({ kpi, orders, onSelect, onGoOrder }) {
  const [viewDate, setViewDate] = useState(todayStr());
  const [queriedDate, setQueriedDate] = useState(todayStr());

  const viewOrders = orders
    .filter((o) => String(o.상차일 || "").slice(0, 10) === queriedDate && o.상태 !== "취소")
    .sort((a, b) => String(a.상차시간 || "").localeCompare(String(b.상차시간 || "")));

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard title="전체 운송" value={kpi.total} color="text-gray-800" />
        <KpiCard title="오늘 운송" value={kpi.today} color="text-blue-600" />
        <KpiCard title="배차중" value={kpi.배차중} color="text-orange-500" />
        <KpiCard title="배차완료" value={kpi.완료} color="text-emerald-600" />
      </div>

      <button onClick={onGoOrder}
        className="w-full py-4 text-white rounded-2xl font-bold text-base shadow"
        style={{ background: NAVY }}>
        + 배차요청
      </button>

      <div>
        {/* 날짜 조회 */}
        <div className="flex gap-2 mb-2">
          <input type="date" value={viewDate} onChange={(e) => setViewDate(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          <button onClick={() => setQueriedDate(viewDate)}
            className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg shrink-0"
            style={{ background: NAVY }}>
            조회
          </button>
          {queriedDate !== todayStr() && (
            <button onClick={() => { setViewDate(todayStr()); setQueriedDate(todayStr()); }}
              className="px-3 py-1.5 text-xs font-semibold border rounded-lg shrink-0 text-gray-600">
              오늘
            </button>
          )}
        </div>
        <div className="text-sm font-bold text-gray-700 mb-2">
          {queriedDate === todayStr() ? "오늘" : queriedDate} 운송 ({viewOrders.length}건)
        </div>
        {viewOrders.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-6 bg-white rounded-xl border">
            해당 날짜의 운송이 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {viewOrders.map((o) => <OrderCard key={o.id} order={o} onSelect={() => onSelect(o)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ======================================================================
// 배차요청 폼
// ======================================================================
function ShipperOrderM({ user, userData, orders = [], showToast, onDone, onBack }) {
  const [form, setForm] = useState(EMPTY_FORM());
  const [transportList, setTransportList] = useState([]);
  const [fixedTransport, setFixedTransport] = useState(null);
  const [transportSuggestions, setTransportSuggestions] = useState([]);
  const [showTransportDrop, setShowTransportDrop] = useState(false);
  const [places, setPlaces] = useState([]);
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [dropSuggestions, setDropSuggestions] = useState([]);
  const [showPickupDrop, setShowPickupDrop] = useState(false);
  const [showDropDrop, setShowDropDrop] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySearch, setCopySearch] = useState("");
  const [copyType, setCopyType] = useState("통합");
  const [copyResults, setCopyResults] = useState(null);

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // 운송사 리스트
  useEffect(() => {
    let list = [];
    const saved = localStorage.getItem("transportList");
    if (saved) { try { list = JSON.parse(saved); } catch {} }
    if (list.length === 0 && orders.length > 0) {
      const nameMap = new Map();
      orders.forEach(o => {
        if (o.운송사명 && !nameMap.has(o.운송사명))
          nameMap.set(o.운송사명, { name: o.운송사명, code: o.운송사코드 || "" });
      });
      list = Array.from(nameMap.values());
    }
    setTransportList(list);
    const fixed = localStorage.getItem("fixedTransport");
    if (fixed) {
      try {
        const p = JSON.parse(fixed);
        setFixedTransport(p);
        setForm(prev => ({ ...prev, 운송사명: p.name, 운송사코드: p.code || "" }));
      } catch {}
    }
  }, [orders]);

  // 장소 로드
  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "places"), where("userId", "==", user.uid))).then(snap => {
      const map = new Map();
      snap.docs.forEach(d => {
        const data = d.data();
        const key = (data.name || "").replace(/\s/g, "").toLowerCase();
        if (!map.has(key) || (data.createdAt?.seconds || 0) > (map.get(key).createdAt?.seconds || 0))
          map.set(key, { id: d.id, ...data });
      });
      setPlaces(Array.from(map.values()));
    });
  }, [user]);

  const searchPlaces = (val) => {
    if (!val.trim()) return [];
    const v = val.toLowerCase().replace(/\s/g, "");
    return places.filter(p => (p.name || "").toLowerCase().replace(/\s/g, "").includes(v)).slice(0, 8);
  };

  const applyPickup = (p) => {
    setForm(prev => ({ ...prev, 상차지명: p.name || "", 상차지주소: p.address || "", 상차지담당자: p.담당자명 || "", 상차지담당자번호: p.담당자번호 || "" }));
    setShowPickupDrop(false); setPickupSuggestions([]);
  };
  const applyDrop = (p) => {
    setForm(prev => ({ ...prev, 하차지명: p.name || "", 하차지주소: p.address || "", 하차지담당자: p.담당자명 || "", 하차지담당자번호: p.담당자번호 || "" }));
    setShowDropDrop(false); setDropSuggestions([]);
  };

  // 오더 복사
  const doCopySearch = () => {
    const v = copySearch.toLowerCase();
    const result = orders.filter(o => {
      if (!v) return true;
      if (copyType === "상차지") return (o.상차지명 || "").toLowerCase().includes(v);
      if (copyType === "하차지") return (o.하차지명 || "").toLowerCase().includes(v);
      if (copyType === "거래처") return (o.거래처명 || "").toLowerCase().includes(v);
      return (o.상차지명 || "").toLowerCase().includes(v) ||
        (o.하차지명 || "").toLowerCase().includes(v) ||
        (o.거래처명 || "").toLowerCase().includes(v);
    }).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 50);
    setCopyResults(result);
  };

  const copyFrom = (src) => {
    const { num, unit } = parseTonnage(src.차량톤수 || "");
    setForm(prev => ({
      ...prev,
      운송사명: fixedTransport?.name || src.운송사명 || "",
      운송사코드: fixedTransport?.code || src.운송사코드 || "",
      상차지명: src.상차지명 || "", 상차지주소: src.상차지주소 || "",
      상차지담당자: src.상차지담당자 || src.상차담당자명 || "",
      상차지담당자번호: src.상차지담당자번호 || src.상차담당자번호 || "",
      하차지명: src.하차지명 || "", 하차지주소: src.하차지주소 || "",
      하차지담당자: src.하차지담당자 || src.하차담당자명 || "",
      하차지담당자번호: src.하차지담당자번호 || src.하차담당자번호 || "",
      차량종류: src.차량종류 || "", 톤수값: num, 톤수단위: unit,
      화물내용: src.화물내용 || "", 화물단위: src.화물단위 || "파레트",
      상차방법: src.상차방법 || "", 하차방법: src.하차방법 || "",
      지급방식: src.지급방식 || "", 청구운임: src.청구운임 || "",
    }));
    setCopyOpen(false);
    showToast("오더 복사 완료");
  };

  const upsertPlace = async (name, address, 담당자명, 담당자번호, type) => {
    if (!name) return;
    const snap = await getDocs(query(collection(db, "places"), where("userId", "==", user.uid), where("name", "==", name)));
    if (!snap.empty) {
      await updateDoc(doc(db, "places", snap.docs[0].id), { address, 담당자명, 담당자번호, updatedAt: serverTimestamp() });
    } else {
      await addDoc(collection(db, "places"), { name, address, 담당자명, 담당자번호, type, userId: user.uid, company: userData?.company || "", createdAt: serverTimestamp() });
    }
  };

  const submit = async () => {
    if (!form.상차지명 || !form.하차지명) { alert("상차지 / 하차지는 필수입니다."); return; }
    setSubmitting(true);
    try {
      await upsertPlace(form.상차지명, form.상차지주소, form.상차지담당자, form.상차지담당자번호, "상차");
      await upsertPlace(form.하차지명, form.하차지주소, form.하차지담당자, form.하차지담당자번호, "하차");
      const 차량톤수 = form.톤수단위 === "없음" ? "" : form.톤수값 ? `${form.톤수값}${form.톤수단위}` : "";
      await addDoc(collection(db, "orders"), {
        ...form,
        차량톤수,
        톤수값: undefined,
        톤수단위: undefined,
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
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-gray-500 text-lg">←</button>
          <div className="font-bold text-base">배차요청</div>
        </div>
        <button onClick={() => setCopyOpen(true)}
          className="px-3 py-1.5 text-xs border rounded-lg font-semibold text-gray-600 hover:bg-gray-100">
          오더 복사
        </button>
      </div>

      {/* 운송사 */}
      <MSection title="운송사">
        <MRow label="운송사명">
          <div className="relative">
            <input className="input-m" value={form.운송사명} disabled={!!fixedTransport}
              placeholder="운송사명 입력"
              onChange={(e) => {
                update("운송사명", e.target.value);
                const v = e.target.value.toLowerCase();
                setTransportSuggestions(transportList.filter(t => (t.name || "").toLowerCase().includes(v)).slice(0, 8));
                setShowTransportDrop(true);
              }}
              onBlur={() => setTimeout(() => setShowTransportDrop(false), 150)}
            />
            {showTransportDrop && transportSuggestions.length > 0 && (
              <div className="absolute z-50 w-full bg-white border rounded-lg shadow max-h-40 overflow-y-auto mt-1">
                {transportSuggestions.map((t, i) => (
                  <div key={i} className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50"
                    onMouseDown={() => { update("운송사명", t.name); update("운송사코드", t.code || ""); setShowTransportDrop(false); }}>
                    {t.name} {t.code ? <span className="text-gray-400 text-xs">({t.code})</span> : ""}
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
                  setFixedTransport(d); localStorage.setItem("fixedTransport", JSON.stringify(d));
                } else {
                  setFixedTransport(null); localStorage.removeItem("fixedTransport");
                }
              }} />
            <span className="text-xs text-gray-500">운송사 고정</span>
          </div>
        </MRow>
        <MRow label="운송사코드">
          <input className="input-m bg-gray-50" value={form.운송사코드}
            onChange={(e) => update("운송사코드", e.target.value)} placeholder="자동입력" />
        </MRow>
      </MSection>

      {/* 상차 */}
      <MSection title="상차 정보">
        <MRow label="상차지명">
          <div className="relative">
            <input className="input-m" value={form.상차지명} placeholder="상차지명"
              onChange={(e) => {
                update("상차지명", e.target.value);
                const list = searchPlaces(e.target.value);
                setPickupSuggestions(list); setShowPickupDrop(list.length > 0);
              }}
              onFocus={() => { if (form.상차지명) { const list = searchPlaces(form.상차지명); setPickupSuggestions(list); setShowPickupDrop(list.length > 0); } }}
              onBlur={() => setTimeout(() => setShowPickupDrop(false), 150)} />
            {showPickupDrop && pickupSuggestions.length > 0 && (
              <div className="absolute z-50 w-full bg-white border rounded-lg shadow max-h-40 overflow-y-auto mt-1">
                {pickupSuggestions.map((p, i) => (
                  <div key={p.id || i} className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                    onMouseDown={() => applyPickup(p)}>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.address}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </MRow>
        <MRow label="상차지주소"><input className="input-m" value={form.상차지주소} onChange={(e) => update("상차지주소", e.target.value)} placeholder="주소" /></MRow>
        <MRow label="담당자명"><input className="input-m" value={form.상차지담당자} onChange={(e) => update("상차지담당자", e.target.value)} placeholder="담당자명" /></MRow>
        <MRow label="담당자번호"><input className="input-m" value={form.상차지담당자번호} onChange={(e) => update("상차지담당자번호", e.target.value)} placeholder="연락처" /></MRow>
        <MRow label="상차일">
          <div className="flex gap-2">
            <input type="date" className="input-m flex-1" value={form.상차일} onChange={(e) => update("상차일", e.target.value)} />
            <button onClick={() => update("상차일", getDate(0))} className={`px-2 py-1 rounded text-xs border shrink-0 ${form.상차일 === getDate(0) ? "text-white border-blue-600" : "bg-white"}`} style={form.상차일 === getDate(0) ? { background: NAVY } : {}}>당일</button>
            <button onClick={() => update("상차일", getDate(1))} className={`px-2 py-1 rounded text-xs border shrink-0 ${form.상차일 === getDate(1) ? "text-white border-blue-600" : "bg-white"}`} style={form.상차일 === getDate(1) ? { background: NAVY } : {}}>내일</button>
          </div>
        </MRow>
        <MRow label="상차시간">
          <div className="flex gap-2">
            <select className="input-m" style={{ flex: 3 }} value={form.상차시간} onChange={(e) => update("상차시간", e.target.value)}>
              {TIME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select className="input-m" style={{ flex: 1, minWidth: 0 }} value={form.상차시간구분} onChange={(e) => update("상차시간구분", e.target.value)}>
              <option value="이후">이후</option>
              <option value="이전">이전</option>
              <option value="정각">정각</option>
            </select>
          </div>
        </MRow>
      </MSection>

      {/* 하차 */}
      <MSection title="하차 정보">
        <MRow label="하차지명">
          <div className="relative">
            <input className="input-m" value={form.하차지명} placeholder="하차지명"
              onChange={(e) => {
                update("하차지명", e.target.value);
                const list = searchPlaces(e.target.value);
                setDropSuggestions(list); setShowDropDrop(list.length > 0);
              }}
              onFocus={() => { if (form.하차지명) { const list = searchPlaces(form.하차지명); setDropSuggestions(list); setShowDropDrop(list.length > 0); } }}
              onBlur={() => setTimeout(() => setShowDropDrop(false), 150)} />
            {showDropDrop && dropSuggestions.length > 0 && (
              <div className="absolute z-50 w-full bg-white border rounded-lg shadow max-h-40 overflow-y-auto mt-1">
                {dropSuggestions.map((p, i) => (
                  <div key={p.id || i} className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                    onMouseDown={() => applyDrop(p)}>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.address}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </MRow>
        <MRow label="하차지주소"><input className="input-m" value={form.하차지주소} onChange={(e) => update("하차지주소", e.target.value)} placeholder="주소" /></MRow>
        <MRow label="담당자명"><input className="input-m" value={form.하차지담당자} onChange={(e) => update("하차지담당자", e.target.value)} placeholder="담당자명" /></MRow>
        <MRow label="담당자번호"><input className="input-m" value={form.하차지담당자번호} onChange={(e) => update("하차지담당자번호", e.target.value)} placeholder="연락처" /></MRow>
        <MRow label="하차일">
          <div className="flex gap-2">
            <input type="date" className="input-m flex-1" value={form.하차일} onChange={(e) => update("하차일", e.target.value)} />
            <button onClick={() => update("하차일", getDate(0))} className={`px-2 py-1 rounded text-xs border shrink-0 ${form.하차일 === getDate(0) ? "text-white border-blue-600" : "bg-white"}`} style={form.하차일 === getDate(0) ? { background: NAVY } : {}}>당일</button>
            <button onClick={() => update("하차일", getDate(1))} className={`px-2 py-1 rounded text-xs border shrink-0 ${form.하차일 === getDate(1) ? "text-white border-blue-600" : "bg-white"}`} style={form.하차일 === getDate(1) ? { background: NAVY } : {}}>내일</button>
          </div>
        </MRow>
        <MRow label="하차시간">
          <div className="flex gap-2">
            <select className="input-m" style={{ flex: 3 }} value={form.하차시간} onChange={(e) => update("하차시간", e.target.value)}>
              {TIME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select className="input-m" style={{ flex: 1, minWidth: 0 }} value={form.하차시간구분} onChange={(e) => update("하차시간구분", e.target.value)}>
              <option value="이후">이후</option>
              <option value="이전">이전</option>
              <option value="정각">정각</option>
            </select>
          </div>
        </MRow>
      </MSection>

      {/* 화물 / 차량 */}
      <MSection title="화물 / 차량">
        <MRow label="차량종류">
          <select className="input-m" value={form.차량종류} onChange={(e) => update("차량종류", e.target.value)}>
            <option value="">선택</option>
            {차량종류목록.map(v => <option key={v}>{v}</option>)}
          </select>
        </MRow>
        <MRow label="톤수">
          <div className="flex gap-2">
            <input className="input-m" style={{ flex: 2 }} value={form.톤수값}
              placeholder="숫자 입력" inputMode="decimal"
              onChange={(e) => update("톤수값", e.target.value.replace(/[^0-9.]/g, ""))} />
            <select className="input-m" style={{ flex: 1, minWidth: 0 }} value={form.톤수단위} onChange={(e) => update("톤수단위", e.target.value)}>
              {톤수단위목록.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
        </MRow>
        <MRow label="화물내용">
          <div className="flex gap-2">
            <input className="input-m" style={{ flex: 2 }} value={form.화물내용}
              onChange={(e) => update("화물내용", e.target.value)} placeholder="화물내용" />
            <select className="input-m" style={{ flex: 1, minWidth: 0 }} value={form.화물단위} onChange={(e) => update("화물단위", e.target.value)}>
              {화물단위목록.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
        </MRow>
      </MSection>

      {/* 작업방식/결제 */}
      <MSection title="작업방식 / 결제">
        <MRow label="상차방법">
          <select className="input-m" value={form.상차방법} onChange={(e) => update("상차방법", e.target.value)}>
            <option value="">선택</option><option>지게차</option><option>수작업</option><option>수도움</option><option>크레인</option>
          </select>
        </MRow>
        <MRow label="하차방법">
          <select className="input-m" value={form.하차방법} onChange={(e) => update("하차방법", e.target.value)}>
            <option value="">선택</option><option>지게차</option><option>수작업</option><option>수도움</option><option>크레인</option>
          </select>
        </MRow>
        <MRow label="지급방식">
          <select className="input-m" value={form.지급방식} onChange={(e) => update("지급방식", e.target.value)}>
            <option value="">선택</option><option>계산서</option><option>선불</option><option>착불</option><option>계좌이체</option>
          </select>
        </MRow>
        <MRow label="청구운임">
          <input className="input-m" type="number" value={form.청구운임}
            onChange={(e) => update("청구운임", e.target.value)} placeholder="0" />
        </MRow>
      </MSection>

      <button onClick={submit} disabled={submitting}
        className="w-full py-4 text-white rounded-2xl font-bold text-base shadow mb-8 disabled:opacity-50"
        style={{ background: NAVY }}>
        {submitting ? "등록중..." : "배차요청 등록"}
      </button>

      {/* 오더 복사 모달 */}
      {copyOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end">
          <div className="w-full bg-white rounded-t-2xl max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ background: NAVY }}>
              <div className="text-white font-bold">오더 복사</div>
              <button onClick={() => { setCopyOpen(false); setCopyResults(null); setCopySearch(""); }} className="text-white text-xl">×</button>
            </div>
            <div className="px-3 py-2 border-b space-y-2">
              <div className="flex gap-2">
                <select className="input-m w-24 shrink-0" value={copyType} onChange={(e) => setCopyType(e.target.value)}>
                  <option value="통합">통합</option>
                  <option value="상차지">상차지</option>
                  <option value="하차지">하차지</option>
                  <option value="거래처">거래처</option>
                </select>
                <input className="input-m flex-1" value={copySearch}
                  onChange={(e) => setCopySearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doCopySearch()}
                  placeholder="검색어 입력" />
                <button onClick={doCopySearch}
                  className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg shrink-0"
                  style={{ background: NAVY }}>
                  조회
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-3 py-2 space-y-2">
              {copyResults === null ? (
                <div className="text-center text-gray-400 text-sm py-10">
                  검색어를 입력하고 조회 버튼을 누르세요
                </div>
              ) : copyResults.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-10">검색 결과가 없습니다.</div>
              ) : copyResults.map(o => (
                <button key={o.id} className="w-full text-left bg-gray-50 border rounded-xl p-3 active:bg-blue-50"
                  onClick={() => copyFrom(o)}>
                  <div className="text-sm font-semibold text-gray-800">
                    {o.상차지명 || "-"} → {o.하차지명 || "-"}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {o.상차일 || "-"} · {o.차량종류 || ""} {o.차량톤수 || ""}
                  </div>
                  {(o.상차지담당자 || o.상차담당자명) && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      상차 담당: {o.상차지담당자 || o.상차담당자명}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`.input-m { width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; font-size: 14px; background: white; outline: none; box-sizing: border-box; }`}</style>
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
  const [searchType, setSearchType] = useState("통합");
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
          if (searchType === "상차지") return (o.상차지명 || "").toLowerCase().includes(v);
          if (searchType === "하차지") return (o.하차지명 || "").toLowerCase().includes(v);
          if (searchType === "거래처") return (o.거래처명 || "").toLowerCase().includes(v);
          if (searchType === "차량번호") return (o.차량번호 || "").toLowerCase().includes(v);
          return (o.상차지명 || "").toLowerCase().includes(v) ||
            (o.하차지명 || "").toLowerCase().includes(v) ||
            (o.거래처명 || "").toLowerCase().includes(v);
        }
        return true;
      })
      .sort((a, b) => String(b.상차일 || "").localeCompare(String(a.상차일 || "")));
  }, [orders, startDate, endDate, keyword, searchType, statusFilter]);

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="text-gray-500 text-lg">←</button>
        <div className="font-bold text-base">운송내역</div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="flex gap-2">
          <input type="date" className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
            value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span className="text-gray-400 self-center text-sm">~</span>
          <input type="date" className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
            value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <select className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-24 shrink-0"
            value={searchType} onChange={(e) => setSearchType(e.target.value)}>
            <option value="통합">통합</option>
            <option value="상차지">상차지</option>
            <option value="하차지">하차지</option>
            <option value="거래처">거래처</option>
            <option value="차량번호">차량번호</option>
          </select>
          <input className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
            placeholder="검색어 입력"
            value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {[{ label: "전체", value: "" }, { label: "배차중", value: "배차중" }, { label: "배차완료", value: "배차완료" }].map(s => (
            <button key={s.value} onClick={() => setStatusFilter(s.value)}
              className={`flex-1 py-1.5 text-xs rounded-lg border font-semibold transition ${statusFilter === s.value ? "text-white border-blue-600" : "border-gray-200 text-gray-600"}`}
              style={statusFilter === s.value ? { background: NAVY } : {}}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-gray-400">총 {filtered.length}건</div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-10">조회된 내역이 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => <OrderCard key={o.id} order={o} onSelect={() => onSelect(o)} />)}
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
  const [attachments, setAttachments] = useState([]);
  const [loadingAttach, setLoadingAttach] = useState(false);
  const [viewImg, setViewImg] = useState(null);

  useEffect(() => {
    if (!order.id) return;
    setLoadingAttach(true);
    getDocs(collection(db, "orders", order.id, "attachments")).then(snap => {
      setAttachments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(() => {}).finally(() => setLoadingAttach(false));
  }, [order.id]);

  const openMap = (addr) => {
    if (!addr) return alert("주소 정보가 없습니다.");
    window.open(`https://map.kakao.com/?q=${encodeURIComponent(addr)}`, "_blank");
  };

  const timeLabel = (time, dir) => {
    const t = fmt12(time);
    return t && dir && dir !== "정각" ? `${t} ${dir}` : t || "-";
  };

  const downloadImg = (item) => {
    const src = item.base64 || item.url;
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = item.name || "첨부파일.jpg";
    a.click();
  };

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="text-gray-500 text-lg">←</button>
        <div className="font-bold text-base">운송 상세</div>
        <span className={`ml-auto px-2 py-0.5 rounded-full border text-xs font-semibold ${cls}`}>{label}</span>
      </div>

      <MCard>
        <MDetailRow label="거래처" value={order.거래처명 || "-"} />
        <MDetailRow label="상차" value={`${order.상차일 || "-"} ${timeLabel(order.상차시간, order.상차시간구분)}`} />
        <MDetailRow label="하차" value={`${order.하차일 || "-"} ${timeLabel(order.하차시간, order.하차시간구분)}`} />
        <MDetailRow label="등록일시" value={fmtDateTime(order.createdAt)} />
      </MCard>

      <MCard title="상차지">
        <MDetailRow label="지명" value={order.상차지명 || "-"} />
        <MDetailRow label="주소" value={order.상차지주소 || "-"} />
        {order.상차지담당자 && <MDetailRow label="담당자" value={order.상차지담당자} />}
        {order.상차지담당자번호 && <MDetailRow label="연락처" value={order.상차지담당자번호} />}
        <button onClick={() => openMap(order.상차지주소 || order.상차지명)}
          className="mt-2 w-full py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold">
          상차지 지도
        </button>
      </MCard>

      <MCard title="하차지">
        <MDetailRow label="지명" value={order.하차지명 || "-"} />
        <MDetailRow label="주소" value={order.하차지주소 || "-"} />
        {order.하차지담당자 && <MDetailRow label="담당자" value={order.하차지담당자} />}
        {order.하차지담당자번호 && <MDetailRow label="연락처" value={order.하차지담당자번호} />}
        <button onClick={() => openMap(order.하차지주소 || order.하차지명)}
          className="mt-2 w-full py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold">
          하차지 지도
        </button>
      </MCard>

      <MCard title="화물 / 차량">
        <MDetailRow label="차량종류" value={order.차량종류 || order.차종 || "-"} />
        <MDetailRow label="톤수" value={order.차량톤수 || order.톤수 || "-"} />
        <MDetailRow label="화물내용" value={[order.화물내용, order.화물단위].filter(Boolean).join(" ") || "-"} />
        <MDetailRow label="상차방법" value={order.상차방법 || "-"} />
        <MDetailRow label="하차방법" value={order.하차방법 || "-"} />
      </MCard>

      {order.차량번호 ? (
        <MCard title="배차 / 기사 정보">
          <MDetailRow label="차량번호" value={order.차량번호} />
          <MDetailRow label="기사명" value={order.이름 || order.기사명 || "-"} />
          <MDetailRow label="연락처" value={order.전화번호 || "-"} />
          <MDetailRow label="운송사" value={order.운송사명 || "-"} />
          {order.전화번호 && (
            <div className="flex gap-2 mt-3">
              <a href={`tel:${order.전화번호}`} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-lg text-sm font-semibold text-center">전화 연결</a>
              <a href={`sms:${order.전화번호}`} className="flex-1 py-2.5 bg-sky-500 text-white rounded-lg text-sm font-semibold text-center">문자 전송</a>
            </div>
          )}
        </MCard>
      ) : (
        <MCard title="배차 / 기사 정보">
          <div className="py-4 text-center text-sm text-amber-600 font-medium">
            배차 완료 후 기사 정보가 표시됩니다
          </div>
        </MCard>
      )}

      <MCard title="운임">
        <MDetailRow label="청구운임" value={fmtMoney(order.청구운임)} />
        <MDetailRow label="지급방식" value={order.지급방식 || "-"} />
      </MCard>

      {/* 첨부사진 */}
      <MCard title={`첨부사진 ${attachments.length > 0 ? `(${attachments.length}장)` : ""}`}>
        {loadingAttach ? (
          <div className="py-4 text-center text-sm text-gray-400">로딩 중...</div>
        ) : attachments.length === 0 ? (
          <div className="py-4 text-center text-sm text-gray-400">첨부된 파일이 없습니다</div>
        ) : (
          <div className="grid grid-cols-3 gap-2 pt-2">
            {attachments.map(item => (
              <div key={item.id} className="relative aspect-square" onClick={() => setViewImg(item)}>
                <img src={item.base64 || item.url} alt={item.name} className="w-full h-full object-cover rounded-lg border" />
              </div>
            ))}
          </div>
        )}
      </MCard>

      {/* 사진 전체보기 */}
      {viewImg && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
          <div className="flex justify-between items-center px-4 py-3">
            <div className="text-white text-sm truncate flex-1">{viewImg.name || "첨부파일"}</div>
            <button onClick={() => setViewImg(null)} className="text-white text-2xl ml-3">×</button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <img src={viewImg.base64 || viewImg.url} alt={viewImg.name} className="max-w-full max-h-full object-contain rounded" />
          </div>
          <div className="px-4 pb-6">
            <button onClick={() => downloadImg(viewImg)}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm">
              다운로드
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================================================================
// 마이페이지
// ======================================================================
function ShipperMyPageM({ user, userData, onBack, showToast, orders }) {
  const [tab, setTab] = useState("info");
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);

  const thisMonth = useMemo(() => {
    const ym = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7);
    return orders.filter(o => String(o.상차일 || "").slice(0, 7) === ym);
  }, [orders]);

  const changePw = async () => {
    if (!pwForm.current || !pwForm.next) { alert("현재 비밀번호와 새 비밀번호를 입력하세요."); return; }
    if (pwForm.next !== pwForm.confirm) { alert("새 비밀번호가 일치하지 않습니다."); return; }
    if (pwForm.next.length < 6) { alert("비밀번호는 6자 이상이어야 합니다."); return; }
    setPwSaving(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, pwForm.current);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, pwForm.next);
      showToast("비밀번호가 변경되었습니다.");
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (e) {
      alert("비밀번호 변경 실패: " + (e.code === "auth/wrong-password" ? "현재 비밀번호가 틀립니다." : e.message));
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="text-gray-500 text-lg">←</button>
        <div className="font-bold text-base">마이페이지</div>
      </div>

      {/* 프로필 */}
      <div className="rounded-2xl p-5 text-center text-white" style={{ background: NAVY }}>
        <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold mx-auto mb-2">
          {(userData.name || user.email || "?")[0].toUpperCase()}
        </div>
        <div className="font-bold text-base">{userData.name || "-"}</div>
        <div className="text-blue-200 text-sm mt-0.5">{user.email}</div>
        <div className="text-blue-200 text-xs mt-0.5">{userData.company || ""}</div>
      </div>

      {/* 이번달 통계 */}
      <div className="grid grid-cols-3 gap-2">
        <KpiCard title="이번달 오더" value={thisMonth.length} color="text-blue-600" />
        <KpiCard title="배차완료" value={thisMonth.filter(o => !!o.차량번호).length} color="text-emerald-600" />
        <KpiCard title="전체 오더" value={orders.length} color="text-gray-700" />
      </div>

      {/* 탭 */}
      <div className="flex bg-white border rounded-xl overflow-hidden">
        <button onClick={() => setTab("info")}
          className={`flex-1 py-2.5 text-sm font-semibold transition ${tab === "info" ? "text-white" : "text-gray-500"}`}
          style={tab === "info" ? { background: NAVY } : {}}>
          내 정보
        </button>
        <button onClick={() => setTab("password")}
          className={`flex-1 py-2.5 text-sm font-semibold transition ${tab === "password" ? "text-white" : "text-gray-500"}`}
          style={tab === "password" ? { background: NAVY } : {}}>
          비밀번호 변경
        </button>
      </div>

      {tab === "info" && (
        <MCard>
          <MDetailRow label="이름" value={userData.name || "-"} />
          <MDetailRow label="이메일" value={user.email || "-"} />
          <MDetailRow label="회사명" value={userData.company || "-"} />
          <MDetailRow label="부서" value={userData.department || "-"} />
          <MDetailRow label="직책" value={userData.position || "-"} />
          <MDetailRow label="권한" value={userData.role === "shipper" ? "화주 마스터" : userData.permissions?.subMaster ? "화주 서브마스터" : "일반 사용자"} />
        </MCard>
      )}

      {tab === "password" && (
        <MCard>
          <div className="space-y-3 py-2">
            <div>
              <div className="text-xs text-gray-500 mb-1">현재 비밀번호</div>
              <input type="password" className="input-m" value={pwForm.current}
                onChange={(e) => setPwForm(p => ({ ...p, current: e.target.value }))} placeholder="현재 비밀번호" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">새 비밀번호</div>
              <input type="password" className="input-m" value={pwForm.next}
                onChange={(e) => setPwForm(p => ({ ...p, next: e.target.value }))} placeholder="6자 이상" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">새 비밀번호 확인</div>
              <input type="password" className="input-m" value={pwForm.confirm}
                onChange={(e) => setPwForm(p => ({ ...p, confirm: e.target.value }))} placeholder="비밀번호 재입력" />
            </div>
            <button onClick={changePw} disabled={pwSaving}
              className="w-full py-3 text-white rounded-xl font-semibold text-sm disabled:opacity-50"
              style={{ background: NAVY }}>
              {pwSaving ? "변경 중..." : "비밀번호 변경"}
            </button>
          </div>
          <style>{`.input-m { width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; font-size: 14px; background: white; outline: none; box-sizing: border-box; }`}</style>
        </MCard>
      )}
    </div>
  );
}

// ======================================================================
// 공지사항
// ======================================================================
function ShipperNoticeM({ onBack }) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    getDocs(query(collection(db, "notices"), orderBy("createdAt", "desc"), limit(50))).then(snap => {
      setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(() => setNotices([])).finally(() => setLoading(false));
  }, []);

  const fmtDate = (ts) => {
    if (!ts) return "";
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!d) return String(ts).slice(0, 10);
    return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  };

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="text-gray-500 text-lg">←</button>
        <div className="font-bold text-base">공지사항</div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 text-sm py-10">불러오는 중...</div>
      ) : notices.length === 0 ? (
        <div className="text-center py-14">
          <div className="text-gray-300 text-4xl mb-3">—</div>
          <div className="text-gray-400 text-sm font-medium">등록된 공지사항이 없습니다</div>
        </div>
      ) : (
        <div className="space-y-2">
          {notices.map(n => (
            <div key={n.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button className="w-full text-left px-4 py-3 flex items-start gap-2"
                onClick={() => setExpanded(expanded === n.id ? null : n.id)}>
                {n.pinned && (
                  <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style={{ background: NAVY }}>
                    중요
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{n.title || "제목 없음"}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{fmtDate(n.createdAt)}</div>
                </div>
                <span className="text-gray-400 text-sm shrink-0">{expanded === n.id ? "▲" : "▼"}</span>
              </button>
              {expanded === n.id && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  <div className="text-sm text-gray-700 whitespace-pre-wrap pt-3 leading-relaxed">{n.content || ""}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ======================================================================
// 문의사항
// ======================================================================
function ShipperInquiryM({ user, userData, onBack, showToast }) {
  const [tab, setTab] = useState("list");
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({ title: "", content: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "inquiries"), where("userId", "==", user.uid), orderBy("createdAt", "desc"), limit(50))).then(snap => {
      setInquiries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(() => setInquiries([])).finally(() => setLoading(false));
  }, [user]);

  const submit = async () => {
    if (!form.title.trim() || !form.content.trim()) { alert("제목과 내용을 모두 입력해주세요."); return; }
    setSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, "inquiries"), {
        title: form.title,
        content: form.content,
        userId: user.uid,
        company: userData?.company || "",
        name: userData?.name || user.email,
        status: "접수중",
        createdAt: serverTimestamp(),
      });
      setInquiries(prev => [{ id: docRef.id, ...form, status: "접수중", createdAt: null }, ...prev]);
      setForm({ title: "", content: "" });
      showToast("문의가 등록되었습니다.");
      setTab("list");
    } catch (e) {
      alert("등록 실패: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const fmtDate = (ts) => {
    if (!ts) return "방금";
    const d = ts?.toDate ? ts.toDate() : null;
    if (!d) return "";
    return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  };

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="text-gray-500 text-lg">←</button>
        <div className="font-bold text-base">문의사항</div>
      </div>

      <div className="flex bg-white border rounded-xl overflow-hidden">
        <button onClick={() => setTab("list")}
          className={`flex-1 py-2.5 text-sm font-semibold transition ${tab === "list" ? "text-white" : "text-gray-500"}`}
          style={tab === "list" ? { background: NAVY } : {}}>
          문의내역
        </button>
        <button onClick={() => setTab("write")}
          className={`flex-1 py-2.5 text-sm font-semibold transition ${tab === "write" ? "text-white" : "text-gray-500"}`}
          style={tab === "write" ? { background: NAVY } : {}}>
          문의하기
        </button>
      </div>

      {tab === "list" && (
        loading ? (
          <div className="text-center text-gray-400 text-sm py-10">불러오는 중...</div>
        ) : inquiries.length === 0 ? (
          <div className="text-center py-14">
            <div className="text-gray-300 text-4xl mb-3">—</div>
            <div className="text-gray-400 text-sm font-medium">등록된 문의가 없습니다</div>
            <button onClick={() => setTab("write")} className="mt-4 px-5 py-2 text-white text-sm rounded-xl font-semibold" style={{ background: NAVY }}>
              문의하기
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {inquiries.map(q => (
              <div key={q.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <button className="w-full text-left px-4 py-3 flex items-start gap-2"
                  onClick={() => setExpanded(expanded === q.id ? null : q.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="text-sm font-semibold text-gray-800 truncate flex-1">{q.title}</div>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${q.status === "답변완료" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {q.status || "접수중"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">{fmtDate(q.createdAt)}</div>
                  </div>
                  <span className="text-gray-400 text-sm shrink-0 mt-0.5">{expanded === q.id ? "▲" : "▼"}</span>
                </button>
                {expanded === q.id && (
                  <div className="px-4 pb-4 border-t border-gray-100 space-y-3">
                    <div className="pt-3">
                      <div className="text-xs text-gray-400 mb-1 font-semibold">문의 내용</div>
                      <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{q.content}</div>
                    </div>
                    {q.reply && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                        <div className="text-xs text-blue-500 font-semibold mb-1">답변</div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{q.reply}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {tab === "write" && (
        <MCard>
          <div className="space-y-3 py-2">
            <div>
              <div className="text-xs text-gray-500 mb-1">제목</div>
              <input className="input-m" value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder="문의 제목을 입력하세요" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">내용</div>
              <textarea className="input-m" rows={6} style={{ resize: "none" }} value={form.content}
                onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))} placeholder="문의 내용을 상세히 작성해주세요" />
            </div>
            <div className="text-xs text-gray-400">회사: {userData?.company || ""} · 담당자: {userData?.name || user.email}</div>
            <button onClick={submit} disabled={submitting}
              className="w-full py-3 text-white rounded-xl font-semibold text-sm disabled:opacity-50"
              style={{ background: NAVY }}>
              {submitting ? "등록 중..." : "문의 등록"}
            </button>
          </div>
          <style>{`.input-m { width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; font-size: 14px; background: white; outline: none; box-sizing: border-box; }`}</style>
        </MCard>
      )}
    </div>
  );
}

// ======================================================================
// 공통 컴포넌트
// ======================================================================
function OrderCard({ order, onSelect }) {
  const { label, cls } = getStatusBadge(order);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-3 py-3 active:scale-[0.99] transition"
      onClick={onSelect}>
      <div className="flex justify-between items-start mb-1">
        <div className="text-sm font-semibold text-gray-800 truncate flex-1">
          {order.상차지명 || "-"} → {order.하차지명 || "-"}
        </div>
        <span className={`ml-2 px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${cls}`}>{label}</span>
      </div>
      <div className="text-xs text-gray-500">
        {order.상차일 || "-"} {order.상차시간 ? fmt12(order.상차시간) : ""}
        {order.상차시간구분 && order.상차시간구분 !== "정각" ? ` ${order.상차시간구분}` : ""}
        {order.차량톤수 && ` · ${order.차량톤수}`}
        {order.차량종류 && ` ${order.차량종류}`}
      </div>
      {(order.청구운임 > 0) && (
        <div className="text-xs text-blue-600 font-semibold mt-0.5">{fmtMoney(order.청구운임)}</div>
      )}
      {(order.attachCount > 0) && (
        <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">사진 {order.attachCount}장</div>
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

function MSection({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 border-b text-xs font-bold text-white" style={{ background: NAVY }}>{title}</div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

function MRow({ label, children }) {
  return (
    <div className="flex items-start px-3 py-2 gap-2">
      <div className="w-20 text-xs text-gray-500 pt-2 shrink-0">{label}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function MCard({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {title && <div className="px-3 py-2 border-b text-xs font-bold text-white" style={{ background: NAVY }}>{title}</div>}
      <div className="px-3 py-2 divide-y">{children}</div>
    </div>
  );
}

function MDetailRow({ label, value }) {
  return (
    <div className="flex py-1.5 gap-2">
      <div className="w-20 text-xs text-gray-400 shrink-0">{label}</div>
      <div className="flex-1 text-sm text-gray-800 font-medium">{value}</div>
    </div>
  );
}

function TabBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex-1 flex flex-col items-center py-3 text-xs gap-0.5 font-semibold ${active ? "text-[#1e3a5f]" : "text-gray-400"}`}>
      <div className={`w-1.5 h-1.5 rounded-full mb-0.5 ${active ? "bg-[#1e3a5f]" : "bg-transparent"}`} />
      {label}
    </button>
  );
}

function MMenuItem({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition ${active ? "text-white" : "hover:bg-gray-100 text-gray-700"}`}
      style={active ? { background: NAVY } : {}}>
      {label}
    </button>
  );
}
