// 강제 업데이트 예약 계산 테스트 — node scripts/forceUpdate.test.mjs
import assert from "node:assert/strict";
import { forceApplies, forceBehind, forceLeft, fmtLeft } from "../src/forceUpdateCore.js";
let n = 0; const ok = (c, m) => { assert.ok(c, m); n += 1; };
const all = { active: true, fireAt: 1000, scope: "all", shippers: false, build: "2026-11-24T08-00" };
const pick = { ...all, scope: "pick", companies: ["태진", "큐런"] };
ok(forceApplies(all, { company: "아무회사", role: "admin" }), "전체 = 모든 운송사");
ok(!forceApplies(all, { company: "태진", role: "totalMaster" }), "최고관리자는 제외");
ok(!forceApplies(all, { role: "shipper", linkedCompany: "태진" }), "화주사 포함을 안 켜면 화주 제외");
ok(forceApplies({ ...all, shippers: true }, { role: "shipper", linkedCompany: "아무" }), "화주사 포함 + 전체");
ok(forceApplies(pick, { company: " 태진 ", role: "user" }), "고른 회사");
ok(!forceApplies(pick, { company: "한빛", role: "user" }), "안 고른 회사");
ok(forceApplies({ ...pick, shippers: true }, { role: "shipper", linkedCompany: "큐런" }), "고른 회사의 연동 화주");
ok(!forceApplies({ ...pick, shippers: true }, { role: "shipper", linkedCompany: "한빛" }), "다른 회사 화주");
ok(!forceApplies({ ...all, active: false }, { company: "태진", role: "user" }), "취소된 예약");
ok(forceBehind(all, "2026-11-23T10-00") && !forceBehind(all, "2026-11-24T08-00") && !forceBehind(all, "2026-11-25T01-00"), "예전 화면만");
ok(!forceBehind(all, ""), "버전 모르면 안내 안 함");
ok(forceLeft({ fireAt: 61000 }, 1000) === 60 && forceLeft({ fireAt: 0 }, 5000) === 0, "남은 초");
ok(fmtLeft(134) === "02:14" && fmtLeft(7) === "00:07", "표시");
console.log(`forceUpdate OK (${n})`);

// ⏱ 2026-11-25 예약 배포 — scheduledPinOf
{
  const { scheduledPinOf } = await import("../src/forceUpdateCore.js");
  const d = { url: "a", build: "OLD", scheduled: { url: "n.vercel.app", build: "NEW", version: "2", at: 2000, scope: "pick", companies: ["태진"] } };
  const chk = (name, ok) => { if (!ok) { console.error("FAIL", name); process.exitCode = 1; } };
  chk("예약 전에는 대상도 아님", scheduledPinOf(d, { now: 1000, company: "태진" }) === null);
  chk("예약 후 대상 회사", scheduledPinOf(d, { now: 3000, company: "태진" })?.build === "NEW");
  chk("예약 후 다른 회사는 그대로", scheduledPinOf(d, { now: 3000, company: "다른" }) === null);
  chk("[지금 적용]으로 먼저 받은 PC는 유지", scheduledPinOf(d, { now: 1000, company: "다른", forced: "NEW" })?.build === "NEW");
  chk("전체 대상", scheduledPinOf({ scheduled: { ...d.scheduled, scope: "all" } }, { now: 3000, company: "아무" })?.build === "NEW");
  chk("예약 없음", scheduledPinOf({ url: "a", build: "OLD" }, { now: 3000 }) === null);
  console.log("scheduledPinOf OK");
}
