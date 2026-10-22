// ======================= src/CompanyResetPanel.jsx =======================
// ⭐ 운송사 초기화(최고관리자 전용, 관리자메뉴 > 운영 관리 > 운송사 초기화)
//  1) 초기화 비밀번호를 먼저 설정(서버에 암호화해서 저장 — 화면에서 다시 볼 수 없음)
//  2) 운송사 선택 → [미리보기]로 지워질 데이터 개수 확인
//  3) [초기화] → 매출관리처럼 비밀번호 입력창 → 맞으면 그 운송사가 등록한 데이터를 전부 삭제
// 실제 삭제는 서버(functions/index.js companyReset)가 한다.
import React from "react";
import { auth, FUNCTIONS_BASE } from "./firebase";

async function callReset(body) {
  const token = await auth.currentUser?.getIdToken();
  let res;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/companyReset`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` },
      body: JSON.stringify(body),
    });
  } catch {
    // 서버에 함수가 아직 없으면 브라우저는 "Failed to fetch"로만 알려준다
    throw new Error("서버에 연결할 수 없습니다. 초기화 기능을 아직 배포하지 않았다면 PC에서 firebase deploy --only functions 를 실행해 주세요.");
  }
  let data = {};
  try { data = await res.json(); } catch { /* 무시 */ }
  if (!res.ok) {
    if (res.status === 404) throw new Error("서버에 초기화 기능이 아직 배포되지 않았습니다. PC에서 firebase deploy --only functions를 실행해 주세요.");
    throw new Error(data.error || `요청 실패 (${res.status})`);
  }
  return data;
}

// 컬렉션 이름 → 화면에 보일 이름
const COL_LABEL = {
  dispatch: "배차 오더", orders: "오더", fixedClients: "고정거래처 오더", clients: "거래처", places: "상하차지",
  drivers: "기사", schedules: "일정", notifications: "알림", companySettings: "회사 설정", attendance: "근태",
  attendanceRequests: "근태 신청", attendanceChangeRequests: "근태 변경 신청", notices: "공지", handovers: "인수인계",
  gps_tracks: "위치 기록", driver_logs: "기사 기록", driver_notifications: "기사 알림", userProfiles: "개인 설정",
  users: "계정", transportApplications: "가입 신청서", loginSessions: "로그인 기록", sessionLogs: "접속 이력",
  scheduledEmails: "예약 메일", multiRateSheets: "단가표", shipper_orders: "화주 요청 오더", deletedOrders: "삭제된 오더 보관함",
  companyApplications: "화주사 연동", companyEditRequests: "회사정보 수정요청", emailLogs: "메일 기록", acctPayments: "지급 기록",
  driver_documents: "기사 서류", driver_completed_archive: "기사 완료 보관", userSettings: "사용자 설정", fleet_settings: "지입 설정",
};

