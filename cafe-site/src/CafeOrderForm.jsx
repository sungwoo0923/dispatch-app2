// ======================= cafe-site/src/CafeOrderForm.jsx =======================
// 배차마당 오더 작성/수정 모달 — 운송 프로그램(3파트) 오더등록과 동일한 필드 구성 및
// 입력 UI(날짜/시간 선택기, 톤수 단위, 운임 콤마 등)를 쓴다.
import React, { useState, useEffect, useMemo } from "react";
import { VEHICLE_TYPES, PAY_TYPES, LOAD_METHODS, TON_UNITS } from "./cafeConstants";
import { createCafeOrder, updateCafeOrder } from "./cafeApi";
import CustomDatePicker from "./CustomDatePicker";
import TimeAmPmPicker from "./TimeAmPmPicker";
import PlaceAutocomplete from "./PlaceAutocomplete";

const emptyForm = {
  상차지명: "", 상차지주소: "", 하차지명: "", 하차지주소: "",
  화물내용: "", 차량톤수: "", 차량종류: "", 리프트: false,
  지급방식: "", 상차방법: "", 하차방법: "",
  상차일: "", 상차시간: "", 하차일: "", 하차시간: "",
  운임: "", 협의: false, 메모: "",
  혼적: false, 운행유형: "편도", 긴급: false, 경유여부: false,
};

