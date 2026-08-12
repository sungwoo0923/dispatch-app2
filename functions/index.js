import * as functions from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
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
  const area = req.query.area || "01";
  const key = "F251130200";
  const endpoints = [
    `https://www.opinet.co.kr/api/avgSidoPrice.do?out=json&code=${key}&area=${area}`,
    `https://www.opinet.co.kr/api/avgSidoPrice.do?out=json&code=${key}`,
    `https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${key}`,
  ];
  for (const url of endpoints) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 3000);
      const response = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);
      if (!response.ok) continue;
      const data = await response.json();
      const oil = data?.RESULT?.OIL;
      if (Array.isArray(oil) && oil.length > 0) {
        return res.status(200).json(data);
      }
    } catch (err) {
      console.warn("🔥 Fuel API endpoint 실패:", err?.message || err);
    }
  }
  // api/fuel.js와 동일하게, 모든 endpoint 실패 시 "정보 없음" 대신 최근 전국 평균가 반환
  return res.status(200).json({
    RESULT: {
      OIL: [
        { PRODNM: "고급휘발유", PRICE: 2020, DIFF: 0 },
        { PRODNM: "휘발유", PRICE: 1748, DIFF: 0 },
        { PRODNM: "경유", PRICE: 1623, DIFF: 0 },
        { PRODNM: "LPG(부탄)", PRICE: 986, DIFF: 0 },
      ],
    },
    _fallback: true,
  });
});

/* ==============================
   🗑️ 첨부파일 6개월 경과 자동삭제
   — 매일 실행되며, 등록(createdAt) 후 6개월이 지난 첨부파일 중
   사용자가 "잠금"을 걸어두지 않은(잠금 !== true) 파일만 삭제한다.
   잠긴 파일은 아무리 오래돼도 이 정리에서 제외된다.
============================== */
export const cleanupOldAttachments = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async () => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);

    const snap = await db
      .collectionGroup("attachments")
      .where("createdAt", "<", cutoff)
      .get();

    const countByParent = new Map();
    let deleted = 0;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (data?.잠금 === true) continue;
      await docSnap.ref.delete();
      deleted++;
      const parentRef = docSnap.ref.parent.parent;
      if (parentRef) {
        countByParent.set(parentRef.path, (countByParent.get(parentRef.path) || 0) + 1);
      }
    }

    for (const [path, count] of countByParent) {
      try {
        await db.doc(path).update({ attachCount: FieldValue.increment(-count) });
      } catch (e) {
        console.warn("attachCount 갱신 실패(무시):", path, e?.message || e);
      }
    }

    console.log(`🗑️ 6개월 경과 첨부파일 자동삭제 완료: ${deleted}건`);
  });

/* ==============================
   💬 배차마당(cafeOrders) 1:1 대화 3개월 경과 자동삭제
   — 매일 실행되며, cafeOrders/{orderId}/chat 서브컬렉션의 메시지 중
   생성(createdAt) 후 3개월이 지난 메시지를 삭제한다.
============================== */
export const cleanupOldCafeChats = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async () => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);

    const snap = await db
      .collectionGroup("chat")
      .where("createdAt", "<", cutoff)
      .get();

    let deleted = 0;
    for (const docSnap of snap.docs) {
      await docSnap.ref.delete();
      deleted++;
    }

    console.log(`💬 3개월 경과 배차마당 대화 자동삭제 완료: ${deleted}건`);
  });