// ======================= src/payslipDoc.js =======================
// ⭐ 2026-11-07 급여명세서 새 디자인(화면 · 인쇄 · PDF 공용 HTML) — 경리 화면 미리보기와 직원 화면(내정보 › 급여명세서)이 같은 것을 쓴다
//  · 위: 회사 · 귀속 월 · 지급일 · 이름 / 가운데: 실수령액(크게) + 지급·공제 총액 / 근무 요약 칩 / 지급 · 공제 두 칸(합계 분명히)
//  · 인적 사항(생년월일·입사일·고용형태·지급 계좌) · 계산 방법(화면에서는 접힘, 인쇄하면 펼침)
//  · 근로기준법 48조 2항 · 시행령 27조의2 기재사항(성명·생년월일·지급일·임금총액·구성항목별 금액·계산방법·근로일수·
//    연장/야간/휴일 근로시간·공제 항목별 금액과 총액)은 모두 들어 있다
import { wonFmt } from "./payrollCalc";
import { formatAccount } from "./bankUtil";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ymLabel = (ym) => (ym ? `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월` : "");
export const PAY_TYPE_LABEL = { monthly: "월급제", hourly: "시급제", daily: "일급제", annual: "연봉제" };
export const TAX_NOTE = "간이세액 근사치 · 확정은 세무사/간이세액표 확인";
export const acctLine = (a) => (a && a.bank && a.acct ? `${a.bank} ${formatAccount(a.bank, a.acct)}${a.holder ? ` (${a.holder})` : ""}` : "");
const SHOW_ZERO = ["np", "hi", "ltc", "ei", "tax", "local"];

