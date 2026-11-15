// ======================= src/brandConfig.js =======================
// 🎨 2026-11-15 브랜드 디자인 설정 — 관리자센터 › 운영 › 브랜드 디자인에서 고친 로고 · 색 · 자리별 바탕을 모든 화면에 반영
//  저장 위치(Firestore)
//   siteConfig/brand      지금 설정(누구나 읽기 — 로그인 전 화면에도 로고가 나온다) · 쓰기 최고관리자만
//   brandHistory/{id}     바꾸기 전 설정 사본(되돌리기용) — 최고관리자만
//  설정이 없으면(또는 off) 예전처럼 /brand/*.png 그림을 그대로 쓴다 → 아무것도 바꾸지 않으면 화면도 그대로
//  적용
//   · 로고: brand.jsx 의 LogisMark · LogisWordmark 가 useBrand() 로 받아 SVG 로 그린다
//   · 자리별 바탕: <style> 한 개(자리 선택자 → background !important)
//   · 브라우저 탭 아이콘 · 아이폰 홈 화면 아이콘: 설정으로 그림을 만들어 <link> 주소를 바꾼다
//   · 다음 접속 첫 화면(index.html)용으로 마크 · 바탕을 localStorage 에 넣어 둔다
import React from "react";
import { db } from "./firebase";
import { doc, onSnapshot, setDoc, addDoc, collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { sanitizeConfig, resolve, SPOTS, bgCss, iconSvg, markSvg, wordSvg, spotTone, svgToPng } from "./brandRender";

const CACHE_KEY = "kpBrand:v1";
export const BOOT_KEY = "kpBrandBoot:v1"; // index.html 이 읽는다(그 안의 짧은 스크립트와 이름을 맞출 것)
export const MAX_BYTES = 850000;           // Firestore 문서 1MB 한도 아래로

let cfg = null; let res = null; let started = false;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

function setCfg(c, { cache = true } = {}) {
  cfg = c && !c.off ? sanitizeConfig(c) : null;
  res = cfg ? resolve(cfg) : null;
  if (cache) { try { if (cfg) localStorage.setItem(CACHE_KEY, JSON.stringify(cfg)); else localStorage.removeItem(CACHE_KEY); } catch { /* 저장 못 해도 화면은 그대로 */ } }
  applyDom();
  emit();
}
// 처음엔 지난번 값으로 바로(깜빡임 없이) → Firestore 값이 오면 바꾼다
try { const raw = typeof localStorage !== "undefined" && localStorage.getItem(CACHE_KEY); if (raw) { cfg = sanitizeConfig(JSON.parse(raw)); res = cfg ? resolve(cfg) : null; } } catch { cfg = null; res = null; }

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  applyDom();
  try {
    onSnapshot(doc(db, "siteConfig", "brand"), (s) => setCfg(s.exists() ? s.data() : null), () => { /* 읽기 실패 — 지난 값 유지 */ });
  } catch { /* 무시 */ }
}
const subscribe = (f) => { start(); subs.add(f); return () => subs.delete(f); };
const snap = () => res;
// 브랜드 설정(없으면 null) — 화면 부품이 쓴다
export function useBrand() { return React.useSyncExternalStore(subscribe, snap, snap); }
export const getBrand = () => res;
export const getBrandConfig = () => cfg;

// ── 화면에 적용(바탕 · 아이콘 · 첫 화면 저장) ──
let styleEl = null; let iconJob = 0; let lastIconKey = "";
function applyDom() {
  if (typeof document === "undefined") return;
  const css = [];
  if (res) for (const s of SPOTS) { const bg = res.spots?.[s.id]?.bg; if (bg) css.push(`html body ${s.sel.split(",").join(`,html body `)}{background:${bgCss(bg)} !important}`); }
  if (css.length && !styleEl) { styleEl = document.createElement("style"); styleEl.setAttribute("data-kp-brand", ""); document.head.appendChild(styleEl); }
  if (styleEl) styleEl.textContent = css.join("\n");
  // 다음 접속 첫 화면(index.html)
  try {
    if (res) {
      const tone = spotTone(res, "splash");
      const bg = res.spots?.splash?.bg;
      localStorage.setItem(BOOT_KEY, JSON.stringify({ mk: markSvg(res, tone, 92), wm: wordSvg(res, tone, 20), bg: bg ? bgCss(bg) : "" }));
    } else localStorage.removeItem(BOOT_KEY);
  } catch { /* 무시 */ }
  // 탭 아이콘 · 홈 화면 아이콘
  const key = res ? JSON.stringify([res.mark, res.st.mark.icon, res.tile]) : "";
  if (key === lastIconKey) return;
  lastIconKey = key;
  const job = ++iconJob;
  if (!res) return; // 처음 그림(index.html 의 /icons/*.png) 그대로
  const r = res;
  (async () => {
    const fav = await svgToPng(iconSvg(r, 64, { round: 0.22 }), 64);
    const apple = await svgToPng(iconSvg(r, 180), 180);
    if (job !== iconJob) return;
    const set = (sel, href) => document.querySelectorAll(sel).forEach((l) => l.setAttribute("href", href));
    set('link[rel="icon"], link[rel="shortcut icon"]', fav);
    set('link[rel="apple-touch-icon"]', apple);
  })().catch(() => { /* 아이콘 못 만들어도 화면은 그대로 */ });
}

// ── 저장 · 되돌리기(관리자센터) ──
export async function saveBrand(next, by = "") {
  const clean = sanitizeConfig(next);
  if (!clean) throw new Error("설정을 읽지 못했어요.");
  const body = { ...clean, at: Date.now(), by: String(by || "").slice(0, 80) };
  const size = JSON.stringify(body).length;
  if (size > MAX_BYTES) throw new Error(`로고 그림이 너무 커요(${Math.round(size / 1024)}KB). 부분 수를 줄이거나 더 단순한 그림을 올려 주세요.`);
  if (cfg) await addDoc(collection(db, "brandHistory"), { cfg, at: Date.now(), by: body.by, note: "바꾸기 전" });
  await setDoc(doc(db, "siteConfig", "brand"), body);
  setCfg(body);
}
export async function resetBrand(by = "") {
  if (cfg) await addDoc(collection(db, "brandHistory"), { cfg, at: Date.now(), by: String(by || "").slice(0, 80), note: "처음 로고로 되돌리기 전" });
  await setDoc(doc(db, "siteConfig", "brand"), { off: true, at: Date.now(), by: String(by || "").slice(0, 80) });
  setCfg(null);
}
export async function listBrandHistory() {
  const s = await getDocs(query(collection(db, "brandHistory"), orderBy("at", "desc"), limit(20)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
