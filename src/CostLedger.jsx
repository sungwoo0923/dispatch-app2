// ======================= src/CostLedger.jsx =======================
// 💳 2026-11-18 실제 결제 내역(최고관리자 전용) — "돈 낸 건 전부 운영 비용에 잡히게"
//  · platformConfig/costModel.payments 배열 하나에 저장(규칙 변경 없음 · 같은 문서). 계산은 costModel.js 의 ledgerMonth.
//  · 쓰는 곳: 관리센터 › 청구 › 비용 · 손익(손익 요약 아래 · 밝은 화면) · 관리자센터 › 운영 비용(어두운 화면, tone="dark")
//  · 빠른 추가 버튼은 금액을 비워 둔다 — 카드 명세 · 영수증 금액을 사장님이 채운다(코드에서 결제 데이터를 넣지 않는다)
import React from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { PAY_KINDS, PAY_TARGETS, PAY_PRESETS, cleanPayment, paymentKrw, paymentMonthKrw, ledgerMonth } from "./costModel";
import { kpConfirm } from "./kpDialog";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const NUMF = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };
const won = (v) => `${Math.round(Number(v) || 0).toLocaleString()}원`;
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const TONES = {
  light: { card: "#FFFFFF", line: "#E3E8F0", row: "#EEF1F6", ink: "#0F1A30", sub: "#5B6B85", dim: "#9AA9C3", accent: "#1B2B4B", accentInk: "#FFFFFF", chip: "#F3F6FB", input: "#FFFFFF", inputInk: "#1B2B4B", soft: "#F7F9FC", scheme: "light" },
  dark: { card: "rgba(255,255,255,.03)", line: "rgba(215,188,130,.18)", row: "rgba(215,188,130,.08)", ink: "#EEF2FA", sub: "rgba(226,232,245,.78)", dim: "rgba(201,213,236,.58)", accent: "#D7BC82", accentInk: "#1A1405", chip: "rgba(255,255,255,.05)", input: "rgba(255,255,255,.05)", inputInk: "#FFFFFF", soft: "rgba(215,188,130,.06)", scheme: "dark" },
};
const monthsBack = (ym, k) => { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 - k; const d = new Date(Date.UTC(y, m, 1)); return d.toISOString().slice(0, 7); };
const EMPTY = { date: "", endDate: "", vendor: "", item: "", amount: "", currency: "KRW", kind: "once", group: "기타", replaces: "", memo: "" };

