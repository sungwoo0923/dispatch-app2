// ======================= src/MarginReport.jsx =======================
// ⭐ 매익률 원인 보고서(2026-10-21 요청) — "매출은 늘었는데 매익률이 왜 떨어졌나"를 보고하기 위한 자료.
// 매출관리와 같은 데이터(배차완료 오더 + 고정거래처)로 두 달을 비교해 엑셀로 내려받는다.
//  - 요약: 전월/당월 매출·매익·매익률 + 매익률을 끌어내린 항목별 금액 + 자동 보고 문구
//  - 거래처별: 거래처마다 당월/전월 금액·매익률·증감
//  - 일자별 상세: 당월 모든 오더(날짜·거래처·구간·금액)
//  - 손실 건(기사운임 > 청구운임) / 수수료 0% 건 / 미배차 페널티 건 / 기타(저마진·운임 미입력·외부업체)
import React from "react";
import * as XLSX from "xlsx";

const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const pct = (profit, sale) => (sale ? Math.round((profit / sale) * 1000) / 10 : 0);
const won = (n) => `${Math.round(n || 0).toLocaleString()}원`;
const PENALTY_RE = /페널티|패널티|penalty|미배차/i;
const memoOf = (r) => [r.메모, r.적요, r.전달사항, r.비고, r.특이사항].filter(Boolean).join(" / ");

function classify(r) {
  const sale = toInt(r.청구운임);
  const driver = toInt(r.기사운임);
  const profit = sale - driver;
  const tags = [];
  if (sale === 0 && driver > 0) tags.push("청구운임 0원");
  else if (profit < 0) tags.push("손실");
  else if (sale > 0 && profit === 0) tags.push("수수료 0%");
  else if (sale > 0 && profit / sale < 0.05) tags.push("저마진(5% 미만)");
  if (driver === 0 && sale > 0) tags.push("기사운임 0원");
  if (PENALTY_RE.test(memoOf(r))) tags.push("미배차 페널티");
  if (String(r.배차방식 || "").includes("외부")) tags.push("외부업체 배차");
  return { sale, driver, profit, rate: pct(profit, sale), tags };
}

function summarize(list) {
  const s = { cnt: list.length, sale: 0, driver: 0, profit: 0 };
  list.forEach((r) => { const c = classify(r); s.sale += c.sale; s.driver += c.driver; s.profit += c.profit; });
  s.rate = pct(s.profit, s.sale);
  return s;
}
const groupBy = (list, pred) => {
  const items = list.filter((r) => pred(classify(r)));
  const t = summarize(items);
  return { items, ...t };
};

export function buildMarginReport(rows, monthKey, prevKey, { pureOnly, isExcluded }) {
  const base = rows.filter((r) => !pureOnly || !isExcluded?.(r.거래처명));
  const cur = base.filter((r) => String(r.상차일 || "").startsWith(monthKey));
  const prev = base.filter((r) => String(r.상차일 || "").startsWith(prevKey));
  const C = summarize(cur);
  const P = summarize(prev);
  const factor = (list, tag) => groupBy(list, (c) => c.tags.includes(tag));
  const factors = ["손실", "수수료 0%", "미배차 페널티", "저마진(5% 미만)", "청구운임 0원", "외부업체 배차"].map((tag) => ({
    tag, cur: factor(cur, tag), prev: factor(prev, tag),
  }));
  // 거래처별
  const byClient = new Map();
  const add = (r, key) => {
    const name = String(r.거래처명 || "(거래처 없음)").trim();
    if (!byClient.has(name)) byClient.set(name, { name, cur: [], prev: [] });
    byClient.get(name)[key].push(r);
  };
  cur.forEach((r) => add(r, "cur"));
  prev.forEach((r) => add(r, "prev"));
  const clients = [...byClient.values()].map((x) => {
    const a = summarize(x.cur); const b = summarize(x.prev);
    return {
      name: x.name, cur: a, prev: b,
      loss: x.cur.filter((r) => classify(r).tags.includes("손실")).length,
      zero: x.cur.filter((r) => classify(r).tags.includes("수수료 0%")).length,
      // 이 거래처가 전체 매익률을 얼마나 끌어내렸나(당월 매출 비중 × (거래처 매익률 − 전월 전체 매익률))
      drag: C.sale ? Math.round(((a.sale / C.sale) * (a.rate - P.rate)) * 100) / 100 : 0,
    };
  }).sort((x, y) => y.cur.sale - x.cur.sale);
  // 손실·0% 오더가 없었다면 매익률
  const cleanCur = summarize(cur.filter((r) => { const t = classify(r).tags; return !t.includes("손실") && !t.includes("수수료 0%") && !t.includes("청구운임 0원"); }));
  // 매출 증가분이 어디서 났나(매익률 낮은 거래처 비중)
  const grew = clients.filter((c) => c.cur.sale > c.prev.sale);
  const lowGrowth = grew.filter((c) => c.cur.rate < P.rate).reduce((a, c) => a + (c.cur.sale - c.prev.sale), 0);
  const totalGrowth = grew.reduce((a, c) => a + (c.cur.sale - c.prev.sale), 0);
  return { cur, prev, C, P, factors, clients, cleanCur, lowGrowth, totalGrowth };
}

