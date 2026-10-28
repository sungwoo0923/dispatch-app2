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

// ⭐ 2026-10-28 리디자인 — 네이비 톤 입력칸·구역 제목
const field = "w-full h-11 border border-[#DCE3EE] rounded-xl px-3.5 text-[13.5px] font-semibold text-[#0F1A30] bg-white outline-none focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10 transition placeholder:text-[#9AA9C3] placeholder:font-medium";
const label = "text-[12px] font-bold text-[#5B6B85] mb-1.5 block";
const chip = (on) => `h-9 px-3.5 text-[12.5px] font-black rounded-xl border transition ${on ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE] hover:border-[#4B6CB7]"}`;
const Sec = ({ en, title }) => <div className="flex items-center gap-2 pt-1"><span className="text-[10px] font-extrabold tracking-[0.24em] text-[#4B6CB7]" style={{ fontFamily: "'JetBrains Mono','SF Mono',ui-monospace,monospace" }}>{en}</span><span className="text-[13.5px] font-black text-[#0F1A30]">{title}</span><span className="flex-1 h-px bg-[#EEF1F6]" /></div>;

// 실제로 존재하지 않을 법한 예시 — 자사 등록 거래처와 혼동되지 않게 가공의 이름만 쓴다.
const PLACEHOLDERS = {
  상차지명: "예: 다온물류창고",
  하차지명: "예: 청호식품 남부지점",
  화물내용: "예: 잡화 10파레트",
};

// inline=true 이면 모달이 아니라 화면 안(실시간 배차현황 왼쪽 패널)에 그대로 그린다.
export default function CafeOrderForm({ profile, editing, onClose, onSaved, orders = [], inline = false }) {
  const [form, setForm] = useState(emptyForm);
  const [tonUnit, setTonUnit] = useState("톤");
  const [tonValue, setTonValue] = useState("");
  const [fareDigits, setFareDigits] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

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

  const resetForm = () => {
    setForm(emptyForm);
    setTonUnit("톤");
    setTonValue("");
    setFareDigits("");
  };

  const submit = async () => {
    setError("");
    setDone("");
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
      if (inline) {
        resetForm();
        setDone("오더가 등록되었습니다.");
        setTimeout(() => setDone(""), 2500);
      }
      onSaved?.();
    } catch (e) {
      setError(e.message || "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <>
        <div className="px-6 py-4 flex items-center justify-between shrink-0 text-white" style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div>
            <div className="text-[10px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: "'JetBrains Mono','SF Mono',ui-monospace,monospace" }}>{editing ? "EDIT ORDER" : inline ? "QUICK POST" : "NEW ORDER"}</div>
            <div className="font-black text-[17px]">{editing ? "오더 수정" : inline ? "빠른 오더 등록" : "오더 등록"}</div>
          </div>
          {!inline && <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-white/10 text-white/70 text-[20px] leading-none">×</button>}
        </div>

        <div className={`flex-1 overflow-y-auto space-y-4 ${inline ? "p-4" : "p-6"}`}>
          <Sec en="ROUTE" title="상·하차지" />
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

          <Sec en="SCHEDULE" title="일시" />
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

          <Sec en="CARGO" title="화물 · 차량" />
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
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[12px] font-black text-[#0F1A30] border border-[#DCE3EE] rounded-lg px-1.5 py-1 outline-none cursor-pointer bg-[#F5F8FD]"
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
              className={chip(form.리프트)}>
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

          <Sec en="PAYMENT" title="운임 · 옵션" />
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
                className={`${chip(form.협의)} !h-11 shrink-0`}>
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
                className={chip(form[k])}>
                {l}
              </button>
            ))}
            <button type="button" onClick={() => set("운행유형", form.운행유형 === "왕복" ? "편도" : "왕복")}
              className={chip(form.운행유형 === "왕복")}>
              {form.운행유형 === "왕복" ? "왕복" : "편도"} (클릭시 전환)
            </button>
          </div>

          <div>
            <label className={label}>메모</label>
            <textarea className={`${field} !h-auto py-2.5`} rows={3} value={form.메모} onChange={e => set("메모", e.target.value)} placeholder="추가로 전달할 내용이 있다면 적어주세요." />
          </div>

          {error && <div className="rounded-xl bg-[#F5F8FD] border border-[#DCE3EE] px-3.5 py-2.5 text-[13px] font-bold text-[#0F1A30]">⚠ {error}</div>}
          {done && <div className="rounded-xl bg-[#0F1A30] px-3.5 py-2.5 text-[13px] font-black text-white">✓ {done}</div>}
        </div>

        <div className={`border-t border-[#E3E8F0] bg-white flex gap-2.5 shrink-0 ${inline ? "px-4 py-3" : "px-6 py-4"}`}>
          <button type="button" onClick={inline ? resetForm : onClose} className="flex-1 h-12 rounded-xl border border-[#DCE3EE] text-[#5B6B85] font-bold text-[13.5px] hover:bg-[#F5F8FD] transition">
            {inline ? "초기화" : "취소"}
          </button>
          <button type="button" onClick={submit} disabled={saving}
            className="flex-[1.6] h-12 rounded-xl text-white font-black text-[14px] transition disabled:opacity-50 shadow-[0_10px_24px_rgba(15,26,48,0.25)]" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>
            {saving ? "저장 중..." : editing ? "수정 완료" : "등록하기"}
          </button>
        </div>
    </>
  );

  if (inline) {
    return (
      <div className="bg-white border border-[#E3E8F0] rounded-[20px] flex flex-col overflow-hidden h-full shadow-[0_6px_20px_rgba(15,26,48,0.05)]">
        {body}
      </div>
    );
  }

  // 바깥(어두운 배경)을 클릭해도 닫히지 않게 한다 — 입력 중 실수로 닫혀 내용이 날아가는 것 방지.
  // 닫기는 × 버튼 / 취소 버튼으로만.
  return (
    <div className="fixed inset-0 bg-[#0F1A30]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-[9999] sm:p-4">
      <div className="bg-white sm:rounded-[24px] rounded-t-[24px] shadow-[0_24px_60px_rgba(15,26,48,0.4)] w-full sm:w-[680px] max-h-[94vh] flex flex-col overflow-hidden">
        {body}
      </div>
    </div>
  );
}
