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
  makeAnthropic: fakeAi({ reply: "10월 15일 평택 한결물류 상차 맞으시죠? 하차지는 어디예요?", action: "ask", patch: [{ k: "상차일", v: "2026-10-15" }, { k: "하차일", v: "2026-10-15" }, { k: "상차지명", v: "한결물류 평택허브" }] }) });
ok(r1.action === "ask" && r1.patch.상차일 === "2026-10-15" && r1.patch.상차지명 === "한결물류 평택허브", "칸 · 할 일을 돌려준다");
ok(fakeAi.last.model === "claude-haiku-5-5" && fakeAi.last.output_config?.format?.type === "json_schema", "Haiku · JSON 형식으로 부른다");
ok(/평택 한결/.test(fakeAi.last.messages[0].content), "사용자 말이 들어간다");

const r2 = await V.runVoiceTurn({ db: fakeDb(staff), auth, data: { text: "응" }, makeAnthropic: fakeAi({ reply: "네", action: "delete_all", patch: [{ k: "기사명", v: "x" }] }) });
ok(r2.action === "ask" && !("기사명" in r2.patch), "모르는 할 일 · 칸은 버린다");

const r3 = await V.runVoiceTurn({ db: fakeDb(staff), auth, data: { text: "아무 말" }, makeAnthropic: fakeAi({}, "refusal") });
ok(r3.action === "ask" && r3.reply.length > 0, "거절이면 안전한 대답");

let denied = "";
try { await V.runVoiceTurn({ db: fakeDb({ role: "driver", approved: true, companyName: "x" }), auth, data: { text: "안녕" }, makeAnthropic: fakeAi({}) }); } catch (e) { denied = e.code; }
ok(denied === "permission-denied", "기사 계정은 못 쓴다");

let empty = "";
try { await V.runVoiceTurn({ db: fakeDb(staff), auth, data: { text: "   " }, makeAnthropic: fakeAi({}) }); } catch (e) { empty = e.code; }
ok(empty === "invalid-argument", "빈 말은 거절");

ok(V.SCHEMA.properties.patch.items.properties.k.enum.length === V.KEYS.length, "칸 목록이 형식과 같다");
if (fails) { console.error(`\n${fails}개 실패`); process.exit(1); }
console.log("\nvoiceOrder: 모두 통과");
