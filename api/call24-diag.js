// 📡 24시콜 연결 진단 — 지금 어떤 경로(중계/직접)로 나가는지, 나가는 IP, 24시콜 응답 코드를 한 번에 보여준다.
import { call24, explain24, outboundIp, relayHealth, RELAY_URL, BASE_URL } from "./_call24.js";
import { requireStaff } from "./_auth.js";

export default async function handler(req, res) {
  // 🔒 2026-11-26 보안 — 로그인한 운송사 직원만(나가는 IP · 중계 서버 상태를 알려 주는 진단이라)
  if (!(await requireStaff(req, res))) return;
  const out = { mode: RELAY_URL ? "relay" : "direct", base: BASE_URL.replace(/^https?:\/\//, "") };
  try {
    if (RELAY_URL) out.relay = await relayHealth();
    else out.vercelIp = await outboundIp();
    const r = await call24("/api/order/cargoTon", {});
    out.test = { code: r.code, message: r.message, ok: r.code === 1, count: Array.isArray(r.data) ? r.data.length : 0, hint: r.code === 1 ? "" : explain24(r.code, r.message) };
  } catch (e) {
    console.error("call24-diag 오류:", e?.message || e);
    out.test = { ok: false, code: -97, message: "24시콜 연결 점검 중 오류가 났어요", hint: explain24(-97, "") };
    if (!RELAY_URL && !out.vercelIp) out.vercelIp = await outboundIp().catch(() => "unknown");
  }
  res.status(200).json(out);
}
