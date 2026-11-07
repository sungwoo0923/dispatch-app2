// 🏛 2026-11-07 국세청 사업자 상태 · 기상청 예보/특보 · 팝빌 어댑터 단위 테스트
//  실행: node scripts/publicData.test.mjs  (인터넷 · 에뮬레이터 필요 없음 — fetch · DB · 팝빌 SDK 모두 가짜)
import { createRequire } from "module";
import * as C from "../functions/publicDataCore.mjs";

const require = createRequire(import.meta.url);
const { makePublicData, keyOk, encKey } = require("../functions/publicData.js");
const { createPopbill, popbillState, makePopbillAdmin } = require("../functions/popbill.js");
const { callerOf } = require("../functions/publicData.js");

let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` :: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };
const has = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${name} ${cond ? "" : extra}`); };
const throwsCode = async (name, fn, code) => { try { await fn(); has(name, false, "(안 던짐)"); } catch (e) { eq(name, e.code, code); } };

// ───────── 가짜 Firestore ─────────
function fakeDb() {
  const store = new Map();
  const snap = (path) => { const d = store.get(path); return { exists: d !== undefined, id: path.split("/").pop(), data: () => (d === undefined ? undefined : JSON.parse(JSON.stringify(d))) }; };
  const ref = (col, id) => ({
    path: `${col}/${id}`,
    async get() { return snap(`${col}/${id}`); },
    async set(v, opt) { store.set(`${col}/${id}`, opt?.merge ? { ...(store.get(`${col}/${id}`) || {}), ...v } : v); },
  });
  const query = (col, filters = [], lim = Infinity, order = null) => ({
    where: (f, op, v) => query(col, [...filters, [f, op, v]], lim, order),
    limit: (n) => query(col, filters, n, order),
    orderBy: (f, dir) => query(col, filters, lim, [f, dir]),
    async get() {
      let docs = [...store.entries()].filter(([k]) => k.startsWith(`${col}/`) && !k.slice(col.length + 1).includes("/")).map(([k]) => snap(k));
      docs = docs.filter((d) => filters.every(([f, op, v]) => (op === "in" ? v.includes(d.data()[f]) : d.data()[f] === v)));
      if (order) docs.sort((a, b) => (order[1] === "desc" ? -1 : 1) * (Number(a.data()[order[0]] || 0) - Number(b.data()[order[0]] || 0)));
      return { docs: docs.slice(0, lim) };
    },
  });
  return {
    store,
    collection: (col) => ({ doc: (id) => ref(col, id), ...query(col) }),
    batch: () => { const ops = []; return { set: (r, v) => ops.push([r, v]), async commit() { for (const [r, v] of ops) await r.set(v); } }; },
    async runTransaction(fn) { return fn({ get: (r) => r.get(), set: (r, v, o) => { r.set(v, o); } }); },
  };
}
const NOW = Date.UTC(2026, 10, 7, 5, 20); // KST 2026-11-07 14:20
const mkFetch = (handler) => {
  const calls = [];
  const f = async (url, opts) => { calls.push({ url, opts }); const body = await handler(url, opts); return { status: body?.__status || 200, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) }; };
  f.calls = calls;
  return f;
};
const staffAuth = { uid: "u1", token: { email: "u1@t.kr" } };

