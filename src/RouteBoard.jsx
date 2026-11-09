// ======================= src/RouteBoard.jsx =======================
// 📋 배차표(고정노선 › 배차표) — 2026-11-02
//  화주사가 구글시트로 주던 "날짜별 배차표"(예: 태진 삼다수 — 도착지·시군구·차량·리터별 수량·운송업체·입차시간)를
//  시트와 같은 모양으로 보고 입력한다. 업체마다 시트 모양이 달라서 화면을 코딩하지 않고 "양식"(routeBoards 문서)으로 정한다.
//
//  구조
//   routeBoards/{id}: { companyName, name, client(거래처명), dropOffset(하차일 = 상차일 + N일), payMethod,
//     groups:[{ name, 상차지명, 상차지주소, defaults:[{하차지명, 하차지주소}] }],
//     columns:[{ id, label, kind:"no"|"field"|"qty"|"sum"|"extra", field? }] }
//   · 배차표 한 줄 = 차 1대 = 보통 오더 1건(orders) → 배차관리(4/5파트)·정산·매출·기사앱이 그대로 쓴다.
//   · 오더에 남기는 것: 배차표Id·배차표명·배차표묶음·배차표순번, 품목수량{칸이름:수량}, 추가정보{칸이름:값}
//   · 배차관리에서 고친 차량·기사·시간도 이 화면에 그대로 보인다(같은 오더를 읽으므로).
import React from "react";
import { runDelete } from "./DeleteProgress"; // ⭐ 2026-11-05 삭제 진행 창 + 한 번에 삭제
import { createPortal } from "react-dom";
import { carrierFarePatch, mergedOrder, rateMapOf } from "../functions/carrierFareCore.mjs"; // 💸 2026-11-09 운송업체별 수수료율 → 기사운임 자동
import { collection, doc, getDoc, onSnapshot, query, where, getDocs, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db, auth, FUNCTIONS_BASE } from "./firebase";
import { parseBoardTab, sheetToForm, tabDate, planSheetWrite, nm as sheetNm, ownerOf, parseRateSheet, rateFor } from "./routeBoardSheet"; // ⭐ 2026-11-02 구글시트 날짜 탭 불러오기
import { coDocKey } from "./coKey";
import { deleteOrderWithLog } from "./orderHistory";
import CustomDatePicker from "./CustomDatePicker";
import { CustomSelect } from "./CustomSelect"; // ⭐ 2026-11-03 프로그램 공용 선택 목록(기본 select 대신)
import { kpConfirm, kpAlert } from "./kpDialog";
import { profileToBoardColumns } from "../functions/sheetProfileCore.mjs"; // 🔗 2026-11-07 시트 프로필 → 배차표 칸
import { useSheetProfiles, isOfficeFileError, sheetDemo } from "./sheetConnectApi";
import { boardTabFor, boardRowsFor, profileToBoardForm, monthPatternOf, sheetDayOf, isMonthBoard } from "../functions/routeBoardMonth.mjs"; // 📅 2026-11-07 월별 탭 · 한 탭 양식
import OfficeSheetCard from "./OfficeSheetCard";
import { headerField, normalizeBoardForm, marginRate, enumValue } from "../functions/boardHeaderMatch.mjs"; // 🔗 2026-11-08 머리줄 자동 대조(업체명=거래처명 …) · 매익율 계산 // 📗 2026-11-07 엑셀(xlsx) 파일 안내
const SheetConnectWizard = React.lazy(() => import("./SheetConnectWizard"));

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const kst = (offsetDays = 0) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dLabel = (ymd) => { const d = new Date(`${ymd}T00:00:00Z`); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${DAYS[d.getUTCDay()]})`; };
const toInt = (v) => parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10) || 0;
const norm = (v) => String(v || "").toLowerCase().replace(/\(주\)|㈜/g, "").replace(/\s+/g, "");
const placeKey = (name) => norm(name).replace(/[^가-힣a-z0-9]/gi, "");
const normPlate = (s = "") => String(s).replace(/\s+/g, "").toUpperCase();
const rid = () => Math.random().toString(36).slice(2, 10);
// "16:00" "16" "1600" "오후 4:00" → "16:00" (못 읽으면 "")
const parseHM = (v) => {
  const s = String(v || "").trim();
  if (!s) return "";
  let m = s.match(/(오전|오후)\s*(\d{1,2})(?::(\d{2}))?/);
  if (m) { let h = +m[2] % 12; if (m[1] === "오후") h += 12; return `${String(h).padStart(2, "0")}:${m[3] || "00"}`; }
  m = s.match(/^(\d{1,2})(?::|시\s*)?(\d{2})?분?$/) || s.match(/^(\d{2})(\d{2})$/);
  if (m && +m[1] < 24) return `${String(+m[1]).padStart(2, "0")}:${m[2] || "00"}`;
  return "";
};
const korTime = (hm) => { if (!hm) return ""; const [h, m] = hm.split(":").map(Number); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(m).padStart(2, "0")}`; };

// 칸 종류
const KINDS = [["field", "프로그램 칸"], ["qty", "수량"], ["sum", "합계(자동)"], ["extra", "참고(보관)"], ["no", "순번(자동)"], ["date", "날짜(월별 탭)"], ["calc", "자동 계산(수수료·매익율)"]];
const FIELDS = ["하차지명", "하차지주소", "차량번호", "이름", "전화번호", "상차시간", "하차시간", "메모", "거래처명", "청구운임", "기사운임", "화물내용", "차량톤수", "차량종류", "상차지명", "상차지주소", "배차상태", "지급방식", "배차방식"];
const CALC_OPTS = ["수수료", "매익율"];
const ENUM_F = new Set(["배차상태", "지급방식", "배차방식"]);
// 🔗 2026-11-08 자동 계산 칸 값(수수료 = 청구 − 기사 · 매익율 = 수수료 ÷ 청구, 청구운임이 없으면 빈칸)
const calcOf = (field, sale, drv) => { const a = toInt(sale); const b = toInt(drv); if (field === "매익율") return marginRate(a, b); return a || b ? (a - b).toLocaleString() : ""; };
const TIME_FIELDS = new Set(["상차시간", "하차시간"]);
const MONEY_FIELDS = new Set(["청구운임", "기사운임"]);
// 칸 이름으로 종류 추천(새 양식 만들 때)
const SYN = [
  [["구분", "번호", "no", "순번"], "no"], [["도착지", "하차지", "납품처", "하차지명"], "field", "하차지명"], [["시군구", "지역", "하차지주소", "주소"], "field", "하차지주소"],
  [["차량번호", "차번"], "field", "차량번호"], [["성명", "기사", "기사명", "이름"], "field", "이름"], [["휴대전화", "연락처", "전화번호", "핸드폰"], "field", "전화번호"],
  [["입차시간", "상차시간", "입차"], "field", "상차시간"], [["하차시간", "도착시간"], "field", "하차시간"], [["비고", "메모", "특이사항"], "field", "메모"],
  [["총계", "합계", "계"], "sum"], [["운임", "청구운임"], "field", "청구운임"], [["기사운임"], "field", "기사운임"],
];
export function guessKind(label) {
  const n = norm(label).replace(/[()]/g, "");
  if (/^\d+(\.\d+)?(l|ml|kg|박스|box)?$/i.test(n) || /\d+(\.\d+)?l/i.test(n)) return { kind: "qty" };
  const hit = SYN.find(([names]) => names.some((x) => n === norm(x)));
  if (hit) return { kind: hit[1], field: hit[2] };
  // 🔗 2026-11-08 동의어 사전(업체명 → 거래처명 · 기사님요금 → 기사운임 · 선/착불 → 지급방식 …)
  const f = headerField(label);
  if (f === "수수료" || f === "매익율") return { kind: "calc", field: f };
  if (f === "순번") return { kind: "no" };
  if (f && FIELDS.includes(f)) return { kind: "field", field: f };
  return { kind: "extra" };
}
const col = (label, kind, field) => ({ id: rid(), label, kind, ...(field ? { field } : {}) });
// 예시 양식(태진 삼다수 시트 모양)

// 🔗 2026-11-07 시트 프로필(연결 마법사 결과) → 새 배차표 양식(칸 · 날짜 칸 · 월별 탭/한 탭)
export const boardFromProfile = (p) => {
  const bf = profileToBoardForm(p, profileToBoardColumns(p, rid));
  return { ...BLANK(), name: p.name || "", sheetUrl: p.sheetUrl || "", sheetProfileId: p.id || "", dropOffset: 0, autoSync: false, columns: bf.columns, tabMode: bf.tabMode, tabPattern: bf.tabPattern, sheetTab: bf.sheetTab };
};
// ⭐ 2026-11-08 새 양식 기본 칸 = 우리 프로그램 배차현황 순서(예전엔 태진 삼다수 시트 모양 — 도착지·시군구·성명·휴대전화)
//  삼다수처럼 화주사 시트 모양이 따로 있으면 [구글시트에서 양식 만들기]가 시트 머리줄 그대로 칸을 만든다(SAMDASOO_COLS는 예시로 남김)
const PROGRAM_COLS = () => [col("상차시간", "field", "상차시간"), col("하차시간", "field", "하차시간"), col("거래처명", "field", "거래처명"), col("상차지명", "field", "상차지명"), col("상차지주소", "field", "상차지주소"), col("하차지명", "field", "하차지명"), col("하차지주소", "field", "하차지주소"),
  col("화물내용", "field", "화물내용"), col("차량종류", "field", "차량종류"), col("차량톤수", "field", "차량톤수"), col("차량번호", "field", "차량번호"), col("기사명", "field", "이름"), col("전화번호", "field", "전화번호"),
  col("배차상태", "field", "배차상태"), col("청구운임", "field", "청구운임"), col("기사운임", "field", "기사운임"), col("수수료", "calc", "수수료"), col("지급방식", "field", "지급방식"), col("배차방식", "field", "배차방식"), col("메모", "field", "메모")];
export const SAMDASOO_COLS = () => [col("도착지", "field", "하차지명"), col("시군구", "field", "하차지주소"), col("차량번호", "field", "차량번호"), col("성명", "field", "이름"), col("휴대전화", "field", "전화번호"), col("비고", "field", "메모")];
const BLANK = (cols = PROGRAM_COLS) => ({ name: "", client: "", dropOffset: 1, payMethod: "", groups: [{ name: "기본", 상차지명: "", 상차지주소: "", defaults: [] }], columns: cols() });

const card = "rounded-[18px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_rgba(16,24,40,0.05)]";
const inp = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
const btn = "h-10 px-4 rounded-xl text-[13.5px] font-black whitespace-nowrap disabled:opacity-40";
const colWidth = (c) => (c.kind === "no" ? 44 : c.kind === "qty" || c.kind === "sum" ? 64
  : c.field === "하차지명" ? 210 : c.field === "하차지주소" ? 150 : c.field === "메모" ? 150 : c.field === "차량번호" ? 120 : c.field === "전화번호" ? 122 : c.field === "이름" ? 76 : TIME_FIELDS.has(c.field) ? 76 : 96);

// ── 오더 ↔ 줄 ──────────────────────────────────────────────
function rowFromOrder(form, o) {
  const v = {};
  form.columns.forEach((c) => {
    if (c.kind === "field") v[c.id] = TIME_FIELDS.has(c.field) ? (parseHM(o[c.field]) || String(o[c.field] || "")) : String(o[c.field] ?? "");
    else if (c.kind === "qty") v[c.id] = o.품목수량?.[c.label] ? String(o.품목수량[c.label]) : "";
    else if (c.kind === "extra") v[c.id] = String(o.추가정보?.[c.label] ?? "");
    else if (c.kind === "calc") v[c.id] = calcOf(c.field, o.청구운임, o.기사운임);
  });
  return { key: o._id || o.id, _id: o._id || o.id, v, status: o.배차상태 || "", dirty: false, sheetGone: !!o.시트삭제됨, fare: o.청구운임 || "", fareManual: !!o.운임수동, extra: { 하차지담당자: o.하차지담당자, 하차지담당자번호: o.하차지담당자번호 } };
}
const rowEmpty = (form, r) => !form.columns.some((c) => c.kind !== "no" && c.kind !== "sum" && String(r.v[c.id] || "").trim());
const rowSum = (form, r) => form.columns.filter((c) => c.kind === "qty").reduce((a, c) => a + toInt(r.v[c.id]), 0);

