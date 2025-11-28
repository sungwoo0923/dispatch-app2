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
import { encryptData } from "./utils/crypt"; // ⬅ 24시콜 테스트 서버 암호화용

// 숫자만 추출해서 number
const toNumber = (v) => parseInt(String(v).replace(/[^\d]/g, ""), 10) || 0;

export default function DispatchManagement({
  dispatchData,
  setDispatchData,
  clients,
  role, // admin | user | test
}) {
  const isTest = role === "test";

  // 기본 폼 구조
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

  /* 🔥 B) 24시콜 "테스트 서버" 전송 함수
     - .env 에서 다음 값 사용:
       REACT_APP_API_URL  : 테스트 서버 URL
       REACT_APP_AUTH_KEY : 테스트용 authKey
  */
  async function testSend24Call() {
    const payload = {
      authKey: process.env.REACT_APP_AUTH_KEY,
      data: encryptData({
        startAddr: form.상차지명 || "인천",
        endAddr: form.하차지명 || "서울",
        cargo: form.화물내용 || "테스트 화물",
      }),
    };

    try {
      const res = await fetch(
        `${process.env.REACT_APP_API_URL}/order/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const result = await res.json();
      console.log("📨 테스트 서버 응답:", result);
      alert("테스트 서버 전송 완료! (Console 확인)");
    } catch (err) {
      console.error("❌ 통신 오류:", err);
      alert("API 요청 실패! Console 확인!");
    }
  }

  // 🔁 Firestore 실시간 구독
  useEffect(() => {
    // 테스트 계정이면 DB 안 보고, 완전 빈 상태
    if (isTest) {
      setDispatchData([]);
      return;
    }

    // 일반/관리자 계정 → dispatch 컬렉션 실시간 구독
    const unsub = onSnapshot(collection(db, "dispatch"), (snap) => {
      const list = snap.docs.map((d) => ({
        _id: d.id,
        ...d.data(),
      }));
      setDispatchData(list);
    });

    return () => unsub();
  }, [isTest, setDispatchData]);

  // 저장
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isTest) return alert("🚫 테스트 계정은 등록 불가!");

    if (!form.거래처명) return alert("거래처명을 선택해주세요");

    const id = doc(db, "dispatch").id;
    await setDoc(doc(db, "dispatch", id), {
      ...form,
      청구운임: toNumber(form.청구운임),
      기사운임: toNumber(form.기사운임),
      수수료: toNumber(form.수수료),
      updatedAt: serverTimestamp(),
    });

    alert("배차 등록 완료!");
    setForm(emptyForm);
  };

  // 테스트 계정이면 입력창 전부 disabled 느낌으로 표시
  const disabled = isTest ? "bg-gray-200 pointer-events-none" : "";

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">배차관리</h2>

      {/* 입력 폼 */}
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-6 gap-3 text-sm bg-gray-50 p-4 rounded"
      >
        {/* 거래처명 */}
        <div className="col-span-2">
          <label className="block text-xs mb-1">거래처명</label>
          <select
            value={form.거래처명}
            onChange={(e) =>
              setForm({ ...form, 거래처명: e.target.value })
            }
            disabled={isTest}
            className={`border p-2 w-full rounded ${disabled}`}
          >
            <option value="">거래처 선택</option>
            {(clients || []).map((c, i) => (
              <option key={i} value={c.거래처명}>
                {c.거래처명}
              </option>
            ))}
          </select>
        </div>

        {/* 화물내용 */}
        <div className="col-span-6">
          <label className="block text-xs mb-1">화물내용</label>
          <input
            value={form.화물내용}
            onChange={(e) =>
              setForm({ ...form, 화물내용: e.target.value })
            }
            disabled={isTest}
            className={`border p-2 w-full rounded ${disabled}`}
            placeholder="예: 10파렛트"
          />
        </div>

        {/* 버튼 영역 */}
        <div className="col-span-6 text-center mt-3 flex gap-3 justify-center">
          {/* 등록하기 (실제 DB 저장) */}
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

          {/* 💥 24시콜 테스트 서버 전송 버튼 */}
          <button
            type="button"
            onClick={testSend24Call}
            className="px-6 py-2 rounded bg-orange-500 text-white hover:bg-orange-600"
          >
            24시콜 테스트 🚚
          </button>
        </div>
      </form>

      {/* 테스트 계정 안내 문구 */}
      {isTest && (
        <div className="text-center mt-3 text-red-500 font-bold">
          🚫 테스트 계정은 조회/저장/수정/삭제가 제한됩니다.
        </div>
      )}
    </div>
  );
}
