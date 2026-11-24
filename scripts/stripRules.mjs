// ======================= scripts/stripRules.mjs =======================
// 🔒 2026-11-24 보안 규칙 배포용 사본 — firestore.rules(설명 주석 포함 원본)에서 // 주석과 빈 줄만 뺀 firestore.deploy.rules 를 만든다
//  왜: 11/23 #204 뒤로 원본이 238KB(한글 주석 포함 · 전송하면 약 30만 바이트)가 되자 구글 규칙 서버(firebaserules.googleapis.com)가
//      규칙 검사 요청을 매번 503(Service Unavailable)으로 거절해 규칙 · 색인 · 저장소 배포가 3번 연속 실패했다(#112 · #113 · #114).
//      마지막 성공(#111)은 231KB. 주석을 빼면 약 151KB — 규칙 내용(동작)은 그대로다.
//  · 원본(firestore.rules)만 고친다. 사본은 firebase.json firestore.predeploy 가 배포 직전에 다시 만든다(+ git 커밋 전 훅)
//  · node scripts/stripRules.mjs          → 사본 만들기
//  · node scripts/stripRules.mjs --check  → 사본이 원본과 맞는지만 검사(다르면 실패)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "firestore.rules");
const OUT = path.join(ROOT, "firestore.deploy.rules");
const HEAD = "// 자동 생성 파일 — 고치지 마세요. 원본은 firestore.rules (node scripts/stripRules.mjs 가 주석을 빼서 만듦)\n";

// 한 줄에서 문자열('…' "…") 밖의 // 부터 끝까지 지운다
export function stripLine(line) {
  let out = ""; let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      out += c;
      if (c === "\\" && i + 1 < line.length) { out += line[i + 1]; i += 1; continue; }
      if (c === q) q = null;
    } else if (c === "'" || c === '"') { q = c; out += c; }
    else if (c === "/" && line[i + 1] === "/") break;
    else out += c;
  }
  return out.replace(/\s+$/, "");
}
export function stripRules(src) {
  return HEAD + src.split("\n").map(stripLine).filter((l) => l.trim()).join("\n") + "\n";
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const want = stripRules(fs.readFileSync(SRC, "utf8"));
  if (process.argv.includes("--check")) {
    const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (have !== want) { console.error("✗ firestore.deploy.rules 가 firestore.rules 와 다릅니다 — node scripts/stripRules.mjs"); process.exit(1); }
    console.log(`✓ firestore.deploy.rules 최신 (${Buffer.byteLength(want)} bytes)`);
  } else {
    fs.writeFileSync(OUT, want);
    console.log(`firestore.deploy.rules — ${Buffer.byteLength(want)} bytes (원본 ${fs.statSync(SRC).size} bytes)`);
  }
}
