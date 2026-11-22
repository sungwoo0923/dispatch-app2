// 매주 자동 블로그: 이번 주(월~일, 한국시간) 글이 없으면 calendar.json 의 다음 주제로 Gemini가 글을 써요.
// 사용: GEMINI_API_KEY=... node marketing/blog/scripts/weekly.mjs   (이미 이번 주 글이 있으면 아무것도 안 함)
//       --force 를 붙이면 이번 주 글이 있어도 하나 더 써요.
import fs from "node:fs"; import path from "node:path";
import { BLOG, allPosts, todayKST } from "./lib.mjs";
const today = todayKST();
const d = new Date(today + "T00:00:00Z"); const dow = (d.getUTCDay() + 6) % 7;
const monday = new Date(d - dow * 864e5).toISOString().slice(0, 10), sunday = new Date(+d + (6 - dow) * 864e5).toISOString().slice(0, 10);
const posts = allPosts();
if (!process.argv.includes("--force") && posts.some((p) => p.date >= monday && p.date <= sunday)) { console.log(`이번 주(${monday}~${sunday}) 글이 이미 있어요. 건너뜀.`); process.exit(0); }
const calP = path.join(BLOG, "calendar.json"); const cal = JSON.parse(fs.readFileSync(calP, "utf8"));
const used = new Set(posts.map((p) => p.slug));
const topic = cal.topics.find((t) => !t.done && !used.has(t.slug));
if (!topic) { console.log("calendar.json 에 남은 주제가 없어요. 주제를 더 넣어 주세요."); process.exit(0); }
const key = process.env.GEMINI_API_KEY; if (!key) { console.error("GEMINI_API_KEY 가 없어요. GitHub 저장소 Settings › Secrets › Actions 에 등록해 주세요."); process.exit(1); }
const facts = fs.readFileSync(path.join(BLOG, "../brand/facts.md"), "utf8");
const sample = fs.readFileSync(path.join(BLOG, "posts", fs.readdirSync(path.join(BLOG, "posts")).sort()[0], "post.md"), "utf8");
const imgs = fs.readdirSync(path.join(BLOG, "../../landing-site/img")).filter((f) => f.endsWith(".jpg"));
const prompt = `너는 화물 운송사용 배차프로그램 "로지스웹(LogisWeb)"의 네이버 블로그 담당 마케터야.
아래 [사실]에 있는 내용만 사용해서, 주제에 맞는 블로그 글 1편을 써.

[주제] ${topic.title}
[검색 키워드] ${topic.keywords} — 제목 앞부분과 본문 첫 문단, 소제목 1곳에 자연스럽게 넣기
[관점] ${topic.angle || ""}

[규칙]
- 말투: 짧게, "~해요 / ~하면 돼요". 배차팀장 · 대표가 읽는 글. 현장 말 그대로 OK.
- 구조: 공감되는 현장 장면(2~3문단) → "## 소제목" 3~4개로 해결 방법(무엇을 누르면 → 무엇이 달라지는지) → "## 무료로 먼저 써 보세요" + 마지막 줄 "👉 무료 체험 신청: **logisweb.co.kr** (검색창에 \\"로지스웹\\")"
- 길이: 본문 1,500~2,200자. 목록(- , 1.)과 **굵게**를 적당히. 표는 써도 되고 안 써도 됨.
- 그림 자리: 본문 맨 위에 ![대표 이미지 설명](card-1.jpg), 중간에 ![설명](card-2.jpg), 뒤쪽에 ![설명](card-3.jpg) 를 한 번씩 넣기.
- 확인 안 된 숫자 · 고객 수 · 1위 같은 말 금지. 예시 숫자에는 "예를 들어" 붙이기. 홈택스 연동은 "준비 중"이라고만.
- 마크다운 문법은 ## 소제목, - 목록, 1. 목록, > 인용, **굵게**, 표(|)만 사용. # 제목(h1)은 쓰지 마.

[카드 이미지] 1080×1080 카드 3장을 cards 로 설계해. title 안에서 강조할 말은 **굵게**, 줄바꿈은 \\n.
 1) {"kind":"cover","cat":"짧은 분류","title":"3줄 이내 큰 제목","img":"<아래 사진 중 하나>","label":"LogisWeb · 화면 이름","crop":"50% 20%"}
 2) {"kind":"shot","cat":"실제 화면","title":"짧은 제목","sub":"한 줄 설명","img":"<사진>","label":"LogisWeb · 화면 이름","crop":"50% 30%"}
 3) {"kind":"points","cat":"한눈에 정리","title":"짧은 제목","points":[["핵심 1","짧은 설명"],["핵심 2","짧은 설명"],["핵심 3","짧은 설명"],["핵심 4","짧은 설명"]]}
 쓸 수 있는 사진: ${imgs.join(", ")} (추천: ${topic.img || "real-home.jpg"}; m-로 시작하는 건 휴대폰 화면)

[사실]
${facts}

[예시 글(말투 · 구조 참고, 내용 베끼지 말 것)]
${sample}

JSON 으로만 답해: {"title":"네이버 제목(35자 안팎, 키워드 앞쪽)","summary":"한 문장 요약","tags":["태그 8개, 로지스웹 포함"],"body":"마크다운 본문","cards":[...3장]}`;
// 모델은 자주 바뀌어서 "latest" 별칭부터 써 보고, 안 되면 다음 것으로 넘어가요.
const MODELS = [process.env.BLOG_MODEL, "gemini-flash-latest", "gemini-pro-latest", "gemini-3.8-flash"].filter(Boolean);
let res;
for (const MODEL of MODELS) {
  for (let a = 0; a < 3 && !res; a++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.8 } }) });
    if (r.ok) { res = await r.json(); console.log("모델:", MODEL); break; }
    console.error("Gemini 오류", MODEL, r.status, (await r.text()).slice(0, 200));
    if (r.status === 404 || r.status === 400) break;
    await new Promise((s) => setTimeout(s, 8000 * (a + 1)));
  }
  if (res) break;
}
if (!res) process.exit(1);
const j = JSON.parse(res.candidates[0].content.parts[0].text.replace(/^```json\s*|```$/g, ""));
// 안전 점검: 금지 표현 · 필수 요소
const bad = ["업계 1위", "1위", "홈택스 연동 완료", "도입사", "% 절감"].filter((w) => j.body.includes(w) && !(w === "1위" && j.body.includes("거래처 순위")));
if (bad.length) console.warn("⚠️ 검토 필요한 표현:", bad.join(", "));
if (!j.body.includes("logisweb.co.kr")) j.body += `\n\n## 무료로 먼저 써 보세요\n\n👉 무료 체험 신청: **logisweb.co.kr** (검색창에 "로지스웹")`;
for (const c of j.cards) if (c.img && !imgs.includes(c.img)) c.img = topic.img || "real-home.jpg";
const dir = path.join(BLOG, "posts", `${today}-${topic.slug}`); fs.mkdirSync(dir, { recursive: true });
const tags = [...new Set([...(j.tags || []), "로지스웹"])].slice(0, 10);
fs.writeFileSync(path.join(dir, "post.md"), `---\ntitle: ${j.title.replace(/\n/g, " ")}\ndate: ${today}\nslug: ${topic.slug}\nkeywords: ${topic.keywords}\ntags: ${tags.join(", ")}\nsummary: ${j.summary.replace(/\n/g, " ")}\nauto: gemini\n---\n\n${j.body.trim()}\n`);
fs.writeFileSync(path.join(dir, "cards.json"), JSON.stringify(j.cards, null, 1));
topic.done = today; fs.writeFileSync(calP, JSON.stringify(cal, null, 2) + "\n");
console.log(`새 글: ${j.title} → ${path.relative(process.cwd(), dir)}`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `title=${j.title.replace(/\n/g, " ")}\ndir=${path.relative(path.join(BLOG, "../.."), dir)}\nbad=${bad.join(",")}\n`);
