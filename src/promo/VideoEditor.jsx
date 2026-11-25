// ======================= src/promo/VideoEditor.jsx =======================
// 🎬 2026-11-23 관리자센터 › 홍보 › 영상 편집실 (사용자 요청: 관리자센터에서 글 · 영상을 고치고, 음악 · 목소리를 바꿔 보며 영상을 만들고 바로 올리기)
//  · 목록: 내 영상들 · 새 숏츠 / 새 가로 영상 · AI 대본으로 새로 만들기 · 기본 영상 4편 불러오기 · 복제 · 삭제
//  · 편집: 왼쪽 장면 목록(순서 · 복제 · 삭제 · 추가) / 가운데 미리보기(재생 · 장면으로 이동 · 안전 영역 · 썸네일) / 오른쪽 탭(장면 · 목소리 · 음악 · 화면·자막 · 내보내기·유튜브)
//  · 영상 만들기: 브라우저에서 녹화(mp4 또는 webm) → 내려받기 · 보관함(Storage) 저장 · 유튜브 바로 올리기
//  · 저장: Firestore mktVideos/{id} (자동 저장 · 되돌리기 Ctrl+Z / 다시 Ctrl+Y) · 파일: Storage marketing/
import React from "react";
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { ref as sref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { G, NUM, GOLD_BTN, AdmPanel, AdmEmpty } from "../adminCenter/admUi";
import { kpConfirm } from "../kpDialog";
import { VOICES, STYLES, MUSIC, BGM_LIBRARY, LAYOUTS, TRANSITIONS, THEMES, FRAMES, LIBRARY, libUrl, isVideoSrc, newScene, newProject, timeline, fmtTime, voiceKey, voiceStale, mktCall, wavB64ToBlob, SEED_PROJECTS, uid } from "./promoKit";
import { PromoPlayer, loadPromoFont, pickRecordType } from "./promoPlayer";
import { uploadToYoutube, ytErrorText } from "./youtubeUpload";
import { toSrt, downloadText } from "../videoStudio";

const inp = { background: "rgba(255,255,255,.04)", border: `1px solid ${G.line2}`, color: G.ink };
const lbl = "block text-[11.5px] font-extrabold tracking-[0.04em] mb-1";
const clean = (x) => JSON.parse(JSON.stringify(x, (k, v) => (v === undefined ? null : v)));
const LAYOUT_NAME = Object.fromEntries(LAYOUTS.map(([k, n]) => [k, n]));
const msOf = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0);

function Btn({ gold, children, className = "", small, ...p }) {
  return <button type="button" {...p} className={`${small ? "h-8 px-2.5 text-[12px]" : "h-9 px-3.5 text-[13px]"} rounded-xl font-black whitespace-nowrap disabled:opacity-40 ${className}`} style={gold ? GOLD_BTN : { border: `1px solid ${G.line}`, color: G.ink, background: "rgba(255,255,255,.03)", ...(p.style || {}) }}>{children}</button>;
}
function Field({ label, children, hint }) { return <div className="block mb-3"><span className={lbl} style={{ color: G.dim }}>{label}</span>{children}{hint && <span className="block text-[11px] mt-1" style={{ color: G.dim }}>{hint}</span>}</div>; }
function Text({ value, onChange, rows, ...p }) {
  return rows ? <textarea rows={rows} value={value || ""} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg px-3 py-2 text-[13px] leading-relaxed" style={inp} {...p} />
    : <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full h-9 rounded-lg px-3 text-[13px]" style={inp} {...p} />;
}
function Range({ label, value, min, max, step, onChange, fmt = (v) => v }) {
  return <label className="block mb-3"><span className="flex justify-between text-[11.5px] font-extrabold mb-1" style={{ color: G.dim }}><span>{label}</span><span style={{ ...NUM, color: G.ink }}>{fmt(Number(value))}</span></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#D7BC82]" /></label>;
}
function Pick({ value, onChange, items, cols = 3 }) {
  return <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols},minmax(0,1fr))` }}>{items.map(([k, n, sub]) => (
    <button key={k} type="button" onClick={() => onChange(k)} className="text-left px-2.5 py-2 rounded-lg min-w-0" style={value === k ? { ...GOLD_BTN } : { border: `1px solid ${G.line2}`, color: G.ink, background: "rgba(255,255,255,.02)" }}>
      <span className="block text-[12.5px] font-black truncate">{n}</span>{sub && <span className="block text-[10.5px] font-bold truncate" style={{ opacity: 0.7 }}>{sub}</span>}</button>))}</div>;
}
async function upload(path, blob, type) { const r = sref(storage, path); await uploadBytes(r, blob, { contentType: type || blob.type, cacheControl: "public,max-age=31536000" }); return getDownloadURL(r); }
const useSettings = () => {
  const [s, setS] = React.useState({});
  React.useEffect(() => onSnapshot(doc(db, "siteConfig/mktSettings"), (d) => setS(d.data() || {}), () => {}), []);
  return s;
};

// ───────────── 목록 ─────────────
export default function VideoEditor({ initialId = "" }) {
  const [list, setList] = React.useState(null);
  const [openId, setOpenId] = React.useState(initialId || "");
  const [busy, setBusy] = React.useState("");
  const [ai, setAi] = React.useState(null);
  React.useEffect(() => onSnapshot(query(collection(db, "mktVideos"), orderBy("updatedAt", "desc")), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([])), []);
  React.useEffect(() => { const k = (e) => { if (e.detail?.id) setOpenId(e.detail.id); }; window.addEventListener("kp-open-video", k); return () => window.removeEventListener("kp-open-video", k); }, []);
  const create = async (p) => { const { id: _drop, ...rest } = p; const r = await addDoc(collection(db, "mktVideos"), clean({ ...rest, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })); setOpenId(r.id); };
  const seed = async () => {
    setBusy("기본 영상을 불러오는 중…");
    try { for (const p of SEED_PROJECTS().reverse()) await addDoc(collection(db, "mktVideos"), clean({ ...p, seed: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })); } finally { setBusy(""); }
  };
  if (openId) return <Editor id={openId} onBack={() => setOpenId("")} />;
  if (!list) return <AdmEmpty>영상 목록을 불러오는 중이에요…</AdmEmpty>;
  return (
    <div className="space-y-4">
      <AdmPanel code="VID" title="내 영상" right={<div className="flex flex-wrap gap-2">
        <Btn gold onClick={() => create(newProject("shorts"))}>＋ 새 숏츠(세로)</Btn>
        <Btn onClick={() => create(newProject("wide"))}>＋ 새 가로 영상</Btn>
        <Btn onClick={() => setAi({ topic: "", format: "shorts", seconds: 25, source: "" })}>✨ AI 대본으로 만들기</Btn>
        {!list.some((x) => x.seed) && <Btn onClick={seed} disabled={!!busy}>기본 영상 4편 불러오기</Btn>}
      </div>}>
        {busy && <div className="mb-3 text-[13px]" style={{ color: G.gold }}>{busy}</div>}
        {!list.length ? <div className="py-10 text-center text-[13.5px] leading-relaxed" style={{ color: G.sub }}>아직 영상이 없어요.<br />[기본 영상 4편 불러오기]를 누르면 숏츠 3편과 예고편을 고쳐 쓸 수 있게 넣어 드려요.</div> : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
            {list.map((p) => { const tl = timeline(p); const wide = p.format === "wide"; const stale = (p.scenes || []).filter((s) => voiceStale(p, s)).length; return (
              <div key={p.id} className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${G.line}`, background: G.panel2 }}>
                <button type="button" onClick={() => setOpenId(p.id)} className="block w-full text-left">
                  <div className="relative" style={{ aspectRatio: wide ? "16/9" : "16/12", background: "#0F1A30" }}>
                    {p.thumb ? <img src={p.thumb} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-[34px]">{wide ? "🎞" : "📱"}</div>}
                    <span className="absolute left-2 top-2 text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,.6)", color: "#fff" }}>{wide ? "가로 16:9" : "숏츠 9:16"} · {Math.round(tl.total)}초</span>
                    {p.youtube?.uploads?.length > 0 && <span className="absolute right-2 top-2 text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: "#FF0033", color: "#fff" }}>유튜브 ✓</span>}
                  </div>
                  <div className="p-3"><div className="text-[14px] font-black truncate" style={{ color: G.ink }}>{p.title || "제목 없음"}</div>
                    <div className="text-[11.5px] mt-0.5" style={{ color: G.dim }}>장면 {(p.scenes || []).length}개 · {new Date(msOf(p.updatedAt) || Date.now()).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}{stale ? ` · 음성 ${stale}개 만들기 필요` : ""}</div></div>
                </button>
                <div className="flex gap-1.5 px-3 pb-3">
                  <Btn small onClick={() => create({ ...p, title: `${p.title} (복사)`, seed: false, youtube: { ...(p.youtube || {}), uploads: [] }, renders: [] })}>복제</Btn>
                  <Btn small onClick={async () => { if (await kpConfirm(`"${p.title}" 영상을 지울까요?`)) await deleteDoc(doc(db, "mktVideos", p.id)); }} style={{ color: G.bad }}>삭제</Btn>
                </div>
              </div>); })}
          </div>)}
      </AdmPanel>
      <Tips />
      {ai && <AiScriptModal v={ai} set={setAi} onDone={(p) => { setAi(null); create(p); }} />}
    </div>
  );
}
function Tips() {
  return <AdmPanel code="TIP" title="이렇게 쓰면 돼요"><ol className="list-decimal pl-5 space-y-1.5 text-[13px] leading-relaxed" style={{ color: G.sub }}>
    <li>영상을 열고 왼쪽에서 장면을 고르면 → 오른쪽 [장면] 탭에서 글 · 화면 · 나레이션을 고쳐요. 미리보기가 바로 바뀌어요.</li>
    <li>나레이션 글을 고치면 장면에 "음성 다시 만들기"가 떠요 → [음성 만들기]를 누르면 고른 목소리로 다시 읽어 줘요(Gemini 키 필요 · 홍보 설정).</li>
    <li>[음악] 탭에서 분위기 · 빠르기 · 볼륨을 바꾸고 ▶ 재생으로 들어 봐요. 말할 때는 음악이 저절로 작아져요.</li>
    <li>[음악] 탭 › [무료 음악 보관함]을 누르면 기본 곡 4곡(저작권 걱정 없음)과 올려 둔 곡이 보여요. ▶ 로 미리 듣고 [쓰기]를 누르면 그 곡으로 바뀌어요. [＋ 보관함에 음악 올리기]로 올린 곡은 다른 영상에서도 골라 쓸 수 있어요.</li>
    <li>다 됐으면 [내보내기 · 유튜브] → [영상 만들기]. 영상 길이만큼 걸리고, 그동안 이 창을 띄워 두면 돼요.</li>
    <li>만든 영상은 내려받거나, 보관함에 저장하거나, 유튜브에 바로 올릴 수 있어요.</li>
  </ol></AdmPanel>;
}

