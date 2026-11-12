// ======================= src/freight/ui.jsx =======================
// 🚢 2026-11-12 컨테이너 · 해상 · 항공 화면 공용 부품 — 직접 입력 대신 드롭다운 · 달력 · 시간 고르기 위주
import React from "react";
import { createPortal } from "react-dom";
import { Container, Ship, Plane, Truck, Layers } from "lucide-react";
import CustomSelect from "../CustomSelect";
import CustomDatePicker from "../CustomDatePicker";
import { TimeSelect, DateTimeSelect } from "../kpTimePick";
import { CNTR_TYPES, cntrType, statusList, HANDOFF_STATUS, progressPct, portName } from "./freightCore";

export const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
export const NAVY = "linear-gradient(135deg,#0B1428 0%,#14203A 45%,#1B2B4B 75%,#2D4C82 100%)";
export const GRID = "linear-gradient(rgba(143,176,240,.08) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.08) 1px, transparent 1px) 0 0/22px 22px";
const INPUT = "w-full h-10 border border-[#DCE3EE] rounded-xl px-3 text-[14px] font-semibold text-[#0F1A30] bg-white placeholder:text-[#9AA9C3] placeholder:font-medium focus:outline-none focus:border-[#2D4C82]";

export const MODE_ICON = { inland: Truck, container: Container, sea: Ship, air: Plane, group: Layers };
export const MODE_NAME = { inland: "내륙", container: "컨테이너", sea: "해상", air: "항공", group: "통합" };
export function ModeIcon({ mode, size = 16, className = "", strokeWidth = 2 }) {
  const I = MODE_ICON[mode] || Truck;
  return <I size={size} className={className} strokeWidth={strokeWidth} />;
}
export function ModeChip({ mode, dark = false }) {
  return (
    <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-lg text-[11.5px] font-extrabold whitespace-nowrap ${dark ? "bg-white/10 text-white" : "bg-[#EEF3FB] text-[#1B2B4B]"}`}>
      <ModeIcon mode={mode} size={12} />{MODE_NAME[mode] || mode}
    </span>
  );
}

// ── 화면 틀 ───────────────────────────────────────────────────────────
export function PageHead({ mode, en, title, desc, right }) {
  return (
    <div className="flex items-center gap-4 pb-4 mb-5 border-b border-[#EEF1F6] flex-wrap">
      <div className="relative w-12 h-12 rounded-[15px] flex items-center justify-center shrink-0 overflow-hidden shadow-[0_8px_20px_rgba(15,26,48,0.28)] ring-1 ring-white/10 text-white" style={{ background: NAVY }}>
        <span className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "8px 8px" }} />
        <ModeIcon mode={mode} size={21} className="relative" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>{en}</div>
        <div className="flex items-baseline gap-3 min-w-0 flex-wrap">
          <h2 className="text-[21px] font-black text-[#0F1A30] tracking-tight leading-tight whitespace-nowrap">{title}</h2>
          {desc && <span className="text-[13.5px] text-[#5B6B85] font-medium">{desc}</span>}
        </div>
      </div>
      {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
    </div>
  );
}
export function Card({ title, en, right, children, className = "", pad = true }) {
  return (
    <section className={`bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_6px_20px_rgba(15,26,48,0.05)] min-w-0 ${className}`}>
      {(title || right) && (
        <div className="flex items-center gap-2.5 px-5 h-[52px] border-b border-[#EEF1F6]">
          <span className="w-1.5 h-1.5 rotate-45 bg-[#2D4C82] shrink-0" />
          <span className="text-[15px] font-black text-[#0F1A30] whitespace-nowrap">{title}</span>
          {en && <span className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#9AA9C3] hidden sm:inline" style={{ fontFamily: MONO }}>{en}</span>}
          <div className="ml-auto flex items-center gap-2">{right}</div>
        </div>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}
export function Kpi({ label, value, unit, sub, tone = "", dark = false, onClick }) {
  const Tag = onClick ? "button" : "div";
  const col = tone === "bad" ? "#C2362B" : tone === "warn" ? "#B26A00" : dark ? "#fff" : "#0F1A30";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={`text-left rounded-2xl px-4 py-3.5 border min-w-0 ${dark ? "border-white/10 bg-white/[0.06]" : "border-[#E3E8F0] bg-white"} ${onClick ? "hover:border-[#2D4C82] transition" : ""}`}>
      <div className={`text-[12px] font-bold whitespace-nowrap ${dark ? "text-white/60" : "text-[#7A89A3]"}`}>{label}</div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-[24px] font-black tabular-nums leading-none" style={{ color: col }}>{value}</span>
        {unit && <span className={`text-[12.5px] font-bold ${dark ? "text-white/60" : "text-[#7A89A3]"}`}>{unit}</span>}
      </div>
      {sub && <div className={`text-[11.5px] font-semibold mt-1.5 truncate ${dark ? "text-white/50" : "text-[#9AA9C3]"}`}>{sub}</div>}
    </Tag>
  );
}
export function Btn({ children, onClick, kind = "ghost", size = "md", disabled = false, type = "button", title, className = "" }) {
  const h = size === "sm" ? "h-8 px-3 text-[12.5px]" : size === "lg" ? "h-12 px-6 text-[15px]" : "h-10 px-4 text-[13.5px]";
  const k = kind === "primary" ? "bg-[#0F1A30] text-white hover:bg-[#1B2B4B] shadow-[0_6px_16px_rgba(15,26,48,.22)]"
    : kind === "danger" ? "bg-white text-[#C2362B] border border-[#DCE3EE] hover:bg-[#F5F8FD]"
    : kind === "soft" ? "bg-[#EEF3FB] text-[#1B2B4B] hover:bg-[#E2EAF7]"
    : "bg-white text-[#1B2B4B] border border-[#DCE3EE] hover:border-[#2D4C82]";
  return <button type={type} title={title} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-extrabold whitespace-nowrap transition disabled:opacity-40 disabled:cursor-not-allowed ${h} ${k} ${className}`}>{children}</button>;
}
export function Empty({ mode, title, desc, action }) {
  return (
    <div className="py-14 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-2xl grid place-items-center bg-[#F5F8FD] border border-[#E3E8F0] text-[#4B6CB7]"><ModeIcon mode={mode} size={24} /></div>
      <div className="text-[15px] font-black text-[#0F1A30] mt-3">{title}</div>
      {desc && <div className="text-[13px] text-[#7A89A3] mt-1">{desc}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── 입력 ─────────────────────────────────────────────────────────────
export function Field({ label, required, hint, span = 1, children, ok, err }) {
  const sp = span === 2 ? "sm:col-span-2" : span === 3 ? "sm:col-span-2 xl:col-span-3" : span === 4 ? "sm:col-span-2 xl:col-span-4" : "";
  return (
    <div className={`min-w-0 ${sp}`}>
      <label className="flex items-center gap-1 text-[12.5px] font-extrabold text-[#3A4A66] mb-1.5">
        {label}{required && <span className="text-[#C2362B]">*</span>}
        {hint && <span className="font-semibold text-[#9AA9C3]">· {hint}</span>}
      </label>
      {children}
      {(ok || err) && <div className={`text-[11.5px] font-bold mt-1 ${err ? "text-[#C2362B]" : "text-[#2D4C82]"}`}>{err || ok}</div>}
    </div>
  );
}
export const Grid = ({ children, cols = 4 }) => <div className={`grid grid-cols-1 sm:grid-cols-2 ${cols === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4"} gap-x-4 gap-y-3.5`}>{children}</div>;
export function Sel({ value, onChange, options = [], placeholder = "선택", disabled = false, className = "" }) {
  // options: ["a", "b"] | [[value, label]] | [{ group, items }]
  const opt = (o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>);
  return (
    <CustomSelect value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} className={`${INPUT} ${className}`}>
      <option value="">{placeholder}</option>
      {options.map((o) => (o && o.group ? <optgroup key={o.group} label={o.group}>{o.items.map(opt)}</optgroup> : opt(o)))}
    </CustomSelect>
  );
}
export const DateIn = ({ value, onChange, placeholder = "날짜 선택", min, max }) => (
  <CustomDatePicker value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} showIcon min={min} max={max} className={INPUT} />
);
export const TimeIn = ({ value, onChange, placeholder = "시간 선택" }) => <TimeSelect value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={INPUT} />;
export const DateTimeIn = ({ value, onChange }) => <DateTimeSelect value={value || ""} onChange={(e) => onChange(e.target.value)} dateClassName={INPUT} timeClassName={INPUT} />;
export function TextIn({ value, onChange, placeholder = "", upper = false, right, inputMode, maxLength, disabled = false }) {
  return (
    <div className="relative">
      <input value={value || ""} disabled={disabled} inputMode={inputMode} maxLength={maxLength} placeholder={placeholder}
        onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
        className={`${INPUT} ${right ? "pr-12" : ""} ${upper ? "tracking-wide" : ""} disabled:bg-[#F5F8FD] disabled:text-[#7A89A3]`} />
      {right && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-[#9AA9C3] pointer-events-none">{right}</span>}
    </div>
  );
}
export function NumIn({ value, onChange, placeholder = "0", unit, decimals = false, disabled = false }) {
  const show = value === "" || value == null ? "" : decimals ? String(value) : Number(String(value).replace(/,/g, "") || 0).toLocaleString("ko-KR");
  return <TextIn value={show} disabled={disabled} placeholder={placeholder} right={unit} inputMode={decimals ? "decimal" : "numeric"}
    onChange={(v) => { const c = decimals ? v.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1") : v.replace(/[^0-9]/g, ""); onChange(c); }} />;
}
// 고르거나(목록) 바로 쓰는 칸 — 목록에서 찾기 + 없는 값은 그대로 입력
export function Combo({ value, onChange, options = [], placeholder = "선택 또는 입력", upper = false }) {
  const flat = React.useMemo(() => options.flatMap((o) => (o && o.group ? o.items.map((x) => ({ g: o.group, v: x })) : [{ g: "", v: o }])), [options]);
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState(null);
  const [hi, setHi] = React.useState(-1);
  const ref = React.useRef(null); const popRef = React.useRef(null);
  const q = String(value || "").trim().toLowerCase();
  const exact = flat.some((x) => x.v.toLowerCase() === q);
  const list = (!q || exact ? flat : flat.filter((x) => x.v.toLowerCase().includes(q))).slice(0, 80);
  const place = () => { const r = ref.current?.getBoundingClientRect(); if (r) setRect({ left: r.left, top: r.bottom + 4, width: r.width, up: window.innerHeight - r.bottom < 260 ? r.top - 4 : null }); };
  React.useEffect(() => {
    if (!open) return undefined;
    place();
    const close = (e) => { if (ref.current?.contains(e.target) || popRef.current?.contains(e.target)) return; setOpen(false); };
    const sc = (e) => { if (popRef.current?.contains(e.target)) return; place(); };
    document.addEventListener("mousedown", close); window.addEventListener("scroll", sc, true); window.addEventListener("resize", place);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("scroll", sc, true); window.removeEventListener("resize", place); };
  }, [open]);
  const pick = (v) => { onChange(v); setOpen(false); setHi(-1); };
  return (
    <div ref={ref} className="relative">
      <input value={value || ""} placeholder={placeholder} className={`${INPUT} pr-9`}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
        onChange={(e) => { onChange(upper ? e.target.value.toUpperCase() : e.target.value); setOpen(true); setHi(-1); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(list.length - 1, h + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          else if (e.key === "Enter" && open && hi >= 0 && list[hi]) { e.preventDefault(); pick(list[hi].v); }
          else if (e.key === "Escape" || e.key === "Tab") setOpen(false);
        }} />
      <svg className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#9AA9C3]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      {open && rect && list.length > 0 && createPortal(
        <div ref={popRef} className="kp-pc-pop fixed z-[2147482500] rounded-xl bg-white border border-[#DCE3EE] shadow-[0_18px_44px_rgba(15,26,48,.22)] overflow-y-auto py-1"
          style={{ left: rect.left, width: rect.width, maxHeight: 248, ...(rect.up != null ? { bottom: window.innerHeight - rect.up } : { top: rect.top }) }}>
          {list.map((x, i) => (
            <React.Fragment key={`${x.g}:${x.v}`}>
              {x.g && (i === 0 || list[i - 1].g !== x.g) && <div className="px-3 pt-2 pb-1 text-[10.5px] font-extrabold tracking-[0.14em] text-[#9AA9C3]">{x.g}</div>}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(x.v)} onMouseEnter={() => setHi(i)}
                className={`w-full text-left px-3 h-9 text-[13.5px] font-semibold truncate ${i === hi ? "bg-[#EEF3FB] text-[#0F1A30]" : "text-[#3A4A66]"} ${String(value || "") === x.v ? "font-black text-[#0F1A30]" : ""}`}>{x.v}</button>
            </React.Fragment>
          ))}
        </div>, document.body)}
    </div>
  );
}
// 몇 개 중 하나 고르기(수출/수입 · FCL/LCL)
export function Seg({ value, onChange, options, size = "md" }) {
  return (
    <div className={`inline-flex p-1 rounded-xl bg-[#F0F3F8] border border-[#E3E8F0] max-w-full overflow-x-auto ${size === "sm" ? "h-9" : "h-10"}`}>
      {options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; const on = value === v; return (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`px-3.5 rounded-lg text-[13px] font-extrabold whitespace-nowrap transition ${on ? "bg-[#0F1A30] text-white shadow-[0_3px_8px_rgba(15,26,48,.25)]" : "text-[#5B6B85] hover:text-[#0F1A30]"}`}>{l}</button>
      ); })}
    </div>
  );
}

