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

// 2행부터 rowCount행까지(헤더 제외 데이터 행 전체)를 최대한 지운다. 시트 API는
// "고정(freeze)되지 않은 행을 100% 다 지우는" 걸 허용하지 않아서(이 시트는 1행이
// 고정돼있음) 마지막 한 줄은 남겨두고 그 앞까지만 지운다 — 남는 한 줄은 어차피 빈
// placeholder 줄이라 문제 없다.
async function clearGsheetDataRows(sheetId, rowCount) {
  const endIndex = rowCount - 1;
  if (endIndex <= 1) return; // 지울 데이터 행이 사실상 없음
  await gsheetApi("POST", ":batchUpdate", {
    data: {
      requests: [
        { deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: 1, endIndex } } },
      ],
    },
  });
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
  await clearGsheetDataRows(newProps.sheetId, newProps.gridProperties?.rowCount || 1);
  return newProps;
}

// 신규 오더를 어느 행에 넣을지 정한다 — B열(상차일)만 본다. 아직 안 쓴 나머지 행에도
// K~R 등에 기본값을 채워주는 수식이 미리 깔려있어("배차중", "정보 없음" 등) 그 칸들까지
// "데이터"로 치면 항상 시트 맨 끝(1000행 근처)으로 밀려버리는데, 진짜 오더가 있는 행만
// B열(상차일)이 채워져 있다는 점을 이용해 진짜 데이터의 끝을 정확히 찾는다.
// - 마지막 진짜 행과 상차일이 같으면 바로 다음 행에 이어붙인다(같은 날짜끼리 뭉침).
// - 다르면(=새로운 날짜) 그 사이에 빈 줄 하나를 넣어 날짜 블록을 시각적으로 분리한다.
async function findGsheetInsertPosition(tabName, targetDate) {
  const res = await gsheetApi("GET", `/values/${encodeURIComponent(`${quoteTab(tabName)}!B2:B2000`)}`);
  const values = res.values || [];
  let lastRealRow = 1; // 1행=헤더. 진짜 데이터가 하나도 없으면 그대로 1.
  let lastRealDate = null;
  for (let i = 0; i < values.length; i++) {
    const v = String(values[i]?.[0] || "").trim();
    if (!v) break; // 중간에 빈 칸이 나오면 진짜 데이터는 거기서 끝난 것으로 본다
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

// dispatch 문서 → 시트 B~J열(9개) 값 배열. K(배차상태)는 시트 자체의 배열수식
// (=ARRAYFORMULA(IF(A2:A="","",IF(L2:L<>"","배차완료","배차중")))이 K2 하나에만 걸려서
// A/L열을 보고 전체 열에 자동으로 계산되므로 — 여기서 값을 쓰면 그 배열수식이 깨진다
// (#REF! 오류) — 절대 건드리지 않는다.
function buildGsheetRowBJ(d) {
  return [
    d["상차일"] || "",       // B 상차일
    d["거래처명"] || "",     // C 거래처명
    d["상차지명"] || "",     // D 상차지
    d["상차지주소"] || "",   // E 상차지주소
    d["하차지명"] || "",     // F 하차지
    d["하차지주소"] || "",   // G 하차지주소
    d["화물내용"] || "",     // H 화물정보
    d["차량톤수"] || "",     // I 차량톤수
    d["차량종류"] || "",     // J 차량종류
  ];
}
// O(청구운임)/P(기사운임) 값 배열. M(기사명)/N(전화번호)은 행마다 걸린
// INDEX/MATCH 수식(고유값 시트에서 L열=차량번호로 찾아옴)이라 여기서 값을
// 직접 쓰지 않는다 — 새 행을 만들 때만(수식 자체가 없으므로) 별도로 써준다.
function buildGsheetRowOP(d) {
  return [d["청구운임"] || "", d["기사운임"] || ""];
}
// S(프로그램=배차방식)/T(지급방식) 값 배열.
function buildGsheetRowST(d) {
  return [d["배차방식"] || "", d["지급방식"] || ""];
}
// 새 행을 만들 때만 쓰는 수식들 — M(기사명)/N(전화번호)은 고유값 시트에서
// L(차량번호)로 찾아오는 INDEX/MATCH, Q(수수료)/R(매익율)은 O/P 기준 계산식.
// 사용자가 실제로 쓰고 있는 시트의 수식을 그대로 재현한다(행 번호만 그 행에 맞게 대입).
function gsheetFormulaMN(row) {
  return [
    `=IFERROR(INDEX('고유값'!$A$2:$A$102971, MATCH(L${row}, '고유값'!$B$2:$B$102971, 0)), "정보 없음")`,
    `=IFERROR(INDEX('고유값'!$C$2:$C$102971, MATCH(L${row}, '고유값'!$B$2:$B$102971, 0)), "정보 없음")`,
  ];
}
function gsheetFormulaQR(row) {
  return [`=O${row}-P${row}`, `=SUM(Q${row}/O${row})`];
}

async function syncOneDispatchToGsheet(docId, data) {
  if (!data) return;
  if ((data.companyName || "") !== GSHEET_TARGET_COMPANY) return;

  // 배차취소(앱의 "삭제"는 실제 문서삭제가 아니라 배차상태를 배차취소로 바꾸는
  // 소프트삭제라 여기로 update가 들어온다) — 이미 시트에 올라간 행이 있으면 그
  // 행 자체를 지운다. 취소되기 전에 한 번도 동기화된 적 없는 오더는 애초에 새로
  // 만들지 않고 그냥 스킵(취소된 오더를 새로 시트에 올릴 이유가 없음).
  if (data["배차상태"] === "배차취소") {
    if (data._gsheetSync) await removeOneDispatchFromGsheet(data, docId);
    return;
  }

  const tabName = gsheetMonthTabName(data["상차일"]);
  if (!tabName) return; // 상차일이 없으면 어느 달 탭인지 알 수 없어 스킵

  const existingRef = data._gsheetSync;

  if (existingRef && existingRef.tab && existingRef.row) {
    // 이미 시트에 적혀있는 오더 — B~J, L, O~P, S~T, V만 나눠서 덮어쓴다.
    // A(순번)/Q(수수료)/R(매익율)/K(배차상태)/M(기사명)/N(전화번호)은 전부 시트 자체
    // 수식이 계산해주는 칸이라(수식이 A/L열을 보고 자동 계산) 절대 건드리지 않는다 —
    // 여기 값을 쓰면 수식이 깨진다. U(비고(고유값고정값))도 용도 불명이라 그대로 둔다.
    // ⭐ 상차일이 바뀌어 월이 달라졌으면(드문 케이스) 예전 행은 지우고 새 탭에 다시 만든다.
    if (existingRef.tab === tabName) {
      await gsheetApi(
        "PUT",
        `/values/${encodeURIComponent(`${quoteTab(existingRef.tab)}!B${existingRef.row}:J${existingRef.row}`)}?valueInputOption=USER_ENTERED`,
        { data: { values: [buildGsheetRowBJ(data)] } }
      );
      await gsheetApi(
        "PUT",
        `/values/${encodeURIComponent(`${quoteTab(existingRef.tab)}!L${existingRef.row}`)}?valueInputOption=USER_ENTERED`,
        { data: { values: [[data["차량번호"] || ""]] } }
      );
      await gsheetApi(
        "PUT",
        `/values/${encodeURIComponent(`${quoteTab(existingRef.tab)}!O${existingRef.row}:P${existingRef.row}`)}?valueInputOption=USER_ENTERED`,
        { data: { values: [buildGsheetRowOP(data)] } }
      );
      await gsheetApi(
        "PUT",
        `/values/${encodeURIComponent(`${quoteTab(existingRef.tab)}!S${existingRef.row}:T${existingRef.row}`)}?valueInputOption=USER_ENTERED`,
        { data: { values: [buildGsheetRowST(data)] } }
      );
      await gsheetApi(
        "PUT",
        `/values/${encodeURIComponent(`${quoteTab(existingRef.tab)}!V${existingRef.row}`)}?valueInputOption=USER_ENTERED`,
        { data: { values: [[data["메모"] || ""]] } }
      );
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

    const { insertRow } = await findGsheetInsertPosition(tabName, data["상차일"]);
    const r = insertRow; // 실제 데이터가 들어갈 행
    await ensureGsheetRowsUpTo(sheetProps.sheetId, sheetProps.gridProperties?.rowCount || 1, r);

    await gsheetApi(
      "PUT",
      `/values/${encodeURIComponent(`${quoteTab(tabName)}!B${r}:J${r}`)}?valueInputOption=USER_ENTERED`,
      { data: { values: [buildGsheetRowBJ(data)] } }
    );
    await gsheetApi(
      "PUT",
      `/values/${encodeURIComponent(`${quoteTab(tabName)}!L${r}`)}?valueInputOption=USER_ENTERED`,
      { data: { values: [[data["차량번호"] || ""]] } }
    );
    await gsheetApi(
      "PUT",
      `/values/${encodeURIComponent(`${quoteTab(tabName)}!M${r}:N${r}`)}?valueInputOption=USER_ENTERED`,
      { data: { values: [gsheetFormulaMN(r)] } }
    );
    await gsheetApi(
      "PUT",
      `/values/${encodeURIComponent(`${quoteTab(tabName)}!O${r}:P${r}`)}?valueInputOption=USER_ENTERED`,
      { data: { values: [buildGsheetRowOP(data)] } }
    );
    await gsheetApi(
      "PUT",
      `/values/${encodeURIComponent(`${quoteTab(tabName)}!Q${r}:R${r}`)}?valueInputOption=USER_ENTERED`,
      { data: { values: [gsheetFormulaQR(r)] } }
    );
    await gsheetApi(
      "PUT",
      `/values/${encodeURIComponent(`${quoteTab(tabName)}!S${r}:T${r}`)}?valueInputOption=USER_ENTERED`,
      { data: { values: [buildGsheetRowST(data)] } }
    );
    await gsheetApi(
      "PUT",
      `/values/${encodeURIComponent(`${quoteTab(tabName)}!V${r}`)}?valueInputOption=USER_ENTERED`,
      { data: { values: [[data["메모"] || ""]] } }
    );
    await gsheetApi(
      "PUT",
      `/values/${encodeURIComponent(`${quoteTab(tabName)}!A${r}`)}?valueInputOption=USER_ENTERED`,
      { data: { values: [["=ROW()-1"]] } }
    );

    // 방금 쓴 행이 시트의 마지막 행이면, 다음 오더를 위해 서식 이어받은 빈 버퍼 행을
    // 하나 더 마련해둔다(항상 맨 끝에 빈 줄 하나가 대기하고 있도록 유지).
    const sheetPropsAfter = (await getGsheetSheetList()).find((s) => s.title === tabName);
    const rowCountNow = sheetPropsAfter?.gridProperties?.rowCount || r;
    if (sheetPropsAfter && rowCountNow <= r) {
      await appendGsheetBufferRow(sheetPropsAfter.sheetId, rowCountNow);
    }
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
      if (sheet) await clearGsheetDataRows(sheet.sheetId, sheet.gridProperties?.rowCount || 1);

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
      const items = [];
      for (const col of ["orders", "dispatch"]) {
        const snap = await db.collection(col).where("companyName", "==", GSHEET_TARGET_COMPANY).get();
        snap.docs.forEach((d) => {
          const data = d.data();
          if (String(data["상차일"] || "").startsWith(monthPrefix)) {
            items.push({ docId: `${col}/${d.id}`, data });
          }
        });
      }
      items.sort((a, b) => {
        const dcmp = String(a.data["상차일"] || "").localeCompare(String(b.data["상차일"] || ""));
        if (dcmp !== 0) return dcmp;
        return (Number(a.data["순번"]) || 0) - (Number(b.data["순번"]) || 0);
      });

      let created = 0, canceled = 0, failed = 0;
      const failedIds = [];
      for (const { docId, data } of items) {
        if (data["배차상태"] === "배차취소") { canceled++; continue; } // 취소된 오더는 시트에 안 올림
        try {
          await syncOneDispatchToGsheet(docId, data);
          created++;
        } catch (e) {
          failed++;
          failedIds.push(docId);
          console.error(`백필 실패 ${docId}:`, e?.message || e);
        }
        await sleep(300); // 요청 제한(429)에 걸리지 않도록 오더 사이에 텀을 둔다
      }

      res.status(200).send(
        `완료 — 탭 "${tabName}" 초기화 후 반영 ${created}건, 배차취소(제외) ${canceled}건, 실패 ${failed}건 (대상 ${items.length}건)` +
        (failedIds.length ? `\n실패 목록(최대 20건): ${failedIds.slice(0, 20).join(", ")}` : "")
      );
    } catch (e) {
      console.error("백필 오류:", e);
      res.status(500).send(`오류: ${e?.message || e}`);
    } finally {
      await lockRef.delete().catch(() => {});
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
        if (before && (before.companyName || "") === GSHEET_TARGET_COMPANY) {
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