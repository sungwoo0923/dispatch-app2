# 배차마당 (별도 사이트) — KP-FLOW

카페형 오더 공유 사이트입니다. 배차관리 프로그램(dispatch-app2) 본체와는
**빌드/배포 파이프라인이 완전히 분리된 독립 프로젝트**입니다. 이 디렉터리
안에 자체 `package.json`, `vite.config.js`, `src/` 를 가진 별도의
Vite + React 앱이며, 본체의 `src/`를 전혀 import하지 않습니다.

- 본체와 공유하는 것은 오직 **Firebase 백엔드**뿐입니다 — 같은 Firebase
  프로젝트의 Auth(로그인 계정)와 Firestore `cafeOrders` 등의 컬렉션을
  그대로 씁니다.
- `landing-site/`(정적 소개 페이지)와 같은 "본체와 완전히 분리된 별도
  사이트" 원칙을 따르되, 배차마당은 로그인/실시간 오더 공유 같은 상호작용이
  필요하므로 `landing-site`와 달리 **실제 빌드 과정이 있는 Vite 앱**입니다.

## 기능 개요

- 회원가입 시 **화주(오더 등록) / 차주(배차 신청)** 를 선택합니다. 차주는
  차량번호/차량종류를 추가로 입력합니다. 다만 "차주만 신청 가능"은 아니고,
  가입한 누구나 서로의 오더를 보고 배차신청할 수 있습니다. 사업자등록번호는
  하이픈 자동입력 + 형식(체크섬) 검증 + "조회"(이미 등록된 같은 사업자번호가
  있으면 회사명 자동입력)를 지원합니다.
- 게시판(기본형 표 / 카드형), 실시간배차현황, 내 등록 오더, 정산현황,
  마이페이지 5개 메뉴. 목록은 항상 10건씩 페이지네이션됩니다. 접속/가입
  직후에는 항상 "기본형(표)" 보기로 시작합니다.
- 상/하차지 주소는 자체 자주 쓰는 장소 자동완성 + Daum(카카오) 우편번호
  서비스 팝업(API 키 불필요)으로 정확한 도로명주소를 검색해 넣을 수 있습니다.
- 배차신청 → 10초 취소 가능 구간(1초씩 올라가는 카운트) → 10초 경과 시
  자동으로 "배차완료"로 확정. 배차완료 후에는 당사자(게시자/신청자)에게
  상대 연락처가 공개되어 전화/문자 버튼과 1:1 실시간 대화창을 쓸 수
  있습니다. 대화 메시지는 3개월이 지나면 서버(Cloud Functions 예약 작업)가
  자동으로 삭제합니다.
- 게시자가 배차완료된 오더의 **배차를 취소**하거나 **오더를 삭제**할 때는
  배정된 차주 정보를 보여주고 "해당 차주와 협의 되었음"에 체크해야만 실행
  버튼이 활성화되는 확인모달을 거칩니다. 배차취소는 오더를 다시 "대기중"으로
  되돌리고(오더 자체는 남음), 오더삭제는 오더를 완전히 삭제합니다. 두 경우
  모두 상대방에게 알림이 갑니다.
- 새 배차신청이 오면 게시자에게 즉시 알림이 남고, 헤더의 알림벨과 "내 등록
  오더" 메뉴에 깜빡이는 NEW 뱃지가 뜹니다. 해당 오더를 열어보면 뱃지가
  사라집니다.
- 정산: 배차완료된 오더에 대해 신청자(기사)가 인수증/명세서 파일을
  업로드하고 "운송완료 처리"를 누르면, 게시자가 서류를 확인하고
  "정산완료 처리"할 수 있습니다. **실제 세금계산서 발행이나 PG 결제
  연동은 아닌, 내부 정산 장부(누가 얼마를 언제 완료·정산했는지 기록)**
  입니다 — "정산현황" 메뉴에서 정산대기/정산완료 금액을 확인할 수 있습니다.

## 로컬 개발

```bash
cd cafe-site
npm install
npm run dev
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

## Firebase 배포가 필요한 것들 (사람이 직접 해야 함)

이 샌드박스 환경에는 `firebase` CLI가 없어서, 아래 항목들은 저장소에
파일로만 존재하고 실제 Firebase 프로젝트에는 자동으로 반영되지 않습니다.
**아래를 배포하지 않으면 새 기능 중 일부가 "일단 열려있는 기본 규칙"으로
동작하거나(연락처 비공개 등 프라이버시 제한 미적용), 색인이 없어 에러가
날 수 있습니다.**

- **Firestore 보안 규칙** (`firestore.rules`): `cafeOrders`(배차신청/취소/
  확정 상태전이 검증 포함), `chat`, `settlement`, `cafeNotifications`,
  `bizDirectory` 규칙이 추가/강화되었습니다.
- **Firestore 색인** (`firestore.indexes.json`): `chat` 컬렉션그룹의
  `createdAt` 색인이 추가되었습니다(3개월 경과 메시지 자동삭제 작업에
  필요).
- **Storage 보안 규칙** (`storage.rules`): 정산 서류 업로드
  (`cafeOrders/{orderId}/settlement/**`) 경로가 추가되었습니다.
- **Cloud Functions** (`functions/`): `cleanupOldCafeChats`(3개월 경과
  대화 자동삭제, 매일 실행)가 추가되었습니다 — `firebase deploy --only
  functions`로 배포해야 실제로 동작합니다.

배포 방법:

- **Firebase 콘솔**: https://console.firebase.google.com 접속 →
  `dispatch-app-9b92f` 프로젝트 선택 → Firestore Database(규칙/색인),
  Storage(규칙) 탭에서 저장소 파일 내용을 붙여넣고 게시
- **Firebase CLI** (로컬 PC에 설치되어 있다면):
  ```bash
  firebase deploy --only firestore:rules,firestore:indexes,storage,functions
  ```

## "Quota exceeded" 오류에 대해

여러 탭/여러 미리보기 배포에서 동시에 열어두면 Firestore 무료(Spark)
요금제의 일일 읽기 한도를 예상보다 빨리 소진할 수 있습니다. 이번 개편에서
불필요한 멀티탭 오프라인 캐시 동기화를 껐지만(`src/firebase.js`), 그래도
반복된다면 Firebase 콘솔의 사용량(Usage) 탭을 확인하고 Blaze(종량제)
요금제로 전환이 필요할 수 있습니다 — 이건 코드가 아니라 프로젝트
과금 설정 문제라 이 저장소만으로는 해결할 수 없습니다.
