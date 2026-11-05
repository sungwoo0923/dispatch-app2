// ======================= src/DriverEditChoice.jsx =======================
// ⭐ 2026-11-05 기사 정보 "수정" — 차량번호로 등록 기사와 매칭되면 이름·전화번호가 자동으로
//  채워지고 잠기는데(읽기 전용), 같은 차량번호라도 기사님 이름·전화번호가 바뀌는 일이 생겨
//  그 자리에서 바로 고칠 수 있게 한다.
//   1) 잠긴 이름·전화번호 옆 [수정] → 두 칸이 수정 가능해짐([완료]·[되돌리기])
//   2) [완료](또는 오더 저장) 때 바뀐 게 있으면 → "기존 기사 정보를 바꿀까요, 별도로 추가할까요?"
//      · 기존 정보 변경 — 같은 기사 문서(같은 id)의 이름·전화번호를 바꾼다
//      · 별도 추가     — 기존 기사는 그대로 두고, 같은 차량번호로 기사 문서를 하나 더 만든다
//      · 취소          — 기사관리는 건드리지 않고 수정 상태로 돌아간다
//   오더에는 어느 쪽이든 수정한 이름·전화번호가 들어간다(호출하는 화면이 이미 그 값을 갖고 있음).
//  PC(DispatchApp.jsx)의 모든 등록/복사·수정 패널/수정 창과 모바일(MobileApp.jsx)이 같이 쓴다.
import React from "react";
import { createPortal } from "react-dom";
import { coDocKey } from "./coKey";

// ── 비교용 정규화 ──
export const drvPlateKey = (s = "") => String(s || "").replace(/[\s-]/g, "").toUpperCase();
const nDigits = (s = "") => String(s || "").replace(/[^\d]/g, "");
const nName = (s = "") => String(s || "").trim();
const fmtTel = (p = "") => {
  const d = nDigits(p);
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return d.startsWith("02") ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9 && d.startsWith("02")) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return p || "";
};

// 이 차량번호로 등록된 기사 전부(같은 차량번호 기사 여러 명 지원)
export function driversOfPlate(drivers, plate) {
  const k = drvPlateKey(plate);
  if (!k) return [];
  return (drivers || []).filter((d) => d && drvPlateKey(d.차량번호) === k);
}

// 지금 화면의 이름·전화번호가 "어느 등록 기사"에서 왔는지 고른다 —
//  이름+전화 일치 > 이름 일치 > 전화 일치 > (한 명뿐이면) 그 기사. 여러 명인데 아무도 안 맞으면 첫 번째.
export function pickDriverFor(drivers, plate, name, phone) {
  const list = driversOfPlate(drivers, plate);
  if (!list.length) return null;
  const nm = nName(name), ph = nDigits(phone);
  return (
    list.find((d) => nName(d.이름) === nm && nDigits(d.전화번호) === ph) ||
    (nm && list.find((d) => nName(d.이름) === nm)) ||
    (ph && list.find((d) => nDigits(d.전화번호) === ph)) ||
    list[0]
  );
}

// 이름·전화번호가 이 차량번호의 "어떤" 등록 기사와 완전히 같은지
export function isRegisteredCombo(drivers, plate, name, phone) {
  const nm = nName(name), ph = nDigits(phone);
  return driversOfPlate(drivers, plate).some((d) => nName(d.이름) === nm && nDigits(d.전화번호) === ph);
}

// ⭐ "별도 추가" 기사 문서 이름 — 기본 문서는 `차량번호`(기본 회사) 또는 `회사__차량번호`인데
//  그 이름을 그대로 쓰면 기존 기사를 덮어쓴다. 같은 규칙 뒤에 `__x` + 시간·난수를 붙여
//  ① 기존 문서와 절대 겹치지 않고 ② 문서 이름만 봐도 어느 회사·차량번호인지 알 수 있게 한다.
//  (기사앱 가입/로그인의 선등록 조회는 정확히 `차량번호`/`회사__차량번호`만 보므로 영향 없음)
export function extraDriverDocId(company, plate) {
  const p = drvPlateKey(plate) || "plate";
  const rand = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return coDocKey(company, `${p}__x${rand}`);
}

