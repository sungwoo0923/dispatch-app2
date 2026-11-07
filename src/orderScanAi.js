// ======================= src/orderScanAi.js =======================
// 🧠 2026-11-07 오더 스캔 정밀 인식 — 화면·서버와 떨어진 순수 계산(테스트: scripts/orderScanAi.test.mjs)
//  1) AI 칸 정리 결과(서버 orderScanExtract)를 배차 등록 칸 모양으로 맞춘다(날짜는 한국 날짜 기준, 톤수·차종은 목록 값, 금액은 숫자)
//  2) 규칙 인식기(orderScanParser) 결과와 합친다 — AI가 자신 있으면 AI, 아니면 규칙 결과. 애매한 칸은 check(노란 칸)
//  3) 회사별 학습 — 사용자가 고친 내용을 양식(템플릿) 지문과 함께 기억했다가
//     다음에 비슷한 양식이 오면 예시로 넘기고(few-shot), 라벨 바꾸기 · 이름 바꾸기를 그대로 적용한다
import { findDate, findTime, findVehicle, findPhones, findFare } from "./orderScanParser.js";

// AI에게 받는 칸(배차 등록 칸 이름). 메모는 인식기의 메모추가 칸으로 들어간다.
export const AI_FIELDS = [
  "거래처명", "상차일", "상차시간", "상차지명", "상차지주소", "상차지담당자", "상차지담당자번호", "상차방법",
  "하차일", "하차시간", "하차지명", "하차지주소", "하차지담당자", "하차지담당자번호", "하차방법",
  "화물내용", "화물수량", "화물단위", "중량", "차량톤수", "차량종류", "청구운임", "기사운임", "지급방식",
  "혼적", "긴급", "운행유형", "메모",
];
export const VEHICLE_LIST = ["라보/다마스", "카고", "윙/카고", "윙바디", "리프트", "탑차", "냉장탑", "냉동탑", "냉장윙", "냉동윙", "냉장/냉동탑", "냉장/냉동윙", "오토바이", "츄레라", "덤프"];
export const PAY_LIST = ["계산서", "착불", "선불", "계좌이체", "인수증"];
export const AI_CONF_OK = 0.75; // 이 이상이면 AI 값을 믿는다

