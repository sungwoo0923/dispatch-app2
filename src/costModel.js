// ======================= src/costModel.js =======================
// 💰 2026-11-04 플랫폼 비용 · 손익 모델(최고관리자 전용 — 고객사 화면에서는 절대 쓰지 않는다)
//  · 단가·무료 제공량·환율·고정비는 모두 관리센터 › 청구 › 비용·손익 › [비용 기준 설정]에서 고치고
//    Firestore platformConfig/costModel 한 문서에 저장한다(최고관리자만 읽기/쓰기 — firestore.rules).
//  · 아래 기본값은 2026-11-04 기준 "공개 가격 추정치"다. ⚠ 실제 청구서(구글 클라우드 결제, 각 업체 계약)와 꼭 맞춰 볼 것.
//  · 계산은 모두 이 파일의 순수 함수 — 화면(CostPanel)·시뮬레이터·손익분기 차트가 같은 계산을 쓴다.

export const CLAUDE_TIERS = [
  { id: "none", label: "사용 안 함", usd: 0 },
  { id: "pro", label: "Pro ($20/월)", usd: 20 },
  { id: "max5", label: "Max 5x ($100/월)", usd: 100 },
  { id: "max20", label: "Max 20x ($200/월)", usd: 200 },
];
export const VERCEL_PLANS = [
  { id: "hobby", label: "Hobby (무료 · 상업 사용 불가)", usd: 0 },
  { id: "pro", label: "Pro ($20/월 · 멤버 1명당)", usd: 20 },
];

export const COST_DEFAULT = {
  asOf: "2026-11-04",
  source: "Firebase/Google Cloud 공개 요금표(Blaze), Vercel·Apple·Google Play·Anthropic 공개 가격, 국내 문자·전자세금계산서 ASP 공시 단가(추정) — 실제 청구서로 꼭 확인",
  fx: 1400,            // 원/달러
  usdTaxPct: 10,       // 해외 결제 부가세·카드 해외 수수료 가산(%) — 구글·애플·Vercel 청구에 붙는 몫
  // Firestore (Blaze) — 무료 제공량은 "하루" 단위
  fs: { read: 0.06, write: 0.18, del: 0.02, gib: 0.18, freeRead: 50000, freeWrite: 20000, freeDel: 20000, freeGib: 1 },
  // Cloud Functions(1세대) — 월 무료 200만 호출 · 40만 GB-초 · 20만 GHz-초
  fn: { perM: 0.4, freeM: 2, gbs: 0.0000025, freeGbs: 400000, ghzs: 0.00001, freeGhzs: 200000, avgSec: 1.5, memGB: 0.5, ghz: 0.8 },
  // Cloud Storage — 새 버킷(*.firebasestorage.app)은 US 리전일 때만 무료 5GB · 다른 리전은 처음부터 과금
  gcs: { gb: 0.026, freeGb: 5, egress: 0.12, freeEgressGb: 30 },
  vercel: { plan: "pro", seats: 1 },
  hostingKrw: 0,        // Firebase Hosting(안 쓰면 0 — 이 프로그램은 Vercel로 배포)
  domainKrwYear: 25000, // 도메인 1년(.com/.co.kr 등)
  play: { on: true, usd: 25, months: 24 },   // Google Play 개발자 등록 1회 $25 → N개월로 나눠 반영
  apple: { on: true, usdYear: 99 },          // Apple 개발자 연 $99 (iOS 앱을 올릴 때)
  claude: "pro",
  etax: { krw: 200, platformIssue: true },   // 전자세금계산서 ASP 1건 원가 · 고객사 월 청구서 발행분 포함 여부
  msg: { alimtalk: 13, sms: 20, lms: 50 },   // 문자·알림톡 1건 원가(아직 연동 전이면 사용량 0)
  tmap: { krw: 0, freeDay: 1000, perOrder: 1 }, // Tmap(SK open API) 지오코딩·경로 — 무료 한도 안이면 0원, 상용 계약 시 단가 입력
  vision: { per1k: 1.5, free: 1000 },        // 구글 글자 인식(배차일지 사진 OCR) 1,000건당 $
  emailKrw: 0,          // 메일 발송(Daum SMTP — 무료 · 하루 발송 한도 있음)
  custom: [{ label: "세무 기장료", krw: 0 }, { label: "운영자 인건비(목표)", krw: 0 }],
  // 활동량 → 서버 사용량 환산 계수(실측이 없을 때 · 시뮬레이터) — 실측(Cloud Monitoring)이 쌓이면 [실측으로 계수 맞추기]
  coef: {
    readsPerOrder: 200,     // 오더 1건이 한 달 동안 일으키는 읽기(직원 화면 실시간 반영 + 관리센터 집계)
    writesPerOrder: 8,      // 등록·배차·상태 변경·사진 등
    readsPerStaffDay: 4000, // 직원 1명이 하루 화면을 열 때 읽는 목록(최근 7일 오더·기사·거래처·하차지·설정)
    writesPerStaffDay: 150,
    readsPerFleetDay: 6000, // 지입차 1대(기사앱 GPS 10초 갱신)가 직원 화면에 퍼지는 읽기
    writesPerFleetDay: 3000, // 지입차 1대의 위치·운행 기록 쓰기
    fnPerOrder: 10,         // 오더 1건당 서버 함수 실행(알림·시트 연동·보관)
    mbPerOrder: 0.1,        // 오더 1건이 쌓는 저장 용량(MB, 사진 포함 평균)
    workDays: 26,
  },
};

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
// 저장값 + 기본값(빈 칸은 기본값) — 새로 생긴 항목도 자동으로 채워진다
export function mergeCost(saved) {
  const out = {};
  Object.keys(COST_DEFAULT).forEach((k) => {
    const d = COST_DEFAULT[k]; const v = saved?.[k];
    out[k] = isObj(d) ? { ...d, ...(isObj(v) ? v : {}) } : v === undefined || v === null || v === "" ? d : v;
  });
  if (!Array.isArray(out.custom)) out.custom = COST_DEFAULT.custom;
  return out;
}

