// ======================= src/BankAccountInput.jsx =======================
// 🏦 입금 계좌 입력 — 은행(드롭다운) · 계좌번호(은행 형식대로 하이픈 자동) · 예금주(직접 입력)
//  + 자주 쓰는 계좌: 처음 입력할 때 "자주 쓰는 계좌로 등록"을 체크하면 저장되고,
//    다음부터는 [자주 쓰는 계좌] 버튼에서 고르면 세 칸이 한 번에 채워진다(본인만 보임: userPrefs/{uid}).
import React from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { BANK_NAMES, formatAccount, onlyDigits, parseBankText, validateAccount } from "./bankUtil";
import { CustomSelect } from "./CustomSelect";

const inp = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";

export function useFavAccounts() {
  const uid = auth.currentUser?.uid;
  const [list, setList] = React.useState([]);
  React.useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(doc(db, "userPrefs", uid), (s) => setList((s.exists() && s.data().favAccounts) || []), () => setList([]));
  }, [uid]);
  const save = React.useCallback(async (next) => {
    if (!uid) return;
    await setDoc(doc(db, "userPrefs", uid), { favAccounts: next }, { merge: true });
  }, [uid]);
  return [list, save];
}

export default function BankAccountInput({ value, onChange, compact = false, noFav = false }) {
  const v = typeof value === "string" ? parseBankText(value) : (value || { bank: "", acct: "", holder: "" });
  const set = (patch) => onChange({ ...v, ...patch });
  const [favs, saveFavs] = useFavAccounts();
  const [open, setOpen] = React.useState(false);
  const [remember, setRemember] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const boxRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const check = v.bank || v.acct ? validateAccount(v.bank, v.acct) : null;
  const already = favs.some((f) => f.bank === v.bank && onlyDigits(f.acct) === onlyDigits(v.acct));
  const addFav = async () => {
    if (!check?.ok) return alert(check?.msg || "계좌를 먼저 입력해 주세요");
    if (already) return;
    await saveFavs([...favs, { id: String(Date.now()), label: label.trim() || v.holder || v.bank, bank: v.bank, acct: onlyDigits(v.acct), holder: v.holder || "" }].slice(-20));
    setRemember(false); setLabel("");
  };
  const removeFav = async (id) => { if (window.confirm("자주 쓰는 계좌에서 뺄까요?")) await saveFavs(favs.filter((f) => f.id !== id)); };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-bold text-[#7A89A3]">은행 · 계좌번호 · 예금주</span>
        {!noFav && <div className="relative" ref={boxRef}>
          <button type="button" onClick={() => setOpen((o) => !o)}
            className="h-7 px-2.5 rounded-lg border border-[#C9D6EE] bg-[#F3F6FA] text-[12px] font-black text-[#1B2B4B] hover:bg-[#EEF3FC] whitespace-nowrap">
            + 자주 쓰는 계좌{favs.length ? ` ${favs.length}` : ""}
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 z-50 w-[300px] max-h-[280px] overflow-y-auto rounded-xl border border-[#DCE3EE] bg-white shadow-[0_14px_34px_rgba(15,26,48,0.18)] p-1">
              {favs.length === 0 ? (
                <div className="px-3 py-4 text-[12.5px] text-[#7A89A3] text-center">아직 등록한 계좌가 없습니다<br />입력 후 "자주 쓰는 계좌로 등록"을 체크하세요</div>
              ) : favs.map((f) => (
                <div key={f.id} className="flex items-center gap-1 rounded-lg hover:bg-[#F3F6FA]">
                  <button type="button" onClick={() => { onChange({ bank: f.bank, acct: f.acct, holder: f.holder }); setOpen(false); }} className="flex-1 min-w-0 text-left px-2.5 py-2">
                    <div className="text-[13px] font-black text-[#0F1A30] truncate">{f.label}</div>
                    <div className="text-[12px] text-[#5B6B85] truncate tabular-nums">{f.bank} {formatAccount(f.bank, f.acct)} · {f.holder}</div>
                  </button>
                  <button type="button" onClick={() => removeFav(f.id)} className="w-7 h-7 shrink-0 rounded-md text-[#9AA9C3] hover:bg-white">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>}
      </div>
      <div className={`grid gap-1.5 ${compact ? "grid-cols-1" : "grid-cols-[130px_minmax(0,1fr)_110px]"}`}>
        <CustomSelect value={v.bank || ""} onChange={(e) => set({ bank: e.target.value, acct: v.acct })} className={inp}>
          <option value="">은행 선택</option>
          {BANK_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
        </CustomSelect>
        <input inputMode="numeric" value={formatAccount(v.bank, v.acct)} onChange={(e) => set({ acct: onlyDigits(e.target.value) })}
          placeholder={v.bank ? "숫자만 입력 — 하이픈 자동" : "은행을 먼저 고르세요"} className={`${inp} tabular-nums tracking-wide`} />
        <input value={v.holder || ""} onChange={(e) => set({ holder: e.target.value })} placeholder="예금주" className={inp} />
      </div>
      <div className="flex items-center justify-between gap-2 min-h-[22px]">
        {check ? (
          <span className={`text-[12px] font-bold ${check.level === "ok" ? "text-[#1B2B4B]" : check.level === "warn" ? "text-[#2D4C82]" : "text-[#7A89A3]"}`}>
            {check.level === "ok" ? "✓ " : "! "}{check.msg}
          </span>
        ) : <span />}
        {!noFav && check?.ok && !already && (
          <label className="flex items-center gap-1.5 text-[12px] font-bold text-[#1B2B4B] whitespace-nowrap">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />자주 쓰는 계좌로 등록
          </label>
        )}
        {!noFav && already && <span className="text-[12px] font-bold text-[#7A89A3] whitespace-nowrap">★ 자주 쓰는 계좌</span>}
      </div>
      {!noFav && remember && check?.ok && !already && (
        <div className="flex items-center gap-1.5">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="이름 (예: 내 계좌, ○○상사)" className={`${inp} !h-9`} />
          <button type="button" onClick={addFav} className="h-9 px-3 rounded-xl bg-[#1B2B4B] text-white text-[12.5px] font-black whitespace-nowrap">등록</button>
        </div>
      )}
    </div>
  );
}

// 사유 빠른 양식 — 고르면 입력칸을 채운다(이어 쓰기 가능)
export function ReasonTemplates({ templates = [], value, onPick }) {
  if (!templates.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mb-1.5">
      {templates.map((t) => (
        <button key={t} type="button" onClick={() => onPick(value && String(value).trim() ? `${String(value).trim()}\n${t}` : t)}
          className="h-7 px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[12px] font-bold text-[#3A4A66] hover:border-[#2D4C82] hover:text-[#0F1A30] whitespace-nowrap">{t}</button>
      ))}
    </div>
  );
}
