// 🧠 2026-11-07 오더 스캔 정밀 인식 — 맞추기 · 합치기 · 회사별 학습 · 서버 함수(Vision · Claude는 가짜로) 단위 테스트
//  실행: node scripts/orderScanAi.test.mjs  (에뮬레이터 · 인터넷 필요 없음)
import { createRequire } from "module";
import { parseOrderScan } from "../src/orderScanParser.js";
import {
  normalizeAiFields, mergeAiInto, needsCheck, normDate, normTime, normTon, normVehicle, normAmount, normPay, kstToday,
  templateFingerprint, buildLearnRecord, collectRemaps, applyLabelRemaps, applyAliases, pickExamples, reconcileRoles,
} from "../src/orderScanAi.js";
import { createScanAi, MAX_PER_TEMPLATE } from "../src/orderScanClient.js";
import { scanToHub, hubToScan, hubWeight } from "../cafe-site/src/hub/hubScan.js";

const require = createRequire(import.meta.url);
const S = require("../functions/orderScan.js");

let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` :: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };
const has = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${name} ${cond ? "" : extra}`); };

const TODAY = new Date(2026, 10, 7); // 2026-11-07(토)

// ── 1) 값 맞추기 ──
eq("한국 날짜: UTC 15:30 = 다음 날", (() => { const d = kstToday(new Date("2026-11-07T15:30:00Z")); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; })(), [2026, 11, 8]);
eq("날짜 YYYY-MM-DD", normDate("2026-11-9", TODAY), "2026-11-09");
eq("날짜 내일", normDate("내일", TODAY), "2026-11-08");
eq("날짜 11/12", normDate("11/12", TODAY), "2026-11-12");
eq("날짜 엉터리", normDate("2026-13-40", TODAY), "");
eq("시간 14:00", normTime("14:00"), { value: "오후 2시", basis: null });
eq("시간 09:30 이전", normTime("09:30 이전"), { value: "오전 9시 30분", basis: "이전" });
eq("톤수 5t", normTon("5t"), "5톤");
eq("톤수 5톤축", normTon("5톤 축"), "5톤축");
eq("톤수 kg은 톤수 아님", normTon("600kg"), "");
eq("차종 냉동 윙", normVehicle("냉동 윙바디"), "냉동윙");
eq("차종 탑", normVehicle("탑"), "탑차");
eq("차종 다마스", normVehicle("다마스"), "라보/다마스");
eq("금액 32만", normAmount("32만원"), 320000);
eq("금액 320,000", normAmount("320,000"), 320000);
eq("금액 숫자", normAmount(450000), 450000);
eq("지급 현불", normPay("현불"), "선불");
eq("지급 세금계산서", normPay("세금계산서 발행"), "계산서");

const rawAi = {
  거래처명: { v: "한빛물산", c: 0.95 }, 상차일: { v: "2026-11-08", c: 0.9 }, 상차시간: { v: "09:00", c: 0.9 },
  상차지명: { v: "새벽유통 2창고", c: 0.9 }, 상차지주소: { v: "경기도 화성시 향남읍 제약공단1길 7", c: 0.95 },
  상차지담당자번호: { v: "O1O-2345-6789", c: 0.9 }, 하차지명: { v: "녹산물류센터", c: 0.6 }, 하차지주소: { v: "부산광역시 강서구 녹산산단321로 24", c: 0.9 },
  하차시간: { v: "14:00 이전", c: 0.85 }, 차량톤수: { v: "11t", c: 0.9 }, 차량종류: { v: "윙", c: 0.9 }, 화물내용: { v: "생활용품 14파레트", c: 0.9 },
  화물수량: { v: "14", c: 0.9 }, 화물단위: { v: "파레트", c: 0.9 }, 청구운임: { v: "60만", c: 0.9 }, 기사운임: { v: "", c: 1 }, 지급방식: { v: "인수증", c: 0.8 },
  중량: { v: "3,500kg", c: 0.7 }, 혼적: { v: "", c: 1 }, 긴급: { v: "예", c: 0.8 }, 메모: { v: "도착 전 전화", c: 0.7 },
};
const ai = normalizeAiFields(rawAi, { today: TODAY });
eq("AI 맞춤: 전화 O1O → 010", ai.상차지담당자번호.value, "010-2345-6789");
eq("AI 맞춤: 톤수 · 차종", [ai.차량톤수.value, ai.차량종류.value], ["11톤", "윙바디"]);
eq("AI 맞춤: 운임 숫자", ai.청구운임.value, 600000);
eq("AI 맞춤: 하차시간 기준", [ai.하차시간.value, ai.하차시간.basis], ["오후 2시", "이전"]);
eq("AI 맞춤: 빈 칸은 빠짐", [ai.기사운임, ai.혼적], [undefined, undefined]);
eq("AI 맞춤: 긴급 true", ai.긴급.value, true);
eq("AI 맞춤: 중량", ai.중량.value, "3500kg");

