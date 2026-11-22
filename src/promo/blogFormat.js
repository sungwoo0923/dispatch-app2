// ======================= src/promo/blogFormat.js =======================
// 📝 2026-11-23 블로그 원고 — 마크다운 → 홈페이지 · 네이버 모양 HTML, 검색 점검(네이버 · 구글)
//  marketing/blog/scripts/lib.mjs 와 같은 규칙(## 소제목 · - 목록 · 1. 목록 · > 인용 · 표 · ![설명](그림) · **굵게**)
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = (s, st) => esc(s).replace(/\*\*(.+?)\*\*/g, st.b ? `<strong style="${st.b}">$1</strong>` : "<strong>$1</strong>").replace(/\[(.+?)\]\((https?:\/\/[^)]+)\)/g, `<a href="$2"${st.a ? ` style="${st.a}"` : ""}>$1</a>`);
export function md2html(md, st = {}, imgSrc = (s) => s) {
  const out = []; const lines = String(md || "").split("\n"); let i = 0;
  const S = (k) => (st[k] ? ` style="${st[k]}"` : "");
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{2,3}) (.*)/))) { const t = m[1].length === 2 ? "h2" : "h3"; out.push(`<${t}${S(t)}>${inline(m[2], st)}</${t}>`); i++; continue; }
    if ((m = l.match(/^!\[(.*?)\]\((.*?)\)/))) { out.push(`<figure${S("figure")}><img src="${esc(imgSrc(m[2]))}" alt="${esc(m[1])}"${S("img")}><figcaption${S("cap")}>${esc(m[1])}</figcaption></figure>`); i++; continue; }
    if (l.startsWith(">")) { const b = []; while (i < lines.length && lines[i].startsWith(">")) b.push(lines[i++].replace(/^>\s?/, "")); out.push(`<blockquote${S("quote")}>${inline(b.join(" "), st)}</blockquote>`); continue; }
    if (l.startsWith("|")) {
      const rows = []; while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]); const cells = (r) => r.split("|").slice(1, -1).map((c) => c.trim());
      const head = cells(rows[0]); const body = rows.slice(rows[1] && /^[\s|:-]+$/.test(rows[1]) ? 2 : 1).map(cells);
      out.push(`<table${S("table")}><thead><tr>${head.map((c) => `<th${S("th")}>${inline(c, st)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td${S("td")}>${inline(c, st)}</td>`).join("")}</tr>`).join("")}</tbody></table>`); continue;
    }
    if (/^(- |\d+\. )/.test(l)) {
      const ol = /^\d+\. /.test(l); const it = []; while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) it.push(lines[i++].replace(/^(- |\d+\. )/, ""));
      out.push(`<${ol ? "ol" : "ul"}${S("list")}>${it.map((x) => `<li${S("li")}>${inline(x, st)}</li>`).join("")}</${ol ? "ol" : "ul"}>`); continue;
    }
    const p = []; while (i < lines.length && lines[i].trim() && !/^(#{2,3} |!\[|>|\||- |\d+\. )/.test(lines[i])) p.push(lines[i++]);
    out.push(`<p${S("p")}>${inline(p.join(" "), st)}</p>`);
  }
  return out.join("\n");
}
// 네이버 블로그에 붙여 넣을 때 모양(글자 크기 · 색을 글자마다 붙여 둔다)
export const NAVER_STYLE = {
  h2: "font-size:24px;font-weight:700;margin:36px 0 12px;color:#0F1A30", h3: "font-size:19px;font-weight:700;margin:24px 0 8px", p: "font-size:16px;line-height:1.9;margin:0 0 14px;color:#222",
  list: "font-size:16px;line-height:1.9;margin:0 0 14px", quote: "border-left:4px solid #2D5BD8;background:#F2F6FF;padding:14px 18px;margin:18px 0;color:#333;font-size:15px;line-height:1.8",
  figure: "margin:22px 0;text-align:center", img: "max-width:100%;border-radius:8px", cap: "font-size:13px;color:#888;margin-top:6px", b: "color:#2D5BD8", a: "color:#2D5BD8",
  table: "border-collapse:collapse;width:100%;font-size:15px;margin:16px 0", th: "background:#0F1A30;color:#fff;padding:10px;border:1px solid #ccd", td: "padding:10px;border:1px solid #ccd",
};
// 홈페이지 블로그(logisweb.co.kr/blog) 모양 — landing-site/blog/blog.css 와 같은 느낌
export const SITE_STYLE = {
  h2: "font-size:23px;font-weight:800;margin:40px 0 12px;color:#0F1A30", h3: "font-size:19px;font-weight:700;margin:24px 0 8px;color:#0F1A30", p: "font-size:17px;line-height:1.85;margin:0 0 16px;color:#1d2433",
  list: "font-size:17px;line-height:1.85;margin:0 0 16px;padding-left:22px;color:#1d2433", li: "margin:2px 0", quote: "margin:22px 0;padding:16px 20px;border-left:4px solid #2D5BD8;background:#F2F6FF;border-radius:0 10px 10px 0;line-height:1.8;color:#1d2433",
  figure: "margin:26px 0;text-align:center", img: "max-width:100%;border-radius:14px;box-shadow:0 10px 30px -12px rgba(15,26,48,.35)", cap: "color:#5b6b88;font-size:13px;margin-top:8px", b: "color:#2D5BD8", a: "color:#2D5BD8",
  table: "width:100%;border-collapse:collapse;font-size:15px;margin:16px 0", th: "background:#0F1A30;color:#fff;padding:10px;border:1px solid #e3e9f4", td: "padding:10px;border:1px solid #e3e9f4;color:#1d2433",
};
export const stripMd = (md) => String(md || "").replace(/!\[.*?\]\(.*?\)/g, "").replace(/[#>*|`-]/g, "").replace(/\s+/g, " ").trim();
export const BANNED = [["업계 1위", "확인 안 된 순위"], ["% 절감", "확인 안 된 숫자"], ["홈택스 연동 완료", "홈택스 연동은 준비 중"], ["홈택스와 연동돼", "홈택스 연동은 준비 중"], ["도입사", "확인 안 된 고객 수"], ["고객사 수", "확인 안 된 고객 수"]];
export function seoCheck(p) {
  const kws = String(p.keywords || "").split(",").map((x) => x.trim()).filter(Boolean); const k0 = kws[0] || "";
  const body = String(p.body || ""); const text = stripMd(body); const first = (body.split("\n").find((l) => l.trim() && !l.startsWith("!") && !l.startsWith("#")) || "");
  const h2 = body.split("\n").filter((l) => /^##\s/.test(l)); const imgs = (body.match(/!\[.*?\]\(.*?\)/g) || []).length;
  const t = String(p.title || ""); const bad = BANNED.filter(([w]) => body.includes(w) || t.includes(w));
  const kwIn = (s) => kws.some((k) => k && s.replace(/\s/g, "").includes(k.replace(/\s/g, "")));
  const items = [
    ["제목 길이 20~40자", t.length >= 20 && t.length <= 40, `지금 ${t.length}자`],
    ["제목에 검색 키워드", !!k0 && kwIn(t), k0 ? `키워드: ${kws.join(", ")}` : "정보 탭에서 키워드를 넣어 주세요"],
    ["첫 문단에 키워드", !!k0 && kwIn(first), "검색엔진은 첫 문단을 중요하게 봐요"],
    ["소제목(##) 3개 이상", h2.length >= 3, `지금 ${h2.length}개`],
    ["소제목 하나에 키워드", !!k0 && h2.some(kwIn), ""],
    ["본문 1,500~2,500자", text.length >= 1500 && text.length <= 2500, `지금 ${text.length.toLocaleString()}자`],
    ["그림 3장 이상", imgs >= 3, `지금 ${imgs}장 · 네이버는 그림이 많을수록 좋아요`],
    ["무료 체험 안내", /logisweb\.co\.kr/.test(body), "글 끝에 logisweb.co.kr"],
    ["태그 5개 이상", (p.tags || []).length >= 5, `지금 ${(p.tags || []).length}개`],
    ["한 줄 요약", !!String(p.summary || "").trim(), "목록 · 검색 결과에 보여요"],
    ["쓰면 안 되는 말 없음", !bad.length, bad.length ? bad.map(([w, why]) => `"${w}"(${why})`).join(", ") : ""],
  ];
  return { items, score: Math.round((items.filter((x) => x[1]).length / items.length) * 100), chars: text.length };
}
export const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
export const cardIdx = (src) => { const m = String(src || "").match(/^card-([1-9])(\.(jpg|png))?$/); return m ? Number(m[1]) : 0; };
