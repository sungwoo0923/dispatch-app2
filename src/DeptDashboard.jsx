// ======================= src/DeptDashboard.jsx =======================
// 🏢 부서 대시보드(2026-10-31) — 경리·회계 / 인사관리 권한으로 들어오면 홈 › 대시보드가 부서 업무 화면으로 바뀐다.
// ⭐ 2026-11-01 리디자인 — 홈 관제 데크(HomeDeck)와 같은 남색 디지털 데크로. 글자 크게 · 바로가기 메뉴 타일 삭제 ·
//   "오늘 처리할 일"은 0건 항목을 숨기고(모두 0이면 "처리할 일이 없습니다") · 머리줄 시계 옆에 출근·퇴근 카드. PC·모바일 공용.
//   경리: 보유 자금 · 이번 달 매출/매입(기사운임)/수익 · 6개월 추이 · 미수금 · 용차 지급(예정·완료) · 통장 잔액 · 지출결의 결재 · 세무 일정
//   인사: 재직·휴직·퇴사 예정 · 오늘 출근 현황 · 이번 달 연차 사용 · 이번 주 부재 · 생일·입사 기념·수습 종료 · 부서·근속 분포
import React from "react";
import { collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Cell } from "recharts";
import { db, DEFAULT_COMPANY } from "./firebase";
import { useFleetDrivers } from "./FleetPayDocs";
import { useCompanyDriverDocs, docProblems } from "./driverRequiredDocs";
import { isTMUser } from "./staffFilter";
import { ExecDashboard, eventsOf } from "./ExecSuite";
import { leaveEntitlement, leaveUseOf } from "./approvalForms";
import { pcLiveWindowStart, pcPrevDay } from "./orderHistory";
import { useFundsSummary } from "./FundsBoard";
import { HD_MONO as MONO, HD_C as C, HD_CSS } from "./HomeDeck";
import { AttendanceQuickButton } from "./attendanceQuick";

const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const kst = (off = 0) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(d.getUTCDate() + off); return d.toISOString().slice(0, 10); };
const ymAgo = (n) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 7); };
const short = (n) => { const a = Math.abs(n); if (a >= 1e8) return `${(n / 1e8).toFixed(1)}억`; if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`; return Math.round(n).toLocaleString(); };
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0);
const won = (n) => Math.round(n || 0).toLocaleString();
const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);
// 데크 색 — 네이비/하늘빛 계열만(알록달록 금지). 주의 표시만 따뜻한 색을 아주 조금
const WARN = "#F7B955";

function useCol(name, company, filterFn) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(collection(db, name), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => (!filterFn ? true : filterFn(r)))), () => setRows([]));
  }, [name, company]); // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}
// cats — 경리는 보안 규칙상 지출결의·근태·보고만 읽을 수 있어 조회에도 분류 조건을 붙인다(없으면 조회 전체가 거부됨)
function useCompanyApprovals(company, cats = null) {
  const [rows, setRows] = React.useState([]);
  const ck = cats ? cats.join(",") : "";
  React.useEffect(() => {
    if (!company) return undefined;
    const qs = [where("company", "==", company), ...(cats ? [where("cat", "in", cats)] : [])];
    return onSnapshot(query(collection(db, "approvals"), ...qs), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
  }, [company, ck]); // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}

// ─── 데크 부품(홈 관제 데크와 같은 언어 · 글자는 한 단계 크게) ───────────────────────
const DD_CSS = `
  .dd-deck { container-type: inline-size; position: relative; overflow: hidden; border-radius: 26px; padding: 26px 28px 28px; color: ${C.ink}; }
  .dd-head { position: relative; display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 20px; }
  .dd-head-r { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; justify-content: flex-end; }
  .dd-kpi { position: relative; display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; margin-bottom: 14px; }
  .dd-row { position: relative; display: grid; grid-template-columns: minmax(0,1fr); gap: 14px; margin-bottom: 14px; }
  .dd-row:last-child { margin-bottom: 0; }
  .dd-row-btn { width: 100%; text-align: left; background: transparent; border: none; padding: 0; cursor: pointer; color: inherit; }
  .dd-row-btn:hover .dd-todo { border-color: rgba(143,176,240,.38); background: rgba(143,176,240,.08); }
  .dd-todo { transition: background .15s, border-color .15s; }
  .dd-link { height: 32px; padding: 0 12px; border-radius: 9px; border: 1px solid rgba(143,176,240,.22); background: rgba(255,255,255,.04); color: ${C.hi}; font-size: 13px; font-weight: 800; cursor: pointer; white-space: nowrap; }
  .dd-link:hover { border-color: rgba(143,176,240,.5); box-shadow: 0 0 12px rgba(110,149,232,.25); }
  .dd-link:disabled { opacity: .5; cursor: default; }
  @container (min-width: 720px) {
    .dd-kpi { grid-template-columns: repeat(3, minmax(0,1fr)); }
    .dd-row.r2 { grid-template-columns: repeat(2, minmax(0,1fr)); }
    .dd-row.r3 { grid-template-columns: repeat(2, minmax(0,1fr)); }
  }
  @container (min-width: 1360px) { .dd-kpi { grid-template-columns: repeat(6, minmax(0,1fr)); } }
  @container (min-width: 1040px) {
    .dd-row.r3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
    .dd-row.wide { grid-template-columns: minmax(0,1.75fr) minmax(0,1fr); }
  }
  @media (max-width: 640px) {
    .dd-deck { padding: 16px 14px 18px; border-radius: 20px; }
    .dd-head h1 { font-size: 22px !important; }
  }
`;

function Deck({ children }) {
  return (
    <section className="hd-deck dd-deck">
      <style>{HD_CSS}</style>
      <style>{DD_CSS}</style>
      <div className="hd-scan" />
      {children}
    </section>
  );
}

// 시계(KST) — 홈 데크 시계와 같은 모양
function Clock() {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const k = new Date(now + 9 * 3600e3); const p = (n) => String(n).padStart(2, "0");
  return (
    <div style={{ fontFamily: MONO, fontSize: 36, fontWeight: 800, color: "#fff", letterSpacing: "0.04em", lineHeight: 1 }}>
      {p(k.getUTCHours())}<span className="hd-colon">:</span>{p(k.getUTCMinutes())}
      <span style={{ fontSize: 18, color: C.dim, marginLeft: 4 }}>{p(k.getUTCSeconds())}</span>
    </div>
  );
}

// 머리줄 — 영문 표식 · 인사말 · 요약 / 오른쪽: 출근·퇴근 카드 + 시계
function DeckHead({ code, title, sub, att }) {
  const d = new Date(Date.now() + 9 * 3600e3);
  const dateText = `${d.toISOString().slice(0, 10).replace(/-/g, ".")} ${["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d.getUTCDay()]}`;
  return (
    <div className="dd-head">
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, letterSpacing: "0.28em", color: C.glow }}>{code}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 9px", borderRadius: 99, border: "1px solid rgba(143,176,240,.35)", fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", color: C.hi }}>
            <span className="hd-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: C.hi, boxShadow: `0 0 8px ${C.glow}` }} />LIVE
          </span>
        </div>
        <h1 style={{ margin: "10px 0 0", fontSize: 30, fontWeight: 900, letterSpacing: "-0.02em", color: "#fff", lineHeight: 1.25 }}>{title}</h1>
        <p style={{ margin: "8px 0 0", fontSize: 16, fontWeight: 600, color: C.sub, lineHeight: 1.5 }}>{sub}</p>
      </div>
      <div className="dd-head-r">
        {/* ⭐ 2026-11-01 출근·퇴근 — 홈 데크처럼 시계 옆에서 바로 */}
        {att && <AttendanceQuickButton {...att} variant="deck" />}
        <div style={{ textAlign: "right" }}>
          <Clock />
          <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 12.5, fontWeight: 700, letterSpacing: "0.16em", color: C.dim }}>{dateText} · KST</div>
        </div>
      </div>
    </div>
  );
}

