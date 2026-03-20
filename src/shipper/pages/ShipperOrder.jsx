import { useState, useEffect, useRef } from "react";
import { db, auth } from "../../firebase";
import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { getDocs, query, where } from "firebase/firestore";
import { useNavigate, useSearchParams } from "react-router-dom";

/* ================= 공통 유틸 ================= */
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

const getDate = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export default function ShipperOrder() {
  const user = auth.currentUser;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get("edit");
const [results, setResults] = useState([]);
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(!!editId);
  const [suggestions, setSuggestions] = useState([]);
const [activeIndex, setActiveIndex] = useState(-1);
const [showDropdown, setShowDropdown] = useState(null);
const listRefTop = useRef(null);
const listRefBottom = useRef(null);
const [fixedTransport, setFixedTransport] = useState(null);
const [transportList, setTransportList] = useState([]);
useEffect(() => {
  const saved = localStorage.getItem("fixedTransport");

  if (saved) {
    const parsed = JSON.parse(saved);

    setFixedTransport(parsed);

    // 🔥 폼에도 반영
    setForm(p => ({
      ...p,
      운송사명: parsed.name,
      운송사코드: parsed.code,
    }));
  }
}, []);
useEffect(() => {
  const saved = localStorage.getItem("transportList");

  if (saved) {
    const parsed = JSON.parse(saved);
    console.log("운송사 리스트:", parsed); // 🔥 확인용
    setTransportList(parsed);
  }
}, []);
useEffect(() => {
  const saved = localStorage.getItem("transportList");
  if (saved) {
    setTransportList(JSON.parse(saved));
  }
}, []);
  // ================= 회사명 로드 =================
  useEffect(() => {
    if (!user) return;

    const loadCompany = async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        const d = snap.data();
        setCompany(
          d.companyName || d.회사명 || d.company || d.거래처명 || ""
        );
        return;
      }
      setCompany(`(주)${user.email?.split("@")[0] || "화주사"}`);
    };

    loadCompany();
  }, [user]);

  // ================= form (🔥 기존 항목 전부 유지) =================
  const [searchType, setSearchType] = useState("전체");
const [keyword, setKeyword] = useState("");
  const [form, setForm] = useState({
    status: "요청",
    청구운임: "",
    상차지명: "",
    상차지주소: "",
    상차담당자명: "",
상차담당자번호: "",
상차메모: "",
    하차지명: "",
    하차지주소: "",
    하차담당자명: "",
하차담당자번호: "",
하차메모: "",
    상차일: getDate(0),
    상차시간: "08:00",
    하차일: getDate(0),
    하차시간: "12:00",
    차량종류: "",
    차량톤수: "",
    상차방법: "",
    하차방법: "",
    지급방식: "",
    화물내용: "",
    운송사명: "",
운송사코드: "",
  });

  const onChange = (k, v) =>
    setForm((p) => ({ ...p, [k]: v }));

  // ================= 수정모드 로드 =================
  useEffect(() => {
    if (!editId) return;

    const load = async () => {
      const snap = await getDoc(doc(db, "orders", editId));
      if (snap.exists()) {
        setForm((p) => ({ ...p, ...snap.data() }));
      }
      setLoading(false);
    };

    load();
  }, [editId]);

  // ================= 저장 =================
  // ✅ resetForm 먼저 선언
