// ======================= src/SalesDashboard.jsx =======================
// 💼 2026-11-10 영업 대시보드 — 영업팀(영업관리자·영업사무원)으로 들어오면 홈 › 대시보드가 이 화면. PC·모바일 공용.
//  경리·인사 대시보드(DeptDashboard)와 같은 남색 데크 부품을 그대로 쓴다.
//  · 내 담당 매출 · 매출이익 · 목표 달성 · 예상 인센티브(확정/보류) · 파이프라인 예상 매출
//  · 6개월 추이 · 오늘 할 일(후속 연락·휴면·급감·미수·담당 미지정) · 인센티브 구간 · 거래처 순위 · 파이프라인 · 일정 · 팀 순위
import React from "react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { HD_MONO as MONO, HD_C as C } from "./HomeDeck";
import { LogisTag } from "./brand";
import { Deck, DeckHead, KTile, DPanel, Muted, SubHead, Line2, TodoPanel, Donut, Legend, HBar, DarkTip, DBadge, WARN } from "./DeptDashboard";
import { useSalesBoard, useSalesMe } from "./salesData";
import { ymOf, kstDay, LEAD_STAGES, OPEN_STAGES, leadWeighted, toInt, baseLabel, HEALTH } from "./salesCore";

const short = (n) => { const a = Math.abs(n || 0); if (a >= 1e8) return `${(n / 1e8).toFixed(1)}억`; if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`; return Math.round(n || 0).toLocaleString(); };
const won = (n) => Math.round(n || 0).toLocaleString();
const num = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };

export default function SalesDashboard({ company, dispatchData = [], onGo, me, att }) {
  const who = useSalesMe();
  const B = useSalesBoard(company, dispatchData, null, who);
  const today = kstDay(); const ym = ymOf(0);
  const [scope, setScope] = React.useState("me"); // 관리자: 내 실적 / 팀 전체
  const teamView = who.canManage && (scope === "team" || !B.reps.some((r) => r.uid === who.uid));
  const team = React.useMemo(() => (B.ready ? B.team(ym) : []), [B, ym]);
  const mine = React.useMemo(() => (B.ready ? B.calc(who.uid, ym) : null), [B, who.uid, ym]);
  const sum = (k) => team.reduce((s, x) => s + (x[k] || 0), 0);
  const cur = teamView
    ? { sale: sum("sale"), profit: sum("profit"), total: sum("total"), confirmed: sum("confirmed"), held: sum("held"), target: sum("target"), n: sum("n"), base: sum("base"), rows: team.flatMap((t) => t.rows), next: null, effRate: 0, excluded: { n: team.reduce((s, x) => s + x.excluded.n, 0) } }
    : mine;
  const uids = teamView ? new Set(B.reps.map((r) => r.uid)) : new Set([who.uid]);
  const health = React.useMemo(() => (B.ready ? B.health(ym) : []), [B, ym]);
  const myHealth = health.filter((h) => uids.has(h.uid));
  const leads = B.leads.filter((l) => teamView || l.ownerUid === who.uid);
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage));
  const weighted = open.reduce((s, l) => s + leadWeighted(l), 0);
  // 6개월 추이(담당 거래처)
  const six = React.useMemo(() => [5, 4, 3, 2, 1, 0].map((n) => {
    const m = ymOf(-n); let sale = 0, buy = 0;
    if (B.ready) [...uids].forEach((u) => { const r = B.calc(u, m); sale += r.sale; buy += r.buy; });
    return { k: `${Number(m.slice(5))}월`, m, sale, buy, profit: sale - buy };
  }), [B, teamView, who.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const prev = six[4] || { sale: 0 };
  const achieve = cur?.target > 0 ? (cur.sale / cur.target) * 100 : 0;
  const rate = cur?.sale ? (cur.profit / cur.sale) * 100 : 0;

  const follow = open.filter((l) => l.nextDate && l.nextDate <= today);
  const stale = open.filter((l) => { const u = String(l.touchedAt || l.createdDay || ""); return u && (new Date(`${today}T00:00:00Z`) - new Date(`${u}T00:00:00Z`)) / 864e5 >= 14; });
  const sleep = myHealth.filter((h) => h.state === "sleep");
  const drop = myHealth.filter((h) => h.state === "drop");
  const unpaid = myHealth.filter((h) => h.unpaid);
  const noRep = health.filter((h) => !h.uid && h.cur > 0);
  const todos = [
    ["오늘 연락할 화주", "영업관리 › 영업 기회 · 다음 연락일이 됐습니다", `${follow.length}곳`, follow.length, "영업관리:pipeline"],
    ["2주 넘게 멈춘 영업 기회", "마지막 연락 후 14일 이상", `${stale.length}곳`, stale.length, "영업관리:pipeline"],
    ["물량이 급감한 거래처", "최근 30일 매출이 30% 이상 감소", `${drop.length}곳`, drop.length, "영업관리:accounts"],
    ["휴면 거래처", "30일 넘게 오더가 없습니다", `${sleep.length}곳`, sleep.length, "영업관리:accounts"],
    ["지난달 미수 거래처", B.policy.collectOnly ? "수금되면 인센티브가 확정됩니다" : "정산관리 › 거래처정산", `${unpaid.length}곳`, unpaid.length, "영업관리:incentive"],
    ...(who.canManage ? [["담당이 없는 거래처", "이번 달 매출이 있는데 영업 담당이 없습니다", `${noRep.length}곳`, noRep.length, "영업관리:accounts"]] : []),
  ];
  const top = [...(cur?.rows || [])].sort((a, b) => b.sale - a.sale).slice(0, 6);
  const stages = LEAD_STAGES.filter((s) => OPEN_STAGES.includes(s.key)).map((s) => { const ls = open.filter((l) => l.stage === s.key); return { ...s, n: ls.length, amt: ls.reduce((a, l) => a + toInt(l.monthlyRevenue), 0) }; });
  const stageMax = Math.max(1, ...stages.map((s) => s.amt));
  // 다가오는 일정 — 영업 기회 다음 연락 + 활동의 다음 일정
  const acts = B.activities.filter((a) => teamView || a.ownerUid === who.uid);
  const agenda = [
    ...open.filter((l) => l.nextDate && l.nextDate >= today).map((l) => ({ d: l.nextDate, t: l.name, s: `${l.nextAction || "후속 연락"}${teamView && l.ownerName ? ` · ${l.ownerName}` : ""}` })),
    ...acts.filter((a) => a.nextDate && a.nextDate >= today).map((a) => ({ d: a.nextDate, t: a.target || a.type, s: `${a.nextAction || a.type || "일정"}${teamView && a.ownerName ? ` · ${a.ownerName}` : ""}` })),
  ].sort((a, b) => a.d.localeCompare(b.d)).slice(0, 6);
  const stateCount = (k) => myHealth.filter((h) => h.state === k).length;
  const nx = cur?.next;
  const name = me?.name || who.name;

  return (
    <Deck>
      <DeckHead code={<LogisTag height={9} text="SALES DECK" />} att={att}
        title={name ? `${name}님, 이번 달 영업 현황입니다` : "이번 달 영업 현황입니다"}
        sub={<><span className="whitespace-nowrap">{teamView ? "영업팀 매출" : "내 담당 매출"} <b style={{ color: "#fff", ...num }}>{won(cur?.sale)}</b>원</span> · <span className="whitespace-nowrap">매출이익 <b style={{ color: "#fff", ...num }}>{won(cur?.profit)}</b>원</span> · <span className="whitespace-nowrap">예상 인센티브 <b style={{ color: "#fff", ...num }}>{won(cur?.total)}</b>원</span>{cur?.target > 0 && <> · <span className="whitespace-nowrap">목표 <b style={{ color: "#fff", ...num }}>{achieve.toFixed(0)}%</b></span></>}</>} />

      {who.canManage && B.reps.some((r) => r.uid === who.uid) && (
        <div style={{ position: "relative", display: "flex", gap: 8, marginBottom: 12 }}>
          {[["me", "내 실적"], ["team", "영업팀 전체"]].map(([k, l]) => <button key={k} type="button" className="dd-link" onClick={() => setScope(k)} style={scope === k ? { background: "#fff", color: "#0F1A30", borderColor: "#fff" } : undefined}>{l}</button>)}
        </div>
      )}

      <div className="dd-kpi">
        <KTile primary code="INCENTIVE" label="예상 인센티브" value={short(cur?.total)} unit="원"
          foot={<>확정 <b style={{ color: C.hi, ...num }}>{short(cur?.confirmed)}</b> · 보류 <b style={{ color: C.hi, ...num }}>{short(cur?.held)}</b></>} spark={six.map((x) => x.profit)} />
        <KTile code="REVENUE" label={teamView ? "영업팀 매출" : "내 담당 매출"} value={short(cur?.sale)} unit="원" foot={`${(cur?.n || 0).toLocaleString()}건 · 전월 ${short(prev.sale)}원`} spark={six.map((x) => x.sale)} />
        <KTile code="PROFIT" label="매출이익" value={short(cur?.profit)} unit="원" foot={<>마진율 <b style={{ color: C.hi, ...num }}>{rate.toFixed(1)}%</b></>} spark={six.map((x) => x.profit)} />
        <KTile code="TARGET" label="목표 달성률" value={cur?.target > 0 ? achieve.toFixed(0) : "미설정"} unit={cur?.target > 0 ? "%" : ""} warn={cur?.target > 0 && achieve < 50}
          foot={cur?.target > 0 ? `목표 ${short(cur.target)}원 · 남은 ${short(Math.max(0, cur.target - cur.sale))}원` : "영업관리 › 목표에서 설정"} bar={achieve} />
        <KTile code="PIPELINE" label="예상 수주(가중)" value={short(weighted)} unit="원" foot={`진행 ${open.length}곳 · 월 매출 × 수주 확률`} bar={open.length ? Math.min(100, (weighted / Math.max(1, open.reduce((s, l) => s + toInt(l.monthlyRevenue), 0))) * 100) : 0} />
        <KTile code="ACCOUNTS" label="담당 거래처" value={myHealth.length.toLocaleString()} unit="곳" warn={sleep.length + drop.length > 0}
          foot={`신규 ${stateCount("new")} · 급감 ${drop.length} · 휴면 ${sleep.length}`} bar={myHealth.length ? ((myHealth.length - sleep.length - drop.length) / myHealth.length) * 100 : 0} />
      </div>

      <div className="dd-row wide">
        <DPanel code="TREND · 6M" title={teamView ? "영업팀 담당 거래처 매출 · 이익" : "내 담당 거래처 매출 · 이익"} right={<button type="button" className="dd-link" disabled={B.loading} onClick={B.reload}>{B.loading ? "불러오는 중…" : "새로 고침"}</button>}>
          {!B.ready ? <Muted t="영업 실적을 불러오는 중…" h={270} /> : !six.some((x) => x.sale) ? <Muted t={<>담당 거래처 실적이 아직 없습니다<br />영업관리 › 거래처 담당에서 내 거래처를 정하면 여기에 보입니다</>} h={270} /> : (
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
                  <Line dataKey="profit" name="매출이익" stroke={C.hi} strokeWidth={2.4} dot={{ r: 3.5, fill: C.hi, strokeWidth: 0 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 12.5, color: C.dim, textAlign: "right" }}>배차완료 기준 · 수주일 이후 오더만{B.at ? ` · ${new Date(B.at + 9 * 3600e3).toISOString().slice(11, 16)} 집계` : ""}</div>
        </DPanel>
        <TodoPanel code="TODO" items={todos} onGo={onGo} />
      </div>

      <div className="dd-row r3">
        <DPanel code="INCENTIVE PLAN" title="인센티브 구간" right={<button type="button" className="dd-link" onClick={() => onGo?.("영업관리:incentive")}>내 인센티브 ›</button>}>
          {!B.ready ? <Muted t="불러오는 중…" /> : teamView ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}><span style={{ ...num, fontSize: 26, fontWeight: 800, color: "#fff" }}>{won(cur.total)}</span><span style={{ fontSize: 14, color: C.dim, fontWeight: 700 }}>원 · 영업팀 합계</span></div>
              {team.filter((t) => t.total > 0).slice(0, 5).map((t) => <HBar key={t.uid} l={t.name} sub={`${t.effRate.toFixed(1)}%`} v={t.total} max={Math.max(1, ...team.map((x) => x.total))} right={`${short(t.total)}원`} />)}
              {!team.some((t) => t.total > 0) && <Muted t="이번 달 인센티브 대상 실적이 없습니다" h={90} />}
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ ...num, fontSize: 26, fontWeight: 800, color: "#fff" }}>{(mine?.tierRate || 0).toFixed(1)}%</span>
                <span style={{ fontSize: 14, color: C.dim, fontWeight: 700 }}>지금 구간 요율 · {baseLabel(B.policy)} 기준</span>
              </div>
              {nx ? (
                <>
                  <div style={{ margin: "14px 0 6px", height: 9, borderRadius: 9, background: "rgba(143,176,240,.12)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, ((mine.base || 0) / nx.from) * 100)}%`, height: "100%", background: `linear-gradient(90deg,#2D4C82,${C.hi})`, boxShadow: `0 0 10px ${C.glow}` }} />
                  </div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: C.sub }}>{baseLabel(B.policy)} <b style={{ color: "#fff", ...num }}>{short(nx.need)}원</b> 더 하면 요율 <b style={{ color: C.hi, ...num }}>{nx.rate}%</b> 구간</div>
                </>
              ) : <div style={{ marginTop: 12, fontSize: 14.5, fontWeight: 700, color: C.hi }}>{B.policy.useTiers ? "최고 구간에 도달했습니다" : "단일 요율로 계산합니다"}</div>}
              <SubHead>THIS MONTH</SubHead>
              <Legend c={C.hi} l="지급 확정(수금 완료)" v={`${won(mine?.confirmed)}원`} />
              <Legend c="rgba(247,185,85,.75)" l="보류(미수 · 수금되면 확정)" v={`${won(mine?.held)}원`} />
              {mine?.accel > 1 && <div style={{ fontSize: 13, color: C.hi, fontWeight: 700, marginTop: 4 }}>목표 달성 가속 ×{mine.accel.toFixed(2)} 적용 중</div>}
              {mine?.excluded?.n > 0 && <div style={{ fontSize: 13, color: WARN, fontWeight: 700, marginTop: 4 }}>마진율 {B.policy.minMargin}% 미만 {mine.excluded.n}건은 제외됐습니다</div>}
            </>
          )}
        </DPanel>
        <DPanel code="TOP ACCOUNTS" title="거래처 매출 순위" right={<button type="button" className="dd-link" onClick={() => onGo?.("영업관리:accounts")}>거래처 담당 ›</button>}>
          {!B.ready ? <Muted t="불러오는 중…" /> : !top.length ? <Muted t="이번 달 담당 거래처 매출이 없습니다" /> : top.map((x) => <HBar key={`${x.client}`} l={x.client} sub={`${x.n}건${x.isNew ? " · 신규" : ""}${x.collected ? " · 수금" : ""}`} v={x.sale} max={top[0].sale} right={`${short(x.sale)}원`} />)}
        </DPanel>
        <DPanel code="PIPELINE" title="영업 기회" right={<button type="button" className="dd-link" onClick={() => onGo?.("영업관리:pipeline")}>영업 기회 ›</button>}>
          {!open.length ? <Muted t={<>진행 중인 영업 기회가 없습니다<br />새 화주를 등록해 보세요</>} /> : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}><span style={{ ...num, fontSize: 26, fontWeight: 800, color: "#fff" }}>{short(weighted)}</span><span style={{ fontSize: 14, color: C.dim, fontWeight: 700 }}>원 · 가중 예상 월 매출</span></div>
              {stages.map((s) => <HBar key={s.key} l={s.label} sub={`${s.n}곳 · ${s.prob}%`} v={s.amt} max={stageMax} right={`${short(s.amt)}원`} />)}
            </>
          )}
        </DPanel>
      </div>

      <div className="dd-row r3">
        <DPanel code="AGENDA" title="다가오는 영업 일정" right={<button type="button" className="dd-link" onClick={() => onGo?.("영업관리:activity")}>영업 활동 ›</button>}>
          {!agenda.length ? <Muted t="예정된 영업 일정이 없습니다" /> : agenda.map((e, i) => (
            <div key={`${e.d}${e.t}${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
              <DBadge d={e.d} today={today} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.t}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}><span style={num}>{e.d.slice(5).replace("-", ".")}</span> · {e.s}</div>
              </div>
            </div>
          ))}
        </DPanel>
        <DPanel code="RANKING" title="이번 달 영업 순위" right={<button type="button" className="dd-link" onClick={() => onGo?.("영업관리:ranking")}>팀 순위 ›</button>}>
          {!(who.canManage || B.policy.showRanking) ? <Muted t="순위는 영업 관리자만 볼 수 있습니다" /> : !team.some((t) => t.sale > 0) ? <Muted t="이번 달 실적이 없습니다" /> : team.filter((t) => t.sale > 0).slice(0, 6).map((t, i) => (
            <Line2 key={t.uid} l={`${t.name}${t.uid === who.uid ? " (나)" : ""}`} sub={`이익 ${short(t.profit)}원${t.target > 0 ? ` · 목표 ${t.achieve.toFixed(0)}%` : ""}`} v={`${short(t.sale)}원`} tone={i === 0 ? "hi" : ""}
              lead={<span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", ...num, fontSize: 14, fontWeight: 800, color: i === 0 ? "#0B1428" : C.hi, background: i === 0 ? C.hi : "rgba(143,176,240,.08)", border: "1px solid rgba(143,176,240,.22)", flexShrink: 0 }}>{i + 1}</span>} />
          ))}
        </DPanel>
        <DPanel code="ACCOUNT HEALTH" title="거래처 상태" right={<button type="button" className="dd-link" onClick={() => onGo?.("영업관리:accounts")}>자세히 ›</button>}>
          {!myHealth.length ? <Muted t="담당 거래처가 없습니다" /> : (
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <Donut size={146} center={myHealth.length} sub="담당 거래처"
                parts={[{ v: stateCount("new") + stateCount("grow"), c: C.hi, l: "신규·성장", glow: true }, { v: stateCount("steady"), c: "#4B6CB7", l: "유지" }, { v: drop.length + sleep.length, c: "rgba(247,185,85,.75)", l: "급감·휴면" }, { v: stateCount("none"), c: "rgba(143,176,240,.25)", l: "실적 없음" }]} />
              <div style={{ flex: 1, minWidth: 150 }}>
                <Legend c={C.hi} l={`${HEALTH.new.label} · ${HEALTH.grow.label}`} v={`${stateCount("new") + stateCount("grow")}곳`} />
                <Legend c="#4B6CB7" l={HEALTH.steady.label} v={`${stateCount("steady")}곳`} />
                <Legend c="rgba(247,185,85,.75)" l={`${HEALTH.drop.label} · ${HEALTH.sleep.label}`} v={`${drop.length + sleep.length}곳`} />
                <Legend c="rgba(143,176,240,.25)" l={HEALTH.none.label} v={`${stateCount("none")}곳`} />
              </div>
            </div>
          )}
        </DPanel>
      </div>
    </Deck>
  );
}
