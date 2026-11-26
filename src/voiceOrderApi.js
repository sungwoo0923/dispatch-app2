// ======================= src/voiceOrderApi.js =======================
// 📞 2026-11-25 AI 상담원 음성 오더 — 서버 voiceOrderTurn(호출형) 부르기(aiAssistantApi.js와 같은 방식)
import { auth, FUNCTIONS_BASE } from "./firebase";

export class VoiceTurnError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export async function voiceTurn({ text, history, current, known }, { timeoutMs = 30000 } = {}) {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  let token = "";
  try { token = (await auth.currentUser?.getIdToken()) || ""; } catch { token = ""; }
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/voiceOrderTurn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ data: { text, history, current, known } }),
      signal: ctl?.signal,
    });
    let j = {};
    try { j = await res.json(); } catch { /* 무시 */ }
    if (!res.ok || j.error) throw new VoiceTurnError(String(j.error?.status || res.status).toLowerCase().replace(/_/g, "-"), j.error?.message || `요청 실패(${res.status})`);
    return j.result;
  } catch (e) {
    if (e instanceof VoiceTurnError) throw e;
    throw new VoiceTurnError(e?.name === "AbortError" ? "deadline-exceeded" : "unavailable", e?.name === "AbortError" ? "AI 상담원 대답이 늦어지고 있어요" : "AI 상담원에 연결하지 못했어요");
  } finally { if (timer) clearTimeout(timer); }
}