// ───────────── AI 대본 ─────────────
const phoneish = (src) => /^(m-|d-|hub-board|hub-take)/.test(String(src || ""));
export function scriptToProject(out, format, title) {
  const p = newProject(format); p.title = out.title || title || p.title;
  p.scenes = (out.scenes || []).map((s) => {
    const sc = newScene(s.layout || "title", { kicker: s.kicker || "", title: s.title || "", sub: s.sub || "", big: s.big || "", items: s.items || [], narration: s.narration || "" });
    if (s.layout === "media") sc.media = { src: LIBRARY.some(([k]) => k === s.media) ? s.media : "real-board.jpg", frame: phoneish(s.media) ? "phone" : "browser", from: 0, rate: isVideoSrc(s.media) ? 1.5 : 1, zoom: 1.1, zoomTo: 1.25, fx: 0.5, fy: 0.3, label: "LogisWeb" };
    if (s.layout === "bubbles" && /엑셀|xlsx/i.test((s.items || []).join(" "))) sc.look = "excel";
    if (s.layout === "bubbles" && /부재중|통화중/.test((s.items || []).join(" "))) sc.look = "call";
    return sc;
  });
  if (!p.scenes.length) p.scenes = newProject(format).scenes;
  return p;
}
function AiScriptModal({ v, set, onDone }) {
  const [busy, setBusy] = React.useState(false); const [err, setErr] = React.useState("");
  const [posts, setPosts] = React.useState([]);
  React.useEffect(() => onSnapshot(query(collection(db, "mktBlog"), orderBy("date", "desc")), (s) => setPosts(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}), []);
  const go = async () => {
    if (!v.topic.trim() && !v.source) { setErr("주제를 적거나 블로그 글을 골라 주세요."); return; }
    setBusy(true); setErr("");
    try { const r = await mktCall("videoScript", { topic: v.topic, format: v.format, seconds: v.seconds, source: v.source }); onDone(scriptToProject(r.out, v.format, v.topic)); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return <Modal title="✨ AI 대본으로 새 영상" onClose={() => set(null)}>
    <Field label="영상 종류"><Pick value={v.format} onChange={(f) => set({ ...v, format: f, seconds: f === "wide" ? 60 : 25 })} items={[["shorts", "숏츠(세로)", "15~45초"], ["wide", "가로 영상", "30초~2분"]]} cols={2} /></Field>
    <Field label="주제" hint="예: 인수증 사진, 카톡으로 다시 보내지 마세요 / 신입 배차 담당자 첫날"><Text value={v.topic} onChange={(x) => set({ ...v, topic: x })} /></Field>
    <Range label="길이(초)" value={v.seconds} min={10} max={v.format === "wide" ? 120 : 60} step={5} onChange={(x) => set({ ...v, seconds: x })} />
    {posts.length > 0 && <Field label="블로그 글로 만들기(선택)"><select value={v.source ? v.postId : ""} onChange={(e) => { const p = posts.find((x) => x.id === e.target.value); set({ ...v, postId: e.target.value, source: p ? `${p.title}\n\n${p.body}` : "", topic: v.topic || p?.title || "" }); }} className="w-full h-9 rounded-lg px-2 text-[13px]" style={inp}><option value="">고르지 않음</option>{posts.map((p) => <option key={p.id} value={p.id}>{p.date} · {p.title}</option>)}</select></Field>}
    {err && <div className="text-[12.5px] mb-2" style={{ color: G.bad }}>{err}</div>}
    <div className="flex justify-end gap-2"><Btn onClick={() => set(null)}>닫기</Btn><Btn gold onClick={go} disabled={busy}>{busy ? "대본 쓰는 중… (20~40초)" : "대본 만들기"}</Btn></div>
  </Modal>;
}
function Modal({ title, children, onClose, wide }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(2,6,14,.72)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
    <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[90vh] overflow-auto rounded-2xl p-5`} style={{ background: G.panel, border: `1px solid ${G.line}` }}>
      <div className="flex items-center justify-between mb-4"><div className="text-[16px] font-black" style={{ color: G.ink }}>{title}</div>{onClose && <button type="button" onClick={onClose} className="text-[20px]" style={{ color: G.dim }}>×</button>}</div>{children}</div></div>;
}

// ───────────── 편집기 ─────────────
function Editor({ id, onBack }) {
  const [P, setP] = React.useState(null);
  const [sel, setSel] = React.useState(0);
  const [tab, setTab] = React.useState("scene");
  const [saved, setSaved] = React.useState("저장됨");
  const [t, setT] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [guides, setGuides] = React.useState(false);
  const [toast, setToast] = React.useState("");
  const [exp, setExp] = React.useState(null);
  const [vbusy, setVbusy] = React.useState("");
  const settings = useSettings();
  const canvasRef = React.useRef(null); const player = React.useRef(null);
  const hist = React.useRef({ past: [], future: [] }); const saveTimer = React.useRef(0); const lastPush = React.useRef(0);
  const say = (m) => { setToast(m); clearTimeout(say.t); say.t = setTimeout(() => setToast(""), Math.max(3200, String(m || "").length * 80)); }; // 긴 안내(유튜브 오류 등)는 읽을 시간만큼 더 띄운다

  React.useEffect(() => { getDoc(doc(db, "mktVideos", id)).then((d) => { if (!d.exists()) { onBack(); return; } const x = d.data(); setP({ ...newProject(x.format), ...x }); }); }, [id, onBack]);
  React.useEffect(() => {
    if (!P || player.current) return undefined;
    const pl = new PromoPlayer(canvasRef.current, { onTime: (x) => setT(x), onState: setPlaying, onLoad: setLoading });
    player.current = pl; pl.setProject(P); pl.seek(Math.min(1.2, pl.tl.total)); loadPromoFont().then(() => pl.draw());
    return undefined;
  }, [P]);
  React.useEffect(() => () => { player.current?.destroy(); player.current = null; }, []);
  React.useEffect(() => { if (P && player.current) player.current.setProject(P); }, [P]);
  React.useEffect(() => { player.current?.setGuides(guides); }, [guides]);
  // 썸네일이 없으면 처음 연 뒤 자료가 다 불러와지면 자동으로 한 장(목록에 보이게)
  const autoThumb = React.useRef(false);
  React.useEffect(() => {
    if (loading || !P || P.thumb || autoThumb.current || !player.current) return;
    autoThumb.current = true;
    const pl = player.current; const t0 = Math.min(1.2, pl.tl.total);
    setTimeout(async () => { try { const b = await pl.snapshot(t0); if (b) { const url = await upload(`marketing/thumbs/${id}-${Date.now()}.jpg`, b, "image/jpeg"); setP((c) => ({ ...c, thumb: url })); await setDoc(doc(db, "mktVideos", id), { thumb: url }, { merge: true }); pl.draw(); } } catch { /* 썸네일은 없어도 됨 */ } }, 1500);
  }, [loading, P, id]);

  const persist = React.useCallback((next) => {
    setSaved("저장 중…"); clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { const { id: _i, createdAt: _c, ...rest } = next; await setDoc(doc(db, "mktVideos", id), clean({ ...rest, updatedAt: serverTimestamp() }), { merge: true }); setSaved("저장됨"); }
      catch (e) { setSaved("저장 실패"); say(`저장 실패: ${e.message}`); }
    }, 900);
  }, [id]);
  const update = React.useCallback((fn, { noHist } = {}) => {
    setP((cur) => {
      const next = typeof fn === "function" ? fn(cur) : { ...cur, ...fn };
      if (!noHist) { const now = Date.now(); if (now - lastPush.current > 700) { hist.current.past.push(JSON.stringify(cur)); if (hist.current.past.length > 60) hist.current.past.shift(); } lastPush.current = now; hist.current.future = []; }
      persist(next); return next;
    });
  }, [persist]);
  const undo = React.useCallback(() => { const h = hist.current; if (!h.past.length) return; setP((cur) => { h.future.push(JSON.stringify(cur)); const prev = JSON.parse(h.past.pop()); persist(prev); return prev; }); }, [persist]);
  const redo = React.useCallback(() => { const h = hist.current; if (!h.future.length) return; setP((cur) => { h.past.push(JSON.stringify(cur)); const nx = JSON.parse(h.future.pop()); persist(nx); return nx; }); }, [persist]);
  React.useEffect(() => {
    const k = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase(); const typing = tag === "input" || tag === "textarea" || tag === "select";
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !typing && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if (mod && !typing && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      if (!typing && e.code === "Space") { e.preventDefault(); const pl = player.current; if (pl) pl.playing ? pl.pause() : pl.play(); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [undo, redo]);

  if (!P) return <AdmEmpty>영상을 여는 중이에요…</AdmEmpty>;
  const tl = timeline(P); const s = P.scenes[sel] || P.scenes[0]; const sc = tl.scenes[sel] || tl.scenes[0];
  const setScene = (patch, i = sel) => update((cur) => ({ ...cur, scenes: cur.scenes.map((x, k) => (k === i ? { ...x, ...(typeof patch === "function" ? patch(x) : patch) } : x)) }));
  const setMedia = (patch) => setScene((x) => ({ media: { ...(x.media || {}), ...patch } }));
  const goScene = (i) => { setSel(i); player.current?.seek((tl.scenes[i]?.start || 0) + 0.6); };
  const move = (i, d) => update((cur) => { const a = [...cur.scenes]; const j = i + d; if (j < 0 || j >= a.length) return cur; [a[i], a[j]] = [a[j], a[i]]; setSel(j); return { ...cur, scenes: a }; });
  const dup = (i) => update((cur) => { const a = [...cur.scenes]; a.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(a[i])), id: uid() }); setSel(i + 1); return { ...cur, scenes: a }; });
  const del = (i) => update((cur) => { if (cur.scenes.length <= 1) return cur; const a = cur.scenes.filter((_, k) => k !== i); setSel(Math.max(0, i - 1)); return { ...cur, scenes: a }; });
  const add = (layout) => update((cur) => { const a = [...cur.scenes]; const at = Math.min(a.length, sel + 1); a.splice(at, 0, newScene(layout)); setSel(at); return { ...cur, scenes: a }; });

  // 음성 만들기
  const makeVoice = async (i, cur = P) => {
    const x = cur.scenes[i]; if (!x?.narration?.trim()) return null;
    const r = await mktCall("tts", { text: x.narration, voice: cur.voice?.name, style: cur.voice?.style });
    const url = await upload(`marketing/voice/${id}/${x.id}-${Date.now()}.wav`, wavB64ToBlob(r.wav), "audio/wav");
    const v = { url, dur: r.dur, key: voiceKey(cur, x) };
    update((c) => ({ ...c, scenes: c.scenes.map((y) => (y.id === x.id ? { ...y, voice: v } : y)) }));
    return v;
  };
  const makeVoices = async (all) => {
    const idx = P.scenes.map((x, i) => [x, i]).filter(([x]) => x.narration?.trim() && (all || voiceStale(P, x))).map(([, i]) => i);
    if (!idx.length) { say("다시 만들 음성이 없어요."); return; }
    try { for (let k = 0; k < idx.length; k++) { setVbusy(`음성 만드는 중 ${k + 1}/${idx.length}`); await makeVoice(idx[k]); } say(`음성 ${idx.length}개를 만들었어요.`); }
    catch (e) { say(e.message); } finally { setVbusy(""); }
  };
  const stale = P.scenes.filter((x) => voiceStale(P, x)).length;
  const saveThumb = async () => { const b = await player.current.snapshot(t); const url = await upload(`marketing/thumbs/${id}-${Date.now()}.jpg`, b, "image/jpeg"); update({ thumb: url }, { noHist: true }); say("지금 화면을 썸네일로 저장했어요."); };

  const W = P.format === "wide"; const tabs = [["scene", "장면"], ["voice", "목소리"], ["music", "음악"], ["look", "화면 · 자막"], ["out", "내보내기 · 유튜브"]];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl p-3" style={{ background: G.panel, border: `1px solid ${G.line}` }}>
        <Btn onClick={onBack}>← 목록</Btn>
        <input value={P.title} onChange={(e) => update({ title: e.target.value })} className="h-9 rounded-lg px-3 text-[14px] font-black min-w-[220px] flex-1" style={inp} />
        <span className="text-[12px] font-bold" style={{ color: saved === "저장됨" ? G.ok : saved === "저장 실패" ? G.bad : G.warn }}>{saved}</span>
        <Btn small onClick={undo} title="되돌리기 Ctrl+Z">↶</Btn><Btn small onClick={redo} title="다시 Ctrl+Y">↷</Btn>
        {stale > 0 && <Btn small onClick={() => makeVoices(false)} disabled={!!vbusy} style={{ color: G.warn, border: `1px solid ${G.warn}` }}>{vbusy || `🎙 음성 ${stale}개 만들기`}</Btn>}
        <Btn gold onClick={() => { setTab("out"); setExp({ step: "ready" }); }}>🎬 영상 만들기</Btn>
      </div>
      <div className="grid gap-3 xl:grid-cols-[250px_minmax(0,1fr)_380px] lg:grid-cols-[230px_minmax(0,1fr)]">
        {/* 장면 목록 */}
        <div className="rounded-2xl p-2.5 space-y-1.5 xl:max-h-[calc(100vh-200px)] overflow-auto" style={{ background: G.panel, border: `1px solid ${G.line}` }}>
          <div className="text-[11.5px] font-extrabold px-1 pb-1" style={{ color: G.dim }}>장면 {P.scenes.length}개 · 전체 <span style={NUM}>{fmtTime(tl.total)}</span></div>
          {P.scenes.map((x, i) => { const on = i === sel; const st = voiceStale(P, x); const cur = t >= tl.scenes[i].start && t < tl.scenes[i].start + tl.scenes[i].dur; return (
            <div key={x.id} className="rounded-xl p-2 cursor-pointer" onClick={() => goScene(i)} style={{ border: `1px solid ${on ? G.gold : G.line2}`, background: on ? "rgba(215,188,130,.08)" : "rgba(255,255,255,.02)" }}>
              <div className="flex items-center gap-1.5"><span className="text-[11px] font-black w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: cur ? G.gold : "rgba(255,255,255,.08)", color: cur ? G.goldInk : G.sub }}>{i + 1}</span>
                <span className="text-[11px] font-extrabold" style={{ color: G.ice }}>{LAYOUT_NAME[x.layout]}</span><span className="ml-auto text-[11px]" style={{ ...NUM, color: G.dim }}>{tl.scenes[i].dur.toFixed(1)}초</span></div>
              <div className="text-[12.5px] font-bold mt-1 line-clamp-2" style={{ color: G.ink }}>{(x.title || x.big || x.narration || "(빈 장면)").replace(/\*\*/g, "")}</div>
              <div className="flex items-center gap-1 mt-1.5">
                <span className="text-[10.5px] font-bold" style={{ color: st ? G.warn : x.voice?.url ? G.ok : G.dim }}>{st ? "⚠ 음성 다시" : x.voice?.url ? "🎙 음성 ✓" : x.narration ? "" : "말 없음"}</span>
                {on && <span className="ml-auto flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="text-[12px] px-1" style={{ color: G.sub }} onClick={() => move(i, -1)} title="위로">↑</button>
                  <button type="button" className="text-[12px] px-1" style={{ color: G.sub }} onClick={() => move(i, 1)} title="아래로">↓</button>
                  <button type="button" className="text-[11px] px-1" style={{ color: G.sub }} onClick={() => dup(i)} title="복제">⧉</button>
                  <button type="button" className="text-[12px] px-1" style={{ color: G.bad }} onClick={() => del(i)} title="삭제">✕</button></span>}
              </div>
            </div>); })}
          <AddScene onAdd={add} />
        </div>
        {/* 미리보기 */}
        <div className="rounded-2xl p-3 min-w-0" style={{ background: G.panel, border: `1px solid ${G.line}` }}>
          <div className="mx-auto relative" style={{ maxWidth: W ? "100%" : 420 }}>
            <canvas ref={canvasRef} width={W ? 1920 : 1080} height={W ? 1080 : 1920} className="w-full rounded-xl block" style={{ background: "#08101F", aspectRatio: W ? "16/9" : "9/16" }} onClick={() => (playing ? player.current.pause() : player.current.play())} />
            {loading && <span className="absolute right-2 top-2 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,.6)", color: "#fff" }}>자료 불러오는 중…</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Btn gold onClick={() => (playing ? player.current.pause() : player.current.play())}>{playing ? "❚❚ 멈춤" : "▶ 재생"}</Btn>
            <Btn small onClick={() => player.current.seek(0)}>⏮ 처음</Btn>
            <Btn small onClick={() => player.current.play(sc.start)}>이 장면부터 ▶</Btn>
            <span className="text-[13px] font-bold" style={{ ...NUM, color: G.ink }}>{fmtTime(t)} / {fmtTime(tl.total)}</span>
            <label className="ml-auto flex items-center gap-1.5 text-[12px] font-bold" style={{ color: G.sub }}><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />{W ? "안내선" : "숏츠 안전 영역"}</label>
            <Btn small onClick={saveThumb}>📸 이 화면을 썸네일로</Btn>
          </div>
          <Timeline tl={tl} P={P} t={t} sel={sel} onSeek={(x) => player.current.seek(x)} onSel={goScene} />
          <div className="text-[11.5px] mt-2" style={{ color: G.dim }}>스페이스바: 재생/멈춤 · 화면 클릭: 재생/멈춤 · 아래 띠를 눌러 원하는 시간으로 이동 · Ctrl+Z 되돌리기</div>
        </div>
        {/* 오른쪽 탭 */}
        <div className="rounded-2xl p-3 lg:col-span-2 xl:col-span-1 xl:max-h-[calc(100vh-200px)] overflow-auto" style={{ background: G.panel, border: `1px solid ${G.line}` }}>
          <div className="flex flex-wrap gap-1 mb-3">{tabs.map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className="h-8 px-2.5 rounded-lg text-[12px] font-black" style={tab === k ? GOLD_BTN : { border: `1px solid ${G.line2}`, color: G.sub }}>{l}</button>)}</div>
          {tab === "scene" && s && <ScenePanel P={P} s={s} sc={sc} setScene={setScene} setMedia={setMedia} makeVoice={() => makeVoice(sel).then(() => say("음성을 만들었어요.")).catch((e) => say(e.message))} say={say} projectId={id} />}
          {tab === "voice" && <VoicePanel P={P} update={update} makeVoices={makeVoices} vbusy={vbusy} say={say} />}
          {tab === "music" && <MusicPanel P={P} update={update} player={player} say={say} projectId={id} />}
          {tab === "look" && <LookPanel P={P} update={update} />}
          {tab === "out" && <OutPanel P={P} update={update} player={player} settings={settings} exp={exp} setExp={setExp} say={say} projectId={id} stale={stale} />}
        </div>
      </div>
      {toast && <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[90] px-4 py-2.5 rounded-xl text-[13px] font-bold" style={{ background: "#1B2B4B", color: "#fff", border: `1px solid ${G.line}` }}>{toast}</div>}
    </div>
  );
}
function AddScene({ onAdd }) {
  const [open, setOpen] = React.useState(false);
  return <div className="pt-1">{open ? <div className="grid gap-1">{LAYOUTS.map(([k, n, sub]) => <button key={k} type="button" onClick={() => { onAdd(k); setOpen(false); }} className="text-left rounded-lg px-2 py-1.5" style={{ border: `1px dashed ${G.line}`, color: G.ink }}><span className="text-[12.5px] font-black">{n}</span><span className="block text-[10.5px]" style={{ color: G.dim }}>{sub}</span></button>)}
    <button type="button" onClick={() => setOpen(false)} className="text-[12px] py-1" style={{ color: G.dim }}>닫기</button></div>
    : <button type="button" onClick={() => setOpen(true)} className="w-full h-9 rounded-xl text-[13px] font-black" style={{ border: `1px dashed ${G.gold}`, color: G.gold }}>＋ 장면 추가</button>}</div>;
}
function Timeline({ tl, P, t, sel, onSeek, onSel }) {
  const ref = React.useRef(null);
  const at = (e) => { const r = ref.current.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * tl.total; };
  return <div className="mt-3 select-none">
    <div ref={ref} className="relative h-14 rounded-lg overflow-hidden cursor-pointer" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${G.line2}` }} onMouseDown={(e) => { onSeek(at(e)); const mv = (ev) => onSeek(at(ev)); const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }; window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up); }}>
      {tl.scenes.map((x, i) => { const s = P.scenes[i]; return <div key={i} className="absolute top-0 bottom-0 border-r" onDoubleClick={() => onSel(i)} style={{ left: `${(x.start / tl.total) * 100}%`, width: `${(x.dur / tl.total) * 100}%`, borderColor: "rgba(0,0,0,.4)", background: i === sel ? "rgba(215,188,130,.22)" : i % 2 ? "rgba(143,176,240,.08)" : "rgba(143,176,240,.14)" }}>
        <div className="text-[10.5px] font-black px-1 pt-0.5 truncate" style={{ color: G.ink }}>{i + 1}. {LAYOUT_NAME[s.layout]}</div>
        {x.voiceDur > 0 && <div className="absolute h-2 rounded-sm" style={{ bottom: 18, left: `${((x.voiceAt - x.start) / x.dur) * 100}%`, width: `${(x.voiceDur / x.dur) * 100}%`, background: G.ok, opacity: 0.8 }} title="나레이션" />}
      </div>; })}
      <div className="absolute left-0 right-0 bottom-1 h-2 rounded-sm mx-0.5" style={{ background: P.music?.preset === "none" ? "transparent" : "linear-gradient(90deg,rgba(215,188,130,.5),rgba(215,188,130,.3))" }} title="배경음악" />
      <div className="absolute top-0 bottom-0 w-[2px]" style={{ left: `${(t / tl.total) * 100}%`, background: "#fff", boxShadow: "0 0 6px #fff" }} />
    </div>
    <div className="flex gap-3 text-[10.5px] mt-1" style={{ color: G.dim }}><span><b style={{ color: G.ok }}>■</b> 나레이션</span><span><b style={{ color: G.gold }}>■</b> 배경음악</span><span>장면 두 번 누르면 그 장면 편집</span></div>
  </div>;
}

