// /api/fuel.js

export default async function handler(req, res) {
  try {
    const key = "F251130200";
    const area = req.query.area || "01";

    const url = `https://www.opinet.co.kr/api/avgSidoPrice.do?out=json&code=${key}&area=${area}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!response.ok) {
      throw new Error("Opinet request failed");
    }

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: "Opinet returned HTML instead of JSON",
        raw: text.slice(0, 200)
      });
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");

    return res.status(200).json(data);

  } catch (err) {
    console.error("Fuel API error:", err);
    return res.status(500).json({
      error: "Fuel proxy failed",
      message: err.message
    });
  }
}