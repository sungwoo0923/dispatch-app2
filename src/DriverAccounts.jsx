// ======================= src/DriverAccounts.jsx =======================
// 🚚 기사관리 › 기사 앱 계정(2026-10-31) — 기사 가입 승인 · 승인된 기사를 카드로. PC·모바일 공용.
//  카드: 차량번호 번호판 · 차종·톤수 · 연락처 · 거주지 · 필수 서류 완비율 · 가입일 → 승인/거절, 승인 해제
import React from "react";
import { collection, doc, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "./firebase";
import { useCompanyDriverDocs, docProblems, DRIVER_REQUIRED_DOCS, docState } from "./driverRequiredDocs";
import { BookHero, Chip, MONO } from "./OfficeBooks";
import { fmtPhone } from "./formatInput";
import { kpConfirm } from "./kpDialog";
// ⭐ 2026-11-05 승인·거절은 프로그램 창(입력 정보 전체 · 가입유형 · 기존 기사 연동)으로 — 브라우저 확인창 대신
import DriverApproveModal, { findDriverCandidates } from "./DriverApproveModal";

const REQ = DRIVER_REQUIRED_DOCS.filter((d) => d.required);
const tsDay = (v) => { const ms = v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0; return ms ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 10) : ""; };

// ⭐ 2026-10-31 디지털 번호판 — 어두운 패널 + 빛나는 숫자(전광판 느낌)
export function Plate({ no, big = false }) {
  return (
    <span className={`inline-flex items-stretch rounded-lg overflow-hidden whitespace-nowrap ${big ? "h-11" : "h-9"}`} style={{ background: "linear-gradient(180deg,#0A1222,#121F3A)", boxShadow: "inset 0 0 0 1.5px rgba(143,176,240,0.55), 0 0 18px rgba(110,149,232,0.28)" }}>
      <span className="px-1.5 grid place-items-center text-[9px] font-black tracking-wider text-white" style={{ background: "linear-gradient(180deg,#2D4C82,#1B2B4B)", fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>KR</span>
      <span className={`px-3 grid place-items-center font-black tracking-[0.12em] ${big ? "text-[22px]" : "text-[18px]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: no ? "#E8F0FF" : "#5B6B85", textShadow: no ? "0 0 8px rgba(143,176,240,0.85), 0 0 2px #fff" : "none" }}>{no || "번호 없음"}</span>
    </span>
  );
}
function Ring({ v }) {
  const r = 20; const c = 2 * Math.PI * r; const p = Math.max(0, Math.min(1, v));
  return (
    <svg width="52" height="52" className="shrink-0"><circle cx="26" cy="26" r={r} stroke="rgba(255,255,255,0.12)" strokeWidth="5" fill="none" /><circle cx="26" cy="26" r={r} stroke={p >= 1 ? "#32D583" : "#8FB0F0"} strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 26 26)" style={{ filter: "drop-shadow(0 0 4px rgba(143,176,240,0.6))" }} /><text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize="13" fontWeight="900" fill="#fff" fontFamily={MONO}>{Math.round(p * 100)}</text></svg>
  );
}
const CARD_BG = "linear-gradient(rgba(143,176,240,.06) 1px, transparent 1px) 0 0/18px 18px, linear-gradient(90deg, rgba(143,176,240,.06) 1px, transparent 1px) 0 0/18px 18px, linear-gradient(140deg,#0B1428 0%,#15233F 55%,#22406F 100%)";

export default function DriverAccounts({ company, isViewer = false, tab = "pending", onTab }) {
  const [users, setUsers] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [kind, setKind] = React.useState("전체");
  const docsBy = useCompanyDriverDocs(company);
  const [open, setOpen] = React.useState(null); // { id, reject }
  const [flash, setFlash] = React.useState("");
  // ⭐ 2026-11-05 기사관리(drivers) — 가입 기사의 가입 문서 + 같은 기사(연동 후보) 찾기용. 가입 승인 탭에서만 받는다
  const [drvDocs, setDrvDocs] = React.useState([]);
  React.useEffect(() => {
    if (!company || tab !== "pending") return undefined;
    return onSnapshot(query(collection(db, "drivers"), where("companyName", "==", company)), (s) => setDrvDocs(s.docs.map((d) => ({ id: d.id, data: d.data() }))), () => setDrvDocs([]));
  }, [company, tab]);
  const [logs, setLogs] = React.useState([]);
  React.useEffect(() => {
    if (!company || tab !== "pending") return undefined;
    return onSnapshot(query(collection(db, "driverSignupLogs"), where("companyName", "==", company)), (s) => setLogs(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0)).slice(0, 8)), () => setLogs([]));
  }, [company, tab]);
  const signupOf = (u) => drvDocs.find((d) => d.id === u.id)?.data || null;
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
  // 승인 해제(승인된 기사 탭) — 프로그램 확인창
  const unapprove = async (u) => {
    if (isViewer) return;
    if (!await kpConfirm(`${u.name || "기사"}님 승인을 해제할까요?\n해제하면 기사앱 로그인이 막힙니다.`)) return;
    setBusy(u.id);
    try {
      await setDoc(doc(db, "users", u.id), { approved: false }, { merge: true });
      await updateDoc(doc(db, "drivers", u.id), { approved: false, approvalRevoked: true }).catch(() => {}); // 승인 해제 표시 — 기사관리 목록에는 남는다
    } finally { setBusy(""); }
  };
  const openU = open ? pending.find((u) => u.id === open.id) : null;
  const onDone = (r) => {
    const u = openU; setOpen(null);
    setFlash(r.kind === "reject" ? `${u?.name || "기사"}님 가입 신청을 거절했습니다` : r.kind === "link" ? `${u?.name || "기사"}님을 기존 기사 정보에 연동해 「${r.type}」로 승인했습니다` : `${u?.name || "기사"}님을 「${r.type}」 기사로 승인했습니다`);
    setTimeout(() => setFlash(""), 4000);
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
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {list.map((u) => {
            const rate = docRate(u); const p = docProblems(docsBy?.[u.id]);
            const cands = tab === "pending" ? findDriverCandidates(u, signupOf(u), drvDocs) : [];
            return (
              <div key={u.id} className={`relative rounded-[22px] p-5 flex flex-col gap-4 text-white overflow-hidden ${tab === "pending" ? "ring-2 ring-[#8FB0F0]/60" : ""}`} style={{ background: CARD_BG, boxShadow: "0 16px 36px rgba(15,26,48,0.28), inset 0 1px 0 rgba(255,255,255,0.08)" }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{tab === "pending" ? "PENDING · 가입 대기" : "DRIVER · ACTIVE"}</div>
                    <div className="text-[21px] font-black truncate mt-0.5">{u.name || "-"}</div>
                  </div>
                  <Ring v={rate} />
                </div>
                <Plate no={u.carNo} big />
                <div className="grid grid-cols-2 gap-2">
                  {[["차종", [u.차량종류, u.차량톤수].filter(Boolean).join(" ") || u.vehicleType || "-"] /* ⭐ 2026-11-05 "카고 5톤 5톤" 겹침 수정 */, ["연락처", (u.phone && (fmtPhone(u.phone) || u.phone)) || "-"], ["거주지", u.거주지 || u.address || "-"], ["가입일", tsDay(u.createdAt) || "-"]].map(([k, v]) => (
                    <div key={k} className="min-w-0 rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2"><div className="text-[12px] font-bold text-white/50">{k}</div><div className="text-[15.5px] font-black truncate" style={k === "연락처" || k === "가입일" ? { fontFamily: MONO, fontVariantNumeric: "tabular-nums" } : undefined}>{v}</div></div>
                  ))}
                </div>
                {cands.some((c) => c.samePlate) && <div className="rounded-xl bg-[#8FB0F0]/15 border border-[#8FB0F0]/40 px-3 py-2 text-[13px] font-black text-[#CFE0FF]">🔗 기사관리에 같은 기사 정보가 있어요 — 승인하면 연동됩니다</div>}
                {u.요청사항 && <div className="rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 text-[13.5px] text-white/80 line-clamp-2">요청: {u.요청사항}</div>}
                <div className="flex items-center gap-1.5 flex-wrap text-[12.5px] font-black">
                  {p.missing ? <span className="px-2 py-1 rounded-lg bg-white/10 text-white/80">서류 미제출 {p.missing}</span> : null}
                  {p.wait ? <span className="px-2 py-1 rounded-lg bg-[#8FB0F0]/20 text-[#CFE0FF]">검토 대기 {p.wait}</span> : null}
                  {p.bad ? <span className="px-2 py-1 rounded-lg bg-[#F04438]/20 text-[#FDA29B]">반려·만료 {p.bad}</span> : null}
                  {!p.missing && !p.wait && !p.bad && <span className="px-2 py-1 rounded-lg bg-[#32D583]/15 text-[#6CE9A6]">● 서류 완비</span>}
                </div>
                {!isViewer && (
                  <div className="mt-auto flex gap-2">
                    {tab === "pending" ? (
                      <>
                        <button type="button" onClick={() => setOpen({ id: u.id, reject: true })} className="h-11 px-4 rounded-xl border border-white/20 text-[14px] font-black text-white/75">거절</button>
                        <button type="button" data-testid="drv-card-approve" onClick={() => setOpen({ id: u.id, reject: false })} className="flex-1 h-11 rounded-xl bg-white text-[#0F1A30] text-[15px] font-black disabled:opacity-50">승인</button>
                      </>
                    ) : <button type="button" disabled={busy === u.id} onClick={() => unapprove(u)} className="ml-auto h-10 px-4 rounded-xl border border-[#FDA29B]/40 text-[13.5px] font-black text-[#FDA29B]">승인 해제</button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {tab === "pending" && logs.length > 0 && (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4">
          <div className="text-[13px] font-black text-[#0F1A30] mb-2">최근 처리 기록</div>
          <div className="divide-y divide-[#F1F4F9]">
            {logs.map((l) => (
              <div key={l.id} className="py-2 flex items-center gap-2 text-[13px] flex-wrap">
                <span className={`px-2 h-[22px] inline-flex items-center rounded-md text-[11.5px] font-black ${l.kind === "reject" ? "bg-[#FEE4E2] text-[#B42318]" : "bg-[#E7F0FF] text-[#2D4C82]"}`}>{l.kind === "reject" ? "거절" : l.kind === "link" ? `연동 승인 · ${l.type || ""}` : `승인 · ${l.type || ""}`}</span>
                <span className="font-black text-[#0F1A30]">{l.name || "-"}</span>
                <span className="font-bold text-[#5B6B85]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{l.carNo || ""}</span>
                {l.reason && <span className="font-bold text-[#7A879C] truncate max-w-full">사유: {l.reason}</span>}
                <span className="ml-auto text-[12px] font-bold text-[#9AA9C3]">{tsDay(l.at)} · {l.by || ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {flash && <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[2147481000] px-5 py-3 rounded-2xl bg-[#0F1A30] text-white text-[14px] font-black shadow-[0_12px_30px_rgba(11,20,40,0.35)]">{flash}</div>}
      {openU && (
        <DriverApproveModal key={openU.id} u={openU} signup={signupOf(openU)} candidates={findDriverCandidates(openU, signupOf(openU), drvDocs)}
          bizDoc={docsBy?.[openU.id]?.bizReg} company={company} startReject={!!open.reject} onClose={() => setOpen(null)} onDone={onDone} />
      )}
    </div>
  );
}

// ⭐ 2026-11-05 모바일 「기사 앱 계정」 화면 — 가입 승인 / 승인된 기사 탭 상태를 가진 감싸개
export function DriverAccountsPage({ company, isViewer = false, initialTab = "pending" }) {
  const [tab, setTab] = React.useState(initialTab);
  return <DriverAccounts company={company} isViewer={isViewer} tab={tab} onTab={setTab} />;
}
