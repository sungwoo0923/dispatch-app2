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
const { effectiveUser } = require("./multiCompany"); // 🏢 2026-11-24 여러 회사 오가기 — 지금 쓰는 회사 기준
const SRV_FLEET_GRADES = ["지입", "직영", "임대", "분양"]; // 🚛 2026-11-20 기사앱 오더 수락/거절 대상 등급(src/fleetGradesCore.js FLEET_GRADES와 같게)
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");
const fetch = require("node-fetch");
const { GoogleAuth } = require("google-auth-library");

initializeApp();
// 🛡 2026-11-08 App Check — 모드(functions/.env APPCHECK_MODE=off|monitor|enforce) · 설명은 functions/appCheck.js · docs/appcheck-setup.md
const { makeAppCheckGate, appCheckCallOpts, CORS_HEADERS: APPCHECK_CORS } = require("./appCheck");
const { gate: appCheckGate } = makeAppCheckGate({ verifyToken: (t) => require("firebase-admin/app-check").getAppCheck().verifyToken(t) });

const db = getFirestore();
const messaging = getMessaging();
// ⭐ 2026-11-17 알림 받는 사람(역할 · 부서 · 지금 보는 화면) — 배차 알림은 물류운송팀 + [운송] 화면을 보는 통합관리자 · 최고관리자만
const { userAllows: notifyUserAllows, normalizeTeam: normTeamSrv } = require("./notifyAudience");

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
const PUSH_TYPES_DEFAULT_ON = ["긴급배차", "미배차", "결재요청", "결재결과", "공지사항", "사내메일", "인사발령", "마감보고", "가입신청", "메신저", "생일", "인수인계", "기사출퇴근", "기사긴급", "기사수락", "기사완료"]; // ⭐ 2026-11-26 기사 수락 · 운송완료(notifyDispatcherOrderAcceptDone) · 기사 SOS(notifyEmergencyAlert) · ⭐ 2026-11-03 인수인계(notifyHandover) · ⭐ 2026-11-10 담당 기사 출근·퇴근(notifyDriverCheckout)
function isPushTypeEnabled(prefs, type) {
  const v = prefs?.[type];
  if (v === true || v === false) return v;
  return PUSH_TYPES_DEFAULT_ON.includes(type);
}
// ⭐ 2026-11-01 운송사별 분리 — 그 오더의 회사 직원에게만(기사·화주 제외). 예전엔 모든 회사 사용자 전원에게 갔다.
const PUSH_DEFAULT_COMPANY = "(회사없음)"; // ⭐ 2026-11-21 기본 회사 없음
const NON_STAFF_ROLES = new Set(["driver", "shipper", "cafeUser"]);
// ⚡ 2026-11-23 예전엔 알림 한 번마다 users 전체(모든 회사 · 기사 · 화주)를 읽었다 → 그 회사 직원만 읽고 1분 동안 재사용
//  (회사 이름 앞뒤 공백까지 같이 찾는다. 기본 회사 "(회사없음)"만 예전처럼 전체에서 찾는다 — 회사 없는 계정 + 최고관리자)
const _coUsersCache = new Map(); // co → { at, docs }
async function companyUserDocs(co) {
  const hit = _coUsersCache.get(co);
  if (hit && Date.now() - hit.at < 60000) return hit.docs;
  const snap = co === PUSH_DEFAULT_COMPANY
    ? await db.collection("users").get()
    : await db.collection("users").where("companyName", "in", [...new Set([co, `${co} `, ` ${co}`])]).get();
  const docs = snap.docs.map((d) => d.data());
  if (_coUsersCache.size > 200) _coUsersCache.clear();
  _coUsersCache.set(co, { at: Date.now(), docs });
  return docs;
}
// 🔒 2026-11-23 받는 사람이 그 회사 사람인지 — 문서에 적힌 uid(등록자 · 결재선 · 참조 · 담당자)는 화면이 적는 값이라
//  다른 운송사 사람 uid 를 넣으면 그 사람에게 우리 회사 내용이 알림으로 갔다
function sameCoUser(u, co) {
  if (!u) return false;
  if (u.role === "totalMaster") return true;
  return String(u.companyName || "").trim() === String(co || "").trim() && String(co || "").trim() !== ""
    && u.approved !== false && u.employmentStatus !== "퇴사" && !NON_STAFF_ROLES.has(u.role);
}
async function getTokensForType(type, companyName) {
  const co = String(companyName || PUSH_DEFAULT_COMPANY).trim();
  const docs = await companyUserDocs(co);
  const tokens = [];
  docs.forEach((u) => {
    const ts = userTokens(u);
    if (!ts.length) return;
    if (NON_STAFF_ROLES.has(u.role)) return;
    if (u.approved === false || u.employmentStatus === "퇴사") return;
    // 🔒 2026-11-23 회사 없는 오더("(회사없음)")는 최고관리자에게만 — 예전엔 회사 칸이 빈 모든 계정(가입 대기 · 예전 계정)에 갔다
    if (co === PUSH_DEFAULT_COMPANY && u.role !== "totalMaster") return;
    if (u.role !== "totalMaster" && String(u.companyName || PUSH_DEFAULT_COMPANY).trim() !== co) return;
    if (u.role === "totalMaster" && co !== PUSH_DEFAULT_COMPANY) return; // 최고관리자는 기본 회사 알림만
    if (!isPushTypeEnabled(u.pushPrefs, type)) return;
    // ⭐ 2026-11-17 배차 알림은 배차 일을 하는 사람에게만 — 경리 · 인사 · 영업 · 경리업무만 계정은 빼고,
    //  화면 전환 역할(통합관리자 · 최고관리자)은 마지막으로 연 화면(users.activeView)이 [운송]일 때만(src/notifyAudience.js)
    if (!notifyUserAllows(u, type)) return;
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
const _notifyNewDispatch = (COL) =>
  functions.firestore
    .document(`${COL}/{dispatchId}`)
    .onCreate(async (snap, context) => {
      const col = COL;
      if (!["dispatch", "orders"].includes(col)) return;

      const data = snap.data();
      if (data?.블라인드 === true) return; // ★ 블라인드 오더(최고관리자 전용)는 알림 제외
      if (data?._seed) return; /* 🧪 테스트 데이터(_seed)는 알림 없음 */
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
        data: { cat: "dispatch" }, // ⭐ 2026-11-17 모바일 앱이 켜져 있을 때 지금 운송 화면이 아니면 띄우지 않게(포그라운드)
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, type);
    });
// ⚡ 2026-11-23 예전엔 "{col}/{id}" — 모든 컬렉션의 모든 쓰기마다 불려(비용 · 지연) 첫 줄에서 그냥 끝났다 → 오더 컬렉션에서만 불리게
exports.notifyNewDispatch = _notifyNewDispatch("orders");
exports.notifyNewDispatchLegacy = _notifyNewDispatch("dispatch"); // 예전 오더(dispatch) 수정 · 삭제용

/* ==============================
   ▸ 배차완료 알림
============================== */
const _notifyDispatchDone = (COL) =>
  functions.firestore
    .document(`${COL}/{dispatchId}`)
    .onUpdate(async (change, context) => {
      const col = COL;
      if (!["dispatch", "orders"].includes(col)) return;

      const before = change.before.data();
      const after = change.after.data();
      if (after?.블라인드 === true) return; // ★ 블라인드 오더(최고관리자 전용)는 알림 제외
      if (!before || !after) return;
      if (after._seed) return; /* 🧪 테스트 데이터(_seed)는 알림 없음 */
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
        data: { cat: "dispatch" }, // ⭐ 2026-11-17 모바일 앱이 켜져 있을 때 지금 운송 화면이 아니면 띄우지 않게(포그라운드)
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, "배차완료");
    });
// ⚡ 2026-11-23 예전엔 "{col}/{id}" — 모든 컬렉션의 모든 쓰기마다 불려(비용 · 지연) 첫 줄에서 그냥 끝났다 → 오더 컬렉션에서만 불리게
exports.notifyDispatchDone = _notifyDispatchDone("orders");
exports.notifyDispatchDoneLegacy = _notifyDispatchDone("dispatch"); // 예전 오더(dispatch) 수정 · 삭제용

/* ==============================
   ↻ 재배차 알림 — 배차완료(기사 배정) 상태였다가, 그 기사가 빠지고 다시
   "배차중" 상태로 돌아간 경우("재배차 필요"). notifyDispatchDone과 반대 방향.
============================== */
const _notifyRedispatch = (COL) =>
  functions.firestore
    .document(`${COL}/{dispatchId}`)
    .onUpdate(async (change, context) => {
      const col = COL;
      if (!["dispatch", "orders"].includes(col)) return;

      const before = change.before.data();
      const after = change.after.data();
      if (after?.블라인드 === true) return; // ★ 블라인드 오더(최고관리자 전용)는 알림 제외
      if (!before || !after) return;
      if (after._seed) return; /* 🧪 테스트 데이터(_seed)는 알림 없음 */
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
        data: { cat: "dispatch" }, // ⭐ 2026-11-17 모바일 앱이 켜져 있을 때 지금 운송 화면이 아니면 띄우지 않게(포그라운드)
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, "재배차");
    });
// ⚡ 2026-11-23 예전엔 "{col}/{id}" — 모든 컬렉션의 모든 쓰기마다 불려(비용 · 지연) 첫 줄에서 그냥 끝났다 → 오더 컬렉션에서만 불리게
exports.notifyRedispatch = _notifyRedispatch("orders");
exports.notifyRedispatchLegacy = _notifyRedispatch("dispatch"); // 예전 오더(dispatch) 수정 · 삭제용

/* ==============================
   ✕ 배차취소 알림 — 오더가 취소(소프트: 배차상태→배차취소)되거나
   완전삭제된 경우.
============================== */
const _notifyDispatchCanceled = (COL) =>
  functions.firestore
    .document(`${COL}/{dispatchId}`)
    .onUpdate(async (change, context) => {
      const col = COL;
      if (!["dispatch", "orders"].includes(col)) return;

      const before = change.before.data();
      const after = change.after.data();
      // ⭐ 블라인드 오더는 관리자 전체 알림만 제외하고, 배정된 기사 본인에게는 취소 알림을 보낸다
      const isBlind = after?.블라인드 === true;
      if (!before || !after) return;
      if (after._seed) return; /* 🧪 테스트 데이터(_seed)는 알림 없음 */
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
        const driverDoc = await findDriverByPlate(before["차량번호"], before.companyName || after.companyName, (d) => normalizePlateServer(d.data()["차량번호"]) === plate && (checkState || SRV_FLEET_GRADES.includes(String(d.data()["등급"] || "").trim())));
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
          data: { cat: "dispatch" }, // ⭐ 2026-11-17 모바일 앱이 켜져 있을 때 지금 운송 화면이 아니면 띄우지 않게(포그라운드)
          android: { priority: "high" },
          apns: { payload: { aps: { sound: "default" } } },
        }, "배차취소(취소상태 전환)");
      }
    });
// ⚡ 2026-11-23 예전엔 "{col}/{id}" — 모든 컬렉션의 모든 쓰기마다 불려(비용 · 지연) 첫 줄에서 그냥 끝났다 → 오더 컬렉션에서만 불리게
exports.notifyDispatchCanceled = _notifyDispatchCanceled("orders");
exports.notifyDispatchCanceledLegacy = _notifyDispatchCanceled("dispatch"); // 예전 오더(dispatch) 수정 · 삭제용

