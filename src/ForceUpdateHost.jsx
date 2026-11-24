// ======================= src/ForceUpdateHost.jsx =======================
// ⏱ 2026-11-24 강제 업데이트 예약 — 운송사 화면(PC · 모바일) 위 가운데 안내 + 남은 시간 → 0초에 최신 버전으로 새로 고침
//  관리센터 › 운영 › 업데이트 배포 › 강제 업데이트 예약(ForceUpdatePanel)이 systemConfig/forceUpdate 를 쓴다.
//  · 대상 운송사 · 예약 버전보다 예전 화면에만 뜬다(이미 최신이면 아무것도 안 뜸)
//  · 4초에 한 번 금빛 테두리가 천천히 밝아졌다 가라앉음 · [—]로 접으면 작은 알약 · 30초 남으면 다시 펼침 · 마지막 10초 문구 바뀜
//  · 새로 고친 뒤 "최신 버전이 적용되었습니다" 3초
import React from "react";
import { createPortal } from "react-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { CUR_BUILD, CUR_VER } from "./releaseGate";
import { hardReloadForUpdate } from "./UpdateBanner";
import { FORCE_DOC, DEFAULT_FORCE_MSG, forceApplies, forceBehind, forceLeft, fmtLeft } from "./forceUpdateCore";

const CSS = `
@keyframes kpFuIn{from{opacity:0;transform:translate(-50%,-14px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes kpFuGlow{0%,100%{box-shadow:0 14px 40px rgba(11,20,40,.32),0 0 0 5px rgba(215,188,130,.06),0 0 18px rgba(215,188,130,.10)}
 50%{box-shadow:0 14px 40px rgba(11,20,40,.32),0 0 0 6px rgba(215,188,130,.16),0 0 34px rgba(215,188,130,.38)}}
@keyframes kpFuHot{0%,100%{box-shadow:0 14px 40px rgba(11,20,40,.32),0 0 0 6px rgba(242,196,109,.14),0 0 26px rgba(242,196,109,.32)}
 50%{box-shadow:0 14px 40px rgba(11,20,40,.32),0 0 0 7px rgba(242,196,109,.26),0 0 44px rgba(242,196,109,.55)}}
.kp-fu{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 64px);z-index:2147483100;transform:translateX(-50%);animation:kpFuIn .5s cubic-bezier(.2,.8,.2,1) both,kpFuGlow 4s ease-in-out .5s infinite;
 color:#fff;background:linear-gradient(120deg,rgba(11,20,40,.97),rgba(27,43,75,.97));border:1px solid rgba(215,188,130,.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);white-space:nowrap;font-family:inherit}
.kp-fu.hot{border-color:rgba(242,196,109,.9);animation:kpFuIn .5s cubic-bezier(.2,.8,.2,1) both,kpFuHot 2s ease-in-out .5s infinite}
@media (prefers-reduced-motion:reduce){.kp-fu,.kp-fu.hot{animation:none}}
`;

