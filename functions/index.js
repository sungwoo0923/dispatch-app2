/**
 * ============================================================
 * Firebase Cloud Functions - Dispatch Notification System
 * - 긴급 오더 즉시 알림
 * - 미배차 / 상차 임박 자동 알림 (Scheduler)
 * ============================================================
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

// ============================================================
// Firebase Admin 초기화
// ============================================================
initializeApp();

const db = getFirestore();
const messaging = getMessaging();

// ============================================================
// 공통 유틸
// ============================================================

// 🔑 모든 유저 FCM 토큰 수집
async function getAllTokens() {
  const snap = await db.collection("users").get();
  return snap.docs
    .map((d) => d.data().fcmToken)
    .filter(Boolean);
}

// 🇰🇷 오늘 날짜 KST 범위
function getTodayRangeKST() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

// ⏱ 상차일 + 상차시간 → timestamp(ms)
function parsePickupTime(data) {
  const dateVal = data.상차일;
  const timeStr = data.상차시간;

  if (!dateVal || !timeStr) return null;

  let date;
  if (dateVal instanceof Timestamp) {
    date = dateVal.toDate();
  } else {
    date = new Date(dateVal);
  }

  const match = String(timeStr).match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const h = Number(match[1]);
  const m = Number(match[2]);

  const d = new Date(date);
  d.setHours(h, m, 0, 0);

  return d.getTime();
}

// ============================================================
// 🚨 1. 긴급 오더 생성 즉시 알림
// ============================================================
export const notifyUrgentDispatchOnCreate = onDocumentCreated(
  "dispatch/{dispatchId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const dispatchId = event.params.dispatchId;

    // 🚨 긴급 오더 아니면 종료
    if (data.긴급 !== true) return;

    // 🔒 중복 방지
    if (data.urgentAlertSent === true) return;

    const tokens = await getAllTokens();
    if (!tokens.length) {
      console.log("🚫 FCM 토큰 없음");
      return;
    }

    console.log("🚨 긴급 오더 감지:", dispatchId);

    await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: "🚨 긴급 오더 등록",
        body: `${data.상차지명 || ""} → ${data.하차지명 || ""}`,
      },
      data: {
        type: "URGENT_DISPATCH_CREATED",
        dispatchId,
      },
    });

    // 🔒 재전송 방지 플래그
    await snap.ref.update({
      urgentAlertSent: true,
    });

    console.log("✅ 긴급 오더 알림 발송 완료:", dispatchId);
  }
);

// ============================================================
// ⏰ 2. 미배차 / 상차 임박 자동 알림 (매 1시간)
// ============================================================
export const checkDispatchReminder = onSchedule(
  {
    schedule: "0 * * * *", // 매 정각
    timeZone: "Asia/Seoul",
  },
  async () => {
    console.log("⏰ checkDispatchReminder 실행");

    const now = Date.now();
    const { start, end } = getTodayRangeKST();

    // 📦 오늘 상차 오더 조회
    const snap = await db
      .collection("dispatch")
      .where("상차일", ">=", start)
      .where("상차일", "<=", end)
      .get();

    if (snap.empty) {
      console.log("➡ 오늘 상차 오더 없음");
      return;
    }

    const tokens = await getAllTokens();
    if (!tokens.length) {
      console.log("🚫 FCM 토큰 없음");
      return;
    }

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const dispatchId = docSnap.id;

      // ❌ 취소 / 완료 제외
      if (data.배차상태 !== "배차중") continue;
      if (data.차량번호 && String(data.차량번호).trim()) continue;

      const pickupTime = parsePickupTime(data);
      if (!pickupTime) continue;

      const diffMin = Math.floor((pickupTime - now) / 60000);

      // ⏱ 2시간 이내 임박만
      if (diffMin <= 0 || diffMin > 120) continue;

      // 🔕 쿨타임 (1시간)
      if (data.alert2hSentAt?.toMillis) {
        const last = data.alert2hSentAt.toMillis();
        if (now - last < 1000 * 60 * 60) continue;
      }

      console.log(
        `🚚 미배차 임박 알림: ${dispatchId} (${diffMin}분 전)`
      );

      await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: "🚚 배차 지연 알림",
          body: `${data.상차지명 || ""} / ${data.상차시간} — 미배차`,
        },
        data: {
          type: "DISPATCH_2H_REMINDER",
          dispatchId,
          remainMin: String(diffMin),
        },
      });

      // 🔒 중복 방지 시간 기록
      await docSnap.ref.update({
        alert2hSentAt: FieldValue.serverTimestamp(),
      });
    }

    console.log("✨ checkDispatchReminder 완료");
  }
);
