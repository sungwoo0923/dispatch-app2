// 홈페이지 편집기용 — index.html <body> 안의 모든 요소에 data-k="eN" 고유 번호를 붙인다.
// 이미 번호가 있는 요소는 그대로 두고, 새로 생긴 요소에만 다음 번호를 준다(저장된 편집 내용이 어긋나지 않게).
// 사용: node landing-site/tools/add-keys.mjs   (파이썬 없이 실행 — add-keys.py와 같은 동작)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const p = join(dirname(fileURLToPath(import.meta.url)), "..", "index.html");
let s = readFileSync(p, "utf8");
const b0 = s.indexOf("<body>") + "<body>".length, b1 = s.indexOf("</body>");
const body = s.slice(b0, b1);
const used = [...body.matchAll(/data-k="e(\d+)"/g)].map((m) => Number(m[1]));
let n = used.length ? Math.max(...used) : 0;
const out = []; let pos = 0, inSkip = null, svgDepth = 0, sprite = false;
const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
let m;
while ((m = re.exec(body))) {
  if (m[0].startsWith("<!--")) continue;
  const close = m[1], tag = m[2].toLowerCase(), attrs = m[3];
  const attrStart = m.index + 1 + close.length + m[2].length;
  if (inSkip) { if (close && tag === inSkip) inSkip = null; continue; }
  if ((tag === "script" || tag === "style") && !close) { inSkip = tag; continue; }
  if (tag === "svg") {
    if (close) { svgDepth -= 1; if (svgDepth === 0) sprite = false; continue; }
    if (svgDepth === 0 && attrs.includes('aria-hidden="true"') && attrs.includes('width="0"')) sprite = true;
    svgDepth += 1;
    if (!sprite && svgDepth === 1 && !attrs.includes("data-k=")) { n += 1; out.push(body.slice(pos, attrStart) + ` data-k="e${n}"`); pos = attrStart; }
    continue;
  }
  if (close || svgDepth > 0 || attrs.includes("data-k=")) continue;
  n += 1; out.push(body.slice(pos, attrStart) + ` data-k="e${n}"`); pos = attrStart;
}
out.push(body.slice(pos));
s = s.slice(0, b0) + out.join("") + s.slice(b1);
writeFileSync(p, s, "utf8");
console.log("keys up to", n);
