// ======================= functions/aiVideo.js =======================
// 🎬 2026-11-18 AI 본부 › 홍보팀 "영상 작업실" — 숏츠 · 교육영상 기획 + 배경음악 큐시트 + 자막(SRT)
//  사용자 요청: 홍보팀 AI와 협업해 숏츠 · 교육영상을 만들고, 배경음악을 조율하고 싶다(1 · 2 · 3번부터)
//   ① 기획: 주제 · 길이 · 대상 · 분위기 → 장면별 대본 · 화면 구성 · 자막
//   ② 배경음악 큐시트: 장면마다 분위기 · 빠르기(BPM) · 볼륨(말할 때 낮춤) · 무료 음원 검색어
//   ③ 자막: 장면 시간에 맞춘 자막 줄(브라우저가 SRT 파일로 만든다 — src/videoStudio.js)
//  · 데이터 조회 도구 없이 한 번 부르는 구조화 출력(JSON 스키마) — 대화형보다 싸고 빠르다
//  · 음악을 새로 만들거나 영상을 편집하지는 않는다(Claude는 글 · 계획만). 음원은 저작권 걱정 없는 무료 라이브러리 검색어로 안내
const AnthropicMod = require("@anthropic-ai/sdk");
const Anthropic = AnthropicMod.default || AnthropicMod;

const MODEL = "claude-sonnet-5-5";
const cleanKey = () => String(process.env.ANTHROPIC_API_KEY || "").trim().replace(/^["']|["']$/g, "").trim();

const KINDS = ["숏츠", "교육영상", "홍보영상"];
const clip = (s, n) => String(s ?? "").trim().slice(0, n);

// 화면에서 받은 조건 다듬기(이상한 값은 기본값으로)
function cleanInput(x = {}) {
  const sec = Math.round(Number(x.seconds) || 0);
  return {
    kind: KINDS.includes(x.kind) ? x.kind : "숏츠",
    topic: clip(x.topic, 300),
    seconds: Math.min(900, Math.max(10, sec || 60)),
    audience: clip(x.audience, 60) || "화주 · 물류 담당자",
    mood: clip(x.mood, 60) || "신뢰감",
    platform: clip(x.platform, 60) || "유튜브 쇼츠",
    narration: x.narration === "자막만" ? "자막만" : "내레이션",
    notes: clip(x.notes, 1200),
    company: clip(x.company, 60),
  };
}

const SYSTEM = `당신은 물류 · 운송 회사(배차 프로그램 LogisWeb을 쓰는 운송사)의 홍보팀 영상 PD예요.
숏츠 · 교육영상 · 홍보영상을 기획하고, 장면마다 배경음악을 어떻게 깔지(큐시트)와 자막까지 정해요.

규칙
- 한국어로, 짧고 쉬운 말. 자막 한 줄은 16자 안팎(숏츠는 12자 안팎), 한 화면에 2줄까지.
- 장면 시간(start · end 초)은 0부터 빈틈없이 이어지고 마지막 end 는 전체 길이와 같아야 해요.
- 숏츠: 첫 2초 안에 시선을 잡는 한 줄(hook), 장면 2~5초, 세로 화면(9:16) 기준 구도.
- 교육영상: 목표 → 순서(1 · 2 · 3) → 주의할 점 → 정리, 장면 8~20초, 가로 화면(16:9).
- 배경음악: 저작권 걱정 없는 무료 음원(유튜브 오디오 보관함 · Pixabay Music 등)에서 찾을 수 있는 검색어(영문 키워드)를 줘요. 곡 이름을 지어내지 말고 분위기 · 장르 · BPM 으로 설명해요.
- 볼륨은 0~100 숫자. 내레이션이 나오는 장면은 음악을 15~25 로 낮추고(말소리 우선), 말이 없는 장면 · 마무리는 40~60.
- 운송 현장 안전(지게차 · 상하차 · 적재 · 결박)을 다룰 때는 실제로 위험한 행동을 권하지 않아요.
- 회사 이름 · 숫자는 사용자가 준 것만 쓰고, 모르는 실적 숫자는 지어내지 않아요.`;

const SCENE = {
  type: "object",
  additionalProperties: false,
  required: ["no", "start", "end", "title", "visual", "narration", "subtitles", "bgm"],
  properties: {
    no: { type: "integer" },
    start: { type: "number" },
    end: { type: "number" },
    title: { type: "string", description: "장면 이름(짧게)" },
    visual: { type: "string", description: "화면에 보일 것 · 촬영 구도 · 화면 글자" },
    narration: { type: "string", description: "내레이션 대본(자막만이면 빈 문자열)" },
    subtitles: { type: "array", items: { type: "string" }, description: "이 장면에 순서대로 나올 자막 줄" },
    bgm: {
      type: "object",
      additionalProperties: false,
      required: ["track", "volume", "action"],
      properties: {
        track: { type: "string", description: "tracks[].id 중 하나" },
        volume: { type: "integer", description: "0~100" },
        action: { type: "string", description: "시작 · 유지 · 서서히 커짐 · 서서히 작아짐 · 멈춤 · 바뀜 중 하나 + 짧은 설명" },
      },
    },
  },
};
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "hook", "summary", "format", "tracks", "scenes", "captions", "hashtags", "thumbnails", "tips"],
  properties: {
    title: { type: "string" },
    hook: { type: "string", description: "첫 2초 한 줄" },
    summary: { type: "string", description: "이 영상이 전하는 것(두 문장 이내)" },
    format: { type: "string", description: "화면 비율 · 길이 · 편집 리듬" },
    tracks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "mood", "genre", "bpm", "keywords", "where"],
        properties: {
          id: { type: "string", description: "A · B · C 처럼 짧게" },
          mood: { type: "string" },
          genre: { type: "string" },
          bpm: { type: "integer" },
          keywords: { type: "array", items: { type: "string" }, description: "무료 음원 사이트 검색어(영문)" },
          where: { type: "string", description: "어느 장면에 쓰는지" },
        },
      },
    },
    scenes: { type: "array", items: SCENE },
    captions: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["platform", "text"], properties: { platform: { type: "string" }, text: { type: "string" } } },
      description: "올릴 곳별 설명 글",
    },
    hashtags: { type: "array", items: { type: "string" } },
    thumbnails: { type: "array", items: { type: "string" }, description: "썸네일 문구 후보 3개" },
    tips: { type: "array", items: { type: "string" }, description: "촬영 · 편집 팁 3~5개" },
  },
};

