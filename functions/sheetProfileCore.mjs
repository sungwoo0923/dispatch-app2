// ======================= functions/sheetProfileCore.mjs =======================
// 🔗 2026-11-07 구글시트 연동 "시트 프로필" — 화면(src/SheetConnect*.jsx)과 서버(functions/index.js sheetConnect)가 같이 쓰는 순수 함수
//  운송사마다 배차일지 시트 모양이 다르다(탭 이름 · 제목줄 위치 · 칸 이름 · 칸 수 · 제목 줄 · 수식 칸(#REF!) · 병합 칸).
//  프로그램이 기준(원본)이고 시트는 그 거울이라는 전제로, 시트 한 장을 "프로필" 하나로 설명한다.
//
//  프로필(sheetProfiles/{id}) 모양
//   { companyName, name, sheetUrl, spreadsheetId,
//     tabMode: "single" | "monthly" | "all",  tabs: [탭 이름], tabPattern: { kind, sample },
//     headerRow(0부터), headerDepth(1|2), dataStart(0부터),
//     columns: [{ idx, header, field, mode, confidence, source, transform? }],
//       mode: "data"(가져오고 보냄) | "readonly"(읽기만 · 오더에 안 넣음) | "calc"(계산열 · 수식 · 절대 안 씀) | "ignore" | "id"(오더ID 칸)
//     valueMaps: { 지급방식: {시트 값: 프로그램 값}, 배차방식: {...}, 배차상태: {...} },
//     dedupe: { cols: [열 번호] },  scope: { companyName, includeFixed } }
//
//  이 파일은 import가 없다(브라우저 · Node 둘 다에서 그대로 읽힘). 테스트: node scripts/sheetProfile.test.mjs

// ── 프로그램 칸 ─────────────────────────────────────────
//  key = 오더 문서 필드 이름. type = 값 바꾸기 규칙. calc = 프로그램이 계산하는 칸(시트 값은 가져오지 않음)
export const PROGRAM_FIELDS = [
  { key: "상차일", label: "상차일", type: "date", req: true },
  { key: "상차시간", label: "상차시간", type: "time" },
  { key: "하차일", label: "하차일", type: "date" },
  { key: "하차시간", label: "하차시간", type: "time" },
  { key: "등록일", label: "등록일", type: "date" },
  { key: "거래처명", label: "거래처명", type: "text", req: true },
  { key: "상차지명", label: "상차지명", type: "text" },
  { key: "상차지주소", label: "상차지주소", type: "text" },
  { key: "하차지명", label: "하차지명", type: "text" },
  { key: "하차지주소", label: "하차지주소", type: "text" },
  { key: "경유지", label: "경유지", type: "text", exportOnly: true },
  { key: "화물내용", label: "화물정보", type: "text" },
  { key: "차량톤수", label: "차량톤수", type: "text" },
  { key: "차량종류", label: "차량종류", type: "text" },
  { key: "차량번호", label: "차량번호", type: "plate" },
  { key: "이름", label: "기사명", type: "text" },
  { key: "전화번호", label: "전화번호", type: "phone" },
  { key: "청구운임", label: "청구운임", type: "money" },
  { key: "기사운임", label: "기사운임", type: "money" },
  { key: "수수료", label: "수수료", type: "money", calc: true },
  { key: "매익율", label: "매익률", type: "percent", calc: true },
  { key: "지급방식", label: "지급방식", type: "enum" },
  { key: "배차방식", label: "배차방식", type: "enum" },
  { key: "배차상태", label: "배차상태", type: "enum" },
  { key: "지급일", label: "지급일", type: "date" },
  { key: "메모", label: "메모", type: "text" },
  { key: "순번", label: "순번", type: "seq", keyOnly: true },
  { key: "오더ID", label: "오더ID", type: "id", keyOnly: true },
];
export const FIELD_BY_KEY = Object.fromEntries(PROGRAM_FIELDS.map((f) => [f.key, f]));
export const REQUIRED_FIELDS = PROGRAM_FIELDS.filter((f) => f.req).map((f) => f.key);
export const MODES = [["data", "가져오기·보내기"], ["readonly", "읽기전용"], ["calc", "계산열"], ["ignore", "무시"], ["id", "오더ID 칸"]];
// 프로그램 화면의 선택 목록(src/DispatchApp.jsx 1757줄)과 같은 값
export const PAY_OPTIONS = ["계산서", "착불", "선불", "계좌이체"];
export const DISPATCH_OPTIONS = ["24시", "인성", "직접배차", "24시(외부업체)", "로지스허브"];
export const STATUS_OPTIONS = ["배차중", "배차완료", "배차취소"];
export const ENUM_OPTIONS = { 지급방식: PAY_OPTIONS, 배차방식: DISPATCH_OPTIONS, 배차상태: STATUS_OPTIONS };
// 값 바꾸기 특수 대상: "__memo" = 메모 앞에 붙이기 · "__blank" = 비우기 · "__keep" = 시트 값 그대로
export const SPECIAL_TARGETS = [["__keep", "그대로"], ["__memo", "메모로 보내기"], ["__blank", "비우기"]];

// ── 동의어 사전(머리줄 글자 → 프로그램 칸) ─────────────────
//  정규화(norm) 후 비교. 앞쪽 = 정확히 같을 때 1.0, 포함될 때 0.75(2글자 이상만)
export const SYNONYMS = {
  상차일: ["상차일", "상차일자", "날짜", "일자", "배차일", "배차일자", "운송일", "운송일자", "작업일", "작업일자", "출발일", "출고일", "일시", "date", "상차날짜"],
  상차시간: ["상차시간", "상차시각", "출발시간", "입차시간", "상차time", "시간"],
  하차일: ["하차일", "하차일자", "도착일", "도착일자", "납품일", "입고일"],
  하차시간: ["하차시간", "하차시각", "도착시간", "도착시각", "납품시간"],
  등록일: ["등록일", "등록일자", "접수일", "접수일자", "오더일", "수주일"],
  거래처명: ["거래처명", "거래처", "화주", "화주명", "화주사", "고객사", "고객", "고객명", "업체명", "청구처", "발주처", "의뢰처"],
  상차지명: ["상차지명", "상차지", "상차처", "상차", "출발지", "출발지명", "출하지", "상차업체"],
  상차지주소: ["상차지주소", "상하지주소", "상차주소", "출발지주소", "상차지역", "출발주소", "상차위치"],
  하차지명: ["하차지명", "하차지", "하차처", "하차", "도착지", "도착지명", "납품처", "하차업체", "배송지"],
  하차지주소: ["하차지주소", "하차주소", "도착지주소", "도착주소", "하차지역", "배송지주소", "하차위치"],
  경유지: ["경유지", "경유"],
  화물내용: ["화물정보", "화물내용", "화물", "품목", "물품", "품명", "화물명", "적재물"],
  차량톤수: ["차량톤수", "톤수", "톤", "차량톤", "중량"],
  차량종류: ["차량종류", "차종", "차량종", "차량형태", "차량구분"],
  차량번호: ["차량번호", "차번", "차량no", "차량넘버", "차량"],
  이름: ["기사명", "기사", "기사이름", "기사님", "이름", "성명", "차주", "차주명", "운전자", "운전기사"],
  전화번호: ["전화번호", "연락처", "기사연락처", "전화", "핸드폰", "휴대폰", "휴대전화", "기사전화", "hp", "tel"],
  청구운임: ["청구운임", "청구", "청구금액", "청구액", "매출", "매출액", "운임", "운송료", "운송비", "판매가", "받을돈", "운임청구", "운임매출"],
  기사운임: ["기사운임", "기사님요금", "기사요금", "기사금액", "지급운임", "지급액", "지급금액", "매입", "매입액", "차비", "용차비", "줄돈", "운임기사", "운임매입", "운임지급"],
  수수료: ["수수료", "마진", "이익", "수익", "차액"],
  매익율: ["매익률", "매익율", "마진율", "이익률", "수익률", "마진률"],
  지급방식: ["지급방식", "선착불", "결제방식", "결제", "결제구분", "지불방식", "지불", "계산서", "착불", "작불", "정산방식"],
  배차방식: ["배차방식", "프로그램", "배차경로", "배차구분", "배차처", "콜", "앱"],
  배차상태: ["배차상태", "상태", "진행상태", "진행"],
  지급일: ["지급일", "지급일자", "입금일", "결제일", "정산일"],
  메모: ["비고", "메모", "특이사항", "참고", "비고란", "remark", "note"],
  순번: ["순번", "번호", "no", "연번", "순서", "구분번호"],
  오더ID: ["오더id", "오더번호id", "orderid"],
};

