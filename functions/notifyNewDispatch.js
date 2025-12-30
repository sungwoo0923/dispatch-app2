import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

initializeApp();
const db = getFirestore();

export const notifyNewDispatch = onDocumentCreated(
  {
    document: "dispatch/{dispatchId}",
    region: "asia-northeast3", // 서울 리전 권장
  },
  async (event) => {
    const data = event.data?.data();
    const dispatchId = event.params.dispatchId;

    if (!data) return;

    console.log("📦 신규 오더 생성 감지:", dispatchId);

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
