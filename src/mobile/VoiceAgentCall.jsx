// ======================= src/mobile/VoiceAgentCall.jsx =======================
// 📞 2026-11-25 AI 상담원 음성 오더 — 휴대폰 오더등록 [AI 상담원]을 누르면 통화하듯 말로 오더를 받는다
//  · 차례로 말하기: 듣기(휴대폰 음성 인식) → 생각(서버 voiceOrderTurn · Claude Haiku) → 말하기(휴대폰 음성) → 다시 듣기
//  · AI가 말하는 동안은 듣지 않는다(자기 목소리를 다시 듣지 않게). [말하기]를 누르면 말을 끊고 바로 들어요
//  · 채울 칸은 그때그때 오더 화면에 들어가고(onPatch), 위 카드에 보인다. 등록은 AI가 내용을 읽어 준 뒤 "네"라고 하면 onSave(원래 저장)
//  · 소리가 안 나오는 기기 · 시끄러운 곳: 자막이 늘 보이고, [말 끝]으로 바로 보낼 수 있다
import React from "react";
import { createPortal } from "react-dom";
import { voiceTurn } from "../voiceOrderApi";
import { knownFor } from "../orderScanAi";

const KEYS = ["거래처명", "상차일", "상차시간", "상차지명", "상차지주소", "상차방법", "하차일", "하차시간", "하차지명", "하차지주소", "하차방법",
  "화물내용", "톤수", "차종", "청구운임", "기사운임", "지급방식", "혼적여부", "긴급", "적요"];
const REQUIRED = [["상차일", "상차일"], ["상차지명", "상차지"], ["하차지명", "하차지"], ["차량", "차량"], ["청구운임", "청구운임"]];
const GREETING = "네, 로지스웹 AI 배차 상담원이에요. 오더 내용을 편하게 말씀해 주세요. 날짜하고 상차지부터 말씀하시면 돼요.";
const SILENCE_MS = 1400; // 말이 멈추고 이만큼 지나면 보낸다

const fmtMoney = (v) => { const n = Number(String(v || "").replace(/[^\d]/g, "")); return n ? `${n.toLocaleString("ko-KR")}원` : ""; };
const fmtDate = (v) => { const m = String(v || "").match(/^\d{4}-(\d{2})-(\d{2})$/); return m ? `${Number(m[1])}월 ${Number(m[2])}일` : String(v || ""); };
const pickVoice = () => {
  try {
    const vs = window.speechSynthesis?.getVoices?.() || [];
    const ko = vs.filter((v) => /^ko/i.test(v.lang));
    return ko.find((v) => /google|natural|neural|premium|enhanced/i.test(v.name)) || ko[0] || null;
  } catch { return null; }
};

