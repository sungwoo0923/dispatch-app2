# 홈페이지 인수인계 (LogisWeb 소개 홈페이지 + 관리자센터 홈페이지 편집기)

> 작성: 2026-11-06 · 이전 담당 AI(Claude Code) → 다음 담당 AI
> 저장소: `sungwoo0923/dispatch-app2` · 이 문서 위치: `docs/HOMEPAGE_HANDOVER.md`

## 0. 먼저 읽을 것 — 사용자(대표·배차팀장)와 일하는 규칙

- 사용자는 운송사 배차팀장이고 **코딩 초보**. 생성형 AI로 프로그램을 만들어 왔다.
- **설명은 반드시 한국어로**, 짧게, 코드·순서 위주. 영어로 진행 상황을 적었다가 지적받은 적이 있다.
- 코드를 바꿀 때는 **어느 파일 어디(찾아갈 수 있는 코드 한 줄)를 무엇으로 바꾸는지** 보여 준다.
- **배차프로그램(`src/`)은 사용자가 요청하지 않으면 건드리지 않는다.** 홈페이지 작업은 `landing-site/`에서만.
- 다른 채팅(다른 Claude 세션)이 같은 저장소의 `main`에 수시로 배차프로그램 작업을 올린다. 배포 전에는 **항상 최신 `origin/main`을 받아 그 위에 홈페이지 변경만 얹어서** 올린다(충돌·덮어쓰기 방지).
- 프로그램 이름이 **KP-Flow → LogisWeb**으로 바뀌었다(다른 채팅에서 변경, `0290c66b`). 새 문구는 LogisWeb 기준.

## 1. 주소 · 배포 구조

| 무엇 | 주소 | Vercel 프로젝트 |
|---|---|---|
| 소개 홈페이지 | https://dispatch-app2-vskk.vercel.app | `dispatch-app2-vskk` (Root Directory `landing-site`, 빌드 없음, 정적) |
| 배차프로그램(웹) | https://dispatch-app2.vercel.app | 배차프로그램 프로젝트(저장소 루트, Vite) |
| 기사앱 APK | https://github.com/sungwoo0923/dispatch-app2/releases/download/driver-apk-latest/LogisWeb-Driver.apk | GitHub Actions `.github/workflows/build-android-apk.yml`가 main push마다 빌드 |

- **`main`에 push하면 자동 배포.** `claude/*` 브랜치는 배포 안 됨(`vercel.json`의 `deploymentEnabled`).
- main에 push하면 저장소 자동화가 곧바로 `chore: version 1.3.xxx` 커밋(`package.json` 버전만)을 뒤에 붙인다.
  - 예전엔 홈페이지 `ignoreCommand`가 "마지막 커밋만" 봐서 이 버전 커밋 때문에 **홈페이지 배포가 건너뛰어진 적이 있다**.
  - 지금은 `landing-site/vercel.json`의 `ignoreCommand`가 `git diff --quiet ${VERCEL_GIT_PREVIOUS_SHA:-HEAD^} HEAD -- . 2>/dev/null || exit 1` — 마지막 배포 이후 바뀐 게 있거나 비교를 못 하면 빌드한다. 바꾸지 말 것.
- 배포 확인은 사용자에게 **Vercel의 `dispatch-app2-vskk` 프로젝트 Deployments**를 보라고 안내(배차프로그램 프로젝트와 헷갈리기 쉬움). 안 되면 `…` → Redeploy.
- 작업 환경(클라우드 컨테이너)에서는 vercel.app 사이트 접속이 막혀 있어 배포 결과를 직접 볼 수 없었다. 로컬로 확인했다(아래 6장).

### 배포 순서(이전 담당이 매번 쓴 방법)

```bash
git fetch origin
git checkout -B deploy-x origin/main
git cherry-pick <홈페이지 커밋>          # landing-site/ 변경만 들어 있는 커밋
git diff --name-only origin/main HEAD    # landing-site/ 밖 파일이 없어야 함
git push origin deploy-x:main
```
- push 결과에 `cannot lock ref ... is at X but expected Y`가 떠도, 바로 뒤에 자동 버전 커밋이 붙은 것일 뿐 **push는 성공**한 경우가 대부분. `git log origin/main`으로 확인.

