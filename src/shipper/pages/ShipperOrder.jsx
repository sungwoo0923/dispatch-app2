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
  limit,
  arrayUnion,
  deleteField,
} from "firebase/firestore";
import { useNavigate, useSearchParams } from "react-router-dom";

// 운송사 프로그램(DispatchApp.jsx)의 등록일 컬럼은 별도 문자열 필드 "등록일"(YYYY-MM-DD)을
// 참조하는데, 화주사 등록 시 createdAt(serverTimestamp)만 기록하고 이 필드를 채우지 않아
// 운송사 화면에 등록일이 "-"로만 나오던 버그 — 등록 시 오늘 날짜를 함께 기록한다.
const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// 경유지 목록은 정상적으로는 배열이지만, 다른 경로(전송하기/구버전 데이터 등)로
// 저장된 문서는 숫자키 맵 형태 등으로 들어올 수 있어 .filter() 호출 전 항상 배열로 정규화한다.
const safeStops = (v) => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
      return keys.sort((a, b) => Number(a) - Number(b)).map(k => v[k]);
    }
    if (v.업체명) return [v];
  }
  return [];
};

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

// 수정이력 추적 대상 필드 (운송사 앱(DispatchApp.jsx)의 history 배열과 동일 포맷을 공유한다)
const HISTORY_TRACKED_FIELDS = [
  "상차지명", "상차지주소", "상차담당자명", "상차담당자번호",
  "하차지명", "하차지주소", "하차담당자명", "하차담당자번호",
  "차량종류", "차량톤수", "화물내용",
  "상차방법", "하차방법", "지급방식",
  "상차일", "상차시간", "하차일", "하차시간",
];
function buildHistoryEntries(prev, next, userEmail) {
  const entries = [];
  HISTORY_TRACKED_FIELDS.forEach((f) => {
    if (!(f in (next || {}))) return;
    const before = prev?.[f] ?? "";
    const after = next?.[f] ?? "";
    if (String(before) !== String(after)) {
      entries.push({ at: Date.now(), user: userEmail || "unknown", field: f, before, after });
    }
  });
  return entries;
}

