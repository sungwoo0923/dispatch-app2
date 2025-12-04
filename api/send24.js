import { encryptAES, mapTo24Order } from "../../24CallService";

const AUTH_KEY = process.env.VITE_24CALL_AUTH_KEY;
const BASE_URL = "https://api.15887294.com:18091";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const row = req.body;

    const payload = mapTo24Order(row);
    const encrypted = encryptAES(JSON.stringify(payload));

    const formBody = new URLSearchParams();
    formBody.append("data", encrypted);

    const apiRes = await fetch(`${BASE_URL}/Order/OrderSet.do`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "authKey": AUTH_KEY,
      },
      body: formBody.toString(),
    });

    const raw = await apiRes.text();
    console.log("📡 24시콜 응답: ", raw);

    // 항상 JSON로 감싸서 리턴!
    return res.status(200).json({
      success: true,
      raw: raw,
    });

  } catch (err) {
    console.error("🚨 24시콜 Proxy 오류:", err);

    return res.status(500).json({
      success: false,
      error: err.message || String(err),
    });
  }
}
