// 📚 사용법 보관함 점검 — node scripts/guideLibrary.test.mjs
//  목록(src/guideLibrary.js)의 사용법마다 이미지 · 작은 그림이 실제로 있는지, 아이디가 겹치지 않는지, 분류가 맞는지 본다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDES, GUIDE_CATS, guideImage, guideThumb, filterGuides } from "../src/guideLibrary.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let fail = 0;
const ok = (cond, msg) => { if (cond) console.log(`✓ ${msg}`); else { fail += 1; console.error(`✕ ${msg}`); } };

ok(GUIDES.length > 0, `사용법 ${GUIDES.length}건`);
ok(new Set(GUIDES.map((g) => g.id)).size === GUIDES.length, "아이디가 겹치지 않는다");
const cats = new Set(GUIDE_CATS.map((c) => c.key));
ok(GUIDES.every((g) => cats.has(g.cat)), "모든 사용법의 분류가 목록에 있다");
ok(GUIDES.every((g) => g.title && g.desc && g.device && /^\d{4}-\d{2}-\d{2}$/.test(g.date)), "제목 · 설명 · 기기 · 날짜가 다 있다");
const missing = GUIDES.flatMap((g) => [guideImage(g), guideThumb(g)]).filter((u) => !fs.existsSync(path.join(root, "public", u)));
ok(missing.length === 0, `이미지 · 작은 그림 파일이 다 있다${missing.length ? ` — 없음: ${missing.join(", ")}` : ""}`);
const onDisk = fs.readdirSync(path.join(root, "public/howto")).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4));
const orphan = onDisk.filter((id) => !GUIDES.some((g) => g.id === id));
ok(orphan.length === 0, `폴더의 이미지가 모두 목록에 있다${orphan.length ? ` — 목록에 없음: ${orphan.join(", ")}` : ""}`);
ok(filterGuides(GUIDES, { q: "회 전" }).some((g) => g.id === "rotation-order"), "검색: 띄어쓰기를 무시하고 찾는다");
ok(filterGuides(GUIDES, { cat: "driver" }).every((g) => g.cat === "driver") && filterGuides(GUIDES, { cat: "driver" }).length > 0, "분류로 거른다");

if (fail) { console.error(`guideLibrary: ${fail}건 실패`); process.exit(1); }
console.log("guideLibrary: 모두 통과");