// ── 2) 합치기(규칙 인식기 aiMerge 고리) ──
const messy = [
  "[한빛물산 배차요청]",
  "상차처 : 새벽유통 2창고 / 경기도 화성시 향남읍 제약공단1길 7",
  "연락 O1O-2345-6789 내일 9시",
  "내려줄곳: 녹산센터 부산광역시 강서구 녹산산단321로 24 14시까지",
  "11t 윙 생활용품 14파레트 60만 인수증",
].join("\n");
const plain = parseOrderScan(messy, { today: TODAY });
const merged = parseOrderScan(messy, { today: TODAY, aiMerge: (F) => mergeAiInto(F, ai) });
has("AI 없이: 하차지명 못 찾거나 다름", plain.fields.하차지명?.value !== "녹산물류센터", plain.fields.하차지명?.value);
eq("합침: 거래처명(AI)", merged.fields.거래처명.value, "한빛물산");
eq("합침: 하차지명은 AI 확신도 낮음 → 노란 칸", needsCheck(merged.fields.하차지명), true);
eq("합침: 상차지주소 규칙 = AI 같으면 확실", [merged.fields.상차지주소.value, needsCheck(merged.fields.상차지주소)], ["경기도 화성시 향남읍 제약공단1길 7", false]);
eq("합침: 하차시간 기준 이전", merged.fields.하차시간기준?.value, "이전");
eq("합침: 청구운임", merged.fields.청구운임.value, 600000);
eq("합침: 지급방식 · 화물수량", [merged.fields.지급방식.value, merged.fields.화물수량.value], ["인수증", "14"]);
// 규칙이 확실히 읽은 값과 AI 값이 다르면 AI를 쓰되 노란 칸(이전 값을 보여 줌)
{
  const F = { 차량톤수: { value: "5톤", conf: "high", line: 3 } };
  mergeAiInto(F, { 차량톤수: { value: "11톤", conf: 0.9 } });
  eq("다른 값: AI 우선 + 확인", [F.차량톤수.value, F.차량톤수.check, F.차량톤수.prev], ["11톤", true, "5톤"]);
  const G = { 차량톤수: { value: "5톤", conf: "mid", line: 3 } };
  mergeAiInto(G, { 차량톤수: { value: "11톤", conf: 0.4 } });
  eq("AI 자신 없음: 규칙 값 유지 + 확인 + 다른 값 제안", [G.차량톤수.value, G.차량톤수.check, G.차량톤수.alt], ["5톤", true, "11톤"]);
  const H = { 화물내용: { value: "박스", conf: "mid", line: 1 } };
  mergeAiInto(H, {});
  eq("AI가 '없음'으로 본 추정 칸 → 확인", H.화물내용.check, true);
  const T = { 상차시간: { value: "오후 2시", conf: "mid", line: 3 }, 상차시간기준: { value: "이전", conf: "mid", line: 3 } };
  mergeAiInto(T, { 상차시간: { value: "오전 9시", conf: 0.9 } });
  eq("AI 시간으로 바꾸면 남의 줄 기준(이전)은 지움", [T.상차시간.value, T.상차시간기준], ["오전 9시", undefined]);
}
const rr = reconcileRoles(merged, messy);
has("AI가 쓴 줄은 '인식 못한 줄'에서 빠짐", rr.unknown.length <= merged.unknown.length);
eq("AI가 확실히 읽은 하차 줄은 역할도 하차로", rr.roles[3], "하차");

