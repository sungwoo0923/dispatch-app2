// 배차 빠른 도구 계산 검증 — node scripts/smartDispatch.test.mjs
import assert from "node:assert/strict";
import { parseQuickLine, buildRoutes, findRoutes, suggestDrivers, busyByDate, todayTodo } from "../src/smartDispatch.js";
const T = "2026-11-13";
let n = 0; const ok = (name, fn) => { fn(); n += 1; console.log("  ✓", name); };
const rows = [
  { _id: "a1", 거래처명: "가나물산", 상차지명: "가나 평택공장", 하차지명: "다라 물류센터", 하차지주소: "경기 이천시", 상차일: "2026-11-01", 차량번호: "경기80바1111", 이름: "홍기사", 전화번호: "010-0000-0001", 배차상태: "배차완료", 청구운임: "300000", 기사운임: "250000" },
  { _id: "a2", 거래처명: "가나물산", 상차지명: "가나 평택공장", 하차지명: "다라 물류센터", 상차일: "2026-11-05", 차량번호: "경기80바1111", 이름: "홍기사", 배차상태: "배차완료", 청구운임: "300000", 기사운임: "" },
  { _id: "a3", 거래처명: "가나물산", 상차지명: "가나 평택공장", 하차지명: "다라 물류센터", 상차일: "2026-11-08", 차량번호: "경기81사2222", 이름: "김기사", 배차상태: "배차완료", 청구운임: "", 기사운임: "250000" },
  { _id: "a4", 거래처명: "가나물산", 상차지명: "가나 아산공장", 하차지명: "다라 물류센터", 상차일: "2026-11-09", 차량번호: "충남82아3333", 이름: "박기사", 배차상태: "배차완료", 청구운임: "1", 기사운임: "1" },
  { _id: "b1", 거래처명: "가나물산", 상차지명: "가나 평택공장", 하차지명: "다라 물류센터", 상차일: T, 배차상태: "배차중" },
  { _id: "b2", 거래처명: "마바상사", 상차지명: "마바 창고", 하차지명: "사아 공장", 상차일: "2026-11-14", 배차상태: "배차중" },
  { _id: "b3", 거래처명: "마바상사", 상차지명: "마바 창고", 하차지명: "사아 공장", 상차일: T, 차량번호: "경기81사2222", 이름: "김기사", 배차상태: "배차완료", 청구운임: "100000", 기사운임: "90000" },
  { _id: "c1", 거래처명: "취소건", 상차지명: "x", 하차지명: "y", 상차일: T, 상태: "취소", 배차상태: "배차중" },
];
ok("한 줄 해석 — 날짜·톤수·차량·금액·낱말", () => {
  const p = parseQuickLine("내일 가나 평택 5톤 윙바디 35만", T);
  assert.equal(p.date, "2026-11-14"); assert.equal(p.ton, "5톤"); assert.equal(p.kind, "윙바디"); assert.equal(p.fare, 350000); assert.deepEqual(p.words, ["가나", "평택"]);
  assert.equal(parseQuickLine("11/20 가나", T).date, "2026-11-20");
  assert.equal(parseQuickLine("1/5 가나", T).date, "2027-01-05");
  assert.equal(parseQuickLine("20일 가나", T).date, "2026-11-20");
  assert.equal(parseQuickLine("3일 가나", T).date, "2026-12-03");
  assert.equal(parseQuickLine("모레 2.5t", T).ton, "2.5톤");
  assert.deepEqual(parseQuickLine("5톤집 가나", T).words, ["5톤집", "가나"]);
});
ok("지난 노선 찾기 — 낱말이 모두 맞는 노선만, 많이 한 순", () => {
  const routes = buildRoutes(rows, T);
  const r = findRoutes(routes, ["가나", "평택"], T);
  assert.equal(r.length, 1); assert.equal(r[0].from, "가나 평택공장"); assert.equal(r[0].count, 4); assert.equal(r[0].last, T);
  assert.equal(findRoutes(routes, ["다라"], T).length, 2);
  assert.equal(findRoutes(routes, ["이천"], T)[0].to, "다라 물류센터"); // 주소로도
  assert.equal(findRoutes(routes, ["없는곳"], T).length, 0);
  assert.equal(findRoutes(routes, [], T).length, 0);
  assert.ok(!routes.some((x) => x.client === "취소건"));
});
ok("기사 추천 — 같은 구간 많이 뛴 순, 그날 배차된 기사는 뒤로", () => {
  const o = rows.find((r) => r._id === "b1");
  const busy = busyByDate(rows).get(T);
  const s = suggestDrivers(o, rows, { busy });
  assert.deepEqual(s.map((d) => d.이름), ["홍기사", "박기사", "김기사"]);
  assert.equal(s[0].same, 2); assert.equal(s[0].전화번호, "010-0000-0001");
  assert.equal(s[2].busy, true); assert.equal(s[1].near, 1);
  assert.equal(suggestDrivers(rows.find((r) => r._id === "b2"), rows.filter((r) => r._id !== "b3")).length, 0);
});
ok("오늘 할 일 숫자", () => {
  const t = todayTodo(rows, T);
  assert.equal(t.unassigned, 2); assert.equal(t.unassignedToday, 1); assert.equal(t.overdue, 0);
  assert.equal(t.today, 2); assert.equal(t.todayDone, 1);
  assert.equal(t.tomorrow, 1); assert.equal(t.tomorrowOpen, 1);
  assert.equal(t.noFare, 1); assert.equal(t.noDriverFare, 1);
});
console.log(`smartDispatch: ${n}건 통과`);
