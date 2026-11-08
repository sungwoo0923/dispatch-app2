// 💬🏦 2026-11-08 알림톡 배차 알림 · 은행 입금 자동 매칭 단위 테스트
//  실행: node scripts/popbillAuto.test.mjs  (인터넷 · 에뮬레이터 필요 없음 — DB · 팝빌 모두 가짜, 실제 팝빌 호출 없음)
import { createRequire } from "module";
import * as A from "../functions/alimtalkCore.mjs";
import * as M from "../functions/arMatchCore.mjs";

const require = createRequire(import.meta.url);
const { makeAlimtalk } = require("../functions/alimtalk.js");
const { makeBankSync } = require("../functions/bankSync.js");
const { createPopbill } = require("../functions/popbill.js");
const { callerOf } = require("../functions/publicData.js");

let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` :: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };
const has = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${name} ${cond ? "" : extra}`); };
const throwsCode = async (name, fn, code) => { try { await fn(); has(name, false, "(안 던짐)"); } catch (e) { eq(name, e.code, code); } };

// ───────── 가짜 Firestore(create · update 점 경로 · delete · where ==/in/>=) ─────────
const DEL = { __del: true };
const FieldValue = { serverTimestamp: () => ({ __ts: true }), delete: () => DEL };
function setPath(obj, path, v) {
  const ks = path.split("."); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { o[ks[i]] = o[ks[i]] && typeof o[ks[i]] === "object" ? { ...o[ks[i]] } : {}; o = o[ks[i]]; }
  if (v === DEL) delete o[ks.at(-1)]; else o[ks.at(-1)] = v;
}
const deepMerge = (a, b) => { const o = { ...(a || {}) }; Object.entries(b || {}).forEach(([k, v]) => { if (v === DEL) delete o[k]; else if (v && typeof v === "object" && !Array.isArray(v) && !v.__ts && o[k] && typeof o[k] === "object" && !Array.isArray(o[k])) o[k] = deepMerge(o[k], v); else o[k] = v; }); return o; };
function fakeDb() {
  const store = new Map();
  let auto = 0;
  const clone = (d) => (d === undefined ? undefined : JSON.parse(JSON.stringify(d)));
  const snap = (path) => { const d = store.get(path); return { exists: d !== undefined, id: path.split("/").pop(), data: () => clone(d), ref: ref(...path.split("/")) }; };
  function ref(col, id) {
    return {
      id, path: `${col}/${id}`,
      async get() { return snap(`${col}/${id}`); },
      async set(v, opt) { const p = `${col}/${id}`; store.set(p, clone(opt?.merge ? deepMerge(store.get(p), v) : deepMerge({}, v))); },
      async create(v) { const p = `${col}/${id}`; if (store.has(p)) throw Object.assign(new Error("6 ALREADY_EXISTS: Document already exists"), { code: 6 }); store.set(p, clone(v)); },
      async update(v) { const p = `${col}/${id}`; if (!store.has(p)) throw Object.assign(new Error("not found"), { code: 5 }); const o = clone(store.get(p)); Object.entries(v).forEach(([k, x]) => setPath(o, k, x)); store.set(p, o); },
      async delete() { store.delete(`${col}/${id}`); },
    };
  }
  const query = (col, filters = [], lim = Infinity) => ({
    where: (f, op, v) => query(col, [...filters, [f, op, v]], lim),
    limit: (n) => query(col, filters, n),
    async get() {
      let docs = [...store.keys()].filter((k) => k.startsWith(`${col}/`) && !k.slice(col.length + 1).includes("/")).map(snap);
      docs = docs.filter((d) => filters.every(([f, op, v]) => { const x = d.data()[f]; return op === "in" ? v.includes(x) : op === ">=" ? String(x ?? "") >= v : x === v; }));
      return { docs: docs.slice(0, lim) };
    },
  });
  return { store, collection: (col) => ({ doc: (id) => ref(col, id || `auto${++auto}`), ...query(col) }) };
}
const AUTH = (uid, email = "") => ({ uid, token: { email } });
function seedUsers(db) {
  db.store.set("users/u1", { companyName: "테스트운송", role: "admin", approved: true });
  db.store.set("users/u2", { companyName: "다른운송", role: "admin", approved: true });
  db.store.set("users/v1", { companyName: "테스트운송", role: "viewer", approved: true });
}

