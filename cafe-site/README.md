# 로지스웹 허브 (예전 배차마당 · 별도 사이트)

카페형 오더 공유 사이트입니다. 배차관리 프로그램(dispatch-app2) 본체와는
**빌드/배포 파이프라인이 완전히 분리된 독립 프로젝트**입니다. 이 디렉터리
안에 자체 `package.json`, `vite.config.js`, `src/` 를 가진 별도의
Vite + React 앱이며, 본체의 `src/`를 전혀 import하지 않습니다.

- 본체와 공유하는 것은 오직 **Firebase 백엔드**뿐입니다 — 같은 Firebase
  프로젝트의 Auth(로그인 계정)와 Firestore `cafeOrders` 컬렉션을 그대로
  씁니다. 배차마당에서 가입한 계정으로 로그인하고, 올린 오더는
  `cafeOrders` 컬렉션에 저장됩니다.
- `landing-site/`(정적 소개 페이지)와 같은 "본체와 완전히 분리된 별도
  사이트" 원칙을 따르되, 배차마당은 로그인/실시간 오더 공유 같은 상호작용이
  필요하므로 `landing-site`와 달리 **실제 빌드 과정이 있는 Vite 앱**입니다.

## 기능 개요 (⭐ 2026-11-06 로지스웹 허브로 개편)

서비스 이름은 `src/cafeConstants.js`의 `MARKET_NAME`/`MARKET_NAME_EN` 한 곳에서 바꿉니다
(현재 "로지스웹 허브 / LogisWeb Hub", index.html 제목도 빌드 때 자동으로 채워짐).
운송 프로그램 버튼 문구는 본체 `src/orderMarketConfig.js`의 같은 이름 상수.

- 로그인: **로지스웹 운송사 직원 계정 그대로**(같은 Firebase Auth). 사이트에서 따로 가입한 계정(`cafeUser`)·기사·화주는 둘러보기만.
- 마켓: 지역(상차/하차 시·도) · 상차일(오늘/내일/7일/지정) · 차종 · 톤수 · 운임 범위 · 긴급 · 마감 포함 필터, 카드/표 보기, 정렬.
- 거래 흐름: 오더 올리기(배차 프로그램 [저장 + 허브 등록] 또는 사이트) → 다른 운송사 [이 오더 잡기](차량·기사·메시지 선택)
  → 올린 운송사가 [수락] → 매칭완료(다른 요청은 자동 마감) → 받은 운송사 배차 프로그램에 오더 자동 생성(`orders/mkt_{id}`, 거래처 = 올린 운송사)
  → 받은 쪽 배차완료·운송완료가 게시글과 올린 운송사 원래 오더에 반영 → 서로 별점 평가.
- 정보 보호: 매칭 전에는 시·구와 운임만 공개. 상·하차지명·정확한 주소·현장 담당자·연락처는 `private/detail`(올린 운송사 + 매칭된 운송사),
  청구 운임·수수료는 `private/settle`(올린 운송사만).
- 알림: `marketNotices` (요청 도착 · 수락/거절/마감 · 배차완료 · 운송완료) — 사이트 우측 위 종.
- 예전 게시글(v 없음)은 그대로 보이고, 예전 10초 배차신청 흐름도 그대로 동작합니다.

데이터 구조 자세히: `src/cafeApi.js` 맨 위 설명. 서버 연동: `functions/orderMarket.js`.

## 로컬 개발

```bash
cd cafe-site
npm install
npm run dev
# 가상 서버(에뮬레이터)로: VITE_USE_EMULATOR=1 npx vite --port 5341  (Auth 9099 · Firestore 8080, 프로젝트 demo-kpflow)
```

## 빌드

```bash
cd cafe-site
npm install
npm run build
```

`cafe-site/dist` 에 정적 산출물이 생성됩니다.

## 새 Vercel 프로젝트로 배포하기 (기존 본체 프로젝트와 완전히 분리)

1. https://vercel.com 에서 "Add New… → Project" 클릭
2. 이 GitHub 저장소(dispatch-app2)를 선택하되, **Root Directory를
   `cafe-site`로 지정**
3. Framework Preset은 **"Vite"** 선택 (landing-site와 달리 실제 빌드가
   필요합니다) — Build Command `npm run build`, Output Directory `dist`
   (Vite 프리셋 선택 시 자동으로 채워집니다)
4. Deploy 클릭 → 본체(dispatch-app2)와는 다른, 새로운 별도 주소(예:
   `baecha-madang.vercel.app`)가 생성됩니다.
5. 구매한 도메인이 있으면 Vercel 프로젝트 Settings → Domains 에서 그 새
   프로젝트에 연결하세요. **배차관리 프로그램이 붙어있는
   프로젝트/도메인과는 반드시 다른 프로젝트**로 만들어야 완전히
   분리됩니다.

### 다른 방법 (Vercel CLI)

```bash
cd cafe-site
npx vercel --prod
```

프롬프트에서 새 프로젝트로 생성하면 됩니다(기존 dispatch-app2 프로젝트와
연결하지 않도록 주의).

## Firestore 보안 규칙 배포 필요

본체 저장소 루트의 `firestore.rules`에는 이미 `cafeOrders` 컬렉션과 그
`contact` 서브컬렉션에 대한 규칙이 포함되어 있습니다(연락처는 오더 상태가
"confirmed"가 된 이후 게시자/신청자 당사자만 읽을 수 있도록 제한).

**이 규칙은 저장소에 파일로만 존재할 뿐, 실제 Firebase 프로젝트에
배포되어야 적용됩니다.** 이 샌드박스 환경에는 `firebase` CLI가 없으므로,
다음 중 한 가지 방법으로 사람이 직접 배포해야 합니다.

- **Firebase 콘솔**: https://console.firebase.google.com 접속 →
  `dispatch-app-9b92f` 프로젝트 선택 → Firestore Database → 규칙 탭 →
  저장소의 `firestore.rules` 내용을 붙여넣고 게시
- **Firebase CLI** (로컬 PC에 설치되어 있다면):
  ```bash
  firebase deploy --only firestore:rules
  ```

규칙이 배포되기 전까지는 `cafeOrders`/`contact` 접근이 저장소의
`{document=**}` 기본 규칙(로그인한 사용자면 전체 읽기/쓰기 허용)을 따르게
되어, "배차완료 전에는 연락처 비공개" 같은 프라이버시 제한이 실제로는
적용되지 않을 수 있습니다.

## ⭐ 2026-11-06 허브 개편 후 배포 순서

1. `firebase deploy --only firestore:rules` — 새 규칙(운송사 계정만 등록·잡기, 비공개 문서 분리, `marketNotices`).
   ※ 규칙을 먼저 올리면 예전 운송 프로그램 버전의 [저장 + 배차마당 등록](주소를 공개 본문에 쓰던 방식)은 거부되니,
   본체(배차 프로그램) 배포와 같은 날 올리세요.
2. `firebase deploy --only functions:orderMarketOnListingUpdate,functions:orderMarketOnTakerOrderWrite` — 매칭 즉시 받은 운송사
   프로그램에 오더 생성 + 진행 상태 반영. (함수가 없어도 양쪽이 이 사이트를 열면 화면이 같은 일을 대신 합니다)
3. 이 사이트(Vercel 별도 프로젝트, Root Directory `cafe-site`) 재배포.
