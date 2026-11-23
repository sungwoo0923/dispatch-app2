// ======================= src/linkedCompanyInfo.js =======================
// 🔒 2026-11-23 연동 운송사(화주 화면) · 소속 운송사(기사앱) 연락처 — 서버(linkedCompanyInfo)가 공유해도 되는 칸만 준다
//  (예전엔 운송사 가입 신청서를 통째로 읽어 직인 이미지 · 신청인 정보까지 받았다 — 이제 보안 규칙이 막는다)
//  → { companyName, representative, businessNumber, address, phone, email?, companyCode? } | null
import { auth, FUNCTIONS_BASE } from "./firebase";

let cache = { uid: "", at: 0, p: null };
export function fetchLinkedCompanyInfo() {
  const u = auth.currentUser;
  if (!u) return Promise.resolve(null);
  if (cache.uid === u.uid && cache.p && Date.now() - cache.at < 5 * 60 * 1000) return cache.p;
  const p = (async () => {
    try {
      const t = await u.getIdToken();
      const r = await fetch(`${FUNCTIONS_BASE}/linkedCompanyInfo`, { headers: { Authorization: `Bearer ${t}` } });
      if (!r.ok) return null;
      return (await r.json())?.info || null;
    } catch { return null; }
  })();
  cache = { uid: u.uid, at: Date.now(), p };
  return p;
}
