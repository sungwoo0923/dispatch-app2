// ======================= src/FleetControlDeck.jsx =======================
// 🛰 2026-11-25 지입차관리 › 관제현황 리디자인 — 관제실 다크(사용자가 시안 B를 고름)
//  · 위: 관제 이름 · 시계 · 요약 6칸(등록 · 앱 접속 · 운행 · 상하차 · 대기 · 확인할 알림)
//  · 가운데: 왼쪽 차량 목록 | 큰 지도(위에서 본 트럭 · src/fleetTruck.js) | 오른쪽 확인할 일 + 활동 기록
//  · 아래: 지금 상태 분포 띠
//  · 지도 · 동선 날짜 칸은 FleetManagement 가 만들어 넘긴다(renderMap · trackDate). 상세 패널은 지금처럼 아래에 따로
//  · 좁은 화면: 오른쪽 칸은 아래로, 휴대폰 폭이면 한 줄씩
import React from "react";
import { PHASE_GROUPS, truckColor, TRUCK_CSS } from "./fleetTruck";

const FONT = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const C = { bg: "#070D1A", panel: "#0A1222", panel2: "#0E1A30", line: "#1A2742", line2: "#22345A", text: "#E6EDF8", sub: "#8796AE", dim: "#6B7A95", accent: "#38BDF8", blue: "#7FA4E6" };

const tsMs = (t) => (t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : t instanceof Date ? t.getTime() : typeof t === "number" ? t : null);
function ago(t) {
  const ms = tsMs(t); if (ms == null) return "-";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}초 전`; if (s < 3600) return `${Math.floor(s / 60)}분 전`; if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}
const hhmm = (t) => { const ms = tsMs(t); if (ms == null) return "--:--"; const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
// 근무 시간: 일하는 중이면 출근 시각부터 지금까지, 퇴근했으면 기록된 분
function workText(d) {
  const st = tsMs(d.workStartAt);
  const out = d.상태 === "퇴근" || d.상태 === "최종퇴근";
  const min = !out && st ? Math.round((Date.now() - st) / 60000) : Number(d.근무시간) || 0;
  if (min <= 0) return "-";
  return min >= 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min}분`;
}
const groupOf = (ph) => PHASE_GROUPS.find((g) => g.phases.includes(ph)) || PHASE_GROUPS[3];

function Clock() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const p = (n) => String(n).padStart(2, "0");
  const wd = "일월화수목금토"[now.getDay()];
  return (
    <div style={{ textAlign: "right", lineHeight: 1.15 }}>
      <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: ".02em", fontVariantNumeric: "tabular-nums" }}>{p(now.getHours())}:{p(now.getMinutes())}:{p(now.getSeconds())}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.sub }}>{now.getMonth() + 1}.{p(now.getDate())} ({wd})</div>
    </div>
  );
}

