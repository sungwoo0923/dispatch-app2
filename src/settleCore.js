// ======================= src/settleCore.js =======================
// 🧭 2026-11-14 정산 홈 계산(순수 함수) — 화면은 src/SettleHome.jsx · 테스트 scripts/settleHome.test.mjs
//  명세서 단계 순서는 src/SettleDesk.jsx STMT_STAGES 와 같다(미작성 → 작성 → 발송 → 확인 → 계산서요청 → 계산서발행 → 마감)
import { paidOut } from "./forkliftCore.js"; // ⭐ 2026-11-17 회사가 따로 지급(지게차·외부 특수운임) — functions/profitCore.mjs
const STAGE_ORDER = ["미작성", "작성", "발송", "확인", "계산서요청", "계산서발행", "마감"];
export const stageIdx = (k) => Math.max(0, STAGE_ORDER.indexOf(k));
export const n = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
export const won = (v) => Math.round(v || 0).toLocaleString("ko-KR");
export const short = (v) => { const a = Math.abs(v || 0); return a >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : a >= 1e4 ? `${Math.round(v / 1e4).toLocaleString("ko-KR")}만` : won(v); };
export const monthOf = (o) => String(o?.마감월 || "").slice(0, 7) || String(o?.상차일 || "").slice(0, 7);
export const kstYm = (off = 0) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + off); return d.toISOString().slice(0, 7); };
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
const isCancel = (o) => o?.배차상태 === "배차취소" || ["취소", "배차취소", "오더취소", "취소됨"].includes(o?.상태);

// 거래처 × 월 명세서 단계 찾기(arDesk stmts 의 키 = "사업자|거래처|YYYYMM")
export function stageFinder(stmts) {
  const m = new Map();
  (stmts ? [...stmts.values()] : []).forEach((d) => { const k = `${d.client}|${String(d.yyyymm || "").replace("-", "")}`; const cur = m.get(k); if (!cur || stageIdx(d.stage) > stageIdx(cur)) m.set(k, d.stage || "미작성"); });
  return (client, ym) => m.get(`${client}|${String(ym).replace("-", "")}`) || "미작성";
}