// ── 3) 회사별 학습 ──
const fpA = templateFingerprint(messy);
const fpB = templateFingerprint(messy.replace("내일 9시", "모레 10시").replace("60만", "55만"));
eq("양식 지문: 숫자 · 내용이 바뀌어도 같음", fpA.fp, fpB.fp);
has("양식 지문: 다른 양식은 다름", templateFingerprint("출발: A\n도착: B").fp !== fpA.fp);
const scanned = Object.fromEntries(Object.entries(plain.fields).map(([k, f]) => [k, f.value]));
const final = { ...scanned, 상차지명: "새벽유통 2창고", 하차지명: "녹산물류센터", 하차지주소: "부산광역시 강서구 녹산산단321로 24", 거래처명: "(주)한빛물산", 기사운임: "500000" };
const rec = buildLearnRecord({ text: messy, scanned: { ...scanned, 거래처명: "한빛" }, final });
has("학습 기록 생김", !!rec);
has("고친 칸: 하차지명 · 거래처명", rec.changed.includes("하차지명") && rec.changed.includes("거래처명"), JSON.stringify(rec.changed));
has("손으로 넣은 기사운임(원문에 없음)은 정답에서 뺌", rec.fields.기사운임 === undefined);
has("날짜는 학습하지 않음", rec.fields.상차일 === undefined);
eq("이름 바꾸기(거래처 별칭)", rec.aliases.find((x) => x.k === "거래처명"), { k: "거래처명", from: "한빛", to: "(주)한빛물산" });
eq("라벨 바꾸기: 내려줄곳 → 하차지(이름·주소)", rec.labelMap.내려줄곳, "하차지주소");
eq("고친 칸 없으면 기록 없음", buildLearnRecord({ text: messy, scanned, final: scanned }), null);
const items = [{ ...rec, id: "a", updatedAtMs: 2 }, { fp: "zzz", labels: ["출발", "도착"], text: "출발: A\n도착: B", fields: { 상차지명: "A" }, updatedAtMs: 1 }];
const rem = collectRemaps(items);
eq("모은 규칙: 라벨", rem.labelMap.내려줄곳, "하차지주소");
const remapped = applyLabelRemaps("상차: 서해식품 인천 서구 원창동 381-12\n내려줄곳 : 대한센터 부산광역시 강서구 녹산산단321로 24", rem.labelMap);
eq("라벨 바꾸기 적용(줄 수 그대로)", remapped.split("\n").length, 2);
has("라벨 바꾸기 적용: 대표 라벨로", remapped.split("\n")[1].startsWith("하차지: 대한센터"), remapped);
{
  const r2 = parseOrderScan(remapped, { today: TODAY });
  eq("라벨 바꾼 뒤 규칙 인식: 하차지명 · 주소", [r2.fields.하차지명?.value, r2.fields.하차지주소?.value], ["대한센터", "부산광역시 강서구 녹산산단321로 24"]);
}
{
  const F = { 거래처명: { value: "한빛", conf: "mid", line: 0 } };
  applyAliases(F, rem.aliases);
  eq("이름 바꾸기 적용", [F.거래처명.value, F.거래처명.via, F.거래처명.scanned], ["(주)한빛물산", "전에 고친 이름", "한빛"]);
}
const ex = pickExamples(items, { ...templateFingerprint(messy), text: messy });
eq("비슷한 예시만 고름(같은 양식 1건)", ex.length, 1);
has("예시 = 원문 → 고친 칸", ex[0].fields.하차지명 === "녹산물류센터" && ex[0].text.includes("내려줄곳"), JSON.stringify(ex[0]?.fields));
eq("다른 양식엔 예시 없음", pickExamples([items[0]], { ...templateFingerprint("배송지: Z\n담당: Y"), text: "배송지: Z" }).length, 0);