const _notifyDispatchDeleted = (COL) =>
  functions.firestore
    .document(`${COL}/{dispatchId}`)
    .onDelete(async (snap, context) => {
      const col = COL;
      if (!["dispatch", "orders"].includes(col)) return;

      const data = snap.data();
      const isBlind = data?.블라인드 === true; // 블라인드는 관리자 전체 알림만 제외(기사 본인 알림은 보냄)
      if (!data) return;
      if (data._seed) return; /* 🧪 테스트 데이터(_seed)는 알림 없음 */
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
          data: { cat: "dispatch" }, // ⭐ 2026-11-17 모바일 앱이 켜져 있을 때 지금 운송 화면이 아니면 띄우지 않게(포그라운드)
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
// ⚡ 2026-11-23 예전엔 "{col}/{id}" — 모든 컬렉션의 모든 쓰기마다 불려(비용 · 지연) 첫 줄에서 그냥 끝났다 → 오더 컬렉션에서만 불리게
exports.notifyDispatchDeleted = _notifyDispatchDeleted("orders");
exports.notifyDispatchDeletedLegacy = _notifyDispatchDeleted("dispatch"); // 예전 오더(dispatch) 수정 · 삭제용

function normalizePlateServer(v = "") {
  return String(v).replace(/\s+/g, "").toUpperCase();
}
// ⭐ 2026-11-02 점검 — 같은 차량번호가 다른 운송사에도 있을 수 있어(coDocKey/scopedDriverEmail) 오더의 회사 기사만 찾는다.
// companyName이 없는 예전 기사 문서는 "(회사없음)"으로 본다 — Firestore where로 거르면 필드 없는 문서가 빠지므로 메모리에서 거른다.
async function findDriverByPlate(rawPlate, companyName, extraFilter) {
  const plate = normalizePlateServer(rawPlate || "");
  if (!plate) return null;
  const co = String(companyName || "(회사없음)").trim();
  // 🐞 2026-11-26 오더 "12가 3456" · 기사 "12가3456"처럼 띄어쓰기만 달라도 못 찾아 푸시가 안 갔다 → 원래 값 · 띄어쓰기 없앤 값 둘 다 찾는다(roleMirror 와 같은 방식)
  const raw = String(rawPlate || "").trim();
  const tight = raw.replace(/\s+/g, "");
  const variants = [...new Set([raw, tight, tight.replace(/([가-힣])(\d{4})$/, "$1 $2")].filter(Boolean))];
  const snap = await db.collection("drivers").where("차량번호", "in", variants).limit(20).get();
  // 기사앱에 가입·연결된 문서(drivers/{uid}, uid === 문서 id)를 먼저 — 예전에 미리 등록해 둔 문서로 푸시가 새지 않게
  const docs = [...snap.docs].sort((a, b) => Number(b.data().uid === b.id) - Number(a.data().uid === a.id));
  return docs.find((d) => normalizePlateServer(d.data()["차량번호"]) === plate
    && String(d.data().companyName || "(회사없음)").trim() === co
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
const _notifyFleetDriverNewOrder = (COL) =>
  functions.firestore
    .document(`${COL}/{dispatchId}`)
    .onWrite(async (change, context) => {
      const col = COL;
      if (!["dispatch", "orders"].includes(col)) return;

      const before = change.before.exists ? change.before.data() : null;
      const after = change.after.exists ? change.after.data() : null;
      if (!after) return; // 삭제는 별도 함수(notifyDispatchDeleted)에서 처리
      // ⭐ 가져오기로 만든 예전 오더·초기화 복원 중인 오더는 지입 기사에게 새 배차로 보내지 않는다
      if (!before && after.importBatchId) return;
      if (after._seed) return; /* 🧪 테스트 데이터(_seed)는 알림 없음 */
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
        if (SRV_FLEET_GRADES.includes(String(wDriverDoc?.data()?.["등급"] || "").trim()) && !!wDriverDoc.data().uid) { // 🚛 2026-11-20 지입 · 직영 · 임대 · 분양
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
              // 🔒 2026-11-07 회사명도 기록 — 잠금 뒤 운송사 화면은 회사 조건으로 조회한다(없으면 기사 본인만 보임)
              companyName: String(before?.companyName || after.companyName || cDriverDoc.data()?.companyName || "").trim() || "(회사없음)",
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
// ⚡ 2026-11-23 예전엔 "{col}/{id}" — 모든 컬렉션의 모든 쓰기마다 불려(비용 · 지연) 첫 줄에서 그냥 끝났다 → 오더 컬렉션에서만 불리게
exports.notifyFleetDriverNewOrder = _notifyFleetDriverNewOrder("orders");
exports.notifyFleetDriverNewOrderLegacy = _notifyFleetDriverNewOrder("dispatch"); // 예전 오더(dispatch) 수정 · 삭제용

/* ==============================
   ✔ 2026-11-26 지입 기사 — 오더 수락 · 운송 완료 → 담당 배차자 휴대폰 푸시(사용자 요청)
   받는 사람: 그 오더 등록자 · 배차확정자 · 기사 담당자 중 같은 회사 직원
   알림 설정 "기사 수락" · "기사 운송완료"(기본 켜짐)를 끈 사람, 지금 운송 화면이 아닌 사람(통합관리자 등)은 뺀다
============================== */
const _notifyDispatcherOrderAcceptDone = (COL) =>
  functions.firestore
    .document(`${COL}/{dispatchId}`)
    .onUpdate(async (change, context) => {
      const before = change.before.data();
      const after = change.after.data();
      if (!before || !after || after._seed) return null;
      const st = after["기사확인상태"];
      const was = before["기사확인상태"];
      const kind = st === "수락" && was === "대기" ? "기사수락" : st === "완료" && was !== "완료" ? "기사완료" : "";
      if (!kind) return null;
      const co = after.companyName || before.companyName;
      const uids = [after["createdByUid"], after["배차확정자Uid"]];
      try {
        const dDoc = after["차량번호"] ? await findDriverByPlate(after["차량번호"], co) : null;
        const mgr = dDoc?.data()?.["담당자"];
        if (mgr && typeof mgr === "object" && mgr.uid) uids.push(mgr.uid);
      } catch (e) { console.warn("수락/완료 알림 기사 담당자 조회 실패:", e?.message || e); }
      const recipUids = [...new Set(uids.filter((x) => typeof x === "string" && x))];
      if (!recipUids.length) return null;
      let tokens = [];
      const uSnaps = await db.getAll(...recipUids.map((uid) => db.collection("users").doc(uid)));
      uSnaps.forEach((d) => {
        const u = d.exists ? d.data() : null;
        if (!u || !sameCoUser(u, co) || !isPushTypeEnabled(u.pushPrefs, kind) || !notifyUserAllows(u, kind)) return;
        tokens.push(...userTokens(u));
      });
      tokens = [...new Set(tokens)];
      if (!tokens.length) return null;
      const driverLabel = `${after["이름"] || "기사"}(${after["차량번호"] || "-"})`;
      const route = [after["상차지명"], after["하차지명"]].filter(Boolean).join(" → ");
      await sendPushAndCleanup(tokens, {
        notification: kind === "기사수락"
          ? { title: `✔ 오더 수락 · ${driverLabel}`, body: `${after["거래처명"] || "오더"}${route ? ` · ${route}` : ""}${after["상차시간"] ? ` · ${after["상차시간"]} 상차` : ""}` }
          : { title: `🏁 운송 완료 · ${driverLabel}`, body: `${after["거래처명"] || "오더"}${route ? ` · ${route}` : ""} 운송을 마쳤어요` },
        data: { type: kind === "기사수락" ? "fleet_order_accepted" : "fleet_order_done", orderId: context.params.dispatchId, target: "app" },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, kind === "기사수락" ? "지입기사 오더수락(담당자 알림)" : "지입기사 운송완료(담당자 알림)");
      return null;
    });
exports.notifyDispatcherOrderAcceptDone = _notifyDispatcherOrderAcceptDone("orders");
exports.notifyDispatcherOrderAcceptDoneLegacy = _notifyDispatcherOrderAcceptDone("dispatch");

/* ==============================
   ⊘ 지입 기사 — 오더 거절 알림(배차담당자 본인에게 OS 푸시)
============================== */
const _notifyDispatcherOrderRejected = (COL) =>
  functions.firestore
    .document(`${COL}/{dispatchId}`)
    .onUpdate(async (change, context) => {
      const col = COL;
      if (!["dispatch", "orders"].includes(col)) return;

      const before = change.before.data();
      const after = change.after.data();
      if (!before || !after) return;
      if (after._seed) return; /* 🧪 테스트 데이터(_seed)는 알림 없음 */
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
      let eligible = 0; // ⭐ 2026-11-17 배차 일을 하는 담당자(운송 화면) — 아무도 없으면 회사 '재배차' 알림 대상에게
      if (recipUids.length) {
        const uSnaps = await db.getAll(...recipUids.map((uid) => db.collection("users").doc(uid)));
        uSnaps.forEach((d) => { if (d.exists && sameCoUser(d.data(), co) && notifyUserAllows(d.data(), "기사거절")) { eligible++; token.push(...userTokens(d.data())); } });
        token = [...new Set(token)];
      }
      if (!eligible) token = await getTokensForType("재배차", co);
      if (!token.length) return;

      // ⭐ 거절 처리와 동시에 차량번호/이름이 비워지므로(배차중으로 되돌림), after가
      // 아니라 거절 직전 상태인 before에서 기사 정보를 가져와야 "기사(-)" 로 비어
      // 보이지 않는다.
      const driverLabel = `${before["이름"] || after["이름"] || "기사"}(${before["차량번호"] || after["차량번호"] || "-"})`;
      await sendPushAndCleanup(token, {
        notification: {
          // ⭐ 2026-11-09 수정된 오더를 기사가 거절(재승인 팝업) — 배차가 빠졌으니 다시 배차해야 한다
          title: after["수정거절"] ? "수정된 오더를 기사가 거절했습니다" : "오더가 거절되었습니다",
          body: after["수정거절"]
            ? `${driverLabel}님이 수정된 오더(${(after["수정거절항목"] || []).join("·") || "변경 내용"})를 거절했습니다 — 배차가 빠졌습니다. 다시 배차해 주세요.`
            : `${driverLabel}님이 오더를 거절했습니다${after["기사거절사유"] ? `: ${after["기사거절사유"]}` : ""}`,
        },
        data: { type: "fleet_order_rejected", orderId: context.params.dispatchId, target: "app" }, // target:"app" = 누르면 운송사 화면(public/sw.js)
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, "지입기사 오더거절(담당자 알림)");
    });
// ⚡ 2026-11-23 예전엔 "{col}/{id}" — 모든 컬렉션의 모든 쓰기마다 불려(비용 · 지연) 첫 줄에서 그냥 끝났다 → 오더 컬렉션에서만 불리게
exports.notifyDispatcherOrderRejected = _notifyDispatcherOrderRejected("orders");
exports.notifyDispatcherOrderRejectedLegacy = _notifyDispatcherOrderRejected("dispatch"); // 예전 오더(dispatch) 수정 · 삭제용

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
function checkinReminderStage(d, nowMin, ymd, dow, nowMs = Date.now()) {
  if (!d || d.출근알림 === false) return null;
  const start = parseHM(d.출근시간);
  if (start == null) return null;
  if (Array.isArray(d.근무요일) && d.근무요일.length && !d.근무요일.includes(CHECKIN_DOW[dow])) return null;
  const st = String(d.status || "").trim();
  // 출근·운행중·휴차는 보내지 않는다 — 🐞 2026-11-26 단, "오늘" 상태일 때만.
  //  자동 퇴근이 없어져서 어제 퇴근을 안 누른 기사는 상태가 출근/운송중으로 남아 오늘 출근 알림을 영영 못 받았다.
  //  휴차 = 휴차일자가 오늘 · 출근/운행 = 오늘 출근했거나(workDate) 12시간 안에 상태가 바뀜(밤샘 운행 중)
  if (st === "휴차") { if (String(d.휴차일자 || "") === ymd) return null; }
  else if (st && st !== "퇴근" && st !== "대기") {
    const upd = d.updatedAt && typeof d.updatedAt.toMillis === "function" ? d.updatedAt.toMillis() : 0;
    if (d.workDate === ymd || (upd && nowMs - upd < 12 * 3600e3)) return null;
  }
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

// 🚚 2026-11-09 퇴근 미처리 자동 처리(driverDutyWatch)는 사용자 요청으로 뺐다 — 기사가 직접 퇴근 · 운송사 관제 [퇴근처리] 버튼만

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
exports.notifyUnassignedUrgent = functions.runWith({ timeoutSeconds: 240 }).pubsub // ⚡ 2026-11-23 기본 60초면 오더 · 파일이 많을 때 중간에 끊겼다
  .schedule("every 5 minutes")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const nowMs = Date.now();
    const nowKst = new Date(nowMs + 9 * 60 * 60 * 1000);
    const todayStr = nowKst.toISOString().slice(0, 10);
    const URGENT_WINDOW_MIN = 60; // 상차 1시간 전부터 임박으로 취급

    const tokenCache = {}; // ⭐ 회사별 직원에게만
    const tokensFor = async (co) => { const k = String(co || "(회사없음)"); if (!tokenCache[k]) tokenCache[k] = await getTokensForType("미배차", k); return tokenCache[k]; };
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
        if (data._seed) continue; /* 🧪 테스트 데이터(_seed)는 알림 없음 */

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
            data: { cat: "dispatch" }, // ⭐ 2026-11-17 모바일 앱이 켜져 있을 때 지금 운송 화면이 아니면 띄우지 않게(포그라운드)
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
const _notifyFleetOrderModified = (COL) =>
  functions.firestore
    .document(`${COL}/{dispatchId}`)
    .onUpdate(async (change, context) => {
      const col = COL; const { dispatchId } = context.params;
      if (!["dispatch", "orders"].includes(col)) return;
      const before = change.before.data();
      const after = change.after.data();
      if (!before || !after) return;
      if (after._seed) return; /* 🧪 테스트 데이터(_seed)는 알림 없음 */
      if (after["기사확인상태"] !== "수락" || before["기사확인상태"] !== "수락") return;
      if (after["배차상태"] === "배차취소") return;
      const plate = normalizePlateServer(after["차량번호"] || "");
      if (!plate || plate !== normalizePlateServer(before["차량번호"] || "")) return;

      const norm = (v) => (v == null ? "" : String(v).trim());
      // 회전수는 비어있음/1을 같은 값(1회)으로 본다
      const normF = (f, v) => (f === "회전수" ? (Number(v) > 1 ? String(Math.floor(Number(v))) : "") : norm(v));
      const labels = ORDER_WATCH_GROUPS
        // 🛠 2026-11-26 빈 주소를 채운 것만으로는 "오더 수정" 알림을 보내지 않는다(기사앱 재승인도 없음 — src/orderChange.js)
        .filter(([, fields]) => fields.some((f) => normF(f, before[f]) !== normF(f, after[f]) && !(/주소$/.test(f) && !normF(f, before[f]))))
        .map(([label]) => label);
      if (!labels.length) return;

      // ⭐ 2026-11-02 점검 — 오더 회사의 기사로 한정
      const driverDoc = await findDriverByPlate(after["차량번호"], after.companyName);
      if (!driverDoc) return;

      const route = `${after["상차지명"] || "-"} → ${after["하차지명"] || "-"}`;
      const title = "오더가 수정되었습니다";
      const body = `${after["거래처명"] ? after["거래처명"] + " " : ""}${route} 오더의 ${labels.join("·")} 정보가 변경되었습니다. 앱에서 바뀐 내용을 보고 [재승인] 또는 [거절]을 눌러주세요.`;

      await db.collection("driver_notifications").add({
        driverId: driverDoc.id, type: "order_modified", orderId: dispatchId,
        companyName: String(after.companyName || driverDoc.data()?.companyName || "").trim() || "(회사없음)", // 🔒 2026-11-07 회사명
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
// ⚡ 2026-11-23 예전엔 "{col}/{id}" — 모든 컬렉션의 모든 쓰기마다 불려(비용 · 지연) 첫 줄에서 그냥 끝났다 → 오더 컬렉션에서만 불리게
exports.notifyFleetOrderModified = _notifyFleetOrderModified("orders");
exports.notifyFleetOrderModifiedLegacy = _notifyFleetOrderModified("dispatch"); // 예전 오더(dispatch) 수정 · 삭제용

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

async function getUserToken(uid, cat = "") {
  if (!uid) return [];
  const u = await db.collection("users").doc(uid).get().catch(() => null);
  if (!u?.exists) return [];
  // ⭐ 2026-11-17 배차 알림(cat)이면 지금 운송 일을 하는 사람에게만(src/notifyAudience.js)
  return cat && !notifyUserAllows(u.data(), cat) ? [] : userTokens(u.data());
}

exports.notifyFleetLateArrival = functions.runWith({ timeoutSeconds: 240 }).pubsub // ⚡ 2026-11-23 기본 60초면 오더 · 파일이 많을 때 중간에 끊겼다
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
        if (o._seed) continue; /* 🧪 테스트 데이터(_seed)는 알림 없음 */
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
            const mu = await db.collection("users").doc(uid).get().catch(() => null);
            if (!mu?.exists || !sameCoUser(mu.data(), o.companyName)) continue; // 🔒 2026-11-23 그 회사 사람에게만
            for (const t of await getUserToken(uid, "기사지연")) if (!mgrTokens.includes(t)) mgrTokens.push(t);
          }
          if (mgrTokens.length) {
            await sendPushAndCleanup(mgrTokens, {
              notification: {
                title: `⚠ ${c.label} 지연 우려 · ${driverLabel}`,
                body: `${c.label}시간(${t24})이 지났지만 아직 ${c.label}지 [${place}] 반경 밖입니다. ${distText}. 기사님께 확인 바랍니다.`,
              },
              data: { type: `fleet_late_${c.kind}`, orderId: docSnap.id, target: "app" },
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
              companyName: String(o.companyName || drv?.companyName || "").trim() || "(회사없음)", // 🔒 2026-11-07 회사명
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
exports.cleanupOldAttachments = functions.runWith({ timeoutSeconds: 540 }).pubsub // ⚡ 2026-11-23 기본 60초면 오더 · 파일이 많을 때 중간에 끊겼다
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
    if (data._seed) return; /* 🧪 테스트 데이터(_seed)는 알림 없음 */
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
    // 🔒 2026-11-23 보낸 사람과 같은 운송사 · 연동 관계(화주 ↔ 연동 운송사)인 사람에게만 — 방에 다른 운송사 사람을 넣어도 대화 내용이 알림으로 가지 않게
    const sender = data.senderUid ? (await db.collection("users").doc(data.senderUid).get().catch(() => null))?.data() || null : null;
    const coOf = (u) => String(u?.companyName || "").trim();
    const linkOf = (u) => String(u?.linkedTransportCompany?.companyName || "").trim();
    const related = (u) => {
      if (!sender || !u) return false;
      if (sender.role === "totalMaster" || u.role === "totalMaster") return true;
      const sShip = sender.role === "shipper"; const uShip = u.role === "shipper";
      if (!sShip && !uShip) return coOf(sender) !== "" && coOf(sender) === coOf(u);
      if (sShip && uShip) return coOf(sender) !== "" && coOf(sender) === coOf(u) && linkOf(sender) === linkOf(u);
      return sShip ? linkOf(sender) !== "" && linkOf(sender) === coOf(u) : linkOf(u) !== "" && linkOf(u) === coOf(sender);
    };
    await Promise.all(members.map(async (uid) => {
      try {
        const uSnap = await db.collection("users").doc(uid).get();
        if (!related(uSnap.data())) return;
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

// 🔒 2026-11-26 보안 — 응답에 내부 오류 문구(라이브러리 메시지 · 경로 · 키 이름 등)를 그대로 내보내지 않는다.
//  우리가 일부러 던진 안내(status 400~499)는 그대로, 그 밖의 오류는 로그에만 남기고 화면에는 일반 문구
const PUB_ERR_MSG = "서버에서 처리하지 못했어요. 잠시 뒤 다시 해 주세요.";
function pubErrMsg(e) {
  const st = Number(e?.status) || 0;
  if (st >= 400 && st < 500 && e?.message) return String(e.message);
  console.error("[서버 오류]", e?.message || e);
  return PUB_ERR_MSG;
}
exports.sendPushNotification = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "sendPushNotification"))) return; // 🛡 App Check(functions/appCheck.js)
  if (req.method !== "POST") { res.status(405).send("POST만 허용됩니다."); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  // 🔒 2026-11-07 보안 점검 — 예전엔 화면 코드에 그대로 들어 있는 키(PUSH_SEND_KEY)만 맞으면 누구나 모든 회사·모든 사람에게
  //  푸시를 보낼 수 있었다(사칭 알림). 이제 최고관리자 로그인 토큰이 있어야 한다(키는 예전 화면 호환용으로 같이 확인).
  if (body.key !== PUSH_SEND_KEY || !(await isTotalMasterReq(req))) { res.status(403).send("forbidden"); return; }

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
    res.status(500).send(`대상 조회 실패: ${pubErrMsg(e)}`);
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
    res.status(500).send(`오류: ${pubErrMsg(e)}`);
  }
});

/* ==============================================================
   ▥ 구글시트 공용 — 이 Firebase 프로젝트의 기본 서비스계정으로 Sheets API 인증
   (예전 한 운송사 전용 배차현황 시트 실시간 연동 · 백필 · 점검은 2026-11-24 모두 지움 — 시트 연결은 functions/sheetConnect.js)
================================================================== */
const GSHEET_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
let _gsheetAuthClient = null;
async function getGsheetAuthClient() {
  if (_gsheetAuthClient) return _gsheetAuthClient;
  const auth = new GoogleAuth({ scopes: GSHEET_SCOPES });
  _gsheetAuthClient = await auth.getClient();
  return _gsheetAuthClient;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// 시트 탭 이름을 A1 표기용으로 감싼다('탭''이름')
function quoteTab(tabName) {
  return `'${tabName.replace(/'/g, "''")}'`;
}
// 취소로 보는 상태 값(휴지통 · 마감 요약에서 쓴다)
const GSHEET_CANCELED_STATUS_LIST = ["취소", "배차취소", "오더취소", "취소됨"];

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
//  회사명이 없으면: company(화주사 오더의 받는 운송사·결재/게시판의 회사) → 없으면 "(회사없음)"
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
// ⭐ 2026-11-07 이름 정리 — 아래(운송사 초기화)의 requireTotalMaster(오류를 던짐)와 이름이 같아 이 함수는 덮여 쓰이지 않았다(true/false 판단용)
async function isTotalMasterReq(req) {
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
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "tenantMigrate"))) return; // 🛡 App Check(functions/appCheck.js)
  if (!(await isTotalMasterReq(req))) { res.status(403).json({ error: "FORBIDDEN" }); return; }
  const col = String(req.body?.col || "");
  const mode = String(req.body?.mode || "fill"); // fill(빈 회사명 채우기) | scan(점검만) | purge(기준일 이전 삭제)
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
      const fb = (typeof x.company === "string" && x.company.trim()) || (typeof x.운송사명 === "string" && x.운송사명.trim()) || "(회사없음)";
      batch.update(d.ref, { companyName: fb }); n += 1;
    });
    if (n) await batch.commit();
    scanned += snap.size; updated += n;
    cursor = snap.docs[snap.docs.length - 1].id;
    if (snap.size < 400) { done = true; break; }
  }
  res.status(200).json({ col, cursor, scanned, updated, done });
});

// ⭐ 2026-11-08 보안 — 기사 업로드 링크(uploadAccess) · 기사 통합 검색(driverSearch) · 기사 로그인 선등록 연결(driverLoginLink)은
//  functions/uploadAccess.js 로 옮겼다(토큰 확인·요청 수 제한을 서버에서). 비밀값 UPLOAD_TOKEN_SECRET 필요.
const _uploadAccess = require("./uploadAccess")({ functions, db, getAuth, FieldValue, Timestamp });
exports.uploadAccess = _uploadAccess.uploadAccess;
exports.driverSearch = _uploadAccess.driverSearch;
exports.driverLoginLink = _uploadAccess.driverLoginLink;
exports.driverLinkSig = _uploadAccess.driverLinkSig; // 🔒 2026-11-23 기사 업로드 링크 회사 서명
const _publicLimited = _uploadAccess.limited;
const _publicIp = _uploadAccess.clientIp;
// ⭐ 2026-11-11 기사 차량 변경(계정은 그대로, 차량번호만) · 휴대폰번호 로그인 — functions/driverVehicle.js
const _driverVehicle = require("./driverVehicle")({ functions, db, getAuth, FieldValue, helpers: _uploadAccess });
exports.driverChangeVehicle = _driverVehicle.driverChangeVehicle;
exports.driverPhoneLogin = _driverVehicle.driverPhoneLogin;
exports.driverMerge = _driverVehicle.driverMerge; // 최고관리자: 같은 기사 두 줄 합치기
exports.driverPhoneCheck = _driverVehicle.driverPhoneCheck; // 기사 가입: 같은 휴대폰번호 중복 가입 방지

// 📧 가입 화면 이메일 중복확인 — 로그인 전 화면은 보안 규칙상 users 목록을 못 읽어서
//  "사용 중 여부"만 서버가 대신 알려준다(문서 내용은 돌려주지 않음). 삭제·탈퇴 계정은 재가입 허용.
exports.checkEmail = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "checkEmail"))) return; // 🛡 App Check(functions/appCheck.js)
  if (req.query.ping === "1") { res.status(200).json({ ok: true }); return; }
  const e = String(req.query.e || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) { res.status(400).json({ error: "BAD_EMAIL" }); return; }
  // ⭐ 2026-11-08 보안 — 로그인 전 공개 함수라 이메일 대량 확인(가입 여부 수집)을 막는다: IP당 10분 30회 · 같은 이메일 10분 10회
  if (await _publicLimited(res, [[`ce:ip:${_publicIp(req)}`, 30, 10 * 60e3], [`ce:e:${e.toLowerCase()}`, 10, 10 * 60e3]])) return;
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
  // users 문서가 없는 계정은 "운송사 삭제(초기화)로 사용 중지된 계정"일 때만 — 다른 서비스 전용 계정은 건드리지 않는다
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
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "freeDeletedEmail"))) return; // 🛡 App Check(functions/appCheck.js)
  const e = String(req.query.e || req.body?.e || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) { res.status(400).json({ error: "BAD_EMAIL" }); return; }
  // ⭐ 2026-11-08 보안 — 요청 수 제한(IP당 1시간 10회 · 같은 이메일 1시간 3회) · 응답은 freed만(계정 있음/없음은 알려주지 않음)
  if (await _publicLimited(res, [[`fd:ip:${_publicIp(req)}`, 10, 3600e3], [`fd:e:${e}`, 3, 3600e3]])) return;
  try {
    const u = await getAuth().getUserByEmail(e).catch(() => null);
    if (!u) { res.status(200).json({ freed: false }); return; }
    if (!(await canFreeAuthAccount(u))) { res.status(200).json({ freed: false }); return; }
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
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "linkDriverSignup"))) return; // 🛡 App Check(functions/appCheck.js)
  if (req.method !== "POST") { res.status(405).json({ error: "POST_ONLY" }); return; }
  try {
    const m = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
    if (!m) { res.status(401).json({ error: "NO_TOKEN" }); return; }
    const tok = await getAuth().verifyIdToken(m[1]).catch(() => null);
    if (!tok) { res.status(401).json({ error: "BAD_TOKEN" }); return; }
    const uid = tok.uid;
    if (await _publicLimited(res, [[`lds:uid:${uid}`, 10, 10 * 60e3], [`lds:ip:${_publicIp(req)}`, 30, 10 * 60e3]])) return; // 🔒 2026-11-23 맞춰 보기 반복 막기
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
    // 🔒 2026-11-23 사용자 요청 — 기사관리에 등록된 기사와 "차량번호 · 이름 · 연락처 · 운송사"가 모두 맞아야 연결한다(예전엔 이름만 맞아도 연결 · 승인)
    //  · 모두 맞고 + 등록된 번호로 문자 인증(phoneIdToken)까지 하면 → 자동 승인
    //  · 모두 맞지만 문자 인증을 안 했으면 → 연결은 하되 승인 대기(운송사 직원이 승인)
    //  · 하나라도 다르면 연결하지 않는다(conflict — 화면이 "등록 정보와 다르다"고 안내)
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
      if (!samePhone || !sameName) continue;
      if (String(x.companyName || "").trim() && String(x.companyName).trim() !== co) continue;
      best = d; bestScore = 3;
    }
    // 문자 인증 — 기사관리에 등록된 번호로 받은 인증인지(10분 안)
    let smsOk = false;
    if (best && b.phoneIdToken) {
      const pt = await getAuth().verifyIdToken(String(b.phoneIdToken)).catch(() => null);
      const got = drvDigits(pt?.phone_number).replace(/^82/, "0");
      const reg = drvDigits((best.data() || {}).전화번호 || (best.data() || {}).phone);
      smsOk = !!pt && got.length >= 10 && got === reg && Date.now() - Number(pt.auth_time || 0) * 1000 < 10 * 60 * 1000;
      // 문자 인증 때 생긴 전화번호 임시 계정은 지운다(이메일 없는 전화 전용 계정만)
      if (pt?.uid && pt.uid !== uid && !pt.email) {
        try { const pu = await getAuth().getUser(pt.uid); if (!pu.email && pu.providerData.every((x) => x.providerId === "phone")) await getAuth().deleteUser(pt.uid); } catch { /* 무시 */ }
      }
    }
    if (!best) {
      // ⭐ 2026-11-08 보안 — 화면이 drivers/{차량번호}를 직접 읽지 않게 됐다. 같은 회사에 이 차량번호 선등록 문서가 있는데
      //  이름·휴대폰이 다르면 conflict(화면: "이미 등록된 차량번호인데 이름·회사명이 다릅니다") — 문서 내용은 돌려주지 않는다
      const preKey = co && co !== PUSH_DEFAULT_COMPANY ? `${co}__${plate}` : plate;
      const [p1, p2] = await Promise.all([
        db.collection("drivers").doc(preKey).get(),
        preKey !== plate ? db.collection("drivers").doc(plate).get() : Promise.resolve(null),
      ]);
      const conflict = (p1.exists && !p1.data().uid) || !!(p2?.exists && !p2.data().uid && String(p2.data().companyName || "").trim() === co);
      res.status(200).json({ linked: false, ...(conflict ? { conflict: true } : {}) });
      return;
    }

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
      approved: smsOk,
      linkedFromDriverId: best.id !== uid ? best.id : (base.linkedFromDriverId || ""),
      linkedAt: now,
      linkedBy: smsOk ? "기사 가입 자동 연결(문자 인증)" : "기사 가입 연결(문자 인증 전 — 승인 대기)",
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
      approved: smsOk,
      phoneVerified: smsOk,
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
    console.log(`🔗 기사 가입 연결: ${co} ${plate} ${name} → ${best.id} ⇒ drivers/${uid} (${smsOk ? "문자 인증 · 자동 승인" : "승인 대기"})`);
    res.status(200).json({ linked: true, approved: smsOk, driverId: uid, from: best.id, name: userDoc.name });
  } catch (e) {
    if (e?.code === "GONE" || e?.code === "TAKEN") { res.status(200).json({ linked: false, reason: e.code }); return; }
    console.error("기사 가입 자동 연결 실패:", e);
    res.status(500).json({ error: "LINK_FAILED" });
  }
});

