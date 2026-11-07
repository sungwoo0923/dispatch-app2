// ======================= src/SalesQuote.jsx =======================
// 💼 관리센터 › 영업(2026-10-29, 최고관리자 전용) — 요금제를 언제든 고치고, 그 요금제로 고객사 견적서를 만든다.
//  - 요금제·옵션·조건: siteConfig/salesPricing 한 문서(최고관리자만 읽기/쓰기)
//  - 저장한 견적: salesQuotes 컬렉션(최고관리자만) — 다시 열어 고치거나 인쇄(PDF 저장)
//  - "요금·청구"(가입사 월 청구 계산, siteConfig/platformPricing)와는 별개 — 그쪽은 이미 쓰는 고객 청구용, 이쪽은 영업 제안용.
//  ⭐ 알록달록 금지 — 네이비 계열만.
import React from "react";
import { runDelete } from "./DeleteProgress"; // ⭐ 2026-11-05 삭제 진행 창 + 한 번에 삭제
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { PlanMatrix, PLAN_DEFAULTS, PLAN_IDS, PLAN_MATRIX_CSS, RECOMMENDED_PLAN_VERSION, planFeatureLines, planMatrixHtml } from "./plans";
import { fmtBizNo, fmtPhone } from "./formatInput";
import { CustomSelect } from "./CustomSelect";
import { logisWordmarkSvg } from "./brand"; // 🔷 2026-11-04 LogisWeb 글자 로고(인쇄 문서 머리)
import { kpConfirm } from "./kpDialog";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const NAVY = "#1B2B4B";
const won = (n) => `${Math.round(Number(n) || 0).toLocaleString()}원`;
const num = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ─── 기본 요금제(처음 한 번 — 이후엔 화면에서 고친 값이 저장되어 쓰인다) ───
export const SALES_DEFAULT = {
  // ⭐ 2026-10-30 4단 요금제(라이트·베이직·스탠다드·프로) — 기능 범위는 plans.jsx의 FEATURE_ROWS 한 곳에서 정한다
  planVersion: 2,
  plans: PLAN_DEFAULTS.map((p) => ({ ...p, features: planFeatureLines(p.id) })),
  extraSeat: 15000,          // 추가 직원 계정 1명/월
  extraOrder: 40,            // 포함량 초과 오더 1건 (⭐ 2026-11-04 추천 요금표: 50 → 40원, 대신 요금제 포함량을 늘림)
  fleetPerVehicle: 5000,     // 지입차 관리(GPS·운행기록·사진) — 요금제 포함 대수(plan.fleet)를 넘는 1대/월
  setupFee: 300000,          // 초기 도입비(세팅·기본 데이터 이전·교육 1회) — 요금제별 금액(plan.setupFee)이 있으면 그 값
  migrationFee: 300000,      // 대량 데이터 이전(기존 프로그램 이관)
  trainingFee: 200000,       // 추가 현장 교육 1회
  // ⭐ 2026-11-04 추가 청구(애드온) — 관리센터 › 청구 › 수납 관리에서 회사별 "추가 항목"으로 청구서에 붙인다
  taxInvoiceFee: 300,        // 전자세금계산서 발행 1건(ASP 원가 + 마진)
  alimtalkFee: 15,           // 카카오 알림톡 1건
  smsFee: 30,                // 문자(SMS) 1건
  lmsFee: 80,                // 장문 문자(LMS) 1건
  extraBizFee: 30000,        // 추가 사업자(법인·지점) 1곳/월 — 다중 사업자 운영
  routeBoardSetupFee: 100000, // 고정노선 구글시트 배차표 연동 세팅 1양식(1회)
  devHourRate: 70000,        // 맞춤 기능 개발 1시간
  waiveSetupMonths: 12,      // 이 기간 이상 약정 시 도입비 면제
  annualFreeMonths: 2,       // 연간 선결제 시 무료 개월
  semiDiscountRate: 5,       // 6개월 선결제 할인율(%) — 단기(6개월) 고객용
  semiSetupRate: 50,         // 6개월 약정 시 초기 도입비 할인율(%)
  minContractMonths: 6,      // 최소 약정 기간
  storageGB: 10,             // 사진·파일 기본 제공 용량
  storagePerGB: 3000,        // 초과 1GB/월
  devDayRate: 500000,        // 맞춤 개발 1일 단가(8시간 묶음 할인)
  validDays: 30,             // 견적 유효기간
  messaging: "문자 · 알림톡은 발송 건수만큼 실비 청구",
  supplier: { name: "LogisWeb", ceo: "", bizNo: "", phone: "", email: "", address: "", bank: "" },
  terms: [
    "모든 금액은 부가세 별도입니다.",
    "일반 기사의 기사앱 사용과 화주사 포털 사용은 무료입니다.",
    "데이터의 소유권은 고객사에 있으며, 해지 시 엑셀로 전체 데이터를 제공합니다.",
    "데이터는 매일 자동 백업되며, 장애 접수 시 영업일 기준 당일 응대합니다.",
    "약정 기간 중 요금제 상향은 언제든 가능하며 차액만 청구합니다.",
  ],
};
// 예전(3단) 저장값이면 4단 구성으로 바꾸되, 같은 요금제의 가격은 그대로 이어받는다
const upgradePlans = (v) => {
  if (!v?.plans?.length) return SALES_DEFAULT.plans;
  if (v.planVersion >= 2) return v.plans;
  return SALES_DEFAULT.plans.map((p) => { const old = v.plans.find((x) => x.id === p.id); return old?.price ? { ...p, price: old.price } : p; });
};
const mergeDefaults = (v) => ({ ...SALES_DEFAULT, ...(v || {}), planVersion: 2, supplier: { ...SALES_DEFAULT.supplier, ...(v?.supplier || {}) }, plans: upgradePlans(v), terms: v?.terms?.length ? v.terms : SALES_DEFAULT.terms });

