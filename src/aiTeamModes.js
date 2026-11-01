// ======================= src/aiTeamModes.js =======================
// 🤖 AI 비서 팀별 모드(2026-11-01) — 화면(팀)에 맞는 인사말·빠른 버튼·답변
//  acct(경리) / hr(인사) / exec(임원) / 그 밖(배차·운송)은 기존 배차 비서
import React from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { computeFunds } from "./fundsCalc";

const won = (n) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;
const kst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const tsDay = (v) => { const ms = v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0; return ms ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 10) : ""; };
const inPeriod = (ds, p) => !!p?.start && ds >= p.start && ds <= (p.end || p.start);

export const AI_MODES = {
  acct: { title: "경리 AI 비서", sub: "자금·장부·지출 조회", hello: "안녕하세요! 경리 AI 비서입니다.\n자금·수입·지출·세무 일정을 바로 알려 드립니다." },
  hr: { title: "인사 AI 비서", sub: "인원·근태·결재 조회", hello: "안녕하세요! 인사 AI 비서입니다.\n오늘 근태·휴가·인원 현황을 바로 알려 드립니다." },
  exec: { title: "경영 AI 비서", sub: "경영 요약·결재", hello: "안녕하세요! 경영 AI 비서입니다.\n매출·결재·인원 현황을 요약해 드립니다." },
};

