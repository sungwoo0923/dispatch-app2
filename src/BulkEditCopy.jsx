// ======================= src/BulkEditCopy.jsx =======================
// 🗂 2026-11-09 배차현황·실시간배차현황 우클릭 [일괄수정·복사] — 거의 전체 화면 창, 위쪽 탭 두 개
// 🛠 2026-11-19 다시 짬(사용자 요청 — "정신없다 · 시간 · 드롭다운이 오더등록과 다르다 · 스마트검색이 없다")
//  · 일괄수정: 왼쪽 = 고른 오더 목록, 오른쪽 = 오더등록과 같은 순서의 입력 카드 하나.
//    왼쪽 맨 위 [체크한 오더 한꺼번에]를 고르면 체크한 오더 전체에 같은 값이 들어가고(값이 서로 다르면 "여러 값 · 그대로 둠"),
//    오더 하나를 누르면 그 오더만 고친다. 바뀐 칸은 파란 띠 + [되돌리기].
//    시간 = 오더등록과 같은 형식(오전/오후 + "9시 30분" + 이전/이후) · 거래처/상하차지 = 오더등록과 같은 검색 드롭다운(업체명 + 주소,
//    고르면 주소 · 담당자 · 연락처까지) · 기사 스마트검색(이름 · 차량번호 · 전화번호 · 기사 문자 붙여넣기) · 새 기사는 저장할 때 기사관리에 등록
//    저장은 바뀐 칸만 patchDispatch(손으로 고칠 때와 같은 경로 — 수정 기록·화주사 사본·구글시트·기사 알림 그대로)
//  · 일괄복사: 오더마다 상차일·하차일·시간·복사 횟수(연속 N일 / 평일만)를 정해 한 번에 새 오더로 등록.
//    등록은 오더 복사 패널의 [복사 등록]과 같은 함수(onCopyOne = submitCopyOrderPC).
import React from "react";
import { kpConfirm } from "./kpDialog";
import { createPortal } from "react-dom";
import CustomDatePicker from "./CustomDatePicker";
import { CustomSelect } from "./CustomSelect";
import { subscribeUsersLive } from "./usersLive"; // 👤 2026-11-09 복사본 배차담당자
import { staffOptionsOf, ownerOfOrder, matchOwner } from "./orderOwner";
import { CompanyOptionPicker } from "./companyOptionPicker"; // 지급방식·배차방식·상하차방법은 회사 목록(배차관리와 같은 목록)
import { DispatchWayPicker } from "./CallPay"; // 💳 배차방식 — 먼저 IN/OUT, 그다음 방식
import { placeSearch } from "./placeSearch"; // 🔎 오더등록과 같은 검색
import { runBulkTask } from "./DeleteProgress"; // ⏳ 2026-11-20 일괄수정 · 복사 진행 창
import { payTypeStatusPatch } from "./dispatchStatus"; // 지급방식이 바뀌면 배차상태도 오더등록과 같게

