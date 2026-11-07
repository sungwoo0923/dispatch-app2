// ⭐ 2026-11-07 허브 차주 로그인 E2E(에뮬레이터 전용 · 배포 안 함) — 차량번호(아이디) + 휴대폰번호 · 본인 휴대폰(문자 인증 + 등록 기기) · 휴대폰에서만
//  ① 로그인 화면: [로지스웹 계정으로 로그인] 아래 "로지스웹 가입자는 누르세요" · 차주 = 차량번호 + 휴대폰번호 · [이메일로 가입했어요]
//  ② 가입: 차량번호 + 휴대폰번호 → 문자 인증(에뮬레이터 인증번호) → 기기 등록 → 정보 · 서류 → 신청 · 같은 차량번호는 "이미 가입된 차량번호예요"
//  ③ 새로고침해도 로그인 유지 · 로그아웃하면 차량번호가 입력돼 있음 · 틀린 번호 안내 · 같은 휴대폰은 문자 없이 로그인
//  ④ 다른 휴대폰: 막힘 → [문자 인증하고 이 휴대폰으로 바꾸기] → 옮김 · 예전 휴대폰은 로그아웃
//  ⑤ PC에서 차주: QR 안내 화면 · 이메일로 가입한 예전 차주도 문자 인증 · 관리자: 등록 휴대폰 보기 · 기기 초기화 · 휴대폰번호 바꾸면 로그인 번호도
//  실행(포트는 firebase.hubtest.json):
//   1) firebase emulators:start --only auth,firestore,storage,functions --project demo-kpflow --config firebase.hubtest.json
//   2) cd cafe-site && VITE_USE_EMULATOR=1 VITE_EMU_AUTH_PORT=19099 VITE_EMU_FS_PORT=18080 VITE_EMU_STORAGE_PORT=19199 VITE_EMU_FN_PORT=15001 npx vite --port 5371
//   3) HUB_URL=http://127.0.0.1:5371 node scripts/hubTests/e2e_hub_driver.cjs   (화면 저장: HUB_SHOTS 폴더)
const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "../..");
const P = { fs: process.env.EMU_FS_PORT || 18080, auth: process.env.EMU_AUTH_PORT || 19099, st: process.env.EMU_ST_PORT || 19199 };
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${P.fs}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${P.auth}`;
process.env.FIREBASE_STORAGE_EMULATOR_HOST = `127.0.0.1:${P.st}`;
const req = (m) => require(require.resolve(m, { paths: [ROOT, path.join(ROOT, "functions")] }));
const admin = req("firebase-admin");
const { chromium, devices } = require(require.resolve("playwright", { paths: [process.env.PLAYWRIGHT_DIR || "/opt/node-tools/node_modules", ROOT] }));

const OUT = process.env.HUB_SHOTS || "/tmp/claude-0/-home-user-dispatch-app2/dff9cc41-f4fc-5104-a1e1-a526f03e5d42/scratchpad/hubdrv";
const HUB = process.env.HUB_URL || "http://127.0.0.1:5371";
fs.mkdirSync(OUT, { recursive: true });
admin.initializeApp({ projectId: "demo-kpflow" });
const db = admin.firestore();
const auth = admin.auth();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = []; let ok = 0, bad = 0;
const check = (name, cond, extra = "") => { if (cond) { ok++; log.push(`PASS ${name}`); } else { bad++; log.push(`FAIL ${name} ${extra}`); } console.log(log[log.length - 1]); };
const errs = [];
let browser;
const PAGES = [];
async function until(fn, ms = 20000, step = 300) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { try { v = await fn(); if (v) return v; } catch { /* 다시 */ } await sleep(step); } return v; }
const J = (x) => JSON.stringify(x);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

async function ctx(kind, label) {
  const c = await browser.newContext(kind === "pc" ? { viewport: { width: 1440, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul" } : { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await c.grantPermissions(["geolocation"], { origin: HUB });
  await c.setGeolocation({ latitude: 36.995, longitude: 127.11, accuracy: 15 });
  await c.route("https://apis.openapi.sk.com/**", (r) => r.fulfill({ json: {} }));
  const p = await c.newPage();
  p.on("pageerror", (e) => errs.push(`[${label}] ${e}`));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|fonts\.g|net::ERR|tile\.openstreetmap|Failed to load resource|permission|recaptcha/i.test(m.text())) errs.push(`[${label}] ${m.text().slice(0, 220)}`); });
  p.on("dialog", (d) => d.accept());
  if (process.env.NETLOG) { p.on("request", (r) => { if (/19199|15001|19099/.test(r.url())) console.log(`>> [${label}] ${r.method()} ${r.url().slice(0, 140)}`); }); p.on("requestfailed", (r) => console.log(`!! [${label}] ${r.url().slice(0, 140)} ${r.failure()?.errorText}`)); p.on("response", (r) => { if (/19199/.test(r.url())) console.log(`<< [${label}] ${r.status()} ${r.url().slice(0, 120)}`); }); }
  p.label = label;
  PAGES.push(p);
  return p;
}
const shot = async (p, name, full = false) => { await sleep(500); await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full, timeout: 45000 }); };
// 에뮬레이터가 "보낸" 문자 인증번호(가장 최근 것)
async function smsCode(phone) {
  const r = await fetch(`http://127.0.0.1:${P.auth}/emulator/v1/projects/demo-kpflow/verificationCodes`).then((x) => x.json());
  const list = (r.verificationCodes || []).filter((v) => v.phoneNumber === phone);
  return list.length ? list[list.length - 1].code : "";
}
async function doSms(p, phone, shotName) {
  await p.waitForSelector('[data-testid="sms-send"]', { timeout: 20000 });
  const before = (await fetch(`http://127.0.0.1:${P.auth}/emulator/v1/projects/demo-kpflow/verificationCodes`).then((x) => x.json())).verificationCodes?.length || 0;
  await p.click('[data-testid="sms-send"]');
  await p.waitForSelector('[data-testid="sms-code"]', { timeout: 20000 });
  const code = await until(async () => { const r = await fetch(`http://127.0.0.1:${P.auth}/emulator/v1/projects/demo-kpflow/verificationCodes`).then((x) => x.json()); return (r.verificationCodes || []).length > before ? smsCode(phone) : ""; });
  await p.fill('[data-testid="sms-code"]', code);
  if (shotName) await shot(p, shotName);
  await p.click('[data-testid="sms-confirm"]');
  return code;
}
const loginPlate = async (p, plate, phone) => {
  await p.goto(`${HUB}/login?role=driver&mode=hub`);
  await p.waitForSelector('[data-testid="login-plate"]');
  if (plate !== null) await p.fill('[data-testid="login-plate"]', plate);
  await p.fill('[data-testid="login-phone"]', phone);
  await p.click('[data-testid="login-submit"]');
};
const inApp = (p, ms = 90000) => p.waitForSelector('[data-testid="region-bar"], [data-testid="board-list"], [data-testid="stat-open"], [data-testid="gate-edit"]', { timeout: ms });
const logoutM = async (p) => { await p.click('[data-testid="tab-my"]'); await p.click('[data-testid="btn-logout"]'); await p.waitForURL(/\/login/, { timeout: 15000 }); };

