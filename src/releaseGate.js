// ======================= src/releaseGate.js =======================
// 🚦 2026-11-13 업데이트 배포 잠금(화면 쪽) — 서버 쪽 설명은 api/shell.js 맨 위
//  · publicRelease/current = { url, version, build, enabled, releasedAt, releasedBy, history[] }
//    url = 가입자에게 보여 줄 버전의 Vercel 배포 주소 · enabled:false 또는 문서 없음 = 잠금 안 함(올리면 바로 모두에게)
//  · 최고관리자 · 부관리자 브라우저에는 쿠키 kp_ch=latest → 서버가 항상 최신 화면을 준다
//  · "새 버전이 나왔습니다" 안내(VersionCheck)는 가입자에게는 배포한 버전 기준, 관리자에게는 최신 기준
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { scheduledPinOf as schedPinCore } from "./forceUpdateCore";

/* global __APP_VERSION__, __BUILD_TIME__, __DEPLOY_URL__ */
export const CUR_VER = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
export const CUR_BUILD = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "";
export const CUR_URL = typeof __DEPLOY_URL__ !== "undefined" ? __DEPLOY_URL__ : "";
export const RELEASE_REF = () => doc(db, "publicRelease", "current");

const COOKIE = "kp_ch";
// 🚚 2026-11-26 사용자 요청 — 기사앱 화면(/driver-…)은 배포 잠금 없이 항상 최신(기사 화면 고친 것이 바로 가야 한다) · 배차자 화면은 그대로 [업데이트 배포]를 따른다
export const isDriverPage = () => { try { return /^\/driver-/.test(window.location.pathname); } catch { return false; } };
export const isLatestChannel = () => { try { return isDriverPage() || /(?:^|;\s*)kp_ch=latest(?:;|$)/.test(document.cookie); } catch { return false; } };
// 로그인한 계정의 권한이 정해질 때마다 부른다 — 바뀌었으면 true
export function syncReleaseChannel(isAdmin) {
  try {
    let had = false; try { had = /(?:^|;\s*)kp_ch=latest(?:;|$)/.test(document.cookie); } catch { had = false; } // 쿠키만 본다(기사 화면 최신은 쿠키와 상관없음 — 쿠키를 바꿨다고 새로고침이 반복되지 않게)
    if (isAdmin && !had) { document.cookie = `${COOKIE}=latest; path=/; max-age=${365 * 86400}; samesite=lax`; return true; }
    if (!isAdmin && had) { document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax`; return true; }
  } catch { /* 무시 */ }
  return false;
}

const basePinOf = (d) => (d && d.enabled !== false && d.url && d.build ? { url: d.url, version: d.version || "", build: d.build } : null);
// ⏱ 2026-11-25 예약 배포(강제 업데이트 예약) — publicRelease/current.scheduled = { url, version, build, at, scope, companies }
//  예약 시각 전에는 아무도 새 버전을 보지 않는다(일반 "업데이트" 안내도 안 뜸). 시각이 지나면 대상 회사에게만 이 버전이 "배포한 버전"이 된다.
const myCompany = () => { try { return String(localStorage.getItem("userCompany") || "").trim(); } catch { return ""; } };
const myForced = () => { try { return localStorage.getItem("kpForced") || ""; } catch { return ""; } };
export const scheduledPinOf = (d, now = Date.now(), company = myCompany()) => schedPinCore(d, { now, company, forced: myForced() });
const pinOf = (d) => {
  const base = basePinOf(d); const sch = scheduledPinOf(d);
  if (sch && (!base || String(sch.build) > String(base.build))) return sch;
  return base;
};
// 첫 화면의 시작 스크립트(vite.config.js)가 읽는 값 — 이 PC가 따라갈 배포 버전(없으면 지운다)
const rememberPin = (pin) => { try { if (pin) localStorage.setItem("kpPin", JSON.stringify({ build: pin.build, version: pin.version })); else localStorage.removeItem("kpPin"); } catch { /* 무시 */ } };
export async function readPin() {
  try { const s = await getDoc(RELEASE_REF()); const pin = s.exists() ? pinOf(s.data()) : null; rememberPin(pin); return pin; }
  catch (e) { return String(e?.code || "").includes("permission") ? null : undefined; } // 규칙 배포 전(권한 없음) = 잠금 없음으로 · undefined = 잠깐 못 읽음
}
// 이 브라우저가 따라가야 할 버전 — { version, build } (없으면 null)
export async function targetVersion() {
  let latest = null;
  try { const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" }); if (r.ok) latest = await r.json(); } catch { /* 오프라인 */ }
  if (isLatestChannel()) return latest;
  const pin = await readPin();
  if (pin === undefined) return null; // 잠금 여부를 모르면 안내하지 않는다(잘못된 업데이트 안내 방지)
  return pin || latest;
}

// ── 관리센터 ──
export const watchRelease = (cb) => onSnapshot(RELEASE_REF(), (s) => cb(s.exists() ? s.data() : null), () => cb(null));
export async function latestVersion() { const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" }); return r.json(); }
// 지금 내 화면(최신) 버전을 모든 가입자에게 배포
//  🧹 2026-11-15 배포하면 예전 버전 기록은 남기지 않는다(사용자 요청) — 기록은 지금 배포한 것 하나만, 고를 버전 목록도 이보다 예전 것은 지운다
export async function publishRelease(latest, note = "") { return pinRelease(latest, note); }
export const setReleaseLock = (enabled) => setDoc(RELEASE_REF(), { enabled: !!enabled, lockChangedAt: Date.now(), lockChangedBy: auth.currentUser?.email || "" }, { merge: true });
export async function checkRelease() { const r = await fetch(`/api/shell?check=1&t=${Date.now()}`, { cache: "no-store" }); return r.json(); }

// 🚦 2026-11-14 가입자 화면 버전 고르기 — 올라간 화면(빌드)을 관리자가 열 때마다 기록해 두고(publicRelease/builds), 관리센터에서 골라 고정한다
//  · 예전엔 [업데이트 배포]를 한 번도 누르지 않으면 "잠금 없음"이라 가입자도 최신을 봤다 → 고정할 버전을 고를 수 있게
export const BUILDS_REF = () => doc(db, "publicRelease", "builds");
export async function registerBuild() {
  if (!CUR_URL || !CUR_BUILD || CUR_VER === "dev") return;
  try {
    const k = `b_${CUR_BUILD.replace(/[^0-9A-Za-z]/g, "")}`;
    await setDoc(BUILDS_REF(), { [k]: { version: CUR_VER, build: CUR_BUILD, url: CUR_URL, at: Date.now() } }, { merge: true });
  } catch { /* 권한 없음(가입자) · 오프라인 — 무시 */ }
}
export const watchBuilds = (cb) => onSnapshot(BUILDS_REF(), (s) => cb(s.exists() ? Object.values(s.data() || {}).filter((x) => x && x.build && x.url).sort((a, b) => (b.build > a.build ? 1 : -1)) : []), () => cb([]));
// Vercel 배포 주소를 직접 넣어 고정 — 서버(api/shell.js ?probe=)가 그 주소의 버전 정보를 읽어 준다
export async function probeDeploy(host) { const r = await fetch(`/api/shell?probe=${encodeURIComponent(host)}&t=${Date.now()}`, { cache: "no-store" }); return r.json(); }
export async function pinRelease(rec, note = "") {
  const by = auth.currentUser?.email || "";
  const r = { url: rec.url, version: rec.version || "", build: rec.build, at: Date.now(), by, note: String(note || "").slice(0, 200) };
  // 직접 배포하면 남아 있던 예약 배포는 지운다(배포한 버전이 기준)
  await setDoc(RELEASE_REF(), { enabled: true, url: r.url, version: r.version, build: r.build, releasedAt: r.at, releasedBy: by, note: r.note, history: [r], scheduled: null }, { merge: true });
  await pruneBuilds(r.build).catch(() => {});
}
// 배포한 버전보다 예전에 올린 화면은 목록에서 지운다(배포한 버전 · 그 뒤에 올린 것만 남김)
export async function pruneBuilds(keepFromBuild) {
  if (!keepFromBuild) return;
  const s = await getDoc(BUILDS_REF());
  if (!s.exists()) return;
  const all = s.data() || {};
  const keep = Object.fromEntries(Object.entries(all).filter(([, b]) => b && b.build && b.build > keepFromBuild));
  if (Object.keys(keep).length === Object.keys(all).length) return;
  await setDoc(BUILDS_REF(), keep);
}
// 가입자 브라우저가 배포 버전보다 새 화면을 보고 있으면(첫 방문 · 저장값이 지워진 뒤 등) 한 번 새로고침해 배포 버전으로 맞춘다
export async function enforcePin() {
  if (isLatestChannel() || CUR_VER === "dev") return;
  const pin = await readPin(); // 이 PC에 kpPin 을 적어 둔다 → 새로고침하면 시작 스크립트가 배포 버전 화면을 연다
  if (!pin || !pin.build || !CUR_BUILD || pin.build >= CUR_BUILD) return;
  if (typeof window !== "undefined" && window.__kpPinned) return; // 이미 배포 버전 화면
  try { const k = `kpPinFix:${pin.build}`; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch { return; }
  window.location.reload();
}

// ⏱ 2026-11-25 예약 배포 — 강제 업데이트 예약과 함께 "그 시각에 열릴 버전"만 적어 둔다(지금 배포하지 않음)
export async function scheduleRelease(rec, { at, scope = "all", companies = [] } = {}) {
  const by = auth.currentUser?.email || "";
  await setDoc(RELEASE_REF(), { scheduled: { url: rec.url, version: rec.version || "", build: rec.build, at: Number(at) || Date.now(), scope, companies: scope === "pick" ? companies : [], by, setAt: Date.now() } }, { merge: true });
}
export const clearScheduledRelease = () => setDoc(RELEASE_REF(), { scheduled: null }, { merge: true });
// 예약 시각이 지난 뒤 화면을 새로 열 때 이 PC가 열 버전을 미리 적어 둔다(시작 스크립트가 kpPin 을 읽는다)
export function rememberForcedBuild(build, version = "") {
  try {
    if (!build) return;
    localStorage.setItem("kpPin", JSON.stringify({ build, version })); // 시작 스크립트: 올라온 최신보다 예전이면 그 버전을, 같으면 최신을 연다
    localStorage.setItem("kpForced", build);
  } catch { /* 무시 */ }
}
