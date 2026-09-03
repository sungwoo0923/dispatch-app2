// ⚠️ ESM(import/export) 대신 CommonJS(require/exports)로 작성한다 — 여러
// 사용자 환경(Node 버전·firebase-tools 버전 조합)에서 ESM 함수 코드베이스를
// "require(esm)" 방식으로 동기 로드하려다 실패하는 사례(Functions codebase
// could not be analyzed successfully)가 있어, 어떤 환경에서도 안정적으로
// 동작하는 CommonJS로 통일한다.
// firebase-functions v6+는 기본 진입점이 v2 API로 바뀌어 functions.firestore.document(),
// functions.pubsub.schedule() 같은 v1 스타일 트리거 함수가 사라졌다(배포 시
// "Functions codebase could not be analyzed successfully" 오류의 원인이었음).
// 이 파일 전체가 v1 스타일로 작성돼 있으므로 v1 서브패스에서 명시적으로 가져온다.
const functions = require("firebase-functions/v1");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const fetch = require("node-fetch");
const { GoogleAuth } = require("google-auth-library");

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

// 알림 종류(type)별로 각자 켜고 끌 수 있게 — users/{uid}.pushPrefs.{type}에 값이
// 명시적으로 있으면(true/false) 그 값을 그대로 따르고, 한 번도 안 건드려 값이 없으면
// PUSH_TYPES_DEFAULT_ON에 있는 종류(긴급배차/미배차)만 기본으로 켜진 것으로 취급한다 —
// 나머지(배차등록/배차완료/재배차/배차취소)는 사용자가 모바일에서 직접 켜야 온다.
const PUSH_TYPES = ["배차등록", "긴급배차", "배차완료", "재배차", "미배차", "배차취소"];
const PUSH_TYPES_DEFAULT_ON = ["긴급배차", "미배차"];
function isPushTypeEnabled(prefs, type) {
  const v = prefs?.[type];
  if (v === true || v === false) return v;
  return PUSH_TYPES_DEFAULT_ON.includes(type);
}
async function getTokensForType(type) {
  const snap = await db.collection("users").get();
  const tokens = [];
  snap.docs.forEach((d) => {
    const u = d.data();
    const token = u.fcmToken;
    if (!token) return;
    if (!isPushTypeEnabled(u.pushPrefs, type)) return;
    tokens.push(token);
  });
  return tokens;
}

// ⭐ "알림 설정은 다 켜놨는데 특정 기기(특히 아이폰)에서만 알림이 갑자기 안 뜬다"는
// 리포트의 흔한 원인 하나 — FCM 토큰이 조용히 무효화된 경우다. iOS Safari PWA는
// iOS/Safari 업데이트, 홈 화면에서 지웠다가 다시 추가, 오래 앱을 안 열어둠 등으로
// 토큰이 만료·무효화되는 일이 꽤 잦은데, sendEachForMulticast는 이런 토큰이 섞여
// 있어도 전체 호출 자체는 "성공"으로 끝나버려서(개별 토큰 실패는 응답 배열 안에만
// 조용히 담김) 지금까지는 이 실패가 로그에도 안 남고, 무효 토큰이 users 문서에
// 계속 남아있어 다음 알림에서도 똑같이 조용히 실패하는 게 반복됐다. 여기서 결과를
// 반드시 확인해 로그로 남기고, "이 토큰은 더 이상 유효하지 않다"는 응답이 온
// 토큰은 users 문서에서 지워서 다음에 앱을 열 때 saveFcmToken()이 새 토큰으로
// 자동 재등록하게 한다.
// ⚠️ "messaging/invalid-argument"는 일부러 뺐다 — 토큰 자체가 아니라 메시지
// 내용(페이로드 형식 등) 문제로도 뜰 수 있는 코드라, 여기 넣으면 멀쩡한 토큰을
// 오진단으로 지워버릴 위험이 있다. 진짜 "이 토큰은 더 이상 못 쓴다"고 FCM이
// 명확히 알려주는 코드만 남긴다.
const STALE_FCM_TOKEN_ERROR_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);
async function sendPushAndCleanup(tokens, message, label) {
  if (!tokens.length) return undefined;
  // ⭐ 안드로이드에서 같은 알림이 아이콘만 다르게 두 번(중복) 뜨던 문제의 실제 원인 —
  // FCM 메시지에 notification 필드가 있으면, 앱이 백그라운드일 때 브라우저가 그 내용을
  // "자기 마음대로"(기본 파비콘/알파벳 아이콘 등으로) 알아서 한 번 띄우고, 그와는 별개로
  // 이 서비스워커의 onBackgroundMessage 핸들러도 똑같은 메시지를 받아 우리가 원하는
  // 아이콘/진동으로 또 한 번 showNotification()을 호출한다 — 그래서 알림이 두 개(브라우저
  // 기본 렌더링 + 우리 커스텀 렌더링) 뜨고, 그중 브라우저가 자체적으로 띄운 쪽은 우리
  // 아이콘 설정을 안 타서 다른 모양으로 보인다. notification 필드를 아예 안 보내고
  // data로만 보내면 브라우저의 자동 표시가 안 일어나고, 오직 우리 서비스워커 코드만
  // showNotification()을 호출하게 되어 항상 하나만, 항상 같은 모양으로 뜬다
  // (public/sw.js의 onBackgroundMessage는 이미 payload.data.title/body를 읽도록
  // 돼있었다 — 이 데이터 전용 방식으로 가려던 것을 발송 쪽에서 안 맞춰주고 있었던 셈).
  const { notification, ...restMessage } = message;
  const data = { ...(message.data || {}) };
  if (notification?.title) data.title = String(notification.title);
  if (notification?.body) data.body = String(notification.body);
  delete restMessage.data;
  let res;
  try {
    res = await messaging.sendEachForMulticast({ tokens, data, ...restMessage });
  } catch (e) {
    console.error(`🚫 ${label} 발송 자체 실패:`, e?.message || e);
    return undefined;
  }
  console.log(`✅ ${label} 발송: 성공 ${res.successCount} / 실패 ${res.failureCount}`);
  const staleTokens = [];
  res.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code;
    console.warn(`⚠️ ${label} 발송 실패 (token #${i}): ${code || ""} ${r.error?.message || ""}`);
    if (code && STALE_FCM_TOKEN_ERROR_CODES.has(code)) staleTokens.push(tokens[i]);
  });
  if (!staleTokens.length) return res;
  try {
    // Firestore "in" 쿼리는 한 번에 최대 30개까지만 허용된다.
    for (let i = 0; i < staleTokens.length; i += 30) {
      const chunk = staleTokens.slice(i, i + 30);
      const snap = await db.collection("users").where("fcmToken", "in", chunk).get();
      if (snap.empty) continue;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.update(d.ref, { fcmToken: FieldValue.delete() }));
      await batch.commit();
      console.log(`🧹 만료된 FCM 토큰 ${snap.size}개 정리 완료`);
    }
  } catch (e) {
    console.warn("만료 FCM 토큰 정리 실패(무시):", e?.message || e);
  }
  return res;
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

      // ⭐ 화주사 전송 사본(source==="transport_transmit")은 이미 있던 오더를
      // 화주사 화면용으로 미러링만 한 문서라, 그대로 두면 "신규 오더 등록"이
      // 원본 생성 + 사본 생성으로 같은 오더에 두 번 뜬다(구글시트 중복과 동일한
      // 원인). 화면(DispatchApp.jsx)도 이 사본은 별도 알림을 안 띄운다.
      if (data.source === "transport_transmit") return;

      const isUrgent = data["긴급"] === true;
      const type = isUrgent ? "긴급배차" : "배차등록";
      const tokens = await getTokensForType(type);
      if (!tokens.length) {
        console.log("🚫 FCM 토큰 없음");
        return;
      }

      await sendPushAndCleanup(tokens, {
        notification: {
          title: isUrgent ? "긴급 오더 등록" : "신규 오더 등록",
          body: `${data["거래처명"] || ""} ${data["상차지명"] || "-"} → ${data["하차지명"] || "-"}`,
        },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, type);
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
      if (after.source === "transport_transmit") return; // 위와 동일한 이유로 사본은 스킵

      // 차량번호가 새로 생긴 경우만
      const prevCar = String(before["차량번호"] || "").trim();
      const nextCar = String(after["차량번호"] || "").trim();
      if (prevCar || !nextCar) return;

      const tokens = await getTokensForType("배차완료");
      if (!tokens.length) return;

      await sendPushAndCleanup(tokens, {
        notification: {
          title: "배차완료",
          body: `${after["거래처명"] || ""} ${after["상차지명"] || "-"} → ${after["하차지명"] || "-"}\n${after["기사명"] || ""} (${nextCar})`,
        },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, "배차완료");
    });

