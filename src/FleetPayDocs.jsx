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
import { TimeSelect, korTimeLabel, MonthPicker, kstYm } from "./kpInputs";
import { scanPenaltyImage, parsePenaltyText } from "./penaltyScan";
import { savePng as savePngA4, savePdf as savePdfA4, printA4 } from "./a4Export";

const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const CANCELED = ["배차취소", "취소", "오더취소", "취소됨"];
const ymOf = (d) => String(d || "").slice(0, 7);
const monthRange = (ym) => { const [y, m] = ym.split("-").map(Number); const last = new Date(y, m, 0).getDate(); return [`${ym}-01`, `${ym}-${String(last).padStart(2, "0")}`]; };
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
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
//  auto: 자동으로 들어가는 공제(공통·기사관리·과태료) — 읽기 전용으로 함께 보여준다
const kindOfLabel = (label) => DED_KINDS.find((k) => String(label || "").startsWith(k)) || "기타";
function DeductionEditor({ title, sub, value = [], auto = [], gross = 0, onSave, onClose }) {
  const [list, setList] = React.useState(() => (value.length ? value.map((d) => { const kind = kindOfLabel(d.label); return { kind, label: d.label, amount: String(d.amount || "") }; }) : (auto.length ? [] : [{ kind: "지입료", label: "지입료", amount: "" }])));
  const upd = (i, patch) => setList((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const autoAmt = (kind) => (kind === "원천세 3.3%" && gross ? String(Math.round(gross * 0.033)) : "");
  const autoTotal = auto.reduce((s, d) => s + toInt(d.amount), 0);
  const total = autoTotal + list.reduce((s, d) => s + toInt(d.amount), 0);
  const COLS = "grid-cols-[44px_190px_minmax(0,1fr)_160px_40px]";
  return (
    <div className="fixed inset-0 z-[99995] bg-[#0B1428]/55 flex items-center justify-center p-4">
      <div className="w-full max-w-[720px] rounded-[22px] bg-white overflow-hidden shadow-2xl">
        <div className="px-6 py-5 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
          <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>DEDUCTIONS</div>
          <div className="text-[20px] font-black">{title}</div>
          {sub && <div className="text-[13px] text-white/65">{sub}</div>}
        </div>
        <div className="p-6 space-y-2 max-h-[62vh] overflow-y-auto">
          <div className={`grid ${COLS} gap-2 text-[12.5px] font-black text-[#7A89A3] px-1`}><span>순번</span><span>공제 항목</span><span>내용</span><span className="text-right">금액</span><span /></div>
          {auto.map((d, i) => (
            <div key={`a${i}`} className={`grid ${COLS} gap-2 items-center`}>
              <span className="text-[14px] font-black text-[#5B6B85] text-center tabular-nums" style={{ fontFamily: MONO }}>{i + 1}</span>
              <div className={`${inp} w-full flex items-center bg-[#F5F8FD]`}>{d.kind || kindOfLabel(d.label)}</div>
              <div className={`${inp} w-full flex items-center gap-1.5 bg-[#F5F8FD] min-w-0`}><span className="shrink-0 h-6 px-1.5 rounded-md bg-[#0F1A30] text-white text-[11px] font-black inline-flex items-center">{d.src}</span><span className="truncate">{d.memo || d.label}</span></div>
              <div className={`${inp} w-full flex items-center justify-end bg-[#F5F8FD] tabular-nums`} style={{ fontFamily: MONO }}>{won(d.amount)}</div>
              <span className="w-10 h-10 flex items-center justify-center text-[#9AA9C3]" title={d.src === "과태료" ? "과태료·사고 서류에서 수정" : d.src === "공통" ? "[공통 공제]에서 수정" : "기사관리에서 수정"}>■</span>
            </div>
          ))}
          {list.map((d, j) => {
            const i = j;
            return (
              <div key={j} className={`grid ${COLS} gap-2 items-center`}>
                <span className="text-[14px] font-black text-[#5B6B85] text-center tabular-nums" style={{ fontFamily: MONO }}>{auto.length + i + 1}</span>
                <CustomSelect value={d.kind} onChange={(e) => { const k = e.target.value; upd(i, { kind: k, label: k === "기타" ? "" : k, amount: d.amount || autoAmt(k) }); }} className={`${inp} w-full`}>
                  {DED_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </CustomSelect>
                <input value={d.kind === "기타" ? d.label : d.label === d.kind ? "" : String(d.label).replace(`${d.kind} `, "")} onChange={(e) => upd(i, { label: d.kind === "기타" ? e.target.value : `${d.kind}${e.target.value ? ` ${e.target.value}` : ""}` })} placeholder={d.kind === "기타" ? "항목 이름" : "예: 10월분"} className={`${inp} w-full`} />
                <input inputMode="numeric" value={d.amount ? toInt(d.amount).toLocaleString() : ""} onChange={(e) => upd(i, { amount: e.target.value.replace(/[^\d]/g, "") })} placeholder="0" className={`${inp} w-full text-right tabular-nums`} style={{ fontFamily: MONO }} />
                <button type="button" onClick={() => setList((p) => p.filter((_, k) => k !== i))} className="w-10 h-10 rounded-xl text-[#9AA9C3] hover:bg-[#F5F8FD] text-[15px]" aria-label="항목 삭제">✕</button>
              </div>
            );
          })}
          <button type="button" onClick={() => setList((p) => [...p, { kind: "세금", label: "세금", amount: "" }])} className="w-full h-11 rounded-xl border-2 border-dashed border-[#C9D2E0] text-[14px] font-black text-[#5B6B85] hover:bg-[#F7F9FC]">+ 공제 항목 추가</button>
          {auto.length > 0 && <div className="text-[12.5px] text-[#7A89A3] pt-1">■ 자동 공제 — 공통 공제는 [공통 공제], 과태료는 과태료·사고 서류, 기사님 고정 공제는 기사관리에서 고칩니다</div>}
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

// ═════════════════════ 지급명세서 공용 계산(일괄·개별 같은 값) ═════════════════════
const penForDriver = (p, d) => p.driverKey === d.id || p.driverId === d.id || (d.appUid && p.driverId === d.appUid);
const viaNames = (r) => [r.경유지_상차, r.경유지_하차, r.경유상차목록, r.경유하차목록].flatMap((a) => (Array.isArray(a) ? a : [])).map((w) => (w?.업체명 || w?.name || "") + (Number(w?.기사운임) > 0 ? `(${Number(w.기사운임).toLocaleString()})` : "")).filter(Boolean).join(", ");
function useStatements({ drivers, dispatchData, co, ym, vatMode, includeEmpty = false }) {
  const [from, to] = monthRange(ym);
  const settings = useCompanyDoc("companySettings", co);
  const defDeds = (settings.statementDeductions || []).filter((d) => d.label);
  const draftKey = `kpStmtDraft_${co}_${ym}`;
  const [edits, setEdits] = React.useState({});
  React.useEffect(() => { try { setEdits(JSON.parse(localStorage.getItem(draftKey) || "{}")); } catch { setEdits({}); } }, [draftKey]);
  const saveEdits = (next) => { setEdits(next); try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch { /* 저장 불가 */ } };
  const [sent, setSent] = React.useState({});
  const [penalties, setPenalties] = React.useState([]);
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
      // 기사님이 아직 수락하지 않았거나(승인대기) 거절한 오더는 정산에 넣지 않는다
      if (r.배차상태 === "승인대기" || ["대기", "거절"].includes(r.기사확인상태 || "")) return false;
      const day = r.상차일 || ""; if (day < from || day > to) return false;
      return toInt(r.기사운임) > 0;
    }).sort((a, b) => String(a.상차일).localeCompare(String(b.상차일)))
      .map((r) => ({ date: r.상차일 || "", client: r.거래처명 || "", from: r.상차지명 || "", to: r.하차지명 || "", via: viaNames(r), cargo: r.화물내용 || "", ton: r.차량톤수 || r.톤수 || "", fare: toInt(r.기사운임), route: r.고정노선명 || "" }));
    const gross = trips.reduce((s, t) => s + t.fare, 0);
    const vat = vatMode === "biz" && d.사업자번호 ? Math.round(gross * 0.1) : 0;
    // 기사 부담(공제) 과태료 — 이의 신청·취소는 빼고, 다른 달에 이미 정산된 건도 뺀다
    const penList = penalties.filter((p) => penForDriver(p, d) && String(p.payer || "").startsWith("기사 부담") && (p.deductPeriod || ymOf(p.date)) === ym
      && !["취소", "이의 신청"].includes(p.status) && !(p.status === "납부 완료" && p.settledPeriod && p.settledPeriod !== ym) && !(p.status === "납부 완료" && !p.settledPeriod));
    const auto = [
      ...defDeds.map((x) => ({ label: x.label, amount: toInt(x.amount), src: "공통", kind: kindOfLabel(x.label) })),
      ...(d.공제항목 || []).filter((x) => x.label).map((x) => ({ label: x.label, amount: toInt(x.amount), src: "기사관리", kind: kindOfLabel(x.label) })),
      ...penList.map((p) => ({ label: `${p.kind || "과태료"} ${p.date || ""}`.trim(), amount: toInt(p.amount), src: "과태료", kind: DED_KINDS.includes(p.kind) ? p.kind : "과태료", memo: [p.date, p.summary || p.detail || p.place].filter(Boolean).join(" · ") })),
    ];
    const extra = (edits[d.id] || []).filter((x) => x.label && toInt(x.amount));
    const deductions = [...auto, ...extra.map((x) => ({ ...x, src: "추가" }))].map((x) => ({ label: x.label, amount: toInt(x.amount) }));
    const deductTotal = deductions.reduce((s, x) => s + x.amount, 0);
    const bankCheck = d.정산계좌?.acct ? validateAccount(d.정산계좌.bank, d.정산계좌.acct) : { ok: false, level: "error", msg: "계좌 미등록" };
    return {
      key: d.id, d, trips, gross, vat, auto, deductions, deductTotal, extra, penIds: penList.map((p) => p.id), net: gross + vat - deductTotal, bankCheck,
      st: { companyName: co, driverId: d.appUid || d.id, driverKey: d.id, driverName: name, carNo: plate, phone: d.전화번호 || "", period: ym, from, to, trips, gross, vat, deductions, deductTotal, net: gross + vat - deductTotal, bank: d.정산계좌 || null, bizNo: d.사업자번호 || "", bizName: d.사업자상호 || "" },
    };
  }).filter((r) => includeEmpty || r.trips.length || r.deductTotal), [drivers, dispatchData, from, to, ym, vatMode, penalties, edits, JSON.stringify(defDeds), co, includeEmpty]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (list) => {
    if (!list.length) { kpAlert("보낼 기사님을 선택해 주세요."); return false; }
    const noApp = list.filter((r) => !r.d.appUid).length;
    const penCnt = list.reduce((s, r) => s + r.penIds.length, 0);
    if (!await kpConfirm(`${ym} 지급명세서를 ${list.length}명에게 발송할까요?\n${noApp ? `기사앱 미가입 ${noApp}명은 저장만 되고, 가입하면 서류함에서 보입니다.\n` : ""}${penCnt ? `지급액에서 공제한 과태료 ${penCnt}건은 "납부 완료"로 바뀝니다.\n` : ""}같은 기간에 이미 보낸 명세서는 새 내용으로 바뀝니다.`, { title: "지급명세서 발송", okText: "발송" })) return false;
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
      kpAlert(`${list.length}명에게 발송했습니다.`);
      return true;
    } catch (e) { kpAlert(`발송 실패: ${e?.message || e}`); return false; }
  };
  const saveCommon = (list) => setDoc(doc(db, "companySettings", co), { statementDeductions: list }, { merge: true });
  return { rows, sent, defDeds, edits, saveEdits, send, saveCommon, from, to };
}
const StatusChip = ({ s }) => (!s ? <Chip soft>미발송</Chip> : <Chip dark={s.status === "confirmed"}>{s.status === "confirmed" ? "확인 완료" : s.status === "read" || s.readAt ? "읽음" : "발송됨"}</Chip>);
const VatToggle = ({ value, onChange }) => (
  <div className="inline-flex p-1 rounded-xl bg-[#EEF2F8] gap-1">
    {[["biz", "사업자 기사님 부가세 10%"], ["none", "부가세 없음"]].map(([k, l]) => <button key={k} type="button" onClick={() => onChange(k)} className={`h-9 px-3.5 rounded-lg text-[13.5px] font-black whitespace-nowrap ${value === k ? "bg-white text-[#0F1A30] shadow" : "text-[#5B6B85]"}`}>{l}</button>)}
  </div>
);

