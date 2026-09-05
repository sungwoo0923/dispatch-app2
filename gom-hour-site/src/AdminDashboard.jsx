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
    { id: "expense", label: "지출/재고", Comp: ExpenseStubTab },
  ];
  const Active = TABS.find((t) => t.id === tab)?.Comp || NoticePricingTab;

  return (
    <div className="min-h-screen bg-secondary">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-primary">GOM_Hour 관리자</h1>
          <button onClick={() => signOut(auth)} className="text-xs text-gray-400">
            로그아웃
          </button>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border ${
                tab === t.id ? "bg-primary text-white border-primary" : "border-line text-gray-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-white border border-line rounded-2xl p-4">
          <Active />
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

// ───────────────────────── 지출/재고 관리 (다음 단계) ─────────────────────────
function ExpenseStubTab() {
  return <p className="text-xs text-gray-400">지출/재고 관리 기능은 다음 단계에서 추가될 예정입니다.</p>;
}
