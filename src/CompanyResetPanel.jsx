// ======================= src/CompanyResetPanel.jsx =======================
// ⭐ 2026-11-06 운송사 초기화 — 관리자 관리센터(보안·데이터 › 운송사 초기화) 전용으로 옮기고 화면을 새로 정리했다.
//  (배차 프로그램 관리자메뉴의 "운송사 초기화" 탭은 없앴다 — PC·모바일 모두)
//  ① 운송사 고르기(검색) → ② 미리 세어 보기(지울 문서 수) → ③ 회사명 직접 입력 + 초기화 비밀번호 → 실행
//  진행 상황은 서버가 resetJobs/{작업ID}에 적고, 이 화면이 실시간으로 읽는다.
//  ⭐ 이어하기: 서버는 단계(찾기 → 보관 → 삭제)·묶음 번호를 보관함 문서에 적어 두고, 한 번 실행에 45분까지만 일한 뒤
//   {partial:true}로 돌려준다 → 화면이 바로 다시 불러 남은 묶음부터 이어서 한다. 실패하면 "어느 단계"에서 실패했는지 보여 준다.
//  지운 데이터는 7일 동안 보관함에 남는다 → [복원]하면 초기화 전 상태 그대로 돌아온다(7일 뒤 자동 영구 삭제)
//  실제 삭제·복원은 서버(functions/index.js companyResetHandler)가 한다.
//  ⭐ 2026-11-07 보관함 [지금 영구 삭제] · [보관함 모두 비우기] · [이력 지우기]: 서버 companyResetPurge(functions/resetPurge.js)
//   확인: 회사명(모두면 "영구삭제") 입력 + 초기화 비밀번호. 서버가 8분씩 일하고 {partial:true}면 화면이 바로 이어서 부른다.
//  ⭐ 2026-11-07 보관 단계 멈춤(돌캐 57%) 수정 — 서버 엔진은 functions/resetJob.js
//   - 회사당 작업 하나: 같은 회사의 끝나지 않은 작업이 있으면 서버가 {redirect}로 그 작업ID를 돌려줌 → 진행 창이 그 작업을 이어서 지켜봄
//   - 보관함의 끝나지 않은 작업: "처리 중"(지금 돌고 있음) / "멈춤 · n분째 신호 없음" + [이어서 진행] · [취소하고 정리](삭제 시작 전만)
//   - 진행 창: 서버 신호가 90초 넘게 없으면 "잠시 멈춰서 다시 이어가고 있어요" + 자동으로 다시 부름
import React from "react";
import { auth, db, FUNCTIONS_BASE } from "./firebase";
import { doc, onSnapshot } from "firebase/firestore";

// 초기화·복원 실행은 60분까지 돌 수 있는 companyResetJob, 나머지(목록·상태)는 companyReset
export async function callReset(body, fn = "companyReset") {
  const token = await auth.currentUser?.getIdToken();
  let res;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error("서버 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요."), { network: true });
  }
  let data = {};
  try { data = await res.json(); } catch { /* 무시 */ }
  if (!res.ok) {
    if (res.status === 404) throw new Error("서버에 초기화 기능이 아직 배포되지 않았습니다. PC에서 firebase deploy --only functions를 실행해 주세요.");
    throw Object.assign(new Error(data.error || `요청 실패 (${res.status})`), { status: res.status, step: data.step || "" });
  }
  return data;
}

