import { createCipheriv, createDecipheriv } from "crypto";
import https from "node:https";

/* ─── 환경변수 (Vercel 대시보드 미설정 시 fallback) ─── */
const AES_KEY = process.env.CALL24_AES_KEY || "946e5bf1c0a86333688d1d01561e06e3";
const AES_IV  = process.env.CALL24_AES_IV  || "4eff880a505c8136";
const API_KEY = process.env.CALL24_API_KEY  || "946e5bf1c0a863332f1c2a6977b9f08e";
const BASE_URL = "https://api.15887924.com:18099";
const TMAP_KEY = "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer";

/* ─── AES 암호화 (키 길이에 따라 AES-128 또는 AES-256 자동 선택) ───
   ⚠️ CALL24_AES_KEY/IV는 hex 문자열이 아니라, 발급받은 문자열 자체를
   바이트로 그대로 쓰는 값이다(키 32자 → 32바이트 → AES-256-CBC, PDF 스펙과
   일치 / IV 16자 → 16바이트, CBC에 필요한 블록 크기와 정확히 일치).
   과거 hex로 디코딩하던 코드는 키가 16바이트(AES-128)로, IV가 8바이트로
   줄어들어(0으로 패딩) 수신측과 다른 값이 되어 매번 "data 복호화 실패"가
   났었다. */
function encryptAES(str) {
  const key = Buffer.from(AES_KEY, "utf8");
  const iv  = Buffer.from(AES_IV,  "utf8");
  const algo = key.length === 32 ? "aes-256-cbc" : "aes-128-cbc";
  const cipher = createCipheriv(algo, key, iv);
  let enc = cipher.update(str, "utf8", "base64");
  enc += cipher.final("base64");
  console.log("send24 암호화 알고리즘:", algo, "/ 키 길이:", key.length, "바이트 / IV 길이:", iv.length, "바이트");
  return enc;
}

/* ─── AES 복호화 — 응답의 "data" 필드(성공 시 {ordNo:...} 등)는 암호화되어
   있어 그대로는 읽을 수 없다. 공통 스펙상 code/message는 평문, data만 암호문. ─── */
function decryptAES(base64Str) {
  const key = Buffer.from(AES_KEY, "utf8");
  const iv  = Buffer.from(AES_IV,  "utf8");
  const algo = key.length === 32 ? "aes-256-cbc" : "aes-128-cbc";
  const decipher = createDecipheriv(algo, key, iv);
  let dec = decipher.update(base64Str, "base64", "utf8");
  dec += decipher.final("utf8");
  return dec;
}