function useCol(name, conds, on) {
  const [rows, setRows] = React.useState([]);
  const key = JSON.stringify(conds);
  React.useEffect(() => {
    if (!on) return undefined;
    return onSnapshot(query(collection(db, name), ...conds.map(([f, op, v]) => where(f, op, v))), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
  }, [name, key, on]); // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}

// 팀 모드 데이터(창이 열려 있을 때만 구독)
export function useTeamData(mode, company, uid, open) {
  const on = !!(open && company && mode);
  const acct = on && mode === "acct";
  const hr = on && (mode === "hr" || mode === "exec");
  const ledger = useCol("acctLedger", [["companyName", "==", company]], acct);
  const funds = useCol("acctFunds", [["companyName", "==", company]], acct);
  const expense = useCol("approvals", [["company", "==", company], ["cat", "==", "expense"]], acct);
  const users = useCol("users", [["companyName", "==", company]], hr);
  const leaveAp = useCol("approvals", [["company", "==", company], ["cat", "==", "leave"]], on && mode === "hr");
  const mine = useCol("approvals", [["participants", "array-contains", uid || "-"]], on && mode === "exec");
  return { ledger, funds, expense, users, leaveAp, mine, uid };
}

const STAFF = (u) => !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role) && u.approved !== false;

export function teamButtons(mode) {
  if (mode === "acct") return [["funds", "보유 자금"], ["cash", "이번 달 수입·지출"], ["expwait", "지출결의 대기"], ["noev", "증빙 없는 지출"], ["sales", "이번 달 매출·매입"], ["tax", "세무 일정"]];
  if (mode === "hr") return [["head", "재직 인원"], ["today", "오늘 휴가·외근"], ["leavewait", "근태 결재 대기"], ["resign", "퇴사 예정"], ["inout", "이번 달 입·퇴사"], ["onleave", "휴직 중"]];
  if (mode === "exec") return [["brief", "경영 요약"], ["myturn", "내 결재 대기"], ["head", "인원 현황"], ["sales", "이번 달 매출·이익"]];
  return null;
}

// 답변 만들기
export function teamAnswer(mode, key, T, dispatches = []) {
  const today = kst(); const ym = today.slice(0, 7);
  const monthOrders = dispatches.filter((d) => String(d.상차일 || d.상차일자 || "").startsWith(ym) && d.배차상태 !== "배차취소");
  const sale = monthOrders.reduce((s, d) => s + (Number(d.청구운임) || 0), 0);
  const cost = monthOrders.reduce((s, d) => s + (Number(d.기사운임) || 0), 0);
  const staff = (T.users || []).filter(STAFF);
  const active = staff.filter((u) => u.employmentStatus !== "퇴사");
  switch (key) {
    case "funds": {
      const F = computeFunds(T.funds || [], T.ledger || []);
      if (!(T.funds || []).length) return "등록된 통장·카드가 없습니다.\n자금관리 › 자금 현황에서 먼저 등록해 주세요.";
      return `[보유 자금] ${won(F.cash)}\n\n${F.list.filter((f) => f.kind !== "대출").map((f) => `· ${f.name}: ${won(f.balance)}`).join("\n")}${F.loan ? `\n\n대출 잔액 ${won(F.loan)}` : ""}${F.runway != null ? `\n운영 가능 약 ${F.runway.toFixed(1)}개월(월평균 지출 기준)` : ""}`;
    }
    case "cash": {
      const m = (T.ledger || []).filter((r) => String(r.date || "").startsWith(ym) && Number(r.amount));
      const inn = m.filter((r) => r.type === "수입").reduce((s, r) => s + Number(r.amount), 0);
      const out = m.filter((r) => r.type === "지출").reduce((s, r) => s + Number(r.amount), 0);
      const byAcc = {}; m.filter((r) => r.type === "지출").forEach((r) => { byAcc[r.account || "기타"] = (byAcc[r.account || "기타"] || 0) + Number(r.amount); });
      const top = Object.entries(byAcc).sort((a, b) => b[1] - a[1]).slice(0, 5);
      return `[${ym} 수입·지출]\n수입 ${won(inn)} · 지출 ${won(out)}\n차액 ${inn - out >= 0 ? "+" : ""}${won(inn - out)}${top.length ? `\n\n지출 많은 계정\n${top.map(([k, v]) => `· ${k} ${won(v)}`).join("\n")}` : ""}`;
    }
    case "expwait": {
      const w = (T.expense || []).filter((a) => a.status === "pending");
      return w.length ? `[지출결의 결재 대기] ${w.length}건\n\n${w.slice(0, 8).map((a) => `· ${a.title || a.formLabel} ${a.amount ? won(a.amount) : ""} (${a.drafter?.name || ""})`).join("\n")}` : "결재 대기 중인 지출결의가 없습니다.";
    }
    case "noev": {
      const n = (T.ledger || []).filter((r) => String(r.date || "").startsWith(ym) && r.type === "지출" && !r.receipt && !r.evidence);
      return n.length ? `[증빙 없는 지출] ${n.length}건\n\n${n.slice(0, 8).map((r) => `· ${r.date} ${r.item || r.account} ${won(r.amount)}`).join("\n")}\n\n장부에서 영수증 사진이나 증빙 종류를 넣어 주세요.` : "이번 달 증빙 없는 지출이 없습니다.";
    }
    case "sales":
      return `[${ym} 매출·매입]\n매출(청구운임) ${won(sale)}\n매입(기사운임) ${won(cost)}\n이익 ${won(sale - cost)}${sale ? ` (${((sale - cost) / sale * 100).toFixed(1)}%)` : ""}\n운행 ${monthOrders.length}건`;
    case "tax": {
      const d = Number(today.slice(8, 10)); const m = Number(today.slice(5, 7));
      const items = [["원천세 신고·납부", 10], ["4대보험료 납부", 10]];
      if ([1, 4, 7, 10].includes(m)) items.push(["부가가치세 신고·납부", 25]);
      if (m === 5) items.push(["종합소득세 신고", 31]);
      if (m === 3) items.push(["법인세 신고", 31]);
      return `[이번 달 세무 일정]\n${items.map(([n, day]) => `· ${m}월 ${day}일 ${n}${day >= d ? ` (D-${day - d})` : " (지남)"}`).join("\n")}\n\n자세한 일정은 경리 대시보드의 세무 캘린더를 확인하세요.`;
    }
    case "head": {
      const g = {}; active.forEach((u) => { const t = u.team || "미배정"; g[t] = (g[t] || 0) + 1; });
      return `[재직 인원] ${active.length}명\n\n${Object.entries(g).sort((a, b) => b[1] - a[1]).map(([t, n]) => `· ${t} ${n}명`).join("\n")}`;
    }
    case "today": {
      const name = (uid) => (staff.find((u) => u.id === uid)?.name) || "";
      const lv = (T.leaveAp || []).filter((a) => a.status === "approved" && (inPeriod(today, a.data?.period) || a.data?.date === today));
      return lv.length ? `[오늘 휴가·외근] ${lv.length}명\n\n${lv.map((a) => `· ${name(a.drafterUid) || a.drafter?.name || ""} — ${a.formLabel}${a.data?.kind ? `(${a.data.kind})` : ""}`).join("\n")}` : "오늘 휴가·외근으로 승인된 사람이 없습니다.";
    }
    case "leavewait": {
      const w = (T.leaveAp || []).filter((a) => a.status === "pending");
      return w.length ? `[근태 결재 대기] ${w.length}건\n\n${w.slice(0, 8).map((a) => `· ${a.drafter?.name || ""} ${a.formLabel} ${a.summary || ""}`).join("\n")}` : "결재 대기 중인 근태 신청이 없습니다.";
    }
    case "resign": {
      const r = active.filter((u) => u.resignPlan?.date);
      return r.length ? `[퇴사 예정] ${r.length}명\n\n${r.map((u) => `· ${u.name} (${u.team || "-"}) ${u.resignPlan.type} · ${u.resignPlan.date}`).join("\n")}\n\n그날 인사관리부 › 인사관리 › 직원관리에서 [퇴사 확정]을 눌러 주세요.` : "퇴사 예정인 직원이 없습니다.";
    }
    case "inout": {
      const joined = staff.filter((u) => (u.hireDate || tsDay(u.createdAt)).startsWith(ym));
      const left = staff.filter((u) => String(u.resignedAt || "").startsWith(ym));
      return `[${ym} 입·퇴사]\n입사 ${joined.length}명${joined.length ? `: ${joined.map((u) => u.name).join(", ")}` : ""}\n퇴사 ${left.length}명${left.length ? `: ${left.map((u) => u.name).join(", ")}` : ""}`;
    }
    case "onleave": {
      const l = active.filter((u) => ["휴직", "육아휴직", "출산휴가"].includes(u.employmentStatus));
      return l.length ? `[휴직 중] ${l.length}명\n\n${l.map((u) => `· ${u.name} ${u.employmentStatus}${u.leave?.to ? ` (~${u.leave.to})` : ""}`).join("\n")}` : "휴직 중인 직원이 없습니다.";
    }
    case "myturn": {
      const t = (T.mine || []).filter((a) => a.status === "pending" && a.line?.[a.step || 0]?.uid === T.uid && a.line[a.step || 0].status === "pending");
      return t.length ? `[결재 대기] ${t.length}건\n\n${t.slice(0, 8).map((a) => `· ${a.formLabel} — ${a.title} (${a.drafter?.name || ""})`).join("\n")}\n\n결재함에서 처리해 주세요.` : "지금 결재할 문서가 없습니다.";
    }
    case "brief":
      return `[경영 요약 · ${ym}]\n매출 ${won(sale)} · 이익 ${won(sale - cost)}${sale ? ` (${((sale - cost) / sale * 100).toFixed(1)}%)` : ""}\n운행 ${monthOrders.length}건\n재직 ${active.length}명`;
    default:
      return "원하시는 항목을 버튼으로 선택해 주세요.";
  }
}
