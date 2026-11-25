// 📏 2026-11-25 "매출"에 넣는 오더 한 규칙(배차완료 기준) — 모든 화면 · 서버 계산이 같은 매출 · 수익을 내는지
// 실행: node scripts/salesRule.test.mjs
//  규칙 원본: functions/salesRule.mjs(isSalesOrder · fixedSalesRow) — src/salesRule.js 가 다시 내보낸다
//  화면 계산 파일(pastStats · dailyReportCore · monthCompare …)은 firebase 를 가져오는 파일과 엮여 있어
//  esbuild 로 한 파일로 묶고 firebase · 화면 전용 모듈은 빈 껍데기로 바꿔 읽는다(계산만 본다).
import { build } from "esbuild";
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const eq = (a, b, msg) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : fail++; console.log(ok ? "  ✓" : "  ✗", msg, ok ? "" : `→ ${JSON.stringify(a)} 기대 ${JSON.stringify(b)}`); };

// ── 화면 계산 파일 묶기 ──
const entry = `
export * as SR from "./src/salesRule.js";
export * as PS from "./src/pastStats.js";
export * as DR from "./src/dailyReportCore.js";
export * as TR from "./src/teamReportCore.js";
export * as MC from "./src/monthCompare.js";
export * as SC from "./src/salesCore.js";
export * as EA from "./src/execAnalyticsCore.js";
export * as AI from "./src/aiAssistantCore.js";
export * as FC from "./src/forkliftCore.js";
export * as PI from "./src/ProInsight.jsx";
`;
const stub = { name: "stub", setup(b) {
  b.onResolve({ filter: /^firebase(\/.*)?$|\/firebase$|^\.\/firebase$|^kp-firestore-base$|fsTenant$|usageMeter$/ }, (a) => ({ path: a.path, namespace: "stub" }));
  b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "const f = () => P; const P = new Proxy(f, { get: (t, k) => (k === '__esModule' ? false : k === 'then' ? undefined : P), apply: () => P }); module.exports = P;", loader: "js" }));
} };
const out = await build({ stdin: { contents: entry, resolveDir: root, loader: "js" }, bundle: true, platform: "node", format: "esm", write: false, plugins: [stub], logLevel: "silent",
  loader: { ".js": "jsx", ".jsx": "jsx", ".css": "empty", ".png": "empty", ".svg": "empty" }, jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "recharts", "xlsx"] });
// 묶은 파일은 node_modules 안 임시 폴더에 둔다(react 같은 바깥 패키지를 그대로 찾게)
const tmpDir = fs.mkdtempSync(path.join(root, "node_modules", ".salesrule-"));
const tmp = path.join(tmpDir, "bundle.mjs");
fs.writeFileSync(tmp, out.outputFiles[0].text);
const { SR, PS, DR, TR, MC, SC, EA, AI, FC, PI } = await import(pathToFileURL(tmp).href);
const SRV = await import("../functions/salesRule.mjs");
const AR = await import("../functions/arCore.mjs");

