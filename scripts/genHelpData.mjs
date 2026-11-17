// AI 비서 서버용 도움말 사본 만들기 — node scripts/genHelpData.mjs
//  src/helpContent.js(도움말 센터) → functions/helpData.json. 서버(functions)는 src 를 못 읽어서 사본을 둔다.
//  도움말을 고치면 이걸 다시 돌린다(scripts/helpSearch.test.mjs 가 사본이 같은지 검사)
import fs from "fs";
import { HELP_DETAIL, HELP_COMMON } from "../src/helpContent.js";
const pick = (list) => list.map((s) => ({ title: s.title, intro: s.intro || "", items: s.items }));
const data = { common: pick(HELP_COMMON), menus: Object.fromEntries(Object.entries(HELP_DETAIL).map(([k, v]) => [k, pick(v)])) };
const out = JSON.stringify(data);
const file = new URL("../functions/helpData.json", import.meta.url);
if (process.argv.includes("--check")) { const cur = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""; process.exit(cur === out ? 0 : 1); }
fs.writeFileSync(file, out);
console.log(`functions/helpData.json — ${Object.keys(data.menus).length}개 메뉴, ${(out.length / 1024).toFixed(0)}KB`);
