// ======================= src/WorkManual.jsx =======================
// 📘 2026-11-14 업무 매뉴얼 창 · 📖 회계용어 창 — 정산관리 · 회계관리 · 자금관리 · 비품관리
//  · <ManualButton menu="정산관리" />  — 누르면 매뉴얼 창(글 · 움직이는 예시 화면 · 버튼 설명 · 연결되는 곳)
//  · <GlossaryButton />                — 누르면 회계용어 창(검색 · 분류)
//  · 어디서든 열기: window.dispatchEvent(new CustomEvent("kp-open-manual", { detail: { menu, section } }))  (도움말 센터 · 왼쪽 메뉴 도구)
//  · 내용: src/workManuals.js · src/acctGlossary.js — 화면을 바꾸면 내용도 같이(CLAUDE.md)
import React from "react";
import { createPortal } from "react-dom";
import { MANUALS } from "./workManuals";
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

export function ManualButton({ menu, section = "", dark = false, label }) {
  return <button type="button" data-manual-btn={menu} onClick={() => window.dispatchEvent(new CustomEvent("kp-open-manual", { detail: { menu, section } }))} className={btnCls(dark)}><BookIcon />{label || `${menu.replace("관리", "")} 매뉴얼`}</button>;
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
    <div className="w-full sm:max-w-[1180px] h-full sm:h-[92vh] bg-[#F4F6FA] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
      <div className="shrink-0 px-5 sm:px-7 py-4 flex items-center gap-3 text-white" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div className="min-w-0 flex-1">
          <div className="text-[19px] sm:text-[21px] font-black truncate">{title}</div>
          {sub && <div className="text-[12.5px] sm:text-[13px] text-white/65 truncate">{sub}</div>}
        </div>
        <button type="button" onClick={onClose} className="shrink-0 h-10 px-4 rounded-xl bg-white/12 hover:bg-white/20 text-[14px] font-black">닫기</button>
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
  const M = MANUALS[menu];
  const bodyRef = React.useRef(null);
  const [cur, setCur] = React.useState(section || "intro");
  const go = (id) => { setCur(id); const el = document.getElementById(`wm-${id}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };
  React.useEffect(() => { if (section) setTimeout(() => go(section), 80); }, [section]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose?.(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  if (!M) return null;
  const toc = [["intro", "처음 읽어 주세요"], ...M.sections.map((s) => [s.id, s.tab]), ...(M.changes?.length ? [["changes", "최근 바뀐 점"]] : [])];
  const side = (
    <nav className="hidden md:flex w-[230px] shrink-0 flex-col gap-1 p-3 border-r border-[#E3E8F0] bg-white overflow-y-auto">
      <div className="px-2 pt-1 pb-2 text-[11px] font-extrabold tracking-[0.2em] text-[#94A3B8]">목차</div>
      {toc.map(([id, l], k) => (
        <button key={id} type="button" onClick={() => go(id)} className={`text-left px-3 py-2.5 rounded-xl text-[14.5px] font-bold transition ${cur === id ? "bg-[#0F1A30] text-white" : "text-[#3A4A66] hover:bg-[#F5F8FD]"}`}>
          <span className={`inline-block w-6 text-[12px] tabular-nums ${cur === id ? "text-[#8FB0F0]" : "text-[#9AA9C3]"}`}>{id === "intro" ? "★" : id === "changes" ? "↻" : k}</span>{l}
        </button>
      ))}
      {menu === "회계관리" && <div className="mt-3 px-1"><GlossaryButton /></div>}
    </nav>
  );
  return (
    <Shell title={M.title} sub={`처음 오신 분도 순서대로 따라 하면 돼요 · ${M.updated} 기준 최신`} onClose={onClose} side={side}>
      <div ref={bodyRef} className="max-w-[860px] mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* 휴대폰 목차 */}
        <div className="md:hidden flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
          {toc.map(([id, l]) => <button key={id} type="button" onClick={() => go(id)} className={`shrink-0 h-9 px-3 rounded-full text-[13px] font-black ${cur === id ? "bg-[#0F1A30] text-white" : "bg-white text-[#3A4A66] border border-[#DCE3EE]"}`}>{l}</button>)}
        </div>

        <section id="wm-intro" className="bg-white rounded-3xl border border-[#E3E8F0] p-5 sm:p-7">
          <div className="text-[13px] font-extrabold tracking-[0.18em] text-[#4B6CB7]">GUIDE</div>
          <h2 className="mt-1 text-[22px] sm:text-[24px] font-black text-[#0F1A30]">{menu}은 이런 곳이에요</h2>
          <p className="mt-2 text-[16px] sm:text-[17px] leading-[1.75] text-[#2B3A55]">{M.intro}</p>
          <div className="mt-5 text-[14px] font-black text-[#0F1A30]">한눈에 보는 순서</div>
          <div className="mt-2 flex flex-wrap items-stretch gap-1.5" data-manual-flow>
            {M.flow.map((f, k) => (
              <React.Fragment key={f.label}>
                <div className="rounded-2xl bg-[#F5F8FD] border border-[#DCE3EE] px-3.5 py-2.5 min-w-[118px]">
                  <div className="text-[12px] font-black text-[#4B6CB7] tabular-nums">STEP {k + 1}</div>
                  <div className="text-[15.5px] font-black text-[#0F1A30]">{f.label}</div>
                  <div className="text-[12.5px] text-[#5B6B85]">{f.desc}</div>
                </div>
                {k < M.flow.length - 1 && <span className="self-center text-[#9AB0D6] text-[20px] font-black">›</span>}
              </React.Fragment>
            ))}
          </div>
        </section>

        {M.sections.map((s, k) => (
          <section key={s.id} id={`wm-${s.id}`} className="bg-white rounded-3xl border border-[#E3E8F0] p-5 sm:p-7 scroll-mt-4" data-manual-section={s.id}>
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full bg-[#0F1A30] text-white text-[14px] font-black grid place-items-center tabular-nums shrink-0">{k + 1}</span>
              <h3 className="text-[20px] sm:text-[22px] font-black text-[#0F1A30] leading-snug">{s.title}</h3>
            </div>
            <div className="mt-1.5 text-[13px] font-bold text-[#7A879C]">왼쪽 메뉴 › <b className="text-[#1B2B4B]">{menu} › {s.tab}</b></div>
            <p className="mt-3 text-[16px] sm:text-[17px] leading-[1.75] text-[#2B3A55]">{s.what}</p>

            {s.demo && hasHelpDemo(s.demo) && (
              <div className="mt-4">
                <div className="mb-1.5 text-[13.5px] font-black text-[#0F1A30]">▶ 영상처럼 따라 보기 <span className="font-bold text-[#7A879C]">— 자동으로 넘어가요. 마우스를 올리면 잠깐 멈춰요</span></div>
                <HelpDemo id={s.demo} />
              </div>
            )}

            <div className="mt-5 text-[15.5px] font-black text-[#0F1A30]">이렇게 하면 돼요</div>
            <ol className="mt-2 space-y-2">
              {s.steps.map((t, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-[#EEF3FB] text-[#1B2B4B] text-[12.5px] font-black grid place-items-center tabular-nums">{i + 1}</span>
                  <span className="text-[15.5px] sm:text-[16px] leading-[1.7] text-[#2B3A55]">{t}</span>
                </li>
              ))}
            </ol>

            <div className="mt-6 text-[15.5px] font-black text-[#0F1A30]">버튼 하나하나</div>
            <div className="mt-2 rounded-2xl border border-[#E3E8F0] overflow-hidden divide-y divide-[#EEF1F6]">
              {s.buttons.map(([b, d]) => (
                <div key={b} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 px-4 py-3">
                  <div className="sm:w-[34%] shrink-0"><span className="inline-block px-2.5 py-1 rounded-lg bg-[#0F1A30] text-white text-[13.5px] font-black leading-snug">{b}</span></div>
                  <div className="text-[15px] leading-[1.65] text-[#2B3A55]">{d}</div>
                </div>
              ))}
            </div>

            {s.links?.length > 0 && (<>
              <div className="mt-6 text-[15.5px] font-black text-[#0F1A30]">어디랑 연결되나요?</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {s.links.map(([w, d]) => (
                  <div key={w} className="rounded-2xl bg-[#F5F8FD] border border-[#DCE3EE] px-4 py-3">
                    <div className="text-[14.5px] font-black text-[#1B2B4B]">→ {w}</div>
                    <div className="text-[14px] leading-[1.6] text-[#3A4A66] mt-0.5">{d}</div>
                  </div>
                ))}
              </div>
            </>)}

            {s.tip && <div className="mt-5 rounded-2xl bg-[#0F1A30] text-white px-4 py-3.5 text-[15px] leading-[1.65]"><b className="text-[#8FB0F0]">💡 알아 두면 좋아요 </b>{s.tip}</div>}
          </section>
        ))}

        {M.changes?.length > 0 && (
          <section id="wm-changes" className="bg-white rounded-3xl border border-[#E3E8F0] p-5 sm:p-7">
            <h3 className="text-[20px] font-black text-[#0F1A30]">최근 바뀐 점</h3>
            <ul className="mt-3 space-y-2">
              {M.changes.map((c, i) => <li key={i} className="flex gap-3 text-[15px] leading-[1.65] text-[#2B3A55]"><span className="shrink-0 text-[13px] font-black text-[#4B6CB7] tabular-nums mt-0.5">{c.date}</span>{c.text}</li>)}
            </ul>
          </section>
        )}
        <div className="text-center text-[13px] text-[#9AA9C3] pb-4">더 궁금한 건 위쪽 [검색] 옆 도움말 센터에서도 찾을 수 있어요.</div>
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
      <div className="max-w-[900px] mx-auto px-4 sm:px-8 py-5" data-glossary>
        <div className="sticky top-0 z-[1] -mx-4 sm:-mx-8 px-4 sm:px-8 pt-1 pb-3 bg-[#F4F6FA]">
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
                    <div className="text-[17px] font-black text-[#0F1A30]">{t}</div>
                    <div className="mt-0.5 text-[15.5px] leading-[1.7] text-[#2B3A55]">{d}</div>
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
