// ======================= src/MultiCompanySwitch.jsx =======================
// 🏢 2026-11-24 여러 회사 오가기(태진 · 큐런 대표 등 — 최고관리자가 관리자센터 › 운송사 관제 › 계정에서 오갈 회사를 정해 준 계정)
//  · PC: 상단 회사 · 이름 칸(▾) › [회사 전환]   · 모바일: 전체 메뉴 맨 위 회사 칩
//  · 고르면 users/{uid}.activeCompany 를 바꾸고 → 서버가 로그인 토큰(회사 · 통합관리자)을 새로 만들 때까지 기다렸다가 → 새로 고침
//  · 다른 회사에서는 통합관리자로 일해요. 근태 · 급여 · 연차 같은 내 인사 기록은 원래 소속 회사에만 남아요(GuestHrNotice)
//  · 회사마다 색이 달라요(화면 맨 위 띠 · 회사 칩 · 바뀐 뒤 안내) — src/multiCompany.js CO_TONES
import React from "react";
import { createPortal } from "react-dom";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db, FUNCTIONS_BASE } from "./firebase";
import { fetchCaller } from "./claimsSync";
import { getMultiState, subscribeMulti, toneOf } from "./multiCompany";
import { confirmLeave } from "./leaveGuard";

const SWITCHED = "kpCoSwitched";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function useMultiCompany() {
  return React.useSyncExternalStore(subscribeMulti, getMultiState, getMultiState);
}

