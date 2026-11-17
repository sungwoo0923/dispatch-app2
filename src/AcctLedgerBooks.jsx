// ======================= src/AcctLedgerBooks.jsx =======================
// ⭐ 2026-11-17 회계관리 › 회계 장부 — 진짜 장부(총계정원장 · 분개장)처럼 보이게 새로 그림
//  · 예전 DispatchApp.jsx AccountingDashboard 의 계산 · 저장(수금/지급 기록 · 초기화 · 부가세 엑셀)을 그대로 옮기고 "보이는 모양"만 바꿨다
//  · 탭 4개(미수금 현황 · 지급 현황 · 부가세 자료 · 원가 분석)는 장부 색인 탭처럼 — 계정 코드(108 외상매출금 · 253 미지급금 · 255/135 부가세 · 451 매출원가)
//  · 표: No. · 계정 코드 · 적요 · 일자(경과) · 차변 · 대변 · 잔액 · 누계 잔액 / 줄 친 장부 줄 · 자리 맞춤 숫자 · 합계는 두 줄 밑줄(합계선)
//  · 계정 코드는 더존 같은 회계 프로그램에서 많이 쓰는 번호(참고용) — 회계용어(acctGlossary.js)에 "계정 코드 · 총계정원장 · 합계선" 추가
//  ⚠ 숫자 계산은 receivablesOf · invoiceDriverPlates · isTaxInvoiceSale(arAging.js) — 회계 개요 · 거래처정산과 같은 식
import React from "react";
import { db } from "./firebase";
import { loadAcctPayments, saveAcctPayments } from "./acctPayments";
import { addClientCollection, removeClientCollections } from "./ledgerAuto";
import { receivablesOf, invoiceDriverPlates, isTaxInvoiceSale } from "./arAging";
import { useTableSort, sortRows, SortTh } from "./tableSort";
import { EditableText } from "./EditMode";
import { kpConfirm } from "./kpDialog";
import { profitColor, profitRateColor } from "./marginPct"; // ⭐ 2026-11-17 이익 · 이익률 색(플러스 빨강 · 마이너스 파랑)