// ── 4) 화면 연결(createScanAi) — 가짜 Firestore · 가짜 서버 호출 ──
function fakeFs() {
  const store = new Map(); // path → data
  const fs = {
    collection: (_db, ...p) => ({ path: p.join("/") }),
    doc: (_db, ...p) => ({ path: p.join("/") }),
    query: (col, ...cons) => ({ col, cons }),
    where: (f, op, v) => ({ t: "where", f, v }),
    orderBy: (f) => ({ t: "orderBy", f }),
    limit: (n) => ({ t: "limit", n }),
    serverTimestamp: () => "ts",
    setDoc: async (ref, data) => { store.set(ref.path, data); },
    deleteDoc: async (ref) => { store.delete(ref.path); },
    getDocs: async (q) => {
      let rows = [...store.entries()].filter(([p]) => p.startsWith(`${q.col.path}/`) && p.split("/").length === q.col.path.split("/").length + 1)
        .map(([p, d]) => ({ id: p.split("/").pop(), data: () => d }));
      q.cons.forEach((c) => { if (c.t === "where") rows = rows.filter((r) => r.data()[c.f] === c.v); });
      return { docs: rows };
    },
  };
  return { fs, store };
}
{
  const { fs, store } = fakeFs();
  const calls = [];
  const api = createScanAi({ db: {}, fs, getKey: async () => "lw:한빛로지스", getUid: () => "u1", call: async (n, d) => { calls.push([n, d]); return { fields: rawAi }; } });
  const r = await api.extract("상차: A", [{ text: "x", fields: {} }]);
  eq("호출: orderScanExtract + 예시 전달", [calls[0][0], calls[0][1].examples.length, !!r.fields], ["orderScanExtract", 1, true]);
  api.setPending({ text: messy, scanned: { ...scanned, 거래처명: "한빛" }, applied: final });
  const id = await api.commit({ 상차지명: "새벽유통 2창고", 하차지명: "녹산물류센터" });
  has("저장할 때 학습 기록 저장", !!id && store.has(`scanLearn/lw:한빛로지스/items/${id}`));
  const saved = store.get(`scanLearn/lw:한빛로지스/items/${id}`);
  eq("기록에 회사 키 · 사람", [saved.companyKey, saved.uid], ["lw:한빛로지스", "u1"]);
  api.setPending({ text: messy, scanned, applied: final });
  eq("다른 오더를 저장하면 버림", await api.commit({ 상차지명: "전혀다른곳", 하차지명: "또다른곳", 상차지주소: "x", 하차지주소: "y" }), null);
  // 같은 양식은 최근 N건만
  for (let i = 0; i < MAX_PER_TEMPLATE + 3; i += 1) {
    const t = messy.replace("60만", `${50 + i}만`);
    api.setPending({ text: t, scanned: { ...scanned, 하차지명: "녹산" }, applied: final });
    await api.commit(final);
  }
  const sameFp = [...store.values()].filter((d) => d.fp === fpA.fp).length;
  eq(`같은 양식 기록은 ${MAX_PER_TEMPLATE}건까지`, sameFp, MAX_PER_TEMPLATE);
  const h = await api.hintsFor(messy);
  has("다음 스캔: 예시 2~3개 + 라벨 규칙", h.examples.length >= 2 && h.examples.length <= 3 && h.remaps.labelMap.내려줄곳 === "하차지주소", JSON.stringify({ n: h.examples.length, lm: h.remaps.labelMap }));
}

// ── 5) 허브 매핑(정리된 칸 사용) ──
{
  const h = scanToHub({ 상차지명: "경기도 화성시 향남읍 제약공단1길 7", 하차지명: "녹산물류센터", 하차지주소: "부산광역시 강서구 녹산산단321로 24", 화물내용: "생활용품" }, "", { text: "", structured: { 지급방식: "인수증", 중량: "3500kg", 화물수량: "14", 화물단위: "파레트" } });
  eq("허브: 지명 칸의 주소 → 지역 + 상세주소", [h.상차시도, h.상차시군구, h.상차지주소, h.상차지명], ["경기", "화성시", "경기도 화성시 향남읍 제약공단1길 7", undefined]);
  eq("허브: 하차지명 → 비공개 장소명 · 지역", [h.하차지명, h.하차시도], ["녹산물류센터", "부산"]);
  eq("허브: 정리된 결제 방식 · 중량(톤) · 파레트", [h.지급방식, h.중량, h.파레트], ["인수증", "3.5", "14"]);
  eq("허브 중량 600kg", hubWeight("600kg"), "0.6");
  eq("허브 → 배차 칸(학습용)", hubToScan({ 상차지명: "A", 상차시간: "14:30", 파레트: "3", 운임: "320,000" }).상차시간, "오후 2시 30분");
}

