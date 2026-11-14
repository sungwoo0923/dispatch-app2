// 업무 매뉴얼 최신 확인 — node scripts/workManuals.test.mjs
//  정산관리 · 회계관리 · 자금관리 · 비품관리의 실제 왼쪽 메뉴(탭) 이름이 매뉴얼(src/workManuals.js)과 도움말 센터(src/helpContent.js)에 모두 있는지,
//  매뉴얼이 쓰는 예시 화면(demo)이 src/HelpDemos.jsx 에 있는지 본다. 화면에 탭을 새로 만들고 매뉴얼을 안 고치면 여기서 실패한다(CLAUDE.md)
import fs from "fs";
import { MANUALS, MANUAL_MENUS } from "../src/workManuals.js";
import { HELP_DETAIL } from "../src/helpContent.js";
import { GLOSSARY } from "../src/acctGlossary.js";
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
let fails = 0;
const ok = (c, n) => { if (c) console.log("✓", n); else { fails++; console.error("✗", n); } };
const labelsOf = (src, marker) => {
  const i = src.indexOf(marker); if (i < 0) return null;
  const line = src.slice(i, src.indexOf("\n", i) + 400);
  return [...line.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]).filter((l) => !/매뉴얼|회계용어/.test(l));
};
const app = read("src/DispatchApp.jsx");
const actual = {
  정산관리: labelsOf(app, 'code="SETTLEMENT" title="정산관리"'),
  회계관리: labelsOf(app, 'code="ACCOUNTING" title="회계관리"'),
  자금관리: labelsOf(read("src/FundsBoard.jsx"), 'code="FINANCE" title="자금관리"'),
  비품관리: ["비품·자산 관리"],
};
const demoKeys = new Set([...read("src/HelpDemos.jsx").matchAll(/^ {2}([A-Za-z]+): \{$/gm)].map((m) => m[1]));
for (const menu of MANUAL_MENUS) {
  const M = MANUALS[menu];
  ok(!!M && M.sections.length > 0, `${menu} 매뉴얼이 있다`);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(M?.updated || ""), `${menu} 매뉴얼에 최신 날짜(updated)가 있다`);
  const tabs = (actual[menu] || []).map((l) => l.replace(/\s/g, ""));
  ok(tabs.length > 0, `${menu} 실제 탭 이름을 읽었다 (${(actual[menu] || []).join(", ")})`);
  const covered = new Set(M.sections.map((s) => s.tab.replace(/\s/g, "")));
  for (const t of tabs) ok(covered.has(t), `${menu} › ${t} 가 매뉴얼에 있다`);
  for (const s of M.sections) {
    if (s.demo) ok(demoKeys.has(s.demo), `${menu} › ${s.tab} 예시 화면(${s.demo})이 있다`);
    ok(s.steps.length > 0 && s.buttons.length > 0, `${menu} › ${s.tab} 순서 · 버튼 설명이 있다`);
  }
  ok((HELP_DETAIL[menu] || []).length > 0, `${menu} 도움말 센터 설명이 있다`);
}
ok(GLOSSARY.reduce((a, g) => a + g.items.length, 0) >= 60, "회계용어 60개 이상");
const terms = GLOSSARY.flatMap((g) => g.items.map((x) => x[0]));
ok(new Set(terms).size === terms.length, "회계용어 이름이 겹치지 않는다");
if (fails) { console.error(`\n${fails}개 실패 — 화면을 바꿨다면 src/workManuals.js · src/helpContent.js 를 같이 고쳐 주세요`); process.exit(1); }
console.log("\nworkManuals: 모두 통과");
