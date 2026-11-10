// ======================= src/PrivateFares.jsx =======================
// 🔒 2026-11-10 비공개 청구운임(업체 요청) — 직원들이 아는 청구운임과 따로, 정한 사람만 보는 "실제 청구 금액"
//  예) 홍길거래처 오더: 직원들이 보는 청구운임 400,000 → 실제로는 500,000을 청구(차액 100,000은 담당자만 안다)
//
//  ▸ 어디에 저장하나(오더 문서에는 절대 쓰지 않는다 — 오더는 직원 누구나 읽을 수 있어서 화면만 숨겨선 안전하지 않다)
//    privateFareSettings/{회사 키}            = { companyName, viewers:[uid], viewerNames:{uid:이름}, clients:[{ name, mode, value }] }
//    privateFareSettings/{회사 키}/fares/{오더id} = { orderId, client, date, route, base(그때 공개 청구운임), amount(실제 청구), memo }
//  ▸ 누가 보나 — firestore.rules가 지킨다(scripts/privateFareRules.test.cjs)
//    · 금액·설정은 viewers에 든 사람만(회사 마스터·관리자·최고관리자도 viewers가 아니면 못 본다)
//    · 처음 켜기: 같은 회사 마스터(또는 관리자)가 담당자를 고른다 → 그 뒤로는 담당자만 고친다
//  ▸ 거래처 규칙(실제 청구 자동 계산) — 직접 입력 · 공개 청구운임 + 정액 · 공개 청구운임 × 비율(%)
//    오더마다 직접 고친 값이 있으면 그 값이 우선
//  ▸ 화면: 매출관리 › 리포트 도구 › [비공개 청구](담당자에게만 보임 · 권한 확인은 DispatchApp usePrivateFareAccessLazy) — PC·모바일(같은 매출관리 화면)
import React from "react";
import { createPortal } from "react-dom";
import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { subscribeUsersLive } from "./usersLive";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const NUM = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };
const coKey = (co) => String(co || "").trim().replace(/\//g, "_");
const toNum = (v) => Number(String(v ?? "").replace(/[^\d-]/g, "")) || 0;
const won = (n) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}`;
const kstYm = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
const CANCEL = /취소/;
export const PF_MODES = [["manual", "직접 입력"], ["add", "공개 청구운임 + 정액"], ["rate", "공개 청구운임 × 비율"]];

// 거래처 규칙으로 계산한 실제 청구(직접 입력 규칙이면 0 → 오더마다 넣는다)
export function ruleAmount(rule, base) {
  const b = Number(base) || 0;
  if (!rule || !b) return 0;
  const v = Number(rule.value) || 0;
  if (rule.mode === "add") return b + v;
  if (rule.mode === "rate") return Math.round((b * v) / 100 / 10) * 10; // 10원 단위
  return 0;
}
// 오더 하나의 실제 청구(저장한 값 → 규칙 → 없음)
export function privateAmountOf(order, saved, rule) {
  if (saved && Number(saved.amount)) return { amount: Number(saved.amount), auto: false };
  const a = ruleAmount(rule, toNum(order?.청구운임));
  return { amount: a, auto: !!a };
}

function useCompanyStaff(company) {
  const [list, setList] = React.useState([]);
  React.useEffect(() => subscribeUsersLive((_l, raw) => {
    setList((raw || []).map(({ id, data }) => ({ id, ...(data || {}) }))
      .filter((u) => String(u.companyName || "").trim() === String(company || "").trim() && !["driver", "shipper", "cafeUser"].includes(u.role) && u.approved !== false && u.employmentStatus !== "퇴사")
      .map((u) => ({ id: u.id, name: u.name || u.이름 || u.email || u.id, team: u.team || "", position: u.position || "" }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko")));
  }), [company]);
  return list;
}

const btn = "h-9 px-3.5 rounded-[10px] text-[13px] font-bold border transition inline-flex items-center gap-1.5";
const inp = "h-9 px-3 rounded-[10px] border border-[#DCE3EF] text-[14px] font-bold text-[#0F1A30] bg-white outline-none focus:border-[#2D4C82]";

// ── 처음 켜기(마스터·관리자) / 설정(담당자) ──
function SettingsForm({ company, settings, clientNames, onDone, first = false }) {
  const staff = useCompanyStaff(company);
  const me = auth.currentUser?.uid || "";
  const [viewers, setViewers] = React.useState(() => settings?.viewers || []);
  const [rules, setRules] = React.useState(() => settings?.clients || []);
  const [pick, setPick] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const nameOf = (id) => staff.find((s) => s.id === id)?.name || settings?.viewerNames?.[id] || "직원";
  const save = async () => {
    setMsg("");
    if (!viewers.length) return setMsg("볼 사람을 한 명 이상 골라 주세요");
    if (viewers.length > 10) return setMsg("볼 사람은 10명까지예요");
    if (!rules.length) return setMsg("비공개로 청구할 거래처를 하나 이상 넣어 주세요");
    if (!first && !viewers.includes(me) && !window.confirm("나를 빼면 저장 뒤 이 화면을 더 볼 수 없어요. 계속할까요?")) return;
    setBusy(true);
    try {
      const data = {
        companyName: company, viewers, viewerNames: Object.fromEntries(viewers.map((id) => [id, nameOf(id)])),
        clients: rules.map((r) => ({ name: String(r.name || "").trim(), mode: r.mode || "manual", value: Number(r.value) || 0 })).filter((r) => r.name),
        updatedAt: serverTimestamp(), updatedBy: me,
      };
      const ref = doc(db, "privateFareSettings", coKey(company));
      if (first) await setDoc(ref, { ...data, createdAt: serverTimestamp(), createdBy: me });
      else await updateDoc(ref, data);
      onDone?.(data);
    } catch (e) {
      setMsg(String(e?.code || "").includes("permission") ? "권한이 없어요 — 처음 켜기는 회사 마스터·관리자, 그 뒤로는 담당자만 할 수 있어요" : `저장하지 못했어요 (${e?.code || e?.message || "오류"})`);
    } finally { setBusy(false); }
  };
  const freeClients = clientNames.filter((n) => !rules.some((r) => r.name === n));
  return (
    <div className="space-y-5">
      <section>
        <div className="text-[14px] font-black text-[#0F1A30]">볼 사람 <span className="text-[12.5px] font-bold text-[#7A879C]">— 여기 넣은 사람만 실제 청구 금액을 봅니다(마스터·관리자도 넣지 않으면 못 봄)</span></div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {viewers.map((id) => (
            <span key={id} className="h-8 pl-3 pr-1 rounded-full bg-[#0F1A30] text-white text-[13px] font-bold inline-flex items-center gap-1">{nameOf(id)}{id === me ? " (나)" : ""}
              <button type="button" onClick={() => setViewers((v) => v.filter((x) => x !== id))} className="w-6 h-6 rounded-full hover:bg-white/20" aria-label="빼기">×</button>
            </span>
          ))}
          <select className={inp} value="" onChange={(e) => { const v = e.target.value; if (v && !viewers.includes(v)) setViewers((x) => [...x, v]); }}>
            <option value="">+ 사람 추가</option>
            {staff.filter((s) => !viewers.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}{s.position ? ` · ${s.position}` : ""}{s.team ? ` · ${s.team}` : ""}</option>)}
          </select>
        </div>
      </section>
      <section>
        <div className="text-[14px] font-black text-[#0F1A30]">비공개 청구 거래처 <span className="text-[12.5px] font-bold text-[#7A879C]">— 실제 청구를 자동으로 계산할 규칙(오더마다 직접 고칠 수 있음)</span></div>
        <div className="mt-2 space-y-2">
          {rules.map((r, i) => (
            <div key={`${r.name}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#E3E8F0] bg-white px-3 py-2">
              <span className="text-[14px] font-black text-[#0F1A30] min-w-[120px]">{r.name}</span>
              <select className={inp} value={r.mode || "manual"} onChange={(e) => setRules((x) => x.map((y, j) => (j === i ? { ...y, mode: e.target.value } : y)))}>
                {PF_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              {r.mode === "add" && <input className={`${inp} w-[140px] text-right`} style={NUM} inputMode="numeric" value={r.value ? won(r.value) : ""} placeholder="예) 100,000" onChange={(e) => setRules((x) => x.map((y, j) => (j === i ? { ...y, value: toNum(e.target.value) } : y)))} />}
              {r.mode === "add" && <span className="text-[13px] font-bold text-[#5B6B85]">원 더하기</span>}
              {r.mode === "rate" && <input className={`${inp} w-[90px] text-right`} style={NUM} inputMode="numeric" value={r.value || ""} placeholder="125" onChange={(e) => setRules((x) => x.map((y, j) => (j === i ? { ...y, value: toNum(e.target.value) } : y)))} />}
              {r.mode === "rate" && <span className="text-[13px] font-bold text-[#5B6B85]">% (예: 125 = 40만 → 50만)</span>}
              <button type="button" onClick={() => setRules((x) => x.filter((_, j) => j !== i))} className="ml-auto h-8 px-2.5 rounded-lg text-[12.5px] font-bold text-[#B42318] hover:bg-[#FEF3F2]">빼기</button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${inp} w-[220px]`} list="pf-clients" value={pick} onChange={(e) => setPick(e.target.value)} placeholder="거래처 이름(고르거나 입력)" />
            <datalist id="pf-clients">{freeClients.map((n) => <option key={n} value={n} />)}</datalist>
            <button type="button" onClick={() => { const n = pick.trim(); if (n && !rules.some((r) => r.name === n)) setRules((x) => [...x, { name: n, mode: "manual", value: 0 }]); setPick(""); }} className={`${btn} bg-white border-[#DCE3EF] text-[#1B2B4B]`}>+ 거래처 추가</button>
          </div>
        </div>
      </section>
      {msg && <div className="rounded-xl bg-[#FEF3F2] border border-[#FECDCA] px-3.5 py-2.5 text-[13.5px] font-bold text-[#B42318]">{msg}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={save} className={`${btn} bg-[#0F1A30] border-[#0F1A30] text-white disabled:opacity-50`}>{busy ? "저장 중…" : first ? "비공개 청구 켜기" : "설정 저장"}</button>
      </div>
    </div>
  );
}

// ── 오더별 실제 청구 ──
function FareRow({ r, saved, rule, company, onSaved }) {
  const id = r._id || r.id;
  const base = toNum(r.청구운임);
  const cur = privateAmountOf(r, saved, rule);
  const [v, setV] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const commit = async () => {
    setEditing(false);
    const n = toNum(v);
    if (String(v).trim() === "" || n === cur.amount) return;
    setBusy(true);
    try {
      await setDoc(doc(db, "privateFareSettings", coKey(company), "fares", String(id)), {
        orderId: String(id), client: r.거래처명 || "", date: String(r.상차일 || "").slice(0, 10), route: `${r.상차지명 || ""} → ${r.하차지명 || ""}`,
        base, amount: n, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || "",
      }, { merge: true });
      onSaved?.();
    } catch (e) { window.alert(`저장하지 못했어요 (${e?.code || "오류"})`); } finally { setBusy(false); }
  };
  const diff = cur.amount ? cur.amount - base : 0;
  return (
    <tr className="border-t border-[#EEF1F6]">
      <td className="px-3 py-2 text-[13px] font-bold text-[#5B6B85] whitespace-nowrap" style={NUM}>{String(r.상차일 || "").slice(5).replace("-", ".")}</td>
      <td className="px-3 py-2 text-[13.5px] font-extrabold text-[#0F1A30] whitespace-nowrap">{r.거래처명 || "-"}</td>
      <td className="px-3 py-2 text-[13px] text-[#3A4A66] max-w-[260px] truncate" title={`${r.상차지명 || ""} → ${r.하차지명 || ""}`}>{r.상차지명 || "-"} → {r.하차지명 || "-"}</td>
      <td className="px-3 py-2 text-right text-[13.5px] font-bold text-[#5B6B85] whitespace-nowrap" style={NUM}>{won(base)}</td>
      <td className="px-3 py-1.5 text-right whitespace-nowrap">
        {editing ? (
          <input autoFocus className={`${inp} w-[130px] text-right`} style={NUM} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d]/g, "") ? won(toNum(e.target.value)) : "")}
            onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setV(""); setEditing(false); } }} />
        ) : (
          <button type="button" disabled={busy} onClick={() => { setV(cur.amount ? won(cur.amount) : ""); setEditing(true); }}
            className={`h-8 min-w-[120px] px-2.5 rounded-lg text-right text-[14px] font-black border ${cur.amount ? "border-[#C9D6EE] bg-[#F5F8FD] text-[#0F1A30]" : "border-dashed border-[#C9D2E0] text-[#9AA9C3]"}`} style={NUM}>
            {cur.amount ? won(cur.amount) : "입력"}{cur.auto && <span className="ml-1 text-[10px] font-black text-[#4B6CB7] align-middle">자동</span>}
          </button>
        )}
      </td>
      <td className={`px-3 py-2 text-right text-[13.5px] font-black whitespace-nowrap ${diff > 0 ? "text-[#0F1A30]" : diff < 0 ? "text-[#B42318]" : "text-[#9AA9C3]"}`} style={NUM}>{cur.amount ? `${diff > 0 ? "+" : ""}${won(diff)}` : "-"}</td>
      <td className="px-3 py-2 text-[12px] font-bold text-[#7A879C] whitespace-nowrap">{r.배차상태 || ""}</td>
    </tr>
  );
}