// 머리줄·값 비교용 정규화 — 공백·괄호·기호를 지우고 소문자
export const norm = (s) => String(s ?? "").replace(/ /g, " ").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
const cell = (v) => String(v ?? "").replace(/ /g, " ").trim();
const pad = (n) => String(n).padStart(2, "0");

// 머리줄 글자 하나 → 후보 [{ field, score }] (점수 높은 순)
export function headerCandidates(header) {
  const n = norm(header);
  if (!n) return [];
  const out = [];
  for (const [field, syns] of Object.entries(SYNONYMS)) {
    let best = 0;
    syns.forEach((s, i) => {
      const sn = norm(s);
      if (!sn) return;
      if (n === sn) best = Math.max(best, 1 - Math.min(i, 5) * 0.01); // 앞 후보일수록 아주 조금 높게
      else if (sn.length >= 2 && n.includes(sn)) best = Math.max(best, 0.75 - (n.length - sn.length) * 0.01);
      else if (n.length >= 2 && sn.includes(n) && sn.length - n.length <= 2) best = Math.max(best, 0.6);
    });
    if (best > 0) out.push({ field, score: Math.round(best * 100) / 100 });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ── 값 살펴보기(sniff) ─────────────────────────────────
export const ERROR_RE = /^#(REF!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!|ERROR!|NULL!|SPILL!|CALC!)/i;
const PLATE_RE = /^(?:[가-힣]{2})?\d{2,3}\s?[가-힣]\s?\d{4}$/;
const PHONE_RE = /^(?:0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}|01\d{8,9}|1\d{3}-?\d{4})$/;
const TIME_RE = /^(?:(?:오전|오후|am|pm)\s*\d{1,2}(?::\d{2})?|\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:am|pm))?|\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?)$/i;
const PAY_WORDS = new Set(["계산서", "착불", "선불", "계좌이체", "인수증", "세금계산서", "현금", "손실", "카드", "선착불"]);
const DISPATCH_WORDS = new Set(["24시", "24시콜", "인성", "인성데이타", "직접배차", "직접", "로지스허브", "허브", "화물맨", "원콜", "고정기사", "24시외부업체"]);
const STATUS_WORDS = new Set(["배차완료", "배차중", "배차취소", "완료", "대기", "취소", "미배차", "상차완료", "하차완료"]);
export const LOOKUP_MISS = /정보\s*없음|#N\/A/;

export function looksDate(v) { return !!parseDate(v, { y: 2026, m: 1 }); }
const isMoneyLike = (s) => /^[₩\\]?\s*-?[\d,]+(?:\.\d+)?\s*(?:원|만원?|천원?)?$/.test(s) && /\d/.test(s);

// 한 칸의 값들 → { type, ratio, counts } — 수식(=로 시작) 목록을 같이 주면 수식 칸도 찾는다
export function sniffColumn(values, formulas = null) {
  const vals = (values || []).map(cell).filter(Boolean);
  const n = vals.length;
  const counts = { date: 0, time: 0, plate: 0, phone: 0, money: 0, percent: 0, int: 0, error: 0, lookup: 0, pay: 0, dispatch: 0, status: 0, name: 0, formula: 0 };
  const fs = (formulas || []).map(cell).filter(Boolean);
  counts.formula = fs.filter((f) => f.startsWith("=")).length;
  vals.forEach((s) => {
    const t = s.replace(/\s+/g, "");
    if (ERROR_RE.test(s)) counts.error++;
    if (LOOKUP_MISS.test(s)) counts.lookup++;
    if (PLATE_RE.test(t) || PLATE_RE.test(s.replace(/\s*정보\s*없음.*/, "").replace(/\s+/g, ""))) counts.plate++;
    if (PHONE_RE.test(t)) counts.phone++;
    if (/^-?\d+(?:\.\d+)?\s*%$/.test(t)) counts.percent++;
    if (TIME_RE.test(s)) counts.time++;
    else if (looksDate(s)) counts.date++;
    if (/^\d{1,4}$/.test(t)) counts.int++;
    else if (isMoneyLike(t) && !PHONE_RE.test(t)) counts.money++;
    const w = norm(s);
    if (PAY_WORDS.has(w)) counts.pay++;
    if (DISPATCH_WORDS.has(w)) counts.dispatch++;
    if (STATUS_WORDS.has(w)) counts.status++;
    if (/^[가-힣]{2,4}$/.test(t) && !PAY_WORDS.has(w) && !DISPATCH_WORDS.has(w) && !STATUS_WORDS.has(w)) counts.name++;
  });
  if (!n && !counts.formula) return { type: "empty", ratio: 0, counts, n };
  const r = (k) => (n ? counts[k] / n : 0);
  const formulaRatio = fs.length ? counts.formula / Math.max(fs.length, n) : 0;
  // 순서가 중요: 오류 · 수식 · 조회 실패("정보 없음")가 먼저
  if (r("error") >= 0.3) return { type: "error", ratio: r("error"), counts, n };
  if (formulaRatio >= 0.5) return { type: "formula", ratio: formulaRatio, counts, n };
  if (r("lookup") >= 0.2) return { type: "lookup", ratio: r("lookup"), counts, n };
  const order = [["plate", 0.6], ["phone", 0.6], ["percent", 0.6], ["date", 0.6], ["time", 0.6], ["pay", 0.6], ["dispatch", 0.6], ["status", 0.6], ["money", 0.6], ["int", 0.7], ["name", 0.7]];
  for (const [k, th] of order) if (r(k) >= th) {
    if (k === "int") { // 1,2,3… 차례면 순번, 아니면 숫자(금액·톤)
      const nums = vals.map((x) => +x.replace(/\D/g, ""));
      const seq = nums.filter((x, i) => i && (x === nums[i - 1] + 1 || x === 1)).length >= (nums.length - 1) * 0.7;
      const big = nums.filter((x) => x >= 1000).length >= nums.length * 0.5;
      return { type: seq ? "seq" : big ? "money" : "int", ratio: r(k), counts, n };
    }
    return { type: k, ratio: r(k), counts, n };
  }
  return { type: "text", ratio: 1, counts, n };
}
// 값 모양 → 어울리는 프로그램 칸(머리줄을 못 읽었을 때)
const SNIFF_FIELD = { plate: ["차량번호", 0.8], phone: ["전화번호", 0.75], pay: ["지급방식", 0.75], dispatch: ["배차방식", 0.75], status: ["배차상태", 0.65], date: ["상차일", 0.5], time: ["상차시간", 0.45], percent: ["매익율", 0.55], seq: ["순번", 0.5] };
// 이 칸 종류와 값 모양이 맞나
const TYPE_OK = {
  date: ["date"], time: ["time", "int"], plate: ["plate"], phone: ["phone"], money: ["money", "int"], percent: ["percent"], seq: ["seq", "int"],
  enum: ["pay", "dispatch", "status", "text", "name"], text: ["text", "name", "int", "pay", "dispatch", "status", "money", "date", "time"],
};
function sniffFits(fieldKey, type) {
  const f = FIELD_BY_KEY[fieldKey];
  if (!f || type === "empty" || type === "text") return 0;
  if (fieldKey === "지급방식") return type === "pay" ? 1 : ["dispatch", "plate", "phone", "date", "money"].includes(type) ? -1 : 0;
  if (fieldKey === "배차방식") return type === "dispatch" ? 1 : ["pay", "plate", "phone", "date", "money"].includes(type) ? -1 : 0;
  if (fieldKey === "배차상태") return type === "status" ? 1 : 0;
  if (fieldKey === "이름") return type === "name" ? 1 : ["plate", "phone", "date", "money"].includes(type) ? -1 : 0;
  const ok = TYPE_OK[f.type];
  if (!ok) return 0;
  if (ok.includes(type)) return 1;
  if (f.type === "text") return 0;
  return -1;
}

