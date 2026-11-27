# H — 성능 점검 (실측 + 소스 분석) · 2026-11-27

측정 도구: Playwright(Chromium) + CDP(Performance.getMetrics · Profiler · Network) + PerformanceObserver(longtask · event).
PC 측정은 이배차(운송사무원) 계정으로 약 12번 짧게 로그인했다(매번 "기존 로그인 끊고 로그인"). **그 시간 동안 B 에이전트의 이배차 PC 세션이 튕겼을 수 있다.** 모바일 측정은 김운송 · 이배차의 iPhone 화면으로 했다.
CPU 4배 = `Emulation.setCPUThrottlingRate 4`(사무실 저사양 PC 가정). 스크립트 · 원자료: `sim/h*.js`, `sim/hwork/*.json`, 프로파일 `sim/hwork/*.cpuprofile`. 스크린샷: `sim/shots/H/`.
⚠ 테스트운송사는 데이터가 아주 적다(올해 오더 169건 · 오늘 7건). 오더 · 거래처 · 상하차지가 수천 건인 실제 운송사는 아래 수치보다 **더 느리다**(데이터 양에 비례하는 항목은 ★ 표시).

## 1. 실측 결과

### 1-1. 로그인 → 홈(사용 가능)까지
| 조건 | 로그인 확인 → 홈 표시 | Long Task(50ms 넘는 멈춤) | 스크립트 실행 | JS heap |
|---|---|---|---|---|
| PC · CPU 1배 | **7.7 ~ 15.1초** (5회: 9.1 · 15.1 · 7.7 · 13.6 · 8.3) | 19~50개 · 합 1.7~8.2초 · 최장 0.2~0.8초 | 1.8~6.4초 | 42~60MB |
| PC · CPU 4배 | **20.2 ~ 34.2초** (2회) | 90~129개 · 합 11~25초 · **최장 3.5초** | 14~22초 | 60~63MB |
| 모바일 · CPU 1배 | 4.4 ~ 4.7초 | 1~2개 · 합 0.06~0.14초 | 0.8~1.1초 | 29~30MB |
| 모바일 · CPU 4배 | 6.1 ~ 7.1초 | 10~17개 · 합 1.3~1.4초 | 3.7초 | 26~32MB |

- 같은 컴퓨터 · 같은 네트워크에서 **CPU만 4배 느리게 하면 PC 로그인이 2.5~4배 길어진다** → 네트워크가 아니라 CPU(계산) 때문에 느린 구조다.
- 같은 4배 CPU에서 모바일 화면은 7초, PC 프로그램은 20~34초 → **PC 프로그램(DispatchApp) 자체가 3~5배 무겁다.**
- 로그인 화면 자체는 가볍다: 첫 글자 0.19초, 입력칸 2.2초(1배) / 0.3초 · 2.8초(4배).

### 1-2. 내려받는 양(첫 접속 · 캐시 없음)
- **로그인 화면에서 이미** PC 프로그램 전체를 미리 받는다(App.jsx:60-72 미리받기): JS **84개 파일, 전송 2.75MB(br) / 압축 해제 9.0MB**, CSS 65KB / 465KB. 메뉴를 돌면 107개 · 10.9MB.
- 큰 파일: DispatchApp 2.76MB(전송 720KB) · BizSwitcher 693KB · FareRulesSettings 692KB · vendor-firebase 724KB · index 490KB · **xlsx 430KB** · recharts(BarChart) 322KB · OfficeSheetCard 228KB · helpContent 186KB · WorkManual 174KB · BannerCenter 161KB …
- DispatchApp 묶음 안을 sourcemap 으로 나눠 보면: DispatchApp.jsx 1.69MB, **pptxgenjs(PPT 만들기) 269KB**, HomeDashboard 51KB …
- 모바일: JS 56개 · 1.10MB(br) / 4.35MB.
- 파일은 `immutable` 캐시라 두 번째부터는 다시 안 받지만, **이틀(11/26~27) 동안 main 머지 34회** → 배포마다 DispatchApp(한 파일 1.7MB)이 바뀌어 전원이 다시 받고 다시 해석(컴파일)한다.