function MainView({ company, settings, dispatchData }) {
  const [ym, setYm] = React.useState(kstYm);
  const [client, setClient] = React.useState("");
  const [saved, setSaved] = React.useState({});
  React.useEffect(() => onSnapshot(collection(db, "privateFareSettings", coKey(company), "fares"), (s) => {
    const m = {}; s.docs.forEach((d) => { m[d.id] = d.data(); }); setSaved(m);
  }, () => setSaved({})), [company]);
  const rules = settings?.clients || [];
  const ruleOf = React.useMemo(() => new Map(rules.map((r) => [r.name, r])), [rules]);
  const rows = React.useMemo(() => (dispatchData || [])
    .filter((r) => ruleOf.has(String(r.거래처명 || "").trim()) && String(r.상차일 || "").startsWith(ym) && !CANCEL.test(String(r.배차상태 || "")))
    .filter((r) => !client || String(r.거래처명 || "").trim() === client)
    .sort((a, b) => String(a.상차일 || "").localeCompare(String(b.상차일 || ""))), [dispatchData, ruleOf, ym, client]);
  const tot = rows.reduce((a, r) => {
    const b = toNum(r.청구운임); const c = privateAmountOf(r, saved[r._id || r.id], ruleOf.get(String(r.거래처명 || "").trim()));
    a.base += b; a.real += c.amount || 0; if (c.amount) a.diff += c.amount - b; else a.missing += 1; return a;
  }, { base: 0, real: 0, diff: 0, missing: 0 });
  const months = Array.from({ length: 12 }, (_, i) => { const k = new Date(Date.now() + 9 * 3600e3); return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() - i, 1)).toISOString().slice(0, 7); });
  const exportCsv = () => {
    const head = ["상차일", "거래처명", "상차지", "하차지", "공개 청구운임", "실제 청구", "차액", "배차상태"];
    const lines = [head.join(",")];
    rows.forEach((r) => {
      const b = toNum(r.청구운임); const c = privateAmountOf(r, saved[r._id || r.id], ruleOf.get(String(r.거래처명 || "").trim()));
      lines.push([r.상차일, r.거래처명, r.상차지명, r.하차지명, b, c.amount || "", c.amount ? c.amount - b : "", r.배차상태].map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(","));
    });
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `실제청구_${client || "전체"}_${ym}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className={inp} value={ym} onChange={(e) => setYm(e.target.value)}>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        <select className={inp} value={client} onChange={(e) => setClient(e.target.value)}>
          <option value="">비공개 거래처 전체</option>
          {rules.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
        </select>
        <button type="button" onClick={exportCsv} className={`${btn} ml-auto bg-[#1B2B4B] border-[#1B2B4B] text-white`}>CSV(실제 청구)</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[["공개 청구운임", tot.base, "직원들이 보는 금액"], ["실제 청구", tot.real, "거래처에 청구하는 금액"], ["차액", tot.diff, "담당자만 아는 금액"], ["미입력", tot.missing, "실제 청구가 비어 있는 오더"]].map(([k, v, s], i) => (
          <div key={k} className={`rounded-2xl px-4 py-3 ${i === 2 ? "bg-[#0F1A30] text-white" : "bg-white border border-[#E3E8F0]"}`}>
            <div className={`text-[12px] font-bold ${i === 2 ? "text-[#8FB0F0]" : "text-[#7A879C]"}`}>{k}</div>
            <div className="text-[20px] font-black" style={NUM}>{i === 3 ? `${v}건` : `${won(v)}원`}</div>
            <div className={`text-[11.5px] font-bold ${i === 2 ? "text-white/55" : "text-[#9AA9C3]"}`}>{s}</div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-[#E3E8F0] bg-white overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead><tr className="bg-[#F5F8FD] text-[12px] font-extrabold text-[#5B6B85]">
            {["상차일", "거래처", "구간", "공개 청구운임", "실제 청구", "차액", "상태"].map((h, i) => <th key={h} className={`px-3 py-2 ${i >= 3 && i <= 5 ? "text-right" : "text-left"}`}>{h}</th>)}
          </tr></thead>
          <tbody>
            {!rows.length && <tr><td colSpan={7} className="py-12 text-center text-[13.5px] font-bold text-[#9AA9C3]">{ym} 비공개 거래처 오더가 없어요</td></tr>}
            {rows.map((r) => <FareRow key={r._id || r.id} r={r} saved={saved[r._id || r.id]} rule={ruleOf.get(String(r.거래처명 || "").trim())} company={company} />)}
          </tbody>
        </table>
      </div>
      <div className="text-[12px] font-bold text-[#9AA9C3] leading-relaxed">실제 청구 금액은 오더와 따로 보관돼 직원 화면(배차·매출·정산·거래명세서)에는 나오지 않습니다. 「자동」은 거래처 규칙으로 계산한 값이며, 누르면 그 오더만 직접 고칠 수 있어요.</div>
    </div>
  );
}

// 매출관리 › 리포트 도구에서 여는 창
export default function PrivateFaresModal({ company, dispatchData = [], clients = [], access, onClose }) {
  const [tab, setTab] = React.useState("main");
  const clientNames = React.useMemo(() => Array.from(new Set([
    ...(clients || []).map((c) => String(c?.거래처명 || c?.name || "").trim()),
    ...(dispatchData || []).map((r) => String(r?.거래처명 || "").trim()),
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko")), [clients, dispatchData]);
  const first = !access?.exists;
  return createPortal(
    <div className="fixed inset-0 z-[99990] bg-[#0F1A30]/45 flex items-stretch md:items-center justify-center md:p-6" onClick={onClose}>
      <div className="w-full md:max-w-[1100px] max-h-full md:max-h-[92vh] flex flex-col bg-[#F4F6FA] md:rounded-[22px] overflow-hidden shadow-[0_24px_64px_rgba(15,26,48,0.35)]" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 md:px-6 py-4 text-white flex items-center gap-3" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)", paddingTop: "max(16px, env(safe-area-inset-top))" }}>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={NUM}>PRIVATE BILLING · 담당자 전용</div>
            <div className="text-[19px] font-black">비공개 청구운임</div>
          </div>
          {!first && <div className="inline-flex p-1 rounded-xl bg-white/10">
            {[["main", "실제 청구"], ["set", "설정"]].map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={`h-8 px-3 rounded-lg text-[13px] font-black ${tab === k ? "bg-white text-[#0F1A30]" : "text-white/75"}`}>{l}</button>)}
          </div>}
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 grid place-items-center" aria-label="닫기">×</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
          {first ? (
            <>
              <div className="mb-4 rounded-2xl bg-white border border-[#E3E8F0] px-4 py-3 text-[13.5px] font-bold text-[#3A4A66] leading-relaxed">
                직원들이 보는 청구운임과 별도로, <b>정한 사람만</b> 실제 청구 금액을 기록·확인합니다. 예) 홍길거래처 청구운임 400,000 → 실제 청구 500,000.<br />
                켜고 나면 설정은 <b>볼 사람만</b> 바꿀 수 있어요(마스터·관리자라도 볼 사람이 아니면 금액을 못 봅니다).
              </div>
              <SettingsForm company={company} settings={null} clientNames={clientNames} first onDone={() => { onClose?.(); window.dispatchEvent(new Event("kp-private-fare-changed")); }} />
            </>
          ) : tab === "set"
            ? <SettingsForm company={company} settings={access?.settings} clientNames={clientNames} onDone={() => setTab("main")} />
            : <MainView company={company} settings={access?.settings} dispatchData={dispatchData} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
