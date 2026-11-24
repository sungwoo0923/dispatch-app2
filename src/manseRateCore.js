// ======================= src/manseRateCore.js =======================
// 🌾 2026-11-24 만세보령(JY로지스틱스) 운송료 — 지역 × 수량(20kg 포) 구간 단가표 + 비고 추가요금
//  출처: 사용자가 올린 "2024.9.6 만세보령 단가" 엑셀(2024.7.26 이후 단가 탭)
//   · 왼쪽 묶음(E) = 적용일 24년 9월 6일 · 오른쪽 묶음(Q, "유류비 인상") = 왼쪽 + 30,000 — 어느 쪽인지는 시트 기록으로 고른다(learnManse)
//   · 비고 = 보이는 I칸만 쓴다(숨긴 G칸 "서울대 +70,000"은 예전 자료 — 사용자 확인 2026-11-24)
//  지역 · 기사운임은 구글시트에서 들어온 지난 만세보령 오더로 배운다(사용자 요청) — 기록이 없는 하차지만 주소로 지역을 정한다
//  수량(포) = 화물내용의 "○포 · ○개" → 없으면 차량톤수(시트 소계 중량 kg ÷ 1,000) × 50
//  ⚠ 다른 파일을 가져오지 않는다(node 테스트에서 그대로 읽음)

export const MANSE_CLIENT = "만세보령";
export const REGIONS = ["수도권", "대전권", "경남권"];
export const VERSIONS = { base: "2024.9.6 단가", fuel: "유류비 인상 단가" };
// [최대 포 수, 차량, 2024.9.6 금액] — 유류비 인상 = +30,000
const T = {
  수도권: [[100, "1톤", 160000], [200, "3.5톤", 230000], [475, "5톤", 270000], [505, "5톤축", 290000], [605, "5톤축", 320000], [635, "5톤축", 350000], [700, "5톤축", 370000], [799, "25톤", 400000], [950, "25톤", 450000], [1200, "25톤", 480000], [1250, "25톤", 500000]],
  대전권: [[100, "1톤", 140000], [200, "3.5톤", 200000], [475, "5톤", 240000], [505, "5톤축", 260000], [605, "5톤축", 300000], [635, "5톤축", 320000], [700, "5톤축", 340000], [799, "5톤축", 370000]],
  경남권: [[450, "5톤", 420000], [500, "5톤", 440000], [600, "5톤", 490000], [700, "5톤축", 510000], [1000, "25톤", 590000]],
};
const FUEL = 30000;
// 비고(I칸) — 지역 금액에 더하는 하차지별 추가요금
export const NAMED = [
  { k: "진주", 금액: 100000, region: "수도권" }, { k: "칠곡", 금액: 100000, region: "수도권" },
  { k: "서울대", 금액: 90000, region: "수도권" }, { k: "인천공항", 금액: 90000, region: "수도권" },
  { k: "포천", 금액: 140000, region: "수도권" }, { k: "춘천", 금액: 140000, region: "수도권" }, { k: "양주", 금액: 140000, region: "수도권" },
  { k: "경산", 금액: 100000, 금액25: 120000, region: "경남권" },
];
// 하차지 추가(경유) — 한 곳마다
export const STOP_FEE = { 수도권: { near: 70000, far: 90000, near25: 90000, far25: 120000 }, 대전권: { near: 60000, far: 60000, near25: 60000, far25: 60000 }, 경남권: { near: 50000, far: 50000, near25: 70000, far25: 70000 } };
// 반품쌀 회수 — 50포 미만 없음 · 50~99포 50,000(기사 5만) · 100포 이상 100,000(기사 10만)
export const returnFee = (n) => { const q = Number(n) || 0; return q >= 100 ? 100000 : q >= 50 ? 50000 : 0; };

const cell = (v) => String(v ?? "").trim();
const nk = (v) => cell(v).toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? Math.round(n) : 0; };
export const isManse = (o) => nk(o?.거래처명).includes("만세보령") || (!nk(o?.거래처명) && nk(o?.상차지명).includes("만세보령"));

