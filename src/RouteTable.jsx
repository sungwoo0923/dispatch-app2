// ======================= src/RouteTable.jsx =======================
// 🗂 2026-11-26 지입차관리 › 노선관리 [줄 보기] = 칸마다 이름이 있는 표(사용자 시안 확정)
//  칸: 기사 · 차량 | 배차상태 | 순번 | 거래처명 | ▲상차(상차지명 · 상차지주소 · 상차시간) | 운행 | ▼하차(하차지명 · 하차지주소 · 하차시간)
//      | 금액(청구운임 · 기사운임 · 수수료) | 이번 달 정산 | 현위치 | 보기
//  · 주소는 간단 주소(서울 강서구 · 인천 서구 · 경기 수원) — 전체 주소는 마우스를 올리면
//  · 운행 칸: 운행 전 = 점선 도로 + "거리 · 시간 예상" / 운행 중 = 지나온 만큼 채운 도로 위 트럭 + "남은 거리 · 시간"
//             완료 = 작은 원형 체크 + "운송 완료 시각 · 거리 · 걸린 시간"
//  · 수수료 = 배차현황과 같은 값(적어 둔 수수료 · 없으면 청구 − 기사 − 회사가 따로 지급한 특수운임) · 특수운임이 있으면 아래에 작게
//  · 글자는 줄바꿈 · 자르기 없이. 폭이 모자라면 표를 옆으로 밀고, 기사 · 차량 칸은 왼쪽에 붙어 있다
//  · 휴대폰(폭 900 아래)은 기사마다 카드 + 오더마다 상차 → 운행 → 하차 세로 배치
import React from "react";
import { useRemainInfo } from "./fleetGeo";
import { fkNum, orderProfit, sfItems, sfPayee, sfType } from "./forkliftCore";

// ── 간단 주소 ──
const METRO = { 서울: 1, 부산: 1, 대구: 1, 인천: 1, 광주: 1, 대전: 1, 울산: 1 };
const PROV = { 경기: "경기", 강원: "강원", 충북: "충북", 충남: "충남", 전북: "전북", 전남: "전남", 경북: "경북", 경남: "경남", 제주: "제주",
  충청북: "충북", 충청남: "충남", 전라북: "전북", 전라남: "전남", 경상북: "경북", 경상남: "경남", 전북특별자치: "전북", 강원특별자치: "강원", 제주특별자치: "제주" };
export function simpleAddr(addr) {
  const t = String(addr || "").replace(/\(.*?\)/g, " ").replace(/^대한민국\s*/, "").split(/[\s,]+/).filter(Boolean);
  if (!t.length) return "";
  const base = t[0].replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "");
  if (base === "세종") return "세종";
  if (METRO[base]) { const gu = t.slice(1).find((x) => /(구|군)$/.test(x)); return gu ? `${base} ${gu}` : base; }
  const pv = PROV[base];
  const rest = pv ? t.slice(1) : t;
  const city = rest.find((x) => /(시|군)$/.test(x));
  const c = city ? city.replace(/(시|군)$/, "") : "";
  if (pv) return c ? `${pv} ${c}` : pv;
  return c || t.slice(0, 2).join(" ");
}

// ── 시간 · 숫자 ──
const tsOf = (v) => (!v ? 0 : typeof v.toMillis === "function" ? v.toMillis() : typeof v.seconds === "number" ? v.seconds * 1000 : typeof v === "number" ? v : (Date.parse(String(v).replace(" ", "T")) || 0));
const p2 = (n) => String(n).padStart(2, "0");
const hm = (ms) => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const dur = (min) => { const m = Math.max(0, Math.round(min)); return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`; };
const won = (n) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;
const md = (s) => { const m = String(s || "").match(/\d{4}-(\d{2})-(\d{2})/); return m ? `${Number(m[1])}/${Number(m[2])}` : ""; };
const agoText = (ms) => { if (!ms) return ""; const m = Math.floor((Date.now() - ms) / 60000); if (m < 1) return "방금"; if (m < 60) return `${m}분 전`; const h = Math.floor(m / 60); return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`; };
// 수수료 = 배차현황과 같은 값
export const feeOf = (o) => (o?.수수료 != null && String(o.수수료).trim() !== "" ? fkNum(o.수수료) : orderProfit(o));
// 회사가 따로 내 주는 특수운임(수수료에서 빠지는 것) 한 줄
const feeNote = (o) => sfItems(o).filter((it) => sfPayee(it) === "외부").map((it) => `${it.이름 || sfType(it.종류).key || "특수"} −${fkNum(it.금액) % 10000 === 0 ? `${fkNum(it.금액) / 10000}만` : fkNum(it.금액).toLocaleString("ko-KR")}`).join(" · ");

