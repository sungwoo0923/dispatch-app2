// ======================= src/officeSms/OfficeSmsWindow.jsx =======================
// 💬 2026-11-18 사내문자 — PC 오른쪽 아래 버튼 · 화면 안에 떠 있는 창 · 새 문자 알림 · 별도 창 띄우기
//  화면 본체는 OfficeSmsPanel(별도 창 /sms-window 도 같은 것). 띄우는 방식(화면 안 | 별도 창)은 이 PC에 기억
//  🔒 smsBox/{내 uid} 만 읽는다 — 다른 사람(관리자 포함)의 문자는 규칙에서 막힌다
import React from "react";
import { FabButton, ResizeGrip, SizeButtons, useWinSize } from "../FloatDock";
import { watchBox, watchMsgs, getSmsRoute, setSmsRoute, OFFICE_SMS_OPEN_EVENT, OFFICE_SMS_ROUTE_EVENT } from "./officeSmsStore";
import { normPeer, fmtPhone, buildBookKinds, toMs } from "./officeSmsCore";
import { getWinMode, setWinMode, openSmsPopup, popupOpen, smsChannel, postSms } from "./officeSmsPopup";
import OfficeSmsPanel from "./OfficeSmsPanel";

const PRESETS = { S: { w: 600, h: 520 }, M: { w: 800, h: 640 }, L: { w: 1000, h: 760 } };

/** 업무폰 상태 · 문자 · 보내기 방식 구독(화면 안 창 · 별도 창 같이 씀) */
export function useOfficeSmsData(uid) {
  const [box, setBox] = React.useState(null);
  const [msgs, setMsgs] = React.useState([]);
  const [loadErr, setLoadErr] = React.useState("");
  const [route, setRoute] = React.useState(null);
  React.useEffect(() => watchBox(uid, setBox), [uid]);
  React.useEffect(() => watchMsgs(uid, (l) => { setMsgs(l); setLoadErr(""); }, (e) => setLoadErr(e?.code || String(e))), [uid]);
  React.useEffect(() => {
    let alive = true;
    getSmsRoute(uid).then((v) => { if (alive) setRoute(v); });
    const h = (e) => setRoute(e.detail);
    window.addEventListener(OFFICE_SMS_ROUTE_EVENT, h);
    return () => { alive = false; window.removeEventListener(OFFICE_SMS_ROUTE_EVENT, h); };
  }, [uid]);
  const changeRoute = React.useCallback(async (v) => { setRoute(v); try { await setSmsRoute(v, uid); } catch { /* 무시 */ } }, [uid]);
  return { box, msgs, loadErr, route, changeRoute };
}

