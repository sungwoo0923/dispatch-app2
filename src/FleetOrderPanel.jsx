// ======================= src/FleetOrderPanel.jsx =======================
// 🧾 2026-11-02 노선관리(지입차관리 › 노선관리 ROUTE) 오더 수정 패널
//  배차관리 4/5파트 "오더 복사 / 수정 패널"과 같은 모양·같은 입력칸(라벨 왼쪽 + 테두리 박스형 칸)으로 맞춘다.
//   · 오더 줄을 두 번 누르면(더블클릭) 열린다 · 오른쪽 메뉴의 "수정"도 이 패널
//   · [수정 저장] → 그 오더 문서(orders / dispatch)에 고친 칸만 저장(나머지 필드는 그대로) + updatedAt
//     금액은 숫자로 저장, 수수료 = 청구운임 − 기사운임
//   · 닫기는 Esc 또는 [닫기]만(바깥 어두운 곳을 눌러도 닫히지 않음 — 입력하다 실수로 닫히지 않게)
import React from "react";
import { createPortal } from "react-dom";
import { doc } from "firebase/firestore";
import { db } from "./firebase";
import { getTenant } from "./fsTenant";
import { updateDoc } from "./orderWrite"; // 오더 수정시각(_lastModified) 자동 기록
import { kpConfirm, kpAlert } from "./kpDialog";
import CustomDatePicker from "./CustomDatePicker";
import { CustomSelect } from "./CustomSelect";
import { VehicleTypePicker } from "./vehicleTypes";
import { useFareRules, FareTypeSelect, FareRuleHint, FarePctInput, fareFormChange } from "./fareRules";
import { SpecialFareButton, forkliftApply, FORKLIFT_KEYS, SPECIAL_KEYS, paidOut } from "./forklift"; // 🏗 2026-11-09 지게차비용
import { CompanyOptionPicker } from "./companyOptionPicker"; // 🧾 2026-11-02 지급방식·배차방식·상/하차방법 공용 선택기(＋ 추가)
import { fmtPhone } from "./formatInput";

const MONO = "'JetBrains Mono',ui-monospace,monospace";
// 배차관리 오더 복사/수정 패널과 같은 입력칸
const cpInputStyle =
  "w-full h-9 border border-[#C9D5EA] rounded-lg px-2.5 py-1.5 text-[14.5px] font-bold text-gray-900 bg-[#F9FBFE] hover:border-[#9FB2D3] focus:outline-none focus:bg-white focus:border-[#2D4C82] focus:ring-4 focus:ring-[#2D4C82]/10 focus:text-[#0B1428] disabled:bg-[#F1F4F9] disabled:text-gray-500 transition";
const taStyle = "w-full min-h-[96px] px-3 py-2 text-[14px] rounded-lg border border-[#D5DEEC] bg-white resize-y focus:outline-none focus:ring-2 focus:ring-[#1B2B4B]/25 focus:border-[#1B2B4B] placeholder:text-gray-500 transition-all";

