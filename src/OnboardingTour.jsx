// ======================= src/OnboardingTour.jsx =======================
// 🧭 2026-11-10 첫 방문 안내(메뉴별 말풍선) + [?] 도움말 — PC·모바일 공용 Host
//  <TourHost company menu uid />  · 설정(기간·단계·문구)은 src/onboardingTour.js
//  · 기간 안에만 동작(2026-11-12 이후 승인된 신규 운송사만) · 메뉴마다 사용자별 1회(서버에도 기록) · [사용법 다시 보기] 버튼(왼쪽 아래)
//  · 튜토리얼·초기 설정 마법사(Onboarding.jsx, [data-kp-onboarding])가 떠 있으면 끝날 때까지 기다린다
import React from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { MENU_TOURS, HELP_TEXT, tourActive, seenKey } from "./onboardingTour";

const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);
const visible = (el) => { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== "hidden"; };
function findTarget(step) {
  if (step.tour) { const el = [...document.querySelectorAll(`[data-tour="${step.tour}"]`)].find(visible); if (el) return el; }
  if (step.find) {
    const want = step.find.replace(/\s/g, "");
    const cands = [...document.querySelectorAll("button, a, [role=tab], [role=button]")].filter((el) => !el.closest("[data-kp-tour]") && visible(el));
    const el = cands.find((c) => (c.textContent || "").replace(/\s/g, "") === want) || cands.find((c) => (c.textContent || "").replace(/\s/g, "").includes(want) && (c.textContent || "").length < want.length + 24);
    if (el) return el;
  }
  return null;
}
const onboardingOpen = () => !!document.querySelector("[data-kp-onboarding]");
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 무시 */ } };

function useApprovedMs(company) {
  const [ms, setMs] = React.useState(0);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(doc(db, "companySettings", company), (s) => setMs(tsMs(s.data()?.onboarding?.approvedAt)), () => setMs(0));
  }, [company]);
  return ms;
}

// 본 기록(서버) — userProfiles/{uid}.tourSeen.{메뉴} = true. 기기를 바꿔도 다시 안 뜨게
function useServerSeen(uid, on) {
  const [seen, setSeen] = React.useState(null); // null = 아직 모름(그동안 자동으로 띄우지 않는다)
  React.useEffect(() => {
    if (!uid || !on) { setSeen(null); return undefined; }
    return onSnapshot(doc(db, "userProfiles", uid), (s) => setSeen(s.data()?.tourSeen || {}), () => setSeen({}));
  }, [uid, on]);
  return seen;
}

