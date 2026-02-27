import * as functions from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import fetch from "node-fetch";

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

/* ==============================
   🔔 신규 오더 알림
============================== */
export const notifyNewDispatch =
  functions.firestore
    .document("{col}/{dispatchId}")
    .onCreate(async (snap, context) => {

      const { col, dispatchId } = context.params;

      if (!["dispatch", "dispatch_test"].includes(col)) return;

      const data = snap.data();
      if (!data) return;

      const tokenSnap = await db.collection("fcmTokens").get();
      const tokens = tokenSnap.docs
        .map((d) => d.data().token || d.id)
        .filter(Boolean);

      if (!tokens.length) {
        console.log("🚫 FCM 토큰 없음");
        return;
      }

      await messaging.sendMulticast({
        tokens,
        notification: {
          title: "📦 신규 오더 등록",
          body: `${data["상차지명"] || "-"} → ${data["하차지명"] || "-"}`,
        },
        data: {
          type: "NEW_DISPATCH",
          dispatchId,
        },
      });

      console.log("✅ 신규 오더 알림 완료");
    });

/* ==============================
   ⛽ 유가 API Proxy
============================== */
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