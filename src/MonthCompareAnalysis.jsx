// ===================== 월 비교 분석 화면 (PC·모바일 공용) =====================
import React, { useMemo, useState, useEffect, useRef } from "react";
import { html2canvas } from "./lazyLoad"; // ⭐ 2026-11-02 속도 — 캡처 라이브러리는 처음 캡처할 때 받는다
import jsPDF from "jspdf";
import { analyzeMonths, buildReport, COMPARE_DIMS, toWon, MARGIN_BANDS } from "./monthCompare";
import { CustomSelect } from "./CustomSelect";

const NAVY = "#1B2B4B";
// ⭐ 2026-11-07 디자인 통일 — 다른 경영 화면(일일 경영 보고 · 경영 분석)과 같은 남색 팔레트 · 증감은 상승 빨강 ▲ / 하락 파랑 ▼
const INK = "#0F1A30", SUB = "#3A4A66", MUTE = "#5B6B86", LINE_C = "#E3E8F0", SOFT = "#F4F7FB";
const UP = "#D92D20", DOWN = "#1E5BD8", FLAT = "#6B7588";
const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const HERO_BG = "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)";
const Eyebrow = ({ children, light, style }) => <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: "0.24em", textTransform: "uppercase", color: light ? "#8FB0F0" : "#2D4C82", ...style }}>{children}</div>;
const won = (v) => `${Math.round(v).toLocaleString()}원`;
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const mLabel = (m) => `${String(m).slice(0, 4)}년 ${Number(String(m).slice(5, 7))}월`;
const shiftMonth = (m, d) => { const [y, mm] = m.split("-").map(Number); const t = new Date(y, mm - 1 + d, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`; };
const kstMonth = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
const TONE = {
  bad: { bg: "#FEF3F2", border: "#FECDCA", bar: UP, title: "#B42318" },
  warn: { bg: "#F5F8FD", border: "#C9D6EE", bar: "#2D4C82", title: "#2D4C82" },
  info: { bg: SOFT, border: "#DCE3EE", bar: NAVY, title: NAVY },
};

function Delta({ v, money = true, isRate = false }) {
  if (!v) return <span style={{ color: FLAT }}>-</span>;
  const up = v > 0;
  const txt = isRate ? `${up ? "+" : ""}${(v * 100).toFixed(1)}%p` : `${up ? "+" : "−"}${money ? Math.abs(Math.round(v)).toLocaleString() + "원" : Math.abs(v)}`;
  return <span style={{ color: up ? UP : DOWN, fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{up ? "▲ " : "▼ "}{txt}</span>;
}

// ⭐ 뱃지 — 이미지/PDF 저장(html2canvas) 때 flex 가운데 정렬 글자가 아래로 밀려 찍히던 문제가 있어,
// flex 대신 높이 = line-height로 세로 가운데를 맞춘다(브라우저와 캡처 결과가 같게 나옴).
function Badge({ h = 22, size = 12, bg, color = "#fff", style, children }) {
  return (
    <span style={{ display: "inline-block", height: h, lineHeight: `${h}px`, fontSize: size, fontWeight: 900, color, background: bg, borderRadius: 5, padding: "0 8px", whiteSpace: "nowrap", verticalAlign: "middle", ...style }}><span className="mca-badge-t" style={{ position: "relative" }}>{children}</span></span>
  );
}

// ⭐ 리포트 표 — 구분선·가운데 정렬. 셀 값은 문자열 또는 [윗줄, 아랫줄]
const TONE_COLOR = { good: NAVY, bad: UP, warn: "#2D4C82", neutral: SUB };
function ReportTable({ head, rows, compact }) {
  const LINE = `1px solid ${LINE_C}`;
  const cols = compact ? "minmax(0,0.9fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1.2fr)";
  const cell = (v, i, extra = {}) => {
    let lines = Array.isArray(v) ? v.filter(Boolean) : [v];
    // 좁은 화면: "506건 · 7,032만원"을 두 줄로 나눠 어색한 줄바꿈 방지
    let mainCnt = 1;
    if (compact && typeof lines[0] === "string" && lines[0].includes(" · ")) { const parts = lines[0].split(" · "); mainCnt = parts.length; lines = [...parts, ...lines.slice(1)]; }
    return (
      <div style={{ padding: compact ? "9px 4px" : "12px 10px", borderLeft: i ? LINE : "none", textAlign: "center", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", background: extra.background, color: extra.color }}>
        {extra.badge && <Badge h={compact ? 20 : 22} size={compact ? 11 : 12} bg={UP} style={{ marginBottom: 4, borderRadius: 99, padding: "0 9px" }}>{extra.badge}</Badge>}
        {lines.map((t, k) => (
          <div key={k} style={{ fontSize: (k >= mainCnt) ? (compact ? 13 : 14) : (compact ? 14 : 16), fontWeight: (k >= mainCnt) ? 800 : 900, color: (k >= mainCnt) ? (extra.subColor || SUB) : (extra.color || INK), lineHeight: 1.4, fontVariantNumeric: "tabular-nums", marginTop: k ? 2 : 0, wordBreak: "keep-all", overflowWrap: "anywhere" }}>{t}</div>
        ))}
      </div>
    );
  };
  return (
    <div style={{ border: LINE, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: cols, background: SOFT, borderBottom: `1px solid ${LINE_C}` }}>
        {head.map((t, i) => (
          <div key={i} style={{ padding: compact ? "9px 4px" : "11px 10px", borderLeft: i ? LINE : "none", textAlign: "center", fontSize: compact ? 14 : 15, fontWeight: 900, color: i === 2 ? "#fff" : NAVY, background: i === 2 ? NAVY : "transparent" }}>{t}</div>
        ))}
      </div>
      {rows.map((r, idx) => (
        // ⭐ 주요 원인 행 — 빨간 배경·왼쪽 굵은 띠·"주요 원인" 뱃지로 한눈에 보이게
        <div key={idx} style={{ display: "grid", gridTemplateColumns: cols, borderTop: idx ? LINE : "none", background: r.major ? "#FEF3F2" : "transparent", boxShadow: r.major ? `inset 4px 0 0 ${UP}` : "none" }}>
          {cell(r.label, 0, { background: r.major ? "transparent" : "#FAFBFD", color: r.major ? "#B42318" : INK, badge: r.major ? "주요 원인" : null })}
          {cell(r.a, 1)}
          {cell(r.b, 2)}
          {cell(r.d, 3, { color: TONE_COLOR[r.tone] || INK, subColor: r.major ? "#B42318" : undefined })}
        </div>
      ))}
    </div>
  );
}

// ⭐ 좌우 비교 — 왼쪽 A월, 오른쪽 B월, 마지막 칸 "A월 대비 B월" 증감
function MonthSideBySide({ res, a, b, compact }) {
  const A = res.detailA, B = res.detailB;
  const n = (v) => Math.round(v).toLocaleString();
  const money = (v) => `${n(v)}원`;
  const pctOf = (va, vb) => (va ? ((vb - va) / Math.abs(va)) * 100 : null);
  const diffEl = (va, vb, kind = "money", goodUp = true) => {
    const d = vb - va;
    if (kind === "rate") {
      const p = d * 100;
      if (Math.abs(p) < 0.05) return <span style={{ color: FLAT, fontWeight: 800 }}>변동 없음</span>;
      return <span style={{ color: p > 0 ? UP : DOWN, fontWeight: 900, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{p > 0 ? "▲ +" : "▼ "}{p.toFixed(1)}%p</span>;
    }
    if (!d) return <span style={{ color: FLAT, fontWeight: 800 }}>변동 없음</span>;
    const pc = pctOf(va, vb);
    const color = d > 0 ? UP : DOWN;
    return (
      <span style={{ color, fontWeight: 900, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {d > 0 ? "▲ +" : "▼ −"}{kind === "cnt" ? `${n(Math.abs(d))}건` : kind === "num" ? n(Math.abs(d)) : money(Math.abs(d))}
        {pc != null && <span style={{ fontSize: 12, fontWeight: 800, marginLeft: 4 }}>({pc > 0 ? "+" : ""}{pc.toFixed(1)}%)</span>}
      </span>
    );
  };
  const fmt = (v, kind) => kind === "rate" ? `${(v * 100).toFixed(1)}%` : kind === "cnt" ? `${n(v)}건` : kind === "num" ? n(v) : money(v);

  const groups = [
    { title: "기본 실적", rows: [
      ["총 매출 (청구운임)", A.sale, B.sale, "money"],
      ["총 기사운임", A.driver, B.driver, "money", false],
      ["총 수익", A.profit, B.profit, "money"],
      ["수익률", A.rate, B.rate, "rate"],
      ["총 건수", A.cnt, B.cnt, "cnt"],
    ] },
    { title: "건당 평균", rows: [
      ["건당 평균 매출", A.avgSale, B.avgSale, "money"],
      ["건당 평균 기사운임", A.avgDriver, B.avgDriver, "money", false],
      ["건당 평균 수익", A.avgProfit, B.avgProfit, "money"],
    ] },
    { title: "지급방식별 (매출 · 건수)", rows: res.payKeys.map((k) => {
      const pa = A.pay[k] || { cnt: 0, sale: 0, driver: 0 }, pb = B.pay[k] || { cnt: 0, sale: 0, driver: 0 };
      return [k, pa, pb, "pay"];
    }) },
    { title: "수익률 구간별 (매출 · 건수) — 마진 낮은 오더가 늘었는지 확인", rows: MARGIN_BANDS.map((bd) => [bd.label, A.bands[bd.key], B.bands[bd.key], "pay", bd.key === "15" || bd.key === "10"]) },
    { title: "손실", rows: [
      ["총 손실금액 (역마진)", A.lossAmt, B.lossAmt, "money", false, `${A.lossCnt}건`, `${B.lossCnt}건`],
      ["└ 청구운임 미입력 운반비", A.noSaleDriver, B.noSaleDriver, "money", false, `${A.noSaleCnt}건`, `${B.noSaleCnt}건`],
    ] },
    { title: "운영", rows: [
      ["운행일수 (오더 있는 날)", A.days, B.days, "num"],
      ["일평균 매출", A.perDaySale, B.perDaySale, "money"],
      ["일평균 건수", A.perDayCnt, B.perDayCnt, "num"],
      ["거래처 수", A.clients, B.clients, "num"],
      ...(A.fixedCnt || B.fixedCnt ? [["고정거래처 매출", A.fixedSale, B.fixedSale, "money", true, `${A.fixedCnt}건`, `${B.fixedCnt}건`]] : []),
    ] },
  ];

  // 좁은 화면: 항목명은 위 한 줄, 아래에 [A월 | B월(증감)] 두 칸
  const cols = compact ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.1fr)";
  const headA = { background: SOFT, color: NAVY }, headB = { background: NAVY, color: "#fff" };
  // ⭐ 칸 사이 세로 구분선 + 가운데 정렬
  const LINE = `1px solid ${LINE_C}`;
  const cellBox = (first) => ({ padding: compact ? "8px 8px" : "10px 12px", borderLeft: first ? "none" : LINE, textAlign: "center", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" });
  const valCell = (main, sub, strong) => (
    <div style={{ textAlign: "center", minWidth: 0 }}>
      <div style={{ fontSize: compact ? 14 : 15, fontWeight: strong ? 900 : 700, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{main}</div>
      {sub && <div style={{ fontSize: 13, fontWeight: 700, color: MUTE, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 16, overflow: "hidden", flexShrink: 0, boxShadow: "0 1px 2px rgba(15,26,48,.04)" }}>
      {/* 한 줄 요약 */}
      <div style={{ padding: compact ? "12px 14px" : "14px 18px", borderBottom: `1px solid ${LINE_C}`, display: "flex", flexWrap: "wrap", gap: "6px 16px", alignItems: "baseline" }}>
        <span style={{ fontSize: compact ? 16 : 17, fontWeight: 900, color: NAVY }}>{a} 대비 {b}</span>
        {[["매출", A.sale, B.sale, "money"], ["건수", A.cnt, B.cnt, "cnt"], ["수익", A.profit, B.profit, "money"], ["기사운임", A.driver, B.driver, "money", false]].map(([l, va, vb, k, g]) => (
          <span key={l} style={{ fontSize: 14, fontWeight: 700, color: SUB, whiteSpace: "nowrap" }}>{l} {diffEl(va, vb, k, g !== false)}</span>
        ))}
      </div>
      {/* 머리줄 */}
      <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "stretch", borderBottom: `1px solid ${LINE_C}` }}>
        {!compact && <span style={{ ...cellBox(true), fontSize: 14, fontWeight: 900, color: NAVY, background: SOFT }}>항목</span>}
        <span style={{ ...cellBox(compact), ...headA, fontSize: 15, fontWeight: 900 }}>{a}</span>
        {compact ? (
          <span style={{ ...cellBox(false), ...headB, fontSize: 15, fontWeight: 900 }}>{b} <span style={{ fontSize: 11, opacity: .8 }}>(증감)</span></span>
        ) : (
          <>
            <span style={{ ...cellBox(false), ...headB, fontSize: 15, fontWeight: 900 }}>{b}</span>
            <span style={{ ...cellBox(false), fontSize: 14, fontWeight: 900, color: NAVY, background: SOFT }}>{a} 대비 {b}</span>
          </>
        )}
      </div>
      {groups.filter((g) => g.rows.length).map((g) => (
        <div key={g.title}>
          <div style={{ padding: compact ? "8px 12px" : "9px 18px", fontSize: 13.5, fontWeight: 900, color: "#2D4C82", background: "#F7F9FC", borderTop: `1px solid ${LINE_C}`, borderBottom: `1px solid ${LINE_C}`, textAlign: "left", letterSpacing: "0.02em" }}>{g.title}</div>
          {g.rows.map(([label, va, vb, kind, goodUp = true, subA, subB]) => {
            const isPay = kind === "pay";
            const mainA = isPay ? (va.cnt ? money(va.sale) : "-") : fmt(va, kind);
            const mainB = isPay ? (vb.cnt ? money(vb.sale) : "-") : fmt(vb, kind);
            const sA = isPay ? (va.cnt ? `${va.cnt}건 · 수익 ${n(va.sale - va.driver)}` : "") : subA;
            const sB = isPay ? (vb.cnt ? `${vb.cnt}건 · 수익 ${n(vb.sale - vb.driver)}` : "") : subB;
            // 지급방식 "손실"처럼 매출이 두 달 다 0원이면 수익(손해) 기준으로 비교
            const payNoSale = isPay && !va.sale && !vb.sale;
            const diff = isPay ? (payNoSale ? diffEl(va.sale - va.driver, vb.sale - vb.driver, "money") : diffEl(va.sale, vb.sale, "money", goodUp)) : diffEl(va, vb, kind, goodUp);
            const strong = ["총 매출 (청구운임)", "총 수익", "총 손실금액 (역마진)"].includes(label);
            return (
              <div key={label} style={{ display: "grid", gridTemplateColumns: cols, alignItems: "stretch", borderTop: "1px solid #EEF2F7" }}>
                <span style={{ ...cellBox(true), fontSize: 14, fontWeight: 800, color: INK, gridColumn: compact ? "1 / -1" : undefined, background: compact ? "#FAFBFD" : "transparent", borderBottom: compact ? "1px solid #EEF2F7" : "none", padding: compact ? "6px 8px" : undefined }}>{label}</span>
                <div style={cellBox(compact)}>{valCell(mainA, sA, strong)}</div>
                {compact ? (
                  <div style={cellBox(false)}>
                    {valCell(mainB, sB, strong)}
                    <div style={{ fontSize: 12 }}>{diff}</div>
                  </div>
                ) : (
                  <>
                    <div style={cellBox(false)}>{valCell(mainB, sB, strong)}</div>
                    <div style={{ ...cellBox(false), fontSize: 14 }}>
                      {diff}
                      {isPay && (va.cnt || vb.cnt) ? <div style={{ fontSize: 13, fontWeight: 700, color: MUTE }}>건수 {vb.cnt - va.cnt >= 0 ? "+" : "−"}{Math.abs(vb.cnt - va.cnt)}건</div> : null}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// 두 달 비교 행 — PC는 [항목 | A | B] 한 줄, 좁은 화면은 항목 아래 A/B 두 칸
function CompareRows({ items, a, b, compact }) {
  const LINE = `1px solid ${LINE_C}`;
  const cols = compact ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr)";
  const cell = (c, label, first) => (
    <div style={{ textAlign: "center", padding: compact ? "8px 6px" : "10px 10px", borderLeft: first ? "none" : LINE, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {compact && <div style={{ fontSize: 13, fontWeight: 800, color: MUTE }}>{label}</div>}
      <div style={{ fontSize: 15, fontWeight: 900, color: c.bad ? UP : INK, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{c.main}</div>
      {c.sub && <div style={{ fontSize: 13, fontWeight: 700, color: MUTE, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</div>}
    </div>
  );
  return (
    <div style={{ border: LINE, borderRadius: 14, overflow: "hidden" }}>
      {!compact && (
        <div style={{ display: "grid", gridTemplateColumns: cols, background: SOFT, borderBottom: LINE, fontSize: 14, fontWeight: 900, color: NAVY, textAlign: "center" }}>
          <span style={{ padding: "10px" }}>구분</span>
          <span style={{ padding: "10px", borderLeft: LINE }}>{a}</span>
          <span style={{ padding: "10px", borderLeft: LINE, background: NAVY, color: "#fff" }}>{b}</span>
        </div>
      )}
      {items.map((it, idx) => (
        <div key={it.key} style={{ display: "grid", gridTemplateColumns: cols, borderTop: idx ? LINE : "none" }}>
          <div style={{ gridColumn: compact ? "1 / -1" : undefined, minWidth: 0, textAlign: "center", padding: compact ? "8px 6px" : "10px 10px", background: "#FAFBFD", borderBottom: compact ? LINE : "none" }}>{it.head}</div>
          {cell(it.cells[0], a, compact)}
          {cell(it.cells[1], b, false)}
        </div>
      ))}
    </div>
  );
}

export default function MonthCompareAnalysis({ rows = [], isExcluded = () => false, hasExcluded = false, onClose, compact = false }) {
  const months = useMemo(() => {
    const s = new Set(rows.map((r) => String(r.상차일 || "").slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)));
    return [...s].sort().reverse();
  }, [rows]);
  // 기본: 지난달 vs 그 전달(이번 달은 아직 진행 중이라 비교가 왜곡됨)
  const [monthB, setMonthB] = useState(() => shiftMonth(kstMonth(), -1));
  const [monthA, setMonthA] = useState(() => shiftMonth(kstMonth(), -2));
  const [scope, setScope] = useState(hasExcluded ? "pure" : "all");
  const [dimKey, setDimKey] = useState("client");
  const [showAllRows, setShowAllRows] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const res = useMemo(() => analyzeMonths({ rows, monthA, monthB, scope, isExcluded }), [rows, monthA, monthB, scope, isExcluded]);
  const report = useMemo(() => buildReport(res), [res]);
  // ⭐ 이미지(PNG) / PDF 저장 — 리포트 부분(결론~원인이 아닌 것 + 펼친 상세 자료)을 그대로 캡처
  const reportRef = useRef(null);
  const [saving, setSaving] = useState("");
  const exportReport = async (type) => {
    const el = reportRef.current;
    if (!el || saving) return;
    setSaving(type);
    try {
      const canvas = await html2canvas(el, {
        scale: 2, backgroundColor: "#F4F7FB", useCORS: true, logging: false,
        // 스크롤 영역 밖으로 잘린 부분까지 전부 찍히도록 복제본에서는 높이 제한을 푼다
        onclone: (doc) => {
          const sc = doc.querySelector(".mca-scroll");
          if (sc) { sc.style.overflow = "visible"; sc.style.height = "auto"; sc.style.maxHeight = "none"; sc.style.flex = "none"; }
          // 캡처 라이브러리가 이 글꼴의 글자를 실제보다 아래에 그려서, 저장용 복제본에서만 살짝 올린다
          doc.querySelectorAll(".mca-badge-t").forEach((t) => { t.style.top = "-0.3em"; });
          let p = sc?.parentElement;
          while (p && p !== doc.body) { p.style.overflow = "visible"; p.style.height = "auto"; p.style.maxHeight = "none"; p = p.parentElement; }
        },
      });
      const name = `월비교분석_${monthA}_vs_${monthB}_${scope === "pure" ? "순수운송" : scope === "all" ? "전체" : "제외거래처"}`;
      if (type === "png") {
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `${name}.png`;
        a.click();
      } else {
        const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
        const margin = 8, pw = 210 - margin * 2, ph = 297 - margin * 2;
        const pxPerMm = canvas.width / pw;
        const sliceH = Math.floor(ph * pxPerMm);
        for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
          const h = Math.min(sliceH, canvas.height - y);
          const part = document.createElement("canvas");
          part.width = canvas.width; part.height = h;
          const ctx = part.getContext("2d");
          ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, part.width, h);
          ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
          if (page) pdf.addPage();
          pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, pw, h / pxPerMm);
        }
        pdf.save(`${name}.pdf`);
      }
    } catch (e) {
      console.error("월 비교 분석 저장 실패:", e);
      window.alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving("");
    }
  };
  const [detailTab, setDetailTab] = useState("");
  const [showAnomalyList, setShowAnomalyList] = useState(false);
  const { A } = res;
  const dimRows = res.dims[dimKey] || [];
  const a = `${Number(monthA.slice(5))}월`, b = `${Number(monthB.slice(5))}월`;

  const monthOptions = months.length ? months : [monthA, monthB];
  const sel = { height: 40, padding: "0 12px", borderRadius: 12, border: "1px solid #DCE3EE", fontSize: 15, fontWeight: 800, color: INK, background: "#fff" };
  const card = { background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 16, padding: compact ? 14 : 20, minWidth: 0, boxSizing: "border-box", boxShadow: "0 1px 2px rgba(15,26,48,.04)" };
  const h = { fontSize: compact ? 16 : 17, fontWeight: 900, color: INK, margin: "2px 0 12px" };
  const pill = (on) => ({ flexShrink: 0, height: 34, padding: "0 14px", borderRadius: 99, border: "1px solid " + (on ? NAVY : "#DCE3EE"), background: on ? NAVY : "#fff", color: on ? "#fff" : SUB, fontSize: 14, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" });
  const ghostBtn = { marginTop: 12, height: 36, padding: "0 14px", borderRadius: 10, border: "1px solid #DCE3EE", background: "#fff", color: NAVY, fontSize: 14, fontWeight: 800, cursor: "pointer" };


  const anomalyListEl = (
    <div style={{ marginTop: 10 }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: SOFT, color: NAVY }}>
                      {["구분", "상차일", "거래처", "상차지 → 하차지", "청구운임", "기사운임", "수익", "비고"].map((t) => (
                        <th key={t} style={{ padding: "8px 10px", fontWeight: 900, whiteSpace: "nowrap", textAlign: ["청구운임", "기사운임", "수익"].includes(t) ? "right" : "left" }}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {res.anomaliesB.slice(0, 100).map(({ r, an }, i) => {
                      const s = toWon(r.청구운임), d = toWon(r.기사운임);
                      const t = TONE[an.tone];
                      return (
                        <tr key={r._id || i} style={{ borderBottom: "1px solid #EEF2F7" }}>
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}><span style={{ fontSize: 12, fontWeight: 900, color: t.title, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 99, padding: "2px 9px" }}>{an.type}</span></td>
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontWeight: 700, color: SUB, fontVariantNumeric: "tabular-nums" }}>{r.상차일}</td>
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontWeight: 800, color: INK }}>{r.거래처명 || "-"}</td>
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontWeight: 600, color: SUB }}>{(r.상차지명 || r.출발지 || "-")} → {(r.하차지명 || r.도착지 || "-")}</td>
                          <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>{s.toLocaleString()}</td>
                          <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>{d.toLocaleString()}</td>
                          <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 900, color: s - d < 0 ? UP : INK }}>{(s - d).toLocaleString()}</td>
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontWeight: 600, color: MUTE }}>{an.note}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {res.anomaliesB.length > 100 && <div style={{ fontSize: 13, color: MUTE, marginTop: 8 }}>수익이 낮은 순으로 100건까지 표시</div>}
              </div>
    </div>
  );
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99990, background: "rgba(11,20,40,.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: compact ? "stretch" : "center", justifyContent: "center", padding: compact ? 0 : 20, fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif", wordBreak: "keep-all" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: SOFT, width: compact ? "100%" : "min(1560px, 100%)", height: compact ? "100%" : "min(95vh, 1300px)", borderRadius: compact ? 0 : 22, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 30px 80px rgba(11,20,40,.45)" }}>
        {/* 헤더 */}
        <div style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)", padding: compact ? "14px 16px" : "18px 24px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Eyebrow light>Revenue · Month Compare</Eyebrow>
            <div style={{ color: "#fff", fontSize: compact ? 18 : 20, fontWeight: 900, marginTop: 2 }}>월 비교 분석</div>
          </div>
          {[["png", "이미지 저장"], ["pdf", "PDF 저장"]].map(([k, l]) => (
            <button key={k} onClick={() => exportReport(k)} disabled={!!saving}
              style={{ height: compact ? 34 : 38, padding: compact ? "0 12px" : "0 16px", borderRadius: 11, border: k === "pdf" ? "none" : "1px solid rgba(143,176,240,.45)", background: k === "pdf" ? "#fff" : "rgba(255,255,255,.08)", color: k === "pdf" ? NAVY : "#fff", fontSize: compact ? 13 : 14, fontWeight: 800, cursor: saving ? "wait" : "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
              {saving === k ? "저장 중…" : l}
            </button>
          ))}
          <button onClick={onClose} aria-label="닫기" title="닫기" style={{ width: compact ? 34 : 38, height: compact ? 34 : 38, borderRadius: 11, border: "1px solid rgba(143,176,240,.35)", background: "rgba(255,255,255,.06)", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>

        {/* 조건 */}
        <div style={{ padding: compact ? "12px 16px" : "14px 24px", background: "#fff", borderBottom: `1px solid ${LINE_C}`, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <CustomSelect value={monthA} onChange={(e) => setMonthA(e.target.value)} style={sel}>
            {monthOptions.map((m) => <option key={m} value={m}>{mLabel(m)}</option>)}
          </CustomSelect>
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, letterSpacing: "0.16em", color: MUTE }}>VS</span>
          <CustomSelect value={monthB} onChange={(e) => setMonthB(e.target.value)} style={sel}>
            {monthOptions.map((m) => <option key={m} value={m}>{mLabel(m)}</option>)}
          </CustomSelect>
          <div style={{ display: "flex", gap: 4, background: "#EEF2F8", borderRadius: 12, padding: 4, marginLeft: compact ? 0 : 8 }}>
            {[["pure", "순수 운송"], ["all", "전체"], ...(hasExcluded ? [["excluded", "제외 거래처"]] : [])].filter(([k]) => hasExcluded || k === "all").map(([k, l]) => (
              <button key={k} onClick={() => setScope(k)} style={{ height: 32, padding: "0 14px", borderRadius: 9, border: "none", background: scope === k ? NAVY : "transparent", color: scope === k ? "#fff" : SUB, boxShadow: scope === k ? "0 4px 10px rgba(15,26,48,.18)" : "none", fontSize: 14, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>{l}</button>
            ))}
          </div>
        </div>

        {/* ⭐ 버그수정 — 세로 flex 스크롤 영역 안에서 overflow:hidden 카드(좌우 비교표)가
            높이 0 근처로 찌그러져 얇은 선처럼만 보였다. 자식이 줄어들지 않게 고정한다. */}
        <style>{`.mca-scroll > * { flex-shrink: 0; }`}</style>
        <div className="mca-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: compact ? 12 : 20, display: "flex", flexDirection: "column", gap: compact ? 12 : 16 }}>
          {/* ⭐ 원인 분석 리포트 — 결론 → 핵심 숫자 → 원인별 표·설명 → 원인이 아닌 것 */}
          <div ref={reportRef} style={{ display: "flex", flexDirection: "column", gap: compact ? 12 : 16, background: SOFT }}>
          <div style={{ background: HERO_BG, borderRadius: 18, padding: compact ? "16px 16px" : "22px 26px", color: "#fff", boxShadow: "0 12px 30px rgba(11,20,40,.18)" }}>
            <Eyebrow light style={{ marginBottom: 6 }}>Summary · {mLabel(monthA)} vs {mLabel(monthB)}</Eyebrow>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#C9D6EE", marginBottom: 6 }}>한 줄 결론 · {scope === "pure" ? "순수 운송" : scope === "all" ? "전체" : "제외 거래처"} 기준</div>
            <div style={{ fontSize: compact ? 17 : 20, fontWeight: 900, lineHeight: 1.5 }}>{report.headline}</div>
            <div style={{ fontSize: compact ? 14 : 15, fontWeight: 700, color: "#DCE4F1", marginTop: 6, lineHeight: 1.6 }}>{report.summary}</div>
          </div>

          <div style={card}>
            <Eyebrow>Key Figures</Eyebrow>
            <h3 style={h}>핵심 숫자</h3>
            <ReportTable compact={compact} head={["구분", a, b, "증감"]} rows={report.core} />
          </div>

          {report.causes.map((c, i) => (
            <div key={c.key} style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <Badge h={26} size={13} bg={UP} style={{ flexShrink: 0, borderRadius: 99, padding: "0 11px" }}>원인 {i + 1}</Badge>
                <span style={{ fontSize: compact ? 16 : 18, fontWeight: 900, color: INK }}>{c.title}</span>
              </div>
              {c.rows && <ReportTable compact={compact} head={c.head} rows={c.rows} />}
              {c.bullets?.length > 0 && (
                <ul style={{ margin: c.rows ? "12px 0 0" : 0, paddingLeft: 20, fontSize: compact ? 14 : 15, fontWeight: 600, color: SUB, lineHeight: 1.75 }}>
                  {c.bullets.map((t, j) => <li key={j} style={t.startsWith("가장 큰 원인") ? { color: "#B42318", fontWeight: 900 } : undefined}>{t}</li>)}
                </ul>
              )}
            </div>
          ))}

          {report.notCauses.length > 0 && (
            <div style={{ ...card, background: "#F7F9FC" }}>
              <Eyebrow>Ruled Out</Eyebrow>
              <h3 style={h}>원인이 아닌 것</h3>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: compact ? 14 : 15, fontWeight: 600, color: SUB, lineHeight: 1.75 }}>
                {report.notCauses.map((t, j) => <li key={j}>{t}</li>)}
              </ul>
            </div>
          )}

          </div>

          {/* 상세 자료 — 탭으로 하나씩 */}
          <div style={{ ...card, padding: compact ? "10px 12px" : "12px 18px" }}>
            <Eyebrow>Details</Eyebrow>
            <div style={{ fontSize: 15, fontWeight: 900, color: INK, margin: "2px 0 10px" }}>상세 자료</div>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
              {[["table", "월별 상세 비교표"], ["dims", "항목별 비교"], ["check", "확인 필요 오더"], ["excluded", "순수운송 제외 거래처"]].map(([k, l]) => (
                <button key={k} onClick={() => setDetailTab(detailTab === k ? "" : k)} style={pill(detailTab === k)}>{l}</button>
              ))}
            </div>
          </div>
          {detailTab === "table" && <MonthSideBySide res={res} a={a} b={b} compact={compact} />}
          {detailTab === "dims" && (
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <h3 style={{ ...h, margin: 0 }}>항목별 비교</h3>
              <div style={{ display: "flex", gap: 4, overflowX: "auto", scrollbarWidth: "none", maxWidth: "100%" }}>
                {COMPARE_DIMS.map((d) => (
                  <button key={d.key} onClick={() => { setDimKey(d.key); setShowAllRows(false); }} style={{ ...pill(dimKey === d.key), height: 32 }}>{d.label}</button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: MUTE, marginBottom: 10 }}>"수익률 영향"은 {b} 매출을 {a} 평균 수익률({pct(A.rate)})로 벌었다면 대비 얼마나 덜/더 벌었는지입니다. 수익률 영향이 ▼(마이너스)로 큰 항목부터 확인하세요.</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 760 }}>
                <thead>
                  <tr style={{ background: SOFT, color: NAVY }}>
                    {["항목", `${a} 매출`, `${a} 수익률`, `${b} 매출`, `${b} 수익률`, "매출 증감", "수익 증감", "수익률 영향"].map((t) => (
                      <th key={t} style={{ padding: "9px 10px", fontWeight: 800, whiteSpace: "nowrap", textAlign: t === "항목" ? "left" : "right" }}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(showAllRows ? dimRows : dimRows.slice(0, 15)).map((g) => (
                    <tr key={g.key} style={{ borderBottom: "1px solid #EEF2F7" }}>
                      <td style={{ padding: "10px 10px", fontWeight: 800, color: INK, whiteSpace: "nowrap" }}>
                        {g.key}
                        {g.isNew && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: NAVY, background: "#EEF3FB", borderRadius: 99, padding: "1px 7px" }}>신규</span>}
                        {g.isGone && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: MUTE, background: "#F1F4F8", borderRadius: 99, padding: "1px 7px" }}>{b} 없음</span>}
                      </td>
                      <td style={{ padding: "9px 10px", textAlign: "right", color: SUB, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{g.a.sale ? won(g.a.sale) : "-"}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", color: SUB, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{g.a.sale ? pct(g.a.rate) : "-"}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", color: INK, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{g.b.sale ? won(g.b.sale) : "-"}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 800, color: g.b.sale && g.b.rate < A.rate ? UP : INK, fontVariantNumeric: "tabular-nums" }}>{g.b.sale ? pct(g.b.rate) : "-"}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right" }}><Delta v={g.dSale} /></td>
                      <td style={{ padding: "9px 10px", textAlign: "right" }}><Delta v={g.dProfit} /></td>
                      <td style={{ padding: "9px 10px", textAlign: "right" }}><Delta v={Math.round(g.marginImpact)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dimRows.length > 15 && (
              <button onClick={() => setShowAllRows((v) => !v)} style={ghostBtn}>
                {showAllRows ? "접기" : `전체 ${dimRows.length}개 보기`}
              </button>
            )}
          </div>
          )}
          {detailTab === "check" && (
          <div style={card}>
            <h3 style={h}>확인이 필요한 오더 ({a} vs {b})</h3>
            <CompareRows
              compact={compact}
              a={a} b={b}
              items={res.anomalySummary.map((t) => ({
                key: t.type,
                head: <>
                  <span style={{ fontSize: 13, fontWeight: 900, color: TONE[t.tone].title, background: TONE[t.tone].bg, border: `1px solid ${TONE[t.tone].border}`, borderRadius: 99, padding: "2px 9px", whiteSpace: "nowrap" }}>{t.type}</span>
                  <div style={{ fontSize: 13, fontWeight: 600, color: MUTE, marginTop: 4 }}>{t.desc}</div>
                </>,
                cells: [t.a, t.b].map((v, k) => ({
                  main: `${v.cnt}건`,
                  sub: `${t.amountLabel} ${Math.round(v.amount).toLocaleString()}원`,
                  bad: k === 1 && t.b.cnt > t.a.cnt,
                })),
              }))}
            />
            {res.anomaliesB.length > 0 && (
              <button onClick={() => setShowAnomalyList((v) => !v)} style={ghostBtn}>
                {showAnomalyList ? "목록 접기" : `${b} 오더 목록 보기 (${res.anomaliesB.length}건)`}
              </button>
            )}
            {showAnomalyList && anomalyListEl}
          </div>
          )}
          {detailTab === "excluded" && (
          <div style={card}>
            <h3 style={h}>매출관리(순수 운송)에 포함되지 않는 거래처</h3>
            {res.excludedClients.length === 0 ? (
              <div style={{ fontSize: 15, fontWeight: 700, color: SUB }}>{a}·{b}에는 순수 운송에서 빠지는 거래처 오더가 없습니다.</div>
            ) : (
              <>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: MUTE, marginBottom: 10 }}>거래처관리에서 "순수 운송료 매출 통계에서 제외"가 켜진 거래처입니다. "순수 운송" 숫자에는 들어가지 않고 "전체"에만 들어갑니다.</div>
                <CompareRows
                  compact={compact}
                  a={a} b={b}
                  items={res.excludedClients.map((g) => ({
                    key: g.key,
                    head: <span style={{ fontSize: 15, fontWeight: 900, color: INK }}>{g.key}</span>,
                    cells: [g.a, g.b].map((v) => ({
                      main: v.cnt ? won(v.sale) : "-",
                      sub: v.cnt ? `수익 ${won(v.profit)} · ${v.cnt}건` : "",
                    })),
                  }))}
                />
              </>
            )}
          </div>
          )}

        </div>
      </div>
    </div>
  );
}