// ── 상태 · 마감 표시 ───────────────────────────────────────────────────
export function StatusChip({ job }) {
  const req = job.status === HANDOFF_STATUS;
  const pct = progressPct(job);
  const done = pct >= 100;
  return (
    <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-lg text-[11.5px] font-extrabold whitespace-nowrap ${req ? "bg-[#F5F8FD] border border-[#E3E8F0] text-[#B26A00]" : done ? "bg-[#0F1A30] text-white" : "bg-[#EEF3FB] text-[#1B2B4B]"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${req ? "bg-[#B26A00] animate-pulse" : done ? "bg-[#8FB0F0]" : "bg-[#4B6CB7]"}`} />{job.status || "-"}
    </span>
  );
}
// 🎨 2026-11-12 알록달록 금지 — 바탕은 모두 같은 옅은 남색, 급한 정도는 글씨 색으로만
const DUE_BG = "#F5F8FD";
const DUE_STYLE = {
  over: { bg: DUE_BG, fg: "#C2362B", dot: "#C2362B" },
  urgent: { bg: DUE_BG, fg: "#C2362B", dot: "#C2362B" },
  soon: { bg: DUE_BG, fg: "#B26A00", dot: "#B26A00" },
  ok: { bg: DUE_BG, fg: "#2D4C82", dot: "#4B6CB7" },
};
export function DueChip({ due, showLabel = true }) {
  if (!due) return <span className="text-[12px] text-[#C3CCDB]">-</span>;
  const s = DUE_STYLE[due.level] || DUE_STYLE.ok;
  return (
    <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-lg text-[11.5px] font-extrabold whitespace-nowrap tabular-nums" style={{ background: s.bg, color: s.fg, boxShadow: "inset 0 0 0 1px #E3E8F0" }}>
      <span className={`w-1.5 h-1.5 rounded-full ${due.level === "over" || due.level === "urgent" ? "animate-pulse" : ""}`} style={{ background: s.dot }} />
      {showLabel && <span className="opacity-80">{due.label}</span>}{due.text}
    </span>
  );
}
// 진행 단계 줄(작은 점들) — 지금 단계까지 채워진다
export function Stepper({ job, compact = false }) {
  const l = statusList(job.mode);
  const i = job.status === HANDOFF_STATUS ? -1 : l.indexOf(job.status);
  if (compact) return (
    <div className="flex items-center gap-[3px]" title={l.join(" → ")}>
      {l.map((s, k) => <span key={s} className="h-1.5 rounded-full" style={{ width: k === i ? 16 : 8, background: k <= i ? "#1B2B4B" : "#DCE3EE" }} />)}
    </div>
  );
  return (
    <div className="flex items-start overflow-x-auto pb-1">
      {l.map((s, k) => (
        <div key={s} className="flex-1 min-w-[64px] flex flex-col items-center relative">
          {k > 0 && <span className="absolute top-[9px] right-1/2 w-full h-[2px]" style={{ background: k <= i ? "#1B2B4B" : "#E3E8F0" }} />}
          <span className={`relative z-[1] w-5 h-5 rounded-full grid place-items-center text-[10px] font-black ${k < i ? "bg-[#1B2B4B] text-white" : k === i ? "bg-white text-[#0F1A30] ring-[3px] ring-[#1B2B4B]" : "bg-white text-[#9AA9C3] ring-2 ring-[#DCE3EE]"}`}>{k < i ? "✓" : k + 1}</span>
          <span className={`mt-1.5 text-[11.5px] whitespace-nowrap ${k === i ? "font-black text-[#0F1A30]" : k < i ? "font-bold text-[#3A4A66]" : "font-semibold text-[#9AA9C3]"}`}>{s}</span>
        </div>
      ))}
    </div>
  );
}

// ── 그림 ─────────────────────────────────────────────────────────────
// 컨테이너 옆모습 — 규격에 따라 길이 · 높이가 달라지고, 문 · 주름 · 번호가 보인다
export function ContainerArt({ size = "40HC", cntrNo = "", line = "", height = 96, dark = true }) {
  const t = cntrType(size) || CNTR_TYPES[2];
  const W = t.ft >= 45 ? 268 : t.ft >= 40 ? 240 : 132;
  const hc = /HC|RH/.test(t.key);
  const flat = /FR/.test(t.key); const open = /OT/.test(t.key); const tank = /TK/.test(t.key); const reefer = t.kind === "냉동";
  const H = hc ? 78 : 70; const y0 = 86 - H;
  const body = dark ? "#2D4C82" : "#1B2B4B"; const rib = dark ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.2)";
  const ribs = []; for (let x = 14; x < W - (reefer ? 30 : 12); x += 9) ribs.push(x);
  return (
    <svg viewBox={`0 0 ${W + 8} 100`} height={height} style={{ maxWidth: "100%" }} role="img" aria-label={`${t.label} 컨테이너`}>
      <ellipse cx={(W + 8) / 2} cy="95" rx={W / 2} ry="3.5" fill="rgba(0,0,0,.22)" />
      {flat ? (<>
        <rect x="4" y="74" width={W} height="12" rx="2" fill={body} />
        <rect x="4" y={y0 + 6} width="9" height={H - 6} rx="1.5" fill={body} /><rect x={W - 5} y={y0 + 6} width="9" height={H - 6} rx="1.5" fill={body} />
        <rect x="30" y="46" width={W - 52} height="28" rx="3" fill="rgba(143,176,240,.35)" stroke="rgba(143,176,240,.7)" strokeDasharray="4 3" />
      </>) : tank ? (<>
        <rect x="4" y={y0} width={W} height={H} rx="3" fill="none" stroke={body} strokeWidth="4" />
        <rect x="14" y={y0 + 12} width={W - 20} height={H - 24} rx={(H - 24) / 2} fill={body} />
        <rect x="14" y={y0 + 18} width={W - 20} height="5" rx="2.5" fill="rgba(255,255,255,.22)" />
      </>) : (<>
        <rect x="4" y={y0} width={W} height={H} rx="3" fill={body} />
        {open && <path d={`M6 ${y0 + 1} Q ${(W + 8) / 2} ${y0 - 7} ${W + 2} ${y0 + 1}`} fill="none" stroke="#8FB0F0" strokeWidth="2.5" strokeDasharray="5 3" />}
        <rect x="4" y={y0} width={W} height="5" rx="2" fill="rgba(255,255,255,.14)" /><rect x="4" y="81" width={W} height="5" rx="2" fill="rgba(0,0,0,.22)" />
        {ribs.map((x) => <rect key={x} x={x} y={y0 + 8} width="3.4" height={H - 16} rx="1.2" fill={rib} />)}
        {reefer && (<g><rect x={W - 24} y={y0 + 7} width="24" height={H - 14} rx="2" fill="#E8EEF8" /><circle cx={W - 12} cy={y0 + H / 2 - 6} r="7" fill="none" stroke="#2D4C82" strokeWidth="2" /><path d={`M${W - 19} ${y0 + H / 2 - 6}h14M${W - 12} ${y0 + H / 2 - 13}v14`} stroke="#2D4C82" strokeWidth="1.6" /><rect x={W - 20} y={y0 + H - 22} width="16" height="5" rx="1" fill="#2D4C82" /></g>)}
        {/* 번호판 */}
        <rect x="16" y={y0 + 12} width={Math.min(W - 60, 104)} height="24" rx="3" fill="rgba(11,20,40,.55)" />
        <text x="22" y={y0 + 23} fontSize="8" fontWeight="800" fill="#8FB0F0" style={{ letterSpacing: "0.14em" }}>{(line || t.iso).slice(0, 14)}</text>
        <text x="22" y={y0 + 33} fontSize="9.5" fontWeight="900" fill="#fff" style={{ letterSpacing: "0.06em" }}>{cntrNo || t.key}</text>
      </>)}
      {[10, W - 6].map((x) => <rect key={x} x={x} y="86" width="4" height="4" fill="#0B1428" />)}
    </svg>
  );
}
// 해상 · 항공 구간 그림 — 출발지에서 도착지로 가는 선 위에 지금 위치
export function RouteArt({ mode = "sea", from = "", to = "", fromSub = "", toSub = "", pct = 0, dark = true, height = 86 }) {
  const air = mode === "air";
  const p = Math.max(0, Math.min(100, pct)) / 100;
  const x1 = 36; const x2 = 364; const y = air ? 62 : 46;
  const path = air ? `M${x1} ${y} Q 200 ${-10} ${x2} ${y}` : `M${x1} ${y} C 120 ${y + 16}, 150 ${y - 16}, 200 ${y} S 290 ${y + 16}, ${x2} ${y}`;
  // 곡선 위 위치(항공: 2차 베지어 · 해상: 직선 근사)
  const px = air ? (1 - p) * (1 - p) * x1 + 2 * (1 - p) * p * 200 + p * p * x2 : x1 + (x2 - x1) * p;
  const py = air ? (1 - p) * (1 - p) * y + 2 * (1 - p) * p * -10 + p * p * y : y + Math.sin(p * Math.PI * 2) * 5;
  const fg = dark ? "#fff" : "#0F1A30"; const sub = dark ? "rgba(255,255,255,.55)" : "#7A89A3"; const ln = dark ? "rgba(143,176,240,.35)" : "#DCE3EE";
  const I = air ? Plane : Ship;
  return (
    <svg viewBox="0 0 400 100" height={height} style={{ width: "100%", maxWidth: 520 }} role="img" aria-label={`${from} → ${to}`}>
      <path d={path} fill="none" stroke={ln} strokeWidth="2" strokeDasharray="5 5" />
      <circle cx={x1} cy={y} r="5" fill={dark ? "#8FB0F0" : "#1B2B4B"} /><circle cx={x2} cy={y} r="5" fill="none" stroke={dark ? "#8FB0F0" : "#1B2B4B"} strokeWidth="2.5" />
      <g transform={`translate(${px - 11} ${py - 11})`}><circle cx="11" cy="11" r="13" fill={dark ? "#0B1428" : "#fff"} stroke={dark ? "#8FB0F0" : "#1B2B4B"} strokeWidth="1.5" /><I x="3" y="3" width="16" height="16" color={dark ? "#fff" : "#0F1A30"} strokeWidth={2} /></g>
      <text x={x1 - 22} y="88" fontSize="13" fontWeight="900" fill={fg}>{from || "출발"}</text>
      <text x={x2 + 22} y="88" fontSize="13" fontWeight="900" fill={fg} textAnchor="end">{to || "도착"}</text>
      <text x={x1 - 22} y="99" fontSize="9" fontWeight="700" fill={sub}>{fromSub}</text>
      <text x={x2 + 22} y="99" fontSize="9" fontWeight="700" fill={sub} textAnchor="end">{toSub}</text>
    </svg>
  );
}
export const routeEnds = (j) => (j.mode === "sea" ? { from: portName(j.pol), to: portName(j.pod), fromSub: j.pol || "", toSub: j.pod || "" } : { from: j.dep || "", to: j.arr || "", fromSub: "", toSub: "" });

// 옆에서 나오는 상세 창
export function Drawer({ open, onClose, title, sub, children, footer, width = 640 }) {
  React.useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="kp-pc-pop fixed inset-0 z-[2147481000] flex justify-end">
      <div className="absolute inset-0 bg-[#0B1428]/45" onClick={onClose} />
      <aside className="relative h-full bg-[#F5F8FD] shadow-[-24px_0_60px_rgba(5,10,25,.35)] flex flex-col" style={{ width: `min(100vw, ${width}px)` }}>
        <header className="px-5 py-4 text-white flex items-start gap-3 shrink-0" style={{ background: `${GRID}, ${NAVY}` }}>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{sub}</div>
            <div className="text-[18px] font-black mt-0.5 truncate">{title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 grid place-items-center text-[16px] font-black">✕</button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">{children}</div>
        {footer && <footer className="shrink-0 px-4 py-3 bg-white border-t border-[#E3E8F0] flex items-center gap-2 flex-wrap">{footer}</footer>}
      </aside>
    </div>, document.body);
}