export default function PaymentsLedger({ model, ym, tone = "light", demo = false, demoPayments = null }) {
  const T = TONES[tone] || TONES.light;
  const [local, setLocal] = React.useState(demoPayments || []);
  const payments = demo ? local : (Array.isArray(model?.payments) ? model.payments : []);
  const m = React.useMemo(() => ({ ...model, payments }), [model, payments]);
  const [fym, setFym] = React.useState(ym);
  const [all, setAll] = React.useState(false);
  const [form, setForm] = React.useState(null); // { ...payment, _new }
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const months = React.useMemo(() => {
    const set = new Set(Array.from({ length: 12 }, (_, i) => monthsBack(ym, i)));
    payments.forEach((p) => { if (/^\d{4}-\d{2}/.test(p?.date || "")) set.add(p.date.slice(0, 7)); });
    return [...set].sort().reverse();
  }, [ym, payments]);
  const led = React.useMemo(() => ledgerMonth(m, fym, { day: fym === ym ? Number(kstToday().slice(8)) : 31 }), [m, fym, ym]);
  const list = React.useMemo(() => {
    const arr = payments.map((p, i) => ({ p, i, monthKrw: paymentMonthKrw(m, p, fym) }));
    return (all ? arr : arr.filter((x) => x.monthKrw > 0)).sort((a, b) => String(b.p.date || "").localeCompare(String(a.p.date || "")));
  }, [payments, m, fym, all]);

  const write = async (next) => {
    if (demo) { setLocal(next); return true; }
    setSaving(true); setMsg("");
    try { await setDoc(doc(db, "platformConfig", "costModel"), { payments: next, updatedAt: serverTimestamp() }, { merge: true }); return true; }
    catch (e) { setMsg(`저장하지 못했어요: ${e.message || e}`); return false; } finally { setSaving(false); }
  };
  const openNew = (preset) => setForm({ ...EMPTY, ...(preset ? { vendor: preset.vendor, item: preset.item, currency: preset.currency, kind: preset.kind, group: preset.group, replaces: preset.replaces } : {}), date: kstToday(), _new: true });
  const save = async () => {
    if (!form.date) { setMsg("결제한 날짜를 넣어 주세요."); return; }
    if (!(Number(form.amount) > 0)) { setMsg("금액을 넣어 주세요."); return; }
    if (!form.vendor && !form.item) { setMsg("어디에 낸 돈인지(업체나 항목) 적어 주세요."); return; }
    const clean = cleanPayment(form);
    const next = form._new ? [...payments, clean] : payments.map((p) => (p.id === form.id ? clean : p));
    if (await write(next)) { setForm(null); setMsg(form._new ? "결제를 넣었어요. 운영 비용에 바로 반영돼요." : "고쳤어요."); if (paymentMonthKrw(m, clean, fym) <= 0) setFym(clean.date.slice(0, 7)); }
  };
  const remove = async (p) => {
    if (!(await kpConfirm(`${[p.vendor, p.item].filter(Boolean).join(" · ") || "이 결제"}(${p.date})를 지울까요?`))) return;
    if (await write(payments.filter((x) => x !== p && (!p.id || x.id !== p.id)))) { setForm(null); setMsg("지웠어요."); }
  };

  const inp = "h-9 w-full px-2.5 rounded-lg text-[13.5px] font-bold outline-none";
  const inpStyle = { background: T.input, color: T.inputInk, border: `1px solid ${T.line}`, colorScheme: T.scheme };
  const btn = (primary) => ({ background: primary ? T.accent : T.chip, color: primary ? T.accentInk : T.ink, border: `1px solid ${primary ? T.accent : T.line}` });
  const up = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const fxNote = m.fx ? `$1 = ${Math.round(Number(m.fx) * (1 + (Number(m.usdTaxPct) || 0) / 100)).toLocaleString()}원으로 바꿔요(환율 + 해외 결제 가산)` : "";

  const body = (
    <div className="space-y-3">
      {/* 빠른 추가 */}
      <div>
        <div className="text-[12.5px] font-bold mb-1.5" style={{ color: T.sub }}>무엇을 결제했나요? 누르고 금액만 채우면 돼요</div>
        <div className="flex flex-wrap gap-1.5">
          {PAY_PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => openNew(p)} className="h-8 px-3 rounded-full text-[12.5px] font-black whitespace-nowrap" style={btn(false)}>+ {p.label}</button>
          ))}
        </div>
      </div>

      {/* 입력 칸 */}
      {form && (
        <div className="rounded-[14px] p-3.5 space-y-2.5" style={{ background: T.soft, border: `1px solid ${T.line}` }}>
          <div className="text-[13.5px] font-black" style={{ color: T.ink }}>{form._new ? "결제 넣기" : "결제 고치기"}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Field T={T} l="결제한 날"><input type="date" value={form.date} onChange={(e) => up("date", e.target.value)} className={inp} style={inpStyle} /></Field>
            <Field T={T} l="업체"><input value={form.vendor} onChange={(e) => up("vendor", e.target.value)} placeholder="예: Anthropic" className={inp} style={inpStyle} /></Field>
            <Field T={T} l="항목"><input value={form.item} onChange={(e) => up("item", e.target.value)} placeholder="예: Claude Max 업그레이드" className={inp} style={inpStyle} /></Field>
            <Field T={T} l="분류"><input value={form.group} onChange={(e) => up("group", e.target.value)} placeholder="예: 개발 도구" className={inp} style={inpStyle} /></Field>
            <Field T={T} l="금액">
              <div className="flex gap-1.5">
                <input type="number" step="any" inputMode="decimal" value={form.amount} onChange={(e) => up("amount", e.target.value)} placeholder={form.currency === "USD" ? "예: 100" : "예: 8000"} className={`${inp} text-right`} style={{ ...inpStyle, ...NUMF }} />
                <select value={form.currency} onChange={(e) => up("currency", e.target.value)} className="h-9 px-1.5 rounded-lg text-[13px] font-black" style={inpStyle}><option value="KRW">원</option><option value="USD">$</option></select>
              </div>
            </Field>
            <Field T={T} l="어떻게 나가나요">
              <select value={form.kind} onChange={(e) => up("kind", e.target.value)} className={inp} style={inpStyle}>{PAY_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
            </Field>
            {(form.kind === "monthly" || form.kind === "yearly") && (
              <Field T={T} l="끝나는 날(해지 · 선택)"><input type="date" value={form.endDate} onChange={(e) => up("endDate", e.target.value)} className={inp} style={inpStyle} /></Field>
            )}
            <Field T={T} l="겹치는 예상 비용">
              <select value={form.replaces} onChange={(e) => up("replaces", e.target.value)} className={inp} style={inpStyle}>{PAY_TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
            </Field>
            <div className="col-span-2 md:col-span-4"><Field T={T} l="메모(선택)"><input value={form.memo} onChange={(e) => up("memo", e.target.value)} placeholder="예: 교육 영상 목소리 만들 때 씀" className={inp} style={inpStyle} /></Field></div>
          </div>
          <div className="text-[11.5px] font-bold leading-relaxed" style={{ color: T.dim }}>
            매달은 그 달부터 매달, 매년은 12로 나눠 매달, 한 번 · 충전은 결제한 달에만 잡혀요. '겹치는 예상 비용'을 고르면 그 달은 예상 대신 이 금액을 써요(두 번 세지 않아요).{form.currency === "USD" && fxNote ? ` ${fxNote}.` : ""}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={save} disabled={saving} className="h-9 px-4 rounded-lg text-[13px] font-black disabled:opacity-50" style={btn(true)}>{saving ? "저장 중…" : "저장"}</button>
            <button type="button" onClick={() => { setForm(null); setMsg(""); }} className="h-9 px-4 rounded-lg text-[13px] font-black" style={btn(false)}>취소</button>
            {!form._new && <button type="button" onClick={() => remove(payments.find((p) => p.id === form.id) || form)} className="h-9 px-4 rounded-lg text-[13px] font-black ml-auto" style={{ ...btn(false), color: "#E5484D" }}>지우기</button>}
          </div>
        </div>
      )}
      {msg && <div className="text-[12.5px] font-bold" style={{ color: T.sub }}>{msg}</div>}

      {/* 달 고르기 · 합계 */}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={fym} onChange={(e) => { setFym(e.target.value); setAll(false); }} className="h-9 px-2.5 rounded-lg text-[13px] font-black" style={inpStyle}>
          {months.map((x) => <option key={x} value={x}>{x.slice(0, 4)}년 {Number(x.slice(5))}월</option>)}
        </select>
        <button type="button" onClick={() => setAll((v) => !v)} className="h-9 px-3 rounded-lg text-[12.5px] font-black" style={btn(all)}>{all ? "전체 보는 중" : "전체 보기"}</button>
        <span className="ml-auto text-[12.5px] font-bold" style={{ color: T.sub }}>{Number(fym.slice(5))}월 실제 결제</span>
        <span className="text-[18px] font-black" style={{ ...NUMF, color: T.ink }}>{won(led.total)}</span>
      </div>

      {/* 목록 */}
      {list.length === 0 ? (
        <div className="rounded-[12px] px-4 py-5 text-[13px] font-bold leading-relaxed text-center" style={{ background: T.soft, color: T.sub, border: `1px dashed ${T.line}` }}>
          {payments.length === 0 ? "아직 적은 결제가 없어요." : `${Number(fym.slice(5))}월에 잡히는 결제가 없어요.`} 카드 명세나 영수증을 보고 위 버튼으로 하나씩 넣으면 돼요.<br />
          <span style={{ color: T.dim }}>예: 11/18 Gemini API 충전 8,000원 · Claude 구독 업그레이드 $100(매달)</span>
        </div>
      ) : (
        <div className="rounded-[12px] overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
          {list.map(({ p, i, monthKrw }) => {
            const kind = PAY_KINDS.find((k) => k.id === p.kind) || PAY_KINDS[2];
            const tgt = PAY_TARGETS.find((t) => t.id === (p.replaces ?? ""));
            return (
              <button key={p.id || i} type="button" onClick={() => setForm({ ...EMPTY, ...p, amount: String(p.amount ?? ""), _new: false })} className="w-full text-left px-3.5 py-2.5 flex items-center gap-3 min-w-0" style={{ borderTop: i === list[0].i ? "none" : `1px solid ${T.row}`, background: form && !form._new && form.id === p.id ? T.soft : "transparent" }}>
                <span className="w-[76px] shrink-0 text-[12.5px] font-bold" style={{ ...NUMF, color: T.dim }}>{(p.date || "").slice(2).replace(/-/g, ".")}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-black truncate" style={{ color: T.ink }}>{[p.vendor, p.item].filter(Boolean).join(" · ") || "결제"}</span>
                  <span className="block text-[11.5px] font-bold truncate" style={{ color: T.dim }}>{p.group || "기타"} · {kind.label}{p.endDate ? ` ~${p.endDate}` : ""}{tgt?.id ? ` · ${tgt.label}` : ""}{p.memo ? ` · ${p.memo}` : ""}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-[14px] font-black" style={{ ...NUMF, color: T.ink }}>{p.currency === "USD" ? `$${Number(p.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : won(p.amount)}</span>
                  <span className="block text-[11px] font-bold" style={{ ...NUMF, color: T.dim }}>{all ? (p.currency === "USD" ? `약 ${won(paymentKrw(m, p))}` : "") : `이달 ${won(monthKrw)}`}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="text-[11.5px] font-bold leading-relaxed" style={{ color: T.dim }}>
        여기 넣은 금액은 '실제 결제'로, 단가로 계산한 금액은 '예상'으로 보여요. 줄을 누르면 고치거나 지울 수 있어요.{demo ? " (예시 화면이라 저장되지 않아요)" : ""}
      </div>
    </div>
  );
  if (tone === "dark") return body;
  return (
    <div className="bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)] overflow-hidden min-w-0">
      <div className="flex items-center gap-2 px-4 sm:px-5 min-h-[50px] py-1.5 bg-[#F7F9FC] border-b border-[#E8EDF4]">
        <span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" />
        <span className="text-[10.5px] font-extrabold tracking-[0.2em] text-[#94A3B8]" style={NUMF}>PAYMENTS</span>
        <span className="text-[16px] font-black text-[#0F1A30]">결제 내역</span>
        <span className="ml-auto text-[11.5px] font-bold text-[#7A879C] hidden sm:inline">실제로 낸 돈 · 운영 비용에 바로 반영</span>
      </div>
      <div className="p-4 sm:p-5">{body}</div>
    </div>
  );
}
function Field({ T, l, children }) {
  return <label className="block min-w-0"><span className="block text-[11.5px] font-bold mb-1" style={{ color: T.sub }}>{l}</span>{children}</label>;
}