async function seed() {
  await fetch(`http://127.0.0.1:${P.fs}/emulator/v1/projects/demo-kpflow/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://127.0.0.1:${P.auth}/emulator/v1/projects/demo-kpflow/accounts`, { method: "DELETE" });
  const a = await auth.createUser({ email: "admin@hub.test", password: "test1234" });
  await db.doc(`users/${a.uid}`).set({ email: "admin@hub.test", role: "totalMaster", companyName: "로지스웹", companyCode: "LW0001", approved: true, name: "허브관리자" });
  // 예전에 이메일로 가입한 차주(휴대폰 연결됨 · 다른 휴대폰이 등록돼 있음)
  const old = await auth.createUser({ email: "olddrv@hub.test", password: "test12345", phoneNumber: "+821077778888" });
  await db.doc(`hubMembers/${old.uid}`).set({ uid: old.uid, role: "driver", source: "signup", status: "approved", docsVerified: true, email: "olddrv@hub.test", name: "예전차주", phone: "010-7777-8888", companyName: "예전차주", vehicle: { plate: "경기70아7070", type: "카고", ton: "5톤", length: "6.2", width: "" }, bank: { bank: "국민", number: "123456-01-234567", holder: "예전차주" }, prefs: {} });
  await db.doc(`hubDevices/${old.uid}`).set({ uid: old.uid, id: "seed-device-000000000000", label: "Android 14 SM-S918N, Chrome", phone: "+821077778888" });
  await db.doc("hubSettings/config").set({ fee: { mode: "amount", value: 20000, platformRate: 0 } });
  return { adminUid: a.uid, oldUid: old.uid };
}