/* ─── HTTPS GET (IP 조회용) ─── */
function httpsGet(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get({
      hostname: u.hostname,
      port: parseInt(u.port) || 443,
      path: u.pathname + u.search,
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").trim()));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

/* ─── HTTPS POST (자체서명 인증서 허용, 비표준 포트 지원) ─── */
function httpsPost(url, body, reqHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = typeof body === "string" ? body : JSON.stringify(body);
    const options = {
      hostname: u.hostname,
      port: parseInt(u.port) || 443,
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        ...reqHeaders,
        "Content-Length": Buffer.byteLength(data),
      },
      rejectUnauthorized: false,
      timeout: 15000,
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          text: () => Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.write(data);
    req.end();
  });
}

/* ─── 주소 분리 ─── */
function splitAddr(addr = "") {
  const parts = addr.trim().split(/\s+/);
  return {
    wide:   parts[0] || "",
    sgg:    parts[1] || "",
    dong:   parts[2] || "",
    detail: parts.slice(3).join(" ") || addr,
  };
}

/* ─── 도로명 → 지번 변환 (TMAP) ─── */
async function convertToJibun(address) {
  try {
    const res = await fetch(
      "https://apis.openapi.sk.com/tmap/geo/convertAddress?version=1&format=json",
      {
        method: "POST",
        headers: { appKey: TMAP_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ address, coordType: "WGS84GEO" }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.addressInfo?.fullAddress || null;
  } catch {
    return null;
  }
}

/* ─── 상/하차지 주소 → {wide, sgg, dong, detail}
   ⚠️ "인천 서구 북항로 28-29"처럼 도로명 주소는 세 번째 토큰이 실제 읍/면/동이
   아니라 도로명(OO로/OO길)이라, 그대로 startDong/endDong에 넣으면 24시콜
   서버가 실제 행정동과 대조해 거부한다("-99 기타 오류"로 표시됨).
   시/도·구/군(첫 두 토큰)은 사용자가 입력한 원본이 이미 24시콜이 쓰는
   짧은 표기("인천", "경기" 등)라 그대로 두고, 동만 지번 변환으로 구한
   실제 행정동으로 교체한다 — 지번 변환 결과의 시/도는 "인천광역시"처럼
   정식 명칭이라 그대로 쓰면 오히려 24시콜 마스터 데이터와 불일치한다. ─── */
async function resolveAddrParts(addr = "") {
  const original = splitAddr(addr);
  if (!/[로길]$/.test(original.dong)) return original;
  const jibun = await convertToJibun(addr.trim());
  if (!jibun) return original;
  const jibunParts = splitAddr(jibun);
  if (!jibunParts.dong || /[로길]$/.test(jibunParts.dong)) return original;
  return { ...original, dong: jibunParts.dong };
}

/* ─── Dispatch → 24시 매핑 ─── */
async function mapTo24Order(row) {
  const [up, down] = await Promise.all([
    resolveAddrParts(row.상차지주소 || ""),
    resolveAddrParts(row.하차지주소 || ""),
  ]);
  const fare      = Number(row.fare      ?? row.청구운임 ?? 0);
  const fee       = Number(row.fee       ?? Math.max(fare - Number(row.기사운임 ?? 0), 0));
  const frgton    = row.frgton || String(
    Number((String(row.차량톤수 || "")).replace(/[^0-9.]/g, "")) * 1.1 || 0
  );

  return {
    startWide:   row.startWide   || up.wide,
    startSgg:    row.startSgg    || up.sgg,
    startDong:   row.startDong   || up.dong,
    startDetail: row.startDetail || up.detail,
    endWide:     row.endWide     || down.wide,
    endSgg:      row.endSgg      || down.sgg,
    endDong:     row.endDong     || down.dong,
    endDetail:   row.endDetail   || down.detail,
    cargoTon:    String(row.cargoTon || row.차량톤수 || ""),
    truckType:   row.truckType   || row.차량종류 || "",
    frgton:      String(frgton),
    cargoDsc:    row.cargoDsc    || row.화물내용 || "",
    startPlanDt: row.startPlanDt || (row.상차일 || "").replace(/-/g, ""),
    endPlanDt:   row.endPlanDt   || (row.하차일 || row.상차일 || "").replace(/-/g, ""),
    startLoad:   row.startLoad   || row.상차방법 || "수작업",
    endLoad:     row.endLoad     || row.하차방법 || "수작업",
    farePaytype: row.farePaytype || "인수증",
    fare:        String(fare),
    fee:         String(fee),
    firstType:         row.firstType         || "01",
    firstShipperNm:    row.firstShipperNm    || row.거래처명 || "",
    firstShipperInfo:  row.firstShipperInfo  || (row.거래처전화 || "").replace(/\D/g, ""),
    firstShipperBizNo: row.firstShipperBizNo || row.거래처사업자번호 || "",
    taxbillType:       row.taxbillType       || "Y",
    endAreaPhone: row.endAreaPhone || (row.하차지연락처 || row.하차지담당자번호 || "").replace(/\D/g, ""),
    ddID:         row.ddID  || row.작성자 || "dispatch",
    ddPwd:        row.ddPwd || process.env.CALL24_PWD || "",
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // 실제 아웃바운드 IP 확인 (IP 등록 문제 진단용)
  let outboundIp = "unknown";
  const ipServices = [
    "https://checkip.amazonaws.com",
    "https://api4.ipify.org",
    "https://ipv4.icanhazip.com",
  ];
  for (const svc of ipServices) {
    try {
      const ip = await httpsGet(svc, 4000);
      if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) { outboundIp = ip; break; }
    } catch (_) {}
  }
  console.log("send24 아웃바운드 IP:", outboundIp);

  try {
    const row     = req.body;
    const payload = await mapTo24Order(row);

    console.log("24시 전송:", JSON.stringify({ ddID: payload.ddID, startPlanDt: payload.startPlanDt }));

    const encrypted = encryptAES(JSON.stringify(payload));
    const body = JSON.stringify({ data: encrypted, userVal: row._id || row.userVal || "" });

    const apiRes = await httpsPost(
      `${BASE_URL}/api/order/addOrder`,
      body,
      { "Content-Type": "application/json", "call24-api-key": API_KEY }
    );

    const text = apiRes.text();
    console.log("24시 응답:", text);

    let result;
    try { result = JSON.parse(text); }
    catch { return res.status(200).json({ success: false, raw: text, httpStatus: apiRes.status }); }

    // ⚠️ 공식 스펙: code/message는 평문, 실제 결과(ordNo 등)는 data 필드에
    // 암호화되어 담겨온다. 과거 코드는 result.ordNo를 최상위에서 찾고
    // 있었는데, 그 자리엔 항상 암호문 문자열만 있어 성공해도 실패로
    // 보고되고 있었다.
    if (result?.code === 1 && result?.data) {
      try {
        const decrypted = JSON.parse(decryptAES(result.data));
        return res.status(200).json({ success: true, ordNo: decrypted.ordNo, resultMsg: result.message || "성공" });
      } catch (e) {
        console.error("send24 응답 복호화 실패:", e.message);
        return res.status(200).json({ success: false, resultCode: result.code, resultMsg: "응답 복호화 실패: " + e.message, _serverIp: outboundIp });
      }
    }

    return res.status(200).json({
      success:    false,
      resultCode: result?.code ?? "",
      resultMsg:  result?.message || JSON.stringify(result),
      response:   result,
      _serverIp:  outboundIp,
      _keyLen:    Buffer.from(AES_KEY, "utf8").length,
      _algo:      Buffer.from(AES_KEY, "utf8").length === 32 ? "aes-256-cbc" : "aes-128-cbc",
    });

  } catch (err) {
    console.error("send24 오류:", err.message);
    return res.status(500).json({ success: false, error: err.message, _serverIp: outboundIp });
  }
}
