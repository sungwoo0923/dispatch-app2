// ======================= src/EditedVideoPlayer.jsx =======================
// 🎬 2026-11-18 교육 영상을 "실제 영상과 똑같이" 그려 주는 재생기 — 영상 작업실(교육 영상 고치기) · 도움말 센터가 같이 쓴다
//  · 화면: public/videos/edit/comp.html(mp4 를 만들 때 쓴 바로 그 그림판)을 iframe 으로 띄우고 1920x1080 을 칸 크기에 맞춰 줄인다
//  · 소리 · 시계: /videos/epXX.mp4 (목소리 + 음악)를 숨은 <audio> 로 틀고, 그 재생 시각으로 화면을 그린다(타임라인 시각 = mp4 시각)
//  · 타임라인: /videos/edit/epXX/tl.json 에 수정(siteConfig/videoEdits)을 입힌 것(src/videoEdits.js applyEdits)
//  · 어디서든 불러오기에 실패하면 onError → 쓰는 쪽에서 원래 mp4 로 돌아간다
import React from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { applyEdits, hasEdits } from "./videoEdits";

export const COMP_URL = "/videos/edit/comp.html";
export const kfDirOf = (ep) => `/videos/edit/${ep}/kf`;
export const audioSrcOf = (ep) => `/videos/${ep}.mp4`;
const FRAME_W = 1920, FRAME_H = 1080;

const tlCache = {};
export function loadTimeline(ep) {
  if (!tlCache[ep]) {
    tlCache[ep] = fetch(`/videos/edit/${ep}/tl.json`).then((r) => { if (!r.ok) throw new Error(`타임라인을 못 불러왔어요(${r.status})`); return r.json(); })
      .catch((e) => { delete tlCache[ep]; throw e; });
  }
  return tlCache[ep];
}

// siteConfig/videoEdits 한 번만 읽는다(로그인한 사람은 모두 읽기 · 실패하면 원래 mp4)
let editsP = null;
export function loadAllVideoEdits({ fresh = false } = {}) {
  if (!editsP || fresh) {
    editsP = Promise.race([
      getDoc(doc(db, "siteConfig", "videoEdits")).then((s) => (s.exists() ? s.data() : {})),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
    ]).catch(() => ({}));
  }
  return editsP;
}

