// ======================= src/RevenuePages.jsx =======================
// 📊 매출관리 하위 화면(2026-10-28 시각화 리디자인) — 엑셀 표 대신 그래프·타일로.
//  목표·전망 / 거래처 순위·신규 / 거래처 동향 / 연간 요약 / 거래처 기간 조회
//  ⭐ 알록달록 금지 — 네이비 계열만. rows = 매출관리의 배차완료 오더 + 고정거래처.
import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, Area, AreaChart, XAxis, YAxis, Tooltip, CartesianGrid, Cell, PieChart, Pie, ReferenceLine,
} from "recharts";
import { RvCard, RvTile, RvDelta, rvShort, RvRing } from "./RevenueDashboard";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const NAVY = "#1B2B4B";
const SHADES = ["#0F1A30", "#1B2B4B", "#2D4C82", "#4B6CB7", "#6E8BC4", "#9FB2D6", "#C9D3E4", "#DCE3EF"];
const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const sOf = (list) => {
  let sale = 0, driver = 0;
  list.forEach((r) => { sale += toInt(r.청구운임); driver += toInt(r.기사운임); });
  return { sale, driver, profit: sale - driver, cnt: list.length, rate: sale ? ((sale - driver) / sale) * 100 : 0 };
};
const ymShift = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const tip = { borderRadius: 10, border: "1px solid #E3E8F0", boxShadow: "0 8px 22px rgba(15,26,48,.12)", fontSize: 13, fontWeight: 700 };
const won = (n) => `${Math.round(n || 0).toLocaleString()}원`;
const grid4 = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 };
const Empty = ({ text = "데이터가 없습니다" }) => <div style={{ padding: "36px 0", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>{text}</div>;
const Rank = ({ i }) => <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: i < 3 ? NAVY : "#94A3B8" }}>{String(i + 1).padStart(2, "0")}</span>;

