// ======================= src/freight/FreightMobile.jsx =======================
// 📱 2026-11-12 휴대폰용 업무 화면(컨테이너 · 해상 · 항공 · 통합 · 내륙 인계함) — 기존 모바일 화면 위에 꽉 차게 덮는다
//  머리말(업무 전환 · 닫기) + 옆으로 미는 화면 탭 + 본문(PC와 같은 화면을 좁은 폭에 맞춰 그린다)
import React from "react";
import { bizInfo, bizPages, bizFirstMenu, bizMenuKey, parseBizMenu } from "../bizModules";
import FreightWorkspace from "./FreightWorkspace";
import BizSwitcher from "./BizSwitcher";
import { MONO, NAVY, GRID } from "./ui";

export default function FreightMobile({ biz, modules, canGroup, onBiz, onClose, ...rest }) {
  const first = biz === "inland" ? bizMenuKey("inland", "handoff") : bizFirstMenu(biz);
  const [menuKey, setMenuKey] = React.useState(first);
  React.useEffect(() => { if (parseBizMenu(menuKey).biz !== biz) setMenuKey(first); }, [biz]); // eslint-disable-line react-hooks/exhaustive-deps
  const bodyRef = React.useRef(null);
  React.useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [menuKey]);
  const info = bizInfo(biz);
  const pages = bizPages(biz);
  return (
    <div className="kp-pc-pop fixed inset-0 z-[2147480000] bg-[#F5F8FD] flex flex-col" data-testid="freight-mobile">
      <header className="shrink-0 text-white" style={{ background: `${GRID}, ${NAVY}`, paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="h-14 px-3 flex items-center gap-2">
          <button type="button" onClick={onClose} aria-label="배차 화면으로" className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 grid place-items-center text-[18px] font-black">‹</button>
          <div className="min-w-0 flex-1">
            <div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{info.en}</div>
            <div className="text-[16px] font-black leading-tight truncate">{biz === "inland" ? "내륙 인계함" : info.label}</div>
          </div>
          <BizSwitcher modules={modules} current={biz} canGroup={canGroup} onPick={onBiz} />
        </div>
        {pages.length > 1 && (
          <div className="flex gap-1 px-3 pb-2.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {pages.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMenuKey(k)}
                className={`shrink-0 h-9 px-3.5 rounded-xl text-[13px] font-extrabold whitespace-nowrap transition ${menuKey === k ? "bg-white text-[#0F1A30]" : "text-white/70 bg-white/[0.06]"}`}>{l}</button>
            ))}
          </div>
        )}
      </header>
      <div ref={bodyRef} className="flex-1 overflow-y-auto p-3" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 20px)" }}>
        <FreightWorkspace {...rest} bare menuKey={menuKey} modules={modules} onMenu={setMenuKey} onBiz={onBiz} />
      </div>
    </div>
  );
}
