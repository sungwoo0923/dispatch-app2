// ======================= src/payslipDoc.js =======================
// ⭐ 2026-11-07 급여명세서 새 디자인(화면 · 인쇄 · PDF 공용 HTML) — 경리 화면 미리보기와 직원 화면(내정보 › 급여명세서)이 같은 것을 쓴다
//  · 🎨 2026-11-24 카드 한 장: 머리(회사 · 귀속 월 · 지급일 · 이름 · 서명 도장) → 실수령액 + 지급·공제 총액 → 근무 요약 → 지급 · 공제 표
//    → 실수령액 식 → 인적 사항 → 계산 방법(접기) → 안내사항(원천징수 · 4대보험 정산 · 제43조 지급 · 제49조 3년 · 문의 · 개인정보) → 수령 확인
//  · 인적 사항(생년월일·입사일·고용형태·지급 계좌) · 계산 방법(화면에서는 접힘, 인쇄하면 펼침)
//  · 근로기준법 48조 2항 · 시행령 27조의2 기재사항(성명·생년월일·지급일·임금총액·구성항목별 금액·계산방법·근로일수·
//    연장/야간/휴일 근로시간·공제 항목별 금액과 총액)은 모두 들어 있다
import { wonFmt } from "./payrollCalc";
import { formatAccount } from "./bankUtil";
import { isSigned, stampDate, signTimeText } from "./payslipSign";

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
  // ⭐ 2026-11-17 직원 수령 확인 서명 — 빨간 동그라미 도장(오른쪽 위) + 맨 아래 "수령 확인" 줄(이름 · 시각 · 서명 그림)
  const signed = isSigned(s);
  const img = signed && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(String(s.signImg || "")) ? s.signImg : "";
  const stamp = signed ? `<div class="ps-stamp" aria-label="서명완료"><span>서명완료</span><b>${esc(stampDate(s))}</b></div>` : "";
  const signRow = signed ? `<section class="sg"><span class="k">수령 확인</span><span class="n">${esc(s.signName || s.name || "")}</span><span class="t">${esc(signTimeText(s))}</span>${img ? `<img src="${img}" alt="서명" />` : `<em>확인했어요(서명 그림 없음)</em>`}</section>` : "";
  // 🎨 2026-11-24 한 장(카드 하나) 디자인 — 사용자 요청: 칸칸이 나뉘지 않게 · 줄바꿈 없이 · 안내사항 · 관련 조항
  const autoTax = r.taxMode === "auto" && !["freelance", "daily"].includes(r.taxBasis);
  const guide = [
    "이 명세서는 근로기준법 제48조 제2항과 같은 법 시행령 제27조의2에 따라 임금의 구성항목 · 계산방법 · 공제 내역을 적어 드리는 문서예요.",
    autoTax ? "소득세는 국세청 간이세액표 기준으로 미리 떼는 금액(원천징수)이에요. 1년치 실제 세금은 다음 해 연말정산에서 확정되고, 더 낸 세금은 돌려받아요." : "소득세는 미리 떼는 금액(원천징수)이며, 실제 세금은 연말정산 · 종합소득세 신고에서 확정돼요.",
    "4대보험료는 각 공단(국민연금 · 건강보험 · 근로복지)의 기준에 따라 계산되며, 공단 고지 금액과 차이가 나면 다음 달 급여에서 정산될 수 있어요.",
    "임금은 근로기준법 제43조에 따라 매월 1회 이상 정해진 날짜에 통화로 직접 지급돼요. 임금 청구권은 제49조에 따라 3년간 행사할 수 있어요.",
    "명세서 내용이 실제와 다르거나 궁금한 점이 있으면 지급일로부터 7일 안에 인사 · 경리 담당자에게 알려 주세요.",
    "급여 정보는 개인정보예요. 본인 외 다른 사람에게 보여 주거나 공유하지 마세요.",
  ];
  const line = (l, a, tag = "") => `<tr><th>${esc(l)}${tag ? `<i>${esc(tag)}</i>` : ""}</th><td>${wonFmt(a)}</td></tr>`;
  return `<article class="ps${signed ? " ps-signed" : ""}">
<header class="hd">
  <div class="hl"><div class="en">PAYSLIP · ${esc(s.ym || "")}</div><div class="tt">${esc(ymLabel(s.ym))} 급여명세서</div><div class="sub">${esc(company || s.companyName || "")}${s.paidDate || s.payDate ? ` · 지급일 ${esc(s.paidDate || s.payDate)}` : ""}</div></div>
  ${stamp}<div class="who"><b>${esc(s.name || "")}</b><span>${esc([s.team, s.position].filter(Boolean).join(" · ") || "")}</span></div>
</header>
<div class="bd">
<section class="sum">
  <div class="net"><div class="k">실수령액</div><div class="v">${wonFmt(r.net)}<small>원</small></div></div>
  <dl class="tot"><div><dt>지급 총액</dt><dd>${wonFmt(r.gross)}</dd></div><div><dt>공제 총액</dt><dd>−${wonFmt(r.totalDeduct)}</dd></div><div class="sm"><dt>4대보험</dt><dd>${wonFmt(insSum)}</dd></div><div class="sm"><dt>소득세 · 지방세</dt><dd>${wonFmt(taxSum)}</dd></div></dl>
</section>
<div class="work">${chips.map(([k, v]) => `<span><em>${k}</em>${v}</span>`).join("")}</div>
<section class="tbl">
  <table class="col kp-plain"><caption>지급 내역</caption><tbody>${earn.map((e) => line(e.label, e.amount, e.taxable === false ? "비과세" : "")).join("") || `<tr><th class="none">지급 항목 없음</th><td></td></tr>`}</tbody><tfoot><tr><th>지급 총액<small>과세 ${wonFmt(r.taxable)} · 비과세 ${wonFmt(r.nonTaxable)}</small></th><td>${wonFmt(r.gross)}</td></tr></tfoot></table>
  <table class="col kp-plain"><caption>공제 내역</caption><tbody>${ded.map((d) => line(d.label, d.amount)).join("")}</tbody><tfoot><tr><th>공제 총액</th><td>${wonFmt(r.totalDeduct)}</td></tr></tfoot></table>
</section>
<div class="eq"><span>실수령액</span><b>${wonFmt(r.net)}원</b><em>= 지급 총액 ${wonFmt(r.gross)} − 공제 총액 ${wonFmt(r.totalDeduct)}</em></div>
<dl class="info">${info.map(([k, v]) => `<div><dt>${k}</dt><dd title="${esc(v)}">${esc(v)}</dd></div>`).join("")}</dl>
${s.input?.memo ? `<div class="memo"><b>비고</b> ${esc(s.input.memo)}</div>` : ""}
<details class="notes"${notesOpen ? " open" : ""}><summary>계산 방법</summary><ul>${notes}</ul></details>
<section class="guide"><div class="gh">안내사항</div><ul>${guide.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></section>
${signRow}
<footer class="fo"><span>${esc(company || s.companyName || "")}</span><span>근로기준법 제48조 제2항 · 시행령 제27조의2에 따른 임금명세서</span></footer>
</div>
</article>`;
}