// ── 보기 자료(이번 달) ──
const ym = "2026-11";
const d = (n) => `${ym}-${String(n).padStart(2, "0")}`;
const base = { 거래처명: "가", 등록자명: "김", 차량번호: "서울12가3456" };
const orders = [
  { ...base, _id: "A", 상차일: d(3), 배차상태: "배차완료", 청구운임: 500000, 기사운임: 400000 },                                  // 수익 100,000
  { ...base, _id: "B", 상차일: d(3), 배차상태: "배차중", 청구운임: 300000, 기사운임: "", 차량번호: "" },                          // 기사운임 빈 배차중 → 예전엔 수익 300,000으로 부풀었다
  { ...base, _id: "C", 상차일: d(4), 배차상태: "", 청구운임: 200000, 기사운임: "", 차량번호: "" },                                // 미배차
  { ...base, _id: "D", 상차일: d(4), 배차상태: "배차취소", 청구운임: 400000, 기사운임: 300000 },                                  // 취소
  { ...base, _id: "E", 상차일: d(5), 배차상태: "배차완료", 청구운임: 200000, 기사운임: 250000 },                                  // 손실 −50,000
  { ...base, _id: "F", 상차일: d(5), 배차상태: "배차완료", 청구운임: 500000, 기사운임: 400000, source: "transport_transmit" },     // 화주사 사본
  { ...base, _id: "G", 상차일: d(6), 배차상태: "배차완료", 청구운임: 600000, 기사운임: 400000, 지게차비용: 100000, 지게차부담: "청구" }, // 지게차 → 100,000
  { ...base, _id: "H", 상차일: d(6), 배차상태: "배차완료", 청구운임: 330000, 기사운임: 250000, 특수운임: [{ 종류: "수작업", 금액: 30000, 받는사람: "외부", 부담: "청구" }] }, // 외부 특수운임 → 50,000
  { ...base, _id: "I", 상차일: d(7), 배차상태: "배차완료", 상태: "취소", 청구운임: 900000, 기사운임: 100000 },                   // 상태 취소
  { ...base, _id: "J", 상차일: "2026-10-31", 마감월: ym, 배차상태: "배차완료", 청구운임: 100000, 기사운임: 80000 },              // 🗓 이월 — 10/31 상차 · 11월 마감 → 11월 매출(20,000)
];
const fixed = [{ 날짜: d(10), 거래처명: "고정", 청구운임: 1000000, 기사운임: 800000 }]; // 고정거래처 → 200,000
const fixedRows = SR.fixedSalesRows(fixed);
const all = [...orders, ...fixedRows];
// 기대값(배차완료 A · E · G · H + 고정거래처)
const W = { sale: 500000 + 200000 + 600000 + 330000 + 100000 + 1000000, profit: 100000 - 50000 + 100000 + 50000 + 20000 + 200000 }; // 11월 청구월
const WO = { sale: W.sale - 1000000, profit: W.profit - 200000 }; // 고정거래처 없이(오더만 받는 계산)
const J = { sale: 100000, profit: 20000 }; // 이월 오더 — 상차일(10월)로 세는 일 매출 · 기간 표에는 11월에 없다
const WD = { sale: W.sale - J.sale, profit: W.profit - J.profit }; // 11월 "상차일" 기준(일 매출 합)
// 예전 규칙(취소 · 화주사 사본만 뺀 전체 오더, 고정거래처 없음) — 보고용
const oldRows = orders.filter((o) => !SR.isCancelledOrder(o) && o.source !== "transport_transmit");
const oldNov = oldRows.filter((o) => String(o.상차일).startsWith(ym)); // 예전 = 상차일 11월 · 취소 아닌 전체 오더
const OLD = { sale: oldNov.reduce((s, o) => s + FC.fkNum(o.청구운임), 0), profit: oldNov.reduce((s, o) => s + FC.orderProfit(o), 0) };
console.log(`보기 자료(11월): 예전(상차일 · 전체 오더) 매출 ${OLD.sale.toLocaleString()} · 수익 ${OLD.profit.toLocaleString()} → 지금(배차완료 + 고정거래처 · 청구월) 매출 ${W.sale.toLocaleString()} · 수익 ${W.profit.toLocaleString()}`);

