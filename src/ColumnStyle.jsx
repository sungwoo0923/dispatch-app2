// ======================= src/ColumnStyle.jsx =======================
// 🎨 2026-11-03 컬럼 색 변경 — 표 머리글(컬럼명)에서 오른쪽 마우스 → "색 변경"
//  · 머리글과 그 아래 칸(내용)의 배경색 · 글씨색 · 글씨 크기 · 굵기를 따로 바꾼다
//  · 모든 표에서 동작(표마다 · 컬럼명마다 기억) — 회사 전체 공용(colStyles/{회사}) · 누가 바꿔도 모든 직원 화면에 바로 반영
//  · 표는 머리글 이름들로 알아본다(같은 화면의 같은 표면 다시 들어와도 그대로)
import React from "react";
import { createPortal } from "react-dom";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";
import { getTenant } from "./fsTenant";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const LS = "kpColStyle:v1";
const read = () => { try { return JSON.parse(localStorage.getItem(LS) || "{}") || {}; } catch { return {}; } };
let STORE = read();
const subs = new Set();
let CO = ""; // 지금 회사 — 색은 회사 전체가 같이 쓴다
const lsKey = () => `${LS}:${CO}`;
const cache = () => { try { localStorage.setItem(lsKey(), JSON.stringify(STORE)); } catch { /* 무시 */ } };
const save = () => {
  cache(); subs.forEach((f) => f());
  if (!CO) return;
  setDoc(doc(db, "colStyles", CO), { companyName: CO, styles: STORE, updatedAt: serverTimestamp(), updatedBy: auth?.currentUser?.email || "" })
    .catch((e) => { console.warn("[colStyles] 저장 실패", e?.code || e); try { window.dispatchEvent(new CustomEvent("kp-colstyle-error")); } catch { /* 무시 */ } });
};

const thText = (th) => String(th?.innerText || th?.textContent || "").replace(/[▲▼↕⇅]/g, "").replace(/\s+/g, " ").trim();
const headCells = (table) => { const tr = table?.tHead?.rows?.[table.tHead.rows.length - 1]; return tr ? [...tr.cells] : []; };
// 표 이름 — 머리글 앞쪽 이름들(선택칸 등 빈 이름 제외) + 칸 수
const tableKey = (table) => {
  if (table?.dataset?.kpTable) return table.dataset.kpTable;
  const names = headCells(table).map(thText).filter(Boolean);
  return `${names.slice(0, 5).join("|")}#${names.length}`;
};

const PALETTE = {
  bg: ["", "#FFFFFF", "#F4F6FA", "#EEF3FB", "#DCE7F8", "#E8F1EC", "#FFF7E0", "#FFF3B0", "#FBEAEA", "#2D4C82", "#1B2B4B", "#0F1A30"],
  color: ["", "#0F1A30", "#1B2B4B", "#2D4C82", "#4B6CB7", "#5B6B85", "#9AA9C3", "#1F7A4D", "#B7791F", "#C53030", "#FFFFFF"],
};
const SIZES = ["", 12, 13, 14, 15, 16, 18, 20];
const WEIGHTS = [["", "기본"], [500, "보통"], [700, "굵게"], [900, "아주 굵게"]];

function css(tid, idx, st) {
  const out = [];
  const one = (p) => [p.bg && `background:${p.bg}!important`, p.color && `color:${p.color}!important`, p.size && `font-size:${p.size}px!important`, p.weight && `font-weight:${p.weight}!important`].filter(Boolean).join(";");
  const inner = (p) => [p.color && `color:${p.color}!important`, p.size && `font-size:${p.size}px!important`, p.weight && `font-weight:${p.weight}!important`].filter(Boolean).join(";");
  const T = `table[data-kpcs="${tid}"]`;
  if (st.head && one(st.head)) {
    out.push(`${T}>thead>tr:last-child>th:nth-child(${idx}){${one(st.head)}}`);
    if (inner(st.head)) out.push(`${T}>thead>tr:last-child>th:nth-child(${idx}) *{${inner(st.head)}}`);
  }
  if (st.cell && one(st.cell)) {
    out.push(`${T}>tbody>tr>td:nth-child(${idx}){${one(st.cell)}}`);
    if (inner(st.cell)) out.push(`${T}>tbody>tr>td:nth-child(${idx}) *:not(button):not(svg):not(path){${inner(st.cell)}}`);
  }
  return out.join("\n");
}