// 🏢 가입 화면 "기존 회사" 검색 — 로그인 전에는 규칙상 transportApplications 를 읽을 수 없어
//  항상 "등록된 운송사가 없습니다"가 떴다. 승인된 운송사의 회사명·주소만 내려준다(다른 정보 없음).
// 🔒 2026-11-23 역할별 오더 사본(기사 · 화주) — 설명은 functions/roleMirror.js 맨 위
const _roleMirror = require("./roleMirror");
const _roleMirrorTrigger = (COL) => functions.runWith({ timeoutSeconds: 60, memory: "256MB" }).firestore.document(`${COL}/{orderId}`)
  .onWrite(async (change, context) => {
    try {
      await _roleMirror.syncOne(db, FieldValue, COL, context.params.orderId,
        change.before.exists ? change.before.data() : null, change.after.exists ? change.after.data() : null);
    } catch (e) { console.error("[역할 사본] 실패:", COL, context.params.orderId, e?.message || e); throw e; }
  });
exports.roleMirrorOrders = _roleMirrorTrigger("orders");
exports.roleMirrorDispatch = _roleMirrorTrigger("dispatch");
// 기존 오더 사본 채우기 — 배포 뒤 10분마다 최근 오더부터 차례로(끝나면 멈춘다 · 진행은 systemConfig/roleMirror)
exports.roleMirrorBackfill = functions.runWith({ timeoutSeconds: 540, memory: "512MB" }).pubsub.schedule("every 10 minutes").timeZone("Asia/Seoul").onRun(async () => {
  const ref = db.collection("systemConfig").doc("roleMirror");
  const st = (await ref.get()).data() || {};
  if (st.done === true && st.ver === 1) return null;
  const deadline = Date.now() + 480e3;
  let col = st.col || "orders"; let lastDay = st.lastDay ?? null; let lastId = st.lastId ?? null; let n = 0;
  while (Date.now() < deadline) {
    let q = db.collection(col).orderBy("상차일", "desc").orderBy("__name__", "desc").limit(200);
    if (lastDay !== null && lastId) q = q.startAfter(lastDay, db.collection(col).doc(lastId));
    const snap = await q.get();
    if (snap.empty) {
      if (col === "orders") { col = "dispatch"; lastDay = null; lastId = null; continue; }
      await ref.set({ done: true, ver: 1, finishedAt: FieldValue.serverTimestamp() }, { merge: true });
      console.log(`[역할 사본] 채우기 끝 (+${n})`);
      return null;
    }
    for (const d of snap.docs) {
      await _roleMirror.syncOne(db, FieldValue, col, d.id, null, d.data() || {}, { force: true }).catch((e) => console.warn("[역할 사본] 채우기 실패:", col, d.id, e?.message || e));
      n += 1;
    }
    const last = snap.docs[snap.docs.length - 1];
    lastDay = String(last.data()?.상차일 ?? ""); lastId = last.id;
    await ref.set({ col, lastDay, lastId, ver: 1, done: false, count: FieldValue.increment(snap.size), at: FieldValue.serverTimestamp() }, { merge: true });
  }
  console.log(`[역할 사본] 채우는 중 — 이번 ${n}건(다음 실행에서 이어서)`);
  return null;
});

// 🔒 2026-11-23 화주 메신저 — 연동 운송사 직원 대화 상대 목록(공유해도 되는 칸만: 이름 · 직급 · 팀 · 사진)
//  예전엔 화주 화면이 연동 운송사 직원 문서(users)를 통째로 받아 휴대폰 · 이메일 · 인사 기록 · 퇴사 사유까지 브라우저에 왔다.
//  이제 보안 규칙은 화주가 운송사 직원 문서를 못 읽게 막고, 이 함수가 필요한 칸만 돌려준다(승인 · 재직 중인 사무 직원만 — 기사 제외).
exports.linkedStaffList = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "linkedStaffList"))) return;
  try {
    const m = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
    const tok = m ? await getAuth().verifyIdToken(m[1]).catch(() => null) : null;
    if (!tok) { res.status(401).json({ error: "NO_TOKEN" }); return; }
    const me = (await db.collection("users").doc(tok.uid).get()).data() || {};
    if (me.role !== "shipper" || me.approved === false || me.employmentStatus === "퇴사") { res.status(403).json({ error: "SHIPPER_ONLY" }); return; }
    const co = String(me.linkedTransportCompany?.companyName || "").trim();
    if (!co) { res.status(200).json({ company: "", staff: [] }); return; }
    const [us, ps] = await Promise.all([
      db.collection("users").where("companyName", "==", co).get(),
      db.collection("chat_profiles").where("company", "==", co).get().catch(() => ({ docs: [] })),
    ]);
    const prof = new Map(ps.docs.map((d) => [d.id, d.data() || {}]));
    const staff = us.docs.map((d) => ({ uid: d.id, x: d.data() || {} }))
      .filter(({ x }) => x.approved !== false && x.employmentStatus !== "퇴사" && !["driver", "shipper", "cafeUser", "viewer", "totalMaster"].includes(x.role))
      .map(({ uid, x }) => { const p = prof.get(uid) || {}; return { uid, name: p.name || x.name || "", position: x.position || x.직책 || p.position || "", team: x.team || "", photo: p.photo || x.photo || "", statusMsg: p.statusMsg || "" }; });
    res.set("Cache-Control", "no-store");
    res.status(200).json({ company: co, staff });
  } catch (e) { console.error("linkedStaffList 실패:", e); res.status(500).json({ error: "FAILED" }); }
});

// 🏢 2026-11-24 여러 회사 계정 — 내가 오갈 수 있는 회사들의 회사코드(로그인 화면 [회사코드 찾기] · 로그인 때 코드 확인)
//  보안 규칙상 다른 회사 가입 신청서(코드)는 직접 못 읽어서 서버가 대신 찾는다. 최고관리자가 정해 준 회사(multiCompanies)만 돌려준다
const { multiCompaniesOf: mcList, canMulti: mcCan } = require("./multiCompany");
async function companyCodeOf(co) {
  const us = await db.collection("users").where("companyName", "==", co).select("companyCode").get().catch(() => ({ docs: [] })); // 색인 없이(같은 회사 직원만 · 코드 칸만)
  const c1 = us.docs.map((d) => d.data()?.companyCode).find((c) => typeof c === "string" && c.trim());
  if (c1) return String(c1);
  const apps = await db.collection("transportApplications").where("companyName", "==", co).get().catch(() => ({ docs: [] }));
  const hit = apps.docs.map((d) => d.data() || {}).find((a) => (a.status === "approved" || a.status === "승인") && a.companyCode);
  return String(hit?.companyCode || "");
}
exports.myCompanyCodes = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "myCompanyCodes"))) return;
  try {
    const m = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
    const tok = m ? await getAuth().verifyIdToken(m[1]).catch(() => null) : null;
    if (!tok) { res.status(401).json({ error: "NO_TOKEN" }); return; }
    const me = (await db.collection("users").doc(tok.uid).get()).data() || {};
    const home = String(me.companyName || "").trim();
    if (!home || !mcCan(me)) { res.status(200).json({ companies: [] }); return; }
    const list = [home, ...mcList(me)];
    const codes = await Promise.all(list.map((co, i) => (i === 0 && me.companyCode ? String(me.companyCode) : companyCodeOf(co))));
    res.set("Cache-Control", "no-store");
    res.status(200).json({ companies: list.map((co, i) => ({ companyName: co, companyCode: codes[i] || "", home: i === 0 })) });
  } catch (e) { console.error("myCompanyCodes 실패:", e); res.status(500).json({ error: "FAILED" }); }
});

// 🔒 2026-11-23 연동 운송사(화주) · 소속 운송사(기사) 연락처 — 가입 신청서(직인 이미지 · 회사 코드 · 신청인 정보)를 통째로 읽던 것 대신
//  공유해도 되는 칸만: 회사명 · 대표자 · 사업자번호 · 주소 · 대표 전화 · 이메일(화주만 — 정산서 받을 주소) · 회사 코드(화주만 — 오더 전송용)
exports.linkedCompanyInfo = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "linkedCompanyInfo"))) return;
  try {
    const m = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
    const tok = m ? await getAuth().verifyIdToken(m[1]).catch(() => null) : null;
    if (!tok) { res.status(401).json({ error: "NO_TOKEN" }); return; }
    const me = (await db.collection("users").doc(tok.uid).get()).data() || {};
    if (me.approved === false || me.employmentStatus === "퇴사") { res.status(403).json({ error: "NOT_APPROVED" }); return; }
    const shipper = me.role === "shipper";
    if (!shipper && me.role !== "driver") { res.status(403).json({ error: "SHIPPER_OR_DRIVER_ONLY" }); return; }
    const co = String(shipper ? me.linkedTransportCompany?.companyName || "" : me.companyName || "").trim();
    if (!co) { res.status(200).json({ info: null }); return; }
    const snap = await db.collection("transportApplications").where("companyName", "==", co).get();
    const all = snap.docs.map((d) => d.data() || {});
    const a = all.find((x) => x.type === "신규" && x.status === "approved") || all.find((x) => x.status === "approved") || null;
    const info = !a ? { companyName: co } : {
      companyName: co, representative: a.representative || a.name || "", businessNumber: a.businessNumber || "",
      address: a.address || "", phone: a.phone || a.tel || a.연락처 || "",
      ...(shipper ? { email: a.email || "", companyCode: a.companyCode || "" } : {}),
    };
    // 기사 — 내 차량 보험사(교통사고 접수 버튼용). 차량 장부(비용 등)는 기사가 직접 읽지 않는다
    if (!shipper) {
      const plateKey = String(me.carNo || me.차량번호 || "").replace(/[^0-9가-힣A-Za-z]/g, "");
      if (plateKey) {
        let v = (await db.collection("vehicleLedger").doc(`${co.replace(/\//g, "_")}__${plateKey}`).get().catch(() => null))?.data() || null;
        if (!v) v = (await db.collection("vehicleLedger").where("companyName", "==", co).where("plateKey", "==", plateKey).limit(1).get().catch(() => null))?.docs?.[0]?.data() || null;
        if (v) info.insurer = { 보험사: String(v.보험사 || ""), 보험사전화: String(v.보험사전화 || "") };
      }
    }
    res.set("Cache-Control", "no-store");
    res.status(200).json({ info });
  } catch (e) { console.error("linkedCompanyInfo 실패:", e); res.status(500).json({ error: "FAILED" }); }
});

exports.findCompany = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "findCompany"))) return; // 🛡 App Check(functions/appCheck.js)
  const q = String(req.query.q || "").trim().toLowerCase();
  const exact = req.query.exact === "1";
  const all = req.query.all === "1"; // 가입 화면이 열릴 때 목록을 한 번에 받아 입력 즉시 드롭다운으로 거른다
  if (req.query.ping === "1") { res.status(200).json({ ok: true }); return; }
  if (!all && (!q || q.length > 60)) { res.status(200).json({ results: [] }); return; }
  // ⭐ 2026-11-01 신규 가입 회사명 중복확인 — 승인된 회사 + 승인 대기 중인 신규 신청까지(띄어쓰기·대소문자 무시). 결과는 있음/없음만
  if (req.query.dup === "1") {
    try {
      // 🔒 2026-11-23 회사 메일 · 급여 비밀번호 보관 이름(safeId — 공백 · / · # · ? · [ ] · _ 를 같은 글자로 본다)이 겹치는 이름도 "이미 있음"
      //  (예: "한국 운송" 과 "한국_운송" — 겹치면 나중 회사가 앞 회사 메일함 · 급여 비밀번호에 닿을 수 있었다)
      const norm = (x) => String(x || "").toLowerCase().replace(/[\s/#?[\]_]+/g, "").slice(0, 80);
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
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
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
    res.status(500).json({ results: [], error: pubErrMsg(e) });
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
// ⭐ 2026-11-07 초기화 엔진(찾기·보관·삭제·이어하기·회사 잠금·취소하고 정리)은 functions/resetJob.js로 옮겼다 — 멈춤 원인과 고친 내용은 그 파일 머리말
const {
  makeResetJob, collectStoragePaths, RESET_KEEP_DAYS, RESET_LEGACY_COMPANY,
} = require("./resetJob");
const resetJob = makeResetJob({
  db, FieldValue, Timestamp, GeoPoint: require("firebase-admin/firestore").GeoPoint,
  getBucket: () => resetBucket(), getAuth,
  setBulkMode: (c, on, o) => setBulkMode(c, on, o), bumpDataVersion: (c) => bumpDataVersion(c),
  markContractEnded: (c, by, reason) => markContractEnded(c, by, reason),
});
const { decodeFsValue, previewCompanyReset } = resetJob;

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

// 한 번 실행에 일하는 시간 — 2세대(60분 제한)는 45분, 1세대 예전 주소(9분 제한)는 7분. 시험할 때만 KP_RESET_BUDGET_MS로 줄인다.
const RESET_RUN_BUDGET_MS = Number(process.env.KP_RESET_BUDGET_MS) || 45 * 60000;
const RESET_RUN_BUDGET_V1_MS = Math.min(RESET_RUN_BUDGET_MS, 7 * 60000);

function resetBucket() {
  const { getStorage } = require("firebase-admin/storage");
  return getStorage().bucket();
}

// 보관함 비우기 · 이력 지우기 — functions/resetPurge.js (400개씩 묶어서, 시간이 다 되면 멈췄다가 이어서)
//  보관한 문서·목록·파일 삭제, (계정까지 지운 초기화였고 복원 안 했으면) 사용 중지해둔 계정 완전 삭제
const resetPurge = require("./resetPurge").makeResetPurge({ db, FieldValue, getBucket: () => resetBucket(), getAuth });

// 계약종료 표시(초기화와 함께 쓰는 경우 — 삭제 전에 먼저 막는다)
async function markContractEnded(company, by, reason) {
  await db.collection("companyPlans").doc(company).set({
    status: "ended", endedAt: FieldValue.serverTimestamp(), endedAtYmd: kstDateStr(), endedBy: by, endReason: reason || "",
  }, { merge: true });
}

// budgetMs: 이 주소(함수)의 한 번 실행 시간 — 함수 제한 시간보다 충분히 짧아야 묶음 하나를 끝내고 멈출 수 있다
function makeCompanyResetHandler(budgetMs) {
  return async function companyResetHandler(req, res) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (!(await appCheckGate(req, res))) return; // 🛡 App Check(functions/appCheck.js)
    if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    let prog = null;
    let step = "시작";
    let bulkCompany = null; // 알림 일시 중지 중인 회사(실패해도 꼭 풀어준다)
    let lease = null;
    const t0 = Date.now();
    const timeUp = () => Date.now() - t0 > budgetMs;
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
        // ⭐ 끝나지 않은 작업에는 "지금 돌고 있는지(잠금 임대) / 마지막 신호"를 붙여 [이어서 진행] · [취소하고 정리]를 고를 수 있게
        const described = await resetJob.describe(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        res.json({
          keepDays: RESET_KEEP_DAYS,
          now: Date.now(),
          backups: described.map((b) => ({
            id: b.id, company: b.company, by: b.by, at: b.at?.toMillis?.() || null, expiresAt: b.expiresAt?.toMillis?.() || (b.expiresAt instanceof Date ? b.expiresAt.getTime() : null),
            status: b.status, phase: b.phase || "", docCount: b.docCount || 0, fileCount: b.fileCount || 0, deleteAccounts: !!b.deleteAccounts,
            endContract: !!b.endContract, accounts: (b.accountUids || []).length, restoredAt: b.restoredAt?.toMillis?.() || null, restoredBy: b.restoredBy || "",
            lastError: b.lastError || "", lastStep: b.lastStep || "", totalPaths: b.totalPaths || 0, skippedDocs: b.skippedDocs || 0, skippedFiles: b.skippedFiles || 0,
            legacy: b.status === "saving" && (!b.phase || b.phase === "backup"),
            unfinished: !!b.unfinished, alive: !!b.alive, lastBeat: b.lastBeat || null, jobStep: b.jobStep || "", jobPct: b.jobPct || 0,
            canResume: !!b.canResume, canCancel: !!b.canCancel, deleteStarted: !!b.deleteStarted, cancelling: !!b.cancelling,
            cancelledAt: b.cancelledAt?.toMillis?.() || null,
          })),
        });
        return;
      }

      if (action === "restore") {
        const jobId = String(body.jobId || "").replace(/[^\w-]/g, "").slice(0, 60) || `job_${Date.now()}`;
        const ref = db.collection("resetBackups").doc(String(body.backupId || "x"));
        const snap0 = await ref.get();
        if (!snap0.exists) throw Object.assign(new Error("보관된 초기화 기록을 찾을 수 없습니다."), { status: 404 });
        const base = { action: "restore", by: me.email || me.uid, backupId: ref.id, company: snap0.data().company || "" };
        prog = resetJob.makeProgress(jobId, base);
        const cur = (await prog.ref.get()).data();
        if (cur?.status === "done") { res.json(cur.result || { ok: true }); return; }
        await verifyResetPassword(body.password);
        // 같은 회사의 초기화·복원이 동시에 돌지 않게 회사 잠금
        const got = await resetJob.acquire({ company: base.company, jobId, kind: "restore", by: base.by, base });
        if (!got.ok) {
          if (got.holder === jobId) { res.json({ busy: true }); return; }
          throw Object.assign(new Error("이 운송사의 다른 초기화·복원 작업이 진행 중입니다. 끝난 뒤 다시 해 주세요."), { status: 409 });
        }
        lease = got.lease;
        step = "복원 준비";
        await prog.set(1, "복원 준비 중", true);
        const snap = await ref.get();
        const b = snap.data();
        if (b.status !== "kept" && b.status !== "restoring") {
          throw Object.assign(new Error(b.status === "restored" ? "이미 복원된 기록입니다." : b.status === "cancelled" ? "취소하고 정리한 작업이라 복원할 것이 없습니다." : b.purgeManual ? "영구 삭제한 기록이라 복원할 수 없습니다." : "보관 기간이 지나 복원할 수 없습니다."), { status: 400 });
        }
        if (b.status === "kept" && b.phase !== "done") throw Object.assign(new Error("초기화가 아직 끝나지 않았습니다. 보관함에서 [이어서 진행]으로 먼저 끝내 주세요."), { status: 409 });
        await ref.set({ status: "restoring" }, { merge: true });
        bulkCompany = b.company;
        await setBulkMode(b.company, true);
        const bucket = resetBucket();
        let restoredDocs = b.restoredDocs || 0;
        let last = b.restoreCursor ? ref.collection("docs").doc(b.restoreCursor) : null;
        step = "데이터 되돌리기";
        let rWorked = false;
        for (;;) {
          lease.assert();
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
              const [buf] = await resetJob.withTimeout(bucket.file(x.file).download(), `큰 문서 ${x.path}`);
              data = decodeFsValue(JSON.parse(buf.toString("utf8")));
            }
            writer.set(db.doc(x.path), data || {}).catch(() => {}); restoredDocs += 1;
          }
          await writer.close();
          last = page.docs[page.docs.length - 1];
          await lease.commit((tx) => { tx.set(ref, { restoreCursor: last.id, restoredDocs }, { merge: true }); });
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
          lease.touch();
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

      // ⭐ [취소하고 정리] — 삭제가 시작되기 전 작업만. 보관함 복사본만 지우고 잠금을 푼다(운영 데이터는 그대로)
      if (action === "cancel") {
        const backupId = String(body.backupId || "").replace(/[^\w-]/g, "").slice(0, 60);
        if (!backupId) { res.status(400).json({ error: "취소할 작업을 고르세요." }); return; }
        const snap = await db.collection("resetBackups").doc(backupId).get();
        const company = snap.exists ? String(snap.data().company || "") : "";
        if (snap.exists && String(body.confirmName || "").trim() !== company) throw Object.assign(new Error("확인용 회사명이 일치하지 않습니다."), { status: 400 });
        await verifyResetPassword(body.password);
        step = "취소하고 정리";
        const r = await resetJob.cancel({ backupId, by: me.email || me.uid, budgetMs: Math.min(budgetMs, 8 * 60000) });
        if (r.done) console.log(`✕ 초기화 취소하고 정리: ${company} ${backupId} — 보관 복사본 ${r.docs}, 파일 ${r.files} (by ${me.email})`);
        res.json(r);
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
        //  같은 회사의 끝나지 않은 작업이 있으면 {redirect: 그 작업ID}를 돌려준다 → 화면이 그 작업을 이어서 부른다
        const jobId = String(body.jobId || "").replace(/[^\w-]/g, "").slice(0, 60) || `job_${Date.now()}`;
        const done0 = (await db.collection("resetJobs").doc(jobId).get()).data();
        if (done0?.status === "done" && done0.result) { res.json(done0.result); return; }
        await verifyResetPassword(body.password);
        if ((endContract || body.confirmName !== undefined) && String(body.confirmName || "").trim() !== company) {
          throw Object.assign(new Error("확인용 회사명이 일치하지 않습니다."), { status: 400 });
        }
        step = "초기화";
        const r = await resetJob.execute({ jobId, company, deleteAccounts, endContract, by: me.email || me.uid, budgetMs });
        if (r.done) { res.json({ ...r.result, perCollection: r.perCollection || {} }); return; }
        if (r.redirect) { res.json({ redirect: r.redirect, company, deleteAccounts: r.deleteAccounts, endContract: r.endContract }); return; }
        if (r.partial) { res.json({ partial: true }); return; }
        if (r.cancelled) { res.json({ cancelled: true }); return; }
        res.json({ busy: true, holder: r.holder || "", lost: !!r.lost }); // 다른 실행이 돌고 있음 → 화면은 진행률만 지켜본다
        return;
      }

      res.status(400).json({ error: "알 수 없는 요청입니다." });
    } catch (e) {
      console.error(`운송사 초기화 오류 [${e?.step || step}]:`, e);
      if (bulkCompany) await setBulkMode(bulkCompany, false);
      const fatal = !!(e.status && e.status >= 400 && e.status < 500);
      if (prog) await prog.fail(e?.message || String(e), fatal, step); // (초기화 실행은 resetJob.execute가 직접 적는다)
      res.status(e.status || 500).json({ error: pubErrMsg(e), step: e?.step || step });
    } finally {
      if (lease) await lease.release();
    }
  };
}

// 예전 주소(1세대, 9분 제한) — 목록·상태·미리보기 같은 짧은 요청용. 실행이 이리로 와도 7분씩 끊어서 이어간다.
exports.companyReset = functions
  .runWith({ timeoutSeconds: 540, memory: "2GB" })
  .https.onRequest(makeCompanyResetHandler(RESET_RUN_BUDGET_V1_MS));
// ⭐ 초기화·복원·취소 실행용 — 2세대(최대 60분). 한 번 실행은 45분만 일하고 {partial:true} → 화면이 바로 다시 부른다.
//  concurrency: 1 — 인스턴스 하나에 요청 하나만(기본 80개가 같은 4GiB를 나눠 쓰다 메모리 초과로 함께 죽던 문제)
const { onRequest: onRequestV2 } = require("firebase-functions/v2/https");
exports.companyResetJob = onRequestV2(
  { region: "us-central1", timeoutSeconds: 3600, memory: "4GiB", cpu: 2, concurrency: 1, maxInstances: 20, invoker: "public" },
  makeCompanyResetHandler(RESET_RUN_BUDGET_MS),
);

// ⏰ 매일 새벽 — 보관 기간(7일)이 지난 초기화 보관함을 비운다
//  2026-11-07 기본 60초 제한에 큰 보관함(recursiveDelete)이 끊기던 문제 → 9분 제한 + 8분 동안 400개씩 지우고, 남으면 다음 날 이어서
exports.purgeExpiredResetBackups = functions
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .pubsub.schedule("every day 04:10")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const t0 = Date.now();
    const r = await resetPurge.purgeExpired({ deadline: () => Date.now() - t0 > 8 * 60000 });
    console.log(`✕ 만료된 초기화 보관함 정리 — 확인 ${r.checked}건, 비움 ${r.purged}건, 남음 ${r.pending}건`);
    return null;
  });

