// src/firebase/fuelApi.js
export async function getFuelPrice(region = "인천") {
  try {
    const API_KEY = "F251130200"; // ▲ 발급받은 Key 적용됨
    const url = `https://www.opinet.co.kr/api/avgAllPrice.do?code=${API_KEY}&out=json`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("유가 API 요청 실패");

    const data = await res.json();
    const oilData = data?.RESULT?.OIL;

    if (!oilData || oilData.length === 0)
      throw new Error("유가 데이터 없음");

    // 기본 지역: 인천 → 못 찾으면 전국 기준
    const target =
      oilData.find((o) => o.REGION === region) ||
      oilData.find((o) => o.REGION === "전국") ||
      oilData[0];

    return Number(target.PRICE) || 1750;
  } catch (err) {
    console.warn("⚠ 유가 API 오류:", err.message);
    return 1750; // 기본단가 (안전장치)
  }
}
