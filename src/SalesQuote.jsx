// ======================= src/SalesQuote.jsx =======================
// 💼 관리센터 › 영업(2026-10-29, 최고관리자 전용) — 요금제를 언제든 고치고, 그 요금제로 고객사 견적서를 만든다.
//  - 요금제·옵션·조건: siteConfig/salesPricing 한 문서(최고관리자만 읽기/쓰기)
//  - 저장한 견적: salesQuotes 컬렉션(최고관리자만) — 다시 열어 고치거나 인쇄(PDF 저장)
//  - "요금·청구"(가입사 월 청구 계산, siteConfig/platformPricing)와는 별개 — 그쪽은 이미 쓰는 고객 청구용, 이쪽은 영업 제안용.
//  ⭐ 알록달록 금지 — 네이비 계열만.
import React from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const NAVY = "#1B2B4B";
const won = (n) => `${Math.round(Number(n) || 0).toLocaleString()}원`;
const num = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ─── 기본 요금제(처음 한 번 — 이후엔 화면에서 고친 값이 저장되어 쓰인다) ───
export const SALES_DEFAULT = {
  plans: [
    { id: "basic", name: "베이직", en: "BASIC", price: 99000, seats: 3, orders: 1000, target: "소규모 주선사 · 1~3인",
      features: ["배차관리 · 실시간 배차현황", "거래처 · 하차지 · 기사 관리", "단가표 · 전국 운임조회", "기사앱(일반 기사 무료)", "PC · 모바일 동시 사용"] },
    { id: "standard", name: "스탠다드", en: "STANDARD", price: 199000, seats: 10, orders: 3000, target: "일반 운송사 · 4~10인", recommended: true,
      features: ["베이직 전체 기능", "화주사 전용 포털(화주 무료)", "매출관리 · 정산 · 지급관리", "전자결재 · 사내메일 · 게시판", "인사 · 출근기록 관리"] },
    { id: "pro", name: "프로", en: "PRO", price: 349000, seats: 25, orders: 8000, target: "중견 운송사 · 10인 이상",
      features: ["스탠다드 전체 기능", "우선 기술지원(당일 응대)", "맞춤 리포트 · 데이터 추출", "분기별 운영 점검 미팅", "신규 기능 우선 적용"] },
  ],
  extraSeat: 15000,          // 추가 직원 계정 1명/월
  extraOrder: 50,            // 포함량 초과 오더 1건
  fleetPerVehicle: 7000,     // 지입차 관리(GPS·운행기록·사진) 1대/월
  setupFee: 500000,          // 초기 도입비(세팅·기본 데이터 이전·교육 1회)
  migrationFee: 300000,      // 대량 데이터 이전(기존 프로그램 이관)
  trainingFee: 200000,       // 추가 현장 교육 1회
  waiveSetupMonths: 12,      // 이 기간 이상 약정 시 도입비 면제
  annualFreeMonths: 2,       // 연간 선결제 시 무료 개월
  storageGB: 10,             // 사진·파일 기본 제공 용량
  storagePerGB: 3000,        // 초과 1GB/월
  devDayRate: 400000,        // 맞춤 개발 1일 단가
  validDays: 30,             // 견적 유효기간
  messaging: "문자 · 알림톡은 발송 건수만큼 실비 청구",
  supplier: { name: "KP-Flow", ceo: "", bizNo: "", phone: "", email: "", address: "", bank: "" },
  terms: [
    "모든 금액은 부가세 별도입니다.",
    "일반 기사의 기사앱 사용과 화주사 포털 사용은 무료입니다.",
    "데이터의 소유권은 고객사에 있으며, 해지 시 엑셀로 전체 데이터를 제공합니다.",
    "데이터는 매일 자동 백업되며, 장애 접수 시 영업일 기준 당일 응대합니다.",
    "약정 기간 중 요금제 상향은 언제든 가능하며 차액만 청구합니다.",
  ],
};
const mergeDefaults = (v) => ({ ...SALES_DEFAULT, ...(v || {}), supplier: { ...SALES_DEFAULT.supplier, ...(v?.supplier || {}) }, plans: v?.plans?.length ? v.plans : SALES_DEFAULT.plans, terms: v?.terms?.length ? v.terms : SALES_DEFAULT.terms });

