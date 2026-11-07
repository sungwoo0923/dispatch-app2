// ======================= functions/orderScan.js =======================
// 🧠 2026-11-07 오더 스캔 정밀 인식(서버) — 화면 설명은 src/OrderScanModal.jsx · src/orderScanAi.js 맨 위
//  · orderScanOcr     캡처 이미지 → Google Cloud Vision(DOCUMENT_TEXT_DETECTION, 한·영) → 글 + 줄 위치(스캔 화면 줄 상자)
//  · orderScanExtract 오더 글 → Claude(Haiku)가 배차 등록 칸으로 정리(JSON 스키마 · 칸마다 확신도)
//  · 둘 다 로그인 + 승인된 사람만(배차 프로그램 직원 · 허브 승인 회원), 사람마다 하루 횟수 제한(scanUsage, 서버만 읽고 씀)
//  · 이 함수가 실패해도 화면은 예전 방식(브라우저 글자 인식 tesseract + 규칙 인식기)으로 그대로 동작한다
//  · Claude API 키: Firebase 비밀값 ANTHROPIC_API_KEY(aiTeams와 같은 키) · Vision: 이 프로젝트의 Cloud Vision API 사용 설정
const AnthropicMod = require("@anthropic-ai/sdk");
const Anthropic = AnthropicMod.default || AnthropicMod;

const MODEL = "claude-haiku-5-5"; // 빠르고 싼 칸 정리용(요청: 최신 Haiku)
const SUPER_EMAIL = "tjddnqkf@naver.com";
const LIMITS = { ocr: 200, extract: 400 }; // 사람마다 하루(한국 날짜)
const MAX_IMAGE_B64 = 4 * 1024 * 1024; // 화면이 2000px JPEG로 줄여 보낸다(보통 0.3~1MB)
const MAX_TEXT = 6000;

const kstYmd = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function companyKeyOf(m, uid) {
  if (m?.companyKey) return m.companyKey;
  if (m?.source && m.source !== "signup") return `lw:${m.companyName || ""}`;
  const d = String(m?.bizNo || "").replace(/[^\d]/g, "");
  return d ? `biz:${d}` : `uid:${uid}`;
}

class ScanError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// 로그인한 사람이 쓸 수 있는지 → { kind: "lw" | "hub", key: 회사 키 }
async function scanUserOf(db, auth) {
  const uid = auth?.uid;
  if (!uid) throw new ScanError("unauthenticated", "로그인이 필요해요");
  const email = auth.token?.email || "";
  const u = await db.collection("users").doc(uid).get();
  if (u.exists) {
    const d = u.data() || {};
    const okUser = email === SUPER_EMAIL || d.role === "totalMaster"
      || (d.approved !== false && d.employmentStatus !== "퇴사" && d.role !== "cafeUser");
    if (okUser) {
      const co = d.role === "shipper" ? (d.companyName || "") : (d.companyName || "돌캐");
      if (d.role !== "totalMaster" && email !== SUPER_EMAIL && co) {
        const plan = await db.collection("companyPlans").doc(co).get().catch(() => null);
        if (plan?.exists && plan.data()?.status === "ended") throw new ScanError("permission-denied", "계약이 끝난 회사는 쓸 수 없어요");
      }
      return { kind: "lw", key: `lw:${co}` };
    }
  }
  const m = await db.collection("hubMembers").doc(uid).get();
  if (m.exists && m.data()?.status === "approved") return { kind: "hub", key: companyKeyOf(m.data(), uid) };
  if (email === SUPER_EMAIL) return { kind: "lw", key: "lw:돌캐" };
  throw new ScanError("permission-denied", "승인된 계정만 쓸 수 있어요");
}

// 하루 횟수 제한(트랜잭션) — 넘으면 resource-exhausted(화면은 기본 인식으로 넘어간다)
async function takeQuota(db, uid, kind, now = Date.now()) {
  const ref = db.collection("scanUsage").doc(`${uid}_${kstYmd(now).replace(/-/g, "")}`);
  const limit = LIMITS[kind];
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const used = Number(s.exists ? s.data()?.[kind] || 0 : 0);
    if (used >= limit) throw new ScanError("resource-exhausted", "오늘 정밀 인식을 다 썼어요. 내일 다시 쓸 수 있어요");
    tx.set(ref, { uid, date: kstYmd(now), [kind]: used + 1, updatedAt: now }, { merge: true });
    return limit - used - 1;
  });
}

