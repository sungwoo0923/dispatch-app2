// ======================= src/KpSubNav.jsx =======================
// ⭐ 속메뉴 공용 왼쪽 사이드바(2026-10-28) — 관리자메뉴처럼 거래처관리·매출관리·정산관리·관리센터·배차현황의
//  속메뉴를 왼쪽 메뉴바로 보여준다. 접기(아이콘만)를 누르면 본문이 넓어진다(PC에 기억).
//  items: [{ key, label, icon, badge, en, sub }]  /  groups: [{ label, items }]  (둘 중 하나)
//   - badge: 숫자(카톡처럼 개수) 또는 "N"(새 글), soft: true면 빨간 대신 옅은 배지(예약·임시보관 개수 등) / sub: 하위메뉴 [{ key, label, icon, badge }] — 부모나 하위가 열려 있으면 펼친다
//   - children: sub와 같은 뜻(⭐ 2026-11-01 접이식 하위메뉴) — 부모를 누르면 아래로 부드럽게 펼쳐지고(첫 하위 화면으로), 한 번 더 누르면 접힌다
//  actions: [{ key, label, icon, onClick }] — 화면 전환 대신 팝업을 여는 버튼(예: 월 비교 분석)
import React, { useState } from "react";
import { ShellIcon } from "./AdminShell";
import { confirmLeave } from "./leaveGuard";
import { useSubnavTarget } from "./navMenus";
// ✋ 작성 중인 문서가 있으면 메뉴를 옮기기 전에 저장할지 묻는다(전자결재·증명서 등)
// ⭐ 2026-11-01 하위메뉴는 sub 또는 children 어느 쪽으로 줘도 된다
const kidsOf = (it) => (Array.isArray(it.children) && it.children.length ? it.children : Array.isArray(it.sub) && it.sub.length ? it.sub : null);
const goSel = (fn, k, act) => { if (k === act) { fn?.(k); return; } confirmLeave().then((ok) => { if (ok) fn?.(k); }); };

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";

