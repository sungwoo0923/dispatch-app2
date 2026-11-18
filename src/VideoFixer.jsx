// ======================= src/VideoFixer.jsx =======================
// 🎬 2026-11-18 영상 작업실 › 교육 영상 고치기 — 도움말 센터 교육 영상(1~14편)을 화면에서 바로 고친다
//  · 미리보기: 실제 mp4 를 만든 그림판(public/videos/edit/comp.html)을 그대로 띄워서 진짜 영상과 똑같이 보인다(EditedVideoPlayer)
//  · 고치는 것: 강조 상자 위치 · 크기 · 시간 / 카메라 확대 틀 / 화면이 바뀌는 시각 / 자막 글 · 시간 / 효과 켜기 · 끄기 / 장면 메모
//  · 저장: Firestore siteConfig/videoEdits { ep01: edits, … } (최고관리자만 · 고칠 때마다 자동 저장)
//    → 다음에 영상을 다시 만들 때 반영되고, 도움말 센터는 고친 편을 실시간 재생기로 보여 준다
//  · 계산: src/videoEdits.js (applyEdits · effItem · camAt …)
import React from "react";
import { doc, onSnapshot, setDoc, updateDoc, deleteField } from "firebase/firestore";
import { auth, db } from "./firebase";
import { G, NUM, GOLD_BTN, AdmPanel } from "./adminCenter/admUi";
import { kpConfirm } from "./kpDialog";
import { HELP_VIDEOS } from "./helpVideos";
import { downloadText } from "./videoStudio";
import EditedVideoPlayer, { loadTimeline, fmtT } from "./EditedVideoPlayer";
import {
  applyEdits, listItems, effItem, setItem, setNote, editCount, noteCount,
  camAt, eventAt, camKeyAt, editKey, pageToFrame, WIN, fitCam, SCREEN_W, SCREEN_H, CAM_RATIO,
} from "./videoEdits";

const KIND_LABEL = { hl: "강조 상자", cam: "카메라 확대", ev: "화면 바뀜", cap: "자막", key: "단축키 표시", click: "클릭 물결", panel: "팁 패널" };
const KIND_ORDER = ["ev", "cam", "hl", "click", "key", "panel", "cap"];
const r2 = (v) => Math.round(v * 100) / 100;
const EMPTY = (ep) => ({ ep, items: {}, notes: {} });
const inputCls = "w-full rounded-lg px-2.5 py-1.5 text-[13px] font-bold focus:outline-none";
const inputSty = { background: "rgba(255,255,255,.04)", border: `1px solid ${G.line}`, color: G.ink };
const ghost = { border: `1px solid ${G.line}`, color: G.sub };

// 지금 시각에 보이는 항목인지(꺼진 항목도 "켜져 있었다면" 기준으로)
function isActive(x, t, curEvKey, curCamKey) {
  const e = x.eff;
  switch (x.kind) {
    case "ev": return x.key === curEvKey;
    case "cam": return x.key === curCamKey;
    case "click": return Math.abs(t - e.t) < 0.8;
    case "cap": return t >= e.t0 && t < e.t1;
    default: return t >= e.t0 && t <= e.t1 + 0.3;
  }
}
const itemName = (x) => {
  const it = x.item;
  switch (x.kind) {
    case "hl": return it.name;
    case "cam": return it.kf;
    case "ev": return it.id;
    case "cap": return x.eff.text;
    case "key": return `${it.k} → ${x.eff.text}`;
    case "click": return it.kf;
    case "panel": return it.title;
    default: return "";
  }
};
const startOf = (x) => (x.kind === "cam" ? x.eff.t + x.item.d : x.kind === "ev" ? x.eff.t + 0.3 : x.kind === "click" ? Math.max(0, x.eff.t - 0.1) : x.kind === "cap" ? x.eff.t0 + 0.05 : x.eff.t0 + 0.5);