// 수량(포)
export function bagsOf(o) {
  const m = /(\d[\d,]*)\s*(포|개)/.exec(cell(o?.화물내용));
  if (m) return num(m[1]);
  if (Number(o?.수량) > 0) return Math.round(Number(o.수량));
  const t = /(\d+(?:\.\d+)?)\s*톤/.exec(cell(o?.차량톤수)) || /^(\d+(?:\.\d+)?)$/.exec(cell(o?.차량톤수));
  return t ? Math.round(Number(t[1]) * 50) : 0;
}
// 구간
export function tierOf(region, bags, version = "fuel") {
  const rows = T[region]; if (!rows || !(bags > 0)) return null;
  const row = rows.find((r) => bags <= r[0]); if (!row) return null;
  const i = rows.indexOf(row); const lo = i ? rows[i - 1][0] + 1 : 1;
  return { region, max: row[0], min: lo, ton: row[1], sale: row[2] + (version === "fuel" ? FUEL : 0), version, label: `${region} · ${lo === 1 ? `${row[0]}포 이하` : `${lo}~${row[0]}포`}` };
}
const named = (o) => { const s = `${cell(o?.하차지명)} ${cell(o?.하차지주소)}`; return NAMED.find((x) => s.includes(x.k)) || null; };
// 주소로 지역(기록이 없을 때)
export function regionByAddress(o) {
  const nm = named(o); if (nm) return nm.region;
  if (/오뚜기/.test(cell(o?.하차지명))) return "수도권"; // 수도권(오뚜기 포함)
  const a = cell(o?.하차지주소);
  if (/^(서울|경기|인천)/.test(a)) return "수도권";
  if (/^(대전|세종|충남|충청남|충북|충청북)/.test(a)) return "대전권";
  if (/^(부산|울산|경남|경상남)/.test(a)) return "경남권";
  return "";
}
const stopsOf = (o) => ["경유하차목록", "경유지_하차"].map((k) => (Array.isArray(o?.[k]) ? o[k].filter(Boolean).length : 0)).reduce((a, b) => Math.max(a, b), 0);
const CANCEL = /취소/;
const baseSale = (o) => num(o.청구운임) - num(o.특수청구추가) - num(o.지게차청구추가);
const baseBuy = (o) => num(o.기사운임) + num(o.특수기사차감) + num(o.지게차기사차감);
const modeOf = (a) => { const m = new Map(); a.forEach((v) => m.set(v, (m.get(v) || 0) + 1)); const top = [...m.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]; return top ? { v: top[0], n: top[1] } : null; };
// 기록 금액 − 표 금액으로 받아 주는 값 — 0, 그리고 비고에 적힌 하차지(서울대 · 칠곡 …)만 그 추가요금
const allowedDiffs = (o) => { const nm = named(o); return new Set([0, ...(nm ? [nm.금액, nm.금액25 || nm.금액] : [])]); };

// ── 시트 기록으로 배우기 ───────────────────────────────────
//  하차지마다: 지역 3곳 × 단가표 2벌 중 "기록 금액 − 표 금액"이 가장 자주 같은 값(0 또는 비고 추가요금)인 조합 = 그 하차지의 지역 · 추가요금
//  전체 단가표 = 맞은 기록이 더 많은 쪽 · 기사운임 = 같은 하차지 · 같은 구간 기록의 최빈값 → 없으면 지역의 (청구 − 기사) 최빈값
export function learnManse(orders = []) {
  const rows = (orders || []).filter((o) => o && isManse(o) && !CANCEL.test(cell(o.배차상태)) && !CANCEL.test(cell(o.상태)) && num(o.청구운임) > 0 && bagsOf(o) > 0 && nk(o.하차지명));
  const byDrop = new Map();
  rows.forEach((o) => { const k = nk(o.하차지명); if (!byDrop.has(k)) byDrop.set(k, []); byDrop.get(k).push(o); });
  const vote = { base: 0, fuel: 0 };
  const places = {};
  for (const [k, list] of byDrop) {
    let best = null; const SURCH = allowedDiffs(list[0]);
    for (const version of ["fuel", "base"]) for (const region of REGIONS) {
      const diffs = list.filter((o) => !stopsOf(o)).map((o) => { const t = tierOf(region, bagsOf(o), version); return t ? baseSale(o) - t.sale : null; }).filter((d) => d != null && SURCH.has(d));
      const m = modeOf(diffs); if (!m) continue;
      const sc = m.n * 10 + (m.v === 0 ? 2 : 0) + (region === regionByAddress(list[0]) ? 1 : 0) + (version === "fuel" ? 0.5 : 0);
      if (!best || sc > best.sc) best = { sc, region, version, surcharge: m.v, matched: m.n };
    }
    const noStop = list.filter((o) => !stopsOf(o)).length;
    places[k] = best ? { 하차지명: cell(list[0].하차지명), region: best.region, version: best.version, surcharge: best.surcharge, matched: best.matched, count: list.length, checked: noStop, src: "기록" }
      : { 하차지명: cell(list[0].하차지명), region: regionByAddress(list[0]), version: "", surcharge: 0, matched: 0, count: list.length, checked: noStop, src: "주소", mismatch: noStop > 0 };
    if (best) vote[best.version] += best.matched;
  }
  // 기사운임
  const buyKey = (o, region) => { const t = tierOf(region, bagsOf(o)); return `${nk(o.하차지명)}|${t ? t.max : 0}|${stopsOf(o)}`; };
  const buys = new Map(); const margins = new Map();
  rows.forEach((o) => {
    const p = places[nk(o.하차지명)]; const region = p?.region || "";
    const b = baseBuy(o); if (!(b > 0)) return;
    const k = buyKey(o, region); if (!buys.has(k)) buys.set(k, []); buys.get(k).push(b);
    if (!margins.has(region)) margins.set(region, []); margins.get(region).push(baseSale(o) - b);
  });
  const allMargin = modeOf([...margins.values()].flat());
  return {
    count: rows.length, version: vote.base > vote.fuel ? "base" : "fuel", vote, places,
    buyOf: (o, region) => modeOf(buys.get(buyKey(o, region)) || [])?.v || 0,
    marginOf: (region) => modeOf(margins.get(region) || [])?.v ?? allMargin?.v ?? null,
  };
}