const resetForm = () => {
  setForm({
    status: "요청",
    청구운임: "",

    상차지명: "",
    상차지주소: "",
    상차담당자명: "",
    상차담당자번호: "",
    상차메모: "",

    하차지명: "",
    하차지주소: "",
    하차담당자명: "",
    하차담당자번호: "",
    하차메모: "",

    상차일: getDate(0),
    상차시간: "08:00",
    하차일: getDate(0),
    하차시간: "12:00",

    차량종류: "",
    차량톤수: "",

    상차방법: "",
    하차방법: "",
    지급방식: "",

    화물내용: "",
    운송사명: "",
운송사코드: "",
  });

  setSuggestions([]);
  setShowDropdown(null);
  setActiveIndex(-1);
};
const upsertPlace = async (data, type) => {
  const q = query(
    collection(db, "places"),
    where("userId", "==", user.uid),
    where("name", "==", data.name),
    where("type", "==", type)
  );

  const snap = await getDocs(q);

  if (!snap.empty) {
    const docId = snap.docs[0].id;

    await updateDoc(doc(db, "places", docId), {
      address: data.address,
      담당자명: data.담당자명,
      담당자번호: data.담당자번호,
      메모: data.메모,
      updatedAt: serverTimestamp(),
    });

  } else {
    await addDoc(collection(db, "places"), {
      ...data,
      type,
      userId: user.uid,
      createdAt: serverTimestamp(),
    });
  }
};
  const submit = async () => {
    if (!form.상차지명 || !form.하차지명) {
      return alert("상차지 / 하차지를 입력하세요.");
    }
// 🔥 상차지 항상 실행
await upsertPlace({
  name: form.상차지명,
  address: form.상차지주소,
  담당자명: form.상차담당자명,
  담당자번호: form.상차담당자번호,
  메모: form.상차메모,
}, "상차");

// 🔥 하차지 항상 실행
await upsertPlace({
  name: form.하차지명,
  address: form.하차지주소,
  담당자명: form.하차담당자명,
  담당자번호: form.하차담당자번호,
  메모: form.하차메모,
}, "하차");
    if (editId) {
      await updateDoc(doc(db, "orders", editId), {
        ...form,
        updatedAt: serverTimestamp(),
      });
    } else {

      await addDoc(collection(db, "orders"), {
  ...form,

  shipperUid: user.uid,
  거래처명: company,
  shipperCompany: company,

  // 🔥 핵심 수정
  배차상태: "배차중",
  업체전달상태: "미전달",

  createdAt: serverTimestamp(),

  role: "shipper",
  source: "shipper",

  company: form.운송사명 || "",
  companyCode: form.운송사코드 || "",
});
    }

    navigate("/shipper/status");
  };
const handleSearch = async () => {
  if (!user) return;

  const today = getDate(0);

  const q = query(
    collection(db, "orders"), // ⚠️ 컬렉션명 확인
    where("상차일", "==", today),
    where("shipperUid", "==", user.uid)
  );

  const snap = await getDocs(q);

  let list = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  if (keyword) {
    list = list.filter(item =>
      (item.상차지명 || "").includes(keyword) ||
      (item.하차지명 || "").includes(keyword) ||
      (item.거래처명 || "").includes(keyword)
    );
  }

  setResults(list);
};
const applyOrder = (item) => {
  setForm({
    배차상태: "배차중",

    청구운임: item.청구운임 || "",

    상차지명: item.상차지명 || "",
    상차지주소: item.상차지주소 || "",

    하차지명: item.하차지명 || "",
    하차지주소: item.하차지주소 || "",

    상차일: getDate(0),
    상차시간: item.상차시간 || "08:00",

    하차일: getDate(0),
    하차시간: item.하차시간 || "12:00",

    차량종류: item.차량종류 || "",
    차량톤수: item.차량톤수 || "",

    상차방법: item.상차방법 || "",
    하차방법: item.하차방법 || "",

    지급방식: item.지급방식 || "",

    화물내용: item.화물내용 || "",
  });
};
// ================= 운송사 자동완성 =================
const searchTransport = (value) => {
  if (!value) {
    setSuggestions([]);
    return;
  }

  const list = transportList.filter(item =>
    (item.name || "").toLowerCase().includes(value.toLowerCase())
  );

  setSuggestions(list.slice(0, 10));
  setShowDropdown("운송사명");
  setActiveIndex(-1);
};
const searchPlaces = async (value, field) => {
  if (!value) {
    setSuggestions([]);
    return;
  }

 const q = query(
  collection(db, "places"),
  where("userId", "==", user.uid)
);

const snap = await getDocs(q);

let list = snap.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
}));

list = list.filter(item =>
  (item.name || "").includes(value)
);

// 🔥 업체명 정규화 (반찬단지 = (주)반찬단지 동일 처리)
const normalizeName = (name = "") =>
  name
    .toString()
    .replace(/\(주\)|주식회사/g, "")
    .replace(/\s/g, "")
    .toLowerCase();

// 🔥 중복 제거 + 최신 데이터만 유지
const map = new Map();

