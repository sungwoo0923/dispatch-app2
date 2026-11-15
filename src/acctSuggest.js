// ======================= src/acctSuggest.js =======================
// 🧾 2026-11-15 전표(수입·지출 장부) 자동화 — 계정과목 자동 추천 · 증빙 종류 · 공급가/부가세 나누기 (화면 없는 계산만)
//  추천 순서
//   ① 우리 회사가 같은 거래처(사용처)에 예전에 고른 계정과목 — 가장 많이 고른 것(같으면 최근 것). 사람이 바꾸면 다음부터 그 값을 따른다
//   ② 거래처 · 내용 · 메모에 든 낱말 규칙(주유 → 유류비, 하이패스 → 여비교통비 …)
//   ③ 그래도 없으면 추천하지 않는다(사람이 고른다)
//  ⚠ 다른 파일을 가져오지 않는다(node 테스트: scripts/acctSuggest.test.mjs)

const norm = (s) => String(s || "").toLowerCase().replace(/\(주\)|주식회사|㈜|\s|[.,·()\-_/]/g, "");

// 낱말 규칙 — 앞에 있을수록 먼저 본다(구체적인 것 먼저)
export const ACCOUNT_RULES = {
  지출: [
    ["유류비", /주유|오일뱅크|sk에너지|gs칼텍스|s-?oil|에쓰오일|현대오일|알뜰주유|경유|휘발유|lpg|충전소|요소수|유류/i],
    ["여비교통비", /하이패스|한국도로공사|도로공사|통행료|톨게이트|주차|택시|ktx|코레일|srt|고속버스|시외버스|항공|대한항공|아시아나|제주항공|숙박|호텔|모텔|버스|지하철|티머니/i],
    ["차량유지비", /정비|카센터|타이어|오토|모터스|엔진|오일교환|세차|판금|도색|부품|배터리|자동차검사|검사소|공업사|블루핸즈|오토큐|스피드메이트/i],
    ["통신비", /skt|sk텔레콤|kt(?![a-z])|케이티|lgu|lg유플러스|유플러스|통신|인터넷|휴대폰요금|전화요금|알뜰폰/i],
    ["수도광열비", /한국전력|한전|전기요금|수도|가스|도시가스|난방|관리비/i],
    ["보험료", /보험|화재|삼성화재|db손해|현대해상|kb손해|메리츠|한화손해|국민연금|건강보험|고용보험|산재/i],
    ["세금과공과", /세금|국세|지방세|자동차세|면허세|과태료|범칙금|인지|등록면허|협회비|회비|조합비|공과금/i],
    ["지급수수료", /수수료|세무|회계사무|법무|노무|은행|송금|이체수수료|pg|결제대행|팝빌|등기|공증|대행/i],
    ["광고선전비", /광고|네이버광고|카카오광고|홍보|전단|현수막|명함인쇄|간판|마케팅/i],
    ["교육훈련비", /교육|학원|세미나|강의|연수|자격증|시험응시/i],
    ["도서인쇄비", /도서|서점|교보문고|영풍문고|yes24|알라딘|인쇄|복사|출력|제본/i],
    ["임차료", /임대료|월세|임차|렌트|렌탈|리스|사무실임대|창고임대|주차장임대/i],
    ["수선비", /수선|수리|인테리어|보수|설비|철물|에어컨수리/i],
    ["운반비", /퀵|택배|화물|용달|배송|cj대한통운|한진|롯데택배|우체국택배|로젠|등기우편|우편/i],
    ["접대비", /접대|선물|화환|꽃집|플라워|경조사|축의금|조의금|골프/i],
    ["소모품비", /토너|잉크|카트리지|복사용지|a4용지/i], // 복합기 토너는 비품이 아니라 소모품
    ["비품구입", /비품|가구|의자|책상|컴퓨터|노트북|모니터|프린터|복합기|하이마트|전자랜드|가전/i],
    ["소모품비", /다이소|문구|오피스|토너|잉크|a4|복사용지|생수|휴지|세제|소모품|쿠팡|이마트|홈플러스|롯데마트|코스트코|편의점|gs25|cu(?![a-z])|세븐일레븐|이마트24|철물점/i],
    ["복리후생비", /식당|식사|밥|김밥|국밥|분식|치킨|피자|커피|카페|스타벅스|이디야|투썸|메가커피|빽다방|베이커리|빵|회식|간식|도시락|배달의민족|배민|요기요|쿠팡이츠|중식|한식|고기|정육|횟집/i],
  ],
  수입: [
    ["운송수입", /운임|운송|운반|화물|배차|용차/i],
    ["이자수입", /이자|예금이자/i],
    ["보조금", /보조금|지원금|장려금|고용지원/i],
    ["환급", /환급|환불|부가세환급|취소/i],
    ["잡이익", /잡이익|폐품|고철|중고판매/i],
  ],
};

