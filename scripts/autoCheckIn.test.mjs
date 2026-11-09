// PC 자동 출근 재시도 규칙(src/autoCheckInPlan.js) 가상 테스트 — node scripts/autoCheckIn.test.mjs
// 화면 쪽 동작(처음 열기·탭 다시 보기·포커스·5분 주기)을 흉내 내고, 가짜 서버(출근 문서)로 결과를 본다.
// 예전 방식(old: 화면이 처음 그려질 때 한 번만)과 비교해 버그 재현 → 새 방식 통과를 확인한다.
import { shouldAttempt, applyResult, TICK_MS } from "../src/autoCheckInPlan.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗", m); } };

// 가짜 서버 + tryAutoCheckIn 흉내(출근시간 09:00 → 06:00부터 출근 가능, 18:00 이후 late)
function makeServer() {
  const docs = new Map(); let failNext = 0; let writes = 0; let calls = 0;
  return {
    docs, get writes() { return writes; }, get calls() { return calls; }, failOnce(n = 1) { failNext = n; },
    async tryCheckIn(day, hm) {
      calls++;
      if (docs.has(day)) return { ok: false, reason: "exists" };
      const [h, m] = hm.split(":").map(Number); const min = h * 60 + m;
      if (min < 360) return { ok: false, reason: "early" };
      if (min > 1080) return { ok: false, reason: "late" };
      if (failNext > 0) { failNext--; throw new Error("permission-denied"); }
      docs.set(day, { checkInTime: hm }); writes++;
      return { ok: true };
    },
  };
}
// 한 "탭"(화면)
function makeTab(server, clock, { old = false } = {}) {
  let st = { doneDay: "", busy: false, nextAt: 0 }; let firstDone = false;
  const attempt = async (force) => {
    if (old) { if (firstDone) return; firstDone = true; }
    const today = clock.day;
    if (!old && !shouldAttempt(st, today, clock.ms, force)) return;
    st = { ...st, busy: true };
    const r = await server.tryCheckIn(today, clock.hm).catch(() => ({ ok: false, reason: "error" }));
    st = applyResult(st, today, r, clock.ms);
  };
  return { open: () => attempt(true), visible: () => attempt(true), tick: () => attempt(false) };
}
const at = (day, hm) => ({ day, hm, ms: Date.parse(`${day}T${hm}:00+09:00`) });

{ const s = makeServer(); await makeTab(s, at("2026-11-09", "08:40")).open(); ok(s.docs.has("2026-11-09"), "첫 접속 → 출근"); }
{ const s = makeServer(); const c = at("2026-11-09", "08:40"); await makeTab(s, c).open(); await makeTab(s, c).open(); await makeTab(s, c).open(); ok(s.writes === 1, "새로고침·새 탭 3번 → 출근 기록 1번(중복 없음)"); }
for (const old of [true, false]) {
  const s = makeServer(); const c = at("2026-11-09", "08:40"); const t = makeTab(s, c, { old }); await t.open();
  Object.assign(c, at("2026-11-10", "08:50")); await t.visible();
  ok(old ? !s.docs.has("2026-11-10") : s.docs.has("2026-11-10"), `${old ? "예전" : "새"} 방식 · 브라우저 켜 둔 채 다음날 그 탭으로 들어옴 → ${old ? "출근 안 됨(버그 재현)" : "출근"}`);
}
{ const s = makeServer(); const c = at("2026-11-09", "17:00"); const t = makeTab(s, c); await t.open();
  Object.assign(c, at("2026-11-10", "05:50")); await t.tick(); ok(!s.docs.has("2026-11-10"), "켜 둔 채 자정 넘김 · 05:50(출근 가능 전) → 아직 안 함");
  Object.assign(c, at("2026-11-10", "06:05")); await t.tick(); ok(s.docs.has("2026-11-10"), "켜 둔 채 자정 넘김 · 06:05 5분 주기 확인 → 출근"); }
for (const old of [true, false]) {
  const s = makeServer(); s.failOnce(); const c = at("2026-11-09", "08:40"); const t = makeTab(s, c, { old }); await t.open();
  Object.assign(c, at("2026-11-09", "08:41")); await t.tick();
  ok(old ? !s.docs.has("2026-11-09") : s.docs.has("2026-11-09"), `${old ? "예전" : "새"} 방식 · 로그인 직후 첫 저장 실패 → ${old ? "출근 안 됨(버그 재현)" : "1분 뒤 다시 시도해 출근"}`);
}
{ const s = makeServer(); await makeTab(s, at("2026-11-09", "09:10")).open(); ok(s.docs.has("2026-11-09"), "브라우저 재시작(새 탭) → 출근"); }
{ const s = makeServer(); const c = at("2026-11-09", "08:40"); const t = makeTab(s, c); await t.open(); const n = s.calls;
  await t.visible(); await t.tick(); await t.visible(); ok(s.calls === n, "이미 출근함 · 같은 날 탭 다시 보기·주기 확인 → 서버 추가 조회 없음"); }
{ const s = makeServer(); const c = at("2026-11-09", "04:00"); const t = makeTab(s, c); await t.open(); ok(!s.docs.has("2026-11-09"), "새벽 04:00 접속 → 출근 안 함");
  c.ms += 60 * 1000; const n = s.calls; await t.tick(); ok(s.calls === n, "새벽 · 1분 뒤 주기 확인 → 5분 대기 중이라 건너뜀"); }
{ const s = makeServer(); const c = at("2026-11-09", "19:00"); const t = makeTab(s, c); await t.open(); await t.visible(); ok(!s.docs.has("2026-11-09") && s.calls === 1, "19:00 접속(퇴근시간 지남) → 출근 안 함 · 그날 재시도 없음"); }
ok(TICK_MS === 300000, "주기 확인 간격 5분");
console.log(`자동 출근 가상 테스트: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
