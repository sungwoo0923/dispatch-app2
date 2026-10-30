// ======================= src/FleetPayDocs.jsx =======================
// 💸 지입차관리 › 정산관리 "일괄 지급명세서" + 🧾 "과태료·사고 서류"
//
// [일괄 지급명세서] 70명이어도 한 화면에서 끝낸다
//  ① 기간을 고르면 지입·직영 기사별로 운행 건수·운임이 자동 집계된다(기사운임 기준, 취소·0원 제외)
//  ② 공통 공제(지입료·관리비·보험료 등)는 한 번 정해 두면 모두에게 적용, 기사별 추가 공제·메모는 표에서 바로 수정
//  ③ 과태료 서류에서 "기사 부담(지급액 공제)"로 만든 건은 해당 기간 공제에 자동으로 들어간다
//  ④ 미리보기는 ‹ › 로 다음 기사로 넘기며 확인, [선택 일괄 발송]으로 기사앱 서류함에 한 번에 보낸다(같은 기간은 덮어씀)
//  ⑤ 은행 대량이체용 엑셀(은행·계좌·예금주·금액·메모) — 인터넷뱅킹 "다건 이체"에 그대로 올린다
//  ⑥ 계좌 미등록·형식 오류는 빨간 대신 경고 칩으로 먼저 보여 송금 실수를 막는다
//
// [과태료·사고 서류] 회사로 날아온 과태료·범칙금·사고·보험 할증 우편을 서류로 만든다
//  기사 검색 → 정보 자동 채움 → 고지서 사진 업로드(칸에 맞게) → 미리보기 → 저장(기사앱 서류함에 표시)
import React from "react";
import { kpConfirm } from "./kpDialog";
import { collection, doc, onSnapshot, query, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, where, writeBatch } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db, auth } from "./firebase";
import { StatementDoc, PenaltyDoc, ImageViewer, PENALTY_KINDS, PENALTY_PAYERS, won, MONO, acctLine } from "./driverDocs";
import { validateAccount, formatAccount } from "./bankUtil";
import { compressImage } from "./InternalMail";
import CustomDatePicker from "./CustomDatePicker";

const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const CANCELED = ["배차취소", "취소", "오더취소", "취소됨"];
const ymOf = (d) => d.slice(0, 7);
const monthRange = (ym) => { const [y, m] = ym.split("-").map(Number); const last = new Date(y, m, 0).getDate(); return [`${ym}-01`, `${ym}-${String(last).padStart(2, "0")}`]; };
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const prevYm = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const me = () => auth.currentUser?.email || "직원";

const card = "rounded-[18px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_rgba(16,24,40,0.05)]";
const inp = "h-9 px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
const Chip = ({ children, dark }) => <span className={`inline-flex items-center h-6 px-2 rounded-md text-[11px] font-black whitespace-nowrap ${dark ? "bg-[#0F1A30] text-white" : "bg-[#EEF3FC] text-[#1B2B4B] border border-[#C9D6EE]"}`}>{children}</span>;

function Hero({ en, title, desc, children }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] px-6 py-5 text-white flex items-center justify-between gap-4 flex-wrap mb-4"
      style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
      <div className="min-w-0">
        <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{en}</div>
        <div className="text-[22px] font-black">{title}</div>
        <div className="text-[12.5px] text-white/60">{desc}</div>
      </div>
      {children}
    </div>
  );
}

function useCompanyDoc(col, id) {
  const [v, setV] = React.useState({});
  React.useEffect(() => (id ? onSnapshot(doc(db, col, id), (s) => setV(s.exists() ? s.data() : {}), () => setV({})) : undefined), [col, id]);
  return v;
}

