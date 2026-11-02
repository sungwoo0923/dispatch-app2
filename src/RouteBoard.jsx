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
import { collection, doc, onSnapshot, query, where, getDocs, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";
import { coDocKey } from "./coKey";
import { deleteOrderWithLog } from "./orderHistory";
import CustomDatePicker from "./CustomDatePicker";
import { kpConfirm, kpAlert } from "./kpDialog";

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
const KINDS = [["field", "프로그램 칸"], ["qty", "수량"], ["sum", "합계(자동)"], ["extra", "참고(보관)"], ["no", "순번(자동)"]];
const FIELDS = ["하차지명", "하차지주소", "차량번호", "이름", "전화번호", "상차시간", "하차시간", "메모", "거래처명", "청구운임", "기사운임", "화물내용", "차량톤수", "차량종류"];
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
  return { kind: "extra" };
}
const col = (label, kind, field) => ({ id: rid(), label, kind, ...(field ? { field } : {}) });
// 예시 양식(태진 삼다수 시트 모양)
const SAMPLE = () => ({
  name: "태진 삼다수", client: "", dropOffset: 1, payMethod: "",
  groups: [{ name: "1센터", 상차지명: "", 상차지주소: "", defaults: [] }, { name: "2센터", 상차지명: "", 상차지주소: "", defaults: [] }, { name: "대양", 상차지명: "", 상차지주소: "", defaults: [] }],
  columns: [col("구분", "no"), col("도착지", "field", "하차지명"), col("시군구", "field", "하차지주소"), col("차량번호", "field", "차량번호"), col("성명", "field", "이름"), col("휴대전화", "field", "전화번호"),
    col("0.33L", "qty"), col("0.5L", "qty"), col("1.0L", "qty"), col("2.0L", "qty"), col("총계", "sum"), col("운송업체", "extra"), col("입차시간", "field", "상차시간"), col("비고", "field", "메모")],
});
const BLANK = () => ({ name: "", client: "", dropOffset: 1, payMethod: "", groups: [{ name: "기본", 상차지명: "", 상차지주소: "", defaults: [] }], columns: [col("도착지", "field", "하차지명"), col("시군구", "field", "하차지주소"), col("차량번호", "field", "차량번호"), col("성명", "field", "이름"), col("휴대전화", "field", "전화번호"), col("비고", "field", "메모")] });

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
  });
  return { key: o._id || o.id, _id: o._id || o.id, v, status: o.배차상태 || "", dirty: false, extra: { 하차지담당자: o.하차지담당자, 하차지담당자번호: o.하차지담당자번호 } };
}
const rowEmpty = (form, r) => !form.columns.some((c) => c.kind !== "no" && c.kind !== "sum" && String(r.v[c.id] || "").trim());
const rowSum = (form, r) => form.columns.filter((c) => c.kind === "qty").reduce((a, c) => a + toInt(r.v[c.id]), 0);

