// ======================= src/FareQuote.jsx =======================
// ⭐ 2026-11-24 운임조회 › 운임 산출 — 거래처 · 운송 구간 · 톤급 · 도착 구분 · 경유를 넣으면
//  청구운임(매출) · 기사운임(매입) · 매출총이익을 크게, 항목별 산출 근거(단가표 · 노선 규칙 · 실거래)를 표로 보여준다.
//  계산: src/fareQuoteCore.js(단가표 고르기 · 실거래 통계 · 산출) — 오더등록 자동 입력 · 고정노선운임과 같은 규칙
//  디자인: 글씨는 네이비 · 그레이 단색, 색은 막대 그래프에만
import React from "react";
import { db } from "./firebase";
import { collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { useRoutePresets } from "./routePreset";
import { quoteFare, historyStats, rateTons, quoteText, ARRIVALS } from "./fareQuoteCore";

const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const nkz = (v) => String(v || "").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
const DEFAULT_TONS = ["1톤", "2.5톤", "3.5톤", "5톤", "5톤축", "11톤", "18톤", "25톤"];
const BAR = { base: "#2D4C82", fork: "#3FB984", sp: ["#E9C46A", "#8E7CC3", "#5AA9C9", "#C98A5A"], driver: "#8FB0F0" };
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const lineColor = (l, i) => (l.key === "base" ? BAR.base : l.key === "fork" ? BAR.fork : BAR.sp[i % BAR.sp.length]);

// 지난 6개월 오더(한 번만 · 운임 비교에는 실시간이 필요 없다)
function useHistory(enabled) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!enabled || rows) return undefined;
    let alive = true;
    const d = new Date(Date.now() + 9 * 3600e3); d.setUTCMonth(d.getUTCMonth() - 6);
    const from = d.toISOString().slice(0, 10);
    Promise.all(["orders", "dispatch"].map((c) => getDocs(query(collection(db, c), where("상차일", ">=", from))).then((s) => s.docs.map((x) => ({ _id: x.id, ...x.data() }))).catch(() => [])))
      .then(([a, b]) => { if (!alive) return; const seen = new Set(); setRows([...a, ...b].filter((o) => (seen.has(o._id) ? false : (seen.add(o._id), true)))); });
    return () => { alive = false; };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}
