// ======================= functions/aiTeams.js =======================
// 🤖 2026-11-06 AI 팀 — 관리자센터(최고관리자·부관리자)에서 팀별 Claude 에이전트와 대화한다.
//  · 팀 = 역할 지시문(system) + 쓸 수 있는 조회 도구 목록
//  · 도구는 전부 "읽기 전용" Firestore 조회. AI가 데이터를 바꾸는 일은 없다(바꿀 일은 제안만 한다).
//  · API 키는 Firebase Secret(ANTHROPIC_API_KEY)에만 둔다 — 클라이언트에는 절대 내려가지 않는다.
//  · 대화 기록은 브라우저가 들고 있다가 매번 그대로 다시 보낸다(서버는 상태를 갖지 않음).
//    ⚠ 기록은 "덧붙이기만" 한다 — system 문구·도구 목록·이전 메시지를 바꾸면 Claude의 생각 블록이 무효가 된다.
//      그래서 오늘 날짜처럼 바뀌는 값은 system이 아니라 사용자 메시지 앞에 붙인다.
const AnthropicMod = require("@anthropic-ai/sdk");
const Anthropic = AnthropicMod.default || AnthropicMod;

const MODEL = "claude-opus-5-5";
const MAX_ROUNDS = 8; // 한 질문에 도구를 부르며 왕복하는 최대 횟수
const MAX_HISTORY_BYTES = 600 * 1024;

