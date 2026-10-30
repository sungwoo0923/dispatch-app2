// ===================== 월 비교 분석 엔진 =====================
// ⭐ 사용자 요청 — "8월보다 9월 매출이 많이 늘었는데 수익은 같다" 같은 상황을 전체 데이터로
// 분석해 원인을 알려준다. 외부 AI 호출 없이 실제 오더 데이터로만 계산하므로 숫자가 정확하다.
//
// 수익 변화 분해(합계가 정확히 일치):
//   수익B − 수익A = 물량효과 + 단가효과 + 수익률효과
//   물량효과   = (건수B − 건수A) × 건당수익A
//   단가효과   = 건수B × (건당매출B − 건당매출A) × 수익률A
//   수익률효과 = 매출B × (수익률B − 수익률A)
// 항목별 "수익률 하락 기여" = 수익B_항목 − 매출B_항목 × 수익률A(전체)
//   → 모든 항목을 더하면 수익률효과와 정확히 같다(어디서 마진이 깎였는지).

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

export const toWon = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;

export function statsOf(list) {
  let sale = 0, driver = 0;
  for (const r of list) { sale += toWon(r.청구운임); driver += toWon(r.기사운임); }
  const cnt = list.length;
  const profit = sale - driver;
  return {
    cnt, sale, driver, profit,
    rate: sale ? profit / sale : 0,
    avgSale: cnt ? sale / cnt : 0,
    avgProfit: cnt ? profit / cnt : 0,
  };
}