// ── 끌어서 옮기고 모서리로 크기 바꾸는 틀
function DragRect({ rect, cam, scale, onChange, lockRatio = false, color = "#F3E3BC", label }) {
  const k = scale * (WIN.w / cam[2]); // 페이지 1 = 미리보기 k px
  const [fx, fy] = pageToFrame(cam, rect[0], rect[1]);
  const box = { left: fx * scale, top: fy * scale, width: rect[2] * k, height: rect[3] * k };
  const start = (mode) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const p0 = [e.clientX, e.clientY]; const r0 = rect.slice(); let raf = 0; let last = null;
    const move = (ev) => {
      const dx = (ev.clientX - p0[0]) / k, dy = (ev.clientY - p0[1]) / k;
      let [x, y, w, h] = r0;
      if (mode === "move") { x += dx; y += dy; }
      else {
        if (mode.includes("e")) w = r0[2] + dx; if (mode.includes("w")) { w = r0[2] - dx; x = r0[0] + dx; }
        if (mode.includes("s")) h = r0[3] + dy; if (mode.includes("n")) { h = r0[3] - dy; y = r0[1] + dy; }
        w = Math.max(12, w); h = Math.max(12, h);
        if (lockRatio) { h = w / CAM_RATIO; if (mode.includes("n")) y = r0[1] + r0[3] - h; if (mode.includes("w")) x = r0[0] + r0[2] - w; }
        else { if (mode.includes("w")) x = r0[0] + r0[2] - w; if (mode.includes("n")) y = r0[1] + r0[3] - h; }
      }
      last = [x, y, w, h];
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (last) onChange(last.map((v) => Math.round(v))); });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  };
  const H = 14;
  return (
    <div className="absolute pointer-events-auto" style={{ ...box, border: `2px solid ${color}`, boxShadow: "0 0 0 1px rgba(0,0,0,.5), 0 0 0 9999px rgba(0,0,0,.18)", cursor: "move", touchAction: "none", borderRadius: 4 }}
      onPointerDown={start("move")} onClick={(e) => e.stopPropagation()}>
      {label && <span className={`absolute ${box.top < 26 ? "top-1" : "-top-6"} left-1 px-1.5 py-0.5 rounded text-[11px] font-black whitespace-nowrap pointer-events-none`} style={{ background: color, color: G.goldInk }}>{label}</span>}
      {["nw", "ne", "sw", "se"].map((m) => (
        <span key={m} onPointerDown={start(m)} className="absolute rounded-sm" style={{ width: H, height: H, background: color, border: "2px solid #1A1405", touchAction: "none",
          left: m.includes("w") ? -H / 2 : undefined, right: m.includes("e") ? -H / 2 : undefined, top: m.includes("n") ? -H / 2 : undefined, bottom: m.includes("s") ? -H / 2 : undefined,
          cursor: m === "nw" || m === "se" ? "nwse-resize" : "nesw-resize" }} />
      ))}
    </div>
  );
}

// ── 시각 입력(±0.1초 · 지금 시각으로)
function TimeField({ label, value, onChange, now }) {
  const [txt, setTxt] = React.useState(String(r2(value)));
  React.useEffect(() => { setTxt(String(r2(value))); }, [value]);
  const commit = (v) => { const n = Number(v); if (Number.isFinite(n)) onChange(r2(Math.max(0, n))); };
  return (
    <div>
      <span className="block text-[11.5px] font-extrabold mb-1" style={{ color: G.sub }}>{label}</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => commit(value - 0.1)} className="h-8 px-2 rounded-lg text-[12px] font-black shrink-0" style={ghost}>−0.1</button>
        <input value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={() => commit(txt)} onKeyDown={(e) => { if (e.key === "Enter") commit(txt); }} inputMode="decimal"
          className={`${inputCls} text-center min-w-0`} style={{ ...inputSty, ...NUM }} />
        <button type="button" onClick={() => commit(value + 0.1)} className="h-8 px-2 rounded-lg text-[12px] font-black shrink-0" style={ghost}>+0.1</button>
        <button type="button" onClick={() => commit(now)} className="h-8 px-2 rounded-lg text-[11.5px] font-black whitespace-nowrap shrink-0" style={{ border: `1px solid ${G.goldLine}`, color: G.goldHi }}>지금 시각으로</button>
      </div>
    </div>
  );
}
function OnOff({ on, onChange, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] font-extrabold" style={{ color: G.sub }}>{label}</span>
      <div className="ml-auto inline-flex rounded-lg overflow-hidden" style={{ border: `1px solid ${G.line}` }}>
        {[[true, "켜기"], [false, "끄기"]].map(([v, l]) => (
          <button key={l} type="button" onClick={() => onChange(v)} className="h-8 px-3 text-[12.5px] font-black" style={on === v ? GOLD_BTN : { color: G.sub }}>{l}</button>
        ))}
      </div>
    </div>
  );
}
function RectFields({ r, onChange, fields = ["x", "y", "w", "h"] }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {fields.map((f) => { const i = ["x", "y", "w", "h"].indexOf(f); return (
        <label key={f} className="min-w-0">
          <span className="block text-[10.5px] font-extrabold mb-0.5" style={{ color: G.dim }}>{{ x: "가로 위치", y: "세로 위치", w: "너비", h: "높이" }[f]}</span>
          <input type="number" value={Math.round(r[i])} onChange={(e) => { const n = Number(e.target.value); if (!Number.isFinite(n)) return; const nr = r.slice(); nr[i] = n; onChange(nr); }}
            className={`${inputCls} px-1.5`} style={{ ...inputSty, ...NUM }} />
        </label>
      ); })}
    </div>
  );
}

