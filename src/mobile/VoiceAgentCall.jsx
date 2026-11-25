// ======================= src/mobile/VoiceAgentCall.jsx =======================
// 📞 2026-11-25 AI 상담원 음성 오더 — 휴대폰 오더등록 [AI 상담원]
//  · Claude 음성 입력처럼: 마이크가 켜져 있는 동안 하고 싶은 말을 다 하고 [보내기]를 누르면 그때 AI가 정리 · 대답한다
//    (말이 잠깐 멈춰도 보내지 않는다 — 한두 마디에 끊기던 문제)
//  · AI 대답 → 소리로 읽기 → 다시 마이크 켜짐. AI가 말하는 중에 [말 끊기]를 누르면 바로 들어요
//  · 화면 가운데 [오더 내용] 카드에 지금 채워진 오더가 다 보이고, 빠진 필수 칸 · 물어볼 것(특수운임 부담 · 새 이름 · 기사 고르기)은 눌러서도 답할 수 있다
//  · 기사(차량번호 · 이름)는 화면이 등록 기사에서 찾는다: 한 명이면 바로 넣고, 여러 명이면 번호 목록을 보여 주고 "몇 번이에요?"
//  · 회사 [용어 사전](에이제이 = AJ네트웍스) · 오더 스캔이 배운 이름 · 등록 거래처 · 상하차지 · 선택 목록을 AI에 같이 보낸다
//  · 등록은 AI가 내용을 읽어 준 뒤 "네"라고 하면 onSave(원래 저장)
import React from "react";
import { createPortal } from "react-dom";
import { voiceTurn } from "../voiceOrderApi";
import { subscribeGlossary, saveGlossary } from "../voiceGlossary";

export const AGENT_KEYS = ["거래처명", "상차일", "상차시간", "상차지명", "상차지주소", "상차방법", "하차일", "하차시간", "하차지명", "하차지주소", "하차방법",
  "화물내용", "톤수", "차종", "청구운임", "기사운임", "지급방식", "배차방식", "운임구분", "혼적여부", "운행유형", "긴급", "차량번호", "기사명", "전화번호", "적요", "전달사항", "등록수량"];
const REQUIRED = [["상차일", "상차일"], ["하차일", "하차일"], ["거래처명", "거래처"], ["상차지명", "상차지"], ["하차지명", "하차지"], ["차종", "차종"]];
const GREETING = "네, 로지스웹 AI 배차 상담원이에요. 오더 내용을 편하게 쭉 말씀하시고, 다 말씀하시면 보내기를 눌러 주세요.";
const BURDENS = [["기사", "기사 차감"], ["회사", "회사 부담"], ["청구", "추가 청구"]];
const NEW_LABEL = { 거래처명: "거래처", 상차지명: "상차지", 하차지명: "하차지", 경유지: "경유지", 지급방식: "지급방식", 배차방식: "배차방식", 차종: "차종", 상하차방법: "상하차방법" };

const won = (v) => { const n = Number(String(v ?? "").replace(/[^\d]/g, "")); return n ? `${n.toLocaleString("ko-KR")}원` : ""; };
const md = (v) => { const m = String(v || "").match(/^\d{4}-(\d{2})-(\d{2})$/); return m ? `${Number(m[1])}/${Number(m[2])}` : String(v || ""); };
const plateKey = (s) => String(s || "").replace(/[\s-]/g, "").toUpperCase();
const pickVoice = () => {
  try {
    const ko = (window.speechSynthesis?.getVoices?.() || []).filter((v) => /^ko/i.test(v.lang));
    return ko.find((v) => /google|natural|neural|premium|enhanced/i.test(v.name)) || ko[0] || null;
  } catch { return null; }
};
// "1번 · 첫 번째 · 두번째 · 이영희" → 고른 번호(0부터)
const KO_NUM = { 일: 1, 첫: 1, 하나: 1, 한: 1, 이: 2, 두: 2, 둘: 2, 삼: 3, 세: 3, 셋: 3, 사: 4, 네: 4, 넷: 4, 오: 5, 다섯: 5 };
export function pickIndex(text, choices) {
  const t = String(text || "").replace(/\s+/g, "");
  const byName = choices.findIndex((c) => c.이름 && t.includes(String(c.이름).replace(/\s+/g, "")));
  if (byName >= 0) return byName;
  const d = t.match(/(\d+)번?/); if (d) { const n = Number(d[1]); if (n >= 1 && n <= choices.length) return n - 1; }
  const k = t.match(/(첫|하나|한|일|두|둘|이|세|셋|삼|네|넷|사|다섯|오)(번|번째|째)/); if (k && KO_NUM[k[1]] <= choices.length) return KO_NUM[k[1]] - 1;
  return -1;
}
// 차량번호 · 이름으로 등록 기사 찾기 — 끝 4자리만 말해도 찾는다
export function findDrivers(drivers, { plate = "", name = "" } = {}) {
  const pk = plateKey(plate), nm = String(name || "").replace(/\s+/g, "");
  if (!pk && !nm) return [];
  return (drivers || []).filter((d) => {
    const dp = plateKey(d.차량번호);
    const okP = !pk || (pk.length <= 4 ? dp.endsWith(pk) : dp === pk || dp.includes(pk));
    const okN = !nm || String(d.이름 || "").replace(/\s+/g, "") === nm;
    return okP && okN && (dp || d.이름);
  }).slice(0, 9);
}