// ───────────────────────── 1) 목표·전망 ─────────────────────────
export function TargetPage({ rows = [], targetMonth, yearTarget = 0, isExcluded = () => false, hasExcluded = false, forecast, forecast2026 = {}, excludedTarget = 0 }) {
  const Y = Number(targetMonth.slice(0, 4));
  const curM = Number(targetMonth.slice(5, 7));
  const pure = useMemo(() => rows.filter((r) => !isExcluded(r.거래처명)), [rows, isExcluded]);
  const byMonth = (list, y) => Array.from({ length: 12 }, (_, i) => sOf(list.filter((r) => String(r.상차일 || "").startsWith(`${y}-${String(i + 1).padStart(2, "0")}`))));
  const cur = useMemo(() => byMonth(pure, Y), [pure, Y]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = useMemo(() => byMonth(pure, Y - 1), [pure, Y]); // eslint-disable-line react-hooks/exhaustive-deps
  const exCur = useMemo(() => (hasExcluded ? byMonth(rows.filter((r) => isExcluded(r.거래처명)), Y) : []), [rows, hasExcluded, Y, isExcluded]); // eslint-disable-line react-hooks/exhaustive-deps

  let a = 0, b = 0;
  const race = cur.map((m, i) => {
    a += m.sale; b += last[i].sale;
    return { label: `${i + 1}월`, cum: i < curM ? a : null, lastCum: b, pace: yearTarget > 0 ? Math.round((yearTarget / 12) * (i + 1)) : null, sale: i < curM ? m.sale : null };
  });
  const ytd = cur.slice(0, curM).reduce((s, m) => s + m.sale, 0);
  const ytdLast = last.slice(0, curM).reduce((s, m) => s + m.sale, 0);
  const lastTotal = last.reduce((s, m) => s + m.sale, 0);
  const achieve = yearTarget > 0 ? ytd / yearTarget : 0;
  const m = cur[curM - 1] || sOf([]);
  const y = cur.slice(0, curM).reduce((s, x) => ({ sale: s.sale + x.sale, driver: s.driver + x.driver, profit: s.profit + x.profit }), { sale: 0, driver: 0, profit: 0 });
  const runRate = curM ? (ytd / curM) * 12 : 0;
  const scen = [
    { k: "작년 실적", v: lastTotal },
    { k: "보수적(+5%)", v: forecast2026.conservative || 0 },
    { k: "기준(+10%)", v: forecast2026.normal || 0 },
    { k: "공격적(+18%)", v: forecast2026.aggressive || 0 },
    { k: "현재 페이스", v: Math.round(runRate) },
    ...(yearTarget > 0 ? [{ k: "연간 목표", v: yearTarget, target: true }] : []),
  ];
  const scenMax = Math.max(1, ...scen.map((s) => s.v));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={grid4}>
        <RvTile dark code="YTD" label={`${Y}년 누적 ${hasExcluded ? "순수 " : ""}매출`} value={rvShort(ytd)} unit="원" foot={<><RvDelta dark cur={ytd} prev={ytdLast} /><span>작년 같은 기간</span></>} />
        <RvTile code="TARGET" label="연간 목표" value={yearTarget > 0 ? rvShort(yearTarget) : "미설정"} unit={yearTarget > 0 ? "원" : ""} foot={yearTarget > 0 ? <span>남은 금액 {rvShort(Math.max(0, yearTarget - ytd))}원</span> : <span>매출 대시보드 › 목표 설정에서 입력</span>} />
        <RvTile code="ACHIEVE" label="목표 달성률" value={yearTarget > 0 ? (achieve * 100).toFixed(1) : "—"} unit={yearTarget > 0 ? "%" : ""} foot={<span>연도 진행 {Math.round((curM / 12) * 100)}%</span>} />
        <RvTile code="RUN RATE" label="연말 예상(현재 페이스)" value={rvShort(runRate)} unit="원" foot={<span>월평균 {rvShort(curM ? ytd / curM : 0)}원</span>} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2.1fr) minmax(0,1fr)", gap: 14 }}>
        <RvCard code="RACE" title="누적 매출 레이스 — 올해 vs 작년 vs 목표 페이스" right={
          <div style={{ display: "flex", gap: 12, fontSize: 12.5, fontWeight: 700, color: "#4b5563" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 3, background: NAVY, borderRadius: 2 }} />올해</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, borderTop: "2px dashed #94A3B8" }} />작년</span>
            {yearTarget > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, borderTop: "2px dotted #4B6CB7" }} />목표 페이스</span>}
          </div>
        }>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={race} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs><linearGradient id="tpArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={NAVY} stopOpacity={0.28} /><stop offset="1" stopColor={NAVY} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#EEF1F6" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#4b5563", fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} width={60} tick={{ fontSize: 11, fill: "#9ca3af", fontFamily: MONO }} tickFormatter={rvShort} />
                <Tooltip contentStyle={tip} formatter={(v, n) => [v == null ? "-" : won(v), { cum: "올해 누적", lastCum: "작년 누적", pace: "목표 페이스", sale: "월 매출" }[n] || n]} />
                <Bar dataKey="sale" barSize={18} radius={[4, 4, 0, 0]} fill="#DCE3EF" />
                <Area type="monotone" dataKey="cum" stroke={NAVY} strokeWidth={3} fill="url(#tpArea)" connectNulls={false} dot={{ r: 3, fill: "#fff", stroke: NAVY, strokeWidth: 2 }} />
                <Line type="monotone" dataKey="lastCum" stroke="#94A3B8" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                {yearTarget > 0 && <Line type="linear" dataKey="pace" stroke="#4B6CB7" strokeWidth={2} strokeDasharray="2 4" dot={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </RvCard>
        <RvCard code="GOAL" title="목표 달성">
          <div style={{ display: "flex", justifyContent: "center" }}>
            <RvRing pct={achieve} label={yearTarget > 0 ? `${(achieve * 100).toFixed(1)}%` : "—"} sub={yearTarget > 0 ? "목표 대비" : "목표 미설정"} />
          </div>
          {hasExcluded && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, background: "#F4F7FC", border: "1px solid #E3E8F0" }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#4b5563" }}>제외 거래처 매출</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: "#0F1A30" }}>{rvShort(exCur.slice(0, curM).reduce((s, x) => s + x.sale, 0))}원</span>
                <span style={{ fontSize: 12.5, color: "#6b7280", fontWeight: 700 }}>목표 {rvShort(excludedTarget)}원</span>
              </div>
            </div>
          )}
          {forecast && (
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
              {[["월말 예상 매출", rvShort(forecast.sale)], ["예상 건수", `${forecast.count}건`], ["예상 수익", rvShort(forecast.profit)]].map(([k, v]) => (
                <div key={k} style={{ borderRadius: 10, padding: "8px 8px", background: "#fff", border: "1px solid #E3E8F0", textAlign: "center" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "#6b7280" }}>{k}</div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: NAVY }}>{v}</div>
                </div>
              ))}
            </div>
          )}
        </RvCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 14 }}>
        <RvCard code="SCENARIO" title={`${Y}년 매출 시나리오 비교`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {scen.map((s) => (
              <div key={s.k} style={{ display: "grid", gridTemplateColumns: "120px 1fr 96px", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: s.target ? NAVY : "#374151" }}>{s.k}</span>
                <div style={{ height: 14, borderRadius: 99, background: "#EEF1F6", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(s.v / scenMax) * 100}%`, borderRadius: 99, background: s.target ? `repeating-linear-gradient(45deg,${NAVY} 0 6px,#2D4C82 6px 12px)` : s.k === "현재 페이스" ? NAVY : "#9FB2D6" }} />
                </div>
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: "#0F1A30", textAlign: "right" }}>{rvShort(s.v)}</span>
              </div>
            ))}
          </div>
        </RvCard>
        <RvCard code="P&L" title="운송료 구성 — 매출 = 운반비 + 수익">
          {[[`${curM}월`, m], [`${Y}년 누적`, y]].map(([k, d]) => (
            <div key={k} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#0F1A30" }}>{k}</span>
                <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: "#0F1A30" }}>{won(d.sale)}</span>
              </div>
              <div style={{ display: "flex", height: 16, borderRadius: 8, overflow: "hidden", marginTop: 6, background: "#EEF1F6" }}>
                <div style={{ width: `${d.sale ? (d.driver / d.sale) * 100 : 0}%`, background: "#9FB2D6" }} />
                <div style={{ width: `${d.sale ? (d.profit / d.sale) * 100 : 0}%`, background: NAVY }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 12.5, fontWeight: 700, color: "#6b7280" }}>
                <span>운반비 <b style={{ fontFamily: MONO, color: "#374151" }}>{rvShort(d.driver)}</b></span>
                <span>수익 <b style={{ fontFamily: MONO, color: NAVY }}>{rvShort(d.profit)}</b> · 수익률 <b style={{ fontFamily: MONO, color: NAVY }}>{d.sale ? ((d.profit / d.sale) * 100).toFixed(1) : "0.0"}%</b></span>
              </div>
            </div>
          ))}
        </RvCard>
      </div>
    </div>
  );
}