// 가짜 팝빌 어댑터(호출 기록)
function fakePb({ enabled = true, kakaoOk = true, smsOk = true, list = [] } = {}) {
  const calls = [];
  return {
    calls, enabled, reason: enabled ? "" : "no-key",
    async sendKakaoAlimtalk(corp, m) { calls.push(["kakao", corp, m.templateCode, m.receiver, m.content]); return kakaoOk ? { ok: true, receiptNum: "K1" } : { ok: false, error: "템플릿이 승인되지 않았어요" }; },
    async sendLms(corp, m) { calls.push(["lms", corp, m.receiver, m.content]); return smsOk ? { ok: true, receiptNum: "S1" } : { ok: false, error: "잔액 부족" }; },
    async bankTransactions(corp, q) { calls.push(["bank", corp, q.bankCode, q.accountNumber, q.tradeType]); return { ok: true, list: typeof list === "function" ? list() : list }; },
    async bankAccountList() { return { ok: true, accounts: [] }; },
  };
}

// ════════════════ 1. 알림톡 규칙 ════════════════
{
  eq("토글 기본값: 회사 켜짐 → 켜짐", A.alimtalkFlagFor(undefined, { alimtalk: { enabled: true } }), true);
  eq("토글 기본값: 회사 꺼짐 → 꺼짐", A.alimtalkFlagFor(undefined, { alimtalk: { enabled: false } }), false);
  eq("토글 기본값: 설정 없음 → 꺼짐", A.alimtalkFlagFor(undefined, {}), false);
  eq("이 오더만 끔(회사 켜짐)", A.alimtalkFlagFor(false, { alimtalk: { enabled: true } }), false);
  eq("이 오더만 켬(회사 꺼짐)", A.alimtalkFlagFor(true, { alimtalk: { enabled: false } }), true);
  const s = A.alimtalkSettingsOf({ alimtalk: { enabled: true, toDriver: false, templates: { client: "T1" } } });
  eq("설정 기본값 채우기", [s.enabled, s.toClient, s.toDriver, s.smsFallback, s.templates.client, s.templates.driver], [true, true, false, true, "T1", ""]);

  const order = { 거래처명: "(주)한빛", 상차일: "2026-11-08", 상차시간: "09:00", 상차지명: "평택항", 상차지주소: "경기 평택시", 하차지명: "이천센터", 하차지주소: "경기 이천시", 상차지담당자: "김상차", 상차지담당자번호: "01011112222", 하차지담당자: "", 하차지담당자번호: "", 차량번호: "경기81바1234", 이름: "박기사", 전화번호: "010-3333-4444" };
  const vars = A.buildAlimtalkVars(order, { company: "테스트운송", contactPhone: "0212345678" });
  const text = A.alimtalkContent("client", vars);
  has("템플릿 채우기 — 변수가 남지 않음", !/#\{/.test(text), text);
  has("템플릿 채우기 — 값", text.includes("[테스트운송] 배차 확정 안내") && text.includes("- 상차일시: 2026-11-08 09:00") && text.includes("- 기사님: 박기사 010-3333-4444") && text.includes("문의: 02-1234-5678"), text);
  const dtext = A.alimtalkContent("driver", vars);
  has("빈 값은 - 로(카카오는 빈 변수를 막는다)", dtext.includes("- 하차 담당자: -") && dtext.includes("- 상차 담당자: 김상차 010-1111-2222"), dtext);
  eq("fillTemplate 기본", A.fillTemplate("안녕 #{이름} #{없음}", { 이름: "홍" }), "안녕 홍 -");
  eq("템플릿 변수 목록이 글과 같음", ["client", "driver"].map((k) => [...A.ALIMTALK_TEMPLATES[k].text.matchAll(/#\{([^}]+)\}/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i).sort().join()), ["client", "driver"].map((k) => [...A.ALIMTALK_TEMPLATES[k].vars].sort().join()));
  has("템플릿에 em dash 없음", !/[—–]/.test(A.ALIMTALK_TEMPLATES.client.text + A.ALIMTALK_TEMPLATES.driver.text));

  const base = { 알림톡: true, 차량번호: "" };
  eq("배차중 → 배차완료: 보냄", A.shouldSendAlimtalk(base, { ...base, 차량번호: "경기81바1234" }).send, true);
  eq("새 오더(차량 포함): 보냄", A.shouldSendAlimtalk(null, { ...base, 차량번호: "경기81바1234" }).send, true);
  eq("승인대기(지입 수락 전): 안 보냄", A.shouldSendAlimtalk(base, { ...base, 차량번호: "경기81바1234", 기사확인상태: "대기" }).send, false);
  eq("승인대기 → 수락: 보냄", A.shouldSendAlimtalk({ ...base, 차량번호: "경기81바1234", 기사확인상태: "대기" }, { ...base, 차량번호: "경기81바1234", 기사확인상태: "수락" }).send, true);
  eq("같은 배차 다른 칸 수정: 안 보냄", A.shouldSendAlimtalk({ ...base, 차량번호: "경기81바1234" }, { ...base, 차량번호: "경기81바 1234", 메모: "x" }).reason, "no-change");
  eq("차량 바뀜: 보냄", A.shouldSendAlimtalk({ ...base, 차량번호: "경기81바1234" }, { ...base, 차량번호: "서울12가3456" }).send, true);
  eq("오더 알림톡 꺼짐: 안 보냄", A.shouldSendAlimtalk(null, { 차량번호: "경기81바1234", 알림톡: false }).reason, "off");
  eq("지급방식 취소: 안 보냄", A.shouldSendAlimtalk(null, { ...base, 차량번호: "경기81바1234", 지급방식: "취소" }).send, false);
  eq("화주 전송 사본: 안 보냄", A.shouldSendAlimtalk(null, { ...base, 차량번호: "경기81바1234", source: "transport_transmit" }).reason, "copy");
  eq("이미 보낸 배차(오더 결과): 안 보냄", A.shouldSendAlimtalk(null, { ...base, 차량번호: "경기81바1234", 알림톡결과: { status: "sent", plate: "경기81바1234" } }).reason, "already");
  eq("배차완료 상태에서 알림톡 켬: 보냄", A.shouldSendAlimtalk({ 차량번호: "경기81바1234", 알림톡: false }, { 차량번호: "경기81바1234", 알림톡: true }).send, true);
  eq("휴대폰만", [A.mobileOf("010-1234-5678"), A.mobileOf("02-123-4567"), A.mobileOf("")], ["01012345678", "", ""]);
  eq("idempotency 키", A.alimtalkKey("orders", "abc", "경기81바 1234", "client"), "orders_abc_경기81바1234_client");
  eq("칩 글자", [A.alimtalkChipOf({ status: "sent", at: Date.UTC(2026, 10, 8, 0, 31) })?.label, A.alimtalkChipOf({ status: "failed", items: { c: { error: "템플릿 없음" } } })?.detail, A.alimtalkChipOf({ status: "off" })?.label], ["알림톡 보냄 09:31", "템플릿 없음", "팝빌 연결 전"]);
  eq("결과 묶기", [A.overallStatus({ a: { status: "sent" }, b: { status: "sms" } }), A.overallStatus({ a: { status: "sent" }, b: { status: "failed" } }), A.overallStatus({ a: { status: "off" } })], ["sms", "partial", "off"]);
}

// ════════════════ 2. 알림톡 서버(트리거 · 수동) ════════════════
{
  const db = fakeDb(); seedUsers(db);
  db.store.set("popbillSettings/테스트운송", { alimtalk: { enabled: true, toClient: true, toDriver: true, templates: { client: "TPL_C", driver: "TPL_D" }, senderNumber: "0212345678", contactPhone: "02-1234-5678" } });
  db.store.set("companyPopbill/테스트운송", { corpNum: "1088112342", corpName: "(주)테스트운송", status: "연동됨" });
  db.store.set("clients/c1", { companyName: "테스트운송", 거래처명: "(주)한빛", 담당자: "이담당", 연락처: "02-555-1111", contacts: [{ name: "이담당", phone: "010-7777-8888", isPrimary: true }] });
  db.store.set("drivers/d1", { companyName: "테스트운송", 차량번호: "경기81바1234", 이름: "박기사", 전화번호: "010-3333-4444" });
  const pb = fakePb();
  let T = 1_762_560_000_000;
  const at = makeAlimtalk({ db, FieldValue, getPopbill: async () => pb, callerOf, now: () => ++T, loadCore: async () => A });
  const order = { companyName: "테스트운송", 알림톡: true, 거래처명: "(주)한빛", 상차일: "2026-11-08", 상차지명: "평택항", 하차지명: "이천", 차량번호: "경기81바1234", 이름: "박기사", 전화번호: "010-3333-4444" };
  db.store.set("orders/o1", order);
  const r1 = await at.onOrderWrite({ col: "orders", id: "o1", before: { ...order, 차량번호: "" }, after: order });
  eq("트리거: 거래처 · 기사 둘 다 알림톡", [r1.status, pb.calls.filter((c) => c[0] === "kakao").map((c) => [c[2], c[3]])], ["sent", [["TPL_C", "01077778888"], ["TPL_D", "01033334444"]]]);
  eq("오더에 결과 남김", db.store.get("orders/o1").알림톡결과?.status, "sent");
  const r2 = await at.onOrderWrite({ col: "orders", id: "o1", before: { ...order, 차량번호: "" }, after: order });
  eq("idempotency: 같은 배차 두 번째 실행은 안 보냄(오더+차량번호 키)", [r2.status, pb.calls.filter((c) => c[0] === "kakao").length], ["dup", 2]);
  const logs = [...db.store.keys()].filter((k) => k.startsWith("alimtalkLogs/"));
  eq("기록: 받는 사람마다 1건 · 번호 가림", [logs.length, db.store.get("alimtalkLogs/orders_o1_경기81바1234_client")?.phone, db.store.get("alimtalkLogs/orders_o1_경기81바1234_client")?.companyName], [2, "010-****-8888", "테스트운송"]);
  has("기록에 내용 · 비밀값 없음", logs.every((k) => !("content" in db.store.get(k)) && !JSON.stringify(db.store.get(k)).includes("SecretKey")));
  // 차량 바뀌면 새 배차로 다시
  const order2 = { ...order, 차량번호: "서울12가3456", 이름: "최기사", 전화번호: "010-9999-0000" };
  await at.onOrderWrite({ col: "orders", id: "o1", before: order, after: order2 });
  eq("차량이 바뀌면 새 배차로 보냄", pb.calls.filter((c) => c[0] === "kakao").length, 4);
  // 수동 다시 보내기
  db.store.set("orders/o1", { ...order, 알림톡결과: { status: "sent", plate: "경기81바1234" } });
  const m = await at.sendManual({ col: "orders", id: "o1", targets: ["driver"] }, AUTH("u1"));
  eq("수동 보내기: 이미 보냈어도 다시(기사만)", [m.status, pb.calls.filter((c) => c[0] === "kakao").length, pb.calls.at(-1)[2]], ["sent", 5, "TPL_D"]);
  await throwsCode("수동: 다른 회사 오더 막음", () => at.sendManual({ col: "orders", id: "o1" }, AUTH("u2")), "permission-denied");
  await throwsCode("수동: 조회전용 막음", () => at.sendManual({ col: "orders", id: "o1" }, AUTH("v1")), "permission-denied");
  await throwsCode("수동: 잘못된 컬렉션", () => at.sendManual({ col: "users", id: "u1" }, AUTH("u1")), "invalid-argument");
  db.store.set("orders/o2", { ...order, 차량번호: "" });
  await throwsCode("수동: 배차완료 전 막음", () => at.sendManual({ col: "orders", id: "o2" }, AUTH("u1")), "failed-precondition");

  // 문자 대체
  const pb2 = fakePb({ kakaoOk: false });
  const at2 = makeAlimtalk({ db, FieldValue, getPopbill: async () => pb2, callerOf, now: () => ++T, loadCore: async () => A });
  db.store.set("orders/o3", order);
  const r3 = await at2.onOrderWrite({ col: "orders", id: "o3", before: null, after: order });
  eq("알림톡 실패 → 문자로", [r3.status, pb2.calls.map((c) => c[0])], ["sms", ["kakao", "lms", "kakao", "lms"]]);
  has("문자 내용 = 알림톡 내용", pb2.calls[1][3] === pb2.calls[0][4]);
  eq("칩: 문자로 보냄", A.alimtalkChipOf(db.store.get("orders/o3").알림톡결과).label.startsWith("문자로 보냄"), true);
  // 문자 대체 끔
  db.store.set("popbillSettings/테스트운송", { alimtalk: { smsFallback: false } }, {});
  const s0 = db.store.get("popbillSettings/테스트운송");
  db.store.set("popbillSettings/테스트운송", { ...s0, alimtalk: { enabled: true, templates: { client: "TPL_C", driver: "TPL_D" }, senderNumber: "0212345678", smsFallback: false } });
  const pb3 = fakePb({ kakaoOk: false });
  const at3 = makeAlimtalk({ db, FieldValue, getPopbill: async () => pb3, callerOf, now: () => ++T, loadCore: async () => A });
  db.store.set("orders/o4", order);
  const r4 = await at3.onOrderWrite({ col: "orders", id: "o4", before: null, after: order });
  eq("문자 대체 끔 → 실패 · 사유", [r4.status, pb3.calls.map((c) => c[0]), A.alimtalkChipOf(r4).detail], ["failed", ["kakao", "kakao"], "템플릿이 승인되지 않았어요"]);
  // 팝빌 꺼짐
  const pb4 = fakePb({ enabled: false });
  const at4 = makeAlimtalk({ db, FieldValue, getPopbill: async () => pb4, callerOf, now: () => ++T, loadCore: async () => A });
  db.store.set("orders/o5", order);
  const r5 = await at4.onOrderWrite({ col: "orders", id: "o5", before: null, after: order });
  eq("팝빌 연결 전: 부르지 않고 off", [r5.status, pb4.calls.length, A.alimtalkChipOf(r5).label], ["off", 0, "팝빌 연결 전"]);
  // 번호 없음
  const pb5 = fakePb();
  const at5 = makeAlimtalk({ db, FieldValue, getPopbill: async () => pb5, callerOf, now: () => ++T, loadCore: async () => A });
  const noPhone = { ...order, 거래처명: "없는거래처", 차량번호: "인천99사9999", 이름: "무번호", 전화번호: "" };
  db.store.set("orders/o6", noPhone);
  const r6 = await at5.onOrderWrite({ col: "orders", id: "o6", before: null, after: noPhone });
  eq("번호 없으면 건너뜀", [r6.status, pb5.calls.length, r6.items.client.error], ["skipped", 0, "거래처 담당자 휴대폰 번호가 없어요"]);
  // 알림톡 플래그 없는 오더는 트리거가 아무것도 안 함
  const r7 = await at5.onOrderWrite({ col: "orders", id: "o7", before: null, after: { ...order, 알림톡: undefined } });
  eq("플래그 없는 오더: 안 보냄", r7.skipped, "off");

  // 실제 어댑터(가짜 SDK)로 장문 문자 인자 확인
  const sent = [];
  const fakeSdk = { config() {}, MessageService: () => ({ sendLMS: (...a) => { sent.push(a.slice(0, 11)); a[11]("R9"); } }) };
  const real = createPopbill({ linkId: "L", secretKey: "S", config: { enabled: true }, loadSdk: () => fakeSdk });
  const lr = await real.sendLms("108-81-12342", { sender: "02-1234-5678", receiver: "010-1111-2222", subject: "배차 안내", content: "내용" });
  eq("어댑터 sendLms → SDK sendLMS", [lr.ok, lr.receiptNum, sent[0][0], sent[0][1], sent[0][2], sent[0][4], sent[0][5]], [true, "R9", "1088112342", "0212345678", "01011112222", "배차 안내", "내용"]);
  const off = createPopbill({ linkId: "", secretKey: "", config: { enabled: true }, loadSdk: () => { throw new Error("불리면 안 됨"); } });
  eq("키 없으면 sendLms 꺼짐", (await off.sendLms("1088112342", {})).disabled, true);
}

// ════════════════ 3. 입금 매칭 규칙 ════════════════
const ORD = (id, client, ym, fare, extra = {}) => ({ _id: id, __col: "orders", 거래처명: client, 상차일: `${ym}-10`, 청구운임: fare, 배차상태: "배차완료", ...extra });
{
  const orders = [ORD("a1", "(주)한빛물류", "2026-09", 1000000), ORD("a2", "(주)한빛물류", "2026-10", 500000), ORD("b1", "대한통운 평택", "2026-10", 200000), ORD("x1", "취소거래처", "2026-10", 300000, { 배차상태: "배차취소" })];
  const months = M.buildArMonths({ orders, paidMap: M.arPaidMapOf([{ client: "(주)한빛물류", yyyymm: "2026-09", amount: 100000 }]) });
  eq("달 묶기 · 부가세 포함 · 입금 빼기", months.get("(주)한빛물류").map((e) => [e.yyyymm, e.due, e.paid, e.remain]), [["2026-09", 1100000, 100000, 1000000], ["2026-10", 550000, 0, 550000]]);
  eq("배차완료만", months.has("취소거래처"), false);
  const r = M.matchDeposits({ deposits: [{ name: "한빛물류", amount: 1000000 }, { name: "대한통운평택", amount: 100000 }, { name: "김철수", amount: 550000 }, { name: "모름", amount: 1 }], months });
  eq("이름일치 · 딱 맞는 달", [r.matches[0].client, r.matches[0].kind, r.matches[0].confidence, r.matches[0].alloc[0].yyyymm], ["(주)한빛물류", "정산완료", "이름일치", "2026-09"]);
  eq("일부 입금", [r.matches[1].client, r.matches[1].kind], ["대한통운 평택", "일부입금"]);
  eq("이름이 달라도 금액이 딱 맞는 달이 하나면 제안", [r.matches[2].client, r.matches[2].confidence], ["(주)한빛물류", "금액만 일치"]);
  eq("못 맞춘 입금", r.unmatched.map((u) => u.reason), ["맞는 거래처·금액 없음"]);
  eq("자동 반영 기준", r.matches.map(M.isConfidentMatch), [true, false, false]);
  const r2 = M.matchDeposits({ deposits: [{ name: "김철수", amount: 1000000 }], months, aliases: { 김철수: "(주)한빛물류" } });
  eq("배운 별칭으로 맞춤", [r2.matches[0].client, r2.matches[0].confidence, M.isConfidentMatch(r2.matches[0])], ["(주)한빛물류", "별칭", true]);
  eq("별칭 배우기", [M.aliasFor("김 철수", "(주)한빛물류"), M.aliasFor("(주)한빛물류", "(주)한빛물류")], [{ key: "김철수", client: "(주)한빛물류" }, null]);
  const ov = M.matchDeposits({ deposits: [{ name: "한빛물류", amount: 2000000 }], months });
  eq("초과입금은 자동 반영 안 함", [ov.matches[0].kind, M.isConfidentMatch(ov.matches[0])], ["초과입금", false]);
  const sug = M.suggestClients({ name: "한빛", amount: 550000 }, months);
  eq("후보 거래처(금액 같은 달 먼저)", sug[0].client, "(주)한빛물류");
  // 은행 엑셀 예전 식과 같은지(여러 달 배분)
  const p = M.planForClient(months, "(주)한빛물류", 1550000);
  eq("오래된 달부터 채움(여러 달 정산)", [p.kind, p.alloc.map((a) => [a.yyyymm, a.amount, a.full])], ["여러 달 정산", [["2026-09", 1000000, true], ["2026-10", 550000, true]]]);
  // 거래 중복 빼기
  const raws = [{ tid: "T1", trdt: "20261108093100", accIn: "880000", remark1: "김철수" }, { tid: "T1", trdt: "20261108093100", accIn: "880000", remark1: "김철수" }, { tid: "T2", accIn: "0", accOut: "5000" }, { tid: "T3", trdt: "20261108101500", accIn: "1000", remark1: "이영희" }];
  const nd = M.newDeposits(raws, [M.bankTxnDocId("테스트운송", "acc1", "T3")], "테스트운송", "acc1");
  eq("거래 중복 · 출금 · 이미 받은 거래 빼기", nd.map((d) => [d.tid, d.date, d.time, d.amount, d.name]), [["T1", "2026-11-08", "09:31", 880000, "김철수"]]);
}

// ════════════════ 4. 은행 동기화 서버 ════════════════
{
  const db = fakeDb(); seedUsers(db);
  db.store.set("popbillSettings/테스트운송", { companyName: "테스트운송", bankAccounts: [{ id: "acc1", bankCode: "0003", accountNumber: "12345678901234", holder: "(주)테스트운송", enabled: true }] });
  db.store.set("popbillSettings/다른운송", { companyName: "다른운송", bankAccounts: [] });
  db.store.set("companyPopbill/테스트운송", { corpNum: "1088112342", status: "연동됨" });
  db.store.set("orders/a1", ORD("a1", "(주)한빛물류", "2026-10", 1000000, { companyName: "테스트운송" }));
  db.store.set("orders/a2", ORD("a2", "(주)한빛물류", "2026-10", 500000, { companyName: "테스트운송" }));
  db.store.set("dispatch/b1", { ...ORD("b1", "대한통운 평택", "2026-10", 200000, { companyName: "테스트운송" }), __col: "dispatch" });
  db.store.set("orders/z1", ORD("z1", "남의거래처", "2026-10", 1000000, { companyName: "다른운송" }));
  let list = [{ tid: "T1", trdt: "20261108093100", accIn: "1650000", remark1: "한빛물류" }, { tid: "T2", trdt: "20261108101500", accIn: "220000", remark1: "김민수" }];
  const pb = fakePb({ list: () => list });
  const NOW = Date.UTC(2026, 10, 8, 3, 0);
  const bs = makeBankSync({ db, FieldValue, getPopbill: async () => pb, callerOf, now: () => NOW, loadCore: async () => M });
  const s1 = await bs.syncCompany("테스트운송");
  eq("동기화: 새 입금 2 · 자동 1 · 확인 1", [s1.new, s1.auto, s1.review], [2, 1, 1]);
  eq("팝빌 호출: 입금만 · 계좌", pb.calls[0], ["bank", "1088112342", "0003", "12345678901234", ["I"]]);
  const pays = [...db.store.entries()].filter(([k]) => k.startsWith("arPayments/")).map(([, v]) => v);
  eq("자동 반영 = 입금 처리와 같은 기록(+auto · source bank)", pays.map((p) => [p.company, p.client, p.yyyymm, p.amount, p.full, p.depositName, p.auto, p.source]), [["테스트운송", "(주)한빛물류", "2026-10", 1650000, true, "한빛물류", true, "bank"]]);
  eq("다 채운 달은 정산완료", [db.store.get("orders/a1").정산상태?.["2026-10"], db.store.get("orders/a2").정산상태?.["2026-10"], db.store.get("orders/a1").정산일?.["2026-10"]], ["정산완료", "정산완료", "2026-11-08"]);
  const t1 = db.store.get(`bankTxns/${M.bankTxnDocId("테스트운송", "acc1", "T1")}`);
  const t2id = M.bankTxnDocId("테스트운송", "acc1", "T2");
  const t2 = db.store.get(`bankTxns/${t2id}`);
  eq("거래 문서: 회사 · 상태", [t1.companyName, t1.status, t2.status, t2.suggestions?.[0]?.client], ["테스트운송", "auto", "review", "대한통운 평택"]);
  // 같은 거래 다시 받아도 한 번만
  const s2 = await bs.syncCompany("테스트운송");
  eq("동기화 다시: 이미 받은 거래는 건너뜀", [s2.new, [...db.store.keys()].filter((k) => k.startsWith("bankTxns/")).length, [...db.store.keys()].filter((k) => k.startsWith("arPayments/")).length], [0, 2, 1]);
  // 확인 목록 — 다른 회사는 못 건드림
  await throwsCode("확정: 다른 회사 입금 막음", () => bs.action({ action: "confirm", id: t2id, client: "남의거래처" }, AUTH("u2")), "permission-denied");
  await throwsCode("확정: 조회전용 막음", () => bs.action({ action: "confirm", id: t2id }, AUTH("v1")), "permission-denied");
  const c = await bs.action({ action: "confirm", id: t2id, client: "대한통운 평택" }, AUTH("u1", "a@x.kr"));
  eq("확정 → 반영 · 별칭 배움", [c.status, c.kind, c.learned, db.store.get("bankAliases/테스트운송")?.map?.["김민수"], db.store.get("dispatch/b1").정산상태?.["2026-10"]], ["confirmed", "정산완료", true, "대한통운 평택", "정산완료"]);
  await throwsCode("확정: 이미 처리한 입금", () => bs.action({ action: "confirm", id: t2id }, AUTH("u1")), "failed-precondition");
  // 다음 입금은 배운 별칭으로 자동
  db.store.set("orders/b2", ORD("b2", "대한통운 평택", "2026-11", 300000, { companyName: "테스트운송" }));
  list = [{ tid: "T3", trdt: "20261108120000", accIn: "330000", remark1: "김민수" }];
  const s3 = await bs.syncCompany("테스트운송");
  eq("배운 별칭으로 다음 입금 자동 반영", [s3.auto, db.store.get(`bankTxns/${M.bankTxnDocId("테스트운송", "acc1", "T3")}`).match?.confidence], [1, "별칭"]);
  // 되돌리기
  const t1id = M.bankTxnDocId("테스트운송", "acc1", "T1");
  const u = await bs.action({ action: "undo", id: t1id }, AUTH("u1"));
  eq("되돌리기 → 입금 기록 지움 · 정산상태 예전대로 · 확인 목록", [u.status, [...db.store.values()].filter((v) => v.bankTxnId === t1id).length, db.store.get("orders/a1").정산상태?.["2026-10"] ?? null, db.store.get("orders/a1").정산일?.["2026-10"] ?? null], ["review", 0, null, null]);
  const ig = await bs.action({ action: "ignore", id: t1id }, AUTH("u1"));
  eq("무시", ig.status, "ignored");
  // 팝빌 꺼짐
  const pbOff = fakePb({ enabled: false });
  const bsOff = makeBankSync({ db, FieldValue, getPopbill: async () => pbOff, callerOf, now: () => NOW, loadCore: async () => M });
  const so = await bsOff.syncCompany("테스트운송");
  eq("팝빌 연결 전: 부르지 않고 상태만", [so.off, pbOff.calls.length, db.store.get("bankSyncState/테스트운송").status], [true, 0, "off"]);
  const all = await bsOff.syncAll();
  eq("syncAll: 계좌 켠 회사만", all.map((x) => x.company), ["테스트운송"]);
  const st = await bsOff.action({ action: "status" }, AUTH("u2"));
  eq("상태 조회는 자기 회사만", [st.company, st.popbill.enabled], ["다른운송", false]);
  await throwsCode("모르는 요청", () => bs.action({ action: "drop", id: t1id }, AUTH("u1")), "invalid-argument");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