// ───── 장면 탭 ─────
function ScenePanel({ P, s, sc, setScene, setMedia, makeVoice, say, projectId }) {
  const [vb, setVb] = React.useState(false); const [up, setUp] = React.useState(""); const [lib, setLib] = React.useState(false);
  const audio = React.useRef(null);
  const st = voiceStale(P, s); const m = s.media || {};
  const uploadMedia = async (f) => {
    if (!f) return; if (!/^(image|video)\//.test(f.type)) { say("사진이나 영상 파일만 올릴 수 있어요."); return; }
    if (f.size > 290 * 1024 * 1024) { say("290MB 이하 파일만 올릴 수 있어요."); return; }
    setUp("올리는 중…"); try { const url = await upload(`marketing/media/${projectId}/${Date.now()}-${f.name.replace(/[^\w.가-힣-]/g, "_")}`, f, f.type); setMedia({ src: url, from: 0 }); say("올렸어요."); } catch (e) { say(`올리기 실패: ${e.message}`); } finally { setUp(""); }
  };
  return <div>
    <Field label="화면 종류"><Pick value={s.layout} onChange={(l) => setScene(l === "media" && !s.media ? { layout: l, media: newScene("media").media } : { layout: l })} items={LAYOUTS} cols={2} /></Field>
    {["title", "media", "points", "bubbles", "count"].includes(s.layout) && <Field label="꼬리표(작은 글자)"><Text value={s.kicker} onChange={(v) => setScene({ kicker: v })} /></Field>}
    {s.layout === "count" && <Field label="큰 숫자" hint="숫자로 시작하면 0부터 올라가요(예: 50건, 2시간, 27통)"><Text value={s.big} onChange={(v) => setScene({ big: v })} /></Field>}
    {s.layout !== "logo" && <Field label="큰 글자" hint="**글자** → 강조 색 · 줄 바꾸기는 Enter"><Text rows={3} value={s.title} onChange={(v) => setScene({ title: v })} /></Field>}
    {s.layout !== "bubbles" && <Field label="작은 설명"><Text value={s.sub} onChange={(v) => setScene({ sub: v })} /></Field>}
    {["bubbles", "points", "media"].includes(s.layout) && <Field label={s.layout === "media" ? "체크 표시(한 줄에 하나)" : s.layout === "points" ? "항목(한 줄에 하나 · 제목 | 설명)" : s.look === "call" ? "전화 목록(이름 | 상태)" : s.look === "excel" ? "엑셀 파일 이름(한 줄에 하나)" : "말풍선(빈 줄로 구분 · 한 말풍선 안 줄바꿈 가능)"}>
      <textarea rows={5} value={s.layout === "bubbles" && s.look === "chat" ? (s.items || []).join("\n\n") : (s.items || []).join("\n")} onChange={(e) => setScene({ items: s.layout === "bubbles" && s.look === "chat" ? e.target.value.split(/\n\s*\n/) : e.target.value.split("\n") })} className="w-full rounded-lg px-3 py-2 text-[13px] leading-relaxed" style={inp} /></Field>}
    {s.layout === "bubbles" && <Field label="모양"><Pick value={s.look || "chat"} onChange={(v) => setScene({ look: v })} items={[["chat", "카톡 말풍선"], ["call", "부재중 전화"], ["excel", "엑셀 창"]]} /></Field>}
    {s.layout === "points" && <Field label="모양"><Pick value={s.look === "chain" ? "chain" : "list"} onChange={(v) => setScene({ look: v })} items={[["list", "번호 목록"], ["chain", "→ 흐름"]]} cols={2} /></Field>}
    {s.layout === "count" && <label className="flex items-center gap-2 text-[12.5px] mb-3" style={{ color: G.sub }}><input type="checkbox" checked={s.hlRed !== false} onChange={(e) => setScene({ hlRed: e.target.checked })} />강조 글자를 빨간색으로(문제 강조)</label>}
    {s.layout === "media" && <div className="rounded-xl p-2.5 mb-3" style={{ border: `1px solid ${G.line2}` }}>
      <div className="flex items-center gap-2 mb-2"><span className="text-[12px] font-black" style={{ color: G.ink }}>실제 화면</span><span className="text-[11.5px] truncate flex-1" style={{ color: G.dim }}>{LIBRARY.find(([k]) => k === m.src)?.[1] || (m.src ? "직접 올린 파일" : "없음")}</span>
        <Btn small onClick={() => setLib(!lib)}>{lib ? "닫기" : "바꾸기"}</Btn>
        <label className="h-8 px-2.5 text-[12px] rounded-xl font-black flex items-center cursor-pointer" style={{ border: `1px solid ${G.line}`, color: G.ink }}>{up || "올리기"}<input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => uploadMedia(e.target.files?.[0])} /></label></div>
      {lib && <div className="grid grid-cols-3 gap-1.5 mb-2 max-h-[260px] overflow-auto">{LIBRARY.map(([k, n]) => <button key={k} type="button" onClick={() => { setMedia({ src: k, from: 0, frame: /^(m-|d-|hub-board|hub-take)/.test(k) ? "phone" : m.frame === "phone" ? "browser" : m.frame || "browser" }); setLib(false); }} className="rounded-lg overflow-hidden text-left" style={{ border: `1px solid ${m.src === k ? G.gold : G.line2}` }}>
        {isVideoSrc(k) ? <video src={libUrl(k)} muted preload="metadata" className="w-full h-14 object-cover bg-black" /> : <img src={libUrl(k)} alt="" className="w-full h-14 object-cover" loading="lazy" />}
        <span className="block text-[10px] font-bold px-1 py-0.5 truncate" style={{ color: G.sub }}>{isVideoSrc(k) ? "🎞 " : ""}{n}</span></button>)}</div>}
      <Field label="테두리"><Pick value={m.frame || "browser"} onChange={(v) => setMedia({ frame: v })} items={FRAMES} cols={4} /></Field>
      {m.frame === "browser" && <Field label="창 위 글자"><Text value={m.label} onChange={(v) => setMedia({ label: v })} /></Field>}
      {isVideoSrc(libUrl(m.src)) && <><Range label="영상 몇 초부터" value={m.from || 0} min={0} max={60} step={0.1} onChange={(v) => setMedia({ from: v })} fmt={(v) => `${v.toFixed(1)}초`} />
        <Range label="영상 속도" value={m.rate || 1} min={0.5} max={4} step={0.1} onChange={(v) => setMedia({ rate: v })} fmt={(v) => `${v.toFixed(1)}배`} /></>}
      <Range label="확대(시작)" value={m.zoom || 1} min={1} max={3} step={0.05} onChange={(v) => setMedia({ zoom: v })} fmt={(v) => `${v.toFixed(2)}배`} />
      <Range label="확대(끝) · 서서히 다가가기" value={m.zoomTo ?? m.zoom ?? 1} min={1} max={3} step={0.05} onChange={(v) => setMedia({ zoomTo: v })} fmt={(v) => `${v.toFixed(2)}배`} />
      <Range label="보여 줄 곳 ←→" value={m.fx ?? 0.5} min={0} max={1} step={0.01} onChange={(v) => setMedia({ fx: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
      <Range label="보여 줄 곳 ↑↓" value={m.fy ?? 0.3} min={0} max={1} step={0.01} onChange={(v) => setMedia({ fy: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
    </div>}
    <div className="rounded-xl p-2.5 mb-3" style={{ border: `1px solid ${st ? G.warn : G.line2}` }}>
      <Field label="나레이션(목소리로 읽을 글)" hint={st ? "글이나 목소리가 바뀌었어요 → [음성 만들기]를 눌러 주세요" : s.voice?.url ? `음성 ${Number(s.voice.dur).toFixed(1)}초 · 장면 길이가 음성에 맞춰져요` : "비워 두면 말 없이 음악만 나와요"}>
        <Text rows={3} value={s.narration} onChange={(v) => setScene({ narration: v })} /></Field>
      <div className="flex flex-wrap gap-1.5">
        <Btn small gold={st} disabled={vb || !s.narration?.trim()} onClick={async () => { setVb(true); try { await makeVoice(); } finally { setVb(false); } }}>{vb ? "만드는 중…" : "🎙 음성 만들기"}</Btn>
        {s.voice?.url && <Btn small onClick={() => { if (audio.current) audio.current.pause(); audio.current = new Audio(s.voice.url); audio.current.play(); }}>▶ 듣기</Btn>}
        {s.voice?.url && <Btn small onClick={() => setScene({ voice: null })} style={{ color: G.bad }}>음성 빼기</Btn>}
      </div>
    </div>
    <Field label="자막(비우면 나레이션 글 그대로)"><Text value={s.caption} onChange={(v) => setScene({ caption: v })} /></Field>
    <Range label={`장면 최소 길이 (지금 ${sc.dur.toFixed(1)}초)`} value={s.dur || 3} min={1} max={15} step={0.1} onChange={(v) => setScene({ dur: v })} fmt={(v) => `${v.toFixed(1)}초`} />
    <Range label="글자 크기" value={s.size || 1} min={0.6} max={1.5} step={0.05} onChange={(v) => setScene({ size: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
    <Field label="들어오는 효과"><Pick value={s.transition || "fade"} onChange={(v) => setScene({ transition: v })} items={TRANSITIONS} cols={5} /></Field>
  </div>;
}

// ───── 목소리 탭 ─────
const sampleCache = {};
function VoicePanel({ P, update, makeVoices, vbusy, say }) {
  const [busy, setBusy] = React.useState(""); const a = React.useRef(null);
  const custom = !STYLES.some(([, v]) => v === P.voice?.style);
  const listen = async (name) => {
    setBusy(name);
    try {
      let url = sampleCache[name];
      if (!url) { try { url = await getDownloadURL(sref(storage, `marketing/voice-samples/${name}.wav`)); } catch { const r = await mktCall("tts", { text: "안녕하세요, 로지스웹입니다. 배차부터 정산까지, 한 화면에서 끝내세요.", voice: name, style: P.voice?.style }); url = await upload(`marketing/voice-samples/${name}.wav`, wavB64ToBlob(r.wav), "audio/wav"); } sampleCache[name] = url; }
      a.current?.pause(); a.current = new Audio(url); a.current.play();
    } catch (e) { say(e.message); } finally { setBusy(""); }
  };
  return <div>
    <div className="text-[12px] mb-2 leading-relaxed" style={{ color: G.sub }}>목소리를 고르면 모든 장면에 적용돼요. 바꾼 뒤 위쪽 [🎙 음성 만들기]로 다시 읽혀요. ▶ 를 누르면 미리 들어 볼 수 있어요.</div>
    <div className="grid grid-cols-2 gap-1.5 mb-4 max-h-[340px] overflow-auto pr-1">{VOICES.map(([n, d]) => { const on = P.voice?.name === n; return (
      <div key={n} className="flex items-center gap-1 rounded-lg px-2 py-1.5" style={on ? GOLD_BTN : { border: `1px solid ${G.line2}`, color: G.ink }}>
        <button type="button" className="flex-1 text-left min-w-0" onClick={() => update((c) => ({ ...c, voice: { ...c.voice, name: n } }))}><span className="block text-[12.5px] font-black truncate">{n}</span><span className="block text-[10.5px] truncate" style={{ opacity: 0.75 }}>{d}</span></button>
        <button type="button" className="text-[13px] px-1" onClick={() => listen(n)} title="미리 듣기">{busy === n ? "…" : "▶"}</button></div>); })}</div>
    <Field label="말투"><Pick value={custom ? "__c" : P.voice?.style} onChange={(v) => update((c) => ({ ...c, voice: { ...c.voice, style: v === "__c" ? (c.voice?.style || "") + " " : v } }))} items={[...STYLES.map(([n, v]) => [v, n]), ["__c", "직접 쓰기"]]} cols={2} /></Field>
    {custom && <Field label="말투 직접 쓰기" hint="예: 시장에서 물건 파는 아저씨처럼 신나게"><Text rows={2} value={P.voice?.style} onChange={(v) => update((c) => ({ ...c, voice: { ...c.voice, style: v } }))} /></Field>}
    <Range label="목소리 크기" value={P.voiceVol ?? 1} min={0} max={2} step={0.05} onChange={(v) => update({ voiceVol: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
    <div className="flex flex-wrap gap-2"><Btn gold onClick={() => makeVoices(false)} disabled={!!vbusy}>{vbusy || "바뀐 장면만 음성 만들기"}</Btn><Btn onClick={() => makeVoices(true)} disabled={!!vbusy}>모든 장면 다시 만들기</Btn></div>
  </div>;
}

// ───── 무료 음악 보관함(기본 곡 + 관리자가 올린 곡) ─────
let libAudio = null;
function MusicLibrary({ m, setM, say }) {
  const [mine, setMine] = React.useState([]); const [playing, setPlaying] = React.useState(""); const [up, setUp] = React.useState("");
  React.useEffect(() => onSnapshot(query(collection(db, "mktMusic"), orderBy("at", "desc")), (s) => setMine(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}), []);
  React.useEffect(() => () => { libAudio?.pause(); }, []);
  const play = (t) => { if (playing === t.url) { libAudio?.pause(); setPlaying(""); return; } libAudio?.pause(); libAudio = new Audio(t.url); libAudio.volume = 0.8; libAudio.play().catch(() => {}); libAudio.onended = () => setPlaying(""); setPlaying(t.url); };
  const use = (t) => { setM({ preset: "custom", url: t.url, name: t.name, lib: t.key || t.id }); say(`배경음악을 [${t.name}]으로 바꿨어요.`); };
  const addMine = async (f) => {
    if (!f) return; if (!/^audio\//.test(f.type)) { say("mp3 · wav 같은 소리 파일만 올릴 수 있어요."); return; }
    setUp("올리는 중…");
    try { const url = await upload(`marketing/music/library/${Date.now()}-${f.name.replace(/[^\w.가-힣-]/g, "_")}`, f, f.type); await addDoc(collection(db, "mktMusic"), { name: f.name.replace(/\.[^.]+$/, ""), url, use: "직접 올린 곡", at: serverTimestamp() }); say("보관함에 추가했어요. 다른 영상에서도 고를 수 있어요."); }
    catch (e) { say(e.message); } finally { setUp(""); }
  };
  const del = async (t) => { if (!(await kpConfirm(`[${t.name}]을 보관함에서 뺄까요?`, { okText: "빼기" }))) return; await deleteDoc(doc(db, "mktMusic", t.id)); if (m.lib === t.id) setM({ preset: "calm", lib: null }); };
  const Row = ({ t, mineRow }) => { const on = m.lib === (t.key || t.id); return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl" style={{ border: `1px solid ${on ? G.gold : G.line2}`, background: on ? "rgba(215,188,130,.08)" : "transparent" }}>
      <button type="button" onClick={() => play(t)} className="w-8 h-8 rounded-full shrink-0 text-[12px] font-black" style={{ border: `1px solid ${G.line}`, color: G.ink }}>{playing === t.url ? "■" : "▶"}</button>
      <div className="min-w-0 flex-1"><div className="text-[12.5px] font-black truncate" style={{ color: G.ink }}>{t.name}</div><div className="text-[11px] truncate" style={{ color: G.dim }}>{t.use}{t.bpm ? ` · ${t.bpm} BPM` : ""}</div></div>
      {on ? <span className="text-[11.5px] font-black shrink-0" style={{ color: G.gold }}>사용 중</span> : <Btn small onClick={() => use(t)}>쓰기</Btn>}
      {mineRow && <button type="button" onClick={() => del(t)} className="text-[11px] shrink-0" style={{ color: G.dim }}>빼기</button>}
    </div>); };
  return <div className="rounded-xl p-2.5 mb-3" style={{ border: `1px solid ${G.line2}` }}>
    <div className="text-[12px] font-black mb-2" style={{ color: G.sub }}>무료 음악 보관함 · ▶ 로 미리 듣고 [쓰기]</div>
    <div className="grid gap-1.5">{BGM_LIBRARY.map((t) => <Row key={t.key} t={t} />)}{mine.map((t) => <Row key={t.id} t={t} mineRow />)}</div>
    <label className="mt-2 inline-flex h-8 px-3 text-[12px] rounded-xl font-black items-center cursor-pointer" style={{ border: `1px solid ${G.line}`, color: G.ink }}>{up || "＋ 보관함에 음악 올리기"}<input type="file" accept="audio/*" className="hidden" onChange={(e) => addMine(e.target.files?.[0])} /></label>
    <div className="text-[11px] mt-2 leading-relaxed" style={{ color: G.dim }}>기본 곡은 이 프로그램이 직접 만든 곡이라 저작권 걱정이 없어요. 유튜브 오디오 보관함 · Pixabay Music 같은 무료 음원을 받아 올리면 모든 영상에서 같이 써요(사용 조건은 각 사이트 안내를 따라 주세요).</div>
  </div>;
}

// ───── 음악 탭 ─────
function MusicPanel({ P, update, player, say, projectId }) {
  const m = P.music || {}; const [up, setUp] = React.useState(""); const [libOpen, setLibOpen] = React.useState(false);
  const setM = (patch) => update((c) => ({ ...c, music: { ...c.music, ...patch } }));
  const uploadMusic = async (f) => {
    if (!f) return; if (!/^audio\//.test(f.type)) { say("mp3 · wav 같은 소리 파일만 올릴 수 있어요."); return; }
    setUp("올리는 중…"); try { const url = await upload(`marketing/music/${projectId}-${Date.now()}-${f.name.replace(/[^\w.가-힣-]/g, "_")}`, f, f.type); setM({ preset: "custom", url, name: f.name }); say("음악을 올렸어요."); } catch (e) { say(e.message); } finally { setUp(""); }
  };
  return <div>
    <Field label="분위기"><Pick value={m.lib ? "library" : (m.preset || "upbeat")} onChange={(v) => { if (v === "library") { setLibOpen(true); return; } setLibOpen(false); const d = MUSIC.find(([k]) => k === v); setM({ preset: v, lib: null, ...(d?.[3] ? { bpm: d[3] } : {}) }); }} items={MUSIC.map(([k, n, sub]) => [k, n, sub])} cols={2} /></Field>
    {(libOpen || m.lib) && <MusicLibrary m={m} setM={setM} say={say} />}
    {m.preset === "custom" && !m.lib && <div className="rounded-xl p-2.5 mb-3" style={{ border: `1px solid ${G.line2}` }}>
      <div className="text-[12px] mb-2" style={{ color: G.sub }}>{m.name ? `지금 음악: ${m.name}` : "음악 파일을 올려 주세요."} 유튜브 오디오 보관함처럼 저작권 걱정 없는 음악을 쓰세요.</div>
      <label className="inline-flex h-8 px-3 text-[12px] rounded-xl font-black items-center cursor-pointer" style={{ border: `1px solid ${G.line}`, color: G.ink }}>{up || "🎵 음악 파일 올리기"}<input type="file" accept="audio/*" className="hidden" onChange={(e) => uploadMusic(e.target.files?.[0])} /></label></div>}
    {!["none", "custom"].includes(m.preset) && <>
      <Range label="빠르기(BPM)" value={m.bpm || 112} min={60} max={150} step={1} onChange={(v) => setM({ bpm: v })} />
      <div className="flex items-center gap-2 mb-3"><Btn small onClick={() => setM({ seed: Math.floor(Math.random() * 9999) + 1 })}>🎲 다른 느낌으로(변주)</Btn><span className="text-[11.5px]" style={{ color: G.dim }}>같은 분위기에서 소리 결을 바꿔요</span></div>
    </>}
    {m.preset !== "none" && <>
      <Range label="음악 크기" value={m.vol ?? 0.45} min={0} max={1.2} step={0.05} onChange={(v) => setM({ vol: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
      <label className="flex items-center gap-2 text-[12.5px] mb-3" style={{ color: G.sub }}><input type="checkbox" checked={m.duck !== false} onChange={(e) => setM({ duck: e.target.checked })} />말할 때 음악을 자동으로 작게(추천)</label>
    </>}
    <Btn gold onClick={() => player.current?.play(0)}>▶ 처음부터 들어 보기</Btn>
    <div className="text-[11.5px] mt-3 leading-relaxed" style={{ color: G.dim }}>기본 음악은 이 프로그램이 직접 합성해서 저작권 걱정이 없어요. 시네마틱은 [로고 등장] 장면에서 쿵 하고 리듬이 시작되고, [번쩍] 효과 장면마다 강조음이 들어가요.</div>
  </div>;
}

// ───── 화면 · 자막 탭 ─────
function LookPanel({ P, update }) {
  const c = P.captions || {};
  const setC = (patch) => update((x) => ({ ...x, captions: { ...x.captions, ...patch } }));
  return <div>
    <Field label="화면 비율"><Pick value={P.format} onChange={(v) => update({ format: v })} items={[["shorts", "세로 9:16", "숏츠 · 릴스 · 틱톡"], ["wide", "가로 16:9", "유튜브 · 홈페이지"]]} cols={2} /></Field>
    <Field label="바탕"><Pick value={P.theme || "navy"} onChange={(v) => update({ theme: v })} items={THEMES} /></Field>
    <Field label="강조 색"><div className="flex flex-wrap gap-1.5 items-center">{["#4F8BFF", "#2BD17E", "#F5A524", "#FF5A5F", "#B57BFF", "#D7BC82"].map((k) => <button key={k} type="button" onClick={() => update({ accent: k })} className="w-8 h-8 rounded-full" style={{ background: k, outline: P.accent === k ? "3px solid #fff" : "none" }} />)}<input type="color" value={P.accent || "#4F8BFF"} onChange={(e) => update({ accent: e.target.value })} className="w-10 h-8" /></div></Field>
    <div className="rounded-xl p-2.5 mb-3" style={{ border: `1px solid ${G.line2}` }}>
      <label className="flex items-center gap-2 text-[13px] font-black mb-2" style={{ color: G.ink }}><input type="checkbox" checked={c.on !== false} onChange={(e) => setC({ on: e.target.checked })} />자막 넣기(소리 끄고 보는 사람용 · 추천)</label>
      {c.on !== false && <><Field label="자막 모양"><Pick value={c.style || "box"} onChange={(v) => setC({ style: v })} items={[["box", "어두운 상자"], ["outline", "테두리 글자"]]} cols={2} /></Field>
        {c.style === "outline" && <Field label="자막 색"><input type="color" value={c.color || "#FFE45C"} onChange={(e) => setC({ color: e.target.value })} /></Field>}
        <Range label="자막 크기" value={c.size || 1} min={0.7} max={1.5} step={0.05} onChange={(v) => setC({ size: v })} fmt={(v) => `${Math.round(v * 100)}%`} /></>}
    </div>
    <label className="flex items-center gap-2 text-[12.5px] mb-3" style={{ color: G.sub }}><input type="checkbox" checked={!!P.watermark} onChange={(e) => update({ watermark: e.target.checked })} />왼쪽 위에 로고 계속 보이기</label>
    <Field label="마무리 버튼 글자"><Text value={P.cta?.button} onChange={(v) => update((x) => ({ ...x, cta: { ...x.cta, button: v } }))} /></Field>
    <Field label="마무리 아래 글자(주소 · 검색어)"><Text value={P.cta?.url} onChange={(v) => update((x) => ({ ...x, cta: { ...x.cta, url: v } }))} /></Field>
  </div>;
}

// ───── 내보내기 · 유튜브 탭 ─────
function OutPanel({ P, update, player, settings, exp, setExp, say, projectId, stale }) {
  const yt = P.youtube || {}; const setY = (patch) => update((x) => ({ ...x, youtube: { ...x.youtube, ...patch } }));
  const [aiBusy, setAiBusy] = React.useState(false);
  const type = pickRecordType();
  const make = async () => {
    setExp({ step: "rec", p: 0 });
    try {
      const r = await player.current.exportVideo({ onProgress: (p) => setExp((e) => (e?.step === "rec" ? { ...e, p } : e)) });
      setExp({ step: "done", ...r, url: URL.createObjectURL(r.blob) });
    } catch (e) { setExp({ step: "error", msg: e.message }); }
  };
  const fileName = () => `${(P.title || "LogisWeb").replace(/[\\/:*?"<>|]/g, "_")}.${exp?.ext || "mp4"}`;
  const saveCloud = async () => {
    setExp((e) => ({ ...e, saving: true }));
    try { const url = await upload(`marketing/renders/${projectId}-${Date.now()}.${exp.ext}`, exp.blob, exp.mime); update((x) => ({ ...x, renders: [{ url, at: Date.now(), ext: exp.ext, size: exp.blob.size }, ...(x.renders || [])].slice(0, 10) }), { noHist: true }); say("보관함에 저장했어요."); }
    catch (e) { say(e.message); } finally { setExp((e) => ({ ...e, saving: false })); }
  };
  const toYoutube = async () => {
    if (!settings.youtubeClientId) { say("홍보 › 홍보 설정 › 유튜브 바로 올리기에서 구글 OAuth 클라이언트 ID를 먼저 넣어 주세요."); return; }
    setExp((e) => ({ ...e, up: 0 }));
    try {
      let thumb = null; if (P.thumb) thumb = await fetch(P.thumb).then((r) => r.blob()).catch(() => null);
      const r = await uploadToYoutube({ clientId: settings.youtubeClientId, blob: exp.blob, meta: { title: yt.title || P.title, description: yt.description, tags: String(yt.tags || "").split(",").map((x) => x.trim()).filter(Boolean), privacy: yt.privacy || "private", shorts: P.format !== "wide" }, thumbnail: thumb, onProgress: (p) => setExp((e) => ({ ...e, up: p })) });
      update((x) => ({ ...x, status: "uploaded", youtube: { ...x.youtube, uploads: [{ id: r.id, url: r.url, at: Date.now(), privacy: r.privacy }, ...(x.youtube?.uploads || [])] } }), { noHist: true });
      setExp((e) => ({ ...e, up: null, yt: r })); say("유튜브에 올렸어요!");
    } catch (e) { setExp((x) => ({ ...x, up: null })); say(ytErrorText(e)); } // 🛠 2026-11-24 구글 오류 코드 → 고칠 곳 안내
  };
  const aiMeta = async () => { setAiBusy(true); try { const r = await mktCall("ytMeta", { title: P.title, format: P.format, text: P.scenes.map((s) => s.narration).filter(Boolean).join("\n") }); setY({ title: r.out.title, description: r.out.description, tags: (r.out.tags || []).join(", ") }); } catch (e) { say(e.message); } finally { setAiBusy(false); } };
  const srt = () => { const tl = timeline(P); const plan = { scenes: P.scenes.map((s, i) => ({ start: tl.scenes[i].voiceDur ? tl.scenes[i].voiceAt : tl.scenes[i].start, end: tl.scenes[i].voiceDur ? tl.scenes[i].voiceAt + tl.scenes[i].voiceDur + 0.15 : tl.scenes[i].start + tl.scenes[i].dur, subtitles: [(s.caption || s.narration || "").trim()].filter(Boolean) })) }; downloadText(`${P.title}.srt`, toSrt(plan.scenes), "application/x-subrip"); };
  return <div>
    <AdmSection title="1. 영상 만들기">
      {stale > 0 && <div className="text-[12px] mb-2" style={{ color: G.warn }}>⚠ 음성을 다시 만들어야 하는 장면이 {stale}개 있어요(예전 음성으로 만들어져요).</div>}
      {!type ? <div className="text-[12.5px]" style={{ color: G.bad }}>이 브라우저는 영상 만들기를 지원하지 않아요. PC 크롬 · 엣지에서 해 주세요.</div> : <>
        <div className="text-[12px] mb-2 leading-relaxed" style={{ color: G.sub }}>영상 길이({Math.round(timeline(P).total)}초)만큼 실제로 재생하며 녹화해요. 그동안 <b>이 탭을 띄워 두세요</b>(다른 탭으로 가면 끊길 수 있어요). 파일 형식: {type.startsWith("video/mp4") ? "MP4" : "WebM(유튜브에 그대로 올라가요)"}</div>
        {(!exp || exp.step === "ready" || exp.step === "error") && <Btn gold onClick={make}>🎬 영상 만들기 시작</Btn>}
        {exp?.step === "error" && <div className="text-[12.5px] mt-2" style={{ color: G.bad }}>{exp.msg}</div>}
        {exp?.step === "rec" && <div><div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.08)" }}><div className="h-full" style={{ width: `${Math.round((exp.p || 0) * 100)}%`, background: G.gold }} /></div><div className="text-[12px] mt-1" style={{ color: G.sub }}>녹화 중 {Math.round((exp.p || 0) * 100)}%. 끝날 때까지 창을 닫거나 다른 탭으로 옮기지 마세요.</div></div>}
        {exp?.step === "done" && <div className="space-y-2">
          <video src={exp.url} controls className="w-full rounded-lg bg-black" style={{ maxHeight: 360 }} />
          <div className="text-[11.5px]" style={{ color: G.dim }}>{(exp.blob.size / 1048576).toFixed(1)}MB · {exp.ext.toUpperCase()}</div>
          <div className="flex flex-wrap gap-1.5"><a href={exp.url} download={fileName()} className="h-9 px-3.5 text-[13px] rounded-xl font-black flex items-center" style={GOLD_BTN}>⬇ 내려받기</a>
            <Btn onClick={saveCloud} disabled={exp.saving}>{exp.saving ? "저장 중…" : "☁ 보관함에 저장"}</Btn><Btn onClick={make}>다시 만들기</Btn></div>
        </div>}
      </>}
      {(P.renders || []).length > 0 && <div className="mt-3"><div className={lbl} style={{ color: G.dim }}>보관함(최근 10개)</div>{P.renders.map((r) => <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="block text-[12px] underline truncate" style={{ color: G.ice }}>{new Date(r.at).toLocaleString("ko-KR")} · {(r.size / 1048576).toFixed(1)}MB {r.ext}</a>)}</div>}
    </AdmSection>
    <AdmSection title="2. 유튜브 정보" right={<Btn small onClick={aiMeta} disabled={aiBusy}>{aiBusy ? "쓰는 중…" : "✨ AI로 쓰기"}</Btn>}>
      <Field label={`제목 (${(yt.title || "").length}/100)`}><Text value={yt.title} onChange={(v) => setY({ title: v })} placeholder={P.title} /></Field>
      <Field label="설명"><Text rows={5} value={yt.description} onChange={(v) => setY({ description: v })} placeholder={"무료 체험 👉 https://www.logisweb.co.kr/?utm_source=youtube#inquiry-form"} /></Field>
      <Field label="태그(쉼표로 구분)"><Text value={yt.tags} onChange={(v) => setY({ tags: v })} /></Field>
      <Field label="공개 범위"><Pick value={yt.privacy || "private"} onChange={(v) => setY({ privacy: v })} items={[["private", "비공개", "나만"], ["unlisted", "일부 공개", "링크 있는 사람"], ["public", "공개", "모두"]]} /></Field>
      <div className="flex flex-wrap gap-1.5"><Btn small onClick={() => { navigator.clipboard?.writeText(`${yt.title || P.title}\n\n${yt.description || ""}\n\n${yt.tags || ""}`); say("제목 · 설명 · 태그를 복사했어요."); }}>📋 복사</Btn><Btn small onClick={srt}>자막 파일(SRT)</Btn></div>
    </AdmSection>
    <AdmSection title="3. 유튜브에 올리기">
      {exp?.step !== "done" ? <div className="text-[12.5px]" style={{ color: G.sub }}>먼저 위에서 [영상 만들기]를 해 주세요.</div> : <>
        {exp.up != null ? <div><div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.08)" }}><div className="h-full" style={{ width: `${Math.round(exp.up * 100)}%`, background: "#FF0033" }} /></div><div className="text-[12px] mt-1" style={{ color: G.sub }}>유튜브로 보내는 중 {Math.round(exp.up * 100)}%</div></div>
          : <div className="flex flex-wrap gap-1.5"><Btn gold onClick={toYoutube} disabled={!settings.youtubeClientId}>▶ 유튜브에 바로 올리기</Btn><a href="https://www.youtube.com/upload" target="_blank" rel="noreferrer" className="h-9 px-3.5 text-[13px] rounded-xl font-black flex items-center" style={{ border: `1px solid ${G.line}`, color: G.ink }}>유튜브 스튜디오 열기</a></div>}
        {!settings.youtubeClientId && <div className="text-[11.5px] mt-2" style={{ color: G.warn }}>바로 올리기는 홍보 › 홍보 설정 › 유튜브 바로 올리기를 마치면 켜져요. 그 전에는 [내려받기]한 뒤 유튜브 스튜디오에서 올리면 돼요.</div>}
        {exp.yt && <div className="text-[12.5px] mt-2" style={{ color: G.ok }}>올라갔어요 → <a href={exp.yt.url} target="_blank" rel="noreferrer" className="underline">{exp.yt.url}</a>{exp.yt.thumbOk === false && P.thumb ? " (썸네일은 채널 인증 후 직접 바꿔 주세요)" : ""}</div>}
        <div className="text-[11px] mt-2 leading-relaxed" style={{ color: G.dim }}>구글 심사를 받기 전에는 유튜브가 API로 올린 영상을 "비공개"로 묶어 둘 수 있어요. 공개가 안 되면 유튜브 스튜디오에서 직접 올려 주세요.</div>
      </>}
      {(yt.uploads || []).length > 0 && <div className="mt-3"><div className={lbl} style={{ color: G.dim }}>올린 기록</div>{yt.uploads.map((u) => <a key={u.id || u.at} href={u.url} target="_blank" rel="noreferrer" className="block text-[12px] underline" style={{ color: G.ice }}>{new Date(u.at).toLocaleString("ko-KR")} · {u.privacy || ""} · {u.url}</a>)}</div>}
    </AdmSection>
  </div>;
}
function AdmSection({ title, right, children }) { return <div className="rounded-xl p-3 mb-3" style={{ border: `1px solid ${G.line2}` }}><div className="flex items-center mb-2"><div className="text-[13px] font-black" style={{ color: G.gold }}>{title}</div><div className="ml-auto">{right}</div></div>{children}</div>; }