// ── 머리줄 찾기 ────────────────────────────────────────
// merges(API의 sheets.merges, 0부터 · end 미포함)를 값에 펼친다 — 병합 칸은 왼쪽 위 칸에만 값이 있어서
export function applyMerges(rows, merges = []) {
  const out = (rows || []).map((r) => [...(r || [])]);
  (merges || []).forEach((m) => {
    const r0 = m.startRowIndex || 0; const c0 = m.startColumnIndex || 0;
    const r1 = m.endRowIndex ?? r0 + 1; const c1 = m.endColumnIndex ?? c0 + 1;
    const v = out[r0]?.[c0] ?? "";
    for (let r = r0; r < Math.min(r1, out.length + 1); r++) {
      if (!out[r]) out[r] = [];
      for (let c = c0; c < c1; c++) if (r !== r0 || c !== c0) out[r][c] = v;
    }
  });
  return out;
}
const rowCells = (r) => (r || []).map(cell);
const nonEmpty = (r) => rowCells(r).filter(Boolean).length;
function headerScore(r) {
  const cs = rowCells(r);
  let hits = 0, texty = 0, numeric = 0;
  const seen = new Set();
  cs.forEach((c) => {
    if (!c) return;
    const top = headerCandidates(c)[0];
    if (top && top.score >= 0.6 && !seen.has(top.field)) { hits++; seen.add(top.field); }
    if (/^[-\d,.:/\s%₩원]+$/.test(c) || looksDate(c) || ERROR_RE.test(c)) numeric++;
    else if (c.length <= 16) texty++;
  });
  return { hits, texty, numeric, filled: cs.filter(Boolean).length, score: hits * 3 + texty - numeric * 2 };
}
// 두 줄 머리줄 합치기 — 위 줄(묶음 이름, 병합으로 펼쳐진 값)과 아래 줄(세부 이름)
export function combineHeader(top, sub) {
  const len = Math.max(top.length, sub.length);
  const out = [];
  for (let i = 0; i < len; i++) {
    const a = cell(top[i]); const b = cell(sub[i]);
    if (!b) out.push(a);
    else if (!a || a === b) out.push(b);
    else {
      // 아래 줄만으로 뜻이 통하면 아래 줄, 아니면 "위+아래"(예: 상차 + 주소 → 상차주소)
      const both = `${a} ${b}`;
      const cs = headerCandidates(b)[0]; const cb = headerCandidates(both)[0];
      out.push(cb && (!cs || cb.score > cs.score || (cb.score >= 0.95 && cb.field !== cs.field)) ? both : b);
    }
  }
  return out;
}
// rows(값 2차원 배열, 병합 펼친 뒤) → { headerRow, depth, headers, dataStart, titleRows }
export function detectHeader(rows, { maxScan = 30 } = {}) {
  const rs = (rows || []).slice(0, maxScan);
  let best = { i: -1, s: -1e9, h: null };
  rs.forEach((r, i) => {
    const h = headerScore(r);
    if (h.filled < 2) return; // 제목 줄 · 빈 줄
    const s = h.score + (h.hits >= 3 ? 5 : 0);
    if (s > best.s) best = { i, s, h };
  });
  if (best.i < 0) return { headerRow: 0, depth: 1, headers: rowCells(rows?.[0] || []), dataStart: 1, titleRows: [] };
  let headerRow = best.i; let depth = 1; let headers = rowCells(rs[headerRow]);
  // 두 줄 머리줄: 아래 줄도 글자 줄이고 합쳤을 때 사전에 더 많이 맞으면
  const below = rs[headerRow + 1];
  if (below) {
    const hb = headerScore(below);
    if (hb.hits >= 1 && hb.numeric <= 1 && hb.texty >= 2) {
      const comb = combineHeader(rs[headerRow], below);
      const hc = headerScore(comb);
      if (hc.hits > best.h.hits && hc.hits > hb.hits - 0) { depth = 2; headers = comb; }
    }
  }
  // 위 줄이 묶음 이름(병합)인 경우 — 이 줄이 세부 이름이고 위 줄이 듬성듬성한 글자 줄
  if (depth === 1 && headerRow > 0) {
    const above = rs[headerRow - 1];
    const ha = headerScore(above);
    const ac = rowCells(above);
    const mergeLike = ac.some((c, i) => i && c && c === ac[i - 1]);
    if (ha.filled >= 2 && ha.numeric === 0 && (ha.filled < best.h.filled || mergeLike)) {
      const comb = combineHeader(above, rs[headerRow]);
      const hc = headerScore(comb);
      if (hc.hits > best.h.hits) { depth = 2; headerRow -= 1; headers = comb; }
    }
  }
  const titleRows = [];
  for (let i = 0; i < headerRow; i++) if (nonEmpty(rs[i])) titleRows.push(i);
  let dataStart = headerRow + depth;
  while (dataStart < (rows || []).length && !nonEmpty(rows[dataStart])) dataStart++;
  return { headerRow, depth, headers, dataStart, titleRows };
}