// ─── 계산 ───
export function monthlyOf(plan, cfg, inp) {
  const seats = Math.max(0, num(inp.staff) - num(plan.seats)) * num(cfg.extraSeat);
  const orders = Math.max(0, num(inp.orders) - num(plan.orders)) * num(cfg.extraOrder);
  const fleet = Math.max(0, num(inp.fleet) - num(plan.fleet)) * num(cfg.fleetPerVehicle); // ⭐ 2026-11-04 요금제 포함 대수 차감(예전 저장값은 0대 포함 = 예전과 같음)
  const storage = Math.max(0, num(inp.storageGB) - planStorageGB(plan, cfg)) * num(cfg.storagePerGB);
  return { base: num(plan.price), seats, orders, fleet, storage, total: num(plan.price) + seats + orders + fleet + storage };
}
// ⭐ 2026-11-02 관리자센터2 — 요금제별 초기 도입비(비우면 공통값)·기본 프로모션. 견적서·인쇄·요금 안내서가 모두 이 함수로 읽는다
const hasVal = (v) => v !== "" && v != null && !Number.isNaN(Number(v));
// ⭐ 2026-11-04 요금제별 포함 저장 용량(비우면 공통 기본 용량)
export const planStorageGB = (plan, cfg) => (hasVal(plan?.storageGB) ? num(plan.storageGB) : num(cfg?.storageGB));
export const planSetupFee = (plan, cfg) => (hasVal(plan?.setupFee) ? num(plan.setupFee) : num(cfg.setupFee));
// 요금제를 고르면 사용 규모(직원·오더)는 그 요금제 포함량, 프로모션은 요금제 기본값으로 — 사용자가 직접 바꾼 칸은 그대로 둔다
export function planDefaultsFor(plan, inp = {}) {
  if (!plan) return {};
  return {
    ...(inp.staffTouched ? {} : { staff: num(plan.seats) }),
    ...(inp.ordersTouched ? {} : { orders: num(plan.orders) }),
    ...(inp.promoTouched ? {} : { promoMonths: num(plan.promoMonths), promoRate: num(plan.promoRate) }),
  };
}
// 수납·요금·청구 — 회사에 요금제(companyPlans)가 지정돼 있으면 요금제 관리 가격으로 계산(지정 없으면 기존 공통 청구 기준)
// ⭐ 2026-11-03 사용량·한도 — 요금제 한도 대비 사용량과 초과 요금(계정·오더·지입차·저장 용량)
export function planUsageOf(c, planId, sales, projected) {
  const p = planId && sales?.plans?.find((x) => x.id === planId);
  if (!p) return null;
  const storageGB = Math.round(((c.storageKB || 0) / 1048576) * 100) / 100;
  const hasFleet = ["standard", "pro"].includes(planId); // 지입차관리는 스탠다드부터(plans.jsx FEATURE_ROWS)
  const limitGB = planStorageGB(p, sales);
  const extra = {
    seats: Math.max(0, (c.staff || 0) - num(p.seats)),
    orders: Math.max(0, (projected || 0) - num(p.orders)),
    fleet: hasFleet ? Math.max(0, (c.fleetJ || 0) - num(p.fleet)) : 0, // ⭐ 2026-11-04 요금제 포함 대수 차감
    storageGB: Math.max(0, Math.ceil(storageGB - limitGB)),
  };
  const fee = {
    seats: extra.seats * num(sales.extraSeat), orders: extra.orders * num(sales.extraOrder),
    fleet: extra.fleet * num(sales.fleetPerVehicle), storage: extra.storageGB * num(sales.storagePerGB),
  };
  return { plan: p, storageGB, limitGB, fleetIncluded: num(p.fleet), extra, fee, over: fee.seats + fee.orders + fee.fleet + fee.storage };
}
export function applyPlanBill(base, c, planId, sales) {
  const p = planId && sales?.plans?.find((x) => x.id === planId);
  if (!p) return { ...base, planName: "" };
  const u = planUsageOf(c, planId, sales, base.projected || 0);
  const { seats, orders, fleet, storage } = u.fee;
  return { ...base, base: num(p.price), seats, orders, fleet, storage, total: num(p.price) + seats + orders + fleet + storage, planName: p.name, usage: u };
}
// ⭐ 2026-11-04 추가 청구(애드온) — 요금제 기본료 + 사용량 초과 외에 회사별로 붙이는 항목.
//  수납 관리 › 운송사 줄 › [추가 항목]에서 고르면 platformInvoices/{월_회사}.items[]에 저장되고, 청구액 = 자동 계산 + 추가 항목 합계.
//  단가는 요금제 관리(siteConfig/salesPricing)의 값 — 바꾸면 새로 넣는 항목부터 적용(이미 넣은 항목은 그때 금액 유지).
export const ADDON_CATALOG = [
  { key: "taxInvoice", label: "전자세금계산서 발행", unit: "건", rateKey: "taxInvoiceFee", kind: "usage" },
  { key: "alimtalk", label: "카카오 알림톡 발송", unit: "건", rateKey: "alimtalkFee", kind: "usage" },
  { key: "sms", label: "문자(SMS) 발송", unit: "건", rateKey: "smsFee", kind: "usage" },
  { key: "lms", label: "장문 문자(LMS) 발송", unit: "건", rateKey: "lmsFee", kind: "usage" },
  { key: "extraBiz", label: "추가 사업자(법인·지점)", unit: "곳", rateKey: "extraBizFee", kind: "monthly" },
  { key: "devHour", label: "맞춤 기능 개발", unit: "시간", rateKey: "devHourRate", kind: "once" },
  { key: "setup", label: "초기 도입비", unit: "회", rateKey: "setupFee", kind: "once" },
  { key: "migration", label: "데이터 이관(기존 프로그램·엑셀)", unit: "회", rateKey: "migrationFee", kind: "once" },
  { key: "training", label: "추가 현장 교육", unit: "회", rateKey: "trainingFee", kind: "once" },
  { key: "routeBoard", label: "구글시트 배차표 연동 세팅", unit: "양식", rateKey: "routeBoardSetupFee", kind: "once" },
  { key: "custom", label: "기타(직접 입력)", unit: "", rateKey: null, kind: "once" },
];
export const ADDON_KIND_LABEL = { usage: "사용량", monthly: "월정액", once: "1회" };
export const addonRate = (key, sales, planId) => {
  const a = ADDON_CATALOG.find((x) => x.key === key);
  if (!a?.rateKey || !sales) return 0;
  if (key === "setup") return planSetupFee(sales.plans?.find((p) => p.id === planId), sales);
  return num(sales[a.rateKey]);
};
export const itemsTotal = (items) => (Array.isArray(items) ? items : []).reduce((a, x) => a + num(x.amount), 0);
// 청구서 줄(자동 계산분) — 수납 관리가 저장하고, 고객사 구독·결제 화면이 그대로 보여준다
export function billLines(bill) {
  if (!bill) return [];
  const u = bill.usage;
  return [
    { key: "base", label: bill.planName ? `${bill.planName} 요금제 기본료` : "기본 이용료", amount: num(bill.base) },
    { key: "seats", label: `추가 직원 계정${u ? ` ${u.extra.seats}명` : ""}`, amount: num(bill.seats) },
    { key: "orders", label: `초과 오더${u ? ` ${u.extra.orders.toLocaleString()}건` : ""}`, amount: num(bill.orders) },
    { key: "fleet", label: `지입차 관리${u ? ` ${u.extra.fleet}대${u.fleetIncluded ? `(포함 ${u.fleetIncluded}대 초과분)` : ""}` : ""}`, amount: num(bill.fleet) },
    { key: "storage", label: `추가 저장 용량${u ? ` ${u.extra.storageGB}GB` : ""}`, amount: num(bill.storage) },
  ].filter((x) => x.key === "base" || x.amount > 0);
}
export function quoteOf(cfg, inp) {
  const plans = cfg.plans || [];
  const byPlan = plans.map((p) => ({ plan: p, m: monthlyOf(p, cfg, inp) }));
  const best = byPlan.reduce((a, x) => (!a || x.m.total < a.m.total ? x : a), null);
  const chosen = byPlan.find((x) => x.plan.id === inp.planId) || best;
  if (!chosen) return null;
  const months = Math.max(1, num(inp.contractMonths) || 12);
  const waived = !!inp.waiveSetup && months >= num(cfg.waiveSetupMonths);
  // 단기(최소 약정 이상 · 면제 기간 미만) 약정은 도입비 일부 할인
  const setupHalf = !waived && !!inp.waiveSetup && months >= num(cfg.minContractMonths ?? 6) && num(cfg.semiSetupRate) > 0;
  const setupList = planSetupFee(chosen.plan, cfg);
  const setupAmount = waived ? 0 : setupHalf ? Math.round(setupList * (1 - num(cfg.semiSetupRate) / 100)) : setupList;
  const oneTime = [
    { label: "초기 도입비", note: `계정 세팅 · 기본 데이터 이전 · 교육 1회${setupHalf ? ` (단기 약정 ${num(cfg.semiSetupRate)}% 할인)` : ""}`, amount: setupAmount, list: setupList, waived },
    ...(inp.migration ? [{ label: "대량 데이터 이전", note: "기존 프로그램·엑셀 이관", amount: num(cfg.migrationFee) }] : []),
    ...(num(inp.training) > 0 ? [{ label: `추가 현장 교육 ${num(inp.training)}회`, note: "", amount: num(inp.training) * num(cfg.trainingFee) }] : []),
    ...(num(inp.devDays) > 0 ? [{ label: `맞춤 개발 ${num(inp.devDays)}일`, note: inp.devDesc || "", amount: num(inp.devDays) * num(cfg.devDayRate) }] : []),
  ];
  const oneTimeTotal = oneTime.reduce((a, x) => a + x.amount, 0);
  const monthly = chosen.m.total;
  // 1년차 이용료 — 연간 선결제면 무료 개월 차감, 프로모션(첫 N개월 X% 할인)은 실제 내는 달에만
  const year = Math.min(12, months);
  const free = inp.billing === "annual" ? Math.min(num(cfg.annualFreeMonths), year) : 0;
  const paidMonths = year - free;
  const promoMonths = Math.min(num(inp.promoMonths), paidMonths);
  const promoDiscount = Math.round(monthly * promoMonths * (num(inp.promoRate) / 100));
  // 6개월 선결제 — 실제 내는 이용료에서 할인율만큼
  const semiDiscount = inp.billing === "semi" ? Math.round((monthly * paidMonths - promoDiscount) * (num(cfg.semiDiscountRate) / 100)) : 0;
  const extraDiscount = num(inp.extraDiscount);
  const firstYearUse = monthly * paidMonths - promoDiscount - semiDiscount - extraDiscount;
  const firstYear = Math.max(0, firstYearUse) + oneTimeTotal;
  return { periodLabel: year >= 12 ? "1년차" : `약정 ${year}개월`, semiDiscount, byPlan, best, chosen, monthly, oneTime, oneTimeTotal, waived, year, free, paidMonths, promoMonths, promoDiscount, extraDiscount, firstYearUse: Math.max(0, firstYearUse), firstYear, vat: Math.round(firstYear * 0.1), avgMonthly: Math.round(firstYear / year) };
}