// ── Vision 결과 → 줄(글 + 위치) ──
function visionToLines(annotation) {
  const lines = [];
  const pages = annotation?.fullTextAnnotation?.pages || [];
  let cur = null;
  const flush = () => { if (cur && cur.text.trim()) lines.push({ text: cur.text.replace(/\s+/g, " ").trim(), bbox: cur.bbox }); cur = null; };
  const grow = (vs) => {
    const xs = (vs || []).map((p) => p.x || 0); const ys = (vs || []).map((p) => p.y || 0);
    if (!xs.length) return;
    const b = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    if (!cur.bbox) cur.bbox = b;
    else cur.bbox = { x0: Math.min(cur.bbox.x0, b.x0), y0: Math.min(cur.bbox.y0, b.y0), x1: Math.max(cur.bbox.x1, b.x1), y1: Math.max(cur.bbox.y1, b.y1) };
  };
  for (const pg of pages) {
    for (const bl of pg.blocks || []) {
      for (const pa of bl.paragraphs || []) {
        for (const w of pa.words || []) {
          if (!cur) cur = { text: "", bbox: null };
          grow(w.boundingBox?.vertices);
          for (const sy of w.symbols || []) {
            cur.text += sy.text || "";
            const br = sy.property?.detectedBreak?.type;
            if (br === "SPACE" || br === "SURE_SPACE") cur.text += " ";
            else if (br === "EOL_SURE_SPACE" || br === "LINE_BREAK" || br === "HYPHEN") flush();
          }
        }
        flush();
      }
    }
  }
  const pg0 = pages[0] || {};
  const text = lines.length ? lines.map((l) => l.text).join("\n") : String(annotation?.fullTextAnnotation?.text || annotation?.textAnnotations?.[0]?.description || "").trim();
  return { text, lines, width: pg0.width || 0, height: pg0.height || 0 };
}

async function runOcr({ db, getVisionClient, bumpVision, auth, data, now = Date.now() }) {
  const who = await scanUserOf(db, auth);
  const content = String(data?.image || "").replace(/^data:[^,]+,/, "");
  if (!content) throw new ScanError("invalid-argument", "이미지가 없어요");
  if (content.length > MAX_IMAGE_B64) throw new ScanError("invalid-argument", "이미지가 너무 커요");
  if (!/^[A-Za-z0-9+/=\s]+$/.test(content.slice(0, 2000))) throw new ScanError("invalid-argument", "이미지 형식이 맞지 않아요");
  const left = await takeQuota(db, auth.uid, "ocr", now);
  const client = await getVisionClient();
  let r;
  try {
    r = await client.request({
      url: "https://vision.googleapis.com/v1/images:annotate", method: "POST",
      data: { requests: [{ image: { content }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }], imageContext: { languageHints: ["ko", "en"] } }] },
    });
  } catch (e) {
    const msg = String(e?.response?.data?.error?.message || e?.message || e);
    console.error("[오더 스캔] Vision 호출 실패:", msg);
    throw new ScanError("unavailable", /disabled|has not been used|SERVICE_DISABLED/i.test(msg) ? "Cloud Vision API가 꺼져 있어요" : "글자 인식 서버에 연결하지 못했어요");
  }
  bumpVision?.("ocr");
  const a = r?.data?.responses?.[0] || {};
  if (a.error) throw new ScanError("unavailable", a.error.message || "글자 인식에 실패했어요");
  const out = visionToLines(a);
  return { ...out, engine: "vision", left, companyKey: who.key };
}

