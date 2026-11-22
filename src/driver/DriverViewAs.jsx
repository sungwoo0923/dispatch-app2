// ======================= src/driver/DriverViewAs.jsx =======================
// 👀 2026-11-22 관리자 "기사 화면 보기"(/driver-view) — 최고관리자 · 부관리자만.
//  ① 관리자 이메일 · 비밀번호로 로그인(2차 비밀번호는 App 전체 관리자 확인 창이 그대로 묻는다)
//  ② 운송사 → 기사를 고르면 그 기사의 기사앱 화면(/driver-home)을 "보기 전용"으로 연다
//   · 보기 전용: 화면의 모든 저장이 막힌다(src/fsTenant.js setViewOnly) · 위치 추적 · 푸시 등록 · 자동 로그아웃 없음
//   · 누가 언제 어떤 기사 화면을 봤는지 접속 기록(sessionLogs, event "driverView")에 남긴다 — 관리센터 › 접속이력
//  보는 기사 정보는 이 창(탭)에만 둔다(sessionStorage kpDriverViewAs) — 창을 닫으면 끝난다.
import React, { useEffect, useMemo, useState } from "react";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where, addDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { readPublicCompanies } from "../publicCompanies";
import { pushTenantBypass } from "../fsTenant";

const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";
export const VIEW_AS_KEY = "kpDriverViewAs";
export function readViewAs() {
  try { const v = JSON.parse(sessionStorage.getItem(VIEW_AS_KEY) || "null"); return v && v.uid ? v : null; } catch { return null; }
}
export function clearViewAs() { try { sessionStorage.removeItem(VIEW_AS_KEY); } catch { /* 무시 */ } }

async function isAdminUser(u) {
  if (!u) return false;
  if (String(u.email || "").toLowerCase() === TOTAL_MASTER_EMAIL) return true;
  const s = await getDoc(doc(db, "users", u.uid)).catch(() => null);
  const d = s?.exists() ? s.data() : null;
  return d?.role === "totalMaster" && d.userStatus !== "banned" && d.userStatus !== "suspended";
}
const digits = (v) => String(v || "").replace(/\D/g, "");
const norm = (v) => String(v || "").replace(/\s+/g, "").toLowerCase();

const NAVY = { background: "radial-gradient(120% 140% at 90% -20%, #2D4C82 0%, #1B2B4B 45%, #0F1A30 80%, #0B1428 100%)" };
const inputCls = "w-full h-12 px-4 rounded-[13px] bg-[#F5F7FB] border border-[#E3E8F0] text-[15px] font-semibold text-[#0F1A30] outline-none focus:bg-white focus:border-[#2D4C82]";

