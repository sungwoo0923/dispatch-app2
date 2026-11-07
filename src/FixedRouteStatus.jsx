// ======================= src/FixedRouteStatus.jsx =======================
// 🛣 2026-11-03 배차현황 › 고정노선현황 — 고정노선 › 배차표 양식(화주사 구글시트)의 오더를 배차현황과 같은 화면으로
//  · 버튼·합계(건수·청구·기사·수수료)·필터·기간·검색·어제/당일/내일/전체·기사복사·업로드링크·대용량·선택삭제·엑셀·일마감은
//    배차현황(DispatchStatus)을 그대로 쓰고, 표의 열만 그 양식(시트 제목줄) 순서로 바꾼다(fixedForm).
//  · 화면을 열어 두면 30초마다 서버가 시트와 맞춘다(새 날짜 탭·새 줄 → 오더, 시트에서 바뀐 칸 → 프로그램, 프로그램에서 바꾼 칸 → 시트)
import React from "react";
import { collection, onSnapshot, query, where, doc, setDoc, updateDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db, auth } from "./firebase";
import { createPortal } from "react-dom";
import { deleteDocsAtomic } from "./DeleteProgress"; // ⭐ 2026-11-05 삭제 진행 창 + 한 번에 삭제
import CustomDatePicker from "./CustomDatePicker";
import { pickUnassignedOrders } from "./unassignedRule"; // ⭐ 2026-11-05 PC·모바일 일치 — 미배차 기준 공용
import { useOrderHistory } from "./orderHistory";
import { sheetApi, BoardSuggest } from "./RouteBoard";
import { ownerOf, rateFor } from "./routeBoardSheet";
import { useRouteCarrierSetting, useRouteCarrierFilter, saveRouteCarrierSetting, carriersInOrders, carrierKey, carrierOf } from "./routeCarriers"; // ⭐ 2026-11-05 운송업체 설정(정산·매출 포함 여부)

import { isMyOrder } from "./driverEvents"; // ⭐ 2026-11-06 내 오더 판단(기사 수락/거절 알림과 같은 기준)
import { useMyProfile, personName } from "./userNames";
import { orderStaffNameRaw, useUserNameMap } from "./detailGetters";
import MgrBadge from "./MgrBadge"; // ⭐ 2026-11-06 담당자 칸(실시간·배차현황과 같은 모양)
import { isUrgentOrder, UrgentBadge, urgentRowStyle } from "./urgentOrder"; // ⭐ 2026-11-06 긴급 오더 강조
import { requestRouteSheetPush } from "./routeSheetPush"; // 💰 2026-11-06 고친 값 바로 시트에

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";

// ⭐ 2026-11-06 고정노선현황 수정 권한 — 배차담당자는 본인이 등록·배차한 오더만, 마스터(관리자급)는 전부
//  · 본인 오더 = 등록자(createdByUid·createdByEmail·작성자) 또는 배차한 사람(배차확정자) — driverEvents.isMyOrder와 같은 기준
//  · 시트에서 자동으로 들어와 아직 아무도 잡지 않은 오더(작성자 "배차표 자동" · 배차확정자 없음)는 누구나 배차할 수 있다
//    → 차량을 넣어 배차하면 배차확정자가 그 사람으로 남아 그때부터 그 사람(과 마스터)만 고칠 수 있다
//  · 마스터 = admin·totalMaster·superadmin·test·allMgr 역할, 직원 문서 isMaster, 최고관리자 계정
//  · 화면(UI)에서 막는다(서버 규칙은 그대로) — 잠긴 줄은 글자만 보이고 "담당자만 수정할 수 있습니다" 안내
export const ROUTE_LOCK_MSG = "담당자만 수정할 수 있습니다";
const ROUTE_EDIT_ALL_ROLES = new Set(["admin", "totalMaster", "superadmin", "test", "allMgr"]);
const AUTO_OWNER = new Set(["", "배차표 자동", "배차표", "고정노선", "담당자", "미지정"]);
const humanOf = (v) => { const t = String(v ?? "").trim(); return t && !AUTO_OWNER.has(t) ? t : ""; };
const OWNER_KEYS = ["createdByUid", "createdByEmail", "작성자", "등록자이메일", "createdBy", "배차확정자", "등록자명", "createdByName", "등록자"];
export const routeOrderHasOwner = (r) => !!r && OWNER_KEYS.some((k) => humanOf(r[k]));
// 이 오더의 담당자 이름(잠금 안내용) — 배차한 사람 → 등록 직원
export const routeOwnerName = (r, nameMap) => humanOf(r?.배차확정자) || humanOf(orderStaffNameRaw(r, nameMap)) || humanOf(r?.등록자명) || "";
export function useRouteEditGuard(role) {
  const uid = auth.currentUser?.uid || "";
  const email = auth.currentUser?.email || "";
  const prof = useMyProfile(uid && uid !== "preview" ? uid : "");
  const r0 = role || (() => { try { return localStorage.getItem("role") || ""; } catch { return ""; } })();
  const isPv = (() => { try { return window.location.pathname.startsWith("/preview"); } catch { return false; } })(); // 둘러보기(로그인 전) — 가짜 사용자 "둘러보기"
  const name = personName(prof) || auth.currentUser?.displayName || (isPv ? "둘러보기" : "");
  return React.useMemo(() => {
    const all = ROUTE_EDIT_ALL_ROLES.has(r0) || prof?.isMaster === true || isMasterOnly();
    const me = { uid, email, name };
    const canEdit = (r) => all || !routeOrderHasOwner(r) || isMyOrder(r, me);
    return { all, me, canEdit };
  }, [r0, prof?.isMaster, uid, email, name]);
}
import { LiveDriverChip, FleetLiveButton, useFleetLivePublish } from "./liveFleet"; // ⭐ 2026-11-05 배차완료 지입·직영·임대 기사 실시간 관제
import { kpConfirm } from "./kpDialog";
const toInt = (v) => parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10) || 0;
const normPlate = (s = "") => String(s).replace(/\s+/g, "").toUpperCase();
const pad = (n) => String(n).padStart(2, "0");
const parseHM = (v) => {
  const s = String(v || "").trim(); if (!s) return "";
  let m = s.match(/(오전|오후)\s*(\d{1,2})(?::(\d{2}))?/);
  if (m) { let h = +m[2] % 12; if (m[1] === "오후") h += 12; return `${pad(h)}:${m[3] || "00"}`; }
  m = s.match(/^(\d{1,2})(?::|시\s*)?(\d{2})?분?$/) || s.match(/^(\d{2})(\d{2})$/);
  if (m && +m[1] < 24) return `${pad(+m[1])}:${m[2] || "00"}`;
  return "";
};
const korTime = (hm) => { if (!hm) return ""; const [h, m] = hm.split(":").map(Number); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${pad(m)}`; };
const TIME_FIELDS = new Set(["상차시간", "하차시간"]);
const MONEY_FIELDS = new Set(["청구운임", "기사운임"]);

// 표 머리글 — 선택·순번 + 상차일·상차지(묶음) + 시트 열 순서 + 배차상태·운임(시트에 없으면)
export function fixedHeaderOf(form) {
  const cols = (form?.columns || []).filter((c) => c.kind !== "no");
  const has = (f) => cols.some((c) => c.kind === "field" && c.field === f);
  return ["선택", "순번", "담당자", "발주일", "입고일", "상차지", ...cols.map((c) => c.label), "배차상태", ...["청구운임", "기사운임"].filter((f) => !has(f)), "수수료"]; // ⭐ 2026-11-06 순번 다음 담당자
}
// ⭐ 2026-11-03 리터(수량)·총계 칸은 색으로 구분 — 시트 열 이름이 "0.5L"·"총계"처럼 생겼으면 같은 모양으로
export const frsLook = (c) => {
  const l = String(c?.label || "").trim();
  if (c?.kind === "sum" || /^(총계|합계|총\s*수량|총합)$/.test(l)) return "sum";
  if (c?.kind === "qty" || /^\d+(\.\d+)?\s*(L|ℓ|리터)$/i.test(l)) return "qty";
  return "";
};
// 머리글 이름 → "qty" | "sum" (배차현황 표 머리글 색)
export function fixedLookOf(form) {
  const m = new Map();
  (form?.columns || []).forEach((c) => { const k = frsLook(c); if (k) m.set(c.label, k); });
  return m;
}
const cargoText = (qty) => { const total = Object.values(qty).reduce((a, n) => a + n, 0); return { 화물내용: Object.keys(qty).length ? `${Object.entries(qty).map(([k, n]) => `${k} ${n}`).join(" · ")} (총 ${total})` : "", 화물수량: total ? String(total) : "" }; };
const valueOf = (c, row) => {
  if (c.kind === "qty") return row.품목수량?.[c.label] ? String(row.품목수량[c.label]) : "";
  if (c.id === CARRIER_VCOL) return carrierOf(row); // ⭐ 2026-11-06 양식에 운송업체 열이 없을 때 붙인 칸
  if (c.kind === "extra") return String(row.추가정보?.[c.label] ?? "");
  if (c.kind === "sum") { const t = Object.values(row.품목수량 || {}).reduce((a, n) => a + toInt(n), 0); return t ? String(t) : ""; }
  // ⭐ 2026-11-03 시군구 칸은 시트에 적힌 그대로(여주시) — 오더에는 기사 길안내용 풀주소를 그대로 둔다
  if (c.field === "하차지주소") { const sv = row.시트기준값?.[c.id] ?? row.시트추가값?.[c.id]; if (sv != null && String(sv).trim()) return String(sv); const short = siGunGu(row.하차지주소); return short || String(row.하차지주소 ?? ""); }
  const v = String(row[c.field] ?? "");
  return TIME_FIELDS.has(c.field) ? (parseHM(v) || v) : v;
};

// ⭐ 2026-11-06 담당자 칸 — 배차한 사람(배차확정자) → 등록한 직원 · 시트에서 자동으로 들어와 아직 아무도 안 잡은 오더는 "미지정"
//  (누가 차량을 넣어 배차하거나, 오른쪽 클릭 › 담당자 지정을 하면 그 사람 이름이 보인다)
export function FixedOwnerCell({ row, nameMap, className = "" }) {
  const owner = routeOwnerName(row, nameMap);
  return (
    <td className={`px-2 py-1.5 text-center whitespace-nowrap border-b border-[#E9EDF4] border-r border-r-[#F1F4F9] ${className}`} data-kp="frs-owner">
      <MgrBadge row={{ ...row, 배차확정자: owner }} name={owner} empty="미지정" />
    </td>
  );
}
// 담당자로 고를 수 있는 직원 이름(직원 목록 이름 · 중복 제거 · 가나다)
export function staffNamesOf(nameMap) {
  const set = new Set();
  (nameMap ? [...nameMap.values()] : []).forEach((n) => { const t = String(n || "").trim(); if (t && !AUTO_OWNER.has(t)) set.add(t); });
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

// ⭐ 2026-11-06 고정노선현황 오른쪽 클릭 메뉴 — 이 화면에 맞는 것만(오더 추가 · 수정 모드 · 담당자 지정 · 기사 복사 · 오더정보 · 시트에서 열기 · 지금 맞추기 · 선택 삭제)
//  x·y는 화면 좌표(확대 비율 나눈 값) · 담당자는 직원 이름 목록에서 고른다(여러 줄을 체크하고 열면 그 줄 모두)
export function FixedRouteContextMenu({ x, y, row, selCount = 1, staff = [], owner = "", locked = false, disabled = false, onClose, onAdd, onEdit, onAssign, onCopyDriver, onInfo, onOpenSheet, onSync, onDelete }) {
  const [assign, setAssign] = React.useState(false);
  const [q, setQ] = React.useState("");
  const ref = React.useRef(null);
  React.useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down, true); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", down, true); document.removeEventListener("keydown", esc); };
  }, [onClose]);
  const z = (() => { try { return parseFloat(document.getElementById("root")?.style.zoom) || 1; } catch { return 1; } })();
  const vw = window.innerWidth / z; const vh = window.innerHeight / z;
  const W = 232;
  const pos = { left: Math.min(x, vw - W - 8), ...(y > vh * 0.55 ? { bottom: Math.max(8, vh - y) } : { top: y }), maxHeight: vh - 16 };
  const item = "w-full text-left px-3 h-9 rounded-lg text-[13.5px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#2A3852]";
  const I = ({ d }) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">{d}</svg>;
  const many = selCount > 1 ? ` (${selCount}건)` : "";
  const list = staff.filter((n) => !q.trim() || n.replace(/\s/g, "").includes(q.replace(/\s/g, "")));
  // body에 따로 그린다(표·머리띠 위로 확실히) — 좌표는 확대 비율로 나눈 값이라 메뉴에도 같은 zoom을 준다(위치·크기 그대로)
  return createPortal(
    <div ref={ref} data-kp="frs-ctx" className="fixed z-[999999] bg-white border border-[#DCE3EE] rounded-2xl shadow-[0_18px_44px_rgba(11,20,40,0.28)] p-1.5 select-none overflow-y-auto"
      style={{ ...pos, width: W, zoom: z }} onContextMenu={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}>
      <div className="px-3 pt-1.5 pb-2 border-b border-[#EEF2F7] mb-1">
        <div className="text-[10px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">FIXED ROUTE</div>
        <div className="text-[13px] font-black text-[#0F1A30] truncate">{row?.하차지명 || row?.상차지명 || "오더"}{many}</div>
        <div className="text-[11.5px] font-semibold text-[#7A8AA6] truncate">담당 {owner || "미지정"}{locked ? " · 🔒 수정 잠김" : ""}</div>
      </div>
      {!assign ? (
        <>
          {onAdd && <button type="button" className={item} disabled={disabled} onClick={() => { onClose(); onAdd(); }}><I d={<path d="M12 5v14M5 12h14" />} />오더 추가</button>}
          <button type="button" className={item} disabled={disabled} onClick={() => { onClose(); onEdit(); }}><I d={<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></>} />수정 모드<span className="ml-auto text-[11px] text-[#9AA9C3]">두 번 클릭</span></button>
          <button type="button" className={item} disabled={disabled} onClick={() => setAssign(true)} data-kp="frs-ctx-assign"><I d={<><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>} />담당자 지정{many}<span className="ml-auto text-[#9AA9C3]">›</span></button>
          <div className="border-t border-[#EEF2F7] my-1" />
          <button type="button" className={item} onClick={() => { onClose(); onCopyDriver(); }}><I d={<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>} />기사 복사</button>
          <button type="button" className={item} onClick={() => { onClose(); onInfo(); }}><I d={<><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>} />오더정보</button>
          {onOpenSheet && <button type="button" className={item} onClick={() => { onClose(); onOpenSheet(); }}><I d={<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>} />시트에서 열기</button>}
          {onSync && <button type="button" className={item} onClick={() => { onClose(); onSync(); }}><I d={<><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>} />지금 시트와 맞추기</button>}
          <div className="border-t border-[#EEF2F7] my-1" />
          <button type="button" disabled={disabled} className="w-full text-left px-3 h-9 rounded-lg text-[13.5px] font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2.5 disabled:opacity-40" onClick={() => { onClose(); onDelete(); }}>
            <I d={<><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" /></>} />선택 삭제{many}<span className="ml-auto text-[11px] text-gray-500">Del</span>
          </button>
        </>
      ) : (
        <div data-kp="frs-ctx-staff">
          <div className="flex items-center gap-1.5 px-1 pb-1.5">
            <button type="button" onClick={() => setAssign(false)} className="h-8 px-2 rounded-lg text-[13px] font-black text-[#2D4C82] hover:bg-[#F5F8FD]">‹ 뒤로</button>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="직원 이름 찾기" className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[13px] font-semibold outline-none focus:border-[#2D4C82]" />
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {list.map((n) => (
              <button key={n} type="button" className={item} onClick={() => { onClose(); onAssign(n); }}>
                <span className={`w-[22px] h-[22px] rounded-full text-[10.5px] font-black inline-flex items-center justify-center shrink-0 ${n === owner ? "bg-[#4B6CB7] text-white" : "bg-[#0F1A30] text-white"}`}>{n.slice(0, 1)}</span>
                <span className="flex-1 truncate">{n}</span>{n === owner && <span className="text-[11px] font-bold text-[#4B6CB7]">지금</span>}
              </button>
            ))}
            {!list.length && <div className="px-3 py-3 text-[12.5px] font-semibold text-[#9AA9C3]">직원이 없습니다</div>}
          </div>
          {owner && <><div className="border-t border-[#EEF2F7] my-1" /><button type="button" className={item} onClick={() => { onClose(); onAssign(""); }}><I d={<path d="M18 6L6 18M6 6l12 12" />} />담당자 비우기</button></>}
        </div>
      )}
    </div>,
    document.body
  );
}

// 수정 모드가 아닐 때 칸 — 글자만(가운데 정렬) · 빈 차량번호는 빨간 "미배차"
function ViewText({ value, strong, numeric, placeholder }) {
  const v = String(value ?? "");
  if (!v && placeholder) return <span className="text-[13px] font-black text-[#D92D20]/80">{placeholder}</span>;
  return <span className={`inline-block px-1 text-[13.5px] text-[#0F1A30] ${strong ? "font-black" : "font-semibold"} ${numeric ? "tabular-nums" : ""}`}>{v}</span>;
}

// 칸 하나(바로 고치기) — 엔터·칸 밖 누르면 저장, Esc 되돌리기
function Cell({ value, onCommit, numeric, wide, placeholder, disabled, title, strong }) {
  const [v, setV] = React.useState(value);
  const [edit, setEdit] = React.useState(false);
  React.useEffect(() => { if (!edit) setV(value); }, [value, edit]);
  const commit = () => { setEdit(false); if (String(v) !== String(value)) onCommit(v); };
  if (disabled) return <ViewText value={value} strong={strong} numeric={numeric} placeholder={placeholder} />; // ⭐ 수정 모드가 아닐 땐 글자만
  return (
    <input value={v} disabled={disabled} title={title} placeholder={placeholder} inputMode={numeric ? "numeric" : undefined}
      size={Math.max(numeric ? 3 : 6, Math.min(wide ? 34 : 18, String(v || placeholder || "").length + 1))}
      onFocus={(e) => { setEdit(true); e.target.select(); }} onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setV(value); setEdit(false); setTimeout(() => e.target.blur(), 0); } }}
      onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      className={`kp-frs-cell ${wide ? "min-w-[150px] text-center" : numeric ? "min-w-[54px] text-center tabular-nums" : "min-w-[84px] text-center"} ${strong ? "font-black" : "font-semibold"}`} />
  );
}

