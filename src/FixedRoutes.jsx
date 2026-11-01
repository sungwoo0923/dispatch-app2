// ======================= src/FixedRoutes.jsx =======================
// 🛣 고정노선(지입차관리 › 고정노선) — 정해진 요일·시간에 같은 기사님이 항상 가는 노선
//
//  구조
//   fixedRoutes/{id}: { companyName, name, client, color, stops:[{ type, name, addr, time, contact, memo }],
//     days:["월",…], startTime, tonnage, vehicleType, fareClient, fareDriver, driverKey, driverName, carNo, phone,
//     startDate, endDate, autoDispatch, active, memo, updatedAt }
//   · 정류지는 1곳(단순 왕복)부터 근거리 여러 곳·거점까지 — 순서대로 상차 → 경유(거점) → 하차
//   · 배정 기사·요일·시간을 정하면, 그 요일마다 배차가 자동으로 만들어진다(오늘~7일 앞까지, 같은 날 중복 없음)
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
import { collection, doc, onSnapshot, query, where, addDoc, updateDoc, deleteDoc, setDoc, getDoc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { db, auth } from "./firebase";
import CustomDatePicker from "./CustomDatePicker";
import { CustomSelect } from "./CustomSelect";
import { TimeSelect, MultiDateSelect, korTimeLabel } from "./kpInputs";
import { useCompanyDropdownOptions } from "./companyDropdownOptions";
import RouteMapModal from "./RouteMapModal";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const STOP_TYPES = ["상차", "경유", "거점", "하차"];
const COLORS = ["#0F1A30", "#1B2B4B", "#2D4C82", "#4B6CB7", "#8FB0F0"];
const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const won = (n) => toInt(n).toLocaleString("ko-KR");
const kst = (offsetDays = 0) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
const dayOf = (ymd) => DAYS[(new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7];
const korTime = (hm) => { if (!hm) return ""; const [h, m] = hm.split(":").map(Number); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(m).padStart(2, "0")}`; };
const card = "rounded-[18px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_rgba(16,24,40,0.05)]";
const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15";
const lab = "flex items-center gap-1.5 text-[13px] font-black text-[#3A4A66] mb-1.5 whitespace-nowrap";
const norm = (v) => String(v || "").toLowerCase().replace(/\(주\)|㈜/g, "").replace(/\s+/g, "");
const placeKey = (name) => norm(name).replace(/[^\uAC00-\uD7A3a-z0-9]/gi, "");
const NewTag = () => <span className="inline-flex items-center h-5 px-1.5 rounded-md bg-[#0F1A30] text-white text-[10.5px] font-black tracking-wide">신규</span>;
const Step = ({ n, title, sub }) => (
  <div className="flex items-baseline gap-x-2.5 gap-y-0.5 mb-3.5 flex-wrap">
    <span className="text-[12px] font-black text-[#2D4C82] tracking-[0.14em]" style={{ fontFamily: MONO }}>STEP {n}</span>
    <span className="text-[17px] font-black text-[#0F1A30] whitespace-nowrap">{title}</span>
    {sub && <span className="text-[12.5px] font-semibold text-[#9AA9C3]">{sub}</span>}
  </div>
);

// 🔎 배차관리처럼 — 입력하면 등록된 거래처·상하차지가 바로 뜬다(↑↓ Enter)
function Suggest({ value, onChange, onPick, items, k, sub, placeholder, showAll = false }) {
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const q = norm(value);
  const list = q || showAll ? items.filter((x) => !q || norm(x[k]).includes(q)).sort((a, b) => (norm(a[k]).startsWith(q) ? 0 : 1) - (norm(b[k]).startsWith(q) ? 0 : 1)).slice(0, 10) : [];
  const pick = (x) => { onPick(x); setOpen(false); };
  return (
    <div className="relative flex-1 min-w-0">
      <input value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (!open || !list.length) return; if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); } else if (e.key === "Enter") { e.preventDefault(); pick(list[hi]); } }}
        placeholder={placeholder} className={inp} autoComplete="off" />
      {open && list.length > 0 && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 rounded-xl border border-[#DCE3EE] bg-white shadow-[0_18px_40px_rgba(15,26,48,.18)] overflow-hidden max-h-[300px] overflow-y-auto">
          {list.map((x, i) => (
            <button key={x.id || x._id || x[k] + i} type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(x)} onMouseEnter={() => setHi(i)}
              className={`w-full text-left px-3.5 py-2.5 border-b border-[#EEF1F6] last:border-0 ${i === hi ? "bg-[#EEF3FC]" : "bg-white"}`}>
              <div className="text-[14px] font-black text-[#0F1A30] truncate">{x[k]}</div>
              {sub(x) && <div className="text-[12px] text-[#7A89A3] truncate">{sub(x)}</div>}
            </button>
          ))}
        </div>
      )}
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
const blankStop = (type = "하차") => ({ type, name: "", addr: "", time: "", contact: "", memo: "", cargo: "", cargoType: "", tonVal: "", tonType: "", fareClient: "", fareDriver: "", payMethod: "" });
export const VEHICLE_TYPES_FR = ["라보", "다마스", "오토바이", "윙바디", "탑", "카고", "윙/카고", "냉장윙", "냉동윙", "냉장탑", "냉동탑", "냉장/냉동탑", "냉장/냉동윙", "리프트"];
const cargoText = (s) => (s.cargo ? `${s.cargo}${s.cargoType || ""}` : "");
const tonText = (s) => (s.tonVal ? `${s.tonVal}${s.tonType || "톤"}` : "");
// ⭐ 2026-11-01 정류지별 운임·지급방식 — 운임 모델을 하나로 정리
//  · "정류지별 운임" : 첫 정류지(상차)를 뺀 곳 중 한 곳이라도 청구·기사운임이 있으면. 노선 1회 운임 = 정류지 운임의 합계
//    (기본 청구·기사운임 칸은 잠기고 합계를 보여준다 · 저장할 때 fareMode:"stop", fareClient/fareDriver = 합계)
//  · "단일 운임"   : 정류지 운임이 하나도 없으면 기본 청구·기사운임 + 노선 지급방식(payMethod) 한 가지
//  · 정류지마다 지급방식(payMethod)을 고른다(운임이 있는 곳은 필수) — 정산·거래명세서가 오더의 지급방식으로 묶이므로
//    지급방식이 서로 다르면 배차를 "지급방식별로" 나눠 만든다(같은 차·같은 날, 대표 오더 + 분리 오더)
//  · 예전 노선(fareMode 없음)에 기본 운임과 정류지 운임이 같이 있으면 예전처럼 "기본 + 정류지" 합계(대표 오더에 기본 운임)
const namedStops = (r) => (r.stops || []).filter((s) => s.name || s.addr);
const stopPaid = (s) => !!(toInt(s.fareClient) || toInt(s.fareDriver));
export const routeSegments = (r) => namedStops(r).map((s, i) => ({ s, i })).filter(({ s, i }) => i > 0 && stopPaid(s)).map(({ s, i }) => ({ name: s.name || s.addr, 구분: s.type, 청구: toInt(s.fareClient), 기사: toInt(s.fareDriver), 지급방식: s.payMethod || "", 순번: i + 1 }));
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
// 지급방식별로 묶기 — 대표 그룹 = 마지막 운임 정류지(보통 하차지)가 속한 지급방식
export const routePayGroups = (r) => {
  const { seg, perStop, client, driver, legacyClient, legacyDriver } = routeTotals(r);
  const fallback = r.payMethod || "계산서"; // 예전 노선(지급방식 없음)은 예전처럼 계산서
  if (!perStop) return [{ pay: fallback, segs: [], client, driver }];
  const map = new Map();
  seg.forEach((g) => { const k = g.지급방식 || fallback; if (!map.has(k)) map.set(k, []); map.get(k).push(g); });
  const mainPay = seg[seg.length - 1].지급방식 || fallback;
  const keys = [mainPay, ...[...map.keys()].filter((k) => k !== mainPay)];
  return keys.map((pay, gi) => {
    const segs = map.get(pay);
    return { pay, segs, client: segs.reduce((a, g) => a + g.청구, 0) + (gi === 0 ? legacyClient : 0), driver: segs.reduce((a, g) => a + g.기사, 0) + (gi === 0 ? legacyDriver : 0) };
  });
};
const payKey = (p) => String(p || "").replace(/[\s/\\.#$[\]]/g, "_");
const blankRoute = () => ({ name: "", client: "", color: COLORS[2], stops: [blankStop("상차"), blankStop("하차")], days: ["월", "화", "수", "목", "금"], startTime: "", tonnage: "", vehicleType: "", fareClient: "", fareDriver: "", payMethod: "", driverKey: "", driverName: "", carNo: "", phone: "", startDate: kst(), endDate: "", skipDates: [], autoDispatch: true, autoAccept: true, active: true, memo: "" });

// ─── 배차 자동 생성 — 오늘부터 N일 앞까지, 노선·날짜마다 한 건(문서 번호 고정이라 여러 명이 동시에 열어도 중복 없음) ───
// ⭐ 2026-11-01 지급방식이 서로 다른 정류지가 있으면 지급방식별로 나눠 여러 건 — [0]이 대표 오더(fr_노선_날짜, 전체 경로)
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
  seg.forEach((g) => segOf.set(g.순번, payOfSeg(g)));
  const fareRow = (g) => ({ 이름: g.name, 구분: g.구분, 청구운임: g.청구, 기사운임: g.기사, 수수료: g.청구 - g.기사, 지급방식: payOfSeg(g) });
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
        업체명: s.name || "", 주소: s.addr || "", 담당자: "담당자", 담당자번호: s.contact || "", 메모: s.memo || "",
        화물내용: cargoText(s), 화물타입: s.cargoType || "", 화물수량: s.cargo || "", 톤수값: s.tonVal || "", 톤수타입: s.tonType || "", 차량톤수: tonText(s),
        상차일: dateKey === "상차일" ? date : "", 상차시간: timeKey === "상차시간" ? korTime(s.time) : "", 하차일: dateKey === "하차일" ? date : "", 하차시간: timeKey === "하차시간" ? korTime(s.time) : "", 방법: "",
        구분: s.type,
        // 이 오더에서 받는 운임만 금액을 싣고, 다른 지급방식(분리 오더) 정류지는 표시만
        ...(pay && inG.has(n) ? { 청구운임: toInt(s.fareClient), 기사운임: toInt(s.fareDriver), 지급방식: pay } : {}),
        ...(pay && !inG.has(n) ? { 지급방식: pay, 운임별도오더: `${pay} 분리 오더` } : {}),
      };
    };
    const pickVia = mid.filter((s) => s.type === "상차").map((s) => wp(s, "상차일", "상차시간"));
    const dropVia = mid.filter((s) => s.type !== "상차").map((s) => wp(s, "하차일", "하차시간"));
    const mainCargo = own.find((s) => s.cargo) || {};
    const rows = G.segs.map(fareRow);
    const memoFare = seg.length
      ? `정류지별 운임 ${seg.length}곳${split ? ` · 지급방식별 ${groups.length}건 중 ${gi + 1}(${G.pay}${rows.length ? `: ${rows.map((x) => x.이름).join(", ")}` : ""})` : ""}`
      : "";
    return {
      _id: isMain ? mainId : `${mainId}_${payKey(G.pay)}`,
      등록일: kst(), 상차일: date, 하차일: date,
      상차시간: korTime(first.time || r.startTime), 하차시간: korTime(last.time),
      거래처명: r.client || r.name || "",
      상차지명: first.name || "", 상차지주소: first.addr || "", 상차지담당자: "담당자", 상차지담당자번호: first.contact || "",
      하차지명: last.name || "", 하차지주소: last.addr || "", 하차지담당자: "담당자", 하차지담당자번호: last.contact || "",
      // 배차관리 등록폼과 같은 모양(목록 화면이 늘 배열이 있다고 본다)
      경유지_상차: pickVia, 경유상차목록: pickVia, 경유지_하차: dropVia, 경유하차목록: dropVia, 근무일자목록: [],
      차량톤수: r.tonnage || "", 톤수: r.tonnage || "", 차량종류: r.vehicleType || "",
      화물내용: cargoText(mainCargo), 화물타입: mainCargo.cargoType || "",
      청구운임: G.client, 기사운임: G.driver, 수수료: String(G.client - G.driver),
      // 정류지별 금액 — 구간운임(기사앱이 읽는 예전 모양)과 정류지운임(이름·구분·청구·기사·수수료·지급방식)
      구간운임: G.segs.map((g) => ({ name: g.name, 구분: g.구분, 청구: g.청구, 기사: g.기사, 지급방식: payOfSeg(g) })),
      정류지운임: rows,
      정류지별운임: seg.length, // 0이면 단일 운임 — 배차현황에서 "정류지별 운임" 표시에 쓴다
      정류지운임전체: split ? seg.map(fareRow) : [],
      지급방식분리: split ? { 순번: gi + 1, 전체: groups.length, 대표오더Id: mainId, 대표: isMain } : null,
      차량번호: r.carNo || "", 이름: r.driverName || "", 전화번호: r.phone || "",
      배차상태: hasDriver ? "배차완료" : "배차중",
      ...(hasDriver ? { 배차완료일시: Date.now(), 배차확정일시: serverTimestamp(), 배차확정자: "고정노선" } : {}),
      // 고정노선은 매번 수락할 필요 없이 바로 "수락" 상태로(노선에서 끌 수 있음)
      ...(auto ? { 기사확인상태: "수락", 기사확인일시: Date.now(), 자동수락: "고정노선" } : hasDriver ? { 기사확인상태: "대기", 배차상태: "승인대기" } : {}),
      배차방식: "고정기사", 지급방식: G.pay, 운행유형: "편도", 혼적여부: "독차",
      메모: [`[고정노선] ${r.name || ""}`, memoFare, !isMain ? "같은 차량·같은 운행(대표 오더와 함께)" : "", r.memo || ""].filter(Boolean).join(" · "),
      고정노선Id: r.id, 고정노선명: r.name || "",
      작성자: auth.currentUser?.email || "", 등록기기: "고정노선", createdAt: serverTimestamp(), _lastModified: Date.now(),
    };
  });
}
export const routeOrderFor = (r, date) => routeOrdersFor(r, date)[0] || null;
const genLock = { at: 0 };
export async function ensureFixedRouteOrders(routes, days = 7) {
  if (Date.now() - genLock.at < 60000) return 0; // 1분에 한 번만
  genLock.at = Date.now();
  let made = 0;
  for (const r of routes || []) {
    if (!r.active || !r.autoDispatch || !(r.days || []).length) continue;
    for (let i = 0; i <= days; i++) {
      const date = kst(i);
      if (r.startDate && date < r.startDate) continue;
      if (r.endDate && date > r.endDate) continue;
      if ((r.skipDates || []).includes(date)) continue;
      if (!(r.days || []).includes(dayOf(date))) continue;
      const list = routeOrdersFor(r, date);
      for (let k = 0; k < list.length; k++) {
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
              if (k > 0) continue;
              if (!(r.skipDates || []).includes(date)) {
                await updateDoc(doc(db, "fixedRoutes", r.id), { skipDates: arrayUnion(date) }).catch(() => {});
                r.skipDates = [...(r.skipDates || []), date];
              }
              break;
            }
            await setDoc(ref, o);
            made += 1;
            continue;
          }
          // 자동 수락 노선인데 서버가 "승인대기"로 바꿔 둔 예전 오더는 바로잡는다
          const d = ex.data() || {};
          if (o.기사확인상태 === "수락" && d.기사확인상태 === "대기" && d.차량번호 === o.차량번호 && d.배차상태 !== "배차취소") {
            await updateDoc(ref, { 기사확인상태: "수락", 기사확인일시: Date.now(), 자동수락: "고정노선", 배차상태: "배차완료", 상태: "배차완료" }).catch(() => {});
          }
        } catch { /* 권한·오프라인 — 다음에 다시 */ }
      }
    }
  }
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
const ROUTE_WRITE = [...ROUTE_KEYS, "상차지담당자번호", "하차지담당자번호", "경유지_상차", "경유상차목록", "경유지_하차", "경유하차목록", "톤수", "화물타입", "수수료", "구간운임", "정류지운임", "정류지별운임", "정류지운임전체", "지급방식분리", "이름", "전화번호", "메모", "고정노선명"];
const started = (d) => d.배차상태 === "배차취소" || d.상차완료 || d.상차완료일시 || d.상차지도착일시 || d.하차완료 || d.운송완료;
export async function syncFutureRouteOrders(oldR, newR, days = 7) {
  let n = 0;
  for (let i = 0; i <= days; i++) {
    const date = kst(i);
    const befores = routeOrdersFor(oldR, date);
    const afters = routeOrdersFor(newR, date);
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
    let done = false;
    const unsub = onSnapshot(query(collection(db, "fixedRoutes"), where("companyName", "==", company)), (s) => {
      if (done) return; done = true;
      ensureFixedRouteOrders(s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => {});
    }, () => {});
    return () => unsub();
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
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div id={id} className="min-w-0">
      <CustomSelect value={value || ""} onChange={(e) => onChange(e.target.value)}
        className={`${inp} ${compact ? "!h-10 !text-[13px]" : ""} ${error ? "!border-[#E5484D] !ring-2 !ring-[#E5484D]/20 !bg-[#FFF6F6] !text-[#C4262C]" : value ? "" : "!text-[#9AA9C3]"}`}>
        <option value="">지급방식 선택 *</option>
        {opts.map((v) => <option key={v} value={v}>{v}</option>)}
      </CustomSelect>
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
          <span className={`truncate font-black ${strong}`} title={g.name}><span className={`text-[10.5px] font-extrabold mr-1 ${dark ? "text-[#8FB0F0]" : "text-[#4B6CB7]"}`}>{String(g.순번).padStart(2, "0")} {g.구분}</span>{g.name}</span>
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
          <b className={strong}>지급방식이 달라 배차가 {groups.length}건으로 나뉘어 만들어집니다</b> — {groups.map((G) => `${G.pay} ${won(G.client)}원`).join(" / ")} · 같은 차량·같은 날 운행, 정산·거래명세서에서 지급방식별로 따로 잡힙니다
        </div>
      )}
    </div>
  );
}
// 목록·현황 배지 — "정류지별 운임 N곳" (마우스를 올리면 정류지별 금액·지급방식)
const fareTip = (r) => { const { seg, client, driver } = routeTotals(r); return [...seg.map((g) => `${g.구분} ${g.name} · ${g.지급방식 || r.payMethod || "지급방식 미선택"} · 청구 ${won(g.청구)} / 기사 ${won(g.기사)}`), `1회 합계 청구 ${won(client)} / 기사 ${won(driver)}`].join("\n"); };
function StopFareBadge({ r, on = false }) {
  const { seg } = routeTotals(r);
  if (!seg.length) return null;
  const split = routePayGroups(r).length > 1;
  return (
    <span title={fareTip(r)} className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-[10.5px] font-black whitespace-nowrap ${on ? "bg-[#8FB0F0] text-[#0B1428]" : "bg-[#EEF3FC] text-[#1B2B4B] border border-[#C9D6EE]"}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />정류지별 운임 {seg.length}곳{split ? " · 지급방식 분리" : ""}
    </span>
  );
}