// ⭐ 2026-11-17 예전 부서 이름 → 새 부서 이름(경리/회계팀 · 인사팀 · 운영팀 → 경영지원팀, 운송팀 → 물류운송팀) — functions/teamMigrate.js (사용자 승인)
//  배포 뒤 첫 실행에서 직원 · 전자결재 · 공지 · 인사 · 급여 등 문서 전체를 한 번 훑어 바꾸고(나눠서 이어 감), 그다음부터는 예전 이름이 새로 적힌 문서만 고친다
const _teamMigrate = require("./teamMigrate").makeTeamMigrator({ db });
exports.migrateLegacyTeams = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("every 30 minutes")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const t0 = Date.now();
    const r = await _teamMigrate({ deadline: () => Date.now() - t0 > 8 * 60000 });
    if (r.changed || !r.full) console.log(`🏷 부서 이름 정리 — 확인 ${r.scanned}건, 바꿈 ${r.changed}건${r.full ? "" : " (다음 실행에서 이어서)"}`, JSON.stringify(r.by));
    return null;
  });

// 🧹 2026-11-14 매일 새벽 — 7일 지난 접속 이력(로그인·로그아웃 기록 · 끝난 로그인 · 보안 알림)을 지운다(functions/accessLogPurge.js)
const _accessLogPurge = require("./accessLogPurge");
exports.purgeOldAccessLogs = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("every day 04:25")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const t0 = Date.now();
    const r = await _accessLogPurge.purgeAccessLogs({ db, Timestamp, deadline: () => Date.now() - t0 > 8 * 60000 });
    console.log(`🧹 접속 이력 정리(${_accessLogPurge.RETENTION_DAYS}일 지난 것) — 접속기록 ${r.sessionLogs.n}, 끝난 로그인 ${r.loginSessions.n}, 보안 알림 ${r.securityEvents.n}`);
    return null;
  });

// ⭐ 2026-11-07 보관함 지금 영구 삭제 · 이력 지우기 (최고관리자 + 초기화 비밀번호 + 확인 문구)
//  POST .../companyResetPurge  (Authorization: Bearer <ID 토큰>)
//   { mode: "purge" | "history", backupId?: 보관함ID, all?: true, password, confirmText }
//   - confirmText: 하나면 그 운송사 회사명, 모두면 "영구삭제"
//   - 8분 일하고 { partial: true, ...이번에 지운 개수 }로 돌려준다 → 화면이 바로 다시 불러 이어서(몇 번 불러도 안전)
//   - 운영 중인 회사 데이터는 건드리지 않는다(resetBackups·resetLogs·resetJobs, Storage resetBackups/{id}/만)
const RESET_PURGE_WORD = "영구삭제";
async function companyResetPurgeHandler(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "companyResetPurge"))) return; // 🛡 App Check(functions/appCheck.js)
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const me = await requireTotalMaster(req);
    const mode = body.mode === "history" ? "history" : body.mode === "purge" ? "purge" : "";
    if (!mode) { res.status(400).json({ error: "알 수 없는 요청입니다." }); return; }
    const all = body.all === true;
    const backupId = String(body.backupId || "").replace(/[^\w-]/g, "").slice(0, 60);
    if (!all && !backupId) { res.status(400).json({ error: "지울 보관함을 고르세요." }); return; }
    const confirmText = String(body.confirmText || "").trim();
    if (all) {
      if (confirmText !== RESET_PURGE_WORD) throw Object.assign(new Error(`확인 문구 "${RESET_PURGE_WORD}"를 그대로 입력해 주세요.`), { status: 400 });
    } else {
      const snap = await db.collection("resetBackups").doc(backupId).get();
      const company = snap.exists ? String(snap.data().company || "") : "";
      if (confirmText !== RESET_PURGE_WORD && (!company || confirmText !== company)) {
        throw Object.assign(new Error("확인용 회사명이 일치하지 않습니다."), { status: 400 });
      }
    }
    await verifyResetPassword(body.password);
    const t0 = Date.now();
    const r = await resetPurge.run({ mode, backupId, all, by: me.email || me.uid, deadline: () => Date.now() - t0 > 8 * 60000 });
    console.log(`✕ 초기화 ${mode === "history" ? "이력 지우기" : "보관함 영구 삭제"}${all ? "(모두)" : ` ${backupId}`} — 보관함 ${r.backups}, 문서 ${r.docs}, 파일 ${r.files}, 계정 ${r.accounts}, 기록 ${r.logs + r.jobs + r.history}${r.done ? "" : " (이어서)"} (by ${me.email})`);
    res.json({ ...r, partial: !r.done });
  } catch (e) {
    console.error("초기화 보관함 영구 삭제 오류:", e);
    res.status(e.status || 500).json({ error: pubErrMsg(e) });
  }
}
exports.companyResetPurge = onRequestV2(
  { region: "us-central1", timeoutSeconds: 540, memory: "1GiB", invoker: "public" },
  companyResetPurgeHandler,
);

/* ==================================================================
   ⭐ 2026-11-06 이용 계약 만료 안내 — 매일 아침(KST 09:12) companyPlans/{회사}.contractEnd를 보고
   종료 30일 · 7일 · 1일 전에 그 회사 대표·임원·경리·마스터(·운송관리자)에게
     ① 알림(notifications — PC 홈·모바일 가운데 알림)  ② 메일(사람 메일 + 회사 청구 메일)을 보낸다.
   같은 안내는 두 번 보내지 않는다: companyPlans/{회사}.contractNotices["<종료일>_<30|7|1>"]에 기록(트랜잭션으로 먼저 잡음).
   종료일을 바꾸면 키가 바뀌어 새 일정으로 다시 안내한다. 계약종료(status "ended")된 회사는 건너뛴다.
   ✉️ 2026-11-08 메일은 플랫폼 발송 계정(비밀값 PLATFORM_SMTP_USER · PLATFORM_SMTP_PASS — functions/companyMail.js sendPlatformMail)으로 보낸다.
   비밀값이 없거나 "none"이면 메일만 건너뛰고 로그를 남긴다(알림은 그대로). 예전 /api/send-email(한 운송사 계정)은 닫았다.
   관리센터 › 이용 계약에서 "지금 확인"으로 바로 돌려볼 수 있다(contractNoticeRun).
================================================================== */
const CONTRACT_NOTICE_DAYS = [1, 7, 30];
const CONTRACT_NOTICE_ROLES = ["test", "acctStaff", "hrAcct", "allMgr", "admin"];
const CONTRACT_EXEC_POSITIONS = ["이사", "상무", "전무", "부사장", "사장", "대표", "대표이사", "본부장", "임원"];
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

// ✉️ 2026-11-08 운송사별 발신 메일 · 플랫폼 메일 — 설명은 functions/companyMail.js 맨 위
const _companyMailLib = require("./companyMail");
const getNodemailer = () => require("nodemailer");
const sendPlatformMail = _companyMailLib.makePlatformMailer({ getNodemailer });
const PLATFORM_MAIL_SECRETS = ["PLATFORM_SMTP_USER", "PLATFORM_SMTP_PASS"];
async function sendContractMail(to, subject, html) {
  if (!to.length) return { ok: true, skipped: true };
  const cfg = (await db.collection("siteConfig").doc("contractNotice").get().catch(() => null))?.data() || {};
  if (cfg.mailEnabled === false) return { ok: true, skipped: true, reason: "메일 끔" };
  return sendPlatformMail(to, subject, html, { fromName: "LogisWeb 운영팀" });
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
exports.contractExpiryNotices = functions.runWith({ secrets: PLATFORM_MAIL_SECRETS }).pubsub
  .schedule("every day 09:12")
  .timeZone("Asia/Seoul")
  .onRun(async () => { await runContractExpiryNotices(); return null; });
// 관리센터 › 이용 계약 › "지금 확인" — { dryRun, company } (최고관리자만)
exports.contractNoticeRun = functions.runWith({ secrets: PLATFORM_MAIL_SECRETS }).https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "contractNoticeRun"))) return; // 🛡 App Check(functions/appCheck.js)
  try {
    const me = await requireTotalMaster(req);
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    res.json(await runContractExpiryNotices({ dryRun: body?.dryRun !== false, onlyCompany: String(body?.company || ""), by: me.email || me.uid }));
  } catch (e) {
    res.status(e.status || 500).json({ error: pubErrMsg(e) });
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
// 🔒 2026-11-07 구글시트 주인 회사 확인(functions/sheetGuard.js) — 배차표·시트 연결이 다른 회사 시트를 열지 못하게
const sheetGuard = require("./sheetGuard").makeSheetGuard({
  db, FieldValue, parseSpreadsheetId: (u) => parseSpreadsheetId(u),
  fixedOwners: {},
});
// 시트 연결(sheetConnect.js)용 — 그 파일을 고치지 않고, 요청한 사람(회사)을 기억해 두었다가 시트 API를 부르기 직전에 주인 회사를 확인한다.
//  (한 요청 = 한 함수 실행이라 AsyncLocalStorage로 요청마다 따로 기억)
const { AsyncLocalStorage } = require("async_hooks");
const sheetCaller = new AsyncLocalStorage();
async function guardedRequireStaff(req, body) {
  const me = await requireStaff(req, body);
  const st = sheetCaller.getStore(); if (st) st.me = me;
  return me;
}
async function guardedRequireAdminRole(req, body) {
  const me = await requireAdminRole(req, body);
  const st = sheetCaller.getStore(); if (st) st.me = me;
  return me;
}
async function guardSheetOwnerNow(spreadsheetId) {
  const st = sheetCaller.getStore();
  const me = st?.me;
  if (!me) throw Object.assign(new Error("로그인이 필요합니다."), { status: 401 });
  if (!st.ok?.has(spreadsheetId)) {
    await sheetGuard.assertSheetOwner(spreadsheetId, me.company, { isTM: me.isTM, by: me.email });
    (st.ok || (st.ok = new Set())).add(spreadsheetId);
  }
}
async function guardedSheetsApiFor(spreadsheetId, method, path, opts) {
  await guardSheetOwnerNow(spreadsheetId);
  return sheetsApiAny(spreadsheetId, method, path, opts); // 엑셀 파일도 읽기(officeSheets)
}
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
  return (v.companies || []).includes(company || "(회사없음)");
}
// ⭐ 홈 화면 합계(PC에 하루 저장)를 다시 계산하라는 표시 — 초기화·복원·가져오기 취소가 끝나면 남긴다
function bumpDataVersion(company) {
  return db.collection("systemConfig").doc("dataVersion").set({ [company || "(회사없음)"]: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
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
  const ud = u.exists ? effectiveUser(u.data()) : {};
  const isTM = decoded.email === "tjddnqkf@naver.com" || ud.role === "totalMaster";
  // 🔒 2026-11-07 승인 전·퇴사 계정은 거절(예전엔 가입만 하고 승인 안 된 "관리자" 계정도 다른 회사 이름으로 관리자 기능을 부를 수 있었다)
  if (!isTM && (!u.exists || ud.approved === false || ud.employmentStatus === "퇴사")) throw Object.assign(new Error("사용 권한이 없습니다."), { status: 403 });
  if (!isTM && !["admin", "allMgr"].includes(ud.role)) throw Object.assign(new Error("관리자만 사용할 수 있습니다."), { status: 403 });
  const company = isTM ? String(body?.company || ud.companyName || "(회사없음)") : String(ud.companyName || "(회사없음)");
  return { decoded, isTM, company, email: decoded.email || "" };
}

// 배차 업무 직원(관리자·실무자 등) — 기사·화주 제외. 회사는 본인 소속(최고관리자는 화면에서 고른 회사)
async function requireStaff(req, body) {
  const authz = String(req.get("Authorization") || "");
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) throw Object.assign(new Error("로그인이 필요합니다."), { status: 401 });
  const decoded = await getAuth().verifyIdToken(token);
  const u = await db.collection("users").doc(decoded.uid).get();
  const ud = u.exists ? effectiveUser(u.data()) : {};
  const isTM = decoded.email === "tjddnqkf@naver.com" || ud.role === "totalMaster";
  if (!isTM && (ud.approved === false || ["driver", "shipper", "cafeUser"].includes(ud.role) || !u.exists || ud.employmentStatus === "퇴사")) throw Object.assign(new Error("사용 권한이 없습니다."), { status: 403 }); // 🔒 2026-11-07 퇴사·배차마당 계정 제외
  const company = isTM ? String(body?.company || ud.companyName || "(회사없음)") : String(ud.companyName || "(회사없음)");
  return { decoded, isTM, company, email: decoded.email || "", name: ud.name || "" };
}

// 🗑️ 휴지통 — 오더가 어떤 화면·경로로 지워지든(PC·모바일·선택삭제·기사앱) 지우기 직전 내용을 7일 보관한다.
//    (예전엔 삭제 기록에 오더 번호만 남아 Firebase 시점 복구 설정이 없으면 되살릴 수 없었다)
// ⚡ 2026-11-23 휴지통을 없애 아무 일도 안 하는데 모든 삭제마다 불리던 함수 — 배포에서 뺌
const _archiveDeletedOrderOff = () => functions.firestore.document("{col}/{orderId}").onDelete(async (snap, ctx) => {
  const { col, orderId } = ctx.params;
  if (!["orders", "dispatch"].includes(col)) return;
  return; // 🗑 2026-11-14 사용자 요청 — 휴지통 기능을 없앴다. 지운 오더를 더는 보관하지 않는다(남아 있던 보관분은 매시간 정리 때 모두 지운다)
  // eslint-disable-next-line no-unreachable
  const data = snap.data();
  if (!data || data.source === "transport_transmit") return; // 화주사 전송 사본은 원본이 따로 있다
  if (data._seed) return; // 🧪 테스트 데이터는 휴지통에 넣지 않는다
  const company = data.companyName || "(회사없음)";
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
  차량번호: data.차량번호 || "", 청구운임: data.청구운임 || 0, 배차상태: data.배차상태 || "", 회사: data.companyName || "(회사없음)",
});

//  POST { action: "list", from, to }  → 그 기간(지운 날, 한국시간)에 지운 오더 — 휴지통 우선, 없으면(최고관리자) 시점 복구로 읽기
//  POST { action: "restore", items: [{ col, id, at }] } → 되살리기(알림은 막고 넣는다)
exports.restoreDeleted = functions.runWith({ timeoutSeconds: 300, memory: "512MB" }).https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "restoreDeleted"))) return; // 🛡 App Check(functions/appCheck.js)
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const me = await requireAdminRole(req, body);
    const mine = (c) => me.isTM || (c || "(회사없음)") === me.company;
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
      const companies = [...new Set(got.map((g) => g.data.companyName || "(회사없음)"))];
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
    res.status(e.status || 500).json({ error: pubErrMsg(e) });
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
    if (company && (tp.companyName || "(회사없음)") !== company) continue;
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
      // 🔒 2026-11-23 회사는 정기 오더 문서(규칙이 확인한 회사)로만 — 안쪽 오더 값(order.companyName)으로 다른 운송사 오더를 만들 수 있었다
      companyName: tp.companyName || "(회사없음)", company: tp.companyName || "",
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
      if (x.source === "transport_transmit" || isCanceledOrder(x) || (x.companyName || "(회사없음)") !== company) return;
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
    .filter((u) => !u._seed && !NON_STAFF_ROLES.has(u.role) && u.role !== "totalMaster" && u.approved !== false && u.employmentStatus !== "퇴사"); // 🧪 테스트용 가짜 직원 생일은 알리지 않는다
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

// 💸 2026-11-15 회사별 "지급 처리할 사람" 표시 — companyPayFlags/{회사} { finStaff, finCapable, payFallback }
//  · finStaff: 경리관리자 · 경리사무원 · 재무/경리/회계/총무 부서 직원 수(전담 경리)
//  · finCapable: 위 + 통합관리자 · 통합인사관리자 · 회사 마스터(경리 화면으로 지급 처리 가능)
//  · payFallback: finCapable 이 0명 → 지출결의의 최종 결재자가 지급 완료를 할 수 있다(firestore.rules approvals · src/Approval.jsx canPay)
//  직원 계정의 권한 · 부서 · 승인 · 퇴사 · 회사가 바뀔 때만 다시 센다
const PAY_FIN_TEAM = /재무|경리|회계|총무/;
const PAY_FLAG_KEYS = ["role", "team", "isMaster", "approved", "employmentStatus", "companyName"];
async function recomputePayFlags(co) {
  if (!co) return;
  const snap = await db.collection("users").where("companyName", "==", co).get();
  let finStaff = 0; let finCapable = 0;
  snap.docs.forEach((d) => {
    const u = d.data() || {};
    if (u.approved === false || u.employmentStatus === "퇴사" || ["driver", "shipper", "totalMaster", "cafeUser"].includes(u.role)) return;
    const staff = ["test", "acctStaff"].includes(u.role) || PAY_FIN_TEAM.test(String(u.team || ""));
    if (staff) finStaff += 1;
    if (staff || ["hrAcct", "allMgr"].includes(u.role) || u.isMaster === true) finCapable += 1;
  });
  await db.collection("companyPayFlags").doc(co).set({ finStaff, finCapable, payFallback: finCapable === 0, at: Date.now() });
}
exports.companyPayFlagsSync = functions.firestore.document("users/{uid}").onWrite(async (ch) => {
  const b = ch.before.exists ? ch.before.data() : null; const a = ch.after.exists ? ch.after.data() : null;
  if (b && a && PAY_FLAG_KEYS.every((k) => JSON.stringify(b[k] ?? null) === JSON.stringify(a[k] ?? null))) return null;
  const cos = [...new Set([b?.companyName, a?.companyName].map((c) => String(c || "").trim()).filter(Boolean))];
  for (const co of cos) await recomputePayFlags(co).catch((e) => console.error("[지급 처리 표시]", co, e?.message || e));
  return null;
});

