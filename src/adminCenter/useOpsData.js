// ======================= src/adminCenter/useOpsData.js =======================
// 🛰 2026-11-18 관리자센터 — 실시간 트래픽 · 운송사별 사용량 · 초과분 · 운영 비용을 한 번에 모은다.
//  이미 쌓이는 데이터만 쓴다(새로 기록하는 것 없음):
//   · 접속: loginSessions(5분 하트비트 → usePlatformLive) · sessionLogs(로그인 이벤트, 7일 보관)
//   · 서버 사용량: platformUsage/{날짜}(구글 클라우드 실측, 1시간마다) · platformUsage/m_{월}(AI · OCR 토큰 카운터)
//   · 회사별: siteConfig/platformStats(오더 · 직원 · 지입차 · 저장 용량) · usageCounters(앱 표본 읽기/쓰기) · messageUsage(문자 · 알림톡)
//   · 비용: platformConfig/costModel(단가 · 고정비 · 💳 실제 결제 내역 payments) — 계산은 CostPanel 의 useCostData 와 같다
//     실제 결제가 있는 달은 그 예상 줄(Claude 구독 · Vercel · 서버비 · AI 사용량 등)을 0원으로 바꾸고 결제 금액을 더한다(이중 계산 없음)
//  ⚠ 분 단위 읽기/쓰기, Vercel · 지도 API 호출 수, 각 업체 실제 청구서는 어디에도 기록되지 않는다 → 화면에 "추정"으로 표시.
import React from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useCostData } from "../CostPanel";
import { usePlatformLive } from "../PlatformLive";
import { variableCosts, ledgerMonth, applyLedger, mergeCost } from "../costModel";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// Claude 단가(USD / 100만 토큰) — 화면 표시용 어림값(AiTeamPanel 과 같은 값)
export const AI_PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
export const aiUsd = (u) => (u ? (num(u.input) * AI_PRICE.input + num(u.output) * AI_PRICE.output + num(u.cacheRead) * AI_PRICE.cacheRead + num(u.cacheWrite) * AI_PRICE.cacheWrite) / 1e6 : 0);

export const isAdminDemo = () => { try { return !!window.__kpAdminDemo; } catch { return false; } };

