// ======================= src/invoiceScan.js =======================
// 🧾 2026-11-11 증빙서류(계산서) 자동 스캔 — 글(인식 결과 · 붙여넣은 글)에서 정산에 필요한 값을 뽑는다
//  ⚠ node 테스트에서도 읽을 수 있게 다른 파일을 가져오지 않는다(이미지 읽기는 src/CallPay.jsx가 orderScanOcr → tesseract 순서로)
//  읽는 종류(KINDS) — 홈택스 전자세금계산서 · (면세)계산서 · 수정세금계산서 · 거래명세서 · 인수증 · 이체확인증 · 영수증
//  뽑는 값
//   kind      종류 이름                 date     작성일자(발행일) YYYY-MM-DD
//   supply    공급가액                  vat      세액(부가세)        total   합계금액
//   supplier  공급자 상호(계산서를 낸 쪽) buyer   공급받는자 상호(돈을 낼 쪽)
//   bizNos    사업자번호 [공급자, 공급받는자]     approval 승인번호(전자세금계산서)
//   payer     입금자명 — 이체확인증이면 보낸 사람, 계산서면 공급받는자(돈을 낼 쪽)
//  금액 칸 이름이 깨져 읽혀도, "a + a×10% = b" 짝을 찾아 공급가액 · 세액 · 합계를 맞춘다

export const KINDS = [
  ["수정세금계산서", /수\s*정\s*(전\s*자\s*)?세\s*금\s*계\s*산\s*서/],
  ["전자세금계산서", /전\s*자\s*세\s*금\s*계\s*산\s*서/],
  ["세금계산서", /세\s*금\s*계\s*산\s*서/],
  ["이체확인증", /이\s*체\s*확\s*인|송\s*금\s*확\s*인|입\s*금\s*확\s*인\s*증|거래\s*확인\s*증|이체\s*결과|이체가\s*완료/],
  ["거래명세서", /거\s*래\s*명\s*세\s*(서|표)/],
  ["인수증", /인\s*수\s*증|운\s*송\s*장/],
  ["계산서", /(전\s*자\s*)?계\s*산\s*서/],
  ["영수증", /영\s*수\s*증|카드\s*전표|매출\s*전표/],
];