export function payslipHtml(slip, company, { notesOpen = false } = {}) {
  const s = slip || {};
  const r = s.result || {};
  const w = r.work || {};
  const earn = (r.earnings || []).filter((e) => e.amount);
  const ded = (r.deductions || []).filter((d) => d.amount || SHOW_ZERO.includes(d.key));
  const row = (l, a, tag = "") => `<li><span class="nm">${esc(l)}${tag ? `<i>${esc(tag)}</i>` : ""}</span><b>${wonFmt(a)}</b></li>`;
  const hol = (Number(w.holHours) || 0) + (Number(w.holOverHours) || 0);
  const chips = [["근로", `${w.workDays || 0}일`], ["정상", `${w.regularHours || 0}시간`], ["연장", `${w.otHours || 0}시간`], ["야간", `${w.nightHours || 0}시간`], ["휴일", `${hol}시간`]];
  const insSum = ded.filter((d) => ["np", "hi", "ltc", "ei"].includes(d.key)).reduce((x, d) => x + (d.amount || 0), 0);
  const taxSum = ded.filter((d) => ["tax", "local"].includes(d.key)).reduce((x, d) => x + (d.amount || 0), 0);
  const typeText = [s.employmentType || "", PAY_TYPE_LABEL[s.payType] || ""].filter(Boolean).join(" · ") || "-";
  const info = [["생년월일", s.birthDate || "-"], ["입사일", s.hireDate || "-"], ["고용형태", typeText], ["지급 계좌", acctLine(s.payAccount) || "-"]];
  const rates = s.rates || {};
  const notes = [
    ...earn.filter((e) => e.calc).map((e) => `<li><b>${esc(e.label)}</b> ${esc(e.calc)}</li>`),
    ...ded.filter((d) => d.calc).map((d) => `<li><b>${esc(d.label)}</b> ${esc(d.calc)}</li>`),
    r.ordinaryHourly ? `<li><b>통상시급</b> ${wonFmt(r.ordinaryHourly)}원 (통상임금 ÷ 월 소정근로시간) · 연장 ${r.small ? "1.0" : esc(rates.otRate ?? 1.5)}배 · 야간 가산 ${r.small ? "0" : esc(rates.nightRate ?? 0.5)}배 · 휴일 ${r.small ? "1.0" : esc(rates.holRate ?? 1.5)}배(8시간 넘으면 ${r.small ? "1.0" : esc(rates.holOverRate ?? 2)}배)${r.small ? " · 상시 5인 미만 사업장(가산수당 없음)" : ""}</li>` : "",
    r.annual ? `<li><b>연봉제</b> 연봉 ${wonFmt(r.annual.annual)}원 ÷ ${r.annual.divisor} = 월 ${wonFmt(r.annual.monthlyTotal)}원${r.annual.severance ? " (퇴직금 포함 연봉 · 13분의 1은 퇴직금 몫)" : ""}${r.annual.fixedIn ? ` · 식대 등 ${wonFmt(r.annual.fixedIn)}원 포함` : ""}</li>` : "",
    r.taxMode === "auto" ? `<li><b>소득세</b> ${TAX_NOTE}</li>` : "",
  ].filter(Boolean).join("");
  return `<article class="ps">
<header class="hd">
  <div class="hl"><div class="en">PAYSLIP · ${esc(s.ym || "")}</div><div class="tt">${esc(ymLabel(s.ym))} 급여명세서</div><div class="sub">${esc(company || s.companyName || "")}${s.paidDate || s.payDate ? ` · 지급일 ${esc(s.paidDate || s.payDate)}` : ""}</div></div>
  <div class="who"><b>${esc(s.name || "")}</b><span>${esc([s.team, s.position].filter(Boolean).join(" · ") || "")}</span></div>
</header>
<section class="hero">
  <div class="net"><div class="k">실수령액</div><div class="v">${wonFmt(r.net)}<small>원</small></div></div>
  <div class="mini"><div><span>지급 총액</span><b>${wonFmt(r.gross)}</b></div><div><span>공제 총액</span><b>${wonFmt(r.totalDeduct)}</b></div><div class="sm"><span>4대보험</span><b>${wonFmt(insSum)}</b></div><div class="sm"><span>소득세 · 지방세</span><b>${wonFmt(taxSum)}</b></div></div>
</section>
<div class="chips">${chips.map(([k, v]) => `<span><em>${k}</em>${v}</span>`).join("")}</div>
<div class="cols">
  <section class="col"><div class="ch"><span>지급</span><b>${wonFmt(r.gross)}</b></div><ul>${earn.map((e) => row(e.label, e.amount, e.taxable === false ? "비과세" : "")).join("") || "<li class=\"none\">지급 항목 없음</li>"}</ul><div class="ft"><span>과세 ${wonFmt(r.taxable)}</span><span>비과세 ${wonFmt(r.nonTaxable)}</span></div></section>
  <section class="col"><div class="ch"><span>공제</span><b>${wonFmt(r.totalDeduct)}</b></div><ul>${ded.map((d) => row(d.label, d.amount)).join("")}</ul><div class="ft"><span>실수령액 = 지급 총액 − 공제 총액</span></div></section>
</div>
<dl class="info">${info.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
${s.input?.memo ? `<div class="memo"><b>비고</b> ${esc(s.input.memo)}</div>` : ""}
<details class="notes"${notesOpen ? " open" : ""}><summary>계산 방법</summary><ul>${notes}</ul></details>
<footer class="fo">이 명세서는 근로기준법 제48조 제2항에 따라 교부합니다.</footer>
</article>`;
}

