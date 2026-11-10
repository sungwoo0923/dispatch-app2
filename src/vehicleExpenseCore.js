// ======================= src/vehicleExpenseCore.js =======================
// 🧾 2026-11-10 차량 비용 영수증 · 정기 차량 사진 — 계산만 하는 부분(React · Firebase 없음 · 테스트: scripts/vehicleExpense.test.mjs)
//  · parseReceiptText(글)      영수증 글 → 상호 · 사업자번호 · 전화 · 날짜/시간 · 합계 · 카드 승인번호 · 카드 끝자리 · 품목 · 항목 추정 · 결제수단 추정
//  · autoChecks(영수증, 참고)   사업자 · 중복 · 금액 · 날짜 · 촬영 · 정비 주기 · 금액 수준 → [{ k, label, level: ok|warn|bad|info, text }]
//  · photoPeriod(설정, 날짜)    정기 차량 사진의 이번 기간(키 · 시작 · 마감)
//  · spendPresetOf(영수증들)    전자결재 지출결의서 자동 입력값(지출 내역 · 증빙 사진 · 제목 · 사유)

export const VEX_KINDS = [
  { k: "engineOil", label: "엔진오일" },
  { k: "tire", label: "타이어" },
  { k: "brake", label: "브레이크" },
  { k: "repair", label: "수리" },
  { k: "filter", label: "필터·소모품" },
  { k: "etc", label: "기타" },
];
export const vexKindLabel = (k) => (VEX_KINDS.find((x) => x.k === k) || {}).label || k;
// 기사가 고르는 결제 수단 → 전자결재 지출결의서 "결제 수단" 값
export const VEX_PAYS = [
  { k: "personalCard", label: "개인카드", ap: "개인카드(정산 요청)" },
  { k: "cash", label: "현금", ap: "현금" },
  { k: "transfer", label: "계좌이체", ap: "계좌이체" },
  { k: "corpCard", label: "법인카드", ap: "법인카드" },
];
export const vexPayLabel = (k) => (VEX_PAYS.find((x) => x.k === k) || {}).label || "";
export const vexPayAp = (k) => (VEX_PAYS.find((x) => x.k === k) || {}).ap || "개인카드(정산 요청)";

// 상태: 접수(사무실 미확인) → 확인 → 결재중 → 승인 → 지급완료(전자결재에서 지급 완료 처리) · 반려(기사에게 다시 올려 달라고)
export const VEX_STATUS = ["접수", "확인", "결재중", "승인", "지급완료", "반려"];
export const vexDriverStatus = (s) => ({ 접수: "확인 중", 확인: "확인 완료", 결재중: "결재 중", 승인: "승인", 지급완료: "지급 완료", 반려: "다시 올려주세요" }[s] || s || "확인 중");
export const vexDone = (s) => s === "승인" || s === "지급완료";

const pad = (n) => String(n).padStart(2, "0");
const digits = (v) => String(v ?? "").replace(/[^\d]/g, "");
export const toNum = (v) => Number(digits(v)) || 0;
export const won = (n) => (Number(n) || 0).toLocaleString("ko-KR");

// ── 사업자번호 검증식(국세청 공식) ──
export function bizNoOk(v) {
  const d = digits(v);
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let s = 0;
  for (let i = 0; i < 9; i++) s += Number(d[i]) * w[i];
  s += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (s % 10)) % 10 === Number(d[9]);
}
export const fmtBizNo = (v) => { const d = digits(v); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : String(v || ""); };

