import { useState, useMemo, useEffect } from "react";
// DispatchFormNew.jsx
const VEHICLE_TYPES = [
  "라보/다마스",
  "카고",
  "윙바디",
  "리프트",
  "탑차",
  "냉장탑",
  "냉동탑",
  "냉장윙",
  "냉동윙",
  "오토바이",
  "기타",
];

const LOAD_TYPES = ["지게차", "수작업", "크레인", "직접수작업"];
const PAY_TYPES = ["선불", "후불", "월말정산"];
const DISPATCH_TYPES = ["일반", "긴급", "예약"];

export default function DispatchFormNew({
  form,
  onChange,
  doSave,
  placeRows = [],   // ⭐ 추가
}) {
  // 🔹 상/하차 자동완성 구분용
  const [activePlaceType, setActivePlaceType] = useState(null); // "상차" | "하차"
const [highlightIndex, setHighlightIndex] = useState(-1);
  const lineInput =
    "w-full border-b border-gray-400 px-1 py-2 text-sm text-gray-900 " +
    "placeholder:text-gray-500 " +
    "focus:outline-none focus:border-blue-600 transition bg-transparent";

  const select = lineInput + " cursor-pointer";

// ✅ Firestore 하차지 거래처 기반 자동완성 풀
const placePool = useMemo(() => {
  return (placeRows || []).map((p) => ({
    지명: p.업체명 || "",
    주소: p.주소 || "",
    담당자: p.담당자 || "",
    연락처: p.담당자번호 || "",
  }));
}, [placeRows]);


  // ✅ 기존 로직 그대로
  const selectPlace = (place) => {
    if (activePlaceType === "상차") {
      onChange("상차지명", place.지명);
      onChange("상차지주소", place.주소);
      onChange("상차담당자", place.담당자);
      onChange("상차연락처", place.연락처);
    }

    if (activePlaceType === "하차") {
      onChange("하차지명", place.지명);
      onChange("하차지주소", place.주소);
      onChange("하차담당자", place.담당자);
      onChange("하차연락처", place.연락처);
    }

    setActivePlaceType(null);
  };

  // ✅ 🔥 FIX: “진짜 작동하게 만든 부분”
  const filteredPlaces = useMemo(() => {
  const raw =
    activePlaceType === "상차"
      ? form.상차지명
      : form.하차지명;

  const keyword = (raw || "").trim().toLowerCase();
  if (!keyword) return [];

  return placePool
    .map((p) => {
      const name = (p.지명 || "").toLowerCase();

      let score = 0;
      if (name === keyword) score = 100;          // 🔥 완전일치 최상
      else if (name.startsWith(keyword)) score = 70;
      else if (name.includes(keyword)) score = 40;

      return { ...p, __score: score };
    })
    .filter((p) => p.__score > 0)
    .sort((a, b) => b.__score - a.__score);
}, [form.상차지명, form.하차지명, activePlaceType, placePool]);
// 🔹 외부 클릭 / ESC 시 드롭다운 닫기
useEffect(() => {
  const handler = (e) => {
    if (e.target.closest(".place-autocomplete")) return;
    setActivePlaceType(null);
    setHighlightIndex(-1);
  };

  const keyHandler = (e) => {
    if (e.key === "Escape") {
      setActivePlaceType(null);
      setHighlightIndex(-1);
    }
  };

  document.addEventListener("mousedown", handler);
  document.addEventListener("keydown", keyHandler);

  return () => {
    document.removeEventListener("mousedown", handler);
    document.removeEventListener("keydown", keyHandler);
  };
}, []);

  return (
    <div className="grid grid-cols-[1fr_360px] gap-10">
      {/* ================= LEFT : 입력 ================= */}
      <div className="space-y-12">

        {/* ================= 거래 / 날짜 ================= */}
        <section>
          <h3 className="text-base font-bold mb-6">오더 정보</h3>

          <div className="grid grid-cols-3 gap-8 max-w-[760px]">
            <div>
              <label className="text-xs text-gray-500">거래처명</label>
              <input
                className={lineInput}
                value={form.거래처명 || ""}
                onChange={(e) => onChange("거래처명", e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-gray-500">상차일</label>
              <input
                type="date"
                className={lineInput}
                value={form.상차일 || ""}
                onChange={(e) => onChange("상차일", e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-gray-500">하차일</label>
              <input
                type="date"
                className={lineInput}
                value={form.하차일 || ""}
                onChange={(e) => onChange("하차일", e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* ================= 상/하차 ================= */}
        <section>
          <h3 className="text-base font-bold mb-6">
            상 · 하차 정보 <span className="text-red-500">*</span>
          </h3>
<button
  type="button"
  onClick={() => {
    [
      "상차지명", "상차지주소", "상차담당자", "상차연락처",
      "하차지명", "하차지주소", "하차담당자", "하차연락처",
    ].forEach((k) => onChange(k, ""));
    setActivePlaceType(null);
    setHighlightIndex(-1);
  }}
  className="mb-4 text-xs text-gray-500 hover:text-red-600 underline"
>
  상·하차 정보 전체 초기화
</button>

          <div className="grid grid-cols-2 gap-10 max-w-[760px]">

            {/* ================= 상차 ================= */}
            <div className="space-y-5">
              <div className="relative">
                <input
  className={lineInput}
  placeholder="상차지명"
  value={form.상차지명 || ""}
  onFocus={() => setActivePlaceType("상차")}
  onChange={(e) => {
    const v = e.target.value;
    onChange("상차지명", v);
    setActivePlaceType("상차");

    if (!v.trim()) {
      onChange("상차지주소", "");
      onChange("상차담당자", "");
      onChange("상차연락처", "");
    }
  }}
  onKeyDown={(e) => {
    if (!filteredPlaces.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) =>
        i < filteredPlaces.length - 1 ? i + 1 : 0
      );
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) =>
        i > 0 ? i - 1 : filteredPlaces.length - 1
      );
    }

    if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      selectPlace(filteredPlaces[highlightIndex]);
      setHighlightIndex(-1);
    }
  }}
/>

                {activePlaceType === "상차" && filteredPlaces.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full bg-white border rounded-md shadow">
                    {filteredPlaces.map((p, idx) => (
                      <li
                        key={idx}
                        onMouseDown={() => selectPlace(p)}
                        className={
  "px-3 py-2 text-sm cursor-pointer " +
  (idx === highlightIndex
    ? "bg-blue-100"
    : "hover:bg-blue-50")
}
onMouseEnter={() => setHighlightIndex(idx)}
                      >
                        <div className="font-medium text-gray-900">{p.지명}</div>
                        <div className="text-xs text-gray-500">{p.주소}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <input
                className={lineInput}
                placeholder="상차지 주소"
                value={form.상차지주소 || ""}
                onChange={(e) => onChange("상차지주소", e.target.value)}
              />

              <div className="grid grid-cols-2 gap-4">
                <input
                  className={lineInput}
                  placeholder="상차 담당자"
                  value={form.상차담당자 || ""}
                  onChange={(e) => onChange("상차담당자", e.target.value)}
                />
                <input
                  className={lineInput}
                  placeholder="상차 연락처"
                  value={form.상차연락처 || ""}
                  onChange={(e) => onChange("상차연락처", e.target.value)}
                />
              </div>
            </div>

            {/* ================= 하차 ================= */}
            <div className="space-y-5">
              <div className="relative">
                <input
                  className={lineInput}
                  placeholder="하차지명"
                  value={form.하차지명 || ""}
                  onFocus={() => setActivePlaceType("하차")}
                  onChange={(e) => {
  const v = e.target.value;
  onChange("하차지명", v);
  setActivePlaceType("하차");

  if (!v.trim()) {
    onChange("하차지주소", "");
    onChange("하차담당자", "");
    onChange("하차연락처", "");
  }
}}
                />

                {activePlaceType === "하차" && filteredPlaces.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full bg-white border rounded-md shadow">
                    {filteredPlaces.map((p, idx) => (
                      <li
                        key={idx}
                        onMouseDown={() => selectPlace(p)}
                        className={
  "px-3 py-2 text-sm cursor-pointer " +
  (idx === highlightIndex
    ? "bg-blue-100"
    : "hover:bg-blue-50")
}
onMouseEnter={() => setHighlightIndex(idx)}
                      >
                        <div className="font-medium text-gray-900">{p.지명}</div>
                        <div className="text-xs text-gray-500">{p.주소}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <input
                className={lineInput}
                placeholder="하차지 주소"
                value={form.하차지주소 || ""}
                onChange={(e) => onChange("하차지주소", e.target.value)}
              />

              <div className="grid grid-cols-2 gap-4">
                <input
                  className={lineInput}
                  placeholder="하차 담당자"
                  value={form.하차담당자 || ""}
                  onChange={(e) => onChange("하차담당자", e.target.value)}
                />
                <input
                  className={lineInput}
                  placeholder="하차 연락처"
                  value={form.하차연락처 || ""}
                  onChange={(e) => onChange("하차연락처", e.target.value)}
                />
              </div>
            </div>

          </div>
        </section>
        {/* ================= 화물 / 차량 ================= */}
        <section>
          <h3 className="text-base font-bold mb-6">
            화물 · 차량 정보
          </h3>

          <div className="grid grid-cols-3 gap-8 max-w-[760px]">
            <input
              className={lineInput}
              placeholder="화물내용"
              value={form.화물내용 || ""}
              onChange={(e) => onChange("화물내용", e.target.value)}
            />

            <input
              className={lineInput}
              placeholder="차량톤수 (예: 1톤 / 2.5톤)"
              value={form.차량톤수 || ""}
              onChange={(e) => onChange("차량톤수", e.target.value)}
            />

            <select
              className={select}
              value={form.차량종류 || ""}
              onChange={(e) => onChange("차량종류", e.target.value)}
            >
              <option value="">차량종류 선택</option>
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </section>

        {/* ================= 상/하차 방법 ================= */}
        <section>
          <h3 className="text-base font-bold mb-6">
            작업 방식
          </h3>

          <div className="grid grid-cols-4 gap-6 max-w-[760px]">
            <select
              className={select}
              value={form.상차방법 || ""}
              onChange={(e) => onChange("상차방법", e.target.value)}
            >
              <option value="">상차방법</option>
              {LOAD_TYPES.map(v => <option key={v}>{v}</option>)}
            </select>

            <select
              className={select}
              value={form.하차방법 || ""}
              onChange={(e) => onChange("하차방법", e.target.value)}
            >
              <option value="">하차방법</option>
              {LOAD_TYPES.map(v => <option key={v}>{v}</option>)}
            </select>

            <select
              className={select}
              value={form.지급방식 || ""}
              onChange={(e) => onChange("지급방식", e.target.value)}
            >
              <option value="">지급방식</option>
              {PAY_TYPES.map(v => <option key={v}>{v}</option>)}
            </select>

            <select
              className={select}
              value={form.배차방식 || ""}
              onChange={(e) => onChange("배차방식", e.target.value)}
            >
              <option value="">배차방식</option>
              {DISPATCH_TYPES.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
        </section>

        {/* ================= 메모 ================= */}
        <section>
          <h3 className="text-base font-bold mb-4">
            메모
          </h3>

          <div className="max-w-[760px]">
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-600"
              rows={4}
              value={form.메모 || ""}
              onChange={(e) => onChange("메모", e.target.value)}
            />
          </div>
        </section>

        {/* ================= 저장 ================= */}
        <div>
          <button
            onClick={doSave}
            className="px-12 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
          >
            저장
          </button>
        </div>
      </div>

      {/* ================= RIGHT : 요약 ================= */}
      <aside className="sticky top-[120px] h-fit">
        <div className="border rounded-2xl p-6 bg-white shadow-sm space-y-4">
          <h4 className="font-bold text-gray-800">요약</h4>

          <div className="text-sm space-y-2 text-gray-600">
            <div className="flex justify-between">
              <span>차량</span>
              <b>{form.차량종류 || "-"}</b>
            </div>
            <div className="flex justify-between">
              <span>톤수</span>
              <b>{form.차량톤수 || "-"}</b>
            </div>
            <div className="flex justify-between">
              <span>청구운임</span>
              <b>{Number(form.청구운임 || 0).toLocaleString()}원</b>
            </div>
            <div className="flex justify-between">
              <span>기사운임</span>
              <b>{Number(form.기사운임 || 0).toLocaleString()}원</b>
            </div>

            <div className="border-t pt-2 flex justify-between font-bold text-blue-600">
              <span>수수료</span>
              <span>
                {(
                  Number(form.청구운임 || 0) -
                  Number(form.기사운임 || 0)
                ).toLocaleString()}원
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
