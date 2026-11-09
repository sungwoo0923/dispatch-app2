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

// 수익(수수료) — 매출·정산·보고서가 모두 이 식을 쓴다
export const orderProfit = (o) => fkNum(o?.청구운임) - fkNum(o?.기사운임) - fkAmount(o);

// 지게차 칸·운임 칸이 바뀐 뒤 기사운임·청구운임·수수료를 맞춘다
//  prev = 바뀌기 전 오더, next = 바뀐 값을 넣은 오더, key = 바뀐 칸
//  · 지게차 칸(금액·방식)을 바꾸면: 예전에 빼/더해 둔 금액을 되돌리고 새 금액을 다시 적용
//  · 사람이 기사운임을 직접 고치면: 그 값을 "기사가 받는 돈"으로 그대로 둔다
//  · 운임구분 계산 등으로 기사운임이 새로 계산되면(지게차 전 금액): 기사 부담이면 그만큼 다시 뺀다
//  · 청구운임을 사람이 고치면 그대로(그 값이 청구 총액)
export function forkliftApply(prev, next, key, { asString = true } = {}) {
  const F = fkAmount(next);
  // 지게차가 없고 예전에도 없었으면 그대로(다른 오더 모양을 바꾸지 않는다)
  if (!F && !fkNum(prev?.지게차기사차감) && !fkNum(prev?.지게차청구추가)) return next;
  const out = { ...next };
  const mode = fkMode(next);
  const wantD = mode === "기사" ? F : 0;
  const wantC = mode === "청구" ? F : 0;
  const pD = fkNum(prev?.지게차기사차감);
  const pC = fkNum(prev?.지게차청구추가);
  const fmt = (n) => (asString ? String(n) : n);
  const hadMoney = (v) => v != null && String(v).trim() !== "";
  const touchedFork = key === "지게차비용" || key === "지게차부담" || key === "__forklift";
  if (touchedFork) {
    if (hadMoney(next.기사운임) || pD || wantD) out.기사운임 = fmt(fkNum(next.기사운임) + pD - wantD);
    if (hadMoney(next.청구운임) || pC || wantC) out.청구운임 = fmt(fkNum(next.청구운임) - pC + wantC);
  } else if (key !== "기사운임" && fkNum(next.기사운임) !== fkNum(prev?.기사운임) && wantD) {
    // 기사운임이 다른 계산(운임구분 등)으로 새로 정해짐 = 지게차 빼기 전 금액
    out.기사운임 = fmt(fkNum(next.기사운임) - wantD);
  } else if (key !== "기사운임" && wantD !== pD) {
    out.기사운임 = fmt(fkNum(next.기사운임) + pD - wantD);
  }
  out.지게차기사차감 = wantD;
  out.지게차청구추가 = wantC;
  if (!F) { out.지게차기사차감 = 0; out.지게차청구추가 = 0; }
  if (hadMoney(out.청구운임) || hadMoney(out.기사운임) || F) out.수수료 = fmt(fkNum(out.청구운임) - fkNum(out.기사운임) - F);
  return out;
}

// 지게차를 뺄 때(끄기) — 빼/더해 둔 금액을 되돌리고 지게차 칸을 비운다
export function forkliftClear(o, opts) {
  const cleared = { ...o, 지게차비용: "", 지게차기사ID: "", 지게차기사명: "", 지게차기사전화: "", 지게차회사: "" };
  const out = forkliftApply(o, cleared, "__forklift", opts);
  out.지게차부담 = ""; out.지게차기사차감 = 0; out.지게차청구추가 = 0;
  const has = (v) => v != null && String(v).trim() !== "";
  if (has(out.청구운임) || has(out.기사운임)) out.수수료 = (opts?.asString === false) ? fkNum(out.청구운임) - fkNum(out.기사운임) : String(fkNum(out.청구운임) - fkNum(out.기사운임));
  return out;
}

// 화면 요약 한 줄 — "청구 500,000 · 기사 300,000 · 지게차 100,000 · 수익 100,000"
export function forkliftSummary(o) {
  const c = (n) => Math.round(n).toLocaleString("ko-KR");
  return `청구 ${c(fkNum(o?.청구운임))} · 기사 ${c(fkNum(o?.기사운임))} · 지게차 ${c(fkAmount(o))} · 수익 ${c(orderProfit(o))}`;
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