export default function VoiceAgentCall({ form, multiCount = 1, places = [], clients = [], drivers = [], options = {}, company = "", hintsFor, onResult, onSave, onClose }) {
  const [phase, setPhase] = React.useState("idle"); // idle | speaking | listening | thinking | done | error
  const [turns, setTurns] = React.useState([]);
  const [heard, setHeard] = React.useState(""); // 이번에 말한 내용(보내기 전)
  const [err, setErr] = React.useState("");
  const [sec, setSec] = React.useState(0);
  const [pendingNew, setPendingNew] = React.useState([]); // [{ kind, value }]
  const [driverChoices, setDriverChoices] = React.useState(null); // [driver…]
  const [glossary, setGlossary] = React.useState([]);
  const [showDict, setShowDict] = React.useState(false);
  const turnsRef = React.useRef([]);
  const recRef = React.useRef(null);
  const wantListenRef = React.useRef(false);
  const committedRef = React.useRef("");
  const interimRef = React.useRef("");
  const aliveRef = React.useRef(true);
  const lastActionRef = React.useRef("ask");
  const logRef = React.useRef(null);
  const propsRef = React.useRef({});
  propsRef.current = { form, multiCount, places, clients, drivers, options, onResult, onSave, onClose, hintsFor, glossary, driverChoices, pendingNew };

  const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const canSpeak = typeof window !== "undefined" && !!window.speechSynthesis;

  React.useEffect(() => { const t = setInterval(() => setSec((s) => s + 1), 1000); return () => clearInterval(t); }, []);
  React.useEffect(() => subscribeGlossary(company, setGlossary), [company]);
  // 🛠 2026-11-26 통화 중에는 화면이 꺼지지 않게(말하는 중에 절전되던 문제) — 다른 앱에 갔다 오면 다시 잡는다
  React.useEffect(() => {
    let lock = null, gone = false;
    const grab = async () => { try { if (!gone && document.visibilityState === "visible" && navigator.wakeLock?.request) lock = await navigator.wakeLock.request("screen"); } catch { /* 지원 안 함 · 거부 */ } };
    const onVis = () => { if (document.visibilityState === "visible") grab(); };
    grab();
    document.addEventListener("visibilitychange", onVis);
    return () => { gone = true; document.removeEventListener("visibilitychange", onVis); try { lock?.release(); } catch { /* 무시 */ } };
  }, []);
  React.useEffect(() => { logRef.current?.scrollTo?.({ top: 1e6, behavior: "smooth" }); }, [turns]);
  React.useEffect(() => () => { aliveRef.current = false; stopMic(); try { window.speechSynthesis?.cancel(); } catch { /* 무시 */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const push = (t) => { turnsRef.current = [...turnsRef.current, t]; setTurns(turnsRef.current); };

  // ── 말하기 ──
  const speak = (text) => new Promise((resolve) => {
    if (!canSpeak || !text) { resolve(); return; }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR"; u.rate = 1.07; u.pitch = 1;
      const v = pickVoice(); if (v) u.voice = v;
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      u.onend = fin; u.onerror = fin;
      setTimeout(fin, Math.min(25000, 1500 + text.length * 140)); // 어떤 기기는 onend가 안 온다
      window.speechSynthesis.speak(u);
    } catch { resolve(); }
  });

  // ── 마이크: 켜 두면 계속 받아 적는다(기기가 스스로 끊어도 다시 이어 붙임) ──
  function stopMic() {
    wantListenRef.current = false;
    const r = recRef.current; recRef.current = null;
    if (r) { try { r.onresult = null; r.onend = null; r.onerror = null; r.abort(); } catch { /* 무시 */ } }
  }
  const openSession = () => {
    if (!aliveRef.current || !wantListenRef.current) return;
    const r = new SR();
    r.lang = "ko-KR"; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) committedRef.current = `${committedRef.current} ${t}`.trim(); else interim += t;
      }
      interimRef.current = interim;
      setHeard(`${committedRef.current} ${interim}`.trim());
    };
    r.onerror = (e) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") { setErr("마이크 권한이 꺼져 있어요. 브라우저 설정에서 마이크를 허용해 주세요."); setPhase("error"); stopMic(); }
    };
    r.onend = () => {
      if (recRef.current !== r) return;
      if (interimRef.current) { committedRef.current = `${committedRef.current} ${interimRef.current}`.trim(); interimRef.current = ""; }
      recRef.current = null;
      if (wantListenRef.current && aliveRef.current) setTimeout(openSession, 150); // 조용해서 끊겨도 계속 듣기(보내지 않는다)
    };
    recRef.current = r;
    try { r.start(); } catch { /* 이미 듣는 중 */ }
  };
  const listen = () => {
    if (!aliveRef.current) return;
    if (!SR) { setErr("이 휴대폰 브라우저는 음성 인식을 지원하지 않아요. 크롬이나 삼성 인터넷에서 열어 주세요."); setPhase("error"); return; }
    stopMic();
    committedRef.current = ""; interimRef.current = ""; setHeard("");
    wantListenRef.current = true; setPhase("listening");
    openSession();
  };
  const clearHeard = () => { committedRef.current = ""; interimRef.current = ""; setHeard(""); if (phase !== "listening") listen(); };

  const say = async (text, then = "listen") => {
    push({ role: "ai", text });
    stopMic(); setPhase("speaking");
    await speak(text);
    if (!aliveRef.current) return;
    if (then === "listen") listen();
  };

  // 기사 고르기(여러 명일 때)
  const chooseDriver = (d) => {
    setDriverChoices(null);
    propsRef.current.onResult?.({ patch: { 차량번호: d.차량번호 || "", 기사명: d.이름 || "", 전화번호: d.전화번호 || "" } });
    say(`${d.이름 || ""} 기사님 ${d.차량번호 || ""}로 넣었어요. 이어서 말씀해 주세요.`);
  };

  // ── 보내기: 이번에 한 말 전체를 AI에 ──
  const send = async (override) => {
    const text = String(override ?? `${committedRef.current} ${interimRef.current}`).replace(/\s+/g, " ").trim();
    stopMic();
    committedRef.current = ""; interimRef.current = ""; setHeard("");
    if (!text) { listen(); return; }
    push({ role: "user", text });
    const P = propsRef.current;
    // 기사 번호 고르기 답이면 화면에서 바로
    if (P.driverChoices?.length) {
      const i = pickIndex(text, P.driverChoices);
      if (i >= 0) { chooseDriver(P.driverChoices[i]); return; }
    }
    setPhase("thinking");
    const f = P.form || {};
    const cur = Object.fromEntries(AGENT_KEYS.map((k) => [k, k === "등록수량" ? (P.multiCount > 1 ? P.multiCount : "") : (typeof f[k] === "boolean" ? (f[k] ? "긴급" : "") : f[k] ?? "")]));
    cur.stops = [
      ...(Array.isArray(f.경유상차목록) ? f.경유상차목록 : []).map((s) => ({ kind: "상차", name: s?.업체명, time: s?.상차시간 })),
      ...(Array.isArray(f.경유하차목록) ? f.경유하차목록 : []).map((s) => ({ kind: "하차", name: s?.업체명, time: s?.하차시간 })),
    ].filter((s) => s.name);
    cur.specials = [
      ...(Number(f.지게차비용) > 0 ? [{ type: "지게차", name: "", amount: Number(f.지게차비용), burden: f.지게차부담 || "" }] : []),
      ...(Array.isArray(f.특수운임) ? f.특수운임 : []).map((x) => ({ type: x?.종류 || "기타", name: x?.이름 || "", amount: Number(x?.금액) || 0, burden: x?.부담 || "" })),
    ];
    if (P.driverChoices?.length) cur.driverNote = `같은 기사 후보 ${P.driverChoices.map((d, i) => `${i + 1}번 ${d.이름} ${d.차량번호}`).join(", ")} — 몇 번인지 물어요`;
    const hist = turnsRef.current.slice(0, -1);
    let aliases = [];
    try { const h = await Promise.race([P.hintsFor?.(text), new Promise((r) => setTimeout(() => r(null), 2500))]); aliases = (h?.remaps?.aliases || []).filter((a) => a?.from && a?.to).map((a) => [a.from, a.to]); } catch { /* 무시 */ }
    const nameOf = (p) => String(p?.거래처명 || p?.업체명 || "").trim();
    const known = {
      clients: [...new Set((P.clients || []).map(nameOf).filter(Boolean))].slice(0, 400),
      places: (P.places || []).map((p) => ({ n: nameOf(p), a: String(p?.주소 || "").split(/\s+/).slice(0, 3).join(" ") })).filter((p) => p.n).slice(0, 400),
      options: P.options || {},
      glossary: [...(P.glossary || []).map((g) => [g.from, g.to]), ...aliases].slice(0, 250),
    };
    let res;
    try {
      res = await voiceTurn({ text, history: hist, current: cur, known });
    } catch (e) {
      if (!aliveRef.current) return;
      const why = e?.code === "resource-exhausted" ? "오늘 AI 상담원을 다 쓰셨어요. 화면에서 직접 입력해 주세요."
        : e?.code === "permission-denied" || e?.code === "unauthenticated" ? "이 계정은 AI 상담원을 쓸 수 없어요."
          : "AI 서버 연결이 잠깐 끊겼어요. 방금 말씀을 다시 보내 볼게요. 보내기를 한 번 더 눌러 주세요.";
      setErr(`${e?.message || "연결 실패"} (${e?.code || "오류"})`);
      const retry = e?.code !== "resource-exhausted" && e?.code !== "permission-denied" && e?.code !== "unauthenticated";
      await say(why, retry ? "listen" : "stop");
      if (retry) { committedRef.current = text; setHeard(text); } // 방금 말을 남겨 두어 [보내기]만 다시 누르면 된다
      return;
    }
    if (!aliveRef.current) return;
    setErr("");
    // 기사 찾기
    let reply = res.reply;
    const patch = { ...(res.patch || {}) };
    if (patch.차량번호 || patch.기사명) {
      const hits = findDrivers(P.drivers, { plate: patch.차량번호, name: patch.기사명 && !patch.차량번호 ? patch.기사명 : "" });
      if (hits.length === 1) { patch.차량번호 = hits[0].차량번호 || patch.차량번호; patch.기사명 = hits[0].이름 || patch.기사명; patch.전화번호 = hits[0].전화번호 || patch.전화번호 || ""; }
      else if (hits.length > 1) {
        delete patch.차량번호; delete patch.기사명; delete patch.전화번호;
        setDriverChoices(hits);
        reply = `${reply} 그런데 같은 번호로 등록된 기사님이 ${hits.length}명이에요. ${hits.slice(0, 5).map((d, i) => `${i + 1}번 ${d.이름}`).join(", ")}. 몇 번이에요?`;
      }
    }
    P.onResult?.({ patch, stops: res.stops, specials: res.specials, newItems: res.newItems });
    setPendingNew((res.newItems || []).filter((n) => !n.confirmed));
    lastActionRef.current = res.action;
    if (res.action === "save") {
      await say(reply, "stop");
      setPhase("done");
      setTimeout(() => { try { propsRef.current.onSave?.(); } finally { propsRef.current.onClose?.(); } }, 400); // 칸이 화면에 다 들어간 뒤 원래 저장
      return;
    }
    if (res.action === "cancel") { await say(reply, "stop"); setPhase("done"); setTimeout(() => propsRef.current.onClose?.(), 500); return; }
    await say(reply);
  };

  const start = async () => { setErr(""); await say(GREETING); };
  const interrupt = () => { try { window.speechSynthesis?.cancel(); } catch { /* 무시 */ } listen(); };
  const hangUp = () => { aliveRef.current = false; stopMic(); try { window.speechSynthesis?.cancel(); } catch { /* 무시 */ } onClose?.(); };
  // 버튼으로 답하기(특수운임 부담 · 새 이름) — 말로 한 것처럼 AI에 보낸다
  const answer = (t) => send(t);

  // ── 오더 내용(시각화) ──
  const f = form || {};
  const has = (k) => !!String(f[k] ?? "").trim() && String(f[k]) !== "0";
  const missing = REQUIRED.filter(([k]) => !has(k));
  const stopsP = (Array.isArray(f.경유상차목록) ? f.경유상차목록 : []).filter((s) => s?.업체명);
  const stopsD = (Array.isArray(f.경유하차목록) ? f.경유하차목록 : []).filter((s) => s?.업체명);
  const specials = [
    ...(Number(f.지게차비용) > 0 ? [{ label: "지게차", amount: Number(f.지게차비용), burden: f.지게차부담 }] : []),
    ...(Array.isArray(f.특수운임) ? f.특수운임 : []).filter((x) => Number(x?.금액) > 0).map((x) => ({ label: x.이름 || x.종류, amount: Number(x.금액), burden: x.부담 })),
  ];
  const opts = [f.혼적여부 === "혼적" && "혼적", f.혼적여부 === "독차" && "독차", f.운행유형 === "왕복" && "왕복", f.긴급 && "긴급", multiCount > 1 && `${multiCount}건 등록`].filter(Boolean);
  const Row = ({ k, children, miss }) => (
    <div className="flex gap-3 py-1.5 border-b border-[#13213D] last:border-0">
      <span className="w-[62px] shrink-0 text-[12px] font-bold pt-0.5 whitespace-nowrap" style={{ color: miss ? "#FCD34D" : "#8796AE" }}>{k}</span>
      <div className="flex-1 min-w-0 text-[13.5px] font-black leading-snug">{children || <span className="text-[#FCD34D] font-bold">말씀해 주세요</span>}</div>
    </div>
  );
  const mm = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  const PH = {
    idle: ["준비됐어요", "#8FB0F0"], speaking: ["상담원이 말하는 중", "#7DD3FC"], listening: ["듣고 있어요", "#34D399"],
    thinking: ["정리하는 중…", "#C084FC"], done: ["통화를 마쳤어요", "#8796AE"], error: ["확인이 필요해요", "#F87171"],
  }[phase];
  const lastAi = [...turns].reverse().find((t) => t.role === "ai");
  const needBurden = specials.some((s) => !s.burden);

  return createPortal(
    <div data-kp="voice-agent" className="fixed inset-0 z-[2147483200] flex flex-col text-[#E6EDF8]" style={{ background: "radial-gradient(120% 60% at 50% 0%, #13264A 0%, #070D1A 60%)", fontFamily: "'Noto Sans KR',sans-serif", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <style>{`
        @keyframes vaRing{0%{transform:scale(.7);opacity:.55}100%{transform:scale(1.9);opacity:0}}
        @keyframes vaSpin{to{transform:rotate(360deg)}}
        @keyframes vaBar{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
        .va-ring{animation:vaRing 1.8s ease-out infinite}.va-spin{animation:vaSpin 1.1s linear infinite}.va-bar{animation:vaBar .9s ease-in-out infinite;transform-origin:center}
      `}</style>

      {/* 위 */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <span className="relative w-11 h-11 shrink-0 grid place-items-center">
          {phase === "listening" && <span className="va-ring absolute inset-0 rounded-full" style={{ background: "rgba(52,211,153,.3)" }} />}
          {phase === "thinking" && <span className="va-spin absolute -inset-1 rounded-full" style={{ border: "2.5px solid rgba(192,132,252,.15)", borderTopColor: "#C084FC" }} />}
          <span className="relative w-11 h-11 rounded-full grid place-items-center" style={{ background: "linear-gradient(145deg,#2563EB,#0EA5E9)" }}>
            {phase === "speaking"
              ? <span className="flex items-center gap-[3px] h-5">{[0, 1, 2, 3].map((i) => <span key={i} className="va-bar w-[3px] h-5 rounded-full bg-white" style={{ animationDelay: `${i * 0.12}s` }} />)}</span>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>}
          </span>
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[16px] font-black leading-tight">AI 배차 상담원</div>
          <div className="text-[12px] font-black" style={{ color: PH[1] }}>{PH[0]}</div>
        </div>
        <button type="button" onClick={() => setShowDict(true)} className="h-9 px-3 rounded-xl text-[12.5px] font-black" style={{ background: "#0E1A30", border: "1px solid #22345A", color: "#CFE0FF" }}>용어 사전</button>
        <div className="text-right"><div className="text-[15px] font-black tabular-nums">{mm}</div></div>
      </div>

      {/* AI 마지막 말 */}
      {lastAi && <div className="mx-4 mb-2 rounded-2xl px-3.5 py-2.5 text-[14px] font-bold leading-relaxed" style={{ background: "#0E1A30", border: "1px solid #22345A" }}>{lastAi.text}</div>}

      {/* 오더 내용 카드 */}
      <div ref={logRef} className="flex-1 min-h-0 overflow-y-auto px-4 pb-2">
        <div className="rounded-2xl px-4 py-3" style={{ background: "rgba(14,26,48,.9)", border: "1px solid #22345A" }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[13px] font-black">오더 내용</span>
            <span className="ml-auto text-[12px] font-bold" style={{ color: missing.length ? "#FCD34D" : "#34D399" }}>{missing.length ? `필수 ${REQUIRED.length - missing.length}/${REQUIRED.length}` : "필수 다 채움"}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#13233F] overflow-hidden mb-1"><div className="h-full rounded-full" style={{ width: `${((REQUIRED.length - missing.length) / REQUIRED.length) * 100}%`, background: "linear-gradient(90deg,#2563EB,#34D399)", transition: "width .4s" }} /></div>
          <Row k="거래처" miss={!has("거래처명")}>{f.거래처명}</Row>
          <Row k="날짜" miss={!has("상차일") || !has("하차일")}>{has("상차일") ? <>{md(f.상차일)} {f.상차시간 || ""} 상차 → {f.하차일 === f.상차일 ? "당착" : md(f.하차일)} {f.하차시간 || ""}</> : ""}</Row>
          <Row k="상차지" miss={!has("상차지명")}>{has("상차지명") ? <>{f.상차지명}{f.상차방법 ? <span className="text-[#8796AE] font-bold"> · {f.상차방법}</span> : null}{f.상차지주소 ? <div className="text-[11.5px] font-bold text-[#6B7A95] truncate">{f.상차지주소}</div> : null}</> : ""}</Row>
          {stopsP.map((s, i) => <Row key={`p${i}`} k={`경유상차${stopsP.length > 1 ? i + 1 : ""}`}>{s.업체명}{s.상차시간 ? ` ${s.상차시간}` : ""}</Row>)}
          <Row k="하차지" miss={!has("하차지명")}>{has("하차지명") ? <>{f.하차지명}{f.하차방법 ? <span className="text-[#8796AE] font-bold"> · {f.하차방법}</span> : null}{f.하차지주소 ? <div className="text-[11.5px] font-bold text-[#6B7A95] truncate">{f.하차지주소}</div> : null}</> : ""}</Row>
          {stopsD.map((s, i) => <Row key={`d${i}`} k={`경유하차${stopsD.length > 1 ? i + 1 : ""}`}>{s.업체명}{s.하차시간 ? ` ${s.하차시간}` : ""}</Row>)}
          <Row k="차량" miss={!has("차종")}>{has("차종") || has("톤수") ? [f.톤수, f.차종].filter(Boolean).join(" ") : ""}</Row>
          {(f.화물내용 || opts.length > 0) && <Row k="화물">{[f.화물내용, ...opts].filter(Boolean).join(" · ")}</Row>}
          {(has("청구운임") || has("기사운임") || specials.length > 0) && (
            <Row k="운임">
              {has("청구운임") && <span>청구 {won(f.청구운임)}</span>}{has("기사운임") && <span className="text-[#A9B8D2]"> · 기사 {won(f.기사운임)}</span>}
              {specials.map((s, i) => <div key={i} className="text-[12.5px] font-bold" style={{ color: s.burden ? "#C9D5E8" : "#FCD34D" }}>특수 {s.label} {won(s.amount)} · {s.burden ? BURDENS.find((b) => b[0] === s.burden)?.[1] : "부담 정해 주세요"}</div>)}
            </Row>
          )}
          {(f.지급방식 || f.배차방식 || f.운임구분) && <Row k="지급">{[f.지급방식, f.배차방식 && `배차 ${f.배차방식}`, f.운임구분].filter(Boolean).join(" · ")}</Row>}
          {(f.차량번호 || f.기사명) && <Row k="기사">{[f.기사명, f.차량번호, f.전화번호].filter(Boolean).join(" · ")}</Row>}
          {(f.적요 || f.전달사항) && <Row k="메모">{[f.적요, f.전달사항].filter(Boolean).join(" / ")}</Row>}
        </div>

        {/* 눌러서 답하기 */}
        {needBurden && phase !== "thinking" && (
          <div className="mt-2 rounded-2xl px-3.5 py-3" style={{ background: "rgba(251,191,36,.08)", border: "1px solid rgba(251,191,36,.35)" }}>
            <div className="text-[12.5px] font-black text-[#FCD34D] mb-2">특수운임은 어디서 부담할까요?</div>
            <div className="flex gap-2">{BURDENS.map(([k, l]) => <button key={k} type="button" onClick={() => answer(`특수운임은 ${l}로 해 줘`)} className="flex-1 h-10 rounded-xl text-[13px] font-black" style={{ background: "#0E1A30", border: "1px solid #2B4F8C", color: "#CFE0FF" }}>{l}</button>)}</div>
          </div>
        )}
        {pendingNew.length > 0 && phase !== "thinking" && pendingNew.map((n, i) => (
          <div key={i} className="mt-2 rounded-2xl px-3.5 py-3" style={{ background: "rgba(96,165,250,.08)", border: "1px solid rgba(96,165,250,.35)" }}>
            <div className="text-[12.5px] font-black text-[#93C5FD] mb-2">{NEW_LABEL[n.kind] || n.kind} ‘{n.value}’은(는) 처음이에요. 새로 등록할까요?</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => answer(`응, ${n.value} 새로 등록해`)} className="flex-1 h-10 rounded-xl text-[13px] font-black text-white" style={{ background: "#2563EB" }}>새로 등록</button>
              <button type="button" onClick={() => answer(`아니, ${n.value}은 새로 등록하지 마`)} className="flex-1 h-10 rounded-xl text-[13px] font-black" style={{ background: "#0E1A30", border: "1px solid #2B4F8C", color: "#CFE0FF" }}>아니요</button>
            </div>
          </div>
        ))}
        {driverChoices?.length > 0 && (
          <div className="mt-2 rounded-2xl px-3.5 py-3" style={{ background: "rgba(52,211,153,.07)", border: "1px solid rgba(52,211,153,.35)" }}>
            <div className="text-[12.5px] font-black text-[#6EE7B7] mb-2">같은 번호 기사님이 {driverChoices.length}명이에요. 몇 번이에요?</div>
            <div className="flex flex-col gap-1.5">{driverChoices.map((d, i) => (
              <button key={i} type="button" onClick={() => chooseDriver(d)} className="h-11 px-3 rounded-xl text-left text-[13.5px] font-black flex items-center gap-2" style={{ background: "#0E1A30", border: "1px solid #22345A" }}>
                <span className="w-6 h-6 rounded-full grid place-items-center text-[12px] text-white" style={{ background: "#2563EB" }}>{i + 1}</span>{d.이름}<span className="text-[#8796AE] font-bold">{d.차량번호}</span><span className="ml-auto text-[12px] text-[#6B7A95] font-bold">{d.전화번호}</span>
              </button>
            ))}</div>
          </div>
        )}
        {err && <div className="mt-2 rounded-xl px-3 py-2 text-[12.5px] font-bold" style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.4)", color: "#FCA5A5" }}>{err}</div>}
      </div>

      {/* 말하는 내용 + 버튼 */}
      <div className="px-4 pb-4 pt-2" style={{ borderTop: "1px solid #13213D", background: "rgba(7,13,26,.9)" }}>
        {phase === "idle" ? (
          <button type="button" onClick={start} className="w-full h-14 rounded-2xl text-[16px] font-black text-white" style={{ background: "linear-gradient(135deg,#2563EB,#0EA5E9)" }}>통화 시작</button>
        ) : (
          <>
            <div className="min-h-[52px] max-h-[110px] overflow-y-auto rounded-2xl px-3.5 py-2.5 mb-2 text-[14.5px] font-bold leading-relaxed" style={{ background: "#0B1526", border: `1px solid ${phase === "listening" ? "#1F7A55" : "#1A2742"}` }}>
              {heard || <span className="text-[#5D6E8C]">{phase === "listening" ? "말씀하세요. 다 말하면 보내기를 눌러 주세요" : phase === "thinking" ? "정리하고 있어요…" : phase === "speaking" ? "상담원이 말하고 있어요" : ""}</span>}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={clearHeard} disabled={!heard} aria-label="말한 내용 지우기" className="w-12 h-14 rounded-2xl text-[12px] font-black disabled:opacity-30" style={{ background: "#0E1A30", border: "1px solid #22345A", color: "#A9B8D2" }}>지우기</button>
              {phase === "speaking"
                ? <button type="button" onClick={interrupt} className="flex-1 h-14 rounded-2xl text-[15px] font-black" style={{ background: "#0E1A30", border: "1px solid #2B4F8C", color: "#CFE0FF" }}>말 끊고 말하기</button>
                : <button type="button" onClick={() => send()} disabled={!heard || phase === "thinking" || phase === "done"} className="flex-1 h-14 rounded-2xl text-[16px] font-black text-white disabled:opacity-35 flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#2563EB,#0EA5E9)" }}>
                    보내기<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                  </button>}
              <button type="button" onClick={hangUp} aria-label="통화 종료" className="w-14 h-14 rounded-full grid place-items-center shrink-0" style={{ background: "#DC2626", boxShadow: "0 8px 20px rgba(220,38,38,.35)" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" /></svg>
              </button>
            </div>
          </>
        )}
      </div>

      {showDict && <GlossarySheet company={company} items={glossary} onClose={() => setShowDict(false)} />}
    </div>,
    document.body,
  );
}

// ── 용어 사전(회사 공용) — 에이제이 → AJ네트웍스 처럼 ──
function GlossarySheet({ company, items, onClose }) {
  const [list, setList] = React.useState(items);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const save = async (next) => {
    setBusy(true); setMsg("");
    try { await saveGlossary(company, next); setList(next); setMsg("저장했어요"); } catch (e) { setMsg(`저장하지 못했어요 (${e?.code || e?.message || "오류"})`); }
    setBusy(false);
  };
  const add = () => { const a = from.trim(), b = to.trim(); if (!a || !b) return; save([{ from: a, to: b }, ...list.filter((x) => x.from !== a)]); setFrom(""); setTo(""); };
  const inp = "h-11 rounded-xl px-3 text-[14px] font-bold outline-none min-w-0 flex-1";
  const inpStyle = { background: "#0E1A30", border: "1px solid #22345A", color: "#E6EDF8" };
  return (
    <div className="fixed inset-0 z-[2147483300] flex flex-col justify-end" style={{ background: "rgba(0,0,0,.55)" }} onClick={onClose}>
      <div className="rounded-t-3xl px-4 pt-4 pb-6 max-h-[80vh] flex flex-col" style={{ background: "#0A1222", borderTop: "1px solid #22345A" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1"><span className="text-[17px] font-black">용어 사전</span><button type="button" onClick={onClose} className="ml-auto h-9 px-3 rounded-xl text-[13px] font-black" style={{ background: "#0E1A30", border: "1px solid #22345A", color: "#CFE0FF" }}>닫기</button></div>
        <div className="text-[12.5px] font-bold text-[#8796AE] mb-3">우리 회사에서 부르는 말을 넣어 두면 AI가 등록된 이름으로 알아들어요. 회사 직원 모두 같이 써요.</div>
        <div className="flex items-center gap-2 mb-2">
          <label className="sr-only" htmlFor="va-from">이렇게 말하면</label>
          <input id="va-from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="이렇게 말하면 (에이제이)" className={inp} style={inpStyle} />
          <span className="text-[#8796AE] font-black">→</span>
          <label className="sr-only" htmlFor="va-to">이렇게 넣기</label>
          <input id="va-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="등록 이름 (AJ네트웍스)" className={inp} style={inpStyle} />
        </div>
        <button type="button" onClick={add} disabled={busy || !from.trim() || !to.trim()} className="h-11 rounded-xl text-[14px] font-black text-white disabled:opacity-40 mb-2" style={{ background: "#2563EB" }}>추가</button>
        {msg && <div className="text-[12.5px] font-bold text-[#93C5FD] mb-2">{msg}</div>}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {list.length === 0 && <div className="py-6 text-center text-[13px] font-bold text-[#6B7A95]">아직 넣은 말이 없어요</div>}
          {list.map((x) => (
            <div key={x.from} className="flex items-center gap-2 py-2.5 border-b border-[#13213D]">
              <span className="text-[14px] font-black">{x.from}</span><span className="text-[#6B7A95]">→</span><span className="text-[14px] font-black text-[#93C5FD] flex-1 min-w-0 truncate">{x.to}</span>
              <button type="button" onClick={() => save(list.filter((y) => y.from !== x.from))} disabled={busy} className="h-8 px-2.5 rounded-lg text-[12px] font-black" style={{ border: "1px solid #5B2730", color: "#F87171" }}>삭제</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
