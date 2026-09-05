# GOM_Hour 주문페이지 (별도 사이트)

링크로 들어가면 바로 뜨는 GOM_Hour 픽업 주문서입니다. 배차관리 프로그램
(dispatch-app2) 본체, 배차마당(cafe-site)과도 **빌드/배포 파이프라인이
완전히 분리된 독립 프로젝트**입니다(cafe-site와 동일한 방식).

- 본체와 공유하는 것은 오직 **Firebase 프로젝트**뿐입니다 — Firestore의
  `gomOrders`(주문) / `gomOptions`(추가 옵션) / `gomSettings`(가격·공지) /
  `gomPickupCapacity`(픽업일자별 주문 수량) / `gomMaterials`(재료 재고) /
  `gomRecipes`(종류·옵션→재료 사용량) / `gomExpenses`(지출 장부) 컬렉션을 씁니다.
- 관리자페이지는 `/admin/login`(로그인) → `/admin`(대시보드)입니다. 계정은
  Firebase 콘솔 → Authentication → Users에서 이메일/비밀번호로 직접 추가합니다.
  대시보드 탭: 공지/가격, 옵션관리, 픽업수량, 주문/매출, 지출/재고(재료·레시피·지출).
  레시피를 등록해두면 고객이 주문할 때마다 `src/inventoryUtil.js`가 재료 재고를
  자동으로 차감합니다(레시피가 없으면 아무 일도 일어나지 않음, 실패해도 주문
  접수 자체는 막지 않음).

## 지금 당장 해야 할 것

1. `src/gomConstants.js`의 `KAKAO_CHANNEL_URL`을 실제 카카오톡 채널 링크로 교체
2. `public/logo.jpg`를 원하는 로고 파일로 교체(파일명은 그대로 `logo.jpg` 유지하거나
   `index.html`의 `<link rel="icon">`, `OrderPage.jsx`의 `<img src="/logo.jpg">`도 같이 수정)
3. Firebase 콘솔에서 `firestore.rules` 배포(본체 저장소 루트 파일에 이미
   `gomOrders`/`gomOptions`/`gomSettings`/`gomPickupCapacity` 규칙 추가됨)

## 옵션/가격 관리 (관리자페이지 전까지는 Firebase 콘솔에서 직접)

- 종류별 가격: Firestore `gomSettings/pricing` 문서에
  `{ prices: { "box-2": 33000, "box-4": 55000, "bouquet-5": 45000, "bouquet-7": 65000 } }`
- 공지사항: `gomSettings/notice` 문서에 `{ text: "공지 내용" }`
- 추가 옵션: `gomOptions` 컬렉션에 문서 추가. 예)
  ```json
  {
    "category": "lettering",
    "label": "레터링 추가",
    "type": "text",
    "price": 3000,
    "appliesTo": ["box-2", "box-4"],
    "order": 6,
    "active": true
  }
  ```
  `type`은 `checkbox`(단순 추가) / `checkbox_qty`(수량 선택) /
  `select`(택1, `choices` 배열 필요) / `text`(문구 입력) 중 하나. `appliesTo`를
  비워두면 모든 종류에서 보이고, 특정 종류 id를 넣으면 그 종류를 선택했을 때만
  보입니다. 컬렉션이 비어있으면 `gomConstants.js`의 기본값이 화면에 쓰입니다.
- 픽업일자별 주문 가능 수량: `gomPickupCapacity/{YYYY-MM-DD}` 문서에
  `{ maxCount: 10 }` (currentCount는 주문이 들어올 때마다 자동으로 늘어남)

## 로컬 개발

```bash
cd gom-hour-site
npm install
npm run dev
```

## 빌드

```bash
cd gom-hour-site
npm install
npm run build
```

`gom-hour-site/dist`에 정적 산출물이 생성됩니다.

## Vercel 별도 프로젝트로 배포하기

cafe-site와 동일한 방식입니다.

1. https://vercel.com 에서 "Add New… → Project"
2. 이 GitHub 저장소(dispatch-app2) 선택, **Root Directory를 `gom-hour-site`로 지정**
3. Framework Preset **"Vite"** — Build Command `npm run build`, Output Directory `dist`
4. Deploy → 본체/배차마당과는 다른 새 주소 생성 (예: `gom-order.vercel.app`)
5. 구매한 도메인이 있으면 그 프로젝트 Settings → Domains에서 연결
