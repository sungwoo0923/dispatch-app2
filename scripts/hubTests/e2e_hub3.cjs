// ⭐ 2026-11-07 로지스웹 허브 3차 E2E(에뮬레이터 전용 · 배포 안 함) — Firestore · Auth · Storage · Functions 에뮬레이터 + Playwright
//  ① 배차 프로그램 [저장 + 허브 등록](src/hubShare.js 그대로) → 원래 오더에 연결 · 확정 때 차량번호 · 기사 · 배차방식 로지스허브 · 기사운임/청구운임(선착불 vs 인수증) · 지급방식 · 새 기사 자동 등록 · 취소 되돌림
//  ② 운송완료만 남긴 단계 · 위치 공유 시작/끝(기록 삭제) · 운송완료 뒤 인수증·전표 → 로지스웹 첨부
//  ③ 예치금: 확정 때 운임 보류(200만 → 190만) · 취소 전액 환불 · 회차 합의(1만만 남기고 9만 환불) · 계산서 확인 → 지급일 지급 · 등록자 지급완료 · 출금 · 가상계좌 입금
//  ④ 실계좌 없으면 배차신청 막힘 · 고객관리 자동 저장 · 자동완성 · 로지스웹 상하차지거래처 자동완성 · 새 장소 자동 등록 · 지역 보드(내 위치 + 3곳) · 오더복사(같은 회사만)
//  실행 순서(포트는 firebase.hubtest.json):
//   1) firebase emulators:start --only auth,firestore,storage,functions --project demo-kpflow --config firebase.hubtest.json
//   2) cd cafe-site && VITE_USE_EMULATOR=1 VITE_EMU_AUTH_PORT=19099 VITE_EMU_FS_PORT=18080 VITE_EMU_STORAGE_PORT=19199 VITE_EMU_FN_PORT=15001 npx vite --port 5361
//   3) (선택) 배차 프로그램 화면: VITE_USE_EMULATOR=1 VITE_EMU_AUTH_PORT=19099 VITE_EMU_FS_PORT=18080 npx vite --port 5362
//   4) node scripts/hubTests/e2e_hub3.cjs   (화면 저장: HUB_SHOTS 폴더)
const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "../..");
const P = { fs: process.env.EMU_FS_PORT || 18080, auth: process.env.EMU_AUTH_PORT || 19099, st: process.env.EMU_ST_PORT || 19199, fn: process.env.EMU_FN_PORT || 15001 };
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${P.fs}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${P.auth}`;
process.env.FIREBASE_STORAGE_EMULATOR_HOST = `127.0.0.1:${P.st}`;
const req = (m) => require(require.resolve(m, { paths: [ROOT, path.join(ROOT, "functions")] }));
const admin = req("firebase-admin");
const { chromium, devices } = require(require.resolve("playwright", { paths: [process.env.PLAYWRIGHT_DIR || "/opt/node-tools/node_modules", ROOT] }));
const fb = { app: req("firebase/app"), auth: req("firebase/auth"), fs: req("firebase/firestore") };

const OUT = process.env.HUB_SHOTS || "/tmp/claude-0/-home-user-dispatch-app2/dff9cc41-f4fc-5104-a1e1-a526f03e5d42/scratchpad/hub3";
const HUB = process.env.HUB_URL || "http://127.0.0.1:5361";
const MAIN = process.env.MAIN_URL || "http://127.0.0.1:5362";
fs.mkdirSync(OUT, { recursive: true });
admin.initializeApp({ projectId: "demo-kpflow" });
const db = admin.firestore();
const auth = admin.auth();
const FV = admin.firestore.FieldValue;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kst = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
const log = []; let ok = 0, bad = 0;
const check = (name, cond, extra = "") => { if (cond) { ok++; log.push(`PASS ${name}`); } else { bad++; log.push(`FAIL ${name} ${extra}`); } console.log(log[log.length - 1]); };
const errs = [];
let browser, docPage;
async function until(fn, ms = 20000, step = 400) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { try { v = await fn(); if (v) return v; } catch { /* 다시 */ } await sleep(step); } return v; }
const W = async (uid) => (await db.doc(`hubWallets/${uid}`).get()).data() || {};
const O = async (id) => (await db.doc(`hubOrders/${id}`).get()).data() || {};
const LW = async (id) => (await db.doc(`orders/${id}`).get()).data() || {};
const J = (x) => JSON.stringify(x);

// TMAP 주소 검색 흉내(시험 환경은 외부망이 막혀 있다) — 도로명 · 지번 결과 모양은 실제 응답과 같다
const ADDR_DB = [
  ["인천광역시 서구 검단로 480", "인천광역시 서구 마전동 609-1"], ["인천광역시 서구 검단천로 31", "인천광역시 서구 오류동 1543"],
  ["인천광역시 서구 서곶로 299", "인천광역시 서구 심곡동 254"], ["인천광역시 서구 북항로 28-29", "인천광역시 서구 원창동 389-6"],
  ["경기도 평택시 포승읍 평택항로 268", "경기도 평택시 포승읍 만호리 589"], ["부산광역시 강서구 녹산산단321로 24", "부산광역시 강서구 송정동 1622-3"],
];
async function mockTmap(c) {
  await c.route("https://apis.openapi.sk.com/**", async (route) => {
    const u = new URL(route.request().url());
    const kw = (u.searchParams.get("searchKeyword") || "").replace(/\s+/g, "");
    const norm = (s) => s.replace(/광역시|특별시|도(?=\s)/g, "").replace(/\s+/g, "");
    const hits = ADDR_DB.filter(([r, j]) => norm(r).includes(kw.replace(/광역시|특별시/g, "")) || norm(j).includes(kw) || (kw.includes("검단") && r.includes("검단")));
    if (u.pathname.includes("searchAddress")) {
      await route.fulfill({ json: { searchAddressInfo: { addressInfo: hits.map(([r, j]) => ({ fullAddress: j, newAddressList: { newAddress: [{ fullAddressRoad: r }] } })) } } });
    } else await route.fulfill({ json: { searchPoiInfo: { pois: { poi: [] } } } });
  });
}
async function ctx(kind, label, geo) {
  const c = await browser.newContext(kind === "pc" ? { viewport: { width: 1440, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul" } : { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await c.grantPermissions(["geolocation", "clipboard-read", "clipboard-write"], { origin: HUB });
  await c.setGeolocation(geo || { latitude: 36.995, longitude: 127.11, accuracy: 15 });
  await mockTmap(c);
  const p = await c.newPage();
  p.on("pageerror", (e) => errs.push(`[${label}] ${e}`));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|fonts\.g|net::ERR|tile\.openstreetmap|apis\.openapi\.sk\.com|Failed to load resource|tesseract|permission/i.test(m.text())) errs.push(`[${label}] ${m.text().slice(0, 220)}`); });
  p.on("dialog", (d) => d.accept());
  p.label = label; p.kind = kind;
  return p;
}
const shot = async (p, name, full = false) => { await sleep(500); try { await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full, timeout: 45000 }); } catch { await sleep(1000); await p.screenshot({ path: `${OUT}/${name}.png`, timeout: 45000 }); } };
async function hubLogin(p, role, mode, f) {
  await p.goto(`${HUB}/login?role=${role}&mode=${mode}`);
  await p.waitForSelector('[data-testid="login-submit"]');
  // ⭐ 2026-11-07 허브 차주는 차량번호 + 휴대폰번호가 기본 — 이메일로 가입한 시험 차주는 [이메일로 가입했어요]
  if (role === "driver" && mode === "hub" && f.email) await p.click('[data-testid="driver-email-link"]');
  if (f.company) await p.fill('[data-testid="lw-company"]', f.company);
  if (f.code) await p.fill('[data-testid="lw-code"]', f.code);
  if (f.email) await p.fill('[data-testid="login-email"]', f.email);
  if (f.pw) await p.fill('[data-testid="login-password"]', f.pw);
  await p.click('[data-testid="login-submit"]');
  // ⭐ 2026-11-07 차주는 본인 휴대폰 확인(문자 인증 → 기기 등록) — 에뮬레이터 인증번호로 통과
  if (role === "driver" && mode === "hub") {
    const gate = await p.waitForSelector('[data-testid="device-gate"], [data-testid="region-bar"], [data-testid="board-list"], [data-testid="tab-my"]', { timeout: 30000 });
    if ((await gate.getAttribute("data-testid")) === "device-gate") {
      const VC = `http://127.0.0.1:${P.auth}/emulator/v1/projects/demo-kpflow/verificationCodes`;
      const n0 = ((await fetch(VC).then((x) => x.json())).verificationCodes || []).length;
      await p.click('[data-testid="sms-send"]');
      await p.waitForSelector('[data-testid="sms-code"]', { timeout: 20000 });
      const code = await until(async () => { const l = (await fetch(VC).then((x) => x.json())).verificationCodes || []; return l.length > n0 ? l[l.length - 1].code : ""; });
      await p.fill('[data-testid="sms-code"]', code);
      await p.click('[data-testid="sms-confirm"]');
    }
  }
  await p.waitForSelector('[data-testid="region-bar"], [data-testid="board-list"], [data-testid="stat-open"]', { timeout: 30000 });
}
const nav = async (p, k) => { if (p.kind === "pc") await p.click(`[data-testid="nav-${k}"]`); else if (k === "notices") await p.click('[data-testid="btn-bell-m"]'); else await p.click(`[data-testid="tab-${k}"]`); await sleep(600); };
const closeDetail = async (p) => { await p.locator('[data-testid="order-detail"] button[aria-label="닫기"]').first().click().catch(() => {}); await sleep(400); };
const confirmOk = (p, text) => p.locator(`.fixed.inset-0 button:has-text("${text}")`).last().click();
async function docImage(title, lines) {
  await docPage.setContent(`<div style="width:600px;height:400px;background:#fff;border:6px double #1B2B4B;font-family:'Noto Sans KR',sans-serif;padding:28px;box-sizing:border-box"><div style="font-size:34px;font-weight:800;color:#0F1A30;text-align:center;letter-spacing:6px">${title}</div><div style="margin-top:26px;font-size:20px;line-height:1.9;color:#1B2B4B">${lines.map((l) => `<div>${l}</div>`).join("")}</div></div>`);
  return docPage.screenshot({ type: "png" });
}

