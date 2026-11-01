// ======================= src/ObituaryWriter.jsx =======================
// 부고 알림(2026-10-31) — 공지사항 › [부고 알림]. 왼쪽 입력 · 오른쪽 부고장 미리보기(전자결재처럼).
//  올리면 공지사항(분류 "부고")에 부고장 이미지와 함께 게시 → 공지 푸시가 나가고, 선택하면 전 직원 사내메일도.
import React from "react";
import html2canvas from "html2canvas";
import { addDoc, collection, doc, increment, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { compressImage, sendInternalMail, useCompanyStaff } from "./InternalMail";
import CustomDatePicker from "./CustomDatePicker";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
const L = ({ children }) => <div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">{children}</div>;
const RELS = ["부친", "모친", "빙부", "빙모", "시부", "시모", "조부", "조모", "외조부", "외조모", "배우자", "자녀", "형제", "자매", "본인"];
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const krDate = (d, t) => { if (!d) return ""; const x = new Date(`${d}T00:00:00`); return `${x.getFullYear()}년 ${x.getMonth() + 1}월 ${x.getDate()}일 (${"일월화수목금토"[x.getDay()]})${t ? ` ${t}` : ""}`; };

function ObituaryPaper({ f, company }) {
  const who = [f.team, f.empName, f.position].filter(Boolean).join(" ");
  const rel = f.rel === "본인" ? "" : `${f.rel} `;
  const Row = ({ k, v }) => (v ? <div className="grid grid-cols-[96px_1fr] gap-3 py-2.5 border-b border-[#E6E6E6] last:border-b-0"><span className="text-[13.5px] font-bold text-[#6B6B6B] tracking-[0.2em]">{k}</span><span className="text-[15px] font-bold text-[#1A1A1A] whitespace-pre-wrap">{v}</span></div> : null);
  return (
    <div className="bg-white mx-auto" style={{ width: 640, fontFamily: "'Noto Serif KR','Nanum Myeongjo','Batang',serif" }}>
      <div className="bg-[#1A1A1A] text-white text-center py-7">
        <div className="text-[13px] tracking-[0.6em] text-white/60">訃 告</div>
        <div className="text-[34px] font-black tracking-[0.5em] mt-1 pl-[0.5em]">부 고</div>
      </div>
      <div className="px-12 py-9 text-center">
        <div className="text-[16px] leading-[2] text-[#2A2A2A]">
          {who ? <><b className="text-[#111]">{who}</b>님의 {rel}<br /></> : null}
          <b className="text-[22px] text-[#111]">故 {f.deceased || "○○○"}</b>{f.age ? <span className="text-[15px]"> (향년 {f.age}세)</span> : null} 께서<br />
          {f.date ? `${krDate(f.date, f.time)}에 ` : ""}별세하셨기에 삼가 알려 드립니다.
        </div>
        <div className="mx-auto my-7 w-12 h-px bg-[#1A1A1A]" />
        <div className="text-left">
          <Row k="빈 소" v={[f.hall, f.room].filter(Boolean).join(" ")} />
          <Row k="주 소" v={f.address} />
          <Row k="연 락 처" v={f.hallTel} />
          <Row k="발 인" v={f.outDate ? krDate(f.outDate, f.outTime) : ""} />
          <Row k="장 지" v={f.burial} />
          <Row k="상 주" v={f.chief} />
          <Row k="마음 전하실 곳" v={f.account} />
        </div>
        <div className="mt-8 text-[15.5px] text-[#2A2A2A] leading-[1.9] whitespace-pre-wrap">{f.message}</div>
        <div className="mt-8 text-[14px] text-[#6B6B6B] tracking-[0.3em]">{company}</div>
      </div>
    </div>
  );
}

// initial — 이미 올린 부고(공지 문서). 넘기면 그 내용을 불러와 고치고, 같은 공지가 수정된 내용으로 바뀐다(⭐ 2026-11-01)
export default function ObituaryWriter({ company, me = {}, onCancel, onSaved, initial = null }) {
  const staff = useCompanyStaff(company) || [];
  const editing = !!(initial?.id && initial?.obit);
  const [f, setF] = React.useState(() => editing ? { ...initial.obit } : { empUid: "", empName: "", team: "", position: "", rel: "부친", deceased: "", age: "", date: kstDay(), time: "", hall: "", room: "", address: "", hallTel: "", outDate: "", outTime: "", burial: "", chief: "", account: "", message: "삼가 고인의 명복을 빕니다.\n바쁘시더라도 따뜻한 위로 부탁드립니다." });
  const [mail, setMail] = React.useState(true);
  const [busy, setBusy] = React.useState("");
  const paperRef = React.useRef(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const pickEmp = (uid) => { const u = staff.find((x) => x.uid === uid); setF((p) => ({ ...p, empUid: uid, empName: u?.name || "", team: u?.team || "", position: u?.position || "" })); };
  const title = f.empName
    ? `[부고] ${[f.team, f.empName, f.position].filter(Boolean).join(" ")}님 ${f.rel === "본인" ? "" : `${f.rel} `}별세`
    : `[부고] 故 ${f.deceased || "○○○"}님 별세`;
  const text = () => [
    `${[f.team, f.empName, f.position].filter(Boolean).join(" ")}님의 ${f.rel === "본인" ? "" : `${f.rel} `}故 ${f.deceased}${f.age ? `(향년 ${f.age}세)` : ""}께서 ${f.date ? krDate(f.date, f.time) : ""} 별세하셨기에 삼가 알려 드립니다.`,
    "",
    f.hall && `· 빈소: ${[f.hall, f.room].filter(Boolean).join(" ")}`,
    f.address && `· 주소: ${f.address}`,
    f.hallTel && `· 연락처: ${f.hallTel}`,
    f.outDate && `· 발인: ${krDate(f.outDate, f.outTime)}`,
    f.burial && `· 장지: ${f.burial}`,
    f.chief && `· 상주: ${f.chief}`,
    f.account && `· 마음 전하실 곳: ${f.account}`,
    "",
    f.message,
  ].filter((x) => x !== false && x !== undefined && x !== null && x !== "" || x === "").join("\n");
  const post = async () => {
    if (!f.deceased.trim()) return alert("고인 성함을 입력해 주세요.");
    if (!f.hall.trim()) return alert("빈소(장례식장)를 입력해 주세요.");
    if (!window.confirm(editing
      ? `「${title}」 부고를 수정할까요?\n같은 공지사항이 고친 내용으로 바뀌고 "수정됨" 표시가 붙습니다.${mail ? "\n전 직원에게 [정정] 사내메일도 보냅니다." : ""}`
      : `「${title}」 부고를 공지사항에 올릴까요?${mail ? "\n전 직원에게 사내메일도 보냅니다." : ""}`)) return;
    setBusy("부고장 만드는 중…");
    try {
      const canvas = await html2canvas(paperRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const image = await compressImage(canvas.toDataURL("image/jpeg", 0.92), 1400, 0.88);
      setBusy("공지사항에 올리는 중…");
      let noticeKey = "";
      if (editing) {
        await updateDoc(doc(db, "notices", initial.id), {
          title, content: `※ ${new Date().toLocaleDateString("ko-KR")} 내용이 수정되었습니다. 빈소·발인 등을 다시 확인해 주세요.\n\n${text()}`, image, obit: f,
          revisedAt: serverTimestamp(), revisedBy: me.name || "", readBy: [], editVer: increment(1),
        });
        noticeKey = `notice_${initial.id}_v${(initial.editVer || 0) + 1}`;
      } else {
        const r = await addDoc(collection(db, "notices"), { title, category: "부고", content: text(), audience: "internal", image, obit: f, teams: [], pinned: false, author: me.name || "", authorUid: me.uid || "", createdAt: serverTimestamp(), companyName: company });
        noticeKey = `notice_${r.id}`;
      }
      if (mail) {
        setBusy("사내메일 보내는 중…");
        const to = staff.filter((u) => u.uid !== me.uid);
        if (to.length) await sendInternalMail({ company, to, subject: editing ? `[정정] ${title}` : title, body: editing ? `앞서 안내한 부고 내용이 아래와 같이 수정되었습니다.\n\n${text()}` : text(), images: [image], kind: "notice", fromName: me.name || "", noticeKey }).catch(() => {});
      }
      onSaved?.();
    } finally { setBusy(""); }
  };
  return (
    <div className="space-y-4">
      <div className="rounded-[22px] px-6 py-5 text-white flex items-center gap-4 flex-wrap" style={{ background: "linear-gradient(120deg,#111,#2A2A2A 60%,#3A3A3A)" }}>
        <div className="flex-1 min-w-[220px]">
          <div className="text-[11px] font-extrabold tracking-[0.3em] text-white/50" style={{ fontFamily: MONO }}>NOTICE · OBITUARY</div>
          <div className="text-[22px] font-black mt-0.5">{editing ? "부고 수정" : "부고 알림"}</div>
          <div className="text-[13px] text-white/60">왼쪽에 입력하면 오른쪽 부고장에 바로 반영됩니다 · 올리면 공지사항에 게시되고 알림이 갑니다</div>
        </div>
        <button type="button" onClick={onCancel} className="h-11 px-5 rounded-xl bg-white/10 border border-white/20 text-[14px] font-black">취소</button>
        <button type="button" disabled={!!busy} onClick={post} className="h-11 px-6 rounded-xl bg-white text-[#111] text-[14px] font-black disabled:opacity-50">{busy || (editing ? "수정 내용 올리기" : "부고 올리기")}</button>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)] gap-4 items-start">
        <div className="space-y-3">
          <div className="rounded-[20px] bg-white border border-[#E3E8F0] p-5 space-y-3">
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>STEP 1 · 상주 직원</div>
            <select value={f.empUid} onChange={(e) => pickEmp(e.target.value)} className={inp}>
              <option value="">직원 선택(우리 회사 직원의 부고일 때)</option>
              {staff.map((u) => <option key={u.uid} value={u.uid}>{[u.name, u.team, u.position].filter(Boolean).join(" · ")}</option>)}
            </select>
            <div><L>고인과의 관계</L><div className="flex flex-wrap gap-1.5">{RELS.map((r) => <button key={r} type="button" onClick={() => set("rel", r)} className={`h-8 px-3 rounded-full text-[12.5px] font-black border ${f.rel === r ? "bg-[#111] text-white border-[#111]" : "bg-white text-[#5B6B85] border-[#DCE3EE]"}`}>{r}</button>)}</div></div>
          </div>
          <div className="rounded-[20px] bg-white border border-[#E3E8F0] p-5 space-y-3">
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>STEP 2 · 고인 · 빈소</div>
            <div className="grid grid-cols-[1fr_110px] gap-2"><div><L>고인 성함 *</L><input value={f.deceased} onChange={(e) => set("deceased", e.target.value)} className={inp} /></div><div><L>향년</L><input inputMode="numeric" value={f.age} onChange={(e) => set("age", e.target.value.replace(/\D/g, ""))} className={inp} placeholder="세" /></div></div>
            <div className="grid grid-cols-2 gap-2"><div><L>별세일</L><CustomDatePicker value={f.date} onChange={(e) => set("date", e.target.value)} className={inp} showIcon /></div><div><L>시각(선택)</L><input type="time" value={f.time} onChange={(e) => set("time", e.target.value)} className={inp} /></div></div>
            <div className="grid grid-cols-[1fr_120px] gap-2"><div><L>빈소(장례식장) *</L><input value={f.hall} onChange={(e) => set("hall", e.target.value)} className={inp} placeholder="예: ○○대학교병원 장례식장" /></div><div><L>호실</L><input value={f.room} onChange={(e) => set("room", e.target.value)} className={inp} placeholder="특1호실" /></div></div>
            <div><L>주소</L><input value={f.address} onChange={(e) => set("address", e.target.value)} className={inp} /></div>
            <div><L>장례식장 연락처</L><input value={f.hallTel} onChange={(e) => set("hallTel", e.target.value)} className={inp} /></div>
            <div className="grid grid-cols-2 gap-2"><div><L>발인일</L><CustomDatePicker value={f.outDate} onChange={(e) => set("outDate", e.target.value)} className={inp} showIcon /></div><div><L>발인 시각</L><input type="time" value={f.outTime} onChange={(e) => set("outTime", e.target.value)} className={inp} /></div></div>
            <div><L>장지</L><input value={f.burial} onChange={(e) => set("burial", e.target.value)} className={inp} placeholder="예: ○○추모공원" /></div>
            <div><L>상주</L><input value={f.chief} onChange={(e) => set("chief", e.target.value)} className={inp} placeholder="예: 아들 ○○○, 딸 ○○○" /></div>
            <div><L>마음 전하실 곳(선택)</L><input value={f.account} onChange={(e) => set("account", e.target.value)} className={inp} placeholder="예: ○○은행 123-456-789 (예금주 ○○○)" /></div>
            <div><L>전하는 말</L><textarea value={f.message} onChange={(e) => set("message", e.target.value)} rows={3} className={`${inp} h-auto py-2`} /></div>
            <label className="flex items-center gap-2 text-[13px] font-bold text-[#3A4A66]"><input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} className="w-4 h-4" />전 직원에게 사내메일로도 보내기</label>
          </div>
        </div>
        <div className="rounded-[20px] bg-[#EDEDED] border border-[#DCDCDC] p-5 overflow-x-auto xl:sticky xl:top-[76px]">
          <div className="flex items-center justify-between mb-3"><span className="text-[11px] font-extrabold tracking-[0.24em] text-[#6B6B6B]" style={{ fontFamily: MONO }}>LIVE PREVIEW</span><span className="text-[12px] font-bold text-[#7A7A7A] truncate ml-3">{title}</span></div>
          <div ref={paperRef} className="w-fit mx-auto shadow-[0_18px_40px_rgba(0,0,0,0.18)]"><ObituaryPaper f={f} company={company} /></div>
        </div>
      </div>
    </div>
  );
}
