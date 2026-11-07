// ======================= src/UiEditorPanel.jsx =======================
// ⭐ 2026-11-07 화면 편집 모드 — 오른쪽 편집 창(최고관리자 전용 · 필요할 때만 불러온다)
//  탭: 문구 · 모양 · 보이기 · 이미지 · 메뉴 · 목록 · 테마
//  · 문구 탭의 글자 바꾸기는 예전처럼 바로 저장(textOverrides). 나머지는 "저장 안 한 변경"으로 화면에 바로 보이고 [저장]을 눌러야 모두에게 적용
//  · 되돌리기/다시 하기 · 변경 목록(종류별 · 하나씩 되돌리기) · 버전 기록(최근 20개 되살리기) · 백업(JSON) · 미리보기(다른 역할·기기) · 모두 끄기
import React from "react";
import {
  useUiConfigVersion, getPublished, getPublishedMeta, getEffective, editDraft, beginDraft, discardDraft, publishDraft, hasDraftChanges,
  undo, redo, canUndo, canRedo, draftConflict, elementLabel, resolveTarget, newId, viewerEmail, currentScreenKey, screenLabel,
  ROLE_GROUPS, EL_PRESETS, TONES, OPTION_KEYS, REQUIRED_FIELDS, DEFAULTABLE, THEME_PRESETS, seenMenuKeys, setPreviewAs, getPreviewAs,
  listHistory, restoreToDraft, exportConfig, importToDraft, uploadImage, IMG_TYPES, countConfig, isDemo, cleanLink,
} from "./uiConfig";
import { setUiBypass } from "./uiBypass";
import {
  getDocsSnapshot, saveOverride, saveStyle, cleanStyle, sameStyle, setPreview, clearPreview, currentRouteKey, routeDocId, routeLabel,
  isEligibleText, originalTextOf, originalAttrOf, ATTRS, FONTS, WEIGHTS, exportOverrides, importOverrides,
} from "./textOverrides";
import { DEFAULT_DROPDOWN_OPTIONS } from "./companyDropdownOptions";
import { VT_DEFAULTS } from "./vehicleTypes";
import { BANK_NAMES } from "./bankUtil";
import { kpConfirm } from "./kpDialog";

const C = { navy: "#0F1A30", navy2: "#1B2B4B", blue: "#2D4C82", line: "#DCE3EE", soft: "#F5F7FB", mute: "#8A97AD", red: "#B42318" };
const TABS = [["text", "문구"], ["style", "모양"], ["show", "보이기"], ["img", "이미지"], ["menu", "메뉴"], ["list", "목록"], ["theme", "테마"]];
const EL_TABS = new Set(["text", "style", "show", "img"]);
const inp = "h-9 px-2.5 rounded-lg border border-[#DCE3EE] text-[12.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82] bg-white min-w-0";
const chip = (on) => `h-8 px-2.5 rounded-lg border text-[12px] font-bold whitespace-nowrap ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`;
const btn = "h-8 px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[12px] font-bold text-[#1B2B4B] disabled:opacity-40 whitespace-nowrap";
const tgKey = (tg) => JSON.stringify({ p: tg.p, t: tg.t, up: tg.up, i: tg.i });
const fmtAt = (ms) => { if (!ms) return ""; const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const OPT_BASE = { ...DEFAULT_DROPDOWN_OPTIONS, 차량종류: VT_DEFAULTS, 은행: BANK_NAMES };
const OPT_TITLE = { 상하차방법: "상/하차방법", 지급방식: "지급방식", 배차방식: "배차방식", 화물타입: "화물타입", 톤수타입: "톤수 단위", 차량종류: "차량종류", 은행: "은행" };

function findRule(cfg, tg) { const k = tgKey(tg); for (const [id, r] of Object.entries(cfg.els || {})) if (tgKey(r.tg) === k) return [id, r]; return [null, null]; }
function updateRule(tg, fn) {
  return editDraft((d) => {
    let [id] = findRule(d, tg);
    if (!id) { id = newId(); d.els[id] = { tg, sc: { d: "all" } }; }
    fn(d.els[id]); d.els[id].at = Date.now(); d.els[id].by = viewerEmail();
  });
}

// ───────────────────────── 문구(예전 편집 창 내용) ─────────────────────────
function directTexts(el) { const out = []; for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) out.push(n); return out; }
export function textItemsOf(el) {
  const items = []; const seen = new Set();
  const take = (e) => { for (const n of directTexts(e)) { const o = originalTextOf(n).trim(); if (!isEligibleText(o) || seen.has("t" + o)) continue; seen.add("t" + o); items.push({ kind: "text", orig: o }); } };
  take(el);
  if (!items.length) { const w = document.createTreeWalker(el, 4); let n; let k = 0; const found = []; while ((n = w.nextNode()) && k++ < 40) if (n.nodeValue.trim() && !n.parentElement.closest("[data-kp-ublk]")) found.push(n); if (found.length && found.length <= 3) found.forEach((t) => take(t.parentElement)); }
  let a = el;
  for (let i = 0; a && i < 3 && a !== document.body; i++, a = a.parentElement) {
    for (const name of ATTRS) {
      if (!a.hasAttribute(name)) continue;
      const o = (originalAttrOf(a, name) || "").trim();
      if (!o || o.length > 300 || seen.has(name + o)) continue;
      seen.add(name + o); items.push({ kind: name, orig: o });
    }
  }
  return items;
}
const KIND_LABEL = { text: "글자", placeholder: "입력칸 안내문구", title: "툴팁" };
function lookup(docs, kind, orig) {
  const field = kind === "text" ? "t" : "a"; const key = kind === "text" ? orig : `${kind}::${orig}`; const rid = routeDocId(currentRouteKey());
  if (docs[rid]?.[field]?.[key] !== undefined) return { scope: "route", value: docs[rid][field][key] };
  if (docs.global?.[field]?.[key] !== undefined) return { scope: "global", value: docs.global[field][key] };
  return null;
}
function lookupStyle(docs, orig) { const rid = routeDocId(currentRouteKey()); if (docs[rid]?.s?.[orig]) return { scope: "route", style: docs[rid].s[orig] }; if (docs.global?.s?.[orig]) return { scope: "global", style: docs.global.s[orig] }; return null; }

