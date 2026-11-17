// ======================= src/WorkManual.jsx =======================
// 📘 2026-11-14 업무 매뉴얼 창 · 📖 회계용어 창 — 정산관리 · 회계관리 · 자금관리 · 비품관리
//  · <ManualButton menu="정산관리" />  — 누르면 매뉴얼 창(글 · 움직이는 예시 화면 · 버튼 설명(화면에 있는 버튼, 누르면 이렇게 돼요) · 연결되는 곳)
//  · <GlossaryButton />                — 누르면 회계용어 창(검색 · 분류)
//  · 어디서든 열기: window.dispatchEvent(new CustomEvent("kp-open-manual", { detail: { menu, section } }))  (도움말 센터 · 왼쪽 메뉴 도구)
//  · 내용: src/workManuals.js · src/acctGlossary.js — 화면을 바꾸면 내용도 같이(CLAUDE.md)
import React from "react";
import { createPortal } from "react-dom";
import { MANUALS } from "./workManuals";
import { HELP_DETAIL } from "./helpContent";
import { GLOSSARY, glossaryCount } from "./acctGlossary";
import { HelpDemo, hasHelpDemo } from "./HelpDemos";

const BookIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M8 7h7M8 11h5" />
  </svg>
);
const AbcIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M8 11h6M11 8v6" />
  </svg>
);
const btnCls = (dark) => `inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-[13.5px] font-black whitespace-nowrap transition ${dark ? "bg-white/12 text-white border border-white/25 hover:bg-white/20" : "bg-white text-[#1B2B4B] border border-[#C9D5EA] hover:bg-[#F5F8FD]"}`;

