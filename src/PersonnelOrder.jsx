// ======================= src/PersonnelOrder.jsx =======================
// 📢 인사발령(2026-10-27) — 인사관리부 › 인사발령 탭(인사관리자·최고관리자만)
//  1) 대상자의 새 직책·부서·권한을 고르면 발령 공문이 미리보기로 바로 만들어진다(공문 글자는 미리보기에서 직접 고칠 수 있음).
//  2) [발령 공문 발송] → ① 회원 정보(직책·부서·권한)+인사발령 이력 반영 ② 공문을 이미지로 만들어
//     ③ 사내게시판 공지사항(카테고리 "인사발령", 제목 자동 "YYYY년 M월 D일 인사발령") ④ 전 직원 사내메일(이미지 포함)
//     → 메일 트리거가 휴대폰 푸시, 접속 중인 사람은 화면 오른쪽 아래 배너.
import React from "react";
import html2canvas from "html2canvas";
import { db, auth } from "./firebase";
import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { POSITION_OPTIONS, TEAM_OPTIONS } from "./hrConstants";
import { sendInternalMail, useCompanyStaff, compressImage } from "./InternalMail";

export const HR_ROLE_OPTIONS = [
  ["user", "실무자"], ["admin", "관리자"], ["hrManager", "인사관리자"], ["test", "경리/회계"], ["viewer", "조회전용"],
];
const roleName = (r) => (HR_ROLE_OPTIONS.find(([k]) => k === r) || [r, r || "-"])[1];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const korDate = (s) => { const [y, m, d] = String(s || "").split("-").map(Number); return y ? `${y}년 ${m}월 ${d}일` : ""; };
const RANK = ["인턴", "사원", "주임", "대리", "과장", "차장", "부장", "팀장", "파트장", "이사", "대표이사"];

function autoType(cur, next) {
  const t = [];
  if (next.position !== cur.position) {
    const a = RANK.indexOf(cur.position); const b = RANK.indexOf(next.position);
    t.push(a >= 0 && b >= 0 && b < a ? "직책변경" : (a >= 0 && b > a) || (a < 0 && b >= 0) ? "승진" : "직책변경");
  }
  if (next.team !== cur.team) t.push("전보");
  if (next.role !== cur.role) t.push("권한변경");
  return t.join("·") || "발령";
}

// 미리보기 안에서 바로 고치는 글자칸(눌러서 바로 수정) — input 대신 contentEditable을 써서
// 전역 입력칸 글자크기 규칙에 안 휩쓸리고, 이미지로 만들 때도 보이는 그대로 찍힌다
function Ed({ value, onChange, capture, className = "", placeholder }) {
  return (
    <div key={value} contentEditable={!capture} suppressContentEditableWarning spellCheck={false}
      data-ph={capture ? "" : placeholder || ""}
      onBlur={(e) => { const t = e.currentTarget.innerText.replace(/\n$/, ""); if (t !== value) onChange(t); }}
      className={`whitespace-pre-wrap break-words min-h-[1.3em] outline-none rounded-md ${capture ? "" : "cursor-text hover:bg-[#F2F6FC] focus:bg-[#EEF3FB] focus:ring-2 focus:ring-[#4B6CB7]/30"} empty:before:content-[attr(data-ph)] empty:before:text-[#B4BFD0] ${className}`}>
      {value}
    </div>
  );
}