export default function CompanyResetPanel() {
  const [status, setStatus] = React.useState(null);
  const [companies, setCompanies] = React.useState([]);
  const [loadErr, setLoadErr] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [deleteAccounts, setDeleteAccounts] = React.useState(false);
  const [preview, setPreview] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [result, setResult] = React.useState(null);
  const [pwForm, setPwForm] = React.useState(null); // { cur, pw1, pw2 }
  const [askPw, setAskPw] = React.useState(false);
  const [execPw, setExecPw] = React.useState("");
  const [execErr, setExecErr] = React.useState("");

  const load = React.useCallback(async () => {
    setLoadErr("");
    try {
      const [st, co] = await Promise.all([callReset({ action: "status" }), callReset({ action: "companies" })]);
      setStatus(st);
      setCompanies(co.companies || []);
    } catch (e) { setLoadErr(e.message); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { setPreview(null); setResult(null); }, [company, deleteAccounts]);

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

  const runPreview = async () => {
    if (!company) return;
    setBusy("preview");
    try { setPreview(await callReset({ action: "preview", company, deleteAccounts })); } catch (e) { alert(e.message); } finally { setBusy(""); }
  };

  const runExecute = async () => {
    if (!execPw) return setExecErr("비밀번호를 입력하세요.");
    setBusy("exec"); setExecErr("");
    try {
      const r = await callReset({ action: "execute", company, deleteAccounts, password: execPw });
      setAskPw(false); setExecPw(""); setPreview(null);
      setResult(r);
      load();
    } catch (e) { setExecErr(e.message); } finally { setBusy(""); }
  };

  const input = "w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B]";
  const sel = companies.find((c) => c.name === company);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-[13px] text-red-700 leading-relaxed">
        <b className="text-[14px]">⚠️ 되돌릴 수 없는 기능입니다.</b> 선택한 운송사가 프로그램에 등록한 모든 데이터(오더·거래처·상하차지·기사·일정·근태·알림·설정·첨부파일 등)를
        하나도 빠짐없이 삭제해 처음 가입한 상태로 되돌립니다. 기본 회사(돌캐)는 초기화할 수 없습니다.
      </div>

      {loadErr && <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-[13px] text-amber-800">{loadErr} <button onClick={load} className="ml-2 underline font-bold">다시 시도</button></div>}

      {/* 1. 초기화 비밀번호 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[14.5px] font-black text-[#1B2B4B]">1. 초기화 비밀번호</div>
            <div className="text-[12.5px] text-gray-500 mt-0.5">
              {status === null ? "확인 중…" : status.hasPassword
                ? `설정됨${status.updatedAt ? ` · ${new Date(status.updatedAt).toLocaleString("ko-KR")}` : ""}${status.updatedBy ? ` · ${status.updatedBy}` : ""}`
                : "아직 설정되지 않았습니다 — 초기화하려면 먼저 비밀번호를 정해주세요."}
            </div>
          </div>
          {status && !pwForm && (
            <button onClick={() => setPwForm({ cur: "", pw1: "", pw2: "" })} className="px-4 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold">
              {status.hasPassword ? "비밀번호 변경" : "비밀번호 설정"}
            </button>
          )}
        </div>
        {pwForm && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-2">
            {status?.hasPassword && <input type="password" placeholder="현재 초기화 비밀번호" value={pwForm.cur} onChange={(e) => setPwForm({ ...pwForm, cur: e.target.value })} className={input} />}
            <input type="password" placeholder="새 비밀번호 (4자 이상)" value={pwForm.pw1} onChange={(e) => setPwForm({ ...pwForm, pw1: e.target.value })} className={input} />
            <input type="password" placeholder="새 비밀번호 확인" value={pwForm.pw2} onChange={(e) => setPwForm({ ...pwForm, pw2: e.target.value })} className={input} />
            <div className="flex gap-2">
              <button onClick={savePassword} disabled={busy === "pw"} className="flex-1 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold disabled:opacity-60">{busy === "pw" ? "저장 중…" : "저장"}</button>
              <button onClick={() => setPwForm(null)} className="px-3 py-2 rounded-lg border border-gray-300 text-[13px] font-bold text-gray-600">취소</button>
            </div>
          </div>
        )}
      </div>

      {/* 2. 운송사 선택 + 미리보기 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="text-[14.5px] font-black text-[#1B2B4B]">2. 초기화할 운송사</div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={company} onChange={(e) => setCompany(e.target.value)} className="h-[38px] min-w-[260px] px-3 rounded-lg border border-gray-300 text-[13.5px] font-semibold outline-none">
            <option value="">운송사 선택</option>
            {companies.map((c) => (
              <option key={c.name} value={c.name} disabled={c.name === "돌캐"}>
                {c.name}{c.code ? ` (${c.code})` : ""} · 계정 {c.users}명{c.name === "돌캐" ? " — 초기화 불가" : ""}
              </option>
            ))}
          </select>
          <button onClick={runPreview} disabled={!company || busy === "preview"} className="h-[38px] px-4 rounded-lg border border-[#1B2B4B] text-[#1B2B4B] text-[13px] font-bold disabled:opacity-50">
            {busy === "preview" ? "확인 중…(최대 1~2분)" : "미리보기"}
          </button>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-gray-700 font-semibold">
          <input type="checkbox" checked={deleteAccounts} onChange={(e) => setDeleteAccounts(e.target.checked)} className="w-4 h-4" />
          직원·기사 로그인 계정까지 삭제 <span className="font-normal text-gray-500">(체크 안 하면 계정은 남아 다시 로그인해 처음부터 쓸 수 있음)</span>
        </label>

        {preview && (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b text-[13px] font-bold text-gray-700">
              {company} — 삭제될 데이터 {preview.total.toLocaleString()}건 · 첨부파일 {preview.files.toLocaleString()}개
              {preview.deleteAccounts ? ` · 로그인 계정 ${preview.accounts}개` : ` · 계정 ${preview.accounts}개는 유지`}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1.5 px-4 py-3 text-[13px]">
              {Object.entries(preview.perCollection).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([col, n]) => (
                <div key={col} className="flex justify-between gap-2"><span className="text-gray-600 truncate">{COL_LABEL[col] || col}</span><b className="tabular-nums">{n.toLocaleString()}</b></div>
              ))}
              {preview.total === 0 && <div className="text-gray-500">지울 데이터가 없습니다.</div>}
            </div>
          </div>
        )}

        <button
          onClick={() => { if (!status?.hasPassword) return alert("먼저 초기화 비밀번호를 설정해 주세요."); setAskPw(true); setExecErr(""); setExecPw(""); }}
          disabled={!company || !preview}
          className="w-full py-3 rounded-xl bg-red-600 text-white text-[14px] font-black hover:bg-red-700 disabled:opacity-40"
        >
          {!preview ? "미리보기를 먼저 확인하세요" : `${company} 초기화`}
        </button>

        {result && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800 font-semibold">
            초기화 완료 — 데이터 {result.deletedDocs.toLocaleString()}건, 첨부파일 {result.deletedFiles.toLocaleString()}개{result.deletedAccounts ? `, 계정 ${result.deletedAccounts}개` : ""} 삭제
          </div>
        )}
      </div>

      {/* 비밀번호 입력창(매출관리 잠금 화면과 같은 방식) */}
      {askPw && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={() => busy !== "exec" && setAskPw(false)}>
          <div className="w-full max-w-[380px] bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-red-600 px-6 py-4 text-white">
              <div className="text-[16px] font-black">{company} 초기화</div>
              <div className="text-[12px] text-white/80 mt-0.5">초기화 비밀번호를 입력하면 바로 삭제가 시작됩니다</div>
            </div>
            <div className="px-6 py-5 space-y-3">
              <input type="password" autoFocus value={execPw} onChange={(e) => setExecPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runExecute()}
                placeholder="초기화 비밀번호" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-[15px] outline-none focus:border-red-500 text-center tracking-widest" />
              {execErr && <div className="text-[12.5px] font-semibold text-red-600 text-center">{execErr}</div>}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setAskPw(false)} disabled={busy === "exec"} className="py-3 rounded-xl border border-gray-300 text-[14px] font-bold text-gray-700">취소</button>
                <button onClick={runExecute} disabled={busy === "exec"} className="py-3 rounded-xl bg-red-600 text-white text-[14px] font-bold disabled:opacity-60">{busy === "exec" ? "삭제 중…" : "초기화"}</button>
              </div>
              {sel && <div className="text-[11.5px] text-gray-500 text-center">삭제 대상: {preview?.total?.toLocaleString() || 0}건 · 첨부파일 {preview?.files || 0}개</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