export const daysInMonth = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
const usdK = (m, usd) => usd * n(m.fx) * (1 + n(m.usdTaxPct) / 100);

// ─── 고정비(월) ───
export function fixedCosts(m) {
  const vercel = VERCEL_PLANS.find((p) => p.id === m.vercel?.plan) || VERCEL_PLANS[1];
  const claude = CLAUDE_TIERS.find((t) => t.id === m.claude) || CLAUDE_TIERS[1];
  const rows = [
    { key: "vercel", group: "호스팅", label: `Vercel ${vercel.id === "pro" ? `Pro × ${Math.max(1, n(m.vercel?.seats))}명` : "Hobby"}`, unit: `$${vercel.usd}/명·월`, krw: usdK(m, vercel.usd * Math.max(1, n(m.vercel?.seats) || 1)) },
    { key: "hosting", group: "호스팅", label: "Firebase Hosting", unit: "사용 시 입력", krw: n(m.hostingKrw) },
    { key: "domain", group: "호스팅", label: "도메인", unit: `${n(m.domainKrwYear).toLocaleString()}원/년 ÷ 12`, krw: n(m.domainKrwYear) / 12 },
    { key: "play", group: "앱 마켓", label: "Google Play 개발자 등록", unit: `$${n(m.play?.usd)} 1회 ÷ ${Math.max(1, n(m.play?.months))}개월`, krw: m.play?.on ? usdK(m, n(m.play.usd) / Math.max(1, n(m.play.months))) : 0, off: !m.play?.on },
    { key: "apple", group: "앱 마켓", label: "Apple 개발자 프로그램", unit: `$${n(m.apple?.usdYear)}/년 ÷ 12`, krw: m.apple?.on ? usdK(m, n(m.apple.usdYear) / 12) : 0, off: !m.apple?.on },
    { key: "claude", group: "개발 도구", label: `Claude Code · ${claude.label}`, unit: `$${claude.usd}/월`, krw: usdK(m, claude.usd) },
    { key: "email", group: "발송", label: "메일 발송(SMTP)", unit: "월 정액", krw: n(m.emailKrw) },
    ...(m.custom || []).map((c, i) => ({ key: `custom${i}`, group: "기타", label: c.label || `기타 ${i + 1}`, unit: "월", krw: n(c.krw) })),
  ];
  return { rows, total: rows.reduce((a, r) => a + r.krw, 0) };
}