function reportText(R, monthKey, prevKey) {
  const m = (k) => `${Number(k.slice(5))}월`;
  const { C, P } = R;
  const lines = [];
  lines.push(`${m(prevKey)} 매출 ${won(P.sale)} / 매익 ${won(P.profit)} / 매익률 ${P.rate}% (${P.cnt}건)`);
  lines.push(`${m(monthKey)} 매출 ${won(C.sale)} / 매익 ${won(C.profit)} / 매익률 ${C.rate}% (${C.cnt}건)`);
  lines.push(`→ 매출 ${C.sale - P.sale >= 0 ? "▲" : "▼"}${won(Math.abs(C.sale - P.sale))}, 매익 ${C.profit - P.profit >= 0 ? "▲" : "▼"}${won(Math.abs(C.profit - P.profit))}, 매익률 ${(C.rate - P.rate).toFixed(1)}%p`);
  lines.push("");
  lines.push(`[${m(monthKey)} 매익률 하락 요인]`);
  R.factors.forEach((f) => {
    if (!f.cur.cnt && !f.prev.cnt) return;
    const amount = f.tag === "손실" ? `손실액 ${won(-f.cur.profit)}` : `매출 ${won(f.cur.sale)} · 매익 ${won(f.cur.profit)}`;
    lines.push(`- ${f.tag}: ${f.cur.cnt}건 (${amount}) / 전월 ${f.prev.cnt}건`);
  });
  lines.push(`- 손실·수수료 0%·청구 0원 오더를 빼면 ${m(monthKey)} 매익률은 ${R.cleanCur.rate}%`);
  if (R.totalGrowth > 0) lines.push(`- 매출 증가분 ${won(R.totalGrowth)} 중 ${won(R.lowGrowth)}(${pct(R.lowGrowth, R.totalGrowth)}%)가 매익률이 전월 평균(${P.rate}%)보다 낮은 거래처에서 발생`);
  const drags = R.clients.filter((c) => c.drag < 0).sort((a, b) => a.drag - b.drag).slice(0, 5);
  if (drags.length) {
    lines.push("");
    lines.push("[매익률을 가장 많이 끌어내린 거래처]");
    drags.forEach((c) => lines.push(`- ${c.name}: 매출 ${won(c.cur.sale)}, 매익률 ${c.cur.rate}% (전월 ${c.prev.cnt ? `${c.prev.rate}%` : "거래 없음"}) → 전체 매익률 ${c.drag}%p 영향`));
  }
  return lines;
}

