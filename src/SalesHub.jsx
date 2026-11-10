// ======================= src/SalesHub.jsx =======================
// 💼 2026-11-10 영업관리 — 영업팀 업무 화면(PC·모바일 공용 · 다른 부서 화면과 같은 왼쪽 메뉴/머리 카드/표 디자인)
//  · 영업 현황: 담당 매출 · 매출이익 · 목표 · 예상 인센티브 · 12개월 추이 · 수주 시뮬레이터
//  · 영업 기회: 발굴 → 접촉 → 견적 → 협상 → 수주/실패 (수주 확률 가중 예상 매출 · 수주하면 늘어나는 인센티브)
//  · 거래처 담당: 거래처 ↔ 영업 담당자 · 수주일 · 상태(신규·성장·급감·휴면·미수)
//  · 영업 활동: 방문·전화·견적·미팅 기록 + 달력
//  · 인센티브: 거래처별 계산 내역 · 수금 완료분 확정/미수 보류 · 확정 → 지급 완료
//  · 팀 순위 · 목표·규정(인센티브 규정은 영업 관리자가 정한다)
//  계산은 src/salesCore.js, 자료는 src/salesData.js
import React from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { db } from "./firebase";
import KpSubNav from "./KpSubNav";
import useNarrow from "./useNarrow";
import { BookHero, BookCard, Chip, Sheet, BookSkeleton, MONO } from "./OfficeBooks";
import { CustomSelect } from "./CustomSelect";
import CustomDatePicker from "./CustomDatePicker";
import { kpConfirm, kpAlert } from "./kpDialog";
import { useSalesBoard, useSalesMe, targetOf } from "./salesData";
import { ymOf, kstDay, toInt, cName, dayGap, LEAD_STAGES, OPEN_STAGES, stageOf, leadProb, leadWeighted, pipelineSummary, simulateWin, HEALTH, baseLabel, DEFAULT_POLICY, normPolicy, tierAmount } from "./salesCore";

