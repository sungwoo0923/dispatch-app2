import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-[#1B2B4B]/40 focus:border-[#1B2B4B] outline-none";
const labelCls = "block text-xs font-bold text-gray-600 mb-1";

export default function SettingsProfile() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user || !db) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setData(snap.data());
      } catch (e) {
        console.error("설정 정보 조회 실패", e);
      }
    });
    return () => unsub();
  }, []);

  if (!data) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">

      {/* 회사정보 */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#1B2B4B] rounded-full inline-block" />
            회사정보
          </div>
          <button
            onClick={() => setOpen(true)}
            className="px-4 py-1.5 bg-[#1B2B4B] hover:opacity-90 text-white rounded-lg text-sm font-semibold transition"
          >
            수정
          </button>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <Row label="회사명" value={data.companyName} />
          <Row label="대표" value={data.ceo || data.name} />
          <Row label="주소" value={data.address} />
          <Row label="업태/업종" value={`${data.bizType || "-"} / ${data.bizItem || "-"}`} />
          <Row label="사업자번호" value={data.businessNumber || data.bizNo} />
          <p className="text-[12px] text-gray-400 pt-1">
            사업자번호 정보 수정이 필요할 경우 r15332525@daum.net 으로 변경된 사업자 등록증을 보내주시기 바랍니다.
          </p>
        </div>
      </div>

      {/* 은행정보 */}
      <div>
        <div className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-[#1B2B4B] rounded-full inline-block" />
          은행정보
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <Row label="은행정보" value={data.bank} />
        </div>
      </div>

      {/* 연락처 */}
      <div>
        <div className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-[#1B2B4B] rounded-full inline-block" />
          연락처
        </div>
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <Row label="전화번호" value={data.tel} />
          <Row label="팩스" value={data.fax} />
        </div>
      </div>

      {open && (
        <EditModal data={data} setData={setData} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center text-sm">
      <span className="text-gray-500 font-medium">{label}</span>
      <span className="text-gray-800 font-semibold">{value || "-"}</span>
    </div>
  );
}

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

  const update = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    const user = auth.currentUser;
    await updateDoc(doc(db, "users", user.uid), form);
    setData((prev) => ({ ...prev, ...form }));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]" onClick={onClose}>
      <div className="bg-white rounded-2xl w-[460px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-[15px]">회사정보 수정</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="p-6 space-y-3.5 max-h-[70vh] overflow-y-auto">
          <div><label className={labelCls}>대표</label><input className={inputCls} value={form.ceo} onChange={(e) => update("ceo", e.target.value)} /></div>
          <div><label className={labelCls}>주소</label><input className={inputCls} value={form.address} onChange={(e) => update("address", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>업태</label><input className={inputCls} value={form.bizType} onChange={(e) => update("bizType", e.target.value)} /></div>
            <div><label className={labelCls}>업종</label><input className={inputCls} value={form.bizItem} onChange={(e) => update("bizItem", e.target.value)} /></div>
          </div>
          <div><label className={labelCls}>사업자번호</label><input className={inputCls} value={form.bizNo} onChange={(e) => update("bizNo", e.target.value)} /></div>
          <div><label className={labelCls}>은행정보</label><input className={inputCls} value={form.bank} onChange={(e) => update("bank", e.target.value)} /></div>
          <div><label className={labelCls}>전화번호</label><input className={inputCls} value={form.tel} onChange={(e) => update("tel", e.target.value)} /></div>
          <div><label className={labelCls}>팩스</label><input className={inputCls} value={form.fax} onChange={(e) => update("fax", e.target.value)} /></div>
        </div>

        <div className="border-t border-gray-100 px-6 py-4 flex gap-2">
          <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-semibold transition">취소</button>
          <button onClick={handleSave} className="flex-1 bg-[#1B2B4B] hover:opacity-90 text-white py-2.5 rounded-lg text-sm font-bold transition">저장</button>
        </div>
      </div>
    </div>
  );
}
