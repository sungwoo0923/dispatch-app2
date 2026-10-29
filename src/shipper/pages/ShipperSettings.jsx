import { useState } from "react";

import SettingsProfile from "./SettingsProfile";
import SettingsUsers from "./SettingsUsers";
import SettingsTransport from "./SettingsTransport";
import SettingsAddress from "./SettingsAddress";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
// ⭐ 2026-10-29 리디자인 — 왼쪽 메뉴를 운송사 프로그램과 같은 어두운 네이비 패널로
const MENUS = [
  ["profile", "COMPANY", "회사 설정", "회사·은행·연락처 정보", "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"],
  ["users", "USERS", "이용자관리", "직원 계정과 권한", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"],
  ["transport", "CARRIERS", "운송사관리", "연결된 운송사", "M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5"],
  ["address", "ADDRESS", "주소록관리", "상·하차지 주소록", "M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6"],
];

export default function ShipperSettings() {
  const [menu, setMenu] = useState("profile");

  return (
    <div className="flex gap-5 items-start">

      {/* ===== 좌측 메뉴 ===== */}
      <aside className="w-[250px] shrink-0 sticky top-[84px] rounded-[22px] overflow-hidden text-white shadow-[0_18px_40px_rgba(11,20,40,0.28)]"
        style={{ background: "radial-gradient(120% 70% at 20% 0%, #22396A 0%, #0F1A30 55%, #0B1428 100%)" }}>
        <div className="relative px-5 pt-5 pb-4 border-b border-white/10">
          <span className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "18px 18px" }} />
          <div className="relative text-[10px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>MASTER SETTINGS</div>
          <div className="relative text-[17px] font-black mt-0.5">마스터설정</div>
        </div>
        <nav className="p-3 space-y-1">
          {MENUS.map(([k, en, label, desc, icon]) => {
            const on = menu === k;
            return (
              <button key={k} type="button" onClick={() => setMenu(k)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-left transition ${on ? "bg-white/[0.12] ring-1 ring-[#8FB0F0]/40 shadow-[0_0_18px_rgba(110,149,232,0.18)]" : "hover:bg-white/[0.06]"}`}>
                <span className={`w-9 h-9 rounded-[11px] flex items-center justify-center shrink-0 ${on ? "bg-[#8FB0F0] text-[#0B1428]" : "bg-white/[0.07] text-[#CFE0FF]"}`}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-[9.5px] font-extrabold tracking-[0.2em] text-[#8FB0F0]/80" style={{ fontFamily: MONO }}>{en}</span>
                  <span className={`block text-[14px] font-extrabold leading-tight ${on ? "text-white" : "text-white/80"}`}>{label}</span>
                  <span className="block text-[11px] text-white/45 truncate">{desc}</span>
                </span>
              </button>
            );
          })}
        </nav>
        <div className="px-5 py-3 border-t border-white/10 text-[10px] tracking-[0.2em] text-white/35" style={{ fontFamily: MONO }}>KP-FLOW · SHIPPER</div>
      </aside>

      {/* ===== 우측 ===== */}
      <div className="flex-1 min-w-0">
        {menu === "profile" && <SettingsProfile />}
        {menu === "users" && <SettingsUsers />}
        {menu === "transport" && <SettingsTransport />}
        {menu === "address" && <SettingsAddress />}
      </div>
    </div>
  );
}
