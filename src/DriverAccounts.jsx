// ======================= src/DriverAccounts.jsx =======================
// 🚚 기사관리 › 기사 앱 계정(2026-10-31) — 기사 가입 승인 · 승인된 기사를 카드로. PC·모바일 공용.
//  카드: 차량번호 번호판 · 차종·톤수 · 연락처 · 거주지 · 필수 서류 완비율 · 가입일 → 승인/거절, 승인 해제
import React from "react";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "./firebase";
import { useCompanyDriverDocs, docProblems, DRIVER_REQUIRED_DOCS, docState } from "./driverRequiredDocs";
import { BookHero, MONO } from "./OfficeBooks";
import { fmtPhone } from "./formatInput";
import { kpConfirm } from "./kpDialog";
import { CustomSelect } from "./CustomSelect"; // ⭐ 2026-11-10 차종·등급 버튼 → 드롭다운
// ⭐ 2026-11-05 승인·거절은 프로그램 창(입력 정보 전체 · 가입유형 · 기존 기사 연동)으로 — 브라우저 확인창 대신
import DriverApproveModal, { findDriverCandidates } from "./DriverApproveModal";

const REQ = DRIVER_REQUIRED_DOCS.filter((d) => d.required);
const plateKey = (v) => String(v || "").replace(/\s+/g, "").toUpperCase();
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
  const [grade, setGrade] = React.useState("전체"); // ⭐ 2026-11-10 승인된 기사 — 등급(지입·직영·임대·일반) 드롭다운
  const docsBy = useCompanyDriverDocs(company);
  const [open, setOpen] = React.useState(null); // { id, reject }
  const [flash, setFlash] = React.useState("");
  // ⭐ 2026-11-05 기사관리(drivers) — 가입 기사의 가입 문서 + 같은 기사(연동 후보) 찾기용. 가입 승인 탭에서만 받는다
  const [drvDocs, setDrvDocs] = React.useState([]);
  React.useEffect(() => {
    if (!company) return undefined; // ⭐ 2026-11-10 승인된 기사 탭에서도(등급·담당자 표시)
    return onSnapshot(query(collection(db, "drivers"), where("companyName", "==", company)), (s) => setDrvDocs(s.docs.map((d) => ({ id: d.id, data: d.data() }))), () => setDrvDocs([]));
  }, [company, tab]);
  const [logs, setLogs] = React.useState([]);
  React.useEffect(() => {
    if (!company || tab !== "pending") return undefined;
    return onSnapshot(query(collection(db, "driverSignupLogs"), where("companyName", "==", company)), (s) => setLogs(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0)).slice(0, 8)), () => setLogs([]));
  }, [company, tab]);
  const signupOf = (u) => drvDocs.find((d) => d.id === u.id)?.data || null;
  // ⭐ 2026-11-10 기사관리 문서(문서 이름 = uid 또는 uid 칸) — 등급·담당자·차량
  const drvOf = (u) => drvDocs.find((d) => d.id === u.id) || drvDocs.find((d) => d.data?.uid === u.id)
    || (plateKey(u.carNo) ? drvDocs.find((d) => plateKey(d.data?.차량번호) === plateKey(u.carNo)) : null) || null; // 예전 방식(차량번호로 연결)도
  const [allUsers, setAllUsers] = React.useState([]);
  const staff = React.useMemo(() => allUsers.filter((x) => !["driver", "shipper", "cafeUser", "totalMaster"].includes(x.role) && x.approved !== false && x.employmentStatus !== "퇴사" && !x.noAccount)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko")), [allUsers]);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "users"), where("companyName", "==", company)), (s) => { const all = s.docs.map((d) => ({ id: d.id, ...d.data() })); setAllUsers(all); setUsers(all.filter((u) => u.role === "driver" && (u.companyName || DEFAULT_COMPANY) === company)); }, () => setUsers([]));
  }, [company]);
  const drivers = users || [];
  const pending = drivers.filter((u) => u.approved === false);
  const approved = drivers.filter((u) => u.approved !== false);
  const kinds = ["전체", ...Array.from(new Set(drivers.map((u) => u.vehicleType || u.차량종류).filter(Boolean)))];
  const gradeOf = (u) => String(drvOf(u)?.data?.등급 || u.driverType || "").trim() || "일반";
  const grades = ["전체", ...Array.from(new Set(approved.map(gradeOf)))];
  const kw = q.trim();
  const list = (tab === "pending" ? pending : approved)
    .filter((u) => kind === "전체" || (u.vehicleType || u.차량종류) === kind)
    .filter((u) => tab === "pending" || grade === "전체" || gradeOf(u) === grade)
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
  // ⭐ 2026-11-10 담당자(배차담당) 지정 — 지입차관리와 같은 칸 drivers.담당자 { uid, name }
  const assignMgr = async (u, sid) => {
    const dd = drvOf(u); if (!dd || isViewer) return;
    const st = staff.find((x) => x.id === sid);
    await updateDoc(doc(db, "drivers", dd.id), { 담당자: st ? { uid: st.id, name: st.name || st.email || "" } : null }).catch((e) => window.alert(`담당자 지정 실패: ${e?.message || e}`));
  };
  // ⭐ 2026-11-10 기사관리에서 이미 지운 기사의 앱 계정(남은 것) 정리
  const cleanupOrphan = async (u) => {
    if (isViewer) return;
    if (!await kpConfirm(`${u.name || "기사"}님은 기사관리에서 삭제된 기사입니다.\n남아 있는 기사앱 계정도 정리할까요?\n(정리하면 이 계정으로 기사앱 로그인이 안 됩니다 · 오더 기록은 그대로)`)) return;
    setBusy(u.id);
    try { await deleteDoc(doc(db, "users", u.id)); } catch (e) { window.alert(`정리 실패: ${e?.message || e}`); } finally { setBusy(""); }
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
        <div data-ro-allow className="inline-flex p-1 rounded-xl bg-white border border-[#E3E8F0]">{/* 탭 이동은 조회전용도 가능(readOnlyGuard) */}
          {[["pending", `가입 승인 ${pending.length}`], ["drivers", `승인된 기사 ${approved.length}`]].map(([k, l]) => <button key={k} type="button" onClick={() => onTab?.(k)} className={`h-9 px-4 rounded-lg text-[13.5px] font-black ${tab === k ? "bg-[#0F1A30] text-white" : "text-[#5B6B85]"}`}>{l}</button>)}
        </div>
        {/* ⭐ 2026-11-10 차종(·등급)마다 버튼 → 드롭다운 */}
        <div data-ro-allow className="w-[170px]"><CustomSelect value={kind} onChange={(e) => setKind(e.target.value)} className="h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-bold">
          {kinds.map((k) => <option key={k} value={k}>{k === "전체" ? "전체 차종" : k} ({(tab === "pending" ? pending : approved).filter((u) => k === "전체" || (u.vehicleType || u.차량종류) === k).length})</option>)}
        </CustomSelect></div>
        {tab !== "pending" && <div data-ro-allow className="w-[150px]"><CustomSelect value={grade} onChange={(e) => setGrade(e.target.value)} className="h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-bold">
          {grades.map((g) => <option key={g} value={g}>{g === "전체" ? "전체 등급" : g} ({approved.filter((u) => g === "전체" || gradeOf(u) === g).length})</option>)}
        </CustomSelect></div>}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="기사명·차량번호·전화·거주지" className="ml-auto h-10 w-full md:w-[260px] px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] outline-none focus:border-[#2D4C82]" />
      </div>
      {users === null ? <div className="py-20 text-center text-[13.5px] font-bold text-[#9AA9C3]">불러오는 중…</div> : !list.length ? (
        <div className="rounded-[20px] border-2 border-dashed border-[#DCE3EE] bg-white py-16 text-center text-[14px] font-bold text-[#9AA9C3]">{tab === "pending" ? "가입 신청한 기사님이 없습니다" : "승인된 기사님이 없습니다"}</div>
      ) : tab !== "pending" ? (
        // ⭐ 2026-11-10 승인된 기사 — 사원증처럼 작은 카드(이름·차량·차종톤·등급·담당자·서류)
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3" data-testid="drv-idcards">
          {list.map((u) => {
            const dd = drvOf(u); const g = gradeOf(u); const rate = docRate(u); const mgr = dd?.data?.담당자;
            const car = [u.차량종류 || dd?.data?.차량종류, u.차량톤수 || dd?.data?.차량톤수].filter(Boolean).join(" ") || u.vehicleType || "";
            return (
              <div key={u.id} className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden shadow-[0_4px_14px_rgba(15,26,48,0.06)] flex flex-col">
                <div className="h-7 px-3 flex items-center justify-between text-white" style={{ background: CARD_BG }}>
                  <span className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>DRIVER ID</span>
                  <span className={`px-1.5 h-[18px] inline-flex items-center rounded text-[10.5px] font-black ${g === "블랙" ? "bg-[#F04438] text-white" : g === "일반" ? "bg-white/15 text-white/85" : "bg-white text-[#0F1A30]"}`}>{g}</span>
                </div>
                <div className="p-3 flex gap-3 items-start">
                  <div className="w-11 h-11 rounded-xl grid place-items-center text-white text-[17px] font-black shrink-0" style={{ background: CARD_BG }}>{String(u.name || "?").slice(0, 1)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5"><span className="text-[15px] font-black text-[#0F1A30] truncate">{u.name || "-"}</span><span className="ml-auto text-[10.5px] font-black text-[#7A89A3] tabular-nums" style={{ fontFamily: MONO }}>서류 {Math.round(rate * 100)}%</span></div>
                    <div className="mt-0.5 inline-flex items-center px-1.5 h-[22px] rounded-md border-[1.5px] border-[#0F1A30] text-[12.5px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{u.carNo || dd?.data?.차량번호 || "-"}</div>
                    <div className="mt-1 text-[12px] font-bold text-[#5B6B85] truncate">{[car, (u.phone && (fmtPhone(u.phone) || u.phone))].filter(Boolean).join(" · ") || "-"}</div>
                  </div>
                </div>
                <div className="px-3 pb-3 mt-auto flex items-center gap-2">
                  {dd ? (
                    <div className="flex-1 min-w-0" data-testid="drv-mgr">
                      {isViewer ? <div className="text-[12px] font-bold text-[#5B6B85] truncate">담당 {mgr?.name || "미지정"}</div> : (
                        <CustomSelect value={mgr?.uid || "__none"} onChange={(e) => assignMgr(u, e.target.value)} className="h-8 w-full px-2 rounded-lg border border-[#DCE3EE] bg-[#F7F9FC] text-[12px] font-bold">
                          <option value="__none">담당자 미지정</option>
                          {staff.map((x) => <option key={x.id} value={x.id}>담당 {x.name || x.email}</option>)}
                          {mgr?.uid && !staff.some((x) => x.id === mgr.uid) && <option value={mgr.uid}>담당 {mgr.name}</option>}
                        </CustomSelect>
                      )}
                    </div>
                  ) : <span className="flex-1 text-[11.5px] font-black text-[#B54708]">기사관리에서 삭제된 기사</span>}
                  {!isViewer && (dd
                    ? <button type="button" disabled={busy === u.id} onClick={() => unapprove(u)} className="h-8 px-2.5 rounded-lg border border-[#FDA29B] text-[11.5px] font-black text-[#B42318] shrink-0">승인 해제</button>
                    : <button type="button" disabled={busy === u.id} onClick={() => cleanupOrphan(u)} className="h-8 px-2.5 rounded-lg bg-[#B42318] text-white text-[11.5px] font-black shrink-0">계정 정리</button>)}
                </div>
              </div>
            );
          })}
        </div>
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
          bizDoc={docsBy?.[openU.id]?.bizReg} company={company} staff={staff} startReject={!!open.reject} onClose={() => setOpen(null)} onDone={onDone} />
      )}
    </div>
  );
}

// ⭐ 2026-11-05 모바일 「기사 앱 계정」 화면 — 가입 승인 / 승인된 기사 탭 상태를 가진 감싸개
export function DriverAccountsPage({ company, isViewer = false, initialTab = "pending" }) {
  const [tab, setTab] = React.useState(initialTab);
  return <DriverAccounts company={company} isViewer={isViewer} tab={tab} onTab={setTab} />;
}
