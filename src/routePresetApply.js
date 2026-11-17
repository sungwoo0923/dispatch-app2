// ======================= src/routePresetApply.js =======================
// ⭐ 2026-11-17 노선별 고정 특수운임 → 오더에 적용(순수 함수 · firebase 없음 — scripts/routePreset.test.mjs 가 시험한다)
//  계산: functions/routePresetCore.mjs(planRoutePreset) → src/forkliftCore.js(specialApplyAll) — 팝업 [적용]과 같은 길이라
//  운임구분(운임 규칙)이 계산한 기사운임 · 청구운임 · 수수료가 같은 방식으로 맞춰진다(fareDeductOf가 기사 차감분을 규칙대로로 본다)
import { specialApplyAll } from "./forkliftCore.js";
import { AUTO, planRoutePreset } from "../functions/routePresetCore.mjs";

// ── 오더에 적용(순수 — 테스트 가능) ──
//  바꿀 것이 없으면 같은 객체를 그대로 돌려준다(React setState 가 다시 그리지 않게)
export function applyRoutePresets(order, presets, { asString = true, strict = false } = {}) {
  const plan = planRoutePreset(order, presets, { strict });
  if (!plan) return order;
  const out = specialApplyAll(order, { fork: plan.fork, items: plan.items }, { asString });
  // specialApplyAll 은 항목을 새로 만들며 auto 표시를 뺀다 → 다시 붙인다(같은 순서 · 금액 > 0 만)
  const src = plan.items.filter((x) => x && Number(String(x.금액).replace(/[^\d.-]/g, "")) > 0);
  out.특수운임 = (out.특수운임 || []).map((x, i) => (src[i]?.auto ? { ...x, auto: src[i].auto } : x));
  out.지게차자동 = plan.forkAuto ? AUTO : "";
  return out;
}

