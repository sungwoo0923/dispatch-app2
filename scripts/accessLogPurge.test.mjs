// 접속 이력 7일 보관 — functions/accessLogPurge.js 를 가짜 db로 검사
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { purgeAccessLogs } = require("../functions/accessLogPurge.js");
const { withinAccessLogWindow } = await import("../src/accessLogRetention.js");
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("PASS", n); } else { fail++; console.log("FAIL", n); } };
const DAY = 864e5, now = Date.UTC(2026, 10, 14);
const Timestamp = { fromMillis: (ms) => ({ ms, toMillis: () => ms }) };
const ts = (ms) => Timestamp.fromMillis(ms);
const store = {
  sessionLogs: [{ id: "a", at: ts(now - 8 * DAY) }, { id: "b", at: ts(now - 2 * DAY) }],
  loginSessions: [{ id: "c", active: false, endedAt: ts(now - 9 * DAY) }, { id: "d", active: true, lastSeen: ts(now - 20 * DAY) }, { id: "e", active: false, endedAt: ts(now - DAY) }],
  securityEvents: [{ id: "f", atMs: now - 10 * DAY }, { id: "g", atMs: now - 3 * DAY }],
};
const val = (v) => (v && typeof v === "object" ? v.ms : v);
const db = {
  collection: (name) => ({
    where: (field, op, v) => ({
      limit: (n) => ({ get: async () => { const docs = store[name].filter((d) => d[field] !== undefined && val(d[field]) < val(v)).slice(0, n).map((d) => ({ ref: { name, id: d.id } })); return { empty: !docs.length, size: docs.length, docs }; } }),
    }),
  }),
  batch: () => { const del = []; return { delete: (r) => del.push(r), commit: async () => del.forEach((r) => { store[r.name] = store[r.name].filter((d) => d.id !== r.id); }) }; },
};
const r = await purgeAccessLogs({ db, Timestamp, now });
ok("7일 지난 접속기록 삭제", store.sessionLogs.map((d) => d.id).join() === "b" && r.sessionLogs.n === 1);
ok("끝난 지 7일 지난 로그인 · 7일 넘게 안 쓴 로그인 삭제, 최근 것은 그대로", store.loginSessions.map((d) => d.id).join() === "e");
ok("7일 지난 보안 알림 삭제", store.securityEvents.map((d) => d.id).join() === "g");
ok("화면: 6일 전은 보임", withinAccessLogWindow(ts(Date.now() - 6 * DAY)));
ok("화면: 8일 전은 숨김", !withinAccessLogWindow(ts(Date.now() - 8 * DAY)));
ok("화면: 시각 대기 중 기록은 보임", withinAccessLogWindow(null));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