/* ==============================
   🔄 재배차 알림 — 배차완료(기사 배정) 상태였다가, 그 기사가 빠지고 다시
   "배차중" 상태로 돌아간 경우("재배차 필요"). notifyDispatchDone과 반대 방향.
============================== */
exports.notifyRedispatch =
  functions.firestore
    .document("{col}/{dispatchId}")
    .onUpdate(async (change, context) => {
      const { col } = context.params;
      if (!["dispatch", "orders"].includes(col)) return;

      const before = change.before.data();
      const after = change.after.data();
      if (!before || !after) return;
      if (after.source === "transport_transmit") return;

      const prevCar = String(before["차량번호"] || "").trim();
      const nextCar = String(after["차량번호"] || "").trim();
      const nextStatus = String(after["배차상태"] || "").trim();
      // 기사가 배정돼 있었다가(prevCar 있음) 빠지고(nextCar 없음), 배차취소가
      // 아니라 다시 배차 대기(배차중) 상태로 돌아간 경우만 — 배차취소는
      // notifyDispatchCanceled가 별도로 처리한다.
      if (!prevCar || nextCar || nextStatus !== "배차중") return;

      const tokens = await getTokensForType("재배차");
      if (!tokens.length) return;

      await sendPushAndCleanup(tokens, {
        notification: {
          title: "재배차 필요",
          body: `${after["거래처명"] || ""} ${after["상차지명"] || "-"} → ${after["하차지명"] || "-"}\n배정됐던 기사(${prevCar})가 취소되어 다시 배차중입니다.`,
        },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, "재배차");
    });

/* ==============================
   ❌ 배차취소 알림 — 오더가 취소(소프트: 배차상태→배차취소)되거나
   완전삭제된 경우.
============================== */
exports.notifyDispatchCanceled =
  functions.firestore
    .document("{col}/{dispatchId}")
    .onUpdate(async (change, context) => {
      const { col } = context.params;
      if (!["dispatch", "orders"].includes(col)) return;

      const before = change.before.data();
      const after = change.after.data();
      if (!before || !after) return;
      if (after.source === "transport_transmit") return;

      const prevStatus = String(before["배차상태"] || "").trim();
      const nextStatus = String(after["배차상태"] || "").trim();
      if (prevStatus === "배차취소" || nextStatus !== "배차취소") return; // 새로 취소된 경우만

      const tokens = await getTokensForType("배차취소");
      if (!tokens.length) return;

      await sendPushAndCleanup(tokens, {
        notification: {
          title: "배차취소",
          body: `${after["거래처명"] || ""} ${after["상차지명"] || "-"} → ${after["하차지명"] || "-"} 오더가 취소되었습니다.`,
        },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, "배차취소(취소상태 전환)");
    });

exports.notifyDispatchDeleted =
  functions.firestore
    .document("{col}/{dispatchId}")
    .onDelete(async (snap, context) => {
      const { col } = context.params;
      if (!["dispatch", "orders"].includes(col)) return;

      const data = snap.data();
      if (!data) return;
      if (data.source === "transport_transmit") return;
      // 배차취소로 먼저 바뀐 뒤 나중에 완전삭제된 문서는 위 notifyDispatchCanceled에서
      // 이미 알림을 보냈으니 여기서 또 보내지 않는다(중복 방지).
      if (data["배차상태"] === "배차취소") return;

      const tokens = await getTokensForType("배차취소");
      if (!tokens.length) return;

      await sendPushAndCleanup(tokens, {
        notification: {
          title: "배차취소",
          body: `${data["거래처명"] || ""} ${data["상차지명"] || "-"} → ${data["하차지명"] || "-"} 오더가 삭제되었습니다.`,
        },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, "배차취소(완전삭제)");
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

// ⚠️ 예전엔 "등록자"에게만 보냈는데(등록자명/createdByName 같은 "실명" 필드로
// users 목록에서 토큰을 찾으려 했음), 정작 토큰 맵은 uid/이메일로만 키를
// 만들어놔서 실명으로는 절대 매칭이 안 됐다 — 그래서 이 알림이 사실상 한 번도
// 안 뜨고 있었던 것으로 보인다. 긴급오더 알림(notifyNewDispatch)과 똑같이
// 전체 사용자에게 보내도록 바꿔 이 매칭 문제 자체를 없앴다 — 미배차 임박은
// 등록자 한 명만의 문제가 아니라 팀 전체가 알아야 할 상황이기도 하다.
exports.notifyUnassignedUrgent = functions.pubsub
  .schedule("every 5 minutes")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const nowMs = Date.now();
    const nowKst = new Date(nowMs + 9 * 60 * 60 * 1000);
    const todayStr = nowKst.toISOString().slice(0, 10);
    const URGENT_WINDOW_MIN = 60; // 상차 1시간 전부터 임박으로 취급

    const tokens = await getTokensForType("미배차");

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
        if (data.source === "transport_transmit") continue; // 원본(dispatch)과 중복 방지
        if (data.urgentPushSentAt) continue; // 이미 이 오더는 알림을 보냈음

        const t24 = normalizeTimeToHHMM(data["상차시간"]);
        if (!t24) continue;
        const dt = new Date(`${data["상차일"]}T${t24}:00+09:00`);
        const diffMin = (dt.getTime() - nowMs) / 60000;
        if (diffMin <= 0 || diffMin > URGENT_WINDOW_MIN) continue;

        if (!tokens.length) continue;

        try {
          await sendPushAndCleanup(tokens, {
            notification: {
              title: "미배차 임박",
              body: `${data["거래처명"] || ""} ${data["상차지명"] || "-"} → ${data["하차지명"] || "-"} (${data["상차시간"] || ""} 상차 예정, 아직 미배차)`,
            },
            android: { priority: "high" },
            apns: { payload: { aps: { sound: "default" } } },
          }, "미배차 임박");
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

/* ==============================================================
   🔔 사내 메신저 새 메시지 알림 (백그라운드 푸시)
   ----------------------------------------------------------------
   앱이 백그라운드/완전종료 상태여도 카카오톡처럼 알림창이 뜨게 하는 부분
   중 하나 — 새 메시지(chat_messages)가 생기면 그 방(chat_rooms) 멤버 중
   보낸 사람을 뺀 나머지에게 FCM 푸시를 보낸다.
================================================================== */
exports.notifyChatMessage = functions.firestore
  .document("chat_messages/{msgId}")
  .onCreate(async (snap) => {
    const data = snap.data();
    if (!data?.roomId || !data?.senderUid) return;

    const roomSnap = await db.collection("chat_rooms").doc(data.roomId).get();
    if (!roomSnap.exists) return;
    const members = (roomSnap.data()?.members || []).filter((uid) => uid !== data.senderUid);
    if (!members.length) return;

    const tokens = [];
    await Promise.all(members.map(async (uid) => {
      try {
        const uSnap = await db.collection("users").doc(uid).get();
        const token = uSnap.data()?.fcmToken;
        if (token) tokens.push(token);
      } catch (e) {
        console.warn("메신저 알림용 토큰 조회 실패:", uid, e?.message || e);
      }
    }));
    if (!tokens.length) return;

    const body = data.type === "image" ? "사진을 보냈습니다" : String(data.text || "").slice(0, 80);
    await sendPushAndCleanup(tokens, {
      notification: { title: data.senderName || "사내 메신저", body },
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } },
    }, "사내 메신저");
  });

/* ==============================================================
   🔔 관리자 발신 푸시 (최고관리자 전용) — 제목/내용을 직접 써서 전체 발송,
   또는 특정 uid 한 명(테스트용)에게만 발송.
================================================================== */
const PUSH_SEND_KEY = "kpflow-push-2026";

exports.sendPushNotification = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).send("POST만 허용됩니다."); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  if (body.key !== PUSH_SEND_KEY) { res.status(403).send("forbidden"); return; }

  const title = String(body.title || "").trim();
  const text = String(body.body || "").trim();
  if (!title && !text) { res.status(400).send("title 또는 body가 필요합니다."); return; }

  let tokens = [];
  try {
    if (body.uid) {
      const uSnap = await db.collection("users").doc(String(body.uid)).get();
      const t = uSnap.data()?.fcmToken;
      if (t) tokens = [t];
    } else {
      tokens = await getAllTokens();
    }
  } catch (e) {
    res.status(500).send(`대상 조회 실패: ${e?.message || e}`);
    return;
  }
  if (!tokens.length) { res.status(200).send("보낼 대상이 없습니다(등록된 푸시 토큰 없음)."); return; }

  try {
    const result = await sendPushAndCleanup(tokens, {
      notification: { title: title || "알림", body: text },
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } },
    }, "관리자 발신 푸시");
    res.status(200).send(
      result
        ? `발송 완료 — 성공 ${result.successCount}건, 실패 ${result.failureCount}건 (대상 ${tokens.length}명)`
        : `발송 실패 (대상 ${tokens.length}명) — 로그를 확인해주세요.`
    );
  } catch (e) {
    res.status(500).send(`오류: ${e?.message || e}`);
  }
});

/* ==============================================================
   📊 구글시트(배차현황) 실시간 연동
   ----------------------------------------------------------------
   돌캐(userCompany==="돌캐")가 배차프로그램에 오더를 등록/수정할 때마다,
   기존에 쓰던 구글시트(월별 탭 구조)에도 같은 내용이 실시간으로 반영되게
   한다. 별도의 서비스계정 키 파일 없이, 이 Firebase 프로젝트의 기본
   런타임 서비스계정(Application Default Credentials)으로 인증한다 —
   그래서 이 스프레드시트를 그 서비스계정 이메일(보통
   "<프로젝트ID>@appspot.gserviceaccount.com")에게 "편집자"로 공유해두기만
   하면 별도 설정 없이 바로 동작한다.

   ⚠️ 주의(범위):
   - 이 함수는 "orders"/"dispatch" 컬렉션 중 companyName이 정확히 "돌캐"인
     문서만 대상으로 한다 — 이 두 컬렉션은 여러 운송사가 함께 쓰는 공용
     컬렉션이라, 회사명으로 거르지 않으면 다른 회사 오더까지 이 개인
     구글시트에 섞여 들어간다.
   - 배포 시점 "이후"에 등록/수정되는 오더만 반영된다. 기존에 쌓여있던
     과거 데이터는 자동으로 채워지지 않는다(엑셀 다운로드로 별도 이관).
   - 오더 삭제(문서 자체가 지워짐)는 시트에 반영하지 않는다 — 필요하면
     별도로 요청.
================================================================== */

// 이 스프레드시트의 ID — URL의 /d/{ID}/edit 부분.
const GSHEET_SPREADSHEET_ID = "1Md09eYeoXVvXm155kCVE_jz1aZ1aedsmsvOQuPoiMxU";
// 이 시트 전용 동기화 대상 회사명 — 다른 회사 데이터가 섞이지 않도록 반드시 필터링한다.
const GSHEET_TARGET_COMPANY = "돌캐";
// "차량번호로 기사명/전화번호 자동매칭"에 쓰이는 기준표 시트 이름(A:기사명, B:차량정보(차량번호), C:전화번호, D:비고).
const GSHEET_UNIQUE_TAB = "고유값";

// ⭐ 프로그램 화면(DispatchApp.jsx의 dispatchData 합성 로직)이 취소된 오더를 걸러낼 때
// 쓰는 것과 동일한 기준 — 배차상태뿐 아니라 상태(화주사 취소 등)로만 표시되는 취소도
// 함께 잡아야 화면과 시트의 "취소 제외" 기준이 일치한다.
const GSHEET_CANCELED_STATUS_LIST = ["취소", "배차취소", "오더취소", "취소됨"];

