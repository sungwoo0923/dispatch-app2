import { createCipheriv, createDecipheriv } from "crypto";
import https from "node:https";

/* ─── 24시콜이 실제로 인식하는 시/도·구/군·읍/면/동, 차량톤수, 차량종류
   목록을 그대로 조회해서 프런트에 넘겨준다(전송 팝업의 드롭다운용).
   자유 텍스트로 입력하면 24시콜 마스터 데이터와 글자 하나만 달라도
   "-99 기타 오류"로 거부되기 때문에, 24시콜이 제공하는 값만 고를 수
   있게 하는 게 유일하게 확실한 방법이다. ─── */
const AES_KEY = process.env.CALL24_AES_KEY || "946e5bf1c0a86333688d1d01561e06e3";
const AES_IV  = process.env.CALL24_AES_IV  || "4eff880a505c8136";
const API_KEY = process.env.CALL24_API_KEY  || "946e5bf1c0a863332f1c2a6977b9f08e";
const BASE_URL = "https://api.15887924.com:18099";

function algo() {
  return Buffer.from(AES_KEY, "utf8").length === 32 ? "aes-256-cbc" : "aes-128-cbc";
}
function encryptAES(str) {
  const key = Buffer.from(AES_KEY, "utf8");
  const iv  = Buffer.from(AES_IV,  "utf8");
  const cipher = createCipheriv(algo(), key, iv);
  let enc = cipher.update(str, "utf8", "base64");
  enc += cipher.final("base64");
  return enc;
}
function decryptAES(base64Str) {
  const key = Buffer.from(AES_KEY, "utf8");
  const iv  = Buffer.from(AES_IV,  "utf8");
  const decipher = createDecipheriv(algo(), key, iv);
  let dec = decipher.update(base64Str, "base64", "utf8");
  dec += decipher.final("utf8");
  return dec;
}

function httpsGet(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get({ hostname: u.hostname, port: parseInt(u.port) || 443, path: u.pathname + u.search, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").trim()));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

function httpsPost(url, body, reqHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = typeof body === "string" ? body : JSON.stringify(body);
    const options = {
      hostname: u.hostname,
      port: parseInt(u.port) || 443,
      path: u.pathname + u.search,
      method: "POST",
      headers: { ...reqHeaders, "Content-Length": Buffer.byteLength(data) },
      rejectUnauthorized: false,
      timeout: 15000,
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: () => Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.write(data);
    req.end();
  });
}

async function call24(path, payload) {
  const encrypted = encryptAES(JSON.stringify(payload));
  const body = JSON.stringify({ data: encrypted, userVal: "" });
  const apiRes = await httpsPost(`${BASE_URL}${path}`, body, {
    "Content-Type": "application/json",
    "call24-api-key": API_KEY,
  });
  const text = apiRes.text();
  let result;
  try { result = JSON.parse(text); } catch { return { code: -99, message: "응답 파싱 실패(" + text.slice(0, 200) + ")", list: [] }; }

  if (result?.code !== 1 || !result?.data) {
    return { code: result?.code ?? -99, message: result?.message || "조회 실패", list: [] };
  }
  try {
    const decrypted = JSON.parse(decryptAES(result.data));
    const list = Array.isArray(decrypted) ? decrypted.map(x => x?.nm).filter(Boolean) : [];
    return { code: 1, message: result.message || "성공", list };
  } catch (e) {
    return { code: -31, message: "응답 복호화 실패: " + e.message, list: [] };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const { type, sido, gugun, cargoTon } = req.body || {};
    let result;
    if (type === "addr") {
      result = await call24("/api/order/addr", { sido: sido || "", gugun: gugun || "" });
    } else if (type === "cargoTon") {
      result = await call24("/api/order/cargoTon", {});
    } else if (type === "truckType") {
      result = await call24("/api/order/truckType", { cargoTon: cargoTon || "" });
    } else {
      return res.status(400).json({ success: false, error: "invalid type" });
    }
    // ⚠️ 목록이 비어 왔다(실패)면 진단을 위해 실제 아웃바운드 IP를 함께
    // 확인해 내려준다 — send24.js(주문 등록)와 이 함수(마스터데이터 조회)는
    // 서로 다른 서버리스 함수라 같은 리전이라도 실제 발신 IP가 다를 수
    // 있고, 24시콜은 IP당 1개만 등록 가능해 등록된 IP와 다르면 -13으로
    // 거부된다.
    let outboundIp;
    if (result.code !== 1) {
      const ipServices = ["https://checkip.amazonaws.com", "https://api4.ipify.org", "https://ipv4.icanhazip.com"];
      for (const svc of ipServices) {
        try {
          const ip = await httpsGet(svc, 3000);
          if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) { outboundIp = ip; break; }
        } catch (_) {}
      }
    }
    console.log("call24-meta", type, "code:", result.code, "message:", result.message, "outboundIp:", outboundIp);
    return res.status(200).json({ success: result.code === 1, code: result.code, message: result.message, list: result.list, serverIp: outboundIp });
  } catch (err) {
    console.error("call24-meta 오류:", err.message);
    return res.status(500).json({ success: false, error: err.message, list: [] });
  }
}
