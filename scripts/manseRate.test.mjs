// 만세보령 운송료 규칙 테스트 — node scripts/manseRate.test.mjs
import assert from "node:assert/strict";
import { bagsOf, tierOf, regionByAddress, learnManse, quoteManse, returnFee, isManse } from "../src/manseRateCore.js";

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n += 1; };
const ok = (c, m) => { assert.ok(c, m); n += 1; };

// 수량 · 구간
eq([bagsOf({ 차량톤수: "20톤" }), bagsOf({ 화물내용: "쌀 1,200포" }), bagsOf({ 차량톤수: "6.3톤" })], [1000, 1200, 315], "포 수: 화물내용 → 톤 × 50");
eq([tierOf("수도권", 1000).sale, tierOf("수도권", 1000, "base").sale, tierOf("수도권", 90).sale, tierOf("수도권", 300).sale], [510000, 480000, 190000, 300000], "1,000포 = 1,200포 구간 · 사이 수량은 다음 구간");
eq([tierOf("대전권", 200).sale, tierOf("경남권", 450).sale, tierOf("대전권", 900)], [230000, 450000, null], "대전권 · 경남권 · 표 밖");
eq([regionByAddress({ 하차지주소: "경기 의왕시" }), regionByAddress({ 하차지주소: "충북 음성군", 하차지명: "오뚜기 음성" }), regionByAddress({ 하차지명: "서울대" }), regionByAddress({ 하차지주소: "부산 강서구" })], ["수도권", "수도권", "수도권", "경남권"], "주소 지역");
eq([returnFee(40), returnFee(60), returnFee(120)], [0, 50000, 100000], "반품 회수");
ok(isManse({ 거래처명: "만세보령" }) && !isManse({ 거래처명: "에이제이" }), "거래처");

// 시트 기록으로 배우기 — 오뚜기 음성(주소 충북)인데 기록이 수도권 금액 · 서울대는 +90,000 · 대전유통은 대전권
const o = (to, addr, ton, sale, buy, extra = {}) => ({ 거래처명: "만세보령", 상차지명: "만세보령", 하차지명: to, 하차지주소: addr, 차량톤수: ton, 청구운임: String(sale), 기사운임: String(buy), ...extra });
const hist = [
  o("오뚜기 음성", "충북 음성군", "20톤", 510000, 480000), o("오뚜기 음성", "충북 음성군", "20톤", 510000, 480000), o("오뚜기 음성", "충북 음성군", "20톤", 518000, 488000, { 특수청구추가: 8000, 특수기사차감: -8000 }),
  o("서울대", "서울 관악구 관악로 1", "20톤", 600000, 560000), o("서울대", "서울 관악구 관악로 1", "20톤", 600000, 560000),
  o("대전유통", "대전 대덕구", "10톤", 290000, 260000), o("대전유통", "대전 대덕구", "10톤", 290000, 260000),
  o("대전유통", "대전 대덕구", "10톤", 290000, 260000, { 배차상태: "배차취소" }),
  o("이상한곳", "경기 화성시", "10톤", 333000, 300000),
];
const L = learnManse(hist);
eq([L.count, L.version], [8, "fuel"], "취소 제외 · 유류비 인상 단가가 기록과 맞음");
eq([L.places["오뚜기음성"].region, L.places["오뚜기음성"].surcharge, L.places["오뚜기음성"].matched], ["수도권", 0, 3], "오뚜기 음성 = 수도권(계근비 8,000은 특수운임이라 빼고 봄)");
eq([L.places["서울대"].region, L.places["서울대"].surcharge], ["수도권", 90000], "서울대 = 수도권 + 90,000");
eq([L.places["대전유통"].region, L.places["대전유통"].surcharge], ["대전권", 0], "대전유통 = 대전권(500포 · 260,000 + 30,000)");
eq([L.places["이상한곳"].src, L.places["이상한곳"].mismatch], ["주소", true], "표와 안 맞는 기록 = 주소로 · 불일치 표시");

const q1 = quoteManse({ 하차지명: "오뚜기 음성", 차량톤수: "20톤" }, L);
eq([q1.sale, q1.buy, q1.buySrc], [510000, 480000, "기록"], "오뚜기 1,000포 510,000 / 기사 480,000(기록)");
const q2 = quoteManse({ 하차지명: "서울대", 수량: 1000, 경유: 1 }, L);
eq([q2.sale, q2.lines.map((l) => l.key)], [510000 + 90000 + 90000, ["base", "named", "stop"]], "서울대 + 하차지 1곳(25톤 50km 미만 +90,000)");
eq(q2.buy, 690000 - 30000, "경유 기록 없으면 수도권 마진(청구 − 기사 최빈 30,000)");
const q3 = quoteManse({ 하차지명: "새로운곳", 하차지주소: "대전 유성구", 수량: 150, 경유: 2 }, L);
eq([q3.regionSrc, q3.sale], ["주소", 230000 + 120000], "기록 없는 곳 = 주소로 대전권 · 개소당 6만 × 2");
eq(quoteManse({ 하차지명: "어딘가", 하차지주소: "강원 원주시", 수량: 100 }, L), null, "지역을 모르면 넣지 않음");

console.log(`manseRate OK (${n})`);
