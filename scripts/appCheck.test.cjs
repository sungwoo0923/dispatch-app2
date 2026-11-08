// 🛡 2026-11-08 App Check 도우미(functions/appCheck.js) — 단위 테스트(가짜 검증기, 에뮬레이터 불필요)
//  실행: node scripts/appCheck.test.cjs
const assert = require("node:assert/strict");
const path = require("path");
const { appCheckMode, appCheckCallOpts, makeAppCheckGate, CORS_HEADERS } = require(path.resolve(__dirname, "../functions/appCheck.js"));

function fakeReq(token, method = "POST") {
  const headers = token ? { "x-firebase-appcheck": token } : {};
  return { method, headers, get: (h) => headers[String(h).toLowerCase()] };
}
function fakeRes() {
  const r = { code: 200, body: null, hdr: {} };
  r.set = (k, v) => { r.hdr[k] = v; return r; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const verifyToken = async (t) => { if (t !== "good") throw new Error("bad token"); return { appId: "x" }; };

(async () => {
  // 모드 읽기
  assert.equal(appCheckMode({}), "monitor");
  assert.equal(appCheckMode({ APPCHECK_MODE: "ENFORCE " }), "enforce");
  assert.equal(appCheckMode({ APPCHECK_MODE: "off" }), "off");
  assert.equal(appCheckMode({ APPCHECK_MODE: "weird" }), "monitor");
  assert.deepEqual(appCheckCallOpts({ APPCHECK_MODE: "enforce" }), { enforceAppCheck: true });
  assert.deepEqual(appCheckCallOpts({ APPCHECK_MODE: "monitor" }), {});
  assert.deepEqual(appCheckCallOpts({}), {});
  assert.ok(CORS_HEADERS.includes("X-Firebase-AppCheck"));

  const logs = [];
  const log = { warn: (m) => logs.push(m) };
  const make = (mode) => makeAppCheckGate({ verifyToken, getMode: () => mode, log }).gate;

  // off — 아무것도 안 본다
  logs.length = 0;
  assert.equal(await make("off")(fakeReq(""), fakeRes(), "ep"), true);
  assert.equal(logs.length, 0);

  // monitor — 통과 + 로그(엔드포인트 이름 포함)
  logs.length = 0;
  let res = fakeRes();
  assert.equal(await make("monitor")(fakeReq(""), res, "checkEmail"), true);
  assert.equal(res.code, 200);
  assert.match(logs[0], /endpoint=checkEmail reason=missing/);
  assert.equal(await make("monitor")(fakeReq("nope"), fakeRes(), "checkEmail"), true);
  assert.match(logs[1], /reason=invalid/);
  logs.length = 0;
  assert.equal(await make("monitor")(fakeReq("good"), fakeRes(), "checkEmail"), true);
  assert.equal(logs.length, 0);

  // enforce — 없거나 틀리면 401, 맞으면 통과, OPTIONS(사전 요청)는 통과
  res = fakeRes();
  assert.equal(await make("enforce")(fakeReq(""), res, "ep"), false);
  assert.equal(res.code, 401);
  assert.equal(res.body.reason, "missing");
  assert.equal(res.hdr["Access-Control-Allow-Origin"], "*");
  res = fakeRes();
  assert.equal(await make("enforce")(fakeReq("nope"), res, "ep"), false);
  assert.equal(res.code, 401);
  assert.equal(res.body.reason, "invalid");
  res = fakeRes();
  assert.equal(await make("enforce")(fakeReq("good"), res, "ep"), true);
  assert.equal(res.code, 200);
  assert.equal(await make("enforce")(fakeReq("", "OPTIONS"), fakeRes(), "ep"), true);

  // wrap — 거절되면 핸들러를 부르지 않는다
  let called = 0;
  const { wrap } = makeAppCheckGate({ verifyToken, getMode: () => "enforce", log });
  const h = wrap("ep", async () => { called++; });
  await h(fakeReq(""), fakeRes());
  await h(fakeReq("good"), fakeRes());
  assert.equal(called, 1);

  console.log("✓ appCheck 도우미 테스트 통과");
})().catch((e) => { console.error(e); process.exit(1); });
