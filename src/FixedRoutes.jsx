// ======================= src/FixedRoutes.jsx =======================
// 🛣 고정노선(지입차관리 › 고정노선) — 정해진 요일·시간에 같은 기사님이 항상 가는 노선
//
//  구조
//   fixedRoutes/{id}: { companyName, name, client, color, stops:[{ type, name, addr, time, contact, memo }],
//     days:["월",…], startTime, tonnage, vehicleType, fareClient, fareDriver, driverKey, driverName, carNo, phone,
//     startDate, endDate, autoDispatch, active, memo, updatedAt }
//   · 정류지는 1곳(단순 왕복)부터 근거리 여러 곳·거점까지 — 순서대로 상차 → 경유(거점) → 하차
//   · 배정 기사·요일·시간을 정하면, 그 요일마다 배차가 자동으로 만들어진다(오늘~7일 앞까지, 같은 날 중복 없음)
//     ⭐ 2026-11-05 → 오늘~이번 달 말일(최소 7일 앞)까지 · 다음 달은 새 달에 앱(PC·모바일)을 열 때 이어서 · genThrough=어디까지 만들었는지
//     · active(운행 ON/OFF) false면 새로 만들지 않는다(이미 만든 배차는 그대로) · stops[i].method=상/하차방법 · dispatchType=배차방식
//     → 배차관리·배차현황·실시간배차현황·기사앱에 일반 오더처럼 보이고, "고정노선" 표시가 붙는다.
//   · 휴무·공휴일·임시 중단은 날짜만 빼면 된다(건너뛸 날짜)
//   · ⭐ 2026-11-01 정류지별 운임 — stops[i].fareClient/fareDriver/payMethod(지급방식, 운임 있으면 필수)
//     노선 1회 운임 = 정류지 운임 합계(fareMode:"stop") · 정류지 운임이 없으면 기본 운임 + 노선 payMethod(단일 운임)
//     오더에는 청구운임·기사운임·수수료(합계) + 정류지운임[{이름,구분,청구운임,기사운임,수수료,지급방식}]
//     지급방식이 서로 다르면 지급방식별로 오더를 나눠 만든다(정산·거래명세서가 거래처·지급방식으로 묶이므로)
import { coDocKey } from "./coKey";
import { getTenant } from "./fsTenant";
import { createPortal } from "react-dom";
import React from "react";
import { kpConfirm, kpAlert } from "./kpDialog";
import { runDelete } from "./DeleteProgress"; // ⭐ 2026-11-05 삭제 진행 창
import { collection, doc, onSnapshot, query, where, addDoc, updateDoc, deleteDoc, setDoc, getDoc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { db, auth, DEFAULT_COMPANY } from "./firebase";
import CustomDatePicker from "./CustomDatePicker";
import { CustomSelect } from "./CustomSelect";
import { TimeSelect, MultiDateSelect, korTimeLabel } from "./kpInputs";
import { useCompanyDropdownOptions } from "./companyDropdownOptions";
import RouteMapModal from "./RouteMapModal";
// ⭐ 2026-11-02 운임규칙 — 노선·정류지 기본 운임구분(규칙 사용 회사만) → 기사운임 자동 계산, 만든 오더에 운임구분
import { VehicleTypePicker } from "./vehicleTypes"; // 🚚 2026-11-02 회사 공용 차량종류
import { CompanyOptionPicker } from "./companyOptionPicker"; // 🧾 2026-11-02 지급방식·배차방식·상/하차방법 공용 선택기(＋ 추가)
import { useFareRules, FareTypeSelect, findFareRule, applyFareRule, fareRuleHint } from "./fareRules";
import { fmtPhone } from "./formatInput";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const STOP_TYPES = ["상차", "경유", "거점", "하차"];
const STOP_LABEL = { 상차: "상차지", 경유: "경유지", 거점: "거점지", 하차: "하차지" }; // ⭐ 2026-11-05
const COLORS = ["#0F1A30", "#1B2B4B", "#2D4C82", "#4B6CB7", "#8FB0F0"];
const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const won = (n) => toInt(n).toLocaleString("ko-KR");
const kst = (offsetDays = 0) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
const dayOf = (ymd) => DAYS[(new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7];
const korTime = (hm) => { if (!hm) return ""; const [h, m] = hm.split(":").map(Number); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(m).padStart(2, "0")}`; };
const card = "rounded-[18px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_rgba(16,24,40,0.05)]";
const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15";
const lab = "flex items-center gap-1.5 text-[14px] font-black text-[#3A4A66] mb-1.5 whitespace-nowrap"; // ⭐ 2026-11-05 라벨 14px
const norm = (v) => String(v || "").toLowerCase().replace(/\(주\)|㈜/g, "").replace(/\s+/g, "");
const placeKey = (name) => norm(name).replace(/[^\uAC00-\uD7A3a-z0-9]/gi, "");
const NewTag = () => <span className="inline-flex items-center h-5 px-1.5 rounded-md bg-[#0F1A30] text-white text-[10.5px] font-black tracking-wide">신규</span>;
// ⭐ 2026-11-05 노선 운행 ON/OFF 스위치(목록·등록폼) — OFF면 앞으로 배차를 만들지 않는다(이미 만든 배차는 그대로)
export function OnOffSwitch({ on, onChange, dark = false, disabled = false, title }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} disabled={disabled} title={title || (on ? "운행 중 — 누르면 OFF(앞으로 배차를 만들지 않음)" : "운행 OFF — 누르면 ON(배차를 다시 만듦)")}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange?.(!on); }} onDoubleClick={(e) => e.stopPropagation()}
      className={`relative shrink-0 inline-flex items-center h-7 w-[60px] rounded-full transition-colors disabled:opacity-50 ${on ? (dark ? "bg-[#8FB0F0]" : "bg-[#0F1A30]") : (dark ? "bg-white/20" : "bg-[#CBD5E3]")}`}>
      <span className={`absolute text-[10.5px] font-black tracking-wide ${on ? `left-2 ${dark ? "text-[#0B1428]" : "text-white"}` : "right-2 text-white"}`} style={{ fontFamily: MONO }}>{on ? "ON" : "OFF"}</span>
      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[36px]" : "left-1"}`} />
    </button>
  );
}
// ⭐ 2026-11-05 배차 여러 건을 만드는 동안 가운데 "등록 중" 창(반투명 배경) — 끝나면 닫힌다
function GenProgressModal({ p }) {
  if (!p) return null;
  const pct = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
  return createPortal(
    <div data-fr-progress="1" className="fixed inset-0 z-[2147483000] bg-[#0B1428]/55 backdrop-blur-[3px] flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-live="polite" className="w-full max-w-[420px] rounded-[22px] bg-white overflow-hidden shadow-[0_30px_80px_rgba(11,20,40,.45)]">
        <div className="px-6 py-4 text-white" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)" }}>
          <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>FIXED ROUTE · REGISTERING</div>
          <div className="text-[18px] font-black mt-0.5">배차 등록 중</div>
        </div>
        <div className="px-6 pt-5 pb-6">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 shrink-0 rounded-full border-[3px] border-[#DCE6F7] border-t-[#2D4C82] animate-spin" />
            <div className="min-w-0">
              <div className="text-[17px] font-black text-[#0F1A30] tabular-nums">{p.total ? `${p.done} / ${p.total}건 등록 중…` : "등록할 날짜를 확인하는 중…"}</div>
              <div className="text-[13px] font-semibold text-[#5B6B85]">새로 만든 배차 {p.made}건 · 이미 있는 날짜는 건너뜁니다</div>
            </div>
          </div>
          <div className="mt-4 h-2.5 rounded-full bg-[#EEF2F8] overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-[#2D4C82] to-[#8FB0F0] transition-all" style={{ width: `${pct}%` }} /></div>
          <div className="mt-2 text-[12.5px] font-bold text-[#9AA9C3]">창을 닫지 말고 잠시만 기다려 주세요</div>
        </div>
      </div>
    </div>, document.body);
}
// 🔎 배차관리처럼 — 입력하면 거래처관리에 등록된 거래처·상하차지가 바로 뜬다(↑↓ 이동 · Enter 선택 · Esc 닫기)
//  ⭐ 2026-11-02 목록을 화면 맨 위(portal)에 띄운다 — 정류지 카드·운임 상자 안에서 잘리거나 다음 칸에 가려지던 문제.
//   한글 입력 중(조합 중) Enter·방향키는 조합이 끝난 뒤의 목록으로 처리(마지막 글자가 빠진 채 골라지던 문제).
function Suggest({ value, onChange, onPick, items, k, sub, tag, placeholder, title = "거래처관리" }) {
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const [pos, setPos] = React.useState(null);
  const inRef = React.useRef(null);
  const listRef = React.useRef(null);
  const q = norm(value);
  const list = React.useMemo(() => items.filter((x) => !q || norm(x[k]).includes(q))
    .sort((a, b) => (norm(a[k]) === q ? 0 : norm(a[k]).startsWith(q) ? 1 : 2) - (norm(b[k]) === q ? 0 : norm(b[k]).startsWith(q) ? 1 : 2) || String(a[k] || "").localeCompare(String(b[k] || ""), "ko"))
    .slice(0, q ? 12 : 30), [items, k, q]);
  const live = React.useRef({ list, hi }); live.current = { list, hi };
  const show = open && list.length > 0;
  const place = React.useCallback(() => {
    const r = inRef.current?.getBoundingClientRect();
    if (!r) return;
    const vh = window.innerHeight; const below = vh - r.bottom - 8; const above = r.top - 8;
    const up = below < 220 && above > below;
    const w = Math.min(Math.max(r.width, 340), window.innerWidth - 16);
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), width: w, top: up ? undefined : r.bottom + 4, bottom: up ? vh - r.top + 4 : undefined, maxH: Math.max(160, Math.min(340, up ? above : below)) });
  }, []);
  React.useLayoutEffect(() => {
    if (!show) return undefined;
    place();
    window.addEventListener("scroll", place, true); window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [show, place]);
  React.useEffect(() => { if (hi >= list.length) setHi(Math.max(0, list.length - 1)); }, [list.length, hi]);
  React.useEffect(() => { if (show) listRef.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" }); }, [hi, show]);
  const pick = (x) => { if (!x) return; onPick(x); setOpen(false); };
  const onKey = (e) => {
    const key = e.key;
    if (key === "Escape") { if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); } return; }
    if (key === "Tab") { setOpen(false); return; }
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Enter") return;
    if (!open) { if (key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi(0); } return; }
    const composing = e.nativeEvent?.isComposing || e.keyCode === 229;
    if (!live.current.list.length && !composing) return;
    e.preventDefault();
    const run = () => {
      const { list: L, hi: H } = live.current;
      if (!L.length) return;
      if (key === "ArrowDown") setHi(Math.min(L.length - 1, H + 1));
      else if (key === "ArrowUp") setHi(Math.max(0, H - 1));
      else pick(L[Math.min(H, L.length - 1)]);
    };
    if (composing) setTimeout(run, 30); else run();
  };
  return (
    <div className="relative flex-1 min-w-0">
      <input ref={inRef} value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey} placeholder={placeholder} className={inp} autoComplete="off" role="combobox" aria-expanded={show} aria-autocomplete="list" />
      {show && pos && createPortal(
        <div data-fr-suggest="" onMouseDown={(e) => e.preventDefault()} className="fixed z-[2147483000] rounded-xl border border-[#1B2B4B]/25 bg-white shadow-[0_18px_44px_rgba(11,20,40,.28)] overflow-hidden flex flex-col"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}>
          <div className="shrink-0 flex items-center justify-between gap-2 px-3 h-8 bg-[#1B2B4B] text-white">
            <span className="text-[12px] font-black tracking-wide whitespace-nowrap">{title} · {list.length}{list.length >= (q ? 12 : 30) ? "+" : ""}건</span>
            <span className="min-w-0 truncate text-[11px] font-bold text-white/60 whitespace-nowrap">↑↓ 이동 · Enter 선택 · Esc 닫기</span>
          </div>
          <div ref={listRef} role="listbox" className="overflow-y-auto">
            {list.map((x, i) => {
              const on = i === hi; const t = tag ? tag(x) : "";
              return (
                <button key={x._key || x.id || x._id || `${x[k]}_${i}`} data-i={i} role="option" aria-selected={on} type="button" tabIndex={-1} onClick={() => pick(x)} onMouseEnter={() => setHi(i)}
                  className={`w-full text-left px-3.5 py-2 border-b last:border-0 ${on ? "bg-[#1B2B4B] border-[#1B2B4B]" : "bg-white border-[#EEF1F6] hover:bg-[#F3F6FB]"}`}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-[14px] font-black truncate ${on ? "text-white" : "text-[#0F1A30]"}`}>{x[k]}</span>
                    {t && <span className={`shrink-0 h-[18px] px-1.5 inline-flex items-center rounded text-[10.5px] font-black ${on ? "bg-white/15 text-white" : "bg-[#EEF3FC] text-[#2D4C82]"}`}>{t}</span>}
                  </div>
                  {sub(x) && <div className={`text-[13px] font-semibold truncate ${on ? "text-white/75" : "text-[#7A89A3]"}`}>{sub(x)}</div>}
                </button>
              );
            })}
          </div>
        </div>, document.body)}
    </div>
  );
}

// 🆕 거래처 신규등록 — 배차관리와 같은 항목
function NewClientModal({ data, setData, busy, onClose, onSave }) {
  const f = (k, label, ph, type) => (
    <label className="block"><span className={lab}>{label}</span>
      <input value={data[k]} type={type || "text"} onChange={(e) => setData((p) => ({ ...p, [k]: e.target.value }))} placeholder={ph} className={inp} autoFocus={k === "name"} />
    </label>
  );
  return (
    <div className="fixed inset-0 z-[99999] bg-[#0B1428]/55 flex items-center justify-center p-4">
      <div className="w-full max-w-[520px] rounded-[22px] bg-white overflow-hidden shadow-2xl">
        <div className="px-6 py-5 text-white flex items-center justify-between" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
          <div>
            <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>NEW CLIENT</div>
            <div className="text-[20px] font-black">거래처 신규등록</div>
          </div>
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-[13.5px] font-black">닫기</button>
        </div>
        <div className="p-6 space-y-3">
          {f("name", "업체명 *", "업체명 입력")}
          {f("addr", "주소", "주소 입력 (선택)")}
          <div className="grid grid-cols-2 gap-3">{f("manager", "담당자", "담당자명 (선택)")}{f("phone", "연락처", "010-0000-0000 (선택)")}</div>
          {f("email", "이메일", "example@email.com (선택)", "email")}
          <label className="block"><span className={lab}>등급</span>
            <CustomSelect value={data.grade} onChange={(e) => setData((p) => ({ ...p, grade: e.target.value }))} className={inp}>{["일반", "블랙", "주의", "이탈"].map((g) => <option key={g} value={g}>{g}</option>)}</CustomSelect>
          </label>
          {f("memo", "메모", "메모 (선택)")}
        </div>
        <div className="px-6 pb-6 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-12 rounded-xl border border-[#DCE3EE] text-[14.5px] font-bold text-[#5B6B85]">취소</button>
          <button type="button" onClick={onSave} disabled={busy} className="flex-[1.4] h-12 rounded-xl bg-[#0F1A30] text-white text-[14.5px] font-black disabled:opacity-50">등록 완료</button>
        </div>
      </div>
    </div>
  );
}
const blankStop = (type = "하차") => ({ type, name: "", addr: "", time: "", contact: "", memo: "", method: "", cargo: "", cargoType: "", tonVal: "", tonType: "", fareClient: "", fareDriver: "", payMethod: "", client: "", manager: "" });
export const VEHICLE_TYPES_FR = ["라보", "다마스", "오토바이", "윙바디", "탑", "카고", "윙/카고", "냉장윙", "냉동윙", "냉장탑", "냉동탑", "냉장/냉동탑", "냉장/냉동윙", "리프트"];
const cargoText = (s) => (s.cargo ? `${s.cargo}${s.cargoType || ""}` : "");
// ⭐ 2026-11-05 3파트처럼 — 단위 "없음"이면 적은 글자 그대로(예: 5톤·소형), 단위가 있으면 숫자+단위
const tonText = (s) => (s.tonVal ? `${s.tonVal}${s.tonType || ""}` : "");
// ⭐ 2026-11-01 정류지별 운임·지급방식 — 운임 모델을 하나로 정리
//  · "정류지별 운임" : 첫 정류지(상차)를 뺀 곳 중 한 곳이라도 청구·기사운임이 있으면. 노선 1회 운임 = 정류지 운임의 합계
//    (기본 청구·기사운임 칸은 잠기고 합계를 보여준다 · 저장할 때 fareMode:"stop", fareClient/fareDriver = 합계)
//  · "단일 운임"   : 정류지 운임이 하나도 없으면 기본 청구·기사운임 + 노선 지급방식(payMethod) 한 가지
//  · 정류지마다 지급방식(payMethod)을 고른다(운임이 있는 곳은 필수) — 정산·거래명세서가 오더의 지급방식으로 묶이므로
//    지급방식이 서로 다르면 배차를 "지급방식별로" 나눠 만든다(같은 차·같은 날, 대표 오더 + 분리 오더)
//  · ⭐ 2026-11-01 정류지마다 거래처(청구처, stops[i].client)도 — 비우면 노선 거래처. 착불 경유지는 다른 회사가 낼 수 있다
//    → 오더는 (거래처명, 지급방식) 묶음마다 한 건(거래처정산·거래명세서가 거래처명+지급방식으로 묶이므로)
//  · 예전 노선(fareMode 없음)에 기본 운임과 정류지 운임이 같이 있으면 예전처럼 "기본 + 정류지" 합계(대표 오더에 기본 운임)
const namedStops = (r) => (r.stops || []).filter((s) => s.name || s.addr);
const stopPaid = (s) => !!(toInt(s.fareClient) || toInt(s.fareDriver));
export const routeSegments = (r) => namedStops(r).map((s, i) => ({ s, i })).filter(({ s, i }) => i > 0 && stopPaid(s)).map(({ s, i }) => ({ name: s.name || s.addr, 구분: s.type, 청구: toInt(s.fareClient), 기사: toInt(s.fareDriver), 지급방식: s.payMethod || "", 거래처: String(s.client || "").trim(), 순번: i + 1, 운임구분: String(s.fareType || r.fareType || "").trim() }));
// 정류지 거래처(청구처) — 비우면 노선 거래처
export const routeClient = (r) => String(r.client || r.name || "").trim();
// 노선 거래처와 띄어쓰기·(주)만 다르면 같은 거래처로 본다
const payerOf = (r, g) => (g.거래처 && norm(g.거래처) !== norm(routeClient(r)) ? g.거래처 : routeClient(r));
export const routeTotals = (r) => {
  const seg = routeSegments(r);
  const perStop = seg.length > 0;
  // 예전 방식(기본 + 정류지) — 새로 저장하면 fareMode:"stop"이 되어 기본 운임은 쓰지 않는다
  const legacyClient = perStop && r.fareMode !== "stop" ? toInt(r.fareClient) : 0;
  const legacyDriver = perStop && r.fareMode !== "stop" ? toInt(r.fareDriver) : 0;
  const client = perStop ? legacyClient + seg.reduce((a, g) => a + g.청구, 0) : toInt(r.fareClient);
  const driver = perStop ? legacyDriver + seg.reduce((a, g) => a + g.기사, 0) : toInt(r.fareDriver);
  return { seg, client, driver, perStop, legacyClient, legacyDriver };
};
// (거래처명, 지급방식)별로 묶기 — 대표 그룹 = 마지막 운임 정류지(보통 하차지)가 속한 묶음
//  ⭐ 2026-11-01 거래처까지 — 묶음의 payer = 오더 거래처명, client/driver = 그 묶음 금액 합계
export const routePayGroups = (r) => {
  const { seg, perStop, client, driver, legacyClient, legacyDriver } = routeTotals(r);
  const fallback = r.payMethod || "계산서"; // 예전 노선(지급방식 없음)은 예전처럼 계산서
  if (!perStop) return [{ pay: fallback, payer: routeClient(r), segs: [], client, driver }];
  const map = new Map();
  const keyOf = (g) => `${payerOf(r, g)}\u0001${g.지급방식 || fallback}`;
  seg.forEach((g) => { const k = keyOf(g); if (!map.has(k)) map.set(k, []); map.get(k).push(g); });
  const mainKey = keyOf(seg[seg.length - 1]);
  const keys = [mainKey, ...[...map.keys()].filter((k) => k !== mainKey)];
  return keys.map((k, gi) => {
    const segs = map.get(k);
    const [payer, pay] = k.split("\u0001");
    return { pay, payer, segs, client: segs.reduce((a, g) => a + g.청구, 0) + (gi === 0 ? legacyClient : 0), driver: segs.reduce((a, g) => a + g.기사, 0) + (gi === 0 ? legacyDriver : 0) };
  });
};
const payKey = (p) => String(p || "").replace(/[\s/\\.#$[\]]/g, "_");
// 분리 오더 문서 번호 꼬리 — 노선 거래처면 예전처럼 지급방식만(이미 만든 분리 오더 번호 유지), 다른 거래처면 거래처까지
const groupSuffix = (r, G) => (G.payer === routeClient(r) ? payKey(G.pay) : `${payKey(G.pay)}_${payKey(G.payer).slice(0, 60)}`);
// 묶음 이름(화면 표시용) — 거래처가 노선 거래처와 다르면 거래처도 같이
export const groupLabel = (r, G) => (G.payer && G.payer !== routeClient(r) ? `${G.payer} ${G.pay}` : G.pay);
const blankRoute = () => ({ name: "", client: "", color: COLORS[2], stops: [blankStop("상차"), blankStop("하차")], days: ["월", "화", "수", "목", "금"], startTime: "", tonnage: "", vehicleType: "", dispatchType: "고정기사", fareClient: "", fareDriver: "", payMethod: "", driverKey: "", driverName: "", carNo: "", phone: "", startDate: kst(), endDate: "", skipDates: [], autoDispatch: true, autoAccept: true, active: true, memo: "" });

// ⭐ 2026-11-05 등록폼 새 구조 ↔ 저장 모양(생성기가 읽는 칸 그대로) 변환
//  화면(form)에만 있는 칸: _cargo(노선 기본 화물 1번만 입력) · _fareMode("route"=노선 전체 한 번에 / "seg"=구간별로 따로)
//                         stops[i]._more(담당자·연락처·메모 펼침) · stops[i]._payer(이 구간 청구처 다르게)
//  저장할 때(toRoute)
//   · 기본 화물 → 첫 정류지(상차지)의 cargo·cargoType·tonVal·tonType(생성기 mainCargo = 화물이 있는 첫 정류지) · 하차지 화물은 비운다
//     경유·거점(가운데 정류지) 화물 = 그 정류지 칸 그대로(오더 경유지 목록에 들어간다)
//   · "노선 전체" → fareClient·fareDriver·payMethod·fareType(단일 운임) + 정류지 운임 칸은 모두 비움(fareMode "base")
//   · "구간별"    → 구간(앞 정류지 → 이 정류지) 운임 = 도착 정류지 stops[i].fareClient·fareDriver·payMethod·fareType
//                   청구처 다르게를 켠 구간만 stops[i].client(끄면 비움 = 노선 거래처) · 저장 때 fareMode "stop", 기본 칸 = 합계
//  예전 노선 불러오기(toForm)
//   · 기본 화물 = 상차지 화물, 없으면 하차지 화물 · 정류지 운임이 있으면 "구간별"로 연다
//     (단, 상·하차 2곳뿐이고 하차지 한 곳만 운임·같은 거래처면 "노선 전체"로 합쳐서 연다 — 배차 결과는 같다)
const CARGO_KEYS = ["cargo", "cargoType", "tonVal", "tonType"];
const pickCargo = (s = {}) => Object.fromEntries(CARGO_KEYS.map((k) => [k, s[k] || ""]));
const STOP_FARE_BLANK = { fareClient: "", fareDriver: "", payMethod: "", client: "", fareType: "", fareManual: false };
const namedIdx = (stops) => stops.map((s, i) => (String(s.name || "").trim() || String(s.addr || "").trim() ? i : -1)).filter((i) => i >= 0);
const endsOf = (stops) => { const n = namedIdx(stops); return { first: n.length ? n[0] : 0, last: n.length ? n[n.length - 1] : stops.length - 1 }; };
export const toForm = (r) => {
  const f = { ...blankRoute(), ...r };
  const stops = (Array.isArray(f.stops) && f.stops.length ? f.stops : blankRoute().stops).map((s) => ({ ...blankStop(s?.type || "하차"), ...s }));
  const { first, last } = endsOf(stops);
  const src = [stops[first], stops[last]].find((s) => s && (s.cargo || s.tonVal)) || {};
  const rc = routeClient(f);
  const t = routeTotals({ ...f, stops });
  let mode = t.perStop ? "seg" : "route";
  if (mode === "seg" && namedIdx(stops).length <= 2 && t.seg.length === 1 && !t.legacyClient && !t.legacyDriver && payerOf(f, t.seg[0]) === rc) {
    const s = stops[last];
    Object.assign(f, { fareClient: String(t.seg[0].청구 || ""), fareDriver: String(t.seg[0].기사 || ""), payMethod: s.payMethod || f.payMethod || "", fareType: s.fareType || f.fareType || "", fareManual: !!s.fareManual, fareMode: "base" });
    stops[last] = { ...s, ...STOP_FARE_BLANK };
    mode = "route";
  }
  return {
    ...f, _cargo: pickCargo(src), _fareMode: mode,
    stops: stops.map((s) => ({ ...s, _more: !!(s.manager || s.contact || s.memo), _payer: !!(String(s.client || "").trim() && norm(s.client) !== norm(rc)) })),
  };
};
export const toRoute = (form) => {
  const { _cargo = {}, _fareMode = "route", ...rest } = form;
  const seg = _fareMode === "seg";
  const { first, last } = endsOf(rest.stops || []);
  const stops = (rest.stops || []).map((s, i) => {
    const { _more, _payer, ...x } = s; void _more;
    if (i === first) Object.assign(x, pickCargo(_cargo));
    else if (i === last) Object.assign(x, pickCargo({}));
    if (!seg || i <= first) Object.assign(x, STOP_FARE_BLANK);
    else if (!_payer) x.client = "";
    return x;
  });
  const out = { ...rest, stops };
  if (!seg) out.fareMode = "base";
  else if (rest.fareMode === "stop") Object.assign(out, { fareClient: "", fareDriver: "" }); // 저장 때 합계로 채운다
  return out;
};

// ─── 배차 자동 생성 — 오늘부터 N일 앞까지, 노선·날짜마다 한 건(문서 번호 고정이라 여러 명이 동시에 열어도 중복 없음) ───
// ⭐ 2026-11-01 지급방식이 서로 다른 정류지가 있으면 지급방식별로 나눠 여러 건 — [0]이 대표 오더(fr_노선_날짜, 전체 경로)
//  ⭐ 2026-11-01 거래처(청구처)가 다른 정류지도 — (거래처명, 지급방식) 묶음마다 한 건, 오더 거래처명 = 그 묶음 거래처
//    분리 오더 번호: 노선 거래처면 fr_노선_날짜_지급방식(예전 그대로), 다른 거래처면 fr_노선_날짜_지급방식_거래처
//  · 대표 오더: 전체 경로 + 대표 지급방식(보통 하차지) 정류지 운임만
//  · 분리 오더(fr_노선_날짜_지급방식): 상차지 + 그 지급방식 정류지만, 그 운임만 — 정산·거래명세서가 지급방식별로 정확히 잡힌다
export function routeOrdersFor(r, date) {
  const stops = namedStops(r);
  if (!stops.length) return [];
  const first = stops[0];
  const groups = routePayGroups(r);
  const { seg } = routeTotals(r);
  const split = groups.length > 1;
  const mainId = `fr_${r.id}_${date}`;
  const hasDriver = !!String(r.carNo || "").trim();
  const auto = hasDriver && r.autoAccept !== false;
  const payOfSeg = (g) => g.지급방식 || r.payMethod || "계산서";
  const segOf = new Map(); // 정류지 순번 → 지급방식
  const payerOfN = new Map(); // 정류지 순번 → 거래처명
  seg.forEach((g) => { segOf.set(g.순번, payOfSeg(g)); payerOfN.set(g.순번, payerOf(r, g)); });
  const fareRow = (g) => ({ 이름: g.name, 구분: g.구분, 거래처명: payerOf(r, g), 청구운임: g.청구, 기사운임: g.기사, 수수료: g.청구 - g.기사, 지급방식: payOfSeg(g), ...(g.운임구분 ? { 운임구분: g.운임구분 } : {}) });
  return groups.map((G, gi) => {
    const isMain = gi === 0;
    const inG = new Set(G.segs.map((g) => g.순번));
    // 이 오더가 지나는 정류지 — 대표는 전체, 분리 오더는 상차지 + 이 지급방식 정류지
    const own = isMain ? stops : [first, ...stops.filter((s, i) => i > 0 && inG.has(i + 1))];
    const last = own[own.length - 1];
    const mid = own.slice(1, -1);
    const wp = (s, dateKey, timeKey) => {
      const n = stops.indexOf(s) + 1;
      const pay = segOf.get(n);
      return {
        업체명: s.name || "", 주소: s.addr || "", 담당자: s.manager || "", 담당자번호: s.contact || "", 메모: s.memo || "",
        화물내용: cargoText(s), 화물타입: s.cargoType || "", 화물수량: s.cargo || "", 톤수값: s.tonVal || "", 톤수타입: s.tonType || "", 차량톤수: tonText(s),
        상차일: dateKey === "상차일" ? date : "", 상차시간: timeKey === "상차시간" ? korTime(s.time) : "", 하차일: dateKey === "하차일" ? date : "", 하차시간: timeKey === "하차시간" ? korTime(s.time) : "", 방법: s.method || "", // ⭐ 2026-11-05 정류지 상/하차방법
        구분: s.type,
        // 이 오더에서 받는 운임만 금액을 싣고, 다른 지급방식(분리 오더) 정류지는 표시만
        ...(pay && inG.has(n) ? { 청구운임: toInt(s.fareClient), 기사운임: toInt(s.fareDriver), 지급방식: pay, 거래처명: payerOfN.get(n) } : {}),
        ...(pay && !inG.has(n) ? { 지급방식: pay, 거래처명: payerOfN.get(n), 운임별도오더: `${payerOfN.get(n) !== routeClient(r) ? `${payerOfN.get(n)} ` : ""}${pay} 분리 오더` } : {}),
      };
    };
    const pickVia = mid.filter((s) => s.type === "상차").map((s) => wp(s, "상차일", "상차시간"));
    const dropVia = mid.filter((s) => s.type !== "상차").map((s) => wp(s, "하차일", "하차시간"));
    const mainCargo = own.find((s) => s.cargo) || {};
    const rows = G.segs.map(fareRow);
    // ⭐ 2026-11-02 운임규칙 — 오더 운임구분 = 이 묶음 정류지의 운임구분(모두 같을 때) · 아니면 노선 기본
    const ftList = [...new Set(G.segs.map((g) => g.운임구분).filter(Boolean))];
    const ft = ftList.length === 1 ? ftList[0] : (ftList.length ? "" : String(r.fareType || "").trim());
    const memoFare = seg.length
      ? `정류지별 운임 ${seg.length}곳${split ? ` · 거래처·지급방식별 ${groups.length}건 중 ${gi + 1}(${groupLabel(r, G)}${rows.length ? `: ${rows.map((x) => x.이름).join(", ")}` : ""})` : ""}`
      : "";
    return {
      _id: isMain ? mainId : `${mainId}_${groupSuffix(r, G)}`,
      등록일: kst(), 상차일: date, 하차일: date,
      상차시간: korTime(first.time || r.startTime), 하차시간: korTime(last.time),
      거래처명: G.payer || routeClient(r), // ⭐ 2026-11-01 그 묶음의 거래처(청구처)
      상차지명: first.name || "", 상차지주소: first.addr || "", 상차지담당자: first.manager || "", 상차지담당자번호: first.contact || "",
      하차지명: last.name || "", 하차지주소: last.addr || "", 하차지담당자: last.manager || "", 하차지담당자번호: last.contact || "",
      // 배차관리 등록폼과 같은 모양(목록 화면이 늘 배열이 있다고 본다)
      경유지_상차: pickVia, 경유상차목록: pickVia, 경유지_하차: dropVia, 경유하차목록: dropVia, 근무일자목록: [],
      차량톤수: r.tonnage || "", 톤수: r.tonnage || "", 차량종류: r.vehicleType || "",
      화물내용: cargoText(mainCargo), 화물타입: mainCargo.cargoType || "",
      상차방법: first.method || "", 하차방법: last.method || "", // ⭐ 2026-11-05 상차지·하차지 상/하차방법(배차관리 등록폼과 같은 칸)
      청구운임: G.client, 기사운임: G.driver, 수수료: String(G.client - G.driver),
      ...(ft ? { 운임구분: ft, 운임수동: false } : {}), // ⭐ 2026-11-02 운임규칙
      // 정류지별 금액 — 구간운임(기사앱이 읽는 예전 모양)과 정류지운임(이름·구분·청구·기사·수수료·지급방식)
      구간운임: G.segs.map((g) => ({ name: g.name, 구분: g.구분, 청구: g.청구, 기사: g.기사, 지급방식: payOfSeg(g), 거래처명: payerOf(r, g) })),
      정류지운임: rows,
      정류지별운임: seg.length, // 0이면 단일 운임 — 배차현황에서 "정류지별 운임" 표시에 쓴다
      정류지운임전체: split ? seg.map(fareRow) : [],
      지급방식분리: split ? { 순번: gi + 1, 전체: groups.length, 대표오더Id: mainId, 대표: isMain, 거래처명: G.payer, 지급방식: G.pay } : null,
      차량번호: r.carNo || "", 이름: r.driverName || "", 전화번호: r.phone || "",
      배차상태: hasDriver ? "배차완료" : "배차중",
      ...(hasDriver ? { 배차완료일시: Date.now(), 배차확정일시: serverTimestamp(), 배차확정자: "고정노선" } : {}),
      // 고정노선은 매번 수락할 필요 없이 바로 "수락" 상태로(노선에서 끌 수 있음)
      // ⭐ 2026-11-02 승인대기는 서버가 판단(기사앱에 가입한 지입 기사일 때만) — 여기서 무조건 걸면 앱 미가입·직영 차량이 승인대기로 멈췄다
      ...(auto ? { 기사확인상태: "수락", 기사확인일시: Date.now(), 자동수락: "고정노선" } : {}),
      배차방식: r.dispatchType || "고정기사", 지급방식: G.pay, // ⭐ 2026-11-05 배차방식 선택(비우면 예전처럼 고정기사) 운행유형: "편도", 혼적여부: "독차",
      메모: [`[고정노선] ${r.name || ""}`, memoFare, !isMain ? "같은 차량·같은 운행(대표 오더와 함께)" : "", r.memo || ""].filter(Boolean).join(" · "),
      고정노선Id: r.id, 고정노선명: r.name || "",
      ...(r.companyName ? { companyName: r.companyName } : {}), // ⭐ 2026-11-03 노선의 회사로 고정(최고관리자가 탭마다 다른 회사를 열어도 다른 회사로 안 새게)
      작성자: auth.currentUser?.email || "", 등록기기: "고정노선", createdAt: serverTimestamp(), _lastModified: Date.now(),
    };
  });
}
export const routeOrderFor = (r, date) => routeOrdersFor(r, date)[0] || null;

// ⭐ 2026-11-05 생성 범위(롤링) — 종료일이 없어도 끝없이 만들지 않는다
//  · 한 번에 만드는 범위 = 오늘 ~ "이번 달 말일"(단, 최소 오늘+7일 — 월말에 열어도 다음 주 배차는 미리 있게) · 종료일이 있으면 거기까지
//  · 다음 달 배차는 다음 달에 앱(PC·모바일)을 열거나 [배차 미리 만들기]를 누를 때 이어서 만든다(같은 날짜는 문서 번호가 같아 중복 없음)
//  · 노선마다 genThrough(어디까지 만들었는지)를 남겨, 앱을 열 때는 "오늘~7일(예전과 같은 점검)" + "genThrough 다음 날 ~ 이번 달 말"만 확인한다
export const GEN_MIN_AHEAD = 7;
export const ymdAdd = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monthEndOf = (ymd) => { const [y, m] = String(ymd).split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
export const genHorizon = (today = kst()) => { const a = monthEndOf(today); const b = ymdAdd(today, GEN_MIN_AHEAD); return a > b ? a : b; };
// 노선이 그 날 운행하는지(요일·시작일·종료일·쉬는 날)
export const routeRunsOn = (r, date) => !!r && (!r.startDate || date >= r.startDate) && (!r.endDate || date <= r.endDate) && !(r.skipDates || []).includes(date) && (r.days || []).includes(dayOf(date));
// from~to 사이 운행일 목록(최대 400일 — 안전장치)
export const routeDatesBetween = (r, from, to) => {
  const out = [];
  for (let d = from, n = 0; d <= to && n < 400; d = ymdAdd(d, 1), n += 1) if (routeRunsOn(r, d)) out.push(d);
  return out;
};
// 이번에 확인할 날짜 — full이면 from~끝 전부, 아니면 오늘~7일 + (genThrough 다음 날 ~ 끝)
const datesToCheck = (r, { from, full } = {}) => {
  const today = kst();
  const to = genHorizon(today);
  const start = from && from < today ? from : today;
  if (full || !r.genThrough || r.genThrough < ymdAdd(today, GEN_MIN_AHEAD)) return { to, dates: routeDatesBetween(r, start, to) };
  const near = routeDatesBetween(r, start, ymdAdd(today, GEN_MIN_AHEAD));
  const far = r.genThrough < to ? routeDatesBetween(r, ymdAdd(r.genThrough, 1), to) : [];
  return { to, dates: [...near, ...far.filter((d) => !near.includes(d))] };
};
const genLock = { at: 0 };
// 노선 하나·날짜 하나 — 만들 오더(대표 + 분리)를 확인하고 없으면 만든다. 반환: { made, checked, ok }
async function ensureRouteDate(r, date, tick) {
  const list = routeOrdersFor(r, date);
  let made = 0; let ok = true; let k = 0;
  for (; k < list.length; k++) {
    const o = list[k];
    const ref = doc(db, "orders", o._id);
    try {
      const ex = await getDoc(ref);
      if (!ex.exists()) {
        // ⭐ 2026-10-31 배차내역에서 지운 고정노선 오더는 다시 만들지 않는다(삭제 기록이 있으면) —
        //  예전엔 앱을 열 때마다 "없으면 만들기"라 지워도 다시 생겼다. 그 날짜는 노선의 쉬는 날로 남겨 고정노선 화면에도 보이게.
        //  ⭐ 2026-11-01 대표 오더를 지우면 그날 전체를 쉬고, 지급방식 분리 오더만 지웠으면 그 건만 다시 만들지 않는다
        const del = await getDoc(doc(db, "deletedOrders", `orders_${o._id}`)).catch(() => null);
        if (del?.exists()) {
          if (k > 0) { tick(0); continue; }
          if (!(r.skipDates || []).includes(date)) {
            await updateDoc(doc(db, "fixedRoutes", r.id), { skipDates: arrayUnion(date) }).catch(() => {});
            r.skipDates = [...(r.skipDates || []), date];
          }
          break;
        }
        await setDoc(ref, o);
        made += 1; tick(1);
        continue;
      }
      // 자동 수락 노선인데 서버가 "승인대기"로 바꿔 둔 예전 오더는 바로잡는다
      const d = ex.data() || {};
      if (o.기사확인상태 === "수락" && d.기사확인상태 === "대기" && d.차량번호 === o.차량번호 && d.배차상태 !== "배차취소") {
        await updateDoc(ref, { 기사확인상태: "수락", 기사확인일시: Date.now(), 자동수락: "고정노선", 배차상태: "배차완료", 상태: "배차완료" }).catch(() => {});
      }
      tick(0);
    } catch { ok = false; tick(0); /* 권한·오프라인 — 다음에 다시 */ }
  }
  for (; k < list.length; k++) tick(0); // 대표 오더가 지워져 그날을 쉬면 남은 분리 오더도 "확인 끝"으로
  return { made, ok };
}
// ⭐ 2026-11-05 opts: { force(1분 제한 무시), full(범위 전체 다시 확인), from(지난 날짜부터 — 새 노선 저장 때만), onProgress({ done, total, made }) }
//  예전 호출(routes, 7)도 그대로 동작한다. 꺼진 노선(active:false)·자동 등록 끈 노선은 만들지 않는다.
export async function ensureFixedRouteOrders(routes, opts = {}) {
  const o = typeof opts === "object" && opts ? opts : {};
  if (!o.force && Date.now() - genLock.at < 60000) return 0; // 1분에 한 번만
  genLock.at = Date.now();
  const jobs = [];
  const plans = [];
  for (const r of routes || []) {
    if (!r?.id || r.active === false || !r.active || !r.autoDispatch || !(r.days || []).length) continue;
    const { to, dates } = datesToCheck(r, o);
    plans.push({ r, to, ok: true });
    dates.forEach((date) => jobs.push({ plan: plans[plans.length - 1], date, n: routeOrdersFor(r, date).length }));
  }
  const total = jobs.reduce((a, j) => a + j.n, 0);
  let done = 0; let made = 0;
  const report = () => { try { o.onProgress?.({ done, total, made }); } catch { /* 화면 */ } };
  report();
  const tick = (m) => { done += 1; made += m; report(); };
  // 같은 노선의 날짜는 서로 상관없어 4개씩 동시에(21건 기준 몇 초 안에)
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      const res = await ensureRouteDate(j.plan.r, j.date, tick);
      if (!res.ok) j.plan.ok = false;
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
  // 어디까지 만들었는지 기록 — 다음에 앱을 열면 그 뒤만 확인(실패한 날이 있으면 기록하지 않고 다음에 다시)
  await Promise.all(plans.filter((p) => p.ok && (!p.r.genThrough || p.r.genThrough < p.to)).map((p) =>
    updateDoc(doc(db, "fixedRoutes", p.r.id), { genThrough: p.to }).then(() => { p.r.genThrough = p.to; }).catch(() => {})));
  return made;
}
// 🛣 배차현황에서 고정노선 오더를 고칠 때 안내 — 이 날짜 오더만 바뀌고, 앞으로 계속은 고정노선에서
export function FixedRouteEditNotice({ order, className = "" }) {
  if (!order?.고정노선Id) return null;
  return (
    <div className={`rounded-xl border border-[#C9D6EE] bg-[#EEF3FC] px-3.5 py-2.5 text-[13px] text-[#1B2B4B] leading-relaxed ${className}`}>
      <b className="font-black">▸ 고정노선 오더입니다{order.고정노선명 ? ` · ${order.고정노선명}` : ""}</b>
      <div className="text-[12.5px] text-[#3A4A66]">여기서 고치면 <b>이 날짜({order.상차일 || "-"}) 오더만</b> 바뀝니다. 앞으로 계속 바꾸려면 <b>지입차관리 › 고정노선</b>에서 노선을 수정하세요.</div>
    </div>
  );
}

// 노선이 바뀌었을 때 — 오늘 이후 아직 운행 전이고, 배차현황에서 따로 고치지 않은(예전 노선으로 만든 값 그대로인) 오더만 새 노선 값으로
// ⭐ 2026-11-01 지급방식도 비교·반영 · 정류지운임(정류지별 금액·지급방식)도 함께 · 지급방식 분리 오더도 하나하나
const ROUTE_KEYS = ["상차지명", "상차지주소", "하차지명", "하차지주소", "상차시간", "하차시간", "청구운임", "기사운임", "지급방식", "차량번호", "차량톤수", "차량종류", "화물내용", "거래처명"];
const ROUTE_WRITE = [...ROUTE_KEYS, "상차지담당자번호", "하차지담당자번호", "경유지_상차", "경유상차목록", "경유지_하차", "경유하차목록", "톤수", "화물타입", "수수료", "구간운임", "정류지운임", "정류지별운임", "정류지운임전체", "지급방식분리", "이름", "전화번호", "메모", "고정노선명", "운임구분", "운임수동", "상차방법", "하차방법", "배차방식"]; // ⭐ 2026-11-05 상/하차방법·배차방식
const started = (d) => d.배차상태 === "배차취소" || d.상차완료 || d.상차완료일시 || d.상차지도착일시 || d.하차완료 || d.운송완료;
// ⭐ 2026-11-05 반영 범위 = 예전 노선이 미리 만들어 둔 곳까지(genThrough · 이번 달 말일) — 예전엔 7일까지만 고쳐 그 뒤 배차는 예전 값으로 남았다
//  · 새 노선에서 운행하지 않게 된 날(요일·종료일·쉬는 날을 바꿈)의 배차는 "운행 전 + 배차현황에서 손대지 않은 것"만 지운다
//    (운행 ON/OFF는 앞으로 만들기만 멈추고, 이미 만든 배차는 지우지 않는다)
export async function syncFutureRouteOrders(oldR, newR) {
  let n = 0;
  const today = kst();
  const end = [genHorizon(today), String(oldR?.genThrough || "")].sort().pop();
  for (let date = today, c = 0; date <= end && c < 400; date = ymdAdd(date, 1), c += 1) {
    if (!routeRunsOn(oldR, date)) continue; // 예전 노선이 만들지 않은 날
    const befores = routeOrdersFor(oldR, date);
    const afters = routeRunsOn(newR, date) ? routeOrdersFor(newR, date) : [];
    const untouchedBy = (d, before) => !!before && ROUTE_KEYS.every((k) => String(d[k] ?? "") === String(before[k] ?? ""));
    for (const after of afters) {
      const ref = doc(db, "orders", after._id);
      try {
        const ex = await getDoc(ref);
        if (!ex.exists()) continue; // 새로 생긴 분리 오더는 ensureFixedRouteOrders가 만든다
        const d = ex.data() || {};
        if (started(d)) continue; // 이미 운행 중·끝남
        if (!untouchedBy(d, befores.find((b) => b._id === after._id))) continue; // 배차현황에서 그날만 따로 바꾼 오더는 그대로 둔다
        const patch = {};
        ROUTE_WRITE.forEach((k) => { if (after[k] !== undefined) patch[k] = after[k]; });
        if (String(after.차량번호 || "") !== String(d.차량번호 || "")) Object.assign(patch, { 배차상태: after.배차상태, 기사확인상태: after.기사확인상태 || "", ...(after.자동수락 ? { 자동수락: after.자동수락 } : {}) });
        patch._lastModified = Date.now();
        await updateDoc(ref, patch);
        n += 1;
      } catch { /* 다음에 */ }
    }
    // 지급방식을 하나로 합쳤거나 바꿔서 더는 안 만드는 분리 오더 — 손대지 않은(운행 전) 것만 지운다(금액이 대표 오더로 옮겨 갔으므로 이중 정산 방지)
    for (const before of befores) {
      if (afters.some((a) => a._id === before._id)) continue;
      const ref = doc(db, "orders", before._id);
      try {
        const ex = await getDoc(ref);
        if (!ex.exists()) continue;
        const d = ex.data() || {};
        if (started(d) || !untouchedBy(d, before)) continue;
        await deleteDoc(ref);
        n += 1;
      } catch { /* 다음에 */ }
    }
  }
  return n;
}

// 앱 어디서든(배차관리 첫 로딩 뒤) 우리 회사 노선의 배차를 미리 만들어 둔다
export function useFixedRouteAutoDispatch(company) {
  React.useEffect(() => {
    if (!company) return undefined;
    // ⭐ 2026-11-05 앱을 켜 둔 채 날짜(달)가 바뀌어도 이어서 채운다 — 처음 한 번 + 1시간마다 "오늘 날짜가 바뀌었으면" 한 번
    let ranOn = ""; let latest = null;
    const run = () => {
      if (!latest || ranOn === kst()) return;
      ranOn = kst();
      ensureFixedRouteOrders(latest, { force: true }).catch(() => {});
    };
    const unsub = onSnapshot(query(collection(db, "fixedRoutes"), where("companyName", "==", company)), (s) => {
      latest = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      run();
    }, () => {});
    const t = setInterval(run, 3600e3);
    return () => { unsub(); clearInterval(t); };
  }, [company]);
}

// ⭐ 2026-11-01 저장 전 운임 확인 — 지급방식이 빠진 칸(정류지 index / "route"=단일 운임 지급방식)과 예전 기본 운임이 남아 있는지
const fareProblems = (f) => {
  const named = (f.stops || []).map((s, i) => ({ s, i })).filter(({ s }) => String(s.name || "").trim() || String(s.addr || "").trim());
  const perStop = named.some(({ s }, k) => k > 0 && stopPaid(s));
  const miss = [];
  if (perStop) named.forEach(({ s, i }, k) => { if (k > 0 && stopPaid(s) && !s.payMethod) miss.push(i); });
  else if ((toInt(f.fareClient) || toInt(f.fareDriver)) && !f.payMethod) miss.push("route");
  const legacy = perStop && f.fareMode !== "stop" && !!(toInt(f.fareClient) || toInt(f.fareDriver));
  return { miss, legacy, perStop };
};
// 지급방식 고르기 — 회사별 목록(편집모드에서 바꾼 목록) · 빠지면 빨간 테두리 + 안내
function PaySelect({ id, value, onChange, options, error, compact = false }) {
  // ⭐ 2026-11-02 회사 공용 지급방식 선택기(＋ 지급방식 추가) — 목록은 편집모드와 같은 회사 목록(options는 예전 호환용)
  void options;
  return (
    <div id={id} className="min-w-0">
      <CompanyOptionPicker optKey="지급방식" value={value || ""} onChange={(v) => onChange(v)} placeholder="지급방식 선택 *" noneLabel="선택 안 함"
        className={`${inp} ${compact ? "!h-10 !text-[13px]" : ""} ${error ? "!border-[#E5484D] !ring-2 !ring-[#E5484D]/20 !bg-[#FFF6F6] !text-[#C4262C]" : value ? "" : "!text-[#9AA9C3]"}`} />
      {error && <div className="mt-1 text-[12px] font-black text-[#D93036]">지급방식을 골라 주세요</div>}
    </div>
  );
}
// 정류지별 운임 표 — 편집 화면 STEP 03 · 목록 상세 · 확인 화면에서 같이 쓴다
function FareTable({ r, dark = false }) {
  const { seg, client, driver, legacyClient, legacyDriver } = routeTotals(r);
  const groups = routePayGroups(r);
  if (!seg.length) return null;
  const pay = (g) => g.지급방식 || r.payMethod || "";
  const rc = routeClient(r);
  const sub = dark ? "text-white/55" : "text-[#7A89A3]";
  const line = dark ? "border-white/10" : "border-[#EEF1F6]";
  const strong = dark ? "text-white" : "text-[#0F1A30]";
  return (
    <div className={`rounded-xl overflow-hidden border ${dark ? "border-white/15 bg-white/[0.05]" : "border-[#E3E8F0] bg-white"}`}>
      <div className={`grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-2 px-3 py-2 text-[11px] font-extrabold tracking-[0.12em] ${dark ? "bg-white/[0.06] text-[#8FB0F0]" : "bg-[#F5F8FD] text-[#2D4C82]"}`} style={{ fontFamily: MONO }}>
        <span>STOP</span><span>지급</span><span className="text-right">청구</span><span className="text-right">기사</span><span className="text-right">수수료</span>
      </div>
      {seg.map((g, i) => (
        <div key={i} className={`grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-2 px-3 py-2 border-t ${line} text-[12.5px] items-center`}>
          <span className={`truncate font-black ${strong}`} title={g.name}><span className={`text-[10.5px] font-extrabold mr-1 ${dark ? "text-[#8FB0F0]" : "text-[#4B6CB7]"}`}>{String(g.순번).padStart(2, "0")} {g.구분}</span>{g.name}
            <span className={`block truncate text-[11px] font-bold ${payerOf(r, g) !== rc ? (dark ? "text-[#FFD48A]" : "text-[#9A5B00]") : sub}`} title="거래처(청구처)">{payerOf(r, g) || "거래처 미입력"}{payerOf(r, g) !== rc ? " · 다른 거래처" : ""}</span></span>
          <span>{pay(g) ? <span className={`inline-flex h-6 px-2 items-center rounded-md text-[11.5px] font-black ${dark ? "bg-white/15 text-white" : "bg-[#0F1A30] text-white"}`}>{pay(g)}</span> : <span className="text-[11.5px] font-black text-[#E5484D]">미선택</span>}</span>
          <span className={`text-right tabular-nums font-bold ${strong}`} style={{ fontFamily: MONO }}>{won(g.청구)}</span>
          <span className={`text-right tabular-nums font-bold ${strong}`} style={{ fontFamily: MONO }}>{won(g.기사)}</span>
          <span className={`text-right tabular-nums font-bold ${sub}`} style={{ fontFamily: MONO }}>{won(g.청구 - g.기사)}</span>
        </div>
      ))}
      {(legacyClient || legacyDriver) ? (
        <div className={`grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-2 px-3 py-2 border-t ${line} text-[12.5px]`}>
          <span className={`font-black ${sub}`}>예전 기본 운임</span><span />
          <span className={`text-right tabular-nums ${sub}`} style={{ fontFamily: MONO }}>{won(legacyClient)}</span>
          <span className={`text-right tabular-nums ${sub}`} style={{ fontFamily: MONO }}>{won(legacyDriver)}</span>
          <span className={`text-right tabular-nums ${sub}`} style={{ fontFamily: MONO }}>{won(legacyClient - legacyDriver)}</span>
        </div>
      ) : null}
      <div className={`grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-2 px-3 py-2.5 border-t-2 ${dark ? "border-white/20" : "border-[#0F1A30]/80"} text-[13px] font-black ${strong}`}>
        <span>1회 합계</span><span />
        <span className="text-right tabular-nums" style={{ fontFamily: MONO }}>{won(client)}</span>
        <span className="text-right tabular-nums" style={{ fontFamily: MONO }}>{won(driver)}</span>
        <span className="text-right tabular-nums" style={{ fontFamily: MONO }}>{won(client - driver)}</span>
      </div>
      {groups.length > 1 && (
        <div className={`px-3 py-2.5 border-t ${line} text-[12px] leading-relaxed ${dark ? "text-white/75" : "text-[#3A4A66]"}`}>
          <b className={strong}>거래처·지급방식이 달라 배차가 {groups.length}건으로 나뉘어 만들어집니다</b> — {groups.map((G) => `${G.payer || "-"} ${G.pay} ${won(G.client)}원`).join(" / ")} · 같은 차량·같은 날 운행, 거래처정산·거래명세서에서 거래처·지급방식별로 따로 잡힙니다
        </div>
      )}
    </div>
  );
}
// 목록·현황 배지 — "정류지별 운임 N곳" (마우스를 올리면 정류지별 금액·지급방식)
const fareTip = (r) => { const { seg, client, driver } = routeTotals(r); return [...seg.map((g) => `${g.구분} ${g.name} · ${payerOf(r, g) || "거래처 미입력"} · ${g.지급방식 || r.payMethod || "지급방식 미선택"} · 청구 ${won(g.청구)} / 기사 ${won(g.기사)}`), `1회 합계 청구 ${won(client)} / 기사 ${won(driver)}`].join("\n"); };
function StopFareBadge({ r, on = false }) {
  const { seg } = routeTotals(r);
  if (!seg.length) return null;
  const split = routePayGroups(r).length > 1;
  return (
    <span title={fareTip(r)} className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-[10.5px] font-black whitespace-nowrap ${on ? "bg-[#8FB0F0] text-[#0B1428]" : "bg-[#EEF3FC] text-[#1B2B4B] border border-[#C9D6EE]"}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />정류지별 운임 {seg.length}곳{split ? ` · 분리 ${routePayGroups(r).length}건` : ""}{seg.some((g) => payerOf(r, g) !== routeClient(r)) ? " · 다른 거래처" : ""}
    </span>
  );
}

export default function FixedRoutes({ drivers = [], companyName = "", dispatchData = [] }) {
  // ⭐ 2026-11-02 지금 보고 있는 회사(getTenant) 우선 — 통합관리자가 다른 회사를 볼 때·회원 문서에 회사명이 없는 예전 계정(기본 회사)에서
  //  회사가 비거나 달라서 거래처·상하차지·노선 목록이 통째로 비던 문제(자동완성이 안 뜨던 원인)
  const co = String(getTenant() || companyName || "").trim();
  const fareR = useFareRules(co); // ⭐ 2026-11-02 운임규칙
  const [routes, setRoutes] = React.useState([]);
  const [selId, setSelId] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [clients, setClients] = React.useState([]);
  const [places, setPlaces] = React.useState([]);
  const [newClient, setNewClient] = React.useState(null);
  const cargoTypes = useCompanyDropdownOptions("화물타입", "", co);
  const tonTypes = useCompanyDropdownOptions("톤수타입", "", co);
  const payTypes = useCompanyDropdownOptions("지급방식", "", co);
  // ⭐ 2026-11-01 저장을 한 번 눌러 본 뒤부터 빠진 지급방식 칸을 빨갛게
  const [tried, setTried] = React.useState(false);
  React.useEffect(() => { if (!form) setTried(false); }, [form]);
  React.useEffect(() => {
    if (!co) return undefined;
    // ⭐ 2026-11-02 거래처관리(배차관리)와 같은 기준 — 회사명 없는 예전 문서 = 기본 회사, 이름 칸이 다른 문서(업체명·name·상호·회사명)도 목록에
    const mine = (x) => (String(x.companyName || "").trim() || DEFAULT_COMPANY) === co;
    const nameOf = (x) => String(x.거래처명 || x.업체명 || x.name || x.상호 || x.회사명 || x.title || "").trim();
    const u1 = onSnapshot(collection(db, "clients"), (s) => setClients(s.docs.map((d) => {
      const c = { id: d.id, ...d.data() }; return { ...c, 거래처명: nameOf(c) }; }).filter((c) => mine(c) && c.거래처명)), (e) => { console.warn("[고정노선] 거래처 목록을 못 읽었습니다", e?.code || e); setClients([]); });
    const u2 = onSnapshot(collection(db, "places"), (s) => setPlaces(s.docs.map((d) => { const p = { _id: d.id, ...d.data() }; return { ...p, 업체명: String(p.업체명 || p.name || p.상호 || "").trim() }; })
      .filter((p) => mine(p) && p.업체명)), (e) => { console.warn("[고정노선] 상하차지 목록을 못 읽었습니다", e?.code || e); setPlaces([]); });
    return () => { u1(); u2(); };
  }, [co]);
  // ⭐ 2026-11-02 상·하차지·경유·거점 검색 목록 = 배차관리와 같은 통합 목록(기본거래처 먼저 + 기본거래처에 없는 하차지거래처)
  //  하차지 칸에서 기본거래처로만 등록된 곳이 안 뜨던 문제. 고르면 이름·주소·담당자·연락처가 같이 채워진다.
  const placePool = React.useMemo(() => {
    const out = []; const seen = new Set();
    const prim = (cs) => (Array.isArray(cs) ? (cs.find((c) => c?.isPrimary) || cs[0]) : null);
    clients.forEach((c) => {
      const n = norm(c.거래처명); if (!n) return;
      const pc = prim(c.contacts);
      out.push({ _key: `c_${c.id}`, _src: "기본", 업체명: c.거래처명, 주소: c.주소 || "", 담당자: c.담당자 || pc?.name || "", 담당자번호: c.연락처 || c.담당자번호 || pc?.phone || "", 메모: c.메모 || "" });
      seen.add(n);
    });
    places.forEach((p) => {
      const n = norm(p.업체명); if (!n || seen.has(n)) return;
      const pc = prim(p.contacts);
      out.push({ _key: `p_${p._id}`, _src: "하차지", 업체명: p.업체명, 주소: p.주소 || "", 담당자: p.담당자 || pc?.name || "", 담당자번호: p.담당자번호 || pc?.phone || "", 메모: p.메모 || "" });
    });
    return out;
  }, [clients, places]);
  const knownPlace = (name) => { const n = norm(name); return !!n && placePool.some((x) => norm(x.업체명) === n); };
  const knownClient = (name) => { const n = norm(name); return !!n && clients.some((c) => norm(c.거래처명 || c.id) === n); };
  const placeSub = (x) => [x.주소, [x.담당자, x.담당자번호].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  const clientSub = (c) => [c.주소, [c.담당자, c.연락처].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(query(collection(db, "fixedRoutes"), where("companyName", "==", co)), (s) => setRoutes(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))), () => setRoutes([]));
  }, [co]);
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2600); };
  const sel = routes.find((r) => r.id === selId) || null;
  const today = kst(); const todayDay = dayOf(today);
  const todayRuns = routes.filter((r) => r.active && (r.days || []).includes(todayDay) && !(r.skipDates || []).includes(today));
  const shown = routes.filter((r) => !q.trim() || `${r.name}${r.client}${r.driverName}${r.carNo}`.includes(q.trim()));
  // ⭐ 2026-11-02 운임규칙 — 운임구분이 정해진 노선·정류지는 청구운임을 넣으면 기사운임을 규칙대로(기사운임을 직접 고치면 유지)
  const set = (k, v) => setForm((p) => {
    if (!fareR.on || !["fareClient", "fareDriver", "fareType"].includes(k)) return { ...p, [k]: v };
    const n = { ...p, [k]: v };
    const calcOf = (sale, ft) => { const rule = findFareRule(fareR.rules, ft); return rule && String(sale || "") !== "" ? String(applyFareRule(rule, sale).기사운임) : null; };
    if (k === "fareDriver") { const c = calcOf(n.fareClient, n.fareType); n.fareManual = c != null && String(toInt(v)) !== c; return n; }
    if (k === "fareType") n.fareManual = false;
    if (!n.fareManual) { const c = calcOf(n.fareClient, n.fareType); if (c != null) n.fareDriver = c; }
    if (k === "fareType") n.stops = (n.stops || []).map((s, i) => { if (i === 0 || s.fareType || s.fareManual) return s; const c = calcOf(s.fareClient, v); return c != null ? { ...s, fareDriver: c } : s; });
    return n;
  });
  const setStop = (i, patch) => setForm((p) => ({ ...p, stops: p.stops.map((s, j) => {
    if (j !== i) return s;
    const n = { ...s, ...patch };
    if (fareR.on && ("fareClient" in patch || "fareDriver" in patch || "fareType" in patch)) {
      const rule = findFareRule(fareR.rules, n.fareType || p.fareType);
      const c = rule && String(n.fareClient || "") !== "" ? String(applyFareRule(rule, n.fareClient).기사운임) : null;
      if ("fareDriver" in patch) n.fareManual = c != null && String(toInt(patch.fareDriver)) !== c;
      else { if ("fareType" in patch) n.fareManual = false; if (!n.fareManual && c != null) n.fareDriver = c; }
    }
    return n;
  }) }));
  const moveStop = (i, d) => setForm((p) => { const a = [...p.stops]; const j = i + d; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return { ...p, stops: a }; });
  const pickDriver = (key) => { const d = drivers.find((x) => x.id === key); setForm((p) => ({ ...p, driverKey: key, driverName: d?.이름 || "", carNo: d?.차량번호 && d.차량번호 !== "-" ? d.차량번호 : "", phone: d?.전화번호 && d.전화번호 !== "-" ? d.전화번호 : "", tonnage: d?.차량톤수 || p.tonnage || "", vehicleType: d?.차량종류 || p.vehicleType || "" })); };
  const [review, setReview] = React.useState(false);
  const askSave = () => {
    if (!form.name.trim()) return kpAlert("노선 이름을 입력해 주세요.");
    if (!(form.stops || []).some((s) => s.name.trim() || s.addr.trim())) return kpAlert("정류지를 한 곳 이상 입력해 주세요.");
    // ⭐ 2026-11-01 지급방식은 필수 — 빠진 칸을 빨갛게 표시하고 첫 칸으로 이동
    const fp = fareProblems(toRoute(form)); // ⭐ 2026-11-05 저장될 모양(운임 방식 반영)으로 확인
    if (fp.miss.length || fp.legacy) {
      setTried(true);
      const names = fp.miss.map((i) => (i === "route" ? "기본 운임" : `${String(i + 1).padStart(2, "0")} ${form.stops[i]?.name || form.stops[i]?.type || ""}`));
      setTimeout(() => document.getElementById(fp.miss.length ? `fr-pay-${fp.miss[0]}` : "fr-legacy")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return kpAlert([fp.miss.length ? `지급방식을 골라 주세요.\n빠진 곳: ${names.join(", ")}` : "", fp.legacy ? "기본 운임과 구간별 운임이 같이 들어 있습니다.\n운임 칸에서 [하차지 운임에 합치기] 또는 [기본 운임 지우기]를 눌러 주세요." : ""].filter(Boolean).join("\n\n"));
    }
    setReview(true);
  };
  // 예전 기본 운임 정리 — 마지막 운임 정류지에 더하거나, 지운다(정류지별 운임으로 하나로)
  const resolveLegacy = (merge) => setForm((p) => {
    const named = p.stops.map((s, i) => ({ s, i })).filter(({ s }) => String(s.name || "").trim() || String(s.addr || "").trim());
    const lastPaid = [...named].reverse().find(({ s }, k) => named.length - 1 - k > 0 && stopPaid(s));
    const stops = merge && lastPaid ? p.stops.map((s, i) => (i === lastPaid.i ? { ...s, fareClient: String(toInt(s.fareClient) + toInt(p.fareClient)), fareDriver: String(toInt(s.fareDriver) + toInt(p.fareDriver)) } : s)) : p.stops;
    return { ...p, stops, fareMode: "stop", fareClient: "", fareDriver: "" };
  });
  const save = async () => {
    setBusy(true);
    try {
      // ⭐ 2026-11-05 화면 모양(기본 화물·운임 방식) → 저장 모양(생성기가 읽는 정류지 칸) — toRoute
      const R = toRoute(form);
      const data = { ...R, companyName: co, stops: R.stops.filter((s) => s.name.trim() || s.addr.trim()), updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "" };
      delete data.id;
      // ⭐ 2026-11-01 정류지별 운임이면 기본 운임 칸 = 정류지 합계(목록·다른 화면이 fareClient를 읽어도 같은 값)
      const tt = routeTotals(data);
      if (tt.perStop) Object.assign(data, { fareMode: "stop", fareClient: String(tt.client), fareDriver: String(tt.driver) });
      else data.fareMode = "base";
      let id = form.id;
      if (id) await updateDoc(doc(db, "fixedRoutes", id), data);
      else { const ref = await addDoc(collection(db, "fixedRoutes"), { ...data, createdAt: serverTimestamp() }); id = ref.id; }
      // 신규 상하차지·거래처는 거래처관리에도 등록(배차관리 자동완성에 바로 뜨도록) — 배차관리 오더 저장과 같은 방식
      //  · 상·하차지·경유·거점: 기본거래처·하차지거래처 어디에도 없는 이름만 하차지거래처(places)로 (같은 이름은 한 번만)
      //  · 노선·정류지 거래처(청구처): 기본거래처(clients)에 없는 이름만 기본거래처로
      //  문서 이름은 배차관리와 같은 회사별 키(coDocKey(회사, 정규화한 이름)) → 다시 저장해도 중복이 생기지 않는다
      const seenP = new Set(); const seenC = new Set();
      const newPlaces = data.stops.filter((st) => { const n = norm(st.name); if (!n || seenP.has(n) || knownPlace(st.name)) return false; seenP.add(n); return true; });
      const newClients = [data.client, ...data.stops.map((st) => st.client)].map((v) => String(v || "").trim()).filter((v) => { const n = norm(v); if (!n || seenC.has(n) || knownClient(v)) return false; seenC.add(n); return true; });
      await Promise.all([
        ...newPlaces.map((st) => {
          const nm = st.name.trim(); const ph = String(st.contact || "").trim(); const mg = String(st.manager || "").trim();
          return setDoc(doc(db, "places", coDocKey(co, placeKey(nm) || `fr_${Date.now()}`)), {
            업체명: nm, 주소: String(st.addr || "").trim(), 담당자: mg, 담당자번호: ph,
            contacts: ph || mg ? [{ name: mg, phone: ph, isPrimary: true }] : [],
            메모: st.memo || "", 등급: "일반", 팝업표시: true, isActive: true, companyName: co, updatedAt: serverTimestamp(),
          }, { merge: true }).catch(() => {});
        }),
        ...newClients.map((nm) => setDoc(doc(db, "clients", coDocKey(co, nm)), { id: coDocKey(co, nm), 거래처명: nm, 등급: "일반", companyName: co }, { merge: true }).catch(() => {})),
      ]);
      setForm(null); setReview(false); setSelId(id);
      // ⭐ 노선을 고치면 이미 만들어 둔 앞으로의 오더 중 "배차현황에서 따로 고치지 않은 것"에 같이 반영
      const prev = form.id ? routes.find((x) => x.id === form.id) : null;
      const synced = prev ? await syncFutureRouteOrders(prev, { ...data, id }) : 0;
      // ⭐ 2026-11-05 새 노선의 시작일이 이미 지났으면(예: 11/2 시작을 11/5에 등록) 지난 운행일도 만들지 물어본다(최대 31일 전까지)
      let from = "";
      const today = kst();
      if (!form.id && data.active !== false && data.autoDispatch && data.startDate && data.startDate < today) {
        const f0 = [data.startDate, ymdAdd(today, -31)].sort().pop();
        const past = routeDatesBetween(data, f0, ymdAdd(today, -1));
        if (past.length && await kpConfirm(`시작일(${data.startDate})이 이미 지났습니다.\n지난 운행일 ${past.length}일(${past[0].slice(5)} ~ ${past[past.length - 1].slice(5)})의 배차도 함께 등록할까요?\n취소를 누르면 오늘부터 만듭니다.`, { title: "지난 날짜 배차", okText: "함께 등록", cancelText: "오늘부터" })) from = f0;
      }
      // ⭐ 2026-11-05 이번 달 말일(최소 7일 앞)까지 한 번에 — 만드는 동안 "등록 중" 창
      const n = await runGen([{ ...data, id, genThrough: "" }], { full: true, from });
      flash([n ? `배차 ${n}건을 미리 만들었습니다(~${genHorizon(today).slice(5).replace("-", "/")})` : "", synced ? `앞으로의 배차 ${synced}건에 수정 내용을 반영했습니다` : ""].filter(Boolean).join(" · ") || "저장했습니다");
    } catch (e) { kpAlert(`저장 실패: ${e?.message || e}`); } finally { setBusy(false); }
  };
  const saveNewClient = async () => {
    const n = newClient.name.trim();
    if (!n) return kpAlert("업체명을 입력해 주세요.");
    setBusy(true);
    try {
      await setDoc(doc(db, "clients", coDocKey(getTenant(), n)), { id: coDocKey(getTenant(), n), 거래처명: n, 주소: newClient.addr, 담당자: newClient.manager, 연락처: newClient.phone, 이메일: newClient.email, 메모: newClient.memo, 등급: newClient.grade, companyName: co }, { merge: true });
      set("client", n); setNewClient(null); flash("신규 거래처를 등록했습니다");
    } catch (e) { kpAlert(`등록 실패: ${e?.message || e}`); } finally { setBusy(false); }
  };
  // ⭐ 2026-11-05 배차 만들기 + 가운데 "등록 중" 창(진행 n / 전체건)
  const [prog, setProg] = React.useState(null);
  // ⭐ 2026-11-05 등록폼 아래 저장줄 — 화면(PC 본문·휴대폰 본문)이 overflow-x:hidden이라 sticky가 안 먹어서
  //  자리(placeholder)의 왼쪽·너비를 재서 화면 맨 아래에 fixed로 붙인다(사이드바를 접거나 창 크기를 바꾸면 다시 잰다)
  const barRef = React.useRef(null);
  const [barBox, setBarBox] = React.useState(null);
  const formOpen = !!form;
  React.useEffect(() => {
    const el = barRef.current;
    if (!formOpen || !el) return undefined;
    const upd = () => { const r = el.getBoundingClientRect(); if (!r.width) return; setBarBox((b) => (b && b.l === r.left && b.w === r.width ? b : { l: r.left, w: r.width })); };
    upd();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(upd) : null;
    ro?.observe(el); window.addEventListener("resize", upd);
    const t = setInterval(upd, 1000);
    return () => { ro?.disconnect(); window.removeEventListener("resize", upd); clearInterval(t); };
  }, [formOpen]);
  const runGen = async (list, opts = {}) => {
    setProg({ done: 0, total: 0, made: 0 });
    try { return await ensureFixedRouteOrders(list, { force: true, ...opts, onProgress: (p) => setProg({ ...p }) }); }
    finally { setProg(null); }
  };
  // ⭐ 2026-11-05 운행 ON/OFF — OFF: 앞으로 배차를 만들지 않는다(이미 만든 배차는 지우지 않음) · ON: 이번 달 말일까지 바로 채운다
  const toggleActive = async (r, next = !r.active) => {
    const by = { updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "" };
    try {
      if (!next) {
        const today = kst();
        const fut = (dispatchData || []).filter((o) => o.고정노선Id === r.id && String(o.상차일 || "") >= today).length;
        if (!(await kpConfirm(`"${r.name}" 노선의 운행을 끌까요(OFF)?\n앞으로 새 배차를 만들지 않습니다.${fut ? `\n이미 만들어 둔 오늘 이후 배차 ${fut}건은 그대로 남습니다 — 필요하면 배차현황에서 지우세요.` : ""}`, { title: "운행 OFF", okText: "OFF" }))) return;
        await updateDoc(doc(db, "fixedRoutes", r.id), { active: false, ...by });
        flash(`"${r.name}" 운행 OFF — 앞으로 배차를 만들지 않습니다`);
      } else {
        await updateDoc(doc(db, "fixedRoutes", r.id), { active: true, ...by });
        const n = r.autoDispatch ? await runGen([{ ...r, active: true }], { full: true }) : 0;
        flash(`"${r.name}" 운행 ON${n ? ` — 배차 ${n}건을 만들었습니다` : ""}`);
      }
    } catch (e) { kpAlert(`바꾸지 못했습니다: ${e?.message || e}`); }
  };
  const remove = async (r) => { if (await kpConfirm(`"${r.name}" 노선을 삭제할까요?\n이미 만들어진 배차는 그대로 남습니다.`)) { await runDelete({ label: "노선", task: () => deleteDoc(doc(db, "fixedRoutes", r.id)) }); setSelId(null); } }; // ⭐ 2026-11-05 삭제 진행 창
  const genNow = async () => { const n = await runGen(routes, { full: true }); flash(n ? `배차 ${n}건을 만들었습니다(~${genHorizon().slice(5).replace("-", "/")})` : "새로 만들 배차가 없습니다(이미 모두 있음)"); };
  const ordersOf = (r) => (dispatchData || []).filter((o) => o.고정노선Id === r.id).sort((a, b) => String(b.상차일).localeCompare(String(a.상차일))).slice(0, 8);

  // ───────────── 편집 화면 ─────────────
  // ⭐ 2026-11-05 등록폼 전면 개편(팀장님 요청)
  //  · 맨 위 머리 카드 = 노선 이름 · 거래처(청구처, 한 곳에서만) · 운행 ON/OFF · 취소/저장
  //  · 왼쪽 ROUTE 경로 = 정류지 순서(상차 → 경유·거점 → 하차) + 그 곳의 상차/하차방법 · 담당자·연락처·메모는 접어 둠
  //  · 오른쪽 CARGO 화물(기본 1장 + 경유·거점마다 1장) → FARE 운임(노선 전체 / 구간별) → DRIVER 기사·차량 → SCHEDULE 운행 일정
  //  · 맨 아래 고정 저장줄 = 요일 · 기간 · 청구 합계 + [고정노선 저장] (휴대폰은 같은 순서 한 줄)
  if (form) {
    const stops = form.stops || [];
    const R = toRoute(form);
    const fp = fareProblems(R); const fareMiss = fp.miss;
    const segMode = form._fareMode === "seg";
    const RT = fp.legacy ? { ...R, fareMode: "stop" } : R;
    const T = routeTotals(RT);
    const groups = routePayGroups(RT);
    const clientNew = form.client.trim() && !knownClient(form.client);
    const midIdx = stops.map((_, i) => i).filter((i) => i > 0 && i < stops.length - 1);
    const today0 = kst();
    const hTo = [genHorizon(today0), form.endDate || "9999"].sort()[0];
    const hFrom = form.startDate && form.startDate > today0 ? form.startDate : today0;
    const hN = form.active === false ? 0 : routeDatesBetween(form, hFrom, hTo).length;
    const md = (ymd) => String(ymd || "").slice(5).replace("-", "/");
    const daysLabel = (() => { const d = form.days || []; const k = DAYS.filter((x) => d.includes(x)).join(""); return ({ 월화수목금: "평일(월~금)", 월화수목금토: "월~토", 월화수목금토일: "매일" })[k] || d.join("·") || "요일 미선택"; })();
    const setCargo = (patch) => setForm((p) => ({ ...p, _cargo: { ...(p._cargo || {}), ...patch } }));
    const stopName = (s) => s?.name || s?.addr || STOP_LABEL[s?.type] || s?.type || "";
    const methodLabel = (t) => (t === "상차" ? "상차방법" : "하차방법");
    // 운임 방식 바꾸기 — 금액이 사라지지 않게 옮긴다(노선 전체 → 마지막 구간 / 구간별 → 합계)
    const setFareMode = async (m) => {
      if (form._fareMode === m) return;
      if (m === "route" && groups.length > 1 && !(await kpConfirm(`구간마다 거래처·지급방식이 달라 배차가 ${groups.length}건으로 나뉘고 있습니다.\n노선 전체 한 번에로 바꾸면 합계 금액 하나 · 지급방식 하나로 합쳐집니다.`, { title: "운임 방식 바꾸기", okText: "합치기" }))) return;
      setForm((p) => {
        if (m === "seg") {
          const { last } = endsOf(p.stops);
          const has = toInt(p.fareClient) || toInt(p.fareDriver);
          const kept = p.stops.some((s, i) => i > 0 && stopPaid(s));
          return { ...p, _fareMode: "seg", fareMode: "stop", fareClient: "", fareDriver: "",
            stops: p.stops.map((s, i) => (i === last && has && !kept ? { ...s, fareClient: p.fareClient, fareDriver: p.fareDriver, payMethod: s.payMethod || p.payMethod || "", fareType: s.fareType || "", fareManual: !!p.fareManual } : s)) };
        }
        const t = routeTotals(toRoute(p));
        const lastPay = [...t.seg].reverse().find((g) => g.지급방식)?.지급방식;
        return { ...p, _fareMode: "route", fareMode: "base", fareClient: t.client ? String(t.client) : "", fareDriver: t.driver ? String(t.driver) : "", payMethod: lastPay || p.payMethod || "" };
      });
    };
    const Sec = ({ en, ko, sub, right }) => (
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        <span className="h-7 px-2.5 inline-flex items-center rounded-lg bg-[#0F1A30] text-[#8FB0F0] text-[11px] font-extrabold tracking-[0.2em]" style={{ fontFamily: MONO }}>{en}</span>
        <span className="text-[17px] font-black text-[#0F1A30] whitespace-nowrap">{ko}</span>
        {sub && <span className="text-[12.5px] font-semibold text-[#8A98B0] min-w-0">{sub}</span>}
        {right && <div className="ml-auto">{right}</div>}
      </div>
    );
    const TypeBadge = ({ t }) => <span className={`h-6 px-2 inline-flex items-center rounded-md text-[12px] font-black whitespace-nowrap ${t === "상차" || t === "하차" ? "bg-[#0F1A30] text-white" : "bg-[#EEF3FC] text-[#2D4C82] border border-[#C9D6EE]"}`}>{STOP_LABEL[t] || t}</span>;
    const Num = ({ n, solid }) => <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11.5px] font-black ${solid ? "bg-[#0F1A30] text-white" : "bg-white border-2 border-[#2D4C82] text-[#2D4C82]"}`} style={{ fontFamily: MONO }}>{String(n).padStart(2, "0")}</span>;
    const money = (v, on, ph, err) => (
      <input inputMode="numeric" value={v ? won(v) : ""} onChange={(e) => on(e.target.value.replace(/[^\d]/g, ""))} placeholder={ph}
        className={`${inp} text-right tabular-nums ${err ? "!border-[#E5484D]" : ""}`} style={{ fontFamily: MONO }} />
    );
    // 화물내용·수량 + 단위 / 톤수·중량 + 단위 — 지금과 같은 단위 목록(회사 공용)
    const cargoFields = (v, on) => (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="min-w-0">
          <label className={lab}>화물내용 · 수량</label>
          <div className="flex min-w-0">
            <input value={v.cargo || ""} onChange={(e) => on({ cargo: v.cargoType ? e.target.value.replace(/[^\d.]/g, "") : e.target.value })} placeholder={v.cargoType ? "수량" : "예: 2 또는 변압기"} className={`${inp} !rounded-r-none min-w-0`} />
            <CustomSelect value={v.cargoType || ""} onChange={(e) => on({ cargoType: e.target.value, cargo: e.target.value ? String(v.cargo || "").replace(/[^\d.]/g, "") : v.cargo })} className="h-11 w-[84px] shrink-0 px-2 rounded-r-xl bg-[#1B2B4B] text-white text-[13px] font-black">
              <option value="">없음</option>{cargoTypes.map((x) => <option key={x} value={x}>{x}</option>)}
            </CustomSelect>
          </div>
        </div>
        <div className="min-w-0">
          <label className={lab}>톤수 · 중량</label>
          <div className="flex min-w-0">
            <input value={v.tonVal || ""} onChange={(e) => on({ tonVal: v.tonType ? e.target.value.replace(/[^\d.]/g, "") : e.target.value })} placeholder={v.tonType ? "예: 1" : "예: 5톤 또는 소형"} inputMode={v.tonType ? "decimal" : "text"} className={`${inp} !rounded-r-none min-w-0`} />
            <CustomSelect value={v.tonType || ""} onChange={(e) => on({ tonType: e.target.value, tonVal: e.target.value ? String(v.tonVal || "").replace(/[^\d.]/g, "") : v.tonVal })} className="h-11 w-[84px] shrink-0 px-2 rounded-r-xl bg-[#1B2B4B] text-white text-[13px] font-black">
              <option value="">없음</option>{tonTypes.map((x) => <option key={x} value={x}>{x}</option>)}
            </CustomSelect>
          </div>
        </div>
      </div>
    );
    const ruleRow = (ft, onFt, manual, placeholder) => {
      if (!fareR.on) return null;
      const rule = findFareRule(fareR.rules, ft || (placeholder ? form.fareType : ""));
      return (
        <div className="mt-2.5 flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-black text-[#3A4A66]">운임구분</span>
          <FareTypeSelect compact rules={fareR.rules} value={ft || ""} placeholder={placeholder} onChange={onFt} />
          {rule && <span className={`text-[12px] font-extrabold ${manual ? "text-amber-700" : "text-[#2D4C82]"}`}>{manual ? "기사운임 직접 입력" : fareRuleHint(rule)}</span>}
          {manual && <button type="button" onClick={() => onFt(ft || "")} className="h-6 px-2 rounded bg-[#1B2B4B] text-white text-[11.5px] font-extrabold">↺ 규칙대로</button>}
        </div>
      );
    };
    return (
      <div className="min-w-0">
        {/* ── 머리 카드: 노선 정보 ── */}
        <div className={`${card} overflow-hidden mb-4`} data-fr-head="1">
          <div className="px-4 py-4 md:px-6 text-white flex items-center gap-3 flex-wrap"
            style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>FIXED ROUTE · {form.id ? "EDIT" : "NEW"}</div>
              <div className="text-[22px] md:text-[24px] font-black leading-tight">{form.id ? "고정노선 수정" : "고정노선 만들기"}</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="h-11 pl-3.5 pr-2 rounded-xl bg-white/10 border border-white/15 flex items-center gap-2.5">
                <span className="text-[13.5px] font-black whitespace-nowrap">운행</span>
                <OnOffSwitch dark on={form.active !== false} onChange={(v) => set("active", v)} />
              </div>
              <button type="button" tabIndex={-1} onClick={() => setForm(null)} className="h-11 px-4 rounded-xl bg-white/10 border border-white/20 text-[14px] font-bold whitespace-nowrap">취소</button>
              <button type="button" tabIndex={-1} onClick={askSave} disabled={busy} className="hidden md:inline-flex items-center h-11 px-5 rounded-xl bg-white text-[#0F1A30] text-[14.5px] font-black disabled:opacity-50 whitespace-nowrap">저장</button>
            </div>
          </div>
          <div className="p-4 md:px-6 md:py-5 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <div className="min-w-0"><label className={lab}>노선 이름 <span className="text-[#E5484D]">*</span></label><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="예: 평택 물류센터 → 수원 3곳" className={inp} /></div>
            <div className="min-w-0">
              <label className={lab}>거래처(청구처) {clientNew && <NewTag />}<span className="ml-auto text-[12px] font-semibold text-[#9AA9C3]">운임을 청구하는 곳 · 한 번만 입력</span></label>
              <div className="flex gap-1.5 min-w-0">
                <Suggest value={form.client} onChange={(v) => set("client", v)} items={clients} k="거래처명" sub={clientSub} title="기본거래처" placeholder="거래처명 검색" onPick={(c) => set("client", c.거래처명 || c.id)} />
                <button type="button" tabIndex={-1} onClick={() => setNewClient({ name: form.client.trim(), addr: "", manager: "", phone: "", email: "", memo: "", grade: "일반" })} className="h-11 px-3 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-black text-[#1B2B4B] whitespace-nowrap hover:bg-[#F5F8FD]">+ 신규</button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] items-start">
          {/* ── 왼쪽: 운행 일정 → ROUTE 경로 ── */}
          <div className="space-y-4 min-w-0">
            {/* ⭐ 2026-11-05 SCHEDULE · 운행 일정 — 왼쪽 경로 위로 */}
            <div className={`${card} p-4 md:p-5`} data-fr-days="1">
              <Sec en="SCHEDULE" ko="운행 일정" />
              <div className="grid grid-cols-7 gap-1.5 mb-2.5">
                {DAYS.map((d) => { const on = (form.days || []).includes(d); return <button tabIndex={-1} key={d} type="button" onClick={() => set("days", on ? form.days.filter((x) => x !== d) : DAYS.filter((x) => x === d || (form.days || []).includes(x)))} className={`h-11 md:h-12 rounded-xl text-[15px] font-black transition ${on ? "bg-[#0F1A30] text-white shadow" : "bg-white border border-[#DCE3EE] text-[#5B6B85]"} ${d === "토" || d === "일" ? (on ? "" : "!text-[#C4262C]/70") : ""}`}>{d}</button>; })}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {[["평일", ["월", "화", "수", "목", "금"]], ["월~토", ["월", "화", "수", "목", "금", "토"]], ["매일", DAYS], ["월수금", ["월", "수", "금"]], ["화목", ["화", "목"]]].map(([l, ds]) => <button tabIndex={-1} key={l} type="button" onClick={() => set("days", ds)} className="h-9 px-3.5 rounded-lg bg-[#F3F6FA] text-[13px] font-bold text-[#3A4A66] hover:bg-[#EAF0F8]">{l}</button>)}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
                <div className="col-span-2 sm:col-span-1 min-w-0"><label className={lab}>출발(상차) 시간</label><TimeSelect value={form.startTime} onChange={(v) => set("startTime", v)} /></div>
                <div className="min-w-0"><label className={lab}>시작일</label><CustomDatePicker value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={inp} showIcon /></div>
                <div className="min-w-0"><label className={lab}>종료일(선택)</label><CustomDatePicker value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className={inp} showIcon placeholder="계속" /></div>
              </div>
              <div className="mt-3 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3.5 py-2.5 text-[13px] text-[#3A4A66] leading-relaxed" data-fr-horizon="1">
                {form.active === false
                  ? <><b className="text-[#0F1A30]">운행 OFF</b> — 저장해도 새 배차를 만들지 않습니다(이미 만든 배차는 그대로)</>
                  : <>저장하면 <b className="text-[#0F1A30] tabular-nums">{md(hFrom)} ~ {md(hTo)} 운행일 {hN}건</b>을 먼저 만들고, {form.endDate && form.endDate <= hTo ? "종료일까지면 끝납니다" : "그 뒤는 매달(새 달에 앱을 열 때) 이어서 만듭니다"}</>}
              </div>
              <div className="mt-3">
                <label className={lab}>쉬는 날 <span className="font-semibold text-[12px] text-[#9AA9C3]">달력에서 여러 날을 눌러 고르세요</span></label>
                <MultiDateSelect value={form.skipDates || []} onChange={(v) => set("skipDates", v)} className={inp} placeholder="쉬는 날 고르기" />
                {(form.skipDates || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.skipDates.map((d) => <button tabIndex={-1} key={d} type="button" onClick={() => set("skipDates", form.skipDates.filter((x) => x !== d))} className="h-8 px-2.5 rounded-lg bg-[#EEF3FC] border border-[#C9D6EE] text-[12.5px] font-bold text-[#1B2B4B] tabular-nums" style={{ fontFamily: MONO }}>{d.slice(5).replace("-", ".")}({dayOf(d)}) ✕</button>)}
                  </div>
                )}
              </div>
            </div>
          <div className={`${card} p-4 md:p-5 min-w-0`} data-fr-left="1">
            <Sec en="ROUTE" ko="경로" sub="상차지 → 경유·거점 → 하차지" />
            <div className="relative">
              <div className="absolute left-[13px] top-5 bottom-8 w-[2px] bg-gradient-to-b from-[#0F1A30] via-[#C9D6EE] to-[#0F1A30]" />
              {stops.map((s, i) => {
                const isNew = (s.name || "").trim() && !knownPlace(s.name);
                const ends = i === 0 || i === stops.length - 1;
                return (
                  <div key={i} className="relative flex gap-2.5 md:gap-3 mb-3" data-fr-stop={i}>
                    <span className="relative z-[1] mt-3"><Num n={i + 1} solid={ends} /></span>
                    <div className={`flex-1 min-w-0 rounded-2xl border p-3 md:p-3.5 ${ends ? "border-[#D5DEEC] bg-[#F8FAFD]" : "border-[#C9D6EE] bg-[#F4F8FF]"}`}>
                      <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                        <div className="inline-flex p-0.5 rounded-lg bg-white border border-[#E3E8F0]" title="정류지 구분 — 바꾸면 오른쪽 화물·운임이 같이 바뀝니다">
                          {STOP_TYPES.map((t) => <button tabIndex={-1} key={t} type="button" onClick={() => setStop(i, { type: t })} className={`h-7 px-2 sm:px-2.5 rounded-md text-[12.5px] font-black ${s.type === t ? "bg-[#0F1A30] text-white" : "text-[#5B6B85] hover:bg-[#F3F6FA]"}`}>{t}</button>)}
                        </div>
                        {isNew && <span className="hidden sm:inline-flex"><NewTag /></span>}
                        <div className="ml-auto flex items-center">
                          <button type="button" tabIndex={-1} onClick={() => moveStop(i, -1)} disabled={i === 0} className="w-7 sm:w-8 h-8 rounded-lg text-[14px] text-[#5B6B85] hover:bg-white disabled:opacity-25" aria-label="위로">↑</button>
                          <button type="button" tabIndex={-1} onClick={() => moveStop(i, 1)} disabled={i === stops.length - 1} className="w-7 sm:w-8 h-8 rounded-lg text-[14px] text-[#5B6B85] hover:bg-white disabled:opacity-25" aria-label="아래로">↓</button>
                          <button type="button" tabIndex={-1} onClick={() => setForm((p) => ({ ...p, stops: p.stops.filter((_, j) => j !== i) }))} disabled={stops.length <= 1} className="w-7 sm:w-8 h-8 rounded-lg text-[#9AA9C3] hover:bg-white hover:text-[#E5484D] disabled:opacity-25" aria-label="정류지 삭제" title="이 정류지 빼기">✕</button>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                        <Suggest value={s.name} onChange={(v) => setStop(i, { name: v, manager: "" })} items={placePool} k="업체명" sub={placeSub} tag={(x) => x._src} title={`${STOP_LABEL[s.type] || s.type} · 거래처관리`} placeholder={`${STOP_LABEL[s.type] || s.type} 검색 (업체·장소명)`}
                          onPick={(p) => setStop(i, { name: p.업체명 || "", addr: p.주소 || s.addr, manager: p.담당자 || "", contact: p.담당자번호 ? fmtPhone(p.담당자번호) : s.contact, memo: s.memo || p.메모 || "", _more: s._more || !!(p.담당자 || p.담당자번호) })} />
                        <div className="shrink-0 flex items-center gap-2" title={`${s.type} 시간 · 비우면 즉시`}><TimeSelect value={s.time} onChange={(v) => setStop(i, { time: v })} />{isNew && <span className="sm:hidden"><NewTag /></span>}</div>
                      </div>
                      <input value={s.addr} onChange={(e) => setStop(i, { addr: e.target.value })} placeholder="주소" className={`${inp} mt-2`} />
                      <div className="mt-2 flex items-center gap-2 min-w-0" data-fr-method={i}>
                        <span className="shrink-0 w-[62px] text-[13.5px] font-black text-[#3A4A66]">{methodLabel(s.type)}</span>
                        <div className="flex-1 min-w-0">
                          <CompanyOptionPicker optKey="상하차방법" title={methodLabel(s.type)} placeholder="선택" noneLabel="선택 안 함" className={`${inp} ${s.method ? "" : "!text-[#9AA9C3]"}`} value={s.method || ""} onChange={(v) => setStop(i, { method: v })} />
                        </div>
                      </div>
                      <button type="button" tabIndex={-1} onClick={() => setStop(i, { _more: !s._more })} className="mt-2 h-8 px-1 inline-flex items-center gap-1.5 text-[13px] font-black text-[#2D4C82]" aria-expanded={!!s._more}>
                        <span className={`inline-block transition-transform ${s._more ? "rotate-90" : ""}`}>›</span>담당자 · 연락처 · 메모
                        {!s._more && (s.manager || s.contact || s.memo) && <span className="text-[12px] font-semibold text-[#7A89A3] truncate max-w-[180px]">{[s.manager, s.contact].filter(Boolean).join(" ") || "메모 있음"}</span>}
                      </button>
                      {s._more && (
                        <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input value={s.manager || ""} onChange={(e) => setStop(i, { manager: e.target.value })} placeholder="담당자" className={inp} />
                          <input value={s.contact} inputMode="tel" onChange={(e) => setStop(i, { contact: fmtPhone(e.target.value) })} placeholder="연락처" className={inp} />
                          <input value={s.memo} onChange={(e) => setStop(i, { memo: e.target.value })} placeholder="메모(출입·하역 안내 등)" className={`${inp} sm:col-span-2`} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* ⭐ 2026-11-05 + 상차지 추가 없앰 — 경유·거점만(하차지 바로 앞에) · 상차를 더 넣으려면 정류지 구분을 "상차"로 */}
            <div className="mt-1 pl-[38px] md:pl-[40px] grid grid-cols-2 gap-2" data-fr-add="1">
              {[["경유", "경유지"], ["거점", "거점지"]].map(([t, l]) => (
                <button tabIndex={-1} key={t} type="button" data-fr-add-type={t} onClick={() => setForm((p) => { const a = [...p.stops]; a.splice(Math.max(0, a.length - 1), 0, blankStop(t)); return { ...p, stops: a }; })}
                  className="h-11 rounded-xl border-2 border-dashed border-[#C9D6EE] bg-white text-[14px] font-black text-[#2D4C82] hover:bg-[#F3F7FE] hover:border-[#8FB0F0] whitespace-nowrap">+ {l} 추가</button>
              ))}
            </div>
            <div className="text-[12.5px] text-[#7A89A3] mt-3 leading-relaxed">시간을 비우면 <b className="text-[#1B2B4B]">즉시</b> · 경유·거점은 하차지 바로 앞에 들어갑니다(↑↓로 순서 변경) · <NewTag /> 표시된 곳은 저장할 때 거래처관리에 함께 등록됩니다</div>
          </div>
          </div>

          {/* ── 오른쪽: 화물 → 운임 → 기사·차량 ── */}
          <div className="space-y-4 min-w-0">
            {/* CARGO · 화물 — 기본 1장(노선 전체) + 경유·거점마다 1장 */}
            <div className={`${card} p-4 md:p-5`} data-fr-right="cargo">
              <Sec en="CARGO" ko="화물" sub={midIdx.length ? `기본 화물 + 경유·거점 ${midIdx.length}곳` : "이 노선에 싣는 화물"} />
              <div className="space-y-3">
                <div className="rounded-2xl border border-[#D5DEEC] bg-[#F8FAFD] p-3.5" data-fr-cargo="main">
                  <div className="flex items-center gap-2 mb-3 min-w-0">
                    <span className="text-[15px] font-black text-[#0F1A30] whitespace-nowrap">기본 화물</span>
                    <span className="min-w-0 truncate text-[13px] font-bold text-[#5B6B85]">{stopName(stops[0]) || "상차지"} → {stopName(stops[stops.length - 1]) || "하차지"}</span>
                  </div>
                  {cargoFields(form._cargo || {}, setCargo)}
                </div>
                {midIdx.map((i) => {
                  const s = stops[i];
                  return (
                    <div key={i} className="rounded-2xl border border-[#C9D6EE] bg-[#F4F8FF] p-3.5" data-fr-cargo={i}>
                      <div className="flex items-center gap-2 mb-3 min-w-0">
                        <Num n={i + 1} />
                        <TypeBadge t={s.type} />
                        <span className={`min-w-0 truncate text-[15px] font-black ${s.name ? "text-[#0F1A30]" : "text-[#B4BFD0]"}`}>{s.name || "왼쪽 경로에서 업체를 입력하세요"}</span>
                        <span className="ml-auto shrink-0 text-[12px] font-semibold text-[#8A98B0] hidden sm:inline">이 곳 화물 · 없으면 비움</span>
                      </div>
                      {cargoFields(s, (patch) => setStop(i, patch))}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* FARE · 운임 — 노선 전체 한 번에 / 구간별로 따로 */}
            <div className={`${card} p-4 md:p-5`} data-fr-right="fare">
              <Sec en="FARE" ko="운임" sub={form.client.trim() ? `청구처 ${form.client.trim()}` : "청구처 — 위 노선 정보에서 거래처 입력"} />
              <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[#F3F6FA] border border-[#E3E8F0] mb-3.5" data-fr-fare-mode={form._fareMode}>
                {[["route", "노선 전체 한 번에", "운임 1개 · 지급방식 1개"], ["seg", "구간별로 따로", midIdx.length || segMode ? "구간마다 운임·지급방식" : "경유·거점이 있을 때"]].map(([m, t, d]) => {
                  const on = form._fareMode === m; const dis = m === "seg" && !midIdx.length && !segMode;
                  return (
                    <button key={m} type="button" tabIndex={-1} disabled={dis} onClick={() => setFareMode(m)} data-fr-mode={m}
                      className={`min-w-0 rounded-xl px-2 py-2 text-center transition ${on ? "bg-[#0F1A30] text-white shadow" : "text-[#3A4A66] hover:bg-white"} disabled:opacity-45 disabled:hover:bg-transparent`}>
                      <span className="block text-[14px] font-black truncate">{t}</span>
                      <span className={`block text-[11.5px] font-semibold truncate ${on ? "text-[#8FB0F0]" : "text-[#8A98B0]"}`}>{d}</span>
                    </button>
                  );
                })}
              </div>
              {!segMode ? (
                <div data-fr-fare-route="1">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <div className="min-w-0"><label className={lab}>청구운임(1회)</label>{money(form.fareClient, (v) => set("fareClient", v), "0")}</div>
                    <div className="min-w-0"><label className={lab}>기사운임(1회)</label>{money(form.fareDriver, (v) => set("fareDriver", v), "0")}</div>
                    <div className="col-span-2 sm:col-span-1 min-w-0"><label className={lab}>지급방식 {(toInt(form.fareClient) || toInt(form.fareDriver)) ? <span className="text-[#E5484D]">*</span> : null}</label>
                      <PaySelect id="fr-pay-route" value={form.payMethod} onChange={(v) => set("payMethod", v)} options={payTypes} error={tried && fareMiss.includes("route")} />
                    </div>
                  </div>
                  <div data-fr-fare-type="1">{ruleRow(form.fareType, (v) => set("fareType", v), form.fareManual, "")}</div>
                </div>
              ) : (
                <div className="space-y-2.5" data-fr-fare-seg="1">
                  {stops.map((s, i) => {
                    if (i === 0) return null;
                    const prev = stops[i - 1];
                    const err = tried && fareMiss.includes(i);
                    const sc = String(s.client || "").trim();
                    const other = s._payer && sc && norm(sc) !== norm(routeClient(form));
                    return (
                      <div key={i} className={`rounded-2xl border p-3 md:p-3.5 ${err ? "border-[#E5484D] bg-[#FFF6F6]" : "border-[#E3E8F0] bg-[#FBFCFE]"}`} data-fr-seg={i}>
                        <div className="flex items-center gap-1.5 mb-2.5 min-w-0">
                          <span className="shrink-0 text-[11.5px] font-extrabold text-[#2D4C82] tabular-nums" style={{ fontFamily: MONO }}>{String(i).padStart(2, "0")}→{String(i + 1).padStart(2, "0")}</span>
                          <span className="min-w-0 truncate text-[14px] font-black text-[#0F1A30]">{stopName(prev)} <span className="text-[#8FB0F0]">→</span> {stopName(s)}</span>
                          <TypeBadge t={s.type} />
                          <span className="ml-auto shrink-0 text-[12px] font-black text-[#5B6B85] tabular-nums" style={{ fontFamily: MONO }}>수수료 {won(toInt(s.fareClient) - toInt(s.fareDriver))}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <div className="min-w-0"><label className={`${lab} !text-[13px] !mb-1`}>청구운임</label>{money(s.fareClient, (v) => setStop(i, { fareClient: v }), "0")}</div>
                          <div className="min-w-0"><label className={`${lab} !text-[13px] !mb-1`}>기사운임</label>{money(s.fareDriver, (v) => setStop(i, { fareDriver: v }), "0")}</div>
                          <div className="col-span-2 sm:col-span-1 min-w-0"><label className={`${lab} !text-[13px] !mb-1`}>지급방식</label><PaySelect id={`fr-pay-${i}`} value={s.payMethod} onChange={(v) => setStop(i, { payMethod: v })} options={payTypes} error={err} /></div>
                        </div>
                        {ruleRow(s.fareType, (v) => setStop(i, { fareType: v }), s.fareManual, form.fareType ? `노선 기본(${form.fareType})` : "운임구분")}
                        <div className="mt-2.5 flex items-center gap-2 flex-wrap min-w-0">
                          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" checked={!!s._payer} onChange={(e) => setStop(i, e.target.checked ? { _payer: true, client: sc || form.client || "" } : { _payer: false, client: "" })} className="w-4 h-4 accent-[#0F1A30]" />
                            <span className="text-[13px] font-black text-[#3A4A66]">청구처 다르게</span>
                          </label>
                          {!s._payer && <span className="text-[12px] font-semibold text-[#9AA9C3]">{form.client.trim() || "노선 거래처"}에 청구</span>}
                          {other && <span className="h-5 px-1.5 inline-flex items-center rounded-md bg-[#FFF3D6] text-[#7A5300] text-[10.5px] font-black">다른 거래처</span>}
                        </div>
                        {s._payer && (
                          <div className="mt-2 flex items-center gap-1.5 min-w-0">
                            <Suggest value={s.client || ""} onChange={(v) => setStop(i, { client: v })} items={clients} k="거래처명" sub={clientSub} title="기본거래처" placeholder="이 구간 청구처 검색" onPick={(c) => setStop(i, { client: c.거래처명 || c.id })} />
                            {sc && !knownClient(sc) && <NewTag />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {fp.legacy && (
                    <div id="fr-legacy" className={`rounded-xl border px-3.5 py-3 ${tried ? "border-[#E5484D] bg-[#FFF6F6]" : "border-[#F0C36D] bg-[#FFFAEE]"}`}>
                      <div className="text-[13px] font-black text-[#0F1A30]">예전 기본 운임(청구 {won(form.fareClient)} · 기사 {won(form.fareDriver)})이 구간 운임과 따로 들어 있습니다</div>
                      <div className="text-[12.5px] text-[#5B6B85] mt-0.5">한 가지로 정리해 주세요 — 구간별이면 1회 운임은 구간 금액의 합계입니다.</div>
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        <button type="button" onClick={() => resolveLegacy(true)} className="h-9 px-3 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black">하차지 운임에 합치기</button>
                        <button type="button" onClick={() => resolveLegacy(false)} className="h-9 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#1B2B4B]">기본 운임 지우기</button>
                      </div>
                    </div>
                  )}
                  {fareR.on && <div className="flex items-center gap-2 flex-wrap" data-fr-fare-type="1"><span className="text-[13px] font-black text-[#3A4A66]">노선 기본 운임구분</span><FareTypeSelect compact rules={fareR.rules} value={form.fareType || ""} onChange={(v) => set("fareType", v)} /></div>}
                </div>
              )}
              {/* 실시간 합계 */}
              <div className="mt-3.5 grid grid-cols-3 rounded-2xl overflow-hidden bg-[#0F1A30] text-white" data-fr-total="1">
                {[["청구 합계", T.client], ["기사 합계", T.driver], ["수수료", T.client - T.driver]].map(([k, v], j) => (
                  <div key={k} className={`px-3 py-2.5 min-w-0 ${j ? "border-l border-white/10" : ""}`}>
                    <div className="text-[11.5px] font-bold text-[#8FB0F0] whitespace-nowrap">{k}</div>
                    <div className="text-[16px] md:text-[17px] font-black tabular-nums truncate" style={{ fontFamily: MONO }}>{won(v)}<span className="text-[11px] font-bold text-white/50 ml-0.5">원</span></div>
                  </div>
                ))}
              </div>
              {groups.length > 1 && (
                <div className="mt-2 rounded-xl bg-[#FFFAEE] border border-[#F0C36D] px-3.5 py-2.5 text-[12.5px] text-[#3A4A66] leading-relaxed">
                  <b className="text-[#0F1A30]">거래처·지급방식이 달라 배차가 하루 {groups.length}건으로 나뉩니다</b> — {groups.map((G) => `${G.payer || "-"} ${G.pay} ${won(G.client)}원`).join(" / ")} (같은 차량·같은 운행)
                </div>
              )}
            </div>

            {/* DRIVER · 기사·차량 */}
            <div className={`${card} p-4 md:p-5`} data-fr-right="driver">
              <Sec en="DRIVER" ko="기사 · 차량" />
              <label className={lab}>배정 기사님(지입·직영)</label>
              <CustomSelect value={form.driverKey} onChange={(e) => pickDriver(e.target.value)} className={inp}>
                <option value="">미배정(배차중으로 생성)</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.이름} · {d.차량번호}{d.차량톤수 ? ` · ${d.차량톤수}` : ""}</option>)}
              </CustomSelect>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3">
                {/* 🚚 2026-11-02 회사 공용 차량종류(＋ 추가 포함) */}
                <div className="min-w-0"><label className={lab}>차량종류</label><VehicleTypePicker className={inp} value={form.vehicleType} base={VEHICLE_TYPES_FR} placeholder="선택" noneLabel="선택 안 함" onChange={(v) => set("vehicleType", v)} /></div>
                <div className="min-w-0"><label className={lab}>차량톤수</label><input value={form.tonnage} onChange={(e) => set("tonnage", e.target.value)} placeholder="예: 5톤" className={inp} /></div>
                <div className="col-span-2 sm:col-span-1 min-w-0"><label className={lab}>배차방식</label><CompanyOptionPicker optKey="배차방식" placeholder="고정기사" noneLabel="선택 안 함(고정기사)" className={inp} value={form.dispatchType || ""} onChange={(v) => set("dispatchType", v)} /></div>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[["autoDispatch", "배차 자동 등록", "요일마다 배차가 미리 생깁니다"], ["autoAccept", "기사님 자동 수락", "매번 수락 없이 '수락' 상태로"]].map(([k, t, d]) => (
                  <label key={k} className="flex items-center justify-between gap-3 rounded-xl border border-[#E3E8F0] px-3.5 py-2.5 cursor-pointer hover:bg-[#F8FAFD] min-w-0">
                    <span className="min-w-0"><span className="block text-[14px] font-black text-[#0F1A30]">{t}</span><span className="block text-[12px] text-[#7A89A3] truncate">{d}</span></span>
                    <input type="checkbox" checked={form[k] !== false} onChange={(e) => set(k, e.target.checked)} className="w-5 h-5 shrink-0 accent-[#0F1A30]" />
                  </label>
                ))}
              </div>
              <label className={`${lab} mt-3`}>노선 메모 <span className="font-semibold text-[12px] text-[#9AA9C3]">기사님 전달사항으로도 들어갑니다</span></label>
              <textarea value={form.memo} onChange={(e) => set("memo", e.target.value)} rows={2} placeholder="예: 정문 출입 시 사전 연락" className={`${inp} !h-auto py-2.5`} />
            </div>

          </div>
        </div>
        {/* ⭐ 2026-11-05 아래 고정 저장줄 — 요일 · 기간 · 청구 합계 한 줄 + [고정노선 저장] */}
        <div ref={barRef} className="mt-4 h-[84px] md:h-[88px]" aria-hidden="true" />
        <div className="fixed bottom-0 z-[60] pt-2" style={{ left: barBox ? barBox.l : 12, width: barBox ? barBox.w : "calc(100% - 24px)", paddingBottom: "max(env(safe-area-inset-bottom, 0px), 10px)" }} data-fr-bar="1">
          <div className="rounded-2xl bg-white/95 backdrop-blur border border-[#D5DEEC] shadow-[0_-4px_24px_rgba(16,24,40,0.10)] px-3 py-2.5 md:px-5 md:py-3 flex items-center gap-2.5 md:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.18em] text-[#2D4C82]" style={{ fontFamily: MONO }}>
                <span className={`w-1.5 h-1.5 rounded-full ${form.active === false ? "bg-[#CBD5E3]" : "bg-[#2D4C82]"}`} />{form.active === false ? "OFF" : "SUMMARY"}
              </div>
              <div className="text-[13.5px] md:text-[14.5px] font-black text-[#0F1A30] min-w-0 sm:truncate">
                <span className="block sm:inline truncate">{daysLabel} · {md(form.startDate) || "오늘"} ~ {form.endDate ? md(form.endDate) : "계속"}</span>
                <span className="hidden sm:inline"> · </span><span className="block sm:inline tabular-nums truncate">청구 {won(T.client)}원{T.client ? <span className="text-[#7A89A3] font-bold"> · 수수료 {won(T.client - T.driver)}</span> : null}</span>
              </div>
            </div>
            <button type="button" tabIndex={-1} onClick={() => setForm(null)} className="hidden md:inline-flex items-center h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] font-bold text-[#3A4A66] whitespace-nowrap">취소</button>
            <button type="button" tabIndex={-1} onClick={askSave} disabled={busy} data-fr-save="1" className="shrink-0 h-12 px-5 md:px-8 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50 whitespace-nowrap">{form.id ? "수정 저장" : "고정노선 저장"}</button>
          </div>
        </div>
        {review && (() => {
          const st = (R.stops || []).filter((x) => x.name.trim() || x.addr.trim());
          const t = routeTotals(R);
          const first = st[0] || {}; const last = st[st.length - 1] || {};
          const mid = st.slice(1, -1);
          // ⭐ 2026-10-31 화면 최상단에(모바일 상단바 밑에 깔리지 않게) · 휴대폰은 전체 화면
          return createPortal(
            <div className="fixed inset-0 bg-[#0B1428]/70 backdrop-blur-[3px] flex items-center justify-center z-[999999] p-0 md:p-4">
              <div className="bg-[#F4F6FA] md:rounded-[26px] shadow-[0_40px_100px_rgba(0,0,0,0.45)] w-full md:w-[1320px] md:max-w-[96vw] h-full md:h-[86vh] md:max-h-[900px] overflow-hidden flex flex-col">
                <div className="relative shrink-0 px-4 md:px-7 pt-5 pb-4 text-white overflow-hidden" style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 16px)", background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}
                  >
                  <span className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
                  <div className="relative flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>FIXED ROUTE · CONFIRM</div>
                      <div className="text-[20px] md:text-[24px] font-black mt-0.5 truncate">{form.name}</div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {[form.client, (form.days || []).join(" "), korTimeLabel(form.startTime), `${form.startDate || ""} ~ ${form.endDate || "계속"}`, form.driverName ? `${form.driverName} ${form.carNo}` : "기사 미배정", [form.tonnage, form.vehicleType].filter(Boolean).join(" ")].filter(Boolean).map((x, i) => <span key={i} className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-[12.5px] font-bold">{x}</span>)}
                      </div>
                    </div>
                    <button tabIndex={-1} type="button" onClick={() => setReview(false)} className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-[13.5px] font-black shrink-0 whitespace-nowrap">닫기</button>
                  </div>
                  <div className="relative grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                    {[["정류지", `${st.length}곳`], ["1회 청구운임", `${won(t.client)}원`], ["1회 기사운임", `${won(t.driver)}원`], ["1회 수수료", `${won(t.client - t.driver)}원`]].map(([k, v]) => (
                      <div key={k} className="rounded-xl bg-white/[0.07] border border-white/10 px-3 md:px-4 py-2 min-w-0"><div className="text-[11.5px] font-bold text-white/55">{k}</div><div className="text-[18px] font-black tabular-nums" style={{ fontFamily: MONO }}>{v}</div></div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] content-start lg:content-stretch gap-4 p-3 md:p-5">
                  <div className="lg:min-h-0 lg:overflow-y-auto space-y-3 lg:pr-1">
                    <div className="bg-white rounded-2xl border border-[#E3E8F0] p-4">
                      <div className="text-[13.5px] font-black text-[#0F1A30] mb-3">이동 경로</div>
                      {st.map((x, i) => (
                        <div key={i} className="relative pl-10 pb-4 last:pb-0">
                          <span className={`absolute left-0 top-0 w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-black ${i === 0 || i === st.length - 1 ? "bg-[#0F1A30] text-white" : "bg-[#EEF2F8] text-[#1B2B4B] border border-[#DCE3EE]"}`} style={{ fontFamily: MONO }}>{String(i + 1).padStart(2, "0")}</span>
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-[11px] font-extrabold tracking-[0.14em] text-[#4B6CB7]">{x.type}</span>
                            <span className="text-[15.5px] font-black text-[#0F1A30]">{x.name || "-"}</span>
                            <span className="px-2 py-0.5 rounded-md bg-[#EEF2F8] text-[12px] font-black text-[#1B2B4B]">{korTimeLabel(x.time || (i === 0 ? form.startTime : ""))}</span>
                            {(i > 0 && stopPaid(x)) ? <span className="ml-auto flex items-center gap-1.5">{(() => { const pc = payerOf(R, { 거래처: String(x.client || "").trim() }); const other = pc !== routeClient(R); return <span className={`h-6 px-2 inline-flex items-center rounded-md text-[11.5px] font-black ${other ? "bg-[#FFF3D6] text-[#7A5300]" : "bg-[#EEF2F8] text-[#1B2B4B]"}`} title="거래처(청구처)">{pc || "-"}</span>; })()}<span className="h-6 px-2 inline-flex items-center rounded-md bg-[#0F1A30] text-white text-[11.5px] font-black">{x.payMethod || "-"}</span><span className="text-[12.5px] font-black text-[#0B1428] tabular-nums" style={{ fontFamily: MONO }}>청구 {won(x.fareClient)} · 기사 {won(x.fareDriver)}</span></span> : null}
                          </div>
                          <div className="text-[13px] font-semibold text-[#3A4A66] mt-0.5">{x.addr || "-"}</div>
                          {(cargoText(x) || tonText(x) || x.contact || x.memo) && <div className="text-[12.5px] text-[#7A89A3] mt-0.5">{[cargoText(x) && `화물 ${cargoText(x)}`, tonText(x) && `톤수 ${tonText(x)}`, x.contact, x.memo].filter(Boolean).join(" · ")}</div>}
                        </div>
                      ))}
                    </div>
                    {t.seg.length > 0 && (
                      <div className="bg-white rounded-2xl border border-[#E3E8F0] p-4">
                        <div className="flex items-center gap-2 mb-2.5"><span className="text-[10.5px] font-extrabold tracking-[0.18em] text-[#2D4C82]" style={{ fontFamily: MONO }}>FARE · PER STOP</span><span className="text-[13.5px] font-black text-[#0F1A30]">정류지별 운임</span></div>
                        <FareTable r={R} />
                      </div>
                    )}
                    <div className="bg-white rounded-2xl border border-[#E3E8F0] p-4 text-[13.5px] text-[#3A4A66] space-y-1.5">
                      <div className="text-[13.5px] font-black text-[#0F1A30] mb-1">배차에 이렇게 들어갑니다</div>
                      <div>· 배차방식 <b className="text-[#0F1A30]">고정기사</b> · 배차상태 <b className="text-[#0F1A30]">{form.carNo ? (form.autoAccept !== false ? "배차완료(기사님 자동 수락)" : "승인대기(기사님 수락 필요)") : "배차중(기사 미배정)"}</b></div>
                      <div>· 상차 {first.name || "-"} → 하차 {last.name || "-"}{mid.length ? ` · 경유·거점 ${mid.length}곳` : ""}</div>
                      {t.seg.length ? (() => { const gs = routePayGroups(R); return (
                        <>
                          <div>· <b className="text-[#0F1A30]">정류지별 운임 {t.seg.length}곳</b> — 청구·기사운임·수수료는 합계로, 정류지별 금액·지급방식은 오더의 정류지운임·경유지·기사앱에 따로 들어갑니다</div>
                          {gs.length > 1
                            ? <div>· 거래처·지급방식이 달라 <b className="text-[#0F1A30]">하루 {gs.length}건</b>으로 나눠 만듭니다: {gs.map((G) => `${G.payer || "-"} ${G.pay} 청구 ${won(G.client)}·기사 ${won(G.driver)}`).join(" / ")} (같은 차량·같은 운행)</div>
                            : <div>· 거래처 <b className="text-[#0F1A30]">{gs[0].payer || "-"}</b> · 지급방식 <b className="text-[#0F1A30]">{gs[0].pay}</b></div>}
                        </>
                      ); })() : <div>· 단일 운임 · 지급방식 <b className="text-[#0F1A30]">{form.payMethod || "계산서"}</b></div>}
                      <div>· {form.active === false ? "운행 OFF — 저장해도 새 배차를 만들지 않습니다" : form.autoDispatch !== false ? `정해진 요일마다 배차가 자동으로 생깁니다 — 지금은 이번 달 말일(최소 7일 앞)까지, 다음 달은 새 달에 이어서${form.endDate ? ` · ${form.endDate}에 끝` : " · 종료일 없음(매달 이어서)"}` : "자동 등록 꺼짐 — [배차 미리 만들기]로 만들 수 있습니다"}{(form.skipDates || []).length ? ` · 쉬는 날 ${form.skipDates.length}일 제외` : ""}</div>
                    </div>
                  </div>
                  <div className="h-[320px] lg:h-auto min-h-[300px] bg-white rounded-2xl border border-[#E3E8F0] overflow-hidden flex flex-col">
                    {first.addr && last.addr ? (
                      <RouteMapModal inline pickupAddr={first.addr} dropAddr={last.addr} pickupName={first.name} dropName={last.name}
                        viaPickup={mid.filter((x) => x.type === "상차").map((x) => x.addr).filter(Boolean)} viaDrop={mid.filter((x) => x.type !== "상차").map((x) => x.addr).filter(Boolean)}
                        onClose={() => {}} className="flex-1 min-h-0" />
                    ) : <div className="flex-1 flex items-center justify-center text-[13.5px] font-bold text-[#9AA9C3]">상차·하차지 주소가 있어야 지도를 볼 수 있습니다</div>}
                  </div>
                </div>
                <div className="shrink-0 px-4 md:px-6 py-3 md:py-4 bg-white border-t border-[#E3E8F0] flex items-center gap-2" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}>
                  <span className="hidden md:inline text-[13.5px] font-bold text-[#5B6B85]">내용을 확인하고 최종 저장하세요</span>
                  <button tabIndex={-1} type="button" onClick={() => setReview(false)} className="md:ml-auto flex-1 md:flex-none h-12 px-5 rounded-xl border border-[#DCE3EE] text-[14.5px] font-black text-[#1B2B4B] whitespace-nowrap">수정하기</button>
                  <button tabIndex={-1} type="button" onClick={save} disabled={busy} className="flex-[2] md:flex-none h-12 px-7 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50 whitespace-nowrap">{busy ? "저장 중…" : "최종 저장"}</button>
                </div>
              </div>
            </div>
          , document.body);
        })()}
        {newClient && <NewClientModal data={newClient} setData={setNewClient} busy={busy} onClose={() => setNewClient(null)} onSave={saveNewClient} />}
        <GenProgressModal p={prog} />
      </div>
    );
  }
  // ───────────── 목록 · 상세 ─────────────
  return (
    <div>
      <div className="relative overflow-hidden rounded-[22px] px-6 py-5 text-white flex items-center justify-between gap-4 flex-wrap mb-4"
        style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div>
          <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>FIXED ROUTES</div>
          <div className="text-[22px] font-black">고정노선</div>
          <div className="text-[12.5px] text-white/60">정해진 요일·시간에 같은 기사님이 가는 노선 — 배차가 자동으로 만들어집니다</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {[["전체 노선", `${routes.length}개`], ["운행 중", `${routes.filter((r) => r.active).length}개`], [`오늘(${todayDay})`, `${todayRuns.length}개`]].map(([k, v]) => (
            <div key={k} className="px-3.5 py-1.5 rounded-xl bg-white/[0.07] border border-white/10"><div className="text-[10.5px] font-bold text-white/55">{k}</div><div className="text-[16px] font-black tabular-nums" style={{ fontFamily: MONO }}>{v}</div></div>
          ))}
          <button type="button" onClick={genNow} className="h-11 px-4 rounded-xl bg-white/10 border border-white/20 text-[13px] font-black">배차 미리 만들기</button>
          <button type="button" onClick={() => setForm(toForm(blankRoute()))} className="h-11 px-5 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black">+ 노선 만들기</button>
        </div>
      </div>
      {msg && <div className="mb-3 rounded-xl bg-[#0F1A30] text-white px-4 py-2.5 text-[13px] font-bold">{msg}</div>}
      <GenProgressModal p={prog} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className={`${card} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-[#EEF1F6]"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="노선·거래처·기사 검색" className={`${inp} bg-[#F8FAFD]`} /></div>
          {!shown.length && <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">{routes.length ? "검색 결과가 없습니다" : "첫 고정노선을 만들어 보세요"}</div>}
          {shown.map((r) => {
            const on = r.id === selId;
            return (
              // ⭐ 2026-11-05 줄마다 운행 ON/OFF 스위치(줄 안에 버튼을 넣으려고 줄은 div)
              <div key={r.id} role="button" tabIndex={0} data-fr-row={r.id} onClick={() => setSelId(r.id)} onDoubleClick={() => setForm(toForm(r))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelId(r.id); } }}
                className={`w-full text-left px-4 py-3 border-b border-[#EEF1F6] transition cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#8FB0F0] ${on ? "bg-[#0F1A30] text-white" : "hover:bg-[#F5F8FD]"}`}>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: on ? "#8FB0F0" : r.color || "#2D4C82" }} />
                  <span className={`text-[14.5px] font-black truncate flex-1 ${r.active ? "" : "opacity-55"}`}>{r.name}</span>
                  {(r.days || []).includes(todayDay) && r.active && <span className={`text-[11px] font-black px-1.5 rounded ${on ? "bg-[#8FB0F0] text-[#0B1428]" : "bg-[#0F1A30] text-white"}`}>오늘</span>}
                  <OnOffSwitch on={!!r.active} dark={on} onChange={(v) => toggleActive(r, v)} />
                </div>
                <div className={r.active ? "" : "opacity-55"}>
                {/* ⭐ 2026-11-01 정류지별 운임 노선은 목록에서 바로 보이게(마우스를 올리면 정류지별 금액·지급방식) */}
                {routeTotals(r).perStop && <div className="mt-1 flex items-center gap-1.5 flex-wrap"><StopFareBadge r={r} on={on} /><span className={`text-[11.5px] font-bold tabular-nums ${on ? "text-white/75" : "text-[#5B6B85]"}`} style={{ fontFamily: MONO }}>청구 {won(routeTotals(r).client)} · 기사 {won(routeTotals(r).driver)}</span></div>}
                <div className={`mt-1 text-[12px] truncate ${on ? "text-white/70" : "text-[#5B6B85]"}`}>
                  {(r.stops || []).map((s) => s.name || s.addr).filter(Boolean).join(" → ")}
                </div>
                <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                  {DAYS.map((d) => <span key={d} className={`w-5 h-5 rounded text-[10.5px] font-black flex items-center justify-center ${(r.days || []).includes(d) ? (on ? "bg-white text-[#0F1A30]" : "bg-[#1B2B4B] text-white") : (on ? "text-white/30" : "text-[#C9D3E3]")}`}>{d}</span>)}
                  <span className={`ml-1.5 text-[12px] font-bold ${on ? "text-white/80" : "text-[#3A4A66]"}`}>{korTimeLabel(r.startTime)} · {r.driverName || "기사님 미배정"}{r.carNo ? ` (${r.carNo})` : ""}</span>
                </div>
                </div>
              </div>
            );
          })}
        </div>
        <div>
          {!sel ? (
            <div className={`${card} py-24 text-center`}>
              <div className="text-[15px] font-black text-[#0F1A30]">노선을 고르세요</div>
              <div className="text-[13px] text-[#7A89A3] mt-1">왼쪽 목록을 누르면 경로·일정·최근 배차가 보입니다 · 두 번 누르면 수정</div>
            </div>
          ) : (
            <div className={`${card} overflow-hidden`}>
              <div className="px-5 py-4 text-white flex items-center gap-2" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>ROUTE · {sel.client || "-"}</div>
                  <div className="text-[19px] font-black truncate">{sel.name}</div>
                </div>
                <span className="flex items-center gap-1.5 text-[12.5px] font-black text-white/80">운행<OnOffSwitch on={!!sel.active} dark onChange={(v) => toggleActive(sel, v)} /></span>
                <button type="button" onClick={() => setForm(toForm(sel))} className="h-9 px-3 rounded-xl bg-white text-[#0F1A30] text-[12.5px] font-black">수정</button>
                <button type="button" onClick={() => remove(sel)} className="h-9 px-3 rounded-xl bg-white/10 border border-white/20 text-[12.5px] font-black">삭제</button>
              </div>
              <div className="p-5 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-[12px] font-black text-[#7A89A3] mb-2">경로 {(sel.stops || []).length}곳</div>
                  <div className="relative pl-6">
                    <div className="absolute left-[9px] top-2 bottom-2 w-[2px] bg-[#DCE3EE]" />
                    {(sel.stops || []).map((s, i) => (
                      <div key={i} className="relative pb-3">
                        <span className={`absolute -left-[22px] top-0.5 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center ${i === 0 || i === sel.stops.length - 1 ? "bg-[#0F1A30] text-white" : "bg-white border-2 border-[#2D4C82] text-[#2D4C82]"}`}>{i + 1}</span>
                        <div className="text-[13.5px] font-black text-[#0F1A30]">{s.name || "-"} <span className="text-[11px] font-black px-1.5 py-0.5 rounded bg-[#EEF3FC] text-[#1B2B4B] ml-1">{s.type}</span><span className="ml-1 text-[11.5px] font-bold text-[#5B6B85]">{korTimeLabel(s.time)}</span></div>
                        <div className="text-[12px] text-[#5B6B85]">{s.addr}</div>
                        {s.memo && <div className="text-[11.5px] text-[#7A89A3]">{s.memo}</div>}
                        {i > 0 && stopPaid(s) && <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] flex-wrap">{(() => { const pc = payerOf(sel, { 거래처: String(s.client || "").trim() }); const other = pc !== routeClient(sel); return <span className={`h-5 px-1.5 inline-flex items-center rounded font-black ${other ? "bg-[#FFF3D6] text-[#7A5300]" : "bg-[#EEF2F8] text-[#1B2B4B]"}`} title="거래처(청구처)">{pc || "-"}</span>; })()}<span className="h-5 px-1.5 inline-flex items-center rounded bg-[#0F1A30] text-white font-black">{s.payMethod || sel.payMethod || "계산서"}</span><span className="font-bold text-[#1B2B4B] tabular-nums" style={{ fontFamily: MONO }}>청구 {won(s.fareClient)} · 기사 {won(s.fareDriver)}</span></div>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  {[["요일", (sel.days || []).join(" ") || "-"], ["출발", korTimeLabel(sel.startTime)], ["기간", `${sel.startDate || "-"} ~ ${sel.endDate || "계속"}`], ["기사", sel.driverName ? `${sel.driverName} · ${sel.carNo}` : "미배정"], ["차량", [sel.tonnage, sel.vehicleType].filter(Boolean).join(" ") || "-"], ["운임", (() => { const t = routeTotals(sel); return `${t.perStop ? "정류지별 합계 · " : ""}청구 ${won(t.client)} · 기사 ${won(t.driver)}`; })()], ["지급방식", (() => { const gs = routePayGroups(sel); return gs.length > 1 ? `${gs.map((G) => groupLabel(sel, G)).join(" · ")} (분리 ${gs.length}건)` : gs[0].pay; })()], ["운행", sel.active ? "ON" : "OFF(새 배차 안 만듦)"], ["자동 배차", sel.autoDispatch ? `켜짐${sel.genThrough ? ` · ${sel.genThrough}까지 만듦` : ""}` : "꺼짐"], ["기사님 수락", sel.autoAccept === false ? "매번 수락" : "자동 수락"]].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2 rounded-lg bg-[#F5F8FD] px-3 py-2"><span className="text-[12px] font-bold text-[#7A89A3]">{k}</span><span className="text-[13px] font-black text-[#0F1A30] text-right">{v}</span></div>
                  ))}
                </div>
                {routeTotals(sel).perStop && (
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-2 mb-2"><span className="text-[10.5px] font-extrabold tracking-[0.18em] text-[#2D4C82]" style={{ fontFamily: MONO }}>FARE · PER STOP</span><span className="text-[12px] font-black text-[#7A89A3]">정류지별 운임</span><StopFareBadge r={sel} /></div>
                    <FareTable r={sel} />
                  </div>
                )}
                <div className="md:col-span-2">
                  <div className="text-[12px] font-black text-[#7A89A3] mb-2">최근 배차</div>
                  {ordersOf(sel).length ? ordersOf(sel).map((o) => (
                    <div key={o._id} className="flex items-center gap-3 px-3 py-2 border-b border-[#EEF1F6] text-[12.5px]">
                      <span className="tabular-nums font-bold text-[#0F1A30] w-24" style={{ fontFamily: MONO }}>{o.상차일}</span>
                      <span className="flex-1 truncate text-[#3A4A66]">{o.상차지명} → {o.하차지명}</span>
                      {/* ⭐ 2026-11-01 오더별 지급방식·청구운임(지급방식 분리 오더도 한눈에) */}
                      <span className="hidden sm:inline-flex items-center gap-1 shrink-0">
                        {o.지급방식분리 && <span className="px-1.5 py-0.5 rounded bg-[#FFF3D6] text-[#7A5300] text-[10.5px] font-black">분리 {o.지급방식분리.순번}/{o.지급방식분리.전체}</span>}
                        <span className={`max-w-[120px] truncate px-1.5 py-0.5 rounded text-[10.5px] font-black ${o.거래처명 && norm(o.거래처명) !== norm(routeClient(sel)) ? "bg-[#FFF3D6] text-[#7A5300]" : "bg-[#EEF2F8] text-[#1B2B4B]"}`} title="거래처(청구처)">{o.거래처명 || "-"}</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#0F1A30] text-white text-[10.5px] font-black">{o.지급방식 || "-"}</span>
                        <span className="tabular-nums font-bold text-[#1B2B4B]" style={{ fontFamily: MONO }}>{won(o.청구운임)}</span>
                      </span>
                      <span className="font-bold text-[#1B2B4B]">{o.이름 || "미배정"}</span>
                      <span className="px-2 py-0.5 rounded-md bg-[#EEF3FC] text-[#1B2B4B] text-[11px] font-black">{o.배차상태}</span>
                    </div>
                  )) : <div className="text-[12.5px] text-[#9AA9C3]">아직 만들어진 배차가 없습니다 · 위의 [배차 미리 만들기]</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
