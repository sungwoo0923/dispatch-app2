// ======================= src/FleetControlDeck.jsx =======================
// 🛰 2026-11-25 지입차관리 › 관제현황 리디자인 — 관제실 다크(사용자가 시안 B를 고름)
//  · 위: 관제 이름 · 시계 · 요약 6칸(등록 · 앱 접속 · 운행 · 상하차 · 대기 · 확인할 알림)
//  · 가운데: 왼쪽 차량 목록 | 큰 지도(위에서 본 트럭 · src/fleetTruck.js) | 오른쪽 확인할 일 + 활동 기록
//  · 아래: 지금 상태 분포 띠
//  · 지도 · 동선 날짜 칸은 FleetManagement 가 만들어 넘긴다(renderMap · trackDate). 상세 패널은 지금처럼 아래에 따로
//  · 좁은 화면: 오른쪽 칸은 아래로, 휴대폰 폭이면 한 줄씩
import React from "react";
import { PHASE_GROUPS, truckColor, TRUCK_CSS } from "./fleetTruck";
import { driverClientOf, ClientTag, LocHealthTag, locHealthOf, locFixStateOf } from "./driverClient"; // 📱 2026-11-26 기사앱 · 웹 구분 · 📍 위치 설정 요청

const FONT = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
// 🎨 2026-11-26 A(관제실 다크 · 기본) / B(지도 중심 라이트) — 색은 CSS 변수(.lwd · .lwd.light)로
const C = { bg: "var(--lw-bg)", panel: "var(--lw-panel)", panel2: "var(--lw-panel2)", line: "var(--lw-line)", line2: "var(--lw-line2)", text: "var(--lw-text)", sub: "var(--lw-sub)", dim: "var(--lw-dim)", accent: "var(--lw-cyan)", blue: "var(--lw-blue2)" };

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

// 🛠 2026-11-26 현위치 · 최종위치(주소) — 앱이 접속 중이고 10분 안에 들어온 위치면 현위치, 아니면 최종위치
const isLive = (d) => !!d?.active && (() => { const ms = tsMs(d?.updatedAt); return ms != null && Date.now() - ms < 10 * 60 * 1000; })();
function useAddr(loc, geocode) {
  const [a, setA] = React.useState("");
  const lat = loc?.lat, lng = loc?.lng;
  React.useEffect(() => {
    if (!geocode || !Number.isFinite(lat) || !Number.isFinite(lng)) { setA(""); return undefined; }
    let alive = true;
    geocode(lat, lng, (v) => { if (alive) setA(v || ""); });
    return () => { alive = false; };
  }, [lat, lng, geocode]);
  return a;
}
export function LocLine({ d, geocode, size = 12.5 }) {
  const addr = useAddr(d?.location, geocode);
  if (!d?.location) return <span style={{ fontSize: size, fontWeight: 700, color: C.dim }}>위치 기록 없음</span>;
  const live = isLive(d);
  return (
    <span style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0, fontSize: size, fontWeight: 700 }}>
      <span style={{ flexShrink: 0, fontWeight: 900, color: live ? "var(--lw-ok)" : "var(--lw-warn)" }}>{live ? "현위치" : "최종위치"}</span>
      <span style={{ color: "var(--lw-body)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{addr || "주소 찾는 중…"}</span>
      {!live && <span style={{ flexShrink: 0, color: C.dim }}>{ago(d.updatedAt)}</span>}
    </span>
  );
}

// 📍 2026-11-26 위치 문제 안내 + [위치 설정 요청] — 신호가 끊겼거나 설정 문제가 있을 때 · 요청을 보낸 뒤에는 상태를 보여 준다
function LocFixLine({ d, onLocFix }) {
  const raw = d?.raw || d || {};
  const h = locHealthOf(raw);
  const fix = locFixStateOf(raw);
  const stale = !!d?.location && !isLive(d) && !["퇴근", "최종퇴근", "휴차"].includes(d?.상태);
  if (!onLocFix) return null; // 🛠 2026-11-26 버튼은 항상 보인다(안내 글만 문제 있을 때)
  const tone = fix?.key === "done" ? "var(--lw-ok)" : "#F59E0B";
  return (
    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, lineHeight: 1.45, color: h && !h.ok ? "#EF4444" : tone }}>
        {h && !h.ok ? h.probs.join(" · ") : stale ? "위치가 안 들어오고 있어요" : !fix && h?.ok ? <span style={{ color: "var(--lw-sub)" }}>휴대폰 위치 설정 문제는 없어요</span> : ""}
        {fix && <span style={{ display: "block", color: tone }}>{fix.key === "done" ? `기사님이 설정을 확인했어요 · ${ago(fix.at)}` : `위치 설정 요청 보냄 · ${ago(fix.at)} · 아직 확인 전`}</span>}
      </span>
      <button type="button" className="lwd-btn" style={{ height: 32, flexShrink: 0 }} onClick={() => onLocFix(d)} title="기사님 휴대폰에 알림을 보내고, 앱을 열면 위치 설정 확인 창이 떠요">{fix?.key === "sent" ? "다시 요청" : "위치 설정 요청"}</button>
    </div>
  );
}

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

