// ======================= src/freight/freightCore.js =======================
// 🚢 2026-11-12 컨테이너 · 해상 · 항공 업무 — 기준 목록(드롭다운)과 계산 규칙. 화면 · 저장과 분리(테스트: scripts/freightCore.test.mjs)
//  · 한 화물 = Job 번호 하나(JB-2611-0001). 해상/항공 → 컨테이너 → 내륙 구간(leg)이 같은 Job 번호로 이어진다
//  · 구간 문서(freightJobs/{id}) = { companyName, mode, jobNo, refNo, direction, client, status, …영역별 칸, sales[], costs[], history[] }

export const MODES = ["container", "sea", "air", "inland"];
export const MODE_PREFIX = { container: "CT", sea: "SE", air: "AR", inland: "IN" };
// Job 타임라인에서 구간이 놓이는 순서(수입 기준: 해상/항공 → 컨테이너 → 내륙)
export const MODE_ORDER = { sea: 0, air: 0, container: 1, inland: 2 };
export const DIRECTIONS = ["수출", "수입"];

// ── 진행 상태 ─────────────────────────────────────────────────────────
export const HANDOFF_STATUS = "인계요청";
export const STATUS = {
  container: ["접수", "배차완료", "픽업완료", "작업지도착", "작업완료", "반입·반납완료", "정산완료"],
  sea: ["부킹", "서류접수", "통관", "선적·출항", "운항중", "입항", "D/O발행", "인도완료", "정산완료"],
  air: ["부킹", "화물반입", "통관", "탑재·출발", "도착", "반출", "배송완료", "정산완료"],
  inland: ["접수", "배차완료", "운송중", "운송완료", "정산완료"],
};
export const statusList = (mode) => STATUS[mode] || STATUS.inland;
export const statusIndex = (mode, st) => statusList(mode).indexOf(st);
export const isDone = (job) => { const l = statusList(job?.mode); const i = l.indexOf(job?.status); return i >= l.length - 2 && i !== -1; };
export const isClosed = (job) => job?.status === "정산완료";
export const nextStatus = (job) => {
  if (job?.status === HANDOFF_STATUS) return statusList(job.mode)[0];
  const l = statusList(job?.mode); const i = l.indexOf(job?.status);
  return i >= 0 && i < l.length - 1 ? l[i + 1] : "";
};
export const progressPct = (job) => {
  if (job?.status === HANDOFF_STATUS) return 0;
  const l = statusList(job?.mode); const i = l.indexOf(job?.status);
  return i < 0 ? 0 : Math.round((i / (l.length - 1)) * 100);
};

