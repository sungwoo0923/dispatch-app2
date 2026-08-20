// ⚠️ ESM(import/export) 대신 CommonJS(require/exports)로 작성한다 — 여러
// 사용자 환경(Node 버전·firebase-tools 버전 조합)에서 ESM 함수 코드베이스를
// "require(esm)" 방식으로 동기 로드하려다 실패하는 사례(Functions codebase
// could not be analyzed successfully)가 있어, 어떤 환경에서도 안정적으로
// 동작하는 CommonJS로 통일한다.
const functions = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const fetch = require("node-fetch");

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
exports.notifyNewDispatch =
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
exports.notifyDispatchDone =
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
exports.fuel = functions.https.onRequest(async (req, res) => {
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
   ⏰ 미배차 임박 자동 알림
   — 5분마다 실행. 상차 30분 전까지 배차중(기사 미배정)인 오더를 찾아,
   등록한 담당자에게 자동으로 푸시알림을 보낸다. 문자(SMS)는 이 프로젝트에
   유료 SMS 게이트웨이 연동이 없어(모든 "문자보내기"가 sms: 링크로 휴대폰
   문자 앱을 열어주기만 하는 방식) 서버에서 자동으로 보낼 수 없다 — 대신
   이미 갖춰져 있는 FCM 푸시알림으로 구현한다. 같은 오더에 중복 발송하지
   않도록 urgentPushSentAt을 찍어 마킹해둔다.
============================== */
function normalizeTimeToHHMM(t) {
  if (!t) return "";
  let s = String(t).trim();
  s = s.replace("시 ", ":").replace("시", ":").replace("분", "");
  if (/:\s*$/.test(s)) s += "00";
  if (/^\d{1,2}:\d{2}$/.test(s)) return s.padStart(5, "0");
  const m = s.match(/(오전|오후)\s*(\d{1,2}):?(\d{2})?/);
  if (!m) return "";
  let [, ampm, hh, mm] = m;
  mm = mm ?? "00";
  hh = parseInt(hh, 10);
  if (ampm === "오후" && hh < 12) hh += 12;
  if (ampm === "오전" && hh === 12) hh = 0;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

exports.notifyUnassignedUrgent = functions.pubsub
  .schedule("every 5 minutes")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const nowMs = Date.now();
    const nowKst = new Date(nowMs + 9 * 60 * 60 * 1000);
    const todayStr = nowKst.toISOString().slice(0, 10);

    // users 컬렉션은 작아서 매 실행마다 전부 불러와 이메일/uid → fcmToken 맵을 만든다
    // (PC의 userNameMap 조회와 동일한 방식 — 오더별로 매번 쿼리하지 않는다).
    const usersSnap = await db.collection("users").get();
    const tokenByKey = new Map();
    usersSnap.docs.forEach((d) => {
      const data = d.data() || {};
      if (!data.fcmToken) return;
      tokenByKey.set(d.id, data.fcmToken);
      if (data.email) tokenByKey.set(String(data.email).trim().toLowerCase(), data.fcmToken);
    });

    let sent = 0;
    for (const col of ["dispatch", "orders"]) {
      let snap;
      try {
        snap = await db.collection(col)
          .where("배차상태", "==", "배차중")
          .where("상차일", "==", todayStr)
          .get();
      } catch (e) {
        console.warn(`⏰ ${col} 조회 실패:`, e?.message || e);
        continue;
      }

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        if (data.urgentPushSentAt) continue; // 이미 이 오더는 알림을 보냈음

        const t24 = normalizeTimeToHHMM(data["상차시간"]);
        if (!t24) continue;
        const dt = new Date(`${data["상차일"]}T${t24}:00+09:00`);
        const diffMin = (dt.getTime() - nowMs) / 60000;
        if (diffMin <= 0 || diffMin > 30) continue; // 30분 이내로 임박한 것만

        const creatorRaw =
          data["등록자명"] || data["createdByName"] || data["등록자"] ||
          data["createdByEmail"] || data["createdBy"] || data["작성자"] || "";
        if (!creatorRaw) continue;

        const token = tokenByKey.get(creatorRaw) || tokenByKey.get(String(creatorRaw).trim().toLowerCase());
        if (!token) continue;

        try {
          await messaging.send({
            token,
            notification: {
              title: "⏰ 미배차 임박",
              body: `${data["거래처명"] || ""} ${data["상차지명"] || "-"} → ${data["하차지명"] || "-"} (${data["상차시간"] || ""} 상차 예정, 아직 미배차)`,
            },
            android: { priority: "high" },
            apns: { payload: { aps: { sound: "default" } } },
          });
          sent++;
        } catch (e) {
          console.warn("⏰ 미배차 임박 알림 발송 실패:", e?.message || e);
        }

        await docSnap.ref.update({ urgentPushSentAt: FieldValue.serverTimestamp() }).catch(() => {});
      }
    }

    console.log(`⏰ 미배차 임박 자동 알림 체크 완료 (발송 ${sent}건)`);
  });

/* ==============================
   🗑️ 첨부파일 6개월 경과 자동삭제
   — 매일 실행되며, 등록(createdAt) 후 6개월이 지난 첨부파일 중
   사용자가 "잠금"을 걸어두지 않은(잠금 !== true) 파일만 삭제한다.
   잠긴 파일은 아무리 오래돼도 이 정리에서 제외된다.
============================== */
exports.cleanupOldAttachments = functions.pubsub
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