// ── 칸 자동 맞추기 ─────────────────────────────────────
//  headers: 머리줄 글자 · samples: 데이터 줄(값) · formulas: 같은 줄들의 수식(있으면)
//  → columns [{ idx, header, field, mode, confidence, source, sniff, samples }]
export function autoMapColumns(headers, samples = [], formulas = []) {
  const width = Math.max(headers.length, ...samples.map((r) => (r || []).length), 0);
  const cols = [];
  for (let i = 0; i < width; i++) {
    const header = cell(headers[i]);
    const vals = samples.map((r) => cell(r?.[i]));
    const fvals = formulas.length ? formulas.map((r) => cell(r?.[i])) : null;
    const sn = sniffColumn(vals, fvals);
    if (!header && sn.type === "empty") continue;
    const cands = headerCandidates(header).map((c) => {
      const fit = sniffFits(c.field, sn.type);
      return { ...c, score: Math.max(0, Math.min(1, c.score + (fit > 0 ? 0.08 : fit < 0 ? -0.35 : 0))), source: "dict" };
    });
    if (SNIFF_FIELD[sn.type]) {
      const [f, sc] = SNIFF_FIELD[sn.type];
      const ex = cands.find((c) => c.field === f);
      if (ex) ex.score = Math.min(1, Math.max(ex.score, sc + 0.1));
      else cands.push({ field: f, score: header ? sc - 0.15 : sc, source: "sniff" });
    }
    cands.sort((a, b) => b.score - a.score);
    cols.push({ idx: i, header, sniff: sn.type, samples: vals.filter(Boolean).slice(0, 5), cands });
  }
  // 한 프로그램 칸 = 한 시트 칸 — 점수 높은 짝부터
  const pairs = [];
  cols.forEach((c) => c.cands.forEach((k) => pairs.push({ c, ...k })));
  pairs.sort((a, b) => b.score - a.score || a.c.idx - b.c.idx);
  const used = new Set(); const done = new Set();
  pairs.forEach((p) => {
    if (p.score < 0.4 || used.has(p.field) || done.has(p.c.idx)) return;
    used.add(p.field); done.add(p.c.idx);
    p.c.field = p.field; p.c.confidence = Math.round(p.score * 100) / 100; p.c.source = p.source;
  });
  return cols.map((c) => {
    const f = c.field ? FIELD_BY_KEY[c.field] : null;
    let mode = f ? "data" : "readonly";
    if (["error", "formula", "lookup"].includes(c.sniff)) mode = "calc"; // #REF! · 수식 · "정보 없음" 칸은 절대 쓰지 않음
    else if (f?.calc) mode = "calc";
    else if (c.field === "순번") mode = "readonly";
    else if (c.field === "오더ID") mode = "id";
    if (!c.header && !f && mode !== "calc") mode = "ignore";
    const out = { idx: c.idx, header: c.header, field: c.field || "", mode, confidence: c.field ? c.confidence : 0, source: c.field ? c.source : "", sniff: c.sniff, samples: c.samples };
    if (f?.type === "date") out.transform = { date: "auto", fillDown: c.field === "상차일" };
    if (f?.type === "money") out.transform = { unit: guessMoneyUnit(c.samples) };
    return out;
  });
}
// 금액 칸에 "12" "15"처럼 작은 숫자만 있으면 만원 단위로 적은 시트
function guessMoneyUnit(samples) {
  const nums = samples.map((s) => +String(s).replace(/[^\d.]/g, "")).filter((x) => x > 0);
  if (nums.length >= 2 && nums.every((x) => x < 1000) && samples.every((s) => !/만|천/.test(s))) return "만원";
  return "원";
}
// 확신이 낮은 칸(AI에게 물어볼 칸)
export const ambiguousColumns = (columns, th = 0.6) => columns.filter((c) => c.mode !== "calc" && c.mode !== "ignore" && (!c.field || c.confidence < th));
// AI 답({ idx, field, confidence }) 반영 — 이미 다른 칸에 확실히 붙은 프로그램 칸은 건드리지 않음
export function applyAiSuggestions(columns, suggestions = []) {
  const firm = new Set(columns.filter((c) => c.field && c.confidence >= 0.6).map((c) => c.field));
  return columns.map((c) => {
    const s = suggestions.find((x) => +x.idx === c.idx);
    if (!s || !s.field || !FIELD_BY_KEY[s.field] || firm.has(s.field) || (c.field && c.confidence >= 0.6)) return c;
    const conf = Math.max(0, Math.min(0.95, +s.confidence || 0.5));
    if (c.field && c.confidence >= conf) return c;
    firm.add(s.field);
    const f = FIELD_BY_KEY[s.field];
    return { ...c, field: s.field, confidence: conf, source: "ai", mode: f.calc ? "calc" : s.field === "순번" ? "readonly" : s.field === "오더ID" ? "id" : (c.mode === "calc" ? "calc" : "data") };
  });
}
// 필수 칸 확인
export function missingRequired(columns) {
  const have = new Set(columns.filter((c) => c.mode === "data" && c.field).map((c) => c.field));
  return REQUIRED_FIELDS.filter((k) => !have.has(k));
}
// 같은 프로그램 칸이 두 시트 칸에 연결돼 있나
export function duplicateFields(columns) {
  const seen = {}; const dup = new Set();
  columns.filter((c) => c.field && c.mode !== "ignore").forEach((c) => { if (seen[c.field] != null) dup.add(c.field); seen[c.field] = c.idx; });
  return [...dup];
}

// ── 값 바꾸기 ──────────────────────────────────────────
// 날짜: 2025-11-01 · 2025. 11. 1 · 25-11-01 · 11/1 · 11월1일 · 11.1 · 2025-11-01(토) · 엑셀 일련번호 · 11/1/2025(미국식)
//  hint = { y, m } (탭 이름 등에서 얻은 연·월)
export function parseDate(v, hint = {}, fmt = "auto") {
  const s = cell(v).replace(/\(.*?\)/g, "").trim();
  if (!s) return "";
  const ok = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100 ? `${y}-${pad(m)}-${pad(d)}` : "");
  const Y = hint.y || new Date().getFullYear();
  let m;
  if ((m = s.match(/^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/))) return ok(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return fmt === "dmy" ? ok(+m[3], +m[2], +m[1]) : ok(+m[3], +m[1], +m[2]);
  if ((m = s.match(/^(\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?$/))) return ok(2000 + +m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?\.?$/))) return fmt === "dmy" ? ok(Y, +m[2], +m[1]) : ok(Y, +m[1], +m[2]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return ok(+m[1], +m[2], +m[3]);
  if (/^\d{5}(\.\d+)?$/.test(s) && +s > 30000 && +s < 80000) { // 엑셀 날짜 일련번호
    const d = new Date(Math.round((+s - 25569) * 86400000));
    return ok(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if ((m = s.match(/^(\d{1,2})\s*일$/)) && hint.m) return ok(Y, hint.m, +m[1]);
  return "";
}
// 금액: "120,000" "₩120,000" "12만" "12만원" "1.5만" "12만5천" "-" · unit "만원"이면 숫자만 적힌 칸 × 10000
export function parseMoney(v, unit = "원") {
  let s = cell(v).replace(/[₩\\\s]/g, "");
  if (!s || /^[-–]+$/.test(s) || ERROR_RE.test(s)) return "";
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()]/g, "").replace(/^-/, "");
  let n = 0; let m;
  if ((m = s.match(/^([\d,.]+)만(?:([\d,.]+)천)?원?$/))) n = +m[1].replace(/,/g, "") * 10000 + (m[2] ? +m[2].replace(/,/g, "") * 1000 : 0);
  else if ((m = s.match(/^([\d,.]+)천원?$/))) n = +m[1].replace(/,/g, "") * 1000;
  else if ((m = s.match(/^([\d,]+(?:\.\d+)?)원?$/))) {
    n = +m[1].replace(/,/g, "");
    if (unit === "만원") n *= 10000; else if (unit === "천원") n *= 1000;
  } else return "";
  if (!Number.isFinite(n)) return "";
  return String(Math.round(neg ? -n : n));
}
export function parsePhone(v) {
  const d = cell(v).replace(/\D/g, "");
  if (/^01\d{8,9}$/.test(d)) return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (/^02\d{7,8}$/.test(d)) return d.length === 10 ? `02-${d.slice(2, 6)}-${d.slice(6)}` : `02-${d.slice(2, 5)}-${d.slice(5)}`;
  if (/^0\d{9,10}$/.test(d)) return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return cell(v);
}
export const parsePlate = (v) => cell(v).replace(/\s*정보\s*없음.*$/, "").replace(/\s+/g, "");