function TextItemsEditor({ items, say }) {
  const docs = getDocsSnapshot();
  const [scope, setScope] = React.useState(() => items.map((it) => lookup(docs, it.kind, it.orig)).find(Boolean)?.scope || "global");
  const [vals, setVals] = React.useState(() => items.map((it) => lookup(docs, it.kind, it.orig)?.value ?? it.orig));
  const [styles, setStyles] = React.useState(() => items.map((it) => (it.kind === "text" ? { ...(lookupStyle(docs, it.orig)?.style || {}) } : null)));
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { items.forEach((it, i) => { if (it.kind === "text") setPreview(it.orig, { text: vals[i] ?? "", style: styles[i] }); }); }, [items, vals, styles]);
  React.useEffect(() => () => clearPreview(), []);
  const routeId = routeDocId(currentRouteKey());
  const docIdFor = (s) => (s === "route" ? routeId : "global");
  const otherOf = (s) => (s === "route" ? "global" : "route");
  const save = async () => {
    setBusy(true);
    try {
      let n = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i]; const v = (vals[i] ?? "").trim(); const ex = lookup(getDocsSnapshot(), it.kind, it.orig);
        if (!v || v === it.orig) { if (ex) { await saveOverride({ docId: docIdFor(ex.scope), kind: it.kind, orig: it.orig, value: null }); n++; } continue; }
        if (ex && ex.scope === scope && ex.value === v) continue;
        await saveOverride({ docId: docIdFor(scope), kind: it.kind, orig: it.orig, value: v });
        if (ex && ex.scope !== scope) await saveOverride({ docId: docIdFor(otherOf(scope)), kind: it.kind, orig: it.orig, value: null });
        n++;
      }
      for (let i = 0; i < items.length; i++) {
        const it = items[i]; if (it.kind !== "text") continue;
        const want = cleanStyle(styles[i]); const ex = lookupStyle(getDocsSnapshot(), it.orig);
        if (!want) { if (ex) { await saveStyle({ docId: docIdFor(ex.scope), orig: it.orig, style: null }); n++; } continue; }
        if (ex && ex.scope === scope && sameStyle(ex.style, want)) continue;
        await saveStyle({ docId: docIdFor(scope), orig: it.orig, style: want });
        if (ex && ex.scope !== scope) await saveStyle({ docId: docIdFor(otherOf(scope)), orig: it.orig, style: null });
        n++;
      }
      say(n ? "문구를 저장했어요" : "바뀐 문구가 없어요");
    } catch (e) { say("저장하지 못했어요: " + (e?.message || e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && e.target.tagName === "INPUT") { e.preventDefault(); save(); } }}>
      {items.map((it, i) => (
        <div key={it.kind + it.orig} className="space-y-1">
          <div className="text-[11px] font-extrabold text-[#2D4C82]">{KIND_LABEL[it.kind]}</div>
          <div className="text-[12px] text-[#5B6B86] break-all"><span className="font-bold text-[#8A97AD] mr-1">원래</span>{it.orig}</div>
          {it.orig.length > 40
            ? <textarea value={vals[i]} rows={3} onChange={(e) => setVals((p) => p.map((x, j) => (j === i ? e.target.value : x)))} className="w-full px-3 py-2 rounded-xl border border-[#DCE3EE] text-[13.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]" data-kp="text-input" />
            : <input value={vals[i]} onChange={(e) => setVals((p) => p.map((x, j) => (j === i ? e.target.value : x)))} className="w-full h-10 px-3 rounded-xl border border-[#DCE3EE] text-[13.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]" data-kp="text-input" />}
          {it.kind === "text" && <TextStyleBar value={styles[i]} onChange={(st) => setStyles((p) => p.map((x, j) => (j === i ? st : x)))} />}
        </div>
      ))}
      <div className="flex gap-1.5">
        {[["route", "이 주소만"], ["global", "프로그램 전체"]].map(([k, l]) => <button key={k} type="button" onClick={() => setScope(k)} className={`flex-1 ${chip(scope === k)}`}>{l}</button>)}
      </div>
      <div className="text-[11px] text-[#8A97AD] leading-snug">{scope === "route" ? `${routeLabel(routeId)}에서만 바뀌어요` : "같은 글자가 나오는 모든 화면에서 바뀌어요"} · 표 안 데이터는 그대로예요</div>
      <button type="button" disabled={busy} onClick={save} className="w-full h-10 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-black disabled:opacity-60" data-kp="text-save">{busy ? "저장 중…" : "문구 저장(바로 적용)"}</button>
    </div>
  );
}
const PALETTE = [["#0F1A30", "남색"], ["#2563EB", "파랑"], ["#DC2626", "빨강"], ["#16A34A", "초록"], ["#EA580C", "주황"], ["#6B7280", "회색"], ["#000000", "검정"], ["#FFFFFF", "흰색"]];
const HILITE = [["#FFF3B0", "노랑"], ["#DBEAFE", "하늘"], ["#DCFCE7", "연두"], ["#FFE4E6", "분홍"], ["#FFEDD5", "살구"], ["#E5E7EB", "회색"], ["#FFFFFF", "흰색"], ["#0F1A30", "남색"]];
function Swatches({ label, value, list, onPick, def = "#0F1A30", testid }) {
  const sw = (on) => `h-6 w-6 rounded-md border shrink-0 ${on ? "ring-2 ring-offset-1 ring-[#2D4C82] border-[#2D4C82]" : "border-[#CBD5E1]"}`;
  return (
    <div className="flex items-center gap-1 flex-wrap" data-kp={testid}>
      <span className="text-[11px] font-extrabold text-[#5B6B86] w-[52px] shrink-0 whitespace-nowrap">{label}</span>
      <button type="button" title="기본" onClick={() => onPick("")} className={`${sw(!value)} bg-white text-[10px] font-black text-[#8A97AD]`}>×</button>
      {list.map(([c, l]) => <button key={c} type="button" title={l} aria-label={`${label} ${l}`} data-color={c} onClick={() => onPick(c)} className={sw(value === c)} style={{ background: c }} />)}
      <input type="color" aria-label={`${label} 직접 고르기`} value={value || def} onChange={(e) => onPick(e.target.value.toUpperCase())} className="h-6 w-7 p-0 border-0 bg-transparent cursor-pointer shrink-0" />
    </div>
  );
}
function TextStyleBar({ value, onChange }) {
  const st = value || {};
  const set = (k, v) => { const n = { ...st }; if (v === undefined || v === "" || v === false || v === null) delete n[k]; else n[k] = v; onChange(n); };
  const sel = "h-8 px-1.5 rounded-lg border border-[#DCE3EE] bg-white text-[12px] font-bold text-[#1B2B4B] outline-none";
  const tog = (on) => `h-8 w-8 rounded-lg border text-[13px] ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`;
  return (
    <div className="mt-1.5 rounded-xl bg-[#F5F7FB] p-2 space-y-1.5" data-kp="text-style-bar">
      <div className="flex gap-1.5">
        <select aria-label="글씨체" value={st.ff || ""} onChange={(e) => set("ff", e.target.value)} className={`${sel} flex-1 min-w-0`}><option value="">글씨체 기본</option>{Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}</select>
        <select aria-label="두께" value={st.fw || ""} onChange={(e) => set("fw", e.target.value ? Number(e.target.value) : "")} className={`${sel} w-[88px]`}><option value="">두께 기본</option>{WEIGHTS.map((w) => <option key={w} value={w}>{{ 400: "보통", 500: "중간", 700: "굵게", 900: "아주 굵게" }[w]}</option>)}</select>
        <select aria-label="크기" value={st.fs || ""} onChange={(e) => set("fs", e.target.value ? Number(e.target.value) : "")} className={`${sel} w-[76px]`}><option value="">크기 기본</option>{Array.from({ length: 22 }, (_, i) => 11 + i).map((n) => <option key={n} value={n}>{n}px</option>)}</select>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" title="굵게" onClick={() => set("fw", (st.fw || 0) >= 700 ? "" : 700)} className={`${tog((st.fw || 0) >= 700)} font-black`}>B</button>
        <button type="button" title="기울임" onClick={() => set("i", !st.i)} className={`${tog(st.i)} italic font-bold`}>I</button>
        <button type="button" title="밑줄" onClick={() => set("u", !st.u)} className={`${tog(st.u)} underline font-bold`}>U</button>
        <button type="button" title="취소선" onClick={() => set("st", !st.st)} className={`${tog(st.st)} line-through font-bold`}>S</button>
        <button type="button" disabled={!cleanStyle(st)} onClick={() => onChange({})} className={`ml-auto ${btn}`}>기본값으로</button>
      </div>
      <Swatches label="글자색" value={st.c} list={PALETTE} onPick={(c) => set("c", c)} />
      <Swatches label="배경" value={st.bg} list={HILITE.slice(0, 6)} def="#FFF3B0" onPick={(c) => set("bg", c)} />
    </div>
  );
}

