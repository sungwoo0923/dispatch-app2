# PnK PROJECT 사내 인트라넷 (`pnk-site/`)

PnK PROJECT(법인)가 만드는 **로지스웹 · 로지스웹 허브 · 공식 홈페이지 · 기사앱**을 한곳에서 관리하는 본사 인트라넷.
로지스웹 본체(`src/`) · 허브(`cafe-site/`) · 홈페이지(`landing-site/`)와 **빌드/배포가 완전히 분리된** 별도 Vite + React 앱이다.
같은 Firebase 프로젝트(로그인 계정 · Firestore · Storage)만 함께 쓴다.

- **PnK PROJECT 직원 전용** — 인트라넷 [회원가입]으로 가입한 직원만 들어온다. 로지스웹 계정(users 문서가 있는 계정)은 들어올 수 없다(최고관리자 · 부관리자만 예외, 규칙도 같음).
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
| 사내메일 | `아이디@pnkproject.com` 주소로 구성원끼리 주고받기 · 답장 · 전달 · 중요 · 휴지통 | 모두 |
| 전자결재 | 양식 7종(품의 · 지출 · 구매 · 휴가 · 출장 · 보고 · 계약) · 결재선 · 참조 · 결재란 도장 · 반려 · 회수 · 인쇄 | 모두 |
| 출퇴근 · 근태 | 출근 · 퇴근(한국 시간) · 장소 · 오늘 출근 현황 · 월 기록 · (관리자) 전체 표 · CSV · 기록 고치기 | 모두 |
| 휴가 | 남은 연차 · 신청 내역 · 팀 휴가 일정 · (관리자) 전체 연차 — 승인된 휴가는 일정에 자동 | 모두 |
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

## 로그인 · 사번 · 2차 인증

- 로그인: **사번 + 이메일 + 비밀번호**(셋 다 맞아야) · [사번 · 이메일 저장] · [자동 로그인](끄면 브라우저 닫을 때 로그아웃) · 비밀번호 찾기
  로그인한 뒤 본인 구성원 문서의 사번과 맞춰 본다 — 틀리면 바로 로그아웃. 로그인 전에는 사번 색인을 아무도 못 읽는다.
- 회원가입: 약관(필수: 이용약관 · 개인정보 / 선택: 알림) → 계정 만들기 → 가입 신청 → 대표 · 관리자가 **승인하며 사번 발급**(구성원 › 구성원 관리)
  로지스웹에서 쓰는 이메일은 쓸 수 없다(같은 로그인 서버) — 다른 이메일로 가입. 사번이 없으면 들어올 수 없다(규칙도 같음).
- 사번이 아직 없는 사람: 로그인 화면 [사번이 아직 없나요?] → 이메일 · 비밀번호로 가입 신청 상태만 확인(본 로그인과 따로 확인하고 바로 로그아웃)
- 최고관리자(대표) · 부관리자(관리자센터 부관리자): 사번 자동 발급(대표 PNK-0001) · **비밀번호 다음 8자 이상 2차 비밀번호**(화면 키패드)
  **처음 로그인하는 기기에서만 3차 휴대폰 문자 인증** — 통과하면 그 기기를 기억해 다음부터는 2차 비밀번호만. 로지스웹 본체(src/AdminGate.jsx)와 같은 2차 비밀번호 · 같은 기기 목록
  처음 한 번 정함 · 5번 틀리면 10분 잠금 · 자동 로그인이면 30일, 아니면 12시간마다 다시 확인 · 서버(functions/pnkMfa.js) + 규칙(pnkMfaOk)이 확인
  부관리자 2차 비밀번호 초기화: 최고관리자 › 구성원 관리 › [2차 비밀번호 초기화]. 대표 본인 것은 Firebase 콘솔에서 pnkMfaSecrets/{uid} 삭제
- 입장 로딩 화면(BootScreen.jsx): 로그인 확인 → 구성원 · 사번 확인 → 본사 데이터 연결 → 인트라넷 준비

## 화면 편집(최고관리자 · 부관리자)