// 1) 규칙 자체 · 화면 = 서버 같은 함수
eq(orders.map(SR.isSalesOrder), [true, false, false, false, true, false, true, true, false, true], "isSalesOrder — 배차완료만 · 취소 · 화주사 사본 · 상태 취소 제외");
eq(fixedRows.every(SR.isSalesOrder), true, "고정거래처 줄은 배차완료로 본다");
eq(SR.salesMonthOf(fixedRows[0]), ym, "매출 달 — 고정거래처는 날짜 달");
eq([SR.salesMonthOf(orders[9]), SR.salesBillDateOf(orders[9]), SR.salesMonthOf(orders[0])], [ym, `${ym}-01`, ym], "🗓 매출 달 = 청구월(마감월 우선) · 이월 오더 청구일 = 청구월 1일");
eq(orders.map(SR.salesMonthOf), orders.map(AR.monthOf), "salesMonthOf = arCore.monthOf(미수금 · 회계와 같은 한 정의)");
eq([orders.map(SRV.isSalesOrder), SRV.fixedSalesRows(fixed), SRV.salesTotals(all)], [orders.map(SR.isSalesOrder), fixedRows, SR.salesTotals(all)], "화면(src/salesRule.js) = 서버(functions/salesRule.mjs) 같은 결과");
const T = SR.salesTotals(all);
eq([T.sale, T.profit], [W.sale, W.profit], "salesTotals");

// 2) 매출관리(Settlement) — dispatchData.filter(isSalesOrder) + fixedRows.map(fixedSalesRow), 수익 = 청구 − 기사 − 회사 지급분
const settleRows = [...orders.filter(SR.isSalesOrder).map((r) => ({ ...r, 수수료: FC.orderProfit(r) })), ...fixed.map(SR.fixedSalesRow)];
const st = FC.profitTotals(settleRows.filter((r) => SR.salesMonthOf(r) === ym));
eq([st.sale, st.fee], [W.sale, W.profit], "매출관리 이번 달 매출 · 수익(청구월 — 이월 오더 포함)");
const settleFee = settleRows.reduce((s, r) => s + FC.fkNum(r.수수료), 0);
eq(settleFee, W.profit, "매출관리 수수료 칸 합(monthProfit)");

// 3) 홈 · 경영 브리핑(buildPastStats) — 매출 · 수익은 배차완료 + 고정거래처, 건수는 취소 아닌 오더 전부
const ps = PS.buildPastStats([...oldRows, ...fixedRows], ym);
const pm = Object.values(ps.days).reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]);
eq(PS.sumBill(ps.bill, `${ym}-01`, `${ym}-31`), [W.sale, W.profit], "홈 · 경영 브리핑 이번 달 매출 · 수익(청구월)");
const pd = Object.entries(ps.days).filter(([k]) => k.startsWith(ym)).reduce((a, [, v]) => [a[0] + v[0], a[1] + v[1]], [0, 0]);
eq(pd, [WD.sale, WD.profit], "홈 일별(상차일) 11월 합 — 이월 오더는 10/31 에");
eq(pm[2], oldRows.length, "홈 오더 건수는 그대로(취소 아닌 오더 전부 · 고정거래처는 안 셈)");
eq(Object.values(ps.clients).reduce((s, v) => s + v, 0), W.sale, "홈 거래처 TOP 매출 합");

// 4) 일일 경영 보고(dailyReportCore)
const ag = DR.aggregate(all);
const days = DR.rangeDays(`${ym}-01`, `${ym}-30`);
const sd = DR.sumDays(ag.byDay, days);
eq([sd.sale, sd.profit], [WD.sale, WD.profit], "일일 경영 보고 일 매출 · 수익(상차일)");
eq([sd.all, sd.done, sd.cancel], [oldRows.length - 1, 4, 2], "일일 경영 보고 오더 건수 · 배차완료 · 취소 건수(운영 숫자 그대로 · 상차일)");
const cl = Object.values(ag.byClientDay).reduce((s, m) => s + Object.values(m).reduce((a, v) => a + v[0], 0), 0);
eq(cl, W.sale, "일일 경영 보고 거래처별 매출 합(전체 기간)");
const rk = DR.staffRanking(all, days, [], () => "김", () => false, true);
eq([rk.total, rk.list[0]?.profit], [WO.sale, WO.profit], "일일 경영 보고 · 경영 브리핑 담당자 월 비교(청구월 · 오더만)");
const rep = DR.buildReport({ rows: all, basis: { days: [d(6)], prev1: [d(5)], prev7: [d(3)], end: d(30), start: d(6) } });
eq(rep.month.mtd, W.sale, "일일 경영 보고 월 누계 매출(청구월 — 이월 오더 포함)");
eq(rep.lowOrders.map((r) => r._id), [], "저마진 목록도 배차완료만(미배차 기사운임 빈 오더 제외)");

