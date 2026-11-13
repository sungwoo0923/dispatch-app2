// ======================= api/shell.js =======================
// 🚦 2026-11-13 업데이트 배포 잠금 — 최고관리자가 관리센터에서 [업데이트 배포]를 눌러야 가입자 화면이 바뀐다
//  · main 에 올리면 Vercel 은 바로 새 화면을 만든다(지금까지는 새로고침하면 누구나 새 화면)
//  · 이제 화면 첫 장(index.html)은 이 함수가 준다:
//      - 최고관리자 · 부관리자(브라우저 쿠키 kp_ch=latest) → 항상 최신 화면
//      - 그 밖의 모든 가입자 → "배포한 버전"(Firestore publicRelease/current 의 url = 그 버전의 Vercel 배포 주소) 화면
//      - 배포한 버전이 없거나(잠금 안 함), 그 화면을 못 가져오면 → 최신 화면(예전과 같음. 화면이 안 뜨는 일은 없게)
//  · 예전 버전 화면이 쓰는 /assets/* 파일은 최신 배포에 없으므로, 없는 파일은 배포한 버전 주소에서 받아 준다(?asset=)
//  · ?check=1 : 관리센터 점검용 — 배포한 버전 화면을 실제로 가져올 수 있는지
const PROJECT = "dispatch-app-9b92f";
const API_KEY = "AIzaSyDaCTK03VbaXQCEKEiD7yp2KIzzX5x64a4"; // 웹 화면에 이미 들어 있는 공개 키(src/firebase.js)
const PIN_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/publicRelease/current?key=${API_KEY}`;
const HOST_OK = /^[a-z0-9-]+\.vercel\.app$/; // 배포 주소는 Vercel 주소만(다른 곳을 대신 불러오지 않게)

let pinCache = { at: 0, pin: null };
const htmlCache = new Map(); // 주소 → HTML (배포 하나의 파일은 바뀌지 않는다)

const withTimeout = async (url, opts = {}, ms = 4000) => {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); } finally { clearTimeout(t); }
};
const bypass = () => (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {});

async function readPin(now = Date.now()) {
  if (now - pinCache.at < 5000) return pinCache.pin;
  try {
    const r = await withTimeout(PIN_URL, {}, 2500);
    if (r.status === 404) { pinCache = { at: now, pin: null }; return null; }
    if (!r.ok) throw new Error(`pin ${r.status}`);
    const f = (await r.json()).fields || {};
    const v = (k) => f[k]?.stringValue || "";
    const on = f.enabled?.booleanValue !== false;
    const pin = on && HOST_OK.test(v("url")) ? { url: v("url"), version: v("version"), build: v("build") } : null;
    pinCache = { at: now, pin };
    return pin;
  } catch {
    pinCache = { at: now - 3000, pin: pinCache.pin }; // 잠깐 못 읽으면 방금 값 그대로(2초 뒤 다시)
    return pinCache.pin;
  }
}
async function getHtml(base, file, headers = {}) {
  const key = `${base}/${file}`;
  if (htmlCache.has(key)) return htmlCache.get(key);
  const r = await withTimeout(`${base}/${file}`, { headers });
  const ct = r.headers.get("content-type") || "";
  if (!r.ok || !ct.includes("text/html")) throw new Error(`html ${r.status}`);
  const html = await r.text();
  if (!/<div id="root"|<script/.test(html)) throw new Error("html shape");
  if (htmlCache.size > 20) htmlCache.clear();
  htmlCache.set(key, html);
  return html;
}
const wantsLatest = (req) => /(?:^|;\s*)kp_ch=latest(?:;|$)/.test(String(req.headers?.cookie || ""));

export default async function handler(req, res) {
  const q = req.query || {};
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "");
  const self = `https://${host}`;
  try {
    // 점검(관리센터)
    if (q.check) {
      const pin = await readPin(0);
      const out = { pin, ok: null, status: 0, bypass: !!process.env.VERCEL_AUTOMATION_BYPASS_SECRET };
      if (pin) { try { const r = await withTimeout(`https://${pin.url}/index.html`, { headers: bypass() }); out.status = r.status; out.ok = r.ok && (r.headers.get("content-type") || "").includes("text/html"); } catch (e) { out.ok = false; out.error = String(e?.message || e); } }
      res.setHeader("Cache-Control", "no-store"); res.status(200).json(out); return;
    }
    // 예전 버전 화면의 파일(/assets/*) — 최신 배포에 없는 것만 여기로 온다
    if (q.asset) {
      const pin = await readPin();
      const name = String(q.asset).replace(/\.\.+/g, "");
      if (!pin || !/^[\w./@-]+$/.test(name)) { res.status(404).send("Not Found"); return; }
      const r = await withTimeout(`https://${pin.url}/assets/${name}`, { headers: bypass() }, 8000);
      if (!r.ok) { res.status(404).send("Not Found"); return; }
      res.setHeader("Content-Type", r.headers.get("content-type") || "application/octet-stream");
      // 파일 이름에 내용 해시가 들어 있어 바뀌지 않는다 → Vercel CDN 에도 오래 보관(같은 파일로 이 함수가 다시 불리지 않게)
      res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
      res.status(200).send(Buffer.from(await r.arrayBuffer())); return;
    }
    // 화면 첫 장
    const file = q.f === "driver" ? "driver.html" : "index.html";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    let html = ""; let served = "latest";
    if (!wantsLatest(req)) {
      const pin = await readPin();
      if (pin && pin.url !== process.env.VERCEL_URL) {
        try { html = await getHtml(`https://${pin.url}`, file, bypass()); served = "pinned"; } catch { html = ""; }
      }
    }
    if (!html) html = await getHtml(self, file);
    res.setHeader("X-Kp-Release", served);
    res.status(200).send(html);
  } catch (e) {
    // 어떤 경우에도 화면은 떠야 한다 — 최신 화면 파일로 바로 보낸다
    console.error("[shell]", e?.message || e);
    if (q.asset) { res.status(404).send("Not Found"); return; }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(`<!doctype html><meta charset="utf-8"><script>location.replace("/${q.f === "driver" ? "driver.html" : "index.html"}")</script>`);
  }
}
