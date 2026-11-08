// api/_auth.js (Vercel 공용) — 🔒 2026-11-08 보안 점검: 서버 함수 호출자 확인
//  예전: /api/send-email · /api/send24 · /api/call24-* · /api/route · /api/fuel 이 로그인 확인 없이 열려 있어
//        주소만 알면 누구나 회사 메일 계정으로 메일을 보내고(스팸·피싱 중계), 24시콜·Tmap·오피넷 키를 대신 쓸 수 있었다.
//  이제: ① 로그인한 사용자의 Firebase ID 토큰(Authorization: Bearer …) — Identity Toolkit(accounts:lookup)으로 확인하고,
//          그 사용자 로그인으로 users/{uid}를 읽어(보안 규칙 그대로) 승인 여부·역할을 본다.
//        ② 서버끼리 부를 때(Cloud Functions 계약 만료 안내 메일 등): 헤더 x-kp-api-key = 환경변수 KP_API_SECRET(양쪽에 같은 값)
//  앱(src/apiAuthFetch.js)이 같은 주소의 /api/ 요청에 로그인 토큰을 자동으로 붙인다.
import crypto from "node:crypto";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "dispatch-app-9b92f";
// 공개 웹 API 키(src/firebase.js와 같은 값 — 비밀이 아님)
const WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || "AIzaSyDaCTK03VbaXQCEKEiD7yp2KIzzX5x64a4";
export const SUPER_EMAIL = "tjddnqkf@naver.com";

function fsVal(v) {
  if (!v || typeof v !== "object") return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fsVal);
  if ("mapValue" in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fsVal(x); return o; }
  return undefined;
}

// 서버끼리 부르는 비밀 키(설정돼 있을 때만) — 길이가 달라도 안전하게 비교
export function serverKeyOk(req) {
  const want = process.env.KP_API_SECRET || "";
  const got = String(req.headers?.["x-kp-api-key"] || "");
  if (!want || !got) return false;
  const a = crypto.createHash("sha256").update(want).digest();
  const b = crypto.createHash("sha256").update(got).digest();
  return crypto.timingSafeEqual(a, b);
}

// 로그인 사용자 { uid, email, profile } | null
export async function authUser(req) {
  const h = String(req.headers?.authorization || req.headers?.Authorization || "");
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  const idToken = m[1].trim();
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(WEB_API_KEY)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }),
    });
    if (!r.ok) return null;
    const u = (await r.json().catch(() => null))?.users?.[0];
    if (!u?.localId || u.disabled) return null;
    const email = String(u.email || "").toLowerCase();
    const p = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(u.localId)}`, { headers: { Authorization: `Bearer ${idToken}` } });
    const profile = {};
    if (p.ok) { const j = await p.json().catch(() => null); for (const [k, v] of Object.entries(j?.fields || {})) profile[k] = fsVal(v); }
    return { uid: u.localId, email, profile };
  } catch { return null; }
}

// 승인된 사용자인가 — roles를 주면 그 역할은 막는다(예: 메일은 기사 계정 불가)
export function approvedUser(user, { blockRoles = ["cafeUser"] } = {}) {
  if (!user) return false;
  if (user.email === SUPER_EMAIL) return true;
  const p = user.profile || {};
  if (!p.companyName && p.role !== "totalMaster") return false;
  if (p.approved === false) return false;
  return !blockRoles.includes(String(p.role || ""));
}

// 공통 문지기 — 통과하면 사용자(또는 { server: true }), 아니면 401을 보내고 null
export async function requireCaller(req, res, opts = {}) {
  if (opts.allowServerKey && serverKeyOk(req)) return { server: true };
  const user = await authUser(req);
  if (approvedUser(user, opts)) return user;
  res.status(401).json({ error: "로그인한 직원만 쓸 수 있어요(로그인 토큰 없음 또는 승인 전 계정).", code: "UNAUTHENTICATED" });
  return null;
}
