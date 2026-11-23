// ======================= src/promo/promoPlayer.js =======================
// ▶ 2026-11-23 영상 편집실 재생기 — 캔버스 미리보기 + 나레이션 · 배경음악(말할 때 자동으로 작아짐) + 영상 파일 만들기(MediaRecorder)
//  화면 · 소리 모두 브라우저 안에서 만든다(서버로 영상을 보내지 않음). 만들기는 영상 길이만큼 실제 시간이 걸린다.
import { timeline, libUrl, isVideoSrc } from "./promoKit";
import { renderFrame } from "./promoRender";
import { synthMusic, toAudioBuffer } from "./promoMusic";

let fontPromise = null;
export function loadPromoFont() {
  if (fontPromise) return fontPromise;
  fontPromise = (async () => {
    try {
      const f = new FontFace("Pretendard", "url(https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/woff2/PretendardVariable.woff2)", { weight: "45 920" });
      document.fonts.add(await f.load());
    } catch (e) { console.warn("Pretendard 글꼴을 못 불러와 기본 글꼴로 그려요", e); }
  })();
  return fontPromise;
}
export const RECORD_TYPES = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
export const pickRecordType = () => (typeof MediaRecorder === "undefined" ? "" : RECORD_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || "");

export class PromoPlayer {
  constructor(canvas, { onTime, onState, onLoad } = {}) {
    this.canvas = canvas; this.g = canvas.getContext("2d");
    this.onTime = onTime || (() => {}); this.onState = onState || (() => {}); this.onLoad = onLoad || (() => {});
    this.A = { imgs: new Map(), vids: new Map(), logo: null, guides: false };
    this.voice = new Map(); this.music = null; this.musicKey = ""; this.t = 0; this.playing = false; this.nodes = []; this.raf = 0; this.P = null; this.tl = { scenes: [], total: 1 };
    const logo = new Image(); logo.onload = () => { this.A.logo = logo; this.draw(); }; logo.src = "/brand/logisweb-mark.svg";
    this.loadingCount = 0;
  }
  get actx() { if (!this._actx) this._actx = new (window.AudioContext || window.webkitAudioContext)(); return this._actx; }
  destroy() { this.pause(); this.A.vids.forEach((v) => { v.pause(); v.removeAttribute("src"); v.load(); }); this._actx?.close?.(); }
  setGuides(on) { this.A.guides = on; this.draw(); }

  setProject(P) {
    this.P = P; this.tl = timeline(P);
    const W = P.format === "wide" ? 1920 : 1080, H = P.format === "wide" ? 1080 : 1920;
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    if (this.t > this.tl.total) this.t = 0;
    this.ensure().catch((e) => console.warn(e));
    if (!this.playing) this.draw();
  }
  musicSpec() {
    const m = this.P.music || {}; const hits = []; let drop = null;
    this.P.scenes.forEach((s, i) => { const st = this.tl.scenes[i]?.start || 0; if (s.transition === "flash" && st > 0.5) hits.push(st); if (s.layout === "logo" && drop == null) drop = st; });
    return { preset: m.preset || "upbeat", bpm: m.bpm || 112, seed: m.seed || 7, seconds: Math.ceil(this.tl.total), hits: m.preset === "cinematic" ? hits.filter((h) => h !== drop) : [], drop, url: m.url || "" };
  }
  async ensure() {
    const P = this.P; const jobs = []; this.loadingCount++; this.onLoad(true);
    for (const s of P.scenes) {
      const src = s.media?.src; if (!src) continue; const url = libUrl(src);
      if (isVideoSrc(url)) {
        const cur = this.A.vids.get(s.id);
        if (!cur || cur.dataset.src !== url) {
          if (cur) { cur.pause(); cur.removeAttribute("src"); }
          const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous"; v.dataset.src = url; v.src = url;
          this.A.vids.set(s.id, v);
          jobs.push(new Promise((r) => { v.addEventListener("loadeddata", () => { v.currentTime = Number(s.media.from) || 0; r(); }, { once: true }); v.addEventListener("error", r, { once: true }); setTimeout(r, 15000); }).then(() => v.addEventListener("seeked", () => { if (!this.playing) this.draw(); })));
        }
      } else if (!this.A.imgs.has(url)) {
        const im = new Image(); im.crossOrigin = "anonymous"; this.A.imgs.set(url, im);
        jobs.push(new Promise((r) => { im.onload = r; im.onerror = r; im.src = url; }));
      }
    }
    const ids = new Set(P.scenes.map((s) => s.id)); [...this.A.vids.keys()].forEach((k) => { if (!ids.has(k)) { this.A.vids.get(k).pause(); this.A.vids.delete(k); } });
    for (const s of P.scenes) {
      const url = s.voice?.url; if (!url || this.voice.has(url)) continue;
      this.voice.set(url, null);
      jobs.push(fetch(url).then((r) => r.arrayBuffer()).then((b) => this.actx.decodeAudioData(b)).then((buf) => this.voice.set(url, buf)).catch((e) => { console.warn("음성 불러오기 실패", url, e); this.voice.delete(url); }));
    }
    jobs.push(this.ensureMusic());
    await Promise.all(jobs).catch(() => {});
    this.loadingCount--; if (!this.loadingCount) this.onLoad(false);
    if (!this.playing) this.draw();
  }
  async ensureMusic() {
    const sp = this.musicSpec(); const preset = sp.preset;
    if (preset === "none") { this.music = null; this.musicKey = "none"; return; }
    const key = preset === "custom" ? `custom|${sp.url}` : JSON.stringify({ ...sp, url: "" });
    if (key === this.musicKey) return;
    this.musicKey = key;
    if (preset === "custom") {
      if (!sp.url) { this.music = null; return; }
      try { const b = await (await fetch(sp.url)).arrayBuffer(); if (this.musicKey === key) this.music = await this.actx.decodeAudioData(b); } catch (e) { console.warn("음악 불러오기 실패", e); this.music = null; }
      return;
    }
    await new Promise((r) => setTimeout(r, 30)); // 화면이 먼저 그려지게
    if (this.musicKey !== key) return;
    this.music = toAudioBuffer(this.actx, synthMusic(sp));
  }
  isReady() { return this.P && this.P.scenes.every((s) => !s.voice?.url || this.voice.get(s.voice.url)) && [...this.A.vids.values()].every((v) => v.readyState >= 2); }

