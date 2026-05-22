// Vercel 서버의 공인 아웃바운드 IP 확인용
export default async function handler(req, res) {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const { ip } = await r.json();
    res.status(200).json({ ip, region: process.env.VERCEL_REGION || "unknown" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
