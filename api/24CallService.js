import fetch from "node-fetch";
import CryptoJS from "crypto-js";

/* ===============================
   🔐 암호화 설정
================================ */
export function encryptAES(str) {
  const key = CryptoJS.enc.Hex.parse(process.env.CALL24_AES_KEY);
  const iv  = CryptoJS.enc.Hex.parse(process.env.CALL24_AES_IV);
  return CryptoJS.AES.encrypt(str, key, {
    iv,
    padding: CryptoJS.pad.Pkcs7,
    mode: CryptoJS.mode.CBC,
  }).toString();
}

/* ===============================
   주소 분리
================================ */
function splitAddr(addr = "") {
  const parts = addr.trim().split(/\s+/);
  return {
    wide:   parts[0] || "",
    sgg:    parts[1] || "",
    dong:   parts[2] || "",
    detail: parts.slice(3).join(" ") || addr,
  };
}

/* ===============================
   🔁 Dispatch → 24시 매핑
================================ */
export function mapTo24Order(row) {
  const up   = splitAddr(row.상차지주소 || "");
  const down = splitAddr(row.하차지주소 || "");

  const fare      = Number(row.청구운임 || 0);
  const driverFee = Number(row.기사운임 || 0);

  return {
    // 상차지
    startWide:   up.wide,
    startSgg:    up.sgg,
    startDong:   up.dong,
    startDetail: up.detail,

    // 하차지
    endWide:   down.wide,
    endSgg:    down.sgg,
    endDong:   down.dong,
    endDetail: down.detail,

    // 차량/화물
    cargoTon:  String(row.차량톤수 || ""),
    truckType: row.차량종류 || "",
    frgton:    String(Number((row.차량톤수 || "").toString().replace(/[^0-9.]/g, "")) * 1.1 || 0),
    cargoDsc:  row.화물내용 || "",

    // 일정
    startPlanDt: (row.상차일 || "").replace(/-/g, ""),
    endPlanDt:   (row.하차일 || row.상차일 || "").replace(/-/g, ""),

    // 상·하차 방식
    startLoad: row.상차방법 || "수작업",
    endLoad:   row.하차방법 || "수작업",

    // 운임
    farePaytype: "인수증",
    fare: String(fare),
    fee:  String(Math.max(fare - driverFee, 0)),

    // 화주
    firstType:         "01",
    firstShipperNm:    row.거래처명 || "",
    firstShipperInfo:  (row.거래처전화 || "").replace(/\D/g, ""),
    firstShipperBizNo: row.거래처사업자번호 || "",
    taxbillType:       "Y",

    // 기타
    endAreaPhone: (row.하차지연락처 || "").replace(/\D/g, ""),
    ddID:         row.작성자 || "dispatch",
  };
}

/* ===============================
   🚀 24시 화물등록 호출 (직접 호출용)
================================ */
export async function sendOrderTo24(row) {
  const mapped    = mapTo24Order(row);
  const encrypted = encryptAES(JSON.stringify(mapped));

  const res = await fetch(
    "https://api.15887924.com:18099/api/order/addOrder",
    {
      method: "POST",
      headers: {
        "Content-Type":   "application/json",
        "call24-api-key": process.env.CALL24_API_KEY,
      },
      body: JSON.stringify({
        data:    encrypted,
        userVal: row._id || "",
      }),
    }
  );

  const json = await res.json();

  if (json?.ordNo) {
    return { success: true, ordNo: json.ordNo };
  }

  return { success: false, response: json };
}
