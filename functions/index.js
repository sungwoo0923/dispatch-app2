// ======================= Cloud Functions ===========================
import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

initializeApp();
const db = getFirestore();

/**
 * 🚚 상차 2시간 전 미배차 알림
 * 매 시간 실행
 * 한국시간(UTC+9) 기준
 */
export const checkDispatchReminder = onSchedule(
  {
    schedule: "0 * * * *", // 매 정각 실행
    timeZone: "Asia/Seoul",
  },
  async () => {
    console.log("⏰ checkDispatchReminder 실행!");

    const now = new Date();
    const nowKST = new Date(now.getTime() + 9 * 60 * 60 * 1000);

    const todayStr = nowKST.toISOString().slice(0, 10); // YYYY-MM-DD

    const snap = await db
      .collection("dispatch")
      .where("상차일", "==", todayStr)
      .where("배차상태", "in", ["", "미배차", "배차중"])
      .get();

    if (snap.empty) {
      console.log("➡️ 조건에 맞는 배차 없음");
      return;
    }

    const tokensSnap = await db.collection("fcmTokens").get();
    const tokens = tokensSnap.docs.map((d) => d.data().token);

    if (tokens.length === 0) {
      console.log("🚫 저장된 토큰 없음");
      return;
    }

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const dispatchId = docSnap.id;

      // 중복 방지 필드
      if (data.alert2hSent) continue;

      const loadingTimeStr = `${todayStr}T${data["상차시간"] || "00:00"}:00`;
      const loadingTimeKST = new Date(loadingTimeStr).getTime();

      if (!loadingTimeKST) continue;

      const diffMin = Math.floor(
        (loadingTimeKST - nowKST.getTime()) / (1000 * 60)
      );

      if (diffMin <= 120 && diffMin > 0) {
        const payload = {
          notification: {
            title: "🚨 배차 지연 알림",
            body: `${data["상차지명"] || "상차지"} / ${data["상차시간"]} — 배차 미완료!`,
          },
          data: {
            dispatchId,
          },
        };

        await getMessaging().sendToDevice(tokens, payload);
        console.log(`📩 알림 전송: ${dispatchId} (${diffMin}분 전)`);

        await docSnap.ref.update({
          alert2hSent: true,
        });
      }
    }

    console.log("✨ checkDispatchReminder 완료!");
  }
);