// ── 계산(순수 함수) ──────────────────────────────────────────────
//  orders: 오더 목록 · ym: "YYYY-MM" · stageOf(client, ym) → 명세서 단계 · today: "YYYY-MM-DD"
export function summarizeSettle(orders, ym, stageOf = () => "미작성", today = kstToday()) {
  const rows = (orders || []).filter((o) => !isCancel(o) && o?.source !== "transport_transmit");
  const mine = rows.filter((o) => monthOf(o) === ym);
  const billable = mine.filter((o) => n(o.청구운임) > 0 && String(o.거래처명 || "").trim());
  // 거래처별
  const byClient = new Map();
  billable.forEach((o) => { const c = String(o.거래처명).trim(); const x = byClient.get(c) || { client: c, count: 0, sale: 0, paid: 0 }; x.count += 1; x.sale += n(o.청구운임); if (o.입금상태 === "입금완료") x.paid += n(o.청구운임); byClient.set(c, x); });
  const clients = [...byClient.values()].map((x) => ({ ...x, stage: stageOf(x.client, ym) })).sort((a, b) => b.sale - a.sale);
  const idx = (c) => stageIdx(c.stage);
  const total = clients.length;
  const sumOf = (list) => list.reduce((a, c) => a + c.sale, 0);
  // ① 오더 확정 — 이 달 오더 중 운임이 비었거나 아직 배차가 안 된 것
  const noFare = mine.filter((o) => n(o.청구운임) <= 0 && !/유류|지원/.test(String(o.화물내용 || "")) && o.지급방식 !== "착불");
  const unassigned = mine.filter((o) => o.배차상태 === "배차중");
  // ② 명세서 발송 전 ③ 계산서 발행 전 ⑥ 마감 전
  const needSend = clients.filter((c) => idx(c) < 1); // 🧾 2026-11-16 발송은 순서에서 뺐다 — 명세서 작성 여부로 본다
  const needTax = clients.filter((c) => idx(c) < 5);
  const needClose = clients.filter((c) => idx(c) < 6);
  // ④ 입금 — 마감한 거래처는 받은 것으로 본다(입금 확인을 안 쓰는 회사)
  const unpaidOf = (c) => (idx(c) >= 6 ? 0 : Math.max(0, c.sale - c.paid));
  const unpaidClients = clients.filter((c) => unpaidOf(c) > 0);
  // ⑤ 기사 지급
  const payable = mine.filter((o) => n(o.기사운임) > 0);
  const unpaidDrv = payable.filter((o) => (o.지급상태 || "지급중") !== "지급완료");
  const steps = [
    { key: "orders", label: "오더 확정", go: "거래처정산", total: mine.length, left: new Set([...noFare, ...unassigned].map((o) => o._id || o.id || o)).size, unit: "건", hint: `운임 미입력 ${noFare.length} · 미배차 ${unassigned.length}`, amount: 0 },
    { key: "send", label: "명세서 작성", go: "거래처정산", total, left: needSend.length, unit: "곳", hint: "미작성", amount: sumOf(needSend) },
    { key: "tax", label: "계산서 발행", go: "거래처정산", total, left: needTax.length, unit: "곳", hint: "미발행", amount: sumOf(needTax) },
    { key: "deposit", label: "입금 확인", go: "입금확인", total, left: unpaidClients.length, unit: "곳", hint: "미입금", amount: unpaidClients.reduce((a, c) => a + unpaidOf(c), 0) },
    { key: "payout", label: "기사 지급", go: "지급관리", total: payable.length, left: unpaidDrv.length, unit: "건", hint: "미지급", amount: unpaidDrv.reduce((a, o) => a + n(o.기사운임), 0) },
    { key: "close", label: "마감", go: "거래처정산", total, left: needClose.length, unit: "곳", hint: "미마감", amount: sumOf(needClose) },
  ];
  // ⭐ 2026-11-17 매입 = 기사운임 + 회사가 따로 지급(지게차·외부 특수운임) → 매출이익 = 청구 − 기사 − 지게차 등(배차표 수수료와 같은 식)
  const drv = payable.reduce((a, o) => a + n(o.기사운임), 0), paid = mine.reduce((a, o) => a + paidOut(o), 0);
  const sale = sumOf(clients), buy = drv + paid;
  // 미수 경과(전체 기간) — 입금 안 됐고 그 달을 마감하지 않은 청구
  const aging = new Map();
  rows.forEach((o) => {
    const c = String(o.거래처명 || "").trim(); const s = n(o.청구운임); const d = String(o.상차일 || "");
    if (!c || s <= 0 || !d || o.입금상태 === "입금완료" || stageIdx(stageOf(c, monthOf(o))) >= 6) return;
    const age = daysBetween(d, today); if (age < 0) return;
    const x = aging.get(c) || { client: c, d30: 0, d60: 0, d90: 0, over: 0, total: 0 };
    if (age <= 30) x.d30 += s; else if (age <= 60) x.d60 += s; else if (age <= 90) x.d90 += s; else x.over += s;
    x.total += s; aging.set(c, x);
  });
  return { ym, steps, clients, sale, buy, drv, paid, profit: sale - buy, aging: [...aging.values()].sort((a, b) => (b.over + b.d90) - (a.over + a.d90) || b.total - a.total) };
}
// 거래처 원장 — 달마다 청구 · 입금 · 잔액(오래된 달부터 잔액을 쌓는다)
export function clientLedger(orders, client, stageOf = () => "미작성") {
  const m = new Map();
  (orders || []).forEach((o) => { if (isCancel(o) || String(o.거래처명 || "").trim() !== client || n(o.청구운임) <= 0) return; const ym = monthOf(o); if (!ym) return; const x = m.get(ym) || { ym, count: 0, sale: 0, paid: 0 }; x.count += 1; x.sale += n(o.청구운임); if (o.입금상태 === "입금완료") x.paid += n(o.청구운임); m.set(ym, x); });
  let bal = 0;
  return [...m.values()].sort((a, b) => a.ym.localeCompare(b.ym)).map((x) => { const stage = stageOf(client, x.ym); const paid = stageIdx(stage) >= 6 ? x.sale : x.paid; bal += x.sale - paid; return { ...x, paid, stage, balance: bal }; });
}


