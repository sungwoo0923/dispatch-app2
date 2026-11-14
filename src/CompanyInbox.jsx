// ======================= src/CompanyInbox.jsx =======================
// 📥 2026-11-14 정산관리 › 거래처정산 › 메일함 › 받은메일 — 회사 메일 계정(회사정보 › 메일 설정)의 받은편지함을 읽기 전용으로
//  서버: functions/companyMailInbox.js (IMAP) · 회사 관리자 · 경리만. 본문은 격리된 틀(iframe sandbox)에 보여 준다(스크립트 · 외부 동작 막음)
import React from "react";
import { auth, FUNCTIONS_BASE } from "./firebase";
import { fetchCaller } from "./claimsSync";
import { openMailSettings } from "./companyMail";

const call = fetchCaller(FUNCTIONS_BASE, () => auth.currentUser);
const inbox = (data) => call("companyMailInbox", data).catch((e) => {
  if (/load failed|failed to fetch|요청 실패\((404|5\d\d)\)/i.test(String(e?.message || ""))) throw new Error("서버에 연결하지 못했어요. 받은메일 서버 기능이 아직 준비되지 않았거나 인터넷이 불안정해요.");
  throw e;
});
const fmt = (ms) => { if (!ms) return ""; const d = new Date(ms + 9 * 3600e3); const t = new Date(Date.now() + 9 * 3600e3); const same = d.toISOString().slice(0, 10) === t.toISOString().slice(0, 10); return same ? d.toISOString().slice(11, 16) : d.toISOString().slice(5, 10).replace("-", "/"); };
const who = (list) => (list || []).map((x) => x.name || x.address).filter(Boolean).join(", ");

