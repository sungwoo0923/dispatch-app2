// src/attendanceQuick.jsx
// ⭐ 2026-11-01 출퇴근 — 회사별 자동 출퇴근 반경 + 직접 누르는 출근/퇴근 버튼(PC 상단 · 모바일 상단)
//  · 반경: companySettings/{회사}.officeLocation.radius(자동 출근, m) · outRadius(자동 퇴근, m)
//    값이 없으면 예전과 같은 100m / 300m
//  · 버튼: 출근 전 → [출근] / 출근 중 → [퇴근] / 퇴근 후 → [퇴근 HH:MM] + [되돌리기](다시 출근 상태로)
import React from "react";
import { doc, onSnapshot, setDoc, deleteField } from "firebase/firestore";
import { db, auth } from "./firebase";
import { kpConfirm } from "./kpDialog";

export const DEFAULT_IN_RADIUS = 100;
export const DEFAULT_OUT_RADIUS = 300;
export const MIN_RADIUS = 10;
export const RADIUS_PRESETS = [10, 20, 30, 50, 100, 200, 300, 500];

// 회사 설정 → { inM, outM } (퇴근 거리는 출근 반경보다 최소 20m 크게)
export function officeRadii(loc) {
  const inM = Math.min(5000, Math.max(MIN_RADIUS, Math.round(Number(loc?.radius) || DEFAULT_IN_RADIUS)));
  const outRaw = Math.round(Number(loc?.outRadius) || (loc?.radius ? Math.max(inM * 3, inM + 100) : DEFAULT_OUT_RADIUS));
  return { inM, outM: Math.min(10000, Math.max(inM + 20, outRaw)) };
}

const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const hm = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }); };

function useTodayAttendance(uid) {
  const [rec, setRec] = React.useState(undefined); // undefined=불러오는 중, null=기록 없음
  const [today, setToday] = React.useState(kstToday());
  React.useEffect(() => { const t = setInterval(() => setToday(kstToday()), 60000); return () => clearInterval(t); }, []);
  React.useEffect(() => {
    if (!uid) { setRec(null); return undefined; }
    return onSnapshot(doc(db, "attendance", `${today}_${uid}`), (s) => setRec(s.exists() ? s.data() : null), () => setRec(null));
  }, [uid, today]);
  return { rec, today };
}

