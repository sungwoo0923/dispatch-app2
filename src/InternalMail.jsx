// ======================= src/InternalMail.jsx =======================
// 📧 사내메일함(2026-10-27) — 같은 운송사 직원끼리 주고받는 메일.
//  internalMails/{id}: { company, fromUid, fromName, fromEmail, to:[uid], toNames:[이름], subject, body, images:[jpeg dataURL],
//                        kind: "mail"|"hr"|"closeReport", at, readBy:[uid], deletedBy:[uid] }
//  - 받는 사람은 부서별로 고르거나 "전체". 이미지는 3장까지(자동으로 줄여서 저장).
//  - 새 메일이 오면 받는 사람 휴대폰으로 푸시(서버), 화면 오른쪽 아래에 배너(BannerCenter).
//  - 보안규칙: 보낸 사람·받는 사람만 읽을 수 있고, 읽음/삭제 표시만 고칠 수 있다.
//  ⭐ 2026-10-28 고도화 — 받은/안읽은/별표/중요/공문/보낸/내게쓴/예약/임시보관/휴지통 메일함,
//    참조(cc)·중요 표시·예약 발송(서버 sendScheduledMails가 5분마다 보냄)·임시저장·수신확인·발송취소(안 읽은 사람)·
//    일괄 처리·인쇄·서명. 추가 필드: status(sent|draft|scheduled), pendingTo/pendingToNames/pendingCc/pendingCcNames,
//    scheduledAt, cc/ccNames, important, starredBy, purgedBy, recalledFor
import React from "react";
import { kpConfirm } from "./kpDialog";
import { createPortal } from "react-dom";
import { db, auth } from "./firebase";
import { collection, doc, onSnapshot, query, where, addDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, serverTimestamp, Timestamp } from "firebase/firestore";
import { ShellIcon } from "./AdminShell";
import { isTMUser } from "./staffFilter";

const toMs = (v) => (v?.toMillis ? v.toMillis() : typeof v === "number" ? v : 0);
const fmtAt = (ms, full) => {
  if (!ms) return "";
  const d = new Date(ms); const today = new Date();
  if (!full && d.toDateString() === today.toDateString()) return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString("ko-KR", full ? { year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" } : { month: "numeric", day: "numeric" });
};
const KIND_LABEL = { hr: "인사발령", closeReport: "마감보고", approval: "전자결재" };

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

// 이미지가 크면 문서 1개 한도(1MB)에 맞게 더 줄인다
async function fitImages(images) {
  let imgs = (images || []).slice(0, 3);
  for (let i = 0; i < 4 && imgs.join("").length > 850000; i += 1) {
    const max = [1200, 1000, 820, 680][i];
    imgs = await Promise.all(imgs.map((src) => compressImage(src, max, 0.72)));
  }
  if (imgs.join("").length > 850000) throw new Error("이미지가 너무 큽니다. 장수를 줄여 주세요.");
  return imgs;
}

// 메일 문서 만들기 — status: "sent"(바로) | "draft"(임시보관) | "scheduled"(예약)
//  임시보관·예약은 to를 비우고 pendingTo에 담는다(받는 사람이 미리 못 보게 — 보안규칙도 이렇게 강제).
export function buildMailDoc({ company, to = [], cc = [], subject, body, images = [], kind = "mail", fromName, important = false, status = "sent", scheduledAt = null }) {
  const me = auth.currentUser;
  const toL = (to || []).filter((u) => u?.uid);
  const ccL = (cc || []).filter((u) => u?.uid && !toL.some((x) => x.uid === u.uid));
  const allUids = [...new Set([...toL, ...ccL].map((u) => u.uid))];
  const nm = (u) => u.name || u.email || "";
  const base = {
    company, fromUid: me?.uid || "", fromEmail: me?.email || "", fromName: fromName || me?.email?.split("@")[0] || "",
    subject: String(subject || "").slice(0, 200), body: String(body || "").slice(0, 20000), images,
    kind, important: !!important, status, at: serverTimestamp(), readBy: [], deletedBy: [], starredBy: [],
  };
  if (status === "sent") return { ...base, to: allUids, toNames: toL.map(nm), cc: ccL.map((u) => u.uid), ccNames: ccL.map(nm) };
  return {
    ...base, to: [], toNames: [], cc: [], ccNames: [],
    pendingTo: allUids, pendingToNames: toL.map(nm), pendingCc: ccL.map((u) => u.uid), pendingCcNames: ccL.map(nm),
    ...(status === "scheduled" && scheduledAt ? { scheduledAt: Timestamp.fromDate(new Date(scheduledAt)) } : {}),
  };
}

// 다른 화면(인사발령 등)에서 메일 보내기
export async function sendInternalMail({ company, to, cc = [], subject, body, images = [], kind = "mail", fromName, important = false, status = "sent", scheduledAt = null, replaceId = null }) {
  const list = (to || []).filter((u) => u?.uid);
  if (!list.length) throw new Error("받는 사람이 없습니다.");
  const imgs = await fitImages(images);
  const data = buildMailDoc({ company, to: list, cc, subject, body, images: imgs, kind, fromName, important, status, scheduledAt });
  // 임시보관·예약 메일을 고쳐 다시 저장하면 같은 문서를 고친다. 바로 보내면 새 문서로 보내고 원본은 지운다.
  if (replaceId && status !== "sent") { await updateDoc(doc(db, "internalMails", replaceId), data); return { id: replaceId }; }
  const ref = await addDoc(collection(db, "internalMails"), data);
  if (replaceId) await deleteDoc(doc(db, "internalMails", replaceId)).catch(() => {});
  return ref;
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
      (s) => setInbox(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => !(m.deletedBy || []).includes(uid) && !(m.recalledFor || []).includes(uid)).sort((a, b) => toMs(b.at) - toMs(a.at))), () => {});
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
      <a href={src} download="첨부이미지.jpg" onClick={(e) => e.stopPropagation()} className="absolute top-5 right-5 h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[13px] font-black flex items-center">내려받기</a>
    </div>, document.body);
}

// ─────────────────────────── 메일함 목록(왼쪽 메뉴·홈 사이드바 공용) ───────────────────────────
export const MAIL_FOLDERS = [
  { key: "inbox", label: "받은메일함", icon: "inbox" },
  { key: "unread", label: "안읽은 메일", icon: "mail" },
  { key: "starred", label: "별표 메일", icon: "star" },
  { key: "important", label: "중요 메일", icon: "flag" },
  { key: "official", label: "공문함", icon: "stamp", hint: "인사발령·마감보고·전자결재" },
  { key: "sent", label: "보낸메일함", icon: "send" },
  { key: "self", label: "내게쓴메일함", icon: "user" },
  { key: "scheduled", label: "예약메일함", icon: "clock" },
  { key: "drafts", label: "임시보관함", icon: "file" },
  { key: "trash", label: "휴지통", icon: "trash" },
];
const FOLDER_LABEL = Object.fromEntries(MAIL_FOLDERS.map((f) => [f.key, f.label]));