// 입력칸(EditableText 이름표가 있는 칸) 찾기
function fieldIdOf(el) {
  let a = el;
  for (let i = 0; a && i < 6 && a !== document.body; i++, a = a.parentElement) {
    const ets = a.matches("[data-et]") ? [a] : [...a.querySelectorAll("[data-et]")];
    if (ets.length === 1 && a.querySelector("input:not([type=hidden]), textarea, [data-opt-picker], [data-vt-picker]")) return ets[0].getAttribute("data-et");
    if (ets.length > 1) return null;
  }
  return null;
}
function FieldEditor({ id }) {
  useUiConfigVersion();
  const f = getEffective().fields[id] || {};
  const req = REQUIRED_FIELDS.has(id);
  const setF = (k, v) => editDraft((d) => { d.fields[id] = { ...(d.fields[id] || {}), [k]: v, at: Date.now(), by: viewerEmail() }; if (v === "" || v === false) delete d.fields[id][k]; });
  const name = id.replace(/^orderForm\.label\./, "").replace(/^nav\./, "");
  return (
    <div className="rounded-xl border border-[#DCE3EE] p-3 space-y-2" data-kp="field-editor">
      <div className="text-[12.5px] font-black text-[#0F1A30]">입력칸 · {name}</div>
      <Row label="이름"><DraftInput value={f.l || ""} placeholder={name} onCommit={(v) => setF("l", v)} testid="field-label" /></Row>
      <Row label="안내문구"><DraftInput value={f.ph || ""} placeholder="칸 안에 흐리게 보이는 글" onCommit={(v) => setF("ph", v)} testid="field-ph" /></Row>
      <Row label="도움말"><DraftInput value={f.hp || ""} placeholder="칸 아래 작은 설명" onCommit={(v) => setF("hp", v)} testid="field-help" /></Row>
      {DEFAULTABLE[id] && <Row label="기본값"><DraftInput value={f.df || ""} placeholder="새 오더를 열 때 미리 채울 값" onCommit={(v) => setF("df", v)} testid="field-default" /></Row>}
      <label className={`flex items-center gap-2 text-[12.5px] font-bold ${req ? "text-[#8A97AD]" : "text-[#1B2B4B]"}`}>
        <input type="checkbox" disabled={req} checked={!!f.h} onChange={(e) => setF("h", e.target.checked)} data-kp="field-hide" /> 이 칸 숨기기
      </label>
      {req && <div className="text-[11.5px] font-bold text-[#B54708]">꼭 입력해야 하는 칸이라 숨길 수 없어요. 숨기면 오더를 저장할 수 없어요.</div>}
      {DEFAULTABLE[id] && f.df && <div className="text-[11px] text-[#8A97AD]">기본값은 새로 여는 빈 양식부터 들어가요(입력 중인 양식은 그대로예요)</div>}
    </div>
  );
}
function Row({ label, children }) { return <div className="flex items-center gap-2"><span className="w-[56px] shrink-0 text-[11.5px] font-extrabold text-[#5B6B86]">{label}</span><div className="flex-1 min-w-0 flex">{children}</div></div>; }
// 입력 중에는 화면을 매번 다시 그리지 않고, 칸을 떠날 때(또는 Enter) 한 번에 반영
function DraftInput({ value, onCommit, placeholder, testid, area = false }) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onCommit(v.trim()); };
  const P = { value: v, placeholder, onChange: (e) => setV(e.target.value), onBlur: commit, "data-kp": testid, onKeyDown: (e) => { if (e.key === "Enter" && !area) { e.preventDefault(); e.currentTarget.blur(); } if (e.key === "Escape") { setV(value); e.stopPropagation(); } } };
  return area ? <textarea {...P} rows={3} className="w-full px-2.5 py-2 rounded-lg border border-[#DCE3EE] text-[12.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]" /> : <input {...P} className={`${inp} w-full`} />;
}

// 안내 상자
function BlockEditor({ tg, say }) {
  useUiConfigVersion();
  const cfg = getEffective();
  const mine = Object.entries(cfg.blocks).filter(([, b]) => tgKey(b.tg) === tgKey(tg));
  const [tx, setTx] = React.useState("");
  const [pos, setPos] = React.useState("after");
  const [tone, setTone] = React.useState("info");
  const add = () => {
    if (!tx.trim()) { say("안내 글을 넣어주세요"); return; }
    const bad = [...tx.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)].find((m) => !cleanLink(m[2]));
    if (bad) { say("링크는 https:// 주소나 /로 시작하는 앱 안 주소만 돼요"); return; }
    editDraft((d) => { d.blocks[newId()] = { tg, tx, pos, tone, sc: { d: "all" }, at: Date.now(), by: viewerEmail() }; });
    setTx(""); say("안내 상자를 붙였어요. 저장하면 모두에게 보여요");
  };
  return (
    <div className="rounded-xl border border-[#DCE3EE] p-3 space-y-2" data-kp="block-editor">
      <div className="text-[12.5px] font-black text-[#0F1A30]">안내 상자 붙이기</div>
      {mine.map(([id, b]) => (
        <div key={id} className="flex items-start gap-2 rounded-lg bg-[#F5F7FB] p-2">
          <div className="flex-1 min-w-0 text-[12px] text-[#3A4A66] break-all whitespace-pre-wrap">{b.tx}</div>
          <button type="button" className={btn} onClick={() => editDraft((d) => { delete d.blocks[id]; })}>빼기</button>
        </div>
      ))}
      <textarea value={tx} onChange={(e) => setTx(e.target.value)} rows={3} placeholder={"예: **오후 5시 이후** 등록은 ==다음 날== 배차예요. [안내 보기](/guide)"} className="w-full px-2.5 py-2 rounded-lg border border-[#DCE3EE] text-[12.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]" data-kp="block-text" />
      <div className="text-[11px] text-[#8A97AD]">**굵게** · ==강조== · [글자](https://주소) · 줄바꿈만 돼요</div>
      <div className="flex flex-wrap gap-1">
        {[["before", "위에"], ["after", "아래에"], ["start", "안쪽 위"], ["end", "안쪽 아래"]].map(([k, l]) => <button key={k} type="button" className={chip(pos === k)} onClick={() => setPos(k)}>{l}</button>)}
      </div>
      <div className="flex flex-wrap gap-1 items-center">
        {[["info", "안내"], ["warn", "주의"], ["ok", "완료"], ["plain", "기본"]].map(([k, l]) => <button key={k} type="button" className={chip(tone === k)} onClick={() => setTone(k)}><span className="inline-block w-2.5 h-2.5 rounded-full mr-1 align-middle" style={{ background: TONES[k][3] }} />{l}</button>)}
        <button type="button" onClick={add} className="ml-auto h-8 px-3 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-black" data-kp="block-add">붙이기</button>
      </div>
    </div>
  );
}

// ───────────────────────── 모양 ─────────────────────────
const LBL = { p: "안쪽 여백", m: "바깥 여백", br: "모서리", bw: "테두리 두께", w: "너비", op: "투명도", is: "아이콘 크기", ta: "정렬", sh: "그림자" };
const VAL = { w: { auto: "기본", fit: "내용만큼" }, ta: { left: "왼쪽", center: "가운데", right: "오른쪽" }, sh: { none: "없음", sm: "약하게", md: "보통", lg: "강하게" }, br: { 999: "둥글게" } };
function StyleTab({ tg }) {
  useUiConfigVersion();
  const [, r] = findRule(getEffective(), tg);
  const s = r?.s || {};
  const set = (k, v) => updateRule(tg, (rule) => { const n = { ...(rule.s || {}) }; if (v === undefined || v === "" || n[k] === v) delete n[k]; else n[k] = v; rule.s = n; });
  const presetRow = (k, unit = "px") => (
    <div className="space-y-1" key={k}>
      <div className="text-[11px] font-extrabold text-[#5B6B86]">{LBL[k]}</div>
      <div className="flex flex-wrap gap-1">{EL_PRESETS[k].map((v) => <button key={String(v)} type="button" className={chip(s[k] === v)} onClick={() => set(k, v)} data-kp={`st-${k}-${v}`}>{VAL[k]?.[v] ?? (typeof v === "number" ? (k === "op" ? Math.round(v * 100) + "%" : v + unit) : v)}</button>)}</div>
    </div>
  );
  return (
    <div className="space-y-3" data-kp="style-tab">
      <Swatches label="배경색" value={s.bg} list={HILITE} def="#FFFFFF" onPick={(c) => set("bg", c)} testid="st-bg" />
      <Swatches label="테두리색" value={s.bc} list={PALETTE} onPick={(c) => set("bc", c)} testid="st-bc" />
      <Swatches label="글자색" value={s.c} list={PALETTE} onPick={(c) => set("c", c)} testid="st-c" />
      {["bw", "br", "p", "m", "w", "op", "is", "ta", "sh"].map((k) => presetRow(k))}
      <div className="space-y-1">
        <div className="text-[11px] font-extrabold text-[#5B6B86]">글자(요소 전체)</div>
        <div className="flex gap-1.5">
          <select value={s.ff || ""} onChange={(e) => set("ff", e.target.value || undefined)} className={`${inp} flex-1`}><option value="">글씨체 기본</option>{Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}</select>
          <select value={s.fw || ""} onChange={(e) => set("fw", e.target.value ? Number(e.target.value) : undefined)} className={`${inp} w-[86px]`}><option value="">두께</option>{WEIGHTS.map((w) => <option key={w} value={w}>{{ 400: "보통", 500: "중간", 700: "굵게", 900: "아주 굵게" }[w]}</option>)}</select>
          <select value={s.fs || ""} onChange={(e) => set("fs", e.target.value ? Number(e.target.value) : undefined)} className={`${inp} w-[76px]`}><option value="">크기</option>{Array.from({ length: 26 }, (_, i) => 10 + i).map((n) => <option key={n} value={n}>{n}px</option>)}</select>
        </div>
      </div>
      <button type="button" disabled={!r?.s} className={btn} onClick={() => updateRule(tg, (rule) => { delete rule.s; })}>모양 원래대로</button>
      <ScopeEditor tg={tg} />
    </div>
  );
}

