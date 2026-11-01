import { bankText } from "./bankUtil";
// ======================= src/approvalForms.js =======================
// 📝 전자결재 양식 정의(2026-10-28) — 3개 묶음(근태·휴가 / 비용·지출 / 업무 기안·품의)과 양식별 입력칸.
//  필드 type: text | textarea | date | time | daterange | select | number | money | staff | items
//  - items: 품목 표(name, qty, price → 금액 자동) / costs: 항목별 금액 표(label, amount)
//  - 양식의 summary(d) → 목록에 보일 한 줄 요약, amount(d) → 금액(비용 양식), days(d) → 휴가 일수

export const APPROVAL_CATS = [
  { key: "leave", label: "근태·휴가 신청", en: "ATTENDANCE", icon: "clock", desc: "휴가 · 반차 · 조퇴 · 외근 · 출장 · 경조사 · 병가 · 육아휴직 · 출산휴가 · 근무 신청" },
  { key: "expense", label: "비용·지출 결의", en: "EXPENSE", icon: "wallet", desc: "지출결의 · 법인카드 · 유류비/통행료 · 출장비 · 가지급금 · 구매 · 사고처리" },
  { key: "draft", label: "업무 기안·품의", en: "PROPOSAL", icon: "file", desc: "기안·품의서 · 운임 변경 · 신규 거래처 · 차량 정비 · 제증명" },
  { key: "report", label: "업무 보고·인사", en: "REPORT", icon: "list", desc: "일일 업무일지 · 업무 보고서 · 출장 보고서 · 회의록 · 교육 결과 · 시말서 · 사직서" },
];

import { isWeekend, isHoliday } from "./attendanceUtils";

