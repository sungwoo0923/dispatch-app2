// 📝 2026-11-09 업데이트 보관함(관리센터 › 플랫폼 공지 › AI 작성함) 원본 만들기
//  git 커밋 제목을 public/updates.json 에 누적한다(빌드 전 · 커밋 전에 자동 실행).
//  · 이미 있는 파일과 합친다(해시로 중복 제거) — Vercel처럼 얕은 clone(최근 몇 개만)이어도 예전 기록이 남는다
//  · git이 없거나 실패해도 빌드를 멈추지 않는다(있는 파일 그대로)
//  · 버전 올림(chore: version) · 병합(Merge) · 작업 중 백업 커밋은 뺀다
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "public", "updates.json");
const MAX = 600;
const SKIP = /^(chore[:(]|merge\b|wip\b|작업 중 백업|revert\b)/i;

let old = [];
try { old = JSON.parse(fs.readFileSync(file, "utf8")).items || []; } catch { /* 처음 */ }

let fresh = [];
try {
  const out = execSync("git log -n 400 --no-merges --pretty=format:%H%x1f%cI%x1f%s%x1e", { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 });
  fresh = out.split("\x1e").map((r) => r.trim()).filter(Boolean).map((r) => {
    const [h, at, s] = r.split("\x1f");
    return { h: (h || "").slice(0, 12), at: at || "", s: (s || "").trim() };
  }).filter((x) => x.h && x.at && x.s && !SKIP.test(x.s));
} catch { /* git 없음 — 있는 파일 그대로 */ }

const byHash = new Map();
[...old, ...fresh].forEach((x) => { if (x?.h) byHash.set(x.h, x); });
const items = [...byHash.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, MAX);
const prev = JSON.stringify(old);
if (JSON.stringify(items) !== prev || !fs.existsSync(file)) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 0));
  console.log(`✅ updates.json: ${items.length}건 (새로 ${Math.max(0, items.length - old.length)}건)`);
}
