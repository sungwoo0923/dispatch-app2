// ======================= src/bizPlan.js =======================
// 📑 2026-11-08 사업계획서(전자결재 bizplan) — 결재선 규칙 · 예산 집행 계산(순수 함수, 화면·테스트 공용)
//  · 결재선: 기안자 → 팀장 → 경리·회계·재무(합의, 예산 검토) → 임원 → 대표(최종 결재)
//    - 경리·회계·재무 담당 = 부서 이름에 재무·경리·회계·총무가 들어가거나 권한이 경리(test)·경리사무원(acctStaff)
//    - 대표 = 직책 대표·대표이사·사장(부사장 제외) · 맨 끝 결재자여야 한다(기안자가 대표면 이 조건은 빠진다)
//    - firestore.rules › approvals 의 apBizLineOk()가 같은 조건(경리 합의 finIdx · 맨 끝 대표)을 서버에서 한 번 더 본다
//  · 집행액: 이 사업계획을 "관련 사업계획"으로 고른 지출결의서·구매요청서·법인카드 사용보고 중 최종 승인된 문서의 금액 합계
//  ⚠ 이 파일은 node 테스트(scripts/bizPlan.test.mjs)에서도 읽으므로 다른 src 파일을 가져오지 않는다.

export const FIN_TEAM_RE = /재무|경리|회계|총무/;
export const FIN_LINE_ROLES = ["acctStaff", "test"];
export const CEO_POSITIONS = ["대표", "대표이사", "사장"];
const EXEC_NON_CEO = ["이사", "상무", "전무", "부사장", "본부장", "임원"];
const RANK = ["인턴", "사원", "주임", "대리", "과장", "차장", "부장", "팀장", "파트장", "실장", "본부장", "이사", "상무", "전무", "부사장", "사장", "대표", "대표이사"];
const rankOf = (p) => RANK.indexOf(String(p || "").trim());
const s = (v) => String(v ?? "").trim();

export const isCeoPerson = (u) => !!u && CEO_POSITIONS.includes(s(u.position));
export const isFinPerson = (u) => !!u && (FIN_TEAM_RE.test(s(u.team)) || FIN_LINE_ROLES.includes(s(u.role)));
export const isExecNonCeo = (u) => !!u && !isCeoPerson(u) && (EXEC_NON_CEO.includes(s(u.position)) || s(u.team) === "임원");
export const BIZ_LINE_FORMS = ["bizplan"];
export const needsBizLine = (formKey) => BIZ_LINE_FORMS.includes(formKey);

const nameOf = (u) => s(u?.name) || s(u?.email) || "";
const lineEntry = (u, kind) => ({ uid: u.uid, name: nameOf(u), position: u.position || "", team: u.team || "", kind });

// 결재선 칸의 사람 정보 — 직원 목록(역할·부서가 최신)을 먼저 보고, 없으면 결재선에 적힌 값
const personOf = (step, staff) => ({ ...step, ...((staff || []).find((u) => u.uid === step?.uid) || {}) });

// 사업계획서 결재선 자동 추천 — 팀장 → 경리·회계·재무(합의) → 임원 → 대표(최종)
export function suggestBizLine(staff, me) {
  const list = (staff || []).filter((u) => u.uid && u.uid !== me?.uid);
  const used = new Set();
  const out = [];
  const take = (u, kind) => { if (!u || used.has(u.uid)) return; used.add(u.uid); out.push(lineEntry(u, kind)); };
  const myRank = rankOf(me?.position);
  // ① 같은 부서 팀장급(나보다 높고 임원 아래)
  const lead = list.filter((u) => s(u.team) && s(u.team) === s(me?.team) && rankOf(u.position) > myRank && rankOf(u.position) < rankOf("본부장") && !isFinPerson(u))
    .sort((a, b) => rankOf(a.position) - rankOf(b.position)).pop();
  take(lead, "결재");
  // ② 경리·회계·재무(합의) — 직급이 가장 높은 사람(재무팀장 등), 대표·임원은 빼고
  const fin = list.filter((u) => isFinPerson(u) && !isCeoPerson(u) && !isExecNonCeo(u)).sort((a, b) => rankOf(b.position) - rankOf(a.position))[0]
    || list.filter((u) => isFinPerson(u) && !isCeoPerson(u)).sort((a, b) => rankOf(b.position) - rankOf(a.position))[0];
  take(fin, "합의");
  // ③ 임원(대표 아닌 임원 중 직급이 낮은 사람부터 한 명)
  const exec = list.filter((u) => isExecNonCeo(u) && !used.has(u.uid)).sort((a, b) => rankOf(a.position) - rankOf(b.position))[0];
  take(exec, "결재");
  // ④ 대표(최종)
  if (!isCeoPerson(me)) take(list.filter(isCeoPerson).sort((a, b) => rankOf(b.position) - rankOf(a.position))[0], "결재");
  return out;
}

