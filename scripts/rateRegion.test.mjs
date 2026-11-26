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
// 📏 단가표에 없는 톤수 → 바로 위 톤수(롯데 10월 이후 172건 규칙)
r = q("화승 네트웍스", "경남 양산시 1", "6톤");
ok(r && r.sale === 306000 && r.tonUp && r.ton === "8톤", `6톤 → 8톤 단가 ${r?.sale} ${r?.ton}`);
r = q("화승 네트웍스", "경남 양산시 1", "23톤");
ok(r && r.sale === 456000 && r.ton === "25톤", `23톤 → 25톤 ${r?.sale}`);
r = q("화승 네트웍스", "경남 양산시 1", "5톤");
ok(r && r.sale === 280000 && !r.tonUp, "단가표에 있는 톤수는 그대로");
r = q("화승 네트웍스", "경남 양산시 1", "30톤");
ok(!r, "가장 큰 톤수보다 크면 넣지 않음");
// 🛠 같은 거래처에 상하차지명 단가표(기존)와 지역 단가표(새로 올림)가 같이 있을 때 — 구체적인 줄이 먼저
const named = { baseName: "롯데베르살리스", columns: [{ id: "a", label: "5톤" }], rows: [{ name: "화승 네트웍스(유산공단)", prices: { a: "300000" } }] };
r = findRate([lotte, named], { 거래처명: "롯데베르살리스", 하차지명: "화승 네트웍스(유산공단)", 하차지주소: "경남 양산시 1", 톤수: "5톤" }, { aliases: true });
ok(r && r.sale === 300000, `상하차지명 줄이 지역 줄보다 먼저 ${r?.sale}`);
r = findRate([lotte, named], { 거래처명: "롯데베르살리스", 하차지명: "다른 업체", 하차지주소: "경남 양산시 1", 톤수: "5톤" }, { aliases: true });
ok(r && r.sale === 280000, `이름 줄이 없으면 지역 줄 ${r?.sale}`);
const aj = { baseName: "에이제이 지역", columns: [{ id: "a", label: "5톤" }, { id: "b", label: "9.5톤" }], rows: [{ name: "평택", prices: { a: "134000", b: "150000" } }] };
const ajNamed = { baseName: "에이제이", columns: [{ id: "a", label: "5톤" }], rows: [{ name: "베베숲 평택", prices: { a: "200000" } }] };
r = findRate([aj, ajNamed], { 거래처명: "에이제이", 하차지명: "베베숲 평택", 하차지주소: "경기 평택시 1", 톤수: "5톤" }, { aliases: true });
ok(r && r.sale === 200000, `에이제이: 기존 상하차지명 단가 먼저 ${r?.sale}`);
r = findRate([aj, ajNamed], { 거래처명: "에이제이", 하차지명: "새 업체", 하차지주소: "경기 평택시 1", 톤수: "8톤" }, { aliases: true });
ok(r && r.sale === 150000, `에이제이: 처음 보는 곳은 '에이제이 지역' 단가표(8톤 → 9.5톤) ${r?.sale}`);
// 🧾 2026-11-26 사용자 예시 — 에이제이 → 계약 하차지(제이글로벌 단가표의 "쿠팡 벤더" 11톤 90,000)는 그 금액,
//  계약표에 없는 곳이 주소로 아산이면 지역 단가표(아산 11톤 150,000)
{
  const region = { baseName: "에이제이 지역", columns: [{ id: "a", label: "5톤" }, { id: "b", label: "11톤" }], rows: [{ name: "아산", prices: { a: "120000", b: "150000" } }] };
  const contract = { baseName: "제이글로벌", columns: [{ id: "a", label: "5톤" }, { id: "b", label: "11톤" }], rows: [{ name: "쿠팡 벤더", prices: { a: "90000", b: "90000" } }] };
  const qq = (drop, addr, ton) => findRate([region, contract], { 거래처명: "에이제이", 상차지명: "에이제이", 하차지명: drop, 하차지주소: addr, 톤수: ton }, { aliases: true });
  let x = qq("쿠팡 벤더", "충남 아산시 둔포면 1", "11톤");
  ok(x && x.sale === 90000, `계약 하차지(쿠팡 벤더 · 주소 아산) → 계약 단가 90,000 ${x?.sale}`);
  x = qq("벤더", "충남 아산시 둔포면 1", "11톤");
  ok(x && x.sale === 90000, `하차지명을 "벤더"로만 적어도 계약 단가 ${x?.sale}`);
  x = qq("처음 보는 창고", "충남 아산시 음봉면 1", "11톤");
  ok(x && x.sale === 150000, `계약표에 없는 곳 · 주소 아산 → 지역 단가 150,000 ${x?.sale}`);
  x = qq("처음 보는 창고", "충남 아산시 음봉면 1", "8톤");
  ok(x && x.sale === 150000, `계약표에 없는 곳 8톤 → 지역 11톤 단가 ${x?.sale}`);
}
{ // 괄호 지역 이름
  const sh = { baseName: "에이제이 지역", columns: [{ id: "a", label: "5톤" }], rows: [{ name: "시화(안산)", prices: { a: "190000" } }, { name: "하양(경산)", prices: { a: "350000" } }] };
  const f = (addr) => findRate([sh], { 거래처명: "에이제이", 하차지명: "모르는 창고", 하차지주소: addr, 톤수: "5톤장축" }, { aliases: true });
  ok(f("경기 안산시 단원구 1")?.sale === 190000, "시화(안산) — 주소 안산 · 5톤장축 = 5톤");
  ok(f("경북 경산시 하양읍 1")?.sale === 350000, "하양(경산) — 주소 경산");
}
if (fail) { console.error(`rateRegion: ${fail}건 실패`); process.exit(1); }
console.log("rateRegion: 모두 통과");
