// ======================= src/PayrollContracts.jsx =======================
// ⭐ 2026-11-07 직원 근로계약서(급여관리 › 직원 급여 설정 › 직원 고르기 → 근로계약서)
//  1) 계약서 작성(전자결재 › 계약서)에서 저장한 근로계약서(companyContracts, kind "labor") 중 이 직원 이름으로 된 것 → 미리보기 · 인쇄
//  2) 종이 계약서 스캔·PDF 올리기 → Storage payrollDocs/{회사 키}/{uid}/ (급여 담당 + 급여 비밀번호 잠금 해제 동안만 — storage.rules)
//     목록은 payrollEmployees/{회사}__{uid}.contractFiles (급여 문서와 같은 보호)
//  3) 표준 근로계약서(고용노동부 항목) — 직원·급여 설정 값을 채워 바로 인쇄(A4)
import React from "react";
import { arrayRemove, arrayUnion, collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { ref as sRef, uploadBytes, getBlob, deleteObject } from "firebase/storage";
import { db, auth, storage } from "./firebase";
import { LABOR_KINDS, fillVars } from "./contractTemplates";
import { useCompanyRegInfo } from "./companyRegInfo";
import { wonFmt, annualBreakdown } from "./payrollCalc";
import { personName } from "./userNames";
import { kpConfirm } from "./kpDialog";

const safeId = (s) => String(s || "").replace(/[/\s#?[\]]/g, "_").slice(0, 80);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const korDate = (d) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(0, 4)}년 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일` : "");
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const btn = "h-10 px-3.5 rounded-xl text-[14px] font-black whitespace-nowrap disabled:opacity-40";

// 직원·급여 설정 → 표준 근로계약서 칸
export function contractVals({ u = {}, emp = {}, reg = null, company = "", settings = null }) {
  const payType = emp.payType || "monthly";
  const pay = payType === "hourly" ? emp.hourlyWage : payType === "daily" ? emp.dailyWage : payType === "annual" ? annualBreakdown(emp).base : emp.baseMonthly;
  const allow = [
    Number(emp.positionAllow) ? `직책수당 ${wonFmt(emp.positionAllow)}원` : "",
    Number(emp.meal) ? `식대 ${wonFmt(emp.meal)}원(비과세)` : "",
    Number(emp.car) ? `자가운전보조금 ${wonFmt(emp.car)}원(비과세)` : "",
    ...(emp.allowances || []).filter((a) => Number(a.amount)).map((a) => `${a.label} ${wonFmt(a.amount)}원`),
  ].filter(Boolean).join(", ");
  const payDay = Number(settings?.payDay) || 10;
  return {
    갑상호: reg?.name || company, 갑대표: reg?.ceo || "", 갑사업자번호: reg?.bizNo || "", 갑주소: reg?.addr || "", 갑연락처: reg?.phone || "",
    을상호: personName(u) || u.name || "", 을사업자번호: u.birthDate || emp.birthDate || "", 을주소: u.address || u.addr || "", 을연락처: u.phone || u.mobile || "",
    계약일: korDate(u.hireDate), 시작일: korDate(u.hireDate), 종료일: korDate(u.contractEnd || ""),
    근무장소: "본사", 업무: [u.team, u.position].filter(Boolean).join(" · "),
    근로시간: "09:00 ~ 18:00", 휴게: "12:00 ~ 13:00 (1시간)", 근무일: "매주 월~금 (주 5일)", 주휴일: "매주 일요일",
    임금: Number(pay) ? `금 ${wonFmt(pay)}원${payType === "annual" ? ` (연봉 ${wonFmt(emp.annualSalary)}원 ÷ ${emp.annualSeverance ? 13 : 12})` : ""}` : "",
    수당: allow || "없음", 상여: "없음", 급여일: `${settings?.payNextMonth === false ? "매월" : "다음 달"} ${payDay}일 (휴일이면 전날)`,
    지급방법: emp.payAccount?.bank ? `근로자 명의 계좌(${emp.payAccount.bank}) 입금` : "근로자 명의 계좌 입금", 수습: "없음", 갱신: "기간 만료 30일 전 협의", 특약: "없음",
  };
}
export const contractKindOf = (emp = {}) => (emp.payType === "hourly" ? "단시간" : emp.employmentType === "계약직" ? "계약직" : "정규직");

function contractPrintHtml(title, clauses, vals) {
  const body = clauses.map((c) => `<div class="cl">${c.title ? `<b>${esc(fillVars(c.title, vals))}</b>` : ""}<p>${esc(fillVars(c.body, vals))}</p></div>`).join("");
  const box = (role, name, a, b, addr, tel, birth) => `<div class="sg"><div class="r">${role}</div><div>상호·성명 : <b>${esc(name)}</b></div>${birth ? "" : `<div>대 표 자 : ${esc(a)}</div>`}<div>${birth ? "생년월일" : "사업자번호"} : ${esc(b)}</div><div>주 소 : ${esc(addr)}</div><div>연 락 처 : ${esc(tel)}</div><div class="st">(서명 또는 인)</div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:16mm 18mm}body{font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#0B1428;margin:0;font-size:14px;line-height:1.85}
h1{text-align:center;font-size:24px;letter-spacing:.06em;border-bottom:3px double #0F1A30;padding-bottom:14px;margin:0 0 20px}.cl{margin-bottom:10px;page-break-inside:avoid}.cl b{font-size:14.5px}.cl p{margin:2px 0 0;white-space:pre-wrap;text-align:justify}
.dt{text-align:center;margin:18px 0;font-size:15px}.dt b{display:block;font-size:16px;margin-top:6px}.sgs{display:grid;grid-template-columns:1fr 1fr;gap:16px;page-break-inside:avoid}.sg{border:1.5px solid #0F1A30;border-radius:4px;padding:12px 14px;font-size:13.5px}.sg .r{font-weight:900;border-bottom:1px solid #DCE3EE;padding-bottom:4px;margin-bottom:4px}.st{text-align:right;margin-top:8px;font-weight:800}</style></head>
<body><h1>${esc(title)}</h1>${body}<div class="dt">위 계약의 내용을 증명하기 위하여 계약서 2부를 작성하고, 서명 날인 후 각 1부씩 보관한다.<b>${esc(vals.계약일 || "＿＿＿＿년 ＿＿월 ＿＿일")}</b></div>
<div class="sgs">${box("사업주 (갑)", vals.갑상호, vals.갑대표, vals.갑사업자번호, vals.갑주소, vals.갑연락처, false)}${box("근로자 (을)", vals.을상호, "", vals.을사업자번호, vals.을주소, vals.을연락처, true)}</div><script>setTimeout(()=>print(),300)</script></body></html>`;
}
// 계약서 작성 화면에 저장된 값(숫자·날짜 그대로) → 문서 글자
const showVals = (v = {}) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, /^\d{4}-\d{2}-\d{2}$/.test(String(x || "")) ? korDate(x) : ["임금"].includes(k) && /^\d+$/.test(String(x || "")) ? `금 ${wonFmt(x)}원` : x]));
const printHtml = (html) => { const w = window.open("", "_blank"); if (!w) return; w.document.write(html); w.document.close(); };

