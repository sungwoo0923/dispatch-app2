// ======================= src/apiAuthFetch.js =======================
// 🔒 2026-11-08 보안 점검 — Vercel 서버 함수(/api/send-email · /api/route · /api/fuel · /api/send24 · /api/call24-*)가
//  이제 로그인 토큰을 확인한다(api/_auth.js). 화면 곳곳의 fetch("/api/…")를 하나하나 고치지 않도록
//  같은 주소(또는 VITE_API_BASE)의 /api/ 요청에만 로그인한 사용자의 ID 토큰을 Authorization 헤더로 자동으로 붙인다.
//  · 다른 사이트로 가는 요청에는 절대 붙이지 않는다(토큰 유출 방지)
//  · 로그인 안 한 화면(업로드 링크 등)은 그대로 — 토큰 없이 나간다
import { auth } from "./firebase";

const API_BASE = String(import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");

export function isOwnApiUrl(u, here = (typeof location !== "undefined" ? location.href : "http://localhost/")) {
  try {
    const url = new URL(u, here);
    if (!url.pathname.startsWith("/api/")) return false;
    if (url.origin === new URL(here).origin) return true;
    return !!API_BASE && new URL(API_BASE).origin === url.origin;
  } catch { return false; }
}

if (typeof window !== "undefined" && !window.__kpApiAuthFetch) {
  window.__kpApiAuthFetch = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
    const user = auth?.currentUser;
    if (url && user && isOwnApiUrl(url)) {
      try {
        const token = await user.getIdToken();
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
        return orig(input, { ...(init || {}), headers });
      } catch { /* 토큰을 못 받으면 그냥 보낸다(서버가 401) */ }
    }
    return orig(input, init);
  };
}
