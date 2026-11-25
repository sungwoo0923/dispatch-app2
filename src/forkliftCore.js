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
// ⭐ 2026-11-17 수익 계산(fkNum · paidOut · orderProfit · profitTotals 등)은 functions/profitCore.mjs 로 옮겼다 —
//  서버(AI 비서 · 일일 보고서)와 같은 파일을 쓰려고. 여기서는 다시 내보내기만 한다(가져오는 곳 그대로).
import { fkNum, fkAmount, SPECIAL_TYPES, sfType, sfItems, sfPayee, sfMode, sfTotals, paidOut, orderProfit, orderCost, profitRate, profitTotals, nextFee } from "../functions/profitCore.mjs";
export { fkNum, fkAmount, SPECIAL_TYPES, sfType, sfItems, sfPayee, sfMode, sfTotals, paidOut, orderProfit, orderCost, profitRate, profitTotals, nextFee };

export const FORKLIFT_MODES = [
  { key: "기사", label: "기사운임에서 차감", short: "기사 차감" },
  { key: "회사", label: "회사 몫(청구운임)에서 부담", short: "회사 부담" },
  { key: "청구", label: "거래처에 추가 청구", short: "추가 청구" },
];
export const FORKLIFT_KEYS = ["지게차비용", "지게차부담", "지게차기사ID", "지게차기사명", "지게차기사전화", "지게차회사"];

export const fkMode = (o) => (["기사", "회사", "청구"].includes(o?.지게차부담) ? o.지게차부담 : "기사");
export const hasForklift = (o) => fkAmount(o) > 0;
export const fkModeLabel = (o) => (FORKLIFT_MODES.find((m) => m.key === fkMode(o)) || FORKLIFT_MODES[0]).short;

// ─── 🧾 2026-11-09 특수운임(지게차 외) — 오더.특수운임 = [{ 종류, 이름, 금액, 부담, 받는사람, 메모 }] ───
//  받는사람: "기사"(배차 기사에게 더 줌 — 대기료·경유·할증·통행료) | "외부"(회사가 따로 지급 — 인력·주차장 등)
//  부담: "기사"(기사운임에서 차감, 외부일 때만) | "회사"(회사 몫에서) | "청구"(거래처에 추가 청구)
//   · 받는사람=기사 → 기사운임 +금액, 청구면 청구운임 +금액(수익 그대로), 회사면 수익 −금액
//   · 받는사람=외부 → 회사가 따로 지급(외부지급합), 기사 부담이면 기사운임 −금액, 청구면 청구운임 +금액
//  지금 운임에 반영해 둔 양: 특수기사차감(기사운임에서 뺀 양, 음수 = 더한 양) · 특수청구추가 — 바꾸거나 빼면 이 값 기준으로 되돌린다
//  외부지급합 = 지게차비용 + 외부 항목 합(회사가 따로 주는 돈) — 수익 = 청구 − 기사 − 외부지급합
export const SPECIAL_MODES = [
  { key: "기사", label: "기사운임에서 차감", short: "기사 차감" },
  { key: "회사", label: "회사 몫에서 부담", short: "회사 부담" },
  { key: "청구", label: "거래처에 추가 청구", short: "추가 청구" },
];
export const SPECIAL_KEYS = ["특수운임", "특수기사차감", "특수청구추가", "외부지급합"];
export const sfName = (it) => (String(it?.이름 || "").trim() || sfType(it?.종류).label);
export const hasSpecial = (o) => hasForklift(o) || sfItems(o).length > 0;
export const specialCount = (o) => (hasForklift(o) ? 1 : 0) + sfItems(o).length;
export const specialTotal = (o) => fkAmount(o) + sfItems(o).reduce((s, it) => s + fkNum(it.금액), 0);
// 내역 한 줄씩(표 칩 툴팁 · 엑셀)
export function specialLines(o) {
  const c = (n) => Math.round(n).toLocaleString("ko-KR");
  const out = [];
  if (hasForklift(o)) out.push(`지게차 ${c(fkAmount(o))} (${fkModeLabel(o)}${o.지게차기사명 ? ` · ${o.지게차기사명}` : ""})`);
  for (const it of sfItems(o)) out.push(`${sfName(it)} ${c(fkNum(it.금액))} (${(SPECIAL_MODES.find((m) => m.key === sfMode(it)) || {}).short || ""}${sfPayee(it) === "외부" ? " · 따로 지급" : sfPayee(it) === "없음" ? " · 지급 없음" : ""}${it.메모 ? ` · ${it.메모}` : ""})`);
  return out;
}