function useLaborContracts(company) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "companyContracts"), where("companyName", "==", company)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.kind === "labor" && !d.template)), () => setRows([]));
  }, [company]);
  return rows;
}

// 파일 미리보기 창(PDF · 이미지) — 다운로드 주소 대신 규칙을 거치는 getBlob으로 읽는다
function FileViewer({ file, onClose }) {
  const [url, setUrl] = React.useState("");
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    let u = ""; let alive = true;
    getBlob(sRef(storage, file.path)).then((b) => { if (!alive) return; u = URL.createObjectURL(b); setUrl(u); }).catch((e) => setErr(e.code === "storage/unauthorized" ? "급여 잠금이 풀린 동안만 볼 수 있어요" : "파일을 열지 못했어요"));
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [file.path]);
  return (
    <div className="fixed inset-0 z-[100000] bg-[#0F1A30]/55 grid place-items-center p-3" onClick={onClose}>
      <div className="w-full max-w-[980px] h-[88vh] rounded-[22px] bg-white overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 flex items-center gap-2 border-b border-[#EEF1F6]"><b className="text-[15px] text-[#0F1A30] truncate flex-1">{file.name}</b>
          {url && <a href={url} download={file.name} className={`${btn} border border-[#DCE3EE] bg-white text-[#1B2B4B] inline-flex items-center`}>내려받기</a>}
          <button type="button" onClick={onClose} className={`${btn} bg-[#0F1A30] text-white`}>닫기</button></div>
        <div className="flex-1 min-h-0 bg-[#F4F6FA] grid place-items-center">
          {err ? <div className="text-[15px] font-bold text-[#B42318]">{err}</div> : !url ? <div className="text-[15px] font-bold text-[#7A879C]">불러오는 중…</div>
            : /pdf/.test(file.type || "") ? <iframe title={file.name} src={url} className="w-full h-full bg-white" /> : <img src={url} alt={file.name} className="max-w-full max-h-full object-contain" />}
        </div>
      </div>
    </div>
  );
}