// 🚚 차량 정보 칸(차량번호·성명·휴대전화) — 스마트 검색: 차량번호 일부나 이름·번호만 쳐도 기사관리 목록이 뜨고, 고르면 세 칸이 한 번에
const DRV_KEY = { 차량번호: "차량번호", 이름: "이름", 전화번호: "전화번호" };
function VehicleCell({ field, value, drivers, disabled, onPick, onCommit, placeholder }) {
  const [v, setV] = React.useState(value);
  const picked = React.useRef(false);
  React.useEffect(() => { setV(value); }, [value]);
  if (disabled) return <ViewText value={value} placeholder={placeholder} />;
  const sub = (d) => [field !== "차량번호" && d.차량번호, field !== "이름" && d.이름, field !== "전화번호" && d.전화번호, d.등급].filter(Boolean).join(" · ");
  return (
    <BoardSuggest value={v} onChange={setV} items={drivers} k={DRV_KEY[field]} sub={sub} title="기사관리" placeholder={placeholder}
      onPick={(d) => { picked.current = true; setV(d[DRV_KEY[field]] || ""); onPick(d); }}
      onBlur={() => { setTimeout(() => { if (!picked.current && String(v) !== String(value)) onCommit(v); picked.current = false; }, 160); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className={`kp-frs-cell ${field === "차량번호" ? "min-w-[118px]" : "min-w-[90px]"} text-center font-semibold`} inputProps={{ onClick: (e) => e.stopPropagation(), onDoubleClick: (e) => e.stopPropagation() }} />
  );
}

// 🏢 2026-11-03 운송업체 칸 — 기본거래처에 있으면 드롭다운(스마트 검색), 없으면 그냥 직접 입력
const isCarrierCol = (c) => c.kind === "extra" && /운송업체|운송사/.test(String(c.label || ""));
// ⭐ 2026-11-06 운송업체 칸이 꼭 보이게 — 양식(시트 제목줄)에 운송업체 열이 없는데 오더에 운송업체 값이 있으면 표 끝에 칸을 붙인다(화면에만)
const CARRIER_VCOL = "__carrier";
export function withCarrierCol(form, rows) {
  if (!form || (form.columns || []).some(isCarrierCol)) return form;
  if (!(rows || []).some((r) => carrierOf(r))) return form;
  return { ...form, columns: [...(form.columns || []), { id: CARRIER_VCOL, label: "운송업체", kind: "extra" }] };
}
function CarrierCell({ value, clients, disabled, onCommit }) {
  const [v, setV] = React.useState(value);
  const picked = React.useRef(false);
  React.useEffect(() => { setV(value); }, [value]);
  if (disabled) return <ViewText value={value} />;
  return (
    <BoardSuggest value={v} onChange={setV} items={clients} k="거래처명" title="기본거래처" placeholder="직접 입력"
      sub={(x) => [x.담당자, x.연락처 || x.담당자번호 || x.전화번호].filter(Boolean).join(" · ")}
      onPick={(x) => { picked.current = true; const n = x.거래처명 || ""; setV(n); if (n !== String(value || "")) onCommit(n); }}
      onBlur={() => { setTimeout(() => { if (!picked.current && String(v).trim() !== String(value || "")) onCommit(v); picked.current = false; }, 160); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className="kp-frs-cell min-w-[96px] text-center font-semibold" inputProps={{ onClick: (e) => e.stopPropagation(), onDoubleClick: (e) => e.stopPropagation() }} />
  );
}

// 한 줄의 칸들(시트 열 순서) — 고치면 바로 오더에 저장(patchDispatch) → 서버가 30초 안에 시트에도 써 준다
export function FixedRouteCells({ form, row, drivers = [], clients = [], onPatch, disabled: viewer = false, editing = false }) {
  const disabled = viewer || !editing; // ⭐ 2026-11-03 줄을 두 번 눌러 수정 모드일 때만 칸이 열린다(실수 방지)
  const carrierF = useRouteCarrierFilter(); // ⭐ 2026-11-05 정산·매출에서 빠지는 운송업체면 칸에 "제외" 표시
  const carrierItems = React.useMemo(() => { const seen = new Set(); return (clients || []).map((x) => ({ ...x, 거래처명: String(x.거래처명 || x.업체명 || "").trim() })).filter((x) => x.거래처명 && !seen.has(x.거래처명) && seen.add(x.거래처명)); }, [clients]);
  const td = "px-1.5 py-1.5 border-b border-[#E9EDF4] border-r border-r-[#F1F4F9] text-center whitespace-nowrap";
  const cols = (form?.columns || []).filter((c) => c.kind !== "no");
  // ⭐ 2026-11-03 단가표 — 파레트 수·도착지가 바뀌면 청구운임 자동(직접 고친 운임이면 그대로)
  const fareOf = (q, addr) => {
    if (!form?.rateTable?.length || row.운임수동) return {};
    const n = Object.values(q || {}).reduce((a, x) => a + toInt(x), 0);
    const r = rateFor(form.rateTable, addr ?? row.하차지주소 ?? "", n);
    if (r) return { 청구운임: String(r.total), 수수료: String(r.total - toInt(row.기사운임)), 단가표지역: r.region, 파렛단가: r.per };
    return row.단가표지역 ? { 청구운임: "", 수수료: String(-toInt(row.기사운임)), 단가표지역: "", 파렛단가: 0 } : {}; // 12·18P가 아니면 자동 운임 지움 → 직접 입력
  };
  const commit = (c, raw) => {
    const val = String(raw ?? "").trim();
    if (c.kind === "qty") {
      const q = { ...(row.품목수량 || {}) }; if (toInt(val)) q[c.label] = toInt(val); else delete q[c.label];
      return onPatch({ 품목수량: q, ...cargoText(q), ...fareOf(q) });
    }
    if (c.kind === "field" && c.field === "하차지주소") { // 시군구만 고친 거면 풀주소는 그대로(표시만 바뀜)
      const keepFull = val && String(row.하차지주소 || "").replace(/\s/g, "").includes(val.replace(/\s/g, ""));
      const addr = keepFull ? row.하차지주소 : val;
      return onPatch({ ...(keepFull ? {} : { 하차지주소: val }), 시트기준값: { ...(row.시트기준값 || {}), [c.id]: val }, ...fareOf(row.품목수량, addr) });
    }
    if (c.id === CARRIER_VCOL) return onPatch({ 추가정보: { ...(row.추가정보 || {}), 운송업체: val } }); // ⭐ 2026-11-06
    if (c.kind === "extra") return onPatch({ 추가정보: { ...(row.추가정보 || {}), [c.label]: val } });
    if (c.field === "차량번호") {
      const d = val ? drivers.find((x) => normPlate(x.차량번호) === normPlate(val)) : null;
      return onPatch({ 차량번호: val, ...(d ? { 이름: d.이름 || "", 전화번호: d.전화번호 || "" } : !val ? { 이름: "", 전화번호: "" } : {}),
        ...(val && (row.배차상태 === "배차중" || !row.배차상태) ? { 배차상태: "배차완료" } : !val && row.배차상태 === "배차완료" ? { 배차상태: "배차중" } : {}) });
    }
    if (TIME_FIELDS.has(c.field)) return onPatch({ [c.field]: parseHM(val) ? korTime(parseHM(val)) : val });
    if (MONEY_FIELDS.has(c.field)) { const n = toInt(val); const p = { [c.field]: n ? String(n) : "" }; const sale = c.field === "청구운임" ? n : toInt(row.청구운임); const drv = c.field === "기사운임" ? n : toInt(row.기사운임); return onPatch({ ...p, 수수료: String(sale - drv), ...(c.field === "청구운임" ? { 운임수동: !!n } : {}) }); } // 청구운임을 직접 고치면 단가표 자동 계산 멈춤(비우면 다시 자동)
    return onPatch({ [c.field]: val });
  };
  const has = (f) => cols.some((c) => c.kind === "field" && c.field === f);
  const money = (f) => (
    <td key={f} className={td} title={f === "청구운임" && row.단가표지역 ? `단가표 ${row.단가표지역} · 파렛당 ${Number(row.파렛단가 || 0).toLocaleString()}원${row.운임수동 ? " (직접 입력 — 자동 계산 멈춤)" : ""}` : f === "청구운임" && row.운임수동 ? "직접 입력한 운임(단가표 자동 계산 멈춤) — 비우면 다시 자동" : undefined}>
      <Cell value={toInt(row[f]) ? toInt(row[f]).toLocaleString() : ""} numeric disabled={disabled} onCommit={(v) => commit({ kind: "field", field: f }, v)} />
    </td>
  );
  const st = row.배차상태 || "배차중";
  return (
    <>
      <td className={`${td} tabular-nums text-[13px] font-bold text-[#3A4A66]`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} title="발주일(시트 왼쪽 날짜)">{String(row.발주일 || row.상차일 || "").slice(5).replace("-", ".")}</td>
      <td className={td} title="입고일(시트 오른쪽 날짜 · 탭 이름)">
        {/* ⭐ 2026-11-03 입고일 눈에 띄게 — 굵고 크게, 남색 칩 */}
        <span className="inline-flex items-center h-7 px-2.5 rounded-lg bg-[#0F1A30] text-white text-[14.5px] font-black tabular-nums tracking-tight" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{String(row.입고일 || row.하차일 || "").slice(5).replace("-", ".")}</span>
      </td>
      <td className={`${td} text-[13px] font-black text-[#1B2B4B]`}>{row.배차표묶음 || row.상차지명 || "-"}</td>
      {cols.map((c) => {
        const own = ownerOf(c);
        const v = valueOf(c, row);
        const isQty = c.kind === "qty";
        const look = frsLook(c);
        const bg = look ? "" : own === "운송사" ? "bg-[#F3F7FF]" : "";
        if (c.kind === "sum") return <td key={c.id} data-frs="sum" className={`${td} tabular-nums`}>{v}</td>;
        if (c.kind === "field" && DRV_KEY[c.field]) {
          const pick = (d) => onPatch({ 차량번호: d.차량번호 || "", 이름: d.이름 || "", 전화번호: d.전화번호 || "", ...(row.배차상태 === "배차중" || !row.배차상태 ? { 배차상태: "배차완료" } : {}) });
          return <td key={c.id} className={`${td} bg-[#F3F7FF] relative`} title="차량번호·이름·번호 일부만 쳐도 기사관리에서 찾아 채웁니다">{c.field === "차량번호" && st === "배차완료" && <LiveDriverChip order={row} variant="pin" />}<VehicleCell field={c.field} value={v} drivers={drivers} disabled={disabled} onPick={pick} onCommit={(x) => commit(c, x)} placeholder={c.field === "차량번호" && !v ? "미배차" : ""} />{/* ⭐ 2026-11-05 LIVE — 칩 대신 칸 왼쪽 위 6px 점(폭 0 · 칸 너비 그대로) */}</td>;
        }
        if (isCarrierCol(c)) {
          const off = carrierF.active && !carrierF.isCountable(row);
          return <td key={c.id} className={`${td} ${bg}`} title={off ? "운송업체 설정에서 뺀 업체 — 정산·매출에 들어가지 않습니다" : "기본거래처에 있으면 목록에서 고르고, 없으면 그냥 입력"}><CarrierCell value={v} clients={carrierItems} disabled={disabled} onCommit={(x) => commit(c, x)} />{off && disabled && <span className="ml-1 inline-flex items-center h-[18px] px-1.5 rounded-md bg-[#FFF1EE] text-[#B42318] text-[10.5px] font-black align-middle">정산제외</span>}</td>;
        }
        return (
          <td key={c.id} data-frs={look || undefined} data-empty={look && !v ? "1" : undefined} className={`${td} ${bg}`} title={own === "화주" ? "업체(화주)가 시트에 입력하는 칸" : own === "운송사" ? "운송사가 입력하는 칸" : ""}>
            {c.kind === "field" && c.field === "하차지명" && isUrgentOrder(row) && <UrgentBadge row={row} className="mr-1" />}{/* ⭐ 2026-11-06 긴급 */}
            <Cell value={v} disabled={disabled} numeric={isQty || (c.kind === "field" && MONEY_FIELDS.has(c.field))} wide={c.kind === "field" && ["하차지명", "하차지주소", "메모"].includes(c.field)}
              strong={c.kind === "field" && c.field === "하차지명"} onCommit={(x) => commit(c, x)} />
          </td>
        );
      })}
      <td className={td}>
        <span className={`inline-flex items-center h-7 px-2.5 rounded-lg text-[12px] font-black ${st === "배차완료" ? "bg-[#1B2B4B] text-white" : st === "배차취소" ? "bg-red-50 text-red-600 border border-red-200" : "bg-white text-[#B54708] border border-[#F7C97A]"}`}>{st}</span>
        {row.시트삭제됨 && <div className="mt-0.5 text-[10.5px] font-black text-red-600">시트에서 삭제됨</div>}
      </td>
      {!has("청구운임") && money("청구운임")}
      {!has("기사운임") && money("기사운임")}
      <td className={`${td} text-[13.5px] font-black tabular-nums ${toInt(row.청구운임) - toInt(row.기사운임) < 0 ? "text-red-600" : "text-[#0F1A30]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{(toInt(row.청구운임) - toInt(row.기사운임)).toLocaleString()}</td>
    </>
  );
}

// 머리줄(양식 고르기 · 시트 연동 상태) + 배차현황 화면
// ➕ 2026-11-03 고정노선현황 [＋ 오더 추가] — 프로그램에서 줄을 추가하면 서버가 30초 안에 시트의 그 묶음 표 맨 아래에 새 줄로 넣어 준다
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const addDaysStr = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const SIDO_WORD = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/;
const siGunGu = (addr) => { // "경기 오산시 경기대로 822" → "오산시" · "대전 동구 …" → "대전동구"
  const t = String(addr || "").trim().split(/\s+/);
  const i = t.findIndex((x) => /(시|군|구)$/.test(x) && !/(특별시|광역시|특별자치시|도)$/.test(x));
  if (i < 0) return "";
  const prev = t[i - 1] || "";
  if (/구$/.test(t[i]) && SIDO_WORD.test(prev) && !/(시|군)$/.test(prev)) return prev.replace(/(특별시|광역시)$/, "") + t[i];
  return t[i];
};
export function AddFixedOrderModal({ form, rows, places = [], drivers = [], onClose }) {
  const cols = form.columns || [];
  const nameCol = cols.find((c) => c.kind === "field" && c.field === "하차지명");
  const addrCol = cols.find((c) => c.kind === "field" && c.field === "하차지주소");
  const qtyCols = cols.filter((c) => c.kind === "qty");
  const [g, setG] = React.useState(form.groups?.[0]?.name || "");
  const [date, setDate] = React.useState(() => addDaysStr(kstDay(), 1)); // 보통 내일 입고
  const [name, setName] = React.useState("");
  const [addr, setAddr] = React.useState("");
  const [si, setSi] = React.useState("");
  const [qty, setQty] = React.useState({});
  const [plate, setPlate] = React.useState("");
  const [drv, setDrv] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const placeItems = React.useMemo(() => (places || []).map((p) => ({ ...p, 업체명: String(p.업체명 || p.거래처명 || "").trim() })).filter((p) => p.업체명), [places]);
  React.useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const total = Object.values(qty).reduce((a, n) => a + toInt(n), 0);
  const fare = form.rateTable?.length ? rateFor(form.rateTable, addr || si, total) : null;
  const save = async () => {
    if (!name.trim()) { setErr("도착지를 입력해 주세요."); return; }
    setBusy(true); setErr("");
    try {
      const grp = (form.groups || []).find((x) => x.name === g) || form.groups?.[0] || { name: g };
      const q = {}; Object.entries(qty).forEach(([k, n]) => { if (toInt(n)) q[k] = toInt(n); });
      const inDate = date; const outDate = addDaysStr(date, -toInt(form.dropOffset)); // 고른 날짜 = 입고일(탭 날짜) → 발주일(상차일)
      const seq = rows.filter((r) => r.상차일 === outDate && (r.배차표묶음 || form.groups?.[0]?.name) === grp.name).reduce((a, r) => Math.max(a, r.배차표순번 || 0), 0) + 1;
      const d = drv || (plate ? drivers.find((x) => normPlate(x.차량번호) === normPlate(plate)) : null);
      const id = `rb_${form.id}_${outDate}_${Math.random().toString(36).slice(2, 10)}`;
      const me = auth.currentUser;
      await setDoc(doc(db, "orders", id), {
        _id: id, 하차지명: name.trim(), 하차지주소: addr.trim() || si.trim(), 품목수량: q, 추가정보: {}, ...cargoText(q),
        ...(plate.trim() ? { 차량번호: d?.차량번호 || plate.trim(), 이름: d?.이름 || "", 전화번호: d?.전화번호 || "" } : {}),
        ...(fare ? { 청구운임: String(fare.total), 수수료: String(fare.total), 단가표지역: fare.region, 파렛단가: fare.per } : {}),
        거래처명: form.client || "", 상차일: outDate, 하차일: inDate, 발주일: outDate, 입고일: inDate,
        상차지명: grp.상차지명 || grp.name || "", 상차지주소: grp.상차지주소 || "", ...(form.payMethod ? { 지급방식: form.payMethod } : {}),
        배차상태: plate.trim() ? "배차완료" : "배차중", 배차표Id: form.id, 배차표명: form.name || "", 배차표묶음: grp.name, 배차표순번: seq,
        companyName: form.companyName, 등록일: kstDay(), 작성자: me?.email || "", createdByEmail: me?.email || "", createdByUid: me?.uid || "", 등록기기: "배차표",
        시트추가대기: true, ...(addrCol ? { 시트추가값: { [addrCol.id]: si.trim() } } : {}),
        경유지_상차: [], 경유상차목록: [], 경유지_하차: [], 경유하차목록: [], 근무일자목록: [], 운행유형: "편도", 혼적여부: "독차",
        createdAt: serverTimestamp(), _lastModified: Date.now(),
      });
      onClose(true);
    } catch (e) { setErr(String(e?.message || e)); setBusy(false); }
  };
  const inp = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/10";
  const lab = "text-[12px] font-black text-[#5B6B85] mb-1";
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0F1A30]/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[640px] max-h-[92vh] overflow-auto rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,26,48,0.35)]">
        <div className="px-6 py-4 bg-[#1B2B4B] text-white flex items-center gap-3">
          <div className="min-w-0">
            <div className="text-[16px] font-black">오더 추가 · {form.name}</div>
            <div className="text-[11.5px] text-white/60 font-semibold">저장하면 30초 안에 구글시트의 그 묶음 표 맨 아래에 새 줄로 들어갑니다</div>
          </div>
          <button onClick={() => onClose()} className="ml-auto h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-[12px] font-bold">닫기 <span className="text-white/50">ESC</span></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className={lab}>묶음(상차지)</div>
              <div className="flex flex-wrap gap-1.5">
                {(form.groups || []).map((x) => (
                  <button key={x.name} type="button" onClick={() => setG(x.name)} className={`h-10 px-3.5 rounded-xl text-[13.5px] font-black border transition ${g === x.name ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#3A4A66] border-[#DCE3EE] hover:bg-[#F5F8FD]"}`}>{x.name}</button>
                ))}
              </div>
            </div>
            <div>
              <div className={lab}>입고일 <span className="font-semibold text-[#9AA9C3]">(시트 탭 날짜)</span></div>
              <CustomDatePicker value={date} onChange={(e) => setDate(e.target.value)} className={`${inp} text-left`} />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_160px] gap-3">
            <div>
              <div className={lab}>{nameCol?.label || "도착지"} <span className="text-[#D92D20]">*</span></div>
              <BoardSuggest value={name} onChange={setName} items={placeItems} k="업체명" sub={(p) => p.주소 || ""} title="상하차지거래처" placeholder="업체명 일부만 쳐도 목록이 떠요" className={inp}
                onPick={(p) => { setName(p.업체명); setAddr(p.주소 || ""); setSi(siGunGu(p.주소) || si); }} />
            </div>
            <div>
              <div className={lab}>{addrCol?.label || "시군구"}</div>
              <input className={inp} value={si} onChange={(e) => setSi(e.target.value)} placeholder="예) 오산시" />
            </div>
          </div>
          {addr && <div className="-mt-2 text-[12px] font-semibold text-[#7A8AA6]">주소: {addr}</div>}
          {qtyCols.length > 0 && (
            <div>
              <div className={lab}>수량 <span className="font-semibold text-[#9AA9C3]">(비워 두면 시트에서 업체가 채워요)</span></div>
              <div className="flex flex-wrap gap-2">
                {qtyCols.map((c) => (
                  <label key={c.id} className="w-[92px]">
                    <div className="text-[11.5px] font-bold text-[#7A8AA6] text-center mb-0.5">{c.label}</div>
                    <input inputMode="numeric" className={`${inp} text-center tabular-nums bg-[#FFFCEF]`} value={qty[c.label] ?? ""} onChange={(e) => setQty((o) => ({ ...o, [c.label]: e.target.value.replace(/[^\d]/g, "") }))} />
                  </label>
                ))}
                <div className="w-[92px]">
                  <div className="text-[11.5px] font-bold text-[#7A8AA6] text-center mb-0.5">합계</div>
                  <div className="h-10 rounded-xl bg-[#FFF3B0] flex items-center justify-center text-[15px] font-black tabular-nums">{total || "-"}</div>
                </div>
              </div>
              {fare && <div className="mt-1.5 text-[12.5px] font-bold text-[#4B6CB7]">단가표 {fare.region} · 청구운임 {fare.total.toLocaleString()}원</div>}
            </div>
          )}
          <div>
            <div className={lab}>차량번호 <span className="font-semibold text-[#9AA9C3]">(선택 · 나중에 표에서 넣어도 돼요)</span></div>
            <BoardSuggest value={plate} onChange={(v) => { setPlate(v); setDrv(null); }} items={drivers} k="차량번호" sub={(x) => [x.이름, x.전화번호].filter(Boolean).join(" · ")} title="기사관리" placeholder="번호 일부만 쳐도 목록이 떠요" className={inp}
              onPick={(x) => { setPlate(x.차량번호 || ""); setDrv(x); }} />
            {drv && <div className="mt-1 text-[12px] font-semibold text-[#7A8AA6]">{drv.이름} · {drv.전화번호}</div>}
          </div>
          {err && <div className="text-[13px] font-bold text-[#D92D20]">{err}</div>}
        </div>
        <div className="px-6 pb-6 flex gap-2.5">
          <button onClick={() => onClose()} className="flex-1 h-12 rounded-2xl border border-[#E3E8F0] bg-white text-[#3A4A66] text-[14.5px] font-extrabold hover:bg-[#F5F8FD]">취소</button>
          <button onClick={save} disabled={busy} className="flex-1 h-12 rounded-2xl bg-[#0F1A30] text-white text-[14.5px] font-black hover:bg-[#1B2B4B] disabled:opacity-60">{busy ? "저장 중…" : "오더 추가"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// 📥 2026-11-03 기간 가져오기 — 입고일(탭 이름 날짜) 기준으로 예전 탭들을 한 번에 오더로(이미 있는 줄은 그대로 맞추기만)
function RangeImportModal({ form, onClose }) {
  const today = kstDay();
  const [from, setFrom] = React.useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = React.useState(today);
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState(null);
  const [err, setErr] = React.useState("");
  const run = async () => {
    setBusy(true); setErr(""); setRes(null);
    try { setRes(await sheetApi({ action: "sync", url: form.sheetUrl, boardId: form.id, from, to })); }
    catch (e) { setErr(String(e?.message || e)); } finally { setBusy(false); }
  };
  const inp = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] text-left";
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0F1A30]/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="w-full max-w-[520px] rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,26,48,0.35)] overflow-hidden">
        <div className="px-6 py-4 bg-[#1B2B4B] text-white">
          <div className="text-[16px] font-black">기간 가져오기 · {form.name}</div>
          <div className="text-[11.5px] text-white/60 font-semibold">입고일(시트 탭 이름 날짜) 기준 · 이미 있는 줄은 시트와 맞추기만, 지운 줄은 다시 가져옵니다</div>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div><div className="text-[12px] font-black text-[#5B6B85] mb-1">시작 (입고일)</div><CustomDatePicker value={from} onChange={(e) => setFrom(e.target.value)} className={inp} /></div>
            <span className="pb-2.5 text-[#9AA9C3] font-bold">~</span>
            <div><div className="text-[12px] font-black text-[#5B6B85] mb-1">끝 (입고일)</div><CustomDatePicker value={to} onChange={(e) => setTo(e.target.value)} className={inp} /></div>
          </div>
          {busy && <div className="text-[13px] font-bold text-[#2D4C82] animate-pulse">시트 탭을 읽는 중… (탭이 많으면 1~2분 걸려요)</div>}
          {res && (
            <div className="rounded-xl bg-[#F3F7FF] border border-[#D5E0F5] px-4 py-3 text-[13.5px] font-bold text-[#0F1A30]">
              탭 {res.tabs || 0}개 확인 · 새 오더 <b className="text-[#1B7F4B]">{res.created || 0}</b>건 · 맞춘 오더 {res.updated || 0}건
              {res.skipped ? <> · 지운 줄 건너뜀 {res.skipped}건</> : null}
              {res.dates?.length ? <div className="mt-1 text-[12px] font-semibold text-[#5B6B85]">발주일 {res.dates[0]} ~ {res.dates[res.dates.length - 1]}</div> : null}
            </div>
          )}
          {err && <div className="text-[13px] font-bold text-[#D92D20]">{err}</div>}
        </div>
        <div className="px-6 pb-6 flex gap-2.5">
          <button onClick={onClose} disabled={busy} className="flex-1 h-12 rounded-2xl border border-[#E3E8F0] bg-white text-[#3A4A66] text-[14.5px] font-extrabold disabled:opacity-50">{res ? "닫기" : "취소"}</button>
          <button onClick={run} disabled={busy || !from || !to} className="flex-1 h-12 rounded-2xl bg-[#0F1A30] text-white text-[14.5px] font-black disabled:opacity-60">{busy ? "가져오는 중…" : "가져오기"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ⭐ 2026-11-05 운송업체 설정 — 시트 "운송업체" 칸에 나오는 업체 중 체크한 곳만 정산·매출에 넣는다(src/routeCarriers.js)
//  · 목록 = 저장한 업체 + 지금 오더(고정노선)에 나오는 업체 · 켜기/끄기·삭제·추가는 누르는 즉시 저장
//  · 끄거나 삭제한 업체의 고정노선 오더는 정산관리·매출관리·거래명세서·미수금·인사이트·대시보드 합계에서 빠진다(PC·모바일)
//  ⭐ 2026-11-06 + 프로그램 어디에도 안 보인다(목록·숫자·검색·실시간·지입차관리·엑셀·모바일) · 시트 연동은 그대로
//    이 창만 숨긴 업체와 그 오더 건수를 보여 준다(rows = 숨긴 오더까지 담긴 carrierPoolRows) — 다시 켜면 바로 보인다
const CARRIER_ADMIN_ROLES = new Set(["admin", "totalMaster", "test", "allMgr", "hrAcct", "hrManager"]);
export function RouteCarrierModal({ company, rows = [], disabled = false, onClose }) {
  const { setting, ready } = useRouteCarrierSetting(company);
  const [q, setQ] = React.useState("");
  const [addName, setAddName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState({ t: "", err: false });
  const role = (() => { try { return localStorage.getItem("role") || ""; } catch { return ""; } })();
  const canEdit = !disabled && (CARRIER_ADMIN_ROLES.has(role) || isMasterOnly()); // 서버 규칙: isCompanyAdmin · test · 최고관리자
  React.useEffect(() => { const k = (e) => { if (e.key === "Escape" && !document.querySelector("[role=listbox]")) onClose(); }; window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true); }, [onClose]); // 검색 목록이 떠 있으면 Esc는 목록만 닫기
  const found = React.useMemo(() => carriersInOrders(rows), [rows]);
  const countOf = React.useMemo(() => { const m = new Map(); found.forEach((f) => m.set(carrierKey(f.name), f.count)); return m; }, [found]);
  // 화면 목록 — 저장된 업체(순서 유지) + 오더에만 있는 새 업체(삭제한 업체는 빼고)
  const list = React.useMemo(() => {
    const saved = Array.isArray(setting?.carriers) ? setting.carriers : [];
    const removed = new Set((setting?.removed || []).map(carrierKey));
    const out = saved.map((c) => ({ name: c.name, on: c.on !== false, isNew: false }));
    const have = new Set(out.map((c) => carrierKey(c.name)));
    found.forEach((f) => { const k = carrierKey(f.name); if (!have.has(k) && !removed.has(k)) { have.add(k); out.push({ name: f.name, on: true, isNew: !!setting }); } });
    return out.map((c) => ({ ...c, count: countOf.get(carrierKey(c.name)) || 0 }));
  }, [setting, found, countOf]);
  const removedHidden = React.useMemo(() => (setting?.removed || []).filter((n) => countOf.get(carrierKey(n))), [setting, countOf]);
  const shown = React.useMemo(() => { const k = carrierKey(q); return k ? list.filter((c) => carrierKey(c.name).includes(k)) : list; }, [list, q]);
  const onCnt = list.filter((c) => c.on).length;
  const offRows = list.filter((c) => !c.on).reduce((a, c) => a + c.count, 0) + removedHidden.reduce((a, n) => a + (countOf.get(carrierKey(n)) || 0), 0);
  const persist = async (carriers, removed, okText) => {
    if (!canEdit) { setMsg({ t: "관리자만 바꿀 수 있습니다.", err: true }); return false; }
    setBusy(true); setMsg({ t: "", err: false });
    try { await saveRouteCarrierSetting(company, { carriers, removed }); setMsg({ t: okText || "저장했습니다", err: false }); return true; }
    catch (e) { setMsg({ t: /permission/i.test(String(e?.code || e?.message || "")) ? "저장 권한이 없습니다(관리자만 가능). 최고관리자에게 보안 규칙 배포를 확인해 주세요." : `저장하지 못했습니다: ${e?.message || e}`, err: true }); return false; }
    finally { setBusy(false); }
  };
  const base = () => list.map((c) => ({ name: c.name, on: c.on }));
  const removedOf = () => [...(setting?.removed || [])];
  const toggle = (name) => persist(base().map((c) => (c.name === name ? { ...c, on: !c.on } : c)), removedOf(), `'${name}' ${list.find((c) => c.name === name)?.on ? "숨겼습니다(화면·정산·매출에서 빠짐)" : "다시 보이게 했습니다(화면·정산·매출 포함)"}`);
  const setAll = (on) => persist(base().map((c) => ({ ...c, on })), removedOf(), on ? "모두 보이게 했습니다" : "모두 숨겼습니다");
  const remove = async (name) => {
    const n = countOf.get(carrierKey(name)) || 0;
    if (!(await kpConfirm(`'${name}'을(를) 목록에서 삭제할까요?${n ? `\n이 업체 고정노선 오더 ${n}건은 프로그램 어디에도 보이지 않고 정산·매출에서도 빠집니다(시트 연동은 그대로).` : ""}\n같은 이름으로 다시 추가하면 되살아납니다.`))) return;
    persist(base().filter((c) => c.name !== name), [...removedOf(), name], `'${name}' 삭제했습니다`);
  };
  const add = async () => {
    const name = addName.trim().replace(/\s+/g, " ");
    if (!name) { setMsg({ t: "운송업체 이름을 입력해 주세요.", err: true }); return; }
    const k = carrierKey(name);
    const cur = base();
    const exist = cur.find((c) => carrierKey(c.name) === k);
    const next = exist ? cur.map((c) => (carrierKey(c.name) === k ? { ...c, on: true } : c)) : [...cur, { name, on: true }];
    const ok = await persist(next, removedOf().filter((n) => carrierKey(n) !== k), exist ? `'${exist.name}'은(는) 이미 있어 포함으로 켰습니다` : `'${name}' 추가했습니다`);
    if (ok) { setAddName(""); setQ(""); }
  };
  const suggest = React.useMemo(() => list.map((c) => ({ ...c, 이름: c.name })), [list]);
  const inp = "h-11 w-full px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/10";
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0F1A30]/45 p-3 md:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[560px] max-h-[92vh] flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,26,48,0.35)]" data-kp="route-carrier-modal">
        <div className="relative px-5 md:px-6 py-4 text-white flex items-start gap-3" style={{ background: "linear-gradient(120deg,#0F1A30 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div className="min-w-0">
            <div className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>CARRIER · SETTLEMENT</div>
            <div className="text-[17px] font-black mt-0.5">운송업체 설정</div>
            <div className="text-[12.5px] text-white/75 font-semibold mt-0.5 leading-relaxed whitespace-normal break-keep" data-kp="carrier-desc">체크한 운송업체만 <b className="text-white">화면·정산·매출</b>에 나옵니다. 끄거나 삭제하면 어디에도 보이지 않아요(시트 연동은 유지).</div>
            {/* ⭐ 2026-11-06 운송업체 빈칸 오더 — 끈 업체와 똑같이 숨김 */}
            {(() => { const blank = (rows || []).filter((r) => r?.배차표Id && !carrierOf(r)).length; return blank > 0 ? <div className="mt-1.5 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-white/10 text-[12.5px] font-bold text-white/85" data-kp="carrier-blank">운송업체 빈칸 {blank}건 · {setting ? "숨김(정산 제외)" : "설정을 저장하면 숨김"}</div> : null; })()}{/* ⭐ 2026-11-06 짧게 · 잘리지 않게(줄바꿈 허용) */}
          </div>
          <button type="button" onClick={onClose} className="ml-auto shrink-0 h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-[12px] font-bold">닫기 <span className="text-white/50 hidden md:inline">ESC</span></button>
        </div>
        <div className="px-5 md:px-6 pt-4 pb-3 space-y-3 border-b border-[#E9EDF4]">
          <div className="flex items-center gap-2 text-[13px] font-bold text-[#3A4A66] flex-wrap">
            <span className="inline-flex items-center h-8 px-3 rounded-lg bg-[#EEF3FB] text-[#1B2B4B]">포함 <b className="ml-1.5 tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{onCnt}</b></span>
            <span className={`inline-flex items-center h-8 px-3 rounded-lg ${list.length - onCnt + removedHidden.length ? "bg-[#FFF1EE] text-[#B42318]" : "bg-[#F5F7FA] text-[#7A8AA6]"}`}>제외 <b className="ml-1.5 tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{list.length - onCnt + removedHidden.length}</b>{offRows ? <span className="ml-1.5 font-semibold">· 오더 {offRows.toLocaleString()}건</span> : null}</span>
            {canEdit && list.length > 1 && <span className="ml-auto flex gap-1.5">
              <button type="button" disabled={busy} onClick={() => setAll(true)} className="h-8 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD] disabled:opacity-50">모두 포함</button>
              <button type="button" disabled={busy} onClick={() => setAll(false)} className="h-8 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#5B6B85] hover:bg-[#F5F8FD] disabled:opacity-50">모두 제외</button>
            </span>}
          </div>
          <div className="relative">
            <BoardSuggest value={q} onChange={setQ} items={suggest} k="이름" title="운송업체" placeholder="운송업체 검색 — 일부만 쳐도 목록이 떠요"
              sub={(x) => [x.count ? `오더 ${x.count}건` : "", x.on ? "포함" : "제외"].filter(Boolean).join(" · ")}
              onPick={(x) => setQ(x.name)} className={`${inp} pl-10`} inputProps={{ "data-kp": "carrier-search" }} />
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#7A8AA6" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          </div>
        </div>
        <div className="flex-1 min-h-[200px] overflow-auto px-3 md:px-4 py-2">
          {!ready && <div className="py-10 text-center text-[14px] text-[#7A8AA6]">불러오는 중…</div>}
          {ready && shown.length === 0 && (
            <div className="py-10 text-center text-[14px] text-[#7A8AA6]">{q ? <>'{q}' 업체가 없습니다. 아래에서 새로 추가할 수 있어요.</> : <>시트 오더에 운송업체가 아직 없습니다.<br />아래에서 직접 추가할 수 있어요.</>}</div>
          )}
          {ready && shown.map((c) => (
            <div key={c.name} data-kp="carrier-row" data-on={c.on ? "1" : "0"} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${c.on ? "hover:bg-[#F5F8FD]" : "bg-[#FAFBFD]"}`}>
              <button type="button" role="switch" aria-checked={c.on} disabled={busy || !canEdit} onClick={() => toggle(c.name)} title={c.on ? "누르면 숨깁니다(화면·정산·매출에서 빠짐)" : "누르면 다시 보입니다(화면·정산·매출 포함)"}
                className={`relative shrink-0 w-[46px] h-[26px] rounded-full transition disabled:opacity-60 ${c.on ? "bg-[#1B2B4B]" : "bg-[#D5DCE7]"}`}>
                <span className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-all ${c.on ? "left-[23px]" : "left-[3px]"}`} />
              </button>
              <div className="min-w-0 flex-1">
                <div className={`text-[15px] font-black truncate ${c.on ? "text-[#0F1A30]" : "text-[#9AA9C3] line-through decoration-[#C9D2E0]"}`}>{c.name}</div>
                <div className="text-[12px] font-semibold text-[#7A8AA6] flex items-center gap-1.5">
                  {c.count ? <span>오더 {c.count.toLocaleString()}건</span> : <span>지금 오더 없음</span>}
                  {c.isNew && <span className="inline-flex items-center h-[18px] px-1.5 rounded-md bg-[#8FB0F0]/25 text-[#2D4C82] text-[10.5px] font-black">새 업체</span>}
                  {!c.on && <span className="inline-flex items-center h-[18px] px-1.5 rounded-md bg-[#FFF1EE] text-[#B42318] text-[10.5px] font-black">숨김 · 정산 제외</span>}
                </div>
              </div>
              {canEdit && <button type="button" disabled={busy} onClick={() => remove(c.name)} title="목록에서 삭제(화면·정산·매출에서 빠짐)"
                className="shrink-0 w-9 h-9 rounded-lg inline-flex items-center justify-center text-[#9AA9C3] hover:text-[#B42318] hover:bg-[#FFF1EE] disabled:opacity-50">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
              </button>}
            </div>
          ))}
          {ready && !q && removedHidden.length > 0 && (
            <div className="mx-3 mt-2 mb-1 text-[12px] font-semibold text-[#9AA9C3]">삭제한 업체(오더는 계속 숨김 · 같은 이름으로 추가하면 다시 보임): {removedHidden.join(", ")}</div>
          )}
        </div>
        <div className="px-5 md:px-6 py-4 border-t border-[#E9EDF4] bg-[#F7F9FC] space-y-2">
          {canEdit ? (
            <div className="flex items-center gap-2">
              <input value={addName} onChange={(e) => setAddName(e.target.value)} onKeyUp={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) add(); }}
                placeholder="새 운송업체 이름" className={inp} data-kp="carrier-add" maxLength={60} />
              <button type="button" disabled={busy} onClick={add} className="shrink-0 h-11 px-5 rounded-xl bg-[#1B2B4B] hover:bg-[#2D4C82] text-white text-[14px] font-black disabled:opacity-60">{busy ? "저장 중…" : "저장"}</button>
            </div>
          ) : <div className="text-[13px] font-semibold text-[#7A8AA6]">보기 전용입니다 — 관리자만 바꿀 수 있어요.</div>}
          <div className={`text-[12.5px] font-bold min-h-[18px] ${msg.err ? "text-[#B42318]" : "text-[#2D4C82]"}`}>{msg.t || (setting ? `시트에 새로 생긴 업체는 자동으로 보입니다 · 숨겨도 시트 연동은 그대로 · 일반 오더는 영향 없음` : "아직 설정 전 — 지금은 모든 운송업체 오더가 보이고 정산·매출에 들어갑니다")}</div>
        </div>
      </div>
    </div>, document.body);
}

