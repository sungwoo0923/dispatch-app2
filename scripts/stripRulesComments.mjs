// scripts/stripRulesComments.mjs — 배포할 때만 보안 규칙의 주석 · 빈 줄을 빼서 올린다(🛠 2026-11-24)
//  규칙 파일이 구글 한도(256KB)에 가까워졌고(주석이 1/3), 큰 파일일수록 구글 규칙 서버가 503 을 자주 냈다.
//  저장소의 원본(주석 포함)은 그대로 두고, GitHub 배포 작업 안의 복사본만 바꾼다.
//  사용: node scripts/stripRulesComments.mjs firestore.rules [storage.rules]   (그 자리에서 바꾼다)
//        node scripts/stripRulesComments.mjs firestore.rules --out x.rules  (다른 파일로)
import fs from "node:fs";
export function stripRules(src) {
  let out = "", i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) { out += c; if (c === "\\") { out += n ?? ""; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === "'" || c === '"') { q = c; out += c; i++; continue; }
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    out += c; i++;
  }
  return out.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim() !== "").join("\n") + "\n";
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const args = process.argv.slice(2); const oi = args.indexOf("--out");
  const files = args.filter((a, k) => a !== "--out" && k !== oi + 1);
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8"); const res = stripRules(src);
    const dest = oi >= 0 ? args[oi + 1] : f; fs.writeFileSync(dest, res);
    console.log(`${f}: ${Buffer.byteLength(src)} → ${Buffer.byteLength(res)} bytes${dest !== f ? ` (${dest})` : ""}`);
  }
}