// 🧭 2026-11-15 모든 메뉴에 매뉴얼 — 따로 쓴 매뉴얼(정산 · 회계 · 자금 · 비품)이 없으면 도움말 센터 글(HELP_DETAIL)로 같은 모양의 매뉴얼을 만든다
const MENU_TITLE = { HOME: "홈", 배차관리: "오더등록" };
export const manualName = (menu) => MENU_TITLE[menu] || menu;
const josa = (w) => { const c = String(w).charCodeAt(String(w).length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? "은" : "는"; };
const flowDesc = (t) => {
  const first = (String(t).match(/^.*?(?:[다요]\.|[.。!?](?=\s|$))/) || [String(t)])[0].replace(/[.。]$/, "").trim();
  if (first.length <= 48) return first;
  const cut = first.slice(0, 48); const sp = cut.lastIndexOf(" ");
  return `${(sp > 24 ? cut.slice(0, sp) : cut).trim()}…`;
};
export function manualFor(menu) {
  if (MANUALS[menu]) return MANUALS[menu];
  const H = HELP_DETAIL[menu];
  if (!H?.length) return null;
  const name = manualName(menu);
  const split = (t) => { const i = String(t).indexOf(" — "); return i > 0 ? [t.slice(0, i), t.slice(i + 3)] : [null, t]; };
  return {
    title: `${name} 매뉴얼`, updated: "2026-11-15", generated: true,
    intro: H[0].intro || `${name}에서 하는 일을 순서대로 정리했어요.`,
    // 🛠 2026-11-16 글자 수로 자르면 낱말 중간에서 끊겨(“수정 창이 열”) — 첫 문장을 통째로, 길면 낱말 경계에서 … 를 붙인다 · 설명이 없으면 첫 항목 글
    flow: H.slice(0, 6).map((h) => ({ label: h.title.replace(/\s*\(.*\)\s*$/, "").split(" — ")[0], desc: flowDesc(h.intro || split(h.items?.[0] || "")[1] || "") })),
    sections: H.map((h, i) => {
      const rows = h.items.map(split);
      return { id: `s${i}`, tab: h.title, title: h.title, demo: h.demo, what: h.intro || "",
        steps: rows.filter(([b]) => !b).map(([, d]) => d), buttons: rows.filter(([b]) => b) };
    }),
  };
}

export function ManualButton({ menu, section = "", dark = false, label }) {
  return <button type="button" data-manual-btn={menu} onClick={() => window.dispatchEvent(new CustomEvent("kp-open-manual", { detail: { menu, section } }))} className={btnCls(dark)}><BookIcon />{label || `${MANUALS[menu] ? menu.replace("관리", "") : manualName(menu)} 매뉴얼`}</button>;
}
export function GlossaryButton({ dark = false }) {
  return <button type="button" data-glossary-btn onClick={() => window.dispatchEvent(new CustomEvent("kp-open-glossary"))} className={btnCls(dark)}><AbcIcon />회계용어</button>;
}

// 앱에 한 번 두면 어디서든 이벤트로 연다(DispatchApp · 모바일)
export function ManualHost() {
  const [m, setM] = React.useState(null);
  const [g, setG] = React.useState(false);
  React.useEffect(() => {
    const a = (e) => setM({ menu: e.detail?.menu || "정산관리", section: e.detail?.section || "" });
    const b = () => setG(true);
    window.addEventListener("kp-open-manual", a); window.addEventListener("kp-open-glossary", b);
    return () => { window.removeEventListener("kp-open-manual", a); window.removeEventListener("kp-open-glossary", b); };
  }, []);
  return (<>
    {m && <WorkManualModal menu={m.menu} section={m.section} onClose={() => setM(null)} />}
    {g && <AcctGlossaryModal onClose={() => setG(false)} />}
  </>);
}

const Shell = ({ title, sub, onClose, children, side }) => createPortal(
  <div className="fixed inset-0 z-[2147483100] bg-[#061832]/60 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose} data-kp="work-manual">
    <div className="w-full sm:w-[96vw] sm:max-w-[1480px] h-full sm:h-[95vh] bg-[#F4F6FA] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col" style={{ wordBreak: "keep-all", overflowWrap: "break-word" }} onClick={(e) => e.stopPropagation()}>
      <div className="shrink-0 px-5 sm:px-7 py-4 flex items-center gap-3 text-white" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div className="min-w-0 flex-1">
          <div className="text-[21px] sm:text-[24px] font-black truncate">{title}</div>
          {sub && <div className="text-[14px] sm:text-[15px] text-white/75 truncate">{sub}</div>}
        </div>
        <button type="button" onClick={onClose} className="shrink-0 h-11 px-5 rounded-xl bg-white/12 hover:bg-white/20 text-[15.5px] font-black">닫기</button>
      </div>
      <div className="flex-1 min-h-0 flex">
        {side}
        <div className="flex-1 min-w-0 overflow-y-auto" data-manual-body>{children}</div>
      </div>
    </div>
  </div>,
  document.body,
);

// ─────────────────────────── 매뉴얼 ───────────────────────────
export function WorkManualModal({ menu, section = "", onClose }) {
  const M = manualFor(menu);
  const bodyRef = React.useRef(null);
  const [cur, setCur] = React.useState(section || "intro");
  const go = (id) => { setCur(id); const el = document.getElementById(`wm-${id}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };
  React.useEffect(() => { if (section) setTimeout(() => go(section), 80); }, [section]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose?.(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  if (!M) return null;
  // ⭐ 2026-11-18 "최근 바뀐 점"은 화면에서 뺐다(사용자 요청) — 바뀐 기능은 각 화면의 움직이는 예시(demo)로 설명한다 · "처음 읽어 주세요" → "읽어주세요"
  const toc = [["intro", "읽어주세요"], ...M.sections.map((s) => [s.id, s.tab])];
  const side = (
    <nav className="hidden md:flex w-[260px] shrink-0 flex-col gap-1 p-3 border-r border-[#E3E8F0] bg-white overflow-y-auto">
      <div className="px-2 pt-1 pb-2 text-[13px] font-extrabold tracking-[0.2em] text-[#7A879C]">목차</div>
      {toc.map(([id, l], k) => (
        <button key={id} type="button" onClick={() => go(id)} className={`text-left px-3 py-3 rounded-xl text-[16.5px] font-bold transition ${cur === id ? "bg-[#0F1A30] text-white" : "text-[#3A4A66] hover:bg-[#F5F8FD]"}`}>
          <span className={`inline-block w-7 text-[14px] tabular-nums ${cur === id ? "text-[#8FB0F0]" : "text-[#9AA9C3]"}`}>{id === "intro" ? "★" : k}</span>{l}
        </button>
      ))}
      {menu === "회계관리" && <div className="mt-3 px-1"><GlossaryButton /></div>}
    </nav>
  );
  return (
    <Shell title={M.title} sub={`처음 오신 분도 순서대로 따라 하면 돼요 · ${M.updated} 기준 최신`} onClose={onClose} side={side}>
      <div ref={bodyRef} className="max-w-[1100px] mx-auto px-4 sm:px-10 py-7 space-y-7">
        {/* 휴대폰 목차 */}
        <div className="md:hidden flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
          {toc.map(([id, l]) => <button key={id} type="button" onClick={() => go(id)} className={`shrink-0 h-10 px-3.5 rounded-full text-[15px] font-black ${cur === id ? "bg-[#0F1A30] text-white" : "bg-white text-[#3A4A66] border border-[#DCE3EE]"}`}>{l}</button>)}
        </div>

        <section id="wm-intro" className="bg-white rounded-3xl border border-[#E3E8F0] p-5 sm:p-8">
          <div className="text-[14px] font-extrabold tracking-[0.18em] text-[#4B6CB7]">GUIDE</div>
          <h2 className="mt-1 text-[25px] sm:text-[28px] font-black text-[#0F1A30]">{manualName(menu)}{josa(manualName(menu))} 이런 곳이에요</h2>
          <p className="mt-3 text-[17.5px] sm:text-[19px] leading-[1.8] text-[#1F2D47]" style={{ textWrap: "pretty" }}>{M.intro}</p>
          <div className="mt-6 text-[17px] font-black text-[#0F1A30]">한눈에 보는 순서</div>
          {/* 🛠 2026-11-16 칸이 좁아 제목 · 설명이 잘리던 문제 — 칸 너비를 최소 170px로 두고 넘치면 다음 줄로(제목도 줄바꿈) */}
          <ol className="mt-3 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }} data-manual-flow>
            {M.flow.map((f, k) => (
              <li key={f.label} className="min-w-0 rounded-2xl border border-[#DCE3EE] px-3.5 py-3">
                <div className="text-[13.5px] font-black text-[#4B6CB7] tabular-nums">STEP {k + 1}</div>
                <div className="mt-0.5 text-[17px] font-black leading-snug text-[#0F1A30] break-keep">{f.label}</div>
                {f.desc && <div className="mt-1 text-[14.5px] leading-[1.55] text-[#3A4A66] break-keep">{f.desc}</div>}
              </li>
            ))}
          </ol>
        </section>

        {M.sections.map((s, k) => (
          <section key={s.id} id={`wm-${s.id}`} className="bg-white rounded-3xl border border-[#E3E8F0] p-5 sm:p-8 scroll-mt-4" data-manual-section={s.id}>
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-full bg-[#0F1A30] text-white text-[16px] font-black grid place-items-center tabular-nums shrink-0">{k + 1}</span>
              <h3 className="text-[23px] sm:text-[26px] font-black text-[#0F1A30] leading-snug">{s.title}</h3>
            </div>
            {!M.generated && <div className="mt-2 text-[15px] font-bold text-[#5B6B85]">왼쪽 메뉴 › <b className="text-[#1B2B4B]">{menu} › {s.tab}</b></div>}
            <p className="mt-3 text-[17.5px] sm:text-[19px] leading-[1.8] text-[#1F2D47]" style={{ textWrap: "pretty" }}>{s.what}</p>

            {s.demo && hasHelpDemo(s.demo) && (
              <div className="mt-4">
                <div className="mb-2 text-[16px] font-black text-[#0F1A30]">▶ 영상처럼 따라 보기 <span className="font-bold text-[#5B6B85]">— 자동으로 넘어가요. 마우스를 올리면 잠깐 멈춰요</span></div>
                <HelpDemo id={s.demo} />
              </div>
            )}

            {s.steps.length > 0 && <><div className="mt-7 text-[19px] font-black text-[#0F1A30]">이렇게 하면 돼요</div>
            <ol className="mt-3 space-y-2.5">
              {s.steps.map((t, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-[#EEF3FB] text-[#1B2B4B] text-[14px] font-black grid place-items-center tabular-nums">{i + 1}</span>
                  <span className="text-[17px] sm:text-[18px] leading-[1.75] text-[#1F2D47]" style={{ textWrap: "pretty" }}>{t}</span>
                </li>
              ))}
            </ol></>}

            {s.buttons.length > 0 && <><div className="mt-7 text-[19px] font-black text-[#0F1A30]">화면에 있는 버튼, 누르면 이렇게 돼요</div>
            <div className="mt-3 rounded-2xl border border-[#E3E8F0] overflow-hidden divide-y divide-[#EEF1F6]">
              {s.buttons.map(([b, d]) => (
                <div key={b} className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-5 px-5 py-3.5">
                  <div className="sm:w-[30%] shrink-0"><span className="inline-block px-3 py-1.5 rounded-lg bg-[#0F1A30] text-white text-[15px] font-black leading-snug">{b}</span></div>
                  <div className="text-[17px] leading-[1.7] text-[#1F2D47]" style={{ textWrap: "pretty" }}>{d}</div>
                </div>
              ))}
            </div></>}

            {s.links?.length > 0 && (<>
              <div className="mt-7 text-[19px] font-black text-[#0F1A30]">어디랑 연결되나요?</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {s.links.map(([w, d]) => (
                  <div key={w} className="rounded-2xl bg-[#F5F8FD] border border-[#DCE3EE] px-4 py-3">
                    <div className="text-[16.5px] font-black text-[#1B2B4B]">→ {w}</div>
                    <div className="text-[16px] leading-[1.65] text-[#2B3A55] mt-1" style={{ textWrap: "pretty" }}>{d}</div>
                  </div>
                ))}
              </div>
            </>)}

            {s.tip && <div className="mt-6 rounded-2xl bg-[#0F1A30] text-white px-5 py-4 text-[17px] leading-[1.7]"><b className="text-[#8FB0F0]">💡 알아 두면 좋아요 </b>{s.tip}</div>}
          </section>
        ))}

        <div className="text-center text-[15px] text-[#7A879C] pb-4">더 궁금한 건 위쪽 [검색] 옆 도움말 센터에서도 찾을 수 있어요.</div>
      </div>
    </Shell>
  );
}

// ─────────────────────────── 회계용어 ───────────────────────────
export function AcctGlossaryModal({ onClose }) {
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState("전체");
  React.useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose?.(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  const k = q.trim().toLowerCase();
  const groups = GLOSSARY.filter((g) => cat === "전체" || g.cat === cat).map((g) => ({ ...g, items: g.items.filter(([t, d, ex]) => !k || `${t} ${d} ${ex || ""}`.toLowerCase().includes(k)) })).filter((g) => g.items.length);
  const hits = groups.reduce((a, g) => a + g.items.length, 0);
  return (
    <Shell title="회계용어" sub={`경리 업무에서 자주 나오는 말 ${glossaryCount()}개를 쉬운 말로 풀었어요`} onClose={onClose}>
      <div className="max-w-[1100px] mx-auto px-4 sm:px-10 py-6" data-glossary>
        <div className="sticky top-0 z-[1] -mx-4 sm:-mx-10 px-4 sm:px-10 pt-1 pb-3 bg-[#F4F6FA]">
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="궁금한 말을 적어 보세요 — 예: 공급가액, 미수금, 원천징수"
            className="w-full h-12 px-4 rounded-2xl border border-[#DCE3EE] bg-white text-[16px] font-semibold text-[#0F1A30] outline-none focus:border-[#1B2B4B]" />
          <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
            {["전체", ...GLOSSARY.map((g) => g.cat)].map((c) => <button key={c} type="button" onClick={() => setCat(c)} className={`shrink-0 h-9 px-3.5 rounded-full text-[13.5px] font-black ${cat === c ? "bg-[#0F1A30] text-white" : "bg-white text-[#3A4A66] border border-[#DCE3EE]"}`}>{c}</button>)}
          </div>
        </div>
        {!hits && <div className="py-16 text-center text-[15px] text-[#7A879C]">찾는 말이 없어요. 다른 말로 찾아보세요.</div>}
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.cat}>
              <div className="text-[14px] font-black text-[#4B6CB7] mb-2">{g.cat} <span className="text-[#9AA9C3] font-bold">{g.items.length}</span></div>
              <div className="bg-white rounded-2xl border border-[#E3E8F0] divide-y divide-[#EEF1F6]">
                {g.items.map(([t, d, ex]) => (
                  <div key={t} className="px-4 sm:px-5 py-3.5" data-term={t}>
                    <div className="text-[19px] font-black text-[#0F1A30]">{t}</div>
                    <div className="mt-1 text-[17px] leading-[1.75] text-[#1F2D47]" style={{ textWrap: "pretty" }}>{d}</div>
                    {ex && <div className="mt-1.5 inline-block rounded-lg bg-[#F5F8FD] border border-[#DCE3EE] px-2.5 py-1 text-[13.5px] font-bold text-[#1B2B4B]">예) {ex}</div>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Shell>
  );
}
