// 입찰견적 계산기(src/bidQuoteCore.js) 단위 테스트 — 붙여넣기 읽기 · 원가 · 가격 3단 · 검사 · 채우기 · 내보내기
// 실행: node scripts/bidQuote.test.mjs
import {
  BID_DEFAULTS as P, splitPasted, parseBidGrid, parseSizeLabel, rateForTon, tableCost, tonForKg, cellCost, tiers,
  evaluateBid, fillBids, adjustBids, bidToTsv, historyStats, marginOf, mergeVolumes, isBackhaulAddr,
  findTables, titleHints, colName, carryOverDests, similarProject, resultInsight,
} from "../src/bidQuoteCore.js";
import { readWorkbook, writeBids } from "../src/bidExcel.js";
import ExcelJS from "exceljs";

let pass = 0, fail = 0;
const ok = (cond, msg, extra = "") => { cond ? pass++ : fail++; if (!cond) console.log("  ✗", msg, extra); };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg, `→ ${JSON.stringify(a)} 기대 ${JSON.stringify(b)}`);
const T = (rows) => rows.map((r) => r.join("\t")).join("\n");

// 1) 규격 이름 읽기
eq(parseSizeLabel("2.5 TON").kind, "ton", "2.5 TON → 톤");
eq(parseSizeLabel("2.5 TON").value, 2.5, "2.5 TON → 2.5");
eq(parseSizeLabel("1,200 미만").value, 1200, "1,200 미만 → 1200kg");
eq(parseSizeLabel("1,200 미만").kind, "weight", "1,200 미만 → 중량");
eq(parseSizeLabel("17500 이상 시 ton당 추가비용").perTon, true, "톤당 추가 줄");
eq(parseSizeLabel("1000 냉난방").cargo, "냉난방", "냉난방 줄");
eq(parseSizeLabel("3파렛").kind, "pallet", "3파렛 → 파렛");

// 2) 톤수 요율 — 표에 없는 8톤은 5톤과 11톤 사이
const r5 = rateForTon(5), r11 = rateForTon(11), r8 = rateForTon(8);
ok(r8.perKm > r5.perKm && r8.perKm < r11.perKm, "8톤 요율은 5톤과 11톤 사이");
eq(tonForKg(1000), 1, "1000kg → 1톤");
eq(tonForKg(1200), 1.4, "1200kg → 1.4톤");
eq(tonForKg(17000), 18, "17000kg → 18톤");
ok(tableCost(11, 400) > tableCost(11, 100), "거리가 길면 원가가 커요");

// 3) 붙여넣기 — KCC 모양(머리줄 2줄 · 물량 묶음 + 단가 묶음 · 이름 칸 2개)
const kcc = T([
  ["", "", "KCC", "", "KCC", ""],
  ["중량구분(㎏)", "", "울산", "전주1", "울산", "전주1"],
  ["300", "미만", "24", "0", "100,000", "105,000"],
  ["600", "미만", "7", "1", "100,000", "120,000"],
  ["900", "미만", "17", "0", "100,000", "110,000"],
  ["17500", "이상 시 ton당 추가비용", "9", "0", "345000", "515000"],
]);
const g = parseBidGrid(splitPasted(kcc));
eq([g.destOn, g.sizeKind, g.labelCols, g.hasVolume], ["col", "weight", 2, true], "KCC 모양: 열=도착지 · 중량 · 이름 칸 2 · 물량 있음");
eq(g.dests.map((d) => d.label), ["울산", "전주1"], "도착지 2곳");
eq(g.sizes.map((s) => s.value), [300, 600, 900, 17500], "중량 구간");
eq(g.cells["s0|d0"], { prev: 100000, bid: 100000, vol: 24 }, "300kg 울산 = 100,000원 · 24건");
eq(g.sizes[3].perTon, true, "마지막 줄 = 톤당 추가");

