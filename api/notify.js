// api/notify.js (Vercel) — 푸시 알림 보내기
// ⭐ 2026-11-08 보안 점검 — 예전엔 로그인 확인이 없어 주소만 알면 누구나 아무 기기(FCM 토큰)에 알림을 보낼 수 있었다.
//  · Firebase 로그인 토큰(Authorization: Bearer <ID 토큰>) 필수 — Identity Toolkit(accounts:lookup)으로 확인한다(서비스 계정 없이 공개 웹 API 키만 사용)
//  · 최고관리자: tokens(기기 토큰) 또는 uids 로 보낼 수 있다
//  · 그 외 승인된 운송사 직원: uids 로만, 그리고 같은 회사 사람에게만(대상 users 문서를 "보내는 사람의 로그인"으로 읽는다 —
//    보안 규칙이 다른 회사 문서를 막고, 여기서 회사명도 한 번 더 비교한다). 기기 토큰은 서버가 대상 문서에서 꺼낸다.
//  · FCM 서버 키는 환경변수 FCM_SERVER_KEY 에서만 읽는다(코드에 박아 둔 키 없음). 없으면 503.
//  ※ 현재 앱에서 이 주소를 부르는 곳은 없다(알림은 Cloud Functions가 보냄). 예전 FCM HTTP(legacy) API는 Google이 2024년에 종료해
//    키가 있어도 실제 발송은 실패할 수 있다 — 쓸 일이 생기면 FCM HTTP v1으로 옮길 것.

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "dispatch-app-9b92f";
// 공개 웹 API 키(src/firebase.js 와 같은 값 — 비밀이 아님). 환경변수로 바꿀 수 있다.
const WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || "AIzaSyDaCTK03VbaXQCEKEiD7yp2KIzzX5x64a4";
const SUPER_EMAIL = "tjddnqkf@naver.com";
const MAX_TARGETS = 200;

async function lookupIdToken(idToken) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(WEB_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const u = j?.users?.[0];
  if (!u?.localId || u.disabled) return null;
  return { uid: u.localId, email: String(u.email || "").toLowerCase() };
}

// Firestore REST 값 → 일반 값(필요한 것만)
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
// 보내는 사람의 로그인으로 users/{uid} 읽기 — 보안 규칙이 그대로 적용된다(다른 회사 문서는 403)
async function readUser(uid, idToken) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const out = {};
  for (const [k, v] of Object.entries(j?.fields || {})) out[k] = fsVal(v);
  return out;
}
const tokensOf = (u) => {
  const out = new Set(Array.isArray(u?.fcmTokensOut) ? u.fcmTokensOut : []);
  return [...new Set([u?.fcmToken, ...(Array.isArray(u?.fcmTokens) ? u.fcmTokens : [])].filter((t) => typeof t === "string" && t && !out.has(t)))];
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const SERVER_KEY = process.env.FCM_SERVER_KEY;
  if (!SERVER_KEY) return res.status(503).json({ error: "NOT_CONFIGURED" });

  const m = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: "NO_TOKEN" });
  const idToken = m[1];
  const me = await lookupIdToken(idToken).catch(() => null);
  if (!me) return res.status(401).json({ error: "BAD_TOKEN" });

  const { tokens, uids, title, body } = req.body || {};
  const t = String(title || "").slice(0, 200);
  const b = String(body || "").slice(0, 1000);

  const myDoc = await readUser(me.uid, idToken).catch(() => null);
  const isTotalMaster = me.email === SUPER_EMAIL || myDoc?.role === "totalMaster";
  const myCo = String(myDoc?.companyName || "돌캐").trim();
  const staffOk = myDoc && myDoc.approved !== false && myDoc.employmentStatus !== "퇴사"
    && !["driver", "shipper", "cafeUser", "viewer"].includes(myDoc.role || "");
  if (!isTotalMaster && !staffOk) return res.status(403).json({ error: "FORBIDDEN" });

  let targets = [];
  if (Array.isArray(tokens) && tokens.length) {
    if (!isTotalMaster) return res.status(403).json({ error: "TOKENS_TOTALMASTER_ONLY" });
    targets = tokens.filter((x) => typeof x === "string" && x).slice(0, MAX_TARGETS);
  } else if (Array.isArray(uids) && uids.length) {
    const list = [...new Set(uids.filter((x) => typeof x === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(x)))].slice(0, MAX_TARGETS);
    for (const uid of list) {
      const u = await readUser(uid, idToken).catch(() => null);
      if (!u) continue; // 규칙상 못 읽는 사람(다른 회사) — 건너뜀
      if (!isTotalMaster && String(u.companyName || "돌캐").trim() !== myCo) continue;
      targets.push(...tokensOf(u));
    }
  }
  targets = [...new Set(targets)].slice(0, MAX_TARGETS * 3);
  if (!targets.length) return res.status(200).json({ ok: true, sent: 0 });

  const results = await Promise.allSettled(
    targets.map((token) =>
      fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `key=${SERVER_KEY}`,
        },
        body: JSON.stringify({
          to: token,
          priority: "high",
          notification: { title: t, body: b, sound: "default" },
          data: { title: t, body: b },
        }),
      })
    )
  );

  res.status(200).json({ sent: results.filter((r) => r.status === "fulfilled" && r.value?.ok).length, total: results.length });
}
