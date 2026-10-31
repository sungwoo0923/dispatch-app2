// ======================= src/HandoverCenter.jsx =======================
// 🔁 인수인계(2026-10-31) — 홈 › 전자결재 안으로 옮긴 인수인계 화면. PC 홈과 모바일 전자결재가 같은 화면을 쓴다.
//  받은/보낸/회사 전체(관리자) 목록 · 받는 사람별 확인 여부 · 열면 자동 확인 · 작성자는 수정/삭제.
//  작성은 기존 인수인계 작성 화면(HomeWriters › HandoverWriter)을 그대로 쓴다.
import React from "react";
import { collection, deleteDoc, doc, onSnapshot, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "./firebase";
import { ShellIcon } from "./AdminShell";
import { HandoverWriter, handoverReceivers } from "./HomeWriters";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const HERO_BG = "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)";
const toMs = (t) => (t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : typeof t === "number" ? t : 0);
const ADMIN_ROLES = ["admin", "totalMaster", "superadmin", "hrManager"];

// 내가 받은 인수인계 중 아직 안 본 개수(메뉴 숫자)
export function useHandoverUnread(uid) {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(collection(db, "handovers"), (s) => setN(s.docs.filter((d) => { const h = d.data(); return handoverReceivers(h).includes(uid) && !(h.readBy || []).includes(uid); }).length), () => setN(0));
  }, [uid]);
  return n;
}

