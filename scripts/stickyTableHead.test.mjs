// 📌 2026-11-17 표 머리줄 고정 — 브라우저 없이 확인하는 간단 검사: node scripts/stickyTableHead.test.mjs
//  (실제로 붙는지는 브라우저에서 확인 — 이 검사는 규칙 · 연결이 빠지지 않았는지만 본다)
import fs from "fs";
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) fail += 1; };

const css = read("src/index.css");
ok(/\[data-kp-st-wrap\]\s*\{[^}]*max-height:\s*var\(--kp-st-h/.test(css), "표 상자 높이 제한 규칙(data-kp-st-wrap)");
ok(/table\[data-kp-st\]\s*>\s*thead\s*\{[^}]*position:\s*sticky/.test(css), "머리줄 고정 규칙(table[data-kp-st] > thead)");
ok(/@media print\s*\{[^}]*\[data-kp-st-wrap\][^}]*max-height:\s*none/.test(css), "인쇄할 땐 높이 제한을 끈다");
ok(/\.kp-st-off \[data-kp-st-wrap\]/.test(css) && /\.kp-st-off table\[data-kp-st\] > thead/.test(css), "캡처할 땐(.kp-st-off) 고정을 끈다");

const js = read("src/stickyTableHead.js");
ok(/#invoiceArea/.test(js.match(/const SKIP = "([^"]*)"/)?.[1] || ""), "거래명세서 문서(#invoiceArea)는 빼고");
ok(/\[role=dialog\]/.test(js.match(/const SKIP = "([^"]*)"/)?.[1] || ""), "팝업(role=dialog) 안 표는 빼고");
ok(/export function installStickyTableHeads/.test(js) && /export async function withStickyOff/.test(js), "설치 · 캡처용 함수");

ok(/installStickyTableHeads\(\);/.test(read("src/main.jsx")), "main.jsx 에서 한 번 설치");
ok(/withStickyOff\(/.test(read("src/lazyLoad.jsx")), "html2canvas(lazyLoad) 캡처 때 고정 끔");
ok(/withStickyOff\(/.test(read("src/a4Export.js")), "A4 문서 캡처(a4Export) 때 고정 끔");

const help = read("src/helpContent.js");
ok(/칸 이름 줄 고정/.test(help), "도움말 센터 › 표(목록) 다루기 에 설명");

if (fail) { console.log(`\nstickyTableHead: ${fail}개 실패`); process.exit(1); }
console.log("\nstickyTableHead: 모두 통과");