exports.hourlyJobs = functions.runWith({ timeoutSeconds: 300, memory: "512MB" }).pubsub.schedule("5 * * * *").timeZone("Asia/Seoul").onRun(async () => {
  // 💸 2026-11-15 처음 한 번 — 모든 회사의 지급 처리 표시를 만든다(그 뒤로는 직원 계정이 바뀔 때마다 companyPayFlagsSync)
  try {
    const meta = await db.collection("companyPayFlags").doc("_meta").get();
    if (!meta.exists || meta.data().v !== 1) {
      const all = await db.collection("users").select("companyName").get();
      const cos = [...new Set(all.docs.map((d) => String(d.get("companyName") || "").trim()).filter((c) => c && c !== "_meta"))];
      for (const co of cos) await recomputePayFlags(co).catch(() => {});
      await db.collection("companyPayFlags").doc("_meta").set({ v: 1, at: Date.now(), companies: cos.length });
    }
  } catch (e) { console.error("[지급 처리 표시 초기화]", e?.message || e); }
  const hour = new Date(Date.now() + KST_MS).getUTCHours();
  const today = kstDateStr();
  const tpls = await db.collection("recurringOrders").where("active", "==", true).get();
  for (const t of tpls.docs) {
    const tp = t.data();
    if (Number(tp.createHour ?? 17) !== hour) continue;
    const date = tp.createWhen === "same" ? today : addDaysStr(today, 1);
    await generateRecurringOrders(date, { ids: [t.id] }).catch((e) => console.error("정기오더 실패:", t.id, e));
  }
  // 🗑 2026-11-14 휴지통 폐지 — 남아 있는 보관분을 기한과 상관없이 모두 지운다(한 번에 400건씩, 비워질 때까지 매시간)
  const old = await db.collection("orderTrash").limit(400).get();
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
  // 🔒 2026-11-23 회사는 보낸 사람 계정 기준(메일 문서의 company 칸은 화면이 적어 다른 회사로 바꿀 수 있었다)
  let co = m.company || "(회사없음)";
  if (m.fromUid) { const f = await db.collection("users").doc(m.fromUid).get().catch(() => null); if (f?.exists && f.data().role !== "totalMaster") co = String(f.data().companyName || "").trim() || "(회사없음)"; }
  for (let i = 0; i < to.length; i += 100) {
    const docs = await db.getAll(...to.slice(i, i + 100).map((uid) => db.collection("users").doc(uid)));
    const pk = isOrder ? "인사발령" : m.kind === "closeReport" ? "마감보고" : "사내메일";
    docs.forEach((d) => { if (d.exists && String(d.data().companyName || "").trim() === co && co !== "(회사없음)" && isPushTypeEnabled(d.data().pushPrefs, pk)) tokens.push(...userTokens(d.data())); });
  }
  const head = isOrder ? "◆ 인사발령" : m.kind === "hr" ? "◆ 인사관리부" : m.kind === "closeReport" ? "▸ 마감보고" : m.kind === "approval" ? `✎ 전자결재 · ${m.fromName || ""}` : `▸ ${m.important ? "[중요] " : ""}${m.fromName || "사내메일"}`;
  const body = m.kind === "closeReport" ? String(m.body || "") : `${m.subject || ""}${m.body ? `\n${String(m.body).replace(/\s+/g, " ").slice(0, 80)}` : ""}`;
  await sendPushAndCleanup([...new Set(tokens)], { notification: { title: m.kind === "closeReport" ? `▸ ${m.subject || "마감보고"}` : head, body }, android: { priority: "high" } }, "사내메일");
}
exports.notifyInternalMail = functions.firestore.document("internalMails/{id}").onCreate(async (snap) => {
  const m = snap.data() || {};
  if (m._seed) return null; /* 🧪 테스트 데이터(_seed)는 알림 없음 */
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
  if (a._seed) return null; /* 🧪 테스트 데이터(_seed)는 알림 없음 */
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
    // 🔒 2026-11-23 결재 문서 회사(company) 사람에게만 — 결재선 · 참조에 다른 운송사 uid 를 넣어도 그 사람에게 안 간다
    const tok = u.exists && sameCoUser(u.data(), a.company || a.companyName) && isPushTypeEnabled(u.data().pushPrefs, pk) ? userTokens(u.data()) : [];
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
  const company = n.companyName || "(회사없음)";
  const teams = Array.isArray(n.teams) ? n.teams : [];
  const teamsN = teams.map(normTeamSrv).filter(Boolean);
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
      if (u.driverPushEnabled === false) return; // 🐞 2026-11-26 기사앱 설정에서 알림을 끈 기사에게는 공지 푸시도 보내지 않는다(다른 기사 알림과 같게)
    } else {
      if (!toStaff) return;
      // ⭐ 2026-11-03 지정 공지 비공개 — 직원·팀 지정이면 지정된 사람(팀원)에게만. 관리자·다른 직원에게는 보내지 않는다(작성자는 위에서 제외)
      // ⭐ 2026-11-17 부서 이름 정리 — 예전 이름(운영팀 → 경영지원팀 등)도 같은 팀으로 본다(src/notifyCore.js 와 같음)
      if (targetUids.size || teams.length) { if (!targetUids.has(d.id) && !teamsN.includes(normTeamSrv(u.team))) return; }
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
// ✍ 2026-11-10 운송계약서 → 기사앱 — 회사가 기사님께 계약서를 보내면 그 기사 휴대폰으로 푸시(기사앱 › 서류함 › 계약서에서 서명)
exports.driverContractPush = functions.firestore.document("driverContracts/{id}").onCreate(async (snap) => {
  const c = snap.data() || {};
  if (!c.driverId) return null;
  const u = await db.collection("users").doc(String(c.driverId)).get().catch(() => null);
  const ud = u?.exists ? u.data() || {} : null;
  if (!ud || ud.driverPushEnabled === false) return null;
  const tokens = userTokens(ud);
  if (!tokens.length) return null;
  await sendPushAndCleanup(tokens, {
    notification: { title: "계약서 서명 요청", body: `${c.companyName || "운송사"}에서 「${c.title || "운송계약서"}」을 보냈습니다. 서류함에서 확인 후 서명해 주세요.` },
    data: { type: "driver_contract", contractId: snap.id, tab: "docs" },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default" } } },
  }, "운송계약서").catch((e) => console.error("[운송계약서 푸시] 실패:", e));
  return null;
});
// 📍 2026-11-26 위치 설정 요청 — 관제현황에서 [위치 설정 요청]을 누르면 그 기사 휴대폰으로 푸시(앱을 열면 위치 설정 확인 창)
exports.driverLocFixPush = functions.firestore.document("driverLocFix/{id}").onCreate(async (snap) => {
  const r = snap.data() || {};
  if (!r.driverId) return null;
  const u = await db.collection("users").doc(String(r.driverId)).get().catch(() => null);
  const ud = u?.exists ? u.data() || {} : null;
  if (!ud) return null;
  if (r.companyName && ud.companyName && String(ud.companyName) !== String(r.companyName)) return null; // 다른 회사 기사에게는 보내지 않는다
  if (ud.driverPushEnabled === false) { await snap.ref.update({ pushResult: "push_off" }).catch(() => {}); return null; } // 기사님이 알림을 끈 경우(앱을 열면 창은 뜬다)
  const tokens = userTokens(ud);
  if (!tokens.length) { await snap.ref.update({ pushResult: "no_token" }).catch(() => {}); return null; }
  const res = await sendPushAndCleanup(tokens, {
    notification: { title: "위치 설정을 확인해 주세요", body: `${r.requestedByName || "배차 담당"}님 요청 — 회사에 위치가 안 가고 있어요. 눌러서 앱을 열어 주세요.` },
    data: { type: "loc_fix", tab: "home" },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default" } } },
  }, "위치 설정 요청").catch((e) => { console.error("[위치 설정 요청 푸시] 실패:", e); return null; });
  await snap.ref.update({ pushResult: res ? `ok ${res.successCount}/${tokens.length}` : "fail" }).catch(() => {});
  return null;
});
exports.notifyNotice = functions.firestore.document("notices/{id}").onCreate(async (snap) => {
  const n = snap.data() || {};
  if (n._seed) return null; /* 🧪 테스트 데이터(_seed)는 알림 없음 */
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
  if (h._seed) return null; /* 🧪 테스트 데이터(_seed)는 알림 없음 */
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

// 🆘 2026-11-26 기사앱 [SOS 긴급 알림] → 운송사 휴대폰 푸시
//  예전엔 emergency_alerts 에 적기만 하고 푸시가 없었다(기사 화면엔 "관리자에게 전송되었습니다") — 운송사 화면을 켜 둔 사람만 알았다.
//  받는 사람: 그 회사 배차 담당(알림 설정 "기사 긴급(SOS)" — 기본 켜짐, src/notifyAudience.js 기사긴급) + 그 기사의 담당자(설정과 상관없이 항상)
exports.notifyEmergencyAlert = functions.firestore.document("emergency_alerts/{id}").onCreate(async (snap) => {
  const a = snap.data() || {};
  if (a._seed || a.resolved === true) return null;
  try {
    const dSnap = a.uid ? await db.collection("drivers").doc(String(a.uid)).get().catch(() => null) : null;
    const drv = dSnap?.exists ? dSnap.data() || {} : {};
    const company = String(a.companyName || drv.companyName || PUSH_DEFAULT_COMPANY).trim();
    const tokens = new Set(await getTokensForType("기사긴급", company));
    const mgrUid = drv.담당자 && typeof drv.담당자 === "object" ? String(drv.담당자.uid || "") : "";
    if (mgrUid) {
      const u = await db.collection("users").doc(mgrUid).get().catch(() => null);
      if (u?.exists && sameCoUser(u.data(), company)) userTokens(u.data()).forEach((t) => tokens.add(t));
    }
    if (!tokens.size) return null;
    const name = String(a.driverName || drv.name || drv.이름 || "기사");
    const car = String(a.carNo || drv.carNo || drv.차량번호 || "");
    const loc = a.location && Number.isFinite(a.location.lat) ? ` · 위치 ${a.location.lat.toFixed(4)}, ${a.location.lng.toFixed(4)}` : " · 위치 없음";
    await sendPushAndCleanup([...tokens], {
      notification: { title: `🆘 긴급 · ${name}${car ? `(${car})` : ""}`, body: `기사님이 SOS 긴급 알림을 보냈어요. 바로 연락해 주세요${loc}` },
      data: { type: "fleet_sos", alertId: snap.id, target: "app", tag: `sos-${snap.id}` },
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } },
    }, "기사 SOS");
  } catch (e) { console.error("기사 SOS 푸시 실패:", e); }
  return null;
});

// 🕘 2026-11-26 기사앱 [퇴근 정정 요청](location_change_requests kind:"checkoutFix") → 그 기사 담당자 휴대폰 푸시
//  담당자가 없으면 보내지 않는다(지입차관리 › 관제현황 › 확인할 일에 쌓인다) · 알림 설정 "담당 기사 출근·퇴근"을 따른다
exports.notifyCheckoutFixRequest = functions.firestore.document("location_change_requests/{id}").onCreate(async (snap) => {
  const r = snap.data() || {};
  if (r.kind !== "checkoutFix" || !r.uid) return null;
  try {
    const dSnap = await db.collection("drivers").doc(String(r.uid)).get();
    const drv = dSnap.exists ? dSnap.data() || {} : {};
    const mgrUid = drv.담당자 && typeof drv.담당자 === "object" ? String(drv.담당자.uid || "") : "";
    if (!mgrUid) return null;
    const uSnap = await db.collection("users").doc(mgrUid).get();
    const u = uSnap.exists ? uSnap.data() || {} : null;
    const company = String(r.companyName || drv.companyName || PUSH_DEFAULT_COMPANY).trim();
    if (!u || !sameCoUser(u, company) || !isPushTypeEnabled(u.pushPrefs, "기사출퇴근")) return null;
    const hm = (ms) => (ms ? new Date(Number(ms) + 9 * 3600e3).toISOString().slice(11, 16) : "");
    const md = String(r.date || "").slice(5).replace("-", "/");
    await sendPushAndCleanup(userTokens(u), {
      notification: { title: `🕘 퇴근 정정 요청 · ${r.driverName || drv.name || "기사"}`, body: `${md} 출근 ${hm(r.checkInMs)} → 퇴근 ${hm(r.requestedOutMs)}${r.memo ? ` · ${r.memo}` : ""} — 관제현황에서 반영해 주세요` },
      data: { type: "fleet_checkout_fix", requestId: snap.id, target: "app" },
      android: { priority: "high" },
    }, "퇴근 정정 요청");
  } catch (e) { console.error("퇴근 정정 요청 푸시 실패:", e); }
  return null;
});

// ⭐ 2026-11-10 담당 기사 출근·퇴근 → 그 기사의 담당자(기사관리에서 정한 drivers/{uid}.담당자.uid)에게 휴대폰 푸시
//  · 기사앱이 직접 출근·퇴근(최종퇴근 포함)한 기록만 — 운송사가 대신 [퇴근처리]한 것(auto)은 보내지 않는다
//  · 담당자는 기록에 적힌 값이 아니라 서버가 기사 문서에서 다시 읽는다 · 같은 회사 · 재직 · "기사출퇴근" 알림을 끈 사람 제외
//  · 화면(PC·모바일) 알림창·종은 src/driverEvents.jsx useDriverCheckoutFeed
exports.notifyDriverCheckout = functions.firestore.document("driver_logs/{id}").onCreate(async (snap) => {
  const l = snap.data() || {};
  if (l.status !== "출근" && l.status !== "퇴근" && l.status !== "최종퇴근") return null; // ⭐ 2026-11-10 출근도
  if (l.auto || l._seed || !l.uid) return null;
  try {
    const dSnap = await db.collection("drivers").doc(String(l.uid)).get();
    const drv = dSnap.exists ? dSnap.data() || {} : {};
    const mgrUid = drv.담당자 && typeof drv.담당자 === "object" ? String(drv.담당자.uid || "") : "";
    if (!mgrUid) return null;
    const uSnap = await db.collection("users").doc(mgrUid).get();
    if (!uSnap.exists) return null;
    const u = uSnap.data() || {};
    const company = String(l.companyName || drv.companyName || PUSH_DEFAULT_COMPANY).trim();
    if (u.approved === false || u.employmentStatus === "퇴사" || NON_STAFF_ROLES.has(u.role)) return null;
    if (u.role !== "totalMaster" && String(u.companyName || PUSH_DEFAULT_COMPANY).trim() !== company) return null;
    if (!isPushTypeEnabled(u.pushPrefs, "기사출퇴근")) return null;
    if (!notifyUserAllows(u, "기사출퇴근")) return null; // ⭐ 2026-11-17 담당자가 지금 경리 · 인사 화면이면 보내지 않는다
    const name = String(l.driverName || drv.name || drv.이름 || "기사");
    const car = String(l.carNo || drv.carNo || drv.차량번호 || "");
    const ms = l.timestamp && typeof l.timestamp.toMillis === "function" ? l.timestamp.toMillis() : Date.now();
    const hm = new Date(ms + 9 * 3600e3).toISOString().slice(11, 16);
    const km = Number(l.odometer) || 0;
    const isIn = l.status === "출근";
    const body = [car, `${hm} ${isIn ? "출근" : `${l.status === "최종퇴근" ? "최종 " : ""}퇴근`}`, !isIn && km ? `계기판 ${km.toLocaleString("ko-KR")}km` : ""].filter(Boolean).join(" · ");
    await sendPushAndCleanup(userTokens(u), { notification: { title: `${isIn ? "🚚 담당 기사 출근" : "🏁 담당 기사 퇴근"} · ${name}`, body }, data: { kind: isIn ? "driverCheckin" : "driverCheckout", driverUid: String(l.uid) }, android: { priority: "high" } }, "기사출퇴근");
  } catch (e) { console.error("기사 퇴근 푸시 실패:", e); }
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
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "pushDiag"))) return; // 🛡 App Check(functions/appCheck.js)
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
    res.status(e.status || 500).json({ error: pubErrMsg(e) });
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
  if (u._seed) return null; /* 🧪 테스트 데이터(_seed)는 알림 없음 */
  if (u.approved !== false || u.status === "deleted" || u.status === "withdrawn" || u.employmentStatus === "퇴사") return null;
  const becamePending = !b || b.approved !== false || ["deleted", "withdrawn"].includes(b.status) || b.employmentStatus === "퇴사";
  if (!becamePending) return null;
  if (["shipper", "cafeUser", "totalMaster"].includes(u.role)) return null;
  const company = u.companyName || "(회사없음)";
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
//  회기(입사일/회계연도 기준 — payrollSettings/{회사}.leave) 종료 6개월 전 1차(직원은 10일 안에 사용 계획 제출) · 계획 기한이 지나면 2차(계획 미제출자 — 회사가 종료 2개월 전까지 사용 시기 지정 예정 안내)
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
      const hr = list.filter((u) => ["hrManager", "hrAcct", "allMgr", "hrStaff"] /* ⭐ 2026-11-07 촉진 화면이 인사관리부 › 연차 관리 안으로 — 경리(test)는 뺌 */.includes(u.role) || /인사/.test(String(u.team || "")));
      const managers = (hr.length ? hr : list.filter((u) => u.isMaster === true)).slice(0, 30);
      if (!managers.length) continue;
      const lines = [
        ...sent.map((x) => `· ${x.name} — ${x.kind === "n1" ? "1차 촉진" : "2차(사용 시기 지정 필요)"} · 잔여 ${x.remain}일${x.manual ? " · 자동 발송 꺼짐 → 직접 발송 필요" : " · 자동 발송함"}`),
        ...overdue.map((x) => `· ${x.name} — 사용 계획 제출 기한(${x.due}) 지남 · 잔여 ${x.remain}일 → 2차 때 회사가 날짜 지정`),
      ];
      const title = `연차 사용 촉진 — 오늘 ${sent.length}명${overdue.length ? ` · 계획 미제출 ${overdue.length}명` : ""}`;
      const body = `${lines.join("\n")}\n\n인사관리부 › 연차 관리 › 연차 사용 촉진에서 발송 기록 확인 · 재발송 · 2차 사용일 지정을 할 수 있습니다.`;
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
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "automation"))) return; // 🛡 App Check(functions/appCheck.js)
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
      const users = (await db.getAll(...to.map((uid) => db.collection("users").doc(uid)))).filter((d) => d.exists && (d.data().companyName || "(회사없음)") === me.company);
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
    res.status(e.status || 500).json({ error: pubErrMsg(e) });
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
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "sheetOcr"))) return; // 🛡 App Check(functions/appCheck.js)
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
    res.status(e.status || 500).json({ error: pubErrMsg(e) });
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
// ⚡ 2026-11-14 시트가 바뀌었는지 알아보는 표시(수정 시각 + 파일 버전) — 구글시트 실시간 반영이 약 8초마다 본다(functions/sheetLiveOrders.js)
//  수정 시각만 보면 늦게 바뀌는 경우가 있어 버전 번호(바뀔 때마다 올라감)도 같이 본다. 못 읽으면 ""(실시간 반영이 1분마다 직접 읽는다)
async function sheetChangeToken(sid) {
  if (!sid || Date.now() < _driveMetaOffUntil) return "";
  try {
    if (!_driveMetaClient) _driveMetaClient = await new GoogleAuth({ scopes: DRIVE_META_SCOPES }).getClient();
    const r = await _driveMetaClient.request({ url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sid)}?fields=modifiedTime,version&supportsAllDrives=true`, method: "GET" });
    return r?.data?.modifiedTime ? `${r.data.modifiedTime}#${r.data.version || ""}` : "";
  } catch (e) {
    const st = e?.response?.status;
    if (st === 403 || st === 401) _driveMetaOffUntil = Date.now() + 30 * 60 * 1000;
    return "";
  }
}
// 📗 2026-11-07 엑셀(xlsx) 파일 시트 — Sheets API가 거절하는 Office 파일은 Drive에서 받아 SheetJS로 읽는다(functions/officeSheet.js)
//  · 읽기는 그대로(값 · 수식 · 병합 칸 · 탭) · 쓰기는 code "office-file" 오류 · [구글 시트로 변환] = Drive files.copy
const { makeOfficeSheets } = require("./officeSheet");
let _driveRwClient = null;
const officeSheets = makeOfficeSheets({
  sheetsApiFor,
  driveRequest: async (opts) => {
    if (!_driveRwClient) _driveRwClient = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/drive"] }).getClient();
    return _driveRwClient.request(opts);
  },
});
const sheetsApiAny = officeSheets.sheetsApi; // 구글 시트면 Sheets API · 엑셀 파일이면 흉내(읽기만)
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
  // 🔒 2026-11-07 이 양식의 회사가 주인인 시트만(다른 회사 시트 주소를 넣은 양식은 가져오지 않는다 — functions/sheetGuard.js)
  await sheetGuard.assertSheetOwner(sid, form.companyName || "(회사없음)", { by: `routeBoard:${form.id || ""}` });
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
    readTabs: async () => { const sh = ((await sheetsApiAny(sid, "GET", "?fields=sheets.properties(sheetId,title,index)")).sheets || []).map((x) => x.properties); sh.forEach((t) => { tabIds[t.title] = t.sheetId; }); return sh.map((t) => t.title); },
    // ⭐ 2026-11-03 프로그램에서 추가한 오더 → 그 묶음 표 아래에 새 줄 끼워 넣기(서식은 윗줄 따라감)
    insertRows: async (tab, at, n) => {
      if (tabIds[tab] == null) throw new Error("탭 번호를 찾지 못했습니다.");
      await sheetsApiAny(sid, "POST", ":batchUpdate", { data: { requests: [{ insertDimension: { range: { sheetId: tabIds[tab], dimension: "ROWS", startIndex: at, endIndex: at + n }, inheritFromBefore: true } }] } });
    },
    readTab: async (tab) => (await sheetsApiAny(sid, "GET", `/values/${encodeURIComponent(`${quoteTab(tab)}!A1:AZ3000`)}?valueRenderOption=FORMATTED_VALUE`)).values || [],
    // ⭐ 양방향 — 프로그램에서 바뀐 칸을 시트에 써 준다(시트를 '편집자'로 공유해야 함 · 못 쓰면 기록만)
    writeCells: async (tab, ups) => {
      try {
        await sheetsApiAny(sid, "POST", "/values:batchUpdate", { data: { valueInputOption: "USER_ENTERED", data: ups.slice(0, 2000).map((u) => ({ range: `${quoteTab(tab)}!${u.a1}`, values: [[String(u.value ?? "")]] })) } });
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
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "routeBoardSheet"))) return; // 🛡 App Check(functions/appCheck.js)
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
    // 🔒 2026-11-07 다른 회사 시트는 읽지도 쓰지도 않는다(시트마다 주인 회사 — functions/sheetGuard.js)
    await sheetGuard.assertSheetOwner(id, me.company, { isTM: me.isTM, by: me.email });
    // 💰 2026-11-06 시트 정보(탭 목록)는 필요한 작업에서만 읽는다 — 예전엔 30초 자동 맞춤(건너뛰는 경우 포함)마다 Sheets API를 1번씩 불렀다
    let _meta = null;
    const getMeta = async () => (_meta || (_meta = await sheetsApiAny(id, "GET", "?fields=properties.title,sheets.properties(title,index)")));
    const tabsOf = (m) => (m.sheets || []).map((x) => x.properties).sort((a, b) => a.index - b.index).map((t) => t.title);
    // 💰 2026-11-06 read + ifChanged(지난번 modifiedTime) — 시트가 그대로면 값을 읽지 않고 unchanged만 돌려준다(배차표 화면 1분 확인)
    if (body.action === "read" && body.ifChanged) {
      const mt = await sheetModifiedTime(id);
      if (mt && mt === String(body.ifChanged)) { res.json({ unchanged: true, modifiedTime: mt }); return; }
      body._mt = mt;
    }
    // 📗 2026-11-07 엑셀(xlsx) 파일 → 구글 시트로 변환(원본은 그대로) · boardId가 있으면 양식 주소도 새 시트로
    if (body.action === "convert") {
      const out = await officeSheets.convert(id, { shareWith: me.email || "" });
      if (body.boardId && !out.already) {
        const ref = db.collection("routeBoards").doc(String(body.boardId));
        const fs1 = await ref.get();
        if (fs1.exists && (me.isTM || fs1.data().companyName === me.company) && parseSpreadsheetId(fs1.data().sheetUrl) === id) {
          await ref.set({ sheetUrl: out.url, 원본엑셀Url: fs1.data().sheetUrl || "", sheetModifiedTime: "", syncHash: {}, convertedAt: Date.now(), convertedBy: me.email || "" }, { merge: true });
          out.boardUpdated = true;
        }
      }
      console.log(`[배차표 엑셀 변환] ${me.company} ${me.email} ${id} → ${out.spreadsheetId}`);
      res.json(out);
      return;
    }
    if (body.action === "tabs") { const meta = await getMeta(); res.json({ title: meta.properties?.title || "", tabs: tabsOf(meta), ...(officeSheets.officeInfo(id) || {}) }); return; }
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
        res.json({ ...(await runRouteBoardSync(form, { mt: chk.mt })), reason: chk.reason, ...(officeSheets.officeInfo(id) || {}) });
        return;
      }
      // ⭐ 2026-11-03 기간 가져오기(입고일=탭 날짜 기준, 최대 120일)
      const okD = (x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ""));
      let range = null;
      // 🔗 2026-11-08 프로그램에서 고친 오더의 날짜(dates)만 맞추기 — 예전엔 "오늘~2주"만 봐서 지난 날짜(지난달 탭 등) 오더를 고치면 시트에 안 써졌다
      //  (지운 줄 기억은 그대로 = soft · 하차일수만큼 뒤까지 · 최대 62일)
      const ds = Array.isArray(body.dates) ? body.dates.map(String).filter(okD).sort() : [];
      if (ds.length && !(okD(body.from) && okD(body.to))) {
        const off = Math.max(0, parseInt(form.dropOffset, 10) || 0);
        const lastD = new Date(`${ds[ds.length - 1]}T00:00:00Z`); lastD.setUTCDate(lastD.getUTCDate() + off + 1);
        const a = ds[0]; const b = lastD.toISOString().slice(0, 10);
        if ((Date.parse(b) - Date.parse(a)) / 864e5 <= 62) range = { from: a, to: b, soft: true };
      }
      if (okD(body.from) && okD(body.to)) {
        const [a, b] = body.from <= body.to ? [body.from, body.to] : [body.to, body.from];
        if ((Date.parse(b) - Date.parse(a)) / 864e5 > 120) { res.status(400).json({ error: "기간은 120일까지 한 번에 가져올 수 있습니다." }); return; }
        range = { from: a, to: b };
      }
      res.json({ ...(await runRouteBoardSync(form, { force: true, range })), ...(officeSheets.officeInfo(id) || {}) });
      return;
    }
    if (body.action === "read") {
      const tab = String(body.tab || "");
      const meta = await getMeta(); const tabs = tabsOf(meta);
      if (!tabs.includes(tab)) { res.status(400).json({ error: "탭을 찾을 수 없습니다." }); return; }
      const got = await sheetsApiAny(id, "GET", `/values/${encodeURIComponent(`${quoteTab(tab)}!A1:AZ3000`)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
      console.log(`[배차표 시트] ${me.company} ${me.email} ${id} ${tab}`);
      res.json({ title: meta.properties?.title || "", tab, rows: got.values || [], ...(body._mt ? { modifiedTime: body._mt } : {}), ...(officeSheets.officeInfo(id) || {}) }); // ⭐ 2026-11-06 다음 확인 때 ifChanged로
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
        await sheetsApiAny(id, "POST", "/values:batchUpdate", { data: {
          valueInputOption: "USER_ENTERED",
          data: ups.map((u) => ({ range: `${quoteTab(tab)}!${u.a1}`, values: [[String(u.value ?? "")]] })),
        } });
      } catch (e) {
        if (e.code === "office-file") throw e;
        if (e.status === 400) throw Object.assign(new Error("시트에 쓸 수 없습니다. 시트 공유에 dispatch-app-9b92f@appspot.gserviceaccount.com 을(를) '편집자'로 추가했는지 확인해 주세요."), { status: 400 });
        throw e;
      }
      console.log(`[배차표 시트 쓰기] ${me.company} ${me.email} ${id} ${tab} ${ups.length}칸`);
      res.json({ updated: ups.length });
      return;
    }
    res.status(400).json({ error: "알 수 없는 요청입니다." });
  } catch (e) {
    res.status(e.status || 500).json({ error: pubErrMsg(e), ...(e.code === "office-file" || e.code === "convert-denied" ? { code: e.code, help: e.help || "" } : {}) });
  }
});

// 🔗 2026-11-07 구글시트 연동(시트 프로필) — 설명은 functions/sheetConnect.js 맨 위 · 규칙은 functions/sheetProfileCore.mjs(화면과 같은 파일)
const { makeSheetConnect } = require("./sheetConnect");
// 🔒 2026-11-08 시트 주인 확인(sheetGuard)을 구글 시트 · 엑셀 파일(officeSheets) 모두에 건다
const guardedOfficeSheets = {
  ...officeSheets,
  convert: async (sid, opts) => { await guardSheetOwnerNow(sid); return officeSheets.convert(sid, opts); },
};
const _sheetConnectHandler = makeSheetConnect({
  db, FieldValue, sheetsApiFor: guardedSheetsApiFor, officeSheets: guardedOfficeSheets, parseSpreadsheetId, quoteTab, requireStaff: guardedRequireStaff, requireAdminRole: guardedRequireAdminRole, sheetModifiedTime, setBulkMode, bumpDataVersion,
  makeAnthropic: () => (process.env.ANTHROPIC_API_KEY ? new (_orderScan.Anthropic)({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 30000, maxRetries: 1 }) : null),
});
exports.sheetConnect = functions.runWith({ secrets: ["ANTHROPIC_API_KEY"], timeoutSeconds: 540, memory: "1GB" }).https.onRequest(async (req, res) => { if (!(await appCheckGate(req, res, "sheetConnect"))) return; return sheetCaller.run({}, () => _sheetConnectHandler(req, res)); }); // 🛡 App Check

// 🔁 2026-11-13 구글시트 실시간 반영(시트에서만 입력하는 운송사 — 지금은 JY로지스틱스) — 설명은 functions/sheetLiveOrders.js 맨 위
// 🔁 2026-11-14 프로그램 → 구글시트 반영(오더 등록 · 수정 · 삭제를 시트의 그 탭 줄에) — 설명은 functions/sheetPushOrders.js 맨 위
const _sheetPush = require("./sheetPushOrders").makeSheetPush({ db, FieldValue, sheetsApiFor, parseSpreadsheetId, quoteTab });
exports.queueOrderSheetPush = functions.firestore.document("orders/{orderId}").onWrite((change, context) => _sheetPush.onOrderWrite(change, context).catch((e) => { console.error("[시트 쓰기 대기열 실패]", context.params.orderId, e?.message || e); return null; }));
const _sheetLive = require("./sheetLiveOrders").makeSheetLive({ db, FieldValue, sheetsApiFor, parseSpreadsheetId, quoteTab, sheetModifiedTime: sheetChangeToken, bumpDataVersion, push: _sheetPush });
exports.syncSheetOrders = functions.runWith({ timeoutSeconds: 300, memory: "1GB", maxInstances: 1 }).pubsub.schedule("every 1 minutes").timeZone("Asia/Seoul").onRun(async () => { await _sheetLive.runScheduled(); return null; }); // ⏱ 안전장치 — 평소엔 아래 두 이벤트가 바로 처리한다
// ⚡ 2026-11-14 프로그램에서 오더가 바뀌어 시트 쓰기 대기열에 들어오면 바로 처리(1분 · 몇 초 기다리지 않는다)
exports.sheetPushKick = functions.runWith({ timeoutSeconds: 300, memory: "1GB" }).firestore.document("sheetPushQueue/{qid}").onWrite(async (change) => {
  const a = change.after.exists ? change.after.data() : null; const b = change.before.exists ? change.before.data() : null;
  if (!a || a.state !== "pending" || (b && b.state === "pending" && b.at === a.at)) return null;
  await _sheetLive.kick(String(a.companyName || ""), "program").catch((e) => console.error("[시트 쓰기 바로 처리 실패]", e?.message || e));
  return null;
});
// ⚡ 2026-11-14 시트 알림 — 시트에 붙인 Apps Script(onChange)가 "바뀜"을 알리면 바로 시트를 읽어 맞춘다(열쇠 = sheetLive/{회사}.pingKey)
exports.sheetLivePing = functions.runWith({ timeoutSeconds: 300, memory: "1GB" }).https.onRequest(async (req, res) => {
  try {
    let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
    const r = await _sheetLive.onPing(req.query?.k || b?.k, b || {});
    res.status(r.status).json(r.body);
  } catch (e) { console.error("[시트 알림 실패]", e?.message || e); res.status(500).json({ error: "failed" }); }
});

exports.sheetImport = functions
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (!(await appCheckGate(req, res, "sheetImport"))) return; // 🛡 App Check(functions/appCheck.js)
    if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    try {
      const me = await requireTotalMaster(req);
      const action = body.action;

      // 🔁 2026-11-13 실시간 반영 설정 · 지금 반영
      if (action === "liveGet" || action === "liveSet" || action === "liveRun" || action === "liveCompare" || action === "pingScript") { res.json(await _sheetLive.handle(action, body, me)); return; }
      // 🔁 2026-11-14 프로그램 → 시트 반영 설정 · 기록 · 보류 처리
      if (action === "pushGet" || action === "pushSet" || action === "pushResolve") { res.json(await _sheetPush.handle(action, body, me)); return; }

      // 🚚 2026-11-12 운송사 일괄 이전 — 고른 탭(없으면 전체)을 맨 윗줄부터 그대로 + 병합 칸 정보(화면이 applyMerges로 펼침)
      //  위쪽 메모(상차지 · 하차지 주소 · 담당자)까지 읽어야 해서 머리줄 기준으로 자르지 않는다. 규칙: functions/carrierMigrateCore.mjs
      if (action === "readRaw") {
        const id = parseSpreadsheetId(body.url);
        if (!id) { res.status(400).json({ error: "구글시트 주소가 올바르지 않습니다." }); return; }
        const meta = await sheetsApiFor(id, "GET", `?fields=${encodeURIComponent("properties.title,sheets(properties(title,index,gridProperties(rowCount,columnCount)),merges)")}`);
        const all = (meta.sheets || []).sort((a, b) => a.properties.index - b.properties.index);
        const want = Array.isArray(body.tabs) && body.tabs.length ? new Set(body.tabs.map(String)) : null;
        const pick = all.filter((s) => !want || want.has(s.properties.title));
        if (!pick.length) { res.status(400).json({ error: "읽을 탭이 없습니다." }); return; }
        const out = [];
        for (let i = 0; i < pick.length; i += 10) { // 한 번에 10개 탭씩
          const part = pick.slice(i, i + 10);
          const got = await sheetsApiFor(id, "GET",
            `/values:batchGet?${part.map((s) => `ranges=${encodeURIComponent(quoteTab(s.properties.title))}`).join("&")}&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
          part.forEach((s, k) => out.push({ title: s.properties.title, rows: got.valueRanges?.[k]?.values || [], merges: s.merges || [] }));
        }
        res.json({ title: meta.properties?.title || "", tabs: out, allTabs: all.map((s) => s.properties.title) });
        return;
      }

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
          const writer = db.bulkWriter();
          for (const col of ["orders", "dispatch", "clients", "places", "drivers", "fixedRoutes", "multiRateSheets"]) { // 🚚 2026-11-12 일괄 이전의 고정노선 후보 · 단가표도
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
      res.status(e.status || 500).json({ error: pubErrMsg(e) });
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
    const k = String(name || "(회사없음)").trim() || "(회사없음)";
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
    userCompany[d.id] = String(u.companyName || "").trim() || "(회사없음)"; // ⭐ 2026-11-02 관리자센터 — 회사명 앞뒤 공백 제거
    if (u.role === "shipper") {
      const k = String(u.companyName || "").trim();
      if (shippers[k]) shippers[k].users += 1;
      else if (k) shippers[k] = { name: k, kind: "shipper", appliedAt: 0, status: "approved", linked: "", users: 1, online: 0, onlineNow: 0, lastSeen: 0 };
      return;
    }
    const c = co(u.companyName);
    if (u.role === "driver") { c.drivers += 1; return; }
    if (u.employmentStatus === "퇴사") { c.quit += 1; return; } // ⭐ 2026-11-02 관리자센터 — 퇴사자는 직원 수에서 뺀다
    if (u.noAccount) return; // 👥 2026-11-09 계정 없는 인사 기록은 직원 계정(요금제 인원·추가 계정 요금)에 안 센다
    if (u.approved === false) { c.pending += 1; return; } // 👥 2026-11-09 승인 대기는 아직 계정이 아니다(예전엔 대기자도 인원·초과 요금에 들어갔다)
    c.staff += 1;
    if (u.role === "admin") c.admins += 1;
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
    const k = String(name || "(회사없음)").trim() || "(회사없음)";
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
        got.forEach((x) => { if (x.exists) owner[x.ref.path] = String(x.get("companyName") || "").trim() || "(회사없음)"; });
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
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "platformStats"))) return; // 🛡 App Check(functions/appCheck.js)
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
    res.status(e.status || 500).json({ error: pubErrMsg(e) });
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
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "platformUsageNow"))) return; // 🛡 App Check(functions/appCheck.js)
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
    res.status(e.status || 500).json({ error: pubErrMsg(e) });
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