const kstNow = () => new Date(Date.now() + 9 * 3600e3);
const kstDate = () => kstNow().toISOString().slice(0, 10);
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? Date.parse(v) || 0 : 0);
const kstStr = (ms) => (ms ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") : "");
const normCo = (s) => String(s || "").trim();

// 개인정보·비밀값·큰 덩어리는 AI에게 보내지 않는다
const SENSITIVE = /pass|token|secret|fcm|signature|image|photo|url|base64|file|attach|html|resident|주민|계좌|account(No|Number)|bankNo/i;
function slim(obj, extraKeep = []) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (SENSITIVE.test(k) && !extraKeep.includes(k)) continue;
    if (v == null) continue;
    if (typeof v === "string") { if (v.length) out[k] = v.length > 300 ? `${v.slice(0, 300)}…` : v; }
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (v?.toMillis || (typeof v === "object" && typeof v.seconds === "number")) out[k] = kstStr(tsMs(v));
  }
  return out;
}
const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// ─────────────────────────── 조회 도구 ───────────────────────────
const TOOLS = {
  get_invoices: {
    description: "플랫폼 청구서(운송사별 월 이용료) 목록과 상태별 합계. status: 청구(입금 대기)·연체·입금완료·미청구. 금액은 VAT 별도 원 단위.",
    input_schema: { type: "object", properties: { month: { type: "string", description: "YYYY-MM. 비우면 전체" }, status: { type: "string", enum: ["청구", "연체", "입금완료", "미청구"] } } },
    async run(db, { month, status } = {}) {
      let list = docs(await db.collection("platformInvoices").get());
      if (month) list = list.filter((v) => String(v.month || "") === month);
      if (status) list = list.filter((v) => (v.status || "미청구") === status);
      const sum = {};
      list.forEach((v) => { const s = v.status || "미청구"; sum[s] = sum[s] || { count: 0, amount: 0 }; sum[s].count += 1; sum[s].amount += Number(v.amount) || 0; });
      list.sort((a, b) => String(b.month).localeCompare(String(a.month)));
      return { total: list.length, byStatus: sum, rows: list.slice(0, 200).map((v) => ({ company: v.company, month: v.month, amount: Number(v.amount) || 0, status: v.status || "미청구", paidAt: v.paidAt || "", payNotice: v.payNotice ? `${v.payNotice.name || ""} ${v.payNotice.date || ""}`.trim() : "" })) };
    },
  },
  get_company_plans: {
    description: "운송사별로 지정된 요금제(planId)와 시작일.",
    input_schema: { type: "object", properties: {} },
    async run(db) {
      const list = docs(await db.collection("companyPlans").get());
      return { total: list.length, rows: list.map((p) => ({ company: p.id, planId: p.planId || "", since: p.since || "" })) };
    },
  },
  get_plan_requests: {
    description: "고객사가 보낸 요금제 변경 요청. status: 요청(처리 대기)·처리.",
    input_schema: { type: "object", properties: { status: { type: "string", enum: ["요청", "처리"] } } },
    async run(db, { status } = {}) {
      let list = docs(await db.collection("planRequests").orderBy("createdAt", "desc").limit(150).get());
      if (status) list = list.filter((r) => r.status === status);
      return { total: list.length, rows: list.map((r) => slim(r)) };
    },
  },
  get_inquiries: {
    description: "홈페이지 도입 문의(잠재 고객). 회사명·담당자·문의 내용·처리 상태. 연락처는 보안상 빠져 있다.",
    input_schema: { type: "object", properties: { days: { type: "integer", description: "최근 며칠(기본 30, 최대 365)" } } },
    async run(db, { days = 30 } = {}) {
      const since = Date.now() - Math.min(365, Math.max(1, Number(days) || 30)) * 864e5;
      const list = docs(await db.collection("landingInquiries").orderBy("createdAt", "desc").limit(300).get()).filter((q) => tsMs(q.createdAt) >= since);
      return { total: list.length, rows: list.map((q) => { const s = slim(q); delete s.phone; delete s.email; delete s.tel; s.status = q.status || "신규"; return s; }) };
    },
  },
  get_sales_quotes: {
    description: "작성한 견적서 목록(견적번호·고객·요금제·금액·상태).",
    input_schema: { type: "object", properties: { limit: { type: "integer", description: "기본 50, 최대 200" } } },
    async run(db, { limit = 50 } = {}) {
      const n = Math.min(200, Math.max(1, Number(limit) || 50));
      const list = docs(await db.collection("salesQuotes").orderBy("createdAt", "desc").limit(n).get());
      return { total: list.length, rows: list.map((q) => { const s = slim(q); delete s.phone; delete s.email; return s; }) };
    },
  },
  get_applications: {
    description: "가입 신청 현황 — 운송사(transport)·화주사(shipper). 처리 대기(pending)와 최근 30일 신청.",
    input_schema: { type: "object", properties: {} },
    async run(db) {
      const since = Date.now() - 30 * 864e5;
      const pick = (a, kind) => ({ kind, company: normCo(a.companyName), type: a.type || "", status: a.status || "", name: a.name || a.representative || "", createdAt: kstStr(tsMs(a.createdAt)) });
      const [t, c] = await Promise.all([db.collection("transportApplications").get(), db.collection("companyApplications").get()]);
      const all = [...docs(t).map((a) => ({ a, k: "transport" })), ...docs(c).map((a) => ({ a, k: "shipper" }))];
      const pending = all.filter(({ a }) => a.status === "pending").map(({ a, k }) => pick(a, k));
      const recent = all.filter(({ a }) => tsMs(a.createdAt) >= since).sort((x, y) => tsMs(y.a.createdAt) - tsMs(x.a.createdAt)).map(({ a, k }) => pick(a, k));
      return { pendingCount: pending.length, pending, recent30d: recent.slice(0, 100) };
    },
  },
  get_support_requests: {
    description: "직원이 보낸 원격 지원 요청. status: pending(대기)·approved·done·rejected 등.",
    input_schema: { type: "object", properties: { status: { type: "string" } } },
    async run(db, { status } = {}) {
      let list = docs(await db.collection("supportRequests").orderBy("createdAt", "desc").limit(100).get());
      if (status) list = list.filter((r) => r.status === status);
      return { total: list.length, rows: list.map((r) => { const s = slim(r); delete s.phone; return s; }) };
    },
  },
  get_companies_overview: {
    description: "운송사별 계정 현황 — 직원 수·관리자 수·승인 대기 직원·기사 수·퇴사자, 화주사 계정 수. 개인 정보 없이 숫자만.",
    input_schema: { type: "object", properties: {} },
    async run(db) {
      const users = docs(await db.collection("users").get());
      const co = {}; const sh = {};
      users.forEach((u) => {
        if (u.role === "totalMaster" || u.role === "cafeUser") return;
        const n = normCo(u.companyName) || "돌캐";
        if (u.role === "shipper") { const s = sh[n] || (sh[n] = { users: 0, pending: 0 }); s.users += 1; if (u.approved === false) s.pending += 1; return; }
        const c = co[n] || (co[n] = { staff: 0, admins: 0, pendingStaff: 0, drivers: 0, quit: 0, newLast30d: 0 });
        if (tsMs(u.createdAt) > Date.now() - 30 * 864e5) c.newLast30d += 1;
        if (u.role === "driver") { c.drivers += 1; return; }
        if (u.employmentStatus === "퇴사") { c.quit += 1; return; }
        c.staff += 1; if (u.role === "admin") c.admins += 1; if (u.approved === false) c.pendingStaff += 1;
      });
      return { carriers: Object.entries(co).map(([company, v]) => ({ company, ...v })).sort((a, b) => b.staff - a.staff), shippers: Object.entries(sh).map(([company, v]) => ({ company, ...v })) };
    },
  },
  get_session_logs: {
    description: "로그인·로그아웃 기록(최근 최대 600건). 회사·이름·이메일·기기·IP·구분(event). 보안 점검용.",
    input_schema: { type: "object", properties: { days: { type: "integer", description: "최근 며칠(기본 1, 최대 14)" }, event: { type: "string" }, company: { type: "string" } } },
    async run(db, { days = 1, event, company } = {}) {
      const since = Date.now() - Math.min(14, Math.max(1, Number(days) || 1)) * 864e5;
      let list = docs(await db.collection("sessionLogs").orderBy("at", "desc").limit(600).get()).filter((l) => tsMs(l.at) >= since);
      if (event) list = list.filter((l) => l.event === event);
      if (company) list = list.filter((l) => normCo(l.companyName) === normCo(company));
      const byEvent = {}; list.forEach((l) => { byEvent[l.event || "-"] = (byEvent[l.event || "-"] || 0) + 1; });
      return { total: list.length, byEvent, rows: list.slice(0, 300).map((l) => ({ at: kstStr(tsMs(l.at)), event: l.event || "", company: l.companyName || "", name: l.name || "", email: l.email || "", device: String(l.device || "").slice(0, 80), ip: l.ip || "" })) };
    },
  },
  get_active_sessions: {
    description: "지금 로그인 유지 중인 세션 — 회사별·PC/모바일별 개수, 한 사람이 여러 기기로 접속한 경우.",
    input_schema: { type: "object", properties: {} },
    async run(db) {
      const list = docs(await db.collection("loginSessions").where("active", "==", true).get()).filter((s) => s.role !== "totalMaster");
      const byCo = {}; const byUser = {};
      list.forEach((s) => {
        const n = normCo(s.companyName) || "-"; const k = s.kind === "mobile" ? "mobile" : "pc";
        byCo[n] = byCo[n] || { pc: 0, mobile: 0 }; byCo[n][k] += 1;
        const u = s.uid || s.email || s.id; byUser[u] = byUser[u] || { name: s.name || s.email || "", company: n, devices: 0, lastSeen: 0 };
        byUser[u].devices += 1; byUser[u].lastSeen = Math.max(byUser[u].lastSeen, tsMs(s.lastSeen) || tsMs(s.createdAt));
      });
      const multi = Object.values(byUser).filter((u) => u.devices >= 3).map((u) => ({ ...u, lastSeen: kstStr(u.lastSeen) }));
      return { totalSessions: list.length, people: Object.keys(byUser).length, byCompany: byCo, manyDevices: multi };
    },
  },
  get_platform_notices: {
    description: "플랫폼 공지(전체·회사별로 보낸 공지) 최근 목록.",
    input_schema: { type: "object", properties: { limit: { type: "integer", description: "기본 20, 최대 100" } } },
    async run(db, { limit = 20 } = {}) {
      const n = Math.min(100, Math.max(1, Number(limit) || 20));
      const list = docs(await db.collection("platformNotices").orderBy("createdAt", "desc").limit(n).get());
      return { total: list.length, rows: list.map((x) => slim(x)) };
    },
  },
};

