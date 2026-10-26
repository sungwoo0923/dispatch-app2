// ======================= src/GsheetMinePanel.jsx =======================
// ⭐ 내 오더만 구글시트로 보내기(2026-10-26 개편, 최고관리자 전용)
//  ① [켜기]를 누른 뒤 지정 계정으로 새로 등록한 오더는 "전송 대기"로 모인다(바로 보내지 않음 — 수기 작성자와 줄이 꼬이지 않게)
//  ② [구글시트로 전송]을 누르면 대기 오더를 한 번에 그 달 탭 · 같은 날짜 칸 맨 위에 넣고, 그날 순번을 1부터 다시 매긴다
//  ③ 전송된 오더는 그 뒤 프로그램에서 수정하면 시트의 그 줄도 수정, 삭제·배차취소하면 그 줄도 삭제된다
//  - 다른 사람이 적은 줄은 건드리지 않는다(숨겨진 오더ID 열로만 자기 줄을 찾음).
import React from "react";
import { auth, db, FUNCTIONS_BASE } from "./firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

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
const tsMs = (t) => (t?.toMillis ? t.toMillis() : typeof t === "number" ? t : 0);

// "내 오더" 표시가 붙은 오더(orders·dispatch) 실시간 목록
function useMineOrders() {
  const [rows, setRows] = React.useState({ orders: [], dispatch: [] });
  React.useEffect(() => {
    const unsubs = ["orders", "dispatch"].map((c) => onSnapshot(query(collection(db, c), where("_gsheetMine", "==", true)),
      (snap) => setRows((prev) => ({ ...prev, [c]: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })), () => {}));
    return () => unsubs.forEach((u) => u());
  }, []);
  return [...rows.orders, ...rows.dispatch];
}