export default function HandoverCenter({ company, me, isViewer = false }) {
  const [list, setList] = React.useState(null);
  const [tab, setTab] = React.useState("in");
  const [open, setOpen] = React.useState(null);
  const [writer, setWriter] = React.useState(null); // { initial }
  React.useEffect(() => onSnapshot(collection(db, "handovers"), (s) => {
    setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (toMs(b.createdAt) || Date.parse(b.date || 0) || 0) - (toMs(a.createdAt) || Date.parse(a.date || 0) || 0)));
  }, () => setList([])), []);
  const uid = me?.uid;
  const admin = ADMIN_ROLES.includes(me?.role);
  const L = list || [];
  const sets = {
    in: L.filter((h) => handoverReceivers(h).includes(uid)),
    out: L.filter((h) => h.authorUid === uid),
    all: L,
  };
  const unread = sets.in.filter((h) => !(h.readBy || []).includes(uid)).length;
  const rows = sets[tab] || [];
  const cur = open ? L.find((h) => h.id === open) : null;

  const openDoc = async (h) => {
    setOpen(h.id);
    if (handoverReceivers(h).includes(uid) && !(h.readBy || []).includes(uid)) {
      await updateDoc(doc(db, "handovers", h.id), { readBy: arrayUnion(uid) }).catch(() => {});
    }
  };
  const remove = async (h) => {
    if (!window.confirm("인수인계를 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "handovers", h.id)).catch((e) => window.alert(e.message));
    setOpen(null);
  };

  if (writer) {
    return (
      <HandoverWriter me={me} company={company} initial={writer.initial}
        onCancel={() => setWriter(null)} onSaved={() => { setWriter(null); setTab("out"); }} />
    );
  }

  const dateLabel = (h) => { const d = h.date || ""; if (!d) return "업무 인수인계"; const [y, m, day] = d.split("-"); return `${y}년 ${m}월 ${day}일 업무 인수인계`; };
  const timeLabel = (h) => { const ms = toMs(h.createdAt); if (!ms) return ""; const t = new Date(ms); return `${String(t.getMonth() + 1).padStart(2, "0")}.${String(t.getDate()).padStart(2, "0")} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`; };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[22px] px-4 py-4 md:px-7 md:py-5 text-white flex items-center justify-between gap-4 flex-wrap shadow-[0_14px_32px_rgba(15,26,48,0.25)]" style={{ background: HERO_BG }}>
        <div>
          <div className="text-[11px] md:text-[12px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>E-APPROVAL · HANDOVER</div>
          <div className="text-[20px] md:text-[24px] font-black mt-0.5">인수인계</div>
          <div className="text-[12.5px] md:text-[14px] text-white/60 mt-0.5">업무를 넘기고, 받는 사람마다 확인 여부를 봅니다</div>
        </div>
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          {[["내 미확인", unread], ["받은", sets.in.length], ["보낸", sets.out.length]].map(([l, v]) => (
            <div key={l} className="flex-1 md:flex-none min-w-0 md:min-w-[96px] px-3 md:px-4 py-2 rounded-2xl bg-white/[0.07] border border-white/10">
              <div className="text-[12px] font-bold text-white/55">{l}</div>
              <div className="text-[20px] font-black tabular-nums" style={{ fontFamily: MONO }}>{v}</div>
            </div>
          ))}
        </div>
        {!isViewer && (
          <button type="button" onClick={() => setWriter({ initial: null })}
            className="w-full md:w-auto h-11 px-5 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black inline-flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(0,0,0,0.25)]">
            <ShellIcon name="send" size={15} />새 인수인계
          </button>
        )}
      </div>

      <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
        <div className="flex items-center gap-1.5 px-3.5 md:px-5 pt-4 pb-3 border-b border-[#EEF1F6] overflow-x-auto no-scrollbar">
          {[["in", "받은 인수인계", unread], ["out", "보낸 인수인계", 0], ...(admin ? [["all", "회사 전체", 0]] : [])].map(([k, l, n]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`h-9 px-4 rounded-full text-[14px] font-black shrink-0 border inline-flex items-center gap-1.5 ${tab === k ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`}>
              {l}{n > 0 && <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[12px] flex items-center justify-center ${tab === k ? "bg-white text-[#0F1A30]" : "bg-rose-500 text-white"}`}>{n}</span>}
            </button>
          ))}
        </div>
        {list === null ? (
          <div className="py-16 text-center text-[13px] text-[#9AA9C3] font-bold">불러오는 중…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-[#7A879C]">
            <span className="w-14 h-14 rounded-2xl bg-[#F5F8FD] grid place-items-center"><ShellIcon name="link" size={22} /></span>
            <span className="text-[14px] font-bold">{tab === "in" ? "받은 인수인계가 없습니다" : tab === "out" ? "보낸 인수인계가 없습니다" : "인수인계가 없습니다"}</span>
          </div>
        ) : (
          <div className="divide-y divide-[#F1F4F9]">
            {rows.map((h) => {
              const rcv = handoverReceivers(h);
              const readN = rcv.filter((u) => (h.readBy || []).includes(u)).length;
              const allRead = rcv.length > 0 && readN === rcv.length;
              const isNew = rcv.includes(uid) && !(h.readBy || []).includes(uid);
              return (
                <button key={h.id} type="button" onClick={() => openDoc(h)} className={`w-full text-left px-3.5 md:px-5 py-3.5 flex items-center gap-3 hover:bg-[#F8FAFD] ${isNew ? "bg-[#F5F8FD]" : ""}`}>
                  <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}><ShellIcon name="link" size={18} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isNew && <span className="w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center shrink-0">N</span>}
                      <span className="text-[14.5px] font-black text-[#0F1A30] truncate">{dateLabel(h)}</span>
                    </div>
                    <div className="text-[12.5px] text-[#5B6B85] truncate mt-0.5">
                      {h.author || "-"} → {(h.receivers || []).length > 1 ? `${h.receivers[0].name} 외 ${h.receivers.length - 1}명` : h.receiver || "-"}
                      <span className="text-[#9AA9C3]" style={{ fontFamily: MONO }}> · {timeLabel(h)}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 h-7 px-2.5 leading-7 rounded-full text-[12px] font-black ${allRead ? "bg-[#EEF3FB] text-[#1B2B4B]" : "bg-[#0F1A30] text-white"}`}>
                    {rcv.length > 1 ? `${readN}/${rcv.length} 확인` : allRead ? "확인" : "미확인"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {cur && (
        <div className="fixed inset-0 z-[100000] bg-[#0F1A30]/50 flex items-end md:items-center justify-center md:p-4" onClick={() => setOpen(null)}>
          <div className="w-full md:max-w-[620px] max-h-[88vh] bg-white rounded-t-[24px] md:rounded-[22px] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 text-white flex items-center gap-3" style={{ background: HERO_BG }}>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>HANDOVER · {cur.date || ""}</div>
                <div className="text-[17px] font-black truncate">{dateLabel(cur)}</div>
              </div>
              <button type="button" onClick={() => setOpen(null)} className="w-9 h-9 rounded-xl bg-white/10 shrink-0">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2"><div className="text-[11.5px] font-bold text-[#7A879C]">보낸 사람</div><div className="text-[14px] font-black text-[#0F1A30] truncate">{cur.author || "-"}</div></div>
                <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2"><div className="text-[11.5px] font-bold text-[#7A879C]">등록</div><div className="text-[14px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{timeLabel(cur) || "-"}</div></div>
              </div>
              <div>
                <div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">받는 사람</div>
                <div className="flex flex-wrap gap-1.5">
                  {((cur.receivers || []).length ? cur.receivers : [{ uid: cur.receiverUid, name: cur.receiver }]).map((r) => {
                    const ok = (cur.readBy || []).includes(r.uid);
                    return <span key={r.uid || r.name} className={`h-8 px-3 rounded-lg text-[13px] font-bold inline-flex items-center gap-1.5 border ${ok ? "bg-[#EEF3FB] border-[#D5E0F2] text-[#1B2B4B]" : "bg-white border-[#DCE3EE] text-[#5B6B85]"}`}>{r.name}<span className="text-[11.5px]">{ok ? "✓ 확인" : "미확인"}</span></span>;
                  })}
                </div>
              </div>
              <div>
                <div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">내용</div>
                <div className="whitespace-pre-wrap rounded-xl bg-[#F8FAFD] border border-[#EEF1F6] p-3.5 text-[14.5px] leading-[1.85] text-[#0F1A30]">{cur.text}</div>
              </div>
            </div>
            {!isViewer && (cur.authorUid === uid || me?.role === "totalMaster" || me?.role === "superadmin") && (
              <div className="px-5 py-3 border-t border-[#EEF1F6] flex gap-2">
                <button type="button" onClick={() => remove(cur)} className="h-11 px-5 rounded-xl border border-[#DCE3EE] text-[#3A4A66] text-[13.5px] font-bold">삭제</button>
                <button type="button" onClick={() => { setOpen(null); setWriter({ initial: cur }); }} className="flex-1 h-11 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black">수정</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