## 2. 홈페이지 파일 구조 (`landing-site/`)

| 파일 | 역할 |
|---|---|
| `index.html` | 홈페이지 본문 전체. 모든 요소에 `data-k="eN"` 번호(편집기용) |
| `home.css` | index.html 전용 스타일(네이비 관제 톤, 반응형 1080px·720px 기준). 주요 색은 `:root` 변수(`--btn1` `--btn2` `--accent` `--hero2` `--band` `--dark2` `--bg` `--ink` `--muted`) — 편집기 [페이지] 탭에서 바꿈 |
| `kp-site.js` | **편집 엔진.** 방문자 화면에선 게시본을 읽어 적용, `?kpedit=1`이면 편집 모드 |
| `style.css` + `login.html` | 예전 로그인 안내 페이지(옛 디자인 유지) |
| `img/` | 실제 프로그램 캡처(PC `real-*.jpg`, 모바일 `m-*.jpg`), 기사앱 QR `qr-driver-apk.svg` |
| `video/` | 실제 화면 짧은 반복 영상(mp4 + webm + 첫 장면 jpg) — 아래 표 |
| `tools/add-keys.mjs` (`.py` 동일) | `data-k` 번호 붙이기 |
| `brand/`, `icons/`, `naver…html`, `robots.txt`, `sitemap.xml`, `og-image.png` | 로고·아이콘·네이버 소유확인·검색용(다른 채팅에서 추가한 것 포함) |
| `vercel.json` | 배포 규칙(위 1장) |

### 화면 구성(위→아래)
헤더(고정·스크롤 시 진해짐, 모바일 햄버거) → 히어로(브라우저 틀 안 실시간배차현황 캡처 + 기사앱 영상 폰 + 떠있는 칩 2개) → 숫자 띠 → 업무 흐름 6단계 → **실시간 관제**(어두운 섹션: 위치 지도·관제 화면·모바일 관제·포인트 4개) → **배차** 탭 4개(오더 스캔[영상 2개 전환]·실시간배차현황·배차 등록·자사운임표) → **정산·ERP** 탭 4개 + 모듈 카드 8개(홈택스 연동 "준비 중") → **전자결재**(영상 + 결재선 그림 + 양식 4분류 31종) → **모바일·기사앱**(직원용 3개·기사앱 3개 영상, 탭 전환, 모바일에선 가로 스와이프) → 그룹웨어·보안 → 엑셀 vs LogisWeb 비교 → **다운로드**(PC 설치 안내 창 · 기사앱 APK · 직원용 홈 화면 추가 안내 창, 버튼 3개 높이·위치 동일, QR은 카드 아래 흰 띠) → 도입 절차 + FAQ → **무료 체험 신청 폼** → CTA 띠 → 푸터 → 오른쪽 아래 떠있는 버튼(체험신청·다운로드·로그인), 사진 크게 보기(라이트박스).

### 영상 목록 (`landing-site/video/`)
| 파일 | 쓰는 곳 | 내용 |
|---|---|---|
| `scan-text` | 배차 › 오더 스캔 (기본) | 카톡 오더 글 붙여넣기 → 20개 항목 전부 인식 |
| `scan-image` | 같은 자리 [캡처 이미지 붙여넣기] 버튼 | 카톡 캡처 사진 → OCR → 19개 항목 인식 |
| `approval` | 전자결재 | 결재함 → 운임 변경 품의서 열기 → 의견 → 승인 → 도장 |
| `m-menu` `m-list` `m-approval` | 모바일 › 직원용 3개 | 전체 메뉴 / 등록내역 카드 / 모바일 결재 승인 |
| `d-home` `d-order` `d-log` | 모바일 › 기사앱 3개, `d-home`은 히어로 폰에도 | 운행 상태·오늘 운행 현황 / 오늘 오더·길안내·사진 / 운행기록·서류함 |

