import CryptoJS from "crypto-js";

/**
 * ================================
 * 24시콜 API ENDPOINT (테스트)
 * ================================
 * 운영 전환 시 18099 로 변경
 */
const CALL24_URL = "https://api.15887924.com:18091/api/order/addOrder";

/**
 * ================================
 * AES 암호화 함수
 * ================================
 */
function encryptPayload(payload, aesKeyHex, aesIvHex) {
  const key = CryptoJS.enc.Hex.parse(aesKeyHex);
  const iv  = CryptoJS.enc.Hex.parse(aesIvHex);

  const encrypted = CryptoJS.AES.encrypt(
    JSON.stringify(payload),
    key,
    {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }
  );

  return encrypted.toString(); // base64
}

/**
 * ================================
 * API HANDLER
 * ================================
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "POST only",
    });
  }

  try {
    /**
     * 🔐 ENV 체크 (⚠️ 여기서!)
     */
    const API_KEY = process.env.CALL24_API_KEY;
    const AES_KEY = process.env.CALL24_AES_KEY;
    const AES_IV  = process.env.CALL24_AES_IV;

    if (!API_KEY || !AES_KEY || !AES_IV) {
      return res.status(500).json({
        success: false,
        message: "CALL24 ENV missing",
      });
    }

    /**
     * 📦 요청 데이터
     */
    const { order } = req.body;
    if (!order) {
      return res.status(400).json({
        success: false,
        message: "order missing",
      });
    }

    /**
     * 🔒 AES 암호화
     */
    const encrypted = encryptPayload(order, AES_KEY, AES_IV);

    /**
     * 📡 24시콜 전송
     */
    const response = await fetch(CALL24_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "call24-api-key": API_KEY,
      },
      body: JSON.stringify({
        data: encrypted,
        userVal: "RUN25", // 식별자 (임의 문자열 OK)
      }),
    });

    /**
     * ⚠️ 24시콜은 JSON 아닐 수도 있음
     */
    const rawText = await response.text();
    let result;

    try {
      result = JSON.parse(rawText);
    } catch {
      return res.status(502).json({
        success: false,
        message: "24시콜 응답이 JSON 아님",
        raw: rawText,
      });
    }

    /**
     * ✅ 정상 반환
     */
    return res.status(200).json({
      success: result?.resultCode === "0000",
      call24: result,
    });

  } catch (err) {
    console.error("24시콜 서버 오류:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "server error",
    });
  }
}
