// ======================= src/FixedRouteStatus.jsx =======================
// 🛣 2026-11-03 배차현황 › 고정노선현황 — 고정노선 › 배차표 양식(화주사 구글시트)의 오더를 배차현황과 같은 화면으로
//  · 버튼·합계(건수·청구·기사·수수료)·필터·기간·검색·어제/당일/내일/전체·기사복사·업로드링크·대용량·선택삭제·엑셀·일마감은
//    배차현황(DispatchStatus)을 그대로 쓰고, 표의 열만 그 양식(시트 제목줄) 순서로 바꾼다(fixedForm).
//  · 화면을 열어 두면 30초마다 서버가 시트와 맞춘다(새 날짜 탭·새 줄 → 오더, 시트에서 바뀐 칸 → 프로그램, 프로그램에서 바꾼 칸 → 시트)
import React from "react";
import { collection, onSnapshot, query, where, doc, setDoc, updateDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db, auth } from "./firebase";
import { createPortal } from "react-dom";
import CustomDatePicker from "./CustomDatePicker";
import { sheetApi, BoardSuggest } from "./RouteBoard";
import { ownerOf, rateFor } from "./routeBoardSheet";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
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
  return ["선택", "순번", "발주일", "입고일", "상차지", ...cols.map((c) => c.label), "배차상태", ...["청구운임", "기사운임"].filter((f) => !has(f)), "수수료"];
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
  if (c.kind === "extra") return String(row.추가정보?.[c.label] ?? "");
  if (c.kind === "sum") { const t = Object.values(row.품목수량 || {}).reduce((a, n) => a + toInt(n), 0); return t ? String(t) : ""; }
  // ⭐ 2026-11-03 시군구 칸은 시트에 적힌 그대로(여주시) — 오더에는 기사 길안내용 풀주소를 그대로 둔다
  if (c.field === "하차지주소") { const sv = row.시트기준값?.[c.id] ?? row.시트추가값?.[c.id]; if (sv != null && String(sv).trim()) return String(sv); const short = siGunGu(row.하차지주소); return short || String(row.하차지주소 ?? ""); }
  const v = String(row[c.field] ?? "");
  return TIME_FIELDS.has(c.field) ? (parseHM(v) || v) : v;
};

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
      <td className={`${td} tabular-nums text-[13px] font-bold text-[#3A4A66]`} style={{ fontFamily: MONO }} title="발주일(시트 왼쪽 날짜)">{String(row.발주일 || row.상차일 || "").slice(5).replace("-", ".")}</td>
      <td className={td} title="입고일(시트 오른쪽 날짜 · 탭 이름)">
        {/* ⭐ 2026-11-03 입고일 눈에 띄게 — 굵고 크게, 남색 칩 */}
        <span className="inline-flex items-center h-7 px-2.5 rounded-lg bg-[#0F1A30] text-white text-[14.5px] font-black tabular-nums tracking-tight" style={{ fontFamily: MONO }}>{String(row.입고일 || row.하차일 || "").slice(5).replace("-", ".")}</span>
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
          return <td key={c.id} className={`${td} bg-[#F3F7FF]`} title="차량번호·이름·번호 일부만 쳐도 기사관리에서 찾아 채웁니다"><VehicleCell field={c.field} value={v} drivers={drivers} disabled={disabled} onPick={pick} onCommit={(x) => commit(c, x)} placeholder={c.field === "차량번호" && !v ? "미배차" : ""} /></td>;
        }
        if (isCarrierCol(c)) return <td key={c.id} className={`${td} ${bg}`} title="기본거래처에 있으면 목록에서 고르고, 없으면 그냥 입력"><CarrierCell value={v} clients={carrierItems} disabled={disabled} onCommit={(x) => commit(c, x)} /></td>;
        return (
          <td key={c.id} data-frs={look || undefined} data-empty={look && !v ? "1" : undefined} className={`${td} ${bg}`} title={own === "화주" ? "업체(화주)가 시트에 입력하는 칸" : own === "운송사" ? "운송사가 입력하는 칸" : ""}>
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
      <td className={`${td} text-[13.5px] font-black tabular-nums ${toInt(row.청구운임) - toInt(row.기사운임) < 0 ? "text-red-600" : "text-[#0F1A30]"}`} style={{ fontFamily: MONO }}>{(toInt(row.청구운임) - toInt(row.기사운임)).toLocaleString()}</td>
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

const isMasterOnly = () => { try { return localStorage.getItem("role") === "totalMaster" || auth.currentUser?.email === "tjddnqkf@naver.com"; } catch { return false; } };
// 🔒 2026-11-03 운송사 분리 — 이 회사의 배차표 양식 id 목록(배지·목록은 이 회사 양식의 오더만)
export function useRouteBoardIds(company) {
  const [ids, setIds] = React.useState(() => new Set());
  React.useEffect(() => {
    if (!company) { setIds(new Set()); return undefined; }
    return onSnapshot(query(collection(db, "routeBoards"), where("companyName", "==", company)), (s) => setIds(new Set(s.docs.map((d) => d.id))), () => setIds(new Set()));
  }, [company]);
  return ids;
}
// 다른 회사 양식으로 만들어져 이 회사에 잘못 남은 오더 — 확인 후 이 회사에서만 지운다("지운 줄" 기록 없이 → 원래 회사 시트 연동에 영향 없음)
function ForeignOrdersCard({ list, disabled }) {
  const [busy, setBusy] = React.useState(false);
  if (!list.length || !isMasterOnly()) return null; // 최고관리자만
  const clean = async () => {
    if (!window.confirm(`다른 운송사 배차표(구글시트)에서 잘못 들어온 오더 ${list.length}건을 이 회사에서 지울까요?\n원래 운송사의 오더·시트에는 아무 영향이 없습니다.`)) return;
    setBusy(true);
    try {
      for (let i = 0; i < list.length; i += 400) {
        const b = writeBatch(db);
        list.slice(i, i + 400).forEach((r) => b.delete(doc(db, r.__col || "orders", r._id || r.id)));
        await b.commit();
      }
    } catch (e) { window.alert(`정리하지 못했습니다: ${e?.message || e}`); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-[#F7C97A] bg-[#FFF8EC] px-5 py-4 flex items-center gap-4 flex-wrap">
      <div className="min-w-0">
        <div className="text-[14.5px] font-black text-[#8A4B08]">다른 운송사 배차표에서 잘못 들어온 오더 {list.length}건</div>
        <div className="text-[12.5px] text-[#9A6B2E] mt-0.5">이 회사에 없는 배차표 양식으로 만들어진 오더라 화면에는 보이지 않습니다. 정리하면 이 회사에서만 지워지고, 원래 운송사의 오더·구글시트는 그대로입니다.</div>
      </div>
      {!disabled && <button type="button" disabled={busy} onClick={clean} className="ml-auto h-10 px-4 rounded-xl bg-[#8A4B08] text-white text-[13px] font-black disabled:opacity-60">{busy ? "정리 중…" : "이 회사에서 정리"}</button>}
    </div>
  );
}

export default function FixedRouteStatusHost({ company, dispatchData = [], render, places = [], drivers = [], disabled = false }) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [rangeOpen, setRangeOpen] = React.useState(false);
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
  // 30초마다 시트와 맞춤(화면을 연 동안) — 서버가 새 탭·새 줄·바뀐 칸을 처리
  const runSync = React.useCallback(async (f, quiet = true) => {
    if (!f?.sheetUrl || f.autoSync === false) return;
    setSync((s) => ({ ...s, busy: true }));
    try { const r = await sheetApi({ action: "sync", url: f.sheetUrl, boardId: f.id }); setSync({ at: Date.now(), busy: false, err: "", last: r }); }
    catch (e) { setSync((s) => ({ ...s, busy: false, at: Date.now(), err: quiet ? String(e?.message || e) : (window.alert?.(`시트와 맞추지 못했습니다: ${e?.message || e}`), String(e?.message || e)) })); }
  }, []);
  React.useEffect(() => {
    if (!form?.sheetUrl || form.autoSync === false) return undefined;
    runSync(form);
    const t = setInterval(() => { if (document.visibilityState === "visible") runSync(form); }, 30000);
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
  const unassigned = rows.filter((r) => !normPlate(r.차량번호) && r.배차상태 !== "배차취소").length;
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
      <div className="relative overflow-hidden rounded-[22px] px-4 md:px-6 py-4 text-white" style={{ background: "radial-gradient(900px 300px at 90% -20%, rgba(110,149,232,.28), transparent 60%), linear-gradient(120deg,#060C1A 0%,#0F1A30 45%,#1B2B4B 100%)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(rgba(143,176,240,.06) 1px, transparent 1px) 0 0/24px 24px, linear-gradient(90deg, rgba(143,176,240,.06) 1px, transparent 1px) 0 0/24px 24px" }} />
        <div className="relative flex items-center gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10.5px] font-extrabold tracking-[0.32em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>FIXED ROUTE · LIVE BOARD</div>
            <div className="text-[22px] font-black mt-0.5">고정노선현황</div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {forms.map((f) => (
              <button key={f.id} type="button" onClick={() => setFormId(f.id)}
                className={`h-10 px-4 rounded-xl text-[14px] font-black whitespace-nowrap border transition ${form?.id === f.id ? "bg-white text-[#0F1A30] border-white" : "bg-white/[0.06] text-white/80 border-white/15 hover:bg-white/[0.12]"}`}>
                {f.name}<span className={`ml-2 text-[11.5px] tabular-nums ${form?.id === f.id ? "text-[#7A8AA6]" : "text-white/45"}`} style={{ fontFamily: MONO }}>{rowsOf(f).length}</span>
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 flex-wrap">
            {/* ⭐ 2026-11-03 [지운 줄 다시 가져오기] 제거 — [기간 가져오기]를 누르면 지운 줄까지 다시 가져온다 */}
            {form && !disabled && form.sheetUrl && (
              <button type="button" onClick={() => setRangeOpen(true)} title="예전 날짜 탭(입고일 기준)을 한 번에 가져오기"
                className="h-10 px-3.5 rounded-xl inline-flex items-center gap-1.5 text-[13px] font-black bg-white/[0.06] border border-white/15 text-white/85 hover:bg-white/[0.12]">기간 가져오기</button>
            )}
            {form && !disabled && (
              <button type="button" onClick={() => setAddOpen(true)} title="이 양식에 오더 추가 — 시트에도 새 줄로 들어갑니다"
                className="h-10 px-3.5 rounded-xl inline-flex items-center gap-1.5 text-[13px] font-black bg-white text-[#0F1A30] hover:bg-[#EEF2F8]">＋ 오더 추가</button>
            )}
            <span className={`h-10 px-3.5 rounded-xl inline-flex items-center gap-2 text-[13px] font-black border ${unassigned ? "bg-[#F7B955]/15 border-[#F7B955]/50 text-[#FCD9A0]" : "bg-white/[0.06] border-white/15 text-white/70"}`}>
              미배차 <span className="text-[17px] tabular-nums" style={{ fontFamily: MONO }}>{unassigned}</span>
            </span>
            {form?.sheetUrl ? (
              <button type="button" onClick={() => runSync(form, false)} disabled={sync.busy} title="지금 시트와 맞추기"
                className="h-10 px-3.5 rounded-xl inline-flex items-center gap-2 text-[12.5px] font-bold bg-white/[0.06] border border-white/15 text-white/85 hover:bg-white/[0.12] disabled:opacity-60">
                <span className={`w-2 h-2 rounded-full ${sync.err ? "bg-[#FF8A7A]" : form.autoSync === false ? "bg-white/40" : "bg-[#4ADE80] shadow-[0_0_8px_#4ADE80]"} ${sync.busy ? "animate-pulse" : ""}`} />
                {sync.busy ? "시트와 맞추는 중…" : sync.err ? "시트 연동 오류 · 다시" : form.autoSync === false ? "자동 연동 꺼짐 · 지금 맞추기" : `시트 실시간 연동 · ${sync.at ? new Date(sync.at).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "확인 중"}`}
              </button>
            ) : <span className="text-[12.5px] text-white/55">시트 주소가 없는 양식입니다</span>}
          </div>
        </div>
        {sync.err && <div className="relative mt-2 text-[12.5px] text-[#FFB4A8]">{sync.err}</div>}
        <div className="relative mt-2 flex items-center gap-3 flex-wrap text-[11.5px] text-white/55">
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#FFF8DB]" />리터·파레트 수량</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#F3F7FF]" />운송사 입력 칸</span>
          <span>줄을 두 번 누르면 그 줄만 수정 모드(Esc·완료로 끝) → 저장하면 30초 안에 시트에도 반영 · 시트에서 고친 내용도 30초마다 들어옵니다</span>
        </div>
      </div>
      <ForeignOrdersCard list={foreign} disabled={disabled} />
      {form && render(form, rows)}
      {rangeOpen && form && <RangeImportModal form={form} onClose={() => setRangeOpen(false)} />}
      {addOpen && form && <AddFixedOrderModal form={form} rows={rows} places={places} drivers={drivers} onClose={(ok) => { setAddOpen(false); if (ok && form.sheetUrl) setTimeout(() => runSync(form), 800); }} />}
    </div>
  );
}

// 📱 2026-11-03 모바일 고정노선현황 — PC와 같은 양식 고르기·시트 연동·오더 추가, 표는 가로로 밀어 보기 · 줄을 두 번 눌러 수정
export function MobileFixedRouteView({ company, dispatchData = [], drivers = [], clients = [], places = [], disabled = false }) {
  const kst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const [day, setDay] = React.useState(kst());
  const [editId, setEditId] = React.useState(null);
  const patch = (r) => (p) => updateDoc(doc(db, r.__col || "orders", r._id || r.id), { ...p, 최종수정자: auth.currentUser?.email || "", updatedAt: Date.now() }).catch((e) => window.alert(`저장하지 못했습니다: ${e?.message || e}`));
  return (
    <div className="px-2 py-2 kp-m-pc">
      <FixedRouteStatusHost company={company} dispatchData={dispatchData} places={places} drivers={drivers} disabled={disabled}
        render={(form, rows) => {
          const gi = (r) => { const i = (form.groups || []).findIndex((g) => g.name === r.배차표묶음); return i < 0 ? 999 : i; };
          const list = rows.filter((r) => !day || (r.입고일 || r.하차일) === day)
            .sort((a, b) => gi(a) - gi(b) || (a.시트줄 ?? 1e9) - (b.시트줄 ?? 1e9) || (a.배차표순번 || 0) - (b.배차표순번 || 0));
          const head = fixedHeaderOf(form).filter((h) => h !== "선택");
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[12px] font-black text-[#5B6B85]">입고일</span>
                {[["오늘", kst()], ["내일", addDaysStr(kst(), 1)], ["전체", ""]].map(([l, v]) => (
                  <button key={l} type="button" onClick={() => setDay(v)} className={`h-8 px-3 rounded-lg text-[12.5px] font-black border ${day === v ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`}>{l}</button>
                ))}
                <span className="inline-block w-[130px]"><CustomDatePicker value={day} onChange={(e) => setDay(e.target.value)} className="h-8 w-full px-2 rounded-lg border border-[#DCE3EE] text-[12.5px] font-semibold bg-white" /></span>
                <span className="ml-auto text-[12px] font-bold text-[#7A8AA6]">{list.length}건 · 두 번 눌러 수정</span>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-[#E3E8F0] bg-white" style={{ WebkitOverflowScrolling: "touch" }}>
                <table className="text-[12.5px] border-separate border-spacing-0" style={{ minWidth: "max-content" }}>
                  <thead><tr>{head.map((h) => <th key={h} className="sticky top-0 bg-[#1B2B4B] text-white font-extrabold px-2 py-2 whitespace-nowrap border-r border-white/10">{h}</th>)}</tr></thead>
                  <tbody>
                    {list.length === 0 && <tr><td colSpan={head.length} className="py-10 text-center text-[#9AA9C3] font-semibold">이 날 오더가 없어요</td></tr>}
                    {list.map((r, i) => {
                      const id = r._id || r.id;
                      return (
                        <tr key={id} className={`kp-frs-row ${editId === id ? "bg-[#EEF4FF] outline outline-2 -outline-offset-2 outline-[#2D4C82]" : i % 2 ? "bg-[#FAFBFD]" : "bg-white"}`}
                          onDoubleClick={() => { if (!disabled) setEditId((c) => (c === id ? null : id)); }}
                          onKeyDown={(e) => { if (e.key === "Enter" && e.target.tagName === "INPUT" && !document.querySelector("[role=listbox]")) { e.target.blur(); setTimeout(() => setEditId(null), 220); } }}>
                          <td className="px-2 py-1.5 text-center font-bold text-[#5B6B85] border-b border-[#E9EDF4] border-r border-r-[#E3E8F0]">
                            {editId === id ? <button type="button" onClick={() => setEditId(null)} className="h-7 px-2 rounded-lg bg-[#1B2B4B] text-white text-[11px] font-black">완료</button> : i + 1}
                          </td>
                          <FixedRouteCells form={form} row={r} drivers={drivers} clients={clients} disabled={disabled} editing={editId === id} onPatch={patch(r)} />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }} />
    </div>
  );
}