// ─────────────────────────── 팀 정의 ───────────────────────────
const COMMON = `
[공통 규칙]
- 당신은 운송·배차 관리 SaaS "LogisWeb" 플랫폼을 운영하는 회사의 사내 팀원이다. 질문하는 사람은 최고관리자 또는 부관리자다.
- 숫자·사실은 반드시 조회 도구로 확인한 결과만 근거로 쓴다. 도구 결과에 없는 내용은 추측하지 말고 "데이터 없음"이라고 말한다.
- 당신은 읽기 전용이다. 청구·요금·계정·공지 등을 직접 바꿀 수 없다. 바꿀 일이 있으면 "관리자센터 › 메뉴 이름"과 함께 할 일로 제안한다.
- 답변은 한국어 존댓말, 짧고 실무적으로. 첫 줄에 핵심 결론, 그다음 근거 숫자, 마지막에 "다음 할 일"을 번호 목록으로.
- 금액은 원 단위에 천 단위 쉼표(예: 1,250,000원). 날짜는 YYYY-MM-DD.
- 표가 도움이 되면 마크다운 표를 써도 된다. 이모지는 쓰지 않는다.
- 사용자 메시지 앞의 [오늘 YYYY-MM-DD]가 오늘 날짜다.`;

const TEAMS = {
  acct: {
    name: "경리·회계팀",
    tools: ["get_invoices", "get_company_plans", "get_plan_requests"],
    role: "당신은 경리·회계팀장이다. 운송사별 월 이용료 청구, 입금 확인, 미수금·연체 관리, 요금제 변경 요청 처리를 맡는다. 미납·연체를 가장 먼저 짚고, 입금 독촉이 필요한 회사를 금액 큰 순서로 정리한다.",
  },
  finance: {
    name: "재무팀",
    tools: ["get_invoices", "get_company_plans", "get_companies_overview"],
    role: "당신은 재무팀장이다. 월별 매출 추이, 회수율(입금완료 ÷ 청구), 요금제 구성, 고객사 규모 대비 매출을 분석해 경영진에게 보고한다. 전월 대비 증감과 위험 신호를 숫자로 제시한다.",
  },
  sales: {
    name: "영업팀",
    tools: ["get_inquiries", "get_sales_quotes", "get_applications", "get_company_plans"],
    role: "당신은 영업팀장이다. 도입 문의 → 견적 → 가입 신청 → 요금제 지정까지의 영업 파이프라인을 관리한다. 응대가 늦은 문의, 견적 후 진행이 멈춘 건, 요금제 미지정 고객사를 찾아 우선순위를 매긴다.",
  },
  ops: {
    name: "운영팀",
    tools: ["get_support_requests", "get_applications", "get_companies_overview", "get_active_sessions", "get_platform_notices"],
    role: "당신은 운영팀장이다. 원격 지원 요청, 가입·직원 승인 대기, 고객사별 사용 현황, 공지 발송을 챙긴다. 오늘 처리해야 할 대기 건을 먼저 정리하고, 사용이 뜸한 고객사처럼 이탈 위험 신호를 알려 준다.",
  },
  security: {
    name: "보안팀",
    tools: ["get_session_logs", "get_active_sessions", "get_companies_overview"],
    role: "당신은 보안팀장이다. 로그인 기록과 접속 세션을 점검해 이상 징후(새벽 시간대 접속, 짧은 시간 여러 IP·기기, 한 계정의 과다 기기, 퇴사자·승인 대기 계정 활동 등)를 찾는다. 위험도(높음/보통/낮음)를 붙여 보고하고, 필요한 조치(관리자센터 › 보안·데이터 › 로그인 관리에서 강제 로그아웃 등)를 제안한다. 근거 없이 단정하지 않는다.",
  },
  marketing: {
    name: "홍보팀",
    tools: ["get_inquiries", "get_platform_notices", "get_companies_overview"],
    role: "당신은 홍보·마케팅팀장이다. 도입 문의 흐름과 고객사 현황을 보고 홍보 아이디어, 홈페이지 문구, 공지·블로그·SNS 글 초안을 쓴다. 글 초안은 바로 복사해 쓸 수 있게 완성된 문장으로 쓴다. 고객사 이름은 공개 글에 넣지 않는다.",
  },
};