/* ==============================
   ⭐ 2026-11-06 로지스웹 허브 콜(hubOrders) — 평점 · 완료 건수 · 취소 기록 집계(hubStats, 회원은 쓸 수 없음)
   규칙은 functions/hubCall.js 맨 위 설명
============================== */
// ⭐ 2026-11-06 (2차) 허브 트리거(집계 · 알림 · 푸시 · 예치금 원장 · 로지스웹 연동 · 기사앱 위치 넘기기)는 functions/hubTriggers.js
//  hubOrderOnWrite · hubChargeOnWrite · hubPayoutOnWrite · hubAdjustOnCreate · hubNoticeOnCreate · hubDriverLocMirror
Object.assign(exports, require("./hubTriggers").register({
  functions, db, FieldValue, sendPushAndCleanup, userTokens,
  getStorage: () => require("firebase-admin/storage").getStorage(),
  getAuth,
}));

// 🎫 2026-11-08 로그인 토큰 권한(custom claims) — 보안 규칙이 users 문서를 매번 읽지 않게(설명은 functions/authClaims.js 맨 위)
//  claimsOnUserWrite · claimsOnHubMemberWrite · claimsOnPlanWrite · claimsOnCustomRoleWrite · claimsOnRoleOverrideWrite · refreshMyClaims · backfillClaims
Object.assign(exports, require("./authClaims").register({ functions, db, getAuth, FieldValue, callOpts: appCheckCallOpts() })); // 🛡 호출형은 App Check 모드를 따른다

// 🤖 2026-11-06 AI 팀 — 관리자센터에서 팀별(경리·재무·영업·운영·보안·홍보) Claude 에이전트와 대화.
//  최고관리자·부관리자(role totalMaster)만. Claude API 키는 Firebase 비밀값 ANTHROPIC_API_KEY.
//  (등록: firebase functions:secrets:set ANTHROPIC_API_KEY)
const aiTeams = require("./aiTeams");
exports.aiTeamChat = functions.runWith({ secrets: ["ANTHROPIC_API_KEY"], timeoutSeconds: 300, memory: "512MB" }).https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "aiTeamChat"))) return; // 🛡 App Check(functions/appCheck.js)
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
  const authz = String(req.get("Authorization") || "");
  const decoded = authz.startsWith("Bearer ") ? await getAuth().verifyIdToken(authz.slice(7)).catch(() => null) : null;
  if (!(await isTotalMasterReq(req))) { res.status(403).json({ error: "최고관리자·부관리자만 사용할 수 있습니다." }); return; } // ⭐ 2026-11-07 true/false 판단(던지는 requireTotalMaster 대신)
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

// 🎬 2026-11-18 AI 본부 › 홍보팀 영상 작업실 — 숏츠 · 교육영상 기획 + 배경음악 큐시트 + 자막(설명은 functions/aiVideo.js 맨 위)
const aiVideo = require("./aiVideo");
exports.aiVideoPlan = functions.runWith({ secrets: ["ANTHROPIC_API_KEY"], timeoutSeconds: 180, memory: "256MB" }).https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "aiVideoPlan"))) return;
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
  const authz = String(req.get("Authorization") || "");
  const decoded = authz.startsWith("Bearer ") ? await getAuth().verifyIdToken(authz.slice(7)).catch(() => null) : null;
  if (!(await isTotalMasterReq(req))) { res.status(403).json({ error: "최고관리자·부관리자만 사용할 수 있습니다." }); return; }
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try {
    const out = await aiVideo.runVideoPlan({ input: body?.input || {} });
    db.collection("aiTeamLogs").add({
      team: "marketing", uid: decoded?.uid || "", email: decoded?.email || "",
      question: `[영상 기획] ${out.input.kind} ${out.input.seconds}초 · ${out.input.topic}`.slice(0, 500), answer: String(out.plan?.title || "").slice(0, 500),
      tools: ["video"], usage: out.usage, model: out.model, at: FieldValue.serverTimestamp(),
    }).catch((e) => console.error("[영상 기획] 기록 실패:", e));
    res.json(out);
  } catch (e) {
    if (e?.user) { res.status(e.status || 500).json({ error: e.message }); return; } // 우리가 만든 안내(키 없음 · 거절 · 끊김)
    const { status, msg } = aiTeams.apiErrorMessage(e);
    console.error("[영상 기획] 실패:", e);
    res.status(status).json({ error: msg });
  }
});

