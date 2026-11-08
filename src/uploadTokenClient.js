// src/uploadTokenClient.js
// ⭐ 2026-11-08 보안 — 기사 업로드 링크
//  · 운송사 화면(기사전달용 복사)이 오더별 업로드토큰을 만들 때 발급 시각(업로드토큰발급)도 함께 남긴다 → 서버가 30일 지나면 만료로 본다.
//    만료 2일 전부터는 링크를 복사하면 새 토큰을 발급한다. 예전 토큰(발급 시각 없음)은 지우지 않고 발급 시각만 채운다(이미 보낸 링크 유지).
//  · 업로드 페이지(/upload)는 오더·첨부를 직접 읽고 쓰지 않고 서버 함수(uploadAccess)를 부른다(functions/uploadAccess.js).
import { FUNCTIONS_BASE } from "./firebase";

export const UPLOAD_TOKEN_TTL_MS = 30 * 24 * 3600e3;
const RENEW_BEFORE_MS = 2 * 24 * 3600e3;

const randomToken = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);

// 오더 r의 업로드토큰 — { token, patch } (patch가 null이면 문서를 고칠 필요 없음)
export function ensureUploadToken(r, now = Date.now()) {
  const cur = r?.업로드토큰;
  const at = Number(r?.업로드토큰발급 || 0);
  if (cur && !r?.업로드잠금) {
    if (!at) return { token: cur, patch: { 업로드토큰발급: now } };
    if (now - at < UPLOAD_TOKEN_TTL_MS - RENEW_BEFORE_MS) return { token: cur, patch: null };
  }
  const token = randomToken();
  return { token, patch: { 업로드토큰: token, 업로드잠금: false, 업로드토큰발급: now } };
}

// 업로드 페이지 한 번 열 때마다 새 세션 키(방금 올린 사진만 이 화면에서 지울 수 있게)
export function newUploadSession() {
  return `${randomToken()}${randomToken()}`.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80);
}

// 서버 호출 — 실패하면 { error } (HTTP 오류 코드 문자열)
export async function uploadApi(body, { timeoutMs = 30000, keepalive = false } = {}) {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const r = await fetch(`${FUNCTIONS_BASE}/uploadAccess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl?.signal,
      keepalive,
    });
    let j = null;
    try { j = await r.json(); } catch { j = null; }
    if (!r.ok) return { error: j?.error || `HTTP_${r.status}`, status: r.status };
    return j || {};
  } catch (e) {
    return { error: e?.name === "AbortError" ? "TIMEOUT" : "NETWORK" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