function orderFromRow(form, g, r, i, date, co, isNew, prevStatus) {
  const rec = { 품목수량: {}, 추가정보: {} };
  form.columns.forEach((c) => {
    const val = String(r.v[c.id] ?? "").trim();
    if (c.kind === "field") rec[c.field] = TIME_FIELDS.has(c.field) ? (parseHM(val) ? korTime(parseHM(val)) : val) : MONEY_FIELDS.has(c.field) ? String(toInt(val) || "") : val;
    else if (c.kind === "qty") { if (toInt(val)) rec.품목수량[c.label] = toInt(val); }
    else if (c.kind === "extra") { if (val) rec.추가정보[c.label] = val; }
  });
  const total = rowSum(form, r);
  if (!form.columns.some((c) => c.field === "화물내용")) {
    rec.화물내용 = Object.keys(rec.품목수량).length ? `${Object.entries(rec.품목수량).map(([k, n]) => `${k} ${n}`).join(" · ")} (총 ${total})` : "";
  }
  rec.화물수량 = total ? String(total) : "";
  if (!form.columns.some((c) => c.field === "거래처명")) rec.거래처명 = form.client || "";
  if (rec.청구운임 || rec.기사운임) rec.수수료 = String(toInt(rec.청구운임) - toInt(rec.기사운임));
  rec.차량번호 = normPlate(rec.차량번호 || "") ? String(rec.차량번호).trim() : "";
  const keepStatus = prevStatus && !["배차중", "배차완료", ""].includes(prevStatus);
  return {
    ...rec,
    상차일: date, 하차일: addDays(date, toInt(form.dropOffset)),
    상차지명: g.상차지명 || g.name || "", 상차지주소: g.상차지주소 || "",
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

// ── 양식 편집 ──────────────────────────────────────────────
function FormEditor({ init, onClose, onSaved, co }) {
  const [f, setF] = React.useState(() => JSON.parse(JSON.stringify(init)));
  const [busy, setBusy] = React.useState(false);
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
    setBusy(true);
    try {
      const data = { ...f, companyName: co, columns: f.columns.map((c) => ({ ...c, label: c.label.trim() })), updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "" };
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
          {!f.id && <button onClick={() => setF((p) => ({ ...SAMPLE(), name: p.name || SAMPLE().name }))} className={`${btn} border border-[#DCE3EE] text-[#2D4C82]`}>태진 삼다수 예시로 채우기</button>}
          <button onClick={onClose} className={`${btn} text-[#5B6B85]`}>닫기</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
          <label className="block"><span className="text-[12.5px] font-black text-[#3A4A66]">양식 이름</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inp} placeholder="예: 태진 삼다수" /></label>
          <label className="block"><span className="text-[12.5px] font-black text-[#3A4A66]">거래처명(청구처)</span><input value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} className={inp} placeholder="모든 줄에 같은 거래처" /></label>
          <label className="block"><span className="text-[12.5px] font-black text-[#3A4A66]">하차일</span>
            <select value={f.dropOffset} onChange={(e) => setF({ ...f, dropOffset: +e.target.value })} className={inp}>
              <option value={0}>상차일과 같은 날</option><option value={1}>상차 다음 날</option><option value={2}>상차 이틀 뒤</option>
            </select></label>
          <label className="block"><span className="text-[12.5px] font-black text-[#3A4A66]">지급방식(기본)</span><input value={f.payMethod} onChange={(e) => setF({ ...f, payMethod: e.target.value })} className={inp} placeholder="예: 계산서" /></label>
        </div>

        <div className="text-[14px] font-black text-[#0F1A30] mb-2">칸(시트 제목줄 순서대로)</div>
        <div className="text-[12.5px] text-[#7A8AA6] mb-2">프로그램 칸 = 오더의 그 칸에 저장 · 수량 = 리터·박스 등 개수 · 합계 = 수량 합 자동 · 참고 = 오더에 그대로 보관(운송업체 등)</div>
        <div className="space-y-1.5 mb-3">
          {f.columns.map((c, i) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-[12px] font-black text-[#9AA9C3] text-right">{i + 1}</span>
              <input value={c.label} onChange={(e) => { const g = guessKind(e.target.value); setCol(i, c.label ? { label: e.target.value } : { label: e.target.value, ...g }); }} className={`${fieldInp} w-[150px]`} placeholder="칸 이름" />
              <select value={c.kind} onChange={(e) => setCol(i, { kind: e.target.value, field: e.target.value === "field" ? (c.field || guessKind(c.label).field || "메모") : undefined })} className={`${fieldInp} w-[130px]`}>
                {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              {c.kind === "field" && (
                <select value={c.field || ""} onChange={(e) => setCol(i, { field: e.target.value })} className={`${fieldInp} w-[130px]`}>
                  {FIELDS.map((x) => <option key={x}>{x}</option>)}
                </select>
              )}
              <button onClick={() => moveCol(i, -1)} className="h-9 w-8 rounded-lg border border-[#DCE3EE] text-[#5B6B85]">↑</button>
              <button onClick={() => moveCol(i, 1)} className="h-9 w-8 rounded-lg border border-[#DCE3EE] text-[#5B6B85]">↓</button>
              <button onClick={() => setF((p) => ({ ...p, columns: p.columns.filter((_, j) => j !== i) }))} className="h-9 px-2.5 rounded-lg text-[12.5px] font-bold text-red-500">삭제</button>
            </div>
          ))}
        </div>
        <button onClick={() => setF((p) => ({ ...p, columns: [...p.columns, col("", "extra")] }))} className={`${btn} border border-dashed border-[#B9C6DA] text-[#2D4C82] mb-6`}>＋ 칸 추가</button>

        <div className="text-[14px] font-black text-[#0F1A30] mb-2">묶음(상차지별 표)</div>
        <div className="text-[12.5px] text-[#7A8AA6] mb-2">시트에서 "배차 내역(1센터)"처럼 나뉜 표마다 하나씩. 기본 도착지는 새 날짜를 열면 미리 채워지는 줄입니다(한 줄에 "도착지 / 시군구").</div>
        <div className="space-y-3 mb-4">
          {f.groups.map((g, i) => (
            <div key={i} className="rounded-xl border border-[#E3E8F0] p-3">
              <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_1.4fr_auto] gap-2 mb-2">
                <input value={g.name} onChange={(e) => setGroup(i, { name: e.target.value })} className={fieldInp} placeholder="묶음 이름(1센터)" />
                <input value={g.상차지명} onChange={(e) => setGroup(i, { 상차지명: e.target.value })} className={fieldInp} placeholder="상차지명(비우면 묶음 이름)" />
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
  const co = String(companyName || "").trim();
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
  const [msg, setMsg] = React.useState("");
  const form = forms.find((f) => f.id === formId) || null;

  React.useEffect(() => {
    if (!co) return undefined;
    const u1 = onSnapshot(query(collection(db, "routeBoards"), where("companyName", "==", co)), (s) => setForms(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))), () => setForms([]));
    const u2 = onSnapshot(collection(db, "drivers"), (s) => setDrivers(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.차량번호)), () => setDrivers([]));
    const u3 = onSnapshot(collection(db, "places"), (s) => setPlaces(s.docs.map((d) => ({ _id: d.id, ...d.data() })).filter((p) => (!p.companyName || p.companyName === co) && p.업체명)), () => setPlaces([]));
    return () => { u1(); u2(); u3(); };
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
        const p = findPlace(d.하차지명);
        return { key: rid(), v: { ...(cN ? { [cN.id]: d.하차지명 } : {}), ...(cA ? { [cA.id]: p?.주소 || d.하차지주소 } : {}) }, dirty: true, extra: placeContact(p) };
      }); });
    }
    return out;
  }, [form, places]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!form || orders === null || dirty) return;
    setRows(buildRows(orders, true));
  }, [orders, form, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const findPlace = (name) => { const k = norm(name); return k ? places.find((p) => norm(p.업체명) === k) : null; };
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

  const colOf = (field) => form?.columns.find((c) => c.kind === "field" && c.field === field);
  const setCell = (g, i, c, val) => {
    setDirty(true);
    setRows((p) => ({ ...p, [g]: p[g].map((r, j) => (j === i ? { ...r, v: { ...r.v, [c.id]: val }, dirty: true } : r)) }));
  };
  // 칸에서 나갈 때 — 도착지는 등록된 하차지 풀주소, 차량번호는 기사관리의 이름·전화번호
  const onLeave = (g, i, c) => {
    const r = rows[g]?.[i]; if (!r) return;
    const val = r.v[c.id];
    if (c.field === "하차지명") {
      const p = findPlace(val); const cA = colOf("하차지주소");
      if (p) setRows((s) => ({ ...s, [g]: s[g].map((x, j) => (j === i ? { ...x, v: { ...x.v, ...(cA && p.주소 ? { [cA.id]: p.주소 } : {}) }, extra: placeContact(p), dirty: true } : x)) }));
    }
    if (c.field === "차량번호") {
      const d = findDriver(val); if (!d) return;
      const cN = colOf("이름"); const cP = colOf("전화번호");
      setRows((s) => ({ ...s, [g]: s[g].map((x, j) => (j === i ? { ...x, dirty: true, v: { ...x.v, [c.id]: d.차량번호,
        ...(cN && !String(x.v[cN.id] || "").trim() ? { [cN.id]: d.이름 || "" } : {}),
        ...(cP && !String(x.v[cP.id] || "").trim() ? { [cP.id]: d.전화번호 || "" } : {}) } } : x)) }));
    }
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

  const save = async () => {
    setBusy("save");
    try {
      const prevById = new Map((orders || []).map((o) => [o._id, o]));
      let saved = 0;
      const writes = [];
      form.groups.forEach((g) => {
        (rows[g.name] || []).forEach((r, i) => {
          if (rowEmpty(form, r)) { if (r._id) writes.push(deleteOrderWithLog("orders", r._id)); return; }
          const prev = r._id ? prevById.get(r._id) : null;
          if (prev && !r.dirty && prev.배차표순번 === i + 1 && prev.배차표묶음 === g.name) return;
          const id = r._id || `rb_${form.id}_${date}_${rid()}`;
          const data = orderFromRow({ ...form }, g, r, i, date, co, !prev, prev?.배차상태);
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
        if (!k || seen.has(k) || findPlace(name)) return;
        seen.add(k);
        writes.push(setDoc(doc(db, "places", coDocKey(co, k)), { 업체명: name, 주소: String(r.v[cA?.id] || "").trim(), companyName: co, 등록경로: "배차표", createdAt: serverTimestamp() }, { merge: true }).catch(() => {}));
      });
      await Promise.all(writes);
      setDirty(false); setRemoved([]);
      setMsg(`저장했습니다 — 오더 ${saved}건 반영${removed.length ? ` · ${removed.length}건 삭제` : ""}. 배차관리·정산에 바로 보입니다.`);
    } catch (e) { kpAlert(`저장 실패: ${e?.message || e}`); } finally { setBusy(""); }
  };
  React.useEffect(() => { if (!msg) return undefined; const t = setTimeout(() => setMsg(""), 4000); return () => clearTimeout(t); }, [msg]);

  const delForm = async () => {
    if (!(await kpConfirm(`'${form.name}' 양식을 지울까요?\n(이미 만든 오더는 지워지지 않습니다)`))) return;
    await deleteDoc(doc(db, "routeBoards", form.id)).catch((e) => kpAlert(e.message));
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
        <select value={formId} onChange={(e) => setFormId(e.target.value)} className={`${inp} w-[220px]`}>
          {!forms.length && <option value="">양식 없음</option>}
          {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button onClick={() => setEdit(BLANK())} className={`${btn} border border-[#DCE3EE] text-[#2D4C82]`}>＋ 새 양식</button>
        {form && <button onClick={() => setEdit(form)} className={`${btn} border border-[#DCE3EE] text-[#3A4A66]`}>양식 수정</button>}
        {form && <button onClick={delForm} className={`${btn} text-red-500`}>양식 삭제</button>}
        <div className="flex-1" />
        {form && (
          <>
            <button onClick={() => setDate(addDays(date, -1))} className="h-10 w-10 rounded-xl border border-[#DCE3EE] font-black text-[#3A4A66]">‹</button>
            <div className="w-[150px]"><CustomDatePicker value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inp} /></div>
            <button onClick={() => setDate(addDays(date, 1))} className="h-10 w-10 rounded-xl border border-[#DCE3EE] font-black text-[#3A4A66]">›</button>
            <span className="text-[13px] font-bold text-[#3A4A66] whitespace-nowrap">상차 {dLabel(date)} → 하차 {dLabel(drop)}</span>
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
          <button onClick={() => setEdit(SAMPLE())} className={`${btn} bg-[#0F1A30] text-white px-6`}>양식 만들기</button>
        </div>
      ) : orders === null ? (
        <div className={`${card} p-10 text-center text-[14px] text-[#7A8AA6]`}>불러오는 중…</div>
      ) : (
        <>
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
                                : c.kind === "sum" ? <div className="text-center font-black text-[#0F1A30]">{rowSum(form, r) || ""}</div>
                                  : (
                                    <input value={r.v[c.id] ?? ""} onChange={(e) => setCell(g.name, i, c, e.target.value)} onBlur={() => onLeave(g.name, i, c)} onKeyDown={onKey}
                                      data-g={g.name} data-r={i} data-c={ci}
                                      list={c.field === "하차지명" ? "rb-places" : c.field === "차량번호" ? "rb-plates" : undefined}
                                      inputMode={c.kind === "qty" || MONEY_FIELDS.has(c.field) ? "numeric" : undefined}
                                      placeholder={TIME_FIELDS.has(c.field) ? "16:00" : ""}
                                      className={`${cellCls} ${c.kind === "qty" ? "text-center" : ""}`} />
                                  )}
                            </td>
                          ))}
                          <td className="border border-[#E3E8F0] text-center text-[12px] font-bold whitespace-nowrap px-1">
                            {!r._id ? <span className="text-amber-600">새 줄</span> : r.status === "배차완료" ? <span className="text-emerald-600">배차완료</span> : r.status === "배차취소" ? <span className="text-red-500">배차취소</span> : <span className="text-[#7A8AA6]">{r.status || "배차중"}</span>}
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
            </div>
          )}
          <datalist id="rb-places">{places.slice(0, 3000).map((p) => <option key={p._id} value={p.업체명}>{p.주소}</option>)}</datalist>
          <datalist id="rb-plates">{drivers.slice(0, 3000).map((d) => <option key={d.id} value={d.차량번호}>{d.이름}</option>)}</datalist>
        </>
      )}

      {edit && <FormEditor init={edit} co={co} onClose={() => setEdit(null)} onSaved={(id) => { setEdit(null); setFormId(id); setMsg("양식을 저장했습니다."); }} />}
    </div>
  );
}