// ── 6) 서버 함수(가짜 Vision · 가짜 Claude · 가짜 Firestore) ──
function fakeDb(seed = {}) {
  const docs = new Map(Object.entries(seed));
  const ref = (path) => ({ path, get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }) });
  return {
    docs,
    collection: (c) => ({ doc: (id) => ref(`${c}/${id}`) }),
    runTransaction: async (fn) => fn({
      get: async (r) => ({ exists: docs.has(r.path), data: () => docs.get(r.path) }),
      set: (r, d, o) => { docs.set(r.path, o?.merge ? { ...(docs.get(r.path) || {}), ...d } : d); },
    }),
  };
}
const db = fakeDb({
  "users/staff": { companyName: "한빛로지스", approved: true },
  "users/pending": { companyName: "한빛로지스", approved: false },
  "users/cafe": { role: "cafeUser", approved: true },
  "users/ended": { companyName: "끝난회사", approved: true },
  "companyPlans/끝난회사": { status: "ended" },
  "hubMembers/hubA": { status: "approved", source: "signup", bizNo: "123-45-67891" },
  "hubMembers/hubP": { status: "pending", source: "signup" },
});
const authOf = (uid) => ({ uid, token: {} });
eq("서버 권한: 직원 → lw 키", await S.scanUserOf(db, authOf("staff")), { kind: "lw", key: "lw:한빛로지스" });
eq("서버 권한: 허브 회원 → 사업자 키", await S.scanUserOf(db, authOf("hubA")), { kind: "hub", key: "biz:1234567891" });
for (const [uid, code] of [[null, "unauthenticated"], ["pending", "permission-denied"], ["cafe", "permission-denied"], ["hubP", "permission-denied"], ["ended", "permission-denied"]]) {
  const e = await S.scanUserOf(db, uid ? authOf(uid) : null).then(() => null, (x) => x);
  eq(`서버 권한 거절: ${uid || "비로그인"}`, e?.code, code);
}
// Vision 가짜 응답(두 줄)
const sym = (t, br) => ({ text: t, property: br ? { detectedBreak: { type: br } } : undefined });
const word = (t, x, y, br) => ({ boundingBox: { vertices: [{ x, y }, { x: x + 40, y }, { x: x + 40, y: y + 20 }, { x, y: y + 20 }] }, symbols: [...t].map((c, i) => sym(c, i === t.length - 1 ? br : null)) });
const visionResp = { fullTextAnnotation: { text: "상차: 인천\n하차: 부산", pages: [{ width: 800, height: 400, blocks: [{ paragraphs: [{ words: [word("상차:", 10, 10, "SPACE"), word("인천", 60, 10, "LINE_BREAK"), word("하차:", 10, 50, "SPACE"), word("부산", 60, 50, "LINE_BREAK")] }] }] }] } };
eq("Vision → 줄 + 위치", S.visionToLines(visionResp).lines, [{ text: "상차: 인천", bbox: { x0: 10, y0: 10, x1: 100, y1: 30 } }, { text: "하차: 부산", bbox: { x0: 10, y0: 50, x1: 100, y1: 70 } }]);
{
  let visionReq = null; let bumped = 0;
  const out = await S.runOcr({ db, auth: authOf("staff"), data: { image: "data:image/jpeg;base64,QUJD" }, getVisionClient: async () => ({ request: async (r) => { visionReq = r; return { data: { responses: [visionResp] } }; } }), bumpVision: () => { bumped += 1; } });
  eq("OCR: 글 · 엔진 · 사용량", [out.text, out.engine, bumped], ["상차: 인천\n하차: 부산", "vision", 1]);
  eq("OCR: 문서 글자 인식 + 한·영 힌트", [visionReq.data.requests[0].features[0].type, visionReq.data.requests[0].imageContext.languageHints], ["DOCUMENT_TEXT_DETECTION", ["ko", "en"]]);
  const big = await S.runOcr({ db, auth: authOf("staff"), data: { image: "A".repeat(4 * 1024 * 1024 + 10) }, getVisionClient: async () => ({}) }).then(() => null, (e) => e.code);
  eq("OCR: 너무 큰 이미지 거절", big, "invalid-argument");
  // 하루 횟수 제한
  const db2 = fakeDb({ "users/staff": { companyName: "A" }, [`scanUsage/staff_${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "")}`]: { ocr: S.LIMITS.ocr } });
  const lim = await S.runOcr({ db: db2, auth: authOf("staff"), data: { image: "QUJD" }, getVisionClient: async () => ({}) }).then(() => null, (e) => e.code);
  eq("OCR: 하루 횟수 넘으면 거절", lim, "resource-exhausted");
}
{
  let req = null; let usage = null;
  const fakeAnthropic = { messages: { create: async (r) => { req = r; return { model: S.MODEL, stop_reason: "end_turn", usage: { input_tokens: 900, output_tokens: 400, cache_read_input_tokens: 1200 }, content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(rawAi) }] }; } } };
  const out = await S.runExtract({ db, auth: authOf("hubA"), data: { text: messy, examples: [{ text: "상차처: A", fields: { 상차지명: "A", 엉뚱한칸: "x" } }] }, makeAnthropic: () => fakeAnthropic, bumpUsage: (u) => { usage = u; } });
  eq("AI: 모델 = 최신 Haiku", req.model, "claude-haiku-5-5");
  eq("AI: 고정 지시문 캐시", req.system[0].cache_control, { type: "ephemeral" });
  eq("AI: JSON 스키마 출력 · 낮은 effort", [req.output_config.format.type, req.output_config.effort], ["json_schema", "low"]);
  has("AI: 오늘 날짜(한국)는 사용자 메시지에(캐시 안 깨짐)", /\[오늘\] \d{4}-\d{2}-\d{2}/.test(req.messages[0].content) && !/\d{4}-\d{2}-\d{2}/.test(req.system[0].text));
  has("AI: 예시 전달(모르는 칸은 버림)", req.messages[0].content.includes("[예시 1 정답]") && !req.messages[0].content.includes("엉뚱한칸"));
  eq("AI: 칸 + 확신도 돌려줌", [out.fields.거래처명, out.engine], [{ v: "한빛물산", c: 0.95 }, "claude"]);
  eq("AI: 토큰 사용량 기록", usage, { input: 900, output: 400, cacheRead: 1200, cacheWrite: 0 });
  eq("AI: 스키마 칸 수", Object.keys(S.SCHEMA.properties).length, S.FIELD_KEYS.length);
  const noKey = await S.runExtract({ db, auth: authOf("staff"), data: { text: messy }, makeAnthropic: () => null }).then(() => null, (e) => e.code);
  eq("AI: 키 없으면 failed-precondition(화면은 규칙 인식으로)", noKey, "failed-precondition");
  const refused = await S.runExtract({ db, auth: authOf("staff"), data: { text: messy }, makeAnthropic: () => ({ messages: { create: async () => ({ stop_reason: "refusal", content: [], usage: {} }) } }) }).then(() => null, (e) => e.code);
  eq("AI: 거절 응답 → unavailable", refused, "unavailable");
  const broken = await S.runExtract({ db, auth: authOf("staff"), data: { text: messy }, makeAnthropic: () => ({ messages: { create: async () => { throw new Error("network"); } } }) }).then(() => null, (e) => e.code);
  eq("AI: 연결 실패 → unavailable", broken, "unavailable");
}

console.log(`\n오더 스캔 정밀 인식 ${pass + fail}개 — 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
