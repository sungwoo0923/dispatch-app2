// ======================= src/BirthdayPopup.jsx =======================
// 🎂 생일 알림(2026-11-02)
//  ① 생일 당일 — 본인이 프로그램(PC·모바일)에 들어오면 축하 창을 그 해에 한 번 띄운다(users.birthdayPopupYear)
//  ② 생일 3일 전 — 같은 회사 동료에게(생일인 본인은 제외) "3일 뒤 ○○○님 생일" 안내를 한 번 띄운다
//     휴대폰 푸시는 서버(functions › birthdayReminders, 매일 아침)가 같은 기준으로 보낸다
//  생년월일은 users.birthDate("YYYY-MM-DD", 회원가입·이력서에서 입력)
import React from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useCompanyStaff } from "./InternalMail";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const GOLD = "#E9C46A";
const kstNow = () => new Date(Date.now() + 9 * 3600e3);
const md = (d) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const mdOf = (birth) => { const m = String(birth || "").match(/^\d{4}-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}` : ""; };
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 무시 */ } } };

function Confetti() {
  const pieces = React.useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    left: (i * 29) % 100, delay: (i % 10) * 0.3, dur: 3 + (i % 5) * 0.5, w: 6 + (i % 3) * 3, rot: (i * 53) % 360,
    c: ["#E9C46A", "#F4E2A8", "#8FB0F0", "#FFFFFF", "#F2A7B5"][i % 5],
  })), []);
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {pieces.map((p, i) => <span key={i} style={{ position: "absolute", top: -16, left: `${p.left}%`, width: p.w, height: p.w * 1.6, background: p.c, borderRadius: 2, opacity: 0.85, transform: `rotate(${p.rot}deg)`, animation: `kpbd ${p.dur}s linear ${p.delay}s infinite` }} />)}
    </div>
  );
}

export default function BirthdayPopup({ uid, profile, company, mobile = false }) {
  const now = kstNow();
  const year = now.getUTCFullYear();
  const today = md(now);
  const d3 = md(new Date(now.getTime() + 3 * 86400e3));
  const myMd = mdOf(profile?.birthDate);
  const [closed, setClosed] = React.useState(false);
  const selfKey = `kpBirthday:${uid}:${year}`;
  const showSelf = !!(uid && myMd && myMd === today && Number(profile?.birthdayPopupYear || 0) !== year && ls.get(selfKey) !== "1" && !closed);

  // 동료 3일 전 안내
  const staff = useCompanyStaff(company || profile?.companyName || "");
  const upcoming = React.useMemo(() => (staff || []).filter((u) => u.uid !== uid && mdOf(u.birthDate) === d3), [staff, uid, d3]);
  const remindKey = `kpBirthdayD3:${uid}:${year}:${d3}`;
  const [remClosed, setRemClosed] = React.useState(false);
  const showRemind = !!(uid && !showSelf && upcoming.length && ls.get(remindKey) !== "1" && !remClosed);

  const closeSelf = React.useCallback(() => {
    setClosed(true); ls.set(selfKey, "1");
    if (uid) setDoc(doc(db, "users", uid), { birthdayPopupYear: year }, { merge: true }).catch(() => {});
  }, [uid, selfKey, year]);
  const closeRemind = () => { setRemClosed(true); ls.set(remindKey, "1"); };

  React.useEffect(() => {
    if (!showSelf) return undefined;
    const k = (e) => { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); closeSelf(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [showSelf, closeSelf]);

  if (showSelf) {
    const name = `${profile?.name || ""}${profile?.position ? ` ${profile.position}` : ""}님`;
    const co = company || profile?.companyName || "";
    return (
      <div data-kp-dialog style={{ position: "fixed", inset: 0, zIndex: 2147483600, background: "rgba(8,14,30,.62)", display: "flex", alignItems: mobile ? "flex-end" : "center", justifyContent: "center", padding: mobile ? 0 : 16, fontFamily: "'Noto Sans KR',sans-serif" }}>
        <style>{"@keyframes kpbd{0%{transform:translateY(0) rotate(0)}100%{transform:translateY(560px) rotate(540deg)}}@keyframes kpbdin{from{transform:translateY(14px) scale(.97);opacity:0}to{transform:none;opacity:1}}"}</style>
        <div role="dialog" aria-modal="true" aria-label="생일 축하" style={{ width: mobile ? "100%" : "min(460px,100%)", maxHeight: "92vh", overflowY: "auto", borderRadius: mobile ? "24px 24px 0 0" : 24, background: "#fff", boxShadow: "0 36px 90px rgba(8,14,30,.5)", animation: "kpbdin .22s ease-out" }}>
          <div style={{ position: "relative", padding: "32px 26px 26px", color: "#fff", textAlign: "center", background: "radial-gradient(120% 90% at 50% 0%,#2D4C82 0%,#1B2B4B 48%,#0B1428 100%)", overflow: "hidden" }}>
            <Confetti />
            <div style={{ position: "relative" }}>
              <div style={{ width: 68, height: 68, margin: "0 auto 14px", borderRadius: 999, display: "grid", placeItems: "center", background: "rgba(233,196,106,.14)", border: `1.5px solid ${GOLD}` }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21h16" /><path d="M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7" /><path d="M5 16c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0" /><path d="M12 12V8" /><path d="M12 5.5c.8-.9.8-1.8 0-2.5-.8.7-.8 1.6 0 2.5z" /></svg>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.32em", color: GOLD }}>HAPPY BIRTHDAY</div>
              <div style={{ fontSize: mobile ? 22 : 24, fontWeight: 900, marginTop: 6, lineHeight: 1.35, wordBreak: "keep-all" }}>생일을 진심으로 축하드립니다</div>
              <div style={{ marginTop: 8, fontSize: 13.5, fontWeight: 700, color: "#C9D6EE" }}>{name}{profile?.team ? ` · ${profile.team}` : ""}</div>
            </div>
          </div>
          <div style={{ padding: "22px 24px 6px", fontSize: 14.5, lineHeight: 1.8, color: "#2A3A56", fontWeight: 600, wordBreak: "keep-all" }}>
            <p style={{ margin: 0 }}>{name}, 오늘은 특별한 하루입니다.</p>
            <p style={{ margin: "8px 0 0" }}>늘 곁에서 함께해 주셔서 감사합니다. 오늘 하루는 일보다 웃음이 더 많은 날이 되기를 바랍니다.</p>
            <p style={{ margin: "8px 0 0" }}>새로운 한 해도 건강하고 행복한 일만 가득하시길 응원합니다.</p>
            <div style={{ marginTop: 14, textAlign: "right", fontSize: 13, fontWeight: 900, color: "#1B2B4B" }}>{co} 임직원 일동</div>
          </div>
          <div style={{ padding: `16px 24px ${mobile ? "calc(20px + env(safe-area-inset-bottom))" : "22px"}` }}>
            <button type="button" autoFocus onClick={closeSelf} style={{ width: "100%", height: 50, borderRadius: 14, border: "none", cursor: "pointer", fontSize: 15.5, fontWeight: 900, color: "#0B1428", background: `linear-gradient(120deg,${GOLD},#F4E2A8)`, boxShadow: "0 10px 24px rgba(201,162,75,.35)" }}>감사합니다</button>
          </div>
        </div>
      </div>
    );
  }

  if (showRemind) {
    const [, mm, dd] = [0, ...d3.split("-")];
    return (
      // ⭐ 2026-11-02 화면 점검 — 모바일: 메뉴 서랍(z-40)·바텀시트(z-9999 이상)보다 아래(z 30)로 내려 열린 메뉴를 가리지 않게
      //   PC: 오른쪽 아래 떠 있는 버튼(메신저·계산기·AI, 오른쪽 16px·폭 44px) 왼쪽으로 비켜서 버튼을 가리지 않게
      <div style={{ position: "fixed", left: mobile ? 12 : "auto", right: mobile ? 12 : 72, bottom: mobile ? 96 : 24, zIndex: mobile ? 30 : 999970, width: mobile ? "auto" : 340, maxWidth: mobile ? "none" : "calc(100vw - 96px)", fontFamily: "'Noto Sans KR',sans-serif" }}>
        <div style={{ borderRadius: 18, overflow: "hidden", background: "#fff", boxShadow: "0 18px 44px rgba(15,26,48,0.28)", border: "1px solid rgba(15,26,48,0.08)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px 12px" }}>
            <span style={{ width: 40, height: 40, borderRadius: 13, flexShrink: 0, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#0F1A30,#2D4C82)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21h16" /><path d="M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7" /><path d="M12 12V8" /></svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.14em", color: "#4B6CB7" }}>생일 D-3 · {Number(mm)}월 {Number(dd)}일</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#0F1A30", marginTop: 2, lineHeight: 1.4 }}>
                {upcoming.slice(0, 3).map((u) => `${u.name || ""}${u.position ? ` ${u.position}` : ""}님`).join(", ")}{upcoming.length > 3 ? ` 외 ${upcoming.length - 3}명` : ""}의 생일이 3일 남았어요
              </div>
              <div style={{ fontSize: 12.5, color: "#5A6A85", marginTop: 2 }}>미리 축하 인사를 준비해 보세요</div>
            </div>
            <button type="button" onClick={closeRemind} style={{ width: 24, height: 24, borderRadius: 999, border: "none", background: "transparent", color: "#9AA9C3", cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
