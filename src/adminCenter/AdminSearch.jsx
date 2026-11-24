// ======================= src/adminCenter/AdminSearch.jsx =======================
// 🔎 2026-11-20 관리자센터 상단 메뉴 검색(사용자 요청 — 메뉴가 많아 찾기 어렵다)
//  · 메뉴 이름 · 영어 이름 · 묶음 이름 · 화면 안 작은 탭(예: "견적 이력", "로그인 화면")까지 찾는다
//  · 초성("ㄱㅇㅅ" → 가입 심사) · 띄어쓰기 무시 · ↑↓ Enter Esc · "/" 또는 Ctrl+K 로 바로 검색칸
//  · PC: 상단 바 가운데 검색칸 / 휴대폰: 상단 돋보기 → 전체 화면 검색
import React from "react";
import { createPortal } from "react-dom";
import { ShellIcon } from "../AdminShell";
import { G, NUM } from "./admUi";

const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const choOf = (s) => [...String(s)].map((c) => { const n = c.charCodeAt(0) - 0xac00; return n >= 0 && n <= 11171 ? CHO[Math.floor(n / 588)] : c; }).join("");
const norm = (s) => String(s || "").toLowerCase().replace(/[\s·・\-_/()]/g, "");
const isCho = (q) => /^[ㄱ-ㅎ]+$/.test(q);

// 메뉴 목록 → 검색 항목 [{ tab, label, path, en, icon }]
//  sections: [{ label, en, items: [{ key, label, en, icon, badge }] }] · subtabs: { 메뉴키: [[탭키, 탭이름]] }
export function adminSearchEntries(sections = [], subtabs = {}) {
  const out = [];
  sections.forEach((s) => (s.items || []).forEach((i) => {
    out.push({ tab: i.key, label: i.label, path: s.label, en: i.en || "", icon: i.icon, badge: i.badge || 0, sec: s.label });
    (subtabs[i.key] || []).forEach(([k, l]) => { if (k !== i.key && l !== i.label) out.push({ tab: k, label: l, path: `${s.label} › ${i.label}`, en: "", icon: i.icon, sec: s.label, sub: true }); });
  }));
  return out;
}
export function searchAdmin(entries, q0) {
  const q = norm(q0);
  if (!q) return [];
  const cho = isCho(q);
  return entries.map((e) => {
    const name = norm(e.label); const all = norm(`${e.label}${e.path}${e.en}`);
    let sc = 0;
    if (cho) { const c = choOf(name); sc = c.startsWith(q) ? 70 : c.includes(q) ? 55 : choOf(all).includes(q) ? 30 : 0; }
    else sc = name === q ? 100 : name.startsWith(q) ? 85 : name.includes(q) ? 70 : norm(e.en).includes(q) ? 50 : all.includes(q) ? 35 : 0;
    return sc ? { ...e, sc: sc - (e.sub ? 3 : 0) } : null;
  }).filter(Boolean).sort((a, b) => b.sc - a.sc).slice(0, 12);
}

function Highlight({ text, q }) {
  const t = String(text || ""); const n = String(q || "").trim();
  const i = n && !isCho(n) ? t.toLowerCase().indexOf(n.toLowerCase()) : -1;
  if (i < 0) return <>{t}</>;
  return <>{t.slice(0, i)}<b style={{ color: G.goldHi }}>{t.slice(i, i + n.length)}</b>{t.slice(i + n.length)}</>;
}