// ─── 계산 ───
export function monthlyOf(plan, cfg, inp) {
  const seats = Math.max(0, num(inp.staff) - num(plan.seats)) * num(cfg.extraSeat);
  const orders = Math.max(0, num(inp.orders) - num(plan.orders)) * num(cfg.extraOrder);
  const fleet = num(inp.fleet) * num(cfg.fleetPerVehicle);
  const storage = Math.max(0, num(inp.storageGB) - num(cfg.storageGB)) * num(cfg.storagePerGB);
  return { base: num(plan.price), seats, orders, fleet, storage, total: num(plan.price) + seats + orders + fleet + storage };
}
export function quoteOf(cfg, inp) {
  const plans = cfg.plans || [];
  const byPlan = plans.map((p) => ({ plan: p, m: monthlyOf(p, cfg, inp) }));
  const best = byPlan.reduce((a, x) => (!a || x.m.total < a.m.total ? x : a), null);
  const chosen = byPlan.find((x) => x.plan.id === inp.planId) || best;
  if (!chosen) return null;
  const months = Math.max(1, num(inp.contractMonths) || 12);
  const waived = !!inp.waiveSetup && months >= num(cfg.waiveSetupMonths);
  const oneTime = [
    { label: "초기 도입비", note: "계정 세팅 · 기본 데이터 이전 · 교육 1회", amount: waived ? 0 : num(cfg.setupFee), list: num(cfg.setupFee), waived },
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
  const extraDiscount = num(inp.extraDiscount);
  const firstYearUse = monthly * paidMonths - promoDiscount - extraDiscount;
  const firstYear = Math.max(0, firstYearUse) + oneTimeTotal;
  return { byPlan, best, chosen, monthly, oneTime, oneTimeTotal, waived, year, free, paidMonths, promoMonths, promoDiscount, extraDiscount, firstYearUse: Math.max(0, firstYearUse), firstYear, vat: Math.round(firstYear * 0.1), avgMonthly: Math.round(firstYear / year) };
}

// ─── 인쇄용 문서(새 창 → 인쇄 / PDF로 저장) ───
const DOC_CSS = `
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
    ...(m.fleet ? [["지입차 관리", `${num(inp.fleet)}대 × ${won(cfg.fleetPerVehicle)} (GPS · 운행기록 · 사진)`, num(inp.fleet), m.fleet]] : []),
    ...(m.storage ? [["추가 저장 용량", `${num(inp.storageGB) - num(cfg.storageGB)}GB × ${won(cfg.storagePerGB)}`, "", m.storage]] : []),
  ];
  const trs = (list) => list.map(([a, b, c, d]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td class="c">${c === "" ? "-" : c}</td><td class="r mono">${won(d)}</td></tr>`).join("");
  const once = q.oneTime.map((x) => `<tr><td>${esc(x.label)}</td><td>${esc(x.note)}${x.waived ? ` <b>— ${cfg.waiveSetupMonths}개월 이상 약정으로 면제 (정가 ${won(x.list)})</b>` : ""}</td><td class="c">1</td><td class="r mono">${won(x.amount)}</td></tr>`).join("");
  return `<div class="page">
    <div class="hero"><div><div class="eyebrow">KP-FLOW · QUOTATION</div><h1>견 적 서</h1></div>
      <div style="text-align:right;font-size:12px;line-height:1.7"><div class="mono">No. ${esc(no || "미저장")}</div><div>견적일 ${today}</div><div>유효기간 ${addDays(today, num(cfg.validDays))}까지</div></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
      <table><tr><th style="width:84px">수신</th><td><b style="font-size:15px">${esc(inp.customer || "-")}</b> 귀중</td></tr>
        ${inp.contact ? `<tr><th>담당자</th><td>${esc(inp.contact)}</td></tr>` : ""}${inp.phone ? `<tr><th>연락처</th><td>${esc(inp.phone)}</td></tr>` : ""}
        <tr><th>사용 규모</th><td>직원 ${num(inp.staff)}명 · 월 오더 ${num(inp.orders).toLocaleString()}건${num(inp.fleet) ? ` · 지입차 ${num(inp.fleet)}대` : ""}</td></tr>
        <tr><th>계약 조건</th><td>${num(inp.contractMonths)}개월 약정 · ${inp.billing === "annual" ? `연간 선결제(${q.free}개월 무료)` : "월 결제"}</td></tr></table>
      <table>${supplierRows(cfg.supplier)}</table>
    </div>
    <div class="sum">
      <div class="on"><span>월 이용료</span><b>${won(q.monthly)}</b></div>
      <div><span>초기 비용(1회)</span><b>${won(q.oneTimeTotal)}</b></div>
      <div><span>1년차 총액 (VAT 별도)</span><b>${won(q.firstYear)}</b></div>
    </div>
    <h3>월 이용료</h3>
    <table><thead><tr><th style="width:24%">항목</th><th>내용</th><th style="width:8%">수량</th><th style="width:18%">월 금액</th></tr></thead><tbody>${trs(rows)}
      <tr><th colspan="3">월 이용료 합계</th><th class="r mono">${won(q.monthly)}</th></tr></tbody></table>
    <h3>초기 비용 (1회)</h3>
    <table><thead><tr><th style="width:24%">항목</th><th>내용</th><th style="width:8%">수량</th><th style="width:18%">금액</th></tr></thead><tbody>${once}
      <tr><th colspan="3">초기 비용 합계</th><th class="r mono">${won(q.oneTimeTotal)}</th></tr></tbody></table>
    <h3>1년차 예상 비용</h3>
    <table><tbody>
      <tr><td>이용료 ${q.paidMonths}개월${q.free ? ` (연간 선결제 ${q.free}개월 무료)` : ""}</td><td class="r mono" style="width:30%">${won(q.monthly * q.paidMonths)}</td></tr>
      ${q.promoDiscount ? `<tr><td>도입 프로모션 — 첫 ${q.promoMonths}개월 ${num(inp.promoRate)}% 할인</td><td class="r mono">- ${won(q.promoDiscount)}</td></tr>` : ""}
      ${q.extraDiscount ? `<tr><td>특별 할인</td><td class="r mono">- ${won(q.extraDiscount)}</td></tr>` : ""}
      <tr><td>초기 비용</td><td class="r mono">${won(q.oneTimeTotal)}</td></tr>
      <tr><th>1년차 합계 (VAT 별도)</th><th class="r mono">${won(q.firstYear)}</th></tr>
      <tr><td>부가세 10%</td><td class="r mono">${won(q.vat)}</td></tr>
      <tr><th>1년차 합계 (VAT 포함)</th><th class="r mono" style="font-size:15px">${won(q.firstYear + q.vat)}</th></tr>
      <tr><td colspan="2" style="color:#5B6B85">→ 1년 평균 월 ${won(q.avgMonthly)} (VAT 별도)</td></tr>
    </tbody></table>
    <h3>${esc(p.name)} 요금제 포함 기능</h3><ul>${(p.features || []).map((f) => `<li>${esc(f)}</li>`).join("")}<li>${esc(cfg.messaging)}</li><li>사진 · 파일 저장 ${num(cfg.storageGB)}GB 기본 제공</li></ul>
    <h3>계약 조건</h3><ul>${(cfg.terms || []).map((t) => `<li>${esc(t)}</li>`).join("")}${inp.memo ? `<li><b>${esc(inp.memo)}</b></li>` : ""}</ul>
    <div class="foot"><span>KP-FLOW · LOGISTICS DISPATCH SYSTEM</span><span>${esc(cfg.supplier.name)}</span></div>
  </div>`;
}
export function priceSheetHtml(cfg) {
  const plans = cfg.plans.map((p) => `<div class="plan ${p.recommended ? "rec" : ""}"><div class="eyebrow">${esc(p.en || "")}</div>
      <div style="margin-top:2px"><b style="font-size:17px">${esc(p.name)}</b>${p.recommended ? '<span class="tag">추천</span>' : ""}</div>
      <div class="p" style="margin-top:2px">${won(p.price)}<span style="font-size:11px;color:#5B6B85"> /월</span></div>
      <div style="font-size:12px;color:#5B6B85;margin:2px 0 6px">${esc(p.target || "")} · 직원 ${p.seats}명 · 오더 월 ${num(p.orders).toLocaleString()}건 포함</div>
      <ul>${(p.features || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>`).join("");
  const opt = [["추가 직원 계정", `1명당 월 ${won(cfg.extraSeat)}`], ["초과 오더", `1건당 ${won(cfg.extraOrder)}`], ["지입차 관리(GPS·운행기록·사진)", `1대당 월 ${won(cfg.fleetPerVehicle)}`], ["일반 기사 기사앱 · 화주사 포털", "무료"],
    ["추가 저장 용량", `${cfg.storageGB}GB 기본 · 초과 1GB당 월 ${won(cfg.storagePerGB)}`], ["문자 · 알림톡", "발송 건수만큼 실비"]];
  const once = [["초기 도입비", `${won(cfg.setupFee)} — ${cfg.waiveSetupMonths}개월 이상 약정 시 면제`], ["대량 데이터 이전", won(cfg.migrationFee)], ["추가 현장 교육", `1회 ${won(cfg.trainingFee)}`], ["맞춤 개발", `1일 ${won(cfg.devDayRate)}`], ["연간 선결제", `${cfg.annualFreeMonths}개월 무료`]];
  const t = (rows) => `<table><tbody>${rows.map(([a, b]) => `<tr><th style="width:42%">${a}</th><td>${b}</td></tr>`).join("")}</tbody></table>`;
  return `<div class="page">
    <div class="hero"><div><div class="eyebrow">KP-FLOW · PRICING</div><h1>요 금 안 내</h1></div><div style="font-size:12px;text-align:right">${ymd()} 기준 · 부가세 별도</div></div>
    <h3>요금제</h3><div class="plans" style="grid-template-columns:repeat(${Math.min(3, cfg.plans.length)},1fr)">${plans}</div>
    <h3>추가 옵션 (월)</h3>${t(opt)}<h3>1회 비용 · 결제 혜택</h3>${t(once)}
    <h3>안내</h3><ul>${(cfg.terms || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <div class="foot"><span>KP-FLOW · LOGISTICS DISPATCH SYSTEM</span><span>${esc(cfg.supplier.name)}</span></div></div>`;
}

