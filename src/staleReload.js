// ======================= src/staleReload.js =======================
// ⭐ 2026-11-10 "갑자기 로딩 화면으로 넘어갔다가 다시 켜지는" 문제 — 새 버전이 배포되면 열려 있던 화면이 가진
//  예전 화면 조각 파일 주소가 서버에서 사라진다. 그때 뒤에서 미리 받기(prefetch)·다른 조각을 부르다 실패하면
//  예전에는 그 자리에서 바로 새로고침했다 → 글을 쓰던 중에도 로딩 화면으로 넘어가 내용이 날아갔다.
//  이제 뒤에서 생긴 실패는 새로고침하지 않고, 아래에 작은 안내 띠만 띄운다(사용자가 저장 후 [새로고침]).
//  사용자가 직접 연 화면이 그 파일을 못 받으면(ErrorBoundary)만 예전처럼 한 번 새로고침한다.
let shown = false;
export function markStaleBuild() {
  if (shown || typeof document === "undefined") return;
  shown = true;
  const bar = document.createElement("div");
  bar.setAttribute("data-stale-build", "1");
  bar.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483600;display:flex;align-items:center;gap:10px;padding:8px 8px 8px 16px;border-radius:14px;background:#0F1A30;color:#fff;font:700 12.5px 'Noto Sans KR','Malgun Gothic',sans-serif;box-shadow:0 12px 30px rgba(11,20,40,.35);max-width:calc(100vw - 24px)";
  const txt = document.createElement("span");
  txt.textContent = "새 버전이 배포되었어요 · 작성 중인 내용을 저장한 뒤 새로고침해 주세요";
  const btn = document.createElement("button");
  btn.type = "button"; btn.textContent = "새로고침";
  btn.style.cssText = "flex-shrink:0;height:30px;padding:0 12px;border-radius:10px;border:0;background:#fff;color:#0F1A30;font-weight:800;cursor:pointer";
  btn.onclick = () => window.location.reload();
  const x = document.createElement("button");
  x.type = "button"; x.textContent = "✕"; x.setAttribute("aria-label", "닫기");
  x.style.cssText = "flex-shrink:0;width:28px;height:30px;border:0;background:transparent;color:rgba(255,255,255,.6);cursor:pointer";
  x.onclick = () => bar.remove();
  bar.append(txt, btn, x);
  (document.body || document.documentElement).appendChild(bar);
}
