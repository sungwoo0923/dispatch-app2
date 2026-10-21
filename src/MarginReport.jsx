// ======================= src/MarginReport.jsx =======================
// ⭐ 매익률 원인 보고서(2026-10-21 요청) — "매출은 크게 늘었는데 이익은 왜 그대로인가"를 전월/당월 비교로 보여준다.
// 매출관리와 같은 데이터(배차완료 오더 + 고정거래처)로 두 달을 나란히 비교한다.
//  - 핵심: 전월 매익률을 유지했다면 당월 이익은 얼마였어야 하는지 → 실제와의 차이(덜 남은 이익)
//  - 덜 남은 이익을 오더 구분(손실·수수료 0%·청구 0원·미배차 페널티·저마진 …)과 거래처별로 나눠서 보여준다.
//    덜 남은 이익 = 매출 증감 × 전월 매익률 − 이익 증감 (모두 더하면 전체 덜 남은 이익과 정확히 같다)
//  - 엑셀: 요약 / 구분별 비교 / 거래처별 비교 / 일자별 상세(당월·전월) / 손실 건 / 수수료 0% 건 / 미배차 페널티 건 / 기타
import React from "react";
import * as XLSX from "xlsx";

const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const pct = (profit, sale) => (sale ? Math.round((profit / sale) * 1000) / 10 : 0);
const won = (n) => `${Math.round(n || 0).toLocaleString()}원`;
const man = (n) => `${Math.round((n || 0) / 10000).toLocaleString()}만원`;
const signWon = (n) => `${n > 0 ? "▲" : n < 0 ? "▼" : ""}${won(Math.abs(n))}`;
const PENALTY_RE = /페널티|패널티|penalty|미배차/i;
const memoOf = (r) => [r.메모, r.적요, r.전달사항, r.비고, r.특이사항].filter(Boolean).join(" / ");
const mLabel = (k) => `${Number(String(k).slice(5))}월`;

// 오더 구분 — 한 오더는 한 구분에만 들어간다(위에서부터 먼저 걸리는 것)
const SEGMENTS = ["미배차 페널티", "청구운임 0원", "마이너스 손실", "수수료 0%", "저마진(5% 미만)", "보통(5~10%)", "정상(10% 이상)"];
const BAD_SEGMENTS = ["미배차 페널티", "청구운임 0원", "마이너스 손실", "수수료 0%"];

function classify(r) {
  const sale = toInt(r.청구운임);
  const driver = toInt(r.기사운임);
  const profit = sale - driver;
  const rate = pct(profit, sale);
  let seg;
  if (PENALTY_RE.test(memoOf(r))) seg = "미배차 페널티";
  else if (sale === 0) seg = "청구운임 0원";
  else if (profit < 0) seg = "마이너스 손실";
  else if (profit === 0) seg = "수수료 0%";
  else if (rate < 5) seg = "저마진(5% 미만)";
  else if (rate < 10) seg = "보통(5~10%)";
  else seg = "정상(10% 이상)";
  const tags = [seg];
  if (String(r.배차방식 || "").includes("외부")) tags.push("외부업체 배차");
  if (driver === 0 && sale > 0) tags.push("기사운임 0원");
  return { sale, driver, profit, rate, seg, tags };
}

function summarize(list) {
  const s = { cnt: list.length, sale: 0, driver: 0, profit: 0 };
  list.forEach((r) => { const c = classify(r); s.sale += c.sale; s.driver += c.driver; s.profit += c.profit; });
  s.rate = pct(s.profit, s.sale);
  return s;
}

// a=전월, b=당월 요약 → 증감과 "덜 남은 이익"(전월 전체 매익률 기준)
const compare = (a, b, baseRate) => ({
  prev: a, cur: b,
  dSale: b.sale - a.sale,
  dProfit: b.profit - a.profit,
  dRate: Math.round((b.rate - a.rate) * 10) / 10,
  gap: Math.round((b.sale - a.sale) * (baseRate / 100) - (b.profit - a.profit)),
});