- `<video class="clip" autoplay muted loop playsinline>` + mp4·webm 두 소스. index.html 안 스크립트(`kpPageInit`)가 화면에 보일 때만 재생, `prefers-reduced-motion`이면 멈춤.
- **주의:** 영상은 KP-Flow 이름일 때 찍은 화면이다. 이름이 LogisWeb으로 바뀌었으니, 사용자가 원하면 다시 찍어야 한다(6장 방법).

### 무료 체험 신청 폼
- 브라우저에서 Firebase(`dispatch-app-9b92f`)의 `landingInquiries` 컬렉션에 바로 저장(공개 키, 보안규칙이 `create: if true`).
- 편집기로 추가한 질문은 `data-extra` 속성 → 저장 시 `extra: { 질문글자: 답 }`로 함께 저장.
- 관리자센터 › 고객사 › 도입 문의에서 확인.
- **테스트로 실제 제출하지 말 것**(진짜 서버에 가짜 문의가 쌓인다).

## 3. 관리자센터 홈페이지 편집기

- 위치: 배차프로그램 최고관리자 로그인 → 관리자센터(`/platform`) → **운영 › 홈페이지** (`src/PlatformCenter.jsx`의 `SECTIONS` 운영 항목 `key: "homepage"`, 본문은 `React.lazy(() => import("./HomepageEditor"))`). 휴대폰에선 "PC에서 해 주세요" 안내만.
- 화면 파일: `src/HomepageEditor.jsx`
  - 가운데: 실제 홈페이지를 `?kpedit=1`로 iframe에 띄움(주소는 [이력] 탭에서 바꿀 수 있음. 기본 `https://dispatch-app2-vskk.vercel.app/`, localhost에선 `http://127.0.0.1:5500/`).
  - 왼쪽 탭 8개: 속성 · 페이지 · 섹션 · 메뉴 · 신청서 · 사진 · 추가 · 이력.
  - 상단: 편집/미리보기, PC·태블릿·모바일, 실행취소/다시실행, 임시저장 상태, 게시 상태, 홈페이지 열기, 전체 화면, **게시하기**.
- 저장(Firestore `siteConfig`):
  - 임시본 `siteConfig/homepageDraft` { data: JSON 문자열, siteUrl } — 바꿀 때마다 1.2초 뒤 자동 저장
  - 게시본 `siteConfig/landing` 문서의 `homepage`(JSON 문자열), `homepageAt`, `homepageBy` — 방문자 화면이 읽음
  - 이력 `siteConfig/homepageHistory` { items: [{at, by, data, note}] } 최근 15개
  - 보안규칙: `siteConfig/landing`은 누구나 get, 쓰기는 최고관리자. 나머지 `siteConfig/*`는 최고관리자만.
  - `src/AdminMenu.jsx`의 옛 「랜딩페이지 편집」(로그인 화면 꾸미기, 같은 `siteConfig/landing` 문서 사용)은 저장할 때 `homepage*` 칸을 빼고 저장하게 고쳐 두었다(덮어쓰기 방지).
- 사진 올리기: Firebase Storage `siteConfig/homepage-*` (가로 2400px로 줄여서). **실제 서버에서 시험 못 함** — 권한 오류가 나면 Storage 규칙 확인 필요(저장소의 `storage.rules`는 이 경로를 막고 있으나 실제 서버 규칙은 다를 수 있음).

