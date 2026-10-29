// ======================= relay24/server.js =======================
// 📡 24시콜 고정 IP 중계 서버 — 외부 라이브러리 없이 Node 18+ 만으로 동작한다.
//  - Vercel(/api/send24 등)이 이미 암호화한 요청을 받아, 이 서버의 고정 IP로 24시콜에 그대로 전달한다.
//  - 24시콜 마이페이지 › 허용 IP(운영/테스트)에는 이 서버의 IP 1개만 등록하면 된다.
//  - 보안: Vercel과 이 서버가 같은 비밀값(RELAY_SECRET)으로 서명(HMAC)한 요청만 받는다. 60초 지난 요청은 거부.
//
//  환경변수(.env 또는 systemd Environment):
//    RELAY_SECRET   Vercel의 CALL24_RELAY_SECRET 과 같은 값 (아무 긴 랜덤 문자열)
//    CALL24_API_KEY 24시콜 마이페이지 인증키
//    CALL24_BASE    https://api.15887924.com:18099 (운영) / :18091 (테스트)
//    PORT           기본 8024
const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 8024);
const SECRET = process.env.RELAY_SECRET || "";
const API_KEY = process.env.CALL24_API_KEY || "";
const BASE = (process.env.CALL24_BASE || "https://api.15887924.com:18099").replace(/\/+$/, "");
const ALLOWED_PATHS = /^\/api\/order\/[A-Za-z0-9]+$/;

function send(res, status, obj) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); }
function myIp() {
  return new Promise((resolve) => {
    https.get("https://checkip.amazonaws.com", { timeout: 3000 }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => resolve(d.trim())); }).on("error", () => resolve("unknown"));
  });
}

http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return myIp().then((ip) => send(res, 200, { ok: true, ip, base: BASE, hasKey: !!API_KEY, hasSecret: !!SECRET, time: new Date().toISOString() }));
  }
  if (req.method !== "POST" || req.url !== "/relay") return send(res, 404, { relayError: "not found" });
  let body = "";
  req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
  req.on("end", () => {
    const ts = String(req.headers["x-relay-ts"] || "");
    const sig = String(req.headers["x-relay-sig"] || "");
    const path = String(req.headers["x-relay-path"] || "");
    if (!SECRET || !API_KEY) return send(res, 500, { relayError: "중계 서버 환경변수(RELAY_SECRET, CALL24_API_KEY)가 비어 있습니다" });
    if (!ALLOWED_PATHS.test(path)) return send(res, 400, { relayError: "허용되지 않은 경로" });
    if (Math.abs(Date.now() - Number(ts)) > 60000) return send(res, 401, { relayError: "요청 시간이 맞지 않습니다(서버 시계 확인)" });
    const expect = crypto.createHmac("sha256", SECRET).update(`${ts}.${path}.${body}`).digest("hex");
    if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return send(res, 401, { relayError: "서명 불일치(RELAY_SECRET 값 확인)" });

    const u = new URL(BASE + path);
    const out = https.request({
      hostname: u.hostname, port: Number(u.port) || 443, path: u.pathname, method: "POST", rejectUnauthorized: false, timeout: 15000,
      headers: { "Content-Type": "application/json", "call24-api-key": API_KEY, "Content-Length": Buffer.byteLength(body) },
    }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }); res.end(d); }); });
    out.on("error", (e) => send(res, 502, { relayError: "24시콜 연결 실패: " + e.message }));
    out.on("timeout", () => out.destroy(new Error("timeout")));
    out.write(body); out.end();
  });
}).listen(PORT, () => console.log(`[relay24] listening on :${PORT} → ${BASE}`));
