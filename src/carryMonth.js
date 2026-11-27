// ======================= src/carryMonth.js =======================
// 🗓 2026-11-27 이월 오더 일괄 지정 — 배차현황 · 월 마감에서 고른 오더들의 마감월을 한 번에 바꾸는 창(익월 · 고른 달 · 비우기)
//  계산은 src/closeFlow.js(carryPlan · carryPatchOf), 저장은 화면이 넘긴 save(o, patch) — 배차현황 patchDispatch · 월 마감 onPatch
import { kpAlert, kpChoose, kpConfirm, kpPrompt } from "./kpDialog";
import { runBulkTask } from "./DeleteProgress";
import { carryPlan } from "./closeFlow";

const ymKo = (ym) => (/^\d{4}-\d{2}$/.test(String(ym)) ? `${Number(String(ym).slice(0, 4))}년 ${Number(String(ym).slice(5))}월` : "");

// rows: 고른 오더 · isLocked(o): 최종마감 잠금인지 · save(o, patch) → false 면 실패로 셈
export async function askCarryMonth(rows = [], { isLocked = () => false, save } = {}) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) { await kpAlert("마감월을 바꿀 오더를 먼저 골라 주세요."); return 0; }
  const mode = await kpChoose(`고른 오더 ${list.length}건의 마감월(청구할 달)을 정해요.\n명세서 · 미수금 · 매출이 이 달로 잡혀요.`, [
    { value: "next", label: "익월로(상차일 다음 달)", sub: "예: 10/31 상차 → 11월 청구" },
    { value: "ym", label: "달을 직접 고르기", sub: "예: 2026-12" },
    { value: "clear", label: "마감월 비우기", sub: "상차일의 달(거래처 마감일이 있으면 그 기준)로 돌아가요" },
  ], { title: "마감월 지정", okText: "다음" });
  if (mode == null) return 0;
  let ym = "";
  if (mode === "ym") {
    const v = await kpPrompt("마감월을 적어 주세요(예: 2026-12)", "", { title: "마감월", placeholder: "2026-12" });
    if (v == null) return 0;
    ym = String(v).trim().replace(/[./]/g, "-").replace(/^(\d{4})-(\d)$/, "$1-0$2");
    if (!/^\d{4}-\d{2}$/.test(ym)) { await kpAlert("2026-12 처럼 연도-월로 적어 주세요."); return 0; }
  }
  const plan = carryPlan(list, mode, ym, isLocked);
  if (!plan.todo.length) {
    await kpAlert(plan.locked ? `최종마감된 달이라 바꿀 수 없어요(${plan.locked}건). 경리팀에 일시해제를 요청해 주세요.` : "이미 그 마감월이에요. 바꿀 오더가 없어요.");
    return 0;
  }
  const target = mode === "clear" ? "비우기(상차일 달)" : mode === "ym" ? ymKo(ym) : "각 오더 상차일의 다음 달";
  const skip = [plan.same ? `이미 그 달 ${plan.same}건` : "", plan.locked ? `최종마감이라 못 바꿈 ${plan.locked}건` : ""].filter(Boolean).join(" · ");
  if (!(await kpConfirm(`${plan.todo.length}건의 마감월을 바꿀까요?\n마감월: ${target}${skip ? `\n빼는 오더: ${skip}` : ""}`, { title: "마감월 지정", okText: "바꾸기" }))) return 0;
  let ok = 0;
  await runBulkTask({ count: plan.todo.length, label: "오더", verb: "마감월 지정", task: async (progress) => {
    let k = 0;
    for (const { o, patch } of plan.todo) { try { const r = await save(o, patch); if (r !== false) ok += 1; } catch (e) { /* 다음 오더 */ } progress(++k); }
  } });
  await kpAlert(`${ok}건의 마감월을 바꿨어요${ok < plan.todo.length ? ` · ${plan.todo.length - ok}건은 저장하지 못했어요` : ""}`);
  return ok;
}