function toolDefs(team) {
  return TEAMS[team].tools.map((name) => ({ name, description: TOOLS[name].description, input_schema: TOOLS[name].input_schema }));
}
const systemOf = (team) => `${TEAMS[team].role}\n${COMMON}`;

// ─────────────────────────── 에이전트 실행 ───────────────────────────
async function runTeamChat({ db, team, history, text }) {
  if (!TEAMS[team]) throw Object.assign(new Error("알 수 없는 팀입니다."), { status: 400 });
  const q = String(text || "").trim();
  if (!q) throw Object.assign(new Error("질문을 입력해 주세요."), { status: 400 });
  if (q.length > 4000) throw Object.assign(new Error("질문이 너무 깁니다(4,000자 이하)."), { status: 400 });
  const prev = Array.isArray(history) ? history : [];
  if (Buffer.byteLength(JSON.stringify(prev)) > MAX_HISTORY_BYTES) throw Object.assign(new Error("대화가 너무 길어졌습니다. [새 대화]로 시작해 주세요."), { status: 413 });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages = [...prev, { role: "user", content: `[오늘 ${kstDate()}] ${q}` }];
  const tools = toolDefs(team);
  const system = systemOf(team);
  const used = [];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let res = null;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system,
      tools,
      messages,
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
      // 안전 분류기가 거절하면 서버가 알아서 다른 모델로 이어서 답한다
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    usage.input += res.usage?.input_tokens || 0;
    usage.output += res.usage?.output_tokens || 0;
    usage.cacheRead += res.usage?.cache_read_input_tokens || 0;
    usage.cacheWrite += res.usage?.cache_creation_input_tokens || 0;
    messages.push({ role: "assistant", content: res.content }); // 받은 그대로 덧붙인다(생각 블록 포함)

    if (res.stop_reason === "pause_turn") continue;
    if (res.stop_reason !== "tool_use") break;

    const calls = res.content.filter((b) => b.type === "tool_use");
    const results = await Promise.all(calls.map(async (c) => {
      used.push(c.name);
      const t = TOOLS[c.name];
      if (!t || !TEAMS[team].tools.includes(c.name)) return { type: "tool_result", tool_use_id: c.id, content: "이 팀이 쓸 수 없는 도구입니다.", is_error: true };
      try {
        const out = await t.run(db, c.input && typeof c.input === "object" ? c.input : {});
        return { type: "tool_result", tool_use_id: c.id, content: JSON.stringify(out) };
      } catch (e) {
        console.error(`[AI 팀] 도구 ${c.name} 실패:`, e);
        return { type: "tool_result", tool_use_id: c.id, content: `조회 실패: ${e?.message || e}`, is_error: true };
      }
    }));
    messages.push({ role: "user", content: results });
  }

  let reply = (res?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (res?.stop_reason === "refusal") reply = "이 요청은 처리할 수 없습니다. 질문을 바꿔서 다시 시도해 주세요.";
  else if (res?.stop_reason === "tool_use") reply = `${reply}\n\n(조회 단계가 많아 여기서 멈췄습니다. "계속"이라고 보내면 이어서 답합니다.)`.trim();
  else if (res?.stop_reason === "max_tokens") reply = `${reply}\n\n(답변이 길어 중간에 끊겼습니다. "계속"이라고 보내 주세요.)`;
  if (!reply) reply = "답변을 만들지 못했습니다. 다시 시도해 주세요.";

  // 도구 호출 중에 멈췄다면 기록은 tool_result(user)로 끝난다 — 다음 질문(user)이 그 뒤에 붙어 한 턴으로 합쳐진다

  return { reply, history: messages, used: [...new Set(used)], usage, model: res?.model || MODEL };
}

function apiErrorMessage(e) {
  if (e instanceof Anthropic.AuthenticationError) return { status: 502, msg: "Claude API 키가 올바르지 않습니다. Firebase 비밀값 ANTHROPIC_API_KEY를 확인해 주세요." };
  if (e instanceof Anthropic.PermissionDeniedError) return { status: 502, msg: "이 API 키로는 사용할 수 없는 기능입니다. Claude Console에서 키 권한을 확인해 주세요." };
  if (e instanceof Anthropic.RateLimitError) return { status: 429, msg: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." };
  if (e instanceof Anthropic.BadRequestError) {
    const m = String(e.message || "");
    if (/credit balance/i.test(m)) return { status: 402, msg: "Claude 크레딧이 부족합니다. Claude Console › 잔액 충전에서 충전해 주세요." };
    return { status: 400, msg: `요청 오류: ${m}` };
  }
  if (e instanceof Anthropic.APIConnectionError) return { status: 503, msg: "Claude 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  if (e instanceof Anthropic.APIError) return { status: 502, msg: `Claude API 오류(${e.status || "?"}): ${e.message}` };
  return { status: e?.status || 500, msg: e?.message || String(e) };
}

module.exports = { runTeamChat, apiErrorMessage, TEAMS, TOOLS };
