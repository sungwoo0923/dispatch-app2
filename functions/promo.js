// ======================= functions/promo.js =======================
// 📣 2026-11-23 관리자센터 › 홍보 (영상 편집실 · 블로그 원고 · 홍보 설정) 서버 쪽
//  · runPromoAi: Claude 로 글 · 대본 만들기 (블로그 초안 · 문장 다듬기 · 제목 추천 · 영상 대본 · 유튜브 설명)
//  · runTts: Gemini TTS 로 나레이션 음성 만들기 → WAV(base64)로 돌려주면 화면이 Storage(marketing/voice/)에 올린다
//  · weeklyDraft: 매주 월요일 아침, 다음 주제로 블로그 초안을 만들어 mktBlog 에 "검토 대기"로 넣는다
//  · Gemini 키는 Firebase 비밀값이 아니라 Firestore platformSecrets/gemini 에 둔다(관리자센터에서 넣음 · 화면에서는 못 읽게 규칙으로 막음)
//    → 키가 없어도 서버 배포가 깨지지 않는다
//  · 사실 기준: siteConfig/mktSettings.facts(관리자센터에서 고친 것) → 없으면 functions/promoFacts.md
const fs = require("fs");
const path = require("path");
const AnthropicMod = require("@anthropic-ai/sdk");
const Anthropic = AnthropicMod.default || AnthropicMod;

const MODEL = "claude-sonnet-5-5";
const cleanKey = () => String(process.env.ANTHROPIC_API_KEY || "").trim().replace(/^["']|["']$/g, "").trim();
const clip = (s, n) => String(s ?? "").trim().slice(0, n);
const userErr = (msg, status = 400) => { const e = new Error(msg); e.user = true; e.status = status; return e; };
const DEFAULT_FACTS = (() => { try { return fs.readFileSync(path.join(__dirname, "promoFacts.md"), "utf8"); } catch { return ""; } })();
const DEFAULT_TOPICS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, "promoTopics.json"), "utf8")); } catch { return []; } })();
const LIB_IMAGES = ["real-scan.jpg", "real-board.jpg", "real-dispatch.jpg", "real-fare.jpg", "real-livemap.jpg", "real-control.jpg", "real-settle.jpg", "real-revenue.jpg", "real-revenue2.jpg", "real-approval.jpg", "real-home.jpg", "m-home.jpg", "m-board.jpg", "m-control.jpg", "m-approval.jpg", "m-driver.jpg", "m-driver-order.jpg", "m-driver-log.jpg"];
const LIB_VIDEOS = ["scan-text.webm", "scan-image.webm", "live-map.webm", "approval.webm", "d-home.webm", "d-order.webm", "d-log.webm", "m-menu.webm", "m-list.webm", "m-approval.webm", "gw-messenger.webm", "gw-mail.webm", "gw-attendance.webm"];

async function loadFacts(db) {
  try { const s = await db.doc("siteConfig/mktSettings").get(); const f = s.exists ? String(s.data().facts || "").trim() : ""; return f || DEFAULT_FACTS; } catch { return DEFAULT_FACTS; }
}

const TONE = `말투: 짧게, "~해요 / ~하면 돼요". 배차팀장 · 대표가 읽는 글. 현장 말(상차, 하차, 독차, 혼적, 지입, 용차, 계산서, 착불) 그대로 OK.
순서: 불편했던 장면 → 무엇을 누르면 → 무엇이 달라지는지.
금지: 확인 안 된 숫자 · 고객 수 · "업계 1위" · "% 절감". 예시 숫자에는 "예를 들어". 홈택스 연동은 "준비 중"이라고만. 다른 회사를 깎아내리지 않기. 실제 고객사 · 기사 이름 · 전화번호 금지.`;

