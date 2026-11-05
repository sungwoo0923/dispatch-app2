// ======================= src/FareRulesSettings.jsx =======================
// ⭐ 2026-11-02 운임규칙 — 회사관리 › 운임 규칙 (PC·모바일 공용 화면)
//  · 회사 직원(경리·운송·관리자·실무자) 누구나 조회·수정, 조회전용(viewer)은 보기만
//  · 규칙 카드: 이름 · 계산(퍼센트/정액) · 예시 · 사용 토글 · 수정/삭제 · [+ 규칙 추가]
//  · "운임 규칙 사용"을 켠 회사만 오더 입력/수정 화면에 "운임구분" 칸이 나타난다
import React from "react";
import { doc, setDoc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { db, auth } from "./firebase";
import { useFareRules, applyFareRule, fareRuleCalcLabel } from "./fareRules";
import { kpConfirm } from "./kpDialog";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const won = (n) => Math.round(Number(n) || 0).toLocaleString();
const newId = () => `fr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const fmtAt = (v) => {
  const d = new Date(typeof v === "number" ? v : (v?.toMillis ? v.toMillis() : v || 0));
  if (!d.getTime()) return "";
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const EXAMPLE_SALE = 500000;

function Toggle({ on, onChange, disabled, label, big = false }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
      className={`relative shrink-0 rounded-full transition-colors ${big ? "w-[56px] h-[30px]" : "w-[46px] h-[26px]"} ${on ? "bg-[#2D4C82]" : "bg-[#CBD3E1]"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
      <span className={`absolute top-[3px] rounded-full bg-white shadow transition-all ${big ? "w-[24px] h-[24px]" : "w-[20px] h-[20px]"} ${on ? (big ? "left-[29px]" : "left-[23px]") : "left-[3px]"}`} />
    </button>
  );
}

