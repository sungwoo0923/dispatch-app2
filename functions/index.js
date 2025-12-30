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
