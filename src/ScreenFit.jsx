// ======================= src/ScreenFit.jsx =======================
// 🖥 2026-11-10 화면 맞춤 — 어느 컴퓨터에서 열어도 표(선택칸 ~ 끝 칸)가 한 화면에 꽉 차게
//  · [화면 맞춤]을 켜면 지금 화면에서 가장 큰 표를 그 자리 폭에 맞춰 줄이거나 키운다(67% ~ 125%) — 메뉴 · 버튼은 그대로
//    작은 노트북은 줄이고, 큰 모니터는 키운다 · 메뉴를 옮기거나 창 크기 · 칸 숨김이 바뀌면 다시 맞춘다
//  · 켜고 끈 상태는 계정마다 기억(어느 PC에서 로그인해도 같이) — ColumnLayout의 prefs.fit
//  · 브라우저 확대(Ctrl + / -)가 100%가 아니면 위쪽에 안내(Ctrl + 0 · 화면 맞춤 켜기)
import React from "react";
import { createPortal } from "react-dom";
import { getPref, setPref, usePref } from "./ColumnLayout";

const MIN = 0.67, MAX = 1.25; // 67% 아래는 글씨가 너무 작아진다 — 그래도 넘치면 안내(칸 숨기기)
// 화면 전체가 아니라 "표만" 줄이고 키운다 — 메뉴 · 버튼 · 높이는 그대로, 표 글씨 · 칸만 맞춘다
const rootEl = () => document.getElementById("root");
let FIT_T = null; // 지금 맞춘 표
const zoomOf = (t) => parseFloat(t?.style.zoom) || 1;
const zoomNow = () => (FIT_T && FIT_T.isConnected ? zoomOf(FIT_T) : 1);
const emit = () => { try { window.dispatchEvent(new Event("kp-screen-fit")); } catch { /* 무시 */ } };
function clearFit() { if (FIT_T) { FIT_T.style.zoom = ""; delete FIT_T.dataset.kpfit; delete FIT_T.dataset.kpfitBig; } FIT_T = null; emit(); }
function setTableZoom(t, z) {
  if (FIT_T && FIT_T !== t) { FIT_T.style.zoom = ""; delete FIT_T.dataset.kpfit; delete FIT_T.dataset.kpfitBig; }
  const v = Math.round(z * 100) / 100;
  t.style.zoom = v === 1 ? "" : String(v); t.dataset.kpfit = String(v); FIT_T = t; emit();
}

const scrollParent = (el) => { for (let n = el?.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o === "auto" || o === "scroll") return n; } return el?.parentElement || null; };
// 지금 화면의 주인공 표 — 보이는 표 중 가장 넓은 것(칸 3개 이상 · 줄 1개 이상)
function mainTable() {
  let best = null, bw = 0;
  document.querySelectorAll("#root table").forEach((t) => {
    if (!t.offsetParent || !t.tHead || t.rows.length < 2) return;
    if (t.closest("[data-kp-dialog],[role=dialog]")) return; // 팝업 안 표는 빼고
    const hr = t.tHead.rows[t.tHead.rows.length - 1]; if (!hr || hr.cells.length < 3) return;
    const w = t.getBoundingClientRect().width / zoomOf(t); if (w > bw) { bw = w; best = t; }
  });
  return best;
}
// 표가 줄바꿈 없이 펼쳐졌을 때 폭(표 자신의 CSS px)
function naturalWidth(t) {
  const pw = t.style.width, pm = t.style.maxWidth, pz = t.style.zoom;
  t.style.zoom = ""; t.style.width = "max-content"; t.style.maxWidth = "none";
  const w = t.getBoundingClientRect().width;
  t.style.width = pw; t.style.maxWidth = pm; t.style.zoom = pz;
  return w;
}
let BIG = false; // 크게 보기 — 칸 안쪽 여백을 줄여 같은 폭에 더 크게
let XL = false; // 🔍 2026-11-12 더 크게 — 글씨를 100% 아래로 줄이지 않는다(칸이 많으면 표를 옆으로 넘겨 본다)
export function fitNow() {
  const t = mainTable();
  if (!t) return null;
  if (BIG) t.dataset.kpfitBig = "1"; else delete t.dataset.kpfitBig;
  const sp = scrollParent(t);
  const avail = (sp || t.parentElement).clientWidth - 2;
  const nat = naturalWidth(t);
  if (!nat || !avail) return null;
  let z = Math.min(MAX, Math.max(MIN, avail / nat));
  if (XL) z = Math.max(z, 1);
  if (Math.abs(z - zoomOf(t)) < 0.015) z = zoomOf(t);
  setTableZoom(t, z);
  // 칸이 너무 많아 최소 배율로도 다 안 들어가면 — 안 쓰는 칸 숨기기 안내(화면마다 한 번)
  if (!XL && avail / nat < MIN) {
    const k = `kpFitHint:${t.tHead?.rows?.[0]?.cells?.length || 0}:${location.pathname}`;
    try { if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, "1"); window.dispatchEvent(new CustomEvent("kp-col-toast", { detail: `칸이 많아 ${Math.round(MIN * 100)}%로 줄여도 옆으로 조금 넘쳐요 · 컬럼명 오른쪽 클릭 › 이 칸 숨기기로 안 쓰는 칸을 숨기면 한 화면에 들어와요` })); } } catch { /* 무시 */ }
  }
  return z;
}