// 5) 팀 실적(teamReportCore)
const tr = TR.buildTeamReport({ rows: orders, members: [{ name: "김" }], period: { from: `${ym}-01`, to: `${ym}-30`, prevFrom: "2026-10-01", prevTo: "2026-10-31", label: "", prevLabel: "" }, staffOf: () => "김" });
eq([tr.cur.sale, tr.cur.profit, tr.companySale], [WO.sale, WO.profit, WO.sale], "팀 실적 매출 · 수익 · 전사 매출");
eq(tr.risks.unassigned, 1, "팀 실적 미배차(배차중) 건수는 전체 오더로");
eq(tr.risks.lossCount, 1, "팀 실적 역마진 = 배차완료 손실 오더만");

// 6) 월 비교 분석 · 월간 보고(monthCompare)
const mc = MC.analyzeMonths({ rows: [...orders, ...fixedRows], monthA: "2026-10", monthB: ym, scope: "all" });
eq([mc.B.sale, mc.B.profit, mc.A.sale], [W.sale, W.profit, 0], "월 비교 분석 매출 · 수익(청구월 — 이월 오더는 10월이 아니라 11월)");
const sb = MC.statsOf([...orders, ...fixedRows].filter(SR.isSalesOrder));
eq([sb.sale, sb.profit], [W.sale, W.profit], "월간 보고(statsOf · DONE = isSalesOrder)");

// 7) 영업(salesCore) — salesData 가 isSalesOrder 로 불러온 줄
const inc = SC.calcIncentive({ orders: SR.salesRows(orders, fixed), accounts: ["가", "고정"].map((c) => ({ client: c, uid: "u1", since: "2024-01-01" })), policy: { minMargin: -100, useTiers: false, rate: 10 }, uid: "u1", ym });
eq([inc.sale, inc.profit], [W.sale, W.profit], "영업 인센티브 매출 · 매출이익");

// 8) 경영 분석 손익(execAnalyticsCore)
const pl = EA.plMonthly({ rows: [...EA.liveRows(orders), ...fixedRows], fleet: new Map(), ledger: [], recurring: [], months: [ym] })[0];
eq([pl.sale, pl.gross], [W.sale, W.profit], "경영 분석 손익 매출 · 매출총이익");
const ct = EA.clientTable(EA.liveRows(orders), `${ym}-01`, `${ym}-30`, "2026-10-01", "2026-10-31");
eq(ct.reduce((s, c) => s + c.sale, 0), WO.sale - J.sale, "경영 분석 거래처 수익성(최근 N일 · 상차일 기간 표) 매출");

// 9) 인사이트(ProInsight · 모바일 경영인텔리전스 공용)
const ins = orders.filter(PI.isInsightRow);
eq([ins.reduce((s, r) => s + FC.fkNum(r.청구운임), 0), ins.reduce((s, r) => s + FC.orderProfit(r), 0)], [WO.sale, WO.profit], "인사이트 매출 · 수익");

// 10) AI 비서(화면 — 서버 없이 답하기)
const ans = AI.localAnswer("이번달 매출", { dispatches: orders, today: d(20) }) || "";
eq(ans.includes(WO.sale.toLocaleString("ko-KR")) && ans.includes(WO.profit.toLocaleString("ko-KR")), true, "AI 비서(화면) 이번 달 매출 · 수익");