export default function PersonnelOrder({ company, target, myName, isSelf }) {
  const staff = useCompanyStaff(company);
  const cur = { position: target?.position || "", team: target?.team && target.team !== "미배정" ? target.team : "", role: target?.role || "user" };
  const [next, setNext] = React.useState(cur);
  const [date, setDate] = React.useState(today());
  const [doc_, setDoc_] = React.useState({});
  const [capture, setCapture] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [done, setDone] = React.useState(null);
  const paperRef = React.useRef(null);

  // 대상자가 바뀌면 처음부터
  React.useEffect(() => {
    setNext({ position: target?.position || "", team: target?.team && target.team !== "미배정" ? target.team : "", role: target?.role || "user" });
    setDoc_({}); setDone(null); setDate(today());
  }, [target?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = next.position !== cur.position || next.team !== cur.team || next.role !== cur.role;
  const type = autoType(cur, next);
  const no = `제 ${date.slice(0, 4)}-${date.slice(5, 7)}${date.slice(8, 10)} 호`;
  // 공문 내용 — 직접 고친 값이 있으면 그 값, 없으면 자동 문구
  const auto = {
    no,
    title: "인 사 발 령",
    lead: `${company} 인사규정에 의거하여 아래와 같이 인사발령합니다.`,
    type,
    name: target?.name || "",
    fromTeam: cur.team || "미배정", fromPos: cur.position || "-", fromRole: roleName(cur.role),
    toTeam: next.team || "미배정", toPos: next.position || "-", toRole: roleName(next.role),
    effective: korDate(date),
    note: "",
    sign: `${company} 대표이사`,
  };
  const v = (k) => (doc_[k] !== undefined ? doc_[k] : auto[k]);
  const setV = (k) => (val) => setDoc_((p) => ({ ...p, [k]: val }));

  const send = async () => {
    if (!target) return;
    if (!changed && !window.confirm("바뀐 직책·부서·권한이 없습니다. 공문만 발송할까요?")) return;
    if (changed && !window.confirm(`${target.name}님을 ${v("toTeam")} ${v("toPos")}(${v("toRole")})(으)로 발령하고 전 직원에게 공문을 발송할까요?`)) return;
    // 회원 정보가 바뀌면 "현 소속" 자동 문구도 바뀌므로, 지금 보이는 공문 내용을 그대로 고정해 둔다
    const frozen = Object.fromEntries(Object.keys(auto).map((k) => [k, v(k)]));
    setDoc_(frozen);
    const fv = (k) => frozen[k];
    setBusy("회원 정보 반영 중…");
    try {
      const detail = [
        next.team !== cur.team ? `${cur.team || "미배정"} → ${next.team || "미배정"}` : "",
        next.position !== cur.position ? `${cur.position || "-"} → ${next.position || "-"}` : "",
        next.role !== cur.role ? `권한 ${roleName(cur.role)} → ${roleName(next.role)}` : "",
      ].filter(Boolean).join(" / ") || fv("type");
      const patch = {
        position: next.position, team: next.team,
        personnelHistory: [...(target.personnelHistory || []), { date, type: fv("type"), detail }],
      };
      if (next.role !== cur.role && !isSelf) patch.role = next.role;
      await setDoc(doc(db, "users", target.uid), patch, { merge: true });

      setBusy("공문 이미지 만드는 중…");
      setCapture(true);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = await html2canvas(paperRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      setCapture(false);
      const image = await compressImage(canvas.toDataURL("image/jpeg", 0.9), 1400, 0.85);

      const title = `${korDate(date)} 인사발령`;
      const text = `${fv("lead")}\n\n· 발령구분: ${fv("type")}\n· 대상: ${fv("name")}\n· 발령: ${fv("fromTeam")} ${fv("fromPos")} → ${fv("toTeam")} ${fv("toPos")} (${fv("toRole")})\n· 시행일: ${fv("effective")}${fv("note") ? `\n· 비고: ${fv("note")}` : ""}`;

      setBusy("사내게시판 공지 올리는 중…");
      await addDoc(collection(db, "notices"), {
        title, category: "인사발령", author: myName || "", content: text, audience: "internal",
        authorUid: auth.currentUser?.uid || "", createdAt: serverTimestamp(), companyName: company, image,
      });

      setBusy("전 직원 사내메일 보내는 중…");
      const to = (staff || []).filter((u) => u.uid !== auth.currentUser?.uid);
      if (to.length) await sendInternalMail({ company, to, subject: `[인사발령] ${title} · ${fv("name")} ${fv("type")}`, body: text, images: [image], kind: "hr", fromName: myName });
      setDone({ to: to.length, title });
    } catch (e) {
      setCapture(false);
      alert(`발송 실패: ${e.message || e}`);
    } finally { setBusy(""); }
  };

  if (!target) return <div className="py-16 text-center text-[14px] text-[#9AA9C3]">왼쪽에서 발령할 직원을 골라 주세요</div>;
  const sel = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#0F1A30] outline-none focus:border-[#4B6CB7]";

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(260px, 320px) 1fr" }}>
      {/* 왼쪽 — 바꿀 값 */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#E3E8F0] bg-white p-5 space-y-4">
          <div>
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">APPOINTMENT</div>
            <div className="text-[17px] font-black text-[#0F1A30]">{target.name} <span className="text-[13px] font-bold text-[#7A879C]">현재 {cur.team || "미배정"} · {cur.position || "-"} · {roleName(cur.role)}</span></div>
          </div>
          <label className="block"><span className="text-[12.5px] font-bold text-[#7A879C]">시행일</span>
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDoc_((p) => { const n = { ...p }; delete n.effective; delete n.no; return n; }); }} className={sel} />
          </label>
          <label className="block"><span className="text-[12.5px] font-bold text-[#7A879C]">발령 부서</span>
            <select value={next.team} onChange={(e) => setNext((p) => ({ ...p, team: e.target.value }))} className={sel}>
              <option value="">미배정</option>
              {[...new Set([...TEAM_OPTIONS, cur.team].filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-[12.5px] font-bold text-[#7A879C]">발령 직책</span>
            <select value={next.position} onChange={(e) => setNext((p) => ({ ...p, position: e.target.value }))} className={sel}>
              <option value="">미설정</option>
              {[...new Set([...POSITION_OPTIONS, cur.position].filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-[12.5px] font-bold text-[#7A879C]">권한</span>
            <select value={next.role} disabled={isSelf} onChange={(e) => setNext((p) => ({ ...p, role: e.target.value }))} className={`${sel} disabled:bg-[#F5F7FA] disabled:text-[#9AA9C3]`}>
              {[...HR_ROLE_OPTIONS, ...(HR_ROLE_OPTIONS.some(([k]) => k === cur.role) ? [] : [[cur.role, roleName(cur.role)]])].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {isSelf && <span className="text-[11.5px] text-[#9AA9C3]">본인 권한은 최고관리자만 바꿀 수 있습니다</span>}
          </label>
          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0]">
            <span className="text-[12.5px] font-bold text-[#7A879C]">발령구분(자동)</span>
            <span className="text-[14px] font-black text-[#0F1A30]">{type}</span>
          </div>
        </div>
        {done ? (
          <div className="rounded-2xl bg-[#0F1A30] text-white p-5">
            <div className="text-[16px] font-black">발송 완료</div>
            <div className="text-[13px] text-white/75 mt-1 leading-relaxed">· 공지사항 「{done.title}」 등록<br />· 전 직원 {done.to}명 사내메일(공문 이미지 포함)<br />· 접속 중인 직원 화면 배너 · 휴대폰 푸시</div>
          </div>
        ) : (
          <button onClick={send} disabled={!!busy}
            className="w-full h-14 rounded-2xl text-white text-[15.5px] font-black shadow-[0_12px_26px_rgba(15,26,48,0.28)] disabled:opacity-60"
            style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>
            {busy || "발령 공문 발송"}
          </button>
        )}
        <div className="text-[12px] text-[#9AA9C3] leading-relaxed px-1">공문 글자는 오른쪽 미리보기에서 눌러서 바로 고칠 수 있습니다. 발송하면 회원 정보가 바뀌고, 공지사항·전 직원 사내메일·푸시가 함께 나갑니다.</div>
      </div>

      {/* 오른쪽 — 공문 미리보기(A4 비율) */}
      <div className="rounded-2xl bg-[#E9EDF3] p-5 overflow-auto">
        <div ref={paperRef} className="mx-auto bg-white w-full max-w-[720px] px-12 py-12 shadow-[0_10px_30px_rgba(15,26,48,0.12)]" style={{ aspectRatio: capture ? undefined : "1 / 1.414", fontFamily: "'Pretendard','Noto Sans KR',sans-serif" }}>
          <div className="flex items-start justify-between text-[12.5px] text-[#5A6A85]">
            <div className="w-[220px]"><Ed capture={capture} value={v("no")} onChange={setV("no")} className="font-bold" /></div>
            <div className="font-extrabold tracking-[0.3em] text-[#4B6CB7]">PERSONNEL ORDER</div>
          </div>
          <div className="text-center mt-8 mb-8">
            <Ed capture={capture} value={v("title")} onChange={setV("title")} className="text-center text-[34px] font-black tracking-[0.3em] text-[#0F1A30]" />
            <div className="mx-auto mt-3 w-24 h-[3px] bg-[#0F1A30]" />
          </div>
          <div className="text-[15px] text-[#1F2A44] leading-relaxed mb-6">
            <Ed capture={capture} value={v("lead")} onChange={setV("lead")} />
          </div>
          <div className="text-center text-[15px] font-black text-[#0F1A30] mb-3">- 아 래 -</div>
          {/* 표(전역 table 스타일을 안 타도록 div로 그린다) */}
          <div className="border-t-2 border-l border-[#0F1A30] mb-6 text-[14.5px] text-[#0F1A30]">
            {[
              ["발령구분", [["type", "font-black"]]],
              ["성명", [["name", "font-black text-[16px]"]]],
              ["", [["#부서"], ["#직책"], ["#권한"]]],
              ["현 소속", [["fromTeam", "text-center"], ["fromPos", "text-center"], ["fromRole", "text-center"]]],
              ["발령", [["toTeam", "text-center font-black"], ["toPos", "text-center font-black"], ["toRole", "text-center font-black"]]],
              ["시행일", [["effective", ""]]],
              ["비고", [["note", "min-h-[2.6em]", "(필요하면 입력)"]]],
            ].map(([label, cols], ri) => (
              <div key={ri} className="flex border-b border-[#0F1A30]/70">
                <div className="w-[18%] shrink-0 flex items-center justify-center bg-[#EEF1F6] border-r border-[#0F1A30]/70 px-2 py-2.5 font-black">{label}</div>
                {cols.map(([k, cls, ph], ci) => (
                  <div key={ci} className={`flex-1 min-w-0 border-r border-[#0F1A30]/70 px-3 py-2.5 flex items-center ${k.startsWith("#") ? "bg-[#EEF1F6] justify-center font-black" : ""}`}>
                    {k.startsWith("#") ? k.slice(1) : <Ed capture={capture} value={v(k)} onChange={setV(k)} placeholder={ph} className={`w-full ${cls || ""}`} />}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="text-center mt-14">
            <div className="text-[15px] text-[#3A4A66]">{korDate(date)}</div>
            <div className="mt-4 inline-block min-w-[260px]"><Ed capture={capture} value={v("sign")} onChange={setV("sign")} className="text-center text-[22px] font-black tracking-[0.12em] text-[#0F1A30]" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