### 1-3. 메뉴 전환
| 메뉴 | CPU 1배: 클릭→그림 / 조용해질 때까지 | CPU 4배: 클릭→그림 / 조용해질 때까지 |
|---|---|---|
| 실시간배차현황(로그인 직후 첫 전환) | 0.15초 / 0.16초 | **1.9~2.5초 / 1.9~6.0초**(Long Task 최장 1.06초) |
| 배차현황 | 0.11~0.13초 / 0 | 0.41초 / 1.2초 |
| 오더등록 | 0.07~0.09초 / 0.19~0.23초 | 0.21~0.34초 / **1.5~5.2초** |
| 매출관리 | 0.08~0.09초 / 0 | 0.23초 / 1.6초 |
| 기사관리 · 거래처관리 · 지입차관리 | 0.08~0.12초 / 0 | 0.18~0.27초 / 0.5~0.9초 |
| HOME | 0.11~0.14초 / 0.6~0.8초 | 0.16초 / Long Task 1초 |
- 1배에서는 빠르다. 4배에서는 "로그인 직후 1~2분"(뒤에서 지난 오더 · 통계 계산 중)과 오더등록 · HOME이 눈에 띄게 끊긴다.
- 오더등록 입력칸 키 입력 → 화면 반영(4배): **33~186ms, 평균 86ms**(첫 글자 136ms). 100ms 넘으면 "타자가 밀린다"고 느낀다.

### 1-4. 가만히 둘 때(CPU 4배, 30초)
- **HOME 화면: CPU 24~31% 계속 사용**, Long Task 17개(최장 0.3초), 스타일 재계산 267~355회.
- 실시간배차현황 화면: CPU 5.7%, Long Task 0개.
- → 하루 종일 HOME을 띄워 두면 저사양 PC에서 다른 창(엑셀 · 카톡)까지 느려진다.

### 1-5. Firestore · 타이머 · 메모리
- PC 로그인 직후 실시간 구독(addTarget) **102~111개**, 해제 25~36 → 동시에 약 **70~80개** 열려 있다. 모바일 80개 / 약 59개.
  - 오더(orders · dispatch)는 컬렉션마다 **9개 구독이 겹친다**: 상차일 범위 4 · updatedAt 2(문자/시각 두 형식) · createdAt 2 · _lastModified 1 · 배차상태 1 (orderHistory.js:51-71, DispatchApp.jsx:4815 · 5209 · 5224 · 23682).
  - 회사 전체를 받는 구독: clients · drivers · places · fixedClients · schedules · notices · handovers · users · routeBoards · multiRateSheets(★ 데이터 많은 회사일수록 첫 로딩 · 메모리 · IndexedDB 저장 비용 증가).
- setInterval 로그인 후 28~31개(대부분 15초~10분 주기, 1초짜리는 시계 2~3개) — 과하지 않다.
- JS heap 40~80MB 사이를 오가며 GC로 돌아온다. 짧은 시험에서 누수는 안 보였다. DOM 노드 1.6천~1.2만.
- 콘솔 경고 · 오류: PC 0건. 모바일 "[FCM] 알림 권한이 허용되지 않았습니다", reCAPTCHA preload 미사용 경고.

### 1-6. CPU 프로파일(무엇이 시간을 쓰나)
- **로그인~홈(1배, 바쁜 시간 약 16초)**: Firebase SDK 2.7초(그중 IndexedDB put · transaction · openCursor 약 1초) · **차트(recharts) 3.1초**(SVG `getTotalLength` 0.94초 = 선 그리기 애니메이션) · React 1.8초 · 파싱/컴파일/스타일 등 (program) 3.9초 · GC 1.2초 · DispatchApp 코드 0.5초.
- **HOME 가만히 30초(4배)**: (program) 4.5초 · `uiConfig.js` 화면편집 엔진 **약 1.6초**(runJs → resolveTarget → origTextOf TreeWalker) · React 재렌더 1.4초 · recharts 1.1초 · FloatDock elementsFromPoint 0.2초.

