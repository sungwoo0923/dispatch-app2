// ======================= src/LoginManager.jsx =======================
// ⭐ 로그인 관리 화면(2026-10-22 요청) — PC·모바일 공용
//  - 내 로그인 기기 목록 + 기기별 "연결 끊기" + "다른 기기 모두 로그아웃"
//  - 비밀번호 변경(변경 후 다른 기기 자동 로그아웃 선택)
//  - 최근 로그인 기록(로그아웃·끊김 사유)
//  - AdminSessionsPanel: 관리자메뉴용 — 지금 로그인 중인 모든 계정(관리자는 자기 회사만) 보기·강제 로그아웃
import React from "react";
import { createPortal } from "react-dom";
import { auth, db, DEFAULT_COMPANY } from "./firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import {
  SESSIONS_COLL, KIND_LABEL, END_REASON_LABEL, getMySessionId, endSessions, sessionLastMs, timeAgo, getDeviceLabel,
} from "./loginSessions";

const tsMs = (t) => (t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : 0);
const fmt = (ms) => (ms ? new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");

const KindIcon = ({ kind, className = "" }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {kind === "mobile"
      ? <><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></>
      : <><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>}
  </svg>
);

// 화면 안에서 매번 새로 만들면 입력 중이던 비밀번호 칸이 지워지므로 바깥에 둔다
const Section = ({ title, desc, right, children }) => (
  <div className="bg-white rounded-2xl border border-gray-200 p-5">
    <div className="flex items-start gap-3 mb-3">
      <div className="flex-1 min-w-0">
        <div className="text-[15.5px] font-black text-[#1B2B4B]">{title}</div>
        {desc && <div className="text-[12.5px] text-gray-500 mt-0.5">{desc}</div>}
      </div>
      {right}
    </div>
    {children}
  </div>
);

function useMySessions(uid) {
  const [list, setList] = React.useState(null);
  React.useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(query(collection(db, SESSIONS_COLL), where("uid", "==", uid)),
      (snap) => setList(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setList([]));
  }, [uid]);
  return list;
}