// DispatchApp(PC 화면)에 한 번 — menu가 바뀌면 다시 맞춘다
export function useScreenFit(menu) {
  const on = usePref("fit") === true;
  const big = usePref("fitBig") === true;
  const xl = usePref("fitXl") === true;
  BIG = on && (big || xl);
  XL = on && xl;
  // 크게 보기 켤 때 왼쪽 메뉴 접기 · 끌 때 원래대로
  const prevBig = React.useRef(null);
  React.useEffect(() => {
    const now = on && (big || xl);
    if (prevBig.current !== null && prevBig.current !== now) { try { window.dispatchEvent(new CustomEvent("kp-subnav-collapse", { detail: now })); } catch { /* 무시 */ } }
    prevBig.current = now;
  }, [on, big, xl]);
  const [pct, setPct] = React.useState(() => Math.round(zoomNow() * 100));
  React.useEffect(() => { const h = () => setPct(Math.round(zoomNow() * 100)); window.addEventListener("kp-screen-fit", h); return () => window.removeEventListener("kp-screen-fit", h); }, []);
  React.useEffect(() => {
    if (!on) { clearFit(); return undefined; }
    let t1 = null, t2 = null, last = null, busy = false;
    const run = () => { if (busy) return; busy = true; try { fitNow(); last = mainTable(); } finally { busy = false; } };
    t1 = setTimeout(run, 500); t2 = setTimeout(run, 1800); // 화면 · 데이터가 그려진 뒤
    let rt = null; const onResize = () => { clearTimeout(rt); rt = setTimeout(run, 300); };
    window.addEventListener("resize", onResize);
    window.addEventListener("kp-collayout-applied", onResize); // 칸 숨김 · 이동
    // 같은 메뉴 안에서 탭을 바꿔 다른 표가 나오면(1.5초에 한 번만 확인)
    let mt = 0; const mo = new MutationObserver(() => { if (mt) return; mt = setTimeout(() => { mt = 0; const t = mainTable(); if (t && t !== last) run(); }, 1500); });
    const r = rootEl(); if (r) mo.observe(r, { childList: true, subtree: true });
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(rt); clearTimeout(mt); clearFit(); window.removeEventListener("resize", onResize); window.removeEventListener("kp-collayout-applied", onResize); mo.disconnect(); };
  }, [on, big, xl, menu]);
  const toggle = () => setPref("fit", !on);
  // 누를 때마다: 끔 → 크게 보기(한 화면 그대로) → 더 크게(글씨 100% 이상 · 옆으로 넘김) → 끔
  const toggleBig = () => {
    if (!on) { setPref("fit", true); setPref("fitBig", true); setPref("fitXl", false); return; }
    if (xl) { setPref("fitXl", false); setPref("fitBig", false); return; }
    if (big) { setPref("fitXl", true); return; }
    setPref("fitBig", true);
  };
  return { on, big: on && (big || xl), xl: on && xl, pct, toggle, toggleBig };
}

