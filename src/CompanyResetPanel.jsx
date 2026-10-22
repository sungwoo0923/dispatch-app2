// ======================= src/CompanyResetPanel.jsx =======================
// ⭐ 운송사 초기화(최고관리자 전용, 관리자메뉴 > 운영 관리 > 운송사 초기화)
//  1) 초기화 비밀번호를 먼저 설정(서버에 암호화해서 저장 — 화면에서 다시 볼 수 없음)
//  2) 운송사 선택 → [초기화] → 매출관리처럼 비밀번호 입력창 → 맞으면 바로 시작
//     진행 상황은 서버가 resetJobs/{작업ID}에 적고, 화면이 실시간으로 읽어 "몇 %" 로딩창으로 보여준다
//  3) 지운 데이터는 7일 동안 보관함에 남는다 → [복원]하면 초기화 전 상태 그대로 돌아온다(7일 뒤 자동 영구 삭제)
// 실제 삭제·복원은 서버(functions/index.js companyReset)가 한다.
import React from "react";
import { auth, db, FUNCTIONS_BASE } from "./firebase";
import { doc, onSnapshot } from "firebase/firestore";

// 초기화·복원 실행은 60분까지 돌 수 있는 companyResetJob, 나머지(목록·상태)는 companyReset
async function callReset(body, fn = "companyReset") {
  const token = await auth.currentUser?.getIdToken();
  let res;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` },
      body: JSON.stringify(body),
    });
  } catch {
    // 함수가 없거나, 처리 시간이 길어 연결이 끊기면 브라우저는 "Failed to fetch"로만 알려준다
    throw Object.assign(new Error("서버 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요."), { network: true });
  }
  let data = {};
  try { data = await res.json(); } catch { /* 무시 */ }
  if (!res.ok) {
    if (res.status === 404) throw new Error("서버에 초기화 기능이 아직 배포되지 않았습니다. PC에서 firebase deploy --only functions를 실행해 주세요.");
    throw Object.assign(new Error(data.error || `요청 실패 (${res.status})`), { status: res.status });
  }
  return data;
}

const CARD = "bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]";
const Head = ({ eyebrow, title, desc, right }) => (
  <div className="flex items-start gap-3 pb-4 mb-5 border-b border-[#EEF1F6]">
    <div className="flex-1 min-w-0">
      <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">{eyebrow}</div>
      <div className="mt-0.5 text-[18px] font-black text-[#0F1A30] tracking-tight">{title}</div>
      {desc && <div className="text-[13.5px] text-gray-500 mt-1">{desc}</div>}
    </div>
    {right}
  </div>
);
const newJobId = () => `job_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");
const daysLeft = (ms) => Math.max(0, Math.ceil((ms - Date.now()) / 86400000));

// 진행률 창 — 서버가 적는 resetJobs/{jobId}를 실시간으로 본다
// ⭐ 자동 재시도 — 서버가 20초마다 남기는 "작업 중" 신호(heartbeatAt)가 90초 넘게 끊기거나,
//   일시적인 오류로 멈추면 같은 작업ID로 다시 불러 남은 단계부터 이어서 하게 한다(성공할 때까지 계속).
//   비밀번호 틀림처럼 사람이 고쳐야 하는 오류(fatal)만 멈추고 알려준다.
function ProgressModal({ job, onClose, onRetry }) {
  const [state, setState] = React.useState({ pct: 0, step: "시작하는 중…", status: "running" });
  const [elapsed, setElapsed] = React.useState(0);
  const [now, setNow] = React.useState(Date.now());
  const lastRetryRef = React.useRef(Date.now());
  const [retries, setRetries] = React.useState(0);
  React.useEffect(() => {
    const unsub = onSnapshot(doc(db, "resetJobs", job.id), (snap) => { if (snap.exists()) setState((p) => ({ ...p, ...snap.data() })); }, () => {});
    const t0 = Date.now();
    const t = setInterval(() => { setElapsed(Math.floor((Date.now() - t0) / 1000)); setNow(Date.now()); }, 1000);
    return () => { unsub(); clearInterval(t); };
  }, [job.id]);
  const hbMs = state.heartbeatAt?.toMillis ? state.heartbeatAt.toMillis() : 0;
  const silentFor = Math.round((now - Math.max(hbMs, lastRetryRef.current)) / 1000);
  const fatal = state.status === "error" && state.fatal;
  const stalled = !job.result && !job.error && !fatal && state.status !== "done"
    && ((state.status === "running" && silentFor > 90) || (state.status === "error" && !state.fatal && silentFor > 20) || (!hbMs && silentFor > 120));
  React.useEffect(() => {
    if (!stalled) return;
    lastRetryRef.current = Date.now();
    setRetries((n) => n + 1);
    onRetry();
  }, [stalled]); // eslint-disable-line react-hooks/exhaustive-deps
  // 서버 응답(fetch)이 먼저 오면 그 결과로도 마무리한다
  React.useEffect(() => {
    if (job.result) setState((p) => ({ ...p, pct: 100, status: "done", step: "완료", result: job.result }));
    if (job.error) setState((p) => ({ ...p, status: "error", error: job.error }));
  }, [job.result, job.error]);
  const done = state.status === "done";
  const failed = fatal || !!job.error;
  const isRestore = job.action === "restore";
  const r = state.result || {};
  const mm = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  return (
    <div className="fixed inset-0 z-[9999] bg-[#0F1A30]/70 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-[460px] bg-white rounded-[22px] shadow-2xl overflow-hidden">
        <div className={`px-7 py-5 text-white ${failed ? "bg-red-600" : "bg-[#1B2B4B]"}`}>
          <div className="text-[11px] font-extrabold tracking-[0.22em] text-white/60">{isRestore ? "RESTORE" : "RESET"}</div>
          <div className="text-[19px] font-black mt-0.5">{job.company} {isRestore ? "복원" : "초기화"}{done ? " 완료" : failed ? " 실패" : " 진행 중"}</div>
        </div>
        <div className="px-7 py-6">
          <div className="flex items-end justify-between">
            <div className="text-[44px] font-black text-[#0F1A30] tabular-nums leading-none">{failed ? "—" : `${done ? 100 : state.pct || 0}%`}</div>
            <div className="text-[13px] font-semibold text-gray-500 tabular-nums">경과 {mm}</div>
          </div>
          <div className="mt-4 h-3 rounded-full bg-[#EEF1F6] overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${failed ? "bg-red-500" : done ? "bg-emerald-500" : "bg-[#1B2B4B]"}`} style={{ width: `${failed ? 100 : done ? 100 : Math.max(3, state.pct || 0)}%` }} />
          </div>
          <div className={`mt-3 text-[14px] font-semibold ${failed ? "text-red-600" : "text-gray-700"}`}>{failed ? (job.error || state.error) : state.status === "error" ? "일시적인 오류 — 곧 자동으로 이어서 진행합니다" : state.step}</div>
          {!done && !failed && (retries > 0 || (state.attempts || 0) > 1) && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[12.5px] font-bold text-amber-700">
              자동 재시도 {Math.max(retries, (state.attempts || 1) - 1)}회째 · 끝난 단계는 건너뛰고 이어서 진행 중
            </div>
          )}
          {done && (
            <div className="mt-5 rounded-2xl bg-[#F5F8FD] border border-[#E3E8F0] px-5 py-4 text-[14px] text-[#0F1A30] leading-relaxed">
              {isRestore
                ? <>데이터 <b>{(r.restoredDocs || 0).toLocaleString()}건</b>, 첨부파일 <b>{(r.restoredFiles || 0).toLocaleString()}개</b>{r.restoredAccounts ? <>, 계정 <b>{r.restoredAccounts}개</b></> : null}가 초기화 전 상태로 돌아왔습니다.</>
                : <>데이터 <b>{(r.savedDocs || r.deletedDocs || 0).toLocaleString()}건</b>, 첨부파일 <b>{(r.deletedFiles || 0).toLocaleString()}개</b>{r.deletedAccounts ? <>, 계정 <b>{r.deletedAccounts}개(사용 중지)</b></> : null}를 지웠습니다.<br />
                  <span className="text-gray-500 text-[13px]">{fmtTime(r.expiresAt)}까지 보관함에서 복원할 수 있습니다.</span></>}
            </div>
          )}
          {!done && !failed && <div className="mt-4 text-[12.5px] text-gray-500">창을 닫지 말고 기다려 주세요. 데이터가 많으면 몇 분 걸릴 수 있습니다.</div>}
          {(done || failed) && <button onClick={onClose} className="mt-5 w-full py-3.5 rounded-xl bg-[#1B2B4B] text-white text-[15px] font-bold hover:bg-[#243a60]">확인</button>}
        </div>
      </div>
    </div>
  );
}

export default function CompanyResetPanel() {
  const [status, setStatus] = React.useState(null);
  const [companies, setCompanies] = React.useState([]);
  const [loadErr, setLoadErr] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [deleteAccounts, setDeleteAccounts] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [pwForm, setPwForm] = React.useState(null); // { cur, pw1, pw2 }
  const [askPw, setAskPw] = React.useState(null); // { mode: "reset" } | { mode: "restore", backup }
  const [execPw, setExecPw] = React.useState("");
  const [execErr, setExecErr] = React.useState("");
  const [backups, setBackups] = React.useState(null);
  const [keepDays, setKeepDays] = React.useState(7);
  const [job, setJob] = React.useState(null); // 진행률 창

  const load = React.useCallback(async () => {
    setLoadErr("");
    try {
      const [st, co, bk] = await Promise.all([callReset({ action: "status" }), callReset({ action: "companies" }), callReset({ action: "backups" })]);
      setStatus(st);
      setCompanies(co.companies || []);
      setBackups(bk.backups || []);
      if (bk.keepDays) setKeepDays(bk.keepDays);
    } catch (e) { setLoadErr(e.message); }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const savePassword = async () => {
    const f = pwForm || {};
    if ((f.pw1 || "").length < 4) return alert("초기화 비밀번호는 4자 이상으로 정해주세요.");
    if (f.pw1 !== f.pw2) return alert("비밀번호 확인이 일치하지 않습니다.");
    setBusy("pw");
    try {
      await callReset({ action: "setPassword", newPassword: f.pw1, currentPassword: f.cur || "" });
      setPwForm(null);
      await load();
      alert("초기화 비밀번호가 설정되었습니다.");
    } catch (e) { alert(e.message); } finally { setBusy(""); }
  };

  const openPw = (p) => {
    if (!status?.hasPassword) return alert("먼저 초기화 비밀번호를 설정해 주세요.");
    setAskPw(p); setExecPw(""); setExecErr("");
  };

  // 한 번 요청 — 응답이 "busy"(이미 다른 실행이 돌고 있음)면 그냥 진행률만 지켜본다
  const attempt = async (j) => {
    try {
      const r = await callReset(j.body, "companyResetJob");
      if (r.busy) return;
      setJob((cur) => (cur && cur.id === j.id ? { ...cur, result: r } : cur));
    } catch (e) {
      // 연결 끊김·서버 오류(5xx)는 진행률 창이 감지해서 자동으로 다시 부른다. 4xx(비밀번호 틀림 등)만 멈춘다.
      if (!e.network && e.status && e.status < 500) setJob((cur) => (cur && cur.id === j.id ? { ...cur, error: e.message } : cur));
    }
  };
  const run = async () => {
    if (!execPw) return setExecErr("비밀번호를 입력하세요.");
    const restore = askPw.mode === "restore";
    const jobId = newJobId();
    const body = restore
      ? { action: "restore", backupId: askPw.backup.id, password: execPw, jobId }
      : { action: "execute", company, deleteAccounts, password: execPw, jobId };
    const j = { id: jobId, action: restore ? "restore" : "reset", company: restore ? askPw.backup.company : company, body };
    setAskPw(null);
    setJob(j);
    setExecPw("");
    attempt(j);
  };

  const input = "w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-[#1B2B4B]";
  const sel = companies.find((c) => c.name === company);

  return (
    <div className="space-y-6">
      {loadErr && <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-[13.5px] text-amber-800">{loadErr} <button onClick={load} className="ml-2 underline font-bold">다시 시도</button></div>}

      {/* 1. 초기화 비밀번호 */}
      <section className={`${CARD} p-6`}>
        <Head eyebrow="STEP 1" title="초기화 비밀번호"
          desc={status === null ? "확인 중…" : status.hasPassword
            ? `설정됨${status.updatedAt ? ` · ${new Date(status.updatedAt).toLocaleString("ko-KR")}` : ""}${status.updatedBy ? ` · ${status.updatedBy}` : ""}`
            : "아직 설정되지 않았습니다 — 초기화·복원하려면 먼저 비밀번호를 정해주세요."}
          right={status && !pwForm && (
            <button onClick={() => setPwForm({ cur: "", pw1: "", pw2: "" })} className="px-4 py-2 rounded-xl bg-[#1B2B4B] text-white text-[13.5px] font-bold">
              {status.hasPassword ? "비밀번호 변경" : "비밀번호 설정"}
            </button>
          )} />
        {pwForm ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
            {status?.hasPassword && <input type="password" placeholder="현재 초기화 비밀번호" value={pwForm.cur} onChange={(e) => setPwForm({ ...pwForm, cur: e.target.value })} className={input} />}
            <input type="password" placeholder="새 비밀번호 (4자 이상)" value={pwForm.pw1} onChange={(e) => setPwForm({ ...pwForm, pw1: e.target.value })} className={input} />
            <input type="password" placeholder="새 비밀번호 확인" value={pwForm.pw2} onChange={(e) => setPwForm({ ...pwForm, pw2: e.target.value })} className={input} />
            <div className="flex gap-2">
              <button onClick={savePassword} disabled={busy === "pw"} className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-bold disabled:opacity-60">{busy === "pw" ? "저장 중…" : "저장"}</button>
              <button onClick={() => setPwForm(null)} className="px-4 py-2.5 rounded-xl border border-gray-300 text-[14px] font-bold text-gray-600">취소</button>
            </div>
          </div>
        ) : (
          <div className="text-[13.5px] text-gray-600">초기화와 복원을 실행할 때마다 이 비밀번호를 확인합니다. 5번 틀리면 10분간 잠깁니다.</div>
        )}
      </section>

      {/* 2. 운송사 초기화 */}
      <section className={`${CARD} p-6`}>
        <Head eyebrow="STEP 2" title="운송사 초기화" desc={`선택한 운송사가 등록한 모든 데이터를 지웁니다. 지운 데이터는 ${keepDays}일 동안 보관함에 남아 복원할 수 있습니다.`} />
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-4 items-end">
          <div className="space-y-3">
            <label className="block">
              <span className="text-[13px] font-semibold text-gray-600">초기화할 운송사</span>
              <select value={company} onChange={(e) => setCompany(e.target.value)} className="mt-1.5 w-full h-[46px] px-3.5 rounded-xl border border-gray-300 text-[15px] font-semibold outline-none focus:border-[#1B2B4B] bg-white">
                <option value="">운송사 선택</option>
                {companies.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}{c.code ? ` (${c.code})` : ""} · 계정 {c.users}명</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2.5 text-[14px] text-gray-800 font-semibold">
              <input type="checkbox" checked={deleteAccounts} onChange={(e) => setDeleteAccounts(e.target.checked)} className="w-[18px] h-[18px]" />
              직원·기사 로그인 계정까지 삭제
              <span className="font-normal text-[13px] text-gray-500">(체크 안 하면 계정은 남아 다시 로그인해 처음부터 쓸 수 있음)</span>
            </label>
          </div>
          <button onClick={() => openPw({ mode: "reset" })} disabled={!company}
            className="h-[46px] px-8 rounded-xl bg-red-600 text-white text-[15px] font-black hover:bg-red-700 disabled:opacity-40 whitespace-nowrap">
            {company ? `${company} 초기화` : "운송사를 선택하세요"}
          </button>
        </div>
      </section>

      {/* 3. 초기화 보관함 */}
      <section className={`${CARD} overflow-hidden`}>
        <div className="px-6 pt-6">
          <Head eyebrow="BACKUP" title="초기화 보관함" desc={`초기화한 데이터를 ${keepDays}일 동안 보관합니다. [복원]을 누르면 초기화 전 상태 그대로 돌아옵니다.`}
            right={<button onClick={load} className="px-3.5 py-2 rounded-xl border border-gray-300 text-[13px] font-bold text-gray-600 hover:bg-gray-50">새로고침</button>} />
        </div>
        {backups === null ? (
          <div className="text-[14px] text-gray-500 text-center pb-10">불러오는 중…</div>
        ) : backups.length === 0 ? (
          <div className="text-[14px] text-gray-500 text-center pb-10">초기화한 기록이 없습니다.</div>
        ) : (
          <table className="w-full text-[14px]">
            <thead>
              <tr className="bg-[#F5F8FD] text-gray-600 border-y border-[#E3E8F0]">
                {["운송사", "초기화 일시", "실행", "보관 데이터", "상태", ""].map((h) => <th key={h} className="px-4 py-3 text-center font-bold whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF1F6]">
              {backups.map((b) => {
                const live = b.status === "kept" && b.expiresAt > Date.now();
                const left = daysLeft(b.expiresAt);
                return (
                  <tr key={b.id} className="hover:bg-[#FAFBFD]">
                    <td className="px-4 py-3.5 text-center font-bold text-[#0F1A30]">{b.company}</td>
                    <td className="px-4 py-3.5 text-center text-gray-700 whitespace-nowrap">{fmtTime(b.at)}</td>
                    <td className="px-4 py-3.5 text-center text-gray-500">{b.by}</td>
                    <td className="px-4 py-3.5 text-center text-gray-800 whitespace-nowrap">
                      {b.docCount.toLocaleString()}건 · 파일 {b.fileCount.toLocaleString()}개{b.deleteAccounts ? ` · 계정 ${b.accounts}개` : ""}
                    </td>
                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      {b.status === "restored" ? <span className="px-3 py-1 rounded-full text-[12.5px] font-bold bg-emerald-100 text-emerald-700">복원됨 · {fmtTime(b.restoredAt)}</span>
                        : live ? <span className={`px-3 py-1 rounded-full text-[12.5px] font-bold ${left <= 1 ? "bg-red-100 text-red-700" : "bg-[#EEF3FB] text-[#1B2B4B]"}`}>보관 중 · {left <= 1 ? "오늘·내일 삭제" : `D-${left}`}</span>
                          : b.status === "saving" || b.status === "restoring" ? <span className="px-3 py-1 rounded-full text-[12.5px] font-bold bg-amber-100 text-amber-700">처리 중</span>
                            : <span className="px-3 py-1 rounded-full text-[12.5px] font-bold bg-gray-100 text-gray-500">영구 삭제됨</span>}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {live && <button onClick={() => openPw({ mode: "restore", backup: b })} className="px-4 py-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60]">복원</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* 비밀번호 입력창(매출관리 잠금 화면과 같은 방식) — 초기화·복원 공용 */}
      {askPw && (
        <div className="fixed inset-0 z-[9999] bg-[#0F1A30]/60 flex items-center justify-center p-4" onClick={() => setAskPw(null)}>
          <div className="w-full max-w-[400px] bg-white rounded-[22px] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className={`${askPw.mode === "restore" ? "bg-[#1B2B4B]" : "bg-red-600"} px-7 py-5 text-white`}>
              <div className="text-[11px] font-extrabold tracking-[0.22em] text-white/60">{askPw.mode === "restore" ? "RESTORE" : "RESET"}</div>
              <div className="text-[19px] font-black mt-0.5">{askPw.mode === "restore" ? `${askPw.backup.company} 복원` : `${company} 초기화`}</div>
              <div className="text-[13px] text-white/85 mt-1">
                {askPw.mode === "restore"
                  ? `${fmtTime(askPw.backup.at)}에 초기화한 데이터를 되돌립니다`
                  : `비밀번호를 입력하면 바로 시작합니다${deleteAccounts ? " · 계정 포함" : ""}`}
              </div>
            </div>
            <div className="px-7 py-6 space-y-3">
              <input type="password" autoFocus value={execPw} onChange={(e) => setExecPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()}
                placeholder="초기화 비밀번호" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3.5 text-[17px] outline-none text-center tracking-[0.3em] focus:border-[#1B2B4B]" />
              {execErr && <div className="text-[13px] font-semibold text-red-600 text-center">{execErr}</div>}
              <div className="grid grid-cols-2 gap-2.5">
                <button onClick={() => setAskPw(null)} className="py-3 rounded-xl border border-gray-300 text-[14.5px] font-bold text-gray-700">취소</button>
                <button onClick={run} className={`py-3 rounded-xl text-white text-[14.5px] font-bold ${askPw.mode === "restore" ? "bg-[#1B2B4B]" : "bg-red-600"}`}>
                  {askPw.mode === "restore" ? "복원 시작" : "초기화 시작"}
                </button>
              </div>
              {askPw.mode === "reset" && sel && <div className="text-[12.5px] text-gray-500 text-center">{sel.name} · 계정 {sel.users}명</div>}
            </div>
          </div>
        </div>
      )}

      {job && <ProgressModal job={job} onRetry={() => attempt(job)} onClose={() => { setJob(null); load(); }} />}
    </div>
  );
}
