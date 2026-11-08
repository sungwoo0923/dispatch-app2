// ======================= functions/appCheck.js =======================
// 🛡 2026-11-08 Firebase App Check — "우리 앱(웹 app·hub·홈페이지)에서 온 요청만" 서버 함수를 쓰게 한다.
//  설정: functions/.env 의 APPCHECK_MODE = off | monitor | enforce (없거나 틀리면 monitor)
//   · off     — 확인하지 않는다
//   · monitor — 토큰이 있으면 확인만 하고, 없거나 틀리면 로그만 남기고 그대로 처리한다(기본값 · 1주일 지켜보기)
//   · enforce — 토큰이 없거나 틀리면 401로 거절한다(onCall 은 enforceAppCheck: true 로 배포)
//  로그 찾기(Cloud Logging): "[AppCheck]" 로 검색 → endpoint=함수이름 · reason=missing|invalid
//  onRequest: 화면이 보내는 X-Firebase-AppCheck 헤더를 확인(src/firebase.js · cafe-site/src/firebase.js 가 자동으로 붙인다)
//  onCall: 아래 appCheckCallOpts() 를 runWith 에 넣는다(모드는 배포할 때 정해진다 → 모드를 바꾸면 함수 재배포)
//  제외(일부러 확인 안 함): 외부 웹훅(hubVaDeposit) · 키로 여는 관리 도구(backfillGsheet* 등) · 예약 실행 · Firestore 트리거
//   → 목록은 docs/appcheck-setup.md
const MODES = ["off", "monitor", "enforce"];
const HEADER = "x-firebase-appcheck";
// CORS 허용 헤더에 이것을 넣어야 브라우저가 X-Firebase-AppCheck 헤더를 보낼 수 있다
const CORS_HEADERS = "Authorization, Content-Type, X-Firebase-AppCheck";

function appCheckMode(env = process.env) {
  const m = String(env.APPCHECK_MODE || "").trim().toLowerCase();
  return MODES.includes(m) ? m : "monitor";
}

// onCall(v1 runWith) 옵션 — enforce 일 때만 enforceAppCheck
function appCheckCallOpts(env = process.env) {
  return appCheckMode(env) === "enforce" ? { enforceAppCheck: true } : {};
}

// verifyToken(token) → Promise(성공) / throw(실패). 테스트에서는 가짜를 넣는다.
function makeAppCheckGate({ verifyToken, getMode = () => appCheckMode(), log = console } = {}) {
  // true = 계속 처리 · false = 이미 401 로 응답했음
  async function gate(req, res, name) {
    const mode = getMode();
    if (mode === "off" || req.method === "OPTIONS") return true;
    const endpoint = name || process.env.FUNCTION_TARGET || process.env.K_SERVICE || "unknown";
    const raw = (typeof req.get === "function" ? req.get(HEADER) : null) || req.headers?.[HEADER] || "";
    const token = String(raw).trim();
    let reason = "";
    if (!token) reason = "missing";
    else {
      try { await verifyToken(token); return true; } catch (e) { reason = "invalid"; if (mode === "enforce") log.warn(`[AppCheck] endpoint=${endpoint} reason=invalid detail=${e?.message || e}`); }
    }
    if (mode === "enforce") {
      if (reason === "missing") log.warn(`[AppCheck] endpoint=${endpoint} reason=missing mode=enforce → 401`);
      try { res.set("Access-Control-Allow-Origin", "*"); } catch { /* 무시 */ }
      res.status(401).json({ error: "APP_CHECK_FAILED", reason });
      return false;
    }
    log.warn(`[AppCheck] endpoint=${endpoint} reason=${reason} mode=monitor (그대로 처리)`);
    return true;
  }
  // 핸들러 통째로 감싸기 — (req, res) => ... 형태의 핸들러에 쓴다
  const wrap = (name, handler) => async (req, res) => {
    if (!(await gate(req, res, name))) return;
    return handler(req, res);
  };
  return { gate, wrap };
}

module.exports = { MODES, HEADER, CORS_HEADERS, appCheckMode, appCheckCallOpts, makeAppCheckGate };
