// ======================= src/TestSeedPanel.jsx =======================
// 🧪 2026-11-08 관리센터 › 보안·데이터 › 테스트 데이터 · 테스트운송사에 가짜 데이터 채우기 · 다시 채우기 · 현황
//  서버 함수 seedTestCompany(functions/seedTestCompany.js)를 부른다. 한 번 호출은 50초만 일하고 이어서 할 표시(cursor)를 주므로
//  끝날 때까지 다시 부른다. 대상 회사는 서버가 "테스트운송사"만 허용한다(화면에서 바꿀 수 없음).
import React from "react";
import { auth, FUNCTIONS_BASE } from "./firebase";
import { kpConfirm } from "./kpDialog";

export const TEST_SEED_COMPANY = "테스트운송사";
const NUMS = { fontVariantNumeric: "tabular-nums" };
const CARD = "bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)]";
// 컬렉션 → 화면 이름(어느 메뉴에 보이는지)
const LABELS = [
  ["orders", "오더", "배차현황 · 매출 · 정산"], ["clients", "거래처", "거래처관리 · 정산"], ["places", "상하차지", "하차지 · 주소록"], ["drivers", "기사", "기사관리 · 관제"],
  ["fixedRoutes", "고정노선", "고정노선"], ["routeBoards", "배차표", "고정노선현황"], ["fixedClients", "고정거래처", "고정거래처"], ["multiRateSheets", "단가표", "단가표"],
  ["arDesk", "거래명세서 · 미수금 메모", "정산관리"], ["arPayments", "입금 기록", "미수금"], ["emailLogs", "발송 이력", "정산관리"],
  ["acctFunds", "통장 · 카드", "자금 현황"], ["acctLedger", "수입 · 지출 장부", "회계 · 일일 경영 보고"], ["acctRecurring", "고정비", "장부"], ["officeAssets", "비품 · 자산", "경리"],
  ["users", "가짜 직원", "인사 · 급여 · 결재선"], ["attendance", "출근기록", "출근기록부"], ["payrollEmployees", "급여 설정", "급여"], ["payrollRuns", "급여 실행", "급여"], ["payslips", "급여명세서", "급여 · 내 명세서"],
  ["approvals", "전자결재", "전자결재 · 휴가 · 지출결의"], ["schedules", "일정", "홈 일정"], ["notices", "공지", "공지사항"], ["boardPosts", "게시글", "게시판"],
  ["handovers", "인수인계", "인수인계"], ["internalMails", "사내메일", "메일함"], ["chat_rooms", "메신저 방", "메신저"], ["chat_messages", "메신저 메시지", "메신저"],
];
const ACTION_TEXT = { seed: "채우는 중", reset: "지우고 다시 채우는 중", refresh: "날짜 맞추는 중", clear: "지우는 중", status: "확인 중" };

