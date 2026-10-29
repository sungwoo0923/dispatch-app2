// 📡 24시콜 연결 진단 — 지금 어떤 경로(중계/직접)로 나가는지, 나가는 IP, 24시콜 응답 코드를 한 번에 보여준다.
import { call24, explain24, outboundIp, relayHealth, RELAY_URL, BASE_URL } from "./_call24.js";

export default async function handler(req, res) {
  const out = { mode: RELAY_URL ? "relay" : "direct", base: BASE_URL.replace(/^https?:\/\//, "") };
  try {
    if (RELAY_URL) out.relay = await relayHealth();
    else out.vercelIp = await outboundIp();
    const r = await call24("/api/order/cargoTon", {});
    out.test = { code: r.code, message: r.message, ok: r.code === 1, count: Array.isArray(r.data) ? r.data.length : 0, hint: r.code === 1 ? "" : explain24(r.code, r.message) };
  } catch (e) {
    out.test = { ok: false, code: -97, message: e.message, hint: explain24(-97, e.message) };
    if (!RELAY_URL && !out.vercelIp) out.vercelIp = await outboundIp().catch(() => "unknown");
  }
  res.status(200).json(out);
}
