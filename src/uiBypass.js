// ======================= src/uiBypass.js =======================
// ⭐ 2026-11-07 화면 편집 "모두 끄기" — 문제가 생겼을 때 저장된 화면 편집(문구·모양·숨김·메뉴·목록·테마·안내)을
//  이 창에서만 통째로 끄고 원래 화면으로 본다. 서버 값은 그대로.
//   · 주소 뒤에 ?noui=1 → 끄기(이 탭이 닫힐 때까지 유지) · ?noui=0 → 다시 켜기
//   · Ctrl+Shift+U(맥 ⌘+Shift+U) → 끄기/켜기 후 새로고침
const KEY = "kpNoUi";
let off = false;
try {
  const q = new URLSearchParams(window.location.search).get("noui");
  if (q === "1") sessionStorage.setItem(KEY, "1");
  else if (q === "0") sessionStorage.removeItem(KEY);
  off = sessionStorage.getItem(KEY) === "1";
} catch { /* 저장공간 막힘 — 주소 값만 본다 */
  try { off = new URLSearchParams(window.location.search).get("noui") === "1"; } catch { off = false; }
}

export const uiBypassed = () => off;

// 끄기/켜기 — 새로고침해서 깨끗한 화면으로
export function setUiBypass(on) {
  try { if (on) sessionStorage.setItem(KEY, "1"); else sessionStorage.removeItem(KEY); } catch { /* 무시 */ }
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.has("noui")) u.searchParams.delete("noui");
    window.location.replace(u.toString());
  } catch { window.location.reload(); }
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.code === "KeyU")) {
      e.preventDefault();
      setUiBypass(!off);
    }
  }, true);
}
