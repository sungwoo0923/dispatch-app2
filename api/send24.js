import { encryptAES, mapTo24Order } from "../../24CallService";

const AUTH_KEY = process.env.AUTH_KEY_24CALL;
const BASE_URL = process.env.BASE_URL_24CALL;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const row = req.body;
    console.log("🔑 AUTH_KEY 존재?:", AUTH_KEY ? "OK" : "❌ 없음");

    const payload = mapTo24Order(row);
    const encrypted = encryptAES(JSON.stringify(payload));

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
    console.log("📡 RAW:", raw);

    return res.status(200).json({ raw });

  } catch (err) {
    console.error("🚨 Proxy 오류:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
