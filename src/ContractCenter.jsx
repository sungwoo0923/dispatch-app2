// ======================= src/ContractCenter.jsx =======================
// ✍ 관리자 관리센터 › 계약(2026-10-29, 최고관리자 전용)
//  - 계약서 양식: siteConfig/contractTemplates (언제든 수정 · 변수 {{고객사}} 같은 자리표시 사용)
//  - 계약서: contracts/{추측 불가능한 ID} — 견적에서 불러와 작성 → "서명 요청" → 고객이 링크(/sign/ID)에서 전자서명
//  - 고객은 로그인 없이 링크로 열고, 서명 칸만 채울 수 있다(firestore.rules). 서명 후엔 문서 지문(SHA-256)을 함께 남긴다.
//  ⭐ 알록달록 금지 — 네이비 계열만.
import React from "react";
import { runDelete } from "./DeleteProgress"; // ⭐ 2026-11-05 삭제 진행 창 + 한 번에 삭제
import { kpConfirm, kpPrompt } from "./kpDialog";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useSalesPricing } from "./SalesQuote";
import { CustomSelect } from "./CustomSelect";
import CustomDatePicker from "./CustomDatePicker";
import { fmtBizNo, fmtPhone } from "./formatInput";

export const C_MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const won = (n) => `${Math.round(Number(n) || 0).toLocaleString()}원`;
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addMonths = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setMonth(d.getMonth() + Number(n || 0)); d.setDate(d.getDate() - 1); return ymd(d); };
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const randomId = () => { const a = new Uint8Array(18); crypto.getRandomValues(a); return Array.from(a, (b) => "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 56]).join(""); };

// ─── 기본 양식(LogisWeb 서비스 이용계약서) ───
export const CONTRACT_VARS = [
  ["계약일", "계약 체결일"], ["고객사", "고객사 상호"], ["고객대표", "고객사 대표자"], ["고객사업자번호", "고객사 사업자번호"], ["고객주소", "고객사 주소"], ["고객연락처", "고객사 연락처"],
  ["공급자상호", "공급자 상호"], ["공급자대표", "공급자 대표"], ["공급자사업자번호", "공급자 사업자번호"], ["공급자주소", "공급자 주소"], ["공급자연락처", "공급자 연락처"],
  ["요금제", "요금제 이름"], ["직원계정", "포함 직원 계정 수"], ["포함오더", "포함 오더 수(월)"], ["월이용료", "월 이용료"], ["초기비용", "초기 비용(1회)"],
  ["계약기간", "계약 기간(개월)"], ["시작일", "서비스 시작일"], ["종료일", "서비스 종료일"], ["결제방식", "결제 방식"], ["결제일", "매월 결제일"], ["추가옵션", "추가 옵션 내역"], ["특약", "특약 사항"],
];
export const DEFAULT_TEMPLATE_BODY = `# LogisWeb 서비스 이용계약서

{{공급자상호}}(이하 "공급자")와 {{고객사}}(이하 "고객")는 공급자가 제공하는 운송 배차 관리 서비스 LogisWeb의 이용에 관하여 다음과 같이 계약을 체결한다.

제1조 (목적)
본 계약은 공급자가 고객에게 LogisWeb 서비스를 제공하고, 고객이 이를 이용함에 있어 양 당사자의 권리·의무 및 책임 사항을 정함을 목적으로 한다.

제2조 (서비스의 내용)
① "서비스"란 공급자가 인터넷을 통해 제공하는 운송 배차 관리 프로그램 LogisWeb으로서 배차관리, 실시간 배차현황, 거래처·하차지·기사 관리, 단가표·운임조회, 매출·정산·지급관리, 화주사 전용 포털, 기사 전용 앱 및 이에 부수하는 기능을 말한다.
② 고객이 이용하는 요금제는 「{{요금제}}」이며, 직원 계정 {{직원계정}}명과 월 오더 {{포함오더}}건이 포함된다.
③ 일반 기사의 기사 앱 이용과 화주사 포털 이용은 별도 요금 없이 제공한다.

제3조 (계약 기간 및 갱신)
① 계약 기간은 {{시작일}}부터 {{종료일}}까지 {{계약기간}}개월로 한다.
② 계약 만료 1개월 전까지 어느 일방이 서면(전자문서 포함)으로 해지 의사를 표시하지 않으면 동일한 조건으로 1년씩 자동 연장된다.

제4조 (이용 요금 및 지급)
① 월 이용료는 {{월이용료}}(부가가치세 별도)로 한다.
② 초기 비용은 {{초기비용}}(부가가치세 별도)으로 하며, 서비스 개시 전에 지급한다.
③ 추가 옵션: {{추가옵션}}
④ 결제 방식은 {{결제방식}}으로 하며, 고객은 매월 {{결제일}}까지 해당 월의 이용료를 지급한다. 공급자는 세금계산서를 발행한다.
⑤ 문자·알림톡 발송 비용 등 실비는 사용량에 따라 별도 청구할 수 있다.

제5조 (서비스 수준)
① 공급자는 연중무휴 24시간 서비스를 제공하기 위하여 노력하며, 정기 점검이 필요한 경우 사전에 공지한다.
② 장애가 접수되면 공급자는 영업일 기준 당일 내에 응대하고 신속히 복구한다.
③ 공급자는 고객의 데이터를 매일 자동 백업한다.

제6조 (고객의 의무)
① 고객은 계정 정보를 선량한 관리자의 주의로 관리하며, 계정을 제3자에게 양도·대여할 수 없다.
② 고객은 관련 법령 및 본 계약을 준수하며, 서비스를 위법한 목적으로 이용하지 않는다.

제7조 (데이터의 소유 및 반출)
① 고객이 서비스에 입력한 데이터의 소유권은 고객에게 있다.
② 계약이 종료되면 공급자는 고객의 요청에 따라 데이터 전체를 엑셀 등 범용 형식으로 제공하며, 종료일로부터 30일이 지나면 관련 법령에서 보관을 요구하는 경우를 제외하고 지체 없이 파기한다.
③ 공급자는 고객이 요청하면 파기를 마친 날로부터 7일 이내에 파기 대상·일시·방법을 적은 데이터 삭제 확인서를 고객에게 교부한다.
④ 공급자는 서비스 제공 목적 외에 고객의 데이터를 열람·이용하거나 제3자에게 제공하지 않는다. 다만 장애 처리 등 고객이 요청한 경우와 법령에 따른 경우는 예외로 한다.

제8조 (개인정보 및 위치정보의 보호)
① 공급자는 서비스 제공을 위하여 고객으로부터 개인정보(직원·기사·거래처 담당자 연락처 등)의 처리를 위탁받으며, 「개인정보 보호법」 등 관련 법령을 준수한다.
② 기사 위치정보는 기사의 동의 범위 내에서 운행 관리 목적으로만 처리하며, 「위치정보의 보호 및 이용 등에 관한 법률」을 준수한다.

제8조의2 (정보 보호 조치)
① 공급자는 고객 데이터를 보호하기 위하여 다음 조치를 시행한다.
  1. 접근 통제: 회사별 데이터 분리, 직원 권한(역할)별 메뉴·데이터 접근 제한, 퇴사 처리 즉시 계정 사용 중지
  2. 암호화: 전송 구간 암호화(HTTPS/TLS) 및 저장 데이터 암호화(클라우드 기본 암호화)
  3. 백업: 매일 자동 백업, 백업본은 최소 30일 보관
  4. 기록 보관: 로그인·접속 기록과 보안 이벤트(새 기기 로그인, 해외 접속, 대량 다운로드 등)를 1년 이상 보관하고 이상 징후를 점검
② 고객은 직원 계정의 권한을 업무에 필요한 범위로 지정하고, 퇴사자 계정은 지체 없이 퇴사 처리한다.

제8조의3 (보안 사고의 통지)
① 공급자는 고객 데이터의 유출·훼손·무단 접근 등 보안 사고를 알게 된 때에는 알게 된 때부터 72시간 이내에 고객에게 사고 내용, 영향 범위, 조치 사항, 고객이 취할 수 있는 조치를 통지한다.
② 개인정보가 유출된 경우 공급자는 「개인정보 보호법」에 따라 정보주체 통지 및 개인정보보호위원회(또는 한국인터넷진흥원) 신고에 필요한 사항을 지원하며, 1천 명 이상의 정보주체 개인정보 유출 등 법령이 정한 경우에는 72시간 이내 신고가 이루어지도록 협조한다.
③ 공급자는 사고의 원인을 조사하고 재발 방지 대책을 수립하여 고객에게 알린다.

제8조의4 (재위탁 고지)
① 공급자는 서비스 운영을 위하여 다음 업체의 클라우드 서비스를 이용하며, 고객은 이에 동의한다.
  · Google LLC(Firebase · Google Cloud) — 데이터 저장, 인증, 서버 기능, 파일 보관
  · Vercel Inc. — 웹 화면 제공(호스팅)
② 공급자는 재위탁 업체를 변경하거나 추가하는 경우 사전에 고객에게 알린다.

제9조 (비밀유지)
양 당사자는 본 계약과 관련하여 알게 된 상대방의 영업상 비밀(고객 데이터·거래처·운임 정보 포함)을 계약 기간 중은 물론 종료 후에도 제3자에게 누설하거나 본 계약 외의 목적으로 사용하지 않는다.

제10조 (지식재산권)
서비스 및 그 구성 요소(프로그램, 디자인, 문서 등)에 관한 지식재산권은 공급자에게 있으며, 고객은 본 계약에 따른 이용 권한만을 가진다.

제11조 (계약의 해지)
① 일방이 본 계약을 위반하고 시정 요구를 받은 날부터 14일 이내에 시정하지 않으면 상대방은 계약을 해지할 수 있다.
② 고객이 약정 기간 중 자신의 사정으로 해지하는 경우, 약정에 따라 받은 할인·면제 금액(초기 도입비 면제 포함)을 반환한다.
③ 고객이 이용료를 2개월 이상 연체한 경우 공급자는 7일 이상의 기간을 정하여 최고한 후 서비스를 일시 중지하거나 계약을 해지할 수 있다.

제12조 (손해배상 및 책임의 제한)
① 일방의 고의 또는 과실로 상대방에게 손해가 발생한 경우 그 손해를 배상한다.
② 공급자의 손해배상 책임은 손해 발생일 직전 3개월간 고객이 지급한 이용료 총액을 한도로 한다. 다만 공급자의 고의 또는 중대한 과실로 인한 경우에는 그러하지 아니하다.
③ 천재지변, 통신사업자의 서비스 중단 등 공급자가 통제할 수 없는 사유로 인한 손해에 대하여 공급자는 책임을 지지 않는다.

제13조 (분쟁의 해결)
본 계약과 관련하여 분쟁이 발생한 경우 양 당사자는 상호 협의하여 해결하며, 협의가 이루어지지 않으면 공급자의 본점 소재지를 관할하는 법원을 제1심 관할 법원으로 한다.

제14조 (전자서명 및 효력)
본 계약은 「전자문서 및 전자거래 기본법」과 「전자서명법」에 따라 전자적 방식으로 체결할 수 있으며, 전자서명된 계약서는 서면 계약서와 동일한 효력을 가진다.

제15조 (특약 사항)
{{특약}}

본 계약의 성립을 증명하기 위하여 계약서를 작성하고, 양 당사자가 서명(전자서명 포함)한 후 각 1부씩 보관한다.

{{계약일}}`;
// ⭐ 2026-11-09 보안 조항(데이터 소유·삭제 확인서·정보 보호·72시간 통지·재위탁) — 저장된 양식에 [보안 조항 추가]로 넣는다
export const SECURITY_CLAUSES = `제8조의2 (정보 보호 조치)
① 공급자는 고객 데이터를 보호하기 위하여 다음 조치를 시행한다.
  1. 접근 통제: 회사별 데이터 분리, 직원 권한(역할)별 메뉴·데이터 접근 제한, 퇴사 처리 즉시 계정 사용 중지
  2. 암호화: 전송 구간 암호화(HTTPS/TLS) 및 저장 데이터 암호화(클라우드 기본 암호화)
  3. 백업: 매일 자동 백업, 백업본은 최소 30일 보관
  4. 기록 보관: 로그인·접속 기록과 보안 이벤트(새 기기 로그인, 해외 접속, 대량 다운로드 등)를 1년 이상 보관하고 이상 징후를 점검
② 고객은 직원 계정의 권한을 업무에 필요한 범위로 지정하고, 퇴사자 계정은 지체 없이 퇴사 처리한다.

제8조의3 (보안 사고의 통지)
① 공급자는 고객 데이터의 유출·훼손·무단 접근 등 보안 사고를 알게 된 때에는 알게 된 때부터 72시간 이내에 고객에게 사고 내용, 영향 범위, 조치 사항, 고객이 취할 수 있는 조치를 통지한다.
② 개인정보가 유출된 경우 공급자는 「개인정보 보호법」에 따라 정보주체 통지 및 개인정보보호위원회(또는 한국인터넷진흥원) 신고에 필요한 사항을 지원하며, 1천 명 이상의 정보주체 개인정보 유출 등 법령이 정한 경우에는 72시간 이내 신고가 이루어지도록 협조한다.
③ 공급자는 사고의 원인을 조사하고 재발 방지 대책을 수립하여 고객에게 알린다.

제8조의4 (재위탁 고지)
① 공급자는 서비스 운영을 위하여 다음 업체의 클라우드 서비스를 이용하며, 고객은 이에 동의한다.
  · Google LLC(Firebase · Google Cloud) — 데이터 저장, 인증, 서버 기능, 파일 보관
  · Vercel Inc. — 웹 화면 제공(호스팅)
② 공급자는 재위탁 업체를 변경하거나 추가하는 경우 사전에 고객에게 알린다.

`;
export const DEFAULT_TEMPLATES = [{ id: "kp-service", name: "LogisWeb 서비스 이용계약서 (기본)", body: DEFAULT_TEMPLATE_BODY }];

// 양식 → HTML (제N조/# 머리줄 굵게, {{변수}} 치환. 비어 있는 변수는 밑줄 칸으로)
export function renderContractHtml(body, vars, { highlight = false } = {}) {
  const fill = (k) => {
    const v = vars?.[k];
    if (v == null || String(v).trim() === "") return `<span class="blank">${highlight ? esc(k) : "&nbsp;".repeat(12)}</span>`;
    return highlight ? `<mark>${esc(v)}</mark>` : esc(v);
  };
  return String(body || "").split("\n").map((raw) => {
    const line = esc(raw).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => fill(k));
    if (/^#\s/.test(raw)) return `<h1>${line.replace(/^#\s/, "")}</h1>`;
    if (/^제\s*\d+\s*조/.test(raw)) return `<h4>${line}</h4>`;
    if (!raw.trim()) return `<div class="sp"></div>`;
    return `<p>${line}</p>`;
  }).join("");
}
export const CONTRACT_CSS = `
  .kp-contract{font-family:'Pretendard','Noto Sans KR','Malgun Gothic',sans-serif;color:#0F1A30;font-size:13.5px;line-height:1.85}
  .kp-contract h1{font-size:24px;letter-spacing:.18em;text-align:center;margin:4px 0 20px;font-weight:900}
  .kp-contract h4{font-size:14px;font-weight:900;margin:14px 0 2px}
  .kp-contract.big{font-size:15.5px;line-height:1.9} .kp-contract.big h1{font-size:28px} .kp-contract.big h4{font-size:16px;margin-top:18px}
  .kp-contract p{margin:0} .kp-contract .sp{height:8px}
  .kp-contract mark{background:#EEF3FB;color:#1B2B4B;font-weight:800;padding:0 3px;border-radius:3px}
  .kp-contract .blank{display:inline-block;min-width:80px;border-bottom:1px solid #8FB0F0;color:#9AA9C3;font-size:11.5px}
  .kp-sign{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:22px}
  .kp-sign>div{border:1px solid #D5DEEC;border-radius:12px;padding:12px 14px;min-height:150px;position:relative}
  .kp-sign .t{font-size:10.5px;font-weight:800;letter-spacing:.2em;color:#4B6CB7;font-family:${C_MONO}}
  .kp-sign .r{font-size:13px;line-height:1.7;margin-top:4px} .kp-sign img{position:absolute;right:12px;bottom:10px;max-height:78px;max-width:150px}
`;
export function signBlockHtml(c) {
  const s = c.supplier || {}, k = c.vars || {};
  return `<div class="kp-sign">
    <div><div class="t">SUPPLIER · 공급자</div><div class="r">상호 ${esc(s.name || "")}<br>대표 ${esc(s.ceo || "")} (인)<br>사업자번호 ${esc(s.bizNo || "")}<br>주소 ${esc(s.address || "")}</div>${c.supplierSeal ? `<img src="${c.supplierSeal}" alt="">` : ""}</div>
    <div><div class="t">CUSTOMER · 고객</div><div class="r">상호 ${esc(k.고객사 || "")}<br>대표 ${esc(k.고객대표 || "")} ${c.signer?.name ? `(서명: ${esc(c.signer.name)}${c.signer.title ? ` ${esc(c.signer.title)}` : ""})` : "(인)"}<br>사업자번호 ${esc(k.고객사업자번호 || "")}<br>주소 ${esc(k.고객주소 || "")}</div>${c.signatureImg ? `<img src="${c.signatureImg}" alt="">` : ""}</div>
  </div>
  ${c.status === "서명완료" ? `<div style="margin-top:12px;font-size:10.5px;color:#7A89A3;font-family:${C_MONO};line-height:1.6">전자서명 ${c.signedAt?.toDate ? c.signedAt.toDate().toLocaleString("ko-KR") : ""} · 문서 지문(SHA-256) ${esc(c.signedHash || "")}</div>` : ""}`;
}
export function printContract(c) {
  const w = window.open("", "_blank", "width=920,height=1100");
  if (!w) { window.alert("팝업이 차단되었습니다. 팝업을 허용해 주세요."); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.title || "계약서")}</title><style>
    body{margin:0;background:#E9EDF3} .page{width:210mm;min-height:297mm;margin:10mm auto;background:#fff;padding:18mm 17mm}
    .bar{position:sticky;top:0;background:#0F1A30;padding:10px;text-align:center}.bar button{height:34px;padding:0 16px;border-radius:8px;border:0;background:#fff;font-weight:800;cursor:pointer;margin:0 4px}
    .no{font-family:${C_MONO};font-size:10px;color:#9AA9C3;letter-spacing:.14em;text-align:right}
    @media print{body{background:#fff}.page{margin:0}.bar{display:none}} ${CONTRACT_CSS}</style></head><body>
    <div class="bar"><button onclick="window.print()">인쇄 / PDF로 저장</button><button onclick="window.close()">닫기</button></div>
    <div class="page"><div class="no">No. ${esc(c.no || "")} · ${esc(c.status || "")}</div><div class="kp-contract">${c.bodyHtml || ""}</div>${signBlockHtml(c)}</div></body></html>`);
  w.document.close();
}
export const signUrlOf = (id) => `${window.location.origin}/sign/${id}`;

// ─── 데이터 ───
export function useContractTemplates() {
  const [t, setT] = React.useState(null);
  React.useEffect(() => onSnapshot(doc(db, "siteConfig", "contractTemplates"), (s) => {
    const d = s.exists() ? s.data() : {};
    setT({ templates: d.templates?.length ? d.templates : DEFAULT_TEMPLATES, supplierSeal: d.supplierSeal || "" });
  }, () => setT({ templates: DEFAULT_TEMPLATES, supplierSeal: "" })), []);
  return t;
}
export function useContracts() {
  const [list, setList] = React.useState(null);
  React.useEffect(() => onSnapshot(query(collection(db, "contracts"), orderBy("createdAt", "desc")), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([])), []);
  return list;
}

// ─── 공용 부품 ───
const inp = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#4B6CB7]";
function Card({ code, title, right, children, className = "", bodyClass = "p-5" }) {
  return (
    <div className={`bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)] overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-x-3 gap-y-1.5 flex-wrap px-4 sm:px-5 py-2 min-h-[46px] sm:min-h-[50px] bg-[#F7F9FC] border-b border-[#E8EDF4]">
        <div className="flex items-center gap-2 min-w-0"><span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" />
          <span className="text-[10.5px] font-extrabold tracking-[0.2em] text-[#94A3B8]" style={{ fontFamily: C_MONO, fontVariantNumeric: "tabular-nums" }}>{code}</span>
          <span className="text-[15px] sm:text-[16px] font-black text-[#0F1A30] truncate whitespace-nowrap">{title}</span></div>
        {right}
      </div>
      <div className={bodyClass}>{children}</div>
    </div>
  );
}
const STATUS_STYLE = {
  작성: "border border-[#DCE3EE] text-[#3A4A66] bg-white",
  발송: "bg-[#DCE6F7] text-[#1B2B4B]",
  서명완료: "bg-[#1B2B4B] text-white",
  취소: "bg-[#E9EDF3] text-[#7A89A3] line-through",
};
const Status = ({ s }) => <span className={`inline-flex px-2.5 py-1 rounded-lg text-[12px] font-black whitespace-nowrap ${STATUS_STYLE[s] || STATUS_STYLE.작성}`}>{s === "발송" ? "서명 대기" : s}</span>;

// ═══════════════════════ ① 계약 현황 ═══════════════════════
export function ContractList({ onNew, onEdit }) {
  const list = useContracts();
  const [filter, setFilter] = React.useState("전체");
  const [copied, setCopied] = React.useState("");
  if (!list) return <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>;
  const today = ymd();
  const soon = list.filter((c) => c.status === "서명완료" && c.vars?.종료일 && c.vars.종료일 >= today && c.vars.종료일 <= addMonths(today, 2));
  const signedMRR = list.filter((c) => c.status === "서명완료" && (!c.vars?.종료일 || c.vars.종료일 >= today)).reduce((a, c) => a + (Number(c.monthly) || 0), 0);
  const shown = list.filter((c) => filter === "전체" || (filter === "만료 임박" ? soon.includes(c) : c.status === filter));
  const copy = async (c) => { try { await navigator.clipboard.writeText(signUrlOf(c.id)); setCopied(c.id); setTimeout(() => setCopied(""), 1600); } catch { (await kpPrompt("서명 링크를 복사하세요", signUrlOf(c.id))); } };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[["작성 중", list.filter((c) => c.status === "작성").length, "건"], ["서명 대기", list.filter((c) => c.status === "발송").length, "건"], ["서명 완료", list.filter((c) => c.status === "서명완료").length, "건"], ["만료 임박(2개월)", soon.length, "건"], ["계약 월 매출", signedMRR.toLocaleString(), "원"]].map(([l, v, u], i) => (
          <div key={l} className={`rounded-[16px] px-4 py-3.5 border ${i === 4 ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white border-[#E3E8F0]"}`}>
            <div className={`text-[12.5px] font-bold ${i === 4 ? "text-white/60" : "text-[#7A879C]"}`}>{l}</div>
            <div className="text-[24px] font-black mt-0.5" style={{ fontFamily: C_MONO, fontVariantNumeric: "tabular-nums" }}>{v}<span className={`text-[13px] ml-1 ${i === 4 ? "text-white/50" : "text-[#9AA9C3]"}`}>{u}</span></div>
          </div>
        ))}
      </div>
      <Card code="CONTRACTS" title="계약 현황" bodyClass="p-0" right={
        <div className="flex items-center gap-2">
          <div className="hidden md:flex gap-1 p-1 rounded-xl bg-[#EEF2F8]">{["전체", "작성", "발송", "서명완료", "만료 임박", "취소"].map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`h-7 px-3 rounded-lg text-[12.5px] font-black ${filter === f ? "bg-[#1B2B4B] text-white" : "text-[#3A4A66]"}`}>{f === "발송" ? "서명 대기" : f}</button>))}</div>
          <button type="button" onClick={onNew} className="h-9 px-4 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black">+ 계약서 작성</button>
        </div>}>
        {shown.length === 0 ? <div className="py-16 text-center text-[#9AA9C3]">계약서가 없습니다 — 오른쪽 위 '계약서 작성' 또는 견적 이력의 '계약서 만들기'로 시작하세요.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] border-collapse" style={{ minWidth: 1000 }}>
              <thead><tr className="bg-[#1B2B4B] text-white">{["계약번호", "고객사", "요금제", "월 이용료", "기간", "상태", "서명", ""].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>{shown.map((c) => (
                <tr key={c.id} className="border-t border-[#EEF1F6] hover:bg-[#F5F8FD]">
                  <td className="px-3 py-2.5 text-center text-[12.5px] text-[#5B6B85]" style={{ fontFamily: C_MONO, fontVariantNumeric: "tabular-nums" }}>{c.no}</td>
                  <td className="px-3 py-2.5 font-black text-[#0F1A30]">{c.vars?.고객사 || "-"}{soon.includes(c) && <span className="ml-2 px-1.5 py-0.5 rounded-md border border-[#1B2B4B] text-[10.5px] font-black text-[#1B2B4B]">만료 임박</span>}</td>
                  <td className="px-3 py-2.5 text-center">{c.vars?.요금제 || "-"}</td>
                  <td className="px-3 py-2.5 text-right font-black" style={{ fontFamily: C_MONO, fontVariantNumeric: "tabular-nums" }}>{Number(c.monthly || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-center text-[12.5px] text-[#5B6B85]" style={{ fontFamily: C_MONO, fontVariantNumeric: "tabular-nums" }}>{c.vars?.시작일 || "-"} ~ {c.vars?.종료일 || "-"}</td>
                  <td className="px-3 py-2.5 text-center"><Status s={c.status} /></td>
                  <td className="px-3 py-2.5 text-center text-[12.5px] text-[#5B6B85]">{c.status === "서명완료" ? `${c.signer?.name || ""} · ${c.signedAt?.toDate ? ymd(c.signedAt.toDate()) : ""}` : c.status === "발송" ? (c.viewedAt ? "열람함" : "미열람") : "-"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-right">
                    {c.status === "작성" && <button type="button" onClick={() => onEdit(c)} className="h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black mr-1">수정</button>}
                    {c.status === "작성" && <button type="button" onClick={async () => { if (await kpConfirm(`${c.vars?.고객사} 계약서를 서명 요청 상태로 바꿀까요?\n링크를 고객에게 보내면 로그인 없이 서명할 수 있습니다.`)) { await updateDoc(doc(db, "contracts", c.id), { status: "발송", sentAt: serverTimestamp() }); copy(c); } }} className="h-8 px-3 rounded-lg border border-[#1B2B4B] text-[12.5px] font-black text-[#1B2B4B] mr-1">서명 요청</button>}
                    {c.status === "발송" && <button type="button" onClick={() => copy(c)} className="h-8 px-3 rounded-lg border border-[#1B2B4B] text-[12.5px] font-black text-[#1B2B4B] mr-1">{copied === c.id ? "복사됨 ✓" : "서명 링크 복사"}</button>}
                    <button type="button" onClick={() => printContract(c)} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B] mr-1">보기·인쇄</button>
                    {c.status !== "서명완료" && c.status !== "취소" && <button type="button" onClick={async () => (await kpConfirm("이 계약서를 취소할까요? 서명 링크도 더 이상 쓸 수 없습니다.")) && updateDoc(doc(db, "contracts", c.id), { status: "취소" })} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-bold text-[#7A879C] mr-1">취소</button>}
                    {c.status !== "서명완료" && <button type="button" onClick={async () => (await kpConfirm("계약서를 완전히 삭제할까요?")) && runDelete({ label: "계약서", task: () => deleteDoc(doc(db, "contracts", c.id)) }).catch(() => {})} /* ⭐ 2026-11-05 삭제 진행 창 */ className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-bold text-[#7A879C]">삭제</button>}
                  </td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="text-[12px] text-[#9AA9C3] leading-relaxed">※ 서명 링크는 추측할 수 없는 주소로 만들어지며, 링크를 받은 사람만 열 수 있습니다. 서명이 끝난 계약서는 수정·삭제할 수 없고, 서명 시각과 문서 지문(SHA-256)이 함께 남습니다.</div>
    </div>
  );
}

// ═══════════════════════ ② 계약서 작성 ═══════════════════════
const fromQuote = (q, cfg) => {
  const inp2 = q?.input || {};
  const plan = (q?.pricing?.plans || cfg?.plans || []).find((p) => p.name === q?.plan) || {};
  const opts = [];
  if (Number(inp2.fleet)) opts.push(`지입차 관리 ${inp2.fleet}대`);
  if (Number(inp2.staff) > Number(plan.seats || 0)) opts.push(`추가 직원 계정 ${Number(inp2.staff) - Number(plan.seats || 0)}명`);
  return {
    고객사: q?.customer || "", 고객연락처: inp2.phone || "", 요금제: q?.plan || "", 직원계정: String(plan.seats ?? ""), 포함오더: plan.orders ? Number(plan.orders).toLocaleString() : "",
    월이용료: q?.monthly != null ? won(q.monthly) : "", 초기비용: q?.oneTime != null ? won(q.oneTime) : "", 계약기간: String(inp2.contractMonths || 12),
    결제방식: inp2.billing === "annual" ? "연간 선결제" : inp2.billing === "semi" ? "6개월 선결제" : "월 결제(계좌이체)", 추가옵션: opts.join(", ") || "없음", 특약: inp2.memo || "없음",
  };
};
// 계약서에 찍히는 공급자 — 화면에서 고친 값(vars) 우선, 비어 있으면 등록된 공급자 정보
const supplierOf = (cfg, vars) => {
  const s = cfg?.supplier || {};
  return { ...s, name: vars.공급자상호 || s.name || "", ceo: vars.공급자대표 || s.ceo || "", bizNo: vars.공급자사업자번호 || s.bizNo || "", address: vars.공급자주소 || s.address || "", phone: vars.공급자연락처 || s.phone || "" };
};
export function ContractBuilder({ initial, fromQuoteDoc, onDone }) {
  const tpl = useContractTemplates();
  const cfg = useSalesPricing();
  const [quotes, setQuotes] = React.useState([]);
  React.useEffect(() => onSnapshot(query(collection(db, "salesQuotes"), orderBy("createdAt", "desc")), (s) => setQuotes(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}), []);
  const [tplId, setTplId] = React.useState(initial?.templateId || "kp-service");
  const [vars, setVars] = React.useState(() => initial?.vars || { 계약일: ymd(), 시작일: ymd(), 결제일: "말일", 계약기간: "12", 특약: "없음" });
  const [monthly, setMonthly] = React.useState(initial?.monthly || 0);
  const [quoteNo, setQuoteNo] = React.useState(initial?.quoteNo || "");
  const [busy, setBusy] = React.useState(false);
  const applyQuote = React.useCallback((q) => {
    if (!q) return;
    setVars((v) => ({ ...v, ...fromQuote(q, cfg) }));
    setMonthly(Number(q.monthly) || 0); setQuoteNo(q.no || "");
  }, [cfg]);
  React.useEffect(() => { if (fromQuoteDoc && cfg) applyQuote(fromQuoteDoc); }, [fromQuoteDoc, cfg, applyQuote]);
  // 공급자 정보는 요금제 관리 › 공급자 정보에서 자동
  React.useEffect(() => {
    if (!cfg) return;
    const s = cfg.supplier || {};
    setVars((v) => ({ ...v, 공급자상호: v.공급자상호 || s.name || "", 공급자대표: v.공급자대표 || s.ceo || "", 공급자사업자번호: v.공급자사업자번호 || s.bizNo || "", 공급자주소: v.공급자주소 || s.address || "", 공급자연락처: v.공급자연락처 || s.phone || "" }));
  }, [cfg]);
  React.useEffect(() => { if (vars.시작일 && vars.계약기간) setVars((v) => ({ ...v, 종료일: addMonths(v.시작일, v.계약기간) })); }, [vars.시작일, vars.계약기간]);
  if (!tpl || !cfg) return <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>;
  const template = tpl.templates.find((t) => t.id === tplId) || tpl.templates[0];
  const set = (k, v) => setVars((p) => ({ ...p, [k]: v }));
  const save = async (send) => {
    if (!String(vars.고객사 || "").trim()) { window.alert("고객사를 입력해 주세요."); return; }
    setBusy(true);
    try {
      const id = initial?.id || randomId();
      const d = new Date();
      const no = initial?.no || `C-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${String(d.getHours() * 60 + d.getMinutes()).padStart(4, "0")}`;
      const data = {
        no, title: `${template.name} — ${vars.고객사}`, templateId: template.id, templateName: template.name, vars, monthly: Number(monthly) || 0, quoteNo,
        bodyHtml: renderContractHtml(template.body, vars), supplier: supplierOf(cfg, vars), supplierSeal: tpl.supplierSeal || "",
        status: send ? "발송" : "작성", updatedAt: serverTimestamp(), ...(initial?.id ? {} : { createdAt: serverTimestamp() }), ...(send ? { sentAt: serverTimestamp() } : {}),
      };
      await setDoc(doc(db, "contracts", id), data, { merge: true });
      if (send) {
        try { await navigator.clipboard.writeText(signUrlOf(id)); window.alert(`서명 요청 링크를 복사했습니다.\n고객에게 문자·메일로 보내 주세요.\n\n${signUrlOf(id)}`); }
        catch { (await kpPrompt("서명 링크를 복사해 고객에게 보내 주세요", signUrlOf(id))); }
      }
      onDone?.();
    } catch (e) { window.alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const F = ({ k, label, type = "text", ph }) => type === "date" ? (
    // 📅 2026-11-04 날짜는 프로그램 달력으로(저장 형식 YYYY-MM-DD 그대로)
    <label className="block"><span className="text-[12px] font-bold text-[#7A879C]">{label}</span>
      <CustomDatePicker value={vars[k] || ""} onChange={(e) => set(k, e.target.value)} className={`${inp} mt-1 w-full tabular-nums whitespace-nowrap`} showIcon /></label>
  ) : (
    <label className="block"><span className="text-[12px] font-bold text-[#7A879C]">{label}</span>
      <input type={type} value={vars[k] || ""} placeholder={ph || (/사업자번호$/.test(k) ? "000-00-00000" : /연락처$/.test(k) ? "010-0000-0000" : undefined)} inputMode={/연락처$/.test(k) ? "tel" : /사업자번호$/.test(k) ? "numeric" : undefined} onChange={(e) => set(k, /연락처$/.test(k) ? fmtPhone(e.target.value) : /사업자번호$/.test(k) ? fmtBizNo(e.target.value) : e.target.value)} className={`${inp} mt-1`} /></label>
  );
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)] items-start">
      <div className="space-y-4">
        <Card code="SOURCE" title="양식 · 견적 불러오기">
          <div className="space-y-3">
            <label className="block"><span className="text-[12px] font-bold text-[#7A879C]">계약서 양식</span>
              <CustomSelect value={tplId} onChange={(e) => setTplId(e.target.value)} className={`${inp} mt-1`}>{tpl.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</CustomSelect></label>
            <label className="block"><span className="text-[12px] font-bold text-[#7A879C]">저장한 견적에서 채우기</span>
              <CustomSelect value="" onChange={(e) => applyQuote(quotes.find((q) => q.id === e.target.value))} className={`${inp} mt-1`}>
                <option value="">{quoteNo ? `불러옴: ${quoteNo}` : "견적 선택…"}</option>
                {quotes.map((q) => <option key={q.id} value={q.id}>{q.customer} · {q.plan} · 월 {Number(q.monthly || 0).toLocaleString()}원 ({q.no})</option>)}
              </CustomSelect></label>
          </div>
        </Card>
        <Card code="CUSTOMER" title="고객사 정보">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="col-span-2">{F({ k: "고객사", label: "고객사 상호 *" })}</div>
            {F({ k: "고객대표", label: "대표자" })}{F({ k: "고객사업자번호", label: "사업자번호" })}
            <div className="col-span-2">{F({ k: "고객주소", label: "주소" })}</div>
            <div className="col-span-2">{F({ k: "고객연락처", label: "연락처" })}</div>
          </div>
        </Card>
        {/* ⭐ 2026-11-04 공급자(우리) 정보 — 요금제 관리 › 공급자 정보에 등록된 값이 자동으로 채워진다(빈 칸만 채움 · 고쳐 쓸 수 있음) */}
        <Card code="SUPPLIER" title="공급자 정보" right={<span className="text-[11.5px] font-bold text-[#7A879C] whitespace-nowrap">등록 정보 자동 입력</span>}>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="col-span-2">{F({ k: "공급자상호", label: "공급자 상호" })}</div>
            {F({ k: "공급자대표", label: "대표자" })}{F({ k: "공급자사업자번호", label: "사업자번호" })}
            <div className="col-span-2">{F({ k: "공급자주소", label: "주소" })}</div>
            <div className="col-span-2">{F({ k: "공급자연락처", label: "연락처" })}</div>
          </div>
        </Card>
        <Card code="TERMS" title="계약 조건">
          <div className="grid grid-cols-2 gap-2.5">
            {F({ k: "요금제", label: "요금제" })}{F({ k: "월이용료", label: "월 이용료", ph: "199,000원" })}
            {F({ k: "직원계정", label: "포함 직원 계정" })}{F({ k: "포함오더", label: "포함 오더(월)" })}
            {F({ k: "초기비용", label: "초기 비용" })}{F({ k: "결제방식", label: "결제 방식" })}
            {F({ k: "시작일", label: "서비스 시작일", type: "date" })}
            <label className="block"><span className="text-[12px] font-bold text-[#7A879C]">계약 기간</span>
              <CustomSelect value={vars.계약기간 || "12"} onChange={(e) => set("계약기간", e.target.value)} className={`${inp} mt-1`}>{["6", "12", "24", "36"].map((m) => <option key={m} value={m}>{m}개월</option>)}</CustomSelect></label>
            {F({ k: "종료일", label: "종료일(자동)", type: "date" })}{F({ k: "결제일", label: "매월 결제일", ph: "말일 / 10일" })}
            <div className="col-span-2">{F({ k: "추가옵션", label: "추가 옵션" })}</div>
            <div className="col-span-2"><label className="block"><span className="text-[12px] font-bold text-[#7A879C]">특약 사항</span>
              <textarea value={vars.특약 || ""} onChange={(e) => set("특약", e.target.value)} rows={3} className={`${inp} h-auto py-2 mt-1 leading-relaxed`} /></label></div>
            {F({ k: "계약일", label: "계약일", type: "date" })}
            <label className="block"><span className="text-[12px] font-bold text-[#7A879C]">월 금액(집계용, 숫자)</span>
              <input inputMode="numeric" value={monthly ? Number(monthly).toLocaleString() : ""} onChange={(e) => setMonthly(Number(e.target.value.replace(/[^\d]/g, "")) || 0)} className={`${inp} mt-1 text-right`} style={{ fontFamily: C_MONO, fontVariantNumeric: "tabular-nums" }} /></label>
          </div>
        </Card>
        <div className="flex gap-2">
          <button type="button" onClick={() => save(false)} disabled={busy} className="flex-1 h-12 rounded-2xl border border-[#1B2B4B] text-[#1B2B4B] text-[14px] font-black disabled:opacity-50">{initial?.id ? "수정 저장" : "작성 저장"}</button>
          <button type="button" onClick={() => save(true)} disabled={busy} className="flex-[1.4] h-12 rounded-2xl text-white text-[14px] font-black disabled:opacity-50 shadow-[0_10px_24px_rgba(15,26,48,0.28)]" style={{ background: "linear-gradient(135deg,#0F1A30,#1B2B4B 55%,#2D4C82)" }}>저장하고 서명 요청</button>
        </div>
      </div>
      <div className="rounded-[20px] bg-[#E9EDF3] p-5 xl:sticky xl:top-4 max-h-[calc(100vh-140px)] overflow-auto">
        <div className="flex items-center justify-between gap-3 mb-3 px-1 min-w-0">
          <span className="text-[12px] font-extrabold tracking-[0.2em] text-[#5A6A85] whitespace-nowrap" style={{ fontFamily: C_MONO, fontVariantNumeric: "tabular-nums" }}>LIVE PREVIEW</span>
          <span className="text-[12px] font-bold text-[#7A879C] whitespace-nowrap truncate">밝게 표시된 곳이 채워진 값입니다</span>
        </div>
        <style>{CONTRACT_CSS}</style>
        <div className="bg-white mx-auto w-full max-w-[1180px] px-12 py-12 shadow-[0_10px_30px_rgba(15,26,48,0.12)]">
          <div className="kp-contract big" dangerouslySetInnerHTML={{ __html: renderContractHtml(template.body, vars, { highlight: true }) }} />
          <div dangerouslySetInnerHTML={{ __html: signBlockHtml({ supplier: supplierOf(cfg, vars), supplierSeal: tpl.supplierSeal, vars, status: "작성" }) }} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════ ③ 계약서 양식 ═══════════════════════
export function ContractTemplates() {
  const live = useContractTemplates();
  const [st, setSt] = React.useState(null);
  const [cur, setCur] = React.useState(0);
  const [dirty, setDirty] = React.useState(false);
  const taRef = React.useRef(null);
  React.useEffect(() => { if (live && !dirty) setSt(live); }, [live, dirty]);
  if (!st) return <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>;
  const t = st.templates[Math.min(cur, st.templates.length - 1)];
  const upd = (patch) => { setSt((s) => ({ ...s, templates: s.templates.map((x) => (x.id === t.id ? { ...x, ...patch } : x)) })); setDirty(true); };
  const save = async () => { try { await setDoc(doc(db, "siteConfig", "contractTemplates"), { templates: st.templates, supplierSeal: st.supplierSeal || "", updatedAt: serverTimestamp() }); setDirty(false); window.alert("양식을 저장했습니다. 새로 만드는 계약서부터 적용됩니다."); } catch (e) { window.alert(`저장 실패: ${e.message}`); } };
  const insertVar = (k) => {
    const ta = taRef.current; const token = `{{${k}}}`;
    if (!ta) { upd({ body: `${t.body}${token}` }); return; }
    const a = ta.selectionStart, b = ta.selectionEnd;
    upd({ body: t.body.slice(0, a) + token + t.body.slice(b) });
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = a + token.length; }, 0);
  };
  const sample = Object.fromEntries(CONTRACT_VARS.map(([k]) => [k, `〈${k}〉`]));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-[18px] px-5 py-3.5 bg-[#0F1A30] text-white">
        <div className="text-[13.5px]"><b>계약서 양식은 언제든 고칠 수 있습니다.</b> <span className="text-white/60">이미 서명된 계약서는 서명 당시 내용 그대로 보관됩니다.</span></div>
        <div className="flex gap-2">
          <button type="button" onClick={() => { const id = `t${Date.now()}`; setSt((s) => ({ ...s, templates: [...s.templates, { id, name: `${t.name} (복사본)`, body: t.body }] })); setCur(st.templates.length); setDirty(true); }} className="h-10 px-4 rounded-xl bg-white/10 ring-1 ring-white/25 text-[13px] font-black">복제</button>
          <button type="button" onClick={async () => { if ((await kpConfirm("이 양식을 기본 문구로 되돌릴까요?"))) upd({ body: DEFAULT_TEMPLATE_BODY }); }} className="h-10 px-4 rounded-xl bg-white/10 ring-1 ring-white/25 text-[13px] font-black">기본 문구로</button>
          <button type="button" title="데이터 보호 조치 · 보안 사고 72시간 통지 · 재위탁 고지 조항을 비밀유지 조항 앞에 넣습니다" onClick={() => {
            if (String(t.body || "").includes("제8조의3 (보안 사고의 통지)")) { window.alert("이미 보안 조항이 들어 있습니다."); return; }
            const body = String(t.body || "");
            const i = body.indexOf("제9조 (비밀유지)");
            upd({ body: i >= 0 ? body.slice(0, i) + SECURITY_CLAUSES + body.slice(i) : `${body.trimEnd()}\n\n${SECURITY_CLAUSES}` });
          }} className="h-10 px-4 rounded-xl bg-white/10 ring-1 ring-white/25 text-[13px] font-black">보안 조항 추가</button>
          <button type="button" onClick={save} disabled={!dirty} className="h-10 px-5 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black disabled:opacity-40">{dirty ? "저장" : "저장됨"}</button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[240px_minmax(0,0.9fr)_minmax(0,1.1fr)] items-start">
        <Card code="LIST" title="양식" bodyClass="p-2">
          {st.templates.map((x, i) => (
            <div key={x.id} className={`flex items-center gap-1 rounded-xl ${i === cur ? "bg-[#1B2B4B] text-white" : "hover:bg-[#F5F8FD] text-[#0F1A30]"}`}>
              <button type="button" onClick={() => setCur(i)} className="flex-1 text-left px-3 py-2.5 text-[13.5px] font-black truncate">{x.name}</button>
              {st.templates.length > 1 && <button type="button" title="삭제" onClick={async () => { if ((await kpConfirm(`'${x.name}' 양식을 지울까요?`))) { setSt((s) => ({ ...s, templates: s.templates.filter((y) => y.id !== x.id) })); setCur(0); setDirty(true); } }} className={`px-2 ${i === cur ? "text-white/60" : "text-[#9AA9C3]"}`}>✕</button>}
            </div>
          ))}
          <div className="mt-3 px-2 pb-2">
            <div className="text-[12px] font-black text-[#5B6B85] mb-1.5">공급자 직인 (모든 계약서에 찍힘)</div>
            {st.supplierSeal ? (
              <div className="flex items-center gap-2"><img src={st.supplierSeal} alt="" className="h-16 w-16 object-contain border border-[#E3E8F0] rounded-lg bg-white" />
                <button type="button" onClick={() => { setSt((s) => ({ ...s, supplierSeal: "" })); setDirty(true); }} className="text-[12px] font-bold text-[#7A879C]">지우기</button></div>
            ) : (
              <label className="block h-16 rounded-lg border-2 border-dashed border-[#C9D2E0] text-[12px] font-bold text-[#7A879C] flex items-center justify-center cursor-pointer">+ 직인 이미지(PNG)
                <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 400 * 1024) { window.alert("400KB 이하 이미지를 올려 주세요."); return; } const r = new FileReader(); r.onload = () => { setSt((s) => ({ ...s, supplierSeal: r.result })); setDirty(true); }; r.readAsDataURL(f); }} /></label>
            )}
          </div>
        </Card>
        <Card code="EDIT" title="양식 편집">
          <label className="block mb-2"><span className="text-[12px] font-bold text-[#7A879C]">양식 이름</span><input value={t.name} onChange={(e) => upd({ name: e.target.value })} className={`${inp} mt-1`} /></label>
          <div className="text-[12px] font-bold text-[#7A879C] mb-1.5">자리표시 넣기 <span className="font-semibold">(누르면 커서 위치에 들어갑니다)</span></div>
          <div className="flex flex-wrap gap-1 mb-2">{CONTRACT_VARS.map(([k, d]) => <button key={k} type="button" title={d} onClick={() => insertVar(k)} className="h-7 px-2 rounded-md border border-[#DCE3EE] text-[11.5px] font-bold text-[#1B2B4B] hover:border-[#4B6CB7]" style={{ fontFamily: C_MONO, fontVariantNumeric: "tabular-nums" }}>{`{{${k}}}`}</button>)}</div>
          <textarea ref={taRef} value={t.body} onChange={(e) => upd({ body: e.target.value })} rows={28} className={`${inp} h-auto py-3 leading-[1.75] text-[13px] font-medium`} style={{ fontFamily: "inherit" }} />
          <div className="mt-2 text-[11.5px] text-[#9AA9C3] leading-relaxed">작성 규칙: 맨 앞에 <b>#</b> 을 붙이면 제목, <b>제N조</b>로 시작하는 줄은 굵은 조항 제목이 됩니다.</div>
        </Card>
        <Card code="PREVIEW" title="미리보기" bodyClass="p-0" className="xl:col-start-2 2xl:col-start-auto">
          <style>{CONTRACT_CSS}</style>
          <div className="max-h-[900px] overflow-auto bg-[#E9EDF3] p-4"><div className="bg-white px-10 py-10 shadow"><div className="kp-contract big" dangerouslySetInnerHTML={{ __html: renderContractHtml(t.body, sample, { highlight: true }) }} /></div></div>
        </Card>
      </div>
    </div>
  );
}