const won = (n) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;
export const fmtWon = won;
const dayDiff = (r) => {
  if (!r?.start) return 0;
  const a = new Date(r.start); const b = new Date(r.end || r.start);
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
};
// 주말·공휴일(대체·임시공휴일 포함)을 뺀 실제 근무일 수 — 휴가 일수는 이걸로 센다
const pad = (n) => String(n).padStart(2, "0");
const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const bizDays = (r) => {
  if (!r?.start) return 0;
  const a = new Date(`${r.start}T00:00:00`); const b = new Date(`${r.end || r.start}T00:00:00`);
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  let n = 0;
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) { const k = dstr(d); if (!isWeekend(k) && !isHoliday(k, [])) n += 1; }
  return n;
};
export const rangeText = (r) => (r?.start ? (r.end && r.end !== r.start ? `${r.start} ~ ${r.end}` : r.start) : "");
const itemsTotal = (rows) => (rows || []).reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.price) || 0), 0);
const costsTotal = (rows) => (rows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
export { itemsTotal, costsTotal, dayDiff };

// 📅 연차·월차 발생(근로기준법 기준) — 입사일 기준 회기
//  1년 미만: 1개월 개근마다 1일(최대 11일, "월차") / 1년 이상: 15일 + 3년차부터 2년마다 1일(최대 25일)
export function leaveEntitlement(hireDate, now = new Date()) {
  if (!hireDate) return null;
  const hire = new Date(`${hireDate}T00:00:00`);
  if (isNaN(hire)) return null;
  const months = Math.max(0, (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth()) - (now.getDate() < hire.getDate() ? 1 : 0));
  const years = Math.floor(months / 12);
  const add = (base, y) => { const d = new Date(base); d.setFullYear(d.getFullYear() + y); return d; };
  if (years < 1) {
    const end = add(hire, 1); end.setDate(end.getDate() - 1);
    return { label: "월차", years, months, total: Math.min(11, months), from: dstr(hire), to: dstr(end) };
  }
  const start = add(hire, years);
  const end = add(hire, years + 1); end.setDate(end.getDate() - 1);
  return { label: "연차", years, months, total: Math.min(25, 15 + Math.floor((years - 1) / 2)), from: dstr(start), to: dstr(end) };
}
// 연차로 차감하는 신청인지 / 며칠인지
export const LEAVE_KINDS = ["연차", "하계휴가"];
export function leaveUseOf(d) {
  if (!d || d.cat !== "leave") return null;
  if (d.form === "annual" && LEAVE_KINDS.includes(d.data?.kind || "연차")) return { date: d.data?.period?.start || "", days: bizDays(d.data?.period) };
  if (d.form === "half") return { date: d.data?.date || "", days: String(d.data?.ampm || "").includes("반반차") ? 0.25 : 0.5 };
  return null;
}

const ACCOUNTS = ["복리후생비", "여비교통비", "차량유지비", "운반비", "접대비", "소모품비", "통신비", "지급수수료", "교육훈련비", "도서인쇄비", "기타"];
const PAY = ["법인카드", "개인카드(정산 요청)", "계좌이체", "현금"];

export const APPROVAL_FORMS = [
  // ───────── 근태·휴가 ─────────
  { key: "annual", cat: "leave", label: "연차휴가", title: "휴 가 신 청 서", code: "HL",
    fields: [
      { k: "kind", label: "휴가 구분", type: "select", options: ["연차", "하계휴가", "포상휴가", "무급휴가", "기타"], def: "연차" },
      { k: "period", label: "기간", type: "daterange", required: true },
      { k: "reason", label: "사유", templates: ["개인 사유", "가족 행사", "병원 진료", "경조사", "자녀 학교 행사"], type: "textarea", ph: "개인 사유", required: true },
      { k: "proxy", label: "업무 대행자", type: "staff" },
      { k: "contact", label: "비상 연락처", type: "text", ph: "010-0000-0000" },
    ],
    days: (d) => bizDays(d.period), summary: (d) => `${d.kind || "연차"} ${rangeText(d.period)} (${bizDays(d.period)}일)` },
  { key: "half", cat: "leave", label: "반차", title: "반 차 신 청 서", code: "HH",
    fields: [
      { k: "date", label: "날짜", type: "date", required: true },
      { k: "ampm", label: "구분", type: "select", options: ["오전 반차", "오후 반차", "반반차(2시간)"], def: "오전 반차" },
      { k: "reason", label: "사유", templates: ["개인 사유", "가족 행사", "병원 진료", "경조사", "자녀 학교 행사"], type: "textarea", required: true },
      { k: "proxy", label: "업무 대행자", type: "staff" },
    ],
    days: (d) => (String(d.ampm || "").includes("반반차") ? 0.25 : 0.5), summary: (d) => `${d.date || ""} ${d.ampm || "오전 반차"}` },
  { key: "early", cat: "leave", label: "조퇴·지각", title: "근 태 사 유 서", code: "HE",
    fields: [
      { k: "kind", label: "구분", type: "select", options: ["조퇴", "지각", "외출"], def: "조퇴" },
      { k: "date", label: "날짜", type: "date", required: true },
      { k: "time", label: "시간", type: "time", required: true },
      { k: "reason", label: "사유", templates: ["개인 사유", "가족 행사", "병원 진료", "경조사", "자녀 학교 행사"], type: "textarea", required: true },
    ],
    summary: (d) => `${d.kind || "조퇴"} ${d.date || ""} ${d.time || ""}` },
  { key: "outside", cat: "leave", label: "외근", title: "외 근 신 청 서", code: "HO",
    fields: [
      { k: "date", label: "날짜", type: "date", required: true },
      { k: "from", label: "출발 시간", type: "time", half: true },
      { k: "to", label: "복귀 시간", type: "time", half: true },
      { k: "place", label: "방문처", type: "text", ph: "거래처·현장명", required: true },
      { k: "purpose", label: "목적", type: "textarea", required: true },
      { k: "direct", label: "직출·직퇴", type: "select", options: ["해당 없음", "직출", "직퇴", "직출·직퇴"], def: "해당 없음" },
    ],
    summary: (d) => `${d.date || ""} ${d.place || ""} 외근` },
  { key: "trip", cat: "leave", label: "출장신청", title: "출 장 신 청 서", code: "HT",
    fields: [
      { k: "period", label: "기간", type: "daterange", required: true },
      { k: "place", label: "출장지", type: "text", required: true },
      { k: "purpose", label: "출장 목적", type: "textarea", required: true },
      { k: "with", label: "동행자", type: "text", ph: "없으면 비워 두세요" },
      { k: "transport", label: "교통수단", type: "select", options: ["자차", "법인차량", "대중교통", "항공", "기타"], def: "자차" },
      { k: "budget", label: "예상 경비", type: "money" },
    ],
    days: (d) => dayDiff(d.period), amount: (d) => Number(d.budget) || 0, summary: (d) => `${d.place || ""} ${rangeText(d.period)}` },
  { key: "family", cat: "leave", label: "경조사", title: "경 조 사 신 청 서", code: "HF",
    fields: [
      { k: "kind", label: "경조 구분", type: "select", options: ["본인 결혼", "자녀 결혼", "형제자매 결혼", "배우자 출산", "부모 회갑·칠순", "부모 상", "배우자 부모 상", "조부모 상", "형제자매 상", "기타"], def: "본인 결혼" },
      { k: "target", label: "대상자(관계)", type: "text", ph: "예) 부친 홍길동" },
      { k: "eventDate", label: "경조일", type: "date", required: true },
      { k: "period", label: "휴가 기간", type: "daterange" },
      { k: "money", label: "경조금 신청", type: "select", options: ["신청", "신청 안 함"], def: "신청" },
      { k: "flower", label: "화환·조화", type: "select", options: ["요청", "요청 안 함"], def: "요청 안 함" },
      { k: "place", label: "장소", type: "text" },
    ],
    days: (d) => bizDays(d.period), summary: (d) => `${d.kind || ""} ${d.eventDate || ""}` },
  { key: "sick", cat: "leave", label: "병가", title: "병 가 신 청 서", code: "HS",
    fields: [
      { k: "period", label: "기간", type: "daterange", required: true },
      { k: "reason", label: "병명·사유", type: "textarea", required: true },
      { k: "doc", label: "증빙", type: "select", options: ["진단서 첨부", "소견서 첨부", "추후 제출", "없음"], def: "추후 제출" },
      { k: "proxy", label: "업무 대행자", type: "staff" },
    ],
    days: (d) => bizDays(d.period), summary: (d) => `병가 ${rangeText(d.period)} (${bizDays(d.period)}일)` },
  // 👶 2026-10-31 육아휴직 · 출산휴가 — 최종 승인되면 인사 정보의 재직 상태가 육아휴직/출산휴가로 바뀐다
  { key: "parental", cat: "leave", label: "육아휴직·근로시간 단축", title: "육 아 휴 직 신 청 서", code: "HP",
    fields: [
      { k: "kind", label: "신청 구분", type: "select", options: ["육아휴직", "육아기 근로시간 단축"], def: "육아휴직" },
      { k: "child", label: "자녀 이름", type: "text", required: true, half: true },
      { k: "childBirth", label: "자녀 생년월일(출산 예정일)", type: "date", required: true, half: true },
      { k: "period", label: "기간", type: "daterange", required: true },
      { k: "round", label: "사용 차수", type: "select", options: ["처음 사용", "2번째(분할)", "3번째(분할)", "4번째(분할)"], def: "처음 사용", half: true },
      { k: "spouse", label: "배우자 육아휴직", type: "select", options: ["사용 안 함", "사용(3개월 이상)", "사용 예정", "해당 없음(한부모 등)"], def: "사용 안 함", half: true },
      { k: "hours", label: "단축 후 근무시간(근로시간 단축만)", type: "text", ph: "예) 주 25시간 · 10:00~16:00" },
      { k: "proxy", label: "업무 대행자", type: "staff" },
      { k: "contact", label: "휴직 중 연락처", type: "text", ph: "휴대폰 · 개인 메일" },
      { k: "law", label: "육아휴직 안내(남녀고용평등과 일·가정 양립 지원에 관한 법률)", type: "notice", text: [
        "① 대상: 만 8세 이하 또는 초등학교 2학년 이하 자녀를 둔 근로자(제19조). 근로시간 단축은 만 12세 이하 또는 초등학교 6학년 이하 자녀.",
        "② 기간: 자녀 1명당 1년. 부모가 모두 3개월 이상 쓰거나 한부모·중증 장애아동 부모는 1년 6개월까지. 나눠 쓰기는 3번 나눠 총 4회까지 가능합니다.",
        "③ 신청: 휴직 시작 예정일 30일 전까지 신청합니다(출산 예정일 전 출산 등 부득이한 경우 7일 전).",
        "④ 육아휴직 급여(고용보험): 1~3개월 통상임금 100%(월 상한 250만원), 4~6개월 100%(월 상한 200만원), 7개월부터 80%(월 상한 160만원). 고용센터에 직접 신청하며, 회사는 육아휴직 확인서를 제출합니다.",
        "⑤ 근로시간 단축: 주 15~35시간. 1년 + 쓰지 않은 육아휴직 기간의 2배를 더해 최대 3년까지 쓸 수 있습니다.",
        "⑥ 보호: 육아휴직을 이유로 해고·불리한 처우를 할 수 없고, 휴직 기간도 근속기간에 들어갑니다. 연차휴가 산정 시에는 출근한 것으로 봅니다(근로기준법 제60조). 끝나면 같은 업무 또는 같은 수준 임금의 업무로 복귀합니다.",
      ] },
      { k: "checks", label: "확인 사항", type: "checks", required: true, options: ["위 육아휴직 안내를 읽고 이해했습니다", "휴직 전 업무 인수인계를 마치겠습니다", "복직 예정일 30일 전까지 복직 여부를 알리겠습니다"] },
    ],
    days: (d) => dayDiff(d.period), summary: (d) => `${d.kind || "육아휴직"} ${rangeText(d.period)} · 자녀 ${d.child || ""}` },
  { key: "maternity", cat: "leave", label: "출산휴가·배우자 출산휴가", title: "출 산 휴 가 신 청 서", code: "HB",
    fields: [
      { k: "kind", label: "신청 구분", type: "select", options: ["출산전후휴가", "배우자 출산휴가", "유산·사산 휴가"], def: "출산전후휴가" },
      { k: "due", label: "출산(예정)일", type: "date", required: true, half: true },
      { k: "multi", label: "다태아", type: "select", options: ["아니오", "예(쌍둥이 이상)"], def: "아니오", half: true },
      { k: "period", label: "휴가 기간", type: "daterange", required: true },
      { k: "proxy", label: "업무 대행자", type: "staff" },
      { k: "doc", label: "증빙", type: "select", options: ["출산 예정일 확인서 첨부", "출생증명서 첨부", "추후 제출"], def: "추후 제출" },
      { k: "law", label: "출산휴가 안내(근로기준법 제74조 · 남녀고용평등법 제18조의2)", type: "notice", text: [
        "① 출산전후휴가: 90일(다태아 120일). 출산 후에 45일(다태아 60일) 이상이 되도록 나눠야 합니다. 최초 60일(다태아 75일)은 유급이며, 나머지는 고용보험에서 출산전후휴가 급여를 받습니다.",
        "② 배우자 출산휴가: 20일(유급). 출산일부터 120일 안에 쓰고, 3번까지 나눠 쓸 수 있습니다.",
        "③ 유산·사산 휴가: 임신 기간에 따라 5일~90일.",
        "④ 출산휴가가 끝나면 바로 육아휴직을 이어 쓸 수 있습니다(육아휴직 신청서를 따로 올려 주세요).",
      ] },
    ],
    days: (d) => dayDiff(d.period), summary: (d) => `${d.kind || "출산전후휴가"} ${rangeText(d.period)}` },
  { key: "holiday", cat: "leave", label: "휴일근무·대체휴무", title: "휴 일 근 무 신 청 서", code: "HW",
    fields: [
      { k: "workDate", label: "근무일", type: "date", required: true },
      { k: "from", label: "시작", type: "time", half: true },
      { k: "to", label: "종료", type: "time", half: true },
      { k: "comp", label: "보상", type: "select", options: ["대체휴무", "휴일근무수당"], def: "대체휴무" },
      { k: "offDate", label: "대체휴무일", type: "date" },
      { k: "reason", label: "근무 사유", templates: ["물량 증가 대응", "긴급 배차 대응", "월마감 정산 업무", "시스템 점검"], type: "textarea", required: true },
    ],
    summary: (d) => `${d.workDate || ""} 휴일근무 · ${d.comp || "대체휴무"}` },
  { key: "overtime", cat: "leave", label: "연장·야간근무", title: "연 장 근 무 신 청 서", code: "HN",
    fields: [
      { k: "date", label: "날짜", type: "date", required: true },
      { k: "from", label: "시작", type: "time", half: true, def: "18:00" },
      { k: "to", label: "종료", type: "time", half: true },
      { k: "kind", label: "구분", type: "select", options: ["연장근무", "야간근무", "연장·야간"], def: "연장근무" },
      { k: "reason", label: "업무 내용", type: "textarea", required: true },
    ],
    summary: (d) => `${d.date || ""} ${d.kind || ""} ${d.from || ""}~${d.to || ""}` },

  // ───────── 비용·지출 ─────────
  { key: "spend", cat: "expense", label: "지출결의서", title: "지 출 결 의 서", code: "EX",
    fields: [
      { k: "date", label: "지출일", type: "date", required: true },
      { k: "vendor", label: "지출처(거래처)", type: "text", required: true },
      { k: "account", label: "계정과목", type: "select", options: ACCOUNTS, def: "소모품비" },
      { k: "pay", label: "결제 수단", type: "select", options: PAY, def: "법인카드" },
      { k: "items", label: "지출 내역", type: "items", required: true },
      { k: "bank", label: "입금 계좌", type: "bank" },
      { k: "reason", label: "지출 사유", templates: ["사무용품 구매", "차량 정비·수리", "유류비 정산", "거래처 접대", "직원 복리후생(식대·간식)", "택배·운송비", "통신비", "교육·세미나", "긴급 부품 구매"], type: "textarea", required: true },
    ],
    amount: (d) => itemsTotal(d.items), summary: (d) => `${d.vendor || ""} · ${d.account || ""} · ${won(itemsTotal(d.items))}` },
  { key: "card", cat: "expense", label: "법인카드 사용보고", title: "법 인 카 드 사 용 보 고 서", code: "EC",
    fields: [
      { k: "date", label: "사용일", type: "date", required: true },
      { k: "cardNo", label: "카드(뒤 4자리)", type: "text", ph: "1234", half: true },
      { k: "amountV", label: "사용 금액", type: "money", required: true, half: true },
      { k: "shop", label: "가맹점", type: "text", required: true },
      { k: "account", label: "계정과목", type: "select", options: ACCOUNTS, def: "복리후생비" },
      { k: "people", label: "사용 인원·참석자", type: "text" },
      { k: "reason", label: "사용 목적", templates: ["거래처 미팅 식대", "직원 회식", "출장 경비", "사무용품 구매", "차량 유지비", "고객 접대", "업무용 소모품"], type: "textarea", required: true },
    ],
    amount: (d) => Number(d.amountV) || 0, summary: (d) => `${d.shop || ""} · ${won(d.amountV)}` },
  { key: "fuel", cat: "expense", label: "유류비·통행료 정산", title: "유 류 비 · 통 행 료 정 산 서", code: "EF",
    fields: [
      { k: "carNo", label: "차량번호", type: "text", ph: "12가3456", required: true },
      { k: "period", label: "정산 기간", type: "daterange", required: true },
      { k: "route", label: "주요 운행 구간", type: "text", ph: "예) 인천 남동공단 → 평택항" },
      { k: "costs", label: "정산 항목", type: "costs", preset: ["유류비", "통행료", "주차비", "세차비"] },
      { k: "km", label: "운행 거리(km)", type: "number" },
      { k: "bank", label: "입금 계좌", type: "bank" },
      { k: "memo", label: "비고", type: "textarea" },
    ],
    amount: (d) => costsTotal(d.costs), summary: (d) => `${d.carNo || ""} · ${rangeText(d.period)} · ${won(costsTotal(d.costs))}` },
  { key: "tripcost", cat: "expense", label: "출장비 정산", title: "출 장 비 정 산 서", code: "ET",
    fields: [
      { k: "period", label: "출장 기간", type: "daterange", required: true },
      { k: "place", label: "출장지", type: "text", required: true },
      { k: "costs", label: "정산 항목", type: "costs", preset: ["교통비", "숙박비", "식비", "일비", "기타"] },
      { k: "advance", label: "가지급 받은 금액", type: "money" },
      { k: "memo", label: "출장 결과·비고", type: "textarea" },
    ],
    amount: (d) => costsTotal(d.costs), summary: (d) => `${d.place || ""} 출장 · ${won(costsTotal(d.costs))}${Number(d.advance) ? ` (차액 ${won(costsTotal(d.costs) - Number(d.advance))})` : ""}` },
  { key: "advance", cat: "expense", label: "가지급금 신청", title: "가 지 급 금 신 청 서", code: "EA",
    fields: [
      { k: "amountV", label: "신청 금액", type: "money", required: true },
      { k: "need", label: "필요일", type: "date", required: true, half: true },
      { k: "settle", label: "정산 예정일", type: "date", half: true },
      { k: "purpose", label: "사용 목적", templates: ["거래처 미팅 식대", "직원 회식", "출장 경비", "사무용품 구매", "차량 유지비", "고객 접대", "업무용 소모품"], type: "textarea", required: true },
      { k: "bank", label: "입금 계좌", type: "bank" },
    ],
    amount: (d) => Number(d.amountV) || 0, summary: (d) => `가지급 ${won(d.amountV)} · 정산 ${d.settle || "-"}` },
  { key: "purchase", cat: "expense", label: "구매요청서", title: "구 매 요 청 서", code: "EP",
    fields: [
      { k: "items", label: "구매 품목", type: "items", required: true },
      { k: "vendor", label: "구매처", type: "text" },
      { k: "need", label: "납기 희망일", type: "date" },
      { k: "place", label: "납품 장소", type: "text" },
      { k: "reason", label: "구매 사유", templates: ["기존 장비 노후 교체", "신규 입사자 지급", "업무 효율 개선", "소모품 재고 부족", "고장 수리 대체"], type: "textarea", required: true },
    ],
    amount: (d) => itemsTotal(d.items), summary: (d) => `${(d.items || [])[0]?.name || "품목"}${(d.items || []).length > 1 ? ` 외 ${d.items.length - 1}건` : ""} · ${won(itemsTotal(d.items))}` },
  { key: "accident", cat: "expense", label: "운송 사고·파손 처리", title: "운 송 사 고 처 리 품 의 서", code: "ED",
    fields: [
      { k: "date", label: "사고일", type: "date", required: true },
      { k: "client", label: "거래처(화주)", type: "text", required: true },
      { k: "carNo", label: "차량번호·기사", type: "text", ph: "12가3456 / 홍길동" },
      { k: "route", label: "운송 구간", type: "text", ph: "상차지 → 하차지" },
      { k: "kind", label: "사고 유형", type: "select", options: ["화물 파손", "화물 분실", "오배송", "지연 배송", "차량 사고", "기타"], def: "화물 파손" },
      { k: "detail", label: "사고 내용", type: "textarea", required: true },
      { k: "loss", label: "손해액", type: "money", required: true },
      { k: "burden", label: "부담 구분", type: "select", options: ["회사 부담", "기사 부담", "보험 처리", "거래처 협의", "분담"], def: "보험 처리" },
      { k: "plan", label: "처리 방안", type: "textarea" },
    ],
    amount: (d) => Number(d.loss) || 0, summary: (d) => `${d.client || ""} ${d.kind || ""} · ${won(d.loss)} · ${d.burden || ""}` },

  // ───────── 업무 기안·품의 ─────────
  { key: "general", cat: "draft", label: "기안·품의서", title: "기 안 서", code: "DG",
    fields: [
      { k: "subject", label: "제목", type: "text", required: true },
      { k: "effective", label: "시행 예정일", type: "date" },
      { k: "body", label: "기안 내용", type: "textarea", rows: 8, required: true },
      { k: "budget", label: "소요 예산", type: "money" },
    ],
    amount: (d) => Number(d.budget) || 0, titleOf: (d) => d.subject, summary: (d) => d.subject || "" },
  { key: "rate", cat: "draft", label: "운임·단가 변경 품의", title: "운 임 변 경 품 의 서", code: "DR",
    fields: [
      { k: "client", label: "거래처", type: "text", required: true },
      { k: "route", label: "구간", type: "text", ph: "상차지 → 하차지", required: true },
      { k: "car", label: "차종·톤수", type: "select", options: ["1톤", "1.4톤", "2.5톤", "3.5톤", "5톤", "5톤축", "8톤", "11톤", "18톤", "25톤", "트레일러", "기타"], def: "5톤" },
      { k: "oldFare", label: "기존 청구운임", type: "money", half: true },
      { k: "newFare", label: "변경 청구운임", type: "money", half: true, required: true },
      { k: "oldPay", label: "기존 기사운임", type: "money", half: true },
      { k: "newPay", label: "변경 기사운임", type: "money", half: true },
      { k: "effective", label: "적용일", type: "date", required: true },
      { k: "reason", label: "변경 사유", templates: ["거래 조건 변경", "담당자 변경", "주소 이전", "단가 조정"], type: "textarea", required: true },
    ],
    summary: (d) => `${d.client || ""} ${d.route || ""} ${won(d.oldFare)} → ${won(d.newFare)}` },
  { key: "client", cat: "draft", label: "신규 거래처 등록 품의", title: "신 규 거 래 처 등 록 품 의 서", code: "DC",
    fields: [
      { k: "name", label: "거래처명", type: "text", required: true },
      { k: "bizNo", label: "사업자등록번호", type: "text", ph: "000-00-00000", half: true },
      { k: "ceo", label: "대표자", type: "text", half: true },
      { k: "manager", label: "담당자·연락처", type: "text" },
      { k: "terms", label: "결제 조건", type: "select", options: ["당월 말 마감 익월 말 결제", "당월 말 마감 익월 15일 결제", "건별 결제", "선결제", "기타"], def: "당월 말 마감 익월 말 결제" },
      { k: "volume", label: "예상 월 물량·매출", type: "text", ph: "예) 월 40건 / 2,000만원" },
      { k: "credit", label: "신용 확인", type: "select", options: ["확인 완료", "확인 필요", "해당 없음"], def: "확인 필요" },
      { k: "reason", label: "등록 사유·영업 내용", type: "textarea", required: true },
    ],
    titleOf: (d) => `신규 거래처 등록 · ${d.name || ""}`, summary: (d) => `${d.name || ""} · ${d.terms || ""}` },
  { key: "vehicle", cat: "draft", label: "차량 정비·수리 요청", title: "차 량 정 비 요 청 서", code: "DV",
    fields: [
      { k: "carNo", label: "차량번호", type: "text", required: true },
      { k: "km", label: "주행거리(km)", type: "number", half: true },
      { k: "urgent", label: "긴급도", type: "select", options: ["일반", "긴급", "운행 불가"], def: "일반", half: true },
      { k: "symptom", label: "증상·정비 내용", type: "textarea", required: true },
      { k: "shop", label: "정비처", type: "text" },
      { k: "cost", label: "예상 비용", type: "money" },
    ],
    amount: (d) => Number(d.cost) || 0, summary: (d) => `${d.carNo || ""} · ${d.urgent || ""} · ${won(d.cost)}` },
  { key: "cert", cat: "draft", label: "제증명 발급 신청", title: "제 증 명 발 급 신 청 서", code: "DZ",
    fields: [
      { k: "kind", label: "증명서 종류", type: "select", options: ["재직증명서", "경력증명서", "급여(원천징수)증명서", "퇴직증명서", "기타"], def: "재직증명서" },
      { k: "count", label: "매수", type: "number", def: "1", half: true },
      { k: "need", label: "필요일", type: "date", half: true },
      { k: "purpose", label: "용도·제출처", type: "text", required: true },
    ],
    summary: (d) => `${d.kind || ""} ${d.count || 1}매 · ${d.purpose || ""}` },

  // ───────── 업무 보고·인사 ─────────
  { key: "daily", cat: "report", label: "일일 업무일지", title: "일 일 업 무 일 지", code: "RD",
    fields: [
      { k: "date", label: "업무일", type: "date", required: true, half: true },
      { k: "hours", label: "근무 시간", type: "timerange", half: true },
      { k: "done", label: "오늘 업무 내용", type: "textarea", rows: 6, required: true, ph: "· 배차 32건 처리(긴급 3건)\n· ○○물류 운임 협의\n· 미수금 2건 입금 확인" },
      { k: "issue", label: "특이사항·이슈", type: "textarea", rows: 3, ph: "사고·지연·민원 등" },
      { k: "plan", label: "다음 주 업무 계획", type: "textarea", rows: 3 },
    ],
    summary: (d) => `${d.date || ""} 업무일지` },
  { key: "workreport", cat: "report", label: "업무 보고서", title: "업 무 보 고 서", code: "RW",
    fields: [
      { k: "period", label: "보고 기간", type: "select", options: ["주간", "월간", "분기", "수시"], def: "주간", half: true },
      { k: "range", label: "기간", type: "daterange", required: true },
      { k: "subject", label: "보고 제목", type: "text", required: true },
      { k: "result", label: "주요 실적", type: "textarea", rows: 6, required: true, ph: "· 배차 건수·매출·매익\n· 신규 거래처\n· 개선한 업무" },
      { k: "issue", label: "문제점·건의", type: "textarea", rows: 3 },
      { k: "plan", label: "다음 계획", type: "textarea", rows: 3 },
    ],
    summary: (d) => `${d.period || ""} · ${d.subject || ""}` },
  { key: "tripreport", cat: "report", label: "출장 보고서", title: "출 장 보 고 서", code: "RT",
    fields: [
      { k: "range", label: "출장 기간", type: "daterange", required: true },
      { k: "place", label: "출장지·방문처", type: "text", required: true },
      { k: "purpose", label: "출장 목적", templates: ["거래처 미팅·영업", "현장 점검", "사고 처리", "교육·세미나 참석", "차량 인수·반납"], type: "textarea", required: true },
      { k: "result", label: "출장 결과", type: "textarea", rows: 6, required: true },
      { k: "followup", label: "후속 조치", type: "textarea", rows: 3 },
      { k: "cost", label: "사용 경비", type: "money" },
    ],
    amount: (d) => Number(d.cost) || 0, summary: (d) => `${d.place || ""} · ${rangeText(d.range)}` },
  { key: "minutes", cat: "report", label: "회의록", title: "회 의 록", code: "RM",
    fields: [
      { k: "date", label: "회의일", type: "date", required: true, half: true },
      { k: "time", label: "회의 시간", type: "timerange", half: true },
      { k: "place", label: "장소", type: "text", half: true },
      { k: "kind", label: "회의 종류", type: "select", options: ["정기 회의", "부서 회의", "거래처 미팅", "안전 회의", "기타"], def: "정기 회의", half: true },
      { k: "attendees", label: "참석자", type: "text", required: true, ph: "홍길동 팀장, 김철수 대리 …" },
      { k: "agenda", label: "안건", type: "textarea", rows: 3, required: true },
      { k: "content", label: "논의 내용", type: "textarea", rows: 6, required: true },
      { k: "decision", label: "결정 사항·담당·기한", type: "textarea", rows: 3, ph: "· ○○ 운임 5% 인상 — 영업팀 · 11/15까지" },
    ],
    summary: (d) => `${d.date || ""} ${d.kind || ""} · ${d.attendees || ""}` },
  { key: "training", cat: "report", label: "교육·세미나 결과 보고", title: "교 육 결 과 보 고 서", code: "RE",
    fields: [
      { k: "name", label: "교육명", type: "text", required: true },
      { k: "range", label: "교육 기간", type: "daterange", required: true },
      { k: "org", label: "교육 기관", type: "text" },
      { k: "content", label: "교육 내용", type: "textarea", rows: 5, required: true },
      { k: "apply", label: "업무 적용 방안", type: "textarea", rows: 3 },
      { k: "cost", label: "교육비", type: "money" },
    ],
    amount: (d) => Number(d.cost) || 0, summary: (d) => `${d.name || ""} · ${rangeText(d.range)}` },
  { key: "apology", cat: "report", label: "시말서·경위서", title: "경 위 서", code: "RA",
    fields: [
      { k: "kind", label: "구분", type: "select", options: ["경위서", "시말서"], def: "경위서", half: true },
      { k: "date", label: "발생일", type: "date", required: true, half: true },
      { k: "what", label: "발생 내용", type: "textarea", rows: 5, required: true },
      { k: "why", label: "원인", type: "textarea", rows: 3, required: true },
      { k: "prevent", label: "재발 방지 대책", type: "textarea", rows: 3, required: true },
    ],
    summary: (d) => `${d.kind || "경위서"} · ${d.date || ""}` },
  // 🗂 2026-11-01 인사발령 품의 — 임원 결재 후 인사관리부에서 공문(인사발령) 게시. 최종 승인되면 대상자 인사 정보에 "결재 완료 발령"이 남는다
  { key: "personnel", cat: "report", label: "인사발령 품의", title: "인 사 발 령 품 의 서", code: "RP",
    fields: [
      { k: "target", label: "발령 대상자", type: "staff", required: true },
      { k: "kind", label: "발령 구분", type: "select", options: ["승진", "전보(부서 이동)", "직책 변경", "신규 임용", "겸직", "휴직", "복직", "강등", "기타"], def: "승진" },
      { k: "fromText", label: "현 소속·직책", type: "text", ph: "예) 운송팀 대리" },
      { k: "toTeam", label: "발령 부서", type: "text", required: true, half: true, ph: "예) 운송팀" },
      { k: "toPosition", label: "발령 직책", type: "text", required: true, half: true, ph: "예) 과장" },
      { k: "date", label: "발령일", type: "date", required: true },
      { k: "reason", label: "발령 사유", templates: ["정기 승진(근무 평가 우수)", "조직 개편에 따른 전보", "결원 충원", "본인 희망 전보", "직무 역량 강화"], type: "textarea", required: true },
      { k: "note", label: "처우 변경(선택)", type: "text", ph: "예) 직책수당 월 10만원 신설" },
    ],
    summary: (d) => `${d.kind || "인사발령"} → ${[d.toTeam, d.toPosition].filter(Boolean).join(" ")} · ${d.date || ""}` },
  { key: "resign", cat: "report", label: "사직서", title: "사 직 서", code: "RR",
    fields: [
      { k: "hire", label: "입사일", type: "date", half: true },
      { k: "last", label: "퇴직 희망일", type: "date", required: true, half: true },
      { k: "reason", label: "사직 사유", templates: ["개인 사정", "이직", "학업", "건강", "가정 사정", "계약 만료"], type: "textarea", required: true },
      { k: "handover", label: "인수인계 계획", type: "textarea", rows: 3, required: true, ph: "인수자 · 인계 업무(거래처·배차·정산 자료) · 완료 예정일" },
      { k: "assets", label: "반납할 회사 자산", type: "text", ph: "노트북, 출입카드, 법인카드, 차량 키, 업무 계정 등" },
      { k: "law", label: "퇴직 시 지켜야 할 사항(관련 법령)", type: "notice", text: [
        "① 사직의 효력(민법 제660조): 회사가 사직을 받아들이지 않더라도 사직 의사를 밝힌 날부터 1개월이 지나면 효력이 생기며, 월급제는 사직을 밝힌 달의 다음 임금 지급 기간이 끝난 때 효력이 생깁니다. 무단 퇴사로 회사에 손해가 생기면 배상 책임이 생길 수 있으니 퇴직 희망일 30일 전에 제출하는 것을 원칙으로 합니다.",
        "② 업무 인수인계: 담당하던 거래처·배차·정산 업무와 자료를 후임자에게 인계하고, 인계 완료 확인을 받습니다.",
        "③ 회사 자산·자료 반납: 노트북·법인카드·출입카드·차량 키 등 회사 자산과 업무 자료(파일·서류)를 반납하고, 개인 저장 장치에 복사하거나 가져가지 않습니다.",
        "④ 영업비밀·개인정보 보호(부정경쟁방지 및 영업비밀보호에 관한 법률, 개인정보 보호법): 재직 중 알게 된 거래처·운임·기사님 개인정보 등을 퇴직 후에도 누설하거나 부당하게 사용해서는 안 되며, 위반 시 민·형사상 책임을 질 수 있습니다.",
        "⑤ 금품 청산(근로기준법 제36조): 회사는 퇴직일부터 14일 이내에 임금·퇴직금 등 모든 금품을 지급하며, 사정이 있으면 당사자 합의로 기일을 연장할 수 있습니다.",
        "⑥ 퇴직금(근로자퇴직급여 보장법): 계속 근로 기간 1년 이상, 4주 평균 주 15시간 이상 근무한 경우 퇴직금이 지급됩니다.",
        "⑦ 사용증명서(근로기준법 제39조): 퇴직 후에도 재직·경력증명서 발급을 요청할 수 있습니다. 4대 보험 자격 상실 신고는 회사가 처리합니다.",
      ] },
      { k: "checks", label: "확인 사항", type: "checks", required: true, options: ["위 퇴직 시 지켜야 할 사항을 읽고 이해했습니다", "인수인계를 성실히 마치겠습니다", "회사 자산과 업무 자료를 모두 반납하겠습니다", "재직 중 알게 된 영업비밀·개인정보를 누설하지 않겠습니다"] },
    ],
    summary: (d) => `퇴직 희망일 ${d.last || ""}` },
];

export const formOf = (key) => APPROVAL_FORMS.find((f) => f.key === key) || APPROVAL_FORMS[0];
export const formsOfCat = (cat) => APPROVAL_FORMS.filter((f) => f.cat === cat);

export function initialData(form) {
  const d = {};
  (form.fields || []).forEach((f) => {
    if (f.def !== undefined) d[f.k] = f.def;
    if (f.type === "items") d[f.k] = [{ name: "", qty: 1, price: "" }];
    if (f.type === "costs") d[f.k] = (f.preset || ["항목"]).map((l) => ({ label: l, amount: "" }));
    if (f.type === "daterange") d[f.k] = { start: "", end: "" };
    if (f.type === "checks") d[f.k] = [];
    if (f.type === "timerange") d[f.k] = { start: f.k === "hours" ? "09:00" : "", end: f.k === "hours" ? "18:00" : "" };
  });
  return d;
}

// 빠진 필수 입력 찾기
export function missingFields(form, d) {
  return (form.fields || []).filter((f) => {
    if (!f.required) return false;
    const v = d[f.k];
    if (f.type === "daterange" || f.type === "timerange") return !v?.start;
    if (f.type === "notice") return false;
    if (f.type === "checks") return (v || []).length < (f.options || []).length;
    if (f.type === "items") return !(v || []).some((r) => String(r.name || "").trim() && Number(r.price));
    return v === undefined || v === null || String(v).trim() === "";
  }).map((f) => f.label);
}

// 필드 값을 문서에 보일 글자로
export function fieldText(f, v, staff) {
  if (f.type === "notice") return (f.text || []).join("\n");
  if (v === undefined || v === null || v === "") return "";
  if (f.type === "bank") return bankText(v);
  if (f.type === "daterange") { const n = dayDiff(v); const b = bizDays(v); return v.start ? `${rangeText(v)}${n ? ` (${n}일${b !== n ? ` · 주말·공휴일 빼고 ${b}일` : ""})` : ""}` : ""; }
  if (f.type === "money") return Number(v) ? won(v) : "";
  if (f.type === "checks") return (v || []).map((x) => `☑ ${x}`).join("\n");
  if (f.type === "timerange") { const t = (hm) => { if (!hm) return ""; const [h, m] = hm.split(":").map(Number); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(m).padStart(2, "0")}`; }; return v?.start ? `${t(v.start)}${v.end ? ` ~ ${t(v.end)}` : ""}` : ""; }
  if (f.type === "number") return String(v);
  if (f.type === "staff") { const u = (staff || []).find((x) => x.uid === v); return u ? `${u.name}${u.position ? ` ${u.position}` : ""}` : ""; }
  return String(v);
}

// 직급 순서(결재선 자동 추천에 사용)
export const RANK = ["인턴", "사원", "주임", "대리", "과장", "차장", "부장", "팀장", "파트장", "본부장", "이사", "상무", "전무", "부사장", "사장", "대표", "대표이사"];
export const rankOf = (p) => RANK.indexOf(String(p || "").trim());
export const EXEC_POSITIONS = ["이사", "상무", "전무", "부사장", "사장", "대표", "대표이사", "본부장", "임원"];
export const isExecPosition = (p) => EXEC_POSITIONS.includes(String(p || "").trim());

// 기본 결재선 추천 — 같은 부서의 윗사람(팀장급) → 임원 → 대표 순, 나보다 직급이 높은 사람만
export function suggestLine(staff, me) {
  const list = (staff || []).filter((u) => u.uid !== me?.uid);
  const myRank = rankOf(me?.position);
  const higher = (u) => rankOf(u.position) > myRank;
  const out = [];
  const lead = list.filter((u) => u.team && u.team === me?.team && higher(u) && rankOf(u.position) < rankOf("이사")).sort((a, b) => rankOf(a.position) - rankOf(b.position)).pop();
  if (lead) out.push(lead);
  const exec = list.filter((u) => higher(u) && ["이사", "상무", "전무", "본부장"].includes(u.position)).sort((a, b) => rankOf(a.position) - rankOf(b.position))[0];
  if (exec) out.push(exec);
  const ceo = list.find((u) => ["대표이사", "대표", "사장"].includes(u.position) && higher(u));
  if (ceo) out.push(ceo);
  return out.map((u) => ({ uid: u.uid, name: u.name || u.email || "", position: u.position || "", team: u.team || "", kind: "결재" }));
}
