// ======================= cafe-site/src/hub/HubPostForm.jsx =======================
// ⭐ 2026-11-06 오더 등록 · 수정(화주 · 운송사)
// ⭐ 2026-11-07 (3차) 화물등록 구조 정리(24시콜 화면 구조 참고, 디자인은 허브 그대로)
//  상차지 · 하차지: 상하차지명(선택, 저장한 곳 자동완성) · 주소(필수, 지역 · 도로명 · 지번 자동완성) · 시·도/시·군·구 · 담당자 · 연락처 · 일시
//  옵션: 혼적 · 왕복 · 긴급 · 예약 / 목록: 차량톤수 · 차량종류 · 상차방법 · 하차방법 · 대수 · 지불방식 / 화물중량(톤 이하) · 기타내용
//  운송료(▲5,000 ▼5,000 · 참고 운임 불러오기) · 수수료 · 총합계(자동) · 의뢰자구분(필수) + 사업자번호(운수사면 필수, 내 번호 안 됨)
//  차주앱 표시(즉시 · 예약) · [오더복사](같은 회사 기록 + 로지스웹 계정은 회사 배차 오더) · [설정](기본값 · 지급예정일)
//  비공개(배차 확정 후 배차된 차주에게만): 상하차지명 · 주소 · 담당자 · 연락처 · 메모 · 의뢰자
import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { HI, Btn, Field, inputCls, selectCls, Seg, Chip, Drawer, NUMS } from "./hubUi";
import {
  SIDO_LIST, sigunguOf, HUB_VEHICLES, HUB_TONS, PAY_METHODS, LOAD_METHODS, COUNT_OPTIONS, REQUESTER_TYPES, PAY_TERM_OPTIONS, estimateKm, referenceFare,
  fareFitness, manwon, kstYmd, fmtPhone, fmtBizNo, bizNoValid, payKind, PAY_HINT, defaultFee, isLinked, regionFromAddress, matchListValue, tsMs, dayLabel,
} from "./hubConstants";
import { postOrder, updateOrder, subscribeHubPlaces, fetchLwPlaces, fetchCopySources, fetchCopyDetail, updatePrefs } from "./hubApi";
import { scanToHub, hubToScan } from "./hubScan";
import { hubScanAi } from "./hubScanAi"; // 🧠 2026-11-07 오더 스캔 정밀 인식(서버 글자 인식 · AI 칸 정리 · 회사별 학습)
import { AddressInput, PlaceInput } from "./hubAddress";
const OrderScanModal = lazy(() => import("../../../src/OrderScanModal"));

const HOURS = Array.from({ length: 24 }, (_, h) => [`${String(h).padStart(2, "0")}:00`, `${String(h).padStart(2, "0")}:30`]).flat();
const money = (v) => { const d = String(v).replace(/[^\d]/g, "").slice(0, 9); return d ? Number(d).toLocaleString() : ""; };
const numOf = (v) => Number(String(v || "").replace(/[^\d]/g, "")) || 0;
const blank = (me) => {
  const d = me?.prefs?.post || {};
  return {
    상차시도: "", 상차시군구: "", 상차지명: "", 상차지주소: "", 상차담당자: "", 상차연락처: me?.phone || "",
    하차시도: "", 하차시군구: "", 하차지명: "", 하차지주소: "", 하차담당자: "", 하차연락처: "",
    상차일: kstYmd(), 상차시간: "09:00", 하차일: kstYmd(), 하차시간: "",
    화물내용: "", 중량: "", 파레트: "", 차량종류: d.차량종류 || "윙바디", 차량톤수: d.차량톤수 || "5톤", 상차방법: d.상차방법 || "지게차", 하차방법: d.하차방법 || "지게차", 대수: "1대",
    운임: "", 수수료: "", 지급방식: d.지급방식 || "인수증", 긴급: false, 운행유형: "편도", 적재: "독차", 예약: false, 표시: "now", showAt: "", 공개메모: "", 메모: "",
    의뢰자구분: d.의뢰자구분 || (me?.role === "shipper" ? "화주" : ""), 의뢰자사업자번호: "", 의뢰자명: "",
  };
};
// 중량 칸은 숫자만(톤 이하) — 저장은 "4.5톤"
const weightNum = (v) => String(v || "").replace(/[^\d.]/g, "");

