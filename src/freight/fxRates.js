// ======================= src/freight/fxRates.js =======================
// 💱 2026-11-12 환율 — 하루 한 번 공개 환율(open.er-api.com, 원화 기준)을 받아 이 기기에 기억한다.
//  못 받으면(네트워크 · 차단) 기본값(DEFAULT_RATE)을 쓴다. 운임 줄의 환율 칸은 언제든 직접 고칠 수 있다(저장되는 건 그 줄의 환율)
import { DEFAULT_RATE, CURRENCIES, todayYmd } from "./freightCore";

const KEY = "kpFxRates";
let cache = null; // { day, rates: { USD: 1380, … }, live }
let pending = null;
const read = () => { if (cache) return cache; try { const j = JSON.parse(localStorage.getItem(KEY) || "null"); if (j && j.rates) cache = j; } catch { /* 무시 */ } return cache; };
export function rateOf(cur) {
  if (!cur || cur === "KRW") return 1;
  const c = read();
  return (c && Number(c.rates?.[cur])) || DEFAULT_RATE[cur] || 0;
}
export const ratesInfo = () => { const c = read(); return c && c.live ? { live: true, day: c.day } : { live: false, day: "" }; };
// 오늘 환율이 없으면 받아 둔다(실패해도 조용히 기본값)
export function loadRates() {
  const today = todayYmd();
  const c = read();
  if (c && c.day === today) return Promise.resolve(c);
  if (pending) return pending;
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = setTimeout(() => ctl?.abort(), 6000);
  pending = fetch("https://open.er-api.com/v6/latest/KRW", { signal: ctl?.signal })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const rates = {};
      CURRENCIES.filter((x) => x !== "KRW").forEach((cur) => { const v = Number(j?.rates?.[cur]); if (v > 0) rates[cur] = Math.round((1 / v) * 100) / 100; });
      if (!Object.keys(rates).length) return read();
      cache = { day: today, rates, live: true };
      try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* 무시 */ }
      return cache;
    })
    .catch(() => read())
    .finally(() => { clearTimeout(t); pending = null; });
  return pending;
}
