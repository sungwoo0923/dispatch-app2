// 📞 AI 상담원 음성 오더 서버 검사 — node scripts/voiceOrder.test.mjs (functions 패키지가 설치돼 있어야 함)
//  가짜 DB · 가짜 Claude로 runVoiceTurn 이 ① 직원만 쓰게 ② 정해진 칸만 돌려주고 ③ 이상한 할 일은 'ask'로 ④ 거절은 안전한 대답으로 바꾸는지 본다.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const V = require("../functions/voiceOrder.js");

let fails = 0;
const ok = (c, n) => { if (c) console.log("✓", n); else { fails++; console.error("✗", n); } };

const doc = (data) => ({ exists: !!data, data: () => data });
const fakeDb = (user) => ({
  collection: (name) => ({
    doc: () => ({ get: async () => doc(name === "users" ? user : null) }),
  }),
  runTransaction: async (fn) => fn({ get: async () => doc({ voice: 0 }), set: () => {} }),
});
const fakeAi = (payload, stop = "end_turn") => () => ({ messages: { create: async (req) => { fakeAi.last = req; return { stop_reason: stop, content: [{ type: "text", text: JSON.stringify(payload) }], usage: {} }; } } });
const staff = { role: "admin", companyName: "테스트운송", approved: true };
const auth = { uid: "u1", token: { email: "a@b.c" } };

const r1 = await V.runVoiceTurn({ db: fakeDb(staff), auth, data: { text: "10월 15일 당상 당착 상차지는 평택 한결", history: [], current: {} },
  makeAnthropic: fakeAi({ reply: "지게차 18만 원은 어디서 부담할까요?", action: "ask", patch: [{ k: "상차일", v: "2026-10-15" }, { k: "하차일", v: "2026-10-15" }, { k: "상차지명", v: "한결물류 평택허브" }],
    stopsChanged: true, stops: [{ kind: "상차", name: "트레이더스 칠곡", time: "", method: "", cargo: "" }], specialsChanged: true, specials: [{ type: "지게차", name: "", amount: 180000, burden: "" }],
    newItems: [{ kind: "지급방식", value: "착불", confirmed: false }, { kind: "모름", value: "x", confirmed: true }] }) });
ok(r1.action === "ask" && r1.patch.상차일 === "2026-10-15" && r1.patch.상차지명 === "한결물류 평택허브", "칸 · 할 일을 돌려준다");
ok(r1.stops?.length === 1 && r1.stops[0].name === "트레이더스 칠곡" && r1.specials?.[0]?.amount === 180000 && r1.specials[0].burden === "", "경유지 · 특수운임(부담 안 정함)을 돌려준다");
ok(r1.newItems.length === 1 && r1.newItems[0].kind === "지급방식" && r1.newItems[0].confirmed === false, "새 이름은 정해진 종류만");
ok(/당착/.test(V.SYSTEM) && /월착/.test(V.SYSTEM) && /까대기/.test(V.SYSTEM), "배차 용어가 들어 있다");
ok(fakeAi.last.model === "claude-haiku-5-5" && fakeAi.last.output_config?.format?.type === "json_schema", "Haiku · JSON 형식으로 부른다");
ok(/평택 한결/.test(fakeAi.last.messages[0].content), "사용자 말이 들어간다");

const r2 = await V.runVoiceTurn({ db: fakeDb(staff), auth, data: { text: "응" }, makeAnthropic: fakeAi({ reply: "네", action: "delete_all", patch: [{ k: "기사명", v: "x" }, { k: "모름", v: "y" }], stopsChanged: false, stops: [], specialsChanged: false, specials: [], newItems: [] }) });
ok(r2.action === "ask" && r2.patch.기사명 === "x" && !("모름" in r2.patch) && r2.stops === null && r2.specials === null, "모르는 할 일은 ask · 바뀌지 않은 경유 · 특수운임은 null");

const r3 = await V.runVoiceTurn({ db: fakeDb(staff), auth, data: { text: "아무 말" }, makeAnthropic: fakeAi({}, "refusal") });
ok(r3.action === "ask" && r3.reply.length > 0, "거절이면 안전한 대답");

let denied = "";
try { await V.runVoiceTurn({ db: fakeDb({ role: "driver", approved: true, companyName: "x" }), auth, data: { text: "안녕" }, makeAnthropic: fakeAi({}) }); } catch (e) { denied = e.code; }
ok(denied === "permission-denied", "기사 계정은 못 쓴다");

let empty = "";
try { await V.runVoiceTurn({ db: fakeDb(staff), auth, data: { text: "   " }, makeAnthropic: fakeAi({}) }); } catch (e) { empty = e.code; }
ok(empty === "invalid-argument", "빈 말은 거절");

ok(V.SCHEMA.properties.patch.items.properties.k.enum.length === V.KEYS.length, "칸 목록이 형식과 같다");
const u = V.buildUser({ text: "에이제이", current: { 상차일: "2026-11-25", stops: [{ kind: "상차", name: "트레이더스 칠곡" }], driverNote: "1번 김철수 2번 이영희" },
  known: { clients: ["AJ네트웍스"], places: [{ n: "이마트트레이더스 여주점", a: "경기 여주시" }], options: { 지급방식: ["계산서"] }, glossary: [["에이제이", "AJ네트웍스"]] }, now: Date.now() });
ok(/에이제이 = AJ네트웍스/.test(u) && /AJ네트웍스/.test(u) && /경유1: 상차 트레이더스 칠곡/.test(u) && /기사 고르기 안내/.test(u) && /지급방식: 계산서/.test(u), "용어 사전 · 목록 · 경유 · 기사 안내가 AI에 간다");
// Haiku가 권한 오류면 Sonnet으로 다시
const { Anthropic } = require("../functions/orderScan.js");
const authErr = Object.assign(Object.create(Anthropic.PermissionDeniedError.prototype), { status: 403, message: "model not allowed" });
const tried = [];
const flaky = () => ({ messages: { create: async (req) => { tried.push(req.model); if (req.model === "claude-haiku-5-5") throw authErr;
  return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ reply: "네", action: "ask", patch: [], stopsChanged: false, stops: [], specialsChanged: false, specials: [], newItems: [] }) }], usage: {} }; } } });
const r4 = await V.runVoiceTurn({ db: fakeDb(staff), auth, data: { text: "안녕" }, makeAnthropic: flaky });
ok(r4.reply === "네" && tried.join(",") === "claude-haiku-5-5,claude-sonnet-5-5", "Haiku가 막히면 Sonnet으로 다시");
let why = "";
try { await V.runVoiceTurn({ db: fakeDb(staff), auth, data: { text: "안녕" }, makeAnthropic: () => ({ messages: { create: async () => { throw authErr; } } }) }); } catch (e) { why = `${e.code} ${e.message}`; }
ok(/failed-precondition/.test(why) && /403/.test(why), "둘 다 막히면 이유(403)를 알려 준다");
if (fails) { console.error(`\n${fails}개 실패`); process.exit(1); }
console.log("\nvoiceOrder: 모두 통과");