// 범위 — 어디서 · 어떤 기기 · 누구에게
function ScopeEditor({ tg }) {
  useUiConfigVersion();
  const [, r] = findRule(getEffective(), tg);
  const sc = r?.sc || { d: "all" };
  const set = (patch) => updateRule(tg, (rule) => { rule.sc = { ...(rule.sc || { d: "all" }), ...patch }; if (!rule.sc.s) delete rule.sc.s; if (!rule.sc.ro?.length) delete rule.sc.ro; });
  const scr = currentScreenKey();
  const ro = sc.ro || [];
  return (
    <div className="rounded-xl bg-[#F5F7FB] p-2.5 space-y-2" data-kp="scope-editor">
      <div className="text-[11px] font-extrabold text-[#2D4C82]">적용 범위{!r && <span className="text-[#8A97AD] font-bold"> · 숨기기나 모양을 정하면 생겨요</span>}</div>
      <div className="flex flex-wrap gap-1">
        <button type="button" disabled={!r} className={chip(!sc.s)} onClick={() => set({ s: "" })}>전체</button>
        <button type="button" disabled={!r} className={chip(!!sc.s)} onClick={() => set({ s: scr })} data-kp="scope-screen">이 화면만</button>
        <span className="w-2" />
        {[["all", "모든 기기"], ["pc", "PC만"], ["m", "모바일만"]].map(([k, l]) => <button key={k} type="button" disabled={!r} className={chip(sc.d === k)} onClick={() => set({ d: k })} data-kp={`scope-d-${k}`}>{l}</button>)}
      </div>
      {sc.s && <div className="text-[11px] text-[#5B6B86]">{screenLabel(sc.s)}에서만 적용돼요</div>}
      <div className="flex flex-wrap gap-1">
        <button type="button" disabled={!r} className={chip(!ro.length)} onClick={() => set({ ro: [] })}>모든 사람</button>
        {ROLE_GROUPS.map(([k, l]) => <button key={k} type="button" disabled={!r} className={chip(ro.includes(k))} onClick={() => set({ ro: ro.includes(k) ? ro.filter((x) => x !== k) : [...ro, k] })} data-kp={`scope-ro-${k}`}>{l}</button>)}
      </div>
      <div className="text-[11px] text-[#8A97AD]">최고관리자 화면에는 "모든 사람" 규칙만 적용돼요. 다른 역할은 미리보기로 확인하세요</div>
    </div>
  );
}

// ───────────────────────── 보이기 ─────────────────────────
// 고른 요소 안(또는 그 칸)에 꼭 입력해야 하는 칸이 있나 — 있으면 숨기기를 막는다
function requiredInside(el) {
  if (!el) return "";
  const fid = fieldIdOf(el);
  if (fid && REQUIRED_FIELDS.has(fid)) return fid;
  for (const et of el.querySelectorAll("[data-et]")) if (REQUIRED_FIELDS.has(et.getAttribute("data-et"))) return et.getAttribute("data-et");
  return "";
}
function ShowTab({ el, tg, info, say, onRetarget }) {
  useUiConfigVersion();
  const [, r] = findRule(getEffective(), tg);
  const n = resolveTarget(tg).length;
  const req = !r?.h ? requiredInside(el) : "";
  return (
    <div className="space-y-3" data-kp="show-tab">
      <div className="flex items-center gap-2">
        <button type="button" disabled={!!req} className={`flex-1 h-10 rounded-xl text-[13px] font-black border disabled:opacity-40 ${r?.h ? "bg-[#B42318] text-white border-[#B42318]" : "bg-white text-[#1B2B4B] border-[#DCE3EE]"}`} data-kp="hide-toggle"
          onClick={() => { updateRule(tg, (rule) => { if (rule.h) delete rule.h; else rule.h = true; }); say(r?.h ? "다시 보이게 했어요" : "숨겼어요. 편집 중에는 흐리게 보여요"); }}>
          {r?.h ? "숨김 · 다시 보이기" : "이 요소 숨기기"}
        </button>
      </div>
      {req && <div className="text-[11.5px] font-bold text-[#B54708]" data-kp="required-warn">꼭 입력해야 하는 칸({req.replace(/^orderForm\.label\./, "")})이 들어 있어 숨길 수 없어요. 숨기면 오더를 저장할 수 없어요</div>}
      <ScopeEditor tg={tg} />
      <SelectorInfo info={info} count={n} onRetarget={onRetarget} />
      <div className="text-[11px] text-[#8A97AD] leading-snug">숨기기는 화면에서만 감춰요. 권한이나 기능은 바뀌지 않아요</div>
    </div>
  );
}
function SelectorInfo({ info, count, onRetarget }) {
  if (!info) return null;
  const tone = info.fragile === 2 ? ["#FEF3F2", "#B42318", "깨지기 쉬움"] : info.fragile === 1 ? ["#FFF7E6", "#B54708", "보통"] : ["#ECFDF3", "#067647", "안정"];
  return (
    <div className="rounded-xl p-2.5 space-y-1" style={{ background: tone[0] }} data-kp="selector-info" data-fragile={info.fragile}>
      <div className="text-[11.5px] font-black" style={{ color: tone[1] }}>찾는 방법 · {tone[2]}</div>
      <div className="text-[11.5px] text-[#3A4A66]">{info.why}{count > 1 ? ` · 지금 ${count}곳에 적용` : ""}</div>
      {info.tg.i !== undefined && onRetarget && (() => { const all = { ...info.tg }; delete all.i; const n = resolveTarget(all).length; return n > 1 ? <button type="button" className={btn} data-kp="retarget-all" onClick={() => onRetarget({ tg: all, fragile: Math.min(info.fragile, 1), why: `같은 모양 ${n}곳 모두` })}>같은 모양 {n}곳 모두에 적용</button> : null; })()}
      {info.fragile === 2 && <div className="text-[11.5px] font-bold text-[#B42318]">화면 코드가 바뀌면 다른 곳에 적용되거나 사라질 수 있어요. 위쪽 묶음(부모)을 고르면 더 안정적일 수 있어요</div>}
    </div>
  );
}

// ───────────────────────── 이미지 ─────────────────────────
function ImageTab({ el, tg, say }) {
  useUiConfigVersion();
  const [, r] = findRule(getEffective(), tg);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef(null);
  const isImg = el?.tagName === "IMG" || el?.tagName === "svg" || el?.tagName === "SVG" || (el && getComputedStyle(el).backgroundImage !== "none");
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try { const url = await uploadImage(file); updateRule(tg, (rule) => { rule.img = url; rule.fit = rule.fit || "contain"; }); say("이미지를 바꿨어요. 저장하면 모두에게 보여요"); } catch (e) { say(e?.message || "올리지 못했어요"); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3" data-kp="img-tab">
      {!isImg && <div className="text-[12px] font-bold text-[#B54708]">고른 곳이 이미지가 아니에요. 배경 그림으로 들어가요(로고·배너는 이미지를 바로 고르세요)</div>}
      {r?.img && <img src={r.img} alt="" className="max-h-[120px] rounded-lg border border-[#DCE3EE] bg-[#F5F7FB] object-contain mx-auto" />}
      <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="w-full h-10 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-black disabled:opacity-60">{busy ? "올리는 중…" : r?.img ? "다른 이미지로" : "이미지 올리기"}</button>
      <input ref={fileRef} type="file" accept={IMG_TYPES.join(",")} className="hidden" data-kp="img-file" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="text-[11px] text-[#8A97AD]">PNG · JPG · WEBP · GIF, 3MB까지{isDemo() ? " · 둘러보기는 400KB까지(이 브라우저에만)" : ""}</div>
      {r?.img && (
        <div className="flex gap-1">
          {[["contain", "전체 보이기"], ["cover", "꽉 채우기"]].map(([k, l]) => <button key={k} type="button" className={chip(r.fit === k)} onClick={() => updateRule(tg, (rule) => { rule.fit = k; })}>{l}</button>)}
          <button type="button" className={`ml-auto ${btn}`} onClick={() => updateRule(tg, (rule) => { delete rule.img; delete rule.fit; })}>원래 이미지로</button>
        </div>
      )}
      <ScopeEditor tg={tg} />
    </div>
  );
}

