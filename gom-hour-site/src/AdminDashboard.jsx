// ===================== gom-hour-site/src/AdminDashboard.jsx =====================
// GOM_Hour 관리자페이지. Firebase Auth로 로그인한 사용자만 볼 수 있다(App.jsx가
// "/admin/*"을 이 컴포넌트로 연결하고, 여기서 로그인 여부를 다시 확인해 미로그인
// 시 /admin/login으로 돌려보낸다).
//
// 현재 구현된 탭: 공지/가격, 옵션관리, 픽업수량, 주문/매출장부.
// 지출/재고 관리는 다음 단계에서 추가할 예정(ExpenseStubTab 참고).
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  orderBy,
  limit,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import {
  KIND_OPTIONS,
  DEFAULT_PRICES,
  OPTION_CATEGORIES,
  OPTION_TYPES,
  formatWon,
} from "./gomConstants";

export default function AdminDashboard() {
  const [user, setUser] = useState(undefined); // undefined=확인중, null=비로그인
  const [tab, setTab] = useState("notice");
  const nav = useNavigate();

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);
  useEffect(() => {
    if (user === null) nav("/admin/login", { replace: true });
  }, [user, nav]);

  if (user === undefined) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center text-sm text-gray-400">
        불러오는 중...
      </div>
    );
  }
  if (!user) return null;

  const TABS = [
    { id: "notice", label: "공지/가격", Comp: NoticePricingTab },
    { id: "options", label: "옵션관리", Comp: OptionsTab },
    { id: "capacity", label: "픽업수량", Comp: CapacityTab },
    { id: "orders", label: "주문/매출", Comp: OrdersTab },
    { id: "inventory", label: "지출/재고", Comp: InventoryTab },
  ];
  const Active = TABS.find((t) => t.id === tab)?.Comp || NoticePricingTab;

  return (
    <div className="min-h-screen bg-secondary">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-primary">GOM_Hour 관리자</h1>
          <button onClick={() => signOut(auth)} className="text-xs text-gray-400">
            로그아웃
          </button>
        </div>

        {/* PC(md 이상)에서는 좌측 세로 탭 + 넓은 본문, 모바일에서는 위쪽 가로 스크롤 탭 */}
        <div className="md:flex md:items-start md:gap-6">
          <div className="flex gap-2 mb-4 overflow-x-auto md:flex-col md:w-44 md:mb-0 md:shrink-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border md:w-full md:text-left md:rounded-xl md:py-2 ${
                  tab === t.id ? "bg-primary text-white border-primary" : "border-line text-gray-600"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="bg-white border border-line rounded-2xl p-4 md:flex-1 md:min-w-0">
            <Active />
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── 공지사항 / 종류별 가격 ─────────────────────────
function NoticePricingTab() {
  const [notice, setNotice] = useState("");
  const [prices, setPrices] = useState(DEFAULT_PRICES);
  const [savingNotice, setSavingNotice] = useState(false);
  const [savingPrices, setSavingPrices] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(
    () =>
      onSnapshot(doc(db, "gomSettings", "notice"), (snap) =>
        setNotice(snap.exists() ? snap.data().text || "" : "")
      ),
    []
  );
  useEffect(
    () =>
      onSnapshot(doc(db, "gomSettings", "pricing"), (snap) =>
        setPrices(snap.exists() && snap.data().prices ? { ...DEFAULT_PRICES, ...snap.data().prices } : DEFAULT_PRICES)
      ),
    []
  );

  function flash() {
    setSavedMsg("저장되었습니다.");
    setTimeout(() => setSavedMsg(""), 2000);
  }

  async function saveNotice() {
    setSavingNotice(true);
    try {
      await setDoc(doc(db, "gomSettings", "notice"), { text: notice }, { merge: true });
      flash();
    } finally {
      setSavingNotice(false);
    }
  }

  async function savePrices() {
    setSavingPrices(true);
    try {
      await setDoc(doc(db, "gomSettings", "pricing"), { prices }, { merge: true });
      flash();
    } finally {
      setSavingPrices(false);
    }
  }

  return (
    <div className="space-y-6">
      {savedMsg && <p className="text-xs text-emerald-600">{savedMsg}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">공지사항</h2>
        <textarea
          value={notice}
          onChange={(e) => setNotice(e.target.value)}
          rows={4}
          placeholder="주문페이지 상단에 표시할 공지사항 (비워두면 표시 안 됨)"
          className="w-full border border-line rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={saveNotice}
          disabled={savingNotice}
          className="text-xs bg-primary text-white rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {savingNotice ? "저장 중..." : "공지사항 저장"}
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">종류별 가격</h2>
        {KIND_OPTIONS.map((k) => (
          <div key={k.id} className="flex items-center justify-between border border-line rounded-lg px-3 py-2">
            <span className="text-sm">{k.label}</span>
            <input
              type="number"
              value={prices[k.id] ?? 0}
              onChange={(e) => setPrices((p) => ({ ...p, [k.id]: Number(e.target.value) }))}
              className="w-28 border border-line rounded-lg px-2 py-1 text-sm text-right"
            />
          </div>
        ))}
        <button
          onClick={savePrices}
          disabled={savingPrices}
          className="text-xs bg-primary text-white rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {savingPrices ? "저장 중..." : "가격 저장"}
        </button>
      </section>
    </div>
  );
}

// ───────────────────────── 추가 선택 옵션 관리 ─────────────────────────
function OptionsTab() {
  const [options, setOptions] = useState([]);

  useEffect(
    () =>
      onSnapshot(collection(db, "gomOptions"), (snap) => {
        setOptions(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        );
      }),
    []
  );

  async function handleAdd() {
    await addDoc(collection(db, "gomOptions"), {
      category: "custom",
      label: "새 옵션",
      type: "checkbox",
      price: 0,
      appliesTo: [],
      active: true,
      order: options.length + 1,
    });
  }

  async function handleSave(id, data) {
    await updateDoc(doc(db, "gomOptions", id), data);
  }

  async function handleDelete(id) {
    if (!window.confirm("이 옵션을 삭제할까요?")) return;
    await deleteDoc(doc(db, "gomOptions", id));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">추가 선택 옵션 관리</h2>
        <button onClick={handleAdd} className="text-xs bg-primary text-white rounded-lg px-3 py-1.5">
          + 새 옵션
        </button>
      </div>
      {options.length === 0 && (
        <p className="text-xs text-gray-400">등록된 옵션이 없습니다. (주문페이지엔 기본값이 표시됩니다)</p>
      )}
      {options.map((o) => (
        <OptionRowEditor key={o.id} option={o} onSave={handleSave} onDelete={handleDelete} />
      ))}
    </div>
  );
}

function OptionRowEditor({ option, onSave, onDelete }) {
  const [category, setCategory] = useState(option.category || "custom");
  const [label, setLabel] = useState(option.label || "");
  const [type, setType] = useState(option.type || "checkbox");
  const [price, setPrice] = useState(option.price ?? 0);
  const [appliesTo, setAppliesTo] = useState(option.appliesTo || []);
  const [active, setActive] = useState(option.active !== false);
  const [order, setOrder] = useState(option.order ?? 0);
  const [choices, setChoices] = useState(option.choices || []);
  const [saving, setSaving] = useState(false);

  function toggleKind(kindId) {
    setAppliesTo((prev) => (prev.includes(kindId) ? prev.filter((k) => k !== kindId) : [...prev, kindId]));
  }
  function addChoice() {
    setChoices((prev) => [...prev, { id: `choice-${Date.now()}`, label: "", price: 0 }]);
  }
  function updateChoice(idx, field, value) {
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  }
  function removeChoice(idx) {
    setChoices((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(option.id, {
        category,
        label: label.trim(),
        type,
        price: Number(price) || 0,
        appliesTo,
        active,
        order: Number(order) || 0,
        choices: type === "select" ? choices.map((c) => ({ ...c, price: Number(c.price) || 0 })) : [],
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-line rounded-xl p-3 space-y-2 bg-white">
      <div className="flex gap-2 items-center">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-line rounded-lg px-2 py-1 text-xs">
          {OPTION_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className="border border-line rounded-lg px-2 py-1 text-xs">
          {OPTION_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs ml-auto">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> 노출
        </label>
      </div>

      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="옵션 이름"
        className="w-full border border-line rounded-lg px-2 py-1 text-sm"
      />

      <div className="flex gap-2 items-center">
        <span className="text-xs text-gray-500">가격</span>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="border border-line rounded-lg px-2 py-1 text-sm w-28"
        />
        <span className="text-xs text-gray-500 ml-3">순서</span>
        <input
          type="number"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          className="border border-line rounded-lg px-2 py-1 text-sm w-16"
        />
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-1">노출 조건 (선택 안 하면 모든 종류에서 표시)</p>
        <div className="flex flex-wrap gap-2">
          {KIND_OPTIONS.map((k) => (
            <button
              type="button"
              key={k.id}
              onClick={() => toggleKind(k.id)}
              className={`px-2 py-1 rounded-full border text-xs ${
                appliesTo.includes(k.id) ? "border-primary bg-primary/5 font-semibold" : "border-line"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {type === "select" && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500">선택지</p>
          {choices.map((c, idx) => (
            <div key={c.id} className="flex gap-2">
              <input
                value={c.label}
                onChange={(e) => updateChoice(idx, "label", e.target.value)}
                placeholder="선택지 이름"
                className="flex-1 border border-line rounded-lg px-2 py-1 text-xs"
              />
              <input
                type="number"
                value={c.price}
                onChange={(e) => updateChoice(idx, "price", e.target.value)}
                className="w-20 border border-line rounded-lg px-2 py-1 text-xs"
              />
              <button type="button" onClick={() => removeChoice(idx)} className="text-xs text-red-500">
                삭제
              </button>
            </div>
          ))}
          <button type="button" onClick={addChoice} className="text-xs text-primary">
            + 선택지 추가
          </button>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={() => onDelete(option.id)} className="text-xs text-red-500 px-3 py-1">
          삭제
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="text-xs bg-primary text-white rounded-lg px-3 py-1 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── 픽업일자별 주문 가능 수량 ─────────────────────────
function CapacityTab() {
  const [rows, setRows] = useState([]);
  const [newDate, setNewDate] = useState("");
  const [newMax, setNewMax] = useState("");

  useEffect(
    () =>
      onSnapshot(collection(db, "gomPickupCapacity"), (snap) => {
        setRows(snap.docs.map((d) => ({ date: d.id, ...d.data() })).sort((a, b) => a.date.localeCompare(b.date)));
      }),
    []
  );

  async function upsert(date, max) {
    if (!date) return;
    await setDoc(doc(db, "gomPickupCapacity", date), { maxCount: max === "" ? null : Number(max) }, { merge: true });
  }

  async function handleAddNew() {
    await upsert(newDate, newMax);
    setNewDate("");
    setNewMax("");
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-700">픽업일자별 주문 가능 수량</h2>
      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">날짜</label>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="border border-line rounded-lg px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">최대 수량</label>
          <input
            type="number"
            value={newMax}
            onChange={(e) => setNewMax(e.target.value)}
            placeholder="제한없음"
            className="w-28 border border-line rounded-lg px-2 py-1.5 text-sm"
          />
        </div>
        <button onClick={handleAddNew} className="text-xs bg-primary text-white rounded-lg px-4 py-2">
          설정
        </button>
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <p className="text-xs text-gray-400">설정된 날짜가 없습니다.</p>}
        {rows.map((r) => (
          <div key={r.date} className="flex items-center justify-between gap-2 border border-line rounded-lg px-3 py-2 text-sm flex-wrap">
            <span className="font-medium">{r.date}</span>
            <span className="text-gray-500 text-xs">
              주문 {r.currentCount || 0}건 / {r.maxCount == null ? "제한없음" : `최대 ${r.maxCount}건`}
            </span>
            <input
              type="number"
              defaultValue={r.maxCount ?? ""}
              placeholder="제한없음"
              onBlur={(e) => upsert(r.date, e.target.value)}
              className="w-24 border border-line rounded-lg px-2 py-1 text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── 주문목록 / 매출장부 ─────────────────────────
function OrdersTab() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "gomOrders"), orderBy("createdAt", "desc"), limit(300));
    return onSnapshot(q, (snap) => setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, []);

  const totalRevenue = orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
  const pickedUpCount = orders.filter((o) => o.pickedUp).length;

  async function togglePickedUp(o) {
    await updateDoc(doc(db, "gomOrders", o.id), { pickedUp: !o.pickedUp });
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">주문목록 · 매출장부</h2>
      <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
        <span>전체 {orders.length}건</span>
        <span>수령완료 {pickedUpCount}건</span>
        <span className="font-semibold text-primary">총 매출 {formatWon(totalRevenue)}</span>
      </div>
      <div className="space-y-2">
        {orders.map((o) => (
          <div key={o.id} className="border border-line rounded-xl p-3 text-sm bg-white">
            <div className="flex justify-between">
              <span className="font-semibold">
                {o.name} · {o.phone}
              </span>
              <span className="text-primary font-semibold">{formatWon(o.totalPrice)}</span>
            </div>
            <div className="text-xs text-gray-500">
              {o.pickupDate} {o.pickupTime} · {o.kindLabel}
            </div>
            {o.options?.length > 0 && (
              <ul className="text-xs text-gray-500 list-disc list-inside mt-1">
                {o.options.map((op, i) => (
                  <li key={i}>
                    {op.label} (+{formatWon(op.price)})
                  </li>
                ))}
              </ul>
            )}
            <label className="flex items-center gap-2 text-xs mt-2">
              <input type="checkbox" checked={!!o.pickedUp} onChange={() => togglePickedUp(o)} />
              제품 수령 완료
            </label>
          </div>
        ))}
        {orders.length === 0 && <p className="text-xs text-gray-400">아직 주문이 없습니다.</p>}
      </div>
    </div>
  );
}

// ───────────────────────── 지출/재고 관리 ─────────────────────────
// 재료(gomMaterials) 마스터를 만들고, 레시피(gomRecipes)로 "이 종류/옵션을
// 고르면 이 재료를 몇 개 쓴다"를 연결해두면, 주문페이지(OrderPage.jsx →
// inventoryUtil.js)가 주문이 들어올 때마다 자동으로 재고를 차감한다.
// 지출을 기록하면(입고) 그 수량만큼 재고가 자동으로 늘어난다.
function InventoryTab() {
  const [materials, setMaterials] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [options, setOptions] = useState([]);
  const [section, setSection] = useState("materials"); // materials | recipes | expenses

  useEffect(
    () => onSnapshot(collection(db, "gomMaterials"), (snap) => setMaterials(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
    []
  );
  useEffect(
    () => onSnapshot(collection(db, "gomRecipes"), (snap) => setRecipes(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
    []
  );
  useEffect(
    () => onSnapshot(collection(db, "gomOptions"), (snap) => setOptions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
    []
  );

  // 레시피에서 고를 수 있는 대상(종류 / 옵션 / 옵션의 선택지) 전체 목록
  const targetChoices = [
    ...KIND_OPTIONS.map((k) => ({ id: k.id, label: `[종류] ${k.label}` })),
    ...options.map((o) => ({ id: o.id, label: `[옵션] ${o.label}` })),
    ...options.flatMap((o) => (o.choices || []).map((c) => ({ id: c.id, label: `[옵션 선택지] ${o.label} - ${c.label}` }))),
  ];

  const SECTIONS = [
    { id: "materials", label: "재료" },
    { id: "recipes", label: "레시피" },
    { id: "expenses", label: "지출" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`px-3 py-1 rounded-full text-xs border ${
              section === s.id ? "bg-primary text-white border-primary" : "border-line text-gray-600"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "materials" && <MaterialsSection materials={materials} />}
      {section === "recipes" && <RecipesSection recipes={recipes} materials={materials} targetChoices={targetChoices} />}
      {section === "expenses" && <ExpensesSection materials={materials} />}
    </div>
  );
}

function MaterialsSection({ materials }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [stock, setStock] = useState("");

  async function handleAdd() {
    if (!name.trim()) return;
    await addDoc(collection(db, "gomMaterials"), { name: name.trim(), unit: unit.trim(), stock: Number(stock) || 0 });
    setName("");
    setUnit("");
    setStock("");
  }

  async function handleDelete(id) {
    if (!window.confirm("이 재료를 삭제할까요? (연결된 레시피는 남아있으니 함께 정리해주세요)")) return;
    await deleteDoc(doc(db, "gomMaterials", id));
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">재료명</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="border border-line rounded-lg px-2 py-1.5 text-sm" placeholder="예: 크림치즈" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">단위</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} className="w-20 border border-line rounded-lg px-2 py-1.5 text-sm" placeholder="개/g" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">초기 재고</label>
          <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="w-24 border border-line rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <button onClick={handleAdd} className="text-xs bg-primary text-white rounded-lg px-4 py-2">
          + 재료 추가
        </button>
      </div>

      <div className="space-y-2">
        {materials.length === 0 && <p className="text-xs text-gray-400">등록된 재료가 없습니다.</p>}
        {materials.map((m) => (
          <MaterialRow key={m.id} material={m} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}

function MaterialRow({ material, onDelete }) {
  const [stock, setStock] = useState(material.stock ?? 0);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateDoc(doc(db, "gomMaterials", material.id), { stock: Number(stock) || 0 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 border border-line rounded-lg px-3 py-2 text-sm flex-wrap">
      <span className="font-medium">
        {material.name} <span className="text-xs text-gray-400">({material.unit || "단위없음"})</span>
      </span>
      <div className="flex items-center gap-2">
        <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="w-24 border border-line rounded-lg px-2 py-1 text-xs text-right" />
        <button onClick={handleSave} disabled={saving} className="text-xs bg-primary text-white rounded-lg px-3 py-1 disabled:opacity-50">
          {saving ? "저장 중..." : "재고 수정"}
        </button>
        <button onClick={() => onDelete(material.id)} className="text-xs text-red-500">
          삭제
        </button>
      </div>
    </div>
  );
}

function RecipesSection({ recipes, materials, targetChoices }) {
  async function handleAdd() {
    if (targetChoices.length === 0 || materials.length === 0) {
      return window.alert("먼저 종류/옵션과 재료가 하나 이상 있어야 레시피를 만들 수 있어요.");
    }
    await addDoc(collection(db, "gomRecipes"), {
      targetId: targetChoices[0].id,
      materialId: materials[0].id,
      qtyPerUnit: 1,
    });
  }

  async function handleDelete(id) {
    await deleteDoc(doc(db, "gomRecipes", id));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">종류/옵션을 고르면 재료가 얼마나 소모되는지 연결합니다.</p>
        <button onClick={handleAdd} className="text-xs bg-primary text-white rounded-lg px-3 py-1.5">
          + 레시피 추가
        </button>
      </div>
      {recipes.length === 0 && <p className="text-xs text-gray-400">등록된 레시피가 없습니다. (재고는 자동 차감되지 않습니다)</p>}
      {recipes.map((r) => (
        <RecipeRow key={r.id} recipe={r} materials={materials} targetChoices={targetChoices} onDelete={handleDelete} />
      ))}
    </div>
  );
}

function RecipeRow({ recipe, materials, targetChoices, onDelete }) {
  const [targetId, setTargetId] = useState(recipe.targetId);
  const [materialId, setMaterialId] = useState(recipe.materialId);
  const [qtyPerUnit, setQtyPerUnit] = useState(recipe.qtyPerUnit ?? 1);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateDoc(doc(db, "gomRecipes", recipe.id), { targetId, materialId, qtyPerUnit: Number(qtyPerUnit) || 0 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-line rounded-xl p-3 space-y-2 bg-white">
      <div className="flex gap-2 flex-wrap">
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="border border-line rounded-lg px-2 py-1 text-xs flex-1 min-w-[140px]">
          {targetChoices.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="border border-line rounded-lg px-2 py-1 text-xs">
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={qtyPerUnit}
          onChange={(e) => setQtyPerUnit(e.target.value)}
          className="w-20 border border-line rounded-lg px-2 py-1 text-xs"
          title="1회 선택 시 소모량"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => onDelete(recipe.id)} className="text-xs text-red-500 px-3 py-1">
          삭제
        </button>
        <button onClick={handleSave} disabled={saving} className="text-xs bg-primary text-white rounded-lg px-3 py-1 disabled:opacity-50">
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

function ExpensesSection({ materials }) {
  const [expenses, setExpenses] = useState([]);
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "gomExpenses"), orderBy("createdAt", "desc"), limit(200));
    return onSnapshot(q, (snap) => setExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, []);

  const totalSpent = expenses.reduce((sum, e) => sum + (e.totalCost || 0), 0);

  async function handleAdd() {
    const material = materials.find((m) => m.id === materialId);
    if (!material) return window.alert("재료를 먼저 선택해주세요.");
    const qtyNum = Number(qty) || 0;
    const unitCostNum = Number(unitCost) || 0;
    if (qtyNum <= 0) return window.alert("수량을 입력해주세요.");

    setSaving(true);
    try {
      await addDoc(collection(db, "gomExpenses"), {
        materialId,
        materialName: material.name,
        qty: qtyNum,
        unitCost: unitCostNum,
        totalCost: qtyNum * unitCostNum,
        memo: memo.trim(),
        createdAt: serverTimestamp(),
      });
      // 지출(입고) 등록 시 그 수량만큼 재고 자동 증가
      await setDoc(doc(db, "gomMaterials", materialId), { stock: increment(qtyNum) }, { merge: true });

      setQty("");
      setUnitCost("");
      setMemo("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">재료</label>
          <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="border border-line rounded-lg px-2 py-1.5 text-sm">
            <option value="">선택</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">입고 수량</label>
          <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="w-24 border border-line rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">개당 단가</label>
          <input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className="w-24 border border-line rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="block text-xs text-gray-500 mb-1">메모</label>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} className="w-full border border-line rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <button onClick={handleAdd} disabled={saving} className="text-xs bg-primary text-white rounded-lg px-4 py-2 disabled:opacity-50">
          {saving ? "저장 중..." : "지출 등록"}
        </button>
      </div>

      <p className="text-xs font-semibold text-primary">누적 지출 {formatWon(totalSpent)}</p>

      <div className="space-y-2">
        {expenses.length === 0 && <p className="text-xs text-gray-400">등록된 지출이 없습니다.</p>}
        {expenses.map((e) => (
          <div key={e.id} className="border border-line rounded-lg px-3 py-2 text-xs bg-white flex justify-between flex-wrap gap-1">
            <span>
              {e.materialName} {e.qty}개 × {formatWon(e.unitCost)}
              {e.memo ? ` · ${e.memo}` : ""}
            </span>
            <span className="font-semibold text-primary">{formatWon(e.totalCost)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
