// 청구 현황판 계산 — node scripts/billingBoard.test.mjs
import { billingBoard } from "../src/settleCore.js";
let fails = 0;
const ok = (c, m) => { if (c) console.log("✓", m); else { fails++; console.error("✗", m); } };
const orders = [
  { _id: "1", 거래처명: "녹수", 상차일: "2026-11-03", 청구운임: 100000, 기사운임: 80000 },
  { _id: "2", 거래처명: "녹수", 상차일: "2026-11-05", 청구운임: 50000, 기사운임: 40000, 지급상태: "지급완료" },
  { _id: "3", 거래처명: "한빛", 상차일: "2026-11-07", 청구운임: 200000, 입금상태: "입금완료" },
  { _id: "4", 거래처명: "콜업체", 상차일: "2026-11-08", 청구운임: 70000, 콜구분: "OUT", 계산서일: "2026-11-09" },
  { _id: "5", 거래처명: "콜업체", 상차일: "2026-11-09", 청구운임: 30000, 콜구분: "OUT" },
  { _id: "6", 거래처명: "콜업체", 상차일: "2026-11-10", 청구운임: 40000, 콜구분: "잡은콜", 입금상태: "입금완료" },
  { _id: "7", 거래처명: "대한", 상차일: "2026-10-28", 청구운임: 90000 },
  { _id: "8", 거래처명: "녹수", 상차일: "2026-11-11", 청구운임: 999999, 배차상태: "배차취소" },
];
const stageOf = (c, ym) => (c === "녹수" && ym === "2026-11" ? "계산서발행" : c === "대한" ? "마감" : "미작성");
const B = billingBoard(orders, { from: "2026-11", to: "2026-11", stageOf });
const by = (k) => B.items.find((x) => x.key === k);
ok(by("c:녹수|2026-11")?.status === "billed" && by("c:녹수|2026-11").amount === 150000, "화주사 계산서발행 → 청구완료 · 취소 오더 제외");
ok(by("c:한빛|2026-11")?.status === "paid", "화주사 다 입금 → 입금완료");
ok(by("o:4")?.status === "billed" && by("o:5")?.status === "unbilled" && by("o:6")?.status === "paid", "개별오더(OUT · 잡은콜) 단계");
ok(!by("c:대한|2026-10"), "기간 밖 제외");
ok(B.totals.unbilled.amount === 30000 && B.totals.billed.amount === 220000 && B.totals.paid.amount === 240000, "합계");
ok(B.totals.billed.vat === 242000, "부가세 포함 합계");
const B2 = billingBoard(orders, { from: "2026-10", to: "2026-11", stageOf });
ok(by.call(null, "x") === undefined && B2.items.find((x) => x.key === "c:대한|2026-10")?.status === "paid", "마감 단계 → 입금완료");
const A = billingBoard(orders, { from: "2026-11", to: "2026-11", mode: "ap" });
ok(A.totals.paid.amount === 40000 && A.totals.unbilled.amount === 80000, "줄 돈 — 지급완료 · 계산서 전");
if (fails) { console.error(`billingBoard: ${fails}개 실패`); process.exit(1); } else console.log("billingBoard: 모두 통과");
