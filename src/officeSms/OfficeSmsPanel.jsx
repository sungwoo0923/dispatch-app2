// ======================= src/officeSms/OfficeSmsPanel.jsx =======================
// 💬 2026-11-18 사내문자 화면 본체 — 화면 안 떠 있는 창(OfficeSmsWindow)과 별도 창(OfficeSmsPopupPage)이 같이 쓴다
//  왼쪽: 대화 목록(사진 대신 이름 첫 글자 · 기사/오더/새 번호 표시 · 안 읽은 수 · 전체/안 읽음)
//  오른쪽: 말풍선 대화(같은 쪽이 이어지면 묶어서 · 날짜 구분 · 보냄 상태) + 자주 쓰는 문구 + 입력칸
//  [새 문자]: 받는사람 칸 — 휴대폰 번호만 적으면 누구에게나(일반 용차 · 거래처). 쉼표 · Enter로 여러 명
//  🔒 데이터는 smsBox/{내 uid} 뿐 — 보안 규칙이 본인만 허용
import React from "react";
import { kpConfirm } from "../kpDialog";
import { queueSms, resendSms, markRead, deleteThread, deleteMsg } from "./officeSmsStore";
import { normPeer, fmtPhone, smsBytesOf, phoneState, groupThreads, threadMessages, statusText, filterThreads, timeLabel, toMs, parseRecipients, suggestRecipients } from "./officeSmsCore";

const APK_URL = "https://github.com/sungwoo0923/dispatch-app2/releases/download/logisweb-apk-latest/LogisWeb.apk"; // 📦 업무폰용 앱(문자 권한 포함 · 플레이스토어 앱과 다름)
const FONT = "'Pretendard','Noto Sans KR','Apple SD Gothic Neo','맑은 고딕',sans-serif";
const C = {
  ink: "#0F1A30", ink2: "#3A4A66", sub: "#7A879C", faint: "#A9B4C6", line: "#E8ECF3", line2: "#F0F3F8",
  navy: "#1B2B4B", navy2: "#2D4C82", sky: "#EAF0FA", bg: "#F5F7FB", chat: "#EEF2F8", red: "#E5332A", redBg: "#FDF0EF", green: "#16A34A",
};
const AV = ["#2D4C82", "#0E7490", "#7C3AED", "#B45309", "#0F766E", "#BE185D", "#4338CA", "#15803D"];
const avColor = (p) => AV[[...String(p || "")].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % AV.length];
const PHRASE_KEY = "kpOfficeSmsPhrases";
const DEFAULT_PHRASES = ["상차지 주소 보내드릴게요", "도착하시면 문자 주세요", "확인 부탁드립니다", "감사합니다 수고하세요"];

function Icon({ d, size = 16, sw = 2, fill = "none" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
}
const I = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  send: <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  pop: <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  close: <><path d="M18 6 6 18M6 6l12 12" /></>,
  trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  phone: <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10 18.5h4" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="m15 18-6-6 6-6" />,
};

function Avatar({ name, peer, size = 38 }) {
  const ch = name ? [...name.trim()][0] : "#";
  return (
    <span style={{ width: size, height: size, borderRadius: size / 2.6, flexShrink: 0, display: "grid", placeItems: "center", background: name ? avColor(peer) : "#DDE4EF", color: name ? "#fff" : C.sub, fontSize: size * 0.42, fontWeight: 900, letterSpacing: "-0.02em" }}>{ch}</span>
  );
}

function KindTag({ kind }) {
  if (!kind) return null;
  const s = kind === "기사" ? { bg: C.sky, c: C.navy2 } : kind === "오더" ? { bg: "#EEF7F1", c: "#15803D" } : { bg: "#F3F4F6", c: C.sub };
  return <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 6px", borderRadius: 6, background: s.bg, color: s.c, flexShrink: 0 }}>{kind}</span>;
}

function StatusPill({ st, compact }) {
  const c = st.state === "on" ? C.green : st.state === "auth" ? "#D97706" : C.red;
  return (
    <span title={st.device || ""} style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 28, padding: "0 11px", borderRadius: 99, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.14)", fontSize: 12, fontWeight: 800, color: "#fff", whiteSpace: "nowrap" }}>
      <span style={{ position: "relative", width: 8, height: 8 }}>
        <span style={{ position: "absolute", inset: 0, borderRadius: 4, background: c }} />
        {st.state === "on" && <span style={{ position: "absolute", inset: -3, borderRadius: 7, border: `2px solid ${c}`, opacity: 0.5, animation: "kpSmsPulse 1.8s ease-out infinite" }} />}
      </span>
      {compact ? (st.state === "on" ? "연결됨" : st.state === "none" ? "연결 전" : "끊김") : st.label}
    </span>
  );
}

