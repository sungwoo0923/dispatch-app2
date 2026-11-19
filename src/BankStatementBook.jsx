// ======================= src/BankStatementBook.jsx =======================
// 🏦 2026-11-19 자금관리 › 통장 내역 — 은행 거래내역 엑셀 한 번 올리면 입금 · 출금을 한 곳에서(태진 요청)
//  · 입금 → [미수금과 맞추기] 정산관리 › 거래처정산 › 미수금관리로 넘겨 예전 자동 매칭(matchDeposits) 창을 바로 연다(kp-bank-ar-match)
//  · 출금 → 지급 대기 지출결의와 금액 · 이름으로 맞춰 본다(문서 전체 금액 또는 지출 내역 한 줄) → [지급 완료] (경리 · 지급 권한만)
//      문서 전체면 지급완료(paid) · 한 줄이면 줄별 지급 체크(paidLines) — 마지막 줄까지 체크되면 문서도 지급완료
//  · 어디에도 안 맞고 장부에도 없는 줄 → [장부에 넣기](수입·지출 장부 acctLedger, 고른 통장으로)
//  · 올린 내용은 이 브라우저 탭에만 잠깐 둔다(sessionStorage) — 회사 서버에 통장 원본을 저장하지 않는다
//  읽기 · 맞추기 식: src/bankStmtCore.js (테스트 scripts/bankStmt.test.mjs)
import React from "react";
import { addDoc, arrayUnion, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db, auth } from "./firebase";
import { BookHero, BookCard, Chip, MONO } from "./OfficeBooks";
import { useCompanyRows } from "./companyColStore";
import { useMyProfile } from "./userNames";
import { isFinUser, payState } from "./approvalPay";
import { suggestAccount, vatSplit } from "./acctSuggest";
import { kpConfirm } from "./kpDialog";
import { parseStatement, summarize, depositsOf, matchWithdrawals, ledgerKeys, txnLedgerKey } from "./bankStmtCore";

const won = (n) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;
const NUM = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };
const SKEY = (co) => `kpBankStmt:${co}`;
const readSess = (co) => { try { const v = JSON.parse(sessionStorage.getItem(SKEY(co)) || "null"); return v && Array.isArray(v.txns) ? v : null; } catch { return null; } };
const writeSess = (co, v) => { try { sessionStorage.setItem(SKEY(co), JSON.stringify(v)); } catch { /* 무시 */ } };
const btn = "h-9 px-3 rounded-lg text-[13px] font-black whitespace-nowrap disabled:opacity-40";

