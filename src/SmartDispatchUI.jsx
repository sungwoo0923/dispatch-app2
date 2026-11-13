// src/SmartDispatch.jsx — 배차를 빠르게 하는 화면 조각 3가지 (2026-11-13)
//  ① TodayTodo       : 홈 맨 위 "오늘 할 일" — 숫자를 누르면 그 화면으로
//  ② QuickOrderLine  : 오더등록 맨 위 한 줄 — "내일 대한 평택 5톤" → 지난 노선을 골라 한 번에 채움
//  ③ DriverSuggest   : 미배차현황 "추천 기사" — 같은 구간을 뛰어 본 기사를 눌러 바로 배정
import React from "react";
import { createPortal } from "react-dom";
import { readHistoryCache } from "./orderHistoryCache";
import { getTenant } from "./fsTenant";
import { parseQuickLine, buildRoutes, findRoutes, suggestDrivers, busyByDate, todayTodo, slimOrder, ymd } from "./smartDispatch";

const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' };
const won = (v) => { const n = parseInt(String(v || "").replace(/[^\d-]/g, ""), 10); return n > 0 ? n.toLocaleString() : ""; };
const md = (s) => (s && s.length >= 10 ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : "");

// ───────── PC에 보관된 지난 13개월 오더(있을 때만) + 지금 화면의 오더 ─────────
let _hist = { co: "", rows: null, at: 0, p: null };
export function useOrderHistoryLite(liveRows, userCompany = "") {
  const co = String(getTenant() || userCompany || (typeof localStorage !== "undefined" && localStorage.getItem("userCompany")) || "").trim();
  const [past, setPast] = React.useState(() => (_hist.co === co && _hist.rows ? _hist.rows : null));
  React.useEffect(() => {
    let alive = true;
    if (!co) return undefined;
    if (_hist.co === co && _hist.rows && Date.now() - _hist.at < 10 * 60000) { setPast(_hist.rows); return undefined; }
    if (!(_hist.co === co && _hist.p)) {
      _hist = { co, rows: null, at: 0, p: readHistoryCache(co).then((c) => {
        const rows = (c?.docs || []).map((x) => slimOrder({ ...x.data, _id: x.id, __col: x.col }));
        _hist = { co, rows, at: Date.now(), p: null };
        return rows;
      }).catch(() => { _hist = { co, rows: [], at: Date.now(), p: null }; return []; }) };
    }
    _hist.p?.then((rows) => { if (alive) setPast(rows); });
    return () => { alive = false; };
  }, [co]);
  return React.useMemo(() => {
    const live = liveRows || [];
    if (!past || !past.length) return live;
    const seen = new Set(live.map((r) => r._id));
    return live.concat(past.filter((r) => !seen.has(r._id)));
  }, [liveRows, past]);
}