export default function FixedRoutes({ drivers = [], companyName = "", dispatchData = [] }) {
  const co = String(companyName || "").trim();
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
    const u1 = onSnapshot(collection(db, "clients"), (s) => setClients(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => !c.companyName || c.companyName === co).filter((c) => c.거래처명 || c.id)), () => setClients([]));
    const u2 = onSnapshot(collection(db, "places"), (s) => setPlaces(s.docs.map((d) => ({ _id: d.id, ...d.data() })).filter((p) => (!p.companyName || p.companyName === co) && p.업체명)), () => setPlaces([]));
    return () => { u1(); u2(); };
  }, [co]);
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(query(collection(db, "fixedRoutes"), where("companyName", "==", co)), (s) => setRoutes(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))), () => setRoutes([]));
  }, [co]);
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2600); };
  const sel = routes.find((r) => r.id === selId) || null;
  const today = kst(); const todayDay = dayOf(today);
  const todayRuns = routes.filter((r) => r.active && (r.days || []).includes(todayDay) && !(r.skipDates || []).includes(today));
  const shown = routes.filter((r) => !q.trim() || `${r.name}${r.client}${r.driverName}${r.carNo}`.includes(q.trim()));
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const setStop = (i, patch) => setForm((p) => ({ ...p, stops: p.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const moveStop = (i, d) => setForm((p) => { const a = [...p.stops]; const j = i + d; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return { ...p, stops: a }; });
  const pickDriver = (key) => { const d = drivers.find((x) => x.id === key); setForm((p) => ({ ...p, driverKey: key, driverName: d?.이름 || "", carNo: d?.차량번호 && d.차량번호 !== "-" ? d.차량번호 : "", phone: d?.전화번호 && d.전화번호 !== "-" ? d.전화번호 : "", tonnage: d?.차량톤수 || p.tonnage || "", vehicleType: d?.차량종류 || p.vehicleType || "" })); };
  const [review, setReview] = React.useState(false);
  const askSave = () => {
    if (!form.name.trim()) return kpAlert("노선 이름을 입력해 주세요.");
    if (!(form.stops || []).some((s) => s.name.trim() || s.addr.trim())) return kpAlert("정류지를 한 곳 이상 입력해 주세요.");
    // ⭐ 2026-11-01 지급방식은 필수 — 빠진 칸을 빨갛게 표시하고 첫 칸으로 이동
    const fp = fareProblems(form);
    if (fp.miss.length || fp.legacy) {
      setTried(true);
      const names = fp.miss.map((i) => (i === "route" ? "기본 운임" : `${String(i + 1).padStart(2, "0")} ${form.stops[i]?.name || form.stops[i]?.type || ""}`));
      setTimeout(() => document.getElementById(fp.miss.length ? `fr-pay-${fp.miss[0]}` : "fr-legacy")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return kpAlert([fp.miss.length ? `지급방식을 골라 주세요.\n빠진 곳: ${names.join(", ")}` : "", fp.legacy ? "기본 운임과 정류지별 운임이 같이 들어 있습니다.\nSTEP 03에서 [하차지 운임에 합치기] 또는 [기본 운임 지우기]를 눌러 주세요." : ""].filter(Boolean).join("\n\n"));
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
  const applyCargoAll = () => {
    const src = (form.stops || []).find((s, i) => i > 0 && (s.cargo || s.tonVal)) || (form.stops || []).find((s) => s.cargo || s.tonVal);
    if (!src) return kpAlert("먼저 한 곳에 화물내용·톤수를 입력해 주세요.");
    setForm((p) => ({ ...p, stops: p.stops.map((s, i) => (i === 0 ? s : { ...s, cargo: src.cargo, cargoType: src.cargoType, tonVal: src.tonVal, tonType: src.tonType })) }));
  };
  const save = async () => {
    setBusy(true);
    try {
      const data = { ...form, companyName: co, stops: form.stops.filter((s) => s.name.trim() || s.addr.trim()), updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "" };
      delete data.id;
      // ⭐ 2026-11-01 정류지별 운임이면 기본 운임 칸 = 정류지 합계(목록·다른 화면이 fareClient를 읽어도 같은 값)
      const tt = routeTotals(data);
      if (tt.perStop) Object.assign(data, { fareMode: "stop", fareClient: String(tt.client), fareDriver: String(tt.driver) });
      else data.fareMode = "base";
      let id = form.id;
      if (id) await updateDoc(doc(db, "fixedRoutes", id), data);
      else { const ref = await addDoc(collection(db, "fixedRoutes"), { ...data, createdAt: serverTimestamp() }); id = ref.id; }
      // 신규 상하차지는 하차지 목록에도 등록(배차관리 자동완성에 바로 뜨도록)
      await Promise.all(data.stops.filter((st) => st.name.trim() && !places.some((p) => norm(p.업체명) === norm(st.name))).map((st) =>
        setDoc(doc(db, "places", placeKey(st.name) ? coDocKey(getTenant(), placeKey(st.name)) : `fr_${Date.now()}`), { 업체명: st.name.trim(), 주소: st.addr || "", 담당자번호: st.contact || "", 메모: st.memo || "", companyName: co }, { merge: true }).catch(() => {})));
      setForm(null); setReview(false); setSelId(id);
      // ⭐ 노선을 고치면 이미 만들어 둔 앞으로의 오더 중 "배차현황에서 따로 고치지 않은 것"에 같이 반영
      const prev = form.id ? routes.find((x) => x.id === form.id) : null;
      const synced = prev ? await syncFutureRouteOrders(prev, { ...data, id }) : 0;
      genLock.at = 0;
      const n = await ensureFixedRouteOrders([{ ...data, id }]);
      flash([n ? `배차 ${n}건을 미리 만들었습니다` : "", synced ? `앞으로의 배차 ${synced}건에 수정 내용을 반영했습니다` : ""].filter(Boolean).join(" · ") || "저장했습니다");
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
  const toggleActive = async (r) => { await updateDoc(doc(db, "fixedRoutes", r.id), { active: !r.active }); };
  const remove = async (r) => { if (await kpConfirm(`"${r.name}" 노선을 삭제할까요?\n이미 만들어진 배차는 그대로 남습니다.`)) { await deleteDoc(doc(db, "fixedRoutes", r.id)); setSelId(null); } };
  const genNow = async () => { genLock.at = 0; const n = await ensureFixedRouteOrders(routes); flash(n ? `배차 ${n}건을 만들었습니다(오늘~7일)` : "새로 만들 배차가 없습니다(이미 모두 있음)"); };
  const ordersOf = (r) => (dispatchData || []).filter((o) => o.고정노선Id === r.id).sort((a, b) => String(b.상차일).localeCompare(String(a.상차일))).slice(0, 8);

  // ───────────── 편집 화면 ─────────────
  if (form) {
    const stops = form.stops || [];
    const fp = fareProblems(form); const fareMiss = fp.miss;
    const clientNew = form.client.trim() && !clients.some((c) => norm(c.거래처명 || c.id) === norm(form.client));
    return (
      <div>
        <div className="relative overflow-hidden rounded-[22px] px-4 py-4 md:px-7 md:py-6 text-white flex items-center justify-between gap-4 flex-wrap mb-4"
          style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div>
            <div className="text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>FIXED ROUTE · {form.id ? "EDIT" : "NEW"}</div>
            <div className="text-[25px] font-black">{form.id ? "고정노선 수정" : "고정노선 만들기"}</div>
            <div className="mt-2 flex items-center gap-1.5 text-[12.5px] font-bold flex-wrap whitespace-nowrap">
              {["① 거래처·경로", "② 요일·시간", "③ 기사님·운임"].map((t, i) => <span key={t} className="flex items-center gap-1.5"><span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/15">{t}</span>{i < 2 && <span className="text-white/40">›</span>}</span>)}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" tabIndex={-1} onClick={() => setForm(null)} className="h-12 px-5 rounded-xl bg-white/10 border border-white/20 text-[14.5px] font-bold">취소</button>
            <button type="button" tabIndex={-1} onClick={askSave} disabled={busy} className="h-12 px-6 rounded-xl bg-white text-[#0F1A30] text-[15px] font-black disabled:opacity-50">저장</button>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className={`${card} p-5`}>
            <Step n="01" title="거래처 · 경로" sub="등록된 거래처·상하차지에서 고르거나 새로 입력" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
              <div><label className={lab}>노선 이름 *</label><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="예: 평택 물류센터 → 수원 3곳" className={inp} /></div>
              <div>
                <label className={lab}>거래처(청구처) {clientNew && <NewTag />}</label>
                <div className="flex gap-1.5">
                  <Suggest value={form.client} onChange={(v) => set("client", v)} items={clients} k="거래처명" sub={(c) => c.주소 || c.담당자 || ""} placeholder="거래처명 검색" onPick={(c) => set("client", c.거래처명 || c.id)} />
                  <button type="button" tabIndex={-1} onClick={() => setNewClient({ name: form.client.trim(), addr: "", manager: "", phone: "", email: "", memo: "", grade: "일반" })} className="h-11 px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-black text-[#1B2B4B] whitespace-nowrap hover:bg-[#F5F8FD]">+ 신규등록</button>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
              <div className="text-[15px] font-black text-[#0F1A30] whitespace-nowrap">정류지 <span className="text-[12.5px] font-semibold text-[#9AA9C3]">순서대로 · 1곳~여러 곳</span></div>
              <div className="flex gap-1.5 flex-wrap [&>button]:whitespace-nowrap">{stops.length > 2 && <button type="button" tabIndex={-1} onClick={applyCargoAll} className="h-9 px-3 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black" title="첫 하차지(또는 입력한 곳)의 화물내용·톤수를 모든 경유·거점·하차지에 똑같이">화물·톤수 일괄적용</button>}{["상차", "경유", "거점"].map((t) => <button tabIndex={-1} key={t} type="button" onClick={() => setForm((p) => { const a = [...p.stops]; a.splice(Math.max(0, a.length - 1), 0, blankStop(t)); return { ...p, stops: a }; })} className="h-9 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-black text-[#1B2B4B] hover:bg-[#F3F6FA]">+ {t}</button>)}</div>
            </div>
            <div className="relative">
              <div className="absolute left-[15px] md:left-[19px] top-5 bottom-5 w-[2px] bg-gradient-to-b from-[#0F1A30] via-[#C9D6EE] to-[#0F1A30]" />
              {stops.map((s, i) => {
                const isNew = (s.name || "").trim() && !places.some((p) => norm(p.업체명) === norm(s.name));
                return (
                  <div key={i} className="relative flex gap-2 md:gap-3 mb-3">
                    <span className={`relative z-[1] mt-3 w-8 h-8 md:w-10 md:h-10 shrink-0 rounded-full flex items-center justify-center text-[13px] font-black shadow ${i === 0 || i === stops.length - 1 ? "bg-[#0F1A30] text-white" : "bg-white border-2 border-[#2D4C82] text-[#2D4C82]"}`} style={{ fontFamily: MONO }}>{String(i + 1).padStart(2, "0")}</span>
                    <div className="flex-1 min-w-0 rounded-2xl border border-[#E3E8F0] bg-[#F8FAFD] p-2.5 md:p-3">
                      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                        <div className="inline-flex p-0.5 rounded-lg bg-white border border-[#E3E8F0]">
                          {STOP_TYPES.map((t) => <button tabIndex={-1} key={t} type="button" onClick={() => setStop(i, { type: t })} className={`h-8 px-3 rounded-md text-[12.5px] font-black ${s.type === t ? "bg-[#0F1A30] text-white" : "text-[#5B6B85]"}`}>{t}</button>)}
                        </div>
                        {isNew && <NewTag />}
                        <div className="ml-auto flex items-center gap-1.5">
                          <TimeSelect value={s.time} onChange={(v) => setStop(i, { time: v })} />
                          <button type="button" tabIndex={-1} onClick={() => moveStop(i, -1)} disabled={i === 0} className="w-9 h-9 rounded-lg border border-[#DCE3EE] bg-white text-[13px] disabled:opacity-30" aria-label="위로">↑</button>
                          <button type="button" tabIndex={-1} onClick={() => moveStop(i, 1)} disabled={i === stops.length - 1} className="w-9 h-9 rounded-lg border border-[#DCE3EE] bg-white text-[13px] disabled:opacity-30" aria-label="아래로">↓</button>
                          <button type="button" tabIndex={-1} onClick={() => setForm((p) => ({ ...p, stops: p.stops.filter((_, j) => j !== i) }))} disabled={stops.length <= 1} className="w-9 h-9 rounded-lg text-[#9AA9C3] hover:bg-white disabled:opacity-30" aria-label="정류지 삭제">✕</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
                        <Suggest value={s.name} onChange={(v) => setStop(i, { name: v })} items={places} k="업체명" sub={(p) => p.주소 || ""} placeholder={`${s.type}지 검색 (업체·장소명)`}
                          onPick={(p) => setStop(i, { name: p.업체명 || "", addr: p.주소 || s.addr, contact: p.담당자번호 || s.contact, memo: s.memo || p.메모 || "" })} />
                        <input value={s.addr} onChange={(e) => setStop(i, { addr: e.target.value })} placeholder="주소" className={inp} />
                        <input value={s.contact} onChange={(e) => setStop(i, { contact: e.target.value })} placeholder="연락처(선택)" className={inp} />
                        <input value={s.memo} onChange={(e) => setStop(i, { memo: e.target.value })} placeholder="메모(출입·하역 방법 등)" className={inp} />
                      </div>
                      <div className="grid gap-2 mt-2 grid-cols-2">
                        <div className="flex min-w-0">
                          <input value={s.cargo} onChange={(e) => setStop(i, { cargo: s.cargoType ? e.target.value.replace(/[^\d.]/g, "") : e.target.value })} placeholder={s.cargoType ? "수량" : "화물내용"} className={`${inp} !rounded-r-none min-w-0`} />
                          <CustomSelect value={s.cargoType || ""} onChange={(e) => setStop(i, { cargoType: e.target.value, cargo: e.target.value ? String(s.cargo || "").replace(/[^\d.]/g, "") : s.cargo })} className="h-11 w-[78px] shrink-0 px-2 rounded-r-xl bg-[#1B2B4B] text-white text-[12.5px] font-black">
                            <option value="">없음</option>{cargoTypes.map((v) => <option key={v} value={v}>{v}</option>)}
                          </CustomSelect>
                        </div>
                        <div className="flex min-w-0">
                          <input value={s.tonVal} onChange={(e) => setStop(i, { tonVal: e.target.value.replace(/[^\d.]/g, "") })} placeholder="톤수" inputMode="decimal" className={`${inp} !rounded-r-none min-w-0`} />
                          <CustomSelect value={s.tonType || ""} onChange={(e) => setStop(i, { tonType: e.target.value })} className="h-11 w-[70px] shrink-0 px-2 rounded-r-xl bg-[#1B2B4B] text-white text-[12.5px] font-black">
                            <option value="">없음</option>{tonTypes.map((v) => <option key={v} value={v}>{v}</option>)}
                          </CustomSelect>
                        </div>
                      </div>
                      {/* ⭐ 2026-11-01 이 곳 운임 — 청구·기사·지급방식(운임이 있으면 지급방식 필수) */}
                      {i > 0 && (() => {
                        const paid = stopPaid(s);
                        const err = tried && fareMiss.includes(i);
                        return (
                          <div className={`mt-2 rounded-xl border px-2.5 pt-2 pb-2.5 ${err ? "border-[#E5484D] bg-[#FFF6F6]" : paid ? "border-[#C9D6EE] bg-white" : "border-dashed border-[#DCE3EE] bg-white/60"}`}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[10.5px] font-extrabold tracking-[0.18em] text-[#2D4C82]" style={{ fontFamily: MONO }}>FARE</span>
                              <span className="text-[12.5px] font-black text-[#0F1A30]">이 곳 운임</span>
                              {paid ? <span className="ml-auto text-[11.5px] font-black text-[#5B6B85] tabular-nums" style={{ fontFamily: MONO }}>수수료 {won(toInt(s.fareClient) - toInt(s.fareDriver))}</span>
                                : <span className="ml-auto text-[11.5px] font-semibold text-[#9AA9C3]">없으면 비워 두세요</span>}
                            </div>
                            <div className="grid gap-2 grid-cols-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                              <input inputMode="numeric" value={s.fareClient ? won(s.fareClient) : ""} onChange={(e) => setStop(i, { fareClient: e.target.value.replace(/[^\d]/g, "") })} placeholder="청구운임" className={`${inp} !h-10 text-right tabular-nums`} style={{ fontFamily: MONO }} />
                              <input inputMode="numeric" value={s.fareDriver ? won(s.fareDriver) : ""} onChange={(e) => setStop(i, { fareDriver: e.target.value.replace(/[^\d]/g, "") })} placeholder="기사운임" className={`${inp} !h-10 text-right tabular-nums`} style={{ fontFamily: MONO }} />
                              <div className="col-span-2 md:col-span-1"><PaySelect id={`fr-pay-${i}`} compact value={s.payMethod} onChange={(v) => setStop(i, { payMethod: v })} options={payTypes} error={err} /></div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-[12.5px] text-[#7A89A3] mt-1">시간을 비우면 <b className="text-[#1B2B4B]">즉시</b>로 등록됩니다 · <NewTag /> 표시된 상하차지는 저장할 때 하차지 목록에 함께 등록됩니다</div>
          </div>
          <div className="space-y-4">
            <div className={`${card} p-5`}>
              <Step n="02" title="요일 · 시간 · 기간" />
              <div className="grid grid-cols-7 gap-1.5 mb-2.5">
                {DAYS.map((d) => { const on = (form.days || []).includes(d); return <button tabIndex={-1} key={d} type="button" onClick={() => set("days", on ? form.days.filter((x) => x !== d) : DAYS.filter((x) => x === d || (form.days || []).includes(x)))} className={`h-12 rounded-xl text-[15px] font-black transition ${on ? "bg-[#0F1A30] text-white shadow" : "bg-white border border-[#DCE3EE] text-[#5B6B85]"}`}>{d}</button>; })}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {[["평일", ["월", "화", "수", "목", "금"]], ["월~토", ["월", "화", "수", "목", "금", "토"]], ["매일", DAYS], ["월수금", ["월", "수", "금"]], ["화목", ["화", "목"]]].map(([l, ds]) => <button tabIndex={-1} key={l} type="button" onClick={() => set("days", ds)} className="h-9 px-3.5 rounded-lg bg-[#F3F6FA] text-[13px] font-bold text-[#3A4A66] hover:bg-[#EAF0F8]">{l}</button>)}
              </div>
              <div className="mb-3"><label className={lab}>출발(상차) 시간</label><TimeSelect value={form.startTime} onChange={(v) => set("startTime", v)} /></div>
              <div className="grid grid-cols-2 gap-2.5">
                <div><label className={lab}>시작일</label><CustomDatePicker value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={inp} showIcon /></div>
                <div><label className={lab}>종료일(선택)</label><CustomDatePicker value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className={inp} showIcon placeholder="계속" /></div>
              </div>
              <div className="mt-3">
                <label className={lab}>쉬는 날 <span className="font-semibold text-[#9AA9C3]">달력에서 여러 날을 눌러 고르세요</span></label>
                <MultiDateSelect value={form.skipDates || []} onChange={(v) => set("skipDates", v)} className={inp} placeholder="쉬는 날 고르기" />
                {(form.skipDates || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.skipDates.map((d) => <button tabIndex={-1} key={d} type="button" onClick={() => set("skipDates", form.skipDates.filter((x) => x !== d))} className="h-8 px-2.5 rounded-lg bg-[#EEF3FC] border border-[#C9D6EE] text-[12.5px] font-bold text-[#1B2B4B] tabular-nums" style={{ fontFamily: MONO }}>{d.slice(5).replace("-", ".")}({dayOf(d)}) ✕</button>)}
                  </div>
                )}
              </div>
            </div>
            <div className={`${card} p-5`}>
              <Step n="03" title="기사님 · 차량 · 운임" />
              <label className={lab}>배정 기사님(지입·직영)</label>
              <CustomSelect value={form.driverKey} onChange={(e) => pickDriver(e.target.value)} className={inp}>
                <option value="">미배정(배차중으로 생성)</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.이름} · {d.차량번호}{d.차량톤수 ? ` · ${d.차량톤수}` : ""}</option>)}
              </CustomSelect>
              <div className="grid grid-cols-2 gap-2.5 mt-2.5">
                <div><label className={lab}>톤수</label><input value={form.tonnage} onChange={(e) => set("tonnage", e.target.value)} placeholder="예: 5톤" className={inp} /></div>
                <div><label className={lab}>차량 종류</label><Suggest value={form.vehicleType} onChange={(v) => set("vehicleType", v)} items={VEHICLE_TYPES_FR.map((v) => ({ v }))} k="v" sub={() => ""} placeholder="입력 또는 선택" onPick={(x) => set("vehicleType", x.v)} showAll /></div>
              </div>
              {/* ⭐ 2026-11-01 운임 — 정류지별 운임이 있으면 기본 운임 칸은 잠기고 정류지 합계를 보여준다 */}
              {(() => {
                const t = routeTotals(fp.legacy ? { ...form, fareMode: "stop" } : form);
                const lock = fp.perStop && !fp.legacy;
                const fareInp = (k, label, val) => (
                  <div>
                    <label className={lab}>{label}{lock && <span className="ml-auto text-[10.5px] font-extrabold tracking-[0.12em] text-[#2D4C82]" style={{ fontFamily: MONO }}>AUTO</span>}</label>
                    <div className="relative">
                      <input inputMode="numeric" readOnly={lock} tabIndex={lock ? -1 : undefined} value={lock ? won(val) : form[k] ? won(form[k]) : ""} onChange={(e) => !lock && set(k, e.target.value.replace(/[^\d]/g, ""))}
                        className={`${inp} text-right tabular-nums ${lock ? "!bg-[#EEF3FC] !border-[#C9D6EE] !text-[#1B2B4B] cursor-not-allowed pl-8" : ""}`} style={{ fontFamily: MONO }} title={lock ? "정류지별 운임의 합계입니다 · 금액은 STEP 01 정류지에서 고치세요" : undefined} />
                      {lock && <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2D4C82]" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>}
                    </div>
                  </div>
                );
                return (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10.5px] font-extrabold tracking-[0.18em] text-[#2D4C82]" style={{ fontFamily: MONO }}>FARE</span>
                      {fp.perStop
                        ? <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-lg bg-[#0F1A30] text-white text-[12px] font-black"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB0F0]" />정류지별 운임 적용 중 · {t.seg.length}곳</span>
                        : <span className="inline-flex items-center h-6 px-2.5 rounded-lg bg-[#F3F6FA] border border-[#E3E8F0] text-[#3A4A66] text-[12px] font-black">단일 운임</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {fareInp("fareClient", "기본 청구운임(1회)", t.client)}
                      {fareInp("fareDriver", "기본 기사운임(1회)", t.driver)}
                    </div>
                    {fp.legacy && (
                      <div id="fr-legacy" className={`mt-2.5 rounded-xl border px-3.5 py-3 ${tried ? "border-[#E5484D] bg-[#FFF6F6]" : "border-[#F0C36D] bg-[#FFFAEE]"}`}>
                        <div className="text-[13px] font-black text-[#0F1A30]">기본 운임(청구 {won(form.fareClient)} · 기사 {won(form.fareDriver)})이 정류지별 운임과 따로 들어 있습니다</div>
                        <div className="text-[12.5px] text-[#5B6B85] mt-0.5">헷갈리지 않게 한 가지로 정리해 주세요 — 정류지별 운임을 쓰면 1회 운임은 정류지 금액의 합계입니다.</div>
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          <button type="button" onClick={() => resolveLegacy(true)} className="h-9 px-3 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black">하차지 운임에 합치기</button>
                          <button type="button" onClick={() => resolveLegacy(false)} className="h-9 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#1B2B4B]">기본 운임 지우기</button>
                        </div>
                      </div>
                    )}
                    {fp.perStop ? (
                      <div className="mt-2.5">
                        <FareTable r={fp.legacy ? { ...form, fareMode: "stop" } : form} />
                        <div className="mt-1.5 text-[12px] text-[#7A89A3]">금액·지급방식은 STEP 01 정류지에서 고치세요 · 배차에는 합계(청구·기사·수수료)와 정류지별 금액이 같이 들어갑니다</div>
                      </div>
                    ) : (
                      <>
                        <div className="mt-2.5"><label className={lab}>지급방식 {(toInt(form.fareClient) || toInt(form.fareDriver)) ? <span className="text-[#E5484D]">*</span> : null}</label>
                          <PaySelect id="fr-pay-route" value={form.payMethod} onChange={(v) => set("payMethod", v)} options={payTypes} error={tried && fareMiss.includes("route")} />
                        </div>
                        <div className="mt-2.5 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-4 py-3">
                          <div className="flex justify-between text-[14px] font-black text-[#0F1A30]"><span>1회 합계</span><span className="tabular-nums" style={{ fontFamily: MONO }}>청구 {won(t.client)} · 기사 {won(t.driver)}</span></div>
                          <div className="mt-1 text-[12.5px] text-[#5B6B85]">정류지마다 운임이 다르면 STEP 01 정류지의 "이 곳 운임"에 넣으세요 — 여기 칸은 자동 합계로 바뀝니다</div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
              {[["autoDispatch", "배차 자동 등록", "정해진 요일에 배차가 미리 생겨 배차현황·실시간배차현황·기사앱에 보입니다"],
                ["autoAccept", "기사님 수락 생략(자동 수락)", "고정노선은 매번 수락할 필요 없이 '수락' 상태로 들어갑니다 · 기사님은 운행만 하면 됩니다"]].map(([k, t, d]) => (
                <label key={k} className="mt-2.5 flex items-center justify-between gap-3 rounded-xl border border-[#E3E8F0] px-4 py-3 cursor-pointer hover:bg-[#F8FAFD]">
                  <span><span className="block text-[14px] font-black text-[#0F1A30]">{t}</span><span className="block text-[12.5px] text-[#7A89A3]">{d}</span></span>
                  <input type="checkbox" checked={form[k] !== false} onChange={(e) => set(k, e.target.checked)} className="w-5 h-5 accent-[#0F1A30]" />
                </label>
              ))}
              <textarea value={form.memo} onChange={(e) => set("memo", e.target.value)} rows={2} placeholder="노선 메모(기사님 전달사항으로도 들어갑니다)" className={`${inp} !h-auto py-2.5 mt-2.5`} />
            </div>
          </div>
        </div>
        {/* ⭐ 2026-10-31 입력을 마친 맨 아래에서 바로 저장·취소(위 머리줄까지 올라가지 않아도 된다) */}
        <div className="mt-4 flex gap-2 justify-end">
          <button type="button" tabIndex={-1} onClick={() => setForm(null)} className="h-12 px-6 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] font-bold text-[#3A4A66] flex-1 md:flex-none">취소</button>
          <button type="button" tabIndex={-1} onClick={askSave} disabled={busy} className="h-12 px-8 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50 flex-[2] md:flex-none">{form.id ? "수정 저장" : "고정노선 저장"}</button>
        </div>
        {review && (() => {
          const st = (form.stops || []).filter((x) => x.name.trim() || x.addr.trim());
          const t = routeTotals(form);
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
                            {(i > 0 && stopPaid(x)) ? <span className="ml-auto flex items-center gap-1.5"><span className="h-6 px-2 inline-flex items-center rounded-md bg-[#0F1A30] text-white text-[11.5px] font-black">{x.payMethod || "-"}</span><span className="text-[12.5px] font-black text-[#0B1428] tabular-nums" style={{ fontFamily: MONO }}>청구 {won(x.fareClient)} · 기사 {won(x.fareDriver)}</span></span> : null}
                          </div>
                          <div className="text-[13px] font-semibold text-[#3A4A66] mt-0.5">{x.addr || "-"}</div>
                          {(cargoText(x) || tonText(x) || x.contact || x.memo) && <div className="text-[12.5px] text-[#7A89A3] mt-0.5">{[cargoText(x) && `화물 ${cargoText(x)}`, tonText(x) && `톤수 ${tonText(x)}`, x.contact, x.memo].filter(Boolean).join(" · ")}</div>}
                        </div>
                      ))}
                    </div>
                    {t.seg.length > 0 && (
                      <div className="bg-white rounded-2xl border border-[#E3E8F0] p-4">
                        <div className="flex items-center gap-2 mb-2.5"><span className="text-[10.5px] font-extrabold tracking-[0.18em] text-[#2D4C82]" style={{ fontFamily: MONO }}>FARE · PER STOP</span><span className="text-[13.5px] font-black text-[#0F1A30]">정류지별 운임</span></div>
                        <FareTable r={form} />
                      </div>
                    )}
                    <div className="bg-white rounded-2xl border border-[#E3E8F0] p-4 text-[13.5px] text-[#3A4A66] space-y-1.5">
                      <div className="text-[13.5px] font-black text-[#0F1A30] mb-1">배차에 이렇게 들어갑니다</div>
                      <div>· 배차방식 <b className="text-[#0F1A30]">고정기사</b> · 배차상태 <b className="text-[#0F1A30]">{form.carNo ? (form.autoAccept !== false ? "배차완료(기사님 자동 수락)" : "승인대기(기사님 수락 필요)") : "배차중(기사 미배정)"}</b></div>
                      <div>· 상차 {first.name || "-"} → 하차 {last.name || "-"}{mid.length ? ` · 경유·거점 ${mid.length}곳` : ""}</div>
                      {t.seg.length ? (() => { const gs = routePayGroups(form); return (
                        <>
                          <div>· <b className="text-[#0F1A30]">정류지별 운임 {t.seg.length}곳</b> — 청구·기사운임·수수료는 합계로, 정류지별 금액·지급방식은 오더의 정류지운임·경유지·기사앱에 따로 들어갑니다</div>
                          {gs.length > 1
                            ? <div>· 지급방식이 달라 <b className="text-[#0F1A30]">하루 {gs.length}건</b>으로 나눠 만듭니다: {gs.map((G) => `${G.pay} 청구 ${won(G.client)}·기사 ${won(G.driver)}`).join(" / ")} (같은 차량·같은 운행)</div>
                            : <div>· 지급방식 <b className="text-[#0F1A30]">{gs[0].pay}</b></div>}
                        </>
                      ); })() : <div>· 단일 운임 · 지급방식 <b className="text-[#0F1A30]">{form.payMethod || "계산서"}</b></div>}
                      <div>· {form.autoDispatch !== false ? "정해진 요일마다 오늘부터 7일 앞까지 배차가 자동으로 생깁니다" : "자동 등록 꺼짐 — [배차 미리 만들기]로 만들 수 있습니다"}{(form.skipDates || []).length ? ` · 쉬는 날 ${form.skipDates.length}일 제외` : ""}</div>
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
          <button type="button" onClick={() => setForm(blankRoute())} className="h-11 px-5 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black">+ 노선 만들기</button>
        </div>
      </div>
      {msg && <div className="mb-3 rounded-xl bg-[#0F1A30] text-white px-4 py-2.5 text-[13px] font-bold">{msg}</div>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className={`${card} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-[#EEF1F6]"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="노선·거래처·기사 검색" className={`${inp} bg-[#F8FAFD]`} /></div>
          {!shown.length && <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">{routes.length ? "검색 결과가 없습니다" : "첫 고정노선을 만들어 보세요"}</div>}
          {shown.map((r) => {
            const on = r.id === selId;
            return (
              <button key={r.id} type="button" onClick={() => setSelId(r.id)} onDoubleClick={() => setForm({ ...blankRoute(), ...r })}
                className={`w-full text-left px-4 py-3 border-b border-[#EEF1F6] transition ${on ? "bg-[#0F1A30] text-white" : "hover:bg-[#F5F8FD]"} ${r.active ? "" : "opacity-55"}`}>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: on ? "#8FB0F0" : r.color || "#2D4C82" }} />
                  <span className="text-[14.5px] font-black truncate flex-1">{r.name}</span>
                  {!r.active && <span className={`text-[11px] font-black px-1.5 rounded ${on ? "bg-white/15" : "bg-[#EEF2F8] text-[#5B6B85]"}`}>중지</span>}
                  {(r.days || []).includes(todayDay) && r.active && <span className={`text-[11px] font-black px-1.5 rounded ${on ? "bg-[#8FB0F0] text-[#0B1428]" : "bg-[#0F1A30] text-white"}`}>오늘</span>}
                </div>
                {/* ⭐ 2026-11-01 정류지별 운임 노선은 목록에서 바로 보이게(마우스를 올리면 정류지별 금액·지급방식) */}
                {routeTotals(r).perStop && <div className="mt-1 flex items-center gap-1.5 flex-wrap"><StopFareBadge r={r} on={on} /><span className={`text-[11.5px] font-bold tabular-nums ${on ? "text-white/75" : "text-[#5B6B85]"}`} style={{ fontFamily: MONO }}>청구 {won(routeTotals(r).client)} · 기사 {won(routeTotals(r).driver)}</span></div>}
                <div className={`mt-1 text-[12px] truncate ${on ? "text-white/70" : "text-[#5B6B85]"}`}>
                  {(r.stops || []).map((s) => s.name || s.addr).filter(Boolean).join(" → ")}
                </div>
                <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                  {DAYS.map((d) => <span key={d} className={`w-5 h-5 rounded text-[10.5px] font-black flex items-center justify-center ${(r.days || []).includes(d) ? (on ? "bg-white text-[#0F1A30]" : "bg-[#1B2B4B] text-white") : (on ? "text-white/30" : "text-[#C9D3E3]")}`}>{d}</span>)}
                  <span className={`ml-1.5 text-[12px] font-bold ${on ? "text-white/80" : "text-[#3A4A66]"}`}>{korTimeLabel(r.startTime)} · {r.driverName || "기사님 미배정"}{r.carNo ? ` (${r.carNo})` : ""}</span>
                </div>
              </button>
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
                <button type="button" onClick={() => toggleActive(sel)} className="h-9 px-3 rounded-xl bg-white/10 border border-white/20 text-[12.5px] font-black">{sel.active ? "운행 중지" : "운행 재개"}</button>
                <button type="button" onClick={() => setForm({ ...blankRoute(), ...sel })} className="h-9 px-3 rounded-xl bg-white text-[#0F1A30] text-[12.5px] font-black">수정</button>
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
                        {i > 0 && stopPaid(s) && <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px]"><span className="h-5 px-1.5 inline-flex items-center rounded bg-[#0F1A30] text-white font-black">{s.payMethod || sel.payMethod || "계산서"}</span><span className="font-bold text-[#1B2B4B] tabular-nums" style={{ fontFamily: MONO }}>청구 {won(s.fareClient)} · 기사 {won(s.fareDriver)}</span></div>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  {[["요일", (sel.days || []).join(" ") || "-"], ["출발", korTimeLabel(sel.startTime)], ["기간", `${sel.startDate || "-"} ~ ${sel.endDate || "계속"}`], ["기사", sel.driverName ? `${sel.driverName} · ${sel.carNo}` : "미배정"], ["차량", [sel.tonnage, sel.vehicleType].filter(Boolean).join(" ") || "-"], ["운임", (() => { const t = routeTotals(sel); return `${t.perStop ? "정류지별 합계 · " : ""}청구 ${won(t.client)} · 기사 ${won(t.driver)}`; })()], ["지급방식", (() => { const gs = routePayGroups(sel); return gs.length > 1 ? `${gs.map((G) => G.pay).join(" · ")} (분리 ${gs.length}건)` : gs[0].pay; })()], ["자동 배차", sel.autoDispatch ? "켜짐" : "꺼짐"], ["기사님 수락", sel.autoAccept === false ? "매번 수락" : "자동 수락"]].map(([k, v]) => (
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