// ── 컨테이너 ─────────────────────────────────────────────────────────
//  규격(ISO 코드) · 내부 용적(CBM) · 최대 적재중량(톤) — 일반 사양(선사 · 제작사마다 조금씩 다름)
export const CNTR_TYPES = [
  { key: "20GP", label: "20' Dry (20GP)", iso: "22G1", ft: 20, cbm: 33.2, payload: 28.2, kind: "일반" },
  { key: "40GP", label: "40' Dry (40GP)", iso: "42G1", ft: 40, cbm: 67.7, payload: 26.7, kind: "일반" },
  { key: "40HC", label: "40' High Cube (40HC)", iso: "45G1", ft: 40, cbm: 76.3, payload: 26.5, kind: "일반" },
  { key: "45HC", label: "45' High Cube (45HC)", iso: "L5G1", ft: 45, cbm: 86.0, payload: 27.7, kind: "일반" },
  { key: "20RF", label: "20' 냉동 (20RF)", iso: "22R1", ft: 20, cbm: 28.3, payload: 27.4, kind: "냉동" },
  { key: "40RH", label: "40' 냉동 하이큐브 (40RH)", iso: "45R1", ft: 40, cbm: 67.3, payload: 29.5, kind: "냉동" },
  { key: "20OT", label: "20' 오픈탑 (20OT)", iso: "22U1", ft: 20, cbm: 32.5, payload: 28.1, kind: "특수" },
  { key: "40OT", label: "40' 오픈탑 (40OT)", iso: "42U1", ft: 40, cbm: 66.0, payload: 26.4, kind: "특수" },
  { key: "20FR", label: "20' 플랫랙 (20FR)", iso: "22P1", ft: 20, cbm: 0, payload: 31.0, kind: "특수" },
  { key: "40FR", label: "40' 플랫랙 (40FR)", iso: "42P1", ft: 40, cbm: 0, payload: 40.0, kind: "특수" },
  { key: "20TK", label: "20' 탱크 (20TK)", iso: "22T1", ft: 20, cbm: 24.0, payload: 26.0, kind: "특수" },
];
export const cntrType = (k) => CNTR_TYPES.find((t) => t.key === k) || null;
export const CNTR_TRIPS = ["수출", "수입", "셔틀", "공컨테이너 회수"];
export const CNTR_FARE_KINDS = ["편도", "왕복", "셔틀", "밥테일"];
export const CNTR_CAR_KINDS = ["자차", "지입", "용차"];
export const CHASSIS = ["콤바인 샤시", "20ft 샤시", "40ft 평판 샤시", "40ft 구즈넥 샤시", "로우베드", "덤프 샤시"];
export const LINES = [
  "HMM", "고려해운(KMTC)", "장금상선(Sinokor)", "흥아라인", "남성해운", "천경해운", "동진상선", "범주해운", "동영해운", "태영상선", "팬오션", "SM상선", "팬스타라인",
  "Maersk", "MSC", "CMA CGM", "COSCO", "Evergreen", "ONE", "Hapag-Lloyd", "Yang Ming", "ZIM", "Wan Hai", "OOCL", "PIL", "TS Lines", "SITC",
];
// 터미널 · CY · ICD (픽업지 / 반입 · 반납지)
export const TERMINALS = [
  { group: "부산신항", items: ["PNIT (신항 1부두)", "PNC (신항 2부두)", "HJNC (신항 3부두)", "HPNT (신항 4부두)", "BNCT (신항 5부두)", "BCT (신항 6부두)", "DGT (신항 7부두)"] },
  { group: "부산북항", items: ["BPT 신선대", "BPT 감만", "DPCT (신감만)", "허치슨 (HBCT)"] },
  { group: "인천", items: ["SNCT (인천신항 선광)", "HJIT (인천신항 한진)", "ICT (인천 남항)", "E1CT (인천 남항)"] },
  { group: "평택 · 당진", items: ["PCTC (평택컨테이너터미널)", "PNCT (평택동방아이포트)"] },
  { group: "광양 · 울산 · 기타", items: ["KIT (광양 한국국제터미널)", "GWCT (광양항서부컨테이너터미널)", "UNCT (울산신항)", "정일울산컨테이너터미널", "포항영일신항만"] },
  { group: "내륙 ICD · CY", items: ["의왕ICD 1터미널", "의왕ICD 2터미널", "양산ICD", "부산 재송CY", "부산 용당CY", "인천 아암물류단지", "평택 포승CY"] },
];
export const TERMINAL_FLAT = TERMINALS.flatMap((g) => g.items);

