// ======================= src/UserSecurity.jsx =======================
// 🔐 2026-11-14 모든 계정 로그인 보안 — 2차 인증(선택)
//  · 최고관리자 · 부관리자는 지금처럼 필수(src/AdminGate.jsx). 그 밖의 계정은 본인이 켤 때만
//  · 방식: 숫자 8자리 PIN(PinPad) 또는 화면 키패드(영문 · 숫자 8자 이상, 최고관리자와 같은 SecureKeypad)
//  · 가입할 때 고른다(Signup — users.mfaAsk { answer, at }). 이미 쓰는 계정은 로그인했을 때 한 번 묻는다(MfaAskModal)
//  · [사용 안 함]을 고르면 닫히고 30일 동안은 다시 묻지 않는다 → 30일 뒤 로그인하면 한 번 더 묻는다
//  · 언제든 [내 정보 › 로그인 · 보안](PC) · [설정 › 계정 › 로그인 · 보안](모바일)에서 켜고 끄고 바꾼다(SecurityPanel)
//  · 서버: functions/pnkMfa.js(일반 계정 부분) — 비밀번호는 서버에만(해시)
//  ✂ 2026-11-14 얼굴(Face ID) · 지문 로그인은 사용자 요청으로 전부 뺐다(로그인 화면 · 설정 · 로그인 뒤 권유 · 관리자 바로 로그인)
import { isTMUser } from "./staffFilter"; // 🧑‍💻 2026-11-24
import React from "react";
import { createPortal } from "react-dom";
import { auth, db, FUNCTIONS_BASE } from "./firebase";
import { doc, setDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import { fetchCaller } from "./claimsSync";
import SecureKeypad, { adminDeviceId } from "./SecureKeypad";
import { markAdminGatePassed, adminAuthTime } from "./AdminGate";

const call0 = fetchCaller(FUNCTIONS_BASE, () => auth.currentUser);
// 🛠 2026-11-14 서버에 닿지 못하면(아이폰 사파리 "Load failed" · 크롬 "Failed to fetch") 알아볼 수 있는 말로 — 서버 기능이 아직 안 올라갔거나 인터넷이 끊긴 경우
const netErr = (e) => /load failed|failed to fetch|networkerror|network request failed|요청 실패\((404|5\d\d)\)/i.test(String(e?.message || e));
const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { if (netErr(e)) throw new Error("서버에 연결하지 못했어요. 이 기능의 서버가 아직 준비되지 않았거나 인터넷이 불안정해요. 잠시 뒤 다시 해 주세요."); throw e; } };
const call = guard(call0);
export const mfaCall = (data) => call("pnkMfa", { app: "logis", dev: adminDeviceId(), ...data });

export const ASK_AGAIN_MS = 30 * 86400e3; // [사용 안 함] 뒤 다시 묻기까지
const NAVY = "#1B2B4B";
export const MFA_KIND_LABEL = { pin: "숫자 8자리 PIN", keypad: "화면 키패드(영문 · 숫자 8자 이상)" };

