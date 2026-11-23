// 사용: node marketing/blog/scripts/build.mjs
// 1) 글마다 naver.html (네이버 블로그에 붙여넣을 글) 만들기
// 2) 날짜가 오늘(한국시간) 이전인 글을 홈페이지(landing-site/blog/)에 올리기 + 목록 · RSS · sitemap 갱신
import fs from "node:fs"; import path from "node:path";
import { BLOG, REPO, SITE, allPosts, md2html, todayKST } from "./lib.mjs";
const OUT = path.join(REPO, "landing-site/blog");
const today = todayKST();
const posts = allPosts();
const NAVER = { h2: "font-size:24px;font-weight:700;margin:36px 0 12px;color:#0F1A30", h3: "font-size:19px;font-weight:700;margin:24px 0 8px", p: "font-size:16px;line-height:1.9;margin:0 0 14px;color:#222",
  list: "font-size:16px;line-height:1.9;margin:0 0 14px", quote: "border-left:4px solid #2D5BD8;background:#F2F6FF;padding:14px 18px;margin:18px 0;color:#333;font-size:15px;line-height:1.8",
  figure: "margin:22px 0;text-align:center", img: "max-width:100%;border-radius:8px", cap: "font-size:13px;color:#888;margin-top:6px", b: "color:#2D5BD8",
  table: "border-collapse:collapse;width:100%;font-size:15px;margin:16px 0", th: "background:#0F1A30;color:#fff;padding:10px;border:1px solid #ccd", td: "padding:10px;border:1px solid #ccd" };
for (const p of posts) {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${p.title}</title></head><body style="max-width:760px;margin:30px auto;font-family:sans-serif">
<div style="background:#FFF8E1;border:1px solid #F5C04F;padding:14px 18px;border-radius:8px;font-size:14px;line-height:1.7;margin-bottom:30px">
<b>네이버 블로그 올리는 법</b><br>① 제목 칸에 아래 제목 복사 ② 이 노란 상자 아래 본문을 드래그 → 복사 → 붙여넣기 ③ 그림 자리에 같은 폴더의 card-1~3.jpg 를 끌어다 놓기 ④ 태그 칸에 태그 붙여넣기 ⑤ 발행<br>
<b>제목</b>: ${p.title}<br><b>태그</b>: ${p.tags.map((t) => "#" + t.replace(/\s/g, "")).join(" ")}</div>
<h1 style="font-size:28px">${p.title}</h1>
${md2html(p.body, NAVER)}
</body></html>`;
  fs.writeFileSync(path.join(p.dir, "naver.html"), html);
}
// 홈페이지 블로그
const live = posts.filter((p) => p.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1));
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const head = (title, desc, urlPath, img) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="${desc}"><link rel="canonical" href="${SITE}${urlPath}">
<meta property="og:type" content="article"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:image" content="${img}"><meta property="og:url" content="${SITE}${urlPath}">
<link rel="alternate" type="application/rss+xml" title="LogisWeb 블로그" href="${SITE}/blog/rss.xml"><link rel="icon" href="/brand/logisweb-mark.png">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/pretendard.min.css"><link rel="stylesheet" href="/blog/blog.css"></head><body>
<header><a href="/" class="logo"><img src="/brand/logisweb-mark.svg" alt=""><b>Logis<span>Web</span></b></a><nav><a href="/blog/">블로그</a><a href="/?utm_source=blog&utm_medium=owned#inquiry-form" class="btn">무료 체험</a></nav></header>`;
const foot = `<footer><div class="cta"><b>배차부터 정산까지, 운송사 업무를 한 화면에서</b><a href="/?utm_source=blog&utm_medium=owned#inquiry-form" class="btn">무료 체험 신청</a></div><p>© LogisWeb · 운송사 통합 운송관리시스템(TMS)</p></footer></body></html>`;
for (const p of live) {
  const d = path.join(OUT, p.slug); fs.mkdirSync(d, { recursive: true });
  for (const f of fs.readdirSync(p.dir)) if (/\.(png|jpg|webp)$/.test(f)) fs.copyFileSync(path.join(p.dir, f), path.join(d, f));
  const ld = { "@context": "https://schema.org", "@type": "BlogPosting", headline: p.title, datePublished: p.date, description: p.summary, image: `${SITE}/blog/${p.slug}/card-1.jpg`, author: { "@type": "Organization", name: "LogisWeb" }, keywords: p.keywords };
  fs.writeFileSync(path.join(d, "index.html"), head(`${p.title} | LogisWeb 블로그`, p.summary, `/blog/${p.slug}/`, `${SITE}/blog/${p.slug}/card-1.jpg`) +
    `<main class="post"><p class="meta">${p.date} · ${p.tags.slice(0, 3).map((t) => "#" + t).join(" ")}</p><h1>${p.title}</h1>${md2html(p.body)}</main>
<script type="application/ld+json">${JSON.stringify(ld)}</script>` + foot);
}
fs.writeFileSync(path.join(OUT, "index.html"), head("LogisWeb 블로그 | 배차 · 정산 · 운송사 실무 팁", "배차프로그램 LogisWeb이 전하는 운송사 배차 · 관제 · 정산 실무 팁", "/blog/", `${SITE}/og-image.png`) +
  `<main class="list"><h1>LogisWeb 블로그</h1><p class="lead">배차 · 관제 · 정산, 운송사 실무를 더 쉽게 하는 이야기</p><div class="grid">${live.map((p) => `<a class="item" href="/blog/${p.slug}/"><img src="/blog/${p.slug}/card-1.jpg" alt="" loading="lazy"><span class="d">${p.date}</span><b>${p.title}</b><span class="s">${p.summary}</span></a>`).join("")}</div></main>` + foot);
fs.copyFileSync(path.join(BLOG, "templates/blog.css"), path.join(OUT, "blog.css"));
const x = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
fs.writeFileSync(path.join(OUT, "rss.xml"), `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>LogisWeb 블로그</title><link>${SITE}/blog/</link><description>운송사 배차 · 관제 · 정산 실무 팁</description><language>ko</language>
${live.map((p) => `<item><title>${x(p.title)}</title><link>${SITE}/blog/${p.slug}/</link><guid>${SITE}/blog/${p.slug}/</guid><pubDate>${new Date(p.date + "T09:00:00+09:00").toUTCString()}</pubDate><description>${x(p.summary)}</description></item>`).join("\n")}
</channel></rss>`);
// sitemap: 블로그 줄만 다시 씀(기존 줄 유지)
const smP = path.join(REPO, "landing-site/sitemap.xml"); let sm = fs.readFileSync(smP, "utf8").replace(/\s*<url><loc>[^<]*\/blog\/[^<]*<\/loc>.*?<\/url>/g, "");
const add = [`<url><loc>${SITE}/blog/</loc><lastmod>${live[0]?.date || today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`, ...live.map((p) => `<url><loc>${SITE}/blog/${p.slug}/</loc><lastmod>${p.date}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`)];
sm = sm.replace("</urlset>", add.map((a) => "  " + a).join("\n") + "\n</urlset>");
fs.writeFileSync(smP, sm);
console.log(`naver.html ${posts.length}개 · 홈페이지 게시 ${live.length}개(오늘 ${today}까지) · 예약 ${posts.length - live.length}개`);