// ISO 6346 컨테이너 번호 — 영문 4자(소유자 3 + 장비 U/J/Z) + 숫자 7자(마지막 = 검사 숫자)
const ISO_VAL = (() => { const o = {}; let v = 10; "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((c) => { if (v % 11 === 0) v++; o[c] = v++; }); return o; })();
export const cleanCntrNo = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);
export const fmtCntrNo = (s) => { const c = cleanCntrNo(s); return c.length > 4 ? `${c.slice(0, 4)} ${c.slice(4, 10)}${c.length > 10 ? ` ${c.slice(10)}` : ""}` : c; };
export function cntrCheckDigit(first10) {
  const c = cleanCntrNo(first10);
  if (!/^[A-Z]{4}\d{6}/.test(c)) return null;
  let sum = 0;
  for (let i = 0; i < 10; i++) { const ch = c[i]; sum += (i < 4 ? ISO_VAL[ch] : Number(ch)) * 2 ** i; }
  return (sum % 11) % 10;
}
// { ok, msg } — 빈 값은 ok(아직 모르는 경우가 많다)
export function checkCntrNo(s) {
  const c = cleanCntrNo(s);
  if (!c) return { ok: true, msg: "" };
  if (!/^[A-Z]{4}\d{7}$/.test(c)) return { ok: false, msg: "영문 4자 + 숫자 7자 (예: HMMU 123456 7)" };
  const d = cntrCheckDigit(c);
  return d === Number(c[10]) ? { ok: true, msg: "번호 확인됨" } : { ok: false, msg: `검사 숫자가 맞지 않습니다 (마지막 자리는 ${d})` };
}

// ── 해상 ─────────────────────────────────────────────────────────────
export const SEA_TYPES = ["FCL", "LCL", "BULK", "RO-RO"];
export const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
export const SERVICE_TERMS = ["CY-CY", "CY-CFS", "CFS-CY", "CFS-CFS", "CY-DOOR", "DOOR-CY", "DOOR-DOOR"];
export const BL_TYPES = ["Original B/L", "Surrender B/L", "Sea Waybill"];
export const FREIGHT_TERMS = ["Prepaid (선불)", "Collect (착불)"];
export const PKG_UNITS = ["CT (카톤)", "PLT (파렛트)", "PKG", "BAG", "DRUM", "ROLL", "BOX", "CASE", "UNIT", "SET"];
export const PORTS = [
  { group: "한국", items: [["KRPUS", "부산"], ["KRINC", "인천"], ["KRPTK", "평택"], ["KRKAN", "광양"], ["KRUSN", "울산"]] },
  { group: "중국 · 홍콩 · 대만", items: [["CNSHA", "상하이"], ["CNNGB", "닝보"], ["CNTAO", "칭다오"], ["CNTXG", "톈진 신강"], ["CNDLC", "다롄"], ["CNSZX", "선전"], ["CNXMN", "샤먼"], ["CNNSA", "광저우 난사"], ["HKHKG", "홍콩"], ["TWKHH", "가오슝"], ["TWKEL", "지룽"]] },
  { group: "일본", items: [["JPTYO", "도쿄"], ["JPYOK", "요코하마"], ["JPNGO", "나고야"], ["JPOSA", "오사카"], ["JPUKB", "고베"], ["JPHKT", "하카타"]] },
  { group: "동남아 · 인도 · 중동", items: [["VNHPH", "하이퐁"], ["VNSGN", "호치민"], ["THBKK", "방콕"], ["THLCH", "람차방"], ["SGSIN", "싱가포르"], ["MYPKG", "포트클랑"], ["IDJKT", "자카르타"], ["PHMNL", "마닐라"], ["INNSA", "나바셰바"], ["INMAA", "첸나이"], ["AEJEA", "제벨알리"]] },
  { group: "미주", items: [["USLAX", "로스앤젤레스"], ["USLGB", "롱비치"], ["USOAK", "오클랜드"], ["USSEA", "시애틀"], ["USTIW", "타코마"], ["USNYC", "뉴욕"], ["USSAV", "서배너"], ["USHOU", "휴스턴"], ["CAVAN", "밴쿠버"], ["MXZLO", "만사니요"], ["BRSSZ", "산투스"]] },
  { group: "유럽 · 대양주 · 러시아", items: [["NLRTM", "로테르담"], ["DEHAM", "함부르크"], ["BEANR", "안트베르펜"], ["GBFXT", "펠릭스토우"], ["FRLEH", "르아브르"], ["ITGOA", "제노바"], ["ESVLC", "발렌시아"], ["AUSYD", "시드니"], ["AUMEL", "멜버른"], ["RUVVO", "블라디보스토크"]] },
];
export const portLabel = (code) => { for (const g of PORTS) { const p = g.items.find((x) => x[0] === code); if (p) return `${p[1]} (${code})`; } return code || ""; };
export const portName = (code) => { for (const g of PORTS) { const p = g.items.find((x) => x[0] === code); if (p) return p[1]; } return code || ""; };

// ── 항공 ─────────────────────────────────────────────────────────────
export const AIRPORTS = [
  { group: "한국", items: [["ICN", "인천"], ["GMP", "김포"], ["PUS", "김해"], ["CJU", "제주"]] },
  { group: "일본 · 중국 · 홍콩 · 대만", items: [["NRT", "도쿄 나리타"], ["HND", "도쿄 하네다"], ["KIX", "오사카 간사이"], ["NGO", "나고야"], ["FUK", "후쿠오카"], ["PVG", "상하이 푸둥"], ["PEK", "베이징"], ["CAN", "광저우"], ["SZX", "선전"], ["TAO", "칭다오"], ["HKG", "홍콩"], ["TPE", "타이베이"]] },
  { group: "동남아 · 인도 · 중동", items: [["SIN", "싱가포르"], ["BKK", "방콕"], ["SGN", "호치민"], ["HAN", "하노이"], ["KUL", "쿠알라룸푸르"], ["CGK", "자카르타"], ["MNL", "마닐라"], ["DEL", "델리"], ["BOM", "뭄바이"], ["DXB", "두바이"], ["DOH", "도하"]] },
  { group: "미주", items: [["LAX", "로스앤젤레스"], ["SFO", "샌프란시스코"], ["SEA", "시애틀"], ["ANC", "앵커리지"], ["ORD", "시카고"], ["DFW", "댈러스"], ["ATL", "애틀랜타"], ["JFK", "뉴욕"], ["YVR", "밴쿠버"], ["MEX", "멕시코시티"]] },
  { group: "유럽 · 대양주", items: [["FRA", "프랑크푸르트"], ["AMS", "암스테르담"], ["LHR", "런던 히스로"], ["CDG", "파리"], ["MXP", "밀라노"], ["VIE", "빈"], ["IST", "이스탄불"], ["SYD", "시드니"]] },
];
export const airportLabel = (code) => { for (const g of AIRPORTS) { const p = g.items.find((x) => x[0] === code); if (p) return `${p[1]} (${code})`; } return code || ""; };
// 항공사 — [IATA 코드, 이름, AWB 앞 3자리]
export const AIRLINES = [
  ["KE", "대한항공", "180"], ["OZ", "아시아나항공", "988"], ["CX", "캐세이퍼시픽", "160"], ["SQ", "싱가포르항공", "618"], ["NH", "ANA", "205"], ["JL", "일본항공", "131"],
  ["KZ", "NCA (일본화물항공)", "933"], ["CI", "중화항공", "297"], ["BR", "에바항공", "695"], ["CA", "중국국제항공", "999"], ["MU", "중국동방항공", "781"], ["CZ", "중국남방항공", "784"],
  ["VN", "베트남항공", "738"], ["TG", "타이항공", "217"], ["EK", "에미레이트", "176"], ["QR", "카타르항공", "157"], ["TK", "터키항공", "235"], ["ET", "에티오피아항공", "071"],
  ["LH", "루프트한자", "020"], ["AF", "에어프랑스", "057"], ["KL", "KLM", "074"], ["BA", "영국항공", "125"], ["CV", "카고룩스", "172"],
  ["AA", "아메리칸항공", "001"], ["DL", "델타항공", "006"], ["UA", "유나이티드항공", "016"], ["FX", "페덱스", "023"], ["5X", "UPS", "406"], ["PO", "폴라에어카고", "403"],
];
export const airline = (code) => AIRLINES.find((a) => a[0] === code) || null;
export const AIR_WAREHOUSES = ["인천공항 대한항공 화물터미널", "인천공항 아시아나 화물터미널", "인천공항 AACT", "인천공항 외항사 터미널", "인천공항 스위스포트", "김포공항 화물청사", "김해공항 화물청사", "보세창고(직접 선택)"];
// MAWB — 앞 3자리(항공사) + 8자리(7자리 일련번호 + 검사 숫자 = 일련번호 % 7)
export const cleanAwb = (s) => String(s || "").replace(/\D/g, "").slice(0, 11);
export const fmtAwb = (s) => { const c = cleanAwb(s); return c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3, 7)}${c.length > 7 ? ` ${c.slice(7)}` : ""}` : c; };
export function checkAwb(s) {
  const c = cleanAwb(s);
  if (!c) return { ok: true, msg: "" };
  if (c.length !== 11) return { ok: false, msg: "숫자 11자리 (항공사 3자리 + 8자리)" };
  const d = Number(c.slice(3, 10)) % 7;
  return d === Number(c[10]) ? { ok: true, msg: "번호 확인됨" } : { ok: false, msg: `검사 숫자가 맞지 않습니다 (마지막 자리는 ${d})` };
}
// 부피중량(kg) = 가로 × 세로 × 높이(cm) × 개수 ÷ 6000 · 운임중량(C/W) = 실중량과 부피중량 중 큰 값(0.5kg 올림)
const num = (v) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
export const volumeWeight = (l, w, h, pcs = 1) => Math.round(((num(l) * num(w) * num(h) * Math.max(1, num(pcs))) / 6000) * 10) / 10;
export const chargeableWeight = (gross, vol) => Math.ceil(Math.max(num(gross), num(vol)) * 2) / 2;
export const cbmOf = (l, w, h, pcs = 1) => Math.round(((num(l) * num(w) * num(h) * Math.max(1, num(pcs))) / 1e6) * 1000) / 1000;
// 해상 LCL 운임톤(R/T) = CBM 과 중량(톤) 중 큰 값
export const revenueTon = (cbm, kg) => Math.round(Math.max(num(cbm), num(kg) / 1000) * 1000) / 1000;

// ── 운임 항목 · 통화 ───────────────────────────────────────────────────
export const CHARGE_ITEMS = {
  container: ["운송료", "대기료", "셔틀비", "회차료", "야간·휴일 할증", "위험물 할증", "냉동 할증", "통행료", "상하차비 (Lift On/Off)", "샤시 임대료", "보관료", "DEM (체화료)", "DET (지체료)", "기타"],
  sea: ["O/F (해상운임)", "BAF", "CAF", "LSS", "THC", "WFG (Wharfage)", "DOC FEE", "D/O FEE", "H/C (Handling)", "CFS Charge", "CCF (컨테이너 청소)", "SEAL FEE", "통관 수수료", "내륙운송료", "적하보험료", "DEM (체화료)", "DET (지체료)", "Storage", "기타"],
  air: ["A/F (항공운임)", "FSC (유류할증)", "SSC (보안할증)", "THC", "AWB FEE", "H/C (Handling)", "창고료", "통관 수수료", "Pick-up", "내륙운송료", "적하보험료", "기타"],
  inland: ["운송료", "대기료", "상하차비", "통행료", "기타"],
};
export const CURRENCIES = ["KRW", "USD", "EUR", "JPY", "CNY"];
// 기본 환율(직접 고쳐 쓴다 — 자동 환율 연동 전)
export const DEFAULT_RATE = { KRW: 1, USD: 1380, EUR: 1500, JPY: 9.2, CNY: 190 };
export const lineKrw = (l) => Math.round(num(l?.amount) * (l?.cur && l.cur !== "KRW" ? num(l.rate) || DEFAULT_RATE[l.cur] || 0 : 1));
export const sumLines = (lines) => (Array.isArray(lines) ? lines : []).reduce((a, l) => a + lineKrw(l), 0);
// 구간 손익 — 내륙처럼 금액 한 칸만 있는 예전 값(saleAmt · costAmt)도 받는다
export function legPnl(job) {
  const sale = sumLines(job?.sales) + num(job?.saleAmt);
  const cost = sumLines(job?.costs) + num(job?.costAmt);
  return { sale, cost, profit: sale - cost, margin: sale > 0 ? Math.round(((sale - cost) / sale) * 1000) / 10 : 0 };
}
export function sumPnl(jobs) {
  const t = (jobs || []).reduce((a, j) => { const p = legPnl(j); a.sale += p.sale; a.cost += p.cost; return a; }, { sale: 0, cost: 0 });
  return { ...t, profit: t.sale - t.cost, margin: t.sale > 0 ? Math.round(((t.sale - t.cost) / t.sale) * 1000) / 10 : 0 };
}
export const won = (n) => `${Math.round(num(n)).toLocaleString("ko-KR")}`;
export const wonShort = (n) => { const v = Math.round(num(n)); const a = Math.abs(v); if (a >= 1e8) return `${(v / 1e8).toFixed(a >= 1e9 ? 1 : 2)}억`; if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString("ko-KR")}만`; return v.toLocaleString("ko-KR"); };

