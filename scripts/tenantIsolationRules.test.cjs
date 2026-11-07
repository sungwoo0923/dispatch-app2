// 🔒 2026-11-07 운송사(회사) 간 데이터 완전 분리 — 보안 규칙 테스트(Firestore 에뮬레이터 전용)
//  예전 공용 규칙(/{col}/{rest=**} = 승인된 누구나)에 걸려 있던 컬렉션과 users·userProfiles 등을 다른 회사가 못 읽고 못 쓰는지 확인한다.
//  실행 예: firebase emulators:exec --only firestore --project demo-kpflow "node scripts/tenantIsolationRules.test.cjs"
//  (@firebase/rules-unit-testing · firebase 가 필요 — NODE_PATH로 넘겨도 된다. 포트는 EMU_FS_PORT, 기본 8080)
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, limit } = require("firebase/firestore");

const ROOT = process.env.HUB_REPO || path.resolve(__dirname, "..");
const FS_PORT = Number(process.env.EMU_FS_PORT || 8080);
let pass = 0, fail = 0;
const out = [];
async function t(name, fn) {
  try { await fn(); pass += 1; out.push(`PASS ${name}`); } catch (e) { fail += 1; out.push(`FAIL ${name} :: ${String(e?.message || e).slice(0, 200)}`); }
}
const A_CO = "에이운송", B_CO = "비운송";

