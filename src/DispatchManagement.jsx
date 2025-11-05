// src/DispatchManagement.jsx
import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

export default function DispatchManagement({ dispatchData, setDispatchData, clients }) {
  const emptyForm = {
    _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    등록일: new Date().toISOString().slice(0, 10),
    상차일: "",
    상차시간: "",
    하차일: "",
    하차시간: "",
    거래처명: "",
    상차지명: "",
    하차지명: "",
    화물내용: "",
    차량종류: "",
    차량톤수: "",
    차량번호: "",
    이름: "",
    전화번호: "",
    배차상태: "",
    지급방식: "",
    배차방식: "",
    청구운임: "",
    기사운임: "",
    수수료: "",
    메모: "",
  };

  const [form, setForm] = useState(emptyForm);

  // ✅ Firestore 실시간 구독
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "dispatch"), (snap) => {
      const list = snap.docs.map((d) => d.data());
      setDispatchData(list);
    });
    return () => unsub();
  }, [setDispatchData]);

  // ✅ 거래처 선택 시 자동 입력
  const handleClientChange = (value) => {
    const client = clients?.find((c) => c.거래처명 === value);
    setForm({
      ...form,
      거래처명: value,
      상차지명: client ? client.거래처명 : "",
    });
  };

  // ✅ 입력 변경
  const handleChange = (key, value) => {
    let updated = { ...form, [key]: value };

    if (key === "청구운임" || key === "기사운임") {
      const fare = parseInt(updated.청구운임 || 0);
      const driver = parseInt(updated.기사운임 || 0);
      updated.수수료 = fare && driver ? String(fare - driver) : "";
    }

    setForm(updated);
  };

  // ✅ 날짜 자동 버튼
  const setDateAuto = (target, isTomorrow = false) => {
    const d = new Date();
    if (isTomorrow) d.setDate(d.getDate() + 1);
    const dateStr = d.toISOString().slice(0, 10);
    setForm((f) => ({ ...f, [target]: dateStr }));
  };

  // ✅ Firestore에 저장
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.거래처명) {
      alert("거래처명을 선택해주세요.");
      return;
    }
    const id = form._id;
    await setDoc(doc(db, "dispatch", id), {
      ...form,
      updatedAt: serverTimestamp(),
    });
    alert("✅ 배차가 등록되었습니다");
    setForm(emptyForm);
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">배차관리</h2>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-6 gap-3 text-sm bg-gray-50 p-4 rounded"
      >
        {/* 거래처명 */}
        <div className="col-span-2">
          <label className="block text-xs mb-1">거래처명</label>
          <select
            value={form.거래처명}
            onChange={(e) => handleClientChange(e.target.value)}
            className="border p-2 w-full rounded"
          >
            <option value="">거래처 선택</option>
            {(clients || []).map((c, i) => (
              <option key={i} value={c.거래처명}>
                {c.거래처명}
              </option>
            ))}
          </select>
        </div>

        {/* 상차지명 */}
        <div className="col-span-2">
          <label className="block text-xs mb-1">상차지명</label>
          <input
            value={form.상차지명}
            onChange={(e) => handleChange("상차지명", e.target.value)}
            className="border p-2 w-full rounded"
            placeholder="상차지명 입력"
          />
        </div>

        {/* 하차지명 */}
        <div className="col-span-2">
          <label className="block text-xs mb-1">하차지명</label>
          <input
            value={form.하차지명}
            onChange={(e) => handleChange("하차지명", e.target.value)}
            className="border p-2 w-full rounded"
            placeholder="하차지명 입력"
          />
        </div>

        {/* 상차일 + 버튼 */}
        <div className="flex items-center gap-2 col-span-3">
          <div className="flex-1">
            <label className="block text-xs mb-1">상차일</label>
            <input
              type="date"
              value={form.상차일}
              onChange={(e) => handleChange("상차일", e.target.value)}
              className="border p-2 w-full rounded"
            />
          </div>
          <div className="flex flex-col justify-end gap-1">
            <button
              type="button"
              onClick={() => setDateAuto("상차일", false)}
              className="bg-blue-500 text-white px-2 py-1 rounded text-xs"
            >
              당일
            </button>
            <button
              type="button"
              onClick={() => setDateAuto("상차일", true)}
              className="bg-blue-500 text-white px-2 py-1 rounded text-xs"
            >
              내일
            </button>
          </div>
        </div>

        {/* 하차일 + 버튼 */}
        <div className="flex items-center gap-2 col-span-3">
          <div className="flex-1">
            <label className="block text-xs mb-1">하차일</label>
            <input
              type="date"
              value={form.하차일}
              onChange={(e) => handleChange("하차일", e.target.value)}
              className="border p-2 w-full rounded"
            />
          </div>
          <div className="flex flex-col justify-end gap-1">
            <button
              type="button"
              onClick={() => setDateAuto("하차일", false)}
              className="bg-green-500 text-white px-2 py-1 rounded text-xs"
            >
              당일
            </button>
            <button
              type="button"
              onClick={() => setDateAuto("하차일", true)}
              className="bg-green-500 text-white px-2 py-1 rounded text-xs"
            >
              내일
            </button>
          </div>
        </div>

        {/* --- 이하 나머지는 기존과 동일, 그대로 유지됨 --- */}
        {/* (차량, 운임, 메모, 버튼 포함) */}
        {/* 화물내용 */}
        <div className="col-span-6">
          <label className="block text-xs mb-1">화물내용</label>
          <input
            value={form.화물내용}
            onChange={(e) => handleChange("화물내용", e.target.value)}
            className="border p-2 w-full rounded"
            placeholder="예: 10파렛트 냉장식품"
          />
        </div>

        {/* 차량종류 */}
        <div>
          <label className="block text-xs mb-1">차량종류</label>
          <select
            value={form.차량종류}
            onChange={(e) => handleChange("차량종류", e.target.value)}
            className="border p-2 w-full rounded"
          >
            <option value="">선택</option>
            {[
              "라보",
              "다마스",
              "오토바이",
              "윙바디",
              "탑",
              "카고",
              "냉장윙",
              "냉동윙",
              "냉장탑",
              "냉동탑",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>

        {/* 차량톤수 */}
        <div>
          <label className="block text-xs mb-1">차량톤수</label>
          <select
            value={form.차량톤수}
            onChange={(e) => handleChange("차량톤수", e.target.value)}
            className="border p-2 w-full rounded"
          >
            <option value="">선택</option>
            {["1톤", "2.5톤", "5톤", "8톤", "11톤", "18톤"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>

        {/* 운임정보 */}
        <div>
          <label className="block text-xs mb-1">청구운임</label>
          <input
            type="number"
            value={form.청구운임}
            onChange={(e) => handleChange("청구운임", e.target.value)}
            className="border p-2 w-full rounded"
          />
        </div>

        <div>
          <label className="block text-xs mb-1">기사운임</label>
          <input
            type="number"
            value={form.기사운임}
            onChange={(e) => handleChange("기사운임", e.target.value)}
            className="border p-2 w-full rounded"
          />
        </div>

        <div>
          <label className="block text-xs mb-1">수수료</label>
          <input
            type="number"
            value={form.수수료}
            onChange={(e) => handleChange("수수료", e.target.value)}
            className="border p-2 w-full rounded bg-gray-100"
            readOnly
          />
        </div>

        {/* 메모 */}
        <div className="col-span-6">
          <label className="block text-xs mb-1">메모</label>
          <textarea
            value={form.메모}
            onChange={(e) => handleChange("메모", e.target.value)}
            className="border p-2 w-full rounded"
            placeholder="비고나 특이사항 입력"
          />
        </div>

        {/* 등록 버튼 */}
        <div className="col-span-6 text-center mt-3">
          <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            등록하기
          </button>
        </div>
      </form>
    </div>
  );
}
