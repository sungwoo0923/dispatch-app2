// src/ResumeInputs.jsx
// ⭐ 2026-11-01 이력서 입력 — 손으로 치던 기간·날짜·주소를 선택형으로
//  · PeriodPicker: 시작 월 ~ 끝 월(달력 선택) + "재직중/재학중" 체크 → "2020.03 ~ 2024.02" 형식 글자로 저장(기존 데이터와 같은 모양)
//  · DateField: 날짜 선택(YYYY-MM-DD)
//  · AddressField: 주소 검색(다음 우편번호) → 도로명 주소 + 상세주소
import React from "react";
import { createPortal } from "react-dom";

const INP = "w-full h-11 border border-[#DCE3EE] rounded-xl px-3 text-[14.5px] font-semibold text-[#0F1A30] bg-white focus:outline-none focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10";

// "2020.03", "2020-03", "2020년 3월", "2020.3" → "2020-03"(input type=month 값)
const toMonth = (s) => {
  const m = String(s || "").match(/(\d{4})\D{0,3}(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}` : "";
};
const dot = (ym) => (ym ? ym.replace("-", ".") : "");

export function parsePeriod(v, ongoingLabel = "재직중") {
  const s = String(v || "");
  const [a = "", b = ""] = s.split(/~|–|-(?=\s*\d{4}\D)/).map((x) => x.trim());
  const ongoing = /중|현재/.test(b) || (s.includes(ongoingLabel));
  return { start: toMonth(a), end: ongoing ? "" : toMonth(b), ongoing, raw: s };
}
export function formatPeriod({ start, end, ongoing }, ongoingLabel = "재직중") {
  if (!start && !end && !ongoing) return "";
  return `${dot(start)} ~ ${ongoing ? ongoingLabel : dot(end)}`.trim();
}

export function PeriodPicker({ value, onChange, ongoingLabel = "재직중", className = "" }) {
  const p = parsePeriod(value, ongoingLabel);
  // 예전에 손으로 적은 값(형식 인식 불가)은 그대로 보여 주고, 새로 고르면 바뀐다
  const legacy = !!p.raw && !p.start && !p.end && !p.ongoing;
  const set = (patch) => onChange(formatPeriod({ ...p, ...patch }, ongoingLabel));
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <input type="month" value={p.start} max={p.end || undefined} onChange={(e) => set({ start: e.target.value })} className={`${INP} !w-[150px] tabular-nums`} title="시작 월" />
      <span className="text-[#9AA9C3] font-black">~</span>
      <input type="month" value={p.end} min={p.start || undefined} disabled={p.ongoing} onChange={(e) => set({ end: e.target.value })} className={`${INP} !w-[150px] tabular-nums disabled:bg-[#F5F8FD] disabled:text-[#9AA9C3]`} title="끝 월" />
      <label className="inline-flex items-center gap-1.5 h-11 px-2.5 rounded-xl border border-[#E3E8F0] text-[13px] font-bold text-[#3A4A66] cursor-pointer select-none whitespace-nowrap">
        <input type="checkbox" checked={p.ongoing} onChange={(e) => set({ ongoing: e.target.checked, end: e.target.checked ? "" : p.end })} className="w-4 h-4 accent-[#1B2B4B]" />{ongoingLabel}
      </label>
      {legacy && <span className="w-full text-[11.5px] font-bold text-[#B54708]">기존 입력: “{p.raw}” — 달력에서 다시 골라 주세요</span>}
    </div>
  );
}

export function DateField({ value, onChange, className = "", placeholder = "" }) {
  const v = String(value || "");
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : (() => { const m = v.match(/(\d{4})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : ""; })();
  return <input type="date" value={iso} max="2100-12-31" onChange={(e) => onChange(e.target.value)} title={placeholder} className={`${INP} tabular-nums ${className}`} />;
}

export function SelectField({ value, onChange, options = [], placeholder = "선택", className = "" }) {
  const v = value || "";
  return (
    <select value={v} onChange={(e) => onChange(e.target.value)} className={`${INP} ${className} ${v ? "" : "text-[#9AA9C3]"}`}>
      <option value="">{placeholder}</option>
      {v && !options.includes(v) && <option value={v}>{v}</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// 📮 다음(카카오) 우편번호 — 모바일 웹뷰에서도 되게 팝업 대신 화면 안에 띄운다(Signup.jsx와 같은 방식)
const POSTCODE_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
function loadPostcode() {
  if (window.daum?.Postcode) return Promise.resolve();
  if (window.__kpPostcodeP) return window.__kpPostcodeP;
  window.__kpPostcodeP = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = POSTCODE_SRC; s.async = true; s.onload = () => res(); s.onerror = () => { window.__kpPostcodeP = null; rej(new Error("주소 검색을 불러오지 못했습니다")); };
    document.head.appendChild(s);
  });
  return window.__kpPostcodeP;
}

export function AddressSearchModal({ open, onClose, onPick }) {
  const box = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    loadPostcode().then(() => {
      if (!alive || !box.current) return;
      box.current.innerHTML = "";
      new window.daum.Postcode({
        oncomplete: (d) => { onPick({ address: d.roadAddress || d.jibunAddress || d.address || "", zonecode: d.zonecode || "" }); onClose(); },
        width: "100%", height: "100%",
      }).embed(box.current);
    }).catch((e) => { alert(e.message); onClose(); });
    return () => { alive = false; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[2147483000] bg-[#0B1428]/50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-[520px] h-[min(560px,86vh)] rounded-2xl bg-white overflow-hidden shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="h-12 px-4 flex items-center justify-between border-b border-[#E3E8F0]">
          <span className="text-[15px] font-black text-[#0F1A30]">주소 검색</span>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg text-[#5B6B85] hover:bg-[#F5F8FD] font-black">✕</button>
        </div>
        <div ref={box} className="flex-1 min-h-0" />
      </div>
    </div>,
    document.body,
  );
}

// 주소 한 칸(글자로 저장) — [주소 검색]으로 도로명 주소를 넣고, 상세주소를 이어서 적는다
export function AddressField({ value, onChange, className = "" }) {
  const [open, setOpen] = React.useState(false);
  const [detail, setDetail] = React.useState("");
  const [base, setBase] = React.useState(null); // 검색으로 고른 기본 주소(상세주소 입력 중)
  const detailRef = React.useRef(null);
  const pick = ({ address, zonecode }) => {
    const b = `${zonecode ? `(${zonecode}) ` : ""}${address}`;
    setBase(b); setDetail(""); onChange(b);
    setTimeout(() => detailRef.current?.focus(), 50);
  };
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex gap-1.5">
        <input readOnly value={base ?? (value || "")} placeholder="주소 검색을 눌러 주세요" onClick={() => setOpen(true)} className={`${INP} cursor-pointer bg-[#FAFBFD]`} />
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 h-11 px-3.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-black hover:bg-[#0F1A30] whitespace-nowrap">주소 검색</button>
      </div>
      {base !== null && (
        <input ref={detailRef} value={detail} placeholder="상세주소 (동·호수 등)" onChange={(e) => { setDetail(e.target.value); onChange(`${base}${e.target.value ? ` ${e.target.value}` : ""}`); }} className={INP} />
      )}
      <AddressSearchModal open={open} onClose={() => setOpen(false)} onPick={pick} />
    </div>
  );
}

export const EDU_STATUS = ["졸업", "졸업예정", "재학", "휴학", "중퇴", "수료", "검정고시"];
export const FAMILY_REL = ["부", "모", "배우자", "자녀", "형제", "자매", "조부", "조모", "기타"];

// 🎂 2026-11-02 생년월일 — 년 · 월 · 일 드롭다운(회원가입·이력서 공용). 값은 "YYYY-MM-DD"
export function BirthSelect({ value, onChange, className = "", selectClass = "" }) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const [y, setY] = React.useState(m ? m[1] : "");
  const [mo, setMo] = React.useState(m ? m[2] : "");
  const [d, setD] = React.useState(m ? m[3] : "");
  React.useEffect(() => { const x = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); if (x) { setY(x[1]); setMo(x[2]); setD(x[3]); } }, [value]);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - 15 - 1940 + 1 }, (_, i) => String(thisYear - 15 - i));
  const days = y && mo ? new Date(Number(y), Number(mo), 0).getDate() : 31;
  const push = (ny, nm, nd) => {
    const max = ny && nm ? new Date(Number(ny), Number(nm), 0).getDate() : 31;
    const dd = nd && Number(nd) > max ? String(max).padStart(2, "0") : nd;
    if (dd !== nd) setD(dd);
    onChange(ny && nm && dd ? `${ny}-${nm}-${dd}` : "");
  };
  const sel = selectClass || "w-full h-12 border border-[#DCE3EE] rounded-xl px-3 text-[15px] font-semibold text-[#0F1A30] bg-white focus:outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15";
  const S = ({ v, set, list, ph, unit }) => (
    <select value={v} onChange={(e) => set(e.target.value)} className={`${sel} ${v ? "" : "text-[#8E9BB2]"}`}>
      <option value="">{ph}</option>
      {list.map((o) => <option key={o} value={o}>{Number(o)}{unit}</option>)}
    </select>
  );
  return (
    <div className={`grid grid-cols-[1.3fr_1fr_1fr] gap-2 ${className}`}>
      {S({ v: y, set: (v) => { setY(v); push(v, mo, d); }, list: years, ph: "년도", unit: "년" })}
      {S({ v: mo, set: (v) => { setMo(v); push(y, v, d); }, list: Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")), ph: "월", unit: "월" })}
      {S({ v: d, set: (v) => { setD(v); push(y, mo, v); }, list: Array.from({ length: days }, (_, i) => String(i + 1).padStart(2, "0")), ph: "일", unit: "일" })}
    </div>
  );
}