function HeadBtn({ title, onClick, children, on }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      style={{ width: 32, height: 32, borderRadius: 10, border: "none", cursor: "pointer", display: "grid", placeItems: "center", background: on ? "#fff" : "rgba(255,255,255,.1)", color: on ? C.navy : "#fff" }}>{children}</button>
  );
}

function Seg({ value, options, onPick, testid }) {
  return (
    <div style={{ display: "inline-flex", padding: 3, borderRadius: 12, background: C.bg, border: `1px solid ${C.line}`, gap: 3 }}>
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onPick(v)} data-kp={testid ? `${testid}-${v}` : undefined}
          style={{ height: 34, padding: "0 14px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 800, background: value === v ? C.navy : "transparent", color: value === v ? "#fff" : C.sub, boxShadow: value === v ? "0 4px 10px rgba(27,43,75,.25)" : "none" }}>{l}</button>
      ))}
    </div>
  );
}

function Card({ title, children, desc }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "16px 18px" }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: C.ink }}>{title}</div>
      {desc && <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3, lineHeight: 1.6 }}>{desc}</div>}
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function loadPhrases() { try { const v = JSON.parse(localStorage.getItem(PHRASE_KEY) || "null"); if (Array.isArray(v)) return v.filter((x) => typeof x === "string").slice(0, 12); } catch { /* 무시 */ } return DEFAULT_PHRASES; }