const pad = (n) => String(n).padStart(2, "0");
const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const kstToday = () => { const d = new Date(Date.now() + 9 * 3600e3); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return ymdOf(d); };
const nextMonday = () => { const t = kstToday(); const w = new Date(`${t}T00:00:00`).getDay(); return addDays(t, w === 0 ? 1 : 8 - w); };
const dayGap = (a, b) => { if (!a || !b) return 0; return Math.max(0, Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5)) || 0; };
const dowOf = (s) => new Date(`${s}T00:00:00`).getDay();
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const fmtMD = (s) => (s ? `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}(${DOW[dowOf(s)]})` : "-");
const money = (v) => { const n = Number(String(v ?? "").replace(/[^\d-]/g, "")); return n ? n.toLocaleString() : ""; };
const digits = (v) => String(v ?? "").replace(/[^\d-]/g, "");
const telDigits = (v) => String(v ?? "").replace(/[^\d]/g, "");
const fmtTel = (p = "") => {
  const d = telDigits(p);
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return d.startsWith("02") ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return p || "";
};
const plateKey = (s = "") => String(s || "").replace(/[\s-]/g, "").toUpperCase();
const NUM = { fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" };
const idOf = (r) => r?._id || r?.id;

// 복사 계획 → 실제로 만들 오더 날짜 목록 [{ 상차일, 하차일 }]
export function copyDatesOf(plan) {
  const out = [];
  const n = Math.max(1, Math.min(31, Number(plan.count) || 1));
  let d = plan.상차일;
  let guard = 0;
  while (out.length < n && guard < 200) {
    guard += 1;
    const w = dowOf(d);
    if (!(plan.weekdaysOnly && (w === 0 || w === 6))) {
      out.push({ 상차일: d, 하차일: out.length === 0 && !plan.keepGap ? (plan.하차일 || d) : addDays(d, Number(plan.gap) || 0) });
    }
    d = addDays(d, 1);
  }
  return out;
}

// 기사 문자 붙여넣기 → { plate, name, phone } — 오더등록 스마트검색(parseDriverText)과 같은 규칙
export function parseDriverText(text = "") {
  const phoneMatch = text.match(/01[016789][- .]?\d{3,4}[- .]?\d{4}/);
  const phone = phoneMatch ? fmtTel(phoneMatch[0]) : "";
  const plateMatch = text.match(/[가-힣]{2,3}\d{2}[가-힣]\d{4}|\d{2,3}[가-힣]\d{4}/);
  const plate = plateMatch ? plateMatch[0] : "";
  let name = "";
  const owner = text.match(/\[차주정보\]\s*([가-힣]{2,4})/);
  if (owner) name = owner[1];
  else {
    let s = text;
    if (phoneMatch?.[0]) s = s.replace(phoneMatch[0], " ");
    if (plate) s = s.replace(plate, " ");
    const skip = ["강원", "서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종", "경북", "경남", "전북", "전남", "충북", "충남", "제주", "냉장", "냉동", "카고", "윙바디"];
    const words = s.match(/[가-힣]{2,4}/g) || [];
    name = words.find((n) => !skip.includes(n) && !/[구시군동읍면로]$/.test(n)) || words[0] || "";
  }
  return { phone, plate, name };
}
// 스마트검색 후보 — 차량번호가 있으면 그 차량, 아니면 이름 · 전화번호 · 차량번호 일부
export function matchDrivers(drivers, text) {
  const q = String(text || "").trim();
  if (!q) return [];
  const { plate, name, phone } = parseDriverText(q);
  const list = (drivers || []).filter((d) => d && (d.차량번호 || d.이름));
  if (plate) return list.filter((d) => plateKey(d.차량번호) === plateKey(plate)).slice(0, 8);
  const qd = telDigits(q); const qs = q.replace(/\s+/g, "");
  return list.filter((d) => {
    if (name && name.length >= 2 && String(d.이름 || "").includes(name)) return true;
    if (qd.length >= 4 && (telDigits(d.전화번호).includes(qd) || plateKey(d.차량번호).includes(qd))) return true;
    return qs.length >= 2 && plateKey(d.차량번호).includes(plateKey(qs));
  }).slice(0, 8);
}

// ── 고칠 수 있는 칸 ─────────────────────────────────────────
//  kind: bool(켜고 끄기) · money(숫자) · 그 밖은 글자
const KEYS = [
  "상차일", "상차시간", "상차시간기준", "하차일", "하차시간", "하차시간기준",
  "거래처명",
  "상차지명", "상차지Id", "상차지주소", "상차지담당자", "상차지담당자번호",
  "하차지명", "하차지Id", "하차지주소", "하차지담당자", "하차지담당자번호",
  "화물내용", "차량종류", "차량톤수", "상차방법", "하차방법", "혼적", "긴급",
  "차량번호", "이름", "전화번호",
  "청구운임", "기사운임", "지급방식", "배차방식", "콜구분", "콜플랫폼",
  "메모", "전달사항",
];
const BOOL = new Set(["혼적", "긴급"]);
const MONEY = new Set(["청구운임", "기사운임"]);
const LABEL = { 상차지Id: "", 하차지Id: "", 콜구분: "", 콜플랫폼: "", 상차시간기준: "상차시간 이전/이후", 하차시간기준: "하차시간 이전/이후", 이름: "기사명", 상차지담당자번호: "상차지 연락처", 하차지담당자번호: "하차지 연락처" };
export const normVal = (k, v) => (BOOL.has(k) ? !!v : MONEY.has(k) ? (Number(digits(v)) || 0) : String(v ?? "").trim());
const sameVal = (k, a, b) => normVal(k, a) === normVal(k, b);

// 바뀐 칸만 patch로 — 저장할 때 쓰는 값으로 바꿔서
export function diffOf(orig = {}, cur = {}) {
  const out = {};
  KEYS.forEach((k) => {
    if (sameVal(k, orig[k], cur[k])) return;
    out[k] = BOOL.has(k) ? !!cur[k] : MONEY.has(k) ? (digits(cur[k]) === "" ? "" : Number(digits(cur[k])) || 0) : (cur[k] ?? "");
  });
  if ("혼적" in out) out.독차 = !out.혼적; // 오더등록과 같게 — 혼적을 끄면 독차
  return out;
}

const inp = "w-full h-[36px] px-2.5 rounded-[10px] border border-[#DCE3EE] bg-white text-[13px] font-semibold text-[#0F1A30] placeholder:text-[#A7B3C6] placeholder:font-medium focus:outline-none focus:border-[#4B6CB7] focus:ring-2 focus:ring-[#4B6CB7]/15 disabled:bg-[#F4F6FA]";
const sel = `${inp} pr-6 text-left`;
const chip = (on) => `h-[30px] px-2.5 rounded-[9px] text-[12px] font-extrabold border whitespace-nowrap shrink-0 transition ${on ? "bg-[#1B2B4B] border-[#1B2B4B] text-white" : "bg-white border-[#DCE3EE] text-[#1B2B4B] hover:border-[#1B2B4B]"}`;
const KEEP = "__keep__"; // 여러 값 · 그대로 둠(고르면 아무것도 안 바뀜)
const MENU_SEL = "[data-kp-popup], [data-opt-menu], [data-vt-menu], [data-vt-dialog], [data-fare-menu], [data-kp-dialog], [data-cs-menu], [data-bec-menu], [data-way-ask]";

// ── 시간 — 오더등록(TimeAmPmPicker)과 같은 값: "오전 9시" · "오후 2시 30분" ──
function TimePick({ value = "", onChange, basis, onBasis, placeholder = "시간 선택", mixed = false }) {
  const v = String(value || "");
  const [ap, setAp] = React.useState(v.startsWith("오후") ? "오후" : v.startsWith("오전") ? "오전" : null);
  React.useEffect(() => { if (v.startsWith("오전")) setAp("오전"); else if (v.startsWith("오후")) setAp("오후"); else if (!v) setAp(null); }, [v]);
  const times = React.useMemo(() => {
    const l = [];
    for (let h = 0; h < 12; h += 1) { const hh = h === 0 ? 12 : h; l.push(`${ap ? `${ap} ` : ""}${hh}시`, `${ap ? `${ap} ` : ""}${hh}시 30분`); }
    return v && !l.includes(v) ? [v, ...l] : l; // 예전 값("09:00" 등)도 보이게
  }, [ap, v]);
  const pick = (a) => { setAp(a); if (v && /^(오전|오후)?\s*\d+시/.test(v)) onChange(`${a} ${v.replace(/^오전 |^오후 /, "")}`); };
  return (
    <div className="flex items-center gap-1 min-w-0">
      {["오전", "오후"].map((a) => <button key={a} type="button" onClick={() => pick(a)} className={chip(ap === a)}>{a}</button>)}
      <div className="flex-1 min-w-[96px]">
        <CustomSelect className={sel} value={mixed && !v ? KEEP : v} placeholder={placeholder} onChange={(e) => { if (e.target.value !== KEEP) onChange(e.target.value); }}>
          {mixed && <option value={KEEP}>여러 값 · 그대로 둠</option>}
          <option value="">- (비움)</option>
          {times.map((t) => <option key={t} value={t}>{t.replace(/^오전 |^오후 /, "")}</option>)}
        </CustomSelect>
      </div>
      {onBasis && v && ["이전", "이후"].map((b) => <button key={b} type="button" onClick={() => onBasis(basis === b ? "" : b)} className={chip(basis === b)}>{b}</button>)}
    </div>
  );
}

// ── 검색 드롭다운(오더등록 거래처 · 상하차지 칸과 같은 모양: 업체명 + 주소 · ↑↓ Enter Esc) ──
//  목록은 body에 띄운다(창 안 스크롤에 잘리지 않게)
function Combo({ value = "", onChange, onPick, search, render, placeholder = "", inputMode, mono = false }) {
  const [open, setOpen] = React.useState(false);
  const [act, setAct] = React.useState(0);
  const [q, setQ] = React.useState(null); // 입력 중인 글(고르기 전)
  const ref = React.useRef(null);
  const [rect, setRect] = React.useState(null);
  const text = q ?? value ?? "";
  const items = React.useMemo(() => (open && String(text).trim() ? search(String(text)) : []), [open, text, search]);
  React.useEffect(() => { setQ(null); }, [value]);
  React.useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => { const r = ref.current?.getBoundingClientRect(); if (r) setRect({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 260), up: window.innerHeight - r.bottom < 260 ? r.top - 4 : null }); };
    place();
    window.addEventListener("scroll", place, true); window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open]);
  const choose = (it) => { setOpen(false); setQ(null); onPick(it); };
  return (
    <>
      <input ref={ref} className={inp} style={mono ? NUM : undefined} value={text} placeholder={placeholder} autoComplete="off" inputMode={inputMode}
        onFocus={() => { setOpen(true); setAct(0); }}
        onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true); setAct(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!items.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setAct((i) => Math.min(i + 1, items.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAct((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); if (items[act]) choose(items[act]); }
          else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
        }} />
      {open && rect && items.length > 0 && createPortal(
        <div data-bec-menu className="fixed z-[100050] max-h-[260px] overflow-y-auto rounded-xl border border-[#C9D6EC] bg-white shadow-[0_18px_40px_rgba(15,26,48,0.22)] py-1"
          style={{ left: rect.left, width: rect.width, ...(rect.up != null ? { bottom: window.innerHeight - rect.up } : { top: rect.top }) }}
          onMouseDown={(e) => e.preventDefault()}>
          {items.map((it, i) => (
            <div key={i} onMouseEnter={() => setAct(i)} onMouseDown={() => choose(it)}
              className={`px-3 py-2 cursor-pointer ${i === act ? "bg-[#1B2B4B] text-white" : "hover:bg-[#F4F6FA]"}`}>
              {render(it, i === act)}
            </div>
          ))}
        </div>, document.body)}
    </>
  );
}

// 칸 하나 — 라벨 · 바뀜 표시 · 되돌리기 · 여러 값 표시
function Cell({ label, changed, mixed, onRevert, span = 1, children }) {
  return (
    <div className={`min-w-0 relative ${span === 2 ? "col-span-2" : span === 3 ? "col-span-full" : ""}`}>
      <div className="flex items-center gap-1.5 mb-1 h-[16px]">
        {changed && <span className="w-1.5 h-1.5 rounded-full bg-[#2D6BE0] shrink-0" />}
        <span className={`text-[11.5px] font-extrabold whitespace-nowrap truncate ${changed ? "text-[#2D4C82]" : "text-[#5B6B85]"}`}>{label}</span>
        {mixed && !changed && <span className="text-[10.5px] font-bold text-[#B07A12] whitespace-nowrap">여러 값</span>}
        {changed && onRevert && <button type="button" onClick={onRevert} className="ml-auto text-[11px] font-bold text-[#7A89A3] hover:text-[#0F1A30] whitespace-nowrap shrink-0">↺ 되돌리기</button>}
      </div>
      <div className={changed ? "[&_input]:!border-[#4B6CB7] [&_input]:!bg-[#F2F6FE] [&_textarea]:!border-[#4B6CB7] [&_textarea]:!bg-[#F2F6FE] [&_button[aria-haspopup]]:!border-[#4B6CB7]" : ""}>{children}</div>
    </div>
  );
}
function Section({ en, title, right, children }) {
  return (
    <section className="rounded-2xl border border-[#E3E8F0] bg-white">
      <header className="flex items-center gap-2 px-4 h-11 border-b border-[#EEF2F8]">
        <span className="text-[10px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={NUM}>{en}</span>
        <span className="text-[13.5px] font-black text-[#0F1A30] whitespace-nowrap">{title}</span>
        <div className="ml-auto flex items-center gap-1.5 min-w-0">{right}</div>
      </header>
      <div className="p-4 grid grid-cols-2 gap-x-3 gap-y-3">{children}</div>
    </section>
  );
}