// ── 날짜 · 마감 ───────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
export const kstNow = () => new Date(Date.now() + 9 * 3600e3);
export const todayYmd = (now = Date.now()) => new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
export const ymOf = (s) => String(s || "").slice(0, 7);
// "YYYY-MM-DD" 또는 "YYYY-MM-DDTHH:mm"(한국 시각) → ms. 날짜만 있으면 그날 끝(23:59)
export function toMs(s) {
  const v = String(s || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(v);
  if (!m) return 0;
  const hasT = m[4] !== undefined;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], hasT ? +m[4] : 23, hasT ? +m[5] : 59) - 9 * 3600e3;
}
export const fmtDT = (s) => { const v = String(s || ""); if (!v) return ""; const d = v.slice(5, 10).replace("-", "."); return v.length >= 16 ? `${d} ${v.slice(11, 16)}` : d; };
// 그 구간이 지켜야 하는 마감 — [{ key, label, at(ms), raw, penalty }] (끝난 구간은 없음)
//  penalty: 넘기면 돈이 나가는 마감(반납기한 · 반입마감 · 프리타임)
export function deadlinesOf(job) {
  if (!job || isDone(job)) return [];
  const out = [];
  const add = (key, label, raw, penalty = false, untilIdx = 99) => {
    const at = toMs(raw);
    const i = statusIndex(job.mode, job.status);
    if (at && (i < 0 || i < untilIdx)) out.push({ key, label, at, raw, penalty });
  };
  if (job.mode === "container") {
    add("door", "작업 시각", job.doorDate ? `${job.doorDate}${job.doorTime ? `T${job.doorTime}` : ""}` : "", false, 4);
    if (job.trip === "수출") add("closing", "반입 마감", job.cargoClosing, true, 5);
    else add("return", "반납 기한", job.freeTimeEnd, true, 5);
  } else if (job.mode === "sea") {
    add("doc", "서류 마감", job.docClosing, true, 2);
    add("cargo", "화물 마감", job.cargoClosing, true, 3);
    add("etd", "출항 (ETD)", job.etd, false, 3);
    add("eta", "입항 (ETA)", job.eta, false, 5);
    if (job.direction === "수입") add("free", "프리타임 종료", job.freeTimeEnd, true, 7);
  } else if (job.mode === "air") {
    add("cut", "반입 마감", job.cargoCutoff, true, 2);
    add("etd", "출발 (ETD)", job.etd, false, 3);
    add("eta", "도착 (ETA)", job.eta, false, 4);
  } else {
    add("pickup", "상차", job.pickupDate ? `${job.pickupDate}${job.pickupTime ? `T${job.pickupTime}` : ""}` : "", false, 2);
  }
  return out.sort((a, b) => a.at - b.at);
}
// 남은 시간 → { level: over | urgent(24시간 안) | soon(3일 안) | ok, text: "D-2" · "3시간 남음" · "2일 지남" }
export function dueInfo(at, now = Date.now()) {
  const diff = at - now;
  const H = 3600e3; const D = 24 * H;
  if (diff < 0) { const d = Math.floor(-diff / D); return { level: "over", text: d >= 1 ? `${d}일 지남` : `${Math.max(1, Math.floor(-diff / H))}시간 지남`, days: -Math.ceil(-diff / D) }; }
  if (diff < D) { const h = Math.floor(diff / H); return { level: "urgent", text: h >= 1 ? `${h}시간 남음` : `${Math.max(1, Math.floor(diff / 60000))}분 남음`, days: 0 }; }
  const days = Math.floor(diff / D);
  return { level: days < 3 ? "soon" : "ok", text: `D-${days}`, days };
}
// 가장 급한 마감 하나
export function topDeadline(job, now = Date.now()) {
  const l = deadlinesOf(job);
  if (!l.length) return null;
  const over = l.filter((d) => d.at < now && d.penalty);
  const pick = over[0] || l.find((d) => d.at >= now) || l[l.length - 1];
  return { ...pick, ...dueInfo(pick.at, now) };
}
// 반납기한 · 프리타임을 넘긴 날 수 × 하루 단가(overRate) = 예상 초과 비용
export function overCost(job, now = Date.now()) {
  const at = toMs(job?.freeTimeEnd);
  if (!at || isDone(job) || now <= at) return { days: 0, cost: 0 };
  const days = Math.ceil((now - at) / (24 * 3600e3));
  const qty = Math.max(1, num(job.cntrQty) || 1);
  return { days, cost: days * num(job.overRate) * qty };
}

