// ======================= src/InternalMail.jsx =======================
// 📧 사내메일함(2026-10-27) — 같은 운송사 직원끼리 주고받는 메일.
//  internalMails/{id}: { company, fromUid, fromName, fromEmail, to:[uid], toNames:[이름], subject, body, images:[jpeg dataURL],
//                        kind: "mail"|"hr"|"closeReport", at, readBy:[uid], deletedBy:[uid] }
//  - 받는 사람은 부서별로 고르거나 "전체". 이미지는 3장까지(자동으로 줄여서 저장).
//  - 새 메일이 오면 받는 사람 휴대폰으로 푸시(서버), 화면 오른쪽 아래에 배너(BannerCenter).
//  - 보안규칙: 보낸 사람·받는 사람만 읽을 수 있고, 읽음/삭제 표시만 고칠 수 있다.
import React from "react";
import { createPortal } from "react-dom";
import { db, auth } from "./firebase";
import { collection, doc, onSnapshot, query, where, addDoc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { isTMUser } from "./staffFilter";

const toMs = (v) => (v?.toMillis ? v.toMillis() : typeof v === "number" ? v : 0);
const fmtAt = (ms, full) => {
  if (!ms) return "";
  const d = new Date(ms); const today = new Date();
  if (!full && d.toDateString() === today.toDateString()) return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString("ko-KR", full ? { year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" } : { month: "numeric", day: "numeric" });
};
const KIND_LABEL = { hr: "인사발령", closeReport: "마감보고" };

// 이미지를 JPEG로 줄인다(긴 변 1400px) — 메일 1통에 3장까지 담을 수 있게
export function compressImage(src, max = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const load = (url) => {
      const img = new Image();
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = url;
    };
    if (typeof src === "string") load(src);
    else { const fr = new FileReader(); fr.onload = () => load(fr.result); fr.onerror = reject; fr.readAsDataURL(src); }
  });
}

// 다른 화면(인사발령 등)에서 메일 보내기
export async function sendInternalMail({ company, to, subject, body, images = [], kind = "mail", fromName }) {
  const me = auth.currentUser;
  const list = (to || []).filter((u) => u?.uid);
  if (!list.length) throw new Error("받는 사람이 없습니다.");
  // 문서 1개 한도(1MB) — 이미지가 크면 더 줄인다
  let imgs = images.slice(0, 3);
  for (let i = 0; i < 4 && imgs.join("").length > 850000; i += 1) {
    const max = [1200, 1000, 820, 680][i];
    imgs = await Promise.all(imgs.map((src) => compressImage(src, max, 0.72)));
  }
  if (imgs.join("").length > 850000) throw new Error("이미지가 너무 큽니다. 장수를 줄여 주세요.");
  return addDoc(collection(db, "internalMails"), {
    company, fromUid: me?.uid || "", fromEmail: me?.email || "", fromName: fromName || me?.email?.split("@")[0] || "",
    to: [...new Set(list.map((u) => u.uid))], toNames: list.map((u) => u.name || u.email || ""),
    subject: String(subject || "").slice(0, 200), body: String(body || "").slice(0, 20000), images: imgs,
    kind, at: serverTimestamp(), readBy: [], deletedBy: [],
  });
}

// 같은 회사 직원 목록(최고관리자·퇴사자·기사·화주 제외)
export function useCompanyStaff(company) {
  const [list, setList] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "users"), where("companyName", "==", company)), (s) => {
      setList(s.docs.map((d) => ({ uid: d.id, ...d.data() }))
        .filter((u) => u.approved !== false && u.employmentStatus !== "퇴사" && !isTMUser(u) && !["driver", "shipper"].includes(u.role))
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko")));
    }, () => setList([]));
  }, [company]);
  return list;
}

// 받은 메일 실시간
export function useInbox(uid) {
  const [inbox, setInbox] = React.useState([]);
  React.useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(query(collection(db, "internalMails"), where("to", "array-contains", uid)),
      (s) => setInbox(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => !(m.deletedBy || []).includes(uid)).sort((a, b) => toMs(b.at) - toMs(a.at))), () => {});
  }, [uid]);
  return inbox;
}

