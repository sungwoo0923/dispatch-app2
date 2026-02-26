/**
 * ============================================================
 * Firebase Cloud Functions - Dispatch Notification System (v1)
 * ============================================================
 */

import * as functions from "firebase-functions";
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
// 🔑 모든 유저 FCM 토큰 수집
// ============================================================

async function getAllTokens() {
  const snap = await db.collection("users").get();
  return snap.docs
    .map((d) => d.data().fcmToken)
    .filter(Boolean);
}

// ============================================================
// 🚨 1. 긴급 오더 생성 즉시 알림 (v1)
// ============================================================

export const notifyUrgentDispatchOnCreate =
  functions.firestore
    .document("dispatch/{dispatchId}")
    .onCreate(async (snap, context) => {

      const data = snap.data();
      const dispatchId = context.params.dispatchId;

      if (!data || data.긴급 !== true) return;
      if (data.urgentAlertSent === true) return;

      const tokens = await getAllTokens();
      if (!tokens.length) {
        console.log("🚫 FCM 토큰 없음");
        return;
      }

      console.log("🚨 긴급 오더 감지:", dispatchId);

      await messaging.sendMulticast({
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

      await snap.ref.update({
        urgentAlertSent: true,
      });

      console.log("✅ 긴급 오더 알림 발송 완료:", dispatchId);
    });

// ============================================================
// ⛽ 2. 유가 조회 Proxy API (v1)
// ============================================================

export const fuel = functions.https.onRequest(async (req, res) => {
  try {
    const area = req.query.area || "01";
    const key = "F251130200";

    const url = `https://www.opinet.co.kr/api/avgSidoPrice.do?out=json&code=${key}&area=${area}`;

    const response = await fetch(url);
    const data = await response.json();

    res.status(200).json(data);
  } catch (err) {
    console.error("🔥 Fuel API Error:", err);
    res.status(500).json({ error: "Fuel fetch failed" });
  }
});