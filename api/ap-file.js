// ======================= api/ap-file.js =======================
// 📎 2026-11-10 전자결재 첨부 내려받기 중계 — [저장]을 눌러도 파일로 안 받아지고 새 탭으로만 열리던 문제
//  · 저장소(버킷)에 CORS 설정이 없으면 브라우저가 파일 내용 받기를 막는다 → 같은 주소(/api/ap-file)로 대신 받아 준다
//  · 받는 주소는 우리 저장소의 approvals/ 폴더 + 토큰이 붙은 보기 주소만(다른 주소는 거절) — 권한 검사는 보기 주소를 만들 때 보안 규칙이 이미 했다
//  · 내용은 흘려보낸다(스트리밍) — 20MB 파일도 받는다
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const PREFIX = "https://firebasestorage.googleapis.com/v0/b/dispatch-app-9b92f.firebasestorage.app/o/approvals%2F";

export default async function handler(req, res) {
  const u = String(req.query?.u || "");
  if (req.method !== "GET" || !u.startsWith(PREFIX) || !/[?&]token=/.test(u) || !/[?&]alt=media/.test(u)) {
    res.status(400).json({ error: "bad request" });
    return;
  }
  try {
    const r = await fetch(u);
    if (!r.ok || !r.body) { res.status(r.status === 404 ? 404 : r.status === 403 ? 403 : 502).json({ error: `storage ${r.status}` }); return; }
    const name = String(req.query?.name || "file").replace(/[\r\n"\\/]+/g, "_").slice(0, 120);
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/octet-stream");
    const len = r.headers.get("content-length");
    if (len) res.setHeader("Content-Length", len);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Ap-File", "1"); // 화면 쪽에서 "진짜 파일 응답"인지 확인하는 표시
    res.status(200);
    await pipeline(Readable.fromWeb(r.body), res); // 다 보낼 때까지 기다린다(먼저 끝내면 중간에 끊긴다)
  } catch (e) {
    if (!res.headersSent) res.status(502).json({ error: String(e?.message || e) });
    else res.end();
  }
}