// 내가 오갈 수 있는 회사들의 회사코드(서버 myCompanyCodes) — [{ companyName, companyCode, home }] · 실패하면 null
export async function fetchMyCompanyCodes(user) {
  try {
    const t = await user.getIdToken();
    const r = await fetch(`${FUNCTIONS_BASE}/myCompanyCodes`, { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j?.companies) ? j.companies : null;
  } catch { return null; }
}

// 서버가 로그인 토큰의 회사(co)를 바꿀 때까지 기다린다(보통 2~5초 · 5초가 지나면 다시 계산을 한 번 부탁)
export async function waitClaimsCompany(u, co, ms = 30000) {
  const call = fetchCaller(FUNCTIONS_BASE, () => auth.currentUser);
  const t0 = Date.now();
  let asked = false;
  while (Date.now() - t0 < ms) {
    const r = await u.getIdTokenResult(true).catch(() => null);
    if (r?.claims?.co === co) return true;
    if (!asked && Date.now() - t0 > 5000) { asked = true; await call("refreshMyClaims", {}).catch(() => null); continue; }
    await sleep(1500);
  }
  return false;
}

// 회사 바꾸기 — 토큰이 새 회사로 바뀐 것을 확인한 뒤에만 새로 고친다(바뀌기 전에 새로 고치면 목록이 "권한 없음"으로 비어 보인다)
export async function switchMyCompany(target) {
  const st = getMultiState();
  const co = String(target || "").trim();
  const u = auth.currentUser;
  if (!u || !st.uid || u.uid !== st.uid) throw new Error("로그인 정보를 다시 확인해 주세요");
  if (co !== st.home && !st.list.includes(co)) throw new Error("오갈 수 있는 회사가 아니에요");
  const prev = st.guest ? st.active : "";
  const next = co === st.home ? "" : co;
  try { sessionStorage.setItem("kpCoSwitching", "1"); } catch { /* 무시 */ }
  await updateDoc(doc(db, "users", u.uid), { activeCompany: next }).catch((e) => { try { sessionStorage.removeItem("kpCoSwitching"); } catch { /* 무시 */ } throw e; });
  const ok = await waitClaimsCompany(u, co);
  if (!ok) {
    await updateDoc(doc(db, "users", u.uid), { activeCompany: prev }).catch(() => {});
    try { sessionStorage.removeItem("kpCoSwitching"); } catch { /* 무시 */ }
    throw new Error("회사를 바꾸지 못했어요. 잠시 뒤 다시 눌러 주세요");
  }
  try {
    localStorage.setItem("userCompany", co);
    localStorage.setItem("loginCompany", co); // 모바일 일부 화면이 loginCompany 를 먼저 읽는다
    sessionStorage.removeItem("kpEntry");
    sessionStorage.setItem(SWITCHED, co);
  } catch { /* 무시 */ }
  window.location.reload();
}

const Avatar = ({ co, size = 36 }) => {
  const t = toneOf(co);
  return <span className="rounded-xl grid place-items-center font-black text-white shrink-0" style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(135deg,${t.deep},${t.main})` }}>{String(co || "").slice(0, 1)}</span>;
};

// 회사 전환 창(PC · 모바일 같은 창)
export default function MultiCompanySwitch({ onClose }) {
  const st = useMultiCompany();
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  React.useEffect(() => { const k = (e) => { if (e.key === "Escape" && !busy) onClose?.(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose, busy]);
  const all = [st.home, ...st.list].filter(Boolean);
  const cur = toneOf(st.active);
  const go = async (co) => {
    if (busy) return;
    if (co === st.active) { onClose?.(); return; }
    if (!(await confirmLeave())) return;
    setErr(""); setBusy(co);
    try { await switchMyCompany(co); } catch (e) { setErr(e.message || "회사를 바꾸지 못했어요"); setBusy(""); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[2147483200] bg-[#0B1428]/55 backdrop-blur-[2px] grid place-items-end sm:place-items-center sm:p-4" onClick={() => !busy && onClose?.()} data-kp="multi-co">
      <div className="w-full sm:max-w-[420px] rounded-t-[24px] sm:rounded-[24px] bg-white overflow-hidden shadow-[0_24px_60px_rgba(15,26,48,0.35)]" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-4 text-white" style={{ background: `linear-gradient(120deg,${cur.deep},${cur.main})` }}>
          <div className="text-[11.5px] font-extrabold tracking-[0.16em] text-white/60">SWITCH COMPANY</div>
          <div className="mt-0.5 text-[20px] font-black">회사 전환</div>
          <div className="mt-1 text-[13px] font-bold text-white/75 leading-relaxed">고르면 로그아웃 없이 그 회사 화면으로 바뀌어요. 다른 회사에서는 통합관리자로 일해요.</div>
        </div>
        <div className="py-2">
          {all.map((co) => {
            const t = toneOf(co);
            const on = co === st.active;
            return (
              <button key={co} type="button" onClick={() => go(co)} disabled={!!busy} data-kp="multi-co-item"
                className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-[#F6F7FA] disabled:opacity-60" style={on ? { background: t.soft } : undefined}>
                <Avatar co={co} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-black text-[#0F1A30] truncate">{co}</span>
                  <span className="block text-[12px] font-bold text-[#8A96AB]">{co === st.home ? "원래 소속 · 내 근태 · 급여 · 연차" : "통합관리자"}</span>
                </span>
                {busy === co
                  ? <span className="text-[12.5px] font-black" style={{ color: t.main }}>바꾸는 중…</span>
                  : on ? <span className="text-[12.5px] font-black" style={{ color: t.main }}>지금 회사</span> : null}
              </button>);
          })}
        </div>
        {err && <div className="mx-5 mb-3 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] px-3 py-2 text-[13px] font-bold text-[#B42318]">{err}</div>}
        <div className="px-5 py-3 border-t border-[#EEF2F8] flex items-center justify-between gap-3">
          <span className="text-[12px] font-bold text-[#9AA9C3]">바꾸는 데 몇 초 걸려요</span>
          <button type="button" onClick={onClose} disabled={!!busy} className="h-10 px-5 rounded-xl border border-[#DCE3EE] text-[14px] font-black text-[#3A4A66] disabled:opacity-50">닫기</button>
        </div>
      </div>
    </div>, document.body);
}

// 다른 회사로 들어가 있을 때 내 근태 · 급여 · 연차 화면 맨 위 안내 — 기록은 원래 소속 회사에만 남는다
export function GuestHrNotice({ what = "근태 · 급여 · 연차", className = "" }) {
  const st = useMultiCompany();
  const [open, setOpen] = React.useState(false);
  if (!st.guest) return null;
  const t = toneOf(st.home);
  return (
    <div className={`rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-3 ${className}`} style={{ background: t.soft, borderColor: `${t.main}33` }} data-kp="guest-hr">
      <div className="flex-1 min-w-[200px]">
        <div className="text-[14px] font-black text-[#0F1A30]">지금은 {st.active} 화면이에요</div>
        <div className="text-[12.5px] font-bold text-[#5B6B84] mt-0.5">내 {what}는 원래 소속 회사({st.home})에만 기록돼요. 확인하려면 {st.home}(으)로 바꿔 주세요.</div>
      </div>
      <button type="button" onClick={() => setOpen(true)} className="h-9 px-4 rounded-xl text-[13px] font-black text-white shrink-0" style={{ background: t.main }}>{st.home}(으)로 바꾸기</button>
      {open && <MultiCompanySwitch onClose={() => setOpen(false)} />}
    </div>
  );
}

// 회사를 바꾼 직후 한 번 — 회사 색으로 "○○(으)로 바뀌었어요"
export function CompanySwitchedToast() {
  const st = useMultiCompany();
  const [co, setCo] = React.useState(() => { try { return sessionStorage.getItem(SWITCHED) || ""; } catch { return ""; } });
  React.useEffect(() => {
    if (!co) return undefined;
    try { sessionStorage.removeItem(SWITCHED); } catch { /* 무시 */ }
    const tm = setTimeout(() => setCo(""), 2800);
    return () => clearTimeout(tm);
  }, [co]);
  if (!co || !st.list.length) return null;
  const t = toneOf(co);
  return createPortal(
    <div className="fixed left-1/2 -translate-x-1/2 top-4 z-[2147483300] px-5 py-3 rounded-2xl text-white shadow-[0_14px_40px_rgba(11,20,40,0.35)] flex items-center gap-3 pointer-events-none" style={{ background: `linear-gradient(120deg,${t.deep},${t.main})` }} data-kp="multi-co-toast">
      <Avatar co={co} size={30} />
      <span className="text-[14.5px] font-black">{co}(으)로 바뀌었어요{co !== st.home ? " · 통합관리자" : ""}</span>
    </div>, document.body);
}

// 상단 칩 옆 작은 회사 색 점(여러 회사 계정만)
export function CompanyToneDot({ className = "" }) {
  const st = useMultiCompany();
  if (!st.list.length) return null;
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${className}`} style={{ background: toneOf(st.active).main, boxShadow: "0 0 0 2px rgba(255,255,255,0.25)" }} aria-hidden="true" />;
}

// 모바일 전체 메뉴 맨 위 — 지금 회사(회사 색) + [회사 전환]
export function MultiCompanyCard({ className = "" }) {
  const st = useMultiCompany();
  const [open, setOpen] = React.useState(false);
  if (!st.list.length) return null;
  const t = toneOf(st.active);
  return (
    <div className={`mx-3 my-2 ${className}`}>
      <button type="button" onClick={() => setOpen(true)} data-kp="m-multi-co"
        className="w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-left text-white shadow-[0_8px_22px_rgba(11,20,40,0.18)]" style={{ background: `linear-gradient(120deg,${t.deep},${t.main})` }}>
        <Avatar co={st.active} size={34} />
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] font-extrabold tracking-[0.12em] text-white/60">지금 회사{st.guest ? " · 통합관리자" : ""}</span>
          <span className="block text-[15.5px] font-black truncate">{st.active}</span>
        </span>
        <span className="h-8 px-3 rounded-lg bg-white/15 border border-white/20 text-[12.5px] font-black grid place-items-center whitespace-nowrap">회사 전환</span>
      </button>
      {open && <MultiCompanySwitch onClose={() => setOpen(false)} />}
    </div>
  );
}
