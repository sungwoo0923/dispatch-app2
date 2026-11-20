// ======================= src/prepayCore.js =======================
// 💳 2026-11-20 선정산 파일(마감등록) → 용차지급관리 자동 반영 — 화면 없이 계산만 하는 부분(테스트: scripts/prepayCore.test.mjs)
//
// 파일 모양(제이와이 선정산 "마감등록 (수기)" 양식, 2행이 머리글):
//   NO · 선정산 신청액(vat 포함) · 지급예정일 · 상환예정일 · 차주업체명 · 사업자번호 · 대표자명 · 은행명 · 계좌번호 · 예금주명
//   · 차주휴대폰번호 · 국세청승인번호 · 차량번호 · 필수입력필요
// 한 줄 = 차주가 우리에게 발행한 세금계산서 한 장(금액은 부가세 포함).
//   · 국세청승인번호 앞 8자리(YYYYMMDD)는 세금계산서 "작성일자"다 — 지급한 날이 아니다.
//   · 지급예정일 칸은 대부분 비어 있고, 가끔 "지급완료" · "11/10 선정산 지급완료" 같은 메모가 들어 있다.
//
// 오더와 맞추기(차량번호 기준, 아직 지급 안 된 용차 오더 중에서):
//   1) 계산서 날짜와 상차일이 같은 날 오더(1건 또는 같은 날 여러 건 합계)
//   2) 계산서 날짜 이전 35일 안의 그 차량 오더 전체 합계(한 달 · 한 주 묶음 계산서)
//   3) 같은 기간을 거래처별로 나눈 합계(예: 에이제이 오더만 묶은 월 계산서)
//   4) 같은 기간 오더 1건
//   금액은 기사운임 × 1.1(부가세)과 비교한다. 산재보험료 차주분(약 0.4%)을 뺀 금액이 오는 경우가 있어 1.2%까지는 같은 금액으로 본다.

export const onlyDigits = (v) => String(v ?? "").replace(/\D/g, "");
export const normPlate = (v) => String(v ?? "").replace(/[\s\-·.]/g, "").trim();
const toNum = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };
const toInt = (v) => Math.round(toNum(v));

// 파일 은행 이름(짧은 이름) → 프로그램 은행 목록 이름(bankUtil BANKS)
const BANK_ALIAS = [
  [/국민|kb/i, "KB국민"], [/농협|nh/i, "NH농협"], [/기업|ibk/i, "IBK기업"], [/카카오/, "카카오뱅크"], [/토스/, "토스뱅크"],
  [/케이뱅크|k뱅크|^케이$/i, "케이뱅크"], [/새마을/, "새마을금고"], [/우체국/, "우체국"], [/신한/, "신한"], [/우리/, "우리"], [/하나|외환/, "하나"],
  [/sc|제일/i, "SC제일"], [/씨티|citi/i, "씨티"], [/수협/, "수협"], [/대구|im뱅크|^im$|아이엠/i, "iM뱅크(대구)"], [/부산/, "부산"], [/경남/, "경남"],
  [/광주/, "광주"], [/전북/, "전북"], [/제주/, "제주"], [/산업|kdb/i, "KDB산업"], [/신협/, "신협"], [/산림/, "산림조합"], [/저축/, "저축은행"],
];
export function normalizeBankName(s) {
  const t = String(s ?? "").replace(/\s+/g, "").replace(/은행$/, "");
  if (!t) return "";
  const hit = BANK_ALIAS.find(([re]) => re.test(t));
  return hit ? hit[1] : t;
}

// 국세청승인번호 → 세금계산서 작성일자(YYYY-MM-DD) · 형식이 아니면 ""
export function invoiceDateOf(approvalNo) {
  const m = String(approvalNo ?? "").trim().match(/^(20\d{2})(\d{2})(\d{2})/);
  if (!m) return "";
  const mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}
export const normApproval = (v) => String(v ?? "").trim().toLowerCase();

