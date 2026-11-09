// ======================= src/forkliftCore.js =======================
// 🏗 2026-11-09 지게차비용 — 계산 규칙 한 곳(화면·정산·매출·테스트 공용, 다른 파일을 가져오지 않는다)
//  오더 칸
//   · 지게차비용      지게차 기사에게 주는 돈(원) — 비어 있거나 0이면 지게차 없음
//   · 지게차기사ID · 지게차기사명 · 지게차기사전화 · 지게차회사   (forkliftDrivers 문서)
//   · 지게차부담      "기사"(기사운임에서 차감 · 기본) | "회사"(청구운임=회사 몫에서 부담) | "청구"(거래처에 추가 청구)
//   · 지게차기사차감  지금 기사운임에서 빼 둔 금액(부담=기사일 때 = 지게차비용) — 끄거나 바꿀 때 되돌리는 기준
//   · 지게차청구추가  지금 청구운임에 더해 둔 금액(부담=청구일 때 = 지게차비용)
//   · 지게차지급완료 · 지게차지급일   지게차 기사에게 지급 처리(정산관리 › 지게차 지급)
//  돈의 흐름: 지게차 기사에게는 늘 회사가 지게차비용을 준다. 그래서
//   수익(수수료) = 청구운임 − 기사운임 − 지게차비용  (세 방식 모두 같은 식)
//   예) 청구 500,000 · 기사 400,000 · 지게차 100,000
//       기사 부담  → 청구 500,000 · 기사 300,000 · 수익 100,000
//       회사 부담  → 청구 500,000 · 기사 400,000 · 수익 0
//       청구 추가  → 청구 600,000 · 기사 400,000 · 수익 100,000

export const FORKLIFT_MODES = [
  { key: "기사", label: "기사운임에서 차감", short: "기사 차감" },
  { key: "회사", label: "회사 몫(청구운임)에서 부담", short: "회사 부담" },
  { key: "청구", label: "거래처에 추가 청구", short: "추가 청구" },
];
export const FORKLIFT_KEYS = ["지게차비용", "지게차부담", "지게차기사ID", "지게차기사명", "지게차기사전화", "지게차회사"];

export const fkNum = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
};
export const fkMode = (o) => (["기사", "회사", "청구"].includes(o?.지게차부담) ? o.지게차부담 : "기사");
export const fkAmount = (o) => Math.max(0, fkNum(o?.지게차비용));
export const hasForklift = (o) => fkAmount(o) > 0;
export const fkModeLabel = (o) => (FORKLIFT_MODES.find((m) => m.key === fkMode(o)) || FORKLIFT_MODES[0]).short;

