// 🆘 "도움 필요" 판정 단위 테스트 — node scripts/helpNeeded.test.mjs
import { helpNeededOf, helpNeededList, kstDayStartMs } from "../functions/helpNeededCore.mjs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗", m); } };
const NOW = Date.parse("2026-11-10T10:00:00+09:00");
const co = (o) => ({ name: "큐런", staff: 4, drivers: 0, totalOrders: 0, m: { cnt: 0 }, plan: { since: "2026-11-09" }, ...o });

ok(kstDayStartMs("2026-11-09") === Date.parse("2026-11-09T00:00:00+09:00"), "KST 0시 계산");
let h = helpNeededOf(co(), NOW);
ok(h && h.day === 2 && h.reasons.includes("오더 0건") && h.reasons.includes("기사 0명"), "가입 2일째 · 오더 0 · 기사 0 → 도움 필요");
ok(!helpNeededOf(co({ drivers: 3, totalOrders: 12 }), NOW), "오더·기사 있으면 아님");
h = helpNeededOf(co({ drivers: 3, totalOrders: 12, staff: 1 }), NOW);
ok(h && h.reasons.join() === "직원 1명", "2일째 직원 1명뿐 → 도움 필요");
ok(!helpNeededOf(co({ drivers: 3, totalOrders: 12, staff: 1, plan: { since: "2026-11-10" } }), NOW), "가입 당일 직원 1명은 아직 아님");
ok(helpNeededOf(co({ plan: { since: "2026-11-04" } }), NOW)?.day === 7, "7일째까지 표시");
ok(!helpNeededOf(co({ plan: { since: "2026-11-03" } }), NOW), "8일째부터 표시 안 함");
ok(!helpNeededOf(co({ plan: null, appliedAt: 0 }), NOW), "시작일 모르면 아님");
ok(helpNeededOf(co({ plan: null, appliedAt: Date.parse("2026-11-08T15:00:00+09:00") }), NOW)?.day === 3, "since 없으면 가입 신청일 기준");
ok(!helpNeededOf(co(), NOW, { 큐런: Date.parse("2026-11-09T12:00:00+09:00") }), "[확인함] 누르면 숨김");
ok(!!helpNeededOf(co(), NOW, { 큐런: Date.parse("2026-11-01T12:00:00+09:00") }), "예전(가입 전) 확인은 무시");
ok(!helpNeededOf(co({ kind: "shipper" }), NOW), "화주사 제외");
ok(!helpNeededOf(co({ m: { cnt: 5 } }), NOW)?.reasons.includes("오더 0건"), "이번 달 오더가 있으면 오더 0건 아님");
const L = helpNeededList([co({ name: "A", drivers: 2 }), co({ name: "B" }), co({ name: "C", drivers: 1, totalOrders: 3 })], NOW);
ok(L.length === 2 && L[0].c.name === "B", "목록: 신호 많은 순");
console.log(`도움 필요 판정 단위 테스트: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
