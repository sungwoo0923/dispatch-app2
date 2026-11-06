// ======================= cafe-site/src/hub/HubPostForm.jsx =======================
// ⭐ 2026-11-06 오더 등록·수정(화주 · 운송사)
//  공개: 상·하차 시도/시군구 · 일시 · 화물/중량/파레트 · 차종/톤수 · 상·하차 방법 · 운임/수수료/결제 · 긴급 · 왕복 · 혼적/독차 · 안내
//  비공개(배차 확정 후 배차된 차주에게만): 상·하차지명 · 상세주소 · 현장 담당자 · 연락처 · 메모
//  ⭐ 2026-11-06 (2차) [오더 스캔] — 배차 프로그램의 오더 스캔(글 붙여넣기 · 캡처 이미지 글자 인식)을 그대로 열어 허브 칸에 채운다(hubScan.js)
//                  · 예치금 결제(인수증 · 예치금)는 내 예치금이 운임+수수료 이상이어야 올릴 수 있다(규칙도 같은 기준)
//                  · 수수료 기본값 = 관리자 설정(정액 · 운임의 %)
import React, { Suspense, lazy, useMemo, useState } from "react";
import { HI, Btn, Field, inputCls, selectCls, Seg, Chip, Drawer, NUMS } from "./hubUi";
import { SIDO_LIST, sigunguOf, HUB_VEHICLES, HUB_TONS, PAY_METHODS, LOAD_METHODS, estimateKm, referenceFare, fareFitness, manwon, kstYmd, fmtPhone, payKind, PAY_HINT, defaultFee } from "./hubConstants";
import { postOrder, updateOrder } from "./hubApi";
import { scanToHub } from "./hubScan";
const OrderScanModal = lazy(() => import("../../../src/OrderScanModal"));

const HOURS = Array.from({ length: 24 }, (_, h) => [`${String(h).padStart(2, "0")}:00`, `${String(h).padStart(2, "0")}:30`]).flat();
const blank = (me) => ({
  상차시도: "", 상차시군구: "", 상차지명: "", 상차지주소: "", 상차담당자: "", 상차연락처: me?.phone || "",
  하차시도: "", 하차시군구: "", 하차지명: "", 하차지주소: "", 하차담당자: "", 하차연락처: "",
  상차일: kstYmd(), 상차시간: "09:00", 하차일: kstYmd(), 하차시간: "",
  화물내용: "", 중량: "", 파레트: "", 차량종류: "윙바디", 차량톤수: "5톤", 상차방법: "지게차", 하차방법: "지게차",
  운임: "", 수수료: "", 지급방식: "인수증", 긴급: false, 운행유형: "편도", 적재: "독차", 공개메모: "", 메모: "",
});

