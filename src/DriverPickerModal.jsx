// ✅ DriverPickerModal.jsx (Firestore 연동 버전)
import React, { useEffect, useState } from "react";

// 전화번호 하이픈 자동 포맷 (DispatchApp.jsx formatPhone과 동일 규칙)
function formatPhone(phone) {
  const p = String(phone ?? "").replace(/[^\d]/g, "");
  if (p.length === 11) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
  if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
  return p;
}

/**
 * ✅ DriverPickerModal.jsx
 * 차량번호 클릭 시 뜨는 기사 선택 / 신규등록 팝업
 */
export default function DriverPickerModal({
  open,
  onClose,
  onSave,
  drivers,
  setDrivers,
  saveDriver,   // ✅ Firestore 저장 함수 추가 (useFirestoreSync 에서 전달 예정)
  presetCarNo = "",
}) {
  const [search, setSearch] = useState("");
  const [filtered, setFiltered] = useState([]);
  const [car, setCar] = useState(presetCarNo || "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setCar(presetCarNo || "");
    setName("");
    setPhone("");
    setIsNew(false);
    setFiltered(drivers || []);
  }, [open, presetCarNo, drivers]);

  // 🔍 검색 기능
  useEffect(() => {
    const lower = search.toLowerCase();
    setFiltered(
      (drivers || []).filter(
        (d) =>
          d.차량번호.toLowerCase().includes(lower) ||
          d.이름.toLowerCase().includes(lower) ||
          d.전화번호.includes(search)
      )
    );
  }, [search, drivers]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex justify-center items-center z-50">
      <div className="bg-white rounded-2xl shadow-lg w-96 p-5 relative animate-fadeIn">
        <h3 className="text-lg font-bold mb-3">기사 선택 / 등록</h3>

        <input
          type="text"
          placeholder="차량번호, 이름, 전화번호 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border rounded p-2 mb-3"
        />

        <div className="max-h-40 overflow-y-auto border rounded mb-3">
          {filtered.length > 0 ? (
            filtered.map((d, i) => (
              <div
                key={i}
                onClick={() => {
                  setCar(d.차량번호);
                  setName(d.이름);
                  setPhone(formatPhone(d.전화번호));
                  setIsNew(false);
                }}
                className="p-2 hover:bg-blue-50 cursor-pointer border-b text-sm"
              >
                🚚 {d.차량번호} — {d.이름} ({formatPhone(d.전화번호)})
              </div>
            ))
          ) : (
            <div className="p-3 text-gray-400 text-center text-sm">
              검색 결과 없음
            </div>
          )}
        </div>

        {/* 신규등록 폼 */}
        {isNew && (
          <div className="space-y-2 mb-3">
            <input
              type="text"
              placeholder="차량번호"
              value={car}
              onChange={(e) => setCar(e.target.value)}
              className="w-full border rounded p-2"
            />
            <input
              type="text"
              placeholder="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded p-2"
            />
            <input
              type="text"
              placeholder="전화번호"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              className="w-full border rounded p-2"
            />
          </div>
        )}

        <div className="flex justify-between mt-4">
          {!isNew ? (
            <button
              onClick={() => setIsNew(true)}
              className="text-blue-600 underline"
            >
              신규등록
            </button>
          ) : (
            <button
              onClick={() => setIsNew(false)}
              className="text-gray-500 underline"
            >
              목록보기
            </button>
          )}

          <div className="space-x-2">
            <button
              className="px-3 py-1 rounded bg-gray-300"
              onClick={onClose}
            >
              닫기
            </button>

            <button
              className="px-3 py-1 rounded bg-blue-600 text-white"
              onClick={async () => {
                if (!car) return alert("차량번호를 입력하세요.");
                if (!name) return alert("이름을 입력하세요.");
                if (!phone) return alert("전화번호를 입력하세요.");

                const exists = drivers.find((d) => d.차량번호 === car);

                // ✅ Firestore 저장 (실시간 반영)
                await saveDriver({
                  차량번호: car,
                  이름: name,
                  전화번호: phone,
                });

                // ✅ 로컬에서도 즉시 반영 (옵션)
                if (!exists) {
                  setDrivers((prev) => [
                    ...prev,
                    { 차량번호: car, 이름: name, 전화번호: phone },
                  ]);
                }

                onSave({ 차량번호: car, 이름: name, 전화번호: phone });
                onClose();
              }}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