const CARD = "bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)]";
export const newJobId = () => `job_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");
const daysLeft = (ms) => Math.max(0, Math.ceil((ms - Date.now()) / 86400000));
const MAX_AUTO_RETRY = 8; // 같은 오류가 이만큼 이어지면 자동 재시도를 멈추고 알려 준다

function CardHead({ code, title, desc, right }) {
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

// ─── 진행률 창(초기화·복원·계약종료+초기화 공용) ───
//  job = { id, action: "reset"|"restore", company, body, endContract }
//  서버가 {partial:true}면 바로 다시 부르고, 신호(heartbeatAt)가 90초 넘게 끊기면 자동으로 이어서 부른다.
//  ⭐ 2026-11-07 서버는 일이 실제로 진행될 때만 신호를 남긴다(멈춘 실행은 신호가 끊김 → 이 창이 다시 부르면 서버가 이어받음).
//   {redirect}: 같은 회사의 끝나지 않은 작업이 이미 있어 그 작업을 이어서 한다 → 그 작업ID로 바꿔서 지켜본다.
export function ResetProgressModal({ job, onClose }) {
  const [jid, setJid] = React.useState(job.id);
  const bodyRef = React.useRef({ ...job.body });
  const [state, setState] = React.useState({ pct: 0, step: "시작하는 중…", status: "running" });
  const [result, setResult] = React.useState(null);
  const [hardError, setHardError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [elapsed, setElapsed] = React.useState(0);
  const [now, setNow] = React.useState(Date.now());
  const [calls, setCalls] = React.useState(0);
  const [revived, setRevived] = React.useState(0); // 신호가 끊겨 다시 부른 횟수
  const lastCallRef = React.useRef(Date.now());
  const inFlight = React.useRef(false);
  const deadRef = React.useRef(false);

  const attempt = React.useCallback(async () => {
    if (inFlight.current || deadRef.current) return;
    inFlight.current = true;
    lastCallRef.current = Date.now();
    setCalls((n) => n + 1);
    try {
      const r = await callReset(bodyRef.current, "companyResetJob");
      if (deadRef.current) return;
      if (r.partial) { inFlight.current = false; setTimeout(attempt, 1500); return; } // 한 번 실행 시간을 다 씀 → 바로 이어서
      if (r.redirect && r.redirect !== bodyRef.current.jobId) {
        bodyRef.current = { ...bodyRef.current, jobId: r.redirect, ...(r.deleteAccounts !== undefined ? { deleteAccounts: r.deleteAccounts } : {}), ...(r.endContract ? { endContract: true, confirmName: bodyRef.current.company } : {}) };
        setNotice("이 운송사의 끝나지 않은 초기화가 있어 새로 만들지 않고 그 작업을 이어서 진행해요.");
        setState({ pct: 0, step: "이어서 진행하는 중…", status: "running" });
        inFlight.current = false;
        setJid(r.redirect); // 아래 effect가 새 작업을 지켜보고 다시 부른다
        return;
      }
      if (r.cancelled) { setHardError("취소된 작업입니다. 보관함에서 정리 상태를 확인해 주세요."); return; }
      if (!r.busy) setResult(r);
    } catch (e) {
      // 4xx(비밀번호 틀림·확인 이름 불일치 등)는 사람이 고쳐야 하므로 멈춘다. 연결 끊김·5xx는 아래 감시가 다시 부른다.
      if (!e.network && e.status && e.status < 500) setHardError(e.message);
    } finally { inFlight.current = false; }
  }, []);

  React.useEffect(() => {
    deadRef.current = false;
    const unsub = onSnapshot(doc(db, "resetJobs", jid), (snap) => { if (snap.exists()) setState((p) => ({ ...p, ...snap.data() })); }, () => {});
    attempt();
    return () => { unsub(); };
  }, [jid]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const t0 = Date.now();
    const t = setInterval(() => { setElapsed(Math.floor((Date.now() - t0) / 1000)); setNow(Date.now()); }, 1000);
    return () => { deadRef.current = true; clearInterval(t); };
  }, []);

  const hbMs = Math.max(state.heartbeatAt?.toMillis ? state.heartbeatAt.toMillis() : 0, state.updatedAt?.toMillis ? state.updatedAt.toMillis() : 0);
  const silentFor = Math.round((now - Math.max(hbMs, lastCallRef.current)) / 1000);
  const done = !!result || state.status === "done";
  const tooMany = state.status === "error" && (state.errorCount || 0) >= MAX_AUTO_RETRY;
  const fatal = !!hardError || (state.status === "error" && state.fatal) || tooMany || state.status === "cancelled";
  const quiet = state.status === "running" && silentFor > 90; // 서버 신호가 끊김(멈춘 실행) → 다시 불러 이어받게
  const stalled = !done && !fatal && !inFlight.current && (
    quiet || (state.status === "error" && silentFor > 20) || (state.status === "paused" && silentFor > 30) || (!hbMs && silentFor > 150));
  React.useEffect(() => { if (stalled) { if (quiet) setRevived((n) => n + 1); attempt(); } }, [stalled, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  const reviving = !done && !fatal && (quiet || (revived > 0 && silentFor > 60));

  const r = result || state.result || {};
  const isRestore = job.action === "restore";
  const mm = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const title = isRestore ? "복원" : job.endContract ? "계약종료 + 초기화" : "초기화";
  const pct = done ? 100 : state.pct || 0;
  return (
    <div className="fixed inset-0 z-[99999] bg-[#0B1428]/70 backdrop-blur-[2px] flex items-center justify-center p-4" data-reset-progress="1">
      <div className="w-full max-w-[480px] bg-white rounded-[22px] shadow-2xl overflow-hidden">
        <div className="px-7 py-5 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
          <div className="text-[12px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">{isRestore ? "RESTORE" : "RESET"} · {jid.slice(-6)}</div>
          <div className="text-[20px] font-black mt-0.5">{job.company} {title}{done ? " 완료" : fatal ? " 멈춤" : " 진행 중"}</div>
        </div>
        <div className="px-7 py-6">
          <div className="flex items-end justify-between">
            <div className="text-[44px] font-black text-[#0F1A30] tabular-nums leading-none">{pct}%</div>
            <div className="text-[14px] font-semibold text-[#5B6B85] tabular-nums">경과 {mm}{calls > 1 ? ` · 호출 ${calls}회` : ""}</div>
          </div>
          <div className="mt-4 h-3 rounded-full bg-[#EEF1F6] overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${done ? "bg-[#2D4C82]" : fatal ? "bg-[#94A3B8]" : "bg-[#1B2B4B]"}`} style={{ width: `${Math.max(3, pct)}%` }} />
          </div>
          <div className="mt-3 text-[15px] font-bold text-[#1B2B4B]">
            {fatal ? (state.status === "cancelled" ? "취소된 작업입니다" : "자동 진행을 멈췄습니다") : reviving ? "잠시 멈춰서 다시 이어가고 있어요" : state.status === "error" ? "일시적인 오류 — 곧 자동으로 이어서 진행합니다" : state.status === "paused" ? "한 번 실행 시간을 다 써서 이어서 진행합니다…" : state.step}
          </div>
          {reviving && <div className="mt-1 text-[13.5px] text-[#5B6B85]">서버 신호가 {silentFor}초째 없어요. 멈춘 실행의 차례가 끝나면(최대 몇 분) 끝난 묶음은 건너뛰고 이어서 합니다.{state.step ? ` 마지막: ${state.step}` : ""}</div>}
          {notice && <div className="mt-2 rounded-xl border border-[#DCE3EE] bg-[#F5F8FD] px-4 py-2.5 text-[13.5px] text-[#1B2B4B]">{notice}</div>}
          {(state.status === "error" || hardError) && (
            <div className="mt-3 rounded-xl border border-[#DCE3EE] bg-[#F5F8FD] px-4 py-3 text-[14px] leading-relaxed text-[#1B2B4B]">
              {state.failedStep && <div><span className="font-black">실패한 단계</span> · {state.failedStep}</div>}
              <div className="text-[#5B6B85] break-all">{hardError || state.error}</div>
              {!fatal && <div className="mt-1 text-[13.5px] text-[#5B6B85]">끝난 단계는 건너뛰고 실패한 묶음부터 다시 합니다 ({state.errorCount || 1}/{MAX_AUTO_RETRY})</div>}
            </div>
          )}
          {done && (
            <div className="mt-5 rounded-2xl bg-[#F5F8FD] border border-[#E3E8F0] px-5 py-4 text-[15px] text-[#0F1A30] leading-relaxed">
              {isRestore
                ? <>데이터 <b>{(r.restoredDocs || 0).toLocaleString()}건</b>, 첨부파일 <b>{(r.restoredFiles || 0).toLocaleString()}개</b>{r.restoredAccounts ? <>, 계정 <b>{r.restoredAccounts}개</b></> : null}가 초기화 전 상태로 돌아왔습니다.</>
                : <>데이터 <b>{(r.savedDocs || r.deletedDocs || 0).toLocaleString()}건</b>, 첨부파일 <b>{(r.deletedFiles || 0).toLocaleString()}개</b>{r.deletedAccounts ? <>, 계정 <b>{r.deletedAccounts}개(사용 중지)</b></> : null}를 지웠습니다.{job.endContract ? <> 계약종료 상태라 이 회사 사람은 접속할 수 없습니다.</> : null}<br />
                  <span className="text-[#5B6B85] text-[14px]">{fmtTime(r.expiresAt)}까지 보관함에서 복원할 수 있습니다.</span>
                  {(r.skippedDocs || r.skippedFiles) ? <><br /><span className="text-[#1B2B4B] text-[14px] font-bold">보관하지 못한 문서 {(r.skippedDocs || 0).toLocaleString()}건 · 파일 {(r.skippedFiles || 0).toLocaleString()}개는 지우지 않고 그대로 남겼어요.</span></> : null}</>}
            </div>
          )}
          {!done && !fatal && <div className="mt-4 text-[14px] text-[#5B6B85]">이 창을 닫아도 서버 작업은 계속되지만, 멈춘 작업을 이어서 부르는 것은 이 창이 합니다. 끝날 때까지 열어 두세요.</div>}
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {fatal && !hardError && <button type="button" onClick={() => { setState((p) => ({ ...p, status: "running", errorCount: 0, fatal: false })); attempt(); }} className="py-3.5 rounded-xl border border-[#1B2B4B] text-[#1B2B4B] text-[15px] font-black">이어서 다시 시도</button>}
            {(done || fatal) && <button type="button" onClick={onClose} className={`${fatal && !hardError ? "" : "col-span-2 "}py-3.5 rounded-xl bg-[#1B2B4B] text-white text-[15px] font-black hover:bg-[#243a60]`}>확인</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 위험 작업 확인창 — 회사명을 그대로 입력 + 초기화 비밀번호(두 겹 확인) ───
//  word: 회사명 대신 입력받을 확인 문구(예: "영구삭제")
export function DangerConfirm({ title, en = "RESET", company, word, lines = [], needName = true, needPassword = true, actionLabel, children, onCancel, onRun }) {
  const [name, setName] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [err, setErr] = React.useState("");
  const expect = word || company;
  const ok = (!needName || name.trim() === expect) && (!needPassword || pw.length > 0);
  const go = () => {
    if (needName && name.trim() !== expect) return setErr(word ? "확인 문구가 일치하지 않아요." : "회사명이 정확히 일치해야 합니다.");
    if (needPassword && !pw) return setErr("초기화 비밀번호를 입력하세요.");
    onRun({ password: pw, confirmName: name.trim() });
  };
  return (
    <div className="fixed inset-0 z-[99998] bg-[#0B1428]/65 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="w-full max-w-[460px] bg-white rounded-[22px] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()} data-danger-confirm="1">
        <div className="px-7 py-5 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B)" }}>
          <div className="text-[12px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">{en}</div>
          <div className="text-[20px] font-black mt-0.5">{title}</div>
        </div>
        <div className="px-7 py-6 space-y-3.5">
          {lines.length > 0 && <ul className="space-y-1.5">{lines.map((l) => <li key={l} className="flex gap-2 text-[14.5px] text-[#1B2B4B] leading-relaxed"><span className="mt-[9px] w-1.5 h-1.5 rotate-45 bg-[#2D4C82] shrink-0" />{l}</li>)}</ul>}
          {children}
          {needName && (
            <label className="block">
              <span className="text-[14px] font-bold text-[#3A4A66]">{word
                ? <>확인을 위해 <b className="text-[#0F1A30]">{word}</b> 라고 입력하세요</>
                : <>확인을 위해 회사명 <b className="text-[#0F1A30]">{company}</b> 을(를) 그대로 입력하세요</>}</span>
              <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && ok && go()} placeholder={expect} data-confirm-name
                className="mt-1.5 w-full h-12 rounded-xl border-2 border-[#DCE3EE] px-4 text-[16px] font-bold outline-none focus:border-[#1B2B4B]" />
            </label>
          )}
          {needPassword && <label className="block">
            <span className="text-[14px] font-bold text-[#3A4A66]">초기화 비밀번호</span>
            <input type="password" autoFocus={!needName} value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && ok && go()} data-confirm-pw
              className="mt-1.5 w-full h-12 rounded-xl border-2 border-[#DCE3EE] px-4 text-[16px] outline-none focus:border-[#1B2B4B]" />
          </label>}
          {err && <div className="text-[14px] font-bold text-[#0F1A30] bg-[#EEF2F8] rounded-lg px-3 py-2">{err}</div>}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button type="button" onClick={onCancel} className="h-12 rounded-xl border border-[#DCE3EE] text-[15px] font-bold text-[#3A4A66]">취소</button>
            <button type="button" onClick={go} disabled={!ok} className="h-12 rounded-xl bg-[#0B1428] text-white text-[15px] font-black disabled:opacity-35">{actionLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 영구 삭제 · 이력 지우기 진행 창 ───
//  run = { title, body }  서버가 {partial:true}면 바로 다시 불러 이어서 지운다(지운 개수는 더해서 보여 준다)
const PURGE_SUM_KEYS = ["backups", "docs", "files", "accounts", "logs", "jobs", "history"];
function PurgeRunModal({ run, onClose }) {
  const [sum, setSum] = React.useState(() => Object.fromEntries(PURGE_SUM_KEYS.map((k) => [k, 0])));
  const [skipped, setSkipped] = React.useState([]);
  const [done, setDone] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [tries, setTries] = React.useState(0);
  React.useEffect(() => {
    let dead = false;
    (async () => {
      let fails = 0;
      for (;;) {
        try {
          const r = await callReset(run.body, "companyResetPurge");
          if (dead) return;
          fails = 0;
          setSum((p) => Object.fromEntries(PURGE_SUM_KEYS.map((k) => [k, (p[k] || 0) + (r[k] || 0)])));
          if (r.partial) continue;
          setSkipped(r.skipped || []);
          setDone(true);
          return;
        } catch (e) {
          if (dead) return;
          fails += 1;
          if ((!e.network && e.status && e.status < 500) || fails >= 4) { setErr(e.message); return; }
          setTries(fails);
          await new Promise((ok) => setTimeout(ok, 3000));
        }
      }
    })();
    return () => { dead = true; };
  }, [run]);
  const records = sum.logs + sum.jobs + sum.history;
  return (
    <div className="fixed inset-0 z-[99999] bg-[#0B1428]/70 backdrop-blur-[2px] flex items-center justify-center p-4" data-purge-run="1">
      <div className="w-full max-w-[440px] bg-white rounded-[22px] shadow-2xl overflow-hidden">
        <div className="px-7 py-5 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
          <div className="text-[12px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">PURGE</div>
          <div className="text-[20px] font-black mt-0.5">{run.title} {done ? "완료" : err ? "멈춤" : "중"}</div>
        </div>
        <div className="px-7 py-6 space-y-3">
          {!done && !err && <div className="text-[15px] font-bold text-[#1B2B4B]">지우고 있어요{tries ? ` (다시 시도 ${tries})` : ""}. 끝날 때까지 창을 열어 두세요.</div>}
          {err && <div className="rounded-xl border border-[#DCE3EE] bg-[#F5F8FD] px-4 py-3 text-[14px] text-[#1B2B4B] break-all">{err}</div>}
          <div className="rounded-2xl bg-[#F5F8FD] border border-[#E3E8F0] px-5 py-4 text-[15px] text-[#0F1A30] leading-relaxed tabular-nums">
            보관 데이터 <b>{sum.docs.toLocaleString()}건</b> · 첨부파일 <b>{sum.files.toLocaleString()}개</b>
            {sum.accounts ? <> · 계정 <b>{sum.accounts}개</b></> : null}
            {run.body.mode === "history" && <><br />이력 <b>{records.toLocaleString()}건</b>을 지웠어요</>}
          </div>
          {skipped.length > 0 && (
            <div className="text-[14px] text-[#5B6B85] leading-relaxed">
              {skipped.map((s) => <div key={s.id}><b className="text-[#1B2B4B]">{s.company || s.id}</b> 건너뜀 · {s.reason}</div>)}
            </div>
          )}
          {(done || err) && <button type="button" onClick={onClose} className="w-full h-12 rounded-xl bg-[#1B2B4B] text-white text-[15px] font-black">확인</button>}
        </div>
      </div>
    </div>
  );
}

// ─── [취소하고 정리] 진행 창 — 삭제가 시작되기 전 작업의 보관 복사본만 지운다 ───
//  서버가 {partial:true}면 바로, {busy:true}(그 작업이 아직 돌고 있음 — 멈춤 요청을 받고 곧 멈춘다)면 4초 뒤 다시 부른다
function CancelRunModal({ run, onClose }) {
  const [sum, setSum] = React.useState({ docs: 0, files: 0 });
  const [done, setDone] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [waiting, setWaiting] = React.useState(false);
  React.useEffect(() => {
    let dead = false;
    (async () => {
      let fails = 0, waits = 0;
      for (;;) {
        try {
          const r = await callReset(run.body, "companyResetJob");
          if (dead) return;
          fails = 0;
          setSum((p) => ({ docs: p.docs + (r.docs || 0), files: p.files + (r.files || 0) }));
          if (r.busy) {
            waits += 1; setWaiting(true);
            if (waits > 120) { setErr("작업이 멈추지 않아요. 몇 분 뒤 다시 시도해 주세요."); return; }
            await new Promise((ok) => setTimeout(ok, 4000));
            continue;
          }
          setWaiting(false);
          if (r.partial) continue;
          setDone(true);
          return;
        } catch (e) {
          if (dead) return;
          fails += 1;
          if ((!e.network && e.status && e.status < 500) || fails >= 4) { setErr(e.message); return; }
          await new Promise((ok) => setTimeout(ok, 3000));
        }
      }
    })();
    return () => { dead = true; };
  }, [run]);
  return (
    <div className="fixed inset-0 z-[99999] bg-[#0B1428]/70 backdrop-blur-[2px] flex items-center justify-center p-4" data-cancel-run="1">
      <div className="w-full max-w-[440px] bg-white rounded-[22px] shadow-2xl overflow-hidden">
        <div className="px-7 py-5 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
          <div className="text-[12px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">CANCEL</div>
          <div className="text-[20px] font-black mt-0.5">{run.title} {done ? "완료" : err ? "멈춤" : "중"}</div>
        </div>
        <div className="px-7 py-6 space-y-3">
          {!done && !err && <div className="text-[15px] font-bold text-[#1B2B4B]">{waiting ? "돌고 있던 실행에 멈춤을 요청했어요. 멈추면 바로 정리합니다…" : "보관함에 복사해 둔 것만 지우고 있어요. 운영 데이터는 건드리지 않아요."}</div>}
          {err && <div className="rounded-xl border border-[#DCE3EE] bg-[#F5F8FD] px-4 py-3 text-[14px] text-[#1B2B4B] break-all">{err}</div>}
          <div className="rounded-2xl bg-[#F5F8FD] border border-[#E3E8F0] px-5 py-4 text-[15px] text-[#0F1A30] leading-relaxed tabular-nums">
            보관 복사본 <b>{sum.docs.toLocaleString()}건</b> · 보관 파일 <b>{sum.files.toLocaleString()}개</b>를 지웠어요
          </div>
          {(done || err) && <button type="button" onClick={onClose} className="w-full h-12 rounded-xl bg-[#1B2B4B] text-white text-[15px] font-black">확인</button>}
        </div>
      </div>
    </div>
  );
}

const agoText = (ms) => {
  if (!ms) return "신호 없음";
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 1 ? "방금 신호" : m < 60 ? `${m}분째 신호 없음` : m < 1440 ? `${Math.floor(m / 60)}시간째 신호 없음` : `${Math.floor(m / 1440)}일째 신호 없음`;
};

// 운송사 목록(검색) — 서버 목록 + 계정 수
function CompanyPicker({ companies, value, onChange }) {
  const [q, setQ] = React.useState("");
  const list = companies.filter((c) => !q.trim() || c.name.includes(q.trim()) || (c.code || "").includes(q.trim()));
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="회사명·회사코드 검색" className="w-full h-11 rounded-xl border border-[#DCE3EE] px-3.5 text-[15px] outline-none focus:border-[#1B2B4B]" />
      <div className="mt-2 max-h-[300px] overflow-y-auto rounded-xl border border-[#EEF1F6] divide-y divide-[#EEF1F6]">
        {list.length === 0 && <div className="py-8 text-center text-[14px] text-[#7A879C]">맞는 운송사가 없습니다</div>}
        {list.map((c) => {
          const on = c.name === value;
          return (
            <button key={c.name} type="button" onClick={() => onChange(c.name)} data-reset-co={c.name}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition ${on ? "bg-[#1B2B4B] text-white" : "hover:bg-[#F5F8FD]"}`}>
              <span className={`w-2 h-2 rounded-full ${on ? "bg-[#8FB0F0]" : "bg-[#CBD3E1]"}`} />
              <span className="flex-1 min-w-0 truncate text-[15px] font-bold">{c.name}</span>
              <span className={`text-[13.5px] ${on ? "text-white/70" : "text-[#7A879C]"}`}>{c.code ? `${c.code} · ` : ""}계정 {c.users}명</span>
            </button>
          );
        })}
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
  const [pwForm, setPwForm] = React.useState(null);
  const [confirm, setConfirm] = React.useState(null); // { mode: "reset" } | { mode: "restore", backup }
  const [backups, setBackups] = React.useState(null);
  const [keepDays, setKeepDays] = React.useState(7);
  const [preview, setPreview] = React.useState(null); // { company, total, subDocs, perCollection, accounts } | { company, loading } | { company, error }
  const [job, setJob] = React.useState(null);
  const [purgeRun, setPurgeRun] = React.useState(null); // { title, body }
  const [cancelRun, setCancelRun] = React.useState(null); // { title, body }

  const load = React.useCallback(async () => {
    setLoadErr("");
    try {
      const [st, co, bk] = await Promise.all([callReset({ action: "status" }), callReset({ action: "companies" }), callReset({ action: "backups" })]);
      setStatus(st); setCompanies(co.companies || []); setBackups(bk.backups || []);
      if (bk.keepDays) setKeepDays(bk.keepDays);
    } catch (e) { setLoadErr(e.message); }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const savePassword = async () => {
    const f = pwForm || {};
    if ((f.pw1 || "").length < 4) return alert("초기화 비밀번호는 4자 이상으로 정해주세요.");
    if (f.pw1 !== f.pw2) return alert("비밀번호 확인이 일치하지 않습니다.");
    setBusy("pw");
    try { await callReset({ action: "setPassword", newPassword: f.pw1, currentPassword: f.cur || "" }); setPwForm(null); await load(); alert("초기화 비밀번호가 설정되었습니다."); }
    catch (e) { alert(e.message); } finally { setBusy(""); }
  };
  const runPreview = async () => {
    if (!company) return;
    setPreview({ company, loading: true });
    try { const r = await callReset({ action: "preview", company, deleteAccounts }); setPreview({ company, ...r }); }
    catch (e) { setPreview({ company, error: e.message }); }
  };
  const needPw = (fn) => (status?.hasPassword ? fn() : alert("먼저 초기화 비밀번호를 설정해 주세요."));
  const startPurge = ({ password, confirmName }) => {
    const c = confirm;
    const body = { mode: c.mode === "history" || c.mode === "historyAll" ? "history" : "purge", password, confirmText: confirmName, ...(c.backup ? { backupId: c.backup.id } : { all: true }) };
    const title = c.mode === "purge" ? `${c.backup.company} 영구 삭제` : c.mode === "history" ? `${c.backup.company} 이력 지우기` : c.mode === "purgeAll" ? "보관함 비우기" : "이력 모두 지우기";
    setPurgeRun({ title, body });
    setConfirm(null);
  };
  // 멈춘 작업 [이어서 진행] — 같은 작업ID로 다시 부른다(끝난 묶음은 건너뜀)
  const resume = ({ password }) => {
    const b = confirm.backup;
    setJob({ id: b.id, action: "reset", company: b.company, endContract: b.endContract,
      body: { action: "execute", company: b.company, deleteAccounts: b.deleteAccounts, endContract: b.endContract, password, confirmName: b.company, jobId: b.id } });
    setConfirm(null);
  };
  const startCancel = ({ password, confirmName }) => {
    const b = confirm.backup;
    setCancelRun({ title: `${b.company} 초기화 취소하고 정리`, body: { action: "cancel", backupId: b.id, password, confirmName } });
    setConfirm(null);
  };
  const start = ({ password, confirmName }) => {
    const restore = confirm.mode === "restore";
    const jobId = newJobId();
    const body = restore
      ? { action: "restore", backupId: confirm.backup.id, password, jobId }
      : { action: "execute", company, deleteAccounts, password, confirmName, jobId };
    setJob({ id: jobId, action: restore ? "restore" : "reset", company: restore ? confirm.backup.company : company, body });
    setConfirm(null);
  };
  const sel = companies.find((c) => c.name === company);
  const pv = preview && preview.company === company ? preview : null;
  const topCols = pv?.perCollection ? Object.entries(pv.perCollection).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="space-y-4" data-reset-panel="1">
      {loadErr && <div className="rounded-xl border border-[#DCE3EE] bg-[#F5F8FD] px-5 py-3 text-[14px] text-[#1B2B4B]">{loadErr} <button onClick={load} className="ml-2 underline font-bold">다시 시도</button></div>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)] items-start">
        {/* 왼쪽 — 초기화 실행 */}
        <section className={CARD}>
          <CardHead code="RESET · EXECUTE" title="운송사 데이터 초기화" desc={`선택한 운송사가 등록한 모든 데이터(오더·거래처·기사·첨부파일 등)를 지웁니다. 지운 데이터는 ${keepDays}일 동안 보관함에 남아 복원할 수 있습니다.`} />
          <div className="p-5 grid gap-5 lg:grid-cols-2">
            <div>
              <div className="text-[14px] font-black text-[#0F1A30] mb-2">① 운송사 고르기</div>
              <CompanyPicker companies={companies} value={company} onChange={(n) => { setCompany(n); }} />
            </div>
            <div className="flex flex-col gap-3.5">
              <div className="text-[14px] font-black text-[#0F1A30]">② 확인하기</div>
              {!company ? (
                <div className="flex-1 rounded-xl border border-dashed border-[#DCE3EE] flex items-center justify-center text-[14px] text-[#7A879C] py-10">왼쪽에서 운송사를 고르세요</div>
              ) : (
                <>
                  <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-4 py-3.5">
                    <div className="text-[17px] font-black text-[#0F1A30]">{company}</div>
                    <div className="text-[14px] text-[#5B6B85] mt-0.5">{sel?.code ? `회사코드 ${sel.code} · ` : ""}계정 {sel?.users ?? 0}명</div>
                  </div>
                  <label className="flex items-start gap-2.5 text-[14.5px] text-[#1B2B4B] font-bold cursor-pointer">
                    <input type="checkbox" checked={deleteAccounts} onChange={(e) => { setDeleteAccounts(e.target.checked); setPreview(null); }} className="mt-0.5 w-[18px] h-[18px] accent-[#1B2B4B]" />
                    <span>직원·기사 로그인 계정까지 삭제<span className="block font-medium text-[13.5px] text-[#5B6B85]">체크 안 하면 계정은 남아 다시 로그인해 처음부터 쓸 수 있습니다</span></span>
                  </label>
                  <div className="rounded-xl border border-[#E3E8F0] px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-black text-[#0F1A30]">지울 데이터 미리 세어 보기</span>
                      <button type="button" onClick={runPreview} disabled={pv?.loading} className="h-9 px-3.5 rounded-lg border border-[#1B2B4B] text-[#1B2B4B] text-[14px] font-black disabled:opacity-50">{pv?.loading ? "세는 중…" : pv ? "다시 세기" : "세어 보기"}</button>
                    </div>
                    {pv?.error && <div className="mt-2 text-[14px] text-[#1B2B4B]">{pv.error}</div>}
                    {pv && !pv.loading && !pv.error && (
                      <div className="mt-2.5">
                        <div className="text-[14.5px] text-[#1B2B4B]">문서 <b>{(pv.total || 0).toLocaleString()}건</b> · 하위 문서 <b>{(pv.subDocs || 0).toLocaleString()}건</b> · 계정 <b>{pv.accounts || 0}명</b></div>
                        <div className="mt-2 flex flex-wrap gap-1.5">{topCols.slice(0, 12).map(([k, n]) => <span key={k} className="px-2.5 h-7 inline-flex items-center rounded-full bg-[#EEF2F8] text-[13px] font-bold text-[#1B2B4B]">{k} {n.toLocaleString()}</span>)}</div>
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => (status?.hasPassword ? setConfirm({ mode: "reset" }) : alert("먼저 오른쪽에서 초기화 비밀번호를 설정해 주세요."))} data-reset-start
                    className="h-12 rounded-xl bg-[#0B1428] text-white text-[15.5px] font-black hover:bg-[#1B2B4B]">③ {company} 초기화…</button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* 오른쪽 — 비밀번호 + 보관함 */}
        <div className="space-y-4">
          <section className={CARD}>
            <CardHead code="SECURITY" title="초기화 비밀번호"
              desc={status === null ? "확인 중…" : status.hasPassword ? `설정됨${status.updatedAt ? ` · ${new Date(status.updatedAt).toLocaleString("ko-KR")}` : ""}${status.updatedBy ? ` · ${status.updatedBy}` : ""}` : "아직 설정되지 않았습니다 — 초기화·복원하려면 먼저 정해 주세요."}
              right={status && !pwForm && <button onClick={() => setPwForm({ cur: "", pw1: "", pw2: "" })} className="shrink-0 h-9 px-3.5 rounded-lg bg-[#1B2B4B] text-white text-[14px] font-bold">{status.hasPassword ? "변경" : "설정"}</button>} />
            <div className="p-5">
              {pwForm ? (
                <div className="grid gap-2.5">
                  {status?.hasPassword && <input type="password" placeholder="현재 초기화 비밀번호" value={pwForm.cur} onChange={(e) => setPwForm({ ...pwForm, cur: e.target.value })} className="h-11 rounded-xl border border-[#DCE3EE] px-3.5 text-[15px] outline-none focus:border-[#1B2B4B]" />}
                  <input type="password" placeholder="새 비밀번호 (4자 이상)" value={pwForm.pw1} onChange={(e) => setPwForm({ ...pwForm, pw1: e.target.value })} className="h-11 rounded-xl border border-[#DCE3EE] px-3.5 text-[15px] outline-none focus:border-[#1B2B4B]" />
                  <input type="password" placeholder="새 비밀번호 확인" value={pwForm.pw2} onChange={(e) => setPwForm({ ...pwForm, pw2: e.target.value })} className="h-11 rounded-xl border border-[#DCE3EE] px-3.5 text-[15px] outline-none focus:border-[#1B2B4B]" />
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setPwForm(null)} className="h-11 rounded-xl border border-[#DCE3EE] text-[14.5px] font-bold text-[#3A4A66]">취소</button>
                    <button onClick={savePassword} disabled={busy === "pw"} className="h-11 rounded-xl bg-[#1B2B4B] text-white text-[14.5px] font-bold disabled:opacity-60">{busy === "pw" ? "저장 중…" : "저장"}</button>
                  </div>
                </div>
              ) : <div className="text-[14px] text-[#5B6B85] leading-relaxed">초기화·복원·계약종료+초기화 때마다 확인합니다. 5번 틀리면 10분간 잠깁니다.</div>}
            </div>
          </section>

          <section className={CARD}>
            <CardHead code="BACKUP" title="초기화 보관함" desc={`${keepDays}일 뒤 자동으로 지워져요 · 그 전에 [복원]하면 초기화 전으로 돌아와요`}
              right={<button onClick={load} className="shrink-0 h-9 px-3 rounded-lg border border-[#DCE3EE] text-[14px] font-bold text-[#3A4A66]">새로고침</button>} />
            <div className="divide-y divide-[#EEF1F6]">
              {backups === null ? <div className="py-10 text-center text-[14px] text-[#7A879C]">불러오는 중…</div>
                : backups.length === 0 ? <div className="py-10 text-center text-[14px] text-[#7A879C]">초기화한 기록이 없습니다</div>
                  : backups.map((b) => {
                    const live = b.status === "kept" && b.expiresAt > Date.now();
                    const left = daysLeft(b.expiresAt);
                    const chip = b.status === "restored" ? `복원됨 · ${fmtTime(b.restoredAt)}`
                      : b.status === "cancelled" ? `취소하고 정리함${b.cancelledAt ? ` · ${fmtTime(b.cancelledAt)}` : ""}`
                        : b.unfinished ? (b.cancelling ? "취소 정리 중" : b.alive ? "처리 중" : `멈춤 · ${agoText(b.lastBeat)}`)
                          : live ? (b.phase === "done" ? `보관 중 · D-${left}` : "삭제 진행 중")
                            : b.status === "purging" ? "지우다 멈춤" : b.status === "saving" || b.status === "restoring" ? "처리 중(끊김)" : "영구 삭제됨";
                    const blocked = b.unfinished || b.status === "restoring" || (b.status === "kept" && b.phase !== "done");
                    const canPurge = !blocked && b.status !== "purged" && b.status !== "cancelled";
                    return (
                      <div key={b.id} className="px-5 py-3.5 flex items-center gap-3 flex-wrap" data-backup-item={b.id}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap"><span className="text-[15px] font-black text-[#0F1A30]">{b.company}</span>
                            {b.endContract && <span className="px-2 h-6 inline-flex items-center rounded-full bg-[#0B1428] text-white text-[12px] font-black">계약종료</span>}
                            <span className="px-2 h-6 inline-flex items-center rounded-full bg-[#EEF2F8] text-[#1B2B4B] text-[12.5px] font-bold">{chip}</span></div>
                          <div className="text-[13.5px] text-[#5B6B85] mt-0.5">{fmtTime(b.at)} · {b.by} · {b.docCount.toLocaleString()}건 · 파일 {b.fileCount.toLocaleString()}{b.deleteAccounts ? ` · 계정 ${b.accounts}` : ""}</div>
                          {b.lastError && b.phase !== "done" && b.status !== "cancelled" && <div className="text-[13px] text-[#1B2B4B] mt-0.5 break-all">마지막 오류 [{b.lastStep}] {b.lastError}</div>}
                          {b.unfinished && (
                            <div className="text-[13px] text-[#5B6B85] mt-0.5">
                              {b.jobStep ? `${b.jobPct ? `${b.jobPct}% · ` : ""}${b.jobStep}` : ""}
                              {b.legacy ? " · 예전 방식으로 시작된 작업이라 이어서 하면 보관을 처음부터 다시 해요" : ""}
                              {b.deleteStarted ? " · 삭제가 시작돼 취소할 수 없어요. 이어서 끝내 주세요" : ""}
                            </div>
                          )}
                          {b.phase === "done" && (b.skippedDocs > 0 || b.skippedFiles > 0) && <div className="text-[13px] text-[#1B2B4B] mt-0.5">보관 못 해 남긴 문서 {b.skippedDocs}건 · 파일 {b.skippedFiles}개</div>}
                        </div>
                        {b.unfinished && (
                          <div className="basis-full flex gap-1.5 justify-end">
                            {b.canResume && <button type="button" onClick={() => needPw(() => setConfirm({ mode: "resume", backup: b }))} data-resume-one={b.id} className="h-8 px-3 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold">이어서 진행</button>}
                            {b.canCancel && <button type="button" onClick={() => needPw(() => setConfirm({ mode: "cancelJob", backup: b }))} data-cancel-one={b.id} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-bold text-[#3A4A66] hover:border-[#1B2B4B]">{b.cancelling ? "정리 계속하기" : "취소하고 정리"}</button>}
                          </div>
                        )}
                        {live && b.phase === "done" && <button onClick={() => (status?.hasPassword ? setConfirm({ mode: "restore", backup: b }) : alert("먼저 초기화 비밀번호를 설정해 주세요."))} className="shrink-0 h-9 px-3.5 rounded-lg bg-[#1B2B4B] text-white text-[14px] font-bold">복원</button>}
                        {!blocked && (
                          <div className="basis-full flex gap-1.5 justify-end">
                            {canPurge && <button type="button" onClick={() => needPw(() => setConfirm({ mode: "purge", backup: b }))} data-purge-one={b.id} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-bold text-[#3A4A66] hover:border-[#1B2B4B]">지금 영구 삭제</button>}
                            <button type="button" onClick={() => needPw(() => setConfirm({ mode: "history", backup: b }))} data-history-one={b.id} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-bold text-[#3A4A66] hover:border-[#1B2B4B]">이력 지우기</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
            </div>
            {backups?.length > 0 && (
              <div className="px-5 py-4 border-t border-[#EEF1F6] grid grid-cols-2 gap-2">
                <button type="button" onClick={() => needPw(() => setConfirm({ mode: "purgeAll" }))} data-purge-all className="h-10 rounded-xl border border-[#1B2B4B] text-[#1B2B4B] text-[14px] font-black">보관함 모두 비우기</button>
                <button type="button" onClick={() => needPw(() => setConfirm({ mode: "historyAll" }))} data-history-all className="h-10 rounded-xl border border-[#DCE3EE] text-[#3A4A66] text-[14px] font-black">이력 모두 지우기</button>
              </div>
            )}
          </section>
        </div>
      </div>

      {confirm?.mode === "reset" && (
        <DangerConfirm title={`${company} 초기화`} company={company} actionLabel="초기화 시작" onCancel={() => setConfirm(null)} onRun={start}
          lines={[...((backups || []).some((b) => b.unfinished && b.company === company) ? [`${company}의 끝나지 않은 초기화가 보관함에 있어요. 새로 만들지 않고 그 작업을 이어서 합니다(멈춘 작업을 지우려면 보관함에서 [취소하고 정리]).`] : []), `${company}의 오더·거래처·기사·설정·첨부파일을 모두 지웁니다.`, deleteAccounts ? "직원·기사 로그인 계정도 사용 중지 후 7일 뒤 삭제됩니다." : "로그인 계정은 남깁니다.", `${keepDays}일 동안 보관함에서 복원할 수 있습니다.`]} />
      )}
      {confirm?.mode === "resume" && (
        <DangerConfirm en="RESUME" title={`${confirm.backup.company} 초기화 이어서 진행`} company={confirm.backup.company} needName={false} actionLabel="이어서 진행" onCancel={() => setConfirm(null)} onRun={resume}
          lines={[
            `${fmtTime(confirm.backup.at)}에 시작한 초기화를 끝난 묶음 다음부터 이어서 합니다.`,
            ...(confirm.backup.legacy ? ["예전 방식으로 시작된 작업이라 보관함에 반쯤 복사된 것을 지우고 보관부터 다시 합니다(운영 데이터는 보관이 끝난 뒤에만 지워요)."] : []),
            "같은 운송사 작업은 한 번에 하나만 돌아요. 다른 창에서 돌고 있으면 그 작업을 지켜봅니다.",
          ]} />
      )}
      {confirm?.mode === "cancelJob" && (
        <DangerConfirm en="CANCEL" title={`${confirm.backup.company} 초기화 취소하고 정리`} company={confirm.backup.company} actionLabel="취소하고 정리" onCancel={() => setConfirm(null)} onRun={startCancel}
          lines={[
            "보관함에 복사해 둔 것(문서·첨부파일 사본)만 지우고 작업을 끝냅니다.",
            "운영 데이터는 아직 지우지 않은 단계라 그대로 남아요.",
            ...(confirm.backup.alive ? ["지금 돌고 있는 실행에는 멈춤을 요청하고, 멈추면 정리합니다."] : []),
            ...(confirm.backup.endContract ? ["계약종료 표시는 그대로 남아요. 다시 열려면 이용 계약에서 [이용 재개]를 눌러 주세요."] : []),
          ]} />
      )}
      {confirm?.mode === "restore" && (
        <DangerConfirm en="RESTORE" title={`${confirm.backup.company} 복원`} company={confirm.backup.company} needName={false} actionLabel="복원 시작" onCancel={() => setConfirm(null)} onRun={start}
          lines={[`${fmtTime(confirm.backup.at)}에 초기화한 데이터 ${confirm.backup.docCount.toLocaleString()}건을 되돌립니다.`]} />
      )}
      {confirm?.mode === "purge" && (
        <DangerConfirm en="PURGE" title={`${confirm.backup.company} 보관함 영구 삭제`} company={confirm.backup.company} actionLabel="영구 삭제" onCancel={() => setConfirm(null)} onRun={startPurge}
          lines={[
            `보관한 데이터 ${confirm.backup.docCount.toLocaleString()}건과 첨부파일 ${confirm.backup.fileCount.toLocaleString()}개를 지금 바로 지워요.`,
            "지우면 다시 복원할 수 없어요.",
            ...(confirm.backup.status === "kept" && confirm.backup.accounts ? [`사용 중지해 둔 로그인 계정 ${confirm.backup.accounts}개도 함께 지워요.`] : []),
            "이력은 남아요. 이력까지 없애려면 [이력 지우기]를 눌러 주세요.",
          ]} />
      )}
      {confirm?.mode === "history" && (
        <DangerConfirm en="CLEAR HISTORY" title={`${confirm.backup.company} 이력 지우기`} company={confirm.backup.company} actionLabel="이력 지우기" onCancel={() => setConfirm(null)} onRun={startPurge}
          lines={[
            "이 초기화의 보관함 기록, 진행 기록, 복원 기록을 지워요.",
            ...(confirm.backup.status !== "purged" ? ["보관한 데이터와 첨부파일도 함께 영구 삭제돼요."] : []),
            "지우면 되돌릴 수 없어요.",
          ]} />
      )}
      {confirm?.mode === "purgeAll" && (
        <DangerConfirm en="PURGE ALL" title="보관함 모두 비우기" word="영구삭제" actionLabel="모두 영구 삭제" onCancel={() => setConfirm(null)} onRun={startPurge}
          lines={["보관 중인 모든 운송사의 데이터와 첨부파일을 지금 바로 지워요.", "지우면 어떤 운송사도 복원할 수 없어요.", "복원 중이거나 초기화가 진행 중인 건은 건너뛰어요.", "이력은 남아요."]} />
      )}
      {confirm?.mode === "historyAll" && (
        <DangerConfirm en="CLEAR ALL" title="이력 모두 지우기" word="영구삭제" actionLabel="모두 지우기" onCancel={() => setConfirm(null)} onRun={startPurge}
          lines={["보관함과 초기화, 복원 기록을 모두 지워요.", "보관 중인 데이터도 함께 영구 삭제돼요.", "진행 중인 작업과 다른 기능의 기록은 남겨요.", "지우면 되돌릴 수 없어요."]} />
      )}
      {purgeRun && <PurgeRunModal run={purgeRun} onClose={() => { setPurgeRun(null); load(); }} />}
      {cancelRun && <CancelRunModal run={cancelRun} onClose={() => { setCancelRun(null); load(); }} />}
      {job && <ResetProgressModal job={job} onClose={() => { setJob(null); load(); }} />}
    </div>
  );
}
