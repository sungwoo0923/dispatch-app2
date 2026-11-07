// ======================= src/publicDataClient.js =======================
// 🏛 2026-11-07 국세청 조회기 · 날씨 저장소(화면 쪽 상태) — React · Firebase 없이 순수 JS(테스트: scripts/publicData.test.mjs)
//  배차 프로그램(src/publicDataMain.jsx)과 허브(cafe-site/src/hub/hubPublicData.jsx)가 각자 call · readDoc을 넘겨 하나씩 만든다.
import { bizNoDigits, bizNoValid, bizWarnText, BIZ_STATE_LABEL } from "../functions/publicDataCore.mjs";

export const NO_KEY_TEXT = "국세청 조회 키가 아직 없어요";

// ─────────────── 조회기(화면마다 하나) ───────────────
export function createBizChecker(call, { timeoutMs = 9000 } = {}) {
  const cache = new Map(); // 번호 → 결과
  const subs = new Set();
  let disabled = false;
  let ver = 0;
  const emit = () => { ver++; subs.forEach((f) => { try { f(); } catch { /* 무시 */ } }); };
  const withTimeout = (p) => {
    let t = null;
    const to = new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error("시간이 오래 걸려요"), { code: "timeout" })), timeoutMs); });
    return Promise.race([p, to]).finally(() => clearTimeout(t));
  };
  async function check(values, { perCall = 100 } = {}) {
    const nums = [...new Set((Array.isArray(values) ? values : [values]).map(bizNoDigits).filter((d) => d.length === 10))];
    const out = {};
    const need = [];
    nums.forEach((n) => {
      if (!bizNoValid(n)) { out[n] = { bNo: n, state: "invalid", label: BIZ_STATE_LABEL.invalid }; cache.set(n, out[n]); }
      else if (cache.has(n) && cache.get(n).state !== "unknown") out[n] = cache.get(n);
      else need.push(n);
    });
    for (let i = 0; i < need.length; i += perCall) {
      const part = need.slice(i, i + perCall);
      const r = await withTimeout(call("bizStatusCheck", { bNos: part }));
      if (r?.disabled) disabled = true;
      Object.entries(r?.results || {}).forEach(([k, v]) => { out[k] = v; if (v.state !== "unknown") cache.set(k, v); });
    }
    emit();
    return { results: out, disabled };
  }
  return {
    check,
    get: (v) => cache.get(bizNoDigits(v)) || null,
    isDisabled: () => disabled,
    subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
    version: () => ver,
  };
}
// ─────────────── 저장 전 확인 ───────────────
// confirm(message, opts) → Promise<boolean> (배차 프로그램은 kpConfirm). 조회가 안 되면(키 없음 · 실패) 막지 않는다.
export async function bizGuard(checker, value, confirm, { label = "사업자" } = {}) {
  const d = bizNoDigits(value);
  if (!checker || d.length !== 10 || !bizNoValid(d)) return true;
  let res = checker.get(d);
  if (!res) { try { res = (await checker.check([d])).results[d] || null; } catch { res = null; } }
  const warn = bizWarnText(res);
  if (!warn) return true;
  return !!(await confirm(`${warn}\n그래도 ${label} 정보를 저장할까요?`, { title: res.state === "closed" ? "폐업한 사업자" : "휴업 중인 사업자", okText: "저장", danger: true }));
}

// ─────────────── 날씨 저장소 ───────────────
const FRESH_MS = 3.5 * 3600e3;

export function createWeatherStore({ call, readDoc, now = () => Date.now() }) {
  const regions = {};
  let warn = null;
  let disabled = false;
  let ver = 0;
  const asked = new Set();
  const subs = new Set();
  let queue = new Set();
  let timer = null;
  let warnAsked = false;
  const emit = () => { ver++; subs.forEach((f) => { try { f(); } catch { /* 무시 */ } }); };
  async function flush() {
    timer = null;
    const keys = [...queue]; queue = new Set();
    if (!keys.length) return;
    const stale = [];
    const reads = await Promise.all(keys.map((k) => Promise.resolve(readDoc ? readDoc(k) : null).catch(() => null)));
    reads.forEach((d, i) => {
      if (d && d.hours) regions[keys[i]] = d;
      if (!d || Number(d.fetchedAt || 0) < now() - FRESH_MS) stale.push(keys[i]);
    });
    if (!warnAsked) {
      warnAsked = true;
      const w = await Promise.resolve(readDoc ? readDoc("_warn") : null).catch(() => null);
      if (w) warn = w;
      if (!w || Number(w.fetchedAt || 0) < now() - FRESH_MS) { if (!stale.length && keys.length) stale.push(keys[0]); }
    }
    emit();
    if (!stale.length || disabled || !call) return;
    for (let i = 0; i < stale.length; i += 40) {
      try {
        const r = await call("weatherFor", { regions: stale.slice(i, i + 40) });
        if (r?.disabled) disabled = true;
        Object.entries(r?.regions || {}).forEach(([k, v]) => { if (v?.hours) regions[k] = v; });
        if (r?.warn) warn = r.warn;
        emit();
        if (disabled) break;
      } catch { break; /* 서버가 안 되면 조용히(저장된 값만) */ }
    }
  }
  return {
    request(keys) {
      let added = false;
      (keys || []).forEach((k) => { if (k && !asked.has(k)) { asked.add(k); queue.add(k); added = true; } });
      if (added && !timer) timer = setTimeout(flush, 60);
    },
    region: (k) => regions[k] || null,
    warn: () => warn,
    isDisabled: () => disabled,
    subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
    version: () => ver,
    // 테스트 · 둘러보기용
    _seed(map, w) { Object.assign(regions, map || {}); if (w) warn = w; Object.keys(map || {}).forEach((k) => asked.add(k)); warnAsked = true; emit(); },
  };
}