// ══════════════════════ ① 오늘 할 일 ══════════════════════
// 홈 관제 데크(남색) 안에 한 줄로 들어간다 — 데크 타일과 같은 결(반투명 남색 · 가는 테두리)
const TD = { sub: "rgba(207,224,255,.8)", dim: "rgba(207,224,255,.6)", line: "rgba(143,176,240,.16)", glow: "#8FB0F0", warn: "#FF9C8F", amber: "#F2C879" };
export function TodayTodo({ rows = [], onGo }) {
  const t = React.useMemo(() => todayTodo(rows, ymd(new Date())), [rows]);
  const fare = t.noFare + t.noDriverFare;
  const cells = [
    { k: "unassigned", code: "PENDING", label: "미배차", n: t.unassigned, tone: t.unassigned ? TD.warn : "#fff",
      sub: t.unassigned ? ([t.unassignedToday ? `오늘 상차 ${t.unassignedToday}건` : "", t.overdue ? `상차일 경과 ${t.overdue}건` : ""].filter(Boolean).join(" · ") || "배차 대기") : "전건 배차 완료", go: "배차현황:미배차현황" },
    { k: "today", code: "TODAY", label: "오늘 상차", n: t.today, tone: "#fff",
      sub: t.today ? `배차 완료 ${t.todayDone} / ${t.today}` : "오늘 상차 오더 없음", bar: t.today ? t.todayDone / t.today : null, go: "실시간배차현황" },
    { k: "tomorrow", code: "TOMORROW", label: "내일 상차", n: t.tomorrow, tone: "#fff",
      sub: t.tomorrowOpen ? `미배차 ${t.tomorrowOpen}건` : t.tomorrow ? "전건 배차 완료" : "내일 상차 오더 없음", warn: !!t.tomorrowOpen, go: "배차현황:미배차현황" },
    { k: "fare", code: "FARE", label: "운임 미입력", n: fare, tone: fare ? TD.amber : "#fff",
      sub: fare ? `청구 ${t.noFare} · 기사 ${t.noDriverFare} (최근 30일)` : "미입력 없음", go: "배차현황:배차현황" },
  ];
  return (
    <div data-kp="today-todo" style={{ position: "relative", display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 6px 0 2px", minWidth: 84 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", color: TD.glow }}>TO-DO</span>
        <span style={{ fontSize: 15, fontWeight: 900, color: "#fff", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>업무 현황</span>
      </div>
      {cells.map((c) => (
        <button key={c.k} type="button" onClick={() => onGo?.(c.go)} title={`${c.label} 화면 열기`} className="hd-tile kp-todo"
          style={{ flex: "1 1 190px", minWidth: 0, borderRadius: 14, padding: "9px 14px", display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer", position: "relative", overflow: "hidden" }}>
          <span style={{ ...NUM, fontSize: 26, fontWeight: 800, lineHeight: 1, color: c.tone, letterSpacing: "-0.02em", minWidth: 34, textAlign: "right" }}>{c.n.toLocaleString()}</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: TD.sub, whiteSpace: "nowrap" }}>{c.label}</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.16em", color: "rgba(207,224,255,.38)" }}>{c.code}</span>
            </span>
            <span style={{ ...NUM, display: "block", marginTop: 2, fontSize: 12, fontWeight: 600, color: c.warn ? TD.warn : TD.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</span>
          </span>
          <span className="kp-todo-go" style={{ fontSize: 13, color: "rgba(207,224,255,.4)" }}>→</span>
          {c.bar !== null && c.bar !== undefined && <span style={{ position: "absolute", left: 0, bottom: 0, height: 2, width: `${Math.round(c.bar * 100)}%`, background: TD.glow, opacity: 0.8 }} />}
        </button>
      ))}
      <style>{`.kp-todo:hover .kp-todo-go{color:#fff;transform:translateX(2px)} .kp-todo-go{transition:transform .15s,color .15s} .kp-todo:focus-visible{outline:2px solid #8FB0F0;outline-offset:2px}`}</style>
    </div>
  );
}

// ══════════════════════ ② 한 줄 빠른 등록 ══════════════════════
export function QuickOrderLine({ rows = [], userCompany = "", canMoney = false, onApply }) {
  const all = useOrderHistoryLite(rows, userCompany);
  const routes = React.useMemo(() => buildRoutes(all), [all]);
  const [text, setText] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [idx, setIdx] = React.useState(0);
  const ref = React.useRef(null);
  const today = ymd(new Date());
  const parsed = React.useMemo(() => parseQuickLine(text, today), [text, today]);
  const list = React.useMemo(() => findRoutes(routes, parsed.words, today), [routes, parsed, today]);
  React.useEffect(() => { setIdx(0); }, [text]);
  const listRef = React.useRef(null);
  React.useEffect(() => { listRef.current?.querySelector(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest" }); }, [idx]);
  React.useEffect(() => {
    const onKey = (e) => { if (e.altKey && !e.ctrlKey && String(e.key).toLowerCase() === "q") { e.preventDefault(); ref.current?.focus(); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  const apply = (e) => {
    if (!e) return;
    onApply?.(e.row, { date: parsed.date, ton: parsed.ton, kind: parsed.kind, fare: parsed.fare });
    setText(""); setOpen(false); ref.current?.blur();
  };
  const chips = [parsed.dateWord && { l: "상차일", v: `${parsed.dateWord} (${md(parsed.date)})` }, parsed.ton && { l: "톤수", v: parsed.ton }, parsed.kind && { l: "차량", v: parsed.kind }, parsed.fare > 0 && canMoney && { l: "청구운임", v: `${parsed.fare.toLocaleString()}원` }].filter(Boolean);
  const show = open && text.trim().length > 0;
  return (
    <div data-kp="quick-order" className="relative mb-3">
      <div className={`flex items-center gap-3 h-[46px] rounded-xl border bg-white pl-4 pr-3 transition ${open ? "border-[#1B2B4B] shadow-[0_0_0_3px_rgba(27,43,75,0.08)]" : "border-[#DCE3EE]"}`}>
        <span className="shrink-0 text-[11px] font-black tracking-[0.14em] text-[#1B2B4B]">빠른 등록</span>
        <span className="w-px h-4 bg-[#DCE3EE]" />
        <input ref={ref} value={text} autoComplete="off" spellCheck={false}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.nativeEvent?.isComposing) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setIdx((i) => Math.min(list.length - 1, i + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); if (open) apply(list[idx]); else setOpen(true); }
            else if (e.key === "Escape") { e.preventDefault(); if (open && text) setOpen(false); else { setText(""); setOpen(false); ref.current?.blur(); } }
          }}
          placeholder="예) 내일 대한 평택 5톤   —   거래처·상차지·하차지 이름 일부만 쳐도 지난 노선을 찾아 한 번에 채웁니다"
          style={{ border: 0, boxShadow: "none", outline: "none", background: "transparent" }} className="flex-1 min-w-0 h-full bg-transparent text-[14px] font-semibold text-[#0F1A30] placeholder:text-[#A6B3C8] placeholder:font-medium outline-none" />
        {chips.map((c) => (
          <span key={c.l} className="shrink-0 hidden md:inline-flex items-center gap-1 h-6 px-2 rounded-md border border-[#DCE3EE] text-[11.5px]">
            <span className="text-[#8FA0BD] font-bold">{c.l}</span><span className="text-[#1B2B4B] font-black" style={NUM}>{c.v}</span>
          </span>
        ))}
        <span className="shrink-0 hidden lg:inline text-[10.5px] font-black text-[#B8C4D8]">Alt Q</span>
      </div>
      {show && (
        <div ref={listRef} className="absolute left-0 right-0 top-[50px] z-40 rounded-xl border border-[#DCE3EE] bg-white shadow-[0_18px_40px_rgba(15,26,48,0.16)] overflow-hidden">
          {list.length === 0 ? (
            <div className="px-4 py-4 text-[13px] text-[#7C8BA5]">
              {parsed.words.length ? <>지난 오더에서 <b className="text-[#1B2B4B]">{parsed.words.join(" ")}</b> 노선을 찾지 못했습니다. 아래 칸에 직접 입력해 주세요.</> : "거래처나 상·하차지 이름을 함께 적어 주세요."}
            </div>
          ) : (
            <>
              <div className="px-4 py-1.5 text-[10.5px] font-black tracking-[0.12em] text-[#8FA0BD] bg-[#F8FAFD] border-b border-[#EDF1F7]">지난 노선 {list.length}개 · ↑↓ 고르기 · Enter 채우기</div>
              {list.map((e, i) => (
                <button key={e.key} data-i={i} type="button" tabIndex={-1} onMouseDown={(ev) => { ev.preventDefault(); apply(e); }} onMouseEnter={() => setIdx(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-[#F1F4F9] last:border-b-0 ${i === idx ? "bg-[#F1F5FC]" : "bg-white"}`}>
                  <span className={`shrink-0 w-[3px] h-8 rounded-full ${i === idx ? "bg-[#1B2B4B]" : "bg-transparent"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[13.5px] font-black text-[#0F1A30]">
                      <span className="truncate">{e.from}</span><span className="text-[#B8C4D8] font-medium">→</span><span className="truncate">{e.to}</span>
                    </span>
                    <span className="block text-[11.5px] text-[#7C8BA5] font-semibold truncate">
                      {e.client || "거래처 없음"}{e.row?.차량종류 ? ` · ${e.row.차량종류}` : ""}{e.row?.하차지주소 ? ` · ${String(e.row.하차지주소).slice(0, 22)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[12px] font-black text-[#1B2B4B]" style={NUM}>{e.count}회</span>
                    <span className="block text-[11px] text-[#8FA0BD] font-semibold" style={NUM}>{e.last ? `최근 ${md(e.last)}` : "예정"}</span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════ ③ 추천 기사 ══════════════════════
// 미배차현황에서 한 번만 계산해 줄마다 넘긴다
export function useDriverSuggest(rows, userCompany = "") {
  const all = useOrderHistoryLite(rows, userCompany);
  const busy = React.useMemo(() => busyByDate(rows), [rows]);
  return React.useCallback((order) => suggestDrivers(order, all, { limit: 20, busy: busy.get(String(order?.상차일 || "")), today: ymd(new Date()) }), [all, busy]);
}

// 줄마다 작은 드롭다운 하나 — 누르면 추천순 목록 + 검색(이름·차량번호·전화)
export function DriverSuggestCell({ order, pick, onAssign, drivers = [], disabled = false }) {
  const list = React.useMemo(() => pick(order), [pick, order]);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [idx, setIdx] = React.useState(0);
  const btn = React.useRef(null); const box = React.useRef(null);
  const toggle = (e) => {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    const r = btn.current.getBoundingClientRect(); const W = 340, H = 380;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)), top: r.bottom + H + 8 > window.innerHeight ? Math.max(8, r.top - H - 6) : r.bottom + 6 });
    setQ(""); setIdx(0); setOpen(true);
  };
  React.useEffect(() => {
    if (!open) return undefined;
    const out = (e) => { if (!box.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false); };
    const sc = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", out); window.addEventListener("scroll", sc, true); window.addEventListener("resize", sc);
    return () => { document.removeEventListener("mousedown", out); window.removeEventListener("scroll", sc, true); window.removeEventListener("resize", sc); };
  }, [open]);
  const shown = React.useMemo(() => {
    if (!open) return [];
    const k = q.trim().toLowerCase().replace(/[\s-]/g, "");
    if (!k) return list;
    const hit = (d) => `${d.이름 || ""}${d.차량번호 || ""}${d.전화번호 || ""}`.toLowerCase().replace(/[\s-]/g, "").includes(k);
    const a = list.filter(hit); const seen = new Set(a.map((d) => String(d.차량번호).replace(/\s+/g, "")));
    const rest = [];
    for (const d of drivers || []) {
      const car = String(d?.차량번호 || "").replace(/\s+/g, "");
      if (!car || !d.이름 || seen.has(car) || !hit(d)) continue;
      seen.add(car); rest.push({ 차량번호: String(d.차량번호).trim(), 이름: String(d.이름).trim(), 전화번호: d.전화번호 || "", same: 0, near: 0, last: "", busy: false, other: true });
      if (rest.length >= 30) break;
    }
    return a.concat(rest);
  }, [open, q, list, drivers]);
  const choose = (d) => { if (!d) return; setOpen(false); onAssign?.(order, d); };
  React.useEffect(() => { if (open) box.current?.querySelector(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest" }); }, [idx, open]);
  const close = () => { setOpen(false); setTimeout(() => btn.current?.focus(), 0); };
  const top = list[0];
  return (
    <span data-kp="driver-suggest" onDoubleClick={(e) => e.stopPropagation()}>
      <button ref={btn} type="button" disabled={disabled} onClick={toggle} title="추천 기사 보기 · 검색해서 배정 (↑↓ 고르기 · Enter 배정 · Esc 닫기)"
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); toggle(e); } }}
        className={`inline-flex items-center gap-1.5 h-7 w-[132px] pl-2.5 pr-2 rounded-lg border bg-white text-[12px] transition disabled:opacity-50 ${open ? "border-[#1B2B4B] shadow-[0_0_0_3px_rgba(27,43,75,0.08)]" : top ? "border-[#C9D3E4] hover:border-[#1B2B4B]" : "border-[#E3E8F1] hover:border-[#1B2B4B]"}`}>
        {top ? <>
          <span className="font-black text-[#1B2B4B] truncate">{top.이름}</span>
          {list.length > 1 && <span className="shrink-0 font-bold text-[#8FA0BD]" style={NUM}>외 {list.length - 1}</span>}
        </> : <span className="font-semibold text-[#A6B3C8]">기사 선택</span>}
        <svg className="ml-auto shrink-0" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5 5 6.5 8 3.5" stroke="#5B6B86" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && pos && createPortal(
        <div ref={box} data-kp="driver-suggest-pop" style={{ position: "fixed", left: pos.left, top: pos.top, width: 340, zIndex: 99990 }}
          className="rounded-xl border border-[#DCE3EE] bg-white shadow-[0_18px_40px_rgba(15,26,48,0.2)] overflow-hidden text-left" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <div className="px-3 pt-3 pb-2 border-b border-[#EDF1F7]">
            <div className="text-[12.5px] font-black text-[#0F1A30] truncate">{order.상차지명 || "-"} <span className="text-[#B8C4D8] font-medium">→</span> {order.하차지명 || "-"}</div>
            <input autoFocus value={q} autoComplete="off" spellCheck={false} placeholder="기사 이름 · 차량번호 · 전화 검색"
              onChange={(e) => { setQ(e.target.value); setIdx(0); }}
              onKeyDown={(e) => {
                if (e.nativeEvent?.isComposing) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(shown.length - 1, i + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
                else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); choose(shown[idx]); }
                else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
                else if (e.key === "Tab") setOpen(false);
              }}
              className="mt-2 w-full h-9 rounded-lg border border-[#DCE3EE] px-3 text-[13px] font-semibold text-[#0F1A30] placeholder:text-[#A6B3C8] placeholder:font-medium outline-none" />
          </div>
          <div className="px-3 py-1.5 text-[10.5px] font-black tracking-[0.1em] text-[#8FA0BD] bg-[#F8FAFD] border-b border-[#EDF1F7]">{q.trim() ? `검색 결과 ${shown.length}명` : `추천순 ${shown.length}명 · 동일 구간 운행 횟수 기준`}</div>
          <div className="max-h-[264px] overflow-y-auto">
            {shown.length === 0 && <div className="px-4 py-5 text-[12.5px] text-[#7C8BA5]">{q.trim() ? "검색 결과가 없습니다." : "동일 구간 운행 이력이 없습니다. 검색해 주세요."}</div>}
            {shown.map((d, i) => (
              <button key={d.차량번호} data-i={i} type="button" tabIndex={-1} onMouseEnter={() => setIdx(i)} onClick={() => choose(d)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left border-b border-[#F1F4F9] last:border-b-0 ${i === idx ? "bg-[#F1F5FC]" : "bg-white"}`}>
                <span className="shrink-0 w-5 text-center text-[11.5px] font-black text-[#8FA0BD]" style={NUM}>{d.other ? "·" : i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2"><span className={`text-[13.5px] font-black ${d.busy ? "text-[#8FA0BD]" : "text-[#0F1A30]"}`}>{d.이름}</span><span className="text-[12px] font-bold text-[#5B6B86]" style={NUM}>{d.차량번호}</span></span>
                  <span className="block text-[11px] text-[#8FA0BD] font-semibold truncate" style={NUM}>{d.other ? (d.전화번호 || "등록 기사") : `${d.last ? `최근 ${md(d.last)}` : ""}${d.ton ? ` · ${d.ton}` : ""}${d.kind ? ` ${d.kind}` : ""}`}</span>
                </span>
                <span className="shrink-0 text-right text-[11.5px] font-black" style={NUM}>
                  {d.busy ? <span className="text-[#C8372D]">당일 배차</span> : d.same ? <span className="text-[#1B2B4B]">동일 구간 {d.same}회</span> : d.near ? <span className="text-[#7C8BA5]">유사 구간 {d.near}회</span> : <span className="text-[#B8C4D8]">이력 없음</span>}
                </span>
              </button>
            ))}
          </div>
        </div>, document.body)}
    </span>
  );
}

// 배정 확인 창 — 누가·어느 오더에 들어가는지 한눈에
export function AssignConfirm({ target, onCancel, onOk, busy = false }) {
  const [sel, setSel] = React.useState(1); // 0 취소 · 1 배정
  React.useEffect(() => { if (target) setSel(1); }, [target]);
  React.useEffect(() => {
    if (!target) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onCancel?.(); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Tab") { e.preventDefault(); setSel((v) => (v ? 0 : 1)); }
      else if (e.key === "Enter") { e.preventDefault(); if (sel) onOk?.(); else onCancel?.(); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [target, onCancel, onOk, sel]);
  if (!target) return null;
  const { order: o, driver: d } = target;
  return (
    <div className="fixed inset-0 z-[99998] flex items-center justify-center" data-kp="assign-confirm">
      <div className="absolute inset-0 bg-[#0B1428]/45 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="relative w-[440px] max-w-[92vw] rounded-2xl bg-white shadow-[0_30px_70px_rgba(11,20,40,0.35)] overflow-hidden">
        <div className="px-6 pt-5 pb-4 text-white" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div className="text-[10px] font-black tracking-[0.24em] text-[#8FB0F0]">QUICK ASSIGN</div>
          <div className="mt-1 text-[18px] font-black">기사 배정 확인</div>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="rounded-xl border border-[#E6EBF3] px-4 py-3">
            <div className="text-[11px] font-black text-[#8FA0BD]">오더</div>
            <div className="mt-0.5 text-[14px] font-black text-[#0F1A30]">{o.상차지명 || "-"} <span className="text-[#B8C4D8] font-medium">→</span> {o.하차지명 || "-"}</div>
            <div className="text-[12px] text-[#5B6B86] font-semibold" style={NUM}>{o.상차일}{o.상차시간 ? ` ${o.상차시간}` : ""} · {o.거래처명 || "거래처 없음"}{o.차량톤수 ? ` · ${o.차량톤수}` : ""}{o.차량종류 ? ` ${o.차량종류}` : ""}</div>
          </div>
          <div className="rounded-xl border border-[#1B2B4B] px-4 py-3">
            <div className="text-[11px] font-black text-[#8FA0BD]">기사</div>
            <div className="mt-0.5 flex items-baseline gap-2"><span className="text-[16px] font-black text-[#0F1A30]">{d.이름}</span><span className="text-[13px] font-bold text-[#1B2B4B]" style={NUM}>{d.차량번호}</span></div>
            <div className="text-[12px] text-[#5B6B86] font-semibold" style={NUM}>{d.전화번호 || "전화번호 없음"} · 동일 구간 {d.same}회{d.near ? ` · 유사 구간 ${d.near}회` : ""}{d.last ? ` · 최근 ${d.last}` : ""}</div>
            {d.busy && <div className="mt-1.5 text-[12px] font-black text-[#C8372D]">당일 다른 오더에 배차된 기사입니다. 중복 배정하려면 [배정]을 누르세요.</div>}
          </div>
          <div className="text-[11.5px] text-[#8FA0BD] font-semibold">운임은 변경되지 않습니다. Enter 배정 · Esc 취소 · ←→ 이동</div>
        </div>
        <div className="px-6 pb-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={`h-10 px-4 rounded-xl border text-[13.5px] font-black text-[#5B6B86] hover:bg-[#F6F8FC] ${sel === 0 ? "border-[#1B2B4B] shadow-[0_0_0_3px_rgba(27,43,75,0.12)]" : "border-[#DCE3EE]"}`}>취소</button>
          <button type="button" onClick={onOk} disabled={busy} className={`h-10 px-6 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black hover:bg-[#1B2B4B] disabled:opacity-60 ${sel === 1 ? "shadow-[0_0_0_3px_rgba(27,43,75,0.22)]" : ""}`}>{busy ? "배정 중…" : "배정"}</button>
        </div>
      </div>
    </div>
  );
}

export { won };