const CARD = {
  type: "object", additionalProperties: false, required: ["kind", "cat", "title", "sub", "img", "label", "points"],
  properties: {
    kind: { type: "string", enum: ["cover", "shot", "points", "vs"] }, cat: { type: "string" },
    title: { type: "string", description: "강조는 **굵게**, 줄바꿈은 \\n, 3줄 이내" }, sub: { type: "string" },
    img: { type: "string", description: "사진 파일 이름(목록 중 하나) 또는 빈 문자열" }, label: { type: "string", description: "예: LogisWeb · 오더 스캔" },
    points: { type: "array", items: { type: "array", items: { type: "string" } }, description: "points 카드일 때 [제목, 짧은 설명] 4개, 아니면 빈 배열" },
  },
};
const SCHEMAS = {
  blogDraft: {
    type: "object", additionalProperties: false, required: ["title", "summary", "tags", "body", "cards"],
    properties: {
      title: { type: "string", description: "네이버 제목 35자 안팎, 검색 키워드를 앞쪽에" }, summary: { type: "string" },
      tags: { type: "array", items: { type: "string" } }, body: { type: "string", description: "마크다운 본문" },
      cards: { type: "array", items: CARD, description: "1080×1080 카드 3장: cover, shot, points 순서" },
    },
  },
  rewrite: { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } },
  titles: { type: "object", additionalProperties: false, required: ["titles"], properties: { titles: { type: "array", items: { type: "string" } } } },
  ytMeta: {
    type: "object", additionalProperties: false, required: ["title", "description", "tags"],
    properties: { title: { type: "string" }, description: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
  },
  videoScript: {
    type: "object", additionalProperties: false, required: ["title", "scenes"],
    properties: {
      title: { type: "string" },
      scenes: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["layout", "kicker", "title", "sub", "big", "items", "narration", "media"],
          properties: {
            layout: { type: "string", enum: ["title", "bubbles", "count", "media", "points", "cta"] },
            kicker: { type: "string", description: "작은 꼬리표(10자 안팎)" }, title: { type: "string", description: "화면 큰 글자, 강조는 **굵게**, 줄바꿈 \\n" },
            sub: { type: "string" }, big: { type: "string", description: "count 장면의 큰 숫자(예: 50건), 아니면 빈 문자열" },
            items: { type: "array", items: { type: "string" }, description: "bubbles: 카톡 말풍선 글, media: 체크 표시 2~5개, points: 항목(제목 | 설명)" },
            narration: { type: "string", description: "이 장면 내레이션(한두 문장)" },
            media: { type: "string", description: "media 장면이면 영상/사진 파일 이름(목록 중), 아니면 빈 문자열" },
          },
        },
      },
    },
  },
};

function promptFor(action, x, facts) {
  const imgs = `쓸 수 있는 사진: ${LIB_IMAGES.join(", ")} (m- 로 시작하면 휴대폰 화면)`;
  if (action === "blogDraft") {
    return `아래 [사실]만 사용해서 로지스웹(LogisWeb) 네이버 블로그 글 1편을 써요.
[주제] ${clip(x.topic, 200)}
[검색 키워드] ${clip(x.keywords, 120)} — 제목 앞부분, 첫 문단, 소제목 1곳에 자연스럽게
[관점] ${clip(x.angle, 300)}
${x.source ? `[참고 자료 — 이 내용을 바탕으로]\n${clip(x.source, 6000)}\n` : ""}
규칙: ${TONE}
구조: 공감되는 현장 장면 2~3문단 → "## 소제목" 3~4개 → "## 무료로 먼저 써 보세요" + 마지막 줄 "👉 무료 체험 신청: **logisweb.co.kr** (검색창에 \\"로지스웹\\")"
길이 1,500~2,200자. 마크다운은 ## 소제목, - 목록, 1. 목록, > 인용, **굵게**, 표(|)만. # 제목은 쓰지 않기.
그림 자리: 맨 위 ![대표 이미지 설명](card-1), 중간 ![설명](card-2), 뒤쪽 ![설명](card-3) 를 한 번씩.
태그 8개(로지스웹 포함). 카드 3장(cover · shot · points). ${imgs}
추천 사진: ${clip(x.img, 40) || "real-home.jpg"}

[사실]
${facts}`;
  }
  if (action === "rewrite") {
    return `다음 글을 "${clip(x.how, 60) || "더 읽기 쉽게"}" 고쳐 주세요. 뜻 · 사실은 그대로, 마크다운 형식 유지.
규칙: ${TONE}

[글]
${clip(x.text, 8000)}`;
  }
  if (action === "titles") {
    return `아래 블로그 글의 네이버 검색용 제목 5개를 추천해요. 35자 안팎, 키워드(${clip(x.keywords, 120)})를 앞쪽에, 클릭하고 싶게(과장 없이).
[글]
${clip(x.text, 5000)}`;
  }
  if (action === "ytMeta") {
    return `유튜브 ${x.format === "wide" ? "영상" : "숏츠"}의 제목 · 설명 · 태그를 만들어요.
- 제목 60자 이내${x.format === "wide" ? "" : ", 끝에 #Shorts"}
- 설명: 2~4줄 요약 + "무료 체험 👉 https://www.logisweb.co.kr/?utm_source=youtube#inquiry-form" + 해시태그 5~7개
- 태그 8~12개(한국어)
[영상 제목] ${clip(x.title, 100)}
[내레이션]
${clip(x.text, 4000)}
[사실]
${facts}`;
  }
  if (action === "videoScript") {
    const wide = x.format === "wide";
    return `로지스웹 홍보 ${wide ? "가로 영상(16:9)" : "세로 숏츠(9:16)"} 대본을 장면별로 써요. 전체 약 ${Math.max(10, Math.min(120, Number(x.seconds) || 25))}초.
[주제] ${clip(x.topic, 300)}
${x.source ? `[참고 자료]\n${clip(x.source, 6000)}\n` : ""}
규칙
- 첫 장면은 2초 안에 시선을 잡는 질문(layout title 또는 bubbles). 마지막 장면은 layout cta(title 은 짧은 마무리 한마디, narration 은 "로지스웹. 지금 무료로 써 보세요." 같은 한 줄).
- 장면 ${wide ? "6~10" : "4~7"}개, 장면 하나 내레이션은 한두 문장(3~5초 분량).
- 실제 화면을 보여 줄 장면은 layout media + media 에 파일 이름(아래 목록), items 에 체크 표시 2~5개(짧게).
- count 장면은 big 에 숫자+단위(예: "50건"), title 에 한 줄.
- 화면 글자(title)는 내레이션보다 짧게, 강조는 **굵게**.
- 쓸 수 있는 영상: ${LIB_VIDEOS.join(", ")} / ${imgs}
${TONE}
[사실]
${facts}`;
  }
  throw userErr("모르는 요청이에요.");
}