function orderFromRow(form, g, r, i, date, co, isNew, prevStatus) {
  const rec = { 품목수량: {}, 추가정보: {} };
  form.columns.forEach((c) => {
    const val = String(r.v[c.id] ?? "").trim();
    if (c.kind === "field") rec[c.field] = TIME_FIELDS.has(c.field) ? (parseHM(val) ? korTime(parseHM(val)) : val) : MONEY_FIELDS.has(c.field) ? String(toInt(val) || "") : ENUM_F.has(c.field) ? enumValue(c.field, val) : val;
    else if (c.kind === "qty") { if (toInt(val)) rec.품목수량[c.label] = toInt(val); }
    else if (c.kind === "extra") { if (val) rec.추가정보[c.label] = val; }
  });
  const total = rowSum(form, r);
  if (!form.columns.some((c) => c.field === "화물내용")) {
    rec.화물내용 = Object.keys(rec.품목수량).length ? `${Object.entries(rec.품목수량).map(([k, n]) => `${k} ${n}`).join(" · ")} (총 ${total})` : "";
  }
  rec.화물수량 = total ? String(total) : "";
  if (!form.columns.some((c) => c.field === "거래처명")) rec.거래처명 = form.client || "";
  // ⭐ 2026-11-03 단가표 — 청구운임 칸이 따로 없으면 도착지 지역 × 파레트 합계로 자동(직접 고친 운임은 그대로 — 운임수동)
  if (!form.columns.some((c) => c.field === "청구운임") && form.rateTable?.length) {
    const rf = rateFor(form.rateTable, rec.하차지주소 || "", total);
    if (rf) Object.assign(rec, { 청구운임: String(rf.total), 단가표지역: rf.region, 파렛단가: rf.per });
  }
  // 배차표 청구운임 칸에 직접 넣은 값(비우면 다시 단가표 자동)
  if (r.fareOverride != null) {
    const n = toInt(r.fareOverride);
    if (n) Object.assign(rec, { 청구운임: String(n), 운임수동: true }); else rec.운임수동 = false;
  }
  if (rec.청구운임 || rec.기사운임) rec.수수료 = String(toInt(rec.청구운임) - toInt(rec.기사운임));
  rec.차량번호 = normPlate(rec.차량번호 || "") ? String(rec.차량번호).trim() : "";
  const keepStatus = prevStatus && !["배차중", "배차완료", ""].includes(prevStatus);
  return {
    ...rec,
    상차일: date, 하차일: addDays(date, toInt(form.dropOffset)),
    상차지명: rec.상차지명 || g.상차지명 || g.name || "", 상차지주소: rec.상차지주소 || g.상차지주소 || "", // 🔗 2026-11-08 시트에 상차지 칸이 있으면 그 값
    ...(r.extra?.하차지담당자 ? { 하차지담당자: r.extra.하차지담당자 } : {}),
    ...(r.extra?.하차지담당자번호 ? { 하차지담당자번호: r.extra.하차지담당자번호 } : {}),
    ...(form.payMethod ? { 지급방식: form.payMethod } : {}),
    ...(keepStatus ? {} : { 배차상태: rec.차량번호 ? "배차완료" : "배차중" }),
    배차표Id: form.id, 배차표명: form.name || "", 배차표묶음: g.name || "", 배차표순번: i + 1,
    companyName: co, _lastModified: Date.now(),
    ...(isNew ? {
      등록일: kst(), 작성자: auth.currentUser?.email || "", 등록기기: "배차표", createdAt: serverTimestamp(),
      경유지_상차: [], 경유상차목록: [], 경유지_하차: [], 경유하차목록: [], 근무일자목록: [], 운행유형: "편도", 혼적여부: "독차",
    } : {}),
  };
}

