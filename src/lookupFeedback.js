// ======================= src/lookupFeedback.js =======================
// 🔎 2026-11-19 [조회]를 누르면 "조회했어요" 표시(사용자 요청 — 조회가 된 건지 안 된 건지 알 수 없다)
//  · 프로그램 모든 화면(PC · 모바일)에 한 번에 — 화면마다 고치지 않고, 글자가 "조회"인 버튼을 누르거나
//    그 버튼 옆 검색칸에서 Enter를 치면 버튼 바로 아래에 작은 표시가 1.6초 떴다 사라진다(누른 시각까지 보여서 다시 눌러도 알 수 있다)
//  · 대상 버튼 글자: 조회 · 조회하기 · 다시 조회 · 새로 조회 · 기간 조회 · …(끝이 "조회"이고 6글자 이하) 또는 data-lookup 이 붙은 버튼
//  · 빼고 싶은 버튼은 data-no-lookup-toast
const pad = (n) => String(n).padStart(2, "0");
const LOOKUP_RE = /^(다시|새로|기간|날짜|검색|이번\s*달|직접)?\s*조회(하기)?$/;

export function isLookupButton(el) {
  if (!el || el.tagName !== "BUTTON" || el.disabled) return false;
  if (el.hasAttribute("data-no-lookup-toast")) return false;
  if (el.hasAttribute("data-lookup")) return true;
  const t = String(el.textContent || "").replace(/\s+/g, " ").trim();
  return t.length <= 8 && LOOKUP_RE.test(t);
}

let box = null; let timer = null;
export function showLookupDone(anchor) {
  try {
    const r = anchor?.getBoundingClientRect?.();
    if (!r || (!r.width && !r.height)) return;
    if (!box) {
      box = document.createElement("div");
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
      box.setAttribute("data-lookup-done", "");
      box.style.cssText = "position:fixed;z-index:2147483000;pointer-events:none;padding:6px 11px;border-radius:10px;background:#0F1A30;color:#fff;font:800 12.5px/1.2 'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕',sans-serif;box-shadow:0 10px 26px rgba(15,26,48,.28);white-space:nowrap;transition:opacity .18s ease,transform .18s ease;opacity:0;transform:translateY(-4px)";
      document.body.appendChild(box);
    }
    const d = new Date();
    box.innerHTML = `<span style="color:#7EE2A8">✓</span> 조회했어요 <span style="opacity:.6;font-weight:700;margin-left:4px;font-variant-numeric:tabular-nums">${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}</span>`;
    const w = box.offsetWidth || 150;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    const below = r.bottom + 40 < window.innerHeight;
    box.style.left = `${left}px`;
    box.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - 36)}px`;
    requestAnimationFrame(() => { if (box) { box.style.opacity = "1"; box.style.transform = "translateY(0)"; } });
    clearTimeout(timer);
    timer = setTimeout(() => { if (box) { box.style.opacity = "0"; box.style.transform = "translateY(-4px)"; } }, 1600);
  } catch { /* 표시만 — 실패해도 조회에는 영향 없음 */ }
}

// 검색칸에서 Enter → 가까운 곳(같은 줄 · 같은 묶음)의 [조회] 버튼
function lookupButtonNear(input) {
  let el = input;
  for (let i = 0; i < 4 && el; i += 1) {
    el = el.parentElement;
    if (!el) break;
    const btn = [...el.querySelectorAll("button")].find(isLookupButton);
    if (btn) return btn;
  }
  return null;
}

let installed = false;
export function installLookupFeedback() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  // 버튼을 누르면 — 화면의 조회 함수가 먼저 돌고 나서 보이도록 조금 뒤에
  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button");
    if (isLookupButton(btn)) setTimeout(() => showLookupDone(btn), 60);
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing || e.shiftKey) return;
    const t = e.target;
    if (!t || t.tagName !== "INPUT" || /^(checkbox|radio|button|submit)$/i.test(t.type || "")) return;
    const btn = lookupButtonNear(t);
    if (btn) setTimeout(() => { if (btn.isConnected) showLookupDone(btn); }, 60);
  }, true);
}
