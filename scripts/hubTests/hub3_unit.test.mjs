// ⭐ 2026-11-07 로지스웹 허브 3차 — 단위 테스트(에뮬레이터 필요 없음)
//  실행: node scripts/hubTests/hub3_unit.test.mjs
//  회사 키(화면 · 서버 같은 계산) · 지급예정일 · 보드 지역 키 · 배차 프로그램 오더 → 허브 칸 변환 · 지급방식 변환
import { createRequire } from "module";
import { companyKeyOf, payDateFrom, regionKeysOf, payAmountOf, stageOf, lwPayOf } from "../../cafe-site/src/hub/hubConstants.js";
import { hubOrderFromRec } from "../../src/hubShare.js";
const require = createRequire(import.meta.url);
const S = require("../../functions/hubSync.js");
const Wl = require("../../functions/hubWallet.js");

let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` :: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };

const members = [
  [{ uid: "a", source: "signup", bizNo: "134-81-01238" }, "biz:1348101238"],
  [{ uid: "b", source: "signup", bizNo: "1348101238" }, "biz:1348101238"],
  [{ uid: "c", source: "signup" }, "uid:c"],
  [{ uid: "d", source: "logisweb-staff", companyName: "한빛로지스", bizNo: "1208147521" }, "lw:한빛로지스"],
  [{ uid: "e", source: "signup", bizNo: "1", companyKey: "biz:9999" }, "biz:9999"],
];
for (const [m, k] of members) {
  eq(`회사 키(화면) ${m.uid}`, companyKeyOf(m), k);
  eq(`회사 키(서버) ${m.uid}`, S.companyKeyOf(m, m.uid), k);
}
eq("지급일 7일 뒤", payDateFrom("days:7", "2026-11-07"), "2026-11-14");
eq("지급일 다음 달 10일", payDateFrom("next:10", "2026-11-07"), "2026-12-10");
eq("지급일 다음 달 말일(2월)", payDateFrom("next:31", "2027-01-15"), "2027-02-28");
eq("지급일 확인한 날", payDateFrom("days:0", "2026-11-07"), "2026-11-07");
eq("보드 지역 키(시·군·구)", regionKeysOf("경기", "평택시"), ["경기", "경기 평택시"]);
eq("보드 지역 키(시·도만)", regionKeysOf("부산", ""), ["부산"]);
eq("회차 합의 전 지급액 = 운임", payAmountOf({ 운임: 100000, 회차: { status: "proposed", amount: 10000 } }), 100000);
eq("회차 합의 후 지급액 = 회차비", payAmountOf({ 운임: 100000, 회차: { status: "accepted", amount: 10000 } }), 10000);
eq("서버 지급액도 같은 기준", Wl.payAmount({ 운임: 100000, 회차: { status: "accepted", amount: 10000 } }), 10000);
eq("단계: 확정 = 운송중", stageOf({ status: "assigned", confirmed: true }), "moving");
eq("단계: 10초 대기", stageOf({ status: "assigned", confirmed: false }), "pending");
eq("단계: 회차", stageOf({ status: "delivered", 회차: { status: "accepted" } }), "returned");
eq("지급방식 변환(화면)", ["인수증", "선불", "착불", "예치금"].map(lwPayOf), ["계산서", "선불", "착불", "계산서"]);
eq("지급방식 변환(서버)", ["인수증", "선불", "착불", "예치금"].map(S.lwPay), ["계산서", "선불", "착불", "계산서"]);
eq("기사관리 문서 이름(배차 화면 coDocKey와 같음)", [S.coDocKey("한빛로지스", "경남80바1234"), S.coDocKey("돌캐", "경남80바1234")], ["한빛로지스__경남80바1234", "경남80바1234"]);
const h1 = hubOrderFromRec({ 상차지주소: "경기도 평택시 포승읍 평택항로 268", 하차지주소: "부산광역시 강서구 녹산산단321로 24", 지급방식: "선불", 청구운임: "620,000", 기사운임: 600000, 차량톤수: "11톤", 차량종류: "윙바디" });
eq("배차 오더 → 허브(선불): 지역 · 운임 60만 · 수수료 2만", [h1.상차시도, h1.상차시군구, h1.하차시도, h1.하차시군구, h1.지급방식, h1.운임, h1.수수료], ["경기", "평택시", "부산", "강서구", "선불", 600000, 20000]);
const h2 = hubOrderFromRec({ 상차지주소: "충청남도 천안시 서북구 성거읍 1", 하차지주소: "세종특별자치시 연서면 1", 지급방식: "계산서", 청구운임: 550000, 기사운임: 500000 });
eq("배차 오더 → 허브(계산서 → 인수증, 수수료 0, 천안시 서북구 → 천안시, 세종)", [h2.상차시군구, h2.하차시도, h2.하차시군구, h2.지급방식, h2.운임, h2.수수료], ["천안시", "세종", "세종시", "인수증", 500000, 0]);
const h3 = hubOrderFromRec({ 상차지주소: "경기 화성시 1", 하차지주소: "경기 이천시 1", 지급방식: "착불", 청구운임: 300000, 기사운임: "" });
eq("기사운임이 없으면 청구운임을 허브 운임으로", [h3.운임, h3.수수료], [300000, 0]);
const lw = S.buildLwOrder({ posterCompany: "한빛로지스", 지급방식: "착불", 운임: 300000, 수수료: 20000, 상차시도: "경기", 상차시군구: "화성시", 하차시도: "부산", 하차시군구: "강서구" }, "X", {}, "");
eq("허브 직접 등록 → 배차 오더(착불: 청구 32만 · 기사 30만 · 수수료 2만)", [lw.청구운임, lw.기사운임, lw.수수료, lw.지급방식, lw.배차상태], [320000, 300000, 20000, "착불", "배차중"]);
const lw2 = S.buildLwOrder({ posterCompany: "한빛로지스", 지급방식: "인수증", 운임: 300000, 수수료: 20000 }, "Y", {}, "");
eq("허브 직접 등록 → 배차 오더(인수증: 청구운임은 비워 둠 · 계산서)", [lw2.청구운임, lw2.기사운임, lw2.지급방식], ["", 300000, "계산서"]);

console.log(`\n허브 3차 단위 ${pass + fail}개 — 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
