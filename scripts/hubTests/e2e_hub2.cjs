// ⭐ 2026-11-06 로지스웹 허브 2차 E2E(에뮬레이터 전용 · 배포 안 함) — Firestore · Auth · Storage · Functions 에뮬레이터 + Playwright
//  위치관제 · 예치금(보류 · 차감 · 지급 · 수수료 · 선불/착불 미정산) · 푸시 기록 · 인수증 → 알림 → 로지스웹 배차 오더 첨부 · 오더 스캔 · 관리자 편집
//  실행 순서(포트는 firebase.hubtest.json):
//   1) firebase emulators:start --only auth,firestore,storage,functions --project demo-kpflow --config firebase.hubtest.json
//   2) cd cafe-site && VITE_USE_EMULATOR=1 VITE_EMU_AUTH_PORT=19099 VITE_EMU_FS_PORT=18080 VITE_EMU_STORAGE_PORT=19199 npx vite --port 5361
//   3) node scripts/hubTests/e2e_hub2.cjs   (화면 저장: OUT 폴더)
const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "../..");
const P = { fs: process.env.EMU_FS_PORT || 18080, auth: process.env.EMU_AUTH_PORT || 19099, st: process.env.EMU_ST_PORT || 19199 };
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${P.fs}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${P.auth}`;
process.env.FIREBASE_STORAGE_EMULATOR_HOST = `127.0.0.1:${P.st}`;
const req = (m) => require(require.resolve(m, { paths: [ROOT, path.join(ROOT, "functions")] }));
const admin = req("firebase-admin");
// Playwright — 설치된 브라우저와 버전이 맞는 쪽(PLAYWRIGHT_DIR 또는 전역 설치 우선)
const { chromium, devices } = require(require.resolve("playwright", { paths: [process.env.PLAYWRIGHT_DIR || "/opt/node-tools/node_modules", ROOT] }));
const fb = { app: req("firebase/app"), auth: req("firebase/auth"), fs: req("firebase/firestore") };

const OUT = process.env.HUB_SHOTS || "/tmp/claude-0/-home-user-dispatch-app2/dff9cc41-f4fc-5104-a1e1-a526f03e5d42/scratchpad/hub2";
const HUB = process.env.HUB_URL || "http://127.0.0.1:5361";
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
const won = (n) => `${Number(n || 0).toLocaleString("ko-KR")}원`;

async function ctx(kind, label, geo) {
  const c = await browser.newContext(kind === "pc" ? { viewport: { width: 1440, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul" } : { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await c.grantPermissions(["geolocation", "clipboard-read", "clipboard-write"], { origin: HUB });
  await c.setGeolocation(geo || { latitude: 37.199, longitude: 126.83, accuracy: 15 });
  const p = await c.newPage();
  p.on("pageerror", (e) => errs.push(`[${label}] ${e}`));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|fonts\.g|net::ERR|tile\.openstreetmap|apis\.openapi\.sk\.com|Failed to load resource|tesseract/i.test(m.text())) errs.push(`[${label}] ${m.text().slice(0, 220)}`); });
  p.on("dialog", (d) => d.accept());
  p.label = label; p.kind = kind;
  return p;
}
const shot = async (p, name, full = false) => { await sleep(450); try { await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full, timeout: 45000 }); } catch { await sleep(1000); await p.screenshot({ path: `${OUT}/${name}.png`, timeout: 45000 }); } };
async function hubLogin(p, role, mode, f) {
  await p.goto(`${HUB}/login?role=${role}&mode=${mode}`);
  await p.waitForSelector('[data-testid="login-submit"]');
  if (f.company) await p.fill('[data-testid="lw-company"]', f.company);
  if (f.code) await p.fill('[data-testid="lw-code"]', f.code);
  if (f.email) await p.fill('[data-testid="login-email"]', f.email);
  if (f.pw) await p.fill('[data-testid="login-password"]', f.pw);
  await p.click('[data-testid="login-submit"]');
}
const nav = async (p, k) => { if (p.kind === "pc") await p.click(`[data-testid="nav-${k}"]`); else if (k === "notices") await p.click('[data-testid="btn-bell-m"]'); else await p.click(`[data-testid="tab-${k}"]`); await sleep(500); };
async function docImage(title, lines) {
  await docPage.setContent(`<div style="width:600px;height:400px;background:#fff;border:6px double #1B2B4B;font-family:'Noto Sans KR',sans-serif;padding:28px;box-sizing:border-box"><div style="font-size:34px;font-weight:800;color:#0F1A30;text-align:center;letter-spacing:6px">${title}</div><div style="margin-top:26px;font-size:20px;line-height:1.9;color:#1B2B4B">${lines.map((l) => `<div>${l}</div>`).join("")}</div></div>`);
  return docPage.screenshot({ type: "png" });
}

// 사람 대신 SDK로(규칙을 그대로 통과해야 하는) 회원 동작 — 현금 흐름 시험용
const CFG = { apiKey: "demo-key", authDomain: "demo-kpflow.firebaseapp.com", projectId: "demo-kpflow", storageBucket: "dispatch-app-9b92f.firebasestorage.app" };
async function client(email, pw) {
  const app = fb.app.initializeApp(CFG, `c_${email}_${Date.now()}`);
  const a = fb.auth.getAuth(app); fb.auth.connectAuthEmulator(a, `http://127.0.0.1:${P.auth}`, { disableWarnings: true });
  const d = fb.fs.getFirestore(app); fb.fs.connectFirestoreEmulator(d, "127.0.0.1", Number(P.fs));
  const cred = await fb.auth.signInWithEmailAndPassword(a, email, pw);
  return { db: d, uid: cred.user.uid, app };
}
const { doc: cdoc, collection: ccol, runTransaction, serverTimestamp: sts, updateDoc: cupd, writeBatch, increment: cinc, addDoc: cadd, Timestamp: CTs } = fb.fs;
async function sdkPost(c, m, o) {
  const ref = cdoc(ccol(c.db, "hubOrders"));
  const qref = cdoc(c.db, "hubQuota", c.uid);
  await runTransaction(c.db, async (tx) => {
    const q = await tx.get(qref); const t = new Date(); const day = CTs.fromMillis(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
    const prev = q.exists() ? q.data() : null; const same = prev && prev.day && prev.day.toMillis() === day.toMillis();
    tx.set(qref, { uid: c.uid, count: same ? (prev.count || 0) + 1 : 1, day, lastPostAt: sts() });
    tx.set(ref, { 상차시도: "경기", 상차시군구: "평택시", 하차시도: "경남", 하차시군구: "창원시", 상차일: kst(0), 상차시간: "10:00", 하차일: kst(0), 하차시간: "", 화물내용: "철강", 중량: "", 파레트: 0, 차량종류: "카고", 차량톤수: "11톤", 톤수값: 11, 상차방법: "지게차", 하차방법: "지게차", 긴급: false, 운행유형: "편도", 적재: "독차", 공개메모: "", 거리km: 330, ...o, v: 3, posterUid: c.uid, posterRole: m.role, posterSource: "signup", posterCompany: m.companyName, posterName: m.name, posterVerified: true, status: "open", takerUid: null, takerRole: null, assignedAt: null, cancelCount: 0, createdAt: sts(), updatedAt: sts() });
    tx.set(cdoc(c.db, "hubOrders", ref.id, "private", "detail"), { 상차지주소: "경기 평택시 포승읍 1", 하차지주소: "경남 창원시 성산구 2", posterPhone: m.phone });
  });
  return ref.id;
}
async function sdkTakeToDelivered(c, m, id) {
  const b = writeBatch(c.db);
  b.update(cdoc(c.db, "hubOrders", id), { status: "assigned", takerUid: c.uid, takerRole: m.role, assignedAt: sts(), updatedAt: sts() });
  b.set(cdoc(c.db, "hubOrders", id, "private", "match"), { takerUid: c.uid, role: m.role, source: m.source, name: m.name, phone: m.phone, companyName: m.companyName, vehicle: m.vehicle || null, docsVerified: m.docsVerified === true, bizStatus: m.bizStatus || "", photoPath: m.photoPath || "", at: sts() });
  await b.commit();
  await sleep(10600);
  await cupd(cdoc(c.db, "hubOrders", id), { confirmed: true, confirmedAt: sts(), updatedAt: sts() });
  await cupd(cdoc(c.db, "hubOrders", id), { status: "loaded", loadedAt: sts(), updatedAt: sts() });
  await cupd(cdoc(c.db, "hubOrders", id), { status: "delivered", deliveredAt: sts(), updatedAt: sts() });
}

async function seed() {
  await fetch(`http://127.0.0.1:${P.fs}/emulator/v1/projects/demo-kpflow/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://127.0.0.1:${P.auth}/emulator/v1/projects/demo-kpflow/accounts`, { method: "DELETE" });
  const mk = async (email, pw, name) => (await auth.createUser({ email, password: pw, displayName: name })).uid;
  const adminUid = await mk("admin@hub.test", "test1234", "허브관리자");
  await db.doc(`users/${adminUid}`).set({ email: "admin@hub.test", role: "totalMaster", companyName: "로지스웹", companyCode: "LW0001", approved: true, name: "허브관리자", phone: "010-1000-0000" });
  const kUid = await mk("staff@hanbit.test", "test1234", "김배차");
  await db.doc(`users/${kUid}`).set({ email: "staff@hanbit.test", role: "admin", companyName: "한빛로지스", companyCode: "HB1234", approved: true, name: "김배차", phone: "010-3333-4444" });
  // 로지스웹 운송사 직원 허브 회원(로그인하면 이 문서를 그대로 씀) — 푸시 기록 확인용 가짜 기기 토큰
  await db.doc(`hubMembers/${kUid}`).set({ uid: kUid, role: "carrier", source: "logisweb-staff", status: "approved", docsVerified: true, name: "김배차", phone: "010-3333-4444", companyName: "한빛로지스", email: "staff@hanbit.test", prefs: {}, fcmTokens: ["fake-token-poster"], createdAt: FV.serverTimestamp() });
  const mem = async (email, data) => { const uid = await mk(email, "test12345", data.name); await db.doc(`hubMembers/${uid}`).set({ uid, source: "signup", status: "approved", docsVerified: true, bizStatus: "계속사업자", email, prefs: {}, createdAt: FV.serverTimestamp(), ...data }); return uid; };
  const d1 = await mem("drv1@hub.test", { role: "driver", name: "김차주", phone: "010-1234-5678", companyName: "김차주운송", vehicle: { plate: "경남80바1234", type: "윙바디", ton: "11톤", length: "9.6", width: "2.35" }, bank: { bank: "국민", number: "123456-01-234567", holder: "김차주" }, fcmTokens: ["fake-token-driver1"] });
  const d2 = await mem("drv2@hub.test", { role: "driver", name: "이현금", phone: "010-2222-1111", companyName: "이현금화물", vehicle: { plate: "경기90사5678", type: "카고", ton: "11톤", length: "9.1", width: "2.3" } });
  const s1 = await mem("ship1@hub.test", { role: "shipper", name: "박화주", phone: "010-7777-8888", companyName: "서해유통" });
  await db.doc("hubSettings/config").set({ fee: { mode: "amount", value: 20000, platformRate: 0 }, depositAccount: { bank: "기업", number: "123-456789-01-011", holder: "(주)로지스웹" }, supportPhone: "1588-0000" });
  // 보드가 비지 않게 — 예시 오더(선불)
  for (const [a2, b2, fare] of [["화성시", "부산 강서구", 450000], ["이천시", "대구 달서구", 380000]]) {
    const ref = db.collection("hubOrders").doc();
    await ref.set({ v: 3, posterUid: s1, posterRole: "shipper", posterSource: "signup", posterCompany: "서해유통", posterName: "박화주", posterVerified: true, status: "open", 상차시도: "경기", 상차시군구: a2, 하차시도: b2.split(" ")[0], 하차시군구: b2.split(" ")[1], 상차일: kst(1), 상차시간: "09:00", 하차일: kst(1), 하차시간: "", 화물내용: "생활용품", 중량: "", 파레트: 10, 차량종류: "윙바디", 차량톤수: "5톤", 톤수값: 5, 상차방법: "지게차", 하차방법: "지게차", 운임: fare, 수수료: 20000, 지급방식: "선불", 긴급: false, 운행유형: "편도", 적재: "독차", 공개메모: "", 거리km: 300, takerUid: null, takerRole: null, assignedAt: null, cancelCount: 0, createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
    await ref.collection("private").doc("detail").set({ 상차지주소: `경기 ${a2} 물류로 1`, 하차지주소: `${b2} 산업로 2`, posterPhone: "010-7777-8888" });
  }
  return { adminUid, kUid, d1, d2, s1 };
}

const SCAN_TEXT = [
  "상차: 한빛로지스 화성센터 경기도 화성시 향남읍 제약공단1길 7",
  "상차담당 김상차 010-2345-6789",
  "상차시간 09:00",
  "하차: 녹산물류센터 부산광역시 강서구 녹산산단321로 24 14시까지",
  "11톤 윙바디 생활용품 14파레트",
  "운임 60만 인수증 / 수수료 2만",
].join("\n");

(async () => {
  const U = await seed();
  console.log("seeded", U);
  browser = await chromium.launch();
  docPage = await (await browser.newContext({ viewport: { width: 600, height: 400 } })).newPage();

  // ───────── A. 운송사(로지스웹 직원, PC) 예치금 충전 요청
  const K = await ctx("pc", "poster-K");
  await hubLogin(K, "carrier", "logisweb", { company: "한빛로지스", code: "HB1234", email: "staff@hanbit.test", pw: "test1234" });
  await K.waitForSelector('[data-testid="board-list"]', { timeout: 30000 });
  await nav(K, "wallet");
  await K.waitForSelector('[data-testid="wallet-view"]');
  await shot(K, "pc-01-wallet-empty");
  check("입금 계좌(회사) 표시", (await K.textContent('[data-testid="deposit-account"]')).includes("123-456789-01-011"));
  await K.fill('[data-testid="charge-amount"]', "2000000");
  await K.click('[data-testid="charge-submit"]');
  await K.waitForSelector('[data-testid="charge-list"]', { timeout: 10000 });
  await shot(K, "pc-02-wallet-charge-requested");

  // ───────── B. 관리자(휴대폰) 입금 확인 · 설정 · 공지
  const H = await ctx("m", "admin-m");
  await hubLogin(H, "carrier", "logisweb", { company: "로지스웹", code: "LW0001", email: "admin@hub.test", pw: "test1234" });
  await H.waitForSelector('[data-testid="board-list"]', { timeout: 30000 });
  await H.goto(`${HUB}/admin`); await H.waitForSelector('[data-testid="hub-admin"]', { timeout: 20000 });
  await shot(H, "m-01-admin-members");
  await H.click('[data-testid="admin-sec-money"]');
  await H.waitForSelector('[data-testid="admin-charge-confirm"]', { timeout: 15000 });
  await shot(H, "m-02-admin-money-charges");
  await H.click('[data-testid="admin-charge-confirm"]');
  const wK1 = await until(async () => { const w = await W(U.kUid); return w.available === 2000000 && w; });
  check("관리자 입금 확인 → 서버가 예치금 200만원 충전(원장 기록)", !!wK1, JSON.stringify(await W(U.kUid)));
  await K.waitForFunction(() => document.querySelector('[data-testid="wallet-available"]')?.textContent.includes("2,000,000"), null, { timeout: 15000 });
  await shot(K, "pc-03-wallet-charged");
  check("충전 원장 줄(충전)", (await db.collection("hubLedger").where("uid", "==", U.kUid).where("type", "==", "charge").get()).size === 1);
  await H.click('[data-testid="admin-sec-settings"]'); await H.waitForSelector('[data-testid="admin-settings"]'); await shot(H, "m-03-admin-settings", true);
  await H.click('[data-testid="admin-sec-announce"]'); await H.click('[data-testid="ann-new"]');
  await H.fill('[data-testid="ann-title"]', "예치금 결제 오픈 안내"); await H.fill('[data-testid="ann-body"]', "인수증 · 예치금 결제 오더는 예치금이 있어야 올릴 수 있습니다. [정산] 탭에서 충전하세요.");
  await H.locator('[data-testid="admin-announce"] input[type="checkbox"]').first().check();
  await H.click('[data-testid="ann-save"]'); await sleep(800);
  await shot(H, "m-04-admin-announce");

  // ───────── C. 오더 스캔 → 허브 칸 → 오더 올리기(인수증 결제 60만 + 수수료 2만)
  await nav(K, "board");
  await K.waitForSelector('[data-testid="announce-banner"]', { timeout: 15000 });
  check("공지가 보드 맨 위에 보임", (await K.textContent('[data-testid="announce-banner"]')).includes("예치금 결제 오픈"));
  await K.click('[data-testid="btn-post"]'); await K.waitForSelector('[data-testid="post-form"]');
  check("수수료 기본값(관리자 설정 2만원)", (await K.inputValue('[data-testid="pf-fee"]')) === "20,000");
  await K.click('[data-testid="pf-scan"]');
  await K.waitForSelector('textarea[data-os-input]', { timeout: 20000 });
  await K.fill('textarea[data-os-input]', SCAN_TEXT);
  await shot(K, "pc-04-scan-input");
  await K.click('button:has-text("스캔하기")');
  await K.waitForSelector('button:has-text("허브 오더에 적용"):not([disabled])', { timeout: 20000 });
  await sleep(600);
  await shot(K, "pc-05-scan-result");
  await K.click('button:has-text("허브 오더에 적용")');
  await sleep(600);
  const v = async (t) => K.inputValue(`[data-testid="${t}"]`);
  const filled = { a1: await v("pf-상차-sido"), a2: await v("pf-상차-sgg"), b1: await v("pf-하차-sido"), b2: await v("pf-하차-sgg"), addrA: await v("pf-상차-addr"), fare: await v("pf-fare"), fee: await v("pf-fee"), ton: await v("pf-vton"), car: await v("pf-vtype"), pallet: await v("pf-pallet") };
  console.log("scan filled:", JSON.stringify(filled));
  check("스캔 → 상차 경기/화성시 · 하차 부산/강서구", filled.a1 === "경기" && filled.a2 === "화성시" && filled.b1 === "부산" && filled.b2 === "강서구", JSON.stringify(filled));
  check("스캔 → 상세주소 · 운임 60만 · 수수료 2만 · 11톤 윙바디 · 14파레트", filled.addrA.includes("제약공단1길") && filled.fare === "600,000" && filled.fee === "20,000" && filled.ton === "11톤" && filled.car === "윙바디" && filled.pallet === "14", JSON.stringify(filled));
  check("스캔 → 결제 방식 인수증", (await K.getAttribute('[data-testid="pf-pay-인수증"]', "class") || "").includes("bg-[#0F1A30]") || (await K.textContent('[data-testid="pf-pay-hint"]')).includes("예치금 결제"));
  await K.fill('[data-testid="pf-cargo"]', "생활용품 14파레트");
  await K.locator('[data-testid="post-form"] .overflow-y-auto').first().evaluate((el) => el.scrollTo(0, el.scrollHeight * 0.55));
  await shot(K, "pc-06-post-scanned-fare");
  await K.click('[data-testid="pf-submit"]');
  await K.waitForSelector('[data-testid="post-form"]', { state: "detached", timeout: 15000 });
  const oid = await until(async () => (await db.collection("hubOrders").where("posterUid", "==", U.kUid).get()).docs[0]?.id);
  check("스캔한 오더 등록", !!oid);
  const o0 = (await db.doc(`hubOrders/${oid}`).get()).data();
  const det0 = (await db.doc(`hubOrders/${oid}/private/detail`).get()).data();
  check("등록 오더: 인수증 · 운임 600,000 · 수수료 20,000 · 장소명(비공개)", o0.지급방식 === "인수증" && o0.운임 === 600000 && o0.수수료 === 20000 && !!det0.상차지명 && !o0.상차지명, JSON.stringify({ pay: o0.지급방식, fare: o0.운임, fee: o0.수수료, name: det0.상차지명 }));

  // ───────── D. 차주(휴대폰) 배차신청 → 등록자 알림 + 푸시 기록
  const D = await ctx("m", "driver-D1", { latitude: 37.205, longitude: 126.84, accuracy: 12 });
  await hubLogin(D, "driver", "hub", { email: "drv1@hub.test", pw: "test12345" });
  await D.waitForSelector('[data-testid="board-list"]', { timeout: 30000 });
  await D.locator('[data-testid="order-card"]', { hasText: "한빛로지스" }).first().click();
  await D.waitForSelector('[data-testid="order-detail"]'); await sleep(500);
  await D.click('[data-testid="btn-request"]');
  await D.waitForSelector('[data-testid="cancel-window"]', { timeout: 10000 });
  const nAssigned = await until(async () => { const q = await db.collection("hubNotices").where("toUid", "==", U.kUid).where("type", "==", "assigned").get(); const n = q.docs[0]?.data(); return n?.push ? n : null; });
  check("배차신청 → 등록자 알림(hubNotices) 생성", !!nAssigned);
  check("배차신청 → 등록자 기기로 푸시 발송 기록(push.count ≥ 1)", (nAssigned?.push?.count || 0) >= 1, JSON.stringify(nAssigned?.push));
  // ───────── E. 10초 확정 → 배차된 회원 알림 · 예치금 보류 · 로지스웹 배차 오더 생성
  await D.waitForSelector('[data-testid="btn-call-cancel"]', { timeout: 20000 });
  const nConf = await until(async () => (await db.collection("hubNotices").where("toUid", "==", U.d1).where("type", "==", "confirmed").get()).size > 0);
  check("확정 → 배차된 차주에게 알림", !!nConf);
  const wHeld = await until(async () => { const w = await W(U.kUid); return w.held === 620000 && w; });
  check("확정 → 등록자 예치금에서 운임+수수료 62만원 보류(가능 138만)", !!wHeld && wHeld.available === 1380000, JSON.stringify(await W(U.kUid)));
  const lw = await until(async () => { const s = await db.doc(`orders/hub_${oid}`).get(); return s.exists && s.data().차량번호 ? s.data() : null; });
  check("로지스웹 배차 오더 생성 + 기사 차량번호 · 이름 · 전화", !!lw && lw.차량번호 === "경남80바1234" && lw.이름 === "김차주" && lw.전화번호 === "010-1234-5678" && lw.companyName === "한빛로지스" && lw.배차상태 === "배차완료", JSON.stringify(lw && { car: lw.차량번호, name: lw.이름, tel: lw.전화번호, co: lw.companyName, st: lw.배차상태 }));
  check("로지스웹 오더에 상·하차 상세주소", !!lw && String(lw.상차지주소).includes("제약공단1길") && String(lw.하차지주소).includes("녹산산단"));
  await shot(D, "m-05-driver-confirmed-sharing");

  // ───────── F. 위치관제 — 차주 위치 공유 → 등록자(PC) 지도
  const live1 = await until(async () => (await db.doc(`hubLive/${oid}`).get()).data(), 20000);
  check("차주 화면이 위치를 보냄(hubLive)", !!live1 && Math.abs(live1.lat - 37.205) < 0.001, JSON.stringify(live1));
  await nav(K, "posts");
  await K.locator('[data-testid="order-card"]', { hasText: "한빛로지스" }).first().click();
  await K.waitForSelector('[data-testid="btn-live"]', { timeout: 15000 });
  await K.click('[data-testid="btn-live"]');
  await K.waitForSelector('[data-kp="live-modal"]', { timeout: 20000 });
  await K.waitForSelector('[data-kp="live-modal"] .leaflet-container', { timeout: 20000 });
  await sleep(1500);
  const liveTxt = await K.textContent('[data-kp="live-modal"]');
  check("등록자 관제 창 — 배차 프로그램과 같은 화면(LIVE · 운행 단계 · 속도 · 도착 예상)", ["실시간 관제", "운행 단계", "현재 속도", "도착 예상", "경남80바1234"].every((x) => liveTxt.includes(x)), liveTxt.slice(0, 200));
  await shot(K, "pc-07-live-map");
  await D.context().setGeolocation({ latitude: 37.10, longitude: 127.05, accuracy: 10 });
  const moved = await until(async () => { const l = (await db.doc(`hubLive/${oid}`).get()).data(); return l && Math.abs(l.lat - 37.10) < 0.001 ? l : null; }, 25000);
  check("차주가 움직이면 위치가 따라 갱신", !!moved);
  const tr = await db.collection(`hubLive/${oid}/track`).get();
  check("이동 경로 점 기록(track)", tr.size >= 1, `size ${tr.size}`);
  await sleep(1200);
  await shot(K, "pc-08-live-map-moved");
  await K.locator('[data-kp="live-modal"] button[aria-label="닫기"]').first().click(); await sleep(400);
  // 관리자(휴대폰)도 같은 관제 창
  await H.click('[data-testid="admin-sec-orders"]');
  await H.locator('[data-testid="admin-order-row"]', { hasText: "한빛로지스" }).first().click();
  await H.waitForSelector('[data-testid="btn-live"]', { timeout: 15000 });
  await shot(H, "m-06-admin-order-detail");
  await H.click('[data-testid="btn-live"]');
  await H.waitForSelector('[data-kp="live-modal"] .leaflet-container', { timeout: 20000 }); await sleep(1500);
  await shot(H, "m-07-admin-live-map");
  await H.locator('[data-kp="live-modal"] button[aria-label="닫기"]').first().click(); await sleep(400);
  await H.locator('[data-testid="order-detail"] button[aria-label="닫기"]').click(); await sleep(400);

  // ───────── G. 상차 → 운송완료 + 인수증 2장 → 알림 · 로지스웹 첨부 · 관제 종료
  await D.click('[data-testid="btn-loaded"]');
  await D.waitForSelector('[data-testid="btn-delivered"]', { timeout: 10000 });
  check("상차 → 등록자 알림", !!(await until(async () => (await db.collection("hubNotices").where("toUid", "==", U.kUid).where("type", "==", "loaded").get()).size > 0)));
  await D.setInputFiles('[data-testid="pod-input"]', [
    { name: "인수증1.png", mimeType: "image/png", buffer: await docImage("인 수 증", ["품목: 생활용품 14파레트", "인수자: 이하차 (서명)", kst(0)]) },
    { name: "거래명세서.png", mimeType: "image/png", buffer: await docImage("거래명세서", ["녹산물류센터 · 14PLT", "수령 확인"]) },
  ]);
  await shot(D, "m-08-driver-pod-selected");
  await D.click('[data-testid="btn-delivered"]');
  await D.waitForSelector('[data-testid="invoice-form"]', { timeout: 20000 });
  const od = await until(async () => { const x = (await db.doc(`hubOrders/${oid}`).get()).data(); return x.status === "delivered" && (x.pod || []).length === 2 ? x : null; });
  check("운송완료 + 인수증 2장 저장", !!od);
  check("인수증 → 등록자 알림(pod) + 푸시 기록", !!(await until(async () => { const q = await db.collection("hubNotices").where("toUid", "==", U.kUid).where("type", "==", "pod").get(); return q.docs[0]?.data()?.push?.count >= 1; })));
  const atts = await until(async () => { const q = await db.collection(`orders/hub_${oid}/attachments`).get(); return q.size === 2 ? q.docs.map((d) => d.data()) : null; }, 25000);
  check("로지스웹 배차 오더 첨부에 인수증 2장(base64 · url)", !!atts && atts.every((a) => a.base64?.startsWith("data:image/png") && a.url.includes("/o/hub%2Fpod")), atts ? "" : `size ${(await db.collection(`orders/hub_${oid}/attachments`).get()).size}`);
  const lw2 = (await db.doc(`orders/hub_${oid}`).get()).data();
  check("로지스웹 오더 운송완료 · attachCount 2", lw2.기사확인상태 === "완료" && lw2.attachCount === 2, JSON.stringify({ st: lw2.기사확인상태, n: lw2.attachCount }));
  check("운송완료 → 위치관제 기록 삭제", !!(await until(async () => !(await db.doc(`hubLive/${oid}`).get()).exists)));
  await shot(D, "m-09-driver-delivered-invoice-form");
  // 등록자(PC) — 인수증 보기 · 저장 · 공유
  await K.waitForSelector('[data-testid="pod-card"]', { timeout: 15000 });
  check("운송완료 뒤 등록자 화면에 관제 버튼 없음", !(await K.isVisible('[data-testid="btn-live"]')));
  await K.waitForFunction(() => document.querySelectorAll('[data-testid="pod-img"]').length === 2, null, { timeout: 15000 });
  check("등록자 화면 인수증 2장", (await K.locator('[data-testid="pod-img"]').count()) === 2);
  await K.locator('[data-testid="pod-card"]').scrollIntoViewIfNeeded();
  await shot(K, "pc-09-pod-gallery");
  await K.locator('[data-testid="pod-img"]').first().click();
  await K.waitForSelector('[data-testid="pod-viewer"]');
  check("인수증 크게 보기 · 저장 · 공유 버튼", await K.isVisible('[data-testid="pod-save"]') && await K.isVisible('[data-testid="pod-share"]'));
  const [dl] = await Promise.all([K.waitForEvent("download", { timeout: 10000 }).catch(() => null), K.click('[data-testid="pod-save"]')]);
  check("인수증 저장(내려받기)", !!dl, "");
  await shot(K, "pc-10-pod-viewer");
  await K.locator('[data-testid="pod-viewer"] button[aria-label="닫기"]').click();

  // ───────── H. 계산서 발행 → 정산(차감 · 지급 예정 · 수수료 입금)
  await D.fill('[data-testid="inv-no"]', "20261107-41000000-12345678");
  await D.click('[data-testid="inv-submit"]');
  const settled = await until(async () => { const x = (await db.doc(`hubOrders/${oid}`).get()).data(); return x.settle?.status === "settled" ? x : null; });
  check("계산서 발행 → 정산 완료", !!settled);
  const wK2 = await W(U.kUid), wD1 = await W(U.d1);
  check("등록자: 보류 62만 차감 · 수수료 2만 입금 → 가능 140만 · 보류 0", wK2.available === 1400000 && wK2.held === 0 && wK2.feeEarned === 20000, JSON.stringify(wK2));
  check("차주: 운임 60만 지급 예정", wD1.pending === 600000, JSON.stringify(wD1));
  const po = (await db.doc(`hubPayouts/po_${oid}`).get()).data();
  check("지급 대기열 + 정산 계좌 스냅샷", po?.status === "queued" && po.amount === 600000 && po.bank?.number === "123456-01-234567", JSON.stringify(po && { st: po.status, a: po.amount, bank: po.bank }));
  check("정산 알림(등록자 차감 · 차주 지급 예정)", !!(await until(async () => (await db.collection("hubNotices").where("type", "==", "settle").get()).size >= 2)));
  await D.waitForSelector('[data-testid="settle-status"]:has-text("정산 완료")', { timeout: 15000 });
  await D.locator('[data-testid="settle-card"]').scrollIntoViewIfNeeded();
  await shot(D, "m-10-driver-settled");
  await D.locator('[data-testid="order-detail"] button[aria-label="닫기"]').click(); await sleep(400);
  await nav(D, "wallet"); await D.waitForSelector('[data-testid="wallet-view"]');
  await D.waitForFunction(() => document.querySelector('[data-testid="wallet-pending"]')?.textContent.includes("600,000"), null, { timeout: 15000 });
  await shot(D, "m-11-driver-wallet-pending", true);
  await K.locator('[data-testid="order-detail"] button[aria-label="닫기"]').click(); await sleep(300);
  await nav(K, "wallet"); await K.waitForFunction(() => document.querySelector('[data-testid="wallet-available"]')?.textContent.includes("1,400,000"), null, { timeout: 15000 });
  await shot(K, "pc-11-wallet-after-settle");

  // ───────── I. 관리자 지급(지급대행 어댑터 → 수동) → 지급완료
  await H.click('[data-testid="admin-sec-money"]'); await H.click('[data-testid="money-payouts"]');
  await H.waitForSelector('[data-testid="admin-payout-request"]', { timeout: 15000 });
  await H.click('[data-testid="admin-payout-request"]');
  const ad = await until(async () => (await db.doc(`hubPayouts/po_${oid}`).get()).data()?.adapter);
  check("지급 요청 → requestPayout 어댑터(지급대행 계약 전: 수동 안내)", ad?.mode === "manual", JSON.stringify(ad));
  await sleep(600);
  await shot(H, "m-12-admin-payouts");
  await H.click('[data-testid="admin-payout-paid"]');
  await H.click('button:has-text("지급완료") >> nth=-1');
  const wD2 = await until(async () => { const w = await W(U.d1); return w.paidOut === 600000 && w; });
  check("지급완료 → 차주 지급 예정 0 · 지급 완료 60만", !!wD2 && wD2.pending === 0, JSON.stringify(await W(U.d1)));
  check("차주에게 지급 완료 알림", !!(await until(async () => (await db.collection("hubNotices").where("toUid", "==", U.d1).where("title", "==", "운임 지급 완료").get()).size > 0)));
  await sleep(800);
  await shot(D, "m-13-driver-wallet-paid", true);

  // ───────── J. 선불 · 착불 — 차주 수수료(예치금 부족 → 미정산 → 충전 시 자동 상환 / 넉넉하면 바로 차감)
  const S1 = await client("ship1@hub.test", "test12345");
  const D2 = await client("drv2@hub.test", "test12345");
  const AD = await client("admin@hub.test", "test1234");
  const mS1 = (await db.doc(`hubMembers/${U.s1}`).get()).data(), mD2 = (await db.doc(`hubMembers/${U.d2}`).get()).data();
  const cashId = await sdkPost(S1, mS1, { 운임: 300000, 수수료: 20000, 지급방식: "착불" });
  await sdkTakeToDelivered(D2, mD2, cashId);
  const owed = await until(async () => { const x = (await db.doc(`hubOrders/${cashId}`).get()).data(); return x.settle?.status === "fee_owed" ? x : null; });
  check("착불 · 차주 예치금 0 → 수수료 2만 미정산 기록", !!owed && (await W(U.d2)).owed === 20000, JSON.stringify(await W(U.d2)));
  check("미정산(hubDebts) 열림", (await db.doc(`hubDebts/debt_${cashId}`).get()).data()?.status === "open");
  const chId = (await cadd(ccol(D2.db, "hubCharges"), { uid: D2.uid, name: mD2.name, amount: 50000, depositor: "이현금", status: "requested", createdAt: sts() })).id;
  await cupd(cdoc(AD.db, "hubCharges", chId), { status: "confirmed", confirmedAt: sts(), confirmedBy: "admin@hub.test" });
  const wD2b = await until(async () => { const w = await W(U.d2); return w.owed === 0 && w.available === 30000 ? w : null; });
  check("차주 5만원 충전 → 미정산 2만 자동 상환(가능 3만 · 미정산 0)", !!wD2b, JSON.stringify(await W(U.d2)));
  check("등록자(화주)에게 수수료 2만 입금", (await W(U.s1)).available === 20000, JSON.stringify(await W(U.s1)));
  check("미정산 상환 완료 표시", (await db.doc(`hubDebts/debt_${cashId}`).get()).data()?.status === "paid");
  await sleep(20500); // 등록 간격 20초
  const cash2 = await sdkPost(S1, mS1, { 운임: 250000, 수수료: 20000, 지급방식: "선불" });
  await sdkTakeToDelivered(D2, mD2, cash2);
  const fp = await until(async () => { const x = (await db.doc(`hubOrders/${cash2}`).get()).data(); return x.settle?.status === "fee_paid" ? x : null; });
  check("선불 · 차주 예치금 넉넉 → 수수료 바로 차감(가능 1만) · 화주 +2만(4만)", !!fp && (await W(U.d2)).available === 10000 && (await W(U.s1)).available === 40000, JSON.stringify({ d2: await W(U.d2), s1: await W(U.s1) }));
  // 취소 → 보류 해제(예치금 결제)
  await sleep(20500);
  const S1b = S1; // 화주 예치금 4만 → 3만 + 수수료 1만 인수증 오더는 등록 가능
  const depId = await sdkPost(S1b, mS1, { 운임: 20000, 수수료: 10000, 지급방식: "인수증" });
  await sdkTakeToDelivered(D2, mD2, depId).catch(() => {});
  check("작은 인수증 오더 확정 → 보류 3만", (await until(async () => (await W(U.s1)).held === 30000)) === true, JSON.stringify(await W(U.s1)));

  // ───────── K. 예치금 부족 화면(화주 휴대폰) — 인수증 결제 오더 막힘
  const SM = await ctx("m", "shipper-poor");
  await hubLogin(SM, "shipper", "hub", { email: "ship1@hub.test", pw: "test12345" });
  await SM.waitForSelector('[data-testid="board-list"]', { timeout: 30000 });
  await SM.click('[data-testid="fab-post"]'); await SM.waitForSelector('[data-testid="post-form"]');
  await SM.selectOption('[data-testid="pf-상차-sido"]', "경기"); await SM.selectOption('[data-testid="pf-상차-sgg"]', "평택시"); await SM.fill('[data-testid="pf-상차-addr"]', "경기 평택시 포승읍 1");
  await SM.selectOption('[data-testid="pf-하차-sido"]', "경남"); await SM.selectOption('[data-testid="pf-하차-sgg"]', "창원시"); await SM.fill('[data-testid="pf-하차-addr"]', "경남 창원시 성산구 2");
  await SM.fill('[data-testid="pf-cargo"]', "철강 코일"); await SM.fill('[data-testid="pf-fare"]', "600000");
  await SM.click('[data-testid="pf-submit"]');
  await SM.waitForSelector('[data-testid="pf-error"]', { timeout: 10000 });
  check("예치금 부족 → 인수증 결제 오더 등록 막힘(안내)", (await SM.textContent('[data-testid="pf-error"]')).includes("예치금이 부족"));
  await SM.locator('[data-testid="pf-pay-hint"]').scrollIntoViewIfNeeded();
  await shot(SM, "m-14-post-insufficient-deposit");
  await SM.click('[data-testid="pf-pay-착불"]'); await sleep(300);
  await shot(SM, "m-15-post-cash-ok");
  await SM.locator('[data-testid="post-form"] button:has-text("닫기")').click();
  await nav(SM, "wallet"); await SM.waitForSelector('[data-testid="wallet-ledger"]'); await sleep(600);
  await shot(SM, "m-16-shipper-wallet-ledger", true);
  await nav(SM, "notices"); await SM.waitForSelector('[data-testid="notices"]'); await sleep(500);
  await shot(SM, "m-17-shipper-notices");

  // ───────── L. 관리자 PC — 회원 수정 · 오더 수정 · 단계 강제 · 정산 화면
  await H.context().close();
  const A = await ctx("pc", "admin-pc");
  await hubLogin(A, "carrier", "logisweb", { company: "로지스웹", code: "LW0001", email: "admin@hub.test", pw: "test1234" });
  await A.waitForSelector('[data-testid="board-list"]', { timeout: 30000 });
  await A.click('[data-testid="nav-admin"]'); await A.waitForSelector('[data-testid="hub-admin"]');
  await A.locator('[data-testid="hub-admin"] button').filter({ hasText: /^승인\d+$/ }).first().click(); await sleep(500);
  await A.locator('[data-testid="admin-member-row"]', { hasText: "이현금" }).click();
  await A.waitForSelector('[data-testid="member-review"]'); await sleep(800);
  await A.fill('[data-testid="am-phone"]', "010-9999-8888");
  await A.locator('[data-testid="admin-member-edit"]').scrollIntoViewIfNeeded();
  await shot(A, "pc-12-admin-member-edit");
  await A.click('[data-testid="am-save"]');
  check("관리자 회원 정보 수정(전화)", !!(await until(async () => (await db.doc(`hubMembers/${U.d2}`).get()).data().phone === "010-9999-8888")));
  await A.fill('[data-testid="adj-amount"]', "5000"); await A.fill('[data-testid="adj-memo"]', "이벤트 지급");
  await A.click('[data-testid="adj-plus"]');
  check("관리자 예치금 조정 +5천(원장 · 잔액 반영)", !!(await until(async () => (await W(U.d2)).available === 15000)), JSON.stringify(await W(U.d2)));
  await A.locator('[data-testid="member-review"] button[aria-label="닫기"]').click(); await sleep(400);
  await A.click('[data-testid="admin-sec-orders"]'); await A.waitForSelector('[data-testid="admin-orders"]'); await sleep(800);
  await shot(A, "pc-13-admin-orders");
  await A.locator('[data-testid="admin-order-row"]', { hasText: "이천시" }).first().click();
  await A.waitForSelector('[data-testid="admin-order-panel"]', { timeout: 15000 }); await sleep(600);
  await A.fill('[data-testid="ao-fare"]', "410000");
  await A.click('[data-testid="ao-save"]');
  const sampleId = (await db.collection("hubOrders").where("상차시군구", "==", "이천시").get()).docs[0].id;
  check("관리자 오더 운임 수정", !!(await until(async () => (await db.doc(`hubOrders/${sampleId}`).get()).data().운임 === 410000)));
  await A.locator('[data-testid="admin-order-panel"]').scrollIntoViewIfNeeded();
  await shot(A, "pc-14-admin-order-edit");
  await A.click('[data-testid="ao-status-cancelled"]'); await A.click('button:has-text("바꾸기")');
  check("관리자 단계 강제 변경(취소)", !!(await until(async () => (await db.doc(`hubOrders/${sampleId}`).get()).data().status === "cancelled")));
  await A.locator('[data-testid="order-detail"] button[aria-label="닫기"]').click(); await sleep(300);
  await A.click('[data-testid="admin-sec-money"]'); await sleep(500); await shot(A, "pc-15-admin-money");
  await A.click('[data-testid="money-ledger"]'); await sleep(900); await shot(A, "pc-16-admin-ledger");
  await A.click('[data-testid="admin-sec-settings"]'); await sleep(500); await shot(A, "pc-17-admin-settings");
  await nav(D, "notices"); await D.waitForSelector('[data-testid="notices"]'); await sleep(500); await shot(D, "m-18-driver-notices");
  await nav(D, "me"); await D.waitForSelector('[data-testid="me-view"]'); await sleep(500); await shot(D, "m-19-driver-me", true);

  console.log("\n" + log.join("\n"));
  console.log(`\nE2E(2차) 확인 ${ok + bad}개 — 통과 ${ok} · 실패 ${bad}`);
  console.log(`화면 → ${OUT}`);
  console.log("콘솔 오류:", errs.length ? "\n" + [...new Set(errs)].slice(0, 30).join("\n") : "없음");
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(async (e) => { console.error("E2E 중단:", e); console.log(log.join("\n")); console.log("콘솔 오류:", [...new Set(errs)].slice(0, 30).join("\n")); try { await browser.close(); } catch { /* */ } process.exit(2); });