// 기본 값 바꾸기 표(시트 값 → 프로그램 값). 프로필에서 고칠 수 있다.
export const DEFAULT_VALUE_MAPS = {
  지급방식: { 계산서: "계산서", 세금계산서: "계산서", 인수증: "계산서", 착불: "착불", 작불: "착불", 선불: "선불", 계좌이체: "계좌이체", 이체: "계좌이체", 현금: "착불", 손실: "__memo" },
  배차방식: { "24시": "24시", "24시콜": "24시", 인성: "인성", 인성데이타: "인성", 직접배차: "직접배차", 직접: "직접배차", 로지스허브: "로지스허브", 허브: "로지스허브", "24시외부업체": "24시(외부업체)" },
  배차상태: { 배차완료: "배차완료", 완료: "배차완료", 상차완료: "배차완료", 하차완료: "배차완료", 배차중: "배차중", 대기: "배차중", 미배차: "배차중", 배차취소: "배차취소", 취소: "배차취소" },
};
// 값 바꾸기 하나 — { value, toMemo, warn }
export function mapEnum(field, raw, valueMaps = {}) {
  const s = cell(raw);
  if (!s) return { value: "" };
  const table = { ...(DEFAULT_VALUE_MAPS[field] || {}), ...(valueMaps?.[field] || {}) };
  const hit = Object.entries(table).find(([k]) => norm(k) === norm(s));
  const to = hit ? hit[1] : null;
  if (to === "__memo") return { value: "", toMemo: s };
  if (to === "__blank") return { value: "" };
  if (to && to !== "__keep") return { value: to };
  const opts = ENUM_OPTIONS[field] || [];
  const direct = opts.find((o) => norm(o) === norm(s));
  if (direct) return { value: direct };
  return { value: s, warn: `${FIELD_BY_KEY[field]?.label || field} 값 "${s}"은(는) 프로그램 목록에 없어요` };
}
// 시트 칸에 실제로 있는 값 목록(값 바꾸기 화면) — { 값: 개수 }
export function distinctValues(rows, idx, limit = 30) {
  const m = new Map();
  rows.forEach((r) => { const v = cell(r?.[idx]); if (v) m.set(v, (m.get(v) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

// ── 탭 고르기 ──────────────────────────────────────────
// 탭 이름 → 연·월 { y, m, kind } — "25년11월" "2025-11" "2025.11" "11월" "25.11" "2025년 11월"
export function tabMonth(title, yearHint = new Date().getFullYear()) {
  const t = cell(title);
  let m;
  if ((m = t.match(/^(\d{2}|\d{4})\s*년\s*(\d{1,2})\s*월/))) return { y: m[1].length === 2 ? 2000 + +m[1] : +m[1], m: +m[2], kind: m[1].length === 2 ? "yy년m월" : "yyyy년m월" };
  if ((m = t.match(/^(20\d{2})\s*[-./_]\s*(\d{1,2})(?!\d)(?!\s*[-./]\s*\d)/))) return { y: +m[1], m: +m[2], kind: m[0].includes("-") ? "yyyy-mm" : "yyyy.mm" };
  if ((m = t.match(/^(\d{2})\s*[.\-_]\s*(\d{1,2})$/)) && +m[2] <= 12) return { y: 2000 + +m[1], m: +m[2], kind: "yy.mm" };
  if ((m = t.match(/^(\d{1,2})\s*월/)) && +m[1] >= 1 && +m[1] <= 12) return { y: yearHint, m: +m[1], kind: "m월" };
  return null;
}
// 탭 목록에서 월별 탭 묶음 찾기 → { kind, tabs:[{title,y,m}] } | null (같은 모양 탭이 2개 이상이어야)
export function detectMonthlyTabs(titles, yearHint) {
  const by = {};
  titles.forEach((t) => { const x = tabMonth(t, yearHint); if (x) (by[x.kind] = by[x.kind] || []).push({ title: t, ...x }); });
  const best = Object.entries(by).sort((a, b) => b[1].length - a[1].length)[0];
  if (!best || best[1].length < 2) return null;
  const tabs = best[1].sort((a, b) => a.y * 12 + a.m - (b.y * 12 + b.m));
  return { kind: best[0], tabs, sample: tabs[tabs.length - 1].title };
}
// 상차일 → 그 달 탭 이름(새로 만들 때의 이름)
export function monthTabName(kind, ymd, sample = "") {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})/);
  if (!m) return "";
  const y = +m[1]; const mo = +m[2];
  const spaced = /\s/.test(sample);
  switch (kind) {
    case "yy년m월": return spaced ? `${String(y).slice(2)}년 ${mo}월` : `${String(y).slice(2)}년${mo}월`;
    case "yyyy년m월": return spaced ? `${y}년 ${mo}월` : `${y}년${mo}월`;
    case "yyyy-mm": return `${y}-${pad(mo)}`;
    case "yyyy.mm": return `${y}.${pad(mo)}`;
    case "yy.mm": return `${String(y).slice(2)}.${pad(mo)}`;
    case "m월": return `${mo}월`;
    default: return "";
  }
}
// 오더 상차일로 쓸 탭 — 있는 탭 중 같은 연·월(없으면 새 이름과 만들어야 함 표시)
export function tabForDate(profile, ymd, titles = []) {
  if (profile.tabMode !== "monthly") return { tab: profile.writeTab || profile.tabs?.[0] || "", exists: true };
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})/);
  if (!m) return { tab: "", exists: false };
  const kind = profile.tabPattern?.kind;
  const hit = titles.find((t) => { const x = tabMonth(t, +m[1]); return x && x.kind === kind && x.y === +m[1] && x.m === +m[2]; })
    || (kind === "m월" ? null : titles.find((t) => { const x = tabMonth(t, +m[1]); return x && x.y === +m[1] && x.m === +m[2]; }));
  if (hit) return { tab: hit, exists: true };
  return { tab: monthTabName(kind, ymd, profile.tabPattern?.sample), exists: false };
}
// 가져올 탭 목록(프로필 기준)
export function tabsToRead(profile, titles = [], { from = "", to = "" } = {}) {
  if (profile.tabMode === "single") return (profile.tabs || []).filter((t) => titles.includes(t)).slice(0, 1);
  if (profile.tabMode === "all") return (profile.tabs?.length ? profile.tabs : titles).filter((t) => titles.includes(t));
  const kind = profile.tabPattern?.kind;
  const fy = from ? +from.slice(0, 4) : undefined;
  return titles.filter((t) => {
    const x = tabMonth(t, fy);
    if (!x || (kind && x.kind !== kind)) return false;
    const k = x.y * 12 + x.m;
    if (from && k < +from.slice(0, 4) * 12 + +from.slice(5, 7)) return false;
    if (to && k > +to.slice(0, 4) * 12 + +to.slice(5, 7)) return false;
    return true;
  });
}

