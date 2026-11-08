# App Check 켜기 (사장님용 순서)

"우리 앱에서 온 요청만" 서버(Firestore · Storage · 서버 함수)를 쓰게 막는 장치입니다.
코드는 이미 들어가 있고, **키를 넣기 전에는 아무 변화가 없습니다.** 아래 순서대로만 하면 됩니다.

> 세 사이트(본체 app · 허브 hub · 홈페이지 www)는 같은 Firebase 웹 앱(`1:273115387263:web:8ae6…`)을 쓰므로 **키 1개, 등록 1번**이면 됩니다.

## 1. reCAPTCHA Enterprise 키 만들기 (Google Cloud 콘솔)

1. https://console.cloud.google.com → 위쪽 프로젝트 선택 → **dispatch-app-9b92f**
2. 위 검색창에 `reCAPTCHA` → **보안 › reCAPTCHA** (처음이면 **사용 설정** 클릭)
3. **+ 키 만들기**
   - 표시 이름: `LogisWeb 웹`
   - 플랫폼 유형: **웹사이트**
   - 도메인 추가(한 줄씩):
     `app.logisweb.co.kr`, `hub.logisweb.co.kr`, `www.logisweb.co.kr`, `logisweb.co.kr`,
     `dispatch-app2.vercel.app`, `dispatch-app2-vskk.vercel.app`
     (+ 허브 Vercel 프로젝트 **Settings › Domains**에 보이는 `….vercel.app` 주소가 있으면 그것도)
   - **체크박스 문제 사용(Use checkbox challenge)** → 끔(체크 해제)
4. **키 만들기** → 화면에 나온 **키 ID**(6L…로 시작)를 복사

## 2. Firebase에 등록

1. https://console.firebase.google.com → **dispatch-app-9b92f**
2. 왼쪽 **빌드(Build) › App Check** → (처음이면 **시작하기**)
3. **앱** 탭 → 웹 앱 줄 클릭 → **reCAPTCHA Enterprise** 선택 → 1단계 키 ID 붙여넣기 → **저장**
4. ⚠️ 아직 **API 탭의 "적용(Enforce)"은 누르지 마세요** (6단계에서)

## 3. 서버 함수 먼저 배포 (순서 중요)

```
firebase deploy --only functions
```
- `functions/.env`의 `APPCHECK_MODE=monitor`(기본값) — 토큰이 없어도 막지 않고 기록만 합니다.
- **반드시 4단계보다 먼저** 배포하세요. 새 함수가 토큰 헤더(`X-Firebase-AppCheck`)를 허용해야 화면이 그 헤더를 보낼 수 있습니다.

## 4. 사이트에 키 넣기

- **Vercel 본체 프로젝트**(app.logisweb.co.kr): **Settings › Environment Variables** → Key `VITE_APPCHECK_SITE_KEY`, Value = 키 ID, Environments **Production · Preview** → **Save**
  → **Deployments** → 맨 위 배포 **⋯ › Redeploy**
- **Vercel 허브 프로젝트**(hub.logisweb.co.kr): 똑같이 `VITE_APPCHECK_SITE_KEY` 추가 → **Redeploy**
- **홈페이지**(www, 빌드 없는 정적 사이트): `landing-site/index.html`의 `window.KP_APPCHECK_SITE_KEY = "";` 따옴표 안에 키 ID를 넣고 main에 올리기(push)

확인: 각 사이트를 열고 F12 › 네트워크에서 `exchangeRecaptchaEnterpriseToken` 요청이 200이면 정상.

## 5. 일주일 지켜보기 (monitor)

- Firebase **App Check › API** 탭 → **Cloud Firestore**, **Cloud Storage** 클릭 → "확인된 요청" 비율이 거의 100%인지
- 서버 함수 기록: Google Cloud 콘솔 **로깅 › 로그 탐색기** → 검색 `"[AppCheck]"` → `endpoint=함수이름 reason=missing|invalid` 가 줄어드는지
  (호출형 함수는 `"Callable request verification passed"` 기록의 `app: "MISSING"` 으로 확인)
