// ======================= src/orderLayouts.jsx =======================
// 🎨 2026-11-27 오더등록 A 루트 보드(모든 계정 기본 · 사용자 요청) — 최고관리자만 [디자인 변경]으로 예전 입력창과 오간다
//  · 입력칸 · 버튼 · 자동완성 · 단축키 · 저장은 원래 코드 그대로 — 칸마다 붙인 이름표(data-of)로 "놓이는 자리"만 바꾼다(CSS grid-template-areas)
//  · 더하는 것: 상차 · 하차 카드 바탕, 가운데 경로(거리 · 예상 시간 · 도착 예상 · 상하차 교체 · 경로보기), 오른쪽 운임 요약 — 보기용
//  · [입력칸 설정]으로 숨긴 칸은 같은 줄 옆 칸이 그 자리를 채운다(routeGrid) — 빈칸이 남지 않게
//  · 모바일 오더등록도 같은 모양(MobileRouteLine · MOBILE_ROUTE_CSS — 상차 · 하차 카드 + 사이 한 줄 거리 · 시간)
import React from "react";
import { getDrivingRoute } from "./tmapFareCalc";

export const LAYOUT_SKINS = new Set(["route", "deck", "k"]); // 🎨 2026-11-27 deck = 밝은 카드형(사용자 시안 · 최고관리자 먼저)

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

// 격자 안에 함께 놓는 장식(카드 바탕 · 가운데 경로) — 입력칸은 건드리지 않는다
//  mid=false 면(상하차 칸을 다 숨김) 카드 · 경로를 그리지 않는다
const K_CARDS = [
  ["p", "상차지", "pin", "1"], ["d", "하차지", "pin", "2"], ["c", "화물 정보", "box"], ["o", "운행 옵션", "route"], ["e", "기타 설정", "grid"],
  ["s", "기사 정보", "id"], ["f", "운임", "won"], ["m", "메모 · 전달사항", "note"],
];
const K_ICON = {
  pin: <><path d="M12 21s-7-6.5-7-12a7 7 0 0114 0c0 5.5-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  box: <><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7M12 11v10" /></>,
  route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h8a3 3 0 000-6H8a3 3 0 010-6h8" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  id: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" /><path d="M5.5 16c.6-1.6 2-2.5 3.5-2.5s2.9.9 3.5 2.5M14 10h4M14 13h4" /></>,
  won: <><circle cx="12" cy="12" r="9" /><path d="M7 9l2 7 3-6 3 6 2-7M6.5 12h11" /></>,
  note: <path d="M4 20h4L19 9l-4-4L4 16v4z" />,
};
export function LayoutDecor({ skin, form, onSwap, onMap, mid = true }) {
  if (skin === "k") return (<>
    {K_CARDS.map(([k]) => <div key={`b${k}`} className={`of-deco of-k-card of-k-card-${k}`} aria-hidden />)}
    {K_CARDS.map(([k, t, ic, n]) => (
      <div key={`h${k}`} className={`of-deco of-k-head of-k-h${k}`} aria-hidden>
        <span className="of-k-ci"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{K_ICON[ic]}</svg></span>
        {n && <span className="of-k-no">{n}</span>}<b>{t}</b>
      </div>))}
  </>);
  if (skin !== "route") return null;
  return (<>
    {mid && <div className="of-deco of-card-p" aria-hidden><span>● 상차</span></div>}
    {mid && <div className="of-deco of-card-d" aria-hidden><span>● 하차</span></div>}
    <div className="of-deco of-card-fare" aria-hidden />
    {mid && <div data-of="md" className="of-md-wrap"><RouteMid form={form} onSwap={onSwap} onMap={onMap} /></div>}
  </>);
}

