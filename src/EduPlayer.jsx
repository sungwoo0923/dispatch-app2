// ======================= src/EduPlayer.jsx =======================
// 🦺 2026-11-24 안전교육 한 편 듣기 — 영상: 끝까지 보기 → 이수 서명 / 서약서: 끝까지 읽기 → 서명
//  · 영상은 앞으로 건너뛸 수 없다(뒤로 돌려 다시 보기는 된다) · 다른 앱 · 탭으로 가면 멈춘다 · 다시 열면 보던 곳부터
//  · 관리자가 "서약서로 대체"를 허락한 기사는 영상 대신 서약서 서명으로 이수할 수 있다(기록에 mode: "pledge")
//  · 저장은 api(기본: Firestore) — 미리보기 · 테스트는 가짜 api를 넣는다
import React from "react";
import { WATCH_RATIO, watchedEnough, eduPeriod, eduRecordId, eduProgressId, fmtLen, certNo } from "./safetyEdu";
import { EduIcon, EduTile } from "./eduIcons";
import { MONO, HERO_BG } from "./OfficeBooks";
const EN = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };

const NAVY = "#1B2B4B";
const INK = "#0B1428";
const SUB = "#6B7A93";
const LINE = "#E3E8F0";

// Firestore 저장(실제 화면) — 미리보기에서는 쓰지 않도록 필요할 때만 불러온다
export const firestoreEduApi = {
  async loadProgress(uid, courseId) {
    const [{ doc, getDoc }, { db }] = await Promise.all([import("./fsTenant"), import("./firebase")]);
    const s = await getDoc(doc(db, "eduProgress", eduProgressId(uid, courseId))).catch(() => null);
    return s?.exists() ? s.data() : null;
  },
  async saveProgress(uid, courseId, data) {
    const [{ doc, setDoc, serverTimestamp }, { db }] = await Promise.all([import("./fsTenant"), import("./firebase")]);
    await setDoc(doc(db, "eduProgress", eduProgressId(uid, courseId)), { ...data, uid, courseId, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
  },
  async saveRecord(id, data) {
    const [{ doc, setDoc, serverTimestamp }, { db }] = await Promise.all([import("./fsTenant"), import("./firebase")]);
    await setDoc(doc(db, "eduRecords", id), { ...data, signedAt: serverTimestamp() });
  },
};

// 손서명 패드(기사앱 계약서 서명과 같은 모양)
export function EduSignPad({ onChange, height = 150 }) {
  const ref = React.useRef(null);
  const drawing = React.useRef(false);
  const dirty = React.useRef(false);
  React.useEffect(() => {
    const c = ref.current; if (!c) return;
    const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr;
    const g = c.getContext("2d"); g.scale(dpr, dpr); g.lineWidth = 2.6; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = INK;
  }, []);
  const pt = (e) => { const r = ref.current.getBoundingClientRect(); const t = e.touches?.[0] || e; return [t.clientX - r.left, t.clientY - r.top]; };
  const start = (e) => { e.preventDefault(); drawing.current = true; const g = ref.current.getContext("2d"); const [x, y] = pt(e); g.beginPath(); g.moveTo(x, y); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const g = ref.current.getContext("2d"); const [x, y] = pt(e); g.lineTo(x, y); g.stroke(); dirty.current = true; };
  const end = () => { if (!drawing.current) return; drawing.current = false; if (dirty.current) onChange(ref.current.toDataURL("image/png")); };
  const clear = () => { const c = ref.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(""); };
  return (
    <div>
      <canvas ref={ref} onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        className="block w-full rounded-2xl bg-white" style={{ height, border: "1.5px dashed #A9B5C8", touchAction: "none" }} />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[12.5px] font-semibold" style={{ color: SUB }}>네모 칸 안에 손가락(마우스)으로 서명하세요</span>
        <button type="button" onClick={clear} className="h-8 px-3 rounded-lg bg-white text-[13px] font-bold" style={{ border: `1px solid ${LINE}`, color: SUB }}>지우기</button>
      </div>
    </div>
  );
}

const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

function Header({ course, step, onClose, preview = false }) {
  const steps = course.kind === "video" ? ["영상 보기", "이수 서명"] : ["읽기", "서명"];
  return (<>
    <div className="shrink-0 text-white" style={{ background: HERO_BG }}>
      <div className="px-4 pt-3.5 pb-3 flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0"><EduIcon name={course.icon} size={20} /></span>
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] font-extrabold tracking-[0.1em] text-[#8FB0F0]" style={EN}>{course.code} · {course.kind === "video" ? `VIDEO ${fmtLen(course)}` : "E-DOCUMENT"}</div>
          <div className="text-[16.5px] font-black truncate">{course.title}</div>
        </div>
        <button type="button" aria-label="닫기" onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
          <EduIcon name="close" size={16} stroke={2.4} />
        </button>
      </div>
    </div>
    {!preview && <div className="shrink-0 px-4 py-2.5 bg-white" style={{ borderBottom: `1px solid ${LINE}` }}>
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            {i > 0 && <div className="flex-1 h-px" style={{ background: LINE }} />}
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full text-[11px] font-black flex items-center justify-center"
                style={i < step ? { background: NAVY, color: "#fff" } : i === step ? { border: `1.5px solid ${NAVY}`, color: NAVY } : { border: `1.5px solid ${LINE}`, color: "#A9B5C8" }}>
                {i < step ? <EduIcon name="check" size={12} stroke={3} /> : i + 1}
              </span>
              <span className="text-[12.5px] font-bold" style={{ color: i <= step ? INK : "#A9B5C8" }}>{s}</span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>}
  </>);
}

// 영상 보기 — 앞으로 건너뛰기 막기 + 실제로 본 시간 세기
function VideoStep({ course, user, api, mayPledge, onNext, onPledge, preview = false }) {
  const vRef = React.useRef(null);
  const maxRef = React.useRef(0);       // 지금까지 도달한 가장 먼 위치(그 앞은 다시 보기 가능)
  const watchedRef = React.useRef(0);   // 실제로 본 초(건너뛴 부분 제외)
  const lastT = React.useRef(0);
  const [t, setT] = React.useState(0);
  const [dur, setDur] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [watched, setWatched] = React.useState(0);
  const [notice, setNotice] = React.useState("");
  const saveTimer = React.useRef(0);

  React.useEffect(() => { // 보던 곳부터
    let alive = true;
    api.loadProgress?.(user.uid, course.id).then((p) => {
      if (!alive || !p) return;
      maxRef.current = Number(p.maxSec) || 0; watchedRef.current = Number(p.watchedSec) || 0; setWatched(watchedRef.current);
      const v = vRef.current; if (v && maxRef.current > 0) { const go = () => { v.currentTime = Math.min(maxRef.current, (v.duration || maxRef.current) - 0.5); lastT.current = v.currentTime; }; if (v.readyState >= 1) go(); else v.addEventListener("loadedmetadata", go, { once: true }); }
    }).catch(() => {});
    return () => { alive = false; };
  }, [course.id, user.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { // 다른 앱 · 탭으로 가면 멈춤
    const h = () => { if (document.hidden) vRef.current?.pause(); };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);

  const persist = React.useCallback((force) => {
    const now = Date.now();
    if (!force && now - saveTimer.current < 5000) return;
    saveTimer.current = now;
    api.saveProgress?.(user.uid, course.id, { maxSec: Math.floor(maxRef.current), watchedSec: Math.floor(watchedRef.current), durationSec: Math.floor(dur || 0), companyName: user.companyName || "" });
  }, [api, user.uid, user.companyName, course.id, dur]);

  const onTime = () => {
    const v = vRef.current; if (!v) return;
    const cur = v.currentTime;
    if (!preview && cur > maxRef.current + 1.5) { // 앞으로 건너뛰기 → 되돌림(미리 보기는 자유롭게)
      v.currentTime = maxRef.current; lastT.current = maxRef.current; setNotice("처음 보는 부분은 건너뛸 수 없어요"); setTimeout(() => setNotice(""), 2200); return;
    }
    const step = cur - lastT.current;
    if (step > 0 && step < 1.5 && cur > maxRef.current - 0.01) { watchedRef.current += step; setWatched(watchedRef.current); }
    if (cur > maxRef.current) maxRef.current = cur;
    lastT.current = cur; setT(cur); persist(false);
  };
  const toggle = () => { const v = vRef.current; if (!v) return; if (v.paused) v.play().catch(() => {}); else v.pause(); };
  // ⛶ 전체 화면 — 모니터 전체로(영상 + 아래 조작 막대 함께) · 아이폰은 기본 전체 화면 플레이어
  const wrapRef = React.useRef(null);
  const [fs, setFs] = React.useState(false);
  const [idle, setIdle] = React.useState(false);
  const idleT = React.useRef(0);
  React.useEffect(() => {
    const h = () => setFs(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", h); document.addEventListener("webkitfullscreenchange", h);
    return () => { document.removeEventListener("fullscreenchange", h); document.removeEventListener("webkitfullscreenchange", h); };
  }, []);
  const toggleFs = () => {
    const el = wrapRef.current, v = vRef.current; if (!el) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); return; }
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (v?.webkitEnterFullscreen) v.webkitEnterFullscreen(); // 아이폰
  };
  const poke = () => { setIdle(false); clearTimeout(idleT.current); idleT.current = setTimeout(() => setIdle(true), 2500); };
  React.useEffect(() => () => clearTimeout(idleT.current), []);
  const back10 = () => { const v = vRef.current; if (!v) return; v.currentTime = Math.max(0, v.currentTime - 10); lastT.current = v.currentTime; };
  const done = watchedEnough(watched, dur) || (dur > 0 && maxRef.current >= dur - 0.6 && watched >= dur * WATCH_RATIO);
  const pct = dur ? Math.min(100, (watched / dur) * 100) : 0;
  const playedPct = dur ? Math.min(100, (t / dur) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-6 lg:py-5 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5 lg:items-start" style={{ background: "#F6F8FB" }}>
      <div className="min-w-0">
      <div ref={wrapRef} onMouseMove={fs ? poke : undefined} onDoubleClick={toggleFs} className={`relative overflow-hidden bg-black ${fs ? "w-screen h-screen" : "rounded-2xl"}`} style={fs ? { cursor: idle && playing ? "none" : "default" } : { aspectRatio: "16 / 9" }}>
        <video ref={vRef} src={course.video} playsInline preload="metadata" className="w-full h-full block" style={{ objectFit: "contain" }}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)} onTimeUpdate={onTime}
          onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); persist(true); }} onEnded={() => { setPlaying(false); maxRef.current = dur; persist(true); }}
          onSeeking={(e) => { if (!preview && e.currentTarget.currentTime > maxRef.current + 1.5) { e.currentTarget.currentTime = maxRef.current; lastT.current = maxRef.current; setNotice("처음 보는 부분은 건너뛸 수 없어요"); setTimeout(() => setNotice(""), 2200); } }}
          onClick={toggle} controlsList="nodownload noplaybackrate" disablePictureInPicture />
        {!playing && (
          <button type="button" onClick={toggle} className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(11,20,40,0.35)" }}>
            <span className="w-16 h-16 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
              <EduIcon name="play" size={26} style={{ color: NAVY, marginLeft: 3 }} />
            </span>
          </button>
        )}
        {!fs && (
          <button type="button" onClick={toggleFs} title="전체 화면(두 번 눌러도 돼요)" className="absolute right-3 bottom-3 w-9 h-9 rounded-lg flex items-center justify-center text-white" style={{ background: "rgba(11,20,40,.55)" }}>
            <EduIcon name="expand" size={17} stroke={2.2} />
          </button>
        )}
        {fs && (
          <div className="absolute inset-x-0 bottom-0 px-6 pb-4 pt-10 flex items-center gap-3 transition-opacity duration-300" style={{ background: "linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.65))", opacity: idle && playing ? 0 : 1 }}>
            <button type="button" onClick={toggle} className="w-11 h-11 rounded-full bg-white flex items-center justify-center shrink-0"><EduIcon name={playing ? "pause" : "play"} size={18} style={{ color: NAVY, marginLeft: playing ? 0 : 2 }} /></button>
            <button type="button" onClick={back10} className="h-10 px-3 rounded-lg text-[13px] font-bold text-white inline-flex items-center gap-1 shrink-0" style={{ background: "rgba(255,255,255,.14)" }}><EduIcon name="replay" size={15} />10초</button>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.25)" }}><div className="h-full rounded-full bg-white" style={{ width: `${playedPct}%` }} /></div>
            <span className="text-[13px] font-bold text-white/85 tabular-nums shrink-0" style={EN}>{fmt(t)} / {fmt(dur)}</span>
            <button type="button" onClick={toggleFs} title="전체 화면 끝내기(Esc)" className="h-10 px-3 rounded-lg text-[13px] font-bold text-white inline-flex items-center gap-1.5 shrink-0" style={{ background: "rgba(255,255,255,.14)" }}><EduIcon name="shrink" size={16} stroke={2.2} />작게 보기</button>
          </div>
        )}
        {notice && <div className={`absolute left-1/2 -translate-x-1/2 ${fs ? "top-6" : "bottom-3"} px-3 py-1.5 rounded-full text-[12.5px] font-bold text-white`} style={{ background: "rgba(11,20,40,0.85)" }}>{notice}</div>}
      </div>
      {/* 재생 막대 — 누르거나 끌어서 옮길 수 없다 */}
      <div className="mt-3 flex items-center gap-2.5">
        <button type="button" onClick={toggle} className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: NAVY }}>
          <EduIcon name={playing ? "pause" : "play"} size={15} />
        </button>
        <button type="button" onClick={back10} className="h-9 px-2.5 rounded-lg bg-white text-[12.5px] font-bold shrink-0 inline-flex items-center gap-1" style={{ border: `1px solid ${LINE}`, color: SUB }}><EduIcon name="replay" size={14} />10초</button>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#DDE3EC" }}>
          <div className="h-full rounded-full" style={{ width: `${playedPct}%`, background: NAVY }} />
        </div>
        <span className="text-[12px] font-bold tabular-nums shrink-0" style={{ ...EN, color: SUB }}>{fmt(t)} / {fmt(dur)}</span>
        <button type="button" onClick={toggleFs} className="h-9 px-2.5 rounded-lg bg-white text-[12.5px] font-bold shrink-0 inline-flex items-center gap-1" style={{ border: `1px solid ${LINE}`, color: SUB }}><EduIcon name="expand" size={14} stroke={2.2} />전체 화면</button>
      </div>
      </div>

      <div className="min-w-0">
      {preview ? (
        <div className="mt-4 lg:mt-0 rounded-2xl bg-white p-4" style={{ border: `1px solid ${LINE}` }}>
          <div className="text-[13.5px] font-extrabold inline-flex items-center gap-1.5" style={{ color: INK }}><EduIcon name="eye" size={15} style={{ color: NAVY }} />미리 보기</div>
          <div className="mt-1.5 text-[12.5px] font-semibold leading-relaxed break-keep" style={{ color: SUB }}>기사님이 받는 교육을 확인하는 화면이에요. 이수 기록은 남지 않고, 자유롭게 앞뒤로 넘겨 볼 수 있어요.</div>
        </div>
      ) : (<>
      <div className="mt-4 lg:mt-0 rounded-2xl bg-white p-4" style={{ border: `1px solid ${LINE}` }}>
        <div className="flex items-center justify-between">
          <span className="text-[13.5px] font-extrabold inline-flex items-center gap-1.5" style={{ color: INK }}><EduIcon name="eye" size={15} style={{ color: NAVY }} />시청 진행</span>
          <span className="text-[14px] font-black tabular-nums" style={{ ...EN, color: done ? NAVY : SUB }}>{Math.floor(pct)}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: "#EEF1F6" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: NAVY }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[["lock", "건너뛰기 불가"], ["replay", "다시 보기 가능"], ["clock", "이어서 보기"]].map(([ic, l]) => (
            <div key={l} className="rounded-xl px-2 py-2.5 flex flex-col items-center gap-1 text-center" style={{ background: "#F6F8FB" }}>
              <EduIcon name={ic} size={16} style={{ color: NAVY }} />
              <span className="text-[11.5px] font-bold leading-tight whitespace-nowrap" style={{ color: SUB }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      <button type="button" disabled={!done} onClick={onNext}
        className="mt-4 w-full h-[52px] rounded-2xl text-[15.5px] font-extrabold text-white disabled:opacity-100"
        style={done ? { background: NAVY } : { background: "#C9D1DE" }}>
        {done ? "이수 서명하기" : `끝까지 보면 서명할 수 있어요 (${Math.floor(pct)}%)`}
      </button>
      {mayPledge && (
        <button type="button" onClick={onPledge} className="mt-2 w-full h-12 rounded-2xl bg-white text-[14px] font-bold" style={{ border: `1px solid ${LINE}`, color: NAVY }}>
          영상 대신 서약서로 이수하기
        </button>
      )}
      </>)}
      {preview && <button type="button" onClick={onNext} className="mt-4 w-full h-[52px] rounded-2xl text-[15.5px] font-extrabold text-white" style={{ background: NAVY }}>미리 보기 닫기</button>}
      </div>
    </div>
  );
}