// ───────────────────────── 메뉴 ─────────────────────────
function MenuTab({ say }) {
  useUiConfigVersion();
  const [surface, setSurface] = React.useState(() => (window.innerWidth < 768 ? "m" : "pc"));
  const cfg = getEffective();
  const seen = seenMenuKeys(surface);
  const keys = [...seen, ...Object.keys(cfg.menus).filter((k) => k.startsWith(surface + ":")).map((k) => k.slice(surface.length + 1)).filter((k) => !seen.includes(k))];
  const ord = (k, i) => cfg.menus[`${surface}:${k}`]?.o ?? i * 10;
  const rows = keys.map((k, i) => ({ k, o: ord(k, i), e: cfg.menus[`${surface}:${k}`] || {} })).sort((a, b) => a.o - b.o);
  const setE = (k, patch) => editDraft((d) => { const key = `${surface}:${k}`; d.menus[key] = { ...(d.menus[key] || {}), ...patch, at: Date.now(), by: viewerEmail() }; for (const [x, v] of Object.entries(patch)) if (v === "" || v === false || v === undefined || (Array.isArray(v) && !v.length)) delete d.menus[key][x]; });
  const move = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= rows.length) return;
    const list = rows.map((r) => r.k); [list[i], list[j]] = [list[j], list[i]];
    editDraft((d) => { list.forEach((k, n) => { const key = `${surface}:${k}`; d.menus[key] = { ...(d.menus[key] || {}), o: n * 10, at: Date.now(), by: viewerEmail() }; }); });
  };
  return (
    <div className="space-y-2.5" data-kp="menu-tab">
      <div className="flex gap-1">{[["pc", "PC 메뉴(위·왼쪽)"], ["m", "모바일 메뉴"]].map(([k, l]) => <button key={k} type="button" className={chip(surface === k)} onClick={() => setSurface(k)}>{l}</button>)}</div>
      <div className="text-[11px] text-[#8A97AD] leading-snug">이름·순서·숨기기만 바꿔요. 권한이 없는 메뉴는 여기서 켜도 보이지 않아요{surface === "m" ? " · 모바일 메뉴는 한 번 열어본 줄만 보여요" : ""}</div>
      {!rows.length && <div className="text-[12px] text-[#8A97AD] py-4 text-center">{surface === "m" ? "모바일 메뉴를 한 번 열어주세요" : "메뉴를 찾지 못했어요"}</div>}
      {rows.map((r, i) => (
        <div key={r.k} className={`rounded-xl border p-2 space-y-1.5 ${r.e.h ? "border-[#F5C2BC] bg-[#FEF3F2]" : "border-[#DCE3EE]"}`} data-kp="menu-row" data-menu-key={r.k}>
          <div className="flex items-center gap-1.5">
            <div className="flex flex-col">
              <button type="button" className="h-4 w-6 text-[10px] leading-none text-[#5B6B86] disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로" data-kp="menu-up">▲</button>
              <button type="button" className="h-4 w-6 text-[10px] leading-none text-[#5B6B86] disabled:opacity-30" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="아래로" data-kp="menu-down">▼</button>
            </div>
            <DraftInput value={r.e.l || ""} placeholder={r.k} onCommit={(v) => setE(r.k, { l: v })} testid="menu-name" />
            <button type="button" className={chip(!!r.e.h)} onClick={() => setE(r.k, { h: !r.e.h })} data-kp="menu-hide">{r.e.h ? "숨김" : "보임"}</button>
          </div>
          {r.e.h && (
            <div className="flex flex-wrap gap-1 pl-7">
              <span className="text-[11px] font-bold text-[#5B6B86] self-center mr-1">누구에게 숨길까요</span>
              <button type="button" className={chip(!r.e.ro?.length)} onClick={() => setE(r.k, { ro: [] })}>모두</button>
              {ROLE_GROUPS.map(([k, l]) => <button key={k} type="button" className={chip(r.e.ro?.includes(k))} onClick={() => setE(r.k, { ro: r.e.ro?.includes(k) ? r.e.ro.filter((x) => x !== k) : [...(r.e.ro || []), k] })}>{l}</button>)}
            </div>
          )}
        </div>
      ))}
      {rows.some((r) => r.e.o !== undefined) && <button type="button" className={btn} onClick={() => { editDraft((d) => { for (const k of Object.keys(d.menus)) if (k.startsWith(surface + ":")) delete d.menus[k].o; }); say("원래 순서로 돌렸어요"); }}>원래 순서로</button>}
    </div>
  );
}

// ───────────────────────── 목록 ─────────────────────────
function ListTab({ say }) {
  useUiConfigVersion();
  const [key, setKey] = React.useState("지급방식");
  const [nv, setNv] = React.useState("");
  const o = getEffective().opts[key] || {};
  const base = OPT_BASE[key] || [];
  const hide = new Set(o.hide || []);
  let all = [...base, ...(o.add || []).filter((v) => !base.includes(v))];
  if (o.ord?.length) { const pos = new Map(o.ord.map((v, i) => [v, i])); all = all.map((v, i) => [v, i]).sort((a, b) => ((pos.has(a[0]) ? pos.get(a[0]) : 1000 + a[1]) - (pos.has(b[0]) ? pos.get(b[0]) : 1000 + b[1]))).map(([v]) => v); }
  const setO = (fn) => editDraft((d) => { const cur = { add: [], hide: [], ord: [], lb: {}, ...(d.opts[key] || {}) }; fn(cur); cur.at = Date.now(); cur.by = viewerEmail(); d.opts[key] = cur; });
  const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= all.length) return; const list = [...all]; [list[i], list[j]] = [list[j], list[i]]; setO((c) => { c.ord = list; }); };
  const addOne = () => {
    const v = nv.replace(/\s+/g, " ").trim().slice(0, 30);
    if (!v) return;
    if (all.includes(v)) { say("이미 있는 항목이에요"); return; }
    setO((c) => { c.add = [...(c.add || []), v]; c.hide = (c.hide || []).filter((x) => x !== v); });
    setNv("");
  };
  return (
    <div className="space-y-2.5" data-kp="list-tab">
      <select value={key} onChange={(e) => setKey(e.target.value)} className={`${inp} w-full`} data-kp="list-key">{OPTION_KEYS.map((k) => <option key={k} value={k}>{OPT_TITLE[k]}</option>)}</select>
      <div className="text-[11px] text-[#8A97AD] leading-snug">이미 저장된 오더 값은 그대로예요. 이름 바꾸기는 화면에 보이는 이름만 바뀌어요. 회사가 직접 바꾼 목록이 있으면 그 회사는 회사 목록이 먼저예요</div>
      {all.map((v, i) => (
        <div key={v} className={`flex items-center gap-1.5 rounded-xl border p-1.5 ${hide.has(v) ? "border-[#F5C2BC] bg-[#FEF3F2]" : "border-[#DCE3EE]"}`} data-kp="opt-row" data-opt={v}>
          <div className="flex flex-col">
            <button type="button" className="h-4 w-6 text-[10px] leading-none text-[#5B6B86] disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로" data-kp="opt-up">▲</button>
            <button type="button" className="h-4 w-6 text-[10px] leading-none text-[#5B6B86] disabled:opacity-30" disabled={i === all.length - 1} onClick={() => move(i, 1)} aria-label="아래로" data-kp="opt-down">▼</button>
          </div>
          <span className="w-[76px] shrink-0 text-[12px] font-bold text-[#3A4A66] truncate" title={v}>{v}</span>
          <DraftInput value={o.lb?.[v] || ""} placeholder="보이는 이름" onCommit={(x) => setO((c) => { c.lb = { ...(c.lb || {}) }; if (x) c.lb[v] = x; else delete c.lb[v]; })} testid="opt-label" />
          <button type="button" className={chip(hide.has(v))} onClick={() => setO((c) => { c.hide = hide.has(v) ? c.hide.filter((x) => x !== v) : [...(c.hide || []), v]; })} data-kp="opt-hide">{hide.has(v) ? "숨김" : "보임"}</button>
          {!base.includes(v) && <button type="button" className="h-8 px-2 text-[12px] font-bold text-[#B42318]" onClick={() => setO((c) => { c.add = c.add.filter((x) => x !== v); c.ord = (c.ord || []).filter((x) => x !== v); })}>빼기</button>}
        </div>
      ))}
      <div className="flex gap-1.5">
        <input value={nv} onChange={(e) => setNv(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOne(); } }} placeholder="새 항목 이름" className={`${inp} flex-1`} data-kp="opt-new" />
        <button type="button" onClick={addOne} className="h-9 px-3 rounded-lg bg-[#1B2B4B] text-white text-[12.5px] font-black" data-kp="opt-add">더하기</button>
      </div>
      {getEffective().opts[key] && <button type="button" className={btn} onClick={() => { editDraft((d) => { delete d.opts[key]; }); say("기본 목록으로 돌렸어요"); }}>기본 목록으로</button>}
    </div>
  );
}

