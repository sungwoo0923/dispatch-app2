// 📡 24시콜 오더 등록 — 매핑·암호화 후 _call24.js를 통해(중계 서버 또는 직접) 전송
import { call24, explain24, outboundIp, RELAY_URL } from "./_call24.js";

const TMAP_KEY = "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer";

/* ─── 주소 분리 ─── */
function splitAddr(addr = "") {
  const parts = addr.trim().split(/\s+/);
  return {
    wide:   parts[0] || "",
    sgg:    parts[1] || "",
    dong:   parts[2] || "",
    detail: parts.slice(3).join(" ") || addr,
  };
}

/* ─── 도로명 → 지번 변환 (TMAP) ─── */
async function convertToJibun(address) {
  try {
    const res = await fetch(
      "https://apis.openapi.sk.com/tmap/geo/convertAddress?version=1&format=json",
      {
        method: "POST",
        headers: { appKey: TMAP_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ address, coordType: "WGS84GEO" }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.addressInfo?.fullAddress || null;
  } catch {
    return null;
  }
}

/* ─── 상/하차지 주소 → {wide, sgg, dong, detail}
   ⚠️ "인천 서구 북항로 28-29"처럼 도로명 주소는 세 번째 토큰이 실제 읍/면/동이
   아니라 도로명(OO로/OO길)이라, 그대로 startDong/endDong에 넣으면 24시콜
   서버가 실제 행정동과 대조해 거부한다("-99 기타 오류"로 표시됨).
   시/도·구/군(첫 두 토큰)은 사용자가 입력한 원본이 이미 24시콜이 쓰는
   짧은 표기("인천", "경기" 등)라 그대로 두고, 동만 지번 변환으로 구한
   실제 행정동으로 교체한다 — 지번 변환 결과의 시/도는 "인천광역시"처럼
   정식 명칭이라 그대로 쓰면 오히려 24시콜 마스터 데이터와 불일치한다. ─── */
async function resolveAddrParts(addr = "") {
  const original = splitAddr(addr);
  if (!/[로길]$/.test(original.dong)) return original;
  const jibun = await convertToJibun(addr.trim());
  if (!jibun) return original;
  const jibunParts = splitAddr(jibun);
  if (!jibunParts.dong || /[로길]$/.test(jibunParts.dong)) return original;
  return { ...original, dong: jibunParts.dong };
}

/* ─── Dispatch → 24시 매핑 ─── */
async function mapTo24Order(row) {
  const [up, down] = await Promise.all([
    resolveAddrParts(row.상차지주소 || ""),
    resolveAddrParts(row.하차지주소 || ""),
  ]);
  const fare      = Number(row.fare      ?? row.청구운임 ?? 0);
  const fee       = Number(row.fee       ?? Math.max(fare - Number(row.기사운임 ?? 0), 0));
  const frgton    = row.frgton || String(
    Number((String(row.차량톤수 || "")).replace(/[^0-9.]/g, "")) * 1.1 || 0
  );

  return {
    startWide:   row.startWide   || up.wide,
    startSgg:    row.startSgg    || up.sgg,
    startDong:   row.startDong   || up.dong,
    startDetail: row.startDetail || up.detail,
    endWide:     row.endWide     || down.wide,
    endSgg:      row.endSgg      || down.sgg,
    endDong:     row.endDong     || down.dong,
    endDetail:   row.endDetail   || down.detail,
    cargoTon:    String(row.cargoTon || row.차량톤수 || ""),
    truckType:   row.truckType   || row.차량종류 || "",
    frgton:      String(frgton),
    cargoDsc:    row.cargoDsc    || row.화물내용 || "",
    startPlanDt: row.startPlanDt || (row.상차일 || "").replace(/-/g, ""),
    endPlanDt:   row.endPlanDt   || (row.하차일 || row.상차일 || "").replace(/-/g, ""),
    startLoad:   row.startLoad   || row.상차방법 || "수작업",
    endLoad:     row.endLoad     || row.하차방법 || "수작업",
    farePaytype: row.farePaytype || "인수증",
    fare:        String(fare),
    fee:         String(fee),
    firstType:         row.firstType         || "01",
    firstShipperNm:    row.firstShipperNm    || row.거래처명 || "",
    firstShipperInfo:  row.firstShipperInfo  || (row.거래처전화 || "").replace(/\D/g, ""),
    firstShipperBizNo: row.firstShipperBizNo || row.거래처사업자번호 || "",
    taxbillType:       row.taxbillType       || "Y",
    endAreaPhone: row.endAreaPhone || (row.하차지연락처 || row.하차지담당자번호 || "").replace(/\D/g, ""),
    ddID:         row.ddID  || row.작성자 || "dispatch",
    ddPwd:        row.ddPwd || process.env.CALL24_PWD || "",
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  try {
    const row = req.body || {};
    const payload = await mapTo24Order(row);
    console.log("24시 전송:", JSON.stringify({ via: RELAY_URL ? "relay" : "direct", startPlanDt: payload.startPlanDt, cargoTon: payload.cargoTon }));
    const r = await call24("/api/order/addOrder", payload, row._id || row.userVal || "");
    console.log("24시 응답:", r.code, r.message);
    if (r.code === 1) return res.status(200).json({ success: true, ordNo: r.data?.ordNo || "", resultMsg: r.message || "성공", via: r.via });
    const serverIp = RELAY_URL ? undefined : await outboundIp();
    return res.status(200).json({ success: false, resultCode: r.code, resultMsg: r.message || "실패", hint: explain24(r.code, r.message), via: r.via, _serverIp: serverIp });
  } catch (err) {
    console.error("send24 오류:", err.message);
    return res.status(500).json({ success: false, error: err.message, resultMsg: err.message, hint: explain24(-97, err.message) });
  }
}