export default function BankStatementBook({ company, isViewer = false }) {
  const uid = auth.currentUser?.uid || "";
  const me = useMyProfile(uid);
  const fin = !isViewer && isFinUser(me || {});
  const ledger = useCompanyRows("acctLedger", company);
  const funds = useCompanyRows("acctFunds", company);
  const [st, setSt] = React.useState(() => readSess(company) || { txns: [], file: "", done: {}, fundId: "" });
  const save = React.useCallback((f) => setSt((p) => { const n = typeof f === "function" ? f(p) : f; writeSess(company, n); return n; }), [company]);
  const [docs, setDocs] = React.useState([]);
  const [view, setView] = React.useState("전체");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const fileRef = React.useRef(null);

  // 지급 대기 지출결의(출금 맞추기 후보)
  React.useEffect(() => {
    if (!company || isViewer) return undefined;
    return onSnapshot(query(collection(db, "approvals"), where("company", "==", company), where("cat", "==", "expense")),
      (s) => setDocs(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => payState(d) === "wait" && d.cancel?.status !== "pending")), () => setDocs([]));
  }, [company, isViewer]);

  const txns = st.txns;
  const S = React.useMemo(() => summarize(txns), [txns]);
  const outs = React.useMemo(() => txns.map((t, i) => ({ ...t, _i: i })).filter((t) => t.out > 0), [txns]);
  const match = React.useMemo(() => { const m = matchWithdrawals(outs, docs); const byId = new Map(); m.forEach((v, ti) => byId.set(outs[ti].id, v)); return byId; }, [outs, docs]);
  const docOf = React.useCallback((id) => docs.find((d) => d.id === id), [docs]);
  const keys = React.useMemo(() => ledgerKeys(ledger || []), [ledger]);
  const fundOpts = (funds || []).filter((f) => f.active !== false && !["대출"].includes(f.kind));
  const stateOf = (t) => {
    if (st.done[t.id]) return st.done[t.id];
    if (t.out && match.has(t.id)) return "match";
    if (keys.has(txnLedgerKey(t))) return "inLedger";
    return t.in ? "in" : "none";
  };
  const counts = React.useMemo(() => {
    const c = { match: 0, none: 0, in: 0 };
    for (const t of txns) { const s = stateOf(t); if (s === "match") c.match++; else if (s === "none") c.none++; else if (s === "in") c.in++; }
    return c;
  }, [txns, match, keys, st.done]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = txns.filter((t) => view === "전체" || (view === "입금" && t.in) || (view === "출금" && t.out) || (view === "장부에 없음" && ["none", "in"].includes(stateOf(t))));

  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    setMsg("");
    try {
      const XLSX = window.XLSX || (await import("xlsx"));
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array", cellDates: false });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true });
      const r = parseStatement(aoa);
      if (!r.txns.length) { setMsg(r.error || "거래 내역을 찾지 못했어요. 은행에서 받은 엑셀 그대로 올려 주세요."); return; }
      save((p) => ({ txns: r.txns, file: f.name, done: {}, fundId: p.fundId || "" }));
      setView("전체");
    } catch (er) { setMsg(`엑셀을 읽지 못했어요: ${er.message || er}`); }
  };

  // 입금 → 미수금관리 자동 매칭 창
  const toAr = () => {
    const deps = depositsOf(txns.filter((t) => !st.done[t.id]));
    if (!deps.length) return;
    const ev = new CustomEvent("kp-bank-ar-match", { detail: { deposits: deps, handled: false } });
    window.dispatchEvent(ev);
    if (!ev.detail.handled) setMsg("미수금 맞추기는 PC 화면의 정산관리 › 거래처정산 › 미수금관리에서 열려요.");
  };

  // 출금 → 지출결의 지급 완료(문서) 또는 줄 체크
  const payOne = async (t, { ask = true } = {}) => {
    const m = match.get(t.id); const d = m && docOf(m.docId);
    if (!d) return false;
    const what = m.lineIdx == null ? `「${d.title}」 ${won(d.amount)}` : `「${d.title}」의 ${m.lineIdx + 1}번째 줄(${d.data?.lines?.[m.lineIdx]?.vendor || ""}) ${won(t.out)}`;
    if (ask && !(await kpConfirm(`${what}을\n${t.date} 통장 출금(${t.name || t.memo || "-"})으로 지급 처리할까요?`))) return false;
    const now = Date.now(); const by = { at: now, by: uid, byName: me?.name || "" };
    const memo = `통장 내역 대조 · ${t.name || t.memo || ""}`.trim();
    const lines = Array.isArray(d.data?.lines) ? d.data.lines : [];
    const patch = { updatedAt: serverTimestamp() };
    let whole = m.lineIdx == null;
    if (!whole) {
      patch[`paidLines.${m.lineIdx}`] = by;
      const left = lines.filter((_, i) => i !== m.lineIdx && !d.paidLines?.[i]).length;
      if (lines.length && left === 0) whole = true; // 마지막 줄 — 문서도 지급완료
    }
    if (whole) {
      patch.paid = { ...by, date: t.date, memo };
      patch.history = arrayUnion({ at: now, uid, name: me?.name || "", action: "지급 완료", comment: `지급일 ${t.date} · ${memo}` });
      if (d.drafterUid && d.drafterUid !== uid) patch.drafterUnread = true;
    }
    await updateDoc(doc(db, "approvals", d.id), patch);
    if (whole && Array.isArray(d.data?.vexIds) && d.data.vexIds.length) import("./vehicleExpense").then((x) => x.syncExpensesPaid(d, { at: now, date: t.date, byName: me?.name || "" })).catch(() => {});
    save((p) => ({ ...p, done: { ...p.done, [t.id]: whole ? "paid" : "paidLine" } }));
    return true;
  };
  const payAll = async () => {
    const todo = txns.filter((t) => stateOf(t) === "match");
    if (!todo.length || !(await kpConfirm(`맞춘 출금 ${todo.length}건을 지출결의 지급 완료로 처리할까요?\n(지급일은 통장 출금일로 들어가요)`))) return;
    setBusy(true); let ok = 0;
    try { for (const t of todo) { if (await payOne(t, { ask: false })) ok++; } setMsg(`${ok}건을 지급 처리했어요.`); }
    catch (er) { setMsg(`지급 처리 중 멈췄어요: ${er.message}`); } finally { setBusy(false); }
  };

  // 장부에 넣기
  const toLedger = async (t) => {
    const type = t.in ? "수입" : "지출"; const amount = t.in || t.out;
    const sug = suggestAccount({ type, vendor: t.name, item: t.memo || t.name, memo: t.memo }, ledger || []);
    const vs = vatSplit(amount, true);
    await addDoc(collection(db, "acctLedger"), {
      date: t.date, type, account: sug?.account || "기타", fundId: st.fundId || "", item: (t.name || t.memo || "통장 거래").slice(0, 80), amount, method: "계좌이체",
      vendor: (t.name || "").slice(0, 80), memo: `통장 내역 올리기${t.memo ? ` · ${t.memo}` : ""}`.slice(0, 200), evidence: "", receipt: "", companyName: company,
      supply: vs.supply, vat: vs.vat, accountAuto: sug?.from || "", source: "bankStmt", createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "",
    });
    save((p) => ({ ...p, done: { ...p.done, [t.id]: "ledger" } }));
  };
  const ledgerAll = async () => {
    const todo = txns.filter((t) => stateOf(t) === "none");
    if (!todo.length || !(await kpConfirm(`지출결의와 안 맞고 장부에도 없는 출금 ${todo.length}건을 수입·지출 장부에 넣을까요?\n계정과목은 자동으로 골라 두니, 장부에서 확인해 주세요.`))) return;
    setBusy(true);
    try { for (const t of todo) await toLedger(t); setMsg(`${todo.length}건을 장부에 넣었어요.`); }
    catch (er) { setMsg(`장부에 넣다가 멈췄어요: ${er.message}`); } finally { setBusy(false); }
  };
  const run = (fn) => async () => { setBusy(true); setMsg(""); try { await fn(); } catch (er) { setMsg(`처리하지 못했어요: ${er.message}`); } finally { setBusy(false); } };

  const badge = (t) => {
    const s = stateOf(t);
    if (s === "paid") return <span className="text-[12px] font-black text-[#B42318]">지급 완료 처리함</span>;
    if (s === "paidLine") return <span className="text-[12px] font-black text-[#067647]">줄 지급 체크함</span>;
    if (s === "ledger") return <span className="text-[12px] font-black text-[#067647]">장부에 넣음</span>;
    if (s === "inLedger") return <span className="text-[12px] font-bold text-[#7A879C]">장부에 있음</span>;
    if (s === "match") {
      const m = match.get(t.id); const d = docOf(m.docId);
      return (
        <span className="flex items-center gap-2 flex-wrap justify-end">
          <span className="text-[12px] font-bold text-[#2D4C82] text-right">지출결의 · {d?.title || ""}{m.lineIdx != null ? ` · ${m.lineIdx + 1}번째 줄` : ""}{d?.drafter?.name ? ` · ${d.drafter.name}` : ""}{!m.sure && <span className="ml-1 text-[#B54708]">(확인 필요)</span>}</span>
          {fin ? <button type="button" disabled={busy} onClick={run(() => payOne(t))} className={`${btn} bg-[#0F1A30] text-white`} data-testid="bank-pay">지급 완료</button> : <span className="text-[12px] text-[#7A879C]">경리가 처리</span>}
        </span>
      );
    }
    if (s === "in") return <span className="text-[12px] font-bold text-[#2D4C82]">미수금 맞추기 대상</span>;
    return !isViewer ? <button type="button" disabled={busy} onClick={run(() => toLedger(t))} className={`${btn} border border-[#DCE3EE] bg-white text-[#1B2B4B]`} data-testid="bank-ledger">장부에 넣기</button> : null;
  };

  return (
    <div className="space-y-4" data-testid="bank-stmt">
      <BookHero en="FINANCE · BANK STATEMENT" title="통장 내역" desc="은행 거래내역 엑셀을 올리면 입금은 미수금, 출금은 지출결의와 맞춰 봐요"
        kpis={txns.length ? [[`입금 ${S.nIn}건`, won(S.in)], [`출금 ${S.nOut}건`, won(S.out)], ["지출결의와 맞음", `${counts.match}건`], ["장부에 없는 출금", `${counts.none}건`]] : []}
        right={!isViewer && <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} data-testid="bank-file" />
          <button type="button" onClick={() => fileRef.current?.click()} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black">통장 엑셀 올리기</button>
        </div>} />

      {msg && <div className="rounded-xl bg-[#F5F8FD] border border-[#DCE3EE] px-4 py-2.5 text-[14px] font-bold text-[#1B2B4B]" role="status">{msg}</div>}

      {!txns.length ? (
        <BookCard en="HOW TO" title="이렇게 하면 돼요">
          <ol className="px-4 pb-4 space-y-2 text-[14px] text-[#3A4A66] leading-relaxed list-decimal list-inside">
            <li>은행 인터넷뱅킹 › <b>거래내역 조회</b>에서 기간을 고르고 <b>엑셀 저장</b>을 눌러요.</li>
            <li>위 <b>[통장 엑셀 올리기]</b>를 눌러 그 파일을 그대로 올려요(기업 · 국민 · 농협 · 신한 · 우리 · 하나 등, 위에 제목 줄이 있어도 돼요).</li>
            <li><b>입금</b>은 [미수금과 맞추기]를 누르면 거래처 미수금과 자동으로 맞춰요.</li>
            <li><b>출금</b>은 지급 대기 지출결의와 금액 · 이름으로 맞춰 줘요. [지급 완료]를 누르면 끝나요.</li>
            <li>어디에도 안 맞는 출금은 [장부에 넣기]로 수입·지출 장부에 남겨요.</li>
          </ol>
          <div className="px-4 pb-4 text-[12.5px] text-[#7A879C]">올린 엑셀은 이 화면에서만 잠깐 보여요. 통장 원본은 회사 서버에 저장하지 않아요.</div>
        </BookCard>
      ) : (
        <BookCard en="TRANSACTIONS" title={`${st.file || "통장 내역"} · ${S.from} ~ ${S.to}`}
          right={<button type="button" onClick={() => save({ txns: [], file: "", done: {}, fundId: st.fundId })} className={`${btn} border border-[#DCE3EE] text-[#5B6B85]`}>지우기</button>}>
          <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
            {["전체", "입금", "출금", "장부에 없음"].map((k) => <Chip key={k} on={view === k} onClick={() => setView(k)}>{k}</Chip>)}
            <span className="flex-1" />
            {!isViewer && fundOpts.length > 0 && (
              <label className="flex items-center gap-1.5 text-[13px] font-bold text-[#5B6B85]">어느 통장?
                <select value={st.fundId} onChange={(e) => save((p) => ({ ...p, fundId: e.target.value }))} className="h-9 px-2 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-bold text-[#0F1A30]" data-testid="bank-fund">
                  <option value="">고르지 않음</option>
                  {fundOpts.map((f) => <option key={f.id} value={f.id}>{f.name || f.bank || "통장"}</option>)}
                </select>
              </label>
            )}
          </div>
          {!isViewer && (
            <div className="px-4 pb-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy || !counts.in} onClick={toAr} className={`${btn} bg-[#2D4C82] text-white`} data-testid="bank-to-ar">입금 {counts.in}건 → 미수금과 맞추기</button>
              {fin && <button type="button" disabled={busy || !counts.match} onClick={payAll} className={`${btn} bg-[#0F1A30] text-white`} data-testid="bank-pay-all">맞은 출금 {counts.match}건 지급 완료</button>}
              <button type="button" disabled={busy || !counts.none} onClick={ledgerAll} className={`${btn} border border-[#DCE3EE] bg-white text-[#1B2B4B]`} data-testid="bank-ledger-all">안 맞는 출금 {counts.none}건 장부에 넣기</button>
            </div>
          )}
          <ul className="border-t border-[#EEF1F6]">
            {list.map((t) => (
              <li key={t.id} className="px-4 py-2.5 border-b border-[#EEF1F6] last:border-b-0 flex items-center gap-3 flex-wrap md:flex-nowrap">
                <span className="w-[86px] shrink-0 text-[12.5px] font-bold text-[#5B6B85]" style={NUM}>{t.date.slice(5)}{t.time ? ` ${t.time.slice(0, 5)}` : ""}</span>
                <span className={`shrink-0 text-[11.5px] font-black px-1.5 py-0.5 rounded ${t.in ? "bg-[#EEF3FC] text-[#2D4C82]" : "bg-[#FEF3F2] text-[#B42318]"}`}>{t.in ? "입금" : "출금"}</span>
                <span className="flex-1 min-w-[120px] text-[14px] font-bold text-[#0F1A30] truncate">{t.name || "-"}{t.memo && <span className="ml-1.5 text-[12.5px] font-medium text-[#7A879C]">{t.memo}</span>}</span>
                <span className={`shrink-0 text-[14.5px] font-black ${t.in ? "text-[#2D4C82]" : "text-[#0F1A30]"}`} style={NUM}>{t.in ? "+" : "−"}{won(t.in || t.out)}</span>
                <span className="w-full md:w-auto md:min-w-[220px] flex justify-end">{badge(t)}</span>
              </li>
            ))}
            {!list.length && <li className="px-4 py-10 text-center text-[14px] text-[#7A879C]">이 조건에 맞는 거래가 없어요</li>}
          </ul>
        </BookCard>
      )}
    </div>
  );
}