### 1-7. 이 컨테이너 환경 때문에 생긴 것(실제 사용자와 다름 — 성능 판단에서 뺐다)
- 막힌 호스트: cdn.jsdelivr.net(Pretendard 글꼴 5개), apis.openapi.sk.com(Tmap 지도 SDK — main.jsx:46 `preloadTmapWhenIdle`이 로그인 화면에서 미리 받음), www.google.com/recaptcha. 모두 **즉시 실패(ERR_TUNNEL)** 라 기다리는 시간은 생기지 않았다. 실제 사무실에서는 이 파일들이 정상으로 받아지므로 글꼴 · Tmap SDK(수백 KB) 다운로드/해석이 **추가로** 생긴다(특히 Tmap은 로그인 직후 바쁜 시간에 겹칠 수 있음).
- us-central1-dispatch-app-9b92f.cloudfunctions.net(pnkMfa · securityPing · driverLinkSig): 처음엔 막혀 즉시 실패, **오케스트레이터가 허용한 뒤 다시 쟀다**(PC 1배 · 4배, 모바일 1배 · 4배). 호출 6~8건이 모두 성공했고 로그인 시간은 PC 1배 8.3초 · 4배 20.2초 · 모바일 4.4초 · 7.1초로 **허용 전과 같은 범위**였다 → 이 호스트는 화면이 기다리지 않는다(백그라운드 호출). 앞의 수치에 타임아웃 대기는 섞여 있지 않다.
- 이 컨테이너 → Vercel 은 미국 경유(cle1)라 HTML 응답 0.1~0.3초. 한국 사무실은 더 빠르다. 결론은 바뀌지 않는다(병목은 CPU).

## 2. 소스 분석 — 원인 후보 (파일:줄, 영향도)

### [개선아이디어] 시작 묶음에 당장 안 쓰는 큰 기능이 정적 import 로 들어 있다
- 분류: 개선아이디어 · 중요도: **높음**
- 근거: DispatchApp.jsx 236줄의 import 중 lazy 는 18개. 시작할 때 같이 받고 해석하는 것:
  - `pptReportUtil`(→ pptxgenjs 269KB) DispatchApp.jsx:181 — 월간보고 PPT 만들 때만 필요
  - `xlsx` 430KB DispatchApp.jsx:50 (같은 파일 41598 · 41656 · 42014는 이미 `await import("xlsx")`), `jszip` 97KB :77, FleetManagement · FixedClients · RateCard · FleetPayDocs · VehicleLedger 도 정적 import
  - `recharts` :49 (BarChart 묶음 322KB + Line/ComposedChart)
  - 도움말/매뉴얼 `WorkManual` :116(+helpContent 186KB · WorkManual 174KB), `AiAssistant` :152, `InternalMessenger` :153, `DailyReport` :16, `OfficeBooks` :123, `FundsBoard` :124, `AcctSuite` :125, `HrHub` :126, `ExecSuite` :97, `FleetPayDocs` :144, `HomeDashboard` :145, `PopbillAuto` :79 …
  - 이 결과 FareRulesSettings 묶음(Approval · ExecSuite · RouteBoard · FixedRouteStatus · DeptDashboard · FundsBoard, 692KB)과 BizSwitcher 묶음(FixedRoutes · SettleDesk · forklift · CallPay, 693KB)도 시작 때 통째로 받는다.
- 예상 효과: 시작 때 해석할 JS 9.0MB → 약 5MB. 저사양 PC 로그인 20~34초 → 약 12~20초, 배포 후 첫 접속 다운로드도 비례해 감소.

### [개선아이디어] HOME 차트 애니메이션이 로그인 중 CPU를 가장 많이 쓴다
- 분류: 개선아이디어 · 중요도: **높음** (고치기 쉬움)
- 근거: HomeDeck.jsx:412-418(Bar · Area · Line, Line은 `animationDuration={800}`), :551-552(Bar), :564(Pie) — `isAnimationActive={false}` 없음(같은 파일 :94 스파크라인만 꺼 둠). 오더가 캐시 → 서버 → 지난 기간 순서로 여러 번 들어오며 데이터가 바뀔 때마다 애니메이션이 다시 돈다. 프로파일: 로그인 중 recharts 3.1초(전체 바쁜 시간의 약 20%), 가만히 있는 HOME에서도 1.1초/30초.
- 예상 효과: 로그인 CPU 15~20% 감소, HOME 대기 CPU 감소. 난이도 하 · 위험 하.

