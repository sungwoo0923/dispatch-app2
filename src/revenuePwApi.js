// ======================= src/revenuePwApi.js =======================
// 🔐 2026-11-27 매출관리 비밀번호(회사 하나에 하나) — 서버 함수 부르기 + 잠금 화면 상태(useRevenuePw)
//  · 비밀번호는 서버(functions/revenuePw.js)에만 있고 서버가 확인 · 잠금(5번 틀리면 10 → 30 → 60분)
//  · 화면은 회사 문서의 revenuePassword 를 읽지도 쓰지도 않는다(예전 값은 서버가 처음 확인할 때 해시로 옮기고 지운다)
//  · 정하기 · 바꾸기: 회사 마스터 · 최고관리자 — 잊었으면 [잊었을 때 새로 정하기](지금 비밀번호 없이)
//  · 통과 표시는 예전처럼 sessionStorage "sales_ok"(모바일) · 화면 상태(PC) — 쓰는 곳: src/DispatchApp.jsx · src/mobile/MobileApp.jsx
import React from "react";
import { auth, FUNCTIONS_BASE } from "./firebase";
import { fetchCaller } from "./claimsSync";
import { isNetErr, lockMinutesLeft } from "./execPinCore";

const call0 = fetchCaller(FUNCTIONS_BASE, () => auth.currentUser);
const NET_MSG = "서버에 연결하지 못했어요. 인터넷을 확인하고 다시 해 주세요";
const call = async (name, data) => { try { return await call0(name, data || {}); } catch (e) { if (isNetErr(e)) { const x = new Error(NET_MSG); x.net = true; throw x; } throw e; } };

export const revenuePwApi = {
  status: (company) => call("revenuePwStatus", { company }),
  verify: (pw, company) => call("revenuePwVerify", { pw, company }),
  set: ({ newPw, currentPw = "", forgot = false }, company) => call("revenuePwSet", { newPw, currentPw, forgot, company }),
};

export const REVENUE_PW_MIN = 4; // 서버 functions/revenuePw.js PW_MIN 과 같게
export function revenuePwMessage(r, now = Date.now()) {
  if (r?.ok) return "";
  if (r?.lockUntil) return `여러 번 틀려 잠겼어요. ${lockMinutesLeft(r.lockUntil, now)}분 뒤 다시 해 주세요`;
  if (typeof r?.left === "number") return `비밀번호가 맞지 않아요 (${r.left}번 남았어요)`;
  return "비밀번호가 맞지 않아요";
}

