// ======================= src/PersonnelOrder.jsx =======================
// 📢 인사발령(2026-10-27) — 인사관리부 › 인사발령 탭(인사관리자·최고관리자만)
//  1) 대상자의 새 직책·부서·권한을 고르면 발령 공문이 미리보기로 바로 만들어진다(공문 글자는 미리보기에서 직접 고칠 수 있음).
//  2) [발령 공문 발송] → ① 회원 정보(직책·부서·권한)+인사발령 이력 반영 ② 공문을 이미지로 만들어
//     ③ 사내게시판 공지사항(카테고리 "인사발령", 제목 자동 "YYYY년 M월 D일 인사발령") ④ 전 직원 사내메일(이미지 포함)
//     → 메일 트리거가 휴대폰 푸시, 접속 중인 사람은 화면 오른쪽 아래 배너.
import React from "react";
import { createPortal } from "react-dom";
import { kpConfirm } from "./kpDialog";
import html2canvas from "html2canvas";
import { db, auth } from "./firebase";
import { addDoc, collection, doc, increment, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { suggestRole, isExecProfile, useHrOptions } from "./hrConstants";
import { useRoleOptions } from "./customRoles";
import { sendInternalMail, useCompanyStaff, compressImage } from "./InternalMail";

export const HR_ROLE_OPTIONS = [
  ["user", "실무자"], ["admin", "관리자"], ["hrManager", "인사관리자"], ["hrAcct", "통합인사관리자"], ["test", "경리/회계"], ["viewer", "조회전용"],
];
const roleName = (r) => (HR_ROLE_OPTIONS.find(([k]) => k === r) || [r, r || "-"])[1];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const korDate = (s) => { const [y, m, d] = String(s || "").split("-").map(Number); return y ? `${y}년 ${m}월 ${d}일` : ""; };
export const JUNIOR_RANKS = ["인턴", "사원", "주임", "대리"];
const RANK = ["인턴", "사원", "주임", "대리", "과장", "차장", "부장", "팀장", "파트장", "이사", "전무", "대표", "대표이사"];

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

// reviseNotice — 정정할 발령 공지(인사발령 이력 › 정정 발령에서 팝업으로 열 때). onDone — 정정 발송 후 닫기
export default function PersonnelOrder({ company, target, myName, isSelf, reviseNotice = null, onDone = null }) {
  const ro = useRoleOptions();
  const roleName = ro.label;
  // ⭐ 2026-11-01 대리까지(인턴·사원·주임·대리)는 일반 사무원 — 직책을 고르면 권한이 자동으로 일반 사무원(실무자)으로 바뀐다
  //   (회사에서 "일반사무원" 이름의 권한을 만들어 두었으면 그 권한). 권한 칸에서 다시 고르면 고른 대로 발령된다
  const staffRole = (ro.options.find(([, l]) => /사무원/.test(String(l || ""))) || ["user"])[0];
  const suggestR = (x) => (isExecProfile(x) && ro.execKeys[0] ? ro.execKeys[0] : JUNIOR_RANKS.includes(String(x?.position || "").trim()) ? staffRole : suggestRole(x));
  const hrOpt = useHrOptions(company);
  const positionsForTeam = hrOpt.positionsFor; const TEAM_OPTIONS = hrOpt.teams;
  const staff = useCompanyStaff(company);
  const curLive = { position: target?.position || "", team: target?.team && target.team !== "미배정" ? target.team : "", role: target?.role || "user" };
  // ✏ 2026-11-01 정정 발령 — 잘못 올린 공문을 고칠 때는 "발령 전" 값을 기준으로 다시 만든다(같은 공지를 고쳐 올림)
  const [revising, setRevising] = React.useState(null);
  const cur = revising?.hrOrder?.from || curLive;
  const [next, setNext] = React.useState(curLive);
  const [date, setDate] = React.useState(today());
  const [doc_, setDoc_] = React.useState({});
  const [capture, setCapture] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [done, setDone] = React.useState(null);
  const paperRef = React.useRef(null);

  // 대상자가 바뀌면 처음부터
  React.useEffect(() => {
    setNext({ position: target?.position || "", team: target?.team && target.team !== "미배정" ? target.team : "", role: target?.role || "user" });
    setDoc_({}); setDone(null); setDate(today()); setRevising(null);
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
    if (!changed && !await kpConfirm("바뀐 직책·부서·권한이 없습니다. 공문만 발송할까요?")) return;
    if (revising && !await kpConfirm(`「${revising.title}」 공문을 정정할까요?\n\n· 같은 공지사항이 정정된 내용으로 바뀌고 제목 앞에 [정정]이 붙습니다\n· ${target.name}님 정보가 ${v("toTeam")} ${v("toPos")}(${v("toRole")})(으)로 다시 반영됩니다\n· 전 직원에게 정정 안내 메일·푸시가 나갑니다`)) return;
    if (!revising && changed && !await kpConfirm(`${target.name}님을 ${v("toTeam")} ${v("toPos")}(${v("toRole")})(으)로 발령하고 전 직원에게 공문을 발송할까요?`)) return;
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
        personnelHistory: [...(target.personnelHistory || []), { date, type: revising ? `발령 정정(${fv("type")})` : fv("type"), detail: `${detail}${target.pendingOrder?.docNo ? ` · 결재 ${target.pendingOrder.docNo}` : ""}` }],
        ...(target.pendingOrder ? { pendingOrder: null } : {}), // 결재 완료 발령을 공문으로 게시했으면 비운다
      };
      // 🎉 발령 받은 사람이 다음 접속 때 한 번 보는 축하·안내 창(OrderCongratsPopup)
      if (changed) patch.orderNotice = {
        kind: fv("type"), company, date: fv("effective"), docNo: target.pendingOrder?.docNo || "", at: Date.now(), seen: false,
        fromTeam: fv("fromTeam"), toTeam: fv("toTeam"), fromPos: fv("fromPos"), toPos: fv("toPos"), fromRole: fv("fromRole"), toRole: fv("toRole"),
      };
      const roleNext = next.role; // ⭐ 2026-10-31 임원도 권한 관리의 역할을 그대로(임원 화면 역할 추천)
      if (roleNext !== curLive.role && !isSelf) patch.role = roleNext;
      await setDoc(doc(db, "users", target.uid), patch, { merge: true });

      setBusy("공문 이미지 만드는 중…");
      setCapture(true);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = await html2canvas(paperRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      setCapture(false);
      const image = await compressImage(canvas.toDataURL("image/jpeg", 0.92), 1800, 0.88); // 공지에 크게 올라가도 선명하게

      const baseTitle = `${korDate(date)} 인사발령`;
      const title = revising ? `[정정] ${baseTitle}` : baseTitle;
      const text = `${fv("lead")}\n\n· 발령구분: ${fv("type")}\n· 대상: ${fv("name")}\n· 발령: ${fv("fromTeam")} ${fv("fromPos")} → ${fv("toTeam")} ${fv("toPos")} (${fv("toRole")})\n· 시행일: ${fv("effective")}${fv("note") ? `\n· 비고: ${fv("note")}` : ""}`;

      const hrOrder = { uid: target.uid, name: fv("name"), from: { ...cur }, to: { ...next }, date, type: fv("type"), status: revising ? "revised" : "active", revision: (revising?.hrOrder?.revision || 0) + (revising ? 1 : 0) };
      let noticeKey = "";
      setBusy(revising ? "공지사항 정정 중…" : "사내게시판 공지 올리는 중…");
      if (revising) {
        // 같은 공지를 고친다 — 목록 순서(작성일)는 그대로, 정정 시각·정정 전 제목을 남긴다
        await updateDoc(doc(db, "notices", revising.id), {
          title, content: `※ ${new Date().toLocaleDateString("ko-KR")} 정정된 공문입니다. 이전 공문은 무효입니다.\n\n${text}`, image, hrOrder,
          revisedAt: serverTimestamp(), revisedBy: myName || "", prevTitle: revising.title || "", readBy: [], editVer: increment(1),
        });
        noticeKey = `notice_${revising.id}_v${(revising.editVer || 0) + 1}`;
      } else {
        const nref = await addDoc(collection(db, "notices"), {
          title, category: "인사발령", author: myName || "", content: text, audience: "internal",
          authorUid: auth.currentUser?.uid || "", createdAt: serverTimestamp(), companyName: company, image, hrOrder,
        });
        noticeKey = `notice_${nref.id}`;
      }

      setBusy("전 직원 사내메일 보내는 중…");
      const to = (staff || []).filter((u) => u.uid !== auth.currentUser?.uid);
      if (to.length) await sendInternalMail({ company, to, subject: revising ? `[인사발령 정정] ${baseTitle} · ${fv("name")} — 이전 공문은 무효입니다` : `[인사발령] ${title} · ${fv("name")} ${fv("type")}`, body: revising ? `앞서 안내한 인사발령 공문을 아래와 같이 정정합니다. 이전 공문은 무효입니다.\n\n${text}` : text, images: [image], kind: "hr", fromName: myName, noticeKey });
      setDone({ to: to.length, title, revised: !!revising });
      setRevising(null);
      if (reviseNotice) setTimeout(() => onDone?.(), 900);
    } catch (e) {
      setCapture(false);
      alert(`발송 실패: ${e.message || e}`);
    } finally { setBusy(""); }
  };

  // ✏ 정정 — 그 공문의 발령 내용을 불러와 고친 뒤 [정정 공문 발송]
  const startRevise = (n) => {
    const o = n.hrOrder || {};
    setRevising(n); setDone(null);
    setNext({ position: o.to?.position || "", team: o.to?.team || "", role: o.to?.role || curLive.role });
    if (o.date) setDate(o.date);
    setDoc_({});
  };
  // 인사발령 이력 › [정정 발령]에서 열었으면 바로 정정 상태로
  React.useEffect(() => { if (reviseNotice?.id) startRevise(reviseNotice); }, [reviseNotice?.id, target?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!target) return <div className="py-16 text-center text-[14px] text-[#9AA9C3]">왼쪽에서 발령할 직원을 골라 주세요</div>;
  const sel = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#0F1A30] outline-none focus:border-[#4B6CB7]";

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(260px, 320px) 1fr" }}>
      {/* 왼쪽 — 바꿀 값 */}
      <div className="space-y-4">
        {/* 🗂 2026-11-01 전자결재 인사발령 품의가 최종 승인된 발령 — 불러와서 공문 게시 */}
        {target.pendingOrder && (
          <div className="rounded-2xl p-4 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#D7BC82]">APPROVED · 결재 완료 발령</div>
            <div className="text-[15px] font-black mt-0.5">{target.pendingOrder.kind} → {[target.pendingOrder.toTeam, target.pendingOrder.toPosition].filter(Boolean).join(" ")}</div>
            <div className="text-[12.5px] text-white/60">발령일 {target.pendingOrder.date || "-"} · 결재 {target.pendingOrder.docNo || ""}</div>
            <button type="button" onClick={() => {
              const po = target.pendingOrder;
              const team = TEAM_OPTIONS.includes(po.toTeam) ? po.toTeam : (po.toTeam || next.team);
              setNext((p) => ({ ...p, team, position: po.toPosition || p.position, role: isSelf || p.role === "totalMaster" ? p.role : suggestR({ team, position: po.toPosition || p.position }) }));
              if (po.date) setDate(po.date);
              setDoc_((p) => ({ ...p, note: [po.reason, po.note].filter(Boolean).join(" / ") }));
            }} className="mt-2.5 w-full h-10 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black">결재 내용 불러오기</button>
          </div>
        )}
        <div className="rounded-2xl border border-[#E3E8F0] bg-white p-5 space-y-4">
          <div>
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">APPOINTMENT</div>
            <div className="text-[17px] font-black text-[#0F1A30]">{target.name} <span className="text-[13px] font-bold text-[#7A879C]">현재 {cur.team || "미배정"} · {cur.position || "-"} · {roleName(cur.role)}</span></div>
          </div>
          <label className="block"><span className="text-[12.5px] font-bold text-[#7A879C]">시행일</span>
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDoc_((p) => { const n = { ...p }; delete n.effective; delete n.no; return n; }); }} className={sel} />
          </label>
          <label className="block"><span className="text-[12.5px] font-bold text-[#7A879C]">발령 부서</span>
            <select value={next.team} onChange={(e) => { const team = e.target.value; setNext((p) => { const position = positionsForTeam(team).includes(p.position) ? p.position : ""; return { ...p, team, position, role: isSelf || p.role === "totalMaster" ? p.role : suggestR({ team, position }) }; }); }} className={sel}>
              <option value="">미배정</option>
              {[...new Set([...TEAM_OPTIONS, cur.team].filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-[12.5px] font-bold text-[#7A879C]">발령 직책</span>
            <select value={next.position} onChange={(e) => { const position = e.target.value; setNext((p) => ({ ...p, position, role: isSelf || p.role === "totalMaster" ? p.role : suggestR({ team: p.team, position }) })); }} className={sel}>
              <option value="">미설정</option>
              {[...new Set([...positionsForTeam(next.team), next.position].filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-[12.5px] font-bold text-[#7A879C]">권한</span>
            <select value={next.role} disabled={isSelf || next.role === "totalMaster"} onChange={(e) => setNext((p) => ({ ...p, role: e.target.value }))} className={`${sel} disabled:bg-[#F5F7FA] disabled:text-[#9AA9C3]`}>
              {[...ro.options, ...(ro.options.some(([k]) => k === cur.role) ? [] : [[cur.role, roleName(cur.role)]])].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {isSelf && <span className="text-[11.5px] text-[#9AA9C3]">본인 권한은 최고관리자만 바꿀 수 있습니다</span>}
          </label>
          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0]">
            <span className="text-[12.5px] font-bold text-[#7A879C]">발령구분(자동)</span>
            <span className="text-[14px] font-black text-[#0F1A30]">{type}</span>
          </div>
        </div>
        {revising && (
          <div className="rounded-2xl border-2 border-[#B54708]/40 bg-[#FFF8EE] p-4">
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#B54708]">REVISION · 정정 중</div>
            <div className="text-[14.5px] font-black text-[#0F1A30] mt-0.5 truncate">「{revising.title}」</div>
            <div className="text-[12px] text-[#7A5A2E] mt-1 leading-relaxed">발령 전 소속({cur.team || "미배정"} {cur.position || "-"}) 기준으로 다시 고릅니다. 발송하면 같은 공지가 [정정]으로 바뀝니다.</div>
            <button type="button" onClick={() => { if (reviseNotice) { onDone?.(); return; } setRevising(null); setNext(curLive); setDoc_({}); setDate(today()); }} className="mt-2 h-9 px-3 rounded-lg border border-[#E7C9A0] bg-white text-[12.5px] font-black text-[#7A5A2E]">정정 그만두기</button>
          </div>
        )}
        {done ? (
          <div className="rounded-2xl bg-[#0F1A30] text-white p-5">
            <div className="text-[16px] font-black">{done.revised ? "정정 발송 완료" : "발송 완료"}</div>
            <div className="text-[13px] text-white/75 mt-1 leading-relaxed">· 공지사항 「{done.title}」 등록<br />· 전 직원 {done.to}명 사내메일(공문 이미지 포함)<br />· 접속 중인 직원 화면 배너 · 휴대폰 푸시</div>
          </div>
        ) : (
          <button onClick={send} disabled={!!busy}
            className="w-full h-14 rounded-2xl text-white text-[15.5px] font-black shadow-[0_12px_26px_rgba(15,26,48,0.28)] disabled:opacity-60"
            style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>
            {busy || (revising ? "정정 공문 발송" : "발령 공문 발송")}
          </button>
        )}
        <div className="text-[12px] text-[#9AA9C3] leading-relaxed px-1">공문 글자는 오른쪽 미리보기에서 눌러서 바로 고칠 수 있습니다. 발송하면 회원 정보가 바뀌고, 공지사항·전 직원 사내메일·푸시가 함께 나갑니다.{!reviseNotice && <><br />잘못 올린 공문의 정정·취소는 <b className="text-[#5B6B85]">인사발령 이력</b>에서 합니다.</>}</div>
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


// ═════════ 인사발령 이력 › 발령 공문(정정·취소) — 2026-11-02 인사발령 화면에서 옮겨 왔다 ═════════
const ST = {
  active: { label: "게시", cls: "bg-[#0F1A30] text-white" },
  revised: { label: "정정", cls: "bg-[#2D4C82] text-white" },
  cancelled: { label: "취소", cls: "bg-white text-[#9AA9C3] border border-[#DCE3EE]" },
};
export function OrderNoticeHistory({ company, target, myName, isSelf, canManage = true }) {
  const ro = useRoleOptions();
  const staff = useCompanyStaff(company);
  const [orders, setOrders] = React.useState([]);
  const [busy, setBusy] = React.useState("");
  const [revise, setRevise] = React.useState(null);
  React.useEffect(() => {
    if (!company || !target?.uid) { setOrders([]); return undefined; }
    return onSnapshot(query(collection(db, "notices"), where("companyName", "==", company), where("category", "==", "인사발령")),
      (sn) => setOrders(sn.docs.map((d) => ({ id: d.id, ...d.data() })).filter((n) => n.hrOrder?.uid === target.uid)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))), () => setOrders([]));
  }, [company, target?.uid]);
  const curRole = target?.role || "user";
  // ↩ 취소 — 발령 전 직책·부서·권한으로 되돌리고, 공지는 [취소]로 바꿔 남긴다(지우지 않음 — 이미 본 직원이 헷갈리지 않게)
  const cancelOrder = async (n) => {
    const o = n.hrOrder || {};
    const reason = window.prompt(`「${n.title}」 발령을 취소합니다.\n취소 사유를 적어 주세요(공지·메일에 함께 나갑니다).`, "공문 오기재");
    if (reason === null) return;
    if (!await kpConfirm(`${o.name || target.name}님을 발령 전(${o.from?.team || "미배정"} ${o.from?.position || "-"} · ${ro.label(o.from?.role)})으로 되돌리고\n공지사항을 [취소]로 바꾼 뒤 전 직원에게 알릴까요?`)) return;
    setBusy(n.id);
    try {
      const patch = {
        position: o.from?.position || "", team: o.from?.team || "",
        personnelHistory: [...(target.personnelHistory || []), { date: today(), type: "발령 취소", detail: `${n.title}${reason ? ` · 사유: ${reason}` : ""}` }],
        orderNotice: null,
      };
      if (o.from?.role && o.from.role !== curRole && !isSelf) patch.role = o.from.role;
      await setDoc(doc(db, "users", target.uid), patch, { merge: true });
      const t = String(n.title || "").replace(/^\[(정정|취소)\]\s*/, "");
      await updateDoc(doc(db, "notices", n.id), {
        title: `[취소] ${t}`, content: `※ 본 인사발령은 취소되었습니다.${reason ? ` (사유: ${reason})` : ""}\n발령 전 소속(${o.from?.team || "미배정"} ${o.from?.position || "-"})으로 유지됩니다.\n\n──────── 취소된 공문 ────────\n${String(n.content || "").replace(/^※[^\n]*\n\n/, "")}`,
        hrOrder: { ...o, status: "cancelled", cancelReason: reason || "" }, cancelledAt: serverTimestamp(), revisedAt: serverTimestamp(), revisedBy: myName || "", readBy: [], editVer: increment(1),
      });
      const to = (staff || []).filter((u) => u.uid !== auth.currentUser?.uid);
      if (to.length) await sendInternalMail({ company, to, subject: `[인사발령 취소] ${t} · ${o.name || target.name}`, body: `앞서 안내한 「${t}」 인사발령을 취소합니다.${reason ? `\n사유: ${reason}` : ""}\n${o.name || target.name}님은 발령 전 소속(${o.from?.team || "미배정"} ${o.from?.position || "-"})으로 유지됩니다.`, kind: "hr", fromName: myName, noticeKey: `notice_${n.id}_v${(n.editVer || 0) + 1}` });
      alert("발령을 취소했습니다. 공지사항은 [취소]로 바뀌었습니다.");
    } catch (e) { alert(`취소 실패: ${e.message || e}`); } finally { setBusy(""); }
  };
  const ms = (t) => (t?.seconds ? t.seconds * 1000 : 0);
  const day = (t) => { const x = ms(t); if (!x) return ""; const d = new Date(x); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };
  return (
    <div className="mt-8">
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-[17px] font-black text-[#0F1A30]">발령 공문</span>
        <span className="text-[11px] font-extrabold tracking-[0.24em] text-[#9AA9C3]">ORDERS</span>
        <span className="flex-1 h-px bg-[#E3E8F0] self-center" />
        {canManage && <span className="text-[12px] font-bold text-[#9AA9C3]">잘못 올린 공문은 정정·취소</span>}
      </div>
      {orders.length === 0 ? (
        <div className="px-5 py-8 rounded-2xl border border-dashed border-[#DCE3EE] text-center text-[14.5px] text-[#9AA9C3]">올린 발령 공문이 없습니다</div>
      ) : (
        <div className="rounded-2xl border border-[#E3E8F0] overflow-hidden divide-y divide-[#EEF1F6]">
          {orders.map((n) => {
            const o = n.hrOrder || {};
            const st = ST[o.status] || ST.active;
            const mine = !n.authorUid || n.authorUid === auth.currentUser?.uid;
            const off = o.status === "cancelled";
            return (
              <div key={n.id} className={`flex flex-col md:flex-row md:items-center gap-3 md:gap-5 px-5 py-4 ${off ? "bg-[#FAFBFD]" : "bg-white"}`}>
                <div className="flex items-center gap-3 md:w-[210px] shrink-0">
                  <span className={`h-7 px-2.5 rounded-lg text-[12px] font-black grid place-items-center shrink-0 ${st.cls}`}>{st.label}{o.status === "revised" && o.revision > 1 ? ` ${o.revision}차` : ""}</span>
                  <div className="min-w-0">
                    <div className={`text-[15px] font-black truncate ${off ? "text-[#9AA9C3] line-through" : "text-[#0F1A30]"}`}>{String(n.title || "").replace(/^\[(정정|취소)\]\s*/, "")}</div>
                    <div className="text-[12px] text-[#7A879C] tabular-nums">게시 {day(n.createdAt)}{n.revisedAt ? ` · ${off ? "취소" : "정정"} ${day(n.revisedAt)}` : ""}</div>
                  </div>
                </div>
                <div className={`flex-1 min-w-0 flex items-center gap-2 text-[14.5px] ${off ? "text-[#9AA9C3]" : "text-[#0F1A30]"}`}>
                  <span className="px-3 py-1.5 rounded-xl bg-[#F5F8FD] border border-[#EDF1F7] font-bold truncate">{o.from?.team || "미배정"} · {o.from?.position || "-"}</span>
                  <span className="text-[#9AA9C3] font-black shrink-0">→</span>
                  <span className={`px-3 py-1.5 rounded-xl font-black truncate ${off ? "bg-[#F5F8FD] border border-[#EDF1F7]" : "bg-[#0F1A30] text-white"}`}>{o.to?.team || "미배정"} · {o.to?.position || "-"}</span>
                  {off && o.cancelReason && <span className="text-[12px] font-bold truncate">사유: {o.cancelReason}</span>}
                </div>
                {canManage && !off && (mine ? (
                  <div className="flex gap-1.5 shrink-0">
                    <button type="button" disabled={!!busy} onClick={() => setRevise(n)} className="h-9 px-3.5 rounded-xl bg-[#0F1A30] text-white text-[12.5px] font-black hover:bg-[#1B2B4B] disabled:opacity-40">정정 발령</button>
                    <button type="button" disabled={!!busy} onClick={() => cancelOrder(n)} className="h-9 px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#5B6B85] hover:bg-[#F5F8FD] disabled:opacity-40">{busy === n.id ? "취소 중…" : "발령 취소"}</button>
                  </div>
                ) : <span className="text-[12px] font-bold text-[#9AA9C3] shrink-0">정정·취소는 {n.author || "올린 사람"}님만</span>)}
              </div>
            );
          })}
        </div>
      )}
      {revise && createPortal(
        <div className="fixed inset-0 z-[99990] bg-[#0B1428]/50 flex items-center justify-center p-3" onClick={() => setRevise(null)}>
          <div className="w-full max-w-[1180px] max-h-[94vh] overflow-y-auto rounded-[22px] bg-[#F3F6FA] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 px-6 py-4 text-white flex items-center gap-3" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)" }}>
              <div className="flex-1 min-w-0">
                <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]">REVISION · 정정 발령</div>
                <div className="text-[18px] font-black truncate">{target.name} · 「{String(revise.title || "").replace(/^\[(정정|취소)\]\s*/, "")}」</div>
              </div>
              <button type="button" onClick={() => setRevise(null)} className="w-9 h-9 rounded-lg text-white/60 hover:text-white hover:bg-white/10 font-black">✕</button>
            </div>
            <div className="p-5"><PersonnelOrder company={company} target={target} myName={myName} isSelf={isSelf} reviseNotice={revise} onDone={() => setRevise(null)} /></div>
          </div>
        </div>, document.body)}
    </div>
  );
}