export default function VoiceAgentCall({ form, places = [], clients = [], onPatch, onSave, onClose }) {
  const [phase, setPhase] = React.useState("idle"); // idle | speaking | listening | thinking | done | error
  const [turns, setTurns] = React.useState([]); // { role: "ai" | "user", text }
  const [live, setLive] = React.useState(""); // 지금 듣고 있는 말
  const [err, setErr] = React.useState("");
  const [sec, setSec] = React.useState(0);
  const turnsRef = React.useRef([]);
  const formRef = React.useRef(form);
  const recRef = React.useRef(null);
  const silenceRef = React.useRef(null);
  const heardRef = React.useRef("");
  const aliveRef = React.useRef(true);
  const lastActionRef = React.useRef("ask");
  const logRef = React.useRef(null);
  formRef.current = form;
  // 타이머 · 음성 이벤트는 처음 만든 때의 함수를 붙잡고 있어서, 저장 · 칸 넣기 · 업체 목록은 늘 지금 것을 쓰게 ref로
  const propsRef = React.useRef({});
  propsRef.current = { onPatch, onSave, onClose, places, clients };

  const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const canSpeak = typeof window !== "undefined" && !!window.speechSynthesis;

  React.useEffect(() => { const t = setInterval(() => setSec((s) => s + 1), 1000); return () => clearInterval(t); }, []);
  React.useEffect(() => { logRef.current?.scrollTo?.({ top: 1e6, behavior: "smooth" }); }, [turns, live]);
  React.useEffect(() => () => { aliveRef.current = false; stopListen(); try { window.speechSynthesis?.cancel(); } catch { /* 무시 */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const push = (t) => { turnsRef.current = [...turnsRef.current, t]; setTurns(turnsRef.current); };

  // ── 말하기 ──
  const speak = (text) => new Promise((resolve) => {
    if (!canSpeak || !text) { resolve(); return; }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR"; u.rate = 1.05; u.pitch = 1;
      const v = pickVoice(); if (v) u.voice = v;
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      u.onend = fin; u.onerror = fin;
      setTimeout(fin, Math.min(20000, 1500 + text.length * 140)); // 어떤 기기는 onend가 안 온다
      window.speechSynthesis.speak(u);
    } catch { resolve(); }
  });

  // ── 듣기 ──
  function stopListen() {
    clearTimeout(silenceRef.current);
    const r = recRef.current; recRef.current = null;
    if (r) { try { r.onresult = null; r.onend = null; r.onerror = null; r.abort(); } catch { /* 무시 */ } }
  }
  const listen = () => {
    if (!aliveRef.current) return;
    if (!SR) { setErr("이 휴대폰 브라우저는 음성 인식을 지원하지 않아요. 크롬이나 삼성 인터넷에서 열어 주세요."); setPhase("error"); return; }
    stopListen();
    heardRef.current = ""; setLive(""); setPhase("listening");
    const r = new SR();
    r.lang = "ko-KR"; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    let finalText = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += `${t} `; else interim += t;
      }
      heardRef.current = `${finalText}${interim}`.replace(/\s+/g, " ").trim();
      setLive(heardRef.current);
      clearTimeout(silenceRef.current);
      silenceRef.current = setTimeout(() => sendHeard(), SILENCE_MS);
    };
    r.onerror = (e) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") { setErr("마이크 권한이 꺼져 있어요. 브라우저 설정에서 마이크를 허용해 주세요."); setPhase("error"); stopListen(); }
    };
    r.onend = () => {
      if (recRef.current !== r) return;
      recRef.current = null;
      if (heardRef.current) sendHeard(); else if (aliveRef.current) setTimeout(() => { if (aliveRef.current && !recRef.current) listen(); }, 250); // 조용해서 끊기면 다시 듣기
    };
    recRef.current = r;
    try { r.start(); } catch { /* 이미 듣는 중 */ }
  };

  // ── 한 마디 보내기 → AI 대답 ──
  const sendHeard = async () => {
    const text = heardRef.current.trim();
    stopListen();
    if (!text) { listen(); return; }
    heardRef.current = ""; setLive("");
    push({ role: "user", text });
    setPhase("thinking");
    const cur = Object.fromEntries(KEYS.map((k) => [k, formRef.current?.[k] ?? ""]));
    const hist = turnsRef.current.slice(0, -1);
    let res;
    try {
      res = await voiceTurn({
        text, history: hist, current: cur,
        known: knownFor(`${hist.filter((t) => t.role === "user").map((t) => t.text).join(" ")} ${text}`, { places: propsRef.current.places, clients: propsRef.current.clients }),
      });
    } catch (e) {
      if (!aliveRef.current) return;
      const msg = e?.code === "resource-exhausted" ? "오늘 AI 상담원을 다 쓰셨어요. 화면에서 직접 입력해 주세요." : "죄송해요, 잘 못 들었어요. 한 번만 다시 말씀해 주세요.";
      push({ role: "ai", text: msg });
      setPhase("speaking"); await speak(msg);
      if (e?.code === "resource-exhausted") { setPhase("done"); return; }
      listen(); return;
    }
    if (!aliveRef.current) return;
    if (res.patch && Object.keys(res.patch).length) propsRef.current.onPatch?.(res.patch);
    push({ role: "ai", text: res.reply });
    lastActionRef.current = res.action;
    setPhase("speaking");
    await speak(res.reply);
    if (!aliveRef.current) return;
    if (res.action === "save") {
      setPhase("done");
      setTimeout(() => { try { propsRef.current.onSave?.(); } finally { propsRef.current.onClose?.(); } }, 400); // 칸이 화면에 다 들어간 뒤(다시 그려진 뒤) 원래 저장
      return;
    }
    if (res.action === "cancel") { setPhase("done"); setTimeout(() => propsRef.current.onClose?.(), 600); return; }
    listen();
  };

  const start = async () => {
    setErr("");
    push({ role: "ai", text: GREETING });
    setPhase("speaking");
    await speak(GREETING);
    listen();
  };
  // [말하기] — AI 말을 끊고 바로 듣기 · [말 끝] — 지금까지 들은 말 바로 보내기
  const talkNow = () => { try { window.speechSynthesis?.cancel(); } catch { /* 무시 */ } listen(); };
  const sendNow = () => { if (heardRef.current) sendHeard(); };
  const hangUp = () => { aliveRef.current = false; stopListen(); try { window.speechSynthesis?.cancel(); } catch { /* 무시 */ } onClose?.(); };

  // 채워진 칸 카드
  const f = form || {};
  const has = (k) => (k === "차량" ? !!(f.톤수 || f.차종) : !!String(f[k] ?? "").trim() && String(f[k]) !== "0");
  const filled = [
    ["상차일", f.상차일 && `${fmtDate(f.상차일)}${f.상차시간 ? ` ${f.상차시간}` : ""}${f.하차일 && f.하차일 !== f.상차일 ? ` → ${fmtDate(f.하차일)}` : f.하차일 ? " 당착" : ""}`],
    ["상차지", f.상차지명], ["하차지", f.하차지명],
    ["차량", [f.톤수, f.차종].filter(Boolean).join(" ")],
    ["청구운임", fmtMoney(f.청구운임)],
    ["거래처", f.거래처명], ["화물", f.화물내용], ["지급", f.지급방식],
  ].filter(([, v]) => v);
  const doneReq = REQUIRED.filter(([k]) => has(k)).length;
  const mm = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  const PH = {
    idle: ["준비됐어요", "#8FB0F0"], speaking: ["상담원이 말하는 중", "#7DD3FC"], listening: ["듣고 있어요 · 말씀하세요", "#34D399"],
    thinking: ["정리하는 중…", "#C084FC"], done: ["통화를 마쳤어요", "#8796AE"], error: ["확인이 필요해요", "#F87171"],
  }[phase];

  return createPortal(
    <div data-kp="voice-agent" className="fixed inset-0 z-[2147483200] flex flex-col text-[#E6EDF8]" style={{ background: "radial-gradient(120% 70% at 50% 18%, #13264A 0%, #070D1A 62%)", fontFamily: "'Noto Sans KR',sans-serif", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <style>{`
        @keyframes vaRing{0%{transform:scale(.7);opacity:.55}100%{transform:scale(1.9);opacity:0}}
        @keyframes vaSpin{to{transform:rotate(360deg)}}
        @keyframes vaBar{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
        .va-ring{animation:vaRing 1.8s ease-out infinite}
        .va-spin{animation:vaSpin 1.1s linear infinite}
        .va-bar{animation:vaBar .9s ease-in-out infinite;transform-origin:center}
      `}</style>

      {/* 위 */}
      <div className="flex items-center gap-3 px-4 pt-3">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-extrabold tracking-[0.2em] text-[#7FA4E6]">AI DISPATCH CALL</div>
          <div className="text-[18px] font-black">AI 배차 상담원</div>
        </div>
        <div className="text-right">
          <div className="text-[18px] font-black tabular-nums">{mm}</div>
          <div className="text-[11.5px] font-bold text-[#8796AE]">통화 중</div>
        </div>
      </div>

      {/* 가운데 — 상태 원 */}
      <div className="flex flex-col items-center pt-5 pb-3">
        <div className="relative w-[132px] h-[132px] grid place-items-center">
          {phase === "listening" && <><span className="va-ring absolute inset-0 rounded-full" style={{ background: "rgba(52,211,153,.28)" }} /><span className="va-ring absolute inset-0 rounded-full" style={{ background: "rgba(52,211,153,.2)", animationDelay: ".6s" }} /></>}
          {phase === "thinking" && <span className="va-spin absolute inset-1 rounded-full" style={{ border: "3px solid rgba(192,132,252,.15)", borderTopColor: "#C084FC" }} />}
          <span className="relative w-[96px] h-[96px] rounded-full grid place-items-center" style={{ background: "linear-gradient(145deg,#2563EB,#0EA5E9)", boxShadow: `0 0 0 6px rgba(56,189,248,.12), 0 0 40px ${PH[1]}55` }}>
            {phase === "speaking" ? (
              <span className="flex items-center gap-[5px] h-9">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="va-bar w-[5px] h-9 rounded-full bg-white" style={{ animationDelay: `${i * 0.12}s` }} />)}</span>
            ) : (
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            )}
          </span>
        </div>
        <div className="mt-3 text-[14px] font-black" style={{ color: PH[1] }}>{PH[0]}</div>
      </div>

      {/* 채워진 칸 */}
      <div className="mx-4 rounded-2xl px-4 py-3" style={{ background: "rgba(14,26,48,.85)", border: "1px solid #22345A" }}>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-black">오더 내용</span>
          <span className="ml-auto text-[12px] font-bold text-[#8796AE]">필수 {doneReq}/{REQUIRED.length}</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-[#13233F] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(doneReq / REQUIRED.length) * 100}%`, background: "linear-gradient(90deg,#2563EB,#34D399)", transition: "width .4s" }} /></div>
        {filled.length === 0
          ? <div className="mt-2 text-[12.5px] font-bold text-[#6B7A95]">말씀하시면 여기에 바로 채워져요</div>
          : <div className="mt-2 grid grid-cols-[64px_1fr] gap-x-2 gap-y-1">{filled.map(([k, v]) => <React.Fragment key={k}><span className="text-[12px] font-bold text-[#8796AE]">{k}</span><span className="text-[13px] font-black truncate">{v}</span></React.Fragment>)}</div>}
        {REQUIRED.some(([k]) => !has(k)) && filled.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">{REQUIRED.filter(([k]) => !has(k)).map(([, l]) => <span key={l} className="h-6 px-2 rounded-md text-[11.5px] font-black grid place-items-center" style={{ background: "rgba(251,191,36,.12)", color: "#FCD34D" }}>{l} 남음</span>)}</div>
        )}
      </div>

      {/* 대화 자막 */}
      <div ref={logRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[82%] rounded-2xl px-3.5 py-2 text-[14px] font-bold leading-relaxed" style={t.role === "user" ? { background: "#2563EB", color: "#fff", borderBottomRightRadius: 6 } : { background: "#0E1A30", border: "1px solid #22345A", borderBottomLeftRadius: 6 }}>{t.text}</div>
          </div>
        ))}
        {live && <div className="flex justify-end"><div className="max-w-[82%] rounded-2xl px-3.5 py-2 text-[14px] font-bold leading-relaxed text-white/80" style={{ background: "rgba(37,99,235,.45)", borderBottomRightRadius: 6 }}>{live}</div></div>}
        {err && <div className="rounded-xl px-3 py-2 text-[13px] font-bold" style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.4)", color: "#FCA5A5" }}>{err}</div>}
      </div>

      {/* 아래 버튼 */}
      <div className="px-4 pb-4 pt-2">
        {phase === "idle" ? (
          <button type="button" onClick={start} className="w-full h-14 rounded-2xl text-[16px] font-black text-white" style={{ background: "linear-gradient(135deg,#2563EB,#0EA5E9)" }}>통화 시작</button>
        ) : (
          <div className="flex items-center gap-3">
            <button type="button" onClick={phase === "listening" ? sendNow : talkNow} disabled={phase === "thinking" || phase === "done"}
              className="flex-1 h-14 rounded-2xl text-[15px] font-black disabled:opacity-40" style={{ background: "#0E1A30", border: "1px solid #2B4F8C", color: "#CFE0FF" }}>
              {phase === "listening" ? "말 끝 · 보내기" : "말하기"}
            </button>
            <button type="button" onClick={hangUp} aria-label="통화 종료" className="w-14 h-14 rounded-full grid place-items-center" style={{ background: "#DC2626", boxShadow: "0 8px 20px rgba(220,38,38,.35)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" /></svg>
            </button>
          </div>
        )}
        <div className="mt-2 text-center text-[11.5px] font-bold text-[#6B7A95]">말이 끝나면 저절로 보내요 · 등록 전에 꼭 한 번 확인해요</div>
      </div>
    </div>,
    document.body,
  );
}
