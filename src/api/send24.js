import { encryptAES } from "../../24CallService";

const AUTH_KEY = process.env.VITE_24CALL_AUTH_KEY;
const BASE_URL = "https://api.15887294.com:18091"; // 테스트 서버 URL

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const row = req.body;

    // 🔐 AES 암호화
    const encrypted = encryptAES(JSON.stringify(row));

    // 🔸 form-urlencoded 전송 필수!!
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

    // 응답은 무조건 text 처리!
    const raw = await apiRes.text();
    
    console.log("📡 24시콜 응답: ", raw);
    return res.status(200).json({ success: true, raw });

  } catch (err) {
    console.error("🚨 24시콜 Proxy 오류: ", err);
    return res.status(500).json({ success: false, error: err.toString() });
  }
}
