// 관리자센터 › 홍보 › 블로그 원고에서 "발행"한 글을 저장소로 가져온다 (GitHub 자동 작업 "블로그 홈페이지 반영"이 매시간 실행)
// 사용: GOOGLE_APPLICATION_CREDENTIALS=서비스계정.json node marketing/blog/scripts/pull.mjs
//  · 발행(publish) 글 → marketing/blog/posts/<날짜>-<주소>/post.md + cards.json (+ 관리자센터에서 만든 카드 JPG)
//  · 내림(hidden) · 지운 글 → 같은 주소 폴더를 지운다(관리자센터에서 가져온 글만 · source: admin)
//  · 카드 JPG 가 없거나 카드가 바뀌었으면 render-cards.mjs 가 다시 그린다
import fs from "node:fs"; import path from "node:path";
import { createRequire } from "node:module";
import { BLOG } from "./lib.mjs";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();
const POSTS = path.join(BLOG, "posts");
const hashCards = (c) => { const s = JSON.stringify(c || []); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h >>> 0); };
const slugOf = (dir) => { try { return (fs.readFileSync(path.join(dir, "post.md"), "utf8").match(/^slug:\s*(.+)$/m) || [])[1]?.trim(); } catch { return ""; } };
const fromAdmin = (dir) => { try { return /^source:\s*admin/m.test(fs.readFileSync(path.join(dir, "post.md"), "utf8")); } catch { return false; } };
const one = (s) => String(s || "").replace(/\s*\n\s*/g, " ").trim();
const LIB = new Set(fs.readdirSync(path.join(BLOG, "../../landing-site/img")));

const snap = await db.collection("mktBlog").get();
const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const pub = docs.filter((p) => p.status === "publish" && p.slug && p.date);
const pubSlugs = new Set(pub.map((p) => p.slug));
let changed = 0;
// 내림 · 지움
for (const d of fs.readdirSync(POSTS)) {
  const dir = path.join(POSTS, d); const sl = slugOf(dir); if (!sl) continue;
  const hidden = docs.some((p) => p.slug === sl && p.status === "hidden");
  if ((fromAdmin(dir) && !pubSlugs.has(sl)) || hidden) { fs.rmSync(dir, { recursive: true, force: true }); changed++; console.log("내림:", d); }
}
for (const p of pub) {
  const name = `${p.date}-${p.slug}`; const dir = path.join(POSTS, name);
  for (const d of fs.readdirSync(POSTS)) { const od = path.join(POSTS, d); if (d !== name && slugOf(od) === p.slug) { fs.rmSync(od, { recursive: true, force: true }); console.log("옮김:", d, "→", name); } }
  fs.mkdirSync(dir, { recursive: true });
  const body = String(p.body || "").replace(/\]\(card-([1-9])\)/g, "](card-$1.jpg)").replace(/\]\(([\w.-]+\.(?:jpg|png))\)/g, (m, f) => (LIB.has(f) && !/^card-\d/.test(f) ? `](/img/${f})` : m));
  const md = `---\ntitle: ${one(p.title)}\ndate: ${p.date}\nslug: ${p.slug}\nkeywords: ${one(p.keywords)}\ntags: ${(p.tags || []).map(one).join(", ")}\nsummary: ${one(p.summary)}\nsource: admin\nid: ${p.id}\n---\n\n${body.trim()}\n`;
  const cards = JSON.stringify(p.cards || [], null, 1);
  const old = fs.existsSync(path.join(dir, "post.md")) ? fs.readFileSync(path.join(dir, "post.md"), "utf8") + fs.readFileSync(path.join(dir, "cards.json"), "utf8") : "";
  const imgsOk = Array.isArray(p.cardImgs) && p.cardImgs.length && p.cardsHash === hashCards(p.cards);
  const cardsChanged = !old.endsWith(cards);
  if (old === md + cards && (fs.existsSync(path.join(dir, "card-1.jpg")))) continue;
  fs.writeFileSync(path.join(dir, "post.md"), md); fs.writeFileSync(path.join(dir, "cards.json"), cards);
  if (cardsChanged) for (const f of fs.readdirSync(dir)) if (/^card-\d+\.(jpg|png)$/.test(f)) fs.rmSync(path.join(dir, f));
  if (imgsOk && cardsChanged) {
    for (let i = 0; i < p.cardImgs.length; i++) { const r = await fetch(p.cardImgs[i]); if (r.ok) fs.writeFileSync(path.join(dir, `card-${i + 1}.jpg`), Buffer.from(await r.arrayBuffer())); }
  }
  changed++; console.log("반영:", name);
}
console.log(`관리자센터 글 ${pub.length}편 확인 · 바뀐 것 ${changed}개`);
process.exit(0);