(async () => {
  // ───────── ① 사업자번호 검증식 ─────────
  eq("검증식: 220-81-62517(유효)", C.bizNoValid("220-81-62517"), true);
  eq("검증식: 1208147521(유효)", C.bizNoValid("1208147521"), true);
  eq("검증식: 끝자리 틀림", C.bizNoValid("2208162518"), false);
  eq("검증식: 9자리", C.bizNoValid("123456789"), false);
  eq("검증식: 0000000000", C.bizNoValid("0000000000"), false);
  eq("검증식: 하이픈 · 공백 무시", C.bizNoValid(" 220 81 62517 "), true);
  eq("형식: 하이픈", C.fmtBizNoDigits("2208162517"), "220-81-62517");
  eq("둘러보기 연동회원 번호도 유효", C.bizNoValid("2208162517"), true);

  // ───────── ① 국세청 응답 정리 ─────────
  const nts = { request_cnt: 3, match_cnt: 3, status_code: "OK", data: [
    { b_no: "2208162517", b_stt: "계속사업자", b_stt_cd: "01", tax_type: "부가가치세 일반과세자", end_dt: "" },
    { b_no: "1208147521", b_stt: "폐업자", b_stt_cd: "03", tax_type: "부가가치세 간이과세자", end_dt: "20250930" },
    { b_no: "1234567891", b_stt: "", b_stt_cd: "", tax_type: "국세청에 등록되지 않은 사업자등록번호입니다.", end_dt: "" },
  ] };
  const p = C.parseNtsStatus(nts);
  eq("국세청: 계속", [p.rows[0].state, p.rows[0].label], ["active", "계속"]);
  eq("국세청: 폐업 + 폐업일", [p.rows[1].state, p.rows[1].endDt], ["closed", "2025-09-30"]);
  eq("국세청: 미등록(과세유형 문구는 비움)", [p.rows[2].state, p.rows[2].taxType], ["unregistered", ""]);
  eq("국세청: 휴업(코드)", C.normBizRow({ b_no: "x", b_stt_cd: "02" }).state, "suspended");
  eq("국세청: 키 오류", C.parseNtsStatus({ code: -4, msg: "등록되지 않은 인증키 입니다." }).keyError, true);
  eq("국세청: status_code 오류", C.parseNtsStatus({ status_code: "BAD_JSON_REQUEST" }).ok, false);
  has("경고 문구: 폐업", /폐업/.test(C.bizWarnText(p.rows[1])));
  eq("경고 문구: 계속은 없음", C.bizWarnText(p.rows[0]), "");

  // ───────── ② 격자 변환 ─────────
  eq("격자: 서울 시청", C.latLonToGrid(37.5665, 126.978), { nx: 60, ny: 127 });
  eq("격자: 부산", C.latLonToGrid(35.1796, 129.0756), { nx: 98, ny: 76 });
  eq("격자: 제주", C.latLonToGrid(33.4996, 126.5312), { nx: 53, ny: 38 });
  // 주소 → 지역
  eq("주소: 경기도 평택시", C.regionOfAddress("경기도 평택시 포승읍 평택항만길 73")?.key, "경기_평택");
  eq("주소: 부산 강서구(광역시는 한 점)", C.regionOfAddress("부산광역시 강서구 성북동")?.key, "부산");
  eq("주소: 시도 없이 화성시", C.regionOfAddress("화성시 동탄산단8길")?.key, "경기_화성");
  eq("주소: 경기 광주시 vs 광주광역시", [C.regionOfAddress("경기 광주시 오포읍")?.key, C.regionOfAddress("광주광역시 광산구")?.key], ["경기_광주", "광주"]);
  eq("주소: 고성(강원 · 경남 구분)", [C.regionOfAddress("강원특별자치도 고성군")?.key, C.regionOfAddress("경상남도 고성군")?.key], ["강원_고성", "경남_고성"]);
  eq("주소: 전북특별자치도", C.regionOfAddress("전북특별자치도 전주시 덕진구")?.key, "전북_전주");
  eq("주소: 모름", C.regionOfAddress("강서구 공항대로"), null);
  eq("키 → 지역", C.regionOfKey("경기_평택")?.nx, 62);
  has("지역 표 전부 격자 범위 안", C.ALL_REGION_KEYS().every((k) => { const r = C.regionOfKey(k); return r && r.nx > 0 && r.nx < 150 && r.ny > 0 && r.ny < 260; }));

  // ───────── ② 발표시각 · 응답 정리 ─────────
  eq("단기예보 발표시각(14:20 → 14시)", C.vilageBase(NOW), { base_date: "20261107", base_time: "1400" });
  eq("단기예보 발표시각(01:00 → 전날 23시)", C.vilageBase(Date.UTC(2026, 10, 6, 16, 0)), { base_date: "20261106", base_time: "2300" });
  eq("초단기 발표시각(14:20 → 13:30)", C.ultraBase(NOW), { base_date: "20261107", base_time: "1330" });
  const vil = { response: { header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" }, body: { items: { item: [
    { fcstDate: "20261107", fcstTime: "1500", category: "TMP", fcstValue: "12" },
    { fcstDate: "20261107", fcstTime: "1500", category: "PTY", fcstValue: "1" },
    { fcstDate: "20261107", fcstTime: "1500", category: "POP", fcstValue: "70" },
    { fcstDate: "20261107", fcstTime: "1500", category: "PCP", fcstValue: "1.0mm" },
    { fcstDate: "20261107", fcstTime: "1500", category: "WSD", fcstValue: "4.2" },
    { fcstDate: "20261107", fcstTime: "1800", category: "TMP", fcstValue: "8" },
    { fcstDate: "20261107", fcstTime: "1800", category: "WSD", fcstValue: "11" },
    { fcstDate: "20261107", fcstTime: "1800", category: "PCP", fcstValue: "강수없음" },
    { fcstDate: "20261106", fcstTime: "1000", category: "TMP", fcstValue: "3" },
  ] } } } };
  const ultra = { response: { header: { resultCode: "00" }, body: { items: { item: [{ fcstDate: "20261107", fcstTime: "1500", category: "T1H", fcstValue: "11" }] } } } };
  const vi = C.kmaItems(vil); const ui = C.kmaItems(ultra);
  eq("기상청 응답 정리", [vi.ok, vi.items.length], [true, 9]);
  eq("기상청 키 오류", C.kmaItems({ response: { header: { resultCode: "30", resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" } } }).keyError, true);
  eq("기상청 자료 없음(03)", C.kmaItems({ response: { header: { resultCode: "03" } } }).noData, true);
  const hours = C.trimHours(C.mergeForecast(vi.items, ui.items), NOW);
  eq("합치기: 초단기 기온이 덮음", hours["2026110715"].t, 11);
  eq("합치기: 강수량 mm", hours["2026110715"].pcp, 1);
  eq("지난 시각 뺌", hours["2026110610"], undefined);
  eq("시각 키: 14:30", C.slotKey("2026-11-07", "14:30", NOW), "2026110714");
  eq("시각 키: 오후 3시", C.slotKey("2026-11-07", "오후 3시", NOW), "2026110715");
  eq("시각 키: 즉시(오늘이면 지금)", C.slotKey("2026-11-07", "즉시", NOW), "2026110714");
  eq("가까운 시각(14시 → 15시 자료)", C.weatherAt(hours, "2026110714")?.at, "2026110715");
  eq("3시간 넘게 떨어지면 없음", C.weatherAt(hours, "2026110810"), null);
  eq("표시: 비", C.weatherFlags(hours["2026110715"]).kinds, ["rain"]);
  eq("표시: 강풍(11m/s)", C.weatherFlags(hours["2026110718"]).kinds, ["wind"]);
  eq("표시: 폭염 · 눈", [C.weatherFlags({ t: 34 }).kinds, C.weatherFlags({ t: -1, pty: 3 }).kinds], [["heat"], ["snow"]]);

  // ───────── ③ 특보 ─────────
  const t6 = "o 강풍주의보 : 강원도(강릉시평지, 동해시평지, 강원북부산지), 경상남도(김해, 창원), 인천\r\no 호우경보 : 부산\r\no 풍랑주의보 : 서해중부앞바다\r\no 건조주의보 : 경상북도(북부)";
  const ws = C.parseWarnText(t6);
  eq("특보 글 정리(바다 구역은 뺌)", ws.map((w) => `${w.type}/${w.sido}/${w.subs.length}`), ["강풍주의보/강원/3", "강풍주의보/경남/2", "강풍주의보/인천/0", "호우경보/부산/0", "건조주의보/경북/1"]);
  const st = C.parseWarnStatus([{ tmFc: 202611071000, t6: "o 한파주의보 : 서울" }, { tmFc: 202611071400, t6 }]);
  eq("가장 최근 발표", String(st.tmFc), "202611071400");
  const R = (a) => C.regionOfAddress(a);
  eq("특보: 강릉(강릉시평지)", C.warningsFor(R("강원도 강릉시"), ws).length, 1);
  eq("특보: 춘천은 아님", C.warningsFor(R("강원도 춘천시"), ws).length, 0);
  eq("특보: 김해", C.warningsFor(R("경남 김해시"), ws)[0]?.type, "강풍주의보");
  eq("특보: 진주는 아님", C.warningsFor(R("경남 진주시"), ws).length, 0);
  eq("특보: 부산 호우경보", C.warningsFor(R("부산 강서구"), ws)[0]?.level, "경보");
  eq("특보: 경북(북부) 넓은 구역은 도 전체로", C.warningsFor(R("경북 안동시"), ws).length, 1);
  eq("특보 요약", C.warnShort(C.warningsFor(R("인천 중구"), ws)), "강풍주의보");

  // ───────── 서버: 국세청 조회 · 저장 · 횟수 ─────────
  {
    const db = fakeDb();
    db.store.set("users/u1", { approved: true, role: "admin", companyName: "테스트운송" });
    const fetchFn = mkFetch((url, opts) => {
      const b = JSON.parse(opts.body).b_no;
      return { status_code: "OK", data: b.map((n) => ({ b_no: n, b_stt: n === "1208147521" ? "휴업자" : "계속사업자", b_stt_cd: n === "1208147521" ? "02" : "01", tax_type: "부가가치세 일반과세자", end_dt: "" })) };
    });
    let key = "abc+/def==";
    let now = NOW;
    const pd = makePublicData({ db, fetch: fetchFn, getKey: () => key, now: () => now });
    const r1 = await pd.bizStatusCheck({ bNos: ["220-81-62517", "1208147521", "1234567890"] }, staffAuth);
    eq("조회: 결과 3개(검증식 틀린 번호는 부르지 않음)", [r1.results["2208162517"].state, r1.results["1208147521"].state, r1.results["1234567890"].state], ["active", "suspended", "invalid"]);
    eq("조회: 국세청에는 2개만", JSON.parse(fetchFn.calls[0].opts.body).b_no, ["2208162517", "1208147521"]);
    has("조회: 키는 주소에 인코딩", fetchFn.calls[0].url.includes("serviceKey=abc%2B%2Fdef%3D%3D") && fetchFn.calls[0].url.startsWith("https://api.odcloud.kr/api/nts-businessman/v1/status?"));
    eq("저장: bizStatusCache", db.store.get("bizStatusCache/2208162517")?.state, "active");
    const r2 = await pd.bizStatusCheck({ bNos: ["2208162517"] }, staffAuth);
    eq("24시간 안은 저장된 값(국세청 안 부름)", [r2.results["2208162517"].cached, fetchFn.calls.length], [true, 1]);
    now = NOW + 25 * 3600e3;
    await pd.bizStatusCheck({ bNos: ["2208162517"] }, staffAuth);
    eq("24시간 지나면 다시 부름", fetchFn.calls.length, 2);
    eq("하루 횟수 기록", db.store.get("bizStatusUsage/u1_20261108")?.count, 1);
    // 키 없음
    key = "none"; now = NOW + 60 * 3600e3;
    const r3 = await pd.bizStatusCheck({ bNos: ["2208162517"] }, staffAuth);
    eq("키 없음 → disabled · 상태 모름", [r3.disabled, r3.reason, r3.results["2208162517"].state], [true, "no-key", "unknown"]);
    // 가입 중(승인 전) — 한 번에 1개 · 하루 20개
    key = "k";
    await throwsCode("가입 중: 한 번에 2개는 안 됨", () => pd.bizStatusCheck({ bNos: ["2208162517", "1208147521"] }, { uid: "s1", token: {} }), "invalid-argument");
    await throwsCode("로그인 안 함", () => pd.bizStatusCheck({ bNos: ["2208162517"] }, null), "unauthenticated");
    db.store.set("bizStatusUsage/s1_20261110", { count: 20 });
    db.store.delete("bizStatusCache/1208147521");
    await throwsCode("가입 중: 하루 20개 넘으면", () => pd.bizStatusCheck({ bNos: ["1208147521"] }, { uid: "s1", token: {} }), "resource-exhausted");
    // 키 오류 응답
    const pdBad = makePublicData({ db: fakeDb(), fetch: mkFetch(() => ({ code: -4, msg: "등록되지 않은 인증키 입니다." })), getKey: () => "bad", now: () => NOW });
    const rb = await pdBad.bizStatusCheck({ bNos: ["2208162517"] }, { uid: "x", token: { email: "tjddnqkf@naver.com" } });
    eq("키 오류 → disabled bad-key", [rb.disabled, rb.reason], [true, "bad-key"]);
    eq("인코딩된 키는 그대로", encKey("ab%2Bc"), "ab%2Bc");
    eq("키 판정", [keyOk(""), keyOk("none"), keyOk("NONE"), keyOk("x")], [false, false, false, true]);
  }

  // ───────── 서버: 기상청 저장 · 1시간 · 3시간 갱신 ─────────
  {
    const db = fakeDb();
    db.store.set("users/u1", { approved: true, role: "user", companyName: "테스트운송" });
    const kmaFetch = mkFetch((url) => {
      if (url.includes("getVilageFcst")) return vil;
      if (url.includes("getUltraSrtFcst")) return ultra;
      if (url.includes("getPwnStatus")) return { response: { header: { resultCode: "00" }, body: { items: { item: [{ tmFc: 202611071400, t6: "o 강풍주의보 : 경기도(평택, 화성)" }] } } } };
      if (url.includes("getWthrWrnList")) return { response: { header: { resultCode: "00" }, body: { items: { item: [{ title: "[특보] 강풍주의보 발표" }] } } } };
      return { msg: "?" };
    });
    let now = NOW;
    const pd = makePublicData({ db, fetch: kmaFetch, getKey: () => "k", now: () => now });
    const w1 = await pd.weatherFor({ regions: ["경기_평택"], addresses: ["부산광역시 강서구"] }, staffAuth);
    eq("예보: 두 지역", Object.keys(w1.regions).sort(), ["경기_평택", "부산"]);
    has("예보: 격자 nx/ny 주소에", kmaFetch.calls.some((c) => c.url.includes("getVilageFcst") && c.url.includes("nx=62") && c.url.includes("ny=114") && c.url.includes("base_time=1400")));
    eq("예보: 저장(weatherCache)", db.store.get("weatherCache/경기_평택")?.hours?.["2026110715"]?.t, 11);
    eq("특보: 저장 + 지역", db.store.get("weatherCache/_warn")?.active?.[0]?.subs, ["평택", "화성"]);
    eq("특보: 제목", w1.warn.titles, ["[특보] 강풍주의보 발표"]);
    const n1 = kmaFetch.calls.length;
    now = NOW + 30 * 60e3;
    await pd.weatherFor({ regions: ["경기_평택"] }, staffAuth);
    eq("1시간 안은 기상청 안 부름", kmaFetch.calls.length, n1);
    now = NOW + 65 * 60e3;
    await pd.weatherFor({ regions: ["경기_평택"] }, staffAuth);
    has("1시간 지나면 다시", kmaFetch.calls.length > n1);
    await throwsCode("허브 · 직원 아님", () => pd.weatherFor({ regions: ["서울"] }, { uid: "nobody", token: {} }), "permission-denied");
    // 3시간 갱신: 오늘 · 내일 오더의 상하차 지역
    db.store.set("orders/o1", { 상차일: "2026-11-07", 상차지주소: "경기도 이천시 마장면", 하차지주소: "대전광역시 유성구" });
    db.store.set("dispatch/o2", { 상차일: "2026-11-08", 상차지주소: "인천 중구", 하차지주소: "모르는 곳" });
    db.store.set("orders/o3", { 상차일: "2026-11-01", 상차지주소: "제주시" });
    db.store.set("orders/o4", { 상차일: "2026-11-07", 상차지주소: "강원 춘천시", 배차상태: "배차취소" });
    db.store.set("hubOrders/h1", { 상차일: "2026-11-07", 상차시도: "충남", 상차시군구: "천안시", 하차시도: "경북", 하차시군구: "구미시" });
    now = NOW;
    const rf = await pd.weatherRefresh();
    eq("3시간 갱신: 지역 수(취소 · 지난 오더 · 모르는 주소 제외)", rf.regions, 5);
    has("3시간 갱신: 저장", ["경기_이천", "대전", "인천", "충남_천안", "경북_구미"].every((k) => db.store.get(`weatherCache/${k}`)));
    const pdNo = makePublicData({ db, fetch: kmaFetch, getKey: () => "", now: () => now });
    eq("3시간 갱신: 키 없으면 건너뜀", await pdNo.weatherRefresh(), { skipped: "no-key" });
    const wNo = await makePublicData({ db: fakeDb(), fetch: kmaFetch, getKey: () => "none", now: () => now }).weatherFor({ regions: ["서울"] }, { uid: "x", token: { email: "tjddnqkf@naver.com" } });
    eq("키 없고 자료 없음 → disabled", wNo.disabled, true);
    // 연동 설정 — 최고관리자만
    await throwsCode("연동 상태: 직원은 못 봄", () => pd.integrationStatus({}, staffAuth), "permission-denied");
    const st2 = await makePublicData({ db, fetch: kmaFetch, getKey: () => "none", now: () => now }).integrationStatus({ test: "nts" }, { uid: "x", token: { email: "tjddnqkf@naver.com" } });
    eq("연동 상태: 키 없음", [st2.nts.status, st2.kma.status], ["nokey", "nokey"]);
    const st3 = await pd.integrationStatus({ test: "kma" }, { uid: "x", token: { email: "tjddnqkf@naver.com" } });
    eq("연동 상태: 기상청 시험 연결됨", st3.kma.status, "ok");
  }

  // ───────── 팝빌 어댑터 ─────────
  {
    let loaded = 0;
    const loadSdk = () => { loaded++; throw new Error("꺼져 있으면 SDK를 불러오면 안 돼요"); };
    const off1 = createPopbill({ linkId: "", secretKey: "", config: { enabled: true }, loadSdk });
    eq("팝빌: 키 없음", [off1.enabled, off1.reason], [false, "no-key"]);
    eq("팝빌: 키 없음 → 발행 안 함", await off1.issueTaxInvoice("2208162517", { invoicerMgtKey: "A1" }), { ok: false, disabled: true, reason: "no-key" });
    const off2 = createPopbill({ linkId: "L", secretKey: "S", config: {}, loadSdk });
    eq("팝빌: 스위치 꺼짐", (await off2.sendSms("2208162517", { sender: "0212345678", receiver: "01012345678", content: "x" })).reason, "off");
    for (const fn of ["cancelTaxInvoice", "getTaxInvoiceState", "sendKakaoAlimtalk", "checkBizStatus", "bankAccountList", "bankTransactions", "hometaxCollect", "checkIsMember"]) {
      const r = await off2[fn]("2208162517", {});
      if (!r.disabled) has(`팝빌 꺼짐: ${fn}`, false);
    }
    eq("팝빌: 꺼져 있으면 SDK 안 불러옴", loaded, 0);
    eq("팝빌 상태 판정", popbillState({ linkId: "L", secretKey: "S", config: { enabled: true } }), { enabled: true, reason: "" });
    // 켜졌을 때(가짜 SDK — 팝빌 서버는 부르지 않는다)
    const seen = [];
    let cfg = null;
    const svc = (name) => new Proxy({}, { get: (_, m) => (...args) => {
      const ok = args[args.length - 2], ko = args[args.length - 1];
      seen.push([name, m, args.slice(0, -2)]);
      if (m === "registIssue") return ok({ code: 1, ntsConfirmNum: "2026110741000042" });
      if (m === "getJobState") return ok({ jobState: "3", errorCode: 1 });
      if (m === "requestJob") return ok("JOB123");
      if (m === "search") return ok({ total: 1, list: [{ tid: "1" }] });
      if (m === "checkCorpNums") return ok([{ corpNum: "2208162517", state: 1, type: 1 }, { corpNum: "1208147521", state: 2, type: 2, stateDate: "20250930" }]);
      if (m === "sendSMS") return ko({ code: -99999999, message: "잔액 부족" });
      return ok({ code: 1 });
    } });
    const fakeSdk = { config: (c) => { cfg = c; }, TaxinvoiceService: () => svc("tax"), KakaoService: () => svc("kakao"), MessageService: () => svc("msg"), ClosedownService: () => svc("close"), EasyFinBankService: () => svc("bank"), HTTaxinvoiceService: () => svc("ht") };
    const pb = createPopbill({ linkId: "L", secretKey: "S", config: { enabled: true, isTest: true }, loadSdk: () => fakeSdk, pollMs: 1 });
    const iss = await pb.issueTaxInvoice("220-81-62517", { invoicerMgtKey: "LW-20261107-1", invoicerCorpNum: "220-81-62517" }, { memo: "운송료" });
    eq("팝빌: 세금계산서 발행", [iss.ok, iss.ntsConfirmNum], [true, "2026110741000042"]);
    eq("팝빌: SDK 설정(테스트 환경)", [cfg.LinkID, cfg.IsTest], ["L", true]);
    eq("팝빌: registIssue 인자", seen[0][2].slice(0, 2).map((x) => (typeof x === "object" ? x.invoicerCorpNum : x)), ["2208162517", "2208162517"]);
    eq("팝빌: 문서번호 없으면 거절", (await pb.issueTaxInvoice("2208162517", {})).ok, false);
    eq("팝빌: 사업자번호 없으면 거절", (await pb.getTaxInvoiceState("", "A")).error, "연동회원 사업자번호가 없어요");
    const cb = await pb.checkBizStatus("2208162517", ["220-81-62517", "1208147521", "bad"]);
    eq("팝빌: 휴폐업조회", cb.rows.map((r) => r.state), ["active", "closed"]);
    const bt = await pb.bankTransactions("2208162517", { bankCode: "0004", accountNumber: "123-45", sDate: "20261101", eDate: "20261107" });
    eq("팝빌: 계좌 거래내역(요청 → 완료 → 조회)", [bt.ok, bt.jobId, bt.total], [true, "JOB123", 1]);
    const ht = await pb.hometaxCollect("2208162517", { queryType: "BUY", sDate: "20261001", eDate: "20261031" });
    eq("팝빌: 홈택스 매입 수집", [ht.ok, seen.find((s) => s[0] === "ht" && s[1] === "requestJob")[2][1]], [true, "BUY"]);
    const sm = await pb.sendSms("2208162517", { sender: "02-1234-5678", receiver: "010-1234-5678", content: "배차 완료" });
    eq("팝빌: 오류는 ok:false로", [sm.ok, sm.error], [false, "잔액 부족"]);
    const at = await pb.sendKakaoAlimtalk("2208162517", { templateCode: "T1", sender: "0212345678", receiver: "01012345678", content: "안내" });
    eq("팝빌: 알림톡(대체문자 C)", [at.ok, seen.find((s) => s[1] === "sendATS_one")[2][6]], [true, "C"]);
    // 관리 화면(popbillAdmin)
    const db = fakeDb();
    db.store.set("users/a1", { approved: true, role: "admin", companyName: "테스트운송" });
    db.store.set("users/u2", { approved: true, role: "user", companyName: "테스트운송" });
    const admin = makePopbillAdmin({ db, callerOf, getSecrets: () => ({}), now: () => NOW });
    const sv = await admin({ action: "saveMember", corpNum: "220-81-62517", corpName: "(주)테스트운송", status: "연동됨" }, { uid: "a1", token: {} });
    eq("팝빌 연동회원 저장(회사 관리자는 신청중으로)", [db.store.get("companyPopbill/테스트운송")?.corpNum, sv.member.status], ["2208162517", "신청중"]);
    await throwsCode("팝빌 연동회원: 일반 직원은 못 바꿈", () => admin({ action: "saveMember", corpNum: "2208162517" }, { uid: "u2", token: {} }), "permission-denied");
    await throwsCode("팝빌 연동회원: 번호 검증", () => admin({ action: "saveMember", corpNum: "2208162518" }, { uid: "a1", token: {} }), "invalid-argument");
    await throwsCode("팝빌 상태: 최고관리자만", () => admin({ action: "status" }, { uid: "a1", token: {} }), "permission-denied");
    const ck = await admin({ action: "checkMember" }, { uid: "a1", token: {} });
    eq("팝빌 연동 확인: 키 없으면 부르지 않음", ck.result.disabled, true);
    const stt = await admin({ action: "status" }, { uid: "tm", token: { email: "tjddnqkf@naver.com" } });
    eq("팝빌 상태(최고관리자)", [stt.enabled, stt.reason, stt.hasKeys, stt.members.length], [false, "no-key", false, 1]);
  }

  // ───────── 화면: 조회기 · 날씨 저장소(가짜 call) ─────────
  {
    const { createBizChecker, bizGuard, createWeatherStore } = await import("../src/publicDataClient.js");
    let n = 0;
    const ck = createBizChecker(async (name, d) => { n++; return { results: Object.fromEntries(d.bNos.map((b) => [b, { bNo: b, state: b === "1208147521" ? "closed" : "active", label: "" }])) }; });
    await ck.check(["220-81-62517", "1208147521", "2208162518"]);
    await ck.check(["2208162517"]);
    eq("조회기: 같은 번호는 다시 안 부름 · 틀린 번호는 화면에서", [n, ck.get("2208162518")?.state], [1, "invalid"]);
    let asked = "";
    eq("저장 전 확인: 폐업이면 묻고 취소하면 false", await bizGuard(ck, "1208147521", async (m) => { asked = m; return false; }), false);
    has("저장 전 확인 문구", /폐업/.test(asked));
    eq("저장 전 확인: 계속이면 그냥 통과", await bizGuard(ck, "2208162517", async () => false), true);
    eq("저장 전 확인: 번호 없으면 통과", await bizGuard(ck, "", async () => false), true);
    const ckOff = createBizChecker(async (name, d) => ({ results: { [d.bNos[0]]: { bNo: d.bNos[0], state: "unknown" } }, disabled: true, reason: "no-key" }));
    eq("저장 전 확인: 키 없으면 막지 않음", await bizGuard(ckOff, "2208162517", async () => false), true);
    eq("조회기: 키 없음 표시", ckOff.isDisabled(), true);
    const ckErr = createBizChecker(async () => { throw new Error("down"); });
    eq("저장 전 확인: 서버가 안 되면 막지 않음", await bizGuard(ckErr, "2208162517", async () => false), true);
    // 날씨 저장소: 저장된 값 먼저 · 오래된 곳만 서버에
    const T = Date.now();
    const calls = [];
    const docs = { 서울: { hours: { a: 1 }, fetchedAt: T }, 부산: { hours: { b: 1 }, fetchedAt: T - 5 * 3600e3 }, _warn: { active: [], fetchedAt: T } };
    const ws = createWeatherStore({ readDoc: async (k) => docs[k] || null, call: async (name, d) => { calls.push(d.regions); return { regions: Object.fromEntries(d.regions.map((k) => [k, { hours: { fresh: 1 }, fetchedAt: T }])), warn: { active: [{ type: "강풍주의보" }] } }; } });
    ws.request(["서울", "부산", "경기_평택"]);
    ws.request(["서울"]);
    await new Promise((r) => setTimeout(r, 150));
    eq("날씨: 서버에는 오래된 곳 · 없는 곳만", calls, [["부산", "경기_평택"]]);
    eq("날씨: 저장된 값 그대로", ws.region("서울").hours, { a: 1 });
    eq("날씨: 새로 받은 값", ws.region("부산").hours, { fresh: 1 });
    eq("날씨: 특보", ws.warn().active[0].type, "강풍주의보");
    const wsOff = createWeatherStore({ readDoc: async () => null, call: async () => ({ regions: {}, disabled: true }) });
    wsOff.request(["서울"]);
    await new Promise((r) => setTimeout(r, 120));
    eq("날씨: 키 없으면 숨김 표시", [wsOff.isDisabled(), wsOff.region("서울")], [true, null]);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