export function exportMarginReportXlsx(R, monthKey, prevKey, pureOnly) {
  const wb = XLSX.utils.book_new();
  const m = (k) => `${Number(k.slice(5))}월`;
  const { C, P } = R;
  // 1) 요약
  const sum = [
    [`매익률 원인 분석 — ${m(prevKey)} vs ${m(monthKey)} (${pureOnly ? "순수 운송 매출 기준" : "전체 매출 기준"}, 배차완료 오더)`],
    [],
    ["구분", m(prevKey), m(monthKey), "증감"],
    ["건수", P.cnt, C.cnt, C.cnt - P.cnt],
    ["매출(청구운임)", P.sale, C.sale, C.sale - P.sale],
    ["기사운임", P.driver, C.driver, C.driver - P.driver],
    ["매익(청구-기사)", P.profit, C.profit, C.profit - P.profit],
    ["매익률(%)", P.rate, C.rate, Math.round((C.rate - P.rate) * 10) / 10],
    ["건당 매출", P.cnt ? Math.round(P.sale / P.cnt) : 0, C.cnt ? Math.round(C.sale / C.cnt) : 0, ""],
    ["건당 매익", P.cnt ? Math.round(P.profit / P.cnt) : 0, C.cnt ? Math.round(C.profit / C.cnt) : 0, ""],
    [],
    ["매익률 하락 요인", `${m(prevKey)} 건수`, `${m(prevKey)} 매출`, `${m(prevKey)} 매익`, `${m(monthKey)} 건수`, `${m(monthKey)} 매출`, `${m(monthKey)} 매익`],
    ...R.factors.map((f) => [f.tag, f.prev.cnt, f.prev.sale, f.prev.profit, f.cur.cnt, f.cur.sale, f.cur.profit]),
    [],
    ["손실·수수료0%·청구0원 제외 시 당월 매익률(%)", R.cleanCur.rate],
    [],
    ["보고 문구(그대로 붙여넣기 가능)"],
    ...reportText(R, monthKey, prevKey).map((t) => [t]),
    [],
    ["※ 미배차 페널티는 오더 메모·적요·전달사항에 '페널티/패널티/미배차'가 적힌 오더 기준입니다."],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sum);
  ws1["!cols"] = [{ wch: 44 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws1, "요약");
  // 2) 거래처별
  const cHead = ["거래처", `${m(monthKey)} 건수`, `${m(monthKey)} 매출`, `${m(monthKey)} 기사운임`, `${m(monthKey)} 매익`, `${m(monthKey)} 매익률(%)`,
    `${m(prevKey)} 건수`, `${m(prevKey)} 매출`, `${m(prevKey)} 매익`, `${m(prevKey)} 매익률(%)`, "매출 증감", "매익 증감", "매익률 증감(%p)", "손실 건", "수수료0% 건", "전체 매익률 영향(%p)"];
  const ws2 = XLSX.utils.aoa_to_sheet([cHead, ...R.clients.map((c) => [
    c.name, c.cur.cnt, c.cur.sale, c.cur.driver, c.cur.profit, c.cur.rate, c.prev.cnt, c.prev.sale, c.prev.profit, c.prev.rate,
    c.cur.sale - c.prev.sale, c.cur.profit - c.prev.profit, Math.round((c.cur.rate - c.prev.rate) * 10) / 10, c.loss, c.zero, c.drag,
  ])]);
  ws2["!cols"] = cHead.map((h, i) => ({ wch: i === 0 ? 22 : 13 }));
  XLSX.utils.book_append_sheet(wb, ws2, "거래처별");
  // 3) 오더 목록 시트들
  const orderHead = ["상차일", "거래처", "상차지", "하차지", "차량번호", "기사", "차종/톤수", "배차방식", "지급방식", "청구운임", "기사운임", "매익", "매익률(%)", "구분", "메모"];
  const orderRow = (r) => {
    const c = classify(r);
    return [r.상차일 || "", r.거래처명 || "", r.상차지명 || r.출발지 || "", r.하차지명 || r.도착지 || "", r.차량번호 || "", r.이름 || "",
      [r.차량종류, r.차량톤수].filter(Boolean).join(" "), r.배차방식 || (r.__fixed ? "고정거래처" : ""), r.지급방식 || "",
      c.sale, c.driver, c.profit, c.rate, c.tags.join(", "), memoOf(r)];
  };
  const sortRows = (list) => [...list].sort((a, b) => String(a.상차일).localeCompare(String(b.상차일)) || String(a.거래처명 || "").localeCompare(String(b.거래처명 || "")));
  const addOrders = (name, list) => {
    const ws = XLSX.utils.aoa_to_sheet([orderHead, ...sortRows(list).map(orderRow), [], ["합계", `${list.length}건`, "", "", "", "", "", "", "",
      list.reduce((a, r) => a + toInt(r.청구운임), 0), list.reduce((a, r) => a + toInt(r.기사운임), 0), list.reduce((a, r) => a + classify(r).profit, 0)]]);
    ws["!cols"] = orderHead.map((h) => ({ wch: ["메모", "구분"].includes(h) ? 28 : ["상차지", "하차지", "거래처"].includes(h) ? 18 : 12 }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  addOrders(`${m(monthKey)} 일자별 상세`, R.cur);
  const tagged = (tag) => R.cur.filter((r) => classify(r).tags.includes(tag));
  addOrders("마이너스 손실 건", [...tagged("손실"), ...tagged("청구운임 0원")]);
  addOrders("수수료 0% 건", tagged("수수료 0%"));
  addOrders("미배차 페널티 건", tagged("미배차 페널티"));
  addOrders("기타(저마진·외부업체)", R.cur.filter((r) => { const t = classify(r).tags; return t.includes("저마진(5% 미만)") || t.includes("외부업체 배차") || t.includes("기사운임 0원"); }));
  XLSX.writeFile(wb, `매익률_원인분석_${monthKey}_vs_${prevKey}.xlsx`);
}

const prevMonthOf = (k) => { const [y, m] = k.split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

export default function MarginReportModal({ rows, initialMonth, isExcluded, hasExcluded, onClose }) {
  const [monthKey, setMonthKey] = React.useState(initialMonth);
  const [prevKey, setPrevKey] = React.useState(prevMonthOf(initialMonth));
  const [pureOnly, setPureOnly] = React.useState(!!hasExcluded);
  const R = React.useMemo(() => buildMarginReport(rows, monthKey, prevKey, { pureOnly, isExcluded }), [rows, monthKey, prevKey, pureOnly, isExcluded]);
  const lines = reportText(R, monthKey, prevKey);
  const Card = ({ label, a, b, fmt, diff }) => (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <div className="text-[12px] text-gray-500 font-semibold">{label}</div>
      <div className="mt-1 flex items-baseline gap-2"><span className="text-[18px] font-black text-[#1B2B4B]">{fmt(b)}</span><span className="text-[12px] text-gray-400">전월 {fmt(a)}</span></div>
      <div className={`text-[12px] font-bold mt-0.5 ${diff >= 0 ? "text-blue-600" : "text-red-600"}`}>{diff >= 0 ? "▲" : "▼"} {label === "매익률" ? `${Math.abs(diff).toFixed(1)}%p` : fmt(Math.abs(diff))}</div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#F4F6FA] rounded-2xl shadow-2xl w-full max-w-[980px] max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between sticky top-0 z-10">
          <div>
            <div className="text-[16px] font-black">매익률 원인 보고서</div>
            <div className="text-[12px] text-white/60">거래처별 금액 재정리 · 손실 건 · 수수료 0% 건 · 미배차 페널티 · 기타 — 엑셀로 내려받기</div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-[22px] leading-none">×</button>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <label className="font-semibold text-gray-600">분석 월</label>
            <input type="month" value={monthKey} onChange={(e) => { setMonthKey(e.target.value); setPrevKey(prevMonthOf(e.target.value)); }} className="border border-gray-300 rounded-lg px-2 py-1" />
            <label className="font-semibold text-gray-600 ml-2">비교 월</label>
            <input type="month" value={prevKey} onChange={(e) => setPrevKey(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1" />
            {hasExcluded && (
              <label className="flex items-center gap-1.5 ml-2 font-semibold text-gray-600">
                <input type="checkbox" checked={pureOnly} onChange={(e) => setPureOnly(e.target.checked)} /> 순수 운송 매출만(제외 거래처 빼기)
              </label>
            )}
            <button onClick={() => exportMarginReportXlsx(R, monthKey, prevKey, pureOnly)} className="ml-auto px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700">엑셀 다운로드</button>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <Card label="매출" a={R.P.sale} b={R.C.sale} fmt={won} diff={R.C.sale - R.P.sale} />
            <Card label="매익" a={R.P.profit} b={R.C.profit} fmt={won} diff={R.C.profit - R.P.profit} />
            <Card label="매익률" a={R.P.rate} b={R.C.rate} fmt={(v) => `${v}%`} diff={R.C.rate - R.P.rate} />
            <Card label="건수" a={R.P.cnt} b={R.C.cnt} fmt={(v) => `${v}건`} diff={R.C.cnt - R.P.cnt} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b text-[13px] font-bold text-[#1B2B4B]">매익률 하락 요인 (당월 / 전월)</div>
            <table className="w-full text-[13px]">
              <thead className="text-gray-500 text-[12px]"><tr><th className="text-left px-4 py-2">항목</th><th className="text-right px-3">당월 건수</th><th className="text-right px-3">당월 매출</th><th className="text-right px-3">당월 매익</th><th className="text-right px-3">전월 건수</th><th className="text-right px-4">전월 매익</th></tr></thead>
              <tbody>
                {R.factors.map((f) => (
                  <tr key={f.tag} className="border-t">
                    <td className="px-4 py-2 font-semibold">{f.tag}</td>
                    <td className="text-right px-3">{f.cur.cnt}건</td>
                    <td className="text-right px-3">{won(f.cur.sale)}</td>
                    <td className={`text-right px-3 ${f.cur.profit < 0 ? "text-red-600 font-bold" : ""}`}>{won(f.cur.profit)}</td>
                    <td className="text-right px-3 text-gray-500">{f.prev.cnt}건</td>
                    <td className="text-right px-4 text-gray-500">{won(f.prev.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[13px] font-bold text-[#1B2B4B]">보고 문구 (자동 작성)</div>
              <button onClick={() => { try { navigator.clipboard.writeText(lines.join("\n")); } catch { /* 무시 */ } }} className="px-3 py-1 rounded-lg border border-gray-300 text-[12px] font-bold hover:bg-gray-50">복사</button>
            </div>
            <pre className="whitespace-pre-wrap text-[13px] text-gray-700 leading-relaxed font-sans">{lines.join("\n")}</pre>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b text-[13px] font-bold text-[#1B2B4B]">거래처별 (당월 매출 순) — 전체는 엑셀 "거래처별" 시트</div>
            <table className="w-full text-[12.5px]">
              <thead className="text-gray-500 text-[12px]"><tr><th className="text-left px-4 py-2">거래처</th><th className="text-right px-2">건수</th><th className="text-right px-2">매출</th><th className="text-right px-2">매익</th><th className="text-right px-2">매익률</th><th className="text-right px-2">전월 매익률</th><th className="text-right px-2">손실/0%</th><th className="text-right px-4">전체 매익률 영향</th></tr></thead>
              <tbody>
                {R.clients.slice(0, 20).map((c) => (
                  <tr key={c.name} className="border-t">
                    <td className="px-4 py-1.5 font-semibold">{c.name}</td>
                    <td className="text-right px-2">{c.cur.cnt}</td>
                    <td className="text-right px-2">{won(c.cur.sale)}</td>
                    <td className={`text-right px-2 ${c.cur.profit < 0 ? "text-red-600" : ""}`}>{won(c.cur.profit)}</td>
                    <td className="text-right px-2">{c.cur.rate}%</td>
                    <td className="text-right px-2 text-gray-500">{c.prev.cnt ? `${c.prev.rate}%` : "-"}</td>
                    <td className="text-right px-2">{c.loss}/{c.zero}</td>
                    <td className={`text-right px-4 font-bold ${c.drag < 0 ? "text-red-600" : "text-blue-600"}`}>{c.drag > 0 ? "+" : ""}{c.drag}%p</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11.5px] text-gray-500">※ 매출관리와 같은 기준(배차완료 오더 + 고정거래처)입니다. 미배차 페널티는 오더 메모·적요·전달사항에 "페널티/패널티/미배차"가 적힌 오더로 찾습니다 — 페널티 오더는 메모에 그렇게 적어두면 보고서에 잡힙니다.</p>
        </div>
      </div>
    </div>
  );
}
