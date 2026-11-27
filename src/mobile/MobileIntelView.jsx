// src/mobile/MobileIntelView.jsx — 경영인텔리전스 (모바일 totalMaster 전용)
import React, { useState, useMemo, useEffect } from "react";
import { useRouteCarrierFilter } from "../routeCarriers"; // ⭐ 2026-11-05 고정노선 운송업체 설정
import { isInsightRow, insightRange } from "../ProInsight";
import { salesMonthOf, salesBillDateOf, fixedSalesRows } from "../salesRule";
import { useCompanyRows } from "../companyColStore";
import { getTenant } from "../fsTenant"; // 🗓 2026-11-25 달 = 청구월(마감월) // ⭐ 2026-11-05 PC·모바일 일치 — 인사이트 매출 기준 공용
import { useExecPinPad, execPinTexts, EXEC_PIN_FORGOT, clearLegacyExecPin } from "../execPinApi"; // 🔐 2026-11-27 PIN 서버 확인
import { orderProfit } from "../forkliftCore"; // ⭐ 2026-11-17 수익 = 청구 − 기사 − 회사가 따로 지급(지게차·외부 특수운임)
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const NAVY = "#1B2B4B";
// 🔐 2026-11-27 PIN 은 서버에서 확인(functions/execPin.js) — 예전 기기 저장 PIN · 얼굴 · 지문(WebAuthn, 화면에서만 확인하던 것)은 뺐다