// ───────────────────────── 테마 ─────────────────────────
const PRIMARY = [["#1B2B4B", "기본 남색"], ["#1E3A8A", "진파랑"], ["#0F766E", "청록"], ["#14532D", "숲색"], ["#581C87", "보라"], ["#7F1D1D", "와인"], ["#334155", "슬레이트"], ["#111827", "먹색"]];
const ACCENT = [["#2D4C82", "기본"], ["#2563EB", "파랑"], ["#0891B2", "하늘"], ["#16A34A", "초록"], ["#EA580C", "주황"], ["#DB2777", "분홍"], ["#7C3AED", "보라"], ["#CA8A04", "겨자"]];
function ThemeTab({ say }) {
  useUiConfigVersion();
  const t = getEffective().theme || {};
  const set = (k, v) => editDraft((d) => { const n = { d: "all", ...(d.theme || {}) }; if (v === undefined || v === "" || v === null) delete n[k]; else n[k] = v; n.at = Date.now(); n.by = viewerEmail(); d.theme = n; });
  return (
    <div className="space-y-3" data-kp="theme-tab">
      <div className="text-[11px] text-[#8A97AD]">고르면 바로 화면에 보여요(미리 보기). 저장을 눌러야 모두에게 적용돼요</div>
      <Swatches label="주색" value={t.pr} list={PRIMARY} def="#1B2B4B" onPick={(c) => set("pr", c)} testid="theme-pr" />
      <Swatches label="강조색" value={t.ac} list={ACCENT} def="#2D4C82" onPick={(c) => set("ac", c)} testid="theme-ac" />
      <div className="space-y-1"><div className="text-[11px] font-extrabold text-[#5B6B86]">글씨체</div>
        <select value={t.ff || ""} onChange={(e) => set("ff", e.target.value)} className={`${inp} w-full`}><option value="">기본(Noto Sans KR)</option>{Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}</select></div>
      <div className="space-y-1"><div className="text-[11px] font-extrabold text-[#5B6B86]">기본 글자 크기</div>
        <div className="flex flex-wrap gap-1">{THEME_PRESETS.fz.map((v) => <button key={v} type="button" className={chip((t.fz || 1) === v)} onClick={() => set("fz", v === 1 ? "" : v)}>{Math.round(v * 100)}%</button>)}</div></div>
      <div className="space-y-1"><div className="text-[11px] font-extrabold text-[#5B6B86]">모서리</div>
        <div className="flex flex-wrap gap-1">{[["sq", "각지게"], ["df", "기본"], ["rd", "둥글게"], ["xl", "더 둥글게"]].map(([k, l]) => <button key={k} type="button" className={chip((t.rd || "df") === k)} onClick={() => set("rd", k === "df" ? "" : k)}>{l}</button>)}</div></div>
      <div className="space-y-1"><div className="text-[11px] font-extrabold text-[#5B6B86]">적용 기기</div>
        <div className="flex flex-wrap gap-1">{[["all", "모든 기기"], ["pc", "PC만"], ["m", "모바일만"]].map(([k, l]) => <button key={k} type="button" className={chip((t.d || "all") === k)} onClick={() => set("d", k)}>{l}</button>)}</div></div>
      {getEffective().theme && <button type="button" className={btn} onClick={() => { editDraft((d) => { d.theme = null; }); say("기본 테마로 돌렸어요"); }}>기본 테마로</button>}
    </div>
  );
}

