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
async function gsheetApi(method, path, opts = {}) {
  const client = await getGsheetAuthClient();
  const res = await client.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${GSHEET_SPREADSHEET_ID}${path}`,
    method,
    ...opts,
  });
  return res.data;
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

  // 복제된 탭에서 1행(헤더)만 남기고 나머지 데이터 행은 통째로 삭제한다.
  const rowCount = newProps.gridProperties?.rowCount || 1;
  if (rowCount > 1) {
    await gsheetApi("POST", ":batchUpdate", {
      data: {
        requests: [
          {
            deleteDimension: {
              range: { sheetId: newProps.sheetId, dimension: "ROWS", startIndex: 1, endIndex: rowCount },
            },
          },
        ],
      },
    });
  }
  return newProps;
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

// dispatch 문서 → 시트 B~P열(15개) 값 배열. A(순번)/Q(수수료)/R(매익율)은 수식,
// U(비고(고유값고정값))는 용도 불명이라 사용자가 직접 관리하므로 건드리지 않는다.
function buildGsheetRowBP(d) {
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
    d["배차상태"] || "",     // K 배차상태
    d["차량번호"] || "",     // L 차량번호
    d["이름"] || "",         // M 기사명
    d["전화번호"] || "",     // N 전화번호
    d["청구운임"] || "",     // O 청구운임
    d["기사운임"] || "",     // P 기사운임
  ];
}
// S(프로그램=배차방식)/T(지급방식) 값 배열.
function buildGsheetRowST(d) {
  return [d["배차방식"] || "", d["지급방식"] || ""];
}
// 신규 행을 만들 때(append)만 쓰는, B~V 전체(21개) 값 배열 — 이 시점엔 Q/R/U가
// 아직 빈 칸(새 행)이라 여기서 빈 문자열로 채워도 지울 기존 값이 없어 안전하다.
// 기존 행을 갱신할 때는 이 배열을 쓰지 않고 buildGsheetRowBP/ST를 따로 나눠 써서
// Q(수수료)/R(매익율) 수식과 U(비고(고유값고정값))를 보존한다.
function buildGsheetRowBVForCreate(d) {
  return [...buildGsheetRowBP(d), "", "", ...buildGsheetRowST(d), "", d["메모"] || ""];
}

async function syncOneDispatchToGsheet(docId, data) {
  if (!data) return;
  if ((data.companyName || "") !== GSHEET_TARGET_COMPANY) return;

  const tabName = gsheetMonthTabName(data["상차일"]);
  if (!tabName) return; // 상차일이 없으면 어느 달 탭인지 알 수 없어 스킵

  const existingRef = data._gsheetSync;

  if (existingRef && existingRef.tab && existingRef.row) {
    // 이미 시트에 적혀있는 오더 — B~P, S~T, V만 나눠서 덮어쓴다. A(순번)는 =ROW()-1이라
    // 안 바뀌고, Q(수수료)/R(매익율) 수식과 U(비고(고유값고정값))는 그대로 보존한다
    // (이 세 범위를 건드리면 기존 수식/사용자가 직접 적은 값을 지우게 된다).
    // ⭐ 상차일이 바뀌어 월이 달라졌으면(드문 케이스) 예전 행은 지우고 새 탭에 다시 만든다.
    if (existingRef.tab === tabName) {
      await gsheetApi(
        "PUT",
        `/values/${encodeURIComponent(`${quoteTab(existingRef.tab)}!B${existingRef.row}:P${existingRef.row}`)}?valueInputOption=USER_ENTERED`,
        { data: { values: [buildGsheetRowBP(data)] } }
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
    // 월이 바뀐 경우 — 이전 행은 비우고(다른 오더로 착각되지 않도록) 새 탭에 새로 만든다.
    try {
      await gsheetApi("POST", `/values/${encodeURIComponent(`${quoteTab(existingRef.tab)}!A${existingRef.row}:V${existingRef.row}`)}:clear`, { data: {} });
    } catch (e) {
      console.warn("이전 월 행 정리 실패(무시):", e?.message || e);
    }
  }

  // 신규 — 대상 월 탭을 준비하고(없으면 자동 생성) B~V로 append, 실제 들어간 행 번호를 받아
  // A(순번=행번호-1)/Q(수수료=O-P)/R(매익율=Q/O) 수식을 그 행에 채운다.
  await ensureGsheetMonthTab(tabName);
  const appendRes = await gsheetApi(
    "POST",
    `/values/${encodeURIComponent(`${quoteTab(tabName)}!B:V`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { data: { values: [buildGsheetRowBVForCreate(data)] } }
  );
  const updatedRange = appendRes.updates?.updatedRange || "";
  const rowMatch = updatedRange.match(/![A-Z]+(\d+):/);
  if (!rowMatch) throw new Error(`추가된 행 번호를 확인할 수 없습니다: ${updatedRange}`);
  const row = parseInt(rowMatch[1], 10);

  // ⭐ A/Q/R만 별도로 정확히 그 두 범위에만 쓴다 — B~P는 방금 append로 이미 값이
  // 들어가 있으므로, 여기서 A:R처럼 넓은 범위를 한 번에 덮어쓰면(중간 칸을 빈
  // 문자열로 채우게 되어) 방금 넣은 데이터를 도로 지워버리는 사고가 난다.
  await gsheetApi(
    "PUT",
    `/values/${encodeURIComponent(`${quoteTab(tabName)}!A${row}`)}?valueInputOption=USER_ENTERED`,
    { data: { values: [["=ROW()-1"]] } }
  );
  await gsheetApi(
    "PUT",
    `/values/${encodeURIComponent(`${quoteTab(tabName)}!Q${row}:R${row}`)}?valueInputOption=USER_ENTERED`,
    {
      data: {
        values: [[
          `=IFERROR(O${row}-P${row},"")`,
          `=IFERROR((O${row}-P${row})/O${row},"")`,
        ]],
      },
    }
  );

  await ensureDriverInGsheetUniqueTab(data["차량번호"], data["이름"], data["전화번호"]);
  await db.doc(docId).update({ _gsheetSync: { tab: tabName, row } });
}

exports.syncDispatchToGoogleSheet =
  functions.firestore
    .document("{col}/{dispatchId}")
    .onWrite(async (change, context) => {
      const { col, dispatchId } = context.params;
      if (!["dispatch", "orders"].includes(col)) return;

      const after = change.after.exists ? change.after.data() : null;
      if (!after) return; // 삭제는 반영하지 않는다

      // ⭐ 무한루프 방지 — 이 함수 자신이 _gsheetSync를 써서 생기는 재호출을 걸러낸다.
      // (_gsheetSync만 바뀌고 그 외 필드는 동일하면 스킵)
      const before = change.before.exists ? change.before.data() : null;
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