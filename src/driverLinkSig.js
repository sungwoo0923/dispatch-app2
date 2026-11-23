// ======================= src/driverLinkSig.js =======================
// 🔒 2026-11-23 기사 통합 업로드 링크(/driver-upload)의 회사 서명 — 서버(driverLinkSig)가 우리 회사 직원에게만 준다.
//  받아 두면 fsTenant.withCo() 가 링크에 co(회사) 와 함께 cs(서명)를 붙인다 → 서버(driverSearch)가 그 회사가 보낸 링크인지 확인한다.
//  (주소의 회사 이름만 바꿔 다른 운송사 기사 오더를 찾아보던 길을 막는다)
import { auth, FUNCTIONS_BASE } from "./firebase";

const KEY = (co) => `kpDlSig:${co}`;
const inflight = new Map();
export function cachedDriverLinkSig(co) {
  try { return localStorage.getItem(KEY(String(co || "").trim())) || ""; } catch { return ""; }
}
export async function ensureDriverLinkSig(co) {
  const c = String(co || "").trim();
  if (!c || cachedDriverLinkSig(c)) return cachedDriverLinkSig(c);
  if (inflight.has(c)) return inflight.get(c);
  const p = (async () => {
    try {
      const u = auth.currentUser;
      if (!u) return "";
      const t = await u.getIdToken();
      const r = await fetch(`${FUNCTIONS_BASE}/driverLinkSig?co=${encodeURIComponent(c)}`, { headers: { Authorization: `Bearer ${t}` } });
      if (!r.ok) return "";
      const j = await r.json();
      if (j?.cs && j.co === c) { try { localStorage.setItem(KEY(c), j.cs); } catch { /* 무시 */ } return j.cs; }
      return "";
    } catch { return ""; } finally { inflight.delete(c); }
  })();
  inflight.set(c, p);
  return p;
}