function Section({ icon, title, children, sub, right }) {
  return (
    <section className="bg-white rounded-[22px] ring-1 ring-inset ring-[#E2E7EF] p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3.5"><span className="w-9 h-9 rounded-xl bg-[#EAF0FA] text-[#1B2B4B] inline-flex items-center justify-center"><HI name={icon} size={18} /></span><span className="text-[17px] font-extrabold text-[#0F1A30]">{title}</span>{sub && <span className="text-[13.5px] font-semibold text-[#5F6E87]">{sub}</span>}{right && <span className="ml-auto">{right}</span>}</div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
const Sel = ({ value, onChange, options, testid, none }) => (
  <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid}>
    {none !== undefined && <option value="">{none}</option>}
    {value && !options.includes(value) && <option>{value}</option>}
    {options.map((v) => <option key={v}>{v}</option>)}
  </select>
);

// ── 오더복사 — 같은 회사가 올린 오더(+ 로지스웹 계정은 회사 배차 오더)에서 골라 모든 칸을 그대로 가져온다
function lwToForm(r) {
  const up = regionFromAddress(r.상차지주소), dn = regionFromAddress(r.하차지주소);
  const pay = r.지급방식 === "선불" || r.지급방식 === "착불" ? r.지급방식 : "인수증";
  return {
    상차시도: up.sido, 상차시군구: up.sigungu, 상차지명: r.상차지명 || "", 상차지주소: r.상차지주소 || "", 상차담당자: r.상차지담당자 || "", 상차연락처: r.상차지담당자번호 || "",
    하차시도: dn.sido, 하차시군구: dn.sigungu, 하차지명: r.하차지명 || "", 하차지주소: r.하차지주소 || "", 하차담당자: r.하차지담당자 || "", 하차연락처: r.하차지담당자번호 || "",
    상차시간: r.상차시간 || "", 하차시간: r.하차시간 || "", 화물내용: r.화물내용 || "",
    차량종류: matchListValue(HUB_VEHICLES, r.차량종류) || r.차량종류 || "", 차량톤수: matchListValue(HUB_TONS, r.차량톤수) || r.차량톤수 || "",
    상차방법: r.상차방법 || "", 하차방법: r.하차방법 || "", 지급방식: pay, 운임: money(String(Number(String(r.기사운임 || r.청구운임 || "").replace(/[^\d]/g, "")) || "")),
    수수료: pay === "인수증" || !numOf(r.기사운임) ? "" : money(String(Math.max(0, (Number(String(r.청구운임 || "").replace(/[^\d]/g, "")) || 0) - (Number(String(r.기사운임 || "").replace(/[^\d]/g, "")) || 0)) || "")),
    운행유형: r.운행유형 === "왕복" ? "왕복" : "편도", 적재: r.혼적 ? "혼적" : "독차", 긴급: !!r.긴급, 의뢰자명: r.거래처명 || "", 메모: "",
  };
}
function hubToForm(o, d) {
  return {
    상차시도: o.상차시도 || "", 상차시군구: o.상차시군구 || "", 하차시도: o.하차시도 || "", 하차시군구: o.하차시군구 || "", 상차시간: o.상차시간 || "", 하차시간: o.하차시간 || "",
    화물내용: o.화물내용 || "", 중량: weightNum(o.중량), 파레트: o.파레트 ? String(o.파레트) : "", 차량종류: o.차량종류 || "", 차량톤수: o.차량톤수 || "", 상차방법: o.상차방법 || "", 하차방법: o.하차방법 || "",
    대수: o.대수 || "1대", 운임: money(String(o.운임 || "")), 수수료: money(String(o.수수료 || "")), 지급방식: o.지급방식 === "예치금" ? "인수증" : o.지급방식 || "인수증", 긴급: !!o.긴급, 운행유형: o.운행유형 || "편도", 적재: o.적재 || "독차", 공개메모: o.공개메모 || "",
    ...(d ? { 상차지명: d.상차지명 || "", 상차지주소: d.상차지주소 || "", 상차담당자: d.상차담당자 || "", 상차연락처: d.상차연락처 || "", 하차지명: d.하차지명 || "", 하차지주소: d.하차지주소 || "", 하차담당자: d.하차담당자 || "", 하차연락처: d.하차연락처 || "", 메모: d.메모 || "", 의뢰자구분: d.의뢰자구분 || "", 의뢰자사업자번호: d.의뢰자사업자번호 || "", 의뢰자명: d.의뢰자명 || "" } : {}),
  };
}
export function CopyModal({ me, onClose, onPick }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => { let on = true; fetchCopySources(me).then((r) => on && setRows(r)); return () => { on = false; }; }, [me]);
  const shown = useMemo(() => {
    const k = q.replace(/\s+/g, "");
    return (rows || []).filter((r) => !k || `${r.id} ${r.상차지명 || ""} ${r.하차지명 || ""} ${r.상차지주소 || ""} ${r.하차지주소 || ""} ${r.상차시도 || ""}${r.상차시군구 || ""} ${r.하차시도 || ""}${r.하차시군구 || ""} ${r.상차일 || ""} ${r.화물내용 || ""}`.replace(/\s+/g, "").includes(k)).slice(0, 80);
  }, [rows, q]);
  const choose = async (r) => {
    setBusy(r.id);
    try { onPick(r.src === "lw" ? lwToForm(r) : hubToForm(r, await fetchCopyDetail(r.id))); }
    finally { setBusy(""); }
  };
  return (
    <Drawer onClose={onClose} title="오더복사" sub="고른 오더의 내용을 그대로 가져와요" width={600} testid="copy-modal">
      <div className="p-4 bg-white border-b border-[#E2E7EF]">
        <div className="relative"><HI name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5F6E87]" />
          <input className={`${inputCls} pl-10`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="상하차지명, 주소, 날짜, 화물번호" data-testid="copy-q" /></div>
      </div>
      <div className="flex-1 overflow-y-auto hub-scroll p-4 space-y-2.5" data-testid="copy-list">
        {rows === null && <div className="p-8 text-center text-[15px] text-[#5F6E87]">불러오고 있어요</div>}
        {rows && shown.length === 0 && <div className="p-8 text-center text-[15px] text-[#5F6E87]">{q ? "찾는 오더가 없어요" : "복사할 오더가 없어요"}</div>}
        {shown.map((r) => {
          const from = r.src === "lw" ? (r.상차지명 || r.상차지주소) : `${r.상차시도} ${r.상차시군구 || ""}`;
          const to = r.src === "lw" ? (r.하차지명 || r.하차지주소) : `${r.하차시도} ${r.하차시군구 || ""}`;
          const fare = r.src === "lw" ? numOf(r.기사운임) || numOf(r.청구운임) : Number(r.운임) || 0;
          return (
            <button key={`${r.src}-${r.id}`} type="button" disabled={!!busy} onClick={() => choose(r)} className="w-full text-left bg-white rounded-[18px] ring-1 ring-inset ring-[#E2E7EF] p-3.5 hover:ring-[#2D4C82]" data-testid="copy-row" data-src={r.src}>
              <div className="flex items-center gap-1.5 mb-1"><span className={`h-6 px-2 rounded-md text-[13px] font-bold inline-flex items-center ${r.src === "lw" ? "bg-[#0F1A30] text-white" : "bg-[#EAF0FA] text-[#1B2B4B]"}`}>{r.src === "lw" ? "로지스웹" : "허브"}</span><span className="text-[13.5px] font-bold text-[#5F6E87]">{r.상차일 ? dayLabel(r.상차일) : ""}</span><span className="ml-auto text-[13px] text-[#66758E]">{String(r.id).slice(0, 8)}</span></div>
              <div className="text-[16px] font-extrabold text-[#0F1A30] truncate">{from} → {to}</div>
              <div className="text-[14px] text-[#55657F] truncate">{[r.차량톤수, r.차량종류, r.화물내용].filter(Boolean).join(" ")}{fare ? `  ${manwon(fare)}` : ""}</div>
            </button>
          );
        })}
      </div>
    </Drawer>
  );
}