// ─── 인쇄용 문서(새 창 → 인쇄 / PDF로 저장) ───
const DOC_CSS = `${PLAN_MATRIX_CSS}
  *{box-sizing:border-box} body{margin:0;background:#E9EDF3;font-family:'Pretendard','Noto Sans KR','Malgun Gothic',sans-serif;color:#0F1A30}
  .page{width:210mm;min-height:297mm;margin:10mm auto;background:#fff;padding:16mm 15mm;position:relative}
  .mono{font-family:${MONO}} .eyebrow{font-family:${MONO};font-size:10px;font-weight:800;letter-spacing:.3em;color:#4B6CB7}
  .hero{background:linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82);color:#fff;border-radius:14px;padding:18px 22px;display:flex;justify-content:space-between;align-items:flex-end}
  .hero h1{margin:4px 0 0;font-size:28px;letter-spacing:.32em;font-weight:900}
  .hero .eyebrow{color:#8FB0F0}
  table{width:100%;border-collapse:collapse;font-size:12.5px} th,td{border:1px solid #D5DEEC;padding:7px 9px}
  th{background:#F1F4F9;font-weight:800;color:#3A4A66;text-align:left} .r{text-align:right} .c{text-align:center}
  thead th{background:#1B2B4B;color:#fff;border-color:#1B2B4B;text-align:center}
  .sum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}
  .sum div{border:1px solid #D5DEEC;border-radius:10px;padding:10px 12px} .sum b{display:block;font-family:${MONO};font-size:20px;margin-top:2px}
  .sum .on{background:#1B2B4B;color:#fff;border-color:#1B2B4B} .sum .on span{color:#CFE0FF}
  .sum span{font-size:11.5px;color:#5B6B85;font-weight:700}
  h3{font-size:13px;margin:16px 0 6px;display:flex;align-items:center;gap:6px} h3:before{content:"";width:6px;height:6px;background:#2D4C82;transform:rotate(45deg)}
  ul{margin:0;padding-left:16px;font-size:12px;line-height:1.75;color:#3A4A66}
  .plans{display:grid;gap:10px} .plan{border:1px solid #D5DEEC;border-radius:12px;padding:12px 14px} .plan.rec{border:2px solid #1B2B4B}
  .plan .p{font-family:${MONO};font-size:20px;font-weight:900} .tag{display:inline-block;background:#1B2B4B;color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:6px;margin-left:6px}
  .foot{position:absolute;left:15mm;right:15mm;bottom:10mm;font-size:10px;color:#9AA9C3;display:flex;justify-content:space-between;font-family:${MONO};letter-spacing:.1em}
  @media print{body{background:#fff}.page{margin:0;box-shadow:none}.noprint{display:none}}
  .bar{position:sticky;top:0;background:#0F1A30;color:#fff;padding:10px;text-align:center}
  .bar button{height:34px;padding:0 16px;border-radius:8px;border:0;background:#fff;color:#0F1A30;font-weight:800;cursor:pointer;margin:0 4px}
`;
function openPrint(title, bodyHtml) {
  const w = window.open("", "_blank", "width=920,height=1100");
  if (!w) { window.alert("팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요."); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_CSS}</style></head><body>
    <div class="bar noprint"><button onclick="window.print()">인쇄 / PDF로 저장</button><button onclick="window.close()">닫기</button></div>${bodyHtml}</body></html>`);
  w.document.close();
}
function supplierRows(s) {
  return [["상호", s.name], ["대표", s.ceo], ["사업자번호", s.bizNo], ["연락처", s.phone], ["이메일", s.email], ["주소", s.address]].filter(([, v]) => v)
    .map(([k, v]) => `<tr><th style="width:84px">${k}</th><td>${esc(v)}</td></tr>`).join("");
}
export function quoteHtml(cfg, inp, q, no) {
  const p = q.chosen.plan, m = q.chosen.m;
  const today = inp.date || ymd();
  const rows = [
    [`${p.name} 요금제`, `직원 ${p.seats}명 · 오더 월 ${num(p.orders).toLocaleString()}건 포함`, 1, m.base],
    ...(m.seats ? [["추가 직원 계정", `${num(inp.staff) - num(p.seats)}명 × ${won(cfg.extraSeat)}`, num(inp.staff) - num(p.seats), m.seats]] : []),
    ...(m.orders ? [["초과 오더", `${(num(inp.orders) - num(p.orders)).toLocaleString()}건 × ${won(cfg.extraOrder)}`, "", m.orders]] : []),
    ...(m.fleet ? [["지입차 관리", `${Math.max(0, num(inp.fleet) - num(p.fleet))}대 × ${won(cfg.fleetPerVehicle)} (GPS · 운행기록 · 사진${num(p.fleet) ? ` · ${num(p.fleet)}대 포함 초과분` : ""})`, Math.max(0, num(inp.fleet) - num(p.fleet)), m.fleet]] : []),
    ...(m.storage ? [["추가 저장 용량", `${num(inp.storageGB) - planStorageGB(p, cfg)}GB × ${won(cfg.storagePerGB)}`, "", m.storage]] : []),
  ];
  const trs = (list) => list.map(([a, b, c, d]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td class="c">${c === "" ? "-" : c}</td><td class="r mono">${won(d)}</td></tr>`).join("");
  const once = q.oneTime.map((x) => `<tr><td>${esc(x.label)}</td><td>${esc(x.note)}${x.waived ? ` <b>— ${cfg.waiveSetupMonths}개월 이상 약정으로 면제 (정가 ${won(x.list)})</b>` : ""}</td><td class="c">1</td><td class="r mono">${won(x.amount)}</td></tr>`).join("");
  return `<div class="page">
    <div class="hero"><div><div class="eyebrow">${logisWordmarkSvg(9)} · QUOTATION</div><h1>견 적 서</h1></div>
      <div style="text-align:right;font-size:12px;line-height:1.7"><div class="mono">No. ${esc(no || "미저장")}</div><div>견적일 ${today}</div><div>유효기간 ${addDays(today, num(cfg.validDays))}까지</div></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
      <table><tr><th style="width:84px">수신</th><td><b style="font-size:15px">${esc(inp.customer || "-")}</b> 귀중</td></tr>
        ${inp.contact ? `<tr><th>담당자</th><td>${esc(inp.contact)}</td></tr>` : ""}${inp.phone ? `<tr><th>연락처</th><td>${esc(inp.phone)}</td></tr>` : ""}
        <tr><th>사용 규모</th><td>직원 ${num(inp.staff)}명 · 월 오더 ${num(inp.orders).toLocaleString()}건${num(inp.fleet) ? ` · 지입차 ${num(inp.fleet)}대` : ""}</td></tr>
        <tr><th>계약 조건</th><td>${num(inp.contractMonths)}개월 약정 · ${inp.billing === "annual" ? `연간 선결제(${q.free}개월 무료)` : inp.billing === "semi" ? `6개월 선결제(${num(cfg.semiDiscountRate)}% 할인)` : "월 결제"}</td></tr></table>
      <table>${supplierRows(cfg.supplier)}</table>
    </div>
    <div class="sum">
      <div class="on"><span>월 이용료</span><b>${won(q.monthly)}</b></div>
      <div><span>초기 비용(1회)</span><b>${won(q.oneTimeTotal)}</b></div>
      <div><span>${q.periodLabel} 총액 (VAT 별도)</span><b>${won(q.firstYear)}</b></div>
    </div>
    <h3>월 이용료</h3>
    <table><thead><tr><th style="width:24%">항목</th><th>내용</th><th style="width:8%">수량</th><th style="width:18%">월 금액</th></tr></thead><tbody>${trs(rows)}
      <tr><th colspan="3">월 이용료 합계</th><th class="r mono">${won(q.monthly)}</th></tr></tbody></table>
    <h3>초기 비용 (1회)</h3>
    <table><thead><tr><th style="width:24%">항목</th><th>내용</th><th style="width:8%">수량</th><th style="width:18%">금액</th></tr></thead><tbody>${once}
      <tr><th colspan="3">초기 비용 합계</th><th class="r mono">${won(q.oneTimeTotal)}</th></tr></tbody></table>
    <h3>${q.periodLabel} 예상 비용</h3>
    <table><tbody>
      <tr><td>이용료 ${q.paidMonths}개월${q.free ? ` (연간 선결제 ${q.free}개월 무료)` : ""}</td><td class="r mono" style="width:30%">${won(q.monthly * q.paidMonths)}</td></tr>
      ${q.promoDiscount ? `<tr><td>도입 프로모션 — 첫 ${q.promoMonths}개월 ${num(inp.promoRate)}% 할인</td><td class="r mono">- ${won(q.promoDiscount)}</td></tr>` : ""}
      ${q.semiDiscount ? `<tr><td>6개월 선결제 할인 ${num(cfg.semiDiscountRate)}%</td><td class="r mono">- ${won(q.semiDiscount)}</td></tr>` : ""}
      ${q.extraDiscount ? `<tr><td>특별 할인</td><td class="r mono">- ${won(q.extraDiscount)}</td></tr>` : ""}
      <tr><td>초기 비용</td><td class="r mono">${won(q.oneTimeTotal)}</td></tr>
      <tr><th>${q.periodLabel} 합계 (VAT 별도)</th><th class="r mono">${won(q.firstYear)}</th></tr>
      <tr><td>부가세 10%</td><td class="r mono">${won(q.vat)}</td></tr>
      <tr><th>${q.periodLabel} 합계 (VAT 포함)</th><th class="r mono" style="font-size:15px">${won(q.firstYear + q.vat)}</th></tr>
      <tr><td colspan="2" style="color:#5B6B85">→ ${q.periodLabel === "1년차" ? "1년" : q.periodLabel} 평균 월 ${won(q.avgMonthly)} (VAT 별도)</td></tr>
    </tbody></table>
    <h3>요금제별 사용 범위 (선택: ${esc(p.name)})</h3>${planMatrixHtml(cfg.plans, PLAN_IDS.includes(p.id) ? p.id : null)}
    <h3>${esc(p.name)} 요금제 포함 기능</h3><ul>${(p.features || []).map((f) => `<li>${esc(f)}</li>`).join("")}<li>${esc(cfg.messaging)}</li>${num(p.fleet) ? `<li>지입차(GPS·운행기록·사진) ${num(p.fleet)}대 포함</li>` : ""}<li>사진 · 파일 저장 ${planStorageGB(p, cfg)}GB 기본 제공</li></ul>
    <h3>계약 조건</h3><ul>${(cfg.terms || []).map((t) => `<li>${esc(t)}</li>`).join("")}${inp.memo ? `<li><b>${esc(inp.memo)}</b></li>` : ""}</ul>
    <div class="foot"><span>LogisWeb · LOGISTICS DISPATCH NETWORK</span><span>${esc(cfg.supplier.name)}</span></div>
  </div>`;
}
export function priceSheetHtml(cfg) {
  const plans = cfg.plans.map((p) => `<div class="plan ${p.recommended ? "rec" : ""}"><div class="eyebrow">${esc(p.en || "")}</div>
      <div style="margin-top:2px"><b style="font-size:17px">${esc(p.name)}</b>${p.recommended ? '<span class="tag">추천</span>' : ""}</div>
      <div class="p" style="margin-top:2px">${won(p.price)}<span style="font-size:11px;color:#5B6B85"> /월</span></div>
      <div style="font-size:12px;color:#5B6B85;margin:2px 0 6px">${esc(p.target || "")} · 직원 ${p.seats}명 · 오더 월 ${num(p.orders).toLocaleString()}건${num(p.fleet) ? ` · 지입차 ${num(p.fleet)}대` : ""} · 저장 ${planStorageGB(p, cfg)}GB 포함</div>
      ${hasVal(p.setupFee) || num(p.promoMonths) ? `<div style="font-size:11.5px;color:#1B2B4B;font-weight:700;margin-bottom:6px">${hasVal(p.setupFee) ? `도입비 ${won(p.setupFee)}` : ""}${hasVal(p.setupFee) && num(p.promoMonths) ? " · " : ""}${num(p.promoMonths) ? `첫 ${num(p.promoMonths)}개월 ${num(p.promoRate)}% 할인` : ""}</div>` : ""}
      <ul>${(p.features || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>`).join("");
  const opt = [["추가 직원 계정", `1명당 월 ${won(cfg.extraSeat)}`], ["초과 오더", `1건당 ${won(cfg.extraOrder)}`], ["지입차 관리(GPS·운행기록·사진)", `요금제 포함 대수 초과 1대당 월 ${won(cfg.fleetPerVehicle)}`], ["일반 기사 기사앱 · 화주사 포털", "무료"],
    ["추가 저장 용량", `요금제 포함 용량 초과 1GB당 월 ${won(cfg.storagePerGB)}`], ["추가 사업자(법인·지점)", `1곳당 월 ${won(cfg.extraBizFee)}`],
    ["전자세금계산서 발행", `1건당 ${won(cfg.taxInvoiceFee)}`], ["카카오 알림톡 · 문자", `알림톡 ${won(cfg.alimtalkFee)} · SMS ${won(cfg.smsFee)} · LMS ${won(cfg.lmsFee)} (1건)`]];
  const once = [["초기 도입비", `${won(cfg.setupFee)}${cfg.plans.some((p) => hasVal(p.setupFee)) ? " (요금제별 금액은 위 요금제 칸)" : ""} — ${cfg.waiveSetupMonths}개월 이상 약정 시 면제`], ["대량 데이터 이전", won(cfg.migrationFee)], ["추가 현장 교육", `1회 ${won(cfg.trainingFee)}`], ["구글시트 배차표 연동 세팅", `1양식 ${won(cfg.routeBoardSetupFee)}`], ["맞춤 개발", `1시간 ${won(cfg.devHourRate)} · 1일 ${won(cfg.devDayRate)}`], ["연간 선결제", `${cfg.annualFreeMonths}개월 무료`], ["단기 계약(최소 " + (cfg.minContractMonths ?? 6) + "개월)", `6개월 선결제 ${cfg.semiDiscountRate}% 할인 · 도입비 ${cfg.semiSetupRate}% 할인`]];
  const t = (rows) => `<table><tbody>${rows.map(([a, b]) => `<tr><th style="width:42%">${a}</th><td>${b}</td></tr>`).join("")}</tbody></table>`;
  return `<div class="page">
    <div class="hero"><div><div class="eyebrow">${logisWordmarkSvg(9)} · PRICING</div><h1>요 금 안 내</h1></div><div style="font-size:12px;text-align:right">${ymd()} 기준 · 부가세 별도</div></div>
    <h3>요금제</h3><div class="plans" style="grid-template-columns:repeat(${Math.min(4, cfg.plans.length)},1fr)">${plans}</div>
    <h3>요금제별 사용 범위</h3>${planMatrixHtml(cfg.plans)}
    <h3>추가 옵션 (월)</h3>${t(opt)}<h3>1회 비용 · 결제 혜택</h3>${t(once)}
    <h3>안내</h3><ul>${(cfg.terms || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <div class="foot"><span>LogisWeb · LOGISTICS DISPATCH NETWORK</span><span>${esc(cfg.supplier.name)}</span></div></div>`;
}