// ─────────────────────────── 숫자 8자리 PIN ───────────────────────────
export function PinPad({ value = "", onChange, onSubmit, length = 8, disabled = false, submitLabel = "확인", autoSubmit = true }) {
  const val = React.useRef(value);
  val.current = value;
  // 누를 때마다 숫자 자리를 섞지 않는다(배치가 바뀌면 손에 익지 않는다) — 대신 넣은 숫자는 ● 로만
  const put = (d) => {
    if (disabled || val.current.length >= length) return;
    const nv = val.current + d;
    onChange?.(nv);
    if (autoSubmit && nv.length === length) setTimeout(() => onSubmit?.(nv), 120);
  };
  const del = () => { if (!disabled) onChange?.(val.current.slice(0, -1)); };
  const fns = React.useRef({});
  fns.current = { put, del, submit: () => { if (val.current.length === length) onSubmit?.(val.current); } };
  React.useEffect(() => {
    const h = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); fns.current.put(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); fns.current.del(); }
      else if (e.key === "Enter") { e.preventDefault(); fns.current.submit(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const key = "h-14 rounded-2xl bg-white border border-[#DCE3EE] text-[22px] font-black text-[#1B2B4B] active:bg-[#EEF3FB] hover:bg-[#F5F8FD] disabled:opacity-50 select-none";
  return (
    <div data-pin-pad className={disabled ? "opacity-60" : ""}>
      <div className="flex items-center justify-center gap-2.5 h-12" aria-label={`${value.length}자리 입력함`}>
        {Array.from({ length }).map((_, i) => (
          <span key={i} className="w-3.5 h-3.5 rounded-full border-2 box-border" style={{ background: i < value.length ? NAVY : "transparent", borderColor: i < value.length ? NAVY : "#C9D3E3" }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} type="button" disabled={disabled} onClick={() => put(d)} className={key} data-key={d}>{d}</button>)}
        <button type="button" disabled={disabled} onClick={() => onChange?.("")} className={`${key} text-[13px]`}>전체 지우기</button>
        <button type="button" disabled={disabled} onClick={() => put("0")} className={key} data-key="0">0</button>
        <button type="button" disabled={disabled} onClick={del} className={`${key} text-[13px]`} aria-label="지우기">지우기</button>
      </div>
      {!autoSubmit && (
        <button type="button" disabled={disabled || value.length !== length} onClick={() => onSubmit?.(value)} className="mt-2 w-full h-12 rounded-xl bg-[#1B2B4B] text-white text-[14.5px] font-black disabled:bg-[#C9D3E3]">{submitLabel}</button>
      )}
    </div>
  );
}

// 🛠 2026-11-14 켜기 확인 — 예전 서버(배포 전)는 저장하지 않고 "ok"만 돌려줘, 켠 줄 알았는데 다음 로그인 때 또 물어봤다
async function setupChecked(v) {
  const r = await mfaCall({ action: "setup", ...v });
  if (r?.opt !== true) throw new Error("서버가 아직 준비되지 않아 2차 인증을 저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
  return r;
}

// 켜는 그 순간 이 로그인은 이미 확인한 것으로(켜자마자 2차 인증 화면이 뜨지 않게) — 다른 기기 · 다음 로그인부터 묻는다
async function markHere(u) { if (u) markAdminGatePassed(u.uid, await adminAuthTime(u)); }

// 방식에 맞는 입력판
export function CodePad({ kind = "keypad", value, onChange, onSubmit, disabled, submitLabel }) {
  return kind === "pin"
    ? <PinPad value={value} onChange={onChange} onSubmit={onSubmit} disabled={disabled} submitLabel={submitLabel} />
    : <SecureKeypad value={value} onChange={onChange} onSubmit={onSubmit} disabled={disabled} submitLabel={submitLabel} />;
}

const KindPicker = ({ kind, setKind }) => (
  <div className="grid grid-cols-2 gap-2" data-kind-picker>
    {[["pin", "숫자 8자리", "PIN 번호판"], ["keypad", "키패드", "영문 · 숫자 8자 이상"]].map(([k, t, s]) => (
      <button key={k} type="button" onClick={() => setKind(k)}
        className={`rounded-xl border-2 px-3 py-2.5 text-left transition ${kind === k ? "border-[#1B2B4B] bg-[#F5F8FD]" : "border-[#E3E8F0] bg-white hover:border-[#9AB0D6]"}`}>
        <div className="flex items-center gap-1.5 text-[14px] font-black text-[#0F1A30]"><span className={`w-4 h-4 rounded-full border-2 grid place-items-center ${kind === k ? "border-[#1B2B4B]" : "border-[#C9D3E3]"}`}>{kind === k && <span className="w-2 h-2 rounded-full bg-[#1B2B4B]" />}</span>{t}</div>
        <div className="text-[11.5px] font-bold text-[#7A879C] mt-0.5 pl-[22px]">{s}</div>
      </button>
    ))}
  </div>
);

// 2차 비밀번호 만들기(두 번 넣기) — 켜기 · 방식 바꾸기 공용
function SetupFlow({ initialKind = "pin", onDone, onCancel, cancelLabel = "취소", run }) {
  const [kind, setKind] = React.useState(initialKind);
  const [first, setFirst] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => { setFirst(""); setCode(""); setMsg(""); }, [kind]);
  const submit = async (v) => {
    setMsg("");
    if (!first) { setFirst(v); setCode(""); return; }
    if (first !== v) { setMsg("두 번 넣은 값이 다릅니다. 처음부터 다시 정해 주세요."); setFirst(""); setCode(""); return; }
    setBusy(true);
    try { const r = await run({ kind, code: v }); setFirst(""); setCode(""); onDone?.(r, kind); }
    catch (e) { setMsg(e.message || "정하지 못했습니다"); setFirst(""); setCode(""); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-3" data-mfa-setup>
      {!first && <KindPicker kind={kind} setKind={setKind} />}
      <div className="text-center">
        <div className="text-[15.5px] font-black text-[#1B2B4B]">{first ? "한 번 더 넣어 주세요" : kind === "pin" ? "숫자 8자리를 정해 주세요" : "2차 비밀번호를 정해 주세요"}</div>
        <div className="text-[12px] text-[#7A879C] mt-0.5">{first ? "방금 정한 값을 똑같이 넣어 주세요" : kind === "pin" ? "같은 숫자 반복 · 연속 숫자(12345678)는 쓸 수 없습니다" : "영문 · 숫자 8자 이상 · 로그인 비밀번호와 다르게"}</div>
      </div>
      <CodePad kind={kind} value={code} onChange={setCode} onSubmit={submit} disabled={busy} submitLabel={first ? "정하기" : "다음"} />
      {msg && <div className="text-[12.5px] font-semibold text-red-600 bg-red-50 rounded-xl px-3 py-2 text-center">{msg}</div>}
      {onCancel && <button type="button" onClick={onCancel} className="w-full text-[13px] font-bold text-[#7A879C] hover:text-[#1B2B4B] py-1">{cancelLabel}</button>}
    </div>
  );
}

// ─────────────────────────── 로그인 때 묻기 ───────────────────────────
// 물을 때인지 — 2차 인증을 이미 켰으면 묻지 않는다. 가입 때 [사용]을 골랐으면 바로 만들기 화면
export function mfaAskState(p) {
  if (!p || p.mfaOpt === true) return "";
  const a = p.mfaAsk || null;
  if (!a || !a.answer) return "ask";
  if (a.answer === "yes") return "setup"; // 가입할 때 사용을 골랐는데 아직 안 만든 계정
  const at = Number(a.at) || 0;
  return Date.now() - at >= ASK_AGAIN_MS ? "ask" : "";
}
export function MfaAskModal({ user, mode = "ask", onClose }) {
  const [step, setStep] = React.useState(mode === "setup" ? "setup" : "ask");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(null); // 켠 방식
  const decline = async () => {
    setBusy(true);
    try { await setDoc(doc(db, "users", user.uid), { mfaAsk: { answer: "no", at: Date.now() } }, { merge: true }); } catch { /* 다음 로그인 때 다시 묻는다 */ }
    setBusy(false); onClose?.();
  };
  return createPortal(
    <div className="fixed inset-0 z-[100001] bg-[#061832]/70 flex items-end sm:items-center justify-center sm:p-5" data-mfa-ask>
      <div className="w-full sm:max-w-[420px] max-h-[94vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="px-6 pt-6 pb-4" style={{ background: "linear-gradient(135deg,#0F1A30,#1B2B4B 60%,#2D4C82)" }}>
          <div className="w-11 h-11 rounded-2xl bg-white/12 grid place-items-center text-white mb-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4 6v6c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V6Z" /><path d="m9 12 2 2 4-4" /></svg>
          </div>
          <div className="text-[18px] font-black text-white">{done ? "2차 인증을 켰습니다" : step === "setup" ? "2차 인증 만들기" : "2차 인증을 사용할까요?"}</div>
          <div className="text-[12.5px] text-white/70 mt-1 leading-relaxed">{done ? "다음 로그인부터 비밀번호 다음에 2차 비밀번호를 확인합니다." : "비밀번호가 새어 나가도 다른 사람이 들어오지 못하게, 로그인할 때 2차 비밀번호를 한 번 더 확인합니다."}</div>
        </div>
        <div className="px-6 py-5">
          {done ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-4 py-3 text-[13px] text-[#3A4A66]">방식: <b className="text-[#0F1A30]">{MFA_KIND_LABEL[done]}</b><br />바꾸거나 끄려면 <b>로그인 · 보안</b> 메뉴에서 합니다.</div>
              <button type="button" onClick={onClose} className="w-full h-12 rounded-xl bg-[#1B2B4B] text-white text-[14.5px] font-black">시작하기</button>
            </div>
          ) : step === "setup" ? (
            <SetupFlow initialKind="pin" cancelLabel={mode === "setup" ? "다음에 하기(30일 뒤 다시 묻기)" : "뒤로"}
              onCancel={mode === "setup" ? decline : () => setStep("ask")}
              run={async (v) => { await markHere(user); return setupChecked(v); }}
              onDone={(_r, kind) => setDone(kind)} />
          ) : (
            <div className="space-y-2.5">
              {[["pin", "숫자 8자리 PIN", "은행 앱처럼 숫자판으로 빠르게"], ["keypad", "화면 키패드", "영문 · 숫자 8자 이상: 더 안전하게"]].map(([k, t, s]) => (
                <div key={k} className="flex items-center gap-3 rounded-2xl border border-[#E3E8F0] px-4 py-3">
                  <span className="w-9 h-9 rounded-xl bg-[#EEF3FB] text-[#1B2B4B] grid place-items-center text-[13px] font-black shrink-0">{k === "pin" ? "123" : "Aa"}</span>
                  <div className="min-w-0"><div className="text-[14px] font-black text-[#0F1A30]">{t}</div><div className="text-[12px] text-[#7A879C]">{s}</div></div>
                </div>
              ))}
              <button type="button" disabled={busy} onClick={() => setStep("setup")} className="w-full h-12 rounded-xl bg-[#1B2B4B] text-white text-[15px] font-black mt-1" data-mfa-yes>사용하기</button>
              <button type="button" disabled={busy} onClick={decline} className="w-full h-11 rounded-xl text-[13.5px] font-bold text-[#5B6B85] hover:bg-[#F5F8FD]" data-mfa-no>사용 안 함 · 비밀번호만 쓰기</button>
              <p className="text-[11.5px] text-[#9AA9C3] text-center leading-relaxed pt-1">사용 안 함을 고르면 30일 뒤에 한 번 더 여쭤봅니다.<br />언제든 <b className="text-[#5B6B85]">내 정보 › 로그인 · 보안</b>에서 켤 수 있습니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────── 로그인할 때 2차 인증(일반 계정) ───────────────────────────
export function UserLoginGate({ user, authTime, kind = "pin", inline = false, onCancel }) {
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [k, setK] = React.useState(kind);
  React.useEffect(() => { // 방식은 서버 기준으로 한 번 더 맞춘다
    let a = true;
    mfaCall({ action: "status" }).then((r) => { if (!a) return; if (r.required === false) markAdminGatePassed(user.uid, authTime); else if (r.kind) setK(r.kind); }).catch(() => {});
    return () => { a = false; };
  }, [user.uid, authTime]);
  const submit = async (v) => {
    setBusy(true); setMsg("");
    try { await mfaCall({ action: "verify", code: v }); markAdminGatePassed(user.uid, authTime); }
    catch (e) { setMsg(e.message || "확인하지 못했습니다"); setCode(""); }
    finally { setBusy(false); }
  };
  const body = (
    <div data-user-gate className={inline ? "" : "w-full bg-white rounded-3xl shadow-2xl px-5 pt-6 pb-5"}>
      <div className="text-center mb-1">
        <div className="text-[16.5px] font-black text-[#1B2B4B]">{k === "pin" ? "2차 인증 · PIN 8자리" : "2차 인증 · 2차 비밀번호"}</div>
        <div className="text-[12.5px] text-gray-500 mt-0.5">{user.email}</div>
      </div>
      <CodePad kind={k} value={code} onChange={setCode} onSubmit={submit} disabled={busy} submitLabel={busy ? "확인 중…" : "확인"} />
      {msg && <div className="mt-3 text-[12.5px] font-semibold text-red-600 bg-red-50 rounded-xl px-3 py-2 text-center">{msg}</div>}
      <p className="mt-3 text-[11.5px] text-[#9AA9C3] text-center leading-relaxed">2차 비밀번호를 잊으면 회사 관리자에게 초기화를 요청하세요.</p>
      {onCancel && <div className="text-center"><button type="button" onClick={onCancel} className="mt-1 text-[12.5px] font-bold text-[#9AA9C3] hover:text-[#0F1A30]">다른 계정으로 로그인</button></div>}
    </div>
  );
  if (inline) return body;
  return createPortal(
    <div className="fixed inset-0 z-[100002] overflow-y-auto" style={{ background: "linear-gradient(135deg, #061832 0%, #0B2554 50%, #0D2B66 100%)" }}>
      <div className="min-h-full flex items-center justify-center p-4"><div className="w-full max-w-[400px]">
        <div className="text-white/70 text-[12.5px] font-semibold tracking-[0.18em] mb-4 text-center">로그인 보안 확인</div>
        {body}
      </div></div>
    </div>,
    document.body,
  );
}

// ─────────────────────────── 로그인 · 보안 설정 ───────────────────────────
export function SecurityPanel({ user, isAdmin = false, Section }) {
  const uid = user?.uid || auth.currentUser?.uid;
  const [st, setSt] = React.useState(null); // 2차 인증 상태
  const [mode, setMode] = React.useState(""); // "" | setup | change | off
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState({ t: "", ok: false });
  const load = React.useCallback(() => {
    mfaCall({ action: "status" }).then(setSt).catch((e) => setSt({ error: e.message }));
  }, []);
  React.useEffect(() => { if (uid) load(); }, [uid, load]);
  const on = !!st?.required;
  const off = async (v) => {
    setBusy(true); setMsg({ t: "" });
    try { await mfaCall({ action: "off", code: v }); setMode(""); setCode(""); setMsg({ t: "2차 인증을 껐습니다. 30일 뒤 로그인할 때 다시 여쭤봅니다.", ok: true }); load(); }
    catch (e) { setMsg({ t: e.message || "끄지 못했습니다" }); setCode(""); } finally { setBusy(false); }
  };
  const [chOld, setChOld] = React.useState("");
  const S = Section || (({ title, desc, children }) => <div className="bg-white rounded-2xl border border-gray-200 p-5"><div className="text-[15.5px] font-black text-[#1B2B4B]">{title}</div>{desc && <div className="text-[12.5px] text-gray-500 mt-0.5 mb-3">{desc}</div>}{children}</div>);
  return (
    <>
      {!isAdmin && (
        <S title="2차 인증 (선택)" desc="켜 두면 로그인할 때 비밀번호 다음에 2차 비밀번호를 한 번 더 확인합니다. 숫자 8자리 PIN 또는 화면 키패드 중에서 고릅니다."
          right={st && !st.error && <span className={`shrink-0 px-2.5 py-1 rounded-full text-[12px] font-black ${on ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-[#F1F4F9] text-[#7A879C]"}`} data-mfa-state>{on ? "사용 중" : "사용 안 함"}</span>}>
          <div data-sec-mfa>
            {!st ? <div className="text-[13px] text-gray-500">확인하는 중…</div>
              : st.error ? <div className="text-[13px] text-red-600">{st.error}</div>
                : mode === "setup" ? <SetupFlow initialKind="pin" onCancel={() => setMode("")} run={async (v) => { await markHere(auth.currentUser); return setupChecked(v); }} onDone={(_r, k) => { setMode(""); setMsg({ t: `2차 인증을 켰습니다(${MFA_KIND_LABEL[k]}).`, ok: true }); load(); }} />
                  : mode === "off" ? (
                    <div className="space-y-2">
                      <div className="text-[13px] font-bold text-[#3A4A66] text-center">끄려면 지금 2차 비밀번호를 넣어 주세요</div>
                      <CodePad kind={st.kind} value={code} onChange={setCode} onSubmit={off} disabled={busy} submitLabel="끄기" />
                      <button type="button" onClick={() => { setMode(""); setCode(""); }} className="w-full text-[13px] font-bold text-[#7A879C] py-1">취소</button>
                    </div>
                  ) : mode === "change" ? (
                    chOld ? (
                      <SetupFlow initialKind={st.kind} onCancel={() => { setMode(""); setChOld(""); }} run={(v) => mfaCall({ action: "change", code: chOld, kind: v.kind, newCode: v.code })}
                        onDone={(_r, k) => { setMode(""); setChOld(""); setMsg({ t: `바꿨습니다(${MFA_KIND_LABEL[k]}).`, ok: true }); load(); }} />
                    ) : (
                      <div className="space-y-2">
                        <div className="text-[13px] font-bold text-[#3A4A66] text-center">지금 2차 비밀번호를 넣어 주세요</div>
                        <CodePad kind={st.kind} value={code} onChange={setCode} onSubmit={(v) => { setChOld(v); setCode(""); }} submitLabel="다음" />
                        <button type="button" onClick={() => { setMode(""); setCode(""); }} className="w-full text-[13px] font-bold text-[#7A879C] py-1">취소</button>
                      </div>
                    )
                  ) : on ? (
                    <div className="space-y-2.5">
                      <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3.5 py-2.5 text-[13px] text-[#3A4A66]">방식 · <b className="text-[#0F1A30]">{MFA_KIND_LABEL[st.kind]}</b></div>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => { setMode("change"); setMsg({ t: "" }); }} className="h-11 rounded-xl border border-[#1B2B4B]/30 text-[#1B2B4B] text-[13.5px] font-bold hover:bg-[#F5F8FD]">비밀번호 · 방식 바꾸기</button>
                        <button type="button" onClick={() => { setMode("off"); setMsg({ t: "" }); }} className="h-11 rounded-xl border border-red-200 text-red-600 text-[13.5px] font-bold hover:bg-red-50">2차 인증 끄기</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => { setMode("setup"); setMsg({ t: "" }); }} className="w-full h-12 rounded-xl bg-[#1B2B4B] text-white text-[14.5px] font-black hover:bg-[#243a60]" data-mfa-on>2차 인증 켜기</button>
                  )}
            {msg.t && <div className={`mt-2.5 text-[13px] font-semibold ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.t}</div>}
          </div>
        </S>
      )}

    </>
  );
}

// ─────────────────────────── 관리자메뉴 › 로그인 관리 — 2차 인증을 켠 직원 · 초기화 ───────────────────────────
//  직원이 2차 비밀번호를 잊으면 회사 관리자가 끈다(직원은 다음 로그인부터 비밀번호만 — 다시 켜려면 로그인 · 보안에서)
export function MfaResetPanel({ isTotalMaster = false, company = "" }) {
  const [list, setList] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => {
    const q = isTotalMaster ? query(collection(db, "users"), where("mfaOpt", "==", true)) : query(collection(db, "users"), where("companyName", "==", company), where("mfaOpt", "==", true));
    return onSnapshot(q, (sn) => setList(sn.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((u) => isTotalMaster || !isTMUser(u))), () => setList([])); // 🧑‍💻 회사 목록에 최고관리자 빼기
  }, [isTotalMaster, company]);
  const reset = async (u) => {
    if (!window.confirm(`${u.name || u.email} 님의 2차 인증을 초기화할까요?\n다음 로그인부터 비밀번호만으로 들어오고, 본인이 다시 켤 수 있습니다.`)) return;
    setBusy(u.uid); setMsg("");
    try { await mfaCall({ action: "userReset", uid: u.uid }); setMsg(`${u.name || u.email} 님의 2차 인증을 초기화했습니다.`); }
    catch (e) { setMsg(e.message || "초기화하지 못했습니다"); } finally { setBusy(""); }
  };
  return (
    <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-5" data-mfa-reset>
      <div className="text-[15.5px] font-black text-[#1B2B4B]">2차 인증 사용 직원</div>
      <div className="text-[12.5px] text-gray-500 mt-0.5 mb-3">2차 인증(선택)을 켠 직원입니다. 2차 비밀번호를 잊었다고 하면 [초기화]를 누르세요.</div>
      {list === null ? <div className="text-[13px] text-gray-500">불러오는 중…</div> : !list.length ? <div className="text-[13px] text-gray-500">아직 2차 인증을 켠 직원이 없습니다.</div> : (
        <div className="rounded-xl border border-[#E3E8F0] divide-y divide-[#F1F4F9]">
          {list.filter((u) => u.role !== "totalMaster").map((u) => (
            <div key={u.uid} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-black text-[#0F1A30] truncate">{u.name || "-"} <span className="text-[12px] font-bold text-[#7A879C]">{u.position || ""}</span></div>
                <div className="text-[12px] text-[#7A879C] truncate">{u.email}{isTotalMaster ? ` · ${u.companyName || ""}` : ""} · {MFA_KIND_LABEL[u.mfaKind === "keypad" ? "keypad" : "pin"]}</div>
              </div>
              <button type="button" disabled={busy === u.uid} onClick={() => reset(u)} className="shrink-0 h-8 px-3 rounded-lg border border-red-200 text-red-600 text-[12.5px] font-bold hover:bg-red-50 disabled:opacity-50">{busy === u.uid ? "초기화 중…" : "초기화"}</button>
            </div>
          ))}
        </div>
      )}
      {msg && <div className="mt-2 text-[13px] font-semibold text-[#1B2B4B]">{msg}</div>}
    </div>
  );
}
