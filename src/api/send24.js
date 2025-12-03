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
    return res.status(200).json({ success: true, raw });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.toString() });
  }
}
