// ======================= src/clientCloseDays.js =======================
// 🗓 2026-11-27 거래처별 마감일을 화면에 넣기 — 규칙은 functions/arCore.mjs(청구월 monthOf 한 곳)
//  · 거래처 목록(clients)을 받을 때마다 registerCloseDays(회사, 목록) → 정산 홈 · 월 마감 · 거래명세서 · 미수금 · 매출이 같은 달로 묶인다
//  · 이 기기에 마지막 값을 기억 — 오더가 거래처보다 먼저 와도 처음부터 맞는 달
//  · 마감일이 바뀌면 "kp-close-days" 이벤트 → 화면이 오더 묶음을 다시 계산
import React from "react";
import { setClientCloseDays, closeRulesVersion, closeRuleOf, closePeriodOf, normCloseRule, overrideRangeOf } from "../functions/arCore.mjs";

const LS = (co) => `kpCloseDays:v1:${co}`;
const pick = (arr) => (arr || []).filter((c) => normCloseRule(c?.마감일, c?.마감시작월, c?.마감변경)).map((c) => ({ 거래처명: String(c.거래처명 || c.업체명 || "").trim(), 마감일: c.마감일 || "", 마감시작월: c.마감시작월 || "", 마감변경: c.마감변경 || {} }));

try {
  const co = localStorage.getItem("kpCloseDaysCo");
  if (co != null) setClientCloseDays(co, JSON.parse(localStorage.getItem(LS(co)) || "[]"));
} catch { /* 무시 */ }

export function registerCloseDays(company, clients) {
  const co = String(company || "");
  const list = pick(clients);
  const v0 = closeRulesVersion();
  setClientCloseDays(co, list);
  try { localStorage.setItem(LS(co), JSON.stringify(list)); localStorage.setItem("kpCloseDaysCo", co); } catch { /* 무시 */ }
  if (closeRulesVersion() !== v0) { try { window.dispatchEvent(new Event("kp-close-days")); } catch { /* 무시 */ } }
}
// 화면 표시용 — "25일 마감" · 기간 "10.26 ~ 11.25"
export const closeDayLabel = (client) => { const r = closeRuleOf(client); return r?.day ? `${r.day}일 마감` : "말일"; };
export const clientPeriod = (client, ym) => closePeriodOf(ym, closeRuleOf(client));
export const periodText = (p) => `${p.from.slice(5).replace("-", ".")} ~ ${p.to.slice(5).replace("-", ".")}`;
export { closeRuleOf, normCloseRule, overrideRangeOf };
// 마감일이 바뀌면 다시 그리기 — useMemo 의존값에 넣는다
export function useCloseDaysVersion() {
  const [v, setV] = React.useState(closeRulesVersion);
  React.useEffect(() => { const f = () => setV(closeRulesVersion()); window.addEventListener("kp-close-days", f); return () => window.removeEventListener("kp-close-days", f); }, []);
  return v;
}
