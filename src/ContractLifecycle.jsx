// ======================= src/ContractLifecycle.jsx =======================
// ⭐ 2026-11-06 관리자 관리센터 — 이용 계약(계약 기간 · 만료 안내 · 계약종료 · 재개 · 계약종료+초기화) / 부관리자
//  계약 정보는 companyPlans/{회사}에 둔다(src/companyContract.js 설명 참고).
//   · 계약종료: 데이터는 그대로, 그 회사 직원·기사·화주는 접속 불가(최고관리자·부관리자만 예외) — 다시 [이용 재개]로 풀 수 있다
//   · 계약종료 + 초기화: 접속을 막은 뒤 그 회사 데이터를 모두 지운다(운송사 초기화 작업 재사용, 7일 보관함)
//   · 만료 안내: 서버가 매일 아침 30·7·1일 전에 대표·임원·경리·마스터에게 알림 + 메일(contractExpiryNotices)
import React from "react";
import { arrayUnion, collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { auth, db, FUNCTIONS_BASE } from "./firebase";
import { usePlatformLive, PLAN_NAMES } from "./PlatformLive";
import { CONTRACT_TERMS, addMonthsYmd, contractStateOf, kstToday } from "./companyContract";
import { DangerConfirm, ResetProgressModal, newJobId, callReset } from "./CompanyResetPanel";
import { ROLE_LABELS } from "./customRoles";

const SUPER_EMAIL = "tjddnqkf@naver.com";
const CARD = "bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)] min-w-0";
const INPUT = "w-full h-11 rounded-xl border border-[#DCE3EE] px-3.5 text-[15px] outline-none focus:border-[#1B2B4B] bg-white";
const me = () => auth.currentUser?.email || auth.currentUser?.uid || "";
const STATE_CHIP = {
  active: "bg-[#EEF2F8] text-[#1B2B4B]", soon: "bg-[#2D4C82] text-white", expired: "bg-[#0F1A30] text-white",
  ended: "bg-[#0B1428] text-[#8FB0F0]", none: "bg-[#F1F4F9] text-[#7A879C]",
};
function Head({ code, title, desc, right }) {
  return (
    <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-[#EEF1F6]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" /><span className="text-[12px] font-extrabold tracking-[0.2em] text-[#94A3B8]">{code}</span></div>
        <div className="mt-1 text-[17px] font-black text-[#0F1A30] tracking-tight">{title}</div>
        {desc && <div className="text-[14px] text-[#5B6B85] mt-1 leading-relaxed">{desc}</div>}
      </div>
      {right}
    </div>
  );
}
function Stat({ label, value, foot, dark, on, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`text-left rounded-2xl px-4 py-3.5 border transition ${dark ? "text-white border-[#0F1A30]" : "bg-white border-[#E3E8F0]"} ${on ? "ring-2 ring-[#8FB0F0]" : ""}`}
      style={dark ? { background: "linear-gradient(135deg,#0F1A30,#1B2B4B 60%,#2D4C82)" } : undefined}>
      <div className={`text-[13.5px] font-bold ${dark ? "text-[#CFE0FF]" : "text-[#5B6B85]"}`}>{label}</div>
      <div className={`text-[28px] font-black tabular-nums leading-tight mt-0.5 ${dark ? "text-white" : "text-[#0F1A30]"}`}>{value}</div>
      {foot && <div className={`text-[13px] mt-0.5 ${dark ? "text-white/60" : "text-[#7A879C]"}`}>{foot}</div>}
    </button>
  );
}
async function callFn(name, body) {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(`${FUNCTIONS_BASE}/${name}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` }, body: JSON.stringify(body || {}) }).catch(() => null);
  if (!r) throw new Error("서버 응답을 받지 못했습니다(함수 배포 필요).");
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `오류 ${r.status}`);
  return j;
}