const CpField = ({ label, children }) => (
  <div className="group relative grid grid-cols-[112px_minmax(0,1fr)] items-center gap-2 min-h-[40px] -mx-2 px-2 rounded-lg transition-colors focus-within:bg-[#EEF3FC]">
    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[#2D4C82] opacity-0 group-focus-within:opacity-100 transition-opacity" />
    <div className="text-[13.5px] font-bold text-[#5B6B85] flex items-center gap-1 leading-tight whitespace-nowrap group-focus-within:text-[#0B1428] group-focus-within:font-black">{label}</div>
    <div className="min-w-0">{children}</div>
  </div>
);
const SecHead = ({ children, sub }) => (
  <div className="px-5 pt-3.5 pb-0 flex items-baseline gap-2">
    <h3 className="text-[14px] font-bold text-[#1B2B4B] flex items-center gap-1.5 whitespace-nowrap"><span className="w-1 h-3.5 bg-[#1B2B4B] rounded-full inline-block" />{children}</h3>
    {sub && <span className="text-[12px] font-semibold text-[#9AA9C3] truncate">{sub}</span>}
  </div>
);

// 상·하차시간 — 배차관리와 같은 "오전/오후 + 시간" 고르기(저장 모양: "오전 9시", "오후 2시 30분")
function TimeAmPm({ value, onChange }) {
  const [ampm, setAmpm] = React.useState(() => (/^오후/.test(value || "") ? "오후" : /^오전/.test(value || "") ? "오전" : null));
  React.useEffect(() => { if (/^오전/.test(value || "")) setAmpm("오전"); else if (/^오후/.test(value || "")) setAmpm("오후"); else if (!value) setAmpm(null); }, [value]);
  const times = React.useMemo(() => {
    const list = [];
    for (let h = 0; h < 12; h++) { const hh = h === 0 ? 12 : h; list.push(`${ampm ? `${ampm} ` : ""}${hh}시`, `${ampm ? `${ampm} ` : ""}${hh}시 30분`); }
    return list;
  }, [ampm]);
  const known = !value || times.includes(value);
  const pickAp = (ap) => { setAmpm(ap); if (value) onChange(`${ap} ${String(value).replace(/^오전 |^오후 /, "")}`); };
  const b = (on) => `shrink-0 whitespace-nowrap px-2.5 h-9 text-[12.5px] font-bold rounded-lg border transition ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-[#C9D5EA] hover:border-[#1B2B4B] hover:text-[#1B2B4B]"}`;
  return (
    <div className="flex items-center gap-1 flex-nowrap min-w-0">
      <button type="button" className={b(ampm === "오전")} onClick={() => pickAp("오전")}>오전</button>
      <button type="button" className={b(ampm === "오후")} onClick={() => pickAp("오후")}>오후</button>
      <CustomSelect value={value || ""} onChange={(e) => onChange(e.target.value)} className={`${cpInputStyle} min-w-0 flex-1`}>
        <option value="">즉시</option>
        {!known && <option value={value}>{value}</option>}
        {times.map((t) => <option key={t} value={t}>{t.replace(/^오전 |^오후 /, "")}</option>)}
      </CustomSelect>
    </div>
  );
}

const MoneyInput = ({ value, onChange }) => (
  <input autoComplete="off" inputMode="numeric" className={`${cpInputStyle} text-right tabular-nums`} style={{ fontFamily: MONO }}
    value={value !== "" && value != null && !Number.isNaN(Number(value)) ? Number(value).toLocaleString() : (value || "")}
    onChange={(e) => onChange(e.target.value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, ""))} />
);

// 이 패널에서 고치는 칸(저장할 때 이 칸만 보낸다 — 다른 필드는 손대지 않음)
const TEXT_KEYS = [
  "거래처명", "거래처담당자", "거래처전화번호",
  "상차일", "상차시간", "상차방법", "상차지명", "상차지주소", "상차지담당자", "상차지담당자번호",
  "하차일", "하차시간", "하차방법", "하차지명", "하차지주소", "하차지담당자", "하차지담당자번호",
  "차량번호", "이름", "전화번호", "차량종류", "차량톤수", "화물내용",
  "지급방식", "배차방식", "운임구분", "메모", "전달사항",
];
const MONEY_KEYS = ["청구운임", "기사운임"];
const toNum = (v) => { const n = Number(String(v ?? "").replace(/[^\d-]/g, "")); return Number.isFinite(n) ? n : 0; };
const initForm = (o) => {
  const f = {};
  TEXT_KEYS.forEach((k) => { f[k] = o?.[k] == null ? "" : String(o[k]); });
  MONEY_KEYS.forEach((k) => { f[k] = o?.[k] === "" || o?.[k] == null ? "" : String(toNum(o[k])); });
  f.운임수동 = !!o?.운임수동;
  f.운임구분수수료율 = o?.운임구분수수료율 == null ? "" : String(o.운임구분수수료율); // ⭐ 2026-11-09 이 오더 수수료율
  // 🏗 2026-11-09 지게차비용
  ["지게차비용", "지게차기사차감", "지게차청구추가"].forEach((k) => { f[k] = o?.[k] ? String(toNum(o[k])) : ""; });
  ["지게차부담", "지게차기사ID", "지게차기사명", "지게차기사전화", "지게차회사"].forEach((k) => { f[k] = o?.[k] == null ? "" : String(o[k]); });
  // 🧾 2026-11-09 특수운임(지게차 외) — 배열 그대로 · 반영해 둔 양
  f.특수운임 = Array.isArray(o?.특수운임) ? o.특수운임 : [];
  ["특수기사차감", "특수청구추가", "외부지급합"].forEach((k) => { f[k] = o?.[k] ? toNum(o[k]) : 0; });
  return f;
};

