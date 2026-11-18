// 🎨 2026-11-18 컨테이너 · 해상 · 항공 — 같은 구간 운임 찾기 · 내륙과 같은 메뉴 묶음 점검 — node scripts/freightFare.test.mjs
import assert from "node:assert/strict";
import { routeScore, similarJobs, fareStats, laneTable, routeText } from "../src/freight/freightFare.js";

const ct = (o) => ({ mode: "container", sales: [{ cur: "KRW", amount: o.sale }], costs: [{ cur: "KRW", amount: o.cost }], ...o });
const jobs = [
  ct({ id: "a", pickupPlace: "부산신항 PNC", doorPlace: "평택 물류센터", size: "40HC", sale: 600000, cost: 450000, createdAtMs: 3 }),
  ct({ id: "b", pickupPlace: "부산북항 BPT", doorPlace: "평택 물류센터", size: "40GP", sale: 550000, cost: 420000, createdAtMs: 2 }),
  ct({ id: "c", pickupPlace: "부산신항 PNC", doorPlace: "평택 물류센터", size: "20GP", sale: 400000, cost: 300000, createdAtMs: 1 }),
  ct({ id: "d", pickupPlace: "부산신항 PNC", doorPlace: "이천 창고", size: "40HC", sale: 700000, cost: 500000, createdAtMs: 4 }),
  { id: "s1", mode: "sea", pol: "KRPUS", pod: "USLAX", seaType: "FCL", sales: [{ cur: "USD", amount: 2000, rate: 1400 }], costs: [], createdAtMs: 1 },
  { id: "a1", mode: "air", dep: "ICN", arr: "LAX", cw: 100, sales: [{ cur: "KRW", amount: 500000 }], costs: [], createdAtMs: 1 },
];
const cond = { mode: "container", pickupPlace: "부산신항 PNC", doorPlace: "평택  물류센터", size: "40HC" };
assert.equal(routeScore(cond, jobs[0]), 2, "같은 픽업 · 작업지 · 40ft = 같은 구간");
assert.equal(routeScore(cond, jobs[1]), 1, "작업지만 같음 = 비슷한 구간");
assert.equal(routeScore(cond, jobs[2]), 0, "20ft 는 다른 구간");
assert.equal(routeScore(cond, jobs[3]), 0, "작업지가 다르면 아님");
const found = similarJobs(cond, jobs);
assert.deepEqual(found.map((x) => x.j.id), ["a", "b"], "같은 구간 먼저");
const st = fareStats(found);
assert.equal(st.sale.min, 550000); assert.equal(st.sale.max, 600000); assert.equal(st.sale.avg, 575000);
assert.equal(similarJobs({ mode: "sea", pol: "KRPUS", pod: "USLAX", seaType: "FCL" }, jobs)[0].p.sale, 2800000, "외화는 환율로 원화");
const air = similarJobs({ mode: "air", dep: "ICN", arr: "LAX" }, jobs);
assert.equal(fareStats(air).perKg.avg, 5000, "항공 kg당 단가");
assert.equal(laneTable(jobs, "container").length, 4);
assert.equal(routeText(jobs[0]), "부산신항 PNC → 평택 물류센터 · 40HC");

// 메뉴 — 컨테이너 · 해상 · 항공도 내륙처럼 묶인다
const { bizTopMenus, bizMenuLabel, bizSideGroups, bizFirstMenu } = await import("../src/bizModules.js").catch(() => ({}));
if (bizTopMenus) {
  const top = bizTopMenus("sea");
  assert.deepEqual(top.slice(0, 5), ["HOME", "biz:sea:new", "biz:sea:live", "biz:sea:list", "biz:sea:fare"]);
  assert.ok(top.includes("biz:sea:pnl") && top.includes("biz:sea:settle") && top.includes("거래처관리"));
  assert.ok(!top.includes("기사관리"), "해상은 기사관리 없음");
  assert.ok(bizTopMenus("container").includes("지입차관리"));
  assert.equal(bizMenuLabel("biz:sea:list"), "선적현황");
  assert.equal(bizMenuLabel("biz:container:pnl"), "매출관리");
  assert.equal(bizFirstMenu("air"), "HOME");
  assert.equal(bizSideGroups("air")[1].label, "배차");
}
console.log("freightFare OK");
