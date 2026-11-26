// 📡 화면 쪽 도우미(브라우저에서 쓴다) — /api/send24 · /api/call24-meta · /api/call24-diag 호출
// 🔒 2026-11-26 보안 — 세 주소 모두 로그인 토큰(Authorization: Bearer <Firebase ID 토큰>)이 있어야 한다(서버: api/_auth.js)
//  firebase/auth 는 부를 때만 불러온다(이 파일이 api/ 폴더에 있어 서버 쪽으로도 묶이기 때문)
export async function call24Headers(extra = {}) {
  try {
    const { getAuth } = await import("firebase/auth");
    const u = getAuth().currentUser;
    const token = u ? await u.getIdToken() : "";
    return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
  } catch {
    return { ...extra };
  }
}

export async function sendOrderTo24Proxy(row) {
  try {
    const res = await fetch("/api/send24", {
      method: "POST",
      headers: await call24Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(row),
    });

    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch {
      return { success: false, raw: text };
    }
  } catch (error) {
    console.error("24시 Proxy 오류:", error);
    return { success: false, error: error?.message || String(error) };
  }
}