// ── 숨긴 칸에 맞춘 A 격자 ──
//  줄마다 [묶음 [이름표, 칸 수]] — 숨긴 칸의 자리는 같은 묶음 앞 칸(없으면 뒤 칸)이 차지 · 묶음이 다 숨으면 빈 자리(.)
//  줄의 진짜 입력칸이 다 숨으면 그 줄은 통째로 빠진다
export const FIELD_TAG = { 상차지: "pn", 상차지주소: "pa", 상차지담당자: "pm", 상차지연락처: "pc", 하차지: "dn", 하차지주소: "da", 하차지담당자: "dm", 하차지연락처: "dc", 화물내용: "cargo", 차량종류: "vk", 차량톤수: "ton", 스마트검색: "ss", 차량번호: "plate", 기사명: "dname", 전화번호: "dphone", 상차방법: "lm", 하차방법: "um", 지급방식: "pay", 배차방식: "way", 메모: "memo" };
const ROUTE_ROWS = [
  [[["head", 12]]],
  [[["cli", 6], ["pay", 3], ["way", 3]]],
  [[["pn", 2], ["pa", 3]], [["md", 2]], [["dn", 2], ["da", 3]]],
  [[["pm", 2], ["pc", 3]], [["md", 2]], [["dm", 2], ["dc", 3]]],
  [[["cargo", 3], ["vk", 3], ["ton", 2], ["lm", 2], ["um", 2]]],
  [[["ss", 3], ["plate", 3], ["dname", 3], ["dphone", 3]]],
  [[["fsale", 4], ["fdrv", 4], ["ffee", 4]]],
  [[["memo", 12]]],
];
// 🎨 2026-11-27 D 카드형(deck) — 출발 · 도착 한 줄 → 담당자 → 거래처 · 화물 · 차량 → 운임 · 방법 → 기사 · 배차 → 메모(12칸)
const DECK_ROWS = [
  [[["head", 12]]],
  [[["pn", 3], ["pa", 3]], [["dn", 3], ["da", 3]]],
  [[["pm", 3], ["pc", 3]], [["dm", 3], ["dc", 3]]],
  [[["cli", 4], ["cargo", 3], ["vk", 3], ["ton", 2]]],
  [[["fsale", 2], ["fdrv", 2], ["ffee", 2]], [["pay", 2], ["lm", 2], ["um", 2]]],
  [[["ss", 2], ["plate", 2], ["dname", 2], ["dphone", 2]], [["way", 2], ["closeym", 2]]],
  [[["memo", 12]]],
];
// 🎨 2026-11-27 시안 K(사용자 확정) — 24칸 + 오른쪽 달력 한 칸. 머리줄(h*)은 카드 제목, 카드 바탕은 머리 ~ 마지막 칸까지
const r24 = (...g) => g.flatMap(([n, w]) => Array(w).fill(n)).join(" ");
const K_AREAS = [
  r24(["cli", 9], ["pdate", 3], ["ptime", 6], ["ddate", 3], ["dtime", 4]),
  r24(["k0", 25]),
  r24(["hp", 6], ["pq", 5], ["sw", 2], ["hd", 6], ["dq", 5], ["cal", 1]),
  r24(["pn", 11], ["sw", 2], ["dn", 11], ["cal", 1]),
  r24(["pa", 11], ["sw", 2], ["da", 11], ["cal", 1]),
  r24(["pm", 6], ["pc", 5], ["sw", 2], ["dm", 6], ["dc", 5], ["cal", 1]),
  r24(["k1", 24], ["cal", 1]),
  r24(["hc", 8], ["ho", 8], ["he", 8], ["cal", 1]),
  r24(["cargo", 8], ["opt", 8], ["lm", 4], ["um", 4], ["cal", 1]),
  r24(["vk", 8], ["opt", 8], ["pay", 4], ["way", 4], ["cal", 1]),
  r24(["ton", 8], ["opt", 8], ["closeym", 8], ["cal", 1]),
  r24(["k2", 25]),
  r24(["hs", 8], ["hf", 8], ["hm", 9]),
  r24(["ss", 4], ["plate", 4], ["fsale", 4], ["fdrv", 4], ["memo", 9]),
  r24(["dname", 4], ["dphone", 4], ["ffee", 8], ["memo", 9]),
  r24(["save", 25]),
];
export function routeGrid(hiddenKeys, skin = "route") {
  if (skin === "k") {
    // 🎨 2026-11-27 위 줄은 늘 두 줄 — 상차 일시 아래 하차 일시(시간 · 이전/이후가 커져도 겹치지 않게)
    const rows = [r24(["cli", 11], ["pdate", 3], ["ptime", 7], ["ddate", 3], ["dtime", 1]), ...K_AREAS.slice(1)];
    return { css: `${A("k")}{grid-template-areas:${rows.map((r) => `"${r}"`).join(" ")}!important}`, mid: false };
  }
  const off = new Set([...(hiddenKeys || [])].map((k) => FIELD_TAG[k]).filter(Boolean));
  const rows = [];
  for (const row of (skin === "deck" ? DECK_ROWS : ROUTE_ROWS)) {
    if (!row.flat().some(([n]) => n !== "md" && !off.has(n))) continue;
    const cells = [];
    for (const grp of row) {
      const vis = grp.filter(([n]) => !off.has(n));
      if (!vis.length) { grp.forEach(([, w]) => { for (let k = 0; k < w; k++) cells.push("."); }); continue; }
      const span = new Map(vis.map(([n, w]) => [n, w]));
      grp.forEach(([n, w], idx) => {
        if (!off.has(n)) return;
        const to = (grp.slice(0, idx).reverse().find(([m]) => !off.has(m)) || vis[0])[0];
        span.set(to, span.get(to) + w);
      });
      grp.forEach(([n]) => { if (span.has(n)) for (let k = 0; k < span.get(n); k++) cells.push(n); });
    }
    rows.push(cells);
  }
  const firstCard = rows.find((r) => r.includes("md"));
  const top = firstCard ? [...new Set(firstCard.filter((n) => n !== "md" && n !== "."))] : [];
  if (skin === "deck") return { css: `${A("deck")}{grid-template-areas:${rows.map((r) => `"${r.join(" ")}"`).join(" ")}!important}`, mid: false };
  const css = `${A("route")}{grid-template-areas:${rows.map((r) => `"${r.join(" ")}"`).join(" ")}!important}
${top.length ? `${top.map((n) => `.of-lay-route .kp-order-form > [data-of="${n}"]`).join(",")}{padding-top:18px}` : ""}`;
  return { css, mid: !!firstCard };
}

