// ======================= src/promo/youtubeUpload.js =======================
// ⬆ 2026-11-23 영상 편집실 → 유튜브 바로 올리기 (YouTube Data API v3 · 이어 올리기 방식)
//  · 구글 로그인 창(Google Identity Services)으로 "유튜브 업로드" 권한만 받아 브라우저에서 바로 올린다 — 서버에 영상 · 토큰을 남기지 않는다
//  · 처음 한 번: Google Cloud 콘솔에서 OAuth 클라이언트 ID(웹 애플리케이션)를 만들고 홍보 설정에 넣는다(승인된 자바스크립트 원본 = 이 프로그램 주소)
//  · ⚠ 구글 심사(감사)를 받기 전 프로젝트로 올린 영상은 유튜브가 "비공개"로 묶어 둔다 → 공개하려면 유튜브 스튜디오에서 직접 올리거나 심사 신청
const GIS = "https://accounts.google.com/gsi/client";
const SCOPE = "https://www.googleapis.com/auth/youtube.upload";
let gisP = null;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisP) return gisP;
  gisP = new Promise((res, rej) => { const s = document.createElement("script"); s.src = GIS; s.async = true; s.onload = res; s.onerror = () => { gisP = null; rej(new Error("구글 로그인 창을 불러오지 못했어요")); }; document.head.appendChild(s); });
  return gisP;
}
let cached = { token: "", exp: 0, client: "" };
export async function youtubeToken(clientId) {
  if (!clientId) throw new Error("홍보 설정에 구글 OAuth 클라이언트 ID를 먼저 넣어 주세요.");
  if (cached.token && cached.client === clientId && Date.now() < cached.exp - 60000) return cached.token;
  await loadGis();
  return new Promise((resolve, reject) => {
    const tc = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: SCOPE,
      callback: (r) => { if (r.error) { reject(new Error(r.error_description || r.error)); return; } cached = { token: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000, client: clientId }; resolve(r.access_token); },
      error_callback: (e) => reject(new Error(e?.type === "popup_closed" ? "구글 로그인 창을 닫았어요" : e?.message || "구글 로그인 실패")),
    });
    tc.requestAccessToken({ prompt: cached.client === clientId ? "" : "consent" });
  });
}
// meta: { title, description, tags[], privacy: private|unlisted|public, shorts }
export async function uploadToYoutube({ clientId, blob, meta, onProgress, thumbnail }) {
  const token = await youtubeToken(clientId);
  let title = String(meta.title || "LogisWeb").slice(0, 100); if (meta.shorts && !/#shorts/i.test(title + meta.description)) title = `${title.slice(0, 91)} #Shorts`;
  const body = {
    snippet: { title, description: String(meta.description || "").slice(0, 4900), tags: (meta.tags || []).slice(0, 30), categoryId: "28", defaultLanguage: "ko", defaultAudioLanguage: "ko" },
    status: { privacyStatus: meta.privacy || "private", selfDeclaredMadeForKids: false, embeddable: true },
  };
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": blob.type || "video/webm", "X-Upload-Content-Length": String(blob.size) }, body: JSON.stringify(body),
  });
  if (!init.ok) {
    const j = await init.json().catch(() => ({})); const why = j?.error?.errors?.[0]?.reason || j?.error?.message || init.status;
    if (String(why).includes("youtubeSignupRequired")) throw new Error("이 구글 계정에 유튜브 채널이 없어요. 유튜브에서 채널을 먼저 만들어 주세요.");
    if (String(why).includes("quotaExceeded")) throw new Error("오늘 유튜브 업로드 한도를 다 썼어요. 내일 다시 해 주세요.");
    throw new Error(`유튜브 업로드 준비 실패(${why})`);
  }
  const loc = init.headers.get("Location"); if (!loc) throw new Error("유튜브 업로드 주소를 받지 못했어요");
  const video = await new Promise((resolve, reject) => {
    const x = new XMLHttpRequest(); x.open("PUT", loc); x.setRequestHeader("Authorization", `Bearer ${token}`); x.setRequestHeader("Content-Type", blob.type || "video/webm");
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    x.onload = () => { if (x.status >= 200 && x.status < 300) { try { resolve(JSON.parse(x.responseText)); } catch { resolve({}); } } else reject(new Error(`유튜브 업로드 실패(${x.status})`)); };
    x.onerror = () => reject(new Error("인터넷이 끊겨 업로드를 못 했어요")); x.send(blob);
  });
  let thumbOk = false;
  if (thumbnail && video?.id) {
    const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${video.id}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": thumbnail.type || "image/jpeg" }, body: thumbnail }).catch(() => null);
    thumbOk = !!r?.ok; // 채널 인증(전화번호)이 안 됐으면 썸네일만 실패 — 영상은 올라감
  }
  return { id: video?.id, url: video?.id ? `https://youtu.be/${video.id}` : "", status: video?.status?.uploadStatus, privacy: video?.status?.privacyStatus, thumbOk };
}
