// ======================= src/approvalForms.js =======================
// 📝 전자결재 양식 정의(2026-10-28) — 3개 묶음(근태·휴가 / 비용·지출 / 업무 기안·품의)과 양식별 입력칸.
//  필드 type: text | textarea | date | time | daterange | select | number | money | staff | items
//  - items: 품목 표(name, qty, price → 금액 자동) / costs: 항목별 금액 표(label, amount)
//  - 양식의 summary(d) → 목록에 보일 한 줄 요약, amount(d) → 금액(비용 양식), days(d) → 휴가 일수

export const APPROVAL_CATS = [
  { key: "leave", label: "근태·휴가 신청", en: "ATTENDANCE", icon: "clock", desc: "휴가 · 반차 · 조퇴 · 외근 · 출장 · 경조사 · 병가 · 근무 신청" },
  { key: "expense", label: "비용·지출 결의", en: "EXPENSE", icon: "wallet", desc: "지출결의 · 법인카드 · 유류비/통행료 · 출장비 · 가지급금 · 구매 · 사고처리" },
  { key: "draft", label: "업무 기안·품의", en: "PROPOSAL", icon: "file", desc: "기안·품의서 · 운임 변경 · 신규 거래처 · 차량 정비 · 제증명" },
];

const won = (n) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;
export const fmtWon = won;
const dayDiff = (r) => {
  if (!r?.start) return 0;
  const a = new Date(r.start); const b = new Date(r.end || r.start);
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
};
export const rangeText = (r) => (r?.start ? (r.end && r.end !== r.start ? `${r.start} ~ ${r.end}` : r.start) : "");
const itemsTotal = (rows) => (rows || []).reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.price) || 0), 0);
const costsTotal = (rows) => (rows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
export { itemsTotal, costsTotal, dayDiff };

const ACCOUNTS = ["복리후생비", "여비교통비", "차량유지비", "운반비", "접대비", "소모품비", "통신비", "지급수수료", "교육훈련비", "도서인쇄비", "기타"];
const PAY = ["법인카드", "개인카드(정산 요청)", "계좌이체", "현금"];

export const APPROVAL_FORMS = [
  // ───────── 근태·휴가 ─────────
  { key: "annual", cat: "leave", label: "연차휴가", title: "휴 가 신 청 서", code: "HL",
    fields: [
      { k: "kind", label: "휴가 구분", type: "select", options: ["연차", "하계휴가", "포상휴가", "무급휴가", "기타"], def: "연차" },
      { k: "period", label: "기간", type: "daterange", required: true },
      { k: "reason", label: "사유", type: "textarea", ph: "개인 사유", required: true },
      { k: "proxy", label: "업무 대행자", type: "staff" },
      { k: "contact", label: "비상 연락처", type: "text", ph: "010-0000-0000" },
    ],
    days: (d) => dayDiff(d.period), summary: (d) => `${d.kind || "연차"} ${rangeText(d.period)} (${dayDiff(d.period)}일)` },
  { key: "half", cat: "leave", label: "반차", title: "반 차 신 청 서", code: "HH",
    fields: [
      { k: "date", label: "날짜", type: "date", required: true },
      { k: "ampm", label: "구분", type: "select", options: ["오전 반차", "오후 반차", "반반차(2시간)"], def: "오전 반차" },
      { k: "reason", label: "사유", type: "textarea", required: true },
      { k: "proxy", label: "업무 대행자", type: "staff" },
    ],
    days: (d) => (String(d.ampm || "").includes("반반차") ? 0.25 : 0.5), summary: (d) => `${d.date || ""} ${d.ampm || "오전 반차"}` },
  { key: "early", cat: "leave", label: "조퇴·지각", title: "근 태 사 유 서", code: "HE",
    fields: [
      { k: "kind", label: "구분", type: "select", options: ["조퇴", "지각", "외출"], def: "조퇴" },
      { k: "date", label: "날짜", type: "date", required: true },
      { k: "time", label: "시간", type: "time", required: true },
      { k: "reason", label: "사유", type: "textarea", required: true },
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
    days: (d) => dayDiff(d.period), summary: (d) => `${d.kind || ""} ${d.eventDate || ""}` },
  { key: "sick", cat: "leave", label: "병가", title: "병 가 신 청 서", code: "HS",
    fields: [
      { k: "period", label: "기간", type: "daterange", required: true },
      { k: "reason", label: "병명·사유", type: "textarea", required: true },
      { k: "doc", label: "증빙", type: "select", options: ["진단서 첨부", "소견서 첨부", "추후 제출", "없음"], def: "추후 제출" },
      { k: "proxy", label: "업무 대행자", type: "staff" },
    ],
    days: (d) => dayDiff(d.period), summary: (d) => `병가 ${rangeText(d.period)} (${dayDiff(d.period)}일)` },
  { key: "holiday", cat: "leave", label: "휴일근무·대체휴무", title: "휴 일 근 무 신 청 서", code: "HW",
    fields: [
      { k: "workDate", label: "근무일", type: "date", required: true },
      { k: "from", label: "시작", type: "time", half: true },
      { k: "to", label: "종료", type: "time", half: true },
      { k: "comp", label: "보상", type: "select", options: ["대체휴무", "휴일근무수당"], def: "대체휴무" },
      { k: "offDate", label: "대체휴무일", type: "date" },
      { k: "reason", label: "근무 사유", type: "textarea", required: true },
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
      { k: "bank", label: "입금 계좌", type: "text", ph: "계좌이체·개인카드 정산일 때 (은행 / 계좌 / 예금주)" },
      { k: "reason", label: "지출 사유", type: "textarea", required: true },
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
      { k: "reason", label: "사용 목적", type: "textarea", required: true },
    ],
    amount: (d) => Number(d.amountV) || 0, summary: (d) => `${d.shop || ""} · ${won(d.amountV)}` },
  { key: "fuel", cat: "expense", label: "유류비·통행료 정산", title: "유 류 비 · 통 행 료 정 산 서", code: "EF",
    fields: [
      { k: "carNo", label: "차량번호", type: "text", ph: "12가3456", required: true },
      { k: "period", label: "정산 기간", type: "daterange", required: true },
      { k: "route", label: "주요 운행 구간", type: "text", ph: "예) 인천 남동공단 → 평택항" },
      { k: "costs", label: "정산 항목", type: "costs", preset: ["유류비", "통행료", "주차비", "세차비"] },
      { k: "km", label: "운행 거리(km)", type: "number" },
      { k: "bank", label: "입금 계좌", type: "text", ph: "은행 / 계좌 / 예금주" },
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
      { k: "purpose", label: "사용 목적", type: "textarea", required: true },
      { k: "bank", label: "입금 계좌", type: "text", ph: "은행 / 계좌 / 예금주" },
    ],
    amount: (d) => Number(d.amountV) || 0, summary: (d) => `가지급 ${won(d.amountV)} · 정산 ${d.settle || "-"}` },
  { key: "purchase", cat: "expense", label: "구매요청서", title: "구 매 요 청 서", code: "EP",
    fields: [
      { k: "items", label: "구매 품목", type: "items", required: true },
      { k: "vendor", label: "구매처", type: "text" },
      { k: "need", label: "납기 희망일", type: "date" },
      { k: "place", label: "납품 장소", type: "text" },
      { k: "reason", label: "구매 사유", type: "textarea", required: true },
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
      { k: "reason", label: "변경 사유", type: "textarea", required: true },
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
  });
  return d;
}

// 빠진 필수 입력 찾기
export function missingFields(form, d) {
  return (form.fields || []).filter((f) => {
    if (!f.required) return false;
    const v = d[f.k];
    if (f.type === "daterange") return !v?.start;
    if (f.type === "items") return !(v || []).some((r) => String(r.name || "").trim() && Number(r.price));
    return v === undefined || v === null || String(v).trim() === "";
  }).map((f) => f.label);
}

// 필드 값을 문서에 보일 글자로
export function fieldText(f, v, staff) {
  if (v === undefined || v === null || v === "") return "";
  if (f.type === "daterange") { const n = dayDiff(v); return v.start ? `${rangeText(v)}${n ? ` (${n}일)` : ""}` : ""; }
  if (f.type === "money") return Number(v) ? won(v) : "";
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
