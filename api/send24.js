import fetch from "node-fetch";
import { encryptAES, mapTo24Order } from "../../24CallService.js";

const API_KEY = process.env.CALL24_API_KEY;
const BASE_URL = "https://api.15660088.com:18091";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const row = req.body;

    // 1️⃣ Dispatch → 24시 매핑
    const payload = mapTo24Order(row);

    // 2️⃣ AES 암호화 (JSON 문자열)
    const encrypted = encryptAES(JSON.stringify(payload));

    // 3️⃣ 24시 addOrder 호출
    const apiRes = await fetch(`${BASE_URL}/api/order/addOrder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "call24-api-key": API_KEY,
      },
      body: JSON.stringify({
        data: encrypted,
        userVal: row._id || "",
      }),
    });

    const result = await apiRes.json();

    console.log("📡 24시 응답:", result);

    // 4️⃣ 성공 판별
    if (result?.ordNo) {
      return res.status(200).json({
        success: true,
        ordNo: result.ordNo,
      });
    }

    return res.status(200).json({
      success: false,
      response: result,
    });

  } catch (err) {
    console.error("🚨 24시 Proxy 오류:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