function userMessage(inp) {
  return [
    `[만들 영상] ${inp.kind} · ${inp.seconds}초 · ${inp.platform}`,
    `[주제] ${inp.topic || "(주제 없음 — 운송사 홍보에 맞게 정해 주세요)"}`,
    `[보는 사람] ${inp.audience}`,
    `[분위기] ${inp.mood}`,
    `[소리] ${inp.narration === "자막만" ? "내레이션 없이 자막 + 음악만" : "내레이션 + 자막 + 음악"}`,
    inp.company ? `[회사 이름] ${inp.company}` : "",
    inp.notes ? `[덧붙임]\n${inp.notes}` : "",
    "",
    "위 조건으로 기획안 · 배경음악 큐시트 · 자막을 JSON 으로 주세요.",
  ].filter(Boolean).join("\n");
}

// 장면 시간 바로잡기 — 0부터 이어지고 마지막이 전체 길이와 같게(모델이 조금 어긋나도 자막 파일이 깨지지 않게)
function fixScenes(scenes, total) {
  const list = (Array.isArray(scenes) ? scenes : []).filter((s) => s && typeof s === "object").slice(0, 60);
  if (!list.length) return [];
  let t = 0;
  return list.map((s, i) => {
    const want = Math.max(1, (Number(s.end) || 0) - (Number(s.start) || 0));
    const start = t;
    // 🛠 2026-11-24 장면이 많으면 남은 자리(total - 남은 장면 수)가 start 보다 작아져 끝 < 시작(0초 · 거꾸로 된 자막)이 나왔다 → 최소 1초
    const end = i === list.length - 1 ? Math.max(start + 1, total) : Math.max(start + 1, Math.min(total - (list.length - 1 - i), start + want));
    t = end;
    const vol = Math.max(0, Math.min(100, Math.round(Number(s.bgm?.volume) || 0)));
    return {
      no: i + 1, start, end,
      title: clip(s.title, 60), visual: clip(s.visual, 400), narration: clip(s.narration, 600),
      subtitles: (Array.isArray(s.subtitles) ? s.subtitles : []).map((x) => clip(x, 60)).filter(Boolean).slice(0, 8),
      bgm: { track: clip(s.bgm?.track, 8), volume: vol, action: clip(s.bgm?.action, 80) },
    };
  });
}

async function runVideoPlan({ input, bumpUsage }) {
  const key = cleanKey();
  if (!key) { const e = new Error("Claude API 키가 등록되지 않았어요"); e.status = 500; e.user = true; throw e; }
  const inp = cleanInput(input);
  const client = new Anthropic({ apiKey: key, timeout: 170000, maxRetries: 1 });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage(inp) }],
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
  });
  const u = res?.usage || {};
  const usage = { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0 };
  bumpUsage?.(usage);
  if (res?.stop_reason === "refusal") { const e = new Error("AI가 이 주제로는 기획하지 않았어요. 주제를 바꿔 주세요."); e.status = 422; e.user = true; throw e; }
  if (res?.stop_reason === "max_tokens") { const e = new Error("기획안이 너무 길어 끊겼어요. 길이를 줄여 다시 해 주세요."); e.status = 422; e.user = true; throw e; }
  const raw = (res?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let plan;
  try { plan = JSON.parse(raw); } catch { const e = new Error("AI 답을 읽지 못했어요. 다시 눌러 주세요."); e.status = 502; e.user = true; throw e; }
  plan.scenes = fixScenes(plan.scenes, inp.seconds);
  plan.tracks = (Array.isArray(plan.tracks) ? plan.tracks : []).slice(0, 6);
  return { plan, input: inp, usage, model: res?.model || MODEL };
}

module.exports = { runVideoPlan, cleanInput, fixScenes, SCHEMA, KINDS, MODEL };