let tidSeq = 0;
function rebuild(styleEl) {
  const rules = [];
  const tables = document.querySelectorAll("table");
  tables.forEach((t) => {
    if (!t.tHead) return;
    const map = STORE[tableKey(t)];
    if (!map) { if (t.dataset.kpcs) delete t.dataset.kpcs; return; }
    if (!t.dataset.kpcs) t.dataset.kpcs = `t${++tidSeq}`;
    headCells(t).forEach((th, i) => { const st = map[thText(th)]; if (st) rules.push(css(t.dataset.kpcs, i + 1, st)); });
  });
  const txt = rules.join("\n");
  if (styleEl.textContent !== txt) styleEl.textContent = txt;
}

// ── 색 변경 창 ──
function Swatches({ list, value, onPick, round = false }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((c) => (
        <button key={c || "none"} type="button" onClick={() => onPick(c)} title={c || "기본"}
          className={`w-7 h-7 ${round ? "rounded-full" : "rounded-lg"} border flex items-center justify-center transition ${value === c ? "ring-2 ring-[#1B2B4B] ring-offset-1 border-transparent" : "border-[#D5DDEA] hover:border-[#1B2B4B]"}`}
          style={{ background: c || "repeating-linear-gradient(45deg,#fff 0 4px,#EEF2F8 4px 8px)" }}>
          {!c && <span className="text-[9px] font-black text-[#9AA9C3]">기본</span>}
        </button>
      ))}
      <label title="직접 고르기" className="relative w-7 h-7 rounded-lg border border-dashed border-[#C9D3E3] flex items-center justify-center cursor-pointer hover:border-[#1B2B4B]">
        <span className="text-[13px] font-black text-[#5B6B85]">+</span>
        <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" value={value || "#1B2B4B"} onChange={(e) => onPick(e.target.value)} />
      </label>
    </div>
  );
}

