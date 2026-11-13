// ======================= src/OrderStaffFields.jsx =======================
// 👤 2026-11-12 배차담당자 · 차량배정자 바꾸기 — 오더 복사/수정 패널 · 수정 창 공용 드롭다운
//  · 배차담당자 = 오더를 등록한 직원(등록자명 · createdByEmail …) — 평소 수정으로는 절대 안 바뀌게 잠겨 있다(patchDispatch)
//    여기서 고르면 _owner 를 실어 보내고, patchDispatch / 복사 등록이 그 값으로 등록자 칸을 바꾼다(src/orderOwner.js applyOwner)
//  · 차량배정자 = 배차확정자(차량을 배정한 직원 이름) — 고르면 _assignerSet 표시와 함께 그 이름을 저장(자동으로 "지금 저장한 사람"으로 덮지 않는다)
//  · 목록 = 우리 회사 직원(기사 · 화주 · 퇴사 · 승인대기 제외) — 직원 명부 실시간 구독 하나를 같이 쓴다(src/usersLive.js)
import React from "react";
import { createPortal } from "react-dom";
import { subscribeUsersLive } from "./usersLive";
import { staffOptionsOf, ownerOfOrder, matchOwner } from "./orderOwner";
import { useListKeys, arrowFocus } from "./useListKeys";

export function useStaffOptions() {
  const [staff, setStaff] = React.useState([]);
  React.useEffect(() => subscribeUsersLive((list) => setStaff(staffOptionsOf(list))), []);
  return staff;
}