const pad = (n) => String(n).padStart(2, "0");
// 한국 날짜(Asia/Seoul) 기준 오늘 — 서버·브라우저 시간대와 상관없이
export function kstToday(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600e3);
  return new Date(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate());
}
const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ── 1) 값 맞추기 ──
export function normDate(v, today = kstToday()) {
  const s = String(v || "").trim();
  if (!s) return "";
  const m = s.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) { const mo = +m[2], d = +m[3]; return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${m[1]}-${pad(mo)}-${pad(d)}` : ""; }
  const f = findDate(s, today);
  return f ? f.value : "";
}
// "14:00" · "오후 2시" · "14:00 이전" → 인식기와 같은 "오후 2시"(+ 기준 이전/이후)
export function normTime(v) {
  const s = String(v || "").trim();
  if (!s) return { value: "", basis: null };
  if (/즉시|바로|asap/i.test(s) && !/\d/.test(s)) return { value: "", basis: null, note: "즉시" };
  const t = findTime(s.replace(/(\d{1,2}):(\d{2})/, "$1:$2"));
  return t?.value ? { value: t.value, basis: t.basis || null } : { value: "", basis: null };
}
export function normTon(v) {
  const s = String(v || "").replace(/\s+/g, "");
  if (!s) return "";
  if (/kg|키로|킬로/i.test(s)) return "";
  const m = s.match(/(\d{1,2}(?:\.\d)?)(?:톤|t|T)?(축)?/);
  if (!m) return "";
  const n = Number(m[1]);
  if (!(n > 0 && n <= 30)) return "";
  return `${n}톤${m[2] || /축/.test(s) ? "축" : ""}`;
}
export function normVehicle(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  const c = s.replace(/\s+/g, "");
  if (VEHICLE_LIST.includes(c)) return c;
  if (/^탑$/.test(c)) return "탑차";
  if (/라보|다마스/.test(c)) return "라보/다마스";
  if (/츄레라|추레라|트레일러/.test(c)) return "츄레라";
  if (/덤프/.test(c)) return "덤프";
  const f = findVehicle(c);
  return f?.type && VEHICLE_LIST.includes(f.type) ? f.type : "";
}
export function normAmount(v) {
  if (typeof v === "number") return v > 0 && v < 100000000 ? Math.round(v) : 0;
  const s = String(v || "").trim();
  if (!s) return 0;
  if (/^\d[\d,]*$/.test(s)) { const n = Number(s.replace(/,/g, "")); return n >= 1000 && n < 100000000 ? n : 0; }
  return findFare(s, true) || 0;
}
export function normPay(v) {
  const s = String(v || "").replace(/\s+/g, "");
  if (!s) return "";
  const hit = PAY_LIST.find((p) => s.includes(p));
  if (hit) return hit;
  if (/현불|현장결제|현금/.test(s)) return "선불";
  if (/세금계산서|세계|계산/.test(s)) return "계산서";
  if (/이체|입금|송금/.test(s)) return "계좌이체";
  return "";
}
export function normPhone(v) {
  // 글자 인식 오타(O1O-1234-5678 · 0l0) → 숫자
  const s = String(v || "").replace(/[Oo](?=[\d-]*\d)|(?<=\d-?)[Oo]/g, "0").replace(/(?<=\d-?)[lI|]|[lI|](?=-?\d)/g, "1");
  const p = findPhones(s)[0];
  return p ? p.phone : "";
}
const truthy = (v) => /^(y|yes|true|1|예|네|o|혼적|긴급|있음)$/i.test(String(v || "").trim());
const clamp01 = (n) => (Number.isFinite(Number(n)) ? Math.max(0, Math.min(1, Number(n))) : 0);

// 서버 결과 { 칸: { v, c } } → { 칸: { value, conf(0~1), basis? } } (값이 없거나 형식이 틀리면 빠진다)
export function normalizeAiFields(raw, { today = kstToday() } = {}) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  const put = (k, value, c, extra) => { if (value === "" || value === 0 || value == null || value === false) return; out[k] = { value, conf: clamp01(c), ...extra }; };
  for (const k of AI_FIELDS) {
    const f = raw[k];
    if (!f) continue;
    const v = typeof f === "object" ? f.v ?? f.value : f;
    const c = typeof f === "object" ? f.c ?? f.confidence ?? 0.5 : 0.5;
    const s = typeof v === "string" ? v.trim().slice(0, 300) : v;
    switch (k) {
      case "상차일": case "하차일": put(k, normDate(s, today), c); break;
      case "상차시간": case "하차시간": { const t = normTime(s); put(k, t.value, c, t.basis ? { basis: t.basis } : undefined); break; }
      case "상차지담당자번호": case "하차지담당자번호": put(k, normPhone(s), c); break;
      case "차량톤수": put(k, normTon(s), c); break;
      case "차량종류": put(k, normVehicle(s), c); break;
      case "청구운임": case "기사운임": put(k, normAmount(s), c); break;
      case "지급방식": put(k, normPay(s), c); break;
      case "화물수량": { const n = String(s || "").match(/\d+(?:\.\d+)?/); put(k, n ? n[0] : "", c); break; }
      case "화물단위": put(k, ["파레트", "박스", "통"].find((u) => String(s || "").includes(u.slice(0, 2))) || "", c); break;
      case "중량": { const m = String(s || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(kg|톤|t)?/i); put(k, m ? `${Number(m[1])}${/톤|t/i.test(m[2] || "") ? "톤" : "kg"}` : "", c); break; }
      case "혼적": case "긴급": put(k, truthy(s), c); break;
      case "운행유형": put(k, /왕복/.test(String(s || "")) ? "왕복" : "", c); break;
      case "상차방법": case "하차방법": put(k, String(s || "").slice(0, 20), c); break;
      default: put(k, String(s ?? "").slice(0, 200), c);
    }
  }
  return out;
}

// ── 2) 합치기 ──
const loose = (v) => String(v ?? "").replace(/\s+/g, "").replace(/\(주\)|㈜|주식회사/g, "").replace(/[-.,]/g, "").toLowerCase();
export const sameValue = (a, b) => {
  const x = loose(a), y = loose(b);
  return !!x && !!y && (x === y || (x.length >= 6 && y.length >= 6 && (x.includes(y) || y.includes(x))));
};
// F: 인식기 칸 { 칸: { value, conf: high|mid|low, line } } — 그 자리에서 고친다(인식기의 등록 업체 맞추기 전에 부른다)
export function mergeAiInto(F, ai, { threshold = AI_CONF_OK } = {}) {
  if (!ai) return F;
  for (const [k0, a] of Object.entries(ai)) {
    const k = k0 === "메모" ? "메모추가" : k0;
    const p = F[k];
    if (p && sameValue(p.value, a.value)) { F[k] = { ...p, conf: "high", ai: true, check: false }; continue; }
    if (a.conf >= threshold) {
      F[k] = { value: a.value, conf: "high", line: p?.line ?? -1, ai: true, check: !!p && p.conf === "high" && typeof a.value === "string", ...(p ? { prev: p.value } : {}) };
    } else if (p) {
      F[k] = { ...p, check: true, alt: a.value };
    } else {
      F[k] = { value: a.value, conf: "low", line: -1, ai: true, check: true };
    }
    // AI 시간을 쓰면 기준(이전/이후)도 AI 것으로 — 규칙 인식기가 다른 줄에서 붙인 기준이 남지 않게
    if ((k === "상차시간" || k === "하차시간") && F[k].ai && F[k].prev !== undefined) {
      if (a.basis) F[`${k}기준`] = { value: a.basis, conf: "high", line: F[k].line }; else delete F[`${k}기준`];
    } else if ((k === "상차시간" || k === "하차시간") && a.basis && F[k].ai && !F[`${k}기준`]) F[`${k}기준`] = { value: a.basis, conf: "high", line: F[k].line };
  }
  // AI가 확실히 "없다"고 본 칸인데 인식기가 추정으로만 채웠으면 확인 표시
  for (const [k, p] of Object.entries(F)) {
    const k1 = k === "메모추가" ? "메모" : k;
    if (!AI_FIELDS.includes(k1) || ai[k1]) continue;
    if (p && p.conf !== "high" && !p.via) F[k] = { ...p, check: true };
  }
  // 화물 단위·수량 → 화물내용이 비었으면 만들어 준다
  if (!F.화물내용 && F.화물수량 && F.화물단위) F.화물내용 = { value: `${F.화물수량.value}${F.화물단위.value}`, conf: F.화물수량.conf, line: -1, ai: true, check: !!F.화물수량.check };
  return F;
}
// 노란 칸(확인이 필요한 칸)인지
export const needsCheck = (f) => !!f && (f.check === true || f.conf === "low");

// ── 3) 회사별 학습 ──
// 32비트 FNV-1a(짧은 지문)
export function fnv1a(str) {
  let h = 0x811c9dc5;
  const s = String(str || "");
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
const stripBullet = (l) => String(l || "").replace(/^[\s\-–•·*▶▷►◆■□●○※#>]+/, "").replace(/^\(?\s*\d{1,2}\s*[).]\s*/, "").replace(/^[①-⑳]\s*/, "").trim();
const labelOfLine = (l) => {
  const m = stripBullet(l).match(/^([^\s:：\d][^:：\n]{0,11}?)\s*[:：]/);
  return m ? m[1].replace(/\s+/g, "").toLowerCase() : "";
};
// 양식 지문 — 줄 머리 라벨(상차처: · 도착지: …) 묶음 + (라벨이 아닌) 첫 줄(보낸 곳 머리말, 숫자 뺌)
export function templateFingerprint(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map((x) => x.trim()).filter(Boolean);
  const labels = [...new Set(lines.map(labelOfLine).filter(Boolean))].sort();
  const first = lines[0] || "";
  const head = !labelOfLine(first) ? first.replace(/[\d\s\-./:()]/g, "").slice(0, 20) : "";
  return { fp: fnv1a(`${labels.join("|")}#${head}`), labels, head };
}
const words = (t) => new Set(String(t || "").slice(0, 400).split(/[\s,/:()[\]]+/).map((w) => w.replace(/\d/g, "")).filter((w) => w.length >= 2));
function jaccard(a, b) {
  const A = a instanceof Set ? a : new Set(a || []), B = b instanceof Set ? b : new Set(b || []);
  if (!A.size && !B.size) return 0;
  let n = 0; A.forEach((x) => { if (B.has(x)) n += 1; });
  return n / (A.size + B.size - n);
}
export function similarity(cur, item) {
  return (cur.fp && cur.fp === item.fp ? 1 : 0) + jaccard(cur.labels, item.labels) + 0.4 * jaccard(words(cur.text), words(item.text))
    + (cur.client && item.fields?.거래처명 && sameValue(cur.client, item.fields.거래처명) ? 0.3 : 0);
}
// 비슷한 예전 기록 2~3개(원문 → 고친 칸) — AI 예시로 보낸다
export function pickExamples(items, cur, { n = 3, min = 0.45 } = {}) {
  return (items || [])
    .map((it) => ({ it, s: similarity(cur, it) }))
    .filter((x) => x.s >= min)
    .sort((a, b) => b.s - a.s || (b.it.updatedAtMs || 0) - (a.it.updatedAtMs || 0))
    .slice(0, n)
    .map(({ it }) => ({ text: String(it.text || "").slice(0, 1500), fields: it.fields || {} }));
}