// ⭐ 2026-11-07 입력 도우미 — 지난 오더에서 거래처명·상/하차지·차량번호·기사명·톤수를 모아 목록으로 보여준다(<datalist>).
//  목록에 없는 값도 그대로 입력할 수 있고, 차량번호·상하차지명을 목록에서 고르면 비어 있던(또는 처음 값 그대로인) 이어지는 칸을 채운다.
const SUGGEST_MAX = 400;
const TON_SUGGEST = ["1톤", "1.4톤", "2.5톤", "3.5톤", "5톤", "5톤축", "8톤", "9.5톤", "11톤", "14톤", "18톤", "25톤"];
function buildSuggest(rows) {
  const by = { client: new Map(), place: new Map(), car: new Map(), name: new Map(), ton: new Map() };
  const put = (m, k, rec) => { const key = String(k || "").trim(); if (!key || key.length > 60) return; const cur = m.get(key); m.set(key, { n: (cur?.n || 0) + 1, rec: cur?.rec || rec }); };
  (Array.isArray(rows) ? rows : []).slice(-6000).reverse().forEach((r) => {
    if (!r) return;
    put(by.client, r.거래처명, r);
    put(by.place, r.상차지명, { 주소: r.상차지주소, 담당자: r.상차지담당자, 번호: r.상차지담당자번호 });
    put(by.place, r.하차지명, { 주소: r.하차지주소, 담당자: r.하차지담당자, 번호: r.하차지담당자번호 });
    put(by.car, r.차량번호, { 이름: r.이름, 전화번호: r.전화번호 });
    put(by.name, r.이름, r);
    put(by.ton, r.차량톤수, r);
  });
  const top = (m) => [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, SUGGEST_MAX).map(([k]) => k);
  return { client: top(by.client), place: top(by.place), car: top(by.car), name: top(by.name), ton: [...new Set([...TON_SUGGEST, ...top(by.ton)])], placeMap: by.place, carMap: by.car };
}

