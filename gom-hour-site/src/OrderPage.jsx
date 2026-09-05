// ======================= gom-hour-site/src/OrderPage.jsx =======================
// GOM_Hour 주문페이지 — 링크로 들어오면 바로 보이는 고객용 주문서.
// - 종류(gomOptions/kind) 선택에 따라 추가 옵션이 동적으로 보이거나 숨겨진다.
// - 추가 옵션 목록(gomOptions)·가격(gomSettings/pricing)은 Firestore에서
//   실시간으로 읽어온다. 관리자페이지가 아직 없어도 동작하도록, 컬렉션이
//   비어있으면 gomConstants.js의 기본값을 그대로 보여준다.
// - 픽업일자별 주문 수량(gomPickupCapacity)은 트랜잭션으로 안전하게 1씩 증가시켜,
//   나중에 만들 관리자페이지가 그대로 이 데이터를 읽어 "마감" 여부를 관리할 수 있다.
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  KAKAO_CHANNEL_URL,
  KIND_OPTIONS,
  DEFAULT_PRICES,
  DEFAULT_OPTIONS,
  formatWon,
} from "./gomConstants";

const EMPTY_FORM = { name: "", phone: "", pickupDate: "", pickupTime: "", kind: "" };

export default function OrderPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [optionValues, setOptionValues] = useState({});
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [prices, setPrices] = useState(DEFAULT_PRICES);
  const [notice, setNotice] = useState("");
  const [capacityInfo, setCapacityInfo] = useState(null); // { maxCount, currentCount } | null
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // 추가 옵션 목록 실시간 구독 (관리자가 추가/삭제/수정하면 바로 반영됨)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "gomOptions"), (snap) => {
      if (snap.empty) {
        setOptions(DEFAULT_OPTIONS);
        return;
      }
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((o) => o.active !== false)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setOptions(list);
    });
    return unsub;
  }, []);

  // 종류별 가격 실시간 구독
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "gomSettings", "pricing"), (snap) => {
      if (snap.exists() && snap.data().prices) {
        setPrices({ ...DEFAULT_PRICES, ...snap.data().prices });
      } else {
        setPrices(DEFAULT_PRICES);
      }
    });
    return unsub;
  }, []);

  // 공지사항 실시간 구독
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "gomSettings", "notice"), (snap) => {
      setNotice(snap.exists() ? snap.data().text || "" : "");
    });
    return unsub;
  }, []);

  // 선택한 픽업일자의 마감 정보 실시간 구독
  useEffect(() => {
    if (!form.pickupDate) {
      setCapacityInfo(null);
      return;
    }
    const unsub = onSnapshot(doc(db, "gomPickupCapacity", form.pickupDate), (snap) => {
      setCapacityInfo(snap.exists() ? snap.data() : null);
    });
    return unsub;
  }, [form.pickupDate]);

  // 옵션 목록이 바뀌면(최초 로딩 포함) 아직 값이 없는 옵션에 기본값을 채워준다.
  useEffect(() => {
    setOptionValues((prev) => {
      const next = { ...prev };
      options.forEach((o) => {
        if (next[o.id] !== undefined) return;
        if (o.type === "checkbox_qty") next[o.id] = 0;
        else if (o.type === "checkbox") next[o.id] = false;
        else if (o.type === "select") next[o.id] = o.choices?.[0]?.id ?? "";
        else next[o.id] = "";
      });
      return next;
    });
  }, [options]);

  const isDateFull =
    !!capacityInfo &&
    capacityInfo.maxCount != null &&
    (capacityInfo.currentCount || 0) >= capacityInfo.maxCount;

  // 지금 선택된 종류(box-2 / box-4 / bouquet-5 / bouquet-7)에서만 보여줄 옵션들
  const visibleOptions = useMemo(
    () =>
      options.filter(
        (o) => !o.appliesTo || o.appliesTo.length === 0 || o.appliesTo.includes(form.kind)
      ),
    [options, form.kind]
  );

  function optionPrice(o, value) {
    if (o.type === "checkbox") return value ? o.price || 0 : 0;
    if (o.type === "checkbox_qty") return (value || 0) * (o.price || 0);
    if (o.type === "select") {
      const choice = o.choices?.find((c) => c.id === value);
      return choice?.price || 0;
    }
    if (o.type === "text") return value && value.trim() ? o.price || 0 : 0;
    return 0;
  }

  const basePrice = form.kind ? prices[form.kind] || 0 : 0;
  const optionsTotal = visibleOptions.reduce(
    (sum, o) => sum + optionPrice(o, optionValues[o.id]),
    0
  );
  const totalPrice = basePrice + optionsTotal;

  function updateOptionValue(id, value) {
    setOptionValues((prev) => ({ ...prev, [id]: value }));
  }

  // 옵션 요약 — 관리자가 주문목록에서 바로 알아볼 수 있도록 라벨/가격을 문자열로 정리
  function buildSelectedOptionsSummary() {
    const summary = [];
    visibleOptions.forEach((o) => {
      const value = optionValues[o.id];
      if (o.type === "checkbox" && value) {
        summary.push({ category: o.category, label: o.label, price: o.price || 0 });
      } else if (o.type === "checkbox_qty" && value > 0) {
        summary.push({
          category: o.category,
          label: `${o.label} x${value}`,
          price: (o.price || 0) * value,
          qty: value,
        });
      } else if (o.type === "select" && value) {
        const choice = o.choices?.find((c) => c.id === value);
        if (choice) {
          summary.push({
            category: o.category,
            label: `${o.label}: ${choice.label}`,
            price: choice.price || 0,
          });
        }
      } else if (o.type === "text" && value && value.trim()) {
        summary.push({ category: o.category, label: `${o.label}: ${value.trim()}`, price: o.price || 0 });
      }
    });
    return summary;
  }

  // 픽업일자의 주문 수량을 트랜잭션으로 1 증가시킨다. maxCount가 설정돼 있고
  // 이미 다 찼으면 CAPACITY_FULL 에러를 던져 제출을 막는다.
  async function reserveCapacity(date) {
    const ref = doc(db, "gomPickupCapacity", date);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists() ? snap.data() : { maxCount: null, currentCount: 0 };
      const max = data.maxCount ?? null;
      const current = data.currentCount || 0;
      if (max != null && current >= max) {
        throw new Error("CAPACITY_FULL");
      }
      tx.set(ref, { maxCount: max, currentCount: current + 1 }, { merge: true });
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.name.trim()) return setError("이름을 입력해주세요.");
    if (!form.phone.trim()) return setError("연락처를 입력해주세요.");
    if (!form.pickupDate) return setError("픽업일을 선택해주세요.");
    if (!form.pickupTime) return setError("픽업 시간을 선택해주세요.");
    if (!form.kind) return setError("종류를 선택해주세요.");
    if (isDateFull) return setError("선택하신 날짜는 주문이 마감되었습니다. 다른 날짜를 선택해주세요.");

    setSubmitting(true);
    try {
      await reserveCapacity(form.pickupDate);

      const kindInfo = KIND_OPTIONS.find((k) => k.id === form.kind);
      await addDoc(collection(db, "gomOrders"), {
        name: form.name.trim(),
        phone: form.phone.trim(),
        pickupDate: form.pickupDate,
        pickupTime: form.pickupTime,
        kind: form.kind,
        kindLabel: kindInfo?.label || form.kind,
        basePrice,
        options: buildSelectedOptionsSummary(),
        totalPrice,
        status: "접수",
        pickedUp: false,
        createdAt: serverTimestamp(),
      });

      setSubmitted(true);
    } catch (err) {
      if (err.message === "CAPACITY_FULL") {
        setError("선택하신 날짜는 주문이 마감되었습니다. 다른 날짜를 선택해주세요.");
      } else {
        setError("주문 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleNewOrder() {
    setForm(EMPTY_FORM);
    setOptionValues({});
    setSubmitted(false);
    setError("");
  }

  return (
    <div className="min-h-screen bg-secondary flex justify-center py-8 px-4">
      <div className="w-full max-w-md">
        <Header />

        {notice && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 mb-4 whitespace-pre-wrap">
            {notice}
          </div>
        )}

        {submitted ? (
          <SuccessCard totalPrice={totalPrice} onNewOrder={handleNewOrder} />
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-5 space-y-6">
            <BasicInfoSection form={form} setForm={setForm} />
            <KindSection form={form} setForm={setForm} prices={prices} isDateFull={isDateFull} capacityInfo={capacityInfo} />
            {form.kind && (
              <OptionsSection
                visibleOptions={visibleOptions}
                optionValues={optionValues}
                updateOptionValue={updateOptionValue}
              />
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="border-t pt-4 flex items-center justify-between">
              <span className="text-sm text-gray-500">예상 금액</span>
              <span className="text-xl font-bold text-primary">{formatWon(totalPrice)}</span>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary text-white rounded-xl py-3 font-semibold disabled:opacity-50"
            >
              {submitting ? "접수 중..." : "주문하기"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-col items-center text-center mb-6">
      <img src="/logo.jpg" alt="GOM_Hour" className="w-24 h-24 object-contain rounded-full mb-2" />
      <h1 className="text-lg font-bold text-primary">GOM_Hour</h1>
      <p className="text-xs text-gray-500 mb-3">Glass Of Memories, Hours of Us</p>
      <a
        href={KAKAO_CHANNEL_URL}
        target="_blank"
        rel="noreferrer"
        className="text-sm bg-[#FEE500] text-[#3C1E1E] font-medium rounded-full px-4 py-2"
      >
        💬 카카오톡 문의 바로가기
      </a>
    </div>
  );
}

function BasicInfoSection({ form, setForm }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">기본 주문 정보</h2>
      <div>
        <label className="block text-xs text-gray-500 mb-1">이름</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="w-full border rounded-lg px-3 py-2 text-sm"
          placeholder="주문자 성함"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">연락처</label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className="w-full border rounded-lg px-3 py-2 text-sm"
          placeholder="010-0000-0000"
        />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">픽업일</label>
          <input
            type="date"
            value={form.pickupDate}
            onChange={(e) => setForm((f) => ({ ...f, pickupDate: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">픽업 시간</label>
          <input
            type="time"
            value={form.pickupTime}
            onChange={(e) => setForm((f) => ({ ...f, pickupTime: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

function KindSection({ form, setForm, prices, isDateFull, capacityInfo }) {
  const groups = [
    { id: "box", label: "박스형" },
    { id: "bouquet", label: "부케형" },
  ];
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">종류 선택</h2>
      {form.pickupDate && isDateFull && (
        <p className="text-xs text-red-500">
          선택하신 날짜({form.pickupDate})는 주문이 마감되었습니다. 다른 날짜를 선택해주세요.
        </p>
      )}
      {form.pickupDate && !isDateFull && capacityInfo?.maxCount != null && (
        <p className="text-xs text-gray-400">
          잔여 {Math.max(capacityInfo.maxCount - (capacityInfo.currentCount || 0), 0)}건
        </p>
      )}
      {groups.map((g) => (
        <div key={g.id}>
          <p className="text-xs text-gray-500 mb-1">{g.label}</p>
          <div className="grid grid-cols-2 gap-2">
            {KIND_OPTIONS.filter((k) => k.group === g.id).map((k) => (
              <button
                type="button"
                key={k.id}
                onClick={() => setForm((f) => ({ ...f, kind: k.id }))}
                className={`rounded-xl border px-3 py-3 text-sm text-left ${
                  form.kind === k.id ? "border-primary bg-primary/5 font-semibold" : "border-gray-200"
                }`}
              >
                <div>{k.label}</div>
                <div className="text-xs text-gray-500">{formatWon(prices[k.id] || 0)}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function OptionsSection({ visibleOptions, optionValues, updateOptionValue }) {
  if (visibleOptions.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">추가 선택 옵션</h2>
      {visibleOptions.map((o) => (
        <OptionRow key={o.id} option={o} value={optionValues[o.id]} onChange={(v) => updateOptionValue(o.id, v)} />
      ))}
    </div>
  );
}

function OptionRow({ option, value, onChange }) {
  if (option.type === "checkbox") {
    return (
      <label className="flex items-center justify-between border rounded-xl px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {option.label}
        </span>
        <span className="text-gray-500">+{formatWon(option.price)}</span>
      </label>
    );
  }

  if (option.type === "checkbox_qty") {
    const checked = (value || 0) > 0;
    return (
      <div className="flex items-center justify-between border rounded-xl px-3 py-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked ? 1 : 0)}
          />
          {option.label}
        </label>
        <div className="flex items-center gap-2">
          {checked && (
            <>
              <button type="button" onClick={() => onChange(Math.max(1, (value || 1) - 1))} className="w-6 h-6 border rounded">
                -
              </button>
              <span>{value}</span>
              <button type="button" onClick={() => onChange((value || 0) + 1)} className="w-6 h-6 border rounded">
                +
              </button>
            </>
          )}
          <span className="text-gray-500 w-16 text-right">+{formatWon(option.price * (value || 0))}</span>
        </div>
      </div>
    );
  }

  if (option.type === "select") {
    return (
      <div className="border rounded-xl px-3 py-2 text-sm">
        <p className="mb-1">{option.label}</p>
        <div className="flex flex-wrap gap-2">
          {option.choices?.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => onChange(c.id)}
              className={`px-3 py-1 rounded-full border text-xs ${
                value === c.id ? "border-primary bg-primary/5 font-semibold" : "border-gray-200"
              }`}
            >
              {c.label}
              {c.price > 0 ? ` (+${formatWon(c.price)})` : ""}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (option.type === "text") {
    return (
      <div className="border rounded-xl px-3 py-2 text-sm">
        <div className="flex items-center justify-between mb-1">
          <span>{option.label}</span>
          <span className="text-gray-500">+{formatWon(option.price)}</span>
        </div>
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="원하시는 문구를 입력해주세요"
          className="w-full border rounded-lg px-2 py-1 text-sm"
        />
      </div>
    );
  }

  return null;
}

function SuccessCard({ totalPrice, onNewOrder }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 text-center space-y-4">
      <p className="text-2xl">🐻</p>
      <h2 className="text-lg font-bold text-primary">주문이 접수되었습니다</h2>
      <p className="text-sm text-gray-500">예상 금액 {formatWon(totalPrice)}</p>
      <p className="text-xs text-gray-400">픽업일 안내는 카카오톡 문의로 확인해주세요.</p>
      <button onClick={onNewOrder} className="w-full border border-primary text-primary rounded-xl py-3 font-semibold">
        새 주문 작성하기
      </button>
    </div>
  );
}