const isMasterOnly = () => { try { return localStorage.getItem("role") === "totalMaster" || auth.currentUser?.email === "tjddnqkf@naver.com"; } catch { return false; } };
// 🔒 2026-11-03 운송사 분리 — 이 회사의 배차표 양식 id 목록(⭐ 2026-11-05 routeBoardIds.js로 옮김 · 여기서 그대로 내보냄)
export { useRouteBoardIds } from "./routeBoardIds";
// 다른 회사 양식으로 만들어져 이 회사에 잘못 남은 오더 — 확인 후 이 회사에서만 지운다("지운 줄" 기록 없이 → 원래 회사 시트 연동에 영향 없음)
function ForeignOrdersCard({ list, disabled }) {
  const [busy, setBusy] = React.useState(false);
  if (!list.length || !isMasterOnly()) return null; // 최고관리자만
  const clean = async () => {
    if (!(await kpConfirm(`다른 운송사 배차표(구글시트)에서 잘못 들어온 오더 ${list.length}건을 이 회사에서 지울까요?\n원래 운송사의 오더·시트에는 아무 영향이 없습니다.`))) return;
    setBusy(true);
    try {
      // ⭐ 2026-11-05 묶음을 차례로 기다리면 400줄씩 끊겨 사라졌다 — 모두 동시에 커밋 + 삭제 진행 창
      await deleteDocsAtomic(db, list.map((r) => doc(db, r.__col || "orders", r._id || r.id)), { label: "오더" });
    } catch (e) { window.alert(`정리하지 못했습니다: ${e?.message || e}`); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-[#F7C97A] bg-[#FFF8EC] px-5 py-4 flex items-center gap-4 flex-wrap">
      <div className="min-w-0">
        <div className="text-[14.5px] font-black text-[#8A4B08]">다른 회사 구글시트 오더가 이 회사에 잘못 저장됨 · {list.length}건</div>
        <div className="text-[12.5px] text-[#9A6B2E] mt-0.5">운송사 분리 전에 다른 회사의 고정노선(구글시트) 오더가 이 회사 이름으로 저장된 것입니다. 이 회사 배차표 양식이 아니라 고정노선현황엔 안 보이지만 매출·정산 합계에는 섞일 수 있습니다. [정리]를 누르면 이 회사에서만 지워지고, 원래 회사 오더·구글시트는 그대로입니다(휴지통 7일 보관).</div>
      </div>
      {!disabled && <button type="button" disabled={busy} onClick={clean} className="ml-auto h-10 px-4 rounded-xl bg-[#8A4B08] text-white text-[13px] font-black disabled:opacity-60">{busy ? "정리 중…" : "이 회사에서 정리"}</button>}
    </div>
  );
}

// ⭐ 2026-11-06 양식 고르기 — 버튼 줄(태진 · 삼다수 · 87 …) 대신 드롭다운(양식이 많아도 한 칸)
function FormPicker({ forms = [], value, countOf, onChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", esc); };
  }, [open]);
  const cur = forms.find((f) => f.id === value) || forms[0];
  if (!cur) return null;
  return (
    <div ref={ref} className="relative" data-kp="frs-form-picker">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} title="배차표 양식 고르기"
        className="h-10 pl-3.5 pr-3 rounded-xl inline-flex items-center gap-2 bg-white text-[#0F1A30] border border-white text-[14px] font-black whitespace-nowrap hover:bg-[#EEF2F8] max-w-[260px]">
        <span className="text-[10.5px] font-extrabold tracking-[0.18em] text-[#4B6CB7]">양식</span>
        <span className="truncate">{cur.name}</span>
        <span className="text-[11.5px] tabular-nums text-[#7A8AA6] font-bold" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{countOf(cur)}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div role="listbox" className="absolute left-0 top-[calc(100%+6px)] z-[60] min-w-[240px] max-h-[360px] overflow-auto rounded-2xl bg-white border border-[#E3E8F0] shadow-[0_18px_44px_rgba(15,26,48,0.28)] py-1.5">
          {forms.map((f) => {
            const on = f.id === cur.id;
            return (
              <button key={f.id} type="button" role="option" aria-selected={on} onClick={() => { onChange(f.id); setOpen(false); }}
                className={`w-full px-3.5 h-10 flex items-center gap-2.5 text-left text-[14px] font-extrabold ${on ? "bg-[#EEF3FC] text-[#0F1A30]" : "text-[#2A3852] hover:bg-[#F5F8FD]"}`}>
                <span className={`w-4 h-4 rounded-full border-2 grid place-items-center shrink-0 ${on ? "border-[#1B2B4B] bg-[#1B2B4B]" : "border-[#C9D5EA]"}`}>{on && <span className="w-1.5 h-1.5 rounded-full bg-white" />}</span>
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-[12px] tabular-nums font-bold text-[#7A8AA6]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{countOf(f)}건</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FixedRouteStatusHost({ company, dispatchData = [], carrierPoolRows = null, render, places = [], drivers = [], disabled = false }) {
  useFleetLivePublish(drivers); // ⭐ 2026-11-05 실시간 관제 색인(이미 받은 drivers · 추가 읽기 없음)
  const [addOpen, setAddOpen] = React.useState(false);
  const [rangeOpen, setRangeOpen] = React.useState(false);
  const [carrierOpen, setCarrierOpen] = React.useState(false); // ⭐ 2026-11-05 운송업체 설정
  const carrierF = useRouteCarrierFilter(company);
  const [forms, setForms] = React.useState(null);
  const [formId, setFormId] = React.useState(() => { try { return localStorage.getItem("kpFixedStatusForm") || ""; } catch { return ""; } });
  const [sync, setSync] = React.useState({ at: 0, busy: false, err: "", last: null });
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "routeBoards"), where("companyName", "==", company)), (s) => setForms(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))), () => setForms([]));
  }, [company]);
  const form = (forms || []).find((f) => f.id === formId) || (forms || [])[0] || null;
  React.useEffect(() => { try { if (form?.id) localStorage.setItem("kpFixedStatusForm", form.id); } catch { /* 무시 */ } }, [form?.id]);
  const rowsOf = React.useCallback((f) => (dispatchData || []).filter((r) => r.배차표Id === f.id), [dispatchData]);
  const rows = form ? rowsOf(form) : [];
  // ⭐ 2026-11-06 운송업체 칸 — 양식에 열이 없어도 오더에 값이 있으면 화면 표에 붙인다(같은 양식이면 같은 객체 → 화면이 다시 만들어지지 않게)
  const hasCarrierVal = rows.some((r) => carrierOf(r));
  const formView = React.useMemo(() => (form ? withCarrierCol(form, hasCarrierVal ? [{ 추가정보: { 운송업체: "1" } }] : []) : form), [form, hasCarrierVal]);
  // 30초마다 시트와 맞춤(화면을 연 동안) — 서버가 새 탭·새 줄·바뀐 칸을 처리
  // 💰 2026-11-04 서버 비용 — 30초 자동 맞춤은 auto 표시를 붙여 보낸다: 같은 양식을 다른 직원 화면이 25초 안에 이미 맞췄으면 서버가 건너뛴다
  //  (직원 여러 명이 같은 화면을 열어 두면 30초마다 사람 수만큼 시트·오더를 다시 읽던 것을 양식당 1번으로)
  const runSync = React.useCallback(async (f, quiet = true, auto = false) => {
    if (!f?.sheetUrl || f.autoSync === false) return;
    setSync((s) => ({ ...s, busy: true }));
    try { const r = await sheetApi({ action: "sync", url: f.sheetUrl, boardId: f.id, ...(auto ? { auto: true } : {}) }); setSync((s) => ({ at: Date.now(), busy: false, err: "", last: r?.skipped === "recent" || r?.skipped === "unchanged" ? s.last : r })); }
    catch (e) { setSync((s) => ({ ...s, busy: false, at: Date.now(), err: quiet ? String(e?.message || e) : (window.alert?.(`시트와 맞추지 못했습니다: ${e?.message || e}`), String(e?.message || e)) })); }
  }, []);
  React.useEffect(() => {
    if (!form?.sheetUrl || form.autoSync === false) return undefined;
    runSync(form, true, true); // 💰 2026-11-06 화면을 열 때도 "바뀌었을 때만"(서버가 시트 수정시각으로 판단)
    const t = setInterval(() => { if (document.visibilityState === "visible") runSync(form, true, true); }, 30000);
    return () => clearInterval(t);
  }, [form?.id, form?.sheetUrl, form?.autoSync, runSync]); // eslint-disable-line react-hooks/exhaustive-deps

  if (forms === null) return <div className="py-16 text-center text-[14px] text-[#7A8AA6]">불러오는 중…</div>;
  const formIdSet = new Set(forms.map((f) => f.id));
  const foreign = (dispatchData || []).filter((r) => r.배차표Id && !formIdSet.has(r.배차표Id) && String(r.companyName || "") === String(company || ""));
  if (!forms.length) return (
    <div className="space-y-3"><ForeignOrdersCard list={foreign} disabled={disabled} />
    <div className="rounded-[20px] bg-white border border-[#E3E8F0] p-10 text-center">
      <div className="text-[16px] font-black text-[#0F1A30]">고정노선 배차표 양식이 없습니다</div>
      <div className="text-[13.5px] text-[#7A8AA6] mt-1.5">지입차관리 › 고정노선 › [배차표]에서 화주사 구글시트로 양식을 먼저 만들어 주세요.</div>
    </div></div>
  );
  const unassigned = pickUnassignedOrders(rows).length; // ⭐ 2026-11-05 PC·모바일 일치 — 메뉴 숫자와 같은 미배차 기준
  // ⭐ 2026-11-05 운송업체 설정 — 이 회사 양식 오더 전체(모든 양식)에서 업체 모으기 · 정산·매출 제외 건수
  // ⭐ 2026-11-06 화면 데이터(dispatchData)에는 숨긴 업체 오더가 없다 — 설정 창·숨김 건수는 숨긴 오더까지 담긴 carrierPoolRows로
  const companyRouteRows = (carrierPoolRows || dispatchData || []).filter((r) => r.배차표Id && formIdSet.has(r.배차표Id));
  const hasCarrierCol = forms.some((f) => (f.columns || []).some(isCarrierCol)) || companyRouteRows.some((r) => carrierOf(r));
  const carrierOff = carrierF.active ? companyRouteRows.filter((r) => !carrierF.isVisible(r)).length : 0;
  return (
    <div className="space-y-3 kp-frs">
      <style>{`.kp-frs-cell{height:34px;padding:0 8px;border-radius:8px;border:1px solid transparent;background:transparent;font-size:13.5px;color:#0F1A30;outline:none;transition:border-color .12s,background .12s}
        .kp-frs-cell:hover{border-color:#DCE3EE;background:#fff}.kp-frs-cell:focus{border-color:#2D4C82;background:#fff;box-shadow:0 0 0 3px rgba(45,76,130,.12)}
        .kp-frs-cell::placeholder{color:#D92D20;font-weight:800;opacity:.75}.kp-frs-cell:disabled{opacity:.6}
        .kp-frs table{border-collapse:separate;border-spacing:0}
        .kp-frs thead th{border-right:1px solid rgba(255,255,255,.14)}
        .kp-frs tbody tr.kp-frs-row>td{border-right:1px solid #E3E8F0 !important;border-bottom:1px solid #DCE3EE !important}
        .kp-frs tbody tr.kp-frs-row>td:last-child{border-right:none !important}
        .kp-frs tbody tr.kp-frs-row[data-gstart="1"]>td{border-top:2px solid #1B2B4B}
        .kp-frs tbody tr.kp-frs-row:hover>td{box-shadow:inset 0 0 0 9999px rgba(45,76,130,.035)}
        .kp-frs td[data-frs="qty"]{background:#EEF3FB}.kp-frs td[data-frs="qty"][data-empty="1"]{background:#F7F9FD}
        .kp-frs td[data-frs="qty"],.kp-frs td[data-frs="qty"] *{color:#1B2B4B;font-size:15.5px;font-weight:900;font-family:${MONO};font-variant-numeric:tabular-nums}
        .kp-frs td[data-frs="sum"]{background:#1B2B4B;border-right-color:#0F1A30 !important}
        .kp-frs td[data-frs="sum"],.kp-frs td[data-frs="sum"] *{color:#fff;font-size:17px;font-weight:900;font-family:${MONO};font-variant-numeric:tabular-nums}
        .kp-frs thead th[data-frs="qty"]{background:#2D4C82}
        .kp-frs thead th[data-frs="sum"]{background:#0B1428;box-shadow:inset 0 -3px 0 #8FB0F0}`}</style>
      {/* ⭐ 2026-11-06 머리띠 정리 — [제목 · 양식 고르기(드롭다운)] | [오더 작업: 오더 추가 · 기간 가져오기 · 운송업체 설정] | [상태: 미배차 · 관제 · 시트 연동] · 버튼 높이 40px로 통일 */}
      <div className="relative rounded-[22px] px-4 md:px-6 py-4 text-white" data-kp="frs-header" style={{ background: "radial-gradient(900px 300px at 90% -20%, rgba(110,149,232,.28), transparent 60%), linear-gradient(120deg,#060C1A 0%,#0F1A30 45%,#1B2B4B 100%)" }}>
        <div className="absolute inset-0 rounded-[22px] pointer-events-none" style={{ background: "linear-gradient(rgba(143,176,240,.06) 1px, transparent 1px) 0 0/24px 24px, linear-gradient(90deg, rgba(143,176,240,.06) 1px, transparent 1px) 0 0/24px 24px" }} />
        <div className="relative flex items-center gap-x-4 gap-y-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <div className="text-[10.5px] font-extrabold tracking-[0.32em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>FIXED ROUTE · LIVE BOARD</div>
              <div className="text-[22px] font-black mt-0.5 whitespace-nowrap">고정노선현황</div>
            </div>
            <FormPicker forms={forms} value={form?.id || ""} countOf={(f) => rowsOf(f).length} onChange={setFormId} />
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 flex-wrap">
            {/* 오더 작업 */}
            <div className="flex items-center gap-1.5 flex-wrap" data-kp="frs-actions">
              {form && !disabled && (
                <button type="button" onClick={() => setAddOpen(true)} title="이 양식에 오더 추가 — 시트에도 새 줄로 들어갑니다"
                  className="h-10 px-4 rounded-xl inline-flex items-center gap-1.5 text-[13.5px] font-black bg-white text-[#0F1A30] hover:bg-[#EEF2F8] whitespace-nowrap">＋ 오더 추가</button>
              )}
              {/* ⭐ 2026-11-03 [지운 줄 다시 가져오기] 제거 — [기간 가져오기]를 누르면 지운 줄까지 다시 가져온다 */}
              {form && !disabled && form.sheetUrl && (
                <button type="button" onClick={() => setRangeOpen(true)} title="예전 날짜 탭(입고일 기준)을 한 번에 가져오기"
                  className="h-10 px-3.5 rounded-xl inline-flex items-center gap-1.5 text-[13px] font-black bg-white/[0.08] border border-white/20 text-white hover:bg-white/[0.14] whitespace-nowrap">기간 가져오기</button>
              )}
              {(hasCarrierCol || carrierF.active) && (
                <button type="button" onClick={() => setCarrierOpen(true)} data-kp="carrier-open" title="시트 운송업체 중 보일 업체 고르기 — 끄면 화면·정산·매출에서 빠짐"
                  className="h-10 px-3.5 rounded-xl inline-flex items-center gap-1.5 text-[13px] font-black bg-white/[0.08] border border-white/20 text-white hover:bg-white/[0.14] whitespace-nowrap">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></svg>
                  운송업체 설정
                  {carrierOff > 0 && <span className="ml-0.5 inline-flex items-center h-[20px] px-1.5 rounded-md bg-[#FF8A7A]/20 text-[#FFC2B8] text-[11px] font-black" title="숨긴 운송업체의 고정노선 오더(화면·정산·매출에서 빠짐 · 시트 연동은 그대로)">숨김 {carrierOff}</span>}
                </button>
              )}
            </div>
            <span className="hidden md:block w-px h-7 bg-white/15" />
            {/* 상태 */}
            <div className="flex items-center gap-1.5 flex-wrap" data-kp="frs-status">
              <span className={`h-10 px-3.5 rounded-xl inline-flex items-center gap-2 text-[13px] font-black border whitespace-nowrap ${unassigned ? "bg-[#F7B955]/15 border-[#F7B955]/50 text-[#FCD9A0]" : "bg-white/[0.06] border-white/15 text-white/75"}`}>
                미배차 <span className="text-[17px] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{unassigned}</span>
              </span>
              <FleetLiveButton rows={rows} dark size="lg" />{/* ⭐ 2026-11-05 실시간 관제 */}
              {form?.sheetUrl ? (
                <button type="button" onClick={() => runSync(form, false)} disabled={sync.busy} title="지금 시트와 맞추기"
                  className="h-10 px-3.5 rounded-xl inline-flex items-center gap-2 text-[12.5px] font-bold bg-white/[0.06] border border-white/15 text-white/90 hover:bg-white/[0.12] disabled:opacity-60 whitespace-nowrap">
                  <span className={`w-2 h-2 rounded-full ${sync.err ? "bg-[#FF8A7A]" : form.autoSync === false ? "bg-white/40" : "bg-[#4ADE80] shadow-[0_0_8px_#4ADE80]"} ${sync.busy ? "animate-pulse" : ""}`} />
                  {sync.busy ? "시트와 맞추는 중…" : sync.err ? "시트 연동 오류 · 다시" : form.autoSync === false ? "자동 연동 꺼짐 · 지금 맞추기" : `시트 연동 · ${sync.at ? new Date(sync.at).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "확인 중"}`}
                </button>
              ) : <span className="text-[12.5px] text-white/55">시트 주소가 없는 양식입니다</span>}
            </div>
          </div>
        </div>
        {sync.err && <div className="relative mt-2 text-[12.5px] text-[#FFB4A8]">{sync.err}</div>}
        <div className="relative mt-2 flex items-center gap-3 flex-wrap text-[11.5px] text-white/60">
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#FFF8DB]" />리터·파레트 수량</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#F3F7FF]" />운송사 입력 칸</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#DC2626]" />긴급</span>
          <span>줄을 두 번 누르면 수정 모드 · 오른쪽 클릭 = 담당자 지정·오더 추가 등 · 프로그램에서 고친 값은 바로 시트에, 시트에서 고친 내용은 바뀌었을 때 들어옵니다</span>
        </div>
      </div>
      <ForeignOrdersCard list={foreign} disabled={disabled} />
      {form && render(formView, rows, { addOrder: disabled ? null : () => setAddOpen(true), sheetUrl: form.sheetUrl || "", syncNow: () => runSync(form, false) })}{/* ⭐ 2026-11-06 오른쪽 클릭 메뉴(오더 추가·시트 열기)용 */}
      {carrierOpen && <RouteCarrierModal company={company} rows={companyRouteRows} disabled={disabled} onClose={() => setCarrierOpen(false)} />}
      {rangeOpen && form && <RangeImportModal form={form} onClose={() => setRangeOpen(false)} />}
      {addOpen && form && <AddFixedOrderModal form={form} rows={rows} places={places} drivers={drivers} onClose={(ok) => { setAddOpen(false); if (ok && form.sheetUrl) setTimeout(() => runSync(form), 800); }} />}
    </div>
  );
}