// ───────────────────────── 2) 거래처 순위·신규 ─────────────────────────
export function ClientsPage({ rows = [], targetMonth, isRankExcluded = () => false, onOpenClient }) {
  const prevYm = ymShift(targetMonth, -1);
  const data = useMemo(() => {
    const cur = {}, prev = {}, first = {};
    rows.forEach((r) => {
      const c = String(r.거래처명 || "").trim();
      const d = String(r.상차일 || "");
      if (!c || !d) return;
      if (!first[c] || d < first[c]) first[c] = d;
      if (isRankExcluded(c)) return;
      if (d.startsWith(targetMonth)) { const e = cur[c] || (cur[c] = { sale: 0, cnt: 0, driver: 0 }); e.sale += toInt(r.청구운임); e.cnt += 1; e.driver += toInt(r.기사운임); }
      else if (d.startsWith(prevYm)) { const e = prev[c] || (prev[c] = { sale: 0, cnt: 0 }); e.sale += toInt(r.청구운임); e.cnt += 1; }
    });
    const total = Object.values(cur).reduce((s, x) => s + x.sale, 0);
    const top = Object.entries(cur).map(([name, v]) => ({ name, ...v, prev: prev[name]?.sale || 0 })).sort((a, b) => b.sale - a.sale);
    const drop = Object.entries(prev).map(([name, v]) => ({ name, prev: v.sale, cur: cur[name]?.sale || 0 })).filter((x) => x.cur < x.prev).map((x) => ({ ...x, diff: x.cur - x.prev })).sort((a, b) => a.diff - b.diff).slice(0, 10);
    const fresh = Object.entries(first).filter(([, d]) => d.startsWith(targetMonth)).map(([name, d]) => ({ name, first: d, ...(cur[name] || { sale: 0, cnt: 0 }) })).sort((a, b) => b.sale - a.sale);
    return { top, total, drop, fresh, count: Object.keys(cur).length };
  }, [rows, targetMonth, prevYm, isRankExcluded]);
  const top10 = data.top.slice(0, 10);
  const top10Sum = top10.reduce((s, x) => s + x.sale, 0);
  const pie = [...top10.map((x) => ({ name: x.name, v: x.sale })), ...(data.total - top10Sum > 0 ? [{ name: "기타", v: data.total - top10Sum }] : [])];
  const dropMax = Math.max(1, ...data.drop.map((x) => x.prev));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={grid4}>
        <RvTile dark code="CLIENTS" label="거래 거래처" value={data.count} unit="곳" foot={<span>{targetMonth} 기준</span>} />
        <RvTile code="TOP 10" label="상위 10곳 매출 비중" value={data.total ? ((top10Sum / data.total) * 100).toFixed(1) : "0.0"} unit="%" foot={<span>{rvShort(top10Sum)}원 / {rvShort(data.total)}원</span>} />
        <RvTile code="NEW" label="신규 거래처" value={data.fresh.length} unit="곳" foot={<span>매출 {rvShort(data.fresh.reduce((s, x) => s + x.sale, 0))}원</span>} />
        <RvTile code="DROP" label="매출 감소 거래처" value={data.drop.length} unit="곳" foot={<span>감소액 {rvShort(Math.abs(data.drop.reduce((s, x) => s + x.diff, 0)))}원</span>} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: 14 }}>
        <RvCard code="TOP 10" title="매출 순위 Top 10">
          {top10.length === 0 ? <Empty /> : (
            <div style={{ height: 380 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top10} layout="vertical" margin={{ top: 0, right: 70, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={130} axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: "#0F1A30", fontWeight: 800 }} />
                  <Tooltip contentStyle={tip} formatter={(v) => [won(v), "매출"]} cursor={{ fill: "rgba(27,43,75,.04)" }} />
                  <Bar dataKey="sale" radius={[0, 6, 6, 0]} barSize={20} label={{ position: "right", formatter: rvShort, fontSize: 12.5, fontFamily: MONO, fontWeight: 800, fill: NAVY }} onClick={(d) => onOpenClient?.(d.name)} style={{ cursor: onOpenClient ? "pointer" : "default" }}>
                    {top10.map((x, i) => <Cell key={x.name} fill={i === 0 ? NAVY : i < 3 ? "#2D4C82" : "#6E8BC4"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </RvCard>
        <RvCard code="SHARE" title="매출 점유율">
          {pie.length === 0 ? <Empty /> : (
            <>
              <div style={{ height: 220, position: "relative" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pie} dataKey="v" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={1.5} stroke="#fff" strokeWidth={2}>
                      {pie.map((x, i) => <Cell key={x.name} fill={x.name === "기타" ? "#EEF1F6" : SHADES[Math.min(i, SHADES.length - 1)]} />)}
                    </Pie>
                    <Tooltip contentStyle={tip} formatter={(v, n) => [`${won(v)} · ${data.total ? ((v / data.total) * 100).toFixed(1) : 0}%`, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>총 매출</span>
                  <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: "#0F1A30" }}>{rvShort(data.total)}</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", marginTop: 6 }}>
                {pie.slice(0, 8).map((x, i) => (
                  <div key={x.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, minWidth: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: x.name === "기타" ? "#DCE3EF" : SHADES[Math.min(i, SHADES.length - 1)] }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700, color: "#374151" }}>{x.name}</span>
                    <span style={{ fontFamily: MONO, fontWeight: 800, color: NAVY }}>{data.total ? ((x.v / data.total) * 100).toFixed(1) : 0}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </RvCard>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 14 }}>
        <RvCard code="DROP" title={`매출 감소 Top 10 (${prevYm} → ${targetMonth})`}>
          {data.drop.length === 0 ? <Empty text="감소한 거래처가 없습니다" /> : data.drop.map((x, i) => (
            <div key={x.name} style={{ display: "grid", gridTemplateColumns: "26px 130px 1fr 92px", alignItems: "center", gap: 10, padding: "7px 0", borderTop: i ? "1px solid #EEF1F6" : "none" }}>
              <Rank i={i} />
              <span style={{ fontSize: 14, fontWeight: 800, color: "#0F1A30", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
              <div style={{ position: "relative", height: 16 }}>
                <div style={{ position: "absolute", left: 0, top: 2, height: 12, width: `${(x.prev / dropMax) * 100}%`, borderRadius: 6, background: "#DCE3EF" }} />
                <div style={{ position: "absolute", left: 0, top: 2, height: 12, width: `${(x.cur / dropMax) * 100}%`, borderRadius: 6, background: NAVY }} />
              </div>
              <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 800, color: "#64748b", textAlign: "right" }}>−{rvShort(Math.abs(x.diff))}</span>
            </div>
          ))}
          {data.drop.length > 0 && <div style={{ marginTop: 8, display: "flex", gap: 14, fontSize: 12, fontWeight: 700, color: "#6b7280" }}><span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#DCE3EF", marginRight: 5 }} />전월</span><span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: NAVY, marginRight: 5 }} />이번 달</span></div>}
        </RvCard>
        <RvCard code="NEW" title="신규 거래처">
          {data.fresh.length === 0 ? <Empty text="이 달 신규 거래처가 없습니다" /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
              {data.fresh.map((x) => (
                <div key={x.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: "1px solid #E3E8F0", background: "#fff" }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: "#fff", background: NAVY, padding: "2px 7px", borderRadius: 6 }}>NEW</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: "#0F1A30", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
                    <span style={{ display: "block", fontSize: 12, color: "#6b7280", fontFamily: MONO }}>첫 거래 {x.first}</span>
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <span style={{ display: "block", fontFamily: MONO, fontSize: 14.5, fontWeight: 800, color: NAVY }}>{rvShort(x.sale)}</span>
                    <span style={{ display: "block", fontSize: 12, color: "#6b7280" }}>{x.cnt}건</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </RvCard>
      </div>
    </div>
  );
}

// ───────────────────────── 3) 거래처 동향 ─────────────────────────
export function TrendPage({ rows = [], targetMonth, isRankExcluded = () => false }) {
  const months = Array.from({ length: 12 }, (_, i) => ymShift(targetMonth, i - 11));
  const [pick, setPick] = useState("");
  const data = useMemo(() => {
    const m = {};
    rows.forEach((r) => {
      const c = String(r.거래처명 || "").trim();
      const ym = String(r.상차일 || "").slice(0, 7);
      if (!c || !months.includes(ym) || isRankExcluded(c)) return;
      const e = m[c] || (m[c] = {});
      e[ym] = (e[ym] || 0) + toInt(r.청구운임);
    });
    const list = Object.entries(m).map(([name, v]) => {
      const vals = months.map((ym) => v[ym] || 0);
      const total = vals.reduce((s, x) => s + x, 0);
      const r3 = vals.slice(-3).reduce((s, x) => s + x, 0), p3 = vals.slice(-6, -3).reduce((s, x) => s + x, 0);
      const active = vals.filter((x) => x > 0).length;
      return { name, vals, total, r3, p3, g: p3 ? (r3 - p3) / p3 : r3 ? 1 : 0, active, risk: vals[11] === 0 && vals.slice(8, 11).some((x) => x > 0) };
    }).sort((a, b) => b.total - a.total);
    return list;
  }, [rows, targetMonth, isRankExcluded]); // eslint-disable-line react-hooks/exhaustive-deps
  const heat = data.slice(0, 15);
  const maxCell = Math.max(1, ...heat.flatMap((x) => x.vals));
  const growers = data.filter((x) => x.p3 > 0 && x.g > 0.1).sort((a, b) => b.r3 - b.p3 - (a.r3 - a.p3)).slice(0, 6);
  const fallers = data.filter((x) => x.p3 > 0 && x.g < -0.1).sort((a, b) => a.r3 - a.p3 - (b.r3 - b.p3)).slice(0, 6);
  const risks = data.filter((x) => x.risk).slice(0, 8);
  const sel = data.find((x) => x.name === pick) || data[0];
  const selData = sel ? months.map((ym, i) => ({ label: `${Number(ym.slice(5))}월`, v: sel.vals[i] })) : [];

  const Mover = ({ x, up }) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px", alignItems: "center", gap: 8, padding: "7px 0", borderTop: "1px solid #EEF1F6", cursor: "pointer" }} onClick={() => setPick(x.name)}>
      <span style={{ fontSize: 14, fontWeight: 800, color: "#0F1A30", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
      <span style={{ fontFamily: MONO, fontSize: 12.5, color: "#6b7280", textAlign: "right" }}>{rvShort(x.r3)}</span>
      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: up ? NAVY : "#64748b", textAlign: "right" }}>{up ? "▲" : "▼"} {Math.abs(x.g * 100).toFixed(0)}%</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={grid4}>
        <RvTile dark code="ACTIVE" label="12개월 거래처" value={data.length} unit="곳" foot={<span>{months[0]} ~ {months[11]}</span>} />
        <RvTile code="GROWING" label="성장 거래처" value={data.filter((x) => x.p3 > 0 && x.g > 0.1).length} unit="곳" foot={<span>최근 3개월 +10% 이상</span>} />
        <RvTile code="DECLINING" label="감소 거래처" value={data.filter((x) => x.p3 > 0 && x.g < -0.1).length} unit="곳" foot={<span>최근 3개월 −10% 이상</span>} />
        <RvTile code="AT RISK" label="이탈 위험" value={data.filter((x) => x.risk).length} unit="곳" foot={<span>이번 달 거래 없음</span>} />
      </div>

      <RvCard code="HEATMAP" title="상위 15개 거래처 · 월별 매출 히트맵" right={<span style={{ fontSize: 12.5, fontWeight: 700, color: "#6b7280" }}>칸이 진할수록 매출이 큽니다 · 이름을 누르면 아래 추이</span>}>
        {heat.length === 0 ? <Empty /> : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: `150px repeat(12, minmax(46px,1fr)) 86px`, gap: 3, minWidth: 900 }}>
              <div />
              {months.map((ym) => <div key={ym} style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, color: "#6b7280", textAlign: "center", padding: "2px 0" }}>{ym.slice(2).replace("-", ".")}</div>)}
              <div style={{ fontSize: 11.5, fontWeight: 800, color: "#6b7280", textAlign: "right" }}>12개월</div>
              {heat.map((x) => (
                <React.Fragment key={x.name}>
                  <button type="button" onClick={() => setPick(x.name)} style={{ textAlign: "left", border: "none", background: "transparent", cursor: "pointer", fontSize: 13.5, fontWeight: 800, color: sel?.name === x.name ? NAVY : "#0F1A30", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 4px", textDecoration: sel?.name === x.name ? "underline" : "none" }}>{x.name}</button>
                  {x.vals.map((v, i) => {
                    const t = v / maxCell;
                    return <div key={i} title={`${months[i]} · ${won(v)}`} style={{ height: 28, borderRadius: 6, background: v ? `rgba(27,43,75,${0.08 + t * 0.92})` : "#F4F6FA", color: t > 0.45 ? "#fff" : "#1B2B4B", fontFamily: MONO, fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{v ? rvShort(v) : ""}</div>;
                  })}
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: NAVY, textAlign: "right", alignSelf: "center" }}>{rvShort(x.total)}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </RvCard>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr)", gap: 14 }}>
        <RvCard code="TREND" title={sel ? `${sel.name} · 12개월 추이` : "거래처 추이"}>
          {!sel ? <Empty /> : (
            <div style={{ height: 230 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={selData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs><linearGradient id="trArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={NAVY} stopOpacity={0.3} /><stop offset="1" stopColor={NAVY} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke="#EEF1F6" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11.5, fill: "#4b5563", fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} width={52} tick={{ fontSize: 11, fill: "#9ca3af", fontFamily: MONO }} tickFormatter={rvShort} />
                  <Tooltip contentStyle={tip} formatter={(v) => [won(v), "매출"]} />
                  <Area type="monotone" dataKey="v" stroke={NAVY} strokeWidth={2.6} fill="url(#trArea)" dot={{ r: 3, fill: "#fff", stroke: NAVY, strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </RvCard>
        <RvCard code="UP" title="성장 거래처 (최근 3개월)">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px", gap: 8, fontSize: 11.5, fontWeight: 800, color: "#94A3B8", paddingBottom: 4 }}><span>거래처</span><span style={{ textAlign: "right" }}>3개월</span><span style={{ textAlign: "right" }}>증감</span></div>
          {growers.length === 0 ? <Empty text="없음" /> : growers.map((x) => <Mover key={x.name} x={x} up />)}
        </RvCard>
        <RvCard code="DOWN" title="감소 · 이탈 위험">
          {fallers.length === 0 && risks.length === 0 ? <Empty text="없음" /> : (
            <>
              {fallers.map((x) => <Mover key={x.name} x={x} />)}
              {risks.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: "#4b5563", marginBottom: 6 }}>이번 달 거래 없음(이탈 위험)</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {risks.map((x) => <button type="button" key={x.name} onClick={() => setPick(x.name)} style={{ fontSize: 12.5, fontWeight: 800, color: NAVY, border: `1.5px dashed ${NAVY}`, background: "#fff", borderRadius: 8, padding: "3px 9px", cursor: "pointer" }}>{x.name}</button>)}
                  </div>
                </div>
              )}
            </>
          )}
        </RvCard>
      </div>
    </div>
  );
}

// ───────────────────────── 4) 연간 요약 ─────────────────────────
export function YearlyPage({ rows = [], year }) {
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, "0")}`, lym = `${year - 1}-${String(i + 1).padStart(2, "0")}`;
    const s = sOf(rows.filter((r) => String(r.상차일 || "").startsWith(ym)));
    const l = sOf(rows.filter((r) => String(r.상차일 || "").startsWith(lym)));
    return { label: `${i + 1}월`, ...s, last: l.sale, rateV: s.sale ? Number(s.rate.toFixed(1)) : null };
  }), [rows, year]);
  const tot = months.reduce((a, m) => ({ sale: a.sale + m.sale, profit: a.profit + m.profit, cnt: a.cnt + m.cnt, last: a.last + m.last }), { sale: 0, profit: 0, cnt: 0, last: 0 });
  const active = months.filter((m) => m.sale > 0);
  const best = months.reduce((a, m) => (m.sale > a.sale ? m : a), { sale: 0, label: "-" });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={grid4}>
        <RvTile dark code="REVENUE" label={`${year}년 매출`} value={rvShort(tot.sale)} unit="원" foot={<><RvDelta dark cur={tot.sale} prev={tot.last} /><span>작년 대비</span></>} />
        <RvTile code="PROFIT" label="수익" value={rvShort(tot.profit)} unit="원" foot={<span>수익률 {tot.sale ? ((tot.profit / tot.sale) * 100).toFixed(1) : "0.0"}%</span>} />
        <RvTile code="ORDERS" label="오더 건수" value={tot.cnt.toLocaleString()} unit="건" foot={<span>월평균 {active.length ? Math.round(tot.cnt / active.length).toLocaleString() : 0}건</span>} />
        <RvTile code="BEST" label="최고 매출 월" value={best.label} foot={<span>{rvShort(best.sale)}원</span>} />
      </div>
      <RvCard code="YEARLY" title={`${year}년 월별 매출 · 수익 · 작년 비교`} right={
        <div style={{ display: "flex", gap: 12, fontSize: 12.5, fontWeight: 700, color: "#4b5563" }}>
          <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#9FB2D6", borderRadius: 2, marginRight: 5 }} />매출</span>
          <span><span style={{ display: "inline-block", width: 10, height: 10, background: NAVY, borderRadius: 2, marginRight: 5 }} />수익</span>
          <span><span style={{ display: "inline-block", width: 14, borderTop: "2px dashed #94A3B8", marginRight: 5, verticalAlign: "middle" }} />작년 매출</span>
          <span><span style={{ display: "inline-block", width: 14, height: 2, background: "#4B6CB7", marginRight: 5, verticalAlign: "middle" }} />수익률</span>
        </div>
      }>
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#EEF1F6" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12.5, fill: "#4b5563", fontWeight: 700 }} />
              <YAxis yAxisId="s" axisLine={false} tickLine={false} width={60} tick={{ fontSize: 11, fill: "#9ca3af", fontFamily: MONO }} tickFormatter={rvShort} />
              <YAxis yAxisId="r" orientation="right" axisLine={false} tickLine={false} width={40} tick={{ fontSize: 11, fill: "#9ca3af", fontFamily: MONO }} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tip} formatter={(v, n) => (n === "rateV" ? [`${v}%`, "수익률"] : [won(v), { sale: "매출", profit: "수익", last: "작년 매출" }[n] || n])} />
              <Bar yAxisId="s" dataKey="sale" fill="#9FB2D6" radius={[6, 6, 0, 0]} barSize={22} />
              <Bar yAxisId="s" dataKey="profit" fill={NAVY} radius={[6, 6, 0, 0]} barSize={22} />
              <Line yAxisId="s" type="monotone" dataKey="last" stroke="#94A3B8" strokeWidth={2} strokeDasharray="6 4" dot={false} />
              <Line yAxisId="r" type="monotone" dataKey="rateV" stroke="#4B6CB7" strokeWidth={2} dot={{ r: 3, fill: "#fff", stroke: "#4B6CB7", strokeWidth: 2 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </RvCard>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 10 }}>
        {months.map((m, i) => {
          const prev = i > 0 ? months[i - 1].sale : 0;
          return (
            <div key={m.label} style={{ borderRadius: 14, padding: "12px 13px", background: m.sale ? "#fff" : "#F7F9FC", border: m.label === best.label && m.sale ? `1.5px solid ${NAVY}` : "1px solid #E3E8F0", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: "#0F1A30" }}>{m.label}</span>
                {m.sale > 0 && prev > 0 && <RvDelta cur={m.sale} prev={prev} />}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: m.sale ? "#0F1A30" : "#C9D3E4", marginTop: 4 }}>{m.sale ? rvShort(m.sale) : "—"}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginTop: 2 }}>{m.cnt.toLocaleString()}건 · 수익률 {m.sale ? m.rate.toFixed(1) : "0.0"}%</div>
              <div style={{ height: 4, borderRadius: 99, background: "#EEF1F6", marginTop: 6, overflow: "hidden" }}><div style={{ height: "100%", width: `${best.sale ? (m.sale / best.sale) * 100 : 0}%`, background: NAVY }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────── 5) 거래처 기간 조회 ─────────────────────────
export function QueryPage({ rows = [], clients = [] }) {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [q, setQ] = useState("");
  const [client, setClient] = useState("");
  const [applied, setApplied] = useState(null);
  const names = useMemo(() => {
    const set = new Set((clients || []).map((c) => c.거래처명).filter(Boolean));
    rows.forEach((r) => r.거래처명 && set.add(String(r.거래처명).trim()));
    return [...set].sort();
  }, [clients, rows]);
  const sugg = q.trim() ? names.filter((n) => n.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const res = useMemo(() => {
    if (!applied) return null;
    const list = rows.filter((r) => { const d = String(r.상차일 || ""); return d >= applied.from && d <= applied.to && (!applied.client || String(r.거래처명 || "").trim() === applied.client); });
    const days = {};
    list.forEach((r) => { const d = String(r.상차일).slice(0, 10); const e = days[d] || (days[d] = { sale: 0, profit: 0, cnt: 0 }); e.sale += toInt(r.청구운임); e.profit += toInt(r.청구운임) - toInt(r.기사운임); e.cnt += 1; });
    const routes = {}, cars = {};
    list.forEach((r) => {
      const k = `${r.상차지명 || r.출발지 || "-"} → ${r.하차지명 || r.도착지 || "-"}`;
      const e = routes[k] || (routes[k] = { k, cnt: 0, sale: 0 }); e.cnt += 1; e.sale += toInt(r.청구운임);
      const c = String(r.차량종류 || "미지정"); cars[c] = (cars[c] || 0) + 1;
    });
    return {
      s: sOf(list), list,
      daily: Object.entries(days).sort().map(([d, v]) => ({ label: d.slice(5).replace("-", "/"), ...v })),
      routes: Object.values(routes).sort((a, b) => b.sale - a.sale).slice(0, 8),
      cars: Object.entries(cars).sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ name, v })),
    };
  }, [rows, applied]);
  const inp = { height: 40, borderRadius: 10, border: "1px solid #DCE3EF", padding: "0 12px", fontSize: 14.5, fontWeight: 700, color: "#0F1A30", background: "#fff", outline: "none" };
  const routeMax = Math.max(1, ...(res?.routes || []).map((x) => x.sale));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <RvCard code="QUERY" title="조회 조건">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} />
          <span style={{ color: "#94A3B8", fontWeight: 800 }}>~</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} />
          <div style={{ position: "relative", flex: "1 1 260px", minWidth: 220 }}>
            <input value={client || q} onChange={(e) => { setClient(""); setQ(e.target.value); }} placeholder="거래처 검색 (비우면 전체)" style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
            {sugg.length > 0 && !client && (
              <div style={{ position: "absolute", top: 44, left: 0, right: 0, zIndex: 20, background: "#fff", border: "1px solid #E3E8F0", borderRadius: 12, boxShadow: "0 12px 28px rgba(15,26,48,.14)", overflow: "hidden" }}>
                {sugg.map((n) => <button key={n} type="button" onClick={() => { setClient(n); setQ(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", background: "#fff", fontSize: 14, fontWeight: 700, color: "#0F1A30", cursor: "pointer" }}>{n}</button>)}
              </div>
            )}
          </div>
          {[["이번 달", `${today.slice(0, 7)}-01`, today], ["최근 30일", new Date(Date.now() + 9 * 3600e3 - 29 * 864e5).toISOString().slice(0, 10), today], ["올해", `${today.slice(0, 4)}-01-01`, today]].map(([l, f, t]) => (
            <button key={l} type="button" onClick={() => { setFrom(f); setTo(t); }} style={{ height: 40, padding: "0 12px", borderRadius: 10, border: "1px solid #DCE3EF", background: "#fff", fontSize: 13.5, fontWeight: 800, color: NAVY, cursor: "pointer" }}>{l}</button>
          ))}
          <button type="button" onClick={() => { if (from > to) { alert("시작일이 종료일보다 늦습니다."); return; } setApplied({ from, to, client }); }} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${NAVY},#2D4C82)`, color: "#fff", fontSize: 14.5, fontWeight: 900, cursor: "pointer", boxShadow: "0 6px 14px rgba(27,43,75,.25)" }}>조회</button>
        </div>
      </RvCard>

      {!res ? <RvCard code="RESULT" title="조회 결과"><Empty text="기간과 거래처를 고르고 조회를 누르세요" /></RvCard> : (
        <>
          <div style={grid4}>
            <RvTile dark code="REVENUE" label={applied.client || "전체 거래처"} value={rvShort(res.s.sale)} unit="원" foot={<span>{applied.from} ~ {applied.to}</span>} />
            <RvTile code="PROFIT" label="수익" value={rvShort(res.s.profit)} unit="원" foot={<span>수익률 {res.s.rate.toFixed(1)}%</span>} />
            <RvTile code="ORDERS" label="건수" value={res.s.cnt.toLocaleString()} unit="건" foot={<span>건당 {rvShort(res.s.cnt ? res.s.sale / res.s.cnt : 0)}원</span>} />
            <RvTile code="DRIVER" label="기사운임" value={rvShort(res.s.driver)} unit="원" foot={<span>운행일 {res.daily.length}일</span>} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 14 }}>
            <RvCard code="DAILY" title="일별 매출 · 수익">
              {res.daily.length === 0 ? <Empty /> : (
                <div style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={res.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#EEF1F6" vertical={false} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#6b7280", fontFamily: MONO }} />
                      <YAxis axisLine={false} tickLine={false} width={52} tick={{ fontSize: 11, fill: "#9ca3af", fontFamily: MONO }} tickFormatter={rvShort} />
                      <Tooltip contentStyle={tip} formatter={(v, n) => [n === "cnt" ? `${v}건` : won(v), { sale: "매출", profit: "수익", cnt: "건수" }[n]]} />
                      <ReferenceLine y={res.s.sale / Math.max(1, res.daily.length)} stroke="#94A3B8" strokeDasharray="4 4" />
                      <Bar dataKey="sale" fill="#9FB2D6" radius={[4, 4, 0, 0]} barSize={14} />
                      <Line type="monotone" dataKey="profit" stroke={NAVY} strokeWidth={2.4} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </RvCard>
            <RvCard code="VEHICLE" title="차종 구성">
              {res.cars.length === 0 ? <Empty /> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {res.cars.slice(0, 7).map((c, i) => (
                    <div key={c.name}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 800, color: "#0F1A30" }}><span>{c.name}</span><span style={{ fontFamily: MONO, color: NAVY }}>{c.v}건</span></div>
                      <div style={{ height: 6, borderRadius: 99, background: "#EEF1F6", marginTop: 4, overflow: "hidden" }}><div style={{ height: "100%", width: `${(c.v / res.cars[0].v) * 100}%`, background: SHADES[Math.min(i + 1, SHADES.length - 1)] }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </RvCard>
          </div>
          <RvCard code="ROUTES" title="주요 노선 (매출순)">
            {res.routes.length === 0 ? <Empty /> : res.routes.map((x, i) => (
              <div key={x.k} style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1.4fr) minmax(0,1fr) 60px 90px", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? "1px solid #EEF1F6" : "none" }}>
                <Rank i={i} />
                <span style={{ fontSize: 14, fontWeight: 800, color: "#0F1A30", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.k}</span>
                <div style={{ height: 8, borderRadius: 99, background: "#EEF1F6", overflow: "hidden" }}><div style={{ height: "100%", width: `${(x.sale / routeMax) * 100}%`, background: i === 0 ? NAVY : "#6E8BC4" }} /></div>
                <span style={{ fontFamily: MONO, fontSize: 13, color: "#6b7280", textAlign: "right" }}>{x.cnt}건</span>
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: NAVY, textAlign: "right" }}>{rvShort(x.sale)}</span>
              </div>
            ))}
          </RvCard>
        </>
      )}
    </div>
  );
}