// ── 🧾 2026-11-17 청구 현황판 — 미청구 · 청구완료 · 입금완료(지급완료)를 화주사(명세서 단위) + 개별오더(OUT 콜) 한 번에 ──────────
//  받을 돈(mode "ar"):
//   · 화주사 = 거래처 × 정산월 한 줄(OUT 콜이 아닌 오더). 명세서 단계(viewStage) 마감 또는 다 입금 → 입금완료 / 계산서발행 → 청구완료 / 그 외 → 미청구
//   · 개별오더 = OUT 콜(외부 콜을 잡은 오더) 한 건씩. 입금상태 입금완료 → 입금완료 / 계산서일 있음 → 청구완료 / 그 외 → 미청구
//  줄 돈(mode "ap"): 기사운임이 있는 오더 한 건씩. 지급완료 → 지급완료 / 계산서일(기사 계산서 받음) → 청구받음 / 그 외 → 미청구
//  stageOf(client, ym) → "미작성" | "작성" | "계산서발행" | "마감" (화면 단계)
export const BILL_STATUS = { unbilled: "미청구", billed: "청구완료", paid: "입금완료" };
export const PAY_STATUS = { unbilled: "계산서 전", billed: "계산서 받음", paid: "지급완료" };
const outCall = (o) => o?.콜구분 === "OUT" || o?.콜구분 === "잡은콜";
const inRange = (ym, from, to) => !!ym && (!from || ym >= from) && (!to || ym <= to);
export function billingBoard(orders, { from = "", to = "", mode = "ar", stageOf = () => "미작성" } = {}) {
  const rows = (orders || []).filter((o) => !isCancel(o) && o?.source !== "transport_transmit" && inRange(monthOf(o), from, to));
  const items = [];
  if (mode === "ap") {
    rows.forEach((o) => {
      const amt = n(o.기사운임); if (amt <= 0) return;
      const status = o.지급상태 === "지급완료" ? "paid" : o.계산서일 ? "billed" : "unbilled";
      items.push({ kind: "order", key: `ap:${o._id || o.id}`, order: o, client: String(o.기사명 || o.차량번호 || "기사 미정").trim(), sub: String(o.거래처명 || "").trim(), ym: monthOf(o), date: String(o.상차일 || ""), count: 1, amount: amt, vat: Math.round(amt * 1.1), paid: status === "paid" ? amt : 0, status, note: status === "paid" ? String(o.지급일 || "") : o.계산서일 ? `계산서 ${o.계산서일}` : "" });
    });
  } else {
    const groups = new Map();
    rows.forEach((o) => {
      const c = String(o.거래처명 || "").trim(); const amt = n(o.청구운임); if (!c || amt <= 0) return;
      if (outCall(o)) {
        const status = o.입금상태 === "입금완료" ? "paid" : o.계산서일 ? "billed" : "unbilled";
        items.push({ kind: "order", key: `o:${o._id || o.id}`, order: o, client: c, ym: monthOf(o), date: String(o.상차일 || ""), count: 1, amount: amt, vat: Math.round(amt * 1.1), paid: status === "paid" ? amt : 0, status, note: status === "paid" ? String(o.입금일 || "") : o.계산서일 ? `계산서 ${o.계산서일}` : "" });
        return;
      }
      const ym = monthOf(o); const k = `${c}|${ym}`;
      const g = groups.get(k) || { kind: "client", key: `c:${k}`, client: c, ym, date: "", count: 0, amount: 0, paid: 0, orders: [] };
      g.count += 1; g.amount += amt; if (o.입금상태 === "입금완료") g.paid += amt; g.orders.push(o); groups.set(k, g);
    });
    groups.forEach((g) => {
      const st = stageOf(g.client, g.ym);
      const status = st === "마감" || (g.amount > 0 && g.paid >= g.amount) ? "paid" : st === "계산서발행" ? "billed" : "unbilled";
      items.push({ ...g, vat: Math.round(g.amount * 1.1), stage: st, status, note: status === "billed" && g.paid > 0 ? `부분입금 ${won(g.paid)}` : st === "작성" ? "명세서 작성" : "" });
    });
  }
  const order = { unbilled: 0, billed: 1, paid: 2 };
  items.sort((a, b) => order[a.status] - order[b.status] || a.ym.localeCompare(b.ym) || b.amount - a.amount);
  const sum = (st) => { const l = items.filter((x) => x.status === st); return { count: l.length, orders: l.reduce((a, x) => a + x.count, 0), amount: l.reduce((a, x) => a + x.amount, 0), vat: l.reduce((a, x) => a + x.vat, 0) }; };
  return { items, totals: { unbilled: sum("unbilled"), billed: sum("billed"), paid: sum("paid") } };
}