// ── 줄 → 오더 ─────────────────────────────────────────
const TOTAL_RE = /^(합계|소계|총계|총합|계|total)$/i;
export function isSkippableRow(row, profile, headers) {
  const cs = rowCells(row);
  if (!cs.some(Boolean)) return "빈 줄";
  const dataCols = profile.columns.filter((c) => c.mode === "data" || c.mode === "readonly" || c.mode === "id");
  if (!dataCols.some((c) => cs[c.idx] && !ERROR_RE.test(cs[c.idx]))) return "빈 줄";
  if (cs.some((c) => TOTAL_RE.test(c.replace(/\s/g, "")))) return "합계 줄";
  if (headers && headers.length) { // 머리줄이 다시 나온 줄
    const same = profile.columns.filter((c) => c.header && norm(cs[c.idx]) === norm(c.header)).length;
    if (same >= 3) return "머리줄 반복";
  }
  return "";
}
// 한 줄을 오더 칸으로 — ctx = { hint:{y,m}, prev: 앞 줄의 결과(fillDown) }
export function rowToOrder(profile, row, ctx = {}) {
  const cs = rowCells(row);
  const rec = {}; const errors = []; const warnings = []; const memo = [];
  profile.columns.forEach((c) => {
    if (c.mode !== "data" || !c.field) return;
    const f = FIELD_BY_KEY[c.field];
    if (!f || f.calc || f.keyOnly || f.exportOnly) return;
    let raw = cs[c.idx] || "";
    if (ERROR_RE.test(raw)) { warnings.push(`${c.header || f.label} 칸 오류값(${raw})은 건너뜀`); raw = ""; }
    if (!raw && c.transform?.fillDown && ctx.prev?.[c.field]) { rec[c.field] = ctx.prev[c.field]; return; }
    if (!raw) return;
    switch (f.type) {
      case "date": {
        const d = parseDate(raw, ctx.hint || {}, c.transform?.date || "auto");
        if (d) rec[c.field] = d; else errors.push(`${f.label} 형식 확인("${raw}")`);
        break;
      }
      case "money": {
        const n = parseMoney(raw, c.transform?.unit || "원");
        if (n !== "") rec[c.field] = n; else warnings.push(`${f.label} 숫자가 아님("${raw}")`);
        break;
      }
      case "phone": rec[c.field] = parsePhone(raw); break;
      case "plate": rec[c.field] = parsePlate(raw); break;
      case "enum": {
        const r = mapEnum(c.field, raw, profile.valueMaps);
        if (r.value) rec[c.field] = r.value;
        if (r.toMemo) memo.push(r.toMemo);
        if (r.warn) warnings.push(r.warn);
        break;
      }
      default: rec[c.field] = raw;
    }
  });
  if (memo.length) rec.메모 = [memo.join(" "), rec.메모].filter(Boolean).join(" · ");
  if (rec.상차일 && !rec.하차일) rec.하차일 = rec.상차일;
  if (rec.상차일 && !rec.등록일) rec.등록일 = rec.상차일;
  if (!rec.상차일) { if (!errors.some((e) => e.startsWith("상차일"))) errors.push("상차일 없음"); }
  if (!rec.거래처명) errors.push("거래처명 없음");
  if (rec.청구운임 || rec.기사운임) rec.수수료 = String((+rec.청구운임 || 0) - (+rec.기사운임 || 0));
  if (!rec.배차상태) rec.배차상태 = rec.차량번호 ? "배차완료" : "배차중";
  return { rec, errors, warnings, key: dedupeKey(profile, cs, rec) };
}

// ── 중복 확인 열쇠 ─────────────────────────────────────
//  dedupe.cols = 시트 열 번호들(예: 순번+날짜 · 비고(고유값) 하나 · 여러 칸 묶음). 날짜 칸은 날짜로 맞춰서 비교
export function suggestDedupe(columns) {
  const uniq = columns.find((c) => /고유|unique|키|key/i.test(c.header) && c.mode !== "calc");
  if (uniq) return { cols: [uniq.idx], label: uniq.header };
  const id = columns.find((c) => c.mode === "id");
  if (id) return { cols: [id.idx], label: id.header };
  const seq = columns.find((c) => c.field === "순번"); const date = columns.find((c) => c.field === "상차일" && c.mode === "data");
  if (seq && date) return { cols: [date.idx, seq.idx], label: `${date.header}+${seq.header}` };
  const pick = ["상차일", "거래처명", "상차지명", "하차지명", "차량번호"].map((k) => columns.find((c) => c.field === k && c.mode === "data")).filter(Boolean);
  return { cols: pick.map((c) => c.idx), label: pick.map((c) => c.header).join("+") };
}
export function dedupeKey(profile, cs, rec = {}) {
  const cols = profile.dedupe?.cols?.length ? profile.dedupe.cols : [];
  if (!cols.length) return "";
  const parts = cols.map((i) => {
    const col = profile.columns.find((c) => c.idx === i);
    if (col?.field && FIELD_BY_KEY[col.field]?.type === "date" && rec[col.field]) return rec[col.field];
    if (col?.field === "차량번호") return parsePlate(cs[i]);
    return norm(cs[i]);
  });
  if (!parts.some(Boolean)) return "";
  return parts.join("|");
}
// 프로그램에 원래 있던 오더(시트와 연결 안 된)와 같은 오더인가 — 날짜·거래처·상하차지·차량·운임
export const looseKey = (r) => [r.상차일, norm(r.거래처명), norm(r.상차지명), norm(r.하차지명), parsePlate(r.차량번호 || "").toUpperCase(), String(r.청구운임 || "").replace(/\D/g, "")].join("|");