// 배차상태는 저장된 값이 아니라 항상 실제 오더 데이터(차량번호/화주사확인대기/상태)로부터
// 계산한다 — ShipperStatus.jsx의 getStatus와 동일한 규칙 (배차완료 오더인데 폼에 저장된
// 값이 없어 "요청"으로 고정 표시되던 버그 수정).
const getDisplayStatus = (o) => {
  if (!o) return "요청";
  if (["취소", "배차취소", "오더취소", "취소됨"].includes(o.상태)) return "배차취소";
  if (o.차량번호 && String(o.차량번호).trim()) return "배차완료";
  if (o.화주사확인대기 === true) return "요청";
  return "배차중";
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
  const [cargoRows, setCargoRows] = useState([{ qty: "", unit: "파레트", palletCo: "" }]);
  const [errors, setErrors] = useState({}); // { fieldKey: true }
  const [cargoRowErrors, setCargoRowErrors] = useState({}); // { rowIdx: true } — 파렛트사 미선택

  const updateCargoRow = (idx, key, value) => {
    setCargoRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: value } : r));
    if (key === "palletCo" && value) setCargoRowErrors(prev => (prev[idx] ? { ...prev, [idx]: false } : prev));
    if (key === "qty" && value) setErrors(prev => (prev.화물내용 ? { ...prev, 화물내용: false } : prev));
  };
  const addCargoRow = () => {
    setCargoRows(prev => prev.length >= 3 ? prev : [...prev, { qty: "", unit: "파레트", palletCo: "" }]);
  };
  const removeCargoRow = (idx) => {
    setCargoRows(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));
  };
  const buildCargoSummary = (rows) => rows.filter(r => r.qty).map(r => `${r.qty}${r.unit}`).join("+");
  const buildPalletSummary = (rows) => {
    const totals = {};
    rows.forEach(r => {
      if (r.unit !== "파레트" || !r.qty || !r.palletCo) return;
      const label = r.palletCo === "KPP" ? "K" : r.palletCo === "아주" ? "AJ" : r.palletCo;
      totals[label] = (totals[label] || 0) + Number(r.qty);
    });
    return Object.entries(totals).map(([label, n]) => `${label} ${n}장`).join("+");
  };
  const cargoRowsFromOrder = (item) =>
    Array.isArray(item?.화물목록) && item.화물목록.length
      ? item.화물목록.map(r => ({ qty: r.qty || "", unit: r.unit || "파레트", palletCo: r.palletCo || "" }))
      : [{ qty: item?.화물내용 || "", unit: item?.화물단위 || "파레트", palletCo: "" }];

  const [viaModal, setViaModal] = useState(null); // { type: "상차" | "하차" }
  const emptyViaStop = () => ({ 업체명: "", 주소: "", 담당자: "", 담당자번호: "", 화물내용: "", 차량톤수: "", 상차시간: "", 하차시간: "", 방법: "" });

  // 오더 불러오기
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchType, setSearchType] = useState("통합");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadedNotice, setLoadedNotice] = useState(false);

  const listRefTop = useRef(null);
  const listRefBottom = useRef(null);

  useEffect(() => {
  if (!previewOpen || !coords?.start || !coords?.end) return;
  let cancelled = false;
  const waitMapDiv = async () => {
    for (let i = 0; i < 20; i++) {
      const el = document.getElementById("shipper-map");
      if (el && el.offsetWidth > 0 && el.offsetHeight > 0) return el;
      await new Promise(r => setTimeout(r, 50));
    }
    return document.getElementById("shipper-map");
  };
  // 운송사 프로그램과 동일한 마커 아이콘(출발/도착 핀) — 디자인 일관성 유지
  const makePinIcon = (label, color) => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="60" height="80" viewBox="0 0 60 80">
        <rect x="2" y="2" width="56" height="26" rx="13" ry="13" fill="${color}" stroke="white" stroke-width="2"/>
        <text x="30" y="20" text-anchor="middle" font-size="13" font-weight="bold" font-family="sans-serif" fill="white">${label}</text>
        <polygon points="25,26 35,26 30,36" fill="${color}"/>
        <circle cx="30" cy="60" r="9" fill="${color}" stroke="white" stroke-width="3"/>
        <line x1="30" y1="36" x2="30" y2="51" stroke="${color}" stroke-width="3"/>
      </svg>`;
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  };
  const initMap = async () => {
    if (!window.Tmapv2) { setTimeout(initMap, 200); return; }
    const mapDiv = await waitMapDiv();
    if (!mapDiv || cancelled) return;
    mapDiv.innerHTML = "";
    const map = new window.Tmapv2.Map("shipper-map", {
      center: new window.Tmapv2.LatLng(coords.start.lat, coords.start.lon),
      width: "100%", height: "100%", zoom: 10,
    });
    try {
      // 운송사 프로그램과 동일하게 서버 프록시(/api/route)를 통해 경로를 조회한다.
      // (Tmap API를 브라우저에서 직접 호출하면 CORS로 막혀 지도에 경로/마커가 전혀
      //  그려지지 않던 문제 — 운송사 화면은 이미 이 방식으로 정상 동작 중이었다.)
      const API_BASE = import.meta.env.VITE_API_BASE || "";
      const viaAddrs = [
        ...(form.경유상차목록 || []).filter(s => s.주소?.trim()).map(s => s.주소),
        ...(form.경유하차목록 || []).filter(s => s.주소?.trim()).map(s => s.주소),
      ];
      const res = await fetch(`${API_BASE}/api/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromAddr: form.상차지주소, toAddr: form.하차지주소, viaPoints: viaAddrs }),
      });
      const data = await res.json();
      if (cancelled || !data?.path?.length) return;
      const linePath = data.path.map(([lng, lat]) => new window.Tmapv2.LatLng(lat, lng));
      new window.Tmapv2.Polyline({ path: linePath, strokeColor: "#2563eb", strokeWeight: 5, map });
      setRouteInfo({ distance: Number(data.distanceKm || 0).toFixed(1), time: Math.round(Number(data.durationMin || 0)) });

      const bounds = new window.Tmapv2.LatLngBounds();
      linePath.forEach((p) => { if (p) bounds.extend(p); });
      if (!bounds.isEmpty()) map.fitBounds(bounds);

      const markerStart = linePath[0];
      const markerEnd = linePath[linePath.length - 1];
      if (markerStart && markerEnd) {
        new window.Tmapv2.Marker({ position: markerStart, map, icon: makePinIcon("출발", "#2563eb"), iconSize: new window.Tmapv2.Size(60, 80), iconAnchor: new window.Tmapv2.Point(30, 80) });
        new window.Tmapv2.Marker({ position: markerEnd, map, icon: makePinIcon("도착", "#dc2626"), iconSize: new window.Tmapv2.Size(60, 80), iconAnchor: new window.Tmapv2.Point(30, 80) });
      }
    } catch (e) {
      console.error("경로 지도 실패:", e);
    }
  };
  initMap();
  return () => { cancelled = true; };
  }, [previewOpen, coords]);

  // 배차요청 확인 팝업: Enter=배차요청 전송, ESC=닫기
  useEffect(() => {
    if (!previewOpen) return;
    const handler = (e) => {
      if (e.key === "Enter") { e.preventDefault(); submit().then(() => setPreviewOpen(false)); }
      if (e.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewOpen]);

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
    청구운임: "",
    상차지명: "", 상차지주소: "", 상차담당자명: "", 상차담당자번호: "", 상차메모: "",
    하차지명: "", 하차지주소: "", 하차담당자명: "", 하차담당자번호: "", 하차메모: "",
    상차일: getDate(0), 상차시간: "08:00", 상차시간구분: "이후",
    하차일: getDate(0), 하차시간: "12:00", 하차시간구분: "이후",
    차량종류: "", 차량톤수: "", 차량톤수단위: "톤", 상차방법: "", 하차방법: "", 지급방식: "", 화물내용: "", 화물단위: "파레트",
    운송사명: "", 운송사코드: "",
    경유상차목록: [], 경유하차목록: [],
    독차: true, 혼적: false, 긴급: false,
  });

  const onChange = (k, v) => {
    setForm(p => ({ ...p, [k]: v }));
    setErrors(prev => (prev[k] ? { ...prev, [k]: false } : prev));
  };

  useEffect(() => {
    if (!editId) return;
    getDoc(doc(db, "orders", editId)).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        const { num, unit } = parseTonnage(data.차량톤수 || "");
        setForm(p => ({
          ...p, ...data, 차량톤수: num, 차량톤수단위: unit,
          경유상차목록: safeStops(data.경유상차목록),
          경유하차목록: safeStops(data.경유하차목록),
        }));
        setCargoRows(cargoRowsFromOrder(data));
      }
      setLoading(false);
    });
  }, [editId]);

  useEffect(() => {
    if (!editData) return;
    const { num, unit } = parseTonnage(editData.차량톤수 || "");
    setForm(p => ({
      ...p, ...editData, 차량톤수: num, 차량톤수단위: unit,
      경유상차목록: safeStops(editData.경유상차목록),
      경유하차목록: safeStops(editData.경유하차목록),
    }));
    setCargoRows(cargoRowsFromOrder(editData));
    setLoading(false);
  }, [editData]);

  const resetForm = () => {
    setForm({
      청구운임: "",
      상차지명: "", 상차지주소: "", 상차담당자명: "", 상차담당자번호: "", 상차메모: "",
      하차지명: "", 하차지주소: "", 하차담당자명: "", 하차담당자번호: "", 하차메모: "",
      상차일: getDate(0), 상차시간: "08:00", 상차시간구분: "이후",
      하차일: getDate(0), 하차시간: "12:00", 하차시간구분: "이후",
      차량종류: "", 차량톤수: "", 차량톤수단위: "톤", 상차방법: "", 하차방법: "", 지급방식: "", 화물내용: "", 화물단위: "파레트",
      운송사명: "", 운송사코드: "",
      경유상차목록: [], 경유하차목록: [],
      독차: true, 혼적: false, 긴급: false,
    });
    setCargoRows([{ qty: "", unit: "파레트", palletCo: "" }]);
    setSuggestions([]); setShowDropdown(null); setActiveIndex(-1);
    setErrors({}); setCargoRowErrors({});
    try { localStorage.removeItem("shipperOrderDraft"); } catch {}
  };

  /* 임시저장 (탭 이동/새로고침에도 작성 중이던 내용 유지) — 수정 모드에서는 사용 안 함 */
  useEffect(() => {
    if (editId || editData) return;
    try {
      const saved = localStorage.getItem("shipperOrderDraft");
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.form) setForm(p => ({ ...p, ...draft.form }));
        if (Array.isArray(draft.cargoRows) && draft.cargoRows.length) setCargoRows(draft.cargoRows);
        if (draft.companyEdit) { setCompanyEdit(draft.companyEdit); setCompanyEditable(true); }
      }
    } catch {}
  }, []);

  const skipFirstDraftSaveRef = useRef(true);
  useEffect(() => {
    if (editId || editData) return;
    if (skipFirstDraftSaveRef.current) { skipFirstDraftSaveRef.current = false; return; }
    const hasContent = form.상차지명 || form.하차지명 || form.상차지주소 || form.하차지주소 || cargoRows.some(r => r.qty);
    try {
      if (hasContent) localStorage.setItem("shipperOrderDraft", JSON.stringify({ form, cargoRows, companyEdit: companyEditable ? companyEdit : "" }));
      else localStorage.removeItem("shipperOrderDraft");
    } catch {}
  }, [form, cargoRows, companyEdit, companyEditable, editId, editData]);

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

  const validate = () => {
    const errs = {};
    const effectiveCompany = companyEditable ? companyEdit : company;
    if (!effectiveCompany?.trim()) errs.거래처명 = true;
    if (!form.상차지명?.trim()) errs.상차지명 = true;
    if (!form.상차지주소?.trim()) errs.상차지주소 = true;
    if (!form.하차지명?.trim()) errs.하차지명 = true;
    if (!form.하차지주소?.trim()) errs.하차지주소 = true;
    if (!form.차량종류) errs.차량종류 = true;
    if (!form.차량톤수?.toString().trim()) errs.차량톤수 = true;
    if (!form.상차방법) errs.상차방법 = true;
    if (!form.하차방법) errs.하차방법 = true;
    if (!form.지급방식) errs.지급방식 = true;
    if (!cargoRows.some(r => r.qty)) errs.화물내용 = true;

    const rowErrs = {};
    cargoRows.forEach((r, idx) => {
      if (r.unit === "파레트" && r.qty && !r.palletCo) rowErrs[idx] = true;
    });

    setErrors(errs);
    setCargoRowErrors(rowErrs);

    if (Object.keys(errs).length > 0 || Object.keys(rowErrs).length > 0) {
      alert("필수 항목을 입력/선택해주세요. (빨간색 테두리로 표시된 항목을 확인하세요)");
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (!validate()) return;
    const effectiveCompany = companyEditable ? companyEdit : company;
    await upsertPlace({ name: form.상차지명, address: form.상차지주소, 담당자명: form.상차담당자명, 담당자번호: form.상차담당자번호, 메모: form.상차메모 }, "상차");
    await upsertPlace({ name: form.하차지명, address: form.하차지주소, 담당자명: form.하차담당자명, 담당자번호: form.하차담당자번호, 메모: form.하차메모 }, "하차");

    const 차량톤수Combined = form.차량톤수단위 === "없음" ? "" : form.차량톤수 ? `${form.차량톤수}${form.차량톤수단위}` : "";
    const saveForm = {
      ...form,
      차량톤수: 차량톤수Combined,
      화물내용: buildCargoSummary(cargoRows),
      화물목록: cargoRows,
      파렛트사요약: buildPalletSummary(cargoRows),
    };
    if (editId || editData?.id) {
      const isDispatched = !!editData?.차량번호;
      if (isDispatched) {
        await updateDoc(doc(db, "orders", editId || editData.id), {
          수정요청: true,
          수정요청데이터: saveForm,
          수정요청일시: serverTimestamp(),
          수정요청자: user?.email || "",
          수정거절: false,
        });
      } else {
        const historyEntries = buildHistoryEntries(editData, saveForm, user?.email);
        await updateDoc(doc(db, "orders", editId || editData.id), {
          ...saveForm,
          ...(historyEntries.length > 0 ? { history: arrayUnion(...historyEntries) } : {}),
          updatedAt: serverTimestamp(),
          최종수정출처: "shipper",
          최종수정일시: serverTimestamp(),
          // 새로 수정할 때마다 운송사의 이전 확인 여부를 초기화해, 운송사 화면의
          // "수정" 배지가 이번 수정 건에 대해 다시 뜨도록 한다.
          최종수정확인: deleteField(),
        });
      }
    } else {
      await addDoc(collection(db, "orders"), {
        ...saveForm,
        shipperUid: user.uid,
        작성자: user.email,
        거래처명: effectiveCompany,
        shipperCompany: effectiveCompany,
        배차상태: "배차중",
        업체전달상태: "미전달",
        화주사확인대기: true,
        createdAt: serverTimestamp(),
        등록일: todayStr(),
        role: "shipper",
        source: "shipper",
        company: form.운송사명 || "",
        companyCode: form.운송사코드 || "",
      });
    }

    if (editId || editData) {
      alert(editData?.차량번호 ? "수정요청을 전송했습니다. 운송사 승인 후 반영됩니다." : "수정 완료");
      onClose ? onClose() : navigate("/shipper/status");
    } else {
      try { localStorage.removeItem("shipperOrderDraft"); } catch {}
      navigate("/shipper/status");
    }
  };

  /* 오더 불러오기 검색 */
  const handleSearch = async () => {
    if (!user) return;
    setSearchLoading(true);
    try {
      // 오더등록자(shipperUid) 기준으로 찾으면 다른 담당자가 등록한 오더나 전송받은 오더가
      // 전부 빠져 검색결과가 비어있던 문제 — 화주사(회사) 전체 오더를 대상으로 검색한다.
      const q = query(
        collection(db, "orders"),
        where("shipperCompany", "==", company),
        limit(200)
      );
      const snap = await getDocs(q);
      // 지급방식이 "손실"인 오더는 화주사에게 청구하지 않는 건이라 화주사 화면에서는
      // 완전히 보이지 않아야 하므로, 오더 불러오기 검색결과에서도 제외한다.
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(item => item.지급방식 !== "손실")
        .sort((a, b) => (b.createdAt?.seconds || b.createdAt || 0) - (a.createdAt?.seconds || a.createdAt || 0));

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

  // 운송사 프로그램의 "오더복사" 기능과 동일한 규칙: 날짜는 오늘로, 상하차시간은 원본과 동일하게,
  // 화물내용/톤수/파렛트사는 새로 입력하도록 비워둔다.
  const applyOrder = (item) => {
    setForm(p => ({
      ...p,
      상차지명: item.상차지명 || "", 상차지주소: item.상차지주소 || "",
      상차담당자명: item.상차담당자명 || item.상차지담당자 || "", 상차담당자번호: item.상차담당자번호 || item.상차지담당자번호 || "",
      하차지명: item.하차지명 || "", 하차지주소: item.하차지주소 || "",
      하차담당자명: item.하차담당자명 || item.하차지담당자 || "", 하차담당자번호: item.하차담당자번호 || item.하차지담당자번호 || "",
      상차일: getDate(0), 상차시간: item.상차시간 || "08:00", 상차시간구분: item.상차시간구분 || "이후",
      하차일: getDate(0), 하차시간: item.하차시간 || "12:00", 하차시간구분: item.하차시간구분 || "이후",
      차량종류: item.차량종류 || "", 차량톤수: "", 차량톤수단위: "톤",
      상차방법: item.상차방법 || "", 하차방법: item.하차방법 || "",
      지급방식: item.지급방식 || "", 화물내용: "",
      화물단위: "파레트",
      운송사명: item.운송사명 || "", 운송사코드: item.운송사코드 || "",
      경유상차목록: Array.isArray(item.경유상차목록) ? item.경유상차목록 : [],
      경유하차목록: Array.isArray(item.경유하차목록) ? item.경유하차목록 : [],
    }));
    setCargoRows([{ qty: "", unit: "파레트", palletCo: "" }]);
    setLoadedNotice(true);
    setTimeout(() => setLoadedNotice(false), 1800);
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

  const errCls = (key) => (errors[key] ? " border-red-500 ring-2 ring-red-200" : "");

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
                  <input value={companyEdit} onChange={e => { setCompanyEdit(e.target.value); setErrors(prev => (prev.거래처명 ? { ...prev, 거래처명: false } : prev)); }} className={inputCls + errCls("거래처명")} />
                  <button onClick={() => setCompanyEditable(false)} className="px-3 py-2 text-sm bg-[#1B2B4B] text-white rounded-lg font-semibold whitespace-nowrap">확인</button>
                  <button onClick={() => { setCompanyEditable(false); setCompanyEdit(company); }} className="px-3 py-2 text-sm bg-gray-200 rounded-lg whitespace-nowrap">취소</button>
                </>
              ) : (
                <>
                  <input value={company} disabled className={inputCls + " bg-gray-100 font-semibold text-gray-800" + errCls("거래처명")} />
                  <button onClick={() => setCompanyEditable(true)} className="px-3 py-2 text-sm bg-gray-600 text-white rounded-lg font-semibold whitespace-nowrap">변경</button>
                </>
              )}
            </div>
            {(editId || editData) && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className={labelCls}>배차상태</label>
                  <div className="p-2.5 bg-white border rounded-lg font-semibold text-gray-800 text-sm">{getDisplayStatus(editData)}</div>
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
                <input className={inputCls + errCls("상차지명")} placeholder="상차지명" value={form.상차지명}
                  onChange={e => { onChange("상차지명", e.target.value); searchPlaces(e.target.value, "상차지명"); }}
                  onKeyDown={e => handleKeyDown(e, "상차지명")}
                  onFocus={() => setShowDropdown("상차지명")}
                  onBlur={() => setTimeout(() => setShowDropdown(null), 150)}
                />
                {showDropdown === "상차지명" && suggestions.length > 0 && (
                  <div ref={listRefTop} className="absolute z-50 bg-white border rounded-lg w-full mt-1 max-h-60 overflow-y-auto shadow-lg">
                    {suggestions.map((item, idx) => (
                      <div key={idx} className={`px-3 py-2 text-sm cursor-pointer ${idx === activeIndex ? "bg-[#eef1f7]" : "hover:bg-gray-50"}`}
                        onMouseDown={() => selectSuggestion(item, "상차지명")}>
                        <div className="font-semibold text-gray-900">{item.name}</div>
                        {item.address && <div className="text-xs text-gray-500 mt-0.5">{item.address}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div><label className={labelCls}>상차지주소</label><input className={inputCls + errCls("상차지주소")} placeholder="상차지주소" value={form.상차지주소} onChange={e => onChange("상차지주소", e.target.value)} /></div>
              <div><label className={labelCls}>담당자명</label><input className={inputCls} placeholder="담당자명" value={form.상차담당자명} onChange={e => onChange("상차담당자명", e.target.value)} /></div>
              <div><label className={labelCls}>담당자번호</label><input className={inputCls} placeholder="담당자번호" value={form.상차담당자번호} onChange={e => onChange("상차담당자번호", e.target.value)} /></div>
              <div><label className={labelCls}>메모</label><input className={inputCls} placeholder="메모" value={form.상차메모} onChange={e => onChange("상차메모", e.target.value)} /></div>
              <div className="pt-1">
                {(form.경유상차목록 || []).filter(s => s.업체명?.trim()).length > 0 ? (
                  <button type="button" onClick={() => setViaModal({ type: "상차" })}
                    className="px-3 py-1.5 text-[12px] font-bold rounded-full bg-[#1B2B4B] text-white hover:opacity-90">
                    경유+{(form.경유상차목록 || []).filter(s => s.업체명?.trim()).length} · 수정
                  </button>
                ) : (
                  <button type="button" onClick={() => setViaModal({ type: "상차" })}
                    className="w-full py-2.5 rounded-lg border-2 border-dashed border-[#1B2B4B]/50 text-[#1B2B4B] text-sm font-bold hover:bg-[#eef1f7] transition">
                    + 경유지 추가
                  </button>
                )}
              </div>
            </div>

            {/* 하차지 */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-gray-700 mb-2 border-b pb-1">하차지</div>
              <div className="relative">
                <label className={labelCls}>하차지명</label>
                <input className={inputCls + errCls("하차지명")} placeholder="하차지명" value={form.하차지명}
                  onChange={e => { onChange("하차지명", e.target.value); searchPlaces(e.target.value, "하차지명"); }}
                  onKeyDown={e => handleKeyDown(e, "하차지명")}
                  onFocus={() => setShowDropdown("하차지명")}
                  onBlur={() => setTimeout(() => setShowDropdown(null), 150)}
                />
                {showDropdown === "하차지명" && suggestions.length > 0 && (
                  <div ref={listRefBottom} className="absolute z-50 bg-white border rounded-lg w-full mt-1 max-h-60 overflow-y-auto shadow-lg">
                    {suggestions.map((item, idx) => (
                      <div key={idx} className={`px-3 py-2 text-sm cursor-pointer ${idx === activeIndex ? "bg-[#eef1f7]" : "hover:bg-gray-50"}`}
                        onMouseDown={() => selectSuggestion(item, "하차지명")}>
                        <div className="font-semibold text-gray-900">{item.name}</div>
                        {item.address && <div className="text-xs text-gray-500 mt-0.5">{item.address}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div><label className={labelCls}>하차지주소</label><input className={inputCls + errCls("하차지주소")} placeholder="하차지주소" value={form.하차지주소} onChange={e => onChange("하차지주소", e.target.value)} /></div>
              <div><label className={labelCls}>담당자명</label><input className={inputCls} placeholder="담당자명" value={form.하차담당자명} onChange={e => onChange("하차담당자명", e.target.value)} /></div>
              <div><label className={labelCls}>담당자번호</label><input className={inputCls} placeholder="담당자번호" value={form.하차담당자번호} onChange={e => onChange("하차담당자번호", e.target.value)} /></div>
              <div><label className={labelCls}>메모</label><input className={inputCls} placeholder="메모" value={form.하차메모} onChange={e => onChange("하차메모", e.target.value)} /></div>
              <div className="pt-1">
                {(form.경유하차목록 || []).filter(s => s.업체명?.trim()).length > 0 ? (
                  <button type="button" onClick={() => setViaModal({ type: "하차" })}
                    className="px-3 py-1.5 text-[12px] font-bold rounded-full bg-[#1B2B4B] text-white hover:opacity-90">
                    경유+{(form.경유하차목록 || []).filter(s => s.업체명?.trim()).length} · 수정
                  </button>
                ) : (
                  <button type="button" onClick={() => setViaModal({ type: "하차" })}
                    className="w-full py-2.5 rounded-lg border-2 border-dashed border-[#1B2B4B]/50 text-[#1B2B4B] text-sm font-bold hover:bg-[#eef1f7] transition">
                    + 경유지 추가
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 화물 정보 */}
        <div>
          <div className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#1B2B4B] rounded-full inline-block" />
            화물 정보
          </div>
          <div className="bg-gray-50 rounded-xl p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>차량종류</label>
                <select className={inputCls + errCls("차량종류")} value={form.차량종류} onChange={e => onChange("차량종류", e.target.value)}>
                  <option value="">선택</option>
                  {["라보/다마스","카고","윙바디","탑차","냉장탑","냉동탑","냉장윙","냉동윙","냉장/냉동탑","냉장/냉동윙","리프트","오토바이"].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>톤수</label>
                <div className="flex gap-1.5">
                  <input className={inputCls + errCls("차량톤수")} style={{ flex: 2 }} placeholder="숫자" value={form.차량톤수}
                    inputMode="decimal"
                    onChange={e => onChange("차량톤수", e.target.value.replace(/[^0-9.]/g, ""))} />
                  <select className={inputCls} style={{ flex: 1, minWidth: 0 }} value={form.차량톤수단위} onChange={e => onChange("차량톤수단위", e.target.value)}>
                    <option>톤</option><option>kg</option><option>없음</option>
                  </select>
                </div>
              </div>
            </div>
            <div>
              <label className={labelCls}>화물내용 (최대 3개까지 추가 가능)</label>
              <div className="space-y-2">
                {cargoRows.map((row, idx) => (
                  <div key={idx} className="flex gap-1.5 items-center">
                    <input className={inputCls + errCls("화물내용")} style={{ flex: 1 }} placeholder="수량" value={row.qty}
                      onChange={e => updateCargoRow(idx, "qty", e.target.value.replace(/[^0-9.]/g, ""))} />
                    <select className={inputCls} style={{ flex: 1, minWidth: 0 }} value={row.unit}
                      onChange={e => updateCargoRow(idx, "unit", e.target.value)}>
                      {["파레트","박스","없음","개"].map(v => <option key={v}>{v}</option>)}
                    </select>
                    {row.unit === "파레트" && (
                      <select className={inputCls + (cargoRowErrors[idx] ? " border-red-500 ring-2 ring-red-200" : "")} style={{ flex: 1, minWidth: 0 }} value={row.palletCo}
                        onChange={e => updateCargoRow(idx, "palletCo", e.target.value)}>
                        <option value="">파렛트사</option>
                        <option value="아주">아주</option>
                        <option value="KPP">KPP</option>
                      </select>
                    )}
                    {cargoRows.length > 1 && (
                      <button type="button" onClick={() => removeCargoRow(idx)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-400 hover:text-red-500 hover:border-red-300 shrink-0">×</button>
                    )}
                  </div>
                ))}
                {cargoRows.length < 3 && (
                  <button type="button" onClick={addCargoRow}
                    className="w-full py-2 rounded-lg border border-dashed border-gray-300 text-gray-500 text-sm font-semibold hover:border-[#1B2B4B] hover:text-[#1B2B4B] transition">
                    + 화물 추가 ({cargoRows.length}/3)
                  </button>
                )}
              </div>
              {cargoRows.some(r => r.qty) && (
                <div className="mt-2 text-xs text-[#1B2B4B] font-semibold">{buildCargoSummary(cargoRows)}</div>
              )}
            </div>
          </div>
        </div>

        {/* 배차옵션 */}
        <div>
          <div className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#1B2B4B] rounded-full inline-block" />
            배차옵션
          </div>
          <div className="bg-gray-50 rounded-xl p-4 flex gap-2">
            <button type="button"
              onClick={() => setForm(p => ({ ...p, 독차: true, 혼적: false }))}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${form.독차 ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
              독차
            </button>
            <button type="button"
              onClick={() => setForm(p => ({ ...p, 혼적: true, 독차: false }))}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${form.혼적 ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
              혼적
            </button>
            <button type="button"
              onClick={() => onChange("긴급", !form.긴급)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${form.긴급 ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
              긴급
            </button>
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
              <select className={inputCls + errCls("상차방법")} value={form.상차방법} onChange={e => onChange("상차방법", e.target.value)}>
                <option value="">선택</option>
                {["지게차","수도움","수작업","크레인"].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>하차방법</label>
              <select className={inputCls + errCls("하차방법")} value={form.하차방법} onChange={e => onChange("하차방법", e.target.value)}>
                <option value="">선택</option>
                {["지게차","수도움","수작업","크레인"].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>지급방식</label>
              <select className={inputCls + errCls("지급방식")} value={form.지급방식} onChange={e => onChange("지급방식", e.target.value)}>
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
              if (!validate()) return;
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
          <div className="bg-white w-[980px] h-[620px] rounded-2xl overflow-hidden flex shadow-2xl">
            <div id="shipper-map" className="flex-1 h-full" />
            <div className="w-[360px] p-6 flex flex-col justify-between border-l bg-white overflow-y-auto">
              <div>
                <h2 className="text-lg font-bold mb-1 text-gray-900">배차요청 확인</h2>
                <div className="text-[12px] text-[#1B2B4B] font-bold mb-4">
                  운송사: {form.운송사명 || "미지정"}
                </div>
                {routeInfo && (
                  <div className="bg-[#eef1f7] rounded-xl p-3 mb-4 grid grid-cols-2 gap-2">
                    <div className="text-center">
                      <div className="text-xs text-gray-500">거리</div>
                      <div className="font-bold text-[#1B2B4B]">{routeInfo.distance} km</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500">소요시간</div>
                      <div className="font-bold text-[#1B2B4B]">{routeInfo.time} 분</div>
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
                  <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-2 gap-y-2 gap-x-2 text-[13px]">
                    <div>
                      <div className="text-xs text-gray-400">화물내용</div>
                      <div className="font-semibold text-gray-900">{buildCargoSummary(cargoRows) || "-"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">파렛트사</div>
                      <div className="font-semibold text-gray-900">{buildPalletSummary(cargoRows) || "-"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">차량종류</div>
                      <div className="font-semibold text-gray-900">{form.차량종류 || "-"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">톤수</div>
                      <div className="font-semibold text-gray-900">{form.차량톤수단위 === "없음" ? "-" : (form.차량톤수 ? `${form.차량톤수}${form.차량톤수단위}` : "-")}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">상차방법</div>
                      <div className="font-semibold text-gray-900">{form.상차방법 || "-"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">하차방법</div>
                      <div className="font-semibold text-gray-900">{form.하차방법 || "-"}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-4">
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

      {/* 경유지 추가/수정 팝업 */}
      {viaModal && (
        <ViaStopModal
          type={viaModal.type}
          list={viaModal.type === "상차" ? form.경유상차목록 : form.경유하차목록}
          onSave={(newList) => onChange(viaModal.type === "상차" ? "경유상차목록" : "경유하차목록", newList)}
          onClose={() => setViaModal(null)}
        />
      )}

      {/* 오더 불러오기 완료 안내 팝업 */}
      {loadedNotice && (
        <div className="fixed inset-0 bg-black/30 z-[999999] flex items-center justify-center" onClick={() => setLoadedNotice(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[300px] overflow-hidden text-center" onClick={e => e.stopPropagation()}>
            <div className="pt-6 pb-4 px-5">
              <div className="w-11 h-11 rounded-full bg-[#eef1f7] flex items-center justify-center mx-auto mb-3">
                <span className="text-[#1B2B4B] text-xl font-bold">✓</span>
              </div>
              <div className="font-bold text-gray-900 text-[15px]">오더를 불러왔습니다</div>
              <div className="text-gray-500 text-[12px] mt-1">선택한 오더 내용이 입력되었습니다</div>
            </div>
            <button onClick={() => setLoadedNotice(false)}
              className="w-full py-3 border-t border-gray-100 text-[#1B2B4B] font-semibold text-sm hover:bg-[#eef1f7]">
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ViaStopModal({ type, list, onSave, onClose }) {
  const emptyStop = () => ({ 업체명: "", 주소: "", 담당자: "", 담당자번호: "", 화물내용: "", 차량톤수: "", 상차시간: "", 하차시간: "", 방법: "" });
  const [rows, setRows] = useState(() => {
    const init = (list || []).filter(s => s?.업체명?.trim());
    return init.length ? init.map(s => ({ ...emptyStop(), ...s })) : [emptyStop()];
  });
  const label = type === "상차" ? "상차경유지" : "하차경유지";
  const timeKey = type === "상차" ? "상차시간" : "하차시간";

  const [allPlaces, setAllPlaces] = useState([]);
  const [placeDropdownIdx, setPlaceDropdownIdx] = useState(null);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDocs(query(collection(db, "places"), where("userId", "==", uid)))
      .then(snap => setAllPlaces(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, []);
  const filterPlaces = (v) => {
    if (!v.trim()) return [];
    const lq = v.toLowerCase();
    return allPlaces.filter(p => (p.name || "").toLowerCase().includes(lq)).slice(0, 8);
  };

  const update = (idx, key, v) => setRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: v } : r));
  const applyPlaceToRow = (idx, p) => {
    const contacts = Array.isArray(p.contacts) ? p.contacts.filter(c => c.name || c.phone) : [];
    const first = contacts[0];
    setRows(prev => prev.map((r, i) => i === idx ? {
      ...r,
      업체명: p.name || "",
      주소: p.address || "",
      담당자: first?.name || p.담당자명 || "",
      담당자번호: first?.phone || p.담당자번호 || "",
    } : r));
    setPlaceDropdownIdx(null);
  };
  const addRow = () => setRows(prev => [...prev, emptyStop()]);
  const removeRow = (idx) => setRows(prev => prev.filter((_, i) => i !== idx));
  const handleSave = () => { onSave(rows.filter(s => s.업체명?.trim())); onClose(); };

  return (
    <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[520px] max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between shrink-0">
          <h3 className="text-white font-bold text-[15px]">{label} 추가/수정</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {rows.map((stop, idx) => (
            <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-2 bg-gray-50">
              <div className="relative">
                <input className={inputCls} placeholder="경유지명" value={stop.업체명}
                  onChange={e => { update(idx, "업체명", e.target.value); setPlaceDropdownIdx(idx); }}
                  onFocus={() => setPlaceDropdownIdx(idx)}
                  onBlur={() => setTimeout(() => setPlaceDropdownIdx(null), 150)}
                />
                {placeDropdownIdx === idx && filterPlaces(stop.업체명).length > 0 && (
                  <div className="absolute z-50 bg-white border rounded-lg w-full mt-1 max-h-48 overflow-y-auto shadow-lg">
                    {filterPlaces(stop.업체명).map((p, pi) => (
                      <div key={p.id || pi} className="px-3 py-2 text-sm cursor-pointer hover:bg-[#eef1f7]"
                        onMouseDown={() => applyPlaceToRow(idx, p)}>
                        <div className="font-semibold text-gray-900">{p.name}</div>
                        {p.address && <div className="text-xs text-gray-500 mt-0.5">{p.address}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <input className={inputCls} placeholder="주소" value={stop.주소} onChange={e => update(idx, "주소", e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="담당자명" value={stop.담당자} onChange={e => update(idx, "담당자", e.target.value)} />
                <input className={inputCls} placeholder="담당자번호" value={stop.담당자번호} onChange={e => update(idx, "담당자번호", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="화물내용 (예: 2파레트)" value={stop.화물내용} onChange={e => update(idx, "화물내용", e.target.value)} />
                <input className={inputCls} placeholder="톤수 (예: 1톤)" value={stop.차량톤수} onChange={e => update(idx, "차량톤수", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder={`${type}시간`} value={stop[timeKey]} onChange={e => update(idx, timeKey, e.target.value)} />
                <select className={inputCls} value={stop.방법} onChange={e => update(idx, "방법", e.target.value)}>
                  <option value="">방법 선택</option>
                  {["지게차", "수도움", "수작업", "크레인"].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              {rows.length > 1 && (
                <div className="text-right">
                  <button type="button" onClick={() => removeRow(idx)} className="text-[11px] text-red-500 hover:text-red-700 font-semibold">삭제</button>
                </div>
              )}
            </div>
          ))}
          <button type="button" onClick={addRow}
            className="w-full py-2 rounded-lg border border-dashed border-gray-300 text-gray-500 text-sm font-semibold hover:border-[#1B2B4B] hover:text-[#1B2B4B] transition">
            + 경유지 추가
          </button>
        </div>
        <div className="border-t border-gray-100 px-5 py-3 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold">취소</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm rounded-lg bg-[#1B2B4B] text-white font-bold hover:opacity-90">저장</button>
        </div>
      </div>
    </div>
  );
}