export function buildMarginReport(rows, monthKey, prevKey, { pureOnly, isExcluded }) {
  const base = rows.filter((r) => !pureOnly || !isExcluded?.(r.거래처명));
  const cur = base.filter((r) => String(r.상차일 || "").startsWith(monthKey));
  const prev = base.filter((r) => String(r.상차일 || "").startsWith(prevKey));
  const P = summarize(prev);
  const C = summarize(cur);
  // 전월 매익률은 반올림 전 값으로 계산해야 구분별·거래처별 합이 전체와 맞는다
  const baseRate = P.sale ? (P.profit / P.sale) * 100 : 0;
  const T = compare(P, C, baseRate);
  const expected = Math.round(C.sale * (baseRate / 100));
  const shortfall = expected - C.profit;

  const segments = SEGMENTS.map((seg) => {
    const a = prev.filter((r) => classify(r).seg === seg);
    const b = cur.filter((r) => classify(r).seg === seg);
    return { seg, ...compare(summarize(a), summarize(b), baseRate) };
  });

  const byClient = new Map();
  const add = (r, key) => {
    const name = String(r.거래처명 || "(거래처 없음)").trim();
    if (!byClient.has(name)) byClient.set(name, { name, cur: [], prev: [] });
    byClient.get(name)[key].push(r);
  };
  cur.forEach((r) => add(r, "cur"));
  prev.forEach((r) => add(r, "prev"));
  const clients = [...byClient.values()].map((x) => ({
    name: x.name,
    badCur: x.cur.filter((r) => BAD_SEGMENTS.includes(classify(r).seg)).length,
    ...compare(summarize(x.prev), summarize(x.cur), baseRate),
  }));
  return { cur, prev, C, P, T, expected, shortfall, segments, clients };
}

function reportText(R, monthKey, prevKey) {
  const a = mLabel(prevKey), b = mLabel(monthKey);
  const { C, P, T } = R;
  const L = [];
  L.push(`[${a} → ${b} 매출·이익 비교]`);
  L.push(`- 매출: ${a} ${won(P.sale)} → ${b} ${won(C.sale)} (${signWon(T.dSale)}${P.sale ? `, ${T.dSale >= 0 ? "+" : ""}${pct(T.dSale, P.sale)}%` : ""})`);
  L.push(`- 이익: ${a} ${won(P.profit)} → ${b} ${won(C.profit)} (${signWon(T.dProfit)}${P.profit ? `, ${T.dProfit >= 0 ? "+" : ""}${pct(T.dProfit, P.profit)}%` : ""})`);
  L.push(`- 매익률: ${P.rate}% → ${C.rate}% (${T.dRate >= 0 ? "▲" : "▼"}${Math.abs(T.dRate)}%p) / 건수 ${P.cnt}건 → ${C.cnt}건`);
  L.push("");
  L.push(`[매출이 늘었는데 이익이 그대로인 이유]`);
  L.push(`- ${a} 매익률 ${P.rate}%를 유지했다면 ${b} 이익은 ${won(R.expected)}이어야 하나, 실제는 ${won(C.profit)} → ${won(R.shortfall)} 덜 남음`);
  if (T.dSale > 0) L.push(`- 늘어난 매출 ${won(T.dSale)}에서 늘어난 이익은 ${won(T.dProfit)} (늘어난 매출의 이익률 ${pct(T.dProfit, T.dSale)}%)`);
  L.push("");
  L.push(`[오더 구분별 원인 — 덜 남은 이익 순]`);
  [...R.segments].filter((s) => s.gap > 0).sort((x, y) => y.gap - x.gap).forEach((s) => {
    L.push(`- ${s.seg}: ${a} ${s.prev.cnt}건 매출 ${won(s.prev.sale)} 이익 ${won(s.prev.profit)} → ${b} ${s.cur.cnt}건 매출 ${won(s.cur.sale)} 이익 ${won(s.cur.profit)} ⇒ ${won(s.gap)} 덜 남음`);
  });
  const top = [...R.clients].filter((c) => c.gap > 0).sort((x, y) => y.gap - x.gap).slice(0, 7);
  if (top.length) {
    L.push("");
    L.push(`[거래처별 원인 — 덜 남은 이익 상위]`);
    top.forEach((c) => L.push(`- ${c.name}: 매출 ${man(c.prev.sale)} → ${man(c.cur.sale)}, 이익 ${won(c.prev.profit)} → ${won(c.cur.profit)}, 매익률 ${c.prev.cnt ? `${c.prev.rate}%` : "거래 없음"} → ${c.cur.cnt ? `${c.cur.rate}%` : "거래 없음"} ⇒ ${won(c.gap)} 덜 남음`));
  }
  return L;
}