// 받는 사람 고르기 — 부서별 묶음 + 전체
export function RecipientPicker({ staff, selected, setSelected, excludeUid }) {
  const people = (staff || []).filter((u) => u.uid !== excludeUid);
  const groups = React.useMemo(() => {
    const g = new Map();
    people.forEach((u) => { const t = String(u.team || "").trim() || "미배정"; if (!g.has(t)) g.set(t, []); g.get(t).push(u); });
    return [...g.entries()].sort((a, b) => (a[0] === "미배정") - (b[0] === "미배정") || a[0].localeCompare(b[0], "ko"));
  }, [people]);
  const all = people.length > 0 && people.every((u) => selected.has(u.uid));
  const toggle = (uids, on) => setSelected((p) => { const n = new Set(p); uids.forEach((x) => (on ? n.add(x) : n.delete(x))); return n; });
  if (staff === null) return <div className="py-3 text-[13px] text-[#9AA9C3]">직원 목록 불러오는 중…</div>;
  return (
    <div className="space-y-2.5">
      <button type="button" onClick={() => toggle(people.map((u) => u.uid), !all)}
        className={`h-8 px-3.5 rounded-lg text-[12.5px] font-black border ${all ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#0F1A30] border-[#0F1A30]"}`}>
        전체 {people.length}명
      </button>
      {groups.map(([t, list]) => {
        const on = list.every((u) => selected.has(u.uid));
        return (
          <div key={t}>
            <button type="button" onClick={() => toggle(list.map((u) => u.uid), !on)} className="text-[11.5px] font-black text-[#7A879C] mb-1.5 hover:text-[#0F1A30]">
              {t} {on ? "· 모두 선택됨" : "· 모두 선택"}
            </button>
            <div className="flex flex-wrap gap-1.5">
              {list.map((u) => {
                const sel = selected.has(u.uid);
                return (
                  <button key={u.uid} type="button" onClick={() => toggle([u.uid], !sel)}
                    className={`h-8 px-3 rounded-lg text-[12.5px] font-bold border transition ${sel ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE] hover:border-[#4B6CB7]"}`}>
                    {u.name || u.email}{u.position ? ` ${u.position}` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ImageViewer({ src, onClose }) {
  return createPortal(
    <div className="fixed inset-0 z-[2000000] bg-black/80 flex items-center justify-center p-6" onClick={onClose}>
      <img src={src} alt="" className="max-w-full max-h-full rounded-xl shadow-2xl bg-white" />
    </div>, document.body);
}

export function MailCenter({ company, myName, onClose, openId }) {
  const me = auth.currentUser;
  const uid = me?.uid;
  const staff = useCompanyStaff(company);
  const inbox = useInbox(uid);
  const [sent, setSent] = React.useState([]);
  const [box, setBox] = React.useState("inbox"); // inbox | sent | compose
  const [cur, setCur] = React.useState(null);
  const [view, setView] = React.useState(null); // 이미지 크게
  const [q, setQ] = React.useState("");
  // 쓰기
  const [to, setTo] = React.useState(() => new Set());
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [images, setImages] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const fileRef = React.useRef(null);

  React.useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(query(collection(db, "internalMails"), where("fromUid", "==", uid)),
      (s) => setSent(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => toMs(b.at) - toMs(a.at))), () => {});
  }, [uid]);
  React.useEffect(() => { if (openId) { const m = inbox.find((x) => x.id === openId); if (m) { setBox("inbox"); setCur(m); } } }, [openId, inbox]);
  // 열면 읽음 표시
  React.useEffect(() => {
    if (cur && box === "inbox" && !(cur.readBy || []).includes(uid)) updateDoc(doc(db, "internalMails", cur.id), { readBy: arrayUnion(uid) }).catch(() => {});
  }, [cur, box, uid]);

  const list = (box === "sent" ? sent : inbox).filter((m) => !q.trim() || [m.subject, m.body, m.fromName, ...(m.toNames || [])].some((v) => String(v || "").includes(q.trim())));
  const unread = inbox.filter((m) => !(m.readBy || []).includes(uid)).length;
  const startCompose = (init = {}) => {
    setTo(new Set(init.to || [])); setSubject(init.subject || ""); setBody(init.body || ""); setImages([]); setMsg(""); setBox("compose"); setCur(null);
  };
  const reply = (m, allReply) => {
    const t = new Set([m.fromUid, ...(allReply ? (m.to || []) : [])]); t.delete(uid);
    startCompose({ to: [...t], subject: m.subject?.startsWith("RE:") ? m.subject : `RE: ${m.subject || ""}`, body: `\n\n----- ${m.fromName}님이 ${fmtAt(toMs(m.at), true)}에 보낸 메일 -----\n${m.body || ""}` });
  };
  const addImages = async (files) => {
    const arr = [...files].slice(0, 3 - images.length);
    try { const out = await Promise.all(arr.map((f) => compressImage(f))); setImages((p) => [...p, ...out].slice(0, 3)); } catch { setMsg("이미지를 읽지 못했습니다."); }
  };
  const send = async () => {
    if (!to.size) { setMsg("받는 사람을 골라 주세요."); return; }
    if (!subject.trim()) { setMsg("제목을 입력해 주세요."); return; }
    setBusy(true); setMsg("");
    try {
      const people = (staff || []).filter((u) => to.has(u.uid));
      await sendInternalMail({ company, to: people, subject, body, images, fromName: myName });
      setBox("sent"); setCur(null);
    } catch (e) { setMsg(e.message || "보내기 실패"); } finally { setBusy(false); }
  };
  const remove = async (m) => {
    if (!window.confirm("이 메일을 받은메일함에서 지울까요?")) return;
    await updateDoc(doc(db, "internalMails", m.id), { deletedBy: arrayUnion(uid) }).catch(() => {});
    setCur(null);
  };

  const navBtn = (k, label, badge) => (
    <button onClick={() => { setBox(k); setCur(null); if (k === "compose") startCompose(); }}
      className={`w-full flex items-center justify-between h-11 px-4 rounded-xl text-[14px] font-bold transition ${box === k ? "bg-white text-[#0F1A30] shadow-[0_6px_16px_rgba(0,0,0,0.18)]" : "text-white/75 hover:bg-white/10"}`}>
      <span>{label}</span>{badge ? <span className={`min-w-[22px] h-[22px] px-1.5 rounded-full text-[11.5px] font-black flex items-center justify-center ${box === k ? "bg-[#0F1A30] text-white" : "bg-white text-[#0F1A30]"}`}>{badge}</span> : null}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[1000000] bg-[#0F1A30]/45 flex items-center justify-center p-0 sm:p-5" onClick={onClose}>
      <div className="w-full h-full sm:h-[86vh] max-w-[1180px] bg-[#F4F6FA] sm:rounded-[24px] shadow-[0_24px_60px_rgba(15,26,48,0.35)] flex flex-col sm:flex-row overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* 왼쪽 메뉴 */}
        <aside className="sm:w-[220px] shrink-0 p-4 flex sm:flex-col gap-2 text-white" style={{ background: "linear-gradient(170deg, #0F1A30 0%, #1B2B4B 60%, #2D4C82 100%)" }}>
          <div className="hidden sm:block px-2 pb-3 mb-1 border-b border-white/10">
            <div className="text-[11px] font-extrabold tracking-[0.24em] text-white/50">MAIL</div>
            <div className="text-[19px] font-black">사내메일함</div>
            <div className="text-[12px] text-white/50 truncate">{company}</div>
          </div>
          <button onClick={() => startCompose()} className="sm:w-full h-11 px-4 rounded-xl bg-[#6E95E8] text-white text-[14px] font-black shadow-[0_8px_18px_rgba(0,0,0,0.25)] shrink-0">메일 쓰기</button>
          {navBtn("inbox", "받은메일", unread)}
          {navBtn("sent", "보낸메일")}
          <button onClick={onClose} className="sm:mt-auto h-10 px-4 rounded-xl text-white/60 text-[13px] font-bold hover:bg-white/10 shrink-0">닫기</button>
        </aside>

        {box === "compose" ? (
          <section className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-4">
            <div className="text-[20px] font-black text-[#0F1A30]">메일 쓰기</div>
            <div className="bg-white rounded-2xl border border-[#E3E8F0] p-4">
              <div className="text-[12.5px] font-bold text-[#7A879C] mb-2">받는 사람 <span className="text-[#0F1A30]">{to.size}명</span></div>
              <RecipientPicker staff={staff} selected={to} setSelected={setTo} excludeUid={uid} />
            </div>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="제목"
              className="w-full h-12 px-4 rounded-2xl border border-[#DCE3EE] bg-white text-[15px] font-bold text-[#0F1A30] outline-none focus:border-[#4B6CB7]" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} placeholder="내용"
              className="w-full px-4 py-3 rounded-2xl border border-[#DCE3EE] bg-white text-[14px] text-[#0F1A30] leading-relaxed outline-none focus:border-[#4B6CB7] resize-y" />
            <div className="flex flex-wrap items-center gap-2">
              {images.map((src, i) => (
                <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-[#E3E8F0] bg-white">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => setImages((p) => p.filter((_, k) => k !== i))} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-[#0F1A30]/80 text-white text-[12px]">✕</button>
                </div>
              ))}
              {images.length < 3 && (
                <button onClick={() => fileRef.current?.click()} className="w-24 h-24 rounded-xl border-2 border-dashed border-[#C9D2E0] text-[#7A879C] text-[12px] font-bold hover:border-[#4B6CB7]">+ 이미지<br />({images.length}/3)</button>
              )}
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addImages(e.target.files || []); e.target.value = ""; }} />
            </div>
            {msg && <div className="text-[13px] font-bold text-[#0F1A30]">⚠ {msg}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setBox("inbox")} className="h-11 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[#3A4A66] text-[14px] font-bold">취소</button>
              <button onClick={send} disabled={busy} className="h-11 px-7 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-50">{busy ? "보내는 중…" : `보내기 (${to.size}명)`}</button>
            </div>
          </section>
        ) : (
          <>
            {/* 목록 */}
            <section className={`${cur ? "hidden lg:flex" : "flex"} lg:w-[360px] flex-1 lg:flex-none flex-col border-r border-[#E3E8F0] bg-white min-w-0`}>
              <div className="p-3 border-b border-[#EEF1F6]">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목·내용·사람 검색"
                  className="w-full h-10 px-3.5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-semibold outline-none focus:border-[#4B6CB7]" />
              </div>
              <div className="flex-1 overflow-y-auto">
                {list.length === 0 ? <div className="py-20 text-center text-[13.5px] text-[#9AA9C3]">{box === "sent" ? "보낸 메일이 없습니다" : "받은 메일이 없습니다"}</div> : list.map((m) => {
                  const unreadOne = box === "inbox" && !(m.readBy || []).includes(uid);
                  const on = cur?.id === m.id;
                  return (
                    <button key={m.id} onClick={() => setCur(m)} className={`w-full text-left px-4 py-3.5 border-b border-[#F1F4F9] transition ${on ? "bg-[#EEF3FB]" : "hover:bg-[#F8FAFD]"}`}>
                      <div className="flex items-center gap-2">
                        {unreadOne && <span className="w-2 h-2 rounded-full bg-[#4B6CB7] shrink-0" />}
                        <span className={`text-[13.5px] truncate ${unreadOne ? "font-black text-[#0F1A30]" : "font-bold text-[#3A4A66]"}`}>
                          {box === "sent" ? `→ ${(m.toNames || []).slice(0, 3).join(", ")}${(m.toNames || []).length > 3 ? ` 외 ${m.toNames.length - 3}명` : ""}` : m.fromName}
                        </span>
                        <span className="ml-auto text-[11.5px] text-[#9AA9C3] shrink-0 tabular-nums">{fmtAt(toMs(m.at))}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {KIND_LABEL[m.kind] && <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded bg-[#0F1A30] text-white shrink-0">{KIND_LABEL[m.kind]}</span>}
                        <span className={`text-[13.5px] truncate ${unreadOne ? "font-extrabold text-[#0F1A30]" : "text-[#3A4A66]"}`}>{m.subject}</span>
                        {(m.images || []).length > 0 && <span className="text-[11px] text-[#9AA9C3] shrink-0">📎{m.images.length}</span>}
                      </div>
                      <div className="text-[12.5px] text-[#9AA9C3] truncate mt-0.5">{String(m.body || "").replace(/\s+/g, " ")}</div>
                    </button>
                  );
                })}
              </div>
            </section>
            {/* 읽기 */}
            <section className={`${cur ? "flex" : "hidden lg:flex"} flex-1 flex-col min-w-0`}>
              {!cur ? (
                <div className="flex-1 flex items-center justify-center text-[14px] text-[#9AA9C3]">메일을 고르면 여기에서 읽을 수 있습니다</div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="px-6 py-5 bg-white border-b border-[#E3E8F0]">
                    <button onClick={() => setCur(null)} className="lg:hidden text-[13px] font-bold text-[#4B6CB7] mb-2">← 목록</button>
                    <div className="flex items-start gap-2">
                      {KIND_LABEL[cur.kind] && <span className="mt-1 text-[11px] font-black px-2 py-0.5 rounded bg-[#0F1A30] text-white shrink-0">{KIND_LABEL[cur.kind]}</span>}
                      <h2 className="text-[20px] font-black text-[#0F1A30] leading-snug break-words">{cur.subject}</h2>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <span className="w-10 h-10 rounded-[14px] flex items-center justify-center text-white font-black shrink-0" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}>{String(cur.fromName || "?").slice(0, 1)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-black text-[#0F1A30]">{cur.fromName} <span className="text-[12px] font-semibold text-[#9AA9C3]">{cur.fromEmail}</span></div>
                        <div className="text-[12.5px] text-[#7A879C] truncate">받는 사람 {(cur.toNames || []).join(", ")}</div>
                      </div>
                      <div className="text-[12px] text-[#9AA9C3] shrink-0 text-right">{fmtAt(toMs(cur.at), true)}</div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {box === "inbox" && <button onClick={() => reply(cur, false)} className="h-9 px-4 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black">답장</button>}
                      {box === "inbox" && (cur.to || []).length > 1 && <button onClick={() => reply(cur, true)} className="h-9 px-4 rounded-lg border border-[#0F1A30] text-[#0F1A30] text-[12.5px] font-black">전체 답장</button>}
                      <button onClick={() => startCompose({ subject: `FW: ${cur.subject || ""}`, body: `\n\n----- 전달 메일 -----\n${cur.body || ""}` })} className="h-9 px-4 rounded-lg border border-[#DCE3EE] text-[#3A4A66] text-[12.5px] font-bold">전달</button>
                      {box === "inbox" && <button onClick={() => remove(cur)} className="h-9 px-4 rounded-lg border border-[#DCE3EE] text-[#7A879C] text-[12.5px] font-bold">삭제</button>}
                    </div>
                  </div>
                  <div className="px-6 py-5 space-y-4">
                    {(cur.images || []).map((src, i) => (
                      <img key={i} src={src} alt="" onClick={() => setView(src)} className="w-full max-w-[820px] rounded-xl border border-[#E3E8F0] bg-white cursor-zoom-in shadow-[0_6px_20px_rgba(16,24,40,0.06)]" />
                    ))}
                    {cur.body && <div className="text-[14.5px] text-[#1F2A44] leading-[1.8] whitespace-pre-wrap break-words bg-white rounded-2xl border border-[#E3E8F0] px-5 py-4">{cur.body}</div>}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
      {view && <ImageViewer src={view} onClose={() => setView(null)} />}
    </div>, document.body);
}

// 헤더의 메일 버튼(안 읽은 수 표시) — 누르면 사내메일함
export function MailHeaderButton({ company, myName, className = "kp-icon-btn transition relative", color = "white", badgeCls = "bg-[#6E95E8] text-white ring-[#0F1A30]" }) {
  const uid = auth.currentUser?.uid;
  const inbox = useInbox(uid);
  const [open, setOpen] = React.useState(false);
  const [openId, setOpenId] = React.useState(null);
  const unread = inbox.filter((m) => !(m.readBy || []).includes(uid)).length;
  React.useEffect(() => {
    const h = (e) => { setOpenId(e.detail?.id || null); setOpen(true); };
    window.addEventListener("kp-open-mail", h);
    return () => window.removeEventListener("kp-open-mail", h);
  }, []);
  return (
    <>
      <button onClick={() => { setOpenId(null); setOpen(true); }} className={className} title="사내메일함">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
        {unread > 0 && <span className={`absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-black flex items-center justify-center ring-2 ${badgeCls}`}>{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && <MailCenter company={company} myName={myName} openId={openId} onClose={() => setOpen(false)} />}
    </>
  );
}
