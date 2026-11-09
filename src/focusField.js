// ======================= src/focusField.js =======================
// ⭐ 2026-11-10 필수 입력 안내 뒤 — [확인]을 누르면 그 입력칸으로 화면을 옮기고(가운데) 커서를 넣은 뒤 빨간 테두리로 잠깐 깜빡인다.
//  입력칸을 감싼 요소에 data-req-key="키"(또는 data-req-label="이름")를 달아 두면 된다. 계약서·전자결재 등 공용.
export function focusField({ key, label, root = document } = {}) {
  const esc = (s) => String(s).replace(/["\\]/g, "\\$&");
  const box = (key && root.querySelector(`[data-req-key="${esc(key)}"]`)) || (label && root.querySelector(`[data-req-label="${esc(label)}"]`));
  if (!box) return false;
  try { box.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { box.scrollIntoView(); }
  const input = box.matches("input,textarea,select,button") ? box : box.querySelector("input:not([type=hidden]),textarea,select,button,[tabindex]");
  setTimeout(() => { try { input?.focus({ preventScroll: true }); } catch { /* 무시 */ } }, 350);
  box.classList.remove("kp-req-flash"); void box.offsetWidth; box.classList.add("kp-req-flash");
  setTimeout(() => box.classList.remove("kp-req-flash"), 3200);
  return true;
}
// 알림 → 확인 후 첫 빈 칸으로
export async function alertAndFocus(alertFn, message, target) {
  await alertFn(message);
  setTimeout(() => focusField(target), 60);
}