const STATUS_COLOR = { 운송중: "#60A5FA", 오더확인중: "#FBBF24", 배차예정: "#A5B4FC", 배차완료: "#34D399", 배차대기: "#94A3B8", 휴차: "#64748B" };

// ── 상차 → 하차 거리 · 시간(한 번 구하면 FleetManagement 쪽 저장소에 남는다) ──
function useRouteDist(from, to, getRouteDist) {
  const [r, setR] = React.useState(undefined);
  React.useEffect(() => {
    if (!from || !to || !getRouteDist) { setR(null); return undefined; }
    let alive = true;
    getRouteDist(from, to, (v) => { if (alive) setR(v || null); });
    return () => { alive = false; };
  }, [from, to, getRouteDist]);
  return r; // undefined = 계산 중 · null = 못 구함 · { km, minutes }
}

// ── 트럭(옆모습 윙바디) ──
function Truck({ w = 54 }) {
  const id = React.useId().replace(/:/g, "");
  return (
    <svg width={w} height={w * 0.5} viewBox="0 0 124 62" style={{ display: "block", overflow: "visible" }} aria-hidden>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset=".55" stopColor="#E3E9F3" /><stop offset="1" stopColor="#AEB9CC" /></linearGradient>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4FC3FF" /><stop offset=".5" stopColor="#1E88E5" /><stop offset="1" stopColor="#0D47A1" /></linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#BFE6FF" /><stop offset=".45" stopColor="#3A6FB0" /><stop offset="1" stopColor="#0B1A33" /></linearGradient>
        <radialGradient id={`${id}r`} cx=".4" cy=".35" r=".7"><stop offset="0" stopColor="#F5F8FC" /><stop offset=".6" stopColor="#9AA6B8" /><stop offset="1" stopColor="#4A5568" /></radialGradient>
        <radialGradient id={`${id}l`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#FFF8D6" /><stop offset="1" stopColor="#FFE08A" stopOpacity="0" /></radialGradient>
        <filter id={`${id}s`} x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="2.4" /></filter>
      </defs>
      <ellipse cx="62" cy="55" rx="54" ry="4.5" fill="#000" opacity=".55" filter={`url(#${id}s)`} />
      <rect x="6" y="40" width="104" height="6" rx="2" fill="#1B2433" />
      <rect x="4" y="6" width="74" height="36" rx="3.5" fill={`url(#${id}b)`} stroke="#8C98AD" strokeWidth=".8" />
      <rect x="4" y="6" width="74" height="4" rx="2" fill="#FFFFFF" opacity=".8" />
      <path d="M22 9v31M40 9v31M58 9v31" stroke="#7F8BA1" strokeOpacity=".28" strokeWidth="1" />
      <rect x="8" y="30" width="66" height="3.2" rx="1.6" fill="#38BDF8" /><rect x="8" y="34.5" width="40" height="1.8" rx=".9" fill="#7C3AED" opacity=".85" />
      <path d="M80 14h18.5c3.2 0 5.6 1.4 7.2 4.1l7.3 12.6c.7 1.2 1 2.5 1 3.9V42H80Z" fill={`url(#${id}c)`} />
      <path d="M83 17h14.6c2 0 3.3.8 4.3 2.4l5.6 9.6H83Z" fill={`url(#${id}g)`} />
      <path d="M85 18.2h6l-4 9.6h-2Z" fill="#fff" opacity=".35" />
      <rect x="80" y="31" width="34" height="2" fill="#0A2E66" opacity=".45" />
      <rect x="110.5" y="34" width="4" height="4.5" rx="1.2" fill="#FFF4C2" /><circle cx="117" cy="36.2" r="7" fill={`url(#${id}l)`} opacity=".85" />
      <rect x="111" y="40" width="5" height="3.5" rx="1" fill="#2A3445" />
      {[22, 38, 98].map((cx) => (
        <g key={cx}><circle cx={cx} cy="46" r="8.2" fill="#0B0F17" /><circle cx={cx} cy="46" r="4.6" fill={`url(#${id}r)`} /><circle cx={cx} cy="46" r="1.4" fill="#2D3748" /></g>
      ))}
    </svg>
  );
}

// ── 운행 칸 ──
function Road({ W, pct = 0, run = false }) {
  const id = React.useId().replace(/:/g, "");
  const x = 14 + (W - 28) * Math.max(0, Math.min(100, pct)) / 100;
  return (
    <svg width={W} height="26" viewBox={`0 0 ${W} 26`} style={{ position: "absolute", left: 0, bottom: 0 }} aria-hidden>
      <defs><linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2="0"><stop offset="0" stopColor="#A78BFA" /><stop offset="1" stopColor="#38BDF8" /></linearGradient></defs>
      <rect x="2" y="6" width={W - 4} height="14" rx="7" fill="#101B2F" stroke="#22345A" />
      <path d={`M14 13H${W - 14}`} stroke="#3B5B97" strokeWidth="1.6" strokeDasharray="6 6" opacity=".8" />
      {run && <><rect x="2" y="6" width={x} height="14" rx="7" fill={`url(#${id})`} opacity=".28" /><path d={`M14 13H${x}`} stroke={`url(#${id})`} strokeWidth="2.4" strokeLinecap="round" /></>}
      <circle cx="12" cy="13" r="4" fill="#A78BFA" />
      <circle cx={W - 12} cy="13" r="4.5" fill="#0B1424" stroke="#38BDF8" strokeWidth="2" />
    </svg>
  );
}
function DoneMark() {
  const id = React.useId().replace(/:/g, "");
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" style={{ display: "block", flexShrink: 0 }} aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#A78BFA" /><stop offset="1" stopColor="#34D399" /></linearGradient></defs>
      <circle cx="12" cy="12" r="9.5" fill="#0E2A22" stroke={`url(#${id})`} strokeWidth="2.6" />
      <path d="M7.6 12.4l3 3 5.8-6.2" stroke="#34D399" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
const Sep = () => <span style={{ color: "#3B5B97", margin: "0 6px" }}>·</span>;

// state: "plan" | "run" | "done"
function Conn({ o, state, live, getRouteDist, W = 200 }) {
  const dist = useRouteDist(o.상차지주소 || "", o.하차지주소 || "", getRouteDist);
  const remain = useRemainInfo(state === "run" ? o : null, state === "run" ? live?.location : null, "운송중");
  if (state === "done") {
    const end = tsOf(o.기사완료일시);
    const start = tsOf(o.상차지도착일시) || tsOf(o.상차완료일시) || tsOf(o.기사확인일시);
    const took = end && start && end > start ? (end - start) / 60000 : null;
    return (
      <div style={{ width: W, height: 52, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, margin: "0 auto" }}>
        <DoneMark />
        <div style={{ lineHeight: 1.3, textAlign: "left" }}>
          <div style={{ fontSize: 14.5, fontWeight: 900, color: "#E6EDF8" }}>운송 완료{end ? <span style={{ color: "#6EE7B7" }}> {hm(end)}</span> : null}</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#8796AE" }}>{[dist?.km != null ? `${dist.km}km` : "", took != null ? `${dur(took)} 걸림` : ""].filter(Boolean).join(" · ") || "기사앱 완료"}</div>
        </div>
      </div>
    );
  }
  let pct = 0, text;
  if (state === "run" && remain) {
    const toDrop = remain.label === "하차지까지";
    if (toDrop && dist?.km) pct = Math.max(4, Math.min(96, (1 - remain.km / dist.km) * 100));
    text = <><b>{remain.km}km</b><Sep /><b>{dur(remain.min)}</b><span style={{ color: "#7DD3FC", fontSize: 12, fontWeight: 900, marginLeft: 4 }}>{toDrop ? "남음" : "상차지까지"}</span></>;
  } else if (dist === undefined) {
    text = <span style={{ color: "#8796AE", fontWeight: 800 }}>거리 계산 중…</span>;
  } else if (dist) {
    text = <><b>{dist.km}km</b><Sep /><b>{dur(dist.minutes)}</b><span style={{ color: "#8796AE", fontSize: 12, fontWeight: 800, marginLeft: 4 }}>예상</span></>;
  } else {
    text = <span style={{ color: "#8796AE", fontWeight: 800 }}>주소를 확인해 주세요</span>;
  }
  const run = state === "run";
  const x = 14 + (W - 28) * pct / 100;
  return (
    <div style={{ width: W, margin: "0 auto" }}>
      <div style={{ position: "relative", height: run ? 44 : 26 }}>
        <Road W={W} pct={pct} run={run} />
        {run && <div style={{ position: "absolute", left: Math.max(0, x - 44), bottom: 9 }}><Truck w={54} /></div>}
      </div>
      <div style={{ marginTop: 6, textAlign: "center", fontSize: 14, fontWeight: 900, color: "#E6EDF8", whiteSpace: "nowrap" }}>{text}</div>
    </div>
  );
}

// 현위치(간단 주소)
function Loc({ live, geocode }) {
  const loc = live?.location;
  const lat = loc?.lat, lng = loc?.lng;
  const [addr, setAddr] = React.useState("");
  React.useEffect(() => {
    if (!geocode || !Number.isFinite(lat) || !Number.isFinite(lng)) { setAddr(""); return undefined; }
    let alive = true;
    geocode(lat, lng, (v) => { if (alive) setAddr(v || ""); });
    return () => { alive = false; };
  }, [lat, lng, geocode]);
  if (!loc) return <span style={{ fontSize: 13.5, fontWeight: 800, color: "#6B7A95" }}>위치 미연동</span>;
  const at = tsOf(live.updatedAt);
  const isLive = live.active !== false && at && Date.now() - at < 10 * 60000;
  return (
    <span style={{ display: "inline-block", lineHeight: 1.6, fontSize: 13.5, fontWeight: 800 }} title={addr}>
      <b style={{ fontSize: 12, padding: "1px 7px", borderRadius: 6, background: isLive ? "#0F3D2E" : "#3A3018", color: isLive ? "#6EE7B7" : "#FCD34D" }}>{isLive ? "현위치" : "최종위치"}</b><br />
      <span style={{ color: "#E6EDF8" }}>{simpleAddr(addr) || "주소 찾는 중…"}</span><br />
      <span style={{ color: "#8796AE", fontSize: 12.5 }}>{agoText(at)}{isLive ? " 갱신" : " 마지막"}</span>
    </span>
  );
}

const CSS = `
.rtv{font-family:'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕',sans-serif;color:#E6EDF8;font-variant-numeric:tabular-nums}
.rtv-g{display:flex;align-items:center;gap:10px;margin:18px 2px 10px;font-size:16px;font-weight:900}
.rtv-g:first-child{margin-top:2px}
.rtv-wrap{overflow-x:auto;border:1px solid #1A2742;border-radius:14px;background:#0B1424}
.rtv table{width:100%;border-collapse:separate;border-spacing:0;white-space:nowrap}
.rtv thead th{background:#101E38;color:#DCE6F7;font-size:14.5px;font-weight:900;padding:11px 9px;text-align:center;border-bottom:1px solid #22345A}
.rtv thead th.grp{font-size:12px;letter-spacing:.14em;padding:7px 9px;border-bottom:1px solid #1A2742}
.rtv th.pk{color:#C4B5FD}.rtv th.dr{color:#7DD3FC}.rtv th.mo{color:#FCD34D}
.rtv thead th:first-child{position:sticky;left:0;z-index:3}
.rtv td{padding:12px 9px;font-size:14.5px;font-weight:700;border-bottom:1px solid #13213D;vertical-align:middle;background:#0B1424;text-align:center}
/* 🛠 2026-11-26 공용 표 스타일(index.css)이 모든 칸 글씨를 #111827 !important 로 칠해, 보라 · 하늘 덧칠 칸(상차 · 하차)은 다크 지킴이도 못 고쳐 검게 보였다
   → 표가 글씨색을 직접 정한다. 칸마다 다른 색은 style 의 --c 로 */
.rtv table tbody td{color:var(--c,#E6EDF8) !important}
.rtv table tbody td.drv{text-align:left}
.rtv tr.alt>td{background:#0D182C}
.rtv td.drv{border-right:1px solid #1A2742;position:sticky;left:0;z-index:2}
.rtv td.pk{background-image:linear-gradient(rgba(124,58,237,.07),rgba(124,58,237,.07))}
.rtv td.dr{background-image:linear-gradient(rgba(2,132,199,.07),rgba(2,132,199,.07))}
.rtv .place{font-size:15.5px;font-weight:900}.rtv .addr{font-size:14.5px;--c:#CFE0FF;font-weight:800}.rtv .time{font-size:15px;font-weight:900}
.rtv .money{text-align:center;font-size:15px;font-weight:900}
.rtv .seq{width:26px;height:26px;border-radius:8px;background:#22345A;display:grid;place-items:center;font-size:13px;font-weight:900;margin:auto}
.rtv-btn{display:block;width:84px;height:30px;border-radius:8px;border:1px solid #2B4F8C;background:transparent;color:#CFE0FF;font:inherit;font-size:13px;font-weight:800;margin:3px auto;cursor:pointer}
.rtv-btn:hover{background:#13264A}.rtv-btn.on{background:#2563EB;border-color:#2563EB;color:#fff}
.rtv-plate{display:inline-block;margin-top:6px;font-size:15px;font-weight:900;color:#F4F8FF;padding:2px 10px;border-radius:7px;background:linear-gradient(180deg,#17305C,#0E1A30);border:1.5px solid #4C74B8;letter-spacing:.02em}
.rtv-no{font-size:12px;font-weight:900;background:#2B3F66;border-radius:6px;padding:1px 7px;margin-right:6px;color:#fff}
.rtv-badge{font-size:12px;font-weight:900;padding:2px 7px;border-radius:6px;margin-left:6px;color:#E6EDF8}
/* 휴대폰 카드 */
.rtm-card{background:#0B1424;border:1px solid #1A2742;border-radius:16px;overflow:hidden;margin-bottom:10px}
.rtm-card.idle{border-color:#3A3220}
.rtm-head{padding:12px 14px;display:flex;gap:10px;align-items:flex-start;border-bottom:1px solid #13213D}
.rtm-o{padding:12px 14px;border-top:1px solid #13213D}
.rtm-o:first-of-type{border-top:0}
.rtm-pt{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:8px;align-items:baseline}
.rtm-tag{font-size:12px;font-weight:900;padding:2px 0;border-radius:6px;text-align:center}
.rtm-money{display:flex;justify-content:space-between;gap:8px;margin-top:10px;padding:9px 10px;border-radius:10px;background:#0E1A30;border:1px solid #1A2742}
.rtm-money div{text-align:center;flex:1}.rtm-money small{display:block;font-size:11.5px;font-weight:800;color:#8796AE}.rtm-money b{font-size:14.5px;font-weight:900}
.rtm-btns{display:flex;gap:6px;padding:10px 14px;border-top:1px solid #13213D}
.rtm-btns .rtv-btn{flex:1;width:auto;margin:0;height:38px;font-size:14px}
`;

function stateOf(o, row, statusLabel) {
  if (o.기사확인상태 === "완료" || tsOf(o.기사완료일시)) return "done";
  if (statusLabel === "운송중" && row.curId && (o._id ?? o.id) === row.curId && row.live?.location) return "run";
  return "plan";
}

// ── 줄 보기(표) ──
export function RouteTableView({ groups = [], dayLabel = "", isSingleDay = true, statusOf, renderCard, onOpenDetail, onOpenHistory, geocode, getRouteDist, curOrderOf }) {
  const ref = React.useRef(null);
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current; if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 900));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const [open, setOpen] = React.useState(() => new Set());
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  let idx = 0;
  const dateOf = (d, t) => `${isSingleDay ? "" : `${md(d)} `}${t || "즉시"}`.trim();
  const pickT = (o) => (isSingleDay ? (o.상차시간 || "즉시") : `${md(o.상차일)} ${o.상차시간 || "즉시"}`);
  const dropT = (o) => `${o.하차일 && o.하차일 !== o.상차일 ? `${md(o.하차일)} ` : (isSingleDay ? "" : `${md(o.상차일)} `)}${o.하차시간 || "즉시"}`.trim();

  return (
    <div className="rtv" ref={ref}>
      <style>{CSS}</style>
      {groups.map((g) => (
        <div key={g.key}>
          {groups.length > 1 && (
            <div className="rtv-g">
              <span style={{ width: 9, height: 9, borderRadius: 99, background: g.mine ? "#38BDF8" : g.key ? "#8FB0F0" : "#64748B" }} />
              <span style={{ color: g.mine ? "#7DD3FC" : g.key ? "#E6EDF8" : "#A9B8D2" }}>{g.title}</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: "#8796AE" }}>{g.rows.length}대 · 운행 {g.rows.filter((r) => statusOf(r).label === "운송중").length}</span>
            </div>
          )}
          {narrow ? (
            g.rows.map((row) => {
              idx += 1;
              const { driver: d, orders, live, monthlyFareSum } = row;
              const st = statusOf(row).label;
              const cur = curOrderOf?.(orders); const r2 = { ...row, curId: cur ? (cur._id ?? cur.id) : null };
              const isOpen = open.has(d.id);
              return (
                <div key={d.id} className={`rtm-card${orders.length ? "" : " idle"}`}>
                  <div className="rtm-head">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: 4 }}>
                        <span className="rtv-no">{p2(idx)}</span><b style={{ fontSize: 18, fontWeight: 900 }}>{d.이름 || "-"}</b>
                        <span className="rtv-badge" style={{ background: d.등급 === "직영" ? "#0F5E55" : "#1B2E54" }}>{d.등급 || "지입"}</span>
                        <span style={{ marginLeft: 8, fontSize: 14, fontWeight: 900, color: STATUS_COLOR[st] || "#A9B8D2" }}>{st}</span>
                      </div>
                      <span className="rtv-plate">{d.차량번호 || "-"}</span>
                      <div style={{ marginTop: 6 }}><Loc live={live} geocode={geocode} /></div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: "#8796AE" }}>이번 달 정산</div>
                      <div style={{ fontSize: 16, fontWeight: 900 }}>{won(monthlyFareSum)}</div>
                    </div>
                  </div>
                  {orders.length === 0 && <div style={{ padding: "12px 14px", fontSize: 15, fontWeight: 900, color: "#FCD34D" }}>{isSingleDay ? `${dayLabel || "이날"} 배차 없음` : "기간 배차 없음"}</div>}
                  {orders.map((o, i) => {
                    const note = feeNote(o);
                    return (
                      <div key={o._id || i} className="rtm-o">
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span style={{ width: 24, height: 24, borderRadius: 7, background: "#22345A", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 900, flexShrink: 0 }}>{i + 1}</span>
                          <b style={{ fontSize: 15.5, fontWeight: 900 }}>{o.거래처명 || "-"}</b>
                        </div>
                        <div className="rtm-pt" title={o.상차지주소 || ""}>
                          <span className="rtm-tag" style={{ background: "rgba(124,58,237,.18)", color: "#C4B5FD" }}>상차</span>
                          <span style={{ fontSize: 15.5, fontWeight: 900, overflowWrap: "anywhere" }}>{o.상차지명 || "-"} <span style={{ fontSize: 13.5, color: "#CFE0FF", fontWeight: 800 }}>{simpleAddr(o.상차지주소)}</span></span>
                          <span style={{ fontSize: 14.5, fontWeight: 900, whiteSpace: "nowrap" }}>{dateOf(o.상차일, o.상차시간)}</span>
                        </div>
                        <div style={{ margin: "8px 0" }}><Conn o={o} state={stateOf(o, r2, st)} live={live} getRouteDist={getRouteDist} W={240} /></div>
                        <div className="rtm-pt" title={o.하차지주소 || ""}>
                          <span className="rtm-tag" style={{ background: "rgba(2,132,199,.18)", color: "#7DD3FC" }}>하차</span>
                          <span style={{ fontSize: 15.5, fontWeight: 900, overflowWrap: "anywhere" }}>{o.하차지명 || "-"} <span style={{ fontSize: 13.5, color: "#CFE0FF", fontWeight: 800 }}>{simpleAddr(o.하차지주소)}</span></span>
                          <span style={{ fontSize: 14.5, fontWeight: 900, whiteSpace: "nowrap" }}>{dropT(o)}</span>
                        </div>
                        <div className="rtm-money">
                          <div><small>청구운임</small><b>{won(fkNum(o.청구운임))}</b></div>
                          <div><small>기사운임</small><b style={{ color: "#CFE0FF" }}>{won(fkNum(o.기사운임))}</b></div>
                          <div><small>수수료</small><b style={{ color: "#34D399" }}>{won(feeOf(o))}</b>{note && <small style={{ color: "#FCD34D" }}>{note}</small>}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="rtm-btns">
                    <button type="button" className={`rtv-btn${isOpen ? " on" : ""}`} onClick={() => toggle(d.id)}>{isOpen ? "접기" : "자세히"}</button>
                    <button type="button" className="rtv-btn" onClick={() => onOpenDetail?.(d)}>상세</button>
                    {onOpenHistory && <button type="button" className="rtv-btn" onClick={() => onOpenHistory(d)}>이동 기록</button>}
                  </div>
                  {isOpen && <div style={{ padding: "0 8px 10px" }}>{renderCard(row, idx)}</div>}
                </div>
              );
            })
          ) : (
            <div className="rtv-wrap">
              <table>
                <thead>
                  <tr>
                    <th rowSpan={2}>기사 · 차량</th><th rowSpan={2}>배차상태</th><th rowSpan={2}>순번</th><th rowSpan={2}>거래처명</th>
                    <th className="grp pk" colSpan={3}>▲ 상차</th><th rowSpan={2}>운행</th><th className="grp dr" colSpan={3}>▼ 하차</th>
                    <th className="grp mo" colSpan={3}>금액</th><th rowSpan={2}>이번 달 정산</th><th rowSpan={2}>현위치</th><th rowSpan={2}>보기</th>
                  </tr>
                  <tr>
                    <th className="pk">상차지명</th><th className="pk">상차지주소</th><th className="pk">상차시간</th>
                    <th className="dr">하차지명</th><th className="dr">하차지주소</th><th className="dr">하차시간</th>
                    <th className="mo">청구운임</th><th className="mo">기사운임</th><th className="mo">수수료</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((row, ri) => {
                    idx += 1;
                    const { driver: d, orders, live, monthlyFareSum } = row;
                    const st = statusOf(row).label;
                    const cur = curOrderOf?.(orders); const r2 = { ...row, curId: cur ? (cur._id ?? cur.id) : null };
                    const n = Math.max(1, orders.length);
                    const isOpen = open.has(d.id);
                    const alt = ri % 2 ? "alt" : undefined;
                    const head = (
                      <>
                        <td className="drv" rowSpan={n}>
                          <span className="rtv-no">{p2(idx)}</span><b style={{ fontSize: 18, fontWeight: 900 }}>{d.이름 || "-"}</b>
                          <span className="rtv-badge" style={{ background: d.등급 === "직영" ? "#0F5E55" : "#1B2E54" }}>{d.등급 || "지입"}</span><br />
                          <span className="rtv-plate">{d.차량번호 || "-"}</span>
                          <div style={{ fontSize: 12.5, color: "#A9B8D2", marginTop: 5, lineHeight: 1.45 }}>{[d.차량톤수, d.차량종류].filter(Boolean).join(" ") || "-"}<br />{d.전화번호 && d.전화번호 !== "-" ? d.전화번호 : ""}</div>
                        </td>
                        <td rowSpan={n} style={{ textAlign: "center", fontWeight: 900, "--c": STATUS_COLOR[st] || "#A9B8D2" }}>{st}{row.isOffDay && orders.length > 0 && <div style={{ fontSize: 12, color: "#FCD34D", marginTop: 3 }}>근무 불가 요일</div>}</td>
                      </>
                    );
                    const tail = (
                      <>
                        <td rowSpan={n} className="money" style={{ fontSize: 16 }}>{won(monthlyFareSum)}</td>
                        <td rowSpan={n}><Loc live={live} geocode={geocode} /></td>
                        <td rowSpan={n}>
                          <button type="button" className={`rtv-btn${isOpen ? " on" : ""}`} onClick={() => toggle(d.id)} aria-expanded={isOpen}>{isOpen ? "접기 ▴" : "자세히 ▾"}</button>
                          <button type="button" className="rtv-btn" onClick={() => onOpenDetail?.(d)}>상세</button>
                          {onOpenHistory && <button type="button" className="rtv-btn" onClick={() => onOpenHistory(d)}>이동 기록</button>}
                        </td>
                      </>
                    );
                    return (
                      <React.Fragment key={d.id}>
                        {orders.length === 0 ? (
                          <tr className={alt}>{head}<td colSpan={12} style={{ "--c": "#FCD34D", fontWeight: 900 }}>{isSingleDay ? `${dayLabel || "이날"} 배차 없음` : "기간 배차 없음"}</td>{tail}</tr>
                        ) : orders.map((o, i) => {
                          const note = feeNote(o);
                          return (
                            <tr key={o._id || i} className={alt}>
                              {i === 0 && head}
                              <td><span className="seq">{i + 1}</span></td>
                              <td style={{ fontWeight: 900 }}>{o.거래처명 || "-"}</td>
                              <td className="pk place">{o.상차지명 || "-"}</td>
                              <td className="pk addr" title={o.상차지주소 || ""}>{simpleAddr(o.상차지주소) || "-"}</td>
                              <td className="pk time">{pickT(o)}</td>
                              <td style={{ padding: "4px 6px" }}><Conn o={o} state={stateOf(o, r2, st)} live={live} getRouteDist={getRouteDist} /></td>
                              <td className="dr place">{o.하차지명 || "-"}</td>
                              <td className="dr addr" title={o.하차지주소 || ""}>{simpleAddr(o.하차지주소) || "-"}</td>
                              <td className="dr time">{dropT(o)}</td>
                              <td className="money">{won(fkNum(o.청구운임))}</td>
                              <td className="money" style={{ "--c": "#CFE0FF" }}>{won(fkNum(o.기사운임))}</td>
                              <td className="money" style={{ "--c": "#34D399" }}>{won(feeOf(o))}{note && <span style={{ display: "block", fontSize: 11.5, fontWeight: 800, color: "#FCD34D", marginTop: 2 }}>{note}</span>}</td>
                              {i === 0 && tail}
                            </tr>
                          );
                        })}
                        {isOpen && <tr><td colSpan={17} style={{ padding: 8, background: "#070D1A", whiteSpace: "normal" }}>{renderCard(row, idx)}</td></tr>}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