// ── 자동완성(등록된 거래처·상하차지·기사) — 고정노선과 같은 모양, 표 안에서도 잘리지 않게 화면 위에 띄운다 ──
//  "도외 목포"처럼 띄어 쓰면 첫 낱말은 이름, 나머지는 주소·담당자 등(sub)에서 찾는다. ↑↓ 이동 · Enter 선택 · Esc 닫기
export function BoardSuggest({ value, onChange, onPick, items, k, sub = () => "", placeholder, className, onKeyDown, onBlur, title = "거래처관리", inputProps = {} }) {
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const [pos, setPos] = React.useState(null);
  const inRef = React.useRef(null); const listRef = React.useRef(null);
  const toks = String(value || "").trim().toLowerCase().split(/\s+/).filter(Boolean).map(norm);
  const list = React.useMemo(() => {
    if (!toks.length) return items.slice(0, 30);
    const [f, ...rest] = toks;
    const whole = toks.join(""); // ⭐ 2026-11-03 "삼진 1"처럼 이름 자체에 띄어쓰기가 있는 경우도(붙여서 이름에서 찾기)
    return items.map((x) => {
      const n = norm(x[k]); const hay = n + norm(sub(x));
      let sc = n === f ? 3 : n.startsWith(f) ? 2 : n.includes(f) ? 1 : 0;
      if (!sc && rest.length && hay.includes(f)) sc = 0.5;
      if (!sc || !rest.every((t) => hay.includes(t))) {
        if (rest.length && n.includes(whole)) return { x, sc: n === whole ? 3 : n.startsWith(whole) ? 2 : 1 };
        return null;
      }
      return { x, sc };
    }).filter(Boolean).sort((a, b) => b.sc - a.sc || String(a.x[k] || "").localeCompare(String(b.x[k] || ""), "ko")).slice(0, 40).map((o) => o.x);
  }, [items, k, toks.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = React.useRef({ list, hi }); live.current = { list, hi };
  const show = open && list.length > 0;
  const place = React.useCallback(() => {
    const r = inRef.current?.getBoundingClientRect(); if (!r) return;
    const vh = window.innerHeight; const below = vh - r.bottom - 8; const above = r.top - 8; const up = below < 220 && above > below;
    const w = Math.min(Math.max(r.width, 340), window.innerWidth - 16);
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), width: w, top: up ? undefined : r.bottom + 4, bottom: up ? vh - r.top + 4 : undefined, maxH: Math.max(160, Math.min(340, up ? above : below)) });
  }, []);
  React.useLayoutEffect(() => {
    if (!show) return undefined;
    place(); window.addEventListener("scroll", place, true); window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [show, place]);
  React.useEffect(() => { if (hi >= list.length) setHi(Math.max(0, list.length - 1)); }, [list.length, hi]);
  React.useEffect(() => { if (show) listRef.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" }); }, [hi, show]);
  const pick = (x) => { if (!x) return; onPick(x); setOpen(false); };
  const onKey = (e) => {
    const key = e.key;
    if (!show) { if (key === "ArrowDown" && !onKeyDown && list.length) { e.preventDefault(); setOpen(true); setHi(0); return; } onKeyDown?.(e); return; }
    if (key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
    if (key === "Tab") { setOpen(false); return; }
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Enter") return;
    e.preventDefault();
    const composing = e.nativeEvent?.isComposing || e.keyCode === 229;
    const run = () => { const { list: L, hi: H } = live.current; if (!L.length) return;
      if (key === "ArrowDown") setHi(Math.min(L.length - 1, H + 1)); else if (key === "ArrowUp") setHi(Math.max(0, H - 1)); else pick(L[Math.min(H, L.length - 1)]); };
    if (composing) setTimeout(run, 30); else run();
  };
  return (
    <>
      <input ref={inRef} value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(!!String(value || "").trim())}
        onBlur={() => { setTimeout(() => setOpen(false), 150); onBlur?.(); }} onKeyDown={onKey} placeholder={placeholder} className={className} autoComplete="off"
        role="combobox" aria-expanded={show} aria-autocomplete="list" {...inputProps} />
      {show && pos && createPortal(
        <div onMouseDown={(e) => e.preventDefault()} className="fixed z-[2147483000] rounded-xl border border-[#1B2B4B]/25 bg-white shadow-[0_18px_44px_rgba(11,20,40,.28)] overflow-hidden flex flex-col"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}>
          <div className="shrink-0 flex items-center justify-between gap-2 px-3 h-8 bg-[#1B2B4B] text-white">
            <span className="text-[12px] font-black tracking-wide whitespace-nowrap">{title} · {list.length}{list.length >= 40 ? "+" : ""}건</span>
            <span className="min-w-0 truncate text-[11px] font-bold text-white/60 whitespace-nowrap">↑↓ 이동 · Enter 선택 · Esc 닫기</span>
          </div>
          <div ref={listRef} role="listbox" className="overflow-y-auto">
            {list.map((x, i) => { const on = i === hi; return (
              <button key={x.id || x._id || `${x[k]}_${i}`} data-i={i} role="option" aria-selected={on} type="button" tabIndex={-1} onClick={() => pick(x)} onMouseEnter={() => setHi(i)}
                className={`w-full text-left px-3.5 py-2 border-b last:border-0 ${on ? "bg-[#1B2B4B] border-[#1B2B4B]" : "bg-white border-[#EEF1F6] hover:bg-[#F3F6FB]"}`}>
                <div className={`text-[14px] font-black truncate ${on ? "text-white" : "text-[#0F1A30]"}`}>{x[k]}</div>
                {sub(x) && <div className={`text-[13px] font-semibold truncate ${on ? "text-white/75" : "text-[#7A89A3]"}`}>{sub(x)}</div>}
              </button>
            ); })}
          </div>
        </div>, document.body)}
    </>
  );
}
const placeSub = (p) => [p.주소, p.담당자 || (p.contacts || [])[0]?.name].filter(Boolean).join(" · ");

// ── 구글시트 읽기(서버 routeBoardSheet) ──────────────────────
const SERVICE_EMAIL = "dispatch-app-9b92f@appspot.gserviceaccount.com";
export async function sheetApi(body) {
  if (import.meta.env.DEV && sheetDemo()) { const { routeBoardFixture } = await import("./devSheetFixture.js"); await new Promise((r) => setTimeout(r, 200)); return routeBoardFixture(body); }
  const token = await auth.currentUser?.getIdToken();
  let res;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/routeBoardSheet`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` }, body: JSON.stringify(body) });
  } catch { throw new Error("서버 응답을 받지 못했습니다. 서버 배포 여부를 확인하거나 잠시 후 다시 시도해 주세요."); }
  let data = {};
  try { data = await res.json(); } catch { /* 무시 */ }
  if (!res.ok) throw Object.assign(new Error(data.error || `요청 실패 (${res.status})`), { code: data.code || "", help: data.help || "" });
  return data;
}
// 📗 2026-11-07 엑셀(xlsx) 파일 → 구글 시트로 변환(서버가 같은 폴더에 사본 · 원본 그대로). boardId면 양식 주소도 서버가 바꾼다
export const convertBoardSheet = (url, boardId = "") => sheetApi({ action: "convert", url, ...(boardId ? { boardId } : {}) });
// 그날 읽을 탭 — 월별 탭/한 탭 양식이면 routeBoardMonth 규칙, 아니면 날짜 이름 탭
export function boardTabOf(form, tabs, date) {
  if (form.fixedTab) return tabs.includes(form.fixedTab) ? form.fixedTab : "";
  const m = boardTabFor(form, tabs, date);
  if (m != null) return m;
  const y = +date.slice(0, 4);
  return tabs.find((t) => tabDate(t, y) === date) || tabs.find((t) => tabDate(t, y) === addDays(date, toInt(form.dropOffset))) || "";
}
const ShareNote = () => (
  <div className="text-[12.5px] text-[#7A8AA6] mt-1.5">시트 <b>공유</b>에 <code className="px-1.5 py-0.5 rounded bg-[#F3F6FA] text-[#1B2B4B]">{SERVICE_EMAIL}</code> 을(를) <b>뷰어</b>로 추가해 주세요.
    <button type="button" onClick={() => navigator.clipboard?.writeText(SERVICE_EMAIL)} className="ml-1.5 underline font-bold">복사</button></div>
);
// 날짜 탭 고르기 → 읽기 → 미리보기 → 배차표에 넣기
function SheetLoad({ form, date, onApply, onClose }) {
  const [tabs, setTabs] = React.useState(null);
  const [tab, setTab] = React.useState("");
  const [busy, setBusy] = React.useState("tabs");
  const [err, setErr] = React.useState("");
  const [res, setRes] = React.useState(null);
  React.useEffect(() => {
    sheetApi({ action: "tabs", url: form.sheetUrl }).then((d) => {
      setTabs(d.tabs);
      setTab(boardTabOf(form, d.tabs, date) || d.tabs[d.tabs.length - 1] || "");
    }).catch((e) => setErr(e.message)).finally(() => setBusy(""));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const read = async () => {
    setBusy("read"); setErr(""); setRes(null);
    try {
      const d = await sheetApi({ action: "read", url: form.sheetUrl, tab });
      const p = parseBoardTab(form, boardRowsFor(form, d.rows, date, tab)); // 월별 탭이면 그날 줄만
      if (!p.headers) throw new Error("이 탭에서 양식의 제목줄(칸 이름)을 찾지 못했습니다. 양식 칸 이름이 시트 제목과 같은지 확인해 주세요.");
      if (isMonthBoard(form)) p.date = date;
      setRes(p);
    } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };
  const total = res ? Object.values(res.groups).reduce((a, x) => a + x.length, 0) : 0;
  return (
    <div className="fixed inset-0 z-[90] bg-black/40 flex items-start justify-center overflow-auto p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${card} w-full max-w-[560px] my-10 p-6`}>
        <div className="text-[18px] font-black text-[#0F1A30] mb-1">구글시트에서 불러오기</div>
        <div className="text-[13px] text-[#7A8AA6] mb-4 break-all">{form.sheetUrl}</div>
        {tabs && (
          <div className="flex gap-2 mb-3">
            <CustomSelect value={tab} onChange={(e) => { setTab(e.target.value); setRes(null); }} className={inp}>
              {[...tabs].reverse().map((t) => <option key={t} value={t}>{t}</option>)}
            </CustomSelect>
            <button onClick={read} disabled={!!busy || !tab} className={`${btn} bg-[#0F1A30] text-white`}>{busy === "read" ? "읽는 중…" : "읽기"}</button>
          </div>
        )}
        {busy === "tabs" && <div className="text-[13.5px] text-[#7A8AA6]">탭 목록을 읽는 중…</div>}
        {err && (isOfficeFileError(err) ? <OfficeSheetCard className="mb-3" onConvert={() => convertBoardSheet(form.sheetUrl, form.id)} />
          : <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-semibold text-red-700 mb-3">{err}{/공유|열 수 없/.test(err) && <ShareNote />}</div>)}
        {res && (
          <div className="rounded-xl border border-[#E3E8F0] bg-[#F8FAFD] p-4 text-[13.5px] text-[#3A4A66] space-y-1.5">
            <div>찾은 표 <b>{res.headers}</b>개 · 차량 <b>{total}</b>줄</div>
            {form.groups.map((g) => <div key={g.name}>· {g.name}: {res.groups[g.name]?.length || 0}줄</div>)}
            {res.date && <div>시트에 적힌 첫 날짜: <b>{dLabel(res.date)}</b></div>}
            {res.missing.length > 0 && <div className="text-amber-700">시트에 없는 칸(비워 둠): {res.missing.join(", ")}</div>}
            <div className="text-[12.5px] text-[#7A8AA6] pt-1">넣으면 그 날짜의 배차표 줄이 시트 내용으로 바뀝니다. 확인 후 [저장]을 눌러야 오더에 반영됩니다.</div>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 mt-5">
          <button onClick={onClose} className={`${btn} text-[#5B6B85]`}>닫기</button>
          {res && total > 0 && res.date && res.date !== date && <button onClick={() => onApply(res, res.date)} className={`${btn} border border-[#DCE3EE] text-[#2D4C82]`}>상차 {dLabel(res.date)}(시트 날짜)에 넣기</button>}
          {res && total > 0 && <button onClick={() => onApply(res, date)} className={`${btn} bg-[#0F1A30] text-white`}>상차 {dLabel(date)}에 넣기</button>}
        </div>
      </div>
    </div>
  );
}

// 배차표 → 시트 보내기(미리보기 후 쓰기) — 도착지가 같은 줄에 차량·기사·수량·운송업체·시간·비고만 쓴다
function SheetSend({ form, date, rows, onClose, onDone }) {
  const [tabs, setTabs] = React.useState(null);
  const [tab, setTab] = React.useState("");
  const [busy, setBusy] = React.useState("tabs");
  const [err, setErr] = React.useState("");
  const [plan, setPlan] = React.useState(null);
  React.useEffect(() => {
    sheetApi({ action: "tabs", url: form.sheetUrl }).then((d) => {
      setTabs(d.tabs);
      if (d.office) setErr(Object.assign(new Error("office"), { code: "office-file" })); // 📗 엑셀 파일은 쓸 수 없음 → 안내 카드
      setTab(boardTabOf(form, d.tabs, date) || d.tabs[d.tabs.length - 1] || "");
    }).catch((e) => setErr(e)).finally(() => setBusy(""));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = async () => {
    setBusy("read"); setErr(""); setPlan(null);
    try {
      const d = await sheetApi({ action: "read", url: form.sheetUrl, tab });
      const board = {}; Object.entries(rows).forEach(([g, arr]) => { board[g] = arr.map((r) => r.v); });
      const p = planSheetWrite(form, boardRowsFor(form, d.rows, date, tab), board);
      if (!p.headers) throw new Error("이 탭에서 양식의 제목줄(칸 이름)을 찾지 못했습니다.");
      setPlan(p);
    } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };
  const write = async () => {
    if (!(await kpConfirm(`'${tab}' 탭에 ${plan.updates.length}칸을 씁니다. 진행할까요?`))) return;
    setBusy("write"); setErr("");
    try { const r = await sheetApi({ action: "write", url: form.sheetUrl, tab, updates: plan.updates.map(({ a1, value }) => ({ a1, value })) }); onDone(`시트 '${tab}' 탭에 ${r.updated}칸을 썼습니다.`); }
    catch (e) { setErr(isOfficeFileError(e) ? e : e.message); setBusy(""); }
  };
  return (
    <div className="fixed inset-0 z-[90] bg-black/40 flex items-start justify-center overflow-auto p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${card} w-full max-w-[640px] my-10 p-6`}>
        <div className="text-[18px] font-black text-[#0F1A30] mb-1">구글시트로 보내기</div>
        <div className="text-[13px] text-[#7A8AA6] mb-4">시트에서 <b>도착지가 같은 줄</b>을 찾아 차량번호·기사·수량·운송업체·시간·비고 칸만 씁니다. 도착지·시군구·총계 칸과 배차표에서 비어 있는 칸은 건드리지 않습니다.</div>
        {tabs && (
          <div className="flex gap-2 mb-3">
            <CustomSelect value={tab} onChange={(e) => { setTab(e.target.value); setPlan(null); }} className={inp}>{[...tabs].reverse().map((t) => <option key={t} value={t}>{t}</option>)}</CustomSelect>
            <button onClick={preview} disabled={!!busy || !tab} className={`${btn} border border-[#DCE3EE] text-[#2D4C82]`}>{busy === "read" ? "확인 중…" : "바뀔 칸 보기"}</button>
          </div>
        )}
        {busy === "tabs" && <div className="text-[13.5px] text-[#7A8AA6]">탭 목록을 읽는 중…</div>}
        {err && (isOfficeFileError(err) ? <OfficeSheetCard className="mb-3" onConvert={() => convertBoardSheet(form.sheetUrl, form.id)} />
          : <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-semibold text-red-700 mb-3">{err?.message || String(err)}</div>)}
        {plan && (
          <div className="rounded-xl border border-[#E3E8F0] bg-[#F8FAFD] p-4 text-[13px] text-[#3A4A66]">
            <div className="font-black text-[#0F1A30] mb-2">바뀔 칸 {plan.updates.length}개</div>
            <div className="max-h-[260px] overflow-auto space-y-0.5">
              {plan.updates.slice(0, 300).map((u) => <div key={u.a1}><span className="font-mono text-[#7A8AA6]">{u.a1}</span> {u.group} · {u.name} · <b>{u.label}</b>: <span className="text-[#9AA9C3] line-through">{u.old || "(빈칸)"}</span> → <b className="text-[#0F1A30]">{u.value}</b></div>)}
              {!plan.updates.length && <div className="text-[#7A8AA6]">시트와 배차표가 같습니다.</div>}
            </div>
            {plan.notFound.length > 0 && <div className="mt-3 text-amber-700"><b>시트에 같은 도착지 줄이 없음 {plan.notFound.length}건</b>(시트에 줄을 추가한 뒤 다시 보내 주세요): {plan.notFound.slice(0, 20).join(", ")}</div>}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className={`${btn} text-[#5B6B85]`}>닫기</button>
          {plan && plan.updates.length > 0 && <button onClick={write} disabled={!!busy} className={`${btn} bg-[#0F1A30] text-white`}>{busy === "write" ? "쓰는 중…" : `시트에 ${plan.updates.length}칸 쓰기`}</button>}
        </div>
      </div>
    </div>
  );
}

// ── 양식 편집 ──────────────────────────────────────────────
// 💰 단가표 올리기·보기 — 엑셀(청구단가표)을 올리면 지역 · 12PLT · 18PLT 파렛당 단가를 읽어 양식에 저장
function RateTableEditor({ table, name, onChange }) {
  const ref = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [err, setErr] = React.useState("");
  const load = async (file) => {
    if (!file) return; setErr("");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      let best = null;
      wb.SheetNames.forEach((sn) => { const r = parseRateSheet(XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: "" })); if (r.table?.length && (!best || r.table.length > best.length)) best = r.table; });
      if (!best) throw new Error("12PLT·18PLT 단가가 있는 표를 찾지 못했습니다.");
      onChange(best, file.name); setOpen(true);
    } catch (e) { setErr(e?.message || String(e)); }
  };
  const shown = table.filter((t) => !q.trim() || t.region.includes(q.trim()));
  const won = (n) => (n ? Number(n).toLocaleString() : "-");
  return (
    <div className="rounded-xl border border-[#E3E8F0] bg-[#F8FAFD] p-3 mb-6">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <div className="text-[13px] font-black text-[#3A4A66]">단가표(청구운임) {table.length ? <span className="ml-1 px-2 py-0.5 rounded-md bg-[#1B2B4B] text-white text-[11.5px]">{table.length}개 지역</span> : null}</div>
          <div className="text-[12px] text-[#7A8AA6] mt-0.5">파레트 합계 × 파렛당 단가 = 청구운임 · 18 이상은 18PLT 단가, 그 미만은 12PLT 단가 · 도착지 주소의 지역으로 찾음{name ? ` · ${name}` : ""}</div>
        </div>
        <button type="button" onClick={() => ref.current?.click()} className={`${btn} bg-[#2D4C82] text-white`}>{table.length ? "단가표 다시 올리기" : "단가표 엑셀 올리기"}</button>
        {table.length > 0 && <button type="button" onClick={() => setOpen((v) => !v)} className={`${btn} border border-[#DCE3EE] text-[#3A4A66]`}>{open ? "접기" : "보기"}</button>}
        {table.length > 0 && <button type="button" onClick={() => onChange([], "")} className={`${btn} text-red-500`}>지우기</button>}
        <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {err && <div className="mt-2 text-[13px] font-semibold text-red-600">{err}</div>}
      {open && table.length > 0 && (
        <div className="mt-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="지역 찾기" className="h-9 w-48 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[13px] mb-2 outline-none focus:border-[#2D4C82]" />
          <div className="max-h-[260px] overflow-auto rounded-lg border border-[#E3E8F0] bg-white">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-[#1B2B4B] text-white"><tr><th className="px-3 py-2 text-left">지역</th><th className="px-3 py-2">12PLT 파렛당</th><th className="px-3 py-2">12파렛 요금</th><th className="px-3 py-2">18PLT 파렛당</th><th className="px-3 py-2">18파렛 요금</th></tr></thead>
              <tbody className="divide-y divide-[#EEF1F6]">
                {shown.map((t, i) => (
                  <tr key={t.region + i}><td className="px-3 py-1.5 font-bold text-[#0F1A30]">{t.region}</td>
                    <td className="px-3 py-1.5 text-center tabular-nums">{won(t.r12)}</td><td className="px-3 py-1.5 text-center tabular-nums text-[#7A8AA6]">{t.r12 ? won(t.r12 * 12) : "-"}</td>
                    <td className="px-3 py-1.5 text-center tabular-nums">{won(t.r18)}</td><td className="px-3 py-1.5 text-center tabular-nums text-[#7A8AA6]">{t.r18 ? won(t.r18 * 18) : "-"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1.5 text-[12px] text-[#7A8AA6]">요금 칸은 확인용입니다(파렛당 × 12 / × 18). 금액이 단가표와 다르면 알려 주세요.</div>
        </div>
      )}
    </div>
  );
}

const isMasterUserRB = () => { try { return localStorage.getItem("role") === "totalMaster" || auth.currentUser?.email === "tjddnqkf@naver.com"; } catch { return false; } };
function FormEditor({ init, onClose, onSaved, co, clients = [], places = [] }) {
  const [f, setF] = React.useState(() => JSON.parse(JSON.stringify(init)));
  const [busy, setBusy] = React.useState(false);
  const [sheet, setSheet] = React.useState({ tabs: null, tab: "", busy: "", err: "", office: false }); // ⭐ 시트 제목줄로 칸 만들기
  const loadTabs = async (url = f.sheetUrl) => {
    if (!String(url || "").trim()) return kpAlert("구글시트 주소를 붙여넣어 주세요.");
    setSheet((s) => ({ ...s, busy: "tabs", err: "" }));
    try {
      const d = await sheetApi({ action: "tabs", url: url.trim() });
      const pick = (f.tabMode === "single" && d.tabs.includes(f.sheetTab) ? f.sheetTab : "") || d.tabs[d.tabs.length - 1] || "";
      setSheet({ tabs: d.tabs, tab: pick, busy: "", err: "", office: !!d.office, fileName: d.fileName || "" });
      if (f.tabMode === "monthly" && !f.tabPattern) { const pt = monthPatternOf(d.tabs); if (pt) setF((p) => ({ ...p, tabPattern: pt })); }
    } catch (e) { setSheet((s) => ({ ...s, busy: "", err: e.message, office: isOfficeFileError(e) })); }
  };
  // 📗 엑셀(xlsx) 파일 → 구글 시트로 변환 후 새 주소로(저장된 양식이면 서버가 양식 주소도 바꾼다)
  const onConverted = (r) => { if (!r?.url) return; setF((p) => ({ ...p, sheetUrl: r.url })); setSheet({ tabs: null, tab: "", busy: "", err: "", office: false }); setTimeout(() => loadTabs(r.url), 0); };
  const colsFromSheet = async () => {
    if (f.columns.length && !(await kpConfirm("지금 칸 설정을 시트 제목줄로 바꿀까요?"))) return;
    setSheet((s) => ({ ...s, busy: "read", err: "" }));
    try {
      const d = await sheetApi({ action: "read", url: f.sheetUrl.trim(), tab: sheet.tab });
      const g = sheetToForm(d.rows, guessKind);
      // 📅 월별 탭 시트(25년1월)면 날짜 칸을 날짜(월별 탭)로
      const mp = monthPatternOf(sheet.tabs || []);
      if (g && mp) { const dc = g.columns.find((c) => /^(날짜|일자|상차일|배차일|운행일|작업일)$/.test(String(c.label).replace(/\s/g, ""))); if (dc) Object.assign(dc, { kind: "date", role: "상차일", field: undefined }); }
      if (!g) throw new Error("이 탭에서 제목줄을 찾지 못했습니다.");
      setF((p) => ({ ...p, columns: g.columns, groups: g.groups.map((x) => p.groups.find((y) => y.name === x.name) || x),
        ...(mp && g.columns.some((c) => c.kind === "date") ? { tabMode: "monthly", tabPattern: mp } : {}) }));
      setSheet((s) => ({ ...s, busy: "" }));
    } catch (e) { setSheet((s) => ({ ...s, busy: "", err: e.message, office: s.office || isOfficeFileError(e) })); }
  };
  // 🔗 2026-11-07 시트 프로필(구글시트 연동)로 칸 만들기 — 시트 순서 · 이름 그대로, 프로그램 칸은 프로필 연결대로(만든 뒤 고칠 수 있음)
  const sheetProfiles = useSheetProfiles(co) || [];
  const [wiz, setWiz] = React.useState(false);
  const colsFromProfile = async (p) => {
    if (!p) return;
    if (f.columns.length && !(await kpConfirm(`지금 칸 설정을 '${p.name}' 칸으로 바꿀까요?`))) return;
    const bf = profileToBoardForm(p, profileToBoardColumns(p, rid)); // 📅 날짜 칸 · 월별 탭(25년1월) · 한 탭
    if (!bf.columns.some((c) => c.field === "하차지명")) kpAlert("이 시트에는 하차지명 칸이 없어요. 칸 하나를 하차지명으로 정해 주세요.");
    setF((x) => ({ ...x, columns: bf.columns, tabMode: bf.tabMode, tabPattern: bf.tabPattern, sheetTab: bf.sheetTab, name: x.name || p.name || "", sheetUrl: p.sheetUrl || x.sheetUrl || "", sheetProfileId: p.id || "" }));
  };
  const setCol = (i, patch) => setF((p) => ({ ...p, columns: p.columns.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const moveCol = (i, d) => setF((p) => { const a = [...p.columns]; const j = i + d; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return { ...p, columns: a }; });
  const setGroup = (i, patch) => setF((p) => ({ ...p, groups: p.groups.map((g, j) => (j === i ? { ...g, ...patch } : g)) }));
  const save = async () => {
    if (!f.name.trim()) return kpAlert("양식 이름을 입력해 주세요.");
    if (!f.columns.some((c) => c.kind === "field" && c.field === "하차지명")) return kpAlert("하차지명(도착지)으로 쓸 칸을 하나 정해 주세요.");
    const fs = f.columns.filter((c) => c.kind === "field").map((c) => c.field);
    const dup = fs.find((x, i) => fs.indexOf(x) !== i);
    if (dup) return kpAlert(`'${dup}' 칸이 두 번 연결돼 있습니다. 하나만 남겨 주세요.`);
    const labels = f.columns.map((c) => c.label.trim());
    if (labels.some((l) => !l)) return kpAlert("칸 이름이 빈 곳이 있습니다.");
    if (labels.some((l, i) => labels.indexOf(l) !== i)) return kpAlert("같은 칸 이름이 두 번 있습니다.");
    if (!f.groups.length || f.groups.some((g) => !g.name.trim())) return kpAlert("묶음(상차지) 이름을 입력해 주세요.");
    if ((f.tabMode === "monthly" || f.tabMode === "single") && !f.columns.some((c) => c.kind === "date")) return kpAlert("월별 탭 · 한 탭 시트는 날짜 칸이 있어야 해요. 날짜 칸 종류를 '날짜(월별 탭)'로 바꿔 주세요.");
    if (f.columns.filter((c) => c.kind === "date").length > 1) return kpAlert("날짜 칸은 하나만 정해 주세요.");
    setBusy(true);
    try {
      const data = { ...f, sheetUrl: String(f.sheetUrl || "").trim(), companyName: co, columns: f.columns.map((c) => JSON.parse(JSON.stringify({ ...c, label: c.label.trim() }))), updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "" };
      delete data.id;
      let id = f.id;
      if (id) await updateDoc(doc(db, "routeBoards", id), data);
      else id = (await addDoc(collection(db, "routeBoards"), { ...data, createdAt: serverTimestamp() })).id;
      onSaved(id);
    } catch (e) { kpAlert(`저장 실패: ${e?.message || e}`); } finally { setBusy(false); }
  };
  const fieldInp = "h-9 px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[13.5px] font-semibold outline-none focus:border-[#2D4C82]";
  return (
    <div className="fixed inset-0 z-[90] bg-black/40 flex items-start justify-center overflow-auto p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${card} w-full max-w-[980px] my-6 p-6`}>
        <div className="flex items-center gap-3 mb-5">
          <div className="text-[18px] font-black text-[#0F1A30] flex-1">{f.id ? "양식 수정" : "새 배차표 양식"}</div>

          <button onClick={onClose} className={`${btn} text-[#5B6B85]`}>닫기</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
          <label className="block"><span className="text-[12.5px] font-black text-[#3A4A66]">양식 이름</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inp} placeholder="예: ○○ 생수 배차표" /></label>
          <label className="block"><span className="text-[12.5px] font-black text-[#3A4A66]">거래처명(청구처)</span><BoardSuggest value={f.client} onChange={(v) => setF((p) => ({ ...p, client: v }))} onPick={(c) => setF((p) => ({ ...p, client: c.거래처명 }))}
            items={clients} k="거래처명" sub={(c) => [c.주소, c.담당자].filter(Boolean).join(" · ")} className={inp} placeholder="모든 줄에 같은 거래처" title="기본거래처" /></label>
          <label className="block"><span className="text-[12.5px] font-black text-[#3A4A66]">하차일</span>
            <CustomSelect value={f.dropOffset} onChange={(e) => setF({ ...f, dropOffset: +e.target.value })} className={inp}>
              <option value={0}>상차일과 같은 날</option><option value={1}>상차 다음 날</option><option value={2}>상차 이틀 뒤</option>
            </CustomSelect></label>
          <label className="block"><span className="text-[12.5px] font-black text-[#3A4A66]">지급방식(기본)</span><input value={f.payMethod} onChange={(e) => setF({ ...f, payMethod: e.target.value })} className={inp} placeholder="예: 계산서" /></label>
        </div>

        <div className="rounded-xl border border-[#E3E8F0] bg-[#F8FAFD] p-3 mb-6">
          <div className="text-[13px] font-black text-[#3A4A66] mb-1.5">화주사 구글시트(선택) — 넣어 두면 배차표에서 [시트 불러오기]로 날짜 탭을 바로 가져옵니다</div>
          <div className="flex flex-wrap gap-2">
            <input value={f.sheetUrl || ""} onChange={(e) => { setF({ ...f, sheetUrl: e.target.value }); setSheet({ tabs: null, tab: "", busy: "", err: "", office: false }); }} className={`${inp} flex-1 min-w-[240px]`} placeholder="https://docs.google.com/spreadsheets/d/…" />
            {!sheet.tabs ? <button type="button" onClick={() => loadTabs()} disabled={!!sheet.busy} className={`${btn} border border-[#DCE3EE] text-[#2D4C82]`}>{sheet.busy === "tabs" ? "여는 중…" : "시트 열기"}</button> : (
              <>
                <CustomSelect value={sheet.tab} onChange={(e) => setSheet((s) => ({ ...s, tab: e.target.value }))} className={`${inp} w-[160px]`}>{[...sheet.tabs].reverse().map((t) => <option key={t}>{t}</option>)}</CustomSelect>
                <button type="button" onClick={colsFromSheet} disabled={!!sheet.busy} className={`${btn} bg-[#2D4C82] text-white`}>{sheet.busy === "read" ? "읽는 중…" : "이 탭 제목줄로 칸 만들기"}</button>
              </>
            )}
          </div>
          {sheet.office ? <OfficeSheetCard className="mt-2.5" compact fileName={sheet.fileName} onConvert={() => convertBoardSheet(f.sheetUrl.trim(), f.id || "")} onConverted={onConverted} />
            : sheet.err && <div className="mt-2 text-[13px] font-semibold text-red-600">{sheet.err}</div>}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-black text-[#3A4A66]">시트 프로필로 칸 만들기</span>
            {sheetProfiles.filter((p) => p.engine !== "legacy-dolcae").length > 0 && (
              <CustomSelect value="" onChange={(e) => colsFromProfile(sheetProfiles.find((p) => p.id === e.target.value))} className={`${inp} w-[220px] h-9`}>
                <option value="">연결된 시트 고르기</option>
                {sheetProfiles.filter((p) => p.engine !== "legacy-dolcae").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </CustomSelect>
            )}
            <button type="button" onClick={() => setWiz(true)} className={`${btn} h-9 border border-[#DCE3EE] text-[#2D4C82]`}>구글시트 연결 마법사</button>
          </div>
          {wiz && <React.Suspense fallback={null}><SheetConnectWizard company={co} title="배차표 양식용 시트 연결" onClose={() => setWiz(false)} onSaved={(p) => { setWiz(false); colsFromProfile(p); }} /></React.Suspense>}
          <ShareNote />
          {/* ⭐ 2026-11-03 연결할 탭 — 보통은 날짜 이름 탭(26-11-03)을 날짜별로 자동, 테스트할 땐 고른 탭 하나만 */}
          {String(f.sheetUrl || "").trim() && (sheet.tabs || f.fixedTab) && isMasterUserRB() && ( /* ⭐ 테스트용 탭 고정은 최고관리자만 */
            <label className="mt-2.5 flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={!!f.fixedTab} onChange={(e) => setF((p) => ({ ...p, fixedTab: e.target.checked ? (sheet.tab || p.fixedTab || "") : "" }))} className="mt-0.5 w-[18px] h-[18px] accent-[#1B2B4B]" />
              <span className="text-[13px] text-[#3A4A66] leading-relaxed"><b className="text-[#0F1A30]">이 탭만 연결(테스트용)</b>
                {f.fixedTab ? <> — 지금 <b className="text-[#2D4C82]">'{f.fixedTab}'</b> 탭 하나만 읽고 씁니다.{sheet.tabs && sheet.tab && sheet.tab !== f.fixedTab && <button type="button" onClick={(e) => { e.preventDefault(); setF((p) => ({ ...p, fixedTab: sheet.tab })); }} className="ml-1.5 underline font-bold text-[#2D4C82]">'{sheet.tab}'(으)로 바꾸기</button>}</> : <> — 끄면 날짜 이름 탭(예: 26-11-03)을 날짜마다 자동으로 연결합니다. "26-11-03(테스트)"처럼 다른 글자가 붙은 탭은 날짜 탭으로 보지 않습니다.</>}
              </span>
            </label>
          )}
          {/* 📅 2026-11-07 탭 구조 — 날짜 칸(종류: 날짜)이 있으면 월별 탭(25년1월) · 탭 하나 시트도 날짜별로 */}
          {f.columns.some((c) => c.kind === "date") && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2" data-testid="board-tabmode">
              <span className="text-[13px] font-black text-[#3A4A66]">탭 구조</span>
              <CustomSelect value={f.tabMode || ""} onChange={(e) => { const v = e.target.value; setF((p) => ({ ...p, tabMode: v, tabPattern: v === "monthly" ? (p.tabPattern || monthPatternOf(sheet.tabs || [])) : null, sheetTab: v === "single" ? (p.sheetTab || sheet.tab || "") : "" })); }} className={`${inp} w-[200px] h-9`}>
                <option value="">날짜 탭(26-11-03)</option>
                <option value="monthly">월별 탭(25년1월)</option>
                <option value="single">탭 하나</option>
              </CustomSelect>
              {f.tabMode === "single" && (sheet.tabs
                ? <CustomSelect value={f.sheetTab || ""} onChange={(e) => setF((p) => ({ ...p, sheetTab: e.target.value }))} className={`${inp} w-[160px] h-9`}>{[...sheet.tabs].reverse().map((t) => <option key={t}>{t}</option>)}</CustomSelect>
                : <span className="text-[13px] font-bold text-[#2D4C82]">{f.sheetTab || "시트를 열어 탭을 골라 주세요"}</span>)}
              <span className="text-[12.5px] text-[#7A8AA6]">날짜 칸이 그날인 줄만 그날 배차표로 가져와요</span>
            </div>
          )}
          {String(f.sheetUrl || "").trim() && (
            <label className="mt-2.5 flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={f.autoSync !== false} onChange={(e) => setF((p) => ({ ...p, autoSync: e.target.checked }))} className="mt-0.5 w-[18px] h-[18px] accent-[#1B2B4B]" />
              <span className="text-[13px] text-[#3A4A66] leading-relaxed"><b className="text-[#0F1A30]">시트 자동 연동</b> — 10분마다 시트를 확인해 <b>새 날짜 탭·새 줄은 오더로 자동 생성</b>, 화주 칸(도착지·시군구·리터 수량 등)은 시트 값으로 맞추고, 시트에서 지운 줄은 표시만 합니다. 저장하면 운송사 칸(차량·운송업체·단가·입차시간)이 시트에 자동으로 써집니다.</span>
            </label>
          )}
        </div>

        <div className="text-[14px] font-black text-[#0F1A30] mb-2">칸(시트 제목줄 순서대로)</div>
        <div className="text-[12.5px] text-[#7A8AA6] mb-2">프로그램 칸 = 오더의 그 칸에 저장 · 수량 = 리터·박스 등 개수 · 합계 = 수량 합 자동 · 참고 = 오더에 그대로 보관(운송업체 등)<br />
          <b className="text-[#3A4A66]">입력</b> = 누가 채우는 칸인지 — <b>화주</b>: 업체가 시트에 입력(시트 값이 기준) · <b>운송사</b>: 우리가 프로그램에 입력(프로그램 값이 기준, 저장하면 시트에 써 줌)</div>
        <div className="space-y-1.5 mb-3">
          {f.columns.map((c, i) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-[12px] font-black text-[#9AA9C3] text-right">{i + 1}</span>
              <input value={c.label} onChange={(e) => { const g = guessKind(e.target.value); setCol(i, c.label ? { label: e.target.value } : { label: e.target.value, ...g }); }} className={`${fieldInp} w-[150px]`} placeholder="칸 이름" />
              <CustomSelect value={c.kind} onChange={(e) => setCol(i, { kind: e.target.value, field: e.target.value === "field" ? (FIELDS.includes(c.field) ? c.field : guessKind(c.label).field && FIELDS.includes(guessKind(c.label).field) ? guessKind(c.label).field : "메모") : e.target.value === "calc" ? (CALC_OPTS.includes(c.field) ? c.field : "수수료") : undefined, role: e.target.value === "date" ? (c.role || "상차일") : undefined })} className={`${fieldInp} w-[130px]`}>
                {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </CustomSelect>
              {c.kind === "field" && (
                <CustomSelect value={c.field || ""} onChange={(e) => setCol(i, { field: e.target.value })} className={`${fieldInp} w-[130px]`}>
                  {FIELDS.map((x) => <option key={x}>{x}</option>)}
                </CustomSelect>
              )}
              {c.kind === "calc" && (
                <CustomSelect value={c.field || "수수료"} onChange={(e) => setCol(i, { field: e.target.value })} className={`${fieldInp} w-[118px]`} title="프로그램이 계산(시트 값은 읽지도 쓰지도 않음)">
                  {CALC_OPTS.map((x) => <option key={x}>{x}</option>)}
                </CustomSelect>
              )}
              {c.kind === "date" && (
                <CustomSelect value={c.role || "상차일"} onChange={(e) => setCol(i, { role: e.target.value })} className={`${fieldInp} w-[118px]`} title="이 날짜는 상차일인가요 하차일인가요">
                  <option value="상차일">상차일</option>
                  <option value="하차일">하차일</option>
                </CustomSelect>
              )}
              {["field", "qty", "extra"].includes(c.kind) && (
                <CustomSelect value={ownerOf(c)} onChange={(e) => setCol(i, { owner: e.target.value })} className={`${fieldInp} w-[118px]`} title="이 칸은 누가 입력하나요">
                  <option value="화주">입력: 화주</option>
                  <option value="운송사">입력: 운송사</option>
                </CustomSelect>
              )}
              <button onClick={() => moveCol(i, -1)} className="h-9 w-8 rounded-lg border border-[#DCE3EE] text-[#5B6B85]">↑</button>
              <button onClick={() => moveCol(i, 1)} className="h-9 w-8 rounded-lg border border-[#DCE3EE] text-[#5B6B85]">↓</button>
              <button onClick={() => setF((p) => ({ ...p, columns: p.columns.filter((_, j) => j !== i) }))} className="h-9 px-2.5 rounded-lg text-[12.5px] font-bold text-red-500">삭제</button>
            </div>
          ))}
        </div>
        <button onClick={() => setF((p) => ({ ...p, columns: [...p.columns, col("", "extra")] }))} className={`${btn} border border-dashed border-[#B9C6DA] text-[#2D4C82] mb-6`}>＋ 칸 추가</button>

        {/* ⭐ 2026-11-03 단가표(청구운임) — 이 노선의 지역별 파렛당 단가(12PLT·18PLT) */}
        <RateTableEditor table={f.rateTable || []} name={f.rateTableName || ""} onChange={(rateTable, rateTableName) => setF((p) => ({ ...p, rateTable, rateTableName }))} />

        <div className="text-[14px] font-black text-[#0F1A30] mb-2">묶음(상차지별 표)</div>
        <div className="text-[12.5px] text-[#7A8AA6] mb-2">시트에서 "배차 내역(1센터)"처럼 나뉜 표마다 하나씩. 기본 도착지는 새 날짜를 열면 미리 채워지는 줄입니다(한 줄에 "도착지 / 시군구").</div>
        <div className="space-y-3 mb-4">
          {f.groups.map((g, i) => (
            <div key={i} className="rounded-xl border border-[#E3E8F0] p-3">
              <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_1.4fr_auto] gap-2 mb-2">
                <input value={g.name} onChange={(e) => setGroup(i, { name: e.target.value })} className={fieldInp} placeholder="묶음 이름(1센터)" />
                <BoardSuggest value={g.상차지명} onChange={(v) => setGroup(i, { 상차지명: v })} onPick={(p) => setGroup(i, { 상차지명: p.업체명, 상차지주소: p.주소 || g.상차지주소 })}
                  items={places} k="업체명" sub={placeSub} className={fieldInp} placeholder="상차지명(비우면 묶음 이름)" title="상하차지거래처" />
                <input value={g.상차지주소} onChange={(e) => setGroup(i, { 상차지주소: e.target.value })} className={fieldInp} placeholder="상차지 주소" />
                <button onClick={() => setF((p) => ({ ...p, groups: p.groups.filter((_, j) => j !== i) }))} className="h-9 px-2.5 rounded-lg text-[12.5px] font-bold text-red-500">삭제</button>
              </div>
              <textarea value={(g.defaults || []).map((d) => [d.하차지명, d.하차지주소].filter(Boolean).join(" / ")).join("\n")}
                onChange={(e) => setGroup(i, { defaults: e.target.value.split("\n").map((l) => { const [a, b] = l.split("/"); return { 하차지명: (a || "").trim(), 하차지주소: (b || "").trim() }; }).filter((d, k, arr) => d.하차지명 || k < arr.length - 1) })}
                rows={3} className="w-full px-2.5 py-2 rounded-lg border border-[#DCE3EE] text-[13px] outline-none focus:border-[#2D4C82]" placeholder={"광동온라인천일(용인) / 오산시\n광동온라인쿠팡(WF02화성) / 화성시"} />
            </div>
          ))}
        </div>
        <button onClick={() => setF((p) => ({ ...p, groups: [...p.groups, { name: "", 상차지명: "", 상차지주소: "", defaults: [] }] }))} className={`${btn} border border-dashed border-[#B9C6DA] text-[#2D4C82]`}>＋ 묶음 추가</button>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-[#EEF1F6]">
          <button onClick={onClose} className={`${btn} text-[#5B6B85]`}>취소</button>
          <button onClick={save} disabled={busy} className={`${btn} bg-[#0F1A30] text-white px-6`}>{busy ? "저장 중…" : "양식 저장"}</button>
        </div>
      </div>
    </div>
  );
}

// ── 배차표 화면 ────────────────────────────────────────────
export default function RouteBoard({ companyName = "" }) {
  const co = String(companyName || "").trim() || (sheetDemo() ? (new URLSearchParams(window.location.search).get("co") || "") : ""); // 개발 둘러보기(demo=1)는 주소의 co
  const [forms, setForms] = React.useState([]);
  const [formId, setFormId] = React.useState(() => { try { return localStorage.getItem("routeBoard:last") || ""; } catch { return ""; } });
  const [date, setDate] = React.useState(kst());
  const [orders, setOrders] = React.useState(null); // null = 읽는 중
  const [rows, setRows] = React.useState({}); // 묶음 이름 → [줄]
  const [removed, setRemoved] = React.useState([]); // 지울 오더 id
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [edit, setEdit] = React.useState(null);
  const [drivers, setDrivers] = React.useState([]);
  const [places, setPlaces] = React.useState([]);
  const [clients, setClients] = React.useState([]); // ⭐ 2026-11-03 양식 거래처명 자동완성
  const [msg, setMsg] = React.useState("");
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [sendOpen, setSendOpen] = React.useState(false); // ⭐ 배차표 → 시트 보내기
  const [pending, setPending] = React.useState(null); // { date, res } — 시트에서 읽은 줄(그 날짜 오더를 읽은 뒤 넣는다)
  // ⭐ 2026-11-03 구글시트 연동 — 시트에서 지워진 줄(gone: 줄 key) · 시트에 새로 생긴 줄(added: 묶음 → [값]) · 확인 시각·탭
  const [sheetDiff, setSheetDiff] = React.useState(null);
  const [sheetWiz, setSheetWiz] = React.useState(false); // 🔗 구글시트에서 양식 만들기
  const [keepKeys, setKeepKeys] = React.useState(() => new Set()); // [유지]를 누른 줄(이번 화면 동안 다시 묻지 않음)
  const tabsRef = React.useRef({ url: "", at: 0, tabs: [] });
  const form = forms.find((f) => f.id === formId) || null;

  React.useEffect(() => {
    if (!co) return undefined;
    const u1 = onSnapshot(query(collection(db, "routeBoards"), where("companyName", "==", co)), (s) => setForms(s.docs.map((d) => normalizeBoardForm({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))), () => setForms([]));
    const u2 = onSnapshot(collection(db, "drivers"), (s) => setDrivers(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.차량번호)), () => setDrivers([]));
    const u3 = onSnapshot(collection(db, "places"), (s) => setPlaces(s.docs.map((d) => ({ _id: d.id, ...d.data() })).filter((p) => (!p.companyName || p.companyName === co) && p.업체명)), () => setPlaces([]));
    const u4 = onSnapshot(collection(db, "clients"), (s) => setClients(s.docs.map((d) => { const c = { id: d.id, ...d.data() }; return { ...c, 거래처명: String(c.거래처명 || c.업체명 || "").trim() }; })
      .filter((c) => (!c.companyName || c.companyName === co) && c.거래처명).sort((a, b) => a.거래처명.localeCompare(b.거래처명, "ko"))), () => setClients([]));
    return () => { u1(); u2(); u3(); u4(); };
  }, [co]);
  React.useEffect(() => { if (!form && forms.length) setFormId(forms[0].id); }, [forms, form]);
  React.useEffect(() => { try { if (formId) localStorage.setItem("routeBoard:last", formId); } catch { /* 무시 */ } }, [formId]);

  // 그날 오더 구독
  React.useEffect(() => {
    if (!form) return undefined;
    setOrders(null); setDirty(false); setRemoved([]);
    return onSnapshot(query(collection(db, "orders"), where("배차표Id", "==", form.id), where("상차일", "==", date)),
      (s) => setOrders(s.docs.map((d) => ({ _id: d.id, ...d.data() })).filter((o) => o.companyName === co || !o.companyName)), () => setOrders([]));
  }, [form?.id, date, co]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildRows = React.useCallback((list, fromDefaults) => {
    const out = {};
    form.groups.forEach((g) => { out[g.name] = []; });
    if (list.length) {
      [...list].sort((a, b) => (a.배차표순번 || 0) - (b.배차표순번 || 0)).forEach((o) => {
        const gname = out[o.배차표묶음] ? o.배차표묶음 : form.groups[0]?.name;
        out[gname].push(rowFromOrder(form, o));
      });
    } else if (fromDefaults) {
      const cN = form.columns.find((c) => c.field === "하차지명"); const cA = form.columns.find((c) => c.field === "하차지주소");
      form.groups.forEach((g) => { out[g.name] = (g.defaults || []).filter((d) => d.하차지명).map((d) => {
        const p = findPlace(d.하차지명, d.하차지주소);
        return { key: rid(), v: { ...(cN ? { [cN.id]: d.하차지명 } : {}), ...(cA ? { [cA.id]: p?.주소 || d.하차지주소 } : {}) }, dirty: true, extra: placeContact(p) };
      }); });
    }
    return out;
  }, [form, places]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!form || orders === null) return;
    if (pending && pending.date === date) { // ⭐ 시트에서 불러온 줄 넣기(그 날짜 기존 줄은 저장할 때 지움)
      const built = {};
      form.groups.forEach((g) => { built[g.name] = (pending.res.groups[g.name] || []).map(enrich); });
      setRows(built); setRemoved(orders.map((o) => o._id)); setDirty(true); setPending(null);
      setMsg(`시트에서 ${Object.values(built).flat().length}줄을 불러왔습니다. 확인 후 [저장]을 눌러 주세요.`);
      return;
    }
    if (dirty) return;
    setRows(buildRows(orders, true));
  }, [orders, form, dirty, pending]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⭐ 2026-11-03 같은 이름이 여러 곳(주소만 다름)이면 주소 힌트(시군구 등)로 고르고, 못 고르면 비워 둔다(엉뚱한 주소로 바꾸지 않게)
  const findPlace = (name, addrHint = "") => {
    const k = norm(name); if (!k) return null;
    const m = places.filter((p) => norm(p.업체명) === k);
    if (m.length <= 1) return m[0] || null;
    const h = norm(addrHint); if (!h) return null;
    return m.find((p) => norm(p.주소) === h) || m.find((p) => norm(p.주소).includes(h)) || null;
  };
  const placeContact = (p) => {
    if (!p) return {};
    const c = (p.contacts || []).find((x) => x.isPrimary) || (p.contacts || [])[0];
    return { 하차지담당자: c?.name || p.담당자 || "", 하차지담당자번호: c?.phone || p.담당자번호 || "" };
  };
  const findDriver = (plate) => {
    const p = normPlate(plate);
    if (!p) return null;
    const exact = drivers.find((d) => normPlate(d.차량번호) === p);
    if (exact) return exact;
    if (/^\d{4}$/.test(p)) { const m = drivers.filter((d) => normPlate(d.차량번호).endsWith(p)); return m.length === 1 ? m[0] : null; }
    return null;
  };

  // ⭐ 2026-11-03 저장 안 한 줄이 있을 때 날짜·양식을 바꾸면 말없이 사라지던 문제 — 먼저 묻는다
  const guard = async (go) => { if (dirty && !(await kpConfirm("저장하지 않은 내용이 있습니다.\n저장하지 않고 이동할까요?"))) return; go(); };
  const colOf = (field) => form?.columns.find((c) => c.kind === "field" && c.field === field);
  // ⭐ 2026-11-03 청구운임 칸(시트엔 없고 프로그램에만) — 리터·파레트 수를 넣는 즉시 단가표로 계산해 보여 준다
  const showFare = !!form && !form.columns.some((c) => c.kind === "field" && c.field === "청구운임");
  const fareInfo = (r) => {
    if (r.fareOverride != null && r.fareOverride !== "") return { n: toInt(r.fareOverride), src: "직접" };
    if (r.fareManual && toInt(r.fare)) return { n: toInt(r.fare), src: "직접" };
    const cA = colOf("하차지주소");
    const rf = form?.rateTable?.length ? rateFor(form.rateTable, cA ? r.v[cA.id] : "", rowSum(form, r)) : null;
    if (rf) return { n: rf.total, src: "단가표", title: `${rf.region} · 파렛당 ${rf.per.toLocaleString()}원 × ${rf.pallets}` };
    return { n: toInt(r.fare), src: toInt(r.fare) ? "" : "없음" };
  };
  const setFare = (g, i, val) => { setDirty(true); setRows((p) => ({ ...p, [g]: p[g].map((x, j) => (j === i ? { ...x, fareOverride: String(val).replace(/[^\d]/g, ""), dirty: true } : x)) })); };
  // 시트에서 온 줄 — 등록된 하차지는 풀주소·담당자, 기사관리에 있는 차량은 이름·전화번호 채우기
  const enrich = (v0) => {
    const v = { ...v0 }; let extra = {};
    const cN = colOf("하차지명"), cA = colOf("하차지주소"), cP = colOf("차량번호"), cNm = colOf("이름"), cPh = colOf("전화번호");
    const p = cN ? findPlace(v[cN.id], cA ? v[cA.id] : "") : null;
    if (p) { if (cA && p.주소) v[cA.id] = p.주소; extra = placeContact(p); }
    const d = cP ? findDriver(v[cP.id]) : null;
    if (d) { v[cP.id] = d.차량번호; if (cNm && !v[cNm.id]) v[cNm.id] = d.이름 || ""; if (cPh && !v[cPh.id]) v[cPh.id] = d.전화번호 || ""; }
    return { key: rid(), v, dirty: true, extra };
  };
  const applySheet = async (res, d0) => {
    if (dirty && d0 === date && !(await kpConfirm("저장하지 않은 내용이 있습니다. 시트 내용으로 바꿀까요?"))) return;
    setSheetOpen(false);
    setPending({ date: d0, res });
    if (d0 !== date) setDate(d0);
  };
  const setCell = (g, i, c, val) => {
    setDirty(true);
    setRows((p) => ({ ...p, [g]: p[g].map((r, j) => (j === i ? { ...r, v: { ...r.v, [c.id]: val }, dirty: true, touched: [...new Set([...(r.touched || []), c.id])] } : r)) })); // touched: 직접 고친 칸
  };
  // 칸에서 나갈 때 — 도착지는 등록된 하차지 풀주소, 차량번호는 기사관리의 이름·전화번호
  const onLeave = (g, i, c) => {
    const r = rows[g]?.[i]; if (!r) return;
    const val = r.v[c.id];
    if (c.field === "하차지명") {
      const cA = colOf("하차지주소"); const p = findPlace(val, cA ? r.v[cA.id] : "");
      if (p && !(cA && r.v[cA.id] === p.주소)) setRows((s) => ({ ...s, [g]: s[g].map((x, j) => (j === i ? { ...x, v: { ...x.v, ...(cA && p.주소 ? { [cA.id]: p.주소 } : {}) }, extra: placeContact(p), dirty: true } : x)) }));
    }
    if (c.field === "차량번호") {
      const d = findDriver(val); if (!d) return;
      const cN = colOf("이름"); const cP = colOf("전화번호");
      setRows((s) => ({ ...s, [g]: s[g].map((x, j) => (j === i ? { ...x, dirty: true, v: { ...x.v, [c.id]: d.차량번호,
        ...(cN && !String(x.v[cN.id] || "").trim() ? { [cN.id]: d.이름 || "" } : {}),
        ...(cP && !String(x.v[cP.id] || "").trim() ? { [cP.id]: d.전화번호 || "" } : {}) } } : x)) }));
    }
  };
  // 자동완성에서 고른 경우 — 고른 그 곳(주소까지)으로 바로 채움
  const pickPlace = (g, i, p) => {
    const cN = colOf("하차지명"); const cA = colOf("하차지주소"); setDirty(true);
    setRows((s) => ({ ...s, [g]: s[g].map((x, j) => (j === i ? { ...x, dirty: true, touched: [...new Set([...(x.touched || []), cN?.id, cA?.id].filter(Boolean))], extra: placeContact(p), v: { ...x.v, ...(cN ? { [cN.id]: p.업체명 } : {}), ...(cA && p.주소 ? { [cA.id]: p.주소 } : {}) } } : x)) }));
  };
  const pickDriver = (g, i, d) => {
    const cP = colOf("차량번호"); const cN = colOf("이름"); const cPh = colOf("전화번호"); setDirty(true);
    setRows((s) => ({ ...s, [g]: s[g].map((x, j) => (j === i ? { ...x, dirty: true, v: { ...x.v, ...(cP ? { [cP.id]: d.차량번호 } : {}), ...(cN ? { [cN.id]: d.이름 || "" } : {}), ...(cPh ? { [cPh.id]: d.전화번호 || "" } : {}) } } : x)) }));
  };
  const addRow = (g) => { setDirty(true); setRows((p) => ({ ...p, [g]: [...(p[g] || []), { key: rid(), v: {}, dirty: true }] })); };
  const delRow = (g, i) => {
    const r = rows[g][i];
    if (r._id) setRemoved((x) => [...x, r._id]);
    setDirty(true);
    setRows((p) => ({ ...p, [g]: p[g].filter((_, j) => j !== i) }));
  };
  // Enter/↑↓ — 같은 칸 위아래 이동
  const onKey = (e) => {
    if (!["Enter", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    const { g, r, c } = e.currentTarget.dataset;
    const next = document.querySelector(`[data-g="${CSS.escape(g)}"][data-r="${+r + (e.key === "ArrowUp" ? -1 : 1)}"][data-c="${c}"]`);
    if (next) { e.preventDefault(); next.focus(); next.select?.(); }
  };

  const copyPrev = async () => {
    if (dirty && !(await kpConfirm("저장하지 않은 내용이 있습니다. 전날 배차표로 덮어쓸까요?"))) return;
    setBusy("copy");
    try {
      // 가장 가까운 이전 날짜(최대 7일 전)
      for (let k = 1; k <= 7; k++) {
        const d0 = addDays(date, -k);
        const s = await getDocs(query(collection(db, "orders"), where("배차표Id", "==", form.id), where("상차일", "==", d0)));
        const list = s.docs.map((d) => ({ _id: d.id, ...d.data() })).filter((o) => o.배차상태 !== "배차취소");
        if (!list.length) continue;
        const built = buildRows(list, false);
        Object.values(built).forEach((arr) => arr.forEach((r) => { r.key = rid(); delete r._id; r.status = ""; r.dirty = true; }));
        setRemoved((orders || []).map((o) => o._id));
        setRows(built); setDirty(true);
        setMsg(`${dLabel(d0)} 배차표를 복사했습니다. 확인 후 [저장]을 눌러 주세요.`);
        return;
      }
      kpAlert("최근 7일 안에 복사할 배차표가 없습니다.");
    } finally { setBusy(""); }
  };

  // ── 구글시트 연동 ─────────────────────────────────────
  // 이 날짜의 탭(탭 이름이 상차일 또는 하차일) — 탭 목록은 5분 기억
  const resolveTab = async () => {
    const t = tabsRef.current;
    if (t.url !== form.sheetUrl || Date.now() - t.at > 300000) {
      const d = await sheetApi({ action: "tabs", url: form.sheetUrl });
      tabsRef.current = { url: form.sheetUrl, at: Date.now(), tabs: d.tabs || [], office: !!d.office };
    }
    return boardTabOf(form, tabsRef.current.tabs, date); // ⭐ 고정한 탭(테스트용) · 월별 탭 · 날짜 탭
  };
  const boardValues = (rs) => { const b = {}; Object.entries(rs).forEach(([g, arr]) => { b[g] = arr.filter((r) => !rowEmpty(form, r)).map((r) => r.v); }); return b; };
  const autoWriteSheet = async (rs) => {
    const tab = await resolveTab();
    if (!tab) return { noTab: true };
    const d = await sheetApi({ action: "read", url: form.sheetUrl, tab });
    if (d.office) return { tab, updated: 0, office: true }; // 📗 엑셀 파일은 쓸 수 없음(안내 카드)
    const plan = planSheetWrite(form, boardRowsFor(form, d.rows, date, tab), boardValues(rs));
    if (!plan.updates.length) return { tab, updated: 0, notFound: plan.notFound.length };
    const w = await sheetApi({ action: "write", url: form.sheetUrl, tab, updates: plan.updates.map(({ a1, value }) => ({ a1, value })) });
    return { tab, updated: w.updated || 0, notFound: plan.notFound.length };
  };
  // 시트와 비교 — 저장된 줄 중 시트에 없는 줄(같은 묶음·같은 도착지 개수 기준) · 시트에만 있는 줄
  const checkingRef = React.useRef(false);
  const sheetMtRef = React.useRef({}); // 💰 2026-11-06 탭별 마지막 시트 수정시각
  const rowsRef = React.useRef(rows); rowsRef.current = rows; // 비교는 항상 지금 표 기준
  const checkSheet = async (force = false) => {
    if (!form?.sheetUrl || orders === null || checkingRef.current) return;
    if (!force && (sheetOpen || sendOpen || busy)) return;
    checkingRef.current = true;
    try {
      const tab = await resolveTab();
      if (!tab) { setSheetDiff({ tab: "", at: Date.now(), gone: new Set(), added: {}, office: !!tabsRef.current.office }); return; }
      // 💰 2026-11-06 1분 확인은 "시트가 바뀌었을 때만" 값을 읽는다(서버가 Drive 수정시각으로 비교 · 같으면 unchanged)
      const mtKey = `${form.sheetUrl}|${tab}`;
      const cached = sheetMtRef.current[mtKey];
      let d = await sheetApi({ action: "read", url: form.sheetUrl, tab, ...(!force ? { ifChanged: cached?.mt || "-" } : {}) });
      if (d.unchanged && cached?.rows) d = { rows: cached.rows, office: cached.office }; // 시트 그대로 → 지난번 값으로 비교(표에서 바뀐 것만 반영)
      else if (d.modifiedTime) sheetMtRef.current[mtKey] = { mt: d.modifiedTime, rows: d.rows, office: !!d.office };
      const office = !!d.office; // 📗 엑셀(xlsx) 파일 — 읽기는 되고 쓰기는 안 됨
      const p = parseBoardTab(form, boardRowsFor(form, d.rows, date, tab));
      const cN = colOf("하차지명");
      if (!cN || !p.headers) { setSheetDiff({ tab, at: Date.now(), gone: new Set(), added: {}, bad: true, office }); return; }
      const gone = new Set(); const added = {};
      form.groups.forEach((g) => {
        const sheetCnt = {}; (p.groups[g.name] || []).forEach((v) => { const k = sheetNm(v[cN.id]); if (k) sheetCnt[k] = (sheetCnt[k] || 0) + 1; });
        const boardCnt = {};
        (rowsRef.current[g.name] || []).forEach((r) => {
          const k = sheetNm(r.v[cN.id]); if (!k) return;
          boardCnt[k] = (boardCnt[k] || 0) + 1;
          if (r._id && boardCnt[k] > (sheetCnt[k] || 0)) gone.add(r.key);
        });
        const used = {};
        (p.groups[g.name] || []).forEach((v) => {
          const k = sheetNm(v[cN.id]); if (!k) return;
          used[k] = (used[k] || 0) + 1;
          if (used[k] > (boardCnt[k] || 0)) (added[g.name] = added[g.name] || []).push(v);
        });
      });
      setSheetDiff({ tab, at: Date.now(), gone, added, office });
    } catch (e) { setSheetDiff((x) => ({ ...(x || { gone: new Set(), added: {} }), at: Date.now(), error: e?.message || String(e) })); }
    finally { checkingRef.current = false; }
  };
  const checkRef = React.useRef(checkSheet); checkRef.current = checkSheet; // 1분 타이머가 항상 최신 표로 비교하게
  // 배차표를 열어 두면 1분마다 시트를 확인(시트를 고친 내용을 놓치지 않게)
  React.useEffect(() => {
    setSheetDiff(null); setKeepKeys(new Set());
    if (!form?.sheetUrl || orders === null) return undefined;
    const t0 = setTimeout(() => checkRef.current(true), 400); // 표가 그려진 뒤 첫 확인
    const t = setInterval(() => checkRef.current(false), 60000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [form?.id, form?.sheetUrl, date, orders === null]); // eslint-disable-line react-hooks/exhaustive-deps
  // ⭐ 2026-11-03 시트 맞추기(서버) — 새 줄·새 날짜 탭은 오더로 만들고, 화주 칸(도착지·시군구·리터 수량)은 시트 값으로, 지워진 줄은 표시만
  //  서버가 10분마다 저절로 하고, 화면을 열 때·[지금 맞추기]를 누를 때 바로 한 번 더
  const syncNow = async (quiet = false) => {
    if (!form?.sheetUrl) return;
    if (dirty && !quiet) { kpAlert("먼저 [저장]을 눌러 주세요. 저장한 뒤 시트와 맞춥니다."); return; }
    setBusy((b) => b || "sync");
    try {
      const r = await sheetApi({ action: "sync", url: form.sheetUrl, boardId: form.id });
      if (!quiet || r.created || r.updated || r.gone || r.deleted) setMsg(`시트와 맞췄습니다 — 새 오더 ${r.created || 0}건 · 화주 입력 반영 ${r.updated || 0}건${r.deleted ? ` · 시트에서 지운 줄 ${r.deleted}건 삭제(휴지통 7일 보관)` : ""}${r.gone ? ` · 시트에서 지워진 줄 ${r.gone}건(확인 필요)` : ""}`);
      setTimeout(() => checkRef.current(true), 800);
    } catch (e) { if (!quiet) kpAlert(`시트와 맞추지 못했습니다: ${e?.message || e}`); }
    finally { setBusy((b) => (b === "sync" ? "" : b)); }
  };
  const syncedRef = React.useRef("");
  React.useEffect(() => { // 화면을 열면(양식·날짜마다 한 번) 바로 맞춤 — 시트에 새 탭이 생겼으면 오더가 자동으로 생긴다
    if (!form?.sheetUrl || form.autoSync === false || orders === null) return;
    const k = `${form.id}|${date}`; if (syncedRef.current === k) return;
    syncedRef.current = k; syncNow(true);
  }, [form?.id, form?.sheetUrl, date, orders === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const keepRow = (r) => { setKeepKeys((s0) => new Set([...s0, r.key])); if (r._id) setDoc(doc(db, "orders", r._id), { 시트삭제됨: false, 시트유지: true }, { merge: true }).catch(() => {}); };
  const isGone = (r) => (sheetDiff?.gone?.has(r.key) || r.sheetGone) && !keepKeys.has(r.key);
  const addedCount = Object.values(sheetDiff?.added || {}).reduce((a, v) => a + v.length, 0);
  const goneCount = Object.values(rows).flat().filter(isGone).length;
  // ⭐ 2026-11-04 시트에서 줄을 지운 게 보이면 바로 서버와 맞춰 프로그램 오더도 지운다(같은 상태로는 한 번만 — 서버가 안전장치로 남기면 표시만)
  const goneSig = Object.values(rows).flat().filter(isGone).map((r) => r.key).sort().join(",");
  const goneSyncRef = React.useRef("");
  React.useEffect(() => {
    if (!goneSig || dirty || !form?.sheetUrl || form.autoSync === false || busy) return;
    const k = `${form.id}|${date}|${goneSig}`; if (goneSyncRef.current === k) return;
    goneSyncRef.current = k; syncNow(true);
  }, [goneSig, dirty, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy("save");
    try {
      const prevById = new Map((orders || []).map((o) => [o._id, o]));
      // 💸 2026-11-09 운송업체별 수수료율 → 비어 있는 기사운임 자동(functions/carrierFareCore.mjs · 서버 routeBoardSync와 같은 규칙)
      let carrierSet = null;
      try { const cs = await getDoc(doc(db, "routeCarrierSettings", co)); carrierSet = cs.exists() ? cs.data() : null; } catch { carrierSet = null; }
      const rateMap = rateMapOf(carrierSet);
      const drvCol = form.columns.find((c) => c.kind === "field" && c.field === "기사운임");
      let saved = 0;
      const writes = [];
      form.groups.forEach((g) => {
        (rows[g.name] || []).forEach((r, i) => {
          if (rowEmpty(form, r)) { if (r._id) writes.push(deleteOrderWithLog("orders", r._id)); return; }
          const prev = r._id ? prevById.get(r._id) : null;
          if (prev && !r.dirty && prev.배차표순번 === i + 1 && prev.배차표묶음 === g.name) return;
          const id = r._id || `rb_${form.id}_${date}_${rid()}`;
          const data = orderFromRow({ ...form }, g, r, i, date, co, !prev, prev?.배차상태);
          // ⭐ 2026-11-03 이미 있는 오더는 "화주 칸"(도착지·시군구·리터 수량·비고)을 직접 고친 경우만 저장 —
          //  시트에서 화주가 바꾼 값(서버가 10분마다 반영)을 화면에 남아 있던 예전 값으로 덮어쓰지 않게
          if (prev) {
            const t = new Set(r.touched || []); let qtyTouched = false;
            form.columns.forEach((c) => {
              if (ownerOf(c) !== "화주") return;
              if (c.kind === "qty") { if (t.has(c.id)) qtyTouched = true; return; }
              if (t.has(c.id)) return;
              if (c.kind === "field" && c.field !== "하차지명") delete data[c.field];
              else if (c.kind === "extra" && data.추가정보) delete data.추가정보[c.label];
            });
            if (!qtyTouched) { delete data.품목수량; delete data.화물내용; delete data.화물수량; }
            const addrTouched = form.columns.some((c) => c.kind === "field" && ["하차지명", "하차지주소"].includes(c.field) && t.has(c.id));
            if (r.fareOverride == null && (prev.운임수동 || (!qtyTouched && !addrTouched && toInt(prev.청구운임)))) { delete data.청구운임; delete data.단가표지역; delete data.파렛단가; if (!("기사운임" in data)) delete data.수수료; }
          }
          if (drvCol && (r.touched || []).includes(drvCol.id)) data.기사운임자동 = false; // 직접 넣은(또는 지운) 기사운임 — 비었으면 아래에서 다시 자동
          if (rateMap.size || prev?.기사운임자동) { const fp = carrierFarePatch(mergedOrder(prev || {}, data), carrierSet, rateMap); if (fp) Object.assign(data, fp); }
          writes.push(setDoc(doc(db, "orders", id), { ...data, _id: id }, { merge: true }));
          saved += 1;
        });
      });
      removed.forEach((id) => { if (prevById.has(id)) writes.push(deleteOrderWithLog("orders", id)); });
      // 처음 보는 도착지는 하차지거래처에 등록(시군구만 있으면 그대로 — 나중에 고치면 됨)
      const cN = colOf("하차지명"); const cA = colOf("하차지주소");
      const seen = new Set();
      Object.values(rows).flat().forEach((r) => {
        const name = String(r.v[cN?.id] || "").trim(); const k = placeKey(name);
        if (!k || seen.has(k) || places.some((p) => norm(p.업체명) === norm(name))) return; // ⭐ 2026-11-03 같은 이름이 이미 있으면(여러 곳 포함) 새로 만들지 않음 — 예전엔 같은 이름이 여러 곳이면 기존 문서를 덮어쓸 수 있었다
        seen.add(k);
        writes.push(setDoc(doc(db, "places", coDocKey(co, k)), { 업체명: name, 주소: String(r.v[cA?.id] || "").trim(), companyName: co, 등록경로: "배차표", createdAt: serverTimestamp() }, { merge: true }).catch(() => {}));
      });
      await Promise.all(writes);
      setDirty(false); setRemoved([]);
      const base = `저장했습니다 — 오더 ${saved}건 반영${removed.length ? ` · ${removed.length}건 삭제` : ""}`;
      setMsg(`${base}.`);
      // ⭐ 2026-11-03 시트 주소가 있으면 차량·기사·수량·운송업체·시간·비고를 그 날짜 탭에 자동으로 써 준다(실패해도 저장은 그대로)
      if (form.sheetUrl) {
        const r = await autoWriteSheet(rows).catch((e) => ({ error: e?.message || String(e) }));
        if (r?.error) setMsg(`${base} · 시트에는 못 썼습니다: ${r.error}`);
        else if (r?.office) setMsg(`${base} · 엑셀(xlsx) 파일이라 시트에는 쓰지 않았어요. 구글 시트로 바꾸면 써져요.`);
        else if (r?.noTab) setMsg(`${base} · 시트에 이 날짜 탭이 없어 시트에는 쓰지 않았습니다.`);
        else if (r) setMsg(`${base} · 시트 '${r.tab}' 탭에 ${r.updated}칸 반영${r.notFound ? ` (시트에 없는 도착지 ${r.notFound}건)` : ""}.`);
        checkSheet(true);
      }
    } catch (e) { kpAlert(`저장 실패: ${e?.message || e}`); } finally { setBusy(""); }
  };
  React.useEffect(() => { if (!msg) return undefined; const t = setTimeout(() => setMsg(""), 4000); return () => clearTimeout(t); }, [msg]);

  // ⭐ 2026-11-03 최고관리자 — 다른 회사로 저장된 양식(예: 태진 시트가 돌캐로)과 그 양식으로 만든 오더를 다른 회사로 옮긴다
  const isMasterUser = () => { try { return localStorage.getItem("role") === "totalMaster" || auth.currentUser?.email === "tjddnqkf@naver.com"; } catch { return false; } };
  const moveForm = async () => {
    const target = String(window.prompt(`'${form.name}' 양식과 그 오더를 옮길 회사 이름을 정확히 입력하세요.\n(지금 회사: ${form.companyName || co})`, "") || "").trim();
    if (!target || target === (form.companyName || co)) return;
    setBusy("move");
    try {
      const snap = await getDocs(query(collection(db, "orders"), where("배차표Id", "==", form.id)));
      const docs = snap.docs;
      if (!(await kpConfirm(`'${form.name}' 양식과 오더 ${docs.length}건을 '${target}' 회사로 옮길까요?\n옮긴 뒤에는 '${target}' 회사 화면에서 보입니다.`))) return;
      for (let i = 0; i < docs.length; i += 400) {
        const b = writeBatch(db);
        docs.slice(i, i + 400).forEach((d) => b.update(d.ref, { companyName: target, _lastModified: Date.now() }));
        await b.commit();
      }
      await updateDoc(doc(db, "routeBoards", form.id), { companyName: target, syncHash: {}, movedFrom: form.companyName || co, movedAt: serverTimestamp() });
      setFormId("");
      kpAlert(`'${target}' 회사로 옮겼습니다 — 양식 1개 · 오더 ${docs.length}건.\n'${target}' 회사로 들어가서 확인해 주세요.`);
    } catch (e) { kpAlert(`옮기지 못했습니다: ${e?.message || e}`); } finally { setBusy(""); }
  };
  const delForm = async () => {
    if (!(await kpConfirm(`'${form.name}' 양식을 지울까요?\n(이미 만든 오더는 지워지지 않습니다)`))) return;
    await runDelete({ label: "양식", task: () => deleteDoc(doc(db, "routeBoards", form.id)) }).catch((e) => kpAlert(e.message)); // ⭐ 2026-11-05 삭제 진행 창
    setFormId("");
  };

  // ── 화면 ──
  if (!co) return null;
  const qtyCols = form ? form.columns.filter((c) => c.kind === "qty") : [];
  const groupTotal = (arr) => { const t = {}; qtyCols.forEach((c) => { t[c.id] = arr.reduce((a, r) => a + toInt(r.v[c.id]), 0); }); t.sum = arr.reduce((a, r) => a + rowSum(form, r), 0); return t; };
  const allRows = Object.values(rows).flat();
  const grand = form ? groupTotal(allRows) : null;
  const drop = form ? addDays(date, toInt(form.dropOffset)) : date;
  const cellCls = "w-full h-8 px-1.5 bg-transparent text-[13px] font-semibold text-[#0F1A30] outline-none focus:bg-[#EEF4FF] rounded";

  return (
    <div className="space-y-4">
      <div className={`${card} p-4 flex flex-wrap items-center gap-2`}>
        <CustomSelect value={formId} onChange={(e) => guard(() => setFormId(e.target.value))} className={`${inp} w-[220px]`}>
          {!forms.length && <option value="">양식 없음</option>}
          {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </CustomSelect>
        <button onClick={() => setEdit(BLANK())} className={`${btn} border border-[#DCE3EE] text-[#2D4C82]`}>＋ 새 양식</button>
        <button onClick={() => setSheetWiz(true)} className={`${btn} border border-[#2D4C82] text-[#2D4C82]`} data-testid="board-from-sheet">구글시트에서 양식 만들기</button>
        {form && <button onClick={() => setEdit(form)} className={`${btn} border border-[#DCE3EE] text-[#3A4A66]`}>양식 수정</button>}
        {form && <button onClick={delForm} className={`${btn} text-red-500`}>양식 삭제</button>}
        {form && isMasterUser() && <button onClick={moveForm} disabled={!!busy} className={`${btn} border border-[#F7C97A] text-[#B54708]`} title="최고관리자 — 다른 회사로 잘못 만들어진 양식과 그 오더를 옮깁니다">{busy === "move" ? "옮기는 중…" : "다른 회사로 옮기기"}</button>}
        <div className="flex-1" />
        {form && (
          <>
            <button onClick={() => guard(() => setDate(addDays(date, -1)))} className="h-10 w-10 rounded-xl border border-[#DCE3EE] font-black text-[#3A4A66]">‹</button>
            <div className="w-[150px]"><CustomDatePicker value={date} onChange={(e) => { const v = e.target.value; if (v) guard(() => setDate(v)); }} className={inp} /></div>
            <button onClick={() => guard(() => setDate(addDays(date, 1)))} className="h-10 w-10 rounded-xl border border-[#DCE3EE] font-black text-[#3A4A66]">›</button>
            <span className="text-[13px] font-bold text-[#3A4A66] whitespace-nowrap">상차 {dLabel(date)} → 하차 {dLabel(drop)}</span>
            {form.sheetUrl && <button onClick={() => setSheetOpen(true)} disabled={!!busy} className={`${btn} border border-[#2D4C82] text-[#2D4C82]`}>시트 불러오기</button>}
            {form.sheetUrl && <button onClick={() => (dirty ? kpAlert("먼저 [저장]을 눌러 주세요. 저장한 내용만 시트로 보냅니다.") : setSendOpen(true))} disabled={!!busy} className={`${btn} border border-[#2D4C82] text-[#2D4C82]`}>시트로 보내기</button>}
            <button onClick={copyPrev} disabled={!!busy} className={`${btn} border border-[#DCE3EE] text-[#3A4A66]`}>{busy === "copy" ? "복사 중…" : "전날 복사"}</button>
            <button onClick={save} disabled={!!busy || !dirty} className={`${btn} bg-[#0F1A30] text-white px-6`}>{busy === "save" ? "저장 중…" : dirty ? "저장" : "저장됨"}</button>
          </>
        )}
      </div>
      {msg && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13.5px] font-semibold text-emerald-700">{msg}</div>}

      {!form ? (
        <div className={`${card} p-10 text-center`}>
          <div className="text-[16px] font-black text-[#0F1A30]">배차표 양식이 없습니다</div>
          <div className="text-[13.5px] text-[#7A8AA6] mt-1.5 mb-4">화주사가 주는 시트 모양(칸 이름·순서)대로 양식을 한 번 만들면, 날짜마다 그 모양으로 입력합니다.</div>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={() => setSheetWiz(true)} className={`${btn} bg-[#0F1A30] text-white px-6`}>구글시트에서 양식 만들기</button>
            <button onClick={() => setEdit(BLANK())} className={`${btn} border border-[#DCE3EE] text-[#3A4A66] px-6`}>직접 만들기</button>
          </div>
        </div>
      ) : orders === null ? (
        <div className={`${card} p-10 text-center text-[14px] text-[#7A8AA6]`}>불러오는 중…</div>
      ) : (
        <>
          {form.sheetUrl && sheetDiff && (
            <div className={`rounded-xl border px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] ${goneCount ? "bg-[#FFF8E6] border-[#F7D58A]" : "bg-[#F5F8FD] border-[#E3E8F0]"}`}>
              <span className="font-black text-[#0F1A30]">구글시트 연동</span>
              <span className="text-[#5B6B85]">{sheetDiff.error ? (isOfficeFileError(sheetDiff.error) ? "엑셀(xlsx) 파일이라 아직 읽기만 돼요" : `확인 실패 — ${sheetDiff.error}`) : !sheetDiff.tab ? (isMonthBoard(form) ? `${form.tabMode === "single" ? "연결한 탭" : `${sheetDayOf(form, date).slice(2, 4)}년${+sheetDayOf(form, date).slice(5, 7)}월 탭`}이 시트에 없습니다` : "이 날짜 탭이 시트에 없습니다") : sheetDiff.bad ? `'${sheetDiff.tab}' 탭에서 제목줄을 못 찾았습니다` : `'${sheetDiff.tab}' 탭 · ${new Date(sheetDiff.at).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })} 확인 · ${form.autoSync === false ? "자동 연동 꺼짐" : "새 줄·새 날짜 탭은 자동으로 오더 생성"} · 저장하면 차량·운송업체·단가·입차시간이 시트에 입력`}</span>
              {goneCount > 0 && <span className="font-black text-red-600">시트에서 지운 줄 {goneCount}개 — 프로그램에서도 자동으로 삭제합니다{form.autoSync === false ? "(자동 연동이 꺼져 있어 [지금 맞추기]를 눌러 주세요)" : ""}</span>}
              {/* ⭐ 2026-11-03 "새로 생긴 줄 지금 가져오기" 제거 — 자동 연동·[지금 맞추기]·고정노선현황 [기간 가져오기]로 들어온다 */}
              <button type="button" onClick={() => syncNow(false)} disabled={busy === "sync"} className="ml-auto h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-bold text-[#3A4A66] disabled:opacity-50">{busy === "sync" ? "맞추는 중…" : "지금 맞추기"}</button>
            </div>
          )}
          {/* 📗 2026-11-07 엑셀(xlsx) 파일 — 읽기는 되고, 시트에 쓰려면 구글 시트로 변환 */}
          {form.sheetUrl && sheetDiff && (sheetDiff.office || isOfficeFileError(sheetDiff.error)) && (
            <OfficeSheetCard key={form.sheetUrl} onConvert={() => convertBoardSheet(form.sheetUrl, form.id)}
              onConverted={() => { tabsRef.current = { url: "", at: 0, tabs: [] }; setMsg("구글 시트로 바꿨어요. 원래 엑셀 파일은 그대로 있어요."); }} />
          )}
          {!orders.length && !dirty && <div className="text-[13px] text-[#7A8AA6] px-1">이 날짜는 아직 저장된 배차표가 없습니다{form.groups.some((g) => (g.defaults || []).length) ? " — 기본 도착지를 채워 두었습니다." : "."}</div>}
          {form.groups.map((g) => {
            const arr = rows[g.name] || [];
            const t = groupTotal(arr);
            return (
              <div key={g.name} className={`${card} overflow-hidden`}>
                <div className="px-4 py-2.5 bg-[#0F1A30] text-white flex items-center gap-3">
                  <span className="text-[14.5px] font-black">{form.name} 배차 내역({g.name})</span>
                  <span className="text-[12.5px] text-white/70">{g.상차지명 && g.상차지명 !== g.name ? `상차 ${g.상차지명}` : ""}</span>
                  <span className="flex-1" />
                  <span className="text-[12.5px] font-bold text-white/80">{arr.filter((r) => !rowEmpty(form, r)).length}대 · 총 {t.sum.toLocaleString()}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="border-collapse text-[13px]" style={{ minWidth: "100%" }}>
                    <thead>
                      <tr className="bg-[#EAF1FB] text-[#3A4A66]">
                        {form.columns.map((c) => <th key={c.id} style={{ width: colWidth(c), minWidth: colWidth(c) }} className={`px-1.5 py-2 border border-[#DCE3EE] font-black whitespace-nowrap ${c.kind === "qty" ? "bg-[#FFF3B0]" : ""}`}>{c.label}</th>)}
                        {showFare && <th className="px-1.5 py-2 border border-[#DCE3EE] font-black whitespace-nowrap w-[110px] bg-[#E6F4EA]" title="시트에는 없는 프로그램 칸 — 리터·파레트 수를 넣으면 단가표로 자동 계산, 직접 고치면 그 값">청구운임</th>}
                        <th className="px-1.5 py-2 border border-[#DCE3EE] font-black whitespace-nowrap w-[90px]">상태</th>
                        <th className="border border-[#DCE3EE] w-[36px]" />
                      </tr>
                    </thead>
                    <tbody>
                      {arr.map((r, i) => (
                        <tr key={r.key} className={r.dirty ? "bg-[#FFFBEA]" : "bg-white"}>
                          {form.columns.map((c, ci) => (
                            <td key={c.id} className="border border-[#E3E8F0] p-0.5">
                              {c.kind === "no" ? <div className="text-center text-[#7A8AA6] font-bold">{i + 1}</div>
                                : c.kind === "date" ? <div className="text-center text-[#7A8AA6] font-bold text-[12.5px] whitespace-nowrap">{dLabel(sheetDayOf(form, date))}</div>
                                : c.kind === "sum" ? <div className="text-center font-black text-[#0F1A30]">{rowSum(form, r) || ""}</div>
                                : c.kind === "calc" ? <div className="text-center font-bold text-[#3A4A66] tabular-nums" title="자동 계산(청구운임 − 기사운임)">{calcOf(c.field, r.v[colOf("청구운임")?.id] ?? r.fare, r.v[colOf("기사운임")?.id])}</div>
                                  : ["하차지명", "차량번호", "이름", "전화번호"].includes(c.field) ? (
                                    <BoardSuggest value={r.v[c.id] ?? ""} onChange={(v) => setCell(g.name, i, c, v)} onBlur={() => onLeave(g.name, i, c)} onKeyDown={onKey}
                                      onPick={(x) => (c.field === "하차지명" ? pickPlace(g.name, i, x) : pickDriver(g.name, i, x))}
                                      items={c.field === "하차지명" ? places : drivers} k={c.field === "하차지명" ? "업체명" : c.field}
                                      sub={c.field === "하차지명" ? placeSub : (d) => [c.field !== "차량번호" && d.차량번호, c.field !== "이름" && d.이름, c.field !== "전화번호" && d.전화번호, d.등급].filter(Boolean).join(" · ")}
                                      title={c.field === "하차지명" ? "상하차지거래처" : "기사관리"} className={cellCls}
                                      inputProps={{ "data-g": g.name, "data-r": i, "data-c": ci }} />
                                  ) : (
                                    <input value={r.v[c.id] ?? ""} onChange={(e) => setCell(g.name, i, c, e.target.value)} onBlur={() => onLeave(g.name, i, c)} onKeyDown={onKey}
                                      data-g={g.name} data-r={i} data-c={ci}
                                      inputMode={c.kind === "qty" || MONEY_FIELDS.has(c.field) ? "numeric" : undefined}
                                      placeholder={TIME_FIELDS.has(c.field) ? "16:00" : ""}
                                      className={`${cellCls} ${c.kind === "qty" ? "text-center" : ""}`} />
                                  )}
                            </td>
                          ))}
                          {showFare && (() => { const f = fareInfo(r); return (
                            <td className="border border-[#E3E8F0] p-0.5 bg-[#F4FBF6]" title={f.title || (f.src === "직접" ? "직접 입력한 운임 — 비우면 단가표 자동" : f.src === "없음" ? (form.rateTable?.length ? "단가표에서 이 지역을 못 찾았습니다(직접 입력 가능)" : "양식에 단가표를 올리면 자동 계산") : "")}>
                              <input value={r.fareOverride != null ? (r.fareOverride ? Number(r.fareOverride).toLocaleString() : "") : (f.n ? f.n.toLocaleString() : "")} onChange={(e) => setFare(g.name, i, e.target.value)} inputMode="numeric"
                                placeholder={f.src === "없음" ? "-" : ""} className={`${cellCls} text-right tabular-nums font-black`} />
                              {f.src && f.src !== "없음" && <div className={`text-[9.5px] font-bold text-right px-1.5 -mt-0.5 ${f.src === "직접" ? "text-[#B54708]" : "text-[#067647]"}`}>{f.src === "직접" ? "직접 입력" : "단가표"}</div>}
                            </td>
                          ); })()}
                          <td className="border border-[#E3E8F0] text-center text-[12px] font-bold whitespace-nowrap px-1">
                            {isGone(r) ? (
                              <div className="flex flex-col items-center gap-0.5 py-0.5">
                                <span className="text-red-600 font-black">시트에서 삭제됨</span>
                                <span className="flex gap-1">
                                  <button type="button" onClick={async () => { if (await kpConfirm("시트에서 지워진 줄입니다. 이 오더를 지울까요?\n(지운 뒤 [저장]을 눌러야 반영됩니다)")) delRow(g.name, i); }} className="px-1.5 rounded bg-red-600 text-white text-[11px] font-black">오더 삭제</button>
                                  <button type="button" onClick={() => keepRow(r)} className="px-1.5 rounded border border-[#DCE3EE] text-[11px] font-bold text-[#5B6B85]">유지</button>
                                </span>
                              </div>
                            ) : !r._id ? <span className="text-amber-600">새 줄</span> : r.status === "배차완료" ? <span className="text-emerald-600">배차완료</span> : r.status === "배차취소" ? <span className="text-red-500">배차취소</span> : <span className="text-[#7A8AA6]">{r.status || "배차중"}</span>}
                          </td>
                          <td className="border border-[#E3E8F0] text-center"><button onClick={() => delRow(g.name, i)} className="text-[#B0BCD0] hover:text-red-500 font-black px-1.5" title="줄 삭제">×</button></td>
                        </tr>
                      ))}
                      <tr className="bg-[#F5F8FD] font-black text-[#0F1A30]">
                        {form.columns.map((c, ci) => (
                          <td key={c.id} className="border border-[#E3E8F0] px-1.5 py-1.5 text-center">
                            {ci === 0 ? <button onClick={() => addRow(g.name)} className="text-[12.5px] font-black text-[#2D4C82] whitespace-nowrap">＋ 줄</button>
                              : c.kind === "qty" ? (t[c.id] || "") : c.kind === "sum" ? (t.sum || "") : ""}
                          </td>
                        ))}
                        {showFare && <td className="border border-[#E3E8F0] px-1.5 py-1.5 text-right tabular-nums">{arr.reduce((a, r) => a + (rowEmpty(form, r) ? 0 : fareInfo(r).n), 0).toLocaleString() || ""}</td>}
                        <td className="border border-[#E3E8F0]" colSpan={2} />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {form.groups.length > 1 && (
            <div className={`${card} px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13.5px]`}>
              <span className="font-black text-[#0F1A30]">전체 {allRows.filter((r) => !rowEmpty(form, r)).length}대</span>
              {qtyCols.map((c) => <span key={c.id} className="text-[#3A4A66]">{c.label} <b className="text-[#0F1A30]">{grand[c.id] || 0}</b></span>)}
              <span className="text-[#3A4A66]">총계 <b className="text-[#0F1A30]">{grand.sum}</b></span>
              {showFare && <span className="text-[#3A4A66]">청구운임 <b className="text-[#067647]">{allRows.reduce((a, r) => a + (rowEmpty(form, r) ? 0 : fareInfo(r).n), 0).toLocaleString()}원</b></span>}
            </div>
          )}
        </>
      )}

      {sendOpen && form && <SheetSend form={form} date={date} rows={rows} onClose={() => setSendOpen(false)} onDone={(m) => { setSendOpen(false); setMsg(m); }} />}
      {sheetOpen && form && <SheetLoad form={form} date={date} onApply={applySheet} onClose={() => setSheetOpen(false)} />}
      {/* 🔗 2026-11-07 구글시트에서 양식 만들기 — 연결 마법사(머리줄 · 칸 맞추기 · 월별 탭) → 그 칸 그대로 새 양식 편집기 */}
      {sheetWiz && <React.Suspense fallback={null}><SheetConnectWizard company={co} title="구글시트에서 배차표 양식 만들기" onClose={() => setSheetWiz(false)}
        onSaved={(p) => { setSheetWiz(false); setEdit(boardFromProfile(p)); }} /></React.Suspense>}
      {edit && <FormEditor init={edit} co={co} clients={clients} places={places} onClose={() => setEdit(null)} onSaved={(id) => { setEdit(null); setFormId(id); setMsg("양식을 저장했습니다."); }} />}
    </div>
  );
}
