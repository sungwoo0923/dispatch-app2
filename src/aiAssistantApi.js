// ======================= src/aiAssistantApi.js =======================
// 🤖 2026-11-07 배차 AI 비서 — 서버 aiAssistantChat(호출형 함수) 부르기
//  호출형 규약 그대로({ data } 보내고 { result } 받기) — orderScanClient.js와 같은 방식
import { auth, FUNCTIONS_BASE } from "./firebase";

export class AiChatError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export async function askAssistant({ text, history, mode, screen, focusOrderId, company }, { timeoutMs = 120000 } = {}) {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  let token = "";
  try { token = (await auth.currentUser?.getIdToken()) || ""; } catch { token = ""; }
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/aiAssistantChat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ data: { text, history, mode, screen, focusOrderId, company } }),
      signal: ctl?.signal,
    });
    let j = {};
    try { j = await res.json(); } catch { /* 무시 */ }
    if (!res.ok || j.error) throw new AiChatError(String(j.error?.status || res.status).toLowerCase().replace(/_/g, "-"), j.error?.message || `요청 실패(${res.status})`);
    return j.result;
  } catch (e) {
    if (e instanceof AiChatError) throw e;
    throw new AiChatError(e?.name === "AbortError" ? "deadline-exceeded" : "unavailable", e?.name === "AbortError" ? "AI 답이 늦어지고 있어요" : "AI 서버에 연결하지 못했어요");
  } finally { if (timer) clearTimeout(timer); }
}