/* ------------------------------------------------------------------
   ⭐ 열 위치를 하드코딩(B~J, K, L, M:N ...)하지 않고 매번 그 탭의 1행(헤더)을
   읽어서 이름으로 찾는다.

   원래 K열이 배차상태였는데, 사용자가 시트에 "경유지" 열을 손으로 끼워넣으면서
   그 뒤 모든 열(배차상태 K→L, 차량번호 L→M, ...)이 한 칸씩 밀렸다 — 코드는 여전히
   K를 배차상태로 알고 그 자리에 배차완료/배차중 계산용 배열수식을 다시 심다 보니
   실제로는 차량종류 칸에 수식이 들어가고, 정작 배차상태 칸(L)의 수식은 사라진 채로
   남아 #REF! 오류가 났다. 게다가 다른 달 탭들을 보면 "하차지"/"하차지주소" 순서가
   탭마다 다르기도 해서, 애초에 "이 순서가 항상 고정"이라는 전제 자체가 틀렸다.

   그래서 열 위치를 코드에 고정하는 대신, 매번 그 탭의 실제 헤더 텍스트를 읽어서
   "이 이름이 몇 번째 열에 있나"로 찾는다 — 사용자가 나중에 또 열을 끼워넣거나
   순서를 바꿔도 헤더 텍스트만 그대로면 자동으로 맞는 열을 찾아 쓴다.
------------------------------------------------------------------ */
// 내부 필드명 → 시트에 실제로 쓰여있을 수 있는 헤더 텍스트 후보(오탈자/동의어 포함,
// 실제 여러 달 탭을 확인해보니 "상하지주소"(상차지주소의 오타로 보임), "기사님요금"
// (기사운임), "선/착불"(지급방식) 같은 표기가 섞여 있었다). 앞에 있는 후보를 우선한다.
const GSHEET_FIELD_HEADER_CANDIDATES = {
  순번: ["순번"],
  상차일: ["상차일"],
  거래처명: ["거래처명"],
  상차지: ["상차지"],
  경유지: ["경유지"],
  상차지주소: ["상차지주소", "상하지주소"],
  하차지: ["하차지"],
  하차지주소: ["하차지주소"],
  화물정보: ["화물정보"],
  차량톤수: ["차량톤수"],
  차량종류: ["차량종류"],
  배차상태: ["배차상태"],
  차량번호: ["차량번호"],
  기사명: ["기사명"],
  전화번호: ["전화번호"],
  청구운임: ["청구운임"],
  기사운임: ["기사운임", "기사님요금"],
  수수료: ["수수료"],
  매익율: ["매익율"],
  프로그램: ["프로그램"],
  지급방식: ["지급방식", "선/착불"],
  메모: ["메모"],
};

// 0-based 열 인덱스 → 시트 열 문자(0→A, 25→Z, 26→AA, ...).
function gsheetColLetter(idx) {
  let n = idx + 1, s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// 탭 이름 → { 상차일:"B", 경유지:"E", 배차상태:"L", ... } 이런 필드명→열문자 맵.
// 헤더 텍스트가 살짝 바뀌어도(새 열이 끼워들거나 순서가 바뀌어도) 항상 그 탭의
// 실제 1행을 읽어서 다시 계산하므로 코드에 열 위치를 고정해두지 않아도 된다.
// 같은 탭을 짧은 시간에 여러 번 쓸 때(다중등록, 백필 등) 매번 다시 읽지 않도록
// 30초짜리 아주 짧은 캐시만 둔다(헤더 행은 거의 안 바뀌는 값이라 안전).
// cacheKeyPrefix로 캐시를 구분하는 이유는, 같은 탭 이름이라도(이럴 일은 거의
// 없지만) 오더 탭용 후보 목록과 거래처 탭용 후보 목록이 다르기 때문 — 실제로는
// 서로 다른 탭 이름을 쓰므로 실질적인 충돌은 없다.
const _gsheetColMapCache = new Map(); // cacheKey -> { map, ts }
async function getGsheetColumnMapFor(tabName, candidatesMap, cacheKeyPrefix = "") {
  const cacheKey = cacheKeyPrefix + tabName;
  const cached = _gsheetColMapCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 30 * 1000) return cached.map;

  const res = await gsheetApi("GET", `/values/${encodeURIComponent(`${quoteTab(tabName)}!1:1`)}`);
  const headerRow = (res.values && res.values[0]) || [];
  const letterByText = {};
  headerRow.forEach((h, i) => {
    const t = String(h || "").trim();
    if (t && !(t in letterByText)) letterByText[t] = gsheetColLetter(i);
  });

  const map = {};
  for (const [field, candidates] of Object.entries(candidatesMap)) {
    for (const c of candidates) {
      if (letterByText[c]) { map[field] = letterByText[c]; break; }
    }
  }
  _gsheetColMapCache.set(cacheKey, { map, ts: Date.now() });
  return map;
}
async function getGsheetColumnMap(tabName) {
  return getGsheetColumnMapFor(tabName, GSHEET_FIELD_HEADER_CANDIDATES, "order:");
}

// 경유지 열에 쓸 텍스트 — 화면에 표시되는 "경유상차/하차 이름 목록"과 같은 방식으로
// 각 경유지 객체의 업체명만 뽑아 이어붙인다(주소는 넣지 않음, 사용자 요청).
// 경유지_상차/경유상차목록, 경유지_하차/경유하차목록은 같은 데이터를 가리키는
// 동의어 필드쌍이라(DispatchApp.jsx의 필드 정규화 로직과 동일한 우선순위) 각 쌍에서
// 하나씩만 골라 상차 경유지 + 하차 경유지 순서로 합친다.
function extractGsheetWaypointNames(data) {
  const pickupList = Array.isArray(data?.경유지_상차) ? data.경유지_상차 : (Array.isArray(data?.경유상차목록) ? data.경유상차목록 : []);
  const dropList = Array.isArray(data?.경유지_하차) ? data.경유지_하차 : (Array.isArray(data?.경유하차목록) ? data.경유하차목록 : []);
  return [...pickupList, ...dropList]
    .map((s) => String(s?.업체명 || "").trim())
    .filter(Boolean)
    .join(", ");
}

/* ------------------------------------------------------------------
   📇 거래처(기본거래처=clients / 하차지거래처=places) 마스터 데이터를
   구글시트로 전송 — 관리자용.
   사용자 요청: "컬럼명은 지금 프로그램에 있는거 그대로 전송이 되어야해
   내가 설정하는게 아니라" — 그래서 오더 백필처럼 시트에 미리 있는
   헤더를 찾는 게 아니라, 프로그램 화면(거래처관리 목록)이 실제로 쓰는
   컬럼명과 순서를 코드에 그대로 옮겨적어두고, 실행할 때마다 이 헤더를
   포함해 시트에 통째로 다시 쓴다. 아래 컬럼 목록은 src/DispatchApp.jsx의
   ClientManagement 목록 테이블 헤더(<th>)와 정확히 동일하게 맞춘 것 —
   화면에서 컬럼이 추가/변경되면 이 목록도 같이 고쳐야 함.
   사용자 요청대로 제외한 것: 기본거래처는 등급/안내사항, 하차지거래처는
   등급/안내사항/삭제(삭제는 화면 전용 버튼이라 애초에 데이터 아님).
   "안내사항"은 기사전달주의사항 필드, "일반메모"는 메모 필드를 가리킨다
   (화면 헤더 텍스트와 Firestore 필드명이 다른 지점).
------------------------------------------------------------------ */
const GSHEET_CLIENT_COLUMNS = [
  { field: "거래처명", header: "거래처명" },
  { field: "사업자번호", header: "사업자번호" },
  { field: "대표자", header: "대표자" },
  { field: "업태", header: "업태" },
  { field: "종목", header: "종목" },
  { field: "주소", header: "주소" },
  { field: "담당자", header: "담당자" },
  { field: "연락처", header: "연락처" },
  { field: "이메일", header: "이메일" },
  { field: "메모", header: "일반메모" },
  { field: "오더메모", header: "오더메모" },
];
const GSHEET_PLACE_COLUMNS = [
  { field: "업체명", header: "업체명" },
  { field: "주소", header: "주소" },
  { field: "담당자", header: "담당자" },
  { field: "담당자번호", header: "담당자번호" },
  { field: "메모", header: "일반메모" },
  { field: "오더메모", header: "오더메모" },
];
// 담당자가 여러 명(contacts 배열)이면 그 중 대표(주 담당자)만 뽑는다 — 화면
// 목록에 보여주는 것과 동일한 방식.
function gsheetPrimaryContact(d) {
  if (!Array.isArray(d?.contacts) || !d.contacts.length) return null;
  return d.contacts.find((c) => c?.isPrimary) || d.contacts[0];
}
function buildGsheetClientRow(d) {
  const primary = gsheetPrimaryContact(d);
  return {
    거래처명: d["거래처명"] || "",
    사업자번호: d["사업자번호"] || "",
    대표자: d["대표자"] || "",
    업태: d["업태"] || "",
    종목: d["종목"] || "",
    주소: d["주소"] || "",
    담당자: primary?.name || d["담당자"] || "",
    연락처: primary?.phone || d["연락처"] || "",
    이메일: d["이메일"] || "",
    메모: d["메모"] || "",
    오더메모: d["오더메모"] || "",
  };
}
function buildGsheetPlaceRow(d) {
  const primary = gsheetPrimaryContact(d);
  return {
    업체명: d["업체명"] || "",
    주소: d["주소"] || "",
    담당자: primary?.name || d["담당자"] || "",
    담당자번호: primary?.phone || d["담당자번호"] || "",
    메모: d["메모"] || "",
    오더메모: d["오더메모"] || "",
  };
}

const GSHEET_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
let _gsheetAuthClient = null;
async function getGsheetAuthClient() {
  if (_gsheetAuthClient) return _gsheetAuthClient;
  const auth = new GoogleAuth({ scopes: GSHEET_SCOPES });
  _gsheetAuthClient = await auth.getClient();
  return _gsheetAuthClient;
}

