// api/24CallProxy.js
export async function sendOrderTo24Proxy(row) {
  try {
    const res = await fetch("/api/send24", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });

    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch {
      return { success: false, raw: text };
    }
  } catch (error) {
    console.error("🚨 24시 Proxy 오류:", error);
    return { success: false, error };
  }
}
