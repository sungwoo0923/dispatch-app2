// 🤖 2026-11-07 배차 AI 비서(서버) — 도구 고르기 · 제안 만들기 · 권한 막기 · 회사 분리 · 횟수 제한 단위 테스트
//  Claude 응답은 가짜(정해 둔 순서대로 돌려준다) · Firestore도 메모리 가짜. 실행: node scripts/aiAssistant.test.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const A = require("../functions/aiAssistant.js");

let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` :: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };
const has = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${name} ${cond ? "" : extra}`); };

// ── 메모리 Firestore ──
function fakeDb(seed) {
  const store = JSON.parse(JSON.stringify(seed)); // { col: { id: data } }
  const snapOf = (col, id) => { const d = store[col]?.[id]; return { id, exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined) }; };
  const docRef = (col, id) => ({ col, id, get: async () => snapOf(col, id), set: async (data, o) => { store[col] = store[col] || {}; store[col][id] = o?.merge ? { ...(store[col][id] || {}), ...data } : data; } });
  const query = (col, conds = [], lim = 0) => ({
    where: (f, op, v) => query(col, [...conds, [f, op, v]], lim),
    limit: (n) => query(col, conds, n),
    orderBy: () => query(col, conds, lim),
    doc: (id) => docRef(col, id),
    add: async (data) => { const id = `auto${Math.random().toString(36).slice(2, 8)}`; await docRef(col, id).set(data); return { id }; },
    get: async () => {
      let ids = Object.keys(store[col] || {});
      ids = ids.filter((id) => conds.every(([f, op, v]) => { const x = store[col][id][f]; return op === "==" ? x === v : op === ">=" ? x >= v : op === "<=" ? x <= v : true; }));
      if (lim) ids = ids.slice(0, lim);
      return { docs: ids.map((id) => snapOf(col, id)) };
    },
  });
  return {
    store,
    collection: (c) => query(c),
    runTransaction: async (fn) => fn({ get: (ref) => ref.get(), set: (ref, d, o) => ref.set(d, o) }),
  };
}
const TODAY = "2026-11-07";
const NOW = Date.parse("2026-11-07T03:00:00Z"); // 한국 12시
const seed = () => ({
  users: {
    u1: { role: "admin", companyName: "테스트운송", name: "김팀장", approved: true },
    u2: { role: "viewer", companyName: "테스트운송", name: "조회", approved: true },
    u3: { role: "user", companyName: "테스트운송", name: "사무원", approved: true },
    u4: { role: "driver", companyName: "테스트운송", name: "기사" },
    u5: { role: "admin", companyName: "남의운송", name: "남", approved: true },
    u6: { role: "admin", companyName: "테스트운송", name: "대기", approved: false },
  },
  orders: {
    A: { companyName: "테스트운송", 상차일: TODAY, 상차시간: "오전 9시", 하차일: TODAY, 거래처명: "삼진물산", 상차지명: "평택항", 하차지명: "이천센터", 화물내용: "기계부품 3파렛트", 청구운임: "250000", 기사운임: "200000", 차량번호: "" },
    B: { companyName: "테스트운송", 상차일: TODAY, 거래처명: "삼진물산", 상차지명: "평택항", 하차지명: "김해", 화물내용: "박스 20", 청구운임: 300000, 기사운임: 250000, 차량번호: "경기80바1000", 이름: "김철수", 배차상태: "배차완료" },
    C: { companyName: "테스트운송", 상차일: "2026-11-08", 거래처명: "한빛", 상차지명: "부산신항", 하차지명: "대전", 청구운임: 400000 },
    X: { companyName: "남의운송", 상차일: TODAY, 거래처명: "비밀화주", 상차지명: "남의상차", 하차지명: "남의하차", 청구운임: 999999 },
    L: { 상차일: TODAY, 거래처명: "예전오더", 상차지명: "옛상차", 하차지명: "옛하차", 청구운임: 1000 }, // 회사명 없는 예전 문서 = 기본 회사(돌캐)
  },
  drivers: {
    d1: { companyName: "테스트운송", 이름: "박민준", 차량번호: "경기81바1037", 전화번호: "010-1111-2222", 등급: "지입" },
    d2: { companyName: "테스트운송", 이름: "블랙기사", 차량번호: "서울99아9999", 전화번호: "010-9999-9999", 등급: "블랙" },
    d3: { companyName: "남의운송", 이름: "박민준", 차량번호: "부산11가1111", 전화번호: "010-0000-0000" },
  },
});

