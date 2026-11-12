// ======================= src/OrderStaffFields.jsx =======================
// 👤 2026-11-12 배차담당자 · 차량배정자 바꾸기 — 오더 복사/수정 패널 · 수정 창 공용 드롭다운
//  · 배차담당자 = 오더를 등록한 직원(등록자명 · createdByEmail …) — 평소 수정으로는 절대 안 바뀌게 잠겨 있다(patchDispatch)
//    여기서 고르면 _owner 를 실어 보내고, patchDispatch / 복사 등록이 그 값으로 등록자 칸을 바꾼다(src/orderOwner.js applyOwner)
//  · 차량배정자 = 배차확정자(차량을 배정한 직원 이름) — 고르면 _assignerSet 표시와 함께 그 이름을 저장(자동으로 "지금 저장한 사람"으로 덮지 않는다)
//  · 목록 = 우리 회사 직원(기사 · 화주 · 퇴사 · 승인대기 제외) — 직원 명부 실시간 구독 하나를 같이 쓴다(src/usersLive.js)
import React from "react";
import CustomSelect from "./CustomSelect";
import { subscribeUsersLive } from "./usersLive";
import { staffOptionsOf, ownerOfOrder, matchOwner } from "./orderOwner";

export function useStaffOptions() {
  const [staff, setStaff] = React.useState([]);
  React.useEffect(() => subscribeUsersLive((list) => setStaff(staffOptionsOf(list))), []);
  return staff;
}

// order: 지금 편집 중인 오더(copyTarget · editTarget) · setOrder: (fn) => …
export default function OrderStaffFields({ order, setOrder, disabled = false, className = "", selectClass = "", labelClass = "", staffList = null }) {
  const live = useStaffOptions();
  const staff = staffList || live; // staffList: 미리보기 · 점검용
  const owner = React.useMemo(() => order?._owner || matchOwner(ownerOfOrder(order || {}), staff), [order, staff]);
  const ownerOpts = owner && owner.orig ? [owner, ...staff] : staff;
  const assigner = String(order?.배차확정자 || "").trim();
  const assignOpts = assigner && !staff.some((s) => s.name === assigner) ? [{ key: `__a__${assigner}`, name: assigner }, ...staff] : staff;
  const sel = selectClass || "w-full h-9 px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-bold text-[#0F1A30] text-left";
  const lab = labelClass || "block text-[11.5px] font-extrabold text-[#5B6B85] mb-1";
  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`} data-order-staff>
      <div className="min-w-0">
        <label className={lab}>배차담당자</label>
        <CustomSelect className={sel} disabled={disabled} value={owner?.key || ""} placeholder="미지정"
          onChange={(e) => { const o = ownerOpts.find((s) => s.key === e.target.value); if (o) setOrder((p) => ({ ...p, _owner: o })); }}>
          {ownerOpts.map((s) => <option key={s.key} value={s.key}>{s.orig ? `${s.name} (지금 값)` : s.name}</option>)}
        </CustomSelect>
      </div>
      <div className="min-w-0">
        <label className={lab}>차량배정자</label>
        <CustomSelect className={sel} disabled={disabled} value={assigner ? (staff.find((s) => s.name === assigner)?.key || `__a__${assigner}`) : ""} placeholder="미지정"
          onChange={(e) => { const v = e.target.value; const o = assignOpts.find((s) => s.key === v); setOrder((p) => ({ ...p, 배차확정자: v === "__none__" ? "" : (o?.name || ""), _assignerSet: true })); }}>
          <option value="__none__">미지정(비우기)</option>
          {assignOpts.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
        </CustomSelect>
      </div>
    </div>
  );
}