export default function DriverViewAs() {
  const [me, setMe] = useState(undefined); // undefined 확인 중 · null 관리자 아님/로그아웃 · user
  const [f, setF] = useState({ email: "", pw: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [cos, setCos] = useState([]);
  const [co, setCo] = useState(() => { try { return localStorage.getItem("kpDriverViewCo") || ""; } catch { return ""; } });
  const [drivers, setDrivers] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => onAuthStateChanged(auth, async (u) => { setMe(u && (await isAdminUser(u)) ? u : null); }), []);
  useEffect(() => {
    if (!me) return;
    readPublicCompanies().then((list) => setCos([...new Set(list.map((c) => String(c.companyName).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")))).catch(() => setCos([]));
  }, [me]);
  useEffect(() => {
    if (!me || !co) { setDrivers(null); return; }
    let on = true;
    setDrivers(undefined);
    try { localStorage.setItem("kpDriverViewCo", co); } catch { /* 무시 */ }
    const done = pushTenantBypass(); // 관리자가 보던 회사와 달라도 고른 운송사 기사 목록이 그대로 보이게
    getDocs(query(collection(db, "users"), where("role", "==", "driver"), where("companyName", "==", co)))
      .finally(done)
      .then((s) => on && setDrivers(s.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"))))
      .catch(() => on && setDrivers([]));
    return () => { on = false; };
  }, [me, co]);

  const login = async (e) => {
    e?.preventDefault();
    setErr(""); setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, f.email.trim(), f.pw);
      if (!(await isAdminUser(cred.user))) { await signOut(auth).catch(() => {}); setErr("최고관리자 · 부관리자 계정만 기사 화면을 볼 수 있어요."); return; }
      setMe(cred.user);
    } catch (e2) {
      const c = String(e2?.code || "");
      setErr(/wrong-password|invalid-credential|user-not-found|invalid-email/.test(c) ? "이메일 또는 비밀번호가 맞지 않아요." : c === "auth/too-many-requests" ? "시도가 너무 많아요. 잠시 뒤 다시 해 주세요." : "로그인하지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally { setBusy(false); }
  };

  const open = async (d) => {
    const v = { uid: d.uid, name: d.name || d.이름 || "", carNo: d.carNo || d.차량번호 || "", companyName: co, by: me.email || me.uid, at: Date.now() };
    // 누가 언제 어떤 기사 화면을 봤는지 남긴다(관리센터 › 접속이력)
    await addDoc(collection(db, "sessionLogs"), { uid: me.uid, email: me.email || "", event: "driverView", role: "totalMaster", companyName: co, targetUid: d.uid, targetName: v.name, targetCarNo: v.carNo, at: serverTimestamp() }).catch(() => {});
    try { sessionStorage.setItem(VIEW_AS_KEY, JSON.stringify(v)); } catch { /* 무시 */ }
    window.location.href = "/driver-home";
  };

  const list = useMemo(() => {
    const k = norm(q), dk = digits(q);
    return (drivers || []).filter((d) => !k || norm(d.name || d.이름).includes(k) || norm(d.carNo || d.차량번호).includes(k) || (dk.length >= 3 && digits(d.phone || d.전화번호).includes(dk)));
  }, [drivers, q]);

  return (
    <div className="min-h-screen bg-[#EEF1F6]" data-driver-view>
      <div className="px-5 pt-[max(24px,env(safe-area-inset-top))] pb-14 text-white" style={NAVY}>
        <div className="max-w-[560px] mx-auto">
          <div className="text-[12px] font-extrabold tracking-[0.16em] text-[#8FB0F0]">ADMIN · DRIVER VIEW</div>
          <div className="text-[24px] font-black mt-1">기사 화면 보기</div>
          <div className="text-[14px] text-white/65 mt-1">기사를 고르면 그 기사의 기사앱 화면을 보기 전용으로 열어요. 저장 · 위치 기록은 되지 않아요.</div>
        </div>
      </div>
      <div className="max-w-[560px] mx-auto px-4 -mt-8 pb-10 space-y-3">
        {me === undefined ? <div className="bg-white rounded-[22px] p-8 text-center text-[#7A879C] font-bold">확인 중…</div> : !me ? (
          <form onSubmit={login} className="bg-white rounded-[22px] p-5 space-y-3 shadow-[0_10px_30px_rgba(15,26,48,.06)]">
            <div className="text-[16px] font-extrabold text-[#0F1A30]">관리자 로그인</div>
            <input className={inputCls} type="email" autoComplete="username" placeholder="최고관리자 이메일" value={f.email} onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))} data-dv-email />
            <input className={inputCls} type="password" autoComplete="current-password" placeholder="비밀번호" value={f.pw} onChange={(e) => setF((p) => ({ ...p, pw: e.target.value }))} data-dv-pw />
            {err && <div className="rounded-xl bg-[#FFF5F4] border border-[#F3D3CF] px-3.5 py-2.5 text-[13.5px] font-bold text-[#0F1A30]">{err}</div>}
            <button type="submit" disabled={busy} className="w-full h-12 rounded-[13px] text-white text-[15px] font-black disabled:opacity-60" style={{ background: "linear-gradient(120deg,#0F1A30,#1B2B4B 55%,#2D4C82)" }} data-dv-login>{busy ? "확인 중…" : "로그인"}</button>
            <div className="text-[12.5px] text-[#7A879C]">PC에서는 로그인 뒤 2차 비밀번호를 한 번 더 물어요.</div>
          </form>
        ) : (
          <>
            <div className="bg-white rounded-[22px] p-5 space-y-3 shadow-[0_10px_30px_rgba(15,26,48,.06)]">
              <label className="block">
                <span className="text-[12px] font-extrabold tracking-[0.1em] text-[#7A879C]">운송사</span>
                <select className={`${inputCls} mt-1.5`} value={co} onChange={(e) => setCo(e.target.value)} data-dv-co>
                  <option value="">운송사를 고르세요</option>
                  {cos.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              {co && <input className={inputCls} placeholder="이름 · 차량번호 · 전화 뒷자리" value={q} onChange={(e) => setQ(e.target.value)} data-dv-q />}
            </div>
            {co && (
              <div className="bg-white rounded-[22px] overflow-hidden shadow-[0_10px_30px_rgba(15,26,48,.06)]" data-dv-list>
                {drivers === undefined ? <div className="p-8 text-center text-[#7A879C] font-bold">기사를 불러오는 중…</div>
                  : !list.length ? <div className="p-8 text-center text-[#7A879C] font-bold">{drivers?.length ? "찾는 기사가 없어요" : "등록된 기사가 없어요"}</div>
                  : list.slice(0, 200).map((d) => (
                    <button key={d.uid} type="button" onClick={() => open(d)} className="w-full text-left px-5 py-3.5 flex items-center gap-3 border-b border-[#EEF1F6] last:border-0 hover:bg-[#F5F8FD]" data-dv-driver>
                      <span className="w-10 h-10 rounded-xl bg-[#EAF0FA] text-[#1B2B4B] font-black grid place-items-center shrink-0">{String(d.name || d.이름 || "?").slice(0, 1)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15.5px] font-extrabold text-[#0F1A30] truncate">{d.name || d.이름 || "이름 없음"} <span className="text-[#55657F] font-bold">{d.carNo || d.차량번호 || ""}</span></span>
                        <span className="block text-[12.5px] text-[#7A879C] truncate">{[d.등급 || d.grade, d.차량톤수, d.차량종류].filter(Boolean).join(" · ") || "기사"}{d.approved === false ? " · 승인 전" : ""}</span>
                      </span>
                      <span className="h-9 px-3 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black inline-flex items-center shrink-0">화면 보기</span>
                    </button>
                  ))}
              </div>
            )}
            <div className="flex items-center justify-between px-1">
              <a href="/app" className="text-[13px] font-bold text-[#55657F]">← 관리자 화면</a>
              <span className="text-[12.5px] text-[#7A879C] truncate">{me.email}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