const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const short = (n) => { const a = Math.abs(n || 0); if (a >= 1e8) return `${(n / 1e8).toFixed(1)}억`; if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`; return Math.round(n || 0).toLocaleString(); };
const comma = (v) => { const n = String(v ?? "").replace(/[^\d]/g, ""); return n ? Number(n).toLocaleString("ko-KR") : ""; };
const num = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };
const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
const btnDark = "h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black whitespace-nowrap shrink-0 disabled:opacity-50";
const btnLine = "h-10 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[#1B2B4B] text-[13.5px] font-black whitespace-nowrap shrink-0 disabled:opacity-50";
const Label = ({ children }) => <div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5 whitespace-nowrap">{children}</div>;
const Empty = ({ children }) => <div className="py-14 px-4 text-center text-[13.5px] font-bold text-[#9AA9C3] leading-relaxed">{children}</div>;
const Tag = ({ tone = "", children }) => <span className={`inline-block px-1.5 py-0.5 rounded-md text-[11px] font-black whitespace-nowrap ${tone === "dark" ? "bg-[#0F1A30] text-white" : tone === "warn" ? "bg-[#F3E7CC] text-[#6B5320]" : tone === "dim" ? "bg-[#F1F4F9] text-[#7A879C]" : "bg-[#EEF3FC] text-[#2D4C82]"}`}>{children}</span>;
const Th = ({ children, right, w }) => <th className={`px-3 py-2.5 text-[12px] font-black whitespace-nowrap ${right ? "text-right" : "text-left"}`} style={w ? { width: w } : undefined}>{children}</th>;
const Td = ({ children, right, bold, className = "" }) => <td className={`px-3 py-2.5 ${right ? "text-right tabular-nums" : ""} ${bold ? "font-black text-[#0F1A30]" : "font-semibold text-[#3A4A66]"} ${className}`} style={right ? num : undefined}>{children}</td>;
const MoneyInput = ({ value, onChange, placeholder = "0", disabled }) => <input inputMode="numeric" disabled={disabled} value={comma(value)} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))} placeholder={placeholder} className={`${inp} text-right tabular-nums disabled:bg-[#F4F6FA]`} style={num} />;
const NumInput = ({ value, onChange, disabled, suffix }) => (
  <div className="relative">
    <input inputMode="decimal" disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} className={`${inp} text-right tabular-nums disabled:bg-[#F4F6FA] ${suffix ? "pr-9" : ""}`} style={num} />
    {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] font-bold text-[#7A879C]">{suffix}</span>}
  </div>
);
// 달 고르기(‹ 2026.11 ›) — 머리 카드 오른쪽
function MonthNav({ ym, setYm, max = ymOf(0) }) {
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" data-ro-allow onClick={() => setYm(ymOf(-1, `${ym}-01`))} className="w-9 h-9 rounded-xl bg-white/10 border border-white/15">‹</button>
      <span className="h-9 px-3 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black grid place-items-center tabular-nums whitespace-nowrap" style={num}>{ym.replace("-", ".")}</span>
      <button type="button" data-ro-allow disabled={ym >= max} onClick={() => setYm(ymOf(1, `${ym}-01`))} className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 disabled:opacity-40">›</button>
    </div>
  );
}
// 담당자 고르기(관리자만) — "" = 영업팀 전체
function RepPick({ B, value, onChange, all = true, dark = true }) {
  return (
    <CustomSelect value={value} onChange={(e) => onChange(e.target.value)} className={dark ? "h-9 min-w-[130px] px-3 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black" : inp}>
      {all && <option value="">영업팀 전체</option>}
      {B.reps.map((r) => <option key={r.uid} value={r.uid}>{r.name}{r.position ? ` ${r.position}` : ""}</option>)}
    </CustomSelect>
  );
}
const sumCalc = (list) => {
  const s = (k) => list.reduce((a, x) => a + (x[k] || 0), 0);
  const sale = s("sale"); const target = s("target");
  return { sale, buy: s("buy"), profit: s("profit"), base: s("base"), total: s("total"), confirmed: s("confirmed"), held: s("held"), n: s("n"), target, achieve: target > 0 ? (sale / target) * 100 : 0, rows: list.flatMap((x) => x.rows.map((r) => ({ ...r, rep: x.name }))), excluded: { n: list.reduce((a, x) => a + x.excluded.n, 0), sale: list.reduce((a, x) => a + x.excluded.sale, 0) }, newClients: s("newClients"), next: null, effRate: 0, tierRate: 0, accel: 1 };
};

// ═════════════════════════ 영업 현황 ═════════════════════════
function Overview({ B, who, onTab }) {
  const [ym, setYm] = React.useState(ymOf(0));
  const [rep, setRep] = React.useState(who.canManage ? "" : who.uid);
  const uid = who.canManage ? rep : who.uid;
  const cur = React.useMemo(() => (uid ? B.calc(uid, ym) : sumCalc(B.team(ym))), [B, uid, ym]);
  const months = React.useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const m = ymOf(i - 11); const r = uid ? B.calc(uid, m) : sumCalc(B.team(m));
    return { k: `${Number(m.slice(5))}월`, m, sale: r.sale, profit: r.profit, inc: r.total };
  }), [B, uid]);
  const rate = cur.sale ? (cur.profit / cur.sale) * 100 : 0;
  // 수주 시뮬레이터
  const [sim, setSim] = React.useState({ rev: "10000000", margin: "12" });
  const simBase = uid ? cur : (B.reps.some((r) => r.uid === who.uid) ? B.calc(who.uid, ym) : B.calc("", ym));
  const S = simulateWin({ current: simBase, policy: B.policy, monthlyRevenue: sim.rev, marginRate: sim.margin });
  const p = B.policy;
  return (
    <div className="space-y-4">
      <BookHero en="SALES · OVERVIEW" title="영업 현황" desc="내가 수주한 거래처의 매출 · 매출이익과 이번 달 예상 인센티브를 한눈에 봅니다"
        right={<div className="flex items-center gap-2 flex-wrap justify-end">{who.canManage && <RepPick B={B} value={rep} onChange={setRep} />}<MonthNav ym={ym} setYm={setYm} /></div>}
        kpis={[["담당 매출", `${won(cur.sale)}원`, `${cur.n.toLocaleString()}건 · 배차완료 기준`], ["매출이익", `${won(cur.profit)}원`, `마진율 ${rate.toFixed(1)}%`], ["목표 달성률", cur.target > 0 ? `${cur.achieve.toFixed(0)}%` : "미설정", cur.target > 0 ? `목표 ${short(cur.target)}원` : "목표·규정에서 설정"], ["예상 인센티브", `${won(cur.total)}원`, `확정 ${short(cur.confirmed)} · 보류 ${short(cur.held)}`]]} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <div className="space-y-4 min-w-0">
          <BookCard en="TREND · 12M" title="월별 담당 매출 · 매출이익 · 인센티브" right={<button type="button" data-ro-allow className={btnLine} disabled={B.loading} onClick={B.reload}>{B.loading ? "불러오는 중…" : "새로 고침"}</button>}>
            <div className="h-[240px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={months} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#EEF2F8" vertical={false} />
                  <XAxis dataKey="k" tick={{ fill: "#7A879C", fontSize: 11.5, fontFamily: MONO }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={short} tick={{ fill: "#9AA9C3", fontSize: 10.5, fontFamily: MONO }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip formatter={(v, n) => [`${won(v)}원`, n]} contentStyle={{ borderRadius: 12, border: "1px solid #E3E8F0", fontSize: 12 }} />
                  <Bar dataKey="sale" name="매출" fill="#4B6CB7" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  <Bar dataKey="profit" name="매출이익" fill="#0F1A30" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  <Line dataKey="inc" name="인센티브" stroke="#B88A2E" strokeWidth={2} dot={{ r: 2.5 }} type="monotone" isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </BookCard>
          <BookCard flush en="ACCOUNTS" title={`${Number(ym.slice(5))}월 거래처별 실적`} right={<button type="button" data-ro-allow className={`${btnLine} mr-4`} onClick={() => onTab("incentive")}>인센티브 계산 보기 ›</button>}>
            {!cur.rows.length ? <Empty>이 달 담당 거래처 실적이 없습니다.<br />거래처 담당에서 내 거래처를 정하거나, 영업 기회를 수주 처리하면 여기에 보입니다.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] border-collapse" style={{ minWidth: 640 }}>
                  <thead><tr className="bg-[#0F1A30] text-white"><Th>거래처</Th>{!uid && <Th>담당</Th>}<Th right>건수</Th><Th right>매출</Th><Th right>매출이익</Th><Th right>마진율</Th><Th right>인센티브</Th><Th>수금</Th></tr></thead>
                  <tbody>
                    {[...cur.rows].sort((a, b) => b.sale - a.sale).map((x, i) => (
                      <tr key={`${x.client}${x.rep || ""}`} className={`border-t border-[#EEF2F8] ${i % 2 ? "bg-[#FBFCFE]" : "bg-white"}`}>
                        <Td bold>{x.client} {x.isNew && <Tag>신규</Tag>}</Td>{!uid && <Td>{x.rep}</Td>}
                        <Td right>{x.n}</Td><Td right bold>{won(x.sale)}</Td><Td right>{won(x.sale - x.buy)}</Td><Td right>{x.sale ? (((x.sale - x.buy) / x.sale) * 100).toFixed(1) : "0.0"}%</Td>
                        <Td right bold className="!text-[#2D4C82]">{won(x.amount)}</Td><Td>{x.collected ? <Tag tone="dark">수금 완료</Tag> : <Tag tone="warn">미수</Tag>}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </BookCard>
        </div>
        <div className="space-y-4 min-w-0">
          {uid && (
            <BookCard en="INCENTIVE LADDER" title="인센티브 구간">
              <div className="flex items-baseline gap-2"><span className="text-[26px] font-black text-[#0F1A30] tabular-nums" style={num}>{cur.tierRate.toFixed(1)}%</span><span className="text-[12.5px] font-bold text-[#7A879C]">지금 구간 · {baseLabel(p)} {won(cur.base)}원</span></div>
              {p.useTiers ? (
                <div className="mt-3 space-y-1.5">
                  {p.tiers.map((t, i) => { const end = p.tiers[i + 1]?.from; const on = cur.base >= t.from && (end == null || cur.base < end); const fill = end == null ? (cur.base >= t.from ? 100 : 0) : Math.max(0, Math.min(100, ((cur.base - t.from) / (end - t.from)) * 100)); return (
                    <div key={t.from} className={`rounded-xl border px-3 py-2 ${on ? "border-[#2D4C82] bg-[#EEF3FC]" : "border-[#E3E8F0] bg-white"}`}>
                      <div className="flex items-center justify-between text-[12.5px] font-black"><span className="text-[#3A4A66] tabular-nums" style={num}>{short(t.from)}원 이상{end != null ? ` ~ ${short(end)}원` : ""}</span><span className="text-[#0F1A30] tabular-nums" style={num}>{t.rate}%</span></div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-[#E3E8F0] overflow-hidden"><div className="h-full bg-[#2D4C82]" style={{ width: `${fill}%` }} /></div>
                    </div>
                  ); })}
                  {cur.next ? <div className="pt-1 text-[13px] font-bold text-[#3A4A66]">{baseLabel(p)} <b className="text-[#0F1A30] tabular-nums" style={num}>{won(cur.next.need)}원</b> 더 하면 <b className="text-[#2D4C82]">{cur.next.rate}%</b> 구간입니다</div> : <div className="pt-1 text-[13px] font-black text-[#2D4C82]">최고 구간에 도달했습니다</div>}
                </div>
              ) : <div className="mt-2 text-[13px] font-bold text-[#5B6B85]">단일 요율 {p.rate}%로 계산합니다</div>}
              {cur.accel > 1 && <div className="mt-2 text-[12.5px] font-black text-[#2D4C82]">목표 달성 가속 ×{cur.accel.toFixed(2)} 적용 중</div>}
              {cur.excluded.n > 0 && <div className="mt-2 text-[12.5px] font-bold text-[#6B5320]">마진율 {p.minMargin}% 미만 {cur.excluded.n}건({short(cur.excluded.sale)}원)은 인센티브에서 제외</div>}
            </BookCard>
          )}
          <BookCard en="WHAT-IF" title="수주 시뮬레이터">
            <div className="text-[12.5px] font-bold text-[#7A879C] mb-2.5">새 화주를 수주하면 인센티브가 얼마나 늘어나는지 미리 계산합니다</div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>예상 월 매출</Label><MoneyInput value={sim.rev} onChange={(v) => setSim({ ...sim, rev: v })} /></div>
              <div><Label>예상 마진율</Label><NumInput value={sim.margin} onChange={(v) => setSim({ ...sim, margin: v })} suffix="%" /></div>
            </div>
            <div className="mt-3 rounded-2xl bg-[#0F1A30] text-white px-4 py-3.5">
              {S.blocked ? <div className="text-[13.5px] font-black text-[#F7D48A]">마진율이 최저 기준({p.minMargin}%)보다 낮아 인센티브 대상이 아닙니다</div> : (
                <>
                  <div className="text-[11.5px] font-bold text-white/55">매달 늘어나는 인센티브</div>
                  <div className="text-[24px] font-black tabular-nums" style={num}>+{won(S.gain)}원</div>
                  <div className="mt-1 text-[12px] text-white/60">1년 유지 시 약 <b className="text-white tabular-nums" style={num}>{short(S.year)}원</b> · 늘어난 {baseLabel(p)}의 {S.rate.toFixed(1)}%{p.newBonus > 0 ? ` (신규 가산 +${p.newBonus}%p · ${p.newMonths}개월 포함)` : ""}</div>
                </>
              )}
            </div>
          </BookCard>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════ 영업 기회(파이프라인) ═════════════════════════
const blankLead = (who) => ({ name: "", contact: "", phone: "", stage: "lead", monthlyRevenue: "", monthlyOrders: "", marginRate: "10", prob: "", route: "", vehicle: "", nextDate: "", nextAction: "", rival: "", memo: "", lostReason: "", ownerUid: who.uid, ownerName: who.name });
function Pipeline({ B, who, company, isViewer }) {
  const narrow = useNarrow(900);
  const [mineOnly, setMineOnly] = React.useState(!who.canManage);
  const [edit, setEdit] = React.useState(null);
  const [closed, setClosed] = React.useState(""); // "" | "won" | "lost"
  const [mStage, setMStage] = React.useState("lead");
  const [busy, setBusy] = React.useState(false);
  const today = kstDay(); const ym = ymOf(0);
  const leads = B.leads.filter((l) => !mineOnly || l.ownerUid === who.uid);
  const P = pipelineSummary(leads, today);
  const canEdit = (l) => !isViewer && (who.canManage || !l.id || l.ownerUid === who.uid);
  const gainOf = (l) => simulateWin({ current: B.calc(l.ownerUid || who.uid, ym), policy: B.policy, monthlyRevenue: l.monthlyRevenue, marginRate: l.marginRate || 10 });

  const save = async (patch = {}) => {
    const f = { ...edit, ...patch };
    if (!cName(f.name)) { kpAlert("화주(회사) 이름을 입력해 주세요."); return; }
    setBusy(true);
    try {
      const data = { companyName: company, name: cName(f.name), contact: f.contact || "", phone: f.phone || "", stage: f.stage, monthlyRevenue: toInt(f.monthlyRevenue), monthlyOrders: toInt(f.monthlyOrders), marginRate: Number(f.marginRate) || 0, prob: f.prob === "" || f.prob == null ? "" : Number(f.prob) || 0, route: f.route || "", vehicle: f.vehicle || "", nextDate: f.nextDate || "", nextAction: f.nextAction || "", rival: f.rival || "", memo: f.memo || "", lostReason: f.lostReason || "", ownerUid: f.ownerUid || who.uid, ownerName: f.ownerName || who.name, touchedAt: today, wonAt: f.stage === "won" ? (f.wonAt || today) : "", updatedAt: serverTimestamp() };
      if (f.id) await updateDoc(doc(db, "salesLeads", f.id), data);
      else await addDoc(collection(db, "salesLeads"), { ...data, createdDay: today, createdAt: serverTimestamp() });
      // 수주 → 거래처 담당 자동 등록(이미 담당이 있는 거래처는 그대로)
      if (data.stage === "won" && !B.accounts.some((a) => cName(a.client) === data.name)) {
        await addDoc(collection(db, "salesAccounts"), { companyName: company, client: data.name, uid: data.ownerUid, name: data.ownerName, since: data.wonAt, memo: "영업 기회 수주", createdAt: serverTimestamp() });
      }
      setEdit(null);
    } catch (e) { kpAlert(`저장하지 못했습니다.\n${e?.message || e}`); } finally { setBusy(false); }
  };
  const move = async (l, dir) => {
    const order = OPEN_STAGES; const i = order.indexOf(l.stage); const next = order[i + dir];
    if (!next) return;
    try { await updateDoc(doc(db, "salesLeads", l.id), { stage: next, touchedAt: today, updatedAt: serverTimestamp() }); } catch (e) { kpAlert(`옮기지 못했습니다.\n${e?.message || e}`); }
  };
  const win = async () => {
    if (!(await kpConfirm(`「${edit.name}」을(를) 수주 처리할까요?\n\n· 거래처 담당에 ${edit.ownerName || who.name}님 거래처로 등록됩니다(수주일 오늘).\n· 거래처관리에 같은 이름으로 거래처를 등록하고 오더를 넣으면 실적·인센티브가 자동으로 잡힙니다.`, { title: "수주 처리", okText: "수주 처리" }))) return;
    save({ stage: "won", wonAt: today });
  };
  const remove = async () => {
    if (!(await kpConfirm("이 영업 기회를 삭제할까요?", { title: "삭제", okText: "삭제", danger: true }))) return;
    try { await deleteDoc(doc(db, "salesLeads", edit.id)); setEdit(null); } catch (e) { kpAlert(`삭제하지 못했습니다.\n${e?.message || e}`); }
  };

  const Card = ({ l }) => {
    const late = l.nextDate && l.nextDate < today; const g = OPEN_STAGES.includes(l.stage) && toInt(l.monthlyRevenue) > 0 ? gainOf(l) : null;
    const i = OPEN_STAGES.indexOf(l.stage);
    return (
      <div className="rounded-2xl border border-[#E3E8F0] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:border-[#4B6CB7] cursor-pointer" data-ro-allow onClick={() => setEdit({ ...blankLead(who), ...l, monthlyRevenue: String(l.monthlyRevenue || ""), monthlyOrders: String(l.monthlyOrders || ""), marginRate: String(l.marginRate ?? "10"), prob: l.prob === "" || l.prob == null ? "" : String(l.prob) })}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><div className="text-[14.5px] font-black text-[#0F1A30] truncate">{l.name}</div><div className="text-[12px] font-bold text-[#7A879C] truncate">{[l.route, l.vehicle].filter(Boolean).join(" · ") || l.contact || "노선 미입력"}</div></div>
          <span className="shrink-0 text-[11.5px] font-black text-[#2D4C82] tabular-nums" style={num}>{leadProb(l)}%</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2"><span className="text-[15px] font-black text-[#0F1A30] tabular-nums" style={num}>{short(l.monthlyRevenue)}원<span className="text-[11px] font-bold text-[#9AA9C3]"> /월</span></span>{g && !g.blocked && g.gain > 0 && <span className="text-[11.5px] font-black text-[#6B5320] tabular-nums whitespace-nowrap" style={num}>인센 +{short(g.gain)}</span>}</div>
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {l.nextDate ? <Tag tone={late ? "warn" : l.nextDate === today ? "dark" : ""}>{late ? `${dayGap(l.nextDate, today)}일 지남` : l.nextDate === today ? "오늘" : l.nextDate.slice(5).replace("-", ".")} {l.nextAction || "연락"}</Tag> : OPEN_STAGES.includes(l.stage) ? <Tag tone="dim">다음 일정 없음</Tag> : null}
          {(who.canManage && !mineOnly) && <Tag tone="dim">{l.ownerName}</Tag>}
          {l.stage === "won" && <Tag tone="dark">수주 {String(l.wonAt || "").slice(5).replace("-", ".")}</Tag>}
          {l.stage === "lost" && l.lostReason && <Tag tone="dim">{l.lostReason}</Tag>}
        </div>
        {canEdit(l) && i >= 0 && (
          <div className="mt-2 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button type="button" disabled={i === 0} onClick={() => move(l, -1)} className="flex-1 h-8 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#5B6B85] disabled:opacity-30">‹ 이전 단계</button>
            <button type="button" disabled={i === OPEN_STAGES.length - 1} onClick={() => move(l, 1)} className="flex-1 h-8 rounded-lg bg-[#EEF3FC] text-[12px] font-black text-[#2D4C82] disabled:opacity-30">다음 단계 ›</button>
          </div>
        )}
      </div>
    );
  };
  const col = (k) => leads.filter((l) => l.stage === k).sort((a, b) => String(a.nextDate || "9999").localeCompare(String(b.nextDate || "9999")));
  const openStages = LEAD_STAGES.filter((s) => OPEN_STAGES.includes(s.key));
  const ro = !!edit && !canEdit(edit);
  const set = (k) => (v) => setEdit((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));
  return (
    <div className="space-y-4">
      <BookHero en="SALES · PIPELINE" title="영업 기회" desc="새 화주를 발굴부터 수주까지 단계별로 관리합니다 — 다음 연락일을 넣어 두면 대시보드가 챙겨 줍니다"
        right={!isViewer && <button type="button" onClick={() => setEdit(blankLead(who))} className="h-9 px-3.5 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black whitespace-nowrap">+ 영업 기회 등록</button>}
        kpis={[["진행 중", `${P.open}곳`, `오늘 연락 ${P.today} · 지난 일정 ${P.overdue}`], ["예상 월 매출 합계", `${short(P.amount)}원`, "진행 중인 기회 전체"], ["가중 예상 매출", `${short(P.weighted)}원`, "월 매출 × 수주 확률"], ["수주율", `${P.winRate}%`, `이번 달 수주 ${P.wonMonth}곳`]]} />
      <div className="flex items-center gap-2 flex-wrap">
        {who.canManage && <><Chip on={!mineOnly} onClick={() => setMineOnly(false)}>영업팀 전체</Chip><Chip on={mineOnly} onClick={() => setMineOnly(true)}>내 기회만</Chip></>}
        <span className="ml-auto" />
        <Chip on={closed === "won"} onClick={() => setClosed(closed === "won" ? "" : "won")}>수주 {col("won").length}</Chip>
        <Chip on={closed === "lost"} onClick={() => setClosed(closed === "lost" ? "" : "lost")}>실패 {col("lost").length}</Chip>
      </div>
      {closed ? (
        <BookCard en={closed === "won" ? "WON" : "LOST"} title={closed === "won" ? "수주한 화주" : "실패한 영업 기회"}>
          {!col(closed).length ? <Empty>아직 없습니다</Empty> : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">{col(closed).map((l) => <Card key={l.id} l={l} />)}</div>}
        </BookCard>
      ) : narrow ? (
        <>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">{openStages.map((s) => <Chip key={s.key} on={mStage === s.key} onClick={() => setMStage(s.key)}>{s.label} {col(s.key).length}</Chip>)}</div>
          <div className="space-y-2.5">{!col(mStage).length ? <BookCard><Empty>이 단계의 영업 기회가 없습니다</Empty></BookCard> : col(mStage).map((l) => <Card key={l.id} l={l} />)}</div>
        </>
      ) : (
        <div className="grid grid-cols-4 gap-3 items-start">
          {openStages.map((s) => { const ls = col(s.key); return (
            <div key={s.key} className="rounded-[20px] bg-[#EDF1F7] border border-[#E3E8F0] p-2.5 min-w-0">
              <div className="px-1.5 pt-1 pb-2.5 flex items-center justify-between gap-2">
                <div className="text-[14px] font-black text-[#0F1A30]">{s.label} <span className="text-[#7A879C] tabular-nums" style={num}>{ls.length}</span></div>
                <div className="text-[12px] font-black text-[#2D4C82] tabular-nums" style={num}>{short(ls.reduce((a, l) => a + leadWeighted(l), 0))}원</div>
              </div>
              <div className="space-y-2">{ls.map((l) => <Card key={l.id} l={l} />)}{!ls.length && <div className="py-8 text-center text-[12.5px] font-bold text-[#9AA9C3]">없음</div>}</div>
            </div>
          ); })}
        </div>
      )}

      {edit && (
        <Sheet side en="SALES · OPPORTUNITY" title={edit.id ? edit.name || "영업 기회" : "영업 기회 등록"} onClose={() => setEdit(null)}
          footer={ro ? <button type="button" data-ro-allow className={`${btnLine} flex-1`} onClick={() => setEdit(null)}>닫기</button> : <>
            {edit.id && <button type="button" className={btnLine} onClick={remove}>삭제</button>}
            {edit.id && OPEN_STAGES.includes(edit.stage) && <button type="button" disabled={busy} className={btnLine} onClick={win}>수주 처리</button>}
            <button type="button" disabled={busy} className={`${btnDark} flex-1`} onClick={() => save()}>{busy ? "저장 중…" : "저장"}</button>
          </>}>
          <fieldset disabled={ro} className="space-y-4 min-w-0">
            <div><Label>화주(회사) 이름 *</Label><input value={edit.name} onChange={set("name")} className={inp} placeholder="예) ○○식품" /></div>
            <div className="grid grid-cols-2 gap-2.5">
              <div><Label>담당자</Label><input value={edit.contact} onChange={set("contact")} className={inp} placeholder="이름 · 직책" /></div>
              <div><Label>연락처</Label><input value={edit.phone} onChange={set("phone")} className={inp} placeholder="010-0000-0000" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div><Label>단계</Label><CustomSelect value={edit.stage} onChange={set("stage")} className={inp}>{LEAD_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.prob}%)</option>)}</CustomSelect></div>
              <div><Label>수주 확률(비우면 단계 기본값)</Label><NumInput value={edit.prob} onChange={set("prob")} suffix="%" /></div>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <div><Label>예상 월 매출</Label><MoneyInput value={edit.monthlyRevenue} onChange={set("monthlyRevenue")} /></div>
              <div><Label>예상 월 건수</Label><MoneyInput value={edit.monthlyOrders} onChange={set("monthlyOrders")} /></div>
              <div><Label>예상 마진율</Label><NumInput value={edit.marginRate} onChange={set("marginRate")} suffix="%" /></div>
            </div>
            {toInt(edit.monthlyRevenue) > 0 && (() => { const g = gainOf(edit); return (
              <div className="rounded-2xl bg-[#0F1A30] text-white px-4 py-3">
                {g.blocked ? <div className="text-[13px] font-black text-[#F7D48A]">마진율이 최저 기준({B.policy.minMargin}%)보다 낮아 인센티브 대상이 아닙니다 — 단가를 다시 협의해 보세요</div>
                  : <><div className="text-[11.5px] font-bold text-white/55">수주하면 {edit.ownerName || "담당자"}님 인센티브</div><div className="text-[20px] font-black tabular-nums" style={num}>매달 +{won(g.gain)}원 <span className="text-[12px] font-bold text-white/55">· 1년 약 {short(g.year)}원</span></div></>}
              </div>
            ); })()}
            <div className="grid grid-cols-2 gap-2.5">
              <div><Label>주요 노선</Label><input value={edit.route} onChange={set("route")} className={inp} placeholder="예) 인천 → 부산" /></div>
              <div><Label>차종 · 톤수</Label><input value={edit.vehicle} onChange={set("vehicle")} className={inp} placeholder="예) 5톤 윙바디" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div><Label>다음 연락일</Label><CustomDatePicker value={edit.nextDate} onChange={set("nextDate")} className={inp} showIcon /></div>
              <div><Label>다음 할 일</Label><input value={edit.nextAction} onChange={set("nextAction")} className={inp} placeholder="예) 견적서 발송 · 방문" /></div>
            </div>
            <div><Label>지금 쓰는 운송사 · 경쟁 조건</Label><input value={edit.rival} onChange={set("rival")} className={inp} placeholder="예) △△물류 · 단가 5% 낮게 요청" /></div>
            {who.canManage && <div><Label>영업 담당자</Label><CustomSelect value={edit.ownerUid} onChange={(e) => { const s = B.staff.find((x) => x.uid === e.target.value); setEdit((p) => ({ ...p, ownerUid: e.target.value, ownerName: s?.name || p.ownerName })); }} className={inp}>{[...(B.staff.some((s) => s.uid === edit.ownerUid) ? [] : [{ uid: edit.ownerUid, name: edit.ownerName }]), ...B.staff].map((s) => <option key={s.uid} value={s.uid}>{s.name}{s.team ? ` · ${s.team}` : ""}</option>)}</CustomSelect></div>}
            {edit.stage === "lost" && <div><Label>실패 사유</Label><CustomSelect value={edit.lostReason} onChange={set("lostReason")} className={inp}><option value="">선택</option>{["단가", "기존 운송사 유지", "물량 없음", "차량 수급", "결제 조건", "연락 두절", "기타"].map((r) => <option key={r} value={r}>{r}</option>)}</CustomSelect></div>}
            <div><Label>메모</Label><textarea value={edit.memo} onChange={set("memo")} rows={4} className={`${inp} h-auto py-2.5 leading-relaxed`} placeholder="상담 내용 · 요구 조건 · 결제 조건 등" /></div>
          </fieldset>
        </Sheet>
      )}
    </div>
  );
}

// ═════════════════════════ 거래처 담당 ═════════════════════════
function Accounts({ B, who, company, isViewer, onGo }) {
  const narrow = useNarrow();
  const ym = ymOf(0); const today = kstDay();
  const [f, setF] = React.useState(who.canManage ? "전체" : "내 거래처");
  const [q, setQ] = React.useState("");
  const [edit, setEdit] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const all = React.useMemo(() => B.health(ym), [B, ym]);
  const mine = all.filter((h) => h.uid === who.uid);
  const scope = who.canManage ? all : mine;
  const filters = [...(who.canManage ? ["전체"] : []), "내 거래처", ...(who.canManage ? ["담당 없음"] : []), "신규", "급감", "휴면", "미수"];
  const rows = scope.filter((h) => (f === "전체" ? true : f === "내 거래처" ? h.uid === who.uid : f === "담당 없음" ? !h.uid : f === "신규" ? h.state === "new" : f === "급감" ? h.state === "drop" : f === "휴면" ? h.state === "sleep" : h.unpaid))
    .filter((h) => !q || h.client.includes(q.trim()) || h.rep.includes(q.trim()))
    .sort((a, b) => b.cur - a.cur || b.prev - a.prev || a.client.localeCompare(b.client, "ko"));
  const canAssign = who.canManage && !isViewer;
  const save = async () => {
    if (!edit.uid) { kpAlert("영업 담당자를 골라 주세요."); return; }
    setBusy(true);
    try {
      const s = B.staff.find((x) => x.uid === edit.uid);
      const data = { companyName: company, client: edit.client, uid: edit.uid, name: s?.name || edit.rep || "", since: edit.since || today, memo: edit.memo || "", updatedAt: serverTimestamp() };
      if (edit.accountId) await updateDoc(doc(db, "salesAccounts", edit.accountId), data);
      else await addDoc(collection(db, "salesAccounts"), { ...data, createdAt: serverTimestamp() });
      setEdit(null);
    } catch (e) { kpAlert(`저장하지 못했습니다.\n${e?.message || e}`); } finally { setBusy(false); }
  };
  const clear = async () => {
    if (!(await kpConfirm(`「${edit.client}」의 영업 담당을 해제할까요?\n해제하면 이 거래처 실적이 인센티브에서 빠집니다.`, { title: "담당 해제", okText: "해제", danger: true }))) return;
    try { await deleteDoc(doc(db, "salesAccounts", edit.accountId)); setEdit(null); } catch (e) { kpAlert(`해제하지 못했습니다.\n${e?.message || e}`); }
  };
  const open = (h) => setEdit({ ...h, memo: B.accounts.find((a) => a.id === h.accountId)?.memo || "", since: h.since || (h.first && h.first < today ? h.first : today) });
  const St = ({ h }) => <><Tag tone={HEALTH[h.state].tone === "warn" ? "warn" : HEALTH[h.state].tone === "dim" ? "dim" : h.state === "steady" ? "dim" : ""}>{HEALTH[h.state].label}</Tag>{h.unpaid && <> <Tag tone="warn">미수</Tag></>}</>;
  const chg = (h) => (h.p30 > 0 || h.r30 > 0 ? `${h.change >= 0 ? "+" : ""}${h.change.toFixed(0)}%` : "-");
  const cnt = (fn) => scope.filter(fn).length;
  return (
    <div className="space-y-4">
      <BookHero en="SALES · ACCOUNTS" title="거래처 담당" desc="거래처마다 영업 담당자와 수주일을 정합니다 — 수주일 이후 오더가 그 사람의 실적·인센티브로 잡힙니다"
        right={<button type="button" data-ro-allow onClick={() => onGo?.("거래처관리")} className="h-9 px-3.5 rounded-xl bg-white/10 border border-white/15 text-[13.5px] font-black whitespace-nowrap">거래처관리 열기 ›</button>}
        kpis={[[who.canManage ? "담당 있는 거래처" : "내 거래처", `${cnt((h) => !!h.uid)}곳`, who.canManage ? `담당 없음 ${cnt((h) => !h.uid)}곳` : "수주일 이후 오더만 실적"], ["이번 달 매출", `${short(scope.filter((h) => h.uid).reduce((s, h) => s + h.cur, 0))}원`, "담당 있는 거래처 합계"], ["급감 · 휴면", `${cnt((h) => h.uid && (h.state === "drop" || h.state === "sleep"))}곳`, "최근 30일 −30% · 30일 무오더"], ["지난달 미수", `${cnt((h) => h.uid && h.unpaid)}곳`, "수금되면 인센티브 확정"]]} />
      <BookCard flush>
        <div className="px-3.5 md:px-4 py-3 border-b border-[#EEF1F6] flex items-center gap-2 flex-wrap">
          {filters.map((t) => <Chip key={t} on={f === t} onClick={() => setF(t)}>{t}</Chip>)}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처 · 담당자 검색" className="w-full md:w-auto md:ml-auto md:min-w-[180px] h-9 px-3 rounded-xl border border-[#DCE3EE] bg-[#F8FAFD] text-[13.5px] outline-none focus:border-[#2D4C82]" />
        </div>
        {!rows.length ? <Empty>{f === "내 거래처" ? <>아직 내 거래처가 없습니다.<br />{who.canManage ? "거래처를 눌러 담당자를 정해 주세요." : "영업 기회를 수주 처리하거나, 영업 관리자에게 거래처 담당 지정을 요청하세요."}</> : "해당하는 거래처가 없습니다"}</Empty> : narrow ? (
          <div className="divide-y divide-[#EEF2F8]">
            {rows.slice(0, 200).map((h) => (
              <button key={h.client} type="button" data-ro-allow onClick={() => open(h)} className="w-full text-left px-4 py-3">
                <div className="flex items-center justify-between gap-2"><span className="text-[14.5px] font-black text-[#0F1A30] truncate">{h.client}</span><span className="text-[14px] font-black text-[#0F1A30] tabular-nums shrink-0" style={num}>{short(h.cur)}원</span></div>
                <div className="mt-1 flex items-center gap-1.5 flex-wrap"><St h={h} /><span className="text-[12px] font-bold text-[#7A879C]">{h.rep || "담당 없음"}{h.last ? ` · 마지막 오더 ${h.last.slice(5).replace("-", ".")}` : ""} · 30일 {chg(h)}</span></div>
              </button>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse" style={{ minWidth: 860 }}>
              <thead><tr className="bg-[#0F1A30] text-white"><Th>거래처</Th><Th w={130}>영업 담당</Th><Th w={96}>수주일</Th><Th right w={120}>이번 달 매출</Th><Th right w={120}>지난달 매출</Th><Th right w={90}>최근 30일</Th><Th w={100}>마지막 오더</Th><Th w={130}>상태</Th></tr></thead>
              <tbody>
                {rows.slice(0, 300).map((h, i) => (
                  <tr key={h.client} data-ro-allow onClick={() => open(h)} className={`cursor-pointer hover:bg-[#F2F6FD] border-t border-[#EEF2F8] ${i % 2 ? "bg-[#FBFCFE]" : "bg-white"}`}>
                    <Td bold>{h.client}</Td><Td>{h.rep || <span className="text-[#B42318] font-black">담당 없음</span>}</Td><Td>{h.since ? h.since.slice(2).replace(/-/g, ".") : "-"}</Td>
                    <Td right bold>{won(h.cur)}</Td><Td right>{won(h.prev)}</Td><Td right className={h.change <= -30 ? "!text-[#B42318] !font-black" : h.change >= 30 ? "!text-[#2D4C82] !font-black" : ""}>{chg(h)}</Td>
                    <Td>{h.last ? `${h.last.slice(5).replace("-", ".")}${h.idle > 0 ? ` (${h.idle}일 전)` : ""}` : "-"}</Td><Td><St h={h} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 300 && <div className="py-3 text-center text-[12.5px] font-bold text-[#9AA9C3]">위 300곳만 보입니다 — 검색으로 좁혀 주세요</div>}
          </div>
        )}
      </BookCard>

      {edit && (
        <Sheet en="SALES · ACCOUNT" title={edit.client} onClose={() => setEdit(null)}
          footer={canAssign ? <>{edit.accountId && <button type="button" className={btnLine} onClick={clear}>담당 해제</button>}<button type="button" disabled={busy} className={`${btnDark} flex-1`} onClick={save}>{busy ? "저장 중…" : "저장"}</button></> : <button type="button" data-ro-allow className={`${btnLine} flex-1`} onClick={() => setEdit(null)}>닫기</button>}>
          <div className="grid grid-cols-2 gap-2">
            {[["이번 달 매출", `${won(edit.cur)}원`], ["이번 달 매출이익", `${won(edit.curProfit)}원`], ["지난달 매출", `${won(edit.prev)}원`], ["최근 12개월", `${short(edit.total)}원 · ${edit.n}건`]].map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-white border border-[#E3E8F0] px-3.5 py-2.5"><div className="text-[11.5px] font-bold text-[#7A879C]">{l}</div><div className="text-[15.5px] font-black text-[#0F1A30] tabular-nums" style={num}>{v}</div></div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap"><St h={edit} />{edit.last && <span className="text-[12.5px] font-bold text-[#5B6B85]">마지막 오더 {edit.last}{edit.idle > 0 ? ` · ${edit.idle}일 전` : ""}</span>}</div>
          {edit.state === "sleep" && <div className="rounded-2xl border border-[#E8D9B0] bg-[#FBF5E4] px-4 py-3 text-[13px] font-bold text-[#6B5320]">30일 넘게 오더가 없습니다 — 영업 활동에 안부 연락을 남기고 물량 계획을 확인해 보세요.</div>}
          {edit.state === "drop" && <div className="rounded-2xl border border-[#E8D9B0] bg-[#FBF5E4] px-4 py-3 text-[13px] font-bold text-[#6B5320]">최근 30일 매출이 그 전 30일보다 {Math.abs(edit.change).toFixed(0)}% 줄었습니다 — 다른 운송사로 넘어가는지 확인이 필요합니다.</div>}
          <fieldset disabled={!canAssign} className="space-y-3 min-w-0">
            <div><Label>영업 담당자</Label><CustomSelect value={edit.uid} onChange={(e) => setEdit((p) => ({ ...p, uid: e.target.value }))} className={inp}><option value="">담당 없음</option>{[...(edit.uid && !B.staff.some((s) => s.uid === edit.uid) ? [{ uid: edit.uid, name: edit.rep }] : []), ...B.staff].map((s) => <option key={s.uid} value={s.uid}>{s.name}{s.team ? ` · ${s.team}` : ""}</option>)}</CustomSelect></div>
            <div><Label>수주일(이 날부터의 오더가 실적)</Label><CustomDatePicker value={edit.since} onChange={(e) => setEdit((p) => ({ ...p, since: e.target.value }))} className={inp} showIcon /></div>
            <div><Label>메모</Label><input value={edit.memo} onChange={(e) => setEdit((p) => ({ ...p, memo: e.target.value }))} className={inp} placeholder="예) 소개 영업 · 계약 조건" /></div>
          </fieldset>
          {!canAssign && <div className="text-[12.5px] font-bold text-[#7A879C]">거래처 담당은 영업 관리자가 정합니다.</div>}
        </Sheet>
      )}
    </div>
  );
}

// ═════════════════════════ 영업 활동(달력) ═════════════════════════
const ACT_TYPES = ["방문", "전화", "견적 제출", "미팅", "계약", "접대", "기타"];
const blankAct = (who, date) => ({ date: date || kstDay(), type: "방문", target: "", summary: "", result: "", nextDate: "", nextAction: "", ownerUid: who.uid, ownerName: who.name });
function Activity({ B, who, company, isViewer }) {
  const [ym, setYm] = React.useState(ymOf(0));
  const [mineOnly, setMineOnly] = React.useState(!who.canManage);
  const [day, setDay] = React.useState(kstDay());
  const [edit, setEdit] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const today = kstDay();
  const acts = B.activities.filter((a) => !mineOnly || a.ownerUid === who.uid);
  const leads = B.leads.filter((l) => OPEN_STAGES.includes(l.stage) && (!mineOnly || l.ownerUid === who.uid));
  // 날짜별 — 한 일(활동) / 예정(다음 연락일)
  const byDay = React.useMemo(() => {
    const m = {};
    const add = (d, x) => { if (!d) return; (m[d] = m[d] || []).push(x); };
    acts.forEach((a) => { add(a.date, { kind: "done", id: a.id, label: `${a.type} · ${a.target || ""}`, a }); if (a.nextDate) add(a.nextDate, { kind: "plan", id: `${a.id}-n`, label: `${a.nextAction || "후속"} · ${a.target || ""}`, a }); });
    leads.forEach((l) => { if (l.nextDate) add(l.nextDate, { kind: "plan", id: `l-${l.id}`, label: `${l.nextAction || "연락"} · ${l.name}`, l }); });
    return m;
  }, [acts, leads]);
  const first = new Date(`${ym}-01T00:00:00Z`); const startDow = first.getUTCDay();
  const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [...Array(startDow).fill(null), ...Array.from({ length: dim }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const monthActs = acts.filter((a) => String(a.date || "").startsWith(ym));
  const cntType = (t) => monthActs.filter((a) => a.type === t).length;
  const planN = Object.entries(byDay).filter(([d]) => d >= today).reduce((s, [, v]) => s + v.filter((x) => x.kind === "plan").length, 0);
  const names = React.useMemo(() => [...new Set([...B.leads.map((l) => l.name), ...B.accounts.map((a) => a.client)])].filter(Boolean), [B.leads, B.accounts]);
  const canEdit = (a) => !isViewer && (who.canManage || !a.id || a.ownerUid === who.uid);
  const save = async () => {
    if (!cName(edit.target)) { kpAlert("만난 곳(거래처·화주) 이름을 입력해 주세요."); return; }
    setBusy(true);
    try {
      const data = { companyName: company, date: edit.date || today, type: edit.type, target: cName(edit.target), summary: edit.summary || "", result: edit.result || "", nextDate: edit.nextDate || "", nextAction: edit.nextAction || "", ownerUid: edit.ownerUid || who.uid, ownerName: edit.ownerName || who.name, updatedAt: serverTimestamp() };
      if (edit.id) await updateDoc(doc(db, "salesActivities", edit.id), data);
      else await addDoc(collection(db, "salesActivities"), { ...data, createdAt: serverTimestamp() });
      // 같은 이름의 진행 중 영업 기회가 있으면 마지막 연락일 · 다음 연락일을 맞춘다
      const lead = B.leads.find((l) => OPEN_STAGES.includes(l.stage) && cName(l.name) === data.target);
      if (lead) await updateDoc(doc(db, "salesLeads", lead.id), { touchedAt: data.date > today ? today : data.date, ...(data.nextDate ? { nextDate: data.nextDate, nextAction: data.nextAction || lead.nextAction || "" } : {}), updatedAt: serverTimestamp() }).catch(() => {});
      setDay(data.date); setEdit(null);
    } catch (e) { kpAlert(`저장하지 못했습니다.\n${e?.message || e}`); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!(await kpConfirm("이 활동 기록을 삭제할까요?", { title: "삭제", okText: "삭제", danger: true }))) return;
    try { await deleteDoc(doc(db, "salesActivities", edit.id)); setEdit(null); } catch (e) { kpAlert(`삭제하지 못했습니다.\n${e?.message || e}`); }
  };
  const dayItems = byDay[day] || [];
  const ro = !!edit && !canEdit(edit);
  const set = (k) => (v) => setEdit((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));
  return (
    <div className="space-y-4">
      <BookHero en="SALES · ACTIVITY" title="영업 활동" desc="방문 · 전화 · 견적 · 미팅을 기록하고 다음 일정을 달력으로 챙깁니다"
        right={<div className="flex items-center gap-2 flex-wrap justify-end"><MonthNav ym={ym} setYm={setYm} max={ymOf(12)} />{!isViewer && <button type="button" onClick={() => setEdit(blankAct(who, day))} className="h-9 px-3.5 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black whitespace-nowrap">+ 활동 기록</button>}</div>}
        kpis={[["이 달 활동", `${monthActs.length}건`, `방문 ${cntType("방문")} · 전화 ${cntType("전화")}`], ["견적 제출", `${cntType("견적 제출")}건`, `미팅 ${cntType("미팅")} · 계약 ${cntType("계약")}`], ["만난 곳", `${new Set(monthActs.map((a) => a.target)).size}곳`, "이 달 서로 다른 거래처·화주"], ["앞으로 예정", `${planN}건`, "다음 연락일 · 후속 일정"]]} />
      {who.canManage && <div className="flex gap-2"><Chip on={!mineOnly} onClick={() => setMineOnly(false)}>영업팀 전체</Chip><Chip on={mineOnly} onClick={() => setMineOnly(true)}>내 활동만</Chip></div>}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <BookCard en="CALENDAR" title={`${ym.replace("-", "년 ")}월`} right={<button type="button" data-ro-allow className={btnLine} onClick={() => { setYm(ymOf(0)); setDay(today); }}>오늘</button>}>
          <div className="grid grid-cols-7 text-center text-[12px] font-black text-[#7A879C] pb-1.5">{["일", "월", "화", "수", "목", "금", "토"].map((d, i) => <div key={d} className={i === 0 ? "text-[#B42318]" : i === 6 ? "text-[#2D4C82]" : ""}>{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => { if (!d) return <div key={`e${i}`} />; const its = byDay[d] || []; const on = d === day; const dow = i % 7; return (
              <button key={d} type="button" data-ro-allow onClick={() => setDay(d)} className={`min-h-[58px] md:min-h-[84px] rounded-xl border p-1.5 text-left align-top flex flex-col gap-0.5 overflow-hidden ${on ? "border-[#0F1A30] bg-[#EEF3FC]" : d === today ? "border-[#4B6CB7] bg-white" : "border-[#EEF1F6] bg-white hover:border-[#C9D6EE]"}`}>
                <span className={`text-[12.5px] font-black tabular-nums ${d === today ? "text-white bg-[#0F1A30] rounded-md px-1.5" : dow === 0 ? "text-[#B42318]" : dow === 6 ? "text-[#2D4C82]" : "text-[#3A4A66]"} self-start`} style={num}>{Number(d.slice(8))}</span>
                <span className="hidden md:flex flex-col gap-0.5 min-w-0 w-full">{its.slice(0, 2).map((x) => <span key={x.id} className={`truncate rounded px-1 text-[10.5px] font-black ${x.kind === "done" ? "bg-[#0F1A30] text-white" : "bg-[#F3E7CC] text-[#6B5320]"}`}>{x.label}</span>)}{its.length > 2 && <span className="text-[10.5px] font-bold text-[#7A879C]">+{its.length - 2}</span>}</span>
                {its.length > 0 && <span className="md:hidden flex gap-0.5">{its.some((x) => x.kind === "done") && <span className="w-1.5 h-1.5 rounded-full bg-[#0F1A30]" />}{its.some((x) => x.kind === "plan") && <span className="w-1.5 h-1.5 rounded-full bg-[#B88A2E]" />}</span>}
              </button>
            ); })}
          </div>
          <div className="mt-2.5 flex items-center gap-3 text-[12px] font-bold text-[#7A879C]"><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#0F1A30]" />한 일</span><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#E8D9B0]" />예정</span></div>
        </BookCard>
        <BookCard en="DAY" title={`${day.slice(5).replace("-", "월 ")}일`} right={!isViewer && <button type="button" className={btnDark} onClick={() => setEdit(blankAct(who, day))}>+ 기록</button>}>
          {!dayItems.length ? <Empty>이 날 기록이나 예정이 없습니다</Empty> : (
            <div className="space-y-2">
              {dayItems.map((x) => (
                <button key={x.id} type="button" data-ro-allow onClick={() => x.a && setEdit({ ...blankAct(who), ...x.a })} className={`w-full text-left rounded-2xl border px-3.5 py-2.5 ${x.kind === "done" ? "border-[#E3E8F0] bg-white" : "border-[#E8D9B0] bg-[#FBF5E4]"}`}>
                  <div className="flex items-center gap-1.5"><Tag tone={x.kind === "done" ? "dark" : "warn"}>{x.kind === "done" ? x.a.type : "예정"}</Tag><span className="text-[14px] font-black text-[#0F1A30] truncate">{x.a ? x.a.target : x.l.name}</span>{who.canManage && !mineOnly && <span className="ml-auto text-[11.5px] font-bold text-[#7A879C] shrink-0">{x.a ? x.a.ownerName : x.l.ownerName}</span>}</div>
                  <div className="mt-1 text-[12.5px] font-semibold text-[#5B6B85] line-clamp-2">{x.kind === "done" ? (x.a.summary || x.a.result || "내용 없음") : (x.a ? `${x.a.nextAction || "후속 일정"} (${x.a.date.slice(5).replace("-", ".")} ${x.a.type} 후속)` : `${x.l.nextAction || "연락"} · 영업 기회 ${stageOf(x.l.stage).label} 단계`)}</div>
                </button>
              ))}
            </div>
          )}
        </BookCard>
      </div>

      {edit && (
        <Sheet en="SALES · ACTIVITY" title={edit.id ? "활동 기록" : "활동 기록 추가"} onClose={() => setEdit(null)}
          footer={ro ? <button type="button" data-ro-allow className={`${btnLine} flex-1`} onClick={() => setEdit(null)}>닫기</button> : <>{edit.id && <button type="button" className={btnLine} onClick={remove}>삭제</button>}<button type="button" disabled={busy} className={`${btnDark} flex-1`} onClick={save}>{busy ? "저장 중…" : "저장"}</button></>}>
          <fieldset disabled={ro} className="space-y-3 min-w-0">
            <div className="grid grid-cols-2 gap-2.5">
              <div><Label>날짜</Label><CustomDatePicker value={edit.date} onChange={set("date")} className={inp} showIcon /></div>
              <div><Label>유형</Label><CustomSelect value={edit.type} onChange={set("type")} className={inp}>{ACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</CustomSelect></div>
            </div>
            <div><Label>만난 곳(거래처 · 화주) *</Label><input list="kp-sales-names" value={edit.target} onChange={set("target")} className={inp} placeholder="이름을 입력하면 등록된 곳이 뜹니다" /><datalist id="kp-sales-names">{names.slice(0, 300).map((n) => <option key={n} value={n} />)}</datalist></div>
            <div><Label>내용</Label><textarea value={edit.summary} onChange={set("summary")} rows={3} className={`${inp} h-auto py-2.5 leading-relaxed`} placeholder="상담 내용 · 요청 사항" /></div>
            <div><Label>결과</Label><input value={edit.result} onChange={set("result")} className={inp} placeholder="예) 견적 요청 받음 · 다음 주 재방문" /></div>
            <div className="grid grid-cols-2 gap-2.5">
              <div><Label>다음 일정</Label><CustomDatePicker value={edit.nextDate} onChange={set("nextDate")} className={inp} showIcon /></div>
              <div><Label>다음 할 일</Label><input value={edit.nextAction} onChange={set("nextAction")} className={inp} placeholder="예) 견적서 발송" /></div>
            </div>
          </fieldset>
        </Sheet>
      )}
    </div>
  );
}

// ═════════════════════════ 인센티브 ═════════════════════════
const incId = (company, ym, uid) => `${company}_${ym}_${uid}`.replace(/\//g, "_");
function Incentive({ B, who, company, isViewer }) {
  const narrow = useNarrow();
  const [ym, setYm] = React.useState(ymOf(0));
  const [rep, setRep] = React.useState(who.canManage && !B.reps.some((r) => r.uid === who.uid) ? (B.reps[0]?.uid || who.uid) : who.uid);
  const uid = who.canManage ? rep : who.uid;
  const [busy, setBusy] = React.useState(false);
  const cur = React.useMemo(() => B.calc(uid, ym), [B, uid, ym]);
  const team = React.useMemo(() => (who.canManage ? B.team(ym) : []), [B, ym, who.canManage]);
  const p = B.policy;
  const saved = (u) => B.incentives.find((x) => x.ym === ym && x.uid === u) || null;
  const mineSaved = saved(uid);
  const repName = B.reps.find((r) => r.uid === uid)?.name || who.name;
  const canAct = who.canManage && !isViewer;
  const confirmOne = async (c, name, silent = false) => {
    const amount = p.collectOnly ? c.confirmed : c.total;
    await setDoc(doc(db, "salesIncentives", incId(company, ym, c.uid)), { companyName: company, ym, uid: c.uid, name, amount, total: c.total, held: c.held, sale: c.sale, profit: c.profit, base: c.base, rate: Number(c.effRate.toFixed(2)), status: "확정", rows: c.rows.map((x) => ({ client: x.client, n: x.n, sale: x.sale, profit: x.sale - x.buy, base: x.base, rate: Number(x.rate.toFixed(2)), amount: x.amount, collected: !!x.collected, isNew: !!x.isNew })), policyBase: p.base, confirmedBy: who.name, confirmedAt: serverTimestamp() }, { merge: true });
    if (!silent) kpAlert(`${name}님 ${Number(ym.slice(5))}월 인센티브 ${won(amount)}원을 확정했습니다.`);
  };
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { kpAlert(`처리하지 못했습니다.\n${e?.message || e}`); } finally { setBusy(false); } };
  const confirmMine = async () => {
    const amount = p.collectOnly ? cur.confirmed : cur.total;
    if (!(await kpConfirm(`${repName}님 ${Number(ym.slice(5))}월 인센티브를 확정할까요?\n\n지급 확정 ${won(amount)}원${p.collectOnly && cur.held > 0 ? `\n보류 ${won(cur.held)}원(미수 — 수금된 뒤 다시 확정하면 더해집니다)` : ""}`, { title: "인센티브 확정", okText: "확정" }))) return;
    run(() => confirmOne(cur, repName));
  };
  const confirmAll = async () => {
    const list = team.filter((t) => t.total > 0 && saved(t.uid)?.status !== "지급완료");
    if (!list.length) { kpAlert("확정할 인센티브가 없습니다."); return; }
    if (!(await kpConfirm(`${Number(ym.slice(5))}월 인센티브를 ${list.length}명 한 번에 확정할까요?\n합계 ${won(list.reduce((s, t) => s + (p.collectOnly ? t.confirmed : t.total), 0))}원`, { title: "전체 확정", okText: "확정" }))) return;
    run(async () => { for (const t of list) await confirmOne(t, t.name, true); kpAlert(`${list.length}명 확정했습니다.`); });
  };
  const markPaid = async (u, name) => {
    const s = saved(u); if (!s) return;
    if (!(await kpConfirm(`${name}님 ${Number(ym.slice(5))}월 인센티브 ${won(s.amount)}원을 지급 완료로 처리할까요?`, { title: "지급 완료", okText: "지급 완료" }))) return;
    run(() => updateDoc(doc(db, "salesIncentives", incId(company, ym, u)), { status: "지급완료", paidBy: who.name, paidAt: serverTimestamp(), paidDay: kstDay() }));
  };
  const csv = () => {
    const head = ["거래처", "건수", "매출", "매출이익", "기준금액", "요율(%)", "인센티브", "수금", "신규"];
    const lines = cur.rows.map((x) => [x.client, x.n, x.sale, x.sale - x.buy, x.base, x.rate.toFixed(2), x.amount, x.collected ? "수금 완료" : "미수", x.isNew ? "신규" : ""]);
    const text = [head, ...lines, ["합계", cur.n, cur.sale, cur.profit, cur.base, cur.effRate.toFixed(2), cur.total, "", ""]].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" })); a.download = `인센티브_${repName}_${ym}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };
  const StBadge = ({ s }) => (!s ? <Tag tone="dim">미확정</Tag> : s.status === "지급완료" ? <Tag tone="dark">지급 완료</Tag> : <Tag>확정</Tag>);
  const tierSum = tierAmount(p, cur.base);
  return (
    <div className="space-y-4">
      <BookHero en="SALES · INCENTIVE" title="인센티브" desc={`${baseLabel(p)} 기준${p.useTiers ? " · 구간 누진" : ` · ${p.rate}%`}${p.collectOnly ? " · 수금 완료분만 확정" : ""} — 계산 과정을 거래처별로 모두 보여 줍니다`}
        right={<div className="flex items-center gap-2 flex-wrap justify-end">{who.canManage && <RepPick B={B} value={rep} onChange={setRep} all={false} />}<MonthNav ym={ym} setYm={setYm} /></div>}
        kpis={[["예상 인센티브", `${won(cur.total)}원`, `${baseLabel(p)} ${short(cur.base)}원 × ${cur.effRate.toFixed(1)}%`], ["지급 확정", `${won(p.collectOnly ? cur.confirmed : cur.total)}원`, p.collectOnly ? "수금(정산완료)된 거래처분" : "전액"], ["보류", `${won(p.collectOnly ? cur.held : 0)}원`, "미수 — 수금되면 확정"], ["처리 상태", mineSaved ? mineSaved.status : "미확정", mineSaved ? `확정액 ${won(mineSaved.amount)}원` : `지급일 다음 달 ${p.payDay}일`]]} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <BookCard flush en="STATEMENT" title={`${repName} · ${Number(ym.slice(5))}월 인센티브 내역`} right={<div className="flex gap-2 pr-4"><button type="button" data-ro-allow className={btnLine} onClick={csv}>엑셀(CSV)</button>{canAct && <button type="button" disabled={busy || !cur.total || mineSaved?.status === "지급완료"} className={btnDark} onClick={confirmMine}>{mineSaved ? "다시 확정" : "확정"}</button>}{canAct && mineSaved?.status === "확정" && <button type="button" disabled={busy} className={btnLine} onClick={() => markPaid(uid, repName)}>지급 완료</button>}</div>}>
          {!cur.rows.length ? <Empty>이 달 인센티브 대상 실적이 없습니다.<br />거래처 담당이 정해져 있고, 수주일 이후 배차완료된 오더가 있어야 합니다.</Empty> : narrow ? (
            <div className="divide-y divide-[#EEF2F8]">
              {cur.rows.map((x) => (
                <div key={x.client} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2"><span className="text-[14.5px] font-black text-[#0F1A30] truncate">{x.client} {x.isNew && <Tag>신규</Tag>}</span><span className="text-[14.5px] font-black text-[#2D4C82] tabular-nums shrink-0" style={num}>{won(x.amount)}원</span></div>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[12px] font-bold text-[#7A879C]">{x.collected ? <Tag tone="dark">수금 완료</Tag> : <Tag tone="warn">미수 · 보류</Tag>}<span className="tabular-nums" style={num}>매출 {short(x.sale)} · 이익 {short(x.sale - x.buy)} · {x.rate.toFixed(1)}%</span></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse" style={{ minWidth: 760 }}>
                <thead><tr className="bg-[#0F1A30] text-white"><Th>거래처</Th><Th right w={56}>건수</Th><Th right w={116}>매출</Th><Th right w={116}>매출이익</Th><Th right w={116}>기준금액</Th><Th right w={76}>요율</Th><Th right w={116}>인센티브</Th><Th w={96}>수금</Th></tr></thead>
                <tbody>
                  {cur.rows.map((x, i) => (
                    <tr key={x.client} className={`border-t border-[#EEF2F8] ${i % 2 ? "bg-[#FBFCFE]" : "bg-white"}`}>
                      <Td bold>{x.client} {x.isNew && <Tag>신규 +{p.newBonus}%p</Tag>} {x.isMature && <Tag tone="dim">장기 {p.matureFactor}%</Tag>} {x.exN > 0 && <Tag tone="warn">저마진 {x.exN}건 제외</Tag>}</Td>
                      <Td right>{x.n}</Td><Td right>{won(x.sale)}</Td><Td right>{won(x.sale - x.buy)}</Td><Td right bold>{won(x.base)}</Td><Td right>{x.rate.toFixed(2)}%</Td><Td right bold className="!text-[#2D4C82]">{won(x.amount)}</Td>
                      <Td>{x.collected ? <Tag tone="dark">수금 완료</Tag> : <Tag tone="warn">미수 · 보류</Tag>}</Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-[3px] border-double border-[#0F1A30] bg-[#F5F8FD]"><Td bold>합계</Td><Td right bold>{cur.n}</Td><Td right bold>{won(cur.sale)}</Td><Td right bold>{won(cur.profit)}</Td><Td right bold>{won(cur.base)}</Td><Td right bold>{cur.effRate.toFixed(2)}%</Td><Td right bold className="!text-[#2D4C82]">{won(cur.total)}</Td><Td /></tr></tfoot>
              </table>
            </div>
          )}
        </BookCard>
        <BookCard en="HOW IT IS CALCULATED" title="계산 과정">
          <ol className="space-y-2.5 text-[13px] font-semibold text-[#3A4A66] leading-relaxed">
            <li><b className="text-[#0F1A30]">① 기준금액</b> — 내 거래처의 수주일 이후 배차완료 오더 {baseLabel(p)} 합계 <b className="tabular-nums text-[#0F1A30]" style={num}>{won(cur.base)}원</b>{p.minMargin > 0 && <> (마진율 {p.minMargin}% 미만 오더 제외{cur.excluded.n ? ` · ${cur.excluded.n}건` : ""})</>}</li>
            <li><b className="text-[#0F1A30]">② 요율</b> — {p.useTiers ? <>구간 누진 {p.tiers.map((t) => `${short(t.from)}원~ ${t.rate}%`).join(" / ")} → <b className="tabular-nums text-[#0F1A30]" style={num}>{won(tierSum)}원</b> (평균 {cur.effRate.toFixed(2)}%)</> : <>단일 요율 {p.rate}% → <b className="tabular-nums text-[#0F1A30]" style={num}>{won(tierSum)}원</b></>}</li>
            {p.newBonus > 0 && <li><b className="text-[#0F1A30]">③ 신규 가산</b> — 수주 후 {p.newMonths}개월 안의 거래처는 +{p.newBonus}%p ({cur.newClients}곳)</li>}
            {p.matureMonths > 0 && <li><b className="text-[#0F1A30]">④ 장기 거래처</b> — 수주 {p.matureMonths}개월 뒤부터 요율의 {p.matureFactor}%</li>}
            {p.accelOn && <li><b className="text-[#0F1A30]">⑤ 목표 가속</b> — 매출 목표 {p.accelOver}% 이상 달성 시 ×{(p.accelFactor / 100).toFixed(2)} {cur.target > 0 ? <>(지금 {cur.achieve.toFixed(0)}% → {cur.accel > 1 ? "적용" : "미적용"})</> : "(목표 미설정)"}</li>}
            {p.cap > 0 && <li><b className="text-[#0F1A30]">⑥ 월 상한</b> — {won(p.cap)}원{cur.capped ? " (상한 적용됨)" : ""}</li>}
            <li><b className="text-[#0F1A30]">⑦ 지급</b> — {p.collectOnly ? "거래처정산에서 그 달이 「정산완료」된 거래처분만 확정, 나머지는 보류" : "전액 확정"} · 다음 달 {p.payDay}일</li>
          </ol>
          <div className="mt-3 rounded-2xl bg-[#0F1A30] text-white px-4 py-3"><div className="text-[11.5px] font-bold text-white/55">예상 인센티브</div><div className="text-[22px] font-black tabular-nums" style={num}>{won(cur.total)}원</div><div className="text-[12px] text-white/60 tabular-nums" style={num}>확정 {won(p.collectOnly ? cur.confirmed : cur.total)} · 보류 {won(p.collectOnly ? cur.held : 0)}</div></div>
        </BookCard>
      </div>

      {who.canManage && (
        <BookCard flush en="TEAM PAYOUT" title={`${Number(ym.slice(5))}월 영업팀 인센티브`} right={canAct && <button type="button" disabled={busy} className={`${btnDark} mr-4`} onClick={confirmAll}>전체 확정</button>}>
          {!team.length ? <Empty>영업 담당자가 없습니다. 직원의 부서를 「영업팀」으로 정하거나 거래처 담당을 지정해 주세요.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse" style={{ minWidth: 760 }}>
                <thead><tr className="bg-[#0F1A30] text-white"><Th>담당자</Th><Th right>매출</Th><Th right>매출이익</Th><Th right>예상</Th><Th right>지급 확정</Th><Th right>보류</Th><Th>상태</Th><Th w={110}> </Th></tr></thead>
                <tbody>
                  {team.map((t, i) => { const s = saved(t.uid); return (
                    <tr key={t.uid} data-ro-allow onClick={() => setRep(t.uid)} className={`cursor-pointer hover:bg-[#F2F6FD] border-t border-[#EEF2F8] ${t.uid === uid ? "bg-[#EEF3FC]" : i % 2 ? "bg-[#FBFCFE]" : "bg-white"}`}>
                      <Td bold>{t.name}{t.position ? <span className="text-[#7A879C] font-bold"> {t.position}</span> : null}</Td><Td right>{won(t.sale)}</Td><Td right>{won(t.profit)}</Td><Td right bold>{won(t.total)}</Td><Td right bold className="!text-[#2D4C82]">{won(p.collectOnly ? t.confirmed : t.total)}</Td><Td right>{won(p.collectOnly ? t.held : 0)}</Td>
                      <Td><StBadge s={s} />{s && s.status === "확정" && s.amount !== (p.collectOnly ? t.confirmed : t.total) && <> <Tag tone="warn">금액 변동</Tag></>}</Td>
                      <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>{canAct && s?.status === "확정" && <button type="button" disabled={busy} className="h-8 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12px] font-black text-[#1B2B4B]" onClick={() => markPaid(t.uid, t.name)}>지급 완료</button>}</td>
                    </tr>
                  ); })}
                </tbody>
                <tfoot><tr className="border-t-[3px] border-double border-[#0F1A30] bg-[#F5F8FD]"><Td bold>합계 · {team.length}명</Td><Td right bold>{won(team.reduce((s, t) => s + t.sale, 0))}</Td><Td right bold>{won(team.reduce((s, t) => s + t.profit, 0))}</Td><Td right bold>{won(team.reduce((s, t) => s + t.total, 0))}</Td><Td right bold className="!text-[#2D4C82]">{won(team.reduce((s, t) => s + (p.collectOnly ? t.confirmed : t.total), 0))}</Td><Td right bold>{won(team.reduce((s, t) => s + (p.collectOnly ? t.held : 0), 0))}</Td><Td /><Td /></tr></tfoot>
              </table>
            </div>
          )}
          <div className="px-4 py-3 text-[12.5px] font-bold text-[#7A879C] border-t border-[#EEF1F6]">확정한 금액은 그 시점 기준으로 저장됩니다. 확정 뒤 수금이 더 들어오면 「금액 변동」이 뜨고, 다시 확정하면 더해집니다. 지급 완료한 달은 바뀌지 않습니다.</div>
        </BookCard>
      )}
    </div>
  );
}

// ═════════════════════════ 팀 순위 ═════════════════════════
function Ranking({ B, who }) {
  const [ym, setYm] = React.useState(ymOf(0));
  const [by, setBy] = React.useState("sale");
  const team = React.useMemo(() => B.team(ym), [B, ym]);
  const wonBy = (uid) => B.leads.filter((l) => l.stage === "won" && String(l.wonAt || "").startsWith(ym) && l.ownerUid === uid).length;
  const actBy = (uid) => B.activities.filter((a) => String(a.date || "").startsWith(ym) && a.ownerUid === uid).length;
  const list = team.map((t) => ({ ...t, won: wonBy(t.uid), acts: actBy(t.uid) })).sort((a, b) => (b[by] || 0) - (a[by] || 0));
  const max = Math.max(1, ...list.map((t) => t[by] || 0));
  const KEYS = [["sale", "매출"], ["profit", "매출이익"], ["achieve", "목표 달성률"], ["won", "신규 수주"], ["acts", "영업 활동"]];
  const fmt = (t) => (by === "achieve" ? `${(t.achieve || 0).toFixed(0)}%` : by === "won" ? `${t.won}곳` : by === "acts" ? `${t.acts}건` : `${won(t[by])}원`);
  if (!who.canManage && !B.policy.showRanking) return <BookCard><Empty>팀 순위는 영업 관리자만 볼 수 있습니다.</Empty></BookCard>;
  return (
    <div className="space-y-4">
      <BookHero en="SALES · RANKING" title="팀 순위" desc="이번 달 영업 담당자별 실적 — 매출 · 매출이익 · 목표 달성 · 신규 수주 · 활동" right={<MonthNav ym={ym} setYm={setYm} />}
        kpis={[["영업팀 매출", `${short(team.reduce((s, t) => s + t.sale, 0))}원`, `${team.length}명`], ["영업팀 매출이익", `${short(team.reduce((s, t) => s + t.profit, 0))}원`, "청구운임 − 기사운임"], ["신규 수주", `${list.reduce((s, t) => s + t.won, 0)}곳`, "이 달 수주 처리"], ["영업 활동", `${list.reduce((s, t) => s + t.acts, 0)}건`, "방문 · 전화 · 견적 · 미팅"]]} />
      <BookCard en="LEADERBOARD" title="순위" right={<div className="flex gap-1.5 overflow-x-auto no-scrollbar">{KEYS.map(([k, l]) => <Chip key={k} on={by === k} onClick={() => setBy(k)}>{l}</Chip>)}</div>}>
        {!list.length ? <Empty>영업 담당자가 없습니다</Empty> : (
          <div className="space-y-2">
            {list.map((t, i) => (
              <div key={t.uid} className={`rounded-2xl border px-3.5 py-3 ${t.uid === who.uid ? "border-[#2D4C82] bg-[#EEF3FC]" : "border-[#E3E8F0] bg-white"}`}>
                <div className="flex items-center gap-3">
                  <span className={`w-9 h-9 rounded-xl grid place-items-center text-[14px] font-black tabular-nums shrink-0 ${i === 0 ? "bg-[#0F1A30] text-white" : "bg-[#EEF3FC] text-[#2D4C82]"}`} style={num}>{i + 1}</span>
                  <div className="min-w-0 flex-1"><div className="text-[14.5px] font-black text-[#0F1A30] truncate">{t.name}{t.uid === who.uid ? " (나)" : ""}<span className="text-[12px] font-bold text-[#7A879C]"> {[t.team, t.position].filter(Boolean).join(" · ")}</span></div>
                    <div className="text-[12px] font-bold text-[#7A879C] tabular-nums truncate" style={num}>매출 {short(t.sale)} · 이익 {short(t.profit)} · 수주 {t.won} · 활동 {t.acts}{t.target > 0 ? ` · 목표 ${t.achieve.toFixed(0)}%` : ""}</div></div>
                  <span className="text-[15.5px] font-black text-[#0F1A30] tabular-nums shrink-0" style={num}>{fmt(t)}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-[#E3E8F0] overflow-hidden"><div className="h-full bg-[#2D4C82]" style={{ width: `${Math.max(2, ((t[by] || 0) / max) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </BookCard>
    </div>
  );
}

// ═════════════════════════ 목표 · 규정 ═════════════════════════
function Policy({ B, who, company, isViewer }) {
  const canEdit = who.canManage && !isViewer;
  const [p, setP] = React.useState(() => ({ ...B.policy, tiers: B.policy.tiers.map((t) => ({ ...t })) }));
  const [targets, setTargets] = React.useState(() => JSON.parse(JSON.stringify(B.targets || {})));
  const [ym, setYm] = React.useState(ymOf(0));
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const sig = JSON.stringify([B.plan.raw?.policy || null, B.plan.raw?.targets || null]);
  React.useEffect(() => { if (!dirty) { setP({ ...B.policy, tiers: B.policy.tiers.map((t) => ({ ...t })) }); setTargets(JSON.parse(JSON.stringify(B.targets || {}))); } }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const up = (k, v) => { setP((o) => ({ ...o, [k]: v })); setDirty(true); };
  const upTier = (i, k, v) => { setP((o) => ({ ...o, tiers: o.tiers.map((t, j) => (j === i ? { ...t, [k]: v } : t)) })); setDirty(true); };
  const setTarget = (uid, key, v) => { setTargets((o) => ({ ...o, [uid]: { ...(o[uid] || {}), [key]: toInt(v) } })); setDirty(true); };
  const save = async () => {
    setBusy(true);
    try {
      const policy = normPolicy({ ...p, tiers: p.tiers.map((t) => ({ from: toInt(t.from), rate: Number(t.rate) || 0 })) });
      await setDoc(doc(db, "salesPlans", company), { companyName: company, policy, targets, updatedBy: who.name, updatedAt: serverTimestamp() }, { merge: true });
      setDirty(false); kpAlert("저장했습니다. 인센티브 계산에 바로 반영됩니다.");
    } catch (e) { kpAlert(`저장하지 못했습니다.\n${e?.message || e}`); } finally { setBusy(false); }
  };
  const reset = async () => { if (await kpConfirm("인센티브 규정을 기본값으로 되돌릴까요? (저장을 눌러야 반영됩니다)", { title: "기본값", okText: "되돌리기" })) { setP({ ...DEFAULT_POLICY, tiers: DEFAULT_POLICY.tiers.map((t) => ({ ...t })) }); setDirty(true); } };
  const np = normPolicy(p);
  const Toggle = ({ on, onClick, children }) => <button type="button" disabled={!canEdit} onClick={onClick} className={`h-11 px-3.5 rounded-xl border text-[13.5px] font-black text-left flex items-center gap-2.5 w-full ${on ? "border-[#0F1A30] bg-[#0F1A30] text-white" : "border-[#DCE3EE] bg-white text-[#5B6B85]"}`}><span className={`w-4 h-4 rounded-full border-2 shrink-0 ${on ? "border-white bg-white" : "border-[#C3CDDC]"}`} />{children}</button>;
  return (
    <div className="space-y-4">
      <BookHero en="SALES · PLAN" title="목표 · 인센티브 규정" desc={canEdit ? "영업 담당자별 월 매출 목표와 회사 인센티브 규정을 정합니다 — 저장하면 모든 화면 계산에 바로 반영됩니다" : "우리 회사 인센티브 규정과 내 목표입니다(영업 관리자가 정합니다)"}
        right={canEdit && <div className="flex gap-2"><button type="button" className="h-9 px-3.5 rounded-xl bg-white/10 border border-white/15 text-[13.5px] font-black" onClick={reset}>기본값</button><button type="button" disabled={busy || !dirty} className="h-9 px-4 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black disabled:opacity-50" onClick={save}>{busy ? "저장 중…" : dirty ? "저장" : "저장됨"}</button></div>}
        kpis={[["기준", baseLabel(np), np.base === "profit" ? "청구운임 − 기사운임" : "청구운임"], ["요율", np.useTiers ? `${np.tiers[0].rate}~${np.tiers[np.tiers.length - 1].rate}%` : `${np.rate}%`, np.useTiers ? `구간 누진 ${np.tiers.length}단계` : "단일 요율"], ["신규 거래처", np.newBonus > 0 ? `+${np.newBonus}%p` : "없음", `수주 후 ${np.newMonths}개월`], ["지급", np.collectOnly ? "수금 후 확정" : "전액 확정", `다음 달 ${np.payDay}일`]]} />
      {!B.plan.saved && <div className="rounded-2xl border border-[#E8D9B0] bg-[#FBF5E4] px-4 py-3 text-[13px] font-bold text-[#6B5320]">아직 저장한 규정이 없어 기본값으로 계산하고 있습니다. {canEdit ? "회사 규정에 맞게 고친 뒤 저장해 주세요." : "영업 관리자가 규정을 저장하면 바뀝니다."}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BookCard en="INCENTIVE RULE" title="인센티브 규정">
          <fieldset disabled={!canEdit} className="space-y-4 min-w-0">
            <div><Label>무엇을 기준으로 줄까요</Label>
              <div className="grid grid-cols-2 gap-2"><Toggle on={p.base === "profit"} onClick={() => up("base", "profit")}>매출이익 (추천)</Toggle><Toggle on={p.base === "revenue"} onClick={() => up("base", "revenue")}>매출</Toggle></div>
              <div className="mt-1.5 text-[12px] font-bold text-[#7A879C]">매출이익 기준이면 단가를 깎아 물량만 늘리는 저가 수주가 줄어듭니다.</div></div>
            <div><Label>요율</Label>
              <div className="grid grid-cols-2 gap-2"><Toggle on={!!p.useTiers} onClick={() => up("useTiers", true)}>구간 누진</Toggle><Toggle on={!p.useTiers} onClick={() => up("useTiers", false)}>단일 요율</Toggle></div>
              {p.useTiers ? (
                <div className="mt-2 space-y-1.5">
                  {p.tiers.map((t, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_110px_40px] gap-1.5 items-center">
                      <div className="relative"><MoneyInput value={t.from} onChange={(v) => upTier(i, "from", v)} disabled={i === 0} /><span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11.5px] font-bold text-[#9AA9C3] pointer-events-none">월 {baseLabel(p)}</span></div>
                      <NumInput value={t.rate} onChange={(v) => upTier(i, "rate", v)} suffix="%" />
                      <button type="button" disabled={i === 0} onClick={() => { setP((o) => ({ ...o, tiers: o.tiers.filter((_, j) => j !== i) })); setDirty(true); }} className="h-11 rounded-xl border border-[#DCE3EE] text-[#7A879C] disabled:opacity-30">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => { setP((o) => ({ ...o, tiers: [...o.tiers, { from: (toInt(o.tiers[o.tiers.length - 1]?.from) || 0) + 5000000, rate: (Number(o.tiers[o.tiers.length - 1]?.rate) || 0) + 2 }] })); setDirty(true); }} className="h-10 w-full rounded-xl border border-dashed border-[#C3CDDC] text-[13px] font-black text-[#5B6B85]">+ 구간 추가</button>
                  <div className="text-[12px] font-bold text-[#7A879C]">구간에 걸친 금액만 그 구간 요율로 계산합니다(세금 누진과 같은 방식 — 구간을 넘었다고 전체가 손해 보지 않음).</div>
                </div>
              ) : <div className="mt-2 max-w-[160px]"><NumInput value={p.rate} onChange={(v) => up("rate", v)} suffix="%" /></div>}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div><Label>신규 거래처 가산</Label><NumInput value={p.newBonus} onChange={(v) => up("newBonus", v)} suffix="%p" /></div>
              <div><Label>신규로 보는 기간</Label><NumInput value={p.newMonths} onChange={(v) => up("newMonths", v)} suffix="개월" /></div>
              <div><Label>장기 거래처 조정 시작(0 = 안 씀)</Label><NumInput value={p.matureMonths} onChange={(v) => up("matureMonths", v)} suffix="개월" /></div>
              <div><Label>장기 거래처 요율</Label><NumInput value={p.matureFactor} onChange={(v) => up("matureFactor", v)} suffix="%" /></div>
              <div><Label>최저 마진율(미만 오더 제외)</Label><NumInput value={p.minMargin} onChange={(v) => up("minMargin", v)} suffix="%" /></div>
              <div><Label>1인 월 상한(0 = 없음)</Label><MoneyInput value={p.cap} onChange={(v) => up("cap", v)} /></div>
            </div>
            <div className="space-y-2">
              <Toggle on={!!p.collectOnly} onClick={() => up("collectOnly", !p.collectOnly)}>수금(정산완료)된 거래처분만 지급 확정 — 미수는 보류</Toggle>
              <Toggle on={!!p.accelOn} onClick={() => up("accelOn", !p.accelOn)}>목표를 넘기면 인센티브 가속</Toggle>
              {p.accelOn && <div className="grid grid-cols-2 gap-2.5"><div><Label>목표 달성률 이상</Label><NumInput value={p.accelOver} onChange={(v) => up("accelOver", v)} suffix="%" /></div><div><Label>인센티브 배율</Label><NumInput value={p.accelFactor} onChange={(v) => up("accelFactor", v)} suffix="%" /></div></div>}
              <Toggle on={!!p.showRanking} onClick={() => up("showRanking", !p.showRanking)}>영업 담당자끼리 팀 순위 공개</Toggle>
            </div>
            <div className="max-w-[200px]"><Label>지급일(다음 달)</Label><NumInput value={p.payDay} onChange={(v) => up("payDay", v)} suffix="일" /></div>
          </fieldset>
        </BookCard>
        <div className="space-y-4 min-w-0">
          <BookCard flush en="TARGET" title="월 매출 목표" right={<div className="pr-4 flex items-center gap-1.5"><button type="button" data-ro-allow onClick={() => setYm(ymOf(-1, `${ym}-01`))} className="w-9 h-9 rounded-xl border border-[#DCE3EE]">‹</button><span className="h-9 px-3 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black grid place-items-center tabular-nums" style={num}>{ym.replace("-", ".")}</span><button type="button" data-ro-allow onClick={() => setYm(ymOf(1, `${ym}-01`))} className="w-9 h-9 rounded-xl border border-[#DCE3EE]">›</button></div>}>
            {!B.reps.length ? <Empty>영업 담당자가 없습니다.<br />인사관리부·회원 관리에서 직원 부서를 「영업팀」으로 정하면 여기에 나옵니다.</Empty> : (
              <div className="divide-y divide-[#EEF2F8]">
                <div className="px-4 py-2 grid grid-cols-[minmax(0,1fr)_130px_130px] gap-2 text-[12px] font-black text-[#7A879C]"><span>담당자</span><span className="text-right">기본 목표(매달)</span><span className="text-right">{Number(ym.slice(5))}월만 따로</span></div>
                {(who.canManage ? B.reps : B.reps.filter((r) => r.uid === who.uid)).map((r) => (
                  <div key={r.uid} className="px-4 py-2 grid grid-cols-[minmax(0,1fr)_130px_130px] gap-2 items-center">
                    <div className="min-w-0"><div className="text-[14px] font-black text-[#0F1A30] truncate">{r.name}</div><div className="text-[11.5px] font-bold text-[#7A879C] tabular-nums" style={num}>적용 {short(targetOf(targets, r.uid, ym))}원</div></div>
                    <MoneyInput disabled={!canEdit} value={targets?.[r.uid]?.default || ""} onChange={(v) => setTarget(r.uid, "default", v)} />
                    <MoneyInput disabled={!canEdit} value={targets?.[r.uid]?.[ym] || ""} onChange={(v) => setTarget(r.uid, ym, v)} placeholder="기본 목표" />
                  </div>
                ))}
              </div>
            )}
          </BookCard>
          <BookCard en="EXAMPLE" title="이 규정이면 얼마를 받나요">
            <div className="space-y-1.5">
              {[3000000, 7000000, 12000000, 20000000].map((b) => { const a = tierAmount(np, b); return (
                <div key={b} className="flex items-center justify-between gap-2 rounded-xl border border-[#E3E8F0] px-3.5 py-2.5"><span className="text-[13px] font-bold text-[#5B6B85] tabular-nums" style={num}>월 {baseLabel(np)} {short(b)}원</span><span className="text-[14.5px] font-black text-[#0F1A30] tabular-nums" style={num}>{won(a)}원 <span className="text-[11.5px] font-bold text-[#7A879C]">({b ? ((a / b) * 100).toFixed(1) : 0}%)</span></span></div>
              ); })}
            </div>
            <div className="mt-2 text-[12px] font-bold text-[#7A879C]">신규 가산 · 목표 가속 · 상한 적용 전 금액입니다.</div>
          </BookCard>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════ 영업관리 화면 ═════════════════════════
export default function SalesHub({ company, dispatchData = [], clients = null, isViewer = false, exec = false, onGo }) {
  const who = useSalesMe({ exec });
  const B = useSalesBoard(company, dispatchData, null, who);
  const [tab, setTab] = React.useState(() => { try { const v = sessionStorage.getItem("kpSalesTab"); sessionStorage.removeItem("kpSalesTab"); return v || "overview"; } catch { return "overview"; } });
  const P = pipelineSummary(who.canManage ? B.leads : B.leads.filter((l) => l.ownerUid === who.uid));
  const due = P.today + P.overdue;
  return (
    <KpSubNav code="SALES" title="영업관리" icon="trend" active={tab} onSelect={setTab}
      groups={[
        { label: "실적", items: [{ key: "overview", label: "영업 현황", en: "OVERVIEW", icon: "pulse" }, { key: "incentive", label: "인센티브", en: "INCENTIVE", icon: "money" }, { key: "ranking", label: "팀 순위", en: "RANKING", icon: "star" }] },
        { label: "영업", items: [{ key: "pipeline", label: "영업 기회", en: "PIPELINE", icon: "trend", badge: due || undefined, badgeTitle: "오늘·지난 연락 일정" }, { key: "accounts", label: "거래처 담당", en: "ACCOUNTS", icon: "building" }, { key: "activity", label: "영업 활동", en: "ACTIVITY", icon: "clock" }] },
        { label: "설정", items: [{ key: "policy", label: "목표 · 규정", en: "PLAN", icon: "flag" }] },
      ]}>
      {!B.ready ? <BookSkeleton rows={7} /> : tab === "overview" ? <Overview B={B} who={who} onTab={setTab} />
        : tab === "pipeline" ? <Pipeline B={B} who={who} company={company} isViewer={isViewer} />
          : tab === "accounts" ? <Accounts B={B} who={who} company={company} isViewer={isViewer} onGo={onGo} />
            : tab === "activity" ? <Activity B={B} who={who} company={company} isViewer={isViewer} />
              : tab === "incentive" ? <Incentive B={B} who={who} company={company} isViewer={isViewer} />
                : tab === "ranking" ? <Ranking B={B} who={who} />
                  : <Policy B={B} who={who} company={company} isViewer={isViewer} />}
    </KpSubNav>
  );
}