// 👤 담당자는 무조건 "이름"으로 — 오더에는 계정 이메일(작성자)만 있는 경우가 많아 직원 명부(users)로 바꾼다
const STAFF_NAME = new Map();
const nameSubs = new Set();
let nameStarted = false;
export function ensureStaffNames() {
  if (nameStarted) return;
  nameStarted = true;
  onSnapshot(collection(db, "users"), (snap) => {
    STAFF_NAME.clear();
    snap.docs.forEach((d) => {
      const u = d.data() || {};
      const n = String(u.name || u.이름 || u.담당자명 || u.displayName || "").trim();
      if (!n) return;
      const em = String(u.email || "").trim().toLowerCase();
      if (em) { STAFF_NAME.set(em, n); STAFF_NAME.set(em.split("@")[0], n); }
      STAFF_NAME.set(d.id, n);
    });
    nameSubs.forEach((f) => f(Date.now()));
  }, () => { nameStarted = false; });
}
// 화면에서 쓰기: const namesVer = useStaffNames(); → useMemo 의존성에 넣으면 이름이 오는 대로 다시 계산
export function useStaffNames() {
  const [v, setV] = useState(0);
  useEffect(() => { ensureStaffNames(); nameSubs.add(setV); return () => { nameSubs.delete(setV); }; }, []);
  return v;
}
export const creatorOf = (r) => {
  const named = String(r.등록자명 || r.createdByName || "").trim();
  if (named && !named.includes("@")) return STAFF_NAME.get(named.toLowerCase()) || named;
  const raw = String(r.등록자 || r.작성자 || r.createdByEmail || named || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase();
  return STAFF_NAME.get(key) || STAFF_NAME.get(key.split("@")[0]) || (raw.includes("@") ? raw.split("@")[0] : raw);
};

export const COMPARE_DIMS = [
  { key: "client", label: "거래처", get: (r) => String(r.거래처명 || "").trim() || "(거래처 미입력)" },
  { key: "method", label: "배차방식", get: (r) => (r.__fixed ? "고정거래처" : String(r.배차방식 || "").trim() || "미지정") },
  { key: "vehicle", label: "차량종류", get: (r) => String(r.차량종류 || "").trim() || "미지정" },
  { key: "pay", label: "지급방식", get: (r) => String(r.지급방식 || "").trim() || "미지정" },
  { key: "staff", label: "배차담당", get: (r) => creatorOf(r) || "미지정" },
];

function anomalyOf(r) {
  const s = toWon(r.청구운임), d = toWon(r.기사운임), p = s - d;
  if (s > 0 && d === 0 && !r.__fixed) return { type: "기사운임 미입력", tone: "warn", note: "수익이 실제보다 크게 잡혔을 수 있음" };
  if (s === 0 && d > 0) return { type: "청구운임 미입력", tone: "bad", note: "매출 없이 운반비만 나감" };
  if (s > 0 && p < 0) return { type: "역마진", tone: "bad", note: `${(-p).toLocaleString()}원 손해` };
  if (s > 0 && p === 0) return { type: "수익 0원", tone: "warn", note: "청구=기사운임" };
  if (s > 0 && p / s < 0.05) return { type: "저마진", tone: "warn", note: `수익률 ${((p / s) * 100).toFixed(1)}%` };
  return null;
}

export function analyzeMonths({ rows = [], monthA, monthB, scope = "pure", isExcluded = () => false }) {
  const inScope = (r) => scope === "all" ? true : scope === "excluded" ? isExcluded(r.거래처명) : !isExcluded(r.거래처명);
  const listA = rows.filter((r) => String(r.상차일 || "").startsWith(monthA) && inScope(r));
  const listB = rows.filter((r) => String(r.상차일 || "").startsWith(monthB) && inScope(r));
  const A = statsOf(listA), B = statsOf(listB);

  const volume = (B.cnt - A.cnt) * A.avgProfit;
  const price = B.cnt * (B.avgSale - A.avgSale) * A.rate;
  const margin = B.sale * (B.rate - A.rate);

  const dims = {};
  for (const dim of COMPARE_DIMS) {
    const map = new Map();
    const push = (r, side) => {
      const k = dim.get(r);
      if (!map.has(k)) map.set(k, { key: k, a: [], b: [] });
      map.get(k)[side].push(r);
    };
    listA.forEach((r) => push(r, "a"));
    listB.forEach((r) => push(r, "b"));
    dims[dim.key] = [...map.values()].map((g) => {
      const a = statsOf(g.a), b = statsOf(g.b);
      return { key: g.key, a, b, dProfit: b.profit - a.profit, dSale: b.sale - a.sale, marginImpact: b.profit - b.sale * A.rate, isNew: a.cnt === 0 && b.cnt > 0, isGone: a.cnt > 0 && b.cnt === 0 };
    }).sort((x, y) => x.marginImpact - y.marginImpact);
  }

  const anomaliesB = listB.map((r) => ({ r, an: anomalyOf(r) })).filter((x) => x.an)
    .sort((x, y) => (toWon(x.r.청구운임) - toWon(x.r.기사운임)) - (toWon(y.r.청구운임) - toWon(y.r.기사운임)));
  const anomaliesA = listA.map((r) => anomalyOf(r)).filter(Boolean);
  const countBy = (arr) => arr.reduce((m, a) => { const t = a.type || a.an.type; m[t] = (m[t] || 0) + 1; return m; }, {});

  // 이상 오더 비교(건수·금액) — 리스트 대신 두 달 합계 비교
  const anomalySummary = ANOMALY_TYPES.map((t) => {
    const sum = (list) => {
      const hit = list.filter((r) => anomalyOf(r)?.type === t.type);
      return { cnt: hit.length, amount: hit.reduce((acc, r) => acc + t.amount(r), 0) };
    };
    return { ...t, a: sum(listA), b: sum(listB) };
  });

  // 순수 운송(매출관리)에서 빠지는 거래처 — 두 달 기준
  const exMap = new Map();
  for (const [side, list] of [["a", rows.filter((r) => String(r.상차일 || "").startsWith(monthA))], ["b", rows.filter((r) => String(r.상차일 || "").startsWith(monthB))]]) {
    for (const r of list) {
      if (!isExcluded(r.거래처명)) continue;
      const k = String(r.거래처명 || "").trim() || "(거래처 미입력)";
      if (!exMap.has(k)) exMap.set(k, { key: k, a: [], b: [] });
      exMap.get(k)[side].push(r);
    }
  }
  const excludedClients = [...exMap.values()].map((g) => ({ key: g.key, a: statsOf(g.a), b: statsOf(g.b) })).sort((x, y) => (y.a.sale + y.b.sale) - (x.a.sale + x.b.sale));

  const detailA = monthDetail(listA), detailB = monthDetail(listB);
  const payKeys = [...new Set([...PAY_ORDER, ...Object.keys(detailA.pay), ...Object.keys(detailB.pay)])].filter((k) => detailA.pay[k] || detailB.pay[k]);

  return { monthA, monthB, scope, A, B, listA, listB, detailA, detailB, payKeys, effects: { volume, price, margin, total: B.profit - A.profit }, dims, anomaliesB, anomalyCountB: countBy(anomaliesB), anomalyCountA: countBy(anomaliesA), anomalySummary, excludedClients };
}

// ── 월별 상세 집계(좌우 비교용) ───────────────────────────────────────
// ⭐ 수익률 구간 — "매출은 늘었는데 수익은 그대로"의 가장 흔한 원인(마진 낮은 오더 증가)을 바로 보여준다
export const MARGIN_BANDS = [
  { key: "15", label: "수익률 15% 이상" },
  { key: "10", label: "10% ~ 15%" },
  { key: "5", label: "5% ~ 10%" },
  { key: "0", label: "0% ~ 5%" },
  { key: "neg", label: "수익 0원 이하" },
];
function bandOf(s, d) {
  const p = s - d;
  if (p <= 0 || s <= 0) return "neg";
  const r = p / s;
  return r >= 0.15 ? "15" : r >= 0.10 ? "10" : r >= 0.05 ? "5" : "0";
}
export const PAY_ORDER = ["계산서", "착불", "선불", "계좌이체", "개인", "손실", "취소", "미지정"];
export function monthDetail(list) {
  const st = statsOf(list);
  const pay = {};
  let lossAmt = 0, lossCnt = 0, noSaleDriver = 0, noSaleCnt = 0, fixedSale = 0, fixedCnt = 0;
  const days = new Set(), clients = new Set();
  const bands = Object.fromEntries(MARGIN_BANDS.map((b) => [b.key, { cnt: 0, sale: 0, driver: 0 }]));
  for (const r of list) {
    const s = toWon(r.청구운임), d = toWon(r.기사운임);
    const band = bandOf(s, d);
    bands[band].cnt++; bands[band].sale += s; bands[band].driver += d;
    const k = r.__fixed ? "계산서" : (String(r.지급방식 || "").trim() || "미지정");
    if (!pay[k]) pay[k] = { cnt: 0, sale: 0, driver: 0 };
    pay[k].cnt++; pay[k].sale += s; pay[k].driver += d;
    if (s - d < 0) { lossAmt += d - s; lossCnt++; }
    if (s === 0 && d > 0) { noSaleDriver += d; noSaleCnt++; }
    if (r.__fixed) { fixedSale += s; fixedCnt++; }
    if (r.상차일) days.add(String(r.상차일).slice(0, 10));
    if (r.거래처명) clients.add(String(r.거래처명).trim());
  }
  return {
    ...st,
    avgDriver: st.cnt ? st.driver / st.cnt : 0,
    pay, bands, lossAmt, lossCnt, noSaleDriver, noSaleCnt, fixedSale, fixedCnt,
    days: days.size, clients: clients.size,
    perDaySale: days.size ? st.sale / days.size : 0,
    perDayCnt: days.size ? st.cnt / days.size : 0,
  };
}

export const ANOMALY_TYPES = [
  { type: "청구운임 미입력", tone: "bad", amountLabel: "나간 운반비", amount: (r) => toWon(r.기사운임), desc: "매출 0원인데 기사운임만 나간 오더 — 수익이 그만큼 줄어듦" },
  { type: "역마진", tone: "bad", amountLabel: "손해 금액", amount: (r) => toWon(r.기사운임) - toWon(r.청구운임), desc: "기사운임이 청구운임보다 큰 오더" },
  { type: "기사운임 미입력", tone: "warn", amountLabel: "청구운임", amount: (r) => toWon(r.청구운임), desc: "기사운임이 비어 수익이 실제보다 크게 잡힌 오더" },
  { type: "수익 0원", tone: "warn", amountLabel: "청구운임", amount: (r) => toWon(r.청구운임), desc: "청구운임 = 기사운임" },
  { type: "저마진", tone: "warn", amountLabel: "수익", amount: (r) => toWon(r.청구운임) - toWon(r.기사운임), desc: "수익률 5% 미만" },
];

// ── 쉬운 설명: "매출은 늘었는데 왜 수익은 그대로인가" ─────────────────────
// B월 매출을 A월 수익률로 벌었다면 받았을 수익(기대 수익)과 실제 수익의 차이를
// 원인별로 나눈다. 원인끼리 겹치지 않게(이상 오더는 거래처 계산에서 뺌) 나누고,
// 나머지는 "기타"로 묶어 합계가 정확히 맞게 한다.
export function explainGap(res) {
  const { A, B, listB, monthA, monthB } = res;
  const a = mLabel(monthA), b = mLabel(monthB);
  const expected = B.sale * A.rate;
  const gap = B.profit - expected; // 음수면 덜 번 것
  const reasons = [];
  const used = new Set();
  const impactOf = (list) => list.reduce((acc, r) => acc + (toWon(r.청구운임) - toWon(r.기사운임)) - toWon(r.청구운임) * A.rate, 0);

  const noSale = listB.filter((r) => anomalyOf(r)?.type === "청구운임 미입력");
  if (noSale.length) {
    noSale.forEach((r) => used.add(r));
    reasons.push({ label: "청구운임 미입력 오더", amount: impactOf(noSale), desc: `${noSale.length}건 · 매출 0원에 운반비만 나감` });
  }
  const neg = listB.filter((r) => anomalyOf(r)?.type === "역마진");
  if (neg.length) {
    neg.forEach((r) => used.add(r));
    reasons.push({ label: "역마진 오더", amount: impactOf(neg), desc: `${neg.length}건 · 기사운임이 청구운임보다 큼` });
  }
  // 거래처별(이상 오더 제외)
  const byClient = new Map();
  listB.filter((r) => !used.has(r)).forEach((r) => {
    const k = String(r.거래처명 || "").trim() || "(거래처 미입력)";
    if (!byClient.has(k)) byClient.set(k, []);
    byClient.get(k).push(r);
  });
  const clientImpacts = [...byClient.entries()].map(([k, list]) => {
    const st = statsOf(list);
    return { key: k, impact: impactOf(list), st };
  }).filter((c) => c.impact < 0).sort((x, y) => x.impact - y.impact).slice(0, 3);
  clientImpacts.forEach((c) => reasons.push({ label: `거래처 "${c.key}"`, amount: c.impact, desc: `${b} 매출 ${man(c.st.sale)} · 수익률 ${pct(c.st.rate)} (${a} 평균 ${pct(A.rate)}보다 낮음)` }));
  const shown = reasons.reduce((acc, r) => acc + r.amount, 0);
  const other = gap - shown;
  if (Math.abs(other) >= 10000) reasons.push({ label: "그 밖의 오더", amount: other, desc: other < 0 ? "여러 오더에 조금씩 나뉜 마진 감소" : "다른 오더들은 평균보다 조금 더 남김(위 감소분을 일부 상쇄)" });

  const saleDiff = B.sale - A.sale, profitDiff = B.profit - A.profit;
  const headline = `${b}은 ${a}보다 매출이 ${signMan(saleDiff)}${Math.abs(profitDiff) < Math.abs(saleDiff) * A.rate * 0.5 && saleDiff > 0 ? `인데, 수익은 ${signMan(profitDiff)}로 거의 그대로입니다.` : `, 수익은 ${signMan(profitDiff)}입니다.`}`;
  const why = gap < 0
    ? `${a}처럼 매출의 ${pct(A.rate)}를 남겼다면 ${b} 수익은 ${man(expected)}이어야 하지만, 실제로는 ${man(B.profit)}만 남아 ${man(-gap)}을 덜 벌었습니다. (${b} 수익률 ${pct(B.rate)})`
    : `${b}은 ${a} 수익률(${pct(A.rate)})보다 높은 ${pct(B.rate)}를 남겨 기대보다 ${man(gap)} 더 벌었습니다.`;
  return { headline, why, expected, gap, reasons: gap < 0 ? reasons.sort((x, y) => x.amount - y.amount) : reasons };
}

// ── 사람이 읽는 분석 문장 ────────────────────────────────────────────
const man = (v) => {
  const a = Math.abs(v);
  if (a >= 1e8) return `${(v / 1e8).toFixed(2)}억원`;
  if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만원`;
  return `${Math.round(v).toLocaleString()}원`;
};
const signMan = (v) => `${v >= 0 ? "+" : "−"}${man(Math.abs(v))}`;
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const mLabel = (m) => `${Number(String(m).slice(5, 7))}월`;

export function buildInsights(res) {
  const { A, B, effects, dims, monthA, monthB, anomalyCountB } = res;
  const a = mLabel(monthA), b = mLabel(monthB);
  const out = [];
  if (!A.cnt && !B.cnt) return [{ tone: "info", title: "데이터 없음", text: "두 달 모두 해당 오더가 없습니다." }];

  // 1) 핵심 결론
  const saleChg = A.sale ? (B.sale - A.sale) / A.sale : 0;
  const profitChg = A.profit ? (B.profit - A.profit) / Math.abs(A.profit) : 0;
  const rateDiff = (B.rate - A.rate) * 100;
  let head = `${b} 매출은 ${a}보다 ${signMan(B.sale - A.sale)}(${saleChg >= 0 ? "+" : ""}${(saleChg * 100).toFixed(1)}%), 수익은 ${signMan(B.profit - A.profit)}(${profitChg >= 0 ? "+" : ""}${(profitChg * 100).toFixed(1)}%) 변했습니다.`;
  if (saleChg > 0.05 && profitChg < saleChg / 2) {
    head += ` 매출이 늘어난 만큼 수익이 따라오지 못했습니다 — 수익률이 ${pct(A.rate)} → ${pct(B.rate)}로 ${Math.abs(rateDiff).toFixed(1)}%p ${rateDiff < 0 ? "떨어졌기" : "변했기"} 때문입니다.`;
  } else if (Math.abs(rateDiff) >= 0.5) {
    head += ` 수익률은 ${pct(A.rate)} → ${pct(B.rate)} (${rateDiff >= 0 ? "+" : ""}${rateDiff.toFixed(1)}%p).`;
  }
  out.push({ tone: rateDiff < -0.5 ? "bad" : "info", title: "핵심 결론", text: head });

  // 2) 수익 변화 분해
  out.push({
    tone: "info", title: "수익 변화 원인 분해",
    text: `물량(건수 ${A.cnt}→${B.cnt}건) 효과 ${signMan(effects.volume)}, 건당 매출 변화(${man(A.avgSale)}→${man(B.avgSale)}) 효과 ${signMan(effects.price)}, 수익률 변화 효과 ${signMan(effects.margin)}. 합계 ${signMan(effects.total)}.`
      + (effects.margin < 0 && effects.volume + effects.price > 0 ? ` 즉 일은 늘었지만(${signMan(effects.volume + effects.price)}) 마진이 얇아져 ${man(Math.abs(effects.margin))}을 잃었습니다.` : ""),
  });

  // 3) 마진을 깎은 거래처
  const worst = (dims.client || []).filter((g) => g.marginImpact < 0 && g.b.sale > 0).slice(0, 4);
  if (worst.length) {
    out.push({
      tone: "bad", title: `수익률을 끌어내린 거래처 (${a} 평균 ${pct(A.rate)} 기준)`,
      list: worst.map((g) => `${g.key}: ${b} 매출 ${man(g.b.sale)} · 수익률 ${pct(g.b.rate)}${g.a.cnt ? ` (${a} ${pct(g.a.rate)})` : " · 신규"} → ${signMan(g.marginImpact)}`),
    });
  }
  // 4) 매출↑ 수익↓ 거래처
  const upDown = (dims.client || []).filter((g) => g.dSale > 0 && g.dProfit < 0).sort((x, y) => x.dProfit - y.dProfit).slice(0, 4);
  if (upDown.length) {
    out.push({ tone: "warn", title: "매출은 늘었는데 수익은 줄어든 거래처", list: upDown.map((g) => `${g.key}: 매출 ${signMan(g.dSale)}, 수익 ${signMan(g.dProfit)} (수익률 ${pct(g.a.rate)} → ${pct(g.b.rate)})`) });
  }
  // 5) 신규 거래처 중 저마진
  const newLow = (dims.client || []).filter((g) => g.isNew && g.b.sale > 0 && g.b.rate < A.rate).sort((x, y) => y.b.sale - x.b.sale).slice(0, 3);
  if (newLow.length) {
    out.push({ tone: "warn", title: `${b}에 새로 생긴 거래처 중 평균보다 마진이 낮은 곳`, list: newLow.map((g) => `${g.key}: 매출 ${man(g.b.sale)} · 수익률 ${pct(g.b.rate)} (${g.b.cnt}건)`) });
  }
  // 6) 배차방식/차량종류/배차담당 중 가장 큰 마진 손실 (같은 오더 묶음이면 한 번만)
  const seenImpact = new Set();
  for (const [k, label] of [["method", "배차방식"], ["vehicle", "차량종류"], ["staff", "배차담당"]]) {
    const g = (dims[k] || [])[0];
    const sig = g ? `${Math.round(g.marginImpact)}|${g.b.cnt}` : "";
    if (g && !seenImpact.has(sig) && g.marginImpact < -Math.max(100000, Math.abs(effects.margin) * 0.15) && g.b.sale > 0) {
      seenImpact.add(sig);
      const share = B.sale ? g.b.sale / B.sale : 0;
      const shareA = A.sale ? g.a.sale / A.sale : 0;
      out.push({ tone: "warn", title: `${label}: "${g.key}"`, text: `${b} 매출의 ${pct(share)}(${a} ${pct(shareA)})를 차지하고 수익률이 ${pct(g.b.rate)}로 낮아 ${signMan(g.marginImpact)} 영향을 줬습니다.` });
    }
  }
  // 7) 데이터 점검
  const ac = anomalyCountB || {};
  const parts = Object.entries(ac).map(([t, c]) => `${t} ${c}건`);
  if (parts.length) {
    out.push({ tone: ac["기사운임 미입력"] || ac["역마진"] ? "bad" : "warn", title: `${b} 확인이 필요한 오더`, text: `${parts.join(" · ")}. 아래 "확인 필요 오더" 목록에서 운임 입력이 맞는지 확인하세요.` + (ac["기사운임 미입력"] ? " 기사운임이 비어 있으면 수익이 실제보다 크게 잡힙니다." : "") });
  }
  return out;
}

// ===================== 원인 분석 리포트 (표 + 설명) =====================
// ⭐ 사용자 요청 — "핵심 숫자 / 원인 1·2·3 / 원인이 아닌 것"을 표와 짧은 설명으로,
// 어떤 두 달을 골라도 데이터에서 자동으로 만든다.
const manU = (v) => {
  const a = Math.abs(v);
  if (a >= 1e8) {
    const eok = Math.floor(a / 1e8), man = Math.round((a - eok * 1e8) / 1e4);
    return `${v < 0 ? "−" : ""}${eok}억${man ? ` ${man.toLocaleString()}만` : ""}원`;
  }
  if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만원`;
  return `${Math.round(v).toLocaleString()}원`;
};
const sManU = (v) => (v >= 0 ? "+" : "−") + manU(Math.abs(v));
const pctU = (v) => `${(v * 100).toFixed(1)}%`;
const pp = (a, b) => `${((b - a) * 100 >= 0 ? "+" : "")}${((b - a) * 100).toFixed(1)}%p`;
const rateOf = (s, d) => (s > 0 ? (s - d) / s : 0);

export function buildReport(res) {
  const { A, B, monthA, monthB, detailA, detailB, dims, listA, listB } = res;
  const a = mLabel(monthA), b = mLabel(monthB);
  const causes = [];
  const notCauses = [];
  const saleD = B.sale - A.sale, profitD = B.profit - A.profit;
  const retain = saleD > 0 ? profitD / saleD : null;
  // ⭐ "주요 원인" 표시 기준 — 기대 수익(A월 수익률 기준) 대비 부족분의 25% 이상이거나 100만원 이상 줄어든 것
  const gapAbs = Math.abs(B.profit - B.sale * A.rate);
  const majorCut = Math.max(1000000, gapAbs * 0.25);
  const isMajor = (profitDrop) => profitDrop <= -Math.min(majorCut, Math.max(500000, gapAbs * 0.25));

  // ── 핵심 숫자
  const core = [
    { label: "매출", a: manU(A.sale), b: manU(B.sale), d: `${sManU(saleD)}${A.sale ? ` (${saleD >= 0 ? "+" : ""}${((saleD / A.sale) * 100).toFixed(1)}%)` : ""}`, tone: saleD >= 0 ? "good" : "bad" },
    { label: "수익", a: manU(A.profit), b: manU(B.profit), d: `${sManU(profitD)}${A.profit ? ` (${profitD >= 0 ? "+" : ""}${((profitD / Math.abs(A.profit)) * 100).toFixed(1)}%)` : ""}`, tone: profitD >= 0 ? "good" : "bad" },
    { label: "수익률", a: pctU(A.rate), b: pctU(B.rate), d: pp(A.rate, B.rate), tone: B.rate >= A.rate ? "good" : "bad" },
    { label: "건수", a: `${A.cnt.toLocaleString()}건`, b: `${B.cnt.toLocaleString()}건`, d: `${B.cnt - A.cnt >= 0 ? "+" : ""}${(B.cnt - A.cnt).toLocaleString()}건`, tone: B.cnt >= A.cnt ? "good" : "bad" },
    { label: "건당 평균 수익", a: `${Math.round(A.avgProfit).toLocaleString()}원`, b: `${Math.round(B.avgProfit).toLocaleString()}원`, d: `${B.avgProfit - A.avgProfit >= 0 ? "+" : "−"}${Math.abs(Math.round(B.avgProfit - A.avgProfit)).toLocaleString()}원`, tone: B.avgProfit >= A.avgProfit ? "good" : "bad" },
  ];

  // ── 원인 후보 1: 마진 구조(수익률 구간)
  const bandRows = MARGIN_BANDS.map((bd) => {
    const x = detailA.bands[bd.key], y = detailB.bands[bd.key];
    const good = bd.key === "15" || bd.key === "10";
    return {
      label: bd.label,
      a: [`${x.cnt}건 · ${manU(x.sale)}`, `수익 ${manU(x.sale - x.driver)}`],
      b: [`${y.cnt}건 · ${manU(y.sale)}`, `수익 ${manU(y.sale - y.driver)}`],
      d: [`매출 ${sManU(y.sale - x.sale)}`, `수익 ${sManU((y.sale - y.driver) - (x.sale - x.driver))}`],
      tone: (y.sale - x.sale) === 0 ? "neutral" : ((y.sale > x.sale) === good ? "good" : "bad"),
      major: good && isMajor((y.sale - y.driver) - (x.sale - x.driver)),
      majorText: good ? `수익 ${sManU((y.sale - y.driver) - (x.sale - x.driver))}` : "",
    };
  });
  const lowSale = (dt) => ["5", "0", "neg"].reduce((s, k) => s + dt.bands[k].sale, 0);
  const lowShareA = A.sale ? lowSale(detailA) / A.sale : 0, lowShareB = B.sale ? lowSale(detailB) / B.sale : 0;
  const top = (dt) => dt.bands["15"];
  const topProfitD = (top(detailB).sale - top(detailB).driver) - (top(detailA).sale - top(detailA).driver);
  const zeroA = listA.filter((r) => toWon(r.청구운임) > 0 && toWon(r.청구운임) === toWon(r.기사운임));
  const zeroB = listB.filter((r) => toWon(r.청구운임) > 0 && toWon(r.청구운임) === toWon(r.기사운임));
  const zeroTop = Object.entries(zeroB.reduce((m, r) => { const k = String(r.거래처명 || "").trim() || "(미입력)"; m[k] = (m[k] || 0) + 1; return m; }, {})).sort((x, y) => y[1] - x[1]).slice(0, 4);
  const marginBullets = [
    `수익률 10% 미만 오더가 전체 매출에서 차지하는 비중: ${pctU(lowShareA)} → ${pctU(lowShareB)}`,
    `수익률 15% 이상 오더: ${top(detailA).cnt}건 → ${top(detailB).cnt}건, 수익 ${sManU(topProfitD)}`,
    `수익이 정확히 0원인 오더: ${zeroA.length}건(${manU(zeroA.reduce((s, r) => s + toWon(r.청구운임), 0))}) → ${zeroB.length}건(${manU(zeroB.reduce((s, r) => s + toWon(r.청구운임), 0))})${zeroTop.length ? ` · ${b} 많은 곳: ${zeroTop.map(([k, c]) => `${k} ${c}건`).join(", ")}` : ""}`,
  ];
  const marginScore = Math.max(0, (lowShareB - lowShareA) * B.sale * A.rate) + Math.max(0, -topProfitD);
  const marginSection = {
    key: "margin", title: lowShareB > lowShareA + 0.02 ? "마진 낮은 오더가 늘었습니다" : topProfitD < 0 ? "마진 좋은 오더가 줄었습니다" : "수익률 구간별 변화",
    head: ["수익률 구간", a, b, "증감"], rows: bandRows, bullets: marginBullets, score: marginScore,
  };
  if (lowShareB > lowShareA + 0.02 || topProfitD < -Math.max(300000, Math.abs(profitD) * 0.3)) causes.push(marginSection);
  else notCauses.push(`수익률 구간 구성은 비슷합니다(10% 미만 매출 비중 ${pctU(lowShareA)} → ${pctU(lowShareB)}).`);

  // ── 원인 후보 2: 배차방식별 마진
  const methodRows = (dims.method || []).filter((g) => g.a.sale + g.b.sale > 0).sort((x, y) => (y.b.sale + y.a.sale) - (x.b.sale + x.a.sale)).map((g) => ({
    label: g.key,
    a: [`${g.a.cnt}건 · ${manU(g.a.sale)}`, `수익률 ${pctU(g.a.rate)}`],
    b: [`${g.b.cnt}건 · ${manU(g.b.sale)}`, `수익률 ${pctU(g.b.rate)}`],
    d: [`매출 ${sManU(g.dSale)}`, `수익 ${sManU(g.dProfit)}`],
    tone: g.b.rate < g.a.rate - 0.01 ? "bad" : g.b.rate > g.a.rate + 0.01 ? "good" : "neutral",
    g,
  }));
  // 마진 하락으로 덜 번 금액이 큰 배차방식은 주요 원인 표시
  methodRows.forEach((r) => { const loss = r.g.b.sale * (r.g.b.rate - r.g.a.rate); if (r.g.a.sale > 0 && isMajor(loss)) { r.major = true; r.majorText = `마진 하락 ${sManU(loss)}`; } });
  const worstMethod = methodRows.map((r) => r.g).filter((g) => g.a.sale > 0 && g.b.sale > 0 && g.b.rate < g.a.rate - 0.01).sort((x, y) => (x.b.sale * (x.b.rate - x.a.rate)) - (y.b.sale * (y.b.rate - y.a.rate)))[0];
  if (worstMethod && worstMethod.b.sale * (worstMethod.a.rate - worstMethod.b.rate) > Math.max(300000, Math.abs(B.sale * (A.rate - B.rate)) * 0.2)) {
    const low = (list) => list.filter((r) => COMPARE_DIMS[1].get(r) === worstMethod.key && rateOf(toWon(r.청구운임), toWon(r.기사운임)) < 0.10).length;
    causes.push({
      key: "method", title: `"${worstMethod.key}" 오더의 마진이 떨어졌습니다`, head: ["배차방식", a, b, "증감"], rows: methodRows,
      bullets: [
        `${worstMethod.key} 수익률 ${pctU(worstMethod.a.rate)} → ${pctU(worstMethod.b.rate)}: 매출 ${sManU(worstMethod.dSale)}인데 수익은 ${sManU(worstMethod.dProfit)}`,
        `${worstMethod.key}에서 수익률 10% 미만 오더: ${low(listA)}건 → ${low(listB)}건`,
      ],
      score: worstMethod.b.sale * (worstMethod.a.rate - worstMethod.b.rate),
    });
  }

  // ── 원인 후보 3: 거래처 변화
  const cl = (dims.client || []).filter((g) => g.a.sale + g.b.sale > 0);
  const lost = cl.filter((g) => g.dProfit < 0).sort((x, y) => x.dProfit - y.dProfit).slice(0, 3);
  const growLow = cl.filter((g) => g.dSale > 0 && g.b.sale > 0 && g.b.rate < A.rate - 0.02).sort((x, y) => y.dSale - x.dSale).slice(0, 4);
  const halved = cl.filter((g) => g.a.sale > 0 && g.b.sale >= 1000000 && g.a.rate - g.b.rate >= 0.05 && !lost.includes(g)).sort((x, y) => x.dProfit - y.dProfit).slice(0, 3);
  const cRow = (g, note) => ({
    label: g.key,
    a: [g.a.cnt ? `${g.a.cnt}건 · ${manU(g.a.sale)}` : "-", g.a.cnt ? `수익률 ${pctU(g.a.rate)}` : ""],
    b: [g.b.cnt ? `${g.b.cnt}건 · ${manU(g.b.sale)}` : "-", g.b.cnt ? `수익률 ${pctU(g.b.rate)}` : ""],
    d: [`수익 ${sManU(g.dProfit)}`, `매출 ${sManU(g.dSale)} · ${note}`],
    tone: g.dProfit < 0 ? "bad" : "warn",
    major: isMajor(g.dProfit),
    majorText: g.dSale < 0 ? `매출 ${sManU(g.dSale)} · 수익 ${sManU(g.dProfit)}` : `수익 ${sManU(g.dProfit)}`,
  });
  const clientRows = [
    ...lost.map((g) => cRow(g, g.dSale < 0 ? "오더 감소" : "마진 하락")),
    ...growLow.filter((g) => !lost.includes(g)).map((g) => cRow(g, `늘었지만 저마진`)),
    ...halved.filter((g) => !growLow.includes(g)).map((g) => cRow(g, `수익률 ${pp(g.a.rate, g.b.rate)}`)),
  ];
  if (clientRows.length) {
    const bl = [];
    if (lost[0]) bl.push(`수익이 가장 많이 줄어든 곳: ${lost[0].key} (${lost[0].a.cnt}건 → ${lost[0].b.cnt}건, 수익 ${sManU(lost[0].dProfit)})`);
    if (growLow.length) bl.push(`${b}에 크게 늘었지만 마진이 낮은 곳: ${growLow.map((g) => `${g.key}(${pctU(g.b.rate)})`).join(", ")}`);
    if (halved.length) bl.push(`마진이 크게 떨어진 곳: ${halved.map((g) => `${g.key} ${pctU(g.a.rate)}→${pctU(g.b.rate)}`).join(", ")}`);
    causes.push({ key: "client", title: "거래처 변화", head: ["거래처", a, b, "영향"], rows: clientRows, bullets: bl, score: -lost.reduce((s, g) => s + g.dProfit, 0) });
  }

  // ── 원인 후보 4: 차량종류
  const veh = (dims.vehicle || []).filter((g) => g.a.sale > 0 && g.b.sale > 0 && g.dSale > 0 && g.b.rate < g.a.rate - 0.02).sort((x, y) => (x.b.sale * (x.b.rate - x.a.rate)) - (y.b.sale * (y.b.rate - y.a.rate)))[0];
  if (veh && veh.dSale > Math.abs(saleD) * 0.1) {
    causes.push({ key: "vehicle", title: `차량종류 "${veh.key}" 마진 하락`, rows: null, bullets: [`${veh.key}: 매출 ${sManU(veh.dSale)}인데 수익 ${sManU(veh.dProfit)} (수익률 ${pctU(veh.a.rate)} → ${pctU(veh.b.rate)})`], score: veh.b.sale * (veh.a.rate - veh.b.rate) });
  }

  // ── 이상 오더: 차이가 작으면 "원인 아님"
  for (const t of res.anomalySummary.filter((x) => x.type === "역마진" || x.type === "청구운임 미입력")) {
    const diff = t.b.amount - t.a.amount;
    if (Math.abs(diff) < Math.max(300000, Math.abs(profitD) * 0.2)) notCauses.push(`${t.type}: ${manU(t.a.amount)}(${t.a.cnt}건) → ${manU(t.b.amount)}(${t.b.cnt}건), 두 달이 비슷합니다.`);
    else causes.push({ key: `an-${t.type}`, title: `${t.type} 오더가 ${diff > 0 ? "늘었습니다" : "줄었습니다"}`, rows: null, bullets: [`${t.type}: ${manU(t.a.amount)}(${t.a.cnt}건) → ${manU(t.b.amount)}(${t.b.cnt}건) · ${t.desc}`], score: Math.abs(diff) });
  }

  // ── 결론 문장
  let headline;
  if (saleD > 0 && retain != null && retain < A.rate * 0.6) {
    headline = `매출이 ${manU(saleD)} 늘었는데 수익은 ${sManU(profitD)}입니다. 늘어난 매출에서 남은 비율이 ${pctU(Math.max(retain, -9.99))}뿐입니다(${a} 평균 수익률 ${pctU(A.rate)}).`;
  } else {
    headline = `매출 ${sManU(saleD)}, 수익 ${sManU(profitD)} · 수익률 ${pctU(A.rate)} → ${pctU(B.rate)}`;
  }
  const sorted = causes.sort((x, y) => (x.key === "margin" ? -1 : y.key === "margin" ? 1 : y.score - x.score));
  const biggest = lost[0] && isMajor(lost[0].dProfit) ? lost[0] : null;
  const summary = (sorted.length ? `${b}에는 ${sorted.map((c) => c.title).slice(0, 2).join(" / ")}` : "두 달 사이에 눈에 띄는 원인이 없습니다.")
    + (biggest ? ` · 가장 크게 줄어든 거래처: ${biggest.key} (매출 ${sManU(biggest.dSale)}, 수익 ${sManU(biggest.dProfit)})` : "");
  // 주요 원인 거래처는 설명 첫 줄에 강조
  const clientCause = sorted.find((c) => c.key === "client");
  if (clientCause && biggest && gapAbs > 0) {
    clientCause.bullets.unshift(`가장 큰 원인: ${biggest.key} — ${biggest.a.cnt}건 → ${biggest.b.cnt}건, 매출 ${sManU(biggest.dSale)}, 수익 ${sManU(biggest.dProfit)} (덜 번 금액 ${manU(gapAbs)}의 약 ${Math.round((Math.abs(biggest.dProfit) / gapAbs) * 100)}%)`);
    clientCause.bullets = clientCause.bullets.filter((t, i) => !(i > 0 && t.startsWith("수익이 가장 많이 줄어든 곳")));
  }
  return { a, b, headline, summary, core, causes: sorted, notCauses };
}