export default function PayrollContracts({ company, u, emp = {}, settings = null, canEdit = true, docId }) {
  const reg = useCompanyRegInfo(company);
  const saved = useLaborContracts(company);
  const [view, setView] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const fileRef = React.useRef(null);
  const name = personName(u) || u.name || "";
  const mine = (saved || []).filter((d) => [d.party, d.vals?.을상호].some((x) => String(x || "").trim() && String(x).trim() === String(name).trim()));
  const files = emp.contractFiles || [];
  const kind = contractKindOf(emp);
  const spec = LABOR_KINDS[kind];
  const vals = contractVals({ u, emp, reg, company, settings });
  const missing = [["사업장 주소", vals.갑주소], ["대표자", vals.갑대표], ["생년월일", vals.을사업자번호], ["입사일", vals.시작일], ["임금", vals.임금]].filter(([, v]) => !v).map(([k]) => k);

  const upload = async (f) => {
    if (!f) return;
    setMsg("");
    if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(f.type)) return setMsg("PDF · JPG · PNG 파일만 올릴 수 있어요");
    if (f.size >= 15 * 1048576) return setMsg("15MB보다 작은 파일만 올릴 수 있어요");
    setBusy(true);
    try {
      const path = `payrollDocs/${safeId(company)}/${u.id}/${Date.now()}_${f.name.replace(/[^\w.가-힣-]/g, "_").slice(-80)}`;
      await uploadBytes(sRef(storage, path), f, { contentType: f.type });
      const meta = { name: f.name, path, size: f.size, type: f.type, at: Date.now(), by: auth.currentUser?.email || "", kind: "근로계약서" };
      await setDoc(doc(db, "payrollEmployees", docId), { companyName: company, uid: u.id, contractFiles: arrayUnion(meta), updatedAt: serverTimestamp() }, { merge: true });
      setMsg("올렸어요");
    } catch (e) { setMsg(e.code === "storage/unauthorized" ? "올릴 권한이 없어요. 급여 잠금을 다시 풀어 주세요" : `올리지 못했어요: ${e.message}`); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const remove = async (f) => {
    if (!(await kpConfirm(`「${f.name}」을 지울까요?`))) return;
    setBusy(true);
    try {
      await deleteObject(sRef(storage, f.path)).catch((e) => { if (e.code !== "storage/object-not-found") throw e; });
      await setDoc(doc(db, "payrollEmployees", docId), { contractFiles: arrayRemove(f), updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) { setMsg(`지우지 못했어요: ${e.message}`); } finally { setBusy(false); }
  };

  const item = "flex items-center gap-3 rounded-xl border border-[#E3E8F0] bg-white px-3.5 py-2.5";
  return (
    <div className="space-y-3" data-testid="pay-contracts">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
        <div className="rounded-2xl bg-[#F5F8FD] border border-[#E3E8F0] p-3.5 lg:col-span-1">
          <div className="text-[14px] font-black text-[#3A4A66]">표준 근로계약서</div>
          <div className="mt-0.5 text-[15px] font-black text-[#0F1A30]">{spec.title.replace("표준 근로계약서 ", "")}</div>
          <div className="mt-1 text-[14px] font-bold text-[#5B6B85] leading-relaxed">직원 정보와 급여 설정으로 채워요. 인쇄해서 서명받으세요.</div>
          {missing.length > 0 && <div className="mt-2 text-[14px] font-bold text-[#2D4C82]">비어 있는 칸: {missing.join(" · ")}</div>}
          <button type="button" onClick={() => printHtml(contractPrintHtml(spec.title, spec.clauses, vals))} className={`${btn} mt-2.5 w-full bg-[#0F1A30] text-white`} data-testid="contract-print">계약서 만들기 · 인쇄</button>
        </div>
        <div className="rounded-2xl bg-white border border-[#E3E8F0] p-3.5 lg:col-span-2 min-w-0">
          <div className="flex items-center gap-2"><span className="text-[14px] font-black text-[#3A4A66]">보관된 계약서</span><span className="text-[14px] font-bold text-[#7A879C]">{mine.length + files.length}건</span>
            <span className="flex-1" />
            {canEdit && <><input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-testid="contract-file" />
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={`${btn} border border-[#1B2B4B] bg-white text-[#1B2B4B]`} data-testid="contract-upload">{busy ? "올리는 중…" : "+ 스캔본 올리기"}</button></>}
          </div>
          {msg && <div className="mt-2 text-[14px] font-bold text-[#2D4C82]" role="status">{msg}</div>}
          <div className="mt-2 space-y-1.5">
            {mine.map((d) => (
              <div key={d.id} className={item}>
                <span className="h-7 px-2 rounded-lg bg-[#EEF3FC] text-[#2D4C82] text-[13px] font-black inline-flex items-center">작성</span>
                <span className="flex-1 min-w-0"><span className="block text-[14.5px] font-black text-[#0F1A30] truncate">{d.title}</span><span className="block text-[14px] font-bold text-[#5B6B85]">계약일 {d.contractDate || "-"} · 전자결재 › 계약서에서 저장</span></span>
                <button type="button" onClick={() => printHtml(contractPrintHtml(d.title, d.clauses || [], showVals(d.vals || {})))} className={`${btn} border border-[#DCE3EE] bg-white text-[#1B2B4B]`}>보기 · 인쇄</button>
              </div>
            ))}
            {files.map((f) => (
              <div key={f.path} className={item}>
                <span className="h-7 px-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-black inline-flex items-center">{/pdf/.test(f.type) ? "PDF" : "사진"}</span>
                <span className="flex-1 min-w-0"><span className="block text-[14.5px] font-black text-[#0F1A30] truncate">{f.name}</span><span className="block text-[14px] font-bold text-[#5B6B85]" style={{ fontVariantNumeric: "tabular-nums" }}>{new Date(f.at).toLocaleDateString("ko-KR")} · {kb(f.size || 0)}</span></span>
                <button type="button" onClick={() => setView(f)} className={`${btn} border border-[#DCE3EE] bg-white text-[#1B2B4B]`} data-testid="contract-view">보기</button>
                {canEdit && <button type="button" disabled={busy} onClick={() => remove(f)} aria-label="삭제" className={`${btn} border border-[#DCE3EE] bg-white text-[#5B6B85]`}>삭제</button>}
              </div>
            ))}
            {saved === null ? <div className="py-3 text-[14px] font-bold text-[#7A879C]">불러오는 중…</div> : !mine.length && !files.length && <div className="py-3 text-[14px] font-bold text-[#7A879C]">보관된 근로계약서가 없어요. 표준 계약서를 만들거나 서명한 스캔본을 올려 주세요.</div>}
          </div>
        </div>
      </div>
      {view && <FileViewer file={view} onClose={() => setView(null)} />}
    </div>
  );
}
