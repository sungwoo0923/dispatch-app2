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
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");
const fetch = require("node-fetch");
const { GoogleAuth } = require("google-auth-library");

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

// ⭐ 2026-11-02 한 계정 여러 기기 — 예전엔 users.fcmToken 하나만 저장해서, 같은 계정으로 안드로이드·아이폰(·PC)을
//  같이 쓰면 마지막에 앱을 연 기기만 알림을 받았다(아이폰이 "갑자기" 안 오던 원인). fcmTokens(최근 기기 목록)까지 모두 보낸다.
function userTokens(u) {
  if (!u) return [];
  const out = new Set(Array.isArray(u.fcmTokensOut) ? u.fcmTokensOut : []); // 로그아웃한 기기
  return [...new Set([u.fcmToken, ...(Array.isArray(u.fcmTokens) ? u.fcmTokens : [])].filter((t) => typeof t === "string" && t && !out.has(t)))];
}

// 🔥 users 컬렉션에서 fcmToken 전부 수집
async function getAllTokens() {
  const snap = await db.collection("users").get();
  const tokens = [];
  snap.docs.forEach((d) => {
    tokens.push(...userTokens(d.data()));
  });
  return tokens;
}

// 알림 종류(type)별로 각자 켜고 끌 수 있게 — users/{uid}.pushPrefs.{type}에 값이
// 명시적으로 있으면(true/false) 그 값을 그대로 따르고, 한 번도 안 건드려 값이 없으면
// PUSH_TYPES_DEFAULT_ON에 있는 종류(긴급배차/미배차)만 기본으로 켜진 것으로 취급한다 —
// 나머지(배차등록/배차완료/재배차/배차취소)는 사용자가 모바일에서 직접 켜야 온다.
const PUSH_TYPES = ["배차등록", "긴급배차", "배차완료", "재배차", "미배차", "배차취소"];
// ⭐ 2026-11-01 팀별 알림 — 업무 알림(결재·공지·메일·메신저·가입신청·인사발령·마감보고)은 기본 켜짐, 끈 사람만 안 보낸다
const PUSH_TYPES_DEFAULT_ON = ["긴급배차", "미배차", "결재요청", "결재결과", "공지사항", "사내메일", "인사발령", "마감보고", "가입신청", "메신저", "생일", "인수인계"]; // ⭐ 2026-11-03 인수인계(notifyHandover)
function isPushTypeEnabled(prefs, type) {
  const v = prefs?.[type];
  if (v === true || v === false) return v;
  return PUSH_TYPES_DEFAULT_ON.includes(type);
}
// ⭐ 2026-11-01 운송사별 분리 — 그 오더의 회사 직원에게만(기사·화주 제외). 예전엔 모든 회사 사용자 전원에게 갔다.
const PUSH_DEFAULT_COMPANY = "돌캐";
const NON_STAFF_ROLES = new Set(["driver", "shipper", "cafeUser"]);
async function getTokensForType(type, companyName) {
  const co = String(companyName || PUSH_DEFAULT_COMPANY).trim();
  const snap = await db.collection("users").get();
  const tokens = [];
  snap.docs.forEach((d) => {
    const u = d.data();
    const ts = userTokens(u);
    if (!ts.length) return;
    if (NON_STAFF_ROLES.has(u.role)) return;
    if (u.approved === false || u.employmentStatus === "퇴사") return;
    if (u.role !== "totalMaster" && String(u.companyName || PUSH_DEFAULT_COMPANY).trim() !== co) return;
    if (u.role === "totalMaster" && co !== PUSH_DEFAULT_COMPANY) return; // 최고관리자는 기본 회사 알림만
    if (!isPushTypeEnabled(u.pushPrefs, type)) return;
    tokens.push(...ts);
  });
  return [...new Set(tokens)];
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
  tokens = [...new Set((tokens || []).filter((t) => typeof t === "string" && t))]; // 같은 기기 두 번 방지
  if (!tokens.length) return undefined;
  // 🧪 테스트(에뮬레이터)에서만 — 누구에게 보내는지 기록(실제 서버에서는 실행 안 됨)
  if (process.env.FUNCTIONS_EMULATOR === "true") console.log(`[PUSH-TEST] ${label} → ${tokens.join(",")} :: ${message?.notification?.title || ""}`);
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
  // ⭐ 안드로이드에서 "소리/진동은 나는데 카카오톡처럼 화면 위에 배너(헤드업)로
  // 뜨지는 않는다"는 리포트 — 발송하는 토큰은 실제로는 웹푸시(브라우저) 토큰이라,
  // 위의 android.priority는 네이티브 안드로이드 앱에만 적용되는 필드라 이 경우엔
  // 사실상 무시된다. 웹푸시가 실제로 타는 경로에 긴급도를 알리는 표준 필드는
  // webpush.headers.Urgency다 — 이걸 "high"로 채워 브라우저/OS가 이 알림을
  // 더 급한 알림으로 취급하도록 힌트를 준다.
  // ⚠️ 다만 이것만으로 100% 헤드업이 보장되진 않는다 — 안드로이드는 사이트별
  // 알림 채널의 "중요도"를 최초 생성 시 자체적으로 정하고, 이후엔 사용자가
  // 기기 설정(설정 > 앱 > 알림 > 이 사이트/앱 > 중요도/팝업 표시)에서 직접
  // 올려야 바뀌는 구조라, 코드만으로는 이미 만들어진 채널의 등급을 못 바꾼다.
  // ⭐ 2026-11-05 기사 APK(안드로이드 네이티브 앱) 푸시 — 네이티브 FCM은 data만 오면 앱이 꺼져 있을 때
  //  알림창에 아무것도 안 띄운다(Capacitor PushNotifications는 notification 메시지만 시스템이 표시).
  //  android.notification은 "안드로이드 앱" 토큰에만 적용되고 웹푸시(크롬·아이폰 PWA) 토큰은 계속 webpush(data)로 간다
  //  → 웹 쪽 중복 알림 문제(위 설명)는 다시 생기지 않는다. 채널 "orders"는 기사앱이 만들고(중요도 높음=화면 위 배너),
  //  채널이 없는 예전 APK는 FCM 기본 채널로 뜬다.
  if (notification?.title) {
    restMessage.android = {
      priority: "high",
      ...(restMessage.android || {}),
      notification: {
        title: String(notification.title),
        ...(notification.body ? { body: String(notification.body) } : {}),
        channelId: "orders",
        sound: "default",
        defaultVibrateTimings: true,
        ...((restMessage.android && restMessage.android.notification) || {}),
      },
    };
  }
  if (!restMessage.webpush) restMessage.webpush = {};
  if (!restMessage.webpush.headers) restMessage.webpush.headers = {};
  if (!restMessage.webpush.headers.Urgency) restMessage.webpush.headers.Urgency = "high";
  let res;
  try {
    res = await messaging.sendEachForMulticast({ tokens, data, ...restMessage });
  } catch (e) {
    console.error(`⊘ ${label} 발송 자체 실패:`, e?.message || e);
    return undefined;
  }
  console.log(`✓ ${label} 발송: 성공 ${res.successCount} / 실패 ${res.failureCount}`);
  const staleTokens = [];
  res.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code;
    console.warn(`⚠ ${label} 발송 실패 (token #${i}): ${code || ""} ${r.error?.message || ""}`);
    if (code && STALE_FCM_TOKEN_ERROR_CODES.has(code)) staleTokens.push(tokens[i]);
  });
  if (!staleTokens.length) return res;
  try {
    // Firestore "in" 쿼리는 한 번에 최대 30개까지만 허용된다.
    for (let i = 0; i < staleTokens.length; i += 30) {
      const chunk = staleTokens.slice(i, i + 30);
      const snap = await db.collection("users").where("fcmToken", "in", chunk).get();
      const docs = new Map();
      snap.docs.forEach((d) => docs.set(d.id, d));
      for (let j = 0; j < chunk.length; j += 10) {
        const snap2 = await db.collection("users").where("fcmTokens", "array-contains-any", chunk.slice(j, j + 10)).get().catch(() => null);
        (snap2?.docs || []).forEach((d) => docs.set(d.id, d));
      }
      if (!docs.size) continue;
      const batch = db.batch();
      docs.forEach((d) => {
        const patch = { fcmTokens: FieldValue.arrayRemove(...chunk) };
        if (chunk.includes(d.data().fcmToken)) patch.fcmToken = FieldValue.delete();
        batch.update(d.ref, patch);
      });
      await batch.commit();
      console.log(`◇ 만료된 FCM 토큰 ${snap.size}개 정리 완료`);
    }
  } catch (e) {
    console.warn("만료 FCM 토큰 정리 실패(무시):", e?.message || e);
  }
  return res;
}

/* ==============================
   ✎ 푸시 알림 내용(본문) 커스터마이징 — 최고관리자가 PC 관리자메뉴에서
   설정한다(제목은 고정, 본문에 어떤 필드를 넣을지만 설정 가능).
   설정값은 siteConfig/notificationTemplate 문서 하나에 타입별로 저장된다.
   { 배차등록: { fields: [...] }, 긴급배차: {...}, 배차완료: {...}, 미배차: {...} }
   문서가 없거나 특정 타입 설정이 없으면 기존 하드코딩과 동일한 기본값을 쓴다
   — 그래서 이 기능을 배포해도 아무도 설정을 안 건드리면 기존 알림 문구가
   그대로 유지된다. 재배차/배차취소는 "누구 기사가 빠졌다" 같은 고정 서술문이라
   설정 대상에서 뺐다(사용자 요청 범위와도 일치).
============================== */
const NOTIF_TEMPLATE_FIELD_LABELS = {
  거래처명: "거래처명",
  상차지명: "상차지",
  하차지명: "하차지",
  상차일: "상차일",
  상차시간: "상차시간",
  화물내용: "화물정보",
  차량톤수: "차량톤수",
  차량종류: "차량종류",
  차량번호: "차량번호",
  기사명: "기사명",
  전화번호: "전화번호",
};
const NOTIF_TEMPLATE_DEFAULTS = {
  배차등록: ["거래처명", "상차지명", "하차지명"],
  긴급배차: ["거래처명", "상차지명", "하차지명"],
  배차완료: ["거래처명", "상차지명", "하차지명", "기사명", "차량번호"],
  미배차: ["거래처명", "상차지명", "하차지명", "상차시간"],
};
let _notifTemplateCache = null;
let _notifTemplateCacheAt = 0;
async function getNotificationTemplateConfig() {
  const now = Date.now();
  if (_notifTemplateCache && now - _notifTemplateCacheAt < 30000) return _notifTemplateCache;
  try {
    const snap = await db.doc("siteConfig/notificationTemplate").get();
    _notifTemplateCache = snap.exists ? snap.data() || {} : {};
  } catch (e) {
    console.warn("알림 문구 설정 조회 실패(기본값 사용):", e?.message || e);
    _notifTemplateCache = {};
  }
  _notifTemplateCacheAt = now;
  return _notifTemplateCache;
}
function getNotifFieldsForType(config, type) {
  const fields = config?.[type]?.fields;
  if (Array.isArray(fields) && fields.length) {
    return fields.filter((f) => NOTIF_TEMPLATE_FIELD_LABELS[f]);
  }
  return NOTIF_TEMPLATE_DEFAULTS[type] || [];
}
function notifFieldValue(key, d) {
  switch (key) {
    case "거래처명": return d["거래처명"] || "";
    case "상차지명": return d["상차지명"] || "-";
    case "하차지명": return d["하차지명"] || "-";
    case "상차일": return d["상차일"] || "";
    case "상차시간": return d["상차시간"] || "";
    case "화물내용": return d["화물내용"] || "";
    case "차량톤수": return d["차량톤수"] || "";
    case "차량종류": return d["차량종류"] || "";
    case "차량번호": return d["차량번호"] || "";
    // ⚠️ 표시 라벨은 "기사명"이지만 실제 문서 필드는 "이름"이다(DispatchApp.jsx
    // 기준 — applyMultiSlotDriver 등에서 항상 "이름"으로 저장함). 예전 하드코딩
    // 알림 문구가 존재하지도 않는 after["기사명"]을 읽어 항상 빈 문자열이었던
    // 버그를 여기서 같이 바로잡는다.
    case "기사명": return d["이름"] || "";
    case "전화번호": return d["전화번호"] || "";
    default: return "";
  }
}
// 선택된 필드들을 사람이 읽기 좋게 이어붙인다 — 상차지명 바로 다음에 하차지명이
// 오면(둘 다 선택된 기본 케이스) 그 둘만 "출발 → 도착"처럼 화살표로 잇고,
// 나머지는 가운뎃점으로 구분한다.
// ⭐ 2026-10-19 요청 — 알림을 더 자연스럽게:
//   제목: "미배차 임박 (용운)"처럼 거래처명을 제목 옆 괄호로
//   1줄: 날짜·시간(오늘/내일/10/20(화) + 상차시간) — 상하차지보다 위에
//   2줄: 상차지 → 하차지
//   3줄: 나머지(화물·톤수·차종·기사·차량번호·전화번호)
// (관리자메뉴 > 알림 문구 설정에서 고른 항목만 나온다)
const KST_DAYS = ["일", "월", "화", "수", "목", "금", "토"];
function notifDateLabel(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(ymd || "")) return ymd || "";
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const tmr = new Date(Date.now() + 9 * 3600e3 + 86400e3).toISOString().slice(0, 10);
  const d = String(ymd).slice(0, 10);
  if (d === today) return "오늘";
  if (d === tmr) return "내일";
  const dt = new Date(`${d}T00:00:00Z`);
  return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}(${KST_DAYS[dt.getUTCDay()]})`;
}
function buildNotifTitle(base, fieldKeys, d) {
  const client = fieldKeys.includes("거래처명") ? String(d["거래처명"] || "").trim() : "";
  return client ? `${base} (${client})` : base;
}
function buildNotifBody(fieldKeys, d) {
  const has = (k) => fieldKeys.includes(k);
  const lines = [];
  // 1줄: 날짜·시간
  const when = [has("상차일") ? notifDateLabel(d["상차일"]) : "", has("상차시간") ? notifFieldValue("상차시간", d) : ""].filter(Boolean).join(" ");
  if (when) lines.push(`${when} 상차`);
  // 2줄: 상차지 → 하차지
  if (has("상차지명") && has("하차지명")) lines.push(`${notifFieldValue("상차지명", d)} → ${notifFieldValue("하차지명", d)}`);
  else if (has("상차지명")) lines.push(`상차 ${notifFieldValue("상차지명", d)}`);
  else if (has("하차지명")) lines.push(`하차 ${notifFieldValue("하차지명", d)}`);
  // 3줄: 나머지
  const rest = fieldKeys
    .filter((k) => !["거래처명", "상차일", "상차시간", "상차지명", "하차지명"].includes(k))
    .map((k) => notifFieldValue(k, d))
    .filter(Boolean);
  if (rest.length) lines.push(rest.join(" · "));
  return lines.join("\n");
}

/* ==============================
   ◆ 신규 오더 알림
============================== */
exports.notifyNewDispatch =
  functions.firestore
    .document("{col}/{dispatchId}")
    .onCreate(async (snap, context) => {
      const { col } = context.params;
      if (!["dispatch", "orders"].includes(col)) return;

      const data = snap.data();
      if (data?.블라인드 === true) return; // ★ 블라인드 오더(최고관리자 전용)는 알림 제외
      if (!data) return;
      // ⭐ 구글시트 가져오기로 한꺼번에 만든 예전 오더, 초기화 복원 중인 오더는 알림을 보내지 않는다
      if (data.importBatchId) return;
      if (data._recurring) return; // ★ 정기 오더 자동 생성분은 알림 없음(한꺼번에 만들어져 알림이 쏟아지지 않게)
      if (data._autoSheet) return; // ⭐ 2026-11-03 배차표 구글시트 자동 연동으로 만든 오더도 알림 없음
      if (await isBulkModeFor(data.companyName)) return;

      // ⭐ 화주사 전송 사본(source==="transport_transmit")은 이미 있던 오더를
      // 화주사 화면용으로 미러링만 한 문서라, 그대로 두면 "신규 오더 등록"이
      // 원본 생성 + 사본 생성으로 같은 오더에 두 번 뜬다(구글시트 중복과 동일한
      // 원인). 화면(DispatchApp.jsx)도 이 사본은 별도 알림을 안 띄운다.
      if (data.source === "transport_transmit") return;

      const isUrgent = data["긴급"] === true;
      const type = isUrgent ? "긴급배차" : "배차등록";
      const tokens = await getTokensForType(type, data.companyName);
      if (!tokens.length) {
        console.log("⊘ FCM 토큰 없음");
        return;
      }

      const templateConfig = await getNotificationTemplateConfig();
      const fields = getNotifFieldsForType(templateConfig, type);
      const body = buildNotifBody(fields, data);

      await sendPushAndCleanup(tokens, {
        notification: {
          title: buildNotifTitle(isUrgent ? "긴급 오더 등록" : "신규 오더 등록", fields, data),
          body,
        },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, type);
    });

/* ==============================
   ▸ 배차완료 알림
============================== */
exports.notifyDispatchDone =
  functions.firestore
    .document("{col}/{dispatchId}")
    .onUpdate(async (change, context) => {
      const { col } = context.params;
      if (!["dispatch", "orders"].includes(col)) return;

      const before = change.before.data();
      const after = change.after.data();
      if (after?.블라인드 === true) return; // ★ 블라인드 오더(최고관리자 전용)는 알림 제외
      if (!before || !after) return;
      if (after.source === "transport_transmit") return; // 위와 동일한 이유로 사본은 스킵

      // 차량번호가 새로 생긴 경우만
      const prevCar = String(before["차량번호"] || "").trim();
      const nextCar = String(after["차량번호"] || "").trim();
      if (prevCar || !nextCar) return;

      const tokens = await getTokensForType("배차완료", after.companyName || before.companyName);
      if (!tokens.length) return;

      const templateConfig = await getNotificationTemplateConfig();
      const doneFields = getNotifFieldsForType(templateConfig, "배차완료");
      const body = buildNotifBody(doneFields, after);

      await sendPushAndCleanup(tokens, {
        notification: {
          title: buildNotifTitle("배차완료", doneFields, after),
          body,
        },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, "배차완료");
    });

/* ==============================
   ↻ 재배차 알림 — 배차완료(기사 배정) 상태였다가, 그 기사가 빠지고 다시
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
      if (after?.블라인드 === true) return; // ★ 블라인드 오더(최고관리자 전용)는 알림 제외
      if (!before || !after) return;
      if (after.source === "transport_transmit") return;

      const prevCar = String(before["차량번호"] || "").trim();
      const nextCar = String(after["차량번호"] || "").trim();
      const nextStatus = String(after["배차상태"] || "").trim();
      // 기사가 배정돼 있었다가(prevCar 있음) 빠지고(nextCar 없음), 배차취소가
      // 아니라 다시 배차 대기(배차중) 상태로 돌아간 경우만 — 배차취소는
      // notifyDispatchCanceled가 별도로 처리한다.
      if (!prevCar || nextCar || nextStatus !== "배차중") return;

      const tokens = await getTokensForType("재배차", after.companyName || before.companyName);
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
   ✕ 배차취소 알림 — 오더가 취소(소프트: 배차상태→배차취소)되거나
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
      // ⭐ 블라인드 오더는 관리자 전체 알림만 제외하고, 배정된 기사 본인에게는 취소 알림을 보낸다
      const isBlind = after?.블라인드 === true;
      if (!before || !after) return;
      if (after.source === "transport_transmit") return;

      const prevStatus = String(before["배차상태"] || "").trim();
      const nextStatus = String(after["배차상태"] || "").trim();
      if (prevStatus === "배차취소" || nextStatus !== "배차취소") return; // 새로 취소된 경우만

      // ⭐ 사용자 요청 — PC "삭제" 버튼은 실제로는 deleteDoc이 아니라 배차상태를
      // "배차취소"로 바꾸는 소프트 취소다(모바일 취소내역/재등록을 위해). 그래서
      // 지입 기사에게 배정(대기/수락/완료)돼 있던 오더가 여기로 취소되면
      // notifyDispatchDeleted(onDelete)는 전혀 발동하지 않는다 — 여기서 그 기사
      // 본인에게 OS 푸시를 보낸다(알림함 기록은 클라이언트 removeDispatch가 남김).
      // 취소 직전 배정 정보는 before에만 남아있다(after는 이미 지워졌을 수 있음).
      // ⭐ 기사 본인 푸시를 관리자 알림보다 먼저 보낸다(관리자 쪽 처리 중 문제가 생겨도 기사 알림은 가게).
      // 기사확인상태가 다른 저장에서 먼저 지워졌더라도, 차량번호가 지입 기사면 보낸다(거절한 오더만 제외).
      const checkState = before["기사확인상태"];
      if (checkState !== "거절" && before["차량번호"]) try {
        const plate = normalizePlateServer(before["차량번호"]);
        // ⭐ 2026-11-02 점검 — 회사 구분 없이 차량번호로만 찾던 것을 이 오더 회사의 기사로 한정
        const driverDoc = await findDriverByPlate(before["차량번호"], before.companyName || after.companyName, (d) => normalizePlateServer(d.data()["차량번호"]) === plate && (checkState || d.data()["등급"] === "지입"));
        if (driverDoc) {
          const userSnap = await db.collection("users").doc(driverDoc.id).get();
          const userData = userSnap.exists ? userSnap.data() : null;
          if (userData?.driverPushEnabled !== false && userTokens(userData).length) {
            await sendPushAndCleanup(userTokens(userData), {
              notification: {
                title: "배차가 취소되었습니다",
                body: `담당자가 ${before["거래처명"] || ""} ${before["상차지명"] || "-"} → ${before["하차지명"] || "-"} 오더를 취소했습니다.`,
              },
              data: { type: "fleet_order_canceled", orderId: context.params.dispatchId },
              android: { priority: "high" },
              apns: { payload: { aps: { sound: "default" } } },
            }, "지입기사 오더취소(소프트)");
          } else {
            console.log("⊘ 오더취소 기사 푸시 생략(알림꺼짐/토큰없음):", driverDoc.id);
          }
        } else {
          console.log("⊘ 오더취소: 배정 기사 문서를 찾을 수 없음:", before["차량번호"]);
        }
      } catch (e) { console.error("오더취소 기사 푸시 실패:", e?.message || e); }

      const tokens = isBlind ? [] : await getTokensForType("배차취소", after.companyName || before.companyName);
      if (tokens.length) {
        await sendPushAndCleanup(tokens, {
          notification: {
            title: "배차취소",
            body: `${after["거래처명"] || ""} ${after["상차지명"] || "-"} → ${after["하차지명"] || "-"} 오더가 취소되었습니다.`,
          },
          android: { priority: "high" },
          apns: { payload: { aps: { sound: "default" } } },
        }, "배차취소(취소상태 전환)");
      }
    });

exports.notifyDispatchDeleted =
  functions.firestore
    .document("{col}/{dispatchId}")
    .onDelete(async (snap, context) => {
      const { col } = context.params;
      if (!["dispatch", "orders"].includes(col)) return;

      const data = snap.data();
      const isBlind = data?.블라인드 === true; // 블라인드는 관리자 전체 알림만 제외(기사 본인 알림은 보냄)
      if (!data) return;
      // ⭐ 운송사 초기화·가져오기 취소처럼 한꺼번에 지우는 중에는 삭제 알림을 보내지 않는다
      if (await isBulkModeFor(data.companyName)) return;
      if (data.source === "transport_transmit") return;
      // 배차취소로 먼저 바뀐 뒤 나중에 완전삭제된 문서는 위 notifyDispatchCanceled에서
      // 이미 알림을 보냈으니 여기서 또 보내지 않는다(중복 방지).
      if (data["배차상태"] === "배차취소") return;

      const tokens = isBlind ? [] : await getTokensForType("배차취소", data.companyName);
      if (tokens.length) {
        await sendPushAndCleanup(tokens, {
          notification: {
            title: "배차취소",
            body: `${data["거래처명"] || ""} ${data["상차지명"] || "-"} → ${data["하차지명"] || "-"} 오더가 삭제되었습니다.`,
          },
          android: { priority: "high" },
          apns: { payload: { aps: { sound: "default" } } },
        }, "배차취소(완전삭제)");
      }

      // ⭐ 사용자 요청 — 지입 기사에게 배정(대기/수락/완료)돼 있던 오더가 통째로
      // 삭제되면 그 기사 본인에게도 "배차가 취소되었습니다" 알림(알림함 기록 +
      // 푸시)을 남긴다. 거절 상태였던 오더는 이미 그 기사와 무관해진 것이라 제외.
      if (data["기사확인상태"] && data["기사확인상태"] !== "거절" && data["차량번호"]) {
        const plate = normalizePlateServer(data["차량번호"]);
        // ⭐ 2026-11-02 점검 — 삭제된 오더 회사의 기사로 한정
        const driverDoc = plate ? await findDriverByPlate(data["차량번호"], data.companyName) : null;
        if (driverDoc) {
          const body = `담당자가 ${data["거래처명"] || ""} ${data["상차지명"] || "-"} → ${data["하차지명"] || "-"} 오더를 삭제했습니다.`;
          // ⭐ 2026-11-05 기사앱 "삭제된 오더" 팝업 — PC/모바일 삭제 화면이 같은 id(orderDeleted_{오더id})로 먼저 남긴다.
          //  예전엔 화면(addDoc)과 서버(add)가 각각 써서 알림함에 같은 취소가 두 줄 쌓였다 → 같은 id로 create(이미 있으면 그대로 둔다:
          //  기사가 이미 [확인]한 팝업이 다시 뜨지 않게 덮어쓰지 않는다).
          const pick = (k) => (data[k] == null ? "" : String(data[k]));
          await db.collection("driver_notifications").doc(`orderDeleted_${context.params.dispatchId}`).create({
            driverId: driverDoc.id,
            type: "canceled",
            deleted: true,
            popup: data["기사확인상태"] === "대기" || data["기사확인상태"] === "수락",
            popupAck: false,
            orderId: context.params.dispatchId,
            title: "배차가 취소되었습니다",
            body,
            order: Object.fromEntries(["거래처명", "상차지명", "하차지명", "상차일", "상차시간", "하차일", "하차시간", "화물내용", "차량톤수", "기사운임"].map((k) => [k, pick(k)])),
            ...(data.companyName ? { companyName: data.companyName } : {}),
            createdAt: FieldValue.serverTimestamp(),
            read: false,
          }).catch(() => {});

          const userSnap = await db.collection("users").doc(driverDoc.id).get();
          const userData = userSnap.exists ? userSnap.data() : null;
          if (userData?.driverPushEnabled !== false && userTokens(userData).length) {
            await sendPushAndCleanup(userTokens(userData), {
              notification: { title: "배차가 취소되었습니다", body },
              data: { type: "fleet_order_canceled", orderId: context.params.dispatchId },
              android: { priority: "high" },
              apns: { payload: { aps: { sound: "default" } } },
            }, "지입기사 오더삭제취소");
          }
        }
      }
    });

function normalizePlateServer(v = "") {
  return String(v).replace(/\s+/g, "").toUpperCase();
}
// ⭐ 2026-11-02 점검 — 같은 차량번호가 다른 운송사에도 있을 수 있어(coDocKey/scopedDriverEmail) 오더의 회사 기사만 찾는다.
// companyName이 없는 예전 기사 문서는 "돌캐"로 본다 — Firestore where로 거르면 필드 없는 문서가 빠지므로 메모리에서 거른다.
async function findDriverByPlate(rawPlate, companyName, extraFilter) {
  const plate = normalizePlateServer(rawPlate || "");
  if (!plate) return null;
  const co = String(companyName || "돌캐").trim();
  const snap = await db.collection("drivers").where("차량번호", "==", rawPlate).limit(20).get();
  return snap.docs.find((d) => normalizePlateServer(d.data()["차량번호"]) === plate
    && String(d.data().companyName || "돌캐").trim() === co
    && (!extraFilter || extraFilter(d))) || null;
}

/* ==============================
   ▣ 지입 기사 — 새 오더 배정 알림(OS 푸시)
   DispatchApp.jsx/DriverHome.jsx가 오더의 기사확인상태를 "대기"로 걸면
   (관리자가 지입 기사 차량번호를 새로 입력했을 때) 그 기사 본인에게
   실제 푸시 알림을 보낸다. 기사 쪽은 drivers/{uid} 문서의 차량번호로
   매칭하고, 토큰은 users/{uid}.fcmToken(DriverHome이 로그인 시 저장)을 쓴다.
============================== */
// ⭐ 버그수정 — onUpdate만 리스닝했더니, 오더를 "신규 등록"하면서 차량번호까지
// 한 번에 입력하는 흔한 흐름(최초 addDoc 시점에 이미 기사확인상태:"대기"가
// 같이 저장됨)에서는 Cloud Functions가 "update"가 아니라 "create" 이벤트로
// 보기 때문에 이 트리거 자체가 전혀 발동하지 않았다(실시간 로그로 확인 — 몇 ms
// 만에 끝나는 실행이 반복됐는데, 이는 그 오더가 생성된 뒤 다른 필드가 바뀔
// 때마다 onUpdate가 불렸지만 매번 "이미 대기"라 조기 종료된 것이었다). 생성/
// 수정을 모두 받는 onWrite로 바꾼다.
exports.notifyFleetDriverNewOrder =
  functions.firestore
    .document("{col}/{dispatchId}")
    .onWrite(async (change, context) => {
      const { col } = context.params;
      if (!["dispatch", "orders"].includes(col)) return;

      const before = change.before.exists ? change.before.data() : null;
      const after = change.after.exists ? change.after.data() : null;
      if (!after) return; // 삭제는 별도 함수(notifyDispatchDeleted)에서 처리
      // ⭐ 가져오기로 만든 예전 오더·초기화 복원 중인 오더는 지입 기사에게 새 배차로 보내지 않는다
      if (!before && after.importBatchId) return;
      if (await isBulkModeFor(after.companyName)) return;

      // ⭐ 안전망 — 이 운송사 앱은 PC/모바일을 합쳐 "차량번호를 오더에 쓰는" 화면이
      // 한두 곳이 아니라 화면마다(등록폼/상세보기 기사배정/배차완료 모달/빠른배차
      // 등) 제각각 독립적인 함수로 updateDoc을 직접 호출한다 — 그래서 특정 화면
      // 하나에만 "기사확인상태:대기 세팅"을 넣는 방식은 매번 또 다른 경로를
      // 놓치는 문제가 반복됐다. 클라이언트가 어떤 코드로 어떻게 썼든 상관없이,
      // 여기(서버)에서 "차량번호가 새로 지정됐다"는 사실 자체를 감지해 직접
      // 보정한다. 재귀 방지: 기사확인상태가 이미 "대기"면(클라이언트가 이미
      // 세팅했거나 이 보정이 이미 실행된 경우) 다시 쓰지 않는다 — 그 다음에는
      // 바로 아래 알림 발송 로직이 이어서 처리한다.
      const prevPlateW = normalizePlateServer(before?.["차량번호"] || "");
      const nextPlateW = normalizePlateServer(after["차량번호"] || "");
      // ⭐ 고정노선 "기사님 수락 생략(자동 수락)" 오더는 이미 수락 상태로 만들어진다 — 승인대기로 되돌리지 않는다
      if (nextPlateW && nextPlateW !== prevPlateW && after["기사확인상태"] !== "대기" && !(after["자동수락"] && after["기사확인상태"] === "수락")) {
        // ⭐ 2026-11-02 점검 — 다른 회사 같은 번호 기사의 등급으로 승인대기를 잘못 거는 것 방지
        const wDriverDoc = await findDriverByPlate(after["차량번호"], after.companyName);
        // ⭐ 2026-11-02 기사앱에 가입한(uid가 있는) 지입 기사만 — 아직 가입 안 한 차량은 수락할 화면이 없어 승인대기로 멈춘다
        if (wDriverDoc?.data()?.["등급"] === "지입" && !!wDriverDoc.data().uid) {
          await change.after.ref.update({
            기사확인상태: "대기",
            기사거절사유: null,
            기사확인일시: null,
            기사완료일시: null,
            ...(after["배차상태"] !== "배차취소" ? { 배차상태: "승인대기", 상태: "승인대기" } : {}),
          });
          return; // 이 update가 onWrite를 다시 트리거 → 그 호출에서 아래 알림 발송 로직이 실행된다.
        }
      }

      // ⭐ 안전망(반대 방향) — 차량번호가 비워지는 경로(배차취소/재배정)도 화면마다
      // 제각각이라 기사확인상태 등을 안 지우는 곳이 있을 수 있다. after에 그
      // 흔적이 아직 남아있으면(= 클라이언트가 못 지운 경우) 서버가 직접 정리한다.
      // ⭐ 버그수정 — 예전엔 "흔적이 없으면(stillHasTrace===false) 클라이언트가 이미
      // 알림도 보냈을 것"이라고 가정하고 통째로 건너뛰었는데, 클라이언트(PC
      // patchDispatch 등)는 Firestore 필드 정리와 driver_notifications(알림함 기록)
      // 까지만 직접 하고 실제 OS 푸시(FCM)는 보낼 수 없다(브라우저에는 관리자 SDK가
      // 없음) — 그래서 PC에서 배차를 취소해도 알림함엔 기록이 남지만 휴대폰 푸시는
      // 영영 안 가고 있었다. 필드 정리/driver_notifications 기록은 클라이언트가 이미
      // 했으면 중복 방지로 건너뛰되, 실제 푸시 발송은 이 서버 함수만 할 수 있으므로
      // 취소가 감지되면 항상(stillHasTrace와 무관하게) 시도한다.
      // ⭐ 2026-11-02 점검 — 기사 본인이 거절(기사확인상태:"거절" + 차량번호 비움)한 저장은 담당자 취소가 아니다 —
      // 예전엔 여기로 들어와 거절 상태·사유를 지우고 거절한 기사에게 "배차가 취소되었습니다" 푸시까지 보냈다.
      if (!nextPlateW && prevPlateW && before?.["기사확인상태"] && before["기사확인상태"] !== "거절" && after["기사확인상태"] !== "거절") {
        const stillHasTrace = after["기사확인상태"] !== null && after["기사확인상태"] !== undefined;
        // ⭐ 2026-11-02 점검 — 취소 전 오더 회사의 기사로 한정
        const cDriverDoc = await findDriverByPlate(before["차량번호"], before?.companyName || after.companyName);
        if (stillHasTrace) {
          await change.after.ref.update({
            기사확인상태: null, 기사거절사유: null, 기사확인일시: null, 기사완료일시: null,
          });
        }
        if (cDriverDoc) {
          const body = `담당자가 ${before["거래처명"] || ""} ${before["상차지명"] || "-"} → ${before["하차지명"] || "-"} 오더에서 차량 배정을 취소했습니다.`;
          // driver_notifications(알림함 기록)는 클라이언트가 이미 썼을 수 있으니
          // stillHasTrace(=클라이언트가 못 지운 경우)일 때만 서버가 추가로 쓴다.
          if (stillHasTrace) {
            await db.collection("driver_notifications").add({
              driverId: cDriverDoc.id, type: "canceled", orderId: context.params.dispatchId,
              title: "배차가 취소되었습니다", body, createdAt: FieldValue.serverTimestamp(), read: false,
            }).catch(() => {});
          }
          const cUserSnap = await db.collection("users").doc(cDriverDoc.id).get();
          const cUserData = cUserSnap.exists ? cUserSnap.data() : null;
          // 오더 자체가 "배차취소"로 바뀐 경우엔 notifyDispatchCanceled가 같은 기사에게 이미
          // 푸시를 보내므로 여기선 보내지 않는다(같은 알림이 2번 오는 것 방지).
          const orderCanceledNow = String(after["배차상태"] || "").trim() === "배차취소" && String(before?.["배차상태"] || "").trim() !== "배차취소";
          if (!orderCanceledNow && cUserData?.driverPushEnabled !== false && userTokens(cUserData).length) {
            await sendPushAndCleanup(userTokens(cUserData), {
              notification: { title: "배차가 취소되었습니다", body },
              data: { type: "fleet_order_canceled", orderId: context.params.dispatchId },
              android: { priority: "high" },
              apns: { payload: { aps: { sound: "default" } } },
            }, "지입기사 오더취소(서버보정, 항상 발송)");
          }
        }
        return;
      }

      // 새로 "대기"로 바뀐 경우만(이미 대기였던 걸 다른 필드만 고친 저장엔 재알림하지 않음)
      if (after["기사확인상태"] !== "대기" || before?.["기사확인상태"] === "대기") return;

      const plate = normalizePlateServer(after["차량번호"] || "");
      if (!plate) return;

      // ⭐ 2026-11-02 점검 — 다른 회사 같은 번호 기사에게 이 회사 오더 푸시가 가던 것 방지(회사로 한정)
      const driverDoc = await findDriverByPlate(after["차량번호"], after.companyName);
      if (!driverDoc) { console.log("⊘ 배정 기사 문서를 찾을 수 없음:", after["차량번호"]); return; }

      const userSnap = await db.collection("users").doc(driverDoc.id).get();
      const userData = userSnap.exists ? userSnap.data() : null;
      // ⭐ 사용자 요청 — 기사 앱 설정에서 알림/푸시를 꺼놨으면(driverPushEnabled===false)
      // 보내지 않는다. 기본값은 켜짐(필드 자체가 없으면 보낸다).
      if (userData?.driverPushEnabled === false) { console.log("○ 지입 기사 알림 꺼둠:", driverDoc.id); return; }
      const token = userTokens(userData);
      if (!token.length) { console.log("⊘ 지입 기사 FCM 토큰 없음(앱 미접속 또는 알림권한 미허용):", driverDoc.id); return; }

      await sendPushAndCleanup(token, {
        notification: {
          title: "배차오더가 도착했습니다",
          body: `${after["거래처명"] || ""} ${after["상차지명"] || "-"} → ${after["하차지명"] || "-"}`,
        },
        data: { type: "fleet_new_order", orderId: context.params.dispatchId },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, "지입기사 신규오더 배정");
    });

/* ==============================
   ⊘ 지입 기사 — 오더 거절 알림(배차담당자 본인에게 OS 푸시)
============================== */
exports.notifyDispatcherOrderRejected =
  functions.firestore
    .document("{col}/{dispatchId}")
    .onUpdate(async (change, context) => {
      const { col } = context.params;
      if (!["dispatch", "orders"].includes(col)) return;

      const before = change.before.data();
      const after = change.after.data();
      if (!before || !after) return;
      if (after["기사확인상태"] !== "거절" || before["기사확인상태"] === "거절") return;

      // ⭐ 2026-11-02 점검 — 예전엔 createdByUid(등록자)에게만 보내서, 화주앱에서 요청한 오더(createdByUid 없음)는
      // 아무 담당자도 거절을 몰랐다. 등록자·배차확정자·기사 담당자를 모으고, 없으면 회사 '재배차' 알림 대상에게 보낸다.
      const co = after.companyName || before.companyName;
      const uids = [after["createdByUid"], after["배차확정자Uid"]];
      try {
        const rDriverDoc = before["차량번호"] ? await findDriverByPlate(before["차량번호"], co) : null;
        const mgr = rDriverDoc?.data()?.["담당자"];
        if (mgr && typeof mgr === "object" && mgr.uid) uids.push(mgr.uid);
      } catch (e) { console.warn("거절 알림 기사 담당자 조회 실패:", e?.message || e); }
      const recipUids = [...new Set(uids.filter((x) => typeof x === "string" && x))];
      let token = [];
      if (recipUids.length) {
        const uSnaps = await db.getAll(...recipUids.map((uid) => db.collection("users").doc(uid)));
        uSnaps.forEach((d) => { if (d.exists) token.push(...userTokens(d.data())); });
        token = [...new Set(token)];
      } else {
        token = await getTokensForType("재배차", co);
      }
      if (!token.length) return;

      // ⭐ 거절 처리와 동시에 차량번호/이름이 비워지므로(배차중으로 되돌림), after가
      // 아니라 거절 직전 상태인 before에서 기사 정보를 가져와야 "기사(-)" 로 비어
      // 보이지 않는다.
      const driverLabel = `${before["이름"] || after["이름"] || "기사"}(${before["차량번호"] || after["차량번호"] || "-"})`;
      await sendPushAndCleanup(token, {
        notification: {
          title: "오더가 거절되었습니다",
          body: `${driverLabel}님이 오더를 거절했습니다${after["기사거절사유"] ? `: ${after["기사거절사유"]}` : ""}`,
        },
        data: { type: "fleet_order_rejected", orderId: context.params.dispatchId },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, "지입기사 오더거절(담당자 알림)");
    });

/* ==============================
   ⏰ 2026-11-05 기사 출근 알림 — 출근을 자주 잊는(특히 연세 있는) 기사님께 OS 푸시로 알려준다.
   - 기사앱 설정 › "출근 알림"에서 정한 drivers/{uid}.출근시간("HH:MM", 한국시간) 기준
     · 10분 전쯤: "출근 10분 전입니다"  · 출근 시간(~30분): "출근 시간입니다"
   - 보내지 않는 경우: 출근알림:false · 근무요일(관리자 기사관리)이 정해져 있는데 오늘이 아님 · 이미 출근/운행중 ·
     휴차 · 오늘 최종퇴근 · 기사앱 알림 끔(users.driverPushEnabled:false) · 앱 미가입(uid 없음)
   - 같은 날 같은 단계는 한 번만: driver_notifications/checkin_{uid}_{날짜}_{단계} 를 create(이미 있으면 건너뜀) —
     기사앱 알림함(종)에도 그대로 남는다.
   - 5분마다 실행. 회사가 모두 국내라 한국시간(Asia/Seoul) 하나로 계산한다.
============================== */
const CHECKIN_DOW = ["일", "월", "화", "수", "목", "금", "토"];
function parseHM(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}
// 순수 판정(테스트하기 쉽게 분리) — 보낼 단계("before" | "start") 또는 null
function checkinReminderStage(d, nowMin, ymd, dow) {
  if (!d || d.출근알림 === false) return null;
  const start = parseHM(d.출근시간);
  if (start == null) return null;
  if (Array.isArray(d.근무요일) && d.근무요일.length && !d.근무요일.includes(CHECKIN_DOW[dow])) return null;
  const st = String(d.status || "").trim();
  if (st && st !== "퇴근" && st !== "대기") return null; // 출근·운행중·휴차는 보내지 않는다
  if (d.isFinalCheckout && d.workDate === ymd) return null;
  const diff = nowMin - start;
  if (diff >= -11 && diff < -3) return "before";
  if (diff >= 0 && diff < 30) return "start";
  return null;
}
exports.remindDriverCheckin = functions.runWith({ timeoutSeconds: 120, memory: "256MB" }).pubsub
  .schedule("every 5 minutes").timeZone("Asia/Seoul").onRun(async () => {
    const k = new Date(Date.now() + 9 * 3600e3);
    const ymd = k.toISOString().slice(0, 10);
    const nowMin = k.getUTCHours() * 60 + k.getUTCMinutes();
    const dow = k.getUTCDay();
    // 출근시간을 정한 기사만(단일 필드 조건이라 색인 추가 불필요)
    const snap = await db.collection("drivers").where("출근시간", ">", "").get().catch((e) => { console.warn("출근 알림 조회 실패:", e?.message || e); return null; });
    if (!snap || snap.empty) return null;
    let sent = 0;
    for (const dd of snap.docs) {
      const d = dd.data();
      const uid = d.uid || "";
      if (!uid || uid !== dd.id) continue; // 기사앱에 가입·연결된 문서(drivers/{uid})만
      const stage = checkinReminderStage(d, nowMin, ymd, dow);
      if (!stage) continue;
      const title = stage === "before" ? "출근 10분 전입니다" : "출근 시간입니다";
      const body = stage === "before"
        ? `${d.출근시간} 출근 — 도착하시면 기사앱의 [출근] 버튼을 꼭 눌러 주세요.`
        : "아직 출근 처리가 안 되어 있어요. 기사앱을 열고 [출근] 버튼을 눌러 주세요.";
      try {
        await db.collection("driver_notifications").doc(`checkin_${uid}_${ymd}_${stage}`).create({
          driverId: uid, type: "checkin", title, body, createdAt: FieldValue.serverTimestamp(), read: false,
          ...(d.companyName ? { companyName: d.companyName } : {}),
        });
      } catch (e) { continue; } // 이미 보냄(ALREADY_EXISTS) 또는 저장 실패 — 다시 보내지 않는다
      const u = await db.collection("users").doc(uid).get().then((x) => (x.exists ? x.data() : null)).catch(() => null);
      if (!u || u.driverPushEnabled === false) continue;
      const tokens = userTokens(u);
      if (!tokens.length) continue;
      await sendPushAndCleanup(tokens, {
        notification: { title, body },
        data: { type: "driver_checkin", tag: `checkin-${ymd}` },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, `기사 출근알림(${stage})`);
      sent++;
    }
    if (sent) console.log(`⏰ 출근 알림 ${sent}건 발송 (${ymd} ${Math.floor(nowMin / 60)}:${String(nowMin % 60).padStart(2, "0")})`);
    return null;
  });

/* ==============================
   ◆ 유가 API Proxy
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
      console.warn("▲ Fuel API endpoint 실패:", err?.message || err);
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
   ◷ 미배차 임박 자동 알림
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

    const tokenCache = {}; // ⭐ 회사별 직원에게만
    const tokensFor = async (co) => { const k = String(co || "돌캐"); if (!tokenCache[k]) tokenCache[k] = await getTokensForType("미배차", k); return tokenCache[k]; };
    const templateConfig = await getNotificationTemplateConfig();
    const notifFields = getNotifFieldsForType(templateConfig, "미배차");

    let sent = 0;
    for (const col of ["dispatch", "orders"]) {
      let snap;
      try {
        snap = await db.collection(col)
          .where("배차상태", "==", "배차중")
          .where("상차일", "==", todayStr)
          .get();
      } catch (e) {
        console.warn(`◷ ${col} 조회 실패:`, e?.message || e);
        continue;
      }

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        if (data.source === "transport_transmit") continue; // 원본(dispatch)과 중복 방지
        if (data.urgentPushSentAt) continue; // 이미 이 오더는 알림을 보냈음
        if (data.블라인드 === true) continue; // ★ 블라인드 오더는 미배차 알림 제외

        const t24 = normalizeTimeToHHMM(data["상차시간"]);
        if (!t24) continue;
        const dt = new Date(`${data["상차일"]}T${t24}:00+09:00`);
        const diffMin = (dt.getTime() - nowMs) / 60000;
        if (diffMin <= 0 || diffMin > URGENT_WINDOW_MIN) continue;

        const tokens = await tokensFor(data.companyName);
        if (!tokens.length) continue;

        try {
          await sendPushAndCleanup(tokens, {
            notification: {
              title: buildNotifTitle("미배차 임박", notifFields, data),
              body: buildNotifBody(notifFields, data),
            },
            android: { priority: "high" },
            apns: { payload: { aps: { sound: "default" } } },
          }, "미배차 임박");
          sent++;
        } catch (e) {
          console.warn("◷ 미배차 임박 알림 발송 실패:", e?.message || e);
        }

        await docSnap.ref.update({ urgentPushSentAt: FieldValue.serverTimestamp() }).catch(() => {});
      }
    }

    console.log(`◷ 미배차 임박 자동 알림 체크 완료 (발송 ${sent}건)`);
  });

/* ==============================
   ✎ 지입 기사 — 수락한 오더를 관리자가 수정하면 기사에게 알림
   상/하차지·일시·화물·운임·담당자·전달사항 중 바뀐 항목을 알려준다(푸시 + 알림함).
   기사앱은 오더의 기사확인값(수락/수정확인 시점 값)과 비교해 빨간 깜빡임 + 수정확인 버튼을 띄운다.
============================== */
const ORDER_WATCH_GROUPS = [
  ["상차지", ["상차지명", "상차지주소"]],
  ["하차지", ["하차지명", "하차지주소"]],
  ["상차일시", ["상차일", "상차시간"]],
  ["하차일시", ["하차일", "하차시간"]],
  ["화물정보", ["화물내용", "차량톤수", "차량종류"]],
  ["회전수", ["회전수"]],
  ["운임", ["기사운임"]],
  ["지급방식", ["지급방식"]],
  ["담당자 연락처", ["상차지담당자", "상차지담당자번호", "하차지담당자", "하차지담당자번호"]],
  ["전달사항", ["전달사항"]],
];
exports.notifyFleetOrderModified =
  functions.firestore
    .document("{col}/{dispatchId}")
    .onUpdate(async (change, context) => {
      const { col, dispatchId } = context.params;
      if (!["dispatch", "orders"].includes(col)) return;
      const before = change.before.data();
      const after = change.after.data();
      if (!before || !after) return;
      if (after["기사확인상태"] !== "수락" || before["기사확인상태"] !== "수락") return;
      if (after["배차상태"] === "배차취소") return;
      const plate = normalizePlateServer(after["차량번호"] || "");
      if (!plate || plate !== normalizePlateServer(before["차량번호"] || "")) return;

      const norm = (v) => (v == null ? "" : String(v).trim());
      // 회전수는 비어있음/1을 같은 값(1회)으로 본다
      const normF = (f, v) => (f === "회전수" ? (Number(v) > 1 ? String(Math.floor(Number(v))) : "") : norm(v));
      const labels = ORDER_WATCH_GROUPS
        .filter(([, fields]) => fields.some((f) => normF(f, before[f]) !== normF(f, after[f])))
        .map(([label]) => label);
      if (!labels.length) return;

      // ⭐ 2026-11-02 점검 — 오더 회사의 기사로 한정
      const driverDoc = await findDriverByPlate(after["차량번호"], after.companyName);
      if (!driverDoc) return;

      const route = `${after["상차지명"] || "-"} → ${after["하차지명"] || "-"}`;
      const title = "오더가 수정되었습니다";
      const body = `${after["거래처명"] ? after["거래처명"] + " " : ""}${route} 오더의 ${labels.join("·")} 정보가 변경되었습니다. 앱에서 확인 후 "수정확인"을 눌러주세요.`;

      await db.collection("driver_notifications").add({
        driverId: driverDoc.id, type: "order_modified", orderId: dispatchId,
        title, body, changed: labels, createdAt: FieldValue.serverTimestamp(), read: false,
      }).catch(() => {});

      const u = await db.collection("users").doc(driverDoc.id).get().catch(() => null);
      const ud = u?.exists ? u.data() : null;
      if (userTokens(ud).length && ud.driverPushEnabled !== false) {
        await sendPushAndCleanup(userTokens(ud), {
          notification: { title, body },
          data: { type: "fleet_order_modified", orderId: dispatchId },
          android: { priority: "high" },
          apns: { payload: { aps: { sound: "default" } } },
        }, "지입기사 오더수정");
      }
    });

/* ==============================
   ▸ 지입 기사 — 상차/하차 시간 지연 알림
   — 5분마다 실행. 오늘 "수락"(운송중) 상태인 지입 오더 중 상차시간(또는
   하차시간)이 지났는데 기사가 아직 상차지(하차지) 5km(진입) 반경 밖에 있으면,
   기사 본인과 담당자(기사 담당자 + 오더 등록자)에게 푸시를 보낸다.
   시간이 "즉시"처럼 정해지지 않은 오더는 대상이 아니다. 한 오더당 상차/하차
   각각 한 번만 보내도록 fleet_late_alerts/{오더ID_pickup|drop}에 기록한다.
   상/하차지 좌표는 geo_cache 컬렉션에 저장해 Tmap 호출을 줄인다.
============================== */
const TMAP_KEY_SERVER = "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer";
const LATE_ENTER_KM = 5;      // 진입 반경
const LATE_CHECK_WINDOW_MIN = 60; // 시간 지난 뒤 이 시간 안에만 판정(앱 재배포 등으로 늦게 돌아도 옛 오더 폭탄 방지)

function normalizeAddrSpacingServer(a) {
  return String(a || "")
    .replace(/\(.*?\)/g, " ")
    .replace(/(\d)\s*번지/g, "$1 ")
    .replace(/(로|길)(\d+(?:-\d+)?)(?![\d-]|번길|길|로|가)/g, "$1 $2 ")
    .replace(/([가-힣\d](?:동|리|가))(산?\d+(?:-\d+)?)(?![\d-]|번길|길|로|가|동|호|층)/g, "$1 $2 ")
    .replace(/\s+/g, " ")
    .trim();
}
function haversineKmServer(la1, lo1, la2, lo2) {
  const R = 6371;
  const d1 = (la2 - la1) * Math.PI / 180;
  const d2 = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(d1 / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(d2 / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
async function tmapGeocodeServer(address) {
  try {
    const url = "https://apis.openapi.sk.com/tmap/geo/fullAddrGeo?version=1&format=json&fullAddr=" + encodeURIComponent(address);
    const res = await fetch(url, { headers: { Accept: "application/json", appKey: TMAP_KEY_SERVER } });
    const c = (await res.json())?.coordinateInfo?.coordinate?.[0];
    if (!c) return null;
    for (const [la, lo] of [[c.lat, c.lon], [c.newLat, c.newLon]]) {
      const lat = parseFloat(la), lng = parseFloat(lo);
      if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) return { lat, lng };
    }
    return null;
  } catch {
    return null;
  }
}
// 정확한 좌표만 쓴다 — 시/구 단위로 뭉뚱그린 근사 좌표로 판정하면 엉뚱한 지연 알림이 갈 수 있다.
async function geocodeServerCached(rawAddr) {
  const addr = String(rawAddr || "").trim();
  if (!addr) return null;
  const id = Buffer.from(addr).toString("base64").replace(/[/+=]/g, "_").slice(0, 700);
  const ref = db.collection("geo_cache").doc(id);
  const snap = await ref.get().catch(() => null);
  if (snap?.exists) return snap.data().failed ? null : { lat: snap.data().lat, lng: snap.data().lng };
  const clean = normalizeAddrSpacingServer(addr);
  const raw = addr.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
  let g = await tmapGeocodeServer(clean);
  if (!g && raw !== clean) g = await tmapGeocodeServer(raw);
  if (g) await ref.set({ addr, lat: g.lat, lng: g.lng, at: FieldValue.serverTimestamp() }).catch(() => {});
  return g;
}

async function getUserToken(uid) {
  if (!uid) return null;
  const u = await db.collection("users").doc(uid).get().catch(() => null);
  return u?.exists ? userTokens(u.data()) : [];
}

exports.notifyFleetLateArrival = functions.pubsub
  .schedule("every 5 minutes")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const nowMs = Date.now();
    const todayStr = new Date(nowMs + 9 * 3600000).toISOString().slice(0, 10);
    let sent = 0;

    for (const col of ["dispatch", "orders"]) {
      let snap;
      try {
        snap = await db.collection(col).where("기사확인상태", "==", "수락").get();
      } catch (e) {
        console.warn(`▸ ${col} 조회 실패:`, e?.message || e);
        continue;
      }

      for (const docSnap of snap.docs) {
        const o = docSnap.data();
        if (o.source === "transport_transmit") continue;
        const plate = normalizePlateServer(o["차량번호"] || "");
        if (!plate) continue;

        const checks = [
          { kind: "pickup", label: "상차", date: o["상차일"], time: o["상차시간"], addr: o["상차지주소"], place: o["상차지명"] },
          { kind: "drop", label: "하차", date: o["하차일"] || o["상차일"], time: o["하차시간"], addr: o["하차지주소"], place: o["하차지명"] },
        ];

        for (const c of checks) {
          if (c.date !== todayStr) continue;
          const t24 = normalizeTimeToHHMM(c.time);
          if (!t24 || !c.addr) continue;
          const dueMs = new Date(`${c.date}T${t24}:00+09:00`).getTime();
          const lateMin = (nowMs - dueMs) / 60000;
          if (lateMin < 0 || lateMin > LATE_CHECK_WINDOW_MIN) continue;

          const markRef = db.collection("fleet_late_alerts").doc(`${docSnap.id}_${c.kind}`);
          const mark = await markRef.get().catch(() => null);
          if (mark?.exists) continue;

          // ⭐ 2026-11-02 점검 — 오더 회사의 기사로 한정
          const driverDoc = await findDriverByPlate(o["차량번호"], o.companyName);
          if (!driverDoc) continue;
          const drv = driverDoc.data();

          const geo = await geocodeServerCached(c.addr);
          if (!geo) continue; // 좌표를 정확히 못 구하면 판정하지 않는다(오알림 방지)

          const loc = drv.location;
          const hasLoc = loc?.lat != null && loc?.lng != null;
          const distKm = hasLoc ? haversineKmServer(loc.lat, loc.lng, geo.lat, geo.lng) : null;

          // 상차: 오늘 이미 상차지 1km 안에 다녀왔으면(이미 상차하고 떠난 경우) 지연 아님
          if (c.kind === "pickup" && (distKm == null || distKm > LATE_ENTER_KM)) {
            const tracks = await db.collection("gps_tracks")
              .where("driverId", "==", driverDoc.id).where("date", "==", todayStr).get().catch(() => null);
            const visited = tracks?.docs.some((d) => {
              const p = d.data();
              return p.lat != null && p.lng != null && haversineKmServer(p.lat, p.lng, geo.lat, geo.lng) <= 1;
            });
            if (visited) { await markRef.set({ skipped: "visited", at: FieldValue.serverTimestamp() }).catch(() => {}); continue; }
          }

          if (distKm != null && distKm <= LATE_ENTER_KM) {
            // 시간 맞춰 반경 안에 들어와 있음 — 이 오더/구간은 더 볼 필요 없음
            await markRef.set({ skipped: "inRange", distKm, at: FieldValue.serverTimestamp() }).catch(() => {});
            continue;
          }

          const driverLabel = `${o["이름"] || drv["이름"] || "기사"}(${o["차량번호"]})`;
          const distText = distKm != null ? `약 ${distKm.toFixed(1)}km 떨어져 있습니다` : "현재 위치가 확인되지 않습니다(앱 GPS 꺼짐 가능)";
          const place = c.place || c.addr;

          // 담당자: 기사 담당자 + 오더 등록자 (중복 제거)
          const mgrUids = [...new Set([drv["담당자"]?.uid, o["createdByUid"]].filter(Boolean))];
          const mgrTokens = [];
          for (const uid of mgrUids) {
            for (const t of await getUserToken(uid)) if (!mgrTokens.includes(t)) mgrTokens.push(t);
          }
          if (mgrTokens.length) {
            await sendPushAndCleanup(mgrTokens, {
              notification: {
                title: `⚠ ${c.label} 지연 우려 · ${driverLabel}`,
                body: `${c.label}시간(${t24})이 지났지만 아직 ${c.label}지 [${place}] 반경 밖입니다. ${distText}. 기사님께 확인 바랍니다.`,
              },
              data: { type: `fleet_late_${c.kind}`, orderId: docSnap.id },
              android: { priority: "high" },
              apns: { payload: { aps: { sound: "default" } } },
            }, `지입 ${c.label}지연(담당자)`);
          }

          const userSnap = await db.collection("users").doc(driverDoc.id).get().catch(() => null);
          const du = userSnap?.exists ? userSnap.data() : null;
          if (userTokens(du).length && du.driverPushEnabled !== false) {
            await sendPushAndCleanup(userTokens(du), {
              notification: {
                title: `${c.label}시간 알림 (${t24})`,
                body: `${c.label}시간이 지났습니다. ${c.label}지 [${place}]까지 ${distKm != null ? `약 ${distKm.toFixed(1)}km 남았습니다` : "위치 확인이 안 됩니다"}. 늦어지면 담당자에게 연락해주세요.`,
              },
              data: { type: `fleet_late_${c.kind}`, orderId: docSnap.id },
              android: { priority: "high" },
              apns: { payload: { aps: { sound: "default" } } },
            }, `지입 ${c.label}지연(기사)`);
            await db.collection("driver_notifications").add({
              driverId: driverDoc.id, type: `late_${c.kind}`, orderId: docSnap.id,
              title: `${c.label}시간 알림 (${t24})`,
              body: `${c.label}지 [${place}] 도착이 늦어지고 있습니다. ${distText}.`,
              createdAt: FieldValue.serverTimestamp(), read: false,
            }).catch(() => {});
          }

          await markRef.set({ sent: true, distKm, at: FieldValue.serverTimestamp() }).catch(() => {});
          sent++;
        }
      }
    }
    console.log(`▸ 지입 상/하차 지연 체크 완료 (발송 ${sent}건)`);
  });

/* ==============================
   ✕ 첨부파일 6개월 경과 자동삭제
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

    console.log(`✕ 6개월 경과 첨부파일 자동삭제 완료: ${deleted}건`);
  });

/* ==============================================================
   ◆ 사내 메신저 새 메시지 알림 (백그라운드 푸시)
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
    // ⭐ 2026-11-03 단체방 안내 문구(초대·나감·이름변경 = type "system")는 푸시 안 보냄 — 알림 폭탄 방지
    if (data.type === "system") return;

    const roomSnap = await db.collection("chat_rooms").doc(data.roomId).get();
    if (!roomSnap.exists) return;
    const members = (roomSnap.data()?.members || []).filter((uid) => uid !== data.senderUid);
    if (!members.length) return;

    // ⭐ 2026-11-06 @멘션된 사람은 제목에 "님이 회원님을 언급" — 따로 묶어 보낸다
    const mentioned = new Set(Array.isArray(data.mentions) ? data.mentions : []);
    const tokens = [];
    const mentionTokens = [];
    await Promise.all(members.map(async (uid) => {
      try {
        const uSnap = await db.collection("users").doc(uid).get();
        if (isPushTypeEnabled(uSnap.data()?.pushPrefs, "메신저")) (mentioned.has(uid) ? mentionTokens : tokens).push(...userTokens(uSnap.data()));
      } catch (e) {
        console.warn("메신저 알림용 토큰 조회 실패:", uid, e?.message || e);
      }
    }));
    if (!tokens.length && !mentionTokens.length) return;

    const o = data.order || {};
    const body = data.type === "image" ? "사진을 보냈습니다"
      : data.type === "order" ? `[오더] ${o.상차지명 || "-"} → ${o.하차지명 || "-"}${o.상차일 ? ` (${o.상차일})` : ""}`
        : String(data.text || "").slice(0, 80);
    const base = { android: { priority: "high" }, apns: { payload: { aps: { sound: "default" } } } };
    if (tokens.length) {
      await sendPushAndCleanup(tokens, { ...base, notification: { title: data.senderName || "사내 메신저", body } }, "사내 메신저");
    }
    if (mentionTokens.length) {
      await sendPushAndCleanup(mentionTokens, { ...base, notification: { title: `${data.senderName || "누군가"}님이 회원님을 언급했습니다`, body } }, "사내 메신저(멘션)");
    }
  });

/* ==============================================================
   ◆ 관리자 발신 푸시 (최고관리자 전용) — 제목/내용을 직접 써서 전체 발송,
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
      tokens = userTokens(uSnap.data());
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
   ▥ 구글시트(배차현황) 실시간 연동
   ----------------------------------------------------------------
   돌캐(userCompany==="돌캐")가 배차프로그램에 오더를 등록/수정할 때마다,
   기존에 쓰던 구글시트(월별 탭 구조)에도 같은 내용이 실시간으로 반영되게
   한다. 별도의 서비스계정 키 파일 없이, 이 Firebase 프로젝트의 기본
   런타임 서비스계정(Application Default Credentials)으로 인증한다 —
   그래서 이 스프레드시트를 그 서비스계정 이메일(보통
   "<프로젝트ID>@appspot.gserviceaccount.com")에게 "편집자"로 공유해두기만
   하면 별도 설정 없이 바로 동작한다.

   ⚠ 주의(범위):
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
// ⭐ 프로그램 → 구글시트 연결 스위치(2026-10-21) — 마지막 백필 이후 구글시트는 사람이 직접(수기) 작성한다.
// false면 오더 등록·수정·삭제가 시트에 자동 반영되지 않고, 시트를 비우고 다시 채우는 백필·자동 맞추기도 막아
// 수기로 적은 내용이 지워지지 않게 한다. 다시 연결하려면 true로 바꾸고 functions 배포.
const GSHEET_PROGRAM_LINK_ENABLED = false;
// ⭐ "내 오더만 보내기"(2026-10-26) — 전체 연결은 끈 채로, 지정한 한 계정이 켠 시각 이후 "새로 등록한" 오더만
// 시트의 월별 탭·날짜 칸에 맞춰 넣는다. 다른 사람이 손으로 적은 줄은 건드리지 않도록, 이 모드의 오더는
// 오더ID 열로만 자기 줄을 찾는다(줄번호·날짜로 추측하지 않음). 설정: adminSecrets/gsheetMine { enabled, email, since }
const GSHEET_MINE_DOC = db.collection("adminSecrets").doc("gsheetMine");
let _gsheetMineCache = { at: 0, v: null };
async function getGsheetMineConfig() {
  if (Date.now() - _gsheetMineCache.at > 15000) {
    const snap = await GSHEET_MINE_DOC.get().catch(() => null);
    _gsheetMineCache = { at: Date.now(), v: snap?.exists ? snap.data() : null };
  }
  return _gsheetMineCache.v;
}
// 시트 날짜 칸 값("2026. 10. 27" / "2026-10-27" / "2026/10/27" / "10/27")을 YYYY-MM-DD로 맞춘다
function gsheetNormDate(v, yearHint) {
  const t = String(v || "").trim();
  if (!t) return "";
  let m = t.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})\D+(\d{1,2})$/);
  if (m && yearHint) return `${yearHint}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return t;
}
// ⭐ 같은 날짜 칸의 순번을 1부터 다시 매긴다(내 오더만 보내기 모드) — 사람이 적은 순번은 숫자라서,
//    프로그램 오더를 그날 맨 위에 끼워넣으면 "1"이 두 개가 됐다. 날짜 칸 전체를 위에서부터 1,2,3…으로 고친다.
async function renumberGsheetDate(tabName, date) {
  const target = gsheetNormDate(date);
  if (!target) return;
  const colMap = await getGsheetColumnMap(tabName);
  if (!colMap.순번 || !colMap.상차일) return;
  const res = await gsheetApi("GET", `/values:batchGet?ranges=${encodeURIComponent(`${quoteTab(tabName)}!${colMap.상차일}2:${colMap.상차일}3000`)}&ranges=${encodeURIComponent(`${quoteTab(tabName)}!${colMap.순번}2:${colMap.순번}3000`)}`);
  const dates = res.valueRanges?.[0]?.values || [];
  const seqs = res.valueRanges?.[1]?.values || [];
  const yearHint = target.slice(0, 4);
  const data = [];
  let n = 0;
  for (let i = 0; i < dates.length; i++) {
    if (gsheetNormDate(dates[i]?.[0], yearHint) !== target) continue;
    n += 1;
    if (String(seqs[i]?.[0] ?? "").trim() !== String(n)) data.push({ range: `${quoteTab(tabName)}!${colMap.순번}${i + 2}`, values: [[n]] });
  }
  for (let i = 0; i < data.length; i += 200) {
    await gsheetApi("POST", "/values:batchUpdate", { data: { valueInputOption: "RAW", data: data.slice(i, i + 200) } });
  }
}
// 여러 날짜의 순번을 한 번 읽고 한 번 써서 다시 매긴다
async function renumberGsheetDates(tabName, dateList) {
  const targets = new Set(dateList.map((d) => gsheetNormDate(d)).filter(Boolean));
  if (!targets.size) return;
  const colMap = await getGsheetColumnMap(tabName);
  if (!colMap.순번 || !colMap.상차일) return;
  const res = await gsheetApi("GET", `/values:batchGet?ranges=${encodeURIComponent(`${quoteTab(tabName)}!${colMap.상차일}2:${colMap.상차일}3000`)}&ranges=${encodeURIComponent(`${quoteTab(tabName)}!${colMap.순번}2:${colMap.순번}3000`)}`);
  const dates = res.valueRanges?.[0]?.values || [];
  const seqs = res.valueRanges?.[1]?.values || [];
  const yearHint = [...targets][0].slice(0, 4);
  const counter = new Map();
  const data = [];
  for (let i = 0; i < dates.length; i++) {
    const d = gsheetNormDate(dates[i]?.[0], yearHint);
    if (!targets.has(d)) continue;
    const n = (counter.get(d) || 0) + 1; counter.set(d, n);
    if (String(seqs[i]?.[0] ?? "").trim() !== String(n)) data.push({ range: `${quoteTab(tabName)}!${colMap.순번}${i + 2}`, values: [[n]] });
  }
  for (let i = 0; i < data.length; i += 500) {
    await gsheetApi("POST", "/values:batchUpdate", { data: { valueInputOption: "RAW", data: data.slice(i, i + 500) } });
  }
}

// ⭐ [구글시트로 전송] 한 번에 넣기(2026-10-27) — 예전 백필처럼 탭마다 한 번 읽고, 줄을 한 번에 끼워넣고,
//    값을 한 번에 쓰고, 순번을 한 번에 다시 매긴다(예전엔 오더마다 8번 넘게 시트를 오가 6건에도 한참 걸렸다).
//    items: [{ ref, path, data }] — 날짜 오름차순·같은 날짜는 먼저 등록한 것부터
async function sendGsheetMineBatch(items) {
  const byTab = new Map();
  const skipped = [];
  for (const it of items) {
    if (!isGsheetDolcaeOrder(it.data)) { skipped.push(it); continue; } // ⭐ 2026-11-06 돌캐 오더만
    const tab = isGsheetCanceled(it.data) ? null : gsheetMonthTabName(it.data.상차일); // ★ 블라인드여도 내 오더는 시트로 보낸다(프로그램에서만 숨김)
    if (!tab) { skipped.push(it); continue; }
    if (!byTab.has(tab)) byTab.set(tab, []);
    byTab.get(tab).push(it);
  }
  let sent = 0;
  for (const [tab, list] of byTab) {
    await ensureGsheetMonthTab(tab);
    let already = [];
    await withGsheetTabLock(tab, async () => {
      const colMap = await ensureGsheetIdColumn(tab);
      const sheetProps = (await getGsheetSheetList()).find((x) => x.title === tab);
      const dateCol = colMap.상차일 || "B";
      const got = await gsheetApi("GET", `/values:batchGet?ranges=${encodeURIComponent(`${quoteTab(tab)}!${dateCol}2:${dateCol}3000`)}${colMap.오더ID ? `&ranges=${encodeURIComponent(`${quoteTab(tab)}!${colMap.오더ID}2:${colMap.오더ID}3000`)}` : ""}`);
      const dateVals = got.valueRanges?.[0]?.values || [];
      const idVals = got.valueRanges?.[1]?.values || [];
      const existingIds = new Set(idVals.map((r) => String(r?.[0] ?? "").trim()).filter(Boolean));
      const fresh = list.filter((it) => !existingIds.has(it.path));
      already = list.filter((it) => existingIds.has(it.path)); // 이미 시트에 있는 오더는 아래에서 한 건씩 맞춘다

      // 날짜 칸(블록) — findGsheetInsertPosition과 같은 기준
      const yearHint = gsheetNormDate(list[0].data.상차일).slice(0, 4);
      const blocks = []; let open = null;
      for (let i = 0; i < dateVals.length; i++) {
        const v = gsheetNormDate(dateVals[i]?.[0], yearHint); const row = i + 2;
        if (!v) { open = null; continue; }
        if (open && open.date === v) { open.endRow = row; continue; }
        open = { date: v, startRow: row, endRow: row }; blocks.push(open);
      }
      // 날짜별로 묶기(같은 날짜는 최근 등록이 맨 위)
      const groups = new Map();
      for (const it of fresh) { const d = gsheetNormDate(it.data.상차일); if (!groups.has(d)) groups.set(d, []); groups.get(d).push(it); }
      for (const g of groups.values()) g.reverse();
      // 끼워넣을 자리: 같은 날짜 칸 맨 위 / 다음 날짜 칸 앞(+빈 구분줄) / 맨 끝(빈 구분줄 다음)
      const plans = []; // { at, rows:[it | null(빈 구분줄)], inherit } — 같은 자리에 넣을 것은 날짜 순서대로 한 묶음
      const planAt = (at, inherit) => { let p = plans.find((x) => x.at === at); if (!p) { p = { at, rows: [], inherit }; plans.push(p); } return p; };
      const tail = [];
      for (const d of [...groups.keys()].sort()) {
        const g = groups.get(d);
        const same = blocks.find((b) => b.date === d);
        if (same) { planAt(same.startRow, false).rows.push(...g); continue; }
        const next = blocks.find((b) => b.date > d);
        if (next) { planAt(next.startRow, next.startRow > 2).rows.push(...g, null); continue; }
        if (blocks.length || tail.length) tail.push(null);
        tail.push(...g);
      }
      // 아래쪽 자리부터 끼워넣어야 위쪽 자리 번호가 안 바뀐다
      plans.sort((a, b) => b.at - a.at);
      const requests = plans.map((p) => ({ insertDimension: { range: { sheetId: sheetProps.sheetId, dimension: "ROWS", startIndex: p.at - 1, endIndex: p.at - 1 + p.rows.length }, inheritFromBefore: p.inherit } }));
      const finalRows = [];
      for (const p of plans) {
        const shift = plans.filter((q) => q.at < p.at).reduce((n, q) => n + q.rows.length, 0);
        p.rows.forEach((it, i) => { if (it) finalRows.push({ it, row: p.at + shift + i }); });
      }
      const totalInserted = plans.reduce((n, p) => n + p.rows.length, 0);
      if (tail.length) {
        // 맨 끝: 마지막 날짜 칸 아래 비어 있는 줄에 이어 쓴다(모자라면 줄을 늘림)
        const lastEnd = blocks.length ? blocks[blocks.length - 1].endRow + totalInserted : 1;
        let r = lastEnd + 1;
        for (const it of tail) { if (it) finalRows.push({ it, row: r }); r += 1; }
        const have = (sheetProps.gridProperties?.rowCount || 1) + totalInserted;
        if (r > have) requests.push({ insertDimension: { range: { sheetId: sheetProps.sheetId, dimension: "ROWS", startIndex: have, endIndex: r }, inheritFromBefore: true } }); // 서식은 바로 위 줄에서 이어받음
      }
      if (requests.length) await gsheetApi("POST", ":batchUpdate", { data: { requests } });
      const ranges = [];
      finalRows.forEach(({ it, row }) => ranges.push(...buildGsheetOrderRowRanges(tab, row, it.data, colMap, it.path)));
      for (let i = 0; i < ranges.length; i += 500) {
        await gsheetApi("POST", "/values:batchUpdate", { data: { valueInputOption: "USER_ENTERED", data: ranges.slice(i, i + 500) } });
      }
      await renumberGsheetDates(tab, [...groups.keys()]).catch((e) => console.warn("순번 다시 매기기 실패:", e?.message || e));
      // ⭐ 2026-10-27 — 한 묶음(batch)으로 표시하면, 보내는 사이 프로그램에서 지운 오더가 1건만 있어도 묶음 전체가
      //    실패하고 그 오더의 줄은 시트에 남았다(지운 오더가 시트에 1건 남던 원인). 한 건씩 표시하고, 이미 지워진
      //    오더는 방금 넣은 줄을 바로 지운다.
      const gone = [];
      await Promise.all(finalRows.map(({ it, row }) => it.ref.update({ _gsheetMineSent: true, _gsheetMineSentAt: FieldValue.serverTimestamp(), _gsheetSync: { tab, row, doc: it.path } })
        .then(() => { sent += 1; })
        .catch((e) => { if (e?.code === 5 || /NOT_FOUND|No document/i.test(String(e?.message || e))) gone.push(it.path); else throw e; })));
      if (gone.length) {
        const rows = [];
        for (const path of gone) rows.push(...await findGsheetRowsById(tab, colMap, path));
        for (const r of rows.sort((x, y) => y - x)) await removeGsheetRowUnlocked(tab, r);
      }
    });
    for (const it of already) {
      await it.ref.update({ _gsheetMineSent: true, _gsheetMineSentAt: FieldValue.serverTimestamp() });
      await syncOneDispatchToGsheet(it.path, { ...it.data, _gsheetMineSent: true }, { ...it.data, _gsheetMineSent: true });
      sent += 1;
    }
  }
  // 취소·날짜 없는 오더는 시트에 넣지 않고 전송 처리만(나중에 다시 살아나면 그때 반영)
  for (const it of skipped) await it.ref.update({ _gsheetMineSent: true, _gsheetMineSentAt: FieldValue.serverTimestamp() }).catch(() => {});
  // 기사 기준표(고유값) — 차량번호별 한 번씩
  const seen = new Set();
  for (const it of items) {
    const plate = String(it.data.차량번호 || "").trim();
    if (!plate || seen.has(plate)) continue; seen.add(plate);
    await ensureDriverInGsheetUniqueTab(plate, it.data.이름, it.data.전화번호).catch(() => {});
  }
  return { sent, skipped: skipped.length };
}
const GSHEET_LINK_OFF_MESSAGE = "프로그램과 구글시트 연결이 끊겨 있습니다(시트 수기 작성 중) — 시트를 덮어쓰지 않도록 이 작업은 실행하지 않았습니다.";
// 이 시트 전용 동기화 대상 회사명 — 다른 회사 데이터가 섞이지 않도록 반드시 필터링한다.
const GSHEET_TARGET_COMPANY = "돌캐";
// ⭐ 2026-11-06 돌캐 시트에는 돌캐 오더만 — "내 오더만 보내기"가 작성자 이메일만 보고 회사를 안 봐서,
//  최고관리자가 다른 운송사(예: 태진)에서 고정노선·배차표 오더를 만들면 그 오더까지 돌캐 시트에 들어갔다.
//  다른 회사 오더 · 배차표(구글시트 고정노선) 오더 · 지입차관리 고정노선 오더는 전송 대상에서 뺀다.
function isGsheetDolcaeOrder(d) {
  if (!d) return false;
  if ((d.companyName || GSHEET_TARGET_COMPANY) !== GSHEET_TARGET_COMPANY) return false;
  if (d.배차표Id || d._autoSheet || d.고정노선Id || d.등록기기 === "배차표") return false;
  return true;
}
// "차량번호로 기사명/전화번호 자동매칭"에 쓰이는 기준표 시트 이름(A:기사명, B:차량정보(차량번호), C:전화번호, D:비고).
const GSHEET_UNIQUE_TAB = "고유값";

// ⭐ 프로그램 화면(DispatchApp.jsx의 dispatchData 합성 로직)이 취소된 오더를 걸러낼 때
// 쓰는 것과 동일한 기준 — 배차상태뿐 아니라 상태(화주사 취소 등)로만 표시되는 취소도
// 함께 잡아야 화면과 시트의 "취소 제외" 기준이 일치한다.
const GSHEET_CANCELED_STATUS_LIST = ["취소", "배차취소", "오더취소", "취소됨"];

/* ------------------------------------------------------------------
   ★ 열 위치를 하드코딩(B~J, K, L, M:N ...)하지 않고 매번 그 탭의 1행(헤더)을
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
  등록일: ["등록일"],
  상차일: ["상차일"],
  상차시간: ["상차시간"],
  하차일: ["하차일"],
  하차시간: ["하차시간"],
  거래처명: ["거래처명"],
  상차지: ["상차지명", "상차지"],
  경유지: ["경유지"],
  상차지주소: ["상차지주소", "상하지주소"],
  하차지: ["하차지명", "하차지"],
  하차지주소: ["하차지주소"],
  화물정보: ["화물내용", "화물정보"],
  차량종류: ["차량종류"],
  차량톤수: ["차량톤수"],
  혼적: ["혼적"],
  차량번호: ["차량번호"],
  기사명: ["이름", "기사명"],
  전화번호: ["전화번호"],
  배차상태: ["배차상태"],
  청구운임: ["청구운임"],
  기사운임: ["기사운임", "기사님요금"],
  수수료: ["수수료"],
  매익율: ["매익율"],
  지급방식: ["지급방식", "선/착불"],
  프로그램: ["배차방식", "프로그램"],
  메모: ["메모"],
  // ⭐ 2026-10-20 — 시트 행 ↔ 프로그램 오더를 1:1로 정확히 잇는 열(숨김). 이 열이 없던 예전엔
  // "몇 번째 줄" 번호(_gsheetSync.row)만으로 찾아서, 번호가 어긋나면 엉뚱한 줄을 고치거나
  // 지우지 못해 시트에 오더가 더 많이 남는 일이 있었다.
  오더ID: ["오더ID"],
};

// ⭐ 사용자 요청 — 매번 시트에 헤더를 손으로 직접 쳐넣지 않아도 되도록, 백필이
// 이 순서/이름 그대로 헤더 행 자체를 매번 다시 써준다(거래처 백필과 동일한
// 방식). 순서를 바꾸고 싶으면 이 배열 순서를 바꾸면 된다 — 실제 값 배치는
// 어차피 헤더 텍스트(GSHEET_FIELD_HEADER_CANDIDATES)로 찾으므로, 이 배열
// 순서를 바꿔도 다른 로직은 안 건드려도 된다.
const GSHEET_MONTH_HEADER_COLUMNS = [
  "순번", "등록일", "상차일", "상차시간", "하차일", "하차시간",
  "거래처명", "상차지명", "상차지주소", "하차지명", "하차지주소",
  "화물내용", "차량종류", "차량톤수", "혼적", "차량번호",
  "이름", "전화번호", "배차상태", "청구운임", "기사운임",
  "수수료", "지급방식", "배차방식", "메모", "오더ID",
];

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

// gsheetColLetter의 역함수 — 시트 열 문자(A, B, ..., Z, AA, ...) → 0-based 열 인덱스.
// 백필이 청구운임/기사운임/수수료/매익율 칸에 숫자·퍼센트 서식을 직접 지정할 때
// repeatCell 요청의 startColumnIndex/endColumnIndex를 구하는 용도로 쓴다.
function gsheetColIndexFromLetter(letter) {
  let n = 0;
  for (const ch of String(letter || "").toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
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
  return [...pickupList, ...dropList].map((s) => String(s?.업체명 || "").trim()).filter(Boolean).join(", ");
}

/* ------------------------------------------------------------------
   ▤ 거래처(기본거래처=clients / 하차지거래처=places) 마스터 데이터를
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
  if (method === "POST" && path === ":batchUpdate") _gsheetSheetListCache = { at: 0, v: null }; // 행·열·탭 구조가 바뀜
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

// ⭐ 2026-10-27 속도 — 탭 목록을 오더마다 2~3번씩 다시 받던 것을 20초 동안 재사용(탭·행 구조를 바꾸면 바로 버림)
let _gsheetSheetListCache = { at: 0, v: null };
async function getGsheetSheetList() {
  if (_gsheetSheetListCache.v && Date.now() - _gsheetSheetListCache.at < 20000) return _gsheetSheetListCache.v;
  const data = await gsheetApi("GET", "?fields=sheets.properties");
  const v = (data.sheets || []).map((s) => s.properties);
  _gsheetSheetListCache = { at: Date.now(), v };
  return v;
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
      console.warn(`⚠ "${tabName}" 탭에서 배차상태 헤더를 못 찾아 배차상태 수식을 다시 심지 못했습니다.`);
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
  try { await applyGsheetInputGuides(tabName); } catch (e) { console.warn("필수칸 표시 적용 실패(무시):", e?.message || e); }
  return newProps;
}

/* ==================================================================
   ✎ 시트 직접 입력 도우미(2026-10-20 요청) — 월별 탭에 한 번 적용해두면 시트가 알아서 표시한다
   ① 필수칸: 그 줄에 뭔가 입력하기 시작했는데 필수칸이 비어 있으면 연한 빨간 배경 → 입력하면 바로 사라짐
      (구글시트 "조건부 서식"은 테두리를 바꿀 수 없어서 배경색으로 표시)
   ② 머리줄: 필수 항목 이름을 빨간 글씨·연한 빨간 배경으로 + 마우스를 올리면 "필수 입력" 메모, 머리줄 고정
   ③ 목록 선택: 차량종류·지급방식·배차방식은 프로그램과 같은 목록을 고를 수 있게(목록에 없는 값도 입력은 됨, 경고만)
   ④ 운임: 청구운임·기사운임에 숫자가 아닌 값을 넣으면 경고
================================================================== */
const GSHEET_REQUIRED_FIELDS = ["상차일", "상차시간", "하차일", "하차시간", "거래처명", "상차지", "하차지", "화물정보", "차량종류", "차량톤수", "차량번호", "청구운임", "기사운임", "지급방식", "프로그램"];
const GSHEET_LIST_OPTIONS = {
  차량종류: ["라보", "다마스", "오토바이", "윙바디", "탑", "카고", "윙/카고", "냉장윙", "냉동윙", "냉장탑", "냉동탑", "냉장/냉동탑", "냉장/냉동윙"],
  지급방식: ["계산서", "착불", "선불", "계좌이체"],
  프로그램: ["24시", "인성", "직접배차", "24시(외부업체)"],
};
const GSHEET_GUIDE_MARK = `"필수"="필수"`; // 이 표시가 든 조건부 서식은 이 기능이 만든 것 — 다시 적용할 때 지우고 새로 만든다
async function applyGsheetInputGuides(tabName) {
  _gsheetColMapCache.delete("order:" + tabName);
  const colMap = await getGsheetColumnMap(tabName);
  const meta = await gsheetApi("GET", `?fields=${encodeURIComponent("sheets(properties(sheetId,title),conditionalFormats)")}`);
  const sh = (meta.sheets || []).find((x) => x.properties?.title === tabName);
  if (!sh) return;
  const sheetId = sh.properties.sheetId;
  const requests = [];
  // 예전에 이 기능이 만든 규칙 제거(뒤에서부터)
  (sh.conditionalFormats || []).map((r, i) => ({ r, i })).reverse().forEach(({ r, i }) => {
    const f = r.booleanRule?.condition?.values?.[0]?.userEnteredValue || "";
    if (f.includes(GSHEET_GUIDE_MARK)) requests.push({ deleteConditionalFormatRule: { sheetId, index: i } });
  });
  const reqCols = GSHEET_REQUIRED_FIELDS.map((f) => colMap[f]).filter(Boolean);
  if (!reqCols.length) return;
  const anyFilled = `LEN(${reqCols.map((c) => `$${c}2`).join("&")})>0`;
  const colRange = (c) => ({ sheetId, startRowIndex: 1, startColumnIndex: gsheetColIndexFromLetter(c), endColumnIndex: gsheetColIndexFromLetter(c) + 1 });
  reqCols.forEach((c) => {
    requests.push({
      addConditionalFormatRule: {
        index: 0,
        rule: {
          ranges: [colRange(c)],
          booleanRule: {
            condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: `=AND(${c}2="",${anyFilled},${GSHEET_GUIDE_MARK})` }] },
            format: { backgroundColor: { red: 0.99, green: 0.86, blue: 0.86 } },
          },
        },
      },
    });
  });
  // 머리줄: 필수 항목 표시 + 메모
  reqCols.forEach((c) => {
    const ci = gsheetColIndexFromLetter(c);
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: ci, endColumnIndex: ci + 1 },
        cell: { note: "필수 입력 — 비어 있으면 연한 빨간색으로 표시됩니다", userEnteredFormat: { backgroundColor: { red: 1, green: 0.89, blue: 0.89 }, textFormat: { bold: true, foregroundColor: { red: 0.78, green: 0.16, blue: 0.16 } } } },
        fields: "note,userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.foregroundColor",
      },
    });
  });
  // 목록 선택(경고만, 다른 값도 입력 가능)
  for (const [field, list] of Object.entries(GSHEET_LIST_OPTIONS)) {
    const c = colMap[field];
    if (!c) continue;
    requests.push({
      setDataValidation: {
        range: colRange(c),
        rule: { condition: { type: "ONE_OF_LIST", values: list.map((v) => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false, inputMessage: `목록에서 고르거나 직접 입력하세요` },
      },
    });
  }
  // 운임은 숫자(경고만)
  ["청구운임", "기사운임"].forEach((field) => {
    const c = colMap[field];
    if (!c) return;
    requests.push({
      setDataValidation: {
        range: colRange(c),
        rule: { condition: { type: "NUMBER_GREATER_THAN_EQ", values: [{ userEnteredValue: "0" }] }, strict: false, inputMessage: "숫자만 입력하세요(예: 300000)" },
      },
    });
  });
  // 머리줄 고정
  requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } });
  await gsheetApi("POST", ":batchUpdate", { data: { requests } });
}

// 신규(또는 상차일이 바뀌어 다시 넣어야 하는) 오더를 어느 행에 넣을지 정한다 — 상차일
// 열 전체를 훑어 "같은 날짜가 연달아 있는 구간"을 블록 단위로 찾아내고(블록 사이는
// 빈 줄 하나로 구분돼 있다는 전제), 그 블록들 사이에서 targetDate가 있어야 할 자리를
// 정한다. 반환하는 mode:
//  - "append-to-block": 이미 그 날짜 블록이 있고, 그 블록이 시트에서 가장 아래(마지막)
//    블록이다 — 기존처럼 시트 맨 끝에 그대로 이어붙이면 된다(가장 흔한 경우라 별도
//    행 삽입 없이 저렴하게 처리).
//  - "insert-into-block": 이미 그 날짜 블록이 있지만 다른 블록들보다 위(중간)에 있다
//    — 그 블록 끝에 실제로 한 행을 구조적으로 끼워넣어야 한다.
//  - "new-block-before": 그 날짜 블록이 아직 없고, 그 날짜보다 늦은 블록이 있다 — 그
//    블록 바로 앞에 새 블록(데이터 1행 + 구분용 빈 줄 1행)을 통째로 끼워넣는다.
//  - "append-at-end": 그 날짜 블록이 없고, 기존 블록이 하나도 없거나 전부 그 날짜보다
//    이르다 — 시트 맨 끝에 새 블록을 이어붙인다(서식 이어받은 빈 버퍼 행을 그대로 씀).
// ⭐ 예전엔 "마지막 진짜 행"만 보고 항상 그 뒤에 이어붙였는데, 그러면 등록 순서가
// 날짜 순서와 다를 때(예: 9/17 오더를 먼저 넣고 나중에 9/3 오더를 넣는 경우) 같은
// 날짜가 시트 여러 군데에 흩어져버렸다 — 이 함수가 그 버그의 원인이었다.
async function findGsheetInsertPosition(tabName, targetDate, colMap) {
  const dateCol = colMap?.상차일 || "B";
  const target = gsheetNormDate(targetDate);
  const yearHint = target.slice(0, 4);
  const res = await gsheetApi("GET", `/values/${encodeURIComponent(`${quoteTab(tabName)}!${dateCol}2:${dateCol}2000`)}`);
  const values = res.values || [];

  // 상차일 열을 위에서부터 훑어 연속된 같은 날짜 구간(블록)들을 모은다. 구분용 빈
  // 줄이 나오면 지금 열려있는 블록을 닫는다(이후 같은 날짜가 다시 나와도 별개 블록).
  const blocks = []; // { date, startRow, endRow } — startRow/endRow는 시트 행 번호(1-based)
  let open = null;
  for (let i = 0; i < values.length; i++) {
    const v = gsheetNormDate(values[i]?.[0], yearHint); // 사람이 적은 "2026. 10. 27" 형식도 같은 날짜로 본다
    const row = i + 2; // values[0] == 2행(1행=헤더)
    if (!v) { open = null; continue; }
    if (open && open.date === v) { open.endRow = row; continue; }
    open = { date: v, startRow: row, endRow: row };
    blocks.push(open);
  }

  if (!blocks.length) return { mode: "append-at-end", insertRow: 2 };

  // ⭐ 사용자 요청(2026-09-09): 새로 등록되는 오더는 프로그램 화면에서 그 날짜의
  // 맨 위(순번 1)에 표시된다 — 배차를 아직 안 한 신규 오더가 그날 첫 줄로 보이는
  // 것과 동일하게, 시트에서도 항상 그 날짜 블록의 "맨 위"에 구조적으로 끼워넣는다.
  // 기존에 있던 그 날짜 오더들은 전부 한 칸씩 밀려나고, 순번 열(gsheetFormulaA의
  // COUNTIF 수식)이 셀 스스로 다시 계산하므로 별도 처리 없이 항상 1부터 다시 매겨진다.
  // (예전엔 블록 "끝"에 이어붙였는데, 그러면 등록된 순서 그대로 아래로 쌓여
  // 화면(최신 등록이 위)과 정반대 순서가 됐다 — 이게 그 버그였다.)
  const sameBlock = blocks.find((b) => b.date === target);
  if (sameBlock) {
    return { mode: "insert-into-block", insertRow: sameBlock.startRow };
  }

  const nextBlock = blocks.find((b) => b.date > target);
  if (nextBlock) return { mode: "new-block-before", anchorRow: nextBlock.startRow };

  const last = blocks[blocks.length - 1];
  return { mode: "append-at-end", insertRow: last.endRow + 2 };
}

// sheetId의 atRow(1-based)행 앞에 count개의 새 행을 구조적으로 끼워넣는다(그 아래
// 모든 행은 그만큼 밀려 내려감). inheritFromBefore가 true면 바로 위 행에서, false면
// 바로 아래(밀려날) 행에서 서식(테두리 등)을 이어받는다 — appendGsheetBufferRow와
// 동일한 이유로, 위에 이어받을 서식 있는 행이 없는 자리(헤더 바로 다음)에 끼워넣을
// 때만 false를 써야 서식이 깨지지 않는다.
async function insertGsheetDataRows(sheetId, atRow, count, inheritFromBefore) {
  await gsheetApi("POST", ":batchUpdate", {
    data: {
      requests: [
        {
          insertDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: atRow - 1, endIndex: atRow - 1 + count },
            inheritFromBefore,
          },
        },
      ],
    },
  });
}

// fromRow(포함) 이상을 가리키던 다른 오더들의 _gsheetSync.row 포인터를 delta만큼
// 밀어준다 — 이 탭 중간에 새 행을 구조적으로 끼워넣어(insertGsheetDataRows) 그 아래
// 행들이 전부 밀려 내려갔을 때, 그 행들을 가리키던 포인터도 같이 보정해야 다음에
// 그 오더를 수정할 때 엉뚱한 행을 덮어쓰지 않는다(removeGsheetRow의 반대 방향).
// excludeDocPath("col/id")로 넘긴 문서는 제외한다 — 지금 막 옮기는 중인 그 문서
// 자신이 아직 예전 _gsheetSync(옮기기 전 행 번호)를 들고 있어 잘못 걸릴 수 있어서.
async function shiftGsheetRowPointersFrom(tabName, fromRow, delta, excludeDocPath) {
  // ⭐ "내 오더만 보내기" 모드는 오더ID 열로만 줄을 찾으므로 줄번호 기록을 고칠 필요가 없다.
  //    (예전엔 줄 하나 넣고 뺄 때마다 그 달 오더 수백 건의 기록을 고쳐 써서 한 건에 10초 넘게 걸렸다)
  if (!GSHEET_PROGRAM_LINK_ENABLED) return;
  for (const col of ["orders", "dispatch"]) {
    let snap;
    try {
      snap = await db.collection(col).where("_gsheetSync.tab", "==", tabName).get();
    } catch (e) {
      console.warn(`_gsheetSync 포인터 보정용 조회 실패(${col}):`, e?.message || e);
      continue;
    }
    const targets = snap.docs.filter((d) => {
      if (excludeDocPath && `${col}/${d.id}` === excludeDocPath) return false;
      return (d.data()?._gsheetSync?.row || 0) >= fromRow;
    });
    for (let i = 0; i < targets.length; i += 500) {
      const batch = db.batch();
      targets.slice(i, i + 500).forEach((d) => batch.update(d.ref, { "_gsheetSync.row": FieldValue.increment(delta) }));
      await batch.commit();
    }
  }
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
  await withGsheetTabLock(tabName, () => removeGsheetRowUnlocked(tabName, row));
}
// 잠금 없이 행 1개 삭제(이미 그 탭 잠금을 잡고 있는 쪽에서 호출) + 아래 오더들의 줄번호 포인터 보정
async function removeGsheetRowUnlocked(tabName, row) {
  {
    const sheets = await getGsheetSheetList();
    const sheet = sheets.find((s) => s.title === tabName);
    if (!sheet) return; // 탭 자체가 이미 없으면(수동 삭제 등) 할 일 없음
    // 내 오더만 보내기 모드: 지울 줄의 날짜를 기억해 두었다가 지운 뒤 그 날짜 순번을 다시 매긴다
    let removedDate = "";
    if (!GSHEET_PROGRAM_LINK_ENABLED) {
      const cm = await getGsheetColumnMap(tabName);
      if (cm.상차일) removedDate = (await readGsheetCells(tabName, row, [cm.상차일]))[cm.상차일] || "";
    }

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
    if (removedDate) {
      await renumberGsheetDate(tabName, removedDate).catch((e) => console.warn("순번 다시 매기기 실패:", e?.message || e));
      // 그 날짜 줄이 하나도 안 남아 빈 구분줄이 두 줄 연속이 되면 한 줄 지운다
      try {
        const cm = await getGsheetColumnMap(tabName);
        if (cm.상차일 && row > 2) {
          const lastCol = gsheetColLetter(Math.max(gsheetColIndexFromLetter(cm.상차일), gsheetColIndexFromLetter(cm.거래처명 || "A")));
          const got = await gsheetApi("GET", `/values/${encodeURIComponent(`${quoteTab(tabName)}!A${row - 1}:${lastCol}${row}`)}`);
          const v = got.values || [];
          const blank = (r) => !(r || []).some((c) => String(c ?? "").trim());
          if (blank(v[0]) && blank(v[1])) {
            await gsheetApi("POST", ":batchUpdate", { data: { requests: [{ deleteDimension: { range: { sheetId: sheet.sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row } } }] } });
          }
        }
      } catch (e) { console.warn("빈 줄 정리 실패(무시):", e?.message || e); }
    }
    if (row === 2 && GSHEET_PROGRAM_LINK_ENABLED) {
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

    for (const col of (GSHEET_PROGRAM_LINK_ENABLED ? ["orders", "dispatch"] : [])) { // 내 오더 모드는 줄번호 기록 보정 생략(위 shift와 같은 이유)
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
  }
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
    등록일: d["등록일"] || "",
    상차일: d["상차일"] || "",
    상차시간: d["상차시간"] || "",
    하차일: d["하차일"] || "",
    하차시간: d["하차시간"] || "",
    거래처명: d["거래처명"] || "",
    상차지: d["상차지명"] || "",
    경유지: extractGsheetWaypointNames(d),
    상차지주소: d["상차지주소"] || "",
    하차지: d["하차지명"] || "",
    하차지주소: d["하차지주소"] || "",
    화물정보: d["화물내용"] || "",
    차량종류: d["차량종류"] || "",
    차량톤수: d["차량톤수"] || "",
    혼적: d["혼적"] ? "Y" : "",
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
async function writeGsheetOrderRow(tabName, row, data, colMap, docId) {
  colMap = colMap || (await getGsheetColumnMap(tabName));
  const rangesData = buildGsheetOrderRowRanges(tabName, row, data, colMap, docId);
  if (!rangesData.length) return;
  await gsheetApi("POST", "/values:batchUpdate", {
    data: { valueInputOption: "USER_ENTERED", data: rangesData },
  });
}
// 한 줄에 쓸 값·수식 목록만 만든다(여러 줄을 한 번에 쓸 때 모아서 보냄)
function buildGsheetOrderRowRanges(tabName, row, data, colMap, docId) {
  const rangesData = [];
  if (docId && colMap.오더ID) rangesData.push({ range: `${quoteTab(tabName)}!${colMap.오더ID}${row}`, values: [[docId]] });
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
  // ⭐ 수수료(청구운임-기사운임)는 매익율 칸이 없어도(사용자가 원하는 컬럼
  // 구성에 매익율이 빠질 수 있음) 그 자체로 계산 가능하므로 따로 조건을 건다.
  if (colMap.수수료) {
    const [qFormula, rFormula] = gsheetFormulaQR(row, colMap);
    rangesData.push({ range: `${quoteTab(tabName)}!${colMap.수수료}${row}`, values: [[qFormula]] });
    if (colMap.매익율) {
      rangesData.push({ range: `${quoteTab(tabName)}!${colMap.매익율}${row}`, values: [[rFormula]] });
    }
  }
  if (colMap.순번) {
    rangesData.push({ range: `${quoteTab(tabName)}!${colMap.순번}${row}`, values: [[gsheetFormulaA(row, colMap)]] });
  }
  return rangesData;
}

// ======================= 오더ID 열(시트 행 ↔ 오더 1:1 연결) =======================
// 탭에 "오더ID" 열이 없으면 마지막 열 다음에 만들고 숨긴다(예전 탭도 자동으로 붙음).
async function ensureGsheetIdColumn(tabName) {
  let colMap = await getGsheetColumnMap(tabName);
  if (colMap.오더ID) return colMap;
  const sheet = (await getGsheetSheetList()).find((x) => x.title === tabName);
  if (!sheet) return colMap;
  const res = await gsheetApi("GET", `/values/${encodeURIComponent(`${quoteTab(tabName)}!1:1`)}`);
  const header = (res.values && res.values[0]) || [];
  let idx = 0;
  for (let i = header.length - 1; i >= 0; i--) { if (String(header[i] || "").trim()) { idx = i + 1; break; } }
  const colCount = sheet.gridProperties?.columnCount || 26;
  const requests = [];
  if (idx >= colCount) requests.push({ appendDimension: { sheetId: sheet.sheetId, dimension: "COLUMNS", length: idx - colCount + 1 } });
  requests.push({ updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: "COLUMNS", startIndex: idx, endIndex: idx + 1 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } });
  await gsheetApi("POST", ":batchUpdate", { data: { requests } });
  await gsheetApi("POST", "/values:batchUpdate", {
    data: { valueInputOption: "RAW", data: [{ range: `${quoteTab(tabName)}!${gsheetColLetter(idx)}1`, values: [["오더ID"]] }] },
  });
  _gsheetColMapCache.delete("order:" + tabName);
  return getGsheetColumnMap(tabName);
}
// 이 오더(docId)가 적힌 행 번호들(정상이면 1개, 중복 사고가 있었으면 여러 개)
async function findGsheetRowsById(tabName, colMap, docId) {
  if (!colMap.오더ID) return [];
  const res = await gsheetApi("GET", `/values/${encodeURIComponent(`${quoteTab(tabName)}!${colMap.오더ID}2:${colMap.오더ID}6000`)}`);
  const rows = [];
  (res.values || []).forEach((v, i) => { if (String(v?.[0] || "").trim() === docId) rows.push(i + 2); });
  return rows;
}
async function readGsheetCells(tabName, row, cols) {
  const ranges = cols.filter(Boolean).map((c) => `${quoteTab(tabName)}!${c}${row}`);
  if (!ranges.length) return {};
  const q = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  const res = await gsheetApi("GET", `/values:batchGet?${q}`);
  const out = {};
  (res.valueRanges || []).forEach((vr, i) => { out[cols.filter(Boolean)[i]] = String(vr.values?.[0]?.[0] || "").trim(); });
  return out;
}
const isGsheetCanceled = (d) => d["배차상태"] === "배차취소" || GSHEET_CANCELED_STATUS_LIST.includes(d["상태"]);
// 이 문서가 직접 받은 줄번호 포인터만 인정(오더 복사로 원본 포인터가 딸려온 경우 무시)
const ownGsheetPtr = (d, docId) => {
  const p = d?._gsheetSync;
  if (!p?.tab || !p?.row) return null;
  if (p.doc && p.doc !== docId) return null;
  return p;
};

// 한 탭 안에서 이 오더의 행들을 찾는다 — ① 오더ID 열 ② (예전 방식) 줄번호 포인터: 그 줄의 오더ID가
// 비어 있고 상차일이 맞을 때만 이 오더의 줄로 인정(엉뚱한 줄을 지우지 않도록)
async function locateOrderRowsInTab(tabName, colMap, docId, ptr, expectDates) {
  const rows = await findGsheetRowsById(tabName, colMap, docId);
  if (ptr && ptr.tab === tabName && !rows.includes(ptr.row)) {
    const cells = await readGsheetCells(tabName, ptr.row, [colMap.오더ID, colMap.상차일]);
    const idCell = colMap.오더ID ? cells[colMap.오더ID] : "";
    const dateCell = colMap.상차일 ? cells[colMap.상차일] : "";
    if (idCell === docId) rows.push(ptr.row);
    // ⭐ 시트를 사람이 손으로 고치면 줄이 밀려 포인터가 남의 줄을 가리킬 수 있다 — "내 오더만 보내기" 모드에서는
    //    오더ID가 적힌 줄만 내 줄로 본다(남이 적은 줄을 덮어쓰거나 지우지 않게)
    else if (!idCell && GSHEET_PROGRAM_LINK_ENABLED && (ptr.doc === docId || expectDates.filter(Boolean).includes(dateCell))) rows.push(ptr.row);
  }
  return [...new Set(rows)].sort((x, y) => x - y);
}

// 오더를 시트에서 완전히 뺀다(삭제·배차취소·블라인드·다른 회사로 변경 등)
async function removeDocFromGsheet(docId, hint) {
  const ptr = ownGsheetPtr(hint, docId) || (hint?._gsheetSync?.tab ? hint._gsheetSync : null);
  const tabs = [...new Set([ptr?.tab, gsheetMonthTabName(hint?.["상차일"])].filter(Boolean))];
  const sheetTitles = new Set((await getGsheetSheetList()).map((x) => x.title));
  for (const tab of tabs) {
    if (!sheetTitles.has(tab)) continue;
    await withGsheetTabLock(tab, async () => {
      const colMap = await ensureGsheetIdColumn(tab);
      const rows = await locateOrderRowsInTab(tab, colMap, docId, ptr, [hint?.["상차일"]]);
      for (const r of rows.sort((x, y) => y - x)) await removeGsheetRowUnlocked(tab, r); // 아래 줄부터 지워야 번호가 안 밀림
    });
  }
}

// ⭐ 2026-10-20 재작성 — 프로그램과 시트가 항상 같도록:
//  - 이벤트에 실린 값이 아니라 Firestore의 "지금" 값을 다시 읽어서 판단(늦게 도착한 이벤트가 옛 상태로 덮어쓰지 않게)
//  - 같은 오더가 거의 동시에 여러 번 저장돼도(등록 직후 수정 등) 줄이 2개 생기지 않게, 탭 잠금 안에서 확인→기록
//  - 줄번호 포인터는 잠금 안에서 바로 기록(다음 처리가 바로 보도록) + 오더ID 열로 정확히 찾음
//  - 오더 복사로 딸려온 원본의 포인터는 무시(예전엔 복사본이 원본 줄을 덮어쓰거나 지웠다)
//  - 같은 오더가 시트에 여러 줄 있으면(예전 사고) 1줄만 남기고 정리
async function syncOneDispatchToGsheet(docId, eventData, eventBefore) {
  const snap = await db.doc(docId).get();
  if (!snap.exists) { await removeDocFromGsheet(docId, eventBefore || eventData); return; }
  const data = snap.data();
  if (data.source === "transport_transmit") return;
  // "내 오더만 보내기" 표시가 있는 오더는 회사명과 상관없이 대상, 전체 연결이 꺼져 있으면 그 오더만 대상
  if (!GSHEET_PROGRAM_LINK_ENABLED && !(data._gsheetMine && (data._gsheetMineSent || [docId, docId.split("/").pop()].includes(data._gsheetSync?.doc)))) return;
  // ⭐ 블라인드는 프로그램 화면에서만 숨기는 것 — "내 오더" 표시가 있으면 시트에는 그대로 둔다
  const outOfScope = (!data._gsheetMine && ((data.companyName || "돌캐") !== GSHEET_TARGET_COMPANY || data.블라인드 === true));
  // 새로 생긴 문서에 딸려온 옛 방식 포인터(문서ID 없음)는 복사 원본의 것 — 무시
  const createdNow = !eventBefore;
  let ptr = ownGsheetPtr(data, docId);
  if (ptr && createdNow && !ptr.doc) ptr = null;
  // 전체 덮어쓰기 저장으로 포인터가 빠진 경우 직전 포인터를 이어받는다(예전엔 여기서 줄이 하나 더 생겼다)
  if (!ptr && eventBefore) ptr = ownGsheetPtr(eventBefore, docId);

  const targetTab = outOfScope || isGsheetCanceled(data) ? null : gsheetMonthTabName(data["상차일"]);
  const sheetTitles = new Set((await getGsheetSheetList()).map((x) => x.title));
  const expectDates = [data["상차일"], eventBefore?.["상차일"]];

  // 1) 대상이 아닌 탭(월이 바뀐 경우 이전 달 탭 등)에 남은 줄 정리
  const otherTabs = [...new Set([ptr?.tab, gsheetMonthTabName(eventBefore?.["상차일"])].filter((t) => t && t !== targetTab))];
  for (const tab of otherTabs) {
    if (!sheetTitles.has(tab)) continue;
    await withGsheetTabLock(tab, async () => {
      const colMap = await ensureGsheetIdColumn(tab);
      const rows = await locateOrderRowsInTab(tab, colMap, docId, ptr, expectDates);
      for (const r of rows.sort((x, y) => y - x)) await removeGsheetRowUnlocked(tab, r);
    });
  }
  if (!targetTab) {
    if (data._gsheetSync) await db.doc(docId).update({ _gsheetSync: FieldValue.delete() }).catch(() => {});
    return;
  }

  // 2) 대상 탭 — 잠금 안에서 "이미 있나" 확인 → 고치거나 새로 넣기
  await ensureGsheetMonthTab(targetTab);
  await withGsheetTabLock(targetTab, async () => {
    const colMap = await ensureGsheetIdColumn(targetTab);
    // 잠금을 기다리는 사이 다른 처리가 먼저 끝났을 수 있으니 최신 문서를 다시 본다
    const fresh = await db.doc(docId).get();
    if (!fresh.exists) {
      const rows = await findGsheetRowsById(targetTab, colMap, docId);
      for (const r of rows.sort((x, y) => y - x)) await removeGsheetRowUnlocked(targetTab, r);
      return;
    }
    const cur = fresh.data();
    if (isGsheetCanceled(cur) || gsheetMonthTabName(cur["상차일"]) !== targetTab || (cur.블라인드 === true && !cur._gsheetMine)) return; // 뒤이은 이벤트가 처리
    const curPtr = ownGsheetPtr(cur, docId);
    let ptrNow = curPtr && curPtr.doc === docId ? curPtr : ptr;

    let rows = await findGsheetRowsById(targetTab, colMap, docId);
    // 방금 다른 처리가 줄을 넣고 포인터(문서ID 포함)를 남겼다면, 시트 읽기 지연으로 ID가 아직 안 보여도 그 줄을 쓴다
    if (!rows.length && ptrNow && ptrNow.tab === targetTab) {
      const located = await locateOrderRowsInTab(targetTab, colMap, docId, ptrNow, [cur["상차일"], ...expectDates]);
      rows = located;
    }
    // 중복 줄 정리(아래 줄부터) — 첫 줄만 남김
    if (rows.length > 1) {
      for (const r of rows.slice(1).sort((x, y) => y - x)) await removeGsheetRowUnlocked(targetTab, r);
      rows = [rows[0]];
    }

    if (rows.length) {
      const row = rows[0];
      const cells = colMap.상차일 ? await readGsheetCells(targetTab, row, [colMap.상차일]) : {};
      const curDate = gsheetNormDate(cur["상차일"]);
      const sheetDate = colMap.상차일 ? gsheetNormDate(cells[colMap.상차일], curDate.slice(0, 4)) : curDate;
      if (sheetDate === curDate) {
        // 같은 날짜 블록 — 값 칸만 덮어쓰기(수식 칸은 건드리지 않음) + 오더ID
        const rangesData = [];
        for (const [field, value] of Object.entries(buildGsheetFieldValues(cur))) {
          const col = colMap[field];
          if (col) rangesData.push({ range: `${quoteTab(targetTab)}!${col}${row}`, values: [[value]] });
        }
        if (colMap.오더ID) rangesData.push({ range: `${quoteTab(targetTab)}!${colMap.오더ID}${row}`, values: [[docId]] });
        if (rangesData.length) await gsheetApi("POST", "/values:batchUpdate", { data: { valueInputOption: "USER_ENTERED", data: rangesData } });
        if (!curPtr || curPtr.row !== row || curPtr.tab !== targetTab || curPtr.doc !== docId) {
          await db.doc(docId).update({ _gsheetSync: { tab: targetTab, row, doc: docId } }).catch(() => {});
        }
        return;
      }
      // 날짜가 바뀜 — 기존 줄을 지우고 아래에서 올바른 날짜 블록에 새로 넣는다
      await removeGsheetRowUnlocked(targetTab, row);
    }

    // 새로 넣기(날짜 블록 위치 계산)
    const sheetProps = (await getGsheetSheetList()).find((x) => x.title === targetTab);
    if (!sheetProps) throw new Error(`탭을 찾을 수 없습니다: ${targetTab}`);
    const pos = await findGsheetInsertPosition(targetTab, cur["상차일"], colMap);
    let r;
    if (pos.mode === "append-at-end") {
      r = pos.insertRow;
      await ensureGsheetRowsUpTo(sheetProps.sheetId, sheetProps.gridProperties?.rowCount || 1, r);
      await writeGsheetOrderRow(targetTab, r, cur, colMap, docId);
      await appendGsheetBufferRow(sheetProps.sheetId, r);
    } else if (pos.mode === "insert-into-block") {
      r = pos.insertRow;
      await insertGsheetDataRows(sheetProps.sheetId, r, 1, false);
      await shiftGsheetRowPointersFrom(targetTab, r, 1, docId);
      await writeGsheetOrderRow(targetTab, r, cur, colMap, docId);
    } else {
      r = pos.anchorRow;
      await insertGsheetDataRows(sheetProps.sheetId, r, 2, r > 2);
      await shiftGsheetRowPointersFrom(targetTab, r, 2, docId);
      await writeGsheetOrderRow(targetTab, r, cur, colMap, docId);
    }
    if (!GSHEET_PROGRAM_LINK_ENABLED) await renumberGsheetDate(targetTab, cur["상차일"]).catch((e) => console.warn("순번 다시 매기기 실패:", e?.message || e));
    // 포인터는 잠금 안에서 바로 기록 — 문서가 그새 삭제됐으면 방금 넣은 줄을 되돌린다
    try {
      await db.doc(docId).update({ _gsheetSync: { tab: targetTab, row: r, doc: docId } });
    } catch (e) {
      console.warn("포인터 기록 실패(문서 삭제됨?) — 방금 넣은 줄 삭제:", e?.message || e);
      await removeGsheetRowUnlocked(targetTab, r);
    }
  });

  await ensureDriverInGsheetUniqueTab(data["차량번호"], data["이름"], data["전화번호"]);
}

/* ==============================================================
   ▥ (1회성) 이미 등록돼 있던 오더를 구글시트로 일괄 반영 — 관리자용
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
    if (!GSHEET_PROGRAM_LINK_ENABLED) { res.status(409).send(GSHEET_LINK_OFF_MESSAGE); return; }
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

      // ⭐ 매번 헤더를 손으로 안 쳐도 되도록, 백필할 때마다 1행을 정해진
      // 컬럼명/순서(GSHEET_MONTH_HEADER_COLUMNS)로 다시 써준다 — 컬럼명을
      // 미리 준비할 필요 없이 그냥 백필 버튼만 누르면 된다.
      await gsheetApi("POST", `/values/${encodeURIComponent(`${quoteTab(tabName)}!1:1`)}:clear`, { data: {} });
      await gsheetApi("POST", "/values:batchUpdate", {
        data: {
          valueInputOption: "USER_ENTERED",
          data: [{ range: `${quoteTab(tabName)}!A1`, values: [GSHEET_MONTH_HEADER_COLUMNS] }],
        },
      });
      // 방금 헤더를 새로 썼으니, 그 전에 캐시돼 있던(30초짜리) 옛 헤더→열문자
      // 맵이 있으면 반드시 버린다 — 안 그러면 아래 colMap 조회가 방금 지운
      // 옛날 헤더 기준으로 나올 수 있다.
      _gsheetColMapCache.delete("order:" + tabName);
      // 오더ID 열은 숨김(시트를 보는 사람에겐 필요 없는 연결용 값)
      try {
        const idIdx = GSHEET_MONTH_HEADER_COLUMNS.indexOf("오더ID");
        const sh = (await getGsheetSheetList()).find((x) => x.title === tabName);
        if (sh && idIdx >= 0) {
          await gsheetApi("POST", ":batchUpdate", { data: { requests: [{ updateDimensionProperties: { range: { sheetId: sh.sheetId, dimension: "COLUMNS", startIndex: idIdx, endIndex: idIdx + 1 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } }] } });
        }
      } catch (e) { console.warn("오더ID 열 숨김 실패(무시):", e?.message || e); }
      try { await applyGsheetInputGuides(tabName); } catch (e) { console.warn("필수칸 표시 적용 실패(무시):", e?.message || e); }

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
          if (data.블라인드 === true) return; // ★ 실시간 동기화와 같은 기준(예전 백필은 블라인드 오더까지 올려 시트가 더 많았다)
          if ((data.companyName || "돌캐") === GSHEET_TARGET_COMPANY) {
            items.push({ docId: `${col}/${d.id}`, data });
          }
        });
      }
      items.sort((a, b) => {
        const dcmp = String(a.data["상차일"] || "").localeCompare(String(b.data["상차일"] || ""));
        if (dcmp !== 0) return dcmp;
        // ⭐ 같은 날짜 안에서는 "나중에 등록한 오더가 위로" — 실시간 동기화
        // (findGsheetInsertPosition)가 새 오더를 항상 그 날짜 블록 맨 위에 끼워넣는
        // 것과 동일한 순서로, 백필도 같은 결과가 나오게 맞춘다. createdAt(서버
        // 타임스탬프)이 클라이언트에서 계산하는 순번 필드(nextSeq — 동시 등록 시
        // 값이 겹칠 수 있음)보다 신뢰도가 높아 우선 쓰고, 그 필드가 없는 옛 문서만
        // 순번으로 대체한다.
        const at = a.data.createdAt?.toMillis ? a.data.createdAt.toMillis() : 0;
        const bt = b.data.createdAt?.toMillis ? b.data.createdAt.toMillis() : 0;
        if (at || bt) return bt - at;
        return (Number(b.data["순번"]) || 0) - (Number(a.data["순번"]) || 0);
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
      // ⭐ 진단용 — 기사명/전화번호/수수료/순번 칸이 비어 들어가는 사고가 있어서,
      // 실제로 이번 실행에서 colMap이 이 필드들의 열을 제대로 찾았는지 결과
      // 문구에 그대로 보여준다(사용자가 캡처해서 보내주면 바로 원인을 알 수 있음).
      let debugColMap = null;

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
          debugColMap = colMap;

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
            chunk.forEach(({ row, data, docId }) => {
              if (colMap.오더ID) rangesData.push({ range: `${quoteTab(tabName)}!${colMap.오더ID}${row}`, values: [[docId]] });
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
              if (colMap.수수료) {
                const [qFormula, rFormula] = gsheetFormulaQR(row, colMap);
                rangesData.push({ range: `${quoteTab(tabName)}!${colMap.수수료}${row}`, values: [[qFormula]] });
                if (colMap.매익율) {
                  rangesData.push({ range: `${quoteTab(tabName)}!${colMap.매익율}${row}`, values: [[rFormula]] });
                }
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
                chunk.slice(j, j + 500).forEach(({ docId, row }) => fsBatch.update(db.doc(docId), { _gsheetSync: { tab: tabName, row, doc: docId } }));
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

          // ⭐ 사용자 보고: 백필로 채운 청구운임/기사운임/수수료 칸에 천단위 콤마가
          // 안 붙고 매익율도 25%가 아니라 0.25로만 보이는 문제 — 새로 채운 행이 항상
          // "콤마/퍼센트 서식이 있는 행"의 서식을 이어받는다는 보장이 없어(탭을 새로
          // 만들거나 기존 데이터를 지운 직후의 상태에 따라 갈림) 생긴다. 값을 다 쓴
          // 뒤, 이번에 실제로 쓴 데이터 범위(2행~finalRow행)에 매번 명시적으로 서식을
          // 다시 지정해서 어떤 상황에서도 항상 맞는 형식으로 보이게 한다.
          const dataFormatRequests = [];
          [colMap.청구운임, colMap.기사운임, colMap.수수료].filter(Boolean).forEach((col) => {
            dataFormatRequests.push({
              repeatCell: {
                range: { sheetId, startRowIndex: 1, endRowIndex: finalRow, startColumnIndex: gsheetColIndexFromLetter(col), endColumnIndex: gsheetColIndexFromLetter(col) + 1 },
                cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } } },
                fields: "userEnteredFormat.numberFormat",
              },
            });
          });
          if (colMap.매익율) {
            dataFormatRequests.push({
              repeatCell: {
                range: { sheetId, startRowIndex: 1, endRowIndex: finalRow, startColumnIndex: gsheetColIndexFromLetter(colMap.매익율), endColumnIndex: gsheetColIndexFromLetter(colMap.매익율) + 1 },
                cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0.00%" } } },
                fields: "userEnteredFormat.numberFormat",
              },
            });
          }
          if (dataFormatRequests.length) {
            await gsheetApi("POST", ":batchUpdate", { data: { requests: dataFormatRequests } })
              .catch((e) => console.warn("백필 금액 서식 재적용 실패(무시):", e?.message || e));
          }

          // ⭐ 사용자 요청 — 백필 결과 맨 아래에 그 달 총 건수/총 청구운임/총 기사운임/
          // 총 수수료(/평균 매익율)를 요약해서 보여준다. 처음엔 이 시점의 숫자를
          // 고정값으로 써넣었는데, 그러면 백필 이후 실시간 동기화나 사용자가 시트에
          // 직접 입력한 오더는 합계에 전혀 반영이 안 됐다("계속 늘어나야 하는데
          // 실제로는 안 늘어난다") — 그래서 고정 숫자 대신 시트가 항상 다시 계산하는
          // 수식으로 바꾼다. 합계 행 자기 자신을 범위에 넣으면 순환참조가 나는데,
          // 합계 행 위치는 오더가 늘수록 계속 아래로 밀려서 고정 행 번호를 쓸 수
          // 없다 — INDEX(열:열, ROW()-1)로 "지금 이 행 바로 위까지"를 가리키게 하면
          // 합계 행이 어디로 밀려도 항상 정확하다.
          // 상차일(날짜) 칸은 실시간 동기화가 블록을 찾을 때 훑는 기준 열이라 합계
          // 행에는 절대 쓰지 않고 비워둔다 — 그래야 합계 행이 빈 구분줄처럼 보여
          // 실시간 동기화 로직과 부딪히지 않는다. "버퍼 행"(다음 실시간 등록이 값을
          // 채워 넣을 빈 줄) 바로 다음에 합계 행을 두어서, 나중에 새 오더가 버퍼
          // 행을 채우고 또 새 버퍼 행이 추가돼도 합계 행은 항상 구조적으로 맨
          // 아래로 밀려 내려간다.
          const bufferRow = rowCount + 1;
          const totalsRow = rowCount + 2;
          await gsheetApi("POST", ":batchUpdate", {
            data: {
              requests: [
                { insertDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowCount, endIndex: bufferRow }, inheritFromBefore: true } },
                { insertDimension: { range: { sheetId, dimension: "ROWS", startIndex: bufferRow, endIndex: totalsRow }, inheritFromBefore: true } },
              ],
            },
          });

          const dateCol = colMap.상차일;
          const aboveRange = (col) => `${col}2:INDEX(${col}:${col},ROW()-1)`;
          const totalsRangesData = [];
          const pushTotal = (col, value) => { if (col) totalsRangesData.push({ range: `${quoteTab(tabName)}!${col}${totalsRow}`, values: [[value]] }); };
          if (colMap.거래처명 && dateCol) {
            pushTotal(colMap.거래처명, `="합계 (총 "&COUNTA(${aboveRange(dateCol)})&"건)"`);
          }
          if (colMap.청구운임) pushTotal(colMap.청구운임, `=SUM(${aboveRange(colMap.청구운임)})`);
          if (colMap.기사운임) pushTotal(colMap.기사운임, `=SUM(${aboveRange(colMap.기사운임)})`);
          if (colMap.수수료) pushTotal(colMap.수수료, `=SUM(${aboveRange(colMap.수수료)})`);
          if (colMap.매익율) pushTotal(colMap.매익율, `=IFERROR(AVERAGE(${aboveRange(colMap.매익율)}),0)`);
          if (totalsRangesData.length) {
            await gsheetApi("POST", "/values:batchUpdate", { data: { valueInputOption: "USER_ENTERED", data: totalsRangesData } });
          }

          // 합계 행 서식 — 금액/매익율 칸만 데이터 행과 같은 콤마/퍼센트 서식으로
          // 맞춘다. 굵게·배경색처럼 이 행만의 특이한 서식은 일부러 넣지 않는다 —
          // 다음 달 백필 때 clearGsheetDataRows가 데이터 행을 지우면서 이 합계
          // 행(그 시점의 "마지막 행")만 남기고, 그 남은 행의 서식을 이후 새로 넣는
          // 데이터 행들이 그대로 이어받게 되는데, 합계 행에만 굵게/배경색을 넣어두면
          // 그 서식이 엉뚱하게 다음 달 전체 데이터 행에 번져 보이게 된다.
          const totalsFormatRequests = [];
          [colMap.청구운임, colMap.기사운임, colMap.수수료].filter(Boolean).forEach((col) => {
            totalsFormatRequests.push({
              repeatCell: {
                range: { sheetId, startRowIndex: totalsRow - 1, endRowIndex: totalsRow, startColumnIndex: gsheetColIndexFromLetter(col), endColumnIndex: gsheetColIndexFromLetter(col) + 1 },
                cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } } },
                fields: "userEnteredFormat.numberFormat",
              },
            });
          });
          if (colMap.매익율) {
            totalsFormatRequests.push({
              repeatCell: {
                range: { sheetId, startRowIndex: totalsRow - 1, endRowIndex: totalsRow, startColumnIndex: gsheetColIndexFromLetter(colMap.매익율), endColumnIndex: gsheetColIndexFromLetter(colMap.매익율) + 1 },
                cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0.00%" } } },
                fields: "userEnteredFormat.numberFormat",
              },
            });
          }
          if (totalsFormatRequests.length) {
            await gsheetApi("POST", ":batchUpdate", { data: { requests: totalsFormatRequests } })
              .catch((e) => console.warn("합계 행 서식 적용 실패(무시):", e?.message || e));
          }
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

      const debugFields = ["순번", "기사명", "전화번호", "수수료", "매익율", "배차상태", "청구운임"];
      const colMapDebugText = debugColMap
        ? debugFields.map((f) => `${f}=${debugColMap[f] || "(못찾음)"}`).join(", ")
        : "(colMap 조회 안됨)";

      res.status(200).send(
        `완료 — 탭 "${tabName}" 초기화 후 반영 ${created}건, 배차취소(제외) ${canceled}건, 실패 ${failed}건 (대상 ${items.length}건)` +
        (actualRowCount !== null ? `\n검증: 시트에 실제로 채워진 행 ${actualRowCount}개` : "") +
        (failedIds.length ? `\n실패 목록(최대 20건): ${failedIds.slice(0, 20).join(", ")}` : "") +
        `\n열 위치 확인: ${colMapDebugText}`
      );
    } catch (e) {
      console.error("백필 오류:", e);
      res.status(500).send(`오류: ${e?.message || e}`);
    } finally {
      await lockRef.delete().catch(() => {});
    }
  });

/* ==============================================================
   ▤ (1회성/반복 가능) 기본거래처(clients)/하차지거래처(places)를
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
    if (!GSHEET_PROGRAM_LINK_ENABLED) { res.status(409).send(GSHEET_LINK_OFF_MESSAGE); return; }

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

/* ==================================================================
   ▤ 일일업무일지(경리) 시트 설정 — 사용자가 퇴사 후에도 프로그램 없이
   구글시트만으로 계속 쓸 수 있게, 월별 탭(26년9월, 26년10월, ...)을
   그대로 읽어가는(QUERY) "보기 전용" 탭을 만들어준다. 프로그램에서
   자동 전송된 오더든, 나중에 사용자가 월별 탭에 직접 입력한 오더든
   QUERY가 원본을 실시간으로 읽으므로 둘 다 자동으로 반영된다.

   ⚠ 새 컬럼 구성(GSHEET_MONTH_HEADER_COLUMNS, "등록일" 헤더가 있음)으로
   백필된 달만 포함한다 — 옛 컬럼 구성 탭을 섞으면 QUERY가 위치(Col1,
   Col2...) 기준으로 가져오기 때문에 엉뚱한 값이 들어간다. 헤더 행에
   "등록일"이 있는지로 새/옛 구성을 구분한다.

   한 번 만든 뒤 이 함수를 다시 실행하면 그 사이 새로 백필된(등록일 헤더가
   생긴) 달까지 자동으로 다시 포함해서 수식을 새로 써준다 — "매달 새
   시트를 만들 때마다 이 버튼을 한 번 더 눌러주면" 계속 최신 상태로
   유지된다(수식 텍스트를 직접 손으로 고칠 필요 없음).

   호출: https://.../setupGsheetDailyLedger?key=<GSHEET_BACKFILL_KEY>
================================================================== */
const GSHEET_DAILY_LEDGER_TAB = "일일업무일지(경리)";
// 사용자가 요청한 "엑셀다운과 동일한" 컬럼 구성 — 상차지주소/하차지주소/혼적은
// 빠진다. label은 이 시트에 실제로 표시할 헤더 텍스트, source는 월별 탭
// (GSHEET_MONTH_HEADER_COLUMNS)에서 그 값을 찾을 때 쓰는 헤더 텍스트 —
// "기사명"(엑셀다운 표기)과 "이름"(월별 탭 표기)처럼 둘이 다를 수 있어서
// 분리해뒀다(하나로 합치면 둘 다 같은 텍스트라고 가정하다가 못 찾는 사고가 남).
const GSHEET_DAILY_LEDGER_COLUMNS = [
  { label: "순번", source: "순번" },
  { label: "등록일", source: "등록일" },
  { label: "상차일", source: "상차일" },
  { label: "상차시간", source: "상차시간" },
  { label: "하차일", source: "하차일" },
  { label: "하차시간", source: "하차시간" },
  { label: "거래처명", source: "거래처명" },
  { label: "상차지명", source: "상차지명" },
  { label: "하차지명", source: "하차지명" },
  { label: "화물내용", source: "화물내용" },
  { label: "차량종류", source: "차량종류" },
  { label: "차량톤수", source: "차량톤수" },
  { label: "차량번호", source: "차량번호" },
  { label: "기사명", source: "이름" },
  { label: "전화번호", source: "전화번호" },
  { label: "배차상태", source: "배차상태" },
  { label: "청구운임", source: "청구운임" },
  { label: "기사운임", source: "기사운임" },
  { label: "수수료", source: "수수료" },
  { label: "지급방식", source: "지급방식" },
  { label: "배차방식", source: "배차방식" },
  { label: "메모", source: "메모" },
];
const GSHEET_DAILY_LEDGER_HEADERS = GSHEET_DAILY_LEDGER_COLUMNS.map((c) => c.label);
// 위 각 컬럼의 source가 월별 탭(GSHEET_MONTH_HEADER_COLUMNS) 안에서 몇
// 번째(1-based)인지 — 월별 탭 컬럼 구성이 나중에 바뀌어도 이 인덱스가
// 자동으로 같이 바뀌므로 QUERY의 Col번호를 하드코딩해둘 필요가 없다.
function gsheetDailyLedgerColIndexes() {
  return GSHEET_DAILY_LEDGER_COLUMNS.map((c) => {
    const idx = GSHEET_MONTH_HEADER_COLUMNS.indexOf(c.source);
    return idx >= 0 ? idx + 1 : null;
  });
}

exports.setupGsheetDailyLedger = functions
  .runWith({ timeoutSeconds: 180, memory: "256MB" })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.query.key !== GSHEET_BACKFILL_KEY) { res.status(403).send("forbidden"); return; }

    try {
      const sheets = await getGsheetSheetList();
      // ⭐ 사용자 요청 — 일일업무일지는 26년9월부터만 포함한다. 그 이전 달(25년11월~
      // 26년8월)은 나중에 새 컬럼 구성으로 백필되어 "등록일" 헤더가 생기더라도
      // 계속 제외해야 하므로, 헤더 유무 체크와 별개로 달 자체를 이 기준으로 먼저
      // 거른다.
      const GSHEET_DAILY_LEDGER_MIN_MONTH_KEY = 26 * 12 + 9; // "26년9월"
      const monthTabs = sheets.filter((s) => {
        const key = gsheetTabSortKey(s.title);
        return key !== null && key >= GSHEET_DAILY_LEDGER_MIN_MONTH_KEY;
      });
      monthTabs.sort((a, b) => gsheetTabSortKey(a.title) - gsheetTabSortKey(b.title));

      const readyTabs = [];
      for (const t of monthTabs) {
        try {
          const headerRes = await gsheetApi("GET", `/values/${encodeURIComponent(`${quoteTab(t.title)}!1:1`)}`);
          const header = (headerRes.values && headerRes.values[0]) || [];
          if (header.some((h) => String(h || "").trim() === "등록일")) readyTabs.push(t.title);
        } catch (e) {
          console.warn(`일일업무일지 설정 — 헤더 확인 실패(건너뜀): ${t.title}`, e?.message || e);
        }
      }

      if (!readyTabs.length) {
        res.status(400).send('새 컬럼 구성("등록일" 헤더 포함)으로 백필된 달 탭이 하나도 없습니다. 먼저 원하는 달을 백필해주세요.');
        return;
      }

      const colIdxs = gsheetDailyLedgerColIndexes();
      if (colIdxs.some((i) => i === null)) {
        const missing = GSHEET_DAILY_LEDGER_COLUMNS.filter((c, i) => colIdxs[i] === null).map((c) => `${c.label}(${c.source})`);
        res.status(500).send(`일일업무일지 헤더 구성이 월별 탭 컬럼과 안 맞습니다 — 코드 확인이 필요합니다. 못 찾은 항목: ${missing.join(", ")}`);
        return;
      }

      // ⭐ VSTACK으로 바꿔도 수식이 여전히 텍스트로 박히는 문제가 재현됐다 — 이
      // 탭을 여러 번 지우고 다시 쓰는 과정에서 A2 셀에 "일반 텍스트" 서식이
      // 한 번 남게 되면(예: 예전에 실패한 시도에서 RAW로 값이 들어간 적이 있는
      // 경우), 그 뒤로는 USER_ENTERED로 다시 써도 셀 자체가 텍스트 서식이라
      // 수식으로 안 바뀐다(시트 UI에서 "일반 텍스트"로 서식 지정된 칸에
      // "=1+1"을 입력해도 그대로 문자로 보이는 것과 동일한 현상). 이 탭은
      // 전부 수식으로만 채워지는 "보기 전용" 탭이라 원본 데이터가 없으므로,
      // 매번 탭 자체를 통째로 지우고 새로 만들어 서식 잔여물 걱정 없이
      // 완전히 깨끗한 상태에서 시작한다.
      let ledgerSheet = sheets.find((s) => s.title === GSHEET_DAILY_LEDGER_TAB);
      if (ledgerSheet) {
        await gsheetApi("POST", ":batchUpdate", {
          data: { requests: [{ deleteSheet: { sheetId: ledgerSheet.sheetId } }] },
        });
      }
      const created = await gsheetApi("POST", ":batchUpdate", {
        data: { requests: [{ addSheet: { properties: { title: GSHEET_DAILY_LEDGER_TAB } } }] },
      });
      ledgerSheet = created.replies[0].addSheet.properties;

      const selectCols = colIdxs.map((i) => `Col${i}`).join(",");
      const lastColLetter = gsheetColLetter(GSHEET_MONTH_HEADER_COLUMNS.length - 1);
      const rangeList = readyTabs.map((t) => `${quoteTab(t)}!A2:${lastColLetter}`).join(", ");
      // ⭐ 사용자 요청 — 월별 탭처럼 상차일이 바뀌는 지점에 빈 줄이 그대로 보여야
      // 한다. 원본 월별 탭은 날짜 블록 사이에 완전히 빈 줄(모든 칸이 공백)을 넣고,
      // "합계" 행은 순번(Col1)은 비어있지만 거래처명(Col7) 칸엔 "합계 (총 N건)"
      // 텍스트가 있다 — 이 둘을 구분해서 순번이 있는 실제 데이터 행이거나
      // 거래처명도 같이 비어있는 진짜 빈 구분줄만 남기고, 순번 없이 거래처명만
      // 채워진 합계 행만 걸러낸다(여러 달을 이어붙였을 때 그 달의 합계가 중간에
      // 끼어 보이지 않게).
      const orderColIdx = GSHEET_MONTH_HEADER_COLUMNS.indexOf("순번") + 1;
      const clientColIdx = GSHEET_MONTH_HEADER_COLUMNS.indexOf("거래처명") + 1;
      const formula = `=QUERY(VSTACK(${rangeList}), "select ${selectCols} where Col${orderColIdx} is not null or Col${clientColIdx} is null", 0)`;

      // 탭을 방금 새로 만들었으니(위) 지울 값이 없다 — 굳이 clear를 또 호출할
      // 필요 없음.
      await gsheetApi("POST", "/values:batchUpdate", {
        data: {
          valueInputOption: "USER_ENTERED",
          data: [
            { range: `${quoteTab(GSHEET_DAILY_LEDGER_TAB)}!A1`, values: [GSHEET_DAILY_LEDGER_HEADERS] },
            { range: `${quoteTab(GSHEET_DAILY_LEDGER_TAB)}!A2`, values: [[formula]] },
          ],
        },
      });

      res.status(200).send(`"${GSHEET_DAILY_LEDGER_TAB}" 탭 설정 완료 — 포함된 달(${readyTabs.length}개): ${readyTabs.join(", ")}`);
    } catch (e) {
      console.error("일일업무일지 설정 오류:", e);
      res.status(500).send(`오류: ${e?.message || e}`);
    }
  });

/* ==================================================================
   ◆ 인수인계 자료(운임 이력)를 구글시트로 전송 — src/HandoverFareReport.jsx
   화면이 이미 거래처/지역별로 묶어서 계산해둔 결과(단위 묶기, 톤수 구분,
   지역명 통일 등 모든 로직은 화면 쪽에만 있음)를 그대로 받아 적기만
   한다 — 그래서 화면 쪽 그룹핑 로직이 바뀌어도 이 함수는 안 고쳐도 된다.
   "운임표(명칭)"엔 거래처·상하차지명 기준 행을, "운임표(주소)"엔
   거래처·지역 기준 행을 각각 통째로 비우고 다시 채운다(탭이 없으면 새로
   만듦). 컬럼명/순서는 화면 표와 동일하게 코드에 고정.

   호출: POST https://.../backfillGsheetFareHistory?key=<GSHEET_BACKFILL_KEY>
   body: { key, nameRows: [...], addressRows: [...] }
================================================================== */
const GSHEET_FARE_NAME_COLUMNS = [
  { field: "거래처명", header: "거래처명" },
  { field: "상차지명", header: "상차지명" },
  { field: "하차지명", header: "하차지명" },
  { field: "차량구분", header: "차량구분" },
  { field: "톤수", header: "톤수" },
  { field: "화물내용", header: "화물내용" },
  { field: "청구운임", header: "청구운임" },
  { field: "최근상차일", header: "최근상차일" },
];
const GSHEET_FARE_ADDRESS_COLUMNS = [
  { field: "거래처명", header: "거래처명" },
  { field: "상차시도", header: "상차시도" },
  { field: "상차시군구", header: "상차시군구" },
  { field: "하차시도", header: "하차시도" },
  { field: "하차시군구", header: "하차시군구" },
  { field: "차량구분", header: "차량구분" },
  { field: "톤수", header: "톤수" },
  { field: "화물내용", header: "화물내용" },
  { field: "청구운임", header: "청구운임" },
  { field: "최근상차일", header: "최근상차일" },
];

async function backfillGsheetFareRows({ tabName, columns, rows }) {
  let sheets = await getGsheetSheetList();
  let sheet = sheets.find((s) => s.title === tabName);
  if (!sheet) {
    const created = await gsheetApi("POST", ":batchUpdate", {
      data: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    });
    sheet = created.replies[0].addSheet.properties;
  }

  return await withGsheetTabLock(tabName, async () => {
    await gsheetApi("POST", `/values/${encodeURIComponent(quoteTab(tabName))}:clear`, { data: {} });

    const headerRow = columns.map((c) => c.header);
    const dataRows = (rows || []).map((row) => columns.map((c) => row?.[c.field] ?? ""));

    await gsheetApi("POST", "/values:batchUpdate", {
      data: {
        valueInputOption: "USER_ENTERED",
        data: [{ range: `${quoteTab(tabName)}!A1`, values: [headerRow, ...dataRows] }],
      },
    });

    return { ok: true, message: `탭 "${tabName}" — ${dataRows.length}건 반영 완료.` };
  });
}

exports.backfillGsheetFareHistory = functions
  .runWith({ timeoutSeconds: 300, memory: "256MB" })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).send("POST만 허용됩니다."); return; }

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};

    if (body.key !== GSHEET_BACKFILL_KEY) { res.status(403).send("forbidden"); return; }
    if (!GSHEET_PROGRAM_LINK_ENABLED) { res.status(409).send(GSHEET_LINK_OFF_MESSAGE); return; }

    try {
      const results = [];
      results.push(await backfillGsheetFareRows({
        tabName: "운임표(명칭)",
        columns: GSHEET_FARE_NAME_COLUMNS,
        rows: Array.isArray(body.nameRows) ? body.nameRows : [],
      }));
      results.push(await backfillGsheetFareRows({
        tabName: "운임표(주소)",
        columns: GSHEET_FARE_ADDRESS_COLUMNS,
        rows: Array.isArray(body.addressRows) ? body.addressRows : [],
      }));
      res.status(200).send(results.map((r) => r.message).join("\n"));
    } catch (e) {
      console.error("운임 이력 구글시트 전송 오류:", e);
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

      // ⭐ 전체 연결은 꺼져 있고(시트는 사람이 직접 작성) "내 오더만 보내기"만 켜져 있을 때(2026-10-26 개편):
      //    ① 지정 계정이 켠 시각 이후 새로 등록한 오더에 _gsheetMine(전송 대기) 표시만 단다 — 바로 보내지 않음
      //    ② 관리자메뉴 [구글시트로 전송]을 누르면 대기 오더를 한 번에 넣고 _gsheetMineSent 표시
      //    ③ 전송된 오더는 그 뒤 수정·삭제가 시트의 그 줄에 그대로 반영된다
      if (!GSHEET_PROGRAM_LINK_ENABLED) {
        // ⭐ 가져오기 취소처럼 "프로그램에서만 지우고 시트 줄은 남겨야" 하는 경우 — 표시가 있으면 시트는 건드리지 않는다
        if (after?._gsheetKeepRow || (!after && before?._gsheetKeepRow)) return;
        // ⭐ 2026-10-27 수정 — 포인터의 doc 값은 "orders/abc" 형식이라 문서ID("abc")와 비교하면 늘 달랐다
        //    (실시간 방식 때 보낸 오더의 수정·삭제가 시트에 안 가던 원인)
        const sentOf = (d) => !!(d && (d._gsheetMineSent || (d._gsheetMine && [dispatchId, `${col}/${dispatchId}`].includes(d._gsheetSync?.doc))));
        let isMine = !!(after?._gsheetMine || before?._gsheetMine);
        // ⭐ 새로 등록됐거나, 블라인드로 바뀐 순간(블라인드 때문에 예전에 못 모은 오더 복구)에 모을 대상인지 본다
        if (!isMine && after && (!before || (after.블라인드 === true && before.블라인드 !== true))) {
          const mine = await getGsheetMineConfig();
          const sinceMs = mine?.since?.toMillis?.() || 0;
          const createdMs = after.createdAt?.toMillis?.() || (typeof after.createdAt === "number" ? after.createdAt : Date.now());
          if (mine?.enabled && mine.email &&
              String(after.작성자 || "").trim().toLowerCase() === String(mine.email).trim().toLowerCase() &&
              createdMs >= sinceMs && !after.importBatchId && after.source !== "transport_transmit" &&
              isGsheetDolcaeOrder(after)) { // ⭐ 2026-11-06 돌캐 오더만
            await change.after.ref.update({ _gsheetMine: true }).catch(() => {});
          }
          return; // 전송 대기 — [구글시트로 전송] 버튼을 누를 때 들어간다
        }
        if (!isMine) return;
        // ⭐ 2026-11-06 예전에 잘못 표시된 다른 회사·고정노선 오더 — 시트에 들어간 줄은 지우고 표시를 뗀다(다시 안 들어가게)
        if (!isGsheetDolcaeOrder(after || before)) {
          if (sentOf(before) || sentOf(after)) await removeDocFromGsheet(`${col}/${dispatchId}`, before || after).catch((e) => console.warn("다른 회사 오더 시트 줄 정리 실패:", e?.message || e));
          if (after) await change.after.ref.update({ _gsheetMine: FieldValue.delete(), _gsheetMineSent: FieldValue.delete(), _gsheetSync: FieldValue.delete() }).catch(() => {});
          return;
        }
        const wasSent = sentOf(before);
        const isSent = sentOf(after) || wasSent;
        if (!isSent) {
          // ⭐ 전송 버튼과 거의 동시에 지운 경우 시트에 줄이 이미 들어갔을 수 있다 — 오더ID로 찾아 있으면 지운다
          if (!after && before?._gsheetMine) await removeDocFromGsheet(`${col}/${dispatchId}`, before).catch((e) => console.warn("대기 오더 삭제 확인 실패:", e?.message || e));
          return; // 아직 전송 안 한 오더는 시트와 무관
        }
        // ⭐ 운송사 초기화 중(대량 삭제)에는 시트 줄을 지우지 않는다 — 시트는 사람이 직접 관리하는 기록
        if (!after && await isBulkModeFor(before?.companyName)) return;
        // 전체 덮어쓰기 저장으로 표시가 빠졌으면 다시 단다(동기화는 아래에서 최신 문서를 다시 읽어 이어서 처리)
        if (after && (!after._gsheetMine || !after._gsheetMineSent)) {
          await change.after.ref.update({ _gsheetMine: true, _gsheetMineSent: true }).catch(() => {});
        }
      }
      // ⭐ 블라인드 오더는 시트에 기록하지 않는다 — 블라인드로 바뀐 경우 이미 있던 줄은 아래 동기화에서 지운다
      //    (단, "내 오더 보내기"로 보낸 오더는 블라인드여도 시트에 그대로 둔다)
      if (!before && after?.블라인드 === true && !after._gsheetMine) return;
      if (!after && before?.블라인드 === true && !before._gsheetSync && !before._gsheetMine) return;

      if (!after) {
        // 문서가 완전삭제됨 — 시트에 남은 이 오더의 줄을 오더ID(또는 예전 줄번호)로 찾아 지운다
        if (before && (GSHEET_PROGRAM_LINK_ENABLED ? (before._gsheetMine || (before.companyName || "돌캐") === GSHEET_TARGET_COMPANY) : true) && before.source !== "transport_transmit") {
          try {
            await removeDocFromGsheet(`${col}/${dispatchId}`, before);
          } catch (e) {
            console.error("▥ 구글시트 행 삭제 실패:", e?.message || e);
          }
        }
        return;
      }

      // ⭐ 무한루프 방지 — 이 함수 자신이 _gsheetSync를 써서 생기는 재호출을 걸러낸다.
      // (_gsheetSync만 바뀌고 그 외 필드는 동일하면 스킵)
      if (before) {
        const a = { ...after }; delete a._gsheetSync; delete a.updatedAt; delete a._gsheetMine; delete a._gsheetMineSent; delete a._gsheetMineSentAt;
        const b = { ...before }; delete b._gsheetSync; delete b.updatedAt; delete b._gsheetMine; delete b._gsheetMineSent; delete b._gsheetMineSentAt;
        if (JSON.stringify(a) === JSON.stringify(b)) return;
      }

      try {
        await syncOneDispatchToGsheet(`${col}/${dispatchId}`, after, before);
      } catch (e) {
        console.error("▥ 구글시트 동기화 실패:", e?.message || e);
      }
    });

// 모든 월별 탭에 "시트 직접 입력 도우미"(필수칸 표시·목록 선택 등)를 적용 — 관리자메뉴 버튼
// 호출: GET .../applyGsheetGuides?key=<GSHEET_BACKFILL_KEY>
exports.applyGsheetGuides = functions
  .runWith({ timeoutSeconds: 300, memory: "256MB" })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    if (req.query.key !== GSHEET_BACKFILL_KEY) { res.status(403).send("권한 없음"); return; }
    try {
      const tabs = (await getGsheetSheetList()).filter((x) => gsheetTabSortKey(x.title) !== null).map((x) => x.title);
      const done = [];
      const failed = [];
      for (const t of tabs) {
        try { await applyGsheetInputGuides(t); done.push(t); } catch (e) { failed.push(`${t}(${e?.message || e})`); }
      }
      res.send(`✓ ${done.length}개 탭에 적용: ${done.join(", ")}${failed.length ? `\n⚠ 실패: ${failed.join(", ")}` : ""}`);
    } catch (e) {
      res.status(500).send(`적용 실패: ${e?.message || e}`);
    }
  });

/* ==================================================================
   ⌕ 구글시트 점검 — 한 달 탭을 프로그램과 날짜별로 비교하고(fix=1이면 자동으로 맞춤)
   - 시트에만 있는 줄(삭제·취소된 오더, 같은 오더가 2줄, 오더ID 없는 줄): 지움
   - 프로그램에만 있는 오더: 실시간 동기화와 같은 방식으로 넣음
   호출: GET .../checkGsheetMonth?key=<GSHEET_BACKFILL_KEY>&month=YYYY-MM[&fix=1]
================================================================== */
exports.checkGsheetMonth = functions
  .runWith({ timeoutSeconds: 540, memory: "256MB" })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    if (req.query.key !== GSHEET_BACKFILL_KEY) { res.status(403).send("권한 없음"); return; }
    const month = String(req.query.month || "");
    if (!/^\d{4}-\d{2}$/.test(month)) { res.status(400).send("month=YYYY-MM 형식으로 넣어주세요"); return; }
    const fix = req.query.fix === "1";
    if (fix && !GSHEET_PROGRAM_LINK_ENABLED) { res.status(409).send(GSHEET_LINK_OFF_MESSAGE); return; }
    try {
      const tabName = gsheetMonthTabName(`${month}-01`);
      const sheet = (await getGsheetSheetList()).find((x) => x.title === tabName);
      // 프로그램 쪽(백필과 같은 기준)
      const program = new Map(); // docId -> 상차일
      for (const col of ["orders", "dispatch"]) {
        const snap = await db.collection(col).where("상차일", ">=", `${month}-01`).where("상차일", "<", `${month}~`).get();
        snap.docs.forEach((d) => {
          const x = d.data();
          if (x.source === "transport_transmit" || x.블라인드 === true) return;
          if ((x.companyName || "돌캐") !== GSHEET_TARGET_COMPANY) return;
          if (isGsheetCanceled(x)) return;
          program.set(`${col}/${d.id}`, String(x["상차일"] || "").trim());
        });
      }
      if (!sheet) { res.send(`[${tabName}] 시트 탭이 없습니다. 프로그램 ${program.size}건`); return; }
      const colMap = await ensureGsheetIdColumn(tabName);
      const dateCol = colMap.상차일 || "B";
      const idCol = colMap.오더ID;
      const [dRes, iRes] = await Promise.all([
        gsheetApi("GET", `/values/${encodeURIComponent(`${quoteTab(tabName)}!${dateCol}2:${dateCol}6000`)}`),
        idCol ? gsheetApi("GET", `/values/${encodeURIComponent(`${quoteTab(tabName)}!${idCol}2:${idCol}6000`)}`) : Promise.resolve({ values: [] }),
      ]);
      const dates = dRes.values || [];
      const ids = iRes.values || [];
      const sheetRows = []; // { row, date, id }
      const n = Math.max(dates.length, ids.length);
      for (let i = 0; i < n; i++) {
        const date = String(dates[i]?.[0] || "").trim();
        const id = String(ids[i]?.[0] || "").trim();
        if (!date && !id) continue; // 날짜 구분용 빈 줄
        sheetRows.push({ row: i + 2, date, id });
      }
      const seen = new Set();
      const extra = []; // 지울 줄
      sheetRows.forEach((r) => {
        if (!r.id) { extra.push({ ...r, why: "오더ID 없음(예전 방식 줄)" }); return; }
        if (!program.has(r.id)) { extra.push({ ...r, why: "프로그램에 없음(삭제·취소)" }); return; }
        if (seen.has(r.id)) { extra.push({ ...r, why: "중복" }); return; }
        seen.add(r.id);
      });
      const missing = [...program.keys()].filter((id) => !seen.has(id));
      // 날짜별 건수
      const byDate = {};
      program.forEach((d) => { byDate[d] = byDate[d] || { p: 0, s: 0 }; byDate[d].p += 1; });
      sheetRows.forEach((r) => { if (r.date) { byDate[r.date] = byDate[r.date] || { p: 0, s: 0 }; byDate[r.date].s += 1; } });
      const lines = Object.keys(byDate).sort().map((d) => `${d}  프로그램 ${byDate[d].p} / 시트 ${byDate[d].s}${byDate[d].p !== byDate[d].s ? "  ← 다름" : ""}`);
      const legacy = extra.filter((e) => e.why.startsWith("오더ID 없음")).length;
      let out = `[${tabName}] 프로그램 ${program.size}건 / 시트 ${sheetRows.length}줄\n` +
        `시트에만 있음 ${extra.length - legacy}줄 · 오더ID 없는 예전 줄 ${legacy}줄 · 시트에 없음 ${missing.length}건\n\n` + lines.join("\n");
      if (legacy > 0 && !fix) out += `\n\n※ 오더ID 없는 예전 줄이 있으면 정확히 비교할 수 없어요 — 이 달은 "백필"을 한 번 실행해 주세요(모든 줄에 오더ID가 붙습니다).`;
      if (fix) {
        if (legacy > 0) {
          out += `\n\n⚠ 오더ID 없는 예전 줄이 있어 자동 정리를 하지 않았습니다 — 이 달은 "백필"을 먼저 실행해 주세요.`;
        } else {
          await withGsheetTabLock(tabName, async () => {
            for (const r of extra.sort((a, b) => b.row - a.row)) await removeGsheetRowUnlocked(tabName, r.row);
          });
          for (const id of missing) {
            const snap = await db.doc(id).get();
            if (snap.exists) await syncOneDispatchToGsheet(id, snap.data(), snap.data());
          }
          out += `\n\n✓ 정리 완료 — 시트에서 ${extra.length}줄 삭제, ${missing.length}건 추가`;
        }
      }
      res.send(out);
    } catch (e) {
      console.error("구글시트 점검 실패:", e);
      res.status(500).send(`점검 실패: ${e?.message || e}`);
    }
  });

/* ==================================================================
   ⌕ 로그인 전 "회사코드 찾기" — transportApplications 컬렉션은 Firestore
   규칙상 로그인(isSignedIn())해야 읽을 수 있는데, 이 검색은 정의상 로그인
   "하기 전"에 쓰는 기능이라 브라우저에서 직접 Firestore를 조회하면 항상
   권한 오류로 막혀 "검색 결과가 없습니다"만 뜨는 상태였다. 그래서 서버
   (Admin SDK, 규칙 영향 안 받음)에서만 조회하고, 응답에는 로그인에 필요한
   회사명/코드만 내려준다 — 전화번호·사업자번호 등 다른 민감정보는 절대
   포함하지 않는다(로그인 전 누구나 호출 가능한 엔드포인트이므로).
   호출: GET https://.../lookupCompanyCode?q=검색어
================================================================== */
// 🏢 운송사 분리 2단계 — 회사명 없는 예전 문서에 회사명을 채운다(최고관리자만, 관리센터 버튼이 여러 번 나눠 부름).
//  회사명이 없으면: company(화주사 오더의 받는 운송사·결재/게시판의 회사) → 없으면 기본 회사("돌캐")
const TENANT_COLS = ["orders", "dispatch", "dispatch_test", "drivers", "clients", "places", "fixedClients", "recurringOrders",
  "deletedOrders", "driver_completed_archive", "notices", "schedules", "handovers", "boardPosts", "approvals", "approvalLines",
  "notifications", "scheduledEmails", "emailLogs", "hrResumes", "attendanceRequests", "attendanceChangeRequests", "acctPayments"];
// ⭐ 2026-11-03 회사명 없는 데이터 점검·삭제 — 기사앱·서버 기록(회사명 없으면 모든 회사에 보이던 것)
const TENANT_LOOSE_COLS = ["driver_logs", "gps_tracks", "liveLocations", "driver_photo_logs", "driver_documents", "driver_notifications",
  "location_change_requests", "emergency_alerts", "collision_alerts", "driver_uploads", "attendance"];
const TENANT_ALL_COLS = [...TENANT_COLS, ...TENANT_LOOSE_COLS, "routeBoards", "fixedRoutes"];
const _tsMsAny = (t) => (t?.toMillis ? t.toMillis() : t?._seconds ? t._seconds * 1000 : t?.seconds ? t.seconds * 1000 : typeof t === "number" ? t : 0);
// 문서 날짜(YYYY-MM-DD) — 오더는 상차일, 기록은 날짜 칸, 없으면 만든 시각
function _docDay(x) {
  for (const k of ["상차일", "날짜", "logDate", "date", "workDate"]) { const v = String(x?.[k] || ""); if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10); }
  for (const k of ["createdAt", "timestamp", "updatedAt", "uploadedAt", "at"]) { const ms = _tsMsAny(x?.[k]); if (ms > 0) return new Date(ms + 9 * 3600e3).toISOString().slice(0, 10); }
  return "";
}
const _emptyCo = (x) => !(typeof x?.companyName === "string" && x.companyName.trim()) && !(typeof x?.company === "string" && x.company.trim()) && !(typeof x?.운송사명 === "string" && x.운송사명.trim());
async function requireTotalMaster(req) {
  const authz = String(req.get("Authorization") || "");
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) return false;
  const decoded = await getAuth().verifyIdToken(token).catch(() => null);
  if (!decoded) return false;
  if (decoded.email === "tjddnqkf@naver.com") return true;
  const u = await db.collection("users").doc(decoded.uid).get();
  return u.exists && u.data().role === "totalMaster";
}
exports.tenantMigrate = functions.runWith({ timeoutSeconds: 300, memory: "512MB" }).https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await requireTotalMaster(req))) { res.status(403).json({ error: "FORBIDDEN" }); return; }
  const col = String(req.body?.col || "");
  const mode = String(req.body?.mode || "fill"); // fill(돌캐로 채우기) | scan(점검만) | purge(기준일 이전 삭제)
  if (!(mode === "fill" ? TENANT_COLS : TENANT_ALL_COLS).includes(col)) { res.status(400).json({ error: "BAD_COL", cols: TENANT_ALL_COLS }); return; }
  let cursor = req.body?.cursor || null;
  const started = Date.now();
  if (mode === "scan" || mode === "purge") {
    const { FieldPath: FP } = require("firebase-admin/firestore");
    const before = String(req.body?.before || "");
    if (mode === "purge" && !/^\d{4}-\d{2}-\d{2}$/.test(before)) { res.status(400).json({ error: "기준일(before)이 필요합니다." }); return; }
    let total = 0, empty = 0, removed = 0, oldest = "", newest = "", noDate = 0, done = false;
    const sample = [];
    while (Date.now() - started < 200000) {
      let q = db.collection(col).orderBy(FP.documentId()).limit(400);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) { done = true; break; }
      const dels = [];
      snap.docs.forEach((d) => {
        total += 1;
        const x = d.data() || {};
        if (!_emptyCo(x)) return;
        empty += 1;
        const day = _docDay(x);
        if (!day) noDate += 1; else { if (!oldest || day < oldest) oldest = day; if (!newest || day > newest) newest = day; }
        if (sample.length < 5) sample.push({ id: d.id, day, title: String(x.거래처명 || x.title || x.이름 || x.차량번호 || x.name || "").slice(0, 40) });
        if (mode === "purge" && (!day || day < before)) dels.push(d.ref);
      });
      for (const ref of dels) {
        if (col === "orders" || col === "dispatch") { // 오더에 달린 사진·파일(첨부)도 같이
          const att = await ref.collection("attachments").get();
          for (let i = 0; i < att.docs.length; i += 400) { const b = db.batch(); att.docs.slice(i, i + 400).forEach((a) => b.delete(a.ref)); await b.commit(); }
        }
      }
      for (let i = 0; i < dels.length; i += 400) { const b = db.batch(); dels.slice(i, i + 400).forEach((r) => b.delete(r)); await b.commit(); }
      removed += dels.length;
      cursor = snap.docs[snap.docs.length - 1].id;
      if (snap.size < 400) { done = true; break; }
    }
    res.status(200).json({ col, mode, cursor, total, empty, removed, oldest, newest, noDate, sample, done });
    return;
  }
  let scanned = 0, updated = 0, done = false;
  const { FieldPath } = require("firebase-admin/firestore");
  while (Date.now() - started < 200000) {
    let q = db.collection(col).orderBy(FieldPath.documentId()).limit(400);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) { done = true; break; }
    const batch = db.batch(); let n = 0;
    snap.docs.forEach((d) => {
      const x = d.data() || {};
      const c = typeof x.companyName === "string" ? x.companyName.trim() : "";
      if (c) return;
      const fb = (typeof x.company === "string" && x.company.trim()) || (typeof x.운송사명 === "string" && x.운송사명.trim()) || "돌캐";
      batch.update(d.ref, { companyName: fb }); n += 1;
    });
    if (n) await batch.commit();
    scanned += snap.size; updated += n;
    cursor = snap.docs[snap.docs.length - 1].id;
    if (snap.size < 400) { done = true; break; }
  }
  res.status(200).json({ col, cursor, scanned, updated, done });
});

// 🔎 기사 통합 업로드 링크(/driver-upload) 검색 — 로그인 없는 화면이라, 서버 규칙을 잠근 뒤에는
//  오더 목록을 직접 못 읽는다. 날짜·차량번호·이름(+회사)이 모두 맞는 오더만 필요한 칸만 돌려준다.
exports.driverSearch = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const date = String(req.query.date || "").trim();
  const vehicle = String(req.query.vehicle || "").replace(/\s/g, "");
  const name = String(req.query.name || "").trim();
  const co = String(req.query.co || "").trim();
  const fixed = req.query.source === "fixed";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !vehicle || !name) { res.status(400).json({ error: "BAD_PARAMS" }); return; }
  const pick = (id, col, x) => ({ _id: id, _col: col, 상차일: x.상차일 || x.날짜 || "", 차량번호: x.차량번호 || "", 이름: x.이름 || "", 거래처명: x.거래처명 || "",
    상차지명: x.상차지명 || "", 하차지명: x.하차지명 || "", 화물내용: x.화물내용 || "", 배차상태: x.배차상태 || "", attachCount: x.attachCount || 0, 업로드토큰: x.업로드토큰 || "" });
  const same = (x) => String(x.차량번호 || "").replace(/\s/g, "") === vehicle && String(x.이름 || "").trim() === name
    && (!co || (String(x.companyName || x.company || "").trim() || "돌캐") === co);
  try {
    const out = [];
    if (fixed) {
      const s = await db.collection("fixedClients").where("날짜", "==", date).get();
      s.docs.forEach((d) => { const x = d.data() || {}; if (same(x)) out.push(pick(d.id, "fixedClients", x)); });
    } else {
      for (const col of ["orders", "dispatch"]) {
        const s = await db.collection(col).where("상차일", "==", date).get();
        s.docs.forEach((d) => { const x = d.data() || {}; if (x.source !== "transport_transmit" && same(x)) out.push(pick(d.id, col, x)); });
      }
    }
    res.status(200).json({ results: out });
  } catch (e) {
    res.status(500).json({ error: "SEARCH_FAILED" });
  }
});

// 📧 가입 화면 이메일 중복확인 — 로그인 전 화면은 보안 규칙상 users 목록을 못 읽어서
//  "사용 중 여부"만 서버가 대신 알려준다(문서 내용은 돌려주지 않음). 삭제·탈퇴 계정은 재가입 허용.
exports.checkEmail = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.query.ping === "1") { res.status(200).json({ ok: true }); return; }
  const e = String(req.query.e || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) { res.status(400).json({ error: "BAD_EMAIL" }); return; }
  try {
    const snap = await db.collection("users").where("email", "==", e).limit(5).get();
    let used = snap.docs.some((d) => !["deleted", "withdrawn"].includes(d.data().status));
    // ⭐ 2026-11-01 users 문서는 없어도 로그인 계정이 남아 있으면 — 삭제된 계정(정리 가능)이 아니면 "사용 중"
    //    (예전엔 여기서 "사용 가능"이라 나오고 막상 가입하면 "이미 가입된 이메일"로 막혔다)
    if (!used) {
      const u = await getAuth().getUserByEmail(e.toLowerCase()).catch(() => null);
      if (u && !(await canFreeAuthAccount(u))) {
        const created = Date.parse(u.metadata?.creationTime || "") || 0;
        const recent = created && Date.now() - created < 10 * 60000;
        if (!recent) used = true;
      }
    }
    res.status(200).json({ used });
  } catch (err) {
    res.status(500).json({ error: "CHECK_FAILED" });
  }
});

// ⭐ 2026-11-01 삭제된 계정의 이메일로 다른 사람도 다시 가입할 수 있게 —
//  예전엔 직원 삭제·운송사 삭제가 users 문서만 지우고 로그인 계정(Firebase 인증)은 남겨서,
//  같은 이메일로 가입하면 "이미 가입된 이메일"로 막혔다(예전 비밀번호를 아는 본인만 재가입 가능).
//  users 문서가 없거나(삭제됨) 탈퇴·삭제 상태인 로그인 계정은 지워 준다. 최고관리자 계정·방금 만든 계정은 제외.
const SUPER_EMAIL_FREE = "tjddnqkf@naver.com";
async function canFreeAuthAccount(u) {
  if (!u || !u.uid) return false;
  if (String(u.email || "").toLowerCase() === SUPER_EMAIL_FREE) return false;
  const created = Date.parse(u.metadata?.creationTime || "") || 0;
  if (created && Date.now() - created < 10 * 60000) return false; // 가입 진행 중인 계정 보호
  const snap = await db.collection("users").doc(u.uid).get();
  if (snap.exists) {
    const st = snap.data().status;
    return st === "deleted" || st === "withdrawn";
  }
  // users 문서가 없는 계정은 "운송사 삭제(초기화)로 사용 중지된 계정"일 때만 — 다른 서비스(KP-Planner 등) 전용 계정은 건드리지 않는다
  if (!u.disabled) return false;
  const bk = await db.collection("resetBackups").where("accountUids", "array-contains", u.uid).limit(1).get().catch(() => ({ empty: true }));
  return !bk.empty;
}
async function freeAuthAccount(u) {
  // 운송사 초기화 보관함(7일 복원용)에 들어 있으면 목록에서 빼고 지운다(복원해도 이 계정은 새로 가입한 사람 것이 됨)
  const bk = await db.collection("resetBackups").where("accountUids", "array-contains", u.uid).get().catch(() => ({ docs: [] }));
  for (const d of bk.docs) await d.ref.set({ accountUids: FieldValue.arrayRemove(u.uid), releasedUids: FieldValue.arrayUnion(u.uid) }, { merge: true }).catch(() => {});
  await getAuth().deleteUser(u.uid);
}
exports.freeDeletedEmail = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const e = String(req.query.e || req.body?.e || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) { res.status(400).json({ error: "BAD_EMAIL" }); return; }
  try {
    const u = await getAuth().getUserByEmail(e).catch(() => null);
    if (!u) { res.status(200).json({ freed: false, exists: false }); return; }
    if (!(await canFreeAuthAccount(u))) { res.status(200).json({ freed: false, exists: true }); return; }
    await freeAuthAccount(u);
    console.log(`♻ 삭제된 계정 이메일 해제: ${e}`);
    res.status(200).json({ freed: true });
  } catch (err) {
    res.status(500).json({ error: "FREE_FAILED" });
  }
});
// 직원 삭제(users 문서 삭제) → 로그인 계정도 바로 삭제. 단, 운송사 초기화 보관 중(7일 복원 대기)인 계정은 사용 중지 상태로 둔다
exports.onUserDocDeleted = functions.firestore.document("users/{uid}").onDelete(async (snap, ctx) => {
  const uid = ctx.params.uid;
  const data = snap.data() || {};
  if (String(data.email || "").toLowerCase() === SUPER_EMAIL_FREE || data.role === "totalMaster") return null;
  const bk = await db.collection("resetBackups").where("accountUids", "array-contains", uid).get().catch(() => ({ docs: [] }));
  if (bk.docs.some((d) => ["saving", "kept", "restoring"].includes(d.data().status))) return null;
  const u = await getAuth().getUser(uid).catch(() => null);
  if (!u) return null;
  // 같은 uid로 바로 다시 가입한 경우(문서를 다시 만든 경우)는 건드리지 않는다
  const again = await db.collection("users").doc(uid).get();
  if (again.exists) return null;
  await getAuth().deleteUser(uid).catch((e) => console.warn("로그인 계정 삭제 실패", uid, e?.message));
  console.log(`✕ 삭제된 직원 로그인 계정 정리: ${data.email || uid}`);
  return null;
});

// ⭐ 2026-11-03 기사 가입 자동 연결 — 기사가 기사앱에서 가입할 때, 그 운송사 기사관리(drivers)에
//  같은 차량번호(공백 제거·대문자) 기사가 이미 있고 휴대폰번호(숫자만) 또는 이름이 같으면
//  새 계정을 그 기사와 바로 연결하고 승인까지 끝낸다(관리자 승인 기다릴 필요 없음).
//  · 기사앱은 drivers/{로그인 uid} 문서를 읽으므로 "연결" = 기존 기사 문서 내용을 drivers/{uid}로
//    옮기고(uid 필드도 기록) 예전 문서는 지운다 — 예전 PC 선등록 이어받기와 같은 방식.
//  · 기사가 입력한 값은 비어 있지 않은 칸만 기존 값을 덮어쓰고, 비운 칸은 프로그램 값을 그대로 둔다.
//    users 문서에도 같은 결과(빈 칸은 프로그램 값으로 채움)를 쓴다.
//  · 맞는 기사가 없으면 아무것도 쓰지 않고 { linked:false } — 화면이 예전처럼 "승인 대기"로 가입시킨다.
//  · 가입 직전 계정(로그인 토큰)으로만 호출 가능. 토큰 이메일이 그 차량번호의 기사 계정이어야 하고,
//    이미 승인된 계정이나 다른 역할 계정은 건드리지 않는다.
const DRIVER_EMAIL_DOMAIN = "@driver.run25.kr";
const drvPlate = (v) => String(v || "").replace(/\s+/g, "").toUpperCase();
const drvDigits = (v) => String(v || "").replace(/\D/g, "");
const drvName = (v) => String(v || "").replace(/\s+/g, "");
const drvFilled = (v) => {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
};
exports.linkDriverSignup = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST_ONLY" }); return; }
  try {
    const m = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
    if (!m) { res.status(401).json({ error: "NO_TOKEN" }); return; }
    const tok = await getAuth().verifyIdToken(m[1]).catch(() => null);
    if (!tok) { res.status(401).json({ error: "BAD_TOKEN" }); return; }
    const uid = tok.uid;
    const email = String(tok.email || "").toLowerCase();
    const b = (req.body && typeof req.body === "object") ? req.body : {};
    const s = (v, n = 200) => String(v ?? "").trim().slice(0, n);
    const co = s(b.companyName, 100);
    const carNo = s(b.carNo, 30);
    const name = s(b.name, 40);
    const phone = s(b.phone, 20);
    if (!co || !carNo || !name) { res.status(400).json({ error: "BAD_PARAMS" }); return; }
    // 토큰 계정이 이 차량번호의 기사 계정인지(차량번호@… 또는 차량번호.c회사@…)
    const local = String(carNo).replace(/ /g, "").toLowerCase();
    if (!email.endsWith(DRIVER_EMAIL_DOMAIN) || !(email.startsWith(`${local}@`) || email.startsWith(`${local}.c`))) {
      res.status(403).json({ error: "NOT_DRIVER_ACCOUNT" }); return;
    }
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      const u = userSnap.data() || {};
      if (u.role !== "driver" || u.approved !== false) { res.status(200).json({ linked: false, reason: "ALREADY" }); return; }
    }

    // 후보: 같은 회사 기사 + (기본 회사면) 회사명이 비어 있는 옛 문서
    const plate = drvPlate(carNo);
    const cands = new Map();
    const coSnap = await db.collection("drivers").where("companyName", "==", co).get();
    coSnap.docs.forEach((d) => cands.set(d.id, d));
    if (co === PUSH_DEFAULT_COMPANY) {
      const raws = [...new Set([carNo, plate, carNo.replace(/\s+/g, "")])].slice(0, 10);
      const legacy = await db.collection("drivers").where("차량번호", "in", raws).get().catch(() => ({ docs: [] }));
      legacy.docs.forEach((d) => { if (!String(d.data().companyName || "").trim()) cands.set(d.id, d); });
    }
    const myDigits = drvDigits(phone);
    let best = null;
    let bestScore = 0;
    for (const d of cands.values()) {
      if (d.id === uid) continue;
      const x = d.data() || {};
      if (drvPlate(x.차량번호 || x.carNo) !== plate) continue;
      if (x.uid && x.uid !== uid) continue; // 이미 다른 기사 계정과 연결된 문서
      const xd = drvDigits(x.전화번호 || x.phone);
      const samePhone = myDigits.length >= 9 && xd.length >= 9 && xd === myDigits;
      const sameName = drvName(x.이름 || x.name) !== "" && drvName(x.이름 || x.name) === drvName(name);
      const score = (samePhone ? 2 : 0) + (sameName ? 1 : 0);
      if (score > bestScore) { best = d; bestScore = score; }
    }
    if (!best) { res.status(200).json({ linked: false }); return; }

    const base = { ...(best.data() || {}) };
    // 기사 입력값 — 비어 있지 않은 칸만 덮어쓴다
    const acct = b.정산계좌 && typeof b.정산계좌 === "object" && s(b.정산계좌.acct) ? { bank: s(b.정산계좌.bank, 40), acct: drvDigits(b.정산계좌.acct).slice(0, 20), holder: s(b.정산계좌.holder, 40) } : null;
    const input = {
      이름: name, name,
      차량번호: carNo, carNo,
      전화번호: phone, phone,
      차량종류: s(b.차량종류, 40), 차량톤수: s(b.차량톤수, 40),
      거주지: s(b.거주지, 40), 요청사항: s(b.요청사항, 500),
      정산계좌: acct, 사업자번호: drvDigits(b.사업자번호).slice(0, 10), 사업자상호: s(b.사업자상호, 80),
    };
    const merged = { ...base };
    Object.entries(input).forEach(([k, v]) => { if (drvFilled(v)) merged[k] = v; });
    // 영문/한글 짝 필드는 서로 비어 있으면 채워 둔다(PC는 한글, 기사앱은 영문 필드를 읽음)
    [["이름", "name"], ["차량번호", "carNo"], ["전화번호", "phone"]].forEach(([ko, en]) => {
      if (!drvFilled(merged[ko]) && drvFilled(merged[en])) merged[ko] = merged[en];
      if (!drvFilled(merged[en]) && drvFilled(merged[ko])) merged[en] = merged[ko];
    });
    if (drvFilled(merged.차량종류) && drvFilled(merged.차량톤수) && (drvFilled(input.차량종류) || drvFilled(input.차량톤수) || !drvFilled(merged.vehicleType))) {
      merged.vehicleType = `${merged.차량종류} ${merged.차량톤수}`;
    } else if (!drvFilled(merged.vehicleType) && (drvFilled(merged.차량종류) || drvFilled(merged.차량톤수))) {
      merged.vehicleType = `${merged.차량종류 || ""} ${merged.차량톤수 || ""}`.trim();
    }
    const now = FieldValue.serverTimestamp();
    const driverDoc = {
      mainStatus: "대기", subStatus: "대기", status: "대기", state: "대기", goStatus: "대기",
      active: false, totalDistance: 0, 등급: "일반",
      ...merged,
      uid,
      companyName: co,
      approved: true,
      linkedFromDriverId: best.id !== uid ? best.id : (base.linkedFromDriverId || ""),
      linkedAt: now,
      linkedBy: "기사 가입 자동 연결",
      createdAt: base.createdAt || now,
      updatedAt: now,
    };
    if ("id" in base) driverDoc.id = uid; // {id: 문서이름, ...data} 로 읽는 화면이 예전 이름을 쓰지 않게

    const pick = (k) => (drvFilled(merged[k]) ? merged[k] : "");
    const hireDate = /^\d{4}-\d{2}-\d{2}$/.test(s(b.hireDate, 10)) ? s(b.hireDate, 10) : "";
    const userDoc = {
      uid, email, role: "driver",
      name: pick("name") || name, carNo: pick("carNo") || carNo, phone: pick("phone"),
      vehicleType: pick("vehicleType"), 차량종류: pick("차량종류"), 차량톤수: pick("차량톤수"),
      거주지: pick("거주지"), 요청사항: pick("요청사항"),
      companyName: co,
      hireDate,
      정산계좌: drvFilled(merged.정산계좌) ? merged.정산계좌 : null,
      사업자번호: pick("사업자번호"), 사업자상호: pick("사업자상호"),
      approved: true,
      termsAgreed: b.termsAgreed === true, privacyAgreed: b.privacyAgreed === true, gpsAgreed: b.gpsAgreed === true,
      linkedDriverAuto: true,
      linkedFromDriverId: driverDoc.linkedFromDriverId,
      createdAt: now,
    };

    await db.runTransaction(async (t) => {
      const cur = await t.get(best.ref);
      if (!cur.exists) throw Object.assign(new Error("gone"), { code: "GONE" });
      const cu = cur.data().uid;
      if (cu && cu !== uid) throw Object.assign(new Error("taken"), { code: "TAKEN" });
      t.set(db.collection("drivers").doc(uid), driverDoc);
      t.set(userRef, userDoc);
      if (best.id !== uid) t.delete(best.ref);
    });
    if (hireDate) await db.collection("userProfiles").doc(uid).set({ hireDate }, { merge: true }).catch(() => {});
    // PC에서 예전 문서 이름으로 올려 둔 기사 서류도 새 문서로 옮긴다
    if (best.id !== uid) {
      const docs = await db.collection("driver_documents").where("driverId", "==", best.id).get().catch(() => ({ docs: [] }));
      for (const d of docs.docs) await d.ref.set({ driverId: uid }, { merge: true }).catch(() => {});
    }
    console.log(`🔗 기사 가입 자동 연결: ${co} ${plate} ${name} → ${best.id} ⇒ drivers/${uid} (점수 ${bestScore})`);
    res.status(200).json({ linked: true, driverId: uid, from: best.id, name: userDoc.name });
  } catch (e) {
    if (e?.code === "GONE" || e?.code === "TAKEN") { res.status(200).json({ linked: false, reason: e.code }); return; }
    console.error("기사 가입 자동 연결 실패:", e);
    res.status(500).json({ error: "LINK_FAILED" });
  }
});

// 🏢 가입 화면 "기존 회사" 검색 — 로그인 전에는 규칙상 transportApplications 를 읽을 수 없어
//  항상 "등록된 운송사가 없습니다"가 떴다. 승인된 운송사의 회사명·주소만 내려준다(다른 정보 없음).
exports.findCompany = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const q = String(req.query.q || "").trim().toLowerCase();
  const exact = req.query.exact === "1";
  const all = req.query.all === "1"; // 가입 화면이 열릴 때 목록을 한 번에 받아 입력 즉시 드롭다운으로 거른다
  if (req.query.ping === "1") { res.status(200).json({ ok: true }); return; }
  if (!all && (!q || q.length > 60)) { res.status(200).json({ results: [] }); return; }
  // ⭐ 2026-11-01 신규 가입 회사명 중복확인 — 승인된 회사 + 승인 대기 중인 신규 신청까지(띄어쓰기·대소문자 무시). 결과는 있음/없음만
  if (req.query.dup === "1") {
    try {
      const norm = (x) => String(x || "").toLowerCase().replace(/\s+/g, "");
      const key = norm(q);
      const [apps, plan] = await Promise.all([
        db.collection("transportApplications").where("type", "==", "신규").get(),
        db.collection("companyPlans").get().catch(() => ({ docs: [] })),
      ]);
      const hitApp = apps.docs.map((d) => d.data()).find((a) => norm(a.companyName) === key && a.status !== "rejected" && a.status !== "deleted");
      const hitPlan = plan.docs.some((d) => norm(d.id) === key);
      res.status(200).json({ used: !!hitApp || hitPlan, pending: !!hitApp && hitApp.status !== "approved" });
    } catch (err) {
      res.status(500).json({ error: "CHECK_FAILED" });
    }
    return;
  }
  res.set("Cache-Control", "public, max-age=60");
  try {
    const [apps, plans] = await Promise.all([
      db.collection("transportApplications").where("type", "==", "신규").get(),
      db.collection("companyPlans").get().catch(() => ({ docs: [] })),
    ]);
    const map = new Map();
    apps.docs.forEach((d) => {
      const a = d.data(); const n = String(a.companyName || "").trim();
      if (!n || a.status !== "approved") return;
      const prev = map.get(n);
      if (!prev || (!prev.address && a.address)) map.set(n, { companyName: n, address: a.address || "" });
    });
    plans.docs.forEach((d) => { const n = String(d.id || "").trim(); if (n && !map.has(n)) map.set(n, { companyName: n, address: "" }); });
    const results = all ? [...map.values()].slice(0, 2000)
      : [...map.values()].filter((c) => (exact ? c.companyName.toLowerCase() === q : c.companyName.toLowerCase().includes(q))).slice(0, 20);
    res.status(200).json({ results });
  } catch (err) {
    res.status(500).json({ results: [], error: "SEARCH_FAILED" });
  }
});

exports.lookupCompanyCode = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  // ⭐ 사용자 요청 — 회사코드 찾기는 최고관리자만. 예전엔 로그인 없이 누구나 호출할 수 있었다.
  // 클라이언트가 최고관리자 계정으로 받은 Firebase ID 토큰을 Authorization 헤더로 보내야 한다.
  try {
    const authz = String(req.get("Authorization") || "");
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!token) { res.status(401).json({ results: [], error: "AUTH_REQUIRED" }); return; }
    const decoded = await getAuth().verifyIdToken(token);
    let isMaster = decoded.email === "tjddnqkf@naver.com";
    if (!isMaster) {
      const u = await db.collection("users").doc(decoded.uid).get();
      isMaster = u.exists && u.data().role === "totalMaster";
    }
    if (!isMaster) { res.status(403).json({ results: [], error: "FORBIDDEN" }); return; }
  } catch (e) {
    res.status(401).json({ results: [], error: "AUTH_INVALID" });
    return;
  }

  const q = String(req.query.q || "").trim().toLowerCase();
  if (!q) { res.status(200).json({ results: [] }); return; }

  try {
    const seen = new Map();
    const add = (name, code) => {
      name = String(name || "").trim();
      code = String(code || "").trim();
      if (!name || !code) return;
      if (!name.toLowerCase().includes(q) && !code.toLowerCase().includes(q)) return;
      const key = `${name}|${code}`;
      if (!seen.has(key)) seen.set(key, { companyName: name, companyCode: code });
    };
    // 1) 가입 신청서(승인된 것)
    const apps = await db.collection("transportApplications").get();
    apps.docs.forEach((d) => {
      const data = d.data();
      if (data.status === "approved" || data.status === "승인") add(data.companyName, data.companyCode);
    });
    // 2) ⭐ 버그수정 — 신청서 없이 만들어진(초기/수동 등록) 회사는 코드가 사용자 문서에만 있어
    //    검색 결과가 항상 비었다. users 문서의 companyName/companyCode도 함께 찾는다.
    const users = await db.collection("users").where("companyCode", ">", "").get();
    users.docs.forEach((d) => { const u = d.data(); add(u.companyName, u.companyCode); });
    res.status(200).json({ results: Array.from(seen.values()).slice(0, 50) });
  } catch (e) {
    console.error("회사코드 찾기 오류:", e);
    res.status(500).json({ results: [], error: e?.message || String(e) });
  }
});
/* ==================================================================
   ◇ 운송사 데이터 초기화 — 최고관리자 전용(관리자메뉴 > 운송사 초기화)
   해당 운송사가 프로그램에 등록한 데이터를 하나도 빠짐없이 지운다.
   - 모든 최상위 컬렉션을 돌면서 아래에 해당하는 문서를 찾는다
     · 회사 필드(companyName/company/회사명/운송사명/transportCompany/companyKey) = 운송사명
     · companyCode = 그 운송사의 회사코드
     · uid/userId 등 = 그 운송사 소속 계정의 uid, 또는 문서ID 자체가 운송사명/uid
   - 찾은 문서는 하위 컬렉션까지 통째로 삭제하고, 문서 안에 있던 첨부파일(Storage)도 지운다.
   - 기본은 "계정은 남기기"(직원·기사가 다시 로그인해 처음부터 쓸 수 있게) — 계정까지 지우면
     users 문서·로그인 계정·가입신청서도 삭제된다.
   - 실행 전 최고관리자가 정한 "초기화 비밀번호"(adminSecrets/companyReset, scrypt 해시)를 확인한다.
   호출: POST .../companyReset  (Authorization: Bearer <ID 토큰>)
     { action: "status" | "setPassword" | "companies" | "preview" | "execute", ... }
================================================================== */
const crypto = require("crypto");
const RESET_SECRET_DOC = db.collection("adminSecrets").doc("companyReset");
const RESET_COMPANY_FIELDS = ["companyName", "company", "회사명", "운송사명", "transportCompany", "companyKey"];
const RESET_UID_FIELDS = ["uid", "userId", "ownerUid", "createdByUid", "writerUid", "authorUid", "driverUid"];
const RESET_SKIP_COLLECTIONS = new Set(["adminSecrets", "resetLogs", "resetBackups", "resetJobs"]);
// ⭐ 진행률 — 화면이 resetJobs/{작업ID}를 실시간으로 보고 "몇 % 진행 중"을 띄운다(너무 자주 쓰지 않게 0.8초 간격)
function makeResetProgress(jobId, base) {
  const id = String(jobId || "").replace(/[^\w-]/g, "").slice(0, 60);
  const ref = id ? db.collection("resetJobs").doc(id) : null;
  let last = 0;
  let beat = null;
  return {
    id,
    // ⭐ 같은 작업이 두 번 동시에 돌지 않게 "작업 중" 표시를 잡는다 — 다른 실행이 90초 안에 신호를 남겼으면 false
    async claim() {
      if (!ref) return true;
      const ok = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const d = snap.exists ? snap.data() : {};
        const hb = d.heartbeatAt?.toMillis?.() || 0;
        if (d.status === "running" && Date.now() - hb < 90000) return false;
        tx.set(ref, { ...base, status: "running", heartbeatAt: FieldValue.serverTimestamp(), attempts: FieldValue.increment(1), error: FieldValue.delete() }, { merge: true });
        return true;
      });
      if (ok) beat = setInterval(() => { ref.set({ heartbeatAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {}); }, 20000);
      return ok;
    },
    stop() { if (beat) clearInterval(beat); beat = null; },
    async set(pct, step, force = false) {
      if (!ref) return;
      const now = Date.now();
      if (!force && now - last < 800) return;
      last = now;
      await ref.set({ ...base, pct: Math.max(0, Math.min(99, Math.round(pct))), step, status: "running", updatedAt: FieldValue.serverTimestamp(), heartbeatAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
    },
    async done(result) {
      this.stop();
      if (ref) await ref.set({ ...base, pct: 100, step: "완료", status: "done", result, updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
    },
    // fatal=true: 비밀번호 틀림처럼 사람이 고쳐야 하는 오류(자동 재시도 안 함) · failedStep: 어느 단계에서 실패했는지(화면에 표시)
    async fail(error, fatal = false, failedStep = "") {
      this.stop();
      if (ref) await ref.set({ ...base, status: "error", error, fatal, failedStep, errorCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
    },
    // ⭐ 2026-11-06 한 번 실행 시간(45분)을 다 쓰면 여기까지 적어 두고 멈춤 → 화면이 바로 다시 불러 이어서 한다
    async pause(step) {
      this.stop();
      if (ref) await ref.set({ ...base, status: "paused", step, errorCount: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
    },
    async current() { return ref ? (await ref.get()).data() || null : null; },
  };
}
const RESET_ORDER_COLLECTIONS = new Set(["orders", "dispatch"]);
const RESET_KEEP_DAYS = 7; // ★ 초기화한 데이터를 이 기간 동안 보관 → 복원 가능
// ⭐ 회사명이 비어 있는 예전 데이터는 프로그램이 "돌캐" 것으로 본다(화면의 companyName || "돌캐" 규칙).
// 그래서 돌캐를 초기화할 때는 아래 컬렉션에서 회사 필드가 아예 없는 문서도 함께 지운다.
const RESET_LEGACY_COMPANY = "돌캐";
const RESET_LEGACY_COLLECTIONS = [
  "dispatch", "orders", "fixedClients", "clients", "places", "drivers", "schedules", "notices", "handovers",
  "multiRateSheets", "deletedOrders", "scheduledEmails", "emailLogs", "acctPayments", "attendance",
  "attendanceRequests", "attendanceChangeRequests", "driver_logs", "driver_notifications", "driver_documents",
  "driver_completed_archive", "driver_photo_logs", "gps_tracks",
];

function hashResetPassword(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 64).toString("hex");
}

async function requireTotalMaster(req) {
  const authz = String(req.get("Authorization") || "");
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) throw Object.assign(new Error("로그인이 필요합니다."), { status: 401 });
  const decoded = await getAuth().verifyIdToken(token);
  let ok = decoded.email === "tjddnqkf@naver.com";
  if (!ok) {
    const u = await db.collection("users").doc(decoded.uid).get();
    ok = u.exists && u.data().role === "totalMaster";
  }
  if (!ok) throw Object.assign(new Error("최고관리자만 사용할 수 있습니다."), { status: 403 });
  return decoded;
}

async function verifyResetPassword(pw) {
  const snap = await RESET_SECRET_DOC.get();
  const d = snap.exists ? snap.data() : null;
  if (!d?.hash) throw Object.assign(new Error("초기화 비밀번호가 아직 설정되지 않았습니다."), { status: 400 });
  const lockUntil = d.lockUntil?.toMillis?.() || 0;
  if (lockUntil > Date.now()) {
    throw Object.assign(new Error(`비밀번호를 여러 번 틀려 잠겼습니다. ${Math.ceil((lockUntil - Date.now()) / 60000)}분 뒤 다시 시도하세요.`), { status: 429 });
  }
  const given = Buffer.from(hashResetPassword(pw || "", d.salt), "hex");
  const saved = Buffer.from(d.hash, "hex");
  if (given.length !== saved.length || !crypto.timingSafeEqual(given, saved)) {
    const fails = (d.failCount || 0) + 1;
    await RESET_SECRET_DOC.set(fails >= 5
      ? { failCount: 0, lockUntil: new Date(Date.now() + 10 * 60000) }
      : { failCount: fails }, { merge: true });
    throw Object.assign(new Error(fails >= 5 ? "비밀번호를 5번 틀려 10분간 잠겼습니다." : `초기화 비밀번호가 틀렸습니다. (${fails}/5)`), { status: 403 });
  }
  if (d.failCount) await RESET_SECRET_DOC.set({ failCount: 0 }, { merge: true });
}

// 운송사 소속 계정(최고관리자 제외)과 회사코드
async function getCompanyMembers(company) {
  const users = await db.collection("users").where("companyName", "==", company).get();
  const userDocs = [...users.docs];
  if (company === RESET_LEGACY_COMPANY) {
    // 회사명이 비어 있는 예전 계정(화주·배차마당 계정 제외)도 돌캐 소속으로 본다
    const all = await db.collection("users").get();
    all.docs.forEach((d) => {
      const u = d.data();
      if (!String(u.companyName || "").trim() && !["shipper", "cafeUser"].includes(u.role)) userDocs.push(d);
    });
  }
  const members = userDocs
    .filter((d) => d.data().role !== "totalMaster" && d.data().email !== "tjddnqkf@naver.com")
    .map((d) => ({ uid: d.id, email: d.data().email || "", role: d.data().role || "" }));
  const codes = new Set();
  userDocs.forEach((d) => { if (d.data().companyCode) codes.add(String(d.data().companyCode)); });
  const apps = await db.collection("transportApplications").where("companyName", "==", company).get();
  apps.docs.forEach((d) => { if (d.data().companyCode) codes.add(String(d.data().companyCode)); });
  return { members, codes: [...codes].filter(Boolean) };
}

// 문서 안의 Firebase Storage 파일 경로 찾기(다운로드 URL·gs:// 주소)
function collectStoragePaths(value, out) {
  if (!value) return;
  if (typeof value === "string") {
    const m = value.match(/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?#]+)/);
    if (m) { try { out.add(decodeURIComponent(m[1])); } catch { /* 무시 */ } return; }
    const g = value.match(/^gs:\/\/[^/]+\/(.+)$/);
    if (g) out.add(g[1]);
    return;
  }
  if (Array.isArray(value)) { value.forEach((v) => collectStoragePaths(v, out)); return; }
  if (typeof value === "object" && !(value instanceof Date) && !value.toMillis) {
    Object.values(value).forEach((v) => collectStoragePaths(v, out));
  }
}

// ⭐ 2026-11-06 운송사 초기화 다시 만듦 — "돌캐 초기화가 56%에서 안 넘어감" 수정
//  예전 방식: ① 지울 문서를 전부 찾아 메모리에 담고 ② 보관함 복사(38~60%)를 BulkWriter 한 번에 → ③ 삭제.
//   - 보관 단계가 끝나기 전에 끊기면(60분 제한·메모리 초과·1MiB가 넘는 문서 복사 실패) 상태가 "saving"으로 남아
//     재시도 때마다 보관함을 비우고 처음부터 다시 → 같은 지점(56% 근처)에서 또 끊기는 무한 반복이었다.
//   - 문서 하나가 1MiB 가까우면(위치기록·로그·사진 base64 등) {path, data}로 감싸는 순간 크기 초과(INVALID_ARGUMENT)
//     → 영원히 실패 → "일부 실패, 자동으로 다시 시도" → 처음부터 반복.
//  새 방식(이어하기): 단계마다 "어디까지 했는지"를 보관함 문서에 적는다.
//   collect(컬렉션 하나씩 찾아서 경로 목록 manifest/{번호}에 저장) → copy(목록 묶음 하나씩 보관, 큰 문서는 Storage JSON)
//   → delete(목록 묶음 하나씩 삭제) → done. 한 번 실행은 최대 45분만 일하고 {partial:true}로 돌려준다 → 화면이 바로 다시 부른다.
//   실패하면 어느 단계(step)·어느 묶음에서 실패했는지 resetJobs/{작업ID}.failedStep에 남긴다.
const RESET_CHUNK = 400;            // manifest 묶음 하나에 담는 문서 경로 수
const RESET_BIG_DOC_BYTES = 700000; // 이보다 큰 문서는 보관함 문서 대신 Storage JSON으로 보관
const RESET_RUN_BUDGET_MS = Number(process.env.KP_RESET_BUDGET_MS) || 45 * 60000; // (시험할 때만 환경변수로 줄임)
const padN = (n, w = 6) => String(n).padStart(w, "0");
const chunkArr = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

// Firestore 값 ↔ JSON(Storage 보관용) — 날짜·위치·문서참조·바이트 형식을 그대로 되살린다
function encodeFsValue(v) {
  if (v === null || v === undefined) return v;
  if (v instanceof Timestamp) return { __kpT: "ts", s: v.seconds, n: v.nanoseconds };
  if (v instanceof Date) return { __kpT: "ts", s: Math.floor(v.getTime() / 1000), n: (v.getTime() % 1000) * 1e6 };
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { __kpT: "bytes", b: Buffer.from(v).toString("base64") };
  if (v && typeof v === "object" && typeof v.latitude === "number" && typeof v.longitude === "number" && v.constructor?.name === "GeoPoint") return { __kpT: "geo", la: v.latitude, lo: v.longitude };
  if (v && typeof v === "object" && typeof v.path === "string" && v.firestore && typeof v.collection === "function") return { __kpT: "ref", p: v.path };
  if (Array.isArray(v)) return v.map(encodeFsValue);
  if (typeof v === "object") { const o = {}; Object.keys(v).forEach((k) => { o[k] = encodeFsValue(v[k]); }); return o; }
  return v;
}
function decodeFsValue(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(decodeFsValue);
  if (typeof v === "object") {
    if (v.__kpT === "ts") return new Timestamp(v.s, v.n || 0);
    if (v.__kpT === "bytes") return Buffer.from(v.b, "base64");
    if (v.__kpT === "geo") { const { GeoPoint } = require("firebase-admin/firestore"); return new GeoPoint(v.la, v.lo); }
    if (v.__kpT === "ref") return db.doc(v.p);
    const o = {}; Object.keys(v).forEach((k) => { o[k] = decodeFsValue(v[k]); }); return o;
  }
  return v;
}
const approxDocBytes = (data) => { try { return Buffer.byteLength(JSON.stringify(encodeFsValue(data))); } catch { return Infinity; } };

// 한 컬렉션에서 이 운송사 문서 찾기 → DocumentSnapshot 배열
async function collectInCollection(colRef, ctx) {
  const { company, codes, uids } = ctx;
  const col = colRef.id;
  const found = new Map();
  const add = (docs) => docs.forEach((d) => { if (d.exists && !found.has(d.ref.path)) found.set(d.ref.path, d); });
  const tasks = [];
  RESET_COMPANY_FIELDS.forEach((f) => tasks.push(colRef.where(f, "==", company).get()));
  codes.forEach((code) => tasks.push(colRef.where("companyCode", "==", code).get()));
  chunkArr(uids, 30).forEach((ch) => RESET_UID_FIELDS.forEach((f) => tasks.push(colRef.where(f, "in", ch).get())));
  // 한꺼번에 수백 개를 보내지 않게 20개씩
  for (const part of chunkArr(tasks, 20)) {
    const results = await Promise.all(part.map((t) => t.catch(() => null)));
    results.forEach((r) => r && add(r.docs));
  }
  const idRefs = [...(company.includes("/") ? [] : [colRef.doc(company)]), ...uids.map((u) => colRef.doc(u))];
  for (const ch of chunkArr(idRefs, 100)) {
    const snaps = await db.getAll(...ch).catch(() => []);
    add(snaps.filter((s) => s.exists));
  }
  if (company === RESET_LEGACY_COMPANY && RESET_LEGACY_COLLECTIONS.includes(col)) {
    const uidSet = new Set(uids);
    // 큰 컬렉션도 한 번에 다 받지 않게 1만 건씩 나눠 가볍게(회사·작성자 칸만) 읽는다
    let last = null;
    for (;;) {
      let q = colRef.select(...RESET_COMPANY_FIELDS, "companyCode", ...RESET_UID_FIELDS).orderBy("__name__").limit(10000);
      if (last) q = q.startAfter(last);
      const page = await q.get();
      if (page.empty) break;
      last = page.docs[page.docs.length - 1];
      const legacyRefs = page.docs.filter((d) => {
        if (found.has(d.ref.path)) return false;
        const x = d.data() || {};
        if (RESET_ORDER_COLLECTIONS.has(col)) return !String(x.companyName ?? "").trim();
        if (![...RESET_COMPANY_FIELDS, "companyCode"].every((f) => !String(x[f] ?? "").trim())) return false;
        const owners = RESET_UID_FIELDS.map((f) => String(x[f] ?? "").trim()).filter(Boolean);
        return owners.length === 0 || owners.some((o) => uidSet.has(o));
      }).map((d) => d.ref);
      // 내용은 복사 단계에서 읽으므로 여기서는 경로만(가짜 스냅샷)
      legacyRefs.forEach((r) => found.set(r.path, { ref: r, exists: true, data: () => ({}), _light: true }));
      if (page.size < 10000) break;
    }
  }
  // 최고관리자 계정 문서는 절대 지우지 않는다(안전장치)
  if (col === "users") {
    for (const [path, d] of found) {
      const data = d.data() || {};
      if (data.role === "totalMaster" || data.email === "tjddnqkf@naver.com") found.delete(path);
    }
  }
  return [...found.values()];
}

// 찾은 문서 아래의 하위 컬렉션 문서(첨부 attachments 등) 경로 — 이름별로 한 번에 조회해 골라낸다
async function collectSubtreePaths(tops, cgCache) {
  if (!tops.length) return [];
  const foundPaths = new Set(tops.map((d) => d.ref.path));
  const names = new Set(["attachments", "events", "logs"]);
  const sample = tops.slice(0, 25).map((d) => d.ref);
  const lists = await Promise.all(sample.map((r) => r.listCollections().catch(() => [])));
  lists.flat().forEach((c) => names.add(c.id));
  const underFound = (ref) => { for (let p = ref.parent.parent; p; p = p.parent.parent) { if (foundPaths.has(p.path)) return true; } return false; };
  const out = [];
  for (const name of names) {
    if (!cgCache.has(name)) {
      const light = await db.collectionGroup(name).select().get().catch(() => null);
      cgCache.set(name, (light?.docs || []).map((d) => d.ref));
    }
    cgCache.get(name).forEach((r) => { if (underFound(r)) out.push(r.path); });
  }
  return out;
}

// 이 운송사 소속 계정·회사코드 + 돌아볼 컬렉션 목록(초기화 첫 실행 때 한 번 정해 보관함 문서에 적어 둔다)
async function resetPlanFor(company, { deleteAccounts, endContract }) {
  const { members, codes } = await getCompanyMembers(company);
  const skip = new Set([...RESET_SKIP_COLLECTIONS, ...(deleteAccounts ? [] : ["users", "transportApplications"]), ...(endContract ? ["companyPlans"] : [])]);
  const cols = (await db.listCollections()).map((c) => c.id).filter((id) => !skip.has(id));
  return { members, codes, uids: members.map((m) => m.uid), cols };
}

// 미리보기(지우지 않음) — 개수만
async function previewCompanyReset(company, { deleteAccounts, endContract }) {
  const plan = await resetPlanFor(company, { deleteAccounts, endContract });
  const perCollection = {};
  let total = 0, subDocs = 0;
  const cgCache = new Map();
  for (const col of plan.cols) {
    const tops = await collectInCollection(db.collection(col), { company, ...plan });
    if (!tops.length) continue;
    perCollection[col] = tops.length; total += tops.length;
    subDocs += (await collectSubtreePaths(tops, cgCache)).length;
  }
  return { total, subDocs, perCollection, accounts: plan.members.length, deleteAccounts, files: null };
}

function resetBucket() {
  const { getStorage } = require("firebase-admin/storage");
  return getStorage().bucket();
}

// 보관함 비우기 — 보관한 문서·목록·파일 삭제, (계정까지 지운 초기화였고 복원 안 했으면) 사용 중지해둔 계정 완전 삭제
async function purgeResetBackup(ref) {
  const snap = await ref.get();
  if (!snap.exists) return;
  const b = snap.data();
  await db.recursiveDelete(ref.collection("docs")).catch((e) => console.warn("보관 문서 삭제 실패", e?.message));
  await db.recursiveDelete(ref.collection("manifest")).catch(() => {});
  await resetBucket().deleteFiles({ prefix: `resetBackups/${ref.id}/` }).catch(() => {});
  if (b.status === "kept" && Array.isArray(b.accountUids) && b.accountUids.length) {
    for (let i = 0; i < b.accountUids.length; i += 1000) await getAuth().deleteUsers(b.accountUids.slice(i, i + 1000)).catch(() => {});
  }
  await ref.set({ status: "purged", purgedAt: FieldValue.serverTimestamp() }, { merge: true });
}

// 계약종료 표시(초기화와 함께 쓰는 경우 — 삭제 전에 먼저 막는다)
async function markContractEnded(company, by, reason) {
  await db.collection("companyPlans").doc(company).set({
    status: "ended", endedAt: FieldValue.serverTimestamp(), endedAtYmd: kstDateStr(), endedBy: by, endReason: reason || "",
  }, { merge: true });
}

async function companyResetHandler(req, res) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    let prog = null;
    let step = "시작";
    let bulkCompany = null; // 알림 일시 중지 중인 회사(실패해도 꼭 풀어준다)
    const t0 = Date.now();
    const timeUp = () => Date.now() - t0 > RESET_RUN_BUDGET_MS;
    try {
      const me = await requireTotalMaster(req);
      const action = body.action;

      if (action === "status") {
        const snap = await RESET_SECRET_DOC.get();
        const d = snap.exists ? snap.data() : {};
        res.json({ hasPassword: !!d.hash, updatedAt: d.updatedAt?.toMillis?.() || null, updatedBy: d.updatedBy || "" });
        return;
      }

      if (action === "setPassword") {
        const snap = await RESET_SECRET_DOC.get();
        if (snap.exists && snap.data().hash) await verifyResetPassword(body.currentPassword);
        const pw = String(body.newPassword || "");
        if (pw.length < 4) { res.status(400).json({ error: "초기화 비밀번호는 4자 이상이어야 합니다." }); return; }
        const salt = crypto.randomBytes(16).toString("hex");
        await RESET_SECRET_DOC.set({
          salt, hash: hashResetPassword(pw, salt), updatedAt: FieldValue.serverTimestamp(), updatedBy: me.email || me.uid,
          failCount: 0, lockUntil: null,
        });
        res.json({ ok: true });
        return;
      }

      if (action === "companies") {
        const map = new Map();
        const touch = (name, patch = {}) => {
          name = String(name || "").trim();
          if (!name) return;
          const cur = map.get(name) || { name, users: 0, code: "" };
          map.set(name, { ...cur, ...patch, users: cur.users + (patch.users || 0) });
        };
        const users = await db.collection("users").get();
        users.docs.forEach((d) => {
          const u = d.data();
          if (["shipper", "cafeUser"].includes(u.role) || u.role === "totalMaster") return;
          touch(u.companyName, { users: 1, ...(u.companyCode ? { code: String(u.companyCode) } : {}) });
        });
        const apps = await db.collection("transportApplications").get();
        apps.docs.forEach((d) => { const a = d.data(); touch(a.companyName, a.companyCode ? { code: String(a.companyCode) } : {}); });
        const settings = await db.collection("companySettings").listDocuments();
        settings.forEach((r) => touch(r.id));
        res.json({
          companies: [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ko")),
          legacyCompany: RESET_LEGACY_COMPANY,
        });
        return;
      }

      if (action === "backups") {
        const snap = await db.collection("resetBackups").orderBy("at", "desc").limit(30).get();
        res.json({
          keepDays: RESET_KEEP_DAYS,
          backups: snap.docs.map((d) => {
            const b = d.data();
            return {
              id: d.id, company: b.company, by: b.by, at: b.at?.toMillis?.() || null, expiresAt: b.expiresAt?.toMillis?.() || null,
              status: b.status, phase: b.phase || "", docCount: b.docCount || 0, fileCount: b.fileCount || 0, deleteAccounts: !!b.deleteAccounts,
              endContract: !!b.endContract, accounts: (b.accountUids || []).length, restoredAt: b.restoredAt?.toMillis?.() || null, restoredBy: b.restoredBy || "",
              lastError: b.lastError || "", lastStep: b.lastStep || "",
            };
          }),
        });
        return;
      }

      if (action === "restore") {
        prog = makeResetProgress(body.jobId, { action: "restore", by: me.email || me.uid });
        const cur = await prog.current();
        if (cur?.status === "done") { res.json(cur.result || { ok: true }); return; }
        await verifyResetPassword(body.password);
        if (!(await prog.claim())) { res.json({ busy: true }); return; }
        step = "복원 준비";
        await prog.set(1, "복원 준비 중", true);
        const ref = db.collection("resetBackups").doc(String(body.backupId || "x"));
        const snap = await ref.get();
        if (!snap.exists) throw Object.assign(new Error("보관된 초기화 기록을 찾을 수 없습니다."), { status: 404 });
        const b = snap.data();
        if (b.status !== "kept" && b.status !== "restoring") {
          throw Object.assign(new Error(b.status === "restored" ? "이미 복원된 기록입니다." : "보관 기간이 지나 복원할 수 없습니다."), { status: 400 });
        }
        await ref.set({ status: "restoring" }, { merge: true });
        bulkCompany = b.company;
        await setBulkMode(b.company, true);
        const bucket = resetBucket();
        let restoredDocs = b.restoredDocs || 0;
        let last = b.restoreCursor ? ref.collection("docs").doc(b.restoreCursor) : null;
        step = "데이터 되돌리기";
        let rWorked = false;
        for (;;) {
          if (rWorked && timeUp()) {
            await ref.set({ restoredDocs }, { merge: true });
            await setBulkMode(b.company, false); bulkCompany = null;
            await prog.pause(`데이터 되돌리는 중 ${restoredDocs.toLocaleString()} — 이어서 진행`);
            res.json({ partial: true }); return;
          }
          let q = ref.collection("docs").orderBy("__name__").limit(300);
          if (last) q = q.startAfter(last);
          const page = await q.get();
          if (page.empty) break;
          const writer = db.bulkWriter();
          writer.onWriteError((err) => err.failedAttempts < 5);
          for (const d of page.docs) {
            const x = d.data();
            let data = x.data;
            if (x.file) {
              const [buf] = await bucket.file(x.file).download();
              data = decodeFsValue(JSON.parse(buf.toString("utf8")));
            }
            writer.set(db.doc(x.path), data || {}); restoredDocs += 1;
          }
          await writer.close();
          last = page.docs[page.docs.length - 1];
          await ref.set({ restoreCursor: last.id, restoredDocs }, { merge: true });
          rWorked = true;
          await setBulkMode(b.company, true, { wait: false });
          await prog.set(3 + (restoredDocs / Math.max(1, b.docCount || restoredDocs)) * 80, `데이터 되돌리는 중 ${restoredDocs.toLocaleString()} / ${(b.docCount || 0).toLocaleString()}`);
        }
        step = "첨부파일 되돌리기";
        let restoredFiles = 0;
        const prefix = `resetBackups/${ref.id}/`;
        const [saved] = await bucket.getFiles({ prefix }).catch(() => [[]]);
        const files = saved.filter((f) => !f.name.startsWith(`${prefix}__docs/`));
        for (let i = 0; i < files.length; i += 20) {
          await prog.set(84 + (i / Math.max(1, files.length)) * 12, `첨부파일 되돌리는 중 ${i.toLocaleString()} / ${files.length.toLocaleString()}`);
          await Promise.all(files.slice(i, i + 20).map((f) => f.copy(bucket.file(f.name.slice(prefix.length))).then(() => { restoredFiles += 1; }).catch(() => {})));
        }
        step = "계정 되돌리기";
        let restoredAccounts = 0;
        for (const uid of b.accountUids || []) {
          await getAuth().updateUser(uid, { disabled: false }).then(() => { restoredAccounts += 1; }).catch(() => {});
        }
        await setBulkMode(b.company, false); bulkCompany = null;
        await bumpDataVersion(b.company);
        await ref.set({ status: "restored", restoredAt: FieldValue.serverTimestamp(), restoredBy: me.email || me.uid }, { merge: true });
        await db.collection("resetLogs").add({ company: b.company, by: me.email || me.uid, at: FieldValue.serverTimestamp(), backupId: ref.id, action: "restore", restoredDocs, restoredFiles, restoredAccounts });
        console.log(`↻ 운송사 복원: ${b.company} — 문서 ${restoredDocs}, 파일 ${restoredFiles}, 계정 ${restoredAccounts} (by ${me.email})`);
        const result = { ok: true, company: b.company, restoredDocs, restoredFiles, restoredAccounts };
        await prog.done(result);
        res.json(result);
        return;
      }

      const company = String(body.company || "").trim();
      if (!company) { res.status(400).json({ error: "초기화할 운송사를 선택하세요." }); return; }
      const deleteAccounts = body.deleteAccounts === true;
      const endContract = body.endContract === true;

      if (action === "preview") {
        res.json(await previewCompanyReset(company, { deleteAccounts, endContract }));
        return;
      }

      if (action === "execute") {
        // 작업ID(jobId)가 곧 보관함 ID — 끊겨서 다시 불려도 보관함 문서에 적힌 단계·묶음 번호부터 이어서 한다
        const jobId = String(body.jobId || "").replace(/[^\w-]/g, "").slice(0, 60) || `job_${Date.now()}`;
        prog = makeResetProgress(jobId, { action: "reset", company, by: me.email || me.uid, endContract });
        const cur = await prog.current();
        if (cur?.status === "done") { res.json(cur.result || { ok: true }); return; }
        await verifyResetPassword(body.password);
        if ((endContract || body.confirmName !== undefined) && String(body.confirmName || "").trim() !== company) {
          throw Object.assign(new Error("확인용 회사명이 일치하지 않습니다."), { status: 400 });
        }
        if (!(await prog.claim())) { res.json({ busy: true }); return; }
        await prog.set(1, "시작하는 중", true);
        const bucket = resetBucket();
        const backupRef = db.collection("resetBackups").doc(jobId);
        let b = (await backupRef.get()).data() || null;
        const saveB = async (patch) => { await backupRef.set(patch, { merge: true }); b = { ...b, ...patch }; };
        let worked = false; // 이번 실행에서 한 묶음이라도 끝냈는지(아무것도 못 하고 멈추는 일이 없게)
        const pauseIfNeeded = async (label) => {
          if (!worked || !timeUp()) return false;
          if (bulkCompany) { await setBulkMode(bulkCompany, false); bulkCompany = null; }
          await prog.pause(`${label} — 이어서 진행`);
          res.json({ partial: true });
          return true;
        };

        // ── 0단계: 계획(처음 한 번) — 계약종료면 지우기 전에 먼저 접속부터 막는다 ──
        if (!b) {
          step = "준비";
          if (endContract) await markContractEnded(company, me.email || me.uid, "계약종료 + 초기화");
          const plan = await resetPlanFor(company, { deleteAccounts, endContract });
          b = {
            company, by: me.email || me.uid, at: FieldValue.serverTimestamp(), status: "saving", phase: "collect",
            deleteAccounts, endContract, cols: plan.cols, codes: plan.codes, uids: plan.uids,
            accountUids: deleteAccounts ? plan.uids : [], collectIdx: 0, manifestChunks: 0, copyIdx: 0, deleteIdx: 0,
            perCollection: {}, topCount: 0, docCount: 0, fileCount: 0, bigDocs: 0,
          };
          await backupRef.set(b);
        } else if (!b.phase) {
          // 예전 방식으로 시작했다가 끊긴 기록 — 보관이 끝나지 않았으면 새 방식으로 처음부터(아직 아무것도 지우지 않은 상태)
          if (b.status === "saving") {
            step = "예전 작업 정리";
            await prog.set(2, "끊긴 예전 보관 작업 정리 중", true);
            await db.recursiveDelete(backupRef.collection("docs")).catch(() => {});
            await bucket.deleteFiles({ prefix: `resetBackups/${jobId}/` }).catch(() => {});
            const plan = await resetPlanFor(company, { deleteAccounts, endContract });
            await saveB({ phase: "collect", cols: plan.cols, codes: plan.codes, uids: plan.uids, accountUids: deleteAccounts ? plan.uids : [],
              collectIdx: 0, manifestChunks: 0, copyIdx: 0, deleteIdx: 0, perCollection: {}, topCount: 0, docCount: 0, fileCount: 0, bigDocs: 0 });
          }
        }
        if (b.endContract && b.phase !== "done") await markContractEnded(company, me.email || me.uid, "계약종료 + 초기화").catch(() => {});

        // ── 1단계: 찾기(컬렉션 하나씩, 경로만 manifest에 저장) 3~30% ──
        if (b.phase === "collect") {
          const cgCache = new Map();
          const ctx = { company, codes: b.codes || [], uids: b.uids || [] };
          for (let ci = b.collectIdx || 0; ci < b.cols.length; ci++) {
            if (await pauseIfNeeded(`데이터 찾는 중 ${ci}/${b.cols.length}`)) return;
            const col = b.cols[ci];
            step = `데이터 찾기 · ${col}`;
            await prog.set(3 + (ci / b.cols.length) * 27, `데이터 찾는 중 · ${col} (${ci + 1}/${b.cols.length})`);
            const tops = await collectInCollection(db.collection(col), ctx);
            let chunkNo = b.manifestChunks || 0;
            const perCollection = { ...(b.perCollection || {}) };
            if (tops.length) {
              const sub = await collectSubtreePaths(tops, cgCache);
              const paths = [...tops.map((d) => d.ref.path), ...sub];
              const batch = db.batch();
              chunkArr(paths, RESET_CHUNK).forEach((ch) => { batch.set(backupRef.collection("manifest").doc(padN(chunkNo)), { col, paths: ch }); chunkNo += 1; });
              await batch.commit();
              perCollection[col] = tops.length;
            }
            await saveB({ collectIdx: ci + 1, manifestChunks: chunkNo, perCollection, topCount: (b.topCount || 0) + tops.length });
            worked = true;
          }
          await saveB({ phase: "copy" });
        }

        // ── 2단계: 보관(묶음 하나씩 — 큰 문서는 Storage JSON, 첨부파일도 같이) 30~70% ──
        if (b.phase === "copy") {
          for (let i = b.copyIdx || 0; i < b.manifestChunks; i++) {
            if (await pauseIfNeeded(`보관함에 복사 중 ${i}/${b.manifestChunks}`)) return;
            step = `보관 · 묶음 ${i + 1}/${b.manifestChunks}`;
            await prog.set(30 + (i / Math.max(1, b.manifestChunks)) * 40, `보관함에 복사 중 · 묶음 ${i + 1} / ${b.manifestChunks} (${(b.docCount || 0).toLocaleString()}건 완료)`);
            const mref = backupRef.collection("manifest").doc(padN(i));
            const m = (await mref.get()).data() || { paths: [] };
            const snaps = [];
            for (const ch of chunkArr(m.paths || [], 100)) snaps.push(...(await db.getAll(...ch.map((p) => db.doc(p)))));
            const files = new Set();
            const big = [];
            const writer = db.bulkWriter();
            const tooBig = new Set();
            writer.onWriteError((err) => {
              if (err.code === 3 /* INVALID_ARGUMENT(크기·깊이 초과) */) { tooBig.add(err.documentRef.id); return false; }
              return err.failedAttempts < 5;
            });
            const failed = [];
            let k = 0;
            const byId = new Map();
            for (const s of snaps) {
              const id = `${padN(i)}_${padN(k++, 4)}`;
              if (!s.exists) continue;
              const data = s.data();
              collectStoragePaths(data, files);
              byId.set(id, s);
              if (approxDocBytes(data) > RESET_BIG_DOC_BYTES) { big.push([id, s]); continue; }
              writer.set(backupRef.collection("docs").doc(id), { path: s.ref.path, data }).catch((e) => { if (!tooBig.has(id)) failed.push(`${s.ref.path}: ${e?.message || e}`); });
            }
            await writer.close();
            tooBig.forEach((id) => big.push([id, byId.get(id)]));
            for (const [id, s] of big) {
              const file = `resetBackups/${jobId}/__docs/${id}.json`;
              await bucket.file(file).save(JSON.stringify(encodeFsValue(s.data())), { contentType: "application/json", resumable: false });
              await backupRef.collection("docs").doc(id).set({ path: s.ref.path, file });
            }
            if (failed.length) throw new Error(`보관함 복사 실패(${failed.length}건) — 예: ${failed[0]}`);
            // 첨부파일 보관(없는 파일 404는 건너뜀)
            const fileFailures = [];
            const fl = [...files];
            for (let j = 0; j < fl.length; j += 20) {
              await Promise.all(fl.slice(j, j + 20).map((p) => bucket.file(p).copy(bucket.file(`resetBackups/${jobId}/${p}`))
                .catch((e) => { if (e?.code !== 404) fileFailures.push(p); })));
            }
            if (fileFailures.length) throw new Error(`첨부파일 보관 실패(${fileFailures.length}개) — 예: ${fileFailures[0]}`);
            await mref.set({ files: fl }, { merge: true });
            await saveB({ copyIdx: i + 1, docCount: (b.docCount || 0) + byId.size, fileCount: (b.fileCount || 0) + fl.length, bigDocs: (b.bigDocs || 0) + big.length });
            worked = true;
          }
          await saveB({ status: "kept", phase: "delete", expiresAt: new Date(Date.now() + RESET_KEEP_DAYS * 86400000) });
        }

        // ── 3단계: 삭제(묶음 하나씩 — 보관이 끝난 목록 기준이라 끊겼다 다시 해도 빠짐없이) 70~96% ──
        if (b.phase === "delete") {
          bulkCompany = company;
          await setBulkMode(company, true);
          for (let i = b.deleteIdx || 0; i < b.manifestChunks; i++) {
            if (await pauseIfNeeded(`데이터 삭제 중 ${i}/${b.manifestChunks}`)) return;
            step = `삭제 · 묶음 ${i + 1}/${b.manifestChunks}`;
            await prog.set(70 + (i / Math.max(1, b.manifestChunks)) * 26, `데이터 삭제 중 · 묶음 ${i + 1} / ${b.manifestChunks}`);
            const m = (await backupRef.collection("manifest").doc(padN(i)).get()).data() || {};
            const delWriter = db.bulkWriter();
            delWriter.onWriteError((err) => err.failedAttempts < 5);
            (m.paths || []).forEach((p) => delWriter.delete(db.doc(p)).catch(() => {}));
            await delWriter.close();
            const fl = m.files || [];
            for (let j = 0; j < fl.length; j += 20) await Promise.all(fl.slice(j, j + 20).map((p) => bucket.file(p).delete().catch(() => {})));
            await saveB({ deleteIdx: i + 1 });
            worked = true;
            if (i % 10 === 9) await setBulkMode(company, true, { wait: false }); // 알림 일시 중지 30분 연장
          }
          let disabledAccounts = 0;
          if (b.deleteAccounts) {
            step = "계정 사용 중지";
            await prog.set(96, "로그인 계정 사용 중지 중", true);
            for (const uid of b.accountUids || []) {
              await getAuth().updateUser(uid, { disabled: true }).then(() => { disabledAccounts += 1; }).catch(() => {});
            }
          }
          await setBulkMode(company, false); bulkCompany = null;
          await bumpDataVersion(company);
          if (b.endContract) await markContractEnded(company, me.email || me.uid, "계약종료 + 초기화");
          await saveB({ phase: "done", deletedFiles: b.fileCount || 0, disabledAccounts });
          await db.collection("resetLogs").add({
            company, by: me.email || me.uid, at: FieldValue.serverTimestamp(), deleteAccounts: !!b.deleteAccounts, endContract: !!b.endContract, backupId: jobId,
            deletedDocs: b.topCount || 0, savedDocs: b.docCount || 0, deletedFiles: b.fileCount || 0, disabledAccounts, perCollection: b.perCollection || {}, action: b.endContract ? "endReset" : "reset",
          });
          console.log(`◇ 운송사 초기화${b.endContract ? "(계약종료)" : ""}: ${company} — 문서 ${b.topCount}(보관 ${b.docCount}), 파일 ${b.fileCount}, 계정 ${disabledAccounts} (by ${me.email})`);
        }
        const result = {
          ok: true, backupId: jobId, expiresAt: b.expiresAt?.toMillis?.() || (b.expiresAt instanceof Date ? b.expiresAt.getTime() : null), deletedDocs: b.topCount || 0, savedDocs: b.docCount || 0,
          deletedFiles: b.deletedFiles || b.fileCount || 0, deletedAccounts: b.disabledAccounts || 0, endContract: !!b.endContract,
        };
        await prog.done(result);
        res.json({ ...result, perCollection: b.perCollection || {} });
        return;
      }

      res.status(400).json({ error: "알 수 없는 요청입니다." });
    } catch (e) {
      console.error(`운송사 초기화 오류 [${step}]:`, e);
      if (bulkCompany) await setBulkMode(bulkCompany, false);
      const fatal = !!(e.status && e.status >= 400 && e.status < 500);
      if (prog) await prog.fail(e?.message || String(e), fatal, step);
      if (body?.action === "execute" && body.jobId) {
        await db.collection("resetBackups").doc(String(body.jobId).replace(/[^\w-]/g, "").slice(0, 60)).update({ lastError: e?.message || String(e), lastStep: step }).catch(() => {}); // 보관함 문서가 있을 때만
      }
      res.status(e.status || 500).json({ error: e?.message || String(e), step });
    }
}

// 예전 주소(9분 제한) — 목록·상태 조회 등 짧은 요청용으로 남겨둔다
exports.companyReset = functions
  .runWith({ timeoutSeconds: 540, memory: "2GB" })
  .https.onRequest(companyResetHandler);
// ⭐ 초기화·복원 실행용 — 2세대 함수라 최대 60분까지 돌 수 있다(데이터가 많은 회사도 중간에 끊기지 않게)
const { onRequest: onRequestV2 } = require("firebase-functions/v2/https");
exports.companyResetJob = onRequestV2(
  { region: "us-central1", timeoutSeconds: 3600, memory: "4GiB", invoker: "public" },
  companyResetHandler,
);

// ⏰ 매일 새벽 — 보관 기간(7일)이 지난 초기화 보관함을 비운다
exports.purgeExpiredResetBackups = functions.pubsub
  .schedule("every day 04:10")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const snap = await db.collection("resetBackups").where("expiresAt", "<=", new Date()).get();
    for (const d of snap.docs) {
      if (d.data().status === "purged") continue;
      await purgeResetBackup(d.ref).catch((e) => console.warn("보관함 비우기 실패", d.id, e?.message));
    }
    console.log(`✕ 만료된 초기화 보관함 정리 ${snap.size}건 확인`);
    return null;
  });

/* ==================================================================
   ⭐ 2026-11-06 이용 계약 만료 안내 — 매일 아침(KST 09:12) companyPlans/{회사}.contractEnd를 보고
   종료 30일 · 7일 · 1일 전에 그 회사 대표·임원·경리·마스터(·운송관리자)에게
     ① 알림(notifications — PC 홈·모바일 가운데 알림)  ② 메일(사람 메일 + 회사 청구 메일)을 보낸다.
   같은 안내는 두 번 보내지 않는다: companyPlans/{회사}.contractNotices["<종료일>_<30|7|1>"]에 기록(트랜잭션으로 먼저 잡음).
   종료일을 바꾸면 키가 바뀌어 새 일정으로 다시 안내한다. 계약종료(status "ended")된 회사는 건너뛴다.
   메일은 배차 프로그램의 /api/send-email(Vercel, 공용 SMTP)로 보낸다 — 주소는 siteConfig/contractNotice.sendEmailUrl
   (없으면 KP_SEND_EMAIL_URL 환경변수 → 기본 주소). 관리센터 › 이용 계약에서 "지금 확인"으로 바로 돌려볼 수 있다(contractNoticeRun).
================================================================== */
const CONTRACT_NOTICE_DAYS = [1, 7, 30];
const CONTRACT_NOTICE_ROLES = ["test", "acctStaff", "hrAcct", "allMgr", "admin"];
const CONTRACT_EXEC_POSITIONS = ["이사", "상무", "전무", "부사장", "사장", "대표", "대표이사", "본부장", "임원"];
const DEFAULT_SEND_EMAIL_URL = "https://dispatch-app2-vskk.vercel.app/api/send-email";
const ymdDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const isContractNoticeUser = (u) => !!u && !["totalMaster", "driver", "shipper", "cafeUser"].includes(u.role) && u.approved !== false && u.employmentStatus !== "퇴사" && (
  CONTRACT_NOTICE_ROLES.includes(u.role) || u.isMaster === true || CONTRACT_EXEC_POSITIONS.includes(String(u.position || "").trim())
  || String(u.team || "").trim() === "임원" || /경리|회계|재무/.test(String(u.team || "")));
const validMail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim()) && !String(e).toLowerCase().endsWith(DRIVER_EMAIL_DOMAIN);

async function contractNoticeRecipients(company, plan) {
  const users = await db.collection("users").where("companyName", "==", company).get();
  const people = users.docs.map((d) => ({ uid: d.id, ...d.data() })).filter(isContractNoticeUser);
  const mails = new Set(people.map((u) => String(u.email || "").trim().toLowerCase()).filter(validMail));
  const extra = [plan.billingEmail];
  const apps = await db.collection("transportApplications").where("companyName", "==", company).limit(3).get().catch(() => ({ docs: [] }));
  apps.docs.forEach((d) => extra.push(d.data().email));
  const cs = await db.collection("companySettings").doc(company).get().catch(() => null);
  (cs?.data()?.bizList || []).slice(0, 3).forEach((b) => extra.push(b?.email));
  extra.forEach((e) => { if (validMail(e)) mails.add(String(e).trim().toLowerCase()); });
  return { people, mails: [...mails] };
}

async function sendContractMail(to, subject, html) {
  if (!to.length) return { ok: true, skipped: true };
  const cfg = (await db.collection("siteConfig").doc("contractNotice").get().catch(() => null))?.data() || {};
  if (cfg.mailEnabled === false) return { ok: true, skipped: true, reason: "메일 끔" };
  const url = cfg.sendEmailUrl || process.env.KP_SEND_EMAIL_URL || DEFAULT_SEND_EMAIL_URL;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: to.join(","), subject, html, fromName: "LogisWeb 운영팀" }), timeout: 25000 });
  if (!r.ok) throw new Error(`메일 서버 오류 ${r.status}`);
  return { ok: true };
}

async function runContractExpiryNotices({ dryRun = false, onlyCompany = "", by = "schedule" } = {}) {
  const today = kstDateStr();
  const snap = await db.collection("companyPlans").where("contractEnd", ">=", today).get();
  const out = [];
  for (const d of snap.docs) {
    const co = d.id;
    if (onlyCompany && co !== onlyCompany) continue;
    const p = d.data() || {};
    if (p.status === "ended" || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.contractEnd || ""))) continue;
    const dLeft = ymdDiff(today, p.contractEnd);
    const t = CONTRACT_NOTICE_DAYS.find((x) => dLeft <= x);
    if (t == null) continue;
    const key = `${p.contractEnd}_${t}`;
    if (p.contractNotices?.[key]) { out.push({ company: co, dLeft, threshold: t, skipped: "이미 보냄" }); continue; }
    const { people, mails } = await contractNoticeRecipients(co, p);
    if (dryRun) { out.push({ company: co, dLeft, threshold: t, users: people.length, mails, dryRun: true }); continue; }
    // 같은 안내를 동시에 두 번 보내지 않게 먼저 잡는다
    const got = await db.runTransaction(async (tx) => {
      const cur = (await tx.get(d.ref)).data() || {};
      if (cur.contractNotices?.[key]) return false;
      tx.set(d.ref, { contractNotices: { [key]: { at: FieldValue.serverTimestamp(), by, status: "sending" } } }, { merge: true });
      return true;
    });
    if (!got) { out.push({ company: co, dLeft, threshold: t, skipped: "다른 실행이 보냄" }); continue; }
    const when = dLeft === 0 ? "오늘" : `${dLeft}일 뒤(${p.contractEnd})`;
    const msg = `[이용 계약] ${co}의 LogisWeb 이용 계약이 ${when} 종료됩니다. 계속 이용하려면 운영팀에 연장을 요청해 주세요.`;
    const batch = db.batch();
    people.forEach((u) => batch.set(db.collection("notifications").doc(`contract_${co}_${key}_${u.uid}`.replace(/\//g, "_")), {
      toUid: u.uid, type: "contract_expiry", msg, companyName: co, contractEnd: p.contractEnd, daysLeft: dLeft, read: false, createdAt: FieldValue.serverTimestamp(),
    }));
    await batch.commit();
    let mailResult = null;
    try {
      const html = `<div style="font-family:'Noto Sans KR','Malgun Gothic',sans-serif;max-width:560px;margin:0 auto;border:1px solid #E3E8F0;border-radius:16px;overflow:hidden">
<div style="background:linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82);color:#fff;padding:20px 24px"><div style="font-size:12px;letter-spacing:.24em;color:#8FB0F0;font-weight:800">CONTRACT NOTICE</div><div style="font-size:21px;font-weight:900;margin-top:4px">이용 계약 만료 안내 · D-${dLeft}</div></div>
<div style="padding:22px 24px;font-size:15px;line-height:1.75;color:#1B2B4B"><b>${co}</b> 담당자님, 안녕하세요.<br>LogisWeb 이용 계약이 <b>${p.contractEnd}</b>에 종료됩니다${dLeft === 0 ? "(오늘)" : `(${dLeft}일 남음)`}.<br>
계약이 끝나면 PC·모바일·기사앱·화주앱 접속이 모두 멈춥니다. 계속 이용하시려면 운영팀에 연장을 요청해 주세요.<br><br>
<span style="color:#5B6B85;font-size:14px">계약 기간: ${p.contractStart || "-"} ~ ${p.contractEnd}</span></div></div>`;
      mailResult = await sendContractMail(mails, `[LogisWeb] 이용 계약 만료 안내 D-${dLeft} (${co})`, html);
    } catch (e) { mailResult = { ok: false, error: e?.message || String(e) }; }
    await d.ref.set({ contractNotices: { [key]: { at: FieldValue.serverTimestamp(), by, status: mailResult?.ok ? "sent" : "mail-failed", users: people.length, mails: mails.length, mailError: mailResult?.error || null } } }, { merge: true });
    await db.collection("contractNoticeLogs").add({ company: co, key, dLeft, users: people.length, mails, mail: mailResult, by, at: FieldValue.serverTimestamp() }).catch(() => {});
    out.push({ company: co, dLeft, threshold: t, users: people.length, mails: mails.length, mail: mailResult });
  }
  console.log(`📅 계약 만료 안내 ${today}: ${out.length}건`, JSON.stringify(out).slice(0, 2000));
  return { today, results: out };
}
exports.contractExpiryNotices = functions.pubsub
  .schedule("every day 09:12")
  .timeZone("Asia/Seoul")
  .onRun(async () => { await runContractExpiryNotices(); return null; });
// 관리센터 › 이용 계약 › "지금 확인" — { dryRun, company } (최고관리자만)
exports.contractNoticeRun = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  try {
    const me = await requireTotalMaster(req);
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    res.json(await runContractExpiryNotices({ dryRun: body?.dryRun !== false, onlyCompany: String(body?.company || ""), by: me.email || me.uid }));
  } catch (e) {
    res.status(e.status || 500).json({ error: e?.message || String(e) });
  }
});

/* ==================================================================
   ↓ 구글시트 → 프로그램 오더 가져오기 (최고관리자 전용, 관리자메뉴 > 구글시트 가져오기)
   새 운송사가 쓰던 배차일지 시트를 그대로 옮길 때 쓴다. 시트를 이 프로그램 계정
   (dispatch-app-9b92f@appspot.gserviceaccount.com)에 "보기"로 공유해야 읽을 수 있다.
   - inspect: 시트 탭 목록 + 탭마다 제목줄(첫 5줄 중 글자가 가장 많은 줄) 추측
   - read:    고른 탭들의 값을 통째로 돌려준다(칸 맞추기·검사·저장은 화면에서)
   - cancel:  가져온 묶음(importBatchId) 전체 삭제(오더·자동 등록된 거래처/상하차지/기사)
   호출: POST .../sheetImport (Authorization: Bearer <ID 토큰>)
================================================================== */
function parseSpreadsheetId(url) {
  const m = String(url || "").match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9-_]{25,}$/.test(String(url || "").trim()) ? String(url).trim() : "";
}
async function sheetsApiFor(spreadsheetId, method, path, opts = {}) {
  const client = await getGsheetAuthClient();
  try {
    const res = await client.request({ url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${path}`, method, ...opts });
    return res.data;
  } catch (e) {
    const status = e?.response?.status;
    if (status === 403 || status === 404) {
      throw Object.assign(new Error("시트를 열 수 없습니다. 시트 공유에 dispatch-app-9b92f@appspot.gserviceaccount.com 을(를) '뷰어'로 추가했는지, 주소가 맞는지 확인해 주세요."), { status: 400 });
    }
    throw e;
  }
}

// ⭐ 대량 작업(초기화·복원·가져오기 취소) 중에는 그 회사 오더의 생성/삭제 알림을 보내지 않는다
// adminSecrets/bulkMode = { companies: [...], until } — 알림 함수가 10초 캐시로 확인
let _bulkModeCache = { at: 0, v: null };
async function isBulkModeFor(company) {
  if (Date.now() - _bulkModeCache.at > 10000) {
    const s = await db.collection("adminSecrets").doc("bulkMode").get().catch(() => null);
    _bulkModeCache = { at: Date.now(), v: s?.exists ? s.data() : null };
  }
  const v = _bulkModeCache.v;
  if (!v || (v.until?.toMillis?.() || 0) < Date.now()) return false;
  return (v.companies || []).includes(company || "돌캐");
}
// ⭐ 홈 화면 합계(PC에 하루 저장)를 다시 계산하라는 표시 — 초기화·복원·가져오기 취소가 끝나면 남긴다
function bumpDataVersion(company) {
  return db.collection("systemConfig").doc("dataVersion").set({ [company || "돌캐"]: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
}
async function setBulkMode(company, on, { wait = true } = {}) {
  const ref = db.collection("adminSecrets").doc("bulkMode");
  await ref.set({
    companies: on ? FieldValue.arrayUnion(company) : FieldValue.arrayRemove(company),
    until: new Date(Date.now() + 30 * 60000),
  }, { merge: true }).catch(() => {});
  // 다른 서버 인스턴스의 10초 캐시가 새 값을 볼 때까지 잠깐 기다린다(연장할 때는 안 기다림)
  if (on && wait) await sleep(11000);
}

// ===================== 🗑️ 휴지통 · 🔁 정기 오더 · 📊 마감 요약 (2026-10-27) =====================
const TRASH_KEEP_DAYS = 7;
const KST_MS = 9 * 3600 * 1000;
const kstDateStr = (ms = Date.now()) => new Date(ms + KST_MS).toISOString().slice(0, 10);
const addDaysStr = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isCanceledOrder = (d) => d?.배차상태 === "배차취소" || GSHEET_CANCELED_STATUS_LIST.includes(d?.상태);

// 관리자(admin)·최고관리자만 — 관리자는 자기 회사 것만 다룬다
async function requireAdminRole(req, body) {
  const authz = String(req.get("Authorization") || "");
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) throw Object.assign(new Error("로그인이 필요합니다."), { status: 401 });
  const decoded = await getAuth().verifyIdToken(token);
  const u = await db.collection("users").doc(decoded.uid).get();
  const ud = u.exists ? u.data() : {};
  const isTM = decoded.email === "tjddnqkf@naver.com" || ud.role === "totalMaster";
  if (!isTM && !["admin", "allMgr"].includes(ud.role)) throw Object.assign(new Error("관리자만 사용할 수 있습니다."), { status: 403 });
  const company = isTM ? String(body?.company || ud.companyName || "돌캐") : String(ud.companyName || "돌캐");
  return { decoded, isTM, company, email: decoded.email || "" };
}

// 배차 업무 직원(관리자·실무자 등) — 기사·화주 제외. 회사는 본인 소속(최고관리자는 화면에서 고른 회사)
async function requireStaff(req, body) {
  const authz = String(req.get("Authorization") || "");
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) throw Object.assign(new Error("로그인이 필요합니다."), { status: 401 });
  const decoded = await getAuth().verifyIdToken(token);
  const u = await db.collection("users").doc(decoded.uid).get();
  const ud = u.exists ? u.data() : {};
  const isTM = decoded.email === "tjddnqkf@naver.com" || ud.role === "totalMaster";
  if (!isTM && (ud.approved === false || ["driver", "shipper"].includes(ud.role) || !u.exists)) throw Object.assign(new Error("사용 권한이 없습니다."), { status: 403 });
  const company = isTM ? String(body?.company || ud.companyName || "돌캐") : String(ud.companyName || "돌캐");
  return { decoded, isTM, company, email: decoded.email || "", name: ud.name || "" };
}

// 🗑️ 휴지통 — 오더가 어떤 화면·경로로 지워지든(PC·모바일·선택삭제·기사앱) 지우기 직전 내용을 7일 보관한다.
//    (예전엔 삭제 기록에 오더 번호만 남아 Firebase 시점 복구 설정이 없으면 되살릴 수 없었다)
exports.archiveDeletedOrder = functions.firestore.document("{col}/{orderId}").onDelete(async (snap, ctx) => {
  const { col, orderId } = ctx.params;
  if (!["orders", "dispatch"].includes(col)) return;
  const data = snap.data();
  if (!data || data.source === "transport_transmit") return; // 화주사 전송 사본은 원본이 따로 있다
  const company = data.companyName || "돌캐";
  if (await isBulkModeFor(company)) return; // 운송사 초기화·가져오기 취소는 자체 보관함이 있다
  const log = await db.collection("deletedOrders").doc(`${col}_${orderId}`).get().catch(() => null);
  await db.collection("orderTrash").doc(`${col}_${orderId}`).set({
    col, id: orderId, data, companyName: company,
    deletedAt: FieldValue.serverTimestamp(), deletedBy: log?.exists ? (log.data().by || "") : "",
    expireAt: Timestamp.fromMillis(Date.now() + TRASH_KEEP_DAYS * 86400000),
    상차일: data.상차일 || "", 거래처명: data.거래처명 || "", 상차지명: data.상차지명 || "", 하차지명: data.하차지명 || "",
  });
});

// 지난 시점 읽기(PITR) — 휴지통 생기기 전에 지운 오더용
const readBeforeDelete = async (col, id, atMs) => {
  const ref = db.collection(col).doc(id);
  const readTime = Timestamp.fromMillis(Math.floor((atMs - 60 * 1000) / 60000) * 60000); // 지우기 1분 전(분 단위만 허용)
  const snap = await db.runTransaction((t) => t.get(ref), { readOnly: true, readTime });
  return snap.exists ? snap.data() : null;
};
const trashRow = (col, id, at, data, by, source) => ({
  col, id, at, source, deletedBy: by || "",
  상차일: data.상차일 || "", 거래처명: data.거래처명 || "", 상차지명: data.상차지명 || "", 하차지명: data.하차지명 || "",
  차량번호: data.차량번호 || "", 청구운임: data.청구운임 || 0, 배차상태: data.배차상태 || "", 회사: data.companyName || "돌캐",
});

//  POST { action: "list", from, to }  → 그 기간(지운 날, 한국시간)에 지운 오더 — 휴지통 우선, 없으면(최고관리자) 시점 복구로 읽기
//  POST { action: "restore", items: [{ col, id, at }] } → 되살리기(알림은 막고 넣는다)
exports.restoreDeleted = functions.runWith({ timeoutSeconds: 300, memory: "512MB" }).https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const me = await requireAdminRole(req, body);
    const mine = (c) => me.isTM || (c || "돌캐") === me.company;
    if (body.action === "list") {
      const from = String(body.from || body.date || ""); const to = String(body.to || body.from || body.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) { res.status(400).json({ error: "날짜를 확인해 주세요." }); return; }
      const start = Timestamp.fromDate(new Date(`${from}T00:00:00+09:00`));
      const end = Timestamp.fromDate(new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 86400000));
      const items = []; const seen = new Set();
      const trash = await db.collection("orderTrash").where("deletedAt", ">=", start).where("deletedAt", "<", end).get();
      const live = new Set();
      const keys = trash.docs.map((d) => d.data());
      for (let i = 0; i < keys.length; i += 300) {
        (await db.getAll(...keys.slice(i, i + 300).map((t) => db.collection(t.col).doc(t.id)))).forEach((d) => { if (d.exists) live.add(d.ref.path); });
      }
      keys.forEach((t) => {
        seen.add(`${t.col}/${t.id}`);
        if (!mine(t.companyName) || live.has(`${t.col}/${t.id}`)) return;
        items.push(trashRow(t.col, t.id, t.deletedAt?.toMillis?.() || 0, t.data || {}, t.deletedBy, "trash"));
      });
      // 휴지통이 생기기 전 삭제분 — 시점 복구(PITR)가 켜져 있어야 읽힌다(최고관리자만)
      let pitrOff = false; let missing = 0;
      if (me.isTM) {
        const logs = await db.collection("deletedOrders").where("at", ">=", start).where("at", "<", end).get();
        const old = logs.docs.map((d) => ({ ...d.data(), at: d.data().at?.toMillis?.() || 0 })).filter((x) => x.col && x.id && x.at && !seen.has(`${x.col}/${x.id}`));
        for (let i = 0; i < old.length; i += 10) {
          await Promise.all(old.slice(i, i + 10).map(async (x) => {
            try {
              if ((await db.collection(x.col).doc(x.id).get()).exists) return;
              const data = await readBeforeDelete(x.col, x.id, x.at);
              if (!data) { missing += 1; return; }
              items.push(trashRow(x.col, x.id, x.at, data, x.by, "pitr"));
            } catch (e) {
              missing += 1;
              if (/FAILED_PRECONDITION|INVALID_ARGUMENT|read_time|readTime|too old|version retention/i.test(String(e?.message || e))) pitrOff = true;
            }
          }));
        }
      }
      items.sort((a, b) => b.at - a.at);
      res.json({ from, to, items, missing, pitrOff });
      return;
    }
    if (body.action === "restore") {
      const items = (Array.isArray(body.items) ? body.items : []).filter((x) => ["orders", "dispatch"].includes(x?.col) && x?.id).slice(0, 500);
      if (!items.length) { res.status(400).json({ error: "되살릴 오더를 골라 주세요." }); return; }
      const got = [];
      for (let i = 0; i < items.length; i += 10) {
        await Promise.all(items.slice(i, i + 10).map(async (x) => {
          if ((await db.collection(x.col).doc(x.id).get()).exists) return;
          const t = await db.collection("orderTrash").doc(`${x.col}_${x.id}`).get();
          const data = t.exists ? t.data().data : (me.isTM && x.at ? await readBeforeDelete(x.col, x.id, Number(x.at)).catch(() => null) : null);
          if (data && mine(data.companyName)) got.push({ ...x, data });
        }));
      }
      const companies = [...new Set(got.map((g) => g.data.companyName || "돌캐"))];
      for (const c of companies) await setBulkMode(c, true); // 되살리는 동안 "신규 오더" 알림이 쏟아지지 않게
      let restored = 0;
      try {
        for (let i = 0; i < got.length; i += 300) {
          const wb = db.batch();
          got.slice(i, i + 300).forEach((g) => {
            wb.set(db.collection(g.col).doc(g.id), { ...g.data, _lastModified: Date.now(), 복구일시: FieldValue.serverTimestamp(), 복구자: me.email });
            wb.delete(db.collection("deletedOrders").doc(`${g.col}_${g.id}`));
            wb.delete(db.collection("orderTrash").doc(`${g.col}_${g.id}`));
          });
          await wb.commit();
          restored += Math.min(300, got.length - i);
        }
      } finally {
        await sleep(5000);
        for (const c of companies) await setBulkMode(c, false);
      }
      for (const c of companies) await bumpDataVersion(c);
      res.json({ restored, requested: items.length });
      return;
    }
    if (body.action === "purge") {
      // 🔥 완전삭제 — 휴지통의 오더를 되돌릴 수 없게 어디에도 남기지 않고 지운다(한 번에 최대 20건 — 화면이 나눠 보내며 진행률을 보여준다)
      const items = (Array.isArray(body.items) ? body.items : []).filter((x) => ["orders", "dispatch"].includes(x?.col) && x?.id).slice(0, 20);
      let purged = 0; const skipped = [];
      for (const x of items) {
        const path = `${x.col}/${x.id}`;
        if ((await db.doc(path).get()).exists) { skipped.push(path); continue; } // 살아 있는 오더는 지우지 않는다(휴지통 것만)
        const tRef = db.collection("orderTrash").doc(`${x.col}_${x.id}`);
        const t = await tRef.get();
        const data = t.exists ? (t.data().data || {}) : {};
        if (t.exists && !mine(t.data().companyName)) { skipped.push(path); continue; }
        if (!t.exists && !me.isTM) { skipped.push(path); continue; }
        const files = new Set();
        collectStoragePaths(data, files);
        const wipeDoc = async (ref) => {
          const att = await ref.collection("attachments").get().catch(() => null);
          att?.docs.forEach((d) => collectStoragePaths(d.data(), files));
          await db.recursiveDelete(ref).catch(() => {}); // 문서 + 첨부(하위 컬렉션)
        };
        await wipeDoc(db.doc(path));
        // 화주사 전송 사본 · 기사 운행기록 사본 · 기사 알림 · 위치 · 짧은 링크
        for (const col of ["orders", "dispatch"]) {
          const mirrors = await db.collection(col).where("originId", "==", x.id).get().catch(() => null);
          for (const m of mirrors?.docs || []) { collectStoragePaths(m.data(), files); await wipeDoc(m.ref); await db.collection("liveLocations").doc(m.id).delete().catch(() => {}); }
        }
        const byField = [["driver_completed_archive", "originalOrderId"], ["driver_notifications", "orderId"], ["shortLinks", "id"]];
        for (const [col, f] of byField) {
          const q = await db.collection(col).where(f, "==", x.id).get().catch(() => null);
          for (const d of q?.docs || []) await d.ref.delete().catch(() => {});
        }
        await db.collection("liveLocations").doc(x.id).delete().catch(() => {});
        if (data._gsheetSync || data._gsheetMine) await removeDocFromGsheet(path, data).catch(() => {}); // 시트에 남은 줄
        for (const f of files) await resetBucket().file(f).delete().catch(() => {});
        await db.collection("deletedOrders").doc(`${x.col}_${x.id}`).delete().catch(() => {});
        await tRef.delete();
        purged += 1;
      }
      await db.collection("resetLogs").add({ kind: "purgeOrders", by: me.email, company: me.company, count: purged, at: FieldValue.serverTimestamp() }).catch(() => {});
      res.json({ purged, skipped });
      return;
    }
    res.status(400).json({ error: "알 수 없는 요청입니다." });
  } catch (e) {
    console.error("휴지통 오류:", e);
    res.status(e.status || 500).json({ error: e.message || "오류" });
  }
});

// 🔁 정기오더 — recurringOrders/{id}: { companyName, name, days:[0~6(일~토)], createHour, createWhen("prev"=전날|"same"=당일),
//    active, withDriver, order:{오더 내용}, dropOffset, createdBy }
//    정기오더마다 정한 시각에 그 요일 오더를 만든다(전날 미리 또는 당일). 같은 날짜로는 한 번만 만든다(recurringRuns 표시).
const RECURRING_FIELDS = ["거래처명", "거래처전화번호", "거래처담당자", "상차지명", "상차지주소", "상차지담당자", "상차지담당자번호", "하차지명", "하차지주소", "하차지담당자", "하차지담당자번호",
  "상차시간", "상차시간기준", "하차시간", "하차시간기준", "상차방법", "하차방법", "차량종류", "차량톤수", "화물내용", "지급방식", "배차방식", "청구운임", "기사운임", "수수료",
  "혼적", "독차", "혼적여부", "운행유형", "회전수", "메모", "적요", "전달사항", "전달사항고정", "경유상차목록", "경유하차목록", "경유지_상차", "경유지_하차",
  "상차지오더메모", "하차지오더메모", "companyName", "company", "운송사명", "운송사코드", "companyCode"];
const RECURRING_DRIVER_FIELDS = ["차량번호", "이름", "전화번호", "기사명"];
async function generateRecurringOrders(date, { company = null, ids = null, checkDays = true } = {}) {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const snap = await db.collection("recurringOrders").where("active", "==", true).get();
  let created = 0; const names = [];
  for (const t of snap.docs) {
    const tp = t.data();
    if (company && (tp.companyName || "돌캐") !== company) continue;
    if (ids && !ids.includes(t.id)) continue;
    if (checkDays && !(tp.days || []).includes(dow)) continue;
    if ((tp.skipDates || []).includes(date)) continue;
    const marker = db.collection("recurringRuns").doc(`${t.id}_${date}`);
    try { await marker.create({ at: FieldValue.serverTimestamp(), tpl: t.id, date }); } catch { continue; } // 이미 만든 날
    const src = tp.order || {};
    const o = {};
    RECURRING_FIELDS.forEach((k) => { if (src[k] !== undefined) o[k] = src[k]; });
    if (tp.withDriver) RECURRING_DRIVER_FIELDS.forEach((k) => { if (src[k] !== undefined) o[k] = src[k]; });
    const hasDriver = !!(tp.withDriver && String(o.차량번호 || "").trim());
    const id = `rec_${t.id}_${date}`;
    Object.assign(o, {
      _id: id, 상차일: date, 하차일: addDaysStr(date, Number(tp.dropOffset) || 0), 등록일: kstDateStr(),
      companyName: o.companyName || tp.companyName || "돌캐",
      배차상태: hasDriver ? "배차완료" : "배차중",
      ...(hasDriver ? { 배차확정일시: FieldValue.serverTimestamp(), 배차확정자: "정기 오더", 배차완료일시: Date.now() } : {}),
      작성자: tp.createdBy || "", 등록기기: "정기", 정기오더: { id: t.id, name: tp.name || "" }, _recurring: true,
      createdAt: FieldValue.serverTimestamp(), updatedAt: Date.now(), _lastModified: Date.now(),
    });
    await db.collection("orders").doc(id).create(o).then(() => { created += 1; names.push(tp.name || `${o.거래처명} ${o.상차지명}→${o.하차지명}`); })
      .catch((e) => console.warn("정기 오더 생성 실패:", t.id, e?.message || e));
    await t.ref.update({ lastRunDate: date }).catch(() => {});
  }
  return { created, names };
}

// ⭐ 2026-11-05 고정노선 운송업체 설정(routeCarrierSettings/{회사}, 화면 src/routeCarriers.js 와 같은 규칙)
//  끄거나 삭제한 운송업체의 고정노선 오더(배차표Id)는 매출·수익 합계에서 뺀다 — 설정이 없으면 전부 포함
async function routeCarrierCountable(company) {
  const key = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();
  let st = null;
  try { const snap = await db.collection("routeCarrierSettings").doc(String(company)).get(); st = snap.exists ? snap.data() : null; } catch (e) { st = null; }
  if (!st) return () => true;
  const off = new Set();
  (Array.isArray(st.removed) ? st.removed : []).forEach((n) => { const k = key(n); if (k) off.add(k); });
  (Array.isArray(st.carriers) ? st.carriers : []).forEach((c) => { const k = key(c && c.name); if (!k) return; if (c.on === false) off.add(k); else off.delete(k); });
  const carrierOf = (o) => {
    const ex = o && o.추가정보;
    if (ex && typeof ex === "object") {
      if (String(ex.운송업체 ?? "").trim()) return String(ex.운송업체).trim();
      for (const k of Object.keys(ex)) if (/운송업체|운송사/.test(k) && String(ex[k] ?? "").trim()) return String(ex[k]).trim();
    }
    return String((o && o.운송업체) ?? "").trim();
  };
  // ⭐ 2026-11-06 운송업체 빈칸 = 끈 업체와 같이 제외(화면과 같은 기준)
  return (o) => { if (!o || !o.배차표Id) return true; const c = carrierOf(o); return !!c && !off.has(key(c)); };
}
// 📊 마감 요약 — 그날(상차일) 오더 건수·배차완료·미배차·매출·수익 + 내일 오더/미배차
async function buildDailySummary(company, date) {
  const tomorrow = addDaysStr(date, 1);
  const countable = await routeCarrierCountable(company); // ⭐ 2026-11-05 운송업체 설정
  const rows = { [date]: [], [tomorrow]: [] };
  for (const col of ["orders", "dispatch"]) {
    const snap = await db.collection(col).where("상차일", "in", [date, tomorrow]).get();
    snap.docs.forEach((d) => {
      const x = d.data();
      if (x.source === "transport_transmit" || isCanceledOrder(x) || (x.companyName || "돌캐") !== company) return;
      rows[String(x.상차일)]?.push(x);
    });
  }
  const num = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
  const t = rows[date];
  const revenue = t.filter(countable).reduce((a, x) => a + num(x.청구운임), 0); // ⭐ 2026-11-05 끈 운송업체 오더는 매출·수익에서 뺀다
  const pay = t.filter(countable).reduce((a, x) => a + num(x.기사운임), 0);
  return {
    company, date, count: t.length,
    done: t.filter((x) => x.배차상태 === "배차완료").length,
    pending: t.filter((x) => x.배차상태 !== "배차완료").length,
    revenue, pay, profit: revenue - pay,
    tomorrowCount: rows[tomorrow].length, tomorrowPending: rows[tomorrow].filter((x) => x.배차상태 !== "배차완료").length,
    at: FieldValue.serverTimestamp(),
  };
}
// ⏰ 매시 5분(한국시간) — 정기오더 생성(정기오더마다 정한 시각) / 휴지통 7일 지난 것 비우기
// 🎂 생일 3일 전 알림(2026-11-02) — 매일 아침 9시 10분(한국시간), 3일 뒤 생일인 직원을 같은 회사 동료에게 알린다(생일인 본인은 제외)
//  생년월일: users.birthDate("YYYY-MM-DD"). 알림 설정 키 "생일"(기본 켜짐)
exports.birthdayReminders = functions.pubsub.schedule("10 9 * * *").timeZone("Asia/Seoul").onRun(async () => {
  const d3 = new Date(Date.now() + 9 * 3600e3 + 3 * 86400e3);
  const md = `${String(d3.getUTCMonth() + 1).padStart(2, "0")}-${String(d3.getUTCDate()).padStart(2, "0")}`;
  const [all, rs] = await Promise.all([db.collection("users").get(), db.collection("hrResumes").get().catch(() => null)]);
  const rsBirth = new Map((rs?.docs || []).map((d) => [d.id, d.data().birthDate || ""])); // 이력서에만 적힌 생년월일도
  const staff = all.docs.map((d) => ({ id: d.id, ...d.data() })).map((u) => ({ ...u, birthDate: u.birthDate || rsBirth.get(u.id) || "" }))
    .filter((u) => !NON_STAFF_ROLES.has(u.role) && u.role !== "totalMaster" && u.approved !== false && u.employmentStatus !== "퇴사");
  const byCo = new Map();
  staff.forEach((u) => { const co = String(u.companyName || PUSH_DEFAULT_COMPANY).trim(); if (!byCo.has(co)) byCo.set(co, []); byCo.get(co).push(u); });
  for (const [co, list] of byCo) {
    const bd = list.filter((u) => String(u.birthDate || "").slice(5, 10) === md);
    if (!bd.length) continue;
    const names = bd.map((u) => `${u.name || ""}${u.position ? ` ${u.position}` : ""}님`);
    const ids = new Set(bd.map((u) => u.id));
    const tokens = list.filter((u) => !ids.has(u.id) && isPushTypeEnabled(u.pushPrefs, "생일")).flatMap((u) => userTokens(u));
    const [mm, dd] = md.split("-").map(Number);
    await sendPushAndCleanup(tokens, {
      notification: { title: `🎂 생일 D-3 · ${mm}월 ${dd}일`, body: `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` 외 ${names.length - 3}명` : ""}의 생일이 3일 남았어요` },
      android: { priority: "high" },
    }, `생일 알림(${co})`).catch((e) => console.error("생일 알림 실패:", co, e));
  }
  return null;
});

exports.hourlyJobs = functions.runWith({ timeoutSeconds: 300, memory: "512MB" }).pubsub.schedule("5 * * * *").timeZone("Asia/Seoul").onRun(async () => {
  const hour = new Date(Date.now() + KST_MS).getUTCHours();
  const today = kstDateStr();
  const tpls = await db.collection("recurringOrders").where("active", "==", true).get();
  for (const t of tpls.docs) {
    const tp = t.data();
    if (Number(tp.createHour ?? 17) !== hour) continue;
    const date = tp.createWhen === "same" ? today : addDaysStr(today, 1);
    await generateRecurringOrders(date, { ids: [t.id] }).catch((e) => console.error("정기오더 실패:", t.id, e));
  }
  const old = await db.collection("orderTrash").where("expireAt", "<", Timestamp.now()).limit(400).get();
  if (!old.empty) { const wb = db.batch(); old.docs.forEach((d) => wb.delete(d.ref)); await wb.commit(); }
  // ⭐ 2026-11-02 관리자센터 — 매일 4시 한 번만 집계하니 그 뒤 가입한 직원·접속이 다음 날까지 안 보였다.
  //   낮 시간(06~23시)은 매시간 다시 집계하고, 데이터량(문서 수 count)은 비용 때문에 새벽 4시 전체 집계 때만 새로 센다.
  //   (계정·접속 숫자는 관리센터 화면이 users·loginSessions를 실시간으로 읽어 덮어쓴다)
  if (hour === 4 || hour >= 6) await computePlatformStats({ full: hour === 4 }).catch((e) => console.error("플랫폼 관제 집계 실패:", e));
  return null;
});

// 📧 사내메일 — 새 메일이 생기면 받는 사람 휴대폰·PC로 푸시(보낸 사람 본인은 제외)
async function pushInternalMail(m) {
  const to = (Array.isArray(m.to) ? m.to : []).filter((u) => u && u !== m.fromUid).slice(0, 500);
  if (!to.length) return;
  const tokens = [];
  // ⭐ 2026-11-02 점검 — kind:"hr"에는 이력서 제출·연차 촉진·증명서 발급도 섞여 있다 — 제목이 [인사발령…]인 것만 '인사발령' 설정·제목으로
  const isOrder = m.kind === "hr" && /^\[인사발령/.test(String(m.subject || ""));
  for (let i = 0; i < to.length; i += 100) {
    const docs = await db.getAll(...to.slice(i, i + 100).map((uid) => db.collection("users").doc(uid)));
    const pk = isOrder ? "인사발령" : m.kind === "closeReport" ? "마감보고" : "사내메일";
    docs.forEach((d) => { if (d.exists && (d.data().companyName || "돌캐") === (m.company || "돌캐") && isPushTypeEnabled(d.data().pushPrefs, pk)) tokens.push(...userTokens(d.data())); });
  }
  const head = isOrder ? "◆ 인사발령" : m.kind === "hr" ? "◆ 인사관리부" : m.kind === "closeReport" ? "▸ 마감보고" : m.kind === "approval" ? `✎ 전자결재 · ${m.fromName || ""}` : `▸ ${m.important ? "[중요] " : ""}${m.fromName || "사내메일"}`;
  const body = m.kind === "closeReport" ? String(m.body || "") : `${m.subject || ""}${m.body ? `\n${String(m.body).replace(/\s+/g, " ").slice(0, 80)}` : ""}`;
  await sendPushAndCleanup([...new Set(tokens)], { notification: { title: m.kind === "closeReport" ? `▸ ${m.subject || "마감보고"}` : head, body }, android: { priority: "high" } }, "사내메일");
}
exports.notifyInternalMail = functions.firestore.document("internalMails/{id}").onCreate(async (snap) => {
  const m = snap.data() || {};
  if (m.status === "draft" || m.status === "scheduled") return null; // 임시보관·예약 메일은 보낼 때 알린다
  if (m.kind === "approval") return null; // 전자결재 결과 기록 메일 — 푸시는 notifyApproval이 이미 보냈다
  if (m.kind === "handover") return null; // ⭐ 2026-11-03 인수인계 메일함 사본 — 푸시는 notifyHandover가 이미 보냈다
  // ⭐ 2026-11-02 부고처럼 공지사항으로도 올린 글의 안내 메일 — 공지 푸시(notifyNotice)가 이미 나가므로 메일 푸시는 생략(2번 방지)
  if (m.kind === "notice" && m.noticeKey && !/_v\d+$/.test(m.noticeKey)) return null; // 수정(정정) 안내는 공지 푸시가 없으니 메일 푸시로
  await pushInternalMail(m);
  return null;
});

// 📝 전자결재 푸시(2026-10-28) — 지금 결재할 차례가 된 사람, 결과가 나온 기안자에게만 보낸다(화면 배너는 BannerCenter)
exports.notifyApproval = functions.firestore.document("approvals/{id}").onWrite(async (chg) => {
  const b = chg.before.exists ? chg.before.data() : null;
  const a = chg.after.exists ? chg.after.data() : null;
  if (!a) return null;
  const t = a.title || a.formLabel || "결재 문서";
  const turn = (d) => (d && d.status === "pending" ? d.line?.[d.step]?.uid : null);
  const cTurn = (d) => (d && d.status === "approved" && d.cancel?.status === "pending" ? d.cancel.line?.[d.cancel.step]?.uid : null);
  const msgs = [];
  if (turn(a) && turn(a) !== turn(b)) msgs.push([turn(a), `✎ 결재 요청 · ${a.drafter?.name || ""}`, `${t}\n${a.summary || ""}`, "결재요청"]);
  if (cTurn(a) && cTurn(a) !== cTurn(b)) msgs.push([cTurn(a), `✎ 결재 취소 요청 · ${a.drafter?.name || ""}`, `${t}\n사유: ${a.cancel?.reason || ""}`, "결재요청"]);
  if (b && a.drafterUid) {
    const newly = (a.line || []).filter((x, i) => x.status === "approved" && b.line?.[i]?.status !== "approved");
    if (a.status === "approved" && b.status !== "approved") msgs.push([a.drafterUid, "✓ 최종 승인", `${t} — 결재가 모두 끝났습니다.`]);
    else if (a.status === "pending" && newly.length) msgs.push([a.drafterUid, `✓ ${newly[0].name} ${newly[0].position || ""} 승인`, `${t} (${(a.line || []).filter((x) => x.status === "approved").length}/${(a.line || []).length})`]);
    if (a.status === "rejected" && b.status !== "rejected") { const r = (a.line || []).find((x) => x.status === "rejected"); msgs.push([a.drafterUid, `↩ 반려 · ${r?.name || ""}`, `${t}\n사유: ${r?.comment || ""}`]); }
    if (a.status === "cancelled" && b.status !== "cancelled") msgs.push([a.drafterUid, "결재 취소 승인", `${t} 문서가 결재 취소되었습니다.`]);
    if (a.cancel?.status === "rejected" && b.cancel?.status !== "rejected") { const r = (a.cancel.line || []).find((x) => x.status === "rejected"); msgs.push([a.drafterUid, `결재 취소 거부 · ${r?.name || ""}`, `${t}\n${r?.comment || ""}`]); }
    // ⭐ 2026-11-04 지출결의 지급완료 — 재무·경리가 [지급 완료 처리]를 누르면 기안자에게
    if (a.status === "approved" && a.paid?.at && !b.paid?.at && a.paid.by !== a.drafterUid) msgs.push([a.drafterUid, "₩ 지급 완료", `[지급 완료] ${t} — ${Math.round(Number(a.amount) || 0).toLocaleString("ko-KR")}원 지급되었습니다${a.paid.date ? ` (${a.paid.date})` : ""}`]);
  }
  // ⭐ 2026-11-02 참조(cc) — 최종 승인되면 기안자가 고른 참조자에게도 알린다(화면 안내대로)
  if (b && a.status === "approved" && b.status !== "approved") {
    (Array.isArray(a.ccUids) ? a.ccUids : []).filter((c) => c && c !== a.drafterUid && !(a.line || []).some((x) => x.uid === c))
      .forEach((c) => msgs.push([c, `◇ 참조 · ${a.drafter?.name || ""}`, `${t} — 최종 승인된 문서입니다.`]));
  }
  for (const [uid, title, body, pk = "결재결과"] of msgs) {
    const u = await db.collection("users").doc(uid).get();
    const tok = u.exists && isPushTypeEnabled(u.data().pushPrefs, pk) ? userTokens(u.data()) : [];
    if (tok.length) await sendPushAndCleanup(tok, { notification: { title, body }, android: { priority: "high" } }, "전자결재").catch((e) => console.error("결재 푸시 실패:", e));
  }
  return null;
});

// 📢 공지사항 푸시(2026-10-31) — 새 공지가 올라오면 받는 대상 전원에게(작성자 제외)
//  같은 회사 직원 · 팀 지정 공지는 그 팀원에게만(⭐ 2026-11-03 관리자도 제외) · 화주사 대상 공지는 직원 + 연동 화주 계정은 화주 화면 공지라 제외
//  ⭐ 2026-11-03 직원 지정 공지(targetUids)는 그 직원들에게만
const NOTICE_ADMIN_ROLES = ["admin", "totalMaster", "superadmin"];
// ⭐ 2026-11-03 공개 대상 여러 개(audiences: internal·shipper·driver) — 예전 공지(audience만)는 internal(직원)로 본다
//  기사(driver)가 들어 있으면 같은 회사 기사(승인된 계정)에게도 보낸다. 직원(internal)이 빠져 있으면 직원에게는 보내지 않는다.
//  (화주사 대상 공지라도 직원은 예전처럼 받는다 — audiences가 없을 때와 같게)
async function sendNoticePush(n) {
  const company = n.companyName || "돌캐";
  const teams = Array.isArray(n.teams) ? n.teams : [];
  const auds = Array.isArray(n.audiences) && n.audiences.length ? n.audiences : null;
  const toStaff = !auds || auds.includes("internal") || auds.includes("shipper");
  const toDriver = !!auds && auds.includes("driver");
  // ⭐ 2026-11-03 직원 지정 공지(targetUids) — 고른 직원에게만 푸시(관리자라도 지정 안 됐으면 보내지 않음 · 목록에서도 지정된 사람·작성자·최고관리자만 보임)
  const targetUids = new Set((Array.isArray(n.targetUids) ? n.targetUids : []).filter(Boolean));
  const users = await db.collection("users").where("companyName", "==", company).get();
  const tokens = [];
  users.forEach((d) => {
    const u = d.data() || {};
    if (d.id === n.authorUid || !userTokens(u).length || u.approved === false || u.employmentStatus === "퇴사") return;
    if (["shipper", "cafeUser"].includes(u.role)) return;
    if (u.role === "driver") {
      if (!toDriver) return;
    } else {
      if (!toStaff) return;
      // ⭐ 2026-11-03 지정 공지 비공개 — 직원·팀 지정이면 지정된 사람(팀원)에게만. 관리자·다른 직원에게는 보내지 않는다(작성자는 위에서 제외)
      if (targetUids.size || teams.length) { if (!targetUids.has(d.id) && !teams.includes(String(u.team || "").trim())) return; }
    }
    if (!isPushTypeEnabled(u.pushPrefs, "공지사항")) return;
    tokens.push(...userTokens(u));
  });
  const title = `◆ ${n.category || "공지사항"} · ${n.author || ""}`;
  const body = `${n.title || ""}${n.content ? `\n${String(n.content).replace(/\s+/g, " ").slice(0, 80)}` : ""}`;
  const list = [...new Set(tokens)];
  await sendPushAndCleanup(list, { notification: { title, body }, android: { priority: "high" } }, "공지사항").catch((e) => console.error("공지 푸시 실패:", e));
  return list.length;
}
exports.notifyNotice = functions.firestore.document("notices/{id}").onCreate(async (snap) => {
  const n = snap.data() || {};
  // ⭐ 2026-11-02 인사발령 공문은 전 직원 사내메일(kind "hr") 푸시가 "인사발령" 알림으로 따로 나간다 — 공지 푸시까지 가면 같은 알림이 2번
  if (n.category === "인사발령") return null;
  // ⭐ 2026-11-03 예약 게시 — publishAt(ms)이 미래면 지금은 보내지 않고 sendScheduledNotices가 그 시각에 보낸다
  if ((Number(n.publishAt) || 0) > Date.now()) return null;
  await sendNoticePush(n);
  return null;
});
// ⭐ 2026-11-03 회사 공지 예약 게시 — 5분마다 pushPending인 공지 중 게시 시각이 지난 것에 푸시
exports.sendScheduledNotices = functions.pubsub.schedule("every 5 minutes").timeZone("Asia/Seoul").onRun(async () => {
  const snap = await db.collection("notices").where("pushPending", "==", true).get();
  const now = Date.now();
  for (const d of snap.docs) {
    const n = d.data() || {};
    if ((Number(n.publishAt) || 0) > now) continue;
    // 먼저 표시를 바꿔 두 번 보내지 않게(다음 실행과 겹쳐도)
    await d.ref.set({ pushPending: false, pushedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (n.category === "인사발령") continue;
    const cnt = await sendNoticePush(n).catch((e) => { console.error("예약 회사 공지 푸시 실패:", e); return 0; });
    console.log(`[예약 회사 공지] ${d.id} ${n.title} → ${cnt}대`);
  }
  return null;
});

// 🔁 2026-11-03 인수인계 푸시 + 메일함 사본 — 새 인수인계가 등록되면 받는 사람에게만(작성자 제외)
//  handovers: { text, date, receivers[{uid,name}], receiverUids[], receiver(이름들), receiverUid(첫 사람), author, authorUid, companyName, readBy[] }
//  · 휴대폰 푸시: 각자 "인수인계" 알림을 끈 사람 · 퇴사자 · 다른 회사 계정 제외(isPushTypeEnabled — 기본 켜짐)
//  · 사내메일함 사본: internalMails/handover_{id} (kind "handover" → 공문함) — 받는 사람이 인수인계를 열면 화면이 이 메일도 읽음으로 바꾼다
//    (이 메일로는 따로 푸시하지 않는다 — notifyInternalMail이 kind "handover"는 건너뜀)
exports.notifyHandover = functions.firestore.document("handovers/{id}").onCreate(async (snap, ctx) => {
  const h = snap.data() || {};
  const company = String(h.companyName || PUSH_DEFAULT_COMPANY).trim();
  const fromList = Array.isArray(h.receiverUids) && h.receiverUids.length ? h.receiverUids
    : Array.isArray(h.receivers) && h.receivers.length ? h.receivers.map((r) => r && r.uid)
    : h.receiverUid ? [h.receiverUid] : [];
  const to = [...new Set(fromList.filter((u) => typeof u === "string" && u && u !== h.authorUid))].slice(0, 300);
  if (!to.length) return null;
  const nameOf = (uid) => ((Array.isArray(h.receivers) ? h.receivers : []).find((r) => r && r.uid === uid) || {}).name || "";
  const text = String(h.text || "");
  const author = String(h.author || "");
  // ① 휴대폰 푸시
  try {
    const tokens = [];
    for (let i = 0; i < to.length; i += 100) {
      const docs = await db.getAll(...to.slice(i, i + 100).map((uid) => db.collection("users").doc(uid)));
      docs.forEach((d) => {
        if (!d.exists) return;
        const u = d.data() || {};
        if (u.approved === false || u.employmentStatus === "퇴사") return;
        if (u.role !== "totalMaster" && String(u.companyName || PUSH_DEFAULT_COMPANY).trim() !== company) return;
        if (!isPushTypeEnabled(u.pushPrefs, "인수인계")) return;
        tokens.push(...userTokens(u));
      });
    }
    const body = `${h.date ? `${h.date} · ` : ""}${text.replace(/\s+/g, " ").slice(0, 80)}`;
    await sendPushAndCleanup([...new Set(tokens)], { notification: { title: `↻ 인수인계 · ${author || "동료"}`, body }, android: { priority: "high" } }, "인수인계");
  } catch (e) { console.error("인수인계 푸시 실패:", e); }
  // ② 사내메일함 사본(같은 인수인계로 두 번 만들지 않게 문서 id 고정)
  try {
    await db.collection("internalMails").doc(`handover_${ctx.params.id}`).create({
      company, fromUid: h.authorUid || "", fromEmail: "", fromName: author,
      subject: `[인수인계] ${h.date || ""} ${author ? `${author}님의 인수인계` : "인수인계"}`.replace(/\s+/g, " ").trim().slice(0, 200),
      body: `${text}\n\n— 전자결재 › 인수인계에서도 볼 수 있습니다.`.slice(0, 20000), images: [],
      kind: "handover", handoverId: ctx.params.id, important: false, status: "sent", at: FieldValue.serverTimestamp(),
      readBy: [], deletedBy: [], starredBy: [],
      to, toNames: to.map(nameOf), cc: [], ccNames: [],
    });
  } catch (e) { if (e && e.code !== 6) console.error("인수인계 메일 사본 실패:", e); } // 6 = 이미 있음
  return null;
});

// ⭐ 2026-11-02 관리자센터2 — 📢 플랫폼 공지 푸시: 관리자 관리센터에서 공지를 올리면 대상 회사 직원에게
//  audience: all(운송사 직원 + 화주) · carrier(운송사 직원) · shipper(화주 계정) · selected(targetCompanies의 운송사 직원)
//  기사·카페 계정 · 승인 대기 · 퇴사자 제외, 각자 "공지사항" 알림을 끈 사람 제외. 공지에 push:false면 보내지 않는다.
// ⭐ 2026-11-03 예약 게시 — publishAt(ms)이 미래면 만들 때는 보내지 않고, 5분마다 도는 sendScheduledPlatformNotices가 그 시각에 보낸다
async function sendPlatformNoticePush(n) {
  const aud = n.audience || "all";
  const targets = new Set((Array.isArray(n.targetCompanies) ? n.targetCompanies : []).map((c) => String(c || "").trim()).filter(Boolean));
  if (aud === "selected" && !targets.size) return 0;
  const users = await db.collection("users").get();
  const tokens = [];
  users.forEach((d) => {
    const u = d.data() || {};
    if (!userTokens(u).length || u.approved === false || u.employmentStatus === "퇴사") return;
    if (["driver", "cafeUser", "totalMaster"].includes(u.role)) return;
    const isShipper = u.role === "shipper";
    if (aud === "carrier" && isShipper) return;
    if (aud === "shipper" && !isShipper) return;
    if (aud === "selected" && (isShipper || !targets.has(String(u.companyName || PUSH_DEFAULT_COMPANY).trim()))) return;
    if (!isPushTypeEnabled(u.pushPrefs, "공지사항")) return;
    tokens.push(...userTokens(u));
  });
  const title = `◆ LogisWeb 플랫폼 공지 · ${n.level || "안내"}`;
  const body = `${n.title || ""}${n.body ? `\n${String(n.body).replace(/\s+/g, " ").slice(0, 80)}` : ""}`;
  const all = [...new Set(tokens)];
  // 한 번에 최대 500개(FCM 멀티캐스트 한도) — 전체 공지는 나눠 보낸다
  for (let i = 0; i < all.length; i += 500) {
    await sendPushAndCleanup(all.slice(i, i + 500), { notification: { title, body }, android: { priority: "high" } }, "공지사항").catch((e) => console.error("플랫폼 공지 푸시 실패:", e));
  }
  return all.length;
}
exports.notifyPlatformNotice = functions.firestore.document("platformNotices/{id}").onCreate(async (snap) => {
  const n = snap.data() || {};
  if (n.push === false || n.active === false) return null;
  if ((n.publishAt || 0) > Date.now() + 60000) return null; // 예약 — 그 시각에 보냄
  await sendPlatformNoticePush(n);
  await snap.ref.set({ pushPending: false, pushedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
  return null;
});
// 🔔 2026-11-03 푸시 점검(최고관리자) — "안드로이드만 안 온다" 같은 문의 확인용
//  list: 이 공지(또는 회사)의 대상 직원마다 받는지/안 받는지와 이유(기기 없음·알림 끔·승인 대기·퇴사·최고관리자 등)
//  test: 한 사람의 등록된 기기 전부에 테스트 푸시 → 기기별 성공/실패(오류 코드) 그대로 돌려준다
exports.pushDiag = functions.runWith({ timeoutSeconds: 60, memory: "256MB" }).https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    await requireTotalMaster(req);
    if (body.action === "list") {
      const aud = body.audience || "all";
      const targets = new Set((Array.isArray(body.targetCompanies) ? body.targetCompanies : []).map((c) => String(c || "").trim()).filter(Boolean));
      const users = await db.collection("users").get();
      const rows = [];
      users.forEach((d) => {
        const u = d.data() || {};
        if (["driver", "cafeUser"].includes(u.role)) return;
        const co = String(u.companyName || PUSH_DEFAULT_COMPANY).trim();
        const isShipper = u.role === "shipper";
        if (aud === "selected" && !targets.has(co)) return;
        if (aud === "carrier" && isShipper) return;
        if (aud === "shipper" && !isShipper) return;
        const tokens = userTokens(u);
        let why = "";
        if (u.role === "totalMaster") why = "최고관리자 계정은 공지 푸시 제외";
        else if (aud === "selected" && isShipper) why = "화주 계정(선택 운송사 공지 대상 아님)";
        else if (u.approved === false) why = "승인 대기";
        else if (u.employmentStatus === "퇴사") why = "퇴사";
        else if (!tokens.length) why = "알림 받을 기기 없음(앱에서 알림 허용 안 함 또는 로그아웃)";
        else if (!isPushTypeEnabled(u.pushPrefs, "공지사항")) why = "본인이 '공지사항' 알림을 끔";
        const at = u.fcmTokenAt?.toMillis ? u.fcmTokenAt.toMillis() : (typeof u.fcmTokenAt === "number" ? u.fcmTokenAt : 0);
        rows.push({ uid: d.id, name: u.name || u.이름 || "", email: u.email || "", company: co, role: u.role || "", devices: tokens.length, tokenAt: at, ok: !why, why });
      });
      rows.sort((a, b) => Number(a.ok) - Number(b.ok) || a.company.localeCompare(b.company) || a.name.localeCompare(b.name));
      res.json({ rows });
      return;
    }
    if (body.action === "test") {
      const u = (await db.collection("users").doc(String(body.uid || "x")).get()).data();
      const tokens = userTokens(u);
      if (!tokens.length) { res.json({ sent: 0, results: [], note: "등록된 기기가 없습니다." }); return; }
      const r = await sendPushAndCleanup(tokens, { notification: { title: "◆ LogisWeb 테스트 알림", body: "이 알림이 보이면 푸시가 정상입니다." }, android: { priority: "high" } }, "푸시 점검");
      const results = (r?.responses || []).map((x, i) => ({ device: i + 1, tail: String(tokens[i]).slice(-8), ok: x.success, code: x.error?.code || "", msg: x.error?.message || "" }));
      res.json({ sent: r?.successCount || 0, failed: r?.failureCount || 0, results });
      return;
    }
    res.status(400).json({ error: "알 수 없는 요청입니다." });
  } catch (e) {
    res.status(e.status || 500).json({ error: e?.message || String(e) });
  }
});
// 🗓 2026-11-03 개인 일정 알림 — 직원이 개인 일정에 "휴대폰 푸시 알림 받기"를 체크하면 remindAt(ms)에 본인에게만 푸시
//  personalSchedules: { uid, title, date, allDay, start, place, remind, push, remindAt, pushPending }
exports.sendPersonalScheduleReminders = functions.pubsub.schedule("every 5 minutes").timeZone("Asia/Seoul").onRun(async () => {
  const snap = await db.collection("personalSchedules").where("pushPending", "==", true).get();
  const now = Date.now();
  const hmKo = (hm) => { if (!hm) return ""; const [h, m] = String(hm).split(":").map(Number); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(m || 0).padStart(2, "0")}`; };
  for (const d of snap.docs) {
    const e = d.data() || {};
    if (!e.remindAt || e.remindAt > now) continue;
    await d.ref.set({ pushPending: false, pushedAt: FieldValue.serverTimestamp() }, { merge: true }); // 두 번 보내지 않게 먼저 표시
    if (!e.push || now - e.remindAt > 6 * 3600e3) continue; // 6시간 넘게 지난 알림은 보내지 않음(서버 멈춤 등)
    const u = (await db.collection("users").doc(String(e.uid || "x")).get().catch(() => null))?.data();
    const tokens = userTokens(u);
    if (!tokens.length) continue;
    const when = `${String(e.date || "").slice(5).replace("-", "/")} ${e.allDay || !e.start ? "종일" : hmKo(e.start)}`;
    await sendPushAndCleanup(tokens, { notification: { title: `📅 개인 일정 · ${when}`, body: `${e.title || ""}${e.place ? ` · ${e.place}` : ""}` }, android: { priority: "high" } }, "개인일정").catch((err) => console.error("개인 일정 푸시 실패:", err));
  }
  return null;
});
exports.sendScheduledPlatformNotices = functions.pubsub.schedule("every 5 minutes").timeZone("Asia/Seoul").onRun(async () => {
  const snap = await db.collection("platformNotices").where("pushPending", "==", true).get();
  const now = Date.now();
  for (const d of snap.docs) {
    const n = d.data() || {};
    if ((n.publishAt || 0) > now) continue;
    // 먼저 표시를 바꿔 두 번 보내지 않게(다음 실행과 겹쳐도)
    await d.ref.set({ pushPending: false, pushedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (n.push === false || n.active === false || (n.endDate && n.endDate < kstDateStr())) continue;
    const cnt = await sendPlatformNoticePush(n).catch((e) => { console.error("예약 공지 푸시 실패:", e); return 0; });
    console.log(`[예약 공지] ${d.id} ${n.title} → ${cnt}대`);
  }
  return null;
});

// 🙋 가입 신청 푸시(2026-10-31) — 직원·기사가 가입 신청하면(승인 대기) 그 회사 관리자 이상 전원에게
// 📱 한 기기 = 한 계정(2026-11-01) — 같은 휴대폰으로 다른 회사 계정에 로그인하면, 예전 계정 문서에 남은
//  같은 기기 토큰을 지운다(안 지우면 지금 쓰지 않는 회사의 공지·발령 알림이 이 기기로 온다).
exports.dedupeFcmToken = functions.firestore.document("users/{uid}").onWrite(async (chg, ctx) => {
  const a = chg.after.exists ? chg.after.data() : null;
  const b = chg.before.exists ? chg.before.data() : null;
  const token = a?.fcmToken;
  // 토큰이 새로 생겼거나, 앱을 다시 열어 토큰을 다시 저장했을 때(fcmTokenAt 갱신)만 확인
  if (!token || (token === b?.fcmToken && a?.fcmTokenAt === b?.fcmTokenAt)) return null;
  // ⭐ 2026-11-02 여러 기기 목록(fcmTokens)에 남은 같은 기기도 다른 계정에서 지운다
  const [s1, s2] = await Promise.all([
    db.collection("users").where("fcmToken", "==", token).get(),
    db.collection("users").where("fcmTokens", "array-contains", token).get().catch(() => null),
  ]);
  const others = new Map();
  [...s1.docs, ...(s2?.docs || [])].forEach((d) => { if (d.id !== ctx.params.uid) others.set(d.id, d); });
  if (!others.size) return null;
  const batch = db.batch();
  others.forEach((d) => {
    const patch = { fcmTokens: FieldValue.arrayRemove(token) };
    if (d.data().fcmToken === token) { patch.fcmToken = FieldValue.delete(); patch.fcmTokenAt = FieldValue.delete(); }
    batch.update(d.ref, patch);
  });
  await batch.commit();
  console.log(`◇ 같은 기기 토큰 ${others.size}개 이전 계정에서 정리`);
  return null;
});

// ⭐ 2026-11-02 원격지원 — 직원이 원격 지원을 요청하면 최고관리자(role totalMaster 또는 고정 이메일)에게,
//  최고관리자가 승인·거절하면 요청한 직원에게 푸시
const SUPPORT_SUPER_EMAIL = "tjddnqkf@naver.com";
exports.notifySupportRequest = functions.firestore.document("supportRequests/{id}").onCreate(async (snap) => {
  const r = snap.data() || {};
  if (r.status && r.status !== "pending") return null;
  const [a, b] = await Promise.all([
    db.collection("users").where("role", "==", "totalMaster").get(),
    db.collection("users").where("email", "==", SUPPORT_SUPER_EMAIL).get(),
  ]);
  const tokens = [];
  [...a.docs, ...b.docs].forEach((d) => tokens.push(...userTokens(d.data())));
  const who = [r.name, r.position].filter(Boolean).join(" ");
  const title = `◆ 원격 지원 요청 · ${r.companyName || ""}`;
  const body = `${who}${r.team ? ` (${r.team})` : ""} · ${r.method === "remote" ? "원격 프로그램" : "화면 공유"}\n${String(r.message || "").replace(/\s+/g, " ").slice(0, 80)}`;
  await sendPushAndCleanup([...new Set(tokens)], { notification: { title, body }, android: { priority: "high" } }, "원격지원").catch((e) => console.error("원격지원 요청 푸시 실패:", e));
  return null;
});
exports.notifySupportDecision = functions.firestore.document("supportRequests/{id}").onUpdate(async (chg) => {
  const b = chg.before.data() || {};
  const a = chg.after.data() || {};
  if (a.status === b.status || !["approved", "rejected"].includes(a.status) || !a.uid) return null;
  const u = await db.collection("users").doc(a.uid).get();
  const tok = u.exists ? userTokens(u.data()) : [];
  if (!tok.length) return null;
  const title = a.status === "approved" ? "✓ 원격 지원 승인" : "↩ 원격 지원 요청 거절";
  const body = a.status === "approved"
    ? ((a.mode || a.method) === "remote" ? "앱을 열어 원격 프로그램 안내를 확인하고 원격 번호를 보내 주세요." : "앱을 열어 [화면 공유 시작]을 눌러 주세요.")
    : `사유: ${a.rejectReason || "-"}`;
  await sendPushAndCleanup(tok, { notification: { title, body }, android: { priority: "high" } }, "원격지원").catch((e) => console.error("원격지원 결과 푸시 실패:", e));
  return null;
});

// ⭐ 2026-11-01 onCreate → onWrite — 예전 계정 문서를 다시 쓰는 재가입(같은 uid)도 새 가입 신청으로 알린다
exports.notifySignup = functions.firestore.document("users/{uid}").onWrite(async (chg) => {
  if (!chg.after.exists) return null;
  const snap = chg.after;
  const u = snap.data() || {};
  const b = chg.before.exists ? chg.before.data() : null;
  if (u.approved !== false || u.status === "deleted" || u.status === "withdrawn" || u.employmentStatus === "퇴사") return null;
  const becamePending = !b || b.approved !== false || ["deleted", "withdrawn"].includes(b.status) || b.employmentStatus === "퇴사";
  if (!becamePending) return null;
  if (["shipper", "cafeUser", "totalMaster"].includes(u.role)) return null;
  const company = u.companyName || "돌캐";
  const admins = await db.collection("users").where("companyName", "==", company).get();
  const tokens = [];
  admins.forEach((d) => {
    const a = d.data() || {};
    if (d.id === snap.id || !userTokens(a).length || a.approved === false || a.employmentStatus === "퇴사") return;
    // ⭐ 2026-10-31 관리자·경리·인사관리자도 가입 승인 가능 → 알림도 같이
    if (([...NOTICE_ADMIN_ROLES, "test", "hrManager", "hrAcct", "allMgr"].includes(a.role) || a.isMaster === true) && isPushTypeEnabled(a.pushPrefs, "가입신청")) tokens.push(...userTokens(a));
  });
  const isDriver = u.role === "driver";
  const title = isDriver ? "▸ 기사 가입 신청" : "◆ 직원 가입 신청";
  // ⭐ 2026-11-02 점검 — 경리·인사 화면엔 '관리자 전용 메뉴'가 없다(직원 · 기사 › 가입 승인) → 역할 무관 안내 문구로
  const body = isDriver ? `${u.name || ""} · ${u.carNo || ""} ${u.vehicleType || ""}\n앱 메뉴 › 직원 관리 또는 직원 · 기사 › 가입 승인에서 승인해 주세요` : `${u.name || u.email || ""}\n앱 메뉴 › 직원 관리 또는 직원 · 기사 › 가입 승인에서 승인해 주세요`;
  await sendPushAndCleanup([...new Set(tokens)], { notification: { title, body }, android: { priority: "high" } }, "가입신청").catch((e) => console.error("가입 신청 푸시 실패:", e));
  return null;
});

// ⏰ 예약 메일(2026-10-28) — 5분마다 보낼 시간이 된 예약 메일을 실제로 보낸다.
//  예약 중에는 to가 비어 있어(받는 사람이 미리 못 봄) pendingTo에 담겨 있다가 이때 to로 옮긴다.
// 🔔 기사 차량 정비·만기 미리 알림 — 매일 오전 9시(한국 시간)
//  정기검사·자동차보험·적재물보험·타코 점검·지입계약 만료 3일 전, 엔진오일 교체 시점 500km 전에 기사 휴대폰으로 푸시.
//  같은 항목·같은 기준 날짜는 한 번만 보낸다(drivers/{id}.careRemind 에 기록).
const CARE_DATE_LABELS = { inspection: "자동차 정기검사", insurance: "자동차보험", cargoInsurance: "적재물배상책임보험", tacho: "운행기록장치 점검", contract: "지입계약" };
const OIL_INTERVAL = { small: 7500, mid: 15000, large: 30000 };
function oilClass(ton) {
  const n = parseFloat(String(ton || "").replace(/[^\d.]/g, "")) || 0;
  return n >= 8 ? "large" : n >= 3.5 ? "mid" : "small";
}
exports.vehicleCareReminders = functions.runWith({ timeoutSeconds: 300, memory: "512MB" }).pubsub.schedule("0 9 * * *").timeZone("Asia/Seoul").onRun(async () => {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const dayDiff = (d) => Math.round((new Date(`${d}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400e3);
  const snap = await db.collection("drivers").get();
  let sent = 0;
  for (const d of snap.docs) {
    const x = d.data() || {};
    const care = x.care || {};
    if (!x.uid && !care.setupDone) continue;
    const remind = x.careRemind || {};
    const msgs = []; const mark = {};
    Object.entries(care.dates || {}).forEach(([k, v]) => {
      if (!v || !CARE_DATE_LABELS[k]) return;
      const left = dayDiff(String(v).slice(0, 10));
      if (left >= 0 && left <= 3 && remind[k] !== v) { msgs.push(`${CARE_DATE_LABELS[k]} ${left === 0 ? "오늘 만료" : `${left}일 후 만료(${v})`}`); mark[k] = v; }
    });
    const oil = care.items?.engineOil;
    const odo = Number(care.odometer) || 0;
    if (oil?.km && odo) {
      const interval = Number(care.intervals?.engineOil?.km) || OIL_INTERVAL[oilClass(x.vehicle?.톤 || x.차량톤수)];
      const left = Number(oil.km) + interval - odo;
      const key = `oil_${oil.km}`;
      if (left <= 500 && remind.engineOil !== key) { msgs.push(left > 0 ? `엔진오일 교체 ${left.toLocaleString()}km 남음` : `엔진오일 교체 시기 ${(-left).toLocaleString()}km 지남`); mark.engineOil = key; }
    }
    if (!msgs.length) continue;
    const uid = x.uid || d.id;
    const u = await db.collection("users").doc(uid).get().catch(() => null);
    const token = u?.exists ? userTokens(u.data()) : [];
    if (token.length && u.data().driverPushEnabled !== false) {
      await sendPushAndCleanup(token, {
        notification: { title: "차량 점검 알림", body: msgs.join(" · ") },
        data: { type: "vehicle_care", driverId: d.id },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, "차량 정비 알림").catch(() => {});
      sent += 1;
      // ⭐ 2026-11-02 점검 — 푸시를 실제로 보낸 경우에만 발송 표시(토큰 없음/알림 끔이면 나중에 토큰이 생겼을 때 다시 보내도록)
      await d.ref.set({ careRemind: { ...remind, ...mark, lastAt: today } }, { merge: true }).catch(() => {});
    }
  }
  console.log(`◆ 차량 정비 알림 ${sent}명`);
  return null;
});

// 📅 ⭐ 2026-11-06 연차 사용 촉진 자동 알림(근로기준법 61조) — 매일 아침 9시 20분(한국시간)
//  회기(입사일/회계연도 기준 — payrollSettings/{회사}.leave) 종료 6개월 전 1차(직원은 10일 안에 사용 계획 제출) · 2개월 전 2차(계획 미제출자 — 회사가 사용 시기 지정 예정 안내)
//  1년 미만(월차)은 3개월 전·1개월 전. 직원: 앱 알림(hrNotices 팝업) + 사내메일(푸시) + 이메일(예약 메일 — 회사 PC 프로그램이 켜져 있을 때 발송)
//  인사·경리 담당자: 오늘 발송 대상·계획 기한 지난 사람 목록. 모든 발송은 leavePromotions/{id}.log 에 시각과 함께(지울 수 없음)
//  ※ 이 서버에는 메일 발송 계정이 없어 이메일은 scheduledEmails(브라우저 발송기)를 쓴다. 자동 발송을 끈 회사(leave.autoSend=false)는 담당자에게만 알린다.
const LP = require("./leavePromote");
const realEmailOf = (u) => { const e = String(u?.email || "").trim(); return e && /@/.test(e) && !/@driver\.run25\.kr$/i.test(e) && !u?.noAccount ? e : ""; };
const htmlEsc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
exports.leavePromotionDaily = functions.runWith({ timeoutSeconds: 300, memory: "512MB" }).pubsub.schedule("20 9 * * *").timeZone("Asia/Seoul").onRun(async () => {
  const today = kstDateStr();
  const [usersSnap, profSnap, setSnap, apSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("userProfiles").get(),
    db.collection("payrollSettings").get(),
    db.collection("approvals").where("cat", "==", "leave").where("status", "==", "approved").get(),
  ]);
  const prof = new Map(profSnap.docs.map((d) => [d.id, d.data() || {}]));
  const cfgOf = new Map(setSnap.docs.map((d) => [d.id, d.data()?.leave || {}]));
  const usedBy = new Map();
  apSnap.docs.forEach((d) => { const a = d.data() || {}; const x = LP.leaveUseOf(a); if (!x || !a.drafterUid) return; if (!usedBy.has(a.drafterUid)) usedBy.set(a.drafterUid, []); usedBy.get(a.drafterUid).push(x); });
  const staff = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => !NON_STAFF_ROLES.has(u.role) && u.role !== "totalMaster" && u.approved !== false && u.employmentStatus !== "퇴사");
  const byCo = new Map();
  staff.forEach((u) => { const co = String(u.companyName || PUSH_DEFAULT_COMPANY).trim(); if (!byCo.has(co)) byCo.set(co, []); byCo.get(co).push(u); });
  let total = 0;
  for (const [co, list] of byCo) {
    try {
      const c = cfgOf.get(co) || {};
      const opt = { basis: c.basis || "hire", fiscalStart: c.fiscalStart || "01-01" };
      const recSnap = await db.collection("leavePromotions").where("companyName", "==", co).get();
      const recs = new Map(recSnap.docs.map((d) => [d.id, d.data() || {}]));
      const sent = []; const overdue = [];
      for (const u of list) {
        const pf = prof.get(u.id) || {};
        const period = LP.leavePeriodOf(pf.hireDate || u.hireDate || "", today, opt);
        if (!period) continue;
        const adj = (pf.leaveAdjust || []).filter((x) => x.period === period.from).reduce((s, x) => s + (Number(x.days) || 0), 0);
        const used = (usedBy.get(u.id) || []).filter((x) => x.date >= period.from && x.date <= period.to).reduce((s, x) => s + x.days, 0);
        const tot = period.total + adj;
        const remain = Math.max(0, tot - used);
        const id = LP.promoId(co, u.id, period.from);
        const ref = db.collection("leavePromotions").doc(id);
        const rec = recs.get(id) || {};
        const name = u.name || "";
        const now = Date.now();
        // 1차 계획 제출 기한(10일)이 지났는데 계획이 없으면 담당자에게 한 번 알림
        if (rec.n1?.due && today > rec.n1.due && !rec.plan?.submittedAt && !rec.n1.overdueNotified && remain > 0) {
          overdue.push({ name, remain, due: rec.n1.due });
          await ref.set({ n1: { overdueNotified: now }, log: FieldValue.arrayUnion({ at: now, type: "overdue", by: "auto", byName: "자동(서버)", auto: true, remain, due: rec.n1.due }) }, { merge: true });
        }
        const stage = LP.promoteStageDue(period, today, rec, remain);
        if (!stage) continue;
        const kind = stage === "first" ? "n1" : "n2";
        if (c.autoSend === false) { sent.push({ name, kind, remain, manual: true }); continue; }
        const due = LP.addDaysStr(today, 10);
        const t = LP.promoteText(kind, { name, label: period.label, from: period.from, to: period.to, remain, due, company: co });
        const email = c.email === false ? "" : realEmailOf(u);
        const channel = ["앱 알림", "사내메일", ...(email ? ["이메일(예약)"] : [])];
        const entry = kind === "n1" ? { sentAt: now, by: "auto", byName: "자동(서버)", remain, due, auto: true } : { sentAt: now, by: "auto", byName: "자동(서버)", remain, dates: [], auto: true };
        await ref.set({
          companyName: co, uid: u.id, name, label: period.label, periodFrom: period.from, periodTo: period.to, total: tot, used, remain, basis: opt.basis,
          [kind]: entry, log: FieldValue.arrayUnion({ at: now, type: kind, by: "auto", byName: "자동(서버)", auto: true, channel, remain, ...(kind === "n1" ? { due } : { dates: [] }) }),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        await db.collection("hrNotices").add({ companyName: co, uid: u.id, kind: kind === "n1" ? "leave1" : "leave2", link: "leavePlan", refId: id, title: t.subject, body: t.body, createdAt: FieldValue.serverTimestamp(), createdBy: "auto" });
        await db.collection("internalMails").add({ company: co, fromUid: "system", fromEmail: "", fromName: "인사관리부(자동)", subject: t.subject, body: t.body, images: [], kind: "hr", important: true, status: "sent", at: FieldValue.serverTimestamp(), readBy: [], deletedBy: [], starredBy: [], to: [u.id], toNames: [name], cc: [], ccNames: [] });
        if (email) await db.collection("scheduledEmails").add({ companyName: co, status: "pending", sendAt: Timestamp.now(), to: email, subject: t.subject, html: `<div style="font-family:'Malgun Gothic',sans-serif;font-size:15px;line-height:1.8;white-space:pre-wrap">${htmlEsc(t.body)}</div>`, fromName: `${co} 인사관리부`, kind: "leavePromotion", createdAt: FieldValue.serverTimestamp(), createdBy: "leavePromotionDaily" });
        sent.push({ name, kind, remain });
        total += 1;
      }
      if (!sent.length && !overdue.length) continue;
      const hr = list.filter((u) => ["hrManager", "hrAcct", "allMgr", "hrStaff", "test"].includes(u.role) || /인사/.test(String(u.team || "")));
      const managers = (hr.length ? hr : list.filter((u) => u.isMaster === true)).slice(0, 30);
      if (!managers.length) continue;
      const lines = [
        ...sent.map((x) => `· ${x.name} — ${x.kind === "n1" ? "1차 촉진" : "2차(사용 시기 지정 필요)"} · 잔여 ${x.remain}일${x.manual ? " · 자동 발송 꺼짐 → 직접 발송 필요" : " · 자동 발송함"}`),
        ...overdue.map((x) => `· ${x.name} — 사용 계획 제출 기한(${x.due}) 지남 · 잔여 ${x.remain}일 → 2차 때 회사가 날짜 지정`),
      ];
      const title = `연차 사용 촉진 — 오늘 ${sent.length}명${overdue.length ? ` · 계획 미제출 ${overdue.length}명` : ""}`;
      const body = `${lines.join("\n")}\n\n인사관리부 › 근태 › 연차 사용 촉진에서 발송 기록 확인 · 재발송 · 2차 사용일 지정을 할 수 있습니다.`;
      for (const m of managers) await db.collection("hrNotices").add({ companyName: co, uid: m.id, kind: "leaveHr", link: "leavePromo", title, body, createdAt: FieldValue.serverTimestamp(), createdBy: "auto" });
      await db.collection("internalMails").add({ company: co, fromUid: "system", fromEmail: "", fromName: "인사관리부(자동)", subject: `[연차 사용 촉진] ${title}`, body, images: [], kind: "hr", important: false, status: "sent", at: FieldValue.serverTimestamp(), readBy: [], deletedBy: [], starredBy: [], to: managers.map((m) => m.id), toNames: managers.map((m) => m.name || ""), cc: [], ccNames: [] });
    } catch (e) { console.error("연차 촉진 실패:", co, e); }
  }
  console.log(`◆ 연차 사용 촉진 자동 발송 ${total}명`);
  return null;
});

exports.sendScheduledMails = functions.pubsub.schedule("every 5 minutes").timeZone("Asia/Seoul").onRun(async () => {
  const due = await db.collection("internalMails").where("scheduledAt", "<=", Timestamp.now()).limit(100).get();
  for (const d of due.docs) {
    const m = d.data() || {};
    if (m.status !== "scheduled") continue;
    const to = [...new Set((Array.isArray(m.pendingTo) ? m.pendingTo : []).map(String))].slice(0, 500);
    const sent = {
      status: "sent", to, toNames: Array.isArray(m.pendingToNames) ? m.pendingToNames : [],
      cc: Array.isArray(m.pendingCc) ? m.pendingCc : [], ccNames: Array.isArray(m.pendingCcNames) ? m.pendingCcNames : [],
      scheduledFor: m.scheduledAt, scheduledAt: FieldValue.delete(),
      pendingTo: FieldValue.delete(), pendingToNames: FieldValue.delete(), pendingCc: FieldValue.delete(), pendingCcNames: FieldValue.delete(),
      at: FieldValue.serverTimestamp(),
    };
    await d.ref.update(sent);
    await pushInternalMail({ ...m, to }).catch((e) => console.error("예약 메일 푸시 실패:", e));
  }
  return null;
});

// 화면에서 쓰는 통로(직원 누구나) — POST { action: "recurringRun", date } / { action: "closeReport", date, preview? | to:[uid], memo, check }
exports.automation = functions.runWith({ timeoutSeconds: 300, memory: "512MB" }).https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const me = await requireStaff(req, body);
    const date = String(body.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: "날짜를 확인해 주세요." }); return; }
    if (body.action === "recurringRun") {
      res.json(await generateRecurringOrders(date, { company: me.company }));
      return;
    }
    if (body.action === "closeReport") {
      const sm = await buildDailySummary(me.company, date);
      if (body.preview) { res.json({ ...sm, at: Date.now() }); return; }
      const to = (Array.isArray(body.to) ? body.to : []).map(String).slice(0, 100);
      if (!to.length) { res.status(400).json({ error: "받을 사람을 골라 주세요." }); return; }
      const users = (await db.getAll(...to.map((uid) => db.collection("users").doc(uid)))).filter((d) => d.exists && (d.data().companyName || "돌캐") === me.company);
      const memo = String(body.memo || "").slice(0, 500);
      const check = body.check && typeof body.check === "object" ? body.check : null;
      const sender = me.name || me.email.split("@")[0];
      const won = (n) => `${Math.round(n).toLocaleString("ko-KR")}원`;
      const title = `▸ ${date.slice(5).replace("-", "/")} 마감보고 · ${sender}`;
      const lines = [
        `오더 ${sm.count}건 (완료 ${sm.done} · 미배차 ${sm.pending}) · 매출 ${won(sm.revenue)} · 수익 ${won(sm.profit)}`,
        `내일 오더 ${sm.tomorrowCount}건 중 미배차 ${sm.tomorrowPending}건`,
        check ? `검증 ${check.passed}/${check.total} · 오류 ${check.errors} · 경고 ${check.warnings}` : "",
        memo ? `메모: ${memo}` : "",
      ].filter(Boolean);
      await db.collection("closeReports").add({ company: me.company, date, by: me.email, byName: sender, to: users.map((d) => d.id), memo, check, summary: { ...sm, at: null }, at: FieldValue.serverTimestamp() });
      // 📧 사내메일로도 남긴다 — 메일함·화면 배너로 보이고, 푸시는 notifyInternalMail 트리거가 보낸다
      await db.collection("internalMails").add({
        company: me.company, fromUid: me.decoded.uid, fromEmail: me.email, fromName: sender,
        to: users.map((d) => d.id), toNames: users.map((d) => d.data().name || d.data().email || ""),
        subject: title.replace(/^▸\s*/, ""), body: lines.join("\n"), images: [], kind: "closeReport",
        at: FieldValue.serverTimestamp(), readBy: [], deletedBy: [],
      });
      const tokens = users.filter((d) => d.id !== me.decoded.uid).flatMap((d) => userTokens(d.data()));
      res.json({ recipients: users.length, pushed: tokens.length });
      return;
    }
    res.status(400).json({ error: "알 수 없는 요청입니다." });
  } catch (e) {
    console.error("자동화 오류:", e);
    res.status(e.status || 500).json({ error: e.message || "오류" });
  }
});

// ⭐ "내 오더만 구글시트로 보내기" 켜기/끄기(최고관리자) — POST { action: "status" | "enable" | "disable", email }
exports.gsheetMine = functions.runWith({ timeoutSeconds: 540, memory: "512MB" }).https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const me = await requireTotalMaster(req);
    const toJson = (d) => d ? { enabled: !!d.enabled, email: d.email || "", since: d.since?.toMillis?.() || null, updatedBy: d.updatedBy || "" } : { enabled: false };
    if (body.action === "linkImport") {
      // 구글시트에서 가져온 오더를 시트의 원래 줄과 연결 — 날짜·거래처·상차지·하차지가 같고 오더ID가 비어 있는 줄에 오더ID를 적는다.
      // 연결된 오더는 그 뒤 프로그램에서 수정·삭제하면 시트의 그 줄도 같이 바뀐다.
      const batchId = String(body.batchId || "");
      const bs = await db.collection("importBatches").doc(batchId || "x").get();
      if (!bs.exists) { res.status(404).json({ error: "가져오기 기록을 찾을 수 없습니다." }); return; }
      const bdat = bs.data();
      if (bdat.status === "canceled") { res.status(400).json({ error: "취소된 가져오기입니다." }); return; }
      if (bdat.source === "excel") { res.status(400).json({ error: "엑셀에서 가져온 오더는 시트와 연결할 수 없습니다." }); return; }
      const meta = await gsheetApi("GET", "?fields=properties.title");
      if (bdat.spreadsheetId ? bdat.spreadsheetId !== GSHEET_SPREADSHEET_ID : bdat.sheetTitle !== meta?.properties?.title) {
        res.status(400).json({ error: `연결된 구글시트(${meta?.properties?.title || ""})에서 가져온 기록만 연결할 수 있습니다.` }); return;
      }
      const docs = [];
      for (const c of ["orders", "dispatch"]) {
        const snap = await db.collection(c).where("importBatchId", "==", batchId).get();
        snap.docs.forEach((d) => docs.push({ ref: d.ref, path: `${c}/${d.id}`, data: d.data() }));
      }
      const norm = (v) => String(v ?? "").replace(/\s+/g, "").toLowerCase();
      const byTab = new Map();
      for (const x of docs) {
        if (x.data._gsheetMineSent) continue; // 이미 연결됨
        const tab = gsheetMonthTabName(x.data.상차일);
        if (!tab) continue;
        if (!byTab.has(tab)) byTab.set(tab, []);
        byTab.get(tab).push(x);
      }
      const titles = new Set((await getGsheetSheetList()).map((t) => t.title));
      let linked = 0; const notFound = [];
      for (const [tab, list] of byTab) {
        if (!titles.has(tab)) { list.forEach((x) => notFound.push(`${x.data.상차일} ${x.data.거래처명 || ""}`)); continue; }
        await withGsheetTabLock(tab, async () => {
          const colMap = await ensureGsheetIdColumn(tab);
          const need = ["상차일", "거래처명", "상차지", "하차지", "오더ID"];
          if (need.some((k) => !colMap[k])) { list.forEach((x) => notFound.push(`${x.data.상차일} ${x.data.거래처명 || ""}(시트 머리줄 확인 필요)`)); return; }
          const got = await gsheetApi("GET", `/values:batchGet?${need.map((k) => `ranges=${encodeURIComponent(`${quoteTab(tab)}!${colMap[k]}2:${colMap[k]}3000`)}`).join("&")}`);
          const colVals = (got.valueRanges || []).map((r) => r.values || []);
          const n = Math.max(...colVals.map((v) => v.length), 0);
          const rows = [];
          for (let i = 0; i < n; i++) {
            const g = (k) => String(colVals[need.indexOf(k)][i]?.[0] ?? "").trim();
            rows.push({ row: i + 2, date: gsheetNormDate(g("상차일"), tab.startsWith("2") ? `20${tab.slice(0, 2)}` : ""), client: norm(g("거래처명")), pick: norm(g("상차지")), drop: norm(g("하차지")), id: g("오더ID"), used: false });
          }
          const writes = []; const ptrs = [];
          for (const x of list) {
            const d = x.data;
            const hit = rows.find((r) => !r.used && !r.id && r.date === gsheetNormDate(d.상차일) &&
              r.client === norm(d.거래처명) && r.pick === norm(d.상차지명) && r.drop === norm(d.하차지명));
            if (!hit) { notFound.push(`${d.상차일} ${d.거래처명 || ""} ${d.상차지명 || ""}→${d.하차지명 || ""}`); continue; }
            hit.used = true;
            writes.push({ range: `${quoteTab(tab)}!${colMap.오더ID}${hit.row}`, values: [[x.path]] });
            ptrs.push({ x, row: hit.row });
          }
          for (let i = 0; i < writes.length; i += 200) {
            await gsheetApi("POST", "/values:batchUpdate", { data: { valueInputOption: "RAW", data: writes.slice(i, i + 200) } });
          }
          for (let i = 0; i < ptrs.length; i += 400) {
            const wb = db.batch();
            ptrs.slice(i, i + 400).forEach(({ x, row }) => wb.update(x.ref, { _gsheetMine: true, _gsheetMineSent: true, _gsheetSync: { tab, row, doc: x.path } }));
            await wb.commit();
          }
          linked += ptrs.length;
        });
      }
      await db.collection("importBatches").doc(batchId).set({ gsheetLinked: linked, gsheetLinkedAt: FieldValue.serverTimestamp() }, { merge: true });
      res.json({ linked, notFound, total: docs.length });
      return;
    }
    if (body.action === "resend") {
      // ⭐ 날짜 재전송 — 고른 기간(상차일)의 "내 오더"를 프로그램 내용 그대로 시트에 다시 쓴다.
      //  - 시트에 그 오더 줄(오더ID)이 있으면 그 줄 전체를 덮어쓰기(수식 칸 포함 — 시트에서 잘못 지운 값도 복구)
      //  - 줄이 없으면(시트에서 지웠거나 아직 안 보냄) 그 날짜 칸 맨 위에 새로 넣기
      //  - 같은 오더 줄이 여러 개면 1줄만 남긴다 / 오더ID가 없는 줄(직접 적은 줄)은 건드리지 않는다
      const from = String(body.from || "").slice(0, 10);
      const to = String(body.to || body.from || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) { res.status(400).json({ error: "날짜를 확인해 주세요." }); return; }
      const items = [];
      for (const c of ["orders", "dispatch"]) {
        const snap = await db.collection(c).where("_gsheetMine", "==", true).get();
        snap.docs.forEach((d) => {
          const x = d.data(); const dt = String(x.상차일 || "").slice(0, 10);
          if (dt < from || dt > to || isGsheetCanceled(x)) return;
          items.push({ ref: d.ref, path: `${c}/${d.id}`, data: x });
        });
      }
      const ms = (v) => (v?.toMillis ? v.toMillis() : typeof v === "number" ? v : 0);
      items.sort((a, b) => String(a.data.상차일 || "").localeCompare(String(b.data.상차일 || "")) || ms(a.data.createdAt) - ms(b.data.createdAt));
      const byTab = new Map();
      for (const it of items) { const tab = gsheetMonthTabName(it.data.상차일); if (!tab) continue; if (!byTab.has(tab)) byTab.set(tab, []); byTab.get(tab).push(it); }
      let rewritten = 0; const missing = [];
      for (const [tab, list] of byTab) {
        await ensureGsheetMonthTab(tab);
        await withGsheetTabLock(tab, async () => {
          const colMap = await ensureGsheetIdColumn(tab);
          if (!colMap.오더ID) { missing.push(...list); return; }
          const readIds = async () => {
            const got = await gsheetApi("GET", `/values/${encodeURIComponent(`${quoteTab(tab)}!${colMap.오더ID}2:${colMap.오더ID}6000`)}`);
            const m = new Map();
            (got.values || []).forEach((v, i) => { const id = String(v?.[0] || "").trim(); if (!id) return; if (!m.has(id)) m.set(id, []); m.get(id).push(i + 2); });
            return m;
          };
          let idRows = await readIds();
          // 같은 오더 줄이 여러 개면 맨 위 1줄만 남긴다(아래 줄부터 지움)
          const dups = list.flatMap((it) => (idRows.get(it.path) || []).slice(1)).sort((a, b) => b - a);
          if (dups.length) { for (const r of dups) await removeGsheetRowUnlocked(tab, r); idRows = await readIds(); }
          const ranges = []; const ptrs = [];
          for (const it of list) {
            const row = (idRows.get(it.path) || [])[0];
            if (!row) { missing.push(it); continue; }
            ranges.push(...buildGsheetOrderRowRanges(tab, row, it.data, colMap, it.path));
            ptrs.push({ it, row });
          }
          for (let i = 0; i < ranges.length; i += 500) {
            await gsheetApi("POST", "/values:batchUpdate", { data: { valueInputOption: "USER_ENTERED", data: ranges.slice(i, i + 500) } });
          }
          await Promise.all(ptrs.map(({ it, row }) => it.ref.update({ _gsheetMineSent: true, _gsheetMineSentAt: FieldValue.serverTimestamp(), _gsheetSync: { tab, row, doc: it.path } }).catch(() => {})));
          rewritten += ptrs.length;
          const dates = [...new Set(list.map((it) => it.data.상차일))];
          await renumberGsheetDates(tab, dates).catch((e) => console.warn("순번 다시 매기기 실패:", e?.message || e));
        });
      }
      // 시트에 줄이 없던 오더는 새로 넣는다(그 날짜 칸 맨 위)
      let inserted = 0;
      if (missing.length) inserted = (await sendGsheetMineBatch(missing)).sent;
      res.json({ total: items.length, rewritten, inserted, from, to });
      return;
    }
    if (body.action === "cleanup") {
      // ⭐ 시트 정리 — 오더ID가 적혀 있는데 프로그램에는 없는(지워진) 오더의 줄을 지운다. 사람이 적은 줄(오더ID 없음)은 건드리지 않는다.
      const months = Array.isArray(body.tabs) && body.tabs.length ? body.tabs : (() => {
        const now = new Date(Date.now() + 9 * 3600e3); const prev = new Date(now); prev.setUTCDate(1); prev.setUTCMonth(prev.getUTCMonth() - 1);
        return [gsheetMonthTabName(prev.toISOString().slice(0, 10)), gsheetMonthTabName(now.toISOString().slice(0, 10))];
      })();
      const titles = new Set((await getGsheetSheetList()).map((t) => t.title));
      let removed = 0; const removedList = [];
      for (const tab of months) {
        if (!tab || !titles.has(tab)) continue;
        await withGsheetTabLock(tab, async () => {
          const colMap = await ensureGsheetIdColumn(tab);
          if (!colMap.오더ID) return;
          const got = await gsheetApi("GET", `/values/${encodeURIComponent(`${quoteTab(tab)}!${colMap.오더ID}2:${colMap.오더ID}6000`)}`);
          const ids = (got.values || []).map((v, i) => ({ row: i + 2, id: String(v?.[0] || "").trim() })).filter((x) => /^(orders|dispatch)\/[^/]+$/.test(x.id));
          if (!ids.length) return;
          const refs = [...new Set(ids.map((x) => x.id))].map((p) => db.doc(p));
          const exist = new Set();
          for (let i = 0; i < refs.length; i += 300) (await db.getAll(...refs.slice(i, i + 300))).forEach((d) => { if (d.exists) exist.add(d.ref.path); });
          // ⚠️ 프로그램에서 "삭제"한 기록(deletedOrders)이 있는 오더만 지운다 — 가져오기 취소처럼 일부러 시트 줄을 남긴 경우는 건드리지 않는다
          const missing = [...new Set(ids.filter((x) => !exist.has(x.id)).map((x) => x.id))];
          const deletedLogged = new Set();
          const logRefs = missing.map((p) => db.collection("deletedOrders").doc(p.replace("/", "_")));
          for (let i = 0; i < logRefs.length; i += 300) (await db.getAll(...logRefs.slice(i, i + 300))).forEach((d, k) => { if (d.exists) deletedLogged.add(missing[i + k]); });
          const orphan = ids.filter((x) => deletedLogged.has(x.id)).sort((a, b) => b.row - a.row);
          for (const x of orphan) { await removeGsheetRowUnlocked(tab, x.row); removed += 1; removedList.push(`${tab} ${x.id}`); }
        });
      }
      res.json({ removed, removedList, tabs: months });
      return;
    }
    if (body.action === "send") {
      // 전송 대기 오더를 한 번에 시트로 — 날짜 순, 같은 날짜는 먼저 등록한 것부터 넣는다(새 오더가 그날 맨 위에 쌓이므로
      // 결과적으로 프로그램 화면처럼 최근 등록이 위). 한 건씩 차례로 처리해야 줄 위치가 꼬이지 않는다.
      const pend = [];
      for (const c of ["orders", "dispatch"]) {
        const snap = await db.collection(c).where("_gsheetMine", "==", true).get();
        snap.docs.forEach((d) => {
          const x = d.data();
          if (x._gsheetMineSent || [d.id, `${c}/${d.id}`].includes(x._gsheetSync?.doc)) return;
          pend.push({ ref: d.ref, path: `${c}/${d.id}`, data: x });
        });
      }
      const ms = (v) => (v?.toMillis ? v.toMillis() : typeof v === "number" ? v : 0);
      pend.sort((a, b) => String(a.data.상차일 || "").localeCompare(String(b.data.상차일 || "")) || ms(a.data.createdAt) - ms(b.data.createdAt));
      let sent = 0; const failed = [];
      try {
        sent = (await sendGsheetMineBatch(pend)).sent;
      } catch (e) {
        console.error("구글시트 한 번에 보내기 실패:", e);
        failed.push(String(e?.message || e)); // 표시가 안 달린 오더는 대기로 남아 다시 누르면 재시도
      }
      _gsheetMineCache = { at: 0, v: null };
      res.json({ sent, failed, total: pend.length });
      return;
    }
    if (body.action === "enable") {
      const email = String(body.email || "").trim();
      if (!email) { res.status(400).json({ error: "보낼 계정(이메일)을 입력하세요." }); return; }
      await GSHEET_MINE_DOC.set({ enabled: true, email, since: FieldValue.serverTimestamp(), updatedBy: me.email || "" });
    } else if (body.action === "disable") {
      await GSHEET_MINE_DOC.set({ enabled: false, updatedBy: me.email || "" }, { merge: true });
    }
    _gsheetMineCache = { at: 0, v: null };
    const snap = await GSHEET_MINE_DOC.get();
    // 시트 접근 확인(서비스계정이 시트 편집자로 공유돼 있어야 한다)
    let sheetOk = true; let sheetError = "";
    try { await getGsheetSheetList(); } catch (e) { sheetOk = false; sheetError = String(e?.response?.data?.error?.message || e?.message || e); }
    res.json({ ...toJson(snap.exists ? snap.data() : null), sheetOk, sheetError, sheetUrl: `https://docs.google.com/spreadsheets/d/${GSHEET_SPREADSHEET_ID}/edit` });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || String(e) });
  }
});

// 🔎 그림 글자 읽기(최고관리자 전용, 2026-11-03) — 시트에 캡처 그림으로 붙여 둔 표(오더표·발주서)를 읽는다.
//  화면(상하차지·기사 가져오기 › 엑셀 파일)이 .xlsx 속 그림을 꺼내 1장씩 보내면 Google Vision(DOCUMENT_TEXT_DETECTION)으로
//  단어와 위치를 돌려준다. 줄·칸 맞추기와 업체명·주소·담당자·전화번호 나누기는 화면에서 한다.
//  ⚠️ 구글 클라우드 콘솔에서 이 프로젝트의 "Cloud Vision API"를 사용 설정해야 한다(매달 1,000장 무료).
let _visionClient = null;
exports.sheetOcr = functions.runWith({ timeoutSeconds: 120, memory: "512MB" }).https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    await requireTotalMaster(req);
    const content = String(body.image || "").replace(/^data:[^,]+,/, "");
    if (!content || content.length > 9 * 1024 * 1024) { res.status(400).json({ error: "그림이 없거나 너무 큽니다." }); return; }
    if (!_visionClient) _visionClient = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient();
    let data;
    try {
      const r = await _visionClient.request({
        url: "https://vision.googleapis.com/v1/images:annotate", method: "POST",
        data: { requests: [{ image: { content }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }], imageContext: { languageHints: ["ko", "en"] } }] },
      });
      data = r.data;
      bumpVisionCount(); // 💰 2026-11-04 비용·손익 — 글자 인식 호출 수(월 1,000건 무료 넘으면 과금)
    } catch (e) {
      const msg = String(e?.response?.data?.error?.message || e?.message || e);
      if (/has not been used|is disabled|SERVICE_DISABLED|PERMISSION_DENIED/i.test(msg)) {
        res.status(400).json({ error: "구글 글자 인식(Cloud Vision API)이 꺼져 있습니다. 구글 클라우드 콘솔에서 이 프로젝트의 Cloud Vision API를 '사용'으로 켜 주세요.", detail: msg });
        return;
      }
      throw e;
    }
    const a = data?.responses?.[0] || {};
    if (a.error) { res.status(400).json({ error: a.error.message || "글자 인식 실패" }); return; }
    // 단어 + 위치(왼쪽 위 x0,y0 / 오른쪽 아래 x1,y1)
    const words = [];
    (a.fullTextAnnotation?.pages || []).forEach((pg) => (pg.blocks || []).forEach((b) => (b.paragraphs || []).forEach((pa) => (pa.words || []).forEach((w) => {
      const t = (w.symbols || []).map((x) => x.text).join("");
      const v = w.boundingBox?.vertices || [];
      const xs = v.map((p) => p.x || 0); const ys = v.map((p) => p.y || 0);
      if (t && xs.length) words.push({ t, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
    }))));
    res.json({ words });
  } catch (e) {
    console.error("그림 글자 읽기 오류:", e?.response?.data || e);
    res.status(e.status || 500).json({ error: e?.message || String(e) });
  }
});

// 📋 2026-11-03 배차표 ↔ 구글시트 자동 연동(10분마다) — 규칙은 functions/routeBoardSync.js 맨 위 설명
const { syncBoard: _syncBoard } = require("./routeBoardSync");
// 💰 2026-11-06 바뀌었을 때만 읽기 — 시트 값을 통째로 읽기 전에 Drive files.get(fields=modifiedTime) 1번으로 "시트가 바뀌었나"만 본다
//  · 바뀐 게 없고(마지막으로 맞춘 뒤 modifiedTime 그대로) · 프로그램에서 추가해 시트에 아직 안 넣은 줄도 없고 · 1시간 안에 전체 맞춤을 했으면 → 건너뜀
//  · 1시간마다 한 번은 무조건 전체 맞춤(안전장치) · 화면에서 고친 내용은 그 자리에서 바로 맞춤(action sync, auto 아님)을 불러 시트에 쓴다
//  · Drive API를 못 쓰면(꺼져 있음·권한 없음) 예전처럼 매번 전체 맞춤(30분 동안 다시 묻지 않음)
const DRIVE_META_SCOPES = ["https://www.googleapis.com/auth/drive.metadata.readonly"];
const ROUTE_FULL_SYNC_MS = 60 * 60 * 1000;
let _driveMetaClient = null;
let _driveMetaOffUntil = 0;
async function sheetModifiedTime(sid) {
  if (!sid || Date.now() < _driveMetaOffUntil) return "";
  try {
    if (!_driveMetaClient) _driveMetaClient = await new GoogleAuth({ scopes: DRIVE_META_SCOPES }).getClient();
    const r = await _driveMetaClient.request({ url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sid)}?fields=modifiedTime&supportsAllDrives=true`, method: "GET" });
    return String(r?.data?.modifiedTime || "");
  } catch (e) {
    const st = e?.response?.status;
    if (st === 403 || st === 401) _driveMetaOffUntil = Date.now() + 30 * 60 * 1000;
    console.warn(`[배차표 연동] 시트 수정시각 확인 실패(${st || "-"}) — 전체 맞춤으로`, e?.message || e);
    return "";
  }
}
// 이번에 시트 값을 읽어야 하나? → { need, mt, reason }
const fs0Ref = (boardId) => db.collection("routeBoards").doc(String(boardId));
async function routeBoardNeedsSync(form, sid) {
  const mt = await sheetModifiedTime(sid);
  if (!mt) return { need: true, mt: "", reason: "no-meta" };
  if (mt !== String(form.sheetModifiedTime || "")) return { need: true, mt, reason: "sheet-changed" };
  if (Date.now() - Number(form.fullSyncAt || 0) >= ROUTE_FULL_SYNC_MS) return { need: true, mt, reason: "hourly" };
  if (Number(form.pushWantedAt || 0) > Number(form.fullSyncAt || 0)) return { need: true, mt, reason: "program-edit" };
  try {
    const pend = await db.collection("orders").where("배차표Id", "==", form.id).where("companyName", "==", form.companyName || "").where("시트추가대기", "==", true).limit(1).get();
    if (!pend.empty) return { need: true, mt, reason: "pending-add" };
  } catch (e) { return { need: true, mt, reason: "pending-check-failed" }; }
  return { need: false, mt, reason: "unchanged" };
}
async function runRouteBoardSync(form, { force = false, range = null, mt: mt0 = null } = {}) {
  const sid = parseSpreadsheetId(form.sheetUrl);
  if (!sid) return { skipped: "no-sheet" };
  const before = mt0 != null ? mt0 : await sheetModifiedTime(sid);
  const r = await runRouteBoardSyncRaw(form, sid, { force, range });
  // 우리가 시트에 쓴 경우(칸 쓰기·줄 끼우기)엔 modifiedTime이 바뀌었으니 다시 받아 둔다(다음 확인이 "바뀜"으로 헛돌지 않게)
  const after = (r && (r.pushed || r.appended)) ? await sheetModifiedTime(sid) : before;
  await db.collection("routeBoards").doc(form.id).set({ sheetModifiedTime: after || "", fullSyncAt: Date.now(), syncCheckedAt: Date.now() }, { merge: true }).catch(() => {});
  return r;
}
async function runRouteBoardSyncRaw(form, sid, { force = false, range = null } = {}) {
  const tabIds = {};
  return _syncBoard({
    db, FieldValue, form: force ? { ...form, syncHash: {} } : form, range,
    readTabs: async () => { const sh = ((await sheetsApiFor(sid, "GET", "?fields=sheets.properties(sheetId,title,index)")).sheets || []).map((x) => x.properties); sh.forEach((t) => { tabIds[t.title] = t.sheetId; }); return sh.map((t) => t.title); },
    // ⭐ 2026-11-03 프로그램에서 추가한 오더 → 그 묶음 표 아래에 새 줄 끼워 넣기(서식은 윗줄 따라감)
    insertRows: async (tab, at, n) => {
      if (tabIds[tab] == null) throw new Error("탭 번호를 찾지 못했습니다.");
      await sheetsApiFor(sid, "POST", ":batchUpdate", { data: { requests: [{ insertDimension: { range: { sheetId: tabIds[tab], dimension: "ROWS", startIndex: at, endIndex: at + n }, inheritFromBefore: true } }] } });
    },
    readTab: async (tab) => (await sheetsApiFor(sid, "GET", `/values/${encodeURIComponent(`${quoteTab(tab)}!A1:AZ3000`)}?valueRenderOption=FORMATTED_VALUE`)).values || [],
    // ⭐ 양방향 — 프로그램에서 바뀐 칸을 시트에 써 준다(시트를 '편집자'로 공유해야 함 · 못 쓰면 기록만)
    writeCells: async (tab, ups) => {
      try {
        await sheetsApiFor(sid, "POST", "/values:batchUpdate", { data: { valueInputOption: "USER_ENTERED", data: ups.slice(0, 2000).map((u) => ({ range: `${quoteTab(tab)}!${u.a1}`, values: [[String(u.value ?? "")]] })) } });
      } catch (e) { console.warn(`[배차표 연동] 시트 쓰기 실패(편집자 공유 확인) ${form.name} ${tab}:`, e?.message || e); }
    },
  });
}
exports.syncRouteBoards = functions.runWith({ timeoutSeconds: 300, memory: "512MB" }).pubsub.schedule("every 5 minutes").timeZone("Asia/Seoul").onRun(async () => {
  const snap = await db.collection("routeBoards").get();
  for (const d of snap.docs) {
    const form = { id: d.id, ...d.data() };
    if (!form.sheetUrl || form.autoSync === false) continue;
    // 💰 2026-11-04 서버 비용 — 열려 있는 화면이 4분 안에 이미 맞췄으면 이번 5분 차례는 건너뜀(같은 시트·오더를 또 읽지 않게)
    if (Date.now() - Number(form.syncedAt || 0) < 4 * 60 * 1000) continue;
    try {
      // 💰 2026-11-06 시트가 안 바뀌었으면(Drive modifiedTime) 값 읽기 없이 건너뜀 · 1시간마다 한 번은 전체
      const chk = await routeBoardNeedsSync(form, parseSpreadsheetId(form.sheetUrl));
      if (!chk.need) { await d.ref.set({ syncCheckedAt: Date.now() }, { merge: true }).catch(() => {}); continue; }
      const r = await runRouteBoardSync(form, { mt: chk.mt }); if (r.created || r.updated || r.gone || r.deleted) console.log(`[배차표 연동] ${form.companyName} ${form.name} (${chk.reason})`, JSON.stringify(r)); }
    catch (e) { console.error(`[배차표 연동 실패] ${form.companyName} ${form.name}:`, e?.message || e); }
  }
  return null;
});

// 📋 배차표(고정노선 › 배차표) — 화주사 구글시트의 날짜 탭 읽기 (직원 누구나, 2026-11-02)
//  시트를 dispatch-app-9b92f@appspot.gserviceaccount.com 에 '뷰어'로 공유해야 읽힌다.
//  - tabs: 탭 이름 목록(최근 탭이 보통 뒤에 있음)
//  - read: 탭 하나의 값(2차원 배열, 최대 3000줄) — 칸 맞추기·묶음 나누기는 화면에서
//  - write: 배차표 값을 시트 칸에 쓰기(시트를 '편집자'로 공유해야 함)
exports.routeBoardSheet = functions.runWith({ timeoutSeconds: 540, memory: "512MB" }).https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const me = await requireStaff(req, body);
    // ⭐ 2026-11-06 sync는 양식(boardId)만으로도 — 시트 주소는 양식에 저장된 것을 쓴다(화면에서 고친 뒤 바로 시트에 쓰기)
    let syncForm = null;
    if (body.action === "sync" && !body.url && body.boardId) {
      const fs0 = await db.collection("routeBoards").doc(String(body.boardId)).get();
      if (fs0.exists) { syncForm = { id: fs0.id, ...fs0.data() }; body.url = syncForm.sheetUrl || ""; }
    }
    const id = parseSpreadsheetId(body.url);
    if (!id) { res.status(400).json({ error: "구글시트 주소가 올바르지 않습니다." }); return; }
    // 💰 2026-11-06 시트 정보(탭 목록)는 필요한 작업에서만 읽는다 — 예전엔 30초 자동 맞춤(건너뛰는 경우 포함)마다 Sheets API를 1번씩 불렀다
    let _meta = null;
    const getMeta = async () => (_meta || (_meta = await sheetsApiFor(id, "GET", "?fields=properties.title,sheets.properties(title,index)")));
    const tabsOf = (m) => (m.sheets || []).map((x) => x.properties).sort((a, b) => a.index - b.index).map((t) => t.title);
    // 💰 2026-11-06 read + ifChanged(지난번 modifiedTime) — 시트가 그대로면 값을 읽지 않고 unchanged만 돌려준다(배차표 화면 1분 확인)
    if (body.action === "read" && body.ifChanged) {
      const mt = await sheetModifiedTime(id);
      if (mt && mt === String(body.ifChanged)) { res.json({ unchanged: true, modifiedTime: mt }); return; }
      body._mt = mt;
    }
    if (body.action === "tabs") { const meta = await getMeta(); res.json({ title: meta.properties?.title || "", tabs: tabsOf(meta) }); return; }
    // ⭐ 2026-11-03 sync: 이 양식의 시트를 지금 바로 맞춤(새 줄·새 날짜 탭 → 오더 생성, 화주 칸 반영, 지워진 줄 표시)
    if (body.action === "sync") {
      let form = syncForm;
      if (!form) {
        const fs = await db.collection("routeBoards").doc(String(body.boardId || "x")).get();
        if (!fs.exists) { res.status(404).json({ error: "양식을 찾을 수 없습니다." }); return; }
        form = { id: fs.id, ...fs.data() };
      }
      if (!me.isTM && form.companyName !== me.company) { res.status(403).json({ error: "다른 회사 양식입니다." }); return; }
      if (parseSpreadsheetId(form.sheetUrl) !== id) { res.status(400).json({ error: "양식에 저장된 시트 주소와 다릅니다." }); return; }
      // 💰 2026-11-04 서버 비용 — 화면의 자동 맞춤(auto)은 다른 화면·서버가 25초 안에 이미 맞췄으면 건너뜀(직원 수만큼 겹치던 읽기 제거)
      if (body.auto === true && !body.from && Date.now() - Number(form.syncedAt || 0) < 25 * 1000) { res.json({ skipped: "recent", syncedAt: Number(form.syncedAt || 0) }); return; }
      // 💰 2026-11-06 자동 맞춤(auto)은 시트가 바뀌었을 때만(Drive modifiedTime) · 다른 화면이 25초 안에 확인했으면 그 결과를 그대로
      if (body.auto === true && !body.from) {
        if (Date.now() - Number(form.syncCheckedAt || 0) < 25 * 1000 && Number(form.syncCheckedAt || 0) > Number(form.pushWantedAt || 0)) { res.json({ skipped: "unchanged", checkedAt: Number(form.syncCheckedAt || 0) }); return; }
        const chk = await routeBoardNeedsSync(form, id);
        if (!chk.need) { await fs0Ref(form.id).set({ syncCheckedAt: Date.now() }, { merge: true }).catch(() => {}); res.json({ skipped: "unchanged", checkedAt: Date.now() }); return; }
        res.json({ ...(await runRouteBoardSync(form, { mt: chk.mt })), reason: chk.reason });
        return;
      }
      // ⭐ 2026-11-03 기간 가져오기(입고일=탭 날짜 기준, 최대 120일)
      const okD = (x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ""));
      let range = null;
      if (okD(body.from) && okD(body.to)) {
        const [a, b] = body.from <= body.to ? [body.from, body.to] : [body.to, body.from];
        if ((Date.parse(b) - Date.parse(a)) / 864e5 > 120) { res.status(400).json({ error: "기간은 120일까지 한 번에 가져올 수 있습니다." }); return; }
        range = { from: a, to: b };
      }
      res.json(await runRouteBoardSync(form, { force: true, range }));
      return;
    }
    if (body.action === "read") {
      const tab = String(body.tab || "");
      const meta = await getMeta(); const tabs = tabsOf(meta);
      if (!tabs.includes(tab)) { res.status(400).json({ error: "탭을 찾을 수 없습니다." }); return; }
      const got = await sheetsApiFor(id, "GET", `/values/${encodeURIComponent(`${quoteTab(tab)}!A1:AZ3000`)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
      console.log(`[배차표 시트] ${me.company} ${me.email} ${id} ${tab}`);
      res.json({ title: meta.properties?.title || "", tab, rows: got.values || [], ...(body._mt ? { modifiedTime: body._mt } : {}) }); // ⭐ 2026-11-06 다음 확인 때 ifChanged로
      return;
    }
    // ⭐ write: 배차표 → 시트(화면이 정한 칸만 — 차량·기사·수량·운송업체·시간·비고). 도착지·시군구·합계 칸은 화면에서 빼고 보낸다.
    if (body.action === "write") {
      const tab = String(body.tab || "");
      const tabs = tabsOf(await getMeta());
      if (!tabs.includes(tab)) { res.status(400).json({ error: "탭을 찾을 수 없습니다." }); return; }
      const ups = (Array.isArray(body.updates) ? body.updates : []).filter((u) => /^[A-Z]{1,3}\d{1,5}$/.test(String(u?.a1 || ""))).slice(0, 3000);
      if (!ups.length) { res.json({ updated: 0 }); return; }
      try {
        await sheetsApiFor(id, "POST", "/values:batchUpdate", { data: {
          valueInputOption: "USER_ENTERED",
          data: ups.map((u) => ({ range: `${quoteTab(tab)}!${u.a1}`, values: [[String(u.value ?? "")]] })),
        } });
      } catch (e) {
        if (e.status === 400) throw Object.assign(new Error("시트에 쓸 수 없습니다. 시트 공유에 dispatch-app-9b92f@appspot.gserviceaccount.com 을(를) '편집자'로 추가했는지 확인해 주세요."), { status: 400 });
        throw e;
      }
      console.log(`[배차표 시트 쓰기] ${me.company} ${me.email} ${id} ${tab} ${ups.length}칸`);
      res.json({ updated: ups.length });
      return;
    }
    res.status(400).json({ error: "알 수 없는 요청입니다." });
  } catch (e) {
    res.status(e.status || 500).json({ error: e?.message || String(e) });
  }
});

exports.sheetImport = functions
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    try {
      const me = await requireTotalMaster(req);
      const action = body.action;

      if (action === "inspect" || action === "read") {
        const id = parseSpreadsheetId(body.url);
        if (!id) { res.status(400).json({ error: "구글시트 주소가 올바르지 않습니다." }); return; }
        const meta = await sheetsApiFor(id, "GET", "?fields=properties.title,sheets.properties(title,index,gridProperties(rowCount,columnCount))");
        const allTabs = (meta.sheets || []).map((s) => s.properties).sort((a, b) => a.index - b.index);
        if (action === "inspect") {
          const ranges = allTabs.map((t) => `${quoteTab(t.title)}!1:6`);
          const got = ranges.length
            ? await sheetsApiFor(id, "GET", `/values:batchGet?${ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&")}&valueRenderOption=FORMATTED_VALUE`)
            : { valueRanges: [] };
          const tabs = allTabs.map((t, i) => {
            const rows = got.valueRanges?.[i]?.values || [];
            let headerRow = 0, best = -1;
            rows.forEach((r, ri) => {
              const n = r.filter((c) => String(c || "").trim() && !/^[\d,.\-\s:/]+$/.test(String(c))).length;
              if (n > best) { best = n; headerRow = ri; }
            });
            return { title: t.title, rowCount: t.gridProperties?.rowCount || 0, headerRow, header: (rows[headerRow] || []).map((c) => String(c || "").trim()) };
          });
          res.json({ title: meta.properties?.title || "", tabs });
          return;
        }
        const want = Array.isArray(body.tabs) ? body.tabs : [];
        const valid = want.filter((w) => allTabs.some((t) => t.title === w.title));
        if (!valid.length) { res.status(400).json({ error: "가져올 탭을 골라주세요." }); return; }
        const got = await sheetsApiFor(id, "GET",
          `/values:batchGet?${valid.map((w) => `ranges=${encodeURIComponent(quoteTab(w.title))}`).join("&")}&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
        res.json({
          title: meta.properties?.title || "",
          tabs: valid.map((w, i) => {
            const rows = got.valueRanges?.[i]?.values || [];
            const hr = Math.max(0, Number(w.headerRow) || 0);
            return { title: w.title, header: (rows[hr] || []).map((c) => String(c || "").trim()), rows: rows.slice(hr + 1) };
          }),
        });
        return;
      }

      if (action === "cancel") {
        const batchId = String(body.batchId || "");
        const bref = db.collection("importBatches").doc(batchId || "x");
        const bs = await bref.get();
        if (!bs.exists) { res.status(404).json({ error: "가져오기 기록을 찾을 수 없습니다." }); return; }
        const b = bs.data();
        if (b.status === "canceled") { res.status(400).json({ error: "이미 취소된 가져오기입니다." }); return; }
        await setBulkMode(b.companyName, true);
        let removed = 0;
        try {
          // ⭐ 시트와 연결된 오더는 먼저 "시트 줄은 남김" 표시를 단 뒤 지운다(가져오기 취소가 시트의 수기 줄까지 지우지 않게)
          for (const col of ["orders", "dispatch"]) {
            const linked = await db.collection(col).where("importBatchId", "==", batchId).where("_gsheetMine", "==", true).get();
            for (let i = 0; i < linked.docs.length; i += 400) {
              const wb = db.batch();
              linked.docs.slice(i, i + 400).forEach((d) => wb.update(d.ref, { _gsheetKeepRow: true }));
              await wb.commit();
            }
          }
          const writer = db.bulkWriter();
          for (const col of ["orders", "dispatch", "clients", "places", "drivers"]) {
            const snap = await db.collection(col).where("importBatchId", "==", batchId).get();
            snap.docs.forEach((d) => { writer.delete(d.ref); removed += 1; });
          }
          await writer.close();
        } finally {
          await setBulkMode(b.companyName, false);
        }
        await bumpDataVersion(b.companyName);
        await bref.set({ status: "canceled", canceledAt: FieldValue.serverTimestamp(), canceledBy: me.email || me.uid, removed }, { merge: true });
        res.json({ ok: true, removed });
        return;
      }

      res.status(400).json({ error: "알 수 없는 요청입니다." });
    } catch (e) {
      console.error("구글시트 가져오기 오류:", e);
      res.status(e.status || 500).json({ error: e?.message || String(e) });
    }
  });

// ===================== 🛰 플랫폼 관제(최고관리자 전용, 2026-10-28) =====================
// 이 프로그램에 가입한 운송사·화주사별 사용량(계정·접속·오더·데이터량)을 한 번에 모아
// siteConfig/platformStats 한 문서에 저장한다. 화면은 이 문서만 읽는다(읽기 비용 최소화).
//  - 매일 새벽 4시(hourlyJobs)에 자동 갱신 + 관리센터의 "지금 갱신" 버튼(10분에 1번까지)
// ⭐ 2026-11-02 관리자센터 — 06~23시 매시간 갱신(full=false면 데이터량 count는 지난 값 재사용), 접속은 "사람(uid)" 기준으로 센다
async function computePlatformStats({ full = true } = {}) {
  const today = kstDateStr();
  const month = today.slice(0, 7);
  const pmDate = new Date(`${month}-01T00:00:00Z`); pmDate.setUTCMonth(pmDate.getUTCMonth() - 1);
  const prevMonth = pmDate.toISOString().slice(0, 7);
  const d30 = addDaysStr(today, -29);
  const from = `${prevMonth}-01` < d30 ? `${prevMonth}-01` : d30;
  const companies = {};
  const co = (name) => {
    const k = String(name || "돌캐").trim() || "돌캐";
    if (!companies[k]) companies[k] = {
      name: k, kind: "transport", staff: 0, admins: 0, drivers: 0, shippers: 0, pending: 0, quit: 0,
      online: 0, onlineNow: 0, onlinePc: 0, onlineMobile: 0, lastSeen: 0,
      m: { cnt: 0, sale: 0, profit: 0 }, pm: { cnt: 0, sale: 0, profit: 0 }, pmSame: { cnt: 0, sale: 0 },
      daily: {}, lastOrder: "", totalOrders: 0, places: 0, clients: 0, fleet: 0, appliedAt: 0, code: "", rep: "", phone: "", linked: "",
    };
    return companies[k];
  };
  const tsMs = (t) => (t?.toMillis ? t.toMillis() : t?._seconds ? t._seconds * 1000 : t?.seconds ? t.seconds * 1000 : 0);

  // 1) 가입 신청(운송사·화주사) — 회사 기본정보
  const [tApps, sApps] = await Promise.all([db.collection("transportApplications").get(), db.collection("companyApplications").get()]);
  tApps.docs.forEach((d) => {
    const a = d.data() || {};
    if (!a.companyName || a.status === "rejected") return;
    const c = co(a.companyName);
    c.kind = "transport"; c.appliedAt = c.appliedAt || tsMs(a.createdAt); c.code = c.code || a.companyCode || "";
    c.rep = c.rep || a.name || a.representative || ""; c.phone = c.phone || a.phone || a.phoneNumber || ""; c.appStatus = a.status || "pending";
  });
  const shippers = {};
  sApps.docs.forEach((d) => {
    const a = d.data() || {};
    if (!a.companyName || a.status === "rejected") return;
    const k = String(a.companyName).trim();
    shippers[k] = {
      name: k, kind: "shipper", appliedAt: tsMs(a.createdAt), status: a.status || "pending", code: a.companyCode || "",
      linked: a.linkedTransportCompany?.companyName || "", linkStatus: a.transportApprovalStatus || "", rep: a.name || "", phone: a.phone || a.phoneNumber || "",
      users: 0, online: 0, onlineNow: 0, lastSeen: 0,
    };
  });

  // 2) 계정
  const users = await db.collection("users").get();
  const userCompany = {};
  users.docs.forEach((d) => {
    const u = d.data() || {};
    if (u.role === "totalMaster" || u.email === "tjddnqkf@naver.com" || u.role === "cafeUser") return;
    userCompany[d.id] = String(u.companyName || "").trim() || "돌캐"; // ⭐ 2026-11-02 관리자센터 — 회사명 앞뒤 공백 제거
    if (u.role === "shipper") {
      const k = String(u.companyName || "").trim();
      if (shippers[k]) shippers[k].users += 1;
      else if (k) shippers[k] = { name: k, kind: "shipper", appliedAt: 0, status: "approved", linked: "", users: 1, online: 0, onlineNow: 0, lastSeen: 0 };
      return;
    }
    const c = co(u.companyName);
    if (u.role === "driver") { c.drivers += 1; return; }
    if (u.employmentStatus === "퇴사") { c.quit += 1; return; } // ⭐ 2026-11-02 관리자센터 — 퇴사자는 직원 수에서 뺀다
    c.staff += 1;
    if (u.role === "admin") c.admins += 1;
    if (u.approved === false) c.pending += 1;
  });

  // 3) 접속(로그인 세션)
  // ⭐ 2026-11-02 관리자센터 — 예전에는 세션 "문서"(기기, 오래된 기기 포함)를 셌다 → 한 사람이 PC·폰·예전 브라우저로 3명처럼 보였다.
  //   이제 사람(uid) 기준: onlineNow = 10분 안에 활동, online = 24시간 안에 활동, PC/모바일은 그 종류로 접속한 사람 수
  const sess = await db.collection("loginSessions").where("active", "==", true).get();
  const now = Date.now();
  const dayAgo = now - 86400000;
  const nowAgo = now - 10 * 60 * 1000;
  const sets = {}; // 회사/화주사 키 → { day, now, pc, mobile } (uid Set)
  const setOf = (key) => sets[key] || (sets[key] = { day: new Set(), now: new Set(), pc: new Set(), mobile: new Set() });
  sess.docs.forEach((d) => {
    const s = d.data() || {};
    if (s.role === "totalMaster" || s.email === "tjddnqkf@naver.com") return;
    const seen = Math.max(tsMs(s.lastSeen), tsMs(s.createdAt));
    const uid = s.uid || d.id;
    const k = String(userCompany[s.uid] || s.companyName || "").trim();
    let key;
    if (s.role === "shipper" && shippers[k]) { shippers[k].lastSeen = Math.max(shippers[k].lastSeen, seen); key = `S:${k}`; }
    else {
      if (!k) return;
      const c = co(k);
      c.lastSeen = Math.max(c.lastSeen, seen);
      key = `C:${c.name}`;
    }
    const st = setOf(key);
    if (seen > dayAgo) { st.day.add(uid); (s.kind === "mobile" ? st.mobile : st.pc).add(uid); }
    if (seen > nowAgo) st.now.add(uid);
  });
  Object.entries(sets).forEach(([key, st]) => {
    const name = key.slice(2);
    const t = key[0] === "S" ? shippers[name] : companies[name];
    if (!t) return;
    t.online = st.day.size; t.onlineNow = st.now.size;
    if (key[0] === "C") { t.onlinePc = st.pc.size; t.onlineMobile = st.mobile.size; }
  });

  // 4) 오더(이번 달·전월·최근 30일) — 필요한 칸만 읽는다
  // 💰 2026-11-04 서버 비용 절감 — 회사·날짜별 묶음(건수·매출·이익·고정노선)으로 모은 뒤 더한다(숫자 기준은 예전과 같음).
  //   새벽 4시 전체 집계(full)가 "그제 이전" 묶음을 siteConfig/platformStatsBase에 저장해 두고,
  //   낮 시간 매시간 집계는 그 묶음을 다시 쓰고 최근 3일(그제~오늘)+미래 예약 오더만 새로 읽는다.
  //   예전: 매시간 전월 1일부터 모든 오더를 다시 읽음(하루 19번) → 오더 읽기 약 85~90% 감소.
  //   (그제 이전 날짜의 오더를 낮에 고치면 다음 날 새벽 4시 집계부터 반영 — [지금 갱신]은 항상 전체 집계)
  const platformDaily = {};
  const dayNo = Number(today.slice(8));
  const cut = addDaysStr(today, -2);
  const buckets = {};
  const addB = (name, day, cnt, sale, profit, fixed) => {
    const k = String(name || "돌캐").trim() || "돌캐";
    const b = buckets[k] || (buckets[k] = {});
    const x = b[day] || (b[day] = [0, 0, 0, 0]);
    x[0] += cnt; x[1] += sale; x[2] += profit; x[3] += fixed;
  };
  const baseRef = db.collection("siteConfig").doc("platformStatsBase");
  let readFrom = from; let reused = false;
  if (!full) {
    const bs = await baseRef.get().catch(() => null);
    const b = bs && bs.exists ? bs.data() : null;
    if (b && b.today === today && b.from === from && b.cut === cut && Array.isArray(b.cos)) {
      b.cos.forEach((c) => Object.entries(c.d || {}).forEach(([day, v]) => addB(c.n, day, Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0, Number(v[3]) || 0)));
      readFrom = cut; reused = true;
    }
  }
  for (const col of ["orders", "dispatch"]) {
    const snap = await db.collection(col).where("상차일", ">=", readFrom).select("companyName", "상차일", "청구운임", "기사운임", "배차상태", "상태", "source", "배차표Id").get();
    snap.docs.forEach((d) => {
      const r = d.data() || {};
      if (r.source === "transport_transmit" || isCanceledOrder(r)) return;
      const day = String(r.상차일 || "").slice(0, 10);
      if (!day || day > addDaysStr(today, 60) || day < readFrom) return;
      const sale = Number(String(r.청구운임 || 0).replace(/[^\d-]/g, "")) || 0;
      const profit = sale - (Number(String(r.기사운임 || 0).replace(/[^\d-]/g, "")) || 0);
      addB(r.companyName, day, 1, sale, profit, r.배차표Id ? 1 : 0);
    });
  }
  Object.entries(buckets).forEach(([name, days]) => {
    const c = co(name);
    Object.entries(days).forEach(([day, v]) => {
      const [cnt, sale, profit, fixed] = v;
      if (day.startsWith(month)) {
        c.m.cnt += cnt; c.m.sale += sale; c.m.profit += profit;
        // ⭐ 2026-11-03 사용량·한도 — 오늘까지(미래 예약 제외) · 고정노선(구글시트 배차표) 건수 따로
        if (day <= today) c.m.toDate = (c.m.toDate || 0) + cnt;
        if (fixed) c.m.fixed = (c.m.fixed || 0) + fixed;
      }
      else if (day.startsWith(prevMonth)) {
        c.pm.cnt += cnt; c.pm.sale += sale; c.pm.profit += profit;
        if (Number(day.slice(8)) <= dayNo) { c.pmSame.cnt += cnt; c.pmSame.sale += sale; }
      }
      if (day >= d30 && day <= today) {
        c.daily[day] = (c.daily[day] || 0) + cnt;
        const p = platformDaily[day] || (platformDaily[day] = { cnt: 0, sale: 0 });
        p.cnt += cnt; p.sale += sale;
      }
      if (day <= today && day > c.lastOrder) c.lastOrder = day;
    });
  });
  if (!reused) {
    const cos = Object.entries(buckets).map(([n, days]) => ({ n, d: Object.fromEntries(Object.entries(days).filter(([day]) => day < cut)) })).filter((x) => Object.keys(x.d).length);
    if (JSON.stringify(cos).length < 900000) await baseRef.set({ today, from, cut, cos, at: Date.now() }).catch((e) => console.warn("[플랫폼 관제] 묶음 저장 실패:", e?.message || e));
  }

  // 5) 데이터량(문서 수) — 회사별 count 집계(문서 1천 개당 읽기 1회)
  // ⭐ 2026-11-02 관리자센터 — 매시간 집계(full=false)일 때는 지난 집계의 데이터량을 그대로 쓰고, 처음 보는 회사만 센다
  let names = Object.keys(companies);
  if (!full) {
    const prevDoc = await db.collection("siteConfig").doc("platformStats").get().catch(() => null);
    const prevMap = {};
    ((prevDoc && prevDoc.exists && prevDoc.data().companies) || []).forEach((p) => { if (p && p.name) prevMap[p.name] = p; });
    names = names.filter((n) => {
      const p = prevMap[n];
      if (!p) return true;
      const c = companies[n];
      c.totalOrders = Number(p.totalOrders || 0); c.places = Number(p.places || 0); c.clients = Number(p.clients || 0); c.fleet = Number(p.fleet || 0);
      c.fleetJ = Number(p.fleetJ || 0); c.storageKB = Number(p.storageKB || 0); c.storageFiles = Number(p.storageFiles || 0); c.storageAt = Number(p.storageAt || 0); // ⭐ 2026-11-03 사용량·한도
      return false;
    });
  }
  const countOf = async (col, name) => {
    try { const r = await db.collection(col).where("companyName", "==", name).count().get(); return r.data().count || 0; } catch { return 0; }
  };
  for (let i = 0; i < names.length; i += 5) {
    await Promise.all(names.slice(i, i + 5).map(async (n) => {
      const c = companies[n];
      const [o1, o2, pl, cl, fl] = await Promise.all([countOf("orders", n), countOf("dispatch", n), countOf("places", n), countOf("clients", n), countOf("drivers", n)]);
      c.totalOrders = o1 + o2; c.places = pl; c.clients = cl; c.fleet = fl;
      // ⭐ 2026-11-03 사용량·한도 — 지입차(GPS 관리) 대수
      try { const r = await db.collection("drivers").where("companyName", "==", n).where("등급", "==", "지입").count().get(); c.fleetJ = r.data().count || 0; } catch { c.fleetJ = 0; }
    }));
  }
  // ⭐ 2026-11-03 사용량·한도 — 회사별 저장 용량(오더·거래처에 올린 사진·파일). 사진은 문서 안에 저장되어 있어
  //   첨부 문서의 크기 칸(sizeKB)만 골라 읽고(select), 그 첨부가 달린 오더의 회사로 더한다. 크기 칸이 없는 예전 첨부는 평균으로 계산.
  if (full) {
    try {
      // 💰 2026-11-04 서버 비용 절감 — 예전엔 회사를 알려고 오더·배차·고정거래처 "전체"(지금까지 쌓인 모든 문서)를 매일 읽었다.
      //   이제 첨부가 달린 문서만 골라 회사명 칸만 읽는다(getAll + fieldMask) — 결과는 같고 읽기는 첨부 달린 문서 수만큼.
      const att = await db.collectionGroup("attachments").select("sizeKB").get();
      const OWN = new Set(["orders", "dispatch", "fixedClients"]);
      const parents = new Map();
      att.docs.forEach((d) => { const par = d.ref.parent.parent; if (par && !par.parent.parent && OWN.has(par.parent.id)) parents.set(par.path, par); });
      const owner = {};
      const prefs = [...parents.values()];
      for (let i = 0; i < prefs.length; i += 300) {
        const got = await db.getAll(...prefs.slice(i, i + 300), { fieldMask: ["companyName"] });
        got.forEach((x) => { if (x.exists) owner[x.ref.path] = String(x.get("companyName") || "").trim() || "돌캐"; });
      }
      const per = {}; let knownKB = 0; let knownN = 0; const unknown = {};
      att.docs.forEach((d) => {
        const par = d.ref.parent.parent; if (!par) return;
        const name = owner[par.path]; if (!name) return;
        const kb = Number(d.data()?.sizeKB || 0);
        const o = per[name] || (per[name] = { kb: 0, files: 0 });
        o.files += 1;
        if (kb > 0) { o.kb += kb; knownKB += kb; knownN += 1; } else unknown[name] = (unknown[name] || 0) + 1;
      });
      const avg = knownN ? knownKB / knownN : 200;
      Object.keys(companies).forEach((n) => {
        const o = per[n] || { kb: 0, files: 0 };
        companies[n].storageKB = Math.round(o.kb + (unknown[n] || 0) * avg);
        companies[n].storageFiles = o.files; companies[n].storageAt = Date.now();
      });
    } catch (e) { console.warn("[사용량] 저장 용량 집계 실패:", e?.message || e); }
  }
  // 오더도 계정도 없는 빈 이름은 뺀다
  Object.keys(companies).forEach((k) => { const c = companies[k]; if (!c.staff && !c.totalOrders && !c.appliedAt) delete companies[k]; });

  const out = {
    updatedAt: FieldValue.serverTimestamp(), updatedAtMs: Date.now(), today, month, prevMonth, full, onlineBasis: "uid", // ⭐ 2026-11-02 관리자센터
    companies: Object.values(companies), shippers: Object.values(shippers), platformDaily,
  };
  await db.collection("siteConfig").doc("platformStats").set(out);
  return { companies: out.companies.length, shippers: out.shippers.length };
}

//  POST (최고관리자만) → 지금 다시 집계. 10분 안에 다시 누르면 기존 값을 그대로 둔다.
exports.platformStats = functions.runWith({ timeoutSeconds: 300, memory: "1GB" }).https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
  try {
    const me = await requireAdminRole(req, {});
    if (!me.isTM) { res.status(403).json({ error: "최고관리자만 사용할 수 있습니다." }); return; }
    const cur = await db.collection("siteConfig").doc("platformStats").get();
    const last = cur.exists ? Number(cur.data().updatedAtMs || 0) : 0;
    if (Date.now() - last < 10 * 60 * 1000) { res.json({ ok: true, skipped: true, nextInSec: Math.ceil((10 * 60 * 1000 - (Date.now() - last)) / 1000) }); return; }
    res.json({ ok: true, ...(await computePlatformStats()) });
  } catch (e) {
    console.error("플랫폼 관제 집계 실패:", e);
    res.status(e.status || 500).json({ error: e?.message || String(e) });
  }
});

// ===================== 💰 플랫폼 서버 사용량(최고관리자 전용, 2026-11-04) =====================
// 관리센터 › 청구 › 비용·손익 — 구글 클라우드 모니터링(Cloud Monitoring)에서 이 프로젝트의
// Firestore 읽기·쓰기·삭제, 함수 실행 수, 파일 저장 용량을 1시간마다 가져와 하루 합계로 저장한다.
//  · platformUsage/{YYYY-MM-DD} { date, month, reads, writes, deletes, fnCalls, ... }  (한국 날짜 기준)
//  · platformUsage/m_{YYYY-MM}  이달 합계(+ visionCalls: 글자 인식 호출 수)
//  · platformUsage/_status      { ok, at, error, hint } — 권한이 없으면 화면이 안내문을 띄운다
//  권한: 함수 서비스 계정(dispatch-app-9b92f@appspot.gserviceaccount.com)에 "모니터링 뷰어(roles/monitoring.viewer)"가 있어야 한다
//        (보통 '편집자' 역할이 있어 그대로 된다). 모니터링 API 읽기는 월 100만 회까지 무료 — 이 작업은 하루 약 200회.
let _monClient = null;
async function monitoringClient() {
  if (!_monClient) _monClient = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/monitoring.read"] }).getClient();
  return _monClient;
}
const projectIdOf = () => process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || (() => { try { return JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId; } catch { return ""; } })() || "dispatch-app-9b92f";
// 지표 하나를 시간 단위로 더해서 { "YYYY-MM-DD"(한국): 값 } 으로
async function monSeries(metric, { startMs, endMs, aligner = "ALIGN_SUM", reducer = "REDUCE_SUM", period = 3600, pick = "sum" }) {
  const client = await monitoringClient();
  const qs = new URLSearchParams({
    filter: `metric.type="${metric}"`,
    "interval.startTime": new Date(startMs).toISOString(), "interval.endTime": new Date(endMs).toISOString(),
    "aggregation.alignmentPeriod": `${period}s`, "aggregation.perSeriesAligner": aligner, "aggregation.crossSeriesReducer": reducer,
  });
  const byDay = {}; let token = ""; let pages = 0; let found = false;
  do {
    const r = await client.request({ url: `https://monitoring.googleapis.com/v3/projects/${projectIdOf()}/timeSeries?${qs.toString()}${token ? `&pageToken=${encodeURIComponent(token)}` : ""}` });
    (r.data.timeSeries || []).forEach((ts) => (ts.points || []).forEach((p) => {
      found = true;
      const end = Date.parse(p.interval?.endTime || p.interval?.startTime || "");
      const day = kstDateStr(end - 1000);
      const v = Number(p.value?.int64Value ?? p.value?.doubleValue ?? 0) || 0;
      if (pick === "max") byDay[day] = Math.max(byDay[day] || 0, v); else byDay[day] = (byDay[day] || 0) + v;
    }));
    token = r.data.nextPageToken || ""; pages += 1;
  } while (token && pages < 10);
  return { byDay, found };
}
async function collectPlatformUsage({ days = 2 } = {}) {
  const today = kstDateStr();
  const firstDay = addDaysStr(today, -(Math.max(1, Math.min(42, days)) - 1));
  const startMs = Date.parse(`${firstDay}T00:00:00+09:00`);
  const endMs = Math.floor(Date.now() / 3600e3) * 3600e3 + 3600e3; // 한 시간 단위로 맞춰 한국 자정 경계가 정확히 나뉘게
  const status = { ok: true, at: Date.now(), atMs: Date.now(), days, errors: {}, metrics: {} };
  const tryM = async (key, metrics, opt) => {
    for (const mt of metrics) {
      try {
        const r = await monSeries(mt, { startMs, endMs, ...opt });
        if (r.found) { status.metrics[key] = mt; return r.byDay; }
      } catch (e) {
        const code = e?.response?.status || e?.code;
        const msg = String(e?.response?.data?.error?.message || e?.message || e);
        status.errors[key] = `${code || ""} ${msg}`.trim().slice(0, 300);
        if (code === 403 || /PERMISSION_DENIED|has not been used|disabled/i.test(msg)) { status.ok = false; status.permission = true; return null; }
      }
    }
    return {};
  };
  const reads = await tryM("reads", ["firestore.googleapis.com/document/read_ops_count", "firestore.googleapis.com/document/read_count"], {});
  if (status.permission) {
    status.hint = "함수 서비스 계정에 '모니터링 뷰어' 역할이 없거나 Cloud Monitoring API가 꺼져 있습니다.";
    await db.collection("platformUsage").doc("_status").set(status);
    return status;
  }
  const writes = await tryM("writes", ["firestore.googleapis.com/document/write_ops_count", "firestore.googleapis.com/document/write_count"], {});
  const deletes = await tryM("deletes", ["firestore.googleapis.com/document/delete_ops_count", "firestore.googleapis.com/document/delete_count"], {});
  const fnCalls = await tryM("fnCalls", ["cloudfunctions.googleapis.com/function/execution_count"], {});
  const runReq = await tryM("runRequests", ["run.googleapis.com/request_count"], {}); // 2세대 함수(Cloud Run)
  const egress = await tryM("egressBytes", ["storage.googleapis.com/network/sent_bytes_count"], {});
  const gcsBytes = await tryM("gcsBytes", ["storage.googleapis.com/storage/total_bytes"], { aligner: "ALIGN_MEAN", pick: "max" });
  const fsBytes = await tryM("fsBytes", ["firestore.googleapis.com/storage/data_and_index_storage_bytes"], { aligner: "ALIGN_MEAN", pick: "max" });
  const wb = db.batch();
  for (let d = firstDay; d <= today; d = addDaysStr(d, 1)) {
    const row = {
      date: d, month: d.slice(0, 7), source: "monitoring",
      reads: Math.round(reads?.[d] || 0), writes: Math.round(writes?.[d] || 0), deletes: Math.round(deletes?.[d] || 0),
      fnCalls: Math.round((fnCalls?.[d] || 0) + (runReq?.[d] || 0)), egressBytes: Math.round(egress?.[d] || 0),
      updatedAt: FieldValue.serverTimestamp(), updatedAtMs: Date.now(), partial: d === today,
    };
    if (gcsBytes?.[d]) row.gcsBytes = Math.round(gcsBytes[d]);
    if (fsBytes?.[d]) row.fsBytes = Math.round(fsBytes[d]);
    wb.set(db.collection("platformUsage").doc(d), row, { merge: true });
  }
  await wb.commit();
  // 이달 합계(이달 날짜 문서만 · 31개 이하)
  const months = [...new Set([today.slice(0, 7), firstDay.slice(0, 7)])];
  for (const ym of months) {
    const snap = await db.collection("platformUsage").where("month", "==", ym).get();
    const sum = { reads: 0, writes: 0, deletes: 0, fnCalls: 0, egressBytes: 0, days: 0, gcsBytes: 0, fsBytes: 0 };
    snap.docs.forEach((x) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(x.id)) return;
      const v = x.data() || {};
      ["reads", "writes", "deletes", "fnCalls", "egressBytes"].forEach((k) => { sum[k] += Number(v[k] || 0); });
      sum.days += 1; sum.gcsBytes = Math.max(sum.gcsBytes, Number(v.gcsBytes || 0)); sum.fsBytes = Math.max(sum.fsBytes, Number(v.fsBytes || 0));
    });
    await db.collection("platformUsage").doc(`m_${ym}`).set({ ...sum, backfilled: true, updatedAt: FieldValue.serverTimestamp(), updatedAtMs: Date.now() }, { merge: true });
  }
  await db.collection("platformUsage").doc("_status").set(status);
  return status;
}
// 글자 인식(Vision) 호출 수 — 이달 합계 문서에 더한다(비용·손익의 "글자 인식" 항목)
function bumpVisionCount() {
  const ym = kstDateStr().slice(0, 7);
  return db.collection("platformUsage").doc(`m_${ym}`).set({ visionCalls: FieldValue.increment(1) }, { merge: true }).catch(() => {});
}
// ⏰ 매시 20분(한국시간) — 오늘·어제(어제 마지막 몇 시간 확정). 이달 합계가 처음이면 이달 1일부터 한 번 채운다
exports.platformUsageHourly = functions.runWith({ timeoutSeconds: 120, memory: "256MB" }).pubsub.schedule("20 * * * *").timeZone("Asia/Seoul").onRun(async () => {
  const today = kstDateStr();
  const m = await db.collection("platformUsage").doc(`m_${today.slice(0, 7)}`).get().catch(() => null);
  const days = m && m.exists && m.data().backfilled ? 2 : Number(today.slice(8)) + 1;
  await collectPlatformUsage({ days }).catch((e) => console.error("[서버 사용량] 수집 실패:", e?.message || e));
  return null;
});
//  POST (최고관리자만) { days? } → 지금 다시 가져오기(3분에 1번까지)
exports.platformUsageNow = functions.runWith({ timeoutSeconds: 120, memory: "256MB" }).https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
  try {
    const me = await requireAdminRole(req, {});
    if (!me.isTM) { res.status(403).json({ error: "최고관리자만 사용할 수 있습니다." }); return; }
    const st = await db.collection("platformUsage").doc("_status").get();
    const last = st.exists ? Number(st.data().atMs || 0) : 0;
    if (Date.now() - last < 3 * 60 * 1000) { res.json({ ok: true, skipped: true, nextInSec: Math.ceil((3 * 60 * 1000 - (Date.now() - last)) / 1000) }); return; }
    let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const days = Math.max(2, Math.min(42, Number(body?.days) || Number(kstDateStr().slice(8)) + 1));
    res.json(await collectPlatformUsage({ days }));
  } catch (e) {
    console.error("[서버 사용량] 수집 실패:", e);
    res.status(e.status || 500).json({ error: e?.message || String(e) });
  }
});

/* ==============================
   ⭐ 2026-11-06 오더마켓(운송사 간 오더 거래) — 규칙은 functions/orderMarket.js 맨 위 설명
   ① 게시글 매칭완료 → 받은 운송사 프로그램에 오더 생성(orders/mkt_{id})
   ② 받은 운송사 오더 배차/운송 진행 → 게시글 단계 + 올린 운송사 원래 오더에 반영
============================== */
const _orderMarket = require("./orderMarket");
exports.orderMarketOnListingUpdate = functions.firestore
  .document("cafeOrders/{id}")
  .onUpdate(async (change, context) => {
    try {
      await _orderMarket.onListingUpdate(db, FieldValue, context.params.id, change.before.data(), change.after.data());
    } catch (e) { console.error("[오더마켓] 매칭 처리 실패:", e); }
  });
exports.orderMarketOnTakerOrderWrite = functions.firestore
  .document("orders/{id}")
  .onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() : null;
    if (!after || after.source !== "ordermarket") return; // 오더마켓에서 받은 오더만(나머지 오더는 바로 끝)
    try {
      await _orderMarket.onTakerOrderUpdate(db, FieldValue, context.params.id, change.before.exists ? change.before.data() : null, after);
    } catch (e) { console.error("[오더마켓] 진행 반영 실패:", e); }
  });

// 🤖 2026-11-06 AI 팀 — 관리자센터에서 팀별(경리·재무·영업·운영·보안·홍보) Claude 에이전트와 대화.
//  최고관리자·부관리자(role totalMaster)만. Claude API 키는 Firebase 비밀값 ANTHROPIC_API_KEY.
//  (등록: firebase functions:secrets:set ANTHROPIC_API_KEY)
const aiTeams = require("./aiTeams");
exports.aiTeamChat = functions.runWith({ secrets: ["ANTHROPIC_API_KEY"], timeoutSeconds: 300, memory: "512MB" }).https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
  const authz = String(req.get("Authorization") || "");
  const decoded = authz.startsWith("Bearer ") ? await getAuth().verifyIdToken(authz.slice(7)).catch(() => null) : null;
  if (!(await requireTotalMaster(req))) { res.status(403).json({ error: "최고관리자·부관리자만 사용할 수 있습니다." }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: "Claude API 키가 등록되지 않았습니다. firebase functions:secrets:set ANTHROPIC_API_KEY 후 다시 배포해 주세요." }); return; }
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const team = String(body?.team || "");
  try {
    const out = await aiTeams.runTeamChat({ db, team, history: body?.history, text: body?.text });
    // 사용 기록(비용 확인용) — 질문·답변 앞부분과 토큰 수만
    db.collection("aiTeamLogs").add({
      team, uid: decoded?.uid || "", email: decoded?.email || "",
      question: String(body?.text || "").slice(0, 500), answer: out.reply.slice(0, 2000),
      tools: out.used, usage: out.usage, model: out.model, at: FieldValue.serverTimestamp(),
    }).catch((e) => console.error("[AI 팀] 기록 실패:", e));
    res.json(out);
  } catch (e) {
    const { status, msg } = aiTeams.apiErrorMessage(e);
    console.error(`[AI 팀] ${team} 실패:`, e);
    res.status(status).json({ error: msg });
  }
});