// ── 장면 막대(재생 위치 · 장면 구간)
function SceneBar({ T, t, onSeek, notes }) {
  const ref = React.useRef(null);
  const total = T?.total || 1;
  const at = (e) => { const r = ref.current.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total; };
  const down = (e) => {
    e.preventDefault(); onSeek(at(e));
    const mv = (ev) => onSeek(at(ev)); const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  return (
    <div ref={ref} onPointerDown={down} className="relative h-10 rounded-lg cursor-pointer select-none" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${G.line}`, touchAction: "none" }}>
      {(T?.segs || []).map((s, i) => (
        <div key={s.id} className="absolute top-1 bottom-1 rounded-md overflow-hidden px-1 text-[10.5px] font-black flex items-start" title={s.say}
          style={{ left: `${(s.t0 / total) * 100}%`, width: `${((s.t1 - s.t0) / total) * 100}%`, background: i % 2 ? "rgba(143,176,240,.22)" : "rgba(215,188,130,.2)", color: G.ink, borderRight: "1px solid rgba(0,0,0,.35)" }}>
          <span className="truncate">{s.id.toUpperCase()}{notes?.[s.id] ? " ●" : ""}</span>
        </div>
      ))}
      {(T?.hls || []).map((h, i) => <div key={i} className="absolute bottom-0.5 h-1 rounded" style={{ left: `${(h.t0 / total) * 100}%`, width: `${Math.max(0.3, ((h.t1 - h.t0) / total) * 100)}%`, background: G.gold }} />)}
      <div className="absolute top-0 bottom-0 w-[2px] pointer-events-none" style={{ left: `${(t / total) * 100}%`, background: "#fff", boxShadow: "0 0 6px #fff" }} />
    </div>
  );
}

export default function VideoFixer() {
  const [ep, setEp] = React.useState("ep01");
  const [base, setBase] = React.useState(null);
  const [baseErr, setBaseErr] = React.useState("");
  const [remote, setRemote] = React.useState(null); // siteConfig/videoEdits 전체
  const [remoteErr, setRemoteErr] = React.useState("");
  const [edits, setEdits] = React.useState(EMPTY("ep01"));
  const [status, setStatus] = React.useState("idle"); // idle | dirty | saving | saved | error
  const [saveErr, setSaveErr] = React.useState("");
  const [t, setT] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [rate, setRate] = React.useState(1);
  const [sel, setSel] = React.useState(null); // key
  const [frameView, setFrameView] = React.useState(true);
  const [playerErr, setPlayerErr] = React.useState("");
  const [retry, setRetry] = React.useState(0);
  const player = React.useRef(null);
  const loadedEp = React.useRef(null);
  const dirtyRef = React.useRef(false);
  const editsRef = React.useRef(edits); editsRef.current = edits;
  const epRef = React.useRef(ep); epRef.current = ep;

  // 저장된 수정 전체(편 고르기 칸 숫자 · 처음 불러오기)
  React.useEffect(() => onSnapshot(doc(db, "siteConfig", "videoEdits"), (s) => { setRemote(s.exists() ? s.data() : {}); setRemoteErr(""); }, (e) => { setRemote({}); setRemoteErr(e?.code === "permission-denied" ? "최고관리자만 볼 수 있어요" : e?.message || "불러오지 못했어요"); }), []);
  // 편을 바꾸면 그 편 타임라인 · 저장된 수정을 불러온다
  React.useEffect(() => {
    let dead = false; setBase(null); setBaseErr(""); setSel(null); setT(0); setPlayerErr("");
    loadTimeline(ep).then((T) => { if (!dead) setBase(T); }).catch((e) => { if (!dead) setBaseErr(e?.message || String(e)); });
    return () => { dead = true; };
  }, [ep]);
  React.useEffect(() => {
    if (!remote || loadedEp.current === ep) return;
    loadedEp.current = ep; dirtyRef.current = false;
    const r = remote[ep]; setEdits(r ? { ...EMPTY(ep), ...r, items: r.items || {}, notes: r.notes || {} } : EMPTY(ep));
    setStatus(r && (editCount(r) || noteCount(r)) ? "saved" : "idle");
  }, [remote, ep]);

  // ── 저장(고칠 때마다 1.2초 뒤 자동)
  const save = React.useCallback(async (epId, e) => {
    const ref = doc(db, "siteConfig", "videoEdits");
    const payload = { ep: epId, items: e.items || {}, notes: e.notes || {}, updatedAt: Date.now(), updatedBy: auth.currentUser?.email || "" };
    setStatus("saving");
    try {
      try { await updateDoc(ref, { [epId]: payload }); } catch (err) { if (err?.code === "not-found") await setDoc(ref, { [epId]: payload }, { merge: true }); else throw err; }
      if (epRef.current === epId && editsRef.current === e) { dirtyRef.current = false; setStatus("saved"); }
      setSaveErr("");
    } catch (err) { setStatus("error"); setSaveErr(err?.code === "permission-denied" ? "최고관리자만 저장할 수 있어요" : err?.message || String(err)); }
  }, []);
  React.useEffect(() => {
    if (!dirtyRef.current) return undefined;
    const id = setTimeout(() => save(ep, edits), 1200);
    return () => clearTimeout(id);
  }, [edits, ep, save]);
  const change = (fn) => { dirtyRef.current = true; setStatus("dirty"); setEdits((e) => fn(e)); };
  const pickEp = (id) => {
    if (id === ep) return;
    if (dirtyRef.current) save(ep, editsRef.current); // 다른 편으로 가기 전에 바로 저장
    player.current?.pause(); setEp(id);
  };

  const applied = React.useMemo(() => (base ? applyEdits(base, edits) : null), [base, edits]);
  const all = React.useMemo(() => (base ? listItems(base).map((x) => ({ ...x, eff: effItem(base, edits, x.kind, x.item, x.key) })) : []), [base, edits]);
  const byKey = React.useMemo(() => new Map(all.map((x) => [x.key, x])), [all]);
  const selX = sel ? byKey.get(sel) : null;
  const curEv = applied ? eventAt(applied, t) : null;
  const curEvKey = curEv ? editKey("ev", curEv) : "";
  const curCam = applied ? camKeyAt(applied, t) : null;
  const curCamKey = curCam ? editKey("cam", curCam) : "";
  const seg = (base?.segs || []).find((s) => t >= s.t0 && t < s.t1) || null;
  const sceneId = seg ? seg.id : base && base.segs?.length && t < base.segs[0].t0 ? "intro" : "outro";
  const active = all.filter((x) => isActive(x, t, curEvKey, curCamKey)).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const others = seg ? all.filter((x) => x.item.seg === seg.id && x.kind !== "cap" && !active.includes(x)).sort((a, b) => (a.eff.t0 ?? 0) - (b.eff.t0 ?? 0)) : [];

  // 카메라 틀을 고칠 때는 화면 전체를 보여 주고 그 위에 틀을 그린다
  const camEdit = selX?.kind === "cam" && frameView;
  const camSy = camEdit ? (eventAt(applied, selX.eff.t + 0.01)?.sy || 0) : 0;
  const previewT = React.useMemo(() => {
    if (!applied || !camEdit) return applied;
    return { ...applied, cams: [{ t: 0, c: [0, camSy, SCREEN_W, SCREEN_H], d: 0.001, seg: "_", kf: "_" }] };
  }, [applied, camEdit, camSy]);

  const seek = (v) => { player.current?.seek(v); setT(v); };
  const step = (d) => { player.current?.pause(); seek(Math.max(0, r2(t + d))); };
  const choose = (x) => {
    setSel(x.key); if (x.kind === "cam") setFrameView(true);
    if (!isActive(x, t, curEvKey, curCamKey)) { player.current?.pause(); seek(startOf(x)); }
  };
  const patch = (key, p) => change((e) => setItem(e, key, p));
  const resetItem = (key) => change((e) => { const items = { ...(e.items || {}) }; delete items[key]; return { ...e, items }; });
  const resetEp = async () => {
    const ok = await kpConfirm(`${HELP_VIDEOS.find((v) => v.id === ep)?.no}편에서 고친 내용과 메모를 모두 지울까요?\n지우면 원래 영상 그대로 돌아가요.`, { title: "이 편 수정 모두 지우기", okText: "모두 지우기", danger: true });
    if (!ok) return;
    dirtyRef.current = false; setEdits(EMPTY(ep)); setSel(null);
    try { await updateDoc(doc(db, "siteConfig", "videoEdits"), { [ep]: deleteField() }); setStatus("idle"); } catch (err) { if (err?.code === "not-found") setStatus("idle"); else { setStatus("error"); setSaveErr(err?.message || String(err)); } }
  };
  const download = () => downloadText(`교육영상_수정_${ep}.json`, JSON.stringify({ ...edits, ep }, null, 2), "application/json;charset=utf-8");

  // ── 미리보기 위에 겹쳐 그리기
  const overlay = (scale) => {
    if (!previewT) return null;
    const cam = camAt(previewT, t);
    const nodes = [];
    if (camEdit) {
      nodes.push(<DragRect key="cam" rect={selX.eff.c} cam={cam} scale={scale} lockRatio label="카메라가 보여 줄 곳"
        onChange={(r) => patch(selX.key, { c: fitCam(r, camSy) })} />);
    } else {
      for (const x of active) {
        if (x.kind !== "hl" || x.key === sel || x.eff.off) continue;
        const [fx, fy] = pageToFrame(cam, x.eff.b[0], x.eff.b[1]); const k = scale * (WIN.w / cam[2]);
        nodes.push(<button key={x.key} type="button" title={`${x.item.name} 고르기`} onClick={(e) => { e.stopPropagation(); choose(x); }} className="absolute pointer-events-auto hidden sm:block"
          style={{ left: fx * scale, top: fy * scale, width: x.eff.b[2] * k, height: x.eff.b[3] * k, border: "1.5px dashed rgba(243,227,188,.8)", borderRadius: 4 }} />);
      }
      if (selX?.kind === "hl") nodes.push(<DragRect key="hl" rect={selX.eff.b} cam={cam} scale={scale} label={`강조 상자 · ${selX.item.name}`} onChange={(r) => patch(selX.key, { b: r })} />);
    }
    return <div className="absolute inset-0" onClick={() => player.current?.toggle()}>{nodes}</div>;
  };

  const v = HELP_VIDEOS.find((x) => x.id === ep);
  const statusChip = status === "saving" ? ["저장 중…", G.ice] : status === "dirty" ? ["고치는 중 · 곧 저장돼요", G.warn] : status === "error" ? [`저장 못 했어요 · ${saveErr}`, G.bad]
    : status === "saved" ? ["저장됨 · 다음 영상 만들 때 반영돼요", G.ok] : ["아직 고친 곳이 없어요", G.dim];

  return (
    <div className="space-y-3 min-w-0">
      {/* ── 편 고르기 */}
      <div className="flex sm:grid sm:grid-cols-4 xl:grid-cols-7 gap-1.5 overflow-x-auto adm-scroll pb-1" style={{ scrollbarWidth: "none" }}>
        {HELP_VIDEOS.map((x) => {
          const on = x.id === ep; const r = remote?.[x.id]; const n = editCount(r) + noteCount(r);
          return (
            <button key={x.id} type="button" onClick={() => pickEp(x.id)} className="shrink-0 w-[150px] sm:w-auto text-left px-2.5 py-2 rounded-xl min-w-0"
              style={on ? { ...GOLD_BTN, boxShadow: "0 6px 16px rgba(215,188,130,.22)" } : { border: `1px solid ${G.line}`, background: "rgba(255,255,255,.03)", color: G.ink }}>
              <span className="flex items-center gap-1.5"><span className="text-[11px] font-black" style={NUM}>EP{String(x.no).padStart(2, "0")}</span>{n > 0 && <span className="ml-auto text-[10.5px] font-black px-1.5 rounded" style={{ background: on ? "rgba(26,20,5,.15)" : "rgba(215,188,130,.18)", color: on ? G.goldInk : G.goldHi }}>고침 {n}</span>}</span>
              <span className="block text-[12.5px] font-black truncate">{x.title}</span>
            </button>
          );
        })}
      </div>

      {/* ── 머리줄 */}
      <section className="adm-hero rounded-[20px] px-4 sm:px-5 py-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="text-[10.5px] font-extrabold tracking-[0.3em]" style={{ ...NUM, color: G.gold }}>EP{String(v?.no || 0).padStart(2, "0")} · {fmtT(base?.total || 0)} · 교육 영상 고치기</div>
          <div className="text-[19px] font-black text-white truncate">{v?.title}</div>
        </div>
        <span className="px-2.5 py-1 rounded-lg text-[12px] font-black" style={{ border: `1px solid ${statusChip[1]}55`, color: statusChip[1], background: "rgba(255,255,255,.03)" }}>{statusChip[0]}</span>
        <div className="sm:ml-auto flex flex-wrap gap-1.5">
          <button type="button" onClick={download} className="adm-btn h-9 px-3 rounded-xl text-[12.5px] font-black">수정 내용 내려받기(JSON)</button>
          <button type="button" onClick={resetEp} disabled={!editCount(edits) && !noteCount(edits)} className="h-9 px-3 rounded-xl text-[12.5px] font-black disabled:opacity-40" style={{ border: "1px solid rgba(255,138,122,.4)", color: G.bad }}>되돌리기(이 편 수정 모두 지우기)</button>
        </div>
        <div className="w-full text-[12px] font-semibold leading-relaxed" style={{ color: G.sub }}>
          영상을 보다가 이상한 곳에서 멈추고 → 오른쪽 목록에서 고칠 것을 눌러요 → 바꾸면 미리보기에 바로 보여요. 고친 내용은 알아서 저장되고, 다음에 영상을 다시 만들 때 들어가요.
          {remoteErr && <b style={{ color: G.bad }}> ({remoteErr})</b>}
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
        {/* ── 왼쪽: 미리보기 · 조작 · 장면 */}
        <div className="min-w-0 space-y-3">
          <AdmPanel bodyClass="p-2.5 sm:p-3">
            {baseErr ? <div className="py-16 text-center text-[13px] font-bold" style={{ color: G.bad }}>{baseErr}</div>
              : playerErr ? (
                <div className="py-16 text-center space-y-2">
                  <div className="text-[13px] font-bold" style={{ color: G.bad }}>미리보기를 못 불러왔어요 · {playerErr}</div>
                  <button type="button" onClick={() => { setPlayerErr(""); setRetry((n) => n + 1); }} className="h-9 px-3 rounded-xl text-[12.5px] font-black" style={GOLD_BTN}>다시 불러오기</button>
                </div>
              ) : !previewT ? <div className="w-full grid place-items-center text-[13px] font-bold" style={{ aspectRatio: "16 / 9", color: G.dim }}>불러오는 중이에요…</div>
              : <EditedVideoPlayer key={`${ep}-${retry}`} ref={player} ep={ep} timeline={previewT} rate={rate} onTime={setT} onPlaying={setPlaying} onError={(e) => setPlayerErr(e?.message || "알 수 없는 오류")} overlay={overlay} rounded="rounded-lg" />}
            {/* 조작 막대 */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => player.current?.toggle()} className="h-9 w-12 rounded-xl text-[14px] font-black" style={GOLD_BTN}>{playing ? "❚❚" : "▶"}</button>
              <button type="button" onClick={() => step(-0.1)} className="h-9 px-2.5 rounded-xl text-[12.5px] font-black" style={ghost}>−0.1초</button>
              <button type="button" onClick={() => step(0.1)} className="h-9 px-2.5 rounded-xl text-[12.5px] font-black" style={ghost}>+0.1초</button>
              <span className="px-2 text-[13px] font-black tabular-nums" style={{ ...NUM, color: G.goldHi }}>{fmtT(t)} <span style={{ color: G.dim }}>/ {fmtT(base?.total || 0)}</span></span>
              <span className="ml-auto inline-flex rounded-lg overflow-hidden" style={{ border: `1px solid ${G.line}` }}>
                {[0.5, 1].map((r) => <button key={r} type="button" onClick={() => setRate(r)} className="h-9 px-3 text-[12.5px] font-black" style={rate === r ? GOLD_BTN : { color: G.sub }}>{r}배</button>)}
              </span>
            </div>
            <div className="mt-2"><SceneBar T={applied || base} t={t} onSeek={(x) => seek(r2(x))} notes={edits.notes} /></div>
            <div className="mt-1.5 text-[11.5px] font-semibold" style={{ color: G.dim }}>막대를 누르거나 끌면 그 시각으로 가요 · 금색 줄은 강조 상자가 나오는 곳이에요</div>
          </AdmPanel>

          <AdmPanel code="SCENES" title="장면" right={<span className="text-[11.5px] font-bold" style={{ color: G.dim }}>누르면 그 장면으로 가요</span>} bodyClass="p-0">
            <div className="max-h-[420px] overflow-y-auto adm-scroll">
              {(base?.segs || []).map((s) => {
                const on = seg?.id === s.id;
                return (
                  <button key={s.id} type="button" onClick={() => { seek(s.t0 + 0.05); }} className="w-full text-left px-4 py-2.5 grid grid-cols-[64px_minmax(0,1fr)] gap-2"
                    style={{ borderBottom: `1px solid ${G.line}`, background: on ? "rgba(215,188,130,.1)" : undefined }}>
                    <span><span className="block text-[13px] font-black" style={{ ...NUM, color: on ? G.goldHi : G.gold }}>{s.id.toUpperCase()}</span><span className="block text-[11px] font-bold" style={{ ...NUM, color: G.dim }}>{fmtT(s.t0)}</span></span>
                    <span className="min-w-0">
                      <span className="block text-[12.5px] leading-relaxed line-clamp-2" style={{ color: G.ink }}>{s.say}</span>
                      {edits.notes?.[s.id] && <span className="block mt-0.5 text-[11.5px] font-bold truncate" style={{ color: G.warn }}>메모 · {edits.notes[s.id]}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </AdmPanel>
        </div>

        {/* ── 오른쪽: 지금 화면에 있는 것 · 고치기 · 메모 */}
        <div className="min-w-0 space-y-3">
          <AdmPanel code="NOW" title={`지금 화면 · ${fmtT(t)}`} right={<span className="text-[11.5px] font-black" style={{ color: G.gold }}>{seg ? seg.id.toUpperCase() : sceneId === "intro" ? "시작 화면" : "마무리"}</span>} bodyClass="p-2">
            {!active.length && <div className="px-2 py-3 text-[12.5px]" style={{ color: G.dim }}>지금은 고칠 것이 없어요. 영상을 조금 옮겨 보세요.</div>}
            <ItemRows list={active} sel={sel} onPick={choose} />
            {!!others.length && (<>
              <div className="px-2 pt-3 pb-1 text-[11.5px] font-extrabold" style={{ color: G.dim }}>이 장면의 다른 것</div>
              <ItemRows list={others} sel={sel} onPick={choose} dim />
            </>)}
          </AdmPanel>

          {selX && (
            <AdmPanel code={KIND_LABEL[selX.kind]} title={itemName(selX)} right={<div className="flex gap-1">
              {selX.eff.edited && <button type="button" onClick={() => resetItem(selX.key)} className="h-7 px-2 rounded-lg text-[11.5px] font-black" style={ghost}>원래대로</button>}
              <button type="button" onClick={() => setSel(null)} className="h-7 px-2 rounded-lg text-[11.5px] font-black" style={ghost}>닫기</button>
            </div>}>
              <SelEditor x={selX} t={t} patch={(p) => patch(selX.key, p)} base={base} frameView={frameView} setFrameView={setFrameView} camSy={camSy} />
            </AdmPanel>
          )}

          <AdmPanel code="MEMO" title="이 장면 문제 메모">
            <textarea value={edits.notes?.[sceneId] || ""} onChange={(e) => { const val = e.target.value; change((ed) => setNote(ed, sceneId, val)); }} rows={3}
              placeholder="예: 강조 상자가 버튼보다 조금 왼쪽에 있어요 · 자막이 말보다 빨리 나와요"
              className="w-full rounded-xl px-3 py-2.5 text-[13px] font-semibold resize-none focus:outline-none" style={inputSty} />
            <div className="mt-1 text-[11.5px] font-semibold" style={{ color: G.dim }}>여기서 못 고치는 문제(말 · 화면 내용 자체)는 메모로 남기면 다음에 영상을 만들 때 같이 고쳐요.</div>
          </AdmPanel>
        </div>
      </div>
    </div>
  );
}

function ItemRows({ list, sel, onPick, dim = false }) {
  return list.map((x) => (
    <button key={x.key} type="button" onClick={() => onPick(x)} className="w-full text-left px-2.5 py-2 rounded-lg flex items-center gap-2 min-w-0"
      style={sel === x.key ? { background: "rgba(215,188,130,.16)", border: "1px solid rgba(215,188,130,.45)" } : { border: "1px solid transparent", opacity: dim ? 0.8 : 1 }}>
      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10.5px] font-black" style={{ background: "rgba(143,176,240,.14)", color: G.iceHi }}>{KIND_LABEL[x.kind]}</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold" style={{ color: x.eff.off ? G.dim : G.ink, textDecoration: x.eff.off ? "line-through" : undefined }}>{itemName(x)}</span>
      {x.eff.off && <span className="shrink-0 text-[10.5px] font-black" style={{ color: G.bad }}>꺼짐</span>}
      {x.eff.edited && !x.eff.off && <span className="shrink-0 text-[10.5px] font-black" style={{ color: G.ok }}>고침</span>}
      <span className="shrink-0 text-[11px] font-bold" style={{ ...NUM, color: G.dim }}>{fmtT(x.eff.t0 ?? x.eff.t ?? 0)}</span>
    </button>
  ));
}

function SelEditor({ x, t, patch, base, frameView, setFrameView, camSy }) {
  const e = x.eff; const it = x.item;
  const times = (
    <div className="grid gap-2">
      <TimeField label="나오는 시각(초)" value={e.t0} now={t} onChange={(v) => patch({ t0: v, ...(v > e.t1 ? { t1: r2(v + 1) } : {}) })} />
      <TimeField label="사라지는 시각(초)" value={e.t1} now={t} onChange={(v) => patch({ t1: Math.max(v, e.t0) })} />
    </div>
  );
  const toggle = (label) => <OnOff label={label} on={!e.off} onChange={(on) => patch({ off: !on })} />;
  const tip = (s) => <div className="text-[12px] font-semibold leading-relaxed" style={{ color: G.dim }}>{s}</div>;
  switch (x.kind) {
    case "hl": return (
      <div className="space-y-3">
        {toggle("강조 상자")}
        {tip("미리보기에서 상자를 끌어서 옮기고, 모서리를 끌어 크기를 바꿔요.")}
        <RectFields r={e.b} onChange={(b) => patch({ b })} />
        {times}
      </div>
    );
    case "cam": return (
      <div className="space-y-3">
        {toggle("카메라 확대")}
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setFrameView(true)} className="flex-1 h-8 rounded-lg text-[12px] font-black" style={frameView ? GOLD_BTN : ghost}>틀 고치기 화면</button>
          <button type="button" onClick={() => setFrameView(false)} className="flex-1 h-8 rounded-lg text-[12px] font-black" style={!frameView ? GOLD_BTN : ghost}>실제 움직임 보기</button>
        </div>
        {tip(frameView ? "틀을 끌어서 옮기고, 모서리를 끌어 크게 · 작게 해요. 틀 안이 영상에 꽉 차게 보여요(화면 비율은 그대로)." : "재생해서 카메라가 어떻게 움직이는지 확인해요.")}
        <RectFields r={e.c} fields={["x", "y", "w"]} onChange={(c) => patch({ c: fitCam(c, camSy) })} />
        <button type="button" onClick={() => patch({ c: [0, camSy, SCREEN_W, SCREEN_H] })} className="w-full h-8 rounded-lg text-[12px] font-black" style={ghost}>확대 없이 화면 전체 보여 주기</button>
        {tip(`카메라는 ${fmtT(e.t)}부터 ${it.d}초 동안 움직여요. 움직이는 시각은 같은 장면의 '화면 바뀜' 시각을 따라가요.`)}
      </div>
    );
    case "ev": {
      const first = base?.events?.[0] && editKey("ev", base.events[0]) === x.key;
      return (
        <div className="space-y-3">
          <TimeField label="화면이 바뀌는 시각(초)" value={e.t} now={t} onChange={(v) => patch({ dt: r2(v - it.t) || null })} />
          {tip(first ? "첫 화면이에요." : "시각을 옮기면 이 화면에서 누르는 클릭 · 카메라 움직임도 같이 옮겨져요. 말보다 화면이 빠르거나 늦을 때 써요.")}
          <div className="text-[11.5px] font-bold" style={{ ...NUM, color: G.dim }}>원래 {fmtT(it.t)} · 화면 파일 {it.file}</div>
        </div>
      );
    }
    case "cap": return (
      <div className="space-y-3">
        {toggle("자막")}
        <textarea value={e.text} onChange={(ev) => patch({ text: ev.target.value === it.text ? null : ev.target.value })} rows={2}
          className="w-full rounded-xl px-3 py-2 text-[13.5px] font-bold resize-none focus:outline-none" style={inputSty} />
        {tip("자막 글만 바뀌고, 목소리는 그대로예요.")}
        {times}
      </div>
    );
    case "key": return (
      <div className="space-y-3">
        {toggle("단축키 표시")}
        <label className="block"><span className="block text-[11.5px] font-extrabold mb-1" style={{ color: G.sub }}>{it.k} 옆 설명</span>
          <input value={e.text} onChange={(ev) => patch({ text: ev.target.value === it.label ? null : ev.target.value })} className={inputCls} style={inputSty} /></label>
        {times}
      </div>
    );
    case "click": return (
      <div className="space-y-3">
        {toggle("클릭 물결")}
        <TimeField label="누르는 시각(초)" value={e.t} now={t} onChange={(v) => patch({ dt: r2(v - (e.t - e.dt)) || null })} />
        {tip("시각을 옮기면 마우스 움직임도 같이 옮겨져요.")}
      </div>
    );
    case "panel": return (
      <div className="space-y-3">
        {toggle("팁 패널")}
        {tip("‘알아두면 좋은 팁’ 상자예요. 화면을 너무 오래 가리면 사라지는 시각을 당겨요.")}
        {times}
      </div>
    );
    default: return null;
  }
}