// 라벨 → 칸 바꾸기에 쓰는 대표 라벨(인식기가 알아듣는 말)
export const CANON_LABEL = {
  상차지명: "상차지", 상차지주소: "상차지", 상차지담당자: "상차담당", 상차지담당자번호: "상차연락처", 상차시간: "상차시간", 상차일: "상차일", 상차방법: "상차방법",
  하차지명: "하차지", 하차지주소: "하차지", 하차지담당자: "하차담당", 하차지담당자번호: "하차연락처", 하차시간: "하차시간", 하차일: "하차일", 하차방법: "하차방법",
  거래처명: "거래처", 화물내용: "화물", 차량톤수: "차량", 차량종류: "차량", 청구운임: "청구운임", 메모: "메모",
};
// 날짜는 그날 기준(오늘·내일)이라 예시로 남기면 오히려 헷갈린다 — 빼고 배운다
const LEARN_KEYS = AI_FIELDS.filter((k) => !["화물단위", "상차일", "하차일"].includes(k));
const ALIAS_KEYS = ["거래처명", "상차지명", "하차지명"];
const NAME_LIKE = ["거래처명", "상차지명", "하차지명", "상차지주소", "하차지주소", "상차지담당자", "하차지담당자", "상차지담당자번호", "하차지담당자번호"];
const valStr = (v) => (v === true ? "예" : v === false || v == null ? "" : String(v));

