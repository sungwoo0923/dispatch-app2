import { useState, useEffect, useRef } from "react";
import { db, auth } from "../../firebase";
import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { useNavigate, useSearchParams } from "react-router-dom";

/* 시간 옵션 (오전/오후 형식) */
const timeOptions = Array.from({ length: 48 }, (_, i) => {
  const hour24 = Math.floor(i / 2);
  const minute = i % 2 === 0 ? "00" : "30";
  const isAM = hour24 < 12;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return {
    value: `${String(hour24).padStart(2, "0")}:${minute}`,
    label: `${isAM ? "오전" : "오후"} ${hour12}시${minute === "30" ? " 30분" : ""}`,
  };
});

/* 24h → 오전/오후 변환 */
const fmt12 = (t) => {
  if (!t) return "-";
  const [h, m] = t.split(":").map(Number);
  const isAM = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${isAM ? "오전" : "오후"} ${h12}시${m > 0 ? ` ${m}분` : ""}`;
};

const parseTonnage = (val = "") => {
  if (!val) return { num: "", unit: "톤" };
  const kg = val.match(/^([\d.]+)\s*kg$/i);
  if (kg) return { num: kg[1], unit: "kg" };
  const ton = val.match(/^([\d.]*)\s*톤?$/);
  if (ton) return { num: ton[1].replace("톤", ""), unit: "톤" };
  return { num: val, unit: "없음" };
};

const getDate = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const SEARCH_TYPES = ["통합", "상차지명", "하차지명", "상차지주소", "하차지주소", "운송사명"];

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-[#1B2B4B]/40 focus:border-[#1B2B4B] outline-none";
const labelCls = "block text-xs font-bold text-gray-600 mb-1";

export default function ShipperOrder({ editData, onClose }) {
  const user = auth.currentUser;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get("edit");

  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(!!editId);
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(null);
  const [fixedTransport, setFixedTransport] = useState(null);
  const [transportList, setTransportList] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [companyEditable, setCompanyEditable] = useState(false);
  const [companyEdit, setCompanyEdit] = useState("");
  const [contactPicker, setContactPicker] = useState(null); // { field, item, contacts }

  // 오더 불러오기
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchType, setSearchType] = useState("통합");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const listRefTop = useRef(null);
  const listRefBottom = useRef(null);

  useEffect(() => {
  if (!previewOpen || !coords?.start || !coords?.end) return;
  const initMap = () => {
    if (!window.Tmapv2) { setTimeout(initMap, 200); return; }
    const map = new window.Tmapv2.Map("shipper-map", {
      center: new window.Tmapv2.LatLng(coords.start.lat, coords.start.lon),
      width: "100%", height: "100%", zoom: 10,
    });
    fetch("https://apis.openapi.sk.com/tmap/routes?version=1&format=json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", appKey: "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer" },
      body: new URLSearchParams({
        startX: String(coords.start.lon), startY: String(coords.start.lat),
        endX: String(coords.end.lon), endY: String(coords.end.lat),
        startName: form.상차지명 || "출발지", endName: form.하차지명 || "도착지",
        reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO", searchOption: "0",
      }),
    }).then(r => r.json()).then(data => {
      if (!data.features) return;
      let totalDistance = 0, totalTime = 0;
      const lineArr = [];
      data.features.forEach(item => {
        if (item.geometry?.type === "LineString") {
          item.geometry.coordinates.forEach(c => lineArr.push(new window.Tmapv2.LatLng(c[1], c[0])));
        }
        if (item.properties) { totalDistance = item.properties.totalDistance; totalTime = item.properties.totalTime; }
      });
      new window.Tmapv2.Polyline({ path: lineArr, strokeColor: "#2563eb", strokeWeight: 5, map });
      setRouteInfo({ distance: (totalDistance / 1000).toFixed(1), time: Math.round(totalTime / 60) });
    });
  };
  initMap();
  }, [previewOpen, coords]);

  useEffect(() => {
    const saved = localStorage.getItem("fixedTransport");
    if (saved) {
      const parsed = JSON.parse(saved);
      setFixedTransport(parsed);
      setForm(p => ({ ...p, 운송사명: parsed.name, 운송사코드: parsed.code }));
    }
  }, []);

  useEffect(() => {
    getDocs(query(
      collection(db, "transportApplications"),
      where("type", "==", "신규"),
      where("status", "==", "approved"),
    )).then(snap => {
      const seen = new Map();
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.companyName && !seen.has(data.companyName)) {
          seen.set(data.companyName, { name: data.companyName, code: data.companyCode || "" });
        }
      });
      setTransportList(Array.from(seen.values()));
    }).catch(() => setTransportList([]));
  }, []);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        const name = d.companyName || d.회사명 || d.company || d.거래처명 || "";
        setCompany(name);
        setCompanyEdit(name);
      } else {
        setCompany(`(주)${user.email?.split("@")[0] || "화주사"}`);
      }
    });
  }, [user]);

  const [form, setForm] = useState({
    status: "요청",
    청구운임: "",
    상차지명: "", 상차지주소: "", 상차담당자명: "", 상차담당자번호: "", 상차메모: "",
    하차지명: "", 하차지주소: "", 하차담당자명: "", 하차담당자번호: "", 하차메모: "",
    상차일: getDate(0), 상차시간: "08:00", 상차시간구분: "이후",
    하차일: getDate(0), 하차시간: "12:00", 하차시간구분: "이후",
    차량종류: "", 차량톤수: "", 차량톤수단위: "톤", 상차방법: "", 하차방법: "", 지급방식: "", 화물내용: "", 화물단위: "파레트",
    운송사명: "", 운송사코드: "",
  });

  const onChange = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!editId) return;
    getDoc(doc(db, "orders", editId)).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        const { num, unit } = parseTonnage(data.차량톤수 || "");
        setForm(p => ({ ...p, ...data, 차량톤수: num, 차량톤수단위: unit }));
      }
      setLoading(false);
    });
  }, [editId]);

  useEffect(() => {
    if (!editData) return;
    const { num, unit } = parseTonnage(editData.차량톤수 || "");
    setForm(p => ({ ...p, ...editData, 차량톤수: num, 차량톤수단위: unit }));
    setLoading(false);
  }, [editData]);

  const resetForm = () => {
    setForm({
      status: "요청", 청구운임: "",
      상차지명: "", 상차지주소: "", 상차담당자명: "", 상차담당자번호: "", 상차메모: "",
      하차지명: "", 하차지주소: "", 하차담당자명: "", 하차담당자번호: "", 하차메모: "",
      상차일: getDate(0), 상차시간: "08:00", 상차시간구분: "이후",
      하차일: getDate(0), 하차시간: "12:00", 하차시간구분: "이후",
      차량종류: "", 차량톤수: "", 차량톤수단위: "톤", 상차방법: "", 하차방법: "", 지급방식: "", 화물내용: "", 화물단위: "파레트",
      운송사명: "", 운송사코드: "",
    });
    setSuggestions([]); setShowDropdown(null); setActiveIndex(-1);
  };

  const upsertPlace = async (data, type) => {
    const currentCompany = companyEditable ? companyEdit : company;
    const q = query(
      collection(db, "places"),
      where("userId", "==", user.uid),
      where("name", "==", data.name),
      where("type", "==", type)
    );
    const snap = await getDocs(q);
    const newContact = (data.담당자명 || data.담당자번호) ? { name: data.담당자명 || "", phone: data.담당자번호 || "" } : null;
    if (!snap.empty) {
      const existing = snap.docs[0].data();
      const prevContacts = Array.isArray(existing.contacts) ? existing.contacts : (
        (existing.담당자명 || existing.담당자번호) ? [{ name: existing.담당자명 || "", phone: existing.담당자번호 || "" }] : []
      );
      let contacts = prevContacts;
      if (newContact) {
        const dupIdx = prevContacts.findIndex(c => c.name === newContact.name && c.phone === newContact.phone);
        contacts = dupIdx >= 0 ? prevContacts : [newContact, ...prevContacts].slice(0, 5);
      }
      await updateDoc(doc(db, "places", snap.docs[0].id), {
        address: data.address, 담당자명: data.담당자명, 담당자번호: data.담당자번호,
        메모: data.메모, company: currentCompany, contacts, updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, "places"), {
        ...data, type, userId: user.uid, company: currentCompany,
        contacts: newContact ? [newContact] : [],
        createdAt: serverTimestamp(),
      });
    }
  };

  const getCoords = async (addr) => {
    if (!addr) return null;
    try {
      const res = await fetch(
        `https://apis.openapi.sk.com/tmap/geo/fullAddrGeo?version=1&format=json&fullAddr=${encodeURIComponent(addr)}`,
        { headers: { Accept: "application/json", appKey: "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer" } }
      );
      const data = await res.json();
      const coord = data?.coordinateInfo?.coordinate?.[0];
      if (!coord) return null;
      return { lat: Number(coord.lat), lon: Number(coord.lon) };
    } catch { return null; }
  };

  const submit = async () => {
    if (!form.상차지명 || !form.하차지명) return alert("상차지 / 하차지를 입력하세요.");
    const effectiveCompany = companyEditable ? companyEdit : company;
    await upsertPlace({ name: form.상차지명, address: form.상차지주소, 담당자명: form.상차담당자명, 담당자번호: form.상차담당자번호, 메모: form.상차메모 }, "상차");
    await upsertPlace({ name: form.하차지명, address: form.하차지주소, 담당자명: form.하차담당자명, 담당자번호: form.하차담당자번호, 메모: form.하차메모 }, "하차");

    const 차량톤수Combined = form.차량톤수단위 === "없음" ? "" : form.차량톤수 ? `${form.차량톤수}${form.차량톤수단위}` : "";
    const saveForm = { ...form, 차량톤수: 차량톤수Combined };
    if (editId || editData?.id) {
      await updateDoc(doc(db, "orders", editId || editData.id), { ...saveForm, updatedAt: serverTimestamp() });
    } else {
      await addDoc(collection(db, "orders"), {
        ...saveForm,
        shipperUid: user.uid,
        작성자: user.email,
        거래처명: effectiveCompany,
        shipperCompany: effectiveCompany,
        배차상태: "배차중",
        업체전달상태: "미전달",
        createdAt: serverTimestamp(),
        role: "shipper",
        source: "shipper",
        company: form.운송사명 || "",
        companyCode: form.운송사코드 || "",
      });
    }

    if (editId || editData) {
      alert("수정 완료");
      onClose ? onClose() : navigate("/shipper/status");
    } else {
      navigate("/shipper/status");
    }
  };

  /* 오더 불러오기 검색 */
  const handleSearch = async () => {
    if (!user) return;
    setSearchLoading(true);
    try {
      let q;
      const isMaster = false; // 모든 화주는 자신 오더 검색
      q = query(
        collection(db, "orders"),
        where("shipperUid", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(200)
      );
      const snap = await getDocs(q);
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        list = list.filter(item => {
          switch (searchType) {
            case "상차지명": return (item.상차지명 || "").toLowerCase().includes(kw);
            case "하차지명": return (item.하차지명 || "").toLowerCase().includes(kw);
            case "상차지주소": return (item.상차지주소 || "").toLowerCase().includes(kw);
            case "하차지주소": return (item.하차지주소 || "").toLowerCase().includes(kw);
            case "운송사명": return (item.운송사명 || "").toLowerCase().includes(kw);
            default:
              return (
                (item.상차지명 || "").toLowerCase().includes(kw) ||
                (item.하차지명 || "").toLowerCase().includes(kw) ||
                (item.거래처명 || "").toLowerCase().includes(kw) ||
                (item.화물내용 || "").toLowerCase().includes(kw) ||
                (item.운송사명 || "").toLowerCase().includes(kw)
              );
          }
        });
      }
      setSearchResults(list);
    } catch (e) {
      console.error(e);
      setSearchResults([]);
    }
    setSearchLoading(false);
  };

  const applyOrder = (item) => {
    const { num, unit } = parseTonnage(item.차량톤수 || "");
    setForm(p => ({
      ...p,
      청구운임: item.청구운임 || "",
      상차지명: item.상차지명 || "", 상차지주소: item.상차지주소 || "",
      상차담당자명: item.상차담당자명 || item.상차지담당자 || "", 상차담당자번호: item.상차담당자번호 || item.상차지담당자번호 || "",
      하차지명: item.하차지명 || "", 하차지주소: item.하차지주소 || "",
      하차담당자명: item.하차담당자명 || item.하차지담당자 || "", 하차담당자번호: item.하차담당자번호 || item.하차지담당자번호 || "",
      상차시간: item.상차시간 || "08:00", 상차시간구분: item.상차시간구분 || "이후",
      하차시간: item.하차시간 || "12:00", 하차시간구분: item.하차시간구분 || "이후",
      차량종류: item.차량종류 || "", 차량톤수: num, 차량톤수단위: unit,
      상차방법: item.상차방법 || "", 하차방법: item.하차방법 || "",
      지급방식: item.지급방식 || "", 화물내용: item.화물내용 || "",
      화물단위: item.화물단위 || "파레트",
      운송사명: item.운송사명 || "", 운송사코드: item.운송사코드 || "",
    }));
  };

  /* 주소록 자동완성 */
  const searchTransport = (value) => {
    if (!value) { setSuggestions([]); return; }
    const list = transportList.filter(item => (item.name || "").toLowerCase().includes(value.toLowerCase()));
    setSuggestions(list.slice(0, 10));
    setShowDropdown("운송사명");
    setActiveIndex(-1);
  };

  const searchPlaces = async (value, field) => {
    if (!value) { setSuggestions([]); return; }
    const q = query(collection(db, "places"), where("userId", "==", user.uid));
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const filtered = list.filter(item => (item.name || "").toLowerCase().includes(value.toLowerCase()));
    const map = new Map();
    filtered.forEach(item => {
      const key = (item.name || "").toLowerCase().replace(/\s/g, "");
      if (!map.has(key) || (item.createdAt?.seconds || 0) > (map.get(key).createdAt?.seconds || 0)) {
        map.set(key, item);
      }
    });
    setSuggestions(Array.from(map.values()).slice(0, 10));
    setShowDropdown(field);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e, field) => {
    if (!showDropdown || showDropdown !== field) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(p => Math.min(p + 1, suggestions.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex(p => Math.max(p - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); if (activeIndex >= 0) selectSuggestion(suggestions[activeIndex], field); }
  };

  const applyPlaceContact = (item, field, contact) => {
    const name = contact?.name || item.담당자명 || "";
    const phone = contact?.phone || item.담당자번호 || "";
    if (field === "상차지명") {
      setForm(p => ({ ...p, 상차지명: item.name || "", 상차지주소: item.address || "", 상차담당자명: name, 상차담당자번호: phone, 상차메모: item.메모 || "" }));
    }
    if (field === "하차지명") {
      setForm(p => ({ ...p, 하차지명: item.name || "", 하차지주소: item.address || "", 하차담당자명: name, 하차담당자번호: phone, 하차메모: item.메모 || "" }));
    }
  };

  const selectSuggestion = (item, field) => {
    if (field === "상차지명" || field === "하차지명") {
      const contacts = Array.isArray(item.contacts) ? item.contacts.filter(c => c.name || c.phone) : [];
      if (contacts.length > 1) {
        setContactPicker({ field, item, contacts });
        setShowDropdown(null);
        return;
      }
      applyPlaceContact(item, field, contacts[0]);
    }
    if (field === "운송사명") {
      setForm(p => ({ ...p, 운송사명: item.name, 운송사코드: item.code || "" }));
      if (fixedTransport) { setFixedTransport({ name: item.name, code: item.code || "" }); localStorage.setItem("fixedTransport", JSON.stringify({ name: item.name, code: item.code || "" })); }
    }
    setShowDropdown(null);
  };

  if (loading) return <div className="py-20 text-center text-gray-400">불러오는 중...</div>;

  const timeLabel = (time, dir) => {
    const t = fmt12(time);
    return dir && dir !== "정각" ? `${t} ${dir}` : t;
  };

  return (
    <div className="flex gap-5 w-full p-6 max-w-[1200px]">

      {/* 왼쪽: 입력 폼 */}
      <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">

        {/* 헤더 */}
        <div className="flex justify-between items-center border-b pb-4">
          <h2 className="text-lg font-bold text-gray-900">{editId || editData ? "오더 수정" : "일반배차 등록"}</h2>
          <button onClick={() => { if (window.confirm("입력값을 초기화하시겠습니까?")) resetForm(); }}
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg">
            초기화
          </button>
        </div>

        {/* 운송의뢰사 */}
        <div>
          <div className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#1B2B4B] rounded-full inline-block" />
            운송의뢰사
          </div>
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="relative">
              <label className={labelCls}>운송사명</label>
              <input
                disabled={!!fixedTransport}
                value={form.운송사명 || ""}
                onChange={e => { onChange("운송사명", e.target.value); searchTransport(e.target.value); }}
                onFocus={() => setShowDropdown("운송사명")}
                onBlur={() => setTimeout(() => setShowDropdown(null), 150)}
                className={inputCls + (fixedTransport ? " bg-gray-100 cursor-not-allowed" : "")}
                placeholder="운송사명 입력"
              />
              {showDropdown === "운송사명" && suggestions.length > 0 && (
                <div className="absolute z-50 bg-white border rounded-lg w-full mt-1 max-h-60 overflow-y-auto shadow-lg">
                  {suggestions.map((item, idx) => (
                    <div key={idx} className={`px-3 py-2 text-sm cursor-pointer ${idx === activeIndex ? "bg-[#eef1f7]" : "hover:bg-gray-50"}`}
                      onMouseDown={() => selectSuggestion(item, "운송사명")}>{item.name}</div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className={labelCls}>운송사코드</label>
              <input value={form.운송사코드 || ""} readOnly className={inputCls + " bg-gray-100 text-gray-500"} placeholder="자동 입력" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={!!fixedTransport}
                onChange={e => {
                  if (e.target.checked) {
                    if (!form.운송사명) { alert("운송사를 먼저 선택하세요"); return; }
                    const data = { name: form.운송사명, code: form.운송사코드 };
                    setFixedTransport(data);
                    localStorage.setItem("fixedTransport", JSON.stringify(data));
                  } else {
                    setFixedTransport(null);
                    localStorage.removeItem("fixedTransport");
                  }
                }}
              />
              <span className="font-semibold">운송사 고정</span>
            </label>
          </div>
        </div>

        {/* 거래처 정보 */}
        <div>
          <div className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#1B2B4B] rounded-full inline-block" />
            거래처 정보
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <label className={labelCls}>거래처명</label>
            <div className="flex gap-2">
              {companyEditable ? (
                <>
                  <input value={companyEdit} onChange={e => setCompanyEdit(e.target.value)} className={inputCls} />
                  <button onClick={() => setCompanyEditable(false)} className="px-3 py-2 text-sm bg-[#1B2B4B] text-white rounded-lg font-semibold whitespace-nowrap">확인</button>
                  <button onClick={() => { setCompanyEditable(false); setCompanyEdit(company); }} className="px-3 py-2 text-sm bg-gray-200 rounded-lg whitespace-nowrap">취소</button>
                </>
              ) : (
                <>
                  <input value={company} disabled className={inputCls + " bg-gray-100 font-semibold text-gray-800"} />
                  <button onClick={() => setCompanyEditable(true)} className="px-3 py-2 text-sm bg-gray-600 text-white rounded-lg font-semibold whitespace-nowrap">변경</button>
                </>
              )}
            </div>
            {(editId || editData) && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className={labelCls}>배차상태</label>
                  <div className="p-2.5 bg-white border rounded-lg font-semibold text-gray-800 text-sm">{form.status || "요청"}</div>
                </div>
                <div>
                  <label className={labelCls}>청구운임</label>
                  <div className="p-2.5 bg-white border rounded-lg font-semibold text-gray-800 text-sm">
                    {form.청구운임 ? `${Number(form.청구운임).toLocaleString()}원` : "-"}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 운송 일정 */}
        <div>
          <div className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#1B2B4B] rounded-full inline-block" />
            운송 일정
          </div>
          <div className="bg-gray-50 rounded-xl p-4 space-y-4">

            {/* 상차 */}
            <div>
              <label className={labelCls}>상차</label>
              <div className="flex gap-2 items-center flex-wrap">
                <input type="date" className={inputCls + " flex-1"} value={form.상차일} onChange={e => onChange("상차일", e.target.value)} />
                <select className={inputCls + " flex-1"} value={form.상차시간} onChange={e => onChange("상차시간", e.target.value)}>
                  {timeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <select className={inputCls + " w-20"} value={form.상차시간구분 || "이후"} onChange={e => onChange("상차시간구분", e.target.value)}>
                  <option value="이전">이전</option>
                  <option value="이후">이후</option>
                  <option value="정각">정각</option>
                </select>
                <button type="button" onClick={() => onChange("상차일", getDate(0))}
                  className={`px-3 py-2 rounded-lg border text-sm font-semibold ${form.상차일 === getDate(0) ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-700 border-gray-300"}`}>
                  당일
                </button>
                <button type="button" onClick={() => onChange("상차일", getDate(1))}
                  className={`px-3 py-2 rounded-lg border text-sm font-semibold ${form.상차일 === getDate(1) ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-700 border-gray-300"}`}>
                  내일
                </button>
              </div>
              {form.상차시간 && (
                <div className="mt-1 text-xs text-[#1B2B4B] font-semibold">
                  {timeLabel(form.상차시간, form.상차시간구분)}
                </div>
              )}
            </div>

            {/* 하차 */}
            <div>
              <label className={labelCls}>하차</label>
              <div className="flex gap-2 items-center flex-wrap">
                <input type="date" className={inputCls + " flex-1"} value={form.하차일} onChange={e => onChange("하차일", e.target.value)} />
                <select className={inputCls + " flex-1"} value={form.하차시간} onChange={e => onChange("하차시간", e.target.value)}>
                  {timeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <select className={inputCls + " w-20"} value={form.하차시간구분 || "이후"} onChange={e => onChange("하차시간구분", e.target.value)}>
                  <option value="이전">이전</option>
                  <option value="이후">이후</option>
                  <option value="정각">정각</option>
                </select>
                <button type="button" onClick={() => onChange("하차일", getDate(0))}
                  className={`px-3 py-2 rounded-lg border text-sm font-semibold ${form.하차일 === getDate(0) ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-700 border-gray-300"}`}>
                  당일
                </button>
                <button type="button" onClick={() => onChange("하차일", getDate(1))}
                  className={`px-3 py-2 rounded-lg border text-sm font-semibold ${form.하차일 === getDate(1) ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-700 border-gray-300"}`}>
                  내일
                </button>
              </div>
              {form.하차시간 && (
                <div className="mt-1 text-xs text-[#1B2B4B] font-semibold">
                  {timeLabel(form.하차시간, form.하차시간구분)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 상·하차 정보 */}
        <div>
          <div className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#1B2B4B] rounded-full inline-block" />
            상·하차 정보
          </div>
          <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-4">
            {/* 상차지 */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-gray-700 mb-2 border-b pb-1">상차지</div>
              <div className="relative">
                <label className={labelCls}>상차지명</label>
                <input className={inputCls} placeholder="상차지명" value={form.상차지명}
                  onChange={e => { onChange("상차지명", e.target.value); searchPlaces(e.target.value, "상차지명"); }}
                  onKeyDown={e => handleKeyDown(e, "상차지명")}
                  onFocus={() => setShowDropdown("상차지명")}
                  onBlur={() => setTimeout(() => setShowDropdown(null), 150)}
                />
                {showDropdown === "상차지명" && suggestions.length > 0 && (
                  <div ref={listRefTop} className="absolute z-50 bg-white border rounded-lg w-full mt-1 max-h-60 overflow-y-auto shadow-lg">
                    {suggestions.map((item, idx) => (
                      <div key={idx} className={`px-3 py-2 text-sm cursor-pointer ${idx === activeIndex ? "bg-[#eef1f7]" : "hover:bg-gray-50"}`}
                        onMouseDown={() => selectSuggestion(item, "상차지명")}>{item.name}</div>
                    ))}
                  </div>
                )}
              </div>
              <div><label className={labelCls}>상차지주소</label><input className={inputCls} placeholder="상차지주소" value={form.상차지주소} onChange={e => onChange("상차지주소", e.target.value)} /></div>
              <div><label className={labelCls}>담당자명</label><input className={inputCls} placeholder="담당자명" value={form.상차담당자명} onChange={e => onChange("상차담당자명", e.target.value)} /></div>
              <div><label className={labelCls}>담당자번호</label><input className={inputCls} placeholder="담당자번호" value={form.상차담당자번호} onChange={e => onChange("상차담당자번호", e.target.value)} /></div>
              <div><label className={labelCls}>메모</label><input className={inputCls} placeholder="메모" value={form.상차메모} onChange={e => onChange("상차메모", e.target.value)} /></div>
            </div>

            {/* 하차지 */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-gray-700 mb-2 border-b pb-1">하차지</div>
              <div className="relative">
                <label className={labelCls}>하차지명</label>
                <input className={inputCls} placeholder="하차지명" value={form.하차지명}
                  onChange={e => { onChange("하차지명", e.target.value); searchPlaces(e.target.value, "하차지명"); }}
                  onKeyDown={e => handleKeyDown(e, "하차지명")}
                  onFocus={() => setShowDropdown("하차지명")}
                  onBlur={() => setTimeout(() => setShowDropdown(null), 150)}
                />
                {showDropdown === "하차지명" && suggestions.length > 0 && (
                  <div ref={listRefBottom} className="absolute z-50 bg-white border rounded-lg w-full mt-1 max-h-60 overflow-y-auto shadow-lg">
                    {suggestions.map((item, idx) => (
                      <div key={idx} className={`px-3 py-2 text-sm cursor-pointer ${idx === activeIndex ? "bg-[#eef1f7]" : "hover:bg-gray-50"}`}
                        onMouseDown={() => selectSuggestion(item, "하차지명")}>{item.name}</div>
                    ))}
                  </div>
                )}
              </div>
              <div><label className={labelCls}>하차지주소</label><input className={inputCls} placeholder="하차지주소" value={form.하차지주소} onChange={e => onChange("하차지주소", e.target.value)} /></div>
              <div><label className={labelCls}>담당자명</label><input className={inputCls} placeholder="담당자명" value={form.하차담당자명} onChange={e => onChange("하차담당자명", e.target.value)} /></div>
              <div><label className={labelCls}>담당자번호</label><input className={inputCls} placeholder="담당자번호" value={form.하차담당자번호} onChange={e => onChange("하차담당자번호", e.target.value)} /></div>
              <div><label className={labelCls}>메모</label><input className={inputCls} placeholder="메모" value={form.하차메모} onChange={e => onChange("하차메모", e.target.value)} /></div>
            </div>
          </div>
        </div>

        {/* 화물 정보 */}
        <div>
          <div className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#1B2B4B] rounded-full inline-block" />
            화물 정보
          </div>
          <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>차량종류</label>
              <select className={inputCls} value={form.차량종류} onChange={e => onChange("차량종류", e.target.value)}>
                <option value="">선택</option>
                {["라보/다마스","냉장탑","냉동탑","냉동윙","냉장윙","리프트","오토바이","윙바디","탑차","카고"].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>톤수</label>
              <div className="flex gap-1.5">
                <input className={inputCls} style={{ flex: 2 }} placeholder="숫자" value={form.차량톤수}
                  inputMode="decimal"
                  onChange={e => onChange("차량톤수", e.target.value.replace(/[^0-9.]/g, ""))} />
                <select className={inputCls} style={{ flex: 1, minWidth: 0 }} value={form.차량톤수단위} onChange={e => onChange("차량톤수단위", e.target.value)}>
                  <option>톤</option><option>kg</option><option>없음</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>화물내용</label>
              <div className="flex gap-1.5">
                <input className={inputCls} style={{ flex: 2 }} placeholder="화물내용" value={form.화물내용} onChange={e => onChange("화물내용", e.target.value)} />
                <select className={inputCls} style={{ flex: 1, minWidth: 0 }} value={form.화물단위} onChange={e => onChange("화물단위", e.target.value)}>
                  {["파레트","박스","없음","개"].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* 상하차방법 / 결제방식 */}
        <div>
          <div className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#1B2B4B] rounded-full inline-block" />
            상하차방법 / 결제방식
          </div>
          <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>상차방법</label>
              <select className={inputCls} value={form.상차방법} onChange={e => onChange("상차방법", e.target.value)}>
                <option value="">선택</option>
                {["지게차","수도움","수작업","크레인"].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>하차방법</label>
              <select className={inputCls} value={form.하차방법} onChange={e => onChange("하차방법", e.target.value)}>
                <option value="">선택</option>
                {["지게차","수도움","수작업","크레인"].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>지급방식</label>
              <select className={inputCls} value={form.지급방식} onChange={e => onChange("지급방식", e.target.value)}>
                <option value="">선택</option>
                {["계산서","선불","착불","계좌이체"].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-3 pt-2 border-t">
          <button onClick={() => onClose ? onClose() : navigate(-1)}
            className="px-6 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm">
            취소
          </button>
          <button
            onClick={async () => {
              if (!form.상차지주소 || !form.하차지주소) {
                if (window.confirm("주소가 없어 경로 미리보기 없이 등록합니다. 계속하시겠습니까?")) await submit();
                return;
              }
              const start = await getCoords(form.상차지주소);
              const end = await getCoords(form.하차지주소);
              if (!start || !end) {
                if (window.confirm("좌표 변환 실패. 미리보기 없이 등록하시겠습니까?")) await submit();
                return;
              }
              setCoords({ start, end });
              setPreviewOpen(true);
            }}
            className="px-8 py-2.5 rounded-lg bg-[#1B2B4B] hover:opacity-90 text-white font-bold text-sm"
          >
            {editId || editData ? "저장" : "오더 등록"}
          </button>
        </div>
      </div>

      {/* 오른쪽: 오더 불러오기 */}
      <div className="w-[400px] bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col">
        <div className="font-bold text-gray-900 text-base mb-4 border-b pb-3">오더 불러오기</div>

        {/* 검색 필터 */}
        <div className="space-y-2 mb-3">
          <select className={inputCls} value={searchType} onChange={e => setSearchType(e.target.value)}>
            {SEARCH_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <div className="flex gap-2">
            <input value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSearch(); }}
              placeholder="검색어 입력 (Enter)"
              className={inputCls + " flex-1"} />
            <button onClick={handleSearch}
              className="px-4 py-2 bg-[#1B2B4B] text-white rounded-lg text-sm font-semibold whitespace-nowrap">
              {searchLoading ? "검색중..." : "조회"}
            </button>
          </div>
        </div>

        {searchResults.length === 0 && !searchLoading && (
          <div className="text-center py-8 text-gray-400 text-sm">
            <div>조회 버튼을 눌러 과거 오더를 불러오세요</div>
            <div className="text-xs mt-1 text-gray-300">검색어 없으면 최근 200건 표시</div>
          </div>
        )}

        <div className="space-y-2 flex-1 overflow-y-auto max-h-[680px]">
          {searchResults.map(item => (
            <div key={item.id} className="border border-gray-200 rounded-xl p-3 hover:bg-[#eef1f7] hover:border-[#c7d1e3] transition cursor-pointer"
              onClick={() => applyOrder(item)}>
              <div className="font-bold text-sm text-gray-900">
                {item.상차지명 || "-"} → {item.하차지명 || "-"}
              </div>
              <div className="text-xs text-gray-600 mt-0.5">
                {item.거래처명 && <span className="mr-2">{item.거래처명}</span>}
                {item.차량종류 && <span className="mr-2">{item.차량종류}</span>}
                {item.차량톤수 && <span>{item.차량톤수}</span>}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {item.상차일} {item.상차시간 ? `${fmt12(item.상차시간)}${item.상차시간구분 && item.상차시간구분 !== "정각" ? ` ${item.상차시간구분}` : ""}` : "즉시"}
              </div>
              {item.화물내용 && <div className="text-xs text-gray-500 truncate mt-0.5">{item.화물내용}</div>}
              <div className="mt-2">
                <button className="w-full py-1 text-xs bg-[#1B2B4B] text-white rounded-lg font-semibold hover:opacity-90">
                  이 오더 불러오기
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 경로 미리보기 팝업 */}
      {previewOpen && (
        <div className="fixed inset-0 bg-black/40 z-[999] flex items-center justify-center">
          <div className="bg-white w-[880px] h-[580px] rounded-2xl overflow-hidden flex shadow-2xl">
            <div id="shipper-map" className="flex-1 h-full" />
            <div className="w-[300px] p-6 flex flex-col justify-between border-l bg-white">
              <div>
                <h2 className="text-lg font-bold mb-5 text-gray-900">배차요청 확인</h2>
                {routeInfo && (
                  <div className="bg-blue-50 rounded-xl p-3 mb-4 grid grid-cols-2 gap-2">
                    <div className="text-center">
                      <div className="text-xs text-gray-500">거리</div>
                      <div className="font-bold text-blue-700">{routeInfo.distance} km</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500">소요시간</div>
                      <div className="font-bold text-blue-700">{routeInfo.time} 분</div>
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">상차지</div>
                    <div className="font-semibold text-gray-900">{form.상차지명}</div>
                    <div className="text-xs text-gray-500">{form.상차지주소}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">하차지</div>
                    <div className="font-semibold text-gray-900">{form.하차지명}</div>
                    <div className="text-xs text-gray-500">{form.하차지주소}</div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPreviewOpen(false)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold text-sm">취소</button>
                <button onClick={async () => { await submit(); setPreviewOpen(false); }}
                  className="flex-1 py-2.5 bg-[#1B2B4B] hover:opacity-90 text-white rounded-lg font-bold text-sm">배차요청</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 담당자 선택 팝업 */}
      {contactPicker && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center" onClick={() => setContactPicker(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[380px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-5 py-4">
              <h3 className="text-white font-bold text-[15px]">{contactPicker.item.name} 담당자 선택</h3>
              <p className="text-white/60 text-[12px] mt-0.5">저장된 담당자가 여러 명입니다. 사용할 담당자를 선택하세요.</p>
            </div>
            <div className="p-4 space-y-2">
              {contactPicker.contacts.map((c, i) => (
                <button
                  key={i}
                  onClick={() => { applyPlaceContact(contactPicker.item, contactPicker.field, c); setContactPicker(null); }}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-[#1B2B4B] hover:bg-[#eef1f7] transition"
                >
                  <div className="font-bold text-[14px] text-gray-900">{c.name || "(이름 없음)"}</div>
                  <div className="text-[12px] text-gray-500 mt-0.5">{c.phone || "-"}</div>
                </button>
              ))}
            </div>
            <div className="border-t border-gray-100 px-4 py-3 flex justify-end">
              <button onClick={() => setContactPicker(null)} className="px-4 py-2 text-[13px] font-semibold text-gray-500 hover:text-gray-700">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
