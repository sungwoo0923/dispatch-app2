# 배차마당 (별도 사이트)

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

## 기능 개요

- 회원가입: 회사명 / 이름 / 닉네임 / 휴대폰번호 / 이메일(아이디) / 비밀번호
- 게시판: `cafeOrders` 컬렉션의 오더 목록(상차지/하차지/주소/화물내용/
  톤수/지급방식/상하차방법/상하차시간/혼적여부/운임/왕복/긴급/경유여부/
  차량종류, 등록자 회사명·닉네임) — 검색, 차량종류/지급방식 필터
- 배차신청 → 10초 취소 가능 구간 → 10초 경과 시 자동으로 "배차완료"로
  확정. 게시자의 연락처(`cafeOrders/{id}/contact/info` 서브컬렉션)는
  "배차완료" 상태가 된 이후에만 당사자(게시자/신청자)에게 공개되어
  전화/문자 버튼이 활성화됩니다.
- 게시자는 본인이 등록한 오더를 수정/취소/삭제할 수 있습니다.
- 네비게이션: 홈 / 실시간배차현황 / 내 등록 오더 / 마이페이지

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