export function ScreenFitButton({ fit }) {
  return (
    <div className="inline-flex items-center gap-1">
      <button type="button" onClick={fit.toggle} data-kp="screen-fit"
        title={fit.on ? "화면 맞춤 켜짐 — 표가 한 화면에 꽉 차게 자동으로 배율을 맞춥니다(누르면 끄고 100%로)" : "누르면 지금 모니터 크기에 맞춰 표 전체(선택 ~ 끝 칸)가 한 화면에 보이게 자동으로 맞춥니다"}
        className={`kp-chip-btn text-[12px] transition inline-flex items-center gap-1.5 ${fit.on ? "!bg-white !text-[#0F1A30] !border-white" : ""}`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        {fit.on ? <span className="tabular-nums">맞춤 {fit.pct}%</span> : "화면 맞춤"}
      </button>
      <button type="button" onClick={fit.toggleBig} data-kp="screen-fit-big"
        title={fit.xl ? "더 크게 켜짐 — 글씨를 100% 아래로 줄이지 않습니다. 칸이 많으면 표를 옆으로 넘겨 보세요(누르면 끄기)" : fit.big ? "크게 보기 켜짐 — 칸 여백을 줄이고 왼쪽 메뉴를 접어 표 글씨를 더 크게(한 번 더 누르면 '더 크게': 글씨 100% 이상 · 옆으로 넘김)" : "한 화면은 그대로, 칸 여백을 줄이고 왼쪽 메뉴를 접어 표 글씨를 더 크게 봅니다"}
        className={`kp-chip-btn text-[12px] transition inline-flex items-center gap-1 ${fit.big ? "!bg-white !text-[#0F1A30] !border-white" : ""}`}>
        <span className="font-black text-[13px] leading-none">가</span><span className="font-black text-[10px] leading-none -ml-0.5">{fit.xl ? "++" : "+"}</span>{fit.xl ? "더 크게" : "크게 보기"}
      </button>
    </div>
  );
}

// 브라우저 확대 비율(대략) — 창 바깥 폭 ÷ 안쪽 폭
const browserZoom = () => { try { if (!window.outerWidth || !window.innerWidth) return 100; return Math.round((window.outerWidth / window.innerWidth) * 100 / 5) * 5; } catch { return 100; } };
const NOTICE_OFF = "kpZoomNoticeOff";
export function BrowserZoomNotice({ fit }) {
  const [z, setZ] = React.useState(() => browserZoom());
  const [closed, setClosed] = React.useState(() => { try { return sessionStorage.getItem(NOTICE_OFF) === "1"; } catch { return false; } });
  const never = usePref("zoomNoticeOff") === true;
  React.useEffect(() => { let t = null; const h = () => { clearTimeout(t); t = setTimeout(() => setZ(browserZoom()), 250); }; window.addEventListener("resize", h); return () => { clearTimeout(t); window.removeEventListener("resize", h); }; }, []);
  // 크게(110%↑) 쓰는 건 화면 맞춤이 켜져 있으면 괜찮다 — 작게(90%↓) 볼 때만 안내
  if (never || closed || Math.abs(z - 100) < 10 || (z > 100 && fit?.on) || window.innerWidth < 900) return null;
  const close = () => { setClosed(true); try { sessionStorage.setItem(NOTICE_OFF, "1"); } catch { /* 무시 */ } };
  return createPortal(
    <div data-kp="zoom-notice" className="fixed left-1/2 -translate-x-1/2 top-[74px] z-[2147482000] w-[min(720px,94vw)]">
      <div className="relative overflow-hidden rounded-2xl text-white shadow-[0_18px_44px_rgba(6,12,26,.45)] ring-1 ring-white/10 px-4 py-3 flex items-center gap-3"
        style={{ background: "radial-gradient(500px 160px at 90% -40%, rgba(110,149,232,.35), transparent 60%), linear-gradient(120deg,#060C1A,#0F1A30 50%,#1B2B4B)", fontFamily: "'Noto Sans KR',sans-serif" }}>
        <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center bg-white/[0.08] ring-1 ring-white/15">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M8 11h6M11 8v6" /></svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">BROWSER ZOOM · {z}%</div>
          <div className="text-[14px] font-black leading-snug">브라우저 확대가 {z}%로 되어 있어요</div>
          <div className="text-[12px] text-white/65 leading-snug"><b className="text-white">Ctrl + 0</b>을 누르면 100%로 돌아가요{fit && !fit.on ? " · 표를 한 화면에 보려면 [화면 맞춤]" : ""}</div>
        </div>
        {fit && !fit.on && <button type="button" onClick={() => { fit.toggle(); close(); }} data-kp="zoom-notice-fit" className="shrink-0 h-9 px-3.5 rounded-xl bg-white text-[#0F1A30] text-[12.5px] font-black">화면 맞춤 켜기</button>}
        <button type="button" onClick={close} className="shrink-0 h-9 px-3 rounded-xl bg-white/[0.08] ring-1 ring-white/15 text-[12px] font-black hover:bg-white/[0.16]">닫기</button>
        <button type="button" onClick={() => setPref("zoomNoticeOff", true)} className="shrink-0 text-[11px] font-bold text-white/45 hover:text-white/80 underline underline-offset-2">다시 안 보기</button>
      </div>
    </div>,
    document.body
  );
}
export const screenFitOn = () => getPref("fit") === true;