list.forEach(item => {
  const candidates = [
  {
    name: item.name,
    address: item.address,
    담당자명: item.담당자명,
    담당자번호: item.담당자번호,
    메모: item.메모,
    type: item.type,
    createdAt: item.createdAt
  }
];
  candidates.forEach(p => {
    if (!p.name) return;

    const key = normalizeName(p.name);

    if (!map.has(key)) {
      map.set(key, p);
    } else {
      const existing = map.get(key);

      if (
        p.createdAt?.seconds > existing.createdAt?.seconds
      ) {
        map.set(key, p);
      }
    }
  });
});

// 🔥 최종 리스트
const uniquePlaces = Array.from(map.values())
.filter(p =>
  (p.name || "").toLowerCase().includes(value.toLowerCase())
)

setSuggestions(uniquePlaces.slice(0, 10));
  setShowDropdown(field);
  setActiveIndex(-1);
};
const handleKeyDown = (e, field) => {
 if (!showDropdown || showDropdown !== field) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    setActiveIndex(prev => Math.min(prev + 1, suggestions.length - 1));
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    setActiveIndex(prev => Math.max(prev - 1, 0));
  }

  if (e.key === "Enter") {
    e.preventDefault();
    if (activeIndex >= 0) {
      selectSuggestion(suggestions[activeIndex], field);
    }
  }
};

const selectSuggestion = (item, field) => {
  if (field === "상차지명") {
    setForm(p => ({
      ...p,
      상차지명: item.name || "",
      상차지주소: item.address || "",
      상차담당자명: item.담당자명 || "",
      상차담당자번호: item.담당자번호 || "",
      상차메모: item.메모 || ""
    }));
  }

  if (field === "하차지명") {
    setForm(p => ({
      ...p,
      하차지명: item.name || "",
      하차지주소: item.address || "",
      하차담당자명: item.담당자명 || "",
      하차담당자번호: item.담당자번호 || "",
      하차메모: item.메모 || ""
    }));
  }
if (field === "운송사명") {
  const selected = {
    name: item.name,
    code: item.code || "",
  };

  setForm(p => ({
    ...p,
    운송사명: selected.name,
    운송사코드: selected.code,
  }));

  // 🔥 고정 상태면 업데이트
  if (fixedTransport) {
    setFixedTransport(selected);
    localStorage.setItem("fixedTransport", JSON.stringify(selected));
  }
}
  setShowDropdown(null);
};

useEffect(() => {
  const currentRef =
    showDropdown === "상차지명" ? listRefTop : listRefBottom;

  if (currentRef.current && activeIndex >= 0) {
    const el = currentRef.current.children[activeIndex];
    el?.scrollIntoView({ block: "nearest" });
  }
}, [activeIndex, showDropdown]);

if (loading) {
    return <div className="py-20 text-center text-gray-400">불러오는 중…</div>;
  }