// 저장할 학습 기록 — scanned: 스캔 직후 값 · final: 저장한 오더 값(배차 등록 칸 이름). 고친 칸이 없으면 null
export function buildLearnRecord({ text, scanned = {}, final = {} }) {
  const t = String(text || "").slice(0, 3000);
  if (!t.trim()) return null;
  // 원문에 있거나 · 스캔이 무언가 찾았거나 · 이름/주소/담당자 칸(원문 표기를 정식 이름으로 고쳐 쓴 경우)만
  //  나중에 손으로 따로 넣은 값(기사운임 · 지급방식 등)은 이 글의 정답이 아니라 뺀다
  const fields = {};
  const lt = loose(t);
  for (const k of LEARN_KEYS) {
    const v = valStr(final[k === "메모" ? "메모추가" : k] ?? final[k]).trim();
    const sv = valStr(scanned[k === "메모" ? "메모추가" : k] ?? scanned[k]).trim();
    if (v && (sv || NAME_LIKE.includes(k) || (loose(v).length >= 2 && lt.includes(loose(v))))) fields[k] = v.slice(0, 200);
  }
  const changed = LEARN_KEYS.filter((k) => {
    const a = valStr(scanned[k === "메모" ? "메모추가" : k] ?? scanned[k]).trim();
    const b = fields[k] || "";
    return b && loose(a) !== loose(b);
  });
  if (!changed.length) return null;
  const aliases = [];
  for (const k of ALIAS_KEYS) {
    const a = valStr(scanned[k]).trim(), b = fields[k];
    if (changed.includes(k) && a && b && a.length <= 60) aliases.push({ k, from: a, to: b });
  }
  // 고친 값이 "어떤라벨: 값" 줄에 그대로 있으면 → 그 라벨은 이 칸이라고 기억
  const labelMap = {};
  const lines = t.split("\n");
  for (const k of changed) {
    if (!CANON_LABEL[k]) continue;
    const want = loose(fields[k]);
    if (want.length < 2) continue;
    const ln = lines.find((l) => labelOfLine(l) && loose(stripBullet(l).replace(/^[^:：]*[:：]/, "")).includes(want));
    const lab = ln ? labelOfLine(ln) : "";
    if (lab && lab.replace(/\s/g, "") !== CANON_LABEL[k]) labelMap[lab] = k;
  }
  const { fp, labels, head } = templateFingerprint(t);
  return { fp, labels, head, text: t, fields, changed, aliases, labelMap };
}
// 예전 기록들 → 바로 적용할 규칙(최근 것이 이긴다)
export function collectRemaps(items) {
  const labelMap = {}; const aliases = {};
  [...(items || [])].sort((a, b) => (a.updatedAtMs || 0) - (b.updatedAtMs || 0)).forEach((it) => {
    Object.entries(it.labelMap || {}).forEach(([l, k]) => { if (CANON_LABEL[k]) labelMap[l] = k; });
    (it.aliases || []).forEach((x) => { if (x?.k && x.from && x.to) aliases[`${x.k}|${loose(x.from)}`] = x; });
  });
  return { labelMap, aliases: Object.values(aliases) };
}
// 원문 줄 머리 라벨을 배운 칸의 대표 라벨로 바꾼다(줄 수·순서는 그대로)
export function applyLabelRemaps(text, labelMap) {
  if (!labelMap || !Object.keys(labelMap).length) return String(text || "");
  return String(text || "").split("\n").map((l) => {
    const lab = labelOfLine(l);
    const k = lab && labelMap[lab];
    if (!k || !CANON_LABEL[k]) return l;
    return `${CANON_LABEL[k]}: ${stripBullet(l).replace(/^[^:：]*[:：]\s*/, "")}`;
  }).join("\n");
}
// 배운 이름 바꾸기(거래처 별칭 → 정식 이름 등) — F를 그 자리에서 고친다
export function applyAliases(F, aliases) {
  for (const x of aliases || []) {
    const f = F[x.k];
    if (f && loose(f.value) === loose(x.from) && loose(x.from) !== loose(x.to)) F[x.k] = { ...f, value: x.to, conf: "high", via: "전에 고친 이름", check: false, scanned: f.value };
  }
  return F;
}