async function runPromoAi({ db, action, input }) {
  const key = cleanKey();
  if (!key) throw userErr("Claude API 키가 등록되지 않았어요(Firebase 비밀값 ANTHROPIC_API_KEY).", 500);
  if (!SCHEMAS[action]) throw userErr("모르는 요청이에요.");
  const facts = await loadFacts(db);
  const client = new Anthropic({ apiKey: key, timeout: 170000, maxRetries: 1 });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 12000,
    system: [{ type: "text", text: "당신은 화물 운송사용 배차 프로그램 로지스웹(LogisWeb)의 홍보 마케터예요. 한국어로, 사실만 씁니다.", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: promptFor(action, input || {}, facts) }],
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMAS[action] } },
  });
  const u = res?.usage || {};
  const usage = { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0 };
  if (res?.stop_reason === "refusal") throw userErr("AI가 이 내용으로는 쓰지 않았어요. 주제를 바꿔 주세요.", 422);
  if (res?.stop_reason === "max_tokens") throw userErr("답이 너무 길어 끊겼어요. 다시 눌러 주세요.", 422);
  const raw = (res?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let out; try { out = JSON.parse(raw); } catch { throw userErr("AI 답을 읽지 못했어요. 다시 눌러 주세요.", 502); }
  if (action === "blogDraft") {
    out.body = String(out.body || "").replace(/\]\(card-([123])\)/g, "](card-$1)");
    out.cards = (out.cards || []).slice(0, 3).map((c) => ({ ...c, img: LIB_IMAGES.includes(c.img) ? c.img : (input?.img || "real-home.jpg") }));
    out.tags = [...new Set([...(out.tags || []), "로지스웹"])].slice(0, 10);
  }
  return { out, usage, model: res?.model || MODEL };
}