// ─── 공용 부품 ───
const inpCls = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#4B6CB7]";
function Card({ code, title, right, children, className = "" }) {
  return (
    <div className={`bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)] overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-x-3 gap-y-1.5 flex-wrap px-4 sm:px-5 py-2 min-h-[46px] sm:min-h-[50px] bg-[#F7F9FC] border-b border-[#E8EDF4]">
        <div className="flex items-center gap-2 min-w-0"><span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" />
          <span className="text-[10.5px] font-extrabold tracking-[0.2em] text-[#94A3B8]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{code}</span>
          <span className="text-[15px] sm:text-[16px] font-black text-[#0F1A30] truncate whitespace-nowrap">{title}</span></div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
function NumIn({ value, onChange, unit, w = "w-32" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <input inputMode="numeric" value={value === "" || value == null ? "" : Number(value).toLocaleString()} onChange={(e) => onChange(num(e.target.value))}
        className={`h-9 ${w} px-2.5 rounded-lg border border-[#DCE3EE] text-right text-[14.5px] font-black text-[#1B2B4B] outline-none focus:border-[#4B6CB7]`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} />
      {unit && <span className="text-[12.5px] font-bold text-[#7A879C] min-w-[24px] whitespace-nowrap">{unit}</span>}
    </span>
  );
}
// 비워 둘 수 있는 숫자 칸(비우면 null = 공통값 사용)
function OptNumIn({ value, onChange, unit, placeholder, w = "w-32" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <input inputMode="numeric" value={value === "" || value == null ? "" : Number(value).toLocaleString()} placeholder={placeholder}
        onChange={(e) => { const raw = e.target.value.replace(/[^\d]/g, ""); onChange(raw === "" ? null : Number(raw)); }}
        className={`h-9 ${w} px-2.5 rounded-lg border border-[#DCE3EE] text-right text-[14.5px] font-black text-[#1B2B4B] outline-none focus:border-[#4B6CB7] placeholder:text-[#C0CAD9]`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} />
      {unit && <span className="text-[12.5px] font-bold text-[#7A879C] min-w-[24px] whitespace-nowrap">{unit}</span>}
    </span>
  );
}
const Btn = ({ dark, children, ...p }) => (
  <button type="button" {...p} className={`h-10 px-4 rounded-xl text-[13.5px] font-black inline-flex items-center gap-1.5 transition disabled:opacity-50 ${dark ? "bg-[#0F1A30] text-white hover:bg-[#1B2B4B]" : "bg-white border border-[#DCE3EE] text-[#1B2B4B] hover:border-[#4B6CB7]"} ${p.className || ""}`}>{children}</button>
);

// ─── 데이터 ───
export function useSalesPricing() {
  const [cfg, setCfg] = React.useState(null);
  React.useEffect(() => onSnapshot(doc(db, "siteConfig", "salesPricing"), (s) => setCfg(mergeDefaults(s.exists() ? s.data() : null)), () => setCfg(mergeDefaults(null))), []);
  return cfg;
}

// ═══════════════════════════ ① 요금제 관리 ═══════════════════════════
export function PricingEditor() {
  const live = useSalesPricing();
  const [cfg, setCfg] = React.useState(null);
  const [dirty, setDirty] = React.useState(false);
  const [pi, setPi] = React.useState(0); // ⭐ 2026-11-06 왼쪽에서 고치는 요금제(카드를 눌러 고름)
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => { if (live && !dirty) setCfg(live); }, [live, dirty]);
  if (!cfg) return <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>;
  const set = (patch) => { setCfg((c) => ({ ...c, ...patch })); setDirty(true); };
  const setPlan = (i, patch) => set({ plans: cfg.plans.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const save = async () => {
    try {
      await setDoc(doc(db, "siteConfig", "salesPricing"), { ...cfg, updatedAt: serverTimestamp() });
      // 고객사 화면(구독·결제, 잠금 안내)에 보여줄 공개 요금 — 가격·포함량·입금 계좌만
      await setDoc(doc(db, "publicPricing", "current"), {
        plans: cfg.plans.map(({ id, name, en, price, seats, orders, fleet, storageGB, target, recommended }) => ({ id, name, en, price: num(price), seats: num(seats), orders: num(orders), fleet: num(fleet), ...(hasVal(storageGB) ? { storageGB: num(storageGB) } : {}), target: target || "", recommended: !!recommended })),
        setupFee: num(cfg.setupFee),
        extraSeat: num(cfg.extraSeat), extraOrder: num(cfg.extraOrder),
        // ⭐ 2026-11-04 고객사 구독·결제 화면의 예상 청구·추가 요금 안내용(단가만 — 원가·마진은 절대 공개하지 않음)
        fleetPerVehicle: num(cfg.fleetPerVehicle), storageGB: num(cfg.storageGB), storagePerGB: num(cfg.storagePerGB),
        taxInvoiceFee: num(cfg.taxInvoiceFee), alimtalkFee: num(cfg.alimtalkFee), smsFee: num(cfg.smsFee), lmsFee: num(cfg.lmsFee), extraBizFee: num(cfg.extraBizFee), bank: cfg.supplier?.bank || "", supplier: cfg.supplier?.name || "LogisWeb", supplierBizNo: cfg.supplier?.bizNo || "", supplierEmail: cfg.supplier?.email || "", supplierPhone: cfg.supplier?.phone || "",
        updatedAt: serverTimestamp(),
      });
      setDirty(false); setMsg("저장했습니다. 새로 만드는 견적서부터 바로 적용됩니다."); }
    catch (e) { setMsg(`저장 실패: ${e.message}`); }
  };
  // ⭐ 2026-11-04 추천 요금표(docs/pricing-2026-11.md) — 화면에만 채우고, [저장]을 눌러야 실제로 바뀐다(저장한 가격을 몰래 덮어쓰지 않음)
  const applyRecommended = async () => {
    const cur = cfg.plans.filter((p) => PLAN_IDS.includes(p.id)).map((p) => `${p.name} ${num(p.price).toLocaleString()}원`).join(" · ");
    const nxt = PLAN_DEFAULTS.map((p) => `${p.name} ${p.price.toLocaleString()}원`).join(" · ");
    if (!await kpConfirm(`추천 요금표(${RECOMMENDED_PLAN_VERSION})를 화면에 채울까요?\n\n지금: ${cur}\n추천: ${nxt}\n\n· 포함 직원·오더·지입차·저장 용량, 요금제별 도입비, 추가 청구 단가도 함께 채웁니다.\n· 화면에만 채워지고 [저장]을 눌러야 적용됩니다. 기존 고객의 지정 요금제(회사별)는 그대로입니다.\n· 직접 만든 요금제·포함 기능 문구·공급자 정보·계약 문구는 그대로 둡니다.`)) return;
    const keepExtra = cfg.plans.filter((p) => !PLAN_IDS.includes(p.id));
    const plans = PLAN_DEFAULTS.map((d) => { const old = cfg.plans.find((p) => p.id === d.id) || {}; return { ...old, ...d, promoMonths: old.promoMonths || 0, promoRate: old.promoRate || 0, features: old.features?.length ? old.features : planFeatureLines(d.id) }; });
    const pick = ["extraSeat", "extraOrder", "fleetPerVehicle", "setupFee", "migrationFee", "trainingFee", "storageGB", "storagePerGB", "devDayRate", "devHourRate", "taxInvoiceFee", "alimtalkFee", "smsFee", "lmsFee", "extraBizFee", "routeBoardSetupFee", "annualFreeMonths", "semiDiscountRate", "waiveSetupMonths"];
    set({ plans: [...plans, ...keepExtra], ...Object.fromEntries(pick.map((k) => [k, SALES_DEFAULT[k]])), recommendedVersion: RECOMMENDED_PLAN_VERSION });
    setMsg(`추천 요금표를 화면에 채웠습니다 — 확인 후 오른쪽 위 [저장]을 눌러야 적용됩니다.`);
  };
  const OPTS = [
    ["월 추가 옵션", [["extraSeat", "추가 직원 계정 (1명/월)", "원"], ["extraOrder", "포함량 초과 오더 (1건)", "원"], ["fleetPerVehicle", "지입차 관리 — 포함 대수 초과 (1대/월)", "원"], ["storageGB", "기본 저장 용량(요금제 칸이 비었을 때)", "GB"], ["storagePerGB", "초과 저장 (1GB/월)", "원"], ["extraBizFee", "추가 사업자·지점 (1곳/월)", "원"]]],
    // ⭐ 2026-11-04 추가 청구 — 사용한 만큼(수납 관리 › 추가 항목으로 청구서에 붙임)
    ["사용량 추가 청구", [["taxInvoiceFee", "전자세금계산서 발행 (1건)", "원"], ["alimtalkFee", "카카오 알림톡 (1건)", "원"], ["smsFee", "문자 SMS (1건)", "원"], ["lmsFee", "장문 문자 LMS (1건)", "원"]]],
    ["1회 비용 · 혜택", [["setupFee", "초기 도입비(요금제 칸이 비었을 때)", "원"], ["waiveSetupMonths", "도입비 면제 약정 기간", "개월"], ["migrationFee", "대량 데이터 이전", "원"], ["trainingFee", "추가 현장 교육 (1회)", "원"], ["routeBoardSetupFee", "구글시트 배차표 연동 세팅 (1양식)", "원"], ["devHourRate", "맞춤 개발 (1시간)", "원"], ["devDayRate", "맞춤 개발 (1일)", "원"], ["annualFreeMonths", "연간 선결제 무료", "개월"], ["minContractMonths", "최소 약정 기간", "개월"], ["semiDiscountRate", "6개월 선결제 할인", "%"], ["semiSetupRate", "단기 약정 도입비 할인", "%"], ["validDays", "견적 유효기간", "일"]]],
  ];
  // ⭐ 2026-11-06 요금제 관리 다시 꾸밈 — 견적서 작성과 같은 구성: 왼쪽 편집 / 오른쪽 실시간 미리보기(카드·표)
  const L = ({ children }) => <div className="text-[13px] font-bold text-[#7A879C] mb-1">{children}</div>;
  const idx = Math.min(pi, cfg.plans.length - 1);
  const P = cfg.plans[idx] || cfg.plans[0];
  const addPlan = () => { set({ plans: [...cfg.plans, { id: `p${Date.now()}`, name: "새 요금제", en: "PLAN", price: 0, seats: 1, orders: 500, target: "", features: [] }] }); setPi(cfg.plans.length); };
  const delPlan = async () => { if (cfg.plans.length > 1 && (await kpConfirm(`'${P.name}' 요금제를 지울까요?`, { okText: "지우기", danger: true }))) { set({ plans: cfg.plans.filter((_, k) => k !== idx) }); setPi(0); } };
  const row = (label, child, hint, key) => (
    <div key={key || label} className="flex items-center justify-between gap-3 py-2 border-t first:border-t-0 border-[#EEF1F6]">
      <span className="text-[14px] font-bold text-[#3A4A66]">{label}{hint && <span className="block text-[12.5px] font-semibold text-[#9AA9C3]">{hint}</span>}</span>{child}
    </div>
  );
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)] items-start" data-pricing-editor="1">
      {/* ── 왼쪽: 편집 ── */}
      <div className="space-y-4">
        <Card code="PLANS" title="요금제 고르기" right={<Btn onClick={addPlan}>+ 요금제 추가</Btn>}>
          <div className="flex gap-1 p-1 rounded-xl bg-[#EEF2F8] flex-wrap">
            {cfg.plans.map((p, i) => (
              <button key={p.id} type="button" onClick={() => setPi(i)} className={`flex-1 min-w-[88px] h-9 px-2 rounded-lg text-[14px] font-black whitespace-nowrap ${i === idx ? "bg-[#1B2B4B] text-white" : "text-[#3A4A66]"}`}>{p.name}{p.recommended ? " ★" : ""}</button>
            ))}
          </div>
          <div className="mt-2 text-[13px] text-[#7A879C]">오른쪽 미리보기 카드를 눌러도 고를 수 있습니다.</div>
        </Card>

        <Card code={`PLAN · ${P.en || "PLAN"}`} title={`${P.name} 요금제`} right={cfg.plans.length > 1 ? <button type="button" onClick={delPlan} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-bold text-[#7A879C] hover:text-[#0F1A30]">삭제</button> : null}>
          <div className="grid grid-cols-2 gap-2.5 mb-2">
            <div><L>이름</L><input value={P.name} onChange={(e) => setPlan(idx, { name: e.target.value })} className={inpCls} /></div>
            <div><L>영문 표기</L><input value={P.en || ""} onChange={(e) => setPlan(idx, { en: e.target.value.toUpperCase() })} className={inpCls} /></div>
          </div>
          {row("월 기본료", <NumIn value={P.price} onChange={(v) => setPlan(idx, { price: v })} unit="원" />)}
          {row("포함 직원 계정", <NumIn value={P.seats} onChange={(v) => setPlan(idx, { seats: v })} unit="명" w="w-24" />)}
          {row("포함 오더 (월)", <NumIn value={P.orders} onChange={(v) => setPlan(idx, { orders: v })} unit="건" w="w-28" />)}
          {row("포함 지입차 (GPS)", <NumIn value={P.fleet || 0} onChange={(v) => setPlan(idx, { fleet: v })} unit="대" w="w-24" />)}
          {row("포함 저장 용량", <OptNumIn value={P.storageGB} onChange={(v) => setPlan(idx, { storageGB: v })} unit="GB" w="w-24" placeholder={String(num(cfg.storageGB))} />, `비우면 공통 ${num(cfg.storageGB)}GB`)}
          {row("초기 도입비", <OptNumIn value={P.setupFee} onChange={(v) => setPlan(idx, { setupFee: v })} unit="원" placeholder={num(cfg.setupFee).toLocaleString()} />, `비우면 공통 ${won(cfg.setupFee)}`)}
          {row("기본 프로모션", <span className="inline-flex items-center gap-1.5">첫<NumIn value={P.promoMonths || 0} onChange={(v) => setPlan(idx, { promoMonths: v })} unit="개월" w="w-14" /><NumIn value={P.promoRate || 0} onChange={(v) => setPlan(idx, { promoRate: Math.min(100, v) })} unit="%" w="w-14" /></span>)}
          <div className="pt-2 border-t border-[#EEF1F6] space-y-2.5">
            <div><L>추천 대상</L><input value={P.target || ""} onChange={(e) => setPlan(idx, { target: e.target.value })} className={inpCls} /></div>
            <label className="flex items-center gap-2 text-[14px] font-bold text-[#3A4A66]"><input type="checkbox" checked={!!P.recommended} onChange={(e) => set({ plans: cfg.plans.map((x, k) => ({ ...x, recommended: e.target.checked ? k === idx : (k === idx ? false : !!x.recommended) })) })} className="w-[18px] h-[18px] accent-[#1B2B4B]" />이 요금제를 추천으로 표시</label>
            <div><L>포함 기능 (한 줄에 하나 · 견적서·요금 안내에 찍힘)</L>
              <textarea value={(P.features || []).join("\n")} onChange={(e) => setPlan(idx, { features: e.target.value.split("\n") })} onBlur={(e) => setPlan(idx, { features: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} rows={6} className={`${inpCls} h-auto py-2 leading-relaxed`} /></div>
            <button type="button" onClick={() => PLAN_IDS.includes(P.id) && setPlan(idx, { features: planFeatureLines(P.id) })} disabled={!PLAN_IDS.includes(P.id)} className="text-[13px] font-bold text-[#2D4C82] disabled:text-[#C0CAD9]">↺ 실제 메뉴 잠금 기준으로 기능 문구 다시 채우기</button>
          </div>
        </Card>

        {OPTS.map(([title, rows]) => (
          <Card key={title} code={title.startsWith("월") ? "OPTIONS" : title.startsWith("사용량") ? "USAGE ADD-ONS" : "ONE-TIME"} title={title}>
            {rows.map(([k, l, u]) => row(l, <NumIn value={cfg[k]} onChange={(v) => set({ [k]: v })} unit={u} w="w-28" />, null, k))}
          </Card>
        ))}
        <Card code="SUPPLIER" title="공급자 정보 (견적서에 표시)">
          {[["name", "상호"], ["ceo", "대표"], ["bizNo", "사업자번호"], ["phone", "연락처"], ["email", "이메일"], ["address", "주소"], ["bank", "입금 계좌"]].map(([k, l]) => (
            <div key={k} className="grid grid-cols-[96px_1fr] items-center gap-3 py-1.5">
              <span className="text-[14px] font-bold text-[#5B6B85]">{l}</span>
              <input value={cfg.supplier[k] || ""} inputMode={k === "phone" ? "tel" : k === "bizNo" ? "numeric" : undefined} placeholder={k === "phone" ? "02-000-0000" : k === "bizNo" ? "000-00-00000" : undefined} onChange={(e) => set({ supplier: { ...cfg.supplier, [k]: k === "phone" ? fmtPhone(e.target.value) : k === "bizNo" ? fmtBizNo(e.target.value) : e.target.value } })} className={`${inpCls} h-9`} />
            </div>
          ))}
        </Card>
        <Card code="TERMS" title="계약 조건 · 안내 문구">
          <div className="text-[13px] text-[#7A879C] mb-2">견적서·요금 안내서 하단에 그대로 들어갑니다. 한 줄에 하나.</div>
          <textarea value={cfg.terms.join("\n")} onChange={(e) => set({ terms: e.target.value.split("\n") })} onBlur={(e) => set({ terms: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} rows={7} className={`${inpCls} h-auto py-2 leading-relaxed`} />
          <div className="mt-3 text-[13px] font-bold text-[#5B6B85]">문자 · 알림톡 안내</div>
          <input value={cfg.messaging} onChange={(e) => set({ messaging: e.target.value })} className={`${inpCls} mt-1`} />
        </Card>
      </div>

      {/* ── 오른쪽: 실시간 미리보기 ── */}
      <div className="space-y-4 xl:sticky xl:top-4">
        <div className="rounded-[20px] p-5 text-white shadow-[0_16px_34px_rgba(11,20,40,0.3)]" style={{ background: "linear-gradient(rgba(143,176,240,.05) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.05) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(150deg,#0B1428,#16264A)" }}>
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="text-[11.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0] whitespace-nowrap">PRICING · {cfg.recommendedVersion || "CUSTOM"}</div>
            <div className={`text-[13px] font-bold whitespace-nowrap ${dirty ? "text-white" : "text-white/55"}`}>{dirty ? "● 저장하지 않은 수정이 있습니다" : "저장됨 · 견적서에 그대로 적용"}</div>
          </div>
          <div className="mt-1.5 text-[14px] text-white/70">요금제는 여기서만 고치면 됩니다. 견적서·요금 안내서·고객사 구독 화면이 이 값을 씁니다(기존 고객 청구는 청구 › 수납 관리).</div>
          <div className="mt-4 flex gap-2 flex-wrap">
            <button type="button" onClick={save} disabled={!dirty} className="h-10 px-5 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black disabled:opacity-40" data-pricing-save>{dirty ? "저장" : "저장됨"}</button>
            <button type="button" onClick={async () => { if ((await kpConfirm("저장하지 않은 수정을 버리고 마지막 저장값으로 돌릴까요?"))) { setDirty(false); setCfg(live); } }} disabled={!dirty} className="h-10 px-4 rounded-xl bg-white/10 ring-1 ring-white/25 text-white text-[14px] font-black disabled:opacity-40">되돌리기</button>
            <button type="button" onClick={applyRecommended} className="h-10 px-4 rounded-xl bg-white/10 ring-1 ring-white/25 text-white text-[14px] font-black">추천 요금표 적용</button>
            <button type="button" onClick={() => openPrint("LogisWeb 요금 안내", priceSheetHtml(cfg))} className="h-10 px-4 rounded-xl text-white/75 text-[14px] font-bold hover:text-white">요금 안내서 인쇄</button>
          </div>
          {msg && <div className="mt-3 rounded-xl bg-white/10 px-3.5 py-2 text-[14px] font-bold">{msg}</div>}
        </div>

        <Card code="PREVIEW" title="요금제 카드 (고객에게 보이는 모양)">
          <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 min-[1700px]:grid-cols-4">
            {cfg.plans.map((p, i) => {
              const on = i === idx;
              const feats = (p.features || []).filter(Boolean);
              return (
                <button key={p.id} type="button" onClick={() => setPi(i)} data-plan-card={p.id} className={`text-left rounded-xl p-4 border-2 transition flex flex-col ${on ? "border-[#1B2B4B] bg-[#F5F8FD]" : "border-[#E3E8F0] hover:border-[#8FB0F0]"}`}>
                  <div className="flex items-center justify-between gap-2"><span className="text-[11.5px] font-extrabold tracking-[0.2em] text-[#94A3B8]">{p.en || "PLAN"}</span>{p.recommended && <span className="px-2 py-0.5 rounded-md bg-[#1B2B4B] text-white text-[12px] font-black">추천</span>}</div>
                  <b className="text-[17px] text-[#0F1A30] mt-0.5">{p.name}</b>
                  <div className="text-[24px] font-black text-[#1B2B4B] mt-1 whitespace-nowrap tabular-nums">{won(p.price)}<span className="text-[13px] font-bold text-[#7A879C] ml-1">/ 월</span></div>
                  <div className="text-[13.5px] font-bold text-[#5B6B85] mt-1">직원 {num(p.seats)}명 · 오더 {num(p.orders).toLocaleString()}건 · 지입 {num(p.fleet || 0)}대 · {hasVal(p.storageGB) ? num(p.storageGB) : num(cfg.storageGB)}GB</div>
                  <div className="text-[13px] text-[#7A879C] mt-0.5">도입비 {won(hasVal(p.setupFee) ? p.setupFee : cfg.setupFee)}{num(p.promoMonths) ? ` · 첫 ${num(p.promoMonths)}개월 ${num(p.promoRate)}%` : ""}</div>
                  {p.target && <div className="text-[13px] text-[#3A4A66] mt-1.5 font-semibold">{p.target}</div>}
                  <ul className="mt-2 space-y-0.5">{feats.slice(0, 5).map((f) => <li key={f} className="flex gap-1.5 text-[13px] text-[#3A4A66]"><span className="mt-[7px] w-1 h-1 rotate-45 bg-[#2D4C82] shrink-0" /><span className="truncate">{f}</span></li>)}</ul>
                  {feats.length > 5 && <div className="text-[12.5px] text-[#9AA9C3] mt-0.5">외 {feats.length - 5}개</div>}
                </button>
              );
            })}
          </div>
        </Card>

        <Card code="COMPARE" title="한눈에 비교">
          <div className="overflow-x-auto -m-5">
            <table className="w-full text-[14px] border-collapse" style={{ minWidth: 160 + cfg.plans.length * 130 }}>
              <thead><tr><th className="bg-[#1B2B4B] text-white text-left px-4 py-2.5">항목</th>{cfg.plans.map((p, i) => <th key={p.id} className={`px-3 py-2.5 text-right whitespace-nowrap ${i === idx ? "bg-[#2D4C82]" : "bg-[#1B2B4B]"} text-white`}>{p.name}</th>)}</tr></thead>
              <tbody>
                {[["월 기본료", (p) => won(p.price)], ["포함 직원", (p) => `${num(p.seats)}명`], ["포함 오더", (p) => `${num(p.orders).toLocaleString()}건`], ["포함 지입차", (p) => `${num(p.fleet || 0)}대`], ["저장 용량", (p) => `${hasVal(p.storageGB) ? num(p.storageGB) : num(cfg.storageGB)}GB`], ["초기 도입비", (p) => won(hasVal(p.setupFee) ? p.setupFee : cfg.setupFee)], ["직원 1명 추가", () => won(cfg.extraSeat)], ["초과 오더 1건", () => won(cfg.extraOrder)]].map(([l, f]) => (
                  <tr key={l} className="border-t border-[#EEF1F6]"><td className="px-4 py-2.5 bg-[#F7F9FC] text-[13.5px] font-extrabold text-[#5B6B85] whitespace-nowrap">{l}</td>{cfg.plans.map((p, i) => <td key={p.id} className={`px-3 py-2.5 text-right font-black tabular-nums whitespace-nowrap ${i === idx ? "text-[#0F1A30] bg-[#F5F8FD]" : "text-[#1B2B4B]"}`}>{f(p)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card code="SCOPE" title="요금제별 사용 범위 (실제 메뉴 잠금 기준)" right={<Btn onClick={() => set({ plans: cfg.plans.map((x) => (PLAN_IDS.includes(x.id) ? { ...x, features: planFeatureLines(x.id) } : x)) })}>기능 문구를 이 표로 다시 채우기</Btn>}>
          <div className="text-[13px] text-[#5B6B85] mb-3">✓ 표시는 고객사 프로그램에서 실제로 열리는 범위입니다. 회사별 요금제 지정은 청구 › 수납 관리에서 합니다.</div>
          <PlanMatrix plans={cfg.plans} compact />
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════ ② 견적서 작성 ═══════════════════════════
// ⭐ 2026-11-02 관리자센터2 — 견적 금액이 요금제 관리와 다르게 보이던 원인: 사용 규모가 "직원 8명 · 오더 2,500건"으로 고정돼 있어
//  라이트(2명·500건 포함)·베이직(5명·1,500건 포함)에 초과 요금이 자동으로 붙었다(라이트 99,000 → 289,000 등).
//  이제 새 견적은 추천 요금제의 포함량으로 시작하고, 요금제를 바꾸면 사용 규모·프로모션도 그 요금제 기본값으로 바뀐다(직접 고친 칸은 유지).
const BLANK_INPUT = { customer: "", contact: "", phone: "", staff: 0, orders: 0, seeded: false, staffTouched: false, ordersTouched: false, promoTouched: false, fleet: 0, storageGB: 0, planId: "auto", contractMonths: 12, billing: "monthly", waiveSetup: true, migration: false, training: 0, devDays: 0, devDesc: "", promoMonths: 0, promoRate: 0, extraDiscount: 0, memo: "" };
export function QuoteBuilder({ initial, onSaved }) {
  const cfg = useSalesPricing();
  const [inp, setInp] = React.useState(() => {
    // 관리센터 > 도입 문의에서 "이 업체로 견적서 만들기"로 넘어온 경우 고객 정보를 미리 채움(한 번만)
    let seed = {};
    if (!initial) { try { seed = JSON.parse(sessionStorage.getItem("kpQuoteSeed") || "{}"); sessionStorage.removeItem("kpQuoteSeed"); } catch { seed = {}; } }
    return { ...BLANK_INPUT, ...seed, ...(initial?.input ? { seeded: true, staffTouched: true, ordersTouched: true, promoTouched: true, ...initial.input } : {}) };
  });
  const [savedId, setSavedId] = React.useState(initial?.id || null);
  const [savedNo, setSavedNo] = React.useState(initial?.no || "");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (initial) { setInp({ ...BLANK_INPUT, seeded: true, staffTouched: true, ordersTouched: true, promoTouched: true, ...(initial.input || {}) }); setSavedId(initial.id || null); setSavedNo(initial.no || ""); } }, [initial]);
  // 새 견적 — 요금제 관리의 추천 요금제(없으면 첫 요금제)와 그 포함량으로 시작
  React.useEffect(() => {
    if (!cfg || inp.seeded) return;
    const rec = cfg.plans.find((p) => p.recommended) || cfg.plans[0];
    setInp((p) => ({ ...p, seeded: true, ...(rec ? { planId: rec.id, ...planDefaultsFor(rec, p) } : {}) }));
  }, [cfg, inp.seeded]);
  if (!cfg) return <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>;
  const set = (patch) => setInp((p) => ({ ...p, ...patch }));
  const selectPlan = (id) => setInp((p) => ({ ...p, planId: id, ...planDefaultsFor(cfg.plans.find((x) => x.id === id), p) }));
  const q = quoteOf(cfg, inp);
  if (!q) return <div className="py-20 text-center text-[#9AA9C3]">요금제가 없습니다 — 요금제 관리에서 먼저 추가해 주세요.</div>;
  const save = async () => {
    if (!inp.customer.trim()) { window.alert("고객사명을 입력해 주세요."); return; }
    setBusy(true);
    try {
      const data = { input: inp, pricing: cfg, customer: inp.customer.trim(), plan: q.chosen.plan.name, monthly: q.monthly, oneTime: q.oneTimeTotal, firstYear: q.firstYear, updatedAt: serverTimestamp() };
      if (savedId) await updateDoc(doc(db, "salesQuotes", savedId), data);
      else {
        const d = new Date();
        const no = `Q-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${String(d.getHours() * 60 + d.getMinutes()).padStart(4, "0")}`;
        const ref = await addDoc(collection(db, "salesQuotes"), { ...data, no, status: "작성", createdAt: serverTimestamp() });
        setSavedId(ref.id); setSavedNo(no);
      }
      onSaved?.();
    } catch (e) { window.alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const L = ({ children }) => <div className="text-[12.5px] font-bold text-[#7A879C] mb-1">{children}</div>;
  const Seg = ({ v, items, k, stack = false }) => (
    <div className={`flex gap-1 p-1 rounded-xl bg-[#EEF2F8] ${stack ? "flex-col sm:flex-row" : ""}`}>{items.map(([val, label]) => (
      <button key={val} type="button" onClick={() => (k === "planId" ? selectPlan(val) : set({ [k]: val }))} className={`flex-1 h-8 px-1 rounded-lg text-[12.5px] sm:text-[13px] font-black whitespace-nowrap ${String(v) === String(val) ? "bg-[#1B2B4B] text-white" : "text-[#3A4A66]"}`}>{label}</button>))}</div>
  );
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] items-start">
      {/* 입력 */}
      <div className="space-y-4">
        <Card code="CUSTOMER" title="고객사" right={savedNo ? <span className="text-[12px] font-extrabold text-[#5B6B85]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{savedNo}</span> : null}>
          <div className="space-y-2.5">
            <div><L>고객사명 *</L><input value={inp.customer} onChange={(e) => set({ customer: e.target.value })} className={inpCls} placeholder="(주)○○로지스" /></div>
            <div className="grid grid-cols-2 gap-2"><div><L>담당자</L><input value={inp.contact} onChange={(e) => set({ contact: e.target.value })} className={inpCls} /></div>
              <div><L>연락처</L><input value={inp.phone} inputMode="tel" placeholder="010-0000-0000" onChange={(e) => set({ phone: fmtPhone(e.target.value) })} className={inpCls} /></div></div>
          </div>
        </Card>
        <Card code="USAGE" title="사용 규모" right={(inp.staffTouched || inp.ordersTouched) && q.chosen ? <button type="button" onClick={() => setInp((p) => ({ ...p, staffTouched: false, ordersTouched: false, staff: num(q.chosen.plan.seats), orders: num(q.chosen.plan.orders) }))} className="h-8 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#1B2B4B] whitespace-nowrap">↺ {q.chosen.plan.name} 포함량으로</button> : null}>
          <div className="space-y-2">
            {[["staff", "직원 계정 수", "명"], ["orders", "월 예상 오더", "건"], ["fleet", "지입차(GPS 관리) 대수", "대"], ["storageGB", "예상 사진·파일 용량", "GB"]].map(([k, l, u]) => (
              <div key={k} className="flex items-center justify-between gap-3"><span className="text-[14px] font-bold text-[#3A4A66]">{l}</span><NumIn value={inp[k]} onChange={(v) => set({ [k]: v, ...(k === "staff" ? { staffTouched: true } : k === "orders" ? { ordersTouched: true } : {}) })} unit={u} w="w-28" /></div>
            ))}
            <div className="text-[12px] text-[#9AA9C3]">요금제를 고르면 직원·오더는 그 요금제 포함량으로 채워집니다(직접 고친 칸은 유지). 포함량을 넘으면 초과 요금이 붙습니다. 일반 기사의 기사앱 · 화주사 포털은 무료.</div>
          </div>
        </Card>
        <Card code="PLAN" title="요금제 · 계약">
          <div className="space-y-3">
            <div><L>요금제</L><Seg k="planId" v={inp.planId} items={[["auto", "자동 추천"], ...cfg.plans.map((p) => [p.id, p.name])]} /></div>
            <div><L>약정 (최소 {num(cfg.minContractMonths ?? 6)}개월)</L><Seg k="contractMonths" v={inp.contractMonths} items={[[6, "6개월"], [12, "12개월"], [24, "24개월"]]} /></div>
            <div><L>결제</L><Seg k="billing" stack v={inp.billing} items={[["monthly", "월 결제"], ["semi", `6개월 선결제 (-${num(cfg.semiDiscountRate)}%)`], ["annual", `연간 선결제 (${cfg.annualFreeMonths}개월 무료)`]]} /></div>
          </div>
        </Card>
        <Card code="ONE-TIME" title="초기 비용 · 할인">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2"><span className="text-[13px] font-bold text-[#5B6B85]">{q.chosen.plan.name} 초기 도입비 정가</span><b className="text-[14.5px] text-[#0F1A30]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won(planSetupFee(q.chosen.plan, cfg))}</b></div>
            <label className="flex items-center gap-2 text-[14px] font-bold text-[#3A4A66]"><input type="checkbox" checked={inp.waiveSetup} onChange={(e) => set({ waiveSetup: e.target.checked })} />도입비 면제 ({cfg.waiveSetupMonths}개월 이상 약정 시)</label>
            {inp.waiveSetup && num(inp.contractMonths) < num(cfg.waiveSetupMonths) && <div className="text-[12px] font-bold text-[#1B2B4B]">※ {cfg.waiveSetupMonths}개월 미만 약정이라 면제 대신 도입비 {num(cfg.semiSetupRate)}% 할인이 적용됩니다.</div>}
            <label className="flex items-center gap-2 text-[14px] font-bold text-[#3A4A66]"><input type="checkbox" checked={inp.migration} onChange={(e) => set({ migration: e.target.checked })} />대량 데이터 이전 (+{won(cfg.migrationFee)})</label>
            <div className="flex items-center justify-between"><span className="text-[14px] font-bold text-[#3A4A66]">추가 현장 교육</span><NumIn value={inp.training} onChange={(v) => set({ training: v })} unit="회" w="w-20" /></div>
            <div className="flex items-center justify-between"><span className="text-[14px] font-bold text-[#3A4A66]">맞춤 개발</span><NumIn value={inp.devDays} onChange={(v) => set({ devDays: v })} unit="일" w="w-20" /></div>
            {num(inp.devDays) > 0 && <input value={inp.devDesc} onChange={(e) => set({ devDesc: e.target.value })} className={inpCls} placeholder="개발 내용 (예: 기존 ERP 연동)" />}
            <div className="pt-2 border-t border-[#EEF1F6]"><L>도입 프로모션 (첫 N개월 할인)</L>
              <div className="flex items-center gap-2"><NumIn value={inp.promoMonths} onChange={(v) => set({ promoMonths: v, promoTouched: true })} unit="개월" w="w-16" /><NumIn value={inp.promoRate} onChange={(v) => set({ promoRate: Math.min(100, v), promoTouched: true })} unit="%" w="w-16" /></div>
              <div className="flex gap-1.5 mt-2">{[[0, 0, "없음"], [1, 100, "첫 달 무료"], [3, 50, "3개월 50%"]].map(([m, r, l]) => (
                <button key={l} type="button" onClick={() => set({ promoMonths: m, promoRate: r, promoTouched: true })} className={`h-8 px-3 rounded-lg text-[12.5px] font-black border ${num(inp.promoMonths) === m && num(inp.promoRate) === r ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-[#DCE3EE] text-[#3A4A66]"}`}>{l}</button>))}</div>
            </div>
            <div className="flex items-center justify-between"><span className="text-[14px] font-bold text-[#3A4A66]">특별 할인 (1년차 금액에서)</span><NumIn value={inp.extraDiscount} onChange={(v) => set({ extraDiscount: v })} unit="원" /></div>
            <div><L>견적서 특약 (선택)</L><input value={inp.memo} onChange={(e) => set({ memo: e.target.value })} className={inpCls} placeholder="예: 사용 후기·사례 공개 동의 조건" /></div>
          </div>
        </Card>
      </div>

      {/* 결과 */}
      <div className="space-y-4 xl:sticky xl:top-4">
        <div className="rounded-[20px] p-5 text-white shadow-[0_16px_34px_rgba(11,20,40,0.3)]" style={{ background: "linear-gradient(rgba(143,176,240,.05) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.05) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(150deg,#0B1428,#16264A)" }}>
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0] whitespace-nowrap shrink-0" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>QUOTE · {q.chosen.plan.en || q.chosen.plan.name}</div>
            <div className="text-[12.5px] text-white/60 truncate whitespace-nowrap">{inp.customer || "고객사"} · {q.chosen.plan.name} 요금제{inp.planId === "auto" ? " (자동 추천)" : ""}</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
            {[["월 이용료", q.monthly, true], ["초기 비용", q.oneTimeTotal], [`${q.periodLabel} 총액`, q.firstYear]].map(([l, v, on]) => (
              <div key={l} className={`rounded-xl px-3.5 py-2.5 sm:py-3 border flex sm:block items-center justify-between gap-3 ${on ? "border-[#8FB0F0]/45" : "border-[#8FB0F0]/15"}`} style={{ background: on ? "linear-gradient(140deg, rgba(75,108,183,.55), rgba(45,76,130,.25))" : "rgba(255,255,255,.04)" }}>
                <div className="text-[12px] font-bold text-white/60 whitespace-nowrap">{l}</div>
                <div className="text-[20px] sm:text-[22px] font-black mt-0.5 whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won(v)}</div>
              </div>
            ))}
          </div>
          <div className="mt-2.5 text-[12.5px] text-white/60">VAT 포함 {q.periodLabel} {won(q.firstYear + q.vat)} · 평균 월 {won(q.avgMonthly)}</div>
          <div className="mt-4 flex gap-2 flex-wrap">
            <button type="button" onClick={() => openPrint(`견적서_${inp.customer || "고객사"}`, quoteHtml(cfg, inp, q, savedNo))} className="h-10 px-5 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black">견적서 보기 · 인쇄</button>
            <button type="button" onClick={save} disabled={busy} className="h-10 px-5 rounded-xl bg-white/10 ring-1 ring-white/25 text-white text-[13.5px] font-black disabled:opacity-50">{busy ? "저장 중…" : savedId ? "견적 수정 저장" : "견적 저장"}</button>
            <button type="button" onClick={() => { setInp({ ...BLANK_INPUT }); setSavedId(null); setSavedNo(""); }} className="h-10 px-4 rounded-xl text-white/70 text-[13px] font-bold hover:text-white">새 견적</button>
          </div>
        </div>

        <Card code="COMPARE" title="요금제별 비교 (이 고객 기준)">
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 min-[1800px]:grid-cols-4">
            {q.byPlan.map(({ plan, m }) => {
              const on = plan.id === q.chosen.plan.id, best = plan.id === q.best.plan.id;
              return (
                <button key={plan.id} type="button" onClick={() => selectPlan(plan.id)} className={`text-left rounded-xl p-3.5 border-2 transition ${on ? "border-[#1B2B4B] bg-[#F5F8FD]" : "border-[#E3E8F0] hover:border-[#8FB0F0]"}`}>
                  <div className="flex items-center justify-between gap-2"><b className="text-[15px] text-[#0F1A30] whitespace-nowrap">{plan.name}</b>{best && <span className="px-1.5 py-0.5 rounded-md bg-[#1B2B4B] text-white text-[10.5px] font-black whitespace-nowrap">이 고객 최저가</span>}</div>
                  {/* ⭐ 2026-11-02 관리자센터2 — 큰 숫자 = 요금제 관리의 정가. 이 고객 규모로 초과 요금이 붙으면 아래 줄에 따로 */}
                  <div className="text-[13px] font-bold text-[#5B6B85] mt-1 truncate whitespace-nowrap">{num(plan.seats)}명 · 오더 {num(plan.orders).toLocaleString()}건 포함</div>
                  <div className="text-[22px] font-black text-[#1B2B4B] mt-1 whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won(m.base)}<span className="text-[12.5px] font-bold text-[#7A879C] ml-1">/ 월 정가</span></div>
                  <div className={`text-[12.5px] leading-relaxed mt-1.5 ${m.total !== m.base ? "text-[#1B2B4B] font-bold" : "text-[#7A879C]"}`}>
                    {m.total !== m.base
                      ? <>이 규모면 월 <b style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won(m.total)}</b> · {[m.seats ? `계정 +${Math.max(0, num(inp.staff) - num(plan.seats))}명 ${won(m.seats)}` : "", m.orders ? `오더 +${Math.max(0, num(inp.orders) - num(plan.orders)).toLocaleString()}건 ${won(m.orders)}` : "", m.fleet ? `지입 ${won(m.fleet)}` : "", m.storage ? `저장 ${won(m.storage)}` : ""].filter(Boolean).join(" + ")}</>
                      : "이 규모면 추가 요금 없음"}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 text-[12px] text-[#7A879C]">카드를 누르면 그 요금제로 견적이 바뀌고, 사용 규모·프로모션이 그 요금제 기본값으로 채워집니다. 큰 숫자는 요금제 관리의 정가이며, 포함된 계정·오더를 넘는 만큼만 초과 요금이 붙습니다.</div>
        </Card>

        <Card code="DETAIL" title={`${q.periodLabel} 계산 내역`}>
          <table className="kp-pm-keep w-full text-[14px]">
            <tbody>
              {[
                [`이용료 ${q.paidMonths}개월${q.free ? ` (연간 선결제 ${q.free}개월 무료)` : ""}`, q.monthly * q.paidMonths],
                ...(q.promoDiscount ? [[`프로모션 첫 ${q.promoMonths}개월 ${num(inp.promoRate)}% 할인`, -q.promoDiscount]] : []),
                ...(q.semiDiscount ? [[`6개월 선결제 할인 ${num(cfg.semiDiscountRate)}%`, -q.semiDiscount]] : []),
                ...(q.extraDiscount ? [["특별 할인", -q.extraDiscount]] : []),
                ...q.oneTime.map((x) => [`${x.label}${x.waived ? " (약정 면제)" : ""}`, x.amount]),
              ].map(([l, v]) => (
                <tr key={l} className="border-t border-[#EEF1F6]"><td className="py-2 text-[#3A4A66] font-semibold">{l}</td><td className="py-2 text-right font-black text-[#0F1A30]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{v < 0 ? `- ${won(-v)}` : won(v)}</td></tr>
              ))}
              <tr className="border-t-2 border-[#1B2B4B]"><td className="py-2.5 font-black text-[#0F1A30]">{q.periodLabel} 합계 (VAT 별도)</td><td className="py-2.5 text-right font-black text-[16px] text-[#1B2B4B]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won(q.firstYear)}</td></tr>
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════ ③ 견적 이력 ═══════════════════════════
const STATUSES = ["작성", "발송", "협의 중", "계약", "보류", "실패"];
export function QuoteHistory({ onOpen, onContract }) {
  const cfg = useSalesPricing();
  const [list, setList] = React.useState(null);
  React.useEffect(() => onSnapshot(query(collection(db, "salesQuotes"), orderBy("createdAt", "desc")), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([])), []);
  if (!list) return <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>;
  const won2 = (n) => Math.round(n || 0).toLocaleString();
  const sum = (st) => list.filter((x) => x.status === st).reduce((a, x) => a + (x.monthly || 0), 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["전체 견적", `${list.length}건`], ["진행 중(발송·협의)", `${list.filter((x) => ["발송", "협의 중"].includes(x.status)).length}건`], ["계약", `${list.filter((x) => x.status === "계약").length}건`], ["계약 월 매출(MRR)", `${won2(sum("계약"))}원`]].map(([l, v], i) => (
          <div key={l} className={`rounded-[16px] px-4 py-3.5 border ${i === 3 ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white border-[#E3E8F0]"}`}>
            <div className={`text-[12.5px] font-bold ${i === 3 ? "text-white/60" : "text-[#7A879C]"}`}>{l}</div>
            <div className="text-[22px] font-black mt-0.5" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{v}</div>
          </div>
        ))}
      </div>
      <Card code="HISTORY" title="견적 이력">
        {list.length === 0 ? <div className="py-12 text-center text-[#9AA9C3]">저장한 견적이 없습니다 — 견적서 작성에서 '견적 저장'을 누르면 여기에 쌓입니다.</div> : (
          <div className="overflow-x-auto -m-5">
            <table className="w-full text-[14px] border-collapse" style={{ minWidth: 960 }}>
              <thead><tr className="bg-[#1B2B4B] text-white">{["견적번호", "고객사", "요금제", "월 이용료", "초기 비용", "1년차 총액", "상태", "작성일", ""].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {list.map((x) => (
                  <tr key={x.id} className="border-t border-[#EEF1F6] hover:bg-[#F5F8FD]">
                    <td className="px-3 py-2 text-center text-[12.5px] text-[#5B6B85]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{x.no}</td>
                    <td className="px-3 py-2 font-black text-[#0F1A30]">{x.customer}</td>
                    <td className="px-3 py-2 text-center">{x.plan}</td>
                    <td className="px-3 py-2 text-right font-black" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won2(x.monthly)}</td>
                    <td className="px-3 py-2 text-right" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won2(x.oneTime)}</td>
                    <td className="px-3 py-2 text-right" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won2(x.firstYear)}</td>
                    <td className="px-3 py-2 text-center">
                      <CustomSelect value={x.status || "작성"} onChange={(e) => updateDoc(doc(db, "salesQuotes", x.id), { status: e.target.value }).catch((er) => window.alert(er.message))}
                        className={`h-8 px-2 rounded-lg border text-[13px] font-black ${x.status === "계약" ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-[#DCE3EE] text-[#1B2B4B]"}`}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </CustomSelect>
                    </td>
                    <td className="px-3 py-2 text-center text-[12.5px] text-[#7A879C]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{x.createdAt?.toDate ? ymd(x.createdAt.toDate()) : "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <button type="button" onClick={() => onOpen?.(x)} className="h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black mr-1">열기</button>
                      {onContract && <button type="button" onClick={() => onContract(x)} className="h-8 px-3 rounded-lg border border-[#1B2B4B] text-[12.5px] font-black text-[#1B2B4B] mr-1">계약서 만들기</button>}
                      <button type="button" onClick={() => { const c = x.pricing ? mergeDefaults(x.pricing) : cfg; if (!c) return; const inp = { ...BLANK_INPUT, ...x.input }; const q = quoteOf(c, inp); q && openPrint(`견적서_${x.customer}`, quoteHtml(c, inp, q, x.no)); }} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B] mr-1">인쇄</button>
                      <button type="button" onClick={async () => (await kpConfirm(`${x.customer} 견적(${x.no})을 삭제할까요?`)) && runDelete({ label: "견적", task: () => deleteDoc(doc(db, "salesQuotes", x.id)) }).catch(() => {})} /* ⭐ 2026-11-05 삭제 진행 창 */ className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-bold text-[#7A879C]">삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 text-[12px] text-[#9AA9C3]">※ 인쇄는 저장 당시의 요금제로 똑같이 다시 뽑습니다. '열기'로 불러와 고치면 현재 요금제로 다시 계산됩니다.</div>
      </Card>
    </div>
  );
}
