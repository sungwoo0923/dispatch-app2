// 사내메신저 · 출퇴근기록 · 사내메일 가상 데이터 (에뮬레이터 전용 — seed.mjs 다음에 실행)
//  node gw-seed.mjs        → 메신저 방·대화, 메일함, 이번 달 근태 기록
//  node gw-seed.mjs today  → 오늘 김도윤 출근 기록만 지운다(출근하기 버튼 영상을 다시 찍을 때)
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const admin = require("firebase-admin"); admin.initializeApp({ projectId: "demo-kpflow" });
const db = admin.firestore(), auth = admin.auth();
const CO = "한결로지스";
const TS = (msAgo) => admin.firestore.Timestamp.fromMillis(Date.now() - msAgo);
const MIN = 60e3, H = 3600e3;
const U = {};
for (const [k, n, p, t] of [["kim", "김도윤", "팀장", "배차팀"], ["lee", "이서연", "대리", "배차팀"], ["park", "박지훈", "주임", "배차팀"], ["jung", "정하늘", "사원", "배차팀"], ["choi", "최영민", "이사", "경영지원"], ["ceo", "정대현", "대표이사", "임원"]]) {
  U[k] = { uid: (await auth.getUserByEmail(`${k}@hangyeol.demo`)).uid, name: n, position: p, team: t, email: `${k}@hangyeol.demo` };
}
// 근태 화면은 브라우저 시계를 평일 아침(ATT_NOW)으로 맞춰 찍는다(gw-att.mjs와 같은 값)
export const ATT_NOW = Date.parse(process.env.GW_ATT_NOW || "2026-11-09T08:52:00+09:00");
const kstDate = (ms = Date.now()) => new Date(ms + 9 * H).toISOString().slice(0, 10);

if (process.argv[2] === "today") {
  await db.doc(`attendance/${kstDate(ATT_NOW)}_${U.kim.uid}`).delete().catch(() => {});
  console.log("cleared today kim"); process.exit(0);
}

// ---------- 메신저 ----------
for (const col of ["chat_rooms", "chat_messages"]) { const s = await db.collection(col).get(); for (const d of s.docs) await d.ref.delete(); }
for (const u of Object.values(U)) {
  await db.doc(`chat_profiles/${u.uid}`).set({ uid: u.uid, email: u.email, company: CO, name: u.name, position: u.position, statusMsg: "", photo: "", phone: "010-0000-0000" }, { merge: true });
}
await db.doc(`chat_profiles/${U.lee.uid}`).set({ statusMsg: "오늘 인천 상차 담당" }, { merge: true });
await db.doc(`chat_profiles/${U.park.uid}`).set({ statusMsg: "외근 중 · 평택" }, { merge: true });