export default function OfficeSmsWindow({ user, drivers = [], contacts = [], controlledOpen, onOpenChange, fabBottom = 216 }) {
  const uid = user?.uid || "";
  const [openLocal, setOpenLocal] = React.useState(false);
  const open = controlledOpen ?? openLocal;
  const setOpen = React.useCallback((v) => { if (onOpenChange) onOpenChange(v); else setOpenLocal(v); }, [onOpenChange]);
  const { box, msgs, loadErr, route, changeRoute } = useOfficeSmsData(uid);
  const [winMode, setMode] = React.useState(getWinMode);
  const [openReq, setOpenReq] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const [blocked, setBlocked] = React.useState(false);
  const win = useWinSize("officeSms2", PRESETS, { w: 420, h: 420 });
  const seenInRef = React.useRef(null);
  const { book, kinds } = React.useMemo(() => buildBookKinds(drivers, contacts), [drivers, contacts]);

  // 별도 창에 이름표 넘기기(열릴 때 hello로 달라고 한다)
  React.useEffect(() => { postSms({ type: "book", book, kinds }); }, [book, kinds]);
  React.useEffect(() => {
    const ch = smsChannel(); if (!ch) return undefined;
    const h = (e) => { if (e.data?.type === "hello") postSms({ type: "book", book, kinds }); };
    ch.addEventListener("message", h);
    return () => ch.removeEventListener("message", h);
  }, [book, kinds]);
  React.useEffect(() => {
    const h = (e) => setMode(e.detail === "popup" ? "popup" : "float");
    const st = (e) => { if (e.key === "kpOfficeSmsWinMode") setMode(getWinMode()); }; // 별도 창에서 바꾼 것
    window.addEventListener("kp-office-sms-winmode", h); window.addEventListener("storage", st);
    return () => { window.removeEventListener("kp-office-sms-winmode", h); window.removeEventListener("storage", st); };
  }, []);

  const show = React.useCallback((req = {}) => {
    if (getWinMode() === "popup") {
      if (openSmsPopup(req.peer || "", req.name || "")) { setOpen(false); setBlocked(false); return; }
      setBlocked(true); // 팝업 차단 — 화면 안으로
    }
    setOpenReq({ ...req, ts: Date.now() });
    setOpen(true);
  }, [setOpen]);

  // 다른 화면의 [문자 보내기] → 이 창(또는 별도 창) 열기
  React.useEffect(() => {
    const h = (e) => show(e.detail || {});
    window.addEventListener(OFFICE_SMS_OPEN_EVENT, h);
    return () => window.removeEventListener(OFFICE_SMS_OPEN_EVENT, h);
  }, [show]);

  const changeWinMode = (v) => {
    setWinMode(v); setMode(v);
    if (v === "popup" && openSmsPopup()) setOpen(false);
  };

  // 새로 받은 문자 → 짧은 알림(창을 안 보고 있을 때)
  React.useEffect(() => {
    const ins = msgs.filter((m) => m.dir === "in");
    if (seenInRef.current === null) { seenInRef.current = new Set(ins.map((m) => m.id)); return; }
    const fresh = ins.filter((m) => !seenInRef.current.has(m.id) && m.read !== true && Date.now() - toMs(m.at) < 10 * 60000);
    ins.forEach((m) => seenInRef.current.add(m.id));
    if (fresh.length && !open && !popupOpen()) {
      const m = fresh[0]; const p = normPeer(m.peer);
      setToast({ peer: p, name: book[p] || "", body: m.body, n: fresh.length });
    }
  }, [msgs]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 9000); return () => clearTimeout(t); }, [toast]);

  if (!uid) return null;
  const unread = msgs.filter((m) => m.dir === "in" && m.read !== true).length;
  const showFab = route === "office" || (box && box.linked !== false) || msgs.length > 0;

  return (
    <>
      {showFab && (
        <FabButton bottom={fabBottom} active={open} title={winMode === "popup" ? "사내문자 (별도 창)" : "사내문자"} badge={unread} onClick={() => (open ? setOpen(false) : show({}))}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10 18.5h4" /><path d="M9 8h6M9 11.5h4" /></svg>
        </FabButton>
      )}

      {toast && !open && (
        <button type="button" onClick={() => { const t = toast; setToast(null); show({ peer: t.peer, name: t.name }); }} data-ro-allow
          style={{ position: "fixed", right: 72, bottom: fabBottom - 6, zIndex: 99997, width: 320, textAlign: "left", border: "1px solid #E3E8F0", cursor: "pointer", background: "#fff", borderRadius: 18, padding: "12px 14px", boxShadow: "0 18px 44px rgba(15,26,48,.25)", fontFamily: "'Pretendard','Noto Sans KR',sans-serif", display: "flex", gap: 11, alignItems: "flex-start", animation: "kpSmsToast .25s ease-out" }}>
          <style>{"@keyframes kpSmsToast{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}"}</style>
          <span style={{ width: 38, height: 38, borderRadius: 13, background: "linear-gradient(135deg,#1B2B4B,#2D4C82)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 900, flexShrink: 0 }}>{toast.name ? [...toast.name][0] : "#"}</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13.5, fontWeight: 900, color: "#0F1A30" }}>{toast.name || fmtPhone(toast.peer)}</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "#2D4C82" }}>새 문자{toast.n > 1 ? ` ${toast.n}건` : ""}</span>
            </span>
            <span style={{ display: "block", fontSize: 12.5, color: "#3A4A66", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{toast.body}</span>
          </span>
        </button>
      )}

      {open && (
        <div data-ro-allow data-kp="office-sms-window" style={{ position: "fixed", bottom: 24, right: 72, width: win.w, height: win.h, zIndex: 99999, borderRadius: 22, overflow: "hidden", boxShadow: "0 32px 80px rgba(11,20,40,.35), 0 0 0 1px rgba(15,26,48,.08)", background: "#fff" }}>
          <ResizeGrip onMouseDown={win.startDrag} />
          {blocked && (
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 30, background: "#0F1A30", color: "#fff", fontSize: 12, fontWeight: 700, padding: "8px 14px", display: "flex", gap: 8, alignItems: "center" }}>
              브라우저가 새 창(팝업)을 막았어요. 주소창 오른쪽 아이콘에서 이 사이트 팝업을 허용해 주세요.
              <button type="button" onClick={() => setBlocked(false)} style={{ marginLeft: "auto", border: "none", background: "rgba(255,255,255,.15)", color: "#fff", borderRadius: 7, height: 24, padding: "0 8px", cursor: "pointer", fontWeight: 800 }}>닫기</button>
            </div>
          )}
          <OfficeSmsPanel uid={uid} box={box} msgs={msgs} loadErr={loadErr} book={book} kinds={kinds}
            route={route} onRoute={changeRoute} winMode={winMode} onWinMode={changeWinMode}
            variant="float" width={win.w} openReq={openReq} active={open}
            onClose={() => setOpen(false)}
            onPopout={() => { if (openSmsPopup()) { setWinMode("popup"); setMode("popup"); setOpen(false); } else setBlocked(true); }}
            headExtra={<SizeButtons preset={win.preset} onPick={win.setPreset} />} />
        </div>
      )}
    </>
  );
}
