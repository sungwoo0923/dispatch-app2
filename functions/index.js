import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();

const db = getFirestore();
export const checkDispatchReminder = onSchedule(
  {
    schedule: "0 * * * *",
    timeZone: "Asia/Seoul",
  },
  async () => {
    console.log("⏰ checkDispatchReminder 실행!");

    const nowKST = Date.now();
    const todayStr = new Date(nowKST).toISOString().slice(0, 10);

    const snap = await db
      .collection("dispatch")
      .where("상차일", "==", todayStr)
      .where("배차상태", "==", "배차중")
      .get();

    if (snap.empty) {
      console.log("➡ 조건 일치 없음");
      return;
    }

    const tokenSnap = await db.collection("fcmTokens").get();
    const tokens = tokenSnap.docs
      .map((d) => d.data().token || d.id)
      .filter(Boolean);

    if (!tokens.length) {
      console.log("🚫 토큰 없음");
      return;
    }

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const dispatchId = docSnap.id;

      // 🔒 중복 방지
      if (data.alert2hSent === todayStr) continue;

      const pickupTimeKST = parsePickupTime(data);
      if (!pickupTimeKST) continue;

      const diffMin = Math.floor((pickupTimeKST - nowKST) / 60000);

      if (diffMin > 0 && diffMin <= 120) {
        console.log(`🚚 임박 감지 ${dispatchId} (${diffMin}분 전)`);

        await getMessaging().sendToDevice(tokens, {
          notification: {
            title: "🚨 배차 지연 알림",
            body: `${data["상차지명"]} / ${data["상차시간"]} — 배차 미완료`,
          },
          data: {
            dispatchId,
            type: "DISPATCH_2H_REMINDER",
          },
        });

        await docSnap.ref.update({
          alert2hSent: todayStr,
        });
      }
    }

    console.log("✨ checkDispatchReminder 완료!");
  }
);
export const notifyUrgentDispatchOnCreate = onDocumentCreated(
  "dispatch/{dispatchId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const dispatchId = event.params.dispatchId;

    // 🚨 긴급 아니면 무시
    if (data.긴급 !== true) return;

    // 🔒 혹시 모를 중복 방지
    if (data.urgentAlertSent) return;

    console.log("🚨 긴급 오더 등록 감지:", dispatchId);

    // 🔑 기존과 동일한 토큰 로직
    const tokenSnap = await db.collection("fcmTokens").get();
    const tokens = tokenSnap.docs
      .map((d) => d.data().token || d.id)
      .filter(Boolean);

    if (!tokens.length) {
      console.log("🚫 토큰 없음");
      return;
    }

    // 📤 OS 알림 전송
   await getMessaging().sendEachForMulticast({
  tokens,
  notification: {
    title: "🚨 긴급 오더 등록",
    body: `${data["상차지명"]} / ${data["상차시간"]}`,
  },
  data: {
    dispatchId,
    type: "URGENT_DISPATCH_CREATED",
  },
});


    // 🔒 재전송 방지 플래그
    await snap.ref.update({
      urgentAlertSent: true,
    });

    console.log("✅ 긴급 오더 OS 알림 전송 완료");
  }
);