function Results({ items, act, setAct, pick, q }) {
  if (!q.trim()) return null;
  return (
    <div data-adm-search-list className="py-1.5">
      {!items.length && <div className="px-4 py-5 text-center text-[13px] font-bold" style={{ color: G.dim }}>‘{q}’ 메뉴가 없어요</div>}
      {items.map((e, i) => (
        <button key={`${e.tab}-${e.label}`} type="button" onMouseEnter={() => setAct(i)} onMouseDown={(ev) => { ev.preventDefault(); pick(e); }}
          className="w-full px-3 py-2 flex items-center gap-3 text-left transition rounded-[10px]"
          style={i === act ? { background: "rgba(215,188,130,.14)", boxShadow: "inset 0 0 0 1px rgba(215,188,130,.35)" } : undefined}>
          <span className="w-8 h-8 rounded-[9px] grid place-items-center shrink-0" style={{ background: i === act ? "linear-gradient(180deg,#F3E3BC,#D7BC82)" : "rgba(255,255,255,.05)", color: i === act ? G.goldInk : G.gold }}>
            <ShellIcon name={e.icon} size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-black truncate" style={{ color: G.ink }}><Highlight text={e.label} q={q} /></span>
            <span className="block text-[11.5px] font-bold truncate" style={{ color: G.dim }}>{e.path}{e.en ? <span style={{ ...NUM, marginLeft: 6, letterSpacing: ".12em", fontSize: 10, color: G.goldDim }}>{e.en}</span> : null}</span>
          </span>
          {e.badge > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[10.5px] font-black inline-flex items-center justify-center shrink-0" style={{ ...NUM, background: G.gold, color: G.goldInk }}>{e.badge > 99 ? "99+" : e.badge}</span>}
          {i === act && <span className="text-[11px] font-black shrink-0" style={{ color: G.goldDim }}>↵</span>}
        </button>
      ))}
    </div>
  );
}

export default function AdminSearch({ entries = [], onPick, phone = false }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [act, setAct] = React.useState(0);
  const ref = React.useRef(null);
  const items = React.useMemo(() => searchAdmin(entries, q), [entries, q]);
  React.useEffect(() => { setAct(0); }, [q]);
  const pick = (e) => { onPick?.(e.tab); setQ(""); setOpen(false); ref.current?.blur(); };
  // "/" · Ctrl+K → 검색칸(입력 중일 때는 "/" 무시)
  React.useEffect(() => {
    const k = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;
      if (((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) || (e.key === "/" && !typing)) {
        e.preventDefault(); e.stopPropagation(); setOpen(true); setTimeout(() => ref.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []);
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAct((i) => Math.min(i + 1, Math.max(0, items.length - 1))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAct((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[act]) pick(items[act]); }
    else if (e.key === "Escape") { e.preventDefault(); if (q) setQ(""); else { setOpen(false); ref.current?.blur(); } }
  };
  const input = (cls) => (
    <div className={`relative flex items-center ${cls}`}>
      <span className="absolute left-3 pointer-events-none" style={{ color: G.gold }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg></span>
      <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => !phone && setTimeout(() => setOpen(false), 120)} onKeyDown={onKey}
        placeholder="메뉴 검색 (예: 견적, 가입 심사, ㄱㅇㅅ)" aria-label="관리자센터 메뉴 검색" autoComplete="off" data-adm-search
        className="w-full h-10 pl-9 pr-14 rounded-xl text-[14px] font-bold outline-none transition placeholder:font-semibold"
        style={{ background: "rgba(255,255,255,.05)", border: `1px solid ${open ? "rgba(215,188,130,.55)" : G.line}`, color: G.ink, boxShadow: open ? "0 0 0 3px rgba(215,188,130,.12)" : "none" }} />
      {!phone && !q && <span className="absolute right-2.5 h-6 px-1.5 rounded-md text-[11px] font-black grid place-items-center pointer-events-none" style={{ ...NUM, color: G.goldDim, border: `1px solid ${G.line}` }}>Ctrl K</span>}
      {q && <button type="button" onMouseDown={(e) => { e.preventDefault(); setQ(""); ref.current?.focus(); }} aria-label="지우기" className="absolute right-2 w-7 h-7 rounded-lg grid place-items-center text-[14px]" style={{ color: G.dim }}>✕</button>}
    </div>
  );

  if (phone) {
    return (
      <>
        <button type="button" onClick={() => { setOpen(true); setTimeout(() => ref.current?.focus(), 30); }} aria-label="메뉴 검색" className="adm-btn shrink-0 h-9 w-9 rounded-[10px] flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </button>
        {open && createPortal(
          <div className="fixed inset-0 z-[100060] flex flex-col" style={{ background: "#04070F", paddingTop: "env(safe-area-inset-top, 0px)" }}>
            <div className="flex items-center gap-2 px-3 py-3" style={{ borderBottom: `1px solid ${G.line}` }}>
              {input("flex-1")}
              <button type="button" onClick={() => { setOpen(false); setQ(""); }} className="h-10 px-3 rounded-xl text-[14px] font-black whitespace-nowrap" style={{ color: G.gold }}>닫기</button>
            </div>
            <div className="flex-1 overflow-y-auto px-2">
              {q.trim() ? <Results items={items} act={act} setAct={setAct} pick={pick} q={q} />
                : <div className="px-3 py-6 text-[13px] font-bold leading-relaxed" style={{ color: G.dim }}>메뉴 이름을 치면 바로 찾아요.<br />첫소리(ㄱㅇㅅ → 가입 심사)로도 돼요.</div>}
            </div>
          </div>, document.body)}
      </>
    );
  }
  return (
    <div className="relative w-full max-w-[460px]" data-adm-search-wrap>
      {input("")}
      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-[46px] z-50 rounded-2xl px-1.5 max-h-[420px] overflow-y-auto adm-scroll"
          style={{ background: "linear-gradient(180deg,#0E1830,#0A1226)", border: "1px solid rgba(215,188,130,.28)", boxShadow: "0 24px 50px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.3)" }}>
          <Results items={items} act={act} setAct={setAct} pick={pick} q={q} />
          {items.length > 0 && <div className="px-3 pb-2 pt-1 text-[11px] font-bold" style={{ color: G.goldDim }}>↑↓ 고르기 · Enter 이동 · Esc 닫기</div>}
        </div>
      )}
    </div>
  );
}