// 지급예정일 칸 → 날짜(있으면). "11/10 선정산 지급완료" → 계산서 연도의 11-10 · 엑셀 날짜 숫자 · 2026-11-10
export function payDateHintOf(v, refDate = "") {
  if (v == null || v === "") return "";
  if (typeof v === "number" && v > 40000 && v < 80000) {
    const ms = Math.round((v - 25569) * 86400000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/(^|\D)(\d{1,2})\s*[/.월]\s*(\d{1,2})/);
  if (m) {
    const y = Number((refDate || "").slice(0, 4)) || new Date().getFullYear();
    const mo = Number(m[2]), d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      // 계산서가 12월인데 지급이 1월이면 다음 해
      const refMo = Number((refDate || "").slice(5, 7)) || mo;
      const yy = refMo === 12 && mo === 1 ? y + 1 : y;
      return `${yy}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return "";
}

const HEAD = {
  amount: ["선정산 신청액", "신청액", "금액"],
  payNote: ["지급예정일", "지급일"],
  company: ["차주업체명", "업체명", "상호"],
  bizNo: ["사업자번호", "사업자등록번호"],
  ceo: ["대표자명", "대표자"],
  bank: ["은행명", "은행"],
  acct: ["계좌번호", "계좌"],
  holder: ["예금주명", "예금주"],
  phone: ["차주휴대폰번호", "휴대폰번호", "연락처", "전화번호"],
  approvalNo: ["국세청승인번호", "승인번호"],
  plate: ["차량번호"],
};
// 선정산 마감 파일인지(머리글에 국세청승인번호 + 차량번호 + 금액)
export function findPrepayHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = (rows[i] || []).map((c) => String(c ?? "").replace(/\s+/g, " ").trim());
    if (r.some((c) => c.includes("국세청승인번호")) && r.some((c) => c.includes("차량번호")) && r.some((c) => /신청액|금액/.test(c))) return i;
  }
  return -1;
}
export const isPrepaySheet = (rows) => findPrepayHeader(rows) >= 0;

// 2차원 배열(sheet_to_json header:1) → 줄 목록
export function parsePrepayRows(rows) {
  const hi = findPrepayHeader(rows);
  if (hi < 0) return [];
  const head = rows[hi].map((c) => String(c ?? "").replace(/\s+/g, " ").trim());
  const col = {};
  Object.entries(HEAD).forEach(([k, names]) => {
    let idx = -1;
    for (const n of names) { idx = head.findIndex((h) => h === n); if (idx >= 0) break; }
    if (idx < 0) for (const n of names) { idx = head.findIndex((h) => h.includes(n)); if (idx >= 0) break; }
    col[k] = idx;
  });
  const get = (r, k) => (col[k] >= 0 ? r[col[k]] : "");
  const out = [];
  rows.slice(hi + 1).forEach((r, i) => {
    if (!r) return;
    const plate = String(get(r, "plate") ?? "").trim();
    const amount = toInt(get(r, "amount"));
    const approvalNo = String(get(r, "approvalNo") ?? "").trim();
    if (!plate && !amount && !approvalNo) return; // 빈 줄
    const invoiceDate = invoiceDateOf(approvalNo);
    const payNote = get(r, "payNote");
    out.push({
      key: `r${hi + 2 + i}`,
      excelRow: hi + 2 + i,
      amount,
      payNote: payNote == null ? "" : String(payNote).trim(),
      payDateHint: payDateHintOf(payNote, invoiceDate),
      company: String(get(r, "company") ?? "").trim(),
      bizNo: onlyDigits(get(r, "bizNo")).slice(0, 10),
      ceo: String(get(r, "ceo") ?? "").trim(),
      bank: normalizeBankName(get(r, "bank")),
      bankRaw: String(get(r, "bank") ?? "").trim(),
      acct: onlyDigits(get(r, "acct")),
      holder: String(get(r, "holder") ?? "").trim(),
      phone: onlyDigits(get(r, "phone")),
      approvalNo,
      invoiceDate,
      plate,
      plateKey: normPlate(plate),
    });
  });
  return out;
}

// 파일 금액(부가세 포함) A 와 기사운임 합계 S 가 같은 금액인가
export function amountClose(A, S) {
  if (!A || !S) return false;
  const withVat = S * 1.1;
  const tol = Math.max(1100, withVat * 0.012);
  return Math.abs(A - withVat) <= tol || Math.abs(A - S) <= Math.max(1000, S * 0.012); // 부가세 포함으로 적어 둔 기사운임도 허용
}
export const vatDiff = (A, S) => Math.round(A - S * 1.1);

const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

/**
 * 파일 줄들을 오더와 맞춘다.
 * @param items parsePrepayRows 결과
 * @param pool  맞출 수 있는 오더(배차완료 · 용차) — { _id, 차량번호, 상차일, 기사운임, 거래처명, 지급상태, 국세청승인번호 }
 * @param opts  { fleetPlates:Set(normPlate), allOrders: 전체 오더(이미 반영 확인용), windowDays }
 * @returns [{ ...item, status, orders, sum, diff, reason, how }]
 *   status: "match"(바로 반영) | "check"(금액 다름 — 확인 후 반영) | "done"(이미 반영) | "fleet"(지입·직영 차량) | "none"(오더 없음)
 */
export function matchPrepay(items, pool, opts = {}) {
  const windowDays = opts.windowDays ?? 35;
  const fleet = opts.fleetPlates || new Set();
  const all = opts.allOrders || pool;
  const doneByApproval = new Map();
  all.forEach((o) => { const a = normApproval(o.국세청승인번호); if (a) doneByApproval.set(a, [...(doneByApproval.get(a) || []), o]); });
  const unpaid = pool.filter((o) => (o.지급상태 || "") !== "지급완료");
  const byPlate = new Map();
  unpaid.forEach((o) => { const k = normPlate(o.차량번호); if (!k) return; if (!byPlate.has(k)) byPlate.set(k, []); byPlate.get(k).push(o); });
  const claimed = new Set();
  const res = items.map((it) => ({ ...it, status: "none", orders: [], sum: 0, diff: 0, reason: "", how: "" }));
  const sumOf = (os) => os.reduce((s, o) => s + toInt(o.기사운임), 0);
  const free = (os) => os.filter((o) => !claimed.has(o._id));
  const take = (r, os, how, status = "match") => {
    r.orders = os; r.sum = sumOf(os); r.diff = vatDiff(r.amount, r.sum); r.how = how; r.status = status;
    if (status === "match") os.forEach((o) => claimed.add(o._id));
  };
  const inWindow = (r, o) => {
    const d = String(o.상차일 || "").slice(0, 10);
    if (!r.invoiceDate) return !!d;
    const gap = daysBetween(d, r.invoiceDate);
    return gap >= -1 && gap <= windowDays; // 계산서가 하루 먼저 끊긴 경우도
  };

  // 0) 이미 반영 · 차량번호 없음 · 지입 차량
  res.forEach((r) => {
    const done = doneByApproval.get(normApproval(r.approvalNo));
    if (r.approvalNo && done?.length) { r.status = "done"; r.orders = done; r.sum = sumOf(done); r.reason = "이미 반영된 계산서예요"; return; }
    if (!r.plateKey) { r.status = "none"; r.reason = "차량번호가 없어요"; return; }
    if (fleet.has(r.plateKey)) { r.status = "fleet"; r.reason = "소속 차량(지입 · 직영 · 임대)이라 지입정산관리에서 지급해요"; }
  });
  const open = () => res.filter((r) => r.status === "none" && r.plateKey && byPlate.has(r.plateKey));
  // 1) 같은 날 오더(계산서 날짜 = 상차일)
  open().forEach((r) => {
    if (!r.invoiceDate) return;
    const same = free(byPlate.get(r.plateKey)).filter((o) => String(o.상차일 || "").slice(0, 10) === r.invoiceDate);
    if (!same.length) return;
    const one = same.filter((o) => amountClose(r.amount, toInt(o.기사운임)));
    if (one.length) return take(r, [one[0]], "같은 날 오더");
    if (same.length > 1 && amountClose(r.amount, sumOf(same))) return take(r, same, `같은 날 ${same.length}건 합계`);
  });
  // 2) 기간 안 전체 합계 → 3) 거래처별 합계 → 4) 1건
  open().forEach((r) => {
    const cands = free(byPlate.get(r.plateKey)).filter((o) => inWindow(r, o));
    if (!cands.length) return;
    if (cands.length > 1 && amountClose(r.amount, sumOf(cands))) return take(r, cands, `${cands.length}건 합계`);
    const byClient = new Map();
    cands.forEach((o) => { const c = String(o.거래처명 || "").trim() || "-"; byClient.set(c, [...(byClient.get(c) || []), o]); });
    for (const [c, os] of byClient) {
      if (os.length > 1 && amountClose(r.amount, sumOf(os))) return take(r, os, `${c} ${os.length}건 합계`);
    }
    const one = cands.filter((o) => amountClose(r.amount, toInt(o.기사운임)))
      .sort((a, b) => Math.abs(daysBetween(a.상차일, r.invoiceDate || a.상차일)) - Math.abs(daysBetween(b.상차일, r.invoiceDate || b.상차일)));
    if (one.length) return take(r, [one[0]], "기간 안 오더 1건");
  });
  // 5) 금액이 안 맞는 줄 — 가장 그럴듯한 오더 묶음을 "확인 필요"로 보여 준다(체크하면 반영)
  open().forEach((r) => {
    const cands = free(byPlate.get(r.plateKey)).filter((o) => inWindow(r, o));
    if (!cands.length) { r.reason = r.invoiceDate ? `계산서 날짜(${r.invoiceDate}) 전 ${windowDays}일 안에 미지급 오더가 없어요` : "미지급 오더가 없어요"; return; }
    const same = r.invoiceDate ? cands.filter((o) => String(o.상차일 || "").slice(0, 10) === r.invoiceDate) : [];
    const pick = same.length ? same : cands;
    take(r, pick, same.length ? "같은 날 오더(금액 다름)" : `기간 안 ${pick.length}건(금액 다름)`, "check");
    r.reason = `금액이 달라요 — 파일 ${r.amount.toLocaleString()}원 · 오더 기사운임 ${r.sum.toLocaleString()}원(부가세 포함 ${Math.round(r.sum * 1.1).toLocaleString()}원)`;
  });
  res.forEach((r) => { if (r.status === "none" && !r.reason) r.reason = fleet.has(r.plateKey) ? "소속 차량(지입 · 직영 · 임대)이에요" : "이 차량번호로 된 미지급 용차 오더가 없어요"; });
  return res;
}

// 기사관리 정산정보 채우기 — 빈 칸은 채우고, 다른 값은 conflicts 로(덮어쓸지 화면에서 고른다)
export const DRIVER_PAY_FIELDS = [
  ["사업자번호", "사업자번호"], ["사업자상호", "상호"], ["사업자대표", "대표자"],
  ["정산계좌.bank", "은행"], ["정산계좌.acct", "계좌번호"], ["정산계좌.holder", "예금주"],
];
const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const fileVal = (it, p) => ({
  사업자번호: it.bizNo, 사업자상호: it.company, 사업자대표: it.ceo,
  "정산계좌.bank": it.bank, "정산계좌.acct": it.acct, "정산계좌.holder": it.holder,
}[p] || "");
const sameVal = (p, a, b) => (/사업자번호|acct/.test(p) ? onlyDigits(a) === onlyDigits(b) : String(a ?? "").replace(/\s+/g, "") === String(b ?? "").replace(/\s+/g, ""));
export function driverPayDiff(driver, it) {
  const fill = {}; const conflicts = [];
  DRIVER_PAY_FIELDS.forEach(([p, label]) => {
    const nv = fileVal(it, p); if (!nv) return;
    const cur = getPath(driver || {}, p);
    if (cur == null || String(cur).trim() === "") fill[p] = nv;
    else if (!sameVal(p, cur, nv)) conflicts.push({ path: p, label, cur: String(cur), next: nv });
  });
  return { fill, conflicts };
}
// fill/덮어쓰기 경로 → drivers 문서에 쓸 값(정산계좌는 객체째)
export function driverPatchFrom(driver, entries) {
  const patch = {};
  let acct = null;
  Object.entries(entries).forEach(([p, v]) => {
    if (p.startsWith("정산계좌.")) { acct = acct || { bank: "", acct: "", holder: "", ...(driver?.정산계좌 && typeof driver.정산계좌 === "object" ? driver.정산계좌 : {}) }; acct[p.split(".")[1]] = p.endsWith("acct") ? onlyDigits(v) : v; }
    else patch[p] = p === "사업자번호" ? onlyDigits(v).slice(0, 10) : v;
  });
  if (acct) patch.정산계좌 = acct;
  return patch;
}

// 🏦 2026-11-20 용차 대량이체 — 기사별 미지급 합계를 인터넷뱅킹 다건이체 양식으로(지게차 지급과 같은 열)
//  금액: 사업자번호가 있는 기사(세금계산서 받는 용차) = 기사운임 + 부가세 10% · 없으면 기사운임 그대로
//  계좌(기사관리 정산계좌)가 없는 기사는 빼고 missing 으로 알려 준다
export function yongchaTransferRows(summary = [], driverByPlate = new Map(), { period = "", payer = "", vatRate = 0.1 } = {}) {
  const cut = (v, n = 7) => String(v || "").replace(/\s+/g, "").slice(0, n);
  const rows = []; const missing = [];
  for (const g of summary || []) {
    const supply = Math.round(Number(g.미지급액) || 0);
    if (!(supply > 0)) continue;
    const d = driverByPlate.get(normPlate(g.차량번호)) || {};
    const a = d.정산계좌 && typeof d.정산계좌 === "object" ? d.정산계좌 : {};
    const bank = String(a.bank || "").trim(); const acct = onlyDigits(a.acct);
    if (!bank || !acct) { missing.push(`${g.이름 || d.이름 || "-"}(${g.차량번호})`); continue; }
    const withVat = !!onlyDigits(d.사업자번호);
    const vat = withVat ? Math.round(supply * vatRate) : 0;
    rows.push({
      은행: bank, 계좌번호: acct, 예금주: String(a.holder || d.이름 || g.이름 || "").trim(), 금액: supply + vat,
      "받는분 통장표시": cut(payer || "운송료"), "내 통장표시": cut(`용차${g.이름 || ""}`),
      메모: `${period ? `${period} ` : ""}${g.차량번호} 운임 ${g.미지급}건 · 기사운임 ${supply.toLocaleString()}${withVat ? ` + 부가세 ${vat.toLocaleString()}` : ""}`,
    });
  }
  return { rows, missing, total: rows.reduce((s, r) => s + r.금액, 0) };
}