// ────────────────────────────────────────────────
//  PIN GATE (mobile inline-style) — 숫자 패드는 그대로, 확인 · 잠금은 서버
// ────────────────────────────────────────────────
function MobilePinGate({ onVerified, accent = NAVY }) {
  const pad = useExecPinPad({ onVerified });
  const { phase, entered, error, info, busy, locked, animKey, length } = pad;
  const [heading, sub] = execPinTexts(phase);
  const showPad = phase === "verify" || phase === "setup1" || phase === "setup2";
  const font = "'Noto Sans KR', sans-serif";

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh", background: "#f4f6f9", padding: 24 }}>
      <div style={{ background: "white", borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,.12)", padding: 32, width: "100%", maxWidth: 340 }}>
        {/* 아이콘 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
          <div style={{ width: 60, height: 60, background: accent, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14, boxShadow: "0 4px 12px rgba(27,43,75,.3)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", color: "#d1d5db", marginBottom: 6 }}>CONFIDENTIAL</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: accent }}>{heading}</div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 6, textAlign: "center" }}>{busy ? "확인하는 중…" : sub}</div>
        </div>

        {showPad && (
          <div key={animKey} style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 20 }}>
            {Array.from({ length }).map((_, i) => (
              <div key={i} style={{
                width: 14, height: 14, borderRadius: "50%",
                background: i < entered.length ? accent : "white",
                border: `2px solid ${i < entered.length ? accent : "#d1d5db"}`,
                transition: "all .15s",
              }} />
            ))}
          </div>
        )}

        {info && !error && (
          <div style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "#1B2B4B", background: "#EEF3FC", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>{info}</div>
        )}
        {error && (
          <div style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "#ef4444", background: "#fef2f2", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>{error}</div>
        )}

        {phase === "netError" && (
          <button onClick={pad.retry} style={{ width: "100%", height: 46, borderRadius: 12, border: "none", background: accent, color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: font }}>다시 시도</button>
        )}

        {/* 키패드 */}
        {showPad && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, opacity: busy || locked ? 0.5 : 1 }}>
            {[1,2,3,4,5,6,7,8,9,null,0,"←"].map((d, i) => (
              <button
                key={i}
                onClick={() => d !== null && pad.press(d === "←" ? "back" : String(d))}
                disabled={d === null || busy || !!locked}
                style={{
                  height: 52, borderRadius: 12, border: "1px solid #e5e7eb",
                  background: d === "←" ? "#f3f4f6" : "#f8f9fb",
                  color: d === "←" ? "#6b7280" : accent,
                  fontSize: d === "←" ? 15 : 18, fontWeight: 600,
                  cursor: d === null ? "default" : "pointer",
                  opacity: d === null ? 0 : 1,
                  fontFamily: font,
                }}
              >{d}</button>
            ))}
          </div>
        )}

        {/* 하단 안내 — 예전 [재설정]은 누구나 새 번호를 정할 수 있어 뺐다 */}
        {phase === "verify" && (
          <div style={{ marginTop: 18, textAlign: "center", fontSize: 12, color: "#9ca3af", lineHeight: 1.5, fontFamily: font }}>{EXEC_PIN_FORGOT}</div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
//  UTILITIES
// ────────────────────────────────────────────────
function toInt(v) { return parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0; }

function fmtW(v) {
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}억원`;
  if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만원`; // 📱 2026-11-17 "12.3백만" 대신 "1,230만원"
  return `${v.toLocaleString()}원`;
}

// (🗓 2026-11-25 getYM 은 청구월 salesMonthOf 로 바꿔 지웠다)
function getY(dateStr) { return dateStr?.slice(0, 4) ?? ""; }

// ────────────────────────────────────────────────
//  MAIN COMPONENT
// ────────────────────────────────────────────────
export default function MobileIntelView({ dispatchData: allDispatchData = [], cardVersionB = false }) {
  // ⭐ 2026-11-05 고정노선 운송업체 설정 — 끈 업체 오더는 경영인텔리전스 매출에서 뺀다
  const carrierF = useRouteCarrierFilter();
  // ⭐ 2026-11-05 PC·모바일 일치 — PC 인사이트(ProInsight)와 같은 기준: 상차일 있음 · 취소 아님 · 청구운임 > 0
  // 📏 2026-11-27 고정거래처 매출도 넣는다 — PC 홈 · 경영 브리핑 · 매출관리와 같은 매출 규칙(salesRule)
  const fixedLive = useCompanyRows("fixedClients", getTenant());
  const dispatchData = React.useMemo(() => [...(carrierF.filter(allDispatchData) || []).filter(isInsightRow), ...fixedSalesRows(fixedLive).filter((r) => r.상차일 && Number(r.청구운임) > 0)], [allDispatchData, carrierF, fixedLive]);
  const [verified, setVerified] = useState(() => {
    return sessionStorage.getItem("exec_intel_ok") === "1";
  });

  useEffect(() => { clearLegacyExecPin(); }, []); // 🔐 2026-11-27 예전 기기 저장 PIN 지우기(이제 서버에서 확인)

  const handleVerified = () => {
    sessionStorage.setItem("exec_intel_ok", "1");
    setVerified(true);
  };

  const ACCENT = cardVersionB ? NAVY : "#2563eb";

  if (!verified) {
    return <MobilePinGate onVerified={handleVerified} accent={ACCENT} />;
  }

  return <IntelDashboard dispatchData={dispatchData} accent={ACCENT} />;
}

function IntelDashboard({ dispatchData, accent = NAVY }) {
  const now = new Date();
  const cyStr = String(now.getFullYear());
  const cm = String(now.getMonth() + 1).padStart(2, "0");
  const pm = String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0");
  const pmY = String(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const cmPrefix = `${cyStr}-${cm}`;
  const pmPrefix = `${pmY}-${pm}`;

  // ⭐ 2026-11-05 PC·모바일 일치 — PC 인사이트 "이번 달"과 같은 기간(1일~오늘) · 전월 대비도 PC처럼 지난달 같은 날까지
  const { s: tmS, e: tmE, ps: pmS, pe: pmE } = insightRange("this");
  // 🗓 2026-11-25 달 · 연 매출은 청구월(마감월) 기준 — 청구일(salesBillDateOf · 이월 오더는 청구월 1일)로 나눈다(PC 인사이트 · 매출관리와 같다)
  const thisMonth = useMemo(() => dispatchData.filter(d => { const b = salesBillDateOf(d); return b >= tmS && b <= tmE; }), [dispatchData, tmS, tmE]);
  const lastMonth = useMemo(() => dispatchData.filter(d => { const b = salesBillDateOf(d); return b >= pmS && b <= pmE; }), [dispatchData, pmS, pmE]);
  const thisYear  = useMemo(() => dispatchData.filter(d => getY(salesBillDateOf(d)) === cyStr), [dispatchData, cyStr]);

  const tmRev  = useMemo(() => thisMonth.reduce((s, d) => s + toInt(d.청구운임), 0), [thisMonth]);
  const tmProfit = useMemo(() => thisMonth.reduce((s, d) => s + orderProfit(d), 0) /* ⭐ 2026-11-17 줄 수수료와 같은 식 */, [thisMonth]);
  const lmRev  = useMemo(() => lastMonth.reduce((s, d) => s + toInt(d.청구운임), 0), [lastMonth]);
  const cyRev  = useMemo(() => thisYear.reduce((s, d) => s + toInt(d.청구운임), 0), [thisYear]);
  const tmTrend = lmRev > 0 ? ((tmRev - lmRev) / lmRev * 100) : 0;

  // 최근 6개월 차트
  const monthly6 = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const rows = dispatchData.filter(x => salesMonthOf(x) === prefix); // 🗓 청구월
      return {
        month: `${String(d.getMonth() + 1).padStart(2, "0")}월`,
        매출: rows.reduce((s, x) => s + toInt(x.청구운임), 0),
        건수: rows.length,
      };
    });
  }, [dispatchData]);

  // 상위 거래처 (이번달)
  const topClients = useMemo(() => {
    const map = {};
    thisMonth.forEach(r => {
      const k = r.거래처명 || "미입력";
      map[k] = (map[k] || 0) + toInt(r.청구운임);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [thisMonth]);

  // 상위 기사 (이번달)
  const topDrivers = useMemo(() => {
    const map = {};
    thisMonth.forEach(r => {
      const k = r.기사명 || "미배차";
      if (k === "미배차") return;
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [thisMonth]);

  const maxClient = topClients[0]?.[1] || 1;
  const maxDriver = topDrivers[0]?.[1] || 1;

  const trendColor = tmTrend >= 0 ? "#10b981" : "#ef4444";
  const trendLabel = `${tmTrend >= 0 ? "▲" : "▼"} ${Math.abs(tmTrend).toFixed(1)}%`;

  return (
    <div style={{ fontFamily: "'Noto Sans KR', sans-serif", paddingBottom: 32 }}>

      {/* KPI 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "16px 16px 0" }}>
        {[
          { label: "이번 달 매출", val: fmtW(tmRev), sub: `${cyStr}.${cm}`, trend: tmTrend, primary: true },
          { label: "이번 달 수익", val: fmtW(tmProfit), sub: `${thisMonth.length}건 기준` },
          { label: "이번 달 건수", val: `${thisMonth.length}건`, sub: `전월 ${lastMonth.length}건` },
          { label: "연간 누적 매출", val: fmtW(cyRev), sub: `${cyStr}년 기준` },
        ].map(({ label, val, sub, trend, primary }) => (
          <div key={label} style={{
            background: primary ? accent : "white",
            borderRadius: 14, padding: "14px 16px",
            border: primary ? "none" : "1px solid #e5e7eb",
            boxShadow: primary ? "0 2px 8px rgba(27,43,75,.2)" : "none",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: primary ? "rgba(255,255,255,.5)" : "#6b7280", marginBottom: 5, letterSpacing: ".05em" }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: primary ? "#fff" : accent, lineHeight: 1.1 }}>{val}</div>
            <div style={{ fontSize: 11, color: primary ? "rgba(255,255,255,.4)" : "#9ca3af", marginTop: 4 }}>{sub}</div>
            {trend !== undefined && (
              <div style={{ fontSize: 11, fontWeight: 700, color: primary ? (trend >= 0 ? "#6ee7b7" : "#fca5a5") : trendColor, marginTop: 4 }}>
                {trendLabel} 전월 대비
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 월별 매출 차트 */}
      <div style={{ margin: "16px 16px 0", background: "white", borderRadius: 14, border: "1px solid #e5e7eb", padding: "16px 0 8px" }}>
        <div style={{ padding: "0 16px 12px", fontSize: 13, fontWeight: 800, color: accent }}>
          월별 매출 추이
          <span style={{ fontSize: 11, fontWeight: 500, color: "#9ca3af", marginLeft: 8 }}>최근 6개월</span>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={monthly6} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v >= 1e4 ? `${(v/1e4).toFixed(0)}만` : String(v)}
              tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={36}
            />
            <Tooltip
              formatter={(v) => [`${v.toLocaleString()}원`, "매출"]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Bar dataKey="매출" fill={accent} radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 상위 거래처 */}
      <div style={{ margin: "16px 16px 0", background: "white", borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: accent }}>이번 달 상위 거래처</span>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{cyStr}.{cm}</span>
        </div>
        <div style={{ padding: "4px 16px 12px" }}>
          {topClients.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "#9ca3af" }}>데이터 없음</div>
          ) : topClients.map(([name, rev], i) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < topClients.length - 1 ? "1px solid #f9fafb" : "none" }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                background: i < 3 ? accent : "#f3f4f6",
                color: i < 3 ? "white" : "#6b7280",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
              }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                <div style={{ marginTop: 4, width: "100%", height: 4, background: "#f3f4f6", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: accent, borderRadius: 99, width: `${(rev / maxClient) * 100}%`, opacity: Math.max(0.3, 1 - i * 0.12), transition: "width .6s" }} />
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: accent, flexShrink: 0 }}>{fmtW(rev)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 상위 기사 */}
      <div style={{ margin: "16px 16px 0", background: "white", borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: accent }}>이번 달 상위 기사</span>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{cyStr}.{cm} 배차건수</span>
        </div>
        <div style={{ padding: "4px 16px 12px" }}>
          {topDrivers.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "#9ca3af" }}>데이터 없음</div>
          ) : topDrivers.map(([name, cnt], i) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < topDrivers.length - 1 ? "1px solid #f9fafb" : "none" }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                background: i < 3 ? accent : "#f3f4f6",
                color: i < 3 ? "white" : "#6b7280",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
              }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{name}</div>
                <div style={{ marginTop: 4, width: "100%", height: 4, background: "#f3f4f6", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "#3b82f6", borderRadius: 99, width: `${(cnt / maxDriver) * 100}%`, opacity: Math.max(0.3, 1 - i * 0.12), transition: "width .6s" }} />
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#3b82f6", flexShrink: 0 }}>{cnt}건</div>
            </div>
          ))}
        </div>
      </div>

      {/* 전체 데이터 수 */}
      <div style={{ margin: "14px 16px 0", padding: "12px 16px", background: "#f0f4f9", borderRadius: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: accent, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: accent, fontWeight: 600 }}>전체 {dispatchData.length.toLocaleString()}건 배차 데이터 기반</span>
      </div>
    </div>
  );
}
