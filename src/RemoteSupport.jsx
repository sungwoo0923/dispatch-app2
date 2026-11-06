// ======================= src/RemoteSupport.jsx =======================
// ⭐ 2026-11-02 원격지원 — 직원 → 최고관리자 "원격 지원" 요청 · 승인/거절 · 세션
//  ① 요청(직원): [원격 지원 요청] → supportRequests 문서(대기) — 상태를 실시간으로 보고, 취소할 수 있다.
//  ② 처리(최고관리자 관리센터 › 대시보드 › 원격 지원): 승인(화면 공유 / 원격 프로그램) · 거절(사유) · 완료 · 기록
//  ③ 세션 A — 화면 공유(보기 전용, 무료): 직원 브라우저 getDisplayMedia → WebRTC(공용 STUN) →
//     신호(offer/answer/ICE)는 Firestore supportSessions/{id} + callerCandidates/calleeCandidates 하위 컬렉션.
//     같은 세션에 간단한 채팅(messages)과 "포인터"(관리자가 영상을 누르면 직원 화면에 잠깐 원이 뜸).
//     ⚠ 포인터 위치는 "공유된 화면" 기준 비율을 직원 브라우저 창(뷰포트) 비율로 옮긴 것 —
//       탭 공유면 거의 맞고, 전체 화면/창 공유면 브라우저 창 위치·크기만큼 어긋날 수 있다.
//     ⚠ TURN 서버가 없어 회사망(대칭형 NAT·방화벽)에 따라 연결이 안 될 수 있다 → 원격 프로그램으로 진행.
//  ④ 세션 B — 원격 프로그램: AnyDesk / 크롬 원격 데스크톱 안내 + 직원이 원격 번호를 보내면 관리자가 복사.
//  ⑤ ⭐ 2026-11-05 원격 지원 걸기(최고관리자 → 직원): 관리센터 › 원격 지원 › [원격 지원 걸기]에서 직원을 고르면
//     supportRequests 문서(status "invited", initiatedBy "master")가 생기고, 직원 화면에 "동의" 창이 뜬다.
//     직원이 [수락]해야만 진행된다(화면 공유는 브라우저가 공유할 화면을 직원에게 직접 고르게 함) — [거절]하면 "declined".
//     수락 뒤에는 ③/④와 똑같이 흘러간다(approved → in_session → done).
import React from "react";
import { createPortal } from "react-dom";
import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { BannerCard, BannerStyles } from "./BannerCenter";
import { fmtPhone } from "./formatInput";
import { usePlatformLive } from "./PlatformLive"; // ⭐ 2026-11-05 원격 지원 걸기 — 운송사·직원 목록(실시간)

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const ICE = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };
export const SUPPORT_ACTIVE = ["invited", "pending", "approved", "in_session"]; // ⭐ 2026-11-05 invited(관리자가 건 요청) 추가
export const SUPPORT_STATUS = {
  pending: { label: "승인 대기", cls: "bg-[#0F1A30] text-white" },
  invited: { label: "직원 응답 대기", cls: "bg-[#8FB0F0] text-[#0B1428]" }, // ⭐ 2026-11-05 원격 지원 걸기 — 관리자가 보낸 요청
  declined: { label: "직원 거절", cls: "bg-[#F1F4F9] text-[#5B6B85] ring-1 ring-[#DCE3EE]" }, // ⭐ 2026-11-05 원격 지원 걸기
  approved: { label: "승인됨", cls: "bg-[#2D4C82] text-white" },
  in_session: { label: "지원 중", cls: "bg-[linear-gradient(90deg,#1B2B4B,#2D4C82)] text-white" },
  rejected: { label: "거절", cls: "bg-[#F1F4F9] text-[#5B6B85] ring-1 ring-[#DCE3EE]" },
  done: { label: "완료", cls: "bg-[#EEF3FC] text-[#1B2B4B] ring-1 ring-[#C9D6EE]" },
  cancelled: { label: "취소", cls: "bg-white text-[#94A3B8] ring-1 ring-[#E3E8F0]" },
};
export const METHOD_LABEL = { screen: "화면 공유", remote: "원격 프로그램" };
const LINKS = [
  { name: "AnyDesk", url: "https://anydesk.com/ko/downloads", desc: "설치 후 화면에 보이는 9~10자리 '이 데스크' 번호를 아래에 적어 보내 주세요." },
  { name: "크롬 원격 데스크톱", url: "https://remotedesktop.google.com/support", desc: "'지원 받기' → 코드 생성 → 12자리 코드를 아래에 적어 보내 주세요." },
];
const msOf = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);
const pad = (n) => String(n).padStart(2, "0");
const fmt = (v) => { const ms = msOf(v); if (!ms) return "-"; const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const ago = (v) => { const ms = msOf(v); if (!ms) return "방금"; const s = Math.max(0, (Date.now() - ms) / 1000); if (s < 60) return "방금"; if (s < 3600) return `${Math.floor(s / 60)}분 전`; if (s < 86400) return `${Math.floor(s / 3600)}시간 전`; return fmt(v); };
export const canShareScreen = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
const isPhoneUA = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
// 어디서든 이 함수(또는 window 이벤트 "kp-open-remote-support")로 요청 창을 연다
export const openRemoteSupport = () => window.dispatchEvent(new Event("kp-open-remote-support"));

function Chip({ status }) {
  const s = SUPPORT_STATUS[status] || SUPPORT_STATUS.pending;
  return <span className={`inline-flex items-center h-7 px-2.5 rounded-full text-[13px] font-black whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}
const Icon = ({ d, size = 18, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>{d}</svg>
);
export const SUPPORT_ICON = <><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /><path d="M9 10.5l2 2 4-4" /></>;

// ICE 후보를 상대 설명(remoteDescription)이 정해진 뒤에 넣는다(먼저 오면 쌓아 둔다)
function iceSink(pc) {
  const q = [];
  return {
    add(c) { if (pc.remoteDescription) pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}); else q.push(c); },
    flush() { while (q.length) pc.addIceCandidate(new RTCIceCandidate(q.shift())).catch(() => {}); },
  };
}

// ═══════════════════════ 세션 채팅(양쪽 공용) ═══════════════════════
export function SupportChat({ sessionId, me, myName, dark = false, height = 220 }) {
  const [msgs, setMsgs] = React.useState([]);
  const [text, setText] = React.useState("");
  const boxRef = React.useRef(null);
  React.useEffect(() => {
    if (!sessionId) return undefined;
    return onSnapshot(query(collection(db, "supportSessions", sessionId, "messages"), orderBy("at", "asc"), limit(300)),
      (s) => setMsgs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
  }, [sessionId]);
  React.useEffect(() => { const b = boxRef.current; if (b) b.scrollTop = b.scrollHeight; }, [msgs.length]);
  const send = async (e) => {
    e?.preventDefault?.();
    const t = text.trim(); if (!t || !sessionId) return;
    setText("");
    await addDoc(collection(db, "supportSessions", sessionId, "messages"), { from: me, name: myName || "", text: t.slice(0, 1000), at: Date.now(), createdAt: serverTimestamp() }).catch(() => setText(t));
  };
  return (
    <div className={`rounded-2xl overflow-hidden ${dark ? "bg-white/[0.04] ring-1 ring-white/10" : "bg-white ring-1 ring-[#E3E8F0]"}`}>
      <div className={`px-3.5 h-10 flex items-center justify-between text-[13px] font-black ${dark ? "text-white/80 border-b border-white/10" : "text-[#0F1A30] bg-[#F7F9FC] border-b border-[#E8EDF4]"}`}>
        <span>메시지</span><span className={`text-[11.5px] tracking-[0.18em] ${dark ? "text-[#8FB0F0]" : "text-[#94A3B8]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>CHAT</span>
      </div>
      <div ref={boxRef} className="overflow-y-auto px-3 py-2.5 space-y-2" style={{ height }} data-testid="support-chat-list">
        {msgs.length === 0 && <div className={`text-center text-[13.5px] py-6 ${dark ? "text-white/40" : "text-[#9AA9C3]"}`}>궁금한 점을 적어 보내세요</div>}
        {msgs.map((m) => {
          const mine = m.from === me;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[82%] px-3 py-2 rounded-2xl text-[14.5px] leading-snug whitespace-pre-wrap break-words ${mine ? "bg-[#1B2B4B] text-white rounded-br-md" : dark ? "bg-white/10 text-white rounded-bl-md" : "bg-[#EEF2F8] text-[#0F1A30] rounded-bl-md"}`}>
                {!mine && <div className={`text-[11.5px] font-black mb-0.5 ${dark ? "text-[#8FB0F0]" : "text-[#2D4C82]"}`}>{m.from === "master" ? "최고관리자" : m.name || "직원"}</div>}
                {m.text}
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className={`flex gap-2 p-2 ${dark ? "border-t border-white/10" : "border-t border-[#E8EDF4]"}`}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="메시지 입력" data-testid="support-chat-input"
          className={`flex-1 min-w-0 h-11 px-3 rounded-xl text-[15px] outline-none ${dark ? "bg-white/10 text-white placeholder:text-white/40" : "bg-[#F5F7FB] text-[#0F1A30] border border-[#E3E8F0] focus:border-[#2D4C82]"}`} />
        <button type="submit" className="shrink-0 h-11 px-4 rounded-xl bg-[#2D4C82] text-white text-[14.5px] font-black disabled:opacity-50" disabled={!text.trim()}>보내기</button>
      </form>
    </div>
  );
}

// ═══════════════════════ 직원 쪽 — 요청·상태·세션(앱 전체에 한 번 마운트) ═══════════════════════
export function RemoteSupportHost({ user, profile, company = "", mobile = false }) {
  const uid = user?.uid || null;
  const [reqs, setReqs] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const [banners, setBanners] = React.useState([]);
  const [pointer, setPointer] = React.useState(null);
  const [shareState, setShareState] = React.useState(""); // "" | starting | live | connected
  const [err, setErr] = React.useState("");
  const shareRef = React.useRef({ pc: null, stream: null, unsubs: [], sessionId: null, reqId: null });
  const role = profile?.role || "";
  const hidden = !uid || ["driver", "shipper", "cafeUser"].includes(role);

  React.useEffect(() => { const h = () => setOpen(true); window.addEventListener("kp-open-remote-support", h); return () => window.removeEventListener("kp-open-remote-support", h); }, []);
  React.useEffect(() => {
    if (!uid) return undefined;
    let first = true;
    const prev = new Map();
    return onSnapshot(query(collection(db, "supportRequests"), where("uid", "==", uid), limit(30)), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (msOf(b.createdAt) || Date.now()) - (msOf(a.createdAt) || Date.now()));
      setReqs(list);
      if (!first) {
        list.forEach((r) => {
          const b = prev.get(r.id);
          if (!b || b === r.status || b === "invited") return; // ⭐ 2026-11-05 내가 수락/거절한 건 배너로 다시 알리지 않는다
          if (r.status === "approved") setBanners(() => [{ id: `${r.id}-ok-${Date.now()}`, title: "원격 지원이 승인되었습니다", body: (r.mode || r.method) === "remote" ? "원격 프로그램 안내를 확인해 주세요." : "[화면 공유 시작]을 누르면 관리자가 화면을 봅니다." }]);
          if (r.status === "rejected") setBanners(() => [{ id: `${r.id}-no-${Date.now()}`, title: "원격 지원 요청이 거절되었습니다", body: r.rejectReason ? `사유: ${r.rejectReason}` : "" }]);
        });
      }
      list.forEach((r) => prev.set(r.id, r.status));
      first = false;
    }, () => {});
  }, [uid]);

  // ⭐ 2026-11-05 원격 지원 걸기 — 관리자가 건 요청(invited)은 "동의" 창으로 따로 보여 주고, 수락 전에는 진행 중으로 치지 않는다
  const invite = reqs.find((r) => r.status === "invited") || null;
  const active = reqs.find((r) => SUPPORT_ACTIVE.includes(r.status) && r.status !== "invited") || null;
  const latest = reqs.find((r) => r.status !== "invited") || null;
  const [inviteBusy, setInviteBusy] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(() => { try { return localStorage.getItem("kpSupportDismissed") || ""; } catch { return ""; } });
  // 거절 결과는 1일 동안 독에 남긴다(닫으면 숨김)
  const showRejected = !active && latest?.status === "rejected" && dismissed !== latest.id && Date.now() - (msOf(latest.decidedAt) || Date.now()) < 86400000;
  const dockReq = active || (showRejected ? latest : null);

  // ── 화면 공유 정리 ──
  const cleanup = React.useCallback(() => {
    const s = shareRef.current;
    s.unsubs.forEach((u) => { try { u(); } catch { /* 무시 */ } });
    s.stream?.getTracks().forEach((t) => t.stop());
    try { s.pc?.close(); } catch { /* 무시 */ }
    shareRef.current = { pc: null, stream: null, unsubs: [], sessionId: null, reqId: null };
    setShareState(""); setPointer(null);
  }, []);
  const endShare = React.useCallback(async (byMe = true) => {
    const { sessionId, reqId } = shareRef.current;
    cleanup();
    if (!byMe) return;
    if (sessionId) await updateDoc(doc(db, "supportSessions", sessionId), { status: "ended", endedAt: serverTimestamp(), endedBy: "requester" }).catch(() => {});
    if (reqId) await updateDoc(doc(db, "supportRequests", reqId), { status: "done", endedAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => {});
  }, [cleanup]);
  React.useEffect(() => () => cleanup(), [cleanup]);
  // 관리자가 완료/세션 종료 → 내 쪽도 정리
  React.useEffect(() => {
    if (shareRef.current.pc && shareRef.current.committed && (!active || active.status !== "in_session" || active.sessionId !== shareRef.current.sessionId)) cleanup();
  }, [active, cleanup]);

  // ⭐ 2026-11-05 원격 지원 걸기 — preStream: [수락] 클릭 순간에 미리 받아 둔 화면(브라우저는 클릭 직후에만 공유 창을 연다)
  const startShare = async (req, preStream = null) => {
    setErr("");
    if (!preStream && !canShareScreen()) { setErr(isPhoneUA() ? "휴대폰 브라우저는 화면 공유를 지원하지 않습니다 — PC에서 화면 공유가 가능합니다. 관리자가 전화하거나 원격 프로그램 방식으로 바꿔 드립니다." : "이 브라우저는 화면 공유를 지원하지 않습니다(크롬·엣지 최신 버전 권장)."); return; }
    if (shareRef.current.pc) { preStream?.getTracks().forEach((t) => t.stop()); return; }
    setShareState("starting");
    let stream = preStream;
    if (!stream) try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 12, max: 20 } }, audio: false }); }
    catch (e) {
      setShareState("");
      setErr(e?.name === "NotAllowedError" ? "화면 공유가 취소되었습니다."
        : (e?.name === "NotSupportedError" || isPhoneUA()) ? "이 기기에서는 화면 공유를 지원하지 않습니다 — PC에서 화면 공유가 가능합니다. 관리자가 전화하거나 원격 프로그램 방식으로 바꿔 드립니다."
        : `화면 공유를 시작하지 못했습니다 (${e?.name || e?.message || "오류"})`);
      return;
    }
    try {
      const pc = new RTCPeerConnection(ICE);
      const sref = doc(collection(db, "supportSessions"));
      shareRef.current = { pc, stream, unsubs: [], sessionId: sref.id, reqId: req.id };
      const track = stream.getVideoTracks()[0];
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      track.onended = () => endShare(true); // 브라우저의 "공유 중지"
      const early = []; let ready = false;
      pc.onicecandidate = (e) => { if (!e.candidate) return; const c = e.candidate.toJSON(); if (ready) addDoc(collection(sref, "callerCandidates"), c).catch(() => {}); else early.push(c); };
      pc.onconnectionstatechange = () => { if (pc.connectionState === "connected") setShareState("connected"); if (pc.connectionState === "failed") setErr("연결이 끊겼습니다 — 회사 네트워크에 따라 화면 공유가 막힐 수 있습니다. 원격 프로그램으로 진행해 주세요."); };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const surface = track.getSettings?.().displaySurface || "";
      await setDoc(sref, {
        requestId: req.id, requesterUid: uid, requesterName: req.name || "", companyName: req.companyName || "",
        offer: { type: offer.type, sdp: offer.sdp }, status: "waiting", displaySurface: surface,
        viewport: { w: window.innerWidth, h: window.innerHeight }, createdAt: serverTimestamp(),
      });
      ready = true; early.forEach((c) => addDoc(collection(sref, "callerCandidates"), c).catch(() => {}));
      await updateDoc(doc(db, "supportRequests", req.id), { status: "in_session", sessionId: sref.id, updatedAt: serverTimestamp() });
      shareRef.current.committed = true;
      const sink = iceSink(pc);
      let lastPtr = 0;
      shareRef.current.unsubs.push(onSnapshot(sref, (snap) => {
        const d = snap.data(); if (!d) return;
        if (d.answer && !pc.currentRemoteDescription) pc.setRemoteDescription(new RTCSessionDescription(d.answer)).then(() => sink.flush()).catch(() => {});
        if (d.pointer?.at && d.pointer.at !== lastPtr) { lastPtr = d.pointer.at; if (Date.now() - d.pointer.at < 15000) setPointer({ ...d.pointer, key: d.pointer.at }); }
        if (d.status === "ended") endShare(false);
      }, () => {}));
      shareRef.current.unsubs.push(onSnapshot(collection(sref, "calleeCandidates"), (s) => s.docChanges().forEach((c) => { if (c.type === "added") sink.add(c.doc.data()); }), () => {}));
      setShareState("live");
      setOpen(false); // 공유 중엔 내 화면을 가리지 않게 접는다(오른쪽 아래 막대에서 다시 연다)
    } catch (e) {
      console.error("원격지원 화면 공유 시작 실패", e);
      setErr(`화면 공유 연결을 만들지 못했습니다 (${e?.code || e?.message || "오류"})`);
      cleanup();
    }
  };
  // ⭐ 2026-11-05 원격 지원 걸기 — 직원의 동의(수락/거절)
  const acceptInvite = async () => {
    if (!invite || inviteBusy) return;
    setErr(""); setInviteBusy(true);
    const mode = invite.mode || invite.method || "screen";
    let stream = null;
    if (mode === "screen" && canShareScreen() && !isPhoneUA()) {
      try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 12, max: 20 } }, audio: false }); }
      catch (e) { setInviteBusy(false); setErr(e?.name === "NotAllowedError" ? "화면 공유 창을 닫으셨습니다 — 다시 [수락]을 누르면 공유할 화면을 고를 수 있습니다." : `화면 공유를 시작하지 못했습니다 (${e?.name || e?.message || "오류"})`); return; }
    }
    try {
      await updateDoc(doc(db, "supportRequests", invite.id), { status: "approved", respondedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      setInviteBusy(false); setErr(`수락하지 못했습니다 (${e?.code || e?.message || "오류"})`); return;
    }
    setInviteBusy(false);
    if (stream) startShare(invite, stream);
    else setOpen(true); // 원격 프로그램 · 휴대폰 → 안내 창(번호 보내기 / 화면 공유 시작 버튼)
  };
  const declineInvite = async () => {
    if (!invite || inviteBusy) return;
    setInviteBusy(true);
    await updateDoc(doc(db, "supportRequests", invite.id), { status: "declined", respondedAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch((e) => setErr(`거절하지 못했습니다 (${e?.code || ""})`));
    setInviteBusy(false);
  };

  // 포인터 원은 3초 뒤 사라진다
  React.useEffect(() => { if (!pointer) return undefined; const t = setTimeout(() => setPointer(null), 3200); return () => clearTimeout(t); }, [pointer]);

  if (hidden) return null;
  const sharingNow = !!shareState && shareState !== "starting";
  const dockBottom = mobile ? 92 : 24;
  return createPortal(
    <>
      <BannerStyles />
      <style>{SUPPORT_CSS}</style>
      {/* 포인터 — 관리자가 누른 곳(공유 화면 비율 → 내 브라우저 창 비율) */}
      {pointer && (
        <div key={pointer.key} className="fixed inset-0 pointer-events-none z-[2147483000]" data-testid="support-pointer">
          <div className="kp-sup-ptr absolute" style={{ left: `${Math.min(1, Math.max(0, pointer.x)) * 100}%`, top: `${Math.min(1, Math.max(0, pointer.y)) * 100}%` }}>
            <span className="kp-sup-ring" /><span className="kp-sup-dot" />
            <span className="kp-sup-tag">여기를 보세요</span>
          </div>
        </div>
      )}
      {/* 결과 배너(승인·거절) */}
      {banners.length > 0 && (
        <div className="fixed right-3 sm:right-6 z-[999991] flex flex-col gap-2.5 items-end pointer-events-none" style={{ bottom: dockBottom + (dockReq ? 84 : 0) }}>
          {banners.map((b) => (
            <BannerCard key={b.id} id={b.id} kind="notice" label="원격 지원" title={b.title} body={b.body} duration={15000}
              onClose={(id) => setBanners((p) => p.filter((x) => x.id !== id))} onClick={() => { setOpen(true); setBanners((p) => p.filter((x) => x.id !== b.id)); }} />
          ))}
        </div>
      )}
      {/* 진행 상황 막대 — 요청이 살아있는 동안 늘 보인다 */}
      {dockReq && !open && (
        <div className={`fixed z-[999989] ${mobile ? "left-3 right-3" : "left-3 right-3 sm:right-auto sm:left-1/2 sm:-translate-x-1/2"}`} style={{ bottom: dockBottom }}>
          <div className="kp-banner-in sm:w-[440px] rounded-[18px] text-white shadow-[0_18px_44px_rgba(11,20,40,0.38)] ring-1 ring-white/10 overflow-hidden" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)" }} data-testid="support-dock">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className={`w-10 h-10 rounded-[13px] grid place-items-center shrink-0 ${sharingNow ? "bg-[#8FB0F0] text-[#0B1428] kp-sup-live" : "bg-white/10 text-[#CFE0FF]"}`}><Icon d={SUPPORT_ICON} /></span>
              <button type="button" onClick={() => setOpen(true)} className="flex-1 min-w-0 text-left">
                <div className="text-[11.5px] font-extrabold tracking-[0.2em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>REMOTE SUPPORT</div>
                <div className="text-[15px] font-black truncate">
                  {sharingNow ? (shareState === "connected" ? "화면 공유 중 · 관리자가 보고 있습니다" : "화면 공유 대기 · 관리자 연결 중") : dockReq.status === "pending" ? "원격 지원 요청 · 승인 대기 중" : dockReq.status === "approved" ? "승인됨 — 눌러서 시작하기" : dockReq.status === "in_session" ? "원격 지원 진행 중" : "요청이 거절되었습니다"}
                </div>
              </button>
              {sharingNow ? (
                <button type="button" onClick={() => endShare(true)} className="shrink-0 h-10 px-3.5 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black">공유 종료</button>
              ) : dockReq.status === "rejected" ? (
                <button type="button" onClick={() => { setDismissed(dockReq.id); try { localStorage.setItem("kpSupportDismissed", dockReq.id); } catch { /* 무시 */ } }} className="shrink-0 w-9 h-9 rounded-xl bg-white/10 text-white/80 text-[15px]" aria-label="닫기">✕</button>
              ) : (
                <button type="button" onClick={() => setOpen(true)} className="shrink-0 h-10 px-3.5 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black">열기</button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ⭐ 2026-11-05 원격 지원 걸기 — 관리자가 건 요청: 직원이 수락해야 시작된다 */}
      {invite && !active && (
        <InviteConsent req={invite} busy={inviteBusy} err={err} mobile={mobile} onAccept={acceptInvite} onDecline={declineInvite} />
      )}
      {open && (
        <RequesterModal uid={uid} user={user} profile={profile} company={company} mobile={mobile}
          active={active} latest={latest} history={reqs} onClose={() => setOpen(false)}
          shareState={shareState} err={err} setErr={setErr} startShare={startShare} endShare={() => endShare(true)} />
      )}
    </>, document.body);
}

// ⭐ 2026-11-05 원격 지원 걸기 — 직원 화면의 동의 창(닫기 없음: 수락 또는 거절)
function InviteConsent({ req, busy, err, mobile, onAccept, onDecline }) {
  const mode = req.mode || req.method || "screen";
  const phone = mobile || isPhoneUA();
  return (
    <div className="fixed inset-0 z-[999993] bg-[#0B1428]/60 flex items-end sm:items-center justify-center sm:p-6" data-testid="support-invite">
      <div className="kp-banner-in w-full sm:max-w-[480px] bg-[#F4F6FA] rounded-t-[24px] sm:rounded-[24px] overflow-hidden shadow-[0_30px_80px_rgba(11,20,40,0.5)]">
        <div className="px-5 sm:px-6 pt-5 pb-4 text-white" style={{ background: "linear-gradient(rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-[14px] grid place-items-center bg-[#8FB0F0] text-[#0B1428] kp-sup-live shrink-0"><Icon d={SUPPORT_ICON} size={20} /></span>
            <div className="min-w-0">
              <div className="text-[11.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>REMOTE SUPPORT</div>
              <div className="text-[20px] font-black leading-tight">LogisWeb 관리자의 원격 지원 요청</div>
            </div>
          </div>
        </div>
        <div className="p-4 sm:p-5 space-y-3">
          {err && <div className="px-4 py-3 rounded-2xl bg-white ring-1 ring-[#1B2B4B]/25 text-[14.5px] font-bold text-[#1B2B4B]" data-testid="support-invite-err">{err}</div>}
          <div className="bg-white rounded-2xl ring-1 ring-[#E3E8F0] p-4 space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center h-7 px-2.5 rounded-full text-[13px] font-black bg-[#1B2B4B] text-white">{METHOD_LABEL[mode] || mode}</span>
              <span className="text-[13px] text-[#7A879C]">{fmt(req.createdAt)}</span>
            </div>
            {req.message && <div className="text-[15px] text-[#0F1A30] leading-relaxed whitespace-pre-wrap break-words px-3.5 py-3 rounded-xl bg-[#F7F9FC]" data-testid="support-invite-msg">{req.message}</div>}
            <div className="text-[14px] text-[#3A4A66] leading-relaxed">
              {mode === "screen"
                ? <>[수락]을 누르면 공유할 화면을 고르는 창이 뜹니다 — <b className="text-[#0F1A30]">이 탭</b>(LogisWeb)을 고르면 됩니다. 관리자는 <b className="text-[#0F1A30]">보기만</b> 하고 조작할 수 없으며, 언제든 [공유 종료]로 끝낼 수 있습니다.</>
                : <>[수락]을 누르면 원격 프로그램(AnyDesk 등) 안내가 열립니다. 원격 번호를 보내 주시면 관리자가 접속합니다.</>}
            </div>
            {mode === "screen" && phone && <div className="text-[13px] text-[#5B6B85]">휴대폰에서는 화면 공유가 어려울 수 있습니다 — PC에서 화면 공유가 가능합니다.</div>}
          </div>
          <div className="grid grid-cols-[1fr_1.6fr] gap-2">
            <button type="button" onClick={onDecline} disabled={busy} data-testid="support-invite-decline" className="h-12 rounded-xl border-[1.5px] border-[#C3CEDF] bg-white text-[#3A4A66] text-[15.5px] font-black disabled:opacity-60">거절</button>
            <button type="button" onClick={onAccept} disabled={busy} data-testid="support-invite-accept" className="h-12 rounded-xl text-white text-[16px] font-black disabled:opacity-60" style={{ background: "linear-gradient(90deg,#0F1A30,#2D4C82)" }}>{busy ? "준비 중…" : mode === "screen" && !phone ? "수락 · 화면 공유" : "수락"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RequesterModal({ uid, user, profile, company, mobile, active, latest, history, onClose, shareState, err, setErr, startShare, endShare }) {
  const [msg, setMsg] = React.useState("");
  const [phone, setPhone] = React.useState(() => fmtPhone(profile?.phone || ""));
  const [method, setMethod] = React.useState(() => (isPhoneUA() ? "remote" : "screen"));
  const [busy, setBusy] = React.useState(false);
  const [remoteNo, setRemoteNo] = React.useState(active?.anydeskId || "");
  React.useEffect(() => { if (!phone && profile?.phone) setPhone(fmtPhone(profile.phone)); }, [profile?.phone]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { setRemoteNo(active?.anydeskId || ""); }, [active?.id, active?.anydeskId]);
  React.useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const submit = async () => {
    setErr("");
    if (msg.trim().length < 2) { setErr("어떤 화면에서 무엇이 어려운지 적어 주세요."); return; }
    if (phone.replace(/\D/g, "").length < 9) { setErr("연락받을 번호를 적어 주세요."); return; }
    setBusy(true);
    try {
      await addDoc(collection(db, "supportRequests"), {
        companyName: profile?.companyName || company || "돌캐", uid, email: user?.email || "",
        name: profile?.name || user?.displayName || user?.email || "", team: profile?.team || "", position: profile?.position || "",
        phone, message: msg.trim().slice(0, 2000), method, mode: method, status: "pending",
        device: mobile || isPhoneUA() ? "mobile" : "pc", createdAt: serverTimestamp(), decidedAt: null, decidedBy: "", rejectReason: "",
      });
      setMsg("");
    } catch (e) { setErr(`요청을 보내지 못했습니다 (${e?.code || e?.message || "오류"})`); }
    setBusy(false);
  };
  const cancel = async () => {
    if (!active || !window.confirm("원격 지원 요청을 취소할까요?")) return;
    if (shareState) endShare();
    await updateDoc(doc(db, "supportRequests", active.id), { status: "cancelled", cancelledAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch((e) => setErr(`취소하지 못했습니다 (${e?.code || ""})`));
  };
  const sendNo = async () => {
    if (!active || !remoteNo.trim()) return;
    await updateDoc(doc(db, "supportRequests", active.id), { anydeskId: remoteNo.trim().slice(0, 40), updatedAt: serverTimestamp() }).then(() => setErr("")).catch((e) => setErr(`보내지 못했습니다 (${e?.code || ""})`));
  };
  const mode = active?.mode || active?.method || "screen";
  const showRejected = !active && latest?.status === "rejected";
  const sharing = !!shareState && shareState !== "starting";
  const past = history.filter((r) => !SUPPORT_ACTIVE.includes(r.status)).slice(0, 5);

  return (
    <div className="fixed inset-0 z-[999992] bg-[#0B1428]/55 flex items-end sm:items-center justify-center sm:p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} data-testid="support-modal"
        className="w-full sm:max-w-[560px] max-h-[92dvh] overflow-y-auto bg-[#F4F6FA] rounded-t-[24px] sm:rounded-[24px] shadow-[0_30px_80px_rgba(11,20,40,0.45)]">
        <div className="relative px-5 sm:px-6 pt-5 pb-4 text-white" style={{ background: "linear-gradient(rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div className="text-[11.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>REMOTE SUPPORT</div>
          <div className="text-[22px] font-black mt-0.5">원격 지원</div>
          <div className="text-[14px] text-white/65 mt-1">어려운 화면을 LogisWeb 관리자가 직접 보고 도와드립니다.</div>
          <button type="button" onClick={onClose} className="absolute right-4 top-4 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[16px]" aria-label="닫기">✕</button>
        </div>

        <div className="p-4 sm:p-5 space-y-3.5">
          {err && <div className="px-4 py-3 rounded-2xl bg-white ring-1 ring-[#1B2B4B]/25 text-[14.5px] font-bold text-[#1B2B4B]" data-testid="support-err">{err}</div>}

          {!active && (
            <>
              {showRejected && (
                <div className="px-4 py-3.5 rounded-2xl bg-white ring-1 ring-[#DCE3EE]">
                  <div className="flex items-center gap-2"><Chip status="rejected" /><span className="text-[14.5px] font-black text-[#0F1A30]">지난 요청이 거절되었습니다</span></div>
                  <div className="text-[14.5px] text-[#3A4A66] mt-1.5" data-testid="support-reject-reason">사유: {latest.rejectReason || "(사유 없음)"}</div>
                  <div className="text-[13px] text-[#7A879C] mt-1">내용을 보완해 다시 요청할 수 있습니다.</div>
                </div>
              )}
              <div className="bg-white rounded-2xl ring-1 ring-[#E3E8F0] p-4 space-y-3.5">
                <label className="block">
                  <span className="block text-[14px] font-black text-[#0F1A30] mb-1.5">어떤 화면에서 무엇이 어려운가요?</span>
                  <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} data-testid="support-msg"
                    placeholder="예) 배차현황에서 엑셀 업로드를 하면 오류가 납니다 / 정산 화면 사용법을 모르겠어요"
                    className="w-full px-3.5 py-3 rounded-xl border border-[#DCE3EE] bg-[#FAFBFD] text-[15px] leading-relaxed outline-none focus:border-[#2D4C82] resize-none" />
                </label>
                <label className="block">
                  <span className="block text-[14px] font-black text-[#0F1A30] mb-1.5">연락처</span>
                  <input value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} inputMode="tel" placeholder="010-0000-0000" data-testid="support-phone"
                    className="w-full h-12 px-3.5 rounded-xl border border-[#DCE3EE] bg-[#FAFBFD] text-[15px] outline-none focus:border-[#2D4C82]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} />
                </label>
                <div>
                  <span className="block text-[14px] font-black text-[#0F1A30] mb-1.5">희망 방식</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[["screen", "화면 공유", "브라우저로 바로 · 보기 전용 · PC"], ["remote", "원격 프로그램", "AnyDesk 등 · 관리자가 직접 조작"]].map(([k, t, d]) => (
                      <button key={k} type="button" onClick={() => setMethod(k)} data-testid={`support-method-${k}`}
                        className={`text-left px-3.5 py-3 rounded-xl border-[1.5px] transition ${method === k ? "border-[#1B2B4B] bg-[#EEF3FC]" : "border-[#E3E8F0] bg-white hover:border-[#B9C8E4]"}`}>
                        <span className="flex items-center gap-2"><span className={`w-4 h-4 rounded-full border-2 grid place-items-center ${method === k ? "border-[#1B2B4B]" : "border-[#C3CEDF]"}`}>{method === k && <span className="w-2 h-2 rounded-full bg-[#1B2B4B]" />}</span><span className="text-[15px] font-black text-[#0F1A30]">{t}</span></span>
                        <span className="block text-[12.5px] text-[#7A879C] mt-1 leading-snug">{d}</span>
                      </button>
                    ))}
                  </div>
                  {method === "screen" && (mobile || isPhoneUA()) && <div className="text-[13px] text-[#5B6B85] mt-2">휴대폰에서는 화면 공유가 어려울 수 있습니다 — PC에서 화면 공유가 가능합니다.</div>}
                </div>
                <button type="button" onClick={submit} disabled={busy} data-testid="support-submit"
                  className="w-full h-12 rounded-xl text-white text-[16px] font-black disabled:opacity-60" style={{ background: "linear-gradient(90deg,#0F1A30,#2D4C82)" }}>{busy ? "보내는 중…" : "원격 지원 요청 보내기"}</button>
              </div>
            </>
          )}

          {active && (
            <div className="bg-white rounded-2xl ring-1 ring-[#E3E8F0] p-4 space-y-3" data-testid="support-status">
              <div className="flex items-center gap-2 flex-wrap">
                <Chip status={active.status} />
                <span className="text-[13px] text-[#7A879C]">요청 {fmt(active.createdAt)} · {METHOD_LABEL[mode] || mode}</span>
              </div>
              <div className="text-[15px] text-[#0F1A30] leading-relaxed whitespace-pre-wrap break-words px-3.5 py-3 rounded-xl bg-[#F7F9FC]">{active.message}</div>
              {active.status === "pending" && (
                <div className="flex items-center gap-3 px-1">
                  <span className="kp-sup-wait w-3 h-3 rounded-full bg-[#2D4C82] shrink-0" />
                  <span className="text-[14.5px] text-[#3A4A66]">관리자에게 알림을 보냈습니다. 승인되면 이 화면과 알림으로 알려 드립니다.</span>
                </div>
              )}

              {/* 세션 A — 화면 공유 */}
              {["approved", "in_session"].includes(active.status) && mode === "screen" && (
                <div className="rounded-2xl p-4 text-white space-y-3" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 65%,#2D4C82)" }}>
                  <div className="text-[16px] font-black">{sharing ? (shareState === "connected" ? "화면 공유 중 — 관리자가 보고 있습니다" : "관리자 연결을 기다리는 중…") : "승인되었습니다 — 화면을 공유해 주세요"}</div>
                  <div className="text-[13.5px] text-white/70 leading-relaxed">보기 전용입니다 — 관리자는 화면을 보기만 하고 조작할 수 없습니다. 공유 창에서 <b className="text-white">이 탭</b>(LogisWeb)을 고르면 관리자가 가리키는 위치가 가장 정확하게 표시됩니다.</div>
                  {!sharing ? (
                    <button type="button" onClick={() => startShare(active)} disabled={shareState === "starting"} data-testid="support-share-start"
                      className="w-full h-12 rounded-xl bg-white text-[#0F1A30] text-[16px] font-black disabled:opacity-60">{shareState === "starting" ? "공유 창 여는 중…" : "화면 공유 시작"}</button>
                  ) : (
                    <button type="button" onClick={endShare} className="w-full h-12 rounded-xl bg-white/10 ring-1 ring-white/25 text-white text-[15px] font-black">화면 공유 종료</button>
                  )}
                  {(mobile || isPhoneUA() || !canShareScreen()) && <div className="text-[13px] text-[#CFE0FF]">PC에서 화면 공유가 가능합니다. 휴대폰이라면 관리자가 전화하거나 원격 프로그램 방식으로 바꿔 드립니다.</div>}
                </div>
              )}
              {/* 세션 B — 원격 프로그램 */}
              {["approved", "in_session"].includes(active.status) && mode === "remote" && (
                <div className="rounded-2xl ring-1 ring-[#C9D6EE] bg-[#F4F7FC] p-4 space-y-3" data-testid="support-remote-guide">
                  <div className="text-[16px] font-black text-[#0F1A30]">원격 프로그램으로 진행합니다</div>
                  {LINKS.map((l, i) => (
                    <a key={l.name} href={l.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 px-3.5 py-3 rounded-xl bg-white ring-1 ring-[#E3E8F0] hover:ring-[#2D4C82]">
                      <span className="w-8 h-8 rounded-lg bg-[#1B2B4B] text-white grid place-items-center text-[14px] font-black shrink-0" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                      <span className="min-w-0"><span className="block text-[15px] font-black text-[#0F1A30]">{l.name} 다운로드 ↗</span><span className="block text-[13px] text-[#5B6B85] leading-snug mt-0.5">{l.desc}</span></span>
                    </a>
                  ))}
                  <div className="flex gap-2">
                    <input value={remoteNo} onChange={(e) => setRemoteNo(e.target.value)} placeholder="원격 번호 (예: 123 456 789)" data-testid="support-remote-no"
                      className="flex-1 min-w-0 h-12 px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[15.5px] outline-none focus:border-[#2D4C82]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} />
                    <button type="button" onClick={sendNo} disabled={!remoteNo.trim() || remoteNo.trim() === (active.anydeskId || "")} data-testid="support-remote-send"
                      className="shrink-0 h-12 px-4 rounded-xl bg-[#1B2B4B] text-white text-[15px] font-black whitespace-nowrap disabled:opacity-50">{active.anydeskId && remoteNo.trim() === active.anydeskId ? "보냄 ✓" : "번호 보내기"}</button>
                  </div>
                  {active.anydeskId && <div className="text-[13.5px] text-[#2D4C82] font-bold">관리자에게 번호를 보냈습니다 — 접속 요청 창이 뜨면 [수락]을 눌러 주세요.</div>}
                </div>
              )}
              {active.sessionId && <SupportChat sessionId={active.sessionId} me="requester" myName={active.name} height={170} />}
              {!active.sessionId && ["approved"].includes(active.status) && mode === "remote" && <div className="text-[13px] text-[#7A879C]">관리자가 연락처({fmtPhone(active.phone) || active.phone})로 전화할 수 있습니다.</div>}
              {["pending", "approved"].includes(active.status) && (
                <button type="button" onClick={cancel} data-testid="support-cancel" className="w-full h-11 rounded-xl border border-[#DCE3EE] bg-white text-[#5B6B85] text-[14.5px] font-black hover:bg-[#F7F9FC]">요청 취소</button>
              )}
            </div>
          )}

          {past.length > 0 && (
            <div className="bg-white rounded-2xl ring-1 ring-[#E3E8F0] p-2">
              <div className="px-2.5 pt-1.5 pb-1 text-[13px] font-black text-[#7A879C]">지난 요청</div>
              {past.map((r) => (
                <div key={r.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl">
                  <Chip status={r.status} />
                  <span className="flex-1 min-w-0 text-[14px] text-[#0F1A30] truncate">{r.message}</span>
                  <span className="text-[12.5px] text-[#94A3B8] shrink-0" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{fmt(r.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════ 최고관리자 — 화면 보기(WebRTC 받는 쪽) ═══════════════════════
function MasterViewer({ sessionId, onEnd }) {
  const videoRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const [state, setState] = React.useState("connecting");
  const [sess, setSess] = React.useState(null);
  const [size, setSize] = React.useState("");
  const [click, setClick] = React.useState(null);
  React.useEffect(() => {
    if (!sessionId) return undefined;
    const sref = doc(db, "supportSessions", sessionId);
    const pc = new RTCPeerConnection(ICE);
    const sink = iceSink(pc);
    let answered = false; let alive = true;
    const unsubs = [];
    pc.ontrack = (e) => { const v = videoRef.current; if (v && e.streams[0]) { v.srcObject = e.streams[0]; v.play?.().catch(() => {}); } };
    pc.onicecandidate = (e) => { if (e.candidate) addDoc(collection(sref, "calleeCandidates"), e.candidate.toJSON()).catch(() => {}); };
    pc.onconnectionstatechange = () => { if (!alive) return; setState(pc.connectionState === "connected" ? "live" : pc.connectionState === "failed" ? "failed" : pc.connectionState === "disconnected" ? "unstable" : "connecting"); };
    unsubs.push(onSnapshot(sref, async (snap) => {
      const d = snap.data(); if (!d) return;
      setSess(d);
      if (d.status === "ended") { setState("ended"); return; }
      if (d.offer && !answered) {
        answered = true;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
          sink.flush();
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          await updateDoc(sref, { answer: { type: ans.type, sdp: ans.sdp }, status: "live", viewerAt: serverTimestamp() });
        } catch (e) { console.error("원격지원 응답 실패", e); setState("failed"); }
      }
    }, () => setState("failed")));
    unsubs.push(onSnapshot(collection(sref, "callerCandidates"), (s) => s.docChanges().forEach((c) => { if (c.type === "added") sink.add(c.doc.data()); }), () => {}));
    const t = setInterval(() => { const v = videoRef.current; if (v && v.videoWidth) setSize(`${v.videoWidth}×${v.videoHeight}`); }, 1000);
    return () => { alive = false; clearInterval(t); unsubs.forEach((u) => u()); try { pc.close(); } catch { /* 무시 */ } };
  }, [sessionId]);

  // 영상 위 클릭 → 실제 영상 영역 기준 비율(object-contain 여백 제외)
  const onPoint = (e) => {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    const r = v.getBoundingClientRect();
    const scale = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
    const w = v.videoWidth * scale; const h = v.videoHeight * scale;
    const ox = r.left + (r.width - w) / 2; const oy = r.top + (r.height - h) / 2;
    const x = (e.clientX - ox) / w; const y = (e.clientY - oy) / h;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const at = Date.now();
    setClick({ x: e.clientX - r.left, y: e.clientY - r.top, at });
    updateDoc(doc(db, "supportSessions", sessionId), { pointer: { x, y, at } }).catch(() => {});
  };
  React.useEffect(() => { if (!click) return undefined; const t = setTimeout(() => setClick(null), 1500); return () => clearTimeout(t); }, [click]);
  const full = () => { const el = wrapRef.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen?.(); else el.requestFullscreen?.().catch(() => {}); };
  const stLabel = { connecting: "연결 중…", live: "LIVE", unstable: "연결 불안정", failed: "연결 실패", ended: "공유 종료됨" }[state];
  const surface = sess?.displaySurface;
  return (
    <div className="space-y-2.5">
      <div ref={wrapRef} className="relative rounded-2xl overflow-hidden bg-[#0B1428] ring-1 ring-[#1B2B4B]" style={{ aspectRatio: "16 / 9", maxHeight: "62vh", minHeight: 220 }}>
        <video ref={videoRef} autoPlay playsInline muted onClick={onPoint} data-testid="support-video"
          className="absolute inset-0 w-full h-full object-contain cursor-crosshair" />
        {state !== "live" && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="text-center text-white/80">
              <div className={`mx-auto w-12 h-12 rounded-full border-[3px] border-white/20 ${state === "connecting" ? "border-t-[#8FB0F0] animate-spin" : ""}`} />
              <div className="text-[15px] font-black mt-3">{stLabel}</div>
              {state === "failed" && <div className="text-[13px] text-white/55 mt-1 px-6">회사망(NAT·방화벽)에 막혔을 수 있습니다 — 원격 프로그램으로 진행해 주세요.</div>}
            </div>
          </div>
        )}
        {click && <span className="kp-sup-click absolute pointer-events-none" style={{ left: click.x, top: click.y }} />}
        <div className="absolute left-3 top-3 flex items-center gap-2 pointer-events-none">
          <span className={`h-7 px-2.5 rounded-full text-[12px] font-black inline-flex items-center gap-1.5 ${state === "live" ? "bg-[#8FB0F0] text-[#0B1428]" : "bg-white/15 text-white"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{state === "live" && <i className="w-2 h-2 rounded-full bg-[#0B1428] kp-sup-wait inline-block" />}{stLabel}</span>
          {size && <span className="h-7 px-2.5 rounded-full text-[12px] font-bold bg-black/40 text-white/80 inline-flex items-center" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} data-testid="support-video-size">{size}</span>}
        </div>
        <button type="button" onClick={full} className="absolute right-3 top-3 h-8 px-3 rounded-lg bg-black/45 text-white text-[12.5px] font-black hover:bg-black/60">전체 화면</button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13.5px] text-[#5B6B85] flex-1 min-w-[200px]">영상을 누르면 직원 화면에 <b className="text-[#0F1A30]">포인터 원</b>이 잠깐 표시됩니다{surface ? ` · 공유 대상: ${surface === "browser" ? "탭(위치 정확)" : surface === "monitor" ? "전체 화면(위치가 어긋날 수 있음)" : surface === "window" ? "창(위치가 어긋날 수 있음)" : surface}` : ""}</span>
        <button type="button" onClick={onEnd} className="h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black" data-testid="support-end-session">세션 종료</button>
      </div>
    </div>
  );
}

// ═══════════════════════ 최고관리자 — 원격 지원 화면 ═══════════════════════
export function useSupportRequests(n = 300) {
  const [list, setList] = React.useState(null);
  React.useEffect(() => onSnapshot(query(collection(db, "supportRequests"), orderBy("createdAt", "desc"), limit(n)),
    (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([])), [n]);
  return list;
}
const ORDER = { pending: 0, in_session: 1, approved: 2, invited: 3 }; // ⭐ 2026-11-05 invited 추가

// ⭐ 2026-11-05 원격 지원 걸기 — 최고관리자가 운송사 직원에게 먼저 원격 지원을 건다(직원이 수락해야 시작)
//  supportRequests 에 status "invited" · initiatedBy "master" 로 만든다(규칙: 최고관리자만 이 모양으로 만들 수 있음).
function InviteBox({ me, busyUids, onSent }) {
  const live = usePlatformLive();
  const [co, setCo] = React.useState("");
  const [uid, setUid] = React.useState("");
  const [mode, setMode] = React.useState("screen");
  const [msg, setMsg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [q, setQ] = React.useState("");
  const companies = React.useMemo(() => Object.values(live?.companies || {}).filter((c) => (c.staffList || []).length)
    .sort((a, b) => (b.onlineNow - a.onlineNow) || a.name.localeCompare(b.name, "ko")), [live?.companies]);
  const coList = companies.filter((c) => !q.trim() || c.name.includes(q.trim()));
  const staff = React.useMemo(() => {
    const c = companies.find((x) => x.name === co);
    return [...(c?.staffList || [])].filter((s) => s.approved).sort((a, b) => (b.now - a.now) || (b.lastSeen - a.lastSeen));
  }, [companies, co]);
  const target = staff.find((s) => s.uid === uid) || null;
  React.useEffect(() => { setUid(""); }, [co]);
  const send = async () => {
    setErr("");
    if (!target) { setErr("직원을 고르세요."); return; }
    if (busyUids.has(target.uid)) { setErr("이 직원은 이미 진행 중인 원격 지원이 있습니다."); return; }
    setBusy(true);
    try {
      const ref = await addDoc(collection(db, "supportRequests"), {
        companyName: co, uid: target.uid, email: target.email || "", name: target.name || "", team: target.team || "", position: target.position || "",
        phone: "", message: msg.trim().slice(0, 2000) || "LogisWeb 관리자가 화면을 함께 보며 도와드리려고 합니다.",
        method: mode, mode, status: "invited", initiatedBy: "master", invitedBy: me?.email || "최고관리자",
        device: target.now ? (target.mobile > target.pc ? "mobile" : "pc") : "", createdAt: serverTimestamp(),
        decidedAt: serverTimestamp(), decidedBy: me?.email || "최고관리자", rejectReason: "",
      });
      setMsg(""); setUid("");
      onSent?.(ref.id);
    } catch (e) { setErr(`보내지 못했습니다 (${e?.code || e?.message || "오류"})`); }
    setBusy(false);
  };
  return (
    <div className="bg-white rounded-[18px] border border-[#E3E8F0] overflow-hidden min-w-0" data-testid="support-invite-box">
      <div className="px-4 py-3 flex items-center gap-2 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 65%,#2D4C82)" }}>
        <Icon d={SUPPORT_ICON} size={18} className="text-[#8FB0F0]" />
        <span className="text-[15.5px] font-black">원격 지원 걸기</span>
        <span className="ml-auto text-[11px] tracking-[0.18em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>INVITE</span>
      </div>
      <div className="p-3.5 space-y-2.5">
        <div className="text-[13px] text-[#5B6B85] leading-snug">직원을 고르면 그 직원 화면에 <b className="text-[#0F1A30]">동의 창</b>이 뜹니다. 직원이 [수락]해야 화면 공유·원격이 시작됩니다.</div>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="운송사 검색" className="w-[38%] min-w-0 h-11 px-3 rounded-xl border border-[#DCE3EE] bg-[#FAFBFD] text-[14.5px] outline-none focus:border-[#2D4C82]" />
          <select value={co} onChange={(e) => setCo(e.target.value)} data-testid="support-invite-co" className="flex-1 min-w-0 h-11 px-2.5 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] font-bold text-[#0F1A30] outline-none focus:border-[#2D4C82]">
            <option value="">{live ? `운송사 선택 (${coList.length})` : "불러오는 중…"}</option>
            {coList.map((c) => <option key={c.name} value={c.name}>{c.name}{c.onlineNow ? ` · 접속 ${c.onlineNow}` : ""}</option>)}
          </select>
        </div>
        {co && (
          <div className="max-h-[220px] overflow-y-auto rounded-xl ring-1 ring-[#E8EDF4] divide-y divide-[#EEF1F6]" data-testid="support-invite-staff">
            {staff.length === 0 && <div className="py-6 text-center text-[13.5px] text-[#9AA9C3]">승인된 직원이 없습니다</div>}
            {staff.map((s) => {
              const on = uid === s.uid; const taken = busyUids.has(s.uid);
              return (
                <button key={s.uid} type="button" disabled={taken} onClick={() => setUid(s.uid)} data-testid="support-invite-person"
                  className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 transition disabled:opacity-50 ${on ? "bg-[#EEF3FC]" : "hover:bg-[#F7F9FC]"}`}>
                  <span className={`w-4 h-4 rounded-full border-2 grid place-items-center shrink-0 ${on ? "border-[#1B2B4B]" : "border-[#C3CEDF]"}`}>{on && <span className="w-2 h-2 rounded-full bg-[#1B2B4B]" />}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14.5px] font-black text-[#0F1A30] truncate">{s.name}<span className="ml-1.5 text-[12.5px] font-bold text-[#7A879C]">{[s.team, s.position].filter(Boolean).join(" · ")}</span></span>
                    <span className="block text-[12px] text-[#94A3B8] truncate">{s.email}</span>
                  </span>
                  <span className={`shrink-0 h-6 px-2 rounded-full text-[11.5px] font-black inline-flex items-center ${taken ? "bg-[#1B2B4B] text-white" : s.now ? "bg-[#8FB0F0] text-[#0B1428]" : "bg-[#F1F4F9] text-[#94A3B8]"}`}>{taken ? "진행 중" : s.now ? "접속 중" : s.lastSeen ? ago(s.lastSeen) : "미접속"}</span>
                </button>
              );
            })}
          </div>
        )}
        {target && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {[["screen", "화면 공유", "브라우저 · 보기 전용 · PC"], ["remote", "원격 프로그램", "AnyDesk 등 · 직접 조작"]].map(([k, t, d]) => (
                <button key={k} type="button" onClick={() => setMode(k)} data-testid={`support-invite-mode-${k}`}
                  className={`text-left px-3 py-2.5 rounded-xl border-[1.5px] ${mode === k ? "border-[#1B2B4B] bg-[#EEF3FC]" : "border-[#E3E8F0] bg-white hover:border-[#B9C8E4]"}`}>
                  <span className="block text-[14.5px] font-black text-[#0F1A30]">{t}</span><span className="block text-[12px] text-[#7A879C] mt-0.5">{d}</span>
                </button>
              ))}
            </div>
            <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} placeholder="직원에게 보일 말 (예: 정산 화면 설정을 같이 봐 드릴게요)" data-testid="support-invite-text"
              className="w-full px-3 py-2.5 rounded-xl border border-[#DCE3EE] bg-[#FAFBFD] text-[14.5px] outline-none focus:border-[#2D4C82] resize-none" />
            {!target.now && <div className="text-[12.5px] text-[#5B6B85]">지금 접속 중이 아닙니다 — 다음에 프로그램을 열면 동의 창이 뜹니다.</div>}
          </>
        )}
        {err && <div className="text-[13.5px] font-bold text-[#1B2B4B]" data-testid="support-invite-box-err">{err}</div>}
        <button type="button" onClick={send} disabled={!target || busy} data-testid="support-invite-send"
          className="w-full h-11 rounded-xl text-white text-[15px] font-black disabled:opacity-50" style={{ background: "linear-gradient(90deg,#0F1A30,#2D4C82)" }}>
          {busy ? "보내는 중…" : target ? `${target.name}님에게 원격 지원 요청` : "직원을 고르세요"}
        </button>
      </div>
    </div>
  );
}
export function RemoteSupportAdminPanel({ me }) {
  const list = useSupportRequests(300);
  const [view, setView] = React.useState("open");
  const [selId, setSelId] = React.useState(null);
  const [reason, setReason] = React.useState("");
  const [rejecting, setRejecting] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const rows = React.useMemo(() => {
    const all = list || [];
    const open = all.filter((r) => SUPPORT_ACTIVE.includes(r.status)).sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || (msOf(a.createdAt) - msOf(b.createdAt)));
    return view === "open" ? open : all;
  }, [list, view]);
  const counts = React.useMemo(() => { const c = { open: 0, pending: 0, all: (list || []).length }; (list || []).forEach((r) => { if (SUPPORT_ACTIVE.includes(r.status)) c.open++; if (r.status === "pending") c.pending++; }); return c; }, [list]);
  const sel = (list || []).find((r) => r.id === selId) || rows[0] || null;
  React.useEffect(() => { setRejecting(false); setReason(""); setCopied(false); }, [sel?.id]);
  const by = me?.email || "최고관리자";
  const busyUids = React.useMemo(() => new Set((list || []).filter((r) => SUPPORT_ACTIVE.includes(r.status)).map((r) => r.uid)), [list]); // ⭐ 2026-11-05
  const patch = (data) => updateDoc(doc(db, "supportRequests", sel.id), { ...data, updatedAt: serverTimestamp() }).catch((e) => window.alert(`저장하지 못했습니다 (${e?.code || e?.message || ""})`));
  const approve = (mode) => patch({ status: "approved", mode, decidedAt: serverTimestamp(), decidedBy: by });
  const reject = async () => { if (!reason.trim()) return; await patch({ status: "rejected", rejectReason: reason.trim().slice(0, 500), decidedAt: serverTimestamp(), decidedBy: by }); setRejecting(false); };
  const endSession = async () => {
    if (sel.sessionId) await updateDoc(doc(db, "supportSessions", sel.sessionId), { status: "ended", endedAt: serverTimestamp(), endedBy: "master" }).catch(() => {});
    await patch({ status: "done", endedAt: serverTimestamp(), doneBy: by });
  };
  const done = async () => { if (!window.confirm("이 원격 지원을 완료 처리할까요?")) return; await endSession(); };
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); } catch { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); } setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const mode = sel?.mode || sel?.method || "screen";

  return (
    <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)] items-start" data-testid="support-admin">
      <div className="space-y-4 min-w-0">{/* ⭐ 2026-11-05 원격 지원 걸기 — 목록 위에 */}
      <InviteBox me={me} busyUids={busyUids} onSent={(id) => { setView("open"); setSelId(id); }} />
      <div className="bg-white rounded-[18px] border border-[#E3E8F0] overflow-hidden min-w-0">
        <div className="flex items-center gap-1.5 p-2 bg-[#F7F9FC] border-b border-[#E8EDF4]">
          {[["open", `진행 중 ${counts.open}`], ["all", `전체 기록 ${counts.all}`]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setView(k)} className={`h-9 px-3.5 rounded-xl text-[14px] font-black ${view === k ? "bg-[#1B2B4B] text-white" : "text-[#5B6B85] hover:bg-white"}`}>{l}</button>
          ))}
          {counts.pending > 0 && <span className="ml-auto h-7 px-2.5 rounded-full bg-[#0F1A30] text-white text-[12.5px] font-black inline-flex items-center" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>대기 {counts.pending}</span>}
        </div>
        <div className="p-2 max-h-[640px] overflow-y-auto">
          {list === null ? <div className="py-12 text-center text-[#9AA9C3] text-[14.5px]">불러오는 중…</div>
            : rows.length === 0 ? <div className="py-12 text-center text-[#9AA9C3] text-[14.5px]">{view === "open" ? "진행 중인 원격 지원 요청이 없습니다 ✓" : "기록이 없습니다"}</div>
            : rows.map((r) => (
              <button key={r.id} type="button" onClick={() => setSelId(r.id)} data-testid="support-row"
                className={`w-full text-left px-3 py-3 rounded-xl mb-1 transition ${sel?.id === r.id ? "bg-[#EEF3FC] ring-1 ring-[#B9C8E4]" : "hover:bg-[#F5F8FD]"}`}>
                <div className="flex items-center gap-2">
                  <Chip status={r.status} />
                  <span className="flex-1 min-w-0 text-[15px] font-black text-[#0F1A30] truncate">{r.companyName} · {r.name}</span>
                  <span className="text-[12.5px] text-[#94A3B8] shrink-0">{ago(r.createdAt)}</span>
                </div>
                <div className="text-[13.5px] text-[#5B6B85] truncate mt-1">{r.initiatedBy === "master" ? "관리자가 건 요청 · " : ""}{METHOD_LABEL[r.mode || r.method] || ""} · {r.message}</div>
              </button>
            ))}
        </div>
      </div>
      </div>

      <div className="bg-white rounded-[18px] border border-[#E3E8F0] overflow-hidden min-w-0">
        {!sel ? <div className="py-24 text-center text-[#9AA9C3] text-[15px]">왼쪽에서 요청을 고르세요</div> : (
          <div>
            <div className="px-4 sm:px-5 py-4 border-b border-[#E8EDF4] bg-[#F7F9FC] flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap"><Chip status={sel.status} /><span className="text-[12px] font-extrabold tracking-[0.18em] text-[#94A3B8]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{sel.device === "mobile" ? "MOBILE" : "PC"} · {fmt(sel.createdAt)}</span></div>
                <div className="text-[20px] font-black text-[#0F1A30] mt-1.5">{sel.companyName} · {sel.name}</div>
                <div className="text-[14px] text-[#5B6B85] mt-0.5">{[sel.team, sel.position].filter(Boolean).join(" · ") || "-"}{sel.phone ? <> · <a href={`tel:${sel.phone}`} className="font-bold text-[#2D4C82]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{sel.phone}</a></> : sel.email ? ` · ${sel.email}` : ""}</div>
              </div>
              <div className="text-right">
                <div className="text-[12.5px] font-bold text-[#7A879C]">{sel.initiatedBy === "master" ? "관리자가 건 방식" : "희망 방식"}</div>
                <div className="text-[15px] font-black text-[#0F1A30]">{METHOD_LABEL[sel.method] || sel.method}</div>
              </div>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              <div className="px-4 py-3.5 rounded-2xl bg-[#F7F9FC] ring-1 ring-[#E8EDF4] text-[15.5px] leading-relaxed text-[#0F1A30] whitespace-pre-wrap break-words" data-testid="support-detail-msg">{sel.message}</div>

              {/* ⭐ 2026-11-05 원격 지원 걸기 — 직원 응답 대기 */}
              {sel.status === "invited" && (
                <div className="rounded-2xl p-4 text-white flex items-center gap-3 flex-wrap" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 65%,#2D4C82)" }} data-testid="support-invited">
                  <span className="kp-sup-wait w-3 h-3 rounded-full bg-[#8FB0F0] shrink-0" />
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-[15.5px] font-black">직원 화면에 동의 창을 띄웠습니다</div>
                    <div className="text-[13.5px] text-white/70 mt-0.5">직원이 [수락]하면 여기에서 바로 {mode === "remote" ? "원격 번호를 받습니다" : "화면이 나타납니다"}. 접속 중이 아니면 다음에 프로그램을 열 때 뜹니다.</div>
                  </div>
                  <button type="button" onClick={() => patch({ status: "cancelled", cancelledAt: serverTimestamp(), doneBy: by })} data-testid="support-invite-cancel" className="shrink-0 h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black">요청 취소</button>
                </div>
              )}
              {sel.status === "pending" && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button type="button" onClick={() => approve("screen")} data-testid="support-approve-screen" className="h-12 rounded-xl text-white text-[15px] font-black" style={{ background: "linear-gradient(90deg,#0F1A30,#2D4C82)" }}>승인 · 화면 공유</button>
                    <button type="button" onClick={() => approve("remote")} data-testid="support-approve-remote" className="h-12 rounded-xl bg-[#1B2B4B] text-white text-[15px] font-black">승인 · 원격 프로그램</button>
                    <button type="button" onClick={() => setRejecting((v) => !v)} data-testid="support-reject" className="h-12 rounded-xl border-[1.5px] border-[#C3CEDF] bg-white text-[#3A4A66] text-[15px] font-black">거절</button>
                  </div>
                  {rejecting && (
                    <div className="flex gap-2">
                      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="거절 사유 (직원에게 보입니다)" data-testid="support-reject-input" autoFocus
                        className="flex-1 min-w-0 h-12 px-3.5 rounded-xl border border-[#DCE3EE] text-[15px] outline-none focus:border-[#2D4C82]" />
                      <button type="button" onClick={reject} disabled={!reason.trim()} data-testid="support-reject-confirm" className="shrink-0 h-12 px-4 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50">거절 보내기</button>
                    </div>
                  )}
                </div>
              )}

              {["approved", "in_session"].includes(sel.status) && (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-bold text-[#5B6B85]">진행 방식</span>
                    <div className="inline-flex p-1 rounded-xl bg-[#EEF1F6]">
                      {["screen", "remote"].map((k) => (
                        <button key={k} type="button" onClick={() => mode !== k && patch({ mode: k })} data-testid={`support-mode-${k}`}
                          className={`h-9 px-3.5 rounded-lg text-[14px] font-black ${mode === k ? "bg-white text-[#0F1A30] shadow" : "text-[#5B6B85]"}`}>{k === "remote" ? "원격 프로그램으로 진행" : "화면 공유"}</button>
                      ))}
                    </div>
                    <button type="button" onClick={done} data-testid="support-done" className="ml-auto h-10 px-4 rounded-xl border-[1.5px] border-[#1B2B4B] text-[#1B2B4B] text-[14px] font-black hover:bg-[#1B2B4B] hover:text-white">완료 처리</button>
                  </div>
                  {mode === "remote" && (
                    <div className="px-4 py-3.5 rounded-2xl ring-1 ring-[#C9D6EE] bg-[#F4F7FC]">
                      <div className="text-[13px] font-bold text-[#5B6B85]">직원이 보낸 원격 번호 (AnyDesk / 크롬 원격 데스크톱)</div>
                      {sel.anydeskId ? (
                        <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                          <span className="text-[26px] font-black text-[#0F1A30] tracking-wider" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} data-testid="support-anydesk">{sel.anydeskId}</span>
                          <button type="button" onClick={() => copy(sel.anydeskId)} className="h-9 px-3.5 rounded-lg bg-[#1B2B4B] text-white text-[13.5px] font-black">{copied ? "복사됨 ✓" : "복사"}</button>
                        </div>
                      ) : <div className="text-[14.5px] text-[#7A879C] mt-1">아직 번호를 보내지 않았습니다 — 직원 화면에 설치 안내가 떠 있습니다.</div>}
                    </div>
                  )}
                  {mode === "screen" && (sel.status === "in_session" && sel.sessionId
                    ? <MasterViewer key={sel.sessionId} sessionId={sel.sessionId} onEnd={endSession} />
                    : <div className="rounded-2xl bg-[#0B1428] text-white/75 grid place-items-center text-center px-6" style={{ aspectRatio: "16 / 9", maxHeight: "62vh", minHeight: 200 }}>
                        <div><div className="text-[16px] font-black text-white">직원의 화면 공유를 기다리는 중</div><div className="text-[14px] mt-1">직원이 [화면 공유 시작]을 누르면 여기에 화면이 나타납니다.</div></div>
                      </div>)}
                  {sel.sessionId && <SupportChat sessionId={sel.sessionId} me="master" myName="최고관리자" height={200} />}
                </>
              )}

              {["rejected", "declined", "done", "cancelled"].includes(sel.status) && (
                <div className="grid sm:grid-cols-3 gap-2 text-[14px]">
                  {[["처리", SUPPORT_STATUS[sel.status]?.label], ["처리 시각", fmt(sel.status === "declined" ? sel.respondedAt : (sel.initiatedBy === "master" ? (sel.endedAt || sel.cancelledAt || sel.decidedAt) : (sel.decidedAt || sel.endedAt || sel.cancelledAt)))], ["처리자", sel.status === "declined" ? `${sel.name || "직원"} (거절)` : (sel.doneBy || (sel.status === "cancelled" ? "직원 취소" : sel.decidedBy) || "-")]].map(([k, v]) => (
                    <div key={k} className="px-3.5 py-2.5 rounded-xl bg-[#F7F9FC] ring-1 ring-[#E8EDF4]"><div className="text-[12.5px] font-bold text-[#7A879C]">{k}</div><div className="font-black text-[#0F1A30] truncate">{v}</div></div>
                  ))}
                  {sel.status === "rejected" && <div className="sm:col-span-3 px-3.5 py-2.5 rounded-xl bg-[#F7F9FC] ring-1 ring-[#E8EDF4]"><span className="text-[12.5px] font-bold text-[#7A879C]">거절 사유</span><div className="font-bold text-[#0F1A30]">{sel.rejectReason || "-"}</div></div>}
                  {sel.anydeskId && <div className="sm:col-span-3 text-[13.5px] text-[#5B6B85]">원격 번호: <b style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{sel.anydeskId}</b></div>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const SUPPORT_CSS = `
@keyframes kpSupRing { 0% { transform: translate(-50%,-50%) scale(.4); opacity: 1; } 100% { transform: translate(-50%,-50%) scale(1.6); opacity: 0; } }
@keyframes kpSupDot { 0%,100% { transform: translate(-50%,-50%) scale(1); } 50% { transform: translate(-50%,-50%) scale(1.25); } }
@keyframes kpSupWait { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
.kp-sup-ptr { width: 0; height: 0; }
.kp-sup-ring { position: absolute; left: 0; top: 0; width: 96px; height: 96px; border-radius: 9999px; border: 4px solid #8FB0F0; box-shadow: 0 0 0 3px rgba(11,20,40,.55), 0 0 28px rgba(143,176,240,.75); animation: kpSupRing 1s ease-out infinite; }
.kp-sup-dot { position: absolute; left: 0; top: 0; width: 26px; height: 26px; border-radius: 9999px; background: rgba(45,76,130,.85); border: 3px solid #fff; box-shadow: 0 4px 14px rgba(11,20,40,.45); animation: kpSupDot .8s ease-in-out infinite; }
.kp-sup-tag { position: absolute; left: 22px; top: 18px; white-space: nowrap; padding: 4px 10px; border-radius: 9999px; background: #0F1A30; color: #fff; font-size: 13px; font-weight: 900; box-shadow: 0 6px 18px rgba(11,20,40,.35); }
.kp-sup-click { width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 9999px; border: 3px solid #8FB0F0; animation: kpSupWait .5s ease-in-out 3; }
.kp-sup-wait { animation: kpSupWait 1.4s ease-in-out infinite; }
.kp-sup-live { box-shadow: 0 0 0 4px rgba(143,176,240,.25); animation: kpSupWait 1.6s ease-in-out infinite; }
`;