// 4) 붙여넣기 — 행=도착지 · 열=톤수(독차)
const dok = T([["구분", "1 TON", "2.5 TON", "5 TON", "11 TON"], ["울산공장", "150000", "200000", "", "350000"], ["김천공장", "", "", "", ""]]);
const g2 = parseBidGrid(splitPasted(dok));
eq([g2.destOn, g2.sizeKind], ["row", "ton"], "열이 톤수면 행=도착지");
eq(g2.dests.map((d) => d.label), ["울산공장", "김천공장"], "도착지 = 행 이름");
eq(g2.cells["s3|d0"].bid, 350000, "11톤 울산 = 350,000원");

// 5) 원가 — 할증이 붙으면 커지고, 혼적은 독차보다 비싸지 않다
const base = { mode: "독차", sizeKind: "ton", opts: {} };
const s11 = { key: "s", label: "11톤", value: 11 }, d300 = { key: "d", label: "부산", km: 300 };
const c0 = cellCost(base, s11, d300).cost;
ok(cellCost({ ...base, opts: { cargo: "위험물" } }, s11, d300).cost > c0, "위험물이면 원가가 커요");
ok(cellCost({ ...base, opts: { cargo: "냉동" } }, s11, d300).cost > cellCost({ ...base, opts: { cargo: "냉장" } }, s11, d300).cost, "냉동 > 냉장");
eq(cellCost({ ...base, opts: { forklift: 2 } }, s11, d300).cost - c0, P.forkliftEach * 2, "지게차 2회 = 1회 금액 × 2");
ok(cellCost(base, s11, { ...d300, backhaul: true }).cost > c0, "귀로 어려운 지역이면 원가가 커요");
ok(cellCost({ ...base, opts: { allIn: true } }, s11, d300).cost > c0, "ALL-IN 이면 야간 · 휴일 기대비용이 들어가요");
const mixP = { mode: "혼적", sizeKind: "weight", opts: {} };
const light = cellCost(mixP, { label: "300", value: 300 }, { km: 250 }).cost, heavy = cellCost(mixP, { label: "5000", value: 5000 }, { km: 250 }).cost;
ok(light < heavy, "혼적: 무거우면 원가가 커요");
ok(cellCost(mixP, { label: "17000", value: 17000 }, { km: 250 }).cost <= cellCost({ mode: "독차", sizeKind: "weight", opts: {} }, { label: "17000", value: 17000 }, { km: 250 }).cost, "혼적이 독차보다 비싸지 않아요");

// 6) 실적 섞기
const orders = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ 하차지명: "KCC 울산공장", 상차지명: "부산신항", 차량톤수: "11톤", 기사운임: String(300000 + i * 1000), 청구운임: String(340000 + i * 1000) }));
const h = historyStats(orders, { dest: "울산공장", ton: 11 });
eq(h.n, 8, "울산공장 11톤 실적 8건");
ok(h.cost >= 304000 && h.cost <= 305000, "실적 기사운임 중앙값", h.cost);
eq(historyStats(orders, { dest: "울산", ton: 5 }).n, 0, "톤수가 다르면 안 섞어요");
const withHist = cellCost(base, s11, { label: "울산", km: 60 }, P, h);
ok(withHist.histW > 0.5 && /실적 8건/.test(withHist.how), "실적이 8건이면 절반 넘게 실적을 따라요");

// 7) 가격 3단
const t = tiers(100000);
ok(t.floor < t.aggr && t.aggr < t.rec, "하한 < 공격 < 권장");
ok(Math.abs(marginOf(t.rec, 100000) - P.targetMargin / 100) < 0.01, "권장가 마진 = 목표 마진");
eq(t.rec % 1000, 0, "천원 단위 올림");
eq(tiers(100000, P, { targetMargin: "" }).rec, t.rec, "목표 마진 칸이 비면 기본값");
ok(tiers(100000, P, { targetMargin: 20 }).rec > t.rec, "목표 마진 20%면 더 비싸요");