// 작은 면적 차트(스파크라인) — SVG 하나로 가볍게
function Spark({ data = [], h = 38 }) {
  const id = React.useId().replace(/:/g, "");
  if (data.length < 2 || !data.some((v) => v)) return <div style={{ height: h }} />;
  const max = Math.max(...data), min = Math.min(0, ...data), W = 100;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * W, h - 3 - ((v - min) / Math.max(1, max - min)) * (h - 8)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" width="100%" height={h} style={{ display: "block" }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.glow} stopOpacity=".42" /><stop offset="1" stopColor={C.glow} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${W} ${h} L0 ${h}Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={C.glow} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// KPI 타일 — 값 크게(28~34px), 아래에 스파크라인 또는 진행 막대
function KTile({ code, label, value, unit, foot, spark, bar, primary, warn }) {
  return (
    <div className={primary ? "hd-tile hd-tile-on" : "hd-tile"} style={{ borderRadius: 16, padding: "16px 18px 12px", position: "relative", overflow: "hidden", minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.18em", color: warn ? WARN : C.dim, whiteSpace: "nowrap" }}>{code}</span>
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: "clamp(24px, 2.2cqi, 34px)", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: primary ? `0 0 18px rgba(143,176,240,.45)` : "none" }}>{value}</span>
        {unit && <span style={{ fontSize: 14, fontWeight: 700, color: C.dim }}>{unit}</span>}
      </div>
      <div style={{ marginTop: 5, minHeight: 20, fontSize: 13.5, fontWeight: 600, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{foot}</div>
      <div style={{ marginTop: "auto", paddingTop: 6 }}>
        {bar != null ? (
          <div style={{ height: 6, borderRadius: 9, background: "rgba(143,176,240,.12)", overflow: "hidden", margin: "16px 0 8px" }}>
            <div style={{ width: `${Math.max(0, Math.min(100, bar))}%`, height: "100%", borderRadius: 9, background: `linear-gradient(90deg,#2D4C82,${C.hi})`, boxShadow: `0 0 10px ${C.glow}` }} />
          </div>
        ) : <div style={{ margin: "0 -18px -12px" }}><Spark data={spark} /></div>}
      </div>
    </div>
  );
}

function DPanel({ code, title, right, children, style }) {
  return (
    <div className="hd-panel" style={{ borderRadius: 18, padding: "18px 20px", display: "flex", flexDirection: "column", minWidth: 0, ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: C.glow, transform: "rotate(45deg)", boxShadow: `0 0 8px ${C.glow}`, flexShrink: 0 }} />
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: "0.22em", color: C.dim, whiteSpace: "nowrap" }}>{code}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 18.5, fontWeight: 800, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

const Muted = ({ t, h = 120 }) => <div style={{ minHeight: h, display: "grid", placeItems: "center", textAlign: "center", fontSize: 15, fontWeight: 700, color: C.dim }}>{t}</div>;
const SubHead = ({ children }) => <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, letterSpacing: "0.18em", color: C.glow, margin: "14px 0 6px" }}>{children}</div>;

// 한 줄(이름 · 보조 · 값)
function Line2({ l, sub, v, tone, lead }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.line}` }}>
      {lead}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l}</div>
        {sub && <div style={{ fontSize: 13, fontWeight: 600, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ flexShrink: 0, fontFamily: MONO, fontSize: 15.5, fontWeight: 800, color: tone === "warn" ? WARN : tone === "hi" ? C.hi : "#fff", whiteSpace: "nowrap" }}>{v}</div>
    </div>
  );
}

// 오늘 처리할 일 — ⭐ 2026-11-01 0건 항목은 아예 안 보인다. 모두 0이면 차분한 "처리할 일이 없습니다"
//  items: [라벨, 보조설명, 표시값, 건수, 이동키]
function TodoPanel({ code, items, onGo }) {
  const live = items.filter((x) => x[3] > 0);
  return (
    <DPanel code={code} title="오늘 처리할 일" right={live.length ? <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: WARN }}>{live.length}건</span> : null}>
      {!live.length ? (
        <div style={{ flex: 1, minHeight: 200, display: "grid", placeItems: "center", textAlign: "center" }}>
          <div>
            <div style={{ width: 58, height: 58, margin: "0 auto", borderRadius: "50%", display: "grid", placeItems: "center", border: "1px solid rgba(143,176,240,.35)", background: "rgba(143,176,240,.08)", boxShadow: "0 0 26px rgba(110,149,232,.22)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.hi} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </div>
            <div style={{ marginTop: 14, fontSize: 18, fontWeight: 800, color: "#fff" }}>처리할 일이 없습니다</div>
            <div style={{ marginTop: 5, fontSize: 14, fontWeight: 600, color: C.dim }}>모든 업무가 정리되어 있습니다</div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {live.map(([l, sub, v, , go]) => (
            <button key={l} type="button" className="dd-row-btn" onClick={() => go && onGo?.(go)}>
              <div className="dd-todo" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 13, border: `1px solid ${C.line}`, background: "rgba(255,255,255,.03)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: WARN, boxShadow: `0 0 8px ${WARN}`, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>{sub}</div>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: "#fff", whiteSpace: "nowrap" }}>{v}</span>
                <span style={{ color: C.dim, fontSize: 16 }}>›</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </DPanel>
  );
}

// 도넛 — parts: [{ v, c, l }]
function Donut({ parts, size = 150, center, sub }) {
  const total = parts.reduce((s, p) => s + p.v, 0);
  const r = size / 2 - 11, cx = size / 2, L = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, display: "block" }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(143,176,240,.12)" strokeWidth="13" />
      {total > 0 && parts.filter((p) => p.v > 0).map((p) => {
        const len = (p.v / total) * L; const el = <circle key={p.l} cx={cx} cy={cx} r={r} fill="none" stroke={p.c} strokeWidth="13" strokeDasharray={`${Math.max(0, len - 2)} ${L}`} strokeDashoffset={-acc} transform={`rotate(-90 ${cx} ${cx})`} style={{ filter: p.glow ? `drop-shadow(0 0 5px ${p.c})` : "none" }} />;
        acc += len; return el;
      })}
      <text x={cx} y={cx - 3} textAnchor="middle" fill="#fff" fontFamily={MONO} fontSize={size > 130 ? 26 : 20} fontWeight="800">{center}</text>
      <text x={cx} y={cx + 18} textAnchor="middle" fill={C.dim} fontSize="12" fontWeight="700">{sub}</text>
    </svg>
  );
}
const Legend = ({ c, l, v }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 0" }}>
    <span style={{ width: 10, height: 10, borderRadius: 3, background: c, flexShrink: 0 }} />
    <span style={{ fontSize: 14.5, fontWeight: 700, color: C.sub, flex: 1, whiteSpace: "nowrap" }}>{l}</span>
    <span style={{ fontFamily: MONO, fontSize: 15.5, fontWeight: 800, color: "#fff", whiteSpace: "nowrap" }}>{v}</span>
  </div>
);

// 가로 막대 한 줄
function HBar({ l, v, max, right, sub }) {
  return (
    <div style={{ padding: "7px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{l}{sub && <span style={{ fontSize: 12.5, fontWeight: 600, color: C.dim, marginLeft: 6 }}>{sub}</span>}</span>
        <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: "#fff", whiteSpace: "nowrap" }}>{right}</span>
      </div>
      <div style={{ marginTop: 6, height: 7, borderRadius: 9, background: "rgba(143,176,240,.1)", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(2, (v / Math.max(1, max)) * 100)}%`, height: "100%", borderRadius: 9, background: "linear-gradient(90deg,#2D4C82,#8FB0F0)", boxShadow: "0 0 8px rgba(143,176,240,.45)" }} />
      </div>
    </div>
  );
}