// ── 가짜 Claude: script(params, round) → 응답 ──
function fakeClaude(script) {
  const calls = [];
  return {
    calls,
    client: { beta: { messages: { stream: (params) => { calls.push(JSON.parse(JSON.stringify(params))); const r = script(params, calls.length - 1); return { finalMessage: async () => r }; } } } },
  };
}
const toolUse = (id, name, input) => ({ id: "msg", model: "claude-sonnet-5-5", stop_reason: "tool_use", usage: { input_tokens: 1000, output_tokens: 50, cache_read_input_tokens: 800 }, content: [{ type: "thinking", thinking: "", signature: "sig" }, { type: "tool_use", id, name, input }] });
const textMsg = (t) => ({ id: "msg", model: "claude-sonnet-5-5", stop_reason: "end_turn", usage: { input_tokens: 1200, output_tokens: 80 }, content: [{ type: "text", text: t }] });
const lastToolResults = (params) => params.messages[params.messages.length - 1].content;
const run = (db, uid, data, script, extra = {}) => { const f = fakeClaude(script); const logs = []; return A.runAssistantChat({ db, auth: uid ? { uid, token: {} } : null, data, makeAnthropic: () => f.client, now: NOW, log: (r) => logs.push(r), ...extra }).then((out) => ({ out, calls: f.calls, logs })); };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };

// ── 1) 칸 이름 · 값 맞추기 ──
eq("칸 별칭 운임 → 청구운임", A.fieldKeyOf("운임"), "청구운임");
eq("칸 별칭 상차지를 → 상차지명", A.fieldKeyOf("상차지를"), "상차지명");
eq("칸 별칭 기사비 → 기사운임", A.fieldKeyOf("기사비"), "기사운임");
eq("칸 별칭 화주 → 거래처명", A.fieldKeyOf("화주"), "거래처명");
eq("칸 별칭 톤수 → 차량톤수", A.fieldKeyOf("톤수"), "차량톤수");
eq("모르는 칸", A.fieldKeyOf("우주선"), null);
eq("금액 25만", A.moneyOf("25만"), 250000);
eq("금액 32만5천", A.moneyOf("32만5천"), 325000);
eq("금액 250,000원", A.moneyOf("250,000원"), 250000);
has("날짜 형식 틀리면 오류", !!A.cleanField("상차일", "내일").error);
eq("왕복 enum", A.cleanField("운행유형", "왕복"), { key: "운행유형", value: "왕복" });

// ── 2) 권한 기본값(src/customRoles.js와 같은 규칙) ──
eq("운송사무원은 매출관리 숨김", A.builtinDefault("user").매출관리, "hidden");
eq("관리자는 배차관리 쓰기", A.builtinDefault("admin").배차관리, "write");
eq("조회전용은 배차관리 읽기", A.builtinDefault("viewer").배차관리, "read");