// ── 🗓 2026-11-27 기본 입력창 1안(사용자 선택) — [상·하차 교체] 버튼 하나에 거리 · 시간 · 도착 예상 · 경로보기를 합친다 ──
//  주소가 둘 다 없으면 지금처럼 [상·하차 교체]만 보인다
export function SwapRouteButton({ form, onSwap, onMap }) {
  const r = useDrivingRoute(form?.상차지주소, form?.하차지주소);
  const has = !!(form?.상차지주소 && form?.하차지주소);
  const eta = r && form?.상차시간 ? addMin(form.상차시간, r.minutes) : "";
  return (
    <span className="ml-2 inline-flex items-center h-8 rounded-xl border border-[#1B2B4B] bg-white text-[#1B2B4B] overflow-hidden max-w-full" data-testid="swap-route">
      <button type="button" onClick={onSwap} title="상차지 ↔ 하차지 교체"
        className="inline-flex items-center gap-1.5 h-full px-3 text-[12px] font-extrabold hover:bg-[#1B2B4B] hover:text-white active:scale-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B2B4B]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" /></svg>상·하차 교체
      </button>
      {has && (<>
        <span className="w-px h-4 bg-[#DCE3EE]" />
        {/* 🧭 2026-11-27 사용자 요청 — 거리 · 시간 · 도착 글자는 빼고 [경로보기]만(날짜 줄이 한 줄을 넘지 않게). 거리는 말풍선으로 */}
        <button type="button" onClick={onMap} title={r ? `${r.km}km · ${dur(r.minutes)}${eta ? ` · 도착 ${eta}` : ""}` : "경로보기"} className="h-6 mx-1 px-2 rounded-lg bg-[#1B2B4B] text-white text-[11.5px] font-black hover:bg-[#0F1A30]">경로보기</button>
      </>)}
    </span>
  );
}

