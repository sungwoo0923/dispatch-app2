// ======================= src/HomeWriters.jsx =======================
// ✍ 공지사항·인수인계 글쓰기 화면(2026-10-28) — 작은 팝업 대신 자유게시판처럼 넓은 글쓰기 화면
//  - 공지사항: 작성자는 올리는 사람으로 고정, 관리자(관리자·인사관리자·최고관리자)만 작성
//  - 인수인계: 받는 사람 여러 명 / 부서 단위 선택(주소록), 기준 날짜는 공휴일 달력
//    handovers: receivers[{uid,name}], receiverUids[] 추가 — 예전 화면(모바일)과 맞추려고 receiver(이름들)·receiverUid(첫 사람)도 함께 저장
import React from "react";
import { db } from "./firebase";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { ShellIcon } from "./AdminShell";
import { RecipientPicker, useCompanyStaff, compressImage } from "./InternalMail";
import CustomDatePicker from "./CustomDatePicker";
import { TEAM_OPTIONS } from "./hrConstants";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const inp = "w-full px-4 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] text-[#0F1A30] outline-none focus:border-[#4B6CB7]";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const NOTICE_WRITER_ROLES = ["admin", "totalMaster", "hrManager", "superadmin"];
export const handoverReceivers = (h) => (Array.isArray(h?.receiverUids) && h.receiverUids.length ? h.receiverUids : h?.receiverUid ? [h.receiverUid] : []);

function Hero({ en, title, desc, children }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] px-7 py-5 text-white flex items-center justify-between gap-4 flex-wrap shadow-[0_14px_32px_rgba(15,26,48,0.25)]"
      style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
      <div>
        <div className="text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{en}</div>
        <div className="text-[24px] font-black mt-0.5">{title}</div>
        <div className="text-[13px] text-white/60 mt-0.5">{desc}</div>
      </div>
      {children}
    </div>
  );
}
const Label = ({ children, hint }) => <div className="text-[13px] font-black text-[#0F1A30] mb-2">{children}{hint && <span className="ml-1.5 text-[12px] font-semibold text-[#9AA9C3]">{hint}</span>}</div>;