export default function BulkEditCopyModal({
  rows = [], patchDispatch, onClose, onDateShift, onCopyOne, onLegacyEdit, upsertDriver,
  drivers = [], clients = [], places = [], tonOptions = [], vehicleTypes = [],
  isViewer = false, initialTab = "edit", toast,
}) {
  const [tab, setTab] = React.useState(initialTab);
  // 스크롤 잠금(뒤 화면이 같이 움직이지 않게) + Esc 닫기
  React.useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const k = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // 드롭다운·달력·확인창이 떠 있으면 그것만 닫히게(창 전체가 닫혀 고친 값이 날아가지 않게)
      if (document.querySelector(MENU_SEL)) return;
      onClose?.();
    };
    window.addEventListener("keydown", k);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", k); };
  }, [onClose]);

  const opts = React.useMemo(() => ({
    // 톤수 — 기본 톤수 + 넘겨받은 목록 + 우리 회사 기사·선택한 오더에 실제로 쓰인 톤수
    tons: (() => {
      const base = ["0.5톤", "1톤", "1.4톤", "2.5톤", "3.5톤", "5톤", "5톤축", "8톤", "9.5톤", "11톤", "14톤", "15톤", "18톤", "25톤"];
      const used = [...(drivers || []).map((d) => d?.차량톤수), ...(rows || []).map((r) => r?.차량톤수)].map((x) => String(x ?? "").trim()).filter((x) => x && x.length <= 12);
      const all = [...new Set([...base, ...(tonOptions || []), ...used].filter(Boolean))];
      const num = (t) => { const m = String(t).match(/[\d.]+/); return m ? parseFloat(m[0]) * (/kg/i.test(t) ? 0.001 : 1) : 999; };
      return all.sort((a, b) => num(a) - num(b) || String(a).localeCompare(String(b), "ko"));
    })(),
    vehicles: (vehicleTypes || []).filter(Boolean),
  }), [tonOptions, vehicleTypes, drivers, rows]);

  // 거래처 · 상하차지 목록 — 오더등록과 같은 기준(기본거래처가 먼저, 상하차지거래처는 이름이 없거나 여러 곳인 것만 보충)
  const lists = React.useMemo(() => {
    const nk = (s) => String(s || "").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
    const contactOf = (p) => {
      const cs = (Array.isArray(p.contacts) ? p.contacts : []).filter((c) => c && (String(c.name || "").trim() || String(c.phone || "").trim()));
      const pr = cs.find((c) => c.isPrimary) || cs[0];
      return { 담당자: pr?.name || p.담당자 || "", 담당자번호: pr?.phone || p.담당자번호 || p.연락처 || "" };
    };
    const cl = (clients || []).map((c) => { const name = c?.업체명 || c?.거래처명 || ""; return name ? { _id: c.id || c._id || "", 업체명: name, 주소: c.주소 || "", ...contactOf(c) } : null; }).filter(Boolean);
    const clientNames = new Set(cl.map((c) => nk(c.업체명)));
    const cnt = {}; (places || []).forEach((p) => { const k = nk(p?.업체명 || p?.name); if (k) cnt[k] = (cnt[k] || 0) + 1; });
    const seen = new Set(cl.map((c) => `${nk(c.업체명)}|${nk(c.주소)}`));
    const merged = [...cl];
    (places || []).forEach((p) => {
      const name = p?.업체명 || p?.name || ""; const k = nk(name);
      if (!k || (clientNames.has(k) && cnt[k] < 2)) return;
      const key = `${k}|${nk(p.주소)}`; if (seen.has(key)) return; seen.add(key);
      merged.push({ _id: p._id || p.id || "", 업체명: name, 주소: p.주소 || "", ...contactOf(p) });
    });
    return { clients: cl, places: merged };
  }, [clients, places]);

  return (
    <div className="fixed inset-0 z-[99990] bg-[#0B1428]/60 backdrop-blur-[2px] flex items-center justify-center p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="w-[min(1480px,98vw)] h-[94vh] bg-[#F4F6FA] rounded-[22px] shadow-[0_30px_80px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden" data-bulk-edit-copy>
        <div className="px-5 h-[60px] text-white shrink-0 flex items-center gap-4" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold tracking-[0.28em] text-[#8FB0F0]" style={NUM}>BULK · EDIT &amp; COPY</div>
            <div className="text-[16px] font-black leading-tight whitespace-nowrap">선택 오더 <span style={NUM}>{rows.length}</span>건</div>
          </div>
          <div className="inline-flex p-1 rounded-xl bg-white/10 border border-white/15 shrink-0">
            {[["edit", "일괄수정"], ["copy", "일괄복사"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`h-8 px-5 rounded-lg text-[13.5px] font-black whitespace-nowrap transition ${tab === k ? "bg-white text-[#0F1A30]" : "text-white/75 hover:text-white"}`}>{l}</button>
            ))}
          </div>
          <div className="flex-1" />
          <button type="button" onClick={onClose} aria-label="닫기" className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 text-[15px] font-bold hover:bg-white/20 shrink-0">✕</button>
        </div>
        {tab === "edit"
          ? <EditTab rows={rows} opts={opts} lists={lists} drivers={drivers} patchDispatch={patchDispatch} upsertDriver={upsertDriver} onClose={onClose} onDateShift={onDateShift} onLegacyEdit={onLegacyEdit} isViewer={isViewer} toast={toast} />
          : <CopyTab rows={rows} onCopyOne={onCopyOne} onClose={onClose} isViewer={isViewer} toast={toast} />}
      </div>
    </div>
  );
}