export function exportMarginReportXlsx(R, monthKey, prevKey, pureOnly) {
  const wb = XLSX.utils.book_new();
  const a = mLabel(prevKey), b = mLabel(monthKey);
  const { C, P, T } = R;
  // 1) 요약
  const sum = [
    [`매익률 원인 분석 — ${a} vs ${b} (${pureOnly ? "순수 운송 매출 기준" : "전체 매출 기준"}, 배차완료 오더)`],
    [],
    ["구분", a, b, "증감", "증감률(%)"],
    ["건수", P.cnt, C.cnt, C.cnt - P.cnt, P.cnt ? pct(C.cnt - P.cnt, P.cnt) : ""],
    ["매출(청구운임)", P.sale, C.sale, T.dSale, P.sale ? pct(T.dSale, P.sale) : ""],
    ["기사운임", P.driver, C.driver, C.driver - P.driver, P.driver ? pct(C.driver - P.driver, P.driver) : ""],
    ["이익(청구-기사)", P.profit, C.profit, T.dProfit, P.profit ? pct(T.dProfit, P.profit) : ""],
    ["매익률(%)", P.rate, C.rate, T.dRate, ""],
    ["건당 매출", P.cnt ? Math.round(P.sale / P.cnt) : 0, C.cnt ? Math.round(C.sale / C.cnt) : 0, "", ""],
    ["건당 이익", P.cnt ? Math.round(P.profit / P.cnt) : 0, C.cnt ? Math.round(C.profit / C.cnt) : 0, "", ""],
    [],
    [`${a} 매익률(${P.rate}%) 유지 시 ${b} 이익`, R.expected],
    [`${b} 실제 이익`, C.profit],
    ["덜 남은 이익", R.shortfall],
    [],
    ["보고서"],
    ...reportText(R, monthKey, prevKey).map((t) => [t]),
    [],
    [`※ 덜 남은 이익 = 매출 증감 × ${a} 매익률 − 이익 증감 (구분별·거래처별 금액을 모두 더하면 전체와 같습니다)`],
    ["※ 미배차 페널티는 오더 메모·적요·전달사항에 '페널티/패널티/미배차'가 적힌 오더 기준입니다."],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sum);
  ws1["!cols"] = [{ wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws1, "요약");
  // 2) 구분별 비교
  const sHead = ["구분", `${a} 건수`, `${a} 매출`, `${a} 이익`, `${a} 매익률(%)`, `${b} 건수`, `${b} 매출`, `${b} 이익`, `${b} 매익률(%)`, "매출 증감", "이익 증감", "덜 남은 이익"];
  const ws2 = XLSX.utils.aoa_to_sheet([sHead,
    ...R.segments.map((s) => [s.seg, s.prev.cnt, s.prev.sale, s.prev.profit, s.prev.rate, s.cur.cnt, s.cur.sale, s.cur.profit, s.cur.rate, s.dSale, s.dProfit, s.gap]),
    ["합계", P.cnt, P.sale, P.profit, P.rate, C.cnt, C.sale, C.profit, C.rate, T.dSale, T.dProfit, T.gap]]);
  ws2["!cols"] = sHead.map((h, i) => ({ wch: i === 0 ? 18 : 14 }));
  XLSX.utils.book_append_sheet(wb, ws2, "구분별 비교");
  // 3) 거래처별 비교(덜 남은 이익 순)
  const cHead = ["거래처", `${a} 건수`, `${a} 매출`, `${a} 이익`, `${a} 매익률(%)`, `${b} 건수`, `${b} 매출`, `${b} 이익`, `${b} 매익률(%)`, "매출 증감", "이익 증감", "매익률 증감(%p)", "덜 남은 이익", `${b} 손실·0%·페널티 건`];
  const ws3 = XLSX.utils.aoa_to_sheet([cHead, ...[...R.clients].sort((x, y) => y.gap - x.gap).map((c) => [
    c.name, c.prev.cnt, c.prev.sale, c.prev.profit, c.prev.rate, c.cur.cnt, c.cur.sale, c.cur.profit, c.cur.rate, c.dSale, c.dProfit, c.dRate, c.gap, c.badCur,
  ])]);
  ws3["!cols"] = cHead.map((h, i) => ({ wch: i === 0 ? 22 : 14 }));
  XLSX.utils.book_append_sheet(wb, ws3, "거래처별 비교");
  // 4) 오더 목록 시트들
  const orderHead = ["상차일", "거래처", "상차지", "하차지", "차량번호", "기사", "차종/톤수", "배차방식", "지급방식", "청구운임", "기사운임", "이익", "매익률(%)", "구분", "메모"];
  const orderRow = (r) => {
    const c = classify(r);
    return [r.상차일 || "", r.거래처명 || "", r.상차지명 || r.출발지 || "", r.하차지명 || r.도착지 || "", r.차량번호 || "", r.이름 || "",
      [r.차량종류, r.차량톤수].filter(Boolean).join(" "), r.배차방식 || (r.__fixed ? "고정거래처" : ""), r.지급방식 || "",
      c.sale, c.driver, c.profit, c.rate, c.tags.join(", "), memoOf(r)];
  };
  const sortRows = (list) => [...list].sort((x, y) => String(x.상차일).localeCompare(String(y.상차일)) || String(x.거래처명 || "").localeCompare(String(y.거래처명 || "")));
  const addOrders = (name, list) => {
    const ws = XLSX.utils.aoa_to_sheet([orderHead, ...sortRows(list).map(orderRow), [], ["합계", `${list.length}건`, "", "", "", "", "", "", "",
      list.reduce((s, r) => s + toInt(r.청구운임), 0), list.reduce((s, r) => s + toInt(r.기사운임), 0), list.reduce((s, r) => s + classify(r).profit, 0)]]);
    ws["!cols"] = orderHead.map((h) => ({ wch: ["메모", "구분"].includes(h) ? 28 : ["상차지", "하차지", "거래처"].includes(h) ? 18 : 12 }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  addOrders(`${b} 일자별 상세`, R.cur);
  addOrders(`${a} 일자별 상세`, R.prev);
  const segOf = (seg) => R.cur.filter((r) => classify(r).seg === seg);
  addOrders(`${b} 마이너스 손실 건`, [...segOf("마이너스 손실"), ...segOf("청구운임 0원")]);
  addOrders(`${b} 수수료 0% 건`, segOf("수수료 0%"));
  addOrders(`${b} 미배차 페널티 건`, segOf("미배차 페널티"));
  addOrders(`${b} 기타(저마진·외부업체)`, R.cur.filter((r) => { const t = classify(r).tags; return t.includes("저마진(5% 미만)") || t.includes("외부업체 배차") || t.includes("기사운임 0원"); }));
  XLSX.writeFile(wb, `매익률_원인분석_${prevKey}_vs_${monthKey}.xlsx`);
}

const prevMonthOf = (k) => { const [y, m] = k.split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

const Diff = ({ v, unit = "won" }) => {
  if (!v) return <span className="text-gray-400">-</span>;
  const text = unit === "won" ? won(Math.abs(v)) : unit === "p" ? `${Math.abs(v)}%p` : `${Math.abs(v).toLocaleString()}건`;
  return <span className={`font-bold ${v > 0 ? "text-blue-600" : "text-red-600"}`}>{v > 0 ? "▲" : "▼"} {text}</span>;
};
const Th = ({ children, className = "" }) => <th className={`px-3 py-2.5 font-bold whitespace-nowrap ${className}`}>{children}</th>;
const Td = ({ children, className = "" }) => <td className={`px-3 py-2.5 whitespace-nowrap tabular-nums ${className}`}>{children}</td>;
const CUR_TH = "bg-blue-50/70 text-[#1B2B4B]";

export default function MarginReportModal({ rows, initialMonth, isExcluded, hasExcluded, onClose }) {
  const [monthKey, setMonthKey] = React.useState(initialMonth);
  const [prevKey, setPrevKey] = React.useState(prevMonthOf(initialMonth));
  const [pureOnly, setPureOnly] = React.useState(!!hasExcluded);
  const [clientSort, setClientSort] = React.useState("gap");
  const [showAll, setShowAll] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  // 전월이 당월보다 늦게 골라져도 항상 "이른 달 → 늦은 달" 순서로 비교
  const [pk, mk] = prevKey <= monthKey ? [prevKey, monthKey] : [monthKey, prevKey];
  const R = React.useMemo(() => buildMarginReport(rows, mk, pk, { pureOnly, isExcluded }), [rows, mk, pk, pureOnly, isExcluded]);
  const lines = reportText(R, mk, pk);
  const A = mLabel(pk), B = mLabel(mk);
  const { C, P, T } = R;

  const segCauses = R.segments.filter((s) => s.gap > 0).sort((x, y) => y.gap - x.gap);
  const clientCauses = R.clients.filter((c) => c.gap > 0).sort((x, y) => y.gap - x.gap).slice(0, 8);
  const maxSeg = Math.max(1, ...segCauses.map((s) => s.gap));
  const maxClient = Math.max(1, ...clientCauses.map((c) => c.gap));
  const sortedClients = [...R.clients].sort((x, y) =>
    clientSort === "gap" ? y.gap - x.gap : clientSort === "dSale" ? y.dSale - x.dSale : y.cur.sale - x.cur.sale);
  const shownClients = showAll ? sortedClients : sortedClients.slice(0, 30);

  const CompareCard = ({ label, a, b, fmt, diff, diffUnit, rateText }) => (
    <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 min-w-0">
      <div className="text-[14px] font-bold text-gray-600">{label}</div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[13px] font-semibold text-gray-500">{A}</div>
          <div className="text-[20px] font-black text-gray-700 whitespace-nowrap tabular-nums">{fmt(a)}</div>
        </div>
        <div>
          <div className="text-[13px] font-bold text-[#1B2B4B]">{B}</div>
          <div className="text-[20px] font-black text-[#1B2B4B] whitespace-nowrap tabular-nums">{fmt(b)}</div>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-gray-100 text-[14px] flex items-center gap-2 whitespace-nowrap">
        <Diff v={diff} unit={diffUnit} />
        {rateText && <span className="text-gray-500 font-semibold">({rateText})</span>}
      </div>
    </div>
  );
  const Bar = ({ v, max }) => (
    <div className="h-3 mt-1 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.max(2, (v / max) * 100)}%` }} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] bg-black/45 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-[#F4F6FA] rounded-2xl shadow-2xl w-[min(1560px,97vw)] max-h-[95vh] overflow-y-auto text-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] text-white px-7 py-4 rounded-t-2xl flex items-center justify-between sticky top-0 z-10">
          <div>
            <div className="text-[19px] font-black">매익률 원인 보고서 — {A} vs {B}</div>
            <div className="text-[13px] text-white/75 mt-0.5">매출은 늘었는데 이익은 왜 그대로인가 · 거래처별 금액 · 손실 건 · 수수료 0% 건 · 미배차 페널티 · 기타</div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-[28px] leading-none px-2">×</button>
        </div>

        <div className="p-7 space-y-6">
          {/* 조회 조건 */}
          <div className="flex flex-wrap items-center gap-3 text-[14px] bg-white rounded-2xl border border-gray-200 px-5 py-3">
            <label className="font-bold text-gray-600">전월(기준)</label>
            <input type="month" value={prevKey} onChange={(e) => setPrevKey(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 font-semibold" />
            <span className="text-gray-400 font-bold">→</span>
            <label className="font-bold text-[#1B2B4B]">당월</label>
            <input type="month" value={monthKey} onChange={(e) => { setMonthKey(e.target.value); setPrevKey(prevMonthOf(e.target.value)); }} className="border border-gray-300 rounded-lg px-2 py-1.5 font-semibold" />
            {hasExcluded && (
              <label className="flex items-center gap-1.5 ml-3 font-semibold text-gray-700">
                <input type="checkbox" checked={pureOnly} onChange={(e) => setPureOnly(e.target.checked)} className="w-4 h-4" /> 순수 운송 매출만(제외 거래처 빼기)
              </label>
            )}
            <button onClick={() => exportMarginReportXlsx(R, mk, pk, pureOnly)} className="ml-auto px-5 py-2 rounded-xl bg-emerald-600 text-white text-[14px] font-bold hover:bg-emerald-700">엑셀 다운로드</button>
          </div>

          {/* 핵심: 매출은 늘었는데 이익은 왜 그대로인가 */}
          <div className="rounded-2xl overflow-hidden border-2 border-red-300 bg-white">
            <div className="bg-red-50 px-6 py-3.5 border-b border-red-200 text-[18px] font-black text-red-700">
              ❗ {A} → {B} 매출은 {T.dSale >= 0 ? `${man(T.dSale)} 늘었는데` : `${man(-T.dSale)} 줄었는데`}, 이익은 {T.dProfit >= 0 ? `${man(T.dProfit)}만 늘었습니다` : `${man(-T.dProfit)} 줄었습니다`}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
              <div className="px-6 py-5">
                <div className="text-[14px] font-bold text-gray-600">{A} 매익률 {P.rate}%를 유지했다면 {B} 이익</div>
                <div className="mt-1 text-[28px] font-black text-gray-700 tabular-nums whitespace-nowrap">{won(R.expected)}</div>
                <div className="text-[13px] text-gray-500 mt-1">{B} 매출 {won(C.sale)} × {P.rate}%</div>
              </div>
              <div className="px-6 py-5">
                <div className="text-[14px] font-bold text-gray-600">{B} 실제 이익</div>
                <div className="mt-1 text-[28px] font-black text-[#1B2B4B] tabular-nums whitespace-nowrap">{won(C.profit)}</div>
                <div className="text-[13px] text-gray-500 mt-1">매익률 {P.rate}% → {C.rate}% ({T.dRate >= 0 ? "▲" : "▼"}{Math.abs(T.dRate)}%p)</div>
              </div>
              <div className="px-6 py-5 bg-red-50/60">
                <div className="text-[14px] font-bold text-red-700">덜 남은 이익</div>
                <div className="mt-1 text-[32px] font-black text-red-600 tabular-nums whitespace-nowrap">{won(R.shortfall)}</div>
                {T.dSale > 0 && <div className="text-[13px] text-red-700/90 mt-1">늘어난 매출 {won(T.dSale)}의 이익률은 {pct(T.dProfit, T.dSale)}%</div>}
              </div>
            </div>
          </div>

          {/* 전월 vs 당월 카드 */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <CompareCard label="매출" a={P.sale} b={C.sale} fmt={won} diff={T.dSale} rateText={P.sale ? `${T.dSale >= 0 ? "+" : ""}${pct(T.dSale, P.sale)}%` : ""} />
            <CompareCard label="이익(매익)" a={P.profit} b={C.profit} fmt={won} diff={T.dProfit} rateText={P.profit ? `${T.dProfit >= 0 ? "+" : ""}${pct(T.dProfit, P.profit)}%` : ""} />
            <CompareCard label="매익률" a={P.rate} b={C.rate} fmt={(v) => `${v}%`} diff={T.dRate} diffUnit="p" />
            <CompareCard label="건수" a={P.cnt} b={C.cnt} fmt={(v) => `${v.toLocaleString()}건`} diff={C.cnt - P.cnt} diffUnit="cnt" />
          </div>

          {/* 원인 ①② */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="text-[16px] font-black text-[#1B2B4B]">원인 ① 오더 구분별 덜 남은 이익</div>
              <div className="text-[13px] text-gray-500 mt-0.5 mb-4">{A}과 같은 매익률이었다면 남았을 이익과의 차이</div>
              <div className="space-y-4">
                {segCauses.length === 0 && <div className="text-[14px] text-gray-500">덜 남은 구분이 없습니다.</div>}
                {segCauses.map((s) => (
                  <div key={s.seg}>
                    <div className="flex items-baseline justify-between gap-3 text-[15px]">
                      <span className="font-bold">{s.seg}</span>
                      <span className="font-black text-red-600 tabular-nums whitespace-nowrap">{won(s.gap)}</span>
                    </div>
                    <Bar v={s.gap} max={maxSeg} />
                    <div className="text-[13px] text-gray-600 mt-1 tabular-nums">
                      {A} {s.prev.cnt}건 · 매출 {man(s.prev.sale)} · 이익 {won(s.prev.profit)} → {B} {s.cur.cnt}건 · 매출 {man(s.cur.sale)} · 이익 {won(s.cur.profit)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="text-[16px] font-black text-[#1B2B4B]">원인 ② 거래처별 덜 남은 이익 (상위 8곳)</div>
              <div className="text-[13px] text-gray-500 mt-0.5 mb-4">매출이 늘어난 만큼 이익이 따라오지 않은 거래처</div>
              <div className="space-y-4">
                {clientCauses.length === 0 && <div className="text-[14px] text-gray-500">덜 남은 거래처가 없습니다.</div>}
                {clientCauses.map((c) => (
                  <div key={c.name}>
                    <div className="flex items-baseline justify-between gap-3 text-[15px]">
                      <span className="font-bold truncate">{c.name}</span>
                      <span className="font-black text-red-600 tabular-nums whitespace-nowrap">{won(c.gap)}</span>
                    </div>
                    <Bar v={c.gap} max={maxClient} />
                    <div className="text-[13px] text-gray-600 mt-1 tabular-nums">
                      매출 {man(c.prev.sale)} → {man(c.cur.sale)} · 이익 {won(c.prev.profit)} → {won(c.cur.profit)} · 매익률 {c.prev.cnt ? `${c.prev.rate}%` : "거래 없음"} → {c.cur.cnt ? `${c.cur.rate}%` : "거래 없음"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 오더 구분별 비교 표 */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <div className="px-5 py-3 border-b text-[16px] font-black text-[#1B2B4B]">오더 구분별 비교 ({A} → {B})</div>
            <table className="w-full text-[14px]">
              <thead className="text-gray-600 text-[13px] bg-gray-50">
                <tr>
                  <Th className="text-left">구분</Th>
                  <Th className="text-right border-l">{A} 건수</Th><Th className="text-right">{A} 매출</Th><Th className="text-right">{A} 이익</Th>
                  <Th className={`text-right border-l ${CUR_TH}`}>{B} 건수</Th><Th className={`text-right ${CUR_TH}`}>{B} 매출</Th><Th className={`text-right ${CUR_TH}`}>{B} 이익</Th>
                  <Th className="text-right border-l">매출 증감</Th><Th className="text-right">이익 증감</Th><Th className="text-right">덜 남은 이익</Th>
                </tr>
              </thead>
              <tbody>
                {R.segments.map((s) => (
                  <tr key={s.seg} className={`border-t ${BAD_SEGMENTS.includes(s.seg) ? "bg-red-50/40" : ""}`}>
                    <Td className="font-bold">{s.seg}</Td>
                    <Td className="text-right border-l">{s.prev.cnt}건</Td><Td className="text-right">{won(s.prev.sale)}</Td><Td className={`text-right ${s.prev.profit < 0 ? "text-red-600 font-bold" : ""}`}>{won(s.prev.profit)}</Td>
                    <Td className="text-right border-l font-semibold">{s.cur.cnt}건</Td><Td className="text-right font-semibold">{won(s.cur.sale)}</Td><Td className={`text-right font-semibold ${s.cur.profit < 0 ? "text-red-600" : ""}`}>{won(s.cur.profit)}</Td>
                    <Td className="text-right border-l"><Diff v={s.dSale} /></Td><Td className="text-right"><Diff v={s.dProfit} /></Td>
                    <Td className={`text-right font-black ${s.gap > 0 ? "text-red-600" : "text-gray-400"}`}>{s.gap > 0 ? won(s.gap) : "-"}</Td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-black">
                  <Td>합계</Td>
                  <Td className="text-right border-l">{P.cnt}건</Td><Td className="text-right">{won(P.sale)}</Td><Td className="text-right">{won(P.profit)}</Td>
                  <Td className="text-right border-l">{C.cnt}건</Td><Td className="text-right">{won(C.sale)}</Td><Td className="text-right">{won(C.profit)}</Td>
                  <Td className="text-right border-l"><Diff v={T.dSale} /></Td><Td className="text-right"><Diff v={T.dProfit} /></Td>
                  <Td className="text-right text-red-600">{won(T.gap)}</Td>
                </tr>
              </tbody>
            </table>
            <div className="px-5 py-2.5 text-[13px] text-gray-600 border-t">※ 덜 남은 이익 = 매출 증감 × {A} 매익률({P.rate}%) − 이익 증감. 이익이 오히려 더 남은 구분은 "-"로 표시되며, 합계 줄은 더 남은 구분까지 모두 더한 값입니다.</div>
          </div>

          {/* 보고서 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[16px] font-black text-[#1B2B4B]">보고서</div>
              <button
                onClick={() => { try { navigator.clipboard.writeText(lines.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* 무시 */ } }}
                className="px-4 py-1.5 rounded-lg border border-gray-300 text-[13px] font-bold hover:bg-gray-50"
              >{copied ? "복사됨" : "복사"}</button>
            </div>
            <div className="text-[15px] leading-[1.85] text-gray-900">
              {lines.map((t, i) => (
                t === "" ? <div key={i} className="h-3" />
                  : t.startsWith("[") ? <div key={i} className="font-black text-[#1B2B4B]">{t}</div>
                    : <div key={i}>{t}</div>
              ))}
            </div>
          </div>

          {/* 거래처별 비교 표 */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <div className="px-5 py-3 border-b flex flex-wrap items-center gap-3">
              <div className="text-[16px] font-black text-[#1B2B4B]">거래처별 비교 ({A} → {B})</div>
              <div className="ml-auto flex items-center gap-1.5 text-[13px]">
                {[["gap", "덜 남은 이익 순"], ["dSale", "매출 증가 순"], ["sale", `${B} 매출 순`]].map(([k, l]) => (
                  <button key={k} onClick={() => setClientSort(k)} className={`px-3 py-1.5 rounded-lg font-bold border ${clientSort === k ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}>{l}</button>
                ))}
              </div>
            </div>
            <table className="w-full text-[14px]">
              <thead className="text-gray-600 text-[13px] bg-gray-50">
                <tr>
                  <Th className="text-left">거래처</Th>
                  <Th className="text-right border-l">{A} 건수</Th><Th className="text-right">{A} 매출</Th><Th className="text-right">{A} 이익</Th><Th className="text-right">{A} 매익률</Th>
                  <Th className={`text-right border-l ${CUR_TH}`}>{B} 건수</Th><Th className={`text-right ${CUR_TH}`}>{B} 매출</Th><Th className={`text-right ${CUR_TH}`}>{B} 이익</Th><Th className={`text-right ${CUR_TH}`}>{B} 매익률</Th>
                  <Th className="text-right border-l">매출 증감</Th><Th className="text-right">이익 증감</Th><Th className="text-right">덜 남은 이익</Th><Th className="text-right">{B} 손실·0% 건</Th>
                </tr>
              </thead>
              <tbody>
                {shownClients.map((c) => (
                  <tr key={c.name} className="border-t hover:bg-gray-50">
                    <Td className="font-bold max-w-[220px] truncate">{c.name}</Td>
                    <Td className="text-right border-l text-gray-600">{c.prev.cnt || "-"}</Td>
                    <Td className="text-right text-gray-600">{c.prev.cnt ? won(c.prev.sale) : "-"}</Td>
                    <Td className={`text-right ${c.prev.profit < 0 ? "text-red-600" : "text-gray-600"}`}>{c.prev.cnt ? won(c.prev.profit) : "-"}</Td>
                    <Td className="text-right text-gray-600">{c.prev.cnt ? `${c.prev.rate}%` : "-"}</Td>
                    <Td className="text-right border-l font-semibold">{c.cur.cnt || "-"}</Td>
                    <Td className="text-right font-semibold">{c.cur.cnt ? won(c.cur.sale) : "-"}</Td>
                    <Td className={`text-right font-semibold ${c.cur.profit < 0 ? "text-red-600" : ""}`}>{c.cur.cnt ? won(c.cur.profit) : "-"}</Td>
                    <Td className={`text-right font-semibold ${c.cur.cnt && c.prev.cnt && c.cur.rate < c.prev.rate ? "text-red-600" : ""}`}>{c.cur.cnt ? `${c.cur.rate}%` : "-"}</Td>
                    <Td className="text-right border-l"><Diff v={c.dSale} /></Td>
                    <Td className="text-right"><Diff v={c.dProfit} /></Td>
                    <Td className={`text-right font-black ${c.gap > 0 ? "text-red-600" : "text-gray-400"}`}>{c.gap > 0 ? won(c.gap) : "-"}</Td>
                    <Td className="text-right">{c.badCur || "-"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedClients.length > 30 && (
              <button onClick={() => setShowAll((v) => !v)} className="w-full py-3 border-t text-[14px] font-bold text-[#1B2B4B] hover:bg-gray-50">
                {showAll ? "접기" : `전체 ${sortedClients.length}곳 보기`}
              </button>
            )}
          </div>

          <p className="text-[13px] text-gray-600">※ 매출관리와 같은 기준(배차완료 오더 + 고정거래처)입니다. 미배차 페널티는 오더 메모·적요·전달사항에 "페널티/패널티/미배차"가 적힌 오더로 찾습니다 — 페널티 오더는 메모에 그렇게 적어두면 보고서에 잡힙니다.</p>
        </div>
      </div>
    </div>
  );
}
