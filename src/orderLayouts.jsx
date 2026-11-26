// ======================= src/orderLayouts.jsx =======================
// 🎨 2026-11-26 오더등록 "구성이 바뀌는" 디자인 시안(사용자 요청) — 최고관리자 [디자인 변경]으로 돌려 본다
//  · 입력칸 · 버튼 · 자동완성 · 단축키 · 저장은 원래 코드 그대로 — 칸마다 붙인 이름표(data-of)로 "놓이는 자리"만 바꾼다(CSS grid-template-areas)
//  · 더하는 것: 상차 · 하차 카드 바탕, 가운데 경로(거리 · 예상 시간 · 상하차 교체 · 경로보기), 묶음 제목, 오른쪽 운임 요약 — 보기용
//  · route(A 루트 보드) · sheet(B 섹션 시트) · cockpit(C 3단 콕핏) — 넓은 화면 기준 12 · 14칸 격자
import React from "react";
import { getDrivingRoute } from "./tmapFareCalc";

export const LAYOUT_SKINS = new Set(["route", "sheet", "cockpit"]);

// ── 상차 → 하차 실제 도로 거리 · 시간(티맵) — 주소가 바뀌면 0.6초 뒤 한 번, 같은 구간은 기억 ──
const routeCache = new Map();
export function useDrivingRoute(from, to) {
  const key = `${String(from || "").trim()}→${String(to || "").trim()}`;
  const [r, setR] = React.useState(() => routeCache.get(key));
  React.useEffect(() => {
    if (!from || !to) { setR(null); return undefined; }
    if (routeCache.has(key)) { setR(routeCache.get(key)); return undefined; }
    setR(undefined);
    let alive = true;
    const t = setTimeout(() => { getDrivingRoute(from, to).then((v) => { routeCache.set(key, v || null); if (alive) setR(v || null); }).catch(() => { if (alive) setR(null); }); }, 600);
    return () => { alive = false; clearTimeout(t); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return r; // undefined = 계산 중 · null = 모름 · { km, minutes }
}
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`);
const addMin = (hm, m) => { const x = /^(\d{1,2}):(\d{2})$/.exec(String(hm || "").trim()); if (!x) return ""; const t = (+x[1] * 60 + +x[2] + m) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

// 가운데 경로 상자 — 거리 · 예상 시간 · (상차시간이 있으면) 도착 예상 · 교체 · 경로보기
export function RouteMid({ form, onSwap, onMap, dark = false }) {
  const r = useDrivingRoute(form?.상차지주소, form?.하차지주소);
  const has = !!(form?.상차지주소 && form?.하차지주소);
  const eta = r && form?.상차시간 ? addMin(form.상차시간, r.minutes) : "";
  return (
    <div className={`of-mid${dark ? " dark" : ""}`}>
      <button type="button" className="of-mid-sw" onClick={onSwap} title="상차지 ↔ 하차지 교체">⇅</button>
      <span className="of-mid-ln" />
      <div className="of-mid-box">
        {!has ? <span className="of-mid-sub">주소를 넣으면<br />거리 · 시간</span>
          : r === undefined ? <span className="of-mid-sub">계산 중…</span>
          : r ? <><b>{r.km}km</b><span>{dur(r.minutes)}</span>{eta && <span className="of-mid-sub">도착 {eta}</span>}</>
          : <span className="of-mid-sub">경로를 못 찾았어요</span>}
      </div>
      <span className="of-mid-ln" />
      {has && <button type="button" className="of-mid-map" onClick={onMap}>경로보기</button>}
    </div>
  );
}

// 오른쪽 운임 요약(A) — 입력은 왼쪽 칸에서, 여기는 보기만
const won = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) && n ? n.toLocaleString("ko-KR") : "0"; };
export function FareSummary({ form, hint }) {
  const sale = Number(String(form?.청구운임 ?? "").replace(/[^\d]/g, "")) || 0;
  const drv = Number(String(form?.기사운임 ?? "").replace(/[^\d]/g, "")) || 0;
  const fee = form?.수수료 != null && String(form.수수료).trim() !== "" ? Number(String(form.수수료).replace(/[^\d-]/g, "")) || 0 : sale - drv;
  const rate = sale > 0 ? Math.round((fee / sale) * 1000) / 10 : 0;
  const r = useDrivingRoute(form?.상차지주소, form?.하차지주소);
  return (
    <div className="of-fare">
      <div className="of-fare-eye">FARE · SUMMARY</div>
      <div className="of-fare-m"><span>청구운임</span><b>{won(sale)}</b></div>
      <div className="of-fare-m"><span>기사운임</span><b>{won(drv)}</b></div>
      <div className="of-fare-m f"><span>수수료{sale > 0 ? ` · ${rate}%` : ""}</span><b>{won(fee)}</b></div>
      {(hint || r) && (
        <div className="of-fare-hint">
          {r ? <>상차 → 하차 <b>{r.km}km · {dur(r.minutes)}</b><br /></> : null}
          {hint ? <>{hint}</> : null}
        </div>
      )}
    </div>
  );
}

// 격자 안에 함께 놓는 장식(카드 바탕 · 묶음 제목 · 가운데 경로) — 입력칸은 건드리지 않는다
export function LayoutDecor({ skin, form, onSwap, onMap }) {
  if (skin === "route") return (<>
    <div className="of-deco of-card-p" aria-hidden><span>● 상차</span></div>
    <div className="of-deco of-card-d" aria-hidden><span>● 하차</span></div>
    <div className="of-deco of-card-fare" aria-hidden />
    <div data-of="md" className="of-md-wrap"><RouteMid form={form} onSwap={onSwap} onMap={onMap} /></div>
  </>);
  if (skin === "sheet") return (<>
    {[["h1", "기본"], ["h2", "상차"], ["h3", "하차"], ["h4", "화물 · 차량"], ["h5", "기사 · 지급"], ["h6", "운임"]].map(([k, t]) => (
      <div key={k} data-of={k} className="of-sec" aria-hidden><span>{t}</span></div>
    ))}
    <div data-of="md" className="of-sheet-route"><RouteMidInline form={form} onSwap={onSwap} onMap={onMap} /></div>
  </>);
  if (skin === "cockpit") return (<>
    <div className="of-deco of-pan of-pan1" aria-hidden />
    <div className="of-deco of-pan of-pan2" aria-hidden />
    <div className="of-deco of-pan of-pan3" aria-hidden />
    <div data-of="t1" className="of-pt" aria-hidden>ROUTE · 상하차</div>
    <div data-of="t2" className="of-pt" aria-hidden>CARGO · DRIVER · 화물 · 기사</div>
    <div data-of="t3" className="of-pt" aria-hidden>FARE · 운임</div>
    <div data-of="md" className="of-md-wrap"><RouteMid form={form} onSwap={onSwap} onMap={onMap} dark /></div>
  </>);
  return null;
}
// B 섹션 시트 — 상차 줄 옆에 한 줄짜리 경로
function RouteMidInline({ form, onSwap, onMap }) {
  const r = useDrivingRoute(form?.상차지주소, form?.하차지주소);
  const has = !!(form?.상차지주소 && form?.하차지주소);
  return (
    <div className="of-inl">
      <span className="of-inl-t">상차 → 하차</span>
      <b>{!has ? "주소를 넣으면 거리 · 시간이 나와요" : r === undefined ? "계산 중…" : r ? `${r.km}km · ${dur(r.minutes)}` : "경로를 못 찾았어요"}</b>
      <button type="button" onClick={onSwap}>⇅ 교체</button>
      {has && <button type="button" onClick={onMap}>경로보기</button>}
    </div>
  );
}

const A = (r) => `.of-lay-${r} .kp-order-form`;
const area = (r, names) => names.map((n) => `${A(r)} > [data-of="${n}"]{grid-area:${n}!important;min-width:0}`).join("\n");
const ALL = ["head", "cli", "pn", "pa", "pm", "pc", "dn", "da", "dm", "dc", "cargo", "vk", "ton", "lm", "um", "ss", "plate", "dname", "dphone", "pay", "way", "fsale", "fdrv", "ffee", "memo", "md"];

export const ORDER_LAYOUT_CSS = `
/* ═══════ 공통: 구성형 시안 ═══════ */
.of-lay .kp-order-form > [data-of]{position:relative;z-index:1}
.of-lay .kp-order-form > .of-deco{position:relative;z-index:0;pointer-events:none}
.of-lay .kp-order-form > [data-of]:focus-within{z-index:40}
/* 이름표 없는 칸(회사 기능으로 늘어나는 칸 등)은 맨 아래 한 줄씩 — 시안 칸 사이로 끼어들지 않게 */
.of-lay .kp-order-form > :not([data-of]):not(.of-deco){grid-column:1/-1}
.of-mid{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:4px 0}
.of-mid-ln{flex:1;width:2px;min-height:10px;border-radius:2px;background:linear-gradient(#7C8CF8,#38BDF8);opacity:.55}
.of-mid-box{display:flex;flex-direction:column;align-items:center;gap:1px;padding:8px 10px;border-radius:14px;background:#fff;box-shadow:0 6px 16px rgba(15,26,48,.08),inset 0 0 0 1px #E3E8F0;text-align:center;min-width:92px}
.of-mid-box b{font-size:16px;font-weight:900;color:#0F1A30;font-variant-numeric:tabular-nums}
.of-mid-box span{font-size:12.5px;font-weight:800;color:#3A4A66}
.of-mid-box .of-mid-sub{font-size:11px;font-weight:700;color:#8A97B0;line-height:1.35}
.of-mid-sw{width:34px;height:34px;border-radius:50%;border:1px solid #DCE3EE;background:#fff;color:#1B2B4B;font-size:16px;font-weight:900;cursor:pointer;box-shadow:0 2px 6px rgba(15,26,48,.06)}
.of-mid-sw:hover{background:#1B2B4B;color:#fff}
.of-mid-map{height:28px;padding:0 10px;border-radius:14px;border:1px solid #DCE3EE;background:#fff;color:#1B2B4B;font-size:11.5px;font-weight:800;cursor:pointer}
.of-mid.dark .of-mid-box{background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
.of-mid.dark .of-mid-box b{color:#fff}.of-mid.dark .of-mid-box span{color:#C9D3EE}
.of-mid.dark .of-mid-sw,.of-mid.dark .of-mid-map{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.14);color:#D0D8F0}
.of-fare{border-radius:22px;padding:18px 18px 16px;color:#EEF2FF;background:radial-gradient(380px 160px at 90% -30px,rgba(111,160,255,.35),transparent 70%),linear-gradient(160deg,#0B1428,#14244A);box-shadow:0 18px 40px rgba(11,20,48,.25);display:flex;flex-direction:column;gap:8px;flex-shrink:0}
.of-fare-eye{font-size:10.5px;letter-spacing:2.4px;color:#8FA8FF;font-weight:800}
.of-fare-m{display:flex;justify-content:space-between;align-items:baseline;padding:9px 12px;border-radius:12px;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
.of-fare-m span{font-size:12.5px;color:#93A3C8;font-weight:700}.of-fare-m b{font-size:21px;font-weight:900;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
.of-fare-m.f b{color:#7BE3BE}
.of-fare-hint{font-size:12px;color:#A9B8D6;line-height:1.55;border-top:1px dashed rgba(255,255,255,.15);padding-top:8px}.of-fare-hint b{color:#fff}

/* ═══════ A 루트 보드 — 상차 · 하차 카드 나란히 + 가운데 경로 + 운임 띠(12칸) ═══════ */
${A("route")}{grid-template-columns:repeat(12,minmax(0,1fr))!important;column-gap:12px!important;row-gap:10px!important;grid-template-areas:
 "head head head head head head head head head head head head"
 "cli cli cli cli cli cli pay pay pay way way way"
 "pn pn pa pa pa md md dn dn da da da"
 "pm pm pc pc pc md md dm dm dc dc dc"
 "cargo cargo cargo vk vk vk ton ton lm lm um um"
 "ss ss ss plate plate plate dname dname dname dphone dphone dphone"
 "fsale fsale fsale fsale fdrv fdrv fdrv fdrv ffee ffee ffee ffee"
 "memo memo memo memo memo memo memo memo memo memo memo memo"!important;background:linear-gradient(180deg,#F6F8FC,#F1F4FA)!important;border:0!important;box-shadow:inset 0 0 0 1px #E4E9F2,0 18px 40px rgba(15,26,48,.07)!important}
${area("route", ALL)}
.of-lay-route .of-card-p{grid-row:3/5;grid-column:1/6}
.of-lay-route .of-card-d{grid-row:3/5;grid-column:8/13}
.of-lay-route .of-card-fare{grid-row:7/8;grid-column:1/13}
.of-lay-route .of-card-p,.of-lay-route .of-card-d{border-radius:18px;background:#fff;box-shadow:0 1px 2px rgba(15,26,48,.05),0 12px 26px rgba(15,26,48,.06),inset 0 0 0 1px #E3E8F0;margin:-6px -4px}
.of-lay-route .of-card-p span,.of-lay-route .of-card-d span{position:absolute;left:14px;top:-9px;box-shadow:0 2px 6px rgba(15,26,48,.08);font-size:11px;font-weight:900;padding:2px 9px;border-radius:12px}
.of-lay-route .of-card-p span{background:#EEF2FF;color:#4B5FD0}.of-lay-route .of-card-d span{background:#E8F6FD;color:#0E7FB5}
.of-lay-route .of-card-fare{border-radius:16px;background:linear-gradient(120deg,#0B1428,#14244A 60%,#1F3A6E);margin:-6px -4px;box-shadow:0 12px 28px rgba(11,20,48,.22)}
.of-lay-route .kp-order-form > [data-of^="f"]{padding:2px 6px}
.of-lay-route .kp-order-form > [data-of^="f"] label,.of-lay-route .kp-order-form > [data-of^="f"] > div:first-child,.of-lay-route .kp-order-form > [data-of^="f"] > div:first-child *{color:#C9D3EE!important}
.of-lay-route .kp-order-form > [data-of^="f"] input{background:rgba(255,255,255,.08)!important;border-color:rgba(255,255,255,.18)!important;color:#fff!important;border-radius:10px!important;padding-left:10px!important}
.of-lay-route .kp-order-form > [data-of="pn"],.of-lay-route .kp-order-form > [data-of="pa"],.of-lay-route .kp-order-form > [data-of="dn"],.of-lay-route .kp-order-form > [data-of="da"]{padding-top:18px}
.of-lay-route .kp-order-form > [data-of="cargo"],.of-lay-route .kp-order-form > [data-of="vk"],.of-lay-route .kp-order-form > [data-of="ton"],.of-lay-route .kp-order-form > [data-of="lm"],.of-lay-route .kp-order-form > [data-of="um"],
.of-lay-route .kp-order-form > [data-of="ss"],.of-lay-route .kp-order-form > [data-of="plate"],.of-lay-route .kp-order-form > [data-of="dname"],.of-lay-route .kp-order-form > [data-of="dphone"],.of-lay-route .kp-order-form > [data-of="pay"],.of-lay-route .kp-order-form > [data-of="way"],.of-lay-route .kp-order-form > [data-of="cli"]{background:#fff;border-radius:14px;padding:8px 10px 4px;box-shadow:0 1px 2px rgba(15,26,48,.05),inset 0 0 0 1px #E7ECF4}
.of-lay-route .kp-order-form label{font-size:12px!important;color:#6E7F9F!important;font-weight:800!important}
.of-lay-route .kp-order-cal{border-radius:22px!important}

/* ═══════ B 섹션 시트 — 묶음 제목 줄 + 4칸씩 정렬(12칸) · 흰 종이 ═══════ */
${A("sheet")}{grid-template-columns:repeat(12,minmax(0,1fr))!important;column-gap:14px!important;row-gap:8px!important;grid-template-areas:
 "head head head head head head head head head head head head"
 "h1 h1 h1 h1 h1 h1 h1 h1 h1 h1 h1 h1"
 "cli cli cli cli cli cli pay pay pay way way way"
 "h2 h2 h2 h2 h2 h2 md md md md md md"
 "pn pn pn pa pa pa pm pm pm pc pc pc"
 "h3 h3 h3 h3 h3 h3 h3 h3 h3 h3 h3 h3"
 "dn dn dn da da da dm dm dm dc dc dc"
 "h4 h4 h4 h4 h4 h4 h4 h4 h4 h4 h4 h4"
 "cargo cargo cargo vk vk vk ton ton lm lm um um"
 "h5 h5 h5 h5 h5 h5 h5 h5 h5 h5 h5 h5"
 "ss ss ss plate plate plate dname dname dname dphone dphone dphone"
 "h6 h6 h6 h6 h6 h6 h6 h6 h6 h6 h6 h6"
 "fsale fsale fsale fsale fdrv fdrv fdrv fdrv ffee ffee ffee ffee"
 "memo memo memo memo memo memo memo memo memo memo memo memo"!important;background:#fff!important;border:1px solid #ECEEF2!important;box-shadow:none!important}
${area("sheet", [...ALL, "h1", "h2", "h3", "h4", "h5", "h6"])}
.of-sec{display:flex;align-items:center;gap:10px;margin-top:10px;font-size:12px;font-weight:800;color:#9CA3AF;letter-spacing:.08em}
.of-sec::after{content:"";flex:1;height:1px;background:#F0F1F4}
.of-sheet-route{display:flex;align-items:flex-end;justify-content:flex-end;margin-top:10px}
.of-inl{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#6B7280}
.of-inl b{color:#111827;font-weight:800;font-variant-numeric:tabular-nums}
.of-inl-t{font-weight:700;color:#9CA3AF}
.of-inl button{height:26px;padding:0 10px;border-radius:13px;border:1px solid #E5E7EB;background:#fff;font-size:11.5px;font-weight:800;color:#111827;cursor:pointer}
.of-lay-sheet .kp-order-form input:not([type=checkbox]):not([type=radio]),.of-lay-sheet .kp-order-form textarea{border:1px solid #E5E7EB!important;border-radius:10px!important;background:#fff!important;padding-left:10px!important}
.of-lay-sheet .kp-order-form input:focus,.of-lay-sheet .kp-order-form textarea:focus{border-color:#111827!important;box-shadow:0 0 0 4px rgba(17,24,39,.07)!important}
.of-lay-sheet .kp-order-form label{font-size:12px!important;font-weight:600!important;color:#6B7280!important}
.of-lay-sheet .kp-order-form > [data-of="head"] > div{background:#fff!important;border-bottom:1px solid #F0F1F4}
.of-lay-sheet .kp-order-form > [data-of="head"] > div > span.absolute{display:none!important}
.of-lay-sheet .kp-order-form > [data-of="head"] span{color:#111827!important}
.of-lay-sheet .kp-order-form > [data-of="head"] button{background:#F3F4F6!important;color:#111827!important;border-color:#E5E7EB!important;box-shadow:none!important}

/* ═══════ C 3단 콕핏 — 왼쪽 상하차 · 가운데 화물 · 기사 · 오른쪽 운임(14칸) · 어두운 화면 ═══════ */
.of-lay-cockpit{background:#070C1C;border-radius:26px;padding:14px;color:#E6EDF8}
${A("cockpit")}{grid-template-columns:repeat(14,minmax(0,1fr))!important;column-gap:12px!important;row-gap:10px!important;grid-template-areas:
 "head head head head head head head head head head head head head head"
 "t1 t1 t1 t1 t1 t2 t2 t2 t2 t2 t2 t3 t3 t3"
 "cli cli cli cli cli cargo cargo cargo vk vk vk fsale fsale fsale"
 "pn pn pa pa pa ton ton lm lm um um fdrv fdrv fdrv"
 "pm pm pc pc pc ss ss ss plate plate plate ffee ffee ffee"
 "dn dn da da da dname dname dname dphone dphone dphone pay pay pay"
 "dm dm dc dc dc md md md md md md way way way"
 "memo memo memo memo memo memo memo memo memo memo memo memo memo memo"!important;background:#0C1631!important;border:1px solid rgba(143,168,255,.16)!important;box-shadow:0 20px 48px rgba(3,8,22,.45)!important}
${area("cockpit", [...ALL, "t1", "t2", "t3"])}
.of-lay-cockpit .of-pan1{grid-row:2/8;grid-column:1/6}
.of-lay-cockpit .of-pan2{grid-row:2/8;grid-column:6/12}
.of-lay-cockpit .of-pan3{grid-row:2/8;grid-column:12/15}
.of-lay-cockpit .of-pan{margin:-6px -5px;border-radius:18px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.of-lay-cockpit .of-pan3{background:linear-gradient(170deg,rgba(110,142,255,.14),rgba(255,255,255,.03))}
.of-pt{font-size:10.5px;letter-spacing:2px;font-weight:800;color:#8FA8FF;padding:4px 2px 0}
.of-lay-cockpit .kp-order-card,.of-lay-cockpit .kp-order-cal{background:#0C1631!important;border:1px solid rgba(143,168,255,.16)!important;box-shadow:0 20px 48px rgba(3,8,22,.45)!important}
.of-lay-cockpit .kp-order-form input:not([type=checkbox]):not([type=radio]),.of-lay-cockpit .kp-order-form textarea{background:rgba(0,0,0,.22)!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:10px!important;color:#EEF2FF!important;padding-left:10px!important}
.of-lay-cockpit .kp-order-form input:focus,.of-lay-cockpit .kp-order-form textarea:focus{border-color:#8FA8FF!important;box-shadow:0 0 0 4px rgba(143,168,255,.15)!important}
.of-lay-cockpit .kp-order-form label,.of-lay-cockpit .kp-order-form label *{color:#93A3C8!important}
.of-lay-cockpit .kp-order-form > [data-of="head"] > div{background:linear-gradient(120deg,#060B19,#101E42 60%,#1F3A80)!important}
.of-lay-cockpit .kp-order-card button[class*="bg-[#0F1A30]"]{background:linear-gradient(120deg,#6E8EFF,#8B7BF5)!important;box-shadow:0 8px 22px rgba(110,142,255,.4)!important}

@media (max-width:1279px){${A("route")},${A("sheet")},${A("cockpit")}{column-gap:8px!important}}
`;