// 색 묶음(A 다크 · B 라이트) — 이동 기록 다시보기 창도 같이 쓴다
export const LW_VARS = `.lwd,.lwv{--lw-bg:#070D1A;--lw-panel:#0A1222;--lw-panel2:#0E1A30;--lw-line:#1A2742;--lw-line2:#22345A;--lw-line3:#13213D;--lw-line4:#2B4F8C;--lw-line5:#3B5B97;--lw-text:#E6EDF8;--lw-strong:#F2F6FC;--lw-sub:#8796AE;--lw-sub2:#A9B8D2;--lw-dim:#6B7A95;--lw-soft:#CFE0FF;--lw-body:#C9D5E8;--lw-ph:#5D6E8C;
--lw-head1:#0C1528;--lw-head2:#08101F;--lw-mapbg:#08111F;--lw-float:rgba(10,18,34,.94);--lw-btn:rgba(13,26,50,.88);--lw-btn-hover:#13264A;--lw-hover:#0F1C34;--lw-on:#11223F;--lw-chip-on:#1B2E54;--lw-shadow:rgba(0,0,0,.45);
--lw-ok:#34D399;--lw-warn:#FBBF24;--lw-blue:#60A5FA;--lw-purple:#C084FC;--lw-red:#F87171;--lw-sky:#7DD3FC;--lw-cyan:#38BDF8;--lw-blue2:#7FA4E6;--lw-cyan-glow:rgba(56,189,248,.15);
--lw-red-bg:rgba(248,113,113,.08);--lw-red-line:rgba(248,113,113,.35);--lw-blue-bg:rgba(96,165,250,.07);--lw-blue-line:rgba(96,165,250,.3)}
.lwd.light,.lwv.light{--lw-bg:#F3F5F9;--lw-panel:#FFFFFF;--lw-panel2:#F7F9FC;--lw-line:#E3E8F0;--lw-line2:#DCE3EE;--lw-line3:#EEF1F6;--lw-line4:#C9D6EE;--lw-line5:#9FB3D6;--lw-text:#0F1A30;--lw-strong:#0F1A30;--lw-sub:#5B6B85;--lw-sub2:#3A4A66;--lw-dim:#6B7A95;--lw-soft:#1B2B4B;--lw-body:#3A4A66;--lw-ph:#9AA9C3;
--lw-head1:#FFFFFF;--lw-head2:#F7F9FC;--lw-mapbg:#E9EDF3;--lw-float:rgba(255,255,255,.97);--lw-btn:rgba(255,255,255,.96);--lw-btn-hover:#EEF3FB;--lw-hover:#F5F8FD;--lw-on:#EAF1FF;--lw-chip-on:#0F1A30;--lw-shadow:rgba(15,26,48,.18);
--lw-ok:#15803D;--lw-warn:#B45309;--lw-blue:#1D4ED8;--lw-purple:#7E22CE;--lw-red:#B91C1C;--lw-sky:#0369A1;--lw-cyan:#0284C7;--lw-blue2:#2D4C82;--lw-cyan-glow:rgba(2,132,199,.15);
--lw-red-bg:#FDF1EF;--lw-red-line:#F5C9C3;--lw-blue-bg:#EEF4FF;--lw-blue-line:#C9D6EE}
`;
const DECK_CSS = `
${LW_VARS}.lwd-look{display:flex;align-items:center;padding:0 16px;border-left:1px solid var(--lw-line);flex-shrink:0}
.lwd.light .lwd-chip.on,.lwd.light .lwd-btn.pri{color:#fff}
.lwd.light .lwd-row.on{box-shadow:inset 3px 0 0 #1D4ED8}
.lwd.light .lwd-body{grid-template-columns:minmax(0,1fr) 360px;grid-template-rows:minmax(0,1fr) 300px}
.lwd.light .lwd-map{grid-column:1;grid-row:1/3}
.lwd.light .lwd-left{grid-column:2;grid-row:1;border-right:0 !important;border-left:1px solid var(--lw-line)}
.lwd.light .lwd-right{grid-column:2;grid-row:2;border-top:1px solid var(--lw-line)}
@container (max-width:1000px){.lwd.light .lwd-body{grid-template-columns:1fr;grid-template-rows:auto}.lwd.light .lwd-map,.lwd.light .lwd-left,.lwd.light .lwd-right{grid-column:1;grid-row:auto}.lwd.light .lwd-map{height:62vh;min-height:380px}}
.lwd-wrap{container-type:inline-size}
.lwd-tools>*{pointer-events:auto}
.lwd{font-family:${FONT};background:${C.bg};color:${C.text};border-radius:18px;overflow:hidden;border:1px solid ${C.line};display:flex;flex-direction:column;height:max(660px,calc(100vh - 170px));font-variant-numeric:tabular-nums}
.lwd *{box-sizing:border-box}
.lwd-top{display:flex;align-items:stretch;border-bottom:1px solid ${C.line};background:linear-gradient(180deg,var(--lw-head1),var(--lw-head2));flex-shrink:0}
.lwd-brand{width:340px;flex-shrink:0;display:flex;align-items:center;gap:12px;padding:12px 18px;border-right:1px solid ${C.line}}
.lwd-kpis{flex:1;display:grid;grid-template-columns:repeat(6,minmax(0,1fr))}
.lwd-kpi{display:flex;flex-direction:column;justify-content:center;gap:2px;padding:10px 16px;border-right:1px solid ${C.line};min-width:0}
.lwd-kpi:last-child{border-right:0}
.lwd-body{flex:1;min-height:0;display:grid;grid-template-columns:340px minmax(0,1fr) 330px}
.lwd-col{min-height:0;display:flex;flex-direction:column;background:${C.panel}}
.lwd-map{position:relative;min-width:0;min-height:0;background:var(--lw-mapbg)}
.lwd-scroll{flex:1;min-height:0;overflow:auto}
.lwd-scroll::-webkit-scrollbar{width:8px}.lwd-scroll::-webkit-scrollbar-thumb{background:var(--lw-line2);border-radius:8px}
.lwd-row{width:100%;display:flex;align-items:center;gap:10px;padding:10px 14px;border:0;border-bottom:1px solid var(--lw-line3);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.lwd-row:hover{background:var(--lw-hover)}
.lwd-row.on{background:var(--lw-on);box-shadow:inset 3px 0 0 ${C.accent}}
.lwd-chip{height:30px;padding:0 10px;border-radius:8px;border:1px solid ${C.line2};background:transparent;color:var(--lw-sub2);font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.lwd-chip.on{border-color:var(--lw-line5);background:var(--lw-chip-on);color:#fff}
.lwd-btn{height:34px;padding:0 12px;border-radius:9px;border:1px solid ${C.line2};background:var(--lw-btn);color:var(--lw-soft);font:inherit;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
.lwd-btn:hover{border-color:var(--lw-line5);background:var(--lw-btn-hover)}
.lwd-btn.pri{background:#2563EB;border-color:#2563EB;color:#fff}
.lwd-input{width:100%;height:40px;padding:0 12px 0 34px;border:1px solid ${C.line2};border-radius:10px;background:${C.panel2};color:${C.text};font:inherit;font-size:14px;outline:none}
.lwd-input:focus{border-color:#3B82F6}
.lwd-input::placeholder{color:var(--lw-ph)}
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
  renderMap, trackDate = null, onMapRefresh, onFitAll, onOpenDetail, geocode = null, light = false, lookSwitch = null, onOpenHistory = null, onLocFix = null,
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
    { label: "앱 접속", v: online, sub: `/ ${total}`, color: "var(--lw-ok)" },
    { label: "운행 중", v: allCounts.run, sub: "대", color: "var(--lw-blue)" },
    { label: "상 · 하차 중", v: allCounts.load + allCounts.unload, sub: "대", color: "var(--lw-purple)" },
    { label: "배차대기", v: allCounts.wait, sub: "대", color: "var(--lw-warn)" },
    { label: "확인할 알림", v: alertsN, sub: "건", color: alertsN ? "var(--lw-red)" : C.sub },
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
    <div className={`lwd${light ? " light" : ""}`} data-kp="fleet-control-deck">

      {/* ── 위 ── */}
      <header className="lwd-top">
        <div className="lwd-brand">
          <span className="lwd-live" style={{ width: 10, height: 10, borderRadius: 99, background: "var(--lw-ok)", boxShadow: "0 0 10px var(--lw-ok)", flexShrink: 0 }} />
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
        {lookSwitch && <div className="lwd-look">{lookSwitch}</div>}
      </header>

      <div className="lwd-body">
        {/* ── 왼쪽: 차량 목록 ── */}
        <aside className="lwd-col lwd-left" style={{ borderRight: `1px solid ${C.line}` }}>
          <div style={{ padding: "12px 12px 10px", display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ position: "relative", display: "block" }}>
              <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>기사 · 차량 검색</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--lw-ph)" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ position: "absolute", left: 11, top: 12.5 }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
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
                      <b style={{ fontSize: 16, fontWeight: 900, color: "var(--lw-strong)", whiteSpace: "nowrap" }}>{d.이름 || "-"}</b>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "var(--lw-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: ".01em" }}>{d.차량번호 || ""}</span>
                      {todayPhotoIds?.has(d.id) && <span title="오늘 올린 사진" style={{ fontSize: 12, fontWeight: 800, color: "var(--lw-sky)" }}>사진</span>}
                      <ClientTag d={d} />
                      <LocHealthTag d={d} />
                    </span>
                    <LocLine d={d} geocode={geocode} />
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: col, whiteSpace: "nowrap" }}>{alertIds.has(d.id) ? "충격 감지" : ph}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "var(--lw-sub2)" }}>{!d.location ? "위치 없음" : !isLive(d) ? "신호 없음" : spd > 3 ? `${spd}km/h` : "정차"}</span>
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
            <section aria-label="따라가는 차량" style={{ position: "absolute", left: 14, bottom: 14, zIndex: 1000, width: "min(400px, calc(100% - 28px))", padding: "14px 16px", borderRadius: 14, background: "var(--lw-float)", border: "1px solid var(--lw-line4)", boxShadow: "0 0 0 1px var(--lw-cyan-glow), 0 18px 40px var(--lw-shadow)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".18em", color: C.accent }}>따라가는 중</span>
                <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: C.sub }}>{ago(sel.updatedAt)} 갱신</span>
                <button type="button" aria-label="선택 해제" onClick={() => onSelect?.(sel)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.line2}`, background: "transparent", color: C.sub, cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <b style={{ fontSize: 20, fontWeight: 900 }}>{sel.이름 || "-"}</b>
                <span style={{ fontSize: 16, fontWeight: 800, color: "var(--lw-soft)" }}>{sel.차량번호 || ""}</span>
                <span style={{ alignSelf: "center", display: "inline-flex", gap: 4 }}><ClientTag d={sel} size={12.5} /><LocHealthTag d={sel} size={12.5} /></span>
                <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 900, color: truckColor(selPhase) }}>{selPhase}</span>
              </div>
              <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "var(--lw-panel2)", border: `1px solid ${C.line2}` }}><LocLine d={sel} geocode={geocode} size={13.5} /></div>
              {driverClientOf(sel.raw || sel).key === "web" && <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 800, color: "#F59E0B", lineHeight: 1.45 }}>웹(인터넷)으로 쓰고 있어요. 화면을 끄면 위치가 끊겨요 → 기사앱 설치를 안내해 주세요</div>}
              <LocFixLine d={sel} onLocFix={onLocFix} />
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
                <div><div style={{ fontSize: 11.5, fontWeight: 700, color: C.dim }}>속도</div><div style={{ fontSize: 18, fontWeight: 900 }}>{isLive(sel) && Number(sel.speed) > 3 ? Number(sel.speed) : 0}<span style={{ fontSize: 12, color: C.sub }}> km/h</span></div></div>
                <div><div style={{ fontSize: 11.5, fontWeight: 700, color: C.dim }}>오늘 이동</div><div style={{ fontSize: 18, fontWeight: 900 }}>{(Number(sel.총거리) || 0).toFixed(1)}<span style={{ fontSize: 12, color: C.sub }}> km</span></div></div>
                <div><div style={{ fontSize: 11.5, fontWeight: 700, color: C.dim }}>근무</div><div style={{ fontSize: 16, fontWeight: 900, whiteSpace: "nowrap", lineHeight: 1.6 }}>{workText(sel)}</div></div>
              </div>
              {trackDate && <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span style={{ fontSize: 12.5, fontWeight: 800, color: C.sub }}>동선 날짜</span>{trackDate}</div>}
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                {onOpenHistory && <button type="button" className="lwd-btn" style={{ flex: 1, justifyContent: "center", height: 38 }} onClick={() => onOpenHistory(sel)} title="출근부터 퇴근까지, 오더별로 다닌 길을 지도에서 다시 봐요">이동 기록 보기</button>}
                <button type="button" className="lwd-btn pri" style={{ flex: 1, justifyContent: "center", height: 38 }} onClick={onOpenDetail}>상세 · 출근지 · 이력</button>
              </div>
            </section>
          )}
        </main>

        {/* ── 오른쪽: 확인할 일 + 활동 기록 ── */}
        <aside className="lwd-col lwd-right" style={{ borderLeft: `1px solid ${C.line}` }}>
          <div style={{ padding: "12px 14px 8px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".2em", color: "var(--lw-red)" }}>ALERT</span>
            <span style={{ fontSize: 15, fontWeight: 900, whiteSpace: "nowrap" }}>확인할 일</span>
            {alertsN > 0 && <span style={{ marginLeft: "auto", minWidth: 22, height: 22, padding: "0 7px", borderRadius: 99, background: "#DC2626", fontSize: 12, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{alertsN}</span>}
          </div>
          <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8, maxHeight: "46%", overflow: "auto" }} className="lwd-scroll">
            {alertsN === 0 && <div style={{ padding: "14px 12px", borderRadius: 11, border: `1px dashed ${C.line2}`, fontSize: 13, fontWeight: 700, color: C.dim, textAlign: "center" }}>지금 확인할 일이 없어요</div>}
            {collisionAlerts.map((a) => (
              <div key={a.id} style={{ padding: "11px 12px", borderRadius: 11, background: "var(--lw-red-bg)", border: "1px solid var(--lw-red-line)", display: "flex", gap: 10, alignItems: "center" }}>
                <span className="lwd-live" style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: "var(--lw-red)" }} />
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
              <div key={r.id} style={{ padding: "11px 12px", borderRadius: 11, background: "var(--lw-blue-bg)", border: "1px solid var(--lw-blue-line)", display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: "var(--lw-blue)" }} />
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
            {logs.length > 0 && <button type="button" onClick={onDeleteFeed} title="활동 기록 모두 지우기" aria-label="활동 기록 모두 지우기" style={{ marginLeft: "auto", width: 28, height: 28, borderRadius: 7, border: "1px solid var(--lw-red-line)", background: "transparent", color: "var(--lw-red)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" strokeLinecap="round" /></svg></button>}
          </div>
          <ol className="lwd-scroll" style={{ listStyle: "none", margin: 0, padding: "0 14px 10px" }}>
            {feed.length === 0 && <li style={{ padding: "18px 0", fontSize: 13, fontWeight: 700, color: C.dim, textAlign: "center" }}>아직 기록이 없어요</li>}
            {feed.map((l) => {
              const who = driversMap[l.uid];
              const name = who?.이름 || who?.name || l.driverName || "";
              const col = truckColor(l.status === "운행중" || l.status === "운송중" ? "운송중" : String(l.status || "").includes("상차") ? "상차지도착" : String(l.status || "").includes("하차") ? "하차지도착" : String(l.status || "").includes("퇴근") ? "퇴근" : "배차대기");
              return (
                <li key={l.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--lw-line3)" }}>
                  <span style={{ width: 42, flexShrink: 0, fontSize: 12.5, fontWeight: 800, color: C.dim }}>{hhmm(l.timestamp)}</span>
                  <span style={{ width: 8, height: 8, marginTop: 6, borderRadius: 99, background: col, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--lw-body)", lineHeight: 1.45 }}>{name ? `${name} · ` : ""}{l.status || "-"}</span>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>

      {/* ── 아래: 지금 상태 분포 ── */}
      <footer className="lwd-foot">
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.sub, whiteSpace: "nowrap" }}>지금 상태</span>
        <div style={{ flex: "1 1 200px", height: 12, borderRadius: 99, overflow: "hidden", display: "flex", background: "var(--lw-line3)" }}>
          {PHASE_GROUPS.map((g) => <span key={g.key} title={`${g.label} ${allCounts[g.key]}`} style={{ width: total ? `${(allCounts[g.key] / total) * 100}%` : 0, background: g.color }} />)}
        </div>
        <div className="lwd-legend" style={{ display: "flex", gap: 14 }}>
          {PHASE_GROUPS.map((g) => <span key={g.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 800, color: "var(--lw-sub2)", whiteSpace: "nowrap" }}><span style={{ width: 8, height: 8, borderRadius: 99, background: g.color }} />{g.label} {allCounts[g.key]}</span>)}
        </div>
      </footer>
    </div>
    </div>
  );
}
