import { createCipheriv } from "crypto";
import https from "node:https";

/* ─── 환경변수 (Vercel 대시보드 미설정 시 fallback) ─── */
const AES_KEY = process.env.CALL24_AES_KEY || "946e5bf1c0a86333688d1d01561e06e3";
const AES_IV  = (process.env.CALL24_AES_IV  || "4eff880a505c8136").padEnd(32, "0");
const API_KEY = process.env.CALL24_API_KEY  || "946e5bf1c0a863332f1c2a6977b9f08e";
const BASE_URL = "https://api.15887924.com:18099";

/* ─── AES-128-CBC 암호화 ─── */
function encryptAES(str) {
  const key    = Buffer.from(AES_KEY, "hex");
  const iv     = Buffer.from(AES_IV,  "hex");
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  let enc = cipher.update(str, "utf8", "base64");
  enc += cipher.final("base64");
  return enc;
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

/* ─── Dispatch → 24시 매핑 ─── */
function mapTo24Order(row) {
  const up   = splitAddr(row.상차지주소 || "");
  const down = splitAddr(row.하차지주소 || "");
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

  try {
    const row     = req.body;
    const payload = mapTo24Order(row);

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

    if (result?.ordNo) {
      return res.status(200).json({ success: true, ordNo: result.ordNo, resultMsg: result.resultMsg || "성공" });
    }

    return res.status(200).json({
      success:    false,
      resultCode: result?.resultCode || result?.code || "",
      resultMsg:  result?.resultMsg  || result?.message || JSON.stringify(result),
      response:   result,
    });

  } catch (err) {
    console.error("send24 오류:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