// ─── 변동비 — 하루 단위 사용량 목록(days)으로 정확히 계산(Firestore 무료량은 하루마다) ───
//  days: [{ reads, writes, deletes }] (그날 합계) · extra: { fsGib, gcsGb, egressGb, fnCalls, orders, taxInvoices, alimtalk, sms, lms, visionCalls, billDays }
export function variableCosts(m, days, extra = {}) {
  const fs = m.fs, fn = m.fn, gcs = m.gcs;
  const sum = (k) => days.reduce((a, d) => a + n(d[k]), 0);
  const billable = (k, free) => days.reduce((a, d) => a + Math.max(0, n(d[k]) - free), 0);
  const R = sum("reads"), W = sum("writes"), D = sum("deletes");
  const bR = billable("reads", n(fs.freeRead)), bW = billable("writes", n(fs.freeWrite)), bD = billable("deletes", n(fs.freeDel));
  const fsGib = n(extra.fsGib), gcsGb = n(extra.gcsGb), egressGb = n(extra.egressGb);
  const calls = n(extra.fnCalls);
  const gbs = calls * n(fn.avgSec) * n(fn.memGB), ghzs = calls * n(fn.avgSec) * n(fn.ghz);
  const fnUsd = Math.max(0, calls / 1e6 - n(fn.freeM)) * n(fn.perM) + Math.max(0, gbs - n(fn.freeGbs)) * n(fn.gbs) + Math.max(0, ghzs - n(fn.freeGhzs)) * n(fn.ghzs);
  const nDays = Math.max(1, n(extra.billDays) || days.length || 1);
  const tmapCalls = n(extra.orders) * n(m.tmap?.perOrder);
  const tmapBill = Math.max(0, tmapCalls - n(m.tmap?.freeDay) * nDays);
  const vis = Math.max(0, n(extra.visionCalls) - n(m.vision?.free));
  const rows = [
    { key: "fsRead", group: "Firestore", label: "문서 읽기", unit: `$${fs.read}/10만`, free: `하루 ${n(fs.freeRead).toLocaleString()}건`, usage: R, usageUnit: "건", billable: bR, krw: usdK(m, (bR / 1e5) * n(fs.read)) },
    { key: "fsWrite", group: "Firestore", label: "문서 쓰기", unit: `$${fs.write}/10만`, free: `하루 ${n(fs.freeWrite).toLocaleString()}건`, usage: W, usageUnit: "건", billable: bW, krw: usdK(m, (bW / 1e5) * n(fs.write)) },
    { key: "fsDel", group: "Firestore", label: "문서 삭제", unit: `$${fs.del}/10만`, free: `하루 ${n(fs.freeDel).toLocaleString()}건`, usage: D, usageUnit: "건", billable: bD, krw: usdK(m, (bD / 1e5) * n(fs.del)) },
    { key: "fsGib", group: "Firestore", label: "저장 용량", unit: `$${fs.gib}/GiB·월`, free: `${n(fs.freeGib)}GiB`, usage: fsGib, usageUnit: "GiB", billable: Math.max(0, fsGib - n(fs.freeGib)), krw: usdK(m, Math.max(0, fsGib - n(fs.freeGib)) * n(fs.gib)) },
    { key: "fn", group: "Cloud Functions", label: "함수 실행 · 계산", unit: `$${fn.perM}/100만회`, free: `월 ${n(fn.freeM)}00만회`, usage: calls, usageUnit: "회", billable: Math.max(0, calls - n(fn.freeM) * 1e6), krw: usdK(m, fnUsd) },
    { key: "gcs", group: "Cloud Storage", label: "파일 저장", unit: `$${gcs.gb}/GB·월`, free: `${n(gcs.freeGb)}GB`, usage: gcsGb, usageUnit: "GB", billable: Math.max(0, gcsGb - n(gcs.freeGb)), krw: usdK(m, Math.max(0, gcsGb - n(gcs.freeGb)) * n(gcs.gb)) },
    { key: "egress", group: "Cloud Storage", label: "파일 내려받기(송신)", unit: `$${gcs.egress}/GB`, free: `${n(gcs.freeEgressGb)}GB`, usage: egressGb, usageUnit: "GB", billable: Math.max(0, egressGb - n(gcs.freeEgressGb)), krw: usdK(m, Math.max(0, egressGb - n(gcs.freeEgressGb)) * n(gcs.egress)) },
    { key: "etax", group: "전자세금계산서", label: "ASP 발행", unit: `${n(m.etax?.krw)}원/건`, free: "-", usage: n(extra.taxInvoices), usageUnit: "건", billable: n(extra.taxInvoices), krw: n(extra.taxInvoices) * n(m.etax?.krw) },
    { key: "msg", group: "문자 · 알림톡", label: "알림톡 · SMS · LMS", unit: `${n(m.msg?.alimtalk)} / ${n(m.msg?.sms)} / ${n(m.msg?.lms)}원`, free: "-", usage: n(extra.alimtalk) + n(extra.sms) + n(extra.lms), usageUnit: "건", billable: n(extra.alimtalk) + n(extra.sms) + n(extra.lms), krw: n(extra.alimtalk) * n(m.msg?.alimtalk) + n(extra.sms) * n(m.msg?.sms) + n(extra.lms) * n(m.msg?.lms) },
    { key: "tmap", group: "지도 · 경로", label: "Tmap 지오코딩 · 경로", unit: `${n(m.tmap?.krw)}원/건`, free: `하루 ${n(m.tmap?.freeDay).toLocaleString()}건`, usage: tmapCalls, usageUnit: "건(추정)", billable: tmapBill, krw: tmapBill * n(m.tmap?.krw) },
    { key: "vision", group: "글자 인식", label: "구글 Vision OCR", unit: `$${n(m.vision?.per1k)}/1,000건`, free: `월 ${n(m.vision?.free).toLocaleString()}건`, usage: n(extra.visionCalls), usageUnit: "건", billable: vis, krw: usdK(m, (vis / 1000) * n(m.vision?.per1k)) },
  ];
  return { rows, total: rows.reduce((a, r) => a + r.krw, 0), reads: R, writes: W, deletes: D };
}

