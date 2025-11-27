import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

const toNumber = (v) => parseInt(String(v).replace(/[^\d]/g, ""), 10) || 0;
const toComma = (v) => (v ? v.toLocaleString() : "");

export default function DispatchManagement({
  dispatchData,
  setDispatchData,
  clients,
  role,
}) {
  const isTest = role === "test";

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

  // ------------------- Firestore 실시간 데이터 구독 -------------------
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "dispatch"), (snap) => {
      let list = snap.docs.map((d) => d.data());

      // ⭐ 테스트 계정은 거래처명 "테스트" 포함된 데이터만 표시
      if (isTest) {
        list = list.filter(
          (item) =>
            item.거래처명 &&
            item.거래처명.toLowerCase().includes("테스트")
        );
      }

      setDispatchData(list);
    });

    return () => unsub();
  }, [isTest, setDispatchData]);

  // ------------------- 저장 제한 -------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isTest) return alert("🚫 테스트 계정은 저장할 수 없습니다.");

    if (!form.거래처명) return alert("거래처명을 선택해주세요.");

    const id = form._id;
    await setDoc(doc(db, "dispatch", id), {
      ...form,
      청구운임: toNumber(form.청구운임),
      기사운임: toNumber(form.기사운임),
      수수료: toNumber(form.수수료),
      updatedAt: serverTimestamp(),
    });

    alert("등록되었습니다");
    setForm(emptyForm);
  };

  const disabled = isTest
    ? "bg-gray-200 text-gray-500 pointer-events-none"
    : "";

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">배차관리</h2>

      {/* 🔥 테스트 계정은 입력 불가 처리 */}
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-6 gap-3 text-sm bg-gray-50 p-4 rounded"
      >
        <div className="col-span-2">
          <label className="block text-xs mb-1">거래처명</label>
          <select
            value={form.거래처명}
            onChange={(e) => setForm({ ...form, 거래처명: e.target.value })}
            className={`border p-2 w-full rounded ${disabled}`}
            disabled={isTest}
          >
            <option value="">거래처 선택</option>
            {(clients || []).map((c, i) => (
              <option key={i} value={c.거래처명}>
                {c.거래처명}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-6">
          <label className="block text-xs mb-1">화물내용</label>
          <input
            value={form.화물내용}
            onChange={(e) => setForm({ ...form, 화물내용: e.target.value })}
            className={`border p-2 w-full rounded ${disabled}`}
            disabled={isTest}
            placeholder="예: 10파렛트 냉장식품"
          />
        </div>

        <div className="col-span-6 text-center mt-3">
          <button
            type="submit"
            disabled={isTest}
            className={`px-6 py-2 rounded ${
              isTest
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            등록하기
          </button>
        </div>
      </form>

      {isTest && (
        <div className="text-center mt-3 text-red-500 font-bold">
          🚫 테스트 계정은 조회/저장/수정/삭제가 제한됩니다.
        </div>
      )}
    </div>
  );
}
