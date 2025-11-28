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
    const nowKST = now.getTime() + 9 * 60 * 60 * 1000; // KST 변환

    const todayStr = new Date(nowKST).toISOString().slice(0, 10); // YYYY-MM-DD

    const snap = await db
      .collection("dispatch")
      .where("상차일", "==", todayStr)
      .where("배차상태", "==", "배차중")
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

      if (data.alert2hSent) continue; // 중복 방지

      // 상차시간 계산
      if (!data["상차시간"]) continue;
      const pickupTimeKST = new Date(`${todayStr}T${data["상차시간"]}:00`).getTime();

      const diffMin = Math.floor((pickupTimeKST - nowKST) / (1000 * 60));

      if (diffMin <= 120 && diffMin > 0) {
        // 알림 발송
        await getMessaging().sendToDevice(tokens, {
          notification: {
            title: "🚨 배차 지연 알림",
            body: `상차 ${data["상차지명"]} / ${data["상차시간"]} — 배차 미완료!`,
          },
          data: {
            dispatchId,
          },
        });

        console.log(`📩 알림 전송: ${dispatchId}`);

        // 중복 방지 저장
        await docSnap.ref.update({
          alert2hSent: true,
        });
      }
    }

    console.log("✨ checkDispatchReminder 완료!");
  }
);