// ── 운임 산출 ─────────────────────────────────────────────
//  o = { 하차지명, 하차지주소, 화물내용 | 차량톤수 | 수량, 경유하차목록 | 경유(곳 수), 경유원거리(50km 이상), 반품(포) }
//  → null | { region, regionSrc, tier, version, bags, lines: [{ key, name, tag, why, sale, pay }], sale, buy, buySrc }
const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
export function quoteManse(o = {}, learned = null) {
  const bags = bagsOf(o); if (!(bags > 0)) return null;
  const p = learned?.places?.[nk(o.하차지명)] || null;
  const region = (p?.region) || regionByAddress(o);
  if (!region) return null;
  const version = p?.version || learned?.version || "fuel";
  const tier = tierOf(region, bags, version); if (!tier) return null;
  const big = tier.ton === "25톤";
  const nm = named(o);
  const surcharge = p?.src === "기록" ? p.surcharge : nm && nm.region === region ? (big && nm.금액25 ? nm.금액25 : nm.금액) : 0;
  const stops = Number(o.경유) >= 0 && o.경유 !== undefined && o.경유 !== "" ? Number(o.경유) : stopsOf(o);
  const sf = STOP_FEE[region]; const per = o.경유원거리 ? (big ? sf.far25 : sf.far) : (big ? sf.near25 : sf.near);
  const ret = returnFee(o.반품);
  const lines = [{ key: "base", name: "기본 운임", tag: "만세보령 단가표", why: `${tier.label} · ${VERSIONS[version]}${p?.src === "기록" ? ` · 시트 기록 ${p.matched}/${p.checked}건 일치` : " · 주소로 지역 판별"}`, sale: tier.sale, pay: 0 }];
  if (surcharge) lines.push({ key: "named", name: `${nm?.k || p?.하차지명 || "하차지"} 추가`, tag: "비고", why: `하차지별 추가요금${p?.src === "기록" ? " · 시트 기록으로 확인" : ""}`, sale: surcharge, pay: 0 });
  if (stops > 0) lines.push({ key: "stop", name: "하차지 추가", tag: "비고", why: `${stops}곳 × ${won(per)}${region === "수도권" ? (o.경유원거리 ? " · 50km 이상" : " · 50km 미만") : " · 개소당"}`, sale: per * stops, pay: 0 });
  if (ret) lines.push({ key: "ret", name: "반품쌀 회수", tag: "비고", why: `${o.반품}포 · 기사 동일 지급`, sale: ret, pay: ret });
  const sale = lines.reduce((s, l) => s + l.sale, 0);
  // 기사운임 — 같은 하차지 · 구간 · 경유 수 기록의 최빈값 → 없으면 지역 (청구 − 기사) 최빈값
  let buy = learned ? learned.buyOf({ ...o, 경유하차목록: Array.from({ length: stops }, () => ({})) }, region) : 0; let buySrc = buy ? "기록" : "";
  if (!buy && learned) { const m = learned.marginOf(region); if (m != null) { buy = sale - ret - m; buySrc = "마진"; } }
  if (buy) buy += ret;
  lines[0].pay = Math.max(0, buy - ret);
  return { region, regionSrc: p?.src || "주소", tier, version, bags, stops, lines, sale, buy, buySrc };
}