function useRateSheets(company) {
  const [list, setList] = React.useState([]);
  React.useEffect(() => {
    const co = String(company || "").trim();
    if (!co) { setList([]); return undefined; }
    return onSnapshot(query(collection(db, "multiRateSheets"), where("companyName", "==", co)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
  }, [company]);
  return list;
}

function Field({ label, value, onChange, list, placeholder, dot, hint, testid }) {
  return (
    <label className="flex items-center gap-2.5 h-12 px-3.5 rounded-xl border-[1.5px] border-[#E3E8F0] bg-white focus-within:border-[#2D4C82] focus-within:shadow-[0_0_0_4px_rgba(45,76,130,0.1)] transition">
      {dot && <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot === "from" ? "bg-[#2D4C82]" : "bg-[#C9D8F5] ring-2 ring-[#2D4C82]"}`} />}
      <input value={value} onChange={(e) => onChange(e.target.value)} list={list} placeholder={placeholder || label} aria-label={label} data-fq={testid}
        className="flex-1 min-w-0 bg-transparent outline-none text-[15px] font-bold text-[#0F1A30] placeholder:text-[#A8B3C5] placeholder:font-medium" />
      {hint && <span className="text-[11.5px] text-[#6B7A93] whitespace-nowrap">{hint}</span>}
    </label>
  );
}
const Lbl = ({ children }) => <div className="text-[12px] font-bold text-[#6B7A93] mb-2 flex items-center gap-1.5">{children}</div>;
const Tag = ({ children }) => <span className="text-[10.5px] font-bold text-[#5B6B85] border border-[#D5DCE7] rounded-[5px] px-1.5 py-px whitespace-nowrap">{children}</span>;

export default function FareQuote({ company = "" }) {
  const co = company || (() => { try { return localStorage.getItem("userCompany") || localStorage.getItem("loginCompany") || ""; } catch { return ""; } })();
  const sheets = useRateSheets(co);
  const presets = useRoutePresets();
  const [q, setQ] = React.useState({ 거래처명: "", 상차지명: "", 하차지명: "", 톤수: "11톤", 도착: "당착", 경유: 0 });
  const set = (patch) => setQ((p) => ({ ...p, ...patch }));
  const ready = !!(q.상차지명.trim() && q.하차지명.trim());
  const orders = useHistory(ready);
  const [copied, setCopied] = React.useState(false);

  const tons = React.useMemo(() => { const t = rateTons(sheets); return t.length ? t : DEFAULT_TONS; }, [sheets]);
  // 자동완성 — 거래처: 단가표 기준지 · 고정노선 · 실거래 / 상·하차지: 그 거래처 기록 우선
  const clients = React.useMemo(() => {
    const s = new Set(); sheets.forEach((x) => x.baseName && s.add(String(x.baseName).trim())); presets.forEach((p) => p.거래처명 && s.add(p.거래처명));
    (orders || []).slice(0, 3000).forEach((o) => o.거래처명 && s.add(String(o.거래처명).trim()));
    return [...s].sort((a, b) => a.localeCompare(b, "ko"));
  }, [sheets, presets, orders]);
  const places = React.useMemo(() => {
    const c = nkz(q.거래처명); const from = new Set(), to = new Set();
    (orders || []).forEach((o) => { if (c && nkz(o.거래처명) !== c) return; if (o.상차지명) from.add(String(o.상차지명).trim()); if (o.하차지명) to.add(String(o.하차지명).trim()); });
    sheets.forEach((sh) => (!c || nkz(sh.baseName) === c) && (sh.rows || []).forEach((r) => r.name && to.add(String(r.name).trim())));
    return { from: [...from].slice(0, 300), to: [...to].slice(0, 500) };
  }, [orders, sheets, q.거래처명]);
  const clientInfo = React.useMemo(() => {
    const c = nkz(q.거래처명); if (!c) return "";
    const rs = sheets.filter((s) => nkz(s.baseName) === c).length; const rp = presets.filter((p) => p.사용 !== false && !p.legacy && nkz(p.거래처명) === c).length;
    return [rs ? "단가표 적용" : "", rp ? `노선 규칙 ${rp}건` : ""].filter(Boolean).join(" · ");
  }, [q.거래처명, sheets, presets]);

  const hist = React.useMemo(() => (ready && orders ? historyStats(orders, q, { today: today() }) : null), [ready, orders, q.거래처명, q.상차지명, q.하차지명, q.톤수]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = React.useMemo(() => (ready ? quoteFare({ q, sheets, presets, hist }) : null), [ready, q, sheets, presets, hist]);
  const has = !!(r && r.total.sale > 0);
  const autoRule = !!(r && r.lines.some((l) => l.tag === "노선 규칙"));
  const copy = () => { if (!r) return; navigator.clipboard?.writeText(quoteText(q, r)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {}); };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5 items-start" data-fare-quote="1">
      {/* 왼쪽 — 산출 조건 */}
      <div className="bg-white border border-[#E3E8F0] rounded-[20px] p-5 lg:p-[22px]">
        <Lbl>거래처</Lbl>
        <Field label="거래처" value={q.거래처명} onChange={(v) => set({ 거래처명: v })} list="fq-clients" placeholder="거래처명" hint={clientInfo} testid="client" />
        <div className="mt-5"><Lbl>운송 구간</Lbl>
          <div className="relative flex flex-col gap-2">
            <span className="absolute left-[18px] top-[30px] bottom-[30px] border-l-2 border-dashed border-[#C9D3E3]" />
            <Field label="상차지" value={q.상차지명} onChange={(v) => set({ 상차지명: v })} list="fq-from" dot="from" testid="from" />
            <div className="ml-7 flex items-center justify-between h-10 px-3.5 rounded-xl border-[1.5px] border-dashed border-[#E3E8F0] text-[13px] text-[#6B7A93]">
              <span>경유지</span>
              <span className="flex items-center border-[1.5px] border-[#E3E8F0] rounded-lg overflow-hidden bg-white">
                <button type="button" onClick={() => set({ 경유: Math.max(0, q.경유 - 1) })} className="w-7 h-6 text-[#6B7A93]" aria-label="경유 빼기">−</button>
                <b className="w-7 text-center text-[13px] text-[#0F1A30] border-x border-[#E3E8F0] tabular-nums" data-fq="via">{q.경유}</b>
                <button type="button" onClick={() => set({ 경유: Math.min(9, q.경유 + 1) })} className="w-7 h-6 text-[#6B7A93]" aria-label="경유 더하기">＋</button>
              </span>
            </div>
            <Field label="하차지" value={q.하차지명} onChange={(v) => set({ 하차지명: v })} list="fq-to" dot="to" testid="to" />
          </div>
        </div>
        <div className="mt-5"><Lbl>차종 · 톤급</Lbl>
          <div className="flex flex-wrap gap-1.5">
            {tons.map((t) => <button key={t} type="button" onClick={() => set({ 톤수: t })} data-fq-ton={t}
              className={`h-9 px-3 rounded-[10px] border-[1.5px] text-[13px] font-bold transition ${nkz(q.톤수) === nkz(t) ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3C4A63] border-[#E3E8F0] hover:border-[#2D4C82]"}`}>{t}</button>)}
          </div>
        </div>
        <div className="mt-5"><Lbl>도착 구분 · 부대비용 {autoRule && <Tag>노선 규칙 자동 적용</Tag>}</Lbl>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-[14px] font-bold text-[#0F1A30]">도착 구분</span>
            <span className="flex bg-[#F2F5F9] rounded-[9px] p-[3px]">
              {ARRIVALS.map((a) => <button key={a} type="button" onClick={() => set({ 도착: a })} data-fq-arr={a}
                className={`px-2.5 h-7 rounded-[7px] text-[12px] font-bold ${q.도착 === a ? "bg-white text-[#0F1A30] shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-[#6B7A93]"}`}>{a}</button>)}
            </span>
          </div>
          <div className="text-[11.5px] text-[#8A97AD] leading-relaxed break-keep">야상 · 익착 · 월착 · 경유 · 지게차 대행료 · 계근비는 [특수운임 › 고정노선운임]에 등록된 규칙으로 계산해요.</div>
        </div>
      </div>

      {/* 오른쪽 — 산출 결과 */}
      <div className="min-w-0">
        <div className="relative overflow-hidden rounded-[22px] px-5 lg:px-[26px] py-6 text-white" style={{ background: "radial-gradient(120% 140% at 0% 0%,#22396B 0%,#0F1A30 55%,#0A1222 100%)" }}>
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(143,176,240,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(143,176,240,.06) 1px,transparent 1px)", backgroundSize: "24px 24px" }} />
          <div className="relative flex items-center gap-3.5 min-w-0">
            <div className="text-[17px] lg:text-[19px] font-black truncate max-w-[40%]">{q.상차지명 || "상차지"}</div>
            <div className="flex-1 h-[2px] rounded bg-gradient-to-r from-[#6E95E8] to-[#CFE0FF] relative min-w-[40px]"><span className="absolute -right-0.5 -top-[4px] border-l-[8px] border-l-[#CFE0FF] border-y-[5px] border-y-transparent" /></div>
            <div className="text-[17px] lg:text-[19px] font-black truncate max-w-[40%] text-right">{q.하차지명 || "하차지"}</div>
          </div>
          <div className="relative flex flex-wrap gap-2 mt-4 text-[12px] font-bold">
            {[q.톤수, q.도착 === "야상" ? "야상 · 전일 18시 이후 상차" : q.도착, q.경유 ? `경유 ${q.경유}곳` : ""].filter(Boolean).map((x) => <span key={x} className="px-2.5 py-1 rounded-lg bg-white/[0.08] border border-white/10 text-white/80">{x}</span>)}
            {r && r.base.src !== "none" && <span className="px-2.5 py-1 rounded-lg border border-white/25">산출 기준 · {r.base.src === "rate" ? `${r.rate?.sheetName || ""} 단가표` : "자사 실거래"}{autoRule ? " + 노선 규칙" : ""}</span>}
          </div>
          <div className="relative grid grid-cols-1 sm:grid-cols-[1.25fr_1.25fr_1fr] gap-3 mt-5">
            <div className="rounded-2xl bg-white text-[#0F1A30] px-[18px] py-4" data-fq-sale={r?.total.sale || 0}>
              <div className="text-[12px] font-bold text-[#6B7A93]">청구운임 <span className="font-medium opacity-70">매출</span></div>
              <div className="text-[30px] lg:text-[34px] font-black tracking-[-0.02em] tabular-nums mt-1">{has ? won(r.total.sale) : "—"}<span className="text-[17px] font-bold text-[#6B7A93] ml-0.5">원</span></div>
              <div className="text-[12px] text-[#6B7A93] mt-1">{has ? `공급가액 · VAT 포함 ${won(r.total.sale * 1.1)}원` : "상차지 · 하차지를 넣어 주세요"}</div>
            </div>
            <div className="rounded-2xl bg-white/[0.06] border border-white/10 px-[18px] py-4" data-fq-driver={r?.total.driver || 0}>
              <div className="text-[12px] font-bold text-white/55">기사운임 <span className="font-medium opacity-70">매입</span></div>
              <div className="text-[30px] lg:text-[34px] font-black tracking-[-0.02em] tabular-nums mt-1">{has && r.total.driver ? won(r.total.driver) : "—"}<span className="text-[17px] font-bold text-white/60 ml-0.5">원</span></div>
              <div className="text-[12px] text-white/50 mt-1">{r?.total.external ? `외부 지급 ${won(r.total.external)}원 별도 정산` : has && !r.total.driver ? "매입 단가 · 실거래 없음" : " "}</div>
            </div>
            <div className="rounded-2xl bg-white/[0.06] border border-white/10 px-[18px] py-4">
              <div className="text-[12px] font-bold text-white/55">매출총이익</div>
              <div className="text-[30px] lg:text-[34px] font-black tracking-[-0.02em] tabular-nums mt-1">{has && r.total.driver ? won(r.total.profit) : "—"}<span className="text-[17px] font-bold text-white/60 ml-0.5">원</span></div>
              <div className="text-[12px] text-white/50 mt-1">{has && r.total.driver ? `마진율 ${r.total.margin}%` : " "}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-4 mt-4">
          <div className="bg-white border border-[#E3E8F0] rounded-[20px] p-5">
            <div className="flex items-baseline gap-2 mb-3.5"><span className="text-[15px] font-black text-[#0F1A30]">운임 산출 내역</span><span className="text-[12px] text-[#6B7A93]">항목별 적용 근거</span></div>
            {!r || !r.lines.length ? (
              <div className="py-10 text-center text-[13px] text-[#8A97AD] break-keep">
                {!ready ? "상차지와 하차지를 넣으면 산출 내역이 나와요." : r?.rate?.ambiguous ? "단가표에 맞는 줄이 여러 개이고 금액이 달라요. [단가표] 메뉴에서 확인해 주세요." : !orders ? "실거래 기록을 불러오는 중이에요…" : "이 구간 · 톤급의 단가표와 실거래 기록이 없어요."}
              </div>
            ) : (<>
              {/* 표 대신 칸 나누기 — 앱 공용 표 모양(줄무늬 · 세로줄)이 붙지 않게 */}
              <div className="text-[14px] tabular-nums" role="table">
                <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 sm:gap-x-5 text-[11.5px] font-bold text-[#6B7A93] pb-2 border-b border-[#E3E8F0]" role="row">
                  <span>항목</span><span className="text-right w-[76px] sm:w-[88px] whitespace-nowrap">청구(매출)</span><span className="text-right w-[76px] sm:w-[88px] whitespace-nowrap">지급(매입)</span>
                </div>
                {r.lines.map((l) => (
                  <div key={l.key} className="grid grid-cols-[1fr_auto_auto] gap-x-3 sm:gap-x-5 items-center py-3 border-b border-[#F0F3F7]" role="row" data-fq-line={l.name}>
                    <div className="min-w-0"><div className="flex items-center gap-2 font-bold text-[#0F1A30]">{l.name}<Tag>{l.tag}</Tag></div><div className="text-[11.5px] text-[#6B7A93] mt-0.5 break-keep">{l.why}</div></div>
                    <div className="text-right w-[76px] sm:w-[88px] font-bold text-[#0F1A30] whitespace-nowrap">{l.sale ? `${l.key === "base" ? "" : "+"}${won(l.sale)}` : <span className="text-[#B4BFCF] font-medium">—</span>}</div>
                    <div className="text-right w-[76px] sm:w-[88px] font-bold text-[#0F1A30] whitespace-nowrap">{l.pay ? won(l.pay) : <span className="text-[#B4BFCF] font-medium">—</span>}</div>
                  </div>
                ))}
                <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 sm:gap-x-5 pt-3.5 text-[16px] font-black text-[#0F1A30]" role="row">
                  <span>합계</span><span className="text-right w-[76px] sm:w-[88px]">{won(r.total.sale)}</span><span className="text-right w-[76px] sm:w-[88px]">{won(r.total.pay)}</span>
                </div>
              </div>
              {/* 막대 — 색은 여기에만 */}
              {r.total.sale > 0 && (() => {
                const max = Math.max(r.total.sale, r.total.pay) || 1;
                const pays = r.lines.filter((l) => l.pay > 0);
                const col = Object.fromEntries(r.lines.map((l, i) => [l.key, lineColor(l, i - 1)]));
                return (
                  <div className="mt-4 text-[12px] font-bold text-[#6B7A93]">
                    <div className="flex items-center gap-2.5 mb-2"><span className="w-10">청구</span><div className="flex-1 h-[22px] rounded-[7px] bg-[#F1F4F8] flex overflow-hidden">{r.lines.filter((l) => l.sale > 0).map((l) => <i key={l.key} style={{ width: `${(l.sale / max) * 100}%`, background: col[l.key] }} />)}</div><em className="not-italic w-[72px] text-right text-[#0F1A30] tabular-nums">{won(r.total.sale)}</em></div>
                    <div className="flex items-center gap-2.5 mb-2"><span className="w-10">지급</span><div className="flex-1 h-[22px] rounded-[7px] bg-[#F1F4F8] flex overflow-hidden">{pays.map((l) => <i key={l.key} style={{ width: `${(l.pay / max) * 100}%`, background: l.key === "base" ? BAR.driver : col[l.key] }} />)}</div><em className="not-italic w-[72px] text-right text-[#0F1A30] tabular-nums">{won(r.total.pay)}</em></div>
                    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] font-semibold">
                      {r.lines.map((l) => <span key={l.key} className="flex items-center gap-1.5"><i className="w-[9px] h-[9px] rounded-[3px]" style={{ background: col[l.key] }} />{l.key === "base" ? "기본" : l.name}</span>)}
                      <span className="flex items-center gap-1.5"><i className="w-[9px] h-[9px] rounded-[3px]" style={{ background: BAR.driver }} />기사운임</span>
                    </div>
                  </div>
                );
              })()}
            </>)}
          </div>

          <div className="bg-white border border-[#E3E8F0] rounded-[20px] p-5">
            <div className="flex items-baseline gap-2 mb-3.5"><span className="text-[15px] font-black text-[#0F1A30]">자사 실거래 비교</span><span className="text-[12px] text-[#6B7A93]">동일 구간 · {q.톤수 || "전체 톤급"} · 최근 6개월</span></div>
            {!ready ? <div className="py-10 text-center text-[13px] text-[#8A97AD]">구간을 넣으면 비교해요.</div>
              : !orders ? <div className="py-10 text-center text-[13px] text-[#8A97AD]">불러오는 중…</div>
              : !hist?.count ? <div className="py-10 text-center text-[13px] text-[#8A97AD]">같은 구간 기록이 없어요.</div>
              : (() => {
                const b = hist.buy; const span = b ? (b.max - b.min) || 1 : 1;
                const cur = r?.base.buy || 0; const pos = b ? Math.max(0, Math.min(100, ((cur - b.min) / span) * 100)) : 0;
                const peak = Math.max(1, ...hist.bins.map((x) => x.n));
                return (<>
                  <div className="flex items-baseline gap-2"><b className="text-[22px] font-black text-[#0F1A30]">{hist.count}건</b><span className="text-[12px] text-[#6B7A93] font-semibold">{b ? `기본 기사운임 평균 ${won(b.avg)}원${hist.spread ? ` · 편차 ±${hist.spread}%` : ""}` : ""}{hist.sameClient ? "" : " · 다른 거래처 포함"}</span></div>
                  {b && b.max > b.min && (
                    <div className="relative h-10 mt-3 mb-1">
                      <div className="absolute inset-x-0 top-[17px] h-1.5 rounded bg-[#EEF2F7]" />
                      <div className="absolute top-[17px] h-1.5 rounded bg-gradient-to-r from-[#AFC4EA] to-[#2D4C82]" style={{ left: `${Math.max(0, ((b.avg * (1 - hist.spread / 100) - b.min) / span) * 100)}%`, right: `${Math.max(0, 100 - ((b.avg * (1 + hist.spread / 100) - b.min) / span) * 100)}%` }} />
                      {cur > 0 && <div className="absolute top-1.5 w-[2px] h-7 bg-[#0F1A30]" style={{ left: `${pos}%` }}><span className={`absolute -top-4 text-[10.5px] font-extrabold text-[#0F1A30] whitespace-nowrap ${pos > 80 ? "right-0" : pos < 20 ? "left-0" : "left-1/2 -translate-x-1/2"}`}>기본 산출 {won(cur)}</span></div>}
                      <span className="absolute top-7 left-0 text-[10.5px] text-[#6B7A93] font-semibold">{won(b.min)}</span>
                      <span className="absolute top-7 right-0 text-[10.5px] text-[#6B7A93] font-semibold">{won(b.max)}</span>
                    </div>
                  )}
                  {hist.bins.length > 0 && <div className="flex items-end gap-1 h-[52px] mt-3">{hist.bins.map((x, i) => <i key={i} className="flex-1 rounded-t-[3px]" style={{ height: `${Math.max(4, (x.n / peak) * 100)}%`, background: cur >= x.from && cur <= x.to ? "#2D4C82" : "#D6E0F0" }} />)}</div>}
                  <div className="mt-3.5">
                    {hist.recent.map((x, i) => <div key={i} className="flex justify-between text-[12.5px] py-[7px] border-t border-[#F0F3F7] font-semibold tabular-nums"><span className="text-[#6B7A93] font-medium truncate pr-2">{[x.date, x.way, x.car].filter(Boolean).join(" · ")}</span><span className="text-[#0F1A30] whitespace-nowrap">{won(x.sale)} / {won(x.buy)}</span></div>)}
                  </div>
                </>);
              })()}
          </div>
        </div>
        <div className="flex gap-2.5 mt-4">
          <button type="button" disabled={!has} onClick={copy} className="flex-1 h-[50px] rounded-[14px] bg-[#0F1A30] text-white text-[15px] font-extrabold disabled:opacity-40">{copied ? "복사했어요" : "견적서 복사"}</button>
        </div>
      </div>
      <datalist id="fq-clients">{clients.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="fq-from">{places.from.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="fq-to">{places.to.map((c) => <option key={c} value={c} />)}</datalist>
    </div>
  );
}
