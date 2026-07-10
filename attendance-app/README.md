# KP-work — 도급직원 출퇴근/급여관리 앱

기존 배차 프로그램(`dispatch-app2` 저장소 루트)과 **완전히 독립된 별도 프로젝트**입니다.
이 폴더 안에서만 의존성을 설치/빌드하며, 배차앱의 `src/`, `functions/`, Firebase 프로젝트(`dispatch-app-9b92f`) 어느 것도 공유하지 않습니다.

## 구성
- React 18 + Vite + Tailwind CSS
- Firebase Auth(이메일/비밀번호) + Firestore (신규 Firebase 프로젝트 필요)
- react-router-dom v7, lucide-react 아이콘, recharts
- PWA 설치 지원(vite-plugin-pwa) + Capacitor(안드로이드 앱, 백그라운드 위치추적)

## 1. 최초 설정

```bash
cd attendance-app
npm install
cp .env.example .env.local
```

### Firebase 프로젝트 준비
1. https://console.firebase.google.com 에서 **새 프로젝트**를 생성합니다 (배차앱과 다른 프로젝트여야 함).
2. Authentication → 로그인 방법 → **이메일/비밀번호** 사용 설정
3. Firestore Database → 생성 (production 모드)
4. **Storage → 시작하기로 버킷을 생성합니다.** (서류/도장/프로필사진 업로드에 필수. 이 단계를 건너뛰면 업로드 시 브라우저 콘솔에 CORS 오류/400 오류가 발생합니다.)
5. 프로젝트 설정 → 일반 → "내 앱"에서 웹 앱 추가 → 표시되는 설정값을 `.env.local`에 채워 넣습니다.
6. `.firebaserc`의 `REPLACE_WITH_NEW_FIREBASE_PROJECT_ID`를 실제 프로젝트 ID로 변경합니다.
7. 규칙/인덱스 배포. **반드시 Firestore와 Storage를 별도 명령으로 나눠서 배포하세요** — 한 명령에 묶어서
   배포하면(`--only firestore:rules,storage`) Storage 준비가 안 되어 있을 때(4번 단계를 건너뛴 경우)
   배포 전체가 실패하면서 Firestore 규칙조차 반영되지 않습니다. (실제로 이 문제 때문에 세션 내내 반영해온
   Firestore 규칙 변경사항이 프로젝트에 전혀 배포되지 않았던 적이 있었습니다.)
   ```bash
   npx firebase deploy --only firestore:rules,firestore:indexes
   npx firebase deploy --only storage
   ```
   주의: Storage는 Firestore와 달리 `storage:rules` 같은 하위 리소스 지정을 지원하지 않습니다.
   `--only storage:rules`로 실행하면 "Could not find rules for the following storage targets: rules"
   오류가 발생하니 반드시 `--only storage`로만 실행하세요.
   이후 `firestore.rules`나 `storage.rules`를 수정할 때마다 해당 명령을 다시 실행해 최신 규칙을 반영해야 합니다.
   두 번째 명령이 "Firebase Storage has not been set up..." 오류로 실패한다면 4번 단계(Storage 콘솔에서
   버킷 생성)를 아직 하지 않은 것이니 먼저 완료한 뒤 다시 실행하세요.

실제 프로젝트를 아직 만들지 않았다면 `.env.local`의 `VITE_USE_EMULATOR=true` 상태로 두고 아래 로컬 에뮬레이터로 개발할 수 있습니다.

## 2. 로컬 개발

```bash
# 터미널 1: Firebase 로컬 에뮬레이터 (Auth + Firestore, 실제 프로젝트 없이도 동작)
npx firebase emulators:start --only auth,firestore

# 터미널 2: 앱 서버
npm run dev
```

`VITE_USE_EMULATOR=true`이면 `src/firebase.js`가 자동으로 `localhost:9099`(Auth), `localhost:8081`(Firestore) 에뮬레이터에 연결됩니다.

## 3. 빌드

```bash
npm run build
npm run preview
```

## 4. 푸시 알림(FCM) 설정 (선택)

알림함(앱 내 알림)은 별도 설정 없이 이미 동작합니다. 여기서 다루는 것은
"앱을 안 열어도 폰 자체에 알림이 뜨는" 진짜 푸시 알림이며, 아래 세 가지가
모두 되어 있어야 실제로 발송됩니다. 하나라도 빠지면 토큰만 저장되고
푸시는 조용히 전송되지 않습니다(에러가 나지는 않습니다).

1. **Blaze(종량제) 요금제로 업그레이드** — Cloud Functions는 Spark(무료)
   요금제에서 배포할 수 없습니다. Firebase 콘솔 좌측 하단 "업그레이드"에서
   전환하세요. 이 앱 사용량 수준에서는 대부분 무료 한도 안에 들어옵니다.
2. **VAPID 키 발급** — Firebase 콘솔 → 프로젝트 설정 → Cloud Messaging →
   웹 구성 → "웹 푸시 인증서"에서 키 쌍 생성 → 값을 `.env.local`의
   `VITE_FIREBASE_VAPID_KEY`에 채우고 다시 빌드/배포합니다.
3. **Cloud Function 배포**
   ```bash
   npx firebase deploy --only functions
   ```

설정이 끝나면 내정보(모바일)/설정 > 내 정보(PC) 화면의 "푸시 알림 받기"
토글을 사용자가 각자 켜면 됩니다.

## 5. 모바일 앱(설치형)으로 배포

- **PWA(권장, 별도 빌드 불필요)**: 배포된 웹앱 주소를 모바일 브라우저에서 열고 "홈 화면에 추가"하면 아이콘이 생기고 앱처럼 동작합니다. `public/manifest.json`, 서비스워커가 이미 구성되어 있습니다.
- **네이티브 안드로이드(백그라운드 자동출근 정확도 향상)**: 이 샌드박스 환경에는 Android SDK가 없어 네이티브 빌드는 사용자 PC에서 진행해야 합니다.
  ```bash
  npm run build
  npx cap add android      # 최초 1회, android/ 폴더 생성
  npx cap sync android
  npx cap open android     # Android Studio에서 빌드/서명/배포
  ```

## 회사(멀티테넌트) 구조
- 관리자가 회원가입 시 회사를 새로 개설하면 `companies` 문서와 초대코드가 생성됩니다.
- 직원은 회원가입 시 관리자에게 받은 초대코드를 입력해 해당 회사에 소속되어 가입(승인 대기) 상태가 됩니다.
- 관리자가 근로자 관리 화면에서 승인하면 로그인 및 출퇴근 기능이 활성화됩니다.

## 이번 MVP 범위 밖 (추후 확장 가능)
- 전자근로계약서 전자서명
- 안전교육(TBM) 사진/서명 관리
- 사내 게시판/메신저
- 정확한 4대보험 요율 자동 연동 (현재는 회사별 설정 가능한 값 사용)
