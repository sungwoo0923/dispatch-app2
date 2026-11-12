// ======================= src/freight/FreightSettle.jsx =======================
// 🧾 2026-11-12 컨테이너 · 해상 · 항공 정산(청구 · 입금 · 지급) · 직원 업무 담당 · 매출관리 요약 줄
import React from "react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { BIZ } from "../bizModules";
import { settleSummary, receivables, payables, sumLines, sumPnl, won, wonShort, ymOf, legTitle } from "./freightCore";
import { updateLeg, useFreightJobs } from "./freightStore";
import { Card, Kpi, Btn, Sel, Seg, Empty, ModeChip, ModeIcon, MODE_NAME, MONO } from "./ui";

const kstYmd = (ms) => (ms ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 10) : "");
const md = (ms) => (ms ? kstYmd(ms).slice(5).replace("-", ".") : "");
const months = () => { const out = []; const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); for (let i = 0; i < 12; i++) { const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; out.push([ym, `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월`]); d.setUTCMonth(d.getUTCMonth() - 1); } return out; };
const num = (v) => Number(String(v ?? "").replace(/,/g, "")) || 0;

// 켜고 끄는 작은 확인 버튼(바탕색 없이 글씨 · 테두리로만)
function Tick({ on, label, date, onClick, disabled }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`h-7 px-2 rounded-lg border text-[11.5px] font-extrabold whitespace-nowrap inline-flex items-center gap-1 transition disabled:opacity-40 ${on ? "border-[#0F1A30] bg-[#0F1A30] text-white" : "border-[#DCE3EE] bg-white text-[#7A89A3] hover:border-[#2D4C82] hover:text-[#0F1A30]"}`}>
      {on ? "✓" : "○"} {label}{on && date ? <span className="opacity-70 tabular-nums">{date}</span> : null}
    </button>
  );
}