function Composer({ text, setText, onSend, busy, sendLabel = "보내기", disabledHint, inputRef }) {
  const [phrases, setPhrases] = React.useState(loadPhrases);
  const save = (v) => { setPhrases(v); try { localStorage.setItem(PHRASE_KEY, JSON.stringify(v)); } catch { /* 무시 */ } };
  const bytes = smsBytesOf(text);
  const can = !!text.trim() && !busy;
  React.useEffect(() => {
    const el = inputRef?.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.min(140, Math.max(44, el.scrollHeight))}px`;
  }, [text, inputRef]);
  return (
    <div style={{ borderTop: `1px solid ${C.line}`, background: "#fff", padding: "10px 14px 12px" }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "thin" }}>
        {phrases.map((p) => (
          <span key={p} style={{ display: "inline-flex", alignItems: "center", flexShrink: 0, height: 28, borderRadius: 99, border: `1px solid ${C.line}`, background: C.bg }}>
            <button type="button" onClick={() => { setText(text ? `${text}${/\s$/.test(text) ? "" : " "}${p}` : p); inputRef?.current?.focus(); }} title="입력칸에 넣기"
              style={{ height: 26, padding: "0 4px 0 11px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 700, color: C.ink2 }}>{p}</button>
            <button type="button" onClick={() => save(phrases.filter((x) => x !== p))} title="문구 빼기" style={{ width: 22, height: 26, border: "none", background: "transparent", cursor: "pointer", color: C.faint, fontSize: 12 }}>×</button>
          </span>
        ))}
        <button type="button" disabled={!text.trim() || phrases.includes(text.trim())} onClick={() => save([...phrases, text.trim()].slice(-12))} title="지금 입력한 글을 자주 쓰는 문구로 저장"
          style={{ flexShrink: 0, height: 28, padding: "0 11px", borderRadius: 99, border: `1px dashed ${C.faint}`, background: "#fff", cursor: text.trim() ? "pointer" : "default", fontSize: 12, fontWeight: 800, color: text.trim() ? C.navy2 : C.faint }}>+ 문구 저장</button>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, border: `1.5px solid ${C.line}`, borderRadius: 18, padding: "6px 6px 6px 14px", background: C.bg }}>
        <textarea ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="메시지를 입력하세요" data-kp="office-sms-input"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (can) onSend(); } }}
          style={{ flex: 1, minWidth: 0, resize: "none", border: "none", background: "transparent", outline: "none", fontSize: 14, lineHeight: 1.55, padding: "10px 0", fontFamily: FONT, color: C.ink, height: 44 }} />
        <button type="button" onClick={onSend} disabled={!can} data-kp="office-sms-send" title={sendLabel}
          style={{ height: 40, minWidth: 40, padding: sendLabel === "보내기" ? 0 : "0 14px", borderRadius: 14, border: "none", cursor: can ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#fff", fontSize: 13, fontWeight: 900,
            background: can ? `linear-gradient(135deg, ${C.navy} 0%, ${C.navy2} 100%)` : "#C9D2E0", boxShadow: can ? "0 6px 14px rgba(27,43,75,.3)" : "none", transition: "all .15s" }}>
          <Icon d={I.send} size={17} />{sendLabel !== "보내기" && sendLabel}
        </button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: C.faint, fontWeight: 600 }}>
        <span>{disabledHint || "Enter 보내기 · Shift + Enter 줄바꿈"}</span>
        <span style={{ color: bytes > 90 ? C.navy2 : C.faint }}>{bytes}바이트 · {bytes > 90 ? "장문(여러 조각)" : "단문"}</span>
      </div>
    </div>
  );
}

function SetupGuide({ st }) {
  const steps = [
    ["업무폰에 LogisWeb 앱 설치", <>운송사 직원 · 화주사용 앱이에요(기사앱 말고). 안드로이드만 돼요. <a href={APK_URL} style={{ color: C.navy2, fontWeight: 800 }}>LogisWeb 앱 받기</a></>],
    ["내 아이디로 로그인", "PC에서 쓰는 운송사 계정 그대로 로그인해요"],
    ["설정 → 업무폰 문자 연결 → [연결하기]", "문자 권한을 [허용]하면 끝이에요"],
  ];
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 24px", background: C.bg, display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ width: 56, height: 56, borderRadius: 18, display: "grid", placeItems: "center", color: "#fff", background: `linear-gradient(135deg, ${C.navy}, ${C.navy2})`, boxShadow: "0 12px 26px rgba(27,43,75,.3)" }}><Icon d={I.phone} size={26} /></div>
        <div style={{ fontSize: 20, fontWeight: 900, color: C.ink, marginTop: 16, letterSpacing: "-0.02em" }}>업무폰을 연결해 주세요</div>
        <div style={{ fontSize: 13.5, color: C.sub, marginTop: 4, lineHeight: 1.6 }}>한 번만 하면 돼요. 그다음부터는 여기서 기사님과 문자를 주고받아요.</div>
        <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
          {steps.map(([t, d], i) => (
            <div key={t} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 14px" }}>
              <span style={{ width: 26, height: 26, borderRadius: 13, background: C.sky, color: C.navy2, fontWeight: 900, fontSize: 13, display: "grid", placeItems: "center", flexShrink: 0 }}>{i + 1}</span>
              <div><div style={{ fontSize: 14, fontWeight: 900, color: C.ink }}>{t}</div><div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>{d}</div></div>
            </div>
          ))}
        </div>
        {st.state !== "none" && <div style={{ marginTop: 12, fontSize: 12.5, color: C.red, fontWeight: 700 }}>{st.label}{st.device ? ` · ${st.device}` : ""} — 업무폰에서 LogisWeb 앱을 한 번 열어 주세요.</div>}
        <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: C.ink2, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 12px" }}>
          <span style={{ color: C.navy2 }}><Icon d={I.lock} size={15} /></span>주고받은 문자는 나만 볼 수 있어요. 최고관리자도 못 봐요.
        </div>
      </div>
    </div>
  );
}

function SettingsView({ st, now, route, onRoute, winMode, onWinMode, onBack }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20, background: C.bg }}>
      <div style={{ maxWidth: 520, margin: "0 auto", display: "grid", gap: 12 }}>
        <button type="button" onClick={onBack} style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 4, height: 32, padding: "0 10px 0 6px", borderRadius: 10, border: "none", background: "transparent", color: C.ink2, fontWeight: 800, fontSize: 13, cursor: "pointer" }}><Icon d={I.back} />대화로 돌아가기</button>
        <Card title="업무폰" desc="연결을 끊거나 다른 폰으로 바꾸려면 업무폰 앱 › 설정 › 업무폰 문자 연결에서 해요.">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: st.state === "on" ? "#EAF7EF" : C.redBg, color: st.state === "on" ? C.green : C.red }}><Icon d={I.phone} size={20} /></span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, color: C.ink }}>{st.label}</div>
              <div style={{ fontSize: 12, color: C.sub }}>{st.device || "기기 정보 없음"}{st.lastMs ? ` · 마지막 확인 ${timeLabel(st.lastMs, now)}` : ""}</div>
            </div>
          </div>
        </Card>
        <Card title="문자 보내기 버튼을 누르면" desc="배차 화면 곳곳의 [문자 보내기]가 어떤 방식으로 보낼지 정해요.">
          <Seg value={route} options={[["office", "사내문자(업무폰)"], ["phone", "휴대폰과 연결"]]} onPick={onRoute} testid="office-sms-route" />
        </Card>
        <Card title="사내문자 창 띄우기" desc="별도 창은 브라우저 새 창으로 열려서 모니터 한쪽에 따로 둘 수 있어요. 이 PC에만 기억해요.">
          <Seg value={winMode} options={[["float", "화면 안에"], ["popup", "별도 창으로"]]} onPick={onWinMode} testid="office-sms-winmode" />
        </Card>
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: C.ink2, padding: "4px 4px" }}>
          <span style={{ color: C.navy2 }}><Icon d={I.lock} size={15} /></span>주고받은 문자는 나만 볼 수 있어요. 최고관리자도 못 봐요.
        </div>
      </div>
    </div>
  );
}

export default function OfficeSmsPanel({
  uid, box, msgs, loadErr, book = {}, kinds = {}, route, onRoute, winMode, onWinMode,
  variant = "float", width = 800, onClose, onPopout, headExtra, openReq, active = true,
}) {
  const [peer, setPeer] = React.useState("");
  const [draftName, setDraftName] = React.useState("");
  const [composing, setComposing] = React.useState(false);
  const [chips, setChips] = React.useState([]); // 받는사람(확정)
  const [toInput, setToInput] = React.useState(""); // 받는사람 칸에 치고 있는 글
  const [composeMsg, setComposeMsg] = React.useState("");
  const [q, setQ] = React.useState("");
  const [onlyUnread, setOnlyUnread] = React.useState(false);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [showSet, setShowSet] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());
  const [copied, setCopied] = React.useState(false);
  const endRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const toRef = React.useRef(null);

  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(t); }, []);
  React.useEffect(() => {
    if (!openReq) return;
    if (openReq.peer) { setPeer(normPeer(openReq.peer)); setDraftName(openReq.name || ""); setComposing(false); }
    else if (openReq.compose) { setComposing(true); setPeer(""); }
    setShowSet(false);
  }, [openReq]);

  const threads = React.useMemo(() => groupThreads(msgs, book), [msgs, book]);
  const shown = React.useMemo(() => filterThreads(threads, q).filter((t) => !onlyUnread || t.unread > 0), [threads, q, onlyUnread]);
  const conv = React.useMemo(() => (peer ? threadMessages(msgs, peer) : []), [msgs, peer]);
  const unreadTotal = threads.reduce((a, t) => a + t.unread, 0);
  const st = phoneState(box, now);
  const curName = book[peer] || threads.find((t) => t.peer === peer)?.name || draftName || "";
  const kindOf = (p) => kinds[p] || "";
  const typed = React.useMemo(() => parseRecipients(toInput, book), [toInput, book]);
  const recips = React.useMemo(() => {
    const seen = new Set(); const ok = [];
    [...chips, ...typed.ok].forEach((x) => { if (!seen.has(x.phone)) { seen.add(x.phone); ok.push(x); } });
    return { ok, bad: typed.bad };
  }, [chips, typed]);
  const suggests = React.useMemo(() => suggestRecipients(toInput, book, threads).filter((x) => !chips.some((c) => c.phone === x.phone)), [toInput, book, threads, chips]);

  // 보고 있는 대화는 읽음
  React.useEffect(() => {
    if (!active || !peer || !uid || document.visibilityState === "hidden") return;
    const unread = conv.filter((m) => m.dir === "in" && m.read !== true);
    if (unread.length) markRead(uid, unread).catch(() => {});
  }, [active, peer, conv, uid]);
  React.useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [peer, conv.length]);
  React.useEffect(() => { if (peer && !composing) inputRef.current?.focus(); }, [peer, composing]);

  const send = async () => {
    const body = text.trim();
    if (!body || !peer || busy) return;
    setBusy(true);
    try { await queueSms(uid, [{ phone: peer, name: curName }], body, { source: "사내문자 창" }); setText(""); } catch { /* 아래 상태 줄 */ } finally { setBusy(false); }
  };
  const newChat = () => { setComposing(true); setPeer(""); setChips([]); setToInput(""); setComposeMsg(""); setShowSet(false); setTimeout(() => toRef.current?.focus(), 0); };
  const addChips = (list) => setChips((cur) => { const out = [...cur]; list.forEach((x) => { if (!out.some((c) => c.phone === x.phone)) out.push(x); }); return out; });
  // 칸에 친 글 → 받는사람 확정(번호 · 이름표에 하나뿐인 이름). 모르는 글은 칸에 남겨 둔다
  const commitInput = (v = toInput) => {
    const r = parseRecipients(v, book);
    if (r.ok.length) addChips(r.ok);
    setToInput(r.bad.join(", "));
    if (r.bad.length && r.ok.length) setComposeMsg(`번호를 알 수 없어요: ${r.bad.join(", ")}`);
  };
  const pickSuggest = (x) => { addChips([x]); setToInput(""); setComposeMsg(""); toRef.current?.focus(); };
  const removeRecip = (phone) => setChips((cur) => cur.filter((x) => x.phone !== phone));
  const sendNew = async () => {
    const body = text.trim();
    if (busy) return;
    if (!recips.ok.length) { setComposeMsg("받는사람에 휴대폰 번호를 적어 주세요"); return; }
    if (recips.bad.length) { setComposeMsg(`번호를 알 수 없어요: ${recips.bad.join(", ")} — 숫자로 적어 주세요`); return; }
    if (!body) { setComposeMsg("문자 내용을 적어 주세요"); return; }
    if (recips.ok.length > 1) {
      const many = recips.ok.length > 30 ? "\n\n※ 30명이 넘으면 업무폰에 확인 창이 떠요. 업무폰에서 [항상 허용]을 눌러 주세요." : "";
      const ok = await kpConfirm(`${recips.ok.length}명에게 같은 문자를 보낼까요?\n(받는 사람마다 따로 보내져요)${many}`, { title: "새 문자", okText: "보내기" });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await queueSms(uid, recips.ok, body, { source: "사내문자 창" });
      setText(""); setComposing(false); setChips([]); setToInput(""); setComposeMsg("");
      if (recips.ok.length === 1) { setPeer(recips.ok[0].phone); setDraftName(recips.ok[0].name || ""); }
    } catch (e) { setComposeMsg(`보내지 못했어요(${e?.code || e})`); } finally { setBusy(false); }
  };
  const removeThread = async () => {
    if (!peer) return;
    const ok = await kpConfirm(`${curName || fmtPhone(peer)} 대화를 프로그램에서 지울까요?\n업무폰 문자함에는 그대로 남아 있어요.`, { title: "대화 지우기", okText: "지우기", danger: true });
    if (!ok) return;
    await deleteThread(uid, conv).catch(() => {});
    setPeer("");
  };
  const copyNum = () => { try { navigator.clipboard?.writeText(fmtPhone(peer)); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* 무시 */ } };

  const page = variant === "page";
  const sideW = page ? 320 : Math.max(220, Math.min(280, Math.round(width * 0.36)));
  const narrow = !page && width < 560;
  const showList = !narrow || (!peer && !composing);

  // ── 머리말 ──
  const header = (
    <div style={{ position: "relative", flexShrink: 0, padding: page ? "14px 20px" : "12px 14px 12px 28px", display: "flex", alignItems: "center", gap: 12, color: "#fff", background: "linear-gradient(120deg, #0B1428 0%, #1B2B4B 58%, #2D4C82 100%)" }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.07, backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "18px 18px", pointerEvents: "none" }} />
      <span style={{ position: "relative", width: 36, height: 36, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.18)" }}><Icon d={I.phone} size={18} /></span>
      <div style={{ position: "relative", minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.26em", color: "#8FB0F0" }}>OFFICE SMS</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em" }}>사내문자</span>
          {unreadTotal > 0 && <span style={{ fontSize: 11, fontWeight: 900, padding: "1px 7px", borderRadius: 99, background: C.red }}>{unreadTotal}</span>}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.6)" }}><Icon d={I.lock} size={11} />나만 보여요</span>
        </div>
      </div>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
        <StatusPill st={st} compact={!page && width < 640} />
        {onPopout && <HeadBtn title="별도 창으로 띄우기" onClick={onPopout}><Icon d={I.pop} size={15} /></HeadBtn>}
        <HeadBtn title="설정" onClick={() => setShowSet((v) => !v)} on={showSet}><Icon d={I.gear} size={15} /></HeadBtn>
        {headExtra}
        {onClose && <HeadBtn title="닫기" onClick={onClose}><Icon d={I.close} size={15} /></HeadBtn>}
      </div>
    </div>
  );

  // ── 대화 목록 ──
  const list = (
    <div style={{ width: narrow ? "100%" : sideW, flexShrink: 0, borderRight: narrow ? "none" : `1px solid ${C.line}`, display: "flex", flexDirection: "column", minHeight: 0, background: "#fff" }}>
      <div style={{ padding: "12px 12px 8px" }}>
        <button type="button" onClick={newChat} data-kp="office-sms-new" title="새 문자 — 받는사람에 번호만 적으면 누구에게나"
          style={{ width: "100%", height: 40, borderRadius: 12, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, color: "#fff", fontSize: 13.5, fontWeight: 900, background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navy2} 100%)`, boxShadow: "0 6px 14px rgba(27,43,75,.22)" }}>
          <Icon d={I.pen} size={15} />새 문자
        </button>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, height: 36, borderRadius: 11, background: C.bg, border: `1px solid ${C.line}`, padding: "0 10px", color: C.faint }}>
          <Icon d={I.search} size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 번호 · 내용 검색" style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", fontSize: 13, color: C.ink, fontFamily: FONT }} />
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          {[[false, `전체 ${threads.length}`], [true, `안 읽음 ${unreadTotal}`]].map(([v, l]) => (
            <button key={String(v)} type="button" onClick={() => setOnlyUnread(v)} style={{ height: 26, padding: "0 10px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 800, background: onlyUnread === v ? C.ink : "transparent", color: onlyUnread === v ? "#fff" : C.sub }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 8px" }}>
        {shown.length === 0 && (
          <div style={{ padding: "36px 16px", textAlign: "center", color: C.faint, fontSize: 12.5, lineHeight: 1.7 }}>
            {q || onlyUnread ? "해당하는 대화가 없어요" : <>아직 주고받은 문자가 없어요<br />[새 문자]로 시작해 보세요</>}
          </div>
        )}
        {shown.map((t) => {
          const sel = t.peer === peer && !composing;
          const last = t.last || {};
          const failed = last.dir === "out" && last.status === "failed";
          return (
            <button key={t.peer} type="button" onClick={() => { setPeer(t.peer); setDraftName(""); setComposing(false); setShowSet(false); }}
              style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", textAlign: "left", padding: "10px 10px", margin: "1px 0", border: "none", borderRadius: 12, cursor: "pointer", background: sel ? C.sky : "transparent", transition: "background .12s" }}
              onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = C.bg; }} onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = "transparent"; }}>
              <Avatar name={t.name} peer={t.peer} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 13.5, fontWeight: t.unread ? 900 : 800, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name || fmtPhone(t.peer)}</span>
                  <KindTag kind={kindOf(t.peer)} />
                  <span style={{ marginLeft: "auto", fontSize: 10.5, color: t.unread ? C.navy2 : C.faint, fontWeight: 700, flexShrink: 0 }}>{timeLabel(t.lastAt, now)}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                  {failed && <span style={{ color: C.red, display: "flex" }}><Icon d={I.alert} size={13} /></span>}
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: t.unread ? C.ink2 : C.sub, fontWeight: t.unread ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{last.dir === "out" ? "나: " : ""}{last.body}</span>
                  {t.unread > 0 && <span style={{ minWidth: 19, height: 19, padding: "0 6px", borderRadius: 10, background: C.red, color: "#fff", fontSize: 10.5, fontWeight: 900, display: "grid", placeItems: "center" }}>{t.unread}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── 대화 ──
  const groups = [];
  conv.forEach((m, i) => {
    const prev = conv[i - 1];
    const at = toMs(m.at);
    const newDay = !prev || new Date(toMs(prev.at)).toDateString() !== new Date(at).toDateString();
    const join = !newDay && prev && prev.dir === m.dir && at - toMs(prev.at) < 3 * 60000 && prev.status !== "failed";
    if (newDay) groups.push({ day: at });
    if (join) groups[groups.length - 1].items.push(m); else groups.push({ dir: m.dir, items: [m] });
  });

  const convView = (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10, background: "#fff" }}>
        {narrow && <button type="button" onClick={() => setPeer("")} title="목록" style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: C.bg, cursor: "pointer", color: C.ink2, display: "grid", placeItems: "center" }}><Icon d={I.back} /></button>}
        <Avatar name={curName} peer={peer} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 900, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{curName || fmtPhone(peer)}</span>
            <KindTag kind={kindOf(peer) || (curName ? "" : "새 번호")} />
          </div>
          {curName && <div style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>{fmtPhone(peer)}</div>}
        </div>
        <button type="button" onClick={copyNum} title="번호 복사" style={{ height: 30, padding: "0 10px", borderRadius: 9, border: `1px solid ${C.line}`, background: "#fff", color: C.ink2, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800 }}><Icon d={copied ? I.check : I.copy} size={13} />{copied ? "복사됨" : "번호"}</button>
        <button type="button" onClick={removeThread} title="프로그램에서 대화 지우기(휴대폰 문자함은 그대로)" style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${C.line}`, background: "#fff", color: C.sub, cursor: "pointer", display: "grid", placeItems: "center" }}><Icon d={I.trash} size={14} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 18px 14px", background: C.chat }}>
        {conv.length === 0 && <div style={{ textAlign: "center", color: C.faint, fontSize: 12.5, marginTop: 40 }}>첫 문자를 보내 보세요</div>}
        {groups.map((g, gi) => {
          if (g.day) return (
            <div key={`d${gi}`} style={{ display: "flex", justifyContent: "center", margin: "14px 0 8px" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: C.sub, background: "rgba(255,255,255,.8)", padding: "4px 12px", borderRadius: 99 }}>{new Date(g.day).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}</span>
            </div>
          );
          const out = g.dir === "out";
          const lastM = g.items[g.items.length - 1];
          const stt = statusText(lastM, now);
          return (
            <div key={g.items[0].id} style={{ display: "flex", flexDirection: "column", alignItems: out ? "flex-end" : "flex-start", margin: "8px 0", gap: 3 }}>
              {g.items.map((m, k) => {
                const failed = m.status === "failed";
                const pending = m.status === "queued" || m.status === "sending";
                const first = k === 0; const lastOne = k === g.items.length - 1;
                const r = out ? `18px ${first ? 18 : 6}px ${lastOne ? 6 : 6}px 18px` : `${first ? 18 : 6}px 18px 18px ${lastOne ? 6 : 6}px`;
                return (
                  <div key={m.id} style={{ maxWidth: page ? "62%" : "76%" }}>
                    <div style={{ padding: "9px 13px", borderRadius: r, fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
                      background: failed ? "#fff" : out ? `linear-gradient(135deg, ${C.navy} 0%, ${C.navy2} 100%)` : "#fff",
                      color: failed ? C.ink : out ? "#fff" : C.ink, border: failed ? `1.5px solid ${C.red}` : out ? "none" : `1px solid ${C.line}`,
                      boxShadow: out && !failed ? "0 4px 12px rgba(27,43,75,.18)" : "0 1px 2px rgba(16,24,40,.04)", opacity: pending ? 0.72 : 1 }}>
                      {m.body}
                    </div>
                    {failed && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: C.red, fontWeight: 700 }}><Icon d={I.alert} size={13} />{m.err || "보내지 못했어요"}</span>
                        <button type="button" onClick={() => resendSms(uid, m).catch(() => {})} style={{ height: 24, padding: "0 9px", borderRadius: 8, border: "none", background: C.red, color: "#fff", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>다시 보내기</button>
                        <button type="button" onClick={() => deleteMsg(uid, m).catch(() => {})} style={{ height: 24, padding: "0 8px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", color: C.sub, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>삭제</button>
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: C.faint, padding: "0 4px" }}>
                {out && stt && lastM.status !== "failed" && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: lastM.status === "sent" ? C.navy2 : C.faint }}>
                    <Icon d={lastM.status === "sent" ? I.check : I.clock} size={11} sw={2.6} />{stt}
                  </span>
                )}
                {lastM.from === "phone" && out && <span>휴대폰에서 보냄</span>}
                <span>{timeLabel(toMs(lastM.at), now)}</span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <Composer text={text} setText={setText} onSend={send} busy={busy} inputRef={inputRef}
        disabledHint={st.state !== "on" ? `${st.label} — 다시 연결되면 보내요(30분 안)` : ""} />
    </div>
  );

  const composeView = (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.line}`, background: "#fff", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          {narrow && <button type="button" onClick={() => setComposing(false)} title="목록" style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: C.bg, cursor: "pointer", color: C.ink2, display: "grid", placeItems: "center" }}><Icon d={I.back} /></button>}
          <span style={{ fontSize: 15, fontWeight: 900, color: C.ink }}>새 문자</span>
          <span style={{ fontSize: 12, color: C.sub }}>번호만 적으면 누구에게나 · 여러 명은 쉼표</span>
          <button type="button" onClick={() => setComposing(false)} style={{ marginLeft: "auto", height: 28, padding: "0 10px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", color: C.sub, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>취소</button>
        </div>
        <div onClick={() => toRef.current?.focus()} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, minHeight: 44, padding: "6px 10px", borderRadius: 14, border: `1.5px solid ${C.navy2}`, background: "#fff", boxShadow: "0 0 0 4px rgba(45,76,130,.08)", cursor: "text" }}>
          <span style={{ fontSize: 12.5, fontWeight: 900, color: C.navy2, marginRight: 2 }}>받는사람</span>
          {chips.map((x) => (
            <span key={x.phone} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 4px 0 4px", borderRadius: 99, background: C.sky, color: C.navy, fontSize: 12, fontWeight: 800 }}>
              <Avatar name={x.name} peer={x.phone} size={20} />{x.name ? `${x.name} ` : ""}{fmtPhone(x.phone)}
              <button type="button" onClick={(e) => { e.stopPropagation(); removeRecip(x.phone); }} title="빼기" style={{ width: 20, height: 20, borderRadius: 10, border: "none", background: "rgba(27,43,75,.1)", color: C.navy, cursor: "pointer", fontSize: 11, lineHeight: 1 }}>×</button>
            </span>
          ))}
          <input ref={toRef} value={toInput}
            onChange={(e) => { const v = e.target.value; setComposeMsg(""); if (/[,;]/.test(v)) commitInput(v.replace(/[,;]\s*$/, "")); else setToInput(v); }}
            onBlur={() => { if (normPeer(toInput).length >= 8) commitInput(); }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" || e.key === "Tab") {
                if (!toInput.trim()) { if (e.key === "Enter" && chips.length) { e.preventDefault(); inputRef.current?.focus(); } return; }
                e.preventDefault();
                if (normPeer(toInput).length >= 8 || !suggests.length) commitInput(); else pickSuggest(suggests[0]);
              }
              if (e.key === "Backspace" && !toInput && chips.length) removeRecip(chips[chips.length - 1].phone);
            }}
            data-kp="office-sms-to" placeholder={chips.length ? "번호 더 넣기" : "010-0000-0000 또는 이름 → Enter"}
            style={{ flex: 1, minWidth: 140, height: 30, border: "none", outline: "none", fontSize: 14, fontFamily: FONT, color: C.ink, background: "transparent" }} />
        </div>
        {suggests.length > 0 && (
          <div style={{ position: "absolute", left: 16, right: 16, top: "calc(100% - 6px)", zIndex: 5, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: "0 18px 40px rgba(15,26,48,.18)", overflow: "hidden", padding: 4 }}>
            {suggests.map((x, i) => (
              <button key={x.phone} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickSuggest(x)}
                style={{ display: "flex", alignItems: "center", width: "100%", gap: 10, padding: "8px 10px", border: "none", borderRadius: 10, background: i === 0 ? C.bg : "#fff", cursor: "pointer", textAlign: "left" }}>
                <Avatar name={x.name} peer={x.phone} size={30} />
                <span style={{ fontSize: 13.5, fontWeight: 800, color: C.ink }}>{x.name || "이름 없음"}</span>
                <KindTag kind={kindOf(x.phone)} />
                <span style={{ marginLeft: "auto", fontSize: 12.5, color: C.sub, fontWeight: 600 }}>{fmtPhone(x.phone)}</span>
              </button>
            ))}
          </div>
        )}
        {(composeMsg || (recips.bad.length > 0 && suggests.length === 0)) && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.red, fontWeight: 700 }}><Icon d={I.alert} size={13} />{composeMsg || `번호를 알 수 없어요: ${recips.bad.join(", ")}`}</div>
        )}
      </div>
      <div style={{ flex: 1, background: C.chat, display: "grid", placeItems: "center", padding: 20 }}>
        <div style={{ textAlign: "center", color: C.sub, fontSize: 13, lineHeight: 1.75 }}>
          <div style={{ width: 52, height: 52, margin: "0 auto 12px", borderRadius: 16, background: "#fff", display: "grid", placeItems: "center", color: C.navy2, boxShadow: "0 6px 16px rgba(15,26,48,.08)" }}><Icon d={I.send} size={22} /></div>
          <b style={{ color: C.ink }}>등록된 기사님이 아니어도 돼요</b><br />휴대폰 번호만 적으면 일반 용차 · 거래처 누구에게나 보내요.<br />답장은 그 번호 대화방으로 와요.
        </div>
      </div>
      <Composer text={text} setText={setText} onSend={sendNew} busy={busy} inputRef={inputRef}
        sendLabel={recips.ok.length > 1 ? `${recips.ok.length}명 보내기` : "보내기"} />
    </div>
  );

  const emptyView = (
    <div style={{ flex: 1, display: "grid", placeItems: "center", background: C.chat, padding: 24 }}>
      <div style={{ textAlign: "center", color: C.sub, fontSize: 13, lineHeight: 1.75 }}>
        <div style={{ width: 60, height: 60, margin: "0 auto 14px", borderRadius: 18, background: "#fff", display: "grid", placeItems: "center", color: C.navy2, boxShadow: "0 8px 20px rgba(15,26,48,.08)" }}><Icon d={I.phone} size={26} /></div>
        <b style={{ color: C.ink, fontSize: 15 }}>대화를 골라 주세요</b><br />왼쪽에서 대화를 고르거나 [새 문자]를 눌러요.<br />배차 화면의 [문자 보내기]도 여기로 와요.
        {loadErr && <div style={{ color: C.red, marginTop: 8 }}>불러오지 못했어요({loadErr})</div>}
      </div>
    </div>
  );

  let body;
  if (showSet) body = <SettingsView st={st} now={now} route={route} onRoute={onRoute} winMode={winMode} onWinMode={onWinMode} onBack={() => setShowSet(false)} />;
  else if (st.state === "none" && !msgs.length) body = <SetupGuide st={st} />;
  else body = (
    <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
      {showList && list}
      {(!narrow || peer || composing) && (composing ? composeView : peer ? convView : emptyView)}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, fontFamily: FONT, color: C.ink, background: "#fff" }}>
      <style>{"@keyframes kpSmsPulse{0%{transform:scale(.6);opacity:.7}100%{transform:scale(1.6);opacity:0}}"}</style>
      {header}
      {body}
    </div>
  );
}