// 비교할 칸(프로필에서 가져오는 칸)만 꺼내 해시 — 다음 동기화 때 "시트가 바뀌었나"
export function importedFields(profile) {
  return profile.columns.filter((c) => c.mode === "data" && c.field && !FIELD_BY_KEY[c.field]?.calc && !FIELD_BY_KEY[c.field]?.keyOnly && !FIELD_BY_KEY[c.field]?.exportOnly).map((c) => c.field);
}
export function fieldsHash(rec, fields) {
  const s = fields.map((k) => `${k}=${cell(rec?.[k])}`).join("\u0001");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
const sameVal = (k, a, b) => {
  const t = FIELD_BY_KEY[k]?.type;
  if (t === "money") return String(a ?? "").replace(/\D/g, "") === String(b ?? "").replace(/\D/g, "");
  if (t === "phone") return String(a ?? "").replace(/\D/g, "") === String(b ?? "").replace(/\D/g, "");
  if (t === "plate") return parsePlate(a).toUpperCase() === parsePlate(b).toUpperCase();
  return cell(a) === cell(b);
};
export function changedFields(fields, sheetRec, order) {
  return fields.filter((k) => cell(sheetRec[k]) && !sameVal(k, sheetRec[k], order?.[k]));
}

// ── 누가 마지막에 고쳤나(양방향) ────────────────────────
//  link = 오더에 남긴 { hash(지난번 시트 값), at(지난번 맞춘 시각) } · programEditedAt = 오더 _lastModified
//  sheetModifiedAt = 시트 파일 마지막 수정 시각(Drive) — 줄마다 시각이 없어서 파일 시각으로 비교
//  → "sheet"(시트 값으로 오더 고침) | "program"(프로그램 값을 시트에 씀) | "same" | "conflict-sheet" | "conflict-program"
export function syncDecision({ sheetHash, link = {}, programEditedAt = 0, sheetModifiedAt = 0, slackMs = 3000 }) {
  const sheetChanged = !!link.hash && sheetHash !== link.hash;
  const programChanged = +programEditedAt > +(link.at || 0) + slackMs;
  if (!link.hash) return programChanged || !link.at ? "sheet" : "sheet";
  if (!sheetChanged && !programChanged) return "same";
  if (sheetChanged && !programChanged) return "sheet";
  if (!sheetChanged && programChanged) return "program";
  return +sheetModifiedAt > +programEditedAt ? "conflict-sheet" : "conflict-program";
}

// ── 가져오기 미리보기(신규/변경/중복/오류) ────────────────
//  tabs = [{ title, rows(값 · 병합 펼친 뒤) }] · existing = 이 회사 오더 [{ id, ...data }]
//  → { rows:[{ tab, rowNo(시트 줄 번호 1부터), status, reasons, rec, key, match?, changes? }], counts }
export function buildImportPreview(profile, tabs, existing = [], { sheetModifiedAt = 0, from = "", to = "" } = {}) {
  const pid = profile.id || "";
  const byKey = new Map(); const byLoose = new Map();
  existing.forEach((o) => {
    if (o.시트프로필Id === pid && o.시트키) byKey.set(o.시트키, o);
    else byLoose.set(looseKey(o), o);
  });
  const fields = importedFields(profile);
  const seen = new Set();
  const out = [];
  tabs.forEach((t) => {
    const hint = tabMonth(t.title) || {};
    let prev = null;
    const start = profile.dataStart ?? (profile.headerRow || 0) + (profile.headerDepth || 1);
    (t.rows || []).slice(start).forEach((row, i) => {
      const rowNo = start + i + 1;
      const skip = isSkippableRow(row, profile, true);
      if (skip) { if (skip !== "빈 줄") out.push({ tab: t.title, rowNo, status: "건너뜀", reasons: [skip] }); return; }
      const r = rowToOrder(profile, row, { hint, prev });
      prev = { ...r.rec };
      const base = { tab: t.title, rowNo, rec: r.rec, key: r.key, warnings: r.warnings };
      if ((from && r.rec.상차일 && r.rec.상차일 < from) || (to && r.rec.상차일 && r.rec.상차일 > to)) return;
      if (r.errors.length) { out.push({ ...base, status: "오류", reasons: r.errors }); return; }
      const dupKey = r.key || `${t.title}|${rowNo}`;
      if (seen.has(dupKey)) { out.push({ ...base, status: "중복", reasons: [`시트 안에 같은 열쇠(${profile.dedupe?.label || "중복 확인 칸"})가 또 있어요`] }); return; }
      seen.add(dupKey);
      const hit = r.key ? byKey.get(r.key) : null;
      if (hit) {
        const changes = changedFields(fields, r.rec, hit);
        if (!changes.length) { out.push({ ...base, status: "중복", reasons: ["이미 가져온 줄(바뀐 칸 없음)"], match: hit.id }); return; }
        const d = syncDecision({ sheetHash: fieldsHash(r.rec, fields), link: { hash: hit._sheetHash, at: hit._sheetSyncAt }, programEditedAt: hit._lastModified, sheetModifiedAt });
        if (d === "program" || d === "conflict-program") { out.push({ ...base, status: "중복", reasons: ["프로그램에서 더 나중에 고쳐서 프로그램 값을 지켜요"], match: hit.id, changes }); return; }
        out.push({ ...base, status: "변경", reasons: changes.map((k) => `${FIELD_BY_KEY[k]?.label || k}: ${cell(hit[k]) || "(빈 칸)"} → ${cell(r.rec[k])}`), match: hit.id, changes });
        return;
      }
      const loose = byLoose.get(looseKey(r.rec));
      if (loose) { out.push({ ...base, status: "중복", reasons: ["프로그램에 같은 오더가 이미 있어요(날짜·거래처·상하차지·차량·운임)"], match: loose.id }); return; }
      out.push({ ...base, status: "신규", reasons: r.warnings.length ? r.warnings : [] });
    });
  });
  const counts = { 신규: 0, 변경: 0, 중복: 0, 오류: 0, 건너뜀: 0 };
  out.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  return { rows: out, counts };
}
// 오류 보고서(CSV, 엑셀에서 바로 열리게 BOM)
export function previewToCsv(preview) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["탭", "줄", "결과", "이유", "상차일", "거래처명", "상차지명", "하차지명", "차량번호"].map(esc).join(",")];
  preview.rows.filter((r) => r.status !== "신규").forEach((r) => lines.push([r.tab, r.rowNo, r.status, (r.reasons || []).join(" / "), r.rec?.상차일, r.rec?.거래처명, r.rec?.상차지명, r.rec?.하차지명, r.rec?.차량번호].map(esc).join(",")));
  return "﻿" + lines.join("\r\n");
}