// ─── 🧾 2026-11-09 특수운임(지게차 외) — 오더.특수운임 = [{ 종류, 이름, 금액, 부담, 받는사람, 메모 }] ───
//  받는사람: "기사"(배차 기사에게 더 줌 — 대기료·경유·할증·통행료) | "외부"(회사가 따로 지급 — 인력·주차장 등)
//  부담: "기사"(기사운임에서 차감, 외부일 때만) | "회사"(회사 몫에서) | "청구"(거래처에 추가 청구)
//   · 받는사람=기사 → 기사운임 +금액, 청구면 청구운임 +금액(수익 그대로), 회사면 수익 −금액
//   · 받는사람=외부 → 회사가 따로 지급(외부지급합), 기사 부담이면 기사운임 −금액, 청구면 청구운임 +금액
//  지금 운임에 반영해 둔 양: 특수기사차감(기사운임에서 뺀 양, 음수 = 더한 양) · 특수청구추가 — 바꾸거나 빼면 이 값 기준으로 되돌린다
//  외부지급합 = 지게차비용 + 외부 항목 합(회사가 따로 주는 돈) — 수익 = 청구 − 기사 − 외부지급합
export const SPECIAL_TYPES = [
  { key: "지게차", label: "지게차비용", payee: "외부", mode: "기사", desc: "지게차 기사에게 회사가 지급" },
  { key: "대기료", label: "대기료", payee: "기사", mode: "청구", desc: "상하차 대기 시간 보상" },
  { key: "수작업", label: "수작업·인력 상하차비", payee: "외부", mode: "청구", desc: "인력·수작업 상하차 인건비" },
  { key: "경유", label: "경유(추가 상하차지)", payee: "기사", mode: "청구", desc: "추가 상차·하차지 운임" },
  { key: "할증", label: "야간·휴일·긴급 할증", payee: "기사", mode: "청구", desc: "야간·주말·긴급 운행" },
  { key: "통행료", label: "통행료·주차비", payee: "기사", mode: "청구", desc: "기사가 낸 통행료·주차비 보전" },
  { key: "기타", label: "기타(직접 입력)", payee: "기사", mode: "청구", desc: "이름을 직접 정하는 항목" },
];
export const SPECIAL_MODES = [
  { key: "기사", label: "기사운임에서 차감", short: "기사 차감" },
  { key: "회사", label: "회사 몫에서 부담", short: "회사 부담" },
  { key: "청구", label: "거래처에 추가 청구", short: "추가 청구" },
];
export const SPECIAL_KEYS = ["특수운임", "특수기사차감", "특수청구추가", "외부지급합"];
export const sfType = (k) => SPECIAL_TYPES.find((t) => t.key === k) || SPECIAL_TYPES[SPECIAL_TYPES.length - 1];
export const sfItems = (o) => (Array.isArray(o?.특수운임) ? o.특수운임 : []).filter((x) => x && fkNum(x.금액) > 0);
export const sfPayee = (it) => (it?.받는사람 === "외부" || it?.받는사람 === "기사" ? it.받는사람 : sfType(it?.종류).payee);
export const sfMode = (it) => {
  const m = ["기사", "회사", "청구"].includes(it?.부담) ? it.부담 : sfType(it?.종류).mode;
  return sfPayee(it) === "기사" && m === "기사" ? "청구" : m; // 기사에게 주는 돈을 기사에게서 뺄 수는 없다
};
export const sfName = (it) => (String(it?.이름 || "").trim() || sfType(it?.종류).label);
export function sfTotals(o) {
  let D = 0, C = 0, ext = 0;
  for (const it of sfItems(o)) {
    const a = Math.max(0, fkNum(it.금액)); const m = sfMode(it);
    if (sfPayee(it) === "기사") D -= a; else { ext += a; if (m === "기사") D += a; }
    if (m === "청구") C += a;
  }
  return { D, C, ext };
}
// 회사가 따로 지급하는 돈 합계(지게차 + 외부 특수운임)
export const paidOut = (o) => fkAmount(o) + sfTotals(o).ext;
export const hasSpecial = (o) => hasForklift(o) || sfItems(o).length > 0;
export const specialCount = (o) => (hasForklift(o) ? 1 : 0) + sfItems(o).length;
export const specialTotal = (o) => fkAmount(o) + sfItems(o).reduce((s, it) => s + fkNum(it.금액), 0);
// 내역 한 줄씩(표 칩 툴팁 · 엑셀)
export function specialLines(o) {
  const c = (n) => Math.round(n).toLocaleString("ko-KR");
  const out = [];
  if (hasForklift(o)) out.push(`지게차 ${c(fkAmount(o))} (${fkModeLabel(o)}${o.지게차기사명 ? ` · ${o.지게차기사명}` : ""})`);
  for (const it of sfItems(o)) out.push(`${sfName(it)} ${c(fkNum(it.금액))} (${(SPECIAL_MODES.find((m) => m.key === sfMode(it)) || {}).short || ""}${sfPayee(it) === "외부" ? " · 따로 지급" : ""}${it.메모 ? ` · ${it.메모}` : ""})`);
  return out;
}

// 수익(수수료) — 매출·정산·보고서가 모두 이 식을 쓴다
export const orderProfit = (o) => fkNum(o?.청구운임) - fkNum(o?.기사운임) - paidOut(o);