// 잠금 화면 상태 — phase: loading · netError · notStaff · noCompany · none(비밀번호 없음 · 정할 수 없는 사람) · verify · setup(처음) · change(바꾸기) · forgot(잊었을 때)
export function useRevenuePw({ company = "", onVerified }) {
  const [phase, setPhase] = React.useState("loading");
  const [canSet, setCanSet] = React.useState(false);
  const [hasPw, setHasPw] = React.useState(false);
  const [error, setError] = React.useState("");
  const [info, setInfo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [lockUntil, setLockUntil] = React.useState(0);
  const [, tick] = React.useState(0);
  const done = React.useRef(onVerified);
  done.current = onVerified;

  const load = React.useCallback(async () => {
    setPhase("loading"); setError(""); setInfo("");
    try {
      const st = await revenuePwApi.status(company);
      if (!st?.staff) { setPhase("notStaff"); return; }
      if (st.noCompany) { setPhase("noCompany"); return; }
      setCanSet(!!st.canSet); setHasPw(!!st.hasPw); setLockUntil(Number(st.lockUntil) || 0);
      setPhase(st.hasPw ? "verify" : st.canSet ? "setup" : "none");
    } catch (e) { setError(e?.message || NET_MSG); setPhase("netError"); }
  }, [company]);
  React.useEffect(() => { load(); }, [load]);
  // 잠긴 동안 남은 분을 새로 그린다
  React.useEffect(() => {
    if (!lockUntil) return undefined;
    const t = setInterval(() => { if (lockUntil <= Date.now()) { setLockUntil(0); setError(""); } else tick((n) => n + 1); }, 15000);
    return () => clearInterval(t);
  }, [lockUntil]);
  const locked = lockMinutesLeft(lockUntil);

  const verify = async (pw) => {
    if (busy || locked) return false;
    if (!String(pw || "")) { setError("비밀번호를 넣어 주세요"); return false; }
    setBusy(true); setError("");
    try {
      const r = await revenuePwApi.verify(pw, company);
      if (r?.ok) { done.current?.(); return true; }
      if (r?.needSet) { setHasPw(false); setCanSet(!!r.canSet); setPhase(r.canSet ? "setup" : "none"); return false; }
      if (r?.lockUntil) setLockUntil(Number(r.lockUntil));
      setError(revenuePwMessage(r));
    } catch (e) { setError(e?.message || NET_MSG); } finally { setBusy(false); }
    return false;
  };

  // 정하기 · 바꾸기 · 잊었을 때 — 끝나면 바로 열어 준다
  const save = async ({ newPw, confirmPw, currentPw = "" }) => {
    if (busy) return false;
    const n = String(newPw || "");
    if (!n.trim()) { setError("새 비밀번호를 넣어 주세요"); return false; }
    if (n.length < REVENUE_PW_MIN) { setError(`비밀번호는 ${REVENUE_PW_MIN}자리 이상으로 정해 주세요`); return false; }
    if (n !== String(confirmPw || "")) { setError("두 번 넣은 비밀번호가 달라요"); return false; }
    if (phase === "change" && !String(currentPw || "")) { setError("지금 비밀번호를 넣어 주세요"); return false; }
    setBusy(true); setError("");
    try {
      await revenuePwApi.set({ newPw: n, currentPw, forgot: phase === "forgot" }, company);
      setHasPw(true); setLockUntil(0); setPhase("verify");
      done.current?.();
      return true;
    } catch (e) {
      const m = String(e?.message || "");
      if (/잠겼/.test(m)) { const mm = Number((m.match(/(\d+)분/) || [])[1]) || 10; setLockUntil(Date.now() + mm * 60000); }
      setError(m || NET_MSG);
    } finally { setBusy(false); }
    return false;
  };

  const go = (p) => { setError(""); setInfo(p === "forgot" ? "지금 비밀번호 없이 새로 정해요. 정하면 회사 모두 새 비밀번호를 써요" : ""); setPhase(p); };
  const lockMsg = locked ? `여러 번 틀려 잠겼어요. ${locked}분 뒤 다시 해 주세요` : "";
  return {
    phase, canSet, hasPw, busy, locked, info,
    error: error || lockMsg,
    verify, save, retry: load,
    openChange: () => go("change"), openForgot: () => go("forgot"), back: () => go(hasPw ? "verify" : canSet ? "setup" : "none"),
    clearError: () => setError(""),
  };
}

// 화면 글(제목 · 설명) — PC · 모바일이 같은 말을 쓴다
export function revenuePwTexts(phase) {
  return {
    loading: ["매출관리", "확인하는 중이에요"],
    netError: ["연결이 안 돼요", "인터넷을 확인하고 [다시 시도]를 눌러 주세요"],
    notStaff: ["쓸 수 없는 계정이에요", "승인된 직원 계정만 볼 수 있어요"],
    noCompany: ["회사 정보가 없어요", "다시 로그인해 주세요"],
    none: ["매출관리", "아직 매출 비밀번호가 없어요"],
    verify: ["매출관리", "회사 비밀번호를 넣어 주세요"],
    setup: ["매출 비밀번호 정하기", "회사 모두 같은 비밀번호를 써요(마스터만 정해요)"],
    change: ["매출 비밀번호 바꾸기", "지금 비밀번호를 넣고 새 비밀번호를 정해요"],
    forgot: ["새로 정하기", "잊었을 때 지금 비밀번호 없이 새로 정해요"],
  }[phase] || ["매출관리", ""];
}
export const REVENUE_PW_NONE = "아직 매출 비밀번호가 없어요. 회사 마스터에게 정해 달라고 해 주세요";
export const REVENUE_PW_FORGOT = "비밀번호를 잊었으면 회사 마스터에게 새로 정해 달라고 해 주세요";