// ═════════════════════ 일괄 지급명세서 ═════════════════════
export function BatchStatementsPanel({ drivers = [], dispatchData = [], companyName = "", supplier = {} }) {
  const co = String(companyName || "").trim();
  const [ym, setYm] = React.useState(prevYm());
  const [from, to] = monthRange(ym);
  const settings = useCompanyDoc("companySettings", co);
  const defDeds = (settings.statementDeductions || []).filter((d) => d.label);
  const [dedDraft, setDedDraft] = React.useState(null);
  const [vatMode, setVatMode] = React.useState("biz"); // biz: 사업자 기사만 부가세, none: 안 붙임
  const [edits, setEdits] = React.useState({}); // { driverId: { extra:[{label,amount}], memo } }
  const [sel, setSel] = React.useState(new Set());
  const [preview, setPreview] = React.useState(null); // index into rows
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
    const pen = penalties.filter((p) => (p.driverKey === d.id || p.driverId === d.id || (d.appUid && p.driverId === d.appUid)) && String(p.payer || "").startsWith("기사 부담") && (p.deductPeriod || ymOf(p.date || "")) === ym && p.status !== "취소")
      .map((p) => ({ label: `${p.kind || "과태료"} ${p.date || ""}`.trim(), amount: toInt(p.amount) }));
    const perDriver = (d.공제항목 || []).filter((x) => x.label);
    const e = edits[d.id] || {};
    const deductions = [...defDeds, ...perDriver, ...pen, ...(e.extra || []).filter((x) => x.label && toInt(x.amount))].map((x) => ({ label: x.label, amount: toInt(x.amount) }));
    const deductTotal = deductions.reduce((s, x) => s + x.amount, 0);
    const bankCheck = d.정산계좌?.acct ? validateAccount(d.정산계좌.bank, d.정산계좌.acct) : { ok: false, level: "error", msg: "계좌 미등록" };
    return {
      key: d.id, d, trips, gross, vat, deductions, deductTotal, net: gross + vat - deductTotal, bankCheck, memo: e.memo || "",
      st: { companyName: co, driverId: d.appUid || d.id, driverKey: d.id, driverName: name, carNo: plate, period: ym, from, to, trips, gross, vat, deductions, deductTotal, net: gross + vat - deductTotal, bank: d.정산계좌 || null, bizNo: d.사업자번호 || "", memo: e.memo || "" },
    };
  }).filter((r) => r.trips.length || r.deductTotal), [drivers, dispatchData, from, to, ym, vatMode, penalties, edits, defDeds.length, JSON.stringify(defDeds), co]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = rows.filter((r) => !q.trim() || `${r.d.이름}${r.d.차량번호}`.includes(q.trim()));
  const totals = shown.reduce((a, r) => ({ n: a.n + r.trips.length, gross: a.gross + r.gross, net: a.net + r.net, ded: a.ded + r.deductTotal }), { n: 0, gross: 0, net: 0, ded: 0 });
  const allOn = shown.length > 0 && shown.every((r) => sel.has(r.key));
  const toggle = (k) => setSel((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const setEdit = (k, patch) => setEdits((p) => ({ ...p, [k]: { ...(p[k] || {}), ...patch } }));

  const sendSelected = async (keys) => {
    const list = rows.filter((r) => keys.has(r.key));
    if (!list.length) return window.alert("보낼 기사를 선택해 주세요.");
    const noApp = list.filter((r) => !r.d.appUid).length;
    if (!await kpConfirm(`${ym} 지급명세서를 ${list.length}명에게 발송할까요?${noApp ? `\n(기사앱 미가입 ${noApp}명은 저장만 되고, 가입하면 서류함에서 보입니다)` : ""}\n같은 기간에 이미 보낸 명세서는 새 내용으로 바뀝니다.`)) return;
    setBusy(true);
    try {
      for (let i = 0; i < list.length; i += 400) {
        const b = writeBatch(db);
        list.slice(i, i + 400).forEach((r) => {
          b.set(doc(db, "driverStatements", `${r.key}_${ym}`), { ...r.st, status: "sent", sentAt: serverTimestamp(), sentBy: me(), readAt: null, confirmedAt: null });
        });
        await b.commit();
      }
      setSel(new Set());
      window.alert(`${list.length}명에게 발송했습니다.`);
    } catch (e) { window.alert(`발송 실패: ${e?.message || e}`); } finally { setBusy(false); }
  };

  const bankExcel = () => {
    const list = rows.filter((r) => (sel.size ? sel.has(r.key) : true) && r.net > 0);
    const aoa = [["은행", "계좌번호", "예금주", "이체금액", "받는분 통장 표시", "내 통장 표시", "기사", "차량번호", "계좌 확인"]];
    list.forEach((r) => {
      const b = r.d.정산계좌 || {};
      aoa.push([b.bank || "", b.acct ? formatAccount(b.bank, b.acct) : "", b.holder || "", r.net, `${co.slice(0, 6)} ${ym.slice(5)}월운임`, `${r.d.이름} ${ym.slice(5)}월`, r.d.이름, r.d.차량번호, r.bankCheck.ok ? (r.bankCheck.level === "ok" ? "정상" : "자리수 확인") : r.bankCheck.msg]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [12, 20, 10, 12, 18, 14, 10, 12, 14].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "대량이체");
    XLSX.writeFile(wb, `대량이체_${co}_${ym}.xlsx`);
  };
  const summaryExcel = () => {
    const aoa = [["기사", "차량번호", "사업자번호", "운행건수", "운임합계", "부가세", "공제합계", "실지급액", "은행", "계좌", "예금주", "발송상태"]];
    rows.forEach((r) => { const b = r.d.정산계좌 || {}; aoa.push([r.d.이름, r.d.차량번호, r.d.사업자번호 || "", r.trips.length, r.gross, r.vat, r.deductTotal, r.net, b.bank || "", b.acct ? formatAccount(b.bank, b.acct) : "", b.holder || "", sent[r.key]?.status ? ({ sent: "발송", read: "읽음", confirmed: "확인" }[sent[r.key].status] || "발송") : "미발송"]); });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "지급명세 요약");
    XLSX.writeFile(wb, `지급명세요약_${co}_${ym}.xlsx`);
  };
  const saveDeds = async () => {
    await setDoc(doc(db, "companySettings", co), { statementDeductions: (dedDraft || []).filter((d) => d.label).map((d) => ({ label: d.label.trim(), amount: toInt(d.amount) })) }, { merge: true });
    setDedDraft(null);
  };
  const statusChip = (r) => {
    const s = sent[r.key];
    if (!s) return <span className="text-[11.5px] font-bold text-[#9AA9C3]">미발송</span>;
    return <Chip dark={s.status === "confirmed"}>{s.status === "confirmed" ? "확인 완료" : s.status === "read" || s.readAt ? "읽음" : "발송됨"}</Chip>;
  };
  const cur = preview != null ? shown[preview] : null;

  return (
    <div>
      <Hero en="SETTLEMENT · BATCH" title="일괄 지급명세서" desc="기간을 고르면 기사별 운임·공제·실지급액이 자동 계산됩니다 · 미리보고 한 번에 발송">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" value={ym} onChange={(e) => { setYm(e.target.value); setSel(new Set()); }} className="h-10 px-3 rounded-xl bg-white/10 border border-white/20 text-white text-[14px] font-black [color-scheme:dark]" />
          {[["대상 기사", `${rows.length}명`], ["운행", `${totals.n}건`], ["실지급 합계", `${won(totals.net)}원`]].map(([k, v]) => (
            <div key={k} className="px-3.5 py-1.5 rounded-xl bg-white/[0.07] border border-white/10"><div className="text-[10.5px] font-bold text-white/55">{k}</div><div className="text-[16px] font-black tabular-nums" style={{ fontFamily: MONO }}>{v}</div></div>
          ))}
        </div>
      </Hero>

      <div className={`${card} p-4 mb-3 flex items-center gap-2 flex-wrap`}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="기사·차량번호 찾기" className={`${inp} w-48`} />
        <div className="inline-flex p-1 rounded-xl bg-[#EEF2F8] gap-1">
          {[["biz", "사업자 기사 부가세 10%"], ["none", "부가세 없음"]].map(([k, l]) => <button key={k} type="button" onClick={() => setVatMode(k)} className={`h-8 px-3 rounded-lg text-[12.5px] font-black ${vatMode === k ? "bg-white text-[#0F1A30] shadow" : "text-[#5B6B85]"}`}>{l}</button>)}
        </div>
        <button type="button" onClick={() => setDedDraft(defDeds.length ? defDeds.map((d) => ({ ...d })) : [{ label: "지입료", amount: "" }, { label: "관리비", amount: "" }])} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD]">
          공통 공제 {defDeds.length ? `${defDeds.length}건 · ${won(defDeds.reduce((s, d) => s + toInt(d.amount), 0))}원` : "설정"}
        </button>
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          <span className="text-[12.5px] font-bold text-[#5B6B85]">선택 {sel.size}명</span>
          <button type="button" onClick={() => setPreview(0)} disabled={!shown.length} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B] disabled:opacity-40">미리보기</button>
          <button type="button" onClick={summaryExcel} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B]">요약 엑셀</button>
          <button type="button" onClick={bankExcel} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B]" title="인터넷뱅킹 다건이체 업로드용">대량이체 엑셀{sel.size ? "(선택)" : ""}</button>
          <button type="button" onClick={() => sendSelected(sel)} disabled={busy || !sel.size} className="h-9 px-4 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black disabled:opacity-40">{busy ? "발송 중…" : `선택 일괄 발송`}</button>
        </div>
      </div>

      {dedDraft && (
        <div className={`${card} p-4 mb-3`}>
          <div className="text-[14px] font-black text-[#0F1A30] mb-1">공통 공제 항목 <span className="text-[12px] font-semibold text-[#7A89A3]">모든 기사 명세서에 똑같이 들어갑니다 · 기사별 공제는 기사관리 또는 표의 '추가 공제'</span></div>
          <div className="space-y-1.5 mt-2">
            {dedDraft.map((d, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input value={d.label} onChange={(e) => setDedDraft((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="항목 (예: 지입료)" className={`${inp} w-48`} />
                <input inputMode="numeric" value={d.amount ? toInt(d.amount).toLocaleString() : ""} onChange={(e) => setDedDraft((p) => p.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/[^\d]/g, "") } : x)))} placeholder="금액" className={`${inp} w-36 text-right`} />
                <button type="button" onClick={() => setDedDraft((p) => p.filter((_, j) => j !== i))} className="w-8 h-8 rounded-lg text-[#9AA9C3] hover:bg-[#F5F8FD]">✕</button>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 mt-2.5">
            <button type="button" onClick={() => setDedDraft((p) => [...p, { label: "", amount: "" }])} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B]">+ 항목</button>
            {["지입료", "관리비", "보험료", "할부금", "유류 선지급"].filter((l) => !dedDraft.some((d) => d.label === l)).map((l) => <button key={l} type="button" onClick={() => setDedDraft((p) => [...p, { label: l, amount: "" }])} className="h-9 px-3 rounded-lg bg-[#F3F6FA] text-[12px] font-bold text-[#3A4A66]">{l}</button>)}
            <div className="ml-auto flex gap-1.5">
              <button type="button" onClick={() => setDedDraft(null)} className="h-9 px-4 rounded-lg border border-[#DCE3EE] text-[12.5px] font-bold text-[#5B6B85]">취소</button>
              <button type="button" onClick={saveDeds} className="h-9 px-4 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black">저장</button>
            </div>
          </div>
        </div>
      )}

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-[13px] min-w-[1100px]">
          <thead>
            <tr className="bg-[#0B1428] text-[#C9D6EE] text-[11.5px] font-black">
              <th className="w-10 py-3"><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(shown.map((r) => r.key)))} /></th>
              {["기사", "정산 계좌", "건수", "운임", "부가세", "공제", "추가 공제 · 메모", "실지급액", "상태", ""].map((h) => <th key={h} className="px-2 py-3 text-left whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const e = edits[r.key] || {};
              const extra = (e.extra || [])[0] || { label: "", amount: "" };
              return (
                <tr key={r.key} className={`border-b border-[#EEF1F6] ${sel.has(r.key) ? "bg-[#EEF3FC]" : i % 2 ? "bg-[#FAFBFD]" : "bg-white"}`}>
                  <td className="text-center"><input type="checkbox" checked={sel.has(r.key)} onChange={() => toggle(r.key)} /></td>
                  <td className="px-2 py-2">
                    <div className="font-black text-[#0F1A30] whitespace-nowrap">{r.d.이름} {!r.d.appUid && <span className="ml-1 text-[10.5px] font-bold text-[#9AA9C3]">앱 미가입</span>}</div>
                    <div className="text-[11.5px] text-[#7A89A3] whitespace-nowrap">{r.d.차량번호}{r.d.사업자번호 ? " · 사업자" : ""}</div>
                  </td>
                  <td className="px-2 py-2 max-w-[220px]">
                    {r.d.정산계좌?.acct ? <div className="text-[12px] font-bold text-[#0F1A30] truncate tabular-nums" title={acctLine(r.d.정산계좌)}>{acctLine(r.d.정산계좌)}</div> : null}
                    <div className={`text-[11px] font-bold ${r.bankCheck.level === "ok" ? "text-[#2D4C82]" : "text-[#7A89A3]"}`}>{r.bankCheck.level === "ok" ? "✓ 형식 확인" : `! ${r.bankCheck.msg}`}</div>
                  </td>
                  <td className="px-2 py-2 tabular-nums font-bold">{r.trips.length}</td>
                  <td className="px-2 py-2 tabular-nums font-bold whitespace-nowrap" style={{ fontFamily: MONO }}>{won(r.gross)}</td>
                  <td className="px-2 py-2 tabular-nums whitespace-nowrap text-[#5B6B85]" style={{ fontFamily: MONO }}>{r.vat ? won(r.vat) : "-"}</td>
                  <td className="px-2 py-2 tabular-nums whitespace-nowrap text-[#5B6B85]" style={{ fontFamily: MONO }} title={r.deductions.map((d) => `${d.label} ${won(d.amount)}`).join("\n")}>{r.deductTotal ? `-${won(r.deductTotal)}` : "-"}</td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <input value={extra.label} onChange={(ev) => setEdit(r.key, { extra: [{ ...extra, label: ev.target.value }] })} placeholder="항목" className={`${inp} !h-8 w-20`} />
                      <input inputMode="numeric" value={extra.amount ? toInt(extra.amount).toLocaleString() : ""} onChange={(ev) => setEdit(r.key, { extra: [{ ...extra, amount: ev.target.value.replace(/[^\d]/g, "") }] })} placeholder="금액" className={`${inp} !h-8 w-24 text-right`} />
                      <input value={e.memo || ""} onChange={(ev) => setEdit(r.key, { memo: ev.target.value })} placeholder="메모" className={`${inp} !h-8 w-32`} />
                    </div>
                  </td>
                  <td className="px-2 py-2 tabular-nums font-black text-[14px] text-[#0B1428] whitespace-nowrap" style={{ fontFamily: MONO }}>{won(r.net)}</td>
                  <td className="px-2 py-2">{statusChip(r)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <button type="button" onClick={() => setPreview(i)} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#1B2B4B]">보기</button>
                    <button type="button" onClick={() => sendSelected(new Set([r.key]))} className="ml-1 h-8 px-2.5 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-black">발송</button>
                  </td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={11} className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">{ym} 기간에 운행한 지입·직영 기사가 없습니다</td></tr>}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr className="bg-[#F3F6FA] font-black text-[#0F1A30]">
                <td /><td className="px-2 py-2.5">합계 {shown.length}명</td><td /><td className="px-2 tabular-nums">{totals.n}</td>
                <td className="px-2 tabular-nums" style={{ fontFamily: MONO }}>{won(totals.gross)}</td><td /><td className="px-2 tabular-nums" style={{ fontFamily: MONO }}>-{won(totals.ded)}</td><td />
                <td className="px-2 tabular-nums text-[14px]" style={{ fontFamily: MONO }}>{won(totals.net)}</td><td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {cur && (
        <div className="fixed inset-0 z-[99990] bg-[#0B1428]/55 flex justify-end" >
          <div className="w-full max-w-[860px] h-full bg-[#F3F6FA] flex flex-col shadow-2xl">
            <div className="px-5 py-4 flex items-center gap-2 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>PREVIEW · {preview + 1} / {shown.length}</div>
                <div className="text-[18px] font-black truncate">{cur.d.이름} · {cur.d.차량번호}</div>
              </div>
              <button type="button" onClick={() => setPreview((p) => Math.max(0, p - 1))} disabled={preview === 0} className="h-10 w-10 rounded-xl bg-white/10 border border-white/20 text-[18px] font-black disabled:opacity-30">‹</button>
              <button type="button" onClick={() => setPreview((p) => Math.min(shown.length - 1, p + 1))} disabled={preview >= shown.length - 1} className="h-10 w-10 rounded-xl bg-white/10 border border-white/20 text-[18px] font-black disabled:opacity-30">›</button>
              <button type="button" onClick={() => setPreview(null)} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[13px] font-black">닫기</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5"><StatementDoc st={cur.st} supplier={supplier} /></div>
            <div className="px-5 py-3.5 bg-white border-t border-[#E3E8F0] flex items-center gap-2">
              <label className="flex items-center gap-2 text-[13px] font-bold text-[#1B2B4B]"><input type="checkbox" checked={sel.has(cur.key)} onChange={() => toggle(cur.key)} />발송 대상에 포함</label>
              <span className="ml-auto">{statusChip(cur)}</span>
              <button type="button" onClick={() => { sendSelected(new Set([cur.key])); }} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black">이 기사에게 발송</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════ 과태료·사고 서류 ═════════════════════
const blank = () => ({ kind: "과태료", date: kstToday(), time: "", place: "", detail: "", agency: "", docNo: "", amount: "", dueDate: "", payer: PENALTY_PAYERS[0], status: "접수", memo: "", photos: [], deductPeriod: "" });
export function PenaltyCenter({ drivers = [], companyName = "", supplier = {} }) {
  const co = String(companyName || "").trim();
  const [list, setList] = React.useState([]);
  const [form, setForm] = React.useState(null); // { id?, driver, ...fields }
  const [dq, setDq] = React.useState("");
  const [view, setView] = React.useState(null);
  const [viewer, setViewer] = React.useState(null);
  const [fk, setFk] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef(null);
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(query(collection(db, "fleetPenalties"), where("companyName", "==", co)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))), () => setList([]));
  }, [co]);
  const matches = dq.trim() ? drivers.filter((d) => `${d.이름}${d.차량번호}${d.전화번호}`.replace(/\s/g, "").includes(dq.replace(/\s/g, ""))).slice(0, 8) : [];
  const pickDriver = (d) => { setForm((p) => ({ ...p, driverKey: d.id, driverId: d.appUid || d.id, driverName: d.이름, carNo: d.차량번호, phone: d.전화번호 })); setDq(""); };
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!form.driverName) return window.alert("대상 기사를 먼저 선택해 주세요.");
    setBusy(true);
    try {
      const data = { ...form, companyName: co, amount: toInt(form.amount), published: true, updatedAt: serverTimestamp() };
      delete data.id;
      if (form.id) await updateDoc(doc(db, "fleetPenalties", form.id), data);
      else await addDoc(collection(db, "fleetPenalties"), { ...data, createdAt: serverTimestamp(), by: me(), readAt: null });
      setForm(null);
    } catch (e) { window.alert(`저장 실패: ${e?.message || e}`); } finally { setBusy(false); }
  };
  const remove = async (p) => { if (await kpConfirm("이 서류를 삭제할까요? 기사앱 서류함에서도 사라집니다.")) await deleteDoc(doc(db, "fleetPenalties", p.id)); setView(null); };
  const shown = list.filter((p) => !fk || p.kind === fk);
  const sum = shown.reduce((s, p) => s + toInt(p.amount), 0);

  if (form) {
    const preview = { ...form, amount: toInt(form.amount), companyName: co, by: me() };
    return (
      <div>
        <Hero en="VEHICLE NOTICE · WRITE" title={form.id ? "서류 수정" : "과태료·사고 서류 작성"} desc="기사를 찾으면 정보가 채워집니다 · 오른쪽 미리보기 그대로 기사앱 서류함에 올라갑니다">
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm(null)} className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-[13px] font-bold">취소</button>
            <button type="button" onClick={save} disabled={busy} className="h-10 px-5 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black disabled:opacity-50">{busy ? "저장 중…" : "저장 · 기사에게 공개"}</button>
          </div>
        </Hero>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className={`${card} p-5 space-y-3.5`}>
            <div>
              <div className="text-[12.5px] font-black text-[#0F1A30] mb-1.5">대상 기사</div>
              {form.driverName ? (
                <div className="flex items-center gap-3 rounded-xl border border-[#C9D6EE] bg-[#F3F6FB] px-3.5 py-2.5">
                  <span className="w-9 h-9 rounded-xl bg-[#0F1A30] text-white flex items-center justify-center font-black">{String(form.driverName).slice(0, 1)}</span>
                  <div className="min-w-0 flex-1"><div className="text-[14px] font-black text-[#0F1A30]">{form.driverName}</div><div className="text-[12px] text-[#5B6B85]">{form.carNo} · {form.phone}</div></div>
                  <button type="button" onClick={() => set("driverName", "")} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-bold text-[#5B6B85] bg-white">변경</button>
                </div>
              ) : (
                <div className="relative">
                  <input autoFocus value={dq} onChange={(e) => setDq(e.target.value)} placeholder="이름 · 차량번호 · 연락처로 검색" className={`${inp} !h-11 w-full`} />
                  {matches.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-xl border border-[#DCE3EE] bg-white shadow-xl overflow-hidden">
                      {matches.map((d) => <button key={d.id} type="button" onClick={() => pickDriver(d)} className="w-full text-left px-3.5 py-2.5 hover:bg-[#F3F6FA] border-b border-[#EEF1F6] last:border-0"><b className="text-[#0F1A30]">{d.이름}</b> <span className="text-[12.5px] text-[#5B6B85]">{d.차량번호} · {d.전화번호}</span></button>)}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <div className="text-[12.5px] font-black text-[#0F1A30] mb-1.5">구분</div>
              <div className="flex flex-wrap gap-1.5">{PENALTY_KINDS.map((k) => <button key={k} type="button" onClick={() => set("kind", k)} className={`h-9 px-3 rounded-lg text-[12.5px] font-black border ${form.kind === k ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`}>{k}</button>)}</div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block"><span className="text-[11.5px] font-bold text-[#7A89A3]">발생일</span><CustomDatePicker value={form.date} onChange={(e) => set("date", e.target.value)} className={`${inp} w-full`} showIcon /></label>
              <label className="block"><span className="text-[11.5px] font-bold text-[#7A89A3]">시각</span><input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} className={`${inp} w-full`} /></label>
              <label className="block col-span-2"><span className="text-[11.5px] font-bold text-[#7A89A3]">발생 장소</span><input value={form.place} onChange={(e) => set("place", e.target.value)} placeholder="예: 경부고속도로 서울방향 123km" className={`${inp} w-full`} /></label>
              <label className="block col-span-2"><span className="text-[11.5px] font-bold text-[#7A89A3]">위반·사고 내용</span><textarea value={form.detail} onChange={(e) => set("detail", e.target.value)} rows={2} placeholder="예: 제한속도 100km/h 구간 128km/h 주행" className={`${inp} w-full !h-auto py-2`} /></label>
              <label className="block"><span className="text-[11.5px] font-bold text-[#7A89A3]">고지 기관</span><input value={form.agency} onChange={(e) => set("agency", e.target.value)} placeholder="예: ○○경찰서" className={`${inp} w-full`} /></label>
              <label className="block"><span className="text-[11.5px] font-bold text-[#7A89A3]">고지서 번호</span><input value={form.docNo} onChange={(e) => set("docNo", e.target.value)} className={`${inp} w-full`} /></label>
              <label className="block"><span className="text-[11.5px] font-bold text-[#7A89A3]">금액</span><input inputMode="numeric" value={form.amount ? toInt(form.amount).toLocaleString() : ""} onChange={(e) => set("amount", e.target.value.replace(/[^\d]/g, ""))} className={`${inp} w-full text-right`} /></label>
              <label className="block"><span className="text-[11.5px] font-bold text-[#7A89A3]">납부 기한</span><CustomDatePicker value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} className={`${inp} w-full`} showIcon /></label>
            </div>
            <div>
              <div className="text-[12.5px] font-black text-[#0F1A30] mb-1.5">부담 방식 · 처리 상태</div>
              <div className="flex flex-wrap gap-1.5 mb-2">{PENALTY_PAYERS.map((k) => <button key={k} type="button" onClick={() => set("payer", k)} className={`h-9 px-3 rounded-lg text-[12.5px] font-black border ${form.payer === k ? "bg-[#2D4C82] text-white border-[#2D4C82]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`}>{k}</button>)}</div>
              {String(form.payer).startsWith("기사 부담") && (
                <div className="flex items-center gap-2 mb-2"><span className="text-[12px] font-bold text-[#5B6B85]">공제할 정산월</span><input type="month" value={form.deductPeriod || String(form.date || "").slice(0, 7)} onChange={(e) => set("deductPeriod", e.target.value)} className={inp} /><span className="text-[11.5px] text-[#9AA9C3]">일괄 지급명세서 공제에 자동으로 들어갑니다</span></div>
              )}
              <div className="flex flex-wrap gap-1.5">{["접수", "기사 확인", "납부 완료", "이의 신청", "취소"].map((k) => <button key={k} type="button" onClick={() => set("status", k)} className={`h-8 px-3 rounded-lg text-[12px] font-black border ${form.status === k ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`}>{k}</button>)}</div>
            </div>
            <div>
              <div className="text-[12.5px] font-black text-[#0F1A30] mb-1.5">고지서·현장 사진 <span className="text-[11.5px] font-semibold text-[#9AA9C3]">(최대 4장 · 촬영해서 바로 올리기)</span></div>
              <div className="grid grid-cols-4 gap-2">
                {(form.photos || []).map((src, i) => (
                  <div key={i} className="relative aspect-[4/3] rounded-xl overflow-hidden border border-[#DCE3EE] bg-[#F3F6FA]">
                    <img src={src} alt="" className="w-full h-full object-contain" />
                    <button type="button" onClick={() => set("photos", form.photos.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-[#0B1428]/80 text-white text-[12px]">✕</button>
                  </div>
                ))}
                {(form.photos || []).length < 4 && <button type="button" onClick={() => fileRef.current?.click()} className="aspect-[4/3] rounded-xl border-2 border-dashed border-[#C9D2E0] text-[#5B6B85] text-[12.5px] font-bold">+ 사진</button>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={async (e) => { const fs = [...(e.target.files || [])].slice(0, 4 - (form.photos || []).length); e.target.value = ""; const out = await Promise.all(fs.map((f) => compressImage(f, 1600, 0.82))).catch(() => []); set("photos", [...(form.photos || []), ...out].slice(0, 4)); }} />
            </div>
            <label className="block"><span className="text-[11.5px] font-bold text-[#7A89A3]">기사에게 남길 말</span><textarea value={form.memo} onChange={(e) => set("memo", e.target.value)} rows={2} placeholder="예: 이번 달 정산에서 공제됩니다. 이의가 있으면 담당자에게 연락 주세요." className={`${inp} w-full !h-auto py-2`} /></label>
          </div>
          <div className="lg:sticky lg:top-3 self-start">
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#2D4C82] mb-2" style={{ fontFamily: MONO }}>LIVE PREVIEW · 기사앱에 이렇게 보입니다</div>
            <PenaltyDoc p={preview} supplier={supplier} onPhoto={(i) => setViewer({ images: form.photos, index: i })} />
          </div>
        </div>
        {viewer && <ImageViewer images={viewer.images} index={viewer.index} onClose={() => setViewer(null)} name="고지서" />}
      </div>
    );
  }

  return (
    <div>
      <Hero en="VEHICLE NOTICE" title="과태료 · 사고 서류" desc="회사로 온 과태료·범칙금·사고·보험 할증 우편을 서류로 만들어 기사앱 서류함에 보냅니다">
        <div className="flex items-center gap-2">
          {[["전체", `${list.length}건`], ["미처리", `${list.filter((p) => !["납부 완료", "취소"].includes(p.status)).length}건`], ["금액 합계", `${won(sum)}원`]].map(([k, v]) => (
            <div key={k} className="px-3.5 py-1.5 rounded-xl bg-white/[0.07] border border-white/10"><div className="text-[10.5px] font-bold text-white/55">{k}</div><div className="text-[16px] font-black tabular-nums" style={{ fontFamily: MONO }}>{v}</div></div>
          ))}
          <button type="button" onClick={() => setForm(blank())} className="h-11 px-5 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black">+ 서류 작성</button>
        </div>
      </Hero>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {["", ...PENALTY_KINDS].map((k) => <button key={k || "all"} type="button" onClick={() => setFk(k)} className={`h-8 px-3 rounded-lg text-[12.5px] font-black ${fk === k ? "bg-[#0F1A30] text-white" : "bg-white border border-[#DCE3EE] text-[#3A4A66]"}`}>{k || "전체"}</button>)}
      </div>
      <div className={`${card} overflow-hidden`}>
        <div className="grid grid-cols-[96px_110px_minmax(0,1fr)_120px_110px_96px_80px] gap-3 px-4 h-10 items-center bg-[#0B1428] text-[#C9D6EE] text-[11.5px] font-black">
          <span>발생일</span><span>구분</span><span>기사 · 내용</span><span className="text-right">금액</span><span>부담</span><span>상태</span><span className="text-center">기사 확인</span>
        </div>
        {shown.map((p) => (
          <button key={p.id} type="button" onClick={() => setView(p)} className="w-full grid grid-cols-[96px_110px_minmax(0,1fr)_120px_110px_96px_80px] gap-3 px-4 h-[54px] items-center border-b border-[#EEF1F6] text-left hover:bg-[#F5F8FD]">
            <span className="text-[12.5px] tabular-nums text-[#5B6B85]" style={{ fontFamily: MONO }}>{p.date}</span>
            <span><Chip>{p.kind}</Chip></span>
            <span className="min-w-0"><span className="block text-[13.5px] font-black text-[#0F1A30] truncate">{p.driverName} <span className="font-semibold text-[#7A89A3]">{p.carNo}</span></span><span className="block text-[12px] text-[#5B6B85] truncate">{p.detail || p.place || "-"}</span></span>
            <span className="text-right text-[13.5px] font-black tabular-nums" style={{ fontFamily: MONO }}>{won(p.amount)}</span>
            <span className="text-[12px] font-bold text-[#3A4A66] truncate">{p.payer}</span>
            <span><Chip dark={p.status === "납부 완료"}>{p.status}</Chip></span>
            <span className="text-center text-[12px] font-bold text-[#5B6B85]">{p.readAt ? "✓ 읽음" : "-"}</span>
          </button>
        ))}
        {!shown.length && <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">등록된 서류가 없습니다</div>}
      </div>
      {view && (
        <div className="fixed inset-0 z-[99990] bg-[#0B1428]/55 flex justify-end">
          <div className="w-full max-w-[820px] h-full bg-[#F3F6FA] flex flex-col shadow-2xl">
            <div className="px-5 py-4 flex items-center gap-2 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
              <div className="flex-1 min-w-0 text-[17px] font-black truncate">{view.kind} · {view.driverName}</div>
              <button type="button" onClick={() => { setForm({ ...blank(), ...view }); setView(null); }} className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-[13px] font-black">수정</button>
              <button type="button" onClick={() => remove(view)} className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-[13px] font-black">삭제</button>
              <button type="button" onClick={() => setView(null)} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[13px] font-black">닫기</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5"><PenaltyDoc p={view} supplier={supplier} onPhoto={(i) => setViewer({ images: view.photos, index: i })} /></div>
          </div>
        </div>
      )}
      {viewer && <ImageViewer images={viewer.images} index={viewer.index} onClose={() => setViewer(null)} name="고지서" />}
    </div>
  );
}