// order: 지금 편집 중인 오더(copyTarget · editTarget) · setOrder: (fn) => …
// 🛠 2026-11-13 큰 드롭다운 두 칸 → [담당자 변경] 버튼 하나. 누르면 ① 배차담당자 / 차량배정자 중 무엇을 바꿀지 고르고 ② 이름을 찾아 고른다
//  · 차량번호가 아직 없는 오더(배차 전)는 차량배정자를 바꿀 수 없다 — 배차가 안 돼 배정한 사람이 없기 때문
export default function OrderStaffFields({ order, setOrder, disabled = false, className = "", staffList = null }) {
  const live = useStaffOptions();
  const staff = staffList || live; // staffList: 미리보기 · 점검용
  const owner = React.useMemo(() => order?._owner || matchOwner(ownerOfOrder(order || {}), staff), [order, staff]);
  const assigner = String(order?.배차확정자 || "").trim();
  const hasCar = !!String(order?.차량번호 || "").trim();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState(""); // "" | "owner" | "assigner"
  const [q, setQ] = React.useState("");
  const inputRef = React.useRef(null);
  const close = () => { setOpen(false); setKind(""); setQ(""); };
  React.useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === "Escape") { e.stopPropagation(); if (kind) { setKind(""); setQ(""); } else close(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [open, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (kind) setTimeout(() => inputRef.current?.focus(), 30); }, [kind]);
  const key = q.trim().toLowerCase();
  const list = staff.filter((s) => !key || `${s.name} ${s.team || ""} ${s.position || ""} ${s.email || ""}`.toLowerCase().includes(key));
  const cur = kind === "owner" ? owner?.name || "" : assigner;
  const pick = (s) => {
    if (kind === "owner") setOrder((p) => ({ ...p, _owner: s }));
    else setOrder((p) => ({ ...p, 배차확정자: s ? s.name : "", _assignerSet: true }));
    close();
  };
  // ⌨ 이름 목록 ↑/↓ · Enter (Esc 는 위 window 리스너) · 첫 화면(무엇을 바꿀지)은 ↑/↓ 로 버튼 사이 이동
  const rows = [...(kind === "assigner" && !key ? [null] : []), ...list];
  const off = rows.length - list.length;
  const keys = useListKeys({ open: open && !!kind, count: rows.length, resetKey: `${kind}|${q}`, onPick: (i) => pick(rows[i]) });
  const stageRef = React.useRef(null);
  const btnRef = React.useRef(null);
  const wasOpen = React.useRef(false);
  React.useEffect(() => { if (wasOpen.current && !open) btnRef.current?.focus?.(); wasOpen.current = open; }, [open]);
  const NAVY = "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)";
  return (
    <div className={`inline-flex items-center gap-2 ${className}`} data-order-staff onKeyDown={(e) => { if (open && !kind) arrowFocus(e, stageRef.current); }}>
      <span className="hidden sm:inline text-[12px] font-bold text-[#7A89A3] whitespace-nowrap">담당 <b className="text-[#0F1A30]">{owner?.name || "미지정"}</b>{hasCar ? <> · 배정 <b className="text-[#0F1A30]">{assigner || "미지정"}</b></> : null}</span>
      <button ref={btnRef} type="button" disabled={disabled} onClick={() => setOpen(true)} data-testid="staff-change"
        className="h-8 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#1B2B4B] hover:border-[#2D4C82] whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5" /><path d="M17 8h5M19.5 5.5v5" /></svg>
        담당자 변경
      </button>
      {open && createPortal(
        <div className="kp-pc-pop fixed inset-0 z-[2147483000] flex items-center justify-center p-4" data-kp-dialog>
          <div className="absolute inset-0 bg-[#0B1428]/55 backdrop-blur-[2px]" onClick={close} />
          <div className="relative w-[min(420px,96vw)] rounded-2xl bg-white shadow-[0_30px_80px_rgba(6,12,26,.5)] overflow-hidden flex flex-col" style={{ maxHeight: "min(600px, 88vh)" }}>
            <div className="px-5 py-4 text-white flex items-start gap-3 shrink-0" style={{ background: NAVY }}>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">CHANGE STAFF</div>
                <div className="text-[17px] font-black leading-tight mt-0.5">{kind === "owner" ? "배차담당자 변경" : kind === "assigner" ? "차량배정자 변경" : "담당자 변경"}</div>
                <div className="text-[12.5px] font-semibold text-white/60 mt-0.5">{kind ? `지금: ${cur || "미지정"}` : "무엇을 바꿀지 고르세요"}</div>
              </div>
              <button type="button" onClick={close} aria-label="닫기" className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-[15px] font-black shrink-0">✕</button>
            </div>
            {!kind ? (
              <div ref={stageRef} className="p-4 space-y-2.5">
                <button type="button" onClick={() => setKind("owner")} data-testid="staff-kind-owner"
                  className="w-full text-left rounded-xl border border-[#DCE3EE] px-4 py-3.5 hover:border-[#2D4C82] hover:bg-[#F5F8FD] transition flex items-center gap-3">
                  <span className="min-w-0 flex-1"><span className="block text-[15px] font-black text-[#0F1A30]">배차담당자</span><span className="block text-[12.5px] font-semibold text-[#7A89A3]">이 오더를 맡은 직원 · 지금 {owner?.name || "미지정"}</span></span>
                  <span className="text-[#9AA9C3] font-black">›</span>
                </button>
                <button type="button" disabled={!hasCar} onClick={() => setKind("assigner")} data-testid="staff-kind-assigner"
                  className="w-full text-left rounded-xl border border-[#DCE3EE] px-4 py-3.5 enabled:hover:border-[#2D4C82] enabled:hover:bg-[#F5F8FD] transition flex items-center gap-3 disabled:bg-[#F5F8FD] disabled:cursor-not-allowed">
                  <span className="min-w-0 flex-1"><span className={`block text-[15px] font-black ${hasCar ? "text-[#0F1A30]" : "text-[#9AA9C3]"}`}>차량배정자</span>
                    <span className="block text-[12.5px] font-semibold text-[#7A89A3]">{hasCar ? `차량을 배정한 직원 · 지금 ${assigner || "미지정"}` : "아직 차량이 배정되지 않아 바꿀 수 없습니다. 차량번호를 먼저 넣어 주세요."}</span></span>
                  {hasCar && <span className="text-[#9AA9C3] font-black">›</span>}
                </button>
              </div>
            ) : (
              <>
                <div className="px-4 pt-4 pb-2 shrink-0 flex items-center gap-2">
                  <button type="button" onClick={() => { setKind(""); setQ(""); }} className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[13px] font-black text-[#1B2B4B] hover:border-[#2D4C82] whitespace-nowrap">‹ 뒤로</button>
                  <div className="relative flex-1">
                    <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 부서로 찾기" data-testid="staff-search"
                      onKeyDown={(e) => { if (keys.onKeyDown(e)) return; if (e.key === "Enter" && !e.nativeEvent?.isComposing && list.length === 1) pick(list[0]); }}
                      className="w-full h-10 border border-[#DCE3EE] rounded-xl pl-9 pr-3 text-[14px] font-bold text-[#0F1A30] placeholder:text-[#9AA9C3] placeholder:font-medium focus:outline-none focus:border-[#2D4C82]" />
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA9C3]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                  </div>
                </div>
                <div ref={keys.listRef} className="px-2 pb-3 overflow-y-auto flex-1">
                  {kind === "assigner" && !key && <button type="button" {...keys.itemProps(0)} onClick={() => pick(null)} className={`w-full text-left px-3 h-11 rounded-xl text-[13.5px] font-bold text-[#7A89A3] hover:bg-[#F5F8FD] ${keys.active(0) ? "bg-[#F5F8FD]" : ""}`}>미지정(비우기)</button>}
                  {list.map((s, i) => { const on = kind === "owner" ? owner?.key === s.key : assigner === s.name; const act = keys.active(i + off); return (
                    <button key={s.key} type="button" {...keys.itemProps(i + off)} onClick={() => pick(s)}
                      className={`w-full text-left px-3 h-12 rounded-xl flex items-center gap-3 transition ${on ? `bg-[#0F1A30] text-white ${act ? "ring-2 ring-inset ring-[#8FB0F0]" : ""}` : `hover:bg-[#F5F8FD] text-[#0F1A30] ${act ? "bg-[#F5F8FD]" : ""}`}`}>
                      <span className={`w-8 h-8 rounded-full grid place-items-center text-[12.5px] font-black shrink-0 ${on ? "bg-white/15" : "bg-[#EEF3FB] text-[#1B2B4B]"}`}>{String(s.name).slice(0, 1)}</span>
                      <span className="min-w-0 flex-1"><span className="block text-[14px] font-black truncate">{s.name}</span>{(s.team || s.position) && <span className={`block text-[11.5px] font-semibold truncate ${on ? "text-white/60" : "text-[#7A89A3]"}`}>{[s.team, s.position].filter(Boolean).join(" · ")}</span>}</span>
                      {on && <span className="text-[11.5px] font-black">지금</span>}
                    </button>
                  ); })}
                  {!list.length && <div className="py-10 text-center text-[13px] font-bold text-[#9AA9C3]">찾는 직원이 없습니다</div>}
                </div>
              </>
            )}
          </div>
        </div>, document.body)}
    </div>
  );
}