// 수익(수수료) — 매출·정산·보고서가 모두 orderProfit(functions/profitCore.mjs)을 쓴다

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

// 🚫 2026-11-25 지급 목록에서 빼는 오더 — 취소된 오더(상태 · 배차상태 취소 · 배차취소 · 오더취소 · 취소됨) · 화주사 사본(source "transport_transmit")
//  예전엔 배차상태 "배차취소"만 뺐다. 이미 지급한 뒤 취소된 오더는 [지급 취소]를 할 수 있게 남긴다(화면에 "지급 후 취소" 표시)
export const PAYOUT_CANCEL_STATES = ["취소", "배차취소", "오더취소", "취소됨"];
export const isCanceledOrder = (o) => PAYOUT_CANCEL_STATES.includes(String(o?.배차상태 || "")) || PAYOUT_CANCEL_STATES.includes(String(o?.상태 || ""));
export const isShipperCopy = (o) => String(o?.source || "") === "transport_transmit";

// 지게차 기사별 지급 목록(정산관리 › 지게차 · 외부 지급 › 지게차)
export function forkliftPayoutGroups(orders = []) {
  const m = new Map();
  for (const o of orders || []) {
    if (!hasForklift(o)) continue;
    if (isShipperCopy(o)) continue;
    if (isCanceledOrder(o) && !o.지게차지급완료) continue;
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

// 🧾 2026-11-24 운임 내역(운임정보 · 운임확인서) — 이 오더에 들어간 운임을 항목별로 풀어 보여 준다(사용자 요청)
//  기본 운임(특수운임을 넣기 전) → 지게차 · 특수운임 항목마다 기사운임 · 청구운임이 얼마씩 바뀌었는지 → 최종 운임 · 회사 별도 지급 · 수수료
//  기본 운임은 오더에 저장된 "지금 반영해 둔 양"(지게차기사차감 · 특수기사차감 · 지게차청구추가 · 특수청구추가)으로 되돌려 구한다
export function fareBreakdown(o) {
  const drv = fkNum(o?.기사운임), sale = fkNum(o?.청구운임);
  const baseDrv = drv + fkNum(o?.지게차기사차감) + fkNum(o?.특수기사차감);
  const baseSale = sale - fkNum(o?.지게차청구추가) - fkNum(o?.특수청구추가);
  const lines = [];
  if (hasForklift(o)) {
    const a = fkAmount(o); const m = fkMode(o);
    lines.push({ key: "fork", name: "지게차비용", amount: a, how: `${fkModeLabel(o)}${o.지게차기사명 ? ` · ${o.지게차기사명}` : ""} · 지게차 기사에게 회사가 지급`,
      drv: m === "기사" ? -a : 0, sale: m === "청구" ? a : 0, paid: a });
  }
  for (const it of sfItems(o)) {
    const a = fkNum(it.금액); const p = sfPayee(it); const m = sfMode(it);
    const modeShort = (SPECIAL_MODES.find((x) => x.key === m) || {}).short || "";
    let d = 0, s = 0, paid = 0, to = "";
    if (p === "없음") { if (m === "기사") d = -a; else s = a; to = m === "기사" ? "회사 몫으로 남음" : "따로 지급 없음"; }
    else if (p === "기사") { d = a; if (m === "청구") s = a; to = "배차 기사에게 지급"; }
    else { paid = a; if (m === "기사") d = -a; if (m === "청구") s = a; to = "회사가 따로 지급"; }
    lines.push({ key: `sf${lines.length}`, name: sfName(it), amount: a, how: [modeShort, to, it.메모].filter(Boolean).join(" · "), drv: d, sale: s, paid });
  }
  const paid = paidOut(o);
  return { fareType: String(o?.운임구분 || "").trim(), baseDrv, baseSale, lines, drv, sale, paid, profit: orderProfit(o) };
}

// ─── 💳 2026-11-25 외부 지급 — 특수운임 중 받는사람 "외부"(회사가 따로 주는 돈: 인력 상하차비 · 주차비 · 기타) ───
//  정산관리 › 지게차 · 외부 지급 › [외부 지급] 탭. 수익(paidOut)에는 이미 빠져 있고, 여기서는 "줬는지"만 관리한다.
//  저장: 오더.외부지급 = { [항목키]: { 상태: "지급완료", 지급일, 지급액, 이름, 받는곳, 기록일, 조정액?, 조정일? } }
//   · 특수운임 배열은 팝업 [적용](specialApplyAll)이 {종류·이름·금액·부담·받는사람·메모}만 남기고 다시 만들어서,
//     항목 안에 지급 칸을 두면 다음 수정 때 사라진다 → 오더에 따로 둔다
//   · 항목키 = 종류-이름(같은 이름이 또 있으면 ~2, ~3) — 금액 · 메모를 고쳐도 그대로
//   · 지급액 = 지급완료 때 금액(장부에 들어간 금액). 그 뒤 항목 금액이 바뀌면 "지급 후 금액 변경"으로 표시
//   · 💸 2026-11-25 [추가 지급]/[환수 처리](용차지급관리 payCore.settleGapPlan 과 같은 방식) — 조정액 = 누적 차액(+ 더 줌 · − 돌려받음)
//     실제로 준 돈(paidAmt) = 지급액 + 조정액 · 장부 조정 줄 acctLedger/auto_extpayadj_{회사}_{오더ID}_{항목키}(누적 금액 · 0이면 지움)
//     [지급 취소]는 지급 줄 · 조정 줄을 같이 지우고 조정액도 비운다
//   · 지급한 항목을 지우거나 받는사람을 바꾸면 "항목이 바뀌었어요" 줄로 남겨 [지급 취소]를 할 수 있게 한다
//  장부: acctLedger/auto_extpay_{회사}_{오더ID}_{항목키} 한 줄(지급액 · 지급 취소면 지움 — 여러 번 눌러도 같은 값)
//  오더 복사 때는 외부지급을 복사하지 않는다(EXT_PAY_FIELDS)
export const EXT_PAY_FIELDS = ["외부지급"];
const extKeyPart = (v) => String(v || "").replace(/[\s/#?[\]._~|$*`]/g, "").slice(0, 24);
export const extRecvOf = (it) => String(it?.메모 || "").trim() || sfName(it);
export const extPayMap = (o) => (o?.외부지급 && typeof o.외부지급 === "object" && !Array.isArray(o.외부지급) ? o.외부지급 : {});
// 외부 항목 목록(항목키 포함)
export function extItems(o) {
  const seen = {}; const out = [];
  for (const it of sfItems(o)) {
    if (sfPayee(it) !== "외부") continue;
    const base = `${extKeyPart(it.종류) || "기타"}-${extKeyPart(sfName(it)) || "항목"}`;
    seen[base] = (seen[base] || 0) + 1;
    out.push({ key: seen[base] > 1 ? `${base}~${seen[base]}` : base, item: it, name: sfName(it), to: extRecvOf(it), amount: fkNum(it.금액), mode: sfMode(it) });
  }
  return out;
}
// 오더 한 건의 외부 지급 줄 — 지금 항목 + 지급했는데 항목이 사라진 줄(orphan)
export function extPayoutRows(o) {
  const map = extPayMap(o); const rows = []; const used = new Set();
  const canceled = isCanceledOrder(o);
  const orderId = String(o?._id || o?.id || "");
  for (const x of extItems(o)) {
    const st = map[x.key]; const paid = st?.상태 === "지급완료";
    used.add(x.key);
    const basePaid = paid ? fkNum(st.지급액 ?? x.amount) : 0;
    const adjAmt = paid ? fkNum(st.조정액) : 0;
    const paidAmt = basePaid + adjAmt; // 실제로 준 돈(지급 + 추가 지급 − 환수)
    rows.push({ order: o, orderId, key: x.key, name: x.name, to: x.to, amount: x.amount, mode: x.mode, paid, paidAmt, basePaid, adjAmt, paidDate: paid ? String(st.지급일 || "") : "",
      changed: paid && paidAmt !== x.amount, orphan: false, canceled });
  }
  for (const [k, st] of Object.entries(map)) {
    if (used.has(k) || st?.상태 !== "지급완료") continue;
    const basePaid = fkNum(st.지급액); const adjAmt = fkNum(st.조정액); const paidAmt = basePaid + adjAmt;
    rows.push({ order: o, orderId, key: k, name: String(st.이름 || k), to: String(st.받는곳 || st.이름 || "받는 곳 없음"), amount: 0, mode: "", paid: true, paidAmt, basePaid, adjAmt, paidDate: String(st.지급일 || ""), changed: true, orphan: true, canceled });
  }
  return rows;
}
const extGroupId = (to) => String(to || "").replace(/\s+/g, "").toLowerCase() || "_";
// 받는 곳별 묶음 — 취소 오더 · 화주사 사본은 빼고, 지급한 뒤 취소된 줄만 남긴다
export function extPayoutGroups(orders = []) {
  const m = new Map();
  for (const o of orders || []) {
    if (isShipperCopy(o)) continue;
    for (const r of extPayoutRows(o)) {
      if (r.canceled && !r.paid) continue;
      const id = extGroupId(r.to);
      const g = m.get(id) || { id, name: r.to, total: 0, paid: 0, unpaid: 0, count: 0, changed: 0, rows: [] };
      if (r.paid) g.paid += r.paidAmt; else g.unpaid += r.amount;
      if (r.changed) g.changed += 1;
      g.count += 1; g.total = g.paid + g.unpaid; g.rows.push(r);
      m.set(id, g);
    }
  }
  for (const g of m.values()) g.rows.sort((a, b) => String(a.order?.상차일 || "").localeCompare(String(b.order?.상차일 || "")));
  return [...m.values()].sort((a, b) => b.unpaid - a.unpaid || b.total - a.total);
}
// 장부 줄 키(ledgerAuto.setExtPayout → upsertAutoEntry 와 같은 규칙)
export const extLedgerKey = (orderId, itemKey) => `${orderId}_${itemKey}`;
const ledgerSafe = (v) => String(v || "").replace(/[/\s#?[\]]/g, "_").slice(0, 80);
export const extLedgerDocId = (company, orderId, itemKey) => `auto_extpay_${ledgerSafe(company)}_${ledgerSafe(extLedgerKey(orderId, itemKey))}`;
// 조정 줄(ledgerAuto.setExtPayAdjust — 추가 지급 · 환수)
export const extAdjLedgerDocId = (company, orderId, itemKey) => `auto_extpayadj_${ledgerSafe(company)}_${ledgerSafe(extLedgerKey(orderId, itemKey))}`;
// 지급완료 · 지급 취소 → { patch: { 외부지급 }, ledger: [{ itemKey, amount(0이면 장부 줄 지움), adjAmount(null 그대로 · 0 조정 줄 지움), date, name, to }] }
//  keys = 바꿀 항목키들. 이미 그 상태인 항목은 건드리지 않는다(장부도 그대로)
export function extPayPlan(o, keys = [], { paid = true, date = "", today = "" } = {}) {
  const want = new Set(keys || []);
  const map = { ...extPayMap(o) }; const ledger = [];
  for (const r of extPayoutRows(o)) {
    if (!want.has(r.key) || r.paid === paid) continue;
    if (paid) {
      if (!(r.amount > 0)) continue;
      const d = String(date || today || "").slice(0, 10);
      map[r.key] = { 상태: "지급완료", 지급일: d, 지급액: r.amount, 이름: r.name, 받는곳: r.to, 기록일: today || d };
      ledger.push({ itemKey: r.key, amount: r.amount, adjAmount: null, date: d, name: r.name, to: r.to });
    } else {
      delete map[r.key]; // 조정액도 같이 빠진다
      ledger.push({ itemKey: r.key, amount: 0, adjAmount: 0, date: r.paidDate, name: r.name, to: r.to });
    }
  }
  if (!ledger.length) return null;
  return { patch: { 외부지급: Object.keys(map).length ? map : null }, ledger };
}
// 💸 [추가 지급]/[환수 처리] — 지급 후 금액이 바뀐 항목 하나의 차액을 조정액(누적)으로. 차액이 없거나 항목이 사라진 줄이면 null
//  → { gap(+ 더 줌 · − 돌려받음), adjAmount(장부 조정 줄 금액 = 새 누적 조정액), patch: { 외부지급 }, ledger: { itemKey, adjAmount, date, name, to } }
export function extSettleGapPlan(o, key, today = "") {
  const r = extPayoutRows(o).find((x) => x.key === key);
  if (!r || !r.paid || r.orphan) return null;
  const gap = r.amount - r.paidAmt;
  if (!gap) return null;
  const adj = r.adjAmt + gap;
  const map = { ...extPayMap(o) };
  const { 조정액: _a, 조정일: _d, ...rest } = map[key] || {};
  map[key] = adj ? { ...rest, 조정액: adj, 조정일: String(today || "").slice(0, 10) } : rest;
  return { gap, adjAmount: adj, patch: { 외부지급: map }, ledger: { itemKey: key, adjAmount: adj, date: String(today || r.paidDate || "").slice(0, 10), name: r.name, to: r.to } };
}
