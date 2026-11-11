// ======================= src/companyOptionPicker.jsx =======================
// 🧾 2026-11-02 지급방식 · 배차방식 · 상/하차방법 공용 선택기 — 차량종류 선택기(vehicleTypes.js)와 같은 모양·사용법
//  · 목록 = 회사 목록(companySettings/{회사}.dropdownOptions.{key}) — 편집모드 [⚙ 옵션 관리]와 같은 자리
//    (회사가 바꾼 적 없으면 기본 목록). 여기서 [＋ 추가]하면 편집모드 목록·PC·모바일 모든 화면에 바로 보인다.
//  · 목록에 없는 예전 값도 그대로 보이고 저장된다("직접 입력값")
//  · 표 칸 수백 개에 써도 가볍게: 닫혀 있을 때는 버튼 하나만 그린다(목록·구독은 열었을 때만)
//  · 휴대폰(좁은 화면)에서는 아래에서 올라오는 시트(한 줄 48px)로 연다
//  · onChange(값) — 값은 글자. 빈 글자(또는 noneValue) = 선택 안 함 / 필터는 noneValue="전체"
import React from "react";
import { createPortal } from "react-dom";
import { addCompanyDropdownOption, removeCompanyDropdownOption, useCompanyOptionList } from "./companyDropdownOptions";
import { uiOptionLabel, useUiConfigVersion } from "./uiConfig"; // ⭐ 2026-11-07 화면 편집 — 보이는 이름만 바꾸기(저장값 그대로)
import { kpConfirm } from "./kpDialog";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const FONT = "'Pretendard','Noto Sans KR',sans-serif";
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
export const OPTION_META = {
  지급방식: { title: "지급방식", tag: "PAYMENT", eg: "예: 카드결제" },
  배차방식: { title: "배차방식", tag: "DISPATCH", eg: "예: 협력사" },
  상하차방법: { title: "상/하차방법", tag: "LOADING", eg: "예: 호이스트" },
  화물타입: { title: "화물타입", tag: "CARGO", eg: "예: 마대" },
  톤수타입: { title: "톤수타입", tag: "UNIT", eg: "예: 대" },
  아웃콜방식: { title: "OUT 방식", tag: "OUT CALL", eg: "예: 원콜" }, // 💳 2026-11-11 외부 콜을 잡은 곳
};

const Chev = ({ open }) => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ flexShrink: 0, transition: "transform .15s", transform: open ? "rotate(180deg)" : "none", opacity: 0.8 }}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const isNarrow = () => { try { return window.innerWidth < 640; } catch { return false; } };
const isTouch = () => { try { return window.matchMedia("(pointer: coarse)").matches; } catch { return false; } };

// ─────────────── 버튼(닫혀 있을 때는 이것만) ───────────────
export const CompanyOptionPicker = React.forwardRef(function CompanyOptionPicker({
  optKey, value, onChange, className = "", style, disabled = false,
  placeholder = "선택", noneLabel, noneValue = "", allowNone = true, allowAdd = true,
  title, role, userCompany, compact = false, align = "left", id, buttonProps = {}, labelOf: labelOf0,
  openSignal = 0, // ⭐ 2026-11-11 숫자가 바뀌면 목록을 연다(배차방식 IN/OUT 먼저 고르기 — src/CallPay.jsx DispatchWayPicker)
}, ref) {
  useUiConfigVersion();
  const labelOf = labelOf0 || ((v) => uiOptionLabel(optKey, v));
  const [open, setOpen] = React.useState(false);
  const btn = React.useRef(null);
  React.useEffect(() => { if (openSignal && !disabled) setOpen(true); }, [openSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useImperativeHandle(ref, () => ({
    focus: () => btn.current?.focus(),
    scrollIntoView: (o) => btn.current?.scrollIntoView(o),
    get value() { return value; },
  }), [value]);
  const raw = value === "선택없음" ? "" : clean(value);
  const isNone = !raw || raw === noneValue;
  const meta = OPTION_META[optKey] || { title: optKey, tag: "OPTION" };
  const ttl = title || meta.title;
  const shown = isNone ? (noneValue && noneValue !== "" ? (noneLabel || placeholder) : placeholder) : (labelOf ? labelOf(raw) : raw);
  const close = (refocus = true) => { setOpen(false); if (refocus) setTimeout(() => btn.current?.focus(), 0); };
  return (
    <>
      <button
        {...buttonProps}
        id={id} ref={btn} type="button" disabled={disabled}
        data-opt-picker={optKey} data-value={raw}
        aria-haspopup="listbox" aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!disabled) setOpen((o) => !o); }}
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); setOpen(true); } }}
        className={`${className} text-left disabled:cursor-not-allowed`}
        style={{ display: "flex", alignItems: "center", justifyContent: compact ? "center" : "space-between", gap: compact ? 3 : 6, minWidth: 0, ...(style || {}) }}
        title={isNone ? `${ttl} 선택` : `${ttl}: ${raw}`}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, opacity: isNone && !(noneValue && noneValue !== "") ? 0.55 : 1 }}>{shown}</span>
        {compact ? null : <Chev open={open} />}
      </button>
      {open ? (
        <OptionMenu
          anchor={btn} optKey={optKey} cur={isNone ? "" : raw} meta={meta} ttl={ttl}
          noneLabel={noneLabel || placeholder} noneValue={noneValue} allowNone={allowNone} allowAdd={allowAdd}
          role={role} userCompany={userCompany} align={align} labelOf={labelOf}
          onPick={(v) => { close(); const next = v === "" ? noneValue : v; if (next !== (isNone ? noneValue : raw)) onChange?.(next); }}
          onClose={close}
        />
      ) : null}
    </>
  );
});

