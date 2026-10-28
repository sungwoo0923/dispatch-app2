// ======================= src/Approval.jsx =======================
// 📝 전자결재(2026-10-28) — 홈 › 전자결재
//  - 근태·휴가 신청 / 비용·지출 결의 / 업무 기안·품의: 왼쪽에서 입력·드롭다운으로 고르면 오른쪽 결재 문서 미리보기가
//    바로 만들어진다(인사발령 화면과 같은 방식). 결재선(결재·합의)과 참조자를 정해 [결재 상신].
//  - 결재함: 내 차례(결재 대기)·진행 중·완료·반려·참조·회사 전체(관리자). 문서를 열어 승인/반려(의견)·회수·재기안·인쇄.
//  - 결재선 관리: 자주 쓰는 결재선을 저장(개인/회사 공용).
//  approvals/{id}: { company, docNo, cat, form, formLabel, title, summary, amount, days, data, images,
//     drafterUid, drafter{uid,name,team,position}, line:[{uid,name,position,team,kind,status(wait|pending|approved|rejected),at,comment}],
//     cc:[{uid,name}], ccUids, participants, step, status(pending|approved|rejected|withdrawn), createdAt, updatedAt, history:[…] }
//  - 다음 결재자·기안자·참조자에게 사내메일(kind "approval")로 알린다 → 휴대폰 푸시·화면 배너.
import React from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas";
import { db, auth } from "./firebase";
import { collection, doc, onSnapshot, query, where, addDoc, updateDoc, deleteDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { ShellIcon } from "./AdminShell";
import { useCompanyStaff, sendInternalMail, compressImage } from "./InternalMail";
import {
  APPROVAL_CATS, APPROVAL_FORMS, formOf, formsOfCat, initialData, missingFields, fieldText, suggestLine,
  itemsTotal, costsTotal, fmtWon, dayDiff,
} from "./approvalForms";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const toMs = (v) => (v?.toMillis ? v.toMillis() : typeof v === "number" ? v : v?.seconds ? v.seconds * 1000 : 0);
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (ms) => { const d = new Date(ms || Date.now()); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const korDate = (ms) => { const d = new Date(ms || Date.now()); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
const mmdd = (ms) => { const d = new Date(ms); return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`; };
const STATUS = { pending: "진행 중", approved: "결재 완료", rejected: "반려", withdrawn: "회수" };
const catOf = (k) => APPROVAL_CATS.find((c) => c.key === k) || APPROVAL_CATS[0];
const isAdminRole = (r) => ["admin", "totalMaster", "hrManager"].includes(r);

// ─────────────────────────── 데이터 ───────────────────────────
export function useApprovals(uid) {
  const [list, setList] = React.useState(null);
  React.useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(query(collection(db, "approvals"), where("participants", "array-contains", uid)),
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))), () => setList([]));
  }, [uid]);
  return list;
}
const myTurn = (d, uid) => d.status === "pending" && d.line?.[d.step]?.uid === uid;
// 사이드바 숫자
export function useApprovalCounts() {
  const uid = auth.currentUser?.uid;
  const list = useApprovals(uid);
  return React.useMemo(() => {
    const l = list || [];
    return {
      todo: l.filter((d) => myTurn(d, uid)).length,
      rejectedMine: l.filter((d) => d.drafterUid === uid && d.status === "rejected" && !(d.seenBy || []).includes(uid)).length,
      myPending: l.filter((d) => d.drafterUid === uid && d.status === "pending").length,
    };
  }, [list, uid]);
}

async function notify(company, fromName, to, subject, body) {
  const list = (to || []).filter((u) => u?.uid && u.uid !== auth.currentUser?.uid);
  if (!list.length) return;
  await sendInternalMail({ company, to: list, subject, body, kind: "approval", fromName }).catch(() => {});
}
const docBrief = (d) => `· 문서번호: ${d.docNo}\n· 양식: ${d.formLabel}\n· 기안자: ${d.drafter?.name || ""} ${d.drafter?.position || ""}\n· 내용: ${d.summary || ""}${d.amount ? `\n· 금액: ${fmtWon(d.amount)}` : ""}\n\n홈 › 전자결재 › 결재함에서 확인하세요.`;

// ─────────────────────────── 결재 문서(미리보기·보기 공용) ───────────────────────────
function Stamp({ step }) {
  if (step.status === "approved") {
    return (
      <div className="w-[54px] h-[54px] rounded-full border-[2.5px] border-[#1B2B4B] flex flex-col items-center justify-center text-[#1B2B4B] rotate-[-8deg] leading-none">
        <span className="text-[13px] font-black">{String(step.name || "").slice(0, 3)}</span>
        <span className="text-[9.5px] font-black mt-0.5 tracking-wider">{step.kind === "합의" ? "합의" : "승인"}</span>
      </div>
    );
  }
  if (step.status === "rejected") {
    return (
      <div className="w-[54px] h-[54px] rounded-full border-[2.5px] border-[#0F1A30] bg-[#0F1A30] flex flex-col items-center justify-center text-white rotate-[-8deg] leading-none">
        <span className="text-[13px] font-black">반려</span>
        <span className="text-[9px] font-bold mt-0.5">{String(step.name || "").slice(0, 3)}</span>
      </div>
    );
  }
  if (step.status === "pending") return <span className="text-[11px] font-black text-[#4B6CB7]">결재 중</span>;
  return null;
}

function Cell({ label, children, wide, last }) {
  return (
    <div className={`flex ${last ? "" : "border-b"} border-[#0F1A30]/60`}>
      <div className="w-[118px] shrink-0 bg-[#EEF1F6] border-r border-[#0F1A30]/60 px-3 py-2.5 text-[13px] font-black text-[#0F1A30] flex items-center">{label}</div>
      <div className={`flex-1 min-w-0 px-3.5 py-2.5 text-[14px] text-[#0F1A30] whitespace-pre-wrap break-words ${wide ? "" : ""}`}>{children}</div>
    </div>
  );
}

export function ApprovalPaper({ form, data, title, line, cc, drafter, docNo, createdMs, staff, status, paperRef }) {
  const cols = [{ uid: drafter?.uid, name: drafter?.name, position: drafter?.position || "기안", kind: "기안", status: "approved", at: createdMs }, ...(line || [])];
  const fields = form.fields || [];
  return (
    <div ref={paperRef} className="mx-auto bg-white w-full max-w-[780px] px-10 py-10 shadow-[0_10px_30px_rgba(15,26,48,0.12)] relative" style={{ fontFamily: "'Pretendard','Noto Sans KR',sans-serif", minHeight: 1000 }}>
      {status && status !== "pending" && (
        <div className="absolute top-8 left-8 px-3 py-1 rounded-md border-2 border-[#0F1A30] text-[13px] font-black text-[#0F1A30] tracking-widest rotate-[-6deg]">{STATUS[status]}</div>
      )}
      <div className="flex items-start justify-between gap-6">
        <div className="pt-4 min-w-0">
          <div className="text-[11.5px] font-extrabold tracking-[0.3em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>{catOf(form.cat).en} · {form.code}</div>
          <div className="text-[30px] font-black tracking-[0.12em] text-[#0F1A30] mt-1 whitespace-nowrap">{form.title}</div>
          <div className="text-[12.5px] text-[#5A6A85] mt-1" style={{ fontFamily: MONO }}>{docNo || "문서번호는 상신할 때 자동 부여"}</div>
        </div>
        {/* 결재란 */}
        <div className="shrink-0 flex border border-[#0F1A30]">
          <div className="w-7 bg-[#EEF1F6] border-r border-[#0F1A30] flex items-center justify-center text-[12px] font-black text-[#0F1A30] leading-tight text-center py-2" style={{ writingMode: "vertical-rl" }}>결 재</div>
          {cols.map((s, i) => (
            <div key={i} className={`w-[74px] flex flex-col ${i < cols.length - 1 ? "border-r border-[#0F1A30]" : ""}`}>
              <div className="h-7 bg-[#EEF1F6] border-b border-[#0F1A30] flex items-center justify-center text-[11.5px] font-black text-[#0F1A30] truncate px-1">{i === 0 ? "기안" : s.kind === "합의" ? `합의` : s.position || "결재"}</div>
              <div className="h-[66px] flex items-center justify-center">{i === 0 ? <span className="text-[13px] font-black text-[#0F1A30]">{String(s.name || "").slice(0, 4)}</span> : <Stamp step={s} />}</div>
              <div className="h-6 border-t border-[#0F1A30] flex items-center justify-center text-[10.5px] text-[#3A4A66] truncate px-1">{s.at && (i === 0 || s.status === "approved" || s.status === "rejected") ? mmdd(s.at) : s.name || "-"}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-7 border-t-2 border-x border-b border-[#0F1A30]">
        <div className="flex border-b border-[#0F1A30]/60">
          <div className="flex-1 flex"><div className="w-[118px] shrink-0 bg-[#EEF1F6] border-r border-[#0F1A30]/60 px-3 py-2.5 text-[13px] font-black">기안자</div><div className="flex-1 px-3.5 py-2.5 text-[14px] font-bold">{drafter?.name || "-"} {drafter?.position || ""}</div></div>
          <div className="flex-1 flex border-l border-[#0F1A30]/60"><div className="w-[96px] shrink-0 bg-[#EEF1F6] border-r border-[#0F1A30]/60 px-3 py-2.5 text-[13px] font-black">소속</div><div className="flex-1 px-3.5 py-2.5 text-[14px]">{drafter?.team || "-"}</div></div>
        </div>
        <div className="flex border-b border-[#0F1A30]/60">
          <div className="flex-1 flex"><div className="w-[118px] shrink-0 bg-[#EEF1F6] border-r border-[#0F1A30]/60 px-3 py-2.5 text-[13px] font-black">기안일</div><div className="flex-1 px-3.5 py-2.5 text-[14px]">{ymd(createdMs)}</div></div>
          <div className="flex-1 flex border-l border-[#0F1A30]/60"><div className="w-[96px] shrink-0 bg-[#EEF1F6] border-r border-[#0F1A30]/60 px-3 py-2.5 text-[13px] font-black">참조</div><div className="flex-1 px-3.5 py-2.5 text-[13.5px] truncate">{(cc || []).map((c) => c.name).join(", ") || "-"}</div></div>
        </div>
        <Cell label="제목"><span className="font-black text-[15px]">{title || `${form.label}`}</span></Cell>
        {fields.map((f, i) => {
          const v = data?.[f.k];
          const last = i === fields.length - 1;
          if (f.type === "items") {
            const rows = (v || []).filter((r) => String(r.name || "").trim() || Number(r.price));
            return (
              <Cell key={f.k} label={f.label} last={last}>
                <div className="border border-[#0F1A30]/40 text-[13px]">
                  <div className="flex bg-[#F5F7FB] font-black border-b border-[#0F1A30]/40">{["품목", "수량", "단가", "금액"].map((h, k) => <div key={h} className={`px-2 py-1.5 ${k === 0 ? "flex-1" : "w-[90px] text-right"} ${k ? "border-l border-[#0F1A30]/30" : ""}`}>{h}</div>)}</div>
                  {(rows.length ? rows : [{}]).map((r, k) => (
                    <div key={k} className="flex border-b border-[#0F1A30]/20 last:border-b-0">
                      <div className="flex-1 px-2 py-1.5">{r.name || " "}</div>
                      <div className="w-[90px] px-2 py-1.5 text-right border-l border-[#0F1A30]/20">{r.qty || ""}</div>
                      <div className="w-[90px] px-2 py-1.5 text-right border-l border-[#0F1A30]/20">{Number(r.price) ? Number(r.price).toLocaleString("ko-KR") : ""}</div>
                      <div className="w-[90px] px-2 py-1.5 text-right border-l border-[#0F1A30]/20 font-bold">{Number(r.price) ? ((Number(r.qty) || 0) * Number(r.price)).toLocaleString("ko-KR") : ""}</div>
                    </div>
                  ))}
                  <div className="flex bg-[#F5F7FB] border-t border-[#0F1A30]/40 font-black"><div className="flex-1 px-2 py-1.5 text-right">합계</div><div className="w-[90px] px-2 py-1.5 text-right">{itemsTotal(v).toLocaleString("ko-KR")}</div></div>
                </div>
              </Cell>
            );
          }
          if (f.type === "costs") {
            return (
              <Cell key={f.k} label={f.label} last={last}>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13.5px]">
                  {(v || []).map((r, k) => <div key={k} className="flex justify-between border-b border-dotted border-[#0F1A30]/30 py-0.5"><span>{r.label}</span><span className="font-bold">{Number(r.amount) ? fmtWon(r.amount) : "-"}</span></div>)}
                </div>
                <div className="mt-2 text-right text-[14px] font-black">합계 {fmtWon(costsTotal(v))}</div>
              </Cell>
            );
          }
          return <Cell key={f.k} label={f.label} last={last}><span className={f.type === "money" ? "font-black" : ""}>{fieldText(f, v, staff) || <span className="text-[#B4BFD0]">{f.ph || ""}</span>}</span></Cell>;
        })}
      </div>
      {(() => {
        const amt = form.amount ? form.amount(data || {}) : 0;
        const days = form.days ? form.days(data || {}) : 0;
        if (!amt && !days) return null;
        return (
          <div className="mt-4 flex justify-end gap-2">
            {days > 0 && <div className="px-4 py-2 border-2 border-[#0F1A30] text-[14px] font-black">사용 일수 {days}일</div>}
            {amt > 0 && <div className="px-4 py-2 bg-[#0F1A30] text-white text-[15px] font-black">총액 {fmtWon(amt)}</div>}
          </div>
        );
      })()}
      <div className="text-center mt-12 text-[15px] text-[#1F2A44]">위와 같이 {form.cat === "expense" ? "결의" : form.cat === "draft" ? "기안" : "신청"}하오니 재가하여 주시기 바랍니다.</div>
      <div className="text-center mt-6 text-[14.5px] text-[#3A4A66]">{korDate(createdMs)}</div>
      <div className="text-center mt-3 text-[17px] font-black text-[#0F1A30] tracking-[0.1em]">{form.cat === "draft" ? "기안자" : "신청인"} {drafter?.name || ""} <span className="text-[13px] font-bold text-[#7A879C]">(인)</span></div>
    </div>
  );
}

// ─────────────────────────── 입력칸 ───────────────────────────
const inp = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#4B6CB7]";
function StaffSelect({ value, onChange, staff, exclude = [], placeholder = "선택" }) {
  const groups = React.useMemo(() => {
    const g = new Map();
    (staff || []).filter((u) => !exclude.includes(u.uid)).forEach((u) => { const t = u.team || "미배정"; if (!g.has(t)) g.set(t, []); g.get(t).push(u); });
    return [...g.entries()];
  }, [staff, exclude]);
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={inp}>
      <option value="">{placeholder}</option>
      {groups.map(([t, us]) => <optgroup key={t} label={t}>{us.map((u) => <option key={u.uid} value={u.uid}>{u.name}{u.position ? ` ${u.position}` : ""}</option>)}</optgroup>)}
    </select>
  );
}
function FieldInput({ f, value, onChange, staff, meUid }) {
  if (f.type === "textarea") return <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={f.rows || 3} placeholder={f.ph || ""} className={`${inp} h-auto py-2 leading-relaxed resize-y`} />;
  if (f.type === "select") return <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={inp}>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  if (f.type === "staff") return <StaffSelect value={value} onChange={onChange} staff={staff} exclude={[meUid]} placeholder="선택 안 함" />;
  if (f.type === "date") return <input type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} className={inp} />;
  if (f.type === "time") return <input type="time" value={value || ""} onChange={(e) => onChange(e.target.value)} className={inp} />;
  if (f.type === "number") return <input type="number" inputMode="numeric" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={inp} />;
  if (f.type === "money") {
    return (
      <div className="relative">
        <input inputMode="numeric" value={value ? Number(value).toLocaleString("ko-KR") : ""} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" className={`${inp} pr-9 text-right tabular-nums`} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] font-bold text-[#9AA9C3]">원</span>
      </div>
    );
  }
  if (f.type === "daterange") {
    const v = value || {};
    const n = dayDiff(v);
    return (
      <div>
        <div className="flex items-center gap-1.5">
          <input type="date" value={v.start || ""} onChange={(e) => onChange({ ...v, start: e.target.value, end: v.end && v.end >= e.target.value ? v.end : e.target.value })} className={inp} />
          <span className="text-[#9AA9C3] font-bold">~</span>
          <input type="date" value={v.end || ""} min={v.start || undefined} onChange={(e) => onChange({ ...v, end: e.target.value })} className={inp} />
        </div>
        {n > 0 && <div className="mt-1 text-[12px] font-bold text-[#1B2B4B]">총 {n}일</div>}
      </div>
    );
  }
  if (f.type === "items") {
    const rows = value || [];
    const set = (i, k, val) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
    return (
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input value={r.name || ""} onChange={(e) => set(i, "name", e.target.value)} placeholder="품목·내용" className={`${inp} flex-1 min-w-0`} />
            <input inputMode="numeric" value={r.qty ?? ""} onChange={(e) => set(i, "qty", e.target.value.replace(/[^\d.]/g, ""))} placeholder="수량" className={`${inp} !w-14 text-center`} />
            <input inputMode="numeric" value={r.price ? Number(r.price).toLocaleString("ko-KR") : ""} onChange={(e) => set(i, "price", e.target.value.replace(/[^\d]/g, ""))} placeholder="단가" className={`${inp} !w-24 text-right`} />
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} disabled={rows.length <= 1} className="w-8 h-8 shrink-0 rounded-lg text-[#9AA9C3] hover:bg-[#F5F8FD] disabled:opacity-30">✕</button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => onChange([...rows, { name: "", qty: 1, price: "" }])} className="text-[12.5px] font-bold text-[#4B6CB7]">+ 행 추가</button>
          <span className="text-[13px] font-black text-[#0F1A30]">합계 {fmtWon(itemsTotal(rows))}</span>
        </div>
      </div>
    );
  }
  if (f.type === "costs") {
    const rows = value || [];
    const set = (i, k, val) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
    return (
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input value={r.label || ""} onChange={(e) => set(i, "label", e.target.value)} className={`${inp} !w-28 shrink-0`} />
            <div className="relative flex-1">
              <input inputMode="numeric" value={r.amount ? Number(r.amount).toLocaleString("ko-KR") : ""} onChange={(e) => set(i, "amount", e.target.value.replace(/[^\d]/g, ""))} placeholder="0" className={`${inp} pr-8 text-right`} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-[#9AA9C3]">원</span>
            </div>
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="w-8 h-8 shrink-0 rounded-lg text-[#9AA9C3] hover:bg-[#F5F8FD]">✕</button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => onChange([...rows, { label: "기타", amount: "" }])} className="text-[12.5px] font-bold text-[#4B6CB7]">+ 항목 추가</button>
          <span className="text-[13px] font-black text-[#0F1A30]">합계 {fmtWon(costsTotal(rows))}</span>
        </div>
      </div>
    );
  }
  return <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={f.ph || ""} className={inp} />;
}

// ─────────────────────────── 결재선 편집 ───────────────────────────
function useLineTemplates(company, uid) {
  const [list, setList] = React.useState([]);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "approvalLines"), where("company", "==", company)),
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.shared || t.ownerUid === uid)), () => setList([]));
  }, [company, uid]);
  return list;
}
const pickUser = (staff, uid) => { const u = (staff || []).find((x) => x.uid === uid); return u ? { uid: u.uid, name: u.name || u.email || "", position: u.position || "", team: u.team || "" } : null; };

