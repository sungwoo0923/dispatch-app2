// ======================= src/GsheetMinePanel.jsx =======================
// ⭐ 내 오더만 구글시트로 보내기(2026-10-26, 최고관리자 전용)
//  - 전체 연결은 꺼둔 채(시트는 다른 사람이 손으로 작성), 지정한 계정이 "켠 시각 이후 새로 등록한" 오더만
//    시트의 월별 탭 · 같은 날짜 칸 맨 위에 넣는다. 그 오더를 나중에 수정·배차·삭제하면 시트의 그 줄도 같이 바뀐다.
//  - 다른 사람이 적은 줄은 건드리지 않는다(오더ID 열로만 자기 줄을 찾음).
import React from "react";
import { auth, FUNCTIONS_BASE } from "./firebase";

const SERVICE_EMAIL = "dispatch-app-9b92f@appspot.gserviceaccount.com";

async function callApi(body) {
  const token = await auth.currentUser?.getIdToken();
  let res;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/gsheetMine`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("서버 응답을 받지 못했습니다. 서버 배포 여부를 확인하거나 잠시 후 다시 시도해 주세요.");
  }
  let data = {};
  try { data = await res.json(); } catch { /* 무시 */ }
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

const CARD = "bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]";
const fmt = (ms) => (ms ? new Date(ms).toLocaleString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }) : "-");

export default function GsheetMinePanel() {
  const [st, setSt] = React.useState(null);
  const [email, setEmail] = React.useState(auth.currentUser?.email || "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  const run = async (action) => {
    setBusy(true); setErr("");
    try {
      const d = await callApi({ action, email });
      setSt(d);
      if (d.email && action === "status") setEmail(d.email);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  React.useEffect(() => { run("status"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const on = !!st?.enabled;
  return (
    <div className={CARD}>
      <div className="px-6 py-5 border-b border-[#EEF1F6]">
        <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">GOOGLE SHEET</div>
        <div className="text-[18px] font-black text-[#0F1A30]">내 오더만 구글시트로 보내기</div>
        <div className="text-[13.5px] text-[#5B6B85] mt-1">
          켠 시각 이후 아래 계정으로 <b className="text-[#0F1A30]">새로 등록한 오더만</b> 시트의 월별 탭 · 같은 날짜 칸 맨 위에 들어갑니다.
          다른 사람이 손으로 적은 줄은 건드리지 않습니다.
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* 상태 */}
        <div className={`flex items-center justify-between gap-4 px-5 py-4 rounded-2xl ${on ? "bg-[#0F1A30] text-white" : "bg-[#F5F8FD] border border-[#EDF1F7]"}`}>
          <div>
            <div className={`text-[12.5px] font-bold ${on ? "text-white/60" : "text-[#7A879C]"}`}>현재 상태</div>
            <div className="text-[20px] font-black">{st === null ? "확인 중…" : on ? "보내는 중" : "꺼짐"}</div>
            {on && <div className="text-[13px] text-white/75 mt-0.5">{st.email} · {fmt(st.since)}부터 등록한 오더</div>}
          </div>
          {st?.sheetUrl && (
            <a href={st.sheetUrl} target="_blank" rel="noreferrer"
              className={`h-10 px-4 inline-flex items-center rounded-xl text-[13px] font-extrabold ${on ? "bg-white text-[#0F1A30]" : "border border-[#E3E8F0] bg-white text-[#0F1A30]"}`}>시트 열기</a>
          )}
        </div>

        {st && st.sheetOk === false && (
          <div className="px-5 py-4 rounded-2xl border border-[#0F1A30] text-[13.5px] text-[#0F1A30]">
            <b>시트에 접근할 수 없습니다.</b> 시트 [공유]에 <b className="select-all">{SERVICE_EMAIL}</b> 를 <b>편집자</b>로 추가해 주세요.
            <div className="text-[12px] text-[#7A879C] mt-1">{st.sheetError}</div>
          </div>
        )}

        {/* 계정 */}
        <div>
          <label className="block text-[12.5px] font-bold text-[#7A879C] mb-1.5">보낼 계정(이 계정으로 등록한 오더만)</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={on}
            className="w-full h-11 px-3.5 rounded-xl border border-[#DCE3EE] text-[14.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10 disabled:bg-[#F5F8FD]" />
        </div>

        <div className="flex gap-2">
          {!on ? (
            <button onClick={() => run("enable")} disabled={busy || !email.trim()}
              className="flex-1 h-12 rounded-2xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50">
              {busy ? "처리 중…" : "지금부터 보내기 켜기"}
            </button>
          ) : (
            <button onClick={() => { if (window.confirm("보내기를 끌까요? 이미 시트에 들어간 줄은 그대로 남습니다.")) run("disable"); }} disabled={busy}
              className="flex-1 h-12 rounded-2xl border border-[#E3E8F0] text-[#0F1A30] text-[15px] font-black disabled:opacity-50">
              {busy ? "처리 중…" : "보내기 끄기"}
            </button>
          )}
        </div>
        {err && <div className="text-[13px] font-bold text-[#0F1A30]">⚠ {err}</div>}

        <ul className="text-[12.5px] text-[#5B6B85] leading-relaxed list-disc pl-5">
          <li>켜기 전에 등록돼 있던 오더, 다른 사람이 등록한 오더, 엑셀·구글시트 가져오기 오더는 보내지 않습니다.</li>
          <li>보낸 오더를 나중에 수정·배차하면 시트의 그 줄도 같이 바뀌고, 삭제·배차취소하면 그 줄이 지워집니다.</li>
          <li>시트의 줄은 맨 오른쪽 숨겨진 "오더ID" 열로 찾습니다 — 이 열은 지우지 말아 주세요.</li>
        </ul>
      </div>
    </div>
  );
}
