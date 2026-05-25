// 암호화만 수행하고 클라이언트로 반환 (실제 전송은 브라우저에서 직접 수행)
import { createCipheriv } from "crypto";

const AES_KEY = process.env.CALL24_AES_KEY || "946e5bf1c0a86333688d1d01561e06e3";
const AES_IV  = (process.env.CALL24_AES_IV  || "4eff880a505c8136").padEnd(32, "0");
const API_KEY = process.env.CALL24_API_KEY  || "946e5bf1c0a863332f1c2a6977b9f08e";

function encryptAES(str) {
  const key    = Buffer.from(AES_KEY, "hex");
  const iv     = Buffer.from(AES_IV,  "hex");
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  let enc = cipher.update(str, "utf8", "base64");
  enc += cipher.final("base64");
  return enc;
}

function splitAddr(addr = "") {
  const parts = addr.trim().split(/\s+/);
  return { wide: parts[0]||"", sgg: parts[1]||"", dong: parts[2]||"", detail: parts.slice(3).join(" ")||addr };
}

function mapTo24Order(row) {
  const up   = splitAddr(row.상차지주소 || "");
  const down = splitAddr(row.하차지주소 || "");
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
    ddID:  row.ddID  || row.작성자 || "dispatch",
    ddPwd: row.ddPwd || process.env.CALL24_PWD || "",
  };
}

export default function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }
  if (req.method !== "POST") return res.status(405).end();

  try {
    const payload   = mapTo24Order(req.body);
    const encrypted = encryptAES(JSON.stringify(payload));
    const userVal   = req.body._id || req.body.userVal || "";

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({ encrypted, userVal, apiKey: API_KEY });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
