// ======================= src/ClientCloseDayModal.jsx =======================
// 🗓 2026-11-27 거래처 마감일 정하기(업체 문의 — "업체마다 마감일이 달라요")
//  · [마감일 설정] 매달 며칠 마감 · [마감날짜 변경] 이번 달만 끝 날짜(ClientCloseDateModal — 다음 기간은 그다음 날부터 자동)
//  · 월 마감 › 거래처 머리줄 · 거래처정산 › 미수금관리 거래처 머리줄에서 연다
//  · 말일(기본) · 5 · 10 · 15 · 20 · 25일 · 직접(1 ~ 28) + "몇 월분부터" — 고르면 아래에 기간이 바로 보인다
//  · 저장: clients/{id}.마감일 · 마감시작월 (기본거래처에 없으면 이름만으로 새로 만든다)
//  · 규칙 · 기간 계산은 functions/arCore.mjs 한 곳(정산 홈 · 월 마감 · 거래명세서 · 미수금 · 매출이 같이 따라간다)
import React from "react";
import { createPortal } from "react-dom";
import { collection, deleteField, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db, auth } from "./firebase";
import { normCloseRule, closePeriodOf, overrideRangeOf } from "../functions/arCore.mjs";
import { closeRuleOf } from "./clientCloseDays";

const kstYm = (off = 0) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + off); return d.toISOString().slice(0, 7); };
const ymKo = (ym) => `${Number(ym.slice(5))}월분`;
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const DAYS = [0, 5, 10, 15, 20, 25];

async function saveClientPatch(company, clientName, patch) {
  const name = String(clientName || "").trim(); const co = String(company || "").trim();
  if (!name) throw new Error("거래처 이름이 없어요");
  const snap = await getDocs(query(collection(db, "clients"), where("거래처명", "==", name)));
  const mine = snap.docs.filter((d) => !co || (d.data()?.companyName || "") === co);
  if (mine.length) { await Promise.all(mine.map((d) => setDoc(d.ref, patch, { merge: true }))); return; }
  const ref = doc(collection(db, "clients"));
  await setDoc(ref, { id: ref.id, 거래처명: name, companyName: co, ...patch });
}
export const saveClientCloseDay = (company, clientName, day, from) => saveClientPatch(company, clientName, { 마감일: day ? String(day) : "", 마감시작월: day ? String(from || "") : "", 마감일변경: { at: Date.now(), by: auth?.currentUser?.email || "" } });
// [마감날짜 변경] — ym 한 달만 끝 날짜(end 비우면 원래대로)
export const saveClientCloseDate = (company, clientName, ym, end) => saveClientPatch(company, clientName, { 마감변경: { [ym]: end ? String(end) : deleteField() }, 마감일변경: { at: Date.now(), by: auth?.currentUser?.email || "" } });

