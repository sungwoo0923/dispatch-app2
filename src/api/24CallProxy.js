export async function sendOrderTo24Proxy(row) {
  try {
    const res = await fetch("/api/send24", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });

    const text = await res.text(); // JSON 아닐 수도 있어
    try {
      return JSON.parse(text);
    } catch (e) {
      return { success: false, error: "Invalid JSON", raw: text };
    }

  } catch (error) {
    console.error("🚨 Proxy 호출 오류: ", error);
    return { success: false, error };
  }
}