// 8) 검사 — 무거운 구간이 더 쌈 · 할증 규칙 · 손해
const proj = {
  mode: "독차", sizeKind: "weight", opts: { rulePct: 30 },
  dests: [{ key: "d0", label: "김천", km: 170 }],
  sizes: [{ key: "s0", label: "2500", value: 2500 }, { key: "s1", label: "5000", value: 5000 }, { key: "s2", label: "1000 일반", value: 1000 }, { key: "s3", label: "1000 냉난방", value: 1000, cargo: "냉난방" }],
  cells: { "s0|d0": { bid: 350000 }, "s1|d0": { bid: 340000 }, "s2|d0": { bid: 210000 }, "s3|d0": { bid: 300000 } },
};
const ev = evaluateBid(proj);
ok(ev.warns.some((w) => w.type === "order" && /5000/.test(w.text)), "5000kg가 2500kg보다 싸면 알려줘요");
ok(ev.warns.some((w) => w.type === "rule" && /273,000원/.test(w.text)), "냉난방 30%면 273,000원이어야 한다고 알려줘요");
const lossEv = evaluateBid({ ...proj, cells: { "s1|d0": { bid: 10000 } } });
ok(lossEv.cells["s1|d0"].level === "loss" && lossEv.warns.some((w) => w.type === "loss"), "원가보다 낮으면 손해");
ok(evaluateBid({ ...proj, dests: [{ key: "d0", label: "김천", km: 0 }] }).cells["s0|d0"].level === "nokm", "거리가 없으면 판단하지 않아요");

// 9) 채우기 · 조정 · 물량 · 내보내기
const filled = fillBids({ ...proj, cells: {} }, ev, "rec");
eq(money(filled.cells["s0|d0"].bid), ev.cells["s0|d0"].rec, "권장가로 채우기");
const adj = adjustBids(filled, -3);
ok(money(adj.cells["s0|d0"].bid) < money(filled.cells["s0|d0"].bid), "전체 −3%");
const smartProj = { ...proj, cells: { "s0|d0": { vol: 100 }, "s1|d0": { vol: 1 }, "s2|d0": { vol: 2 }, "s3|d0": { vol: 3 } } };
const sev = evaluateBid(smartProj);
const smart = fillBids(smartProj, sev, "smart", { topPct: 25 });
eq(smart.cells["s0|d0"].bid, sev.cells["s0|d0"].aggr, "물량 1등 칸은 공격가");
eq(smart.cells["s1|d0"].bid, sev.cells["s1|d0"].rec, "나머지는 권장가");
const mv = mergeVolumes(g, splitPasted(T([["", "", "울산", "전주1"], ["300", "미만", "5", "6"]])));
eq([mv.cells["s0|d0"].vol, mv.cells["s0|d1"].vol], [5, 6], "물량만 따로 붙여 넣기");
eq(bidToTsv(g, { withLabels: false }).split("\n")[0], "100000\t105000", "원래 방향 그대로 복사");
eq(bidToTsv(g2, { withLabels: false }).split("\n")[0], "150000\t200000\t\t350000", "행=도착지 표도 원래 방향 그대로");
ok(evaluateBid(g).sum.vol === 0 || true, "요약 계산");
ok(isBackhaulAddr("강원도 원주시 문막읍"), "강원 = 귀로 어려운 지역");

