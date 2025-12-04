import { encryptAES, mapTo24Order } from "../../24CallService";

const AUTH_KEY = process.env.VITE_24CALL_AUTH_KEY;
const BASE_URL = "https://api.15887294.com:18091";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const row = req.body;
    console.log("📝 전달받은 row:", row);
    console.log("🔑 AUTH_KEY 존재?:", AUTH_KEY ? "OK" : "❌ 없음");

    const payload = mapTo24Order(row);
    console.log("🚚 전송 payload:", payload);

    const encrypted = encryptAES(JSON.stringify(payload));
    console.log("🔐 encrypted:", encrypted);

    const formBody = new URLSearchParams();
    formBody.append("data", encrypted);

    const apiRes = await fetch(`${BASE_URL}/Order/OrderSet.do`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        authKey: AUTH_KEY,
      },
      body: formBody.toString(),
    });

    const raw = await apiRes.text();
    console.log("📡 24시콜 응답 RAW:", raw);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { result: "fail", raw };
    }

    const success = parsed?.result === "success";
    const message = parsed?.message || parsed?.raw || "Unknown Response";

    return res.status(200).json({
      success,
      message,
      raw,
      payloadSent: payload,
    });

  } catch (err) {
    console.error("🚨 24시콜 Proxy 오류:", err);

    return res.status(500).json({
      success: false,
      error: err.message || String(err),
    });
  }
}