// Sheets API v4 REST 호출 공용 래퍼 — path는 "/values/...:append" 처럼
// 스프레드시트 ID 뒤에 붙는 부분만 넘긴다.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 구글시트 API는 분당 호출 제한(사용자당 60회/100초)이 있어서, 백필처럼 짧은 시간에
// 오더 하나당 여러 번씩 연달아 호출하면(수백 건이면 수천 번) 중간부터 계속
// 429(RESOURCE_EXHAUSTED)로 실패하기 시작한다 — 실제로 134건 중 107건이 이렇게
// 실패한 적이 있음. 429/5xx를 만나면 잠깐 쉬었다가 자동으로 다시 시도한다.
async function gsheetApi(method, path, opts = {}, retriesLeft = 5) {
  const client = await getGsheetAuthClient();
  try {
    const res = await client.request({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${GSHEET_SPREADSHEET_ID}${path}`,
      method,
      ...opts,
    });
    return res.data;
  } catch (e) {
    const status = e?.response?.status || e?.code;
    const retryable = status === 429 || (typeof status === "number" && status >= 500);
    if (retryable && retriesLeft > 0) {
      const wait = 1000 * Math.pow(2, 5 - retriesLeft); // 1s,2s,4s,8s,16s
      console.warn(`구글시트 API ${status} — ${wait}ms 후 재시도(${retriesLeft}회 남음): ${method} ${path}`);
      await sleep(wait);
      return gsheetApi(method, path, opts, retriesLeft - 1);
    }
    throw e;
  }
}

// 여러 오더가 짧은 시간에 동시에 등록/수정되면(다중등록, 엑셀 업로드 등) Cloud
// Functions가 각 오더마다 동시에 실행돼, 같은 시트 탭에 대해 "지금 어디까지 뭐가
// 있나" 계산을 서로 못 보고 겹쳐써서 행 순서가 뒤죽박죽되거나 서식이 깨지는 사고가
// 실제로 있었다(백필을 두 번 동시 실행했을 때도 동일 증상). 탭 이름 단위로 잠깐
// 순서를 강제해(한 번에 한 작업만 그 탭을 건드리게) 막는다 — Firestore 문서 하나를
// 잠금으로 쓰는 단순한 방식.
async function withGsheetTabLock(tabName, fn) {
  const lockRef = db.doc(`systemConfig/gsheetTabLock_${encodeURIComponent(tabName)}`);
  const staleMs = 60 * 1000; // 이보다 오래된 잠금은 죽은 실행으로 보고 무시
  const deadline = Date.now() + 45 * 1000;
  for (;;) {
    const got = await db.runTransaction(async (tx) => {
      const snap = await tx.get(lockRef);
      const existing = snap.exists ? snap.data() : null;
      if (existing?.lockedAt && Date.now() - existing.lockedAt < staleMs) return false;
      tx.set(lockRef, { lockedAt: Date.now() });
      return true;
    });
    if (got) break;
    if (Date.now() > deadline) {
      console.warn(`구글시트 탭 잠금 대기 초과(${tabName}) — 잠금 없이 그냥 진행`);
      break;
    }
    await sleep(400 + Math.random() * 400);
  }
  try {
    return await fn();
  } finally {
    await lockRef.delete().catch(() => {});
  }
}

// A1 표기에 쓸 시트 이름 — 작은따옴표로 감싸 특수문자/숫자 시작 이름도 안전하게.
function quoteTab(tabName) {
  return `'${tabName.replace(/'/g, "''")}'`;
}

// 상차일(YYYY-MM-DD) → "26년9월" 형식의 월별 탭 이름.
function gsheetMonthTabName(dateStr) {
  const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const yy = m[1].slice(2);
  const mm = parseInt(m[2], 10);
  return `${yy}년${mm}월`;
}

// "26년9월" 형식의 탭 이름을 정렬 가능한 값(연*12+월)으로 — 없으면 null.
function gsheetTabSortKey(title) {
  const m = String(title || "").match(/^(\d{2})년(\d{1,2})월$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 12 + parseInt(m[2], 10);
}

async function getGsheetSheetList() {
  const data = await gsheetApi("GET", "?fields=sheets.properties");
  return (data.sheets || []).map((s) => s.properties);
}

// 배차상태 열은 (배차상태 헤더가 있는) 열 2행 셀 하나에만 있는 =ARRAYFORMULA(...)가
// 그 아래 전체를 자동으로 채우는 구조라(순번열 전체 참조라 몇 행이 새로 생기든 자동으로
// 따라간다), 이 값을 다시 심어야 할 때마다 지금 그 탭의 실제 순번/배차상태/차량번호
// 열 위치를 반영해 수식 텍스트 자체를 새로 만든다 — 예전엔 이 수식 텍스트를
// "=ARRAYFORMULA(IF(A2:A=\"\",\"\",IF(L2:L<>\"\",...)))"로 고정해두고 K2에 박아넣었는데,
// 사용자가 시트에 "경유지" 열을 끼워넣어 실제 배차상태/차량번호 열이 L/M으로 밀리면서
// 이 하드코딩이 완전히 어긋나 배차상태 칸에 #REF! 오류가 나는 사고가 있었다.
function buildGsheetStatusFormula(colMap) {
  const seqCol = colMap.순번 || "A";
  const carCol = colMap.차량번호 || "L";
  return `=ARRAYFORMULA(IF(${seqCol}2:${seqCol}="","",IF(${carCol}2:${carCol}<>"","배차완료","배차중")))`;
}

// 2행부터 rowCount행까지(헤더 제외 데이터 행 전체)를 최대한 지운다. 시트 API는
// "고정(freeze)되지 않은 행을 100% 다 지우는" 걸 허용하지 않아서(이 시트는 1행이
// 고정돼있음) 마지막 한 줄은 남겨두고 그 앞까지만 지운다 — 남는 한 줄은 어차피 빈
// placeholder 줄이라 문제 없다.
// ⭐ 배차상태 열은 그 열 2행 셀 하나에만 있는 =ARRAYFORMULA(...)가 그 아래 전체를
// 자동으로 채우는 구조인데, 이 함수가 항상 지우는 2행(row index 1)이 하필 그 수식이
// 들어있는 셀이다 — 지우고 나면 배차상태 칸 전체가 그냥 빈 칸이 돼버리는 사고가
// 있었다. tabName을 넘겨주면 지운 직후 그 열 2행에 수식을 다시 심어서 복구한다.
async function clearGsheetDataRows(sheetId, rowCount, tabName) {
  const endIndex = rowCount - 1;
  if (endIndex <= 1) return; // 지울 데이터 행이 사실상 없음
  await gsheetApi("POST", ":batchUpdate", {
    data: {
      requests: [
        { deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: 1, endIndex } } },
      ],
    },
  });
  if (tabName) {
    const colMap = await getGsheetColumnMap(tabName);
    const statusCol = colMap.배차상태;
    if (statusCol) {
      await gsheetApi("POST", "/values:batchUpdate", {
        data: {
          valueInputOption: "USER_ENTERED",
          data: [{ range: `${quoteTab(tabName)}!${statusCol}2`, values: [[buildGsheetStatusFormula(colMap)]] }],
        },
      });
    } else {
      console.warn(`⚠️ "${tabName}" 탭에서 배차상태 헤더를 못 찾아 배차상태 수식을 다시 심지 못했습니다.`);
    }
  }
}

// 대상 월 탭이 없으면, 가장 최근 월 탭을 복제해서(서식/함수 그대로 유지) 만들고
// 그 안의 기존 데이터 행(헤더 제외)은 전부 지운다 — 새 탭은 헤더만 있는 빈 상태로 시작.
async function ensureGsheetMonthTab(tabName) {
  const sheets = await getGsheetSheetList();
  const existing = sheets.find((s) => s.title === tabName);
  if (existing) return existing;

  const monthTabs = sheets.filter((s) => gsheetTabSortKey(s.title) !== null);
  if (!monthTabs.length) {
    throw new Error("복제할 월별 탭(YY년M월 형식)을 찾을 수 없습니다.");
  }
  monthTabs.sort((a, b) => gsheetTabSortKey(b.title) - gsheetTabSortKey(a.title));
  const source = monthTabs[0];

  const dup = await gsheetApi("POST", ":batchUpdate", {
    data: {
      requests: [
        {
          duplicateSheet: {
            sourceSheetId: source.sheetId,
            insertSheetIndex: source.index + 1,
            newSheetName: tabName,
          },
        },
      ],
    },
  });
  const newProps = dup.replies[0].duplicateSheet.properties;

  // 복제된 탭에서 1행(헤더)만 남기고 나머지 데이터 행은 최대한 삭제한다.
  await clearGsheetDataRows(newProps.sheetId, newProps.gridProperties?.rowCount || 1, tabName);
  return newProps;
}

// 신규 오더를 어느 행에 넣을지 정한다 — 상차일 열만 본다. 아직 안 쓴 나머지 행에도
// 기본값을 채워주는 수식이 미리 깔려있어("배차중", "정보 없음" 등) 그 칸들까지
// "데이터"로 치면 항상 시트 맨 끝(1000행 근처)으로 밀려버리는데, 진짜 오더가 있는 행만
// 상차일 열이 채워져 있다는 점을 이용해 진짜 데이터의 끝을 정확히 찾는다.
// - 마지막 진짜 행과 상차일이 같으면 바로 다음 행에 이어붙인다(같은 날짜끼리 뭉침).
// - 다르면(=새로운 날짜) 그 사이에 빈 줄 하나를 넣어 날짜 블록을 시각적으로 분리한다.
async function findGsheetInsertPosition(tabName, targetDate, colMap) {
  const dateCol = colMap?.상차일 || "B";
  const res = await gsheetApi("GET", `/values/${encodeURIComponent(`${quoteTab(tabName)}!${dateCol}2:${dateCol}2000`)}`);
  const values = res.values || [];
  let lastRealRow = 1; // 1행=헤더. 진짜 데이터가 하나도 없으면 그대로 1.
  let lastRealDate = null;
  // ⭐ 실사용 버그 수정: 예전엔 "중간에 빈 칸이 나오면 그걸로 데이터 끝"이라고 보고
  // 바로 break 했는데, 정작 이 함수 자신이 날짜가 바뀔 때마다(needsSeparator) 빈 줄을
  // 하나씩 심어두기 때문에 두 번째 날짜 블록부터는 항상 그 직전의 "구분용 빈 줄"에서
  // 멈춰버렸다. 그 결과 실제 데이터가 훨씬 아래(예: 9/3~9/4)까지 있어도 이 함수는
  // "9/1 블록 다음 빈 줄"을 데이터 끝으로 착각해, 새 오더(9/4)를 9/1과 9/2 사이의 그
  // 구분용 빈 줄 자리에 그대로 덮어써버렸다(그 자리가 실은 9/2 블록 시작 행이었던 경우
  // 기존 9/2 데이터까지 덮어써지며 값이 뒤섞여 보이는 문제로 이어짐). 구분용 빈 줄은
  // 건너뛰고 끝까지 훑어서 "진짜 마지막" 데이터 행/날짜를 찾아야 한다(API가 응답 자체를
  // 마지막 값이 있는 행까지만 주므로, 배열 끝까지 다 봐도 그 뒤엔 어차피 값이 없다).
  for (let i = 0; i < values.length; i++) {
    const v = String(values[i]?.[0] || "").trim();
    if (!v) continue; // 날짜 블록 사이 구분용 빈 줄 — 건너뛰고 계속 찾는다
    lastRealRow = i + 2; // values[0] == B2
    lastRealDate = v;
  }
  if (lastRealRow === 1) return { insertRow: 2, needsSeparator: false };
  if (lastRealDate === String(targetDate || "").trim()) return { insertRow: lastRealRow + 1, needsSeparator: false };
  return { insertRow: lastRealRow + 2, needsSeparator: true };
}

