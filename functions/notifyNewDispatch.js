import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

initializeApp();
const db = getFirestore();

export const notifyNewDispatch = onDocumentCreated(
  {
    document: "{col}/{dispatchId}",
    region: "asia-northeast3",
  },
  async (event) => {
    const { col, dispatchId } = event.params;

    // ✅ dispatch / dispatch_test 둘 다 허용
    if (!["dispatch", "dispatch_test"].includes(col)) return;

    const data = event.data?.data();
    if (!data) return;

    console.log("📦 신규 오더 감지:", col, dispatchId);

    // 🔔 FCM 토큰 수집
    const tokenSnap = await db.collection("fcmTokens").get();
    const tokens = tokenSnap.docs
      .map((d) => d.data().token || d.id)
      .filter(Boolean);

    if (!tokens.length) {
      console.log("🚫 FCM 토큰 없음");
      return;
    }

    // 📣 알림 내용
    const title = "📦 신규 오더 등록";
    const body = `${data["상차지명"] || "-"} → ${data["하차지명"] || "-"}`;

    await getMessaging().sendToDevice(tokens, {
      notification: {
        title,
        body,
      },
      data: {
        type: "NEW_DISPATCH",
        dispatchId,
      },
    });

    console.log("✅ 신규 오더 알림 발송 완료");
  }
);
