import CryptoJS from "crypto-js";
import fetch from "node-fetch";

const CALL24_URL = "https://api.15660088.com:18091/api/order/addOrder";

const API_KEY = process.env.CALL24_API_KEY;
const ENC_KEY = CryptoJS.enc.Hex.parse(process.env.CALL24_AES_KEY);
const ENC_IV  = CryptoJS.enc.Hex.parse(process.env.CALL24_AES_IV);

function encryptPayload(payload) {
  const text = JSON.stringify(payload);
  const encrypted = CryptoJS.AES.encrypt(text, ENC_KEY, {
    iv: ENC_IV,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return encrypted.toString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "POST only" });
  }

  try {
    const { order } = req.body;
    if (!order) {
      return res.status(400).json({ success: false, message: "order missing" });
    }

    const encrypted = encryptPayload(order);

    const response = await fetch(CALL24_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "call24-api-key": API_KEY,
      },
      body: JSON.stringify({
        data: encrypted,
        userVal: "RUN25",
      }),
    });

    const result = await response.json();

    return res.status(200).json({
      success: result?.resultCode === "0000",
      message: result?.resultMsg,
      call24: result,
    });

  } catch (e) {
    console.error("24시콜 오류:", e);
    return res.status(500).json({
      success: false,
      message: String(e),
    });
  }
}
