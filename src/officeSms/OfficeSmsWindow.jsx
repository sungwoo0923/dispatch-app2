// ======================= src/officeSms/OfficeSmsWindow.jsx =======================
// 💬 2026-11-18 사내문자 — PC 오른쪽 아래 떠 있는 창. 내 업무폰으로 기사님과 문자를 주고받는다(대화처럼)
//  · 왼쪽: 대화방(기사 이름 · 마지막 내용 · 안 읽은 수) · 오른쪽: 말풍선 + 입력칸(Enter 보내기, Shift+Enter 줄바꿈)
//  · 보낸 문자: 대기 → 보내는 중 → 보냄(업무폰이 보냄) / 실패(이유 + 다시 보내기)
//  · 받은 문자: 업무폰 앱이 몇 초 안에 올린다 — 창이 닫혀 있으면 오른쪽 아래에 짧게 알려 준다
//  🔒 smsBox/{내 uid} 만 읽는다 — 다른 사람(관리자 포함)의 문자는 규칙에서 막힌다
import React from "react";
import { FabButton, WinHeader, ResizeGrip, useWinSize } from "../FloatDock";
import { kpConfirm, kpPrompt } from "../kpDialog";
import { watchBox, watchMsgs, queueSms, resendSms, markRead, deleteThread, getSmsRoute, setSmsRoute, OFFICE_SMS_OPEN_EVENT, OFFICE_SMS_ROUTE_EVENT } from "./officeSmsStore";
import { normPeer, fmtPhone, smsBytesOf, phoneState, buildNameBook, groupThreads, threadMessages, statusText, filterThreads, timeLabel, toMs } from "./officeSmsCore";
const APK_URL = "https://github.com/sungwoo0923/dispatch-app2/releases/download/driver-apk-latest/LogisWeb-Driver.apk"; // DriverAppGuide.jsx 와 같은 주소

const NAVY = "#1B2B4B";
const PRESETS = { S: { w: 560, h: 480 }, M: { w: 720, h: 600 }, L: { w: 920, h: 720 } };

function Dot({ state }) {
  const c = state === "on" ? "#22C55E" : state === "auth" ? "#F59E0B" : "#EF4444";
  return <span style={{ width: 8, height: 8, borderRadius: 4, background: c, display: "inline-block", boxShadow: `0 0 0 3px ${c}33` }} />;
}

function SetupGuide({ route, onRoute, st }) {
  return (
    <div style={{ padding: 18, fontSize: 13.5, color: "#3A4A66", lineHeight: 1.7, wordBreak: "keep-all", overflowY: "auto" }}>
      <div style={{ fontSize: 16, fontWeight: 900, color: "#0F1A30" }}>업무폰을 연결해 주세요</div>
      <div style={{ marginTop: 4, color: "#5B6B85" }}>한 번만 하면 돼요. 그다음부터는 이 창에서 기사님과 문자를 주고받아요.</div>
      <ol style={{ margin: "12px 0 0", paddingLeft: 20 }}>
        <li>업무폰(안드로이드)에 <b>LogisWeb 앱</b>을 설치해요. <a href={APK_URL} style={{ color: "#2D4C82", fontWeight: 800 }}>앱 받기</a></li>
        <li>앱 첫 화면 아래 <b>[직원(사무실) 계정으로 로그인]</b>을 누르고 <b>내 아이디</b>로 로그인해요.</li>
        <li>메뉴 → <b>설정 → 업무폰 문자 연결</b>에서 <b>[연결하기]</b>를 눌러요.</li>
        <li>문자 권한을 <b>허용</b>하면 끝이에요. 이 창 위에 <b>● 업무폰 연결됨</b>이 떠요.</li>
      </ol>
      <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 12, background: "#F2F6FC", fontSize: 12.5 }}>
        🔒 주고받은 문자는 <b>나만</b> 볼 수 있어요. 최고관리자도 못 봐요.<br />
        업무폰은 아이폰이 아닌 <b>안드로이드</b>만 돼요.
      </div>
      {st.state !== "none" && <div style={{ marginTop: 10, fontSize: 12.5, color: "#B4342A", fontWeight: 700 }}>{st.label}{st.device ? ` · ${st.device}` : ""} — 업무폰에서 LogisWeb 앱을 한 번 열어 주세요.</div>}
      <RouteSwitch route={route} onRoute={onRoute} />
    </div>
  );
}

