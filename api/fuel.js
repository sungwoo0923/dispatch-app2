// /api/fuel.js
export default async function handler(req, res) {
  try {
    const key = process.env.OPINET_API_KEY;
    const area = req.query.area || "01";

    const url = `https://www.opinet.co.kr/api/avgSidoPrice.do?out=json&code=${key}&area=${area}`;

    const response = await fetch(url);
    const data = await response.json();

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json(data);

  } catch (error) {
    console.error("🔥 Fuel Proxy Error:", error);
    return res.status(500).json({ error: "Proxy failed" });
  }
}