// ─── 활동량 → 하루 사용량 추정(실측이 없을 때 · 시뮬레이터 · 회사별 배분 가중치) ───
export function estimateDaily(m, act) {
  const c = m.coef; const wd = n(c.workDays) / 30;
  const ordersDay = n(act.ordersMonth) / 30;
  return {
    reads: ordersDay * n(c.readsPerOrder) + n(act.staff) * n(c.readsPerStaffDay) * wd + n(act.fleet) * n(c.readsPerFleetDay),
    writes: ordersDay * n(c.writesPerOrder) + n(act.staff) * n(c.writesPerStaffDay) * wd + n(act.fleet) * n(c.writesPerFleetDay),
    deletes: ordersDay * 0.3,
  };
}
// 여러 회사 활동량 합 → 한 달 변동비(무료량 반영)
export function estimateMonth(m, acts, { days = 30, storedGib = null } = {}) {
  const tot = acts.reduce((a, x) => { const d = estimateDaily(m, x); a.reads += d.reads; a.writes += d.writes; a.deletes += d.deletes; a.orders += n(x.ordersMonth); a.storageGB += n(x.storageGB); a.tax += n(x.taxInvoices); return a; }, { reads: 0, writes: 0, deletes: 0, orders: 0, storageGB: 0, tax: 0 });
  const dayRow = { reads: tot.reads, writes: tot.writes, deletes: tot.deletes };
  return variableCosts(m, Array.from({ length: days }, () => dayRow), {
    fsGib: storedGib != null ? storedGib : tot.storageGB, fnCalls: tot.orders * n(m.coef.fnPerOrder), orders: tot.orders,
    taxInvoices: tot.tax + (m.etax?.platformIssue ? acts.length : 0), billDays: days,
  });
}

// ─── 손익분기 곡선 — 회사 수 0..maxN, 회사 1곳 평균 활동량·평균 매출 ───
export function breakEvenCurve(m, { avgRevenue, avgAct, maxN = 100, fixed }) {
  const pts = []; let be = null;
  for (let k = 0; k <= maxN; k += 1) {
    const v = k ? estimateMonth(m, Array.from({ length: k }, () => avgAct)).total : 0;
    const cost = fixed + v; const rev = avgRevenue * k;
    pts.push({ n: k, rev: Math.round(rev), cost: Math.round(cost), variable: Math.round(v), profit: Math.round(rev - cost) });
    if (be == null && k > 0 && rev >= cost) be = k;
  }
  return { pts, be };
}