### [개선아이디어] 화면편집 엔진(uiConfig)이 화면의 글자 하나만 바뀌어도 전체를 다시 훑는다
- 분류: 개선아이디어 · 중요도: **높음**
- 근거: uiConfig.js:712-714 `MutationObserver(document.body, {childList, subtree, characterData})` → 80ms마다 최대 1번 `runJs()`(:626) → `resolveTarget`(:331)이 `querySelectorAll` 후 글자 규칙마다 `origTextOf`(:324, TreeWalker로 하위 글자 전부)를 돈다. 시계(HomeDeck.jsx:48 매초 · KpPageClock 15초) 같은 글자 변화(characterData)도 깨운다. 편집 규칙(`jsRules`)이 하나라도 있으면 켜진다(:538).
- 측정: HOME 대기 30초 중 약 1.6초(4배) = 약 5% CPU 상시. 표 · 목록이 많이 바뀌는 화면(실시간배차현황 · 오더 대량 반영)에서는 더 커진다.
- 같은 방식의 body 전체 감시가 8곳 더 있다: textOverrides.js:411-418, ColumnStyle.jsx:215, ColumnLayout.jsx:279, stickyTableHead.js:135, saveFeedback.js:68, fleetDarkGuard.js:111, ScreenFit.jsx:94, DispatchApp.jsx:24231.
- 기대: 시계 · 숫자 영역 제외(characterData 감시 끄기 또는 `[data-kp-tx-ui]` 표식), 글자 기준 규칙은 처음 한 번 찾아 `data-kp-u` 표식만 유지, 대기 시간 80ms → 300~500ms + `requestIdleCallback`. 감시 하나로 모아 여러 기능이 같이 쓰기.

### [불편] HOME을 띄워 두면 저사양 PC에서 CPU를 계속 쓴다
- 분류: 불편 · 중요도: 보통
- 근거: 4배에서 대기 CPU 24~31%(실시간배차현황은 5.7%). 무한 CSS 애니메이션 `hdScan` · `hdPulse` · `hdColon` · `kpNewPulse`(document.getAnimations 5개), 1초 시계, 위 uiConfig 감시, FloatDock.jsx:20-37(버튼 3개가 2초마다 `elementsFromPoint` + `getComputedStyle`), BlankScreenGuard.jsx:16 `elementFromPoint` 점검.
- 기대: 화면 설정에 "가벼운 화면(애니메이션 끄기)" 스위치 + `prefers-reduced-motion` 따르기. 창이 안 보일 때(`document.hidden`) 애니메이션 · 시계 멈춤.

### [개선아이디어] 오더 실시간 구독이 컬렉션마다 9겹 + 회사 전체 목록 구독 ★
- 분류: 개선아이디어 · 중요도: 보통(데이터 많은 회사는 높음)
- 근거: 1-5 참고. orderHistory.js:62-71 은 updatedAt/createdAt 을 "문자 시각"과 "서버 시각" 두 형식으로 각각 구독(쓰는 쪽 형식이 섞여 있어서). 회사 전체 places 구독 FixedRoutes.jsx:937-939 · RouteBoard.jsx:694 · mobile/MobileApp.jsx:3911, drivers · clients DispatchApp.jsx:5130 · 5147. 첫 스냅샷이 크면 Firestore SDK가 IndexedDB 에 쓰는 비용(프로파일 put/transaction 약 1초)이 같이 커진다.
- 기대: 저장할 때 `updatedAt`(서버 시각) 하나를 항상 적게 해 구독을 컬렉션당 2~3개로, 상하차지는 검색할 때만 조회(또는 이름 · 주소만 담은 요약 문서 1개).