// ─────────────────────────── 공지사항 ───────────────────────────
export function NoticeWriter({ me, company, initial, onCancel, onSaved }) {
  const [audience, setAudience] = React.useState(initial?.audience || "internal");
  const [category, setCategory] = React.useState(initial?.category || "공지사항");
  const [title, setTitle] = React.useState(initial?.title || "");
  const [content, setContent] = React.useState(initial?.content || "");
  const [image, setImage] = React.useState(initial?.image || "");
  const [teams, setTeams] = React.useState(Array.isArray(initial?.teams) ? initial.teams : []); // 비면 전체 직원
  const [pinned, setPinned] = React.useState(!!initial?.pinned);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef(null);
  const d = new Date();
  const autoTitle = `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일 ${category}`;
  const save = async () => {
    if (!content.trim()) { window.alert("내용을 입력해 주세요."); return; }
    setBusy(true);
    try {
      const data = { title: (title.trim() || autoTitle).slice(0, 200), category, content, audience, image: image || null,
        teams: audience === "internal" ? teams : [], pinned, ...(pinned && !initial?.pinned ? { pinnedAt: Date.now() } : {}) };
      if (initial?.id) await updateDoc(doc(db, "notices", initial.id), { ...data, editedAt: serverTimestamp() });
      else await addDoc(collection(db, "notices"), { ...data, author: me.name, authorUid: me.uid, createdAt: serverTimestamp(), companyName: company });
      onSaved?.();
    } catch (e) { window.alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <Hero en="BOARD · NOTICE · WRITE" title={initial?.id ? "공지사항 수정" : "공지사항 작성"} desc="관리자만 작성할 수 있습니다 · 작성자는 올리는 사람으로 자동 기록됩니다">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="h-11 px-5 rounded-xl bg-white/10 border border-white/20 text-white text-[13.5px] font-bold">취소</button>
          <button type="button" onClick={save} disabled={busy} className="h-11 px-6 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black inline-flex items-center gap-2 disabled:opacity-50"><ShellIcon name="send" size={15} />{busy ? "저장 중…" : initial?.id ? "수정 저장" : "공지 등록"}</button>
        </div>
      </Hero>
      {/* ⭐ 2026-10-29 — 공개 대상·분류를 오른쪽 칸에서 입력 순서의 맨 앞(제목 위)으로 옮겼다.
          분류가 자동 제목에도 쓰이므로 "누구에게 → 어떤 글 → 제목 → 내용" 순서로 위에서 아래로만 입력하면 된다. */}
      <div className="rounded-2xl bg-white border border-[#E3E8F0] p-5 sm:p-6 space-y-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)_auto] md:items-end">
          <div>
            <Label>공개 대상</Label>
            <div role="radiogroup" aria-label="공개 대상" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F1F4F9] border border-[#E3E8F0]">
              {[["internal", "내부용", "운송사 직원만"], ["shipper", "화주사 대상", "화주 화면에도"]].map(([v, l, s2]) => (
                <button key={v} type="button" role="radio" aria-checked={audience === v} onClick={() => setAudience(v)}
                  className={`rounded-lg px-3 py-1.5 text-left transition ${audience === v ? "bg-[#0F1A30] text-white shadow-[0_4px_12px_rgba(15,26,48,0.25)]" : "text-[#3A4A66] hover:bg-white"}`}>
                  <div className="text-[13.5px] font-black leading-tight">{l}</div><div className={`text-[11px] leading-tight ${audience === v ? "text-white/60" : "text-[#9AA9C3]"}`}>{s2}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>분류</Label>
            <div role="radiogroup" aria-label="분류" className="flex flex-wrap gap-1.5">
              {["공지사항", "업데이트", "안내", "긴급", "인사발령"].map((c) => (
                <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)} className={`h-[46px] px-4 rounded-xl text-[13.5px] font-black border ${category === c ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE] hover:border-[#4B6CB7]"}`}>{c}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5 h-[46px] px-3 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0]" title="작성자는 올리는 사람으로 자동 기록됩니다">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[13px] font-black" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}>{String(initial?.author || me.name || "?").slice(0, 1)}</span>
            <div className="leading-tight"><div className="text-[13.5px] font-black text-[#0F1A30]">{initial?.author || me.name}</div><div className="text-[11px] text-[#7A879C]">작성자 · 자동</div></div>
          </div>
        </div>
        {audience === "internal" && (
          <div>
            <Label hint="(팀을 고르면 그 팀에만 보입니다 · 아무것도 안 고르면 전체 직원)">세부 공개 대상</Label>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setTeams([])} className={`h-10 px-4 rounded-xl text-[13px] font-black border ${!teams.length ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`}>전체 직원</button>
              {TEAM_OPTIONS.map((t) => {
                const on = teams.includes(t);
                return <button key={t} type="button" onClick={() => setTeams((p) => (on ? p.filter((x) => x !== t) : [...p, t]))} className={`h-10 px-4 rounded-xl text-[13px] font-black border ${on ? "bg-[#2D4C82] text-white border-[#2D4C82]" : "bg-white text-[#3A4A66] border-[#DCE3EE] hover:border-[#2D4C82]"}`}>{on ? "✓ " : ""}{t}</button>;
              })}
            </div>
          </div>
        )}
        <label className="inline-flex items-center gap-2 text-[13.5px] font-black text-[#0F1A30] cursor-pointer">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="w-4 h-4 accent-[#1B2B4B]" />
          📌 상단 고정 <span className="text-[12px] font-semibold text-[#9AA9C3]">(최대 5개 — 넘으면 오래된 고정은 목록으로 내려갑니다)</span>
        </label>
        <div>
          <Label hint="(비우면 날짜 + 분류로 자동)">제목</Label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={autoTitle} className={`${inp} h-12 text-[16px] font-bold`} />
        </div>
        <div>
          <Label>내용</Label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={16} placeholder="공지할 내용을 입력하세요" className={`${inp} py-3.5 leading-[1.85] resize-y min-h-[360px]`} />
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <Label hint="(1장)">이미지</Label>
            <div className="flex items-center gap-3">
              {image ? (
                <div className="relative w-40 h-28 rounded-xl overflow-hidden border border-[#E3E8F0]">
                  <img src={image} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setImage("")} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[#0F1A30]/80 text-white text-[12px]">✕</button>
                </div>
              ) : <button type="button" onClick={() => fileRef.current?.click()} className="w-40 h-28 rounded-xl border-2 border-dashed border-[#C9D2E0] text-[#7A879C] text-[13px] font-bold hover:border-[#4B6CB7]">+ 이미지 첨부</button>}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setImage(await compressImage(f, 1400, 0.8).catch(() => "")); }} />
            </div>
          </div>
          {/* 입력을 마친 자리에서 바로 등록 — 위 머리줄까지 마우스를 올리지 않아도 된다 */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel} className="h-11 px-5 rounded-xl bg-white border border-[#DCE3EE] text-[#3A4A66] text-[13.5px] font-bold">취소</button>
            <button type="button" onClick={save} disabled={busy} className="h-11 px-6 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black inline-flex items-center gap-2 disabled:opacity-50"><ShellIcon name="send" size={15} />{busy ? "저장 중…" : initial?.id ? "수정 저장" : "공지 등록"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── 인수인계 ───────────────────────────
export function HandoverWriter({ me, company, initial, onCancel, onSaved }) {
  const staff = useCompanyStaff(company);
  const [to, setTo] = React.useState(() => new Set(handoverReceivers(initial)));
  const [date, setDate] = React.useState(initial?.date || today());
  const [text, setText] = React.useState(initial?.text || "");
  const [busy, setBusy] = React.useState(false);
  const picked = (staff || []).filter((u) => to.has(u.uid));
  const save = async () => {
    if (!picked.length) { window.alert("받는 사람을 골라 주세요."); return; }
    if (!text.trim()) { window.alert("인수인계 내용을 입력해 주세요."); return; }
    setBusy(true);
    try {
      const receivers = picked.map((u) => ({ uid: u.uid, name: u.name || u.email || "" }));
      const data = {
        text, date, receivers, receiverUids: receivers.map((r) => r.uid),
        receiver: receivers.map((r) => r.name).join(", "), receiverUid: receivers[0].uid,
        author: initial?.author || me.name, authorUid: initial?.authorUid || me.uid,
      };
      if (initial?.id) await updateDoc(doc(db, "handovers", initial.id), data);
      else await addDoc(collection(db, "handovers"), { ...data, createdAt: serverTimestamp(), readBy: [], companyName: company });
      onSaved?.();
    } catch (e) { window.alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <Hero en="COMMS · HANDOVER · WRITE" title={initial?.id ? "인수인계 수정" : "인수인계 작성"} desc="여러 명 또는 부서 단위로 넘길 수 있습니다 · 받는 사람마다 확인 여부가 표시됩니다">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="h-11 px-5 rounded-xl bg-white/10 border border-white/20 text-white text-[13.5px] font-bold">취소</button>
          <button type="button" onClick={save} disabled={busy} className="h-11 px-6 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black inline-flex items-center gap-2 disabled:opacity-50"><ShellIcon name="send" size={15} />{busy ? "저장 중…" : initial?.id ? "수정 저장" : `인수인계 등록${picked.length ? ` (${picked.length}명)` : ""}`}</button>
        </div>
      </Hero>
      <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 400px" }}>
        <div className="rounded-2xl bg-white border border-[#E3E8F0] p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>보내는 사람</Label>
              <div className="h-12 px-4 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] flex items-center gap-2 text-[14.5px]"><b className="text-[#0F1A30]">{initial?.author || me.name}</b><span className="text-[12.5px] text-[#7A879C]">{me.position || ""} · 자동 기록</span></div>
            </div>
            <div>
              <Label>기준 날짜</Label>
              <CustomDatePicker value={date} onChange={(e) => setDate(e.target.value || today())} className={`${inp} h-12 font-bold`} showIcon />
            </div>
          </div>
          <div>
            <Label hint={picked.length ? `${picked.length}명` : ""}>받는 사람</Label>
            <div className="min-h-[48px] px-3 py-2 rounded-xl border border-[#DCE3EE] flex flex-wrap gap-1.5 items-center">
              {picked.length ? picked.map((u) => (
                <span key={u.uid} className="h-8 pl-3 pr-1 rounded-lg bg-[#EEF3FB] border border-[#D5E0F2] text-[13px] font-bold text-[#1B2B4B] inline-flex items-center gap-1">
                  {u.name}<span className="text-[#7A879C] font-semibold">{u.team || ""}</span>
                  <button type="button" onClick={() => setTo((p) => { const n = new Set(p); n.delete(u.uid); return n; })} className="w-6 h-6 text-[#7A879C]">✕</button>
                </span>
              )) : <span className="text-[13.5px] text-[#9AA9C3]">오른쪽 주소록에서 사람이나 부서를 고르세요</span>}
            </div>
          </div>
          <div>
            <Label>인수인계 내용</Label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={16} placeholder={"예)\n· 내일 오전 평택항 상차 3건 — 기사 배정 완료, 도착 확인만 필요\n· ○○물류 운임 정산 요청 회신 대기 중\n· 미배차 2건(오후 상차) 콜 계속 진행 부탁드립니다"} className={`${inp} py-3.5 leading-[1.85] resize-y min-h-[360px]`} />
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-[#E3E8F0] p-5 h-fit">
          <Label hint="부서 이름을 누르면 부서 전체 선택">주소록</Label>
          <RecipientPicker staff={staff} selected={to} setSelected={setTo} excludeUid={me.uid} />
        </div>
      </div>
    </div>
  );
}