// ── 모바일 A 루트 보드 — 상차 카드와 하차 카드 사이 한 줄(교체 · 거리 · 시간 · 도착 · 경로보기) ──
export function MobileRouteLine({ form, onSwap, onMap }) {
  const r = useDrivingRoute(form?.상차지주소, form?.하차지주소);
  const has = !!(form?.상차지주소 && form?.하차지주소);
  const eta = r && form?.상차시간 ? addMin(form.상차시간, r.minutes) : "";
  return (
    <div className="kp-m-rline" data-testid="m-route-line">
      <button type="button" className="kp-m-rline-sw" onClick={onSwap} title="상차지 ↔ 하차지 교체" aria-label="상차지 하차지 교체">⇅</button>
      <span className="kp-m-rline-ln" />
      <span className="kp-m-rline-box">
        {!has ? <em>주소를 넣으면 거리 · 시간이 나와요</em>
          : r === undefined ? <em>계산 중…</em>
          : r ? <><b>{r.km}km</b><i>{dur(r.minutes)}</i>{eta && <em>도착 {eta}</em>}</>
          : <em>경로를 못 찾았어요</em>}
      </span>
      <span className="kp-m-rline-ln" />
      {has && <button type="button" className="kp-m-rline-map" onClick={onMap}>경로보기</button>}
    </div>
  );
}
// 상차 · 하차 사이 한 줄(⇅ 교체 + 거리 · 시간) — 🗓 2026-11-27 기본 입력창에도 쓴다
export const MOBILE_RLINE_CSS = `
.kp-m-rline{display:flex;align-items:center;gap:6px;margin:2px 4px!important}
.kp-m-rline-sw{width:30px;height:30px;flex-shrink:0;border-radius:50%;border:0;background:#1B2B4B;color:#fff;font-size:15px;font-weight:900;box-shadow:0 2px 6px rgba(15,26,48,.08)}
.kp-m-rline-sw:active{background:#0F1A30;transform:scale(.92)}
.kp-m-rline-ln{flex:1;height:2px;min-width:8px;border-radius:2px;background:linear-gradient(90deg,#7C8CF8,#38BDF8);opacity:.5}
.kp-m-rline-box{display:flex;align-items:baseline;gap:6px;padding:5px 11px;border-radius:13px;background:#fff;box-shadow:0 4px 12px rgba(15,26,48,.07),inset 0 0 0 1px #E3E8F0;white-space:nowrap}
.kp-m-rline-box b{font-size:14.5px;font-weight:900;color:#0F1A30;font-variant-numeric:tabular-nums}
.kp-m-rline-box i{font-style:normal;font-size:12.5px;font-weight:800;color:#3A4A66}
.kp-m-rline-box em{font-style:normal;font-size:11.5px;font-weight:700;color:#8A97B0}
.kp-m-rline-map{height:28px;flex-shrink:0;padding:0 10px;border-radius:14px;border:1px solid #DCE3EE;background:#fff;color:#1B2B4B;font-size:11.5px;font-weight:800}
`;
export const MOBILE_ROUTE_CSS = `
.kp-m-route .kp-m-pd{background:#F3F6FB;padding:12px 10px!important}
.kp-m-route .kp-m-pd > .kp-m-card-p,.kp-m-route .kp-m-pd > .kp-m-card-d{position:relative;border-radius:16px;background:#fff;border:0!important;box-shadow:0 1px 2px rgba(15,26,48,.05),0 10px 22px rgba(15,26,48,.06),inset 0 0 0 1px #E3E8F0}
.kp-m-route .kp-m-pd > .kp-m-card-p > div:first-child{background:#EEF2FF!important;color:#4B5FD0!important;border-radius:16px 0 0 16px}
.kp-m-route .kp-m-pd > .kp-m-card-d > div:first-child{background:#E8F6FD!important;color:#0E7FB5!important;border-radius:16px 0 0 16px}
`;

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
${A("route")}{grid-template-columns:repeat(12,minmax(0,1fr))!important;column-gap:12px!important;row-gap:10px!important;background:linear-gradient(180deg,#F6F8FC,#F1F4FA)!important;border:0!important;box-shadow:inset 0 0 0 1px #E4E9F2,0 18px 40px rgba(15,26,48,.07)!important}
${area("route", ALL)}
/* 카드 바탕은 가운데 경로(md) · 운임(fsale) 자리를 기준으로 — 숨긴 칸 때문에 줄이 빠져도 따라간다 */
.of-lay-route .of-card-p{grid-row:md-start/md-end;grid-column:1/md-start}
.of-lay-route .of-card-d{grid-row:md-start/md-end;grid-column:md-end/-1}
.of-lay-route .of-card-fare{grid-row:fsale-start/fsale-end;grid-column:1/-1}
.of-lay-route .of-card-p,.of-lay-route .of-card-d{border-radius:18px;background:#fff;box-shadow:0 1px 2px rgba(15,26,48,.05),0 12px 26px rgba(15,26,48,.06),inset 0 0 0 1px #E3E8F0;margin:-6px -4px}
.of-lay-route .of-card-p span,.of-lay-route .of-card-d span{position:absolute;left:14px;top:-9px;box-shadow:0 2px 6px rgba(15,26,48,.08);font-size:11px;font-weight:900;padding:2px 9px;border-radius:12px}
.of-lay-route .of-card-p span{background:#EEF2FF;color:#4B5FD0}.of-lay-route .of-card-d span{background:#E8F6FD;color:#0E7FB5}
.of-lay-route .of-card-fare{border-radius:16px;background:linear-gradient(120deg,#0B1428,#14244A 60%,#1F3A6E);margin:-6px -4px;box-shadow:0 12px 28px rgba(11,20,48,.22)}
.of-lay-route .kp-order-form > [data-of^="f"]{padding:2px 6px}
.of-lay-route .kp-order-form > [data-of^="f"] label,.of-lay-route .kp-order-form > [data-of^="f"] > div:first-child,.of-lay-route .kp-order-form > [data-of^="f"] > div:first-child *{color:#C9D3EE!important}
.of-lay-route .kp-order-form > [data-of^="f"] input{background:rgba(255,255,255,.08)!important;border-color:rgba(255,255,255,.18)!important;color:#fff!important;border-radius:10px!important;padding-left:10px!important}
.of-lay-route .kp-order-form > [data-of="cargo"],.of-lay-route .kp-order-form > [data-of="vk"],.of-lay-route .kp-order-form > [data-of="ton"],.of-lay-route .kp-order-form > [data-of="lm"],.of-lay-route .kp-order-form > [data-of="um"],
.of-lay-route .kp-order-form > [data-of="ss"],.of-lay-route .kp-order-form > [data-of="plate"],.of-lay-route .kp-order-form > [data-of="dname"],.of-lay-route .kp-order-form > [data-of="dphone"],.of-lay-route .kp-order-form > [data-of="pay"],.of-lay-route .kp-order-form > [data-of="way"],.of-lay-route .kp-order-form > [data-of="cli"]{background:#fff;border-radius:14px;padding:8px 10px 4px;box-shadow:0 1px 2px rgba(15,26,48,.05),inset 0 0 0 1px #E7ECF4}
.of-lay-route .kp-order-form label{font-size:12px!important;color:#6E7F9F!important;font-weight:800!important}
.of-lay-route .kp-order-form > [data-of="pn"],.of-lay-route .kp-order-form > [data-of="pa"],.of-lay-route .kp-order-form > [data-of="pm"],.of-lay-route .kp-order-form > [data-of="pc"],.of-lay-route .kp-order-form > [data-of="dn"],.of-lay-route .kp-order-form > [data-of="da"],.of-lay-route .kp-order-form > [data-of="dm"],.of-lay-route .kp-order-form > [data-of="dc"]{padding-left:8px;padding-right:8px}
.of-lay-route .kp-order-cal{border-radius:22px!important}

@media (max-width:1279px){${A("route")}{column-gap:8px!important}}

/* ═══════ D 카드형(deck) — 밝은 흰 카드 · 박스 입력칸 · 연한 머리줄(사용자 시안 2026-11-27) ═══════ */
.of-skin-deck{background:linear-gradient(180deg,#F4F7FC,#EEF2F8);border-radius:26px;padding:14px;box-shadow:inset 0 0 0 1px #E6EBF3}
.of-skin-deck .kp-order-card{border-radius:20px!important;border:1px solid #E6EBF3!important;box-shadow:0 1px 2px rgba(16,24,40,.04),0 10px 26px rgba(16,24,40,.05)!important;margin-bottom:12px}
.of-skin-deck .kp-order-card > div:first-child{background:#fff!important;border-bottom:1px solid #EEF2F8!important}
.of-skin-deck .kp-order-card button{border-radius:11px!important}
.of-skin-deck .kp-date-row{padding:12px 16px!important;background:#FAFBFD}
${A("deck")}{grid-template-columns:repeat(12,minmax(0,1fr))!important;column-gap:14px!important;row-gap:14px!important;background:#fff!important;border:1px solid #E6EBF3!important;border-radius:20px!important;box-shadow:0 1px 2px rgba(16,24,40,.04),0 10px 26px rgba(16,24,40,.05)!important;padding:0 22px 22px!important}
${area("deck", [...ALL.filter((n) => n !== "md"), "closeym"])}
/* 머리줄 — 남색 띠 대신 흰 바탕 · 남색 글씨 · 알약 버튼 */
.of-lay-deck .kp-order-form > [data-of="head"]{margin:0 -22px 4px!important}
.of-lay-deck .kp-order-form > [data-of="head"] > div{background:#fff!important;border-bottom:1px solid #EEF2F8;padding:14px 22px!important}
.of-lay-deck .kp-order-form > [data-of="head"] > div > span:first-child{display:none}
.of-lay-deck .kp-order-form > [data-of="head"] > div > span span{color:#0F1A30!important}
.of-lay-deck .kp-order-form > [data-of="head"] span.text-\[10px\]{color:#2D4C82!important}
.of-lay-deck .kp-order-form > [data-of="head"] button{background:#F1F4F9!important;color:#1B2B4B!important;border:1px solid #E3E8F0!important;box-shadow:none!important}
.of-lay-deck .kp-order-form > [data-of="head"] button:first-child{background:#0F1A30!important;color:#fff!important;border-color:#0F1A30!important}
.of-lay-deck .kp-order-form > [data-of="head"] button:first-child *{color:#fff!important}
/* 입력칸 — 박스형 · 연한 바탕 · 누르면 남색 테두리 */
.of-lay-deck .kp-order-form label{font-size:12px!important;color:#5B6B85!important;font-weight:800!important;margin-bottom:6px!important}
.of-lay-deck .kp-order-form input:not([type=checkbox]):not([type=radio]),.of-lay-deck .kp-order-form select{height:40px!important;border:1px solid #DCE3EE!important;border-radius:10px!important;background:#F8FAFD!important;padding-left:12px!important;font-size:14px!important;box-shadow:none!important}
.of-lay-deck .kp-order-form input:focus,.of-lay-deck .kp-order-form select:focus{border-color:#1B2B4B!important;background:#fff!important;box-shadow:0 0 0 3px rgba(45,76,130,.12)!important;outline:none!important}
.of-lay-deck .kp-order-form textarea{border-radius:12px!important;background:#F8FAFD!important}
.of-lay-deck .kp-order-form > [data-of="fsale"] input,.of-lay-deck .kp-order-form > [data-of="fdrv"] input,.of-lay-deck .kp-order-form > [data-of="ffee"] input{text-align:right;font-variant-numeric:tabular-nums;font-weight:800!important}
/* 출발(상차) · 도착(하차) 칸 앞에 작은 점 */
.of-lay-deck .kp-order-form > [data-of="pn"] label::before,.of-lay-deck .kp-order-form > [data-of="dn"] label::before{content:"";display:inline-block;width:8px;height:8px;border-radius:8px;margin-right:6px;vertical-align:1px;border:2px solid #1B2B4B}
.of-lay-deck .kp-order-form > [data-of="dn"] label::before{background:#1B2B4B}
.of-lay-deck .kp-order-cal{border-radius:20px!important}
@media (max-width:1279px){${A("deck")}{column-gap:10px!important}}

/* ═══════ K 카드형(사용자 확정 2026-11-27) — 24칸 + 달력 칸 · 카드 바탕 · 카드 제목 · 박스형 입력칸 ═══════ */
.of-skin-k{display:flex!important;align-items:flex-start!important;gap:16px!important}
.of-skin-k .kp-order-card{border:0!important;box-shadow:none!important;background:transparent!important;overflow:visible!important}
${A("k")}{grid-template-columns:repeat(24,minmax(0,1fr)) 300px!important;column-gap:18px!important;row-gap:8px!important;grid-template-rows:auto 6px repeat(4,auto) 6px repeat(4,auto) 6px repeat(3,auto) auto!important;grid-auto-rows:auto;background:#F8FAFD!important;border:1px solid #E1E7F0!important;border-radius:18px!important;padding:14px 22px 18px!important;box-shadow:0 1px 2px rgba(16,24,40,.04),0 18px 40px rgba(16,24,40,.07)!important;overflow:visible!important}
.of-lay-k .kp-order-form > [data-of] label{margin-bottom:3px!important}
.of-lay-k .kp-order-form input:not([type=checkbox]):not([type=radio]){min-height:34px!important;height:34px!important}
.of-lay-k .kp-order-form textarea{min-height:64px!important}
${area("k", [...ALL.filter((n) => n !== "md" && n !== "head"), "closeym", "pdate", "ptime", "ddate", "dtime", "pq", "dq", "sw", "cal", "opt", "save"])}
.of-lay-k .kp-order-form > [data-of="head"]{display:none!important}
.of-lay-k .of-k-dates,.of-lay-k .of-k-dates > .kp-date-row{display:contents!important}
.of-lay-k .kp-date-row > [data-of]{grid-area:var(--a)!important;min-width:0;position:relative;z-index:1}
.of-lay-k .kp-date-row > [data-of="pdate"]{--a:pdate}.of-lay-k .kp-date-row > [data-of="ptime"]{--a:ptime}
.of-lay-k .kp-date-row > [data-of="ddate"]{--a:ddate}.of-lay-k .kp-date-row > [data-of="dtime"]{--a:dtime}
.of-lay-k .kp-date-row > [data-of="pq"]{--a:pq;justify-self:end;align-self:center}.of-lay-k .kp-date-row > [data-of="dq"]{--a:dq;justify-self:end;align-self:center}
.of-lay-k .kp-date-row > [data-of="ptime"],.of-lay-k .kp-date-row > [data-of="dtime"]{zoom:.86}
.of-lay-k .kp-order-form > [data-of="opt"] button{white-space:nowrap!important}
.of-lay-k [data-k-farehint]{display:grid!important;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:3px 10px!important;width:100%;box-sizing:border-box;padding:9px 12px!important;border-radius:12px!important;margin-top:10px!important}
.of-lay-k [data-k-farehint]>*{min-width:0;margin:0!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.of-lay-k [data-k-farehint]>[data-fh="route"]{grid-column:1;grid-row:1;font-size:13px}
.of-lay-k [data-k-farehint]>[data-fh="range"]{grid-column:2;grid-row:1;font-size:13.5px;text-align:right}
.of-lay-k [data-k-farehint]>[data-fh="basis"]{grid-column:1;grid-row:2;font-size:11.5px!important}
.of-lay-k [data-k-farehint]>[data-fh="btn"]{grid-column:2;grid-row:2;justify-self:end}
.of-lay-k [data-k-farehint]>[data-fh="tmap"]{grid-column:1 / -1;grid-row:3;border:0!important;padding:0!important;font-size:11px!important}
.of-lay-k .kp-order-form > [data-of="opt"] [role=group] button{padding-left:10px!important;padding-right:10px!important}
.of-lay-k .kp-date-row > [data-of="sw"]{--a:sw;align-self:center;justify-self:center}
.of-lay-k .kp-date-row > [data-k-hide]{display:none!important}
.of-lay-k .kp-date-row > [data-of="pdate"],.of-lay-k .kp-date-row > [data-of="ptime"],.of-lay-k .kp-date-row > [data-of="ddate"],.of-lay-k .kp-date-row > [data-of="dtime"]{padding-top:24px;display:flex;align-items:center;gap:6px}
.of-lay-k .kp-date-row > [data-of="pdate"],.of-lay-k .kp-date-row > [data-of="ddate"]{justify-self:end}
.of-lay-k .kp-order-form > [data-of="save"]{margin:4px 0 0!important;padding:10px 0 0!important;border-top:1px solid #E6EBF3!important;align-items:center}
.of-lay-k .kp-order-form > [data-of="save"] button[type=submit]{height:46px!important;padding:0 40px!important;font-size:15.5px!important;border-radius:12px!important;background:linear-gradient(135deg,#0F1A30,#1B2B4B 55%,#2D4C82)!important;box-shadow:0 10px 22px rgba(15,26,48,.3)!important}
.of-lay-k .kp-date-row > [data-of="pdate"]::before,.of-lay-k .kp-date-row > [data-of="ddate"]::before{position:absolute;top:0;left:0;font-size:12px;font-weight:800;color:#2A3852;white-space:nowrap}
.of-lay-k .kp-date-row > [data-of="pdate"]::before{content:"상차 일시 *"}.of-lay-k .kp-date-row > [data-of="ddate"]::before{content:"하차 일시 *"}
/* 상 · 하차 교체 — 가운데 세로 */
.of-lay-k [data-of="sw"] [data-testid="swap-route"]{flex-direction:column;height:auto!important;border-radius:16px!important;padding:8px 4px;gap:6px;margin:0!important;border-color:#DCE2EC!important;box-shadow:0 8px 18px rgba(15,26,48,.08)}
.of-lay-k [data-of="sw"] [data-testid="swap-route"] > span.w-px{display:none}
.of-lay-k [data-of="sw"] [data-testid="swap-route"] > button:first-child{flex-direction:column;padding:4px 6px!important;text-align:center;line-height:1.3;white-space:normal;word-break:keep-all;width:64px}
/* 카드 바탕 · 제목 */
.of-lay-k .of-k-card{position:relative;border-radius:16px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.04),0 6px 18px rgba(16,24,40,.04),inset 0 0 0 1px #E4E9F2;margin:-10px -7px -10px}
.of-lay-k .of-k-card-p{grid-row:hp-start/pm-end;grid-column:hp-start/pq-end}
.of-lay-k .of-k-card-d{grid-row:hd-start/dm-end;grid-column:hd-start/dq-end}
.of-lay-k .of-k-card-c{grid-row:hc-start/ton-end;grid-column:hc-start/hc-end}
.of-lay-k .of-k-card-o{grid-row:ho-start/opt-end;grid-column:ho-start/ho-end}
.of-lay-k .of-k-card-e{grid-row:he-start/closeym-end;grid-column:he-start/he-end}
.of-lay-k .of-k-card-s{grid-row:hs-start/dphone-end;grid-column:hs-start/hs-end}
.of-lay-k .of-k-card-f{grid-row:hf-start/ffee-end;grid-column:hf-start/hf-end}
.of-lay-k .of-k-card-m{grid-row:hm-start/memo-end;grid-column:hm-start/hm-end}
.of-lay-k .of-k-head{display:flex;align-items:center;gap:8px;min-height:26px}
.of-lay-k .of-k-hp{grid-area:hp}.of-lay-k .of-k-hd{grid-area:hd}.of-lay-k .of-k-hc{grid-area:hc}.of-lay-k .of-k-ho{grid-area:ho}.of-lay-k .of-k-he{grid-area:he}.of-lay-k .of-k-hs{grid-area:hs}.of-lay-k .of-k-hf{grid-area:hf}.of-lay-k .of-k-hm{grid-area:hm}
.of-lay-k .of-k-head b{font-size:14.5px;font-weight:900;letter-spacing:-.02em;color:#0F1A30}
.of-lay-k .of-k-ci{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#0F1A30,#2D4C82);display:inline-grid;place-items:center;box-shadow:0 3px 8px rgba(15,26,48,.25)}
.of-lay-k .of-k-no{width:20px;height:20px;border-radius:20px;background:#EEF3FB;color:#1B2B4B;display:inline-grid;place-items:center;font-size:11px;font-weight:900;border:1px solid #C9D6EC}
/* 입력칸 — 박스형 */
.of-lay-k .kp-order-form label{font-size:12px!important;color:#2A3852!important;font-weight:800!important}
.of-lay-k .kp-order-form input:not([type=checkbox]):not([type=radio]),.of-lay-k .kp-order-form select{border:1px solid #DCE2EC!important;border-radius:10px!important;background:#fff!important;padding-left:11px!important;box-shadow:none!important}
.of-lay-k .kp-order-form input::placeholder,.of-lay-k .kp-order-form textarea::placeholder{color:#7F8BA0!important}
.of-lay-k .kp-order-form input:focus,.of-lay-k .kp-order-form select:focus{border-color:#1B2B4B!important;box-shadow:0 0 0 3px rgba(45,76,130,.12)!important;outline:none!important}
.of-lay-k .kp-order-form > [data-of="fsale"] input,.of-lay-k .kp-order-form > [data-of="fdrv"] input,.of-lay-k .kp-order-form > [data-of="ffee"] input{text-align:right;font-variant-numeric:tabular-nums;font-weight:800!important}
.of-lay-k .kp-order-form > [data-of="memo"]{grid-template-columns:1fr 1fr!important;gap:10px!important}
.of-lay-k .kp-order-form > [data-of="memo"] span[class*="tracking-[0.26em]"]{display:none!important}
.of-lay-k .kp-order-form > [data-of="memo"] > section{min-width:0}
.of-lay-k .kp-order-form > [data-of="memo"] header{min-width:0;padding-left:12px!important;padding-right:10px!important;gap:6px!important}
.of-lay-k .kp-order-form > [data-of="memo"] button{white-space:nowrap!important}
.of-lay-k .kp-order-form > [data-of="memo"] textarea{min-height:56px!important}
.of-lay-k .kp-order-form > [data-of="ss"] textarea{min-height:34px!important;height:34px!important}
.of-lay-k .kp-order-form > [data-of="cli"].grid{grid-template-columns:minmax(150px,.9fr) minmax(0,1.5fr)!important}
.of-lay-k .kp-date-row > [data-of="ptime"],.of-lay-k .kp-date-row > [data-of="dtime"]{flex-wrap:nowrap;overflow:visible}
.of-lay-k .kp-order-form > [data-of="cal"]{align-self:stretch;min-height:0;display:flex}
.of-lay-k .kp-order-form > [data-of="opt"]{display:flex;flex-direction:column;gap:10px;align-items:stretch}
.of-lay-k .kp-order-form > [data-of="opt"] [data-testid="order-run-options"]{display:none!important}

/* 위쪽 띠 · 배차 옵션 · 달력 카드 */
.of-k-banner{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;background:#fff;border:1px solid #E1E7F0;border-radius:18px;padding:10px 14px;margin-bottom:10px;box-shadow:0 1px 2px rgba(16,24,40,.04),0 12px 28px rgba(16,24,40,.06)}
.of-k-banner .of-k-quick [data-kp="quick-order"]{margin-bottom:0!important}
.of-k-tabs{display:flex;gap:8px}
.of-k-tab{height:40px;display:inline-flex;align-items:center;gap:8px;padding:0 18px;border-radius:12px;font-size:14px;font-weight:800;color:#3A4A66;background:#fff;border:1px solid #E1E7F0;white-space:nowrap;transition:all .15s}
.of-k-tab:hover{border-color:#1B2B4B;color:#0F1A30}
.of-k-tab.on{background:linear-gradient(135deg,#0F1A30,#1B2B4B 60%,#2D4C82);color:#fff;border-color:#0F1A30;box-shadow:0 8px 18px rgba(15,26,48,.25)}
.of-lay-k .kp-order-card > div:first-child{background:#fff!important;border:1px solid #E1E7F0!important;border-radius:16px;margin-bottom:10px;padding:8px 14px!important;min-height:0!important;box-shadow:0 1px 2px rgba(16,24,40,.04),0 6px 18px rgba(16,24,40,.04)}
.of-k-calcard{flex:1;display:flex;flex-direction:column;background:#fff;border-radius:16px;padding:14px 16px 12px;box-shadow:0 1px 2px rgba(16,24,40,.04),0 6px 18px rgba(16,24,40,.04),inset 0 0 0 1px #E4E9F2;margin:-10px 0 -12px}
.of-k-calcard .of-k-head{display:flex;align-items:center;gap:8px}
.of-k-calcard .of-k-head b{font-size:14.5px;font-weight:900;color:#0F1A30}
.of-k-calcard .kp-order-cal-deck{flex:1;display:flex;flex-direction:column}
.of-k-calcard .kp-order-cal-deck > .grid.grid-cols-7{flex:1;align-content:space-evenly}
/* 배차 옵션 줄(오더등록 위) */
.of-lay-k [data-k-hide]{display:none!important}
`;