const field = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] text-gray-900 outline-none focus:border-[#1B2B4B] transition";
const label = "text-[12px] font-bold text-gray-500 mb-1 block";

// 실제로 존재하지 않을 법한 예시 — 자사 등록 거래처와 혼동되지 않게 가공의 이름만 쓴다.
const PLACEHOLDERS = {
  상차지명: "예: 다온물류창고",
  하차지명: "예: 청호식품 남부지점",
  화물내용: "예: 잡화 10파레트",
};

export default function CafeOrderForm({ profile, editing, onClose, onSaved, orders = [] }) {
  const [form, setForm] = useState(emptyForm);
  const [tonUnit, setTonUnit] = useState("톤");
  const [tonValue, setTonValue] = useState("");
  const [fareDigits, setFareDigits] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editing) {
      setForm({ ...emptyForm, ...editing });
      // 기존 값에서 톤수/운임을 편집용 내부 상태로 역파싱
      const t = String(editing.차량톤수 || "");
      const tm = t.match(/^([\d.]+)\s*(kg|톤)?$/i);
      if (tm) { setTonValue(tm[1]); setTonUnit(tm[2] ? (tm[2].toLowerCase() === "kg" ? "kg" : "톤") : "톤"); }
      else { setTonValue(t); setTonUnit(t ? "직접입력" : "톤"); }
      setFareDigits(String(editing.운임 || "").replace(/[^\d]/g, ""));
    } else {
      setForm(emptyForm);
      setTonUnit("톤");
      setTonValue("");
      setFareDigits("");
    }
  }, [editing]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // 배차마당에 그동안 올라온 오더들의 상/하차지 이름+주소를 모아 "자주 쓰는 장소" 풀로 쓴다.
  const placePool = useMemo(() => {
    const map = new Map();
    orders.forEach(o => {
      [[o.상차지명, o.상차지주소], [o.하차지명, o.하차지주소]].forEach(([name, addr]) => {
        if (!name?.trim()) return;
        const key = `${name.trim()}|${(addr || "").trim()}`;
        if (!map.has(key)) map.set(key, { name: name.trim(), addr: (addr || "").trim() });
      });
    });
    return [...map.values()];
  }, [orders]);

  const showLift = /윙|카고/.test(form.차량종류 || "");

  const submit = async () => {
    setError("");
    if (!form.상차지명.trim() || !form.하차지명.trim()) return setError("상차지명/하차지명을 입력해주세요.");
    if (!form.화물내용.trim()) return setError("화물내용을 입력해주세요.");
    if (!form.상차일) return setError("상차일을 선택해주세요.");
    setSaving(true);
    try {
      const finalForm = {
        ...form,
        차량톤수: tonValue.trim() ? `${tonValue.trim()}${tonUnit === "직접입력" ? "" : tonUnit}` : "",
        운임: form.협의 ? "협의가능" : (fareDigits ? `${Number(fareDigits).toLocaleString()}원` : ""),
      };
      if (editing) {
        await updateCafeOrder(editing.id, finalForm);
      } else {
        await createCafeOrder({
          ...finalForm,
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
          {/* 상차지 */}
          <div>
            <label className={label}>상차지명 / 주소 *</label>
            <PlaceAutocomplete
              nameValue={form.상차지명}
              addrValue={form.상차지주소}
              onChangeName={v => set("상차지명", v)}
              onChangeAddr={v => set("상차지주소", v)}
              places={placePool}
              namePlaceholder={PLACEHOLDERS.상차지명}
              addrPlaceholder="주소 검색 또는 직접입력"
            />
          </div>
          {/* 하차지 */}
          <div>
            <label className={label}>하차지명 / 주소 *</label>
            <PlaceAutocomplete
              nameValue={form.하차지명}
              addrValue={form.하차지주소}
              onChangeName={v => set("하차지명", v)}
              onChangeAddr={v => set("하차지주소", v)}
              places={placePool}
              namePlaceholder={PLACEHOLDERS.하차지명}
              addrPlaceholder="주소 검색 또는 직접입력"
            />
          </div>

          {/* 상/하차 일시 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>상차일 *</label>
              <CustomDatePicker value={form.상차일} onChange={e => set("상차일", e.target.value)} className={field} placeholder="날짜 선택" showIcon />
            </div>
            <div>
              <label className={label}>상차시간</label>
              <TimeAmPmPicker value={form.상차시간} onChange={v => set("상차시간", v)} />
            </div>
            <div>
              <label className={label}>하차일</label>
              <CustomDatePicker value={form.하차일} onChange={e => set("하차일", e.target.value)} className={field} placeholder="날짜 선택" showIcon />
            </div>
            <div>
              <label className={label}>하차시간</label>
              <TimeAmPmPicker value={form.하차시간} onChange={v => set("하차시간", v)} />
            </div>
          </div>

          {/* 화물 정보 */}
          <div>
            <label className={label}>화물내용 *</label>
            <input className={field} value={form.화물내용} onChange={e => set("화물내용", e.target.value)} placeholder={PLACEHOLDERS.화물내용} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>차량톤수</label>
              <div className="relative">
                <input
                  className={`${field} pr-[76px]`}
                  inputMode={tonUnit === "직접입력" ? "text" : "decimal"}
                  placeholder={tonUnit === "직접입력" ? "예: 1톤 카고급" : "예: 1.1 / 1200"}
                  value={tonValue}
                  onChange={e => {
                    const v = e.target.value;
                    if (tonUnit === "직접입력") setTonValue(v);
                    else setTonValue(v.replace(/[^\d.]/g, ""));
                  }}
                  onKeyDown={e => {
                    if (tonUnit === "직접입력") return;
                    if (!/[\d.]/.test(e.key) && !["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                />
                <select
                  value={tonUnit}
                  onChange={e => { setTonUnit(e.target.value); setTonValue(""); }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-[12px] font-bold text-[#1B2B4B] border border-gray-200 rounded-md px-1.5 py-1 outline-none cursor-pointer bg-white"
                >
                  {TON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={label}>차량종류</label>
              <select className={field} value={form.차량종류} onChange={e => set("차량종류", e.target.value)}>
                <option value="">선택</option>
                {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          {showLift && (
            <button type="button" onClick={() => set("리프트", !form.리프트)}
              className={`px-3 py-1.5 text-[12px] font-bold rounded-lg border transition ${form.리프트 ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
              {form.리프트 ? "✓ " : ""}리프트 차량
            </button>
          )}

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
            <label className={label}>운임</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  className={`${field} pr-9`}
                  inputMode="numeric"
                  disabled={form.협의}
                  placeholder="숫자만 입력"
                  value={fareDigits ? Number(fareDigits).toLocaleString() : ""}
                  onChange={e => setFareDigits(e.target.value.replace(/[^\d]/g, ""))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400 font-semibold pointer-events-none">원</span>
              </div>
              <button type="button" onClick={() => set("협의", !form.협의)}
                className={`shrink-0 px-3 py-2.5 text-[12px] font-bold rounded-lg border transition ${form.협의 ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                {form.협의 ? "✓ " : ""}협의가능
              </button>
            </div>
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