export function TourHost({ company = "", menu = "", uid = "" }) {
  const co = String(company || "").trim();
  const approvedMs = useApprovedMs(co);
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  const active = tourActive(co, approvedMs, now);
  const serverSeen = useServerSeen(uid, active);
  // 🛠 2026-11-13 [다시 보지 않기] — 누르면 이 계정은 어느 메뉴에서도 안내 · ? 도움말이 안 뜬다(기기에 기억 + 서버 기록)
  const offKey = `kpTourOff:${uid || "anon"}`;
  const [offLocal, setOffLocal] = React.useState(() => lsGet(offKey) === "1");
  React.useEffect(() => { setOffLocal(lsGet(offKey) === "1"); }, [offKey]);
  const off = offLocal || serverSeen?.__off === true;
  const isSeen = React.useCallback((m) => lsGet(seenKey(uid, m)) === "1" || !!serverSeen?.[m], [uid, serverSeen]);
  const [run, setRun] = React.useState(null); // { menu, steps:[{...step, el}], i }
  const [rect, setRect] = React.useState(null);

  const start = React.useCallback((m, force = false) => {
    const all = MENU_TOURS[m];
    if (!all?.length) return false;
    if (!force && isSeen(m)) return false;
    const steps = all.map((s) => ({ ...s, el: (s.tour || s.find) ? findTarget(s) : null })).filter((s) => s.el || (!s.tour && !s.find));
    if (!steps.length) return false;
    setRun({ menu: m, steps, i: 0 });
    return true;
  }, [isSeen]);

  // 메뉴에 처음 들어오면(화면이 다 그려진 뒤) 시작 — 튜토리얼이 떠 있으면 끝날 때까지 기다린다
  React.useEffect(() => {
    if (!active || off || !menu || run || serverSeen === null) return undefined;
    if (!MENU_TOURS[menu] || isSeen(menu)) return undefined;
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      if (onboardingOpen()) return; // 마법사 먼저
      if (tries < 2) return;        // 화면이 그려질 시간
      clearInterval(t);
      start(menu);
    }, 900);
    return () => clearInterval(t);
  }, [active, off, menu, uid, run, start, serverSeen, isSeen]);
  // 메뉴를 옮기면 진행 중인 안내는 닫는다
  React.useEffect(() => { setRun((r) => (r && r.menu !== menu ? null : r)); }, [menu]);
  // 다시 보기
  React.useEffect(() => {
    const h = () => { if (!start(menu, true)) start("HOME", true); };
    window.addEventListener("kp:tourReplay", h);
    return () => window.removeEventListener("kp:tourReplay", h);
  }, [menu, start]);

  const step = run ? run.steps[run.i] : null;
  React.useLayoutEffect(() => {
    if (!step?.el) { setRect(null); return undefined; }
    try { step.el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" }); } catch { /* 무시 */ }
    const upd = () => { if (!visible(step.el)) { setRect(null); return; } const r = step.el.getBoundingClientRect(); setRect({ x: r.left, y: r.top, w: r.width, h: r.height }); };
    upd();
    const t = setInterval(upd, 400);
    window.addEventListener("resize", upd); window.addEventListener("scroll", upd, true);
    return () => { clearInterval(t); window.removeEventListener("resize", upd); window.removeEventListener("scroll", upd, true); };
  }, [step]);

  const finish = () => {
    if (run) {
      lsSet(seenKey(uid, run.menu), "1");
      if (uid) setDoc(doc(db, "userProfiles", uid), { tourSeen: { [run.menu]: true } }, { merge: true }).catch(() => {});
    }
    setRun(null);
  };
  const neverAgain = () => {
    lsSet(offKey, "1"); setOffLocal(true);
    if (uid) setDoc(doc(db, "userProfiles", uid), { tourSeen: { __off: true } }, { merge: true }).catch(() => {});
    setRun(null);
  };
  const next = () => { if (!run) return; if (run.i + 1 >= run.steps.length) finish(); else setRun({ ...run, i: run.i + 1 }); };
  React.useEffect(() => {
    if (!run) return undefined;
    const k = (e) => { if (e.key === "Escape") finish(); else if (e.key === "Enter") next(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });

  if (!active || off) return null;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200, vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const bw = Math.min(340, vw - 24);
  let bubble = { left: (vw - bw) / 2, top: vh / 2 - 90 };
  if (rect) {
    const below = rect.y + rect.h + 14 + 170 < vh;
    bubble = { left: Math.max(12, Math.min(vw - bw - 12, rect.x + rect.w / 2 - bw / 2)), top: below ? rect.y + rect.h + 14 : Math.max(12, rect.y - 14 - 170) };
  }
  return (
    <>
      {!run && <HelpDots />}
      {run && (
        <div data-kp-tour="overlay" className="fixed inset-0 z-[100050]" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          {rect
            ? <div className="absolute rounded-[12px] pointer-events-none transition-all duration-200" style={{ left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12, boxShadow: "0 0 0 9999px rgba(11,20,40,0.62)", border: "2px solid #8FB0F0" }} />
            : <div className="absolute inset-0 bg-[#0B1428]/62" style={{ background: "rgba(11,20,40,0.62)" }} />}
          <div className="absolute rounded-2xl bg-white shadow-[0_24px_60px_rgba(0,0,0,0.35)] overflow-hidden" style={{ left: bubble.left, top: bubble.top, width: bw }}>
            <div className="px-4 pt-3 pb-2 flex items-start gap-2.5" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
              <span className="mt-0.5 w-6 h-6 rounded-full bg-white/15 ring-1 ring-white/25 text-white text-[13px] font-black grid place-items-center shrink-0" aria-hidden="true">?</span>
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">GUIDE · {run.i + 1}/{run.steps.length}</div>
                <div className="text-[15px] font-black text-white mt-0.5">{step.title}</div>
              </div>
            </div>
            <div className="px-4 py-3 text-[13.5px] leading-relaxed text-[#1B2B4B] font-semibold">{step.text}</div>
            <div className="px-4 pb-3 flex items-center gap-2">
              <div className="flex gap-1">{run.steps.map((_, k) => <span key={k} className={`w-1.5 h-1.5 rounded-full ${k === run.i ? "bg-[#1B2B4B]" : "bg-[#C9D5EA]"}`} />)}</div>
              <button type="button" onClick={finish} className="ml-auto h-9 px-3 rounded-xl border border-[#DCE3EE] text-[12.5px] font-black text-[#5B6B85]">건너뛰기</button>
              <button type="button" onClick={next} className="h-9 px-4 rounded-xl bg-[#0F1A30] text-white text-[12.5px] font-black">{run.i + 1 >= run.steps.length ? "확인" : "다음 →"}</button>
            </div>
            <div className="px-4 py-2 border-t border-[#EEF1F6] bg-[#F5F8FD] flex items-center">
              <button type="button" data-kp-tour="never" onClick={neverAgain} className="text-[12px] font-bold text-[#5B6B85] hover:text-[#0F1A30] underline underline-offset-2" title="이 계정에서는 어느 메뉴에서도 안내가 다시 뜨지 않습니다">다시 보지 않기</button>
              <span className="ml-auto text-[11px] font-semibold text-[#9AA9C3]">모든 메뉴의 안내를 끕니다</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// [?] 도움말 — 기간 안에 data-tour 요소 오른쪽 위에 작은 ?를 붙인다(누르면 한 줄 설명)
function HelpDots() {
  const [dots, setDots] = React.useState([]);
  const [open, setOpen] = React.useState("");
  React.useEffect(() => {
    const upd = () => {
      const list = [...document.querySelectorAll("[data-tour]")].filter((el) => HELP_TEXT[el.dataset.tour] && visible(el)).map((el) => { const r = el.getBoundingClientRect(); return { k: el.dataset.tour, x: r.right, y: r.top }; })
        .filter((d) => d.y > 0 && d.y < window.innerHeight);
      setDots((p) => (JSON.stringify(p) === JSON.stringify(list) ? p : list));
    };
    upd();
    const t = setInterval(upd, 1200);
    window.addEventListener("scroll", upd, true); window.addEventListener("resize", upd);
    return () => { clearInterval(t); window.removeEventListener("scroll", upd, true); window.removeEventListener("resize", upd); };
  }, []);
  return dots.map((d) => (
    <React.Fragment key={d.k}>
      <button type="button" data-kp-tour="help" onClick={() => setOpen(open === d.k ? "" : d.k)} aria-label="도움말"
        className="fixed z-[9001] w-[18px] h-[18px] rounded-full bg-[#2D4C82] text-white text-[11px] font-black leading-none grid place-items-center shadow ring-2 ring-white"
        style={{ left: d.x - 10, top: d.y - 8 }}>?</button>
      {open === d.k && (
        <div data-kp-tour="help-pop" className="fixed z-[9002] max-w-[260px] rounded-xl bg-[#0F1A30] text-white text-[12.5px] font-semibold leading-snug px-3 py-2 shadow-lg"
          style={{ left: Math.max(8, Math.min(window.innerWidth - 268, d.x - 130)), top: d.y + 14 }} onClick={() => setOpen("")}>{HELP_TEXT[d.k]}</div>
      )}
    </React.Fragment>
  ));
}

export default TourHost;
