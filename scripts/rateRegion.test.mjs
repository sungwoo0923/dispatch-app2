// 🗺 2026-11-26 지역 단가표(롯데베르살리스처럼 줄 이름이 지역) — node scripts/rateRegion.test.mjs
//  ① 엑셀 읽기: "1 TON" 머리줄 · 앞의 상차지 칸 · 한글/영문 지역 두 칸 · 제목 줄("26년 3분기 제출가")
//  ② 오더: 하차지명이 업체명이어도 하차지 주소의 시군구로 줄을 찾는다 · 기준지가 안 맞는 단가표는 쓰지 않는다
import { parseRateMatrix } from "../src/rateSheetImport.js";
import { findRate, regionTokens } from "../src/fareQuoteCore.js";
let fail = 0; const ok = (c, m) => { if (c) console.log(`✓ ${m}`); else { fail += 1; console.error(`✕ ${m}`); } };

const T = ["1 TON", "2.5 TON", "5 TON", "8 TON", "11 TON", "25 TON"];
const mx = parseRateMatrix([
  ["구분", "", "", "26년 3분기 제출가"],
  ["상차지", "하차지", "", ...T],
  ["", "경산", "Gyeongsan", "", 160000, 280000, 310000, 350000, 460000],
  ["여수", "양산", "Yangsan", 140000, 160000, 280000, 306000, 346000, 456000],
  ["", "충남", "Chungnam", 170000, 190000, 310000, 336000, 386000, 516000],
  ["", "대구", "daegu", 140000, 160000, 270000, 300000, 346000, 456000],
]);
ok(mx && mx.labels.join(",") === "1톤,2.5톤,5톤,8톤,11톤,25톤", `톤수 이름 ${mx?.labels.join(",")}`);
ok(mx.rows.map((r) => r.name).join(",") === "경산,양산,충남,대구", "하차지 = 한글 지역 이름");
ok(mx.baseHint === "", "제목 줄은 기준지 이름으로 안 씀");
ok(mx.rows[1].prices["5톤"] === 280000 && mx.rows[0].prices["1톤"] === undefined, "금액 · 빈 칸");

// 화면이 저장하는 모양(columns · rows.prices[colId])으로
const toSheet = (baseName, m) => { const columns = m.labels.map((l, i) => ({ id: `c${i}`, label: l })); return { baseName, columns, rows: m.rows.map((r) => ({ name: r.name, address: "", prices: Object.fromEntries(Object.entries(r.prices).map(([l, n]) => [columns.find((c) => c.label === l).id, String(n)])) })) }; };
const lotte = toSheet("롯데베르살리스", mx);
const other = { baseName: "다른거래처", columns: [{ id: "x", label: "5톤" }], rows: [{ name: "양산", prices: { x: "999000" } }] };

ok(regionTokens("경남 양산시 유산공단 2길 11").slice(0, 2).join(",") === "경남,양산", `주소 → 지역 ${regionTokens("경남 양산시 유산공단 2길 11")}`);
ok(regionTokens("대구 달서구 월암동").slice(0, 2).join(",") === "대구,달서", "대구는 자르지 않음 · 달서구 → 달서");
ok(regionTokens("충청남도 아산시 둔포면").slice(0, 2).join(",") === "충남,아산", "긴 도 이름 → 줄임");
const q = (drop, addr, ton = "5톤", client = "롯데베르살리스") => findRate([lotte, other], { 거래처명: client, 상차지명: "여수공장", 하차지명: drop, 하차지주소: addr, 톤수: ton }, { aliases: true });
let r = q("화승 네트웍스(유산공단)", "경남 양산시 유산공단 2길 11");
ok(r && r.sale === 280000 && r.rowName === "양산", `업체명 + 주소 양산 → 양산 5톤 ${r?.sale}`);
r = q("SY 동아", "대구 달서구 월암동 1073");
ok(r && r.sale === 270000, `대구 주소 → 대구 ${r?.sale}`);
r = q("세화", "충남 아산시 둔포면 11", "11톤");
ok(r && r.sale === 386000 && r.rowName === "충남", `충남 아산(아산 줄 없음) → 충남 11톤 ${r?.sale}`);
r = q("아무개", "전남 순천시 1", "5톤");
ok(!r, "단가표에 없는 지역 → 넣지 않음");
r = q("화승 네트웍스", "경남 양산시 1", "5톤", "모르는거래처");
ok(!r || r.sale !== 280000, "기준지가 다르면 롯데 지역 단가를 쓰지 않음");
r = q("양산", "", "5톤");
ok(r && r.sale === 280000, "하차지명이 지역이면 예전처럼 이름으로");
if (fail) { console.error(`rateRegion: ${fail}건 실패`); process.exit(1); }
console.log("rateRegion: 모두 통과");
