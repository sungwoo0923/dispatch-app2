// ======================= src/DriverAccounts.jsx =======================
// 🚚 기사관리 › 기사 앱 계정(2026-10-31) — 기사 가입 승인 · 승인된 기사를 카드로. PC·모바일 공용.
//  카드: 차량번호 번호판 · 차종·톤수 · 연락처 · 거주지 · 필수 서류 완비율 · 가입일 → 승인/거절, 승인 해제
import React from "react";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "./firebase";
import { useCompanyDriverDocs, docProblems, DRIVER_REQUIRED_DOCS, docState } from "./driverRequiredDocs";
import { BookHero, Chip, MONO } from "./OfficeBooks";

const REQ = DRIVER_REQUIRED_DOCS.filter((d) => d.required);
const tsDay = (v) => { const ms = v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0; return ms ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 10) : ""; };

function Plate({ no }) {
  return <span className="inline-flex items-center h-7 px-2.5 rounded-md border-2 border-[#0F1A30] bg-[#FDFDF7] text-[13px] font-black text-[#0F1A30] tracking-wide whitespace-nowrap" style={{ fontFamily: MONO }}>{no || "차량번호 없음"}</span>;
}
function Ring({ v }) {
  const r = 17; const c = 2 * Math.PI * r; const p = Math.max(0, Math.min(1, v));
  return (
    <svg width="42" height="42" className="shrink-0"><circle cx="21" cy="21" r={r} stroke="#E3E8F0" strokeWidth="4" fill="none" /><circle cx="21" cy="21" r={r} stroke={p >= 1 ? "#12B76A" : "#1B2B4B"} strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 21 21)" /><text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize="10.5" fontWeight="900" fill="#0F1A30" fontFamily={MONO}>{Math.round(p * 100)}</text></svg>
  );
}

