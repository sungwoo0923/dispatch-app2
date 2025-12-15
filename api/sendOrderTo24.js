import { parseAddressKR } from "@/utils/parseAddressKR";

export async function sendOrderTo24(dispatch) {
  const start = parseAddressKR(dispatch.상차지주소);
  const end   = parseAddressKR(dispatch.하차지주소);

  const order = {
    // 🔹 상차지
    startWide: start.wide,
    startSgg: start.sgg,
    startDong: start.dong,
    startDetail: start.detail,

    // 🔹 하차지
    endWide: end.wide,
    endSgg: end.sgg,
    endDong: end.dong,
    endDetail: end.detail,

    // 🔹 차량
    cargoTon: String(dispatch.차량톤수 || ""),
    truckType: dispatch.차량종류 || "",

    // 🔹 날짜
    startPlanDt: dispatch.상차일.replace(/-/g, ""),
    endPlanDt: dispatch.하차일.replace(/-/g, ""),

    // 🔹 운임
    fare: String(dispatch.청구운임 || "0"),
    farePaytype: dispatch.지급방식 || "인수증",

    memo: dispatch.메모 || "",
  };

  const resp = await fetch("/api/send24", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order }),
  });

  return await resp.json();
}