// 📱 2026-11-03 모바일 고정노선현황 — PC와 같은 양식 고르기·시트 연동·오더 추가, 표는 가로로 밀어 보기 · 줄을 두 번 눌러 수정
// ⭐ 2026-11-05 PC·모바일 일치 — PC 배차현황(fixedForm)과 같은 조회 기준: 입고일 기간 · 상태(전체/미배차/배차완료/미전달) ·
//   검색(거래처·상차지·하차지·차량번호·기사·지급방식·배차방식) · 합계(건수·청구·기사·수수료) · 정렬(입고일 → 묶음 → 시트 줄)
const FR_STATUS = [["ALL", "전체"], ["UNASSIGNED", "미배차"], ["COMPLETE", "배차완료"], ["UNDELIVERED", "미전달"]];
const frIn = (r) => String(r.입고일 || r.하차일 || r.상차일 || "").slice(0, 10);
const frStatusOk = (r, st) => (st === "UNASSIGNED" ? r.배차상태 === "배차중" : st === "COMPLETE" ? r.배차상태 === "배차완료" : st === "UNDELIVERED" ? (r.업체전달상태 || "미전달") !== "전달완료" : true);
// ⭐ 2026-11-06 검색 종류(PC 배차현황 검색창과 같은 이름) — 통합/거래처/상차지/하차지/차량번호/기사명/배차담당자/운송사
export const FR_SEARCH_TYPES = [["all", "통합"], ["client", "거래처"], ["pickup", "상차지"], ["drop", "하차지"], ["car", "차량번호"], ["driver", "기사명"], ["mgr", "배차담당자"], ["carrier", "운송사"], ["fare", "운임구분"]]; // ⭐ 2026-11-06 운임구분
const frStaffOf = (r, nameMap) => { const n = orderStaffNameRaw(r, nameMap); return String((n && n !== "고정노선" ? n : "") || r?.배차확정자 || n || ""); };
const frSearchOk = (r, q, type = "all", nameMap = null) => {
  const k = String(q || "").trim().toLowerCase();
  if (!k) return true;
  const g = (v) => String(v || "").toLowerCase();
  const ns = (v) => g(v).replace(/\s+/g, "");
  switch (type) {
    case "client": return g(r.거래처명).includes(k);
    case "pickup": return g(r.상차지명).includes(k) || g(r.배차표묶음).includes(k);
    case "drop": return g(r.하차지명).includes(k) || g(r.하차지주소).includes(k);
    case "car": return ns(r.차량번호).includes(k.replace(/\s+/g, ""));
    case "driver": return g(r.이름).includes(k) || g(r.기사명).includes(k);
    case "mgr": return g(frStaffOf(r, nameMap)).includes(k);
    case "carrier": return g(carrierOf(r)).includes(k);
    case "fare": return ns(r.운임구분).includes(k.replace(/\s+/g, "")); // ⭐ 2026-11-06
    default:
      return g(r.거래처명).includes(k) || g(r.상차지명).includes(k) || g(r.하차지명).includes(k) || g(r.차량번호).includes(k) || g(r.이름).includes(k) || g(r.지급방식).includes(k) || g(r.배차방식).includes(k)
        || g(frStaffOf(r, nameMap)).includes(k) || g(carrierOf(r)).includes(k) || g(r.전화번호).includes(k) || g(r.하차지주소).includes(k) || g(r.배차표묶음).includes(k)
        || Object.values(r.추가정보 || {}).some((v) => g(v).includes(k)) || g(r.운임구분).includes(k);
  }
};
function MobileFixedRouteBody({ form, rows, range, setRange, status, setStatus, q, setQ, qType = "all", setQType = () => {}, role = "", drivers, clients, disabled }) {
  const [editId, setEditId] = React.useState(null);
  const [qInput, setQInput] = React.useState(q);
  const [qTypeInput, setQTypeInput] = React.useState(qType);
  const nameMap = useUserNameMap(); // ⭐ 2026-11-06 배차담당자 이름(직원 목록 공용 구독)
  const guard = useRouteEditGuard(role); // ⭐ 2026-11-06 담당자만 수정(마스터는 전부)
  const [from, setFrom] = React.useState(range.from);
  const [to, setTo] = React.useState(range.to);
  React.useEffect(() => { setFrom(range.from); setTo(range.to); }, [range.from, range.to]);
  // 입고일 = 상차일 + 하차일수 → 고른 기간의 오더를 다 보려면 상차일 기준으로 하차일수만큼 앞에서부터 불러온다
  const { loadRange } = useOrderHistory();
  const off = Math.max(0, toInt(form.dropOffset)) + 3; // ⭐ 2026-11-06 PC와 같게 — 하차일수 + 주말 여유 3일
  React.useEffect(() => { if (range.from) loadRange(addDaysStr(range.from, -off), range.to || range.from); }, [range.from, range.to, off, loadRange]);
  // ⭐ 2026-11-06 처음 배차(차량 넣기)하면 배차한 사람을 남긴다(PC patchDispatch와 같은 칸) → 그 사람이 이 오더의 담당자
  const patch = (r) => (p) => {
    const extra = p.배차상태 === "배차완료" && r.배차상태 !== "배차완료" ? { 배차확정일시: serverTimestamp(), 배차확정자: guard.me.name || auth.currentUser?.email?.split("@")[0] || "" }
      : p.배차상태 === "배차중" && r.배차상태 === "배차완료" ? { 배차확정일시: null, 배차확정자: null } : {};
    requestRouteSheetPush(r.배차표Id || form.id); // 💰 2026-11-06 고친 값 바로 시트에
    return updateDoc(doc(db, r.__col || "orders", r._id || r.id), { ...p, ...extra, 최종수정자: auth.currentUser?.email || "", updatedAt: Date.now() }).catch((e) => window.alert(`저장하지 못했습니다: ${e?.message || e}`));
  };
  const gi = (r) => { const i = (form.groups || []).findIndex((g) => g.name === r.배차표묶음); return i < 0 ? 999 : i; };
  const inRange = React.useMemo(() => rows.filter((r) => { const d = frIn(r); if (!d) return false; return range.from <= range.to ? d >= range.from && d <= range.to : d >= range.from || d <= range.to; }), [rows, range.from, range.to]);
  const counts = React.useMemo(() => {
    const base = inRange.filter((r) => frSearchOk(r, q, qType, nameMap));
    return { ALL: base.length, UNASSIGNED: base.filter((r) => frStatusOk(r, "UNASSIGNED")).length, COMPLETE: base.filter((r) => frStatusOk(r, "COMPLETE")).length, UNDELIVERED: base.filter((r) => frStatusOk(r, "UNDELIVERED")).length };
  }, [inRange, q, qType, nameMap]);
  const list = React.useMemo(() => inRange.filter((r) => frStatusOk(r, status) && frSearchOk(r, q, qType, nameMap))
    .sort((a, b) => frIn(a).localeCompare(frIn(b)) || gi(a) - gi(b) || (a.시트줄 ?? 1e9) - (b.시트줄 ?? 1e9) || (a.배차표순번 || 0) - (b.배차표순번 || 0)), [inRange, status, q, qType, nameMap]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = React.useMemo(() => { const sale = list.reduce((s, r) => s + toInt(r.청구운임), 0); const drv = list.reduce((s, r) => s + toInt(r.기사운임), 0); return { sale, drv, fee: sale - drv }; }, [list]);
  const head = fixedHeaderOf(form).filter((h) => h !== "선택");
  const apply = (f = from, t = to) => { if (!f || !t) { window.alert("조회 기간을 입력해주세요."); return; } if (f > t) { window.alert("조회 시작일이 종료일보다 늦을 수 없습니다."); return; } setRange({ from: f, to: t }); setQ(qInput); setQType(qTypeInput); };
  const quick = (f, t) => { setFrom(f); setTo(t); setRange({ from: f, to: t }); };
  const td = kstDay();
  const monthFirst = `${td.slice(0, 7)}-01`;
  const monthLast = (() => { const d = new Date(`${monthFirst}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); })();
  const won = (n) => Number(n || 0).toLocaleString("ko-KR");
  const chip = (on) => `h-8 px-3 rounded-lg text-[12.5px] font-black border whitespace-nowrap ${on ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`;
  return (
    <div className="space-y-2" data-kp="m-fixedroute">
      <div className="rounded-2xl border border-[#E3E8F0] bg-white p-2.5 space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-black text-[#5B6B85]">입고일</span>
          {[["어제", addDaysStr(td, -1), addDaysStr(td, -1)], ["오늘", td, td], ["내일", addDaysStr(td, 1), addDaysStr(td, 1)], ["이번 달", monthFirst, monthLast]].map(([l, f, t]) => (
            <button key={l} type="button" onClick={() => quick(f, t)} className={chip(range.from === f && range.to === t)}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex-1 min-w-0"><CustomDatePicker value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-full px-2 rounded-lg border border-[#DCE3EE] text-[12.5px] font-semibold bg-white" /></span>
          <span className="text-[#9AA9C3] font-bold">~</span>
          <span className="flex-1 min-w-0"><CustomDatePicker value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-full px-2 rounded-lg border border-[#DCE3EE] text-[12.5px] font-semibold bg-white" /></span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* ⭐ 2026-11-06 검색 종류 — 통합/거래처/상차지/하차지/차량번호/기사명/배차담당자/운송사 */}
          <select value={qTypeInput} onChange={(e) => setQTypeInput(e.target.value)} data-kp="frs-qtype" aria-label="검색 종류"
            className="shrink-0 h-9 pl-2 pr-1 rounded-lg border border-[#1B2B4B] bg-[#1B2B4B] text-white text-[12.5px] font-black outline-none">
            {FR_SEARCH_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") apply(); }} placeholder={qTypeInput === "all" ? "거래처·차량번호·기사·담당자·운송사" : `${(FR_SEARCH_TYPES.find((x) => x[0] === qTypeInput) || [])[1] || ""} 검색`}
            data-kp="frs-q" className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-semibold text-[#0F1A30] bg-white outline-none focus:border-[#2D4C82]" />
          <button type="button" onClick={() => apply()} className="h-9 px-4 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-black shrink-0">조회</button>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          {FR_STATUS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setStatus(k)} className={chip(status === k)} data-kp={`frs-${k}`}>
              {l} <span className="tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{counts[k]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5" data-kp="frs-summary">
        {[["건수", `${list.length}`], ["청구", won(sum.sale)], ["기사", won(sum.drv)], ["수수료", won(sum.fee)]].map(([l, v], i) => (
          <div key={l} className={`rounded-xl px-2 py-1.5 ${i === 3 ? "bg-[#0B1428] text-white" : "bg-white border border-[#E3E8F0] text-[#0F1A30]"}`}>
            <div className={`text-[11.5px] font-extrabold ${i === 3 ? "text-white" : "text-[#5B6B85]"}`}>{l}</div>{/* ⭐ 2026-11-06 합계 글자 대비 */}
            <div className="text-[13.5px] font-black tabular-nums truncate" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{v}</div>
          </div>
        ))}
      </div>
      <div className="text-right text-[11.5px] font-bold text-[#7A8AA6]">{range.from === range.to ? range.from : `${range.from} ~ ${range.to}`} · {list.length}건 · 두 번 눌러 수정</div>
      <div className="overflow-x-auto rounded-2xl border border-[#E3E8F0] bg-white" style={{ WebkitOverflowScrolling: "touch" }}>
        <table className="text-[12.5px] border-separate border-spacing-0" style={{ minWidth: "max-content" }}>
          <thead><tr>{head.map((h) => <th key={h} className="sticky top-0 bg-[#1B2B4B] text-white font-extrabold px-2 py-2 whitespace-nowrap border-r border-white/10">{h}</th>)}</tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={head.length} className="py-10 text-center text-[#9AA9C3] font-semibold">조건에 맞는 오더가 없어요</td></tr>}
            {list.map((r, i) => {
              const id = r._id || r.id;
              const locked = !disabled && !guard.canEdit(r); // ⭐ 2026-11-06 담당자가 아니면 잠금
              const owner = locked ? routeOwnerName(r, nameMap) : "";
              return (
                <tr key={id} data-lock={locked ? "1" : undefined} title={locked ? `🔒 ${ROUTE_LOCK_MSG}${owner ? ` (담당: ${owner})` : ""}` : undefined}
                  style={urgentRowStyle(r, {}, { tint: editId !== id })}
                  className={`kp-frs-row ${editId === id ? "bg-[#EEF4FF] outline outline-2 -outline-offset-2 outline-[#2D4C82]" : i % 2 ? "bg-[#FAFBFD]" : "bg-white"}`}
                  onDoubleClick={() => { if (disabled) return; if (locked) { window.alert(`🔒 ${ROUTE_LOCK_MSG}${owner ? ` (담당: ${owner})` : ""}\n본인이 등록·배차한 오더만 고칠 수 있어요 · 마스터는 모든 오더 수정 가능`); return; } setEditId((c) => (c === id ? null : id)); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.target.tagName === "INPUT" && !document.querySelector("[role=listbox]")) { e.target.blur(); setTimeout(() => setEditId(null), 220); } }}>
                  <td className="px-2 py-1.5 text-center font-bold text-[#5B6B85] border-b border-[#E9EDF4] border-r border-r-[#E3E8F0]">
                    {editId === id && !locked ? <button type="button" onClick={() => setEditId(null)} className="h-7 px-2 rounded-lg bg-[#1B2B4B] text-white text-[11px] font-black">완료</button>
                      : <span className="inline-flex items-center gap-1">{i + 1}{locked && <svg data-kp="frs-lock" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9AA9C3" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label={ROUTE_LOCK_MSG}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>}</span>}
                  </td>
                  <FixedOwnerCell row={r} nameMap={nameMap} />{/* ⭐ 2026-11-06 담당자 */}
                  <FixedRouteCells form={form} row={r} drivers={drivers} clients={clients} disabled={disabled || locked} editing={editId === id && !locked} onPatch={patch(r)} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export function MobileFixedRouteView({ company, role = "", dispatchData = [], carrierPoolRows = null, drivers = [], clients = [], places = [], disabled = false }) {
  const [range, setRange] = React.useState(() => ({ from: kstDay(), to: kstDay() })); // PC처럼 처음엔 오늘
  const [status, setStatus] = React.useState("ALL");
  const [q, setQ] = React.useState("");
  const [qType, setQType] = React.useState("all"); // ⭐ 2026-11-06 검색 종류
  return (
    <div className="px-2 py-2 kp-m-pc">
      <FixedRouteStatusHost company={company} dispatchData={dispatchData} carrierPoolRows={carrierPoolRows} places={places} drivers={drivers} disabled={disabled}
        render={(form, rows) => <MobileFixedRouteBody key={form.id} form={form} rows={rows} range={range} setRange={setRange} status={status} setStatus={setStatus} q={q} setQ={setQ} qType={qType} setQType={setQType} role={role} drivers={drivers} clients={clients} disabled={disabled} />} />
    </div>
  );
}