// 시트 맨 끝(현재 rowCount 다음)에 서식(테두리 등)을 바로 위 행에서 이어받은 빈 행을
// 하나 추가한다. (예전엔 목표 위치에 직접 insertDimension으로 끼워넣었는데, 헤더
// 바로 다음처럼 "위에 이어받을 서식 있는 행이 없는" 자리에 처음 삽입될 때 서식 없이
// 시작되고, 그 서식 없음이 이후 모든 삽입에 계속 이어받아지며 번져서 테두리가 통째로
// 사라지는 문제가 있었다. 항상 맨 끝에서만 이어붙이면, 맨 처음 한 줄은 초기화 때
// 남겨둔 서식 있는 빈 줄(clearGsheetDataRows 참고)을 그대로 쓰게 되고, 그 다음부터는
// 쭉 그 서식을 이어받아 끊기지 않는다.)
async function appendGsheetBufferRow(sheetId, rowCount) {
  await gsheetApi("POST", ":batchUpdate", {
    data: {
      requests: [
        {
          insertDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: rowCount, endIndex: rowCount + 1 },
            inheritFromBefore: true,
          },
        },
      ],
    },
  });
}

// targetRow번째 행까지 실제로 존재하도록(비어있는 버퍼 행 포함) 시트 끝에 필요한 만큼
// 행을 추가한다 — 이미 존재하면(버퍼 행이 미리 마련돼 있으면) 아무것도 안 하고 그대로
// 반환한다. 반환값은 이 호출 이후의 실제 rowCount.
async function ensureGsheetRowsUpTo(sheetId, rowCount, targetRow) {
  let count = rowCount;
  while (count < targetRow) {
    await appendGsheetBufferRow(sheetId, count);
    count++;
  }
  return count;
}

// 시트에서 특정 행을 통째로 구조적으로 지운다(값만 비우는 게 아니라 행 자체가
// 없어지고 아래 행들이 위로 당겨짐). 같은 탭에서 이 행보다 아래에 이미 동기화되어
// 있던 다른 오더들의 _gsheetSync.row 포인터도 함께 -1 보정해줘야, 그 오더들을 다음에
// 수정할 때 엉뚱한 행을 덮어쓰지 않는다.
async function removeGsheetRow(tabName, row) {
  await withGsheetTabLock(tabName, async () => {
    const sheets = await getGsheetSheetList();
    const sheet = sheets.find((s) => s.title === tabName);
    if (!sheet) return; // 탭 자체가 이미 없으면(수동 삭제 등) 할 일 없음

    await gsheetApi("POST", ":batchUpdate", {
      data: {
        requests: [
          { deleteDimension: { range: { sheetId: sheet.sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row } } },
        ],
      },
    });

    // ⭐ 이 달의 첫 동기화 오더(2행)가 지워지는 경우, 배차상태 열 2행에 있던 ARRAYFORMULA
    // 소스 셀 자체가 같이 삭제된다 — clearGsheetDataRows와 동일한 이유로 매번 재심는다
    // (2행이 아닐 때는 그냥 같은 값을 덮어쓰는 것뿐이라 부작용 없음).
    if (row === 2) {
      const colMap = await getGsheetColumnMap(tabName);
      if (colMap.배차상태) {
        await gsheetApi("POST", "/values:batchUpdate", {
          data: {
            valueInputOption: "USER_ENTERED",
            data: [{ range: `${quoteTab(tabName)}!${colMap.배차상태}2`, values: [[buildGsheetStatusFormula(colMap)]] }],
          },
        });
      }
    }

    for (const col of ["orders", "dispatch"]) {
      let snap;
      try {
        snap = await db.collection(col).where("_gsheetSync.tab", "==", tabName).get();
      } catch (e) {
        console.warn(`_gsheetSync 포인터 보정용 조회 실패(${col}):`, e?.message || e);
        continue;
      }
      const targets = snap.docs.filter((d) => (d.data()?._gsheetSync?.row || 0) > row);
      for (let i = 0; i < targets.length; i += 500) {
        const batch = db.batch();
        targets.slice(i, i + 500).forEach((d) => batch.update(d.ref, { "_gsheetSync.row": FieldValue.increment(-1) }));
        await batch.commit();
      }
    }
  });
}

// 오더 하나를 시트에서 제거한다(완전삭제 또는 배차취소로 인한 제거) — _gsheetSync가
// 있을 때만(=이미 시트에 올라간 적 있을 때만) 동작. docId가 있으면(문서가 아직
// 존재 — 배차취소로 남아있는 소프트삭제) 그 문서의 _gsheetSync도 지워서, 나중에
// "재등록"으로 되살아나면 새 행으로 다시 만들어지게 한다.
async function removeOneDispatchFromGsheet(dataWithSyncRef, docId) {
  const ref = dataWithSyncRef?._gsheetSync;
  if (!ref?.tab || !ref?.row) return;
  await removeGsheetRow(ref.tab, ref.row);
  if (docId) {
    await db.doc(docId).update({ _gsheetSync: FieldValue.delete() });
  }
}