// 내 메일 전부(받은 것 + 내가 쓴 것) 실시간
export function useMailData(uid) {
  const [inbox, setInbox] = React.useState(null);
  const [mine, setMine] = React.useState(null);
  React.useEffect(() => {
    if (!uid) return undefined;
    const a = onSnapshot(query(collection(db, "internalMails"), where("to", "array-contains", uid)), (s) => setInbox(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setInbox([]));
    const b = onSnapshot(query(collection(db, "internalMails"), where("fromUid", "==", uid)), (s) => setMine(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setMine([]));
    return () => { a(); b(); };
  }, [uid]);
  return { inbox, mine, loading: inbox === null || mine === null };
}

const has = (arr, uid) => (arr || []).includes(uid);
const isSelfMail = (m, uid) => m.fromUid === uid && (m.to || []).length === 1 && m.to[0] === uid;
const statusOf = (m) => m.status || "sent";

// 폴더별 메일 나누기
export function splitFolders(inbox, mine, uid) {
  const inb = (inbox || []).filter((m) => !has(m.recalledFor, uid));
  const my = mine || [];
  const sentAll = my.filter((m) => statusOf(m) === "sent");
  const byId = new Map();
  [...inb, ...sentAll].forEach((m) => byId.set(m.id, m));
  const all = [...byId.values()];
  const alive = (m) => !has(m.deletedBy, uid);
  const received = inb.filter((m) => !isSelfMail(m, uid) && alive(m));
  const sort = (l, key = (m) => toMs(m.at)) => [...l].sort((a, b) => key(b) - key(a));
  return {
    inbox: sort(received),
    unread: sort(received.filter((m) => !has(m.readBy, uid))),
    starred: sort(all.filter((m) => alive(m) && has(m.starredBy, uid))),
    important: sort(received.filter((m) => m.important)),
    official: sort(received.filter((m) => m.kind === "hr" || m.kind === "closeReport" || m.kind === "approval")),
    sent: sort(sentAll.filter((m) => alive(m) && !isSelfMail(m, uid))),
    self: sort(sentAll.filter((m) => alive(m) && isSelfMail(m, uid))),
    scheduled: sort(my.filter((m) => statusOf(m) === "scheduled"), (m) => -toMs(m.scheduledAt)),
    drafts: sort(my.filter((m) => statusOf(m) === "draft")),
    trash: sort(all.filter((m) => has(m.deletedBy, uid) && !has(m.purgedBy, uid))),
  };
}

// 홈 사이드바 등에서 숫자만 필요할 때
export function useMailCounts() {
  const uid = auth.currentUser?.uid;
  const { inbox, mine } = useMailData(uid);
  return React.useMemo(() => {
    const f = splitFolders(inbox, mine, uid);
    return { unread: f.unread.length, inboxUnread: f.unread.length, starred: f.starred.length, importantUnread: f.important.filter((m) => !has(m.readBy, uid)).length, officialUnread: f.official.filter((m) => !has(m.readBy, uid)).length, scheduled: f.scheduled.length, drafts: f.drafts.length, trash: f.trash.length };
  }, [inbox, mine, uid]);
}
export function folderBadge(key, c) {
  return { inbox: c.inboxUnread, unread: c.unread, important: c.importantUnread, official: c.officialUnread, scheduled: c.scheduled, drafts: c.drafts }[key] || 0;
}

const dayLabel = (ms) => {
  if (!ms) return "";
  const d = new Date(ms); d.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - d) / 86400000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  if (diff < 7) return "이번 주";
  if (diff < 31) return "이번 달";
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
};
const pad2 = (n) => String(n).padStart(2, "0");
const localInput = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const sigKey = (uid) => `kpMailSig:${uid}`;
const readSig = (uid) => { try { return localStorage.getItem(sigKey(uid)) ?? ""; } catch { return ""; } };

// 받는 사람 칸 — 이름 검색으로 바로 추가 + 주소록(부서별)
function RecipientField({ label, staff, selected, setSelected, excludeUid, autoFocus }) {
  const [q, setQ] = React.useState("");
  const [book, setBook] = React.useState(false);
  const people = (staff || []).filter((u) => u.uid !== excludeUid);
  const picked = people.filter((u) => selected.has(u.uid));
  const hits = q.trim() ? people.filter((u) => !selected.has(u.uid) && [u.name, u.email, u.team, u.position].some((v) => String(v || "").includes(q.trim()))).slice(0, 8) : [];
  const add = (u) => { setSelected((p) => new Set(p).add(u.uid)); setQ(""); };
  return (
    <div className="border-b border-[#EEF1F6] last:border-b-0">
      <div className="flex items-start gap-3 px-4 py-2.5">
        <span className="w-14 shrink-0 pt-1.5 text-[12.5px] font-bold text-[#7A879C]">{label}</span>
        <div className="flex-1 min-w-0 relative">
          <div className="flex flex-wrap items-center gap-1.5">
            {picked.map((u) => (
              <span key={u.uid} className="h-7 pl-2.5 pr-1 rounded-lg bg-[#EEF3FB] border border-[#D5E0F2] text-[12.5px] font-bold text-[#1B2B4B] inline-flex items-center gap-1">
                {u.name || u.email}{u.position ? <span className="text-[#7A879C] font-semibold">{u.position}</span> : null}
                <button type="button" onClick={() => setSelected((p) => { const n = new Set(p); n.delete(u.uid); return n; })} className="w-5 h-5 rounded-md hover:bg-white text-[#7A879C]">✕</button>
              </span>
            ))}
            <input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { e.preventDefault(); add(hits[0]); } if (e.key === "Backspace" && !q && picked.length) setSelected((p) => { const n = new Set(p); n.delete(picked[picked.length - 1].uid); return n; }); }}
              placeholder={picked.length ? "" : "이름·부서로 검색"} className="flex-1 min-w-[120px] h-7 text-[13.5px] font-semibold outline-none bg-transparent" />
          </div>
          {hits.length > 0 && (
            <div className="absolute left-0 top-full mt-1 z-20 w-[300px] max-w-full bg-white rounded-xl border border-[#DCE3EE] shadow-[0_14px_30px_rgba(15,26,48,0.16)] overflow-hidden">
              {hits.map((u) => (
                <button key={u.uid} type="button" onClick={() => add(u)} className="w-full text-left px-3 py-2 hover:bg-[#F5F8FD] flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-black flex items-center justify-center">{String(u.name || "?").slice(0, 1)}</span>
                  <span className="text-[13px] font-bold text-[#0F1A30]">{u.name || u.email}</span>
                  <span className="text-[11.5px] text-[#7A879C] truncate">{[u.team, u.position].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={() => setBook((v) => !v)} className={`shrink-0 h-7 px-2.5 rounded-lg text-[12px] font-bold border ${book ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`}>주소록</button>
      </div>
      {book && <div className="px-4 pb-3 pt-1 bg-[#FAFBFD]"><RecipientPicker staff={staff} selected={selected} setSelected={setSelected} excludeUid={excludeUid} /></div>}
    </div>
  );
}

// ─────────────────────────── 메일 쓰기 ───────────────────────────
function Composer({ company, myName, staff, uid, init, onClose, onDone }) {
  const self = !!init.self;
  const [to, setTo] = React.useState(() => new Set(init.to || []));
  const [cc, setCc] = React.useState(() => new Set(init.cc || []));
  const [showCc, setShowCc] = React.useState((init.cc || []).length > 0);
  const [subject, setSubject] = React.useState(init.subject || "");
  const [body, setBody] = React.useState(init.body ?? "");
  const [images, setImages] = React.useState(init.images || []);
  const [important, setImportant] = React.useState(!!init.important);
  const [schedOn, setSchedOn] = React.useState(!!init.scheduledAt);
  const [schedAt, setSchedAt] = React.useState(() => {
    if (init.scheduledAt) return localInput(new Date(init.scheduledAt));
    const d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0); return localInput(d);
  });
  const [sigOn, setSigOn] = React.useState(() => !init.id && !!readSig(uid));
  const [sig, setSig] = React.useState(() => readSig(uid));
  const [sigEdit, setSigEdit] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const fileRef = React.useRef(null);
  const meUser = { uid, name: myName || auth.currentUser?.email || "나" };

  const quick = (kind) => {
    const d = new Date();
    if (kind === "1h") { d.setTime(d.getTime() + 3600e3); d.setMinutes(Math.ceil(d.getMinutes() / 10) * 10, 0, 0); }
    if (kind === "tom9") { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
    if (kind === "tom13") { d.setDate(d.getDate() + 1); d.setHours(13, 0, 0, 0); }
    if (kind === "mon9") { d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)); d.setHours(9, 0, 0, 0); }
    setSchedAt(localInput(d)); setSchedOn(true);
  };
  const addImages = async (files) => {
    const arr = [...files].slice(0, 3 - images.length);
    try { const out = await Promise.all(arr.map((f) => compressImage(f))); setImages((p) => [...p, ...out].slice(0, 3)); } catch { setMsg("이미지를 읽지 못했습니다."); }
  };
  const people = (set) => (staff || []).filter((u) => set.has(u.uid));
  const fullBody = () => (sigOn && sig.trim() ? `${body.replace(/\s+$/, "")}\n\n--\n${sig.trim()}` : body);

  const submit = async (mode) => { // mode: send | draft
    const toList = self ? [meUser] : people(to);
    if (mode !== "draft" && !toList.length) { setMsg("받는 사람을 골라 주세요."); return; }
    if (mode !== "draft" && !subject.trim()) { setMsg("제목을 입력해 주세요."); return; }
    let status = mode === "draft" ? "draft" : schedOn ? "scheduled" : "sent";
    if (status === "scheduled") {
      const t = new Date(schedAt).getTime();
      if (!t || t < Date.now() + 60e3) { setMsg("예약 시간은 지금보다 1분 이상 뒤로 골라 주세요."); return; }
    }
    setBusy(mode); setMsg("");
    try {
      if (status === "draft" && !toList.length) {
        // 받는 사람 없이 임시저장 — buildMailDoc을 거치지 않고 바로 저장
        const imgs = await fitImages(images);
        const data = { ...buildMailDoc({ company, to: [meUser], subject, body: fullBody(), images: imgs, fromName: myName, important, status: "draft" }), pendingTo: [], pendingToNames: [], pendingCc: [], pendingCcNames: [] };
        if (init.id) await updateDoc(doc(db, "internalMails", init.id), data); else await addDoc(collection(db, "internalMails"), data);
      } else {
        await sendInternalMail({ company, to: toList, cc: self ? [] : people(cc), subject: subject || "(제목 없음)", body: fullBody(), images, fromName: myName, important, status, scheduledAt: status === "scheduled" ? schedAt : null, replaceId: init.id || null });
      }
      onDone(status);
    } catch (e) { setMsg(e.message || "저장 실패"); } finally { setBusy(""); }
  };
  const saveSig = () => { try { localStorage.setItem(sigKey(uid), sig); } catch { /* 저장 실패 무시 */ } setSigEdit(false); if (sig.trim()) setSigOn(true); };

  return (
    <section className="flex-1 min-w-0 flex flex-col bg-[#F4F6FA]">
      <div className="px-4 sm:px-6 py-4 bg-white border-b border-[#E3E8F0] flex flex-wrap items-center gap-3">
        <div>
          <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#4B6CB7]">{self ? "NOTE TO SELF" : init.id ? "EDIT" : "COMPOSE"}</div>
          <div className="text-[19px] font-black text-[#0F1A30]">{self ? "내게 쓰기" : init.id ? "메일 이어 쓰기" : "메일 쓰기"}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[#5B6B85] text-[13.5px] font-bold">취소</button>
          <button type="button" onClick={() => submit("draft")} disabled={!!busy} className="h-10 px-4 rounded-xl border border-[#0F1A30] bg-white text-[#0F1A30] text-[13.5px] font-black disabled:opacity-50">{busy === "draft" ? "저장 중…" : "임시저장"}</button>
          <button type="button" onClick={() => submit("send")} disabled={!!busy} className="h-10 px-6 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-50 inline-flex items-center gap-2">
            <ShellIcon name={schedOn ? "clock" : "send"} size={15} />
            {busy === "send" ? "보내는 중…" : schedOn ? "예약 보내기" : self ? "저장" : `보내기${to.size + cc.size ? ` (${to.size + cc.size}명)` : ""}`}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        <div className="bg-white rounded-2xl border border-[#E3E8F0]">
          {self ? (
            <div className="px-4 py-3 text-[13px] font-bold text-[#3A4A66] border-b border-[#EEF1F6]">받는 사람 <span className="ml-3 text-[#0F1A30]">나 ({myName})</span> <span className="ml-2 text-[12px] text-[#9AA9C3]">— 메모·할 일을 나에게 보관합니다</span></div>
          ) : (
            <>
              <RecipientField label="받는 사람" staff={staff} selected={to} setSelected={setTo} excludeUid={uid} autoFocus={!init.to?.length} />
              {showCc ? <RecipientField label="참조" staff={staff} selected={cc} setSelected={setCc} excludeUid={uid} />
                : <button type="button" onClick={() => setShowCc(true)} className="mx-4 my-2 text-[12.5px] font-bold text-[#4B6CB7]">+ 참조 추가</button>}
            </>
          )}
          <div className="flex items-center gap-3 px-4 py-2.5 border-t border-[#EEF1F6]">
            <span className="w-14 shrink-0 text-[12.5px] font-bold text-[#7A879C]">제목</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="제목을 입력하세요" className="flex-1 min-w-0 h-8 text-[15px] font-bold text-[#0F1A30] outline-none" />
            <button type="button" onClick={() => setImportant((v) => !v)} title="받는 사람에게 중요 메일로 표시됩니다"
              className={`shrink-0 h-8 px-3 rounded-lg text-[12.5px] font-black border inline-flex items-center gap-1.5 ${important ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE]"}`}>
              <ShellIcon name="flag" size={13} /> 중요
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E3E8F0] overflow-hidden">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={13} placeholder="내용을 입력하세요"
            className="w-full px-5 py-4 text-[14.5px] text-[#0F1A30] leading-[1.8] outline-none resize-y min-h-[240px]" />
          {sigOn && sig.trim() && <div className="px-5 pb-4 text-[13px] text-[#7A879C] whitespace-pre-wrap border-t border-dashed border-[#E3E8F0] pt-3">--{"\n"}{sig.trim()}</div>}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-[#E3E8F0] p-4">
            <div className="text-[12.5px] font-black text-[#0F1A30] mb-2.5">첨부 이미지 <span className="text-[#9AA9C3] font-bold">{images.length}/3</span></div>
            <div className="flex flex-wrap gap-2">
              {images.map((src, i) => (
                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-[#E3E8F0] bg-white">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setImages((p) => p.filter((_, k) => k !== i))} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-[#0F1A30]/80 text-white text-[12px]">✕</button>
                </div>
              ))}
              {images.length < 3 && <button type="button" onClick={() => fileRef.current?.click()} className="w-20 h-20 rounded-xl border-2 border-dashed border-[#C9D2E0] text-[#7A879C] text-[12px] font-bold hover:border-[#4B6CB7]">+ 추가</button>}
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addImages(e.target.files || []); e.target.value = ""; }} />
            </div>
          </div>
          <div className={`rounded-2xl border p-4 ${schedOn ? "bg-[#0F1A30] border-[#0F1A30] text-white" : "bg-white border-[#E3E8F0]"}`}>
            <label className="flex items-center gap-2 text-[12.5px] font-black cursor-pointer">
              <input type="checkbox" checked={schedOn} onChange={(e) => setSchedOn(e.target.checked)} className="w-4 h-4 accent-[#4B6CB7]" />
              <ShellIcon name="clock" size={14} /> 예약 발송
            </label>
            <input type="datetime-local" value={schedAt} onChange={(e) => { setSchedAt(e.target.value); setSchedOn(true); }}
              className={`mt-2.5 w-full h-9 px-3 rounded-lg text-[13px] font-bold outline-none border ${schedOn ? "bg-white/10 border-white/20 text-white [color-scheme:dark]" : "bg-[#F5F8FD] border-[#E3E8F0] text-[#0F1A30]"}`} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[["1h", "1시간 뒤"], ["tom9", "내일 오전 9시"], ["tom13", "내일 오후 1시"], ["mon9", "월요일 9시"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => quick(k)} className={`h-7 px-2.5 rounded-lg text-[11.5px] font-bold border ${schedOn ? "border-white/25 text-white/85 hover:bg-white/10" : "border-[#DCE3EE] text-[#3A4A66] hover:bg-[#F5F8FD]"}`}>{l}</button>
              ))}
            </div>
            {schedOn && <div className="mt-2 text-[11.5px] text-white/60">정한 시간에 자동으로 보내집니다(최대 5분 차이). 예약메일함에서 고치거나 취소할 수 있습니다.</div>}
          </div>
          <div className="bg-white rounded-2xl border border-[#E3E8F0] p-4">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-[12.5px] font-black text-[#0F1A30] cursor-pointer">
                <input type="checkbox" checked={sigOn} onChange={(e) => setSigOn(e.target.checked)} className="w-4 h-4 accent-[#1B2B4B]" /> 서명 넣기
              </label>
              <button type="button" onClick={() => setSigEdit((v) => !v)} className="ml-auto text-[12px] font-bold text-[#4B6CB7]">{sigEdit ? "닫기" : "서명 편집"}</button>
            </div>
            {sigEdit ? (
              <div className="mt-2">
                <textarea value={sig} onChange={(e) => setSig(e.target.value)} rows={3} placeholder={`예) ${myName || "홍길동"} 대리\n${company} 배차팀 · 010-0000-0000`} className="w-full px-3 py-2 rounded-lg border border-[#DCE3EE] text-[12.5px] outline-none focus:border-[#4B6CB7]" />
                <button type="button" onClick={saveSig} className="mt-1.5 h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[12px] font-black">서명 저장</button>
              </div>
            ) : (
              <div className="mt-2 text-[12px] text-[#7A879C] whitespace-pre-wrap line-clamp-3">{sig.trim() || "저장된 서명이 없습니다. 서명 편집으로 만들어 두면 메일 끝에 자동으로 붙습니다."}</div>
            )}
          </div>
        </div>
        {msg && <div className="text-[13px] font-bold text-[#0F1A30] bg-white rounded-xl border border-[#DCE3EE] px-4 py-2.5">⚠ {msg}</div>}
      </div>
    </section>
  );
}

// 인쇄 — 새 창에 메일만 띄워 인쇄
function printMail(m) {
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return;
  const esc = (t) => String(t || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  w.document.write(`<html><head><meta charset="utf-8"><title>${esc(m.subject)}</title><style>body{font-family:'Pretendard','Noto Sans KR',sans-serif;padding:32px;color:#0F1A30}h1{font-size:22px;margin:0 0 12px}table{font-size:13px;border-collapse:collapse;margin-bottom:18px}td{padding:3px 12px 3px 0;vertical-align:top}td:first-child{color:#7A879C;font-weight:700}pre{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.8;border-top:2px solid #0F1A30;padding-top:16px}img{max-width:100%;margin:10px 0;border:1px solid #E3E8F0}</style></head><body>
    <h1>${m.important ? "[중요] " : ""}${esc(m.subject)}</h1>
    <table><tr><td>보낸 사람</td><td>${esc(m.fromName)} ${esc(m.fromEmail)}</td></tr><tr><td>받는 사람</td><td>${esc((m.toNames || m.pendingToNames || []).join(", "))}</td></tr>${(m.ccNames || []).length ? `<tr><td>참조</td><td>${esc(m.ccNames.join(", "))}</td></tr>` : ""}<tr><td>날짜</td><td>${esc(fmtAt(toMs(m.at), true))}</td></tr></table>
    <pre>${esc(m.body)}</pre>${(m.images || []).map((s) => `<img src="${s}">`).join("")}
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
  w.document.close();
}

// 받는 사람별 읽음 현황(보낸 메일)
function ReadReceipt({ m, staff, uid }) {
  const names = [...(m.toNames || []), ...(m.ccNames || [])];
  const nameOf = (u) => (staff || []).find((x) => x.uid === u)?.name || names[(m.to || []).indexOf(u)] || "알 수 없음";
  const rows = (m.to || []).filter((u) => u !== uid).map((u) => ({ uid: u, name: nameOf(u), read: has(m.readBy, u), recalled: has(m.recalledFor, u), cc: has(m.cc, u) }));
  const readN = rows.filter((r) => r.read).length;
  const unreadRows = rows.filter((r) => !r.read && !r.recalled);
  const recall = async () => {
    if (!unreadRows.length) return;
    if (!await kpConfirm(`아직 읽지 않은 ${unreadRows.length}명에게서 이 메일을 회수할까요?\n(이미 읽은 사람에게는 그대로 남습니다)`)) return;
    await updateDoc(doc(db, "internalMails", m.id), { recalledFor: arrayUnion(...unreadRows.map((r) => r.uid)) }).catch((e) => window.alert("발송 취소 실패: " + e.message));
  };
  if (!rows.length) return null;
  return (
    <div className="bg-white rounded-2xl border border-[#E3E8F0] overflow-hidden">
      <div className="px-5 py-3 flex items-center gap-3 border-b border-[#EEF1F6]">
        <ShellIcon name="eye" size={16} className="text-[#1B2B4B]" />
        <span className="text-[13.5px] font-black text-[#0F1A30]">수신 확인</span>
        <span className="text-[12.5px] font-bold text-[#7A879C]">{readN}/{rows.length}명 읽음</span>
        <div className="flex-1 h-1.5 rounded-full bg-[#EEF1F6] overflow-hidden max-w-[160px]"><div className="h-full bg-[#1B2B4B]" style={{ width: `${(readN / rows.length) * 100}%` }} /></div>
        {unreadRows.length > 0 && <button type="button" onClick={recall} className="ml-auto h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-bold text-[#3A4A66] hover:bg-[#F5F8FD]">안 읽은 {unreadRows.length}명 발송취소</button>}
      </div>
      <div className="px-5 py-3 flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <span key={r.uid} className={`h-7 px-2.5 rounded-lg text-[12px] font-bold inline-flex items-center gap-1.5 border ${r.read ? "bg-[#0F1A30] text-white border-[#0F1A30]" : r.recalled ? "bg-[#F5F8FD] text-[#9AA9C3] border-[#E3E8F0] line-through" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`}>
            {r.name}{r.cc && <span className="opacity-60">참조</span>}<span className="opacity-75">{r.read ? "읽음" : r.recalled ? "회수" : "안읽음"}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── 메일함 본문(목록 + 읽기) ───────────────────────────
//  embedded: 홈 화면 안에 들어갈 때(폴더 메뉴는 홈 사이드바가 맡는다)
export function MailWorkspace({ company, myName, box, setBox, openId, embedded = false, height, composeTick = 0 }) {
  const uid = auth.currentUser?.uid;
  const staff = useCompanyStaff(company);
  const { inbox, mine, loading } = useMailData(uid);
  const folders = React.useMemo(() => splitFolders(inbox, mine, uid), [inbox, mine, uid]);
  const [curId, setCurId] = React.useState(null);
  const [compose, setCompose] = React.useState(null);
  const [view, setView] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [chip, setChip] = React.useState("all");
  const [sel, setSel] = React.useState(() => new Set());
  const [limit, setLimit] = React.useState(40);

  React.useEffect(() => { setCurId(null); setSel(new Set()); setLimit(40); setChip("all"); }, [box]);
  React.useEffect(() => { if (openId) { setBox("inbox"); setCompose(null); setCurId(openId); } }, [openId, setBox]);
  React.useEffect(() => { if (composeTick) setCompose({}); }, [composeTick]);

  const all = React.useMemo(() => { const m = new Map(); [...(inbox || []), ...(mine || [])].forEach((x) => m.set(x.id, x)); return m; }, [inbox, mine]);
  const cur = curId ? all.get(curId) : null;
  // 열면 읽음 표시
  React.useEffect(() => {
    if (cur && has(cur.to, uid) && !has(cur.readBy, uid)) updateDoc(doc(db, "internalMails", cur.id), { readBy: arrayUnion(uid) }).catch(() => {});
  }, [cur, uid]);

  const base = folders[box] || [];
  const kw = q.trim();
  const list = base.filter((m) => {
    if (chip === "unread" && has(m.readBy, uid)) return false;
    if (chip === "attach" && !(m.images || []).length) return false;
    if (chip === "important" && !m.important) return false;
    if (chip === "starred" && !has(m.starredBy, uid)) return false;
    return !kw || [m.subject, m.body, m.fromName, ...(m.toNames || []), ...(m.ccNames || []), ...(m.pendingToNames || [])].some((v) => String(v || "").includes(kw));
  });
  const shown = list.slice(0, limit);
  const isOutbox = ["sent", "self", "scheduled", "drafts"].includes(box);
  const allSel = shown.length > 0 && shown.every((m) => sel.has(m.id));

  const upd = (m, data) => updateDoc(doc(db, "internalMails", m.id), data).catch((e) => window.alert("처리 실패: " + e.message));
  const toggleStar = (m) => upd(m, { starredBy: has(m.starredBy, uid) ? arrayRemove(uid) : arrayUnion(uid) });
  const removeMail = async (m) => {
    if (["drafts", "scheduled"].includes(box) || ["draft", "scheduled"].includes(statusOf(m))) {
      if (!await kpConfirm(statusOf(m) === "scheduled" ? "예약을 취소하고 메일을 지울까요?" : "임시보관 메일을 지울까요?")) return;
      await deleteDoc(doc(db, "internalMails", m.id)).catch(() => {});
    } else await upd(m, { deletedBy: arrayUnion(uid) });
    if (curId === m.id) setCurId(null);
  };
  const bulk = async (act) => {
    const ms = shown.filter((m) => sel.has(m.id));
    if (!ms.length) return;
    if (act === "purge" && !await kpConfirm(`${ms.length}통을 영구 삭제할까요? 되돌릴 수 없습니다.`)) return;
    if (act === "delete" && ["drafts", "scheduled"].includes(box) && !await kpConfirm(`${ms.length}통을 지울까요?`)) return;
    await Promise.all(ms.map((m) => {
      if (act === "read") return has(m.to, uid) ? upd(m, { readBy: arrayUnion(uid) }) : null;
      if (act === "unread") return has(m.to, uid) ? upd(m, { readBy: arrayRemove(uid) }) : null;
      if (act === "star") return upd(m, { starredBy: arrayUnion(uid) });
      if (act === "restore") return upd(m, { deletedBy: arrayRemove(uid) });
      if (act === "purge") return upd(m, { purgedBy: arrayUnion(uid) });
      if (act === "delete") return ["draft", "scheduled"].includes(statusOf(m)) ? deleteDoc(doc(db, "internalMails", m.id)).catch(() => {}) : upd(m, { deletedBy: arrayUnion(uid) });
      return null;
    }));
    setSel(new Set());
  };
  const emptyTrash = async () => {
    if (!folders.trash.length || !await kpConfirm(`휴지통의 메일 ${folders.trash.length}통을 모두 영구 삭제할까요?`)) return;
    await Promise.all(folders.trash.map((m) => upd(m, { purgedBy: arrayUnion(uid) })));
  };

  const quote = (m) => `\n\n----- ${m.fromName}님이 ${fmtAt(toMs(m.at), true)}에 보낸 메일 -----\n${m.body || ""}`;
  const reply = (m, allReply) => {
    const t = new Set([m.fromUid, ...(allReply ? (m.to || []).filter((u) => !has(m.cc, u)) : [])]); t.delete(uid);
    const c = new Set(allReply ? (m.cc || []) : []); c.delete(uid);
    setCompose({ to: [...t], cc: [...c], subject: /^RE:/i.test(m.subject || "") ? m.subject : `RE: ${m.subject || ""}`, body: quote(m) });
  };
  const forward = (m) => setCompose({ subject: `FW: ${m.subject || ""}`, body: `\n\n----- 전달 메일 -----\n보낸 사람: ${m.fromName}\n날짜: ${fmtAt(toMs(m.at), true)}\n제목: ${m.subject || ""}\n\n${m.body || ""}`, images: m.images || [] });
  const editPending = (m) => setCompose({
    id: m.id, to: (m.pendingTo || []).filter((u) => !has(m.pendingCc, u)), cc: m.pendingCc || [], subject: m.subject, body: m.body, images: m.images || [],
    important: m.important, scheduledAt: statusOf(m) === "scheduled" ? toMs(m.scheduledAt) : null, self: (m.pendingTo || []).length === 1 && m.pendingTo[0] === uid,
  });
  const sendNow = async (m) => {
    if (!await kpConfirm("예약을 풀고 지금 바로 보낼까요?")) return;
    const people = (m.pendingTo || []).map((u, i) => ({ uid: u, name: [...(m.pendingToNames || []), ...(m.pendingCcNames || [])][i] || "" }));
    const ccSet = new Set(m.pendingCc || []);
    try {
      await sendInternalMail({ company, to: people.filter((p) => !ccSet.has(p.uid)), cc: people.filter((p) => ccSet.has(p.uid)), subject: m.subject, body: m.body, images: m.images || [], fromName: m.fromName, important: m.important, replaceId: m.id });
      setCurId(null);
    } catch (e) { window.alert(e.message); }
  };
  const cancelSchedule = (m) => upd(m, { status: "draft", scheduledAt: null });

  const counts = { unread: folders.unread.length };
  const groupOf = (m) => (box === "scheduled" ? "예약" : dayLabel(toMs(m.at)));
  const style = height ? { height } : undefined;

  if (compose) {
    return (
      <div className={`flex min-h-0 ${embedded ? "rounded-[20px] overflow-hidden border border-[#E3E8F0]" : "flex-1"}`} style={style}>
        <Composer company={company} myName={myName} staff={staff} uid={uid} init={compose} onClose={() => setCompose(null)}
          onDone={(st) => { setCompose(null); setBox(st === "draft" ? "drafts" : st === "scheduled" ? "scheduled" : compose.self ? "self" : "sent"); }} />
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 bg-white ${embedded ? "rounded-[20px] overflow-hidden border border-[#E3E8F0] shadow-[0_10px_30px_rgba(15,26,48,0.06)]" : "flex-1"}`} style={style}>
      {/* 목록 */}
      <section className={`${cur ? "hidden lg:flex" : "flex"} lg:w-[400px] flex-1 lg:flex-none flex-col border-r border-[#E3E8F0] min-w-0`}>
        <div className="px-4 pt-4 pb-3 border-b border-[#EEF1F6] space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="min-w-0">
              <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#4B6CB7]">MAILBOX</div>
              <div className="text-[18px] font-black text-[#0F1A30] truncate">{FOLDER_LABEL[box] || "메일함"} <span className="text-[13px] font-bold text-[#9AA9C3] tabular-nums">{base.length}</span></div>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {box === "self" && <button type="button" onClick={() => setCompose({ self: true })} className="h-9 px-3 rounded-xl border border-[#0F1A30] text-[#0F1A30] text-[12.5px] font-black">내게 쓰기</button>}
              {box === "trash" && folders.trash.length > 0 && <button type="button" onClick={emptyTrash} className="h-9 px-3 rounded-xl border border-[#DCE3EE] text-[#3A4A66] text-[12.5px] font-bold">휴지통 비우기</button>}
              {embedded && <button type="button" onClick={() => setCompose({})} className="h-9 px-3.5 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black inline-flex items-center gap-1.5"><ShellIcon name="pen" size={14} />메일 쓰기</button>}
            </div>
          </div>
          <div className="relative">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목·내용·사람 검색" className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#DCE3EE] bg-[#F8FAFD] text-[13.5px] font-semibold outline-none focus:border-[#4B6CB7] focus:bg-white" />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA9C3]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[["all", "전체"], ...(isOutbox ? [] : [["unread", "안읽음"]]), ["attach", "첨부"], ["important", "중요"], ["starred", "별표"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setChip(k)} className={`h-7 px-3 rounded-full text-[12px] font-bold shrink-0 border ${chip === k ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE]"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="px-4 h-10 border-b border-[#EEF1F6] flex items-center gap-1.5 bg-[#FAFBFD]">
          <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(shown.map((m) => m.id)))} className="w-4 h-4 accent-[#1B2B4B]" title="전체 선택" />
          {sel.size > 0 ? (
            <>
              <span className="text-[12px] font-black text-[#0F1A30] mr-1">{sel.size}통</span>
              {box === "trash" ? (
                <>
                  <button type="button" onClick={() => bulk("restore")} className="h-7 px-2.5 rounded-lg text-[12px] font-bold text-[#1B2B4B] hover:bg-white border border-transparent hover:border-[#DCE3EE]">복원</button>
                  <button type="button" onClick={() => bulk("purge")} className="h-7 px-2.5 rounded-lg text-[12px] font-bold text-[#1B2B4B] hover:bg-white border border-transparent hover:border-[#DCE3EE]">영구삭제</button>
                </>
              ) : (
                <>
                  {!isOutbox && <button type="button" onClick={() => bulk("read")} className="h-7 px-2.5 rounded-lg text-[12px] font-bold text-[#1B2B4B] hover:bg-white border border-transparent hover:border-[#DCE3EE]">읽음</button>}
                  {!isOutbox && <button type="button" onClick={() => bulk("unread")} className="h-7 px-2.5 rounded-lg text-[12px] font-bold text-[#1B2B4B] hover:bg-white border border-transparent hover:border-[#DCE3EE]">안읽음</button>}
                  {!["drafts", "scheduled"].includes(box) && <button type="button" onClick={() => bulk("star")} className="h-7 px-2.5 rounded-lg text-[12px] font-bold text-[#1B2B4B] hover:bg-white border border-transparent hover:border-[#DCE3EE]">별표</button>}
                  <button type="button" onClick={() => bulk("delete")} className="h-7 px-2.5 rounded-lg text-[12px] font-bold text-[#1B2B4B] hover:bg-white border border-transparent hover:border-[#DCE3EE]">삭제</button>
                </>
              )}
            </>
          ) : (
            <span className="text-[12px] font-bold text-[#9AA9C3]">{box === "inbox" || box === "unread" ? `안 읽은 메일 ${counts.unread}통` : `${list.length}통`}</span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <div className="py-20 text-center text-[13.5px] text-[#9AA9C3]">메일 불러오는 중…</div>
            : shown.length === 0 ? (
              <div className="py-20 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F5F8FD] flex items-center justify-center text-[#9AA9C3]"><ShellIcon name={MAIL_FOLDERS.find((f) => f.key === box)?.icon || "mail"} size={24} /></div>
                <div className="mt-3 text-[13.5px] font-bold text-[#9AA9C3]">{kw || chip !== "all" ? "조건에 맞는 메일이 없습니다" : `${FOLDER_LABEL[box] || "메일함"}이 비어 있습니다`}</div>
              </div>
            ) : shown.map((m, i) => {
              const g = groupOf(m);
              const showG = i === 0 || groupOf(shown[i - 1]) !== g;
              const unreadOne = has(m.to, uid) && !has(m.readBy, uid) && !isOutbox;
              const on = curId === m.id;
              const star = has(m.starredBy, uid);
              const st = statusOf(m);
              const toNames = st === "sent" ? (m.toNames || []) : (m.pendingToNames || []);
              const who = isOutbox || (box === "trash" && m.fromUid === uid) || box === "starred" && m.fromUid === uid
                ? (toNames.length ? `→ ${toNames.slice(0, 2).join(", ")}${toNames.length > 2 ? ` 외 ${toNames.length - 2}명` : ""}` : "(받는 사람 없음)")
                : m.fromName;
              const others = (m.to || []).filter((u) => u !== uid);
              const readN = others.filter((u) => has(m.readBy, u)).length;
              return (
                <React.Fragment key={m.id}>
                  {showG && box !== "scheduled" && <div className="px-4 pt-3 pb-1 text-[11px] font-black tracking-wider text-[#9AA9C3] bg-white">{g}</div>}
                  <div onClick={() => setCurId(m.id)} className={`group flex gap-2.5 px-4 py-3 border-b border-[#F1F4F9] cursor-pointer transition ${on ? "bg-[#EEF3FB]" : unreadOne ? "bg-white hover:bg-[#F8FAFD]" : "bg-white hover:bg-[#F8FAFD]"}`}>
                    <div className="flex flex-col items-center gap-1.5 pt-0.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={sel.has(m.id)} onChange={() => setSel((p) => { const n = new Set(p); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })} className="w-4 h-4 accent-[#1B2B4B]" />
                      {!["drafts", "scheduled"].includes(box) && (
                        <button type="button" onClick={() => toggleStar(m)} title="별표" className={star ? "text-[#1B2B4B]" : "text-[#C9D2E0] hover:text-[#7A879C]"}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill={star ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" /></svg>
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {unreadOne && <span className="w-2 h-2 rounded-full bg-[#1B2B4B] shrink-0" />}
                        <span className={`text-[13.5px] truncate ${unreadOne ? "font-black text-[#0F1A30]" : "font-bold text-[#3A4A66]"}`}>{who}</span>
                        <span className="ml-auto text-[11.5px] text-[#9AA9C3] shrink-0 tabular-nums">
                          {st === "scheduled" ? `⏰ ${fmtAt(toMs(m.scheduledAt), false)} ${new Date(toMs(m.scheduledAt)).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : fmtAt(toMs(m.at))}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {m.important && <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded bg-[#0F1A30] text-white shrink-0">중요</span>}
                        {KIND_LABEL[m.kind] && <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded border border-[#0F1A30] text-[#0F1A30] shrink-0">{KIND_LABEL[m.kind]}</span>}
                        {st === "draft" && <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded border border-[#9AA9C3] text-[#7A879C] shrink-0">임시</span>}
                        <span className={`text-[13.5px] truncate ${unreadOne ? "font-extrabold text-[#0F1A30]" : "text-[#3A4A66]"}`}>{m.subject || "(제목 없음)"}</span>
                        {(m.images || []).length > 0 && <span className="text-[11px] text-[#9AA9C3] shrink-0">📎{m.images.length}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[12.5px] text-[#9AA9C3] truncate flex-1">{String(m.body || "").replace(/\s+/g, " ") || " "}</span>
                        {box === "sent" && others.length > 0 && <span className={`text-[11px] font-bold shrink-0 ${readN === others.length ? "text-[#1B2B4B]" : "text-[#9AA9C3]"}`}>{readN}/{others.length} 읽음</span>}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          {list.length > shown.length && <button type="button" onClick={() => setLimit((n) => n + 40)} className="w-full h-11 text-[13px] font-bold text-[#4B6CB7] hover:bg-[#F8FAFD]">더 보기 ({list.length - shown.length}통 남음)</button>}
        </div>
      </section>

      {/* 읽기 */}
      <section className={`${cur ? "flex" : "hidden lg:flex"} flex-1 flex-col min-w-0 bg-[#F4F6FA]`}>
        {!cur ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 rounded-[20px] flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg,#0F1A30,#2D4C82)" }}><ShellIcon name="mail" size={28} /></div>
            <div className="mt-4 text-[16px] font-black text-[#0F1A30]">메일을 고르면 여기에서 읽을 수 있습니다</div>
            <div className="mt-1 text-[13px] text-[#7A879C]">안 읽은 메일 {counts.unread}통 · 예약 {folders.scheduled.length}통 · 임시보관 {folders.drafts.length}통</div>
            <button type="button" onClick={() => setCompose({})} className="mt-5 h-11 px-6 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black inline-flex items-center gap-2"><ShellIcon name="pen" size={15} />새 메일 쓰기</button>
          </div>
        ) : (() => {
          const st = statusOf(cur);
          const mineMail = cur.fromUid === uid;
          const inTrash = has(cur.deletedBy, uid);
          const toNames = st === "sent" ? (cur.toNames || []) : (cur.pendingToNames || []);
          const ccNames = st === "sent" ? (cur.ccNames || []) : (cur.pendingCcNames || []);
          const star = has(cur.starredBy, uid);
          const Btn = ({ onClick, children, primary }) => <button type="button" onClick={onClick} className={`h-9 px-3.5 rounded-lg text-[12.5px] font-black ${primary ? "bg-[#0F1A30] text-white" : "border border-[#DCE3EE] bg-white text-[#3A4A66] hover:bg-[#F5F8FD]"}`}>{children}</button>;
          return (
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-5 bg-white border-b border-[#E3E8F0]">
                <button type="button" onClick={() => setCurId(null)} className="lg:hidden text-[13px] font-bold text-[#4B6CB7] mb-2">← 목록</button>
                <div className="flex items-start gap-2">
                  {cur.important && <span className="mt-1 text-[11px] font-black px-2 py-0.5 rounded bg-[#0F1A30] text-white shrink-0">중요</span>}
                  {KIND_LABEL[cur.kind] && <span className="mt-1 text-[11px] font-black px-2 py-0.5 rounded border border-[#0F1A30] text-[#0F1A30] shrink-0">{KIND_LABEL[cur.kind]}</span>}
                  <h2 className="flex-1 text-[21px] font-black text-[#0F1A30] leading-snug break-words">{cur.subject || "(제목 없음)"}</h2>
                  {st === "sent" && (
                    <button type="button" onClick={() => toggleStar(cur)} title="별표" className={`mt-1 ${star ? "text-[#1B2B4B]" : "text-[#C9D2E0] hover:text-[#7A879C]"}`}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill={star ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" /></svg>
                    </button>
                  )}
                </div>
                <div className="mt-4 flex items-start gap-3">
                  <span className="w-11 h-11 rounded-[14px] flex items-center justify-center text-white text-[16px] font-black shrink-0" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}>{String(cur.fromName || "?").slice(0, 1)}</span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-[14.5px] font-black text-[#0F1A30]">{cur.fromName} <span className="text-[12px] font-semibold text-[#9AA9C3]">{cur.fromEmail}</span></div>
                    <div className="text-[12.5px] text-[#5B6B85]"><b className="text-[#7A879C] font-bold mr-1.5">받는 사람</b>{toNames.join(", ") || "-"}</div>
                    {ccNames.length > 0 && <div className="text-[12.5px] text-[#5B6B85]"><b className="text-[#7A879C] font-bold mr-1.5">참조</b>{ccNames.join(", ")}</div>}
                  </div>
                  <div className="text-[12px] text-[#9AA9C3] shrink-0 text-right">
                    {st === "scheduled" ? <span className="font-bold text-[#1B2B4B]">⏰ {fmtAt(toMs(cur.scheduledAt), true)} 발송 예약</span> : fmtAt(toMs(cur.at), true)}
                    {cur.scheduledFor && <div className="text-[11px]">예약 발송된 메일</div>}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {inTrash ? (
                    <>
                      <Btn primary onClick={() => upd(cur, { deletedBy: arrayRemove(uid) })}>복원</Btn>
                      <Btn onClick={async () => { if (await kpConfirm("영구 삭제할까요? 되돌릴 수 없습니다.")) { await upd(cur, { purgedBy: arrayUnion(uid) }); setCurId(null); } }}>영구삭제</Btn>
                    </>
                  ) : st === "draft" ? (
                    <>
                      <Btn primary onClick={() => editPending(cur)}>이어 쓰기</Btn>
                      <Btn onClick={() => removeMail(cur)}>삭제</Btn>
                    </>
                  ) : st === "scheduled" ? (
                    <>
                      <Btn primary onClick={() => sendNow(cur)}>지금 보내기</Btn>
                      <Btn onClick={() => editPending(cur)}>수정</Btn>
                      <Btn onClick={() => cancelSchedule(cur)}>예약 취소(임시보관으로)</Btn>
                      <Btn onClick={() => removeMail(cur)}>삭제</Btn>
                    </>
                  ) : (
                    <>
                      {!mineMail && <Btn primary onClick={() => reply(cur, false)}>답장</Btn>}
                      {!mineMail && (cur.to || []).length > 1 && <Btn onClick={() => reply(cur, true)}>전체 답장</Btn>}
                      <Btn onClick={() => forward(cur)}>전달</Btn>
                      {mineMail && <Btn onClick={() => setCompose({ to: (cur.to || []).filter((u) => !has(cur.cc, u) && u !== uid), cc: cur.cc || [], subject: cur.subject, body: cur.body, images: cur.images || [], important: cur.important, self: isSelfMail(cur, uid) })}>다시 보내기</Btn>}
                      {has(cur.to, uid) && <Btn onClick={() => { upd(cur, { readBy: arrayRemove(uid) }); setCurId(null); }}>안읽음 표시</Btn>}
                      <Btn onClick={() => printMail(cur)}>인쇄</Btn>
                      <Btn onClick={() => removeMail(cur)}>삭제</Btn>
                    </>
                  )}
                </div>
              </div>
              <div className="px-6 py-5 space-y-4">
                {mineMail && st === "sent" && !isSelfMail(cur, uid) && <ReadReceipt m={cur} staff={staff} uid={uid} />}
                {cur.body && <div className="text-[14.5px] text-[#1F2A44] leading-[1.85] whitespace-pre-wrap break-words bg-white rounded-2xl border border-[#E3E8F0] px-6 py-5">{cur.body}</div>}
                {(cur.images || []).length > 0 && (
                  <div>
                    <div className="text-[12.5px] font-black text-[#7A879C] mb-2">첨부 이미지 {cur.images.length}장</div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                      {cur.images.map((src, i) => <img key={i} src={src} alt="" onClick={() => setView(src)} className="w-full rounded-xl border border-[#E3E8F0] bg-white cursor-zoom-in shadow-[0_6px_20px_rgba(16,24,40,0.06)]" />)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </section>
      {view && <ImageViewer src={view} onClose={() => setView(null)} />}
    </div>
  );
}

// ─────────────────────────── 팝업 메일함(헤더 버튼·모바일) ───────────────────────────
export function MailCenter({ company, myName, onClose, openId }) {
  const [box, setBox] = React.useState("inbox");
  const [composeTick, setComposeTick] = React.useState(0);
  const c = useMailCounts();
  const nav = (f) => {
    const b = folderBadge(f.key, c);
    const on = box === f.key;
    return (
      <button key={f.key} type="button" onClick={() => setBox(f.key)}
        className={`shrink-0 sm:w-full flex items-center gap-2.5 h-10 px-3 rounded-xl text-[13.5px] font-bold transition ${on ? "bg-white text-[#0F1A30] shadow-[0_6px_16px_rgba(0,0,0,0.18)]" : "text-white/75 hover:bg-white/10"}`}>
        <ShellIcon name={f.icon} size={16} className={on ? "text-[#1B2B4B]" : "text-blue-200/80"} />
        <span className="flex-1 text-left whitespace-nowrap">{f.label}</span>
        {b > 0 && <span className={`min-w-[22px] h-[20px] px-1.5 rounded-full text-[11px] font-black flex items-center justify-center ${on ? "bg-[#0F1A30] text-white" : f.key === "inbox" || f.key === "unread" ? "bg-rose-500 text-white" : "bg-white/15 text-white"}`}>{b > 99 ? "99+" : b}</span>}
      </button>
    );
  };
  return createPortal(
    <div className="fixed inset-0 z-[1000000] bg-[#0F1A30]/45 flex items-center justify-center p-0 sm:p-5" onClick={onClose}>
      <div className="w-full h-full sm:h-[88vh] max-w-[1320px] bg-[#F4F6FA] sm:rounded-[24px] shadow-[0_24px_60px_rgba(15,26,48,0.35)] flex flex-col sm:flex-row overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <aside className="sm:w-[228px] shrink-0 p-3 sm:p-4 flex sm:flex-col gap-1.5 text-white overflow-x-auto sm:overflow-y-auto no-scrollbar" style={{ background: "linear-gradient(170deg, #0F1A30 0%, #1B2B4B 60%, #2D4C82 100%)" }}>
          <div className="hidden sm:block px-2 pb-3 mb-1 border-b border-white/10">
            <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-white/50">MAIL · {company}</div>
            <div className="text-[19px] font-black">사내메일함</div>
          </div>
          <button type="button" onClick={() => setComposeTick((n) => n + 1)} className="shrink-0 sm:w-full h-11 px-4 mb-1 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black shadow-[0_8px_18px_rgba(0,0,0,0.25)] inline-flex items-center justify-center gap-2"><ShellIcon name="pen" size={15} />메일 쓰기</button>
          {MAIL_FOLDERS.map(nav)}
          <button type="button" onClick={onClose} className="shrink-0 order-first sm:order-none sm:mt-auto h-11 sm:h-10 px-4 rounded-xl bg-white/10 sm:bg-transparent text-white/80 sm:text-white/60 text-[13px] font-bold hover:bg-white/10">닫기</button>
        </aside>
        <MailWorkspace company={company} myName={myName} box={box} setBox={setBox} openId={openId} composeTick={composeTick} />
      </div>
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
