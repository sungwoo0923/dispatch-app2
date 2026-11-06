// ⭐ 2026-11-06 로지스웹 허브 콜 테스트(에뮬레이터 전용 · 배포 안 함). 경로·포트는 테스트 환경에 맞게 바꿔 쓰세요.
// 로지스웹 허브 콜 — 보안 규칙 테스트(Firestore + Storage 에뮬레이터)
const fs = require("fs");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, writeBatch, serverTimestamp, increment, Timestamp } = require("firebase/firestore");
const { ref, uploadBytes, getBytes } = require("firebase/storage");
const W = process.env.HUB_REPO || require("path").resolve(__dirname, "../.."); // 저장소 루트(규칙 파일 위치)
const FS_PORT = Number(process.env.EMU_FS_PORT || 8080), ST_PORT = Number(process.env.EMU_ST_PORT || 9199);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const results = [];
async function t(name, fn) {
  try { await fn(); pass++; results.push(`PASS ${name}`); }
  catch (e) { fail++; results.push(`FAIL ${name} :: ${String(e?.message || e).slice(0, 200)}`); }
}
const today = () => { const d = new Date(); return Timestamp.fromMillis(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };
const pub = (over = {}) => ({
  상차시도: "경기", 상차시군구: "화성시", 하차시도: "부산", 하차시군구: "강서구", 상차일: "2026-11-07", 상차시간: "09:00", 하차일: "2026-11-07", 하차시간: "",
  화물내용: "박스", 중량: "", 파레트: 10, 차량종류: "윙바디", 차량톤수: "11톤", 톤수값: 11, 상차방법: "지게차", 하차방법: "지게차",
  운임: 680000, 수수료: 0, 지급방식: "인수증", 긴급: false, 운행유형: "편도", 적재: "독차", 공개메모: "", 거리km: 380, ...over,
});
const member = (uid, role, over = {}) => ({ uid, role, source: "signup", status: "approved", name: `${uid}이름`, phone: "010-1111-2222", companyName: `${uid}상사`, docsVerified: false, prefs: {}, ...over });
const matchOf = (m) => ({ takerUid: m.uid, role: m.role, source: m.source, name: m.name, phone: m.phone, companyName: m.companyName, vehicle: m.vehicle || null, docsVerified: m.docsVerified === true, bizStatus: m.bizStatus || "", photoPath: m.photoPath || "", at: serverTimestamp() });

(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-kpflow",
    firestore: { rules: fs.readFileSync(`${W}/firestore.rules`, "utf8"), host: "127.0.0.1", port: FS_PORT },
    storage: { rules: fs.readFileSync(`${W}/storage.rules`, "utf8"), host: "127.0.0.1", port: ST_PORT },
  });
  await env.clearFirestore();
  const M = {
    shipS: member("shipS", "shipper", { docsVerified: true }),
    drvD: member("drvD", "driver", { vehicle: { plate: "경기12가1111", type: "윙바디", ton: "11톤", length: "9.6", width: "2.35" } }),
    drvE: member("drvE", "driver", { vehicle: { plate: "경기12가2222", type: "카고", ton: "5톤", length: "6.2", width: "" } }),
    drvBlocked: member("drvBlocked", "driver", { penalty: { blocked: true } }),
    pendP: member("pendP", "driver", { status: "pending" }),
    carA: member("staffA", "carrier", { source: "logisweb-staff", companyName: "한빛로지스", docsVerified: true }),
    shipPoor: member("shipPoor", "shipper", { docsVerified: true }),
  };
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/staffA"), { role: "admin", companyName: "한빛로지스", approved: true, name: "김직원" });
    await setDoc(doc(db, "users/staffB"), { role: "admin", companyName: "다른운송", approved: true });
    await setDoc(doc(db, "users/drvL"), { role: "driver", companyName: "한빛로지스", approved: true, carNo: "경기12가3456", name: "박기사" });
    await setDoc(doc(db, "users/admin1"), { role: "totalMaster", companyName: "로지스웹", approved: true });
    for (const [k, m] of Object.entries(M)) await setDoc(doc(db, `hubMembers/${m.uid}`), m);
    // ⭐ 2026-11-06 예치금(서버만 씀) — 인수증 · 예치금 결제 오더는 등록자 예치금이 운임+수수료 이상이어야 등록 · 신청 · 확정
    await setDoc(doc(db, "hubWallets/shipS"), { uid: "shipS", available: 10000000, held: 0, pending: 0, owed: 0 });
    await setDoc(doc(db, "hubWallets/staffA"), { uid: "staffA", available: 5000000, held: 0, pending: 0, owed: 0 });
    await setDoc(doc(db, "hubWallets/shipPoor"), { uid: "shipPoor", available: 100000, held: 0, pending: 0, owed: 0 });
    await setDoc(doc(db, "hubLedger/L1"), { uid: "shipS", type: "charge", amount: 10000000, at: serverTimestamp() });
    await setDoc(doc(db, "hubPayouts/P1"), { toUid: "drvD", fromUid: "shipS", amount: 600000, status: "queued", orderId: "o1" });
    await setDoc(doc(db, "hubOrders/oPoor"), { ...pub(), v: 3, posterUid: "shipPoor", posterRole: "shipper", posterSource: "signup", posterCompany: M.shipPoor.companyName, posterName: M.shipPoor.name, posterVerified: true, status: "open", takerUid: null, takerRole: null, assignedAt: null, cancelCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    for (const id of ["o1", "o2", "o3", "o4"]) {
      await setDoc(doc(db, `hubOrders/${id}`), { ...pub(), v: 3, posterUid: "shipS", posterRole: "shipper", posterSource: "signup", posterCompany: M.shipS.companyName, posterName: M.shipS.name, posterVerified: true, status: "open", takerUid: null, takerRole: null, assignedAt: null, cancelCount: id === "o4" ? 5 : 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await setDoc(doc(db, `hubOrders/${id}/private/detail`), { 상차지주소: "경기 화성시 비밀로 1", posterPhone: "010-9999-0000" });
    }
  });
  const as = (uid, email) => env.authenticatedContext(uid, email ? { email } : {}).firestore();
  const st = (uid) => env.authenticatedContext(uid).storage();
  const anon = env.unauthenticatedContext().firestore();

  // ── 읽기 권한
  await t("비로그인은 오더를 못 본다", () => assertFails(getDoc(doc(anon, "hubOrders/o1"))));
  await t("승인 대기 회원은 오더를 못 본다", () => assertFails(getDoc(doc(as("pendP"), "hubOrders/o1"))));
  await t("승인 대기 회원은 보드 목록을 못 본다", () => assertFails(getDocs(query(collection(as("pendP"), "hubOrders"), where("status", "==", "open")))));
  await t("승인 차주는 오더를 본다", () => assertSucceeds(getDoc(doc(as("drvD"), "hubOrders/o1"))));
  await t("승인 차주는 보드 목록을 본다", () => assertSucceeds(getDocs(query(collection(as("drvD"), "hubOrders"), where("status", "==", "open")))));
  await t("배차 전 차주는 상세주소를 못 본다", () => assertFails(getDoc(doc(as("drvD"), "hubOrders/o1/private/detail"))));
  await t("등록자는 상세주소를 본다", () => assertSucceeds(getDoc(doc(as("shipS"), "hubOrders/o1/private/detail"))));
  await t("배차 프로그램 직원(로지스웹 계정만, 허브 회원 아님)은 허브 오더를 못 본다", () => assertFails(getDoc(doc(as("staffB"), "hubOrders/o1"))));
  await t("다른 회원의 회원 정보(서류 경로·연락처)는 못 본다", () => assertFails(getDoc(doc(as("drvE"), "hubMembers/drvD"))));
  await t("본인 회원 정보는 본다", () => assertSucceeds(getDoc(doc(as("drvE"), "hubMembers/drvE"))));
  await t("관리자는 회원 목록을 본다", () => assertSucceeds(getDocs(collection(as("admin1"), "hubMembers"))));
  await t("일반 회원은 회원 목록을 못 본다", () => assertFails(getDocs(collection(as("shipS"), "hubMembers"))));

  // ── 등록(화주·운송사만 · 횟수 제한 · 비공개 칸 금지)
  const post = (uid, m, over = {}, id = `p_${uid}_${Date.now()}`) => {
    const db = as(uid);
    const b = writeBatch(db);
    b.set(doc(db, `hubQuota/${uid}`), { uid, count: over.__count || 1, day: today(), lastPostAt: serverTimestamp() });
    const { __count, ...o } = over;
    b.set(doc(db, `hubOrders/${id}`), { ...pub(), v: 3, posterUid: uid, posterRole: m.role, posterSource: m.source, posterCompany: m.companyName, posterName: m.name, posterVerified: m.docsVerified === true, status: "open", takerUid: null, takerRole: null, assignedAt: null, cancelCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...o });
    return b.commit();
  };
  await t("차주는 오더를 올릴 수 없다", () => assertFails(post("drvD", M.drvD)));
  await t("승인 대기 회원은 오더를 올릴 수 없다", () => assertFails(post("pendP", M.pendP)));
  await t("공개 오더에 상세주소 칸을 넣으면 거절", () => assertFails(post("shipS", M.shipS, { 상차지주소: "경기 화성시 비밀로 1" })));
  await t("인증 배지를 꾸며 넣으면 거절(posterVerified)", () => assertFails(post("drvE", M.drvE)));
  await t("다른 회사 이름으로 올리면 거절", () => assertFails(post("shipS", M.shipS, { posterCompany: "가짜물산" })));
  await t("화주는 오더를 올린다", () => assertSucceeds(post("shipS", M.shipS)));
  await t("20초 안에 또 올리면 거절(스팸 방지)", () => assertFails(post("shipS", M.shipS, { __count: 2 })));
  await t("운송사(로지스웹 직원)는 오더를 올린다", () => assertSucceeds(post("staffA", M.carA)));

  // ── 배차신청(먼저 1명) · 10초 취소
  const request = (uid, m, id, over = {}) => {
    const db = as(uid);
    const b = writeBatch(db);
    b.update(doc(db, `hubOrders/${id}`), { status: "assigned", takerUid: uid, takerRole: m.role, assignedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    b.set(doc(db, `hubOrders/${id}/private/match`), { ...matchOf(m), ...over });
    return b.commit();
  };
  const cancel = (uid, id) => {
    const db = as(uid);
    const b = writeBatch(db);
    b.update(doc(db, `hubOrders/${id}`), { status: "open", takerUid: null, takerRole: null, assignedAt: null, cancelCount: increment(1), lastCancelUid: uid, lastCancelAt: serverTimestamp(), updatedAt: serverTimestamp() });
    b.delete(doc(db, `hubOrders/${id}/private/match`));
    return b.commit();
  };
  await t("화주는 배차신청할 수 없다", () => assertFails(request("shipS", M.shipS, "o2")));
  await t("정지(패널티) 차주는 배차신청할 수 없다", () => assertFails(request("drvBlocked", M.drvBlocked, "o2")));
  await t("차주 정보를 꾸며 넣으면 거절(서류 인증 거짓)", () => assertFails(request("drvD", M.drvD, "o1", { docsVerified: true })));
  await t("배차 시각을 꾸며 넣으면 거절", () => {
    const db = as("drvD"); const b = writeBatch(db);
    b.update(doc(db, "hubOrders/o1"), { status: "assigned", takerUid: "drvD", takerRole: "driver", assignedAt: Timestamp.fromMillis(Date.now() - 60000), updatedAt: serverTimestamp() });
    b.set(doc(db, "hubOrders/o1/private/match"), matchOf(M.drvD));
    return assertFails(b.commit());
  });
  await t("차주 D 배차신청 성공", () => assertSucceeds(request("drvD", M.drvD, "o1")));
  await t("이미 배차된 오더에 차주 E 신청은 거절(중복 배차 방지)", () => assertFails(request("drvE", M.drvE, "o1")));
  await t("10초 안에는 배차된 차주도 상세주소를 못 본다", () => assertFails(getDoc(doc(as("drvD"), "hubOrders/o1/private/detail"))));
  await t("등록자는 배차된 차주 정보를 본다", () => assertSucceeds(getDoc(doc(as("shipS"), "hubOrders/o1/private/match"))));
  await t("다른 차주는 배차 정보를 못 본다", () => assertFails(getDoc(doc(as("drvE"), "hubOrders/o1/private/match"))));
  const confirm = (uid, id) => updateDoc(doc(as(uid), `hubOrders/${id}`), { confirmed: true, confirmedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await t("10초 전에는 확정 표시 거절", () => assertFails(confirm("drvD", "o1")));
  await t("관계없는 회원은 확정 표시 거절", () => assertFails(confirm("drvE", "o1")));
  await t("10초 안에는 상차완료를 누를 수 없다", () => assertFails(updateDoc(doc(as("drvD"), "hubOrders/o1"), { status: "loaded", loadedAt: serverTimestamp(), updatedAt: serverTimestamp() })));
  await t("차주 D가 o2 신청 후 10초 안 취소 성공", async () => { await assertSucceeds(request("drvD", M.drvD, "o2")); await sleep(1500); await assertSucceeds(cancel("drvD", "o2")); });
  await t("다른 사람이 내 배차를 취소할 수 없다", async () => { await assertSucceeds(request("drvE", M.drvE, "o3")); await assertFails(cancel("drvD", "o3")); });
  await t("10초 내 취소 5번 쌓인 오더는 신청 불가", () => assertFails(request("drvD", M.drvD, "o4")));
  await sleep(10500);
  await t("10초가 지나면 취소 거절(전화로)", () => assertFails(cancel("drvD", "o1")));
  await t("확정 표시 전에는 10초가 지나도 상세주소 비공개", () => assertFails(getDoc(doc(as("drvD"), "hubOrders/o1/private/detail"))));
  await t("10초 뒤 확정 표시 성공", () => assertSucceeds(confirm("drvD", "o1")));
  await t("확정 뒤에는 (시각과 관계없이) 취소 거절", () => assertFails(cancel("drvD", "o1")));
  await t("10초 확정 뒤엔 배차된 차주가 상세주소를 본다", () => assertSucceeds(getDoc(doc(as("drvD"), "hubOrders/o1/private/detail"))));
  await t("확정 뒤에도 다른 차주는 상세주소를 못 본다", () => assertFails(getDoc(doc(as("drvE"), "hubOrders/o1/private/detail"))));
  // ⭐ 2026-11-06 위치관제(hubLive) — 확정 뒤 배차된 회원만 쓰고, 등록자 · 관리자만 본다
  const live = (uid, over = {}) => setDoc(doc(as(uid), "hubLive/o1"), { orderId: "o1", takerUid: uid, posterUid: "shipS", lat: 37.2, lng: 126.83, speed: 40, accuracy: 12, updatedAt: serverTimestamp(), ...over });
  await t("배차된 차주는 확정 뒤 위치를 보낸다", () => assertSucceeds(live("drvD")));
  await t("다른 차주는 그 오더 위치를 쓸 수 없다", () => assertFails(live("drvE")));
  await t("위치 칸 외 다른 칸(운임 등)은 거절", () => assertFails(live("drvD", { 운임: 1 })));
  await t("이동 경로 점 추가(배차된 차주)", () => assertSucceeds(setDoc(doc(as("drvD"), "hubLive/o1/track/t1"), { lat: 37.2, lng: 126.83, speed: 40, accuracy: 10, timestamp: serverTimestamp() })));
  await t("등록자는 차량 위치를 본다", () => assertSucceeds(getDoc(doc(as("shipS"), "hubLive/o1"))));
  await t("등록자는 이동 경로를 본다", () => assertSucceeds(getDocs(collection(as("shipS"), "hubLive/o1/track"))));
  await t("관리자는 차량 위치를 본다", () => assertSucceeds(getDoc(doc(as("admin1"), "hubLive/o1"))));
  await t("다른 차주는 차량 위치를 못 본다", () => assertFails(getDoc(doc(as("drvE"), "hubLive/o1"))));
  await t("다른 화주(관계없는 회원)는 차량 위치를 못 본다", () => assertFails(getDoc(doc(as("shipPoor"), "hubLive/o1"))));
  await t("다른 회원은 이동 경로를 못 본다", () => assertFails(getDocs(collection(as("drvE"), "hubLive/o1/track"))));
  await t("배차된 차주가 정산(settle) 칸을 직접 쓰기 거절", () => assertFails(updateDoc(doc(as("drvD"), "hubOrders/o1"), { settle: { status: "settled" }, updatedAt: serverTimestamp() })));
  await t("등록자가 연동 칸(lwOrderId)을 직접 쓰기 거절", () => assertFails(updateDoc(doc(as("shipS"), "hubOrders/o1"), { lwOrderId: "x", updatedAt: serverTimestamp() })));
  await t("운송완료 전 평가 거절", () => assertFails(updateDoc(doc(as("shipS"), "hubOrders/o1"), { ratingByPoster: { score: 5, comment: "" }, updatedAt: serverTimestamp() })));
  await t("상차완료 → 운송완료(인수증 2장)", async () => {
    await assertSucceeds(updateDoc(doc(as("drvD"), "hubOrders/o1"), { status: "loaded", loadedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertSucceeds(live("drvD", { lat: 36.0 }));
    await assertSucceeds(updateDoc(doc(as("drvD"), "hubOrders/o1"), { status: "delivered", deliveredAt: serverTimestamp(), podPath: "hub/pod/o1/x.jpg", pod: [{ path: "hub/pod/o1/x.jpg", name: "a.jpg" }, { path: "hub/pod/o1/y.jpg", name: "b.jpg" }], podAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });
  await t("운송완료 뒤 등록자는 차량 위치를 못 본다(관제 종료)", () => assertFails(getDoc(doc(as("shipS"), "hubLive/o1"))));
  await t("운송완료 뒤 이동 경로도 못 본다", () => assertFails(getDocs(collection(as("shipS"), "hubLive/o1/track"))));
  await t("운송완료 뒤 차주도 위치를 더 못 쓴다", () => assertFails(live("drvD")));
  await t("운송완료 뒤 인수증 더 올리기(늘리기) 성공", () => assertSucceeds(updateDoc(doc(as("drvD"), "hubOrders/o1"), { pod: [{ path: "hub/pod/o1/x.jpg" }, { path: "hub/pod/o1/y.jpg" }, { path: "hub/pod/o1/z.jpg" }], podAt: serverTimestamp(), updatedAt: serverTimestamp() })));
  await t("인수증 줄이기(지우기) 거절", () => assertFails(updateDoc(doc(as("drvD"), "hubOrders/o1"), { pod: [{ path: "hub/pod/o1/x.jpg" }], updatedAt: serverTimestamp() })));
  await t("등록자는 인수증 목록을 고칠 수 없다", () => assertFails(updateDoc(doc(as("shipS"), "hubOrders/o1"), { pod: [{ path: "a" }, { path: "b" }, { path: "c" }, { path: "d" }], updatedAt: serverTimestamp() })));
  await t("등록자는 계산서를 대신 등록할 수 없다", () => assertFails(updateDoc(doc(as("shipS"), "hubOrders/o1"), { invoice: { no: "20261107-1234", date: "2026-11-07", amount: 600000 }, updatedAt: serverTimestamp() })));
  await t("승인번호가 너무 짧은 계산서 거절", () => assertFails(updateDoc(doc(as("drvD"), "hubOrders/o1"), { invoice: { no: "12", date: "2026-11-07", amount: 600000 }, updatedAt: serverTimestamp() })));
  await t("배차된 차주 계산서 발행 등록 성공", () => assertSucceeds(updateDoc(doc(as("drvD"), "hubOrders/o1"), { invoice: { no: "20261107-41000000-12345678", date: "2026-11-07", amount: 600000, at: serverTimestamp() }, updatedAt: serverTimestamp() })));
  await t("계산서 두 번 등록 거절", () => assertFails(updateDoc(doc(as("drvD"), "hubOrders/o1"), { invoice: { no: "20261107-99999999", date: "2026-11-07", amount: 1 }, updatedAt: serverTimestamp() })));
  await t("등록자 평가 1번 성공", () => assertSucceeds(updateDoc(doc(as("shipS"), "hubOrders/o1"), { ratingByPoster: { score: 5, comment: "친절" }, updatedAt: serverTimestamp() })));
  await t("평가 두 번은 거절", () => assertFails(updateDoc(doc(as("shipS"), "hubOrders/o1"), { ratingByPoster: { score: 1, comment: "" }, updatedAt: serverTimestamp() })));
  await t("점수 범위 밖(6점) 거절", () => assertFails(updateDoc(doc(as("drvD"), "hubOrders/o1"), { ratingByTaker: { score: 6, comment: "" }, updatedAt: serverTimestamp() })));
  await t("다른 사람이 운임을 바꿀 수 없다", () => assertFails(updateDoc(doc(as("drvE"), "hubOrders/o3"), { 운임: 1, updatedAt: serverTimestamp() })));
  await t("완료 건수(hubStats)는 회원이 쓸 수 없다", () => assertFails(setDoc(doc(as("drvD"), "hubStats/drvD"), { completed: 999 })));

  // ⭐ 2026-11-06 예치금 — 결제 방식별 등록 · 신청 막기 · 잔액/원장은 서버만
  await t("예치금 부족 화주는 인수증 결제 오더를 못 올린다", () => assertFails(post("shipPoor", M.shipPoor, { 운임: 600000, 수수료: 20000 })));
  await t("예치금 부족 화주는 예치금 결제 오더도 못 올린다", () => assertFails(post("shipPoor", M.shipPoor, { 지급방식: "예치금", 운임: 600000, 수수료: 20000 })));
  await t("예치금 부족 화주도 착불 오더는 올린다", () => assertSucceeds(post("shipPoor", M.shipPoor, { 지급방식: "착불", 운임: 300000, 수수료: 20000 })));
  await t("예치금 부족 등록자의 인수증 오더에는 배차신청 거절", () => assertFails(request("drvE", M.drvE, "oPoor")));
  await t("회원은 자기 예치금 잔액을 본다", () => assertSucceeds(getDoc(doc(as("shipS"), "hubWallets/shipS"))));
  await t("남의 예치금 잔액은 못 본다", () => assertFails(getDoc(doc(as("drvD"), "hubWallets/shipS"))));
  await t("회원은 자기 잔액을 바꿀 수 없다(충전 꾸미기)", () => assertFails(setDoc(doc(as("shipPoor"), "hubWallets/shipPoor"), { uid: "shipPoor", available: 99999999 })));
  await t("로지스웹 직원 계정(배차 프로그램 승인 계정)도 예치금 잔액을 쓸 수 없다", () => assertFails(setDoc(doc(as("staffA"), "hubWallets/staffA"), { uid: "staffA", available: 99999999 })));
  await t("로지스웹 직원 계정도 원장 · 지급 대기열을 쓸 수 없다", async () => { await assertFails(setDoc(doc(as("staffA"), "hubLedger/x"), { uid: "staffA", amount: 1 })); await assertFails(setDoc(doc(as("staffB"), "hubPayouts/x"), { toUid: "staffB", amount: 1 })); });
  await t("로지스웹 직원 계정은 남의 위치관제를 못 본다", () => assertFails(getDoc(doc(as("staffB"), "hubLive/o1"))));
  await t("회원은 잔액 문서를 새로 만들 수 없다",() => assertFails(setDoc(doc(as("drvE"), "hubWallets/drvE"), { uid: "drvE", available: 1 })));
  await t("회원은 원장을 쓸 수 없다", () => assertFails(setDoc(doc(as("shipS"), "hubLedger/fake"), { uid: "shipS", type: "charge", amount: 1 })));
  await t("회원은 자기 원장을 본다(목록)", () => assertSucceeds(getDocs(query(collection(as("shipS"), "hubLedger"), where("uid", "==", "shipS")))));
  await t("남의 원장은 못 본다", () => assertFails(getDocs(query(collection(as("drvD"), "hubLedger"), where("uid", "==", "shipS")))));
  await t("충전 요청 성공(요청 상태)", () => assertSucceeds(setDoc(doc(as("shipPoor"), "hubCharges/c1"), { uid: "shipPoor", name: "x", amount: 500000, depositor: "가난상사", status: "requested", createdAt: serverTimestamp() })));
  await t("충전 요청을 '확인됨'으로 만들기 거절", () => assertFails(setDoc(doc(as("shipPoor"), "hubCharges/c2"), { uid: "shipPoor", amount: 500000, depositor: "x", status: "confirmed", createdAt: serverTimestamp() })));
  await t("본인이 충전 요청을 입금 확인 처리 거절", () => assertFails(updateDoc(doc(as("shipPoor"), "hubCharges/c1"), { status: "confirmed", confirmedAt: serverTimestamp() })));
  await t("관리자 입금 확인 성공", () => assertSucceeds(updateDoc(doc(as("admin1"), "hubCharges/c1"), { status: "confirmed", confirmedAt: serverTimestamp(), confirmedBy: "admin" })));
  await t("입금 확인 뒤 다시 바꾸기 거절", () => assertFails(updateDoc(doc(as("admin1"), "hubCharges/c1"), { status: "rejected" })));
  await t("지급 대기열은 받는 사람이 본다", () => assertSucceeds(getDoc(doc(as("drvD"), "hubPayouts/P1"))));
  await t("관계없는 회원은 지급 대기열을 못 본다", () => assertFails(getDoc(doc(as("drvE"), "hubPayouts/P1"))));
  await t("차주가 스스로 지급완료 처리 거절", () => assertFails(updateDoc(doc(as("drvD"), "hubPayouts/P1"), { status: "paid", paidAt: serverTimestamp() })));
  await t("관리자도 지급 금액은 못 바꾼다(서버가 정함)", () => assertFails(updateDoc(doc(as("admin1"), "hubPayouts/P1"), { amount: 1 })));
  await t("관리자 지급완료 처리 성공", () => assertSucceeds(updateDoc(doc(as("admin1"), "hubPayouts/P1"), { status: "paid", paidAt: serverTimestamp(), paidBy: "admin" })));
  await t("회원은 지급 대기열을 만들 수 없다", () => assertFails(setDoc(doc(as("drvD"), "hubPayouts/P2"), { toUid: "drvD", amount: 9999999, status: "queued" })));
  await t("회원은 예치금 조정을 만들 수 없다", () => assertFails(setDoc(doc(as("drvD"), "hubAdjustments/a1"), { uid: "drvD", amount: 100000, bucket: "available", memo: "x", by: "x", createdAt: serverTimestamp() })));
  await t("관리자 예치금 조정 성공", () => assertSucceeds(setDoc(doc(as("admin1"), "hubAdjustments/a2"), { uid: "drvD", amount: -5000, bucket: "available", memo: "정정", by: "admin", createdAt: serverTimestamp() })));
  await t("미정산 기록은 회원이 쓸 수 없다", () => assertFails(setDoc(doc(as("drvD"), "hubDebts/d1"), { fromUid: "drvD", toUid: "shipS", amount: 0, status: "paid" })));
  await t("설정(수수료 · 계좌)은 회원이 바꿀 수 없다", () => assertFails(setDoc(doc(as("shipS"), "hubSettings/config"), { fee: { value: 0 } })));
  await t("관리자 설정 저장 성공", () => assertSucceeds(setDoc(doc(as("admin1"), "hubSettings/config"), { fee: { mode: "amount", value: 20000, platformRate: 0 }, depositAccount: { bank: "기업", number: "123-456789-01-011", holder: "로지스웹" } })));
  await t("회원은 설정을 읽는다(입금 계좌 표시)", () => assertSucceeds(getDoc(doc(as("drvE"), "hubSettings/config"))));
  await t("공지는 관리자만 쓴다", () => assertFails(setDoc(doc(as("shipS"), "hubAnnouncements/x"), { title: "가짜 공지" })));
  await t("관리자 공지 작성 성공", () => assertSucceeds(setDoc(doc(as("admin1"), "hubAnnouncements/x"), { title: "설 연휴 안내", pinned: true })));
  await t("회원 정산 계좌 등록 성공", () => assertSucceeds(updateDoc(doc(as("drvE"), "hubMembers/drvE"), { bank: { bank: "국민", number: "123-45-678901", holder: "drvE이름" } })));
  await t("정산 계좌에 엉뚱한 칸을 넣으면 거절", () => assertFails(updateDoc(doc(as("drvE"), "hubMembers/drvE"), { bank: { bank: "국민", number: "1", holder: "x", balance: 9999 } })));
  await t("푸시 토큰 저장 성공", () => assertSucceeds(updateDoc(doc(as("drvE"), "hubMembers/drvE"), { fcmTokens: ["tok-1"], fcmTokenAt: Date.now() })));
  await t("관리자는 아무 오더나 고친다(강제 변경)", () => assertSucceeds(updateDoc(doc(as("admin1"), "hubOrders/o3"), { 운임: 777000, status: "cancelled", updatedAt: serverTimestamp() })));
  await t("관리자는 오더 상세주소도 고친다", () => assertSucceeds(setDoc(doc(as("admin1"), "hubOrders/o3/private/detail"), { 상차지주소: "경기 화성시 관리자수정 1" }, { merge: true })));
  await t("다른 회원은 오더 상세주소를 못 고친다", () => assertFails(setDoc(doc(as("drvE"), "hubOrders/o2/private/detail"), { 상차지주소: "x" }, { merge: true })));
  await t("관리자는 회원 정보를 고친다",() => assertSucceeds(updateDoc(doc(as("admin1"), "hubMembers/drvD"), { phone: "010-0000-1111", penalty: { blocked: false } })));

  // ── 회원 정보 · 승인
  await t("가입 신청(pending) 생성 성공", () => assertSucceeds(setDoc(doc(as("newU"), "hubMembers/newU"), { uid: "newU", role: "driver", source: "signup", status: "pending", name: "새차주", prefs: {} })));
  await t("스스로 승인 상태로 가입 거절", () => assertFails(setDoc(doc(as("newV"), "hubMembers/newV"), { uid: "newV", role: "driver", source: "signup", status: "approved", name: "가짜" })));
  await t("스스로 인증 표시(docsVerified) 거절", () => assertFails(setDoc(doc(as("newW"), "hubMembers/newW"), { uid: "newW", role: "driver", source: "signup", status: "pending", docsVerified: true })));
  await t("승인 대기 회원이 스스로 승인으로 바꾸기 거절", () => assertFails(updateDoc(doc(as("pendP"), "hubMembers/pendP"), { status: "approved" })));
  await t("승인 회원이 차량번호를 몰래 바꾸기 거절(재심사 필요)", () => assertFails(updateDoc(doc(as("drvD"), "hubMembers/drvD"), { vehicle: { plate: "서울99바9999", type: "윙바디", ton: "25톤", length: "10", width: "2.5" } })));
  await t("승인 회원 알림 설정 저장 성공", () => assertSucceeds(updateDoc(doc(as("drvD"), "hubMembers/drvD"), { prefs: { alert: { on: true } } })));
  await t("배차 프로그램 직원(카탈로그 전체 권한 규칙)도 남의 허브 회원 문서를 못 고친다", () => assertFails(updateDoc(doc(as("staffB"), "hubMembers/drvD"), { status: "suspended" })));
  await t("로지스웹 기사 연결 — 다른 회사 이름이면 거절", () => assertFails(setDoc(doc(as("drvL"), "hubMembers/drvL"), { uid: "drvL", role: "driver", source: "logisweb-driver", status: "approved", companyName: "다른운송", vehicle: { plate: "경기12가3456" }, docsVerified: true })));
  await t("로지스웹 기사 연결 — 차량번호가 다르면 거절", () => assertFails(setDoc(doc(as("drvL"), "hubMembers/drvL"), { uid: "drvL", role: "driver", source: "logisweb-driver", status: "approved", companyName: "한빛로지스", vehicle: { plate: "서울00가0000" }, docsVerified: true })));
  await t("로지스웹 기사가 운송사로 연결하기 거절", () => assertFails(setDoc(doc(as("drvL"), "hubMembers/drvL"), { uid: "drvL", role: "carrier", source: "logisweb-staff", status: "approved", companyName: "한빛로지스", docsVerified: true })));
  await t("로지스웹 기사 연결 성공(users 문서와 같음)", () => assertSucceeds(setDoc(doc(as("drvL"), "hubMembers/drvL"), { uid: "drvL", role: "driver", source: "logisweb-driver", status: "approved", companyName: "한빛로지스", name: "박기사", vehicle: { plate: "경기12가3456", type: "", ton: "", length: "", width: "" }, docsVerified: true, prefs: {} })));
  await t("관리자 승인 처리 성공", () => assertSucceeds(updateDoc(doc(as("admin1"), "hubMembers/pendP"), { status: "approved", docsVerified: true })));
  await t("알림 스팸 — 관계없는 사람에게 보내기 거절", () => assertFails(setDoc(doc(as("drvE"), "hubNotices/n1"), { toUid: "drvD", fromUid: "drvE", orderId: "o1", read: false, title: "x" })));
  await t("알림 — 등록자에게 보내기 성공", () => assertSucceeds(setDoc(doc(as("drvE"), "hubNotices/n2"), { toUid: "shipS", fromUid: "drvE", orderId: "o3", read: false, title: "x" })));
  await t("남의 알림 읽기 거절", () => assertFails(getDoc(doc(as("drvD"), "hubNotices/n2"))));

  // ── Storage(서류 · 인수증)
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  await t("본인 서류 올리기 성공", () => assertSucceeds(uploadBytes(ref(st("drvD"), "hub/members/drvD/bizReg_1.png"), png, { contentType: "image/png" })));
  await t("남의 서류 경로에 올리기 거절", () => assertFails(uploadBytes(ref(st("drvE"), "hub/members/drvD/bizReg_2.png"), png, { contentType: "image/png" })));
  await t("실행 파일 형식 거절", () => assertFails(uploadBytes(ref(st("drvD"), "hub/members/drvD/x.exe"), png, { contentType: "application/octet-stream" })));
  await t("다른 회원은 서류를 못 본다", () => assertFails(getBytes(ref(st("drvE"), "hub/members/drvD/bizReg_1.png"))));
  await t("관리자는 서류를 본다", () => assertSucceeds(getBytes(ref(st("admin1"), "hub/members/drvD/bizReg_1.png"))));
  await t("배차된 차주 인수증 올리기 성공", () => assertSucceeds(uploadBytes(ref(st("drvD"), "hub/pod/o1/pod_1.png"), png, { contentType: "image/png" })));
  await t("배차 안 된 차주 인수증 올리기 거절", () => assertFails(uploadBytes(ref(st("drvE"), "hub/pod/o1/pod_2.png"), png, { contentType: "image/png" })));
  await t("등록자는 인수증을 본다", () => assertSucceeds(getBytes(ref(st("shipS"), "hub/pod/o1/pod_1.png"))));
  await t("관계없는 회원은 인수증을 못 본다", () => assertFails(getBytes(ref(st("drvE"), "hub/pod/o1/pod_1.png"))));

  await env.cleanup();
  console.log(results.join("\n"));
  console.log(`\n총 ${pass + fail}개 — 통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("테스트 실행 오류", e); process.exit(2); });