// "고유값" 시트에 이 차량번호가 없으면(=배차프로그램에서 새로 등록된 기사) 맨 아래에
// 기사명/차량번호/전화번호를 새 행으로 추가한다 — 기존 시트의 차량번호→기사명/전화번호
// 자동매칭 수식이 새 기사도 바로 찾을 수 있게 된다.
async function ensureDriverInGsheetUniqueTab(plate, name, phone) {
  const cleanPlate = String(plate || "").trim();
  if (!cleanPlate) return;
  const norm = (s) => String(s || "").replace(/\s+/g, "");
  let rows = [];
  try {
    const data = await gsheetApi("GET", `/values/${encodeURIComponent(`${quoteTab(GSHEET_UNIQUE_TAB)}!A:D`)}`);
    rows = data.values || [];
  } catch (e) {
    console.warn("고유값 시트 조회 실패(스킵):", e?.message || e);
    return;
  }
  const already = rows.some((r) => norm(r?.[1]) === norm(cleanPlate));
  if (already) return;
  try {
    await gsheetApi(
      "POST",
      `/values/${encodeURIComponent(`${quoteTab(GSHEET_UNIQUE_TAB)}!A:D`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { data: { values: [[name || "", cleanPlate, phone || "", ""]] } }
    );
  } catch (e) {
    console.warn("고유값 시트 신규기사 추가 실패(스킵):", e?.message || e);
  }
}

// dispatch 문서 → 필드명 기준 값 맵(배차상태는 제외 — 그 열은 절대 값으로 안 쓰고
// ARRAYFORMULA 하나가 전체를 자동 계산한다). 실제로 어느 열에 쓸지는 이 함수가 정하지
// 않는다 — writeGsheetOrderRow가 그 탭의 실제 헤더에서 찾은 열 위치(colMap)에 맞춰
// 하나씩 배치한다. 경유지가 없는 오더는 빈 문자열이 되고, 그 탭에 경유지 헤더 자체가
// 없으면(옛날 탭 등) writeGsheetOrderRow가 그 필드를 통째로 건너뛴다.
function buildGsheetFieldValues(d) {
  return {
    상차일: d["상차일"] || "",
    거래처명: d["거래처명"] || "",
    상차지: d["상차지명"] || "",
    경유지: extractGsheetWaypointNames(d),
    상차지주소: d["상차지주소"] || "",
    하차지: d["하차지명"] || "",
    하차지주소: d["하차지주소"] || "",
    화물정보: d["화물내용"] || "",
    차량톤수: d["차량톤수"] || "",
    차량종류: d["차량종류"] || "",
    차량번호: d["차량번호"] || "",
    청구운임: d["청구운임"] || "",
    기사운임: d["기사운임"] || "",
    프로그램: d["배차방식"] || "",
    지급방식: d["지급방식"] || "",
    메모: d["메모"] || "",
  };
}
// 새 행을 만들 때만 쓰는 수식들 — 기사명/전화번호는 고유값 시트에서 차량번호로
// 찾아오는 INDEX/MATCH, 수수료/매익율은 청구운임/기사운임 기준 계산식. 전부 그 탭의
// 실제 열 위치(colMap)를 참조해 수식 텍스트를 만든다 — 열이 어디에 있든 항상 맞는
// 셀을 가리키게 하기 위함(사용자가 실제로 쓰던 수식의 로직은 그대로 재현).
function gsheetFormulaMN(row, colMap) {
  const carCol = colMap.차량번호 || "L";
  return [
    `=IFERROR(INDEX('고유값'!$A$2:$A$102971, MATCH(${carCol}${row}, '고유값'!$B$2:$B$102971, 0)), "정보 없음")`,
    `=IFERROR(INDEX('고유값'!$C$2:$C$102971, MATCH(${carCol}${row}, '고유값'!$B$2:$B$102971, 0)), "정보 없음")`,
  ];
}
function gsheetFormulaQR(row, colMap) {
  const chargeCol = colMap.청구운임 || "O";
  const driverFareCol = colMap.기사운임 || "P";
  const feeCol = colMap.수수료 || "Q";
  return [`=${chargeCol}${row}-${driverFareCol}${row}`, `=SUM(${feeCol}${row}/${chargeCol}${row})`];
}
// 순번 — 예전엔 그냥 "=ROW()-1"(시트 전체 기준 절대 행번호)이었는데, 날짜가 바뀌면
// 1부터 다시 시작하길 원해서 COUNTIF로 "이 행까지 상차일 열에 같은 날짜가 몇 번
// 나왔나"를 센다 — 날짜 블록 사이에 넣는 빈 구분줄은 상차일이 비어있어 카운트에 안
// 잡히고, 날짜가 바뀌면 그 값도 바뀌므로 새 날짜에서 자연스럽게 1부터 다시 시작한다.
function gsheetFormulaA(row, colMap) {
  const dateCol = colMap.상차일 || "B";
  return `=IF(${dateCol}${row}="","",COUNTIF($${dateCol}$2:${dateCol}${row},${dateCol}${row}))`;
}

// dispatch 문서 하나를 이미 정해진 행(row)에 값+수식으로 쓴다 — 어디에 쓸지(행 번호)는
// 이 함수가 판단하지 않는다(호출하는 쪽이 정함). 실시간 동기화와 백필(대량 처리) 양쪽이
// 공유해서 쓴다. colMap을 안 넘기면(단건 호출) 이 함수가 직접 조회한다 — 여러 행을
// 연달아 쓰는 쪽(백필)은 미리 한 번만 조회해서 넘겨 API 호출을 아낀다.
async function writeGsheetOrderRow(tabName, row, data, colMap) {
  colMap = colMap || (await getGsheetColumnMap(tabName));
  const rangesData = [];
  const fieldValues = buildGsheetFieldValues(data);
  for (const [field, value] of Object.entries(fieldValues)) {
    const col = colMap[field];
    if (!col) continue; // 이 탭에 해당 헤더가 없으면(예: 경유지 헤더가 없는 옛날 탭) 조용히 건너뜀
    rangesData.push({ range: `${quoteTab(tabName)}!${col}${row}`, values: [[value]] });
  }
  if (colMap.기사명 && colMap.전화번호) {
    const [mFormula, nFormula] = gsheetFormulaMN(row, colMap);
    rangesData.push({ range: `${quoteTab(tabName)}!${colMap.기사명}${row}`, values: [[mFormula]] });
    rangesData.push({ range: `${quoteTab(tabName)}!${colMap.전화번호}${row}`, values: [[nFormula]] });
  }
  if (colMap.수수료 && colMap.매익율) {
    const [qFormula, rFormula] = gsheetFormulaQR(row, colMap);
    rangesData.push({ range: `${quoteTab(tabName)}!${colMap.수수료}${row}`, values: [[qFormula]] });
    rangesData.push({ range: `${quoteTab(tabName)}!${colMap.매익율}${row}`, values: [[rFormula]] });
  }
  if (colMap.순번) {
    rangesData.push({ range: `${quoteTab(tabName)}!${colMap.순번}${row}`, values: [[gsheetFormulaA(row, colMap)]] });
  }
  if (!rangesData.length) return;
  await gsheetApi("POST", "/values:batchUpdate", {
    data: { valueInputOption: "USER_ENTERED", data: rangesData },
  });
}

async function syncOneDispatchToGsheet(docId, data) {
  if (!data) return;
  // ⭐ 백필과 동일하게 화면 표시 폴백((companyName || "돌캐"))과 맞춰준다 — 이 필드가
  // 없는 문서(과거 모바일 등록분 등)도 돌캐 소속으로 취급해 실시간 동기화 대상에
  // 포함시킨다. (모바일 등록 화면은 이제 companyName을 항상 써넣도록 고쳤지만,
  // 이미 만들어진 문서나 다른 경로로 생성된 문서를 위한 안전장치.)
  if ((data.companyName || "돌캐") !== GSHEET_TARGET_COMPANY) return;

  // ⭐ 화주사 전송 사본(source==="transport_transmit")은 운송사가 오더를 화주사에게
  // 보낼 때 "orders" 컬렉션에 자동으로 만들어지는, 원본(dispatch)과 동일한 오더를
  // 가리키는 화주사 화면 전용 미러다. 화면(DispatchApp.jsx)도 dispatchData 합성 시
  // 이 사본을 제외하는데, 여기서 걸러내지 않으면 원본과 이 사본이 둘 다 시트에
  // 올라가 오더 하나가 행 두 개로 중복된다.
  if (data.source === "transport_transmit") return;

  // 배차취소(앱의 "삭제"는 실제 문서삭제가 아니라 배차상태를 배차취소로 바꾸는
  // 소프트삭제라 여기로 update가 들어온다) — 이미 시트에 올라간 행이 있으면 그
  // 행 자체를 지운다. 취소되기 전에 한 번도 동기화된 적 없는 오더는 애초에 새로
  // 만들지 않고 그냥 스킵(취소된 오더를 새로 시트에 올릴 이유가 없음). 배차상태
  // 외에 상태(화주사 취소 등)로만 취소가 표시되는 경우도 화면과 동일하게 포함.
  if (data["배차상태"] === "배차취소" || GSHEET_CANCELED_STATUS_LIST.includes(data["상태"])) {
    if (data._gsheetSync) await removeOneDispatchFromGsheet(data, docId);
    return;
  }

  const tabName = gsheetMonthTabName(data["상차일"]);
  if (!tabName) return; // 상차일이 없으면 어느 달 탭인지 알 수 없어 스킵

  const existingRef = data._gsheetSync;

  if (existingRef && existingRef.tab && existingRef.row) {
    // 이미 시트에 적혀있는 오더 — 값 칸(상차일~메모, 경유지 포함)만 나눠서 덮어쓴다.
    // 순번/수수료/매익율/배차상태/기사명/전화번호는 전부 시트 자체 수식이 계산해주는
    // 칸이라(수식이 다른 열을 보고 자동 계산) 절대 건드리지 않는다 — 여기 값을 쓰면
    // 수식이 깨진다. 비고(고유값고정값)도 용도 불명이라 그대로 둔다.
    // ⭐ 상차일이 바뀌어 월이 달라졌으면(드문 케이스) 예전 행은 지우고 새 탭에 다시 만든다.
    if (existingRef.tab === tabName) {
      const colMap = await getGsheetColumnMap(existingRef.tab);
      const rangesData = [];
      for (const [field, value] of Object.entries(buildGsheetFieldValues(data))) {
        const col = colMap[field];
        if (!col) continue;
        rangesData.push({ range: `${quoteTab(existingRef.tab)}!${col}${existingRef.row}`, values: [[value]] });
      }
      if (rangesData.length) {
        await gsheetApi("POST", "/values:batchUpdate", {
          data: { valueInputOption: "USER_ENTERED", data: rangesData },
        });
      }
      await ensureDriverInGsheetUniqueTab(data["차량번호"], data["이름"], data["전화번호"]);
      return;
    }
    // 월이 바뀐 경우 — 이전 행은 지우고(다른 오더로 착각되지 않도록, 아래 행들 당겨짐 +
    // 다른 오더 포인터 보정까지 removeGsheetRow가 처리) 새 탭에 새로 만든다.
    try {
      await removeGsheetRow(existingRef.tab, existingRef.row);
    } catch (e) {
      console.warn("이전 월 행 정리 실패(무시):", e?.message || e);
    }
  }

  // 신규 — 대상 월 탭을 준비하고(없으면 자동 생성) 진짜 데이터 끝(같은 날짜면 바로 다음,
  // 다른 날짜면 빈 줄 하나 띄우고 그 다음)에 필요한 만큼 시트 맨 끝에 행을 추가한 뒤
  // 그 행에 값+수식을 채운다. (중간에 행을 끼워넣지 않고 항상 맨 끝에서만 늘리는 이유는
  // appendGsheetBufferRow 주석 참고 — 테두리 등 서식이 깨지지 않게 하기 위해서다.)
  // ⭐ 다중등록 등으로 여러 오더가 거의 동시에 들어오면 "지금 어디까지 있나" 판단이
  // 서로 겹쳐써서 순서가 꼬일 수 있어(withGsheetTabLock 주석 참고), 같은 탭에 대한
  // 위치 계산~쓰기 전체를 잠금으로 감싸 한 번에 하나씩만 처리되게 한다.
  await ensureGsheetMonthTab(tabName);

  const row = await withGsheetTabLock(tabName, async () => {
    const sheetProps = (await getGsheetSheetList()).find((s) => s.title === tabName);
    if (!sheetProps) throw new Error(`탭을 찾을 수 없습니다: ${tabName}`);

    const colMap = await getGsheetColumnMap(tabName);
    const { insertRow } = await findGsheetInsertPosition(tabName, data["상차일"], colMap);
    const r = insertRow; // 실제 데이터가 들어갈 행
    // ensureGsheetRowsUpTo는 정확히 r행까지만 늘리므로, 끝나고 나면 rowCount는 항상 r다
    // (아래에서 다시 조회할 필요 없음 — 대량 백필 시 오더당 API 호출 수를 줄여 처리
    // 시간이 함수 제한시간(9분)을 넘기지 않게 하기 위해 왕복을 최대한 줄인다).
    await ensureGsheetRowsUpTo(sheetProps.sheetId, sheetProps.gridProperties?.rowCount || 1, r);

    await writeGsheetOrderRow(tabName, r, data, colMap);

    // 다음 오더를 위해 서식 이어받은 빈 버퍼 행을 하나 더 마련해둔다(항상 맨 끝에
    // 빈 줄 하나가 대기하고 있도록 유지) — 방금 쓴 행(r)이 곧 현재 rowCount다.
    await appendGsheetBufferRow(sheetProps.sheetId, r);
    return r;
  });

  await ensureDriverInGsheetUniqueTab(data["차량번호"], data["이름"], data["전화번호"]);
  await db.doc(docId).update({ _gsheetSync: { tab: tabName, row } });
}

/* ==============================================================
   📊 (1회성) 이미 등록돼 있던 오더를 구글시트로 일괄 반영 — 관리자용
   ----------------------------------------------------------------
   실시간 동기화(syncDispatchToGoogleSheet)는 "배포된 시점 이후" 새로
   등록/수정되는 오더만 반영한다. 이 함수는 그 전에 이미 등록돼 있던
   과거분을 한 번에 밀어넣기 위한 1회성 엔드포인트다.

   대상 월 탭의 기존 데이터 행을 전부 비운 뒤(헤더만 남기고), 프로그램에
   있는 그 달 오더를 상차일→순번 순으로 하나씩 다시 써넣는다 — "지금
   프로그램에 있는 그대로"를 보장하기 위해, 시트에 이미 있던 값과 병합하지
   않고 통째로 다시 만든다(그 전에 시트에서만 손으로 입력해둔 값이 있었다면
   사라짐 — 실행 전 사용자에게 이미 안내/확인됨).

   여러 오더를 동시에 처리하면 "삽입 위치 계산"이 서로 꼬이므로(같은
   시트를 동시에 읽고 쓰면 서로의 결과를 못 보고 같은 자리에 끼어들 수
   있음) 반드시 순서대로(하나 끝나고 다음) 처리한다. 오더 수가 많으면
   오래 걸릴 수 있어 타임아웃을 9분으로 늘려둔다.

   호출: https://.../backfillGsheetMonth?key=<GSHEET_BACKFILL_KEY>&month=YYYY-MM
================================================================== */
const GSHEET_BACKFILL_KEY = "dolkae-backfill-2026";

exports.backfillGsheetMonth = functions
  .runWith({ timeoutSeconds: 540, memory: "256MB" })
  .https.onRequest(async (req, res) => {
    // ⭐ 관리자 메뉴 안 버튼이 fetch()로 이 함수를 호출하는데(브라우저 주소창에 직접
    // URL을 쳐서 "방문"하는 것과 달리, fetch()로 부르는 건 교차 출처 요청이라 CORS
    // 허용 헤더가 없으면 브라우저가 응답을 읽지 못하고 "Failed to fetch"로 실패한다
    // (서버 쪽 작업 자체는 이미 진행됐을 수 있음 — 응답을 못 읽는 것뿐).
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET");
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.query.key !== GSHEET_BACKFILL_KEY) {
      res.status(403).send("forbidden");
      return;
    }
    const monthPrefix = String(req.query.month || "").trim(); // 예: "2026-09"
    if (!/^\d{4}-\d{2}$/.test(monthPrefix)) {
      res.status(400).send("사용법: ?key=...&month=YYYY-MM (예: month=2026-09)");
      return;
    }

    // ⭐ 동시에 두 번 실행되는 걸 막는 잠금 — 같은 탭에 두 실행이 동시에 행을
    // 끼워넣으면 서로의 위치 계산을 못 보고 끼어들어 순서가 뒤죽박죽되고 빈 줄이
    // 중간중간 섞이는 사고가 실제로 있었다. 15분 넘은 잠금은 죽은 실행으로 보고 무시.
    const lockRef = db.doc("systemConfig/gsheetBackfillLock");
    const gotLock = await db.runTransaction(async (tx) => {
      const snap = await tx.get(lockRef);
      const existing = snap.exists ? snap.data() : null;
      const staleMs = 15 * 60 * 1000;
      if (existing?.month && existing?.startedAt && Date.now() - existing.startedAt < staleMs) {
        return false;
      }
      tx.set(lockRef, { month: monthPrefix, startedAt: Date.now() });
      return true;
    });
    if (!gotLock) {
      res.status(409).send("이미 다른 백필이 진행 중입니다 — 잠시 후 다시 시도해주세요.");
      return;
    }

    try {
      const tabName = gsheetMonthTabName(`${monthPrefix}-01`);
      await ensureGsheetMonthTab(tabName);

      // 대상 탭의 기존 데이터 행을 최대한 비운다(헤더만 남김) — 프로그램 기준으로
      // 통째로 다시 채우기 위해.
      const sheets = await getGsheetSheetList();
      const sheet = sheets.find((s) => s.title === tabName);
      if (sheet) await clearGsheetDataRows(sheet.sheetId, sheet.gridProperties?.rowCount || 1, tabName);

      // 이 탭을 가리키던 _gsheetSync 포인터는 방금 다 지운 행을 가리키므로 전부
      // 무효 — 클리어해서 아래 루프가 전부 "신규"로 다시 써넣게 한다.
      for (const col of ["orders", "dispatch"]) {
        let snap;
        try {
          snap = await db.collection(col).where("_gsheetSync.tab", "==", tabName).get();
        } catch (e) {
          console.warn(`_gsheetSync 초기화용 조회 실패(${col}):`, e?.message || e);
          continue;
        }
        for (let i = 0; i < snap.docs.length; i += 500) {
          const batch = db.batch();
          snap.docs.slice(i, i + 500).forEach((d) => batch.update(d.ref, { _gsheetSync: FieldValue.delete() }));
          await batch.commit();
        }
      }

      // 프로그램에 있는 그 달 오더를 전부 모아 상차일→순번 순으로 정렬 — 등록된
      // 순서 그대로 시트에도 쌓이게 하기 위해.
      //
      // ⭐ 원래 where("companyName","==",GSHEET_TARGET_COMPANY)로 걸렀었는데, 이건
      // Firestore 등호(==) 필터의 특성상 companyName 필드가 아예 없는 문서를
      // 통째로 조회 결과에서 제외해버린다. 화면 표시는 (companyName || "돌캐")
      // 폴백이 곳곳에 있어 정상으로 보였지만, 실제로 모바일 등록 화면이 이 필드를
      // 아예 안 써넣고 있었던 게 뒤늦게 발견됨 — 그 결과 모바일로 등록한 오더가
      // 백필에서 전부 빠지고 있었다(1일 52건 중 42건만 전송되는 등). 그래서
      // companyName으로 미리 거르지 않고 그 달 상차일 범위로만 조회한 뒤, 표시와
      // 동일한 (companyName || "돌캐") 폴백으로 메모리에서 걸러 다른 회사 오더가
      // 섞이지 않게 한다.
      // ⭐ "orders" 컬렉션에는 화주사가 직접 등록한 오더뿐 아니라, 운송사가 dispatch의
      // 오더를 화주사에게 전송할 때 자동 생성되는 사본(source==="transport_transmit")도
      // 함께 들어있다 — 이 사본은 원본(dispatch)과 완전히 같은 오더를 가리키는 화주사
      // 화면 전용 미러라서, 걸러내지 않으면 전송된 오더마다 시트에 행이 두 개씩 생긴다
      // (화면(DispatchApp.jsx)도 dispatchData 합성 시 이 사본을 제외하는 것과 동일한
      // 기준). 여기서 아예 items 단계에서 빼서 아래 순번/재고 계산에도 안 끼게 한다.
      const monthStart = `${monthPrefix}-01`;
      const monthEndExclusive = `${monthPrefix}~`; // "~"(0x7E)는 숫자/하이픈보다 뒤이므로 그 달 모든 날짜를 포함
      const items = [];
      for (const col of ["orders", "dispatch"]) {
        const snap = await db
          .collection(col)
          .where("상차일", ">=", monthStart)
          .where("상차일", "<", monthEndExclusive)
          .get();
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.source === "transport_transmit") return;
          if ((data.companyName || "돌캐") === GSHEET_TARGET_COMPANY) {
            items.push({ docId: `${col}/${d.id}`, data });
          }
        });
      }
      items.sort((a, b) => {
        const dcmp = String(a.data["상차일"] || "").localeCompare(String(b.data["상차일"] || ""));
        if (dcmp !== 0) return dcmp;
        return (Number(a.data["순번"]) || 0) - (Number(b.data["순번"]) || 0);
      });

      // ⭐ 실제로 149건 백필 도중 같은 행(예: 44행)이 계속 다른 오더로 덮어써지고
      // 9/2 하루치가 통째로 건너뛰는 사고가 있었다 — 원인은 syncOneDispatchToGsheet를
      // 오더마다 그대로 호출하면 매번 findGsheetInsertPosition이 시트를 다시 읽어서
      // "지금 어디까지 있나"를 판단하는데, 구글시트 API가 방금 막 쓴 값을 곧바로
      // 반영해서 돌려준다는 보장이 없어(쓰기 직후 읽기 지연) 방금 쓴 행이 아직 안
      // 보이는 상태로 다음 오더가 같은 행을 또 targetting 했던 것. 백필은 한 프로세스
      // 안에서 순서대로 도는 루프이므로, 시트를 다시 읽지 않고 지금까지 쓴 행/날짜를
      // 메모리에서 직접 추적한다 — 이러면 그 지연 문제 자체가 성립하지 않는다.
      // 배차상태 외에 상태(화주사가 취소한 경우 등)로만 취소가 표시되는 경우도
      // 화면(DispatchApp.jsx)과 동일한 기준으로 함께 제외한다.
      const toWrite = items.filter(
        ({ data }) => data["배차상태"] !== "배차취소" && !GSHEET_CANCELED_STATUS_LIST.includes(data["상태"])
      );
      let created = 0;
      const canceled = items.length - toWrite.length;
      let failed = 0;
      const failedIds = [];

      if (toWrite.length) {
        await withGsheetTabLock(tabName, async () => {
          const sheetProps = (await getGsheetSheetList()).find((s) => s.title === tabName);
          if (!sheetProps) throw new Error(`탭을 찾을 수 없습니다: ${tabName}`);
          const sheetId = sheetProps.sheetId;
          let rowCount = sheetProps.gridProperties?.rowCount || 1;
          // 여러 오더를 연달아 쓰는 이 백필 전체가 같은 탭 하나를 대상으로 하므로,
          // 열 위치는 한 번만 조회해서 재사용한다(오더마다 다시 조회하면 API 호출이
          // 오더 수만큼 늘어나 분당 쓰기 한도에 다시 걸린다).
          const colMap = await getGsheetColumnMap(tabName);

          // ⭐ 구글시트 API는 "분당 쓰기 60회"라는 계정 단위 한도가 있다 — 오더 하나당
          // API 호출을 여러 번(행 삽입 + 값쓰기 + 고유값 등록) 하면 149건만 돼도 수백
          // 번이 되어 이 한도에 정면으로 걸린다(실제로 발생한 오류: Quota exceeded ...
          // Write requests per minute). 그래서 여기서는:
          //   1) 행 위치는 전부 메모리에서만 미리 계산(시트를 전혀 안 건드림)
          //   2) 필요한 행 전체(빈 분리 줄 포함)를 단 한 번의 구조적 삽입으로 만든다
          //   3) 값/수식 쓰기는 여러 오더를 묶어(청크) 한 번의 batchUpdate로 보낸다
          //   4) 신규 기사 등록도 전체를 모아 한 번에 append한다
          // 이렇게 하면 오더 수와 상관없이 API 호출이 총 10회 안팎으로 끝난다.
          const plan = [];
          let lastRow = 1; // 1=헤더뿐(진짜 데이터 아직 없음) sentinel
          let lastDate = null;
          for (const item of toWrite) {
            const thisDate = String(item.data["상차일"] || "").trim();
            const row = lastRow === 1 ? 2 : (lastDate === thisDate ? lastRow + 1 : lastRow + 2);
            plan.push({ ...item, row });
            lastRow = row;
            lastDate = thisDate;
          }
          const finalRow = lastRow;

          if (finalRow > rowCount) {
            await gsheetApi("POST", ":batchUpdate", {
              data: {
                requests: [
                  { insertDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowCount, endIndex: finalRow }, inheritFromBefore: true } },
                ],
              },
            });
            rowCount = finalRow;
          }

          // 청크 하나(오더 여러 건)를 한 번의 batchUpdate로 쓰고, 성공/실패한 원소를
          // 그대로 돌려준다 — 아래에서 실패분만 다시 돌리는 재시도 라운드에 재사용한다.
          const writeChunk = async (chunk) => {
            const rangesData = [];
            chunk.forEach(({ row, data }) => {
              for (const [field, value] of Object.entries(buildGsheetFieldValues(data))) {
                const col = colMap[field];
                if (!col) continue;
                rangesData.push({ range: `${quoteTab(tabName)}!${col}${row}`, values: [[value]] });
              }
              if (colMap.기사명 && colMap.전화번호) {
                const [mFormula, nFormula] = gsheetFormulaMN(row, colMap);
                rangesData.push({ range: `${quoteTab(tabName)}!${colMap.기사명}${row}`, values: [[mFormula]] });
                rangesData.push({ range: `${quoteTab(tabName)}!${colMap.전화번호}${row}`, values: [[nFormula]] });
              }
              if (colMap.수수료 && colMap.매익율) {
                const [qFormula, rFormula] = gsheetFormulaQR(row, colMap);
                rangesData.push({ range: `${quoteTab(tabName)}!${colMap.수수료}${row}`, values: [[qFormula]] });
                rangesData.push({ range: `${quoteTab(tabName)}!${colMap.매익율}${row}`, values: [[rFormula]] });
              }
              if (colMap.순번) {
                rangesData.push({ range: `${quoteTab(tabName)}!${colMap.순번}${row}`, values: [[gsheetFormulaA(row, colMap)]] });
              }
            });
            try {
              await gsheetApi("POST", "/values:batchUpdate", { data: { valueInputOption: "USER_ENTERED", data: rangesData } });
              created += chunk.length;
              for (let j = 0; j < chunk.length; j += 500) {
                const fsBatch = db.batch();
                chunk.slice(j, j + 500).forEach(({ docId, row }) => fsBatch.update(db.doc(docId), { _gsheetSync: { tab: tabName, row } }));
                await fsBatch.commit().catch((e) => console.warn("_gsheetSync 일괄 기록 실패(무시):", e?.message || e));
              }
              return [];
            } catch (e) {
              console.error(`백필 청크 실패(행 ${chunk[0].row}~${chunk[chunk.length - 1].row}):`, e?.message || e);
              return chunk; // 실패한 원소 그대로 반환 — 재시도 라운드에서 다시 씀
            }
          };

          const CHUNK_SIZE = 25; // 오더 25건씩 묶어서 한 번의 batchUpdate로 값을 쓴다
          let pending = plan;
          // ⭐ 요청하신 "안 된 것만 골라서 다시 보내기"를 매번 수동으로 확인 안 해도
          // 되도록, 실패한 청크는 자동으로 최대 2번 더 재시도한다(청크 하나가 어쩌다
          // 일시적 오류로 실패해도 전체가 누락되지 않게).
          for (let round = 0; round < 3 && pending.length; round++) {
            if (round > 0) {
              console.log(`백필 재시도 라운드 ${round} — 대상 ${pending.length}건`);
              await sleep(3000);
            }
            const stillFailed = [];
            for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
              const chunk = pending.slice(i, i + CHUNK_SIZE);
              stillFailed.push(...(await writeChunk(chunk)));
              if (i + CHUNK_SIZE < pending.length) await sleep(1500); // 분당 쓰기 한도(60회)에 안전하게 걸치도록 청크 사이 텀
            }
            pending = stillFailed;
          }
          failed += pending.length;
          pending.forEach(({ docId }) => failedIds.push(docId));

          // 신규 기사(차량번호 기준)를 전부 모아 "고유값" 탭에 한 번에 등록.
          try {
            const uniqueData = await gsheetApi("GET", `/values/${encodeURIComponent(`${quoteTab(GSHEET_UNIQUE_TAB)}!A:D`)}`);
            const norm = (s) => String(s || "").replace(/\s+/g, "");
            const existingPlates = new Set((uniqueData.values || []).map((r) => norm(r?.[1])));
            const seen = new Set();
            const newDriverRows = [];
            plan.forEach(({ data }) => {
              const plate = String(data["차량번호"] || "").trim();
              if (!plate) return;
              const key = norm(plate);
              if (existingPlates.has(key) || seen.has(key)) return;
              seen.add(key);
              newDriverRows.push([data["이름"] || "", plate, data["전화번호"] || "", ""]);
            });
            if (newDriverRows.length) {
              await gsheetApi(
                "POST",
                `/values/${encodeURIComponent(`${quoteTab(GSHEET_UNIQUE_TAB)}!A:D`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
                { data: { values: newDriverRows } }
              );
            }
          } catch (e) {
            console.warn("고유값 일괄 등록 실패(무시):", e?.message || e);
          }

          await appendGsheetBufferRow(sheetId, rowCount); // 다음 실시간 등록을 위한 버퍼 행 1개 보충
        });
      }

      // ⭐ "정말 다 들어갔는지" 결과 문구만 믿지 말고, 시트를 다시 읽어서 실제로 몇
      // 행이 채워졌는지 직접 세어 보여준다 — created 숫자와 실제 시트 상태가 어긋나면
      // (예: 위 재시도로도 못 넘긴 경우) 여기서 바로 드러난다.
      let actualRowCount = null;
      try {
        const verifyColMap = await getGsheetColumnMap(tabName);
        const dateCol = verifyColMap.상차일 || "B";
        const verifySnap = await gsheetApi("GET", `/values/${encodeURIComponent(`${quoteTab(tabName)}!${dateCol}2:${dateCol}2000`)}`);
        actualRowCount = (verifySnap.values || []).filter((r) => String(r?.[0] || "").trim()).length;
      } catch (e) {
        console.warn("백필 결과 검증용 재조회 실패(무시):", e?.message || e);
      }

      res.status(200).send(
        `완료 — 탭 "${tabName}" 초기화 후 반영 ${created}건, 배차취소(제외) ${canceled}건, 실패 ${failed}건 (대상 ${items.length}건)` +
        (actualRowCount !== null ? `\n검증: 시트에 실제로 채워진 행 ${actualRowCount}개` : "") +
        (failedIds.length ? `\n실패 목록(최대 20건): ${failedIds.slice(0, 20).join(", ")}` : "")
      );
    } catch (e) {
      console.error("백필 오류:", e);
      res.status(500).send(`오류: ${e?.message || e}`);
    } finally {
      await lockRef.delete().catch(() => {});
    }
  });

