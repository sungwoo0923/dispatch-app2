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
  gisP = new Promise((res, rej) => { const s = document.createElement("script"); s.src = GIS; s.async = true; s.onload = res; s.onerror = () => { gisP = null; rej(new Error("구글 로그인 창을 불러오지 못했어요. 인터넷 연결이나 광고 차단 프로그램을 확인해 주세요.")); }; document.head.appendChild(s); });
  return gisP;
}
let cached = { token: "", exp: 0, client: "" };

// 🔑 2026-11-24 클라이언트 ID 모양 검사 — 키를 만든 뒤 막히는 가장 흔한 이유가 "다른 값을 붙여 넣음"이라 미리 알려 준다
//  · OAuth 클라이언트 ID: 숫자-영문.apps.googleusercontent.com
//  · AIza… = API 키(Gemini · 지도 등), GOCSPX-… = 클라이언트 보안 비밀번호 → 둘 다 여기 넣으면 안 된다
//  · 내려받은 JSON(client_secret_….json)을 통째로 붙여 넣으면 그 안의 client_id 만 꺼낸다
const CLIENT_RE = /\b(\d{6,}-[a-z0-9]+\.apps\.googleusercontent\.com)\b/i;
export function normalizeClientId(raw) {
  const t = String(raw || "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  const m = t.match(CLIENT_RE);
  return m ? m[1].toLowerCase() : t;
}
export function checkClientId(raw) {
  const v = normalizeClientId(raw);
  if (!v) return { ok: false, kind: "empty", value: "", msg: "아직 클라이언트 ID가 없어요." };
  if (CLIENT_RE.test(v) && v === v.match(CLIENT_RE)[1]) return { ok: true, kind: "ok", value: v, msg: "클라이언트 ID 모양이 맞아요." };
  if (/^AIza[0-9A-Za-z_-]{20,}$/.test(v)) return { ok: false, kind: "apiKey", value: v, msg: "붙여 넣은 값은 API 키(AIza…)예요. 유튜브 올리기에는 API 키가 아니라 OAuth 클라이언트 ID(…apps.googleusercontent.com)가 필요해요. API 키는 홍보 설정 › 나레이션 음성(Gemini)에만 써요." };
  if (/^GOCSPX-/i.test(v)) return { ok: false, kind: "secret", value: v, msg: "붙여 넣은 값은 클라이언트 보안 비밀번호(GOCSPX-…)예요. 비밀번호는 넣지 말고, 같은 화면 위쪽의 클라이언트 ID(…apps.googleusercontent.com)를 복사해 넣어 주세요." };
  if (/googleusercontent\.com/i.test(v)) return { ok: false, kind: "bad", value: v, msg: "클라이언트 ID 일부가 빠진 것 같아요. 숫자로 시작해 .apps.googleusercontent.com 으로 끝나는 값을 통째로 복사해 주세요." };
  return { ok: false, kind: "bad", value: v, msg: "클라이언트 ID 모양이 아니에요. 숫자로 시작해 .apps.googleusercontent.com 으로 끝나는 값을 넣어 주세요." };
}

// 구글 로그인 · 업로드 오류 → 무엇을 고치면 되는지 한국어 안내(설정 화면의 단계 번호와 같다)
const ytErr = (code, msg) => { const e = new Error(msg); e.code = code; return e; };
export const YT_ERRORS = {
  popup_failed_to_open: "구글 로그인 창이 열리지 않았어요. 주소창 오른쪽의 팝업 차단 표시를 눌러 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요.",
  popup_closed: "구글 로그인 창이 닫혔어요. 창 안에 '오류 400: origin_mismatch'(또는 redirect_uri_mismatch)가 보였다면 3단계 '승인된 자바스크립트 원본'에 이 주소를 넣어 주세요. '액세스 차단됨' · '403 access_denied'였다면 2단계 테스트 사용자를 확인해 주세요.",
  access_denied: "구글이 접근을 막았어요(403 access_denied). 가장 흔한 이유는 유튜브 채널 주인 구글 계정이 OAuth 동의 화면의 '테스트 사용자'에 없는 경우예요. 2단계에서 그 계정을 테스트 사용자로 추가해 주세요. 로그인 창에서 [허용]을 누르지 않았을 때도 이렇게 나와요.",
  origin_mismatch: "이 주소가 OAuth 클라이언트에 등록되지 않았어요. 3단계 '승인된 자바스크립트 원본'에 지금 주소를 넣고 저장한 뒤, 5분쯤 지나 다시 시험해 주세요.",
  idpiframe_initialization_failed: "이 주소가 OAuth 클라이언트에 등록되지 않았어요. 3단계 '승인된 자바스크립트 원본'에 지금 주소를 넣고 저장한 뒤, 5분쯤 지나 다시 시험해 주세요.",
  invalid_client: "구글이 이 클라이언트 ID를 찾지 못했어요. 지워졌거나 잘못 복사된 값이에요. 4단계에서 클라이언트 ID를 다시 복사해 넣어 주세요.",
  unauthorized_client: "이 클라이언트는 웹 로그인에 쓸 수 없어요. 3단계에서 유형을 '웹 애플리케이션'으로 다시 만들어 주세요.",
  invalid_scope: "유튜브 업로드 권한을 받을 수 없어요. 2단계 데이터 액세스(범위)에 youtube.upload 를 추가해 주세요.",
  accessNotConfigured: "이 Google Cloud 프로젝트에서 YouTube Data API v3가 꺼져 있어요. 1단계에서 [사용]을 누른 뒤 몇 분 뒤에 다시 해 주세요.",
  youtubeSignupRequired: "이 구글 계정에는 유튜브 채널이 없어요. 유튜브에서 채널을 먼저 만들거나, 채널이 있는 계정으로 로그인해 주세요.",
  quotaExceeded: "오늘 유튜브 업로드 한도를 다 썼어요. 내일 다시 해 주세요.",
  uploadLimitExceeded: "이 채널이 오늘 올릴 수 있는 영상 수를 넘었어요. 내일 다시 해 주세요.",
  authError: "구글 로그인 시간이 지났어요. 다시 눌러 로그인해 주세요.",
};
export function ytErrorText(e) {
  const code = e?.code || "";
  if (YT_ERRORS[code]) return YT_ERRORS[code];
  const m = String(e?.message || e || "");
  const hit = Object.keys(YT_ERRORS).find((k) => m.includes(k));
  return hit ? YT_ERRORS[hit] : m || "구글 로그인에 실패했어요.";
}

export async function youtubeToken(clientId0, { fresh = false } = {}) {
  const chk = checkClientId(clientId0);
  if (chk.kind === "empty") throw ytErr("no_client", "홍보 설정에 구글 OAuth 클라이언트 ID를 먼저 넣어 주세요.");
  if (!chk.ok) throw ytErr(`client_${chk.kind}`, chk.msg);
  const clientId = chk.value;
  if (!fresh && cached.token && cached.client === clientId && Date.now() < cached.exp - 60000) return cached.token;
  await loadGis();
  return new Promise((resolve, reject) => {
    let tc;
    try {
      tc = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: SCOPE,
        callback: (r) => {
          if (r.error) { reject(ytErr(r.error, YT_ERRORS[r.error] || r.error_description || r.error)); return; }
          if (window.google.accounts.oauth2.hasGrantedAllScopes && !window.google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) { reject(ytErr("access_denied", "로그인 창에서 '유튜브 동영상 관리' 권한에 체크하지 않았어요. 다시 눌러 권한을 체크하고 [계속]을 눌러 주세요.")); return; }
          cached = { token: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000, client: clientId }; resolve(r.access_token);
        },
        error_callback: (e) => { const t = e?.type || "unknown"; reject(ytErr(t, YT_ERRORS[t] || e?.message || "구글 로그인에 실패했어요.")); },
      });
    } catch (e) { reject(ytErr("init", `구글 로그인 창을 준비하지 못했어요(${e?.message || e}).`)); return; }
    tc.requestAccessToken({ prompt: fresh || cached.client !== clientId ? "consent" : "" });
  });
}
// meta: { title, description, tags[], privacy: private|unlisted|public, shorts }
export async function uploadToYoutube({ clientId, blob, meta, onProgress, thumbnail }) {
  if (!blob) throw new Error("올릴 영상 파일이 없어요. 먼저 [영상 만들기]를 해 주세요.");
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
    if (init.status === 401) cached = { token: "", exp: 0, client: "" }; // 만료된 토큰은 버리고 다음에 새로 받는다
    const msgAll = `${why} ${j?.error?.message || ""}`;
    const hit = Object.keys(YT_ERRORS).find((k) => msgAll.includes(k)) || (/has not been used|is disabled/i.test(msgAll) ? "accessNotConfigured" : init.status === 401 ? "authError" : "");
    if (hit) throw ytErr(hit, YT_ERRORS[hit]);
    throw new Error(`유튜브 업로드를 준비하지 못했어요(${why}).`);
  }
  const loc = init.headers.get("Location"); if (!loc) throw new Error("유튜브 업로드 주소를 받지 못했어요. 잠시 뒤 다시 해 주세요.");
  const video = await new Promise((resolve, reject) => {
    const x = new XMLHttpRequest(); x.open("PUT", loc); x.setRequestHeader("Authorization", `Bearer ${token}`); x.setRequestHeader("Content-Type", blob.type || "video/webm");
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    x.onload = () => { if (x.status >= 200 && x.status < 300) { try { resolve(JSON.parse(x.responseText)); } catch { resolve({}); } } else reject(new Error(`유튜브 업로드에 실패했어요(${x.status}). 잠시 뒤 다시 해 주세요.`)); };
    x.onerror = () => reject(new Error("인터넷 연결이 끊겨 업로드하지 못했어요. 연결을 확인하고 다시 해 주세요.")); x.send(blob);
  });
  let thumbOk = false;
  if (thumbnail && video?.id) {
    const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${video.id}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": thumbnail.type || "image/jpeg" }, body: thumbnail }).catch(() => null);
    thumbOk = !!r?.ok; // 채널 인증(전화번호)이 안 됐으면 썸네일만 실패 — 영상은 올라감
  }
  return { id: video?.id, url: video?.id ? `https://youtu.be/${video.id}` : "", status: video?.status?.uploadStatus, privacy: video?.status?.privacyStatus, thumbOk };
}
