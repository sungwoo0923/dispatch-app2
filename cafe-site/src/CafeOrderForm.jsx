// ======================= cafe-site/src/CafeOrderForm.jsx =======================
// 로지스웹 허브 오더 등록/수정 — 운송 프로그램(3파트) 오더등록과 같은 필드 구성 및
// 입력 UI(날짜/시간 선택기, 톤수 단위, 운임 콤마 등)를 쓴다.
// ⭐ 2026-11-06 리디자인 + 운송사 간 거래 — 공개(시/구·일정·화물·운임) / 비공개(정확한 주소·현장 담당자·상세 메모,
//  매칭된 운송사에게만) / 정산 메모(청구 운임 → 수수료, 우리 회사만)로 나눠 저장한다.
import React, { useState, useEffect, useMemo } from "react";
import { VEHICLE_TYPES, PAY_TYPES, LOAD_METHODS, TON_UNITS, MARKET_NAME, toRegion, regionText, isV2 } from "./cafeConstants";
import { createMarketOrder, updateMarketOrder, updateCafeOrder, splitOrderFields } from "./cafeApi";
import CustomDatePicker from "./CustomDatePicker";
import TimeAmPmPicker from "./TimeAmPmPicker";
import PlaceAutocomplete from "./PlaceAutocomplete";
import { GRID_BG, Icon, Sheet, NUM, btnPrimary, btnPrimaryStyle, btnGhost, selectCls } from "./ui";

const emptyForm = {
  상차지명: "", 상차지주소: "", 하차지명: "", 하차지주소: "",
  상차지담당자: "", 상차지담당자번호: "", 하차지담당자: "", 하차지담당자번호: "",
  화물내용: "", 차량톤수: "", 차량종류: "", 리프트: false,
  지급방식: "", 상차방법: "", 하차방법: "",
  상차일: "", 상차시간: "", 하차일: "", 하차시간: "",
  운임: "", 협의: false, 메모: "", 공개메모: "",
  혼적: false, 운행유형: "편도", 긴급: false, 경유여부: false,
};