// ── Claude 칸 정리 ──
const FIELD_DOC = [
  ["거래처명", "오더를 맡긴 회사(화주·의뢰처·고객사). 운송사 자신이나 기사 이름이 아님"],
  ["상차일", "YYYY-MM-DD. '오늘·금일·당일'·'내일·익일'·'모레'·'10/29'·'29일'은 아래 [오늘] 기준으로 바꾼다"],
  ["상차시간", "HH:MM(24시간). '까지'면 뒤에 ' 이전', '부터·이후'면 ' 이후'. '즉시'면 즉시. 오전/오후 표기가 없고 1~6시면 오후로 보되 확신도를 낮춘다"],
  ["상차지명", "상차(출발·출고·픽업) 장소의 업체·창고 이름(주소 말고)"],
  ["상차지주소", "상차 주소(시·도부터, 번지·건물번호까지 원문 그대로)"],
  ["상차지담당자", "상차지 담당자 이름(직함 빼고)"],
  ["상차지담당자번호", "상차지 담당자 전화번호(010-1234-5678 꼴)"],
  ["상차방법", "지게차·수작업·크레인·호이스트·컨베이어 중 하나 또는 원문 짧게"],
  ["하차일", "YYYY-MM-DD. '당착'이면 상차일과 같게, '익착·내일 하차'면 상차일 다음 날"],
  ["하차시간", "상차시간과 같은 꼴"],
  ["하차지명", "하차(도착·납품·배송·입고) 장소의 업체·센터 이름"],
  ["하차지주소", "하차 주소"],
  ["하차지담당자", "하차지 담당자·인수자 이름"],
  ["하차지담당자번호", "하차지 담당자 전화번호"],
  ["하차방법", "상차방법과 같은 꼴"],
  ["화물내용", "품목 + 수량(예: 생활용품 14파레트, 냉동식품 200박스)"],
  ["화물수량", "파레트·박스 수만 숫자로(예: 14)"],
  ["화물단위", "파레트·박스·통 중 하나"],
  ["중량", "화물 무게(예: 600kg, 3.5톤). 차량 톤수와 헷갈리지 않게"],
  ["차량톤수", "필요한 차량 톤수(예: 1톤, 2.5톤, 5톤, 5톤축, 11톤, 25톤)"],
  ["차량종류", "카고·윙바디·탑차·냉장탑·냉동탑·냉장윙·냉동윙·냉장/냉동탑·냉장/냉동윙·윙/카고·리프트·라보/다마스·오토바이·츄레라·덤프 중 하나"],
  ["청구운임", "화주에게 받는 운임(원, 숫자만. '32만'이면 320000)"],
  ["기사운임", "기사에게 주는 운임이 따로 적혀 있을 때만(원, 숫자만)"],
  ["지급방식", "계산서·착불·선불·계좌이체·인수증 중 하나"],
  ["혼적", "혼적·합짐이면 예, 아니면 빈칸"],
  ["긴급", "긴급·급건이면 예"],
  ["운행유형", "왕복이면 왕복, 아니면 빈칸"],
  ["메모", "위 칸에 들어가지 않는 기사님 안내·요청사항 요약(짧게)"],
];
const FIELD_KEYS = FIELD_DOC.map(([k]) => k);
const SCHEMA = {
  type: "object",
  properties: Object.fromEntries(FIELD_KEYS.map((k) => [k, {
    type: "object",
    properties: { v: { type: "string" }, c: { type: "number" } },
    required: ["v", "c"],
    additionalProperties: false,
  }])),
  required: FIELD_KEYS,
  additionalProperties: false,
};
// 바뀌지 않는 지시문(프롬프트 캐시) — 오늘 날짜·예시·원문은 사용자 메시지로만 보낸다
const SYSTEM = [
  "너는 한국 화물 운송 배차 프로그램의 오더 정리 담당이다.",
  "화주·주선사가 카카오톡·문자·메일·엑셀 캡처(글자 인식 결과)로 보낸 오더 글을 읽고 배차 등록 칸으로 나눈다.",
  "",
  "규칙",
  "- 칸마다 v(값)와 c(확신도 0~1)를 준다. 글에 없는 칸은 v를 빈 문자열, c는 1로 둔다(없다는 것이 확실하면).",
  "- 원문에 있는 내용만 쓴다. 추측으로 채운 값은 c를 0.5 이하로 둔다. 글자 인식 오타(예: O1O → 010)는 고쳐도 된다.",
  "- 라벨이 업체마다 다르다: 출발지·출고지·픽업·발송처·상차처 = 상차, 도착지·납품처·배송지·입고처·착지 = 하차.",
  "- 라벨이 없으면 'A → B'의 A가 상차, B가 하차. 주소가 둘이면 먼저 나온 것이 상차인 경우가 많다(확신도 낮춤).",
  "- 장소명과 주소를 나눈다. 장소명 칸에 주소를, 주소 칸에 업체명을 넣지 않는다.",
  "- 전화번호는 그 줄·그 구역(상차/하차)의 담당자 것으로 넣는다. 구역을 모르면 확신도를 낮춘다.",
  "- 금액은 원 단위 숫자만(쉼표·원 없이). 10만 미만 숫자가 '만' 없이 오면 운임인지 확인하고 아니면 비운다.",
  "- 여러 오더가 섞여 있으면 첫 번째 오더만 정리한다.",
  "- [예시]가 있으면 같은 회사가 예전에 직접 고친 결과다. 같은 양식이면 예시의 칸 나누기 방식을 그대로 따른다.",
  "",
  "칸 설명",
  ...FIELD_DOC.map(([k, d]) => `- ${k}: ${d}`),
].join("\n");

