// 블로그 공용: 글 읽기 · 아주 작은 마크다운 변환기(의존성 없음)
import fs from "node:fs"; import path from "node:path"; import url from "node:url";
export const BLOG = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
export const REPO = path.resolve(BLOG, "../..");
export const SITE = "https://www.logisweb.co.kr";
export const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
export function readPost(dir) {
  const raw = fs.readFileSync(path.join(dir, "post.md"), "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const meta = {}; for (const l of m[1].split("\n")) { const i = l.indexOf(":"); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"(.*)"$/, "$1"); }
  meta.tags = (meta.tags || "").split(",").map((s) => s.trim()).filter(Boolean);
  return { dir, ...meta, body: m[2].trim() };
}
export function allPosts() {
  const root = path.join(BLOG, "posts");
  return fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, "post.md"))).sort().map((d) => readPost(path.join(root, d)));
}
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s, st) => esc(s).replace(/\*\*(.+?)\*\*/g, st.b ? `<strong style="${st.b}">$1</strong>` : "<strong>$1</strong>").replace(/\[(.+?)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
// st: 태그별 인라인 스타일(네이버 붙여넣기용). 비우면 class 없는 깔끔한 HTML.
export function md2html(md, st = {}, imgSrc = (s) => s) {
  const out = []; const lines = md.split("\n"); let i = 0;
  const S = (k) => (st[k] ? ` style="${st[k]}"` : "");
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{2,3}) (.*)/))) { const t = m[1].length === 2 ? "h2" : "h3"; out.push(`<${t}${S(t)}>${inline(m[2], st)}</${t}>`); i++; continue; }
    if ((m = l.match(/^!\[(.*?)\]\((.*?)\)/))) { out.push(`<figure${S("figure")}><img src="${imgSrc(m[2])}" alt="${esc(m[1])}"${S("img")}><figcaption${S("cap")}>${esc(m[1])}</figcaption></figure>`); i++; continue; }
    if (l.startsWith(">")) { const b = []; while (i < lines.length && lines[i].startsWith(">")) b.push(lines[i++].replace(/^>\s?/, "")); out.push(`<blockquote${S("quote")}>${inline(b.join(" "), st)}</blockquote>`); continue; }
    if (l.startsWith("|")) { const rows = []; while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]); const cells = (r) => r.split("|").slice(1, -1).map((c) => c.trim());
      const head = cells(rows[0]); const body = rows.slice(2).map(cells);
      out.push(`<table${S("table")}><thead><tr>${head.map((c) => `<th${S("th")}>${inline(c, st)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td${S("td")}>${inline(c, st)}</td>`).join("")}</tr>`).join("")}</tbody></table>`); continue; }
    if (/^(- |\d+\. )/.test(l)) { const ol = /^\d+\. /.test(l); const it = []; while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) it.push(lines[i++].replace(/^(- |\d+\. )/, ""));
      out.push(`<${ol ? "ol" : "ul"}${S("list")}>${it.map((x) => `<li${S("li")}>${inline(x, st)}</li>`).join("")}</${ol ? "ol" : "ul"}>`); continue; }
    const p = []; while (i < lines.length && lines[i].trim() && !/^(#{2,3} |!\[|>|\||- |\d+\. )/.test(lines[i])) p.push(lines[i++]);
    out.push(`<p${S("p")}>${inline(p.join(" "), st)}</p>`);
  }
  return out.join("\n");
}