function useLive(make, deps, on = true) {
  const [v, setV] = React.useState(null);
  React.useEffect(() => {
    if (!on) return undefined;
    return onSnapshot(make(), (s) => setV(s.docs ? s.docs.map((d) => ({ id: d.id, ...d.data() })) : (s.exists() ? s.data() : {})), () => setV(s0(make)));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}
const s0 = () => []; // 권한 없음 · 오류 → 빈 값

export function useOpsData() {
  const demo = isAdminDemo();
  const { data: cost, model } = useCostData();
  const live = usePlatformLive();
  const ym = kstToday().slice(0, 7);
  const since = React.useMemo(() => new Date(Date.now() - 24 * 3600e3), []);
  const logins = useLive(() => query(collection(db, "sessionLogs"), where("at", ">=", since), orderBy("at", "desc"), limit(1500)), [since], !demo);
  const usage30 = useLive(() => query(collection(db, "platformUsage"), orderBy("date", "desc"), limit(31)), [], !demo);
  const msgs = useLive(() => query(collection(db, "messageUsage"), where("month", "==", ym)), [ym], !demo);
  const aiLogs = useLive(() => query(collection(db, "aiTeamLogs"), orderBy("at", "desc"), limit(400)), [], !demo);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  return React.useMemo(() => {
    if (demo) return buildDemo();
    if (!cost || !live) return null;
    const now = Date.now();
    const today = cost.today;
    const kNow = new Date(now + 9 * 3600e3);
    const minsToday = kNow.getUTCHours() * 60 + kNow.getUTCMinutes() + 1;

    // ── 트래픽 ──
    const hourly = Array.from({ length: 24 }, (_, i) => { const t = new Date(now - (23 - i) * 3600e3 + 9 * 3600e3); return { h: `${String(t.getUTCHours()).padStart(2, "0")}시`, key: Math.floor((now - (23 - i) * 3600e3) / 3600e3), logins: 0, people: new Set() }; });
    (logins || []).forEach((l) => {
      if (l.event && l.event !== "login") return;
      const at = tsMs(l.at); if (!at) return;
      const k = Math.floor(at / 3600e3); const b = hourly.find((x) => x.key === k); if (!b) return;
      b.logins += 1; b.people.add(l.uid || l.email || l.id);
    });
    const days = (usage30 || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.id)).sort((a, b) => a.id.localeCompare(b.id));
    const td = days.find((d) => d.id === today) || null;
    const updMs = num(td?.updatedAtMs);
    const minsAt = updMs ? (() => { const k = new Date(updMs + 9 * 3600e3); return k.getUTCHours() * 60 + k.getUTCMinutes() + 1; })() : minsToday;
    const perMin = (v) => (td ? num(v) / Math.max(1, minsAt) : 0);
    const fx = num(model?.fx) * (1 + num(model?.usdTaxPct) / 100);
    const dayCost = (d) => variableCosts(model, [d], { billDays: 1, fnCalls: num(d.fnCalls), egressGb: num(d.egressBytes) / 1e9 }).total;
    const traffic = {
      onlineNow: live.totals?.onlineNow || 0, online24h: live.totals?.online24h || 0, pcNow: live.totals?.pcNow || 0, mobileNow: live.totals?.mobileNow || 0,
      shipperNow: live.totals?.shipperNow || 0, people: live.onlineList || [],
      hourly: hourly.map((b) => ({ h: b.h, logins: b.logins, people: b.people.size })),
      loginsToday: (logins || []).filter((l) => (!l.event || l.event === "login") && new Date(tsMs(l.at) + 9 * 3600e3).toISOString().slice(0, 10) === today).length,
      today: td ? { reads: num(td.reads), writes: num(td.writes), deletes: num(td.deletes), fn: num(td.fnCalls), egressGb: num(td.egressBytes) / 1e9, partial: !!td.partial, updatedAtMs: updMs } : null,
      readsPerMin: perMin(td?.reads), writesPerMin: perMin(td?.writes),
      days: days.slice(-30).map((d) => ({ d: d.id.slice(5).replace("-", "."), reads: num(d.reads), writes: num(d.writes), fn: num(d.fnCalls), krw: dayCost(d) })),
      free: { read: num(model?.fs?.freeRead), write: num(model?.fs?.freeWrite) },
      measured: cost.source === "measured", status: cost.status || null,
      storageGb: num(cost.fsGib) + num(cost.gcsGb),
    };

    // ── AI 사용(운영자 주머니에서 나가는 Anthropic API) ──
    const md = cost.monthDoc || {};
    const scanTok = { input: md.scanAiInTok, output: md.scanAiOutTok, cacheRead: md.scanAiCacheReadTok, cacheWrite: md.scanAiCacheWriteTok };
    const chatTok = { input: md.aiChatInTok, output: md.aiChatOutTok, cacheRead: md.aiChatCacheReadTok, cacheWrite: md.aiChatCacheWriteTok };
    const monthStart = new Date(`${ym}-01T00:00:00+09:00`).getTime();
    const teamLogs = (aiLogs || []).filter((l) => tsMs(l.at) >= monthStart);
    const teamUsd = teamLogs.reduce((a, l) => a + aiUsd(l.usage), 0);
    const ai = { scanUsd: aiUsd(scanTok), chatUsd: aiUsd(chatTok), teamUsd, scanCalls: num(md.scanAiCalls), chatTurns: num(md.aiChatTurns), teamQs: teamLogs.length };
    ai.usd = ai.scanUsd + ai.chatUsd + ai.teamUsd;
    ai.krw = ai.usd * fx;

    // ── 운영 비용(월말 예상 · 지금까지) — 예상(단가 × 사용량) + 💳 실제 결제 ──
    const ledger = cost.ledger || ledgerMonth(model, ym, { day: cost.dayNo });
    const varRows = (cost.variable?.rows || []).map((r) => ({ ...r, est: cost.source !== "measured" || ["tmap", "etax", "msg"].includes(r.key) }));
    const fixRows = (cost.fixed?.rows || []).filter((r) => !r.off && (r.krw > 0 || (r.replaced && r.modelKrw > 0)));
    const aiReplaced = ledger.replaced.has("aiApi");
    const aiModel = ai.krw * (cost.dim / Math.max(1, cost.dayNo));
    const aiRow = { key: "aiApi", group: "AI (Claude API)", label: "AI 비서 · 오더 인식 · AI 팀", krw: aiReplaced ? 0 : aiModel, est: true, ...(aiReplaced ? { replaced: true, modelKrw: aiModel } : {}) };
    const payRows = ledger.rows.map((r) => ({ ...r, est: false }));
    const groups = {};
    [...varRows, aiRow, ...fixRows, ...payRows].forEach((r) => { groups[r.group] = (groups[r.group] || 0) + num(r.krw); });
    const byGroup = Object.entries(groups).map(([group, krw]) => ({ group, krw })).filter((x) => x.krw > 0.5).sort((a, b) => b.krw - a.krw);
    const totalMonth = byGroup.reduce((a, x) => a + x.krw, 0);
    const mtdVar = cost.varMtdShown ? cost.varMtdShown.total : num(cost.variable?.total) * (cost.dayNo / cost.dim);
    const mtd = mtdVar + num(cost.fixed?.total) * (cost.dayNo / cost.dim) + (aiReplaced ? 0 : ai.krw) + ledger.mtd;
    const opsCost = {
      totalMonth, mtd, perDay: totalMonth / Math.max(1, cost.dim), byGroup, varRows, fixRows, aiRow, payRows,
      server: num(cost.variable?.total), fixed: num(cost.fixed?.total), paid: ledger.total, paidMtd: ledger.mtd, revenue: num(cost.revenue), free: cost.revenue <= 0,
      source: cost.source, dim: cost.dim, dayNo: cost.dayNo, fx, ym, model,
    };

    // ── 운송사별 사용량 · 초과 ──
    const msgMap = {}; (msgs || []).forEach((m) => { msgMap[m.company] = m; });
    const msgP = model?.msg || {};
    const carriers = (cost.cos || []).map((r) => {
      const u = r.bill?.usage || null; const p = u?.plan || null; const m = msgMap[r.name] || {};
      const lc = live.companies?.[r.name] || {};
      const sms = num(m.sms), lms = num(m.lms), alim = num(m.alimtalk);
      return {
        name: r.name, planId: r.planId, planName: p?.name || "", onlineNow: lc.onlineNow || 0,
        staff: r.act.staff, seatLimit: num(p?.seats), orders: r.act.ordersMonth, orderLimit: num(p?.orders), fleet: r.act.fleet,
        storageGB: r.act.storageGB, limitGB: num(u?.limitGB), reads: num(r.reads), writes: num(r.writes), sampled: !!r.ctr,
        sms, lms, alimtalk: alim, msgCost: sms * num(msgP.sms) + lms * num(msgP.lms) + alim * num(msgP.alimtalk),
        over: num(u?.over), extra: u?.extra || null, fee: u?.fee || null,
        server: num(r.server), direct: num(r.direct), costTotal: num(r.server) + num(r.direct),
      };
    }).sort((a, b) => b.costTotal - a.costTotal || b.orders - a.orders);
    return { demo: false, ready: true, traffic, ai, opsCost, carriers, live, tick };
  }, [demo, cost, model, live, logins, usage30, msgs, aiLogs, ym, tick]);
}

// ═══════════════════════ 화면 점검용 가짜 데이터(개발 /preview-admin 전용) ═══════════════════════
export const DEMO_PAYMENTS = (ym) => [
  { id: "demo1", date: `${ym}-03`, endDate: "", vendor: "Anthropic", item: "Claude Max 업그레이드", amount: 100, currency: "USD", kind: "monthly", group: "개발 도구", replaces: "claude", memo: "" },
  { id: "demo2", date: `${ym}-01`, endDate: "", vendor: "Google AI Studio", item: "Gemini API 크레딧 충전", amount: 8000, currency: "KRW", kind: "prepaid", group: "AI (Gemini API)", replaces: "", memo: "교육 영상 목소리" },
];
function buildDemo() {
  const today = kstToday(); const dim = 30; const dayNo = Number(today.slice(8));
  const rnd = (s) => { const x = Math.sin(s * 9301 + 49297) * 233280; return x - Math.floor(x); };
  const names = ["한빛물류", "대성운송", "제일로지스", "서울화물", "동해익스프레스", "세광통운", "미래트랜스", "그린로지텍"];
  const plans = [["pro", "프로", 30, 8000, 50], ["standard", "스탠다드", 15, 3000, 20], ["standard", "스탠다드", 15, 3000, 20], ["basic", "베이직", 8, 1500, 10], ["basic", "베이직", 8, 1500, 10], ["lite", "라이트", 3, 500, 5], ["lite", "라이트", 3, 500, 5], ["", "", 0, 0, 0]];
  const carriers = names.map((name, i) => {
    const [planId, planName, seatLimit, orderLimit, limitGB] = plans[i];
    const staff = Math.round(seatLimit * (0.6 + rnd(i + 1) * 0.7)) || 4;
    const orders = Math.round((orderLimit || 900) * (0.45 + rnd(i + 7) * 0.8));
    const storageGB = Math.round((limitGB || 6) * (0.3 + rnd(i + 3) * 0.95) * 10) / 10;
    const ex = { seats: Math.max(0, staff - seatLimit), orders: Math.max(0, orders - orderLimit), fleet: 0, storageGB: Math.max(0, Math.ceil(storageGB - limitGB)) };
    const fee = { seats: ex.seats * 15000, orders: ex.orders * 50, fleet: 0, storage: ex.storageGB * 3000 };
    const reads = Math.round(orders * 210 + staff * 3800 * dayNo * (0.6 + rnd(i) * 0.5));
    const writes = Math.round(orders * 9 + staff * 140 * dayNo);
    const server = reads / 1e5 * 0.06 * 1540 + writes / 1e5 * 0.18 * 1540 + storageGB * 220;
    const sms = Math.round(rnd(i + 11) * 400), alimtalk = Math.round(rnd(i + 13) * 900), lms = Math.round(rnd(i + 17) * 120);
    const msgCost = sms * 20 + lms * 50 + alimtalk * 13;
    return { name, planId, planName, onlineNow: Math.round(rnd(i + 5) * staff * 0.7), staff, seatLimit, orders, orderLimit, fleet: i < 3 ? Math.round(rnd(i) * 12) : 0, storageGB, limitGB, reads, writes, sampled: i < 5, sms, lms, alimtalk, msgCost,
      over: planId ? fee.seats + fee.orders + fee.storage : 0, extra: planId ? ex : null, fee: planId ? fee : null, server, direct: msgCost, costTotal: server + msgCost };
  }).sort((a, b) => b.costTotal - a.costTotal);
  const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.now() - (29 - i) * 86400e3 + 9 * 3600e3).toISOString().slice(5, 10).replace("-", "."); const w = (i % 7 === 5 || i % 7 === 6) ? 0.45 : 1; const reads = Math.round((520000 + i * 9000) * w * (0.85 + rnd(i) * 0.3)); const writes = Math.round(reads * 0.045); return { d, reads, writes, fn: Math.round(reads * 0.02), krw: Math.max(0, (reads - 50000) / 1e5 * 0.06 * 1540 + Math.max(0, writes - 20000) / 1e5 * 0.18 * 1540) }; });
  const kNow = new Date(Date.now() + 9 * 3600e3); const mins = kNow.getUTCHours() * 60 + kNow.getUTCMinutes() + 1;
  const hourly = Array.from({ length: 24 }, (_, i) => { const hh = (kNow.getUTCHours() - 23 + i + 24) % 24; const work = hh >= 7 && hh <= 19 ? 1 : hh >= 5 && hh <= 22 ? 0.35 : 0.05; const v = Math.round((10 + rnd(i + 2) * 26) * work); return { h: `${String(hh).padStart(2, "0")}시`, logins: v, people: Math.max(0, Math.round(v * 0.8)) }; });
  const traffic = {
    onlineNow: 37, online24h: 118, pcNow: 24, mobileNow: 15, shipperNow: 4, people: [],
    hourly, loginsToday: hourly.slice(-kNow.getUTCHours() - 1).reduce((a, b) => a + b.logins, 0),
    today: { reads: Math.round(612000 * mins / 1440), writes: Math.round(27100 * mins / 1440), deletes: 820, fn: 9100, egressGb: 0.42, partial: true, updatedAtMs: Date.now() - 22 * 60e3 },
    readsPerMin: 425, writesPerMin: 19, days, free: { read: 50000, write: 20000 }, measured: true, status: { ok: true }, storageGb: 7.8,
  };
  const ai = { scanUsd: 6.4, chatUsd: 11.2, teamUsd: 4.1, scanCalls: 312, chatTurns: 845, teamQs: 57 }; ai.usd = ai.scanUsd + ai.chatUsd + ai.teamUsd; ai.krw = ai.usd * 1540;
  // 💳 예시 결제 내역 — 이달 Claude 구독 업그레이드(예상 Claude 줄 대신) · Gemini API 충전
  const ym = today.slice(0, 7);
  const model = mergeCost({ fx: 1400, usdTaxPct: 10, payments: DEMO_PAYMENTS(ym) });
  const ledger = ledgerMonth(model, ym, { day: dayNo });
  const payRows = ledger.rows.map((r) => ({ ...r, est: false }));
  const byGroup0 = [["Firestore", 214000], ["AI (Claude API)", Math.round(ai.krw * dim / dayNo)], ["호스팅", 30800], ["Cloud Functions", 18200], ["문자 · 알림톡", carriers.reduce((a, c) => a + c.msgCost, 0)], ["Cloud Storage", 9400], ["앱 마켓", 14300], ["글자 인식", 3100]];
  const groups = {}; byGroup0.forEach(([g, k]) => { groups[g] = k; }); payRows.forEach((r) => { groups[r.group] = (groups[r.group] || 0) + r.krw; });
  const byGroup = Object.entries(groups).map(([group, krw]) => ({ group, krw })).sort((a, b) => b.krw - a.krw);
  const totalMonth = byGroup.reduce((a, x) => a + x.krw, 0);
  const opsCost = { totalMonth, mtd: (totalMonth - ledger.total) * dayNo / dim + ledger.mtd, perDay: totalMonth / dim, byGroup, varRows: [], fixRows: [], aiRow: null, payRows, server: 241600, fixed: 44100, paid: ledger.total, paidMtd: ledger.mtd, revenue: 0, free: true, source: "measured", dim, dayNo, fx: 1540, ym, model };
  return { demo: true, ready: true, traffic, ai, opsCost, carriers, live: null, tick: 0 };
}