### 편집 내용 구조와 엔진(`kp-site.js`)
```
{ v:1,
  page: { title, description, font, vars:{"--accent":"#..."}, css },
  ops:  [ {op:"clone", src, key} | {op:"add", kind, key, ref, pos} | {op:"move", key, ref, pos} ],
  els:  { [data-k]: { html, attrs:{href,src,alt,placeholder,target,required}, options:[..], icon, hidden, style:{..}, styleM:{..} } } }
```
- 적용 순서: 원본 body 복원 → ops(복제·추가·이동) → els(글·속성) → `<style id="kp-site-style">`(스타일, `styleM`은 720px 이하에만) → `window.kpPageInit()`.
- 방문자 화면: localStorage `kpHomepageLive` 캐시로 먼저 그리고, Firestore REST(`.../documents/siteConfig/landing?mask.fieldPaths=homepage`)로 최신본을 받아 다르면 다시 그림. 첫 화면 깜빡임 방지용 `#kp-pre`(최대 0.9초).
- 편집 모드: iframe ↔ 부모 창 `postMessage`(`kp:cmd` / `kp:change` `kp:select` `kp:meta` `kp:ready` `kp:flushed` `kp:upload` …).
  - 누르면 고르기, 두 번 누르면 글 수정(contenteditable), 고른 요소 끌기 = 이동(`translate`), 손잡이 = 크기, 사진 위에 파일 끌어 놓기 = 교체.
  - 단축키: Delete 숨기기 · Ctrl+D 복제 · 방향키 1px(Shift 10px) · Esc 상위 요소 · Ctrl+Z/Y.
  - **게시 직전 `flush` 명령으로 편집 중인 글을 확정한 뒤 게시**(예전에 고치던 글이 빠지고 게시되던 버그를 고친 것).
- 글 저장 시 `sanitize()`로 허용 태그·속성만 남김(video/source 포함). 원본에 `<video>`가 있는데 저장된 html에 없으면(영상으로 바뀌기 전 편집) 덮어쓰지 않음.
- index.html의 페이지 동작(탭·모달·라이트박스·메뉴·폼 제출)은 **document 한 곳에서 클릭을 받는 방식**이라, 편집 내용을 적용해 body를 다시 그려도 동작한다. 새 동작을 넣을 때도 이 방식을 지킬 것.

### ⚠ index.html을 직접 고칠 때 꼭
```bash
node landing-site/tools/add-keys.mjs
```
- 새 요소에만 다음 번호를 붙이고 기존 번호는 그대로 둔다. **기존 `data-k` 번호를 바꾸거나 지우면 사용자가 편집기로 저장한 내용이 엉뚱한 곳에 붙는다.**
- 일부러 예전 편집을 무시하게 하고 싶을 때(예: 다운로드 영역을 새로 짰을 때)는 그 영역의 `data-k`를 지우고 스크립트를 돌려 새 번호를 받게 했다.
- 사용자 PC(Windows)에는 파이썬이 없어서 `.py`는 안 돈다 → `.mjs` 사용.

## 4. 사용자 요청 이력 요약(무엇을 왜 했는지)
1. 홈페이지 전면 개편: 장점이 잘 드러나게, 반응형·고급·디지털, 어색한 문장 제거, **실제 화면 사진**(가상 운송사 데이터), 실시간 관제 필수, PC·앱 다운로드 버튼. → 처음엔 HTML로 그린 가짜 화면을 만들었다가 "실제 화면과 다르다"는 지적을 받고, **실제 프로그램을 테스트 서버로 띄워 캡처**하는 방식으로 바꿨다.
2. 홈택스 연동은 "추후 연동 예정" → ERP 카드·FAQ에 **준비 중**으로 표시(연동되면 그 문구만 바꾸면 됨).
3. 관리자센터 › 운영에 **홈페이지 메뉴**: 모든 문장·메뉴명·상단바·폼·위치·크기·사진을 외주 웹빌더처럼 수정·추가.
4. 게시했는데 쓴 글이 반영 안 됨 → flush 수정.
5. 오더스캔·모바일·전자결재·기사앱을 **짧은 반복 영상**으로(숏츠 느낌, 천천히, 전 항목 인식되게). 다운로드 버튼 높이 맞추기·QR 위치 이동.
6. 기사앱만 스토어 등록 예정(배차프로그램은 웹 유지) — 아직 미착수(5장).

