// src/mobile/MobileIntelView.jsx — 경영인텔리전스 (모바일 totalMaster 전용)
import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const NAVY = "#1B2B4B";
const PIN_KEY = "exec_intel_pin_v1";
const BIOMETRIC_KEY = "exec_intel_biometric_v1";

function ab2b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b642ab(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// ────────────────────────────────────────────────
//  PIN GATE (mobile inline-style) + 생체인증
// ────────────────────────────────────────────────
function MobilePinGate({ onVerified }) {
  const hasPin = !!localStorage.getItem(PIN_KEY);
  const [mode, setMode] = useState(hasPin ? "verify" : "setup1");
  const [entered, setEntered] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");
  const [animKey, setAnimKey] = useState(0);
  const [hasBiometric, setHasBiometric] = useState(() => !!localStorage.getItem(BIOMETRIC_KEY));
  const [biometricSupported] = useState(() => !!(window.PublicKeyCredential));
  const [bioLoading, setBioLoading] = useState(false);

  const bump = () => { setAnimKey(k => k + 1); setEntered(""); setError(""); };

  const handleKey = (d) => {
    if (d === "back") { setEntered(p => p.slice(0, -1)); return; }
    if (entered.length >= 6) return;
    const next = entered + d;
    setEntered(next);
    if (next.length < 6) return;

    setTimeout(() => {
      if (mode === "verify") {
        if (next === localStorage.getItem(PIN_KEY)) { onVerified(); }
        else { setError("비밀번호가 올바르지 않습니다"); bump(); }
      } else if (mode === "setup1") {
        setFirstPin(next); setEntered(""); setMode("setup2");
      } else if (mode === "setup2") {
        if (next === firstPin) { localStorage.setItem(PIN_KEY, next); onVerified(); }
        else { setError("비밀번호가 일치하지 않습니다"); setFirstPin(""); setMode("setup1"); bump(); }
      }
    }, 200);
  };

  const registerBiometric = async () => {
    if (!biometricSupported) { setError("이 기기는 생체인증을 지원하지 않습니다"); return; }
    setBioLoading(true); setError("");
    try {
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: "배차 앱" },
          user: { id: new Uint8Array([1, 0, 0, 0]), name: "intel_user", displayName: "경영인텔리전스" },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
          },
          timeout: 60000,
          attestation: "none",
        },
      });
      localStorage.setItem(BIOMETRIC_KEY, ab2b64(cred.rawId));
      setHasBiometric(true);
      setError("생체인증이 등록되었습니다");
    } catch (e) {
      setError("생체인증 등록 실패: " + (e.message || "지원되지 않는 기기"));
    } finally { setBioLoading(false); }
  };

  const verifyBiometric = async () => {
    const credId = localStorage.getItem(BIOMETRIC_KEY);
    if (!credId) return;
    setBioLoading(true); setError("");
    try {
      await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rpId: window.location.hostname || "localhost",
          allowCredentials: [{ type: "public-key", id: b642ab(credId) }],
          userVerification: "required",
          timeout: 60000,
        },
      });
      onVerified();
    } catch (e) {
      setError("생체인증 실패. 비밀번호를 입력하세요");
    } finally { setBioLoading(false); }
  };

  const heading =
    mode === "verify" ? "보안 인증" :
    mode === "setup1" ? "비밀번호 설정" : "비밀번호 확인";
  const sub =
    mode === "verify" ? "6자리 비밀번호를 입력하세요" :
    mode === "setup1" ? "사용할 6자리 비밀번호를 입력하세요" :
    "비밀번호를 한 번 더 입력하여 확인하세요";

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh", background: "#f4f6f9", padding: 24 }}>
      <div style={{ background: "white", borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,.12)", padding: 32, width: "100%", maxWidth: 340 }}>
        {/* 아이콘 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
          <div style={{ width: 60, height: 60, background: NAVY, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14, boxShadow: "0 4px 12px rgba(27,43,75,.3)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", color: "#d1d5db", marginBottom: 6 }}>CONFIDENTIAL</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: NAVY }}>{heading}</div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 6, textAlign: "center" }}>{sub}</div>
        </div>

        {/* 생체인증 버튼 (verify 모드, 등록된 경우) */}
        {mode === "verify" && hasBiometric && biometricSupported && (
          <button
            onClick={verifyBiometric}
            disabled={bioLoading}
            style={{
              width: "100%", marginBottom: 20, padding: "14px 0",
              background: NAVY, color: "white", borderRadius: 14, border: "none",
              fontSize: 14, fontWeight: 700, cursor: bioLoading ? "not-allowed" : "pointer",
              opacity: bioLoading ? 0.6 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              fontFamily: "'Noto Sans KR', sans-serif",
            }}
          >
            {/* 지문 아이콘 */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z"/>
              <path d="M8.5 8.5C9.3 7.6 10.6 7 12 7s2.7.6 3.5 1.5"/>
              <path d="M7 11c0-2.76 2.24-5 5-5s5 2.24 5 5"/>
              <path d="M9 12.5c0-1.66 1.34-3 3-3s3 1.34 3 3"/>
              <path d="M12 12v4"/>
              <path d="M10 14c0 1.1.9 2 2 2s2-.9 2-2"/>
            </svg>
            {bioLoading ? "인증 중..." : "지문 / Face ID로 인증"}
          </button>
        )}

        {/* 도트 */}
        <div key={animKey} style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 20 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: "50%",
              background: i < entered.length ? NAVY : "white",
              border: `2px solid ${i < entered.length ? NAVY : "#d1d5db"}`,
              transition: "all .15s",
            }} />
          ))}
        </div>

        {error && (
          <div style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "#ef4444", background: "#fef2f2", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>{error}</div>
        )}

        {/* 키패드 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[1,2,3,4,5,6,7,8,9,null,0,"←"].map((d, i) => (
            <button
              key={i}
              onClick={() => d !== null && handleKey(d === "←" ? "back" : String(d))}
              disabled={d === null}
              style={{
                height: 52, borderRadius: 12, border: "1px solid #e5e7eb",
                background: d === "←" ? "#f3f4f6" : "#f8f9fb",
                color: d === "←" ? "#6b7280" : NAVY,
                fontSize: d === "←" ? 15 : 18, fontWeight: 600,
                cursor: d === null ? "default" : "pointer",
                opacity: d === null ? 0 : 1,
                fontFamily: "'Noto Sans KR', sans-serif",
              }}
            >{d}</button>
          ))}
        </div>

        {/* 하단 링크들 */}
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          {mode === "verify" && (
            <button
              onClick={() => { localStorage.removeItem(PIN_KEY); setMode("setup1"); setEntered(""); setError(""); setFirstPin(""); }}
              style={{ textAlign: "center", fontSize: 12, color: "#d1d5db", background: "none", border: "none", cursor: "pointer", fontFamily: "'Noto Sans KR', sans-serif" }}
            >
              비밀번호를 잊으셨나요? — 재설정
            </button>
          )}
          {mode === "verify" && biometricSupported && (
            <button
              onClick={hasBiometric ? () => { localStorage.removeItem(BIOMETRIC_KEY); setHasBiometric(false); setError("생체인증이 해제되었습니다"); } : registerBiometric}
              disabled={bioLoading}
              style={{ textAlign: "center", fontSize: 12, color: hasBiometric ? "#d1d5db" : "#6b7280", background: "none", border: "none", cursor: "pointer", fontFamily: "'Noto Sans KR', sans-serif" }}
            >
              {bioLoading ? "처리 중..." : hasBiometric ? "생체인증 해제" : "지문 / Face ID 등록"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
//  UTILITIES
// ────────────────────────────────────────────────
function toInt(v) { return parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0; }

function fmtW(v) {
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}백만`;
  if (v >= 1e4) return `${Math.round(v / 1e4)}만원`;
  return `${v.toLocaleString()}원`;
}

function getYM(dateStr) { return dateStr?.slice(0, 7) ?? ""; }
function getY(dateStr) { return dateStr?.slice(0, 4) ?? ""; }

// ────────────────────────────────────────────────
//  MAIN COMPONENT
// ────────────────────────────────────────────────
export default function MobileIntelView({ dispatchData = [] }) {
  const [verified, setVerified] = useState(() => {
    return sessionStorage.getItem("exec_intel_ok") === "1";
  });

  const handleVerified = () => {
    sessionStorage.setItem("exec_intel_ok", "1");
    setVerified(true);
  };

  if (!verified) {
    return <MobilePinGate onVerified={handleVerified} />;
  }

  return <IntelDashboard dispatchData={dispatchData} />;
}

function IntelDashboard({ dispatchData }) {
  const now = new Date();
  const cyStr = String(now.getFullYear());
  const cm = String(now.getMonth() + 1).padStart(2, "0");
  const pm = String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0");
  const pmY = String(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const cmPrefix = `${cyStr}-${cm}`;
  const pmPrefix = `${pmY}-${pm}`;

  const thisMonth = useMemo(() => dispatchData.filter(d => getYM(d.상차일) === cmPrefix), [dispatchData, cmPrefix]);
  const lastMonth = useMemo(() => dispatchData.filter(d => getYM(d.상차일) === pmPrefix), [dispatchData, pmPrefix]);
  const thisYear  = useMemo(() => dispatchData.filter(d => getY(d.상차일) === cyStr), [dispatchData, cyStr]);

  const tmRev  = useMemo(() => thisMonth.reduce((s, d) => s + toInt(d.청구운임), 0), [thisMonth]);
  const tmProfit = useMemo(() => thisMonth.reduce((s, d) => s + toInt(d.청구운임) - toInt(d.기사운임), 0), [thisMonth]);
  const lmRev  = useMemo(() => lastMonth.reduce((s, d) => s + toInt(d.청구운임), 0), [lastMonth]);
  const cyRev  = useMemo(() => thisYear.reduce((s, d) => s + toInt(d.청구운임), 0), [thisYear]);
  const tmTrend = lmRev > 0 ? ((tmRev - lmRev) / lmRev * 100) : 0;

  // 최근 6개월 차트
  const monthly6 = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const rows = dispatchData.filter(x => getYM(x.상차일) === prefix);
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
          { label: "이번달 매출", val: fmtW(tmRev), sub: `${cyStr}.${cm}`, trend: tmTrend, primary: true },
          { label: "이번달 수익", val: fmtW(tmProfit), sub: `${thisMonth.length}건 기준` },
          { label: "이번달 건수", val: `${thisMonth.length}건`, sub: `전월 ${lastMonth.length}건` },
          { label: "연간 누적 매출", val: fmtW(cyRev), sub: `${cyStr}년 기준` },
        ].map(({ label, val, sub, trend, primary }) => (
          <div key={label} style={{
            background: primary ? NAVY : "white",
            borderRadius: 14, padding: "14px 16px",
            border: primary ? "none" : "1px solid #e5e7eb",
            boxShadow: primary ? "0 2px 8px rgba(27,43,75,.2)" : "none",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: primary ? "rgba(255,255,255,.5)" : "#6b7280", marginBottom: 5, letterSpacing: ".05em" }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: primary ? "#fff" : NAVY, lineHeight: 1.1 }}>{val}</div>
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
        <div style={{ padding: "0 16px 12px", fontSize: 13, fontWeight: 800, color: NAVY }}>
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
            <Bar dataKey="매출" fill={NAVY} radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 상위 거래처 */}
      <div style={{ margin: "16px 16px 0", background: "white", borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: NAVY }}>이번달 상위 거래처</span>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{cyStr}.{cm}</span>
        </div>
        <div style={{ padding: "4px 16px 12px" }}>
          {topClients.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "#9ca3af" }}>데이터 없음</div>
          ) : topClients.map(([name, rev], i) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < topClients.length - 1 ? "1px solid #f9fafb" : "none" }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                background: i < 3 ? NAVY : "#f3f4f6",
                color: i < 3 ? "white" : "#6b7280",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
              }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                <div style={{ marginTop: 4, width: "100%", height: 4, background: "#f3f4f6", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: NAVY, borderRadius: 99, width: `${(rev / maxClient) * 100}%`, opacity: Math.max(0.3, 1 - i * 0.12), transition: "width .6s" }} />
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: NAVY, flexShrink: 0 }}>{fmtW(rev)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 상위 기사 */}
      <div style={{ margin: "16px 16px 0", background: "white", borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: NAVY }}>이번달 상위 기사</span>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{cyStr}.{cm} 배차건수</span>
        </div>
        <div style={{ padding: "4px 16px 12px" }}>
          {topDrivers.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "#9ca3af" }}>데이터 없음</div>
          ) : topDrivers.map(([name, cnt], i) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < topDrivers.length - 1 ? "1px solid #f9fafb" : "none" }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                background: i < 3 ? NAVY : "#f3f4f6",
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
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: NAVY, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: NAVY, fontWeight: 600 }}>전체 {dispatchData.length.toLocaleString()}건 배차 데이터 기반</span>
      </div>
    </div>
  );
}