const toNum = (s) => Number(String(s || "").replace(/[^\d]/g, "")) || 0;
const pad2 = (n) => String(n).padStart(2, "0");
function mkDate(y, m, d) {
  y = Number(y); m = Number(m); d = Number(d);
  if (y < 100) y += 2000;
  if (!(y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return "";
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
// 글 안의 날짜들(나온 순서) — 2026-11-11 · 2026.11.11 · 2026/11/11 · 2026년 11월 11일 · 20261111
function datesIn(t) {
  const out = [];
  const re = /(20\d{2})\s*(?:[-./]|년)\s*(\d{1,2})\s*(?:[-./]|월)\s*(\d{1,2})\s*일?|(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/g;
  let m;
  while ((m = re.exec(t))) {
    const d = m[1] ? mkDate(m[1], m[2], m[3]) : mkDate(m[4], m[5], m[6]);
    if (d) out.push({ d, at: m.index });
  }
  return out;
}
// 금액 후보(1,000원 이상) — 사업자번호 · 전화번호 · 승인번호 · 날짜 숫자는 뺀다
function amountsIn(t) {
  const clean = t
    .replace(/\d{3}-\d{2}-\d{5}/g, " ")
    .replace(/\d{8}-\d{8}-\d{8}/g, " ")
    .replace(/0\d{1,2}-\d{3,4}-\d{4}/g, " ")
    .replace(/20\d{2}\s*[-./년]\s*\d{1,2}\s*[-./월]\s*\d{1,2}/g, " ");
  const out = [];
  const re = /(?<![\d,])(\d{1,3}(?:,\d{3})+|\d{4,10})(?![\d,])\s*원?/g;
  let m;
  while ((m = re.exec(clean))) { const v = toNum(m[1]); if (v >= 1000 && v < 10_000_000_000) out.push({ v, at: m.index }); }
  return out;
}
// 칸 이름 다음에 오는 금액(같은 줄 또는 바로 다음 줄)
function amountAfter(lines, label) {
  for (let i = 0; i < lines.length; i += 1) {
    const L = lines[i];
    const m = label.exec(L);
    if (!m) continue;
    const rest = L.slice(m.index + m[0].length);
    const a = amountsIn(rest);
    if (a.length) return a[0].v;
    const nx = amountsIn(lines[i + 1] || "");
    if (nx.length && !/[가-힣]{2,}/.test((lines[i + 1] || "").replace(/원/g, ""))) return nx[0].v;
  }
  return 0;
}
const cleanName = (s) => String(s || "")
  .replace(/^[\s:：|)）\]]+/, "")
  .replace(/\s*(성\s*명|대\s*표\s*자?|사업장|주\s*소|업\s*태|종\s*목|등록번호|\(인\)|인$).*$/, "")
  .replace(/[|]/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 40);

// 상호들(나온 순서)
function namesIn(lines) {
  const out = [];
  lines.forEach((L) => {
    const re = /상\s*호\s*(?:\(\s*법\s*인\s*명\s*\)|（\s*법\s*인\s*명\s*）|법인명)?\s*[:：]?\s*([^\n]+?)(?=\s*(?:성\s*명|대\s*표|상\s*호|$))/g;
    let m;
    while ((m = re.exec(L))) { const n = cleanName(m[1]); if (n && n.length >= 2 && !/^[\d\s-]+$/.test(n)) out.push(n); }
  });
  return out;
}

export function detectKind(t) {
  const hit = KINDS.find(([, re]) => re.test(t));
  return hit ? hit[0] : "증빙서류";
}

// text → 결과 · opts: { known: [우리 회사 · 거래처 · 기사 등 이름] } — 알고 있는 이름으로 공급자/공급받는자 순서를 바로잡는다
export function parseInvoiceText(text, opts = {}) {
  const t = String(text || "").replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  const kind = detectKind(t);
  const r = { kind, date: "", supply: 0, vat: 0, total: 0, supplier: "", buyer: "", bizNos: [], approval: "", payer: "", taxFree: false, filled: [] };

  // 승인번호(전자세금계산서) — 앞 8자리가 작성일자
  const ap = /(\d{8})-(\d{8})-(\d{8})/.exec(t);
  if (ap) r.approval = ap[0];

  // 날짜 — 작성일자/발행일/거래일 칸 > 이체일시 > 승인번호 앞 8자리 > 처음 나온 날짜
  const ds = datesIn(t);
  const lab = /(작\s*성\s*년\s*월\s*일|작\s*성\s*일\s*자?|발\s*행\s*일\s*자?|작성\s*년월일|거래\s*일\s*자?|공급\s*연월일|이체\s*일\s*시?|거래\s*일\s*시|처리\s*일\s*시|입금\s*일\s*시?)/;
  const lm = lab.exec(t);
  if (lm) {
    const near = ds.find((x) => x.at >= lm.index && x.at - lm.index < 120);
    if (near) r.date = near.d;
    else {
      // 표 모양: "작성 년 월 일" 다음 줄 "2026 11 11"
      const after = t.slice(lm.index, lm.index + 160);
      const sp = /(20\d{2})\s+(\d{1,2})\s+(\d{1,2})(?!\d)/.exec(after);
      if (sp) r.date = mkDate(sp[1], sp[2], sp[3]);
    }
  }
  if (!r.date && ap) r.date = mkDate(ap[1].slice(0, 4), ap[1].slice(4, 6), ap[1].slice(6, 8));
  if (!r.date && ds.length) r.date = ds[0].d;

  // 금액 — 칸 이름으로 먼저
  r.supply = amountAfter(lines, /공\s*급\s*가\s*액|공급\s*금액/);
  r.vat = amountAfter(lines, /세\s*액|부\s*가\s*세(?!\s*포함)/);
  r.total = amountAfter(lines, /합\s*계\s*금\s*액|총\s*(합계|금액|액)|청\s*구\s*금\s*액|이\s*체\s*금\s*액|송\s*금\s*액|입\s*금\s*액|결\s*제\s*금\s*액|받을\s*금액|합\s*계/);
  // 짝 맞추기 — 칸 이름이 깨졌거나 표가 섞여도 a + round(a/10) = b 인 짝을 찾는다
  const nums = [...new Set(amountsIn(t).map((x) => x.v))];
  const isVat = (a, v) => Math.abs(Math.round(a * 0.1) - v) <= 10;
  if (!(r.supply && r.vat && isVat(r.supply, r.vat))) {
    let best = null;
    nums.forEach((a) => nums.forEach((v) => {
      if (a <= v || !isVat(a, v)) return;
      const hasTotal = nums.some((x) => Math.abs(x - (a + v)) <= 10);
      const score = (hasTotal ? 2 : 0) + (a === r.supply ? 1 : 0) + a / 1e12;
      if (!best || score > best.score) best = { a, v, score };
    }));
    if (best) { r.supply = best.a; r.vat = best.v; }
  }
  if (r.supply && r.vat && isVat(r.supply, r.vat)) {
    const tot = nums.find((x) => Math.abs(x - (r.supply + r.vat)) <= 10);
    r.total = tot || r.supply + r.vat;
  } else if (r.supply && !r.vat) {
    // 면세 계산서 · 거래명세서 — 세액 없음
    r.taxFree = kind === "계산서" || /면\s*세/.test(t);
    if (!r.total) r.total = r.supply;
  } else if (!r.supply && r.total) {
    if (kind === "세금계산서" || kind === "전자세금계산서" || kind === "수정세금계산서") {
      r.supply = Math.round(r.total / 1.1); r.vat = r.total - r.supply;
    } else { r.supply = r.total; }
  } else if (!r.supply && !r.total && nums.length) {
    r.total = Math.max(...nums); r.supply = r.total;
  }

  // 사업자번호 · 상호 — 계산서는 공급자(왼쪽 · 먼저) → 공급받는자
  r.bizNos = [...new Set((t.match(/\d{3}-\d{2}-\d{5}/g) || []))].slice(0, 2);
  const names = namesIn(lines);
  const sup = /공\s*급\s*자(?!\s*등록)/.exec(t); const buy = /공\s*급\s*받\s*는\s*자/.exec(t);
  if (names.length >= 2) { r.supplier = names[0]; r.buyer = names[1]; }
  else if (names.length === 1) { if (buy && sup && buy.index < sup.index) r.buyer = names[0]; else r.supplier = names[0]; }
  // 알고 있는 이름으로 바로잡기
  const norm = (s) => String(s || "").replace(/\(주\)|주식회사|㈜|\s|[()（）.,·-]/g, "").toLowerCase();
  const known = (opts.known || []).map((k) => ({ raw: String(k || "").trim(), n: norm(k) })).filter((k) => k.n.length >= 2);
  const findKnown = (s) => known.find((k) => s && (norm(s).includes(k.n) || k.n.includes(norm(s))));
  known.forEach((k) => {
    if (!r.supplier && !r.buyer) return;
    // 우리 회사가 공급받는자로 읽혔는데 opts.self 가 공급자여야 하는 경우 등은 화면에서 판단 — 여기선 이름만 정식으로 바꾼다
    if (r.supplier && findKnown(r.supplier) === k) r.supplier = k.raw;
    if (r.buyer && findKnown(r.buyer) === k) r.buyer = k.raw;
  });
  if (opts.self) {
    const me = norm(opts.self);
    if (me && r.buyer && norm(r.buyer).includes(me) && opts.selfIs === "supplier") { const x = r.supplier; r.supplier = r.buyer; r.buyer = x; }
    if (me && r.supplier && norm(r.supplier).includes(me) && opts.selfIs === "buyer") { const x = r.supplier; r.supplier = r.buyer; r.buyer = x; }
  }

  // 입금자명 — 이체확인증은 보낸 사람, 계산서는 공급받는자
  if (kind === "이체확인증") {
    const pm = /(보\s*내\s*는\s*분|보\s*낸\s*분|입\s*금\s*자\s*명?|의\s*뢰\s*인|출\s*금\s*계\s*좌\s*예\s*금\s*주|송\s*금\s*인|예\s*금\s*주)\s*[:：]?\s*([^\n\d:：]{2,20})/.exec(t);
    if (pm) r.payer = cleanName(pm[2]).replace(/\s*(받는|계좌|은행).*$/, "");
  }
  if (!r.payer) r.payer = r.buyer || "";
  // 우리 회사가 입금자로 잡히면 안 된다(돈을 내는 쪽은 상대방) — 다른 쪽 이름으로
  if (opts.self && r.payer && norm(r.payer).includes(norm(opts.self))) r.payer = [r.supplier, r.buyer].find((n) => n && !norm(n).includes(norm(opts.self))) || "";

  r.filled = ["date", "supply", "vat", "total", "supplier", "buyer", "payer"].filter((k) => r[k]);
  return r;
}

// 금액 확인 — expect: 운임(공급가액 기준). { ok, level: "ok" | "vat" | "warn" | "none", text, diff }
export function checkAmount(scan, expect) {
  const e = toNum(expect);
  if (!scan || (!scan.supply && !scan.total)) return { ok: false, level: "none", text: "금액을 읽지 못했어요", diff: 0 };
  if (!e) return { ok: false, level: "none", text: "오더에 운임이 없어 비교하지 못했어요", diff: 0 };
  const near = (a, b) => Math.abs(a - b) <= 10;
  if (near(scan.supply, e)) return { ok: true, level: "ok", text: scan.vat ? "공급가액이 운임과 같고, 부가세 10%도 맞아요" : "금액이 운임과 같아요", diff: 0 };
  if (near(scan.total, e)) return { ok: true, level: "vat", text: "합계금액이 운임과 같아요(운임에 부가세가 들어 있는 오더)", diff: 0 };
  if (near(scan.total, Math.round(e * 1.1))) return { ok: true, level: "ok", text: "합계금액이 운임 + 부가세 10%와 같아요", diff: 0 };
  const d = (scan.supply || scan.total) - e;
  return { ok: false, level: "warn", text: `운임과 ${Math.abs(d).toLocaleString("ko-KR")}원 ${d > 0 ? "많아요" : "적어요"} — 확인해 주세요`, diff: d };
}
