// ======================= api/_call24.js =======================
// 📡 24시콜(화물정보망) API 공용 모듈 — send24.js(오더 등록)·call24-meta.js(주소/톤수/차종 목록)·call24-diag.js(진단)가 같이 쓴다.
//  ※ 파일명이 _ 로 시작하면 Vercel이 API 경로로 만들지 않는다(내부 모듈 전용).
//
//  ⭐ 왜 "중계 서버(relay)"가 필요한가
//   24시콜은 API를 부르는 서버의 IP를 1개만 허용한다. 그런데 Vercel 서버리스 함수는 호출될 때마다
//   AWS의 다른 IP로 나가기 때문에(등록해 둔 IP와 다르면 -13 "허용된 IP가 아닙니다"),
//   아무리 IP를 등록해도 "가끔 되다가 안 되는" 상태가 된다. 그래서
//     브라우저 → Vercel(/api/send24: 매핑·암호화) → 고정 IP 중계 서버(relay24/server.js) → 24시콜
//   순서로 보내고, 24시콜에는 중계 서버의 고정 IP 1개만 등록한다.
//   환경변수 CALL24_RELAY_URL 이 없으면 예전처럼 Vercel에서 바로 보낸다(직접 모드).
import { createCipheriv, createDecipheriv, createHmac } from "crypto";
import https from "node:https";
import http from "node:http";

const AES_KEY = process.env.CALL24_AES_KEY || "946e5bf1c0a86333688d1d01561e06e3";
const AES_IV  = process.env.CALL24_AES_IV  || "4eff880a505c8136";
const API_KEY = process.env.CALL24_API_KEY  || "946e5bf1c0a863332f1c2a6977b9f08e";
// 운영: 18099 / 테스트: 18091 (24시콜 마이페이지 "운영-서버/테스트-서버")
export const BASE_URL = process.env.CALL24_BASE_URL || "https://api.15887924.com:18099";
export const RELAY_URL = (process.env.CALL24_RELAY_URL || "").replace(/\/+$/, "");
const RELAY_SECRET = process.env.CALL24_RELAY_SECRET || "";

const algo = () => (Buffer.from(AES_KEY, "utf8").length === 32 ? "aes-256-cbc" : "aes-128-cbc");
export function encryptAES(str) {
  const c = createCipheriv(algo(), Buffer.from(AES_KEY, "utf8"), Buffer.from(AES_IV, "utf8"));
  return c.update(str, "utf8", "base64") + c.final("base64");
}
export function decryptAES(b64) {
  const d = createDecipheriv(algo(), Buffer.from(AES_KEY, "utf8"), Buffer.from(AES_IV, "utf8"));
  return d.update(b64, "base64", "utf8") + d.final("utf8");
}

function request(url, { method = "GET", body, headers = {}, timeout = 15000, insecure = false } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "http:" ? http : https;
    const data = body == null ? null : typeof body === "string" ? body : JSON.stringify(body);
    const req = lib.request({
      hostname: u.hostname, port: parseInt(u.port) || (u.protocol === "http:" ? 80 : 443), path: u.pathname + u.search, method,
      headers: { ...headers, ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) },
      rejectUnauthorized: !insecure, timeout,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    if (data) req.write(data);
    req.end();
  });
}

export async function outboundIp() {
  for (const svc of ["https://checkip.amazonaws.com", "https://api4.ipify.org", "https://ipv4.icanhazip.com"]) {
    try { const r = await request(svc, { timeout: 3000 }); const ip = r.text.trim(); if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip; } catch { /* 다음 */ }
  }
  return "unknown";
}

// 24시콜 호출 — payload(평문 객체)를 암호화해 path로 보낸다. 반환: { code, message, data(복호화된 객체|null), raw, via }
export async function call24(path, payload, userVal = "") {
  const body = JSON.stringify({ data: encryptAES(JSON.stringify(payload)), userVal: String(userVal || "") });
  let r;
  if (RELAY_URL) {
    const ts = String(Date.now());
    const sig = createHmac("sha256", RELAY_SECRET).update(`${ts}.${path}.${body}`).digest("hex");
    r = await request(`${RELAY_URL}/relay`, {
      method: "POST", timeout: 20000,
      headers: { "Content-Type": "application/json", "x-relay-ts": ts, "x-relay-sig": sig, "x-relay-path": path },
      body,
    });
  } else {
    // 24시콜 서버는 사설 인증서라 검증을 끈다(기존과 동일)
    r = await request(`${BASE_URL}${path}`, { method: "POST", insecure: true, headers: { "Content-Type": "application/json", "call24-api-key": API_KEY }, body });
  }
  let json;
  try { json = JSON.parse(r.text); } catch { return { code: -98, message: `응답 해석 실패(HTTP ${r.status}): ${r.text.slice(0, 200)}`, data: null, raw: r.text, via: RELAY_URL ? "relay" : "direct" }; }
  if (json?.relayError) return { code: -97, message: `중계 서버 오류: ${json.relayError}`, data: null, raw: r.text, via: "relay" };
  let data = null;
  if (json?.code === 1 && json?.data) { try { data = JSON.parse(decryptAES(json.data)); } catch (e) { return { code: -31, message: "응답 복호화 실패: " + e.message, data: null, raw: r.text, via: RELAY_URL ? "relay" : "direct" }; } }
  return { code: json?.code ?? -99, message: json?.message || "", data, raw: r.text, via: RELAY_URL ? "relay" : "direct" };
}

export async function relayHealth() {
  if (!RELAY_URL) return null;
  try { const r = await request(`${RELAY_URL}/health`, { timeout: 5000 }); return JSON.parse(r.text); } catch (e) { return { ok: false, error: e.message }; }
}

// 24시콜 오류 코드 → 사람이 알아들을 안내
export function explain24(code, message = "") {
  const m = String(message || "");
  if (code === -13 || /허용된\s*IP|IP/i.test(m)) return RELAY_URL
    ? "24시콜에 등록된 허용 IP가 중계 서버 IP와 다릅니다. 24시콜 마이페이지 › 허용 IP(운영)에 중계 서버의 고정 IP를 등록하세요."
    : "Vercel 서버 IP는 호출할 때마다 바뀌어 24시콜 허용 IP와 맞지 않습니다. 고정 IP 중계 서버(relay24)를 설정해야 안정적으로 전송됩니다.";
  if (code === -42) return "필수 값이 비었습니다. 24시콜 목록에서 톤수·차종·주소를 다시 골라 주세요.";
  if (code === -97) return "중계 서버에 연결하지 못했습니다. 중계 서버가 켜져 있는지 확인하세요.";
  if (code === -31) return "암호화 키가 24시콜 마이페이지의 암호화키/IV와 다릅니다.";
  if (code === -99) return "24시콜이 값을 거부했습니다. 주소(시/도·구/군·동), 톤수, 차종을 24시콜 목록 값으로 골랐는지 확인하세요.";
  return "";
}
