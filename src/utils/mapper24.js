// ====================== mapper24.js ======================
export function mapTo24Order(order = {}) {
  const fmtDate = (v) =>
    v ? String(v).replace(/-/g, "").slice(0, 8) : "";

  const splitAddr = (addr = "") => {
    const parts = addr.split(" ");
    return {
      wide: parts[0] || "",
      sgg: parts[1] || "",
      dong: parts[2] || "",
      detail: parts.slice(3).join(" ") || ""
    };
  };

  const start = splitAddr(order.상차지주소);
  const end = splitAddr(order.하차지주소);

  return {
    startWide: start.wide,
    startSgg: start.sgg,
    startDong: start.dong,
    startDetail: start.detail,

    endWide: end.wide,
    endSgg: end.sgg,
    endDong: end.dong,
    endDetail: end.detail,

    cargoTon: order.차량톤수 || "",
    truckType: order.차량종류 || "",

    startPlanDt: fmtDate(order.상차일),
    endPlanDt: fmtDate(order.하차일),

    startLoad: order.상차방법 || "수작업",
    endLoad: order.하차방법 || "수작업",

    cargoDsc: order.화물내용 || "",
    farePaytype: order.지급방식 || "인수증",
    fare: String(order.청구운임 || "").replace(/[^\d]/g, ""),
    fee: String(order.수수료 || "").replace(/[^\d]/g, ""),

    endAreaPhone: order.전화번호 || "",

    firstType: "02",
    firstShipperNm: "(주)돌캐",
    firstShipperInfo: "15332525",
    firstShipperBizNo: "3298100967",

    taxbillType: "Y"
  };
}
