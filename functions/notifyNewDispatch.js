import * as functions from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

export const notifyNewDispatch =
  functions.firestore
    .document("{col}/{dispatchId}")
    .onCreate(async (snap, context) => {

      const { col, dispatchId } = context.params;

      if (!["dispatch", "dispatch_test"].includes(col)) return;

      const data = snap.data();
      if (!data) return;

      console.log("📦 신규 오더 감지:", col, dispatchId);

      const tokenSnap = await db.collection("fcmTokens").get();
      const tokens = tokenSnap.docs
        .map((d) => d.data().token || d.id)
        .filter(Boolean);

      if (!tokens.length) {
        console.log("🚫 FCM 토큰 없음");
        return;
      }

      const title = "📦 신규 오더 등록";
      const body = `${data["상차지명"] || "-"} → ${data["하차지명"] || "-"}`;

      await messaging.sendMulticast({
        tokens,
        notification: { title, body },
        data: {
          type: "NEW_DISPATCH",
          dispatchId,
        },
      });

      console.log("✅ 신규 오더 알림 발송 완료");
    });