function StyleModal({ target, onClose }) {
  const { tkey, col } = target;
  const cur = STORE[tkey]?.[col] || {};
  const [part, setPart] = React.useState("cell");
  const [st, setSt] = React.useState({ head: { ...(cur.head || {}) }, cell: { ...(cur.cell || {}) } });
  React.useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const p = st[part];
  const set = (patch) => setSt((o) => ({ ...o, [part]: { ...o[part], ...patch } }));
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v != null));
  const apply = () => {
    const head = clean(st.head), cell = clean(st.cell);
    const m = { ...(STORE[tkey] || {}) };
    if (Object.keys(head).length || Object.keys(cell).length) m[col] = { head, cell }; else delete m[col];
    STORE = { ...STORE }; if (Object.keys(m).length) STORE[tkey] = m; else delete STORE[tkey];
    save(); onClose();
  };
  const reset = () => setSt({ head: {}, cell: {} });
  const prevStyle = (q, base) => ({ background: q.bg || base.bg, color: q.color || base.color, fontSize: q.size ? `${q.size}px` : base.size, fontWeight: q.weight || base.weight });
  const lab = "text-[11.5px] font-black text-[#5B6B85] mb-1.5";

  return createPortal(
    <div className="fixed inset-0 z-[2147483100] flex items-center justify-center bg-[#060C1A]/55 backdrop-blur-[3px] p-3">
      <div className="w-[min(520px,96vw)] max-h-[94vh] flex flex-col rounded-[22px] bg-[#F4F6FA] shadow-[0_30px_80px_rgba(6,12,26,0.55)] overflow-hidden ring-1 ring-white/10">
        <div className="relative overflow-hidden px-5 pt-4 pb-4 text-white" style={{ background: "radial-gradient(600px 220px at 85% -30%, rgba(110,149,232,.32), transparent 60%), linear-gradient(120deg,#060C1A 0%,#0F1A30 45%,#1B2B4B 100%)" }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px" }} />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#2D4C82,#0B1428)", border: "1px solid rgba(207,224,255,.3)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.9 1.5-1.6 0-.9-.7-1.4-.7-2.3 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z" /><circle cx="7.5" cy="11" r="1.2" fill="#CFE0FF" /><circle cx="10.5" cy="7" r="1.2" fill="#CFE0FF" /><circle cx="15" cy="7.5" r="1.2" fill="#CFE0FF" /></svg>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>COLUMN STYLE</div>
              <div className="text-[18px] font-black tracking-tight truncate">“{col}” 칸 색 변경</div>
            </div>
            <button onClick={onClose} className="ml-auto h-8 px-3 rounded-xl bg-white/[0.08] border border-white/15 hover:bg-white/[0.16] text-[12px] font-black">닫기</button>
          </div>
          {/* 미리보기 */}
          <div className="relative mt-3.5 rounded-xl overflow-hidden border border-white/15 w-[180px]">
            <div className="h-9 flex items-center justify-center bg-[#1B2B4B] text-white text-[14px] font-bold" style={prevStyle(st.head, {})}>{col}</div>
            {["18", "7", "120"].map((v, i) => (
              <div key={i} className="h-8 flex items-center justify-center bg-white text-[#0F1A30] text-[13px] tabular-nums border-t border-[#E9EDF4]" style={prevStyle(st.cell, {})}>{v}</div>
            ))}
          </div>
          <div className="absolute right-5 bottom-4 text-[10.5px] font-bold text-white/45">미리보기</div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="inline-flex p-1 rounded-xl bg-[#EEF2F8] border border-[#E3E8F0]">
            {[["cell", "칸 (내용)"], ["head", "머리글 (컬럼명)"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPart(k)} className={`h-8 px-3.5 rounded-lg text-[12.5px] font-black transition ${part === k ? "bg-[#0F1A30] text-white shadow-[0_4px_12px_rgba(15,26,48,.25)]" : "text-[#5B6B85] hover:text-[#0F1A30]"}`}>{l}</button>
            ))}
          </div>
          <div className="rounded-2xl bg-white border border-[#E3E8F0] px-4 py-3.5 space-y-3.5">
            <div><div className={lab}>배경색</div><Swatches list={PALETTE.bg} value={p.bg || ""} onPick={(c) => set({ bg: c })} /></div>
            <div><div className={lab}>글씨색</div><Swatches list={PALETTE.color} value={p.color || ""} onPick={(c) => set({ color: c })} round /></div>
            <div>
              <div className={lab}>글씨 크기</div>
              <div className="inline-flex flex-wrap p-1 rounded-xl bg-[#EEF2F8] border border-[#E3E8F0]">
                {SIZES.map((z) => (
                  <button key={z || "d"} type="button" onClick={() => set({ size: z })} className={`h-8 min-w-[38px] px-2 rounded-lg text-[12px] font-black tabular-nums transition ${String(p.size || "") === String(z) ? "bg-[#0F1A30] text-white" : "text-[#5B6B85] hover:text-[#0F1A30]"}`} style={z ? { fontFamily: MONO } : undefined}>{z || "기본"}</button>
                ))}
              </div>
            </div>
            <div>
              <div className={lab}>굵기</div>
              <div className="inline-flex p-1 rounded-xl bg-[#EEF2F8] border border-[#E3E8F0]">
                {WEIGHTS.map(([w, l]) => (
                  <button key={l} type="button" onClick={() => set({ weight: w })} className={`h-8 px-3 rounded-lg text-[12.5px] transition ${String(p.weight || "") === String(w) ? "bg-[#0F1A30] text-white" : "text-[#5B6B85] hover:text-[#0F1A30]"}`} style={{ fontWeight: w || 700 }}>{l}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="text-[11.5px] font-semibold text-[#9AA9C3]">이 표의 “{col}” 칸에 적용되고, 회사 직원 모두의 화면에 바로 반영됩니다.</div>
        </div>

        <div className="px-5 py-3.5 border-t border-[#E3E8F0] bg-white flex items-center gap-2">
          <button type="button" onClick={reset} className="h-10 px-4 rounded-xl border border-[#D5DDEA] text-[13px] font-black text-[#5B6B85] hover:text-[#0F1A30] hover:border-[#1B2B4B]">기본으로</button>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-[#D5DDEA] text-[13px] font-black text-[#5B6B85] hover:text-[#0F1A30]">취소</button>
            <button type="button" onClick={apply} className="h-10 px-6 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black shadow-[0_6px_16px_rgba(15,26,48,.28)] hover:bg-[#1B2B4B]">적용</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// 앱에 한 번만 붙인다 — 머리글 오른쪽 클릭 메뉴 + 저장된 색을 표에 입히기
export default function ColumnStyleHost({ company = "" }) {
  const co = String(getTenant() || company || "").trim();
  // 회사 공용 색 — 실시간으로 받아 온다(먼저 이 PC에 기억한 걸로 바로 그리고, 서버 값이 오면 바꾼다)
  React.useEffect(() => {
    CO = co;
    try { STORE = JSON.parse(localStorage.getItem(lsKey()) || "null") || (co ? {} : read()); } catch { STORE = {}; }
    subs.forEach((f) => f());
    if (!co) return undefined;
    let un = null;
    try {
      un = onSnapshot(doc(db, "colStyles", co), (snap) => {
        const d = snap.exists() ? snap.data() || {} : {};
        STORE = d.styles && typeof d.styles === "object" ? d.styles : {};
        cache(); subs.forEach((f) => f());
      }, (e) => console.warn("[colStyles] 읽기 실패", e?.code || e));
    } catch { /* 무시 */ }
    return () => { try { un?.(); } catch { /* 무시 */ } };
  }, [co]);
  const [err, setErr] = React.useState(false);
  React.useEffect(() => { const h = () => { setErr(true); setTimeout(() => setErr(false), 4000); }; window.addEventListener("kp-colstyle-error", h); return () => window.removeEventListener("kp-colstyle-error", h); }, []);
  const [menu, setMenu] = React.useState(null);
  const [target, setTarget] = React.useState(null);
  const styleRef = React.useRef(null);

  React.useEffect(() => {
    const el = document.createElement("style"); el.id = "kp-col-style"; document.head.appendChild(el); styleRef.current = el;
    let t = null;
    const run = () => { clearTimeout(t); t = setTimeout(() => rebuild(el), 250); };
    rebuild(el);
    const mo = new MutationObserver((list) => { for (const m of list) { if (m.target?.closest?.("thead") || [...m.addedNodes].some((n) => n.nodeType === 1 && (n.tagName === "TABLE" || n.querySelector?.("table")))) { run(); return; } } });
    mo.observe(document.body, { childList: true, subtree: true });
    const sub = () => rebuild(el); subs.add(sub);
    const onStore = () => {};
    window.addEventListener("storage", onStore);
    return () => { mo.disconnect(); subs.delete(sub); window.removeEventListener("storage", onStore); clearTimeout(t); el.remove(); };
  }, []);

  React.useEffect(() => {
    const onCtx = (e) => {
      const th = e.target?.closest?.("thead th");
      if (!th || e.defaultPrevented) return;
      const table = th.closest("table"); const col = thText(th);
      if (!table || !col) return;
      e.preventDefault();
      const z = parseFloat(document.getElementById("root")?.style.zoom) || 1;
      setMenu({ x: e.clientX / z, y: e.clientY / z, tkey: tableKey(table), col });
    };
    const close = () => setMenu(null);
    document.addEventListener("contextmenu", onCtx);
    window.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("contextmenu", onCtx); window.removeEventListener("scroll", close, true); };
  }, []);

  const has = menu && STORE[menu.tkey]?.[menu.col];
  return (
    <>
      {menu && createPortal(
        <div className="fixed inset-0 z-[2147483000]" onMouseDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}>
          <div className="absolute w-[200px] rounded-xl bg-white border border-[#DCE3EE] shadow-[0_16px_36px_rgba(15,26,48,.22)] py-1.5 overflow-hidden"
            style={{ left: Math.min(menu.x, window.innerWidth - 210), top: Math.min(menu.y, window.innerHeight - 120) }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="px-3 pt-0.5 pb-1.5 border-b border-[#EEF2F8] mb-1">
              <div className="text-[9.5px] font-extrabold tracking-[0.22em] text-[#9AA9C3]" style={{ fontFamily: MONO }}>COLUMN</div>
              <div className="text-[13px] font-black text-[#0F1A30] truncate">{menu.col}</div>
            </div>
            <button type="button" onClick={() => { setTarget({ tkey: menu.tkey, col: menu.col }); setMenu(null); }} className="w-full h-9 px-3 flex items-center gap-2 text-left text-[13px] font-bold text-[#0F1A30] hover:bg-[#EEF2F8]">
              <span className="w-5 h-5 rounded-md" style={{ background: "conic-gradient(#0F1A30 0 25%,#4B6CB7 0 50%,#DCE7F8 0 75%,#FFF3B0 0)" }} />색 변경
            </button>
            {has && (
              <button type="button" onClick={() => { const m = { ...(STORE[menu.tkey] || {}) }; delete m[menu.col]; STORE = { ...STORE }; if (Object.keys(m).length) STORE[menu.tkey] = m; else delete STORE[menu.tkey]; save(); setMenu(null); }} className="w-full h-9 px-3 flex items-center gap-2 text-left text-[13px] font-bold text-[#5B6B85] hover:bg-[#EEF2F8]">
                <span className="w-5 h-5 rounded-md border border-dashed border-[#C9D3E3]" />색 원래대로
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
      {target && <StyleModal target={target} onClose={() => setTarget(null)} />}
      {err && createPortal(<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[2147483200] px-4 py-2.5 rounded-xl bg-[#0F1A30] text-white text-[12.5px] font-bold shadow-[0_12px_30px_rgba(6,12,26,.4)]">색 설정을 회사 전체에 저장하지 못했습니다 · 이 PC에만 적용됩니다</div>, document.body)}
    </>
  );
}