// 카드 하나 — 바깥 테두리 · 그림자 안에 모든 내용 · 금액은 줄바꿈 없음 · 좁은 화면(모바일)에서는 표가 위아래로
export const PAYSLIP_CSS = `.ps{font-family:'Pretendard','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#0F1A30;background:#fff;max-width:760px;margin:0 auto;font-variant-numeric:tabular-nums;font-size:14px;line-height:1.5;border:1px solid #E3E8F0;border-radius:20px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,.04),0 12px 32px rgba(16,24,40,.08)}
.ps *{box-sizing:border-box}
.ps .hd{display:flex;align-items:center;gap:14px;padding:20px 24px;color:#fff;background:linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ps .hl{min-width:0;flex:1}.ps .en{font-size:11.5px;font-weight:800;letter-spacing:.24em;color:#8FB0F0}.ps .tt{font-size:21px;font-weight:900;margin-top:2px;white-space:nowrap}.ps .sub{font-size:13.5px;font-weight:700;color:rgba(255,255,255,.75);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ps .who{text-align:right;white-space:nowrap}.ps .who b{display:block;font-size:19px;font-weight:900}.ps .who span{font-size:13.5px;font-weight:700;color:rgba(255,255,255,.75)}
.ps .bd{padding:6px 24px 20px}
.ps .sum{display:flex;align-items:center;gap:20px;padding:16px 0;border-bottom:1px solid #EEF1F6}
.ps .net{flex:1;min-width:0}.ps .net .k{font-size:13.5px;font-weight:800;color:#5B6B85}.ps .net .v{font-size:34px;font-weight:900;letter-spacing:-.02em;line-height:1.15;white-space:nowrap}.ps .net small{font-size:17px;font-weight:800;margin-left:2px;color:#3A4A66}
.ps .tot{margin:0;min-width:230px;display:flex;flex-direction:column;gap:3px}.ps .tot div{display:flex;justify-content:space-between;gap:16px}.ps .tot dt{font-weight:700;color:#5B6B85;white-space:nowrap}.ps .tot dd{margin:0;font-weight:900;white-space:nowrap}.ps .tot .sm dt,.ps .tot .sm dd{font-size:13px;color:#7A879C;font-weight:700}
.ps .work{display:flex;flex-wrap:wrap;gap:4px 16px;padding:10px 0;border-bottom:1px solid #EEF1F6;font-size:13.5px;font-weight:900;color:#1B2B4B}.ps .work span{white-space:nowrap}.ps .work em{font-style:normal;font-weight:700;color:#7A879C;margin-right:4px}
.ps .tbl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;padding-top:6px;align-items:start}
.ps table{width:100%;min-width:0!important;border-collapse:collapse;font-family:inherit!important;font-size:14px!important}.ps tbody tr,.ps tfoot tr{height:auto!important;line-height:1.5!important;border-bottom:0!important}.ps table tbody tr td,.ps tbody tr:hover td,.ps tbody tr:nth-child(even) td,.ps tbody tr:nth-child(odd) td{background:transparent!important;border-right:none!important;color:#0F1A30!important;font-size:14px!important;font-weight:900!important}.ps caption{text-align:left;font-size:12.5px;font-weight:900;letter-spacing:.04em;color:#4B6CB7;padding:10px 0 4px;border-bottom:2px solid #1B2B4B}
.ps.ps .tbl table.col.kp-plain tr>:is(th,td){padding:8px 0!important;font-size:14px!important;letter-spacing:0!important}.ps.ps .tbl table.col.kp-plain tfoot tr>:is(th,td){padding-top:10px!important;font-size:15px!important}.ps table th,.ps table td{padding:8px 0!important;border-bottom:1px solid #EEF1F6;font-size:14px!important;vertical-align:baseline;height:auto!important;text-indent:0}.ps th{text-align:left;font-weight:700;color:#3A4A66}.ps td{text-align:right;font-weight:900;white-space:nowrap;padding-left:10px}
.ps th i{font-style:normal;margin-left:6px;font-size:11.5px;font-weight:800;color:#2D4C82;background:#EEF3FC;border-radius:5px;padding:1px 5px;white-space:nowrap}.ps th.none{color:#7A879C}
.ps table tfoot th,.ps table tfoot td{border-bottom:0;padding-top:10px!important;font-weight:900;color:#0F1A30;font-size:15px!important}.ps tfoot th small{display:block;font-size:12px;font-weight:700;color:#7A879C}
.ps .eq{margin-top:10px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding:12px 16px;border-radius:12px;background:#F5F8FD;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ps .eq span{font-weight:900;color:#3A4A66}.ps .eq b{font-size:17px;font-weight:900;white-space:nowrap}.ps .eq em{font-style:normal;font-size:13px;font-weight:700;color:#7A879C;margin-left:auto;white-space:nowrap}
.ps .info{margin:14px 0 0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 24px}.ps .info div{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px dashed #E3E8F0;min-width:0}.ps dt{font-size:13.5px;font-weight:700;color:#5B6B85;white-space:nowrap}.ps .info dd{margin:0;font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;text-align:right}
.ps .memo{margin-top:10px;font-size:14px;color:#3A4A66}.ps .memo b{margin-right:6px}
.ps .notes{margin-top:12px;border-top:1px solid #EEF1F6}.ps .notes summary{cursor:pointer;padding:10px 0 6px;font-size:14px;font-weight:900;color:#1B2B4B}.ps .notes ul{list-style:none;margin:0;padding:0 0 6px}.ps .notes li{padding:2px 0;font-size:13px;color:#3A4A66;overflow-wrap:anywhere}.ps .notes li b{color:#0F1A30;margin-right:6px}
.ps .guide{margin-top:10px;padding:12px 16px;border-radius:12px;border:1px solid #E3E8F0;background:#FAFBFD;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ps .gh{font-size:13.5px;font-weight:900;color:#1B2B4B;margin-bottom:4px}.ps .guide ul{margin:0;padding-left:18px;list-style:disc}.ps .guide li{font-size:12.5px;line-height:1.6;color:#5B6B85;word-break:keep-all}
.ps .fo{margin-top:12px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12px;color:#7A879C}.ps .fo span:first-child{font-weight:800;color:#3A4A66}
.ps .ps-stamp{flex:none;width:64px;height:64px;border-radius:50%;border:3px solid #D92D20;color:#D92D20;background:rgba(255,255,255,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;transform:rotate(-12deg);font-weight:900;line-height:1.1;box-shadow:inset 0 0 0 2px #fff,inset 0 0 0 3.5px #D92D20;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ps .ps-stamp span{font-size:12px;letter-spacing:-.02em}.ps .ps-stamp b{font-size:13px;margin-top:2px}
.ps .sg{margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px solid #EEF1F6;padding:10px 0 0;font-size:14px}.ps .sg .k{font-weight:900;color:#3A4A66}.ps .sg .n{font-weight:900}.ps .sg .t{font-weight:700;color:#5B6B85}.ps .sg img{height:44px;max-width:160px;margin-left:auto;object-fit:contain}.ps .sg em{margin-left:auto;font-style:normal;font-weight:700;color:#7A879C}
@media (max-width:640px){.ps{border-radius:18px}.ps .hd{padding:16px;flex-wrap:wrap}.ps .tt{font-size:18px}.ps .who{text-align:left;order:3;flex-basis:100%}.ps .ps-stamp{width:56px;height:56px}.ps .bd{padding:4px 16px 16px}.ps .sum{flex-direction:column;align-items:stretch;gap:10px}.ps .net .v{font-size:30px}.ps .tot{min-width:0}.ps .tbl{grid-template-columns:minmax(0,1fr);gap:4px}.ps .info{grid-template-columns:minmax(0,1fr)}.ps .eq em{margin-left:0;white-space:normal}}
@media print{.ps{max-width:none;box-shadow:none}.ps .notes summary{list-style:none}}`;

export function printPayslips(slips, company) {
  const w = window.open("", "_blank"); if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>급여명세서</title><style>@page{size:A4;margin:12mm}body{margin:0}${PAYSLIP_CSS}.pg{page-break-after:always;padding:2px}.pg:last-child{page-break-after:auto}</style></head><body>${(slips || []).map((s) => `<div class="pg">${payslipHtml(s, company, { notesOpen: true })}</div>`).join("")}<script>setTimeout(()=>print(),300)</script></body></html>`);
  w.document.close();
}
