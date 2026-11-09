// ======================= functions/carrierFareCore.mjs =======================
// 💸 2026-11-09 운송업체별 수수료율 → 기사운임 자동 계산 (서버 routeBoardSync.js · 화면 FixedRouteStatus.jsx 공용, 순수 함수)
//  · 설정: routeCarrierSettings/{회사}.carriers[] = { name, on, rate }   rate = 수수료율(%) 0~100, 소수 1자리 · 없으면 자동 계산 안 함
//    (켜기/끄기와 상관없이 업체마다 따로 정한다)
//  · 규칙: 고정노선 오더(배차표Id)에서 운송업체 수수료율이 있고 청구운임이 있으면
//      기사운임 = 청구운임 × (1 − 수수료율 ÷ 100) (원 단위 반올림) · 수수료 = 청구운임 − 기사운임
//    - 기사운임이 비어 있을 때만 채운다 → 채운 오더에는 기사운임자동: true 표시
//    - 기사운임자동인 오더는 청구운임·운송업체·수수료율이 바뀌면 다시 계산한다
//    - 사람이 넣은 기사운임(자동 표시 없음 · 시트에서 들어온 값 포함)은 절대 덮어쓰지 않는다
//  ⚠ 이 파일은 node 테스트(scripts/carrierFare.test.mjs)와 서버도 읽으므로 다른 파일을 가져오지 않는다.

const CARRIER_KEY_RE = /운송업체|운송사/;
export const toInt = (v) => parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10) || 0;
export const carrierKey = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();

// 오더의 운송업체(시트 "운송업체" 칸 = 추가정보[...]) — src/routeCarriers.js carrierOf 와 같은 기준
export function carrierOfOrder(o) {
  const ex = o?.추가정보;
  if (ex && typeof ex === "object") {
    const direct = String(ex.운송업체 ?? "").trim();
    if (direct) return direct;
    for (const k of Object.keys(ex)) {
      if (CARRIER_KEY_RE.test(k)) { const v = String(ex[k] ?? "").trim(); if (v) return v; }
    }
  }
  return String(o?.운송업체 ?? "").trim();
}

// 수수료율 입력값 정리 — 0~100, 소수 1자리 · 비었거나 잘못된 값은 null(= 자동 계산 안 함)
export function cleanRate(v) {
  if (v === "" || v == null) return null;
  const s = String(v).replace(/[^\d.]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
}

// 설정 → 업체 열쇠 → 수수료율 Map
export function rateMapOf(setting) {
  const m = new Map();
  (Array.isArray(setting?.carriers) ? setting.carriers : []).forEach((c) => {
    const k = carrierKey(c?.name); const r = cleanRate(c?.rate);
    if (k && r != null) m.set(k, r);
  });
  return m;
}
export const rateFor = (setting, name, map = null) => {
  const k = carrierKey(name); if (!k) return null;
  const m = map || rateMapOf(setting);
  return m.has(k) ? m.get(k) : null;
};

export const autoDriverFare = (sale, rate) => Math.round(toInt(sale) * (1 - Number(rate) / 100));

// 오더(바뀐 값을 합친 모습)에 수수료율 자동 계산을 적용한 변경분 — 바꿀 것이 없으면 null
//  o: { 배차표Id, 청구운임, 기사운임, 기사운임자동, 추가정보 … }
export function carrierFarePatch(o, setting, map = null) {
  if (!o || !o.배차표Id) return null; // 일반 오더는 그대로
  const auto = o.기사운임자동 === true;
  const drv = toInt(o.기사운임);
  if (drv && !auto) return null; // 사람이 넣은 기사운임은 지킨다
  const rate = rateFor(setting, carrierOfOrder(o), map);
  const sale = toInt(o.청구운임);
  if (rate == null || !sale) {
    // 수수료율을 지웠거나 청구운임이 없어졌으면 자동으로 넣었던 기사운임만 비운다
    if (auto && drv) return { 기사운임: "", 수수료: sale ? String(sale) : "", 기사운임자동: false };
    return null;
  }
  const next = autoDriverFare(sale, rate);
  const fee = String(sale - next);
  if (auto && drv === next && String(o.수수료 ?? "") === fee) return null;
  return { 기사운임: String(next), 수수료: fee, 기사운임자동: true };
}

// 화면·서버에서 바뀐 값(patch)을 오더에 합쳐 본 모습 — "추가정보.이름" 형태의 점 표기도 합친다
export function mergedOrder(o, patch = {}) {
  const out = { ...(o || {}) };
  const ex = { ...((o && o.추가정보) || {}) };
  let exTouched = false;
  Object.entries(patch || {}).forEach(([k, v]) => {
    if (k.startsWith("추가정보.")) { ex[k.slice(5)] = v; exTouched = true; }
    else if (k === "추가정보" && v && typeof v === "object") { Object.assign(ex, v); exTouched = true; }
    else out[k] = v;
  });
  if (exTouched || o?.추가정보) out.추가정보 = ex;
  return out;
}

// 수수료율을 바꾼 뒤 다시 계산할 오더 — [{ order, patch }]
export function recalcTargets(rows, setting) {
  const map = rateMapOf(setting);
  const out = [];
  (rows || []).forEach((o) => { const p = carrierFarePatch(o, setting, map); if (p) out.push({ order: o, patch: p }); });
  return out;
}
