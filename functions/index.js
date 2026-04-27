import * as functions from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import fetch from "node-fetch";

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

// 🔥 users 컬렉션에서 fcmToken 전부 수집
async function getAllTokens() {
  const snap = await db.collection("users").get();
  const tokens = [];
  snap.docs.forEach((d) => {
    const token = d.data().fcmToken;
    if (token) tokens.push(token);
  });
  return tokens;
}

/* ==============================
   🔔 신규 오더 알림
============================== */
export const notifyNewDispatch =
  functions.firestore
    .document("{col}/{dispatchId}")
    .onCreate(async (snap, context) => {
      const { col } = context.params;
      if (!["dispatch", "orders"].includes(col)) return;

      const data = snap.data();
      if (!data) return;

      const tokens = await getAllTokens();
      if (!tokens.length) {
        console.log("🚫 FCM 토큰 없음");
        return;
      }

      await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: "📦 신규 오더 등록",
          body: `${data["거래처명"] || ""} ${data["상차지명"] || "-"} → ${data["하차지명"] || "-"}`,
        },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      });

      console.log("✅ 신규 오더 알림 완료");
    });

/* ==============================
   🚚 배차완료 알림
============================== */
export const notifyDispatchDone =
  functions.firestore
    .document("{col}/{dispatchId}")
    .onUpdate(async (change, context) => {
      const { col } = context.params;
      if (!["dispatch", "orders"].includes(col)) return;

      const before = change.before.data();
      const after = change.after.data();
      if (!before || !after) return;

      // 차량번호가 새로 생긴 경우만
      const prevCar = String(before["차량번호"] || "").trim();
      const nextCar = String(after["차량번호"] || "").trim();
      if (prevCar || !nextCar) return;

      const tokens = await getAllTokens();
      if (!tokens.length) return;

      await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: "🚚 배차완료",
          body: `${after["거래처명"] || ""} ${after["상차지명"] || "-"} → ${after["하차지명"] || "-"}\n${after["기사명"] || ""} (${nextCar})`,
        },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      });

      console.log("✅ 배차완료 알림 완료");
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