// ── 영수증 글 해석 ──
const SKIP_VENDOR = /영수증|매출전표|카드|고객용|가맹점용|신용|승인|거래|일시|사업자|대표|전화|tel|주소|합계|금액|부가세|과세|면세|합\s*계|no\.|pos|\d{2,}/i;
// 스캔 앱 · 영수증 재발행 안내 문구(상호로 잘못 잡히던 것) — "휴대폰으로 스캔하면", "영수증 재발행" 등
const SCAN_BANNER = /스캔|scan|재발행|재출력|휴대폰|QR|큐알|앱\s*설치|다운로드|www\.|http/i;
const AMOUNT_LABEL = /(합\s*계|총\s*액|총\s*금\s*액|받을\s*금액|결제\s*금액|승인\s*금액|청구\s*금액|판매\s*총액|결\s*제|총\s*합계|TOTAL)/i;
const ITEM_WORDS = /(엔진\s*오일|오일|필터|에어\s*필터|연료\s*필터|타이어|휠|얼라인|브레이크|패드|라이닝|디스크|배터리|밧데리|와이퍼|부동액|냉각수|미션|데후|벨트|공임|정비|수리|교환|교체|점검|세차|판금|도색|유리|전구|램프|그리스|요소수|DPF|부품)/;
function moneyIn(s) {
  return [...String(s).matchAll(/(\d{1,3}(?:[,.]\d{3})+|\d{4,8})(?!\d)/g)].map((m) => Number(m[1].replace(/[,.]/g, ""))).filter((n) => n >= 100 && n <= 50000000);
}
export function parseReceiptText(text) {
  const raw = String(text || "").replace(/\r/g, "");
  const lines = raw.split("\n").map((l) => l.replace(/\s{2,}/g, " ").trim()).filter(Boolean);
  const flat = lines.join(" ");
  // 사업자번호(검증식 맞는 것 우선)
  const bizCands = [...flat.matchAll(/(\d{3})\s*-?\s*(\d{2})\s*-?\s*(\d{5})/g)].map((m) => `${m[1]}${m[2]}${m[3]}`);
  const bizNo = bizCands.find(bizNoOk) || bizCands[0] || "";
  const phone = (flat.match(/0\d{1,2}\s*[-)]\s*\d{3,4}\s*-\s*\d{4}/) || [""])[0].replace(/\s/g, "").replace(")", "-");
  // 날짜 · 시간
  let date = "";
  let m = flat.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) date = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  else if ((m = flat.match(/(?:^|\D)(\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})(?!\d)/)) && Number(m[2]) <= 12 && Number(m[3]) <= 31) date = `20${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  const tm = flat.match(/(?:^|\D)([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?::[0-5]\d)?(?!\d)/); // (iOS 16.3 이하 — 뒤돌아보기 정규식 안 씀)
  const time = tm ? `${pad(tm[1])}:${tm[2]}` : "";
  // 합계 금액 — "합계" 같은 이름이 있는 줄(마지막 것)의 숫자, 없으면 가장 큰 금액
  let amount = 0;
  for (let i = lines.length - 1; i >= 0 && !amount; i--) {
    if (!AMOUNT_LABEL.test(lines[i]) || /부가세|세액|공급가|과세\s*물품/.test(lines[i])) continue;
    const ns = moneyIn(lines[i]).length ? moneyIn(lines[i]) : moneyIn(lines[i + 1] || "");
    if (ns.length) amount = ns[ns.length - 1];
  }
  if (!amount) { const all = moneyIn(flat.replace(/(\d{3})\s*-\s*(\d{2})\s*-\s*(\d{5})/g, " ").replace(/0\d{1,2}-\d{3,4}-\d{4}/g, " ").replace(/승인\s*번호\s*[:：]?\s*\d+/g, " ")); amount = all.length ? Math.max(...all) : 0; }
  const cardApproval = (flat.match(/승인\s*(?:번호|No\.?)?\s*[:：]?\s*(\d{6,12})/i) || ["", ""])[1];
  const cardLast4 = (flat.match(/[*xX#]{2,}[\s-]*[*xX#]*[\s-]*(\d{4})(?!\d)/) || ["", ""])[1];
  // 상호 — "상호 · 가맹점" 이름 다음 글, 없으면 위쪽에서 처음 나오는 이름 같은 줄
  let vendor = (flat.match(/(?:상\s*호|가맹점\s*명?|업\s*체\s*명)\s*[:：]?\s*([가-힣A-Za-z0-9&()'’·.\s]{2,30}?)(?=\s{1,}(?:사업자|대표|전화|TEL|주소|\d{3}-)|$)/i) || ["", ""])[1].trim();
  // ⭐ 2026-11-10 사업자번호와 같은 줄 앞쪽이 상호인 영수증이 많다("본뚝집 완정역점 / 109-30-12251 / 박정원")
  if (!vendor && bizNo) {
    const bl = lines.find((l) => l.replace(/[^\d]/g, "").includes(bizNo));
    const before = bl ? bl.split(/\d{3}\s*-?\s*\d{2}\s*-?\s*\d{5}/)[0].replace(/(사업자\s*(등록)?\s*(번호)?|상\s*호|가맹점\s*명?)\s*[:：]?/g, "").replace(/[/|:·,\s]+$/g, "").trim() : "";
    if (/[가-힣A-Za-z]{2,}/.test(before) && before.length <= 30 && !SCAN_BANNER.test(before)) vendor = before;
  }
  if (!vendor) vendor = (lines.slice(0, 6).find((l) => /[가-힣]{2,}/.test(l) && !SKIP_VENDOR.test(l) && !SCAN_BANNER.test(l) && l.length <= 30) || "").trim();
  // 품목 — 정비 낱말이 있는 줄(금액 빼고)
  const items = lines.filter((l) => ITEM_WORDS.test(l) && !AMOUNT_LABEL.test(l)).map((l) => l.replace(/(\d{1,3}(?:,\d{3})+|\d{4,8})\s*원?$/, "").replace(/\s{2,}/g, " ").trim()).filter((l) => l.length >= 2).slice(0, 6);
  const kinds = [];
  if (/엔진\s*오일|오일\s*교환|오일\s*필터|engine\s*oil/i.test(flat)) kinds.push("engineOil");
  if (/타이어|tire/i.test(flat)) kinds.push("tire");
  if (/브레이크|패드|라이닝/.test(flat)) kinds.push("brake");
  if (/필터|와이퍼|배터리|밧데리|부동액|냉각수|요소수|전구|램프/.test(flat) && !kinds.includes("engineOil")) kinds.push("filter");
  if (/판금|도색|수리|용접|유리|미러|사이드/.test(flat)) kinds.push("repair");
  const pay = /현금\s*영수증|현금/.test(flat) && !/카드/.test(flat) ? "cash" : /계좌\s*이체|무통장|이체/.test(flat) ? "transfer" : /카드|승인/.test(flat) ? "personalCard" : "";
  const found = { vendor, bizNo, phone, date, time, amount: amount || 0, cardApproval, cardLast4, items, kinds, pay };
  const count = ["vendor", "bizNo", "date", "amount", "cardApproval"].filter((k) => found[k]).length;
  return { ...found, count };
}

// ── 사진이 같은지(흑백 지문) — 17×16 칸 밝기에서 옆 칸과의 차이 256개(dHash) → 64자 글 ──
//  8×8 평균 방식은 "흰 영수증 + 어두운 배경"이 다 비슷해서 다른 영수증도 같은 사진으로 봤다(2026-11-10 시험)
export const HASH_W = 17; export const HASH_H = 16;
export function hashFromGray(gray, w = HASH_W, h = HASH_H) { // gray: 길이 w*h 숫자 배열(0~255)
  let bits = "";
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) bits += gray[y * w + x] > gray[y * w + x + 1] ? "1" : "0";
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4).padEnd(4, "0"), 2).toString(16);
  return hex;
}
export function hashDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 99;
  let d = 0;
  for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } }
  return d;
}

// ── 자동 점검 ──
// exp: 영수증 문서 · ctx: { others(같은 회사 다른 영수증), biz(국세청 결과 { state, label } | null | "disabled"), care(기사 차량관리 care), nowMs }
const DAY = 86400000;
const ymdMs = (s) => { const t = Date.parse(`${String(s || "").slice(0, 10)}T00:00:00+09:00`); return Number.isFinite(t) ? t : 0; };
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);
export function autoChecks(exp, ctx = {}) {
  const e = exp || {};
  const out = [];
  const now = ctx.nowMs || Date.now();
  const createdMs = tsMs(e.createdAt) || now;
  // 1) 사업자
  const bNo = digits(e.bizNo);
  if (!bNo) out.push({ k: "biz", label: "사업자", level: "warn", text: "사업자번호를 못 읽었어요" });
  else if (!bizNoOk(bNo)) out.push({ k: "biz", label: "사업자", level: "bad", text: `번호 오류 · ${fmtBizNo(bNo)}` });
  else if (ctx.biz === "disabled" || !ctx.biz) out.push({ k: "biz", label: "사업자", level: "info", text: `${fmtBizNo(bNo)} · 국세청 조회 전` });
  else if (ctx.biz.state === "active") out.push({ k: "biz", label: "사업자", level: "ok", text: "국세청 · 계속사업자" });
  else if (["closed", "suspended", "unregistered", "invalid"].includes(ctx.biz.state)) out.push({ k: "biz", label: "사업자", level: "bad", text: `국세청 · ${ctx.biz.label || ctx.biz.state}` });
  else out.push({ k: "biz", label: "사업자", level: "info", text: "국세청 확인 불가" });
  // 2) 중복(같은 카드 승인번호 · 거의 같은 사진)
  const others = (ctx.others || []).filter((o) => o && o.id !== e.id);
  // 중복은 "먼저 올라온 영수증"과만 비교한다 — 원본은 통과, 나중에 다시 올린 쪽만 중복 의심
  const earlier = others.filter((o) => { const om = tsMs(o.createdAt) || 0; return om < createdMs || (om === createdMs && String(o.id) < String(e.id)); });
  const dupA = e.cardApproval ? earlier.find((o) => o.cardApproval && o.cardApproval === e.cardApproval) : null; // 카드 승인번호는 결제마다 하나 — 금액을 바꿔 올려도 잡는다
  const dupH = e.imgHash && e.imgHash.length >= 64 ? earlier.find((o) => o.imgHash && o.imgHash.length === e.imgHash.length && hashDistance(o.imgHash, e.imgHash) <= 12) : null; // 256칸 중 12칸 이하 차이 = 같은 사진
  const dup = dupA || dupH;
  if (dup) out.push({ k: "dup", label: "중복", level: "bad", text: `${dupA ? "같은 승인번호" : "같은 사진"} · ${String(dup.date || "").slice(5).replace("-", ".")} ${dup.driverName || ""}`.trim(), refId: dup.id });
  else out.push({ k: "dup", label: "중복", level: "ok", text: "같은 승인번호·사진 없음" });
  // 3) 금액(기사 입력 vs 영수증에서 읽은 금액)
  const amt = toNum(e.amount); const sc = toNum(e.scan?.amount);
  if (!amt) out.push({ k: "amount", label: "금액", level: "bad", text: "금액이 없어요" });
  else if (sc && sc !== amt) out.push({ k: "amount", label: "금액", level: "warn", text: `기사 입력 ${won(amt)} · 영수증 ${won(sc)}` });
  else if (sc) out.push({ k: "amount", label: "금액", level: "ok", text: `기사 입력 = 영수증 ${won(amt)}` });
  else out.push({ k: "amount", label: "금액", level: "info", text: `기사 입력 ${won(amt)} · 영수증 금액 못 읽음` });
  // 4) 날짜
  const dMs = ymdMs(e.date);
  if (!dMs) out.push({ k: "date", label: "날짜", level: "warn", text: "영수증 날짜 없음" });
  else if (dMs - createdMs > DAY) out.push({ k: "date", label: "날짜", level: "warn", text: `미래 날짜 · ${e.date}` });
  else if (createdMs - dMs > 60 * DAY) out.push({ k: "date", label: "날짜", level: "warn", text: `${Math.floor((createdMs - dMs) / DAY)}일 지난 영수증` });
  else out.push({ k: "date", label: "날짜", level: "ok", text: `${e.date}${e.time ? ` ${e.time}` : ""}` });
  // 5) 촬영(기사앱 카메라로 바로 찍었는지 · 찍은 때)
  const tk = Number(e.takenAt) || 0;
  if (e.captured && tk && dMs && Math.abs(tk - dMs) > 4 * DAY) out.push({ k: "photo", label: "촬영", level: "warn", text: `찍은 날(${new Date(tk + 9 * 3600e3).toISOString().slice(5, 10).replace("-", ".")})과 영수증 날짜가 달라요` });
  else if (e.captured) out.push({ k: "photo", label: "촬영", level: "ok", text: `기사앱 촬영${tk ? ` · ${new Date(tk + 9 * 3600e3).toISOString().slice(5, 16).replace("-", ".").replace("T", " ")}` : ""}` });
  else out.push({ k: "photo", label: "촬영", level: "info", text: "사진첩에서 고른 사진" });
  // 6) 정비 주기(엔진오일 · 타이어 — 지난 교환 기록과 비교)
  const care = ctx.care || {};
  const items = care.items || {};
  const km = toNum(e.km);
  const cyc = (key, name, minKm) => {
    if (!(e.kinds || []).includes(key)) return;
    const last = items[key] || {};
    const lastKm = toNum(last.km); const lastMs = ymdMs(last.date);
    const sameJob = lastMs && dMs && Math.abs(lastMs - dMs) <= DAY && (!km || !lastKm || Math.abs(km - lastKm) < 500); // 이 영수증으로 방금 기록된 교환이면 비교하지 않음
    if (sameJob) { out.push({ k: "cycle", label: "정비 주기", level: "ok", text: `${name} 교환 기록에 반영됨` }); return; }
    if (km && lastKm && km > lastKm) {
      const gap = km - lastKm;
      out.push({ k: "cycle", label: "정비 주기", level: gap < minKm ? "warn" : "ok", text: `지난 ${name} 교환 후 ${won(gap)}km${gap < minKm ? " · 너무 빨라요" : ""}` });
    } else if (lastMs && dMs && dMs > lastMs && dMs - lastMs < 30 * DAY) out.push({ k: "cycle", label: "정비 주기", level: "warn", text: `지난 ${name} 교환 후 ${Math.round((dMs - lastMs) / DAY)}일` });
    else out.push({ k: "cycle", label: "정비 주기", level: "info", text: `지난 ${name} 교환 기록 없음` });
  };
  cyc("engineOil", "엔진오일", 5000);
  cyc("tire", "타이어", 20000);
  // 7) 금액 수준(같은 항목 회사 평균의 2배 넘으면)
  const k0 = (e.kinds || [])[0];
  if (k0 && amt) {
    const same = others.filter((o) => (o.kinds || [])[0] === k0 && toNum(o.amount) > 0 && o.status !== "반려");
    if (same.length >= 3) {
      const avg = same.reduce((a, o) => a + toNum(o.amount), 0) / same.length;
      if (amt > avg * 2) out.push({ k: "level", label: "금액 수준", level: "warn", text: `${vexKindLabel(k0)} 평균 ${won(Math.round(avg))}의 ${(amt / avg).toFixed(1)}배` });
    }
  }
  return out;
}
export function checkLevel(list) {
  if ((list || []).some((c) => c.level === "bad")) return "bad";
  if ((list || []).some((c) => c.level === "warn")) return "warn";
  return "ok";
}
export function checkHeadline(list) {
  const bad = (list || []).find((c) => c.level === "bad");
  if (bad) return bad.k === "dup" ? "중복 의심" : bad.k === "biz" ? "사업자 확인" : `${bad.label} 확인`;
  const w = (list || []).find((c) => c.level === "warn");
  if (w) return w.k === "amount" ? "금액 다름" : w.k === "date" ? (/미래/.test(w.text) ? "날짜 확인" : /지난/.test(w.text) ? "날짜 오래됨" : "날짜 없음") : w.k === "cycle" ? "주기 짧음" : w.k === "level" ? "금액 높음" : w.k === "photo" ? "촬영일 다름" : `${w.label} 확인`;
  return "통과";
}

// ── 정기 차량 사진 ──
export const PHOTO_CYCLES = [["daily", "매일"], ["weekly", "매주"], ["biweekly", "2주"], ["monthly", "매월"]];
export const PHOTO_DOWS = [[1, "월"], [2, "화"], [3, "수"], [4, "목"], [5, "금"], [6, "토"], [0, "일"]];
export const PHOTO_PARTS = ["앞", "뒤", "왼쪽", "오른쪽", "계기판", "적재함", "타이어"];
export const DEFAULT_PHOTO_SETTINGS = { on: false, cycle: "weekly", dueDow: 5, dueDay: 25, parts: ["앞", "뒤", "왼쪽", "오른쪽", "계기판"], target: "all" };
const ymdOf = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (ymd, n) => ymdOf(ymdMs(ymd) + n * DAY);
const dowOf = (ymd) => new Date(ymdMs(ymd) + 9 * 3600e3).getUTCDay();
const mondayOf = (ymd) => addDays(ymd, -((dowOf(ymd) + 6) % 7));
// 이번 기간 { key, start, end(마지막 날), due(마감일), label }
export function photoPeriod(settings, todayYmd) {
  const s = { ...DEFAULT_PHOTO_SETTINGS, ...(settings || {}) };
  const today = todayYmd || ymdOf(Date.now());
  const dueInWeek = (mon) => addDays(mon, s.dueDow === 0 ? 6 : Math.max(0, Number(s.dueDow) - 1));
  if (s.cycle === "daily") return { key: `D${today}`, start: today, end: today, due: today, label: today.slice(5).replace("-", ".") };
  if (s.cycle === "monthly") {
    const ym = today.slice(0, 7);
    const last = ymdOf(ymdMs(`${ym}-01`) + 32 * DAY).slice(0, 7);
    const end = addDays(`${last}-01`, -1);
    const dd = Math.min(Number(s.dueDay) || 25, Number(end.slice(8)));
    return { key: `M${ym}`, start: `${ym}-01`, end, due: `${ym}-${pad(dd)}`, label: `${Number(ym.slice(5))}월` };
  }
  const mon = mondayOf(today);
  if (s.cycle === "biweekly") {
    const idx = Math.floor((ymdMs(mon) - ymdMs("2024-01-01")) / (14 * DAY)); // 2024-01-01(월) 기준 2주씩
    const start = ymdOf(ymdMs("2024-01-01") + idx * 14 * DAY);
    const end = addDays(start, 13);
    return { key: `B${start}`, start, end, due: dueInWeek(addDays(start, 7)), label: `${start.slice(5).replace("-", ".")} – ${end.slice(5).replace("-", ".")}` };
  }
  const end = addDays(mon, 6);
  return { key: `W${mon}`, start: mon, end, due: dueInWeek(mon), label: `${mon.slice(5).replace("-", ".")} – ${end.slice(5).replace("-", ".")}` };
}
export const daysLeft = (due, todayYmd) => Math.round((ymdMs(due) - ymdMs(todayYmd || ymdOf(Date.now()))) / DAY);
export const photoTargetOk = (settings, driver) => {
  const t = (settings || {}).target || "all";
  if (t === "all") return true;
  const g = String(driver?.등급 || driver?.구분 || "");
  return t === "지입" ? g === "지입" : t === "직영" ? g === "직영" : true;
};
export const photoDocId = (uid, key, part) => `${uid}_${key}_${String(part).replace(/[/\s]/g, "")}`;

// ── 전자결재 지출결의서 자동 입력 ──
export function spendPresetOf(list, { month } = {}) {
  const rows = (list || []).filter(Boolean);
  const pays = [...new Set(rows.map((r) => vexPayAp(r.pay)))];
  const kindNames = [...new Set(rows.flatMap((r) => (r.kinds || []).map(vexKindLabel)))];
  const ym = month || String(rows[0]?.date || "").slice(0, 7);
  const mm = ym ? `${Number(ym.slice(5, 7))}월 ` : "";
  const title = rows.length === 1
    ? `${mm}차량 정비비 · ${rows[0].carNo || ""} ${kindNames.join("·") || ""}`.replace(/\s+/g, " ").trim()
    : `${mm}차량 정비비 (${rows.length}건)`;
  const lines = rows.map((r) => ({
    date: String(r.date || "").slice(0, 10), vendor: r.vendor || "", memo: [r.carNo, r.driverName, (r.kinds || []).map(vexKindLabel).join("·") + (r.memo ? ` (${r.memo})` : "")].filter(Boolean).join(" · "),
    supply: "", vat: "", total: String(toNum(r.amount) || ""), bank: { bank: "", acct: "", holder: "" }, note: r.cardApproval ? `승인 ${r.cardApproval}` : "",
  }));
  return {
    cat: "expense", form: "spend", title,
    data: { account: "차량유지비", pay: pays.length === 1 ? pays[0] : "개인카드(정산 요청)", lines, reason: `지입차량 정비·수리(${kindNames.join("·") || "차량"}) · 회사 부담 차량유지비`, vexIds: rows.map((r) => r.id) },
    images: rows.map((r) => r.image).filter(Boolean),
    presetKey: `vex-${rows.map((r) => r.id).join("-").slice(0, 60)}`,
  };
}