function buildUserMessage({ text, today, examples }) {
  const d = new Date(`${today}T00:00:00Z`);
  const parts = [`[오늘] ${today} (${WEEK[d.getUTCDay()]}요일, 한국 시간)`];
  (examples || []).slice(0, 3).forEach((ex, i) => {
    parts.push(`[예시 ${i + 1} 원문]\n${String(ex.text || "").slice(0, 1500)}\n[예시 ${i + 1} 정답]\n${JSON.stringify(ex.fields || {})}`);
  });
  parts.push(`[정리할 오더 원문]\n${text}`);
  return parts.join("\n\n");
}
function cleanExamples(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 3).map((ex) => {
    const fields = {};
    Object.entries(ex?.fields || {}).forEach(([k, v]) => { if (FIELD_KEYS.includes(k) && v != null && String(v).trim()) fields[k] = String(v).slice(0, 200); });
    return { text: String(ex?.text || "").slice(0, 1500), fields };
  }).filter((ex) => ex.text.trim() && Object.keys(ex.fields).length);
}

async function runExtract({ db, makeAnthropic, bumpUsage, auth, data, now = Date.now() }) {
  const who = await scanUserOf(db, auth);
  const text = String(data?.text || "").replace(/\r/g, "").trim();
  if (text.length < 4) throw new ScanError("invalid-argument", "글이 너무 짧아요");
  if (text.length > MAX_TEXT) throw new ScanError("invalid-argument", "글이 너무 길어요");
  const client = makeAnthropic();
  if (!client) throw new ScanError("failed-precondition", "AI 키가 등록되지 않았어요");
  const left = await takeQuota(db, auth.uid, "extract", now);
  const today = kstYmd(now);
  const examples = cleanExamples(data?.examples);
  let res;
  try {
    res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000, // 생각 + JSON(28칸)이 들어갈 만큼
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildUserMessage({ text, today, examples }) }],
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    });
  } catch (e) {
    const code = e instanceof Anthropic.RateLimitError ? "resource-exhausted"
      : e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError ? "failed-precondition"
        : e instanceof Anthropic.BadRequestError ? "invalid-argument"
          : "unavailable";
    console.error("[오더 스캔] Claude 호출 실패:", e?.status || "", e?.message || e);
    throw new ScanError(code, "AI 정리에 실패했어요");
  }
  const u = res?.usage || {};
  bumpUsage?.({ input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0 });
  if (res?.stop_reason === "refusal") throw new ScanError("unavailable", "AI가 이 글을 정리하지 않았어요");
  if (res?.stop_reason === "max_tokens") throw new ScanError("unavailable", "AI 답이 끊겼어요");
  const raw = (res?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let fields;
  try { fields = JSON.parse(raw); } catch { throw new ScanError("unavailable", "AI 답을 읽지 못했어요"); }
  const out = {};
  FIELD_KEYS.forEach((k) => {
    const f = fields?.[k];
    if (f && typeof f === "object") out[k] = { v: String(f.v ?? "").slice(0, 300), c: Math.max(0, Math.min(1, Number(f.c) || 0)) };
  });
  return { fields: out, engine: "claude", model: res?.model || MODEL, today, left, companyKey: who.key, usedExamples: examples.length };
}

module.exports = { Anthropic, runOcr, runExtract, visionToLines, scanUserOf, takeQuota, companyKeyOf, ScanError, SCHEMA, SYSTEM, FIELD_KEYS, MODEL, LIMITS, buildUserMessage, cleanExamples };