function Ring({ pct, size = 36 }) {
  const r = (size - 6) / 2; const c = 2 * Math.PI * r;
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#D7BC82" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset 1s linear" }} />
      </svg>
      <svg className="absolute" style={{ left: size / 2 - 8, top: size / 2 - 8 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F3E3BC" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
    </span>
  );
}

// 안내가 떠 있는 동안 <html data-kp-force> — 라이브 알림(DispatchApp)이 그 아래로 내려간다
function ForceFlag({ on }) {
  React.useEffect(() => {
    const el = document.documentElement;
    if (on) el.setAttribute("data-kp-force", "1"); else el.removeAttribute("data-kp-force");
    return () => el.removeAttribute("data-kp-force");
  }, [on]);
  return null;
}

export default function ForceUpdateHost({ company = "", role = "", linkedCompany = "" }) {
  const [cfg, setCfg] = React.useState(null);
  const [now, setNow] = React.useState(Date.now());
  const [folded, setFolded] = React.useState(false);
  const [done, setDone] = React.useState(() => { try { return sessionStorage.getItem("kpForceDone") || ""; } catch { return ""; } });
  const firing = React.useRef(false);
  React.useEffect(() => onSnapshot(doc(db, ...FORCE_DOC), (d) => setCfg(d.exists() ? d.data() : null), () => setCfg(null)), []);
  // 새로 고친 뒤 한 번 — 적용 완료 안내
  React.useEffect(() => {
    if (!done) return undefined;
    try { sessionStorage.removeItem("kpForceDone"); } catch { /* 무시 */ }
    const t = setTimeout(() => setDone(""), 3200);
    return () => clearTimeout(t);
  }, [done]);
  const on = CUR_VER !== "dev" && forceApplies(cfg, { company, role, linkedCompany }) && forceBehind(cfg, CUR_BUILD);
  React.useEffect(() => {
    if (!on) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  React.useEffect(() => { try { setFolded(sessionStorage.getItem(`kpForceFold:${cfg?.id}`) === "1"); } catch { /* 무시 */ } }, [cfg?.id]);
  const left = on ? forceLeft(cfg, now) : 0;
  const apply = React.useCallback(() => {
    if (firing.current || !cfg) return;
    // 같은 예약으로 두 번까지만 새로 고친다(배포 주소 문제로 최신이 안 열려도 끝없이 새로 고치지 않게)
    let n = 0;
    try { n = Number(sessionStorage.getItem(`kpForceTry:${cfg.id}`) || 0); if (n >= 2) return; sessionStorage.setItem(`kpForceTry:${cfg.id}`, String(n + 1)); sessionStorage.setItem("kpForceDone", cfg.version || "최신"); } catch { /* 무시 */ }
    firing.current = true;
    hardReloadForUpdate();
  }, [cfg]);
  React.useEffect(() => { if (on && left <= 0) apply(); }, [on, left, apply]);
  React.useEffect(() => { if (on && left <= 30 && folded) setFolded(false); }, [on, left, folded]);

  if (done && !on) return createPortal(<ForceDoneToast version={done} />, document.body);
  if (!on || left <= 0) return <ForceFlag on={false} />;
  const total = Math.max(1, Math.round((Number(cfg.fireAt) - Number(cfg.createdAt || cfg.fireAt - 60000)) / 1000));
  const fold = () => { setFolded(true); try { sessionStorage.setItem(`kpForceFold:${cfg.id}`, "1"); } catch { /* 무시 */ } };
  return createPortal(
    <>
      <ForceFlag on />
      <ForceBanner message={cfg.message} left={left} total={total} folded={folded} onFold={fold} onUnfold={() => setFolded(false)} onApply={apply} />
    </>, document.body);
}

// 새로 고친 뒤 3초 — "최신 버전이 적용되었습니다"
export function ForceDoneToast({ version = "" }) {
  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-[2147483100] flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white border border-[#E3E8F0] shadow-[0_10px_26px_rgba(15,26,48,.14)] text-[13.5px] font-black text-[#0F1A30] whitespace-nowrap"
      style={{ top: "calc(env(safe-area-inset-top,0px) + 64px)" }} data-kp="force-done">
      <span className="w-[22px] h-[22px] rounded-full bg-[#0F7B5F] text-white grid place-items-center text-[12px]">✓</span>
      최신 버전{version && version !== "최신" ? ` v${version}` : ""}이 적용되었습니다
    </div>
  );
}

// 위 가운데 안내(그림만) — 남은 시간 · 접기 · 지금 적용
export function ForceBanner({ message = "", left, total, folded = false, onFold, onUnfold, onApply }) {
  const pct = Math.min(1, Math.max(0, left / Math.max(1, total)));
  const hot = left <= 10;
  return (
    <>
      <style>{CSS}</style>
      {folded ? (
        <button type="button" onClick={onUnfold} className="kp-fu flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-black" data-kp="force-mini" title="업데이트 안내 펼치기">
          <span className="w-[7px] h-[7px] rounded-full bg-[#D7BC82]" />업데이트까지 <span className="tabular-nums text-[#F3E3BC]">{fmtLeft(left)}</span>
        </button>
      ) : (
        <div className={`kp-fu ${hot ? "hot" : ""} flex items-center gap-3 sm:gap-3.5 rounded-[18px] pl-3 sm:pl-4 pr-2 py-2.5 max-w-[calc(100vw-24px)]`} role="status" aria-live="polite" data-kp="force-update">
          <Ring pct={pct} />
          <div className="min-w-0">
            <div className="text-[14px] sm:text-[14.5px] font-black tracking-[-0.01em] truncate">
              <span className="hidden sm:inline text-[10.5px] font-black tracking-[0.18em] text-[#D7BC82] mr-2">SYSTEM UPDATE</span>
              {hot ? "최신 버전을 곧 적용합니다" : "시스템 업데이트 예정"}
            </div>
            <div className="text-[11.5px] sm:text-[12px] text-[rgba(226,232,245,.72)] font-semibold mt-0.5 truncate max-w-[52vw] sm:max-w-[520px]">
              {hot ? "화면이 잠시 후 새로 고쳐집니다" : (message || DEFAULT_FORCE_MSG)}
            </div>
          </div>
          <div className="text-right ml-1">
            <div className="text-[22px] sm:text-[26px] font-black tabular-nums text-[#F3E3BC] leading-none tracking-[0.02em]">{fmtLeft(left)}</div>
            <div className="text-[10px] font-extrabold text-[rgba(226,232,245,.55)] tracking-[0.08em] mt-0.5">후 자동 적용</div>
          </div>
          <button type="button" onClick={onApply} className="hidden sm:grid h-8 px-3 rounded-[10px] border border-[rgba(215,188,130,.45)] text-[#F3E3BC] text-[12px] font-black place-items-center hover:bg-white/5">지금 적용</button>
          {!hot && <button type="button" onClick={onFold} className="w-7 h-7 rounded-lg grid place-items-center text-[rgba(226,232,245,.6)] hover:bg-white/10" title="접어 두기" aria-label="접어 두기">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 12h14" /></svg></button>}
        </div>
      )}
    </>
  );
}