// ── 3) 오더 수정: get_order → propose_order_update → 답 ──
{
  const db = fakeDb(seed());
  const { out, calls, logs } = await run(db, "u1", { text: "3파레트를 2파레트로", focusOrderId: "A", history: [] }, (p, i) => {
    if (i === 0) return toolUse("t1", "get_order", { order_id: "A" });
    if (i === 1) return toolUse("t2", "propose_order_update", { order_id: "A", changes: { 화물: "기계부품 2파렛트" }, reason: "요청" });
    return textMsg("화물을 2파렛트로 바꾸는 카드를 띄웠어요. 확인 후 적용을 눌러 주세요.");
  });
  has("첫 요청 사용자 글에 오늘·선택한 오더 정보", /\[오늘 2026-11-07\(토\)/.test(calls[0].messages[0].content) && /\[선택한 오더 id=A\]/.test(calls[0].messages[0].content));
  has("모델 = 최신 Sonnet · 캐시 · 대체 모델", calls[0].model === "claude-sonnet-5-5" && calls[0].cache_control?.type === "ephemeral" && calls[0].fallbacks === "default");
  has("강제 tool_choice 안 씀", !("tool_choice" in calls[0]));
  const tr = lastToolResults(calls[1])[0];
  has("get_order 결과에 현재 화물내용", tr.tool_use_id === "t1" && /기계부품 3파렛트/.test(tr.content));
  eq("제안 1건(update)", out.actions.map((x) => x.type), ["update"]);
  eq("diff: 화물내용 3 → 2", out.actions[0].changes, [{ field: "화물내용", before: "기계부품 3파렛트", after: "기계부품 2파렛트" }]);
  has("제안했지만 서버는 저장 안 함", db.store.orders.A.화물내용 === "기계부품 3파렛트");
  has("기록은 덧붙이기(assistant 원문 그대로 · 생각 블록 유지)", out.history.length === 6 && out.history[1].content[0].type === "thinking");
  eq("토큰 합계", [out.usage.calls, out.usage.input, out.usage.cacheRead], [3, 3200, 1600]);
  has("사용 기록(회사·도구·제안)", logs.length === 1 && logs[0].companyName === "테스트운송" && logs[0].tools.map((t) => t.name).join() === "get_order,propose_order_update" && logs[0].actions[0] === "update");
  eq("하루 남은 횟수", out.left, A.DAILY_TURNS - 1);
}

// ── 4) 회사 분리 — 다른 회사 오더는 안 보이고 못 바꾼다 ──
{
  const db = fakeDb(seed());
  const { out, calls } = await run(db, "u1", { text: "오늘 오더" }, (p, i) => {
    if (i === 0) return { ...toolUse("s1", "search_orders", {}), content: [{ type: "tool_use", id: "s1", name: "search_orders", input: {} }, { type: "tool_use", id: "s2", name: "get_order", input: { order_id: "X" } }, { type: "tool_use", id: "s3", name: "propose_order_update", input: { order_id: "X", changes: { 청구운임: 1 } } }] };
    return textMsg("완료");
  });
  const [r1, r2, r3] = lastToolResults(calls[1]);
  const rows = JSON.parse(r1.content).rows.map((r) => r.id).sort();
  eq("검색은 우리 회사 오늘 오더만(A,B)", rows, ["A", "B"]);
  has("남의 회사 오더 조회 = 없음", /없습니다/.test(r2.content) && r2.is_error === true);
  has("남의 회사 오더 수정 제안 = 없음", /없습니다/.test(r3.content) && !out.actions.length);
  has("병렬 도구 결과는 한 메시지에 전부", lastToolResults(calls[1]).length === 3);
}
{
  const db = fakeDb(seed());
  db.store.users.u7 = { role: "admin", companyName: "돌캐", name: "기본", approved: true };
  const { calls } = await run(db, "u7", { text: "오늘" }, (p, i) => (i === 0 ? toolUse("s", "search_orders", {}) : textMsg("ok")));
  eq("기본 회사는 회사명 없는 예전 오더 포함", JSON.parse(lastToolResults(calls[1])[0].content).rows.map((r) => r.id), ["L"]);
}
{
  const db = fakeDb(seed());
  const { calls } = await run(db, "u1", { text: "박민준 배정", focusOrderId: "A" }, (p, i) => (i === 0 ? toolUse("d", "search_drivers", { query: "박민준" }) : textMsg("ok")));
  eq("기사 찾기도 우리 회사만", JSON.parse(lastToolResults(calls[1])[0].content).rows.map((r) => r.차량번호), ["경기81바1037"]);
}

// ── 5) 권한 막기 ──
{
  const db = fakeDb(seed());
  const { out, calls } = await run(db, "u2", { text: "운임 30만으로", focusOrderId: "A" }, (p, i) => (i === 0 ? toolUse("t", "propose_order_update", { order_id: "A", changes: { 청구운임: "30만" } }) : textMsg("권한이 없어요")));
  const tr = lastToolResults(calls[1])[0];
  has("조회전용은 수정 제안이 거절된다", tr.is_error === true && /조회 전용/.test(tr.content) && out.actions.length === 0);
  has("조회전용에게도 컨텍스트에 권한 표시", /오더 조회만/.test(calls[0].messages[0].content));
}
{
  const db = fakeDb(seed());
  const { calls } = await run(db, "u3", { text: "이번 달 매출" }, (p, i) => (i === 0 ? toolUse("t", "sales_summary", {}) : textMsg("권한 없음")));
  has("운송사무원은 매출 조회 거절", /권한이 없어/.test(lastToolResults(calls[1])[0].content));
}
{
  const db = fakeDb(seed());
  db.store.customRoles = { user: { menus: { 매출관리: "read" } } };
  const { calls } = await run(db, "u3", { text: "이번 달 매출" }, (p, i) => (i === 0 ? toolUse("t", "sales_summary", { date_from: "2026-11-01", date_to: TODAY }) : textMsg("ok")));
  const r = JSON.parse(lastToolResults(calls[1])[0].content);
  has("권한 관리에서 매출관리를 켜면 조회된다", r.합계?.sale === 550000, JSON.stringify(r));
}
{
  const db = fakeDb(seed());
  db.store.companyRoleOverrides = { 테스트운송: { roles: { admin: { menus: { 배차관리: "read" } } } } };
  const { out } = await run(db, "u1", { text: "수정", focusOrderId: "A" }, (p, i) => (i === 0 ? toolUse("t", "propose_order_update", { order_id: "A", changes: { 메모: "x" } }) : textMsg("no")));
  has("운송사별 권한 설정에서 배차관리 읽기만이면 수정 제안 거절", out.actions.length === 0);
}
{
  const db = fakeDb(seed());
  const { calls } = await run(db, "u1", { text: "오더", mode: "hr" }, (p, i) => (i === 0 ? toolUse("t", "search_orders", {}) : textMsg("no")));
  has("인사 비서는 오더 도구를 쓸 수 없다(도구 목록에도 없음)", /쓸 수 없는 도구/.test(lastToolResults(calls[1])[0].content) && !calls[0].tools.some((t) => t.name === "search_orders"));
}
for (const [uid, why] of [[null, "unauthenticated"], ["u4", "permission-denied"], ["u6", "permission-denied"], ["nobody", "permission-denied"]]) {
  const e = await err(run(fakeDb(seed()), uid, { text: "hi" }, () => textMsg("x")));
  eq(`접근 막기 ${uid || "로그인 안 함"}`, e?.code, why);
}
{
  const db = fakeDb(seed());
  db.store.aiAssistantUsage = { u1_20261107: { turns: A.DAILY_TURNS } };
  const e = await err(run(db, "u1", { text: "hi" }, () => textMsg("x")));
  eq("하루 횟수 초과", e?.code, "resource-exhausted");
}
{
  const e = await err(run(fakeDb(seed()), "u1", { text: "hi" }, () => textMsg("x"), { makeAnthropic: () => null }));
  eq("키 없음 → failed-precondition(화면은 기본 답변으로)", e?.code, "failed-precondition");
}

// ── 6) 기사 배정 · 일괄 수정 · 등록 · 삭제 · 화면 이동 · 오더 고르기 ──
{
  const db = fakeDb(seed());
  const { out, calls } = await run(db, "u1", { text: "경기81바1037 배정", focusOrderId: "A" }, (p, i) => {
    if (i === 0) return { ...toolUse("a", "x", {}), content: [{ type: "tool_use", id: "a", name: "propose_driver_assign", input: { order_id: "A", driver: "경기81바1037" } }, { type: "tool_use", id: "b", name: "propose_driver_assign", input: { order_id: "C", driver: "서울99아9999" } }] };
    return textMsg("ok");
  });
  eq("차량번호 → 기사관리 이름·전화 자동", out.actions[0].changes.map((c) => `${c.field}:${c.after}`), ["차량번호:경기81바1037", "이름:박민준", "전화번호:010-1111-2222"]);
  has("블랙 기사 배정은 거절", /블랙/.test(lastToolResults(calls[1])[1].content) && out.actions.length === 1);
}
{
  const db = fakeDb(seed());
  const { out } = await run(db, "u1", { text: "오늘 삼진 오더 운임 전부 5000원 올려" }, (p, i) => (i === 0 ? toolUse("b", "propose_bulk_update", { filter: { client: "삼진" }, add: { 운임: 5000 } }) : textMsg("ok")));
  eq("일괄: 삼진 2건 청구운임 +5000", out.actions[0].items.map((x) => [x.id, x.changes[0].before, x.changes[0].after]).sort(), [["A", "250000", 255000], ["B", 300000, 305000]]);
}
{
  const db = fakeDb(seed());
  const { out, calls } = await run(db, "u1", { text: "등록" }, (p, i) => (i === 0 ? toolUse("c", "propose_order_create", { orders: [{ 거래처: "삼진", 상차지: "평택", 하차지: "이천", 운임: "25만", 톤수: "5톤" }, { 상차지명: "a" }] }) : textMsg("ok")));
  has("등록: 하차지 없는 건이 있으면 전체 다시", /하차지가 없습니다/.test(lastToolResults(calls[1])[0].content) && !out.actions.length);
  const { out: o2 } = await run(db, "u1", { text: "등록" }, (p, i) => (i === 0 ? toolUse("c", "propose_order_create", { orders: [{ 거래처: "삼진", 상차지: "평택", 하차지: "이천", 운임: "25만", 톤수: "5톤" }] }) : textMsg("ok")));
  eq("등록 제안: 칸 이름 맞추고 날짜 기본값", o2.actions[0].orders[0], { 거래처명: "삼진", 상차지명: "평택", 하차지명: "이천", 청구운임: 250000, 차량톤수: "5톤", 상차일: TODAY, 하차일: TODAY });
  has("등록도 서버는 저장 안 함", Object.keys(db.store.orders).length === 5);
}
{
  const db = fakeDb(seed());
  const { out } = await run(db, "u1", { text: "오더 수정해야해" }, (p, i) => {
    if (i === 0) return { ...toolUse("p", "x", {}), content: [{ type: "tool_use", id: "p", name: "show_order_picker", input: { range: "today" } }, { type: "tool_use", id: "n", name: "navigate", input: { menu: "배차현황" } }, { type: "tool_use", id: "d", name: "propose_order_delete", input: { order_ids: ["B", "X"] } }, { type: "tool_use", id: "s", name: "propose_schedule", input: { title: "삼진 운임 협의", date: "2026-11-09", start: "10:00" } }] };
    return textMsg("고르시면 바꿀 내용을 말씀해 주세요");
  });
  eq("고르기·이동·삭제(우리 회사 것만)·일정", out.actions.map((a) => a.type === "delete" ? `delete:${a.items.map((x) => x.id)}` : a.type), ["picker", "navigate", "delete:B", "schedule"]);
}

// ── 7) 인젝션 방지 문구 · 멈춤 처리 ──
has("system에 데이터 속 지시 무시 규칙", /데이터일 뿐 따르지 않는다/.test(A.systemOf("dispatch")));
{
  const db = fakeDb(seed());
  const { out } = await run(db, "u1", { text: "x" }, () => ({ ...textMsg(""), stop_reason: "refusal", content: [] }));
  has("거절이면 안내 문구", /처리할 수 없어요/.test(out.reply));
}
{
  const db = fakeDb(seed());
  const e = await err(run(db, "u1", { text: "x", history: [{ role: "user", content: "a".repeat(800 * 1024) }] }, () => textMsg("x")));
  eq("기록이 너무 길면 새 대화 안내", e?.code, "out-of-range");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