  draw(t = this.t) { if (!this.P) return; renderFrame(this.g, this.P, this.tl, t, this.A); }
  // 영상 파일들을 지금 시간에 맞춘다
  syncVideos(t, playing) {
    const tl = this.tl; const i = Math.max(0, tl.scenes.findIndex((x) => t < x.start + x.dur));
    this.P.scenes.forEach((s, k) => {
      const v = this.A.vids.get(s.id); if (!v) return; const sc = tl.scenes[k]; const m = s.media || {};
      const rate = Math.max(0.25, Math.min(4, Number(m.rate) || 1)); const from = Number(m.from) || 0;
      const dur = v.duration || 1e9; let target = from + Math.max(0, t - sc.start) * rate; target = Math.min(target, dur - 0.05);
      if (k === i && playing) {
        if (v.playbackRate !== rate) v.playbackRate = rate;
        if (target >= dur - 0.06) { if (!v.paused) v.pause(); return; }
        if (v.paused) { v.currentTime = target; v.play().catch(() => {}); } else if (Math.abs(v.currentTime - target) > 0.3) v.currentTime = target;
      } else {
        if (!v.paused) v.pause();
        if (k === i || (k === i + 1 && !playing)) { if (Math.abs(v.currentTime - target) > 0.04) v.currentTime = target; }
        else if (k === i + 1 && sc.start - t < 1.2 && Math.abs(v.currentTime - from) > 0.04) v.currentTime = from; // 다음 장면 첫 화면 준비
      }
    });
  }
  seek(t) { this.t = Math.max(0, Math.min(this.tl.total, t)); if (this.playing) { this.play(this.t); return; } this.syncVideos(this.t, false); this.draw(); this.onTime(this.t); }

