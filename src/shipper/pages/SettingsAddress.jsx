import { useEffect, useState, useRef } from "react";
import { db, auth } from "../../firebase";
import { getDoc, collection, query, where, getDocs, doc, deleteDoc, addDoc, updateDoc, serverTimestamp } from "firebase/firestore";

const EMPTY_FORM = { name: "", address: "", 담당자명: "", 담당자번호: "", 메모: "" };

export default function SettingsAddress() {
  const [addressBook, setAddressBook] = useState([]);
  const [userData, setUserData] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) setUserData(snap.data());
    });
  }, []);

  const loadAddress = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const normalize = (name = "") =>
      name.toString().replace(/\(주\)|주식회사/g, "").replace(/\s/g, "").toLowerCase();

    const map = new Map();

    const addToMap = (d) => {
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
        if ((item.createdAt?.seconds || 0) > (existing.createdAt?.seconds || 0)) {
          map.set(key, item);
        }
      }
    };

    // Query by userId (all records this user created)
    const q1 = query(collection(db, "places"), where("userId", "==", user.uid));
    const snap1 = await getDocs(q1);
    snap1.docs.forEach(addToMap);

    // Also query by company (records from other users in same company)
    if (userData?.company) {
      const q2 = query(collection(db, "places"), where("company", "==", userData.company));
      const snap2 = await getDocs(q2);
      snap2.docs.forEach(addToMap);
    }

    setAddressBook(
      Array.from(map.values()).sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"))
    );
  };

  useEffect(() => {
    if (userData !== null) loadAddress();
  }, [userData]);

  const handleDelete = async (id) => {
    if (!window.confirm("삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "places", id));
    loadAddress();
  };

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditItem(null);
    setAddOpen(true);
  };

  const openEdit = (item) => {
    setForm({ name: item.name, address: item.address, 담당자명: item.manager, 담당자번호: item.phone, 메모: item.memo });
    setEditItem(item);
    setAddOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { alert("회사명을 입력하세요"); return; }
    const user = auth.currentUser;
    if (!user) return;
    setSaving(true);
    try {
      if (editItem) {
        await updateDoc(doc(db, "places", editItem.id), {
          name: form.name,
          address: form.address,
          담당자명: form.담당자명,
          담당자번호: form.담당자번호,
          메모: form.메모,
        });
      } else {
        await addDoc(collection(db, "places"), {
          ...form,
          type: "both",
          userId: user.uid,
          company: userData?.company || "",
          createdAt: serverTimestamp(),
        });
      }
      setAddOpen(false);
      loadAddress();
    } finally {
      setSaving(false);
    }
  };

  /* Excel 다운로드 */
  const handleDownload = () => {
    import("xlsx").then(XLSX => {
      const data = addressBook.map((item, i) => ({
        순번: i + 1,
        회사명: item.name,
        주소: item.address,
        담당자: item.manager,
        담당자번호: item.phone,
        메모: item.memo || "",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "주소록");
      XLSX.writeFile(wb, "주소록.xlsx");
    });
  };

  /* Excel 대량등록 */
  const handleBulkFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const user = auth.currentUser;
    if (!user) return;

    setBulkLoading(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);

      let count = 0;
      for (const row of rows) {
        const name = String(row["회사명"] || row["name"] || "").trim();
        if (!name) continue;
        await addDoc(collection(db, "places"), {
          name,
          address: String(row["주소"] || row["address"] || "").trim(),
          담당자명: String(row["담당자"] || row["담당자명"] || "").trim(),
          담당자번호: String(row["담당자번호"] || row["phone"] || "").trim(),
          메모: String(row["메모"] || row["memo"] || "").trim(),
          type: "both",
          userId: user.uid,
          company: userData?.company || "",
          createdAt: serverTimestamp(),
        });
        count++;
      }
      alert(`${count}건 등록 완료`);
      loadAddress();
    } catch (err) {
      alert("파일 처리 오류: " + err.message);
    } finally {
      setBulkLoading(false);
      setBulkOpen(false);
    }
  };

  return (
    <div className="bg-white rounded-xl px-8 py-6">

      {/* 상단 */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-[20px] font-bold text-gray-800">주소록 관리</h2>
          <p className="text-sm text-gray-400 mt-0.5">오더 등록 시 입력한 장소가 자동으로 저장됩니다</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            className="border border-gray-300 px-4 py-2 text-sm rounded-md hover:bg-gray-50 font-medium"
          >
            주소록 다운로드
          </button>
          <label className={`border border-gray-300 px-4 py-2 text-sm rounded-md hover:bg-gray-50 font-medium cursor-pointer ${bulkLoading ? "opacity-50" : ""}`}>
            {bulkLoading ? "등록중..." : "주소록 대량등록"}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={bulkLoading}
              onChange={handleBulkFile}
            />
          </label>
          <button
            onClick={openAdd}
            className="bg-blue-600 text-white px-4 py-2 text-sm rounded-md hover:bg-blue-700 font-medium"
          >
            + 주소록 등록
          </button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-[14px]">
          <thead className="bg-gray-50">
            <tr className="text-gray-700 font-semibold text-center border-b border-gray-200">
              <th className="py-3 px-4 text-left border-r border-gray-200">회사명</th>
              <th className="py-3 px-4 text-left border-r border-gray-200">주소</th>
              <th className="py-3 px-4 border-r border-gray-200">담당자</th>
              <th className="py-3 px-4 border-r border-gray-200">담당자번호</th>
              <th className="py-3 px-4 border-r border-gray-200">메모</th>
              <th className="py-3 px-4">편집</th>
            </tr>
          </thead>
          <tbody>
            {addressBook.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-20 text-gray-400">
                  <div className="text-base font-medium mb-1">등록된 주소록이 없습니다</div>
                  <div className="text-sm text-gray-300">오더를 등록하면 자동으로 저장됩니다</div>
                </td>
              </tr>
            ) : (
              addressBook.map((item) => (
                <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50 text-center">
                  <td className="py-3 px-4 font-semibold text-left border-r border-gray-100">{item.name}</td>
                  <td className="py-3 px-4 text-gray-600 text-left border-r border-gray-100 max-w-[220px] truncate">{item.address || "-"}</td>
                  <td className="py-3 px-4 border-r border-gray-100">{item.manager || "-"}</td>
                  <td className="py-3 px-4 border-r border-gray-100">{item.phone || "-"}</td>
                  <td className="py-3 px-4 border-r border-gray-100 text-gray-500">{item.memo || "-"}</td>
                  <td className="py-3 px-4">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => openEdit(item)}
                        className="px-3 py-1 text-xs border rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="px-3 py-1 text-xs border rounded bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-500 font-medium"
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

      {/* 등록/수정 모달 */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-[480px] p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4">{editItem ? "주소록 수정" : "주소록 등록"}</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">회사명 *</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  placeholder="회사명"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">주소</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  placeholder="주소"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">담당자</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  placeholder="담당자명"
                  value={form.담당자명}
                  onChange={(e) => setForm({ ...form, 담당자명: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">담당자번호</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  placeholder="010-0000-0000"
                  value={form.담당자번호}
                  onChange={(e) => setForm({ ...form, 담당자번호: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">메모</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  placeholder="메모"
                  value={form.메모}
                  onChange={(e) => setForm({ ...form, 메모: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setAddOpen(false)}
                className="flex-1 border py-2 rounded-lg text-sm"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "저장중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 대량등록 안내 */}
      {bulkOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-[460px] p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-3">주소록 대량등록</h3>
            <p className="text-sm text-gray-500 mb-4">
              엑셀 파일(.xlsx)에 아래 열을 포함해 업로드하세요.
            </p>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 font-mono mb-4">
              회사명 | 주소 | 담당자 | 담당자번호 | 메모
            </div>
            <label className={`block w-full text-center py-3 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 font-semibold ${bulkLoading ? "opacity-50" : ""}`}>
              {bulkLoading ? "등록중..." : "파일 선택"}
              <input
                type="file" accept=".xlsx,.xls,.csv" className="hidden"
                disabled={bulkLoading}
                onChange={handleBulkFile}
              />
            </label>
            <button onClick={() => setBulkOpen(false)} className="w-full mt-2 border py-2 rounded-lg text-sm">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