/* ==============================================================
   📇 (1회성/반복 가능) 기본거래처(clients)/하차지거래처(places)를
   구글시트로 일괄 반영 — 관리자용.
   ----------------------------------------------------------------
   사용자 요청: "컬럼명은 지금 프로그램에 있는거 그대로 전송이 되어야해
   내가 설정하는게 아니라" — 그래서 시트에 미리 헤더를 만들어둘 필요가
   없다. "기본거래처관리"/"하차지거래처관리" 탭이 없으면 새로 만들고,
   실행할 때마다 GSHEET_CLIENT_COLUMNS/GSHEET_PLACE_COLUMNS 순서 그대로
   헤더 행부터 다시 써서 컬럼명까지 프로그램과 항상 똑같이 맞춘다. 값
   내용도 매번 그 탭 전체를 비우고 지금 프로그램에 있는 그대로 다시
   채우므로, 여러 번 실행해도 결과는 항상 지금 프로그램 상태로 수렴한다.
   테두리 등 서식은 값만 지우는 values:clear로 보존한다(행 자체를
   지우고 다시 만들지 않음).

   호출: https://.../backfillGsheetClients?key=<GSHEET_BACKFILL_KEY>
================================================================== */
async function backfillGsheetClientTab({ tabName, collectionName, columns, buildRow, sortField }) {
  let sheets = await getGsheetSheetList();
  let sheet = sheets.find((s) => s.title === tabName);
  if (!sheet) {
    // 탭이 아예 없으면 새로 만든다 — 헤더도 아래에서 프로그램이 직접 써주므로
    // 사용자가 미리 이름 말고는 아무것도 준비할 필요가 없다.
    const created = await gsheetApi("POST", ":batchUpdate", {
      data: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    });
    sheet = created.replies[0].addSheet.properties;
  }

  const snap = await db.collection(collectionName).get();
  const items = [];
  snap.docs.forEach((d) => {
    const data = d.data();
    if ((data.companyName || "돌캐") !== GSHEET_TARGET_COMPANY) return;
    items.push(data);
  });
  items.sort((a, b) => String(a[sortField] || "").localeCompare(String(b[sortField] || ""), "ko"));

  return await withGsheetTabLock(tabName, async () => {
    // 값만 지운다(서식/테두리는 그대로 유지) — 행 개수가 고정 소수라 오더 탭처럼
    // deleteDimension/insertDimension으로 구조를 건드릴 필요가 없다.
    await gsheetApi("POST", `/values/${encodeURIComponent(quoteTab(tabName))}:clear`, { data: {} });

    const headerRow = columns.map((c) => c.header);
    const dataRows = items.map((data) => {
      const row = buildRow(data);
      return columns.map((c) => row[c.field] ?? "");
    });

    await gsheetApi("POST", "/values:batchUpdate", {
      data: {
        valueInputOption: "USER_ENTERED",
        data: [{ range: `${quoteTab(tabName)}!A1`, values: [headerRow, ...dataRows] }],
      },
    });

    return { ok: true, message: `탭 "${tabName}" — ${items.length}건 반영 완료(컬럼: ${headerRow.join(", ")}).` };
  });
}