// ── Gemini TTS ──
async function geminiKey(db) {
  const env = String(process.env.GEMINI_API_KEY || "").trim();
  if (env) return env;
  try { const s = await db.doc("platformSecrets/gemini").get(); return s.exists ? String(s.data().key || "").trim() : ""; } catch { return ""; }
}
function wavFromPcm(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
// 🔇 2026-11-24 Gemini 음성 = WAV(머리말 + data + C2PA 'AI 생성' 표시 상자) — 소리(data)만 꺼낸다.
//  예전엔 머리말 44바이트만 떼고 나머지를 소리로 읽어, 문장 끝마다 C2PA 상자(약 7.6KB)가 0.17초짜리 큰 '지직' 잡음으로 들어갔다.
function pcmOnly(buf) {
  let pcm = buf;
  if (buf.length > 12 && buf.subarray(0, 4).toString() === "RIFF") {
    pcm = buf.subarray(44);
    for (let o = 12; o + 8 <= buf.length;) {
      const id = buf.subarray(o, o + 4).toString(), sz = buf.readUInt32LE(o + 4);
      if (id === "data") { pcm = buf.subarray(o + 8, Math.min(buf.length, o + 8 + sz)); break; }
      o += 8 + sz + (sz & 1);
    }
  }
  const i = pcm.indexOf("C2PA");
  if (i > 0 && pcm.subarray(i + 12, i + 16).toString() === "jumb") pcm = pcm.subarray(0, i - (i % 2));
  return pcm;
}
// 앞뒤 조용한 부분 잘라 내기(말 시작이 장면 시작에 딱 맞게)
function trimSilence(pcm) {
  const n = pcm.length >> 1; const th = 700; let a = 0, b = n - 1;
  while (a < n && Math.abs(pcm.readInt16LE(a * 2)) < th) a++;
  while (b > a && Math.abs(pcm.readInt16LE(b * 2)) < th) b--;
  a = Math.max(0, a - 1200); b = Math.min(n - 1, b + 2400);
  return pcm.subarray(a * 2, (b + 1) * 2);
}
const TTS_MODELS = ["gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-pro-preview-tts"];
async function runTts({ db, text, voice, style }) {
  const key = await geminiKey(db);
  if (!key) throw userErr("Gemini API 키가 없어요. 관리자센터 › 홍보 › 홍보 설정에서 키를 넣어 주세요.", 412);
  const t = clip(text, 600); if (!t) throw userErr("읽을 글이 없어요.");
  const v = /^[A-Za-z]{3,20}$/.test(String(voice || "")) ? voice : "Puck";
  const body = JSON.stringify({
    contents: [{ parts: [{ text: style ? `${clip(style, 200)}: ${t}` : t }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v } } } },
  });
  let last = "";
  for (const m of TTS_MODELS) {
    for (let a = 0; a < 2; a++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body });
      if (r.ok) {
        const j = await r.json();
        const d = j?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
        if (!d) { last = "음성이 비어 있어요"; break; }
        const pcm = trimSilence(pcmOnly(Buffer.from(d, "base64")));
        return { wav: wavFromPcm(pcm).toString("base64"), dur: Math.round((pcm.length / 2 / 24000) * 100) / 100, model: m, voice: v };
      }
      last = `${r.status} ${(await r.text()).slice(0, 200)}`;
      if (r.status === 400 && /API key/i.test(last)) throw userErr("Gemini API 키가 맞지 않아요. 홍보 설정에서 다시 넣어 주세요.", 412);
      if (r.status === 404 || r.status === 400) break;
      if (r.status === 429) await new Promise((s) => setTimeout(s, 4000 * (a + 1)));
    }
  }
  throw userErr(`음성을 만들지 못했어요(${last.slice(0, 120)})`, 502);
}

// ── 매주 자동 초안 ──
const kstDay = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
async function weeklyDraft({ db, FieldValue, force = false }) {
  const st = await db.doc("siteConfig/mktSettings").get().catch(() => null);
  const s = st?.exists ? st.data() : {};
  if (s.autoDraft === false && !force) return { skipped: "자동 초안 꺼짐" };
  const today = kstDay(); const d = new Date(today + "T00:00:00Z"); const dow = (d.getUTCDay() + 6) % 7;
  const base = Date.parse(today + "T00:00:00Z");
  const mon = new Date(base - dow * 864e5).toISOString().slice(0, 10), sun = new Date(base + (6 - dow) * 864e5).toISOString().slice(0, 10);
  const all = await db.collection("mktBlog").get();
  const posts = all.docs.map((x) => x.data());
  if (!force && posts.some((p) => p.date >= mon && p.date <= sun)) return { skipped: "이번 주 글 있음" };
  const topics = Array.isArray(s.topics) && s.topics.length ? s.topics : DEFAULT_TOPICS;
  const used = new Set(posts.map((p) => p.slug));
  const topic = topics.find((t) => t && t.slug && !used.has(t.slug) && !t.done);
  if (!topic) return { skipped: "남은 주제 없음" };
  const { out, usage } = await runPromoAi({ db, action: "blogDraft", input: topic });
  const ref = db.collection("mktBlog").doc();
  await ref.set({
    title: clip(out.title, 120), slug: topic.slug, date: today, status: "review", keywords: clip(topic.keywords, 200),
    tags: out.tags, summary: clip(out.summary, 300), body: String(out.body || ""), cards: out.cards,
    auto: "weekly", naverDone: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection("aiTeamLogs").add({ team: "marketing", question: `[매주 블로그 초안] ${topic.title}`, answer: clip(out.title, 300), tools: ["blog"], usage, model: MODEL, at: FieldValue.serverTimestamp() }).catch(() => {});
  return { id: ref.id, title: out.title };
}

module.exports = { runPromoAi, runTts, weeklyDraft, geminiKey, DEFAULT_TOPICS, LIB_IMAGES, LIB_VIDEOS, MODEL };
