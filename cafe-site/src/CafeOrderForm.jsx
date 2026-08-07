// ======================= cafe-site/src/CafeOrderForm.jsx =======================
// 배차마당 오더 작성/수정 모달 — 운송 프로그램(3파트) 오더등록과 동일한 필드 구성.
import React, { useState, useEffect } from "react";
import { VEHICLE_TYPES, PAY_TYPES, LOAD_METHODS } from "./cafeConstants";
import { createCafeOrder, updateCafeOrder } from "./cafeApi";

const emptyForm = {
  상차지명: "", 상차지주소: "", 하차지명: "", 하차지주소: "",
  화물내용: "", 차량톤수: "", 차량종류: "",
  지급방식: "", 상차방법: "", 하차방법: "",
  상차일: "", 상차시간: "", 하차일: "", 하차시간: "",
  운임: "", 메모: "",
  혼적: false, 운행유형: "편도", 긴급: false, 경유여부: false,
};

const field = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] text-gray-900 outline-none focus:border-[#1B2B4B] transition";
const label = "text-[12px] font-bold text-gray-500 mb-1 block";

export default function CafeOrderForm({ profile, editing, onClose, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editing) {
      setForm({ ...emptyForm, ...editing });
    } else {
      setForm(emptyForm);
    }
  }, [editing]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const submit = async () => {
    setError("");
    if (!form.상차지명.trim() || !form.하차지명.trim()) return setError("상차지명/하차지명을 입력해주세요.");
    if (!form.화물내용.trim()) return setError("화물내용을 입력해주세요.");
    if (!form.상차일) return setError("상차일을 선택해주세요.");
    setSaving(true);
    try {
      if (editing) {
        await updateCafeOrder(editing.id, form);
      } else {
        await createCafeOrder({
          ...form,
          companyName: profile.companyName,
          posterName: profile.name,
          posterNickname: profile.nickname,
          posterUid: profile.uid,
          source: "cafe",
        }, { posterPhone: profile.phone, posterName: profile.name });
      }
      onSaved?.();
    } catch (e) {
      setError(e.message || "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[640px] max-w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="text-white font-bold text-[15px]">{editing ? "오더 수정" : "오더 등록"}</div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* 상/하차지 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>상차지명 *</label>
              <input className={field} value={form.상차지명} onChange={e => set("상차지명", e.target.value)} placeholder="예: 인천 크레팜" />
            </div>
            <div>
              <label className={label}>하차지명 *</label>
              <input className={field} value={form.하차지명} onChange={e => set("하차지명", e.target.value)} placeholder="예: 부산 대한항공" />
            </div>
            <div>
              <label className={label}>상차지 주소</label>
              <input className={field} value={form.상차지주소} onChange={e => set("상차지주소", e.target.value)} />
            </div>
            <div>
              <label className={label}>하차지 주소</label>
              <input className={field} value={form.하차지주소} onChange={e => set("하차지주소", e.target.value)} />
            </div>
          </div>

          {/* 상/하차 일시 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>상차일 *</label>
              <input type="date" className={field} value={form.상차일} onChange={e => set("상차일", e.target.value)} />
            </div>
            <div>
              <label className={label}>상차시간</label>
              <input className={field} placeholder="예: 09:00 / 즉시" value={form.상차시간} onChange={e => set("상차시간", e.target.value)} />
            </div>
            <div>
              <label className={label}>하차일</label>
              <input type="date" className={field} value={form.하차일} onChange={e => set("하차일", e.target.value)} />
            </div>
            <div>
              <label className={label}>하차시간</label>
              <input className={field} placeholder="예: 14:00" value={form.하차시간} onChange={e => set("하차시간", e.target.value)} />
            </div>
          </div>

          {/* 화물 정보 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={label}>화물내용 *</label>
              <input className={field} value={form.화물내용} onChange={e => set("화물내용", e.target.value)} placeholder="예: 잡화 10파레트" />
            </div>
            <div>
              <label className={label}>차량톤수</label>
              <input className={field} placeholder="예: 5톤" value={form.차량톤수} onChange={e => set("차량톤수", e.target.value)} />
            </div>
            <div>
              <label className={label}>차량종류</label>
              <select className={field} value={form.차량종류} onChange={e => set("차량종류", e.target.value)}>
                <option value="">선택</option>
                {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* 지급/상하차방법 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>지급방식</label>
              <select className={field} value={form.지급방식} onChange={e => set("지급방식", e.target.value)}>
                <option value="">선택</option>
                {PAY_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>상차방법</label>
              <select className={field} value={form.상차방법} onChange={e => set("상차방법", e.target.value)}>
                <option value="">선택</option>
                {LOAD_METHODS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>하차방법</label>
              <select className={field} value={form.하차방법} onChange={e => set("하차방법", e.target.value)}>
                <option value="">선택</option>
                {LOAD_METHODS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* 운임 */}
          <div>
            <label className={label}>운임 (선택 — 협의가능이면 비워두세요)</label>
            <input className={field} placeholder="예: 350,000원 / 협의" value={form.운임} onChange={e => set("운임", e.target.value)} />
          </div>

          {/* 옵션 토글들 */}
          <div className="flex flex-wrap gap-2">
            {[
              ["혼적", "혼적"],
              ["긴급", "긴급"],
              ["경유여부", "경유"],
            ].map(([k, l]) => (
              <button type="button" key={k} onClick={() => set(k, !form[k])}
                className={`px-3 py-1.5 text-[12px] font-bold rounded-lg border transition ${form[k] ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                {l}
              </button>
            ))}
            <button type="button" onClick={() => set("운행유형", form.운행유형 === "왕복" ? "편도" : "왕복")}
              className={`px-3 py-1.5 text-[12px] font-bold rounded-lg border transition ${form.운행유형 === "왕복" ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
              {form.운행유형 === "왕복" ? "왕복" : "편도"} (클릭시 전환)
            </button>
          </div>

          <div>
            <label className={label}>메모</label>
            <textarea className={field} rows={3} value={form.메모} onChange={e => set("메모", e.target.value)} placeholder="추가로 전달할 내용이 있다면 적어주세요." />
          </div>

          {error && <div className="text-[12px] text-red-500 font-semibold">{error}</div>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-[13px] transition">취소</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white font-bold text-[13px] transition disabled:opacity-50">
            {saving ? "저장 중..." : editing ? "수정 완료" : "등록하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