// 회원 동작을 SDK로(규칙을 그대로 통과해야 한다)
const CFG = { apiKey: "demo-key", authDomain: "demo-kpflow.firebaseapp.com", projectId: "demo-kpflow", storageBucket: "dispatch-app-9b92f.firebasestorage.app" };
async function client(email, pw) {
  const app = fb.app.initializeApp(CFG, `c_${email}_${Date.now()}`);
  const a = fb.auth.getAuth(app); fb.auth.connectAuthEmulator(a, `http://127.0.0.1:${P.auth}`, { disableWarnings: true });
  const d = fb.fs.getFirestore(app); fb.fs.connectFirestoreEmulator(d, "127.0.0.1", Number(P.fs));
  const cred = await fb.auth.signInWithEmailAndPassword(a, email, pw);
  return { db: d, uid: cred.user.uid, app };
}
const { doc: cdoc, collection: ccol, runTransaction, serverTimestamp: sts, updateDoc: cupd, writeBatch, addDoc: cadd, Timestamp: CTs } = fb.fs;
const keyOf = (m, uid) => m.companyKey || (m.source !== "signup" ? `lw:${m.companyName}` : String(m.bizNo || "").replace(/[^\d]/g, "") ? `biz:${String(m.bizNo).replace(/[^\d]/g, "")}` : `uid:${uid}`);
let lastPost = 0;
async function sdkPost(c, m, o) {
  const wait = 20600 - (Date.now() - (lastPost[c.uid] || 0)); if (wait > 0) await sleep(wait);
  const ref = cdoc(ccol(c.db, "hubOrders"));
  const qref = cdoc(c.db, "hubQuota", c.uid);
  const pub = { 상차시도: "경기", 상차시군구: "평택시", 하차시도: "경남", 하차시군구: "창원시", 상차일: kst(0), 상차시간: "10:00", 하차일: kst(0), 하차시간: "", 화물내용: "철강", 중량: "", 파레트: 0, 차량종류: "카고", 차량톤수: "11톤", 톤수값: 11, 상차방법: "지게차", 하차방법: "지게차", 긴급: false, 운행유형: "편도", 적재: "독차", 공개메모: "", 거리km: 330, 대수: "1대", 예약: false, showAt: null, 수수료: 0, ...o };
  pub.상차지역 = [pub.상차시도, `${pub.상차시도} ${pub.상차시군구}`];
  await runTransaction(c.db, async (tx) => {
    const q = await tx.get(qref); const t = new Date(); const day = CTs.fromMillis(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
    const prev = q.exists() ? q.data() : null; const same = prev && prev.day && prev.day.toMillis() === day.toMillis();
    tx.set(qref, { uid: c.uid, count: same ? (prev.count || 0) + 1 : 1, day, lastPostAt: sts() });
    tx.set(ref, { ...pub, v: 3, posterUid: c.uid, posterRole: m.role, posterSource: m.source, posterCompany: m.companyName, posterName: m.name, posterVerified: m.docsVerified === true, posterCompanyKey: keyOf(m, c.uid), status: "open", takerUid: null, takerRole: null, assignedAt: null, cancelCount: 0, createdAt: sts(), updatedAt: sts() });
    tx.set(cdoc(c.db, "hubOrders", ref.id, "private", "detail"), { 상차지명: "평택 1공장", 상차지주소: "경기 평택시 포승읍 1", 하차지주소: "경남 창원시 성산구 2", posterPhone: m.phone, 의뢰자구분: "화주" });
  });
  lastPost[c.uid] = Date.now();
  return ref.id;
}
lastPost = {};
async function sdkTake(c, m, id, { confirm = true } = {}) {
  const b = writeBatch(c.db);
  b.update(cdoc(c.db, "hubOrders", id), { status: "assigned", takerUid: c.uid, takerRole: m.role, assignedAt: sts(), updatedAt: sts() });
  b.set(cdoc(c.db, "hubOrders", id, "private", "match"), { takerUid: c.uid, role: m.role, source: m.source, name: m.name, phone: m.phone, companyName: m.companyName, vehicle: m.vehicle || null, docsVerified: m.docsVerified === true, bizStatus: m.bizStatus || "", photoPath: m.photoPath || "", at: sts() });
  await b.commit();
  if (!confirm) return;
  await sleep(10600);
  await cupd(cdoc(c.db, "hubOrders", id), { confirmed: true, confirmedAt: sts(), updatedAt: sts() });
}
const sdkDeliver = (c, id) => cupd(cdoc(c.db, "hubOrders", id), { status: "delivered", deliveredAt: sts(), updatedAt: sts() });

async function seed() {
  await fetch(`http://127.0.0.1:${P.fs}/emulator/v1/projects/demo-kpflow/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://127.0.0.1:${P.auth}/emulator/v1/projects/demo-kpflow/accounts`, { method: "DELETE" });
  const mk = async (email, pw, name) => (await auth.createUser({ email, password: pw, displayName: name })).uid;
  const adminUid = await mk("admin@hub.test", "test1234", "허브관리자");
  await db.doc(`users/${adminUid}`).set({ email: "admin@hub.test", role: "totalMaster", companyName: "로지스웹", companyCode: "LW0001", approved: true, name: "허브관리자", phone: "010-1000-0000" });
  const kUid = await mk("staff@hanbit.test", "test1234", "김배차");
  await db.doc(`users/${kUid}`).set({ email: "staff@hanbit.test", role: "admin", companyName: "한빛로지스", companyCode: "HB1234", approved: true, name: "김배차", phone: "010-3333-4444", bizNo: "1208147521" });
  // 로지스웹 운송사 직원은 허브 회원 문서가 아직 없다 — [저장 + 허브 등록] 첫 요청 때 서버가 만든다
  const mem = async (email, data) => { const uid = await mk(email, "test12345", data.name); await db.doc(`hubMembers/${uid}`).set({ uid, source: "signup", status: "approved", docsVerified: true, bizStatus: "계속사업자", email, prefs: {}, createdAt: FV.serverTimestamp(), ...data }); return uid; };
  const BK = (h) => ({ bank: "국민", number: "123456-01-234567", holder: h });
  const d1 = await mem("drv1@hub.test", { role: "driver", name: "김차주", phone: "010-1234-5678", companyName: "김차주운송", bizNo: "1018204964", vehicle: { plate: "경남80바1234", type: "윙바디", ton: "11톤", length: "9.6", width: "2.35" }, home: { sido: "경기", sigungu: "평택시" }, bank: BK("김차주"), fcmTokens: ["fake-token-driver1"] });
  // ⭐ 2026-11-07 화면으로 로그인하지 않는 차주(SDK로만 배차신청)는 등록 휴대폰을 미리 넣어 둔다(규칙 hubDeviceOk)
  const d2 = await mem("drv2@hub.test", { role: "driver", name: "이현금", phone: "010-2222-1111", companyName: "이현금화물", bizNo: "2118123456", vehicle: { plate: "경기90사5678", type: "카고", ton: "11톤", length: "9.1", width: "2.3" }, bank: BK("이현금") });
  await db.doc(`hubDevices/${d2}`).set({ uid: d2, id: "seed-device-d2-00000000", label: "시험 기기" });
  const d3 = await mem("drv3@hub.test", { role: "driver", name: "박무계좌", phone: "010-5555-6666", companyName: "박무계좌", vehicle: { plate: "경기70아7777", type: "카고", ton: "5톤", length: "6.2", width: "" } });
  const s1 = await mem("ship1@hub.test", { role: "shipper", name: "박화주", phone: "010-7777-8888", companyName: "서해유통", bizNo: "1348101238", bank: BK("서해유통"), fcmTokens: ["fake-token-shipper"] });
  const s1b = await mem("ship1b@hub.test", { role: "shipper", name: "최동료", phone: "010-7777-9999", companyName: "서해유통", bizNo: "134-81-01238" });
  const s2 = await mem("ship2@hub.test", { role: "shipper", name: "정다른", phone: "010-4444-0000", companyName: "다른상사", bizNo: "2208162517" });
  await db.doc("hubSettings/config").set({ fee: { mode: "amount", value: 20000, platformRate: 0 }, depositAccount: { bank: "기업", number: "123-456789-01-011", holder: "(주)로지스웹" }, supportPhone: "1588-0000" });
  // 로지스웹 회사 데이터 — 상하차지거래처 · 지난 배차 오더(오더복사)
  await db.doc("places/한빛로지스__한빛평택창고").set({ 업체명: "한빛 평택창고", 주소: "경기도 평택시 포승읍 평택항로 268", 담당자: "오창고", 담당자번호: "010-8888-1111", companyName: "한빛로지스" });
  await db.doc("places/한빛로지스__녹산물류센터").set({ 업체명: "녹산물류센터", 주소: "부산광역시 강서구 녹산산단321로 24", 담당자: "이하차", 담당자번호: "010-8888-2222", companyName: "한빛로지스" });
  await db.doc("orders/lwOld").set({ _id: "lwOld", companyName: "한빛로지스", 등록일: kst(-3), 상차일: kst(-3), 상차시간: "08:00", 거래처명: "서해제지", 상차지명: "한빛 평택창고", 상차지주소: "경기도 평택시 포승읍 평택항로 268", 하차지명: "녹산물류센터", 하차지주소: "부산광역시 강서구 녹산산단321로 24", 화물내용: "제지 롤", 차량톤수: "11톤", 차량종류: "윙바디", 지급방식: "선불", 청구운임: 720000, 기사운임: 700000, 배차상태: "배차완료", 차량번호: "부산99자1111", 이름: "옛기사" });
  // 보드가 비지 않게 — 다른 지역 예시 오더(부산 상차)
  const ref = db.collection("hubOrders").doc();
  await ref.set({ v: 3, posterUid: s2, posterRole: "shipper", posterSource: "signup", posterCompany: "다른상사", posterName: "정다른", posterVerified: true, posterCompanyKey: "biz:2208162517", status: "open", 상차시도: "부산", 상차시군구: "강서구", 상차지역: ["부산", "부산 강서구"], 하차시도: "경기", 하차시군구: "이천시", 상차일: kst(0), 상차시간: "14:00", 하차일: kst(1), 하차시간: "", 화물내용: "생활용품", 중량: "", 파레트: 10, 차량종류: "윙바디", 차량톤수: "5톤", 톤수값: 5, 상차방법: "지게차", 하차방법: "지게차", 운임: 450000, 수수료: 20000, 지급방식: "착불", 긴급: false, 운행유형: "편도", 적재: "독차", 공개메모: "", 거리km: 380, 대수: "1대", takerUid: null, takerRole: null, assignedAt: null, cancelCount: 0, createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
  await ref.collection("private").doc("detail").set({ 상차지명: "다른상사 부산창고", 상차지주소: "부산 강서구 산업로 2", posterPhone: "010-4444-0000" });
  return { adminUid, kUid, d1, d2, d3, s1, s1b, s2, busanId: ref.id };
}

(async () => {
  const U = await seed();
  console.log("seeded", U);
  browser = await chromium.launch();
  docPage = await (await browser.newContext({ viewport: { width: 600, height: 400 } })).newPage();
  const K = await client("staff@hanbit.test", "test1234");
  const AD = await client("admin@hub.test", "test1234");
  // src/hubShare.js의 변환(hubOrderFromRec)을 그대로 쓰고, 요청 쓰기 · 결과 기다리기는 같은 모양으로(ESM/CJS SDK 인스턴스가 달라서)
  const shareMod = await import(path.join(ROOT, "src/hubShare.js"));
  const share = {
    shareToHub: async (cdb, { rec, savedIds, uid, profile }) => {
      const ids = (savedIds || []).flat(3).filter((x) => typeof x === "string" && x);
      const ref = await cadd(ccol(cdb, "hubPostRequests"), { uid, companyName: rec.companyName || profile.companyName || "", lwOrderId: ids[0], order: shareMod.hubOrderFromRec(rec), status: "requested", createdAt: sts() });
      const d = await until(async () => { const x = (await db.doc(`hubPostRequests/${ref.id}`).get()).data(); return x && x.status !== "requested" ? x : null; }, 20000);
      return d?.status === "ok" ? { ok: true, hubOrderId: d.hubOrderId } : { ok: false, reason: d?.reason };
    },
  };

  // ───────── 1. 배차 프로그램 [저장 + 허브 등록] — 원래 오더에 연결(선불 60만 + 수수료 2만)
  const lwK1 = cdoc(ccol(K.db, "orders"));
  const rec1 = { _id: lwK1.id, companyName: "한빛로지스", 등록일: kst(0), 거래처명: "서해제지", 상차일: kst(0), 상차시간: "09:00", 하차일: kst(0), 하차시간: "16:00", 상차지명: "한빛 평택창고", 상차지주소: "경기도 평택시 포승읍 평택항로 268", 하차지명: "녹산물류센터", 하차지주소: "부산광역시 강서구 녹산산단321로 24", 상차지담당자: "오창고", 상차지담당자번호: "010-8888-1111", 화물내용: "제지 롤 14파레트", 차량톤수: "11톤", 차량종류: "윙바디", 지급방식: "선불", 청구운임: 620000, 기사운임: 600000, 배차상태: "배차중", 배차방식: "", 차량번호: "", 이름: "", 전화번호: "" };
  await fb.fs.setDoc(lwK1, rec1);
  const r1 = await share.shareToHub(K.db, { rec: rec1, savedIds: [[lwK1.id]], uid: K.uid, profile: { companyName: "한빛로지스" } });
  check("[연동] 저장 + 허브 등록 요청 → 서버가 허브 오더 생성(ok)", r1.ok && !!r1.hubOrderId, J(r1));
  const H1 = r1.hubOrderId;
  const h1 = await O(H1);
  check("[연동] 허브 오더가 원래 로지스웹 오더에 연결(lwOrderId · 새 오더 안 만듦)", h1.lwOrderId === lwK1.id && h1.lwLinked === "existing" && !(await db.doc(`orders/hub_${H1}`).get()).exists, J({ lw: h1.lwOrderId, linked: h1.lwLinked }));
  check("[연동] 허브 오더: 선불 · 운임 60만 · 수수료 2만 · 경기 평택시 상차 · 지역 키", h1.지급방식 === "선불" && h1.운임 === 600000 && h1.수수료 === 20000 && h1.상차시군구 === "평택시" && J(h1.상차지역) === J(["경기", "경기 평택시"]), J({ p: h1.지급방식, f: h1.운임, c: h1.수수료, s: h1.상차시군구, k: h1.상차지역 }));
  check("[연동] 원래 오더에 허브오더Id · 허브상태 모집중", (await LW(lwK1.id)).허브오더Id === H1 && (await LW(lwK1.id)).허브상태 === "모집중");
  const mK = (await db.doc(`hubMembers/${K.uid}`).get()).data();
  check("[연동] 허브 회원이 없던 직원 → 서버가 로지스웹 운송사 회원으로 만듦", mK?.source === "logisweb-staff" && mK.status === "approved" && mK.companyName === "한빛로지스");

  // ───────── 2. 차주(휴대폰) — 지역 보드 · 오더 설정 · 배차신청 → 확정(운송중 · 위치 공유)
  const D = await ctx("m", "driver-D1", { latitude: 36.995, longitude: 127.11, accuracy: 12 });
  await hubLogin(D, "driver", "hub", { email: "drv1@hub.test", pw: "test12345" });
  await D.waitForFunction(() => document.querySelector('[data-testid="region-keys"]')?.textContent.includes("경기 평택시"), null, { timeout: 20000 });
  await D.waitForSelector('[data-testid="board-list"]', { timeout: 20000 });
  const cards0 = await D.locator('[data-testid="order-card"]').count();
  check("[지역] 기본 = 내 위치(GPS) 지역만 · 평택 오더 보임 · 부산 상차 오더 안 보임", cards0 === 1 && (await D.locator(`[data-order-id="${H1}"]`).count()) === 1 && (await D.locator(`[data-order-id="${U.busanId}"]`).count()) === 0, `cards ${cards0}`);
  await shot(D, "m-taker-01-board-region");
  await D.click('[data-testid="region-bar"]'); await D.waitForSelector('[data-testid="board-settings"]');
  await D.selectOption('[data-testid="bs-ex0-sido"]', "부산"); await D.selectOption('[data-testid="bs-ex0-sgg"]', "강서구");
  await D.selectOption('[data-testid="bs-ex1-sido"]', "인천"); await D.selectOption('[data-testid="bs-ex1-sgg"]', "서구");
  await shot(D, "m-taker-02-board-settings");
  await D.click('[data-testid="bs-save"]');
  await D.waitForFunction(() => document.querySelectorAll('[data-testid="order-card"]').length === 2, null, { timeout: 15000 });
  check("[지역] 오더 설정 + 3곳 → 부산 강서구 상차 오더도 보임(서버 지역 검색)", (await D.locator(`[data-order-id="${U.busanId}"]`).count()) === 1);
  const bset = (await db.doc(`hubMembers/${U.d1}`).get()).data().prefs.board;
  check("[지역] 설정 저장(추가 지역 2곳)", bset.extra.length === 2 && bset.extra[0].sigungu === "강서구", J(bset));
  await shot(D, "m-taker-03-board-with-extra");
  await D.locator('[data-testid="order-card"]', { hasText: "한빛로지스" }).first().click();
  await D.waitForSelector('[data-testid="order-detail"]'); await sleep(600);
  await shot(D, "m-taker-04-order-detail");
  await D.click('[data-testid="btn-request"]');
  await D.waitForSelector('[data-testid="cancel-window"]', { timeout: 10000 });
  await shot(D, "m-taker-05-countdown");
  await D.waitForSelector('[data-testid="btn-delivered"]', { timeout: 25000 });
  check("[단계] 확정 뒤 버튼은 [운송완료]만(상차완료 없음)", !(await D.isVisible('[data-testid="btn-loaded"]')) && await D.isVisible('[data-testid="btn-delivered"]'));
  check("[단계] 확정 = 운송중 표시", (await D.textContent('[data-testid="detail-status"]')) === "운송중");
  const live1 = await until(async () => (await db.doc(`hubLive/${H1}`).get()).data(), 20000);
  check("[관제] 확정되자마자 위치 공유 시작(hubLive)", !!live1 && Math.abs(live1.lat - 36.995) < 0.001, J(live1));
  await D.waitForSelector('[data-testid="live-share-state"]');
  await D.waitForSelector('[data-testid="detail-private"]', { timeout: 20000 });
  check("[단계] 확정 뒤 차주에게 상세주소 · 등록자 연락처 공개", (await D.textContent('[data-testid="detail-private"]')).includes("평택항로"));
  await shot(D, "m-taker-06-moving-tracking");

  // 연동 — 확정 → 원래 오더 채우기
  const lw1 = await until(async () => { const x = await LW(lwK1.id); return x.차량번호 ? x : null; });
  check("[연동] 확정 → 차량번호 · 이름 · 전화번호 · 배차완료", !!lw1 && lw1.차량번호 === "경남80바1234" && lw1.이름 === "김차주" && lw1.전화번호 === "010-1234-5678" && lw1.배차상태 === "배차완료", J(lw1 && { c: lw1.차량번호, n: lw1.이름, t: lw1.전화번호, s: lw1.배차상태 }));
  check("[연동] 선불: 기사운임 60만 · 청구운임 62만(운임+수수료) · 지급방식 선불 · 배차방식 로지스허브", lw1.기사운임 === 600000 && lw1.청구운임 === 620000 && lw1.지급방식 === "선불" && lw1.배차방식 === "로지스허브" && lw1.수수료 === 20000, J({ g: lw1.기사운임, b: lw1.청구운임, p: lw1.지급방식, d: lw1.배차방식 }));
  const drvDoc = await until(async () => { const s = await db.doc("drivers/한빛로지스__경남80바1234").get(); return s.exists ? s.data() : null; });
  check("[연동] 처음 보는 기사 → 기사관리(drivers) 자동 등록(배차 화면과 같은 문서 이름 · 필드)", !!drvDoc && drvDoc.차량번호 === "경남80바1234" && drvDoc.이름 === "김차주" && drvDoc.전화번호 === "010-1234-5678" && drvDoc.companyName === "한빛로지스", J(drvDoc));

  // 등록자(PC) — 관제 지도
  const KP = await ctx("pc", "poster-K");
  await hubLogin(KP, "carrier", "logisweb", { company: "한빛로지스", code: "HB1234", email: "staff@hanbit.test", pw: "test1234" });
  await KP.goto(`${HUB}/order/${H1}`); await KP.waitForSelector('[data-testid="btn-live"]', { timeout: 20000 });
  await KP.click('[data-testid="btn-live"]'); await KP.waitForSelector('[data-kp="live-modal"] .leaflet-container', { timeout: 20000 }); await sleep(1500);
  await shot(KP, "pc-poster-01-live-map");
  await KP.locator('[data-kp="live-modal"] button[aria-label="닫기"]').first().click(); await sleep(400);

  // 운송완료(차주만) → 등록자 알림 + 푸시 · 위치 기록 삭제 · 로지스웹 운송완료 · 인수증·전표 올리기
  await D.click('[data-testid="btn-delivered"]'); await sleep(300);
  await shot(D, "m-taker-07-deliver-confirm");
  await confirmOk(D, "운송완료");
  await D.waitForSelector('[data-testid="pod-add"]', { timeout: 15000 });
  check("[단계] 운송완료 뒤 [인수증·전표 올리기] 보임", (await D.textContent('[data-testid="pod-add"]')).includes("인수증·전표 올리기"));
  check("[관제] 운송완료 → 위치 기록 자동 삭제", !!(await until(async () => !(await db.doc(`hubLive/${H1}`).get()).exists)));
  const nDel = await until(async () => { const q = await db.collection("hubNotices").where("toUid", "==", K.uid).where("type", "==", "delivered").get(); return q.docs[0]?.data()?.push ? q.docs[0].data() : null; });
  check("[알림] 운송완료 → 등록자 알림 + 푸시 기록", !!nDel && nDel.title === "운송을 마쳤어요", J(nDel?.push));
  check("[연동] 로지스웹 오더 운송완료(기사확인상태 완료)", (await until(async () => (await LW(lwK1.id)).기사확인상태 === "완료")) === true);
  await shot(D, "m-taker-08-delivered-pod-button");
  await D.setInputFiles('[data-testid="pod-add-input"]', [{ name: "인수증.png", mimeType: "image/png", buffer: await docImage("인 수 증", ["제지 롤 14파레트", "인수자: 이하차 (서명)", kst(0)]) }, { name: "전표.png", mimeType: "image/png", buffer: await docImage("거래명세서", ["녹산물류센터", "수령 확인"]) }]);
  const atts = await until(async () => { const q = await db.collection(`orders/${lwK1.id}/attachments`).get(); return q.size === 2 ? q.docs.map((x) => x.data()) : null; }, 25000);
  check("[연동] 인수증·전표 2장 → 로지스웹 오더 첨부", !!atts && atts.every((a) => a.base64?.startsWith("data:image/png")));
  await sleep(800); await D.locator('[data-testid="pod-card"]').scrollIntoViewIfNeeded();
  await shot(D, "m-taker-09-pod-uploaded");
  check("[선착불] 차주 잔액 0 → 수수료 2만 미정산 기록", (await until(async () => (await O(H1)).settle?.status === "fee_owed")) === true && (await W(U.d1)).owed === 20000, J(await W(U.d1)));
  await closeDetail(D);

  // 배차 프로그램 화면 — 연동된 오더(차량번호 · 기사운임 · 청구운임 · 배차방식)
  const lwView = await LW(lwK1.id);
  await docPage.setViewportSize({ width: 1280, height: 330 });
  await docPage.setContent(`<div style="font-family:'Noto Sans KR',sans-serif;padding:18px;background:#F4F6FA"><div style="font-size:15px;font-weight:800;color:#0F1A30;margin-bottom:8px">orders/${lwK1.id} (로지스웹 배차 오더 문서, 허브 연동 후)</div><table style="border-collapse:collapse;font-size:13px;background:#fff">${[["거래처명", "상차지명", "하차지명", "차량번호", "이름", "전화번호", "배차상태", "배차방식", "지급방식", "청구운임", "기사운임", "수수료", "기사확인상태", "허브상태", "attachCount"]].concat([[lwView.거래처명, lwView.상차지명, lwView.하차지명, lwView.차량번호, lwView.이름, lwView.전화번호, lwView.배차상태, lwView.배차방식, lwView.지급방식, Number(lwView.청구운임).toLocaleString(), Number(lwView.기사운임).toLocaleString(), Number(lwView.수수료).toLocaleString(), lwView.기사확인상태, lwView.허브상태, lwView.attachCount]]).map((r, i) => `<tr>${r.map((c) => `<${i ? "td" : "th"} style="border:1px solid #D6DEEA;padding:7px 9px;${i ? "" : "background:#1B2B4B;color:#fff"}">${c ?? ""}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</table></div>`);
  await docPage.screenshot({ path: `${OUT}/pc-lw-00-order-doc-after-sync.png` });

  // ───────── 3. 인수증 결제 연동 오더(청구운임은 로지스웹 사용자 몫) · 새 기사 등록 · 허브 취소 → 되돌림
  await cadd(ccol(AD.db, "hubAdjustments"), { uid: K.uid, amount: 1000000, bucket: "available", memo: "시험 충전", by: "admin", createdAt: sts() });
  await until(async () => (await W(K.uid)).available === 1000000);
  const lwK2 = cdoc(ccol(K.db, "orders"));
  const rec2 = { ...rec1, _id: lwK2.id, 지급방식: "계산서", 청구운임: 550000, 기사운임: 500000, 배차방식: "24시", 상차지주소: "경기도 평택시 포승읍 평택항로 268", 하차지주소: "부산광역시 강서구 녹산산단321로 24" };
  await fb.fs.setDoc(lwK2, rec2);
  const r2 = await share.shareToHub(K.db, { rec: rec2, savedIds: [lwK2.id], uid: K.uid, profile: { companyName: "한빛로지스" } });
  const H2 = r2.hubOrderId;
  check("[연동] 계산서 오더 → 허브 인수증 결제 · 운임 50만", (await O(H2)).지급방식 === "인수증" && (await O(H2)).운임 === 500000);
  const D2 = await client("drv2@hub.test", "test12345"); const mD2 = (await db.doc(`hubMembers/${U.d2}`).get()).data();
  await sdkTake(D2, mD2, H2);
  const lw2 = await until(async () => { const x = await LW(lwK2.id); return x.차량번호 ? x : null; });
  check("[연동] 인수증: 기사운임 50만 · 청구운임은 그대로(55만, 로지스웹 사용자 몫) · 지급방식 계산서 · 배차방식 로지스허브", lw2.기사운임 === 500000 && lw2.청구운임 === 550000 && lw2.지급방식 === "계산서" && lw2.배차방식 === "로지스허브", J({ g: lw2.기사운임, b: lw2.청구운임, p: lw2.지급방식, d: lw2.배차방식 }));
  check("[예치금] 확정 → 운임 50만 보류(100만 → 50만)", !!(await until(async () => { const w = await W(K.uid); return w.available === 500000 && w.held === 500000; })), J(await W(K.uid)));
  check("[연동] 두 번째 새 기사도 기사관리 자동 등록", !!(await until(async () => (await db.doc("drivers/한빛로지스__경기90사5678").get()).exists)));
  await cupd(cdoc(K.db, "hubOrders", H2), { status: "cancelled", cancelledAt: sts(), updatedAt: sts() });
  const lw2c = await until(async () => { const x = await LW(lwK2.id); return x.허브상태 === "허브취소" ? x : null; });
  check("[연동] 허브 취소 → 원래 오더 기사 비우고 배차방식 · 기사운임 되돌림", !!lw2c && lw2c.차량번호 === "" && lw2c.배차상태 === "배차중" && lw2c.배차방식 === "24시" && lw2c.기사운임 === 500000, J(lw2c && { c: lw2c.차량번호, s: lw2c.배차상태, d: lw2c.배차방식 }));
  check("[예치금] 확정 뒤 취소 → 전액 환불(100만)", !!(await until(async () => { const w = await W(K.uid); return w.available === 1000000 && w.held === 0; })), J(await W(K.uid)));

  // ───────── 4. 허브 전용 화주(휴대폰) — 충전 · 화물등록(목록 · 주소 자동완성 · 고객관리) · 잔액
  const S1 = await client("ship1@hub.test", "test12345"); const mS1 = (await db.doc(`hubMembers/${U.s1}`).get()).data();
  const chId = (await cadd(ccol(S1.db, "hubCharges"), { uid: S1.uid, name: "박화주", amount: 2000000, depositor: "서해유통", status: "requested", createdAt: sts() })).id;
  await cupd(cdoc(AD.db, "hubCharges", chId), { status: "confirmed", confirmedAt: sts(), confirmedBy: "admin@hub.test" });
  check("[예치금] 200만 충전(관리자 입금 확인)", !!(await until(async () => (await W(U.s1)).available === 2000000)));
  const SM = await ctx("m", "shipper-S1");
  await hubLogin(SM, "shipper", "hub", { email: "ship1@hub.test", pw: "test12345" });
  await SM.waitForFunction(() => document.querySelector('[data-testid="balance-m"]')?.textContent.includes("2,000,000"), null, { timeout: 15000 });
  check("[예치금] 위 앱바에 잔액 200만", true);
  await SM.click('[data-testid="fab-post"]'); await SM.waitForSelector('[data-testid="post-form"]');
  await SM.fill('[data-testid="pf-상차-addr"]', "인천");
  await SM.waitForSelector('[data-testid="pf-상차-addr-list"] [data-kind="region"]', { timeout: 8000 });
  check("[주소] '인천' → 시·군·구 지역 목록(내장 행정구역)", (await SM.locator('[data-testid="pf-상차-addr-list"] [data-kind="region"]', { hasText: "인천 서구" }).count()) === 1);
  await SM.locator('[data-testid="pf-상차-addr-list"] [data-kind="region"]', { hasText: "인천 서구" }).click();
  check("[주소] 지역을 고르면 '인천 서구 '까지 채우고 이어서 입력", (await SM.inputValue('[data-testid="pf-상차-addr"]')) === "인천 서구 ");
  await SM.waitForSelector('[data-testid="pf-상차-addr-list"] [data-kind="road"]', { timeout: 8000 });
  await shot(SM, "m-poster-01-addr-region");
  await SM.fill('[data-testid="pf-상차-addr"]', "인천 서구 검단");
  await SM.waitForSelector('[data-testid="pf-상차-addr-list"] [data-kind="road"]', { timeout: 8000 });
  check("[주소] '인천 서구 검단' → 도로명 · 지번 결과", (await SM.locator('[data-testid="pf-상차-addr-list"] [data-kind="road"]').count()) >= 1 && (await SM.locator('[data-testid="pf-상차-addr-list"] [data-kind="jibun"]').count()) >= 1);
  await shot(SM, "m-poster-02-addr-autocomplete");
  await SM.locator('[data-testid="pf-상차-addr-list"] [data-kind="road"]').first().click();
  check("[주소] 고르면 시·도/시·군·구 자동(인천 서구)", (await SM.inputValue('[data-testid="pf-상차-sido"]')) === "인천" && (await SM.inputValue('[data-testid="pf-상차-sgg"]')) === "서구");
  await SM.fill('[data-testid="pf-상차-name"]', "서해유통 검단창고");
  await SM.fill('[data-testid="pf-하차-addr"]', "평택시 포승읍 평택항로 268");
  await SM.selectOption('[data-testid="pf-하차-sido"]', "경기"); await SM.selectOption('[data-testid="pf-하차-sgg"]', "평택시");
  await SM.selectOption('[data-testid="pf-vton"]', "5톤"); await SM.selectOption('[data-testid="pf-vtype"]', "카고");
  await SM.selectOption('[data-testid="pf-load"]', "지게차"); await SM.selectOption('[data-testid="pf-count"]', "1대");
  await SM.fill('[data-testid="pf-cargo"]', "생활용품 박스"); await SM.fill('[data-testid="pf-weight"]', "4.5");
  await SM.fill('[data-testid="pf-fare"]', "95000"); await SM.click('[data-testid="pf-fare-up"]');
  check("[화물등록] 운송료 ▲5,000 → 100,000", (await SM.inputValue('[data-testid="pf-fare"]')) === "100,000");
  check("[화물등록] 수수료 기본값 2만 · 총합계 자동 12만", (await SM.inputValue('[data-testid="pf-fee"]')) === "20,000" && (await SM.textContent('[data-testid="pf-total"]')).includes("120,000"));
  await SM.selectOption('[data-testid="pf-req-type"]', "운수사");
  await SM.click('[data-testid="pf-submit"]');
  await SM.waitForSelector('[data-testid="pf-error"]');
  check("[의뢰자] 운수사인데 사업자번호 없으면 막힘", (await SM.textContent('[data-testid="pf-error"]')).includes("사업자번호"));
  await SM.fill('[data-testid="pf-req-biz"]', "134-81-01238"); await SM.click('[data-testid="pf-submit"]'); await sleep(300);
  check("[의뢰자] 내 사업자번호는 의뢰자로 못 씀", (await SM.textContent('[data-testid="pf-error"]')).includes("내 사업자번호"));
  await SM.fill('[data-testid="pf-req-biz"]', "220-81-62517");
  await SM.locator('[data-testid="pf-flags"]').scrollIntoViewIfNeeded();
  await shot(SM, "m-poster-03-form-dropdowns");
  await SM.locator('[data-testid="pf-total"]').scrollIntoViewIfNeeded();
  await shot(SM, "m-poster-04-form-fare-total");
  await SM.click('[data-testid="pf-submit"]');
  await SM.waitForSelector('[data-testid="post-form"]', { state: "detached", timeout: 15000 });
  lastPost[U.s1] = Date.now();
  const X1 =await until(async () => (await db.collection("hubOrders").where("posterUid", "==", U.s1).get()).docs[0]?.id);
  const x1 = await O(X1); const x1d = (await db.doc(`hubOrders/${X1}/private/detail`).get()).data();
  check("[화물등록] 목록 값 그대로 저장(5톤 카고 · 지게차 · 1대 · 4.5톤 · 인천 서구 · 지역 키)", x1.차량톤수 === "5톤" && x1.차량종류 === "카고" && x1.상차방법 === "지게차" && x1.대수 === "1대" && x1.중량 === "4.5톤" && x1.상차시군구 === "서구" && J(x1.상차지역) === J(["인천", "인천 서구"]), J({ t: x1.차량톤수, c: x1.차량종류, w: x1.중량, k: x1.상차지역 }));
  check("[화물등록] 의뢰자구분 · 사업자번호는 비공개 칸에만", x1d.의뢰자구분 === "운수사" && x1d.의뢰자사업자번호 === "220-81-62517" && !x1.의뢰자구분, J(x1d));
  const pl = await until(async () => { const q = await db.collection("hubPlaces").where("companyKey", "==", "biz:1348101238").get(); return q.size >= 2 ? q.docs.map((x) => x.data()) : null; });
  check("[고객관리] 등록할 때 상·하차지 자동 저장(회사 키)", !!pl && pl.some((p) => p.이름 === "서해유통 검단창고" && p.주소.includes("검단")), J(pl));
  // 고객관리 화면 · 장소 자동완성
  await nav(SM, "places"); await SM.waitForSelector('[data-testid="place-row"]', { timeout: 15000 });
  await shot(SM, "m-poster-05-places");
  await nav(SM, "board"); await SM.click('[data-testid="fab-post"]');
  await SM.waitForSelector('[data-testid="post-form"]');
  await SM.fill('[data-testid="pf-상차-name"]', "검단");
  await SM.waitForSelector('[data-testid="pf-상차-name-list"] [data-testid="place-item"]', { timeout: 8000 });
  await shot(SM, "m-poster-06-place-autocomplete");
  await SM.locator('[data-testid="pf-상차-name-list"] [data-testid="place-item"]').first().click();
  check("[고객관리] 상하차지명 고르면 주소 · 지역 자동 채움", (await SM.inputValue('[data-testid="pf-상차-addr"]')).includes("검단") && (await SM.inputValue('[data-testid="pf-상차-sgg"]')) === "서구");
  await SM.locator('[data-testid="post-form"] button:has-text("취소")').last().click(); await sleep(400);

  // ───────── 5. 예치금 — 확정 보류(200만 → 190만) · 확정 뒤 취소 전액 환불
  const D1 = await client("drv1@hub.test", "test12345"); const mD1 = (await db.doc(`hubMembers/${U.d1}`).get()).data();
  await sdkTake(D1, mD1, X1);
  check("[예치금] 10만 오더 배차완료 → 잔액 190만(보류 10만)", !!(await until(async () => { const w = await W(U.s1); return w.available === 1900000 && w.held === 100000; })), J(await W(U.s1)));
  await SM.waitForFunction(() => document.querySelector('[data-testid="balance-m"]')?.textContent.includes("1,900,000"), null, { timeout: 15000 });
  await nav(SM, "my"); await SM.waitForSelector('[data-testid="wallet-view"]');
  await shot(SM, "m-poster-07-wallet-190");
  await SM.goto(`${HUB}/order/${X1}`); await SM.waitForSelector('[data-testid="btn-cancel-order"]');
  await SM.click('[data-testid="btn-cancel-order"]'); await confirmOk(SM, "화물 취소");
  check("[예치금] 확정 뒤 취소 → 200만으로 전액 환불", !!(await until(async () => { const w = await W(U.s1); return w.available === 2000000 && w.held === 0; })), J(await W(U.s1)));
  await closeDetail(SM);

  // ───────── 6. 회차 — 등록자 금액 요청(1만) → 차주 수락 → 1만만 남고 9만 환불
  const X2 = await sdkPost(S1, mS1, { 운임: 100000, 지급방식: "인수증" });
  await sdkTake(D1, mD1, X2);
  await until(async () => (await W(U.s1)).held === 100000);
  await SM.goto(`${HUB}/order/${X2}`); await SM.waitForSelector('[data-testid="btn-return"]', { timeout: 20000 });
  await SM.click('[data-testid="btn-return"]'); await SM.fill('[data-testid="return-amount"]', "10000"); await SM.fill('[data-testid="return-reason"]', "화물 준비 안 됨");
  await shot(SM, "m-poster-08-return-request");
  await confirmOk(SM, "요청하기");
  await D.goto(`${HUB}/order/${X2}`); await D.waitForSelector('[data-testid="btn-return-accept"]', { timeout: 20000 });
  check("[회차] 아직 차주 수락 전이라 보류 10만 그대로(양쪽 합의 필요)", (await W(U.s1)).held === 100000);
  await shot(D, "m-taker-10-return-answer");
  await D.click('[data-testid="btn-return-accept"]');
  check("[회차] 차주 수락 → 회차비 1만만 남고 9만 환불(199만 · 보류 1만)", !!(await until(async () => { const w = await W(U.s1); return w.available === 1990000 && w.held === 10000; })), J(await W(U.s1)));
  check("[회차] 운송이 끝나고 위치 기록 삭제", (await O(X2)).status === "delivered" && !!(await until(async () => !(await db.doc(`hubLive/${X2}`).get()).exists)));

  // ───────── 7. 계산서 → 등록자 확인(지급일 오늘) → 지급 요청 · 등록자 직접 지급완료
  await D.waitForSelector('[data-testid="invoice-form"]', { timeout: 15000 });
  await D.fill('[data-testid="inv-no"]', "20261107-41000000-12345678");
  await D.locator('[data-testid="invoice-form"]').scrollIntoViewIfNeeded();
  await shot(D, "m-taker-11-invoice-form");
  await D.click('[data-testid="inv-submit"]');
  await SM.waitForSelector('[data-testid="invoice-check"]', { timeout: 20000 });
  await SM.fill('[data-testid="inv-paydate"]', kst(0));
  await SM.locator('[data-testid="invoice-check"]').scrollIntoViewIfNeeded();
  await shot(SM, "m-poster-09-invoice-check");
  check("[계산서] 계산서만으로는 정산 안 됨(등록자 확인 전)", (await O(X2)).settle?.status === "held");
  await SM.click('[data-testid="inv-confirm"]');
  const po2 = await until(async () => { const p = (await db.doc(`hubPayouts/po_${X2}`).get()).data(); return p?.status === "requested" ? p : null; });
  check("[계산서] 등록자 확인 → 정산(회차비 1만) · 지급일 오늘 → 지급 요청(지급대행 자리 · 수동)", !!po2 && po2.amount === 10000 && po2.dueDate === kst(0) && po2.bank?.number === "123456-01-234567", J(po2 && { a: po2.amount, d: po2.dueDate, s: po2.status }));
  check("[계산서] 차주 받을 운송료 1만 · 등록자 보류 0", (await W(U.d1)).pending === 10000 && (await W(U.s1)).held === 0, J({ d: await W(U.d1), s: await W(U.s1) }));
  check("[계산서] requestPayout 어댑터(수동 모드)", !!(await until(async () => (await db.doc(`hubPayouts/po_${X2}`).get()).data()?.adapter?.mode === "manual")));
  await SM.waitForSelector('[data-testid="btn-poster-paid"]', { timeout: 15000 });
  await SM.click('[data-testid="btn-poster-paid"]');
  check("[지급] 등록자 직접 이체 → 지급완료 → 차주 지급 완료 1만", !!(await until(async () => { const w = await W(U.d1); return w.paidOut === 10000 && w.pending === 0; })), J(await W(U.d1)));
  await D.waitForSelector('[data-testid="payout-due"]', { timeout: 15000 });
  await D.locator('[data-testid="settle-card"]').scrollIntoViewIfNeeded();
  await shot(D, "m-taker-12-settled-paid");
  await closeDetail(D); await closeDetail(SM);
  // 지급일이 미래면 기다렸다가 그날 요청
  const X3 = await sdkPost(S1, mS1, { 운임: 300000, 지급방식: "인수증" });
  await sdkTake(D1, mD1, X3); await sdkDeliver(D1, X3);
  await cupd(cdoc(D1.db, "hubOrders", X3), { invoice: { no: "20261107-41000000-99999999", date: kst(0), amount: 300000, at: sts() }, updatedAt: sts() });
  await sleep(1000);
  await cupd(cdoc(S1.db, "hubOrders", X3), { invoiceOk: { payDate: kst(5), at: sts(), by: S1.uid }, updatedAt: sts() });
  const po3 = await until(async () => (await db.doc(`hubPayouts/po_${X3}`).get()).data());
  await sleep(1500);
  check("[지급일] 지급일이 5일 뒤면 지급 예정(scheduled)으로 기다림", (await db.doc(`hubPayouts/po_${X3}`).get()).data().status === "scheduled" && po3.dueDate === kst(5));
  await db.doc(`hubPayouts/po_${X3}`).update({ dueDate: kst(0) });
  check("[지급일] 지급일이 되면 지급 요청으로 바뀜", !!(await until(async () => (await db.doc(`hubPayouts/po_${X3}`).get()).data().status === "requested")));

  // ───────── 8. 실계좌 없는 차주 → 배차신청 막힘
  const D3P = await ctx("m", "driver-D3");
  await hubLogin(D3P, "driver", "hub", { email: "drv3@hub.test", pw: "test12345" });
  await D3P.goto(`${HUB}/order/${U.busanId}`); await D3P.waitForSelector('[data-testid="order-detail"]');
  await D3P.waitForSelector('[data-testid="btn-need-bank"]', { timeout: 15000 });
  check("[계좌] 실계좌 없으면 [계좌 등록하기]만 보이고 신청 버튼 없음", !(await D3P.isVisible('[data-testid="btn-request"]')));
  await shot(D3P, "m-taker-13-need-bank");
  const D3 = await client("drv3@hub.test", "test12345"); const mD3 = (await db.doc(`hubMembers/${U.d3}`).get()).data();
  check("[계좌] 화면을 건너뛰어도 규칙이 막음", await sdkTake(D3, mD3, U.busanId, { confirm: false }).then(() => false).catch(() => true));
  await D3P.click('[data-testid="btn-need-bank"]'); await D3P.waitForSelector('[data-testid="wallet-bank"]');
  await D3P.selectOption('[data-testid="bank-name"]', "신한"); await D3P.fill('[data-testid="bank-number"]', "110-123-456789"); await D3P.fill('[data-testid="bank-holder"]', "박무계좌");
  await D3P.locator('[data-testid="wallet-bank"]').scrollIntoViewIfNeeded();
  await shot(D3P, "m-taker-14-bank-dropdown");
  await D3P.click('[data-testid="bank-save"]');
  check("[계좌] 은행 목록에서 고르고 저장", !!(await until(async () => (await db.doc(`hubMembers/${U.d3}`).get()).data().bank?.bank === "신한")));

  // ───────── 9. 출금 · 가상계좌
  await SM.goto(`${HUB}/`); await nav(SM, "my"); await SM.waitForSelector('[data-testid="wallet-withdraw"]');
  await SM.fill('[data-testid="withdraw-amount"]', "50000"); await SM.click('[data-testid="withdraw-submit"]');
  const wd = await until(async () => { const q = await db.collection("hubWithdrawals").where("uid", "==", U.s1).get(); const x = q.docs[0]; return x && x.data().status === "processing" ? { id: x.id, ...x.data() } : null; });
  check("[출금] 신청 → 출금가능금액에서 바로 묶음(처리 중)", !!wd && (await W(U.s1)).withdrawing === 50000, J(await W(U.s1)));
  await cupd(cdoc(AD.db, "hubWithdrawals", wd.id), { status: "paid", paidAt: sts(), paidBy: "admin" });
  check("[출금] 관리자 이체 후 출금 완료", !!(await until(async () => { const w = await W(U.s1); return w.withdrawn === 50000 && w.withdrawing === 0; })));
  await cupd(cdoc(AD.db, "hubMembers", U.s1), { va: { bank: "기업", number: "560-012345-67-890", numberDigits: "56001234567890", holder: "서해유통", at: Date.now() } });
  const before = (await W(U.s1)).available;
  const res = await fetch(`http://127.0.0.1:${P.fn}/demo-kpflow/us-central1/hubVaDeposit`, { method: "POST", headers: { "content-type": "application/json", "x-hub-secret": "hub-test-secret" }, body: J({ account: "560-012345-67-890", amount: 300000, depositor: "서해유통", txId: "tx-001" }) }).then((r) => r.json()).catch((e) => ({ err: String(e) }));
  check("[가상계좌] 입금 알림(PG 웹훅 자리) → 자동 충전 +30만", res.ok === true && !!(await until(async () => (await W(U.s1)).available === before + 300000)), J(res));
  const dup = await fetch(`http://127.0.0.1:${P.fn}/demo-kpflow/us-central1/hubVaDeposit`, { method: "POST", headers: { "content-type": "application/json", "x-hub-secret": "hub-test-secret" }, body: J({ account: "56001234567890", amount: 300000, txId: "tx-001" }) }).then((r) => r.json()).catch(() => ({}));
  await sleep(1500);
  check("[가상계좌] 같은 거래번호는 한 번만", dup.duplicate === true && (await W(U.s1)).available === before + 300000);
  const badSecret = await fetch(`http://127.0.0.1:${P.fn}/demo-kpflow/us-central1/hubVaDeposit`, { method: "POST", headers: { "content-type": "application/json", "x-hub-secret": "wrong" }, body: "{}" }).then((r) => r.status).catch(() => 0);
  check("[가상계좌] 비밀값이 틀리면 거절(403)", badSecret === 403);
  await SM.reload(); await nav(SM, "my"); await SM.waitForSelector('[data-testid="va-account"]', { timeout: 15000 });
  await shot(SM, "m-poster-10-mypage-va", true);
  await nav(D, "my"); await D.waitForSelector('[data-testid="wallet-view"]'); await sleep(500);
  await shot(D, "m-taker-15-mypage", true);
  await D.click('[data-testid="inv-tab-out"]').catch(() => {}); await D.locator('[data-testid="my-invoices"]').scrollIntoViewIfNeeded();
  await shot(D, "m-taker-16-invoices");

  // ───────── 10. 등록내역(필터) · 오더복사(같은 회사만)
  await nav(SM, "posts"); await SM.waitForSelector('[data-testid="posts-filter"]');
  await SM.click('[data-testid="pv-st-cancelled"]'); await sleep(300);
  check("[등록내역] 화물취소만 → 1건", (await SM.locator('[data-testid="post-row"]').count()) === 1);
  await SM.click('[data-testid="pv-st-all"]'); await SM.fill('[data-testid="pv-q"]', "5678"); await sleep(1800);
  check("[등록내역] 차주 전화 뒷자리로 찾기", (await SM.locator('[data-testid="post-row"]').count()) >= 2);
  await SM.fill('[data-testid="pv-q"]', ""); await sleep(300);
  await shot(SM, "m-poster-11-posts-filter");
  const S1B = await ctx("m", "shipper-S1b");
  await hubLogin(S1B, "shipper", "hub", { email: "ship1b@hub.test", pw: "test12345" });
  await S1B.click('[data-testid="fab-post"]'); await S1B.waitForSelector('[data-testid="post-form"]');
  await S1B.click('[data-testid="pf-copy"]'); await S1B.waitForSelector('[data-testid="copy-row"]', { timeout: 15000 });
  check("[오더복사] 같은 회사(같은 사업자) 동료는 우리 회사 기록을 본다", (await S1B.locator('[data-testid="copy-row"]').count()) >= 3);
  await S1B.fill('[data-testid="copy-q"]', "인천"); await sleep(300);
  await shot(S1B, "m-poster-12-copy-modal");
  await S1B.locator('[data-testid="copy-row"]').first().click();
  await S1B.waitForSelector('[data-testid="copy-modal"]', { state: "detached" });
  check("[오더복사] 고르면 모든 칸 복사(주소 · 상하차지명 · 톤수 · 운임 · 의뢰자)", (await S1B.inputValue('[data-testid="pf-상차-addr"]')).includes("검단") && (await S1B.inputValue('[data-testid="pf-상차-name"]')) === "서해유통 검단창고" && (await S1B.inputValue('[data-testid="pf-fare"]')) === "100,000" && (await S1B.inputValue('[data-testid="pf-req-type"]')) === "운수사");
  check("[오더복사] 날짜는 오늘로", (await S1B.inputValue('[data-testid="pf-상차-date"]')) === kst(0));
  await shot(S1B, "m-poster-13-copied-form");
  const S2P = await ctx("m", "shipper-S2");
  await hubLogin(S2P, "shipper", "hub", { email: "ship2@hub.test", pw: "test12345" });
  await S2P.click('[data-testid="fab-post"]'); await S2P.waitForSelector('[data-testid="post-form"]');
  await S2P.click('[data-testid="pf-copy"]'); await S2P.waitForSelector('[data-testid="copy-list"]'); await sleep(1500);
  const s2rows = await S2P.locator('[data-testid="copy-row"]').allTextContents();
  check("[오더복사] 다른 회사 기록은 절대 안 보임(자기 회사 오더만)", s2rows.length === 1 && !s2rows.some((t) => t.includes("인천")), J(s2rows));
  await S2P.locator('[data-testid="post-form"] button:has-text("취소")').last().click().catch(() => {});

  // ───────── 11. 로지스웹 직원 허브 직접 등록(PC) — 상하차지거래처 자동완성 · 새 장소 자동 등록 · 배차 프로그램 일반 오더 · 오더복사(배차 오더 포함)
  await KP.goto(`${HUB}/`); await KP.waitForSelector('[data-testid="btn-post"]');
  check("[로지스웹] 고객관리 메뉴 없음(대신 상하차지거래처)", !(await KP.isVisible('[data-testid="nav-places"]')));
  await KP.click('[data-testid="btn-post"]'); await KP.waitForSelector('[data-testid="post-form"]');
  await KP.click('[data-testid="pf-copy"]'); await KP.waitForSelector('[data-testid="copy-row"][data-src="lw"]', { timeout: 15000 });
  check("[오더복사] 로지스웹 계정은 회사 배차 오더도 함께", (await KP.locator('[data-testid="copy-row"][data-src="lw"]').count()) >= 1 && (await KP.locator('[data-testid="copy-row"][data-src="hub"]').count()) >= 1);
  await shot(KP, "pc-poster-02-copy-modal");
  await KP.fill('[data-testid="copy-q"]', lwK1.id.slice(0, 10)); await sleep(300);
  await KP.locator('[data-testid="copy-row"][data-src="lw"]').first().click();
  await KP.waitForSelector('[data-testid="copy-modal"]', { state: "detached" });
  check("[오더복사] 배차 오더 → 허브 칸(평택 → 부산 · 11톤 윙바디 · 선불 · 기사운임이 운송료 · 청구-기사 = 수수료)", (await KP.inputValue('[data-testid="pf-상차-sgg"]')) === "평택시" && (await KP.inputValue('[data-testid="pf-vtype"]')) === "윙바디" && (await KP.inputValue('[data-testid="pf-pay"]')) === "선불" && (await KP.inputValue('[data-testid="pf-fare"]')) === "600,000" && (await KP.inputValue('[data-testid="pf-fee"]')) === "20,000", J({ f: await KP.inputValue('[data-testid="pf-fare"]'), fee: await KP.inputValue('[data-testid="pf-fee"]') }));
  await shot(KP, "pc-poster-03-copied-form");
  await KP.fill('[data-testid="pf-하차-name"]', "녹산");
  await KP.waitForSelector('[data-testid="pf-하차-name-list"] [data-testid="place-item"]', { timeout: 8000 });
  check("[로지스웹] 상하차지명 자동완성 = 회사 상하차지거래처", (await KP.textContent('[data-testid="pf-하차-name-list"]')).includes("녹산물류센터") && (await KP.textContent('[data-testid="pf-하차-name-list"]')).includes("로지스웹 상하차지거래처"));
  await shot(KP, "pc-poster-04-lw-place-autocomplete");
  await KP.fill('[data-testid="pf-하차-name"]', "창원 신규센터");
  await KP.fill('[data-testid="pf-하차-addr"]', "경남 창원시 성산구 공단로 100");
  await KP.selectOption('[data-testid="pf-하차-sido"]', "경남"); await KP.selectOption('[data-testid="pf-하차-sgg"]', "창원시");
  await KP.selectOption('[data-testid="pf-req-type"]', "화주");
  await KP.click('[data-testid="pf-submit"]');
  await KP.waitForSelector('[data-testid="post-form"]', { state: "detached", timeout: 15000 });
  const H4 = await until(async () => (await db.collection("hubOrders").where("posterUid", "==", K.uid).get()).docs.map((x) => ({ id: x.id, ...x.data() })).find((x) => !x.lwLinked || x.lwLinked === "hub")?.id);
  const lw4 = await until(async () => { const s = await db.doc(`orders/hub_${H4}`).get(); return s.exists ? s.data() : null; });
  check("[로지스웹] 허브 앱에서 올린 오더 → 배차 프로그램 일반 오더(배차중)", !!lw4 && lw4.배차상태 === "배차중" && lw4.companyName === "한빛로지스" && lw4.하차지명 === "창원 신규센터", J(lw4 && { s: lw4.배차상태, n: lw4.하차지명 }));
  const newPlace = await until(async () => { const q = await db.collection("places").where("companyName", "==", "한빛로지스").where("업체명", "==", "창원 신규센터").get(); return q.docs[0]?.data(); });
  check("[로지스웹] 새 상하차지 → 회사 상하차지거래처에 자동 등록", !!newPlace && newPlace.주소.includes("공단로"), J(newPlace));
  await nav(KP, "posts"); await KP.waitForSelector('[data-testid="posts-rows"]'); await sleep(500);
  await shot(KP, "pc-poster-05-posts");
  await nav(KP, "my"); await KP.waitForSelector('[data-testid="wallet-view"]'); await sleep(500);
  await shot(KP, "pc-poster-06-mypage");
  await nav(KP, "board"); await sleep(800);
  await shot(KP, "pc-poster-07-board");
  await nav(SM, "board"); await sleep(600); await shot(SM, "m-poster-14-board-balance");

  // ───────── 12. (있으면) 배차 프로그램 화면 — 연동된 오더 줄
  try {
    const MP = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await MP.goto(`${MAIN}/transport-login`, { timeout: 15000 });
    await MP.waitForSelector('input[placeholder="승인 후 발급된 코드"]', { timeout: 30000 });
    await MP.fill('input[placeholder="승인 후 발급된 코드"]', "HB1234"); await MP.fill('input[placeholder="가입한 회사명"]', "한빛로지스");
    await MP.fill('input[placeholder="name@company.com"]', "staff@hanbit.test"); await MP.fill('input[placeholder="비밀번호"]', "test1234");
    await MP.click('button:has-text("로그인")');
    await MP.waitForURL(/\/app/, { timeout: 60000 }); await sleep(5000);
    await MP.locator('button:has-text("아니오")').first().click({ timeout: 5000 }).catch(() => {});
    await MP.keyboard.press("F2"); await sleep(5000);
    await MP.locator('button:has-text("아니오")').first().click({ timeout: 3000 }).catch(() => {});
    await sleep(800);
    await MP.screenshot({ path: `${OUT}/pc-lw-01-main-realtime.png` });
    // 표를 오른쪽으로 밀어 차량번호 · 기사 · 운임 · 배차방식 칸이 보이게
    await MP.evaluate(() => { const t = [...document.querySelectorAll("div")].filter((d) => d.scrollWidth > d.clientWidth + 200 && d.querySelector("table")); t.forEach((d) => { d.scrollLeft = d.scrollWidth; }); });
    await sleep(800);
    await MP.screenshot({ path: `${OUT}/pc-lw-02-main-realtime-driver-cols.png` });
    await MP.evaluate(() => { const t = [...document.querySelectorAll("div")].filter((d) => d.scrollWidth > d.clientWidth + 200 && d.querySelector("table")); t.forEach((d) => { d.scrollLeft = Math.round(d.scrollWidth * 0.5); }); });
    await sleep(600);
    await MP.screenshot({ path: `${OUT}/pc-lw-03-main-realtime-mid.png` });
    log.push("INFO 배차 프로그램 화면 저장"); console.log("INFO 배차 프로그램 화면 저장");
  } catch (e) { console.log("INFO 배차 프로그램 화면은 건너뜀:", String(e?.message || e).slice(0, 120)); }

  console.log("\n" + log.join("\n"));
  console.log(`\nE2E(3차) 확인 ${ok + bad}개 — 통과 ${ok} · 실패 ${bad}`);
  console.log(`화면 → ${OUT}`);
  console.log("콘솔 오류:", errs.length ? "\n" + [...new Set(errs)].slice(0, 30).join("\n") : "없음");
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(async (e) => { console.error("E2E 중단:", e); console.log(log.join("\n")); console.log("콘솔 오류:", [...new Set(errs)].slice(0, 30).join("\n")); try { await browser.close(); } catch { /* */ } process.exit(2); });
