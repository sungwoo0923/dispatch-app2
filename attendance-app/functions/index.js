const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");

initializeApp();

// src/constants/superAdmin.js와 반드시 동일하게 유지 — 클라이언트 함수 파일이
// 아니라 별도 Cloud Functions 배포 단위라 import로 공유할 수 없다.
const SUPER_ADMIN_EMAIL = "sungwoo0923@nate.com";

// notifications 문서(앱 내 알림함용, App 코드 여러 곳에서 이미 씀)가 새로
// 생기면 대상자(uid)의 users/{uid}.fcmTokens에 등록된 기기로 실제 푸시를
// 보낸다. 앱 쪽(usePushNotifications.js)은 토큰을 등록/해제만 하고, 실제
// 발송은 여기서만 이루어진다 — 이 함수가 배포되어 있지 않으면 알림함에는
// 계속 쌓이지만 기기로 푸시는 가지 않는다.
exports.sendNotificationPush = onDocumentCreated("notifications/{id}", async (event) => {
  const data = event.data?.data();
  if (!data?.uid) return;

  const db = getFirestore();
  const userSnap = await db.doc(`users/${data.uid}`).get();
  const tokens = userSnap.data()?.fcmTokens || [];
  if (tokens.length === 0) return;

  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: data.title || "KP-Work",
      body: data.message || "",
    },
    webpush: {
      fcmOptions: { link: "/" },
    },
  });

  const invalidTokens = tokens.filter((_, i) => !res.responses[i].success);
  if (invalidTokens.length > 0) {
    await db.doc(`users/${data.uid}`).update({ fcmTokens: FieldValue.arrayRemove(...invalidTokens) });
  }
});

// 회사 스코프 데이터를 담는 최상위 컬렉션들(모두 companyId 필드로 조회됨).
// 새 컬렉션을 추가할 때는 companyId 필드를 갖는 한 여기에도 추가해야
// 탈퇴 회사 완전삭제 시 함께 지워진다.
const COMPANY_SCOPED_COLLECTIONS = [
  "allowanceTemplates", "assignmentChangeRequests", "attendance", "attendanceChangeRequests", "attendanceEdits",
  "businessEntities", "centerReports", "contracts", "departments", "devices", "documents", "employeeChangeLogs",
  "historyAccessRequests", "infoChangeRequests", "inquiries", "insuranceRateElements", "insuranceRateTemplates",
  "leaveTemplates", "leaveTypes", "leaves", "payrolls", "pendingEmployees", "permissionGroupMembers",
  "permissionGroupMenus", "permissionGroups", "positions", "posts", "resignationRequests", "safetyCompletions",
  "safetyManagers", "safetyMaterials", "schedules", "shiftTemplates", "siteDevices", "siteHolidays",
  "siteInsuranceRates", "siteLeaveSettings", "siteSafetyReports", "siteVendors", "vendors", "workSites",
];

async function deleteQueryBatched(db, queryRef) {
  const snap = await queryRef.get();
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 450) {
    const batch = db.batch();
    docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return docs.map((d) => d.id);
}

// 최고관리자가 회사를 "탈퇴처리"할 때 호출하는, 그 회사의 모든 데이터를
// 되돌릴 수 없이 완전히 삭제하는 함수. Firestore 문서뿐 아니라 Firebase Auth
// 계정, Storage에 올라간 파일, 메신저 채팅방/메시지까지 전부 지운다 —
// Admin SDK로 실행되므로 firestore.rules의 영향을 받지 않는다.
exports.deleteCompanyCascade = onCall(async (request) => {
  const email = request.auth?.token?.email;
  if (!email || email.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
    throw new HttpsError("permission-denied", "최고관리자만 실행할 수 있습니다.");
  }
  const companyId = request.data?.companyId;
  if (!companyId || typeof companyId !== "string") {
    throw new HttpsError("invalid-argument", "companyId가 필요합니다.");
  }

  const db = getFirestore();

  for (const coll of COMPANY_SCOPED_COLLECTIONS) {
    await deleteQueryBatched(db, db.collection(coll).where("companyId", "==", companyId));
  }

  const userIds = await deleteQueryBatched(db, db.collection("users").where("companyId", "==", companyId));
  await deleteQueryBatched(db, db.collection("admins").where("companyId", "==", companyId));

  for (let i = 0; i < userIds.length; i += 20) {
    const chunk = userIds.slice(i, i + 20);
    await Promise.all(
      chunk.map(async (uid) => {
        await db.collection("chat_profiles").doc(uid).delete().catch(() => {});
        const notifSnap = await db.collection("notifications").where("uid", "==", uid).get();
        if (!notifSnap.empty) {
          const nb = db.batch();
          notifSnap.docs.forEach((d) => nb.delete(d.ref));
          await nb.commit();
        }
        await getAuth().deleteUser(uid).catch(() => {});
      })
    );
  }

  const roomIds = new Set();
  for (let i = 0; i < userIds.length; i += 10) {
    const chunk = userIds.slice(i, i + 10);
    await Promise.all(
      chunk.map(async (uid) => {
        const rs = await db.collection("chat_rooms").where("members", "array-contains", uid).get();
        rs.docs.forEach((d) => roomIds.add(d.id));
      })
    );
  }
  for (const roomId of roomIds) {
    await deleteQueryBatched(db, db.collection("chat_messages").where("roomId", "==", roomId));
    await db.collection("chat_rooms").doc(roomId).delete().catch(() => {});
  }

  await getStorage().bucket().deleteFiles({ prefix: `companies/${companyId}/` }).catch(() => {});

  await db.collection("companies").doc(companyId).delete();

  return { ok: true, deletedUsers: userIds.length, deletedRooms: roomIds.size };
});
