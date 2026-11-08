// ======================= src/bizPlanDemo.js =======================
// 🧪 개발 전용 — /preview?demo=1 에서 사업계획서 · 관련 지출 · 결재선 점검용 가짜 데이터
//  · 직원(demoAp=1): 팀장 · 재무팀 과장(경리) · 상무 · 대표이사 · 사원 — demoAp=nofin 이면 경리 담당이 없는 회사
//  · 사업계획(승인 3건) + 연결된 지출결의(승인·진행 중) — 경영 분석 › 사업계획 탭과 "관련 사업계획" 고르기에 쓴다
const ymd = (off) => { const d = new Date(Date.now() + 9 * 3600e3 + off * 864e5); return d.toISOString().slice(0, 10); };
const ts = (dayAgo) => ({ seconds: Math.floor((Date.now() - dayAgo * 864e5) / 1000), nanoseconds: 0, toMillis() { return this.seconds * 1000; } });

export function demoApMode() { try { return new URLSearchParams(window.location.search).get("demoAp") || ""; } catch { return ""; } }

export function bizPlanStaff() {
  const mode = demoApMode();
  if (!mode) return null;
  const all = [
    { uid: "dap-tl", name: "김배차", position: "팀장", team: "배차팀", role: "admin" },
    { uid: "dap-fin", name: "이재무", position: "과장", team: "재무팀", role: "test" },
    { uid: "dap-ex", name: "박상무", position: "상무", team: "임원", role: "user" },
    { uid: "dap-ceo", name: "최대표", position: "대표이사", team: "임원", role: "admin" },
    { uid: "dap-st", name: "정사원", position: "사원", team: "배차팀", role: "user" },
  ];
  return mode === "nofin" ? all.filter((u) => u.uid !== "dap-fin") : all;
}

