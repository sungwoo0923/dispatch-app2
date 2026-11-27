// ======================= src/execPinApi.js =======================
// 🔐 2026-11-27 인사이트(모바일) · 지입차관리 "완전 삭제" PIN — 서버 함수 부르기 + 숫자 패드 상태(useExecPinPad)
//  · PIN 은 서버(functions/execPin.js)에만 있고 서버가 확인 · 잠금(5번 틀리면 10 → 30 → 60분)
//  · 예전 기기 PIN(localStorage exec_intel_pin_v1)은 화면이 열릴 때 지운다 · 서버에 PIN 이 없으면 처음 들어갈 때 새로 정한다
//  · 잊으면: 관리자메뉴 › 회원 관리 › (직원) 회원 관리 창 › [인사이트 PIN 초기화] — 같은 회사 마스터 · 관리자 · 최고관리자
import React from "react";
import { auth, FUNCTIONS_BASE } from "./firebase";
import { fetchCaller } from "./claimsSync";
import { EXEC_PIN_LEN, LEGACY_PIN_KEYS, pinProblem, isNetErr, verifyMessage, lockMinutesLeft } from "./execPinCore";

const call0 = fetchCaller(FUNCTIONS_BASE, () => auth.currentUser);
const NET_MSG = "서버에 연결하지 못했어요. 인터넷을 확인하고 다시 해 주세요";
const call = async (name, data) => { try { return await call0(name, data || {}); } catch (e) { if (isNetErr(e)) { const x = new Error(NET_MSG); x.net = true; throw x; } throw e; } };

export const execPinApi = {
  status: () => call("execPinStatus", {}),
  verify: (pin) => call("execPinVerify", { pin }),
  set: (newPin, currentPin = "") => call("execPinSet", { newPin, currentPin }),
  reset: (uid) => call("execPinReset", { uid }),
};

export function clearLegacyExecPin() {
  LEGACY_PIN_KEYS.forEach((k) => { try { localStorage.removeItem(k); } catch { /* 무시 */ } });
}

// 숫자 패드 상태 — phase: loading · netError · notStaff · verify · setup1 · setup2
//  onVerified: 서버가 맞다고 했을 때(또는 처음 정하기가 끝났을 때)
export function useExecPinPad({ onVerified, length = EXEC_PIN_LEN }) {
  const [phase, setPhase] = React.useState("loading");
  const [entered, setEntered] = React.useState("");
  const [firstPin, setFirstPin] = React.useState("");
  const [error, setError] = React.useState("");
  const [info, setInfo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [lockUntil, setLockUntil] = React.useState(0);
  const [animKey, setAnimKey] = React.useState(0);
  const [, tick] = React.useState(0);
  const done = React.useRef(onVerified);
  done.current = onVerified;

  const load = React.useCallback(async () => {
    setPhase("loading"); setError(""); setInfo("");
    try {
      const s = await execPinApi.status();
      if (!s?.staff) { setPhase("notStaff"); return; }
      setLockUntil(Number(s.lockUntil) || 0);
      setPhase(s.hasPin ? "verify" : "setup1");
      if (!s.hasPin) setInfo("처음이라 PIN 을 새로 정해요. 어느 기기에서나 같은 번호를 써요");
    } catch (e) { setError(e?.message || NET_MSG); setPhase("netError"); }
  }, []);
  React.useEffect(() => { clearLegacyExecPin(); load(); }, [load]);
  // 잠긴 동안 남은 분을 새로 그린다
  React.useEffect(() => {
    if (!lockUntil) return undefined;
    const t = setInterval(() => { if (lockUntil <= Date.now()) { setLockUntil(0); setError(""); } else tick((n) => n + 1); }, 15000);
    return () => clearInterval(t);
  }, [lockUntil]);

  const locked = lockMinutesLeft(lockUntil);
  const shake = (msg) => { setError(msg); setAnimKey((k) => k + 1); setEntered(""); };

  const submit = async (pin) => {
    if (phase === "verify") {
      setBusy(true); setError("");
      try {
        const r = await execPinApi.verify(pin);
        if (r?.ok) { setEntered(""); done.current?.(); return; }
        if (r?.needSet) { setPhase("setup1"); setInfo("PIN 이 초기화됐어요. 새로 정해 주세요"); setEntered(""); return; }
        if (r?.lockUntil) setLockUntil(Number(r.lockUntil));
        shake(verifyMessage(r));
      } catch (e) { shake(e?.message || NET_MSG); } finally { setBusy(false); }
    } else if (phase === "setup1") {
      const p = pinProblem(pin);
      if (p) { shake(p); return; }
      setFirstPin(pin); setEntered(""); setError(""); setInfo(""); setPhase("setup2");
    } else if (phase === "setup2") {
      if (pin !== firstPin) { setFirstPin(""); setPhase("setup1"); shake("두 번 누른 번호가 달라요. 처음부터 다시 해 주세요"); return; }
      setBusy(true); setError("");
      try { await execPinApi.set(pin); setEntered(""); done.current?.(); }
      catch (e) { setFirstPin(""); setPhase(/맞지 않|잠겼/.test(String(e?.message)) ? "verify" : "setup1"); shake(e?.message || NET_MSG); }
      finally { setBusy(false); }
    }
  };

  const press = (d) => {
    if (busy || locked || !["verify", "setup1", "setup2"].includes(phase)) return;
    if (d === "back") { setEntered((p) => p.slice(0, -1)); return; }
    if (entered.length >= length) return;
    const next = entered + d;
    setEntered(next);
    if (next.length === length) setTimeout(() => submit(next), 150);
  };

  const lockMsg = locked ? `여러 번 틀려 잠겼어요. ${locked}분 뒤 다시 해 주세요` : "";
  return { phase, entered, error: error || lockMsg, info, busy, locked, animKey, length, press, retry: load };
}

// 화면 글(제목 · 설명) — 두 화면이 같은 말을 쓴다
export function execPinTexts(phase, { verifyTitle = "보안 인증", length = EXEC_PIN_LEN } = {}) {
  return {
    loading: ["확인하는 중", "잠시만 기다려 주세요"],
    netError: ["연결이 안 돼요", "인터넷을 확인하고 [다시 시도]를 눌러 주세요"],
    notStaff: ["쓸 수 없는 계정이에요", "승인된 직원 계정만 쓸 수 있어요"],
    verify: [verifyTitle, `${length}자리 PIN 을 눌러 주세요`],
    setup1: ["PIN 정하기", `쓸 ${length}자리 번호를 눌러 주세요`],
    setup2: ["한 번 더", "같은 번호를 한 번 더 눌러 주세요"],
  }[phase] || ["", ""];
}
export const EXEC_PIN_FORGOT = "PIN 을 잊었으면 회사 마스터 · 관리자에게 초기화를 요청하세요";