// 출근/퇴근 버튼 — variant: "pc"(상단 칩) | "mobile"(상단 작은 버튼)
export function AttendanceQuickButton({ company, uid, name, role, email, variant = "pc", dark = false }) {
  const { rec, today } = useTodayAttendance(uid);
  const [busy, setBusy] = React.useState(false);
  const isTM = role === "totalMaster" || email === "tjddnqkf@naver.com";
  if (!uid || !company || isTM || rec === undefined) return null;
  const working = rec?.status === "출근" && !!rec?.checkInTime;
  const done = working && !!rec?.checkOutTime;
  const ref = doc(db, "attendance", `${today}_${uid}`);
  const toast = (m) => { try { if (window.__sflowShowToast) window.__sflowShowToast(m, "success"); } catch { /* 무시 */ } };
  const run = (fn) => async () => { if (busy) return; setBusy(true); try { await fn(); } catch (e) { alert(`처리하지 못했습니다: ${e?.message || e}`); } finally { setBusy(false); } };

  const checkIn = run(async () => {
    if (rec?.status && rec.status !== "출근" && rec.status !== "결근") {
      if (!(await kpConfirm(`오늘은 "${rec.status}"(으)로 기록되어 있습니다.\n출근으로 바꿀까요?`))) return;
    }
    const now = new Date().toISOString();
    await setDoc(ref, {
      uid, name: name || auth.currentUser?.displayName || "", date: today, month: today.slice(0, 7),
      status: "출근", checkInTime: rec?.status === "출근" && rec?.checkInTime ? rec.checkInTime : now,
      source: rec?.source && rec?.status === "출근" ? rec.source : "manual", companyName: company,
      checkOutTime: deleteField(),
    }, { merge: true });
    toast(`출근 처리되었습니다 (${hm(now)})`);
  });
  const checkOut = run(async () => {
    if (!(await kpConfirm(`지금 퇴근 처리할까요?\n(잘못 눌렀으면 '되돌리기'로 다시 출근 상태로 돌릴 수 있습니다)`))) return;
    const now = new Date().toISOString();
    await setDoc(ref, { checkOutTime: now, checkOutSource: "manual" }, { merge: true });
    toast(`퇴근 처리되었습니다 (${hm(now)})`);
  });
  const undo = run(async () => {
    if (!(await kpConfirm(`${hm(rec?.checkOutTime)} 퇴근을 취소하고 다시 출근 상태로 돌릴까요?`))) return;
    await setDoc(ref, { checkOutTime: deleteField(), checkOutSource: deleteField(), checkOutUndoneAt: new Date().toISOString() }, { merge: true });
    toast("퇴근을 취소했습니다 — 다시 출근 상태입니다");
  });

  if (variant === "deck") {
    // 홈 관제 데크(남색 디지털) — 시계 왼쪽의 근태 카드
    const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
    const state = done ? "OFF DUTY" : working ? "ON DUTY" : "CHECK-IN";
    const color = done ? "#9AA9C3" : working ? "#4ADE80" : "#F7B955";
    const label = done ? `퇴근 ${hm(rec.checkOutTime)}` : working ? `출근 ${hm(rec.checkInTime)} · 근무 중` : (rec?.status && rec.status !== "출근" ? `오늘 ${rec.status}` : "아직 출근 전입니다");
    const btnBase = { height: 44, padding: "0 20px", borderRadius: 12, fontSize: 15, fontWeight: 900, whiteSpace: "nowrap", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, border: "none" };
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 12px 10px 16px", borderRadius: 16, background: "rgba(143,176,240,0.08)", border: "1px solid rgba(143,176,240,0.28)", boxShadow: working && !done ? "0 0 24px rgba(74,222,128,0.12)" : "none" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.22em", color }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />{state}
          </div>
          <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: "#fff", whiteSpace: "nowrap" }}>{label}</div>
        </div>
        {done ? (
          <button type="button" disabled={busy} onClick={undo} style={{ ...btnBase, background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }} title="잘못 누른 퇴근을 취소하고 다시 출근 상태로">되돌리기</button>
        ) : working ? (
          <button type="button" disabled={busy} onClick={checkOut} style={{ ...btnBase, background: "#fff", color: "#0F1A30" }}>퇴근하기</button>
        ) : (
          <button type="button" disabled={busy} onClick={checkIn} style={{ ...btnBase, background: "linear-gradient(135deg,#8FB0F0,#CFE0FF)", color: "#0B1428", boxShadow: "0 8px 22px rgba(143,176,240,0.35)" }}>출근하기</button>
        )}
      </div>
    );
  }
  if (variant === "mobile") {
    // 모바일 — 머리줄 아래 얇은 한 줄(어느 화면에서든 바로 보이게)
    const wrap = `mx-3 mb-2 flex items-center gap-2 rounded-xl px-3 h-10 ${dark ? "bg-white/10 ring-1 ring-white/15 text-white" : "bg-white ring-1 ring-[#E3E8F0] text-[#0F1A30] shadow-[0_1px_2px_rgba(16,24,40,0.05)]"}`;
    const dot = (c) => <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c }} />;
    const btn = (primary) => `ml-auto h-7 px-3 rounded-lg text-[12px] font-black whitespace-nowrap disabled:opacity-50 ${primary ? (dark ? "bg-white text-[#0F1A30]" : "bg-[#0F1A30] text-white") : (dark ? "bg-white/15 text-white ring-1 ring-white/25" : "bg-[#F1F4F9] text-[#1B2B4B] ring-1 ring-[#DCE3EE]")}`;
    if (done) return (
      <div className={wrap}>
        {dot("#9AA9C3")}<span className="text-[12.5px] font-bold truncate">퇴근 {hm(rec.checkOutTime)} <span className="opacity-60">· 출근 {hm(rec.checkInTime)}</span></span>
        <button type="button" disabled={busy} onClick={undo} className={btn(false)}>되돌리기</button>
      </div>
    );
    if (working) return (
      <div className={wrap}>
        {dot("#12B76A")}<span className="text-[12.5px] font-bold truncate">근무 중 <span className="opacity-60">· 출근 {hm(rec.checkInTime)}</span></span>
        <button type="button" disabled={busy} onClick={checkOut} className={btn(true)}>퇴근하기</button>
      </div>
    );
    return (
      <div className={wrap}>
        {dot("#F79009")}<span className="text-[12.5px] font-bold truncate">{rec?.status && rec.status !== "출근" ? `오늘 ${rec.status}` : "아직 출근 전"}</span>
        <button type="button" disabled={busy} onClick={checkIn} className={btn(true)}>출근하기</button>
      </div>
    );
  }
  // PC
  if (done) return (
    <div className="flex items-center gap-1">
      <span className="kp-chip-btn text-[12px] opacity-80 cursor-default" title={`출근 ${hm(rec.checkInTime)} · 퇴근 ${hm(rec.checkOutTime)}`}>퇴근 {hm(rec.checkOutTime)}</span>
      <button type="button" disabled={busy} onClick={undo} className="kp-chip-btn text-[12px] transition disabled:opacity-50" title="잘못 누른 퇴근을 취소하고 다시 출근 상태로">되돌리기</button>
    </div>
  );
  return (
    <button type="button" disabled={busy} onClick={working ? checkOut : checkIn}
      className={`kp-chip-btn text-[12px] transition disabled:opacity-50 ${working ? "" : "!bg-[#8FB0F0] !text-[#0B1428]"}`}
      title={working ? `출근 ${hm(rec?.checkInTime)} — 누르면 퇴근 처리` : "누르면 출근 처리"}>
      {working ? `퇴근하기 · ${hm(rec?.checkInTime)} 출근` : "출근하기"}
    </button>
  );
}