// 서약서 읽기 — 맨 아래까지 내려야 서명 버튼이 켜진다
function DocStep({ course, onNext, preview = false }) {
  const ref = React.useRef(null);
  const [end, setEnd] = React.useState(false);
  const check = () => { const el = ref.current; if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setEnd(true); };
  React.useEffect(() => { check(); }, []);
  return (
    <>
      <div ref={ref} onScroll={check} className="flex-1 overflow-y-auto px-4 py-4" style={{ background: "#F6F8FB" }}>
        <div className="rounded-2xl bg-white px-5 py-5" style={{ border: `1px solid ${LINE}` }}>
          <div className="text-center text-[18px] font-black tracking-tight" style={{ color: INK }}>{course.title}</div>
          <div className="text-center text-[12px] font-medium mt-1" style={{ color: SUB }}>아래 내용을 끝까지 읽고 서명해 주세요</div>
          {(course.sections || []).map((s, i) => (
            <div key={s.h} className="mt-5">
              <div className="text-[14px] font-extrabold pb-1.5 mb-2" style={{ color: NAVY, borderBottom: `1px solid ${LINE}` }}>{i + 1}. {s.h}</div>
              <ul className="space-y-2">
                {s.items.map((it) => (
                  <li key={it} className="flex gap-2 text-[14px] leading-relaxed" style={{ color: INK }}>
                    <span className="shrink-0 mt-[9px] w-1 h-1 rounded-full" style={{ background: "#8A97AD" }} />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="mt-6 rounded-xl px-4 py-3 text-[13.5px] font-bold leading-relaxed" style={{ background: "#F1F4F9", color: INK }}>{course.pledge}</div>
        </div>
      </div>
      <div className="shrink-0 px-4 py-3 bg-white" style={{ borderTop: `1px solid ${LINE}` }}>
        <button type="button" disabled={!end && !preview} onClick={onNext} className="w-full h-[52px] rounded-2xl text-[15.5px] font-extrabold text-white" style={{ background: end || preview ? NAVY : "#C9D1DE" }}>
          {preview ? "미리 보기 닫기" : end ? "서명하기" : "끝까지 읽으면 서명할 수 있어요 ↓"}
        </button>
      </div>
    </>
  );
}

function SignStep({ course, user, mode, pledgeCourse, busy, onSubmit }) {
  const [img, setImg] = React.useState("");
  const [agree, setAgree] = React.useState(false);
  const text = mode === "pledge" && pledgeCourse ? `${course.title} 교육 내용을 안내받았으며, ${pledgeCourse.pledge}` : course.pledge;
  const today = new Date();
  const ds = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4" style={{ background: "#F6F8FB" }}>
      {mode === "pledge" && (
        <div className="mb-3 rounded-xl px-3.5 py-2.5 text-[12.5px] font-bold" style={{ background: "#EEF1F6", color: NAVY }}>
          <span className="inline-flex items-center gap-1.5"><EduIcon name="pledge" size={14} />관리자 설정으로 영상 대신 서약서 서명으로 이수해요</span>
        </div>
      )}
      <div className="rounded-2xl bg-white p-4" style={{ border: `1px solid ${LINE}` }}>
        <div className="text-[13px] font-extrabold mb-2" style={{ color: SUB }}>이수 확인</div>
        <div className="text-[14.5px] leading-relaxed font-semibold" style={{ color: INK }}>{text}</div>
        <div className="mt-4 grid grid-cols-[72px_1fr] gap-y-1.5 text-[13px]">
          <span className="font-bold" style={{ color: SUB }}>이름</span><span className="font-extrabold" style={{ color: INK }}>{user.name || "-"}</span>
          <span className="font-bold" style={{ color: SUB }}>소속</span><span className="font-semibold" style={{ color: INK }}>{user.companyName || "-"}{user.role === "driver" && user.carNo ? ` · ${user.carNo}` : ""}</span>
          <span className="font-bold" style={{ color: SUB }}>날짜</span><span className="font-semibold" style={{ color: INK }}>{ds}</span>
        </div>
      </div>
      <div className="mt-3 rounded-2xl bg-white p-4" style={{ border: `1px solid ${LINE}` }}>
        <div className="text-[13px] font-extrabold mb-2" style={{ color: SUB }}>서명</div>
        <EduSignPad onChange={setImg} />
      </div>
      <label className="mt-3 flex items-start gap-2.5 px-1 cursor-pointer select-none">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0" style={{ accentColor: NAVY }} />
        <span className="text-[13.5px] font-semibold leading-snug" style={{ color: INK }}>위 내용을 확인했고, 본인이 직접 서명합니다.</span>
      </label>
      <button type="button" disabled={!img || !agree || busy} onClick={() => onSubmit(img)}
        className="mt-4 w-full h-[52px] rounded-2xl text-[15.5px] font-extrabold text-white" style={{ background: img && agree && !busy ? NAVY : "#C9D1DE" }}>
        {busy ? "저장하는 중…" : "서명하고 이수 완료"}
      </button>
    </div>
  );
}

function DoneStep({ course, mode, rec, onClose }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center" style={{ background: "#F6F8FB" }}>
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: NAVY }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </div>
      <div className="mt-4 text-[19px] font-black" style={{ color: INK }}>이수했어요</div>
      <div className="mt-1.5 text-[13.5px] font-medium leading-relaxed" style={{ color: SUB }}>
        {course.title}{mode === "pledge" ? " (서약서로 이수)" : ""}<br />이수 기록이 회사에 전달됐어요.
      </div>
      {rec && (
        <div className="mt-4 inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-white text-[12.5px] font-bold" style={{ border: `1px solid ${LINE}`, color: SUB }}>
          <EduIcon name="cert" size={15} style={{ color: NAVY }} />이수증 번호 <b style={{ ...EN, color: INK }}>{certNo(rec)}</b>
        </div>
      )}
      <button type="button" onClick={onClose} className="mt-6 w-full max-w-[320px] h-12 rounded-2xl text-[15px] font-extrabold text-white" style={{ background: NAVY }}>확인</button>
    </div>
  );
}

// course · user({ uid, name, companyName, role, carNo }) · mayPledge(관리자가 서약서 대체 허락) · pledgeCourse(대체할 때 쓰는 서약서)
const noopApi = { loadProgress: async () => null, saveProgress: async () => {}, saveRecord: async () => {} };
// preview: 관리자 · 직원이 기사 교육을 미리 보기(기록 · 서명 없음, 자유롭게 넘겨 보기)
export default function EduPlayer({ course, user, mayPledge = false, pledgeCourse = null, api = firestoreEduApi, onClose, onDone, initialStep, preview = false }) {
  const [step, setStep] = React.useState(initialStep || "main"); // main | sign | done
  const [mode, setMode] = React.useState(course.kind === "doc" ? "doc" : "video");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [doneRec, setDoneRec] = React.useState(null);
  const submit = async (sig) => {
    setBusy(true); setErr("");
    try {
      const period = eduPeriod(course);
      const id = eduRecordId(user.companyName, user.uid, course.id, period);
      const rec = {
        companyName: String(user.companyName || "").trim(), uid: user.uid, name: user.name || "", role: user.role || "", carNo: user.carNo || "",
        courseId: course.id, courseTitle: course.title, period, mode, signImage: sig,
        device: typeof navigator !== "undefined" ? String(navigator.userAgent || "").slice(0, 160) : "",
      };
      await api.saveRecord(id, rec);
      setDoneRec(rec); setStep("done"); onDone?.(rec);
    } catch (e) { setErr("저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요."); console.warn(e); }
    setBusy(false);
  };
  const stepNo = step === "main" ? 0 : step === "sign" ? 1 : 2;
  return (
    <div className="fixed inset-0 z-[10000] flex items-stretch justify-center sm:items-center" style={{ background: "rgba(11,20,40,0.5)" }}>
      <div className={`w-full sm:rounded-2xl overflow-hidden flex flex-col bg-white shadow-2xl ${step === "main" && course.kind === "video" ? "sm:h-[92vh] lg:h-auto lg:max-h-[94vh] sm:max-w-[760px] lg:max-w-[1240px]" : "sm:h-[92vh] sm:max-w-[560px] lg:max-w-[680px]"}`}>
        <Header course={course} step={stepNo} onClose={onClose} preview={preview} />
        {step === "main" && course.kind === "video" && <VideoStep course={course} user={user} api={preview ? noopApi : api} mayPledge={!preview && mayPledge} preview={preview} onNext={preview ? onClose : () => { setMode("video"); setStep("sign"); }} onPledge={() => { setMode("pledge"); setStep("sign"); }} />}
        {step === "main" && course.kind === "doc" && <DocStep course={course} preview={preview} onNext={() => (preview ? onClose() : setStep("sign"))} />}
        {step === "sign" && <SignStep course={course} user={user} mode={mode} pledgeCourse={pledgeCourse} busy={busy} onSubmit={submit} />}
        {step === "done" && <DoneStep course={course} mode={mode} rec={doneRec} onClose={onClose} />}
        {err && <div className="shrink-0 px-4 py-2 text-[13px] font-bold text-center" style={{ background: "#FDF1F1", color: "#B42318" }}>{err}</div>}
      </div>
    </div>
  );
}