### [개선아이디어] 오더 한 건만 바뀌어도 전체 배열을 새로 만들어 화면 전체가 다시 계산된다 ★
- 분류: 개선아이디어 · 중요도: 보통(데이터 많은 회사는 높음)
- 근거: DispatchApp.jsx:4851 `setDispatchData([...ordersCacheRef.current, ...dispatchCacheRef.current])` — 매 변경마다 새 배열 → 이것을 받는 화면 전부 재계산. `React.memo` 사용 2곳뿐. RealtimeStatus(25071~, 7,857줄) useMemo 18 · `.filter(` 95 · `.sort(` 21, ClientSettlement(46649~, 5,007줄) useMemo 36 · `.filter(` 107. 화면들이 한 파일 · 한 컴포넌트 안에 커서 쪼개 memo 하기 어렵다.
- 측정: 오더등록 키 입력 지연 평균 86ms(4배, 오더 7건). 오더가 수천 건이면 더 커진다.
- 기대: 무거운 화면을 `React.memo` + 오더 목록에 버전 번호(바뀐 건만 다시 계산), 검색어 · 필터 입력에 `useDeferredValue`, 큰 목록 정렬 · 필터 `useMemo`.

### [개선아이디어] 너무 잦은 배포 + 1.7MB 한 파일 = 배포마다 전원 재다운로드 · 재컴파일
- 분류: 개선아이디어 · 중요도: 보통
- 근거: 11/26~27 main 머지 34회. 업데이트 배포 잠금(publicRelease/current)이 있으니 사용자 쪽 배포는 하루 1~2번으로 묶는 운영이 가능하다. DispatchApp.jsx(5.9만 줄)는 어디 한 줄만 고쳐도 묶음 전체 해시가 바뀐다.
- 기대: 고객 배포는 하루 1번(점심 · 퇴근 후) 정도로. 메뉴별 파일 분리(정산 · 매출 · 거래처관리 · 기사관리 → 각각 lazy).

### [오류?] PC 미리받기 목록이 비어 있다
- 분류: 오류(경미) · 중요도: 낮음
- 근거: 배포된 index.html 의 kp-boot-preload 스크립트에서 모바일 목록은 43개인데 **PC 목록(D)은 `[]`** (vite.config.js `files(/\/src\/DispatchApp\.jsx$/)`가 묶음을 못 찾음). 로그인해 둔 PC가 /app 으로 바로 들어올 때 미리받기가 안 되고 index.js 실행 뒤에야 받기 시작한다(App.jsx:70 import() 가 대신 받긴 함, 손해 약 0.3~0.5초).

### [개선아이디어] 배포 잠금 상태일 때 첫 화면이 동기 XHR 로 멈추고, 옛 버전 파일이 CDN 대신 서버 함수로 나간다
- 분류: 개선아이디어 · 중요도: 낮음(지금은 잠금 버전 = 최신이라 꺼진 상태)
- 근거: vite.config.js 의 index.html 시작 스크립트 `x.open("GET","/api/shell?...",false)` (동기 요청, 측정 0.28~0.98초 동안 화면 멈춤). vercel.json:99 `/assets/(.*)` → `/api/shell?asset=` (없는 옛 파일을 함수가 대신 받아 줌). 관리자가 최신보다 옛 버전을 잠가 두면 일반 사용자는 매 접속마다 이 길을 탄다.
- 기대: 비동기 + 캐시, 옛 빌드 자산은 함수 대신 배포 주소로 직접 연결.

### [확인됨(정상)] 이미 잘 돼 있는 것
- 실시간 오더 구독 범위는 최근 7일(orderHistory.js:10 `pcLiveWindowStart`), 지난 오더는 IndexedDB 캐시 + 변경분만(DispatchApp.jsx:4486-4519).
- 회사 조건을 서버 조회에 붙임(fsTenant.js INJECT/SCOPED) — "다른 회사 것까지 통째로" 받는 구독은 없다.
- 시계 · 타이머를 작은 컴포넌트로 분리(OrderPanelClock · KpPageClock · HomeDeck Clock), 숨은 탭에서 FloatDock 점검 멈춤.
- persistentLocalCache + persistentSingleTabManager, 캐시 색인 자동 생성(firebase.js:132-145).
- 배차현황 100개씩 페이지 나눔. 단, 실시간배차현황 · 정산 화면은 페이지/가상화 없음(react-window 등 가상화 0곳).