exports.backfillGsheetClients = functions
  .runWith({ timeoutSeconds: 300, memory: "256MB" })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.query.key !== GSHEET_BACKFILL_KEY) { res.status(403).send("forbidden"); return; }

    try {
      const results = [];
      results.push(await backfillGsheetClientTab({
        tabName: "기본거래처관리",
        collectionName: "clients",
        columns: GSHEET_CLIENT_COLUMNS,
        buildRow: buildGsheetClientRow,
        sortField: "거래처명",
      }));
      results.push(await backfillGsheetClientTab({
        tabName: "하차지거래처관리",
        collectionName: "places",
        columns: GSHEET_PLACE_COLUMNS,
        buildRow: buildGsheetPlaceRow,
        sortField: "업체명",
      }));
      res.status(200).send(results.map((r) => r.message).join("\n"));
    } catch (e) {
      console.error("거래처 백필 오류:", e);
      res.status(500).send(`오류: ${e?.message || e}`);
    }
  });

exports.syncDispatchToGoogleSheet =
  functions.firestore
    .document("{col}/{dispatchId}")
    .onWrite(async (change, context) => {
      const { col, dispatchId } = context.params;
      if (!["dispatch", "orders"].includes(col)) return;

      const after = change.after.exists ? change.after.data() : null;
      const before = change.before.exists ? change.before.data() : null;

      if (!after) {
        // 문서 자체가 완전삭제된 경우(예: 화주사 전송사본 삭제 등) — 시트에 이미
        // 올라간 행이 있으면 그 행을 지운다.
        if (before && (before.companyName || "돌캐") === GSHEET_TARGET_COMPANY) {
          try {
            await removeOneDispatchFromGsheet(before, null);
          } catch (e) {
            console.error("📊 구글시트 행 삭제 실패:", e?.message || e);
          }
        }
        return;
      }

      // ⭐ 무한루프 방지 — 이 함수 자신이 _gsheetSync를 써서 생기는 재호출을 걸러낸다.
      // (_gsheetSync만 바뀌고 그 외 필드는 동일하면 스킵)
      if (before) {
        const a = { ...after }; delete a._gsheetSync; delete a.updatedAt;
        const b = { ...before }; delete b._gsheetSync; delete b.updatedAt;
        if (JSON.stringify(a) === JSON.stringify(b)) return;
      }

      try {
        await syncOneDispatchToGsheet(`${col}/${dispatchId}`, after);
      } catch (e) {
        console.error("📊 구글시트 동기화 실패:", e?.message || e);
      }
    });