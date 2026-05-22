const CALL24_API_URL = "https://api.15887924.com:18099/api/order/addOrder";

export async function sendOrderTo24Proxy(row) {
  try {
    // 1단계: 서버에서 AES 암호화만 수행 (키 보안)
    const prepRes = await fetch("/api/prepare24", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });
    if (!prepRes.ok) {
      const err = await prepRes.text();
      return { success: false, error: `암호화 오류: ${err}` };
    }
    const { encrypted, userVal, apiKey } = await prepRes.json();

    // 2단계: 브라우저(사용자 IP)에서 24시 API 직접 호출
    const apiRes = await fetch(CALL24_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "call24-api-key": apiKey,
      },
      body: JSON.stringify({ data: encrypted, userVal }),
    });

    const text = await apiRes.text();
    try { return JSON.parse(text); }
    catch { return { success: false, raw: text }; }

  } catch (error) {
    console.error("24시 Proxy 오류:", error);
    const msg = error?.message || String(error);
    // CORS 오류일 경우 안내
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("CORS")) {
      return { success: false, error: "CORS 오류: 24시콜 API가 브라우저 직접 호출을 차단합니다. 24시콜에 IP 등록이 필요합니다." };
    }
    return { success: false, error: msg };
  }
}