## 3. 결론 — 컴퓨터 탓인가, 프로그램 탓인가
**주로 프로그램 쪽이고, 저사양 PC가 그것을 크게 키운다.**
1. 같은 조건에서 CPU만 4배 느리게 하면 PC 로그인 8~15초 → 20~34초, 최장 멈춤 0.8초 → 3.5초. 네트워크가 아니라 계산(해석 · 렌더 · 차트 · 저장)이 병목이다.
2. 같은 저사양 CPU에서 모바일 화면은 7초 · 멈춤 합 1.4초인데 PC 프로그램은 20~34초 · 멈춤 합 11~25초 → PC 프로그램이 3~5배 무겁다(시작 때 JS 9MB 해석, 실시간 구독 70~80개, 차트 애니메이션, 화면 전체 감시).
3. 사양 좋은 PC(CPU 1배)에서는 메뉴 전환 0.1초 안팎으로 빠르다. 그래서 "어떤 PC는 괜찮고 어떤 PC는 느리다"는 체감이 나온다. 오더가 많은 회사일수록(★) 더 느려진다.

## 4. 개선안 (효과 큰 순서)
| # | 개선안 | 예상 효과 | 난이도 | 위험 |
|---|---|---|---|---|
| 1 | HOME 차트 애니메이션 끄기(HomeDeck.jsx:412-418 · 551-552 · 564 `isAnimationActive={false}`), 데이터가 같으면 다시 그리지 않기 | 로그인 CPU -15~20%, HOME 대기 CPU 감소 | 하 | 하 |
| 2 | 시작 묶음 다이어트: pptxgenjs · xlsx · jszip · recharts · 도움말/매뉴얼 · 메신저 · AI · 결재/임원/회계/인사 화면을 `React.lazy`/`await import()`로 | 시작 JS 9MB → 약 5MB, 저사양 로그인 -30~40%, 배포 후 재다운로드 감소 | 중(기계적) | 중(Suspense 자리 표시, 첫 클릭 0.2~0.5초 대기) |
| 3 | uiConfig 화면편집 감시 가볍게(characterData 끄기 · 시계 제외 · 대기 300~500ms · idle 실행 · 찾은 요소 표식 재사용) + body 전체 감시 9곳 통합 | 모든 화면 상시 CPU -5% 이상, 큰 목록 갱신 때 멈춤 감소 | 중 | 중(편집 규칙 적용 늦어짐 확인 필요) |
| 4 | "가벼운 화면" 모드: 무한 애니메이션 · 1초 시계 · 떠 있는 버튼 점검 끄기, `prefers-reduced-motion`, 창 숨김 시 정지 | 저사양 HOME 대기 CPU 25~30% → 5% 안팎 | 하 | 하 |
| 5 | 오더 구독 정리: 저장 시 `updatedAt` 서버 시각 하나로 통일 → 컬렉션당 9 → 2~3개, 상하차지 전체 구독 → 검색 시 조회 | 첫 로딩 · 메모리 · IndexedDB 쓰기 감소(★ 대형 회사 효과 큼), Firestore 읽기 비용도 감소 | 중 | 중(변경 감지 누락 없게 이행 기간 필요) |
| 6 | 무거운 화면 memo 화 + 바뀐 오더만 다시 계산, 입력칸 `useDeferredValue`, 큰 목록 가상화/페이지 | 오더등록 · 실시간배차현황 타이핑 · 스크롤 끊김 감소(★) | 상 | 중 |
| 7 | DispatchApp.jsx(5.9만 줄)를 메뉴별 파일로 쪼개 lazy | 배포마다 전체 재다운로드 · 재컴파일 없앰, 2번 효과 극대화 | 상 | 중 |
| 8 | 고객 배포 묶기(업데이트 배포 잠금으로 하루 1~2번) | 사용자의 "업데이트 중" · 첫 접속 느림 횟수 감소 | 하(운영) | 하 |
| 9 | Tmap SDK 미리받기(main.jsx:46)를 로그인 직후 바쁜 시간 뒤로 미루기(홈 준비 + 10초 뒤, 또는 지도 화면 진입 시) | 로그인 직후 다운로드 · 해석 경쟁 감소 | 하 | 하 |
| 10 | PC 미리받기 목록 비는 문제(vite.config.js kp-boot-preload) 고치기 · 배포 잠금 동기 XHR 비동기화 | 재접속 0.3~1초 | 하 | 하 |