const prof = (list) => Object.fromEntries(list.map((u) => [u.uid, { name: u.name, photo: "" }]));
async function room(id, { type, name = "", members, msgs, unread = 0 }) {
  const uids = members.map((u) => u.uid);
  let last = null;
  for (const [i, m] of msgs.entries()) {
    const from = m.from;
    const data = {
      roomId: id, type: m.type || "text", text: m.text || "", senderUid: from.uid, senderName: from.name, senderPhoto: "",
      createdAt: TS(m.ago), readBy: m.readAll === false ? [from.uid] : uids, totalMembers: uids.length, memberUids: uids,
      ...(m.extra || {}),
    };
    if (m.mentions) data.mentions = m.mentions.map((u) => u.uid);
    await db.doc(`chat_messages/${id}-m${String(i).padStart(2, "0")}`).set(data);
    last = { m, data };
  }
  const lm = last.m;
  const lastMsg = lm.type === "order" ? `[오더] ${lm.extra.order.상차지명} → ${lm.extra.order.하차지명}` : lm.type === "file" ? `[파일] ${lm.extra.fileName}` : lm.text;
  await db.doc(`chat_rooms/${id}`).set({
    type, ...(name ? { name } : {}), members: uids, memberProfiles: prof(members), company: CO, createdBy: members[0].uid,
    lastMsg, lastAt: TS(lm.ago), lastSenderUid: lm.type === "system" ? "" : lm.from.uid,
    joinedAt: Object.fromEntries(uids.map((u) => [u, TS(30 * 24 * H)])),
    lastRead: Object.fromEntries(uids.map((u) => [u, u === U.kim.uid && unread ? TS(lm.ago + 60 * MIN) : TS(0)])),
    unreadCount: Object.fromEntries(uids.map((u) => [u, u === U.kim.uid ? unread : 0])),
  });
}
const order = {
  id: "demo-share-1", col: "orders", 상차일: kstDate(), 상차시간: "14:00", 상차지명: "대성식품 1공장", 상차지주소: "인천 서구 오류동 1546",
  하차일: kstDate(), 하차시간: "18:00", 하차지명: "평택 포승 물류센터", 하차지주소: "경기 평택시 포승읍 평택항로 268", 거래처명: "대성식품",
  화물내용: "냉장 식품 16파레트", 차량종류: "윙바디", 차량톤수: "11톤", 차량번호: "경기90사4127", 이름: "박정훈", 배차상태: "배차완료", 청구운임: "620000", 기사운임: "540000", 지급방식: "계산서",
};
await room("demo-room-team", {
  type: "group", name: "배차팀", members: [U.kim, U.lee, U.park, U.jung], msgs: [
    { from: U.kim, type: "system", text: "김도윤님이 이서연, 박지훈, 정하늘님을 초대했습니다.", ago: 26 * H },
    { from: U.lee, text: "오늘 인천 오류동 상차 3건 있습니다. 11시 전에 기사님 확정할게요.", ago: 52 * MIN },
    { from: U.park, text: "평택 포승 하차 대기가 길어서 30분 정도 늦어진다고 기사님 연락 왔어요.", ago: 47 * MIN },
    { from: U.lee, type: "order", text: "", extra: { order }, ago: 41 * MIN },
    { from: U.jung, type: "file", text: "11월_거래처_운임표.xlsx", extra: { fileName: "11월_거래처_운임표.xlsx", fileSize: 48213, fileUrl: "#" }, ago: 33 * MIN },
    { from: U.jung, text: "이번 달 운임표 올려 두었습니다.", ago: 33 * MIN - 20e3 },
  ],
});
await room("demo-room-choi", { type: "dm", members: [U.kim, U.choi], unread: 1, msgs: [
  { from: U.kim, text: "대성식품 운임 변경 품의 올렸습니다.", ago: 2 * H },
  { from: U.choi, text: "확인했습니다. 오후에 결재할게요.", ago: 18 * MIN },
] });
await room("demo-room-ceo", { type: "dm", members: [U.kim, U.ceo], msgs: [
  { from: U.ceo, text: "이번 주 매출 보고 자료 부탁해요.", ago: 3 * H },
  { from: U.kim, text: "네 금요일 오전까지 올리겠습니다.", ago: 3 * H - 5 * MIN },
] });
await room("demo-room-all", { type: "group", name: "한결로지스 전체", members: Object.values(U), unread: 2, msgs: [
  { from: U.choi, type: "system", text: "최영민님이 대화상대를 초대했습니다.", ago: 40 * 24 * H },
  { from: U.choi, text: "11월 정기 차량 점검은 다음 주 화요일입니다.", ago: 5 * H },
  { from: U.ceo, text: "이번 달도 다들 수고 많습니다.", ago: 4 * H },
] });
await room("demo-room-jung", { type: "dm", members: [U.kim, U.jung], msgs: [
  { from: U.jung, text: "팀장님 내일 연차 결재 부탁드립니다.", ago: 26 * H },
  { from: U.kim, text: "승인했어요. 잘 쉬고 와요.", ago: 25 * H },
] });

// ---------- 사내메일 ----------
{ const s = await db.collection("internalMails").get(); for (const d of s.docs) await d.ref.delete(); }
const mail = async (id, { from, to, cc = [], subject, body, ago, read = false, important = false, kind = "mail" }) => db.doc(`internalMails/${id}`).set({
  company: CO, fromUid: from.uid, fromEmail: from.email, fromName: from.name, subject, body, images: [], kind, important, status: "sent", at: TS(ago),
  readBy: read ? to.map((u) => u.uid) : [], deletedBy: [], starredBy: [], to: [...to, ...cc].map((u) => u.uid), toNames: to.map((u) => u.name), cc: cc.map((u) => u.uid), ccNames: cc.map((u) => u.name),
});
await mail("demo-mail-1", { from: U.choi, to: [U.kim, U.lee, U.park, U.jung], subject: "11월 정기 차량 점검 일정 안내", important: true, ago: 35 * MIN,
  body: "배차팀 여러분 안녕하세요.\n\n11월 정기 차량 점검을 아래와 같이 진행합니다.\n\n· 일시: 11월 11일(화) 오전 9시 ~ 12시\n· 장소: 평택 포승 정비소\n· 대상: 지입 차량 전체\n\n해당 시간에는 배차를 피해 주세요.\n\n경영지원 최영민 드림" });