let cache = null;
export function bizPlanDemo(company = "테스트운송") {
  const key = `${company}|${ymd(0)}`;
  if (cache?.key === key) return cache;
  const P = { tl: { uid: "dap-tl", name: "김배차", position: "팀장", team: "배차팀" }, fin: { uid: "dap-fin", name: "이재무", position: "과장", team: "재무팀" }, ex: { uid: "dap-ex", name: "박상무", position: "상무", team: "임원" }, ceo: { uid: "preview", name: "김대표", position: "대표이사", team: "임원" } };
  const line = (n) => [{ ...P.tl, kind: "결재" }, { ...P.fin, kind: "합의" }, { ...P.ex, kind: "결재" }, { ...P.ceo, kind: "결재" }].map((x, i) => ({ ...x, status: "approved", at: Date.now() - (n - i) * 864e5 }));
  const plan = (id, o) => {
    const amount = o.budget.reduce((s, r) => s + r.amount, 0);
    return { id, company, docNo: `DB-${ymd(-o.ago).replace(/-/g, "")}-${id.slice(4, 8).toUpperCase()}`, cat: "draft", form: "bizplan", formLabel: "사업계획서", title: `사업계획서_${o.name}`,
      summary: `${o.name} · 예산 ${amount.toLocaleString("ko-KR")}원`, amount, status: "approved", step: 4, finIdx: 1,
      drafterUid: "dap-st", drafter: { uid: "dap-st", name: "정사원", team: "배차팀", position: "사원" }, line: line(o.ago), participants: ["dap-st", "dap-tl", "dap-fin", "dap-ex", "preview"],
      data: { name: o.name, period: o.period, dept: o.dept, owner: o.owner, background: o.background, goal: o.goal, goals: o.goals, schedule: o.schedule, budget: o.budget, revenue: String(o.revenue), profit: String(o.profit), payback: String(o.payback), effect: o.effect },
      files: o.files || [], createdAt: ts(o.ago), updatedAt: ts(o.ago - 3) };
  };
  const plans = [
    plan("dbp-cheonan", { name: "천안 신규 물류 거점 구축", ago: 40, period: { start: ymd(-30), end: ymd(150) }, dept: "배차팀", owner: "김배차 팀장",
      background: "충청권 물량이 1년 사이 38% 늘었지만 평택 거점에서 왕복 2시간이 걸려 공차율이 높습니다.", goal: "천안에 소형 거점을 열어 충청권 당일 배차율을 높이고 공차 운행을 줄입니다.",
      goals: [{ label: "충청권 당일 배차율", target: "92", unit: "%" }, { label: "공차 운행 감소", target: "18", unit: "%" }, { label: "월 신규 매출", target: "4500", unit: "만원" }],
      schedule: [{ when: "1개월 차", what: "부지 계약 · 인허가", who: "김배차" }, { when: "2~3개월 차", what: "창고 정비 · 장비 반입", who: "박상무" }, { when: "4개월 차", what: "시범 운영 · 화주 전환", who: "김배차" }],
      budget: [{ label: "임차 보증금", amount: 30000000, note: "3년 계약" }, { label: "창고 정비 · 랙 설치", amount: 18000000, note: "" }, { label: "지게차 1대", amount: 12000000, note: "중고" }],
      revenue: 540000000, profit: 64000000, payback: 14, effect: "충청권 화주 이탈 방지 · 공차 비용 연 7천만원 절감 예상", files: [{ name: "천안거점_사업계획_발표.pptx", size: 4812331, type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", path: "preview/dbp-cheonan/1_천안거점_사업계획_발표.pptx", uploadedBy: "dap-st", uploadedByName: "정사원", at: Date.now() - 40 * 864e5 }] }),
    plan("dbp-tms", { name: "배차 관제 시스템 고도화", ago: 70, period: { start: ymd(-60), end: ymd(20) }, dept: "배차팀", owner: "정사원",
      background: "수기 배차표와 전화 확인 때문에 배차 지연 민원이 월 20건 넘게 들어옵니다.", goal: "실시간 위치 관제와 자동 배차 추천으로 지연 민원을 절반으로 줄입니다.",
      goals: [{ label: "배차 지연 민원", target: "10", unit: "건/월" }], schedule: [{ when: "1~2개월 차", what: "단말 보급 · 교육", who: "정사원" }],
      budget: [{ label: "차량 단말 40대", amount: 9600000, note: "" }, { label: "관제 소프트웨어 1년", amount: 6000000, note: "" }],
      revenue: 0, profit: 15000000, payback: 12, effect: "배차 인력 1명분 업무 절감" }),
    plan("dbp-ev", { name: "1톤 전기 화물차 시범 도입", ago: 12, period: { start: ymd(10), end: ymd(200) }, dept: "임원", owner: "박상무",
      background: "도심 소형 배송 화주가 탄소 배출 자료를 요구하기 시작했습니다.", goal: "전기 화물차 3대로 도심 노선 운영 자료를 모읍니다.",
      goals: [{ label: "km당 연료비", target: "-45", unit: "%" }], schedule: [{ when: "다음 달", what: "차량 계약 · 충전기 설치", who: "박상무" }],
      budget: [{ label: "차량 3대 리스 보증금", amount: 21000000, note: "" }, { label: "충전기 2기", amount: 7000000, note: "" }],
      revenue: 120000000, profit: 9000000, payback: 30, effect: "친환경 화주 입찰 가산점" }),
  ];
  const ex = (id, planId, o) => ({ id, company, cat: "expense", form: o.form || "spend", formLabel: o.form === "purchase" ? "구매요청서" : "지출결의서", title: o.title, summary: o.title, amount: o.amount, status: o.status || "approved",
    planId, data: { planId, planName: plans.find((p) => p.id === planId)?.data.name || "" }, drafterUid: "dap-st", drafter: { uid: "dap-st", name: o.who || "정사원" }, line: [], createdAt: ts(o.ago), updatedAt: ts(o.ago), ...(o.paid ? { paid: { at: Date.now() - o.ago * 864e5, date: ymd(-o.ago) } } : {}) });
  const expenses = [
    ex("dex-1", "dbp-cheonan", { title: "천안 창고 임차 보증금", amount: 30000000, ago: 25, paid: true }),
    ex("dex-2", "dbp-cheonan", { title: "랙 설치 1차 공사", amount: 9800000, ago: 12 }),
    ex("dex-3", "dbp-cheonan", { title: "중고 지게차 구매", amount: 12500000, ago: 3, status: "pending", form: "purchase" }),
    ex("dex-4", "dbp-tms", { title: "차량 단말 40대", amount: 9600000, ago: 50, paid: true }),
    ex("dex-5", "dbp-tms", { title: "관제 소프트웨어 1년 사용료", amount: 6000000, ago: 40, paid: true }),
    ex("dex-6", "dbp-tms", { title: "단말 거치대 추가 구매", amount: 1450000, ago: 8, form: "purchase" }),
  ];
  cache = { key, plans, expenses };
  return cache;
}