// ───────────────────────── 변경 목록 · 기록 · 백업 · 미리보기 ─────────────────────────
const CATS = [["all", "전체"], ["hide", "숨기기"], ["style", "모양"], ["img", "이미지"], ["block", "안내"], ["menu", "메뉴"], ["opt", "목록"], ["field", "입력칸"], ["theme", "테마"], ["text", "문구"]];
function changeRows() {
  const c = getEffective(); const p = getPublished(); const rows = [];
  const dirty = (a, b) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
  for (const [id, r] of Object.entries(c.els)) {
    const label = r.tg.lb || r.tg.t || (r.tg.p.at(-1)?.a ? Object.values(r.tg.p.at(-1).a)[0] : r.tg.p.at(-1)?.g) || "요소";
    const cats = [r.h && "hide", r.s && "style", r.img && "img"].filter(Boolean);
    rows.push({ key: "e" + id, cats, title: label, detail: [r.h && "숨김", r.s && "모양", r.img && "이미지", r.sc?.s && screenLabel(r.sc.s), r.sc?.d !== "all" && (r.sc.d === "pc" ? "PC만" : "모바일만"), r.sc?.ro?.length && r.sc.ro.map((x) => ROLE_GROUPS.find(([k]) => k === x)?.[1]).join("·")].filter(Boolean).join(" · "), by: r.by, at: r.at, dirty: dirty(r, p.els[id]), revert: () => editDraft((d) => { delete d.els[id]; }) });
  }
  for (const [id, b] of Object.entries(c.blocks)) rows.push({ key: "b" + id, cats: ["block"], title: "안내 상자", detail: b.tx.slice(0, 40), by: b.by, at: b.at, dirty: dirty(b, p.blocks[id]), revert: () => editDraft((d) => { delete d.blocks[id]; }) });
  for (const [k, m] of Object.entries(c.menus)) rows.push({ key: "m" + k, cats: ["menu"], title: `${k.startsWith("m:") ? "모바일" : "PC"} 메뉴 · ${k.split(":").slice(1).join(":")}`, detail: [m.l && `이름 ${m.l}`, m.h && "숨김", m.o !== undefined && "순서"].filter(Boolean).join(" · "), by: m.by, at: m.at, dirty: dirty(m, p.menus[k]), revert: () => editDraft((d) => { delete d.menus[k]; }) });
  for (const [k, o] of Object.entries(c.opts)) rows.push({ key: "o" + k, cats: ["opt"], title: `목록 · ${OPT_TITLE[k] || k}`, detail: [o.add && `더함 ${o.add.length}`, o.hide && `숨김 ${o.hide.length}`, o.ord && "순서", o.lb && `이름 ${Object.keys(o.lb).length}`].filter(Boolean).join(" · "), by: o.by, at: o.at, dirty: dirty(o, p.opts[k]), revert: () => editDraft((d) => { delete d.opts[k]; }) });
  for (const [k, f] of Object.entries(c.fields)) rows.push({ key: "f" + k, cats: ["field"], title: `입력칸 · ${k.replace(/^orderForm\.label\./, "")}`, detail: [f.l && `이름 ${f.l}`, f.ph && "안내문구", f.hp && "도움말", f.df && `기본값 ${f.df}`, f.h && "숨김"].filter(Boolean).join(" · "), by: f.by, at: f.at, dirty: dirty(f, p.fields[k]), revert: () => editDraft((d) => { delete d.fields[k]; }) });
  if (c.theme) rows.push({ key: "theme", cats: ["theme"], title: "테마", detail: [c.theme.pr && `주색 ${c.theme.pr}`, c.theme.ac && `강조 ${c.theme.ac}`, c.theme.ff && FONTS[c.theme.ff]?.label, c.theme.fz && `${Math.round(c.theme.fz * 100)}%`, c.theme.rd && "모서리"].filter(Boolean).join(" · "), by: c.theme.by, at: c.theme.at, dirty: dirty(c.theme, p.theme), revert: () => editDraft((d) => { d.theme = null; }) });
  const tx = getDocsSnapshot();
  for (const [docId, d] of Object.entries(tx)) {
    for (const o of new Set([...Object.keys(d.t || {}), ...Object.keys(d.s || {})])) rows.push({ key: `t${docId}${o}`, cats: ["text"], title: `문구 · ${o.slice(0, 24)}`, detail: `${d.t?.[o] ? "→ " + d.t[o].slice(0, 24) : "모양만"} · ${routeLabel(docId)}`, saved: true, revert: async () => { if (d.t?.[o]) await saveOverride({ docId, kind: "text", orig: o, value: null }); if (d.s?.[o]) await saveStyle({ docId, orig: o, style: null }); } });
    for (const k of Object.keys(d.a || {})) { const i = k.indexOf("::"); rows.push({ key: `a${docId}${k}`, cats: ["text"], title: `${k.slice(0, i) === "title" ? "툴팁" : "안내문구"} · ${k.slice(i + 2, i + 26)}`, detail: `→ ${String(d.a[k]).slice(0, 24)} · ${routeLabel(docId)}`, saved: true, revert: () => saveOverride({ docId, kind: k.slice(0, i), orig: k.slice(i + 2), value: null }) }); }
  }
  return rows.sort((a, b) => (Number(!!b.dirty) - Number(!!a.dirty)) || ((b.at || 0) - (a.at || 0)));
}
function ChangesView({ say, onTextList }) {
  useUiConfigVersion();
  const [cat, setCat] = React.useState("all");
  const [q, setQ] = React.useState("");
  const all = changeRows();
  const rows = all.filter((r) => (cat === "all" || r.cats.includes(cat)) && (!q.trim() || (r.title + r.detail).toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div className="space-y-2" data-kp="changes-view">
      <div className="flex flex-wrap gap-1">{CATS.map(([k, l]) => { const n = k === "all" ? all.length : all.filter((r) => r.cats.includes(k)).length; return <button key={k} type="button" className={chip(cat === k)} onClick={() => setCat(k)}>{l}{n ? ` ${n}` : ""}</button>; })}</div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="찾기" className={`${inp} w-full`} />
      {!rows.length && <div className="text-[12px] text-[#8A97AD] py-6 text-center">바꾼 내용이 없어요</div>}
      {rows.map((r) => (
        <div key={r.key} className="flex items-start gap-2 rounded-xl border border-[#E3E8F0] p-2" data-kp="change-row">
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-black text-[#0F1A30] truncate">{r.title}{r.dirty && <span className="ml-1.5 px-1.5 rounded bg-[#FFF3B0] text-[#7A4A00] text-[10.5px] font-black align-middle">저장 전</span>}</div>
            <div className="text-[11.5px] text-[#5B6B86] truncate">{r.detail}</div>
            {(r.by || r.at) && <div className="text-[10.5px] text-[#8A97AD]">{[r.by, fmtAt(r.at)].filter(Boolean).join(" · ")}</div>}
          </div>
          <button type="button" className={btn} data-kp="change-revert" onClick={async () => { try { await r.revert(); say(r.saved ? "원래대로 돌렸어요" : "뺐어요. 저장하면 적용돼요"); } catch (e) { say("되돌리지 못했어요: " + (e?.message || e)); } }}>되돌리기</button>
        </div>
      ))}
      <button type="button" className={btn} onClick={onTextList}>문구 전체 목록 열기</button>
    </div>
  );
}
function HistoryView({ say }) {
  const [list, setList] = React.useState(null);
  React.useEffect(() => { listHistory().then(setList).catch((e) => { setList([]); say("기록을 불러오지 못했어요: " + (e?.message || e)); }); }, [say]);
  const meta = getPublishedMeta();
  if (!list) return <div className="text-[12px] text-[#8A97AD] py-6 text-center">불러오는 중…</div>;
  return (
    <div className="space-y-2" data-kp="history-view">
      <div className="text-[11px] text-[#8A97AD]">저장할 때마다 최근 20개까지 남아요. 되살리면 편집 중인 내용으로 들어오고, 저장해야 적용돼요</div>
      {!list.length && <div className="text-[12px] text-[#8A97AD] py-6 text-center">아직 기록이 없어요</div>}
      {list.map((h) => (
        <div key={h.id} className="flex items-center gap-2 rounded-xl border border-[#E3E8F0] p-2" data-kp="history-row">
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-black text-[#0F1A30]">{h.rev}번째 저장{h.rev === meta.rev && <span className="ml-1.5 text-[10.5px] font-black text-[#067647]">지금</span>}</div>
            <div className="text-[11px] text-[#5B6B86]">{[fmtAt(h.at), h.by, `${h.n ?? countConfig(h.cfg)}개`].filter(Boolean).join(" · ")}</div>
          </div>
          <button type="button" className={btn} data-kp="history-restore" onClick={() => { restoreToDraft(h.cfg); say(`${h.rev}번째 저장으로 되살렸어요. 저장을 눌러 적용하세요`); }}>되살리기</button>
        </div>
      ))}
    </div>
  );
}
function BackupView({ say }) {
  const fileRef = React.useRef(null);
  const doExport = () => {
    const data = { kind: "logisweb-ui-backup", version: 1, exportedAt: new Date().toISOString(), ui: exportConfig(), text: exportOverrides() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `화면편집_${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const doImport = async (file) => {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("파일이 너무 커요");
      const j = JSON.parse(await file.text());
      if (j.ui) importToDraft(j.ui);
      let n = 0;
      if (j.text) n = await importOverrides(j.text);
      else if (!j.ui && j.docs) n = await importOverrides(j.docs);
      say(`가져왔어요${j.ui ? " · 화면 설정은 저장을 눌러야 적용돼요" : ""}${n ? ` · 문구 ${n}개 바로 적용` : ""}`);
    } catch (e) { say("가져오지 못했어요: " + (e?.message || e)); }
  };
  return (
    <div className="space-y-2" data-kp="backup-view">
      <button type="button" onClick={doExport} className="w-full h-10 rounded-xl border border-[#DCE3EE] text-[13px] font-black text-[#1B2B4B]">내보내기(JSON 파일)</button>
      <button type="button" onClick={() => fileRef.current?.click()} className="w-full h-10 rounded-xl border border-[#DCE3EE] text-[13px] font-black text-[#1B2B4B]">가져오기</button>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="text-[11px] text-[#8A97AD] leading-snug">화면 설정과 문구를 함께 담아요. 가져온 값은 모두 다시 검사해요. 문구는 가져오면 바로 적용되고, 화면 설정은 저장을 눌러야 적용돼요</div>
    </div>
  );
}
function PreviewView() {
  useUiConfigVersion();
  const p = getPreviewAs() || {};
  return (
    <div className="space-y-2.5" data-kp="preview-view">
      <div className="text-[11px] text-[#8A97AD] leading-snug">화면 편집의 보이기 규칙(숨기기·모양·메뉴)만 그 사람처럼 적용해 봐요. 실제 권한과 메뉴 접근은 바뀌지 않아요</div>
      <div className="text-[11px] font-extrabold text-[#5B6B86]">역할</div>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={chip(!p.role)} onClick={() => setPreviewAs({ ...p, role: null })}>내 화면</button>
        {ROLE_GROUPS.map(([k, l]) => <button key={k} type="button" className={chip(p.role === k)} onClick={() => setPreviewAs({ ...p, role: k })} data-kp={`pv-ro-${k}`}>{l}</button>)}
      </div>
      <div className="text-[11px] font-extrabold text-[#5B6B86]">기기</div>
      <div className="flex flex-wrap gap-1">{[[null, "지금 기기"], ["pc", "PC"], ["m", "모바일"]].map(([k, l]) => <button key={String(k)} type="button" className={chip((p.dev || null) === k)} onClick={() => setPreviewAs({ ...p, dev: k })}>{l}</button>)}</div>
      {(p.role || p.dev) && <button type="button" className={btn} onClick={() => setPreviewAs(null)}>미리보기 끄기</button>}
    </div>
  );
}

// ───────────────────────── 창 ─────────────────────────
export default function UiEditorPanel({ sel, onSelect, onRetarget, onClose, say, onTextList }) {
  useUiConfigVersion();
  const el = sel?.el && sel.el.isConnected ? sel.el : sel?.info ? resolveTarget(sel.info.tg)[0] || null : null;
  const info = sel?.info || null;
  const tg = info?.tg || null;
  const textItems = React.useMemo(() => (el ? textItemsOf(el) : []), [el]);
  const fieldId = React.useMemo(() => (el ? fieldIdOf(el) : null), [el]);
  const [tab, setTab] = React.useState(sel ? "text" : "menu");
  const [view, setView] = React.useState("tabs");
  const [busy, setBusy] = React.useState(false);
  const lastSel = React.useRef(null);
  React.useEffect(() => {
    if (sel && sel !== lastSel.current) { lastSel.current = sel; setView("tabs"); setTab((t) => (EL_TABS.has(t) ? (t === "text" && !textItems.length && !fieldId ? "style" : t) : "text")); }
  }, [sel, textItems.length, fieldId]);
  React.useEffect(() => { beginDraft(); }, []);
  const dirty = hasDraftChanges();
  const nDirty = dirty ? changeRows().filter((r) => r.dirty).length + (getPublished().theme && !getEffective().theme ? 1 : 0) + Object.keys(getPublished().els).filter((id) => !getEffective().els[id]).length : 0;
  const save = async () => {
    if (draftConflict() && !(await kpConfirm("다른 곳에서 먼저 저장했어요. 지금 내용으로 덮어쓸까요?"))) return;
    setBusy(true);
    try { const r = await publishDraft(); beginDraft(); say(`저장했어요 · 모두에게 적용돼요(${r.n}개)`); } catch (e) { say("저장하지 못했어요: " + (e?.message || e)); } finally { setBusy(false); }
  };
  const isPhone = window.innerWidth < 768;
  const pv = getPreviewAs();
  const crumbs = [];
  if (el) { let a = el; for (let i = 0; a && i < 4 && a !== document.body; i++, a = a.parentElement) crumbs.unshift(a); }
  const box = isPhone ? { position: "fixed", left: 0, right: 0, bottom: 0, height: "62vh" } : { position: "fixed", right: 0, top: 0, bottom: 0, width: 392 };
  const VIEWS = [["changes", "변경 목록"], ["history", "기록"], ["backup", "백업"], ["preview", "미리보기"]];
  return (
    <div style={{ ...box, zIndex: 2147483635 }} className={`flex flex-col bg-white shadow-[-12px_0_40px_rgba(15,26,48,0.25)] border-l border-[#DCE3EE] ${isPhone ? "rounded-t-2xl" : ""}`} data-kp="ui-panel">
      <div className="px-4 pt-3 pb-2.5 text-white" style={{ background: `linear-gradient(120deg,${C.navy},${C.navy2} 60%,${C.blue})` }}>
        <div className="flex items-center gap-2">
          <div className="text-[14.5px] font-black">화면 편집</div>
          <span className="text-[11px] text-white/60 font-bold truncate">{getPublishedMeta().rev ? `${getPublishedMeta().rev}번째 저장${getPublishedMeta().by ? " · " + getPublishedMeta().by : ""}` : "아직 저장 전"}</span>
          <button type="button" onClick={onClose} className="ml-auto h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11.5px] font-bold">닫기</button>
        </div>
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          <button type="button" disabled={!canUndo()} onClick={undo} title="되돌리기(Ctrl+Z)" className="h-7 px-2 rounded-lg bg-white/10 hover:bg-white/20 text-[11.5px] font-bold disabled:opacity-30" data-kp="undo">↶ 되돌리기</button>
          <button type="button" disabled={!canRedo()} onClick={redo} title="다시 하기(Ctrl+Shift+Z)" className="h-7 px-2 rounded-lg bg-white/10 hover:bg-white/20 text-[11.5px] font-bold disabled:opacity-30" data-kp="redo">↷ 다시</button>
          {VIEWS.map(([k, l]) => <button key={k} type="button" onClick={() => setView(view === k ? "tabs" : k)} className={`h-7 px-2 rounded-lg text-[11.5px] font-bold ${view === k ? "bg-white text-[#0F1A30]" : "bg-white/10 hover:bg-white/20"}`} data-kp={`view-${k}`}>{l}</button>)}
          <button type="button" onClick={async () => { if ((await kpConfirm("이 창에서 화면 편집 내용을 모두 끄고 원래 화면으로 볼까요? 다시 켜기 전까지 유지돼요"))) setUiBypass(true); }} className="h-7 px-2 rounded-lg bg-[#B42318]/80 hover:bg-[#B42318] text-[11.5px] font-bold" data-kp="bypass">모두 끄기</button>
        </div>
        {pv && <div className="mt-2 text-[11.5px] font-bold text-[#FFE7A3]">미리보기 중 · {[pv.role && ROLE_GROUPS.find(([k]) => k === pv.role)?.[1], pv.dev && (pv.dev === "m" ? "모바일" : "PC")].filter(Boolean).join(" · ")}</div>}
      </div>

      {view === "tabs" && (
        <>
          <div className="px-3 pt-2 pb-1 border-b border-[#E9EDF4]">
            {el ? (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-0.5" data-kp="breadcrumb">
                  {crumbs.map((c, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span className="text-[10px] text-[#B0BACB]">›</span>}
                      <button type="button" onClick={() => onSelect(c)} className={`max-w-[104px] truncate h-6 px-1.5 rounded-md text-[11px] font-bold ${c === el ? "bg-[#1B2B4B] text-white" : "text-[#5B6B86] hover:bg-[#F1F4F9]"}`} title={elementLabel(c)}>{elementLabel(c)}</button>
                    </React.Fragment>
                  ))}
                  <button type="button" onClick={() => el.parentElement && el.parentElement !== document.body && onSelect(el.parentElement)} className="ml-auto h-6 px-1.5 rounded-md border border-[#DCE3EE] text-[11px] font-bold text-[#1B2B4B]" data-kp="select-parent">↑ 부모</button>
                </div>
                {info?.fragile === 2 && <div className="text-[11px] font-bold text-[#B42318]">이 요소는 찾는 방법이 깨지기 쉬워요(보이기 탭 참고)</div>}
              </div>
            ) : <div className="text-[12px] text-[#8A97AD] py-1">화면에서 고칠 곳을 눌러 주세요. 메뉴·목록·테마는 바로 고칠 수 있어요</div>}
            <div className="flex gap-0.5 mt-1.5 overflow-x-auto no-scrollbar">
              {TABS.map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={`h-8 px-2.5 rounded-lg text-[12.5px] font-black whitespace-nowrap ${tab === k ? "bg-[#EEF3FC] text-[#1B2B4B]" : "text-[#8A97AD] hover:text-[#1B2B4B]"} ${EL_TABS.has(k) && !el ? "opacity-40" : ""}`} data-kp={`tab-${k}`}>{l}</button>)}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {EL_TABS.has(tab) && !el && <div className="text-[12.5px] text-[#8A97AD] py-8 text-center">먼저 화면에서 요소를 골라 주세요</div>}
            {tab === "text" && el && (
              <>
                {textItems.length ? <TextItemsEditor key={textItems.map((x) => x.kind + x.orig).join("|")} items={textItems} say={say} /> : <div className="text-[12px] text-[#8A97AD]">이 자리에는 바꿀 글자가 없어요(숫자·데이터는 빼요)</div>}
                {fieldId && <FieldEditor id={fieldId} />}
                {tg && <BlockEditor tg={tg} say={say} />}
              </>
            )}
            {tab === "style" && el && tg && <StyleTab tg={tg} />}
            {tab === "show" && el && tg && <ShowTab el={el} tg={tg} info={info} say={say} onRetarget={onRetarget} />}
            {tab === "img" && el && tg && <ImageTab el={el} tg={tg} say={say} />}
            {EL_TABS.has(tab) && el && !tg && <div className="text-[12px] font-bold text-[#B42318]">이 요소는 위치를 정하지 못했어요. 부모를 골라 주세요</div>}
            {tab === "menu" && <MenuTab say={say} />}
            {tab === "list" && <ListTab say={say} />}
            {tab === "theme" && <ThemeTab say={say} />}
          </div>
        </>
      )}
      {view !== "tabs" && (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="flex items-center mb-2"><div className="text-[13.5px] font-black text-[#0F1A30]">{VIEWS.find(([k]) => k === view)?.[1]}</div><button type="button" className={`ml-auto ${btn}`} onClick={() => setView("tabs")}>편집으로</button></div>
          {view === "changes" && <ChangesView say={say} onTextList={onTextList} />}
          {view === "history" && <HistoryView say={say} />}
          {view === "backup" && <BackupView say={say} />}
          {view === "preview" && <PreviewView />}
        </div>
      )}

      <div className="px-3 py-2.5 border-t border-[#E9EDF4] flex items-center gap-2 bg-[#FAFBFD]" style={{ paddingBottom: isPhone ? "max(env(safe-area-inset-bottom,0px),10px)" : undefined }}>
        <div className="flex-1 min-w-0 text-[12px] font-bold text-[#3A4A66] truncate" data-kp="dirty-count">{dirty ? `저장 안 한 변경 ${Math.max(1, nDirty)}개` : "모두 저장됐어요"}{draftConflict() && <span className="text-[#B42318]"> · 다른 곳에서 저장됨</span>}</div>
        <button type="button" disabled={!dirty || busy} onClick={async () => { if ((await kpConfirm("저장하지 않은 변경을 모두 버릴까요?"))) { discardDraft(); beginDraft(); say("변경을 버렸어요"); } }} className={btn} data-kp="discard">버리기</button>
        <button type="button" disabled={!dirty || busy} onClick={save} className="h-9 px-4 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-black disabled:opacity-40" data-kp="publish">{busy ? "저장 중…" : "저장"}</button>
      </div>
    </div>
  );
}