- 개발 PC에서 테스트할 때: `.env.local`에 `VITE_APPCHECK_SITE_KEY=키ID`, `VITE_APPCHECK_DEBUG=1` → 브라우저 콘솔에 찍힌 **디버그 토큰**을 **App Check › 앱 › 웹 앱 ⋮ › 디버그 토큰 관리**에 추가

## 6. 적용 (enforce)

⚠️ **먼저 확인: 안드로이드 기사앱** — 기사앱(Capacitor)은 아직 토큰을 보내지 않습니다(아래 "후속 작업").
지금 적용하면 기사앱의 Firestore 읽기·쓰기와 서버 함수 호출이 막힙니다. **후속 작업을 끝낸 뒤** 적용하세요.

1. Firebase **App Check › API** 탭 → **Cloud Firestore** → **적용** → 확인
2. 같은 화면 **Cloud Storage** → **적용**
3. `functions/.env` 를 `APPCHECK_MODE=enforce` 로 바꾸고 `firebase deploy --only functions`
   (호출형 함수는 배포할 때 모드가 정해지므로 **꼭 재배포**)

되돌리기: API 탭에서 **적용 해제(Unenforce)** · `APPCHECK_MODE=monitor` 로 바꾸고 다시 배포.

## 후속 작업: 안드로이드 기사앱 (Play Integrity)

- 지금은 휴대폰 앱 안(`window.Capacitor.isNativePlatform()`)에서는 App Check를 건너뜁니다.
- 할 일: `@capacitor-firebase/app-check` 플러그인 추가 → Firebase 콘솔에 안드로이드 앱 `com.kpflow.driver` 등록(SHA-256 지문) →
  App Check › 앱 › 안드로이드 앱 › **Play Integrity** 등록 → 플러그인 토큰을 웹 SDK에 넘기는 연결(CustomProvider) → APK 다시 만들기
  (설명: `src/appCheckClient.js` 맨 위)

## 확인하지 않는 서버 함수 (일부러 제외)

| 종류 | 함수 | 이유 |
|---|---|---|
| 외부 웹훅 | `hubVaDeposit` | 은행/PG가 부름(앱 아님) |
| 키로 여는 관리 도구 | `backfillGsheetMonth` · `backfillGsheetClients` · `setupGsheetDailyLedger` · `backfillGsheetFareHistory` · `applyGsheetGuides` · `checkGsheetMonth` | 주소창에서 `?key=`로 직접 엶 |
| 서버 대리 호출 | `fuel` | Vercel `/api/fuel`이 부름 |
| 화면에서 안 씀 | `lookupCompanyCode` | 쓰지 않는 함수(헤더만 허용) |
| 예약 실행 | `remindDriverCheckin` · `hourlyJobs` · `dailyReportPush` · `weatherRefresh` · `hubPayoutDaily` 등 `pubsub.schedule` 전부 | 사람 요청이 아님 |
| Firestore 트리거 | `notify*` · `hub*OnWrite/OnCreate` · `archiveDeletedOrder` · `dedupeFcmToken` 등 `firestore.document` 전부 | 사람 요청이 아님 |

확인하는 함수: 화면이 부르는 onRequest 전부(`sendPushNotification` · `tenantMigrate` · `driverSearch` · `checkEmail` · `freeDeletedEmail` · `linkDriverSignup` · `findCompany` · `companyReset` · `companyResetJob` · `companyResetPurge` · `contractNoticeRun` · `restoreDeleted` · `pushDiag` · `automation` · `gsheetMine` · `sheetOcr` · `routeBoardSheet` · `sheetConnect` · `sheetImport` · `platformStats` · `platformUsageNow` · `aiTeamChat`)
+ 호출형 전부(`orderScanOcr` · `orderScanExtract` · `aiAssistantChat` · `payroll*` · `bizStatusCheck` · `weatherFor` · `integrationStatus` · `popbillAdmin` · `hubBindDevice` · `hubAdminResetDevice` · `hubAdminSetDriverLogin`).
코드: `functions/appCheck.js`(서버) · `src/appCheckClient.js`(화면) · 테스트 `node scripts/appCheck.test.cjs`