// ── 번호 ─────────────────────────────────────────────────────────────
const seqOf = (s) => { const m = /-(\d{4})$/.exec(String(s || "")); return m ? Number(m[1]) : 0; };
export function nextNo(prefix, existing, now = Date.now()) {
  const d = new Date(now + 9 * 3600e3);
  const head = `${prefix}-${String(d.getUTCFullYear()).slice(2)}${pad(d.getUTCMonth() + 1)}-`;
  const max = (existing || []).filter((x) => String(x || "").startsWith(head)).reduce((a, x) => Math.max(a, seqOf(x)), 0);
  return `${head}${String(max + 1).padStart(4, "0")}`;
}
export const nextJobNo = (jobs, now) => nextNo("JB", (jobs || []).map((j) => j.jobNo), now);
export const nextRefNo = (mode, jobs, now) => nextNo(MODE_PREFIX[mode] || "IN", (jobs || []).map((j) => j.refNo), now);

// ── 인계(다음 구간 요청) ───────────────────────────────────────────────
//  해상 수입 FCL → 컨테이너(반출 배차) · 해상 LCL/항공 → 내륙(배송) · 컨테이너 → 내륙(적출 후 배송) · 수출은 반대로 앞 구간이 요청
export function handoffTargets(job, modules) {
  const has = (m) => (modules || []).includes(m);
  const out = [];
  if (job?.mode === "sea") { if (has("container")) out.push("container"); if (has("inland")) out.push("inland"); }
  if (job?.mode === "air") { if (has("inland")) out.push("inland"); }
  if (job?.mode === "container") { if (has("inland")) out.push("inland"); }
  if (job?.mode === "inland") { if (has("container")) out.push("container"); }
  return out;
}
// 다음 구간 문서의 처음 값 — 앞 구간에서 아는 것(거래처 · 번호 · 규격 · 일정)을 그대로 넘긴다
export function buildHandoff(from, toMode, extra = {}) {
  const base = {
    mode: toMode, jobNo: from.jobNo, direction: from.direction || "", client: from.client || "", status: HANDOFF_STATUS,
    fromLeg: from.id || "", fromMode: from.mode, fromRef: from.refNo || "", memo: extra.memo || "", cargo: from.cargo || from.commodity || "",
  };
  if (toMode === "container") {
    const c0 = (from.cntrs || [])[0] || {};
    return {
      ...base, trip: from.direction === "수출" ? "수출" : "수입", size: from.size || c0.size || "40HC", cntrQty: 1,
      line: from.line || "", bookingNo: from.bookingNo || "", blNo: from.mblNo || from.hblNo || from.blNo || "", vessel: from.vessel || "", voyage: from.voyage || "",
      cargoClosing: from.direction === "수출" ? from.cargoClosing || "" : "", freeTimeEnd: from.direction === "수입" ? from.freeTimeEnd || "" : "",
      pickupPlace: "", doorPlace: "", returnPlace: "", doorDate: "",
    };
  }
  return {
    ...base,
    pickupPlace: from.mode === "container" ? from.doorPlace || "" : from.mode === "air" ? from.warehouse || "" : "",
    dropPlace: "", pickupDate: String(from.eta || "").slice(0, 10), pickupTime: "",
    carType: "", carTon: "", pkgQty: from.pkgQty || from.pieces || "", weight: from.grossWeight || from.weight || "",
  };
}
// 같은 Job 의 구간들을 순서대로
export function groupByJob(jobs) {
  const m = new Map();
  (jobs || []).forEach((j) => { const k = j.jobNo || j.id; if (!m.has(k)) m.set(k, []); m.get(k).push(j); });
  return [...m.entries()].map(([jobNo, legs]) => {
    legs.sort((a, b) => (MODE_ORDER[a.mode] ?? 9) - (MODE_ORDER[b.mode] ?? 9) || String(a.refNo).localeCompare(String(b.refNo)));
    const head = legs[0];
    const ms = legs.map((l) => Number(l.createdAtMs) || 0);
    return { jobNo, legs, client: head.client || "", direction: head.direction || "", pnl: sumPnl(legs), createdAtMs: Math.max(0, ...ms), done: legs.every(isDone) };
  }).sort((a, b) => b.createdAtMs - a.createdAtMs);
}
// 구간 한 줄 요약(표 · 타임라인)
export function legTitle(j) {
  if (!j) return "";
  if (j.mode === "container") return [j.size, j.cntrNo ? fmtCntrNo(j.cntrNo) : "", j.line].filter(Boolean).join(" · ");
  if (j.mode === "sea") return [j.seaType, j.pol && j.pod ? `${portName(j.pol)} → ${portName(j.pod)}` : "", j.hblNo || j.mblNo].filter(Boolean).join(" · ");
  if (j.mode === "air") return [j.dep && j.arr ? `${j.dep} → ${j.arr}` : "", j.flightNo, j.hawbNo || fmtAwb(j.mawbNo)].filter(Boolean).join(" · ");
  return [j.pickupPlace && j.dropPlace ? `${j.pickupPlace} → ${j.dropPlace}` : j.pickupPlace || j.dropPlace || "", [j.carTon, j.carType].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
}
// 거래처 360 — 거래처마다 어느 사업부를 쓰는지 · 매출 · 안 쓰는 사업부(영업 기회)
export function clientMatrix(jobs, inlandRows = [], modules = MODES) {
  const m = new Map();
  const get = (name) => { const k = String(name || "").trim(); if (!k) return null; if (!m.has(k)) m.set(k, { client: k, by: {}, sale: 0, profit: 0, count: 0 }); return m.get(k); };
  const put = (o, mode, sale, profit) => { if (!o) return; const b = o.by[mode] || (o.by[mode] = { count: 0, sale: 0 }); b.count++; b.sale += sale; o.sale += sale; o.profit += profit; o.count++; };
  (jobs || []).forEach((j) => { const p = legPnl(j); put(get(j.client), j.mode, p.sale, p.profit); });
  (inlandRows || []).forEach((r) => { const s = num(r.청구운임); put(get(r.거래처명), "inland", s, s - num(r.기사운임)); });
  return [...m.values()].map((o) => ({ ...o, missing: (modules || []).filter((k) => !o.by[k]) })).sort((a, b) => b.sale - a.sale);
}