export default function FleetOrderPanel({ order, onClose, onCopy, companyName = "", pastOrders = [] }) {
  const co = String(getTenant() || companyName || "").trim();
  const fareR = useFareRules(co);
  const fareOn = !!fareR.on;
  const [form, setForm] = React.useState(() => initForm(order));
  const base = React.useRef(initForm(order));
  const [saving, setSaving] = React.useState(false);
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => { const t = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(t); }, []);
  const dirty = React.useMemo(() => Object.keys(form).some((k) => String(form[k] ?? "") !== String(base.current[k] ?? "")), [form]);
  const set = (k) => (v) => setForm((p) => ({ ...p, [k]: v && v.target ? v.target.value : v }));
  const sg = React.useMemo(() => buildSuggest(pastOrders), [pastOrders]);
  // 목록에서 고른 값이면 이어지는 칸 채우기 — 비어 있거나 처음 열었을 때 값 그대로인 칸만(손으로 고친 칸은 그대로)
  const untouched = (p, k) => !String(p[k] ?? "").trim() || String(p[k] ?? "") === String(base.current[k] ?? "");
  const setPlace = (kind) => (e) => {
    const v = e.target.value;
    setForm((p) => {
      const next = { ...p, [`${kind}지명`]: v };
      const hit = sg.placeMap.get(String(v).trim())?.rec;
      if (hit && v !== base.current[`${kind}지명`]) {
        if (hit.주소 && untouched(p, `${kind}지주소`)) next[`${kind}지주소`] = hit.주소;
        if (hit.담당자 && untouched(p, `${kind}지담당자`)) next[`${kind}지담당자`] = hit.담당자;
        if (hit.번호 && untouched(p, `${kind}지담당자번호`)) next[`${kind}지담당자번호`] = hit.번호;
      }
      return next;
    });
  };
  const setCar = (e) => {
    const v = e.target.value;
    setForm((p) => {
      const next = { ...p, 차량번호: v };
      const hit = sg.carMap.get(String(v).trim())?.rec;
      if (hit && v !== base.current.차량번호) {
        if (hit.이름 && untouched(p, "이름")) next.이름 = hit.이름;
        if (hit.전화번호 && untouched(p, "전화번호")) next.전화번호 = hit.전화번호;
      }
      return next;
    });
  };
  const setFare = (k, v) => setForm((p) => (fareOn ? fareFormChange(p, k, v, fareR.rules, { withFee: false }) : forkliftApply(p, { ...p, [k]: v }, k)));
  const fee = toNum(form.청구운임) - toNum(form.기사운임) - paidOut(form); // 🧾 수익 = 청구 − 기사 − 회사가 따로 주는 돈(지게차·특수운임)
  const shipper = order?.source === "shipper" || order?.source === "shipper_mobile";

  const tryClose = React.useCallback(async () => {
    if (saving) return;
    if (dirty && !(await kpConfirm("고친 내용을 저장하지 않고 닫을까요?", { title: "닫기", okText: "저장 안 하고 닫기" }))) return;
    onClose();
  }, [dirty, saving, onClose]);

  const save = async () => {
    if (saving) return;
    const id = order?._id || order?.id;
    if (!id) { kpAlert("수정할 오더 번호가 없습니다."); return; }
    if (form.상차일 && form.하차일 && form.하차일 < form.상차일) { kpAlert("하차일이 상차일보다 빠릅니다. 날짜를 확인해 주세요."); return; }
    setSaving(true);
    try {
      const patch = { updatedAt: Date.now() };
      TEXT_KEYS.forEach((k) => { if (String(form[k] ?? "") !== String(base.current[k] ?? "")) patch[k] = String(form[k] ?? "").trim(); });
      const moneyChanged = MONEY_KEYS.concat(["지게차비용", "지게차부담", "지게차기사ID"]).some((k) => String(form[k] ?? "") !== String(base.current[k] ?? "")) || JSON.stringify(form.특수운임 || []) !== JSON.stringify(base.current.특수운임 || []);
      if (moneyChanged || "운임구분" in patch) {
        patch.청구운임 = toNum(form.청구운임);
        patch.기사운임 = toNum(form.기사운임);
        patch.수수료 = patch.청구운임 - patch.기사운임 - paidOut(form); // 🏗 수익 = 청구 − 기사 − 지게차·특수운임(회사 지급분)
        SPECIAL_KEYS.forEach((k) => { if (JSON.stringify(form[k] ?? null) !== JSON.stringify(base.current[k] ?? null)) patch[k] = k === "특수운임" ? (form[k] || []) : toNum(form[k]); }); // 🧾 특수운임
        FORKLIFT_KEYS.concat(["지게차기사차감", "지게차청구추가"]).forEach((k) => { if (String(form[k] ?? "") !== String(base.current[k] ?? "")) patch[k] = k === "지게차비용" || k === "지게차기사차감" || k === "지게차청구추가" ? toNum(form[k]) : String(form[k] ?? ""); });
        if (String(form.운임구분 || "").trim()) patch.운임수동 = !!form.운임수동;
        if (String(form.운임구분 || "").trim() && String(form.운임구분수수료율 ?? "") !== "") patch.운임구분수수료율 = Number(form.운임구분수수료율) || 0; // ⭐ 2026-11-09 이 오더 수수료율
      }
      if (patch.거래처명 !== undefined && !patch.거래처명) delete patch.거래처명; // 거래처명은 비워 저장하지 않음
      // 서버 확인(ack)이 늦어도 화면은 바로 반영된다(Firestore 즉시 반영) — 1.2초 안에 거부되면 패널을 그대로 두고 알림,
      //  그 뒤 실패하면 닫힌 뒤에라도 알린다(배차관리 오더 수정 패널과 같은 방식)
      const pr = updateDoc(doc(db, order.__col || "orders", id), patch);
      const early = await Promise.race([pr.then(() => "ok"), new Promise((r) => setTimeout(() => r("wait"), 1200))]);
      if (early === "wait") pr.catch((e) => { console.error("[노선관리 오더 수정] 저장 실패", e); kpAlert(`오더 저장이 서버에서 거부되었습니다${e?.code ? ` (${e.code})` : ""}. 다시 열어 확인해 주세요.`); });
      onClose(true);
    } catch (e) {
      console.error("[노선관리 오더 수정] 저장 실패", e);
      kpAlert(`저장하지 못했습니다${e?.code ? ` (${e.code})` : ""}. 잠시 후 다시 시도해 주세요.`);
      setSaving(false);
    }
  };

  // Esc = 닫기 — 안쪽 목록·달력·확인창이 열려 있으면 그쪽이 먼저 닫힌다
  React.useEffect(() => {
    const k = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector("[data-kp-popup], [data-vt-menu], [data-vt-dialog], [data-fare-menu], [data-kp-dialog]")) return;
      e.preventDefault(); tryClose();
    };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [tryClose]);

  const route = [order?.상차지명, order?.하차지명].filter(Boolean).join(" → ");

  const side = (kind) => {
    const p = kind; // "상차" | "하차"
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={`inline-flex items-center h-6 px-2 rounded-md text-[12px] font-black ${p === "상차" ? "bg-[#0F1A30] text-white" : "bg-[#EEF3FC] text-[#1B2B4B] border border-[#C9D6EE]"}`}>{p}</span>
          <span className="text-[11px] font-extrabold tracking-[0.18em] text-[#9AA9C3]" style={{ fontFamily: MONO }}>{p === "상차" ? "PICKUP" : "DROP"}</span>
        </div>
        <CpField label={`${p}일`}><CustomDatePicker className={cpInputStyle} value={form[`${p}일`]} onChange={(e) => set(`${p}일`)(e.target.value)} openOnFocus={false} /></CpField>
        <CpField label={`${p}시간`}><TimeAmPm value={form[`${p}시간`]} onChange={set(`${p}시간`)} /></CpField>
        <CpField label={`${p}방법`}>
          <CompanyOptionPicker optKey="상하차방법" title={`${p}방법`} placeholder="선택" noneLabel="선택" className={cpInputStyle} value={form[`${p}방법`]} onChange={(v) => set(`${p}방법`)({ target: { value: v } })} />
        </CpField>
        <CpField label={`${p}지명`}><input autoComplete="off" list="kp-fop-place" placeholder="지난 오더에서 고르거나 입력" className={cpInputStyle} value={form[`${p}지명`]} onChange={setPlace(p)} /></CpField>
        <CpField label={`${p}지주소`}><input autoComplete="off" className={cpInputStyle} value={form[`${p}지주소`]} onChange={set(`${p}지주소`)} title={form[`${p}지주소`]} /></CpField>
        <CpField label={`${p}지 담당자명`}><input autoComplete="off" className={cpInputStyle} value={form[`${p}지담당자`]} onChange={set(`${p}지담당자`)} /></CpField>
        <CpField label={`${p}지 연락처`}><input autoComplete="off" inputMode="tel" className={cpInputStyle} value={form[`${p}지담당자번호`]} onChange={(e) => set(`${p}지담당자번호`)(fmtPhone(e.target.value))} /></CpField>
      </div>
    );
  };

  return createPortal(
    <div data-fleet-order-panel="1" className="fixed inset-0 z-[100010]" onKeyDown={(e) => { if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") e.stopPropagation(); }}>
      {/* 바깥을 눌러도 닫히지 않는다 — Esc · [닫기]로만 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200" style={{ opacity: shown ? 1 : 0 }} />
      <div role="dialog" aria-modal="true" aria-label="오더 수정"
        className="absolute top-0 right-0 h-full w-[min(1180px,96vw)] bg-[#F4F6FA] shadow-2xl border-l border-[#DCE3EE] overflow-y-auto"
        style={{ transform: shown ? "translateX(0)" : "translateX(100%)", transition: "transform .26s cubic-bezier(.2,.8,.2,1)", fontFamily: "'Pretendard','Noto Sans KR',sans-serif" }}>
        <div className="px-5 pb-5 space-y-4 text-[14px]">
          <datalist id="kp-fop-client">{sg.client.map((v) => <option key={v} value={v} />)}</datalist>
          <datalist id="kp-fop-place">{sg.place.map((v) => <option key={v} value={v} />)}</datalist>
          <datalist id="kp-fop-car">{sg.car.map((v) => <option key={v} value={v} />)}</datalist>
          <datalist id="kp-fop-name">{sg.name.map((v) => <option key={v} value={v} />)}</datalist>
          <datalist id="kp-fop-ton">{sg.ton.map((v) => <option key={v} value={v} />)}</datalist>
          {/* HEADER */}
          <div className="sticky top-0 z-20 -mx-5 mb-1 flex justify-between items-center gap-3 px-5 py-2.5 text-white shadow-[0_6px_18px_rgba(11,20,40,0.25)]"
            style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
            <div className="min-w-0">
              <div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>ORDER · COPY / EDIT</div>
              <h2 className="text-[18px] font-black leading-tight truncate">오더 수정 <span className="ml-1 text-[13.5px] font-semibold text-white/60">{[order?.거래처명, route].filter(Boolean).join(" · ")}</span></h2>
            </div>
            <div className="flex gap-2 items-center shrink-0">
              {dirty && <span className="hidden sm:inline-flex items-center h-6 px-2 rounded-md bg-[#8FB0F0]/20 text-[#CFE0FF] text-[11.5px] font-black whitespace-nowrap">고친 내용 있음</span>}
              {onCopy && <button type="button" onClick={onCopy} className="px-3.5 h-8 rounded-lg text-[13px] font-bold transition bg-white/10 hover:bg-white/20 ring-1 ring-white/25 text-white whitespace-nowrap">기사복사</button>}
              <button type="button" onClick={save} disabled={saving} className="px-3.5 h-8 bg-white text-[#0F1A30] rounded-lg text-[13px] font-black hover:bg-[#EEF3FB] transition disabled:opacity-60 whitespace-nowrap">{saving ? "저장 중…" : "수정 저장"}</button>
              <button type="button" onClick={tryClose} title="닫기 (Esc)" aria-label="닫기" className="h-8 px-2.5 flex items-center gap-1 rounded-lg border border-white/25 text-white/80 hover:text-white hover:bg-white/10 transition text-[13px] font-bold whitespace-nowrap">✕ 닫기</button>
            </div>
          </div>

          {shipper && <div className="rounded-xl border border-[#C9D6EE] bg-[#EEF3FC] px-4 py-2.5 text-[13px] font-bold text-[#1B2B4B]">화주사에서 등록한 오더입니다 — 화주사 화면에도 같은 오더가 있으니 고친 내용을 화주사에 알려 주세요.</div>}

          {/* 거래처 정보 */}
          <section className="bg-white rounded-xl border border-[#E3E8F0] overflow-hidden">
            <div className="bg-[#1B2B4B] px-5 py-2"><h3 className="text-[14px] font-bold text-white">거래처 정보</h3></div>
            <div className="px-5 py-3 grid grid-cols-1 lg:grid-cols-3 gap-x-6 gap-y-1.5">
              <CpField label="거래처명"><input autoComplete="off" list="kp-fop-client" placeholder="지난 오더에서 고르거나 입력" className={cpInputStyle} value={form.거래처명} onChange={set("거래처명")} /></CpField>
              <CpField label="거래처 담당자"><input autoComplete="off" className={cpInputStyle} value={form.거래처담당자} onChange={set("거래처담당자")} /></CpField>
              <CpField label="거래처 연락처"><input autoComplete="off" inputMode="tel" className={cpInputStyle} value={form.거래처전화번호} onChange={(e) => set("거래처전화번호")(fmtPhone(e.target.value))} /></CpField>
            </div>
          </section>

          {/* 상하차 정보 */}
          <section className="bg-white rounded-xl border border-[#E3E8F0] overflow-hidden">
            <div className="bg-[#1B2B4B] px-5 py-2"><h3 className="text-[14px] font-bold text-white">상하차 정보</h3></div>
            <div className="px-5 py-3 grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3">{side("상차")}{side("하차")}</div>
          </section>

          {/* 기사 · 화물 · 결제 · 메모 */}
          <section className="bg-white rounded-xl border border-[#E3E8F0] overflow-hidden">
            <SecHead sub="바꾸면 이 오더가 다른 기사님 노선으로 옮겨집니다">기사정보</SecHead>
            <div className="px-5 py-3 grid grid-cols-1 lg:grid-cols-3 gap-x-6 gap-y-1.5">
              <CpField label="차량번호"><input autoComplete="off" list="kp-fop-car" className={cpInputStyle} value={form.차량번호} onChange={setCar} /></CpField>
              <CpField label="기사명"><input autoComplete="off" list="kp-fop-name" className={cpInputStyle} value={form.이름} onChange={set("이름")} /></CpField>
              <CpField label="전화번호"><input autoComplete="off" inputMode="tel" className={cpInputStyle} value={form.전화번호} onChange={(e) => set("전화번호")(fmtPhone(e.target.value))} /></CpField>
            </div>
            <div className="mx-5 border-t border-dashed border-[#E3E8F0]" />
            <SecHead>화물정보</SecHead>
            <div className="px-5 py-3 grid grid-cols-1 lg:grid-cols-3 gap-x-6 gap-y-1.5">
              <CpField label="차량종류"><VehicleTypePicker className={cpInputStyle} company={co} value={form.차량종류} placeholder="선택" noneLabel="선택 안 함" onChange={set("차량종류")} /></CpField>
              <CpField label="차량톤수"><input autoComplete="off" list="kp-fop-ton" className={cpInputStyle} value={form.차량톤수} onChange={set("차량톤수")} placeholder="예: 5톤" /></CpField>
              <CpField label="화물내용"><input autoComplete="off" className={cpInputStyle} value={form.화물내용} onChange={set("화물내용")} /></CpField>
            </div>
            <div className="mx-5 border-t border-dashed border-[#E3E8F0]" />
            <SecHead>결제 정보</SecHead>
            <div className="px-5 py-3 grid grid-cols-1 lg:grid-cols-3 gap-x-6 gap-y-1.5">
              <CpField label="청구운임"><MoneyInput value={form.청구운임} onChange={(v) => setFare("청구운임", v)} /></CpField>
              <CpField label="기사운임"><MoneyInput value={form.기사운임} onChange={(v) => setFare("기사운임", v)} /></CpField>
              <CpField label="수수료">
                <div className={`h-9 flex items-center justify-end bg-[#EEF2F8] border border-[#DCE4F0] rounded-lg px-2.5 font-black text-[15px] whitespace-nowrap tabular-nums ${fee < 0 ? "text-red-600" : "text-[#1B2B4B]"}`} style={{ fontFamily: MONO }}>{fee.toLocaleString()} 원</div>
              </CpField>
              <CpField label="지급방식">
                <CompanyOptionPicker optKey="지급방식" placeholder="선택" noneLabel="선택" className={cpInputStyle} value={form.지급방식} onChange={(v) => set("지급방식")({ target: { value: v } })} />
              </CpField>
              {fareOn && (
                <CpField label={<>운임구분<FareRuleHint className="ml-1" form={form} rules={fareR.rules} onReapply={() => setFare("__reapply", null)} /></>}>
                  <div className="flex items-center gap-1.5"><FareTypeSelect pct={form.운임구분수수료율} className="!h-9 !rounded-lg flex-1 min-w-0" rules={fareR.rules} value={form.운임구분 || ""} onChange={(v) => setFare("운임구분", v)} /><FarePctInput form={form} rules={fareR.rules} onChange={(v) => setFare("운임구분수수료율", v)} /></div>
                </CpField>
              )}
              <div className="col-span-full"><SpecialFareButton form={form} setForm={setForm} /></div>{/* 🏗 2026-11-09 지게차비용 */}
              <CpField label="배차방식">
                <CompanyOptionPicker optKey="배차방식" placeholder="선택" noneLabel="선택" className={cpInputStyle} value={form.배차방식 === "선택없음" ? "" : form.배차방식} onChange={(v) => set("배차방식")({ target: { value: v } })} />
              </CpField>
            </div>
            <div className="mx-5 border-t border-dashed border-[#E3E8F0]" />
            <SecHead>메모 / 전달사항</SecHead>
            <div className="px-5 py-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div><label className="block text-[13.5px] font-bold text-[#5B6B85] mb-1">메모</label><textarea className={taStyle} placeholder="메모를 입력하세요" value={form.메모} onChange={set("메모")} /></div>
              <div><label className="block text-[13.5px] font-bold text-[#5B6B85] mb-1">전달사항</label><textarea className={taStyle} placeholder="기사에게 전달할 내용" value={form.전달사항} onChange={set("전달사항")} /></div>
            </div>
          </section>
          <div className="flex items-center justify-between gap-3 text-[12.5px] font-semibold text-[#9AA9C3]">
            <span>저장하면 배차관리·배차현황·기사앱에 바로 반영됩니다 · 금액은 숫자로, 수수료는 청구운임 − 기사운임으로 저장</span>
            <span className="whitespace-nowrap" style={{ fontFamily: MONO }}>Esc 닫기</span>
          </div>
        </div>
      </div>
    </div>, document.body);
}