function Section({ icon, title, children, sub }) {
  return (
    <section className="bg-white rounded-[22px] ring-1 ring-inset ring-[#E2E7EF] p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3.5"><span className="w-9 h-9 rounded-xl bg-[#EAF0FA] text-[#1B2B4B] inline-flex items-center justify-center"><HI name={icon} size={18} /></span><span className="text-[17px] font-extrabold text-[#0F1A30]">{title}</span>{sub && <span className="text-[13.5px] font-semibold text-[#8592A8]">{sub}</span>}</div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function HubPostForm({ me, editing, onClose, toast, onDone, cfg = {}, wallet = null, openWallet }) {
  const [f, setF] = useState(() => (editing ? { ...blank(me), ...editing.pub, ...(editing.detail || {}), 운임: String(editing.pub.운임 || ""), 수수료: String(editing.pub.수수료 || ""), 파레트: String(editing.pub.파레트 || "") } : blank(me)));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [feeTouched, setFeeTouched] = useState(!!editing);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const inp = (k, fmt) => (e) => set(k, fmt ? fmt(e.target.value) : e.target.value);
  const km = useMemo(() => estimateKm(f.상차시도, f.상차시군구, f.하차시도, f.하차시군구), [f.상차시도, f.상차시군구, f.하차시도, f.하차시군구]);
  const fareN = Number(String(f.운임).replace(/[^\d]/g, "")) || 0;
  const ref = referenceFare(f.차량톤수, km) * (f.운행유형 === "왕복" ? 1.6 : 1);
  const fit = fareFitness(fareN, f.차량톤수, km, f.운행유형 === "왕복");
  const money = (v) => { const d = String(v).replace(/[^\d]/g, "").slice(0, 9); return d ? Number(d).toLocaleString() : ""; };
  // 수수료 — 직접 고치기 전까지는 관리자 기본값(정액 또는 운임의 %)을 따라간다
  const autoFee = defaultFee(cfg, fareN);
  const feeShown = feeTouched ? f.수수료 : autoFee ? money(String(autoFee)) : f.수수료;
  const feeN = Number(String(feeShown).replace(/[^\d]/g, "")) || 0;
  const kind = payKind(f.지급방식);
  const total = fareN + feeN;
  const avail = Number(wallet?.available) || 0;
  const short = kind === "deposit" && total > avail;

  const applyScan = (patch, memo, meta) => {
    const h = scanToHub(patch, memo, meta);
    setF((p) => ({ ...p, ...h, 메모: [p.메모, h.메모].filter(Boolean).join(" / ").slice(0, 500) }));
    if (h.수수료) setFeeTouched(true);
    setScanned(Object.keys(h).length);
    setScan(false);
    toast?.(`오더 스캔 결과 ${Object.keys(h).length}칸을 채웠습니다 · 확인 후 올려 주세요`);
  };

  const save = async () => {
    setErr("");
    if (kind === "deposit" && short) return setErr(`예치금이 부족합니다 — ${f.지급방식} 결제는 운임+수수료 ${total.toLocaleString()}원이 필요합니다(사용 가능 ${avail.toLocaleString()}원). [정산]에서 충전하거나 결제 방식을 바꿔 주세요.`);
    if (!f.상차시도 || !f.하차시도) return setErr("상차 · 하차 지역(시·도)을 골라 주세요.");
    if (!f.상차지주소.trim() || !f.하차지주소.trim()) return setErr("상차 · 하차 상세주소를 입력해 주세요(배차 확정 후에만 공개).");
    if (!f.상차일) return setErr("상차일을 골라 주세요.");
    if (f.하차일 && f.하차일 < f.상차일) return setErr("하차일이 상차일보다 빠릅니다.");
    if (!f.화물내용.trim()) return setErr("화물 내용을 입력해 주세요.");
    if (!f.차량종류 || !f.차량톤수) return setErr("필요한 차종 · 톤수를 골라 주세요.");
    if (fareN && fareN < 10000) return setErr("운임은 원 단위로 입력해 주세요(예: 450,000).");
    setBusy(true);
    try {
      const ff = { ...f, 수수료: feeShown };
      if (editing) { await updateOrder(editing.id, ff); toast?.("오더를 수정했습니다"); }
      else { const id = await postOrder(me, ff); toast?.("오더를 올렸습니다 · 차주에게 바로 알림이 갑니다"); onDone?.(id); }
      onClose();
    } catch (e) {
      setErr(String(e?.code || "").includes("permission") ? `등록할 수 없습니다(승인 상태 · 등록 간격 20초 · 하루 30건 제한${kind === "deposit" ? " · 예치금 부족" : ""}).` : e?.message || "저장하지 못했습니다.");
    } finally { setBusy(false); }
  };

  const Place = ({ side, label }) => {
    const sd = f[`${side}시도`];
    return (
      <Section icon="pin" title={`${label}지`} sub={side === "상차" ? "출발" : "도착"}>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="시·도" required><select className={selectCls} value={sd} onChange={(e) => setF((p) => ({ ...p, [`${side}시도`]: e.target.value, [`${side}시군구`]: "" }))} data-testid={`pf-${side}-sido`}><option value="">선택</option>{SIDO_LIST.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="시·군·구"><select className={selectCls} value={f[`${side}시군구`]} onChange={inp(`${side}시군구`)} disabled={!sd} data-testid={`pf-${side}-sgg`}><option value="">선택</option>{sigunguOf(sd).map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
        <Field label="상세주소" required hint="배차가 확정된 차주에게만 공개됩니다"><input className={inputCls} value={f[`${side}지주소`]} onChange={inp(`${side}지주소`)} placeholder="도로명 주소 · 동 · 호" data-testid={`pf-${side}-addr`} /></Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="장소명"><input className={inputCls} value={f[`${side}지명`]} onChange={inp(`${side}지명`)} placeholder="예: ○○물류센터" /></Field>
          <Field label="현장 담당"><input className={inputCls} value={f[`${side}담당자`]} onChange={inp(`${side}담당자`)} placeholder="이름" /></Field>
        </div>
        <Field label="현장 연락처"><input className={inputCls} inputMode="numeric" value={f[`${side}연락처`]} onChange={inp(`${side}연락처`, fmtPhone)} placeholder="010-0000-0000" /></Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={`${label}일`} required><input type="date" className={inputCls} value={f[`${side}일`]} onChange={inp(`${side}일`)} data-testid={`pf-${side}-date`} /></Field>
          <Field label="시간"><select className={selectCls} value={f[`${side}시간`]} onChange={inp(`${side}시간`)}><option value="">협의</option><option>즉시</option>{HOURS.map((h) => <option key={h}>{h}</option>)}</select></Field>
        </div>
        <Field label={`${label} 방법`}><div className="flex gap-2 overflow-x-auto hub-scroll -mx-1 px-1">{LOAD_METHODS.map((m) => <Chip key={m} on={f[`${side}방법`] === m} onClick={() => set(`${side}방법`, m)}>{m}</Chip>)}</div></Field>
      </Section>
    );
  };

  return (
    <Drawer onClose={onClose} closeOnBackdrop={false} title={editing ? "오더 수정" : "오더 등록"} sub="상세주소 · 연락처는 배차 확정 후에만 공개" width={640} testid="post-form">
      <div className="flex-1 overflow-y-auto hub-scroll p-4 lg:p-5 space-y-3.5">
        {!editing && (
          <button type="button" onClick={() => setScan(true)} data-testid="pf-scan" className="w-full text-left rounded-[22px] p-4 text-white flex items-center gap-3.5" style={{ background: "linear-gradient(120deg,#0B1428 0%,#0F1A30 45%,#1B2B4B 80%,#2D4C82 100%)" }}>
            <span className="w-12 h-12 rounded-2xl bg-white/10 ring-1 ring-inset ring-white/15 inline-flex items-center justify-center shrink-0"><HI name="scan" size={22} className="text-[#CFE0FF]" /></span>
            <span className="min-w-0 flex-1"><span className="block text-[17px] font-extrabold">오더 스캔으로 채우기</span><span className="block text-[14px] text-white/65 truncate">{scanned ? `스캔 결과 ${scanned}칸을 채웠습니다 · 다시 스캔` : "카톡 · 문자 오더 글이나 캡처 이미지를 붙여넣으면 자동 입력"}</span></span>
            <HI name="chevron" size={20} className="text-[#8FB0F0]" />
          </button>
        )}
        {Place({ side: "상차", label: "상차" })}
        {Place({ side: "하차", label: "하차" })}
        <Section icon="box" title="화물 · 차량">
          <Field label="화물 내용" required><input className={inputCls} value={f.화물내용} onChange={inp("화물내용")} placeholder="예: 전자부품 박스" data-testid="pf-cargo" /></Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="중량"><input className={inputCls} value={f.중량} onChange={inp("중량")} placeholder="예: 4.5톤" /></Field>
            <Field label="파레트(개)"><input className={inputCls} inputMode="numeric" value={f.파레트} onChange={inp("파레트", (v) => v.replace(/[^\d]/g, "").slice(0, 3))} placeholder="0" data-testid="pf-pallet" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="차종" required><select className={selectCls} value={f.차량종류} onChange={inp("차량종류")} data-testid="pf-vtype">{HUB_VEHICLES.map((v) => <option key={v}>{v}</option>)}</select></Field>
            <Field label="톤수" required><select className={selectCls} value={f.차량톤수} onChange={inp("차량톤수")} data-testid="pf-vton">{HUB_TONS.map((v) => <option key={v}>{v}</option>)}</select></Field>
          </div>
          <Field label="운행"><Seg value={f.운행유형} onChange={(v) => set("운행유형", v)} options={[["편도", "편도"], ["왕복", "왕복"]]} /></Field>
          <Field label="적재"><Seg value={f.적재} onChange={(v) => set("적재", v)} options={[["독차", "독차"], ["혼적", "혼적 가능"]]} /></Field>
        </Section>
        <Section icon="won" title="운임 · 결제">
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="운임(원)" hint="비우면 '협의'"><input className={`${inputCls} text-right font-extrabold`} inputMode="numeric" value={f.운임} onChange={inp("운임", money)} placeholder="0" style={NUMS} data-testid="pf-fare" /></Field>
            <Field label="수수료(원)" hint={!feeTouched && autoFee ? "기본 수수료(관리자 설정)" : "등록자 몫"}><input className={`${inputCls} text-right`} inputMode="numeric" value={feeShown} onChange={(e) => { setFeeTouched(true); set("수수료", money(e.target.value)); }} placeholder="0" style={NUMS} data-testid="pf-fee" /></Field>
          </div>
          {km > 0 && (
            <div className="rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#DCE3EE] px-4 py-3 text-[15px] text-[#3A4A66] flex items-center gap-2 flex-wrap" data-testid="pf-fare-hint">
              <HI name="route" size={17} className="text-[#2D4C82]" />약 <b style={NUMS}>{km}km</b> · 참고 운임 <b style={NUMS}>{manwon(ref)}</b>
              {fit && <span className="ml-auto font-extrabold text-[#1B2B4B]">{fit.label}</span>}
            </div>
          )}
          <Field label="결제 방식"><div className="flex gap-2 flex-wrap">{PAY_METHODS.map((m) => <Chip key={m} on={f.지급방식 === m} onClick={() => set("지급방식", m)} data-testid={`pf-pay-${m}`}>{m}</Chip>)}</div></Field>
          <div className={`rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed ring-1 ring-inset ${short ? "bg-[#F3F7FE] ring-[#9FB5DA]" : "bg-[#F7F9FC] ring-[#E2E7EF]"}`} data-testid="pf-pay-hint">
            <div className="text-[#3A4A66]">{PAY_HINT[kind]}</div>
            <div className="mt-1 flex items-center gap-2 flex-wrap font-bold text-[#0F1A30]" style={NUMS}>
              <span>합계 {total.toLocaleString()}원</span>
              {kind === "deposit" && <span className={short ? "text-[#2D4C82]" : "text-[#55657F]"}>· 내 예치금 {avail.toLocaleString()}원{short ? " — 부족" : ""}</span>}
              {short && openWallet && <button type="button" onClick={openWallet} className="ml-auto h-9 px-3 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-bold" data-testid="pf-go-wallet">충전하러 가기</button>}
            </div>
          </div>
          <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#0F1A30] text-white cursor-pointer">
            <input type="checkbox" checked={f.긴급} onChange={(e) => set("긴급", e.target.checked)} className="w-5 h-5 accent-[#8FB0F0]" data-testid="pf-urgent" />
            <HI name="bolt" size={18} className="text-[#8FB0F0]" /><span className="text-[16px] font-bold">긴급 오더</span><span className="text-[14px] text-white/60 ml-auto">보드 맨 위 · 알림 강조</span>
          </label>
        </Section>
        <Section icon="memo" title="안내 · 메모">
          <Field label="모두에게 보이는 안내" hint="연락처·상세주소는 쓰지 마세요"><textarea rows={2} className={`${inputCls} h-auto py-3`} value={f.공개메모} onChange={inp("공개메모")} placeholder="예: 리프트 필요 · 대기 30분" /></Field>
          <Field label="배차된 차주에게만 보이는 메모"><textarea rows={2} className={`${inputCls} h-auto py-3`} value={f.메모} onChange={inp("메모")} placeholder="예: 정문 경비실에 도착 알림" /></Field>
        </Section>
        {err && <div role="alert" data-testid="pf-error" className="rounded-2xl bg-white ring-1 ring-inset ring-[#C7D3E8] px-4 py-3 text-[15px] font-bold text-[#0F1A30] flex gap-2"><HI name="alert" size={18} className="shrink-0 mt-0.5 text-[#2D4C82]" />{err}</div>}
      </div>
      <div className="shrink-0 p-4 lg:p-5 bg-white border-t border-[#E2E7EF] pb-[max(16px,env(safe-area-inset-bottom))] grid grid-cols-[auto_1fr] gap-2.5">
        <Btn kind="ghost" onClick={onClose}>닫기</Btn>
        <Btn size="lg" onClick={save} disabled={busy} data-testid="pf-submit">{busy ? "저장 중…" : editing ? "수정 저장" : `오더 올리기${fareN ? ` · ${manwon(fareN)}` : ""}`}</Btn>
      </div>
      {scan && <Suspense fallback={null}><OrderScanModal onClose={() => setScan(false)} onApply={applyScan} applyLabel="허브 오더에 적용" /></Suspense>}
    </Drawer>
  );
}