function LineEditor({ line, setLine, cc, setCc, staff, me, company, cat }) {
  const tpls = useLineTemplates(company, me.uid);
  const used = [me.uid, ...line.map((s) => s.uid)];
  const move = (i, d) => setLine((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const load = (id) => {
    if (id === "__auto") { setLine(suggestLine(staff, me)); return; }
    const t = tpls.find((x) => x.id === id);
    if (!t) return;
    setLine((t.steps || []).map((s) => ({ ...(pickUser(staff, s.uid) || s), kind: s.kind || "결재" })).filter((s) => s.uid !== me.uid));
    setCc((t.cc || []).filter((c) => c.uid !== me.uid));
  };
  const save = async () => {
    if (!line.length) return;
    const name = window.prompt("결재선 이름", `${catOf(cat).label} 결재선`);
    if (!name) return;
    await addDoc(collection(db, "approvalLines"), { company, name, ownerUid: me.uid, ownerName: me.name, shared: false, cats: [cat], steps: line.map(({ uid, name: n, position, kind }) => ({ uid, name: n, position, kind })), cc, createdAt: serverTimestamp() }).catch((e) => window.alert(e.message));
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <select value="" onChange={(e) => { load(e.target.value); e.target.value = ""; }} className={`${inp} flex-1`}>
          <option value="">결재선 불러오기…</option>
          <option value="__auto">자동 추천(부서장 → 임원 → 대표)</option>
          {tpls.filter((t) => !t.cats?.length || t.cats.includes(cat)).map((t) => <option key={t.id} value={t.id}>{t.shared ? "[공용] " : ""}{t.name}</option>)}
        </select>
        <button type="button" onClick={save} disabled={!line.length} className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[12.5px] font-bold text-[#3A4A66] disabled:opacity-40 shrink-0">저장</button>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 h-10 px-3 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0]">
          <span className="w-6 h-6 rounded-lg bg-[#0F1A30] text-white text-[11px] font-black flex items-center justify-center">기</span>
          <span className="text-[13.5px] font-black text-[#0F1A30]">{me.name}</span><span className="text-[12px] text-[#7A879C]">{me.position} · 기안자</span>
        </div>
        {line.map((s, i) => (
          <div key={`${s.uid}-${i}`} className="flex items-center gap-1.5">
            <span className="w-6 h-6 shrink-0 rounded-lg bg-[#1B2B4B] text-white text-[11px] font-black flex items-center justify-center">{i + 1}</span>
            <div className="flex-1 min-w-0"><StaffSelect value={s.uid} staff={staff} exclude={used.filter((u) => u !== s.uid)} onChange={(uid) => { const u = pickUser(staff, uid); if (u) setLine((p) => p.map((x, j) => (j === i ? { ...x, ...u } : x))); }} /></div>
            <select value={s.kind || "결재"} onChange={(e) => setLine((p) => p.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))} className={`${inp} !w-[74px] shrink-0 px-2`}>
              <option>결재</option><option>합의</option>
            </select>
            <div className="flex flex-col shrink-0">
              <button type="button" onClick={() => move(i, -1)} className="w-6 h-4 text-[10px] text-[#7A879C] hover:text-[#0F1A30]">▲</button>
              <button type="button" onClick={() => move(i, 1)} className="w-6 h-4 text-[10px] text-[#7A879C] hover:text-[#0F1A30]">▼</button>
            </div>
            <button type="button" onClick={() => setLine((p) => p.filter((_, j) => j !== i))} className="w-7 h-8 shrink-0 rounded-lg text-[#9AA9C3] hover:bg-[#F5F8FD]">✕</button>
          </div>
        ))}
        <StaffSelect value="" staff={staff} exclude={used} placeholder="+ 결재자 추가" onChange={(uid) => { const u = pickUser(staff, uid); if (u) setLine((p) => [...p, { ...u, kind: "결재" }]); }} />
      </div>
      <div>
        <div className="text-[12px] font-bold text-[#7A879C] mb-1.5">참조자 <span className="font-semibold">(결재 완료 시 알림)</span></div>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {cc.map((c) => <span key={c.uid} className="h-7 pl-2.5 pr-1 rounded-lg bg-[#EEF3FB] border border-[#D5E0F2] text-[12.5px] font-bold text-[#1B2B4B] inline-flex items-center gap-1">{c.name}<button type="button" onClick={() => setCc((p) => p.filter((x) => x.uid !== c.uid))} className="w-5 h-5 text-[#7A879C]">✕</button></span>)}
        </div>
        <StaffSelect value="" staff={staff} exclude={[me.uid, ...cc.map((c) => c.uid)]} placeholder="+ 참조자 추가" onChange={(uid) => { const u = pickUser(staff, uid); if (u) setCc((p) => [...p, { uid: u.uid, name: u.name }]); }} />
      </div>
    </div>
  );
}

// ─────────────────────────── 작성 화면 ───────────────────────────
function Composer({ company, me, staff, cat, preset, onDone }) {
  const forms = formsOfCat(cat);
  const [formKey, setFormKey] = React.useState(preset?.form && formOf(preset.form).cat === cat ? preset.form : forms[0].key);
  const form = formOf(formKey);
  const [data, setData] = React.useState(() => (preset?.data && preset.form === formKey ? preset.data : initialData(form)));
  const [title, setTitle] = React.useState(preset?.title || "");
  const [line, setLine] = React.useState(preset?.line || []);
  const [cc, setCc] = React.useState(preset?.cc || []);
  const [images, setImages] = React.useState(preset?.images || []);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const fileRef = React.useRef(null);
  const autoLined = React.useRef(!!preset?.line?.length);

  // 결재선이 비어 있으면 직원 목록이 오는 대로 자동 추천
  React.useEffect(() => { if (!autoLined.current && staff && staff.length) { autoLined.current = true; setLine(suggestLine(staff, me)); } }, [staff, me]);
  const pickForm = (k) => { setFormKey(k); setData(initialData(formOf(k))); setTitle(""); setMsg(""); };
  const autoTitle = form.titleOf ? form.titleOf(data) : `${form.label} · ${me.name}`;
  const finalTitle = (title || autoTitle || form.label).trim();

  const submit = async () => {
    const miss = missingFields(form, data);
    if (miss.length) { setMsg(`필수 입력: ${miss.join(", ")}`); return; }
    if (!line.length) { setMsg("결재자를 1명 이상 지정해 주세요."); return; }
    if (!window.confirm(`「${finalTitle}」 문서를 ${line.map((s) => s.name).join(" → ")} 순서로 결재 상신할까요?`)) return;
    setBusy(true); setMsg("");
    try {
      const now = new Date();
      const docNo = `${form.code}-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const L = line.map((s, i) => ({ uid: s.uid, name: s.name, position: s.position || "", team: s.team || "", kind: s.kind || "결재", status: i === 0 ? "pending" : "wait", at: 0, comment: "" }));
      const payload = {
        company, docNo, cat, form: form.key, formLabel: form.label, title: finalTitle,
        summary: form.summary ? form.summary(data) : "", amount: form.amount ? form.amount(data) : 0, days: form.days ? form.days(data) : 0,
        data, images, drafterUid: me.uid, drafter: { uid: me.uid, name: me.name, team: me.team || "", position: me.position || "" },
        line: L, cc, ccUids: cc.map((c) => c.uid), participants: [...new Set([me.uid, ...L.map((s) => s.uid), ...cc.map((c) => c.uid)])],
        step: 0, status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        history: [{ at: Date.now(), uid: me.uid, name: me.name, action: "상신", comment: "" }], redraftOf: preset?.id || null,
      };
      await addDoc(collection(db, "approvals"), payload);
      notify(company, me.name, [L[0]], `[결재 요청] ${finalTitle}`, `${me.name}님이 결재를 요청했습니다.\n\n${docBrief(payload)}`);
      onDone();
    } catch (e) { setMsg(e.message || "상신 실패"); } finally { setBusy(false); }
  };

  const half = (f) => f.half;
  return (
    <>
    <div className="flex flex-wrap gap-2 mb-4">
      {forms.map((f) => (
        <button key={f.key} type="button" onClick={() => pickForm(f.key)}
          className={`h-9 px-3.5 rounded-xl text-[13px] font-black border transition ${f.key === formKey ? "bg-[#0F1A30] text-white border-[#0F1A30] shadow-[0_6px_16px_rgba(15,26,48,0.25)]" : "bg-white text-[#3A4A66] border-[#E3E8F0] hover:border-[#4B6CB7]"}`}>{f.label}</button>
      ))}
    </div>
    <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(360px, 420px) 1fr" }}>
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#E3E8F0] bg-white p-5 space-y-3.5">
          <div>
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>FORM</div>
            <div className="text-[16px] font-black text-[#0F1A30]">양식 · 내용</div>
          </div>
          <label className="block"><span className="text-[12.5px] font-bold text-[#7A879C]">양식</span>
            <select value={formKey} onChange={(e) => pickForm(e.target.value)} className={`${inp} !h-11 font-black`}>{forms.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
          </label>
          <label className="block"><span className="text-[12.5px] font-bold text-[#7A879C]">문서 제목 <span className="font-semibold">(비우면 자동)</span></span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={autoTitle} className={inp} />
          </label>
          <div className="grid grid-cols-2 gap-x-2.5 gap-y-3">
            {form.fields.map((f) => (
              <label key={f.k} className={`block ${half(f) ? "" : "col-span-2"}`}>
                <span className="text-[12.5px] font-bold text-[#7A879C]">{f.label}{f.required && <span className="text-[#0F1A30]"> *</span>}</span>
                <div className="mt-1"><FieldInput f={f} value={data[f.k]} onChange={(v) => setData((p) => ({ ...p, [f.k]: v }))} staff={staff} meUid={me.uid} /></div>
              </label>
            ))}
          </div>
          <div>
            <span className="text-[12.5px] font-bold text-[#7A879C]">증빙·첨부 이미지 <span className="font-semibold">({images.length}/3 · 영수증·진단서 등)</span></span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {images.map((src, i) => (
                <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-[#E3E8F0]">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setImages((p) => p.filter((_, k) => k !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-[#0F1A30]/80 text-white text-[11px]">✕</button>
                </div>
              ))}
              {images.length < 3 && <button type="button" onClick={() => fileRef.current?.click()} className="w-16 h-16 rounded-xl border-2 border-dashed border-[#C9D2E0] text-[#7A879C] text-[11.5px] font-bold">+ 첨부</button>}
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={async (e) => { const fs = [...(e.target.files || [])].slice(0, 3 - images.length); e.target.value = ""; try { const out = await Promise.all(fs.map((f) => compressImage(f, 1200, 0.72))); setImages((p) => [...p, ...out].slice(0, 3)); } catch { setMsg("이미지를 읽지 못했습니다."); } }} />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-[#E3E8F0] bg-white p-5">
          <div className="mb-3">
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>APPROVAL LINE</div>
            <div className="text-[16px] font-black text-[#0F1A30]">결재선</div>
          </div>
          <LineEditor line={line} setLine={setLine} cc={cc} setCc={setCc} staff={staff} me={me} company={company} cat={cat} />
        </div>
        {msg && <div className="rounded-xl bg-white border border-[#DCE3EE] px-4 py-2.5 text-[13px] font-bold text-[#0F1A30]">⚠ {msg}</div>}
        <button type="button" onClick={submit} disabled={busy} className="w-full h-14 rounded-2xl text-white text-[15.5px] font-black shadow-[0_12px_26px_rgba(15,26,48,0.28)] disabled:opacity-60 inline-flex items-center justify-center gap-2" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>
          <ShellIcon name="send" size={17} />{busy ? "상신 중…" : "결재 상신"}
        </button>
      </div>
      <div className="rounded-2xl bg-[#E9EDF3] p-5 overflow-auto">
        <div className="sticky top-0">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-[12px] font-extrabold tracking-[0.2em] text-[#5A6A85]" style={{ fontFamily: MONO }}>LIVE PREVIEW</span>
            <span className="text-[12px] font-bold text-[#7A879C]">입력하는 대로 문서가 바로 만들어집니다</span>
          </div>
          <ApprovalPaper form={form} data={data} title={finalTitle} line={line.map((s, i) => ({ ...s, status: i === 0 ? "pending" : "wait" }))} cc={cc} drafter={me} createdMs={Date.now()} staff={staff} />
        </div>
      </div>
    </div>
    </>
  );
}

// ─────────────────────────── 문서 보기(결재·회수·재기안) ───────────────────────────
function Progress({ d }) {
  return (
    <div className="flex items-center gap-1">
      {(d.line || []).map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className={`w-3 h-[2px] ${s.status === "approved" || (d.line[i - 1].status === "approved") ? "bg-[#1B2B4B]" : "bg-[#DCE3EE]"}`} />}
          <span title={`${s.name} ${s.position} · ${s.status === "approved" ? "승인" : s.status === "rejected" ? "반려" : s.status === "pending" ? "결재 중" : "대기"}`}
            className={`w-[22px] h-[22px] rounded-full text-[10px] font-black flex items-center justify-center ${s.status === "approved" ? "bg-[#1B2B4B] text-white" : s.status === "rejected" ? "bg-[#0F1A30] text-white" : s.status === "pending" ? "bg-white text-[#1B2B4B] ring-2 ring-[#1B2B4B]" : "bg-[#EEF1F6] text-[#9AA9C3]"}`}>
            {s.status === "rejected" ? "✕" : String(s.name || "?").slice(0, 1)}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function Viewer({ d, me, staff, company, onClose, onRedraft }) {
  const form = formOf(d.form);
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const paperRef = React.useRef(null);
  const turn = myTurn(d, me.uid);
  const mine = d.drafterUid === me.uid;
  const anyApproved = (d.line || []).some((s) => s.status === "approved");
  React.useEffect(() => {
    if (mine && d.status === "rejected" && !(d.seenBy || []).includes(me.uid)) updateDoc(doc(db, "approvals", d.id), { seenBy: arrayUnion(me.uid) }).catch(() => {});
  }, [d, mine, me.uid]);

  const act = async (kind) => {
    if (kind === "reject" && !comment.trim()) { window.alert("반려 사유를 적어 주세요."); return; }
    if (!window.confirm(kind === "approve" ? "승인할까요?" : kind === "reject" ? "반려할까요?" : kind === "withdraw" ? "결재를 회수할까요? (아직 아무도 승인하지 않은 문서만)" : "의견을 남길까요?")) return;
    setBusy(true);
    try {
      const line = (d.line || []).map((s) => ({ ...s }));
      const i = d.step || 0;
      const h = { at: Date.now(), uid: me.uid, name: me.name, action: { approve: "승인", reject: "반려", withdraw: "회수", comment: "의견" }[kind], comment: comment.trim() };
      const patch = { updatedAt: serverTimestamp(), history: arrayUnion(h) };
      if (kind === "approve") {
        line[i] = { ...line[i], status: "approved", at: Date.now(), comment: comment.trim() };
        const next = i + 1 < line.length ? i + 1 : -1;
        if (next >= 0) line[next] = { ...line[next], status: "pending" };
        Object.assign(patch, { line, step: next >= 0 ? next : i, status: next >= 0 ? "pending" : "approved" });
        await updateDoc(doc(db, "approvals", d.id), patch);
        const nd = { ...d, line };
        if (next >= 0) notify(company, me.name, [line[next]], `[결재 요청] ${d.title}`, `${d.drafter?.name}님이 올린 문서가 ${me.name}님 승인 후 결재 차례가 되었습니다.\n\n${docBrief(nd)}`);
        else {
          notify(company, me.name, [{ uid: d.drafterUid, name: d.drafter?.name }], `[결재 완료] ${d.title}`, `문서가 최종 승인되었습니다.\n\n${docBrief(nd)}`);
          notify(company, me.name, d.cc || [], `[결재 참조] ${d.title}`, `참조자로 지정된 문서가 최종 승인되었습니다.\n\n${docBrief(nd)}`);
        }
      } else if (kind === "reject") {
        line[i] = { ...line[i], status: "rejected", at: Date.now(), comment: comment.trim() };
        Object.assign(patch, { line, status: "rejected" });
        await updateDoc(doc(db, "approvals", d.id), patch);
        notify(company, me.name, [{ uid: d.drafterUid, name: d.drafter?.name }], `[반려] ${d.title}`, `${me.name}님이 문서를 반려했습니다.\n반려 사유: ${comment.trim()}\n\n${docBrief(d)}`);
      } else if (kind === "withdraw") {
        Object.assign(patch, { status: "withdrawn" });
        await updateDoc(doc(db, "approvals", d.id), patch);
      } else {
        await updateDoc(doc(db, "approvals", d.id), patch);
      }
      setComment("");
    } catch (e) { window.alert(`처리 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const print = async () => {
    const canvas = await html2canvas(paperRef.current, { scale: 2, backgroundColor: "#ffffff" });
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    w.document.write(`<html><head><title>${d.docNo}</title><style>body{margin:0}img{width:100%}</style></head><body><img src="${canvas.toDataURL("image/png")}"><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
    w.document.close();
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000000] bg-[#0F1A30]/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-[1280px] h-[92vh] bg-[#F4F6FA] rounded-[24px] overflow-hidden flex shadow-[0_24px_60px_rgba(15,26,48,0.4)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex-1 overflow-auto p-6 bg-[#E9EDF3]">
          <ApprovalPaper paperRef={paperRef} form={form} data={d.data} title={d.title} line={d.line} cc={d.cc} drafter={d.drafter} docNo={d.docNo} createdMs={toMs(d.createdAt)} staff={staff} status={d.status} />
          {(d.images || []).length > 0 && (
            <div className="max-w-[780px] mx-auto mt-4 bg-white rounded-2xl p-4">
              <div className="text-[12.5px] font-black text-[#7A879C] mb-2">첨부 {d.images.length}장</div>
              <div className="grid grid-cols-3 gap-2">{d.images.map((src, i) => <a key={i} href={src} target="_blank" rel="noreferrer"><img src={src} alt="" className="w-full h-40 object-cover rounded-xl border border-[#E3E8F0]" /></a>)}</div>
            </div>
          )}
        </div>
        <aside className="w-[360px] shrink-0 bg-white border-l border-[#E3E8F0] flex flex-col">
          <div className="px-5 py-4 border-b border-[#EEF1F6] flex items-center gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold tracking-[0.2em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>{d.docNo}</div>
              <div className="text-[16px] font-black text-[#0F1A30] truncate">{d.title}</div>
            </div>
            <button type="button" onClick={onClose} className="ml-auto w-9 h-9 rounded-xl hover:bg-[#F5F8FD] text-[#7A879C] shrink-0">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="rounded-2xl p-4 text-white" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>
              <div className="text-[12px] font-bold text-white/60">{d.formLabel} · {d.drafter?.name} {d.drafter?.position}</div>
              <div className="text-[20px] font-black mt-0.5">{STATUS[d.status]}{d.status === "pending" && d.line?.[d.step] ? ` · ${d.line[d.step].name} 차례` : ""}</div>
              {(d.amount > 0 || d.days > 0) && <div className="text-[13px] font-bold text-white/80 mt-1">{d.days > 0 ? `${d.days}일` : ""}{d.days > 0 && d.amount > 0 ? " · " : ""}{d.amount > 0 ? fmtWon(d.amount) : ""}</div>}
              <div className="mt-3"><Progress d={d} /></div>
            </div>
            {turn && (
              <div className="rounded-2xl border-2 border-[#1B2B4B] p-4 space-y-2.5">
                <div className="text-[14px] font-black text-[#0F1A30]">내 결재 차례입니다</div>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="결재 의견 (반려할 때는 꼭 적어 주세요)" className={`${inp} h-auto py-2`} />
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => act("reject")} className="flex-1 h-11 rounded-xl border border-[#0F1A30] text-[#0F1A30] text-[14px] font-black disabled:opacity-50">반려</button>
                  <button type="button" disabled={busy} onClick={() => act("approve")} className="flex-[1.6] h-11 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-50">{(d.line[d.step]?.kind || "결재") === "합의" ? "합의" : "승인"}</button>
                </div>
              </div>
            )}
            {!turn && d.status === "pending" && (
              <div className="space-y-2">
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="의견 남기기" className={`${inp} h-auto py-2`} />
                <button type="button" disabled={busy || !comment.trim()} onClick={() => act("comment")} className="w-full h-10 rounded-xl border border-[#DCE3EE] text-[13px] font-bold text-[#3A4A66] disabled:opacity-40">의견 등록</button>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {mine && d.status === "pending" && !anyApproved && <button type="button" disabled={busy} onClick={() => act("withdraw")} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#3A4A66]">회수</button>}
              {mine && ["rejected", "withdrawn"].includes(d.status) && <button type="button" onClick={() => onRedraft(d)} className="h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black">재기안</button>}
              {mine && d.status === "approved" && <button type="button" onClick={() => onRedraft({ ...d, id: null })} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#3A4A66]">복사해서 새로 쓰기</button>}
              <button type="button" onClick={print} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#3A4A66]">인쇄</button>
            </div>
            <div>
              <div className="text-[12.5px] font-black text-[#0F1A30] mb-2">결재 이력</div>
              <div className="relative pl-4 space-y-3 before:absolute before:left-[5px] before:top-1 before:bottom-1 before:w-[2px] before:bg-[#E3E8F0]">
                {(d.history || []).map((h, i) => (
                  <div key={i} className="relative">
                    <span className={`absolute -left-4 top-1 w-3 h-3 rounded-full ring-2 ring-white ${h.action === "반려" ? "bg-[#0F1A30]" : h.action === "승인" ? "bg-[#1B2B4B]" : "bg-[#9AA9C3]"}`} />
                    <div className="text-[13px]"><b className="text-[#0F1A30]">{h.name}</b> <span className="font-black text-[#1B2B4B]">{h.action}</span> <span className="text-[11.5px] text-[#9AA9C3]">{new Date(h.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
                    {h.comment && <div className="mt-1 text-[12.5px] text-[#3A4A66] bg-[#F5F8FD] rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">{h.comment}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>, document.body);
}

// ─────────────────────────── 문서 목록 ───────────────────────────
function DocList({ docs, onOpen, empty, uid }) {
  if (docs === null) return <div className="py-16 text-center text-[13.5px] text-[#9AA9C3]">불러오는 중…</div>;
  if (!docs.length) return (
    <div className="py-16 text-center">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F5F8FD] flex items-center justify-center text-[#9AA9C3]"><ShellIcon name="file" size={24} /></div>
      <div className="mt-3 text-[13.5px] font-bold text-[#9AA9C3]">{empty}</div>
    </div>
  );
  return (
    <div className="divide-y divide-[#F1F4F9]">
      {docs.map((d) => (
        <button key={d.id} type="button" onClick={() => onOpen(d)} className="w-full text-left px-5 py-3.5 hover:bg-[#F8FAFD] flex items-center gap-4">
          <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}><ShellIcon name={catOf(d.cat).icon} size={18} /></span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black px-1.5 py-0.5 rounded border border-[#0F1A30] text-[#0F1A30] shrink-0">{d.formLabel}</span>
              {myTurn(d, uid) && <span className="text-[11px] font-black px-1.5 py-0.5 rounded bg-[#0F1A30] text-white shrink-0">내 차례</span>}
              <span className="text-[14.5px] font-black text-[#0F1A30] truncate">{d.title}</span>
            </div>
            <div className="text-[12.5px] text-[#7A879C] truncate mt-0.5">{d.summary}</div>
          </div>
          <div className="hidden xl:block text-right shrink-0 w-[120px]">
            <div className="text-[13px] font-bold text-[#3A4A66]">{d.drafter?.name} {d.drafter?.position}</div>
            <div className="text-[11.5px] text-[#9AA9C3]" style={{ fontFamily: MONO }}>{ymd(toMs(d.createdAt))}</div>
          </div>
          <div className="shrink-0 w-[150px] flex justify-end"><Progress d={d} /></div>
          <span className={`shrink-0 w-[72px] text-center h-7 leading-7 rounded-full text-[12px] font-black ${d.status === "approved" ? "bg-[#0F1A30] text-white" : d.status === "pending" ? "bg-[#EEF3FB] text-[#1B2B4B]" : "border border-[#DCE3EE] text-[#7A879C]"}`}>{STATUS[d.status]}</span>
        </button>
      ))}
    </div>
  );
}

function Tabs({ tabs, tab, setTab }) {
  return (
    <div className="flex items-center gap-1.5 px-5 pt-4 pb-3 border-b border-[#EEF1F6] overflow-x-auto no-scrollbar">
      {tabs.map(([k, l, n]) => (
        <button key={k} type="button" onClick={() => setTab(k)} className={`h-9 px-4 rounded-full text-[13px] font-black shrink-0 border inline-flex items-center gap-1.5 ${tab === k ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE]"}`}>
          {l}{n > 0 && <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] flex items-center justify-center ${tab === k ? "bg-white text-[#0F1A30]" : "bg-[#EEF1F6] text-[#1B2B4B]"}`}>{n}</span>}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────── 결재선 관리 ───────────────────────────
function LinesPage({ company, me, staff }) {
  const tpls = useLineTemplates(company, me.uid);
  const [edit, setEdit] = React.useState(null); // { id?, name, cats, steps, cc, shared }
  const admin = isAdminRole(me.role);
  const save = async () => {
    if (!edit.name.trim() || !edit.steps.length) { window.alert("이름과 결재자를 정해 주세요."); return; }
    const data = { company, name: edit.name.trim(), cats: edit.cats, steps: edit.steps.map(({ uid, name, position, kind }) => ({ uid, name, position, kind: kind || "결재" })), cc: edit.cc, shared: admin ? !!edit.shared : false, ownerUid: edit.ownerUid || me.uid, ownerName: edit.ownerName || me.name, updatedAt: serverTimestamp() };
    try {
      if (edit.id) await updateDoc(doc(db, "approvalLines", edit.id), data); else await addDoc(collection(db, "approvalLines"), { ...data, createdAt: serverTimestamp() });
      setEdit(null);
    } catch (e) { window.alert(e.message); }
  };
  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "1fr minmax(360px, 440px)" }}>
      <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EEF1F6] flex items-center">
          <div>
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>TEMPLATES</div>
            <div className="text-[16px] font-black text-[#0F1A30]">저장된 결재선 <span className="text-[#9AA9C3] text-[13px]">{tpls.length}</span></div>
          </div>
          <button type="button" onClick={() => setEdit({ name: "", cats: [], steps: suggestLine(staff, me), cc: [], shared: admin })} className="ml-auto h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black">+ 새 결재선</button>
        </div>
        {!tpls.length ? <div className="py-16 text-center text-[13.5px] text-[#9AA9C3]">저장된 결재선이 없습니다. 자주 쓰는 결재 순서를 저장해 두면 문서 작성 때 바로 불러옵니다.</div> : (
          <div className="divide-y divide-[#F1F4F9]">
            {tpls.map((t) => (
              <div key={t.id} className="px-5 py-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {t.shared && <span className="text-[11px] font-black px-1.5 py-0.5 rounded bg-[#0F1A30] text-white">회사 공용</span>}
                    <span className="text-[14.5px] font-black text-[#0F1A30]">{t.name}</span>
                    <span className="text-[12px] text-[#9AA9C3]">{(t.cats || []).map((c) => catOf(c).label).join(" · ") || "모든 문서"}</span>
                  </div>
                  <div className="text-[12.5px] text-[#5B6B85] mt-0.5">{(t.steps || []).map((s) => `${s.name} ${s.position || ""}${s.kind === "합의" ? "(합의)" : ""}`).join(" → ")}{(t.cc || []).length ? ` · 참조 ${t.cc.map((c) => c.name).join(", ")}` : ""}</div>
                </div>
                {(t.ownerUid === me.uid || admin) && (
                  <>
                    <button type="button" onClick={() => setEdit({ ...t, cats: t.cats || [], cc: t.cc || [] })} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-bold text-[#3A4A66]">수정</button>
                    <button type="button" onClick={() => window.confirm("이 결재선을 지울까요?") && deleteDoc(doc(db, "approvalLines", t.id))} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-bold text-[#7A879C]">삭제</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-2xl bg-white border border-[#E3E8F0] p-5 space-y-3.5 h-fit">
        {!edit ? (
          <div className="text-[13.5px] text-[#7A879C] leading-relaxed">
            <div className="text-[16px] font-black text-[#0F1A30] mb-2">결재선이란?</div>
            문서가 거쳐 갈 결재자 순서입니다. <b className="text-[#0F1A30]">결재</b>는 승인·반려 권한, <b className="text-[#0F1A30]">합의</b>는 관련 부서 동의를 받는 단계입니다.
            앞 사람이 승인해야 다음 사람에게 넘어가고, 한 명이라도 반려하면 기안자에게 돌아갑니다. 최종 승인되면 참조자에게도 알림이 갑니다.
            <div className="mt-3 text-[12.5px]">· 관리자는 <b>회사 공용</b> 결재선을 만들어 전 직원이 쓰게 할 수 있습니다.<br />· 문서 작성 화면의 「결재선 불러오기」에서 바로 고릅니다.</div>
          </div>
        ) : (
          <>
            <div className="text-[16px] font-black text-[#0F1A30]">{edit.id ? "결재선 수정" : "새 결재선"}</div>
            <input value={edit.name} onChange={(e) => setEdit((p) => ({ ...p, name: e.target.value }))} placeholder="예) 배차팀 휴가 결재선" className={inp} />
            <div className="flex flex-wrap gap-1.5">
              {APPROVAL_CATS.map((c) => {
                const on = edit.cats.includes(c.key);
                return <button key={c.key} type="button" onClick={() => setEdit((p) => ({ ...p, cats: on ? p.cats.filter((x) => x !== c.key) : [...p.cats, c.key] }))} className={`h-8 px-3 rounded-full text-[12px] font-bold border ${on ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE]"}`}>{c.label}</button>;
              })}
            </div>
            <LineEditor line={edit.steps} setLine={(fn) => setEdit((p) => ({ ...p, steps: typeof fn === "function" ? fn(p.steps) : fn }))} cc={edit.cc} setCc={(fn) => setEdit((p) => ({ ...p, cc: typeof fn === "function" ? fn(p.cc) : fn }))} staff={staff} me={me} company={company} cat={edit.cats[0] || "leave"} />
            {admin && <label className="flex items-center gap-2 text-[13px] font-bold text-[#0F1A30]"><input type="checkbox" checked={!!edit.shared} onChange={(e) => setEdit((p) => ({ ...p, shared: e.target.checked }))} className="w-4 h-4 accent-[#1B2B4B]" />회사 공용으로 공개</label>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setEdit(null)} className="flex-1 h-11 rounded-xl border border-[#DCE3EE] text-[13.5px] font-bold text-[#5B6B85]">취소</button>
              <button type="button" onClick={save} className="flex-[1.5] h-11 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black">저장</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── 메인 ───────────────────────────
//  page: inbox | mine | leave | expense | draft | lines
export default function ApprovalCenter({ company, me, page, setPage }) {
  const staff = useCompanyStaff(company);
  const list = useApprovals(me.uid);
  const [open, setOpen] = React.useState(null);
  const [preset, setPreset] = React.useState(null);
  const [tab, setTab] = React.useState("todo");
  const [companyAll, setCompanyAll] = React.useState(null);
  const admin = isAdminRole(me.role);
  React.useEffect(() => { setTab(page === "mine" ? "all" : "todo"); }, [page]);
  React.useEffect(() => {
    if (!admin || tab !== "company" || !company) return undefined;
    return onSnapshot(query(collection(db, "approvals"), where("company", "==", company)),
      (s) => setCompanyAll(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))), () => setCompanyAll([]));
  }, [admin, tab, company]);
  const meFull = React.useMemo(() => ({ ...me, ...((staff || []).find((u) => u.uid === me.uid) ? { team: (staff || []).find((u) => u.uid === me.uid).team || me.team, position: (staff || []).find((u) => u.uid === me.uid).position || me.position } : {}) }), [me, staff]);
  const cur = open ? ([...(list || []), ...(companyAll || [])].find((x) => x.id === open) || null) : null;

  const L = list || [];
  const uid = me.uid;
  const inLine = (d) => (d.line || []).some((s) => s.uid === uid);
  const sets = {
    todo: L.filter((d) => myTurn(d, uid)),
    progress: L.filter((d) => d.status === "pending" && inLine(d) && !myTurn(d, uid)),
    done: L.filter((d) => d.status === "approved" && inLine(d)),
    rejected: L.filter((d) => d.status === "rejected" && inLine(d)),
    cc: L.filter((d) => (d.ccUids || []).includes(uid)),
    company: companyAll,
  };
  const mineL = L.filter((d) => d.drafterUid === uid);
  const mineSets = { all: mineL, pending: mineL.filter((d) => d.status === "pending"), approved: mineL.filter((d) => d.status === "approved"), rejected: mineL.filter((d) => d.status === "rejected"), withdrawn: mineL.filter((d) => d.status === "withdrawn") };
  const redraft = (d) => { setOpen(null); setPreset({ ...d }); setPage(d.cat); };

  const year = new Date().getFullYear();
  const leaveUsed = mineL.filter((d) => d.status === "approved" && ["annual", "half"].includes(d.form) && String(ymd(toMs(d.createdAt))).startsWith(String(year))).reduce((s, d) => s + (Number(d.days) || 0), 0);
  const spentMonth = mineL.filter((d) => d.status === "approved" && d.cat === "expense" && ymd(toMs(d.createdAt)).slice(0, 7) === ymd().slice(0, 7)).reduce((s, d) => s + (Number(d.amount) || 0), 0);

  const isCat = ["leave", "expense", "draft"].includes(page);
  const cat = isCat ? catOf(page) : null;
  const heroTitle = isCat ? cat.label : page === "inbox" ? "결재함" : page === "mine" ? "내 기안함" : "결재선 관리";
  const heroEn = isCat ? cat.en : page === "inbox" ? "INBOX" : page === "mine" ? "MY DOCUMENTS" : "APPROVAL LINES";
  const heroDesc = isCat ? cat.desc : page === "inbox" ? "내 차례인 문서를 결재하고, 진행·완료된 문서를 확인합니다" : page === "mine" ? "내가 올린 문서의 결재 진행 상황을 봅니다" : "자주 쓰는 결재 순서를 저장해 두고 문서 작성 때 불러옵니다";
  const kpis = isCat
    ? (page === "leave" ? [["올해 사용 휴가", `${leaveUsed}일`], ["진행 중", mineSets.pending.filter((d) => d.cat === "leave").length]] : page === "expense" ? [["이번 달 승인 금액", fmtWon(spentMonth)], ["진행 중", mineSets.pending.filter((d) => d.cat === "expense").length]] : [["진행 중", mineSets.pending.filter((d) => d.cat === "draft").length], ["완료", mineSets.approved.filter((d) => d.cat === "draft").length]])
    : [["결재 대기", sets.todo.length], ["내 진행 문서", mineSets.pending.length], ["반려", mineSets.rejected.length]];

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[22px] px-7 py-5 text-white flex items-center justify-between gap-4 flex-wrap shadow-[0_14px_32px_rgba(15,26,48,0.25)]"
        style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div>
          <div className="text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>E-APPROVAL · {heroEn}</div>
          <div className="text-[24px] font-black mt-0.5">{heroTitle}</div>
          <div className="text-[13px] text-white/60 mt-0.5">{heroDesc}</div>
        </div>
        <div className="flex items-center gap-2.5">
          {kpis.map(([l, v]) => (
            <div key={l} className="min-w-[110px] px-4 py-2.5 rounded-2xl bg-white/[0.07] border border-white/10">
              <div className="text-[11.5px] font-bold text-white/55">{l}</div>
              <div className="text-[20px] font-black tabular-nums" style={{ fontFamily: MONO }}>{v}</div>
            </div>
          ))}
          {!isCat && page !== "lines" && (
            <div className="flex flex-col gap-1.5">
              {APPROVAL_CATS.map((c) => <button key={c.key} type="button" onClick={() => { setPreset(null); setPage(c.key); }} className="h-8 px-3 rounded-lg bg-white text-[#0F1A30] text-[12px] font-black inline-flex items-center gap-1.5"><ShellIcon name={c.icon} size={13} />{c.label}</button>)}
            </div>
          )}
        </div>
      </div>

      {isCat && (
        <>
          <Composer key={`${page}-${preset?.id || "new"}`} company={company} me={meFull} staff={staff} cat={page} preset={preset?.cat === page ? preset : null}
            onDone={() => { setPreset(null); setPage("mine"); }} />
        </>
      )}

      {page === "inbox" && (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
          <Tabs tab={tab} setTab={setTab} tabs={[["todo", "결재 대기", sets.todo.length], ["progress", "진행 중", sets.progress.length], ["done", "결재 완료", 0], ["rejected", "반려", 0], ["cc", "참조 문서", 0], ...(admin ? [["company", "회사 전체", 0]] : [])]} />
          <DocList uid={uid} docs={tab === "company" ? companyAll : (list === null ? null : sets[tab] || [])} onOpen={(d) => setOpen(d.id)} empty={tab === "todo" ? "결재할 문서가 없습니다" : "문서가 없습니다"} />
        </div>
      )}
      {page === "mine" && (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
          <Tabs tab={tab} setTab={setTab} tabs={[["all", "전체", mineSets.all.length], ["pending", "진행 중", mineSets.pending.length], ["approved", "완료", 0], ["rejected", "반려", mineSets.rejected.length], ["withdrawn", "회수", 0]]} />
          <DocList uid={uid} docs={list === null ? null : mineSets[tab] || []} onOpen={(d) => setOpen(d.id)} empty="올린 문서가 없습니다. 위 버튼으로 새 문서를 작성하세요." />
        </div>
      )}
      {page === "lines" && <LinesPage company={company} me={meFull} staff={staff} />}

      {cur && <Viewer d={cur} me={meFull} staff={staff} company={company} onClose={() => setOpen(null)} onRedraft={redraft} />}
    </div>
  );
}

export { APPROVAL_FORMS };