// 📣 2026-11-23 관리자센터 › 홍보(영상 편집실 · 블로그 원고 · 홍보 설정) — 설명은 functions/promo.js 맨 위
//  mktAi: { action, input } — blogDraft · rewrite · titles · ytMeta · videoScript(Claude) / tts(Gemini) / geminiKey(키 저장 · 상태) / weeklyNow(초안 지금 만들기)
const promo = require("./promo");
exports.mktAi = functions.runWith({ secrets: ["ANTHROPIC_API_KEY"], timeoutSeconds: 180, memory: "512MB" }).https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", APPCHECK_CORS);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await appCheckGate(req, res, "mktAi"))) return;
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
  if (!(await isTotalMasterReq(req))) { res.status(403).json({ error: "최고관리자·부관리자만 사용할 수 있습니다." }); return; }
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const action = String(body?.action || ""); const input = body?.input || {};
  try {
    if (action === "tts") { res.json(await promo.runTts({ db, text: input.text, voice: input.voice, style: input.style })); return; }
    if (action === "geminiKey") {
      // 🛠 2026-11-24 붙여 넣을 때 딸려 온 공백 · 줄바꿈 · 따옴표 · "GEMINI_API_KEY=" 같은 앞말은 떼고 본다 · 새 형식 키(점 포함)도 받는다
      const k = String(input.key || "").replace(/^\s*[A-Z_]*KEY\s*[=:]\s*/i, "").replace(/[\s"'`]/g, "");
      if (k) {
        if (!/^[A-Za-z0-9._-]{20,200}$/.test(k)) { res.status(400).json({ error: "키 모양이 이상해요. Google AI Studio 에서 받은 키를 그대로 붙여 넣어 주세요." }); return; }
        await db.doc("platformSecrets/gemini").set({ key: k, at: FieldValue.serverTimestamp() });
      } else if (input.clear) await db.doc("platformSecrets/gemini").delete();
      const cur = await promo.geminiKey(db);
      res.json({ ok: true, set: !!cur, hint: cur ? `${cur.slice(0, 4)}…${cur.slice(-4)}` : "" });
      return;
    }
    if (action === "weeklyNow") { res.json(await promo.weeklyDraft({ db, FieldValue, force: !!input.force })); return; }
    const out = await promo.runPromoAi({ db, action, input });
    db.collection("aiTeamLogs").add({ team: "marketing", question: `[홍보 ${action}] ${String(input.topic || input.title || "").slice(0, 200)}`, answer: String(out.out?.title || "").slice(0, 300), tools: ["promo"], usage: out.usage, model: out.model, at: FieldValue.serverTimestamp() }).catch(() => {});
    res.json(out);
  } catch (e) {
    if (e?.user) { res.status(e.status || 500).json({ error: e.message }); return; }
    const { status, msg } = aiTeams.apiErrorMessage(e);
    console.error("[홍보 mktAi] 실패:", action, e);
    res.status(status).json({ error: msg });
  }
});
// ⏰ 매주 월요일 07:13(한국시간) — 다음 주제로 블로그 초안(검토 대기)을 만든다. 홍보 설정에서 끌 수 있다.
exports.mktWeeklyDraft = functions.runWith({ secrets: ["ANTHROPIC_API_KEY"], timeoutSeconds: 300, memory: "512MB" })
  .pubsub.schedule("13 7 * * 1").timeZone("Asia/Seoul")
  .onRun(async () => { const r = await promo.weeklyDraft({ db, FieldValue }).catch((e) => ({ error: String(e?.message || e) })); console.log("[매주 블로그 초안]", JSON.stringify(r)); return null; });

// 🧠 2026-11-07 오더 스캔 정밀 인식 — 설명은 functions/orderScan.js 맨 위
//  orderScanOcr: Google Cloud Vision 글자 인식(줄 위치 포함) · orderScanExtract: Claude(Haiku)로 배차 등록 칸 정리
//  둘 다 호출형(callable) · 로그인 + 승인된 사람만 · 사람마다 하루 횟수 제한(scanUsage) · 실패하면 화면이 예전 방식으로 넘어간다
const _orderScan = require("./orderScan");
let _scanVisionClient = null;
const scanHttpsError = (e) => {
  if (e instanceof _orderScan.ScanError) return new functions.https.HttpsError(e.code, e.message);
  console.error("[오더 스캔] 오류:", e);
  return new functions.https.HttpsError("internal", "정밀 인식에 실패했어요");
};
function bumpScanUsage(patch) {
  const ym = kstDateStr().slice(0, 7);
  const inc = {};
  Object.entries(patch).forEach(([k, v]) => { if (v) inc[k] = FieldValue.increment(v); });
  return db.collection("platformUsage").doc(`m_${ym}`).set(inc, { merge: true }).catch(() => {});
}
exports.orderScanOcr = functions.runWith({ timeoutSeconds: 60, memory: "512MB", ...appCheckCallOpts() }).https.onCall(async (data, context) => {
  try {
    return await _orderScan.runOcr({
      db, auth: context.auth, data,
      getVisionClient: async () => {
        if (!_scanVisionClient) _scanVisionClient = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient();
        return _scanVisionClient;
      },
      bumpVision: () => { bumpVisionCount(); bumpScanUsage({ scanOcrCalls: 1 }); }, // 💰 visionCalls(월 1,000건 무료) + 오더 스캔 몫
    });
  } catch (e) { throw scanHttpsError(e); }
});
// ⭐ 2026-11-18 여러 오더 한 번에(data.multi) — 건수만큼 답이 길어 시간을 넉넉히(한 건은 예전처럼 30초 안)
exports.orderScanExtract = functions.runWith({ secrets: ["ANTHROPIC_API_KEY"], timeoutSeconds: 120, memory: "256MB", ...appCheckCallOpts() }).https.onCall(async (data, context) => {
  try {
    return await _orderScan.runExtract({
      db, auth: context.auth, data,
      makeAnthropic: () => (process.env.ANTHROPIC_API_KEY ? new (_orderScan.Anthropic)({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: data?.multi === true ? 100000 : 30000, maxRetries: 1 }) : null),
      // 💰 비용·손익 — 호출 수와 토큰(입력·출력·캐시 읽기·캐시 쓰기)
      bumpUsage: (u) => bumpScanUsage({ scanAiCalls: 1, scanAiInTok: u.input, scanAiOutTok: u.output, scanAiCacheReadTok: u.cacheRead, scanAiCacheWriteTok: u.cacheWrite }),
    });
  } catch (e) { throw scanHttpsError(e); }
});

// 📞 2026-11-25 AI 상담원 음성 오더 — 설명은 functions/voiceOrder.js 맨 위(휴대폰 오더등록 [AI 상담원])
//  한 마디마다 Claude(Haiku)가 짧은 대답 · 채울 칸 · 다음 할 일만 돌려준다(저장은 화면이 원래 저장 함수로)
const _voiceOrder = require("./voiceOrder");
exports.voiceOrderTurn = functions.runWith({ secrets: ["ANTHROPIC_API_KEY"], timeoutSeconds: 60, memory: "256MB", ...appCheckCallOpts() }).https.onCall(async (data, context) => {
  try {
    return await _voiceOrder.runVoiceTurn({
      db, auth: context.auth, data,
      makeAnthropic: () => (process.env.ANTHROPIC_API_KEY ? new (_orderScan.Anthropic)({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 25000, maxRetries: 1 }) : null),
      bumpUsage: (u) => bumpScanUsage({ voiceAiCalls: 1, voiceAiInTok: u.input, voiceAiOutTok: u.output, voiceAiCacheReadTok: u.cacheRead, voiceAiCacheWriteTok: u.cacheWrite }),
    });
  } catch (e) { throw scanHttpsError(e); }
});

// 🤖 2026-11-07 배차 AI 비서 — 설명은 functions/aiAssistant.js 맨 위
//  호출형(callable) · 배차 프로그램 직원(승인·재직)만 · 회사 범위·메뉴 권한은 도구마다 서버가 확인
//  서버는 아무것도 저장하지 않고 "제안"만 돌려준다(화면이 확인 카드 → [적용] → 원래 저장 함수로 저장)
//  사람마다 하루 질문 수 제한(aiAssistantUsage) · 사용 기록(aiAssistantLogs, 회사별 · 비밀값 없음)
//  Claude API 키: Firebase 비밀값 ANTHROPIC_API_KEY(AI 팀 · 오더 스캔과 같은 키)
const _aiAssistant = require("./aiAssistant");
exports.aiAssistantChat = functions.runWith({ secrets: ["ANTHROPIC_API_KEY"], timeoutSeconds: 300, memory: "512MB", ...appCheckCallOpts() }).https.onCall(async (data, context) => {
  try {
    return await _aiAssistant.runAssistantChat({
      db, auth: context.auth, data,
      makeAnthropic: () => (process.env.ANTHROPIC_API_KEY ? new (_aiAssistant.Anthropic)({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120000, maxRetries: 2 }) : null),
      log: (row) => {
        db.collection("aiAssistantLogs").add({ ...row, at: FieldValue.serverTimestamp() }).catch((e) => console.error("[AI 비서] 기록 실패:", e));
        const u = row.usage || {};
        bumpScanUsage({ aiChatTurns: 1, aiChatCalls: u.calls, aiChatInTok: u.input, aiChatOutTok: u.output, aiChatCacheReadTok: u.cacheRead, aiChatCacheWriteTok: u.cacheWrite });
      },
    });
  } catch (e) {
    const { code, msg } = _aiAssistant.errorOf(e);
    if (code === "internal" || code === "unavailable") console.error("[AI 비서] 실패:", e);
    throw new functions.https.HttpsError(code, msg);
  }
});

/* ==================================================================
   📊 2026-11-06 일일 경영 보고(DAILY REPORT) — 임원 화면 역할에게 아침 푸시(·요약 메일)
   30분마다(06:00~10:00 사이에만 일함) 받는 시간이 된 사람에게 보낸다. 계산·대상은 functions/dailyReport.js.
   메일은 계약 만료 안내와 같은 플랫폼 발송 계정(PLATFORM_SMTP_USER · PLATFORM_SMTP_PASS — LogisWeb이 보내는 서비스 메일).
================================================================== */
const _dailyReport = require("./dailyReport")({
  db, FieldValue, sendPushAndCleanup, userTokens,
  sendMail: (to, subject, html) => sendContractMail(to, subject, html),
  validMail: (e) => validMail(e),
  defaultCompany: PUSH_DEFAULT_COMPANY,
});
exports.dailyReportPush = functions.runWith({ secrets: PLATFORM_MAIL_SECRETS, timeoutSeconds: 300, memory: "512MB" }).pubsub
  .schedule("every 30 minutes")
  .timeZone("Asia/Seoul")
  .onRun(async () => { await _dailyReport.run(); return null; });

/* ==================================================================
   💰 2026-11-07 급여관리 비밀번호(한 번 더 확인) — 설명은 functions/payrollPw.js 맨 위
   호출형 5개: payrollPwStatus · payrollPwSet · payrollPwVerify · payrollLock · payrollPwReset(잊었을 때)
   비밀번호는 payrollSecrets(서버만) · 잠금 해제는 payrollUnlocks/{uid}(30분) — firestore.rules가 급여 문서마다 확인
================================================================== */
const _payrollPw = require("./payrollPw").makePayrollPw({ db, FieldValue, Timestamp, HttpsError: functions.https.HttpsError });
// ⭐ 2026-11-17 속도 — 1세대 함수는 메모리에 비례해 CPU를 받는다(256MB ≈ 0.4GHz). 이 큰 index.js를 처음 읽어 켜는 시간(콜드 스타트)과
//  scrypt 비밀번호 계산이 느린 CPU에서 몇 초씩 걸렸다 → 1GB(≈1.4GHz). 드물게 불리는 함수라 비용 차이는 아주 작다
const payCall = (fn) => functions.runWith({ timeoutSeconds: 30, memory: "1GB", ...appCheckCallOpts() }).https.onCall(async (data, context) => {
  try { return await fn(data || {}, context); } catch (e) {
    if (e instanceof functions.https.HttpsError) throw e;
    console.error("[급여 비밀번호] 실패:", e);
    throw new functions.https.HttpsError("internal", "잠시 후 다시 해 주세요");
  }
});
exports.payrollPwStatus = payCall(_payrollPw.status);
exports.payrollPwSet = payCall(_payrollPw.setPw);
exports.payrollPwVerify = payCall(_payrollPw.verify);
exports.payrollLock = payCall(_payrollPw.lock);

/* ==================================================================
   🔐 2026-11-18 비공개 운임 비밀번호(사람별) — 설명은 functions/privateFarePin.js 맨 위
   호출형 4개: pfPinStatus · pfPinSet · pfPinVerify · pfLock — 잠금 해제는 privateFareUnlocks/{uid}(30분)
================================================================== */
const _pfPin = require("./privateFarePin").makePrivateFarePin({ db, FieldValue, Timestamp, HttpsError: functions.https.HttpsError });
exports.pfPinStatus = payCall(_pfPin.status);
exports.pfPinSet = payCall(_pfPin.setPin);
exports.pfPinVerify = payCall(_pfPin.verify);
exports.pfLock = payCall(_pfPin.lock);
/* ==================================================================
   🔐 2026-11-27 인사이트(모바일) · 지입차관리 완전 삭제 PIN(사람별) — 설명은 functions/execPin.js 맨 위
   호출형 4개: execPinStatus · execPinSet · execPinVerify · execPinReset(같은 회사 마스터 · 관리자 · 최고관리자)
================================================================== */
const _execPin = require("./execPin").makeExecPin({ db, FieldValue, HttpsError: functions.https.HttpsError });
exports.execPinStatus = payCall(_execPin.status);
exports.execPinSet = payCall(_execPin.setPin);
exports.execPinVerify = payCall(_execPin.verify);
exports.execPinReset = payCall(_execPin.reset);
exports.payrollPwReset = payCall(_payrollPw.resetPw); // ⭐ 2026-11-10 급여 비밀번호 잊었을 때(로그인 비밀번호로 본인 확인 후)

/* ==================================================================
   ✉️ 2026-11-08 운송사별 발신 메일 — 설명은 functions/companyMail.js 맨 위
   호출형 2개: mailSettings(회사정보 › 메일 설정 · 상태/저장/테스트/해제) · sendCompanyMail(회사 메일 보내기)
   비밀값: MAIL_CRED_KEY(앱 비밀번호 암호화 키 · base64 32바이트 이상)
================================================================== */
const _companyMail = _companyMailLib.makeCompanyMail({ db, FieldValue, HttpsError: functions.https.HttpsError, getNodemailer });
const mailCall = (fn, opts = {}) => functions.runWith({ secrets: ["MAIL_CRED_KEY"], timeoutSeconds: 60, memory: "256MB", ...appCheckCallOpts(), ...opts }).https.onCall(async (data, context) => {
  try { return await fn(data || {}, context); } catch (e) {
    if (e instanceof functions.https.HttpsError) throw e;
    console.error("[회사 메일] 실패:", e);
    throw new functions.https.HttpsError("internal", "잠시 뒤 다시 해 주세요");
  }
});
exports.mailSettings = mailCall(_companyMail.mailSettings, { timeoutSeconds: 45 });
exports.sendCompanyMail = mailCall(_companyMail.sendCompanyMail, { timeoutSeconds: 120, memory: "512MB" });
// 📥 2026-11-14 회사 메일함 › 받은메일(IMAP · 읽기 전용) — 설명은 functions/companyMailInbox.js 맨 위
const _companyMailInbox = require("./companyMailInbox").makeCompanyMailInbox({ HttpsError: functions.https.HttpsError, mail: _companyMail,
  getImapFlow: () => require("imapflow").ImapFlow, getParser: () => require("mailparser").simpleParser });
exports.companyMailInbox = mailCall(_companyMailInbox, { timeoutSeconds: 60, memory: "512MB" });

/* ==================================================================
   🏢 2026-11-10 PnK PROJECT 인트라넷 사내메일 — 외부 보내기 · 받기(설명은 functions/pnkMail.js 맨 위)
   · pnkMailAdmin(호출형): 발송 서버 저장 · 테스트 · 받기 주소 토큰 — 대표 · 인트라넷 관리자만
   · pnkMailOnCreate(트리거): pnkMail 에 외부 주소(extTo)가 있으면 회사 발송 서버(SMTP)로 보낸다
   · pnkMailInbound(HTTPS): 메일 수신 서비스가 받은 메일을 넘겨주는 주소(?key=토큰)
   비밀값: MAIL_CRED_KEY(위 회사 메일과 같은 키 — 새 비밀값 없음)
================================================================== */
const _pnkMail = require("./pnkMail").makePnkMail({
  db, FieldValue, HttpsError: functions.https.HttpsError, getNodemailer, lib: _companyMailLib,
  getBucket: () => require("firebase-admin/storage").getStorage().bucket(),
  getMailParser: () => require("mailparser"),
});
exports.pnkMailAdmin = mailCall(_pnkMail.admin, { timeoutSeconds: 60 });
exports.pnkMailOnCreate = functions.runWith({ secrets: ["MAIL_CRED_KEY"], timeoutSeconds: 120, memory: "512MB" })
  .firestore.document("pnkMail/{id}").onCreate((snap) => _pnkMail.onCreate(snap).catch((e) => { console.error("[PnK 메일] 발송 오류", e); return snap.ref.update({ extStatus: "failed", extError: "서버 오류 — 잠시 뒤 다시 보내 주세요" }).catch(() => null); }));
exports.pnkMailInbound = functions.runWith({ timeoutSeconds: 120, memory: "512MB" }).https.onRequest((req, res) =>
  _pnkMail.inbound(req, res).catch((e) => { console.error("[PnK 메일] 받기 오류", e); res.status(500).send("error"); }));
// 🏢 2026-11-10 PnK 인트라넷 — 최고관리자 · 부관리자 2차 인증(8자리 2차 비밀번호) · 설명은 functions/pnkMfa.js 맨 위
const _pnkMfa = require("./pnkMfa").makePnkMfa({ db, HttpsError: functions.https.HttpsError, Timestamp: require("firebase-admin/firestore").Timestamp, verifyIdToken: (t) => getAuth().verifyIdToken(t) });
// ⚡ 2026-11-15 로그인 2차 인증이 느리던 문제 — 늘 한 대는 켜 두고(처음 부를 때 서버를 새로 띄우느라 몇 초 걸렸다) · 비밀번호 확인 계산이 빠르게 512MB
exports.pnkMfa = functions.runWith({ timeoutSeconds: 30, memory: "512MB", minInstances: 1, ...appCheckCallOpts() }).https.onCall(async (data, context) => {
  try { return await _pnkMfa(data || {}, context); } catch (e) {
    if (e instanceof functions.https.HttpsError) throw e;
    console.error("[PnK 2차 인증] 실패:", e);
    throw new functions.https.HttpsError("internal", "잠시 뒤 다시 해 주세요");
  }
});

// 🔑 2026-11-14 비밀번호 찾기 — 가입한 휴대폰 문자 인증 → 새 비밀번호 · 설명은 functions/passwordResetSms.js 맨 위
const _pwResetSms = require("./passwordResetSms").makePasswordResetSms({
  db, HttpsError: functions.https.HttpsError,
  getUserByEmail: (e) => getAuth().getUserByEmail(e), verifyIdToken: (t) => getAuth().verifyIdToken(t),
  updatePassword: (uid, password) => getAuth().updateUser(uid, { password }), revoke: (uid) => getAuth().revokeRefreshTokens(uid),
  deleteUser: async (uid) => { const u = await getAuth().getUser(uid); if (!u.email && u.providerData.every((p) => p.providerId === "phone")) await getAuth().deleteUser(uid); },
});
exports.resetPasswordSms = functions.runWith({ timeoutSeconds: 30, memory: "256MB", ...appCheckCallOpts() }).https.onCall(async (data) => {
  try { return await _pwResetSms(data || {}); } catch (e) {
    if (e instanceof functions.https.HttpsError) throw e;
    console.error("[비밀번호 찾기 문자] 실패:", e);
    throw new functions.https.HttpsError("internal", "잠시 뒤 다시 해 주세요");
  }
});

// 🏛 2026-11-07 공공데이터(국세청 사업자 상태 · 기상청 예보 · 기상특보) + 팝빌 어댑터 — 설명은 functions/publicData.js · functions/popbill.js 맨 위
//  키: Firebase 비밀값 DATA_GO_KR_KEY(공공데이터포털 일반 인증키, 아직 없으면 "none"으로 두면 화면이 조용히 숨긴다)
//   등록: firebase functions:secrets:set DATA_GO_KR_KEY
//  팝빌: functions/.env 에 POPBILL_ENABLED=true 를 넣은 뒤에만 POPBILL_LINK_ID · POPBILL_SECRET_KEY를 묶는다(없으면 비밀값 없이 배포되고 "키 없음"으로 답한다)
const _publicData = require("./publicData");
const _popbill = require("./popbill");
const POPBILL_ON = process.env.POPBILL_ENABLED === "true";
const _pd = _publicData.makePublicData({ db, fetch, getKey: () => process.env.DATA_GO_KR_KEY || "" });
const PD_CODES = new Set(["invalid-argument", "failed-precondition", "permission-denied", "unauthenticated", "resource-exhausted", "unavailable", "not-found"]);
const pdHttpsError = (e) => {
  if (e instanceof functions.https.HttpsError) return e;
  if (e && PD_CODES.has(e.code)) return new functions.https.HttpsError(e.code, e.message);
  console.error("[연동] 오류:", e);
  return new functions.https.HttpsError("internal", "잠시 뒤 다시 해 주세요");
};
const pdCall = (fn, opts = {}) => functions.runWith({ secrets: ["DATA_GO_KR_KEY"], timeoutSeconds: 60, memory: "256MB", ...appCheckCallOpts(), ...opts }).https.onCall(async (data, context) => {
  try { return await fn(data, context.auth); } catch (e) { throw pdHttpsError(e); }
});
exports.bizStatusCheck = pdCall(_pd.bizStatusCheck);
exports.weatherFor = pdCall(_pd.weatherFor, { timeoutSeconds: 120 });
exports.integrationStatus = pdCall(_pd.integrationStatus);
exports.weatherRefresh = functions.runWith({ secrets: ["DATA_GO_KR_KEY"], timeoutSeconds: 540, memory: "256MB" })
  .pubsub.schedule("every 3 hours").timeZone("Asia/Seoul").onRun(async () => {
    const r = await _pd.weatherRefresh().catch((e) => ({ error: String(e?.message || e) }));
    console.log("[기상청] 예보 갱신:", JSON.stringify(r));
    return null;
  });