(async () => {
  const U = await seed();
  browser = await chromium.launch();
  const PLATE = "경기12가3456", PHONE = "010-2345-6789", E164 = "+821023456789";

  // ───────── ① 로그인 화면
  const A = await ctx("m", "phoneA");
  await A.goto(`${HUB}/login?role=driver&mode=hub`);
  await A.waitForSelector('[data-testid="login-plate"]');
  check("[로그인] 차주 = 차량번호 + 휴대폰번호(이메일 · 비밀번호 칸 없음)", (await A.locator('[data-testid="login-email"]').count()) === 0 && (await A.locator('[data-testid="login-password"]').count()) === 0);
  check("[로그인] 휴대폰번호는 숫자 키패드(inputMode numeric)", (await A.getAttribute('[data-testid="login-phone"]', "inputmode")) === "numeric");
  check("[로그인] 로지스웹 버튼 안내 = \"로지스웹 가입자는 누르세요\"", (await A.textContent('[data-testid="go-logisweb-caption"]')) === "로지스웹 가입자는 누르세요");
  await A.click('[data-testid="driver-email-link"]');
  check("[로그인] [이메일로 가입했어요] → 이메일 로그인 칸", (await A.locator('[data-testid="login-email"]').count()) === 1 && (await A.locator('[data-testid="login-plate"]').count()) === 0);
  await A.click('[data-testid="role-shipper"]');
  check("[로그인] 화주는 이메일 · 비밀번호 그대로", (await A.locator('[data-testid="login-email"]').count()) === 1);

  // ───────── ② 가입(차량번호 + 휴대폰번호 → 문자 인증)
  await A.goto(`${HUB}/signup?role=driver`);
  await A.waitForSelector('[data-testid="su-plate"]');
  check("[가입] 차주 계정 단계에 이메일 · 비밀번호 칸 없음", (await A.locator('[data-testid="su-email"]').count()) === 0 && (await A.locator('[data-testid="su-pw"]').count()) === 0);
  await A.fill('[data-testid="su-plate"]', "12가34");
  await A.fill('[data-testid="su-phone"]', PHONE);
  await A.click('[data-testid="su-next"]');
  check("[가입] 차량번호 일부만 → 안내", ((await A.textContent('[data-testid="signup-error"]').catch(() => "")) || "").includes("차량번호를 전부"));
  await A.fill('[data-testid="su-plate"]', "경기 12가 3456");
  await A.fill('[data-testid="su-phone"]', "02-123-4567");
  await A.click('[data-testid="su-next"]');
  check("[가입] 휴대폰번호 형식 안내", ((await A.textContent('[data-testid="signup-error"]').catch(() => "")) || "").includes("휴대폰번호"));
  await A.fill('[data-testid="su-phone"]', PHONE);
  await shot(A, "m-01-signup-plate-phone");
  await A.click('[data-testid="su-next"]');
  await A.waitForSelector('[data-testid="signup-step-sms"]', { timeout: 20000 });
  const u1 = await until(() => auth.getUserByEmail(`${PLATE}@hubdriver.run25.kr`).catch(() => null));
  check("[가입] 계정 = 차량번호@hubdriver.run25.kr(띄어쓰기 없앰)", !!u1, "");
  await doSms(A, E164, "m-02-signup-sms-code");
  await A.waitForSelector('[data-testid="signup-step-info"]', { timeout: 20000 });
  const u1b = await auth.getUser(u1.uid);
  const dev1 = (await db.doc(`hubDevices/${u1.uid}`).get()).data();
  check("[가입] 문자 인증 → 계정에 휴대폰번호 연결 · 이 휴대폰 등록", u1b.phoneNumber === E164 && !!dev1?.id && /iPhone/.test(dev1.label || ""), J({ ph: u1b.phoneNumber, dev1 }));
  check("[가입] 정보 단계: 차량번호 · 휴대폰번호는 고정", (await A.inputValue('[data-testid="su-plate-locked"]')) === PLATE && (await A.inputValue('[data-testid="su-phone-locked"]')) === PHONE);
  await A.fill('[data-testid="su-bizno"]', "1018204964");
  await A.fill('[data-testid="su-name"]', "강차주");
  await A.selectOption('[data-testid="su-vtype"]', "카고");
  await A.selectOption('[data-testid="su-vton"]', "5톤");
  await A.fill('[data-testid="su-vlen"]', "6.2");
  await A.selectOption('[data-testid="su-home-sido"]', { index: 1 });
  await A.selectOption('[data-testid="su-bank"]', "국민");
  await A.fill('[data-testid="su-bank-no"]', "123456012345");
  await shot(A, "m-03-signup-info-locked");
  await A.click('[data-testid="su-next"]');
  await A.waitForSelector('[data-testid="signup-step-docs"]');
  for (const k of ["photo", "bizReg", "cargoLicense", "carReg", "driverLicense", "insurance", "bankbook"]) await A.setInputFiles(`[data-testid="doc-${k}"]`, { name: `${k}.png`, mimeType: "image/png", buffer: PNG });
  await A.click('[data-testid="su-next"]');
  for (const k of ["terms", "privacy", "docs"]) await A.check(`[data-testid="agree-${k}"]`);
  await A.click('[data-testid="su-submit"]');
  await inApp(A);
  const m1 = (await db.doc(`hubMembers/${u1.uid}`).get()).data();
  check("[가입] 신청서에 차량번호 · 휴대폰번호 저장(login plate)", m1?.vehicle?.plate === PLATE && m1.phone === PHONE && m1.login === "plate" && m1.status === "pending", J({ p: m1?.vehicle?.plate, ph: m1?.phone, l: m1?.login }));
  await db.doc(`hubMembers/${u1.uid}`).update({ status: "approved", docsVerified: true });
  await A.waitForSelector('[data-testid="tab-my"]', { timeout: 20000 });

  // 같은 차량번호 다시 가입 → 막힘
  const C = await ctx("m", "phoneC");
  await C.goto(`${HUB}/signup?role=driver`);
  await C.waitForSelector('[data-testid="su-plate"]');
  await C.fill('[data-testid="su-plate"]', "경기12가3456");
  await C.fill('[data-testid="su-phone"]', "010-9999-0000");
  await C.click('[data-testid="su-next"]');
  await C.waitForSelector('[data-testid="signup-error"]', { timeout: 15000 });
  check("[가입] 같은 차량번호 → \"이미 가입된 차량번호예요\"", (await C.textContent('[data-testid="signup-error"]')).includes("이미 가입된 차량번호예요"));

  // ───────── ③ 로그인 유지 · 로그아웃 → 차량번호 입력돼 있음 · 틀린 번호 · 같은 휴대폰 로그인(문자 없음)
  await A.reload();
  await A.waitForSelector('[data-testid="tab-my"]', { timeout: 25000 });
  check("[유지] 새로고침해도 로그인 유지", !A.url().includes("/login"));
  const c2 = A.context(); const A2 = await c2.newPage(); await A2.goto(HUB);
  await A2.waitForSelector('[data-testid="tab-my"]', { timeout: 25000 });
  check("[유지] 앱을 새로 열어도(새 탭) 로그인 유지", !A2.url().includes("/login")); await A2.close();
  await logoutM(A);
  await A.waitForSelector('[data-testid="login-plate"]');
  check("[로그아웃] 차량번호는 입력돼 있고 휴대폰번호는 비어 있음", (await A.inputValue('[data-testid="login-plate"]')) === PLATE && (await A.inputValue('[data-testid="login-phone"]')) === "");
  check("[로그아웃] 휴대폰번호는 저장하지 않음(localStorage)", !(await A.evaluate(() => JSON.stringify(localStorage))).includes("2345"));
  await shot(A, "m-04-login-driver-plate-prefilled");
  await A.fill('[data-testid="login-phone"]', "010-1111-2222");
  await A.click('[data-testid="login-submit"]');
  await A.waitForSelector('[data-testid="login-error"]', { timeout: 15000 });
  check("[로그인] 틀린 휴대폰번호 → \"차량번호나 휴대폰번호를 다시 확인해 주세요\"", (await A.textContent('[data-testid="login-error"]')).includes("차량번호나 휴대폰번호를 다시 확인해 주세요"));
  await shot(A, "m-05-login-wrong-phone");
  await A.fill('[data-testid="login-phone"]', PHONE);
  await A.click('[data-testid="login-submit"]');
  await A.waitForSelector('[data-testid="tab-my"]', { timeout: 25000 });
  check("[로그인] 같은 휴대폰 = 차량번호 + 휴대폰번호로 바로(문자 없음)", !A.url().includes("/login"));

  // ───────── ④ 다른 휴대폰 → 막힘 → 문자 인증으로 옮김 · 예전 휴대폰 로그아웃
  const B = await ctx("m", "phoneB");
  await loginPlate(B, PLATE, PHONE);
  await B.waitForSelector('[data-testid="device-other"]', { timeout: 20000 });
  check("[다른 휴대폰] 안내 \"등록된 휴대폰에서만 로그인할 수 있어요…\"", (await B.textContent('[data-testid="device-other"]')).includes("등록된 휴대폰에서만 로그인할 수 있어요. 이 휴대폰으로 바꾸려면 문자 인증을 해 주세요"));
  check("[다른 휴대폰] 버튼 [문자 인증하고 이 휴대폰으로 바꾸기]", (await B.textContent('[data-testid="sms-send"]')).includes("문자 인증하고 이 휴대폰으로 바꾸기"));
  await shot(B, "m-06-other-phone-blocked");
  await doSms(B, E164, "m-07-other-phone-sms");
  await B.waitForSelector('[data-testid="tab-my"]', { timeout: 30000 });
  const dev2 = (await db.doc(`hubDevices/${u1.uid}`).get()).data();
  check("[다른 휴대폰] 문자 인증 → 이 휴대폰으로 등록 옮김", dev2.id && dev2.id !== dev1.id && dev2.prevId === dev1.id, J(dev2));
  await A.waitForURL(/\/login/, { timeout: 20000 });
  check("[다른 휴대폰] 예전 휴대폰은 로그아웃", A.url().includes("/login"));
  await A.waitForSelector('[data-testid="login-plate"]');
  await shot(A, "m-08-old-phone-logged-out");
  await B.reload();
  await B.waitForSelector('[data-testid="tab-my"]', { timeout: 25000 });
  check("[다른 휴대폰] 옮긴 휴대폰은 새로고침해도 로그인 유지(다시 로그인된 토큰)", !B.url().includes("/login"));
  // 등록 기기 없이(복사한 세션 흉내) — 앱 시작 때 기기 번호가 다르면 로그아웃
  await B.evaluate(() => { localStorage.setItem("hubDeviceId", "copied-session-device-0000"); indexedDB.deleteDatabase("hubDevice"); });
  await B.reload();
  await B.waitForURL(/\/login/, { timeout: 20000 });
  check("[기기] 앱 시작 때 기기 번호가 다르면 로그아웃", B.url().includes("/login"));

  // 문자 인증으로 옮겼으니 B를 원래 기기 번호로 되돌릴 수 없다 — 다시 옮기기 확인(A → 같은 흐름)
  await loginPlate(A, null, PHONE);
  await A.waitForSelector('[data-testid="device-other"]', { timeout: 20000 });
  await doSms(A, E164);
  await A.waitForSelector('[data-testid="tab-my"]', { timeout: 30000 });
  check("[다른 휴대폰] 다시 원래 휴대폰으로 옮기기", !A.url().includes("/login"));

  // ───────── ⑤ PC · 예전 이메일 차주 · 관리자
  const PC = await ctx("pc", "pc");
  await PC.goto(`${HUB}/login?role=driver&mode=hub`);
  await PC.waitForSelector('[data-testid="driver-pc-block"]');
  check("[PC] 차주 로그인 화면 = \"차주 화면은 휴대폰에서만 쓸 수 있어요\" + QR", (await PC.textContent('[data-testid="driver-pc-block"]')).includes("차주 화면은 휴대폰에서만 쓸 수 있어요") && (await PC.locator('[data-testid="pc-qr"] svg').count()) === 1 && (await PC.locator('[data-testid="login-plate"]').count()) === 0);
  await shot(PC, "pc-01-driver-pc-block-qr");
  await PC.click('[data-testid="role-shipper"]');
  check("[PC] 화주 로그인은 PC에서도", !!(await PC.waitForSelector('[data-testid="login-email"]', { timeout: 8000 }).catch(() => null)));

  const OLD = await ctx("m", "oldDriver");
  await OLD.goto(`${HUB}/login?role=driver&mode=hub`);
  await OLD.click('[data-testid="driver-email-link"]');
  await OLD.fill('[data-testid="login-email"]', "olddrv@hub.test");
  await OLD.fill('[data-testid="login-password"]', "test12345");
  await OLD.click('[data-testid="login-submit"]');
  await OLD.waitForSelector('[data-testid="device-other"]', { timeout: 20000 });
  check("[이메일 차주] 이메일로 로그인해도 등록 휴대폰 확인", true);
  await doSms(OLD, "+821077778888");
  await OLD.waitForSelector('[data-testid="tab-my"]', { timeout: 30000 });
  check("[이메일 차주] 문자 인증 뒤 이 휴대폰으로 로그인", !OLD.url().includes("/login"));

  // 관리자(PC): 등록 휴대폰 보기 · 기기 초기화 · 휴대폰번호 바꾸기 = 로그인 번호
  const AD = PC;
  await AD.goto(`${HUB}/login?role=carrier&mode=logisweb`);
  await AD.fill('[data-testid="lw-company"]', "로지스웹"); await AD.fill('[data-testid="lw-code"]', "LW0001");
  await AD.fill('[data-testid="login-email"]', "admin@hub.test"); await AD.fill('[data-testid="login-password"]', "test1234");
  await AD.click('[data-testid="login-submit"]');
  await AD.waitForURL((u) => !String(u).includes("/login"), { timeout: 20000 });
  await AD.goto(`${HUB}/admin`);
  await AD.waitForSelector('[data-testid="admin-sec-members"]', { timeout: 20000 });
  await AD.click('[data-testid="admin-sec-members"]');
  await AD.locator("button", { has: AD.locator("div", { hasText: /^승인$/ }) }).first().click().catch(() => {});
  await AD.locator('[data-testid="admin-member-row"]', { hasText: "강차주" }).first().click();
  await AD.waitForSelector('[data-testid="admin-device"]');
  await AD.waitForSelector('[data-testid="admin-device-label"]', { timeout: 15000 });
  check("[관리자] 등록 휴대폰(기기 이름) 보임", /iPhone/.test(await AD.textContent('[data-testid="admin-device-label"]')));
  check("[관리자] 회원 정보에 로그인 = 차량번호 + 휴대폰번호", (await AD.textContent('[data-testid="member-review"]')).includes(`차량번호 ${PLATE} + 휴대폰번호`));
  await AD.locator('[data-testid="admin-device"]').scrollIntoViewIfNeeded();
  await shot(AD, "pc-02-admin-device");
  await AD.click('[data-testid="admin-device-reset"]');
  await AD.waitForSelector('[data-testid="admin-device-none"]', { timeout: 20000 });
  check("[관리자] 기기 초기화 → 등록 휴대폰 지움", !(await db.doc(`hubDevices/${u1.uid}`).get()).data().id);
  await shot(AD, "pc-03-admin-device-reset");
  await A.waitForURL(/\/login/, { timeout: 20000 });
  check("[관리자] 기기 초기화 → 그 휴대폰 로그아웃", A.url().includes("/login"));
  // 초기화 뒤에는 같은 휴대폰이라도 문자 인증
  await A.waitForSelector('[data-testid="login-plate"]');
  await A.fill('[data-testid="login-phone"]', PHONE); await A.click('[data-testid="login-submit"]');
  await A.waitForSelector('[data-testid="device-other"]', { timeout: 20000 });
  check("[관리자] 초기화 뒤 로그인 = 문자 인증 필요", (await A.getAttribute('[data-testid="device-gate"]', "data-reason")) === "reset");
  await doSms(A, E164);
  await A.waitForSelector('[data-testid="tab-my"]', { timeout: 30000 });
  check("[관리자] 초기화 뒤 문자 인증 → 다시 등록", !!(await db.doc(`hubDevices/${u1.uid}`).get()).data().id);
  // 관리자가 휴대폰번호를 바꾸면 로그인 번호도
  const NEWPH = "010-3456-7890";
  await AD.fill('[data-testid="am-phone"]', NEWPH);
  await AD.click('[data-testid="am-save"]');
  const u1c = await until(async () => { const u = await auth.getUser(u1.uid); return u.phoneNumber === "+821034567890" ? u : null; });
  check("[관리자] 휴대폰번호 변경 → 연결 번호 · 회원 정보 바뀜", !!u1c && (await until(async () => (await db.doc(`hubMembers/${u1.uid}`).get()).data().phone === NEWPH)), J(u1c?.phoneNumber));
  await A.waitForURL(/\/login/, { timeout: 70000 }).catch(() => {});
  await loginPlate(A, null, PHONE);
  await A.waitForSelector('[data-testid="login-error"]', { timeout: 15000 });
  check("[관리자] 예전 번호로는 로그인 안 됨", (await A.textContent('[data-testid="login-error"]')).includes("차량번호나 휴대폰번호를 다시 확인해 주세요"));
  await A.fill('[data-testid="login-phone"]', NEWPH); await A.click('[data-testid="login-submit"]');
  await A.waitForSelector('[data-testid="tab-my"]', { timeout: 25000 });
  check("[관리자] 새 번호로 로그인(같은 휴대폰이라 문자 없음)", !A.url().includes("/login"));

  console.log("\n" + log.join("\n"));
  console.log(`\n차주 로그인 E2E 확인 ${ok + bad}개 — 통과 ${ok} · 실패 ${bad}`);
  console.log(`화면 → ${OUT}`);
  console.log("콘솔 오류:", errs.length ? "\n" + [...new Set(errs)].slice(0, 30).join("\n") : "없음");
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(async (e) => { console.error("E2E 중단:", e);
  for (const p of PAGES) { try { console.log(`[${p.label}] ${p.url()} :: ${(await p.textContent("body")).slice(0, 300)}`); await p.screenshot({ path: `${OUT}/zz-fail-${p.label}.png` }); } catch { /* */ } } console.log(log.join("\n")); console.log("콘솔 오류:", [...new Set(errs)].slice(0, 30).join("\n")); try { await browser.close(); } catch { /* */ } process.exit(2); });