await mail("demo-mail-2", { from: U.lee, to: [U.kim], subject: "대성식품 인천→평택 운임 변경 건 공유", ago: 2 * H,
  body: "팀장님, 대성식품 물류팀과 통화했습니다.\n11톤 기준 580,000원에서 620,000원으로 조정하기로 했고 품의 올려 두었습니다.\n\n이서연 드림" });
await mail("demo-mail-3", { from: U.ceo, to: [U.kim, U.choi], subject: "10월 경영 보고 잘 봤습니다", read: true, ago: 26 * H,
  body: "매익률이 많이 좋아졌네요. 다음 달도 이 흐름 이어 갑시다." });
await mail("demo-mail-4", { from: U.park, to: [U.kim], subject: "평택 포승 하차 대기시간 정리", read: true, ago: 30 * H,
  body: "최근 2주간 하차 대기시간을 정리했습니다. 평균 48분입니다." });
await mail("demo-mail-5", { from: U.jung, to: [U.kim], subject: "11/14 연차 사용 안내", read: true, ago: 50 * H, body: "11월 14일 연차 사용합니다. 인수인계는 박지훈 주임님께 드렸습니다." });
await mail("demo-mail-6", { from: U.choi, to: Object.values(U).filter((u) => u !== U.choi), subject: "연말정산 서류 제출 안내", read: true, ago: 72 * H, body: "12월 5일까지 경영지원팀으로 제출해 주세요." });

// ---------- 근태(이번 달 · 지난달) ----------
const iso = (ds, hhmm) => new Date(`${ds}T${hhmm}:00+09:00`).toISOString();
let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const today = kstDate(ATT_NOW);
const staff = Object.values(U);
for (const u of staff) await db.doc(`users/${u.uid}`).set({ workStartTime: "09:00", workEndTime: "18:00" }, { merge: true });
const special = { [`${U.jung.uid}`]: { 3: "연차" }, [`${U.park.uid}`]: { 5: "외근", 9: "외근" }, [`${U.lee.uid}`]: { 7: "오후반차" } };
for (let back = 40; back >= 1; back--) {
  const ms = ATT_NOW - back * 24 * H; const ds = kstDate(ms); const wd = new Date(ds + "T12:00:00+09:00").getDay();
  if (wd === 0 || wd === 6) continue;
  for (const [i, u] of staff.entries()) {
    const st = special[u.uid]?.[back] || "출근";
    const inM = 8 * 60 + 34 + Math.floor(rnd() * 24) + (back === 6 && i === 3 ? 18 : 0);
    const outM = 18 * 60 + 2 + Math.floor(rnd() * 50);
    const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const auto = rnd() < 0.55;
    await db.doc(`attendance/${ds}_${u.uid}`).set({
      uid: u.uid, name: u.name, date: ds, month: ds.slice(0, 7), status: st, companyName: CO,
      ...(st === "연차" ? {} : { checkInTime: iso(ds, hh(inM)), checkOutTime: iso(ds, hh(st === "오후반차" ? 13 * 60 + 5 : outM)), source: auto ? "auto" : "manual", checkOutSource: auto ? "auto" : "manual" }),
    });
  }
}
// 오늘: 김도윤은 아직 출근 전(영상에서 출근하기를 누른다), 나머지는 출근
for (const u of staff.filter((x) => x !== U.kim)) {
  await db.doc(`attendance/${today}_${u.uid}`).set({ uid: u.uid, name: u.name, date: today, month: today.slice(0, 7), status: "출근", companyName: CO, checkInTime: iso(today, `08:${40 + staff.indexOf(u) * 3}`), source: "auto" });
}
await db.doc(`attendance/${today}_${U.kim.uid}`).delete().catch(() => {});
console.log("ok"); process.exit(0);