// ─────────────────────────── 일괄수정 ───────────────────────────
function EditTab({ rows, opts, lists, drivers, patchDispatch, upsertDriver, onClose, onDateShift, onLegacyEdit, isViewer, toast }) {
  const orig = React.useMemo(() => Object.fromEntries(rows.map((r) => [idOf(r), Object.fromEntries(KEYS.map((k) => [k, r[k] ?? (BOOL.has(k) ? false : "")]))])), [rows]);
  const [edited, setEdited] = React.useState(orig);
  const [checked, setChecked] = React.useState(() => new Set(rows.map(idOf)));
  const [target, setTarget] = React.useState(rows.length > 1 ? "all" : idOf(rows[0])); // "all" = 체크한 오더 한꺼번에
  const [busy, setBusy] = React.useState(false);
  const [smart, setSmart] = React.useState("");
  const [smartAct, setSmartAct] = React.useState(-1);
  const ids = target === "all" ? [...checked] : [target];
  const one = target !== "all" ? rows.find((r) => idOf(r) === target) : null;

  // 지금 고치는 오더들의 값(여러 건이면 모두 같을 때만 값, 다르면 "여러 값")
  const view = React.useMemo(() => {
    const out = {};
    KEYS.forEach((k) => {
      const vals = ids.map((id) => edited[id]?.[k]);
      const first = vals[0];
      const mixed = vals.some((v) => !sameVal(k, v, first));
      const changed = ids.some((id) => !sameVal(k, orig[id]?.[k], edited[id]?.[k]));
      out[k] = { v: mixed ? (BOOL.has(k) ? false : "") : (first ?? ""), mixed, changed };
    });
    return out;
  }, [edited, ids.join("|"), orig]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMany = (patch) => setEdited((p) => {
    const n = { ...p };
    ids.forEach((id) => { n[id] = { ...n[id], ...patch }; });
    return n;
  });
  const set = (k) => (v) => setMany({ [k]: v });
  const revert = (...ks) => () => setEdited((p) => {
    const n = { ...p };
    ids.forEach((id) => { n[id] = { ...n[id], ...Object.fromEntries(ks.map((k) => [k, orig[id][k]])) }; });
    return n;
  });
  const cellProps = (k, label, extra = []) => ({ label: label ?? LABEL[k] ?? k, changed: [k, ...extra].some((x) => view[x].changed), mixed: view[k].mixed, onRevert: revert(k, ...extra) });

  // 거래처 · 상하차지
  const searchClients = React.useCallback((q) => placeSearch(lists.clients, q).slice(0, 40), [lists.clients]);
  const searchPlaces = React.useCallback((q) => placeSearch(lists.places, q).slice(0, 60), [lists.places]);
  const renderPlace = (p, on) => (<><div className="text-[13px] font-bold truncate">{p.업체명}</div>{p.주소 && <div className={`text-[11px] truncate ${on ? "text-white/70" : "text-[#7A89A3]"}`}>{p.주소}</div>}</>);
  const pickPlace = (side) => (p) => setMany({ [`${side}명`]: p.업체명, [`${side}Id`]: p._id || "", [`${side}주소`]: p.주소 || "", [`${side}담당자`]: p.담당자 || "", [`${side}담당자번호`]: fmtTel(p.담당자번호 || "") });

  // 기사 — 스마트검색 · 차량번호 검색
  const driverPatch = (d) => ({ 차량번호: d.차량번호 || "", 이름: d.이름 || "", 전화번호: fmtTel(d.전화번호 || ""), ...(d.차량종류 && !view.차량종류.v ? { 차량종류: d.차량종류 } : {}), ...(d.차량톤수 && !view.차량톤수.v ? { 차량톤수: d.차량톤수 } : {}) });
  const smartList = React.useMemo(() => matchDrivers(drivers, smart), [drivers, smart]);
  const applySmart = (d) => {
    if (d) setMany(driverPatch(d));
    else {
      const p = parseDriverText(smart);
      if (!p.plate && !p.name && !p.phone) return;
      const hit = p.plate ? (drivers || []).find((x) => plateKey(x.차량번호) === plateKey(p.plate) && (!p.name || x.이름 === p.name)) || (drivers || []).find((x) => plateKey(x.차량번호) === plateKey(p.plate)) : null;
      setMany({ 차량번호: p.plate || hit?.차량번호 || view.차량번호.v, 이름: p.name || hit?.이름 || "", 전화번호: p.phone || fmtTel(hit?.전화번호 || "") });
    }
    setSmart(""); setSmartAct(-1);
  };
  const searchPlates = React.useCallback((q) => matchDrivers(drivers, q), [drivers]);
  const onPlateType = (v) => {
    const d = (drivers || []).find((x) => plateKey(x.차량번호) === plateKey(v) && plateKey(v).length >= 7);
    setMany(d ? driverPatch(d) : { 차량번호: v });
  };
  const curDriver = view.차량번호.v ? (drivers || []).find((x) => plateKey(x.차량번호) === plateKey(view.차량번호.v)) : null;
  const isNewDriver = !!view.차량번호.v && !!view.이름.v && !curDriver;
  const black = curDriver && (curDriver.등급 === "블랙" || curDriver.grade === "블랙");

  const fee = (() => { const a = Number(digits(view.청구운임.v)) || 0, b = Number(digits(view.기사운임.v)) || 0; return view.청구운임.mixed || view.기사운임.mixed || (!a && !b) ? null : a - b; })();

  // 저장
  const changes = rows.map((r) => [r, diffOf(orig[idOf(r)], edited[idOf(r)])]).filter(([, c]) => Object.keys(c).length);
  const nCells = changes.reduce((s, [, c]) => s + Object.keys(c).filter((k) => LABEL[k] !== "" && k !== "독차").length, 0);
  const save = async () => {
    if (isViewer) return;
    const bad = changes.find(([r, c]) => { const p = c.상차일 ?? r.상차일, d = c.하차일 ?? r.하차일; return p && d && d < p; });
    if (bad) { window.alert(`하차일이 상차일보다 빠른 오더가 있어요: ${bad[0].거래처명 || ""}`); return; }
    setBusy(true);
    let ok = 0, skipped = 0;
    const newDrivers = new Map();
    try {
      await runBulkTask({ count: changes.length, label: "오더", verb: "수정", task: async (progress) => {
      for (const [r, c] of changes) {
        progress(ok + skipped);
        const patch = { ...c };
        // 기사 정보가 새로 들어가면 배차완료로(patchDispatch가 배차확정일시·기사 알림을 처리) — 오더등록 스마트검색과 같게
        if ("차량번호" in c && String(c.차량번호 || "").trim() && !String(r.차량번호 || "").trim() && (r.배차상태 || "배차중") === "배차중") patch.배차상태 = "배차완료";
        if ("지급방식" in c) Object.assign(patch, payTypeStatusPatch({ ...r, ...patch }, c.지급방식));
        const res = await patchDispatch(idOf(r), patch, r);
        if (res === false) { skipped += 1; continue; } // 휴차 보류·운송완료 기사취소 확인에서 취소
        ok += 1;
        const cur = edited[idOf(r)];
        if (("차량번호" in c || "이름" in c) && cur.차량번호 && cur.이름 && !(drivers || []).some((x) => plateKey(x.차량번호) === plateKey(cur.차량번호))) newDrivers.set(plateKey(cur.차량번호), cur);
      }
      } });
      // 새 기사 → 기사관리에 등록(오더등록과 같게)
      let nd = 0;
      if (upsertDriver) for (const d of newDrivers.values()) { try { await upsertDriver({ 차량번호: d.차량번호, 이름: d.이름, 전화번호: telDigits(d.전화번호) ? fmtTel(d.전화번호) : "" }); nd += 1; } catch { /* 등록 실패해도 오더는 저장됨 */ } }
      toast?.(`${ok}건 수정했어요${skipped ? ` · ${skipped}건은 취소됨` : ""}${nd ? ` · 새 기사 ${nd}명 기사관리에 등록` : ""}`, "success");
      onClose?.();
    } catch (e) {
      // 앞에서 저장된 건수를 알려 줘야 다시 눌러 중복 수정하지 않는다
      window.alert(`${ok ? `${ok}건은 저장됐고, ` : ""}${ok + skipped + 1}번째 오더 저장 중 오류: ${e?.message || e}`);
      if (ok) onClose?.();
    } finally { setBusy(false); }
  };

  const allOn = checked.size === rows.length;
  const toggle = (id) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const changedCount = (id) => Object.keys(diffOf(orig[id], edited[id])).filter((k) => LABEL[k] !== "" && k !== "독차").length;
  const noTarget = target === "all" && !checked.size;

  return (
    <>
      <div className="flex-1 min-h-0 flex">
        {/* 왼쪽 — 고른 오더 */}
        <aside className="w-[300px] shrink-0 border-r border-[#E3E8F0] bg-white flex flex-col min-h-0">
          <div className="px-3 pt-3 pb-2 shrink-0">
            <button type="button" onClick={() => setTarget("all")}
              className={`w-full text-left rounded-xl px-3 py-2.5 border transition ${target === "all" ? "bg-[#0F1A30] border-[#0F1A30] text-white" : "bg-[#F4F6FA] border-[#E3E8F0] text-[#0F1A30] hover:border-[#4B6CB7]"}`}>
              <div className="text-[13.5px] font-black whitespace-nowrap">체크한 오더 한꺼번에</div>
              <div className={`text-[11.5px] font-semibold ${target === "all" ? "text-white/70" : "text-[#7A89A3]"}`}>체크한 <b style={NUM}>{checked.size}</b>건에 같은 값을 넣어요</div>
            </button>
            <label className="mt-2 flex items-center gap-2 px-1 text-[12px] font-bold text-[#5B6B85] cursor-pointer whitespace-nowrap">
              <input type="checkbox" className="w-4 h-4 accent-[#1B2B4B]" checked={allOn} onChange={() => setChecked(allOn ? new Set() : new Set(rows.map(idOf)))} /> 전체 체크
              <span className="ml-auto text-[11px] font-semibold text-[#9AA9C3]">눌러서 한 건씩 고치기</span>
            </label>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-1.5 overscroll-contain">
            {rows.map((r, i) => {
              const id = idOf(r); const cur = edited[id] || {}; const n = changedCount(id); const on = target === id;
              return (
                <div key={id} onClick={() => setTarget(id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setTarget(id); }}
                  className={`rounded-xl border px-2.5 py-2 cursor-pointer transition ${on ? "border-[#2D4C82] bg-[#EEF3FC] ring-2 ring-[#4B6CB7]/20" : target === "all" && checked.has(id) ? "border-[#C9D6EC] bg-white" : "border-[#E3E8F0] bg-white hover:border-[#C9D6EC]"} ${!checked.has(id) && target === "all" ? "opacity-55" : ""}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <input type="checkbox" className="w-4 h-4 accent-[#1B2B4B] shrink-0" checked={checked.has(id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(id)} />
                    <span className="w-5 h-5 rounded-md bg-[#0F1A30] text-white text-[10.5px] font-black grid place-items-center shrink-0" style={NUM}>{i + 1}</span>
                    <span className="text-[13px] font-black text-[#0F1A30] truncate">{cur.거래처명 || "-"}</span>
                    {n > 0 && <span className="ml-auto shrink-0 h-5 px-1.5 rounded-md bg-[#2D6BE0] text-white text-[10.5px] font-black grid place-items-center whitespace-nowrap" style={NUM}>{n}칸</span>}
                  </div>
                  <div className="mt-1 pl-[52px] text-[11.5px] font-semibold text-[#5B6B85] truncate" title={`${cur.상차지명 || ""} → ${cur.하차지명 || ""}`}>{cur.상차지명 || "-"} → {cur.하차지명 || "-"}</div>
                  <div className="pl-[52px] flex items-center gap-1.5 text-[11px] font-semibold text-[#9AA9C3] min-w-0" style={NUM}>
                    <span className="whitespace-nowrap">{fmtMD(cur.상차일)}{cur.상차시간 ? ` ${cur.상차시간}` : ""}</span>
                    <span className="truncate">{cur.차량번호 ? `· ${cur.차량번호} ${cur.이름 || ""}` : "· 미배차"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* 오른쪽 — 입력 카드(오더등록 순서) */}
        <div className="flex-1 min-w-0 overflow-y-auto overscroll-contain">
          <div className="sticky top-0 z-10 px-5 py-2.5 bg-[#F4F6FA]/95 backdrop-blur border-b border-[#E3E8F0] flex items-center gap-2 min-w-0">
            <span className={`h-6 px-2 rounded-md text-[11.5px] font-black grid place-items-center whitespace-nowrap ${target === "all" ? "bg-[#0F1A30] text-white" : "bg-[#2D4C82] text-white"}`}>{target === "all" ? `한꺼번에 · ${checked.size}건` : "이 오더만"}</span>
            <span className="text-[13px] font-bold text-[#0F1A30] truncate min-w-0">
              {target === "all" ? "값을 넣은 칸만 체크한 오더 모두 바뀌어요. 서로 다른 칸은 ‘여러 값’으로 보이고, 손대지 않으면 그대로예요." : `${one?.거래처명 || "-"} · ${one?.상차지명 || ""} → ${one?.하차지명 || ""}`}
            </span>
          </div>
          {noTarget ? (
            <div className="p-10 text-center text-[14px] font-bold text-[#7A89A3]">왼쪽에서 고칠 오더를 체크하거나, 오더 하나를 눌러 주세요.</div>
          ) : (
            <div className="p-5 grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
              <Section en="SCHEDULE" title="상하차 일정">
                <Cell {...cellProps("상차일", "상차일")}>
                  <CustomDatePicker value={view.상차일.v} placeholder={view.상차일.mixed ? "여러 값 · 그대로 둠" : "날짜 선택"} showIcon onChange={(e) => set("상차일")(e.target.value)} className={`${inp} text-left`} openOnFocus={false} />
                </Cell>
                <Cell label="빠른 날짜">
                  <div className="flex gap-1">{[["당일", kstToday()], ["내일", addDays(kstToday(), 1)], ["월상", nextMonday()]].map(([l, d]) => <button key={l} type="button" onClick={() => set("상차일")(d)} className={chip(view.상차일.v === d)}>{l}</button>)}</div>
                </Cell>
                <Cell {...cellProps("상차시간", "상차시간", ["상차시간기준"])} span={2}>
                  <TimePick value={view.상차시간.v} mixed={view.상차시간.mixed} onChange={set("상차시간")} basis={view.상차시간기준.v} onBasis={set("상차시간기준")} />
                </Cell>
                <Cell {...cellProps("하차일", "하차일")}>
                  <CustomDatePicker value={view.하차일.v} placeholder={view.하차일.mixed ? "여러 값 · 그대로 둠" : "날짜 선택"} showIcon onChange={(e) => set("하차일")(e.target.value)} className={`${inp} text-left`} openOnFocus={false} />
                </Cell>
                <Cell label="빠른 날짜">
                  <div className="flex gap-1">{[["당일", kstToday()], ["내일", addDays(kstToday(), 1)], ["월착", nextMonday()]].map(([l, d]) => <button key={l} type="button" onClick={() => set("하차일")(d)} className={chip(view.하차일.v === d)}>{l}</button>)}</div>
                </Cell>
                <Cell {...cellProps("하차시간", "하차시간", ["하차시간기준"])} span={2}>
                  <TimePick value={view.하차시간.v} mixed={view.하차시간.mixed} onChange={set("하차시간")} basis={view.하차시간기준.v} onBasis={set("하차시간기준")} />
                </Cell>
              </Section>

              <Section en="CLIENT" title="거래처">
                <Cell {...cellProps("거래처명", "거래처명")} span={2}>
                  <Combo value={view.거래처명.v} placeholder={view.거래처명.mixed ? "여러 값 · 그대로 둠" : "거래처 검색/입력"} onChange={set("거래처명")} onPick={(p) => set("거래처명")(p.업체명)} search={searchClients} render={renderPlace} />
                </Cell>
                <Cell {...cellProps("화물내용", "화물내용")} span={2}>
                  <input className={inp} value={view.화물내용.v} placeholder={view.화물내용.mixed ? "여러 값 · 그대로 둠" : "예: 2파레트"} onChange={(e) => set("화물내용")(e.target.value)} autoComplete="off" />
                </Cell>
                <Cell {...cellProps("차량종류", "차량종류")}>
                  <CustomSelect className={sel} value={view.차량종류.mixed ? KEEP : view.차량종류.v} placeholder="선택" onChange={(e) => { if (e.target.value !== KEEP) set("차량종류")(e.target.value); }}>
                    {view.차량종류.mixed && <option value={KEEP}>여러 값 · 그대로 둠</option>}
                    <option value="">- (비움)</option>
                    {(view.차량종류.v && !opts.vehicles.includes(view.차량종류.v) ? [view.차량종류.v, ...opts.vehicles] : opts.vehicles).map((o) => <option key={o} value={o}>{o}</option>)}
                  </CustomSelect>
                </Cell>
                <Cell {...cellProps("차량톤수", "톤수")}>
                  <CustomSelect className={sel} value={view.차량톤수.mixed ? KEEP : view.차량톤수.v} placeholder="선택" onChange={(e) => { if (e.target.value !== KEEP) set("차량톤수")(e.target.value); }}>
                    {view.차량톤수.mixed && <option value={KEEP}>여러 값 · 그대로 둠</option>}
                    <option value="">- (비움)</option>
                    {(view.차량톤수.v && !opts.tons.includes(view.차량톤수.v) ? [view.차량톤수.v, ...opts.tons] : opts.tons).map((o) => <option key={o} value={o}>{o}</option>)}
                  </CustomSelect>
                </Cell>
                <Cell {...cellProps("혼적", "운행", ["긴급"])} span={2}>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => set("혼적")(!view.혼적.v)} className={chip(!!view.혼적.v)}>{view.혼적.v ? "● " : ""}혼적</button>
                    <button type="button" onClick={() => set("긴급")(!view.긴급.v)} className={chip(!!view.긴급.v)}>{view.긴급.v ? "● " : ""}긴급</button>
                    {(view.혼적.mixed || view.긴급.mixed) && <span className="self-center text-[11px] font-bold text-[#B07A12] whitespace-nowrap">오더마다 달라요 · 누르면 모두 같게</span>}
                  </div>
                </Cell>
              </Section>

              {["상차지", "하차지"].map((side) => (
                <Section key={side} en={side === "상차지" ? "PICKUP" : "DROP"} title={side}
                  right={(view[`${side}명`].changed || view[`${side}주소`].changed) && <button type="button" onClick={revert(`${side}명`, `${side}Id`, `${side}주소`, `${side}담당자`, `${side}담당자번호`)} className="text-[11.5px] font-bold text-[#7A89A3] hover:text-[#0F1A30] whitespace-nowrap">↺ {side} 전체 되돌리기</button>}>
                  <Cell {...cellProps(`${side}명`, `${side}명`)} span={2}>
                    <Combo value={view[`${side}명`].v} placeholder={view[`${side}명`].mixed ? "여러 값 · 그대로 둠" : `${side} 검색: 고르면 주소 · 담당자까지`} onChange={set(`${side}명`)} onPick={pickPlace(side)} search={searchPlaces} render={renderPlace} />
                  </Cell>
                  <Cell {...cellProps(`${side}주소`, "주소")} span={2}>
                    <input className={inp} value={view[`${side}주소`].v} placeholder={view[`${side}주소`].mixed ? "여러 값 · 그대로 둠" : "주소"} onChange={(e) => set(`${side}주소`)(e.target.value)} autoComplete="off" />
                  </Cell>
                  <Cell {...cellProps(`${side}담당자`, "담당자")}>
                    <input className={inp} value={view[`${side}담당자`].v} placeholder={view[`${side}담당자`].mixed ? "여러 값" : "담당자"} onChange={(e) => set(`${side}담당자`)(e.target.value)} autoComplete="off" />
                  </Cell>
                  <Cell {...cellProps(`${side}담당자번호`, "연락처")}>
                    <input className={inp} style={NUM} value={view[`${side}담당자번호`].v} placeholder={view[`${side}담당자번호`].mixed ? "여러 값" : "010-0000-0000"} onChange={(e) => set(`${side}담당자번호`)(e.target.value)} onBlur={(e) => { const f = fmtTel(e.target.value); if (f !== e.target.value) set(`${side}담당자번호`)(f); }} autoComplete="off" />
                  </Cell>
                  <Cell {...cellProps(side === "상차지" ? "상차방법" : "하차방법", side === "상차지" ? "상차방법" : "하차방법")} span={2}>
                    <CompanyOptionPicker optKey="상하차방법" title={side === "상차지" ? "상차방법" : "하차방법"} placeholder={view[side === "상차지" ? "상차방법" : "하차방법"].mixed ? "여러 값" : "선택"} noneLabel="- (비움)" className={`${sel}`} value={view[side === "상차지" ? "상차방법" : "하차방법"].v} onChange={set(side === "상차지" ? "상차방법" : "하차방법")} />
                  </Cell>
                </Section>
              ))}

              <Section en="DRIVER" title="기사 배차"
                right={(view.차량번호.v || view.이름.v) && <button type="button" onClick={() => setMany({ 차량번호: "", 이름: "", 전화번호: "" })} className="text-[11.5px] font-bold text-[#9A1F15] hover:underline whitespace-nowrap">기사 비우기(배차중)</button>}>
                <Cell label="스마트검색" span={2}>
                  <div className="relative">
                    <textarea rows={2} value={smart} placeholder="기사 이름 · 차량번호 · 전화번호, 또는 기사에게 받은 문자를 붙여넣고 Enter"
                      className="w-full rounded-[10px] border border-[#CFD8E6] bg-[#F7F9FC] px-3 py-2 text-[13px] font-bold text-[#0F1A30] resize-none placeholder:text-[#A7B3C6] placeholder:font-medium focus:outline-none focus:bg-white focus:border-[#4B6CB7] focus:ring-2 focus:ring-[#4B6CB7]/15"
                      onChange={(e) => { setSmart(e.target.value); setSmartAct(-1); }}
                      onKeyDown={(e) => {
                        if (smartList.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); setSmartAct((i) => (e.key === "ArrowDown" ? (i + 1) % smartList.length : (i <= 0 ? smartList.length - 1 : i - 1))); return; }
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); applySmart(smartAct >= 0 ? smartList[smartAct] : smartList.length === 1 ? smartList[0] : null); return; }
                        if (e.key === "Escape" && smart) { e.preventDefault(); setSmart(""); }
                      }} />
                    {smartList.length > 0 && (
                      <div data-bec-menu className="absolute z-20 left-0 right-0 mt-1 rounded-xl border-2 border-[#1B2B4B] bg-white shadow-2xl overflow-hidden">
                        <div className="px-3 py-1.5 bg-[#1B2B4B] text-white text-[11px] font-bold">등록된 기사 {smartList.length}명: 눌러서 넣기</div>
                        {smartList.map((d, i) => (
                          <div key={d.id || `${d.차량번호}${i}`} onMouseEnter={() => setSmartAct(i)} onMouseDown={(e) => { e.preventDefault(); applySmart(d); }}
                            className={`px-3 py-2 cursor-pointer flex items-center gap-2 border-b border-[#EEF2F8] last:border-0 ${i === smartAct ? "bg-[#EEF3FC]" : "hover:bg-[#F7F9FC]"}`}>
                            <span className="text-[13.5px] font-black text-[#0F1A30] whitespace-nowrap">{d.이름 || "-"}</span>
                            <span className="text-[12px] font-semibold text-[#5B6B85] truncate" style={NUM}>{d.차량번호} · {fmtTel(d.전화번호)}{d.차량톤수 ? ` · ${d.차량톤수}` : ""}{d.차량종류 ? ` ${d.차량종류}` : ""}</span>
                            {d.등급 === "블랙" && <span className="ml-auto px-2 h-5 rounded-full bg-[#0F1A30] text-white text-[10px] font-black grid place-items-center">블랙</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Cell>
                <Cell {...cellProps("차량번호", "차량번호")}>
                  <Combo value={view.차량번호.v} mono placeholder={view.차량번호.mixed ? "여러 값" : "차량번호"} onChange={onPlateType} onPick={(d) => setMany(driverPatch(d))} search={searchPlates}
                    render={(d, on) => (<div className="flex items-center gap-2 min-w-0"><b className="text-[13px] whitespace-nowrap" style={NUM}>{d.차량번호}</b><span className={`text-[12px] truncate ${on ? "text-white/80" : "text-[#5B6B85]"}`}>{d.이름 || ""} {fmtTel(d.전화번호)}</span></div>)} />
                </Cell>
                <Cell {...cellProps("이름", "기사명")}>
                  <input className={inp} value={view.이름.v} placeholder={view.이름.mixed ? "여러 값" : "기사명"} onChange={(e) => set("이름")(e.target.value)} autoComplete="off" />
                </Cell>
                <Cell {...cellProps("전화번호", "전화번호")}>
                  <input className={inp} style={NUM} value={view.전화번호.v} placeholder={view.전화번호.mixed ? "여러 값" : "010-0000-0000"} onChange={(e) => set("전화번호")(e.target.value)} onBlur={(e) => { const f = fmtTel(e.target.value); if (f !== e.target.value) set("전화번호")(f); }} autoComplete="off" />
                </Cell>
                <div className="min-w-0 self-end pb-2 text-[11.5px] font-bold leading-snug">
                  {black ? <span className="text-[#9A1F15]">⚠ 블랙 기사예요. 한 번 더 확인해 주세요.</span>
                    : isNewDriver ? <span className="text-[#2D6BE0]">NEW 기사관리에 없는 기사: 저장하면 자동 등록돼요</span>
                      : curDriver ? <span className="text-[#5B6B85]">기사관리 등록 기사</span> : null}
                </div>
              </Section>

              <Section en="FARE" title="운임 · 결제">
                <Cell {...cellProps("청구운임", "청구운임")}>
                  <input className={`${inp} text-right`} style={NUM} inputMode="numeric" value={money(view.청구운임.v)} placeholder={view.청구운임.mixed ? "여러 값" : "0"} onChange={(e) => set("청구운임")(digits(e.target.value))} />
                </Cell>
                <Cell {...cellProps("기사운임", "기사운임")}>
                  <input className={`${inp} text-right`} style={NUM} inputMode="numeric" value={money(view.기사운임.v)} placeholder={view.기사운임.mixed ? "여러 값" : "0"} onChange={(e) => set("기사운임")(digits(e.target.value))} />
                </Cell>
                <div className="col-span-2 -mt-1 flex items-center justify-end gap-1.5 text-[12px] font-bold text-[#5B6B85] whitespace-nowrap" style={NUM}>
                  수수료 <b className={fee == null ? "text-[#A7B3C6]" : fee < 0 ? "text-[#B4342A]" : "text-[#0F1A30]"}>{fee == null ? "-" : `${fee.toLocaleString()}원`}</b>
                  <span className="text-[11px] font-semibold text-[#9AA9C3]">(청구 − 기사, 저장하면 자동 계산)</span>
                </div>
                <Cell {...cellProps("지급방식", "지급방식")}>
                  <CompanyOptionPicker optKey="지급방식" placeholder={view.지급방식.mixed ? "여러 값" : "선택"} noneLabel="- (비움)" className={sel} value={view.지급방식.v} onChange={set("지급방식")} />
                </Cell>
                <Cell {...cellProps("배차방식", "배차방식", ["콜구분", "콜플랫폼"])}>
                  <DispatchWayPicker scope={[view.거래처명.v, view.상차지명.v, view.하차지명.v]} placeholder={view.배차방식.mixed ? "여러 값" : "선택"} noneLabel="- (비움)" className={sel} value={view.배차방식.v} dir={view.콜구분.v || ""}
                    onPick={(pk) => setMany({ 배차방식: pk.배차방식 ?? "", ...(pk.콜구분 !== undefined ? { 콜구분: pk.콜구분, 콜플랫폼: pk.콜플랫폼 || "" } : {}) })} />
                </Cell>
              </Section>

              <Section en="MEMO" title="메모 · 전달사항">
                <Cell {...cellProps("메모", "메모")} span={2}>
                  <textarea rows={3} className={`${inp} h-auto py-2 resize-none`} value={view.메모.v} placeholder={view.메모.mixed ? "여러 값 · 그대로 둠" : "오더 메모"} onChange={(e) => set("메모")(e.target.value)} />
                </Cell>
                <Cell {...cellProps("전달사항", "전달사항(기사님께)")} span={2}>
                  <textarea rows={3} className={`${inp} h-auto py-2 resize-none`} value={view.전달사항.v} placeholder={view.전달사항.mixed ? "여러 값 · 그대로 둠" : "운송 기사님께 전달할 내용"} onChange={(e) => set("전달사항")(e.target.value)} />
                </Cell>
              </Section>
            </div>
          )}
        </div>
      </div>
      <div className="px-5 py-3 bg-white border-t border-[#E3E8F0] flex items-center gap-2 shrink-0 min-w-0">
        {onDateShift && <button type="button" onClick={onDateShift} className="h-10 px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[12.5px] font-bold text-[#1B2B4B] whitespace-nowrap shrink-0">날짜 일괄 이동</button>}
        {onLegacyEdit && <button type="button" onClick={onLegacyEdit} className="h-10 px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[12.5px] font-bold text-[#1B2B4B] whitespace-nowrap shrink-0" title="운임구분(수수료율) 계산은 예전 일괄수정 화면에서 해요">운임구분 계산</button>}
        <div className="flex-1 min-w-0 text-right text-[13px] font-bold text-[#5B6B85] truncate">바뀐 오더 <b className="text-[#0F1A30]" style={NUM}>{changes.length}</b>건 · 칸 <b className="text-[#0F1A30]" style={NUM}>{nCells}</b>개</div>
        <button type="button" onClick={onClose} className="h-11 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#1B2B4B] whitespace-nowrap shrink-0">취소</button>
        <button type="button" onClick={save} disabled={busy || isViewer || !changes.length} className="h-11 px-7 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-40 whitespace-nowrap shrink-0">{busy ? "저장 중…" : `저장 · ${changes.length}건`}</button>
      </div>
    </>
  );
}

// ─────────────────────────── 일괄복사 ───────────────────────────
function CopyTab({ rows, onCopyOne, onClose, isViewer, toast }) {
  const today = kstToday();
  const [keepGap, setKeepGap] = React.useState(true);
  const [keepDriver, setKeepDriver] = React.useState(false);
  const [plans, setPlans] = React.useState(() => rows.map((r) => {
    const gap = dayGap(r.상차일, r.하차일);
    // 🛠 2026-11-27 기본 날짜 = 원본 상차일 다음 날(원본이 지난 날짜면 내일) — 예전엔 늘 '내일'이라 내일 오더를 복사하면 같은 날 중복 오더가 생기기 쉬웠다
    const base = r.상차일 && r.상차일 >= today ? r.상차일 : today;
    const p = addDays(base, 1);
    return { id: idOf(r), 상차일: p, 하차일: addDays(p, gap), gap, 상차시간: r.상차시간 || "", 상차시간기준: r.상차시간기준 || "", 하차시간: r.하차시간 || "", 하차시간기준: r.하차시간기준 || "", count: 1, weekdaysOnly: false, on: true };
  }));
  const [busy, setBusy] = React.useState(null); // { done, total }
  // 👤 배차담당자 — 처음엔 원본 담당자 · 오더마다(또는 전체) 바꿀 수 있다
  const [staff, setStaff] = React.useState([]);
  React.useEffect(() => subscribeUsersLive((list) => setStaff(staffOptionsOf(list))), []);
  const origOwners = React.useMemo(() => rows.map((r) => matchOwner(ownerOfOrder(r), staff)), [rows, staff]);
  const [owners, setOwners] = React.useState({}); // { 줄번호: key } — 안 바꾼 줄은 원본
  const ownerOptsOf = (i) => { const o = origOwners[i]; return o && o.orig ? [o, ...staff] : staff; };
  const ownerKeyOf = (i) => owners[i] ?? origOwners[i]?.key ?? "";
  const ownerOf = (i) => ownerOptsOf(i).find((s) => s.key === ownerKeyOf(i)) || null;
  const setPlan = (i, patch) => setPlans((ps) => ps.map((p, k) => {
    if (k !== i) return p;
    const n = { ...p, ...patch };
    if ("상차일" in patch && keepGap) n.하차일 = addDays(n.상차일, n.gap);
    if ("하차일" in patch && !keepGap) n.gap = dayGap(n.상차일, n.하차일);
    return n;
  }));
  const quick = (base) => [["오늘", today], ["내일", addDays(today, 1)], ["모레", addDays(today, 2)], ["다음 주 같은 요일", addDays(base || today, 7)]];
  const applyFirst = () => {
    const f = plans[0]; if (!f) return;
    setPlans((ps) => ps.map((p, i) => (i === 0 ? p : { ...p, 상차일: f.상차일, 하차일: keepGap ? addDays(f.상차일, p.gap) : f.하차일, count: f.count, weekdaysOnly: f.weekdaysOnly })));
  };
  const shiftAll = (n) => setPlans((ps) => ps.map((p) => ({ ...p, 상차일: addDays(p.상차일, n), 하차일: addDays(p.하차일, n) })));
  const expanded = plans.flatMap((p, i) => (p.on ? copyDatesOf({ ...p, keepGap }).map((d) => ({ i, ...d })) : []));
  const past = expanded.find((d) => d.상차일 < today);
  const reversed = expanded.find((d) => d.하차일 < d.상차일);
  const run = async () => {
    if (isViewer || !expanded.length) return;
    if (past) { window.alert("오늘보다 이전 날짜로는 복사할 수 없어요. 날짜를 확인해 주세요."); return; }
    if (reversed) { window.alert("하차일이 상차일보다 빠른 복사본이 있어요."); return; }
    if (!(await kpConfirm(`총 ${expanded.length}건을 새 오더로 등록할까요?`, { title: "일괄복사", okText: "복사 등록" }))) return; // 🛠 2026-11-27 브라우저 기본 창 → 프로그램 확인창
    setBusy({ done: 0, total: expanded.length });
    let ok = 0;
    try {
      await runBulkTask({ count: expanded.length, label: "오더", verb: "복사 등록", task: async (progress) => {
      for (const d of expanded) {
        const src = rows[d.i]; const p = plans[d.i];
        const order = { ...src, 상차일: d.상차일, 하차일: d.하차일, 상차시간: p.상차시간, 상차시간기준: p.상차시간기준 || null, 하차시간: p.하차시간, 하차시간기준: p.하차시간기준 || null };
        if (!keepDriver) { order.차량번호 = ""; order.이름 = ""; order.전화번호 = ""; order.기사확인상태 = null; }
        const ow = ownerOf(d.i); if (ow && !ow.orig) order._owner = ow;
        const res = await onCopyOne(order);
        if (res === false) break;
        ok += 1; setBusy({ done: ok, total: expanded.length }); progress(ok);
      }
      } });
      if (ok) toast?.(`${ok}건 복사 등록했어요${ok < expanded.length ? ` (${expanded.length - ok}건은 등록 안 됨)` : ""}`, "success");
      if (ok === expanded.length) onClose?.();
    } catch (e) {
      window.alert(`${ok ? `${ok}건은 등록됐고, ` : ""}복사 중 오류: ${e?.message || e}\n같은 오더가 겹치지 않게 배차현황에서 확인 후 남은 건만 다시 복사해 주세요.`);
      if (ok) onClose?.();
    } finally { setBusy(null); }
  };
  const lab = "block text-[11.5px] font-extrabold text-[#5B6B85] mb-1 whitespace-nowrap";
  return (
    <>
      <div className="px-5 py-2.5 bg-white border-b border-[#E3E8F0] flex flex-wrap items-center gap-2 shrink-0">
        <button type="button" onClick={applyFirst} className="h-[34px] px-4 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-black whitespace-nowrap">첫 오더 날짜 · 횟수 전체 적용</button>
        <span className="text-[12px] font-bold text-[#7A89A3] ml-1 whitespace-nowrap">전체 날짜</span>
        {[-1, 1, 7].map((n) => <button key={n} type="button" onClick={() => shiftAll(n)} className="h-[30px] px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[12px] font-bold text-[#1B2B4B] whitespace-nowrap" style={NUM}>{n > 0 ? `+${n}` : n}일</button>)}
        <span className="text-[12px] font-bold text-[#7A89A3] ml-3 whitespace-nowrap">배차담당자 전체</span>
        <div className="w-[150px]">
          <CustomSelect className={sel} value="" placeholder="원본 담당자" onChange={(e) => { const v = e.target.value; setOwners(v === "__orig_all__" ? {} : Object.fromEntries(rows.map((_, i) => [i, v]))); }}>
            <option value="__orig_all__">원본 담당자로</option>
            {staff.map((s2) => <option key={s2.key} value={s2.key}>{s2.name}</option>)}
          </CustomSelect>
        </div>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#1B2B4B] whitespace-nowrap"><input type="checkbox" className="w-4 h-4 accent-[#1B2B4B]" checked={keepGap} onChange={(e) => setKeepGap(e.target.checked)} /> 상하차 간격 유지</label>
        <label className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#1B2B4B] ml-3 whitespace-nowrap" title="끄면 기사·차량을 비우고 배차중으로 복사해요"><input type="checkbox" className="w-4 h-4 accent-[#1B2B4B]" checked={keepDriver} onChange={(e) => setKeepDriver(e.target.checked)} /> 기사·차량 유지</label>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-3 overscroll-contain">
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-2.5">
          {rows.map((r, i) => {
            const p = plans[i]; const dates = p.on ? copyDatesOf({ ...p, keepGap }) : [];
            return (
              <div key={p.id} className={`rounded-2xl border bg-white px-4 py-3 ${p.on ? "border-[#E3E8F0]" : "border-dashed border-[#DCE3EE] opacity-60"}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <input type="checkbox" className="w-4 h-4 accent-[#1B2B4B] shrink-0" checked={p.on} onChange={(e) => setPlan(i, { on: e.target.checked })} />
                  <span className="w-6 h-6 rounded-md bg-[#0F1A30] text-white text-[11px] font-black grid place-items-center shrink-0" style={NUM}>{i + 1}</span>
                  <span className="text-[14px] font-black text-[#0F1A30] truncate">{r.거래처명 || "-"}</span>
                  <span className="text-[12px] text-[#7A89A3] truncate min-w-0">{r.상차지명 || ""} → {r.하차지명 || ""}</span>
                  <span className="ml-auto text-[11.5px] font-bold text-[#9AA9C3] whitespace-nowrap shrink-0" style={NUM}>원본 {fmtMD(r.상차일)}</span>
                </div>
                <div className="mt-2.5 grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] gap-x-2 gap-y-2 items-end">
                  <div><span className={lab}>상차일</span><CustomDatePicker value={p.상차일} min={today} onChange={(e) => setPlan(i, { 상차일: e.target.value })} className={`${inp} text-left`} openOnFocus={false} /></div>
                  <div className="min-w-0"><span className={lab}>상차시간</span><TimePick value={p.상차시간} onChange={(v) => setPlan(i, { 상차시간: v })} basis={p.상차시간기준} onBasis={(b) => setPlan(i, { 상차시간기준: b })} /></div>
                  <div><span className={lab}>하차일{keepGap ? ` (+${p.gap}일)` : ""}</span><CustomDatePicker value={p.하차일} min={p.상차일} disabled={keepGap} onChange={(e) => setPlan(i, { 하차일: e.target.value })} className={`${inp} text-left`} openOnFocus={false} /></div>
                  <div className="min-w-0"><span className={lab}>하차시간</span><TimePick value={p.하차시간} onChange={(v) => setPlan(i, { 하차시간: v })} basis={p.하차시간기준} onBasis={(b) => setPlan(i, { 하차시간기준: b })} /></div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {quick(p.상차일).map(([l, d]) => (
                    <button key={l} type="button" onClick={() => setPlan(i, { 상차일: d })} className={`h-[28px] px-2.5 rounded-full text-[11.5px] font-bold border whitespace-nowrap ${p.상차일 === d ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#1B2B4B] border-[#DCE3EE]"}`}>{l}</button>
                  ))}
                  <div className="w-[118px] ml-1">
                    <CustomSelect className={`${sel} !h-[28px]`} value={p.count} onChange={(e) => setPlan(i, { count: Number(e.target.value) })}>
                      {Array.from({ length: 31 }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n === 1 ? "1건" : `${n}일 연속`}</option>)}
                    </CustomSelect>
                  </div>
                  {p.count > 1 && <label className="flex items-center gap-1 text-[11.5px] font-bold text-[#5B6B85] whitespace-nowrap"><input type="checkbox" checked={p.weekdaysOnly} onChange={(e) => setPlan(i, { weekdaysOnly: e.target.checked })} /> 주말 빼기</label>}
                  <span className="ml-2 text-[11.5px] font-bold text-[#7A89A3] whitespace-nowrap">담당</span>
                  <div className="w-[150px]">
                    <CustomSelect className={`${sel} !h-[28px]`} value={ownerKeyOf(i)} placeholder="-" onChange={(e) => setOwners((m) => ({ ...m, [i]: e.target.value }))}>
                      {ownerOptsOf(i).map((s2) => <option key={s2.key} value={s2.key}>{s2.orig ? `${s2.name} (원본)` : s2.name}</option>)}
                    </CustomSelect>
                  </div>
                  <span className="ml-auto text-[11.5px] font-bold text-[#5B6B85] truncate min-w-0" style={NUM} title={dates.map((d) => fmtMD(d.상차일)).join(", ")}>
                    {dates.length ? `${dates.length}건 · ${fmtMD(dates[0].상차일)}${dates.length > 1 ? ` ~ ${fmtMD(dates[dates.length - 1].상차일)}` : ""}` : "복사 안 함"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="px-5 py-3 bg-white border-t border-[#E3E8F0] flex items-center gap-3 shrink-0 min-w-0">
        <div className="text-[13px] font-bold text-[#5B6B85] whitespace-nowrap">새로 만들 오더 <b className="text-[#0F1A30] text-[15px]" style={NUM}>{expanded.length}</b>건{!keepDriver ? " · 기사 비움(배차중)" : ""}</div>
        {past && <div className="text-[12px] font-bold text-[#B4342A] whitespace-nowrap">오늘 이전 날짜가 있어요</div>}
        <div className="flex-1" />
        {busy && <div className="text-[12.5px] font-bold text-[#2D4C82] whitespace-nowrap" style={NUM}>등록 중 {busy.done}/{busy.total}</div>}
        <button type="button" onClick={onClose} className="h-11 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#1B2B4B] whitespace-nowrap">취소</button>
        <button type="button" onClick={run} disabled={!!busy || isViewer || !expanded.length} className="h-11 px-7 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-40 whitespace-nowrap">{busy ? "등록 중…" : `복사 등록 · ${expanded.length}건`}</button>
      </div>
    </>
  );
}