왼쪽 아래 **[✎ 화면 편집]** 또는 Ctrl+Shift+E. 화면에서 누르면 고르기 →
글자(이 요소만 / 같은 글자 모두) · 모양(크기 · 굵기 · 색 · 바탕 · 여백 · 모서리 · 정렬) · 위치(✥ 끌기) · 크기(모서리 끌기) · 숨기기 /
메뉴(이름 · 순서 · 숨기기 · 묶음 이름) / 테마(대표 색 · 메뉴 바탕 · 화면 바탕 · 글꼴 · 전체 크기 · 회사 이름 · 직접 CSS) / 기록(최근 20개 되살리기 · 모두 처음으로).
[저장]해야 모두에게 적용(그 전엔 내 화면만). 저장 위치 `pnkUi/live`, 기록 `pnkUiHistory`. 코드: `src/editor/`.

## 배포 (처음 한 번) — 주소 https://www.pnkproject.com

1. **Firebase 규칙 · 서버 기능** — GitHub › Actions › "Firebase 배포" › Run workflow
   - `규칙+색인+저장소만` 먼저(인트라넷이 읽고 쓰려면 필요) → 이어서 직접 입력에
     `functions:pnkMfa,functions:pnkMailAdmin,functions:pnkMailOnCreate,functions:pnkMailInbound`
   - 새 비밀값 없음(MAIL_CRED_KEY 는 회사 메일과 같은 것). 대표 2차 인증은 pnkMfa 가 배포돼야 동작한다.
2. **Vercel 새 프로젝트** — 같은 저장소 · Root Directory `pnk-site` · Framework Vite(빌드 `npm run build`, 출력 `dist`)
   - Settings › Domains 에 `www.pnkproject.com`(+ `pnkproject.com` → www 로 넘기기) 추가
   - 환경 변수(App Check 를 쓰면): `VITE_APPCHECK_SITE_KEY` (본체와 같은 값 · reCAPTCHA 키의 도메인 목록에 pnkproject.com 추가)
3. **가비아 DNS(pnkproject.com)** — Vercel 이 보여 주는 값 그대로
   - `www` CNAME → `cname.vercel-dns.com` (Vercel 화면에 다른 값이 나오면 그 값)
   - `@` A → `76.76.21.21` (Vercel 화면 값)
   - 메일(Mailgun) MX · TXT 는 그대로 두고 함께 쓴다
4. **Firebase 콘솔 › Authentication › 설정 › 승인된 도메인**에 `www.pnkproject.com`, `pnkproject.com` 추가(로그인 · 비밀번호 찾기 메일)
5. `main` 에 합치면 자동 배포(`claude/*` 브랜치는 배포 안 됨). 검색엔진에는 안 뜨게 `noindex`.

## 외부 메일(@pnkproject.com) 연결 — 회사 정보 › 외부 메일 연결(관리자) 화면에 순서 · 링크가 나온다

구성원끼리는 바로 오간다. 네이버 · 구글 등 바깥과 주고받으려면(Mailgun 기준):
1. Mailgun 가입 → Domains › Add new domain 에 `pnkproject.com`(mg. 없이 · US)
2. 가비아 DNS 관리(dns.gabia.com)에 Mailgun 이 보여 주는 TXT 2 · MX 2 · CNAME 1 추가 → Mailgun Verify
3. Mailgun SMTP 비밀번호(postmaster@pnkproject.com) → 인트라넷 화면에 저장 → 테스트 메일(성공하면 외부 보내기 켜짐)
4. 받기: 인트라넷 [받기 주소] 만들기 → Mailgun › Receiving › Create route(Match Recipient `.*@pnkproject.com` → Forward 받기 주소)
5. 구성원 메일 아이디: 구성원 › 구성원 관리에서 정한다(`아이디@pnkproject.com`)

## 화면 모양(2026-11-11 정리)

- 모든 화면: 위쪽 줄(위치 · 날짜 · 메일/결재/공지 바로가기) + `Hero`(제목 · 한 줄 요약 · 버튼) + 흰 `Card` — `src/ui.jsx`
- 영문 작은 글씨(en) · 회색 설명글은 쓰지 않는다. 로그인 화면은 왼쪽 회사 이름 + 오른쪽 입력