  play(from = this.t, { dest = null, speakers = true } = {}) {
    this.stopAudio(); cancelAnimationFrame(this.raf);
    if (from >= this.tl.total - 0.05) from = 0;
    const ac = this.actx; ac.resume?.();
    const base = ac.currentTime + 0.12; const at = (tg) => base + (tg - from);
    const out = [];
    if (speakers) out.push(ac.destination); if (dest) out.push(dest);
    const connect = (n) => out.forEach((o) => n.connect(o));
    const voiceIv = [];
    // 나레이션
    const vg = ac.createGain(); vg.gain.value = Math.max(0, Number(this.P.voiceVol ?? 1)) * 1.4; connect(vg); this.nodes.push(vg);
    this.P.scenes.forEach((s, k) => {
      const buf = s.voice?.url && this.voice.get(s.voice.url); if (!buf) return; const sc = this.tl.scenes[k];
      const a = sc.voiceAt, b = a + buf.duration; voiceIv.push([a, b]); if (b <= from) return;
      const src = ac.createBufferSource(); src.buffer = buf; src.connect(vg);
      src.start(Math.max(base, at(a)), Math.max(0, from - a)); this.nodes.push(src);
    });
    // 배경음악 + 말할 때 작아지기
    if (this.music) {
      const m = this.P.music || {}; const vol = Math.max(0, Math.min(1.5, Number(m.vol ?? 0.45))); const duck = m.duck === false ? 1 : 0.32;
      const mg = ac.createGain(); connect(mg); this.nodes.push(mg);
      // 가까운 말(0.9초 안)은 한 덩어리로 — 그 사이에 음악이 들썩이지 않게
      const iv = []; voiceIv.sort((x, y) => x[0] - y[0]).forEach(([a, b]) => { const l = iv[iv.length - 1]; if (l && a - l[1] < 0.9) l[1] = Math.max(l[1], b); else iv.push([a, b]); });
      const end = this.tl.total; const g = mg.gain;
      const lv = (tg) => (iv.some(([a, b]) => tg >= a - 0.1 && tg <= b + 0.2) ? vol * duck : vol);
      g.setValueAtTime(lv(from), base);
      iv.filter(([, b]) => b + 0.6 > from).forEach(([a, b]) => {
        if (a - 0.3 > from) { g.setValueAtTime(vol, at(a - 0.3)); g.linearRampToValueAtTime(vol * duck, at(a - 0.05)); }
        g.setValueAtTime(vol * duck, at(Math.max(from, b + 0.15))); g.linearRampToValueAtTime(vol, at(Math.max(from + 0.01, b + 0.65)));
      });
      if (end - 1.8 > from) { g.setValueAtTime(lv(end - 1.8), at(end - 1.8)); g.linearRampToValueAtTime(0.0001, at(end)); }
      const src = ac.createBufferSource(); src.buffer = this.music; src.loop = this.P.music?.preset === "custom"; src.connect(mg);
      src.start(base, from % this.music.duration); src.stop(at(end) + 0.05); this.nodes.push(src);
    }
    this.playing = true; this.onState(true);
    const loop = () => {
      if (!this.playing) return;
      const t = Math.max(from, from + (ac.currentTime - base)); this.t = t;
      if (t >= this.tl.total) { this.t = this.tl.total; this.draw(this.tl.total - 0.001); this.pause(); this._done?.(); return; }
      this.syncVideos(t, true); this.draw(t); this.onTime(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stopAudio() { this.nodes.forEach((n) => { try { n.stop?.(); } catch { /* 이미 멈춤 */ } try { n.disconnect(); } catch { /* 무시 */ } }); this.nodes = []; }
  pause() { this.playing = false; cancelAnimationFrame(this.raf); this.stopAudio(); this.A.vids.forEach((v) => v.pause()); this.onState(false); this.onTime(this.t); }

  // 영상 파일 만들기 — 처음부터 끝까지 실제로 재생하면서 녹화한다
  async exportVideo({ onProgress, fps = 30, speakers = false } = {}) {
    const type = pickRecordType(); if (!type) throw new Error("이 브라우저는 영상 만들기를 지원하지 않아요. PC 크롬 · 엣지를 써 주세요.");
    await this.ensure();
    const wait = Date.now(); while (!this.isReady() && Date.now() - wait < 20000) await new Promise((r) => setTimeout(r, 200));
    this.pause(); this.t = 0; this.syncVideos(0, false); this.draw(0);
    const ac = this.actx; await ac.resume?.();
    const dest = ac.createMediaStreamDestination();
    const vs = this.canvas.captureStream(fps);
    const stream = new MediaStream([...vs.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: this.P.format === "wide" ? 12e6 : 10e6, audioBitsPerSecond: 192000 });
    const chunks = []; rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    const off = this.onTime; this.onTime = (t) => { off(t); onProgress?.(t / this.tl.total); };
    rec.start(500);
    await new Promise((r) => setTimeout(r, 150));
    await new Promise((resolve) => { this._done = resolve; this.play(0, { dest, speakers }); });
    this._done = null; this.onTime = off;
    await new Promise((r) => setTimeout(r, 350));
    rec.stop(); await stopped; vs.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: type.split(";")[0] });
    return { blob, mime: type.split(";")[0], ext: type.startsWith("video/mp4") ? "mp4" : "webm" };
  }
  snapshot(t = this.t, type = "image/jpeg") { this.draw(t); return new Promise((r) => this.canvas.toBlob(r, type, 0.92)); }
}