// ── 장부 모양 ──
// ⭐ 2026-11-17 숫자 글꼴 — 고정폭(디지털) 글꼴이 읽기 불편하다는 요청으로 앱 기본 글꼴로 되돌림 · 자리 맞춤(tabular-nums)만 유지
const NUM_FONT = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const NUM = { fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums" };
const INK = "#0F1A30";
const RULE = "#E4E9F1"; // 장부 가로줄
const VRULE = "#D3DBE8"; // 칸 세로줄
const DR = "#2D4C82"; // 차변 글자
const CR = "#7A4B1E"; // 대변 글자(갈색 — 장부 종이 느낌 · 빨강은 오류만)
const NEG = "#B42318";
const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;
const amt = (v) => (!v ? "" : `${v < 0 ? "−" : ""}${Math.abs(Math.round(v)).toLocaleString()}`);
const wonTxt = (v) => (v === 0 ? "–" : (v < 0 ? "−" : "") + Math.abs(Math.round(v)).toLocaleString());

// ⭐ 2026-11-17 머리 칸 글자 크게(12 → 14.5px · 굵게) · 머리 칸은 모두 가운데 정렬(본문 금액은 오른쪽 그대로 — 자릿수 맞춰 읽기)
const th = { padding: "10px 10px", fontSize: 14.5, fontWeight: 900, color: "#1B2B4B", whiteSpace: "nowrap", textAlign: "center", verticalAlign: "middle", background: "#F3F6FB", borderBottom: `3px double ${INK}`, borderTop: `2px solid ${INK}` };
const td = { padding: "8px 10px", fontSize: 13.5, color: "#1B2B4B", borderBottom: `1px solid ${RULE}`, whiteSpace: "nowrap", height: 40 };
const tdN = { ...td, ...NUM, textAlign: "right", fontWeight: 700 };
const vl = { borderLeft: `1px solid ${VRULE}` };
const vlDouble = { borderLeft: `3px double ${VRULE}` };
const totalCell = { borderTop: `1.5px solid ${INK}`, borderBottom: `3px double ${INK}`, background: "#F7F9FC", fontWeight: 900 };

// 장부 머리 칸 — 위 작은 글씨(차변 · 대변 · 잔액) + 아래 이름
const HeadLbl = ({ tag, children, color }) => (
  <span className="inline-flex flex-col items-center leading-tight">
    {tag && <span className="kp-lt text-[13.5px] font-black tracking-[0.04em]" style={{ color: color || "#7A879C" }}>{tag}</span>}
    <span>{children}</span>
  </span>
);
// 계정 코드 칩
const Code = ({ code, name }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    <span className="px-1.5 py-0.5 rounded-[5px] bg-[#0F1A30] text-white text-[11.5px] font-black" style={NUM}>{code}</span>
    <span className="text-[12.5px] font-bold text-[#5B6B85]">{name}</span>
  </span>
);
const LEDGER_HEAD_CSS = "table.kp-ledger>thead>tr>th{font-size:calc(15px * var(--font-scale, 1))!important;font-weight:900!important;text-align:center!important;vertical-align:middle;color:#0F1A30;line-height:1.3!important;height:auto}table.kp-ledger>thead>tr>th .kp-lt{font-size:calc(13.5px * var(--font-scale, 1))}";
// 장부 표 틀(줄 친 종이)
const LedgerTable = ({ children, minWidth = 860, caption }) => (
  <div className="rounded-[14px] border border-[#D3DBE8] bg-white overflow-x-auto shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
    {/* ⭐ 2026-11-17 머리 칸 — 앱 공통 표 규칙(index.css · 14px !important)보다 크게 · 가운데 정렬 */}
    <style>{LEDGER_HEAD_CSS}</style>
    <table className="kp-ledger w-full border-collapse" style={{ minWidth }}>
      {caption && <caption className="sr-only">{caption}</caption>}
      {children}
    </table>
  </div>
);
// 시산 요약 칸(장부 위 숫자 칸)
function Tally({ label, value, sub, tone, code }) {
  const color = tone === "danger" ? NEG : tone === "ok" ? "#1F6F4A" : INK;
  return (
    <div className="min-w-0 rounded-[14px] bg-white border border-[#D3DBE8] px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[12.5px] font-black text-[#5B6B85] whitespace-nowrap">
        {code && <span className="px-1 rounded bg-[#EEF2F8] text-[11px] text-[#3A4A66]" style={NUM}>{code}</span>}
        <EditableText id={`settlement.accounting.kpi.${label}`} defaultText={label} />
      </div>
      <div className="mt-1 inline-block text-[18px] md:text-[21px] font-black whitespace-nowrap pb-0.5" style={{ ...NUM, color, borderBottom: `3px double ${color === INK ? "#9AA9C3" : color}` }}>{value}</div>
      {sub && <div className="mt-1 text-[12px] font-bold text-[#7A879C] truncate">{sub}</div>}
    </div>
  );
}
const Foot = ({ children }) => <p className="text-[12.5px] font-bold text-[#7A879C] leading-relaxed">{children}</p>;
const ageLabel = (days) => {
  if (days <= 30) return { label: "30일 이내", color: "#3A4A66", bg: "#EEF2F8" };
  if (days <= 60) return { label: "31~60일", color: "#8A5A12", bg: "#FBF1DD" };
  if (days <= 90) return { label: "61~90일", color: "#9A3412", bg: "#FCE9DD" };
  return { label: "90일 초과", color: NEG, bg: "#FEF3F2" };
};
const TABS = [
  ["ar", "미수금 현황", "108", "외상매출금"],
  ["ap", "지급 현황", "253", "미지급금"],
  ["vat", "부가세 자료", "255·135", "부가세예수금·대급금"],
  ["cost", "원가 분석", "451", "매출원가"],
];

export default function AcctLedgerBooks({ dispatchData = [], fixedRows = [], drivers = [], isViewer = false }) {
  const currentYear = new Date().getFullYear();
  const [subTab, setSubTab] = React.useState("ar");
  const [year, setYear] = React.useState(currentYear);
  const [arPayments, setArPayments] = React.useState({});
  const [apPayments, setApPayments] = React.useState({});
  const [arModal, setArModal] = React.useState(null);
  const [apModal, setApModal] = React.useState(null);
  const [arInput, setArInput] = React.useState("");
  const [apInput, setApInput] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [vatQuarter, setVatQuarter] = React.useState("Q1");

  React.useEffect(() => {
    (async () => {
      try {
        const d = await loadAcctPayments(db, year); // ⭐ 회사별 문서
        setArPayments(d.ar || {});
        setApPayments(d.ap || {});
      } catch (e) { console.error(e); }
    })();
  }, [year]);

  const yearOrders = React.useMemo(() => {
    const all = [
      ...(dispatchData || []).filter((r) => r.배차상태 === "배차완료"),
      ...(fixedRows || []).map((r) => ({ ...r, 상차일: r.날짜, 배차상태: "배차완료" })),
    ];
    return all.filter((r) => (r.상차일 || "").slice(0, 4) === String(year));
  }, [dispatchData, fixedRows, year]);

  // 청구액 = 부가세 포함(거래처정산 미수금과 같은 식) · 연체 구분 = 아직 못 받은 청구 중 가장 오래된 것의 경과일
  const arByClient = React.useMemo(() => {
    const todayK = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    return receivablesOf({ orders: yearOrders, paid: arPayments, today: todayK, year: String(year) })
      .map((x) => ({ client: x.client, invoiced: x.billed, paid: x.paid, outstanding: x.outstanding, ageDays: x.oldest }));
  }, [yearOrders, arPayments, year]);

  const apByDriver = React.useMemo(() => {
    const map = {};
    yearOrders.forEach((r) => {
      const d = r.이름 || "미지정";
      if (!map[d]) map[d] = { total: 0, carNo: r.차량번호 || "", settled: 0 };
      map[d].total += toInt(r.기사운임);
      if ((r.지급상태 || "") === "지급완료") map[d].settled += toInt(r.기사운임); // 정산관리 › 지급관리 [지급완료]도 지급액으로
    });
    return Object.entries(map).map(([d, v]) => {
      const paid = Math.max(apPayments[d] || 0, v.settled);
      return { driver: d, carNo: v.carNo, total: v.total, paid, outstanding: Math.max(0, v.total - paid) };
    }).sort((a, b) => b.outstanding - a.outstanding);
  }, [yearOrders, apPayments]);

  const vatData = React.useMemo(() => {
    const m = {};
    MONTHS.forEach((mo) => { m[mo] = { sales: 0, costs: 0 }; });
    const invPlates = invoiceDriverPlates(drivers); // 매출 = 계산서 오더 · 매입 = 세금계산서 발행 기사 운임
    yearOrders.forEach((r) => {
      const mo = (r.상차일 || "").slice(5, 7);
      if (!m[mo]) return;
      if (isTaxInvoiceSale(r)) m[mo].sales += toInt(r.청구운임);
      if (invPlates.has(String(r.차량번호 || "").replace(/\s+/g, "").toUpperCase())) m[mo].costs += toInt(r.기사운임);
    });
    const quarters = { Q1: [0, 1, 2], Q2: [3, 4, 5], Q3: [6, 7, 8], Q4: [9, 10, 11] };
    const qData = {};
    Object.entries(quarters).forEach(([q, idxs]) => {
      const mos = idxs.map((i) => MONTHS[i]);
      qData[q] = { sales: mos.reduce((s, mo) => s + m[mo].sales, 0), costs: mos.reduce((s, mo) => s + m[mo].costs, 0), months: mos.map((mo) => ({ mo, ...m[mo] })) };
    });
    return { monthly: m, quarters: qData }; // 원가 분석 › 월별 표도 예전과 같이 이 월별 값(monthly)을 쓴다
  }, [yearOrders, drivers]);

  const groupCost = (keyOf) => {
    const map = {};
    yearOrders.forEach((r) => {
      const t = keyOf(r);
      if (!map[t]) map[t] = { sales: 0, costs: 0, count: 0 };
      map[t].sales += toInt(r.청구운임); map[t].costs += toInt(r.기사운임); map[t].count++;
    });
    return Object.entries(map).map(([t, v]) => ({ key: t, ...v, profit: v.sales - v.costs, margin: v.sales > 0 ? ((v.sales - v.costs) / v.sales) * 100 : 0 })).sort((a, b) => b.sales - a.sales);
  };
  const costByType = React.useMemo(() => groupCost((r) => r.차량종류 || "미분류").map((x) => ({ ...x, type: x.key })), [yearOrders]); // eslint-disable-line react-hooks/exhaustive-deps
  const costByMethod = React.useMemo(() => groupCost((r) => r.배차방식 || "직접").map((x) => ({ ...x, method: x.key })), [yearOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalInvoiced = arByClient.reduce((s, r) => s + r.invoiced, 0);
  const totalArPaid = arByClient.reduce((s, r) => s + r.paid, 0);
  const totalAr = arByClient.reduce((s, r) => s + r.outstanding, 0);
  const totalAp = apByDriver.reduce((s, r) => s + r.total, 0);
  const totalApPaid = apByDriver.reduce((s, r) => s + r.paid, 0);
  const totalApOutstanding = apByDriver.reduce((s, r) => s + r.outstanding, 0);

  const savePayment = async (type, name, amtStr) => {
    if (isViewer) { alert("조회전용 권한으로는 저장할 수 없습니다."); return; }
    const a = parseInt(String(amtStr).replace(/[^\d]/g, ""), 10) || 0;
    if (!a) return;
    setSaving(true);
    try {
      const newAr = type === "ar" ? { ...arPayments, [name]: (arPayments[name] || 0) + a } : arPayments;
      const newAp = type === "ap" ? { ...apPayments, [name]: (apPayments[name] || 0) + a } : apPayments;
      await saveAcctPayments(db, year, "", newAr, newAp);
      // 거래처 수금 → 수입·지출 장부(수입)·자금 잔액 자동 반영. 기사 지급은 정산관리 › 지급관리 [지급완료]가 장부에 반영(이중 기록 방지)
      if (type === "ar") addClientCollection(db, { name, amount: a, year }).catch(() => {});
      setArPayments(newAr); setApPayments(newAp);
    } catch (e) { console.error(e); alert(`저장 실패: ${e?.message || e}`); } finally { setSaving(false); }
  };
  const resetPayment = async (type, name) => {
    if (isViewer) { alert("조회전용 권한으로는 초기화할 수 없습니다."); return; }
    if (!await kpConfirm(`${name} 의 ${type === "ar" ? "수금" : "지급"} 내역을 초기화하시겠습니까?`)) return;
    setSaving(true);
    try {
      const newAr = type === "ar" ? { ...arPayments, [name]: 0 } : arPayments;
      const newAp = type === "ap" ? { ...apPayments, [name]: 0 } : apPayments;
      await saveAcctPayments(db, year, "", newAr, newAp);
      if (type === "ar") removeClientCollections(db, { name, year }).catch(() => {});
      setArPayments(newAr); setApPayments(newAp);
    } catch (e) { console.error(e); alert(`초기화 실패: ${e?.message || e}`); } finally { setSaving(false); }
  };
  const exportVatExcel = async () => {
    const XLSX = await import("xlsx");
    const qd = vatData.quarters[vatQuarter];
    const header = ["월", "공급가액(매출)", "매출세액(10%)", "매입공급가액", "매입세액(10%)", "납부세액"];
    const rows = qd.months.map(({ mo, sales, costs }) => [`${Number(mo)}월`, sales, Math.round(sales * 0.1), costs, Math.round(costs * 0.1), Math.round(sales * 0.1) - Math.round(costs * 0.1)]);
    const totalRow = ["합계", qd.sales, Math.round(qd.sales * 0.1), qd.costs, Math.round(qd.costs * 0.1), Math.round(qd.sales * 0.1) - Math.round(qd.costs * 0.1)];
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows, totalRow]);
    ws["!cols"] = [{ wch: 8 }, ...Array(5).fill({ wch: 16 })];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `부가세_${year}_${vatQuarter}`);
    XLSX.writeFile(wb, `부가세신고자료_${year}_${vatQuarter}.xlsx`);
  };

  // 머리글 눌러 정렬(▲→▼→해제) — 이 브라우저에만 기억(예전과 같은 저장 이름)
  const acArSort = useTableSort("accounting.ar");
  const acApSort = useTableSort("accounting.ap");
  const acTypeSort = useTableSort("accounting.costByType");
  const acMethodSort = useTableSort("accounting.costByMethod");
  const AC_AR_KEY = { "거래처": "client", "청구액": "invoiced", "수금액": "paid", "미수금": "outstanding", "연체 구분": "ageDays" };
  const AC_AP_KEY = { "기사명": "driver", "차량번호": "carNo", "기사운임 합계": "total", "지급액": "paid", "미지급": "outstanding" };
  const AC_COST_KEY = { "차량 종류": "type", "배차 방식": "method", "건수": "count", "매출": "sales", "원가(기사운임)": "costs", "원가": "costs", "이익": "profit", "이익률": "margin" };
  const arSorted = React.useMemo(() => sortRows(arByClient, acArSort.sort, (r, k) => (k === "연체 구분" ? (r.outstanding > 0 ? r.ageDays : -1) : r[AC_AR_KEY[k]])), [arByClient, acArSort.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const apSorted = React.useMemo(() => sortRows(apByDriver, acApSort.sort, (r, k) => r[AC_AP_KEY[k]]), [apByDriver, acApSort.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const typeSorted = React.useMemo(() => sortRows(costByType, acTypeSort.sort, (r, k) => r[AC_COST_KEY[k]]), [costByType, acTypeSort.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const methodSorted = React.useMemo(() => sortRows(costByMethod, acMethodSort.sort, (r, k) => r[AC_COST_KEY[k]]), [costByMethod, acMethodSort.sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentQData = vatData.quarters[vatQuarter] || { sales: 0, costs: 0, months: [] };
  const vatOutput = Math.round(currentQData.sales * 0.1);
  const vatInput = Math.round(currentQData.costs * 0.1);
  const vatNet = vatOutput - vatInput;
  const tab = TABS.find((t) => t[0] === subTab) || TABS[0];
  const btnDark = "h-8 px-2.5 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black hover:opacity-85";
  const btnLine = "h-8 px-2.5 rounded-lg border border-[#D3DBE8] bg-white text-[#5B6B85] text-[12.5px] font-black hover:bg-[#F7F9FC]";
  const SortH = ({ k, label, sortObj, idp, tag, color, style }) => ( // right(금액 칸)는 예전 이름 — 머리 칸은 모두 가운데
    <SortTh k={k} sort={sortObj.sort} onSort={sortObj.toggle} align="center" style={{ ...th, ...style }}>
      <HeadLbl tag={tag} color={color}>{idp ? <EditableText id={`${idp}${k}`} defaultText={label || k} /> : label || k}</HeadLbl>
    </SortTh>
  );
  // ⭐ 2026-11-17 이익률 색 — 플러스 빨강 · 마이너스 파랑 · 0은 글자색(예전: 15% 이상 초록 · 8% 미만 빨강)
  const marginColor = (m, has = true) => (!has ? "#B5C0D3" : profitRateColor(m, { neutral: INK }));

  // 원가 분석 표(차량 종류 · 배차 방식 같은 모양)
  // 함수로 부른다(컴포넌트로 쓰면 그릴 때마다 표를 새로 만든다)
  const costTable = ({ rows, sorted, sortObj, first, idp, codeKey, titleId, title, showTotal }) => {
    const ts = rows.reduce((s, r) => s + r.sales, 0); const tc = rows.reduce((s, r) => s + r.costs, 0); const tp = ts - tc;
    return (
      <section className="space-y-2">
        <div className="flex items-center gap-2"><span className="w-1.5 h-5 rounded-full bg-[#0F1A30]" /><h3 className="text-[15px] font-black text-[#0F1A30]"><EditableText id={titleId} defaultText={title} /></h3></div>
        <LedgerTable minWidth={760} caption={title}>
          <thead><tr>
            <th style={{ ...th, width: 48}}>No.</th>
            <SortH k={first} sortObj={sortObj} idp={idp} />
            <SortH k="건수" sortObj={sortObj} idp={idp} right style={vl} />
            <SortH k="매출" sortObj={sortObj} idp={idp} right tag="401" style={vlDouble} />
            <SortH k={codeKey} sortObj={sortObj} idp={idp} right tag="451" style={vl} />
            <SortH k="이익" sortObj={sortObj} idp={idp} right style={vl} />
            <SortH k="이익률" sortObj={sortObj} idp={idp} right style={vl} />
          </tr></thead>
          <tbody>
            {!rows.length ? <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "#9AA9C3", height: 64 }}>데이터 없음</td></tr> : sorted.map((r, i) => (
              <tr key={r.key} className="hover:bg-[#F5F8FD]">
                <td style={{ ...td, ...NUM, textAlign: "center", color: "#9AA9C3", fontSize: 12.5 }}>{i + 1}</td>
                <td style={{ ...td, fontWeight: 800 }}>{r.key}</td>
                <td style={{ ...tdN, ...vl }}>{r.count.toLocaleString()}</td>
                <td style={{ ...tdN, ...vlDouble }}>{amt(r.sales)}</td>
                <td style={{ ...tdN, ...vl }}>{amt(r.costs)}</td>
                <td style={{ ...tdN, ...vl, color: profitColor(r.profit, { neutral: INK }), fontWeight: 900 }}>{amt(r.profit) || "0"}</td>
                <td style={{ ...tdN, ...vl, color: marginColor(r.margin), fontWeight: 900 }}>{r.margin.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
          {showTotal && rows.length > 0 && <tfoot><tr>
            <td style={{ ...td, ...totalCell }} />
            <td style={{ ...td, ...totalCell }}>합계</td>
            <td style={{ ...tdN, ...vl, ...totalCell }}>{rows.reduce((s, r) => s + r.count, 0).toLocaleString()}</td>
            <td style={{ ...tdN, ...vlDouble, ...totalCell }}>{amt(ts)}</td>
            <td style={{ ...tdN, ...vl, ...totalCell }}>{amt(tc)}</td>
            <td style={{ ...tdN, ...vl, ...totalCell, color: profitColor(tp, { neutral: INK }) }}>{amt(tp) || "0"}</td>
            <td style={{ ...tdN, ...vl, ...totalCell, color: marginColor(ts > 0 ? (tp / ts) * 100 : 0, ts > 0) }}>{ts > 0 ? ((tp / ts) * 100).toFixed(1) : "0.0"}%</td>
          </tr></tfoot>}
        </LedgerTable>
      </section>
    );
  };

  let arCum = 0; let apCum = 0; let vatCum = 0;
  return (
    <div className="px-3 sm:px-6 py-5 space-y-4" data-testid="acct-ledger-books">
      {/* 장부 머리 — 이름 · 회계연도 · 연도 넘기기 */}
      <div className="rounded-[18px] border border-[#D3DBE8] bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3" style={{ background: "linear-gradient(180deg,#FFFFFF,#F6F8FC)", borderBottom: `3px double ${INK}` }}>
          <div className="min-w-0">
            <div className="text-[11px] font-extrabold tracking-[0.08em] text-[#4B6CB7]" style={NUM}>GENERAL LEDGER · 총계정원장</div>
            <h2 className="text-[19px] font-black text-[#0F1A30] leading-tight"><EditableText id="settlement.accounting.title" defaultText="회계 장부" /></h2>
            <p className="text-[13px] font-bold text-[#5B6B85] mt-0.5">회계연도 <span style={NUM}>{year}.01.01 ~ {year}.12.31</span> · 받을 돈 · 줄 돈 · 부가세 · 원가를 계정별로 봐요</p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-[13px] font-bold text-[#2D4C82]">저장 중…</span>}
            <div className="flex items-center rounded-xl border border-[#D3DBE8] bg-white overflow-hidden">
              <button type="button" onClick={() => setYear((y) => y - 1)} className="w-9 h-9 text-[15px] text-[#3A4A66] hover:bg-[#F3F6FB]" aria-label="지난해">‹</button>
              <span className="px-3 h-9 grid place-items-center text-[15px] font-black text-[#0F1A30] border-x border-[#E4E9F1]" style={NUM}>{year}년</span>
              <button type="button" onClick={() => setYear((y) => y + 1)} className="w-9 h-9 text-[15px] text-[#3A4A66] hover:bg-[#F3F6FB]" aria-label="다음 해">›</button>
            </div>
          </div>
        </div>
        {/* 색인 탭 — 계정 코드 · 계정 이름 */}
        <div className="flex gap-1 px-2 sm:px-3 pt-2 overflow-x-auto no-scrollbar bg-[#F6F8FC]" role="tablist">
          {TABS.map(([k, label, code, acc]) => {
            const on = subTab === k;
            return (
              <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setSubTab(k)}
                className={`shrink-0 text-left px-3.5 pt-2 pb-2.5 rounded-t-xl border border-b-0 transition-colors ${on ? "bg-white border-[#D3DBE8]" : "bg-transparent border-transparent hover:bg-white/60"}`}
                style={on ? { boxShadow: `inset 0 3px 0 ${INK}` } : undefined}>
                <span className="block text-[11px] font-black text-[#7A879C] whitespace-nowrap" style={NUM}>{code} · {acc}</span>
                <span className={`block text-[14.5px] font-black whitespace-nowrap ${on ? "text-[#0F1A30]" : "text-[#5B6B85]"}`}><EditableText id={`settlement.accounting.subtab.${k}`} defaultText={label} /></span>
              </button>
            );
          })}
        </div>
        <div className="px-4 sm:px-5 py-2 border-t border-[#D3DBE8] flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] font-bold text-[#5B6B85]">
          <span>계정 <b className="text-[#0F1A30]" style={NUM}>{tab[2]}</b> {tab[3]}</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: DR }} />차변 = 늘어난 쪽(자산) · 갚은 쪽(부채)</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CR }} />대변 = 줄어든 쪽(자산) · 생긴 쪽(부채)</span>
          <span className="ml-auto text-[#9AA9C3]">단위 · 원 · 두 줄 밑줄 = 합계</span>
        </div>
      </div>

      {/* ── 미수금 현황 · 108 외상매출금 ── */}
      {subTab === "ar" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <Tally label="총 청구액" code="차변" value={`${wonTxt(totalInvoiced)}원`} sub="부가세 포함 · 고정거래처 포함" />
            <Tally label="수금 완료" code="대변" value={`${wonTxt(totalArPaid)}원`} tone="ok" />
            <Tally label="미수금 잔액" code="잔액" value={`${wonTxt(totalAr)}원`} tone={totalAr > 0 ? "danger" : "ok"} />
            <Tally label="미수금 비율" value={totalInvoiced > 0 ? `${((totalAr / totalInvoiced) * 100).toFixed(1)}%` : "–"} sub="미수금 / 청구액" />
          </div>
          <LedgerTable minWidth={1000} caption="미수금 현황(외상매출금 원장)">
            <thead><tr>
              <th style={{ ...th, width: 48}}>No.</th>
              <th style={{ ...th, width: 120 }}><HeadLbl tag="계정">코드</HeadLbl></th>
              <SortH k="거래처" sortObj={acArSort} idp="settlement.ar.header." tag="적요" />
              <SortH k="연체 구분" sortObj={acArSort} idp="settlement.ar.header." tag="일자 · 경과" style={vl} />
              <SortH k="청구액" sortObj={acArSort} idp="settlement.ar.header." right tag="차변" color={DR} style={vlDouble} />
              <SortH k="수금액" sortObj={acArSort} idp="settlement.ar.header." right tag="대변" color={CR} style={vl} />
              <SortH k="미수금" sortObj={acArSort} idp="settlement.ar.header." right tag="잔액" style={vl} />
              <th style={{ ...th, ...vl}}><HeadLbl tag="누계">누계 잔액</HeadLbl></th>
              <th style={{ ...th, ...vlDouble, width: 150 }} />
            </tr></thead>
            <tbody>
              {!arByClient.length ? <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "#9AA9C3", height: 64 }}>배차완료 데이터가 없습니다</td></tr> : arSorted.map((r, i) => {
                const age = ageLabel(r.ageDays); arCum += r.outstanding;
                return (
                  <tr key={r.client} className="hover:bg-[#F5F8FD]" style={{ background: r.outstanding > 0 ? "#fff" : "#FAFBFD" }}>
                    <td style={{ ...td, ...NUM, textAlign: "center", color: "#9AA9C3", fontSize: 12.5 }}>{i + 1}</td>
                    <td style={{ ...td, textAlign: "center" }}><Code code="108" name="외상매출금" /></td>
                    <td style={{ ...td, fontWeight: 800, color: INK }}>{r.client}</td>
                    <td style={{ ...td, ...vl, textAlign: "center" }}>{r.outstanding > 0 ? <span className="inline-flex items-center gap-1.5"><span className="text-[12.5px] font-bold text-[#7A879C]" style={NUM}>D+{r.ageDays}</span><span className="px-1.5 py-0.5 rounded-md text-[12px] font-black" style={{ color: age.color, background: age.bg }}>{age.label}</span></span> : <span className="px-1.5 py-0.5 rounded-md text-[12px] font-black text-[#1F6F4A] bg-[#E8F5EE]">수금완료</span>}</td>
                    <td style={{ ...tdN, ...vlDouble, color: DR }}>{amt(r.invoiced)}</td>
                    <td style={{ ...tdN, ...vl, color: CR }}>{amt(r.paid)}</td>
                    <td style={{ ...tdN, ...vl, color: r.outstanding > 0 ? NEG : "#9AA9C3", fontWeight: r.outstanding > 0 ? 900 : 600 }}>{amt(r.outstanding) || "0"}</td>
                    <td style={{ ...tdN, ...vl, color: "#5B6B85", fontWeight: 600 }}>{amt(arCum) || "0"}</td>
                    <td style={{ ...td, ...vlDouble }}>
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => { setArModal(r.client); setArInput(""); }} className={btnDark}>입금 처리</button>
                        {r.paid > 0 && <button type="button" onClick={() => resetPayment("ar", r.client)} className={btnLine}>초기화</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {arByClient.length > 0 && <tfoot><tr>
              <td style={{ ...td, ...totalCell }} colSpan={4}>합계 · 거래처 {arByClient.length}곳</td>
              <td style={{ ...tdN, ...vlDouble, ...totalCell, color: DR }}>{amt(totalInvoiced) || "0"}</td>
              <td style={{ ...tdN, ...vl, ...totalCell, color: CR }}>{amt(totalArPaid) || "0"}</td>
              <td style={{ ...tdN, ...vl, ...totalCell, color: totalAr > 0 ? NEG : INK }}>{amt(totalAr) || "0"}</td>
              <td style={{ ...td, ...vl, ...totalCell }} colSpan={2} />
            </tr></tfoot>}
          </LedgerTable>
          <Foot>* 배차완료 기준 청구운임 합계(부가세 포함)예요. [입금 처리]를 누르면 저장되고, 수입·지출 장부 · 자금 잔액에도 반영돼요. 누계 잔액 = 위에서부터 미수금을 더한 값이에요.</Foot>
        </div>
      )}

      {/* ── 지급 현황 · 253 미지급금 ── */}
      {subTab === "ap" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <Tally label="총 기사운임" code="대변" value={`${wonTxt(totalAp)}원`} />
            <Tally label="지급 완료" code="차변" value={`${wonTxt(totalApPaid)}원`} tone="ok" />
            <Tally label="미지급 잔액" code="잔액" value={`${wonTxt(totalApOutstanding)}원`} tone={totalApOutstanding > 0 ? "danger" : "ok"} />
            <Tally label="미지급 비율" value={totalAp > 0 ? `${((totalApOutstanding / totalAp) * 100).toFixed(1)}%` : "–"} sub="미지급 / 기사운임" />
          </div>
          <LedgerTable minWidth={1000} caption="지급 현황(미지급금 원장)">
            <thead><tr>
              <th style={{ ...th, width: 48}}>No.</th>
              <th style={{ ...th, width: 116 }}><HeadLbl tag="계정">코드</HeadLbl></th>
              <SortH k="기사명" sortObj={acApSort} idp="settlement.ap.header." tag="적요" />
              <SortH k="차량번호" sortObj={acApSort} idp="settlement.ap.header." tag="차량" style={vl} />
              <SortH k="지급액" sortObj={acApSort} idp="settlement.ap.header." right tag="차변" color={DR} style={vlDouble} />
              <SortH k="기사운임 합계" sortObj={acApSort} idp="settlement.ap.header." right tag="대변" color={CR} style={vl} />
              <SortH k="미지급" sortObj={acApSort} idp="settlement.ap.header." right tag="잔액" style={vl} />
              <th style={{ ...th, ...vl}}><HeadLbl tag="누계">누계 잔액</HeadLbl></th>
              <th style={{ ...th, ...vlDouble, width: 150 }} />
            </tr></thead>
            <tbody>
              {!apByDriver.length ? <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "#9AA9C3", height: 64 }}>배차완료 데이터가 없습니다</td></tr> : apSorted.map((r, i) => {
                apCum += r.outstanding;
                return (
                  <tr key={r.driver} className="hover:bg-[#F5F8FD]" style={{ background: r.outstanding > 0 ? "#fff" : "#FAFBFD" }}>
                    <td style={{ ...td, ...NUM, textAlign: "center", color: "#9AA9C3", fontSize: 12.5 }}>{i + 1}</td>
                    <td style={{ ...td, textAlign: "center" }}><Code code="253" name="미지급금" /></td>
                    <td style={{ ...td, fontWeight: 800, color: INK }}>{r.driver}</td>
                    <td style={{ ...td, ...vl, ...NUM, fontSize: 13, color: "#5B6B85", textAlign: "center" }}>{r.carNo || "–"}</td>
                    <td style={{ ...tdN, ...vlDouble, color: DR }}>{amt(r.paid)}</td>
                    <td style={{ ...tdN, ...vl, color: CR }}>{amt(r.total)}</td>
                    <td style={{ ...tdN, ...vl, color: r.outstanding > 0 ? NEG : "#9AA9C3", fontWeight: r.outstanding > 0 ? 900 : 600 }}>{amt(r.outstanding) || "0"}</td>
                    <td style={{ ...tdN, ...vl, color: "#5B6B85", fontWeight: 600 }}>{amt(apCum) || "0"}</td>
                    <td style={{ ...td, ...vlDouble }}>
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => { setApModal(r.driver); setApInput(""); }} className={btnDark}>지급 처리</button>
                        {r.paid > 0 && <button type="button" onClick={() => resetPayment("ap", r.driver)} className={btnLine}>초기화</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {apByDriver.length > 0 && <tfoot><tr>
              <td style={{ ...td, ...totalCell }} colSpan={4}>합계 · 기사 {apByDriver.length}명</td>
              <td style={{ ...tdN, ...vlDouble, ...totalCell, color: DR }}>{amt(totalApPaid) || "0"}</td>
              <td style={{ ...tdN, ...vl, ...totalCell, color: CR }}>{amt(totalAp) || "0"}</td>
              <td style={{ ...tdN, ...vl, ...totalCell, color: totalApOutstanding > 0 ? NEG : INK }}>{amt(totalApOutstanding) || "0"}</td>
              <td style={{ ...td, ...vl, ...totalCell }} colSpan={2} />
            </tr></tfoot>}
          </LedgerTable>
          <Foot>* 배차완료 기준 기사운임 합계예요. 줄 돈(부채)이라 생긴 돈은 대변, 드린 돈은 차변에 적어요. [지급 처리]를 누르면 저장돼요.</Foot>
        </div>
      )}

      {/* ── 부가세 자료 · 255 부가세예수금 / 135 부가세대급금 ── */}
      {subTab === "vat" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-black text-[#3A4A66]">분기</span>
            {["Q1", "Q2", "Q3", "Q4"].map((q) => (
              <button key={q} type="button" onClick={() => setVatQuarter(q)}
                className={`h-9 px-3.5 rounded-xl text-[13.5px] font-black border transition ${vatQuarter === q ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white border-[#D3DBE8] text-[#5B6B85] hover:bg-[#F7F9FC]"}`}>
                {q} <span className="font-bold opacity-80">({q === "Q1" ? "1~3월" : q === "Q2" ? "4~6월" : q === "Q3" ? "7~9월" : "10~12월"})</span>
              </button>
            ))}
            <button type="button" onClick={exportVatExcel} className="ml-auto h-9 px-3.5 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black hover:opacity-90">엑셀 내보내기</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            <Tally label="계산서 매출 공급가액" value={`${currentQData.sales.toLocaleString()}원`} />
            <Tally label="매출세액 (10%)" code="255" value={`${vatOutput.toLocaleString()}원`} />
            <Tally label="계산서 받는 기사 운임" value={`${currentQData.costs.toLocaleString()}원`} sub="기사관리 세금계산서 발행 기사" />
            <Tally label="매입세액 (10%)" code="135" value={`${vatInput.toLocaleString()}원`} />
            <Tally label="예상 납부세액" value={`${vatNet.toLocaleString()}원`} tone={vatNet > 0 ? "danger" : "ok"} sub="매출세액 − 매입세액(추정)" />
            <Tally label="과세 기준" value="일반과세" sub="10% 부가가치세 적용" />
          </div>
          <LedgerTable minWidth={980} caption="부가세 월별 명세">
            <thead><tr>
              <th style={{ ...th, width: 96 }}><HeadLbl tag="일자">월</HeadLbl></th>
              <th style={{ ...th, ...vl}}><HeadLbl tag="공급가액"><EditableText id="settlement.vatMonthly.header.계산서 매출" defaultText="계산서 매출" /></HeadLbl></th>
              <th style={{ ...th, ...vlDouble}}><HeadLbl tag="대변 · 255" color={CR}><EditableText id="settlement.vatMonthly.header.매출세액" defaultText="매출세액" /></HeadLbl></th>
              <th style={{ ...th, ...vl}}><HeadLbl tag="공급가액"><EditableText id="settlement.vatMonthly.header.기사 운임(계산서)" defaultText="기사 운임(계산서)" /></HeadLbl></th>
              <th style={{ ...th, ...vl}}><HeadLbl tag="차변 · 135" color={DR}><EditableText id="settlement.vatMonthly.header.매입세액" defaultText="매입세액" /></HeadLbl></th>
              <th style={{ ...th, ...vlDouble}}><HeadLbl tag="잔액"><EditableText id="settlement.vatMonthly.header.납부세액" defaultText="납부세액" /></HeadLbl></th>
              <th style={{ ...th, ...vl}}><HeadLbl tag="누계">분기 누계</HeadLbl></th>
            </tr></thead>
            <tbody>
              {currentQData.months.map(({ mo, sales, costs }) => {
                const vOut = Math.round(sales * 0.1); const vIn = Math.round(costs * 0.1); const vNet = vOut - vIn; vatCum += vNet;
                return (
                  <tr key={mo} className="hover:bg-[#F5F8FD]">
                    <td style={{ ...td, ...NUM, fontWeight: 800, textAlign: "center" }}>{year}.{mo}</td>
                    <td style={{ ...tdN, ...vl }}>{amt(sales) || "–"}</td>
                    <td style={{ ...tdN, ...vlDouble, color: CR }}>{amt(vOut) || "–"}</td>
                    <td style={{ ...tdN, ...vl }}>{amt(costs) || "–"}</td>
                    <td style={{ ...tdN, ...vl, color: DR }}>{amt(vIn) || "–"}</td>
                    <td style={{ ...tdN, ...vlDouble, fontWeight: 900, color: vNet > 0 ? NEG : vNet < 0 ? "#1F6F4A" : "#9AA9C3" }}>{amt(vNet) || "–"}</td>
                    <td style={{ ...tdN, ...vl, color: "#5B6B85", fontWeight: 600 }}>{amt(vatCum) || "0"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr>
              <td style={{ ...td, ...totalCell }}>합계</td>
              <td style={{ ...tdN, ...vl, ...totalCell }}>{amt(currentQData.sales) || "–"}</td>
              <td style={{ ...tdN, ...vlDouble, ...totalCell, color: CR }}>{amt(vatOutput) || "–"}</td>
              <td style={{ ...tdN, ...vl, ...totalCell }}>{amt(currentQData.costs) || "–"}</td>
              <td style={{ ...tdN, ...vl, ...totalCell, color: DR }}>{amt(vatInput) || "–"}</td>
              <td style={{ ...tdN, ...vlDouble, ...totalCell, color: vatNet > 0 ? NEG : vatNet < 0 ? "#1F6F4A" : INK }}>{amt(vatNet) || "–"}</td>
              <td style={{ ...td, ...vl, ...totalCell }} />
            </tr></tfoot>
          </LedgerTable>
          <Foot>* 매출세액은 지급방식 계산서 오더 청구운임, 매입세액은 기사관리에서 세금계산서 발행 기사로 켠 기사의 운임으로 셉니다. 실제 신고는 세무사 확인을 권장합니다.</Foot>
        </div>
      )}

      {/* ── 원가 분석 · 401 매출 / 451 매출원가 ── */}
      {subTab === "cost" && (
        <div className="space-y-5">
          {costTable({ rows: costByType, sorted: typeSorted, sortObj: acTypeSort, first: "차량 종류", codeKey: "원가(기사운임)", idp: "settlement.costByType.header.", titleId: "settlement.costByType.title", title: "차량 종류별 원가 분석", showTotal: true })}
          {costTable({ rows: costByMethod, sorted: methodSorted, sortObj: acMethodSort, first: "배차 방식", codeKey: "원가", idp: "settlement.costByMethod.header.", titleId: "settlement.costByMethod.title", title: "배차 방식별 원가 분석" })}
          <section className="space-y-2">
            <div className="flex items-center gap-2"><span className="w-1.5 h-5 rounded-full bg-[#0F1A30]" /><h3 className="text-[15px] font-black text-[#0F1A30]"><EditableText id="settlement.monthlyTrend.title" defaultText="월별 매출·이익 추이" /></h3></div>
            <LedgerTable minWidth={720} caption="월별 매출 · 이익 추이">
              <thead><tr>
                <th style={{ ...th, width: 96 }}><HeadLbl tag="일자"><EditableText id="settlement.monthlyTrend.header.월" defaultText="월" /></HeadLbl></th>
                <th style={{ ...th, ...vlDouble}}><HeadLbl tag="401"><EditableText id="settlement.monthlyTrend.header.매출" defaultText="매출" /></HeadLbl></th>
                <th style={{ ...th, ...vl}}><HeadLbl tag="451"><EditableText id="settlement.monthlyTrend.header.원가" defaultText="원가" /></HeadLbl></th>
                <th style={{ ...th, ...vl}}><HeadLbl tag="매출총이익"><EditableText id="settlement.monthlyTrend.header.이익" defaultText="이익" /></HeadLbl></th>
                <th style={{ ...th, ...vl}}><HeadLbl tag="%"><EditableText id="settlement.monthlyTrend.header.이익률" defaultText="이익률" /></HeadLbl></th>
              </tr></thead>
              <tbody>
                {MONTHS.map((mo) => {
                  const d = vatData.monthly[mo] || { sales: 0, costs: 0 };
                  const profit = d.sales - d.costs; const margin = d.sales > 0 ? (profit / d.sales) * 100 : 0; const empty = d.sales === 0;
                  return (
                    <tr key={mo} className="hover:bg-[#F5F8FD]" style={{ background: empty ? "#FAFBFD" : "#fff" }}>
                      <td style={{ ...td, ...NUM, fontWeight: 800, textAlign: "center", color: empty ? "#B5C0D3" : INK }}>{year}.{mo}</td>
                      <td style={{ ...tdN, ...vlDouble, color: empty ? "#CBD3E0" : INK }}>{amt(d.sales) || "–"}</td>
                      <td style={{ ...tdN, ...vl, color: d.costs ? INK : "#CBD3E0" }}>{amt(d.costs) || "–"}</td>
                      <td style={{ ...tdN, ...vl, fontWeight: profit ? 900 : 600, color: profitColor(profit, { neutral: "#CBD3E0" }) }}>{amt(profit) || "–"}</td>
                      <td style={{ ...tdN, ...vl, fontWeight: 900, color: marginColor(margin, !empty) }}>{empty ? "–" : `${margin.toFixed(1)}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
              {(() => { const s = MONTHS.reduce((a, mo) => a + (vatData.monthly[mo]?.sales || 0), 0); const c = MONTHS.reduce((a, mo) => a + (vatData.monthly[mo]?.costs || 0), 0); const p = s - c; return (
                <tfoot><tr>
                  <td style={{ ...td, ...totalCell }}>{year}년 합계</td>
                  <td style={{ ...tdN, ...vlDouble, ...totalCell }}>{amt(s) || "0"}</td>
                  <td style={{ ...tdN, ...vl, ...totalCell }}>{amt(c) || "0"}</td>
                  <td style={{ ...tdN, ...vl, ...totalCell, color: profitColor(p, { neutral: INK }) }}>{amt(p) || "0"}</td>
                  <td style={{ ...tdN, ...vl, ...totalCell, color: marginColor(s ? (p / s) * 100 : 0, s > 0) }}>{s ? `${((p / s) * 100).toFixed(1)}%` : "–"}</td>
                </tr></tfoot>
              ); })()}
            </LedgerTable>
          </section>
        </div>
      )}

      {/* 입금 · 지급 처리 창 */}
      {[["ar", arModal, setArModal, arInput, setArInput, "입금 처리", "미수금 잔액", (n) => arByClient.find((r) => r.client === n)?.outstanding || 0, "입금액 입력 (원)", "대변 · 108 외상매출금"],
        ["ap", apModal, setApModal, apInput, setApInput, "지급 처리", "미지급 잔액", (n) => apByDriver.find((r) => r.driver === n)?.outstanding || 0, "지급액 입력 (원)", "차변 · 253 미지급금"]].map(([type, name, setName, val, setVal, title, balLbl, balOf, ph, side]) => name && (
        <div key={type} className="fixed inset-0 bg-[#0F1A30]/45 z-[99999] flex items-center justify-center p-4">
          <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-4 pb-3" style={{ borderBottom: `3px double ${INK}` }}>
              <div className="text-[11px] font-black tracking-[0.08em] text-[#7A879C]" style={NUM}>{side}</div>
              <div className="font-black text-[17px] text-[#0F1A30]">{title}</div>
              <div className="text-[13.5px] font-bold text-[#5B6B85]">{name}</div>
            </div>
            <div className="px-5 py-4">
              <div className="mb-2 flex items-baseline justify-between text-[13.5px] font-bold text-[#5B6B85]">{balLbl}<b className="text-[16px] text-[#0F1A30]" style={NUM}>{balOf(name).toLocaleString()}원</b></div>
              <input autoComplete="off" inputMode="numeric" value={val ? Number(String(val).replace(/[^\d]/g, "") || 0).toLocaleString() : ""} onChange={(e) => setVal(e.target.value.replace(/[^\d]/g, ""))} placeholder={ph}
                className="w-full h-12 border border-[#D3DBE8] rounded-xl px-3 text-[17px] font-black text-right outline-none focus:border-[#2D4C82]" style={NUM} autoFocus />
              <div className="flex gap-2 justify-end mt-4">
                <button type="button" onClick={() => setName(null)} className="h-11 px-4 rounded-xl border border-[#D3DBE8] text-[14px] font-black text-[#5B6B85] hover:bg-[#F7F9FC]"><EditableText id={type === "ar" ? "misc.btn.43168.취소" : "misc.btn.43196.취소"} defaultText="취소" /></button>
                <button type="button" onClick={async () => { await savePayment(type, name, val); setName(null); }} className="h-11 px-5 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black hover:opacity-90">저장</button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