return (
  <div className="flex gap-6 w-full max-w-[1400px]">
    {/* ================= 왼쪽: 오더 입력 ================= */}
<div className="flex-1 bg-white rounded-2xl border shadow-sm p-8">
    {/* ================= 상단 바 ================= */}
<div className="flex justify-between items-center mb-6">
  <h2 className="text-xl font-bold">
    {editId ? "오더 수정" : "일반배차 등록"}
  </h2>

<button
  onClick={() => {
    if (confirm("입력값을 모두 초기화하시겠습니까?")) {
      resetForm();
    }
  }}
  className="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg"
>
  초기화
</button>
</div>
{/* ================= 운송의뢰사 ================= */}
<section className="mb-9">
  <h3 className="text-sm font-bold text-gray-700 mb-3">운송의뢰사</h3>

  <div className="bg-gray-50 p-4 rounded-xl space-y-3">

    {/* ================= 운송사명 ================= */}
    <div className="relative">
      <div className="text-sm font-semibold text-gray-700 mb-1">
        운송사명
      </div>

<input
  disabled={!!fixedTransport}
  value={form.운송사명 || ""}
        onChange={(e) => {
          onChange("운송사명", e.target.value);
          searchTransport(e.target.value); // 🔥 자동완성 연결
        }}
        onFocus={() => setShowDropdown("운송사명")}
        onBlur={() => setTimeout(() => setShowDropdown(null), 150)}
        className="w-full border rounded-lg px-4 py-3 text-sm bg-white text-gray-800 focus:ring-2 focus:ring-blue-500"
        placeholder="운송사명 입력"
      />

      {/* 🔥 드롭다운 */}
      {showDropdown === "운송사명" && suggestions.length > 0 && (
        <div className="absolute z-50 bg-white border rounded-lg w-full mt-1 max-h-60 overflow-y-auto shadow">
          {suggestions.map((item, idx) => (
            <div
              key={idx}
              className={`px-3 py-2 text-sm cursor-pointer ${
                idx === activeIndex ? "bg-blue-100" : ""
              }`}
              onMouseDown={() => selectSuggestion(item, "운송사명")}
            >
              {item.name}
            </div>
          ))}
        </div>
      )}
    </div>

    {/* ================= 운송사코드 ================= */}
    <div>
      <div className="text-sm font-semibold text-gray-700 mb-1">
        운송사코드
      </div>

      <input
        value={form.운송사코드 || ""}
        
        readOnly // 🔥 자동 입력이라 수정 못하게 막는게 좋음
        className="w-full border rounded-lg px-4 py-3 text-sm bg-gray-100 text-gray-800 font-medium"
        placeholder="자동 입력"
      />
    </div>
<div className="flex items-center gap-2 mt-2">
  <input
    type="checkbox"
    checked={!!fixedTransport}
    onChange={(e) => {
      if (e.target.checked) {
        if (!form.운송사명) {
          alert("운송사를 먼저 선택하세요");
          return;
        }

        const data = {
          name: form.운송사명,
          code: form.운송사코드,
        };

        setFixedTransport(data);
        localStorage.setItem("fixedTransport", JSON.stringify(data));
      } else {
        setFixedTransport(null);
        localStorage.removeItem("fixedTransport");
      }
    }}
  />

  <span className="text-sm text-gray-600">
    운송사 고정
  </span>
</div>
  </div>
</section>
              {/* ================= 거래처 정보 ================= */}
      <section className="mb-8">
        <h3 className="text-sm font-bold text-gray-700 mb-3">거래처 정보</h3>

        <div className="bg-gray-50 p-4 rounded-xl space-y-3">
          <div>
            <div className="text-xs text-gray-500 mb-1">거래처명</div>
            <input
              value={company}
              disabled
              className="w-full border rounded-lg p-3 bg-gray-100 text-gray-700 font-semibold"
            />
          </div>

          {/* 🔥 수정모드일 때만 상태 / 운임 표시 */}
          {editId && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">배차상태</div>
                <div className="p-3 bg-white border rounded-lg font-semibold text-gray-800">
                  {form.status || "요청"}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">청구운임</div>
                <div className="p-3 bg-white border rounded-lg font-semibold text-gray-800">
                  {form.청구운임
                    ? `${Number(form.청구운임).toLocaleString()}원`
                    : "-"}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ================= 운송 일정 ================= */}
      <section className="mb-8">
        <h3 className="text-sm font-bold text-gray-700 mb-3">운송 일정</h3>

        <div className="bg-gray-50 p-4 rounded-xl space-y-4">
          {/* 상차 */}
          <div className="grid grid-cols-6 gap-2 items-center">
            <span className="text-sm text-gray-600">상차</span>
            <input
              type="date"
              className="input col-span-2"
              value={form.상차일}
              onChange={(e) => onChange("상차일", e.target.value)}
            />
            <select
              className="input"
              value={form.상차시간}
              onChange={(e) => onChange("상차시간", e.target.value)}
            >
              {timeOptions.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="flex gap-1 col-span-2">
              <button
                type="button"
                className={`px-3 py-1 rounded border ${
                  form.상차일 === getDate(0)
                    ? "bg-blue-600 text-white"
                    : "bg-white"
                }`}
                onClick={() => onChange("상차일", getDate(0))}
              >
                당일
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded border ${
                  form.상차일 === getDate(1)
                    ? "bg-blue-600 text-white"
                    : "bg-white"
                }`}
                onClick={() => onChange("상차일", getDate(1))}
              >
                내일
              </button>
            </div>
          </div>

          {/* 하차 */}
          <div className="grid grid-cols-6 gap-2 items-center">
            <span className="text-sm text-gray-600">하차</span>
            <input
              type="date"
              className="input col-span-2"
              value={form.하차일}
              onChange={(e) => onChange("하차일", e.target.value)}
            />
            <select
              className="input"
              value={form.하차시간}
              onChange={(e) => onChange("하차시간", e.target.value)}
            >
              {timeOptions.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="flex gap-1 col-span-2">
              <button
                type="button"
                className={`px-3 py-1 rounded border ${
                  form.하차일 === getDate(0)
                    ? "bg-blue-600 text-white"
                    : "bg-white"
                }`}
                onClick={() => onChange("하차일", getDate(0))}
              >
                당일
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded border ${
                  form.하차일 === getDate(1)
                    ? "bg-blue-600 text-white"
                    : "bg-white"
                }`}
                onClick={() => onChange("하차일", getDate(1))}
              >
                내일
              </button>
            </div>
          </div>
          
        </div>
      </section>
            <section className="mb-8">
  <h3 className="text-sm font-bold text-gray-700 mb-3">
    상·하차 정보
  </h3>

  <div className="bg-gray-50 p-4 rounded-xl grid grid-cols-3 gap-4">

  {/* ================= 상차 ================= */}
  <div className="space-y-2">
    <div className="text-xs font-bold text-gray-600">상차지 정보</div>

    {/* 상차지명 */}
    <div className="relative">
      <input
        className="input"
        placeholder="상차지명"
        value={form.상차지명}
        onChange={(e) => {
          onChange("상차지명", e.target.value);
          searchPlaces(e.target.value, "상차지명");
        }}
        onKeyDown={(e) => handleKeyDown(e, "상차지명")}
        onFocus={() => setShowDropdown("상차지명")}
        onBlur={() => setTimeout(() => setShowDropdown(null), 150)}
      />

      {showDropdown === "상차지명" && suggestions.length > 0 && (
        <div ref={listRefTop} className="absolute z-50 bg-white border rounded-lg w-full mt-1 max-h-60 overflow-y-auto shadow">
          {suggestions.map((item, idx) => (
            <div
              key={idx}
              className={`px-3 py-2 text-sm cursor-pointer ${idx === activeIndex ? "bg-blue-100" : ""}`}
              onMouseDown={() => selectSuggestion(item, "상차지명")}
            >
              {item.name}
            </div>
          ))}
        </div>
      )}
    </div>

    <input className="input" placeholder="주소" value={form.상차지주소} onChange={(e)=>onChange("상차지주소", e.target.value)} />
    <input className="input" placeholder="담당자명" value={form.상차담당자명} onChange={(e)=>onChange("상차담당자명", e.target.value)} />
    <input className="input" placeholder="담당자번호" value={form.상차담당자번호} onChange={(e)=>onChange("상차담당자번호", e.target.value)} />
    <input className="input" placeholder="메모" value={form.상차메모} onChange={(e)=>onChange("상차메모", e.target.value)} />
  </div>

  {/* ================= 하차 ================= */}
  <div className="space-y-2">
    <div className="text-xs font-bold text-gray-600">하차지 정보</div>

    <div className="relative">
      <input
        className="input"
        placeholder="하차지명"
        value={form.하차지명}
        onChange={(e) => {
          onChange("하차지명", e.target.value);
          searchPlaces(e.target.value, "하차지명");
        }}
        onKeyDown={(e) => handleKeyDown(e, "하차지명")}
        onFocus={() => setShowDropdown("하차지명")}
        onBlur={() => setTimeout(() => setShowDropdown(null), 150)}
      />

      {showDropdown === "하차지명" && suggestions.length > 0 && (
        <div ref={listRefBottom} className="absolute z-50 bg-white border rounded-lg w-full mt-1 max-h-60 overflow-y-auto shadow">
          {suggestions.map((item, idx) => (
            <div
              key={idx}
              className={`px-3 py-2 text-sm cursor-pointer ${idx === activeIndex ? "bg-blue-100" : ""}`}
              onMouseDown={() => selectSuggestion(item, "하차지명")}
            >
              {item.name}
            </div>
          ))}
        </div>
      )}
    </div>

    <input className="input" placeholder="주소" value={form.하차지주소} onChange={(e)=>onChange("하차지주소", e.target.value)} />
    <input className="input" placeholder="담당자명" value={form.하차담당자명} onChange={(e)=>onChange("하차담당자명", e.target.value)} />
    <input className="input" placeholder="담당자번호" value={form.하차담당자번호} onChange={(e)=>onChange("하차담당자번호", e.target.value)} />
    <input className="input" placeholder="메모" value={form.하차메모} onChange={(e)=>onChange("하차메모", e.target.value)} />
  </div>

{/* ================= 화물 정보 ================= */}
<div className="flex flex-col h-full gap-2">
  <div className="text-xs font-bold text-gray-600">화물 정보</div>

  <select
    className="input"
    value={form.차량종류}
    onChange={(e) => onChange("차량종류", e.target.value)}
  >
    <option value="">차량종류</option>
    <option>라보/다마스</option>
    <option>냉장탑</option>
    <option>냉동탑</option>
    <option>냉동윙</option>
    <option>냉장윙</option>
    <option>리프트</option>
    <option>오토바이</option>
    <option>윙바디</option>
    <option>탑차</option>
  </select>

  <input
    className="input"
    placeholder="톤수"
    value={form.차량톤수}
    onChange={(e) => onChange("차량톤수", e.target.value)}
  />

<textarea
  className="input flex-1 resize-none"
  placeholder="화물내용"
    value={form.화물내용}
    onChange={(e) => onChange("화물내용", e.target.value)}
  />
</div>

</div>
</section>
      {/* ================= 상하차방법 / 결제방식 ================= */}
<section className="mb-8">
  <h3 className="text-sm font-bold text-gray-700 mb-3">
    상하차방법 / 결제방식
  </h3>

  <div className="bg-gray-50 p-4 rounded-xl grid grid-cols-2 gap-4">

    {/* ================= 상하차방법 ================= */}
    <div className="space-y-3">
      <div className="text-xs font-bold text-gray-600">상하차방법</div>

      <select
        className="input"
        value={form.상차방법}
        onChange={(e) => onChange("상차방법", e.target.value)}
      >
        <option value="">상차방법</option>
        <option>지게차</option>
        <option>수도움</option>
        <option>수작업</option>
      </select>

      <select
        className="input"
        value={form.하차방법}
        onChange={(e) => onChange("하차방법", e.target.value)}
      >
        <option value="">하차방법</option>
        <option>지게차</option>
        <option>수도움</option>
        <option>수작업</option>
      </select>
    </div>

    {/* ================= 결제방식 ================= */}
    <div className="space-y-3">
      <div className="text-xs font-bold text-gray-600">결제방식</div>

      <select
        className="input"
        value={form.지급방식}
        onChange={(e) => onChange("지급방식", e.target.value)}
      >
        <option value="">지급방식</option>
        <option>계산서</option>
        <option>선불</option>
        <option>착불</option>
      </select>
    </div>

  </div>
</section>
      {/* ================= 버튼 ================= */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => navigate(-1)}
          className="px-6 py-2 rounded bg-gray-200"
        >
          취소
        </button>
        <button
          onClick={submit}
          className="px-6 py-2 rounded bg-blue-600 text-white"
        >
          {editId ? "수정 저장" : "오더 등록"}
        </button>
      </div>
    </div>
    {/* ================= 오른쪽: 오더 불러오기 ================= */}
<div className="w-[420px] bg-white rounded-2xl border shadow-sm p-5">

  <div className="flex justify-between items-center mb-4">
    <h3 className="text-lg font-bold">오더 불러오기</h3>
    <button className="text-gray-400 hover:text-black">✕</button>
  </div>

  <div className="flex gap-2 mb-3">
    <input
  value={keyword}
  onChange={(e) => setKeyword(e.target.value)}
  placeholder="거래처 / 주소 검색"
  className="flex-1 border rounded-lg px-3 py-2 text-sm"
/>

<button
  onClick={handleSearch}
  className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm"
>
  조회
</button>
  </div>

  <div className="space-y-2 max-h-[500px] overflow-y-auto">
  {results.map((item) => (
    <div
      key={item.id}
      className="border rounded-xl p-3 hover:bg-gray-50"
    >
      <div className="font-semibold text-sm">
        {item.상차지명} → {item.하차지명}
      </div>

      <div className="text-xs text-gray-500">
        {item.차량종류} / {item.차량톤수}
      </div>

      <div className="text-xs text-gray-400">
        {item.상차일} {item.상차시간}
      </div>

      <button
        className="mt-2 w-full py-1 text-xs bg-blue-500 text-white rounded"
        onClick={() => applyOrder(item)}
      >
        선택
      </button>
    </div>
  ))}
</div>
</div> 

</div> 

  );
}
