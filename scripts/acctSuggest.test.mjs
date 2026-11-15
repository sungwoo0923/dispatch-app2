// 계정과목 자동 추천 · 증빙 · 부가세 나누기 — node scripts/acctSuggest.test.mjs
import { suggestAccount, historyAccount, evidenceOf, vatSplit } from "../src/acctSuggest.js";
let pass = 0, fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : ` :: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };
const s = (v, i = "", rows = []) => suggestAccount({ type: "지출", vendor: v, item: i }, rows)?.account || null;
eq("주유소 → 유류비", s("GS칼텍스 평택주유소"), "유류비");
eq("하이패스 → 여비교통비", s("한국도로공사"), "여비교통비");
eq("타이어 → 차량유지비", s("○○타이어"), "차량유지비");
eq("다이소 → 소모품비", s("다이소 평택점"), "소모품비");
eq("커피 → 복리후생비", s("스타벅스"), "복리후생비");
eq("내용으로도", s("○○상사", "복합기 토너"), "소모품비");
eq("모르면 추천 안 함", s("○○상사"), null);
const rows = [
  { type: "지출", vendor: "○○상사", account: "수선비", date: "2026-10-01" },
  { type: "지출", vendor: "(주)○○상사", account: "수선비", date: "2026-10-05" },
  { type: "지출", vendor: "스타벅스", account: "접대비", date: "2026-11-01" },
];
eq("예전 기록 따라가기", s("○○상사", "", rows), "수선비");
eq("사람이 바꾼 값이 규칙보다 먼저", s("스타벅스", "", rows), "접대비");
eq("이름 표기 달라도(주식회사 · 띄어쓰기)", historyAccount(rows, "○○ 상사")?.account, "수선비");
eq("수입 — 운임", suggestAccount({ type: "수입", vendor: "한빛물류", item: "11월 운임" })?.account, "운송수입");
eq("증빙 — 카드", evidenceOf({ cardApproval: "12345678", amount: 1000 }), "카드전표");
eq("증빙 — 현금영수증", evidenceOf({ text: "현금영수증 (지출증빙)", amount: 1000 }), "현금영수증");
eq("부가세 나누기", vatSplit(110000), { supply: 100000, vat: 10000, total: 110000 });
eq("면세", vatSplit(50000, true), { supply: 50000, vat: 0, total: 50000 });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