function RouteSwitch({ route, onRoute }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: "#5B6B85", marginBottom: 6 }}>문자 보내기 버튼을 누르면</div>
      <div style={{ display: "inline-flex", padding: 3, borderRadius: 12, background: "#EEF2F8", gap: 3 }}>
        {[["office", "사내문자(업무폰)"], ["phone", "휴대폰과 연결"]].map(([v, l]) => (
          <button key={v} type="button" onClick={() => onRoute(v)} data-kp={`office-sms-route-${v}`}
            style={{ height: 32, padding: "0 12px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 900, background: route === v ? NAVY : "transparent", color: route === v ? "#fff" : "#5B6B85" }}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export default function OfficeSmsWindow({ user, drivers = [], contacts = [], controlledOpen, onOpenChange, fabBottom = 216 }) {
  const uid = user?.uid || "";
  const [openLocal, setOpenLocal] = React.useState(false);
  const open = controlledOpen ?? openLocal;
  const setOpen = React.useCallback((v) => { if (onOpenChange) onOpenChange(v); else setOpenLocal(v); }, [onOpenChange]);
  const [box, setBox] = React.useState(null);
  const [msgs, setMsgs] = React.useState([]);
  const [loadErr, setLoadErr] = React.useState("");
  const [route, setRoute] = React.useState(null);
  const [peer, setPeer] = React.useState("");
  const [draftName, setDraftName] = React.useState("");
  const [q, setQ] = React.useState("");
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [showSet, setShowSet] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());
  const [toast, setToast] = React.useState(null);
  const win = useWinSize("officeSms", PRESETS, { w: 480, h: 400 });
  const listEndRef = React.useRef(null);
  const seenInRef = React.useRef(null);

  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(t); }, []);
  React.useEffect(() => watchBox(uid, setBox), [uid]);
  React.useEffect(() => watchMsgs(uid, (l) => { setMsgs(l); setLoadErr(""); }, (e) => setLoadErr(e?.code || String(e))), [uid]);
  React.useEffect(() => {
    let alive = true;
    getSmsRoute(uid).then((v) => { if (alive) setRoute(v); });
    const h = (e) => setRoute(e.detail);
    window.addEventListener(OFFICE_SMS_ROUTE_EVENT, h);
    return () => { alive = false; window.removeEventListener(OFFICE_SMS_ROUTE_EVENT, h); };
  }, [uid]);
  // 다른 화면의 [문자 보내기] → 이 창 열기(그 대화방으로)
  React.useEffect(() => {
    const h = (e) => {
      const d = e.detail || {};
      if (d.peer) { setPeer(normPeer(d.peer)); setDraftName(d.name || ""); }
      setShowSet(false);
      setOpen(true);
    };
    window.addEventListener(OFFICE_SMS_OPEN_EVENT, h);
    return () => window.removeEventListener(OFFICE_SMS_OPEN_EVENT, h);
  }, [setOpen]);

  const book = React.useMemo(() => buildNameBook([
    ...(drivers || []).map((d) => ({ name: d.이름 || d.name || d.기사명 || "", phone: d.전화번호 || d.phone || d.휴대폰 || "" })),
    ...(contacts || []),
  ]), [drivers, contacts]);
  const threads = React.useMemo(() => groupThreads(msgs, book), [msgs, book]);
  const shown = React.useMemo(() => filterThreads(threads, q), [threads, q]);
  const conv = React.useMemo(() => (peer ? threadMessages(msgs, peer) : []), [msgs, peer]);
  const totalUnread = threads.reduce((a, t) => a + t.unread, 0);
  const st = phoneState(box, now);
  const curName = book[peer] || threads.find((t) => t.peer === peer)?.name || draftName || "";

  // 창이 닫혀 있을 때 새로 받은 문자 → 짧은 알림
  React.useEffect(() => {
    const ins = msgs.filter((m) => m.dir === "in");
    if (seenInRef.current === null) { seenInRef.current = new Set(ins.map((m) => m.id)); return; }
    const fresh = ins.filter((m) => !seenInRef.current.has(m.id) && m.read !== true && Date.now() - toMs(m.at) < 10 * 60000);
    ins.forEach((m) => seenInRef.current.add(m.id));
    if (fresh.length && !(open && normPeer(fresh[0].peer) === peer)) {
      const m = fresh[0];
      setToast({ peer: normPeer(m.peer), name: book[normPeer(m.peer)] || fmtPhone(m.peer), body: m.body, n: fresh.length });
    }
  }, [msgs]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 8000); return () => clearTimeout(t); }, [toast]);

  // 대화방을 보고 있으면 읽음
  React.useEffect(() => {
    if (!open || !peer || !uid || document.visibilityState === "hidden") return;
    const unread = conv.filter((m) => m.dir === "in" && m.read !== true);
    if (unread.length) markRead(uid, unread).catch(() => {});
  }, [open, peer, conv, uid]);
  React.useEffect(() => { if (open) listEndRef.current?.scrollIntoView({ block: "end" }); }, [open, peer, conv.length]);

  const changeRoute = async (v) => { setRoute(v); try { await setSmsRoute(v, uid); } catch { /* 무시 */ } };

  const send = async () => {
    const body = text.trim();
    if (!body || !peer || busy) return;
    setBusy(true);
    try {
      await queueSms(uid, [{ phone: peer, name: curName }], body, { source: "사내문자 창" });
      setText("");
    } catch (e) {
      setLoadErr(e?.code || String(e));
    } finally { setBusy(false); }
  };

  const newChat = async () => {
    const v = await kpPrompt("받는 사람 휴대폰 번호 또는 기사 이름", "", { title: "새 대화" });
    if (v == null) return;
    const s = String(v).trim();
    let p = normPeer(s);
    if (!/^\d{8,12}$/.test(p)) {
      const hit = Object.entries(book).filter(([, n]) => n.includes(s));
      if (hit.length === 1) p = hit[0][0];
      else if (hit.length > 1) { setQ(s); return; }
      else { await kpConfirm("번호를 찾지 못했어요. 휴대폰 번호를 숫자로 넣어 주세요.", { title: "새 대화", okText: "확인" }); return; }
    }
    setPeer(p); setDraftName(book[p] || "");
  };

  const removeThread = async () => {
    if (!peer) return;
    const ok = await kpConfirm(`${curName || fmtPhone(peer)} 대화를 프로그램에서 지울까요?\n업무폰 문자함에는 그대로 남아 있어요.`, { title: "대화 지우기", okText: "지우기", danger: true });
    if (!ok) return;
    await deleteThread(uid, conv).catch(() => {});
    setPeer("");
  };

  if (!uid) return null;
  const showFab = route === "office" || (box && box.linked !== false) || msgs.length > 0;

  return (
    <>
      {showFab && (
        <FabButton bottom={fabBottom} active={open} title="사내문자" badge={totalUnread} onClick={() => setOpen(!open)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10 18.5h4" /><path d="M9 8h6M9 11.5h4" /></svg>
        </FabButton>
      )}

      {toast && !open && (
        <button type="button" onClick={() => { setPeer(toast.peer); setToast(null); setOpen(true); }} data-ro-allow
          style={{ position: "fixed", right: 72, bottom: fabBottom, zIndex: 99997, maxWidth: 320, textAlign: "left", border: "none", cursor: "pointer", background: "#0F1A30", color: "#fff", borderRadius: 14, padding: "10px 14px", boxShadow: "0 14px 32px rgba(15,26,48,.35)", fontFamily: "'Noto Sans KR',sans-serif" }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#8FB0F0", letterSpacing: "0.12em" }}>사내문자 · 새 문자{toast.n > 1 ? ` ${toast.n}건` : ""}</div>
          <div style={{ fontSize: 13.5, fontWeight: 900, marginTop: 2 }}>{toast.name}</div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{toast.body}</div>
        </button>
      )}

      {open && (
        <div data-ro-allow data-kp="office-sms-window" style={{ position: "fixed", bottom: 24, right: 72, width: win.w, height: win.h, zIndex: 99999, background: "#fff", borderRadius: 18, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 30px 70px rgba(11,20,40,.35)", border: "1px solid #DCE3EE", fontFamily: "'Noto Sans KR',sans-serif" }}>
          <ResizeGrip onMouseDown={win.startDrag} />
          <WinHeader code="OFFICE SMS" title="사내문자" sub="🔒 나만 보여요" preset={win.preset} onPreset={win.setPreset} onClose={() => setOpen(false)}
            right={(
              <>
                <span title={st.device || ""} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 10px", borderRadius: 99, background: "rgba(255,255,255,.12)", fontSize: 11.5, fontWeight: 800 }}>
                  <Dot state={st.state} />{st.label}
                </span>
                <button type="button" title="설정 · 연결 방법" onClick={() => setShowSet((v) => !v)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer", background: showSet ? "#fff" : "rgba(255,255,255,0.12)", color: showSet ? NAVY : "#fff", fontSize: 14, fontWeight: 900 }}>⚙</button>
              </>
            )} />

          {(showSet || st.state === "none") ? (
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              {showSet && st.state !== "none" && (
                <div style={{ padding: 18, fontSize: 13.5, color: "#3A4A66", lineHeight: 1.7 }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#0F1A30" }}>설정</div>
                  <div style={{ marginTop: 6 }}><Dot state={st.state} /> <b>{st.label}</b>{st.device ? ` · ${st.device}` : ""}{st.lastMs ? ` · 마지막 확인 ${timeLabel(st.lastMs, now)}` : ""}</div>
                  <div style={{ marginTop: 4, color: "#5B6B85", fontSize: 12.5 }}>업무폰 연결을 끊거나 다른 폰으로 바꾸려면 업무폰 앱 › 설정 › 업무폰 문자 연결에서 해요.</div>
                  <RouteSwitch route={route} onRoute={changeRoute} />
                  <button type="button" onClick={() => setShowSet(false)} style={{ marginTop: 16, height: 38, padding: "0 16px", borderRadius: 10, border: "none", background: NAVY, color: "#fff", fontWeight: 900, cursor: "pointer" }}>대화로 돌아가기</button>
                </div>
              )}
              {st.state === "none" && <SetupGuide route={route} onRoute={changeRoute} st={st} />}
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
              {/* 대화방 목록 */}
              <div style={{ width: Math.min(250, Math.round(win.w * 0.36)), borderRight: "1px solid #EEF1F6", display: "flex", flexDirection: "column", minHeight: 0, background: "#FAFBFD" }}>
                <div style={{ padding: 10, display: "flex", gap: 6 }}>
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 번호 검색" style={{ flex: 1, minWidth: 0, height: 34, borderRadius: 10, border: "1px solid #E3E8F0", padding: "0 10px", fontSize: 13, outline: "none" }} />
                  <button type="button" onClick={newChat} title="새 대화" style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: NAVY, color: "#fff", fontSize: 18, fontWeight: 900, cursor: "pointer" }}>+</button>
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {shown.length === 0 && <div style={{ padding: 16, fontSize: 12.5, color: "#9AA9C3", textAlign: "center" }}>{q ? "찾는 대화가 없어요" : "아직 주고받은 문자가 없어요"}</div>}
                  {shown.map((t) => (
                    <button key={t.peer} type="button" onClick={() => { setPeer(t.peer); setDraftName(""); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderBottom: "1px solid #EEF1F6", cursor: "pointer", background: t.peer === peer ? "#EAF0FA" : "transparent" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 900, color: "#0F1A30", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name || fmtPhone(t.peer)}</span>
                        <span style={{ fontSize: 10.5, color: "#9AA9C3", flexShrink: 0 }}>{timeLabel(t.lastAt, now)}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#5B6B85", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last?.dir === "out" ? "나: " : ""}{t.last?.body}</span>
                        {t.unread > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#E5332A", color: "#fff", fontSize: 10.5, fontWeight: 900, display: "grid", placeItems: "center" }}>{t.unread}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 대화 */}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
                {!peer ? (
                  <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#9AA9C3", fontSize: 13, textAlign: "center", padding: 20, lineHeight: 1.7 }}>
                    왼쪽에서 대화를 고르거나 <b style={{ color: NAVY }}>+</b> 를 눌러 새 대화를 시작해요.<br />배차 화면의 [문자 보내기]도 여기로 와요.
                    {loadErr && <div style={{ color: "#B4342A", marginTop: 8 }}>불러오지 못했어요({loadErr})</div>}
                  </div>
                ) : (
                  <>
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid #EEF1F6", display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 900, color: "#0F1A30" }}>{curName || fmtPhone(peer)}</div>
                        {curName && <div style={{ fontSize: 11.5, color: "#7A879C" }}>{fmtPhone(peer)}</div>}
                      </div>
                      <button type="button" onClick={removeThread} title="프로그램에서 대화 지우기" style={{ height: 28, padding: "0 10px", borderRadius: 8, border: "1px solid #E3E8F0", background: "#fff", color: "#7A879C", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>대화 지우기</button>
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", background: "#F4F6FA" }}>
                      {conv.length === 0 && <div style={{ textAlign: "center", color: "#9AA9C3", fontSize: 12.5, marginTop: 20 }}>첫 문자를 보내 보세요</div>}
                      {conv.map((m, i) => {
                        const out = m.dir === "out";
                        const at = toMs(m.at);
                        const prev = conv[i - 1];
                        const newDay = !prev || new Date(toMs(prev.at)).toDateString() !== new Date(at).toDateString();
                        const stt = statusText(m, now);
                        return (
                          <React.Fragment key={m.id}>
                            {newDay && <div style={{ textAlign: "center", margin: "8px 0", fontSize: 11, color: "#9AA9C3", fontWeight: 700 }}>{new Date(at).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}</div>}
                            <div style={{ display: "flex", justifyContent: out ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 6, margin: "4px 0" }}>
                              {out && (
                                <div style={{ textAlign: "right", fontSize: 10.5, color: m.status === "failed" ? "#B4342A" : "#9AA9C3", fontWeight: 700, lineHeight: 1.4 }}>
                                  {stt && <div>{stt}{m.from === "phone" ? " · 휴대폰" : ""}</div>}
                                  {!stt && m.from === "phone" && <div>휴대폰</div>}
                                  <div>{timeLabel(at, now)}</div>
                                </div>
                              )}
                              <div style={{ maxWidth: "72%", padding: "8px 12px", borderRadius: out ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: out ? (m.status === "failed" ? "#FDECEC" : NAVY) : "#fff", color: out && m.status !== "failed" ? "#fff" : "#0F1A30", fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", border: out ? "none" : "1px solid #E3E8F0", opacity: out && (m.status === "queued" || m.status === "sending") ? 0.75 : 1 }}>
                                {m.body}
                                {m.status === "failed" && (
                                  <div style={{ marginTop: 6, fontSize: 11.5, color: "#B4342A", fontWeight: 700 }}>
                                    {m.err || "보내지 못했어요"}
                                    <button type="button" onClick={() => resendSms(uid, m).catch(() => {})} style={{ marginLeft: 8, height: 24, padding: "0 8px", borderRadius: 7, border: "none", background: "#B4342A", color: "#fff", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>다시 보내기</button>
                                  </div>
                                )}
                              </div>
                              {!out && <div style={{ fontSize: 10.5, color: "#9AA9C3", fontWeight: 700 }}>{timeLabel(at, now)}</div>}
                            </div>
                          </React.Fragment>
                        );
                      })}
                      <div ref={listEndRef} />
                    </div>
                    <div style={{ borderTop: "1px solid #EEF1F6", padding: 10, background: "#fff" }}>
                      {st.state !== "on" && <div style={{ fontSize: 11.5, color: "#B4342A", fontWeight: 700, marginBottom: 6 }}>{st.label} — 보낸 문자는 업무폰이 다시 연결되면 나가요(30분 안)</div>}
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="문자 내용 (Enter 보내기 · Shift+Enter 줄바꿈)" data-kp="office-sms-input"
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
                          style={{ flex: 1, minWidth: 0, resize: "none", borderRadius: 12, border: "1px solid #E3E8F0", padding: "8px 10px", fontSize: 13.5, outline: "none", fontFamily: "inherit", lineHeight: 1.5, maxHeight: 140 }} />
                        <button type="button" onClick={send} disabled={!text.trim() || busy} data-kp="office-sms-send"
                          style={{ height: 44, padding: "0 16px", borderRadius: 12, border: "none", background: text.trim() ? NAVY : "#C2CBD9", color: "#fff", fontSize: 14, fontWeight: 900, cursor: text.trim() ? "pointer" : "default" }}>보내기</button>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 10.5, color: "#9AA9C3", textAlign: "right" }}>{smsBytesOf(text)}바이트 · {smsBytesOf(text) > 90 ? "장문(여러 조각으로 나가요)" : "단문"}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
