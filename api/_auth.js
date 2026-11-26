// ======================= api/_auth.js =======================
// 🔒 2026-11-26 보안 — Vercel API 공용 로그인 확인(파일명이 _ 로 시작해 Vercel이 주소로 만들지 않는다)
//  · Authorization: Bearer <Firebase ID 토큰> 을 Identity Toolkit(accounts:lookup)으로 확인한다(api/notify.js 와 같은 방식 · 서비스 계정 없이 공개 웹 API 키만)
//  · 그 사람의 users/{uid} 를 "그 사람 로그인"으로 읽어(보안 규칙 그대로) 승인된 운송사 직원인지 본다
//  · 통과하면 { uid, email, user } · 아니면 null(응답은 이미 보냄)
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "dispatch-app-9b92f";
// 공개 웹 API 키(src/firebase.js 와 같은 값 — 비밀이 아님)
const WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || "AIzaSyDaCTK03VbaXQCEKEiD7yp2KIzzX5x64a4";
const SUPER_EMAIL = "tjddnqkf@naver.com";
const NON_STAFF = ["driver", "shipper", "cafeUser"];

const withTimeout = async (url, opts = {}, ms = 5000) => {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); } finally { clearTimeout(t); }
};

async function lookupIdToken(idToken) {
  const r = await withTimeout(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(WEB_API_KEY)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const u = j?.users?.[0];
  if (!u?.localId || u.disabled) return null;
  return { uid: u.localId, email: String(u.email || "").toLowerCase() };
}

function fsVal(v) {
  if (!v || typeof v !== "object") return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("nullValue" in v) return null;
  return undefined;
}
async function readMe(uid, idToken) {
  const r = await withTimeout(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const out = {};
  for (const [k, v] of Object.entries(j?.fields || {})) out[k] = fsVal(v);
  return out;
}

// 승인된 운송사 직원만(최고관리자 포함). allowViewer=false 면 조회전용(viewer)도 거절
export async function requireStaff(req, res, { allowViewer = true } = {}) {
  const m = String(req.headers?.authorization || "").match(/^Bearer (.+)$/);
  if (!m) { res.status(401).json({ success: false, error: "NO_TOKEN", message: "로그인이 필요해요" }); return null; }
  const me = await lookupIdToken(m[1]).catch(() => null);
  if (!me) { res.status(401).json({ success: false, error: "BAD_TOKEN", message: "로그인이 필요해요" }); return null; }
  const u = await readMe(me.uid, m[1]).catch(() => null);
  const tm = me.email === SUPER_EMAIL || u?.role === "totalMaster";
  const staff = !!u && u.approved !== false && String(u.employmentStatus || "").trim() !== "퇴사"
    && !NON_STAFF.includes(u.role || "") && (allowViewer || u.role !== "viewer");
  if (!tm && !staff) { res.status(403).json({ success: false, error: "FORBIDDEN", message: "운송사 직원만 쓸 수 있어요" }); return null; }
  return { uid: me.uid, email: me.email, user: u || {} };
}