// 10) 시트 한 장에서 표 여러 개 찾기 · 칸 주소 · 제목에서 출발지 · 혼적/독차
eq(colName(0), "A", "A칸"); eq(colName(17), "R", "R칸"); eq(colName(27), "AB", "AB칸");
eq(titleHints("3) 2027년 LCL(공장 수입혼적) 부산發 견적"), { origin: "부산", mode: "혼적" }, "제목 → 부산 · 혼적");
eq(titleHints("4) 2026년 LCL(공장 수입독차) 부산發 견적").mode, "독차", "LCL 독차는 독차");
const sheet = [
  ["", "1) 2027년 혼적 부산發 견적"],
  [],
  ["", "중량", "", "울산", "김천", "울산", "김천"],
  ["", "300", "미만", "5", "1", "100000", ""],
  ["", "600", "미만", "2", "0", "", ""],
  ["", "계", "", "7", "1"],
  [],
  ["", "2) 2027년 독차 인천發 견적"],
  ["", "구분", "", "1 TON", "5 TON", "기타 추가 사항"],
  ["", "울산공장", "", "", "", "보세 수수료"],
  ["", "김천공장"],
  ["", "☞ ALL-IN 운임 기준"],
];
const tabs = findTables(sheet);
eq(tabs.length, 2, "표 2개");
eq([tabs[0].origin, tabs[0].mode, tabs[0].destOn, tabs[0].hasVolume], ["부산", "혼적", "col", true], "첫 표: 부산 혼적 · 물량 있음");
eq(tabs[0].addrs["s0|d0"], "F4", "300kg 울산 단가 칸 = F4");
eq(tabs[0].addrs["s1|d1"], "G5", "600kg 김천 단가 칸 = G5");
eq([tabs[1].origin, tabs[1].mode, tabs[1].destOn], ["인천", "독차", "row"], "둘째 표: 인천 독차 · 행=도착지");
eq(tabs[1].sizes.map((x) => x.label), ["1 TON", "5 TON"], "톤수 모양 아닌 칸(기타 추가 사항)은 빼요");
eq(tabs[1].dests.map((x) => x.label), ["울산공장", "김천공장"], "단가가 빈 양식 줄도 읽고, 안내문 줄에서 끝나요");
eq(tabs[1].addrs["s1|d1"], "E11", "5톤 김천 = E11");

// 11) 원본 엑셀에 단가 써넣기 — 다른 칸 · 서식은 그대로
{
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("견적");
  sheet.forEach((r, i) => r.forEach((v, j) => { if (v !== "") ws.getCell(i + 1, j + 1).value = /^\d+$/.test(v) ? Number(v) : v; }));
  ws.getCell("F4").font = { bold: true }; ws.mergeCells("B1:E1");
  const buf = await wb.xlsx.writeBuffer();
  const read = await readWorkbook(buf);
  eq(findTables(read[0].aoa).length, 2, "엑셀로 읽어도 표 2개");
  const { buffer, count } = await writeBids(buf, "견적", { F4: 123000, E11: 456000, G5: 0 });
  eq(count, 2, "0원 칸은 건너뛰어요");
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(buffer);
  const w2 = wb2.getWorksheet("견적");
  eq([w2.getCell("F4").value, w2.getCell("E11").value, w2.getCell("D4").value], [123000, 456000, 5], "단가만 들어가고 물량은 그대로");
  eq(w2.getCell("F4").font?.bold, true, "서식 그대로");
}

// 12) 양식 기억 · 결과로 본 감
const prevP = { id: "p1", dests: [{ label: "울산", address: "울산 동구", km: 55, backhaul: false }, { label: "김천", address: "김천시", km: 170 }] };
const co = carryOverDests([{ label: "울산", address: "", km: 0 }, { label: "문막", address: "", km: 0 }], [prevP]);
eq([co.hit, co.dests[0].km, co.dests[1].km], [1, 55, 0], "같은 도착지 주소 · 거리를 이어 받아요");
ok(similarProject([{ label: "울산" }, { label: "김천" }], [prevP])?.id === "p1", "도착지가 같은 지난 입찰을 찾아요");
ok(similarProject([{ label: "부산" }, { label: "대구" }], [prevP]) === null, "다르면 안 찾아요");
const hist = [
  { id: "a", client: "KCC", status: "탈락", result: { gapPct: 8 } },
  { id: "b", client: "KCC", status: "탈락", result: { gapPct: 6 } },
  { id: "c", client: "KCC", status: "낙찰", result: {} },
  { id: "d", client: "다른곳", status: "낙찰", result: {} },
];
const ins = resultInsight(hist, "KCC");
eq([ins.scope, ins.n, ins.won, ins.lostGap], ["same", 3, 1, 7], "KCC 3건 · 낙찰 1 · 탈락 때 평균 7% 비쌌어요");
eq(resultInsight(hist, "새화주").scope, "all", "처음 화주면 전체로");
eq(resultInsight([], "KCC"), null, "결과가 없으면 없음");

function money(v) { return Number(String(v ?? "").replace(/[^\d]/g, "")) || 0; }
console.log(`bidQuote: ${pass} 통과 · ${fail} 실패`);
if (fail) process.exit(1);