function RuleEditor({ initial, onCancel, onSave, existingNames }) {
  const [f, setF] = React.useState(() => ({ name: "", type: "percent", value: "", memo: "", active: true, ...(initial || {}) }));
  const [err, setErr] = React.useState("");
  const valNum = Number(String(f.value).replace(/[^\d.]/g, "")) || 0;
  const ex = applyFareRule({ ...f, value: valNum }, EXAMPLE_SALE);
  const submit = () => {
    const name = String(f.name || "").trim();
    if (!name) return setErr("규칙 이름을 입력하세요 (예: 일대, 월대)");
    if (existingNames.includes(name)) return setErr("같은 이름의 규칙이 이미 있습니다");
    if (!(valNum >= 0)) return setErr("값을 입력하세요");
    if (f.type === "percent" && valNum > 100) return setErr("퍼센트는 100 이하로 입력하세요");
    onSave({ ...f, name, value: valNum, memo: String(f.memo || "").trim() });
  };
  const inp = "w-full h-[44px] px-3 rounded-xl border border-[#C9D5EA] bg-white text-[15px] font-semibold text-[#0F1A30] focus:outline-none focus:ring-2 focus:ring-[#8FB0F0]";
  return (
    <div className="fixed inset-0 z-[100000] bg-[#0B1428]/60 grid place-items-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-full max-w-[460px] rounded-[20px] bg-white shadow-2xl overflow-hidden" data-fare-editor="1">
        <div className="px-5 py-4 bg-[#0F1A30] text-white">
          <div className="text-[11px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>FARE RULE</div>
          <div className="text-[18px] font-extrabold mt-0.5">{initial?.id ? "규칙 수정" : "규칙 추가"}</div>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-bold text-[#1B2B4B]">규칙 이름</span>
            <input autoFocus className={inp} placeholder="예: 일대, 월대" value={f.name} maxLength={20} onChange={(e) => setF({ ...f, name: e.target.value })} data-fare-name="1" />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-bold text-[#1B2B4B]">계산 방식</span>
            <div className="grid grid-cols-2 gap-2">
              {[["percent", "퍼센트(%)", "청구운임의 몇 %"], ["fixed", "정액(원)", "건당 고정 금액"]].map(([k, t, s]) => (
                <button key={k} type="button" onClick={() => setF({ ...f, type: k })}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${f.type === k ? "border-[#2D4C82] bg-[#EAF0FB] ring-2 ring-[#8FB0F0]" : "border-[#D9E0EA] bg-white hover:bg-[#F5F8FD]"}`}>
                  <div className="text-[15px] font-extrabold text-[#1B2B4B]">{t}</div>
                  <div className="text-[13px] text-[#6B7A99] font-semibold">{s}</div>
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-bold text-[#1B2B4B]">{f.type === "percent" ? "수수료율 (%)" : "수수료 (원)"}</span>
            <div className="relative">
              <input className={`${inp} pr-10`} inputMode="decimal" placeholder={f.type === "percent" ? "7" : "30,000"} data-fare-value="1"
                value={f.type === "fixed" && f.value !== "" ? Number(String(f.value).replace(/[^\d]/g, "") || 0).toLocaleString() : f.value}
                onChange={(e) => setF({ ...f, value: f.type === "fixed" ? e.target.value.replace(/[^\d]/g, "") : e.target.value.replace(/[^\d.]/g, "") })} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[15px] font-bold text-[#6B7A99]">{f.type === "percent" ? "%" : "원"}</span>
            </div>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-bold text-[#1B2B4B]">메모 <span className="font-semibold text-[#8A97B0]">(선택)</span></span>
            <input className={inp} placeholder="예: 하루 단위 용차" value={f.memo} maxLength={60} onChange={(e) => setF({ ...f, memo: e.target.value })} />
          </label>
          <div className="rounded-xl bg-[#F3F6FB] border border-[#E3E8F0] px-3.5 py-3 text-[14px] text-[#1B2B4B]">
            <div className="text-[12.5px] font-bold text-[#6B7A99] mb-0.5">계산 예시</div>
            청구 {won(EXAMPLE_SALE)}원 → 수수료 <b style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won(ex.수수료)}</b> · 기사운임 <b style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won(ex.기사운임)}</b>
          </div>
          {err && <div className="text-[14px] font-bold text-red-600">{err}</div>}
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 h-[46px] rounded-xl border border-[#D9E0EA] text-[15px] font-bold text-[#1B2B4B] hover:bg-[#F5F8FD]">취소</button>
          <button type="button" onClick={submit} className="flex-1 h-[46px] rounded-xl bg-[#1B2B4B] text-white text-[15px] font-extrabold hover:bg-[#2D4C82]" data-fare-save="1">저장</button>
        </div>
      </div>
    </div>
  );
}

export default function FareRulesSettings({ company, canEdit = true, myName = "", mobile = false }) {
  const fr = useFareRules(company);
  const co = fr.company;
  const [editing, setEditing] = React.useState(null); // null | {} | rule
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [saved, setSaved] = React.useState("");
  const by = myName || auth?.currentUser?.displayName || (auth?.currentUser?.email || "").split("@")[0] || "";

  const save = async (patch, change) => {
    if (!canEdit || !co) return;
    setBusy(true); setMsg("");
    try {
      await setDoc(doc(db, "fareRules", co), {
        companyName: co,
        enabled: fr.enabled,
        rules: fr.rules,
        ...patch,
        history: arrayUnion({ at: Date.now(), by, change }),
        updatedAt: serverTimestamp(),
        updatedBy: by,
      }, { merge: true });
      setSaved("저장했습니다"); setTimeout(() => setSaved(""), 1800);
    } catch (e) {
      setMsg(`저장하지 못했습니다: ${e?.code || e?.message || e}`);
    } finally { setBusy(false); }
  };
  const ruleLabel = (r) => `${r.name}(${fareRuleCalcLabel(r)})`;
  const onSaveRule = async (r) => {
    const prev = fr.rules.find((x) => x.id === r.id);
    const rules = prev ? fr.rules.map((x) => (x.id === r.id ? { ...x, ...r } : x)) : [...fr.rules, { ...r, id: newId(), active: true }];
    setEditing(null);
    await save({ rules }, prev ? `규칙 수정 ${ruleLabel(prev)} → ${ruleLabel(r)}` : `규칙 추가 ${ruleLabel(r)}`);
  };
  const onDelete = async (r) => {
    if (!(await kpConfirm(`'${r.name}' 규칙을 삭제할까요?\n이미 저장된 오더의 운임은 바뀌지 않습니다.`))) return;
    await save({ rules: fr.rules.filter((x) => x.id !== r.id) }, `규칙 삭제 ${ruleLabel(r)}`);
  };
  const onToggleRule = (r, on) => save({ rules: fr.rules.map((x) => (x.id === r.id ? { ...x, active: on } : x)) }, `${r.name} ${on ? "사용" : "사용 안 함"}`);
  const onMaster = (on) => save({ enabled: on }, on ? "운임 규칙 사용 켬" : "운임 규칙 사용 끔");

  const history = [...(fr.history || [])].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 30);

  return (
    <div className="flex flex-col gap-4 w-full" data-fare-settings="1">
      {/* 머리 카드 — 사용 스위치 */}
      <div className="rounded-[20px] bg-[#0F1A30] text-white p-5 md:p-6 shadow-[0_10px_28px_rgba(11,20,40,0.25)] relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-[#2D4C82]/40 blur-2xl pointer-events-none" />
        <div className="relative flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="text-[11px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>FARE RULES</div>
            <div className="text-[20px] md:text-[22px] font-extrabold mt-1">운임 규칙</div>
            <div className="text-[14px] text-[#B9C7E3] mt-1.5 leading-relaxed">
              운임구분(일대·월대 등)별 수수료 계산을 정해 두면, 오더에 운임구분과 청구운임을 넣을 때
              <b className="text-white"> 기사운임·수수료가 자동으로</b> 채워집니다.
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
            <div>
              <div className="text-[15px] font-extrabold">운임 규칙 사용</div>
              <div className="text-[13px] text-[#B9C7E3]">{fr.enabled ? "오더 화면에 운임구분 표시 중" : "꺼짐 — 오더 화면은 예전 그대로"}</div>
            </div>
            <Toggle big on={fr.enabled} onChange={onMaster} disabled={!canEdit || busy || !fr.loaded} label="운임 규칙 사용" />
          </div>
        </div>
        {!canEdit && <div className="relative mt-3 text-[14px] font-bold text-amber-200">조회전용 권한 — 보기만 할 수 있습니다.</div>}
        <div className="relative mt-3 flex items-center gap-2 text-[14px] font-semibold text-[#B9C7E3] min-h-[20px]" aria-live="polite">
          {!fr.loaded ? <span>불러오는 중…</span> : busy ? <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB0F0] animate-pulse" />저장 중…</span>
            : saved ? <span className="inline-flex items-center gap-1.5 text-[#CFE0FF]"><span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />{saved}</span>
            : fr.data?.updatedBy ? <span>마지막 변경 · {fr.data.updatedBy}</span> : null}
        </div>
      </div>

      {msg && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[14px] font-bold text-red-700">{msg}</div>}

      {/* 규칙 카드 목록 */}
      <div className="rounded-[20px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)] p-4 md:p-5">
        <div className="flex items-center gap-2 mb-3">
          <div>
            <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#2D4C82]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>RULES</div>
            <div className="text-[16px] font-extrabold text-[#0F1A30] leading-tight">규칙 목록 <span className="text-[13px] font-bold text-[#6B7A99] tabular-nums">{fr.rules.length}개</span></div>
          </div>
          {canEdit && (
            <button type="button" onClick={() => setEditing({})} disabled={busy}
              className="ml-auto h-[40px] px-4 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-extrabold hover:bg-[#2D4C82] disabled:opacity-50" data-fare-add="1">
              + 규칙 추가
            </button>
          )}
        </div>
        {!fr.loaded ? (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1].map((i) => <div key={i} className="h-[190px] rounded-2xl border border-[#E3E8F0] bg-[#F3F6FB] animate-pulse" />)}
          </div>
        ) : fr.rules.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[#D9E0EA] py-10 text-center">
            <div className="text-[15px] font-bold text-[#1B2B4B]">아직 규칙이 없습니다</div>
            <div className="text-[14px] text-[#6B7A99] mt-1">예: 일대 7% · 월대 5% · 정액 30,000원</div>
            {canEdit && <button type="button" onClick={() => setEditing({})} className="mt-3 h-[40px] px-4 rounded-xl border border-[#C9D5EA] text-[14px] font-extrabold text-[#1B2B4B] hover:bg-[#EAF0FB]">첫 규칙 만들기</button>}
          </div>
        ) : (
          <div className={`grid gap-3 ${mobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"}`}>
            {fr.rules.map((r) => {
              const ex = applyFareRule(r, EXAMPLE_SALE);
              const on = r.active !== false;
              return (
                <div key={r.id || r.name} data-fare-card={r.name}
                  className={`rounded-2xl border p-4 flex flex-col gap-2.5 transition ${on ? "border-[#C9D5EA] bg-gradient-to-b from-white to-[#F6F9FE]" : "border-[#E3E8F0] bg-[#F7F8FA] opacity-70"}`}>
                  <div className="flex items-center gap-2">
                    <div className="text-[18px] font-extrabold text-[#0F1A30] truncate">{r.name}</div>
                    <span className={`px-2 py-0.5 rounded-md text-[12.5px] font-extrabold ${r.type === "fixed" ? "bg-[#F1ECFB] text-[#5B3FA8]" : "bg-[#EAF0FB] text-[#2D4C82]"}`}>{r.type === "fixed" ? "정액" : "퍼센트"}</span>
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-[13px] font-bold text-[#6B7A99]">사용</span>
                      <Toggle on={on} onChange={(v) => onToggleRule(r, v)} disabled={!canEdit || busy} label={`${r.name} 사용`} />
                    </div>
                  </div>
                  <div className="text-[24px] font-black text-[#1B2B4B] leading-none tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
                    {r.type === "fixed" ? `${won(r.value)}원` : `${Number(r.value) || 0}%`}
                  </div>
                  <div className="rounded-xl bg-white border border-[#E3E8F0] px-3 py-2 text-[14px] text-[#1B2B4B] leading-snug tabular-nums flex flex-wrap gap-x-1.5">
                    <span className="whitespace-nowrap">청구 {won(EXAMPLE_SALE)}원 →</span>
                    <span className="whitespace-nowrap">수수료 <b>{won(ex.수수료)}</b> ·</span>
                    <span className="whitespace-nowrap">기사운임 <b>{won(ex.기사운임)}</b></span>
                  </div>
                  {r.memo && <div className="text-[13.5px] text-[#6B7A99] font-semibold">{r.memo}</div>}
                  {canEdit && (
                    <div className="flex gap-2 pt-0.5">
                      <button type="button" onClick={() => setEditing(r)} disabled={busy} className="flex-1 h-[38px] rounded-xl border border-[#C9D5EA] text-[14px] font-bold text-[#1B2B4B] hover:bg-[#EAF0FB]">수정</button>
                      <button type="button" onClick={() => onDelete(r)} disabled={busy} className="h-[38px] px-4 rounded-xl text-[14px] font-bold text-red-600 hover:bg-red-50">삭제</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 text-[14px] text-[#6B7A99] leading-relaxed break-keep">
          · 수수료 = 퍼센트면 청구운임 × % (원 단위 반올림), 정액이면 그 금액 · 기사운임 = 청구운임 − 수수료<br />
          · 기사운임을 직접 고친 오더는 그 값을 유지하고, [↺ 규칙대로]를 누르면 다시 계산합니다. 규칙을 바꿔도 이미 저장된 오더는 바뀌지 않습니다.
        </div>
      </div>

      {/* 변경 이력 */}
      <div className="rounded-[20px] bg-white border border-[#E3E8F0] p-4 md:p-5">
        <div className="mb-2">
          <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#2D4C82]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>HISTORY</div>
          <div className="text-[16px] font-extrabold text-[#0F1A30] leading-tight">변경 이력</div>
        </div>
        {history.length === 0 ? (
          <div className="text-[14px] text-[#8A97B0] py-3">아직 변경 이력이 없습니다. 규칙을 추가하거나 바꾸면 누가 언제 바꿨는지 여기에 남습니다.</div>
        ) : (
          <ul className="divide-y divide-[#EEF2F8]" data-fare-history="1">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`} className={`py-2.5 ${mobile ? "flex flex-col gap-0.5" : "grid grid-cols-[150px_110px_minmax(0,1fr)] items-baseline gap-3"}`}>
                <span className={mobile ? "flex items-baseline gap-2" : "contents"}>
                  <span className="text-[13px] font-bold text-[#6B7A99] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{fmtAt(h.at)}</span>
                  <span className="text-[14px] font-bold text-[#2D4C82] truncate">{h.by || "-"}</span>
                </span>
                <span className="text-[14px] text-[#1B2B4B] min-w-0 break-keep">{h.change}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <RuleEditor
          initial={editing.id ? editing : null}
          existingNames={fr.rules.filter((x) => x.id !== editing.id).map((x) => String(x.name || "").trim())}
          onCancel={() => setEditing(null)}
          onSave={onSaveRule}
        />
      )}
    </div>
  );
}