export default function CompanyInbox({ company = "" }) {
  const [items, setItems] = React.useState(null);
  const [next, setNext] = React.useState(0);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState(null);
  const [mail, setMail] = React.useState(null);
  const [mailErr, setMailErr] = React.useState("");
  const [account, setAccount] = React.useState("");
  const load = React.useCallback(async (before = 0) => {
    setBusy(true); setErr("");
    try {
      const r = await inbox({ action: "list", limit: 40, before, company });
      setItems((cur) => (before ? [...(cur || []), ...r.items] : r.items)); setNext(r.next || 0); setAccount(r.account || "");
    } catch (e) { setErr(e.message || "받은메일을 불러오지 못했어요"); if (!before) setItems([]); }
    finally { setBusy(false); }
  }, [company]);
  React.useEffect(() => { load(0); }, [load]);
  const open = async (m) => {
    setSel(m.uid); setMail(null); setMailErr("");
    try { setMail(await inbox({ action: "get", uid: m.uid, company })); } catch (e) { setMailErr(e.message || "메일을 열지 못했어요"); }
  };
  const k = q.trim().toLowerCase();
  const shown = (items || []).filter((m) => !k || `${m.subject} ${who(m.from)}`.toLowerCase().includes(k));
  const notConfigured = /메일 설정에서/.test(err);
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start" data-company-inbox>
      <div className="bg-white rounded-xl border border-[#E3E8F0] overflow-hidden min-w-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#EEF2F8] flex-wrap">
          <div className="mr-auto min-w-0">
            <div className="text-[15px] font-extrabold text-[#1B2B4B]">받은메일</div>
            <div className="text-[12px] text-[#7A89A3] truncate">{account ? `${account} 받은편지함 · 읽기 전용` : "회사 메일 계정의 받은편지함"}</div>
          </div>
          <input autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="보낸 사람 · 제목 검색" className="border border-[#D5DDEA] rounded-xl px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] w-full sm:w-[220px]" />
          <button type="button" onClick={() => load(0)} disabled={busy} className="h-9 px-3 rounded-xl border border-[#D5DDEA] text-[13px] font-bold text-[#1B2B4B] disabled:opacity-50">{busy ? "불러오는 중…" : "새로고침"}</button>
        </div>
        {err && (
          <div className="m-4 rounded-xl bg-[#FFF5F4] border border-[#F3D3CF] px-4 py-3 text-[13.5px] text-[#7A1F15] leading-relaxed">
            {err}
            {notConfigured && <button type="button" onClick={openMailSettings} className="ml-2 underline font-black">메일 설정 열기</button>}
          </div>
        )}
        {items === null ? <div className="py-16 text-center text-[13.5px] text-[#7A89A3]">받은메일을 불러오는 중…</div>
          : !shown.length && !err ? <div className="py-16 text-center text-[13.5px] text-[#7A89A3]">받은메일이 없어요</div> : (
            <div className="divide-y divide-[#F1F4F9] max-h-[calc(100vh-330px)] overflow-y-auto">
              {shown.map((m) => (
                <button key={m.uid} type="button" onClick={() => open(m)} className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-[#F8FAFD] ${sel === m.uid ? "bg-[#EEF3FB]" : ""}`}>
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${m.seen ? "bg-transparent" : "bg-[#2D4C82]"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><span className={`text-[13.5px] truncate ${m.seen ? "font-semibold text-[#3A4A66]" : "font-black text-[#0F1A30]"}`}>{who(m.from) || "(보낸 사람 없음)"}</span><span className="ml-auto text-[12px] text-[#9AA9C3] tabular-nums shrink-0">{fmt(m.date)}</span></div>
                    <div className={`text-[13.5px] truncate ${m.seen ? "text-[#5B6B85]" : "text-[#0F1A30] font-bold"}`}>{m.attach ? "📎 " : ""}{m.subject}</div>
                  </div>
                </button>
              ))}
              {next > 0 && <div className="p-3 text-center"><button type="button" onClick={() => load(next)} disabled={busy} className="h-9 px-4 rounded-lg border border-[#DCE3EE] text-[13px] font-bold text-[#3A4A66]">{busy ? "불러오는 중…" : "이전 메일 더 보기"}</button></div>}
            </div>
          )}
      </div>
      <div className="bg-white rounded-xl border border-[#E3E8F0] overflow-hidden min-w-0 xl:sticky xl:top-3">
        {!sel ? <div className="py-20 text-center text-[13.5px] text-[#7A89A3]">왼쪽에서 메일을 고르면 여기에 열려요</div>
          : mailErr ? <div className="p-6 text-[13.5px] text-[#B4342A]">{mailErr}</div>
            : !mail ? <div className="py-20 text-center text-[13.5px] text-[#7A89A3]">여는 중…</div> : (
              <div>
                <div className="px-5 py-4 border-b border-[#EEF2F8]">
                  <div className="text-[16.5px] font-black text-[#0F1A30] leading-snug">{mail.subject || "(제목 없음)"}</div>
                  <div className="mt-1.5 text-[13px] text-[#3A4A66]"><b>보낸 사람</b> {mail.from.map((x) => (x.name ? `${x.name} <${x.address}>` : x.address)).join(", ")}</div>
                  <div className="text-[12.5px] text-[#7A89A3]"><b>받는 사람</b> {who(mail.to)}{mail.cc?.length ? ` · 참조 ${who(mail.cc)}` : ""} · {mail.date ? new Date(mail.date).toLocaleString("ko-KR") : ""}</div>
                  {mail.attachments?.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{mail.attachments.map((a, i) => <span key={i} className="px-2 py-1 rounded-lg bg-[#F5F8FD] border border-[#DCE3EE] text-[12px] font-bold text-[#1B2B4B]">📎 {a.filename} <span className="text-[#9AA9C3]">{Math.max(1, Math.round(a.size / 1024))}KB</span></span>)}<span className="text-[11.5px] text-[#9AA9C3] self-center">첨부 내려받기는 메일 사이트에서 해 주세요</span></div>}
                </div>
                {mail.html
                  ? <iframe title="메일 본문" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={`<meta charset="utf-8"><base target="_blank"><style>body{font-family:-apple-system,'Noto Sans KR',sans-serif;font-size:14px;color:#1B2B4B;margin:16px;word-break:break-word}img{max-width:100%}</style>${mail.html}`} className="w-full h-[calc(100vh-360px)] min-h-[360px] border-0" />
                  : <pre className="px-5 py-4 whitespace-pre-wrap break-words text-[14px] text-[#1B2B4B] font-sans max-h-[calc(100vh-360px)] overflow-y-auto">{mail.text}</pre>}
              </div>
            )}
      </div>
    </div>
  );
}
