import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export default function SettingsProfile() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  /* 🔥 회사정보 불러오기 */
useEffect(() => {
  const unsub = auth.onAuthStateChanged(async (user) => {
    if (!user) {
      console.log("❌ 로그인 안됨");
      return;
    }

    if (!db) {
      console.log("❌ db 없음");
      return;
    }

    try {
      const snap = await getDoc(doc(db, "users", user.uid));

      if (snap.exists()) {
        setData(snap.data());
      } else {
        console.log("❌ 유저 데이터 없음");
      }
    } catch (e) {
      console.error("🔥 Firestore 에러", e);
    }
  });

  return () => unsub();
}, []);

if (!data) {
  return (
    <div className="h-screen flex items-center justify-center text-gray-500">
      권한 확인 중...
    </div>
  );
}

  return (
    <div className="bg-white rounded-lg px-10 py-8">

      {/* 타이틀 */}
      <h2 className="text-[22px] font-bold text-gray-800 mb-8">설정</h2>

      <div className="text-[20px]">

        {/* 회사정보 */}
        <div className="mb-10">

          <div className="flex justify-between items-center mb-6">
            <div className="font-semibold text-gray-700">회사정보</div>

            <button
              onClick={() => setOpen(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm"
            >
              수정
            </button>
          </div>

          <div className="space-y-6">
            <Row label="회사명" value={data.company || ""} />
            <Row label="대표" value={data.ceo || ""} />
            <Row label="주소" value={data.address || ""} />
            <Row
              label="업태/업종"
              value={`${data.bizType || "-"} / ${data.bizItem || "-"}`}
            />

            <div className="flex items-start">
              <div className="w-[180px] text-gray-500">사업자번호</div>
              <div>
                <div className="text-gray-800">{data.bizNo || ""}</div>
                <div className="text-[16px] text-blue-500 mt-1">
                  정보 수정이 필요할 경우 r15332525@daum.net 으로 변경된 사업자 등록증을 보내주시기 바랍니다.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 구분선 */}
        <div className="border-t border-gray-200 my-8"></div>

        {/* 은행정보 */}
        <div className="mb-10">
          <Row label="은행정보" value={data.bank || "-"} />
        </div>

        {/* 구분선 */}
        <div className="border-t border-gray-200 my-8"></div>

        {/* 전화 / 팩스 */}
        <div className="space-y-6">
          <Row label="전화번호" value={data.tel || ""} />
          <Row label="팩스" value={data.fax || ""} />
        </div>
      </div>

      {/* ================= 수정 모달 ================= */}
      {open && (
        <EditModal
          data={data}
          setData={setData}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/* ================= Row ================= */
function Row({ label, value }) {
  return (
    <div className="flex items-center">
      <div className="w-[180px] text-gray-500">{label}</div>
      <div className="text-gray-800">{value}</div>
    </div>
  );
}

/* ================= 수정 모달 ================= */
function EditModal({ data, setData, onClose }) {
  const [form, setForm] = useState({
    ceo: data.ceo || "",
    address: data.address || "",
    bizType: data.bizType || "",
    bizItem: data.bizItem || "",
    bizNo: data.bizNo || "",
    bank: data.bank || "",
    tel: data.tel || "",
    fax: data.fax || "",
  });

  const update = (k, v) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  const handleSave = async () => {
    const user = auth.currentUser;
    await updateDoc(doc(db, "users", user.uid), form);

    setData((prev) => ({ ...prev, ...form }));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center">

      <div className="bg-white w-[500px] rounded-2xl shadow-2xl p-6">

        <div className="text-lg font-bold mb-5">회사정보 수정</div>

        <div className="space-y-4">

          <Input label="대표" value={form.ceo} onChange={(v) => update("ceo", v)} />
          <Input label="주소" value={form.address} onChange={(v) => update("address", v)} />

          <div className="flex gap-3">
            <Input label="업태" value={form.bizType} onChange={(v) => update("bizType", v)} />
            <Input label="업종" value={form.bizItem} onChange={(v) => update("bizItem", v)} />
          </div>

          <Input label="사업자번호" value={form.bizNo} onChange={(v) => update("bizNo", v)} />
          <Input label="은행정보" value={form.bank} onChange={(v) => update("bank", v)} />
          <Input label="전화번호" value={form.tel} onChange={(v) => update("tel", v)} />
          <Input label="팩스" value={form.fax} onChange={(v) => update("fax", v)} />

        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md">
            취소
          </button>

          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-md"
          >
            저장
          </button>
        </div>

      </div>
    </div>
  );
}

/* ================= Input ================= */
function Input({ label, value, onChange }) {
  return (
    <div>
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2"
      />
    </div>
  );
}