// 예전 장부에서 같은 거래처 → 계정과목
export function historyAccount(rows = [], vendor = "", type = "지출") {
  const k = norm(vendor);
  if (k.length < 2) return null;
  const tally = {};
  for (const r of rows || []) {
    if (!r || r.type !== type || r.auto) continue;
    const v = norm(r.vendor);
    if (!v || !(v === k || (k.length >= 3 && (v.includes(k) || k.includes(v)) && Math.min(v.length, k.length) >= 3))) continue;
    const a = String(r.account || "").trim(); if (!a || a === "기타") continue;
    const at = String(r.date || "");
    const t = tally[a] || (tally[a] = { n: 0, last: "" });
    t.n++; if (at > t.last) t.last = at;
  }
  const best = Object.entries(tally).sort((a, b) => b[1].n - a[1].n || b[1].last.localeCompare(a[1].last))[0];
  return best ? { account: best[0], n: best[1].n } : null;
}

// 낱말 규칙으로 — [{ account, word }]
export function ruleAccounts(text = "", type = "지출") {
  const t = String(text || "");
  if (!t.trim()) return [];
  const out = [];
  for (const [a, re] of ACCOUNT_RULES[type] || []) { const m = t.match(re); if (m && !out.some((x) => x.account === a)) out.push({ account: a, word: m[0] }); }
  return out;
}

// 추천 — { account, why, from: "history" | "rule", alts: [] } 또는 null
export function suggestAccount({ type = "지출", vendor = "", item = "", memo = "" } = {}, rows = []) {
  const h = historyAccount(rows, vendor, type);
  const rules = ruleAccounts(`${vendor} ${item} ${memo}`, type);
  if (h) return { account: h.account, from: "history", why: `예전에 ‘${String(vendor).trim()}’을(를) ${h.account}(으)로 ${h.n}번 적었어요`, alts: rules.map((x) => x.account).filter((a) => a !== h.account).slice(0, 2) };
  if (rules.length) return { account: rules[0].account, from: "rule", why: `‘${rules[0].word}’이(가) 들어 있어서 ${rules[0].account}(으)로 골랐어요`, alts: rules.slice(1, 3).map((x) => x.account) };
  return null;
}

// 영수증 결제 방식 → 증빙 종류
export function evidenceOf(scan = {}) {
  const t = String(scan.text || "");
  if (/세금\s*계산서/.test(t)) return "세금계산서";
  if (/현금\s*영수증|현금\(소득공제\)|지출증빙/.test(t)) return "현금영수증";
  if (scan.cardApproval || scan.pay === "personalCard" || /카드|승인\s*번호/.test(t)) return "카드전표";
  if (scan.amount) return "간이영수증";
  return "";
}

// 합계 금액 → 공급가 · 부가세(10%) — 면세면 부가세 0
export function vatSplit(total, taxFree = false) {
  const n = Math.round(Number(String(total ?? "").replace(/[^\d-]/g, "")) || 0);
  if (taxFree || !n) return { supply: n, vat: 0, total: n };
  const supply = Math.round(n / 1.1);
  return { supply, vat: n - supply, total: n };
}