export default function GsheetMinePanel() {
  const [st, setSt] = React.useState(null);
  const [email, setEmail] = React.useState(auth.currentUser?.email || "");
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const [result, setResult] = React.useState(null);
  const mine = useMineOrders();
  const isSent = (o) => o._gsheetMineSent || o._gsheetSync?.doc === o.id;
  const pending = mine.filter((o) => !isSent(o))
    .sort((a, b) => String(a.상차일 || "").localeCompare(String(b.상차일 || "")) || tsMs(a.createdAt) - tsMs(b.createdAt));
  const sentCount = mine.filter(isSent).length;

  const run = async (action) => {
    setBusy(action); setErr(""); if (action !== "status") setResult(null);
    try {
      const d = await callApi({ action, email });
      if (action === "send") { setResult(d); await callApi({ action: "status" }).then(setSt).catch(() => {}); }
      else { setSt(d); if (d.email && action === "status") setEmail(d.email); }
    } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };
  React.useEffect(() => { run("status"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const on = !!st?.enabled;
  return (
    <div className="space-y-4">
      <div className={CARD}>
        <div className="px-5 sm:px-6 py-5 border-b border-[#EEF1F6]">
          <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">GOOGLE SHEET</div>
          <div className="text-[18px] font-black text-[#0F1A30]">내 오더만 구글시트로 보내기</div>
          <div className="text-[13.5px] text-[#5B6B85] mt-1">
            켠 뒤 아래 계정으로 등록한 오더가 <b className="text-[#0F1A30]">전송 대기</b>로 모입니다. <b className="text-[#0F1A30]">[구글시트로 전송]</b>을 누르면 한 번에 그 날짜 칸 맨 위에 들어가고 순번이 다시 매겨집니다.
            전송된 오더는 이후 수정·삭제가 시트에도 그대로 반영됩니다.
          </div>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-4">
          {/* 상태 */}
          <div className={`flex items-center justify-between gap-4 px-5 py-4 rounded-2xl ${on ? "bg-[#0F1A30] text-white" : "bg-[#F5F8FD] border border-[#EDF1F7]"}`}>
            <div>
              <div className={`text-[12.5px] font-bold ${on ? "text-white/60" : "text-[#7A879C]"}`}>현재 상태</div>
              <div className="text-[20px] font-black">{st === null ? "확인 중…" : on ? "모으는 중" : "꺼짐"}</div>
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

          <div>
            <label className="block text-[12.5px] font-bold text-[#7A879C] mb-1.5">모을 계정(이 계정으로 등록한 오더만)</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={on}
              className="w-full h-11 px-3.5 rounded-xl border border-[#DCE3EE] text-[14.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10 disabled:bg-[#F5F8FD]" />
          </div>

          <div className="flex gap-2">
            {!on ? (
              <button onClick={() => run("enable")} disabled={!!busy || !email.trim()}
                className="flex-1 h-12 rounded-2xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50">
                {busy === "enable" ? "처리 중…" : "지금부터 모으기 켜기"}
              </button>
            ) : (
              <button onClick={() => { if (window.confirm("모으기를 끌까요?\n이미 전송된 오더는 계속 수정·삭제가 시트에 반영되고, 아직 전송 안 한 대기 오더는 그대로 남습니다.")) run("disable"); }} disabled={!!busy}
                className="flex-1 h-12 rounded-2xl border border-[#E3E8F0] text-[#0F1A30] text-[15px] font-black disabled:opacity-50">
                {busy === "disable" ? "처리 중…" : "모으기 끄기"}
              </button>
            )}
          </div>
          {err && <div className="text-[13px] font-bold text-[#0F1A30]">⚠ {err}</div>}
        </div>
      </div>

      {/* 전송 대기 */}
      <div className={CARD}>
        <div className="px-5 py-4 border-b border-[#EEF1F6] flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">PENDING</div>
            <div className="text-[18px] font-black text-[#0F1A30]">전송 대기 <span className="tabular-nums">{pending.length}</span>건 <span className="text-[13px] font-bold text-[#7A879C]">· 전송 완료 {sentCount}건</span></div>
          </div>
          <button
            onClick={() => { if (window.confirm(`대기 중인 오더 ${pending.length}건을 구글시트로 보낼까요?\n(각 날짜 칸 맨 위에 들어가고 그날 순번이 다시 매겨집니다)`)) run("send"); }}
            disabled={!!busy || pending.length === 0}
            className="h-12 px-6 w-full sm:w-auto rounded-2xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-40 shadow-[0_8px_18px_rgba(15,26,48,0.25)]">
            {busy === "send" ? "전송 중…" : `구글시트로 전송 (${pending.length}건)`}
          </button>
        </div>
        {result && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-2xl bg-[#F5F8FD] border border-[#EDF1F7] text-[13.5px] text-[#0F1A30]">
            <b>{result.sent}건 전송 완료</b>{result.failed?.length ? ` · 실패 ${result.failed.length}건(다시 누르면 재시도)` : ""}
            {result.failed?.length > 0 && <div className="mt-1 text-[12px] text-[#5B6B85]">{result.failed.join(" / ")}</div>}
          </div>
        )}
        <div className="p-4">
          {pending.length === 0 ? (
            <div className="px-5 py-8 rounded-2xl border border-dashed border-[#DCE3EE] text-center text-[13.5px] text-[#9AA9C3]">보낼 오더가 없습니다</div>
          ) : (
            <div className="rounded-2xl border border-[#E3E8F0] overflow-hidden">
              {pending.map((o, i) => (
                <div key={o.id} className={`grid grid-cols-[86px_minmax(0,1fr)] sm:grid-cols-[110px_minmax(0,1fr)_minmax(0,1.4fr)_110px] gap-x-3 gap-y-0.5 items-center px-4 py-3 text-[13.5px] ${i > 0 ? "border-t border-[#EEF1F6]" : ""}`}>
                  <span className="font-extrabold text-[#0F1A30] tabular-nums">{o.상차일 || "-"}</span>
                  <span className="font-bold text-[#0F1A30] truncate">{o.거래처명 || "-"}</span>
                  <span className="text-[#3A4A66] truncate col-start-2 sm:col-start-auto">{o.상차지명 || "-"} → {o.하차지명 || "-"}</span>
                  <span className="text-[#7A879C] font-semibold col-start-2 sm:col-start-auto sm:text-right">{o.차량번호 || o.배차상태 || ""}</span>
                </div>
              ))}
            </div>
          )}
          <ul className="mt-4 text-[12.5px] text-[#5B6B85] leading-relaxed list-disc pl-5">
            <li>모으기를 켜기 전 오더, 다른 사람이 등록한 오더, 엑셀·구글시트 가져오기 오더는 모으지 않습니다.</li>
            <li>전송 전에 삭제한 오더는 보내지 않습니다. 전송 후 삭제·배차취소하면 시트에서도 지워지고 그날 순번이 다시 매겨집니다.</li>
            <li>시트의 줄은 맨 오른쪽 숨겨진 "오더ID" 열로 찾습니다 — 이 열은 지우지 말아 주세요.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
