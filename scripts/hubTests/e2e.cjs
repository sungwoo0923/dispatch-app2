// ⭐ 2026-11-06 로지스웹 허브 콜 테스트(에뮬레이터 전용 · 배포 안 함). 경로·포트는 테스트 환경에 맞게 바꿔 쓰세요.
// 로지스웹 허브 콜 — 전체 흐름 E2E(에뮬레이터 · Playwright) + 역할별 PC(1440) · 휴대폰(iPhone 13) 화면 저장
const { chromium, devices } = require("playwright");
const fs = require("fs");
const OUT = "/tmp/claude-0/-home-user-dispatch-app2/dff9cc41-f4fc-5104-a1e1-a526f03e5d42/scratchpad/hubm";
const HUB = "http://127.0.0.1:5341";
const MAIN = "http://127.0.0.1:5342";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
let ok = 0, bad = 0;
const check = (name, cond, extra = "") => { if (cond) { ok++; log.push(`PASS ${name}`); } else { bad++; log.push(`FAIL ${name} ${extra}`); } console.log(log[log.length - 1]); };
const errs = [];
let browser, docPage;

async function ctx(kind, label) {
  const c = await browser.newContext(kind === "pc" ? { viewport: { width: 1440, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul" } : { ...devices["iPhone 13"], locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await c.grantPermissions(["geolocation"]);
  await c.setGeolocation({ latitude: 35.2, longitude: 128.98 }); // 부산 강서 근처
  const p = await c.newPage();
  p.on("pageerror", (e) => errs.push(`[${label}] ${e}`));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|fonts\.g|net::ERR/.test(m.text())) errs.push(`[${label}] ${m.text().slice(0, 200)}`); });
  p.on("dialog", (d) => d.accept());
  p.label = label; p.kind = kind;
  return p;
}
const shot = async (p, name, full = false) => { await sleep(350); try { await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full, timeout: 45000 }); } catch (e) { console.log("screenshot retry", name); await sleep(1000); await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: false, timeout: 45000 }); } };
// 서류처럼 보이는 이미지 만들기
async function docImage(title, lines) {
  await docPage.setContent(`<div style="width:600px;height:400px;background:#fff;border:6px double #1B2B4B;font-family:'Noto Sans KR',sans-serif;padding:28px;box-sizing:border-box"><div style="font-size:34px;font-weight:800;color:#0F1A30;text-align:center;letter-spacing:6px">${title}</div><div style="margin-top:26px;font-size:20px;line-height:1.9;color:#1B2B4B">${lines.map((l) => `<div>${l}</div>`).join("")}</div><div style="position:absolute;right:60px;bottom:50px;width:90px;height:90px;border-radius:50%;border:4px solid #2D4C82;color:#2D4C82;font-weight:800;display:flex;align-items:center;justify-content:center">직인</div></div>`);
  return docPage.screenshot({ type: "png" });
}
async function hubLogin(p, role, mode, f) {
  await p.goto(`${HUB}/login?role=${role}&mode=${mode}`);
  await p.waitForSelector('[data-testid="login-submit"]');
  if (f.company) await p.fill('[data-testid="lw-company"]', f.company);
  if (f.code) await p.fill('[data-testid="lw-code"]', f.code);
  if (f.car) await p.fill('[data-testid="lw-car"]', f.car);
  if (f.name) await p.fill('[data-testid="lw-name"]', f.name);
  if (f.email) await p.fill('[data-testid="login-email"]', f.email);
  if (f.pw) await p.fill('[data-testid="login-password"]', f.pw);
  if (f.shotBefore) await shot(p, f.shotBefore);
  await p.click('[data-testid="login-submit"]');
}
async function signup(p, prefix, role, data) {
  await p.goto(`${HUB}/signup${data.withType ? "" : `?role=${role}`}`);
  if (data.withType) { await p.waitForSelector('[data-testid="signup-step-type"]'); await shot(p, `${prefix}-signup-0-type`); await p.click(`[data-testid="signup-role-${role}"]`); }
  await p.waitForSelector('[data-testid="signup-step-account"]');
  await p.fill('[data-testid="su-email"]', data.email);
  await p.fill('[data-testid="su-pw"]', "test12345");
  await p.fill('[data-testid="su-pw2"]', "test12345");
  await shot(p, `${prefix}-signup-1-account`);
  await p.click('[data-testid="su-next"]');
  await p.waitForSelector('[data-testid="signup-step-info"]');
  if (role !== "driver") await p.fill('[data-testid="su-company"]', data.company);
  await p.fill('[data-testid="su-bizno"]', data.bizNo);
  await p.fill('[data-testid="su-ceo"]', data.ceo);
  await p.fill('[data-testid="su-name"]', data.name);
  await p.fill('[data-testid="su-phone"]', data.phone);
  if (role === "carrier") await p.fill('[data-testid="su-permit"]', "경기-2024-0123");
  if (role === "driver") {
    await p.fill('[data-testid="su-company"]', data.company);
    await p.fill('[data-testid="su-plate"]', data.plate);
    await p.selectOption('[data-testid="su-vtype"]', data.vtype);
    await p.selectOption('[data-testid="su-vton"]', data.vton);
    await p.fill('[data-testid="su-vlen"]', data.vlen);
    await p.fill('[data-testid="su-vwid"]', data.vwid);
    await p.selectOption('[data-testid="su-home-sido"]', data.homeSido);
    await p.selectOption('[data-testid="su-home-sgg"]', data.homeSgg);
    for (const r of data.regions) await p.click(`[data-testid="signup-step-info"] button:has-text("${r}")`);
  }
  await shot(p, `${prefix}-signup-2-info`, p.kind === "m");
  await p.click('[data-testid="su-next"]');
  await p.waitForSelector('[data-testid="signup-step-docs"]');
  await shot(p, `${prefix}-signup-3-docs-empty`);
  const DOCS = { photo: ["프로필 사진", [data.name]], bizReg: ["사업자등록증", [`상호: ${data.company}`, `등록번호: ${data.bizNo}`, `대표자: ${data.ceo}`]], cargoLicense: ["화물운송종사자격증", [`성명: ${data.name}`, "자격번호: 11-2024-000123"]], carReg: ["자동차등록증", [`자동차등록번호: ${data.plate || ""}`, `차종: ${data.vton || ""} ${data.vtype || ""}`]], driverLicense: ["운전면허증", [`성명: ${data.name}`, "1종 대형"]], insurance: ["적재물배상보험 증권", ["보상한도: 5,000만원", "보험기간: 2026.01.01~2026.12.31"]], bankbook: ["통장사본", [`예금주: ${data.name}`, "계좌: 123-456-789012"]], transportPermit: ["화물운송사업 허가증", [`상호: ${data.company}`, "허가번호: 경기-2024-0123"]], employment: ["재직증명서", [`성명: ${data.name}`, `회사: ${data.company}`]] };
  for (const k of data.docs) {
    const [t, lines] = DOCS[k];
    if (k === "photo") {
      await docPage.setContent(`<div style="width:300px;height:300px;background:linear-gradient(135deg,#1B2B4B,#2D4C82);display:flex;align-items:center;justify-content:center;color:#8FB0F0;font:800 120px 'Noto Sans KR'">${data.name[0]}</div>`);
      const buf = await docPage.screenshot({ type: "png", clip: { x: 0, y: 0, width: 300, height: 300 } });
      await p.setInputFiles('[data-testid="doc-photo"]', { name: "profile.png", mimeType: "image/png", buffer: buf });
    } else {
      await p.setInputFiles(`[data-testid="doc-${k}"]`, { name: `${t}.png`, mimeType: "image/png", buffer: await docImage(t, lines) });
    }
  }
  await shot(p, `${prefix}-signup-3-docs-filled`, p.kind === "m");
  await p.click('[data-testid="su-next"]');
  await p.waitForSelector('[data-testid="signup-step-review"]');
  for (const a of ["terms", "privacy", "docs"]) await p.check(`[data-testid="agree-${a}"]`);
  await shot(p, `${prefix}-signup-4-review`, p.kind === "m");
  await p.click('[data-testid="su-submit"]');
  await p.waitForSelector('[data-testid="gate-pending"]', { timeout: 30000 });
  await shot(p, `${prefix}-gate-pending`);
}
async function openCardWith(p, text) {
  const card = p.locator('[data-testid="order-card"]', { hasText: text }).first();
  await card.waitFor({ timeout: 20000 });
  await card.click();
  await p.waitForSelector('[data-testid="order-detail"]');
  await sleep(600);
}
const closeDetail = async (p) => { await p.locator('[data-testid="order-detail"] button[aria-label="닫기"]').click(); await sleep(400); };
async function postOrder(p, prefix, o) {
  if (p.kind === "pc") await p.click('[data-testid="btn-post"]'); else await p.click('[data-testid="fab-post"]');
  await p.waitForSelector('[data-testid="post-form"]');
  await shot(p, `${prefix}-post-0-empty`);
  await p.selectOption('[data-testid="pf-상차-sido"]', o.a1); await p.selectOption('[data-testid="pf-상차-sgg"]', o.a2);
  await p.fill('[data-testid="pf-상차-addr"]', o.addrA);
  await p.selectOption('[data-testid="pf-하차-sido"]', o.b1); await p.selectOption('[data-testid="pf-하차-sgg"]', o.b2);
  await p.fill('[data-testid="pf-하차-addr"]', o.addrB);
  await p.fill('[data-testid="pf-cargo"]', o.cargo);
  await p.fill('[data-testid="pf-pallet"]', String(o.pallet));
  await p.selectOption('[data-testid="pf-vtype"]', o.vtype); await p.selectOption('[data-testid="pf-vton"]', o.vton);
  await p.fill('[data-testid="pf-fare"]', String(o.fare));
  if (o.urgent) await p.check('[data-testid="pf-urgent"]');
  await shot(p, `${prefix}-post-1-filled`);
  await p.locator('[data-testid="post-form"] .overflow-y-auto').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await shot(p, `${prefix}-post-2-fare`);
  await p.click('[data-testid="pf-submit"]');
  await p.waitForSelector('[data-testid="post-form"]', { state: "detached", timeout: 15000 });
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch();
  docPage = await (await browser.newContext({ viewport: { width: 600, height: 400 } })).newPage();

  // ───────── A. 가입 신청 3건(차주 휴대폰 · 화주 PC · 운송사 휴대폰)
  const loginPc = await ctx("pc", "login-pc");
  await loginPc.goto(`${HUB}/login`); await sleep(800); await shot(loginPc, "pc-00-login-driver");
  await loginPc.click('[data-testid="role-shipper"]'); await shot(loginPc, "pc-00-login-shipper");
  await loginPc.click('[data-testid="mode-logisweb"]'); await shot(loginPc, "pc-00-login-logisweb-shipper");
  await loginPc.click('[data-testid="role-carrier"]'); await shot(loginPc, "pc-00-login-logisweb-carrier");
  await loginPc.click('[data-testid="role-driver"]'); await shot(loginPc, "pc-00-login-logisweb-driver");
  await loginPc.context().close();

  const D = await ctx("m", "driver-new");
  await D.goto(`${HUB}/login`); await sleep(700); await shot(D, "m-00-login");
  await signup(D, "m-driver", "driver", { email: "kim@driver.test", company: "김차주운송", bizNo: "1208147521", ceo: "김차주", name: "김차주", phone: "01012345678", plate: "경남80바1234", vtype: "윙바디", vton: "11톤", vlen: "9.6", vwid: "2.35", homeSido: "경남", homeSgg: "김해시", regions: ["경남", "부산", "경기"], docs: ["photo", "bizReg", "cargoLicense", "carReg", "driverLicense", "insurance", "bankbook"] });
  check("차주 가입 신청 → 승인 대기 화면", await D.isVisible('[data-testid="gate-pending"]'));

  const S = await ctx("pc", "shipper-new");
  await signup(S, "pc-shipper", "shipper", { withType: true, email: "dawn@shipper.test", company: "새벽유통", bizNo: "2148812345", ceo: "한새벽", name: "한담당", phone: "01022223333", docs: ["bizReg", "employment"] }).catch(async (e) => {
    // 사업자번호 검증식 확인(오류 문구가 떠야 정상) → 올바른 번호로 다시
    throw e;
  });
  check("화주 가입 신청 → 승인 대기 화면", await S.isVisible('[data-testid="gate-pending"]'));

  const C = await ctx("m", "carrier-new");
  await signup(C, "m-carrier", "carrier", { email: "bareun@carrier.test", company: "바른운송", bizNo: "1018204964", ceo: "최바른", name: "최실장", phone: "01033334444", docs: ["bizReg", "transportPermit"] });
  check("운송사 가입 신청 → 승인 대기 화면", await C.isVisible('[data-testid="gate-pending"]'));

  // ───────── B. 관리센터(본체)에서 승인 · 거절
  const A = await ctx("pc", "admin-main");
  await A.goto(`${MAIN}/transport-login`);
  await A.waitForSelector('input[placeholder="승인 후 발급된 코드"]', { timeout: 60000 });
  await A.fill('input[placeholder="승인 후 발급된 코드"]', "LW0001");
  await A.fill('input[placeholder="가입한 회사명"]', "로지스웹");
  await A.fill('input[placeholder="name@company.com"]', "admin@hub.test");
  await A.fill('input[placeholder="비밀번호"]', "test1234");
  await A.click('button:has-text("로그인")');
  await A.waitForURL(/\/(app|choose|platform)/, { timeout: 60000 }).catch(() => {});
  await sleep(2500);
  await A.evaluate(() => { localStorage.setItem("pcTab", "hubMembers"); sessionStorage.setItem("kpEntry", "platform"); });
  await A.goto(`${MAIN}/platform`);
  await A.waitForSelector('[data-testid="pc-hub-members"]', { timeout: 60000 });
  await A.waitForSelector('[data-testid="pc-hub-row"]', { timeout: 20000 });
  await sleep(800);
  await shot(A, "pc-admin-01-hub-queue");
  check("관리센터 허브 회원 승인 탭에 신청 3건", (await A.locator('[data-testid="pc-hub-row"]').count()) === 3);
  // 차주 승인
  await A.locator('[data-testid="pc-hub-row"]', { hasText: "김차주" }).click();
  await A.waitForSelector('[data-testid="pc-hub-review"]');
  await sleep(1500);
  await shot(A, "pc-admin-02-review-driver-docs");
  for (const cb of await A.locator('[data-testid="pc-hub-review"] input[type="checkbox"]').all()) await cb.check();
  await A.selectOption('[data-testid="pc-hub-review"] select', "계속사업자");
  await shot(A, "pc-admin-03-review-driver-checked");
  await A.click('[data-testid="pc-hub-approve"]');
  await A.waitForSelector('[data-testid="pc-hub-review"]', { state: "detached" });
  // 화주 승인
  await A.locator('[data-testid="pc-hub-row"]', { hasText: "한담당" }).click();
  await A.waitForSelector('[data-testid="pc-hub-review"]'); await sleep(1000);
  for (const cb of await A.locator('[data-testid="pc-hub-review"] input[type="checkbox"]').all()) await cb.check();
  await A.selectOption('[data-testid="pc-hub-review"] select', "계속사업자");
  await A.click('[data-testid="pc-hub-approve"]');
  await A.waitForSelector('[data-testid="pc-hub-review"]', { state: "detached" });
  // 운송사 거절(사유)
  await A.locator('[data-testid="pc-hub-row"]', { hasText: "최실장" }).click();
  await A.waitForSelector('[data-testid="pc-hub-review"]'); await sleep(800);
  await A.click('[data-testid="pc-hub-reject"]');
  await sleep(300);
  await shot(A, "pc-admin-04-reject-needs-reason");
  await A.fill('[data-testid="pc-hub-reason"]', "화물운송사업 허가증 사진이 흐립니다. 다시 찍어 올려 주세요.");
  await A.click('[data-testid="pc-hub-reject"]');
  await A.waitForSelector('[data-testid="pc-hub-review"]', { state: "detached" });
  await A.click('button:has-text("승인")'); await sleep(700);
  await shot(A, "pc-admin-05-approved-list");

  // 승인 결과가 실시간으로 각 화면에 반영
  await D.waitForSelector('[data-testid="board-list"]', { timeout: 20000 });
  check("차주 화면이 승인 즉시 오더 보드로 바뀜(새로고침 없이)", true);
  await shot(D, "m-driver-01-board-approved");
  await S.waitForSelector('[data-testid="board-list"]', { timeout: 20000 });
  await shot(S, "pc-shipper-01-board-approved");
  await C.waitForSelector('[data-testid="gate-rejected"]', { timeout: 20000 });
  check("운송사 화면에 거절 사유 표시", (await C.textContent("body")).includes("허가증 사진이 흐립니다"));
  await shot(C, "m-carrier-01-rejected");
  // 다시 제출
  await C.click('[data-testid="gate-edit"]');
  await C.waitForSelector('[data-testid="signup-step-info"]');
  await shot(C, "m-carrier-02-edit");
  await C.click('[data-testid="su-next"]');
  await C.waitForSelector('[data-testid="signup-step-docs"]');
  await C.setInputFiles('[data-testid="doc-transportPermit"]', { name: "허가증.png", mimeType: "image/png", buffer: await docImage("화물운송사업 허가증", ["상호: 바른운송", "허가번호: 경기-2024-0123", "(선명하게 다시 찍음)"]) });
  await C.click('[data-testid="su-next"]');
  for (const a of ["terms", "privacy", "docs"]) await C.check(`[data-testid="agree-${a}"]`);
  await C.click('[data-testid="su-submit"]');
  await C.waitForSelector('[data-testid="gate-pending"]', { timeout: 30000 });
  check("거절 후 고쳐서 다시 제출 → 승인 대기", true);

  // 허브 사이트의 관리자 화면에서 운송사 승인
  const H = await ctx("pc", "admin-hub");
  await hubLogin(H, "carrier", "logisweb", { company: "로지스웹", code: "LW0001", email: "admin@hub.test", pw: "test1234" });
  await H.waitForSelector('[data-testid="nav-admin"]', { timeout: 20000 });
  await H.click('[data-testid="nav-admin"]');
  await H.waitForSelector('[data-testid="admin-member-row"]', { timeout: 15000 });
  await shot(H, "pc-hubadmin-01-queue");
  await H.locator('[data-testid="admin-member-row"]', { hasText: "최실장" }).click();
  await H.waitForSelector('[data-testid="member-review"]'); await sleep(1500);
  await shot(H, "pc-hubadmin-02-review");
  for (const cb of await H.locator('[data-testid="member-review"] input[type="checkbox"]').all()) await cb.check();
  await H.selectOption('[data-testid="admin-biz"]', "계속사업자");
  await H.click('[data-testid="admin-approve"]');
  await H.waitForSelector('[data-testid="member-review"]', { state: "detached" });
  await C.waitForSelector('[data-testid="board-list"]', { timeout: 20000 });
  check("허브 관리자 승인 → 운송사 보드 열림", true);
  await shot(C, "m-carrier-03-board-approved");

  // ───────── C. 오더 등록 + 실시간 반영 + 콜 알림
  await D.click('[data-testid="btn-alert-m"]');
  await D.waitForSelector('[data-testid="alert-settings"]');
  await D.check('[data-testid="alert-on"]');
  await shot(D, "m-driver-02-alert-settings");
  await D.click('[data-testid="alert-save"]');
  await sleep(800);
  const before = await D.locator('[data-testid="order-card"]').count();
  await postOrder(S, "pc-shipper", { a1: "경기", a2: "화성시", addrA: "경기 화성시 향남읍 제약공단1길 7 새벽유통 2창고", b1: "부산", b2: "강서구", addrB: "부산 강서구 녹산산단321로 24", cargo: "생활용품 박스", pallet: 14, vtype: "윙바디", vton: "11톤", fare: 690000, urgent: true });
  await S.waitForSelector('[data-testid="order-card"]:has-text("새벽유통")', { timeout: 15000 });
  await shot(S, "pc-shipper-02-board-after-post");
  // 차주 휴대폰 — 새로고침 없이 새 카드 + 알림
  await D.waitForSelector('[data-testid="order-card"]:has-text("새벽유통")', { timeout: 15000 });
  const toastSeen = await D.waitForSelector('text=새 콜', { timeout: 5000 }).then(() => true).catch(() => false);
  await shot(D, "m-driver-03-realtime-new-call");
  check("차주 화면에 새 오더가 실시간으로 나타남", (await D.locator('[data-testid="order-card"]').count()) === before + 1);
  check("조건에 맞는 새 콜 알림(소리·진동·토스트)", toastSeen);
  // 로지스웹 운송사 직원(휴대폰)도 오더 등록
  const K = await ctx("m", "staff-carrier");
  await hubLogin(K, "carrier", "logisweb", { company: "한빛로지스", code: "HB1234", email: "staff@hanbit.test", pw: "test1234", shotBefore: "m-staff-00-login-logisweb" });
  await K.waitForSelector('[data-testid="board-list"]', { timeout: 20000 });
  await shot(K, "m-staff-01-board");
  await postOrder(K, "m-staff", { a1: "인천", a2: "중구", addrA: "인천 중구 공항동로 296 화물터미널 B동", b1: "충북", b2: "청주시", addrB: "충북 청주시 흥덕구 오송생명1로 194", cargo: "의약품(냉장)", pallet: 6, vtype: "냉장탑", vton: "5톤", fare: 380000, urgent: false });
  await D.waitForSelector('[data-testid="order-card"]:has-text("한빛로지스")', { timeout: 15000 });
  check("운송사가 올린 오더도 차주에게 실시간 반영", true);
  await shot(K, "m-staff-02-board-after-post");

  // ───────── D. 배차신청 · 10초 취소 · 재신청 · 확정 · 진행 · 평가
  await openCardWith(D, "새벽유통");
  await shot(D, "m-driver-04-detail-before");
  check("배차 전 상세주소 숨김", !(await D.textContent("body")).includes("제약공단1길"));
  await D.click('[data-testid="btn-request"]');
  await D.waitForSelector('[data-testid="cancel-window"]', { timeout: 10000 });
  await sleep(1200);
  await shot(D, "m-driver-05-countdown");
  const cd1 = Number(await D.textContent('[data-testid="countdown"]'));
  check("10초 카운트다운 표시", cd1 >= 1 && cd1 <= 10, `값 ${cd1}`);
  await D.click('[data-testid="btn-cancel-quick"]');
  await D.waitForSelector('[data-testid="btn-request"]', { timeout: 10000 });
  check("10초 안 취소 성공 → 다시 모집중", (await D.textContent('[data-testid="detail-status"]')) === "모집중");
  await shot(D, "m-driver-06-cancelled-in-window");
  // 등록자 화면도 모집중
  await S.click('[data-testid="nav-posts"]');
  await S.waitForSelector('[data-testid="list-posts"]');
  await sleep(600);
  check("등록자 목록에서도 모집중으로 돌아옴", (await S.locator('[data-testid="list-posts"]').textContent()).includes("배차 대기"));
  // 다시 신청 → 10초 경과
  await D.click('[data-testid="btn-request"]');
  await D.waitForSelector('[data-testid="cancel-window"]', { timeout: 10000 });
  await sleep(2000);
  // 등록자 PC — 10초 안에도 차주 카드가 뜬다
  await S.locator('[data-testid="order-card"]', { hasText: "새벽유통" }).first().click();
  await S.waitForSelector('[data-testid="taker-card"]', { timeout: 15000 });
  await sleep(1200);
  await shot(S, "pc-shipper-03-taker-card-in-window");
  await sleep(9000);
  await D.waitForSelector('[data-testid="btn-call-cancel"]', { timeout: 10000 });
  check("10초 뒤 취소 버튼 사라짐", !(await D.isVisible('[data-testid="btn-cancel-quick"]')));
  await D.waitForSelector('[data-testid="detail-private"]', { timeout: 15000 });
  const dtext = await D.textContent('[data-testid="order-detail"]');
  check("10초 뒤 [전화로 취소 요청] + 등록자 번호", (await D.textContent('[data-testid="btn-call-cancel"]')).includes("010-2222-3333"));
  check("확정 뒤 상세주소 공개", dtext.includes("제약공단1길"));
  await shot(D, "m-driver-07-confirmed-phone-cancel");
  await D.locator('[data-testid="order-detail"] .overflow-y-auto').first().evaluate((el) => el.scrollTo(0, 500));
  await shot(D, "m-driver-08-confirmed-address");
  const tc = await S.textContent('[data-testid="taker-card"]');
  check("등록자가 차주 정보 확인(이름·연락처·차량번호·차종·톤수·적재함·인증)", ["김차주", "010-1234-5678", "경남80바1234", "11톤 윙바디", "9.6m", "서류 인증"].every((x) => tc.includes(x)), tc.slice(0, 200));
  await shot(S, "pc-shipper-04-taker-card-confirmed");
  // 진행: 상차완료 → 운송완료(인수증)
  await D.click('[data-testid="btn-loaded"]');
  await D.waitForSelector('[data-testid="btn-delivered"]', { timeout: 10000 });
  await D.setInputFiles('[data-testid="pod-input"]', { name: "인수증.png", mimeType: "image/png", buffer: await docImage("인 수 증", ["품목: 생활용품 박스 14파레트", "인수자: 이하차 (서명)", "2026.11.07"]) });
  await shot(D, "m-driver-09-loaded-pod");
  await D.click('[data-testid="btn-delivered"]');
  await D.waitForSelector('[data-testid="rate-card"]', { timeout: 15000 });
  check("운송완료 + 인수증 업로드", (await D.textContent('[data-testid="detail-status"]')) === "운송완료");
  await shot(D, "m-driver-10-delivered");
  await S.waitForSelector('[data-testid="pod-img"]', { timeout: 15000 });
  await S.locator('[data-testid="order-detail"] .overflow-y-auto').first().evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await shot(S, "pc-shipper-05-delivered-pod");
  await S.click('[data-testid="btn-rate"]');
  await S.waitForSelector('[data-testid="rate-card"] >> text=평가 완료', { timeout: 10000 }).catch(() => {});
  await sleep(800);
  await shot(S, "pc-shipper-06-rated");
  await D.click('[data-testid="btn-rate"]');
  await sleep(1200);
  check("양쪽 평가 저장", (await D.textContent('[data-testid="rate-card"]')).includes("등록자가 남긴 평가"));
  await shot(D, "m-driver-11-rated");
  await closeDetail(S);
  await closeDetail(D);

  // ───────── E. 기존 로지스웹 계정(소속 기사 · 화주사)
  const F = await ctx("pc", "fleet-driver");
  await hubLogin(F, "driver", "logisweb", { company: "한빛로지스", car: "경기12가3456", name: "박기사", shotBefore: "pc-fleet-00-login" });
  await F.waitForSelector('[data-testid="board-list"]', { timeout: 20000 });
  await shot(F, "pc-fleet-01-board");
  check("로지스웹 소속 기사가 가입 없이 차주로 로그인", true);
  await openCardWith(F, "한빛로지스");
  await F.click('[data-testid="btn-request"]');
  await F.waitForSelector('[data-testid="cancel-window"]');
  await shot(F, "pc-fleet-02-countdown");
  await K.click('[data-testid="tab-posts"]');
  await K.waitForSelector('[data-testid="list-posts"]');
  await K.locator('[data-testid="order-card"]', { hasText: "한빛로지스" }).first().click();
  await K.waitForSelector('[data-testid="taker-card"]', { timeout: 15000 });
  await sleep(1000);
  const ktc = await K.textContent('[data-testid="taker-card"]');
  check("운송사가 소속 기사(차주) 정보 확인", ktc.includes("박기사") && ktc.includes("경기12가3456") && ktc.includes("로지스웹 소속 기사"), ktc.slice(0, 160));
  await shot(K, "m-staff-03-taker-card");
  await K.locator('[data-testid="taker-card"]').scrollIntoViewIfNeeded();
  await shot(K, "m-staff-04-taker-card-scrolled");
  await sleep(9000);
  await shot(F, "pc-fleet-03-confirmed"); await closeDetail(F);

  const Y = await ctx("m", "lw-shipper");
  await hubLogin(Y, "shipper", "logisweb", { company: "대한식품", code: "DH777", email: "ship@daehan.test", pw: "test1234", shotBefore: "m-lwshipper-00-login" });
  await Y.waitForSelector('[data-testid="board-list"]', { timeout: 20000 });
  await shot(Y, "m-lwshipper-01-board");
  check("로지스웹 화주사가 가입 없이 화주로 로그인", true);
  await openCardWith(Y, "서해유통");
  check("화주는 배차신청 버튼 없음", !(await Y.isVisible('[data-testid="btn-request"]')));
  await shot(Y, "m-lwshipper-02-detail-no-request");
  await closeDetail(Y);

  // 잘못된 로지스웹 로그인 안내
  const X = await ctx("m", "wrong");
  await hubLogin(X, "driver", "logisweb", { company: "다른운송", car: "경기12가3456", name: "박기사" });
  await X.waitForSelector('[data-testid="login-error"]', { timeout: 15000 });
  check("다른 운송사 이름으로 기사 로그인 거절", (await X.textContent('[data-testid="login-error"]')).length > 0);
  await shot(X, "m-wrong-01-logisweb-mismatch");
  await X.context().close();

  // ───────── F. 화면 모음(역할별 탭 · 필터 · 내 주변 · 내 정보)
  // 차주(휴대폰)
  await D.click('[data-testid="tab-jobs"]'); await D.waitForSelector('[data-testid="list-jobs"]'); await shot(D, "m-driver-12-my-jobs");
  await D.click('[data-testid="tab-notices"]'); await D.waitForSelector('[data-testid="notices"]'); await shot(D, "m-driver-13-notices");
  await D.click('[data-testid="tab-me"]'); await D.waitForSelector('[data-testid="me-view"]'); await sleep(800); await shot(D, "m-driver-14-me", true);
  await D.click('[data-testid="tab-board"]'); await D.click('[data-testid="btn-filter"]'); await sleep(500); await shot(D, "m-driver-15-filter-sheet");
  await D.locator('[data-testid="f-from-경기"] >> visible=true').click(); await D.locator('button:has-text("건 보기")').click(); await sleep(500); await shot(D, "m-driver-16-filtered-gyeonggi");
  await D.click('[data-testid="btn-filter"]'); await D.locator('button:has-text("초기화") >> visible=true').click(); await D.locator('button:has-text("건 보기")').click();
  await D.click('[data-testid="btn-near"]'); await sleep(1200); await shot(D, "m-driver-17-near-me");
  // 화주(PC)
  await S.click('[data-testid="nav-posts"]'); await sleep(600); await shot(S, "pc-shipper-07-my-posts");
  await S.click('[data-testid="nav-notices"]'); await sleep(600); await shot(S, "pc-shipper-08-notices");
  await S.click('[data-testid="nav-me"]'); await sleep(800); await shot(S, "pc-shipper-09-me");
  // 운송사(휴대폰 · 새 가입)
  await C.click('[data-testid="tab-me"]'); await sleep(800); await shot(C, "m-carrier-04-me");
  // 소속 기사(PC)
  await F.click('[data-testid="nav-jobs"]'); await sleep(600); await shot(F, "pc-fleet-04-my-jobs");
  await F.click('[data-testid="btn-alert"]'); await F.waitForSelector('[data-testid="alert-settings"]'); await shot(F, "pc-fleet-05-alert-settings"); await F.keyboard.press("Escape");
  await F.click('[data-testid="nav-me"]'); await sleep(800); await shot(F, "pc-fleet-06-me");
  // 관리자(허브) 승인 목록
  await H.click('button:has-text("승인")'); await sleep(600); await shot(H, "pc-hubadmin-03-approved");

  // 반대 화면 크기(같은 계정 다른 기기 → 먼저 쓰던 기기는 로그아웃)
  const D2 = await ctx("pc", "driver-pc");
  await hubLogin(D2, "driver", "hub", { email: "kim@driver.test", pw: "test12345" });
  await D2.waitForSelector('[data-testid="board-list"]', { timeout: 20000 });
  await shot(D2, "pc-driver-01-board");
  await D2.click('[data-testid="nav-jobs"]'); await sleep(700); await shot(D2, "pc-driver-02-my-jobs");
  await D2.locator('[data-testid="order-card"]').first().click(); await D2.waitForSelector('[data-testid="order-detail"]'); await sleep(1200); await shot(D2, "pc-driver-03-detail-delivered");
  await D.waitForURL(/\/login/, { timeout: 15000 }).then(() => check("같은 계정 다른 기기 로그인 → 먼저 쓰던 휴대폰 로그아웃(계정 공유 방지)", true)).catch(() => check("같은 계정 다른 기기 로그인 → 먼저 쓰던 휴대폰 로그아웃(계정 공유 방지)", false));
  const S2 = await ctx("m", "shipper-m");
  await hubLogin(S2, "shipper", "hub", { email: "dawn@shipper.test", pw: "test12345" });
  await S2.waitForSelector('[data-testid="board-list"]', { timeout: 20000 });
  await shot(S2, "m-shipper-01-board");
  await S2.click('[data-testid="tab-posts"]'); await sleep(700); await shot(S2, "m-shipper-02-my-posts");
  await S2.locator('[data-testid="order-card"]').first().click(); await S2.waitForSelector('[data-testid="order-detail"]'); await sleep(1500); await shot(S2, "m-shipper-03-detail-taker");
  await S2.locator('[data-testid="order-detail"] .overflow-y-auto').first().evaluate((el) => el.scrollTo(0, 700)); await shot(S2, "m-shipper-04-detail-rated");
  const C2 = await ctx("pc", "carrier-pc");
  await hubLogin(C2, "carrier", "hub", { email: "bareun@carrier.test", pw: "test12345" });
  await C2.waitForSelector('[data-testid="board-list"]', { timeout: 20000 });
  await shot(C2, "pc-carrier-01-board");
  await C2.locator('[data-testid="order-card"]', { hasText: "동해운수" }).first().click(); await C2.waitForSelector('[data-testid="order-detail"]'); await sleep(900); await shot(C2, "pc-carrier-02-detail-can-request");
  await closeDetail(C2);
  await C2.click('[data-testid="btn-post"]'); await C2.waitForSelector('[data-testid="post-form"]'); await shot(C2, "pc-carrier-03-post-form");
  const K2 = await ctx("pc", "staff-pc");
  await hubLogin(K2, "carrier", "logisweb", { company: "한빛로지스", code: "HB1234", email: "staff@hanbit.test", pw: "test1234" });
  await K2.waitForSelector('[data-testid="board-list"]', { timeout: 20000 });
  await K2.click('[data-testid="nav-posts"]'); await sleep(700); await shot(K2, "pc-staff-01-my-posts");
  await K2.locator('[data-testid="order-card"]').first().click(); await K2.waitForSelector('[data-testid="taker-card"]', { timeout: 15000 }); await sleep(1200); await shot(K2, "pc-staff-02-taker-card");
  const F2 = await ctx("m", "fleet-m");
  await hubLogin(F2, "driver", "logisweb", { company: "한빛로지스", car: "경기12가3456", name: "박기사" });
  await F2.waitForSelector('[data-testid="board-list"]', { timeout: 20000 });
  await shot(F2, "m-fleet-01-board");
  await F2.click('[data-testid="tab-jobs"]'); await sleep(600); await shot(F2, "m-fleet-02-my-jobs");
  await F2.locator('[data-testid="order-card"]').first().click(); await F2.waitForSelector('[data-testid="order-detail"]'); await sleep(1800); await shot(F2, "m-fleet-03-detail-confirmed");
  const Y2 = await ctx("pc", "lw-shipper-pc");
  await hubLogin(Y2, "shipper", "logisweb", { company: "대한식품", code: "DH777", email: "ship@daehan.test", pw: "test1234" });
  await Y2.waitForSelector('[data-testid="board-list"]', { timeout: 20000 });
  await shot(Y2, "pc-lwshipper-01-board");
  await Y2.click('[data-testid="btn-post"]'); await Y2.waitForSelector('[data-testid="post-form"]'); await shot(Y2, "pc-lwshipper-02-post-form");
  // 관리센터 휴대폰
  const AM = await ctx("m", "hubadmin-m");
  await hubLogin(AM, "carrier", "logisweb", { company: "로지스웹", code: "LW0001", email: "admin@hub.test", pw: "test1234" });
  await AM.waitForSelector('[data-testid="board-list"]', { timeout: 20000 });
  await AM.goto(`${HUB}/admin`); await AM.waitForSelector('[data-testid="hub-admin"]', { timeout: 15000 }); await sleep(800); await shot(AM, "m-hubadmin-01-queue");

  console.log("\n" + log.join("\n"));
  console.log(`\nE2E 확인 ${ok + bad}개 — 통과 ${ok} · 실패 ${bad}`);
  console.log(`화면 ${fs.readdirSync(OUT).length}장 → ${OUT}`);
  console.log("콘솔 오류:", errs.length ? "\n" + [...new Set(errs)].slice(0, 30).join("\n") : "없음");
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(async (e) => { console.error("E2E 중단:", e); console.log(log.join("\n")); console.log("콘솔 오류:", [...new Set(errs)].slice(0, 30).join("\n")); try { await browser.close(); } catch { /* */ } process.exit(2); });
