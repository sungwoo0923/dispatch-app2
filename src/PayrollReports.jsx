// ======================= src/PayrollReports.jsx =======================
// ⭐ 2026-11-07 급여관리 › 신고 · 이체(경리 도구) — 한 달 명세서로 바로 쓰는 표와 파일
//  · 원천세 신고 요약(원천징수이행상황신고서 A01 근로 간이세액 · A03 일용근로 · A25 사업소득) — 소득세 · 지방소득세 합계 · 신고 기한
//  · 4대보험 합계(근로자 + 회사)와 공단 고지액 비교(고지액은 payrollRuns/{회사}_{월}.insNotice에 저장)
//  · 은행 대량이체 파일(엑셀 · CSV) — 계좌 없는 직원은 따로 알림
//  · 급여대장 엑셀(항목별 열) · 전월 대비 변동(10% 넘게 바뀐 사람 · 신규 · 빠진 사람) · 올해 누계(연말정산 대비)
import React from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { BookHero } from "./OfficeBooks";
import { wonFmt, withholdingSummary, insuranceSummary, compareMonths, transferRows, yearToDate } from "./payrollCalc";
import { formatAccount } from "./bankUtil";
import { PAY_TYPE_LABEL } from "./payslipDoc";
import { kstYm, shiftYm, ymLabel, runId, toNum, uniq, NUMS, sec, H, Sel, Money, Note, btnLine, btnDark, useCol, useDocData, downloadXlsx, downloadCsv } from "./payrollUi";

const pct = (x) => (x === null || x === undefined ? "" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(1)}%`);
const Th = ({ children, right }) => <th className={`px-3 py-2.5 text-[14px] font-black text-[#3A4A66] whitespace-nowrap ${right ? "text-right" : "text-left"}`}>{children}</th>;
const Td = ({ children, right, strong }) => <td className={`px-3 py-2.5 text-[14px] whitespace-nowrap ${right ? "text-right" : ""} ${strong ? "font-black text-[#0F1A30]" : "font-bold text-[#3A4A66]"}`} style={right ? NUMS : undefined}>{children}</td>;
function Table({ head, children, foot, min = 560 }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#E3E8F0]">
      <table className="w-full text-[14px]" style={{ minWidth: min }}>
        <thead className="bg-[#F5F8FD]"><tr>{head}</tr></thead>
        <tbody className="divide-y divide-[#EEF1F6]">{children}</tbody>
        {foot && <tfoot className="bg-[#EEF3FC] border-t-2 border-[#1B2B4B]"><tr>{foot}</tr></tfoot>}
      </table>
    </div>
  );
}

