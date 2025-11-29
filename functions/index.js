import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

initializeApp();
const db = getFirestore();

// ⏰ 다양한 시간 형식 처리
function parsePickupTime(data) {
  const dateStr = data["상차일"];
  const timeStr = data["상차시간"] || "";
  if (!dateStr) return null;

  // 24시간 HH:mm 형식
  if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
    return new Date(`${dateStr}T${timeStr}:00+09:00`).getTime();
  }

  // 오전/오후 형식 처리
  if (/오전|오후/.test(timeStr)) {
    const isPM = timeStr.includes("오후");
    const numbers = timeStr.replace(/[^0-9]/g, "");
    let hour = parseInt(numbers.slice(0, -2));
    const minute = parseInt(numbers.slice(-2));

    if (isPM && hour < 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;

    return new Date(`${dateStr}T${hour}:${minute}:00+09:00`).getTime();
  }

  console.log("⛔ 파싱 불가 시간 → 스킵:", timeStr);
  return null;
}

export const checkDispatchReminder = onSchedule(
  {
    schedule: "0 * * * *",
    timeZone: "Asia/Seoul",
  },
  async () => {
    console.log("⏰ checkDispatchReminder 실행!");

    const nowKST = Date.now();

    const todayStr = new Date(nowKST)
      .toISOString()
      .slice(0, 10);

    const snap = await db
      .collection("dispatch")
      .where("상차일", "==", todayStr)
      .where("배차상태", "==", "배차중")
      .get();

    if (snap.empty) return console.log("➡ 조건 일치 없음");

    const tokenSnap = await db.collection("fcmTokens").get();
    const tokens = tokenSnap.docs.map((d) => d.data().token);

    if (!tokens.length) return console.log("🚫 토큰 없음");

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const dispatchId = docSnap.id;

      const pickupTimeKST = parsePickupTime(data);
      if (!pickupTimeKST) continue;

      const diffMin = Math.floor((pickupTimeKST - nowKST) / 60000);

      if (diffMin <= 120 && diffMin > 0) {
        console.log(`🚚 임박 감지 ${dispatchId} (${diffMin}분 전)`);

        await getMessaging().sendToDevice(tokens, {
          notification: {
            title: "🚨 배차 지연 알림",
            body: `${data["상차지명"]} / ${data["상차시간"]} — 배차 미완료!`,
          },
          data: { dispatchId },
        });

        // 중복 방지 → 하지만 날짜 바뀌면 자동 초기화 👍
        await docSnap.ref.update({
          alert2hSent: todayStr,
        });
      }
    }

    console.log("✨ checkDispatchReminder 완료!");
  }
);
