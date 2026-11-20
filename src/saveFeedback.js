// ======================= src/saveFeedback.js =======================
// ✅ 2026-11-20 "저장했어요" 알림(사용자 요청 — 저장하고 나서 저장된 건지 알 수 있게 · 떴다가 사라지게)
//  · 모양 · 자리: "✓ 조회했어요"(src/lookupFeedback.js)와 같은 남색 알림, 화면 위쪽 가운데 · 1.8초 뒤 저절로 사라진다
//  · 프로그램 모든 화면(PC · 모바일 · 화주사 · 기사앱)에 한 번에 — 화면마다 고치지 않는다
//    ① 짧은 완료 알림("저장되었습니다" · "수정 완료" …)은 [확인]을 눌러야 닫히는 창 대신 이 알림으로(kpDialog.jsx installAlertShim · kpAlert)
//    ② 알림이 없던 [저장] 버튼 — 누른 뒤 저장이 진행된 흔적(버튼이 잠겼다 풀림 · 창이 닫힘)이 있고
//       다른 안내 창(오류 · 확인)이나 진행 창이 뜨지 않았으면 "저장했어요"
//  · 오류 · 입력 빠짐 · 확인 질문은 지금처럼 확인창(놓치지 않게)
//  · 빼고 싶은 버튼은 data-no-save-toast · 억지로 넣고 싶은 버튼은 data-save-toast
//  이 파일은 다른 화면 파일을 가져오지 않는다(테스트: scripts/saveFeedback.test.mjs)

const pad = (n) => String(n).padStart(2, "0");

// ── ① 완료 알림인지(짧고 · 한 줄 · 끝이 완료 말투 · 부정어 없음) ─────────────
const DONE_END = /(했습니다|되었습니다|됐습니다|했어요|됐어요|했음|완료|완료됨|완료했습니다|완료되었습니다)\s*[.!~]*$/;
const DONE_WORD = /(저장|수정|등록|반영|변경|적용|처리|삭제|정리|발송|전송|보냈|복사|확정|정규화|초기화|업로드|추가|해제|설정|완료)/;
const NOT_DONE = /(실패|없어 |없어서|오류|에러|못\s?했|못\s?합|못하|없습니다|없어요|않았|않습니다|안 됐|안됐|주세요|하세요|십시오|확인해|필요|불가|중복|잘못|이미 |취소되었|취소했)/;
export function isDoneNotice(msg) {
  const t = String(msg ?? "").trim();
  if (!t || t.length > 60 || /\n/.test(t)) return false;
  if (NOT_DONE.test(t)) return false;
  return DONE_END.test(t) && DONE_WORD.test(t);
}

// ── 알림 그리기 ─────────────────────────────────────────────
let box = null; let timer = null;
let lastShownAt = 0;
export const savedShownAt = () => lastShownAt;
export function showSaved(message = "저장했어요") {
  lastShownAt = Date.now();
  try {
    if (typeof document === "undefined") return;
    if (!box) {
      box = document.createElement("div");
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
      box.setAttribute("data-save-done", "");
      box.style.cssText = "position:fixed;left:50%;top:76px;z-index:2147483000;pointer-events:none;display:flex;align-items:center;gap:9px;padding:9px 16px 9px 11px;border-radius:14px;background:#0F1A30;color:#fff;font:800 14.5px/1.2 'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕',sans-serif;box-shadow:0 14px 34px rgba(15,26,48,.32);white-space:nowrap;max-width:calc(100vw - 32px);opacity:0;transform:translate(-50%,-8px);transition:opacity .18s ease,transform .18s ease";
      document.body.appendChild(box);
    }
    const d = new Date();
    const text = String(message || "저장했어요").replace(/[<>&]/g, "").trim();
    box.innerHTML = `<span style="width:22px;height:22px;border-radius:50%;background:#7EE2A8;color:#0F1A30;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;flex-shrink:0">✓</span><span style="overflow:hidden;text-overflow:ellipsis">${text}</span><span style="opacity:.55;font-weight:700;font-size:12.5px;font-variant-numeric:tabular-nums">${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}</span>`;
    // 휴대폰은 위쪽 메뉴가 낮아 조금 더 아래(모바일 머리줄 아래)
    box.style.top = (window.innerWidth || 1024) < 640 ? "64px" : "76px";
    requestAnimationFrame(() => { if (box) { box.style.opacity = "1"; box.style.transform = "translate(-50%,0)"; } });
    clearTimeout(timer);
    timer = setTimeout(() => { if (box) { box.style.opacity = "0"; box.style.transform = "translate(-50%,-8px)"; } }, 1800);
  } catch { /* 표시만 — 실패해도 저장에는 영향 없음 */ }
}

// ── ② 알림이 없던 [저장] 버튼 ───────────────────────────────────
const SAVE_RE = /^(저장|저장하기|수정\s?저장|변경\s?저장|변경사항\s?저장|설정\s?저장|저장\s?후\s?닫기|저장하고\s?닫기|수정\s?완료|수정하기|내용\s?저장|정보\s?저장)$/;
export function isSaveButton(el) {
  if (!el || el.tagName !== "BUTTON" || el.disabled) return false;
  if (el.closest?.("[data-no-save-toast]")) return false;
  if (el.hasAttribute("data-save-toast")) return true;
  const t = String(el.textContent || "").replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
  return t.length <= 10 && SAVE_RE.test(t);
}
const BLOCKERS = "[data-kp-dialog],[data-kp-delete-progress]";
let installed = false;
export function installSaveFeedback() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  let blockerAt = 0;
  // 안내 창 · 진행 창이 새로 뜨면 기록(그 화면이 스스로 결과를 알려 준다)
  try {
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) {
        if (n.nodeType === 1 && (n.matches?.(BLOCKERS) || n.querySelector?.(BLOCKERS))) { blockerAt = Date.now(); return; }
      }
    }).observe(document.body, { childList: true, subtree: true });
  } catch { /* 무시 */ }
  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button");
    if (!isSaveButton(btn)) return;
    const t0 = Date.now();
    const label = String(btn.textContent || "").trim();
    let acted = false;
    const tick = setInterval(() => {
      if (!btn.isConnected || btn.disabled || String(btn.textContent || "").trim() !== label) acted = true;
    }, 40);
    setTimeout(() => {
      clearInterval(tick);
      if (!btn.isConnected) acted = true;
      if (blockerAt >= t0 || lastShownAt >= t0) return; // 다른 안내 · 진행 창 · 완료 알림이 이미 떴다
      if (document.querySelector(BLOCKERS)) return;
      if (acted) showSaved("저장했어요");
    }, 1100);
  }, true);
}