// 지게차·특수운임 칸·운임 칸이 바뀐 뒤 기사운임·청구운임·수수료를 맞춘다
//  prev = 바뀌기 전 오더, next = 바뀐 값을 넣은 오더, key = 바뀐 칸
//  · 지게차·특수운임을 바꾸면(key 지게차비용·지게차부담·__forklift·특수운임·__special): 예전에 빼/더해 둔 금액을 되돌리고 새로 적용
//  · 사람이 기사운임을 직접 고치면: 그 값을 "기사가 받는 돈"으로 그대로 둔다
//  · 운임구분 계산 등으로 기사운임이 새로 계산되면(특수운임 전 금액): 기사 쪽 조정분을 다시 적용
//  · 청구운임을 사람이 고치면 그대로(그 값이 청구 총액)
export function forkliftApply(prev, next, key, { asString = true } = {}) {
  const F = fkAmount(next);
  const st = sfTotals(next);
  const pD = fkNum(prev?.지게차기사차감) + fkNum(prev?.특수기사차감);
  const pC = fkNum(prev?.지게차청구추가) + fkNum(prev?.특수청구추가);
  const hadSpecial = Array.isArray(prev?.특수운임) && prev.특수운임.length > 0;
  // 지게차·특수운임이 없고 예전에도 없었으면 그대로(다른 오더 모양을 바꾸지 않는다)
  if (!F && !st.D && !st.C && !st.ext && !pD && !pC && !hadSpecial && !fkAmount(prev) && !fkNum(prev?.외부지급합)) return next;
  const out = { ...next };
  const mode = fkMode(next);
  const fD = mode === "기사" ? F : 0;
  const fC = mode === "청구" ? F : 0;
  const wantD = fD + st.D;
  const wantC = fC + st.C;
  const fmt = (n) => (asString ? String(n) : n);
  const hadMoney = (v) => v != null && String(v).trim() !== "";
  const touched = ["지게차비용", "지게차부담", "__forklift", "특수운임", "__special"].includes(key);
  if (touched) {
    if (hadMoney(next.기사운임) || pD || wantD) out.기사운임 = fmt(fkNum(next.기사운임) + pD - wantD);
    if (hadMoney(next.청구운임) || pC || wantC) out.청구운임 = fmt(fkNum(next.청구운임) - pC + wantC);
  } else if (key !== "기사운임" && fkNum(next.기사운임) !== fkNum(prev?.기사운임) && wantD) {
    // 기사운임이 다른 계산(운임구분 등)으로 새로 정해짐 = 특수운임 반영 전 금액
    out.기사운임 = fmt(fkNum(next.기사운임) - wantD);
  } else if (key !== "기사운임" && wantD !== pD) {
    out.기사운임 = fmt(fkNum(next.기사운임) + pD - wantD);
  }
  out.지게차기사차감 = F ? fD : 0;
  out.지게차청구추가 = F ? fC : 0;
  out.특수기사차감 = st.D;
  out.특수청구추가 = st.C;
  out.외부지급합 = F + st.ext;
  if (hadMoney(out.청구운임) || hadMoney(out.기사운임) || F || st.ext) out.수수료 = fmt(fkNum(out.청구운임) - fkNum(out.기사운임) - F - st.ext);
  return out;
}

// 지게차를 뺄 때(끄기) — 빼/더해 둔 금액을 되돌리고 지게차 칸을 비운다(다른 특수운임은 그대로)
export function forkliftClear(o, opts) {
  const cleared = { ...o, 지게차비용: "", 지게차기사ID: "", 지게차기사명: "", 지게차기사전화: "", 지게차회사: "" };
  const out = forkliftApply(o, cleared, "__forklift", opts);
  out.지게차부담 = ""; out.지게차기사차감 = 0; out.지게차청구추가 = 0;
  return out;
}
// 특수운임 전부 적용(팝업 [적용]) — fork = 지게차 칸 값(없으면 지게차 없음), items = 지게차 외 항목
export function specialApplyAll(o, { fork = null, items = [] } = {}, opts) {
  const f = fork && fkNum(fork.지게차비용) > 0
    ? { 지게차비용: String(fkNum(fork.지게차비용)), 지게차부담: fkMode(fork), 지게차기사ID: fork.지게차기사ID || "", 지게차기사명: fork.지게차기사명 || "", 지게차기사전화: fork.지게차기사전화 || "", 지게차회사: fork.지게차회사 || "" }
    : { 지게차비용: "", 지게차부담: "", 지게차기사ID: "", 지게차기사명: "", 지게차기사전화: "", 지게차회사: "" };
  const list = (items || []).filter((x) => x && fkNum(x.금액) > 0).map((x) => ({
    종류: x.종류 || "기타", 이름: String(x.이름 || "").trim(), 금액: fkNum(x.금액), 부담: sfMode(x), 받는사람: sfPayee(x), 메모: String(x.메모 || "").trim(),
  }));
  const out = forkliftApply(o, { ...o, ...f, 특수운임: list }, "__special", opts);
  if (!f.지게차비용) { out.지게차부담 = ""; out.지게차기사차감 = 0; out.지게차청구추가 = 0; }
  return out;
}

