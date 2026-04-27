import { useEffect, useState } from "react";
import { db, auth } from "../../firebase";
import { getDoc } from "firebase/firestore";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  deleteDoc,
} from "firebase/firestore";

export default function SettingsAddress() {
  const [addressBook, setAddressBook] = useState([]);
  const [userData, setUserData] = useState(null);
useEffect(() => {
  const user = auth.currentUser;
  if (!user) return;

  getDoc(doc(db, "users", user.uid)).then((snap) => {
    if (snap.exists()) {
      setUserData(snap.data());
    }
  });
}, []);
  /* ================= 주소록 불러오기 ================= */
  const loadAddress = async () => {
    const user = auth.currentUser;
    if (!user || !userData?.company) return;

    const q = query(
      collection(db, "places"),
      where("company", "==", userData.company)
    );

    const snap = await getDocs(q);

    // 🔥 정규화 (중복 제거용)
    const normalize = (name = "") =>
      name
        .toString()
        .replace(/\(주\)|주식회사/g, "")
        .replace(/\s/g, "")
        .toLowerCase();

    const map = new Map();

    snap.docs.forEach((d) => {
      const data = d.data();

      const item = {
        id: d.id,
        name: data.name || "",
        address: data.address || "",
        manager: data.담당자명 || "",
        phone: data.담당자번호 || "",
        memo: data.메모 || "",
        createdAt: data.createdAt,
      };

      const key = normalize(item.name);

      if (!map.has(key)) {
        map.set(key, item);
      } else {
        const existing = map.get(key);

        // 🔥 최신 데이터로 덮어쓰기
        if (
          item.createdAt?.seconds >
          existing.createdAt?.seconds
        ) {
          map.set(key, item);
        }
      }
    });

    setAddressBook(Array.from(map.values()));
  };

useEffect(() => {
  if (userData) {
    loadAddress();
  }
}, [userData]);

  /* ================= 삭제 ================= */
  const handleDelete = async (id) => {
    if (!window.confirm("삭제하시겠습니까?")) return;

    await deleteDoc(doc(db, "places", id));
    loadAddress(); // 🔥 삭제 후 새로고침
  };

  return (
    <div className="bg-white rounded-xl px-8 py-6">
      
      {/* ================= 상단 ================= */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[20px] font-bold text-gray-800">
          주소록 관리
        </h2>

        <div className="flex gap-2">
          <button className="border border-gray-300 px-4 py-2 text-sm rounded-md hover:bg-gray-50">
            주소록 다운로드
          </button>
          <button className="border border-gray-300 px-4 py-2 text-sm rounded-md hover:bg-gray-50">
            주소록 대량 등록
          </button>
          <button className="border border-gray-300 px-4 py-2 text-sm rounded-md hover:bg-gray-50">
            + 주소록 등록
          </button>
        </div>
      </div>

      {/* ================= 테이블 ================= */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-[14px]">

          {/* 헤더 */}
          <thead className="bg-gray-100">
            <tr className="text-gray-700 font-semibold text-center">
              <th className="py-3">회사명</th>
              <th>주소</th>
              <th>담당자</th>
              <th>담당자번호</th>
              <th>메모</th>
              <th>편집</th>
            </tr>
          </thead>

          {/* 바디 */}
          <tbody>
            {addressBook.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-20 text-gray-400">
                  검색된 내용이 없습니다.
                </td>
              </tr>
            ) : (
              addressBook.map((item) => (
                <tr
                  key={item.id}
                  className="border-t text-center hover:bg-gray-50"
                >
                  <td className="py-3 font-semibold">
                    {item.name}
                  </td>

                  <td>{item.address}</td>
                  <td>{item.manager}</td>
                  <td>{item.phone}</td>
                  <td>{item.memo || "-"}</td>

                  <td>
                    <div className="flex justify-center gap-2">
                      <button className="px-3 py-1 text-xs border rounded bg-blue-50 text-blue-600">
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="px-3 py-1 text-xs border rounded bg-gray-100 text-gray-600"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>

        </table>
      </div>
    </div>
  );
}