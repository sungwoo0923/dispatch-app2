import CryptoJS from "crypto-js";

/* ─── AES 암호화 ─── */
function encryptAES(str) {
  const key = CryptoJS.enc.Hex.parse(process.env.CALL24_AES_KEY);
  const iv  = CryptoJS.enc.Hex.parse(process.env.CALL24_AES_IV);
  return CryptoJS.AES.encrypt(str, key, {
    iv,
    padding: CryptoJS.pad.Pkcs7,
    mode:    CryptoJS.mode.CBC,
  }).toString();
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
  const fare      = Number(row.청구운임 || 0);
  const driverFee = Number(row.기사운임 || 0);

  return {
    startWide:   up.wide,
    startSgg:    up.sgg,
    startDong:   up.dong,
    startDetail: up.detail,
    endWide:   down.wide,
    endSgg:    down.sgg,
    endDong:   down.dong,
    endDetail: down.detail,
    cargoTon:  String(row.차량톤수 || ""),
    truckType: row.차량종류 || "",
    frgton:    String(Number((row.차량톤수 || "").toString().replace(/[^0-9.]/g, "")) * 1.1 || 0),
    cargoDsc:  row.화물내용 || "",
    startPlanDt: (row.상차일 || "").replace(/-/g, ""),
    endPlanDt:   (row.하차일 || row.상차일 || "").replace(/-/g, ""),
    startLoad: row.상차방법 || "수작업",
    endLoad:   row.하차방법 || "수작업",
    farePaytype: "인수증",
    fare: String(fare),
    fee:  String(Math.max(fare - driverFee, 0)),
    firstType:         "01",
    firstShipperNm:    row.거래처명 || "",
    firstShipperInfo:  (row.거래처전화 || "").replace(/\D/g, ""),
    firstShipperBizNo: row.거래처사업자번호 || "",
    taxbillType:       "Y",
    endAreaPhone: (row.하차지연락처 || "").replace(/\D/g, ""),
    ddID:         row.작성자 || "dispatch",
  };
}

const API_KEY  = process.env.CALL24_API_KEY;
const BASE_URL = "https://api.15887924.com:18099";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // 환경변수 체크
  if (!process.env.CALL24_AES_KEY || !process.env.CALL24_AES_IV) {
    console.error("❌ CALL24_AES_KEY / CALL24_AES_IV 환경변수 미설정");
    return res.status(500).json({ success: false, error: "암호화 키 미설정" });
  }

  try {
    const row = req.body;
    console.log("📤 24시 전송 요청:", JSON.stringify({ 거래처명: row.거래처명, 상차일: row.상차일 }));

    const payload   = mapTo24Order(row);
    console.log("📋 매핑된 페이로드:", JSON.stringify(payload));

    const encrypted = encryptAES(JSON.stringify(payload));

    const apiRes = await fetch(`${BASE_URL}/api/order/addOrder`, {
      method: "POST",
      headers: {
        "Content-Type":   "application/json",
        "call24-api-key": API_KEY,
      },
      body: JSON.stringify({
        data:    encrypted,
        userVal: row._id || "",
      }),
    });

    const text = await apiRes.text();
    console.log("📡 24시 응답 (raw):", text);

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      return res.status(200).json({ success: false, raw: text, httpStatus: apiRes.status });
    }

    console.log("📡 24시 응답 (parsed):", result);

    if (result?.ordNo) {
      return res.status(200).json({
        success:   true,
        ordNo:     result.ordNo,
        resultMsg: result.resultMsg || "성공",
      });
    }

    return res.status(200).json({
      success:    false,
      resultCode: result?.resultCode || result?.code || "",
      resultMsg:  result?.resultMsg || result?.message || JSON.stringify(result),
      response:   result,
    });

  } catch (err) {
    console.error("🚨 24시 Proxy 오류:", err.message, err.stack);
    return res.status(500).json({
      success: false,
      error:   err.message,
    });
  }
}