function PasswordChange({ otherIds }) {
  const [cur, setCur] = React.useState("");
  const [pw1, setPw1] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [logoutOthers, setLogoutOthers] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState({ type: "", text: "" });
  const submit = async () => {
    if (!cur || !pw1 || !pw2) return setMsg({ type: "err", text: "모든 칸을 입력해 주세요." });
    if (pw1.length < 6) return setMsg({ type: "err", text: "새 비밀번호는 6자 이상이어야 합니다." });
    if (pw1 !== pw2) return setMsg({ type: "err", text: "새 비밀번호 확인이 일치하지 않습니다." });
    if (pw1 === cur) return setMsg({ type: "err", text: "현재 비밀번호와 다른 비밀번호를 입력해 주세요." });
    const user = auth.currentUser;
    if (!user?.email) return setMsg({ type: "err", text: "로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요." });
    setBusy(true); setMsg({ type: "", text: "" });
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, cur));
      await updatePassword(user, pw1);
      if (logoutOthers && otherIds.length) await endSessions(otherIds, "password", getDeviceLabel()).catch(() => {});
      setCur(""); setPw1(""); setPw2("");
      setMsg({ type: "ok", text: `비밀번호가 변경되었습니다.${logoutOthers && otherIds.length ? ` 다른 기기 ${otherIds.length}대는 로그아웃되었습니다.` : ""}` });
    } catch (e) {
      const code = e?.code || "";
      setMsg({
        type: "err",
        text: code === "auth/wrong-password" || code === "auth/invalid-credential" ? "현재 비밀번호가 올바르지 않습니다."
          : code === "auth/too-many-requests" ? "시도가 너무 많습니다. 잠시 후 다시 해주세요."
            : code === "auth/weak-password" ? "비밀번호가 너무 쉽습니다. 6자 이상으로 다시 입력해 주세요."
              : `변경 실패: ${e?.message || e}`,
      });
    } finally {
      setBusy(false);
    }
  };
  const input = "w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-[#1B2B4B] bg-white";
  return (
    <div className="space-y-2.5">
      <input type="password" autoComplete="current-password" placeholder="현재 비밀번호" value={cur} onChange={(e) => setCur(e.target.value)} className={input} />
      <input type="password" autoComplete="new-password" placeholder="새 비밀번호 (6자 이상)" value={pw1} onChange={(e) => setPw1(e.target.value)} className={input} />
      <input type="password" autoComplete="new-password" placeholder="새 비밀번호 확인" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} className={input} />
      <label className="flex items-center gap-2 text-[13px] text-gray-700 font-semibold">
        <input type="checkbox" checked={logoutOthers} onChange={(e) => setLogoutOthers(e.target.checked)} className="w-4 h-4" />
        변경 후 다른 기기 모두 로그아웃
      </label>
      {msg.text && <div className={`text-[13px] font-semibold ${msg.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</div>}
      <button onClick={submit} disabled={busy} className="w-full py-3 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-bold hover:bg-[#243a60] disabled:opacity-60">
        {busy ? "변경 중…" : "비밀번호 변경"}
      </button>
    </div>
  );
}

export default function LoginManager({ user }) {
  const uid = user?.uid || auth.currentUser?.uid;
  const list = useMySessions(uid);
  const myId = getMySessionId();
  const [busyId, setBusyId] = React.useState(null);
  const active = (list || []).filter((s) => s.active !== false).sort((a, b) => (a.id === myId ? -1 : b.id === myId ? 1 : sessionLastMs(b) - sessionLastMs(a)));
  const others = active.filter((s) => s.id !== myId);
  const history = (list || []).filter((s) => s.active === false).sort((a, b) => tsMs(b.endedAt) - tsMs(a.endedAt)).slice(0, 10);

  const kick = async (ids) => {
    if (!ids.length) return;
    if (!window.confirm(ids.length > 1 ? `다른 기기 ${ids.length}대를 모두 로그아웃할까요?` : "이 기기의 로그인을 끊을까요?")) return;
    setBusyId(ids.length > 1 ? "all" : ids[0]);
    try { await endSessions(ids, "kicked", getDeviceLabel()); } catch (e) { alert(`연결 끊기 실패: ${e?.message || e}`); } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-4 text-gray-800">
      <Section
        title="로그인된 기기"
        desc="한 계정은 PC 1대 + 모바일 1대까지 동시에 로그인할 수 있습니다. 같은 종류 기기로 새로 로그인하면 기존 기기는 끊깁니다."
        right={others.length > 0 && (
          <button onClick={() => kick(others.map((s) => s.id))} disabled={busyId === "all"} className="shrink-0 px-3 py-2 rounded-xl border border-red-300 text-red-600 text-[12.5px] font-bold hover:bg-red-50 disabled:opacity-60">
            다른 기기 모두 로그아웃
          </button>
        )}
      >
        {list === null ? (
          <div className="text-[13px] text-gray-500 py-4 text-center">불러오는 중…</div>
        ) : active.length === 0 ? (
          <div className="text-[13px] text-gray-500 py-4 text-center">로그인 기록이 아직 없습니다. 다시 로그인하면 표시됩니다.</div>
        ) : (
          <div className="space-y-2">
            {active.map((s) => {
              const mine = s.id === myId;
              return (
                <div key={s.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${mine ? "border-[#1B2B4B]/30 bg-[#EEF3FB]" : "border-gray-200"}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${mine ? "bg-[#1B2B4B] text-white" : "bg-gray-100 text-gray-600"}`}><KindIcon kind={s.kind} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[14px] font-bold">{KIND_LABEL[s.kind] || "기기"}</span>
                      <span className="text-[13px] text-gray-600">{s.device}</span>
                      {mine && <span className="text-[11px] font-extrabold text-white bg-[#1B2B4B] rounded-full px-2 py-0.5">지금 이 기기</span>}
                    </div>
                    <div className="text-[12px] text-gray-500 mt-0.5">로그인 {fmt(tsMs(s.createdAt))} · 마지막 활동 {timeAgo(sessionLastMs(s))}</div>
                  </div>
                  {!mine && (
                    <button onClick={() => kick([s.id])} disabled={busyId === s.id} className="shrink-0 px-3 py-2 rounded-xl bg-red-500 text-white text-[12.5px] font-bold hover:bg-red-600 disabled:opacity-60">
                      {busyId === s.id ? "끊는 중…" : "연결 끊기"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="비밀번호 변경" desc="현재 비밀번호를 확인한 뒤 새 비밀번호로 바꿉니다.">
        <PasswordChange otherIds={others.map((s) => s.id)} />
      </Section>

      <Section title="최근 로그인 기록" desc="최근 끝난 로그인 10건 — 모르는 기기가 있으면 비밀번호를 바꿔주세요.">
        {history.length === 0 ? (
          <div className="text-[13px] text-gray-500 py-3 text-center">기록이 없습니다.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {history.map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-2.5">
                <KindIcon kind={s.kind} className="text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-gray-700 truncate">{KIND_LABEL[s.kind]} · {s.device}</div>
                  <div className="text-[12px] text-gray-500">{fmt(tsMs(s.createdAt))} ~ {fmt(tsMs(s.endedAt))}</div>
                </div>
                <span className="shrink-0 text-[11.5px] font-bold text-gray-600 bg-gray-100 rounded-full px-2.5 py-1">{END_REASON_LABEL[s.endReason] || "종료"}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// 화면 위에 띄우는 창 버전(PC 상단 메뉴·모바일 메뉴에서 연다)
export function LoginManagerModal({ user, onClose }) {
  // 메뉴 팝업 안에서 열어도 잘리지 않게 화면 맨 위(body)에 띄운다
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/45 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-[#F4F6FA] w-full sm:max-w-[560px] max-h-[94vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-[#1B2B4B] text-white px-5 py-4 flex items-center justify-between sm:rounded-t-2xl rounded-t-2xl">
          <div>
            <div className="text-[17px] font-black">로그인 관리</div>
            <div className="text-[12px] text-white/65">{user?.email || auth.currentUser?.email}</div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-[26px] leading-none px-2">×</button>
        </div>
        <div className="p-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
          <LoginManager user={user} />
        </div>
      </div>
    </div>
  , document.body);
}

// 관리자메뉴 — 지금 로그인 중인 계정 전체(관리자는 자기 회사만)
export function AdminSessionsPanel({ isTotalMaster, company, roleLabels = {} }) {
  const [list, setList] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(null);
  React.useEffect(() => onSnapshot(query(collection(db, SESSIONS_COLL), where("active", "==", true)),
    (snap) => setList(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([])), []);
  const myId = getMySessionId();
  const rows = (list || [])
    .filter((s) => isTotalMaster || (s.companyName || DEFAULT_COMPANY) === company)
    .filter((s) => !q || [s.name, s.email, s.companyName, s.device].some((v) => String(v || "").includes(q)))
    .sort((a, b) => sessionLastMs(b) - sessionLastMs(a));
  const kick = async (s) => {
    if (!window.confirm(`${s.name || s.email}님의 ${KIND_LABEL[s.kind]}(${s.device}) 로그인을 끊을까요?`)) return;
    setBusy(s.id);
    try { await endSessions([s.id], "admin", auth.currentUser?.email || ""); } catch (e) { alert(`실패: ${e?.message || e}`); } finally { setBusy(null); }
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
        <span className="text-[13px] font-semibold text-gray-600">지금 로그인 중 {rows.length}대 {isTotalMaster ? "(전체 회사)" : `(${company})`}</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 이메일 · 회사 검색" className="ml-auto h-[32px] px-3 rounded-lg text-[12.5px] border border-gray-300 outline-none focus:border-[#1B2B4B]" />
      </div>
      {list === null ? (
        <div className="text-[13px] text-gray-500 text-center py-16">불러오는 중…</div>
      ) : rows.length === 0 ? (
        <div className="text-[13px] text-gray-500 text-center py-16">로그인 중인 기기가 없습니다.</div>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#1B2B4B] text-white">
              {["회사명", "이름", "이메일", "권한", "기기", "로그인", "마지막 활동", ""].map((h) => <th key={h} className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-2 py-2.5 text-center text-gray-700">{s.companyName || "-"}</td>
                <td className="px-2 py-2.5 text-center font-semibold">{s.name || "-"}</td>
                <td className="px-2 py-2.5 text-center text-gray-500">{s.email}</td>
                <td className="px-2 py-2.5 text-center text-gray-500">{roleLabels[s.role] || s.role || "-"}</td>
                <td className="px-2 py-2.5 text-center whitespace-nowrap"><b>{KIND_LABEL[s.kind]}</b> <span className="text-gray-500">{s.device}</span></td>
                <td className="px-2 py-2.5 text-center text-gray-500 whitespace-nowrap">{fmt(tsMs(s.createdAt))}</td>
                <td className="px-2 py-2.5 text-center text-gray-500 whitespace-nowrap">{timeAgo(sessionLastMs(s))}</td>
                <td className="px-2 py-2.5 text-center">
                  {s.id === myId ? <span className="text-[11.5px] font-bold text-[#1B2B4B]">이 기기</span> : (
                    <button onClick={() => kick(s)} disabled={busy === s.id} className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-[12px] font-bold hover:bg-red-600 disabled:opacity-60">
                      {busy === s.id ? "끊는 중…" : "연결 끊기"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