// 출근지 설정 화면의 반경 입력 — value: { inM, outM }
export function RadiusEditor({ value, onChange, compact = false }) {
  const v = value || { inM: DEFAULT_IN_RADIUS, outM: DEFAULT_OUT_RADIUS };
  const chip = (on) => `px-2.5 h-8 rounded-lg text-[12px] font-bold border transition ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-gray-200 text-[#1B2B4B] bg-white"}`;
  // ⭐ 2026-11-01 반경 버튼을 누르면 퇴근 거리도 그에 맞게 같이 바뀐다(직접 고친 퇴근 거리는 유지)
  const outTouched = React.useRef(false);
  const recommendOut = (inM) => Math.max(inM * 3, inM + 100);
  const setIn = (n) => {
    const inM = Math.max(MIN_RADIUS, Math.round(Number(n) || 0));
    const outM = outTouched.current ? Math.max(Number(v.outM) || 0, inM + 20) : recommendOut(inM);
    onChange({ inM, outM });
  };
  const setOut = (n) => { outTouched.current = true; onChange({ ...v, outM: n === "" ? "" : Math.round(Number(n) || 0) }); };
  return (
    <div className={`rounded-xl border border-gray-200 bg-gray-50 ${compact ? "p-2.5" : "p-3"} space-y-2`}>
      <div className="text-[12px] font-bold text-[#1B2B4B]">자동 출근 반경 <span className="text-gray-400 font-semibold">(출근지에서 이 거리 안으로 들어오면 출근)</span></div>
      <div className="flex flex-wrap items-center gap-1.5">
        {RADIUS_PRESETS.map((n) => <button key={n} type="button" onClick={() => setIn(n)} className={chip(v.inM === n)}>{n}m</button>)}
        <input type="number" min={MIN_RADIUS} step="1" value={v.inM} onChange={(e) => onChange({ ...v, inM: e.target.value === "" ? "" : Number(e.target.value) })} onBlur={(e) => { if (Number(e.target.value) !== Number(v.inM) || e.target.value === "") setIn(e.target.value || MIN_RADIUS); else setIn(v.inM); }}
          className="w-20 h-8 px-2 rounded-lg border-2 border-gray-200 text-[12px] font-bold text-[#1B2B4B] outline-none focus:border-[#1B2B4B]" /><span className="text-[12px] text-gray-500">m</span>
      </div>
      <div className="text-[12px] font-bold text-[#1B2B4B]">자동 퇴근 거리 <span className="text-gray-400 font-semibold">(출근지에서 이만큼 멀어지면 퇴근)</span></div>
      <div className="flex items-center gap-1.5">
        <input type="number" min={(Number(v.inM) || MIN_RADIUS) + 20} step="1" value={v.outM} onChange={(e) => setOut(e.target.value)} onBlur={() => { const inM = Number(v.inM) || MIN_RADIUS; if (!(Number(v.outM) >= inM + 20)) onChange({ ...v, outM: inM + 20 }); }}
          className="w-24 h-8 px-2 rounded-lg border-2 border-gray-200 text-[12px] font-bold text-[#1B2B4B] outline-none focus:border-[#1B2B4B]" /><span className="text-[12px] text-gray-500">m (출근 반경보다 20m 이상 크게)</span>
      </div>
      {Number(v.inM) <= 30 && (
        <div className="text-[11px] text-[#B54708] font-semibold leading-relaxed">※ 휴대폰 GPS는 실내·건물 사이에서 10~30m 정도 오차가 날 수 있어, 반경을 아주 작게 잡으면 자동 출근이 늦거나 안 될 수 있습니다. 그럴 땐 상단 [출근하기] 버튼을 눌러 주세요.</div>
      )}
    </div>
  );
}