export const fmtT = (t) => { const s = Math.max(0, Number(t) || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s * 10) % 10)}`; };

/**
 * props: ep · timeline(수정을 입힌 타임라인) · controls(기본 조작 막대) · autoPlay · rate
 *        onTime(t) · onPlaying(bool) · onError(err) · overlay(scale => 노드: 화면 위에 겹쳐 그릴 것)
 * ref : { play, pause, toggle, seek(t), time() }
 */
const EditedVideoPlayer = React.forwardRef(function EditedVideoPlayer({ ep, timeline, controls = false, autoPlay = false, rate = 1, onTime, onPlaying, onError, overlay, className = "", rounded = "rounded-xl" }, ref) {
  const wrapRef = React.useRef(null);
  const frameRef = React.useRef(null);
  const audioRef = React.useRef(null);
  const winRef = React.useRef(null);
  const readyRef = React.useRef(false);
  const busyRef = React.useRef(false);
  const pendRef = React.useRef(null);
  const lastTickRef = React.useRef(0);
  const failedRef = React.useRef(false);
  const cbRef = React.useRef({ onTime, onPlaying, onError });
  cbRef.current = { onTime, onPlaying, onError };
  const [scale, setScale] = React.useState(0.3);
  const [loaded, setLoaded] = React.useState(false); // iframe 준비
  const [ready, setReady] = React.useState(false); // 타임라인까지 준비
  const [playing, setPlaying] = React.useState(false);
  const [t, setT] = React.useState(0);

  const fail = React.useCallback((e) => { if (failedRef.current) return; failedRef.current = true; cbRef.current.onError?.(e); }, []);

  // 칸 크기에 맞춰 1920x1080 을 줄인다
  React.useEffect(() => {
    const el = wrapRef.current; if (!el) return undefined;
    const fit = () => setScale((el.clientWidth || 1) / FRAME_W);
    fit();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit); }
    const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, []);

  const renderAt = React.useCallback(async (time) => {
    if (!readyRef.current || !winRef.current) return;
    if (busyRef.current) { pendRef.current = time; return; }
    busyRef.current = true;
    try { await winRef.current.render(time); } catch (e) { fail(e); }
    busyRef.current = false;
    if (pendRef.current != null) { const p = pendRef.current; pendRef.current = null; renderAt(p); }
  }, [fail]);

  // 그림판 불러오기 — 늦으면 실패로 본다
  React.useEffect(() => {
    const to = setTimeout(() => { if (!readyRef.current) fail(new Error("영상 화면을 불러오지 못했어요")); }, 20000);
    return () => clearTimeout(to);
  }, [fail]);
  const onFrameLoad = () => {
    try {
      const w = frameRef.current?.contentWindow;
      if (!w || typeof w.init !== "function" || typeof w.render !== "function") throw new Error("영상 그림판이 없어요");
      winRef.current = w; setLoaded(true);
    } catch (e) { fail(e); }
  };

  // 타임라인이 바뀌면(수정할 때마다) 다시 넣고 지금 시각을 다시 그린다
  React.useEffect(() => {
    if (!loaded || !timeline) return undefined;
    let dead = false;
    (async () => {
      try {
        await winRef.current.init({ ...timeline, kfDir: kfDirOf(ep) });
        if (dead) return;
        const first = !readyRef.current;
        readyRef.current = true; setReady(true);
        renderAt(audioRef.current?.currentTime || 0);
        if (first && autoPlay) audioRef.current?.play().catch(() => {});
      } catch (e) { if (!dead) fail(e); }
    })();
    return () => { dead = true; };
  }, [loaded, timeline, ep, renderAt, fail, autoPlay]);

  // 재생 중에는 매 프레임 그린다
  React.useEffect(() => {
    if (!playing) return undefined;
    let raf = 0;
    const tick = () => {
      const a = audioRef.current; if (!a) return;
      const now = a.currentTime; renderAt(now);
      const ms = performance.now();
      if (ms - lastTickRef.current > 120) { lastTickRef.current = ms; setT(now); cbRef.current.onTime?.(now); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, renderAt]);

  React.useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate; }, [rate]);

  const total = timeline?.total || 0;
  const seek = React.useCallback((time) => {
    const a = audioRef.current; const v = Math.max(0, Math.min(total || 1e9, Number(time) || 0));
    if (a) { try { a.currentTime = v; } catch { /* 아직 못 옮김 */ } }
    setT(v); cbRef.current.onTime?.(v); renderAt(v);
  }, [renderAt, total]);
  const api = React.useMemo(() => ({
    play: () => audioRef.current?.play().catch(() => {}),
    pause: () => audioRef.current?.pause(),
    toggle: () => { const a = audioRef.current; if (!a) return; if (a.paused) a.play().catch(() => {}); else a.pause(); },
    seek,
    time: () => audioRef.current?.currentTime || 0,
  }), [seek]);
  React.useImperativeHandle(ref, () => api, [api]);

  const setPlay = (v) => { setPlaying(v); cbRef.current.onPlaying?.(v); if (!v) { const now = audioRef.current?.currentTime || 0; setT(now); cbRef.current.onTime?.(now); renderAt(now); } };

  return (
    <div className={`min-w-0 ${className}`}>
      <div ref={wrapRef} className={`relative w-full overflow-hidden bg-[#070D1C] ${rounded}`} style={{ aspectRatio: "16 / 9" }}
        onClick={controls ? api.toggle : undefined}>
        <iframe ref={frameRef} title="교육 영상 화면" src={COMP_URL} onLoad={onFrameLoad} onError={() => fail(new Error("영상 화면을 불러오지 못했어요"))} tabIndex={-1}
          style={{ position: "absolute", left: 0, top: 0, width: FRAME_W, height: FRAME_H, border: 0, transform: `scale(${scale})`, transformOrigin: "0 0", pointerEvents: "none" }} />
        {!ready && <div className="absolute inset-0 grid place-items-center text-[13px] font-bold text-white/60">영상을 불러오는 중이에요…</div>}
        {ready && overlay ? overlay(scale) : null}
        {controls && ready && !playing && (
          <span className="absolute inset-0 grid place-items-center pointer-events-none"><span className="w-16 h-16 rounded-full bg-white/90 grid place-items-center shadow-lg"><svg width="26" height="26" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#0F1A30" /></svg></span></span>
        )}
      </div>
      <audio ref={audioRef} src={audioSrcOf(ep)} preload="auto" className="hidden"
        onPlay={() => setPlay(true)} onPause={() => setPlay(false)} onEnded={() => setPlay(false)}
        onSeeked={() => renderAt(audioRef.current?.currentTime || 0)}
        onError={() => fail(new Error("소리 파일을 못 불러왔어요"))} />
      {controls && (
        <div className="mt-2 flex items-center gap-3 text-white">
          <button type="button" onClick={api.toggle} disabled={!ready} className="h-9 w-12 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black disabled:opacity-50">{playing ? "❚❚" : "▶"}</button>
          <input type="range" min={0} max={total || 1} step={0.1} value={Math.min(t, total || 1)} onChange={(e) => seek(Number(e.target.value))} className="flex-1 min-w-0 accent-[#3D7BFF]" aria-label="재생 위치" />
          <span className="text-[12.5px] font-bold tabular-nums whitespace-nowrap text-white/80">{fmtT(t)} / {fmtT(total)}</span>
        </div>
      )}
    </div>
  );
});
export default EditedVideoPlayer;

// 도움말 센터용 — 이 편에 저장된 수정이 있으면 실시간 그림 재생기, 없거나 실패하면 원래 mp4(fallback)
export function HelpVideoSmart({ v, fallback }) {
  const [mode, setMode] = React.useState("check"); // check | live | mp4
  const [tl, setTl] = React.useState(null);
  React.useEffect(() => {
    let dead = false; setMode("check"); setTl(null);
    (async () => {
      try {
        const all = await loadAllVideoEdits();
        const ed = all?.[v.id];
        if (!hasEdits(ed)) { if (!dead) setMode("mp4"); return; }
        const T = await loadTimeline(v.id);
        if (!dead) { setTl(applyEdits(T, ed)); setMode("live"); }
      } catch { if (!dead) setMode("mp4"); }
    })();
    return () => { dead = true; };
  }, [v.id]);
  if (mode === "mp4") return fallback;
  if (mode === "check") return <div className="w-full aspect-video max-h-[78vh] rounded-xl bg-black" />;
  return <EditedVideoPlayer key={v.id} ep={v.id} timeline={tl} controls autoPlay onError={() => setMode("mp4")} />;
}