## 5. 사용자가 지금 바로 해 볼 것(프로그램 수정 없이)
1. **HOME을 띄워 두지 말고 배차현황 · 실시간배차현황을 기본 화면으로** — HOME은 가만히 있어도 저사양 PC CPU를 25~30% 쓴다(실시간배차현황은 6%).
2. **LogisWeb 창(탭)은 하나만** — 탭마다 실시간 구독 70~80개 · 메모리 50~80MB가 따로 돈다.
3. **새로고침(F5)을 자주 하지 않기** — 매번 로그인 부팅(저사양 20~30초)을 다시 한다. 화면이 이상할 때만.
4. **캐시 · 쿠키를 정기적으로 지우지 않기** — PC에 저장된 오더(IndexedDB)가 다음 접속을 빠르게 한다. 지우면 다음 접속이 "처음 저장"부터 다시 한다.
5. 크롬/엣지 최신 버전, 설정 › 시스템 › **"가능한 경우 그래픽 가속 사용" 켜기**.
6. 크롬 설정 › 성능 › **메모리 절약 모드 예외에 app.logisweb.co.kr 추가**(탭이 잠들었다 깨며 전체 다시 불러오는 것 방지).
7. 광고 차단 · 번역 · 화면 캡처 같은 확장 프로그램은 이 사이트에서 끄기(화면 변화마다 같이 돈다).
8. 브라우저 확대는 100%로 두고 크기는 앱의 "화면 설정"으로 — 확대 배율이 크면 그릴 면적이 늘어난다. Windows 디스플레이 배율 125~150%도 저사양에선 부담.
9. Windows 전원 옵션 "균형/고성능"(노트북은 전원 연결), 메모리 8GB 이상 권장 — 4GB PC + 엑셀 · 카톡 동시 사용이면 확실히 느리다.

## 요약
1. **원인은 주로 프로그램 무게이고 저사양 PC가 키운다**: CPU 4배 느리게 하면 PC 로그인 8~15초 → 20~34초(멈춤 최장 3.5초). 같은 조건 모바일은 7초.
2. **시작할 때 JS 84개 · 9MB(전송 2.75MB)를 로그인 화면에서부터 해석** — PPT(269KB) · 엑셀(430KB) · 차트 · 도움말 · 결재/회계/인사 화면까지 정적 import.
3. **HOME 차트 애니메이션이 로그인 CPU의 약 20%**(recharts 3.1초/16초), HOME은 가만히 있어도 저사양 CPU 25~30%.
4. **화면편집 엔진(uiConfig)이 body 전체를 감시**해 시계 글자 하나에도 화면을 다시 훑는다(상시 약 5% CPU) — 비슷한 전체 감시가 8곳 더.
5. **실시간 구독 70~80개**(오더 컬렉션마다 9겹, 회사 전체 상하차지 · 거래처 · 기사) — 데이터 많은 회사일수록 첫 로딩 · 메모리 증가.
- cloudfunctions 허용 후 다시 쟀지만 결과는 같다(백그라운드 호출이라 화면이 기다리지 않음). 막힌 jsdelivr · Tmap · reCAPTCHA는 즉시 실패해 지연을 만들지 않았다.
- 실무자 한 줄: "좋은 PC에선 메뉴가 바로 바뀌는데, 사무실 구형 PC에선 로그인 30초에 HOME 띄워 두면 엑셀까지 버벅인다 — 컴퓨터만 바꿔서 해결될 문제는 아니다."