const DECK_CSS = `
.lwd-wrap{container-type:inline-size}
.lwd-tools>*{pointer-events:auto}
.lwd{font-family:${FONT};background:${C.bg};color:${C.text};border-radius:18px;overflow:hidden;border:1px solid ${C.line};display:flex;flex-direction:column;height:max(660px,calc(100vh - 170px));font-variant-numeric:tabular-nums}
.lwd *{box-sizing:border-box}
.lwd-top{display:flex;align-items:stretch;border-bottom:1px solid ${C.line};background:linear-gradient(180deg,#0C1528,#08101F);flex-shrink:0}
.lwd-brand{width:300px;flex-shrink:0;display:flex;align-items:center;gap:12px;padding:12px 18px;border-right:1px solid ${C.line}}
.lwd-kpis{flex:1;display:grid;grid-template-columns:repeat(6,minmax(0,1fr))}
.lwd-kpi{display:flex;flex-direction:column;justify-content:center;gap:2px;padding:10px 16px;border-right:1px solid ${C.line};min-width:0}
.lwd-kpi:last-child{border-right:0}
.lwd-body{flex:1;min-height:0;display:grid;grid-template-columns:300px minmax(0,1fr) 330px}
.lwd-col{min-height:0;display:flex;flex-direction:column;background:${C.panel}}
.lwd-map{position:relative;min-width:0;min-height:0;background:#08111F}
.lwd-scroll{flex:1;min-height:0;overflow:auto}
.lwd-scroll::-webkit-scrollbar{width:8px}.lwd-scroll::-webkit-scrollbar-thumb{background:#22345A;border-radius:8px}
.lwd-row{width:100%;display:flex;align-items:center;gap:10px;padding:10px 14px;border:0;border-bottom:1px solid #13213D;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.lwd-row:hover{background:#0F1C34}
.lwd-row.on{background:#11223F;box-shadow:inset 3px 0 0 ${C.accent}}
.lwd-chip{height:30px;padding:0 10px;border-radius:8px;border:1px solid ${C.line2};background:transparent;color:#A9B8D2;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.lwd-chip.on{border-color:#3B5B97;background:#1B2E54;color:#fff}
.lwd-btn{height:34px;padding:0 12px;border-radius:9px;border:1px solid ${C.line2};background:rgba(13,26,50,.88);color:#CFE0FF;font:inherit;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
.lwd-btn:hover{border-color:#3B5B97;background:#13264A}
.lwd-btn.pri{background:#2563EB;border-color:#2563EB;color:#fff}
.lwd-input{width:100%;height:40px;padding:0 12px 0 34px;border:1px solid ${C.line2};border-radius:10px;background:${C.panel2};color:${C.text};font:inherit;font-size:14px;outline:none}
.lwd-input:focus{border-color:#3B82F6}
.lwd-input::placeholder{color:#5D6E8C}
.lwd-foot{height:52px;flex-shrink:0;display:flex;align-items:center;gap:16px;padding:0 18px;border-top:1px solid ${C.line};background:${C.panel}}
@keyframes lwdBlink{0%,100%{opacity:1}50%{opacity:.3}}
.lwd-live{animation:lwdBlink 1.4s ease-in-out infinite}
@container (max-width:1180px){.lwd-body{grid-template-columns:280px minmax(0,1fr)}.lwd-right{grid-column:1/-1;max-height:300px;border-top:1px solid ${C.line}}.lwd{height:auto}.lwd-body{grid-template-rows:minmax(560px,calc(100vh - 320px)) auto}}
@container (max-width:1000px){.lwd-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.lwd-kpi:nth-child(3){border-right:0}.lwd-kpi:nth-child(-n+3){border-bottom:1px solid ${C.line}}}
@container (max-width:760px){.lwd-top{flex-direction:column}.lwd-brand{width:auto;border-right:0;border-bottom:1px solid ${C.line}}.lwd-body{grid-template-columns:1fr;grid-template-rows:auto}.lwd-map{height:62vh;min-height:380px;order:-1}.lwd-left{max-height:420px}.lwd-foot{flex-wrap:wrap;height:auto;padding:10px 14px}.lwd-legend{flex-wrap:wrap}}
${TRUCK_CSS}
`;