export const PAYSLIP_CSS = `.ps{font-family:'Pretendard','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#0F1A30;background:#fff;max-width:880px;margin:0 auto;font-variant-numeric:tabular-nums;font-size:14px;line-height:1.5}
.ps *{box-sizing:border-box}
.ps .hd{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;padding:20px 22px;border-radius:18px;color:#fff;background:linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ps .en{font-size:12px;font-weight:800;letter-spacing:.24em;color:#8FB0F0}.ps .tt{font-size:22px;font-weight:900;margin-top:2px}.ps .sub{font-size:14px;font-weight:700;color:rgba(255,255,255,.75);margin-top:2px}
.ps .who{text-align:right}.ps .who b{display:block;font-size:19px;font-weight:900}.ps .who span{font-size:14px;font-weight:700;color:rgba(255,255,255,.75)}
.ps .hero{margin-top:12px;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:12px;align-items:stretch}
.ps .net{border-radius:16px;border:2px solid #1B2B4B;padding:14px 18px;display:flex;flex-direction:column;justify-content:center}
.ps .net .k{font-size:14px;font-weight:800;color:#3A4A66}.ps .net .v{font-size:34px;font-weight:900;letter-spacing:-.01em;line-height:1.15;white-space:nowrap}.ps .net small{font-size:18px;font-weight:800;margin-left:2px}
.ps .mini{border-radius:16px;background:#F5F8FD;border:1px solid #E3E8F0;padding:10px 16px;display:flex;flex-direction:column;justify-content:center;gap:4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ps .mini div{display:flex;justify-content:space-between;gap:10px;font-size:14px}.ps .mini span{font-weight:700;color:#5B6B85}.ps .mini b{font-weight:900;white-space:nowrap}.ps .mini .sm{border-top:1px dashed #DCE3EE;padding-top:3px}.ps .mini .sm+.sm{border-top:0;padding-top:0}.ps .mini .sm b{font-weight:800;color:#3A4A66}
.ps .chips{margin-top:10px;display:flex;flex-wrap:wrap;gap:6px}.ps .chips span{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:999px;background:#EEF3FC;color:#1B2B4B;font-size:14px;font-weight:900;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ps .chips em{font-style:normal;font-weight:700;color:#5B6B85}
.ps .cols{margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.ps .col{border:1px solid #E3E8F0;border-radius:16px;overflow:hidden;display:flex;flex-direction:column}
.ps .ch{display:flex;justify-content:space-between;align-items:baseline;padding:11px 16px;background:#1B2B4B;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ps .ch span{font-size:15px;font-weight:900}.ps .ch b{font-size:17px;font-weight:900}
.ps ul{list-style:none;margin:0;padding:4px 16px;flex:1}.ps .col li{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:8px 0;border-bottom:1px solid #EEF1F6}.ps .col li:last-child{border-bottom:0}
.ps .nm{font-weight:700;min-width:0;overflow-wrap:anywhere}.ps .nm i{font-style:normal;margin-left:6px;font-size:13px;font-weight:800;color:#2D4C82;background:#EEF3FC;border-radius:6px;padding:1px 6px}.ps .col li b{font-weight:900;white-space:nowrap}.ps .none{color:#7A879C}
.ps .ft{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:9px 16px;background:#F5F8FD;border-top:1px solid #E3E8F0;font-size:14px;font-weight:800;color:#3A4A66;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ps .info{margin:12px 0 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}.ps .info div{border-radius:12px;background:#F5F8FD;padding:8px 12px;min-width:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ps dt{font-size:13px;font-weight:700;color:#5B6B85}.ps dd{margin:0;font-size:14px;font-weight:900;overflow-wrap:anywhere}
.ps .memo{margin-top:10px;font-size:14px;color:#3A4A66}.ps .memo b{margin-right:6px}
.ps .notes{margin-top:10px;border:1px solid #E3E8F0;border-radius:14px;padding:0 14px}.ps .notes summary{cursor:pointer;padding:10px 0;font-size:14px;font-weight:900;color:#1B2B4B}.ps .notes ul{padding:0 0 10px}.ps .notes li{padding:3px 0;font-size:14px;color:#3A4A66;overflow-wrap:anywhere}.ps .notes li b{color:#0F1A30;margin-right:6px}
.ps .fo{margin-top:10px;font-size:13px;color:#7A879C}
@media (max-width:640px){.ps .hero{grid-template-columns:minmax(0,1fr)}.ps .net .v{font-size:30px}.ps .hd{padding:16px}.ps .tt{font-size:19px}.ps .who{text-align:left}}
@media print{.ps{max-width:none}.ps .notes summary{list-style:none}}`;

export function printPayslips(slips, company) {
  const w = window.open("", "_blank"); if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>급여명세서</title><style>@page{size:A4;margin:12mm}body{margin:0}${PAYSLIP_CSS}.pg{page-break-after:always;padding:2px}.pg:last-child{page-break-after:auto}</style></head><body>${(slips || []).map((s) => `<div class="pg">${payslipHtml(s, company, { notesOpen: true })}</div>`).join("")}<script>setTimeout(()=>print(),300)</script></body></html>`);
  w.document.close();
}
