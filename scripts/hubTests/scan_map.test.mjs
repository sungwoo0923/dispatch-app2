// ⭐ 2026-11-06 로지스웹 허브 — 오더 스캔 → 허브 칸 매핑 단위 테스트(배차 프로그램 인식기 src/orderScanParser.js 그대로 사용)
//  실행: node scripts/hubTests/scan_map.test.mjs  (에뮬레이터 필요 없음)
import { parseOrderScan } from "../../src/orderScanParser.js";
import { scanToHub, findPay, findFee } from "../../cafe-site/src/hub/hubScan.js";
import { regionFromAddress } from "../../cafe-site/src/hub/hubConstants.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` :: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };
const has = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"} ${name} ${cond ? "" : extra}`); };

// 오더 스캔 창의 [적용]과 같은 모양으로 patch 만들기(OrderScanModal.apply와 같은 칸)
function applyLike(text) {
  const r = parseOrderScan(text, { today: new Date("2026-11-06T09:00:00+09:00") });
  const v = Object.fromEntries(Object.entries(r.fields).map(([k, f]) => [k, f.value]));
  const patch = {};
  ["거래처명", "상차지명", "상차지주소", "상차지담당자", "상차지담당자번호", "상차시간", "상차일", "상차방법", "하차지명", "하차지주소", "하차지담당자", "하차지담당자번호", "하차시간", "하차일", "하차방법", "차량톤수", "차량종류", "운행유형"].forEach((k) => { if (v[k] !== undefined && v[k] !== "") patch[k] = v[k]; });
  if (v.청구운임) patch.청구운임 = String(v.청구운임).replace(/[^\d]/g, "");
  if (v.화물내용) patch.화물내용 = v.화물내용;
  if (v.혼적 === true) patch.혼적 = true;
  if (v.긴급 === true) patch.긴급 = true;
  if (v.전달사항) patch.전달사항 = v.전달사항;
  return { patch, r };
}

eq("주소→지역 경기도 화성시", regionFromAddress("경기도 화성시 향남읍 제약공단1길 7"), { sido: "경기", sigungu: "화성시" });
eq("주소→지역 부산광역시 강서구", regionFromAddress("부산광역시 강서구 녹산산단321로 24"), { sido: "부산", sigungu: "강서구" });
eq("주소→지역 충청남도 천안시 서북구", regionFromAddress("충청남도 천안시 서북구 성거읍"), { sido: "충남", sigungu: "천안시" });
eq("주소→지역 시·도 없이 김해시", regionFromAddress("김해시 주촌면 골든루트로 80"), { sido: "경남", sigungu: "김해시" });
eq("주소→지역 세종", regionFromAddress("세종특별자치시 연서면 월하리"), { sido: "세종", sigungu: "세종시" });
eq("결제방식 착불", findPay("운임 32만 착불 / 수수료 2만"), "착불");
eq("수수료 2만", findFee("운임 32만 착불 / 수수료 2만"), 20000);
eq("수수료 15,000원", findFee("수수료: 15,000원"), 15000);

const text = [
  "상차: 새벽유통 2창고 경기도 화성시 향남읍 제약공단1길 7",
  "상차담당 김상차 010-2345-6789",
  "상차시간 09:00",
  "하차: 녹산물류센터 부산광역시 강서구 녹산산단321로 24 14시까지",
  "11톤 윙바디 생활용품 14파레트",
  "운임 60만 인수증 / 수수료 2만",
].join("\n");
const { patch } = applyLike(text);
const h = scanToHub(patch, "", { text });
console.log("scan patch:", JSON.stringify(patch));
console.log("hub fields:", JSON.stringify(h));
eq("상차 시·도/시·군·구", [h.상차시도, h.상차시군구], ["경기", "화성시"]);
eq("하차 시·도/시·군·구", [h.하차시도, h.하차시군구], ["부산", "강서구"]);
has("상차 상세주소(비공개 칸)", String(h.상차지주소 || "").includes("제약공단1길"), h.상차지주소);
has("상차지명 → 비공개 장소명", !h.상차지명 || !String(h.상차지주소 || "").startsWith(h.상차지명), "");
eq("톤수 · 차종", [h.차량톤수, h.차량종류], ["11톤", "윙바디"]);
eq("파레트", h.파레트, "14");
eq("운임(청구운임)", h.운임, "600,000");
eq("결제 방식", h.지급방식, "인수증");
eq("수수료", h.수수료, "20,000");
has("상차 시간 09:00", h.상차시간 === "09:00", h.상차시간);
has("하차 시간 14:00", h.하차시간 === "14:00", h.하차시간);
has("상차 담당자 연락처", h.상차연락처 === "010-2345-6789", h.상차연락처);

// 지명만 있고 주소가 없으면 — 지명에서 지역을 찾고 메모에 "주소 확인"
const h2 = scanToHub({ 상차지명: "평택시 포승물류", 하차지주소: "대전광역시 유성구 테크노2로 10" }, "", { text: "선불" });
eq("지명만 → 지역", [h2.상차시도, h2.상차시군구], ["경기", "평택시"]);
has("지명만 → 메모 '주소 확인 필요'", String(h2.메모 || "").includes("주소 확인 필요"), h2.메모);
eq("선불", h2.지급방식, "선불");

console.log(`\n오더 스캔 매핑 ${pass + fail}개 — 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
