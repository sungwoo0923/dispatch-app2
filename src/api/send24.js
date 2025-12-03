export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const row = req.body;
    const encrypted = encryptAES(JSON.stringify(row));

    const apiRes = await fetch(`${BASE_URL}/Order/OrderSet.do`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authKey: AUTH_KEY,
      },
      body: JSON.stringify({ data: encrypted }),
    });

    const raw = await apiRes.text();
    console.log("📡 24시콜 응답 RAW:", raw);

    let data = {};
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.warn("⚠️ JSON 파싱 실패! RAW 반환");
      data = { success: false, raw };
    }

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.toString() });
  }
}
