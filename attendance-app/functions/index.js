const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

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