// ═════════════════════ 일괄 지급명세서 ═════════════════════
export function BatchStatementsPanel({ drivers = [], dispatchData = [], companyName = "", supplier = {} }) {
  const co = String(companyName || "").trim();
  const [ym, setYm] = React.useState(kstYm());
  const [vatMode, setVatMode] = React.useState("biz");
  const { rows, sent, defDeds, edits, saveEdits, send, saveCommon } = useStatements({ drivers, dispatchData, co, ym, vatMode });
  const [dedEdit, setDedEdit] = React.useState(null);
  const [sel, setSel] = React.useState(new Set());
  const [preview, setPreview] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [q, setQ] = React.useState("");

  const qq = q.replace(/\s/g, "");
  const shown = rows.filter((r) => !qq || `${r.d.이름}${r.d.차량번호}${r.d.전화번호}${r.d.사업자상호 || ""}`.replace(/\s/g, "").includes(qq));
  const totals = shown.reduce((a, r) => ({ n: a.n + r.trips.length, gross: a.gross + r.gross, vat: a.vat + r.vat, net: a.net + r.net, ded: a.ded + r.deductTotal }), { n: 0, gross: 0, vat: 0, net: 0, ded: 0 });
  const allOn = shown.length > 0 && shown.every((r) => sel.has(r.key));
  const toggle = (k) => setSel((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const sendSelected = async (keys) => { setBusy(true); const ok = await send(rows.filter((r) => keys.has(r.key))); if (ok) setSel(new Set()); setBusy(false); };

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
  // 📥 엑셀 다운로드 — 시트 3개: 지급 요약 / 운행 내역(전체) / 공제 내역
  const summaryExcel = () => {
    const list = sel.size ? rows.filter((r) => sel.has(r.key)) : shown;
    if (!list.length) { kpAlert("내려받을 기사님이 없습니다."); return; }
    const wb = XLSX.utils.book_new();
    const A = [["순번", "차량번호", "기사명", "등급", "전화번호", "사업자번호", "사업자명", "운행건수", "운임합계", "부가세", "공제합계", "실지급액", "은행", "계좌", "예금주", "계좌확인", "발송상태"]];
    list.forEach((r, i) => { const b = r.d.정산계좌 || {}; A.push([i + 1, r.d.차량번호, r.d.이름, r.d.등급 || "", r.d.전화번호 || "", fmtBiz(r.d.사업자번호), r.d.사업자상호 || "", r.trips.length, r.gross, r.vat, r.deductTotal, r.net, b.bank || "", b.acct ? formatAccount(b.bank, b.acct) : "", b.holder || "", r.bankCheck.level === "ok" ? "계좌확인완료" : r.bankCheck.msg, sent[r.key]?.status ? ({ sent: "발송", read: "읽음", confirmed: "확인" }[sent[r.key].status] || "발송") : "미발송"]); });
    A.push([], ["", "합계", "", "", "", "", "", list.reduce((s, r) => s + r.trips.length, 0), list.reduce((s, r) => s + r.gross, 0), list.reduce((s, r) => s + r.vat, 0), list.reduce((s, r) => s + r.deductTotal, 0), list.reduce((s, r) => s + r.net, 0)]);
    const ws1 = XLSX.utils.aoa_to_sheet(A); ws1["!cols"] = [6, 12, 10, 6, 14, 14, 14, 8, 12, 10, 12, 12, 10, 18, 10, 12, 8].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws1, "지급 요약");
    const B = [["기사명", "차량번호", "순번", "상차일", "거래처", "상차지", "경유(기사운임)", "하차지", "화물", "톤수", "기사운임"]];
    list.forEach((r) => r.trips.forEach((t, i) => B.push([r.d.이름, r.d.차량번호, i + 1, t.date, t.client, t.from, t.via, t.to, t.cargo, t.ton, t.fare])));
    const ws2 = XLSX.utils.aoa_to_sheet(B); ws2["!cols"] = [10, 12, 6, 12, 16, 16, 24, 16, 12, 8, 12].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws2, "운행 내역");
    const C = [["기사명", "차량번호", "공제 항목", "금액"]];
    list.forEach((r) => r.deductions.forEach((d) => C.push([r.d.이름, r.d.차량번호, d.label, d.amount])));
    const ws3 = XLSX.utils.aoa_to_sheet(C); ws3["!cols"] = [10, 12, 24, 12].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws3, "공제 내역");
    XLSX.writeFile(wb, `지입정산_${co}_${ym}${sel.size ? "_선택" : ""}.xlsx`);
  };
  const onSaveDed = async (list) => {
    if (dedEdit.key === "__common__") await saveCommon(list);
    else saveEdits({ ...edits, [dedEdit.key]: list });
    setDedEdit(null);
  };
  const cur = preview != null ? shown[preview] : null;

  return (
    <div>
      <Hero en="SETTLEMENT · BATCH" title="일괄 지급명세서" desc="월을 고르면 기사님별 운임·공제·실지급액이 자동 계산됩니다 · 미리보고 한 번에 발송">
        <div className="flex items-center gap-2 flex-wrap">
          <MonthPicker value={ym} onChange={(v) => { setYm(v); setSel(new Set()); }} dark />
          <button type="button" onClick={summaryExcel} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black whitespace-nowrap">⇩ 엑셀 다운로드</button>
          <Stat k="대상 기사님" v={`${rows.length}명`} />
          <Stat k="운행" v={`${totals.n}건`} />
          <Stat k="실지급 합계" v={`${won(totals.net)}원`} />
        </div>
      </Hero>

      <div className={`${card} p-4 mb-3 flex items-center gap-2 flex-wrap`}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="기사명 · 차량번호 · 전화번호 찾기" className={`${inp} w-64`} />
        <VatToggle value={vatMode} onChange={setVatMode} />
        <button type="button" onClick={() => setDedEdit({ key: "__common__", title: "공통 공제", sub: "모든 기사님 명세서에 똑같이 들어갑니다", value: defDeds })} className={btnL}>
          공통 공제 {defDeds.length ? `${defDeds.length}건 · ${won(defDeds.reduce((s, d) => s + toInt(d.amount), 0))}원` : "설정"}
        </button>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-bold text-[#5B6B85] whitespace-nowrap">선택 {sel.size}명</span>
          <button type="button" onClick={() => setPreview(0)} disabled={!shown.length} className={btnL}>미리보기</button>
          <button type="button" onClick={summaryExcel} className={btnL} title="지급 요약·운행 내역·공제 내역 3개 시트">⇩ 엑셀 다운로드{sel.size ? `(선택 ${sel.size}명)` : ""}</button>
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
                  <button type="button" onClick={() => setDedEdit({ key: r.key, title: `${r.d.이름} 기사님 공제`, sub: "자동 공제(■)와 이번 달 추가 공제를 함께 봅니다", value: r.extra, auto: r.auto, gross: r.gross })}
                    title={r.deductions.map((d) => `${d.label} ${won(d.amount)}`).join("\n") || "공제 추가"}
                    className="h-9 px-3 rounded-lg border border-[#DCE3EE] bg-white hover:bg-[#F5F8FD] text-[14px] font-black tabular-nums text-[#1B2B4B]" style={{ fontFamily: MONO }}>
                    {r.deductTotal ? `-${won(r.deductTotal)}` : "+ 공제"}{r.deductions.length ? <span className="ml-1.5 text-[11.5px] text-[#7A89A3]">{r.deductions.length}건</span> : null}
                  </button>
                </td>
                <td className={`${TD} text-right tabular-nums font-black text-[15.5px] text-[#0B1428]`} style={{ fontFamily: MONO }}>{won(r.net)}</td>
                <td className={TD}><StatusChip s={sent[r.key]} /></td>
                <td className={TD}>
                  <button type="button" onClick={() => setPreview(i)} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13.5px] font-black text-[#1B2B4B]">보기</button>
                  <button type="button" onClick={() => sendSelected(new Set([r.key]))} className="ml-1.5 h-9 px-3.5 rounded-lg bg-[#1B2B4B] text-white text-[13.5px] font-black">발송</button>
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={16} className="py-20 text-center text-[15px] font-bold text-[#9AA9C3]">{ym} 기간에 운행한 지입·직영·임대 기사님이 없습니다</td></tr>}
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

      {dedEdit && <DeductionEditor title={dedEdit.title} sub={dedEdit.sub} value={dedEdit.value} auto={dedEdit.auto || []} gross={dedEdit.gross || 0} onSave={onSaveDed} onClose={() => setDedEdit(null)} />}

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
              <span className="ml-auto"><StatusChip s={sent[cur.key]} /></span>
              <button type="button" onClick={() => sendSelected(new Set([cur.key]))} className={btnD}>이 기사님에게 발송</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════ 개별 정산서 — 기사님 한 명씩 자세히 ═════════════════════
//  왼쪽: 기사님 목록(이번 달 운행·실지급) · 오른쪽: 운행 내역 표 + 공제 + 실지급액 + 미리보기·인쇄·이미지·엑셀·발송
export function SingleStatementPanel({ drivers = [], dispatchData = [], companyName = "", supplier = {} }) {
  const co = String(companyName || "").trim();
  const [ym, setYm] = React.useState(kstYm());
  const [vatMode, setVatMode] = React.useState("biz");
  const { rows, sent, edits, saveEdits, send } = useStatements({ drivers, dispatchData, co, ym, vatMode, includeEmpty: true });
  const [selKey, setSelKey] = React.useState("");
  const [q, setQ] = React.useState("");
  const [tq, setTq] = React.useState("");
  const [dedEdit, setDedEdit] = React.useState(false);
  const [preview, setPreview] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const docRef = React.useRef(null);
  const sorted = [...rows].sort((a, b) => b.trips.length - a.trips.length || String(a.d.이름).localeCompare(String(b.d.이름), "ko"));
  const qq = q.replace(/\s/g, "");
  const list = sorted.filter((r) => !qq || `${r.d.이름}${r.d.차량번호}${r.d.전화번호}`.replace(/\s/g, "").includes(qq));
  const cur = rows.find((r) => r.key === selKey) || list[0] || null;
  const trips = cur ? cur.trips.filter((t) => !tq.trim() || `${t.client}${t.from}${t.to}${t.via}${t.cargo}`.includes(tq.trim())) : [];

  const saveImage = () => savePngA4(docRef.current, `정산서_${cur.d.이름}_${ym}`);
  const savePdf = () => savePdfA4(docRef.current, `정산서_${cur.d.이름}_${ym}`);
  const printDoc = () => printA4(docRef.current, `정산서_${cur.d.이름}_${ym}`);
  const excel = () => {
    const aoa = [["순번", "상차일", "거래처", "상차지", "경유", "하차지", "화물", "톤수", "기사운임"]];
    cur.trips.forEach((t, i) => aoa.push([i + 1, t.date, t.client, t.from, t.via, t.to, t.cargo, t.ton, t.fare]));
    aoa.push([], ["", "", "", "", "", "", "", "운임 합계", cur.gross], ["", "", "", "", "", "", "", "부가세", cur.vat]);
    cur.deductions.forEach((d) => aoa.push(["", "", "", "", "", "", "", `공제 · ${d.label}`, -d.amount]));
    aoa.push(["", "", "", "", "", "", "", "실지급액", cur.net]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "정산서");
    XLSX.writeFile(wb, `정산서_${cur.d.이름}_${ym}.xlsx`);
  };
  const doSend = async () => { setBusy(true); await send([cur]); setBusy(false); };

  return (
    <div>
      <Hero en="SETTLEMENT · DRIVER" title="개별 정산서" desc="기사님 한 분씩 운행 내역·공제·실지급액을 자세히 보고 인쇄·저장·발송합니다">
        <div className="flex items-center gap-2 flex-wrap">
          <MonthPicker value={ym} onChange={setYm} dark />
          <button type="button" onClick={() => { const list = rows.filter((r) => r.trips.length || r.deductTotal); if (!list.length) { kpAlert("내려받을 내용이 없습니다."); return; } const wb = XLSX.utils.book_new(); list.forEach((r) => { const aoa = [["순번", "상차일", "거래처", "상차지", "경유", "하차지", "화물", "톤수", "기사운임"]]; r.trips.forEach((t, i) => aoa.push([i + 1, t.date, t.client, t.from, t.via, t.to, t.cargo, t.ton, t.fare])); aoa.push([], ["", "", "", "", "", "", "", "운임 합계", r.gross], ["", "", "", "", "", "", "", "부가세", r.vat]); r.deductions.forEach((d) => aoa.push(["", "", "", "", "", "", "", `공제 · ${d.label}`, -d.amount])); aoa.push(["", "", "", "", "", "", "", "실지급액", r.net]); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), String(`${r.d.이름}_${r.d.차량번호}`).replace(/[\\/?*[\]:]/g, "").slice(0, 31)); }); XLSX.writeFile(wb, `개별정산서_전체_${co}_${ym}.xlsx`); }} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black whitespace-nowrap" title="기사님별 시트로 한 파일에">⇩ 전체 엑셀</button>
          <Stat k="운행 기사님" v={`${rows.filter((r) => r.trips.length).length}명`} />
          <Stat k="실지급 합계" v={`${won(rows.reduce((s, r) => s + (r.trips.length || r.deductTotal ? r.net : 0), 0))}원`} />
        </div>
      </Hero>
      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className={`${card} overflow-hidden self-start`}>
          <div className="p-3 border-b border-[#EEF1F6]"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="기사명 · 차량번호 찾기" className={`${inp} w-full`} /></div>
          <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
            {list.map((r) => {
              const on = cur && r.key === cur.key;
              return (
                <button key={r.key} type="button" onClick={() => setSelKey(r.key)} className={`w-full text-left px-4 py-3 border-b border-[#EEF1F6] transition ${on ? "bg-[#0F1A30] text-white" : "hover:bg-[#F5F8FD]"} ${r.trips.length || r.deductTotal ? "" : "opacity-55"}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-black truncate flex-1">{r.d.이름} <span className={`text-[12.5px] font-bold ${on ? "text-white/70" : "text-[#7A89A3]"}`}>{r.d.차량번호}</span></span>
                    <span className={`text-[11.5px] font-black px-1.5 py-0.5 rounded ${on ? "bg-white/15" : "bg-[#EEF3FC] text-[#1B2B4B]"}`}>{r.d.등급 || "지입"}</span>
                  </div>
                  <div className={`mt-1 flex items-center justify-between text-[13px] ${on ? "text-white/75" : "text-[#5B6B85]"}`}>
                    <span>{r.trips.length}건 · {sent[r.key] ? (sent[r.key].status === "confirmed" ? "확인 완료" : "발송됨") : "미발송"}</span>
                    <b className={`tabular-nums ${on ? "text-white" : "text-[#0B1428]"}`} style={{ fontFamily: MONO }}>{won(r.net)}원</b>
                  </div>
                </button>
              );
            })}
            {!list.length && <div className="py-14 text-center text-[14px] font-bold text-[#9AA9C3]">지입·직영·임대 기사님이 없습니다</div>}
          </div>
        </div>
        {!cur ? <div className={`${card} py-24 text-center text-[15px] font-bold text-[#9AA9C3]`}>기사님을 고르세요</div> : (
          <div className="space-y-3 min-w-0">
            <div className={`${card} p-5`}>
              <div className="flex items-start gap-4 flex-wrap">
                <span className="w-14 h-14 rounded-2xl bg-[#0F1A30] text-white flex items-center justify-center text-[22px] font-black">{String(cur.d.이름).slice(0, 1)}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[22px] font-black text-[#0F1A30]">{cur.d.이름} <span className="text-[15px] font-bold text-[#5B6B85]">{cur.d.차량번호}</span></div>
                  <div className="text-[13.5px] text-[#5B6B85] mt-0.5 flex flex-wrap gap-x-3">
                    <span>{cur.d.전화번호 || "-"}</span><span>사업자 {cur.d.사업자번호 ? fmtBiz(cur.d.사업자번호) : "-"}</span><span>{cur.d.사업자상호 || ""}</span>
                    <span>{cur.d.정산계좌?.acct ? acctLine(cur.d.정산계좌) : "계좌 미등록"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <VatToggle value={vatMode} onChange={setVatMode} />
                  <StatusChip s={sent[cur.key]} />
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mt-4">
                {[["운행", `${cur.trips.length}건`], ["운임 합계", won(cur.gross)], ["부가세", won(cur.vat)], ["공제", `-${won(cur.deductTotal)}`], ["실지급액", won(cur.net)]].map(([k, v], i) => (
                  <div key={k} className={`rounded-xl px-4 py-3 ${i === 4 ? "bg-[#0F1A30] text-white" : "bg-[#F5F8FD] border border-[#E3E8F0]"}`}>
                    <div className={`text-[12.5px] font-bold ${i === 4 ? "text-[#8FB0F0]" : "text-[#7A89A3]"}`}>{k}</div>
                    <div className="text-[20px] font-black tabular-nums" style={{ fontFamily: MONO }}>{v}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-4">
                <button type="button" onClick={() => setDedEdit(true)} className={btnL}>공제 {cur.deductions.length}건 보기·추가</button>
                <div className="ml-auto flex gap-2 flex-wrap">
                  <button type="button" onClick={() => setPreview(true)} className={btnL}>미리보기</button>
                  <button type="button" onClick={excel} className={btnL}>⇩ 엑셀 다운로드</button>
                  <button type="button" onClick={() => setPreview("img")} className={btnL}>이미지·PDF 저장</button>
                  <button type="button" onClick={doSend} disabled={busy} className={btnD}>{busy ? "발송 중…" : "기사앱으로 발송"}</button>
                </div>
              </div>
            </div>
            <div className={`${card} overflow-hidden`}>
              <div className="px-4 py-3 border-b border-[#EEF1F6] flex items-center gap-2">
                <div className="text-[16px] font-black text-[#0F1A30]">운행 내역 <span className="text-[13px] font-bold text-[#7A89A3]">{ym}</span></div>
                <input value={tq} onChange={(e) => setTq(e.target.value)} placeholder="거래처·상하차지·화물 거르기" className={`${inp} ml-auto w-72`} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px]">
                  <thead><tr className="bg-[#0B1428] text-[#DCE6F7]">{["순번", "상차일", "거래처", "상차지", "경유", "하차지", "화물", "톤수", "기사운임"].map((h) => <th key={h} className={`${TH} ${h === "기사운임" ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
                  <tbody>
                    {trips.map((t, i) => (
                      <tr key={i} className={`border-b border-[#EEF1F6] ${i % 2 ? "bg-[#FAFBFD]" : "bg-white"}`}>
                        <td className={`${TD} text-[#7A89A3] font-bold tabular-nums`} style={{ fontFamily: MONO }}>{i + 1}</td>
                        <td className={`${TD} tabular-nums font-bold`} style={{ fontFamily: MONO }}>{t.date}</td>
                        <td className={`${TD} font-black text-[#0F1A30]`}>{t.client}{t.route && <span className="ml-1.5 text-[11px] font-black px-1.5 py-0.5 rounded bg-[#EEF3FC] text-[#1B2B4B]">고정</span>}</td>
                        <td className={TD}>{t.from}</td>
                        <td className={`${TD} text-[#5B6B85] max-w-[220px] overflow-hidden text-ellipsis`} title={t.via}>{t.via || "-"}</td>
                        <td className={TD}>{t.to}</td>
                        <td className={`${TD} text-[#5B6B85]`}>{t.cargo || "-"}</td>
                        <td className={`${TD} text-[#5B6B85]`}>{t.ton || "-"}</td>
                        <td className={`${TD} text-right font-black tabular-nums`} style={{ fontFamily: MONO }}>{won(t.fare)}</td>
                      </tr>
                    ))}
                    {!trips.length && <tr><td colSpan={9} className="py-16 text-center text-[14px] font-bold text-[#9AA9C3]">{ym} 운행 내역이 없습니다</td></tr>}
                  </tbody>
                  {trips.length > 0 && <tfoot><tr className="bg-[#F3F6FA] font-black text-[14.5px]"><td colSpan={8} className="px-3 py-3">합계 {trips.length}건</td><td className="px-3 text-right tabular-nums" style={{ fontFamily: MONO }}>{won(trips.reduce((s, t) => s + t.fare, 0))}</td></tr></tfoot>}
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
      {dedEdit && cur && <DeductionEditor title={`${cur.d.이름} 기사님 공제`} sub="자동 공제(■)와 이번 달 추가 공제를 함께 봅니다" value={cur.extra} auto={cur.auto} gross={cur.gross} onSave={(l) => { saveEdits({ ...edits, [cur.key]: l }); setDedEdit(false); }} onClose={() => setDedEdit(false)} />}
      {preview && cur && (
        <div className="fixed inset-0 z-[99990] bg-[#0B1428]/55 flex justify-end">
          <div className="w-full max-w-[1000px] h-full bg-[#F3F6FA] flex flex-col shadow-2xl">
            <div className="px-6 py-4 flex items-center gap-2 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>STATEMENT · {ym}</div>
                <div className="text-[20px] font-black truncate">{cur.d.이름} · {cur.d.차량번호}</div>
              </div>
              <button type="button" onClick={printDoc} className="h-11 px-4 rounded-xl bg-white/10 border border-white/20 text-[14px] font-black">인쇄</button>
              <button type="button" onClick={saveImage} className="h-11 px-4 rounded-xl bg-white/10 border border-white/20 text-[14px] font-black">이미지 저장</button>
              <button type="button" onClick={savePdf} className="h-11 px-4 rounded-xl bg-white/10 border border-white/20 text-[14px] font-black">PDF 저장</button>
              <button type="button" onClick={() => setPreview(false)} className="h-11 px-5 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black">닫기</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6"><div ref={docRef} className="bg-white"><StatementDoc st={cur.st} supplier={supplier} /></div></div>
          </div>
        </div>
      )}
    </div>
  );
}

// 🔎 고지서 스캔 팝업 — 배차관리 "오더 붙여넣기"와 같은 화면(Ctrl+V · 끌어다 놓기 · 사진 선택 · 글 붙여넣기)
const SCAN_FIELDS = [["kind", "구분"], ["carNo", "차량번호"], ["date", "발생일"], ["time", "발생 시각"], ["place", "발생 장소"], ["detail", "위반·사고 내용"], ["agency", "고지 기관"], ["docNo", "고지서 번호"], ["amount", "금액"], ["dueDate", "납부 기한"]];
function PenaltyScanModal({ onClose, onApply }) {
  const [stage, setStage] = React.useState("input");
  const [img, setImg] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [prog, setProg] = React.useState({ msg: "", pct: 0 });
  const [found, setFound] = React.useState(null);
  const [err, setErr] = React.useState("");
  const fileRef = React.useRef(null);
  const run = async (file) => {
    if (!file) return;
    setErr("");
    const data = await compressImage(file, 2000, 0.9).catch(() => "");
    if (!data) { setErr("이미지를 읽지 못했어요"); return; }
    setImg(data); setStage("scan"); setFound(null);
    try {
      const r = await scanPenaltyImage(data, (msg, pct) => setProg({ msg, pct }));
      setFound(r.found);
    } catch (e) { setErr(e?.message || "인식에 실패했어요"); setFound({}); }
  };
  const runText = (t) => { if (!t.trim()) return; setImg(""); setStage("scan"); setFound(parsePenaltyText(t).found); };
  React.useEffect(() => {
    const onPaste = (e) => {
      const it = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith("image/"));
      if (it) { e.preventDefault(); run(it.getAsFile()); return; }
      const tag = (e.target?.tagName || "").toLowerCase();
      if (stage === "input" && tag !== "textarea" && tag !== "input") { const t = e.clipboardData?.getData("text") || ""; if (t.trim()) { e.preventDefault(); setTyped(t); runText(t); } }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps
  const cnt = found ? Object.values(found).filter(Boolean).length : 0;
  return (
    <div className="fixed inset-0 z-[2000000] flex items-center justify-center p-0 sm:p-5" style={{ background: "rgba(6,13,28,0.62)" }}>
      <style>{"@keyframes psIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}@keyframes psBeam{0%{top:0}100%{top:calc(100% - 3px)}}"}</style>
      <div className="w-full max-w-[1180px] h-full sm:h-[min(780px,92vh)] rounded-none sm:rounded-[26px] overflow-hidden flex flex-col bg-[#F4F6FA] shadow-[0_30px_80px_rgba(0,0,0,0.45)] ring-1 ring-white/10" style={{ animation: "psIn .28s cubic-bezier(.2,.9,.3,1.1) both" }}>
        <div className="relative px-4 sm:px-7 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 text-white shrink-0" style={{ background: "linear-gradient(120deg,#0B1428 0%,#0F1A30 45%,#1B2B4B 80%,#2D4C82 100%)" }}>
          <span className="absolute inset-0 opacity-[0.08] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "24px 24px" }} />
          <div className="relative w-10 h-10 rounded-[12px] bg-white/10 ring-1 ring-white/20 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="2" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M3 12h18" /></svg>
          </div>
          <div className="relative min-w-0">
            <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>NOTICE SCAN</div>
            <div className="text-[18px] font-black leading-tight">고지서 스캔</div>
          </div>
          <div className="relative ml-4 hidden md:flex items-center gap-2 text-[12px] font-bold text-white/60">
            <kbd className="px-2 h-6 inline-flex items-center rounded-md bg-white/10 ring-1 ring-white/15 text-white" style={{ fontFamily: MONO }}>Ctrl</kbd>+<kbd className="px-2 h-6 inline-flex items-center rounded-md bg-white/10 ring-1 ring-white/15 text-white" style={{ fontFamily: MONO }}>V</kbd>
            <span>고지서 사진·캡처나 안내 문자를 바로 붙여넣으세요</span>
          </div>
          <button type="button" onClick={onClose} className="relative ml-auto w-9 h-9 rounded-[11px] bg-white/10 hover:bg-white/20 text-white text-[16px]" aria-label="닫기">✕</button>
        </div>
        {stage === "input" ? (
          <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-[1.15fr_1fr] gap-3 md:gap-5 p-3 md:p-6">
            <div className="relative rounded-[22px] border-2 border-dashed border-[#C9D2E0] bg-white flex flex-col items-center justify-center text-center px-5 md:px-8 py-6 md:py-0 hover:border-[#4B6CB7] transition"
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); run(e.dataTransfer.files?.[0]); }}>
              <div className="w-16 h-16 rounded-[18px] flex items-center justify-center shadow-[0_12px_26px_rgba(15,26,48,0.3)]" style={{ background: "linear-gradient(135deg,#0F1A30,#2D4C82)" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
              </div>
              <div className="mt-5 text-[20px] font-black text-[#0F1A30]"><span className="hidden md:inline">Ctrl + V 로 붙여넣기</span><span className="md:hidden">고지서 사진으로 스캔</span></div>
              <div className="mt-1.5 text-[13.5px] text-[#5B6B85] leading-relaxed">과태료·범칙금 <b className="text-[#0F1A30]">고지서 사진</b>이나 <b className="text-[#0F1A30]">캡처</b>를 붙여넣으면<br />차량번호·일시·장소·금액·납부기한을 자동으로 읽어요</div>
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="h-10 px-4 rounded-[12px] border border-[#E3E8F0] bg-white text-[#0F1A30] text-[13px] font-bold hover:border-[#4B6CB7]">사진 · 이미지 선택</button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { run(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              <div className="mt-4 text-[11.5px] text-[#9AA9C3]">이미지는 끌어다 놓아도 됩니다 · 한글 인식이라 처음 한 번은 조금 걸려요</div>
              {err && <div className="mt-4 px-4 py-2 rounded-xl bg-[#F3F6FA] border border-[#DCE3EE] text-[12.5px] font-bold text-[#0F1A30]">! {err}</div>}
            </div>
            <div className="flex flex-col min-h-[260px] md:min-h-0 rounded-[22px] bg-white border border-[#E3E8F0] p-4 md:p-5">
              <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>TEXT</div>
              <div className="text-[15px] font-black text-[#0F1A30]">문자·메일 내용 붙여넣기</div>
              <textarea value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={"예)\n[과태료 사전통지] 차량번호 서울12가1000\n위반일시 2026.10.12 14:20 / 장소 경부고속도로 서울방향 123km\n제한속도 100km/h 구간 128km/h 주행\n납부금액 70,000원 / 납부기한 2026.11.10 ○○경찰서"}
                className="mt-3 flex-1 min-h-0 w-full rounded-[14px] border border-[#E3E8F0] bg-[#F7F9FC] px-4 py-3 text-[13.5px] font-semibold text-[#0F1A30] leading-relaxed resize-none outline-none focus:bg-white focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10 placeholder:text-[#A7B3C6]" />
              <button type="button" onClick={() => runText(typed)} disabled={!typed.trim()} className="mt-3 h-12 rounded-[14px] text-white text-[14.5px] font-black disabled:opacity-40 shadow-[0_12px_24px_rgba(15,26,48,0.25)]" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>스캔하기</button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-[minmax(0,40%)_minmax(0,1fr)] md:grid-rows-1 md:grid-cols-[1.1fr_1fr] gap-3 md:gap-5 p-3 md:p-6">
            <div className="relative min-h-0 rounded-[22px] bg-white border border-[#E3E8F0] overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-[#EEF1F6] flex items-center gap-2">
                <span className="text-[13.5px] font-black text-[#0F1A30]">{img ? "고지서 이미지" : "붙여넣은 내용"}</span>
                {found && <button type="button" onClick={() => { setStage("input"); setFound(null); setImg(""); }} className="ml-auto h-8 px-3 rounded-[10px] border border-[#E3E8F0] text-[12px] font-bold text-[#3A4A66] hover:border-[#4B6CB7]">다시 붙여넣기</button>}
              </div>
              <div className="relative flex-1 min-h-0 overflow-auto bg-[#F7F9FC] flex items-start justify-center p-3">
                {img ? <img src={img} alt="고지서" className="max-w-full" /> : <pre className="whitespace-pre-wrap text-[13.5px] text-[#0F1A30] w-full">{typed}</pre>}
                {!found && <span className="absolute left-0 right-0 h-[3px] bg-[#8FB0F0] shadow-[0_0_18px_#8FB0F0]" style={{ animation: "psBeam 1.4s ease-in-out infinite alternate" }} />}
              </div>
            </div>
            <div className="min-h-0 rounded-[22px] bg-white border border-[#E3E8F0] flex flex-col overflow-hidden">
              <div className="px-5 py-4 border-b border-[#EEF1F6]">
                <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>RESULT</div>
                <div className="text-[15px] font-black text-[#0F1A30]">{found ? `${cnt}개 항목을 읽었어요` : `${prog.msg || "읽는 중"} ${prog.pct ? `${prog.pct}%` : ""}`}</div>
                {!found && <div className="mt-2 h-2 rounded-full bg-[#EEF2F8] overflow-hidden"><div className="h-full bg-[#2D4C82] transition-all" style={{ width: `${prog.pct || 5}%` }} /></div>}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-1.5">
                {found && SCAN_FIELDS.map(([k, l]) => (
                  <div key={k} className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                    <span className="text-[13px] font-black text-[#5B6B85]">{l}</span>
                    <input value={found[k] ?? ""} onChange={(e) => setFound((p) => ({ ...p, [k]: e.target.value }))} placeholder="읽지 못함" className={`${inp} w-full ${found[k] ? "" : "bg-[#F7F9FC]"}`} />
                  </div>
                ))}
                {err && <div className="text-[13px] font-bold text-[#0F1A30]">! {err}</div>}
              </div>
              <div className="p-4 border-t border-[#EEF1F6] flex gap-2">
                <button type="button" onClick={onClose} className={`${btnL} flex-1`}>취소</button>
                <button type="button" disabled={!found} onClick={() => onApply(found, img)} className={`${btnD} flex-[1.6]`}>서류에 적용</button>
              </div>
            </div>
          </div>
        )}
      </div>
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
  const [scanOpen, setScanOpen] = React.useState(false);
  const viewDocRef = React.useRef(null); // 처리 안내서 인쇄·저장
  const formDocRef = React.useRef(null);
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

  // 🔎 고지서 스캔 결과를 서류 칸에 넣는다(차량번호로 기사님도 찾음)
  const applyScan = (f, img) => {
    const plate = normPlate(f.carNo);
    const drv = plate ? drivers.find((d) => normPlate(d.차량번호) === plate) || drivers.find((d) => plate.length >= 4 && normPlate(d.차량번호).endsWith(plate.slice(-4))) : null;
    setForm((p) => {
      const n = { ...p };
      ["kind", "date", "time", "place", "detail", "agency", "docNo", "dueDate"].forEach((k) => { if (f[k]) n[k] = PENALTY_KINDS.includes(f[k]) || k !== "kind" ? f[k] : p.kind; });
      if (f.amount) n.amount = String(toInt(f.amount));
      if (img) n.photos = [...(p.photos || []), img].slice(0, 4);
      if (drv && !p.driverName) Object.assign(n, driverPatch(drv));
      return n;
    });
    setScanOpen(false);
    const cnt = Object.values(f).filter(Boolean).length;
    setScan({ done: true, count: cnt, driver: drv?.이름 || "" });
  };

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
        <Hero en="VEHICLE NOTICE · WRITE" title={form.id ? "서류 수정" : "과태료·사고 서류 작성"} desc="고지서를 스캔하면 칸이 자동으로 채워집니다 · 오른쪽 미리보기 그대로 기사앱에 올라갑니다">
          <div className="flex gap-2">
            <button type="button" onClick={() => { setForm(null); setScan(null); }} className="h-12 px-5 rounded-xl bg-white/10 border border-white/20 text-[14.5px] font-bold">취소</button>
            <button type="button" onClick={save} disabled={busy} className="h-12 px-6 rounded-xl bg-white text-[#0F1A30] text-[15px] font-black disabled:opacity-50">{busy ? "저장 중…" : "저장 · 기사님에게 공개"}</button>
          </div>
        </Hero>
        {scanOpen && <PenaltyScanModal onClose={() => setScanOpen(false)} onApply={applyScan} />}
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
            <button type="button" onClick={() => setScanOpen(true)} className="w-full rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left text-white shadow-[0_10px_24px_rgba(15,26,48,.22)]" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 65%,#2D4C82)" }}>
              <span className="w-10 h-10 rounded-xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="2" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M3 12h18" /></svg>
              </span>
              <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-black">고지서 자동 스캔</span><span className="block text-[12.5px] text-white/65">사진·캡처·문자를 붙여넣으면 아래 칸이 자동으로 채워져요</span></span>
              <span className="h-9 px-3.5 rounded-xl bg-white text-[#0F1A30] text-[13px] font-black inline-flex items-center">스캔</span>
            </button>
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
                  <MonthPicker value={form.deductPeriod || ymOf(form.date)} onChange={(v) => set("deductPeriod", v)} />
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
            <div className="flex gap-2 justify-end mb-2">
              <button type="button" onClick={() => printA4(formDocRef.current, `과태료처리안내서_${preview.driverName || ""}`)} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#1B2B4B]">인쇄</button>
              <button type="button" onClick={() => savePngA4(formDocRef.current, `과태료처리안내서_${preview.driverName || ""}`)} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#1B2B4B]">이미지 저장</button>
              <button type="button" onClick={() => savePdfA4(formDocRef.current, `과태료처리안내서_${preview.driverName || ""}`)} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#1B2B4B]">PDF</button>
            </div>
            <div ref={formDocRef}><PenaltyDoc p={preview} supplier={supplier} wide onPhoto={(i) => setViewer({ images: form.photos, index: i })} /></div>
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
              <button type="button" onClick={() => printA4(viewDocRef.current, `과태료처리안내서_${view.driverName || ""}_${view.date || ""}`)} className="h-11 px-5 rounded-xl bg-white/10 border border-white/20 text-[14px] font-black">인쇄</button>
              <button type="button" onClick={() => savePngA4(viewDocRef.current, `과태료처리안내서_${view.driverName || ""}_${view.date || ""}`)} className="h-11 px-5 rounded-xl bg-white/10 border border-white/20 text-[14px] font-black">이미지 저장</button>
              <button type="button" onClick={() => savePdfA4(viewDocRef.current, `과태료처리안내서_${view.driverName || ""}_${view.date || ""}`)} className="h-11 px-5 rounded-xl bg-white/10 border border-white/20 text-[14px] font-black">PDF</button>
              <button type="button" onClick={() => remove(view)} className="h-11 px-5 rounded-xl bg-white/10 border border-white/20 text-[14px] font-black">삭제</button>
              <button type="button" onClick={() => setView(null)} className="h-11 px-5 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black">닫기</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6"><div ref={viewDocRef}><PenaltyDoc p={view} supplier={supplier} wide onPhoto={(i) => setViewer({ images: view.photos, index: i })} /></div></div>
          </div>
        </div>
      )}
      {viewer && <ImageViewer images={viewer.images} index={viewer.index} onClose={() => setViewer(null)} name="고지서" />}
    </div>
  );
}

export { korTimeLabel };

// ═════════════════════ 정산관리 › 지입정산관리 — 지입·직영·임대 기사님 정산(일괄 / 개별) ═════════════════════
const FLEET_GRADES = ["지입", "직영", "임대"];
export function useFleetDrivers() {
  const [list, setList] = React.useState([]);
  React.useEffect(() => onSnapshot(collection(db, "drivers"), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((raw) => FLEET_GRADES.includes(raw.등급))
    .map((raw) => ({
      id: raw.id, 이름: String(raw.이름 || raw.name || "").trim() || "-", 차량번호: String(raw.차량번호 || raw.carNo || "").trim() || "-",
      전화번호: String(raw.전화번호 || raw.phone || "").trim() || "-", 등급: raw.등급, 차량종류: raw.차량종류 || "", 차량톤수: String(raw.차량톤수 || raw.톤수 || ""),
      정산계좌: raw.정산계좌 || null, 사업자번호: raw.사업자번호 || "", 사업자상호: raw.사업자상호 || "", appUid: raw.uid || "", 공제항목: raw.공제항목 || null,
    })).sort((a, b) => a.이름.localeCompare(b.이름, "ko"))), () => setList([])), []);
  return list;
}
export function FleetSettlementMenu({ dispatchData = [], companyName = "" }) {
  const drivers = useFleetDrivers();
  const [mode, setMode] = React.useState(() => { try { return localStorage.getItem("fm_settle_mode2") || "batch"; } catch { return "batch"; } });
  React.useEffect(() => { try { localStorage.setItem("fm_settle_mode2", mode); } catch { /* 무시 */ } }, [mode]);
  const props = { drivers, dispatchData, companyName, supplier: { name: companyName } };
  return (
    <div className="p-4">
      <div className="inline-flex p-1 rounded-2xl bg-white border border-[#E3E8F0] mb-3 gap-1">
        {[["batch", "일괄 지급명세서 · 일괄 발송"], ["single", "개별 정산서"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMode(k)} className={`h-10 px-5 rounded-xl text-[14px] font-black ${mode === k ? "bg-[#0F1A30] text-white" : "text-[#5B6B85] hover:bg-[#F3F6FA]"}`}>{l}</button>
        ))}
      </div>
      {mode === "batch" ? <BatchStatementsPanel {...props} /> : <SingleStatementPanel {...props} />}
    </div>
  );
}