// 📱 휴대폰 폭(모바일 앱에서 PC 화면을 그대로 쓸 때) — 왼쪽 메뉴 대신 위쪽 가로 탭으로 보여준다
export function useIsPhone() {
  const q = () => typeof window !== "undefined" && window.innerWidth < 768;
  const [phone, setPhone] = useState(q);
  React.useEffect(() => {
    const on = () => setPhone(q());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return phone;
}

function PhoneSubNav({ code, title, icon, groups, actions, active, onSelect, children }) {
  const flat = [];
  groups.forEach((g) => g.items.forEach((it) => { const ks = kidsOf(it); if (ks) ks.forEach((x) => flat.push({ ...x, en: x.en || it.en })); else flat.push(it); }));
  const cur = flat.find((it) => it.key === active);
  const barRef = React.useRef(null);
  React.useEffect(() => {
    const el = barRef.current?.querySelector("[data-on='1']");
    if (el) el.scrollIntoView({ inline: "center", block: "nearest" });
  }, [active]);
  const hasBadge = (b) => (typeof b === "string" ? !!b : b > 0);
  return (
    <div className="bg-[#F4F6FA] min-h-full">
      <div className="relative text-white shadow-[0_8px_20px_rgba(15,26,48,0.18)]" style={{ background: "linear-gradient(120deg, #0B1428 0%, #1B2B4B 60%, #2D4C82 100%)" }}>
        <div className="px-3.5 pt-3 pb-2 flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center shrink-0"><ShellIcon name={icon} size={17} /></span>
          <div className="min-w-0 flex-1">
            <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.22em" }} className="text-[#8FB0F0] truncate">{code}{cur?.en ? ` · ${cur.en}` : ""}</div>
            <div className="text-[16px] font-black truncate leading-tight">{cur?.label || title}</div>
          </div>
        </div>
        <div ref={barRef} className="flex gap-1.5 px-3 pb-2.5 overflow-x-auto no-scrollbar" style={{ scrollbarWidth: "none" }}>
          {flat.map((it) => {
            const on = it.key === active;
            return (
              <button key={it.key} type="button" data-on={on ? "1" : "0"} onClick={() => goSel(onSelect, it.key, active)}
                className={`relative shrink-0 h-8 px-3 rounded-full text-[12.5px] font-black whitespace-nowrap flex items-center gap-1.5 transition ${on ? "bg-white text-[#0F1A30] shadow-[0_4px_12px_rgba(0,0,0,0.25)]" : "bg-white/[0.08] text-white/75 ring-1 ring-white/10"}`}>
                <ShellIcon name={it.icon} size={13} className={on ? "text-[#2D4C82]" : "text-[#8FB0F0]"} />
                {it.label}
                {hasBadge(it.badge) && <span className={`min-w-[16px] h-4 px-1 rounded-full text-[10px] font-extrabold flex items-center justify-center ${on ? "bg-[#1B2B4B] text-white" : it.soft ? "bg-white/20 text-white" : "bg-rose-500 text-white"}`}>{typeof it.badge === "number" && it.badge > 99 ? "99+" : it.badge}</span>}
              </button>
            );
          })}
          {actions.map((a) => (
            <button key={a.key} type="button" onClick={a.onClick}
              className="shrink-0 h-8 px-3 rounded-full text-[12.5px] font-bold whitespace-nowrap flex items-center gap-1.5 border border-dashed border-white/25 text-white/70">
              <ShellIcon name={a.icon} size={13} className="text-[#8FB0F0]" />{a.label}
            </button>
          ))}
        </div>
      </div>
      <main className="kp-phone-body px-3 py-3 min-w-0">{children}</main>
    </div>
  );
}

export default function KpSubNav({ code = "MENU", title, icon = "dashboard", items, groups, actions = [], actionsLabel = "도구", active, onSelect, children, bodyClass = "px-6 py-5", noBleed = false }) {
  const phone = useIsPhone();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("kpSubNavCollapsed") === "1"; } catch { return false; } });
  const toggle = () => setCollapsed((v) => { try { localStorage.setItem("kpSubNavCollapsed", v ? "0" : "1"); } catch { /* 저장 실패 무시 */ } return !v; });
  const gs = groups || [{ label: "", items: items || [] }];
  // ⭐ 2026-11-01 상단 메뉴에서 고른 세부 메뉴로 바로 이동(navMenus.jsx)
  // ⭐ 2026-11-01 버그수정 — 하위메뉴를 sub로 준 화면(기사관리·홈 메일함 등)은 하위 항목이 이동 대상에서 빠져 눌러도 안 움직였다(kidsOf로 sub·children 모두)
  //   부모 항목(하위메뉴 있는 것)으로 오면 첫 하위 화면으로 연다. 하위가 많으면(메일함 폴더 등) 부모 하나로만 보여 준다
  //   도구 버튼(actions — 단가표 직접 작성·발행 이력 등)도 상단 세부 메뉴에서 누르면 그 버튼이 실행된다
  const subnavItems = gs.flatMap((g) => g.items || []);
  const subnavActs = (actions || []).filter((a) => a?.key && typeof a.onClick === "function");
  useSubnavTarget(code, [...subnavItems.flatMap((it) => [it.key, ...((kidsOf(it) || []).map((c) => c.key))]), ...subnavActs.map((a) => a.key)],
    (k) => {
      const act = subnavActs.find((a) => a.key === k); if (act) { act.onClick(); return; }
      const p = subnavItems.find((it) => it.key === k); const ks = p && kidsOf(p); onSelect?.(ks ? ks[0].key : k);
    },
    [...subnavItems.flatMap((it) => { const ks = kidsOf(it); return ks && ks.length <= 6 ? ks.map((c) => [c.key, `${it.label} › ${c.label}`]) : [[it.key, it.label]]; }),
      ...subnavActs.filter((a) => !/^a\d+$/.test(a.key)).map((a) => [a.key, a.label])].filter(([k]) => !String(k).startsWith("lock:")));
  // 하위메뉴(사내메일함 등) 접기 — 펼쳐진 부모를 한 번 더 누르면 접히고, 다시 누르면 펼쳐진다(보던 화면은 그대로)
  const [folded, setFolded] = useState({});

  const hasBadge = (b) => (typeof b === "string" ? !!b : b > 0);
  const badgeTxt = (b) => (typeof b === "number" && b > 99 ? "99+" : b);
  const Btn = ({ it, on, onClick, sub = false, caret = null, inside = false }) => (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? it.label : undefined}
      data-on={on ? "1" : "0"}
      className={`kp-subnav-item w-full flex items-center gap-3 rounded-xl font-semibold transition ${sub ? "text-[13px]" : "text-[14px]"} ${collapsed ? "justify-center px-0 py-2.5" : sub ? "pl-2.5 pr-3 py-1.5" : "px-3 py-2.5"} ${
        on ? "bg-white text-[#1B2B4B] shadow-[0_6px_16px_rgba(0,0,0,0.22)]" : inside ? "bg-white/[0.07] text-white" : "text-blue-50/80 hover:bg-white/[0.08] hover:text-white"
      }`}
    >
      <span className={`relative rounded-lg flex items-center justify-center shrink-0 ${sub ? "w-6 h-6" : "w-8 h-8"} ${on ? "bg-[#EEF3FB]" : "bg-white/[0.06]"}`}>
        <ShellIcon name={it.icon} size={sub ? 14 : 17} className={on ? "text-[#1B2B4B]" : "text-blue-200/85"} />
        {collapsed && hasBadge(it.badge) && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500" />}
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 min-w-0 text-left">
            <span className="block truncate">{it.label}</span>
            {it.en && <span className="block truncate" style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.18em", opacity: on ? 0.55 : 0.45 }}>{it.en}</span>}
          </span>
          {hasBadge(it.badge) && (
            <span title={it.badgeTitle} className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-extrabold flex items-center justify-center tabular-nums ${typeof it.badge === "string" ? "tracking-wider " : ""}${on ? "bg-[#1B2B4B] text-white" : it.soft ? "bg-white/15 text-white" : "bg-rose-500 text-white"}`}>{badgeTxt(it.badge)}</span>
          )}
          {caret && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60" style={{ transform: caret === "up" ? "rotate(180deg)" : "none", transition: "transform .28s cubic-bezier(.2,.8,.2,1)" }}><path d="M6 9l6 6 6-6" /></svg>}
        </>
      )}
    </button>
  );

  if (phone) return <PhoneSubNav code={code} title={title} icon={icon} groups={gs} actions={actions} active={active} onSelect={onSelect}>{children}</PhoneSubNav>;
  return (
    <div className={`flex bg-[#F4F6FA] overflow-hidden ${noBleed ? "rounded-[20px]" : "-m-4"}`} style={{ height: noBleed ? "calc(100vh - 88px)" : "calc(100vh - 80px)" }}>
      <aside
        className="kp-subnav-aside shrink-0 h-full flex flex-col text-white transition-[width] duration-200"
        style={{ width: collapsed ? 72 : 228, background: "linear-gradient(180deg, #16264A 0%, #1B2B4B 55%, #14213D 100%)" }}
      >
        <div className={`pt-5 pb-4 border-b border-white/10 flex items-center gap-3 ${collapsed ? "px-0 justify-center" : "px-4"}`}>
          <button type="button" onClick={collapsed ? toggle : undefined} title={collapsed ? "메뉴 펼치기" : undefined} className={`w-10 h-10 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center shrink-0 ${collapsed ? "cursor-pointer hover:bg-white/20" : "cursor-default"}`}>
            <ShellIcon name={icon} size={19} />
          </button>
          {!collapsed && (
            <div className="min-w-0">
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.22em" }} className="text-blue-200/70">{code}</div>
              <div className="text-[15.5px] font-bold truncate">{title}</div>
            </div>
          )}
        </div>
        <nav className={`flex-1 overflow-y-auto py-4 space-y-5 no-scrollbar ${collapsed ? "px-2" : "px-3"}`}>
          {gs.map((g, gi) => (
            <div key={g.label || gi}>
              {g.label && !collapsed && <div className="px-3 mb-1.5 text-[11px] font-bold text-blue-200/45">{g.label}</div>}
              <div className="space-y-1">
                {g.items.map((it) => {
                  const kids = kidsOf(it);
                  const inside = !!kids && (it.key === active || kids.some((x) => x.key === active));
                  const open = inside && !folded[it.key];
                  const clickParent = () => {
                    if (!kids) { goSel(onSelect, it.key, active); return; }
                    if (inside) { setFolded((f) => ({ ...f, [it.key]: !f[it.key] })); return; }
                    setFolded((f) => ({ ...f, [it.key]: false }));
                    goSel(onSelect, kids[0].key, active);
                  };
                  return (
                    <div key={it.key}>
                      <Btn it={it} on={it.key === active || (inside && collapsed) || (inside && !open)} inside={inside && open && !collapsed} caret={kids && !collapsed ? (open ? "up" : "down") : null} onClick={clickParent} />
                      {/* ⭐ 2026-11-01 하위메뉴 펼침·접힘 — 높이를 부드럽게(grid 0fr↔1fr) */}
                      {kids && !collapsed && (
                        <div aria-hidden={!open} style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, visibility: open ? "visible" : "hidden", transition: `grid-template-rows .3s cubic-bezier(.2,.8,.2,1), opacity .22s ease, visibility 0s linear ${open ? "0s" : ".3s"}` }}>
                          <div className="min-h-0 overflow-hidden">
                            <div className="ml-[26px] mt-1 mb-1.5 pl-2 border-l border-white/15 space-y-0.5">
                              {kids.map((x) => <Btn key={x.key} it={x} sub on={x.key === active} onClick={() => goSel(onSelect, x.key, active)} />)}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {actions.length > 0 && (
            <div>
              {!collapsed && <div className="px-3 mb-1.5 text-[11px] font-bold text-blue-200/45">{actionsLabel}</div>}
              <div className="space-y-1">
                {actions.map((a) => <Btn key={a.key} it={a} on={false} onClick={a.onClick} />)}
              </div>
            </div>
          )}
        </nav>
        <button type="button" onClick={toggle} className={`relative z-[5] shrink-0 h-10 rounded-xl text-[12.5px] font-bold border flex items-center justify-center gap-2 ${collapsed ? "mx-2 my-3 !h-12 flex-col !gap-0.5 !text-[10.5px] bg-white/10 text-white border-white/20 hover:bg-white/20" : "m-3 text-blue-100/70 hover:text-white hover:bg-white/[0.08] border-white/10"}`} title={collapsed ? "메뉴 펼치기" : "메뉴 접기"}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? "rotate(180deg)" : "none" }}><path d="M15 6l-6 6 6 6" /></svg>
          {collapsed ? "펼치기" : "메뉴 접기"}
        </button>
      </aside>
      <main className={`flex-1 min-w-0 h-full overflow-y-auto ${bodyClass}`}>{children}</main>
    </div>
  );
}
