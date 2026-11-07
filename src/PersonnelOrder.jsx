// ======================= src/PersonnelOrder.jsx =======================
// 📢 인사발령(2026-10-27) — 인사관리부 › 인사발령 탭(인사관리자·최고관리자만)
//  1) 대상자의 새 직책·부서·권한을 고르면 발령 공문이 미리보기로 바로 만들어진다(공문 글자는 미리보기에서 직접 고칠 수 있음).
//  2) [발령 공문 발송] → ① 회원 정보(직책·부서·권한)+인사발령 이력 반영 ② 공문을 이미지로 만들어
//     ③ 사내게시판 공지사항(카테고리 "인사발령", 제목 자동 "YYYY년 M월 D일 인사발령") ④ 전 직원 사내메일(이미지 포함)
//     → 메일 트리거가 휴대폰 푸시, 접속 중인 사람은 화면 오른쪽 아래 배너.
import React from "react";
import { createPortal } from "react-dom";
import { kpConfirm, kpPrompt } from "./kpDialog";
import { html2canvas } from "./lazyLoad"; // ⭐ 2026-11-02 속도 — 캡처 라이브러리는 처음 캡처할 때 받는다
import { db, auth } from "./firebase";
import { addDoc, collection, doc, increment, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { suggestRole, isExecProfile, useHrOptions } from "./hrConstants";
import { useRoleOptions, BASE_ROLE_OPTIONS, ROLE_LABELS } from "./customRoles";
import { sendInternalMail, useCompanyStaff, compressImage } from "./InternalMail";
import { CustomSelect } from "./CustomSelect";
import CustomDatePicker from "./CustomDatePicker";

export const HR_ROLE_OPTIONS = BASE_ROLE_OPTIONS.map(([k]) => [k, ROLE_LABELS[k]]);
const roleName = (r) => (HR_ROLE_OPTIONS.find(([k]) => k === r) || [r, r || "-"])[1];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const korDate = (s) => { const [y, m, d] = String(s || "").split("-").map(Number); return y ? `${y}년 ${m}월 ${d}일` : ""; };
export const JUNIOR_RANKS = ["인턴", "사원", "주임", "대리"];
const RANK = ["인턴", "사원", "주임", "대리", "과장", "차장", "부장", "팀장", "파트장", "실장", "이사", "전무", "대표", "대표이사"];

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

// ⭐ 2026-11-03 여러 명 발령 — 한 공문에 대상자 여러 줄(사람 · 발령구분 · 부서/직책/권한 · 발령일).
//  저장: notices.hrOrder 는 예전 모양(uid·name·from·to·date·type = 첫 대상자) 그대로 두고 rows[]·uids[] 를 더한다.
//  정정·취소는 공문 한 장 단위(공문에 들어 있는 대상자 모두 함께 정정·되돌림).
export const ORDER_KINDS = ["승진", "전보", "직책변경", "권한변경", "채용", "겸직", "파견", "휴직", "복직", "퇴직"];
const liveOf = (u) => ({ position: u?.position || "", team: u?.team && u.team !== "미배정" ? u.team : "", role: u?.role || "user" });
export const hrOrderRows = (o) => (Array.isArray(o?.rows) && o.rows.length ? o.rows : o?.uid ? [{ uid: o.uid, name: o.name, from: o.from, to: o.to, date: o.date, type: o.type }] : []);
export const hrOrderHas = (o, uid) => !!uid && (o?.uid === uid || (Array.isArray(o?.uids) && o.uids.includes(uid)) || hrOrderRows(o).some((r) => r.uid === uid));

// reviseNotice — 정정할 발령 공지(인사발령 이력 › 정정 발령에서 팝업으로 열 때). onDone — 정정 발송 후 닫기
export default function PersonnelOrder({ company, target, myName, isSelf, reviseNotice = null, onDone = null }) {
  const ro = useRoleOptions();
  const roleName = ro.label;
  // ⭐ 2026-11-01 대리까지(인턴·사원·주임·대리)는 일반 사무원 — 직책을 고르면 권한이 자동으로 일반 사무원(실무자)으로 바뀐다
  //   (회사에서 "일반사무원" 이름의 권한을 만들어 두었으면 그 권한). 권한 칸에서 다시 고르면 고른 대로 발령된다
  //   ⭐ 2026-11-04 경리·인사·법무·개발은 그 부서 사무원 기본 역할(suggestRole), 추천이 그 부서에 맞지 않으면 그 부서의 첫 역할
  const staffRole = (ro.options.find(([k, l]) => !BASE_ROLE_OPTIONS.some(([b]) => b === k) && /사무원/.test(String(l || ""))) || ["user"])[0];
  const suggestR = (x) => {
    const s0 = isExecProfile(x) && ro.execKeys[0] ? ro.execKeys[0] : suggestRole(x);
    const s1 = s0 === "user" && JUNIOR_RANKS.includes(String(x?.position || "").trim()) ? staffRole : s0;
    return ro.fits(s1, x?.team) ? s1 : ro.fits(s0, x?.team) ? s0 : ro.firstFor(x?.team);
  };
  const hrOpt = useHrOptions(company);
  const positionsForTeam = hrOpt.positionsFor; const TEAM_OPTIONS = hrOpt.teams;
  const staff = useCompanyStaff(company);
  const myUid = auth.currentUser?.uid || "";
  const userOf = (uid) => (uid === target?.uid ? target : (staff || []).find((u) => u.uid === uid)) || null;
  const selfOf = (uid) => (uid === target?.uid ? !!isSelf : uid === myUid);
  // ✏ 2026-11-01 정정 발령 — 잘못 올린 공문을 고칠 때는 "발령 전" 값을 기준으로 다시 만든다(같은 공지를 고쳐 올림)
  const [revising, setRevising] = React.useState(null);
  const revFrom = React.useMemo(() => Object.fromEntries(hrOrderRows(revising?.hrOrder).map((r) => [r.uid, r.from || {}])), [revising]);
  const curOf = (uid) => (revFrom[uid] ? { position: revFrom[uid].position || "", team: revFrom[uid].team || "", role: revFrom[uid].role || "user" } : liveOf(userOf(uid)));
  const [rows, setRows] = React.useState(() => (target ? [{ uid: target.uid, next: liveOf(target), kind: "", date: "" }] : []));
  const [date, setDate] = React.useState(today());
  const [doc_, setDoc_] = React.useState({});
  const [capture, setCapture] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [done, setDone] = React.useState(null);
  const paperRef = React.useRef(null);

  // 대상자가 바뀌면 처음부터
  React.useEffect(() => {
    setRows(target ? [{ uid: target.uid, next: liveOf(target), kind: "", date: "" }] : []);
    setDoc_({}); setDone(null); setDate(today()); setRevising(null);
  }, [target?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const setRow = (uid, patch) => setRows((p) => p.map((r) => (r.uid === uid ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) } : r)));
  const setNextOf = (uid, fn) => setRow(uid, (r) => ({ next: fn(r.next) }));
  const dropDoc = (prefix) => setDoc_((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith(prefix))));
  const changedOf = (r) => { const c = curOf(r.uid); return r.next.position !== c.position || r.next.team !== c.team || r.next.role !== c.role; };
  const typeOf = (r) => r.kind || autoType(curOf(r.uid), r.next);
  const anyChanged = rows.some(changedOf);
  const no = `제 ${date.slice(0, 4)}-${date.slice(5, 7)}${date.slice(8, 10)} 호`;
  // 공문 내용 — 직접 고친 값이 있으면 그 값, 없으면 자동 문구
  const auto = { no, title: "인 사 발 령", lead: `${company} 인사규정에 의거하여 아래와 같이 인사발령합니다.`, note: "", sign: `${company} 대표이사` };
  const autoRow = (r) => {
    const c = curOf(r.uid); const u = userOf(r.uid);
    return {
      type: typeOf(r), name: u?.name || hrOrderRows(revising?.hrOrder).find((x) => x.uid === r.uid)?.name || "",
      fromTeam: c.team || "미배정", fromPos: c.position || "-", fromRole: roleName(c.role),
      toTeam: r.next.team || "미배정", toPos: r.next.position || "-", toRole: roleName(r.next.role),
      effective: korDate(r.date || date),
    };
  };
  const v = (k) => (doc_[k] !== undefined ? doc_[k] : auto[k]);
  const setV = (k) => (val) => setDoc_((p) => ({ ...p, [k]: val }));
  const rv = (r, k) => { const key = `${r.uid}.${k}`; return doc_[key] !== undefined ? doc_[key] : autoRow(r)[k]; };
  const setRV = (r, k) => setV(`${r.uid}.${k}`);

  const send = async () => {
    if (!rows.length) return;
    if (rows.some((r) => !userOf(r.uid))) { alert("직원 정보를 아직 불러오지 못한 대상자가 있습니다. 잠시 후 다시 눌러 주세요."); return; }
    if (!anyChanged && !await kpConfirm("바뀐 직책·부서·권한이 없습니다. 공문만 발송할까요?")) return;
    const names = rows.map((r) => rv(r, "name")).join(", ");
    const summary = rows.map((r) => `· ${rv(r, "name")} — ${rv(r, "toTeam")} ${rv(r, "toPos")}(${rv(r, "toRole")})`).join("\n");
    if (revising && !await kpConfirm(`「${revising.title}」 공문을 정정할까요?\n\n· 같은 공지사항이 정정된 내용으로 바뀌고 제목 앞에 [정정]이 붙습니다\n· 대상자 정보가 아래처럼 다시 반영됩니다\n${summary}\n· 전 직원에게 정정 안내 메일·푸시가 나갑니다`)) return;
    if (!revising && anyChanged && !await kpConfirm(rows.length === 1 ? `${names}님을 ${rv(rows[0], "toTeam")} ${rv(rows[0], "toPos")}(${rv(rows[0], "toRole")})(으)로 발령하고 전 직원에게 공문을 발송할까요?` : `${rows.length}명을 아래와 같이 발령하고 전 직원에게 공문을 발송할까요?\n\n${summary}`)) return;
    // 회원 정보가 바뀌면 "현 소속" 자동 문구도 바뀌므로, 지금 보이는 공문 내용을 그대로 고정해 둔다
    const frozen = Object.fromEntries(Object.keys(auto).map((k) => [k, v(k)]));
    rows.forEach((r) => Object.keys(autoRow(r)).forEach((k) => { frozen[`${r.uid}.${k}`] = rv(r, k); }));
    setDoc_(frozen);
    const fv = (k) => frozen[k];
    const fr = (r, k) => frozen[`${r.uid}.${k}`];
    // 반영 전 값으로 고정(회원 정보가 바뀌면 curOf 가 달라지므로)
    const plan = rows.map((r) => ({ r, u: userOf(r.uid), cur: { ...curOf(r.uid) }, next: { ...r.next }, changed: changedOf(r), rdate: r.date || date }));
    setBusy("회원 정보 반영 중…");
    try {
      for (const { r, u, cur, next, changed, rdate } of plan) {
        const detail = [
          next.team !== cur.team ? `${cur.team || "미배정"} → ${next.team || "미배정"}` : "",
          next.position !== cur.position ? `${cur.position || "-"} → ${next.position || "-"}` : "",
          next.role !== cur.role ? `권한 ${roleName(cur.role)} → ${roleName(next.role)}` : "",
        ].filter(Boolean).join(" / ") || fr(r, "type");
        const patch = {
          position: next.position, team: next.team,
          personnelHistory: [...(u.personnelHistory || []), { date: rdate, type: revising ? `발령 정정(${fr(r, "type")})` : fr(r, "type"), detail: `${detail}${u.pendingOrder?.docNo ? ` · 결재 ${u.pendingOrder.docNo}` : ""}` }],
          ...(u.pendingOrder ? { pendingOrder: null } : {}), // 결재 완료 발령을 공문으로 게시했으면 비운다
        };
        // 🎉 발령 받은 사람이 다음 접속 때 한 번 보는 축하·안내 창(OrderCongratsPopup)
        if (changed) patch.orderNotice = {
          kind: fr(r, "type"), company, date: fr(r, "effective"), docNo: u.pendingOrder?.docNo || "", at: Date.now(), seen: false,
          fromTeam: fr(r, "fromTeam"), toTeam: fr(r, "toTeam"), fromPos: fr(r, "fromPos"), toPos: fr(r, "toPos"), fromRole: fr(r, "fromRole"), toRole: fr(r, "toRole"),
        };
        if (next.role !== liveOf(u).role && !selfOf(r.uid)) patch.role = next.role; // ⭐ 2026-10-31 임원도 권한 관리의 역할을 그대로
        await setDoc(doc(db, "users", r.uid), patch, { merge: true });
      }

      setBusy("공문 이미지 만드는 중…");
      setCapture(true);
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const canvas = await html2canvas(paperRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      setCapture(false);
      const image = await compressImage(canvas.toDataURL("image/jpeg", 0.92), 1800, 0.88); // 공지에 크게 올라가도 선명하게

      const baseTitle = `${korDate(date)} 인사발령`;
      const title = revising ? `[정정] ${baseTitle}` : baseTitle;
      const multi = plan.length > 1;
      const p0 = plan[0].r;
      const text = multi
        ? `${fv("lead")}\n\n${plan.map(({ r }, i) => `${i + 1}. ${fr(r, "name")} (${fr(r, "type")})\n   ${fr(r, "fromTeam")} ${fr(r, "fromPos")} → ${fr(r, "toTeam")} ${fr(r, "toPos")} (${fr(r, "toRole")}) · 시행일 ${fr(r, "effective")}`).join("\n")}${fv("note") ? `\n\n· 비고: ${fv("note")}` : ""}`
        : `${fv("lead")}\n\n· 발령구분: ${fr(p0, "type")}\n· 대상: ${fr(p0, "name")}\n· 발령: ${fr(p0, "fromTeam")} ${fr(p0, "fromPos")} → ${fr(p0, "toTeam")} ${fr(p0, "toPos")} (${fr(p0, "toRole")})\n· 시행일: ${fr(p0, "effective")}${fv("note") ? `\n· 비고: ${fv("note")}` : ""}`;
      const oRows = plan.map(({ r, cur, next, rdate }) => ({ uid: r.uid, name: fr(r, "name"), from: cur, to: next, date: rdate, type: fr(r, "type") }));
      const first = oRows[0];
      const hrOrder = { uid: first.uid, name: first.name, from: first.from, to: first.to, date: first.date, type: first.type, rows: oRows, uids: oRows.map((x) => x.uid), status: revising ? "revised" : "active", revision: (revising?.hrOrder?.revision || 0) + (revising ? 1 : 0) };
      const who = multi ? `${first.name} 외 ${oRows.length - 1}명` : first.name;
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
          title, category: "인사발령", author: myName || "", content: text, audience: "internal", audiences: ["internal"],
          authorUid: myUid, createdAt: serverTimestamp(), companyName: company, image, hrOrder,
        });
        noticeKey = `notice_${nref.id}`;
      }

      setBusy("전 직원 사내메일 보내는 중…");
      const to = (staff || []).filter((u) => u.uid !== myUid);
      if (to.length) await sendInternalMail({ company, to, subject: revising ? `[인사발령 정정] ${baseTitle} · ${who} — 이전 공문은 무효입니다` : `[인사발령] ${title} · ${who}${multi ? "" : ` ${first.type}`}`, body: revising ? `앞서 안내한 인사발령 공문을 아래와 같이 정정합니다. 이전 공문은 무효입니다.\n\n${text}` : text, images: [image], kind: "hr", fromName: myName, noticeKey });
      setDone({ to: to.length, title, revised: !!revising, n: oRows.length });
      setRevising(null);
      if (reviseNotice) setTimeout(() => onDone?.(), 900);
    } catch (e) {
      setCapture(false);
      alert(`발송 실패: ${e.message || e}`);
    } finally { setBusy(""); }
  };

  // ✏ 정정 — 그 공문의 발령 내용(대상자 모두)을 불러와 고친 뒤 [정정 공문 발송]
  const startRevise = (n) => {
    const o = n.hrOrder || {};
    setRevising(n); setDone(null);
    setRows(hrOrderRows(o).map((x) => ({ uid: x.uid, next: { position: x.to?.position || "", team: x.to?.team || "", role: x.to?.role || x.from?.role || "user" }, kind: "", date: x.date && x.date !== o.date ? x.date : "" })));
    if (o.date) setDate(o.date);
    setDoc_({});
  };
  // 인사발령 이력 › [정정 발령]에서 열었으면 바로 정정 상태로
  React.useEffect(() => { if (reviseNotice?.id) startRevise(reviseNotice); }, [reviseNotice?.id, target?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!target) return <div className="py-16 text-center text-[14px] text-[#9AA9C3]">왼쪽에서 발령할 직원을 골라 주세요</div>;
  const sel = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#0F1A30] outline-none focus:border-[#4B6CB7]";
  const selS = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-bold text-[#0F1A30] outline-none focus:border-[#4B6CB7]";
  const addable = (staff || []).filter((u) => !rows.some((r) => r.uid === u.uid) && u.role !== "totalMaster");
  const multi = rows.length > 1;
  const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
  const cell = "border-r border-[#0F1A30]/70 px-1.5 py-2 min-w-0";

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(280px, 360px) 1fr" }}>
      {/* 왼쪽 — 바꿀 값 */}
      <div className="space-y-4">
        {/* 🗂 2026-11-01 전자결재 인사발령 품의가 최종 승인된 발령 — 불러와서 공문 게시 */}
        {target.pendingOrder && rows.some((r) => r.uid === target.uid) && (
          <div className="rounded-2xl p-4 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#D7BC82]">APPROVED · 결재 완료 발령</div>
            <div className="text-[15px] font-black mt-0.5">{target.pendingOrder.kind} → {[target.pendingOrder.toTeam, target.pendingOrder.toPosition].filter(Boolean).join(" ")}</div>
            <div className="text-[12.5px] text-white/60">발령일 {target.pendingOrder.date || "-"} · 결재 {target.pendingOrder.docNo || ""}</div>
            <button type="button" onClick={() => {
              const po = target.pendingOrder;
              setNextOf(target.uid, (p) => { const team = TEAM_OPTIONS.includes(po.toTeam) ? po.toTeam : (po.toTeam || p.team); return { ...p, team, position: po.toPosition || p.position, role: isSelf || p.role === "totalMaster" ? p.role : suggestR({ team, position: po.toPosition || p.position }) }; });
              if (po.date) setDate(po.date);
              setDoc_((p) => ({ ...p, note: [po.reason, po.note].filter(Boolean).join(" / ") }));
            }} className="mt-2.5 w-full h-10 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black">결재 내용 불러오기</button>
          </div>
        )}
        <div className="rounded-2xl border border-[#E3E8F0] bg-white p-5 space-y-3">
          <div>
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>APPOINTMENT</div>
            <div className="text-[17px] font-black text-[#0F1A30]">발령 공문 <span className="text-[13px] font-bold text-[#7A879C]">대상자 {rows.length}명</span></div>
          </div>
          <label className="block"><span className="text-[12.5px] font-bold text-[#7A879C]">시행일(공문 날짜)</span>
            <CustomDatePicker value={date} onChange={(e) => { setDate(e.target.value || today()); setDoc_((p) => { const n = { ...p }; delete n.no; Object.keys(n).forEach((k) => { if (k.endsWith(".effective")) delete n[k]; }); return n; }); }} className={sel} showIcon />
          </label>
        </div>
        {rows.map((r, i) => {
          const c = curOf(r.uid); const u = userOf(r.uid); const self = selfOf(r.uid);
          return (
            <div key={r.uid} className="rounded-2xl border border-[#E3E8F0] bg-white p-4 space-y-3">
              <div className="flex items-start gap-2">
                <span className="w-7 h-7 shrink-0 rounded-lg bg-[#0F1A30] text-[#8FB0F0] text-[12px] font-black grid place-items-center" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[15.5px] font-black text-[#0F1A30] truncate">{u?.name || rv(r, "name") || "(불러오는 중)"}</div>
                  <div className="text-[12px] font-bold text-[#7A879C] truncate">{revFrom[r.uid] ? "발령 전" : "현재"} {c.team || "미배정"} · {c.position || "-"} · {roleName(c.role)}</div>
                </div>
                {multi && <button type="button" aria-label="대상자 빼기" title="이 공문에서 빼기" onClick={() => { setRows((p) => p.filter((x) => x.uid !== r.uid)); dropDoc(`${r.uid}.`); }} className="w-8 h-8 shrink-0 rounded-lg text-[#9AA9C3] hover:text-[#0F1A30] hover:bg-[#F5F8FD] font-black">✕</button>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block min-w-0"><span className="text-[12px] font-bold text-[#7A879C]">발령 부서</span>
                  <CustomSelect value={r.next.team} onChange={(e) => { const team = e.target.value; setNextOf(r.uid, (p) => { const position = positionsForTeam(team).includes(p.position) ? p.position : ""; return { ...p, team, position, role: self || p.role === "totalMaster" ? p.role : suggestR({ team, position }) }; }); }} className={selS}>
                    <option value="">미배정</option>
                    {[...new Set([...TEAM_OPTIONS, c.team].filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
                  </CustomSelect>
                </label>
                <label className="block min-w-0"><span className="text-[12px] font-bold text-[#7A879C]">발령 직책</span>
                  <CustomSelect value={r.next.position} onChange={(e) => { const position = e.target.value; setNextOf(r.uid, (p) => ({ ...p, position, role: self || p.role === "totalMaster" ? p.role : suggestR({ team: p.team, position }) })); }} className={selS}>
                    <option value="">미설정</option>
                    {[...new Set([...positionsForTeam(r.next.team), r.next.position].filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
                  </CustomSelect>
                </label>
              </div>
              <label className="block"><span className="text-[12px] font-bold text-[#7A879C]">권한</span>
                <CustomSelect value={r.next.role} disabled={self || r.next.role === "totalMaster"} onChange={(e) => setNextOf(r.uid, (p) => ({ ...p, role: e.target.value }))} className={`${selS} disabled:bg-[#F5F7FA] disabled:text-[#9AA9C3]`}>
                  {ro.forTeam(r.next.team, r.next.role).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </CustomSelect>
                {self && <span className="text-[11.5px] text-[#9AA9C3]">본인 권한은 최고관리자만 바꿀 수 있습니다</span>}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block min-w-0"><span className="text-[12px] font-bold text-[#7A879C]">발령구분</span>
                  <CustomSelect value={r.kind} onChange={(e) => { setRow(r.uid, { kind: e.target.value }); dropDoc(`${r.uid}.type`); }} className={selS}>
                    <option value="">자동 · {autoType(c, r.next)}</option>
                    {ORDER_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </CustomSelect>
                </label>
                <label className="block min-w-0"><span className="text-[12px] font-bold text-[#7A879C]">발령일</span>
                  <CustomDatePicker value={r.date} placeholder="시행일과 같음" onChange={(e) => { setRow(r.uid, { date: e.target.value || "" }); dropDoc(`${r.uid}.effective`); }} className={selS} />
                </label>
              </div>
            </div>
          );
        })}
        {/* ⭐ 2026-11-03 대상자 추가 — 같은 공문에 여러 명 */}
        <div className="rounded-2xl border border-dashed border-[#C9D6EE] bg-[#F8FAFD] p-3">
          <CustomSelect value="" placeholder="+ 대상자 추가 (같은 공문에 여러 명)" onChange={(e) => { const uid = e.target.value; if (!uid) return; const u = userOf(uid); setRows((p) => (p.some((x) => x.uid === uid) ? p : [...p, { uid, next: liveOf(u), kind: "", date: "" }])); }}
            className="h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-black text-[#2D4C82] outline-none focus:border-[#4B6CB7]">
            <option value="">+ 대상자 추가 (같은 공문에 여러 명)</option>
            {addable.map((x) => <option key={x.uid} value={x.uid}>{[x.name || x.email, x.team, x.position].filter(Boolean).join(" · ")}</option>)}
          </CustomSelect>
        </div>
        {revising && (
          <div className="rounded-2xl border-2 border-[#B54708]/40 bg-[#FFF8EE] p-4">
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#B54708]">REVISION · 정정 중</div>
            <div className="text-[14.5px] font-black text-[#0F1A30] mt-0.5 truncate">「{revising.title}」</div>
            <div className="text-[12px] text-[#7A5A2E] mt-1 leading-relaxed">공문에 들어 있던 대상자 모두를 발령 전 소속 기준으로 다시 고릅니다. 발송하면 같은 공지가 [정정]으로 바뀝니다.</div>
            <button type="button" onClick={() => { if (reviseNotice) { onDone?.(); return; } setRevising(null); setRows([{ uid: target.uid, next: liveOf(target), kind: "", date: "" }]); setDoc_({}); setDate(today()); }} className="mt-2 h-9 px-3 rounded-lg border border-[#E7C9A0] bg-white text-[12.5px] font-black text-[#7A5A2E]">정정 그만두기</button>
          </div>
        )}
        {done ? (
          <div className="rounded-2xl bg-[#0F1A30] text-white p-5">
            <div className="text-[16px] font-black">{done.revised ? "정정 발송 완료" : "발송 완료"}</div>
            <div className="text-[13px] text-white/75 mt-1 leading-relaxed">· 대상자 {done.n}명 회원 정보 반영<br />· 공지사항 「{done.title}」 등록<br />· 전 직원 {done.to}명 사내메일(공문 이미지 포함)<br />· 접속 중인 직원 화면 배너 · 휴대폰 푸시</div>
          </div>
        ) : (
          <button onClick={send} disabled={!!busy}
            className="w-full h-14 rounded-2xl text-white text-[15.5px] font-black shadow-[0_12px_26px_rgba(15,26,48,0.28)] disabled:opacity-60"
            style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>
            {busy || `${revising ? "정정 공문 발송" : "발령 공문 발송"}${multi ? ` · ${rows.length}명` : ""}`}
          </button>
        )}
        <div className="text-[12px] text-[#9AA9C3] leading-relaxed px-1">공문 글자는 오른쪽 미리보기에서 눌러서 바로 고칠 수 있습니다. 발송하면 대상자 모두의 회원 정보가 바뀌고, 공지사항·전 직원 사내메일·푸시가 함께 나갑니다.{!reviseNotice && <><br />잘못 올린 공문의 정정·취소는 <b className="text-[#5B6B85]">인사발령 이력</b>에서 합니다(공문 한 장 단위 — 대상자 모두 함께).</>}</div>
      </div>

      {/* 오른쪽 — 공문 미리보기(A4 비율) */}
      <div className="rounded-2xl bg-[#E9EDF3] p-5 overflow-auto">
        <div ref={paperRef} className="mx-auto bg-white w-full max-w-[720px] px-12 py-12 shadow-[0_10px_30px_rgba(15,26,48,0.12)]" style={{ aspectRatio: capture || rows.length > 6 ? undefined : "1 / 1.414", fontFamily: "'Pretendard','Noto Sans KR',sans-serif" }}>
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
          {/* 표(전역 table 스타일을 안 타도록 div로 그린다) — 1명이면 예전 양식, 여러 명이면 대상자 목록 표 */}
          {!multi && rows[0] ? (
            <div className="border-t-2 border-l border-[#0F1A30] mb-6 text-[14.5px] text-[#0F1A30]">
              {[
                ["발령구분", [["type", "font-black"]]],
                ["성명", [["name", "font-black text-[16px]"]]],
                ["", [["#부서"], ["#직책"], ["#권한"]]],
                ["현 소속", [["fromTeam", "text-center"], ["fromPos", "text-center"], ["fromRole", "text-center"]]],
                ["발령", [["toTeam", "text-center font-black"], ["toPos", "text-center font-black"], ["toRole", "text-center font-black"]]],
                ["시행일", [["effective", ""]]],
                ["비고", [["@note", "min-h-[2.6em]", "(필요하면 입력)"]]],
              ].map(([label, cols], ri) => (
                <div key={ri} className="flex border-b border-[#0F1A30]/70">
                  <div className="w-[18%] min-w-[84px] shrink-0 flex items-center justify-center bg-[#EEF1F6] border-r border-[#0F1A30]/70 px-1.5 py-2.5 font-black whitespace-nowrap break-keep">{label}</div>
                  {cols.map(([k, cls, ph], ci) => (
                    <div key={ci} className={`flex-1 min-w-0 border-r border-[#0F1A30]/70 px-3 py-2.5 flex items-center ${k.startsWith("#") ? "bg-[#EEF1F6] justify-center font-black" : ""}`}>
                      {k.startsWith("#") ? k.slice(1)
                        : k.startsWith("@") ? <Ed capture={capture} value={v(k.slice(1))} onChange={setV(k.slice(1))} placeholder={ph} className={`w-full ${cls || ""}`} />
                        : <Ed capture={capture} value={rv(rows[0], k)} onChange={setRV(rows[0], k)} placeholder={ph} className={`w-full ${cls || ""}`} />}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="border-t-2 border-l border-[#0F1A30] mb-6 text-[13px] text-[#0F1A30]">
              <div className="flex bg-[#EEF1F6] font-black text-center border-b border-[#0F1A30]/70">
                {[["번호", "w-[7%]"], ["발령구분", "w-[13%]"], ["성명", "w-[13%]"], ["현 소속", "flex-1"], ["발령", "flex-1"], ["시행일", "w-[18%]"]].map(([h, w]) => <div key={h} className={`${w} shrink-0 ${cell} whitespace-nowrap`}>{h}</div>)}
              </div>
              {rows.map((r, i) => (
                <div key={r.uid} className="flex border-b border-[#0F1A30]/70 items-stretch text-center">
                  <div className={`w-[7%] shrink-0 ${cell} flex items-center justify-center font-bold`}>{i + 1}</div>
                  <div className={`w-[13%] shrink-0 ${cell} flex items-center`}><Ed capture={capture} value={rv(r, "type")} onChange={setRV(r, "type")} className="w-full text-center font-black" /></div>
                  <div className={`w-[13%] shrink-0 ${cell} flex items-center`}><Ed capture={capture} value={rv(r, "name")} onChange={setRV(r, "name")} className="w-full text-center font-black text-[14px]" /></div>
                  <div className={`flex-1 ${cell} flex flex-col justify-center`}>
                    <Ed capture={capture} value={rv(r, "fromTeam")} onChange={setRV(r, "fromTeam")} className="w-full text-center" />
                    <Ed capture={capture} value={rv(r, "fromPos")} onChange={setRV(r, "fromPos")} className="w-full text-center text-[12px] text-[#5A6A85]" />
                  </div>
                  <div className={`flex-1 ${cell} flex flex-col justify-center`}>
                    <Ed capture={capture} value={rv(r, "toTeam")} onChange={setRV(r, "toTeam")} className="w-full text-center font-black" />
                    <Ed capture={capture} value={`${rv(r, "toPos")}`} onChange={setRV(r, "toPos")} className="w-full text-center font-black text-[12px]" />
                    <Ed capture={capture} value={rv(r, "toRole")} onChange={setRV(r, "toRole")} className="w-full text-center text-[11px] text-[#5A6A85]" />
                  </div>
                  <div className={`w-[18%] shrink-0 ${cell} flex items-center`}><Ed capture={capture} value={rv(r, "effective")} onChange={setRV(r, "effective")} className="w-full text-center text-[12px]" /></div>
                </div>
              ))}
              <div className="flex border-b border-[#0F1A30]/70">
                <div className="w-[20%] shrink-0 flex items-center justify-center bg-[#EEF1F6] border-r border-[#0F1A30]/70 px-1.5 py-2.5 font-black">비고</div>
                <div className="flex-1 min-w-0 border-r border-[#0F1A30]/70 px-3 py-2.5"><Ed capture={capture} value={v("note")} onChange={setV("note")} placeholder="(필요하면 입력)" className="w-full min-h-[2.2em]" /></div>
              </div>
            </div>
          )}
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
      (sn) => setOrders(sn.docs.map((d) => ({ id: d.id, ...d.data() })).filter((n) => hrOrderHas(n.hrOrder, target.uid))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))), () => setOrders([]));
  }, [company, target?.uid]);
  // ↩ 취소 — 발령 전 직책·부서·권한으로 되돌리고, 공지는 [취소]로 바꿔 남긴다(지우지 않음 — 이미 본 직원이 헷갈리지 않게)
  // ⭐ 2026-11-03 여러 명 공문 — 공문 한 장 단위로 취소(들어 있는 대상자 모두 발령 전으로 되돌림)
  const cancelOrder = async (n) => {
    const o = n.hrOrder || {};
    const oRows = hrOrderRows(o);
    const reason = (await kpPrompt(`「${n.title}」 발령을 취소합니다.${oRows.length > 1 ? `\n(이 공문의 대상자 ${oRows.length}명 모두 함께 취소됩니다)` : ""}\n취소 사유를 적어 주세요(공지·메일에 함께 나갑니다).`, "공문 오기재"));
    if (reason === null) return;
    const lines = oRows.map((r) => `· ${r.name || "-"} → 발령 전(${r.from?.team || "미배정"} ${r.from?.position || "-"} · ${ro.label(r.from?.role)})`).join("\n");
    if (!await kpConfirm(`아래 ${oRows.length}명을 발령 전으로 되돌리고\n공지사항을 [취소]로 바꾼 뒤 전 직원에게 알릴까요?\n\n${lines}`)) return;
    setBusy(n.id);
    try {
      const myUid = auth.currentUser?.uid || "";
      for (const r of oRows) {
        const u = r.uid === target.uid ? target : (staff || []).find((x) => x.uid === r.uid);
        if (!u) continue; // 퇴사 등으로 목록에 없는 직원은 건너뜀(공지는 그대로 [취소])
        const patch = {
          position: r.from?.position || "", team: r.from?.team || "",
          personnelHistory: [...(u.personnelHistory || []), { date: today(), type: "발령 취소", detail: `${n.title}${reason ? ` · 사유: ${reason}` : ""}` }],
          orderNotice: null,
        };
        const self = r.uid === target.uid ? isSelf : r.uid === myUid;
        if (r.from?.role && r.from.role !== (u.role || "user") && !self) patch.role = r.from.role;
        await setDoc(doc(db, "users", r.uid), patch, { merge: true });
      }
      const t = String(n.title || "").replace(/^\[(정정|취소)\]\s*/, "");
      const keep = oRows.map((r) => `${r.name || "-"}: ${r.from?.team || "미배정"} ${r.from?.position || "-"}`).join(", ");
      const who = oRows.length > 1 ? `${oRows[0].name || ""} 외 ${oRows.length - 1}명` : (o.name || target.name);
      await updateDoc(doc(db, "notices", n.id), {
        title: `[취소] ${t}`, content: `※ 본 인사발령은 취소되었습니다.${reason ? ` (사유: ${reason})` : ""}\n발령 전 소속(${keep})으로 유지됩니다.\n\n──────── 취소된 공문 ────────\n${String(n.content || "").replace(/^※[^\n]*\n\n/, "")}`,
        hrOrder: { ...o, status: "cancelled", cancelReason: reason || "" }, cancelledAt: serverTimestamp(), revisedAt: serverTimestamp(), revisedBy: myName || "", readBy: [], editVer: increment(1),
      });
      const to = (staff || []).filter((u) => u.uid !== myUid);
      if (to.length) await sendInternalMail({ company, to, subject: `[인사발령 취소] ${t} · ${who}`, body: `앞서 안내한 「${t}」 인사발령을 취소합니다.${reason ? `\n사유: ${reason}` : ""}\n발령 전 소속으로 유지됩니다 — ${keep}`, kind: "hr", fromName: myName, noticeKey: `notice_${n.id}_v${(n.editVer || 0) + 1}` });
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
            // 여러 명 공문이면 이 직원의 줄을 보여 준다(+ "외 N명")
            const allRows = hrOrderRows(n.hrOrder);
            const o = { ...(n.hrOrder || {}), ...(allRows.find((r) => r.uid === target.uid) || {}) };
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
                  {allRows.length > 1 && <span title={allRows.map((r) => r.name).filter(Boolean).join(", ")} className="shrink-0 px-2 py-1 rounded-lg border border-[#C9D6EE] text-[#2D4C82] text-[12px] font-black cursor-help">공문 대상 {allRows.length}명</span>}
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