export default function DriverAccounts({ company, isViewer = false, tab = "pending", onTab }) {
  const [users, setUsers] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [kind, setKind] = React.useState("전체");
  const docsBy = useCompanyDriverDocs(company);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "users"), where("companyName", "==", company)), (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.role === "driver" && (u.companyName || DEFAULT_COMPANY) === company)), () => setUsers([]));
  }, [company]);
  const drivers = users || [];
  const pending = drivers.filter((u) => u.approved === false);
  const approved = drivers.filter((u) => u.approved !== false);
  const kinds = ["전체", ...Array.from(new Set(drivers.map((u) => u.vehicleType || u.차량종류).filter(Boolean)))];
  const kw = q.trim();
  const list = (tab === "pending" ? pending : approved)
    .filter((u) => kind === "전체" || (u.vehicleType || u.차량종류) === kind)
    .filter((u) => !kw || [u.name, u.carNo, u.phone, u.거주지].some((v) => String(v || "").includes(kw)))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  const approve = async (u, next) => {
    if (isViewer) return;
    if (!window.confirm(next ? `${u.name || "기사"}님 가입을 승인할까요?` : `${u.name || "기사"}님 승인을 해제할까요?\n해제하면 기사앱 로그인이 막힙니다.`)) return;
    setBusy(u.id);
    try {
      await setDoc(doc(db, "users", u.id), { approved: next }, { merge: true });
      await updateDoc(doc(db, "drivers", u.id), { approved: next }).catch(() => {});
    } finally { setBusy(""); }
  };
  const reject = async (u) => {
    if (isViewer || !window.confirm(`${u.name || "기사"}님 가입 신청을 거절할까요? 신청 정보가 삭제됩니다.`)) return;
    setBusy(u.id);
    try { await deleteDoc(doc(db, "users", u.id)); await deleteDoc(doc(db, "drivers", u.id)).catch(() => {}); } finally { setBusy(""); }
  };
  const docRate = (u) => { const b = docsBy?.[u.id] || {}; return REQ.filter((r) => b[r.key] && docState(b[r.key]).tone !== "bad").length / REQ.length; };
  const fullDocs = approved.filter((u) => docRate(u) >= 1).length;
  return (
    <div className="space-y-4">
      <BookHero en="DRIVERS · APP ACCOUNTS" title={tab === "pending" ? "기사 가입 승인" : "승인된 기사"} desc="기사앱으로 가입한 기사님 — 차량·연락처·제출 서류를 보고 승인합니다"
        kpis={[["가입 대기", `${pending.length}명`], ["승인된 기사", `${approved.length}명`], ["필수 서류 완비", `${fullDocs}명`, `${approved.length ? Math.round((fullDocs / approved.length) * 100) : 0}%`], ["이번 달 가입", `${drivers.filter((u) => tsDay(u.createdAt).startsWith(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7))).length}명`]]} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex p-1 rounded-xl bg-white border border-[#E3E8F0]">
          {[["pending", `가입 승인 ${pending.length}`], ["drivers", `승인된 기사 ${approved.length}`]].map(([k, l]) => <button key={k} type="button" onClick={() => onTab?.(k)} className={`h-9 px-4 rounded-lg text-[13.5px] font-black ${tab === k ? "bg-[#0F1A30] text-white" : "text-[#5B6B85]"}`}>{l}</button>)}
        </div>
        <div className="flex gap-1.5 overflow-x-auto">{kinds.map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{k}</Chip>)}</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="기사명·차량번호·전화·거주지" className="ml-auto h-10 w-full md:w-[260px] px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] outline-none focus:border-[#2D4C82]" />
      </div>
      {users === null ? <div className="py-20 text-center text-[13.5px] font-bold text-[#9AA9C3]">불러오는 중…</div> : !list.length ? (
        <div className="rounded-[20px] border-2 border-dashed border-[#DCE3EE] bg-white py-16 text-center text-[14px] font-bold text-[#9AA9C3]">{tab === "pending" ? "가입 신청한 기사님이 없습니다" : "승인된 기사님이 없습니다"}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {list.map((u) => {
            const rate = docRate(u); const p = docProblems(docsBy?.[u.id]);
            return (
              <div key={u.id} className={`rounded-[20px] bg-white border p-4 flex flex-col gap-3 ${tab === "pending" ? "border-[#C9D6EE] shadow-[0_8px_22px_rgba(45,76,130,0.10)]" : "border-[#E3E8F0]"}`}>
                <div className="flex items-start gap-3">
                  <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1B2B4B] to-[#2D4C82] text-white grid place-items-center text-[17px] font-black shrink-0">{String(u.name || "?").slice(0, 1)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[16px] font-black text-[#0F1A30] truncate">{u.name || "-"}</div>
                    <div className="mt-1"><Plate no={u.carNo} /></div>
                  </div>
                  <Ring v={rate} />
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
                  {[["차종", [u.vehicleType || u.차량종류, u.tonnage || u.차량톤수].filter(Boolean).join(" ") || "-"], ["연락처", u.phone || "-"], ["거주지", u.거주지 || u.address || "-"], ["가입일", tsDay(u.createdAt) || "-"]].map(([k, v]) => (
                    <div key={k} className="min-w-0"><div className="text-[10.5px] font-black text-[#9AA9C3]">{k}</div><div className="font-bold text-[#0F1A30] truncate" style={k === "연락처" || k === "가입일" ? { fontFamily: MONO } : undefined}>{v}</div></div>
                  ))}
                </div>
                {u.요청사항 && <div className="rounded-xl bg-[#F5F8FD] border border-[#EEF1F6] px-3 py-2 text-[12px] text-[#3A4A66] line-clamp-2">요청: {u.요청사항}</div>}
                <div className="flex items-center gap-1.5 text-[11px] font-black">
                  {p.missing ? <span className="px-1.5 py-0.5 rounded bg-[#F3F6FA] text-[#7A879C]">서류 미제출 {p.missing}</span> : null}
                  {p.wait ? <span className="px-1.5 py-0.5 rounded bg-[#EEF3FC] text-[#2D4C82]">검토 대기 {p.wait}</span> : null}
                  {p.bad ? <span className="px-1.5 py-0.5 rounded bg-[#FEF3F2] text-[#B42318]">반려·만료 {p.bad}</span> : null}
                  {!p.missing && !p.wait && !p.bad && <span className="px-1.5 py-0.5 rounded bg-[#ECFDF3] text-[#067647]">서류 완비</span>}
                </div>
                {!isViewer && (
                  <div className="mt-auto flex gap-2">
                    {tab === "pending" ? (
                      <>
                        <button type="button" disabled={busy === u.id} onClick={() => reject(u)} className="h-10 px-4 rounded-xl border border-[#DCE3EE] text-[13px] font-black text-[#5B6B85]">거절</button>
                        <button type="button" disabled={busy === u.id} onClick={() => approve(u, true)} className="flex-1 h-10 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black disabled:opacity-50">승인</button>
                      </>
                    ) : <button type="button" disabled={busy === u.id} onClick={() => approve(u, false)} className="ml-auto h-9 px-3.5 rounded-lg border border-[#FECDCA] text-[12.5px] font-black text-[#B42318]">승인 해제</button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