async function callSeed(data) {
  const token = await auth.currentUser?.getIdToken?.();
  let res;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/seedTestCompany`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data }) });
  } catch { throw new Error("서버에 닿지 않았어요. 잠시 뒤 다시 해 주세요"); }
  let j = {};
  try { j = await res.json(); } catch { /* 무시 */ }
  if (res.status === 404) throw new Error("서버에 기능이 아직 없어요. 함수 seedTestCompany를 배포해 주세요");
  if (!res.ok || j.error) throw new Error(j.error?.message || `요청이 실패했어요 (${res.status})`);
  return j.result;
}
const sumDone = (done = {}, prefix) => Object.entries(done).filter(([k]) => k.startsWith(prefix)).reduce((s, [, v]) => s + v, 0);
const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default function TestSeedPanel() {
  const [busy, setBusy] = React.useState("");
  const [prog, setProg] = React.useState(null); // { action, rounds, done }
  const [stat, setStat] = React.useState(null);
  const [msg, setMsg] = React.useState("");
  const [err, setErr] = React.useState("");

  const loadStatus = React.useCallback(async () => {
    setErr("");
    setBusy((b) => b || "status");
    try { setStat(await callSeed({ action: "status", company: TEST_SEED_COMPANY })); } catch (e) { setErr(e.message); } finally { setBusy((b) => (b === "status" ? "" : b)); }
  }, []);
  React.useEffect(() => { loadStatus(); }, [loadStatus]);

  const run = async (action) => {
    const ask = {
      seed: `${TEST_SEED_COMPANY}에 가짜 데이터를 채울까요?\n이미 있는 데이터는 그대로 두고 빠진 것만 넣어요.`,
      reset: `${TEST_SEED_COMPANY}의 가짜 데이터만 지우고 다시 채울까요?\n직접 등록한 실제 데이터는 지우지 않아요.`,
      refresh: "가짜 데이터의 날짜를 오늘 기준으로 다시 맞출까요?\n가짜 데이터에서 바꾼 내용은 처음 값으로 돌아가요.",
      clear: `${TEST_SEED_COMPANY}의 가짜 데이터를 모두 지울까요?\n직접 등록한 실제 데이터는 그대로 남아요.`,
    }[action];
    if (ask && !(await kpConfirm(ask))) return;
    setBusy(action); setErr(""); setMsg("");
    let cursor = null; let rounds = 0; let r = null; let fails = 0;
    setProg({ action, rounds: 0, done: {} });
    try {
      do {
        try {
          r = await callSeed({ action, company: TEST_SEED_COMPANY, cursor });
          fails = 0;
        } catch (e) {
          fails += 1;
          if (fails >= 3) throw e;
          await new Promise((ok) => setTimeout(ok, 2000));
          continue;
        }
        cursor = r.cursor || null; rounds += 1;
        setProg({ action, rounds, done: r.done || cursor?.done || {} });
      } while (r?.partial && rounds < 60);
      if (r?.partial) throw new Error("시간이 오래 걸려 멈췄어요. 같은 버튼을 한 번 더 눌러 주세요");
      const w = sumDone(r.done, "written:"); const d = sumDone(r.done, "deleted:"); const p = sumDone(r.done, "pruned:");
      setMsg({
        seed: w ? `${w.toLocaleString()}건을 새로 채웠어요` : "빠진 데이터가 없어서 그대로 두었어요",
        reset: `${d.toLocaleString()}건을 지우고 ${w.toLocaleString()}건을 다시 채웠어요`,
        refresh: `${w.toLocaleString()}건의 날짜를 맞췄어요${p ? ` · 지난 데이터 ${p.toLocaleString()}건 정리` : ""}`,
        clear: `${d.toLocaleString()}건을 지웠어요`,
      }[action]);
      setStat(r);
    } catch (e) { setErr(e.message); } finally { setBusy(""); setProg(null); }
  };

  const counts = stat?.counts || {};
  const total = stat?.total || 0;
  const st = stat?.state || null;
  const btn = "h-11 px-4 rounded-xl text-[14px] font-black whitespace-nowrap disabled:opacity-50";
  return (
    <div className="space-y-4 min-w-0" data-testid="test-seed-panel">
      <div className={CARD}>
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-[#EEF1F6] flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" /><span className="text-[12px] font-extrabold tracking-[0.2em] text-[#94A3B8]">TEST DATA</span></div>
            <div className="mt-1 text-[17px] font-black text-[#0F1A30] tracking-tight">테스트운송사 가짜 데이터</div>
            <div className="text-[14px] text-[#5B6B85] mt-1 leading-relaxed">모든 메뉴에 적당한 양의 가짜 데이터를 넣어 기능을 바로 시험할 수 있어요. 날짜는 오늘 기준으로 지난 6개월과 다음 2주에 맞춰 들어가고, 매주 월요일 새벽에 자동으로 다시 맞춰요.</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[12px] font-bold text-[#7A879C]">지금 들어 있는 가짜 데이터</div>
            <div className="text-[26px] font-black text-[#0F1A30]" style={NUMS}>{stat ? `${total.toLocaleString()}건` : "-"}</div>
            {st?.lastAtMs ? <div className="text-[12px] text-[#9AA9C3]">마지막 작업 {fmtTime(st.lastAtMs)}</div> : null}
          </div>
        </div>
        <div className="px-5 py-4 flex flex-wrap items-center gap-2">
          <button type="button" disabled={!!busy} onClick={() => run("seed")} className={`${btn} bg-[#0F1A30] text-white`}>가짜 데이터 채우기</button>
          <button type="button" disabled={!!busy} onClick={() => run("reset")} className={`${btn} bg-[#EEF3FC] text-[#1B2B4B] border border-[#C9D6EE]`}>초기화 후 다시 채우기</button>
          <button type="button" disabled={!!busy} onClick={loadStatus} className={`${btn} bg-white text-[#1B2B4B] border border-[#DCE3EE]`}>현황 보기</button>
          <span className="flex-1" />
          <button type="button" disabled={!!busy || !total} onClick={() => run("refresh")} className="h-9 px-3 rounded-lg text-[13px] font-bold text-[#2D4C82] disabled:opacity-40">오늘 날짜로 맞추기</button>
          <button type="button" disabled={!!busy || !total} onClick={() => run("clear")} className="h-9 px-3 rounded-lg text-[13px] font-bold text-[#B42318] disabled:opacity-40">가짜 데이터만 지우기</button>
        </div>
        {(prog || busy === "status") && (
          <div className="mx-5 mb-4 rounded-xl bg-[#F4F7FC] border border-[#E3E8F0] px-4 py-3" role="status">
            <div className="flex items-center gap-2 text-[14px] font-black text-[#1B2B4B]">
              <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-[#2D4C82] border-t-transparent animate-spin" />
              {ACTION_TEXT[prog?.action || "status"]}{prog?.rounds ? ` · ${prog.rounds}번째 묶음 끝` : ""}
            </div>
            {prog && <div className="mt-1 text-[13px] text-[#5B6B85]" style={NUMS}>
              지운 것 {sumDone(prog.done, "deleted:").toLocaleString()}건 · 쓴 것 {sumDone(prog.done, "written:").toLocaleString()}건{sumDone(prog.done, "pruned:") ? ` · 정리 ${sumDone(prog.done, "pruned:").toLocaleString()}건` : ""}
              <span className="block text-[12px] text-[#9AA9C3] mt-0.5">창을 닫지 말고 기다려 주세요. 보통 1~2분 걸려요.</span>
            </div>}
          </div>
        )}
        {msg && !busy && <div className="mx-5 mb-4 rounded-xl bg-[#EEF3FC] border border-[#C9D6EE] px-4 py-3 text-[14px] font-bold text-[#1B2B4B]">{msg}</div>}
        {err && <div className="mx-5 mb-4 rounded-xl bg-[#FDF0EF] border border-[#F3C9C4] px-4 py-3 text-[14px] font-bold text-[#B42318]">{err}</div>}
      </div>

      <div className={CARD}>
        <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-2">
          <div className="text-[15px] font-black text-[#0F1A30]">메뉴별 현황</div>
          {stat?.filledUsers ? <div className="text-[12.5px] text-[#7A879C]">실제 직원 {stat.filledUsers}명은 비어 있던 부서 · 직책 · 입사일만 채웠어요</div> : null}
        </div>
        <div className="px-3 pb-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5">
          {LABELS.map(([k, label, where]) => (
            <div key={k} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[#F7F9FC]">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-black text-[#1B2B4B] truncate">{label}</div>
                <div className="text-[12px] text-[#9AA9C3] truncate">{where}</div>
              </div>
              <div className={`text-[15px] font-black ${counts[k] ? "text-[#0F1A30]" : "text-[#C3CCDA]"}`} style={NUMS}>{stat ? `${(counts[k] || 0).toLocaleString()}건` : "-"}</div>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5 text-[12.5px] text-[#7A879C] leading-relaxed">
          가짜 데이터에는 표시가 붙어 있어서 [초기화 후 다시 채우기]와 [가짜 데이터만 지우기]는 표시가 있는 데이터만 지워요. 직접 등록한 오더 · 거래처 · 직원 기록은 지우지 않아요.
          가짜 직원은 로그인 계정이 없는 기록만 있고, 가짜 데이터로는 휴대폰 알림이 가지 않아요.
        </div>
      </div>
    </div>
  );
}
