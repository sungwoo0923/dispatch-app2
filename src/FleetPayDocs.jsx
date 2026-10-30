// ======================= src/FleetPayDocs.jsx =======================
// 💸 지입차관리 › 정산관리 "일괄 지급명세서" + 🧾 "과태료·사고 서류"
//
// [일괄 지급명세서] 70명이어도 한 화면에서 끝낸다
//  ① 기간을 고르면 지입·직영 기사님별로 운행 건수·운임이 자동 집계된다(기사운임 기준, 취소·0원 제외)
//  ② 공제는 드롭다운으로 항목(지입료·세금·과태료·보험료 할증 등)을 골라 금액 입력 — 공통 공제는 모두에게, 기사님별 공제는 [공제] 버튼
//  ③ 과태료 서류에서 "기사 부담(지급액 공제)"로 만든 건은 해당 기간 공제에 자동으로 들어가고, 발송하면 "납부 완료"로 바뀐다
//  ④ 미리보기는 ‹ › 로 다음 기사님으로 넘기며 확인, [선택 일괄 발송]으로 기사앱 서류함에 한 번에 보낸다(같은 기간은 덮어씀)
//  ⑤ 은행 대량이체용 엑셀(은행·계좌·예금주·금액·메모) — 인터넷뱅킹 "다건 이체"에 그대로 올린다
//
// [과태료·사고 서류] 회사로 날아온 과태료·범칙금·사고·보험 할증 우편을 서류로 만든다
//  F4 = 서류 작성 · 고지서 자동 스캔(사진/Ctrl+V) → 칸 자동 채움 · 기사앱에서 열면 "기사 확인" → 기사님이 [납부 완료]/[이의 신청]
import React from "react";
import { kpConfirm, kpAlert } from "./kpDialog";
import { collection, doc, onSnapshot, query, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, where, writeBatch } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db, auth } from "./firebase";
import { StatementDoc, PenaltyDoc, ImageViewer, PENALTY_KINDS, PENALTY_PAYERS, won, MONO, acctLine } from "./driverDocs";
import { validateAccount, formatAccount } from "./bankUtil";
import { compressImage } from "./InternalMail";
import CustomDatePicker from "./CustomDatePicker";
import { CustomSelect } from "./CustomSelect";
import { TimeSelect, korTimeLabel } from "./kpInputs";
import { scanPenaltyImage } from "./penaltyScan";

const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const CANCELED = ["배차취소", "취소", "오더취소", "취소됨"];
const ymOf = (d) => String(d || "").slice(0, 7);
const monthRange = (ym) => { const [y, m] = ym.split("-").map(Number); const last = new Date(y, m, 0).getDate(); return [`${ym}-01`, `${ym}-${String(last).padStart(2, "0")}`]; };
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const prevYm = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const me = () => auth.currentUser?.email || "직원";
const digits = (v) => String(v || "").replace(/\D/g, "");
const fmtBiz = (v) => { const d = digits(v); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d; };
const fmtTs = (v) => { const ms = v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0; if (!ms) return ""; const s = new Date(ms + 9 * 3600e3).toISOString(); return `${s.slice(5, 10).replace("-", ".")} ${s.slice(11, 16)}`; };

export const DED_KINDS = ["지입료", "관리비", "보험료", "보험료 할증", "할부금", "유류 선지급", "세금", "원천세 3.3%", "과태료", "범칙금", "통행료", "사고 처리비", "기타"];
export const PENALTY_STATUSES = ["접수", "기사 확인", "납부 완료", "이의 신청", "취소"];

const card = "rounded-[18px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_rgba(16,24,40,0.05)]";
const inp = "h-11 px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15";
const btnL = "h-11 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD] whitespace-nowrap disabled:opacity-40";
const btnD = "h-11 px-5 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black whitespace-nowrap disabled:opacity-40";
const TH = "px-3 py-3.5 text-left text-[13.5px] font-black whitespace-nowrap";
const TD = "px-3 py-3 text-[14px] whitespace-nowrap";
const Chip = ({ children, dark, soft }) => <span className={`inline-flex items-center h-7 px-2.5 rounded-lg text-[12.5px] font-black whitespace-nowrap ${dark ? "bg-[#0F1A30] text-white" : soft ? "bg-[#F3F6FA] text-[#7A89A3] border border-[#E3E8F0]" : "bg-[#EEF3FC] text-[#1B2B4B] border border-[#C9D6EE]"}`}>{children}</span>;
const Label = ({ children, sub }) => <div className="text-[13px] font-black text-[#3A4A66] mb-1.5 whitespace-nowrap">{children}{sub && <span className="ml-1.5 text-[12px] font-semibold text-[#9AA9C3]">{sub}</span>}</div>;

function Hero({ en, title, desc, children }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] px-7 py-6 text-white flex items-center justify-between gap-4 flex-wrap mb-4"
      style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
      <div className="min-w-0">
        <div className="text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{en}</div>
        <div className="text-[25px] font-black">{title}</div>
        <div className="text-[13.5px] text-white/65">{desc}</div>
      </div>
      {children}
    </div>
  );
}
const Stat = ({ k, v }) => (
  <div className="px-4 py-2 rounded-xl bg-white/[0.07] border border-white/10 whitespace-nowrap"><div className="text-[11.5px] font-bold text-white/55">{k}</div><div className="text-[18px] font-black tabular-nums" style={{ fontFamily: MONO }}>{v}</div></div>
);

function useCompanyDoc(col, id) {
  const [v, setV] = React.useState({});
  React.useEffect(() => (id ? onSnapshot(doc(db, col, id), (s) => setV(s.exists() ? s.data() : {}), () => setV({})) : undefined), [col, id]);
  return v;
}