export default function FleetControlDeck({
  drivers = [], phaseById, searchQuery = "", onSearch, selected, onSelect, onContextMenu,
  locChangeRequests = [], collisionAlerts = [], onLocRequest, onLocDismiss, onCollisionResolve,
  logs = [], driversMap = {}, onDeleteFeed, todayPhotoIds = null,
  renderMap, trackDate = null, onMapRefresh, onFitAll, onOpenDetail,
}) {
  const [group, setGroup] = React.useState("all");
  const phase = (d) => phaseById?.get(d.id) || "배차대기";
  const alertIds = React.useMemo(() => new Set(collisionAlerts.map((a) => a.uid).filter(Boolean)), [collisionAlerts]);

  const kw = String(searchQuery || "").trim().replace(/\s/g, "");
  const searched = React.useMemo(() => drivers.filter((d) => {
    if (!kw) return true;
    return String(d.차량번호 || "").replace(/\s/g, "").includes(kw) || (d.이름 && d.이름 !== "-" && d.이름.includes(kw));
  }), [drivers, kw]);
  const counts = React.useMemo(() => {
    const m = Object.fromEntries(PHASE_GROUPS.map((g) => [g.key, 0]));
    searched.forEach((d) => { m[groupOf(phaseById?.get(d.id) || "배차대기").key] += 1; });
    return m;
  }, [searched, phaseById]);
  const visible = React.useMemo(() => {
    const list = group === "all" ? searched : group === "alert" ? searched.filter((d) => alertIds.has(d.id)) : searched.filter((d) => groupOf(phase(d)).key === group);
    // 이상 → 운행 → 상하차 → 대기 → 휴차, 같은 묶음은 접속 중 먼저
    const rank = { run: 1, load: 2, unload: 2, wait: 3, rest: 4 };
    return [...list].sort((a, b) => (alertIds.has(b.id) - alertIds.has(a.id)) || (rank[groupOf(phase(a)).key] - rank[groupOf(phase(b)).key]) || (!!b.active - !!a.active));
  }, [searched, group, alertIds, phaseById]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = drivers.length;
  const online = drivers.filter((d) => d.active).length;
  const alertsN = locChangeRequests.length + collisionAlerts.length;
  const allCounts = React.useMemo(() => {
    const m = Object.fromEntries(PHASE_GROUPS.map((g) => [g.key, 0]));
    drivers.forEach((d) => { m[groupOf(phaseById?.get(d.id) || "배차대기").key] += 1; });
    return m;
  }, [drivers, phaseById]);
  const kpis = [
    { label: "등록 차량", v: total, sub: "대", color: C.text },
    { label: "앱 접속", v: online, sub: `/ ${total}`, color: "#34D399" },
    { label: "운행 중", v: allCounts.run, sub: "대", color: "#60A5FA" },
    { label: "상 · 하차 중", v: allCounts.load + allCounts.unload, sub: "대", color: "#C084FC" },
    { label: "배차대기", v: allCounts.wait, sub: "대", color: "#FBBF24" },
    { label: "확인할 알림", v: alertsN, sub: "건", color: alertsN ? "#F87171" : C.sub },
  ];
  const chips = [
    { key: "all", label: "전체", n: searched.length },
    ...PHASE_GROUPS.map((g) => ({ key: g.key, label: g.label, n: counts[g.key], color: g.color })),
    ...(alertIds.size ? [{ key: "alert", label: "이상", n: alertIds.size, color: "#EF4444" }] : []),
  ];
  const sel = selected ? drivers.find((d) => d.id === selected.id) || selected : null;
  const selPhase = sel ? phase(sel) : null;
  const feed = logs.slice(0, 40);

  return (
    <div className="lwd-wrap"><style>{DECK_CSS}</style>
    <div className="lwd" data-kp="fleet-control-deck">

      {/* ── 위 ── */}
      <header className="lwd-top">
        <div className="lwd-brand">
          <span className="lwd-live" style={{ width: 10, height: 10, borderRadius: 99, background: "#34D399", boxShadow: "0 0 10px #34D399", flexShrink: 0 }} />
          <div style={{ lineHeight: 1.2, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".18em", color: C.blue, whiteSpace: "nowrap" }}>FLEET CONTROL</div>
            <div style={{ fontSize: 19, fontWeight: 900, whiteSpace: "nowrap" }}>관제현황</div>
          </div>
          <div style={{ marginLeft: "auto" }}><Clock /></div>
        </div>
        <div className="lwd-kpis">
          {kpis.map((k) => (
            <div key={k.label} className="lwd-kpi">
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.sub, whiteSpace: "nowrap" }}>{k.label}</span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}><b style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: k.color }}>{k.v}</b><span style={{ fontSize: 12.5, fontWeight: 700, color: C.dim }}>{k.sub}</span></span>
            </div>
          ))}
        </div>
      </header>

      <div className="lwd-body">
        {/* ── 왼쪽: 차량 목록 ── */}
        <aside className="lwd-col lwd-left" style={{ borderRight: `1px solid ${C.line}` }}>
          <div style={{ padding: "12px 12px 10px", display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ position: "relative", display: "block" }}>
              <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>기사 · 차량 검색</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5D6E8C" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ position: "absolute", left: 11, top: 12.5 }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input className="lwd-input" value={searchQuery} onChange={(e) => onSearch?.(e.target.value)} placeholder="기사명 · 차량번호" />
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="상태 거르기">
              {chips.map((c) => (
                <button key={c.key} type="button" className={"lwd-chip" + (group === c.key ? " on" : "")} onClick={() => setGroup(c.key)}>
                  {c.color && <span style={{ width: 7, height: 7, borderRadius: 99, background: c.color }} />}{c.label} {c.n}
                </button>
              ))}
            </div>
          </div>
          <div className="lwd-scroll" style={{ borderTop: `1px solid ${C.line}` }}>
            {visible.length === 0 && <div style={{ padding: "40px 16px", textAlign: "center", fontSize: 14, fontWeight: 700, color: C.dim }}>조건에 맞는 차량이 없어요</div>}
            {visible.map((d) => {
              const ph = phase(d);
              const col = alertIds.has(d.id) ? "#EF4444" : truckColor(ph);
              const spd = Number(d.speed) || 0;
              return (
                <button key={d.id} type="button" className={"lwd-row" + (sel?.id === d.id ? " on" : "")} onClick={() => onSelect?.(d)} onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, d); }} style={{ opacity: d.active ? 1 : 0.6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 99, background: col, boxShadow: d.active ? `0 0 8px ${col}` : "none", flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ display: "flex", gap: 8, alignItems: "baseline", minWidth: 0 }}>
                      <b style={{ fontSize: 14.5, fontWeight: 900, color: "#F2F6FC", whiteSpace: "nowrap" }}>{d.이름 || "-"}</b>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.차량번호 || ""}</span>
                      {todayPhotoIds?.has(d.id) && <span title="오늘 올린 사진" style={{ fontSize: 11, fontWeight: 800, color: "#7DD3FC" }}>사진</span>}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {d.active ? `${d.vehicleType || d.차종 || "차량"} · ${ago(d.updatedAt)}` : `미접속 · 마지막 ${ago(d.updatedAt)}`}
                    </span>
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 900, color: col, whiteSpace: "nowrap" }}>{alertIds.has(d.id) ? "충격 감지" : ph}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#A9B8D2" }}>{spd > 3 ? `${spd}km/h` : d.location ? "정차" : "위치 없음"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── 가운데: 지도 ── */}
        <main className="lwd-map">
          {renderMap?.(visible, alertIds)}
          <div style={{ position: "absolute", left: 58, top: 12, right: 12, zIndex: 1000, display: "flex", gap: 8, flexWrap: "wrap", pointerEvents: "none" }} className="lwd-tools">
            <span className="lwd-btn" style={{ cursor: "default" }}><span className="lwd-live" style={{ width: 7, height: 7, borderRadius: 99, background: C.accent }} />지도 {visible.filter((d) => d.location).length}대</span>
            <button type="button" className="lwd-btn" onClick={onMapRefresh} title="고른 차량 위치로 지도를 바로 옮겨요">새로고침</button>
            <button type="button" className="lwd-btn" onClick={onFitAll} title="보이는 차량이 모두 들어오게 지도를 맞춰요">전체 보기</button>
          </div>

          {sel && (
            <section aria-label="따라가는 차량" style={{ position: "absolute", left: 14, bottom: 14, zIndex: 1000, width: "min(360px, calc(100% - 28px))", padding: "14px 16px", borderRadius: 14, background: "rgba(10,18,34,.94)", border: "1px solid #2B4F8C", boxShadow: "0 0 0 1px rgba(56,189,248,.15), 0 18px 40px rgba(0,0,0,.45)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".18em", color: C.accent }}>따라가는 중</span>
                <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: C.sub }}>{ago(sel.updatedAt)} 갱신</span>
                <button type="button" aria-label="선택 해제" onClick={() => onSelect?.(sel)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.line2}`, background: "transparent", color: C.sub, cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <b style={{ fontSize: 19, fontWeight: 900 }}>{sel.이름 || "-"}</b>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#A9B8D2" }}>{sel.차량번호 || ""}</span>
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 900, color: truckColor(selPhase) }}>{selPhase}</span>
              </div>
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
                <div><div style={{ fontSize: 11.5, fontWeight: 700, color: C.dim }}>속도</div><div style={{ fontSize: 18, fontWeight: 900 }}>{Number(sel.speed) > 3 ? Number(sel.speed) : 0}<span style={{ fontSize: 12, color: C.sub }}> km/h</span></div></div>
                <div><div style={{ fontSize: 11.5, fontWeight: 700, color: C.dim }}>오늘 이동</div><div style={{ fontSize: 18, fontWeight: 900 }}>{(Number(sel.총거리) || 0).toFixed(1)}<span style={{ fontSize: 12, color: C.sub }}> km</span></div></div>
                <div><div style={{ fontSize: 11.5, fontWeight: 700, color: C.dim }}>근무</div><div style={{ fontSize: 16, fontWeight: 900, whiteSpace: "nowrap", lineHeight: 1.6 }}>{workText(sel)}</div></div>
              </div>
              {trackDate && <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span style={{ fontSize: 12.5, fontWeight: 800, color: C.sub }}>동선 날짜</span>{trackDate}</div>}
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button type="button" className="lwd-btn pri" style={{ flex: 1, justifyContent: "center", height: 38 }} onClick={onOpenDetail}>상세 · 출근지 · 이력</button>
              </div>
            </section>
          )}
        </main>

        {/* ── 오른쪽: 확인할 일 + 활동 기록 ── */}
        <aside className="lwd-col lwd-right" style={{ borderLeft: `1px solid ${C.line}` }}>
          <div style={{ padding: "12px 14px 8px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".2em", color: "#F87171" }}>ALERT</span>
            <span style={{ fontSize: 15, fontWeight: 900, whiteSpace: "nowrap" }}>확인할 일</span>
            {alertsN > 0 && <span style={{ marginLeft: "auto", minWidth: 22, height: 22, padding: "0 7px", borderRadius: 99, background: "#DC2626", fontSize: 12, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{alertsN}</span>}
          </div>
          <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8, maxHeight: "46%", overflow: "auto" }} className="lwd-scroll">
            {alertsN === 0 && <div style={{ padding: "14px 12px", borderRadius: 11, border: `1px dashed ${C.line2}`, fontSize: 13, fontWeight: 700, color: C.dim, textAlign: "center" }}>지금 확인할 일이 없어요</div>}
            {collisionAlerts.map((a) => (
              <div key={a.id} style={{ padding: "11px 12px", borderRadius: 11, background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.35)", display: "flex", gap: 10, alignItems: "center" }}>
                <span className="lwd-live" style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: "#F87171" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 900 }}>충격 감지 · {a.driverName || "-"}</span>
                  <span style={{ display: "block", marginTop: 2, fontSize: 12, fontWeight: 700, color: C.sub }}>{a.carNo || ""} · {a.magnitude ? `${a.magnitude} m/s²` : ""} · {ago(a.timestamp)}</span>
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {a.location?.lat != null && <button type="button" className="lwd-btn" style={{ height: 30, fontSize: 12 }} onClick={() => { const d = drivers.find((x) => x.id === a.uid); if (d) onSelect?.(d); }}>보기</button>}
                  <button type="button" className="lwd-btn" style={{ height: 30, fontSize: 12 }} onClick={() => onCollisionResolve?.(a)}>확인 완료</button>
                </span>
              </div>
            ))}
            {locChangeRequests.map((r) => (
              <div key={r.id} style={{ padding: "11px 12px", borderRadius: 11, background: "rgba(96,165,250,.07)", border: "1px solid rgba(96,165,250,.3)", display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: "#60A5FA" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 900 }}>출발지 변경 요청 · {r.driverName || "-"}</span>
                  <span style={{ display: "block", marginTop: 2, fontSize: 12, fontWeight: 700, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.carNo || ""}{r.currentLocation?.name ? ` · 지금 ${r.currentLocation.name}` : ""} · {ago(r.requestedAt)}</span>
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button type="button" className="lwd-btn" style={{ height: 30, fontSize: 12 }} onClick={() => onLocRequest?.(r)}>출발지 설정</button>
                  <button type="button" className="lwd-btn" style={{ height: 30, fontSize: 12 }} onClick={() => onLocDismiss?.(r)}>닫기</button>
                </span>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: C.line }} />
          <div style={{ padding: "12px 14px 6px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".2em", color: C.blue }}>LIVE FEED</span>
            <span style={{ fontSize: 15, fontWeight: 900, whiteSpace: "nowrap" }} title="기사님이 앱에서 버튼을 누르면 바로 쌓여요">활동 기록</span>
            {logs.length > 0 && <button type="button" onClick={onDeleteFeed} title="활동 기록 모두 지우기" aria-label="활동 기록 모두 지우기" style={{ marginLeft: "auto", width: 28, height: 28, borderRadius: 7, border: "1px solid #5B2730", background: "transparent", color: "#F87171", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" strokeLinecap="round" /></svg></button>}
          </div>
          <ol className="lwd-scroll" style={{ listStyle: "none", margin: 0, padding: "0 14px 10px" }}>
            {feed.length === 0 && <li style={{ padding: "18px 0", fontSize: 13, fontWeight: 700, color: C.dim, textAlign: "center" }}>아직 기록이 없어요</li>}
            {feed.map((l) => {
              const who = driversMap[l.uid];
              const name = who?.이름 || who?.name || l.driverName || "";
              const col = truckColor(l.status === "운행중" || l.status === "운송중" ? "운송중" : String(l.status || "").includes("상차") ? "상차지도착" : String(l.status || "").includes("하차") ? "하차지도착" : String(l.status || "").includes("퇴근") ? "퇴근" : "배차대기");
              return (
                <li key={l.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #13213D" }}>
                  <span style={{ width: 42, flexShrink: 0, fontSize: 12.5, fontWeight: 800, color: C.dim }}>{hhmm(l.timestamp)}</span>
                  <span style={{ width: 8, height: 8, marginTop: 6, borderRadius: 99, background: col, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#C9D5E8", lineHeight: 1.45 }}>{name ? `${name} · ` : ""}{l.status || "-"}</span>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>

      {/* ── 아래: 지금 상태 분포 ── */}
      <footer className="lwd-foot">
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.sub, whiteSpace: "nowrap" }}>지금 상태</span>
        <div style={{ flex: "1 1 200px", height: 12, borderRadius: 99, overflow: "hidden", display: "flex", background: "#13213D" }}>
          {PHASE_GROUPS.map((g) => <span key={g.key} title={`${g.label} ${allCounts[g.key]}`} style={{ width: total ? `${(allCounts[g.key] / total) * 100}%` : 0, background: g.color }} />)}
        </div>
        <div className="lwd-legend" style={{ display: "flex", gap: 14 }}>
          {PHASE_GROUPS.map((g) => <span key={g.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 800, color: "#A9B8D2", whiteSpace: "nowrap" }}><span style={{ width: 8, height: 8, borderRadius: 99, background: g.color }} />{g.label} {allCounts[g.key]}</span>)}
        </div>
      </footer>
    </div>
    </div>
  );
}