// 화면 요약 한 줄 — "청구 500,000 · 기사 300,000 · 지게차 100,000 · 수익 100,000"
export function forkliftSummary(o) {
  const c = (n) => Math.round(n).toLocaleString("ko-KR");
  return `청구 ${c(fkNum(o?.청구운임))} · 기사 ${c(fkNum(o?.기사운임))} · ${sfItems(o).length ? `특수 ${c(specialTotal(o))}` : `지게차 ${c(fkAmount(o))}`} · 수익 ${c(orderProfit(o))}`;
}

// 상차지 기억(지게차 기본값) 키 — 거래처 + 상차지명(공백·대소문자 무시)
export const fkPresetKey = (o) => {
  const n = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
  const pick = n(o?.상차지명);
  if (!pick) return "";
  return `${n(o?.거래처명) || "_"}__${pick}`.replace(/[/#?[\]]/g, "_").slice(0, 300);
};

// 지게차 기사별 지급 목록(정산관리 › 지게차 지급)
export function forkliftPayoutGroups(orders = []) {
  const m = new Map();
  for (const o of orders || []) {
    if (!hasForklift(o)) continue;
    if (String(o?.배차상태 || "") === "배차취소") continue;
    const id = String(o.지게차기사ID || "") || `name:${String(o.지게차기사명 || "미지정").trim()}`;
    const g = m.get(id) || { id, name: String(o.지게차기사명 || "미지정"), phone: o.지게차기사전화 || "", company: o.지게차회사 || "", total: 0, paid: 0, unpaid: 0, count: 0, rows: [] };
    const a = fkAmount(o);
    g.total += a; g.count += 1;
    if (o.지게차지급완료) g.paid += a; else g.unpaid += a;
    g.rows.push(o);
    m.set(id, g);
  }
  return [...m.values()].sort((a, b) => b.unpaid - a.unpaid || b.total - a.total);
}

// ⭐ 2026-11-09 지게차 지급 이체 엑셀(은행 대량이체 양식) — 기사별 미지급 합계 한 줄
//  · 계좌(은행·계좌번호)가 없는 기사는 빼고 missing 에 이름을 담는다 · 계좌번호는 숫자만 · 통장 표시는 7자까지(은행 대부분 한도)
export function forkliftTransferRows(groups = [], dMap = {}, { ym = "", payer = "" } = {}) {
  const cut = (v, n = 7) => String(v || "").replace(/\s+/g, "").slice(0, n);
  const rows = []; const missing = [];
  for (const g of groups || []) {
    const unpaidRows = (g.rows || []).filter((r) => !r.지게차지급완료);
    const amount = unpaidRows.reduce((a, r) => a + fkAmount(r), 0);
    if (!(amount > 0)) continue;
    const d = dMap[String(g.rows?.[0]?.지게차기사ID || "")] || dMap[g.id] || {};
    const bank = String(d.은행 || "").trim(); const acct = String(d.계좌번호 || "").replace(/\D/g, "");
    if (!bank || !acct) { missing.push(g.name || "미지정"); continue; }
    rows.push({ 은행: bank, 계좌번호: acct, 예금주: String(d.예금주 || g.name || "").trim(), 금액: amount,
      "받는분 통장표시": cut(payer || "지게차비"), "내 통장표시": cut(`지게차${g.name || ""}`), 메모: `${ym || "전체"} 지게차비 ${unpaidRows.length}건` });
  }
  return { rows, missing, total: rows.reduce((a, r) => a + r.금액, 0) };
}

// 지게차 기사 대용량 업로드 한 줄 검사
export const FORKLIFT_UPLOAD_COLS = ["이름", "전화번호", "지게차회사", "은행", "계좌번호", "예금주", "메모"];
export function forkliftRowFromSheet(row = {}) {
  const g = (k) => String(row[k] ?? "").trim();
  const phoneDigits = g("전화번호").replace(/\D/g, "");
  const r = { 이름: g("이름"), 전화번호: phoneDigits, 지게차회사: g("지게차회사") || g("회사"), 은행: g("은행") || g("은행명"), 계좌번호: g("계좌번호").replace(/[^\d-]/g, ""), 예금주: g("예금주"), 메모: g("메모") };
  const errors = [];
  if (!r.이름) errors.push("이름 없음");
  if (phoneDigits && (phoneDigits.length < 9 || phoneDigits.length > 11)) errors.push("전화번호 자리수");
  if (r.계좌번호 && !r.은행) errors.push("은행 없음");
  return { row: r, errors };
}
