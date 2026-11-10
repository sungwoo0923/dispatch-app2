# PnK PROJECT 사내 인트라넷 (`pnk-site/`)

PnK PROJECT(법인)가 만드는 **로지스웹 · 로지스웹 허브 · 공식 홈페이지 · 기사앱**을 한곳에서 관리하는 본사 인트라넷.
로지스웹 본체(`src/`) · 허브(`cafe-site/`) · 홈페이지(`landing-site/`)와 **빌드/배포가 완전히 분리된** 별도 Vite + React 앱이다.
같은 Firebase 프로젝트(로그인 계정 · Firestore · Storage)만 함께 쓴다.

- 로그인: 로지스웹과 같은 계정. 처음 들어온 계정은 [가입 요청] → 관리자 승인 후 사용.
- 대표(최고관리자 `tjddnqkf@naver.com` 또는 `users/{uid}.role == "totalMaster"`)는 자동으로 구성원(대표)이 된다.
- 상위 폴더에서 가져오는 것: `../src/appCheckClient.js`, `../src/CustomDatePicker.jsx`, `../src/kpTimePick.jsx`, `../src/kpInputs.jsx`, `../src/CustomSelect.jsx`, `../src/planCore.js`
  (모두 Firebase를 쓰지 않는 순수 화면/계산 조각 — 로지스웹과 같은 달력 · 시간 · 월 고르기 · 요금제 표)

## 메뉴

| 메뉴 | 내용 | 볼 수 있는 사람 |
|---|---|---|
| 본사 대시보드 | 인사 · 시계(한국 시간) · 바로가기 · 내 업무/메일/영업/고객사 숫자 · 사업 관제 그래프 · 서비스 상태 · 최근 글 · 일정 | 모두 (사업 관제는 대표) |
| 고객사 · 가입자 | 관리자센터와 같은 데이터(운송사 · 직원 · 기사 · 요금제 · 청구) 그래프 + 목록 + 처리할 일. **읽기 전용** — 처리는 관리자 관리센터 | 대표 |
| 서비스 현황 | 4개 서비스 상태(정상/점검/장애) · 버전 · 진행 업무 · 업데이트 기록 | 모두 (상태 변경은 관리자) |
| 영업 관리 | 단계별 파이프라인 · 깔때기 그래프 · 연락할 곳 · 연락 기록 | 모두 |
| 사내 공지 | 공지 + 읽음 확인(누가 안 읽었는지) | 모두 (쓰기는 관리자) |
| 게시판 · 회의록 | 자유게시판 · 회의록 · 댓글 | 모두 |
| 사내메일 | `아이디@logisweb.co.kr` 주소로 구성원끼리 주고받기 · 답장 · 전달 · 중요 · 휴지통 | 모두 |
| 업무 보드 | 할 일/진행 중/완료(끌어서 옮기기) · 서비스별 · 담당자별 · 완료율 | 모두 |
| 일정 | 회사 일정 + 영업 연락일 + 업무 기한을 한 달력에 | 모두 |
| 자료실 | 분류별 파일(50MB 미만) · 관리자 전용 자료 | 모두 |
| 매출 · 손익 | 월별 손익 그래프 · 비용 구성 · 서비스별 · 장부 · 로지스웹 수납 금액 불러오기 | 관리자 |
| 회사 정보 | 법인 정보 · 브랜드 · 바로가기 · (관리자) 계좌 · 운영 계정 목록 | 모두 |
| 구성원 · 조직도 | 조직도 · 연락처 · (관리자) 가입 승인 · 역할 · 메일 아이디 · 사용 중지 | 모두 |

역할: **대표**(owner) · **관리자**(admin: 매출 · 구성원 · 공지) · **직원**(staff).

## 데이터 (Firestore · 모두 `pnk` 로 시작)

`pnkMembers` `pnkPosts`(+`comments`) `pnkMail` `pnkTasks` `pnkEvents` `pnkSales` `pnkServices` `pnkReleases` `pnkFiles` `pnkCompany/info|secure` `pnkFinance`
— 규칙: `firestore.rules` 의 "PnK PROJECT 사내 인트라넷" 묶음(+ 맨 아래 `catchAllExcluded` 목록), 파일: `storage.rules` 의 `pnk/files/`.

## 개발 · 확인

```bash
cd pnk-site && npm install
npm run dev                          # 실제 Firebase에 붙음
VITE_USE_EMULATOR=1 npm run dev      # 로컬 가상 서버(에뮬레이터, 프로젝트 demo-kpflow)
npm run build
```

## 배포 (처음 한 번)

1. **Firebase 규칙** — GitHub › Actions › "Firebase 배포" › Run workflow › `규칙+색인+저장소만` (규칙을 먼저 올려야 인트라넷이 읽고 쓸 수 있다)
2. **Vercel 새 프로젝트** — 같은 저장소 · Root Directory `pnk-site` · Framework Vite (빌드 `npm run build`, 출력 `dist`)
   - 환경 변수(선택): `VITE_APPCHECK_SITE_KEY` (본체와 같은 값)
   - 도메인 예: `intranet.logisweb.co.kr` — Firebase 콘솔 › Authentication › 승인된 도메인에도 추가
3. `main`에 push되면 자동 배포(`claude/*` 브랜치는 배포 안 됨). 검색엔진에는 안 뜨게 `noindex`.

## 다음 단계 — 외부 메일(@logisweb.co.kr) 연결

지금 사내메일은 구성원끼리만 오간다. 외부로 보내고 받으려면:
1. logisweb.co.kr 도메인 관리(가비아 등) 접속 권한
2. 메일 발송 서비스(예: Amazon SES · Resend) 가입 → 도메인 인증(SPF · DKIM DNS 레코드)
3. 받기: MX 레코드를 수신 서비스로 → 수신 웹훅이 서버 함수로 → `pnkMail`에 저장
4. 서버 함수(`functions/`)에 발송 · 수신 함수 추가, 화면은 `pnkCompany/info.mailExternal` 켜면 외부 주소 허용