export default function PayrollReports({ company }) {
  const [ym, setYm] = React.useState(() => shiftYm(kstYm(), -1));
  const allSlips = useCol("payslips", company);
  const run = useDocData("payrollRuns", company ? runId(company, ym) : "");
  const slips = React.useMemo(() => (allSlips || []).filter((s) => s.ym === ym && s.result).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko")), [allSlips, ym]);
  const prev = React.useMemo(() => (allSlips || []).filter((s) => s.ym === shiftYm(ym, -1) && s.result), [allSlips, ym]);
  const yms = uniq([kstYm(), ...Array.from({ length: 13 }, (_, i) => shiftYm(kstYm(), -i - 1)), ...(allSlips || []).map((s) => s.ym), ym]).sort().reverse();
  const nDraft = slips.filter((s) => s.status === "draft").length;
  const wh = withholdingSummary(slips);
  const ins = insuranceSummary(slips);
  const tr = transferRows(slips);
  const cmp = compareMonths(slips, prev).filter((x) => x.kind !== "same").sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const year = Number(ym.slice(0, 4));
  const ytd = yearToDate((allSlips || []).filter((s) => s.status !== "draft"), year);
  const payDate = run?.payDate || slips[0]?.payDate || `${shiftYm(ym, 1)}-10`;
  const dueYm = shiftYm(String(payDate).slice(0, 7), 1);
  const [notice, setNotice] = React.useState({});
  React.useEffect(() => { setNotice(run?.insNotice || {}); }, [run?.insNotice, ym]);
  const [saving, setSaving] = React.useState(false);
  const saveNotice = async () => {
    setSaving(true);
    try { await setDoc(doc(db, "payrollRuns", runId(company, ym)), { companyName: company, ym, insNotice: Object.fromEntries(Object.entries(notice).map(([k, v]) => [k, toNum(v)])), insNoticeAt: serverTimestamp(), insNoticeBy: auth.currentUser?.email || "" }, { merge: true }); } catch (e) { alert(`저장하지 못했어요: ${e.message}`); } finally { setSaving(false); }
  };
  const label = `${company}_${ym}`;

  const exportTransfer = (kind) => {
    const head = ["입금은행", "입금계좌번호", "예금주", "이체금액", "받는분 통장표시", "내 통장표시"];
    const rows = tr.ok.map((r) => [r.bank, r.acct, r.holder, r.amount, `${company} 급여`.slice(0, 10), `${Number(ym.slice(5, 7))}월급여 ${r.name}`.slice(0, 10)]);
    if (kind === "csv") downloadCsv(`급여이체_${label}`, [head, ...rows]);
    else downloadXlsx(`급여이체_${label}`, [["대량이체", [head, ...rows, [], ["합계", "", "", tr.total]], [10, 20, 12, 14, 14, 16]]]);
  };
  const exportLedger = () => {
    const eLabels = uniq(slips.flatMap((s) => (s.result.earnings || []).map((e) => e.label)));
    const dLabels = uniq(slips.flatMap((s) => (s.result.deductions || []).map((d) => d.label)));
    const head = ["성명", "부서", "직책", "고용형태", "급여형태", "근로일수", "연장(h)", "야간(h)", "휴일(h)", ...eLabels, "지급 총액", "과세", "비과세", ...dLabels, "공제 총액", "실지급액", "지급 계좌", "상태"];
    const rows = slips.map((s) => {
      const r = s.result; const w = r.work || {};
      const e = (l) => (r.earnings || []).filter((x) => x.label === l).reduce((a, x) => a + x.amount, 0);
      const d = (l) => (r.deductions || []).filter((x) => x.label === l).reduce((a, x) => a + x.amount, 0);
      return [s.name, s.team || "", s.position || "", s.employmentType || "", PAY_TYPE_LABEL[s.payType] || "", w.workDays || 0, w.otHours || 0, w.nightHours || 0, (w.holHours || 0) + (w.holOverHours || 0), ...eLabels.map(e), r.gross, r.taxable, r.nonTaxable, ...dLabels.map(d), r.totalDeduct, r.net, s.payAccount?.bank ? `${s.payAccount.bank} ${formatAccount(s.payAccount.bank, s.payAccount.acct)}` : "", { draft: "작성 중", confirmed: "확정", paid: "지급 완료" }[s.status] || s.status || ""];
    });
    const sum = (i) => rows.reduce((a, r) => a + (Number(r[i]) || 0), 0);
    const total = head.map((h, i) => (i === 0 ? "합계" : i >= 5 && i < head.length - 2 ? sum(i) : ""));
    downloadXlsx(`급여대장_${label}`, [["급여대장", [[`${company} ${ymLabel(ym)} 급여대장`], [], head, ...rows, total], head.map((h) => Math.max(8, h.length * 2 + 2))]]);
  };
  const exportYtd = () => {
    const head = ["성명", "개월 수", "지급 총액", "과세 급여", "비과세", "소득세", "지방소득세", "4대보험(근로자)", "실지급 합계"];
    downloadXlsx(`급여누계_${company}_${year}`, [[`${year}년 누계`, [head, ...ytd.map((x) => [x.name, x.months, x.gross, x.taxable, x.nonTaxable, x.tax, x.local, x.ins, x.net])], [12, 8, 14, 14, 12, 12, 12, 14, 14]]]);
  };

  const loading = allSlips === null;
  return (
    <div className="space-y-3" data-testid="payroll-reports">
      <BookHero en={`PAYROLL · REPORTS · ${ym}`} title="신고 · 이체" desc="원천세 신고 · 4대보험 확인 · 급여 이체 파일 · 급여대장을 한 번에"
        kpis={[["대상", `${slips.length}명`, nDraft ? `작성 중 ${nDraft}명 포함` : "확정분"], ["원천세 합계", `${wonFmt(wh.tax + wh.local)}원`, `소득세 ${wonFmt(wh.tax)} · 지방 ${wonFmt(wh.local)}`], ["4대보험 합계", `${wonFmt(ins.reduce((a, x) => a + x.total, 0))}원`, "근로자 + 회사"], ["이체 합계", `${wonFmt(tr.total)}원`, tr.missing.length ? `계좌 없음 ${tr.missing.length}명` : `${tr.ok.length}명`]]}
        right={<Sel dark ariaLabel="귀속 월" value={ym} onChange={(v) => v && setYm(v)} options={yms.map((m) => [m, ymLabel(m)])} className="w-[180px]" testid="rep-month" />} />
      {loading ? <div className="py-16 text-center text-[15px] font-bold text-[#7A879C]">불러오는 중…</div> : !slips.length ? (
        <div className={`${sec} py-16 text-center text-[15px] font-bold text-[#5B6B85]`}>{ymLabel(ym)} 급여 기록이 없어요. 월 급여 계산에서 먼저 저장해 주세요.</div>
      ) : (
        <>
          {nDraft > 0 && <Note>작성 중인 명세서 {nDraft}건이 섞여 있어요. 확정한 뒤에 신고·이체하세요.</Note>}
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3 items-start">
            {/* 원천세 */}
            <div className={sec}>
              <H en="WITHHOLDING TAX" right={<span className="text-[14px] font-bold text-[#5B6B85]">신고·납부 기한 <b className="text-[#0F1A30]" style={NUMS}>{dueYm}-10</b></span>}>원천세 신고 요약</H>
              <div className="px-4 pb-4 space-y-2">
                <Table head={<><Th>코드</Th><Th>소득 종류</Th><Th right>인원</Th><Th right>총지급액</Th><Th right>소득세</Th><Th right>지방소득세</Th></>}
                  foot={<><Td strong>합계</Td><Td /><Td right strong>{wh.rows.reduce((a, x) => a + x.n, 0)}</Td><Td right strong>{wonFmt(wh.rows.reduce((a, x) => a + x.pay, 0))}</Td><Td right strong>{wonFmt(wh.tax)}</Td><Td right strong>{wonFmt(wh.local)}</Td></>}>
                  {wh.rows.map((x) => <tr key={x.code}><Td strong>{x.code}</Td><Td>{x.label}</Td><Td right>{x.n}</Td><Td right>{wonFmt(x.pay)}</Td><Td right strong>{wonFmt(x.tax)}</Td><Td right>{wonFmt(x.local)}</Td></tr>)}
                </Table>
                <div className="text-[14px] font-bold text-[#5B6B85] leading-relaxed">근로소득 총지급액은 과세 급여 기준이에요(비과세 {wonFmt(wh.nonTaxable)}원 제외). 지방소득세는 위택스에 따로 신고해요.</div>
              </div>
            </div>
            {/* 4대보험 */}
            <div className={sec}>
              <H en="SOCIAL INSURANCE" right={<button type="button" disabled={saving} onClick={saveNotice} className={btnLine} data-testid="ins-save">{saving ? "저장 중…" : "고지액 저장"}</button>}>4대보험 · 고지액 비교</H>
              <div className="px-4 pb-4 space-y-2">
                <Table min={620} head={<><Th>보험</Th><Th right>근로자</Th><Th right>회사</Th><Th right>계산 합계</Th><Th right>공단 고지액</Th><Th right>차이</Th></>}>
                  {ins.map((x) => {
                    const n = toNum(notice[x.key]); const diff = n ? n - x.total : null;
                    return (
                      <tr key={x.key}>
                        <Td strong>{x.label}</Td><Td right>{wonFmt(x.emp)}</Td><Td right>{wonFmt(x.er)}</Td><Td right strong>{wonFmt(x.total)}</Td>
                        <td className="px-2 py-1.5 w-[150px]"><Money value={notice[x.key]} onChange={(v) => setNotice((o) => ({ ...o, [x.key]: v }))} placeholder="고지액" className="!h-10" testid={`ins-${x.key}`} /></td>
                        <td className={`px-3 py-2.5 text-right text-[14px] font-black whitespace-nowrap ${diff === null ? "text-[#7A879C]" : diff === 0 ? "text-[#2D4C82]" : "text-[#B42318]"}`} style={NUMS}>{diff === null ? "-" : diff === 0 ? "일치" : `${diff > 0 ? "+" : ""}${wonFmt(diff)}`}</td>
                      </tr>
                    );
                  })}
                </Table>
                <div className="text-[14px] font-bold text-[#5B6B85] leading-relaxed">고지서의 근로자 + 회사 합계를 넣으면 차이를 보여 줘요. 차이가 나면 보수월액 신고값이나 정산분을 확인하세요.</div>
              </div>
            </div>
            {/* 이체 */}
            <div className={sec}>
              <H en="BANK TRANSFER" right={<><button type="button" disabled={!tr.ok.length} onClick={() => exportTransfer("xlsx")} className={btnDark} data-testid="transfer-xlsx">이체 엑셀</button><button type="button" disabled={!tr.ok.length} onClick={() => exportTransfer("csv")} className={btnLine}>CSV</button></>}>급여 이체 파일</H>
              <div className="px-4 pb-4 space-y-2">
                {tr.missing.length > 0 && <Note kind="error">지급 계좌가 없는 직원 {tr.missing.length}명: {tr.missing.map((x) => `${x.name} ${wonFmt(x.amount)}원`).join(", ")} · 직원 급여 설정에서 계좌를 넣어 주세요</Note>}
                <Table min={520} head={<><Th>성명</Th><Th>은행</Th><Th>계좌번호</Th><Th>예금주</Th><Th right>이체 금액</Th></>} foot={<><Td strong>합계 {tr.ok.length}명</Td><Td /><Td /><Td /><Td right strong>{wonFmt(tr.total)}</Td></>}>
                  {tr.ok.map((r) => <tr key={r.uid}><Td strong>{r.name}</Td><Td>{r.bank}</Td><Td right>{formatAccount(r.bank, r.acct)}</Td><Td>{r.holder}</Td><Td right strong>{wonFmt(r.amount)}</Td></tr>)}
                </Table>
                <div className="text-[14px] font-bold text-[#5B6B85]">인터넷뱅킹 대량이체에 올리는 기본 열(은행 · 계좌 · 예금주 · 금액 · 통장 표시)이에요. 은행 양식에 맞게 열 순서만 바꾸면 돼요.</div>
              </div>
            </div>
            {/* 전월 대비 */}
            <div className={sec}>
              <H en="MONTH OVER MONTH" right={<button type="button" onClick={exportLedger} className={btnDark} data-testid="ledger-xlsx">급여대장 엑셀</button>}>전월 대비 변동 <span className="text-[14px] font-bold text-[#5B6B85]">· 실지급 10% 넘게</span></H>
              <div className="px-4 pb-4">
                {!prev.length ? <div className="py-4 text-[14px] font-bold text-[#7A879C]">{ymLabel(shiftYm(ym, -1))} 기록이 없어 비교할 수 없어요</div> : !cmp.length ? <div className="py-4 text-[14px] font-bold text-[#2D4C82]">크게 바뀐 사람이 없어요</div> : (
                  <Table min={520} head={<><Th>성명</Th><Th>변동</Th><Th right>전월 실지급</Th><Th right>이번 달</Th><Th right>차이</Th></>}>
                    {cmp.map((x) => <tr key={x.uid}><Td strong>{x.name}</Td><Td><span className={`h-7 px-2.5 rounded-lg text-[13px] font-black inline-flex items-center ${x.kind === "up" ? "bg-[#EEF3FC] text-[#2D4C82]" : x.kind === "down" ? "bg-[#FEF3F2] text-[#B42318]" : "bg-[#F2F4F7] text-[#3A4A66]"}`}>{{ up: "늘었어요", down: "줄었어요", new: "이번 달 새로", gone: "이번 달 없음" }[x.kind]}</span></Td><Td right>{wonFmt(x.prevNet)}</Td><Td right>{wonFmt(x.net)}</Td><Td right strong>{`${x.diff > 0 ? "+" : ""}${wonFmt(x.diff)}`} {pct(x.pct)}</Td></tr>)}
                  </Table>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      {/* 올해 누계 */}
      {!loading && (
        <div className={sec}>
          <H en={`YEAR TO DATE · ${year}`} right={<button type="button" disabled={!ytd.length} onClick={exportYtd} className={btnLine} data-testid="ytd-xlsx">누계 엑셀</button>}>{year}년 누계 <span className="text-[14px] font-bold text-[#5B6B85]">· 연말정산 대비 · 확정분</span></H>
          <div className="px-4 pb-4">
            {!ytd.length ? <div className="py-4 text-[14px] font-bold text-[#7A879C]">확정된 명세서가 없어요</div> : (
              <Table min={820} head={<><Th>성명</Th><Th right>개월</Th><Th right>지급 총액</Th><Th right>과세 급여</Th><Th right>비과세</Th><Th right>소득세</Th><Th right>지방소득세</Th><Th right>4대보험</Th><Th right>실지급</Th></>}
                foot={<><Td strong>합계</Td><Td /><Td right strong>{wonFmt(ytd.reduce((a, x) => a + x.gross, 0))}</Td><Td right strong>{wonFmt(ytd.reduce((a, x) => a + x.taxable, 0))}</Td><Td right strong>{wonFmt(ytd.reduce((a, x) => a + x.nonTaxable, 0))}</Td><Td right strong>{wonFmt(ytd.reduce((a, x) => a + x.tax, 0))}</Td><Td right strong>{wonFmt(ytd.reduce((a, x) => a + x.local, 0))}</Td><Td right strong>{wonFmt(ytd.reduce((a, x) => a + x.ins, 0))}</Td><Td right strong>{wonFmt(ytd.reduce((a, x) => a + x.net, 0))}</Td></>}>
                {ytd.map((x) => <tr key={x.uid}><Td strong>{x.name}</Td><Td right>{x.months}</Td><Td right>{wonFmt(x.gross)}</Td><Td right>{wonFmt(x.taxable)}</Td><Td right>{wonFmt(x.nonTaxable)}</Td><Td right strong>{wonFmt(x.tax)}</Td><Td right>{wonFmt(x.local)}</Td><Td right>{wonFmt(x.ins)}</Td><Td right strong>{wonFmt(x.net)}</Td></tr>)}
              </Table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