// 사업계획서 결재선 검사 — { ok, errors[], warnings[], finIdx, ceoIdx }
//  errors가 하나라도 있으면 상신을 막는다. 안내 문구는 화면에 그대로 보인다.
export function validateBizLine(line, staff, me) {
  const L = (line || []).filter((x) => x && x.uid);
  const people = L.map((x) => personOf(x, staff));
  const others = (staff || []).filter((u) => u.uid !== me?.uid);
  const errors = [];
  const warnings = [];
  // 경리·회계·재무 합의
  const finIdx = people.findIndex((p) => isFinPerson(p) && (p.kind || "결재") === "합의");
  const finAsApprove = people.findIndex((p) => isFinPerson(p));
  if (finIdx < 0) {
    if (finAsApprove >= 0) errors.push(`${nameOf(people[finAsApprove])}님(경리·회계·재무)을 결재선에서 '합의'로 바꿔 주세요. 사업계획서는 예산 검토를 합의로 받아야 해요.`);
    else {
      const cand = others.filter(isFinPerson);
      if (cand.length) errors.push(`사업계획서는 경리·회계·재무 담당자의 예산 검토(합의)가 꼭 필요해요. 결재선에 ${cand.slice(0, 2).map(nameOf).join("·")}님을 '합의'로 넣어 주세요.`);
      else errors.push("회사에 경리·회계·재무 담당자가 없어요. 인사관리부 › 인사 정보에서 담당자의 부서를 재무·경리·회계·총무 중 하나로 정하거나 권한을 경리로 바꾼 뒤 다시 올려 주세요.");
    }
  }
  // 대표 최종 결재
  let ceoIdx = -1;
  if (!isCeoPerson(me)) {
    const last = people[people.length - 1];
    if (last && isCeoPerson(last) && (last.kind || "결재") === "결재") ceoIdx = people.length - 1;
    else {
      const anyCeo = people.findIndex(isCeoPerson);
      if (anyCeo >= 0) errors.push(`대표(${nameOf(people[anyCeo])}님)는 결재선 맨 끝에 '결재'로 두어야 해요. 사업계획서의 최종 결재는 대표가 해요.`);
      else if (others.some(isCeoPerson)) errors.push(`사업계획서는 대표의 최종 결재가 꼭 필요해요. 결재선 맨 끝에 ${others.filter(isCeoPerson).slice(0, 1).map(nameOf).join("")}님을 넣어 주세요.`);
      else errors.push("회사에 대표 직책인 직원이 없어요. 인사관리부 › 인사 정보에서 대표의 직책을 '대표' 또는 '대표이사'로 정한 뒤 다시 올려 주세요.");
    }
  }
  // 임원 결재 — 대표 말고 임원이 회사에 있으면 넣어야 한다(대표만 있는 작은 회사는 대표 결재로 갈음)
  const hasExec = people.some((p) => isExecNonCeo(p) && (p.kind || "결재") === "결재");
  if (!hasExec) {
    const cand = others.filter(isExecNonCeo);
    if (cand.length) errors.push(`임원 결재가 빠졌어요. 대표 앞에 ${nameOf(cand[0])}님 같은 임원을 '결재'로 넣어 주세요.`);
    else warnings.push("회사에 대표 말고 다른 임원이 없어 대표 결재로 임원 결재를 갈음해요.");
  }
  if (finIdx >= 0 && ceoIdx >= 0 && finIdx > ceoIdx) errors.push("경리·회계·재무 합의는 대표 결재보다 앞에 두어 주세요.");
  return { ok: errors.length === 0, errors, warnings, finIdx, ceoIdx };
}

// ───────── 예산 · 집행 ─────────
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };
export const budgetTotal = (rows) => (rows || []).reduce((a, r) => a + num(r?.amount), 0);
export const planIdOf = (d) => s(d?.planId) || s(d?.data?.planId);
export const PLAN_LINK_FORMS = ["spend", "purchase", "card"];

// 사업계획 하나의 집행 현황 — 승인된 연결 문서 금액 합계(결재 취소·반려·회수는 빠짐)
export function planExecution(plan, docs) {
  const id = s(plan?.id);
  const budget = num(plan?.amount) || budgetTotal(plan?.data?.budget);
  const linked = (docs || []).filter((d) => id && planIdOf(d) === id && d.id !== id);
  const approved = linked.filter((d) => d.status === "approved" && d.cancel?.status !== "done");
  const pending = linked.filter((d) => d.status === "pending");
  const spent = approved.reduce((a, d) => a + num(d.amount), 0);
  const paid = approved.filter((d) => d.paid?.at).reduce((a, d) => a + num(d.amount), 0);
  const pendingAmt = pending.reduce((a, d) => a + num(d.amount), 0);
  const rate = budget > 0 ? (spent / budget) * 100 : null;
  return { budget, spent, paid, pendingAmt, rate, over: budget > 0 && spent > budget, remain: budget - spent, count: approved.length, pendingCount: pending.length, docs: approved, pendingDocs: pending };
}

// 카드에 보일 상태 — 예산 초과 / 시작 전 / 진행 중 / 종료
export function planStatus(plan, today, ex) {
  const p = plan?.data?.period || {};
  if (ex?.over) return { key: "over", label: "예산 초과" };
  if (p.start && today < p.start) return { key: "ready", label: "시작 전" };
  if (p.end && today > p.end) return { key: "done", label: "종료" };
  return { key: "run", label: "진행 중" };
}