## 5. 남은 일 · 주의할 점
- [ ] **영상·캡처가 옛 이름(KP-Flow)** — LogisWeb으로 다시 찍을지 사용자에게 확인.
- [ ] 편집기 **사진 올리기** 실제 서버 동작 확인(Storage 권한).
- [ ] 기사앱 스토어 등록(구글 플레이 우선, 아이폰은 기사님 중 사용자 있으면): release 서명 키 + AAB 자동 빌드, 개인정보처리방침 페이지(홈페이지에 추가), 백그라운드 위치 권한 신청서·시연 영상, 심사용 테스트 기사 계정. 출시되면 홈페이지 [기사앱 APK 받기] 버튼·QR을 플레이 스토어 주소로 교체. 사용자는 D-U-N-S·구글 조직 계정부터 준비해야 함.
- 홈택스 연동이 되면 index.html ERP 카드 `홈택스 연동 … 준비 중`과 FAQ "세금계산서 발행도 되나요?" 답 수정.
- 사용자가 편집기로 이미 고친 부분이 게시돼 있을 수 있다. index.html을 크게 바꾸기 전에 관리자센터 [이력] 탭의 백업 받기를 권하고, 기존 `data-k`는 유지.

## 6. 실제 화면 캡처·영상 다시 찍는 방법
- 스크립트: `docs/landing-capture/` (사진용. 자세한 순서는 그 폴더 `README.md`)
- 요약:
  1. `firebase emulators:start --only auth,firestore --project demo-kpflow --config firebase.emulators.json`
  2. `VITE_USE_EMULATOR=1 npx vite --port 5173 --host 127.0.0.1` (`src/firebase.js`가 이 값이면 로컬 테스트 서버에 붙음, 실제 서버와 무관)
  3. 가상 데이터: `seed fix1 drivers appr bank moving history drvacct nourg` 순서로 `node <이름>.mjs` (가상 운송사 **한결로지스**, 직원 6명, 기사 12명, 오더 수천 건, 결재 7건)
     - 로그인: 회사코드 `HG2026` · 회사명 `한결로지스` · `kim@hangyeol.demo` / `demo1234!` (팀장) · 기사앱은 운송사 `한결로지스` · 차량번호 `경기82아7712` · 이름 `이민수`
     - 에뮬레이터는 한 번에 1만 건 넘게 조회하면 실패 → `history.mjs` 오더 수를 늘리지 말 것. 에뮬레이터를 껐다 켜면 데이터가 사라지니 다시 넣을 것.
  4. 캡처: `node session.mjs ./s5.mjs` 등 → `python3 tojpg.py 원본.png:이름`
- 영상 녹화 스크립트(`rec.mjs` 장면 scan/approval/mobile/driver, `encode.py` 자르기·mp4/webm 변환, `kakao.html` 가짜 카톡 캡처)는 이전 작업 컴퓨터의 임시 폴더에만 있었다. 필요하면 같은 방식으로 새로 만들 것:
  - Playwright `recordVideo`로 녹화(**모바일은 deviceScaleFactor 1 · 영상 크기 = 화면 크기**로 해야 회색 빈칸이 안 생김), 장면 구간 시각을 기록해 ffmpeg로 자르기.
  - 녹화 중에만: 지도 타일(OpenStreetMap), OCR 파일(tesseract.js worker/core, `@tesseract.js-data/kor`·`eng` npm 패키지), Tmap 주소 확인(`apis.openapi.sk.com/tmap/geo/fullAddrGeo`)을 로컬 응답으로 대신 줘야 "인식 못함/통신 실패" 표시가 안 나온다.
  - 로그인 직후 뜨는 가운데 알림 팝업(결재 요청 등), 기사앱 "내 차량 기본 설정" 마법사는 "닫고 다음"/"나중에"로 닫고 찍는다.
  - 오더 글은 `상차지: / 상차담당: 이름 번호 / 상차방법: / 하차지: / 하차담당: / 하차방법: / 당일 오후 2시까지 도착 / 11톤 윙바디 / 운임 62만원 계산서`처럼 줄마다 나눠야 전 항목 인식된다.