// ─── 공용 부품 ───
const inpCls = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#4B6CB7]";
function Card({ code, title, right, children, className = "" }) {
  return (
    <div className={`bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)] overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-3 px-5 h-[50px] bg-[#F7F9FC] border-b border-[#E8EDF4]">
        <div className="flex items-center gap-2 min-w-0"><span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" />
          <span className="text-[10.5px] font-extrabold tracking-[0.2em] text-[#94A3B8]" style={{ fontFamily: MONO }}>{code}</span>
          <span className="text-[16px] font-black text-[#0F1A30] truncate">{title}</span></div>
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
        className={`h-9 ${w} px-2.5 rounded-lg border border-[#DCE3EE] text-right text-[14.5px] font-black text-[#1B2B4B] outline-none focus:border-[#4B6CB7]`} style={{ fontFamily: MONO }} />
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
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => { if (live && !dirty) setCfg(live); }, [live, dirty]);
  if (!cfg) return <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>;
  const set = (patch) => { setCfg((c) => ({ ...c, ...patch })); setDirty(true); };
  const setPlan = (i, patch) => set({ plans: cfg.plans.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const save = async () => {
    try { await setDoc(doc(db, "siteConfig", "salesPricing"), { ...cfg, updatedAt: serverTimestamp() }); setDirty(false); setMsg("저장했습니다. 새로 만드는 견적서부터 바로 적용됩니다."); }
    catch (e) { setMsg(`저장 실패: ${e.message}`); }
  };
  const OPTS = [
    ["월 추가 옵션", [["extraSeat", "추가 직원 계정 (1명/월)", "원"], ["extraOrder", "포함량 초과 오더 (1건)", "원"], ["fleetPerVehicle", "지입차 관리 (1대/월)", "원"], ["storageGB", "기본 저장 용량", "GB"], ["storagePerGB", "초과 저장 (1GB/월)", "원"]]],
    ["1회 비용 · 혜택", [["setupFee", "초기 도입비", "원"], ["waiveSetupMonths", "도입비 면제 약정 기간", "개월"], ["migrationFee", "대량 데이터 이전", "원"], ["trainingFee", "추가 현장 교육 (1회)", "원"], ["devDayRate", "맞춤 개발 (1일)", "원"], ["annualFreeMonths", "연간 선결제 무료", "개월"], ["validDays", "견적 유효기간", "일"]]],
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-[18px] px-5 py-3.5 bg-[#0F1A30] text-white">
        <div className="text-[13.5px]"><b>요금제는 여기서만 고치면 됩니다.</b> <span className="text-white/60">견적서·요금 안내서가 이 값을 그대로 씁니다. (기존 고객 청구액은 '요금·청구'에서 따로 관리)</span></div>
        <div className="flex gap-2">
          <Btn onClick={() => openPrint("KP-Flow 요금 안내", priceSheetHtml(cfg))}>요금 안내서 인쇄</Btn>
          <Btn onClick={() => { if (window.confirm("저장하지 않은 수정을 버리고 마지막 저장값으로 돌릴까요?")) { setDirty(false); setCfg(live); } }} disabled={!dirty}>되돌리기</Btn>
          <button type="button" onClick={save} disabled={!dirty} className="h-10 px-5 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black disabled:opacity-40">{dirty ? "저장" : "저장됨"}</button>
        </div>
      </div>
      {msg && <div className="rounded-xl border border-[#DCE3EE] bg-white px-4 py-2.5 text-[13px] font-bold text-[#1B2B4B]">{msg}</div>}

      {/* 요금제 표 — 열 = 요금제 */}
      <Card code="PLANS" title="요금제" right={<Btn onClick={() => set({ plans: [...cfg.plans, { id: `p${Date.now()}`, name: "새 요금제", en: "PLAN", price: 0, seats: 1, orders: 500, target: "", features: [] }] })}>+ 요금제 추가</Btn>}>
        <div className="overflow-x-auto -m-5">
          <table className="w-full border-collapse text-[14px]" style={{ minWidth: 220 + cfg.plans.length * 230 }}>
            <thead><tr>
              <th className="bg-[#1B2B4B] text-white text-left px-4 py-2.5 w-[200px]">항목</th>
              {cfg.plans.map((p, i) => (
                <th key={p.id} className="bg-[#1B2B4B] text-white px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <input value={p.name} onChange={(e) => setPlan(i, { name: e.target.value })} className="h-8 w-full px-2 rounded-md bg-white/10 text-white font-black text-[14px] outline-none" />
                    <button type="button" title="요금제 삭제" onClick={() => cfg.plans.length > 1 && window.confirm(`'${p.name}' 요금제를 지울까요?`) && set({ plans: cfg.plans.filter((_, k) => k !== i) })} className="text-white/50 hover:text-white">✕</button>
                  </div>
                </th>
              ))}
            </tr></thead>
            <tbody>
              {[
                ["영문 표기", (p, i) => <input value={p.en || ""} onChange={(e) => setPlan(i, { en: e.target.value.toUpperCase() })} className={`${inpCls} h-9`} style={{ fontFamily: MONO }} />],
                ["월 기본료", (p, i) => <NumIn value={p.price} onChange={(v) => setPlan(i, { price: v })} unit="원" />],
                ["포함 직원 계정", (p, i) => <NumIn value={p.seats} onChange={(v) => setPlan(i, { seats: v })} unit="명" w="w-20" />],
                ["포함 오더 (월)", (p, i) => <NumIn value={p.orders} onChange={(v) => setPlan(i, { orders: v })} unit="건" w="w-24" />],
                ["추천 대상", (p, i) => <input value={p.target || ""} onChange={(e) => setPlan(i, { target: e.target.value })} className={`${inpCls} h-9`} />],
                ["추천 표시", (p, i) => <label className="inline-flex items-center gap-2 text-[13px] font-bold"><input type="radio" name="rec" checked={!!p.recommended} onChange={() => set({ plans: cfg.plans.map((x, k) => ({ ...x, recommended: k === i })) })} />이 요금제를 추천으로</label>],
                ["포함 기능 (한 줄에 하나)", (p, i) => <textarea value={(p.features || []).join("\n")} onChange={(e) => setPlan(i, { features: e.target.value.split("\n") })} onBlur={(e) => setPlan(i, { features: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} rows={6} className={`${inpCls} h-auto py-2 leading-relaxed`} />],
              ].map(([label, cell]) => (
                <tr key={label} className="border-t border-[#EEF1F6]">
                  <th className="text-left px-4 py-2.5 bg-[#F7F9FC] text-[13px] font-extrabold text-[#5B6B85] align-top">{label}</th>
                  {cfg.plans.map((p, i) => <td key={p.id} className="px-3 py-2 align-top">{cell(p, i)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {OPTS.map(([title, rows]) => (
          <Card key={title} code={title.startsWith("월") ? "OPTIONS" : "ONE-TIME"} title={title}>
            {rows.map(([k, l, u]) => (
              <div key={k} className="flex items-center justify-between gap-3 py-2 border-t first:border-t-0 border-[#EEF1F6]">
                <span className="text-[14px] font-bold text-[#3A4A66]">{l}</span><NumIn value={cfg[k]} onChange={(v) => set({ [k]: v })} unit={u} />
              </div>
            ))}
          </Card>
        ))}
        <Card code="SUPPLIER" title="공급자 정보 (견적서에 표시)">
          {[["name", "상호"], ["ceo", "대표"], ["bizNo", "사업자번호"], ["phone", "연락처"], ["email", "이메일"], ["address", "주소"], ["bank", "입금 계좌"]].map(([k, l]) => (
            <div key={k} className="grid grid-cols-[96px_1fr] items-center gap-3 py-1.5">
              <span className="text-[13.5px] font-bold text-[#5B6B85]">{l}</span>
              <input value={cfg.supplier[k] || ""} onChange={(e) => set({ supplier: { ...cfg.supplier, [k]: e.target.value } })} className={`${inpCls} h-9`} />
            </div>
          ))}
        </Card>
        <Card code="TERMS" title="계약 조건 · 안내 문구">
          <div className="text-[12.5px] text-[#7A879C] mb-2">견적서·요금 안내서 하단에 그대로 들어갑니다. 한 줄에 하나.</div>
          <textarea value={cfg.terms.join("\n")} onChange={(e) => set({ terms: e.target.value.split("\n") })} onBlur={(e) => set({ terms: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} rows={7} className={`${inpCls} h-auto py-2 leading-relaxed`} />
          <div className="mt-3 text-[12.5px] font-bold text-[#5B6B85]">문자 · 알림톡 안내</div>
          <input value={cfg.messaging} onChange={(e) => set({ messaging: e.target.value })} className={`${inpCls} mt-1`} />
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════ ② 견적서 작성 ═══════════════════════════
const BLANK_INPUT = { customer: "", contact: "", phone: "", staff: 8, orders: 2500, fleet: 0, storageGB: 0, planId: "auto", contractMonths: 12, billing: "monthly", waiveSetup: true, migration: false, training: 0, devDays: 0, devDesc: "", promoMonths: 0, promoRate: 0, extraDiscount: 0, memo: "" };
export function QuoteBuilder({ initial, onSaved }) {
  const cfg = useSalesPricing();
  const [inp, setInp] = React.useState(() => ({ ...BLANK_INPUT, ...(initial?.input || {}) }));
  const [savedId, setSavedId] = React.useState(initial?.id || null);
  const [savedNo, setSavedNo] = React.useState(initial?.no || "");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (initial) { setInp({ ...BLANK_INPUT, ...(initial.input || {}) }); setSavedId(initial.id || null); setSavedNo(initial.no || ""); } }, [initial]);
  if (!cfg) return <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>;
  const set = (patch) => setInp((p) => ({ ...p, ...patch }));
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
  const Seg = ({ v, items, k }) => (
    <div className="flex gap-1 p-1 rounded-xl bg-[#EEF2F8]">{items.map(([val, label]) => (
      <button key={val} type="button" onClick={() => set({ [k]: val })} className={`flex-1 h-8 rounded-lg text-[13px] font-black ${String(v) === String(val) ? "bg-[#1B2B4B] text-white" : "text-[#3A4A66]"}`}>{label}</button>))}</div>
  );
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] items-start">
      {/* 입력 */}
      <div className="space-y-4">
        <Card code="CUSTOMER" title="고객사" right={savedNo ? <span className="text-[12px] font-extrabold text-[#5B6B85]" style={{ fontFamily: MONO }}>{savedNo}</span> : null}>
          <div className="space-y-2.5">
            <div><L>고객사명 *</L><input value={inp.customer} onChange={(e) => set({ customer: e.target.value })} className={inpCls} placeholder="(주)○○로지스" /></div>
            <div className="grid grid-cols-2 gap-2"><div><L>담당자</L><input value={inp.contact} onChange={(e) => set({ contact: e.target.value })} className={inpCls} /></div>
              <div><L>연락처</L><input value={inp.phone} onChange={(e) => set({ phone: e.target.value })} className={inpCls} /></div></div>
          </div>
        </Card>
        <Card code="USAGE" title="사용 규모">
          <div className="space-y-2">
            {[["staff", "직원 계정 수", "명"], ["orders", "월 예상 오더", "건"], ["fleet", "지입차(GPS 관리) 대수", "대"], ["storageGB", "예상 사진·파일 용량", "GB"]].map(([k, l, u]) => (
              <div key={k} className="flex items-center justify-between gap-3"><span className="text-[14px] font-bold text-[#3A4A66]">{l}</span><NumIn value={inp[k]} onChange={(v) => set({ [k]: v })} unit={u} w="w-28" /></div>
            ))}
            <div className="text-[12px] text-[#9AA9C3]">일반 기사의 기사앱 · 화주사 포털은 무료라 넣지 않아도 됩니다.</div>
          </div>
        </Card>
        <Card code="PLAN" title="요금제 · 계약">
          <div className="space-y-3">
            <div><L>요금제</L><Seg k="planId" v={inp.planId} items={[["auto", "자동 추천"], ...cfg.plans.map((p) => [p.id, p.name])]} /></div>
            <div><L>약정</L><Seg k="contractMonths" v={inp.contractMonths} items={[[1, "무약정"], [12, "12개월"], [24, "24개월"]]} /></div>
            <div><L>결제</L><Seg k="billing" v={inp.billing} items={[["monthly", "월 결제"], ["annual", `연간 선결제 (${cfg.annualFreeMonths}개월 무료)`]]} /></div>
          </div>
        </Card>
        <Card code="ONE-TIME" title="초기 비용 · 할인">
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-[14px] font-bold text-[#3A4A66]"><input type="checkbox" checked={inp.waiveSetup} onChange={(e) => set({ waiveSetup: e.target.checked })} />도입비 면제 ({cfg.waiveSetupMonths}개월 이상 약정 시)</label>
            {inp.waiveSetup && num(inp.contractMonths) < num(cfg.waiveSetupMonths) && <div className="text-[12px] font-bold text-[#1B2B4B]">※ 약정이 {cfg.waiveSetupMonths}개월보다 짧아 면제가 적용되지 않습니다.</div>}
            <label className="flex items-center gap-2 text-[14px] font-bold text-[#3A4A66]"><input type="checkbox" checked={inp.migration} onChange={(e) => set({ migration: e.target.checked })} />대량 데이터 이전 (+{won(cfg.migrationFee)})</label>
            <div className="flex items-center justify-between"><span className="text-[14px] font-bold text-[#3A4A66]">추가 현장 교육</span><NumIn value={inp.training} onChange={(v) => set({ training: v })} unit="회" w="w-20" /></div>
            <div className="flex items-center justify-between"><span className="text-[14px] font-bold text-[#3A4A66]">맞춤 개발</span><NumIn value={inp.devDays} onChange={(v) => set({ devDays: v })} unit="일" w="w-20" /></div>
            {num(inp.devDays) > 0 && <input value={inp.devDesc} onChange={(e) => set({ devDesc: e.target.value })} className={inpCls} placeholder="개발 내용 (예: 기존 ERP 연동)" />}
            <div className="pt-2 border-t border-[#EEF1F6]"><L>도입 프로모션 (첫 N개월 할인)</L>
              <div className="flex items-center gap-2"><NumIn value={inp.promoMonths} onChange={(v) => set({ promoMonths: v })} unit="개월" w="w-16" /><NumIn value={inp.promoRate} onChange={(v) => set({ promoRate: Math.min(100, v) })} unit="%" w="w-16" /></div>
              <div className="flex gap-1.5 mt-2">{[[0, 0, "없음"], [1, 100, "첫 달 무료"], [3, 50, "3개월 50%"]].map(([m, r, l]) => (
                <button key={l} type="button" onClick={() => set({ promoMonths: m, promoRate: r })} className={`h-8 px-3 rounded-lg text-[12.5px] font-black border ${num(inp.promoMonths) === m && num(inp.promoRate) === r ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-[#DCE3EE] text-[#3A4A66]"}`}>{l}</button>))}</div>
            </div>
            <div className="flex items-center justify-between"><span className="text-[14px] font-bold text-[#3A4A66]">특별 할인 (1년차 금액에서)</span><NumIn value={inp.extraDiscount} onChange={(v) => set({ extraDiscount: v })} unit="원" /></div>
            <div><L>견적서 특약 (선택)</L><input value={inp.memo} onChange={(e) => set({ memo: e.target.value })} className={inpCls} placeholder="예: 사용 후기·사례 공개 동의 조건" /></div>
          </div>
        </Card>
      </div>

      {/* 결과 */}
      <div className="space-y-4 xl:sticky xl:top-4">
        <div className="rounded-[20px] p-5 text-white shadow-[0_16px_34px_rgba(11,20,40,0.3)]" style={{ background: "linear-gradient(rgba(143,176,240,.05) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.05) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(150deg,#0B1428,#16264A)" }}>
          <div className="flex items-center justify-between">
            <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>QUOTE · {q.chosen.plan.en || q.chosen.plan.name}</div>
            <div className="text-[12.5px] text-white/60">{inp.customer || "고객사"} · {q.chosen.plan.name} 요금제{inp.planId === "auto" ? " (자동 추천)" : ""}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[["월 이용료", q.monthly, true], ["초기 비용", q.oneTimeTotal], ["1년차 총액", q.firstYear]].map(([l, v, on]) => (
              <div key={l} className={`rounded-xl px-3.5 py-3 border ${on ? "border-[#8FB0F0]/45" : "border-[#8FB0F0]/15"}`} style={{ background: on ? "linear-gradient(140deg, rgba(75,108,183,.55), rgba(45,76,130,.25))" : "rgba(255,255,255,.04)" }}>
                <div className="text-[12px] font-bold text-white/60">{l}</div>
                <div className="text-[22px] font-black mt-0.5" style={{ fontFamily: MONO }}>{won(v)}</div>
              </div>
            ))}
          </div>
          <div className="mt-2.5 text-[12.5px] text-white/60">VAT 포함 1년차 {won(q.firstYear + q.vat)} · 1년 평균 월 {won(q.avgMonthly)}</div>
          <div className="mt-4 flex gap-2 flex-wrap">
            <button type="button" onClick={() => openPrint(`견적서_${inp.customer || "고객사"}`, quoteHtml(cfg, inp, q, savedNo))} className="h-10 px-5 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black">견적서 보기 · 인쇄</button>
            <button type="button" onClick={save} disabled={busy} className="h-10 px-5 rounded-xl bg-white/10 ring-1 ring-white/25 text-white text-[13.5px] font-black disabled:opacity-50">{busy ? "저장 중…" : savedId ? "견적 수정 저장" : "견적 저장"}</button>
            <button type="button" onClick={() => { setInp(BLANK_INPUT); setSavedId(null); setSavedNo(""); }} className="h-10 px-4 rounded-xl text-white/70 text-[13px] font-bold hover:text-white">새 견적</button>
          </div>
        </div>

        <Card code="COMPARE" title="요금제별 비교 (이 고객 기준)">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${q.byPlan.length}, minmax(0,1fr))` }}>
            {q.byPlan.map(({ plan, m }) => {
              const on = plan.id === q.chosen.plan.id, best = plan.id === q.best.plan.id;
              return (
                <button key={plan.id} type="button" onClick={() => set({ planId: plan.id })} className={`text-left rounded-xl p-3.5 border-2 transition ${on ? "border-[#1B2B4B] bg-[#F5F8FD]" : "border-[#E3E8F0] hover:border-[#8FB0F0]"}`}>
                  <div className="flex items-center justify-between"><b className="text-[15px] text-[#0F1A30]">{plan.name}</b>{best && <span className="px-1.5 py-0.5 rounded-md bg-[#1B2B4B] text-white text-[10.5px] font-black">최저</span>}</div>
                  <div className="text-[20px] font-black text-[#1B2B4B] mt-1" style={{ fontFamily: MONO }}>{won(m.total)}</div>
                  <div className="text-[11.5px] text-[#7A879C] leading-relaxed mt-1">기본 {won(m.base)}{m.seats ? ` + 계정 ${won(m.seats)}` : ""}{m.orders ? ` + 오더 ${won(m.orders)}` : ""}{m.fleet ? ` + 지입 ${won(m.fleet)}` : ""}{m.storage ? ` + 저장 ${won(m.storage)}` : ""}</div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 text-[12px] text-[#7A879C]">카드를 누르면 그 요금제로 견적이 바뀝니다. 사용 규모가 커지면 상위 요금제가 오히려 쌀 수 있습니다.</div>
        </Card>

        <Card code="DETAIL" title="1년차 계산 내역">
          <table className="w-full text-[14px]">
            <tbody>
              {[
                [`이용료 ${q.paidMonths}개월${q.free ? ` (연간 선결제 ${q.free}개월 무료)` : ""}`, q.monthly * q.paidMonths],
                ...(q.promoDiscount ? [[`프로모션 첫 ${q.promoMonths}개월 ${num(inp.promoRate)}% 할인`, -q.promoDiscount]] : []),
                ...(q.extraDiscount ? [["특별 할인", -q.extraDiscount]] : []),
                ...q.oneTime.map((x) => [`${x.label}${x.waived ? " (약정 면제)" : ""}`, x.amount]),
              ].map(([l, v]) => (
                <tr key={l} className="border-t border-[#EEF1F6]"><td className="py-2 text-[#3A4A66] font-semibold">{l}</td><td className="py-2 text-right font-black text-[#0F1A30]" style={{ fontFamily: MONO }}>{v < 0 ? `- ${won(-v)}` : won(v)}</td></tr>
              ))}
              <tr className="border-t-2 border-[#1B2B4B]"><td className="py-2.5 font-black text-[#0F1A30]">1년차 합계 (VAT 별도)</td><td className="py-2.5 text-right font-black text-[16px] text-[#1B2B4B]" style={{ fontFamily: MONO }}>{won(q.firstYear)}</td></tr>
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════ ③ 견적 이력 ═══════════════════════════
const STATUSES = ["작성", "발송", "협의 중", "계약", "보류", "실패"];
export function QuoteHistory({ onOpen }) {
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
            <div className="text-[22px] font-black mt-0.5" style={{ fontFamily: MONO }}>{v}</div>
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
                    <td className="px-3 py-2 text-center text-[12.5px] text-[#5B6B85]" style={{ fontFamily: MONO }}>{x.no}</td>
                    <td className="px-3 py-2 font-black text-[#0F1A30]">{x.customer}</td>
                    <td className="px-3 py-2 text-center">{x.plan}</td>
                    <td className="px-3 py-2 text-right font-black" style={{ fontFamily: MONO }}>{won2(x.monthly)}</td>
                    <td className="px-3 py-2 text-right" style={{ fontFamily: MONO }}>{won2(x.oneTime)}</td>
                    <td className="px-3 py-2 text-right" style={{ fontFamily: MONO }}>{won2(x.firstYear)}</td>
                    <td className="px-3 py-2 text-center">
                      <select value={x.status || "작성"} onChange={(e) => updateDoc(doc(db, "salesQuotes", x.id), { status: e.target.value }).catch((er) => window.alert(er.message))}
                        className={`h-8 px-2 rounded-lg border text-[13px] font-black ${x.status === "계약" ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-[#DCE3EE] text-[#1B2B4B]"}`}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center text-[12.5px] text-[#7A879C]" style={{ fontFamily: MONO }}>{x.createdAt?.toDate ? ymd(x.createdAt.toDate()) : "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <button type="button" onClick={() => onOpen?.(x)} className="h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black mr-1">열기</button>
                      <button type="button" onClick={() => { const c = x.pricing ? mergeDefaults(x.pricing) : cfg; if (!c) return; const inp = { ...BLANK_INPUT, ...x.input }; const q = quoteOf(c, inp); q && openPrint(`견적서_${x.customer}`, quoteHtml(c, inp, q, x.no)); }} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B] mr-1">인쇄</button>
                      <button type="button" onClick={() => window.confirm(`${x.customer} 견적(${x.no})을 삭제할까요?`) && deleteDoc(doc(db, "salesQuotes", x.id))} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-bold text-[#7A879C]">삭제</button>
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