// ⭐ 2026-11-06 목록 줄 오른쪽 🗑 — 누르면 그 항목 삭제(확인 창) · 줄 고르기와 겹치지 않게 클릭을 막는다
export function OptTrash({ onClick, title = "삭제", disabled = false, size = 28 }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} data-opt-del="1"
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); }}
      style={{ flexShrink: 0, width: size, height: size, borderRadius: 8, border: "none", background: "transparent", color: "#9AA9C3", cursor: "pointer", display: "grid", placeItems: "center", opacity: disabled ? 0.5 : 1 }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#FFF1EE"; e.currentTarget.style.color = "#B42318"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9AA9C3"; }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
    </button>
  );
}

// ─────────────── 떠 있는 목록(열었을 때만 그린다) ───────────────
function OptionMenu({ anchor, optKey, cur, meta, ttl, noneLabel, allowNone, allowAdd, role, userCompany, align, labelOf, onPick, onClose }) {
  const co = useCompanyOptionList(optKey, role, userCompany);
  const sheet = React.useMemo(() => isNarrow(), []);
  const touch = React.useMemo(() => isTouch(), []);
  const [pos, setPos] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [act, setAct] = React.useState(0);
  const [adding, setAdding] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const menu = React.useRef(null);
  const searchRef = React.useRef(null);

  const list = co.list;
  const nq = q.replace(/\s/g, "").toLowerCase();
  const filtered = nq ? list.filter((v) => v.replace(/\s/g, "").toLowerCase().includes(nq)) : list;
  const opts = [
    ...(allowNone && !nq ? [{ v: "", none: true }] : []),
    ...(cur && !list.includes(cur) && !nq ? [{ v: cur, legacy: true }] : []),
    ...filtered.map((v) => ({ v })),
  ];
  const exact = nq && list.some((v) => v.replace(/\s/g, "").toLowerCase() === nq);
  const ROW = sheet || touch ? 48 : 38;

  const place = React.useCallback(() => {
    const el = anchor.current; if (!el) return;
    if (sheet) { setPos({ sheet: true }); return; }
    const r = el.getBoundingClientRect();
    const w = Math.max(r.width, 260);
    const below = window.innerHeight - r.bottom - 14;
    const above = r.top - 14;
    const up = below < 300 && above > below;
    let left = align === "right" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos(up ? { left, bottom: window.innerHeight - r.top + 6, width: w, maxH: above } : { left, top: r.bottom + 6, width: w, maxH: below });
  }, [anchor, align, sheet]);

  React.useLayoutEffect(() => {
    place();
    const i = Math.max(0, opts.findIndex((o) => o.v === cur));
    setAct(i);
    const t = setTimeout(() => ((touch || sheet) ? menu.current : searchRef.current)?.focus?.(), 20);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { if (act >= opts.length) setAct(Math.max(0, opts.length - 1)); }, [opts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const down = (e) => { if (anchor.current?.contains(e.target) || menu.current?.contains(e.target)) return; onClose(false); };
    const re = (e) => { if (menu.current?.contains(e.target)) return; if (!sheet) onClose(false); };
    const rs = () => { if (!sheet) onClose(false); };
    document.addEventListener("mousedown", down, true);
    document.addEventListener("touchstart", down, true);
    window.addEventListener("scroll", re, true);
    window.addEventListener("resize", rs);
    return () => { document.removeEventListener("mousedown", down, true); document.removeEventListener("touchstart", down, true); window.removeEventListener("scroll", re, true); window.removeEventListener("resize", rs); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!menu.current) return;
    menu.current.querySelector(`[data-opt-idx="${act}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [act, pos]);

  const doAdd = async (name) => {
    const v = clean(name);
    if (!v) { setErr("이름을 입력해 주세요"); return; }
    if (list.includes(v)) { onPick(v); return; }
    setBusy(true); setErr("");
    try { await addCompanyDropdownOption(optKey, v, co.company); onPick(v); }
    catch (e) { setErr(String(e?.message || "").includes("permission") ? "추가 권한이 없습니다" : (e?.message || "추가하지 못했습니다")); }
    finally { setBusy(false); }
  };
  // ⭐ 2026-11-06 🗑 항목 삭제(회사 공용) — 확인 후 회사 목록에서 뺀다 · 이미 저장된 오더 값은 그대로
  const doRemove = async (v) => {
    if (!(await kpConfirm(`'${v}'을(를) ${ttl} 목록에서 삭제할까요?\n회사의 모든 화면(PC·모바일) 목록에서 빠집니다. 이미 저장된 오더 값은 그대로예요.`))) return;
    setBusy(true); setErr("");
    try { await removeCompanyDropdownOption(optKey, v, co.company); }
    catch (e) { setErr(String(e?.message || "").includes("permission") ? "삭제 권한이 없습니다" : (e?.message || "삭제하지 못했습니다")); setAdding(true); }
    finally { setBusy(false); }
  };
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "Tab") { onClose(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setAct((i) => Math.min(opts.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setAct((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (opts[act]) onPick(opts[act].v);
      else if (nq && allowAdd) doAdd(q);
    }
  };
  if (!pos) return null;

  const row = (o, i) => {
    const sel = o.none ? !cur : o.v === cur;
    return (
      <div key={`${o.v}_${i}`} role="option" aria-selected={sel} data-opt-idx={i}
        onMouseEnter={() => setAct(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(o.v)}
        style={{ display: "flex", alignItems: "center", gap: 10, height: ROW, margin: "0 6px", padding: "0 10px", borderRadius: 10, cursor: "pointer", userSelect: "none", background: i === act ? "#EEF3FC" : "transparent" }}>
        <span style={{ width: 15, height: 15, borderRadius: 999, flexShrink: 0, display: "grid", placeItems: "center", border: `2px solid ${sel ? "#1B2B4B" : "#C9D5EA"}`, background: sel ? "#1B2B4B" : "#fff" }}>
          {sel ? <span style={{ width: 5, height: 5, borderRadius: 999, background: "#fff" }} /> : null}
        </span>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: sheet ? 15.5 : 14.5, fontWeight: o.none ? 700 : 800, color: o.none ? "#8E9BB2" : "#0F1A30" }}>
          {o.none ? noneLabel : (labelOf ? labelOf(o.v) : o.v)}
        </span>
        {o.legacy ? <span style={{ fontSize: 12, fontWeight: 800, color: "#B54708", whiteSpace: "nowrap" }}>직접 입력값</span> : null}
        {allowAdd && !o.none && !o.legacy ? <OptTrash title={`${o.v} 삭제`} onClick={() => doRemove(o.v)} disabled={busy} /> : null}
      </div>
    );
  };

  const boxStyle = pos.sheet
    ? { position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: "78vh", borderRadius: "20px 20px 0 0", paddingBottom: "env(safe-area-inset-bottom)" }
    : { position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, borderRadius: 16, maxHeight: Math.max(200, Math.min(400, pos.maxH || 400)) };

  const body = (
    <div ref={menu} role="listbox" data-opt-menu={optKey} tabIndex={-1}
      onKeyDownCapture={(e) => { if (e.target === menu.current) onKey(e); }}
      onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
      style={{ ...boxStyle, outline: "none", zIndex: 2147483000, background: "#fff", border: "1px solid #E3E8F0", boxShadow: "0 18px 44px rgba(15,26,48,0.22)", overflow: "hidden", fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      {pos.sheet ? <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, background: "#F7F9FC" }}><span style={{ width: 40, height: 4, borderRadius: 99, background: "#C9D5EA" }} /></div> : null}
      <div style={{ padding: pos.sheet ? "8px 14px 10px" : "10px 12px 8px", background: "#F7F9FC", borderBottom: "1px solid #EEF2F7" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}>
            <span style={{ fontSize: pos.sheet ? 16 : 14, fontWeight: 900, color: "#0F1A30" }}>{ttl}</span>
            <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", color: "#4B6CB7" }}>{meta.tag}</span>
          </span>
          {pos.sheet
            ? <button type="button" onClick={() => onClose(false)} style={{ height: 32, padding: "0 12px", borderRadius: 9, border: "1px solid #DCE3EE", background: "#fff", color: "#3A4A66", fontSize: 13.5, fontWeight: 900 }}>닫기</button>
            : <span style={{ fontSize: 12, fontWeight: 700, color: "#8E9BB2", whiteSpace: "nowrap" }}>↑↓ · Enter</span>}
        </div>
        <input ref={searchRef} value={q} placeholder="찾기" autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setAct(0); }} onKeyDown={onKey}
          style={{ width: "100%", height: pos.sheet ? 42 : 34, borderRadius: 10, border: "1px solid #DCE3EE", padding: "0 10px", fontSize: pos.sheet ? 16 : 14.5, fontWeight: 700, color: "#0F1A30", outline: "none", background: "#fff", boxSizing: "border-box" }} />
      </div>
      <div style={{ overflowY: "auto", padding: "4px 0", flex: 1, minHeight: 0 }}>
        {opts.length ? opts.map(row) : <div style={{ padding: "14px 16px", fontSize: 13.5, fontWeight: 700, color: "#9AA9C3" }}>찾는 {ttl}이(가) 없습니다</div>}
        {nq && !exact && allowAdd ? (
          <div onMouseDown={(e) => e.preventDefault()} onClick={() => doAdd(q)}
            style={{ margin: "4px 6px 2px", padding: "0 10px", height: ROW, borderRadius: 10, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", background: "#FFF8E6", color: "#7A5300", fontSize: 14, fontWeight: 900 }}>
            ＋<span>“{clean(q)}” {ttl}(으)로 추가하고 선택</span>
          </div>
        ) : null}
      </div>
      {allowAdd ? (
        <div style={{ borderTop: "1px solid #EEF2F7", padding: 8, background: "#FBFCFE" }}>
          {adding ? (
            <div>
              <div style={{ display: "flex", gap: 6 }}>
                <input value={newName} autoFocus placeholder={`새 ${ttl} (${meta.eg || "이름"})`} maxLength={30} autoComplete="off"
                  onChange={(e) => { setNewName(e.target.value); setErr(""); }}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); doAdd(newName); } if (e.key === "Escape") { e.preventDefault(); setAdding(false); setTimeout(() => searchRef.current?.focus(), 0); } }}
                  style={{ flex: 1, minWidth: 0, height: pos.sheet ? 44 : 36, borderRadius: 10, border: "1.5px solid #1B2B4B", padding: "0 10px", fontSize: pos.sheet ? 16 : 14.5, fontWeight: 800, color: "#0F1A30", outline: "none", boxSizing: "border-box" }} />
                <button type="button" disabled={busy} data-opt-addsubmit="1" onClick={() => doAdd(newName)}
                  style={{ height: pos.sheet ? 44 : 36, padding: "0 14px", borderRadius: 10, border: "none", background: "#1B2B4B", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "추가 중" : "추가"}</button>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: err ? "#C0352B" : "#8E9BB2", marginTop: 5, paddingLeft: 2 }}>{err || `추가하면 회사의 모든 화면(PC·모바일)과 편집모드 ${ttl} 목록에 나옵니다`}</div>
            </div>
          ) : (
            <button type="button" data-opt-add="1" onClick={() => { setAdding(true); setNewName(clean(q)); setErr(""); }}
              style={{ width: "100%", height: pos.sheet ? 44 : 36, borderRadius: 10, border: "1.5px dashed #9FB2D3", background: "#fff", color: "#1B2B4B", fontSize: 14, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span style={{ fontSize: 15, lineHeight: 1 }}>＋</span>{ttl} 추가
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
  return createPortal(
    pos.sheet ? (
      <div data-opt-sheet="1" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(false); }}
        style={{ position: "fixed", inset: 0, zIndex: 2147482999, background: "rgba(8,14,30,.45)" }}>{body}</div>
    ) : body,
    document.body,
  );
}

export default CompanyOptionPicker;