function DarkTip({ active, payload, label, unit = "원" }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(11,20,40,.96)", border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 13px", boxShadow: "0 10px 26px rgba(0,0,0,.35)" }}>
      <div style={{ fontFamily: MONO, fontSize: 12.5, color: C.dim, marginBottom: 5 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 18, fontSize: 14, fontWeight: 700, color: C.ink }}>
          <span style={{ color: C.sub }}>{p.name}</span><span style={{ fontFamily: MONO }}>{won(p.value)}{unit}</span>
        </div>
      ))}
    </div>
  );
}
const dDay = (d, today) => { const n = Math.round((new Date(`${d}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 864e5); return n === 0 ? "D-DAY" : n > 0 ? `D-${n}` : `D+${-n}`; };
const DBadge = ({ d, today, big }) => {
  const on = d === today;
  return <span style={{ width: 64, height: 34, flexShrink: 0, borderRadius: 9, display: "grid", placeItems: "center", fontFamily: MONO, fontSize: 13, fontWeight: 800, color: on ? "#0B1428" : big ? "#fff" : C.hi, background: on ? WARN : big ? "linear-gradient(135deg,#2D4C82,#4B6CB7)" : "rgba(143,176,240,.08)", border: `1px solid ${on ? WARN : "rgba(143,176,240,.22)"}`, boxShadow: big ? "0 0 12px rgba(110,149,232,.3)" : "none" }}>{dDay(d, today)}</span>;
};

// ─────────────────────────── 경리·회계 ───────────────────────────
// 실시간 오더는 최근 며칠뿐이라, 지난 6개월 배차완료 오더는 하루 1번 불러와 요약만 PC에 저장한다(읽기 절약).
//  months: { "YYYY-MM": [매출, 매입, 건수] } / recent(최근 3개월): [상차일, 거래처, 청구운임, 기사운임, 차량번호, 지급상태]
const ACCT_V = 2;
const dateOf = (r) => String(r?.상차일 || "").slice(0, 10);
function useAcctHistory(company, dispatchData) {
  const ls = pcLiveWindowStart();
  const key = `kpAcctHist:${company}`;
  const read = () => { try { const c = JSON.parse(localStorage.getItem(key) || "null"); return c && c.v === ACCT_V && c.day === kst(0) && c.ls === ls ? c : null; } catch { return null; } };
  const [hist, setHist] = React.useState(read);
  const [loading, setLoading] = React.useState(false);
  const load = React.useCallback(async () => {
    if (!company) return;
    setLoading(true);
    try {
      const snaps = await Promise.all(["orders", "dispatch"].map((col) => getDocs(query(collection(db, col), where("상차일", ">=", `${ymAgo(5)}-01`), where("상차일", "<=", pcPrevDay(ls))))));
      const months = {}; const recent = []; const cut = `${ymAgo(2)}-01`;
      snaps.flatMap((sn) => sn.docs.map((d) => d.data() || {}))
        .filter((r) => (r.companyName || DEFAULT_COMPANY) === company && r.source !== "transport_transmit" && (r.배차상태 || "") === "배차완료")
        .forEach((r) => {
          const d = dateOf(r); const e = months[d.slice(0, 7)] || (months[d.slice(0, 7)] = [0, 0, 0]);
          e[0] += toInt(r.청구운임); e[1] += toInt(r.기사운임); e[2] += 1;
          if (d >= cut) recent.push([d, String(r.거래처명 || "").trim(), toInt(r.청구운임), toInt(r.기사운임), String(r.차량번호 || "").trim(), r.지급상태 || ""]);
        });
      const c = { v: ACCT_V, day: kst(0), ls, months, recent, at: Date.now() };
      try { localStorage.setItem(key, JSON.stringify(c)); } catch { /* 용량 초과는 무시 */ }
      setHist(c);
    } catch { setHist((h) => h || { months: {}, recent: [], at: 0 }); } finally { setLoading(false); }
  }, [company, ls, key]);
  React.useEffect(() => { if (company && !hist) load(); }, [company]); // eslint-disable-line react-hooks/exhaustive-deps
  return React.useMemo(() => {
    const months = {}; Object.entries(hist?.months || {}).forEach(([m, v]) => { months[m] = [...v]; });
    const recent = [...(hist?.recent || [])];
    (dispatchData || []).filter((r) => dateOf(r) >= ls && (r.배차상태 || "") === "배차완료" && r.source !== "transport_transmit").forEach((r) => {
      const d = dateOf(r); const e = months[d.slice(0, 7)] || (months[d.slice(0, 7)] = [0, 0, 0]);
      e[0] += toInt(r.청구운임); e[1] += toInt(r.기사운임); e[2] += 1;
      recent.push([d, String(r.거래처명 || "").trim(), toInt(r.청구운임), toInt(r.기사운임), String(r.차량번호 || "").trim(), r.지급상태 || ""]);
    });
    return { months, recent, ready: !!hist, at: hist?.at || 0, loading, reload: load };
  }, [hist, dispatchData, ls, loading, load]);
}
function useCompanyRows(name, company) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, name), where("companyName", "==", company)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
  }, [name, company]);
  return rows || [];
}
// 세무·납부 일정(일반 기준 — 휴일이면 다음 영업일)
function taxEvents(today) {
  const y = Number(today.slice(0, 4)); const m = Number(today.slice(5, 7)); const p = (n) => String(n).padStart(2, "0");
  const ev = [];
  for (let i = 0; i < 4; i += 1) {
    const mm = ((m - 1 + i) % 12) + 1; const yy = y + Math.floor((m - 1 + i) / 12); const ym = `${yy}-${p(mm)}`;
    ev.push({ d: `${ym}-10`, t: "원천세 신고·납부", s: "전월 급여·사업소득 원천징수분" });
    ev.push({ d: `${ym}-10`, t: "4대보험료 납부", s: "국민연금·건강·고용·산재" });
    ev.push({ d: `${ym}-10`, t: "월합계 세금계산서 발행 마감", s: "전월 거래분 — 거래처 정산" });
    if (mm === 1 || mm === 7) ev.push({ d: `${ym}-25`, t: "부가가치세 확정신고·납부", s: mm === 1 ? "전년 2기(7~12월)" : "1기(1~6월)", big: true });
    if (mm === 4 || mm === 10) ev.push({ d: `${ym}-25`, t: "부가가치세 예정신고·납부", s: "법인 예정신고 / 개인 예정고지", big: true });
    if (mm === 3) { ev.push({ d: `${ym}-10`, t: "연말정산 지급명세서 제출", s: "2월분 원천세 신고와 함께" }); ev.push({ d: `${ym}-31`, t: "법인세 신고·납부", s: "12월 결산 법인", big: true }); }
    if (mm === 5) ev.push({ d: `${ym}-31`, t: "종합소득세 신고·납부", s: "개인사업자", big: true });
    if (mm === 8) ev.push({ d: `${ym}-31`, t: "법인세 중간예납", s: "12월 결산 법인" });
    if (mm === 12) ev.push({ d: `${ym}-31`, t: "연말 결산 준비", s: "재고·자산·미수/미지급 정리" });
  }
  return ev.filter((e) => e.d >= today).sort((a, b) => a.d.localeCompare(b.d));
}

function AcctDashboard({ company, dispatchData = [], onGo, me, att }) {
  const today = kst(0); const ym = ymAgo(0);
  const clients = useCol("clients", company);
  const approvals = useCompanyApprovals(company, ["expense"]);
  const fleet = useFleetDrivers();
  const docsBy = useCompanyDriverDocs(company);
  const ledger = useCompanyRows("acctLedger", company);
  const recurring = useCompanyRows("acctRecurring", company);
  const assets = useCompanyRows("officeAssets", company);
  const users = useCol("users", company, (u) => (u.companyName || DEFAULT_COMPANY) === company);
  const H = useAcctHistory(company, dispatchData);
  const F = useFundsSummary(company);
  const fleetPlates = React.useMemo(() => new Set((fleet || []).map((d) => String(d.차량번호 || "").trim()).filter((p) => p && p !== "-")), [fleet]);

  // 자금(수입·지출 장부)
  const monthL = ledger.filter((r) => String(r.date || "").startsWith(ym));
  const inSum = monthL.filter((r) => r.type === "수입").reduce((s, r) => s + toInt(r.amount), 0);
  const outSum = monthL.filter((r) => r.type === "지출").reduce((s, r) => s + toInt(r.amount), 0);
  const byAcc = {}; monthL.filter((r) => r.type === "지출").forEach((r) => { byAcc[r.account || "기타"] = (byAcc[r.account || "기타"] || 0) + toInt(r.amount); });
  const accTop = Object.entries(byAcc).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const noEvidence = monthL.filter((r) => r.type === "지출" && !r.receipt && !r.evidence).length;
  const imported = new Set(ledger.map((r) => r.sourceId).filter(Boolean));
  const expApproved = approvals.filter((a) => a.cat === "expense" && a.status === "approved" && Number(a.amount) > 0);
  const notImported = expApproved.filter((a) => !imported.has(a.id));
  const expPending = approvals.filter((a) => a.cat === "expense" && a.status === "pending").sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));
  const expPendingSum = expPending.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const recurDone = new Set(monthL.map((r) => r.recurId).filter(Boolean));
  const recurTodo = recurring.filter((r) => r.active !== false && !recurDone.has(r.id));
  const lowStock = assets.filter((a) => a.category === "소모품" && toInt(a.minQty) > 0 && toInt(a.qty) <= toInt(a.minQty));

  // 미수(거래처 미정산 — 지난 2개월) · 미지급(용차 지급 대기)
  const settleSt = {}; (clients || []).forEach((c) => { settleSt[String(c.거래처명 || c.id || "").trim()] = c.정산상태 && typeof c.정산상태 === "object" ? c.정산상태 : {}; });
  const arMonths = [ymAgo(1), ymAgo(2)];
  const ar = {};
  H.recent.forEach(([d, c, sale]) => {
    const m = d.slice(0, 7); if (!arMonths.includes(m) || !c) return;
    const s = settleSt[c]?.[m.replace("-", "")] || settleSt[c]?.[m];
    if (s === "정산완료") return;
    const k = `${c}|${m}`; ar[k] = ar[k] || { c, m, amt: 0, n: 0 }; ar[k].amt += sale; ar[k].n += 1;
  });
  const arList = Object.values(ar).sort((a, b) => b.amt - a.amt);
  const arSum = arList.reduce((s, x) => s + x.amt, 0);
  const arByClient = Object.values(arList.reduce((m, x) => { const g = m[x.c] || (m[x.c] = { c: x.c, amt: 0, n: 0, ms: [] }); g.amt += x.amt; g.n += x.n; g.ms.push(Number(x.m.slice(5))); return m; }, {})).sort((a, b) => b.amt - a.amt);
  // 용차(지입 제외) 지급 — 지난달~이번 달 · 예정(대기) / 완료
  const payRows = H.recent.filter(([d, , , buy, plate]) => d >= `${ymAgo(1)}-01` && buy > 0 && !fleetPlates.has(plate));
  const ap = payRows.filter((r) => r[5] !== "지급완료");
  const apSum = ap.reduce((s, r) => s + r[3], 0);
  const paid = payRows.filter((r) => r[5] === "지급완료");
  const paidSum = paid.reduce((s, r) => s + r[3], 0);
  const payByMonth = [ymAgo(1), ym].map((m) => { const rs = payRows.filter((r) => r[0].startsWith(m)); const done = rs.filter((r) => r[5] === "지급완료").reduce((s, r) => s + r[3], 0); const all = rs.reduce((s, r) => s + r[3], 0); return { m, done, wait: all - done, n: rs.length }; });

  const cur = H.months[ym] || [0, 0, 0];
  const prev = H.months[ymAgo(1)] || [0, 0, 0];
  const six = [5, 4, 3, 2, 1, 0].map((n) => { const m = ymAgo(n); const v = H.months[m] || [0, 0, 0]; return { k: `${Number(m.slice(5))}월`, m, sale: v[0], buy: v[1], profit: v[0] - v[1], cnt: v[2] }; });
  const sixSum = six.reduce((a, x) => [a[0] + x.sale, a[1] + x.buy, a[2] + x.profit], [0, 0, 0]);
  const rate = cur[0] ? ((cur[0] - cur[1]) / cur[0]) * 100 : 0;
  const docWait = Object.values(docsBy || {}).reduce((s, b) => s + (docProblems(b).wait ? 1 : 0), 0);
  const pendingStaff = (users || []).filter((u) => u.approved === false && u.employmentStatus !== "퇴사" && !["shipper", "cafeUser", "totalMaster"].includes(u.role)).length;
  const tax = taxEvents(today).slice(0, 5);
  const banks = [...(F.list || [])].filter((f) => f.kind !== "대출").sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 5);
  const bankMax = Math.max(1, ...banks.map((f) => Math.abs(f.balance || 0)));
  const todos = [
    ["지출결의 결재 대기", "전자결재 › 비용·지출 결의", `${expPending.length}건`, expPending.length, "전자결재"],
    ["장부에 안 올린 승인 지출", "수입·지출 › 결재 지출 가져오기", `${notImported.length}건`, notImported.length, "자금관리:book"],
    ["이번 달 고정비 미반영", "임대료·통신비 등", `${recurTodo.length}건`, recurTodo.length, "자금관리:book"],
    ["증빙 없는 지출", "영수증·세금계산서 첨부", `${noEvidence}건`, noEvidence, "자금관리:book"],
    ["용차 지급 대기", `지난달~이번 달 · 지입 제외 · ${ap.length}건`, `${short(apSum)}원`, ap.length, "정산관리:지급관리"],
    ["소모품 재고 부족", "최소 수량 이하", `${lowStock.length}종`, lowStock.length, "비품관리"],
    ["기사 서류 검토 대기", "통장 사본·사업자등록증 등", `${docWait}명`, docWait, "기사서류"],
    ["직원·기사 가입 승인", "관리자메뉴 › 회원 관리 · 기사관리", `${pendingStaff}명`, pendingStaff, "관리자메뉴"],
  ];
  const myName = me?.name || "";
  return (
    <Deck>
      <DeckHead code="KP-FLOW · FINANCE DECK" att={att}
        title={myName ? `${myName}님, 오늘의 자금 흐름입니다` : "오늘의 자금 흐름입니다"}
        sub={<>이번 달 매출 <b style={{ color: "#fff", fontFamily: MONO }}>{won(cur[0])}</b>원 · 수익 <b style={{ color: "#fff", fontFamily: MONO }}>{won(cur[0] - cur[1])}</b>원 · 미수 <b style={{ color: "#fff", fontFamily: MONO }}>{short(arSum)}</b>원 · 지급 대기 <b style={{ color: "#fff", fontFamily: MONO }}>{short(apSum)}</b>원</>} />

      <div className="dd-kpi">
        <KTile primary code="CASH" label="보유 자금" value={F.has ? short(F.cash) : "미입력"} unit={F.has ? "원" : ""}
          foot={F.has ? <>이번 달 수입 <b style={{ color: C.hi, fontFamily: MONO }}>{short(inSum)}</b> · 지출 <b style={{ color: C.hi, fontFamily: MONO }}>{short(outSum)}</b></> : "자금관리에서 통장 잔액 입력"}
          spark={(F.monthly || []).map((x) => x.in - x.out)} />
        <KTile code="REVENUE" label="이번 달 매출" value={short(cur[0])} unit="원" foot={`${cur[2].toLocaleString()}건 · 전월 ${short(prev[0])}원`} spark={six.map((x) => x.sale)} />
        <KTile code="PAYOUT" label="매입(기사운임)" value={short(cur[1])} unit="원" foot={`전월 ${short(prev[1])}원`} spark={six.map((x) => x.buy)} />
        <KTile code="PROFIT" label="이번 달 수익" value={short(cur[0] - cur[1])} unit="원" foot={<>매익률 <b style={{ fontFamily: MONO, color: C.hi }}>{rate.toFixed(1)}%</b></>} spark={six.map((x) => x.profit)} />
        <KTile code="RECEIVABLE" label="미수금" value={short(arSum)} unit="원" warn={arSum > 0} foot={`${arByClient.length}곳 · 지난 2개월 매출의 ${pctOf(arSum, six[3].sale + six[4].sale)}%`} bar={pctOf(arSum, six[3].sale + six[4].sale)} />
        <KTile code="PAYABLE" label="미지급(용차)" value={short(apSum)} unit="원" warn={apSum > 0} foot={`${ap.length}건 · 지급률 ${pctOf(paidSum, paidSum + apSum)}%`} bar={pctOf(paidSum, paidSum + apSum)} />
      </div>

      <div className="dd-row wide">
        <DPanel code="TREND · 6M" title="월별 매출 · 매입 · 수익" right={<button type="button" className="dd-link" disabled={H.loading} onClick={H.reload}>{H.loading ? "불러오는 중…" : "새로 고침"}</button>}>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 10 }}>
            {[["6개월 매출", sixSum[0]], ["6개월 매입", sixSum[1]], ["6개월 수익", sixSum[2]]].map(([l, v]) => (
              <div key={l}><div style={{ fontSize: 13.5, fontWeight: 700, color: C.dim }}>{l}</div><div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: "#fff" }}>{short(v)}<span style={{ fontSize: 13, color: C.dim, marginLeft: 3 }}>원</span></div></div>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end", gap: 14, fontSize: 13.5, fontWeight: 700, color: C.sub }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#4B6CB7" }} />매출</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "rgba(143,176,240,.35)" }} />매입</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 2, background: C.hi }} />수익</span>
            </div>
          </div>
          {!H.ready ? <Muted t="지난 운행 내역을 불러오는 중…" h={250} /> : (
            <div style={{ height: 270 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={six} margin={{ top: 8, right: 6, left: 0, bottom: 0 }} barGap={4}>
                  <CartesianGrid stroke="rgba(143,176,240,.08)" vertical={false} />
                  <XAxis dataKey="k" tick={{ fill: C.sub, fontSize: 13, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={short} tick={{ fill: C.dim, fontSize: 12, fontFamily: MONO }} axisLine={false} tickLine={false} width={58} />
                  <Tooltip content={<DarkTip />} cursor={{ fill: "rgba(143,176,240,.06)" }} />
                  <Bar dataKey="sale" name="매출" radius={[6, 6, 0, 0]} maxBarSize={34} isAnimationActive={false}>
                    {six.map((x) => <Cell key={x.m} fill={x.m === ym ? "#6E95E8" : "#3A5A9A"} />)}
                  </Bar>
                  <Bar dataKey="buy" name="매입" fill="rgba(143,176,240,.28)" radius={[6, 6, 0, 0]} maxBarSize={34} isAnimationActive={false} />
                  <Line dataKey="profit" name="수익" stroke={C.hi} strokeWidth={2.4} dot={{ r: 3.5, fill: C.hi, strokeWidth: 0 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 12.5, color: C.dim, textAlign: "right" }}>배차완료 기준{H.at ? ` · ${new Date(H.at + 9 * 3600e3).toISOString().slice(11, 16)} 집계` : ""}</div>
        </DPanel>
        <TodoPanel code="TODO" items={todos} onGo={onGo} />
      </div>

      <div className="dd-row r3">
        <DPanel code="RECEIVABLE" title="거래처 미수금" right={<button type="button" className="dd-link" onClick={() => onGo?.("정산관리")}>거래처 정산 ›</button>}>
          {!H.ready ? <Muted t="불러오는 중…" /> : !arByClient.length ? <Muted t="정산 전 거래처가 없습니다" /> : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: "#fff" }}>{won(arSum)}</span><span style={{ fontSize: 14, color: C.dim, fontWeight: 700 }}>원 · {arByClient.length}곳</span>
              </div>
              {arByClient.slice(0, 6).map((x) => <HBar key={x.c} l={x.c} sub={`${x.ms.sort((a, b) => a - b).join("·")}월 · ${x.n}건`} v={x.amt} max={arByClient[0].amt} right={`${short(x.amt)}원`} />)}
            </>
          )}
        </DPanel>
        <DPanel code="PAYOUT" title="용차 지급 현황" right={<button type="button" className="dd-link" onClick={() => onGo?.("정산관리:지급관리")}>지급관리 ›</button>}>
          {!H.ready ? <Muted t="불러오는 중…" /> : !payRows.length ? <Muted t="지난달~이번 달 용차 지급 내역이 없습니다" /> : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                <Donut size={146} center={`${pctOf(paidSum, paidSum + apSum)}%`} sub="지급 완료율"
                  parts={[{ v: paidSum, c: C.hi, l: "완료", glow: true }, { v: apSum, c: "rgba(247,185,85,.75)", l: "예정" }]} />
                <div style={{ flex: 1, minWidth: 150 }}>
                  <Legend c={C.hi} l="지급 완료" v={`${short(paidSum)}원`} />
                  <Legend c="rgba(247,185,85,.75)" l="지급 예정" v={`${short(apSum)}원`} />
                  <div style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>지입 차량 제외 · {payRows.length}건</div>
                </div>
              </div>
              <SubHead>MONTHLY</SubHead>
              {payByMonth.map((x) => (
                <div key={x.m} style={{ padding: "6px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14.5, fontWeight: 800 }}>
                    <span style={{ color: C.ink }}>{Number(x.m.slice(5))}월 <span style={{ fontSize: 12.5, color: C.dim, fontWeight: 600 }}>{x.n}건</span></span>
                    <span style={{ fontFamily: MONO, color: "#fff" }}>{short(x.done)} <span style={{ color: C.dim }}>/ {short(x.done + x.wait)}</span></span>
                  </div>
                  <div style={{ marginTop: 6, height: 7, borderRadius: 9, background: "rgba(247,185,85,.28)", overflow: "hidden" }}>
                    <div style={{ width: `${pctOf(x.done, x.done + x.wait)}%`, height: "100%", background: `linear-gradient(90deg,#4B6CB7,${C.hi})` }} />
                  </div>
                </div>
              ))}
            </>
          )}
        </DPanel>
        <DPanel code="ACCOUNTS" title="통장 · 자금" right={<button type="button" className="dd-link" onClick={() => onGo?.("자금관리")}>자금관리 ›</button>}>
          {!F.has ? <Muted t="자금관리에서 통장·현금 잔액을 입력하면 여기에 보입니다" /> : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: "#fff" }}>{won(F.cash)}</span><span style={{ fontSize: 14, color: C.dim, fontWeight: 700 }}>원 보유</span>
                {F.runway != null && <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.hi }}>RUNWAY {F.runway.toFixed(1)}M</span>}
              </div>
              {banks.map((f) => <HBar key={f.id} l={f.name || f.bank || "계좌"} sub={f.bank && f.name !== f.bank ? f.bank : ""} v={Math.abs(f.balance || 0)} max={bankMax} right={`${short(f.balance || 0)}원`} />)}
              <SubHead>CASH FLOW · 3M</SubHead>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
                {(F.monthly || []).map((x) => { const mx = Math.max(1, ...(F.monthly || []).flatMap((y) => [y.in, y.out])); return (
                  <div key={x.m} style={{ textAlign: "center" }}>
                    <div style={{ height: 60, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 4 }}>
                      <span title={`수입 ${won(x.in)}원`} style={{ width: 14, height: `${Math.max(3, (x.in / mx) * 100)}%`, borderRadius: "4px 4px 0 0", background: C.hi, boxShadow: `0 0 8px ${C.glow}` }} />
                      <span title={`지출 ${won(x.out)}원`} style={{ width: 14, height: `${Math.max(3, (x.out / mx) * 100)}%`, borderRadius: "4px 4px 0 0", background: "rgba(143,176,240,.3)" }} />
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: C.sub, marginTop: 4 }}>{Number(x.m.slice(5))}월</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: x.in - x.out >= 0 ? C.hi : WARN }}>{x.in - x.out >= 0 ? "+" : ""}{short(x.in - x.out)}</div>
                  </div>
                ); })}
              </div>
            </>
          )}
        </DPanel>
      </div>

      <div className="dd-row r3">
        <DPanel code="APPROVAL" title="지출결의 결재 대기" right={<button type="button" className="dd-link" onClick={() => onGo?.("전자결재")}>결재함 ›</button>}>
          {!expPending.length ? <Muted t="기다리는 지출결의가 없습니다" /> : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: "#fff" }}>{expPending.length}</span><span style={{ fontSize: 14, color: C.dim, fontWeight: 700 }}>건 · 합계 {short(expPendingSum)}원</span>
              </div>
              {expPending.slice(0, 5).map((a) => {
                const days = Math.floor((Date.now() - tsMs(a.createdAt)) / 864e5);
                return <Line2 key={a.id} l={a.title || a.formLabel || "지출결의"} sub={`${a.drafter?.name || ""}${a.drafter?.team ? ` · ${a.drafter.team}` : ""}${tsMs(a.createdAt) ? ` · ${days ? `${days}일 전` : "오늘"} 상신` : ""}`} v={a.amount ? `${won(a.amount)}원` : "-"} tone={days >= 2 ? "warn" : ""} />;
              })}
            </>
          )}
        </DPanel>
        <DPanel code="EXPENSE · MTD" title="계정과목별 지출" right={<button type="button" className="dd-link" onClick={() => onGo?.("자금관리:book")}>장부 ›</button>}>
          {!accTop.length ? <Muted t="이번 달 지출 기록이 없습니다" /> : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: "#fff" }}>{won(outSum)}</span><span style={{ fontSize: 14, color: C.dim, fontWeight: 700 }}>원 지출</span>
              </div>
              {accTop.map(([a, v]) => <HBar key={a} l={a} v={v} max={accTop[0][1]} right={`${short(v)}원`} sub={`${pctOf(v, outSum)}%`} />)}
            </>
          )}
        </DPanel>
        <DPanel code="TAX CALENDAR" title="세무·납부 일정">
          {tax.map((e) => (
            <div key={`${e.d}${e.t}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
              <DBadge d={e.d} today={today} big={e.big} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.t}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}><span style={{ fontFamily: MONO }}>{e.d.slice(5).replace("-", ".")}</span> · {e.s}</div>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 10, fontSize: 12.5, color: C.dim }}>일반 기준 일정 · 휴일이면 다음 영업일</div>
        </DPanel>
      </div>
    </Deck>
  );
}

// ─────────────────────────── 인사관리 ───────────────────────────
const addMonths = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const hm = (t) => { if (!t) return ""; const d = new Date(typeof t === "number" ? t : t?.seconds ? t.seconds * 1000 : t); return isNaN(d) ? "" : new Date(d.getTime() + 9 * 3600e3).toISOString().slice(11, 16); };
const ON_LEAVE = ["휴직", "육아휴직", "출산휴가"];
// 근태 상태 색 — 출근(밝은 하늘) · 지각(따뜻한 색) · 부재/휴직(중간 남색) · 미기록(흐림)
const TONE = { ok: { bg: "rgba(143,176,240,.16)", c: C.hi, b: "rgba(143,176,240,.4)" }, bad: { bg: "rgba(247,185,85,.12)", c: WARN, b: "rgba(247,185,85,.45)" }, soft: { bg: "rgba(75,108,183,.2)", c: "#AFC4F0", b: "rgba(110,149,232,.35)" }, none: { bg: "rgba(255,255,255,.03)", c: C.dim, b: C.line } };
function HrDashboard({ company, onGo, me, att }) {
  const users = useCol("users", company, (u) => (u.companyName || DEFAULT_COMPANY) === company);
  const profiles = useCol("userProfiles", company);
  const resumes = useCompanyRows("hrResumes", company);
  const today = kst(0); const ym = ymAgo(0);
  const attendance = useCol("attendance", company, (a) => a.date === today);
  const approvals = useCompanyApprovals(company);
  const docsBy = useCompanyDriverDocs(company);
  const staff = (users || []).filter((u) => !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role) && !isTMUser(u));
  const active = staff.filter((u) => u.approved !== false && u.employmentStatus !== "퇴사");
  const onLeave = active.filter((u) => ON_LEAVE.includes(u.employmentStatus));
  const working = active.filter((u) => !ON_LEAVE.includes(u.employmentStatus));
  const resignPlanned = active.filter((u) => u.resignPlan?.date).sort((a, b) => String(a.resignPlan.date).localeCompare(String(b.resignPlan.date)));
  const pendingStaff = staff.filter((u) => u.approved === false && u.employmentStatus !== "퇴사");
  const drivers = (users || []).filter((u) => u.role === "driver");
  const pendingDrivers = drivers.filter((u) => u.approved === false);
  const pf = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  const rs = Object.fromEntries((resumes || []).map((p) => [p.id, p]));
  const hireOf = (u) => pf[u.id]?.hireDate || u.hireDate || "";
  const birthOf = (u) => String(rs[u.id]?.birthDate || pf[u.id]?.birthDate || pf[u.id]?.birth || u.birthDate || "").slice(0, 10);
  const nm = (u) => u?.name || u?.이름 || u?.email || "-";
  const joined = active.filter((u) => String(hireOf(u)).startsWith(ym));
  const left = staff.filter((u) => u.employmentStatus === "퇴사" && String(u.resignedAt || u.resignDate || u.퇴사일 || "").startsWith(ym));
  // 오늘 근태 — 출근기록 + 전자결재 휴가·외근(결재 완료·진행 중) + 휴직
  const attMap = Object.fromEntries((attendance || []).map((a) => [a.uid, a]));
  const evs = approvals.flatMap(eventsOf);
  const awayMap = {}; evs.filter((e) => e.date === today && !/조퇴|지각/.test(e.label)).forEach((e) => { awayMap[e.uid] = e; });
  const stateOf = (u) => {
    const a = attMap[u.id]; const t = hm(a?.checkInTime);
    if (ON_LEAVE.includes(u.employmentStatus)) return { s: u.employmentStatus, t: "", tone: "soft", k: "leave" };
    if (a?.status && a.status !== "출근") return { s: a.status, t, tone: /지각/.test(a.status) ? "bad" : "soft", k: /지각/.test(a.status) ? "late" : "away" };
    if (a && (a.status === "출근" || a.checkInTime)) return { s: "출근", t, tone: "ok", k: "in" };
    if (awayMap[u.id]) return { s: awayMap[u.id].label, t: awayMap[u.id].status !== "approved" ? "결재 중" : "", tone: "soft", k: "away" };
    return { s: "미출근", t: "", tone: "none", k: "none" };
  };
  const board = active.map((u) => ({ u, ...stateOf(u) }));
  const cnt = (k) => board.filter((b) => b.k === k).length;
  const inN = cnt("in"), lateN = cnt("late"), awayN = cnt("away"), noneN = cnt("none");
  const leavePending = approvals.filter((a) => a.cat === "leave" && a.status === "pending");
  const reportPending = approvals.filter((a) => a.cat === "report" && a.status === "pending");
  const noHire = active.filter((u) => !hireOf(u));
  const docIssueDrivers = drivers.filter((d) => { const p = docProblems(docsBy?.[d.id]); return p.missing || p.bad; }).length;
  // 이번 달 연차 사용 — 승인된 휴가(시작일 기준) · 일별 부재 인원
  const monthUse = approvals.filter((a) => a.status === "approved").map((a) => ({ a, x: leaveUseOf(a) })).filter(({ x }) => x && String(x.date).startsWith(ym));
  const usedDays = monthUse.reduce((s, { x }) => s + x.days, 0);
  const usedBy = Object.values(monthUse.reduce((m, { a, x }) => { const k = a.drafterUid || a.drafter?.name; const g = m[k] || (m[k] = { name: a.drafter?.name || "-", team: a.drafter?.team || "", days: 0 }); g.days += x.days; return m; }, {})).sort((a, b) => b.days - a.days);
  const dim = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
  const monthDaily = Array.from({ length: dim }, (_, i) => { const d = `${ym}-${String(i + 1).padStart(2, "0")}`; const uids = new Set(evs.filter((e) => e.date === d && e.status === "approved" && !/조퇴|지각/.test(e.label)).map((e) => e.uid)); return { k: String(i + 1), d, n: uids.size }; });
  // 인사 이벤트 — 생일 · 입사 기념일 · 수습 종료(입사 3개월) · 연차 사용 촉진 · 퇴사 예정
  const mmdd = today.slice(5);
  const births = active.map((u) => ({ u, b: birthOf(u) })).filter(({ b }) => /^\d{4}-\d{2}-\d{2}$/.test(b) && b.slice(5, 7) === ym.slice(5, 7)).sort((a, b) => a.b.slice(8).localeCompare(b.b.slice(8)));
  const probation = active.map((u) => ({ u, d: hireOf(u) ? addMonths(hireOf(u), 3) : "" })).filter((x) => x.d && x.d >= today && x.d <= addMonths(today, 1)).sort((a, b) => a.d.localeCompare(b.d));
  const anniv = active.map((u) => ({ u, h: hireOf(u) })).filter(({ h }) => h && h.slice(5, 7) === ym.slice(5, 7) && h.slice(0, 4) < ym.slice(0, 4))
    .map(({ u, h }) => ({ u, h, y: Number(ym.slice(0, 4)) - Number(h.slice(0, 4)) })).sort((a, b) => a.h.slice(8).localeCompare(b.h.slice(8)));
  const promote = active.map((u) => {
    const ent = leaveEntitlement(hireOf(u)); if (!ent || ent.label !== "연차") return null;
    const used = approvals.filter((a) => a.drafterUid === u.id && a.status === "approved").map(leaveUseOf).filter((x) => x && x.date >= ent.from && x.date <= ent.to).reduce((s, x) => s + x.days, 0);
    const remain = ent.total - used; const leftD = Math.round((new Date(`${ent.to}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 864e5);
    return remain >= 3 && leftD <= 183 ? { u, remain, to: ent.to } : null;
  }).filter(Boolean);
  const events = [
    ...births.map(({ u, b }) => ({ k: `b${u.id}`, d: `${ym}-${b.slice(8)}`, tag: "BIRTHDAY", l: `${nm(u)} 생일`, sub: u.team || "", hot: b.slice(5) === mmdd })),
    ...anniv.map(({ u, h, y }) => ({ k: `a${u.id}`, d: `${ym}-${h.slice(8)}`, tag: `${y}주년`, l: `${nm(u)} 입사 ${y}주년`, sub: `${h.replace(/-/g, ".")} 입사${u.team ? ` · ${u.team}` : ""}`, hot: h.slice(5) === mmdd })),
    ...probation.map(({ u, d }) => ({ k: `p${u.id}`, d, tag: "수습종료", l: `${nm(u)} 수습 종료`, sub: "입사 3개월" })),
    ...resignPlanned.map((u) => ({ k: `r${u.id}`, d: String(u.resignPlan.date), tag: "퇴사예정", l: `${nm(u)} 퇴사 예정`, sub: u.resignPlan.type || "", warn: true })),
  ].filter((e) => e.d >= today || e.tag === "BIRTHDAY" || /주년/.test(e.tag)).sort((a, b) => a.d.localeCompare(b.d));
  const teams = {}; active.forEach((u) => { const t = u.team || "미배정"; teams[t] = (teams[t] || 0) + 1; });
  const teamList = Object.entries(teams).sort((a, b) => b[1] - a[1]);
  const tenure = [["1년 미만", 0], ["1~3년", 0], ["3~5년", 0], ["5년 이상", 0], ["미등록", 0]];
  active.forEach((u) => { const h = hireOf(u); if (!h) { tenure[4][1] += 1; return; } const y = (new Date(`${today}T00:00:00Z`) - new Date(`${h}T00:00:00Z`)) / (365.25 * 864e5); tenure[y < 1 ? 0 : y < 3 ? 1 : y < 5 ? 2 : 3][1] += 1; });
  const tenureMax = Math.max(1, ...tenure.map((t) => t[1]));
  const week = Array.from({ length: 7 }, (_, i) => kst(i));
  const weekEvs = evs.filter((e) => week.includes(e.date) && !/조퇴|지각/.test(e.label));
  const todos = [
    ["휴가·근태 결재 대기", "전자결재 › 근태·휴가 신청", `${leavePending.length}건`, leavePending.length, "전자결재"],
    ["인사·보고 결재 대기", "전자결재 › 업무 보고·인사", `${reportPending.length}건`, reportPending.length, "전자결재"],
    ["직원 가입 승인", "관리자메뉴 › 회원 관리", `${pendingStaff.length}명`, pendingStaff.length, "관리자메뉴"],
    ["기사 가입 승인", "기사관리 › 기사 앱 계정", `${pendingDrivers.length}명`, pendingDrivers.length, "기사승인"],
    ["입사일 미등록", "연차 자동 계산이 안 됩니다", `${noHire.length}명`, noHire.length, "인사관리부"],
    ["퇴사 예정 처리", resignPlanned[0] ? `가장 빠른 퇴직일 ${resignPlanned[0].resignPlan.date}` : "", `${resignPlanned.length}명`, resignPlanned.filter((u) => String(u.resignPlan.date) <= addMonths(today, 1)).length, "인사관리부"],
    ["연차 사용 촉진 대상", "잔여 3일 이상 · 회기 종료 6개월 이내", `${promote.length}명`, promote.length, "인사관리부:leave"],
    ["기사 서류 미비", "미제출·반려·만료", `${docIssueDrivers}명`, docIssueDrivers, "기사서류"],
  ];
  const ORDER = ["late", "none", "away", "leave", "in"];
  const myName = me?.name || "";
  const inRate = pctOf(inN + lateN, working.length);
  return (
    <Deck>
      <DeckHead code="KP-FLOW · PEOPLE DECK" att={att}
        title={myName ? `${myName}님, 오늘의 인사 현황입니다` : "오늘의 인사 현황입니다"}
        sub={<>재직 <b style={{ color: "#fff", fontFamily: MONO }}>{active.length}</b>명 · 출근 <b style={{ color: "#fff", fontFamily: MONO }}>{inN + lateN}</b>명 · 휴가·부재 <b style={{ color: "#fff", fontFamily: MONO }}>{awayN}</b>명 · 이번 달 연차 <b style={{ color: "#fff", fontFamily: MONO }}>{usedDays}</b>일 사용</>} />

      <div className="dd-kpi">
        <KTile primary code="HEADCOUNT" label="재직 인원" value={active.length} unit="명" foot={`이번 달 입사 ${joined.length} · 퇴사 ${left.length}`} bar={pctOf(working.length, active.length)} />
        <KTile code="CHECK-IN" label="오늘 출근" value={`${inN + lateN}`} unit={`/ ${working.length}명`} foot={<>출근률 <b style={{ fontFamily: MONO, color: C.hi }}>{inRate}%</b>{lateN ? ` · 지각 ${lateN}` : ""}</>} bar={inRate} />
        <KTile code="AWAY" label="휴가·부재" value={awayN} unit="명" foot="휴가·반차·외근·출장" bar={pctOf(awayN, working.length)} />
        <KTile code="ON LEAVE" label="휴직" value={onLeave.length} unit="명" foot={onLeave.length ? onLeave.slice(0, 2).map((u) => `${nm(u)}(${u.employmentStatus})`).join(" · ") : "휴직·육아휴직·출산휴가"} bar={pctOf(onLeave.length, active.length)} />
        <KTile code="LEAVING" label="퇴사 예정" value={resignPlanned.length} unit="명" warn={resignPlanned.length > 0} foot={resignPlanned[0] ? `${nm(resignPlanned[0])} · ${resignPlanned[0].resignPlan.date}` : "예정 없음"} bar={pctOf(resignPlanned.length, active.length)} />
        <KTile code="PENDING" label="가입 승인 대기" value={pendingStaff.length + pendingDrivers.length} unit="명" warn={pendingStaff.length + pendingDrivers.length > 0} foot={`직원 ${pendingStaff.length} · 기사 ${pendingDrivers.length}`} bar={pctOf(pendingStaff.length + pendingDrivers.length, active.length + pendingStaff.length + pendingDrivers.length)} />
      </div>

      <div className="dd-row wide">
        <DPanel code="ATTENDANCE · TODAY" title="오늘 출근 현황" right={<button type="button" className="dd-link" onClick={() => onGo?.("출근기록부")}>출근기록부 ›</button>}>
          {!board.length ? <Muted t="재직 인원이 없습니다" h={240} /> : (
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ width: 210, flexShrink: 0, margin: "0 auto" }}>
                <div style={{ display: "grid", placeItems: "center" }}>
                  <Donut size={178} center={`${inN + lateN}/${working.length}`} sub="출근 / 근무 대상"
                    parts={[{ v: inN, c: C.hi, l: "출근", glow: true }, { v: lateN, c: WARN, l: "지각" }, { v: awayN, c: "#4B6CB7", l: "부재" }, { v: noneN, c: "rgba(143,176,240,.18)", l: "미출근" }]} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <Legend c={C.hi} l="출근" v={inN} /><Legend c={WARN} l="지각" v={lateN} /><Legend c="#4B6CB7" l="휴가·부재" v={awayN} /><Legend c="rgba(143,176,240,.3)" l="미출근" v={noneN} />
                  {onLeave.length > 0 && <Legend c="rgba(110,149,232,.35)" l="휴직" v={onLeave.length} />}
                </div>
              </div>
              <div className="hd-scroll" style={{ flex: 1, minWidth: 260, maxHeight: 380, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 8, alignContent: "start" }}>
                {[...board].sort((a, b) => ORDER.indexOf(a.k) - ORDER.indexOf(b.k)).map(({ u, s, t, tone }) => (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 12, border: `1px solid ${C.line}`, background: "rgba(255,255,255,.025)", minWidth: 0 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(143,176,240,.12)", color: C.hi, fontSize: 15, fontWeight: 900, flexShrink: 0 }}>{String(nm(u)).slice(0, 1)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nm(u)}</span>
                      <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[u.team, u.position].filter(Boolean).join(" · ") || "-"}</span>
                    </span>
                    <span style={{ flexShrink: 0, padding: "4px 9px", borderRadius: 8, fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap", background: TONE[tone].bg, color: TONE[tone].c, border: `1px solid ${TONE[tone].b}` }}>{s}{t ? <span style={{ fontFamily: MONO, marginLeft: 4 }}>{t}</span> : null}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DPanel>
        <TodoPanel code="TODO" items={todos} onGo={onGo} />
      </div>

      <div className="dd-row r3">
        <DPanel code="LEAVE · MTD" title="이번 달 연차 사용" right={<button type="button" className="dd-link" onClick={() => onGo?.("인사관리부:leave")}>연차 관리 ›</button>}>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 8 }}>
            <div><div style={{ fontSize: 13.5, fontWeight: 700, color: C.dim }}>사용 일수</div><div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: "#fff" }}>{usedDays}<span style={{ fontSize: 13.5, color: C.dim, marginLeft: 3 }}>일</span></div></div>
            <div><div style={{ fontSize: 13.5, fontWeight: 700, color: C.dim }}>사용 인원</div><div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: "#fff" }}>{usedBy.length}<span style={{ fontSize: 13.5, color: C.dim, marginLeft: 3 }}>명</span></div></div>
            <div><div style={{ fontSize: 13.5, fontWeight: 700, color: C.dim }}>결재 대기</div><div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: leavePending.length ? WARN : "#fff" }}>{leavePending.length}<span style={{ fontSize: 13.5, color: C.dim, marginLeft: 3 }}>건</span></div></div>
          </div>
          <div style={{ height: 110, margin: "0 -4px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthDaily} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                <XAxis dataKey="k" tick={{ fill: C.dim, fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} interval={4} />
                <Tooltip content={<DarkTip unit="명" />} cursor={{ fill: "rgba(143,176,240,.06)" }} />
                <Bar dataKey="n" name="부재 인원" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {monthDaily.map((x) => <Cell key={x.d} fill={x.d === today ? C.hi : x.d < today ? "#4B6CB7" : "rgba(143,176,240,.3)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {!usedBy.length ? <div style={{ fontSize: 14, color: C.dim, fontWeight: 700, paddingTop: 8 }}>이번 달 승인된 연차가 아직 없습니다</div>
            : usedBy.slice(0, 4).map((g) => <Line2 key={g.name} l={g.name} sub={g.team} v={`${g.days}일`} tone="hi" />)}
        </DPanel>
        <DPanel code="NEXT 7 DAYS" title="이번 주 부재 일정">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {week.map((d) => {
              const list = weekEvs.filter((e) => e.date === d); const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
              return (
                <div key={d} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 12, border: `1px solid ${d === today ? "rgba(143,176,240,.45)" : C.line}`, background: d === today ? "rgba(143,176,240,.08)" : "transparent" }}>
                  <div style={{ width: 46, flexShrink: 0, textAlign: "center" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: dow === 0 ? "#F29C9C" : dow === 6 ? C.glow : C.dim }}>{"일월화수목금토"[dow]}</div>
                    <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>{Number(d.slice(8))}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {!list.length ? <span style={{ fontSize: 13.5, color: C.dim, fontWeight: 600 }}>전원 근무</span> : list.slice(0, 4).map((e) => (
                      <span key={`${e.id}${e.date}`} title={`${e.name} ${e.label}`} style={{ padding: "3px 8px", borderRadius: 7, fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", ...(e.status === "approved" ? { background: "rgba(75,108,183,.35)", color: "#fff" } : { border: "1px dashed rgba(143,176,240,.45)", color: C.sub }) }}>{e.name} <span style={{ opacity: 0.7, fontWeight: 600 }}>{e.label}</span></span>
                    ))}
                    {list.length > 4 && <span style={{ fontSize: 13, color: C.dim, fontWeight: 700 }}>+{list.length - 4}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </DPanel>
        <DPanel code="HR EVENTS" title="생일 · 기념일 · 인사 일정" right={<button type="button" className="dd-link" onClick={() => onGo?.("인사관리부")}>인사관리부 ›</button>}>
          {!events.length ? <Muted t="이번 달 예정된 인사 일정이 없습니다" /> : (
            <div className="hd-scroll" style={{ maxHeight: 420, overflowY: "auto" }}>
              {events.slice(0, 9).map((e) => (
                <div key={e.k} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
                  <DBadge d={e.d} today={today} big={e.hot} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.l}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}><span style={{ fontFamily: MONO }}>{e.d.slice(5).replace("-", ".")}</span>{e.sub ? ` · ${e.sub}` : ""}</div>
                  </div>
                  <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: e.warn ? WARN : C.glow, padding: "3px 7px", borderRadius: 6, border: `1px solid ${e.warn ? "rgba(247,185,85,.4)" : "rgba(143,176,240,.3)"}` }}>{e.tag}</span>
                </div>
              ))}
            </div>
          )}
          {promote.length > 0 && <div style={{ marginTop: 10, fontSize: 13.5, fontWeight: 700, color: C.sub }}>연차 사용 촉진 대상 <b style={{ fontFamily: MONO, color: WARN }}>{promote.length}</b>명 · {promote.slice(0, 3).map((p) => `${nm(p.u)}(${p.remain}일)`).join(", ")}</div>}
        </DPanel>
      </div>

      <div className="dd-row r2">
        <DPanel code="ORGANIZATION" title="부서별 인원">
          {!teamList.length ? <Muted t="재직 인원이 없습니다" /> : teamList.slice(0, 8).map(([t, n]) => <HBar key={t} l={t} v={n} max={teamList[0][1]} right={`${n}명`} sub={`${pctOf(n, active.length)}%`} />)}
        </DPanel>
        <DPanel code="TENURE" title="근속 분포">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 10, alignItems: "end", height: 190 }}>
            {tenure.map(([l, n], i) => (
              <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
                <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: "#fff" }}>{n}</span>
                <div style={{ width: "62%", height: `${Math.max(4, (n / tenureMax) * 120)}px`, borderRadius: "8px 8px 0 0", background: i === 4 ? "rgba(247,185,85,.35)" : "linear-gradient(180deg,#8FB0F0,#2D4C82)", boxShadow: i === 4 ? "none" : "0 0 12px rgba(143,176,240,.3)" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.sub, whiteSpace: "nowrap" }}>{l}</span>
              </div>
            ))}
          </div>
          {tenure[4][1] > 0 && <div style={{ marginTop: 10, fontSize: 13.5, color: C.dim, fontWeight: 600 }}>입사일 미등록 {tenure[4][1]}명 — 인사관리부에서 입사일을 넣어 주세요</div>}
        </DPanel>
      </div>
    </Deck>
  );
}

export default function DeptDashboard({ mode, company, dispatchData, onGo, pastCache, liveStart, me, att = null }) {
  if (mode === "exec") return <ExecDashboard company={company} dispatchData={dispatchData} onGo={onGo} pastCache={pastCache} liveStart={liveStart} me={me} att={att} />;
  if (mode === "acct") return <AcctDashboard company={company} dispatchData={dispatchData} onGo={onGo} me={me} att={att} />;
  return <HrDashboard company={company} onGo={onGo} me={me} att={att} />;
}
// 경리(경리/회계 권한) · 인사(인사관리자) — 커스텀 권한은 제외
// ⚠ 관리자메뉴 › 권한 설정에서 내장 권한(경리·인사관리자)을 편집하면 customRoles에 같은 키(test·hrManager)로 저장된다 —
//   그건 "커스텀 권한"이 아니라 내장 권한이므로 부서 화면은 그대로 켠다(예전엔 이 때문에 PC에서 배차 화면이 떴다).
export const deptModeOf = (role) => (role === "test" ? "acct" : role === "hrManager" ? "hr" : null);