// 11) 서버 — 가짜 Firestore 로 AI 비서 today_summary · sales_summary · 일일 보고 푸시 숫자
const fakeDb = (cols) => {
  const q = (name, conds = [], lim = 1e9) => ({
    where: (f, op, v) => q(name, [...conds, [f, op, v]], lim),
    limit: (n) => q(name, conds, n),
    doc: (id) => ({ get: async () => { const r = (cols[name] || []).find((x) => x._id === id); return { exists: !!r, data: () => r || null, id }; } }),
    get: async () => ({ docs: (cols[name] || []).filter((r) => conds.every(([f, op, v]) => (op === "==" ? r[f] === v : op === ">=" ? String(r[f]) >= v : op === "<=" ? String(r[f]) <= v : true))).slice(0, lim).map((r, i) => ({ id: r._id || `x${i}`, data: () => r })) }),
  });
  return { collection: (name) => q(name) };
};
const CO = "테스트운송";
const withCo = (l) => l.map((r) => ({ ...r, companyName: CO }));
// 미수금 자료 — 예전 회계 합계(acctPayments.ar) + 정본 입금 기록(arPayments)
const arPayments = [{ _id: "p1", company: CO, client: "가", yyyymm: ym, amount: 330000, depositDate: d(15) }];
const acctDoc = { _id: `${CO}__2026`, ar: { 가: 220000 }, log: [] };
const db = fakeDb({ orders: withCo(orders), dispatch: [], fixedClients: withCo(fixed), arPayments, acctPayments: [acctDoc] });
const A = require("../functions/aiAssistant.js");
const ctx = () => ({ db, co: CO, today: d(20), perms: { sales: true, orderRead: true, receivables: true }, isTm: false });
const ss = await A.TOOLS.sales_summary.run(ctx(), { date_from: `${ym}-01`, date_to: d(20) });
eq([ss.합계.sale, ss.합계.profit], [W.sale, W.profit], "서버 AI 비서 sales_summary(배차완료 + 고정거래처)");
const ts = await A.TOOLS.today_summary.run(ctx(), { date: d(3) });
eq([ts.오더수, ts.매출, ts.수익], [2, 500000, 100000], "서버 AI 비서 today_summary — 오더 수는 전체 · 매출 · 수익은 배차완료");
const mk = require("../functions/dailyReport.js");
const dr = mk({ db, FieldValue: {}, sendPushAndCleanup: async () => {}, userTokens: () => [], sendMail: async () => {}, validMail: () => false });
const n = await dr.companyNumbers(CO, d(21), { monday: { merge3: true, weekly: true } });
eq(n.mtd, W.sale, "서버 일일 경영 보고 푸시 월 누계 매출(청구월)");

// 12) 🔗 미수금 — 화면(일일 보고 · 경영 분석 · 경영 브리핑 = src/arPaidLive.js → arPaidByClient) = 회계 · 정산 화면 = 서버 AI 비서
const coOrders = withCo(orders);
const paidScreen = AR.arPaidByClient({ orders: coOrders, arPayments, acct: { ar: acctDoc.ar, log: [] }, year: "2026" });
const recScreen = AR.receivablesOf({ orders: coOrders, fixedRows: withCo(fixed), paid: paidScreen, today: d(20), year: "2026" });
const arSrv = await A.TOOLS.receivables.run(ctx(), {});
const outScreen = recScreen.filter((x) => x.outstanding > 0).reduce((s, x) => s + x.outstanding, 0);
eq(arSrv.미수금합계, outScreen, "미수금 합계 — 서버 AI 비서 = 화면(회계 · 정산과 같은 arPaidByClient)");
eq(paidScreen.가 > 220000, true, "받은 돈에 정본 입금 기록(arPayments)도 들어간다(예전엔 acctPayments.ar 220,000만 봤다)");
const oldOut = AR.receivablesOf({ orders: coOrders, fixedRows: withCo(fixed), paid: acctDoc.ar, today: d(20), year: "2026" }).reduce((s, x) => s + x.outstanding, 0);
console.log(`  미수금: 예전(acctPayments.ar 만) ${oldOut.toLocaleString()} → 지금(arPaidByClient) ${outScreen.toLocaleString()}`);

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`매출 한 규칙(salesRule) 테스트: 통과 ${pass} · 실패 ${fail}`);
if (fail) process.exit(1);