// AI가 쓴 줄은 "인식 못한 줄"에서 빼고 역할 표시(상차·하차·화물…)를 붙인다 — 스캔 화면 줄 상자용
const ROLE_OF_KEY = (k) => (/^상차/.test(k) ? "상차" : /^하차/.test(k) ? "하차" : /^차량/.test(k) ? "차량" : /^(화물|중량)/.test(k) ? "화물" : /운임|지급/.test(k) ? "운임" : k === "거래처명" ? "거래처" : /메모/.test(k) ? "메모" : "기타");
export function reconcileRoles(result, blockText) {
  if (!result?.fields) return result;
  const aiVals = Object.entries(result.fields).filter(([, f]) => f?.ai && typeof f.value === "string" && loose(f.value).length >= 2).map(([k, f]) => [k, loose(f.value)]);
  if (!aiVals.length) return result;
  const raw = String(blockText || "").replace(/\r/g, "").split("\n");
  const roles = { ...result.roles };
  let moved = false;
  // 상차·하차 쪽은 AI가 확실히 읽은 칸만으로 고친다(규칙 인식기가 "하차" 줄을 상차로 본 경우 등)
  const sure = aiVals.filter(([k]) => /^(상차|하차)/.test(k) && !result.fields[k].check).sort((a, b) => b[1].length - a[1].length);
  raw.forEach((ln, i) => {
    const l = loose(ln);
    if (!l) return;
    if (roles[i] === "미인식") {
      const hit = aiVals.find(([, v]) => l.includes(v) || (l.length >= 4 && v.includes(l)));
      if (hit) { roles[i] = ROLE_OF_KEY(hit[0]); moved = true; }
      return;
    }
    if (["상차", "하차", "기타"].includes(roles[i])) {
      const hit = sure.find(([, v]) => v.length >= 4 && l.includes(v));
      const side = hit ? ROLE_OF_KEY(hit[0]) : "";
      if (side && side !== roles[i]) { roles[i] = side; moved = true; }
    }
  });
  if (!moved) return result;
  const unknown = raw.filter((ln, i) => roles[i] === "미인식").map((x) => x.trim()).filter(Boolean);
  return { ...result, roles, unknown };
}
export { ymdOf };