const _popbillAdmin = _popbill.makePopbillAdmin({
  db, callerOf: _publicData.callerOf,
  getSecrets: () => (POPBILL_ON ? { linkId: process.env.POPBILL_LINK_ID || "", secretKey: process.env.POPBILL_SECRET_KEY || "" } : {}),
});
exports.popbillAdmin = functions.runWith({ ...(POPBILL_ON ? { secrets: ["POPBILL_LINK_ID", "POPBILL_SECRET_KEY"] } : {}), timeoutSeconds: 60, memory: "256MB", ...appCheckCallOpts() }).https.onCall(async (data, context) => {
  try { return await _popbillAdmin(data, context.auth); } catch (e) { throw pdHttpsError(e); }
});

// 💬🏦 2026-11-08 팝빌 자동화 — 카카오 알림톡 배차 알림(functions/alimtalk.js) · 은행 입금 자동 조회 → 미수금 매칭(functions/bankSync.js)
//  팝빌이 꺼져 있으면(키 없음 · 스위치 꺼짐 · 연동회원 없음) 팝빌을 부르지 않고 "팝빌 연결 전"으로만 기록한다 — 키를 넣으면 그대로 켜진다
const popbillSecrets = () => (POPBILL_ON ? { linkId: process.env.POPBILL_LINK_ID || "", secretKey: process.env.POPBILL_SECRET_KEY || "" } : {});
const getPopbillAdapter = async () => {
  const s = await db.collection("integrationConfig").doc("popbill").get().catch(() => null);
  const { linkId = "", secretKey = "" } = popbillSecrets();
  return _popbill.createPopbill({ linkId, secretKey, config: s?.exists ? s.data() || {} : {} });
};
const PB_RUN = POPBILL_ON ? { secrets: ["POPBILL_LINK_ID", "POPBILL_SECRET_KEY"] } : {};
const _alimtalk = require("./alimtalk").makeAlimtalk({ db, FieldValue, getPopbill: getPopbillAdapter, callerOf: _publicData.callerOf });
const _bankSync = require("./bankSync").makeBankSync({ db, FieldValue, getPopbill: getPopbillAdapter, callerOf: _publicData.callerOf });
const ALIMTALK_OFF = true;
// ⚡ 2026-11-23 알림톡을 끈 동안은 배포하지 않는다(모든 컬렉션 쓰기마다 불리던 것) — 다시 쓰려면 ALIMTALK_OFF = false
if (!ALIMTALK_OFF) exports.alimtalkOnOrderWrite = functions.runWith({ ...PB_RUN, timeoutSeconds: 60, memory: "256MB" }).firestore
  .document("orders/{dispatchId}")
  .onWrite(async (change, context) => {
    // 💬 2026-11-08 사장님 요청 — 알림톡 사용 안 함(PC·모바일 화면에서 뺐다). 다시 쓰려면 이 줄만 지운다
    if (ALIMTALK_OFF) return null;
    const { col, dispatchId } = context.params;
    if (!["dispatch", "orders"].includes(col)) return null;
    const after = change.after.exists ? change.after.data() : null;
    if (!after || after.알림톡 !== true || after._seed) return null; // 대부분의 쓰기는 여기서 끝(읽기 없음) · 🧪 테스트 가짜 데이터는 보내지 않는다
    try {
      if (await isBulkModeFor(after.companyName)) return null;
      const r = await _alimtalk.onOrderWrite({ col, id: dispatchId, before: change.before.exists ? change.before.data() : null, after });
      if (r && !r.skipped) console.log("[알림톡]", col, dispatchId, r.status);
    } catch (e) { console.error("[알림톡] 실패:", col, dispatchId, e?.message || e); }
    return null;
  });
// 💬 2026-11-10 문자 보내기(팝빌) — 휴대폰과 연결이 없는 PC · 운송사마다 자기 팝빌 포인트(functions/smsSend.js)
const _smsSend = require("./smsSend").makeSmsSend({ db, FieldValue, getPopbill: getPopbillAdapter, callerOf: _publicData.callerOf });
exports.smsSend = functions.runWith({ ...PB_RUN, timeoutSeconds: 120, memory: "256MB", ...appCheckCallOpts() }).https.onCall(async (data, context) => {
  try { return await _smsSend.send(data, context.auth); } catch (e) { throw pdHttpsError(e); }
});
exports.smsInfo = functions.runWith({ ...PB_RUN, timeoutSeconds: 30, memory: "256MB", ...appCheckCallOpts() }).https.onCall(async (data, context) => {
  try { return await _smsSend.info(data, context.auth); } catch (e) { throw pdHttpsError(e); }
});

exports.alimtalkSend = functions.runWith({ ...PB_RUN, timeoutSeconds: 60, memory: "256MB" }).https.onCall(async (data, context) => {
  if (ALIMTALK_OFF) throw new functions.https.HttpsError("failed-precondition", "알림톡은 사용하지 않습니다");
  try { return await _alimtalk.sendManual(data, context.auth); } catch (e) { throw pdHttpsError(e); }
});
exports.bankDeposits = functions.runWith({ ...PB_RUN, timeoutSeconds: 120, memory: "512MB" }).https.onCall(async (data, context) => {
  try { return await _bankSync.action(data, context.auth); } catch (e) { throw pdHttpsError(e); }
});
// 매시간 08:00~20:00(한국 시각) — 계좌를 켠 회사의 새 입금만 받아 맞춰 본다
exports.bankDepositSync = functions.runWith({ ...PB_RUN, timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("0 8-20 * * *").timeZone("Asia/Seoul").onRun(async () => {
    const r = await _bankSync.syncAll().catch((e) => [{ error: String(e?.message || e) }]);
    console.log("[계좌조회] 동기화:", JSON.stringify(r.map((x) => ({ company: x.company, new: x.new, auto: x.auto, review: x.review, off: x.off, error: x.error }))));
    return null;
  });
// 🔗 2026-11-25 입금 기록(arPayments) → 자금관리 수입 장부 한 줄(functions/arLedgerCore.mjs)
//  회계관리 [입금 처리] · 미수금관리 입금 · 은행 자동 매칭/확정 — 어느 길이든 기록이 생기면 auto_ar_{회사}_{기록 id} 한 줄, 지우면 그 줄도 지운다
//  (문서 id 가 고정이라 다시 불려도 한 줄 · 처음 만들 때만 자금 현황 "거래처 입금" 기본 통장을 붙인다 · 장부에서 고친 통장 · 증빙은 그대로 둔다)
exports.arPaymentLedger = functions.runWith({ timeoutSeconds: 60, memory: "256MB" }).firestore.document("arPayments/{id}").onWrite(async (chg, ctx) => {
  const L = await import("./arLedgerCore.mjs");
  const id = ctx.params.id;
  const before = chg.before.exists ? chg.before.data() || {} : null;
  const after = chg.after.exists ? chg.after.data() || {} : null;
  const co = String((after || before || {}).company || "").trim();
  if (!co) return null;
  // 입금 한 번(묶는 키)마다 그 키의 기록을 다시 모아 장부 한 줄로 — 고치거나 지워도 합계가 맞게
  const keys = new Set([before && L.arDepositKeyOf(before, id), after && L.arDepositKeyOf(after, id)].filter(Boolean));
  for (const k of keys) {
    try {
      let list = [];
      if (k === id) list = after ? [after] : [];
      else if ((after?.depositKey || before?.depositKey) === k) list = ((await db.collection("arPayments").where("company", "==", co).where("depositKey", "==", k).get()).docs || []).map((d) => d.data() || {});
      else { const tid = String((after?.bankTxnId || before?.bankTxnId) || ""); list = ((await db.collection("arPayments").where("company", "==", co).where("bankTxnId", "==", tid).get()).docs || []).map((d) => d.data() || {}).filter((x) => !x.depositKey); }
      const entry = L.arLedgerEntry(list, k);
      const ref = db.collection("acctLedger").doc(L.arLedgerDocId(co, k));
      if (!entry) { await ref.delete().catch(() => null); continue; }
      const cur = await ref.get();
      let fundId = "";
      if (!cur.exists) {
        const fs = await db.collection("acctFunds").where("companyName", "==", co).get().catch(() => null);
        const hit = (fs?.docs || []).map((d) => ({ id: d.id, ...d.data() })).find((f) => f.active !== false && (f.useFor || []).includes("collect"));
        fundId = hit ? hit.id : "";
      }
      await ref.set({ ...entry, updatedAt: FieldValue.serverTimestamp(), ...(cur.exists ? {} : { fundId, receipt: "", createdAt: FieldValue.serverTimestamp(), createdBy: String(after?.by || "자동") }) }, { merge: true });
    } catch (e) { console.error("[입금 장부] 실패:", id, k, e?.message || e); }
  }
  return null;
});
/* ==================================================================
   🧪 2026-11-08 테스트 회사 가짜 데이터 · 설명은 functions/seedTestCompany.js 맨 위
   호출형 seedTestCompany({ action: seed|reset|refresh|clear|status, company: "테스트운송사", cursor })
   · 최고관리자만 · 대상은 "테스트운송사"만(다른 이름은 거절) · 매주 월요일 새벽 날짜 맞추기(seedTestCompanyWeekly)
================================================================== */
const _seedTest = require("./seedTestCompany").makeSeedTestCompany({ db, FieldValue, Timestamp, setBulkMode: (c, on) => setBulkMode(c, on, { wait: on }) });
const SEED_CODES = new Set(["invalid-argument", "permission-denied", "unauthenticated", "failed-precondition"]);
exports.seedTestCompany = functions.runWith({ timeoutSeconds: 120, memory: "512MB" }).https.onCall(async (data, context) => {
  try { return await _seedTest.handle(data || {}, context.auth); } catch (e) {
    if (e instanceof functions.https.HttpsError) throw e;
    if (e && SEED_CODES.has(e.code)) throw new functions.https.HttpsError(e.code, e.message);
    console.error("[테스트 데이터] 실패:", e);
    throw new functions.https.HttpsError("internal", "잠시 뒤 다시 해 주세요");
  }
});
exports.seedTestCompanyWeekly = functions.runWith({ timeoutSeconds: 540, memory: "512MB" }).pubsub
  .schedule("40 4 * * 1").timeZone("Asia/Seoul")
  .onRun(async () => {
    const r = await _seedTest.weekly().catch((e) => ({ error: String(e?.message || e) }));
    console.log("[테스트 데이터] 매주 날짜 맞추기:", JSON.stringify(r));
    return null;
  });

// 🛡 2026-11-09 보안 — 이상 접속 알림(securityPing) · 퇴사자 즉시 차단(onStaffEmploymentChange) — functions/securityFns.js
const _sec = require("./securityFns")({ functions, db, getAuth, FieldValue, userTokens, sendPushAndCleanup, appCheckCallOpts });
exports.securityPing = _sec.securityPing;
exports.onStaffEmploymentChange = _sec.onStaffEmploymentChange;
/* ==============================
   🚚 2026-11-09 차량관리 자동화 — 계산은 functions/fleetCareCore.mjs(차량관리대장·기사앱과 같은 기준)
   ① vehicleCareReminders(매일 08:40 한국시간): 정비·소모품·만기(보험·검사·할부)가 다가오면
      기사에게 기사앱 알림(driver_notifications/care_{uid}_{날짜}) + 푸시, 담당 직원(없으면 회사 관리자)에게 차량 요약 알림.
      같은 항목·같은 단계(남은 500km·D-7·D-1·당일·지남은 7일마다)는 한 번만 — drivers.careNotified 에 단계 기록
   ② vehicleCostMonthly(매월 1일 09:10): 지난달 차량별 비용 리포트 → vehicleCostReports/{회사}_{YYYY-MM} 저장 + 관리자 알림
============================== */
async function fleetCompanyManagers(co) {
  const s = await db.collection("users").where("companyName", "==", co).get().catch(() => null);
  if (!s) return [];
  return s.docs.map((d) => ({ uid: d.id, ...d.data() }))
    .filter((u) => u.approved !== false && u.employmentStatus !== "퇴사" && (u.isMaster === true || ["admin", "allMgr"].includes(u.role)));
}
// ⭐ 2026-11-09 이름 충돌 방지 — 기존 vehicleCareReminders(drivers.care 검사·보험 알림)는 그대로 두고, 새 정비·소모품 예정 알림은 별도 함수
exports.vehicleMaintReminders = functions.runWith({ timeoutSeconds: 300, memory: "512MB" }).pubsub
  .schedule("40 8 * * *").timeZone("Asia/Seoul").onRun(async () => {
    const FC = await import("./fleetCareCore.mjs");
    const today = kstDateStr();
    const [drvSnap, vlSnap, setSnap] = await Promise.all([
      db.collection("drivers").where("등급", "in", ["지입", "직영", "임대", "분양"]).get() /* 🚛 분양 = 회사 전용 지입차 구분(src/fleetGradesCore.js) */,
      db.collection("vehicleLedger").get(),
      db.collection("vehicleCareSettings").get(),
    ]);
    const pc = (s) => String(s || "").replace(/[^0-9가-힣A-Za-z]/g, "").replace(/^[가-힣]+(?=\d)/, "");
    const ledgerBy = new Map(); vlSnap.docs.forEach((d) => { const v = d.data(); if (v.차량번호) ledgerBy.set(`${v.companyName}|${pc(v.차량번호)}`, v); });
    const intBy = new Map(); setSnap.docs.forEach((d) => { const x = d.data(); if (x.companyName) intBy.set(x.companyName, x.intervals || {}); });
    const forStaff = new Map(); // toUid → { co, lines[] }
    const managersCache = new Map();
    let sent = 0;
    for (const dd of drvSnap.docs) {
      const d = dd.data();
      const co = String(d.companyName || "").trim();
      const plate = d.차량번호 || d.carNo || "";
      const ledger = ledgerBy.get(`${co}|${pc(plate)}`) || null;
      const plan = FC.carePushPlan(d, ledger, intBy.get(co) || {}, today);
      const changed = JSON.stringify(plan.nextState) !== JSON.stringify(d.careNotified || {});
      if (!plan.notify.length) { if (changed) await dd.ref.update({ careNotified: plan.nextState }).catch(() => {}); continue; }
      const lines = plan.notify.map((x) => x.text);
      const uid = d.uid || "";
      if (uid && uid === dd.id) {
        const title = "차량 정비 예정 알림";
        const body = `${plate} · ${lines.slice(0, 3).join(" · ")}${lines.length > 3 ? ` 외 ${lines.length - 3}건` : ""}`;
        let fresh = true;
        try {
          await db.collection("driver_notifications").doc(`care_${uid}_${today}`).create({ driverId: uid, type: "vehicle_care", title, body, items: plan.notify, createdAt: FieldValue.serverTimestamp(), read: false, ...(co ? { companyName: co } : {}) });
        } catch (e) { fresh = false; }
        if (fresh) {
          const u = await db.collection("users").doc(uid).get().then((x) => (x.exists ? x.data() : null)).catch(() => null);
          const tokens = u && u.driverPushEnabled !== false ? userTokens(u) : [];
          if (tokens.length) {
            await sendPushAndCleanup(tokens, { notification: { title, body }, data: { type: "vehicle_care", tag: `care-${today}` }, android: { priority: "high" }, apns: { payload: { aps: { sound: "default" } } } }, "차량 정비 예정 알림");
          }
          sent++;
        }
      }
      // 담당 직원(지입차 담당자) — 없으면 회사 관리자
      let targets = d.담당자?.uid ? [d.담당자.uid] : null;
      if (!targets && co) {
        if (!managersCache.has(co)) managersCache.set(co, (await fleetCompanyManagers(co)).map((u) => u.uid));
        targets = managersCache.get(co);
      }
      (targets || []).forEach((t) => { const g = forStaff.get(t) || { co, lines: [] }; g.lines.push(`${plate}${d.이름 || d.name ? `(${d.이름 || d.name})` : ""}: ${lines.join(", ")}`); forStaff.set(t, g); });
      await dd.ref.update({ careNotified: plan.nextState }).catch(() => {});
    }
    for (const [toUid, g] of forStaff) {
      const msg = `[차량 정비 예정] ${g.lines.length}대 — ${g.lines.slice(0, 5).join(" / ")}${g.lines.length > 5 ? ` 외 ${g.lines.length - 5}대` : ""} · 지입차관리 › 차량관리에서 확인`;
      await db.collection("notifications").doc(`vcare_${toUid}_${today}`).set({ toUid, type: "vehicle_care", msg, companyName: g.co, lines: g.lines.slice(0, 50), read: false, createdAt: FieldValue.serverTimestamp() }).catch(() => {});
    }
    console.log(`🚚 차량 정비 예정 — 기사 알림 ${sent}건 · 직원 요약 ${forStaff.size}명 (${today})`);
    return null;
  });

exports.vehicleCostMonthly = functions.runWith({ timeoutSeconds: 300, memory: "512MB" }).pubsub
  .schedule("10 9 1 * *").timeZone("Asia/Seoul").onRun(async () => {
    const FC = await import("./fleetCareCore.mjs");
    const ym = FC.prevYm(kstDateStr());
    const vlSnap = await db.collection("vehicleLedger").get();
    const byCo = new Map();
    vlSnap.docs.forEach((d) => { const v = { id: d.id, ...d.data() }; const co = String(v.companyName || "").trim(); if (!co || !v.차량번호) return; if (!byCo.has(co)) byCo.set(co, []); byCo.get(co).push(v); });
    let n = 0;
    for (const [co, vehicles] of byCo) {
      const [dSnap, tSnap] = await Promise.all([
        db.collection("drivers").where("companyName", "==", co).get().catch(() => null),
        db.collection("vehicleCardTx").where("companyName", "==", co).where("ym", "==", ym).get().catch(() => null),
      ]);
      const rep = FC.monthlyCostReport({ vehicles, drivers: dSnap ? dSnap.docs.map((x) => x.data()) : [], txs: tSnap ? tSnap.docs.map((x) => x.data()) : [], ym });
      if (!rep.rows.length) continue;
      const key = `${co}_${ym}`.replace(/\//g, "_");
      await db.collection("vehicleCostReports").doc(key).set({ companyName: co, ym, sum: rep.sum, rows: rep.rows.slice(0, 300), createdAt: FieldValue.serverTimestamp() });
      const top = rep.rows.slice(0, 3).map((r) => `${r.plate} ${Math.round(r.total).toLocaleString()}원`).join(", ");
      const msg = `[${ym.replace("-", "년 ")}월 차량 비용] ${rep.rows.length}대 합계 ${Math.round(rep.sum.total || 0).toLocaleString()}원${rep.sum.perKm ? ` · km당 ${rep.sum.perKm.toLocaleString()}원` : ""} — 많은 차량: ${top} · 지입차관리 › 차량관리 › [월 비용 리포트]`;
      for (const u of await fleetCompanyManagers(co)) {
        await db.collection("notifications").doc(`vcost_${key}_${u.uid}`).set({ toUid: u.uid, type: "vehicle_cost", msg, companyName: co, ym, read: false, createdAt: FieldValue.serverTimestamp() }).catch(() => {});
      }
      n++;
    }
    console.log(`🚚 월 차량 비용 리포트 ${ym} — ${n}개 회사`);
    return null;
  });

// 🆘 2026-11-09 신규 운송사 "도움 필요" — 매일 오전 9:20(KST) 가입 7일 안 · 오더 0건/기사 0명/직원 1명뿐인 운송사를 최고관리자에게 푸시
//  계산은 functions/helpNeededCore.mjs(관리자센터 화면과 같은 기준) · 숫자는 서버 집계(siteConfig/platformStats, 매일 새벽 4시)
//  [확인함](siteConfig/helpNeededAck)을 누른 회사는 빼고, 목록이 비면 보내지 않는다
exports.helpNeededDaily = functions.runWith({ timeoutSeconds: 120, memory: "256MB" }).pubsub.schedule("20 9 * * *").timeZone("Asia/Seoul").onRun(async () => {
  const HN = await import("./helpNeededCore.mjs");
  const [statsS, plansS, ackS] = await Promise.all([
    db.collection("siteConfig").doc("platformStats").get(),
    db.collection("companyPlans").get(),
    db.collection("siteConfig").doc("helpNeededAck").get(),
  ]);
  const plan = {}; plansS.docs.forEach((d) => { plan[String(d.id).trim()] = d.data() || {}; });
  const acks = (ackS.exists && ackS.data()?.acks) || {};
  const companies = ((statsS.exists && statsS.data()?.companies) || []).map((c) => ({ ...c, name: String(c.name || "").trim(), plan: plan[String(c.name || "").trim()] || null }));
  const list = HN.helpNeededList(companies, Date.now(), acks);
  if (!list.length) return null;
  const tokens = [];
  const tm = await db.collection("users").where("role", "==", "totalMaster").get();
  tm.docs.forEach((d) => tokens.push(...userTokens(d.data())));
  const me = await db.collection("users").where("email", "==", "tjddnqkf@naver.com").limit(1).get();
  me.docs.forEach((d) => tokens.push(...userTokens(d.data())));
  if (!tokens.length) return null;
  const head = list.slice(0, 3).map(({ c, h }) => `${c.name}(${h.day}일째 · ${h.reasons.join("·")})`).join(", ");
  await sendPushAndCleanup([...new Set(tokens)], {
    notification: { title: `🆘 도움 필요 운송사 ${list.length}곳`, body: `${head}${list.length > 3 ? ` 외 ${list.length - 3}곳` : ""} — 관리자센터 › 오늘 할 일에서 연락해 보세요` },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default" } } },
  }, "helpNeeded");
  console.log(`🆘 도움 필요 ${list.length}곳 알림`);
  return null;
});