// 실제 저장 — upsertDriver는 PC/모바일 각자의 것(같은 모양: {id, 차량번호, 이름, 전화번호})
export async function saveDriverChoice(choice, { existing, plate, name, phone, upsertDriver, company }) {
  if (typeof upsertDriver !== "function") return null;
  const 이름 = nName(name);
  const 전화번호 = fmtTel(phone);
  if (choice === "update" && existing?.id) {
    return upsertDriver({
      id: existing.id,
      차량번호: existing.차량번호 || plate,
      이름,
      전화번호,
      ...(existing.companyName ? { companyName: existing.companyName } : {}),
      ...(existing.createdAt ? { createdAt: existing.createdAt } : {}),
    });
  }
  if (choice === "update") {
    // 기존 문서 id를 모를 때만 — 예전 방식(차량번호로 찾아 덮어쓰기)
    return upsertDriver({ 차량번호: String(plate || "").replace(/\s+/g, ""), 이름, 전화번호 });
  }
  // "별도 추가" → 새 문서
  return upsertDriver({ id: extraDriverDocId(company, plate), 차량번호: String(plate || "").replace(/\s+/g, ""), 이름, 전화번호, 별도추가: true });
}

// ── 선택 팝업(프로그램 스타일) ──
export function DriverEditChoiceModal({ plate, existing, next, sameCount = 1, onChoose }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onChoose("cancel"); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onChoose]);
  const nameChanged = nName(existing?.이름) !== nName(next?.이름);
  const phoneChanged = nDigits(existing?.전화번호) !== nDigits(next?.전화번호);
  const body = (
    <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-[#0F1A30]/55 px-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onChoose("cancel"); }} data-driver-edit-choice>
      <div className="w-full max-w-[440px] overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,26,48,0.35)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-start justify-between">
          <div>
            <h3 className="text-white font-bold text-[16px]">기사 정보 수정</h3>
            <p className="text-[#8FB0F0] text-[13px] mt-1 font-semibold">기존 기사 정보를 바꿀까요, 별도로 추가할까요?</p>
          </div>
          <button type="button" onClick={() => onChoose("cancel")} className="text-white/60 hover:text-white text-xl leading-none ml-4">✕</button>
        </div>
        <div className="px-6 pt-5 space-y-3">
          <div className="text-[13px] text-[#1B2B4B] font-bold">
            차량번호 <span className="ml-1 px-2 py-0.5 rounded-lg bg-[#EEF3FC] text-[#2D4C82]">{plate || "-"}</span>
            {sameCount > 1 && <span className="ml-2 text-[12px] font-semibold text-slate-500">이 차량번호 등록 기사 {sameCount}명</span>}
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
            <div className="rounded-2xl border border-[#E3E8F0] bg-[#F7F9FC] px-3.5 py-3">
              <div className="text-[11.5px] font-semibold text-slate-500 mb-1">기존 등록 정보</div>
              <div className="text-[15px] font-bold text-[#0F1A30] break-all">{existing?.이름 || "-"}</div>
              <div className="text-[13px] text-slate-600 mt-0.5">{fmtTel(existing?.전화번호) || "-"}</div>
            </div>
            <div className="flex items-center text-[#2D4C82] text-[18px] font-bold">→</div>
            <div className="rounded-2xl border-2 border-[#8FB0F0] bg-[#EEF3FC] px-3.5 py-3">
              <div className="text-[11.5px] font-semibold text-[#2D4C82] mb-1">수정한 정보</div>
              <div className={`text-[15px] font-bold break-all ${nameChanged ? "text-[#2D4C82]" : "text-[#0F1A30]"}`}>{next?.이름 || "-"}</div>
              <div className={`text-[13px] mt-0.5 ${phoneChanged ? "text-[#2D4C82] font-bold" : "text-slate-600"}`}>{fmtTel(next?.전화번호) || "-"}</div>
            </div>
          </div>
          <p className="text-[12.5px] text-slate-500 leading-relaxed">이 오더에는 어느 쪽을 골라도 <b className="text-[#1B2B4B]">수정한 이름·전화번호</b>가 들어갑니다.</p>
        </div>
        <div className="px-6 pt-4 pb-6 space-y-2.5">
          <button type="button" data-choice="update" onClick={() => onChoose("update")}
            className="w-full rounded-2xl bg-[#1B2B4B] hover:bg-[#2D4C82] text-white px-4 py-3 text-left transition">
            <div className="text-[14.5px] font-bold">기존 정보 변경</div>
            <div className="text-[12px] text-white/70 mt-0.5">이 차량번호의 기존 기사 정보를 수정한 내용으로 바꿉니다</div>
          </button>
          <button type="button" data-choice="add" onClick={() => onChoose("add")}
            className="w-full rounded-2xl border-2 border-[#2D4C82] bg-white hover:bg-[#EEF3FC] text-[#1B2B4B] px-4 py-3 text-left transition">
            <div className="text-[14.5px] font-bold">별도 추가</div>
            <div className="text-[12px] text-slate-500 mt-0.5">기존 기사는 그대로 두고, 같은 차량번호로 기사 1명을 더 등록합니다</div>
          </button>
          <button type="button" data-choice="cancel" onClick={() => onChoose("cancel")}
            className="w-full rounded-2xl bg-[#F1F4F9] hover:bg-[#E3E8F0] text-slate-600 py-2.5 text-[13.5px] font-semibold transition">
            취소
          </button>
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(body, document.body) : body;
}

// ── [수정] / [완료]·[되돌리기] 버튼 ──
//  size: "md"(기본) · compact(28px) · tiny(22px — 라벨 줄 안에 넣을 때, 되돌리기는 ↺ 아이콘)
export function DriverEditButton({ editing, onEdit, onDone, onRevert, compact = false, tiny = false, className = "" }) {
  const h = tiny ? "h-[22px] px-2 text-[11.5px]" : compact ? "h-[28px] px-2.5 text-[12px]" : "h-[32px] px-3 text-[12.5px]";
  if (!editing) {
    return (
      <button type="button" data-driver-edit="edit" title="이름·전화번호 수정"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onEdit}
        className={`shrink-0 inline-flex items-center gap-1 rounded-xl border border-[#2D4C82]/40 bg-white text-[#2D4C82] font-bold hover:bg-[#EEF3FC] hover:border-[#2D4C82] transition whitespace-nowrap ${h} ${className}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        수정
      </button>
    );
  }
  return (
    <span className={`shrink-0 inline-flex items-center gap-1 ${className}`}>
      <button type="button" data-driver-edit="done" onMouseDown={(e) => e.preventDefault()} onClick={onDone}
        className={`rounded-xl bg-[#1B2B4B] hover:bg-[#2D4C82] text-white font-bold transition whitespace-nowrap ${h}`}>완료</button>
      {onRevert && (
        <button type="button" data-driver-edit="revert" onMouseDown={(e) => e.preventDefault()} onClick={onRevert}
          title="수정 전으로 되돌리기"
          className={`rounded-xl bg-[#F1F4F9] hover:bg-[#E3E8F0] text-slate-600 font-semibold transition whitespace-nowrap ${tiny ? "h-[22px] w-[22px] inline-flex items-center justify-center text-[13px]" : h}`}>{tiny ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg> : "되돌리기"}</button>
      )}
    </span>
  );
}

// ── 화면 하나에서 쓰는 상태 묶음 ──
//  const de = useDriverEditChoice({ drivers, upsertDriver, company, notify });
//  잠금 여부:  de.isLocked(plate)  (등록 기사 있음 && 수정 중 아님)
//  버튼:      <DriverEditButton editing={de.editing} onEdit={() => de.begin(cur)} onDone={() => de.finish(cur)} onRevert={() => apply(de.revert())} />
//  저장 직전: if (!(await de.finish(cur))) return;   // 취소면 저장 중단
//  JSX 어딘가: {de.modal}
export function useDriverEditChoice({ drivers, upsertDriver, company = "", notify } = {}) {
  const [editing, setEditing] = React.useState(false);
  const [ask, setAsk] = React.useState(null);
  const origRef = React.useRef(null);
  const driversRef = React.useRef(drivers);
  driversRef.current = drivers;

  const isLocked = React.useCallback((plate) => !editing && driversOfPlate(driversRef.current, plate).length > 0, [editing]);

  // cur = { 차량번호, 이름, 전화번호 } — 지금 화면 값
  const begin = React.useCallback((cur = {}) => {
    const reg = pickDriverFor(driversRef.current, cur.차량번호, cur.이름, cur.전화번호);
    origRef.current = { 차량번호: cur.차량번호 || "", 이름: cur.이름 || "", 전화번호: cur.전화번호 || "", driver: reg };
    setEditing(true);
  }, []);

  const reset = React.useCallback(() => { origRef.current = null; setEditing(false); setAsk(null); }, []);

  // 되돌리기 — 수정 전 값을 돌려준다(화면이 직접 반영)
  const revert = React.useCallback(() => {
    const o = origRef.current;
    origRef.current = null;
    setEditing(false);
    return o ? { 이름: o.이름, 전화번호: o.전화번호 } : null;
  }, []);

  // 완료/저장 — true: 계속 진행(오더에 수정값 사용), false: 취소(수정 상태 유지)
  const finish = React.useCallback(async (cur = {}) => {
    const o = origRef.current;
    if (!o) { setEditing(false); return true; }
    const plate = String(cur.차량번호 || o.차량번호 || "").replace(/\s+/g, "");
    const nm = nName(cur.이름), ph = nDigits(cur.전화번호);
    const changed = nm !== nName(o.이름) || ph !== nDigits(o.전화번호);
    const list = driversOfPlate(driversRef.current, plate);
    // 안 바뀌었거나 / 이름이 비었거나 / 이미 등록된 조합(같은 차량번호의 다른 기사로 고른 것) → 팝업 없이 끝
    if (!changed || !nm || !plate || !list.length || isRegisteredCombo(driversRef.current, plate, nm, ph)) {
      origRef.current = null; setEditing(false); return true;
    }
    const existing = (o.driver && list.find((d) => d.id && d.id === o.driver.id)) || pickDriverFor(driversRef.current, plate, o.이름, o.전화번호);
    const choice = await new Promise((resolve) => setAsk({ plate, existing, next: { 이름: nm, 전화번호: cur.전화번호 }, sameCount: list.length, resolve }));
    setAsk(null);
    if (choice === "cancel") return false;
    try {
      await saveDriverChoice(choice, { existing, plate, name: nm, phone: cur.전화번호, upsertDriver, company });
      notify?.(choice === "update" ? `✓ 기사 정보를 변경했습니다 (${plate} ${nm})` : `✓ 같은 차량번호로 기사를 별도 추가했습니다 (${plate} ${nm})`);
    } catch (e) {
      console.error("기사 정보 저장 실패:", e);
      notify?.("기사관리 저장에 실패했습니다. 오더에는 수정한 정보가 들어갑니다.");
    }
    origRef.current = null; setEditing(false);
    return true;
  }, [upsertDriver, company, notify]);

  const modal = ask ? (
    <DriverEditChoiceModal plate={ask.plate} existing={ask.existing} next={ask.next} sameCount={ask.sameCount} onChoose={(c) => ask.resolve(c)} />
  ) : null;

  return { editing, isLocked, begin, finish, revert, reset, modal };
}

// ── 같은 차량번호 기사가 여러 명일 때 고르는 칩(별도 추가된 기사 포함) ──
export function SamePlateChips({ drivers, plate, name, phone, onPick, className = "" }) {
  const list = driversOfPlate(drivers, plate);
  if (list.length < 2) return null;
  const nm = nName(name), ph = nDigits(phone);
  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-[12px] ${className}`} data-driver-same-plate>
      <span className="font-semibold text-[#5B6B85]">같은 차량번호 기사 {list.length}명</span>
      {list.map((d) => {
        const on = nName(d.이름) === nm && nDigits(d.전화번호) === ph;
        return (
          <button key={d.id || `${d.이름}-${d.전화번호}`} type="button" onClick={() => onPick(d)}
            className={`px-2.5 py-1 rounded-xl border font-bold transition ${on ? "bg-[#1B2B4B] border-[#1B2B4B] text-white" : "bg-white border-[#C9D5EA] text-[#1B2B4B] hover:bg-[#EEF3FC] active:bg-[#EEF3FC]"}`}>
            {d.이름 || "-"} <span className={on ? "text-white/70 font-semibold" : "text-slate-500 font-semibold"}>{fmtTel(d.전화번호)}</span>
          </button>
        );
      })}
    </div>
  );
}