// ═══════════════ 이용 계약 ═══════════════
export function ContractLifecyclePanel({ openCompany }) {
  const live = usePlatformLive();
  const today = kstToday();
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [sel, setSel] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [msg, setMsg] = React.useState("");
  const [ask, setAsk] = React.useState(null); // "end" | "endReset" | "reactivate"
  const [delAcc, setDelAcc] = React.useState(false);
  const [job, setJob] = React.useState(null);
  const [notice, setNotice] = React.useState(null); // 지금 확인 결과
  const [mailCfg, setMailCfg] = React.useState(null);
  const [resetPw, setResetPw] = React.useState(null);

  React.useEffect(() => onSnapshot(doc(db, "siteConfig", "contractNotice"), (s) => setMailCfg(s.exists() ? s.data() : {}), () => setMailCfg({})), []);
  React.useEffect(() => { callReset({ action: "status" }).then((s) => setResetPw(!!s.hasPassword)).catch(() => setResetPw(null)); }, []);

  const rows = React.useMemo(() => {
    const names = new Set([...Object.keys(live?.companies || {}), ...Object.keys(live?.planMap || {})].filter(Boolean));
    return [...names].map((name) => {
      const p = live?.planMap?.[name] || null;
      const c = live?.companies?.[name] || {};
      return { name, p, staff: c.staff || 0, drivers: c.drivers || 0, st: contractStateOf(p, today) };
    }).sort((a, b) => (a.st.dLeft ?? 99999) - (b.st.dLeft ?? 99999) || a.name.localeCompare(b.name, "ko"));
  }, [live, today]);
  const count = (k) => rows.filter((r) => r.st.key === k).length;
  const FILTERS = [["all", "전체"], ["soon", "30일 내 만료"], ["expired", "기간 지남"], ["ended", "계약종료"], ["none", "기간 미설정"], ["active", "이용 중"]];
  const list = rows.filter((r) => (filter === "all" || r.st.key === filter) && (!q.trim() || r.name.includes(q.trim())));
  const cur = sel ? rows.find((r) => r.name === sel) || { name: sel, p: null, st: contractStateOf(null) } : null;

  React.useEffect(() => {
    if (!cur) { setForm(null); return; }
    const p = cur.p || {};
    setForm({ start: p.contractStart || "", term: p.contractTerm ?? 12, end: p.contractEnd || "", billingEmail: p.billingEmail || "", memo: p.contractMemo || "" });
    setMsg("");
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStart = (start) => setForm((f) => ({ ...f, start, end: f.term ? addMonthsYmd(start, f.term) || f.end : f.end }));
  const setTerm = (term) => setForm((f) => ({ ...f, term, end: term && f.start ? addMonthsYmd(f.start, term) : f.end }));
  const save = async () => {
    if (!cur || !form) return;
    if (form.start && form.end && form.end < form.start) return setMsg("종료일이 시작일보다 빠릅니다.");
    try {
      await setDoc(doc(db, "companyPlans", cur.name), {
        contractStart: form.start || null, contractEnd: form.end || null, contractTerm: Number(form.term) || 0,
        billingEmail: String(form.billingEmail || "").trim(), contractMemo: form.memo || "",
        contractUpdatedAt: serverTimestamp(), contractUpdatedBy: me(),
        contractHistory: arrayUnion({ at: Date.now(), by: me(), type: "기간 설정", detail: `${form.start || "-"} ~ ${form.end || "-"}` }),
      }, { merge: true });
      setMsg("저장했습니다.");
    } catch (e) { setMsg(`저장 실패: ${e?.code || e?.message || e}`); }
  };
  const endContract = async () => {
    setAsk(null);
    try {
      await setDoc(doc(db, "companyPlans", cur.name), {
        status: "ended", endedAt: serverTimestamp(), endedAtYmd: today, endedBy: me(), endReason: "계약종료",
        contractHistory: arrayUnion({ at: Date.now(), by: me(), type: "계약종료", detail: "데이터 유지 · 접속 차단" }),
      }, { merge: true });
      setMsg(`${cur.name} 계약을 종료했습니다 — 이 회사 사람은 지금부터 접속할 수 없습니다.`);
    } catch (e) { setMsg(`실패: ${e?.code || e?.message || e}`); }
  };
  const reactivate = async () => {
    setAsk(null);
    try {
      await setDoc(doc(db, "companyPlans", cur.name), {
        status: "active", reactivatedAt: serverTimestamp(), reactivatedBy: me(),
        contractHistory: arrayUnion({ at: Date.now(), by: me(), type: "이용 재개", detail: "" }),
      }, { merge: true });
      setMsg(`${cur.name} 이용을 다시 열었습니다.${cur.st.dLeft != null && cur.st.dLeft < 0 ? " 계약 기간이 지났으니 종료일도 바꿔 주세요." : ""}`);
    } catch (e) { setMsg(`실패: ${e?.code || e?.message || e}`); }
  };
  const startEndReset = ({ password, confirmName }) => {
    const jobId = newJobId();
    setJob({ id: jobId, action: "reset", endContract: true, company: cur.name, body: { action: "execute", company: cur.name, endContract: true, deleteAccounts: delAcc, password, confirmName, jobId } });
    setAsk(null);
  };
  const runNotice = async (dryRun) => {
    setNotice({ loading: true, dryRun });
    try { setNotice({ ...(await callFn("contractNoticeRun", { dryRun })), dryRun }); }
    catch (e) { setNotice({ error: e.message, dryRun }); }
  };
  const saveMailCfg = (patch) => setDoc(doc(db, "siteConfig", "contractNotice"), { ...patch, updatedAt: serverTimestamp(), updatedBy: me() }, { merge: true }).catch((e) => setMsg(`메일 설정 저장 실패: ${e?.code || e}`));
  const upcoming = rows.filter((r) => ["soon", "expired"].includes(r.st.key));
  const sentKeys = (p) => Object.entries(p?.contractNotices || {}).filter(([k]) => k.startsWith(`${p?.contractEnd}_`)).map(([k, v]) => ({ t: k.split("_")[1], ...v }));

  return (
    <div className="space-y-4" data-contract-panel="1">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <Stat dark label="30일 내 만료" value={count("soon")} foot="30·7·1일 전 자동 안내" on={filter === "soon"} onClick={() => setFilter("soon")} />
        <Stat label="기간 지남" value={count("expired")} foot="연장 또는 계약종료 필요" on={filter === "expired"} onClick={() => setFilter("expired")} />
        <Stat label="계약종료" value={count("ended")} foot="접속 차단 중" on={filter === "ended"} onClick={() => setFilter("ended")} />
        <Stat label="이용 중" value={count("active")} on={filter === "active"} onClick={() => setFilter("active")} />
        <Stat label="기간 미설정" value={count("none")} on={filter === "none"} onClick={() => setFilter("none")} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)] items-start">
        <section className={CARD}>
          <Head code="CONTRACTS · CARRIERS" title={`운송사 이용 계약 ${list.length}곳`} desc="회사를 누르면 오른쪽에서 기간을 정하고, 계약종료·재개를 합니다."
            right={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="회사명 검색" className="h-10 w-[180px] rounded-xl border border-[#DCE3EE] px-3 text-[14.5px] outline-none focus:border-[#1B2B4B]" />} />
          <div className="px-5 pt-3 flex gap-1.5 flex-wrap">
            {FILTERS.map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} className={`h-9 px-3.5 rounded-full border text-[14px] font-bold ${filter === k ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`}>{l}</button>)}
          </div>
          <div className="p-3 overflow-x-auto">
            <table className="w-full text-[14.5px] min-w-[640px]">
              <thead><tr className="text-[13.5px] text-[#5B6B85]">{["운송사", "요금제", "계약 기간", "남은 기간", "상태", "만료 안내"].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {list.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-[#7A879C]">해당하는 운송사가 없습니다</td></tr>}
                {list.map((r) => {
                  const on = r.name === sel;
                  const sent = sentKeys(r.p);
                  return (
                    <tr key={r.name} onClick={() => setSel(r.name)} data-contract-row={r.name} className={`cursor-pointer border-t border-[#EEF1F6] ${on ? "bg-[#EEF3FB]" : "hover:bg-[#F7F9FC]"}`}>
                      <td className="px-3 py-3"><div className="font-black text-[#0F1A30]">{r.name}</div><div className="text-[13px] text-[#7A879C]">직원 {r.staff} · 기사 {r.drivers}</div></td>
                      <td className="px-3 py-3 whitespace-nowrap text-[#1B2B4B] font-bold">{r.p?.planId ? (PLAN_NAMES?.[r.p.planId] || r.p.planId) : "-"}</td>
                      <td className="px-3 py-3 whitespace-nowrap tabular-nums">{r.p?.contractStart || r.p?.contractEnd ? `${r.p.contractStart || "?"} ~ ${r.p.contractEnd || "?"}` : <span className="text-[#94A3B8]">미설정</span>}</td>
                      <td className="px-3 py-3 whitespace-nowrap tabular-nums font-bold text-[#0F1A30]">{r.st.dLeft == null ? "-" : r.st.dLeft >= 0 ? `${r.st.dLeft}일` : `${-r.st.dLeft}일 지남`}</td>
                      <td className="px-3 py-3"><span className={`px-2.5 h-7 inline-flex items-center rounded-full text-[13px] font-black whitespace-nowrap ${STATE_CHIP[r.st.key]}`}>{r.st.label}</span></td>
                      <td className="px-3 py-3 whitespace-nowrap text-[13.5px] text-[#5B6B85]">{sent.length ? sent.map((x) => `D-${x.t}${x.status === "mail-failed" ? "(메일 실패)" : ""}`).join(" · ") : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-4">
          <section className={CARD}>
            {!cur || !form ? (
              <div className="p-8 text-center text-[14.5px] text-[#7A879C]">왼쪽 목록에서 운송사를 고르세요</div>
            ) : (
              <>
                <div className="px-5 py-4 text-white rounded-t-[18px]" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
                  <div className="text-[12px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">CONTRACT</div>
                  <div className="flex items-center gap-2 mt-0.5"><div className="text-[20px] font-black truncate">{cur.name}</div>
                    <span className={`px-2.5 h-7 inline-flex items-center rounded-full text-[13px] font-black ${cur.st.key === "ended" ? "bg-white text-[#0B1428]" : "bg-white/15 text-white"}`}>{cur.st.label}</span></div>
                  {openCompany && <button type="button" onClick={() => openCompany(cur.name)} className="mt-1 text-[13.5px] font-bold text-[#CFE0FF] hover:text-white">운송사 관제에서 보기 ›</button>}
                </div>
                <div className="p-5 space-y-3.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="block"><span className="text-[13.5px] font-bold text-[#3A4A66]">계약 시작일</span>
                      <input type="date" value={form.start} onChange={(e) => setStart(e.target.value)} className={`${INPUT} mt-1`} data-contract-start /></label>
                    <label className="block"><span className="text-[13.5px] font-bold text-[#3A4A66]">계약 기간</span>
                      <select value={form.term} onChange={(e) => setTerm(Number(e.target.value))} className={`${INPUT} mt-1`} data-contract-term>
                        {CONTRACT_TERMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select></label>
                  </div>
                  <label className="block"><span className="text-[13.5px] font-bold text-[#3A4A66]">계약 종료일 {form.term ? <span className="font-medium text-[#7A879C]">(시작일 + 기간으로 자동 — 바꿔도 됩니다)</span> : null}</span>
                    <input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className={`${INPUT} mt-1`} data-contract-end /></label>
                  <label className="block"><span className="text-[13.5px] font-bold text-[#3A4A66]">청구·안내 메일 <span className="font-medium text-[#7A879C]">(만료 안내를 함께 받을 회사 메일)</span></span>
                    <input value={form.billingEmail} onChange={(e) => setForm({ ...form, billingEmail: e.target.value })} placeholder="billing@회사.co.kr" className={`${INPUT} mt-1`} /></label>
                  <label className="block"><span className="text-[13.5px] font-bold text-[#3A4A66]">메모</span>
                    <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="예: 2년 약정 · 자동 연장 아님" className={`${INPUT} mt-1`} /></label>
                  <button type="button" onClick={save} className="w-full h-11 rounded-xl bg-[#1B2B4B] text-white text-[15px] font-black" data-contract-save>기간 저장</button>
                  {msg && <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3.5 py-2.5 text-[14px] font-bold text-[#1B2B4B]" data-contract-msg>{msg}</div>}
                  {(() => { const s = sentKeys(cur.p); return s.length ? <div className="text-[13.5px] text-[#5B6B85]">보낸 만료 안내: {s.map((x) => `D-${x.t} (알림 ${x.users ?? "-"}명 · 메일 ${x.mails ?? "-"}곳${x.status === "mail-failed" ? ` · 메일 실패: ${x.mailError || ""}` : ""})`).join(" / ")}</div> : null; })()}
                </div>
                <div className="px-5 pb-5">
                  <div className="rounded-2xl border border-[#DCE3EE] overflow-hidden">
                    <div className="px-4 py-2.5 bg-[#F7F9FC] border-b border-[#E3E8F0] text-[13.5px] font-extrabold tracking-[0.12em] text-[#5B6B85]">이용 상태 변경</div>
                    {cur.st.key === "ended" ? (
                      <div className="p-4 space-y-2.5">
                        <div className="text-[14px] text-[#3A4A66] leading-relaxed">지금 이 회사 사람은 접속할 수 없습니다({cur.p?.endedAtYmd || "-"} · {cur.p?.endedBy || ""}). 다시 열면 바로 로그인해 쓸 수 있습니다.</div>
                        <button type="button" onClick={() => setAsk("reactivate")} className="w-full h-11 rounded-xl border-2 border-[#1B2B4B] text-[#1B2B4B] text-[15px] font-black" data-contract-reactivate>이용 재개</button>
                      </div>
                    ) : (
                      <div className="p-4 space-y-2.5">
                        <button type="button" onClick={() => setAsk("end")} className="w-full h-11 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black" data-contract-end-btn>계약종료 (데이터 유지 · 접속 차단)</button>
                        <div className="text-[13.5px] text-[#5B6B85] leading-relaxed">직원·기사·화주 모두 PC·모바일·기사앱·화주앱에서 "계약이 종료되었습니다" 화면만 봅니다. 최고관리자·부관리자는 그대로 들어갈 수 있습니다.</div>
                      </div>
                    )}
                    <div className="p-4 border-t border-[#EEF1F6] space-y-2.5">
                      <button type="button" onClick={() => (resetPw === false ? alert("먼저 보안·데이터 › 운송사 초기화에서 초기화 비밀번호를 설정해 주세요.") : setAsk("endReset"))} className="w-full h-11 rounded-xl border-2 border-[#0B1428] text-[#0B1428] text-[15px] font-black" data-contract-endreset>계약종료 + 초기화 (데이터 삭제)</button>
                      <div className="text-[13.5px] text-[#5B6B85] leading-relaxed">접속을 먼저 막은 뒤 이 회사 데이터를 모두 지웁니다. 7일 동안은 보관함에서 복원할 수 있습니다.</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>

          <section className={CARD}>
            <Head code="NOTICE" title="만료 안내" desc="매일 오전 9시 12분(한국 시간) 서버가 30·7·1일 전 회사에 알림(대표·임원·경리·마스터)과 메일을 보냅니다. 같은 안내는 한 번만."
              right={<div className="flex gap-1.5 shrink-0"><button type="button" onClick={() => runNotice(true)} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[14px] font-bold text-[#1B2B4B]">미리 확인</button><button type="button" onClick={() => window.confirm("지금 보낼 차례인 안내를 바로 보낼까요?") && runNotice(false)} className="h-9 px-3 rounded-lg bg-[#1B2B4B] text-white text-[14px] font-bold">지금 보내기</button></div>} />
            <div className="p-5 space-y-3">
              {upcoming.length === 0 ? <div className="text-[14px] text-[#7A879C]">30일 안에 끝나는 계약이 없습니다.</div> : (
                <div className="space-y-1.5">{upcoming.slice(0, 8).map((r) => (
                  <button key={r.name} type="button" onClick={() => setSel(r.name)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-[#EEF1F6] hover:bg-[#F7F9FC] text-left">
                    <span className={`px-2 h-6 inline-flex items-center rounded-full text-[12.5px] font-black ${STATE_CHIP[r.st.key]}`}>{r.st.label}</span>
                    <span className="flex-1 min-w-0 truncate text-[14.5px] font-bold text-[#0F1A30]">{r.name}</span>
                    <span className="text-[13.5px] tabular-nums text-[#5B6B85]">~{r.p?.contractEnd}</span>
                  </button>))}</div>
              )}
              {notice && (
                <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3.5 py-3 text-[14px] text-[#1B2B4B]" data-notice-result>
                  {notice.loading ? "확인 중…" : notice.error ? notice.error : (notice.results || []).length === 0 ? `${notice.today} — 오늘 보낼 안내가 없습니다.` : (
                    <ul className="space-y-1">{notice.results.map((x) => <li key={x.company}><b>{x.company}</b> D-{x.dLeft} ({x.threshold}일 전 안내) · {x.skipped || (x.dryRun ? `받을 사람 ${x.users}명 · 메일 ${(x.mails || []).length}곳` : `알림 ${x.users}명 · 메일 ${x.mails}곳${x.mail?.ok === false ? ` · 메일 실패(${x.mail.error})` : ""}`)}</li>)}</ul>
                  )}
                </div>
              )}
              <div className="rounded-xl border border-[#EEF1F6] px-3.5 py-3 space-y-2">
                <label className="flex items-center gap-2 text-[14px] font-bold text-[#1B2B4B]">
                  <input type="checkbox" checked={mailCfg?.mailEnabled !== false} onChange={(e) => saveMailCfg({ mailEnabled: e.target.checked })} className="w-[18px] h-[18px] accent-[#1B2B4B]" /> 만료 안내 메일 보내기
                </label>
                <label className="block"><span className="text-[13.5px] font-bold text-[#5B6B85]">메일 발송 주소(배차 프로그램 /api/send-email)</span>
                  <input defaultValue={mailCfg?.sendEmailUrl || ""} key={mailCfg?.sendEmailUrl || "x"} onBlur={(e) => e.target.value.trim() !== (mailCfg?.sendEmailUrl || "") && saveMailCfg({ sendEmailUrl: e.target.value.trim() })} placeholder="https://(배차 프로그램 주소)/api/send-email" className={`${INPUT} mt-1`} /></label>
              </div>
            </div>
          </section>
        </div>
      </div>

      {ask === "end" && cur && (
        <DangerConfirm en="CONTRACT END" title={`${cur.name} 계약종료`} company={cur.name} needPassword={false} actionLabel="계약종료" onCancel={() => setAsk(null)} onRun={endContract}
          lines={["데이터는 그대로 둡니다.", "이 회사 직원·기사·화주는 PC·모바일·기사앱·화주앱 모두 접속할 수 없습니다.", "최고관리자·부관리자만 들어갈 수 있고, [이용 재개]로 다시 열 수 있습니다."]} />
      )}
      {ask === "reactivate" && cur && (
        <DangerConfirm en="REACTIVATE" title={`${cur.name} 이용 재개`} company={cur.name} needPassword={false} actionLabel="이용 재개" onCancel={() => setAsk(null)} onRun={reactivate}
          lines={["이 회사 사람들이 다시 로그인해 쓸 수 있게 됩니다."]} />
      )}
      {ask === "endReset" && cur && (
        <DangerConfirm en="CONTRACT END · RESET" title={`${cur.name} 계약종료 + 초기화`} company={cur.name} actionLabel="계약종료하고 데이터 삭제" onCancel={() => setAsk(null)} onRun={startEndReset}
          lines={["먼저 계약종료로 접속을 막습니다.", `그다음 ${cur.name}의 오더·거래처·기사·설정·첨부파일을 모두 지웁니다.`, "7일 동안 보관함(보안·데이터 › 운송사 초기화)에서 복원할 수 있습니다."]}>
          <label className="flex items-start gap-2.5 text-[14.5px] text-[#1B2B4B] font-bold cursor-pointer">
            <input type="checkbox" checked={delAcc} onChange={(e) => setDelAcc(e.target.checked)} className="mt-0.5 w-[18px] h-[18px] accent-[#1B2B4B]" />
            <span>로그인 계정까지 삭제<span className="block font-medium text-[13.5px] text-[#5B6B85]">체크 안 하면 계정은 남아 로그인 시 "계약이 종료되었습니다" 화면을 봅니다</span></span>
          </label>
        </DangerConfirm>
      )}
      {job && <ResetProgressModal job={job} onClose={() => setJob(null)} />}
    </div>
  );
}

// ═══════════════ 부관리자 ═══════════════
//  부관리자 = role "totalMaster" + subAdmin:true(최고관리자와 같은 권한). 1명만, 최고관리자 본 계정만 지정·해제.
//  (배차 프로그램 관리자메뉴 › 회원 관리 › 직원 › 정보 수정에서도 같은 기능)
export function SubAdminPanel() {
  const live = usePlatformLive();
  const [subs, setSubs] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const isSuper = auth.currentUser?.email === SUPER_EMAIL;
  React.useEffect(() => onSnapshot(query(collection(db, "users"), where("subAdmin", "==", true)), (s) => setSubs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setSubs([])), []);
  const candidates = React.useMemo(() => {
    const k = q.trim();
    if (!k) return [];
    const out = [];
    Object.values(live?.companies || {}).forEach((c) => (c.staffList || []).forEach((u) => {
      if (!u.approved) return;
      if ((u.name || "").includes(k) || (u.email || "").includes(k) || c.name.includes(k)) out.push({ ...u, company: c.name });
    }));
    return out.slice(0, 30);
  }, [live, q]);
  const active = (subs || []).filter((u) => u.role === "totalMaster");
  const assign = async (u) => {
    if (!isSuper) return alert("부관리자는 최고관리자 본 계정만 지정할 수 있습니다.");
    if (active.length) return alert(`부관리자는 1명만 둘 수 있습니다.\n먼저 「${active[0].name || active[0].email}」님을 해제해 주세요.`);
    if (!window.confirm(`"${u.name || u.email}"(${u.company})님을 부관리자로 지정할까요?\n최고관리자와 같은 권한(모든 운송사·관리센터·요금·삭제)을 갖습니다.`)) return;
    setBusy(u.uid); setMsg("");
    try {
      await setDoc(doc(db, "users", u.uid), { subAdmin: true, subAdminPrevRole: u.role || "admin", role: "totalMaster", approved: true,
        personnelHistory: arrayUnion({ date: kstToday(), type: "부관리자 지정", detail: `관리센터 · ${auth.currentUser?.email || ""}` }) }, { merge: true });
      setMsg(`${u.name || u.email}님을 부관리자로 지정했습니다.`); setQ("");
    } catch (e) { setMsg(`실패: ${e?.code || e?.message || e}`); } finally { setBusy(""); }
  };
  const unassign = async (u) => {
    if (!isSuper) return alert("부관리자는 최고관리자 본 계정만 해제할 수 있습니다.");
    const back = u.subAdminPrevRole && u.subAdminPrevRole !== "totalMaster" ? u.subAdminPrevRole : "admin";
    if (!window.confirm(`"${u.name || u.email}"님의 부관리자를 해제할까요?\n예전 권한(${ROLE_LABELS[back] || back})으로 돌아갑니다.`)) return;
    setBusy(u.id); setMsg("");
    try {
      await setDoc(doc(db, "users", u.id), { subAdmin: false, role: back,
        personnelHistory: arrayUnion({ date: kstToday(), type: "부관리자 해제", detail: `관리센터 · ${auth.currentUser?.email || ""}` }) }, { merge: true });
      setMsg(`${u.name || u.email}님의 부관리자를 해제했습니다.`);
    } catch (e) { setMsg(`실패: ${e?.code || e?.message || e}`); } finally { setBusy(""); }
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start" data-subadmin-panel="1">
      <section className={CARD}>
        <Head code="SUB ADMIN" title="현재 부관리자" desc="부관리자는 최고관리자와 같은 권한으로 모든 운송사·관리센터를 씁니다(1명). 지정·해제는 최고관리자 본 계정만 할 수 있습니다." />
        <div className="p-5 space-y-2.5">
          {subs === null ? <div className="text-[14px] text-[#7A879C]">불러오는 중…</div> : active.length === 0 ? <div className="text-[14.5px] text-[#7A879C]">지정된 부관리자가 없습니다.</div> : active.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-2xl border border-[#E3E8F0] px-4 py-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[15px] font-black" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}>{String(u.name || u.email || "?").slice(0, 1)}</div>
              <div className="flex-1 min-w-0"><div className="text-[15.5px] font-black text-[#0F1A30] truncate">{u.name || "-"} <span className="ml-1 px-2 py-0.5 rounded-full bg-[#8FB0F0] text-[#0B1428] text-[12px] font-black">부관리자</span></div>
                <div className="text-[13.5px] text-[#5B6B85] truncate">{u.email} · {u.companyName || "-"} · 예전 권한 {ROLE_LABELS[u.subAdminPrevRole] || u.subAdminPrevRole || "-"}</div></div>
              {isSuper && <button type="button" disabled={busy === u.id} onClick={() => unassign(u)} className="shrink-0 h-9 px-3.5 rounded-lg border border-[#0F1A30] text-[#0F1A30] text-[14px] font-black disabled:opacity-50">해제</button>}
            </div>
          ))}
          {(subs || []).filter((u) => u.role !== "totalMaster").length > 0 && <div className="text-[13.5px] text-[#7A879C]">표시만 남은 기록 {(subs || []).filter((u) => u.role !== "totalMaster").length}건(권한은 최고관리자가 아님)</div>}
          {msg && <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3.5 py-2.5 text-[14px] font-bold text-[#1B2B4B]">{msg}</div>}
          <div className="text-[13.5px] text-[#5B6B85] leading-relaxed pt-1">배차 프로그램 › 관리자메뉴 › 회원 관리 › 직원 › 정보 수정 › <b>부관리자 지정</b>에서도 같은 일을 할 수 있습니다.</div>
        </div>
      </section>
      <section className={CARD}>
        <Head code="ASSIGN" title="부관리자 지정" desc="이름·이메일·회사명으로 직원을 찾아 지정합니다(승인된 직원만)." />
        <div className="p-5">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·이메일·회사명" className={INPUT} disabled={!isSuper} />
          {!isSuper && <div className="mt-2 text-[14px] text-[#5B6B85]">최고관리자 본 계정으로 로그인해야 지정할 수 있습니다.</div>}
          <div className="mt-3 divide-y divide-[#EEF1F6] rounded-xl border border-[#EEF1F6]">
            {q.trim() && candidates.length === 0 && <div className="py-8 text-center text-[14px] text-[#7A879C]">맞는 직원이 없습니다</div>}
            {candidates.map((u) => (
              <div key={u.uid} className="flex items-center gap-3 px-3.5 py-2.5">
                <div className="flex-1 min-w-0"><div className="text-[15px] font-bold text-[#0F1A30] truncate">{u.name} <span className="text-[13.5px] font-medium text-[#7A879C]">{ROLE_LABELS[u.role] || u.role}{u.position ? ` · ${u.position}` : ""}</span></div>
                  <div className="text-[13.5px] text-[#5B6B85] truncate">{u.email} · {u.company}</div></div>
                <button type="button" disabled={busy === u.uid || !isSuper} onClick={() => assign(u)} className="shrink-0 h-9 px-3.5 rounded-lg bg-[#2D4C82] text-white text-[14px] font-black disabled:opacity-40">지정</button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