(async () => {
  const env = await initializeTestEnvironment({
    projectId: process.env.HUB_PROJECT || "demo-kpflow",
    firestore: { rules: fs.readFileSync(`${ROOT}/firestore.rules`, "utf8"), host: "127.0.0.1", port: FS_PORT },
  });
  await env.clearFirestore();
  const seed = async (lock) => env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "systemConfig/tenancy"), { serverFilter: lock });
    await setDoc(doc(db, "systemConfig/dataVersion"), { [A_CO]: 1, [B_CO]: 1 });
    await setDoc(doc(db, "users/adminA"), { companyName: A_CO, approved: true, role: "admin", name: "에이관리자" });
    await setDoc(doc(db, "users/userA"), { companyName: A_CO, approved: true, role: "user", name: "에이직원", team: "배차팀" });
    await setDoc(doc(db, "users/userA2"), { companyName: A_CO, approved: true, role: "user", name: "에이직원2" });
    await setDoc(doc(db, "users/drvA"), { companyName: A_CO, approved: true, role: "driver", carNo: "12가3456" });
    await setDoc(doc(db, "users/adminB"), { companyName: B_CO, approved: true, role: "admin", name: "비관리자" });
    await setDoc(doc(db, "users/userB"), { companyName: B_CO, approved: true, role: "user" });
    await setDoc(doc(db, "users/shipS"), { companyName: "에스상사", approved: true, role: "shipper", linkedTransportCompany: { companyName: A_CO } });
    await setDoc(doc(db, "users/shipT"), { companyName: "티상사", approved: true, role: "shipper", linkedTransportCompany: { companyName: B_CO } });
    await setDoc(doc(db, "users/pend"), { companyName: B_CO, approved: false, role: "user" });
    await setDoc(doc(db, "users/hrA"), { companyName: A_CO, approved: true, role: "hrManager", team: "인사팀" });
    await setDoc(doc(db, "users/drvA2"), { companyName: A_CO, approved: false, role: "driver", carNo: "34나5678" });
    await setDoc(doc(db, "users/shipS2"), { companyName: "에스상사", approved: true, role: "shipper", permissions: { master: true }, linkedTransportCompany: { companyName: A_CO } });
    await setDoc(doc(db, "users/shipNew"), { companyName: "에스상사", approved: false, role: "shipper", linkedTransportCompany: { companyName: A_CO } });
    await setDoc(doc(db, "users/master"), { companyName: A_CO, approved: true, role: "totalMaster" });
    await setDoc(doc(db, "userProfiles/userA2"), { hireDate: "2024-01-01" });
    await setDoc(doc(db, "userProfiles/userB"), { hireDate: "2024-02-01" });
    await setDoc(doc(db, "chat_rooms/rA"), { members: ["userA", "userA2"], type: "dm" });
    await setDoc(doc(db, "chat_messages/mA"), { roomId: "rA", senderUid: "userA", text: "비밀" });
    await setDoc(doc(db, "chat_profiles/userA2"), { uid: "userA2", company: A_CO, name: "에이직원2" });
    await setDoc(doc(db, "transportApplications/tA"), { companyName: A_CO, userId: "adminA", status: "approved", 직인이미지: "data:x", companyCode: "A1" });
    await setDoc(doc(db, "transportApplications/tB"), { companyName: B_CO, userId: "adminB", status: "approved", companyCode: "B1" });
    await setDoc(doc(db, "companyApplications/cS"), { companyName: "에스상사", userId: "shipS", status: "approved", linkedTransportCompany: { companyName: A_CO } });
    await setDoc(doc(db, "gps_tracks/gA"), { companyName: A_CO, driverId: "drvA", lat: 1, lng: 2 });
    await setDoc(doc(db, "gps_tracks/gOld"), { driverId: "drvA", lat: 1, lng: 2 });
    await setDoc(doc(db, "attendance/aA"), { companyName: A_CO, uid: "userA", date: "2026-11-07" });
    await setDoc(doc(db, "orders/oA"), { companyName: A_CO, 상차일: "2026-11-07" });
    await setDoc(doc(db, "orders/oA/attachments/x1"), { url: "u" });
    await setDoc(doc(db, "sessionLogs/s1"), { uid: "userA", companyName: A_CO, event: "login" });
    await setDoc(doc(db, "loginSessions/lA"), { uid: "userA", companyName: A_CO, active: true, role: "user" });
    await setDoc(doc(db, "landingInquiries/q1"), { name: "방문자", phone: "010" });
    await setDoc(doc(db, "companyPlans/" + A_CO), { planId: "pro" });
    await setDoc(doc(db, "notices/nA"), { companyName: A_CO, audience: "shipper", title: "화주 공지" });
    await setDoc(doc(db, "inquiries/iA"), { userId: "shipS", company: "에스상사", transportCompany: A_CO, title: "문의" });
    await setDoc(doc(db, "arPayments/pA"), { company: A_CO, amount: 1000 });
    await setDoc(doc(db, "multiRateSheets/mA"), { companyName: A_CO });
    await setDoc(doc(db, "fooUnknown/fA"), { companyName: A_CO, v: 1 });
    await setDoc(doc(db, "companyRoleOverrides/" + A_CO), { roles: {} });
    await setDoc(doc(db, "publicCompanies/" + A_CO), { companyName: A_CO });
  });
  await seed(true);
  const as = (uid, tok) => env.authenticatedContext(uid, tok).firestore();
  const AA = as("adminA"), UA = as("userA"), UA2 = as("userA2"), DA = as("drvA"), AB = as("adminB"), UB = as("userB");
  const SS = as("shipS"), ST = as("shipT"), PEND = as("pend"), M = as("master", { email: "tjddnqkf@naver.com" });

  // ── users ──
  await t("users: 같은 회사 직원 한 건 읽기", () => assertSucceeds(getDoc(doc(UA, "users/userA2"))));
  await t("users: 다른 회사 직원 한 건 읽기 거절", () => assertFails(getDoc(doc(UA, "users/adminB"))));
  await t("users: 우리 회사 목록(companyName 조건)", () => assertSucceeds(getDocs(query(collection(UA, "users"), where("companyName", "==", A_CO)))));
  await t("users: 전체 목록 거절", () => assertFails(getDocs(collection(UA, "users"))));
  await t("users: 다른 회사 목록 거절", () => assertFails(getDocs(query(collection(UA, "users"), where("companyName", "==", B_CO)))));
  await t("users: 연동 화주 목록(linkedTransportCompany 조건)", () => assertSucceeds(getDocs(query(collection(AA, "users"), where("linkedTransportCompany.companyName", "==", A_CO)))));
  await t("users: 다른 회사 연동 화주 목록 거절", () => assertFails(getDocs(query(collection(AA, "users"), where("linkedTransportCompany.companyName", "==", B_CO)))));
  await t("users: 화주 → 연동 운송사 직원 목록", () => assertSucceeds(getDocs(query(collection(SS, "users"), where("companyName", "==", A_CO)))));
  await t("users: 화주 → 연동 안 된 운송사 목록 거절", () => assertFails(getDocs(query(collection(SS, "users"), where("companyName", "==", B_CO)))));
  await t("users: 승인 대기 계정은 본인만", () => assertSucceeds(getDoc(doc(PEND, "users/pend"))));
  await t("users: 승인 대기 계정이 남의 문서 읽기 거절", () => assertFails(getDoc(doc(PEND, "users/userB"))));
  await t("users: 본인 이름 고치기", () => assertSucceeds(updateDoc(doc(UA, "users/userA"), { name: "새이름" })));
  await t("users: 본인 회사를 다른 회사로 바꾸기 거절", () => assertFails(updateDoc(doc(UA, "users/userA"), { companyName: B_CO })));
  await t("users: 본인 역할을 관리자로 올리기 거절", () => assertFails(updateDoc(doc(UA, "users/userA"), { role: "admin" })));
  await t("users: 본인을 최고관리자로 올리기 거절(공용 규칙 우회 차단)", () => assertFails(setDoc(doc(UA, "users/userA"), { role: "totalMaster" }, { merge: true })));
  await t("users: 퇴사 처리 스스로 되돌리기 거절", () => assertFails(updateDoc(doc(UA, "users/userA"), { employmentStatus: "재직" })));
  await t("users: 본인 부서를 경리로 바꾸기 거절", () => assertFails(updateDoc(doc(UA, "users/userA"), { team: "경리팀" })));
  await t("users: 화주가 연동 운송사 바꾸기 거절", () => assertFails(updateDoc(doc(SS, "users/shipS"), { linkedTransportCompany: { companyName: B_CO } })));
  await t("users: 다른 회사 관리자가 우리 직원 승인 해제 거절", () => assertFails(updateDoc(doc(AB, "users/userA"), { approved: false })));
  await t("users: 다른 회사 관리자가 우리 직원 삭제 거절", () => assertFails(deleteDoc(doc(AB, "users/userA2"))));
  await t("users: 다른 회사 직원이 남의 문서 일반 칸 쓰기 거절", () => assertFails(updateDoc(doc(UB, "users/userA2"), { memo: "x" })));
  await t("users: 같은 회사 관리자가 역할 변경", () => assertSucceeds(updateDoc(doc(AA, "users/userA2"), { role: "viewer" })));
  await t("users: 같은 회사 일반 직원이 동료 역할 변경 거절", () => assertFails(updateDoc(doc(UA, "users/userA2"), { role: "admin" })));
  await t("users: 같은 회사 직원이 결재 연동 칸(resignPlan) 쓰기", () => assertSucceeds(updateDoc(doc(UA, "users/userA2"), { resignPlan: { date: "2026-12-01" } })));
  await t("users: 같은 회사 관리자가 직원을 다른 회사로 옮기기 거절", () => assertFails(updateDoc(doc(AA, "users/userA2"), { companyName: B_CO })));
  await t("users: 인사 담당이 동료 입사일·직책 고치기", () => assertSucceeds(updateDoc(doc(as("hrA"), "users/userA2"), { hireDate: "2023-01-01", position: "과장", team: "영업팀" })));
  await t("users: 인사 담당이 다른 회사 직원 고치기 거절", () => assertFails(updateDoc(doc(as("hrA"), "users/userB"), { position: "과장" })));
  await t("users: 사무 직원이 우리 회사 기사 승인", () => assertSucceeds(updateDoc(doc(UA, "users/drvA2"), { approved: true })));
  await t("users: 사무 직원이 기사를 관리자로 바꾸기 거절", () => assertFails(updateDoc(doc(UA, "users/drvA2"), { role: "admin" })));
  await t("users: 다른 회사 직원이 우리 기사 승인 거절", () => assertFails(updateDoc(doc(UB, "users/drvA2"), { approved: false })));
  await t("users: 운송사 관리자가 연동 화주 가입 승인", () => assertSucceeds(updateDoc(doc(AA, "users/shipNew"), { approved: true, companyName: "에스상사", companyCode: "S1" })));
  await t("users: 다른 운송사 관리자가 남의 연동 화주 승인 거절", () => assertFails(updateDoc(doc(AB, "users/shipNew"), { approved: false })));
  await t("users: 화주 마스터가 같은 화주사 직원 직책 고치기", () => assertSucceeds(updateDoc(doc(as("shipS2"), "users/shipS"), { position: "대리", department: "물류" })));
  await t("users: 화주가 연동 운송사 직원 문서 고치기 거절", () => assertFails(updateDoc(doc(as("shipS2"), "users/userA"), { position: "대리" })));
  await t("users: 기사가 동료 문서 고치기 거절", () => assertFails(updateDoc(doc(DA, "users/userA2"), { memo: "x" })));
  await t("users: 같은 회사 관리자 기사 삭제", () => assertSucceeds(deleteDoc(doc(AA, "users/drvA2"))));
  await t("users: 새 가입(승인 대기)은 아무 회사로나", () => assertSucceeds(setDoc(doc(as("newbie"), "users/newbie"), { companyName: B_CO, approved: false, role: "user" })));
  await t("users: 최고관리자 전체 목록", () => assertSucceeds(getDocs(collection(M, "users"))));

  // ── userProfiles ──
  await t("userProfiles: 같은 회사 동료 한 건", () => assertSucceeds(getDoc(doc(UA, "userProfiles/userA2"))));
  await t("userProfiles: 다른 회사 한 건 거절", () => assertFails(getDoc(doc(UA, "userProfiles/userB"))));
  await t("userProfiles: 전체 목록 거절", () => assertFails(getDocs(collection(UA, "userProfiles"))));
  await t("userProfiles: 다른 회사 사람 프로필 쓰기 거절", () => assertFails(setDoc(doc(UA, "userProfiles/userB"), { cardImageUrl: "x" }, { merge: true })));
  await t("userProfiles: 기사는 동료 프로필 못 읽음", () => assertFails(getDoc(doc(DA, "userProfiles/userA2"))));
  await t("userProfiles: 최고관리자 목록", () => assertSucceeds(getDocs(collection(M, "userProfiles"))));

  // ── systemConfig ──
  await t("systemConfig: 직원이 분리 스위치 끄기 거절", () => assertFails(setDoc(doc(AA, "systemConfig/tenancy"), { serverFilter: false }, { merge: true })));
  await t("systemConfig: 우리 회사 dataVersion 칸 갱신", () => assertSucceeds(setDoc(doc(AA, "systemConfig/dataVersion"), { [A_CO]: 2 }, { merge: true })));
  await t("systemConfig: 다른 회사 dataVersion 칸 갱신 거절", () => assertFails(setDoc(doc(AA, "systemConfig/dataVersion"), { [B_CO]: 2 }, { merge: true })));
  await t("systemConfig: 최고관리자 스위치 변경", () => assertSucceeds(setDoc(doc(M, "systemConfig/tenancy"), { serverFilter: true }, { merge: true })));

  // ── 메신저 ──
  await t("chat_rooms: 참여자 목록(array-contains)", () => assertSucceeds(getDocs(query(collection(UA, "chat_rooms"), where("members", "array-contains", "userA")))));
  await t("chat_rooms: 남의 방 읽기 거절", () => assertFails(getDoc(doc(UB, "chat_rooms/rA"))));
  await t("chat_messages: 참여자 방 메시지 목록(roomId 조건)", () => assertSucceeds(getDocs(query(collection(UA2, "chat_messages"), where("roomId", "==", "rA"), limit(300)))));
  await t("chat_messages: 다른 회사가 방 메시지 목록 거절", () => assertFails(getDocs(query(collection(UB, "chat_messages"), where("roomId", "==", "rA")))));
  await t("chat_messages: 다른 회사가 메시지 한 건 거절", () => assertFails(getDoc(doc(UB, "chat_messages/mA"))));
  await t("chat_messages: 남의 방에 메시지 넣기 거절", () => assertFails(addDoc(collection(UB, "chat_messages"), { roomId: "rA", senderUid: "userB", text: "x" })));
  await t("chat_messages: 다른 사람 이름으로 보내기 거절", () => assertFails(addDoc(collection(UA, "chat_messages"), { roomId: "rA", senderUid: "userA2", text: "x" })));
  await t("chat_messages: 참여자 보내기", () => assertSucceeds(addDoc(collection(UA, "chat_messages"), { roomId: "rA", senderUid: "userA", text: "안녕" })));
  await t("chat_profiles: 다른 회사 프로필 목록 거절", () => assertFails(getDocs(query(collection(UB, "chat_profiles"), where("company", "==", A_CO)))));
  await t("chat_profiles: 같은 회사 프로필 목록", () => assertSucceeds(getDocs(query(collection(UA, "chat_profiles"), where("company", "==", A_CO)))));
  await t("chat_profiles: 내 프로필 회사를 남의 회사로 거절", () => assertFails(setDoc(doc(UA, "chat_profiles/userA"), { uid: "userA", company: B_CO })));

  // ── 운송사·화주사 신청서 ──
  await t("transportApplications: 우리 회사 목록", () => assertSucceeds(getDocs(query(collection(UA, "transportApplications"), where("companyName", "==", A_CO)))));
  await t("transportApplications: 다른 회사 신청서(직인) 읽기 거절", () => assertFails(getDoc(doc(UB, "transportApplications/tA"))));
  await t("transportApplications: 전체 목록 거절", () => assertFails(getDocs(collection(UA, "transportApplications"))));
  await t("transportApplications: 연동 화주 → 연동 운송사 정보", () => assertSucceeds(getDoc(doc(SS, "transportApplications/tA"))));
  await t("transportApplications: 다른 회사 신청서 삭제 거절", () => assertFails(deleteDoc(doc(AB, "transportApplications/tA"))));
  await t("transportApplications: 우리 회사가 스스로 승인 상태 바꾸기 거절", () => assertFails(updateDoc(doc(AA, "transportApplications/tA"), { status: "rejected" })));
  await t("transportApplications: 우리 회사 직인 바꾸기", () => assertSucceeds(updateDoc(doc(AA, "transportApplications/tA"), { 직인이미지: "data:y" })));
  await t("companyApplications: 연동 받은 운송사 목록", () => assertSucceeds(getDocs(query(collection(AA, "companyApplications"), where("linkedTransportCompany.companyName", "==", A_CO)))));
  await t("companyApplications: 다른 운송사 목록 거절", () => assertFails(getDocs(query(collection(AB, "companyApplications"), where("linkedTransportCompany.companyName", "==", A_CO)))));
  await t("companyApplications: 전체 목록 거절", () => assertFails(getDocs(collection(AA, "companyApplications"))));

  // ── 기사 기록(잠금 후) ──
  await t("gps_tracks: 우리 회사 목록(companyName 조건)", () => assertSucceeds(getDocs(query(collection(AA, "gps_tracks"), where("companyName", "==", A_CO)))));
  await t("gps_tracks: 다른 회사 목록 거절", () => assertFails(getDocs(query(collection(AB, "gps_tracks"), where("companyName", "==", A_CO)))));
  await t("gps_tracks: 회사 조건 없는 목록 거절", () => assertFails(getDocs(collection(AB, "gps_tracks"))));
  await t("gps_tracks: 기사 본인 기록(driverId 조건)", () => assertSucceeds(getDocs(query(collection(DA, "gps_tracks"), where("driverId", "==", "drvA")))));
  await t("gps_tracks: 다른 회사 문서 한 건 거절", () => assertFails(getDoc(doc(AB, "gps_tracks/gA"))));
  await t("gps_tracks: 다른 회사 이름으로 쓰기 거절", () => assertFails(setDoc(doc(AB, "gps_tracks/x"), { companyName: A_CO, lat: 1 })));
  await t("gps_tracks: 다른 회사 문서 고치기 거절", () => assertFails(updateDoc(doc(AB, "gps_tracks/gA"), { lat: 9 })));
  await t("attendance: 다른 회사 근태 거절", () => assertFails(getDocs(query(collection(AB, "attendance"), where("companyName", "==", A_CO)))));
  await t("attachments: 다른 회사 오더 첨부 목록 거절", () => assertFails(getDocs(collection(UB, "orders/oA/attachments"))));
  await t("attachments: 우리 회사 오더 첨부 목록", () => assertSucceeds(getDocs(collection(UA, "orders/oA/attachments"))));

  // ── 기록·플랫폼 ──
  await t("sessionLogs: 직원 열람 거절", () => assertFails(getDocs(collection(UA, "sessionLogs"))));
  await t("sessionLogs: 남의 이름으로 기록 거절", () => assertFails(addDoc(collection(UA, "sessionLogs"), { uid: "userB", event: "login" })));
  await t("loginSessions: 다른 회사 로그인 기록 거절", () => assertFails(getDocs(query(collection(AB, "loginSessions"), where("companyName", "==", A_CO)))));
  await t("loginSessions: 우리 회사 로그인 기록", () => assertSucceeds(getDocs(query(collection(AA, "loginSessions"), where("companyName", "==", A_CO)))));
  await t("loginSessions: 다른 회사 로그인 끊기 거절", () => assertFails(updateDoc(doc(AB, "loginSessions/lA"), { active: false })));
  await t("landingInquiries: 운송사 직원 열람 거절", () => assertFails(getDocs(collection(AA, "landingInquiries"))));
  await t("companyPlans: 다른 회사 요금제 거절", () => assertFails(getDoc(doc(AB, "companyPlans/" + A_CO))));
  await t("companyPlans: 우리 회사 요금제", () => assertSucceeds(getDoc(doc(AA, "companyPlans/" + A_CO))));
  await t("companyRoleOverrides: 다른 회사 권한 설정 거절", () => assertFails(getDoc(doc(AB, "companyRoleOverrides/" + A_CO))));
  await t("publicCompanies: 다른 회사 항목 덮어쓰기 거절", () => assertFails(setDoc(doc(AB, "publicCompanies/" + A_CO), { companyName: B_CO })));
  await t("notices: 화주 → 연동 운송사 화주 공지", () => assertSucceeds(getDocs(query(collection(SS, "notices"), where("audience", "==", "shipper"), where("companyName", "==", A_CO)))));
  await t("notices: 화주 → 연동 안 된 운송사 화주 공지 거절", () => assertFails(getDocs(query(collection(ST, "notices"), where("audience", "==", "shipper"), where("companyName", "==", A_CO)))));
  await t("inquiries: 문의 받은 운송사 열람", () => assertSucceeds(getDocs(query(collection(AA, "inquiries"), where("transportCompany", "==", A_CO)))));
  await t("inquiries: 다른 운송사 열람 거절", () => assertFails(getDocs(query(collection(AB, "inquiries"), where("transportCompany", "==", A_CO)))));
  await t("arPayments: 다른 회사 입금 거절", () => assertFails(getDocs(query(collection(AB, "arPayments"), where("company", "==", A_CO)))));
  await t("arPayments: 우리 회사 입금", () => assertSucceeds(getDocs(query(collection(AA, "arPayments"), where("company", "==", A_CO)))));
  await t("multiRateSheets: 다른 회사 단가표 거절", () => assertFails(getDoc(doc(AB, "multiRateSheets/mA"))));
  await t("sheetRegistry: 직원이 시트 주인 기록 쓰기 거절(서버만)", () => assertFails(setDoc(doc(AA, "sheetRegistry/sheet123"), { companyName: A_CO })));
  await t("sheetRegistry: 직원 읽기 거절", () => assertFails(getDoc(doc(AA, "sheetRegistry/sheet123"))));
  await t("hubDevices: 운송사 직원 기기 쓰기 거절", () => assertFails(setDoc(doc(AA, "hubDevices/someone"), { id: "dev" })));
  await t("공용 규칙: 모르는 컬렉션 다른 회사 문서 읽기 거절", () => assertFails(getDoc(doc(AB, "fooUnknown/fA"))));
  await t("공용 규칙: 모르는 컬렉션 우리 회사 문서 읽기", () => assertSucceeds(getDoc(doc(AA, "fooUnknown/fA"))));
  await t("공용 규칙: 모르는 컬렉션 다른 회사 이름으로 쓰기 거절", () => assertFails(setDoc(doc(AB, "fooUnknown/x"), { companyName: A_CO })));
  await t("공용 규칙: 모르는 컬렉션 전체 목록 거절", () => assertFails(getDocs(collection(AA, "fooUnknown"))));

  // ── 잠금 스위치 전(예전 동작 유지 확인) ──
  await env.clearFirestore();
  await seed(false);
  await t("잠금 전: 직원 명부는 그래도 회사별", () => assertFails(getDoc(doc(as("userB"), "users/userA2"))));
  await t("잠금 전: 기사 기록은 예전처럼 열림(스위치 켜야 분리)", () => assertSucceeds(getDocs(collection(as("adminB"), "gps_tracks"))));

  await env.cleanup();
  console.log(out.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