// ───────── 공제 편집(드롭다운으로 항목 고르고 금액) ─────────
function DeductionEditor({ title, sub, value = [], gross = 0, onSave, onClose }) {
  const [list, setList] = React.useState(() => (value.length ? value.map((d) => ({ kind: DED_KINDS.includes(d.label) ? d.label : "기타", label: d.label, amount: String(d.amount || "") })) : [{ kind: "지입료", label: "지입료", amount: "" }]));
  const upd = (i, patch) => setList((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const autoAmt = (kind) => (kind === "원천세 3.3%" && gross ? String(Math.round(gross * 0.033)) : "");
  const total = list.reduce((s, d) => s + toInt(d.amount), 0);
  return (
    <div className="fixed inset-0 z-[99995] bg-[#0B1428]/55 flex items-center justify-center p-4">
      <div className="w-full max-w-[640px] rounded-[22px] bg-white overflow-hidden shadow-2xl">
        <div className="px-6 py-5 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
          <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>DEDUCTIONS</div>
          <div className="text-[20px] font-black">{title}</div>
          {sub && <div className="text-[13px] text-white/65">{sub}</div>}
        </div>
        <div className="p-6 space-y-2 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-[44px_190px_minmax(0,1fr)_160px_40px] gap-2 text-[12.5px] font-black text-[#7A89A3] px-1"><span>순번</span><span>공제 항목</span><span>내용(선택)</span><span className="text-right">금액</span><span /></div>
          {list.map((d, i) => (
            <div key={i} className="grid grid-cols-[44px_190px_minmax(0,1fr)_160px_40px] gap-2 items-center">
              <span className="text-[14px] font-black text-[#5B6B85] text-center tabular-nums" style={{ fontFamily: MONO }}>{i + 1}</span>
              <CustomSelect value={d.kind} onChange={(e) => { const k = e.target.value; upd(i, { kind: k, label: k === "기타" ? "" : k, amount: d.amount || autoAmt(k) }); }} className={`${inp} w-full`}>
                {DED_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </CustomSelect>
              <input value={d.kind === "기타" ? d.label : d.label === d.kind ? "" : d.label.replace(`${d.kind} `, "")} onChange={(e) => upd(i, { label: d.kind === "기타" ? e.target.value : `${d.kind}${e.target.value ? ` ${e.target.value}` : ""}` })} placeholder={d.kind === "기타" ? "항목 이름" : "예: 10월분"} className={`${inp} w-full`} />
              <input inputMode="numeric" value={d.amount ? toInt(d.amount).toLocaleString() : ""} onChange={(e) => upd(i, { amount: e.target.value.replace(/[^\d]/g, "") })} placeholder="0" className={`${inp} w-full text-right tabular-nums`} style={{ fontFamily: MONO }} />
              <button type="button" onClick={() => setList((p) => p.filter((_, j) => j !== i))} className="w-10 h-10 rounded-xl text-[#9AA9C3] hover:bg-[#F5F8FD] text-[15px]" aria-label="항목 삭제">✕</button>
            </div>
          ))}
          <button type="button" onClick={() => setList((p) => [...p, { kind: "세금", label: "세금", amount: "" }])} className="w-full h-11 rounded-xl border-2 border-dashed border-[#C9D2E0] text-[14px] font-black text-[#5B6B85] hover:bg-[#F7F9FC]">+ 공제 항목 추가</button>
        </div>
        <div className="px-6 py-4 border-t border-[#E3E8F0] flex items-center gap-2">
          <div className="text-[14px] font-bold text-[#5B6B85]">합계 <b className="text-[18px] text-[#0B1428] tabular-nums" style={{ fontFamily: MONO }}>{won(total)}</b>원</div>
          <button type="button" onClick={onClose} className={`${btnL} ml-auto`}>취소</button>
          <button type="button" onClick={() => onSave(list.filter((d) => (d.label || d.kind) && toInt(d.amount)).map((d) => ({ label: (d.label || d.kind).trim(), amount: toInt(d.amount) })))} className={btnD}>저장</button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════ 일괄 지급명세서 ═════════════════════
const penForDriver = (p, d) => p.driverKey === d.id || p.driverId === d.id || (d.appUid && p.driverId === d.appUid);
export function BatchStatementsPanel({ drivers = [], dispatchData = [], companyName = "", supplier = {} }) {
  const co = String(companyName || "").trim();
  const [ym, setYm] = React.useState(prevYm());
  const [from, to] = monthRange(ym);
  const settings = useCompanyDoc("companySettings", co);
  const defDeds = (settings.statementDeductions || []).filter((d) => d.label);
  const [dedEdit, setDedEdit] = React.useState(null); // { key:"__common__" | driverKey, title, value, gross }
  const [vatMode, setVatMode] = React.useState("biz");
  const draftKey = `kpStmtDraft_${co}_${ym}`;
  const [edits, setEdits] = React.useState({}); // { driverKey: [{label, amount}] }
  React.useEffect(() => { try { setEdits(JSON.parse(localStorage.getItem(draftKey) || "{}")); } catch { setEdits({}); } }, [draftKey]);
  const saveEdits = (next) => { setEdits(next); try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch { /* 저장 불가 */ } };
  const [sel, setSel] = React.useState(new Set());
  const [preview, setPreview] = React.useState(null);
  const [sent, setSent] = React.useState({});
  const [penalties, setPenalties] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(query(collection(db, "driverStatements"), where("companyName", "==", co), where("period", "==", ym)), (s) => {
      const m = {}; s.docs.forEach((d) => { m[d.data().driverKey || d.data().driverId] = { id: d.id, ...d.data() }; }); setSent(m);
    }, () => setSent({}));
  }, [co, ym]);
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(query(collection(db, "fleetPenalties"), where("companyName", "==", co)), (s) => setPenalties(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setPenalties([]));
  }, [co]);

  const rows = React.useMemo(() => drivers.map((d) => {
    const plate = String(d.차량번호 || "").trim(); const name = String(d.이름 || "").trim();
    const trips = (dispatchData || []).filter((r) => {
      const rp = String(r.차량번호 || "").trim(); const rn = String(r.이름 || "").trim();
      if (!((plate && plate !== "-" && rp === plate) || ((!plate || plate === "-") && name && rn === name))) return false;
      if (CANCELED.includes(r.배차상태 || "") || CANCELED.includes(r.상태 || "")) return false;
      const day = r.상차일 || ""; if (day < from || day > to) return false;
      return toInt(r.기사운임) > 0;
    }).sort((a, b) => String(a.상차일).localeCompare(String(b.상차일)))
      .map((r) => ({ date: r.상차일 || "", client: r.거래처명 || "", from: r.상차지명 || "", to: r.하차지명 || "", fare: toInt(r.기사운임) }));
    const gross = trips.reduce((s, t) => s + t.fare, 0);
    const vat = vatMode === "biz" && d.사업자번호 ? Math.round(gross * 0.1) : 0;
    // 기사 부담(공제) 과태료 — 이의 신청·취소는 빼고, 다른 달에 이미 정산된 건도 뺀다
    const penList = penalties.filter((p) => penForDriver(p, d) && String(p.payer || "").startsWith("기사 부담") && (p.deductPeriod || ymOf(p.date)) === ym
      && !["취소", "이의 신청"].includes(p.status) && !(p.status === "납부 완료" && p.settledPeriod && p.settledPeriod !== ym) && !(p.status === "납부 완료" && !p.settledPeriod));
    const pen = penList.map((p) => ({ label: `${p.kind || "과태료"} ${p.date || ""}`.trim(), amount: toInt(p.amount) }));
    const perDriver = (d.공제항목 || []).filter((x) => x.label);
    const extra = (edits[d.id] || []).filter((x) => x.label && toInt(x.amount));
    const deductions = [...defDeds, ...perDriver, ...pen, ...extra].map((x) => ({ label: x.label, amount: toInt(x.amount) }));
    const deductTotal = deductions.reduce((s, x) => s + x.amount, 0);
    const bankCheck = d.정산계좌?.acct ? validateAccount(d.정산계좌.bank, d.정산계좌.acct) : { ok: false, level: "error", msg: "계좌 미등록" };
    return {
      key: d.id, d, trips, gross, vat, deductions, deductTotal, extra, penIds: penList.map((p) => p.id), net: gross + vat - deductTotal, bankCheck,
      st: { companyName: co, driverId: d.appUid || d.id, driverKey: d.id, driverName: name, carNo: plate, phone: d.전화번호 || "", period: ym, from, to, trips, gross, vat, deductions, deductTotal, net: gross + vat - deductTotal, bank: d.정산계좌 || null, bizNo: d.사업자번호 || "", bizName: d.사업자상호 || "" },
    };
  }).filter((r) => r.trips.length || r.deductTotal), [drivers, dispatchData, from, to, ym, vatMode, penalties, edits, JSON.stringify(defDeds), co]); // eslint-disable-line react-hooks/exhaustive-deps

  const qq = q.replace(/\s/g, "");
  const shown = rows.filter((r) => !qq || `${r.d.이름}${r.d.차량번호}${r.d.전화번호}${r.d.사업자상호 || ""}`.replace(/\s/g, "").includes(qq));
  const totals = shown.reduce((a, r) => ({ n: a.n + r.trips.length, gross: a.gross + r.gross, vat: a.vat + r.vat, net: a.net + r.net, ded: a.ded + r.deductTotal }), { n: 0, gross: 0, vat: 0, net: 0, ded: 0 });
  const allOn = shown.length > 0 && shown.every((r) => sel.has(r.key));
  const toggle = (k) => setSel((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const sendSelected = async (keys) => {
    const list = rows.filter((r) => keys.has(r.key));
    if (!list.length) return kpAlert("보낼 기사님을 선택해 주세요.");
    const noApp = list.filter((r) => !r.d.appUid).length;
    const penCnt = list.reduce((s, r) => s + r.penIds.length, 0);
    if (!await kpConfirm(`${ym} 지급명세서를 ${list.length}명에게 발송할까요?\n${noApp ? `기사앱 미가입 ${noApp}명은 저장만 되고, 가입하면 서류함에서 보입니다.\n` : ""}${penCnt ? `지급액에서 공제한 과태료 ${penCnt}건은 "납부 완료"로 바뀝니다.\n` : ""}같은 기간에 이미 보낸 명세서는 새 내용으로 바뀝니다.`, { title: "지급명세서 발송", okText: "발송" })) return;
    setBusy(true);
    try {
      const ops = [];
      list.forEach((r) => {
        ops.push([doc(db, "driverStatements", `${r.key}_${ym}`), { ...r.st, status: "sent", sentAt: serverTimestamp(), sentBy: me(), readAt: null, confirmedAt: null }, false]);
        r.penIds.forEach((id) => ops.push([doc(db, "fleetPenalties", id), { status: "납부 완료", settledBy: "지급액 공제", settledPeriod: ym, paidAt: serverTimestamp() }, true]));
      });
      for (let i = 0; i < ops.length; i += 400) {
        const b = writeBatch(db);
        ops.slice(i, i + 400).forEach(([ref, data, merge]) => (merge ? b.set(ref, data, { merge: true }) : b.set(ref, data)));
        await b.commit();
      }
      setSel(new Set());
      kpAlert(`${list.length}명에게 발송했습니다.`);
    } catch (e) { kpAlert(`발송 실패: ${e?.message || e}`); } finally { setBusy(false); }
  };

  const bankExcel = () => {
    const list = rows.filter((r) => (sel.size ? sel.has(r.key) : true) && r.net > 0);
    const aoa = [["순번", "은행", "계좌번호", "예금주", "이체금액", "받는분 통장 표시", "내 통장 표시", "기사명", "차량번호", "계좌 확인"]];
    list.forEach((r, i) => {
      const b = r.d.정산계좌 || {};
      aoa.push([i + 1, b.bank || "", b.acct ? formatAccount(b.bank, b.acct) : "", b.holder || "", r.net, `${co.slice(0, 6)} ${ym.slice(5)}월운임`, `${r.d.이름} ${ym.slice(5)}월`, r.d.이름, r.d.차량번호, r.bankCheck.level === "ok" ? "계좌확인완료" : r.bankCheck.msg]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [6, 12, 20, 10, 12, 18, 14, 10, 12, 14].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "대량이체");
    XLSX.writeFile(wb, `대량이체_${co}_${ym}.xlsx`);
  };
  const summaryExcel = () => {
    const aoa = [["순번", "차량번호", "기사명", "전화번호", "사업자번호", "사업자명", "운행건수", "운임합계", "부가세", "공제합계", "공제 내역", "실지급액", "은행", "계좌", "예금주", "발송상태"]];
    rows.forEach((r, i) => { const b = r.d.정산계좌 || {}; aoa.push([i + 1, r.d.차량번호, r.d.이름, r.d.전화번호 || "", fmtBiz(r.d.사업자번호), r.d.사업자상호 || "", r.trips.length, r.gross, r.vat, r.deductTotal, r.deductions.map((x) => `${x.label} ${won(x.amount)}`).join(", "), r.net, b.bank || "", b.acct ? formatAccount(b.bank, b.acct) : "", b.holder || "", sent[r.key]?.status ? ({ sent: "발송", read: "읽음", confirmed: "확인" }[sent[r.key].status] || "발송") : "미발송"]); });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "지급명세 요약");
    XLSX.writeFile(wb, `지급명세요약_${co}_${ym}.xlsx`);
  };
  const onSaveDed = async (list) => {
    if (dedEdit.key === "__common__") await setDoc(doc(db, "companySettings", co), { statementDeductions: list }, { merge: true });
    else saveEdits({ ...edits, [dedEdit.key]: list });
    setDedEdit(null);
  };
  const statusChip = (r) => {
    const s = sent[r.key];
    if (!s) return <Chip soft>미발송</Chip>;
    return <Chip dark={s.status === "confirmed"}>{s.status === "confirmed" ? "확인 완료" : s.status === "read" || s.readAt ? "읽음" : "발송됨"}</Chip>;
  };
  const cur = preview != null ? shown[preview] : null;

  return (
    <div>
      <Hero en="SETTLEMENT · BATCH" title="일괄 지급명세서" desc="기간을 고르면 기사님별 운임·공제·실지급액이 자동 계산됩니다 · 미리보고 한 번에 발송">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" value={ym} onChange={(e) => { setYm(e.target.value); setSel(new Set()); }} className="h-12 px-3.5 rounded-xl bg-white/10 border border-white/20 text-white text-[16px] font-black [color-scheme:dark]" />
          <Stat k="대상 기사님" v={`${rows.length}명`} />
          <Stat k="운행" v={`${totals.n}건`} />
          <Stat k="실지급 합계" v={`${won(totals.net)}원`} />
        </div>
      </Hero>

      <div className={`${card} p-4 mb-3 flex items-center gap-2 flex-wrap`}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="기사명 · 차량번호 · 전화번호 찾기" className={`${inp} w-64`} />
        <div className="inline-flex p-1 rounded-xl bg-[#EEF2F8] gap-1">
          {[["biz", "사업자 기사님 부가세 10%"], ["none", "부가세 없음"]].map(([k, l]) => <button key={k} type="button" onClick={() => setVatMode(k)} className={`h-9 px-3.5 rounded-lg text-[13.5px] font-black whitespace-nowrap ${vatMode === k ? "bg-white text-[#0F1A30] shadow" : "text-[#5B6B85]"}`}>{l}</button>)}
        </div>
        <button type="button" onClick={() => setDedEdit({ key: "__common__", title: "공통 공제", sub: "모든 기사님 명세서에 똑같이 들어갑니다", value: defDeds })} className={btnL}>
          공통 공제 {defDeds.length ? `${defDeds.length}건 · ${won(defDeds.reduce((s, d) => s + toInt(d.amount), 0))}원` : "설정"}
        </button>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-bold text-[#5B6B85] whitespace-nowrap">선택 {sel.size}명</span>
          <button type="button" onClick={() => setPreview(0)} disabled={!shown.length} className={btnL}>미리보기</button>
          <button type="button" onClick={summaryExcel} className={btnL}>요약 엑셀</button>
          <button type="button" onClick={bankExcel} className={btnL} title="인터넷뱅킹 다건이체 업로드용">대량이체 엑셀{sel.size ? "(선택)" : ""}</button>
          <button type="button" onClick={() => sendSelected(sel)} disabled={busy || !sel.size} className={btnL}>{busy ? "발송 중…" : `선택 발송${sel.size ? ` ${sel.size}명` : ""}`}</button>
          <button type="button" onClick={() => sendSelected(new Set(shown.filter((r) => !sent[r.key]).map((r) => r.key)))} disabled={busy || !shown.some((r) => !sent[r.key])} className={btnD} title="아직 안 보낸 기사님 전원에게 한 번에 발송">
            ⇪ 미발송 전체 일괄 발송 {shown.filter((r) => !sent[r.key]).length}명
          </button>
          <button type="button" onClick={() => sendSelected(new Set(shown.map((r) => r.key)))} disabled={busy || !shown.length} className={btnL} title="이미 보낸 기사님도 새 내용으로 다시 보냄">전체 재발송</button>
        </div>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[1680px]">
          <thead>
            <tr className="bg-[#0B1428] text-[#DCE6F7]">
              <th className="w-12 py-3.5"><input type="checkbox" className="w-4 h-4" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(shown.map((r) => r.key)))} /></th>
              {["순번", "차량번호", "기사명", "전화번호", "사업자번호", "사업자명", "정산 계좌", "계좌 확인", "건수", "운임", "부가세", "공제", "실지급액", "상태", ""].map((h, i) => <th key={i} className={`${TH} ${["건수", "운임", "부가세", "공제", "실지급액"].includes(h) ? "text-right" : ""}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.key} className={`border-b border-[#EEF1F6] ${sel.has(r.key) ? "bg-[#EEF3FC]" : i % 2 ? "bg-[#FAFBFD]" : "bg-white"} hover:bg-[#F3F7FD]`}>
                <td className="text-center"><input type="checkbox" className="w-4 h-4" checked={sel.has(r.key)} onChange={() => toggle(r.key)} /></td>
                <td className={`${TD} text-[#7A89A3] font-bold tabular-nums`} style={{ fontFamily: MONO }}>{i + 1}</td>
                <td className={`${TD} font-black text-[#0F1A30]`}>{r.d.차량번호 || "-"}</td>
                <td className={`${TD} font-black text-[#0F1A30]`}>{r.d.이름}{!r.d.appUid && <span className="ml-1.5 text-[11.5px] font-bold text-[#9AA9C3]">앱 미가입</span>}</td>
                <td className={`${TD} tabular-nums text-[#3A4A66]`}>{r.d.전화번호 || "-"}</td>
                <td className={`${TD} tabular-nums text-[#3A4A66]`}>{r.d.사업자번호 ? fmtBiz(r.d.사업자번호) : "-"}</td>
                <td className={`${TD} text-[#3A4A66]`}>{r.d.사업자상호 || "-"}</td>
                <td className={`${TD} font-bold text-[#0F1A30] tabular-nums`}>{r.d.정산계좌?.acct ? acctLine(r.d.정산계좌) : <span className="text-[#9AA9C3]">미등록</span>}</td>
                <td className={TD}>{r.bankCheck.level === "ok" ? <Chip>✓ 계좌확인완료</Chip> : <Chip soft>! {r.bankCheck.msg}</Chip>}</td>
                <td className={`${TD} text-right tabular-nums font-bold`}>{r.trips.length}</td>
                <td className={`${TD} text-right tabular-nums font-bold`} style={{ fontFamily: MONO }}>{won(r.gross)}</td>
                <td className={`${TD} text-right tabular-nums text-[#5B6B85]`} style={{ fontFamily: MONO }}>{r.vat ? won(r.vat) : "-"}</td>
                <td className={`${TD} text-right`}>
                  <button type="button" onClick={() => setDedEdit({ key: r.key, title: `${r.d.이름} 기사님 공제`, sub: `공통·기사관리·과태료 공제는 자동 포함 · 여기서는 이번 달 추가 공제`, value: r.extra, gross: r.gross })}
                    title={r.deductions.map((d) => `${d.label} ${won(d.amount)}`).join("\n") || "공제 추가"}
                    className="h-9 px-3 rounded-lg border border-[#DCE3EE] bg-white hover:bg-[#F5F8FD] text-[14px] font-black tabular-nums text-[#1B2B4B]" style={{ fontFamily: MONO }}>
                    {r.deductTotal ? `-${won(r.deductTotal)}` : "+ 공제"}{r.deductions.length ? <span className="ml-1.5 text-[11.5px] text-[#7A89A3]">{r.deductions.length}건</span> : null}
                  </button>
                </td>
                <td className={`${TD} text-right tabular-nums font-black text-[15.5px] text-[#0B1428]`} style={{ fontFamily: MONO }}>{won(r.net)}</td>
                <td className={TD}>{statusChip(r)}</td>
                <td className={TD}>
                  <button type="button" onClick={() => setPreview(i)} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13.5px] font-black text-[#1B2B4B]">보기</button>
                  <button type="button" onClick={() => sendSelected(new Set([r.key]))} className="ml-1.5 h-9 px-3.5 rounded-lg bg-[#1B2B4B] text-white text-[13.5px] font-black">발송</button>
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={16} className="py-20 text-center text-[15px] font-bold text-[#9AA9C3]">{ym} 기간에 운행한 지입·직영 기사님이 없습니다</td></tr>}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr className="bg-[#F3F6FA] font-black text-[#0F1A30] text-[14.5px]">
                <td /><td colSpan={8} className="px-3 py-3.5">합계 {shown.length}명</td>
                <td className="px-3 text-right tabular-nums">{totals.n}</td>
                <td className="px-3 text-right tabular-nums" style={{ fontFamily: MONO }}>{won(totals.gross)}</td>
                <td className="px-3 text-right tabular-nums" style={{ fontFamily: MONO }}>{won(totals.vat)}</td>
                <td className="px-3 text-right tabular-nums" style={{ fontFamily: MONO }}>-{won(totals.ded)}</td>
                <td className="px-3 text-right tabular-nums text-[16px]" style={{ fontFamily: MONO }}>{won(totals.net)}</td><td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {dedEdit && <DeductionEditor title={dedEdit.title} sub={dedEdit.sub} value={dedEdit.value} gross={dedEdit.gross || 0} onSave={onSaveDed} onClose={() => setDedEdit(null)} />}

      {cur && (
        <div className="fixed inset-0 z-[99990] bg-[#0B1428]/55 flex justify-end">
          <div className="w-full max-w-[1000px] h-full bg-[#F3F6FA] flex flex-col shadow-2xl">
            <div className="px-6 py-4 flex items-center gap-2 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>PREVIEW · {preview + 1} / {shown.length}</div>
                <div className="text-[20px] font-black truncate">{cur.d.이름} · {cur.d.차량번호}</div>
              </div>
              <button type="button" onClick={() => setPreview((p) => Math.max(0, p - 1))} disabled={preview === 0} className="h-11 w-11 rounded-xl bg-white/10 border border-white/20 text-[20px] font-black disabled:opacity-30">‹</button>
              <button type="button" onClick={() => setPreview((p) => Math.min(shown.length - 1, p + 1))} disabled={preview >= shown.length - 1} className="h-11 w-11 rounded-xl bg-white/10 border border-white/20 text-[20px] font-black disabled:opacity-30">›</button>
              <button type="button" onClick={() => setPreview(null)} className="h-11 px-5 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black">닫기</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6"><StatementDoc st={cur.st} supplier={supplier} /></div>
            <div className="px-6 py-4 bg-white border-t border-[#E3E8F0] flex items-center gap-2">
              <label className="flex items-center gap-2 text-[14px] font-bold text-[#1B2B4B]"><input type="checkbox" className="w-4 h-4" checked={sel.has(cur.key)} onChange={() => toggle(cur.key)} />발송 대상에 포함</label>
              <span className="ml-auto">{statusChip(cur)}</span>
              <button type="button" onClick={() => sendSelected(new Set([cur.key]))} className={btnD}>이 기사님에게 발송</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════ 과태료·사고 서류 ═════════════════════
const blank = () => ({ kind: "과태료", date: kstToday(), time: "", place: "", detail: "", agency: "", docNo: "", amount: "", dueDate: "", payer: PENALTY_PAYERS[0], status: "접수", memo: "", photos: [], deductPeriod: "" });
export const penaltySummary = (p) => {
  const d = String(p.detail || "").replace(/\s+/g, " ").trim();
  const km = [...d.matchAll(/(\d{2,3})\s*km/gi)].pop();
  const core = km ? `${km[1]}km/h 주행` : d.slice(0, 18) + (d.length > 18 ? "…" : "");
  const place = String(p.place || "").split(/\s+/).slice(0, 2).join(" ");
  return [p.kind, core, place].filter(Boolean).join(" · ");
};
const normPlate = (v) => String(v || "").replace(/\s/g, "");

export function PenaltyCenter({ drivers = [], companyName = "", supplier = {} }) {
  const co = String(companyName || "").trim();
  const [list, setList] = React.useState([]);
  const [form, setForm] = React.useState(null);
  const [dq, setDq] = React.useState("");
  const [view, setView] = React.useState(null);
  const [viewer, setViewer] = React.useState(null);
  const [fk, setFk] = React.useState("");
  const [fs, setFs] = React.useState("");
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [scan, setScan] = React.useState(null); // { msg, pct } | { done, count }
  const fileRef = React.useRef(null);
  const scanRef = React.useRef(null);
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(query(collection(db, "fleetPenalties"), where("companyName", "==", co)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => `${b.date || ""}${b.time || ""}`.localeCompare(`${a.date || ""}${a.time || ""}`))), () => setList([]));
  }, [co]);
  // F4 = 서류 작성
  React.useEffect(() => {
    const k = (e) => { if (e.key === "F4") { e.preventDefault(); setForm((f) => f || blank()); setView(null); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const matches = dq.trim() ? drivers.filter((d) => `${d.이름}${d.차량번호}${d.전화번호}`.replace(/\s/g, "").includes(dq.replace(/\s/g, ""))).slice(0, 8) : [];
  const driverPatch = (d) => ({ driverKey: d.id, driverId: d.appUid || d.id, driverName: d.이름, carNo: d.차량번호, phone: d.전화번호 });
  const pickDriver = (d) => { setForm((p) => ({ ...p, ...driverPatch(d) })); setDq(""); };
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // 🔎 고지서 자동 스캔 — 사진을 붙이고 글자를 읽어 칸을 채운다
  const runScan = async (file) => {
    if (!file) return;
    const img = await compressImage(file, 2000, 0.9).catch(() => "");
    if (!img) return;
    setForm((p) => ({ ...(p || blank()), photos: [...((p || {}).photos || []), img].slice(0, 4) }));
    setScan({ msg: "고지서 읽는 중", pct: 0 });
    try {
      const r = await scanPenaltyImage(img, (msg, pct) => setScan({ msg, pct }));
      const f = r.found;
      const drv = f.carNo ? drivers.find((d) => normPlate(d.차량번호).endsWith(f.carNo.slice(-4)) && normPlate(d.차량번호).includes(f.carNo.replace(/^\d{2,3}/, "").slice(0, 1))) || drivers.find((d) => normPlate(d.차량번호) === f.carNo) : null;
      setForm((p) => {
        const n = { ...p };
        ["kind", "date", "time", "place", "detail", "agency", "docNo", "dueDate"].forEach((k) => { if (f[k] && (!p[k] || (k === "date" && p.date === kstToday()) || (k === "kind" && p.kind === "과태료"))) n[k] = f[k]; });
        if (f.amount && !toInt(p.amount)) n.amount = String(f.amount);
        if (drv && !p.driverName) Object.assign(n, driverPatch(drv));
        return n;
      });
      setScan({ done: true, count: r.count, driver: drv?.이름 || "" });
    } catch (e) { setScan({ done: true, count: 0, err: e?.message || String(e) }); }
  };
  React.useEffect(() => {
    if (!form) return undefined;
    const onPaste = (e) => { const it = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith("image/")); if (it) { e.preventDefault(); runScan(it.getAsFile()); } };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [!!form]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!form.driverName) return kpAlert("대상 기사님을 먼저 선택해 주세요.");
    setBusy(true);
    try {
      const data = { ...form, companyName: co, amount: toInt(form.amount), summary: penaltySummary(form), published: true, updatedAt: serverTimestamp() };
      delete data.id;
      if (form.id) await updateDoc(doc(db, "fleetPenalties", form.id), data);
      else await addDoc(collection(db, "fleetPenalties"), { ...data, createdAt: serverTimestamp(), by: me(), readAt: null });
      setForm(null); setScan(null);
    } catch (e) { kpAlert(`저장 실패: ${e?.message || e}`); } finally { setBusy(false); }
  };
  const remove = async (p) => { if (await kpConfirm("이 서류를 삭제할까요?\n기사앱 서류함에서도 사라집니다.", { title: "서류 삭제", okText: "삭제", danger: true })) { await deleteDoc(doc(db, "fleetPenalties", p.id)); setView(null); } };
  const setStatus = async (p, status) => {
    const extra = status === "납부 완료" ? { paidAt: serverTimestamp() } : {};
    await updateDoc(doc(db, "fleetPenalties", p.id), { status, ...extra, updatedAt: serverTimestamp() }).catch((e) => kpAlert(`변경 실패: ${e?.message || e}`));
    setView((v) => (v && v.id === p.id ? { ...v, status } : v));
  };

  const qq = q.replace(/\s/g, "");
  const shown = list.filter((p) => (!fk || p.kind === fk) && (!fs || p.status === fs) && (!qq || `${p.driverName}${p.carNo}${p.phone}${p.detail}${p.place}${p.agency}${p.docNo}${p.kind}`.replace(/\s/g, "").includes(qq)));
  const sum = shown.reduce((s, p) => s + toInt(p.amount), 0);

  if (form) {
    const preview = { ...form, amount: toInt(form.amount), companyName: co, by: me() };
    return (
      <div>
        <Hero en="VEHICLE NOTICE · WRITE" title={form.id ? "서류 수정" : "과태료·사고 서류 작성"} desc="고지서를 스캔하면 칸이 자동으로 채워집니다 · Ctrl+V로 캡처를 붙여도 됩니다 · 오른쪽 미리보기 그대로 기사앱에 올라갑니다">
          <div className="flex gap-2">
            <button type="button" onClick={() => scanRef.current?.click()} className="h-12 px-5 rounded-xl bg-white/10 border border-white/25 text-[14.5px] font-black">⌕ 고지서 자동 스캔</button>
            <button type="button" onClick={() => { setForm(null); setScan(null); }} className="h-12 px-5 rounded-xl bg-white/10 border border-white/20 text-[14.5px] font-bold">취소</button>
            <button type="button" onClick={save} disabled={busy} className="h-12 px-6 rounded-xl bg-white text-[#0F1A30] text-[15px] font-black disabled:opacity-50">{busy ? "저장 중…" : "저장 · 기사님에게 공개"}</button>
          </div>
        </Hero>
        <input ref={scanRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; runScan(f); }} />
        {scan && (
          <div className={`${card} px-5 py-3.5 mb-3 flex items-center gap-3`}>
            <span className="text-[11px] font-extrabold tracking-[0.22em] text-[#2D4C82]" style={{ fontFamily: MONO }}>SCAN</span>
            {scan.done ? (
              <span className="text-[14px] font-bold text-[#0F1A30]">{scan.err ? `읽지 못했어요 (${scan.err})` : scan.count ? `${scan.count}개 칸을 채웠어요${scan.driver ? ` · 차량번호로 ${scan.driver} 기사님을 찾았어요` : ""} — 내용을 한 번 확인해 주세요` : "읽은 내용이 없어요. 더 밝고 반듯하게 찍어 주세요"}</span>
            ) : (
              <>
                <span className="text-[14px] font-bold text-[#0F1A30] whitespace-nowrap">{scan.msg}</span>
                <div className="flex-1 h-2 rounded-full bg-[#EEF2F8] overflow-hidden"><div className="h-full bg-[#2D4C82] transition-all" style={{ width: `${scan.pct || 4}%` }} /></div>
                <span className="text-[13px] font-black tabular-nums text-[#5B6B85]" style={{ fontFamily: MONO }}>{scan.pct || 0}%</span>
              </>
            )}
            {scan.done && <button type="button" onClick={() => setScan(null)} className="ml-auto h-9 px-3 rounded-lg text-[13px] font-bold text-[#5B6B85] hover:bg-[#F5F8FD]">닫기</button>}
          </div>
        )}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
          <div className={`${card} p-5 space-y-4`}>
            <div>
              <Label>대상 기사님</Label>
              {form.driverName ? (
                <div className="flex items-center gap-3 rounded-xl border border-[#C9D6EE] bg-[#F3F6FB] px-4 py-3">
                  <span className="w-10 h-10 rounded-xl bg-[#0F1A30] text-white flex items-center justify-center font-black">{String(form.driverName).slice(0, 1)}</span>
                  <div className="min-w-0 flex-1"><div className="text-[15.5px] font-black text-[#0F1A30]">{form.driverName}</div><div className="text-[13px] text-[#5B6B85]">{form.carNo} · {form.phone}</div></div>
                  <button type="button" onClick={() => set("driverName", "")} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13px] font-bold text-[#5B6B85] bg-white">변경</button>
                </div>
              ) : (
                <div className="relative">
                  <input autoFocus value={dq} onChange={(e) => setDq(e.target.value)} placeholder="이름 · 차량번호 · 연락처로 검색" className={`${inp} w-full`} />
                  {matches.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-xl border border-[#DCE3EE] bg-white shadow-xl overflow-hidden">
                      {matches.map((d) => <button key={d.id} type="button" onClick={() => pickDriver(d)} className="w-full text-left px-4 py-3 hover:bg-[#F3F6FA] border-b border-[#EEF1F6] last:border-0 text-[14px]"><b className="text-[#0F1A30]">{d.이름}</b> <span className="text-[13px] text-[#5B6B85]">{d.차량번호} · {d.전화번호}</span></button>)}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><Label>구분</Label>
                <CustomSelect value={form.kind} onChange={(e) => set("kind", e.target.value)} className={`${inp} w-full`}>{PENALTY_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</CustomSelect>
              </label>
              <label className="block"><Label>금액</Label><input inputMode="numeric" value={form.amount ? toInt(form.amount).toLocaleString() : ""} onChange={(e) => set("amount", e.target.value.replace(/[^\d]/g, ""))} placeholder="0" className={`${inp} w-full text-right tabular-nums`} style={{ fontFamily: MONO }} /></label>
              <label className="block"><Label>발생일</Label><CustomDatePicker value={form.date} onChange={(e) => set("date", e.target.value)} className={`${inp} w-full`} showIcon /></label>
              <div><Label>발생 시각</Label><TimeSelect value={form.time} onChange={(v) => set("time", v)} emptyLabel="미상" minuteStep={5} /></div>
              <label className="block col-span-2"><Label>발생 장소</Label><input value={form.place} onChange={(e) => set("place", e.target.value)} placeholder="예: 경부고속도로 서울방향 123km" className={`${inp} w-full`} /></label>
              <label className="block col-span-2"><Label>위반·사고 내용</Label><textarea value={form.detail} onChange={(e) => set("detail", e.target.value)} rows={2} placeholder="예: 제한속도 100km/h 구간 128km/h 주행" className={`${inp} w-full !h-auto py-2.5`} /></label>
              <label className="block"><Label>고지 기관</Label><input value={form.agency} onChange={(e) => set("agency", e.target.value)} placeholder="예: ○○경찰서" className={`${inp} w-full`} /></label>
              <label className="block"><Label>고지서 번호</Label><input value={form.docNo} onChange={(e) => set("docNo", e.target.value)} className={`${inp} w-full`} /></label>
              <label className="block"><Label>납부 기한</Label><CustomDatePicker value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} className={`${inp} w-full`} showIcon /></label>
              <label className="block"><Label>처리 상태</Label>
                <CustomSelect value={form.status} onChange={(e) => set("status", e.target.value)} className={`${inp} w-full`}>{PENALTY_STATUSES.map((k) => <option key={k} value={k}>{k}</option>)}</CustomSelect>
              </label>
              <label className="block col-span-2"><Label>부담 방식</Label>
                <CustomSelect value={form.payer} onChange={(e) => set("payer", e.target.value)} className={`${inp} w-full`}>{PENALTY_PAYERS.map((k) => <option key={k} value={k}>{k}</option>)}</CustomSelect>
              </label>
              {String(form.payer).startsWith("기사 부담") && (
                <div className="col-span-2 flex items-center gap-2 flex-wrap rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3.5 py-2.5">
                  <span className="text-[13px] font-black text-[#3A4A66] whitespace-nowrap">공제할 정산월</span>
                  <input type="month" value={form.deductPeriod || ymOf(form.date)} onChange={(e) => set("deductPeriod", e.target.value)} className={`${inp} !h-10`} />
                  <span className="text-[12.5px] text-[#7A89A3]">지급명세서를 보내면 자동으로 "납부 완료"가 됩니다</span>
                </div>
              )}
            </div>
            <div>
              <Label sub="최대 4장 · Ctrl+V 붙여넣기 가능">고지서·현장 사진</Label>
              <div className="grid grid-cols-4 gap-2">
                {(form.photos || []).map((src, i) => (
                  <div key={i} className="relative aspect-[4/3] rounded-xl overflow-hidden border border-[#DCE3EE] bg-[#F3F6FA]">
                    <img src={src} alt="" className="w-full h-full object-contain" />
                    <button type="button" onClick={() => set("photos", form.photos.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-[#0B1428]/80 text-white text-[12px]" aria-label="사진 삭제">✕</button>
                  </div>
                ))}
                {(form.photos || []).length < 4 && <button type="button" onClick={() => fileRef.current?.click()} className="aspect-[4/3] rounded-xl border-2 border-dashed border-[#C9D2E0] text-[#5B6B85] text-[13.5px] font-bold">+ 사진</button>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={async (e) => { const fl = [...(e.target.files || [])].slice(0, 4 - (form.photos || []).length); e.target.value = ""; const out = await Promise.all(fl.map((f) => compressImage(f, 1600, 0.82))).catch(() => []); set("photos", [...(form.photos || []), ...out].slice(0, 4)); }} />
            </div>
            <label className="block"><Label>기사님에게 남길 말</Label><textarea value={form.memo} onChange={(e) => set("memo", e.target.value)} rows={2} placeholder="예: 이번 달 정산에서 공제됩니다. 이의가 있으면 앱에서 [이의 신청]을 눌러 주세요." className={`${inp} w-full !h-auto py-2.5`} /></label>
          </div>
          <div className="xl:sticky xl:top-3 self-start">
            <div className="text-[11.5px] font-extrabold tracking-[0.22em] text-[#2D4C82] mb-2" style={{ fontFamily: MONO }}>LIVE PREVIEW · 기사앱에 이렇게 보입니다</div>
            <PenaltyDoc p={preview} supplier={supplier} wide onPhoto={(i) => setViewer({ images: form.photos, index: i })} />
          </div>
        </div>
        {viewer && <ImageViewer images={viewer.images} index={viewer.index} onClose={() => setViewer(null)} name="고지서" />}
      </div>
    );
  }

  const cols = ["순번", "발생일시", "구분", "차량번호", "기사명", "전화번호", "내용", "위반·사고 내용", "발생 장소", "고지 기관", "금액", "납부 기한", "부담", "상태", "기사님 확인", "처리 일시"];
  return (
    <div>
      <Hero en="VEHICLE NOTICE" title="과태료 · 사고 서류" desc="회사로 온 과태료·범칙금·사고·보험 할증 우편을 서류로 만들어 기사앱 서류함에 보냅니다 · F4 = 서류 작성">
        <div className="flex items-center gap-2 flex-wrap">
          <Stat k="전체" v={`${list.length}건`} />
          <Stat k="미처리" v={`${list.filter((p) => !["납부 완료", "취소"].includes(p.status)).length}건`} />
          <Stat k="금액 합계" v={`${won(sum)}원`} />
          <button type="button" onClick={() => setForm(blank())} className="h-12 px-6 rounded-xl bg-white text-[#0F1A30] text-[15px] font-black">+ 서류 작성 <span className="ml-1 text-[11.5px] text-[#7A89A3]" style={{ fontFamily: MONO }}>F4</span></button>
        </div>
      </Hero>
      <div className={`${card} p-4 mb-3 flex items-center gap-2 flex-wrap`}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="기사명 · 차량번호 · 내용 · 장소 · 고지서번호 검색" className={`${inp} w-[340px]`} />
        <CustomSelect value={fk} onChange={(e) => setFk(e.target.value)} className={`${inp} w-44`}>
          <option value="">구분 전체</option>{PENALTY_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </CustomSelect>
        <CustomSelect value={fs} onChange={(e) => setFs(e.target.value)} className={`${inp} w-40`}>
          <option value="">상태 전체</option>{PENALTY_STATUSES.map((k) => <option key={k} value={k}>{k}</option>)}
        </CustomSelect>
        <span className="ml-auto text-[14px] font-bold text-[#5B6B85]">{shown.length}건 · <b className="text-[#0B1428] tabular-nums" style={{ fontFamily: MONO }}>{won(sum)}</b>원</span>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[2050px]">
          <thead><tr className="bg-[#0B1428] text-[#DCE6F7]">{cols.map((h) => <th key={h} className={`${TH} ${h === "금액" ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>
            {shown.map((p, i) => (
              <tr key={p.id} onClick={() => setView(p)} className={`border-b border-[#EEF1F6] cursor-pointer ${i % 2 ? "bg-[#FAFBFD]" : "bg-white"} hover:bg-[#EEF3FC]`}>
                <td className={`${TD} text-[#7A89A3] font-bold tabular-nums`} style={{ fontFamily: MONO }}>{i + 1}</td>
                <td className={`${TD} tabular-nums font-bold text-[#0F1A30]`} style={{ fontFamily: MONO }}>{p.date}{p.time ? ` ${p.time}` : ""}</td>
                <td className={TD}><Chip>{p.kind}</Chip></td>
                <td className={`${TD} font-black text-[#0F1A30]`}>{p.carNo || "-"}</td>
                <td className={`${TD} font-black text-[#0F1A30]`}>{p.driverName || "-"}</td>
                <td className={`${TD} tabular-nums text-[#3A4A66]`}>{p.phone || "-"}</td>
                <td className={`${TD} font-bold text-[#1B2B4B]`}>{p.summary || penaltySummary(p)}</td>
                <td className={`${TD} text-[#3A4A66] max-w-[300px] overflow-hidden text-ellipsis`} title={p.detail}>{p.detail || "-"}</td>
                <td className={`${TD} text-[#3A4A66] max-w-[240px] overflow-hidden text-ellipsis`} title={p.place}>{p.place || "-"}</td>
                <td className={`${TD} text-[#3A4A66]`}>{p.agency || "-"}</td>
                <td className={`${TD} text-right font-black tabular-nums`} style={{ fontFamily: MONO }}>{won(p.amount)}</td>
                <td className={`${TD} tabular-nums text-[#3A4A66]`} style={{ fontFamily: MONO }}>{p.dueDate || "-"}</td>
                <td className={`${TD} font-bold text-[#3A4A66]`}>{p.payer}</td>
                <td className={TD}><Chip dark={p.status === "납부 완료"} soft={p.status === "취소"}>{p.status}</Chip></td>
                <td className={`${TD} tabular-nums text-[#3A4A66]`} style={{ fontFamily: MONO }}>{fmtTs(p.confirmedAt || p.readAt) || <span className="text-[#C3CDDD]">-</span>}</td>
                <td className={`${TD} tabular-nums text-[#3A4A66]`} style={{ fontFamily: MONO }}>{p.paidAt ? `납부 ${fmtTs(p.paidAt)}` : p.objectedAt ? `이의 ${fmtTs(p.objectedAt)}` : <span className="text-[#C3CDDD]">-</span>}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={cols.length} className="py-20 text-center text-[15px] font-bold text-[#9AA9C3]">{list.length ? "조건에 맞는 서류가 없습니다" : "등록된 서류가 없습니다 · F4로 바로 작성"}</td></tr>}
          </tbody>
        </table>
      </div>
      {view && (
        <div className="fixed inset-0 z-[99990] bg-[#0B1428]/55 flex justify-end">
          <div className="w-full max-w-[1100px] h-full bg-[#F3F6FA] flex flex-col shadow-2xl">
            <div className="px-6 py-4 flex items-center gap-2 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>VEHICLE NOTICE · {view.status}</div>
                <div className="text-[20px] font-black truncate">{view.kind} · {view.driverName} · {view.carNo}</div>
              </div>
              <CustomSelect value={view.status} onChange={(e) => setStatus(view, e.target.value)} className="h-11 px-3 rounded-xl bg-white/10 border border-white/20 text-white text-[14px] font-black w-36">
                {PENALTY_STATUSES.map((k) => <option key={k} value={k}>{k}</option>)}
              </CustomSelect>
              <button type="button" onClick={() => { setForm({ ...blank(), ...view }); setView(null); }} className="h-11 px-5 rounded-xl bg-white/10 border border-white/20 text-[14px] font-black">수정</button>
              <button type="button" onClick={() => remove(view)} className="h-11 px-5 rounded-xl bg-white/10 border border-white/20 text-[14px] font-black">삭제</button>
              <button type="button" onClick={() => setView(null)} className="h-11 px-5 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black">닫기</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6"><PenaltyDoc p={view} supplier={supplier} wide onPhoto={(i) => setViewer({ images: view.photos, index: i })} /></div>
          </div>
        </div>
      )}
      {viewer && <ImageViewer images={viewer.images} index={viewer.index} onClose={() => setViewer(null)} name="고지서" />}
    </div>
  );
}

export { korTimeLabel };