export default function ClientCloseDayModal({ open, client, company, onClose, isViewer = false }) {
  const cur = closeRuleOf(client);
  const [day, setDay] = React.useState(cur?.day || 0);
  const [from, setFrom] = React.useState(cur?.from || kstYm(0));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  React.useEffect(() => { if (open) { const r = closeRuleOf(client); setDay(r?.day || 0); setFrom(r?.from || kstYm(0)); setErr(""); } }, [open, client]);
  if (!open) return null;
  const rule = day ? normCloseRule(day, from, cur?.ov) : null;
  const months = [kstYm(-2), kstYm(-1), kstYm(0), kstYm(1), kstYm(2)];
  const preview = rule ? [rule.from ? -1 : 0, 0, 1, 2].map((k) => { const [y, m] = from.split("-").map(Number); const t = y * 12 + m - 1 + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; }) : [];
  const changed = (cur?.day || 0) !== (rule?.day || 0) || (rule && (cur?.from || "") !== rule.from);
  const save = async () => {
    setBusy(true); setErr("");
    try { await saveClientCloseDay(company, client, rule?.day || 0, rule?.from || ""); onClose?.(true); }
    catch (e) { setErr(String(e?.code || "").includes("permission") ? "저장할 권한이 없어요" : (e?.message || "저장하지 못했어요")); }
    finally { setBusy(false); }
  };
  const chip = (on) => `h-10 rounded-xl text-[14px] font-black border ${on ? "bg-[#14213D] text-white border-[#14213D]" : "bg-white text-[#5B6B85] border-[#DCE3EE] hover:border-[#9FB0CC]"}`;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="거래처 마감일 설정" onClick={() => !busy && onClose?.()} className="fixed inset-0 z-[2147482000] flex items-center justify-center p-4" style={{ background: "rgba(8,14,30,.5)" }}>
      <div onClick={(e) => e.stopPropagation()} className="w-[460px] max-w-full max-h-[90vh] overflow-y-auto rounded-[22px] bg-white shadow-2xl">
        <div className="px-5 pt-4 pb-3 text-white" style={{ background: "linear-gradient(135deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
          <div className="text-[11px] tracking-[.22em] font-extrabold text-[#8FB0F0]">CLOSE DAY</div>
          <div className="text-[19px] font-black mt-0.5">{client} 마감일 설정</div>
          <div className="text-[13px] text-white/75 mt-1 leading-snug">매달 며칠에 마감하는 업체인가요? 정하면 월 마감 · 거래명세서 · 미수금 · 매출이 그 기간으로 묶여요.</div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="text-[13px] font-black text-[#14213D] mb-2">마감일</div>
            <div className="grid grid-cols-4 gap-1.5">
              {DAYS.map((d) => <button key={d} type="button" disabled={isViewer} onClick={() => setDay(d)} className={chip(day === d)}>{d ? `${d}일` : "말일"}</button>)}
              <label className={`${chip(day && !DAYS.includes(day))} col-span-2 flex items-center justify-center gap-1 px-2`}>
                직접
                <input type="number" min={1} max={28} disabled={isViewer} value={day && !DAYS.includes(day) ? day : ""} onChange={(e) => { const v = parseInt(e.target.value, 10); setDay(v >= 1 && v <= 28 ? v : 0); }}
                  placeholder="1~28" className="w-14 h-7 rounded-lg border border-[#DCE3EE] text-center text-[#14213D] bg-white outline-none" />일
              </label>
            </div>
          </div>
          {rule && (
            <div>
              <div className="text-[13px] font-black text-[#14213D] mb-2">언제부터 바꿀까요?</div>
              <div className="flex flex-wrap gap-1.5">
                {months.map((m) => <button key={m} type="button" disabled={isViewer} onClick={() => setFrom(m)} className={`${chip(from === m)} px-3`}>{ymKo(m)}부터</button>)}
              </div>
            </div>
          )}
          <div className="rounded-xl bg-[#F6F8FB] border border-[#E1E6EF] px-4 py-3 text-[13px] leading-relaxed text-[#3A4A66]">
            {!rule ? <>지금처럼 <b className="text-[#14213D]">1일 ~ 말일</b>을 한 달로 봐요.</> : (
              <>
                {preview.map((ym) => { const p = closePeriodOf(ym, rule); return (
                  <div key={ym} className="flex justify-between gap-3"><span className="font-bold">{ymKo(ym)}</span><span className="font-black text-[#14213D] tabular-nums">{md(p.from)} ~ {md(p.to)}{p.first ? " (첫 달)" : ""}{!p.day ? " (예전 그대로)" : ""}</span></div>
                ); })}
                <div className="mt-2 text-[12px] text-[#5A6781]">· {rule.day}일 오더가 두 달에 겹치지 않게 다음 기간은 {rule.day + 1}일부터예요<br />· {ymKo(rule.from)} 전 오더는 예전 달 그대로라, 이미 정산한 달은 바뀌지 않아요</div>
              </>
            )}
          </div>
          {rule && rule.from < kstYm(0) && <div className="rounded-xl bg-[#F4F6FA] border border-[#D9E0EC] border-l-[3px] border-l-[#2D4C82] px-4 py-2.5 text-[12.5px] font-bold text-[#3A4A66]">지난달부터 바꾸면 그 달 명세서 · 미수금 금액이 달라질 수 있어요. 이미 보낸 명세서가 있으면 다시 확인해 주세요.</div>}
          {err && <div className="text-[13px] font-black text-[#C62F25]">{err}</div>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => onClose?.()} disabled={busy} className="ml-auto h-11 px-4 rounded-xl border border-[#E3E8F0] text-[14.5px] font-black text-[#5B6B85]">취소</button>
            <button type="button" onClick={save} disabled={busy || isViewer || !changed} className="h-11 px-5 rounded-xl bg-[#14213D] text-white text-[14.5px] font-black disabled:opacity-40">{busy ? "저장 중…" : "저장"}</button>
          </div>
        </div>
      </div>
    </div>, document.body);
}

// ── [마감날짜 변경] 이번 달만 끝 날짜 — 다음 기간은 그다음 날부터 자동(겹치거나 빠지는 날 없음) ──
const addDay = (ymd, k) => { const t = new Date(`${ymd}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };
const nextYm = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };
export function ClientCloseDateModal({ open, client, company, ym, onClose, isViewer = false }) {
  const cur = closeRuleOf(client);
  const range = overrideRangeOf(ym, cur);
  const [end, setEnd] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  React.useEffect(() => { if (open) { setEnd(closeRuleOf(client)?.ov?.[ym] || overrideRangeOf(ym, closeRuleOf(client)).natural); setErr(""); } }, [open, client, ym]);
  if (!open) return null;
  const valid = end && end >= range.min && end <= range.max;
  const trial = { ...(cur || { day: 0, from: "" }), ov: { ...(cur?.ov || {}), [ym]: end } };
  if (end === range.natural) delete trial.ov[ym];
  const was = cur?.ov?.[ym] || "";
  const same = (end === range.natural ? "" : end) === was;
  const save = async (v) => {
    setBusy(true); setErr("");
    try { await saveClientCloseDate(company, client, ym, v === range.natural ? "" : v); onClose?.(true); }
    catch (e) { setErr(String(e?.code || "").includes("permission") ? "저장할 권한이 없어요" : (e?.message || "저장하지 못했어요")); }
    finally { setBusy(false); }
  };
  const chips = [-2, -1, 0, 1, 2].map((k) => addDay(range.natural, k)).filter((d) => d >= range.min && d <= range.max);
  const chip = (on) => `h-10 px-3 rounded-xl text-[14px] font-black border tabular-nums ${on ? "bg-[#14213D] text-white border-[#14213D]" : "bg-white text-[#5B6B85] border-[#DCE3EE] hover:border-[#9FB0CC]"}`;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="마감날짜 변경" onClick={() => !busy && onClose?.()} className="fixed inset-0 z-[2147482000] flex items-center justify-center p-4" style={{ background: "rgba(8,14,30,.5)" }}>
      <div onClick={(e) => e.stopPropagation()} className="w-[440px] max-w-full max-h-[90vh] overflow-y-auto rounded-[22px] bg-white shadow-2xl">
        <div className="px-5 pt-4 pb-3 text-white" style={{ background: "linear-gradient(135deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
          <div className="text-[11px] tracking-[.22em] font-extrabold text-[#8FB0F0]">CLOSE DATE</div>
          <div className="text-[19px] font-black mt-0.5">{client} 마감날짜 변경</div>
          <div className="text-[13px] text-white/75 mt-1 leading-snug">{ymKo(ym)}만 끝 날짜를 바꿔요. 다음 달은 그다음 날부터 자동으로 시작해요.</div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="text-[13px] font-black text-[#14213D] mb-2">{ymKo(ym)} 끝 날짜</div>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((d) => <button key={d} type="button" disabled={isViewer} onClick={() => setEnd(d)} className={chip(end === d)}>{md(d)}{d === range.natural ? " (원래)" : ""}</button>)}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[13px] font-bold text-[#5B6B85]">
              다른 날짜
              <input type="date" disabled={isViewer} value={end} min={range.min} max={range.max} onChange={(e) => setEnd(e.target.value)} className="h-9 px-2 rounded-lg border border-[#DCE3EE] text-[#14213D] font-black outline-none focus:border-[#2D4C82]" />
            </div>
          </div>
          <div className="rounded-xl bg-[#F6F8FB] border border-[#E1E6EF] px-4 py-3 text-[13px] leading-relaxed text-[#3A4A66]">
            {valid ? [ym, nextYm(ym)].map((k) => { const p = closePeriodOf(k, trial); return (
              <div key={k} className="flex justify-between gap-3"><span className="font-bold">{ymKo(k)}</span><span className="font-black text-[#14213D] tabular-nums">{md(p.from)} ~ {md(p.to)}{p.changed ? " (변경)" : ""}</span></div>
            ); }) : <span className="font-bold text-[#C62F25]">{md(range.min)} ~ {md(range.max)} 사이 날짜를 골라 주세요</span>}
            <div className="mt-2 text-[12px] text-[#5A6781]">· 이번 달만 바뀌어요. 그 뒤 달은 원래 마감일({cur?.day ? `${cur.day}일` : "말일"})대로예요</div>
          </div>
          {ym < kstYm(0) && <div className="rounded-xl bg-[#F4F6FA] border border-[#D9E0EC] border-l-[3px] border-l-[#2D4C82] px-4 py-2.5 text-[12.5px] font-bold text-[#3A4A66]">지난달 기간을 바꾸면 그 달 명세서 · 미수금 금액이 달라질 수 있어요. 이미 보낸 명세서가 있으면 다시 확인해 주세요.</div>}
          {err && <div className="text-[13px] font-black text-[#C62F25]">{err}</div>}
          <div className="flex gap-2 pt-1">
            {was && <button type="button" onClick={() => save("")} disabled={busy || isViewer} className="h-11 px-4 rounded-xl border border-[#D5DDEA] text-[14px] font-black text-[#1B2B4B]">원래대로</button>}
            <button type="button" onClick={() => onClose?.()} disabled={busy} className="ml-auto h-11 px-4 rounded-xl border border-[#E3E8F0] text-[14.5px] font-black text-[#5B6B85]">취소</button>
            <button type="button" onClick={() => save(end)} disabled={busy || isViewer || !valid || same} className="h-11 px-5 rounded-xl bg-[#14213D] text-white text-[14.5px] font-black disabled:opacity-40">{busy ? "저장 중…" : "저장"}</button>
          </div>
        </div>
      </div>
    </div>, document.body);
}