export function SettlePage({ jobs, mode, me, canEdit, onOpen }) {
  const ms = React.useMemo(months, []);
  const [ym, setYm] = React.useState(ms[0][0]);
  const [tab, setTab] = React.useState("청구");
  const [only, setOnly] = React.useState("미완료");
  const [busy, setBusy] = React.useState("");
  const scoped = jobs.filter((j) => j.mode === mode && !j._linked && ymOf(kstYmd(j.createdAtMs)) === ym);
  const sum = settleSummary(scoped);
  const run = async (key, fn) => { setBusy(key); try { await fn(); } catch (e) { window.alert(`처리하지 못했습니다. ${e?.message || ""}`); } setBusy(""); };
  const flag = (j, k, label) => run(`${j.id}:${k}`, () => updateLeg(j, { [k]: j[k] ? null : Date.now(), ...(k === "billedAt" && j[k] ? { collectedAt: null } : {}), ...(k === "collectedAt" && !j[k] && !j.billedAt ? { billedAt: Date.now() } : {}) }, `${label} ${j[k] ? "취소" : "확인"}`, me));
  const payLine = (j, idx) => run(`${j.id}:p${idx}`, () => updateLeg(j, { costs: j.costs.map((l, i) => (i === idx ? { ...l, paidAt: l.paidAt ? null : Date.now() } : l)) }, `지급 ${j.costs[idx].paidAt ? "취소" : "확인"} · ${j.costs[idx].item}`, me));
  const rec = receivables(scoped).map((g) => ({ ...g, legs: only === "미완료" ? g.legs.filter((j) => !j.collectedAt) : g.legs })).filter((g) => g.legs.length);
  const pay = payables(scoped).map((g) => ({ ...g, lines: only === "미완료" ? g.lines.filter((x) => !x.line.paidAt) : g.lines })).filter((g) => g.lines.length);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="w-[160px]"><Sel value={ym} onChange={(v) => setYm(v || ms[0][0])} options={ms} /></div>
        <Seg size="sm" value={tab} onChange={setTab} options={["청구", "지급"]} />
        <Seg size="sm" value={only} onChange={setOnly} options={["미완료", "전체"]} />
        <span className="text-[12.5px] font-semibold text-[#7A89A3]">등록일 기준 · 확인을 누르면 날짜와 처리한 사람이 이력에 남습니다</span>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi label="미청구" value={wonShort(sum.unbilled)} unit="원" tone={sum.unbilled ? "warn" : ""} sub="계산서 발행 전" />
        <Kpi label="미수금" value={wonShort(sum.receivable)} unit="원" tone={sum.receivable ? "bad" : ""} sub="발행했고 입금 전" />
        <Kpi label="미지급" value={wonShort(sum.unpaid)} unit="원" tone={sum.unpaid ? "warn" : ""} sub={`지급 완료 ${wonShort(sum.paid)}원`} />
        <Kpi label="매출 · 입금 완료" value={wonShort(sum.sale)} unit="원" sub={`입금 ${wonShort(sum.collected)}원`} />
      </div>
      {tab === "청구" ? (
        rec.length === 0 ? <Card><Empty mode={mode} title={only === "미완료" ? "청구 · 입금이 남은 건이 없습니다" : "이 달에 청구할 건이 없습니다"} /></Card> : rec.map((g) => (
          <Card key={g.client} pad={false} title={g.client} right={<span className="text-[12.5px] font-bold text-[#7A89A3] tabular-nums">매출 <b className="text-[#0F1A30]">{won(g.sale)}</b>{g.unbilled > 0 && <> · 미청구 <b className="text-[#B26A00]">{won(g.unbilled)}</b></>}{g.receivable > 0 && <> · 미수 <b className="text-[#C2362B]">{won(g.receivable)}</b></>}</span>}>
            <div className="divide-y divide-[#EEF1F6]">
              {g.legs.map((j) => (
                <div key={j.id} className="px-4 sm:px-5 py-2.5 flex items-center gap-2.5 flex-wrap">
                  <button type="button" onClick={() => onOpen(j)} className="text-[12.5px] font-black text-[#0F1A30] tabular-nums hover:underline" style={{ fontFamily: MONO }}>{j.refNo}</button>
                  <span className="text-[12.5px] font-semibold text-[#5B6B85] truncate flex-1 min-w-[120px]">{legTitle(j)}</span>
                  <span className="text-[13.5px] font-black text-[#0F1A30] tabular-nums">{won(sumLines(j.sales) + num(j.saleAmt))}원</span>
                  <Tick on={!!j.billedAt} label="계산서" date={md(j.billedAt)} disabled={!canEdit || busy === `${j.id}:billedAt`} onClick={() => flag(j, "billedAt", "계산서 발행")} />
                  <Tick on={!!j.collectedAt} label="입금" date={md(j.collectedAt)} disabled={!canEdit || busy === `${j.id}:collectedAt`} onClick={() => flag(j, "collectedAt", "입금")} />
                </div>
              ))}
            </div>
          </Card>
        ))
      ) : (
        pay.length === 0 ? <Card><Empty mode={mode} title={only === "미완료" ? "지급이 남은 건이 없습니다" : "이 달에 지급할 건이 없습니다"} desc="등록 화면의 지급(매입) 항목과 지급처가 여기에 모입니다." /></Card> : pay.map((g) => (
          <Card key={g.vendor} pad={false} title={g.vendor} right={<span className="text-[12.5px] font-bold text-[#7A89A3] tabular-nums">합계 <b className="text-[#0F1A30]">{won(g.total)}</b>{g.unpaid > 0 && <> · 미지급 <b className="text-[#B26A00]">{won(g.unpaid)}</b></>}</span>}>
            <div className="divide-y divide-[#EEF1F6]">
              {g.lines.map(({ job, idx, line, krw }) => (
                <div key={`${job.id}:${idx}`} className="px-4 sm:px-5 py-2.5 flex items-center gap-2.5 flex-wrap">
                  <button type="button" onClick={() => onOpen(job)} className="text-[12.5px] font-black text-[#0F1A30] tabular-nums hover:underline" style={{ fontFamily: MONO }}>{job.refNo}</button>
                  <span className="text-[12.5px] font-bold text-[#3A4A66]">{line.item}</span>
                  <span className="text-[12.5px] font-semibold text-[#5B6B85] truncate flex-1 min-w-[100px]">{job.client}</span>
                  <span className="text-[13.5px] font-black text-[#0F1A30] tabular-nums">{line.cur && line.cur !== "KRW" ? `${line.cur} ${line.amount} · ` : ""}{won(krw)}원</span>
                  <Tick on={!!line.paidAt} label="지급" date={md(line.paidAt)} disabled={!canEdit || busy === `${job.id}:p${idx}`} onClick={() => payLine(job, idx)} />
                </div>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

// ── 직원 업무 담당(통합 › 업무 담당) — 직원마다 볼 수 있는 업무와 처음 열 화면 ──
export function StaffBizPage({ modules, canEdit }) {
  const [staff, setStaff] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [q, setQ] = React.useState("");
  React.useEffect(() => onSnapshot(collection(db, "users"), (snap) => {
    setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.approved !== false && !["driver", "shipper", "cafeUser"].includes(u.role) && u.employmentStatus !== "퇴사")
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko")));
  }, () => setStaff([])), []);
  const save = async (u, patch) => {
    setBusy(u.id);
    try { await updateDoc(doc(db, "users", u.id), patch); } catch (e) { window.alert(`저장하지 못했습니다. ${e?.message || ""}`); }
    setBusy("");
  };
  const toggle = (u, k) => { const cur = Array.isArray(u.bizAccess) ? u.bizAccess : []; const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]; save(u, { bizAccess: next, ...(next.length && u.bizHome && !next.includes(u.bizHome) ? { bizHome: next[0] } : {}) }); };
  const list = (staff || []).filter((u) => { const k = q.trim().toLowerCase(); return !k || [u.name, u.email, u.team, u.position].some((v) => String(v || "").toLowerCase().includes(k)); });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 부서 검색" className="h-10 w-full max-w-[280px] border border-[#DCE3EE] rounded-xl px-3 text-[13.5px] font-semibold text-[#0F1A30] placeholder:text-[#9AA9C3] focus:outline-none focus:border-[#2D4C82]" />
        <span className="text-[12.5px] font-semibold text-[#7A89A3]">아무것도 고르지 않은 직원은 회사가 쓰는 업무를 모두 봅니다 · 관리자 · 마스터 · 임원은 항상 전체</span>
      </div>
      <Card pad={false}>
        {staff === null ? <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">불러오는 중…</div> : list.length === 0 ? <Empty mode="group" title="직원이 없습니다" /> : (
          <div className="divide-y divide-[#EEF1F6]">
            {list.map((u) => { const acc = Array.isArray(u.bizAccess) ? u.bizAccess : []; return (
              <div key={u.id} className="px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap">
                <div className="min-w-[150px] flex-1">
                  <div className="text-[14px] font-black text-[#0F1A30]">{u.name || u.email}</div>
                  <div className="text-[12px] font-semibold text-[#7A89A3]">{[u.team, u.position].filter(Boolean).join(" · ") || "-"}</div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {modules.map((k) => { const on = acc.includes(k); return (
                    <button key={k} type="button" disabled={!canEdit || busy === u.id} onClick={() => toggle(u, k)} aria-pressed={on}
                      className={`h-9 px-3 rounded-xl border text-[12.5px] font-extrabold inline-flex items-center gap-1.5 transition disabled:opacity-40 ${on ? "border-[#0F1A30] bg-[#0F1A30] text-white" : "border-[#DCE3EE] bg-white text-[#7A89A3] hover:border-[#2D4C82]"}`}>
                      <ModeIcon mode={k} size={13} />{MODE_NAME[k]}
                    </button>
                  ); })}
                </div>
                <div className="w-[170px]"><Sel value={u.bizHome || ""} disabled={!canEdit || busy === u.id} onChange={(v) => save(u, { bizHome: v })} options={(acc.length ? modules.filter((k) => acc.includes(k)) : modules).map((k) => [k, `처음 화면 · ${BIZ[k].short}`])} placeholder="처음 화면 · 자동" /></div>
                <span className="w-[72px] text-right text-[11.5px] font-bold text-[#9AA9C3]">{acc.length ? `${acc.length}개 업무` : "전체"}</span>
              </div>
            ); })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── 매출관리 화면 위 요약 줄 — 내륙 외 사업부의 이번 달 매출(합산은 통합 › 전사 손익) ──
export function FreightRevenueStrip({ modules = [], onOpenGroup }) {
  const { jobs, loaded } = useFreightJobs();
  const ym = kstYmd(Date.now()).slice(0, 7);
  const others = modules.filter((m) => m !== "inland");
  if (!others.length || !loaded) return null;
  const month = jobs.filter((j) => !j.dispatchId && ymOf(kstYmd(j.createdAtMs)) === ym);
  const tot = sumPnl(month.filter((j) => others.includes(j.mode)));
  return (
    <div className="mb-4 rounded-2xl border border-[#E3E8F0] bg-[#F5F8FD] px-4 py-3 flex items-center gap-x-5 gap-y-2 flex-wrap" data-testid="freight-revenue-strip">
      <span className="text-[12.5px] font-black text-[#0F1A30]">다른 사업부 이번 달</span>
      {others.map((m) => { const p = sumPnl(month.filter((j) => j.mode === m)); return (
        <span key={m} className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#5B6B85]"><ModeChip mode={m} />매출 <b className="text-[#0F1A30] tabular-nums">{wonShort(p.sale)}</b> · 이익 <b className={`tabular-nums ${p.profit < 0 ? "text-[#C2362B]" : "text-[#0F1A30]"}`}>{wonShort(p.profit)}</b></span>
      ); })}
      <span className="text-[12.5px] font-bold text-[#5B6B85]">합계 <b className="text-[#0F1A30] tabular-nums">{wonShort(tot.sale)}원</b></span>
      <span className="text-[12px] font-semibold text-[#9AA9C3]">이 화면의 숫자는 내륙 배차만입니다</span>
      {onOpenGroup && <Btn size="sm" className="ml-auto" onClick={onOpenGroup}>전사 손익 보기</Btn>}
    </div>
  );
}
