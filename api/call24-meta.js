// 📡 24시콜 마스터 데이터(시/도·구/군·동, 차량톤수, 차량종류) 조회 — 전송 팝업의 드롭다운용.
//  자유 입력은 글자 하나만 달라도 "-99"로 거부되므로 24시콜이 주는 값만 고르게 한다.
import { call24, explain24, outboundIp, RELAY_URL } from "./_call24.js";
import { requireStaff } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  // 🔒 2026-11-26 보안 — 로그인한 운송사 직원만
  if (!(await requireStaff(req, res))) return;
  try {
    const { type, sido, gugun, cargoTon } = req.body || {};
    let r;
    if (type === "addr") r = await call24("/api/order/addr", { sido: sido || "", gugun: gugun || "" });
    else if (type === "cargoTon") r = await call24("/api/order/cargoTon", {});
    else if (type === "truckType") {
      // ⚠️ cargoTon 없이 부르면 24시콜이 -42(조회시 필수 인자값 없음)로 거부한다 → 미리 막는다
      if (!cargoTon) return res.status(200).json({ success: true, code: 1, message: "톤수 선택 전", list: [] });
      r = await call24("/api/order/truckType", { cargoTon });
    } else return res.status(400).json({ success: false, error: "invalid type" });
    const list = Array.isArray(r.data) ? r.data.map((x) => x?.nm).filter(Boolean) : [];
    const ok = r.code === 1;
    const serverIp = !ok && !RELAY_URL ? await outboundIp() : undefined;
    return res.status(200).json({ success: ok, code: r.code, message: r.message, hint: ok ? "" : explain24(r.code, r.message), list, serverIp, via: r.via });
  } catch (err) {
    console.error("call24-meta 오류:", err.message);
    return res.status(500).json({ success: false, error: "META_FAILED", message: "24시콜 목록을 불러오지 못했어요. 잠시 뒤 다시 해 주세요", hint: explain24(-97, ""), list: [] });
  }
}