// ── 등록 설정(기본값 · 지급예정일)
function PostSettings({ me, onClose, toast }) {
  const cur = me.prefs?.post || {};
  const [v, setV] = useState({ 지급방식: cur.지급방식 || "인수증", 차량종류: cur.차량종류 || "윙바디", 차량톤수: cur.차량톤수 || "5톤", 상차방법: cur.상차방법 || "지게차", 하차방법: cur.하차방법 || "지게차", 의뢰자구분: cur.의뢰자구분 || "", payTerm: cur.payTerm || "days:7" });
  const S = (k) => (x) => setV((p) => ({ ...p, [k]: x }));
  const save = () => updatePrefs(me.uid, { ...(me.prefs || {}), post: v }).then(() => { toast?.("설정을 저장했어요"); onClose(); }).catch(() => toast?.("저장하지 못했어요"));
  return (
    <Drawer onClose={onClose} title="등록 설정" sub="새 오더의 기본값이에요" width={520} testid="post-settings">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="지불방식"><Sel value={v.지급방식} onChange={S("지급방식")} options={PAY_METHODS} /></Field>
          <Field label="의뢰자구분"><Sel value={v.의뢰자구분} onChange={S("의뢰자구분")} options={REQUESTER_TYPES} none="선택" /></Field>
          <Field label="차량톤수"><Sel value={v.차량톤수} onChange={S("차량톤수")} options={HUB_TONS} /></Field>
          <Field label="차량종류"><Sel value={v.차량종류} onChange={S("차량종류")} options={HUB_VEHICLES} /></Field>
          <Field label="상차방법"><Sel value={v.상차방법} onChange={S("상차방법")} options={LOAD_METHODS} /></Field>
          <Field label="하차방법"><Sel value={v.하차방법} onChange={S("하차방법")} options={LOAD_METHODS} /></Field>
        </div>
        <Field label="운송료 지급일" hint="계산서를 확인할 때 이 날짜로 채워요"><select className={selectCls} value={v.payTerm} onChange={(e) => S("payTerm")(e.target.value)} data-testid="ps-payterm">{PAY_TERM_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      <div className="p-4 bg-white border-t border-[#E2E7EF] pb-[max(16px,env(safe-area-inset-bottom))]"><Btn size="xl" className="w-full" onClick={save} data-testid="ps-save">저장</Btn></div>
    </Drawer>
  );
}

export default function HubPostForm({ me, editing, onClose, toast, onDone, cfg = {}, wallet = null, openWallet }) {
  const [f, setF] = useState(() => (editing ? { ...blank(me), ...editing.pub, ...(editing.detail || {}), 중량: weightNum(editing.pub.중량), 운임: money(String(editing.pub.운임 || "")), 수수료: money(String(editing.pub.수수료 || "")), 파레트: String(editing.pub.파레트 || ""), 표시: editing.pub.showAt ? "later" : "now", showAt: editing.pub.showAt ? new Date(editing.pub.showAt + 9 * 3600e3).toISOString().slice(0, 16) : "" } : blank(me)));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState(false);
  const [copy, setCopy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [feeTouched, setFeeTouched] = useState(!!editing);
  const [places, setPlaces] = useState([]);
  const linked = isLinked(me);
  const scanAi = useMemo(() => hubScanAi(me), [me]);
  useEffect(() => {
    if (linked) { let on = true; fetchLwPlaces(me).then((r) => on && setPlaces(r)); return () => { on = false; }; }
    return subscribeHubPlaces(me, setPlaces);
  }, [me.uid, linked]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const inp = (k, fmt) => (e) => set(k, fmt ? fmt(e.target.value) : e.target.value);
  const km = useMemo(() => estimateKm(f.상차시도, f.상차시군구, f.하차시도, f.하차시군구), [f.상차시도, f.상차시군구, f.하차시도, f.하차시군구]);
  const fareN = numOf(f.운임);
  const ref = referenceFare(f.차량톤수, km) * (f.운행유형 === "왕복" ? 1.6 : 1);
  const fit = fareFitness(fareN, f.차량톤수, km, f.운행유형 === "왕복");
  const autoFee = defaultFee(cfg, fareN);
  const feeShown = feeTouched ? f.수수료 : autoFee ? money(String(autoFee)) : f.수수료;
  const feeN = numOf(feeShown);
  const kind = payKind(f.지급방식);
  const total = fareN + feeN;
  const avail = Number(wallet?.available) || 0;
  const short = kind === "deposit" && fareN > avail;
  const step = (d) => set("운임", money(String(Math.max(0, fareN + d))));

  const applyScan = (patch, memo, meta) => {
    const h = scanToHub(patch, memo, meta);
    setF((p) => ({ ...p, ...h, 메모: [p.메모, h.메모].filter(Boolean).join(" / ").slice(0, 500) }));
    if (h.수수료) setFeeTouched(true);
    setScan(false);
    toast?.(`${Object.keys(h).length}칸을 채웠어요`);
  };
  const applyCopy = (x) => {
    setF((p) => ({ ...p, ...x, 상차일: kstYmd(), 하차일: kstYmd(), 표시: "now", showAt: "" }));
    if (x.수수료) setFeeTouched(true);
    setCopy(false);
    toast?.("오더를 복사했어요. 날짜를 확인해 주세요");
  };
  const pickPlace = (side) => (p) => {
    const r = regionFromAddress(p.주소);
    setF((x) => ({ ...x, [`${side}지명`]: p.이름 || "", [`${side}지주소`]: p.주소 || "", [`${side}담당자`]: p.담당자 || "", [`${side}연락처`]: p.연락처 || "", ...(r.sido ? { [`${side}시도`]: r.sido, [`${side}시군구`]: r.sigungu || "" } : {}) }));
  };
  const pickAddr = (side) => (a) => setF((x) => ({ ...x, ...(a.sido ? { [`${side}시도`]: a.sido, [`${side}시군구`]: a.sigungu || "" } : {}), ...(a.name && !x[`${side}지명`] ? { [`${side}지명`]: a.name } : {}) }));

  const save = async () => {
    setErr("");
    if (!f.상차지주소.trim() || !f.하차지주소.trim()) return setErr("상차지와 하차지 주소를 입력해 주세요");
    if (!f.상차시도 || !f.하차시도) return setErr("주소에서 지역을 찾지 못했어요. 시·도를 골라 주세요");
    if (!f.상차일) return setErr("상차일을 골라 주세요");
    if (f.하차일 && f.하차일 < f.상차일) return setErr("하차일이 상차일보다 빨라요");
    if (!f.화물내용.trim()) return setErr("화물 내용을 입력해 주세요");
    if (!f.의뢰자구분) return setErr("의뢰자구분을 골라 주세요");
    const biz = String(f.의뢰자사업자번호 || "").replace(/[^\d]/g, "");
    if (f.의뢰자구분 === "운수사" && !biz) return setErr("운수사는 사업자번호를 넣어 주세요");
    if (biz && !bizNoValid(biz)) return setErr("사업자번호를 다시 확인해 주세요");
    if (biz && biz === String(me.bizNo || "").replace(/[^\d]/g, "")) return setErr("내 사업자번호는 의뢰자로 쓸 수 없어요");
    if (fareN && fareN < 10000) return setErr("운송료는 원 단위로 넣어 주세요");
    if (f.표시 === "later" && !f.showAt) return setErr("차주앱에 보일 시각을 골라 주세요");
    if (short) return setErr(`잔액이 부족해요. 운송료 ${fareN.toLocaleString()}원이 필요해요`);
    setBusy(true);
    try {
      const ff = { ...f, 수수료: feeShown, 중량: f.중량 ? `${weightNum(f.중량)}톤` : "", showAt: f.표시 === "later" ? `${f.showAt}:00+09:00` : "", 예약: f.예약 || f.표시 === "later" };
      if (editing) { await updateOrder(editing.id, ff); toast?.("수정했어요"); }
      else { const id = await postOrder(me, ff); toast?.("등록했어요"); onDone?.(id); scanAi?.commit(hubToScan(f)).catch(() => {}); }
      onClose();
    } catch (e) {
      setErr(String(e?.code || "").includes("permission") ? "지금은 등록할 수 없어요. 20초 뒤에 다시 눌러 주세요" : e?.message || "저장하지 못했어요");
    } finally { setBusy(false); }
  };

  const Place = (side, label) => (
    <Section icon="pin" title={`${label}지`} right={<span className="text-[13px] font-bold text-[#5F6E87]">{f[`${side}시도`] ? `${f[`${side}시도`]} ${f[`${side}시군구`] || ""}` : ""}</span>}>
      <Field label={`${label}지명`}><PlaceInput value={f[`${side}지명`]} onChange={(v) => set(`${side}지명`, v)} places={places} onPick={pickPlace(side)} source={linked ? "로지스웹 상하차지거래처" : "고객관리"} testid={`pf-${side}-name`} /></Field>
      <Field label="주소" required><AddressInput value={f[`${side}지주소`]} onChange={(v) => set(`${side}지주소`, v)} onPick={pickAddr(side)} testid={`pf-${side}-addr`} /></Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="시·도"><select className={selectCls} value={f[`${side}시도`]} onChange={(e) => setF((p) => ({ ...p, [`${side}시도`]: e.target.value, [`${side}시군구`]: "" }))} data-testid={`pf-${side}-sido`}><option value="">선택</option>{SIDO_LIST.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="시·군·구"><select className={selectCls} value={f[`${side}시군구`]} onChange={inp(`${side}시군구`)} disabled={!f[`${side}시도`]} data-testid={`pf-${side}-sgg`}><option value="">선택</option>{sigunguOf(f[`${side}시도`]).map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="담당자"><input className={inputCls} value={f[`${side}담당자`]} onChange={inp(`${side}담당자`)} placeholder="이름" /></Field>
        <Field label="연락처"><input className={inputCls} inputMode="numeric" value={f[`${side}연락처`]} onChange={inp(`${side}연락처`, fmtPhone)} placeholder="010-0000-0000" /></Field>
        <Field label={`${label}일`} required><input type="date" className={inputCls} value={f[`${side}일`]} onChange={inp(`${side}일`)} data-testid={`pf-${side}-date`} /></Field>
        <Field label="시간"><select className={selectCls} value={f[`${side}시간`]} onChange={inp(`${side}시간`)}><option value="">협의</option><option>즉시</option>{HOURS.map((h) => <option key={h}>{h}</option>)}</select></Field>
      </div>
    </Section>
  );

  return (
    <Drawer onClose={onClose} closeOnBackdrop={false} title={editing ? "오더 수정" : "화물등록"} sub="주소와 연락처는 배차가 확정되면 보여요" width={680} testid="post-form">
      <div className="flex-1 overflow-y-auto hub-scroll p-4 lg:p-5 space-y-3.5">
        {!editing && (
          <div className="grid grid-cols-3 gap-2">
            <Btn kind="ghost" size="md" onClick={() => setCopy(true)} data-testid="pf-copy"><HI name="list" size={16} />오더복사</Btn>
            <Btn kind="ghost" size="md" onClick={() => setScan(true)} data-testid="pf-scan"><HI name="scan" size={16} />스캔</Btn>
            <Btn kind="ghost" size="md" onClick={() => setSettings(true)} data-testid="pf-settings"><HI name="gear" size={16} />설정</Btn>
          </div>
        )}
        {Place("상차", "상차")}
        {Place("하차", "하차")}
        <Section icon="box" title="화물과 차량">
          <div className="flex gap-2 flex-wrap" data-testid="pf-flags">
            <Chip on={f.적재 === "혼적"} onClick={() => set("적재", f.적재 === "혼적" ? "독차" : "혼적")} data-testid="pf-mixed">혼적</Chip>
            <Chip on={f.운행유형 === "왕복"} onClick={() => set("운행유형", f.운행유형 === "왕복" ? "편도" : "왕복")} data-testid="pf-round">왕복</Chip>
            <Chip on={f.긴급} onClick={() => set("긴급", !f.긴급)} data-testid="pf-urgent"><HI name="bolt" size={15} />긴급</Chip>
            <Chip on={f.예약} onClick={() => set("예약", !f.예약)} data-testid="pf-reserve">예약</Chip>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="차량톤수" required><Sel value={f.차량톤수} onChange={(v) => set("차량톤수", v)} options={HUB_TONS} testid="pf-vton" /></Field>
            <Field label="차량종류" required><Sel value={f.차량종류} onChange={(v) => set("차량종류", v)} options={HUB_VEHICLES} testid="pf-vtype" /></Field>
            <Field label="상차방법"><Sel value={f.상차방법} onChange={(v) => set("상차방법", v)} options={LOAD_METHODS} none="협의" testid="pf-load" /></Field>
            <Field label="하차방법"><Sel value={f.하차방법} onChange={(v) => set("하차방법", v)} options={LOAD_METHODS} none="협의" testid="pf-unload" /></Field>
            <Field label="대수"><Sel value={f.대수} onChange={(v) => set("대수", v)} options={COUNT_OPTIONS} testid="pf-count" /></Field>
            <Field label="화물중량"><div className="relative"><input className={`${inputCls} pr-[72px] text-right`} inputMode="decimal" value={f.중량} onChange={inp("중량", (v) => weightNum(v).slice(0, 5))} placeholder="0" data-testid="pf-weight" /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-[14.5px] font-bold text-[#5F6E87]">톤 이하</span></div></Field>
            <Field label="화물" required className="col-span-2"><input className={inputCls} value={f.화물내용} onChange={inp("화물내용")} placeholder="예: 전자부품 박스" data-testid="pf-cargo" /></Field>
            <Field label="파레트"><input className={inputCls} inputMode="numeric" value={f.파레트} onChange={inp("파레트", (v) => v.replace(/[^\d]/g, "").slice(0, 3))} placeholder="0" data-testid="pf-pallet" /></Field>
          </div>
        </Section>
        <Section icon="won" title="운송료">
          <Field label="지불방식"><Sel value={f.지급방식} onChange={(v) => set("지급방식", v)} options={PAY_METHODS} testid="pf-pay" /></Field>
          <Field label="운송료(원)">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5">
              <input className={`${inputCls} text-right font-extrabold`} inputMode="numeric" value={f.운임} onChange={inp("운임", money)} placeholder="0" style={NUMS} data-testid="pf-fare" />
              <button type="button" onClick={() => step(5000)} className="h-12 px-3 rounded-2xl bg-[#EAF0FA] text-[14px] font-bold text-[#1B2B4B]" data-testid="pf-fare-up">▲5,000</button>
              <button type="button" onClick={() => step(-5000)} className="h-12 px-3 rounded-2xl bg-[#F2F5FA] text-[14px] font-bold text-[#55657F]" data-testid="pf-fare-down">▼5,000</button>
            </div>
          </Field>
          {km > 0 && (
            <div className="rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#DCE3EE] px-4 py-3 text-[14.5px] text-[#3A4A66] flex items-center gap-2 flex-wrap" data-testid="pf-fare-hint">
              <HI name="route" size={16} className="text-[#2D4C82]" /><span style={NUMS}>약 <b>{km}km</b>, 참고 운임 <b>{manwon(ref)}</b></span>{fit && <span className="font-extrabold text-[#1B2B4B]">{fit.label}</span>}
              <button type="button" onClick={() => set("운임", money(String(Math.round(ref / 5000) * 5000)))} className="ml-auto h-9 px-3 rounded-xl bg-white ring-1 ring-inset ring-[#D6DEEA] text-[13.5px] font-bold text-[#1B2B4B]" data-testid="pf-fare-ref">참고 운임 불러오기</button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="수수료(원)"><input className={`${inputCls} text-right`} inputMode="numeric" value={feeShown} onChange={(e) => { setFeeTouched(true); set("수수료", money(e.target.value)); }} placeholder="0" style={NUMS} data-testid="pf-fee" /></Field>
            <Field label="총합계"><div className="h-12 px-4 rounded-2xl bg-[#0F1A30] text-white text-[17px] font-extrabold flex items-center justify-end" style={NUMS} data-testid="pf-total">{total.toLocaleString()}원</div></Field>
          </div>
          <div className={`rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed ring-1 ring-inset ${short ? "bg-[#F3F7FE] ring-[#9FB5DA]" : "bg-[#F7F9FC] ring-[#E2E7EF]"}`} data-testid="pf-pay-hint">
            <div className="text-[#3A4A66]">{PAY_HINT[kind]}</div>
            {kind === "deposit" && <div className="mt-1 flex items-center gap-2 flex-wrap font-bold text-[#0F1A30]" style={NUMS}><span>내 잔액 {avail.toLocaleString()}원</span>{short && <span className="text-[#2D4C82]">잔액이 부족해요</span>}{short && openWallet && <button type="button" onClick={openWallet} className="ml-auto h-9 px-3 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-bold" data-testid="pf-go-wallet">충전하기</button>}</div>}
          </div>
        </Section>
        <Section icon="building" title="의뢰자">
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="의뢰자구분" required><Sel value={f.의뢰자구분} onChange={(v) => set("의뢰자구분", v)} options={REQUESTER_TYPES} none="선택" testid="pf-req-type" /></Field>
            <Field label={`사업자번호${f.의뢰자구분 === "운수사" ? "" : "(선택)"}`} required={f.의뢰자구분 === "운수사"}><input className={inputCls} inputMode="numeric" value={f.의뢰자사업자번호} onChange={inp("의뢰자사업자번호", fmtBizNo)} placeholder="000-00-00000" data-testid="pf-req-biz" /></Field>
            <Field label="의뢰자명" className="col-span-2"><input className={inputCls} value={f.의뢰자명} onChange={inp("의뢰자명")} placeholder="선택 사항" data-testid="pf-req-name" /></Field>
          </div>
        </Section>
        <Section icon="memo" title="기타">
          <Field label="차주앱 표시"><Seg value={f.표시} onChange={(v) => set("표시", v)} options={[["now", "즉시"], ["later", "예약"]]} /></Field>
          {f.표시 === "later" && <Field label="보일 시각"><input type="datetime-local" className={inputCls} value={f.showAt} onChange={inp("showAt")} data-testid="pf-showat" /></Field>}
          <Field label="기타내용" hint="모두에게 보여요. 연락처와 주소는 쓰지 마세요"><textarea rows={2} className={`${inputCls} h-auto py-3`} value={f.공개메모} onChange={inp("공개메모")} placeholder="예: 리프트 필요, 대기 30분" /></Field>
          <Field label="차주 메모" hint="배차된 차주에게만 보여요"><textarea rows={2} className={`${inputCls} h-auto py-3`} value={f.메모} onChange={inp("메모")} placeholder="예: 정문 경비실에 알려 주세요" /></Field>
        </Section>
        {err && <div role="alert" data-testid="pf-error" className="rounded-2xl bg-white ring-1 ring-inset ring-[#C7D3E8] px-4 py-3 text-[15px] font-bold text-[#0F1A30] flex gap-2"><HI name="alert" size={18} className="shrink-0 mt-0.5 text-[#2D4C82]" />{err}</div>}
      </div>
      <div className="shrink-0 p-4 lg:p-5 bg-white border-t border-[#E2E7EF] pb-[max(16px,env(safe-area-inset-bottom))] grid grid-cols-[auto_1fr] gap-2.5">
        <Btn kind="ghost" onClick={onClose}>취소</Btn>
        <Btn size="lg" onClick={save} disabled={busy} data-testid="pf-submit">{busy ? "저장하고 있어요" : editing ? "수정" : `배차등록${fareN ? ` ${manwon(total)}` : ""}`}</Btn>
      </div>
      {scan && <Suspense fallback={null}><OrderScanModal onClose={() => setScan(false)} onApply={applyScan} applyLabel="허브 오더에 적용" ai={scanAi} /></Suspense>}
      {copy && <CopyModal me={me} onClose={() => setCopy(false)} onPick={applyCopy} />}
      {settings && <PostSettings me={me} onClose={() => setSettings(false)} toast={toast} />}
    </Drawer>
  );
}
export { hubToForm, lwToForm, tsMs };