const field = "w-full h-12 border border-[#DCE3EE] rounded-xl px-3.5 text-[15px] font-medium text-[#0F1A30] bg-white outline-none focus:border-[#2D4C82] focus:ring-4 focus:ring-[#2D4C82]/10 transition placeholder:text-[#A3AEC0]";
const label = "text-[13.5px] font-bold text-[#55657F] mb-1.5 block";
const chip = (on) => `h-11 px-4 text-[14px] font-bold rounded-xl transition ${on ? "bg-[#0F1A30] text-white" : "bg-white text-[#3A4A66] ring-1 ring-inset ring-[#DCE3EE] hover:ring-[#2D4C82]"}`;
const Sec = ({ n, title, note, lock }) => (
  <div className="flex items-center gap-2.5 pt-2">
    <span className="w-7 h-7 rounded-lg bg-[#0F1A30] text-[#8FB0F0] text-[13px] font-bold flex items-center justify-center shrink-0">{n}</span>
    <span className="text-[16px] font-extrabold text-[#0F1A30]">{title}</span>
    {lock && <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[#EAF0FA] text-[#2D4C82] text-[13px] font-bold"><Icon name="lock" size={12} />매칭 후 공개</span>}
    {note && <span className="text-[13px] text-[#8592A8] truncate">{note}</span>}
    <span className="flex-1 h-px bg-[#E8ECF3]" />
  </div>
);
const PLACEHOLDERS = { 상차지명: "예: 다온물류창고", 하차지명: "예: 청호식품 남부지점", 화물내용: "예: 잡화 10파레트" };

export default function CafeOrderForm({ profile, editing, editingDetail, editingSettle, onClose, onSaved, orders = [] }) {
  const [form, setForm] = useState(emptyForm);
  const [tonUnit, setTonUnit] = useState("톤");
  const [tonValue, setTonValue] = useState("");
  const [fareDigits, setFareDigits] = useState("");
  const [billDigits, setBillDigits] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const legacy = editing && !isV2(editing);

  useEffect(() => {
    if (editing) {
      setForm({ ...emptyForm, ...editing, ...(editingDetail || {}) });
      const t = String(editing.차량톤수 || "");
      const tm = t.match(/^([\d.]+)\s*(kg|톤)?$/i);
      if (tm) { setTonValue(tm[1]); setTonUnit(tm[2] ? (tm[2].toLowerCase() === "kg" ? "kg" : "톤") : "톤"); }
      else { setTonValue(t); setTonUnit(t ? "직접입력" : "톤"); }
      setFareDigits(String(editing.운임값 || editing.운임 || "").replace(/[^\d]/g, ""));
      setBillDigits(String(editingSettle?.청구운임 || "").replace(/[^\d]/g, ""));
    }
  }, [editing, editingDetail, editingSettle]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const showLift = /윙|카고/.test(form.차량종류 || "");

  // 그동안 허브에 올라온 (예전 글의) 장소 + 내가 올린 글의 장소를 "자주 쓰는 장소"로
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

  const up = toRegion(form.상차지주소);
  const dn = toRegion(form.하차지주소);
  const fare = Number(fareDigits || 0);
  const bill = Number(billDigits || 0);

  const submit = async () => {
    setError("");
    if (!form.상차지명.trim() || !form.하차지명.trim()) return setError("상차지명/하차지명을 입력해주세요.");
    if (!form.상차지주소.trim() || !form.하차지주소.trim()) return setError("상·하차지 주소를 입력해주세요. (다른 운송사에는 시·구까지만 보입니다)");
    if (!form.화물내용.trim()) return setError("화물내용을 입력해주세요.");
    if (!form.상차일) return setError("상차일을 선택해주세요.");
    setSaving(true);
    try {
      const finalForm = {
        ...form,
        차량톤수: tonValue.trim() ? `${tonValue.trim()}${tonUnit === "직접입력" ? "" : tonUnit}` : "",
        운임: form.협의 ? "" : (fare ? `${fare.toLocaleString()}원` : ""),
      };
      if (!finalForm.운임 && !form.협의) finalForm.협의 = true;
      const settle = bill ? { 청구운임: bill, 제시운임: fare, 수수료: fare ? bill - fare : 0 } : null;
      if (legacy) {
        await updateCafeOrder(editing.id, { ...finalForm, 운임: finalForm.협의 ? "협의가능" : finalForm.운임 });
      } else {
        const { pub, detail } = splitOrderFields(finalForm);
        if (editing) await updateMarketOrder(editing.id, { pub, detail, settle });
        else await createMarketOrder({ pub, detail, settle, profile, source: "market" });
      }
      onSaved?.();
    } catch (e) {
      setError(e?.code === "permission-denied" ? "등록 권한이 없습니다. 로지스웹 운송사 계정으로 로그인해 주세요." : (e.message || "저장 중 오류가 발생했습니다."));
    } finally {
      setSaving(false);
    }
  };

  return (
    // 바깥(어두운 배경)을 눌러도 닫히지 않게 — 입력 중 실수로 닫혀 내용이 날아가는 것 방지
    <Sheet onClose={onClose} width={760} closeOnBackdrop={false}>
      <div className="px-5 sm:px-6 py-4 flex items-center justify-between shrink-0 text-white" style={GRID_BG}>
        <div>
          <div className="text-[13px] font-semibold text-[#8FB0F0]">{MARKET_NAME}</div>
          <div className="font-extrabold text-[20px]">{editing ? "오더 수정" : "오더 올리기"}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="w-10 h-10 rounded-xl hover:bg-white/10 text-white/75 flex items-center justify-center"><Icon name="close" size={20} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* 공개 미리보기 */}
        {!legacy && (
          <div className="rounded-2xl bg-white ring-1 ring-inset ring-[#E2E7EF] px-4 py-3 flex items-center gap-3">
            <Icon name="eyeoff" size={18} className="text-[#2D4C82] shrink-0" />
            <div className="min-w-0 text-[14px] text-[#3A4A66]">
              다른 운송사에게는 <b className="text-[#0F1A30]">{regionText(up.sido, up.sigungu) || "상차 시·구"} → {regionText(dn.sido, dn.sigungu) || "하차 시·구"}</b>까지만 보입니다.
              지명·정확한 주소·담당자 연락처는 요청을 수락한 운송사에게만 공개됩니다.
            </div>
          </div>
        )}

        <Sec n="1" title="상·하차지" lock={!legacy} />
        <div>
          <label className={label}>상차지명 / 주소 *</label>
          <PlaceAutocomplete nameValue={form.상차지명} addrValue={form.상차지주소} onChangeName={v => set("상차지명", v)} onChangeAddr={v => set("상차지주소", v)} places={placePool} namePlaceholder={PLACEHOLDERS.상차지명} addrPlaceholder="주소 검색 또는 직접입력" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <input className={field} value={form.상차지담당자} onChange={e => set("상차지담당자", e.target.value)} placeholder="상차지 담당자(선택)" />
          <input className={field} inputMode="tel" value={form.상차지담당자번호} onChange={e => set("상차지담당자번호", e.target.value)} placeholder="담당자 연락처(선택)" />
        </div>
        <div>
          <label className={label}>하차지명 / 주소 *</label>
          <PlaceAutocomplete nameValue={form.하차지명} addrValue={form.하차지주소} onChangeName={v => set("하차지명", v)} onChangeAddr={v => set("하차지주소", v)} places={placePool} namePlaceholder={PLACEHOLDERS.하차지명} addrPlaceholder="주소 검색 또는 직접입력" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <input className={field} value={form.하차지담당자} onChange={e => set("하차지담당자", e.target.value)} placeholder="하차지 담당자(선택)" />
          <input className={field} inputMode="tel" value={form.하차지담당자번호} onChange={e => set("하차지담당자번호", e.target.value)} placeholder="담당자 연락처(선택)" />
        </div>

        <Sec n="2" title="일정" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={label}>상차일 *</label><CustomDatePicker value={form.상차일} onChange={e => set("상차일", e.target.value)} className={field} placeholder="날짜 선택" showIcon /></div>
          <div><label className={label}>상차시간</label><TimeAmPmPicker value={form.상차시간} onChange={v => set("상차시간", v)} /></div>
          <div><label className={label}>하차일</label><CustomDatePicker value={form.하차일} onChange={e => set("하차일", e.target.value)} className={field} placeholder="날짜 선택" showIcon /></div>
          <div><label className={label}>하차시간</label><TimeAmPmPicker value={form.하차시간} onChange={v => set("하차시간", v)} /></div>
        </div>

        <Sec n="3" title="화물 · 차량" />
        <div><label className={label}>화물내용 *</label><input className={field} value={form.화물내용} onChange={e => set("화물내용", e.target.value)} placeholder={PLACEHOLDERS.화물내용} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>차량톤수</label>
            <div className="relative">
              <input className={`${field} pr-[84px]`} inputMode={tonUnit === "직접입력" ? "text" : "decimal"} placeholder={tonUnit === "직접입력" ? "예: 1톤 카고급" : "예: 1.1 / 5"} value={tonValue}
                onChange={e => { const v = e.target.value; setTonValue(tonUnit === "직접입력" ? v : v.replace(/[^\d.]/g, "")); }} />
              <select value={tonUnit} onChange={e => { setTonUnit(e.target.value); setTonValue(""); }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 text-[14px] font-bold text-[#0F1A30] rounded-lg px-1.5 outline-none cursor-pointer bg-[#F2F5FA]">
                {TON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={label}>차량종류</label>
            <select className={`${selectCls} w-full !h-12 !text-[15px]`} value={form.차량종류} onChange={e => set("차량종류", e.target.value)}>
              <option value="">선택</option>
              {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
        {showLift && <button type="button" onClick={() => set("리프트", !form.리프트)} className={chip(form.리프트)}>{form.리프트 ? "✓ " : ""}리프트 차량</button>}
        <div className="grid grid-cols-3 gap-2.5">
          {[["지급방식", PAY_TYPES], ["상차방법", LOAD_METHODS], ["하차방법", LOAD_METHODS]].map(([k, list]) => (
            <div key={k}>
              <label className={label}>{k}</label>
              <select className={`${selectCls} w-full !h-12 !text-[15px]`} value={form[k]} onChange={e => set(k, e.target.value)}>
                <option value="">선택</option>
                {list.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          ))}
        </div>

        <Sec n="4" title="운임 · 옵션" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>제시 운임 (다른 운송사에 보이는 금액)</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input className={`${field} pr-9`} inputMode="numeric" disabled={form.협의} placeholder="숫자만 입력" value={fareDigits ? Number(fareDigits).toLocaleString() : ""} onChange={e => setFareDigits(e.target.value.replace(/[^\d]/g, ""))} style={NUM} />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] text-[#8592A8] pointer-events-none">원</span>
              </div>
              <button type="button" onClick={() => set("협의", !form.협의)} className={`${chip(form.협의)} shrink-0`}>{form.협의 ? "✓ " : ""}협의</button>
            </div>
          </div>
          {!legacy && (
            <div>
              <label className={label}><span className="inline-flex items-center gap-1"><Icon name="lock" size={12} />청구 운임 (우리 회사만 보임 · 선택)</span></label>
              <div className="relative">
                <input className={`${field} pr-9`} inputMode="numeric" placeholder="화주에게 받는 금액" value={billDigits ? Number(billDigits).toLocaleString() : ""} onChange={e => setBillDigits(e.target.value.replace(/[^\d]/g, ""))} style={NUM} />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] text-[#8592A8] pointer-events-none">원</span>
              </div>
              {bill > 0 && fare > 0 && <div className="mt-1.5 text-[14px] text-[#2D4C82] font-bold" style={NUM}>예상 수수료 {(bill - fare).toLocaleString()}원 ({Math.round(((bill - fare) / bill) * 100)}%)</div>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {[["긴급", "긴급"], ["혼적", "혼적"], ["경유여부", "경유"]].map(([k, l]) => (
            <button type="button" key={k} onClick={() => set(k, !form[k])} className={chip(form[k])}>{form[k] ? "✓ " : ""}{l}</button>
          ))}
          <div className="flex p-1 rounded-xl bg-white ring-1 ring-inset ring-[#DCE3EE]">
            {["편도", "왕복"].map((t) => <button key={t} type="button" onClick={() => set("운행유형", t)} className={`h-9 px-3.5 rounded-lg text-[14px] font-bold ${form.운행유형 === t ? "bg-[#0F1A30] text-white" : "text-[#55657F]"}`}>{t}</button>)}
          </div>
        </div>
        {!legacy && (
          <div><label className={label}>공개 메모 (모든 운송사에 보임)</label><input className={field} value={form.공개메모} onChange={e => set("공개메모", e.target.value)} placeholder="예: 파레트 회수 있음 · 대기 30분 가능" /></div>
        )}
        <div>
          <label className={label}>{legacy ? "메모" : "상세 메모 (매칭된 운송사에게만)"}</label>
          <textarea className={`${field} !h-auto py-3`} rows={3} value={form.메모} onChange={e => set("메모", e.target.value)} placeholder="출입 방법, 현장 주의사항 등" />
        </div>

        {error && <div className="rounded-xl bg-white ring-1 ring-inset ring-[#DCE3EE] px-4 py-3 text-[14px] font-bold text-[#0F1A30]">⚠ {error}</div>}
      </div>

      <div className="border-t border-[#E2E7EF] bg-white flex gap-2.5 shrink-0 px-4 sm:px-6 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))]">
        <button type="button" onClick={onClose} className={`${btnGhost} flex-1`}>취소</button>
        <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} flex-[1.6]`} style={btnPrimaryStyle}>
          {saving ? "저장 중..." : editing ? "수정 완료" : `${MARKET_NAME}에 올리기`}
        </button>
      </div>
    </Sheet>
  );
}