// ── 보내기(프로그램 → 시트) ─────────────────────────────
export function colLetter(i) { let s = ""; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
export function colIndex(letter) { let n = 0; for (const ch of String(letter).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
// 시트 칸이 옮겨졌을 수 있으니 매번 머리줄 글자로 다시 찾는다 → { 프로필 열 번호: 지금 열 번호 }
export function relocateColumns(profile, headerCells) {
  const hs = rowCells(headerCells);
  const out = {};
  const taken = new Set();
  profile.columns.forEach((c) => {
    if (!c.header) { if (!taken.has(c.idx)) { out[c.idx] = c.idx; taken.add(c.idx); } return; }
    if (norm(hs[c.idx]) === norm(c.header) && !taken.has(c.idx)) { out[c.idx] = c.idx; taken.add(c.idx); return; }
    const j = hs.findIndex((h, k) => !taken.has(k) && norm(h) === norm(c.header));
    if (j >= 0) { out[c.idx] = j; taken.add(j); }
  });
  return out;
}
// 지금 시트의 머리줄 글자(두 줄 머리줄이면 합친 글자) — rows는 병합을 펼친 값이 좋다
export function headerCellsAt(rows, profile) {
  const r = profile.headerRow || 0;
  if ((profile.headerDepth || 1) === 2) return combineHeader(rows?.[r] || [], rows?.[r + 1] || []);
  return rowCells(rows?.[r] || []);
}
// 칸이 옮겨진 시트에 맞춰 프로필 열 번호를 바꾼 사본(머리줄에서 못 찾은 칸은 뺀다)
export function relocateProfile(profile, headerCells) {
  const loc = relocateColumns(profile, headerCells);
  const columns = profile.columns.filter((c) => loc[c.idx] != null).map((c) => ({ ...c, idx: loc[c.idx] }));
  const dedupe = profile.dedupe ? { ...profile.dedupe, cols: (profile.dedupe.cols || []).map((i) => loc[i]).filter((i) => i != null) } : profile.dedupe;
  return { ...profile, columns, dedupe, _loc: loc };
}
// 오더 → 시트에 쓸 값(프로필의 "가져오기·보내기" 칸만)
export function orderToCells(profile, order) {
  const out = {};
  profile.columns.forEach((c) => {
    if (c.mode !== "data" || !c.field) return;
    const f = FIELD_BY_KEY[c.field];
    if (!f || f.calc || f.keyOnly) return;
    let v = order?.[c.field];
    if (c.field === "경유지") v = [...(order?.경유지_상차 || order?.경유상차목록 || []), ...(order?.경유지_하차 || order?.경유하차목록 || [])].map((w) => (typeof w === "string" ? w : w?.업체명 || w?.name || "")).filter(Boolean).join(", ");
    if (v == null) v = "";
    if (f.type === "money" && v !== "" && c.transform?.unit === "만원") v = String(Math.round(+String(v).replace(/\D/g, "") / 1000) / 10);
    if (f.type === "enum" && v) { // 프로그램 값 → 시트에서 쓰던 말(값 바꾸기 표를 거꾸로)
      const table = profile.valueMaps?.[c.field] || {};
      const back = Object.entries(table).find(([, to]) => to === v);
      if (back) v = back[0];
    }
    out[c.idx] = String(v);
  });
  return out;
}
// 시트에 써도 되는 칸인가 — 계산열 · 읽기전용 · 무시 · 연결 안 된 칸 · 지금 수식이 든 칸 · 병합 칸(왼쪽 위 아님)은 절대 안 씀
export function isWritableCell(profile, colIdx, { formula = "", mergedNonAnchor = false } = {}) {
  if (mergedNonAnchor) return false;
  if (String(formula || "").trim().startsWith("=")) return false;
  const c = profile.columns.find((x) => x.idx === colIdx);
  if (!c || c.mode !== "data" || !c.field) return false;
  const f = FIELD_BY_KEY[c.field];
  return !!f && !f.calc && !f.keyOnly;
}
// 시트 값 · 수식을 보고 실제로 쓸 칸만 남긴다 — cells { 프로필 열 번호: 값 } → [{ col(지금 열 번호), value }]
//  current = 그 줄의 지금 값 · formulas = 그 줄의 수식 · loc = relocateColumns 결과 · merged(col) = 병합 안쪽 칸인가
export function planRowWrite(profile, cells, { current = [], formulas = [], loc = null, merged = () => false, onlyChanged = true } = {}) {
  const out = []; const blocked = [];
  Object.entries(cells).forEach(([k, value]) => {
    const pIdx = +k;
    const col = loc ? loc[pIdx] : pIdx;
    if (col == null) { blocked.push({ col: pIdx, why: "머리줄에서 칸을 못 찾음" }); return; }
    if (!isWritableCell(profile, pIdx, { formula: formulas[col], mergedNonAnchor: merged(col) })) { blocked.push({ col, why: "보호된 칸(수식·계산·읽기전용)" }); return; }
    if (onlyChanged && cell(current[col]) === cell(value)) return;
    if (!cell(value) && !cell(current[col])) return;
    out.push({ col, value });
  });
  return { writes: out, blocked };
}
// 표 끝(새 줄을 넣을 자리, 0부터) — 머리줄 아래 마지막으로 값이 든 줄 다음. 그 밑에 합계 줄 등이 있으면 끼워 넣어야 함(insert)
export function findAppendRow(profile, rows) {
  const start = profile.dataStart ?? (profile.headerRow || 0) + (profile.headerDepth || 1);
  const keyCols = profile.columns.filter((c) => c.mode === "data" || c.mode === "id").map((c) => c.idx);
  let last = start - 1;
  let totalRow = -1;
  for (let i = start; i < rows.length; i++) {
    const cs = rowCells(rows[i]);
    if (cs.some((c) => TOTAL_RE.test(c.replace(/\s/g, "")))) { if (totalRow < 0) totalRow = i; continue; }
    if (totalRow >= 0) continue; // 합계 줄 아래(메모 등)는 표가 아님
    if (keyCols.some((k) => cs[k] && !ERROR_RE.test(cs[k]) && !LOOKUP_MISS.test(cs[k]))) last = i;
  }
  const at = last + 1;
  // 넣을 자리에 이미 무언가(합계 줄 등)가 있으면 줄을 끼워 넣는다
  const occupied = at < rows.length && rowCells(rows[at]).some((c, k) => c && (keyCols.includes(k) || TOTAL_RE.test(c.replace(/\s/g, ""))));
  return { row: at, insert: occupied || totalRow === at, prevDataRow: last >= start ? last : -1 };
}

// ── 배차표 양식 만들기(프로필 → routeBoards 칸) ───────────
//  배차표 화면(src/RouteBoard.jsx)이 쓰는 칸: field(프로그램 칸) · no(순번) · sum · extra(참고) · qty(수량)
const BOARD_FIELDS = new Set(["하차지명", "하차지주소", "차량번호", "이름", "전화번호", "상차시간", "하차시간", "메모", "거래처명", "청구운임", "기사운임", "화물내용", "차량톤수", "차량종류"]);
export function profileToBoardColumns(profile, rid = () => Math.random().toString(36).slice(2, 10)) {
  const cols = [];
  const used = new Set();
  [...profile.columns].sort((a, b) => a.idx - b.idx).forEach((c) => {
    if (c.mode === "ignore" || c.mode === "id" || !c.header) return;
    if (c.field === "순번") { cols.push({ id: rid(), label: c.header, kind: "no" }); return; }
    if (c.mode === "data" && BOARD_FIELDS.has(c.field) && !used.has(c.field)) { used.add(c.field); cols.push({ id: rid(), label: c.header, kind: "field", field: c.field }); return; }
    if (c.mode === "calc") return; // 계산열은 배차표에서 빼고(시트가 계산)
    cols.push({ id: rid(), label: c.header, kind: "extra" });
  });
  const labels = new Set();
  return cols.filter((c) => { const k = norm(c.label); if (labels.has(k)) return false; labels.add(k); return true; });
}

// ── 돌캐 배차현황 시트(예전 고정 설정) → 프로필 ────────────
//  functions/gsheetLegacy.js의 칸 이름 · 순서와 같다. 가져오기·보내기는 예전 서버 함수(gsheetMine)가 그대로 맡는다.
export const LEGACY_DOLCAE_HEADER = ["순번", "등록일", "상차일", "상차시간", "하차일", "하차시간", "거래처명", "상차지명", "상차지주소", "하차지명", "하차지주소", "화물내용", "차량종류", "차량톤수", "혼적", "차량번호", "이름", "전화번호", "배차상태", "청구운임", "기사운임", "수수료", "지급방식", "배차방식", "메모", "오더ID"];
const LEGACY_CALC = new Set(["순번", "이름", "전화번호", "배차상태", "수수료", "매익율"]); // 예전 연동이 수식으로 채우는 칸
export function legacyDolcaeProfile() {
  const columns = LEGACY_DOLCAE_HEADER.map((h, idx) => {
    const top = headerCandidates(h)[0];
    const field = h === "혼적" ? "" : h === "오더ID" ? "오더ID" : top?.field || "";
    const mode = h === "오더ID" ? "id" : LEGACY_CALC.has(field || h) ? "calc" : field ? "data" : "readonly";
    return { idx, header: h, field, mode, confidence: 1, source: "legacy" };
  });
  return {
    id: "legacy_dolcae", engine: "legacy-dolcae", name: "돌캐 배차현황(기존 연동)", companyName: "돌캐",
    spreadsheetId: "1Md09eYeoXVvXm155kCVE_jz1aZ1aedsmsvOQuPoiMxU",
    sheetUrl: "https://docs.google.com/spreadsheets/d/1Md09eYeoXVvXm155kCVE_jz1aZ1aedsmsvOQuPoiMxU/edit",
    tabMode: "monthly", tabPattern: { kind: "yy년m월", sample: "26년11월" }, tabs: [],
    headerRow: 0, headerDepth: 1, dataStart: 1, columns, valueMaps: {},
    dedupe: { cols: [25], label: "오더ID" }, scope: { companyName: "돌캐", includeFixed: false },
  };
}

// ── 새 프로필 만들기(마법사 결과 정리) ─────────────────────
export function buildProfile({ companyName, name, sheetUrl, spreadsheetId, tabMode, tabs, tabPattern, header, columns, valueMaps, dedupe, writeTab }) {
  return {
    companyName, name: String(name || "").trim() || "구글시트", sheetUrl, spreadsheetId,
    tabMode, tabs: tabs || [], tabPattern: tabPattern || null, writeTab: writeTab || (tabs || [])[0] || "",
    headerRow: header.headerRow, headerDepth: header.depth, dataStart: header.dataStart,
    columns: columns.map(({ idx, header: h, field, mode, confidence, source, transform }) => ({ idx, header: h, field: field || "", mode, confidence: confidence || 0, source: source || "", ...(transform ? { transform } : {}) })),
    valueMaps: valueMaps || {}, dedupe: dedupe || suggestDedupe(columns),
    scope: { companyName, includeFixed: false },
  };
}
