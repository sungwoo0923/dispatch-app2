# dispatch-app2 (LogisWeb) — 작업 규칙

## 업무 매뉴얼 · 도움말 센터 최신 유지 (2026-11-14 사용자 요청, 항상 지킬 것)
정산관리 · 회계관리 · 자금관리 · 비품관리 화면에 기능을 새로 넣거나 바꾸면(탭 · 버튼 · 순서 · 연결되는 화면),
**같은 커밋에서** 아래를 함께 고친다.

1. `src/workManuals.js` — 해당 메뉴 `sections`(what · steps · buttons · links · tip), `changes`(맨 위에 날짜와 한 줄), `updated` 날짜
2. `src/helpContent.js` — 도움말 센터의 같은 메뉴 설명(`HELP_DETAIL[메뉴]`)
3. 예시 화면이 달라졌으면 `src/HelpDemos.jsx` 의 해당 demo(settleHome · settleBoard · payout · deposit · forklift · acctOverview · acctBook · payroll · funds · cashbook · assets)
4. 새 회계 용어가 화면에 나오면 `src/acctGlossary.js` 에 추가
5. `node scripts/workManuals.test.mjs` 통과 확인(실제 탭 이름이 매뉴얼 · 도움말에 다 있는지 검사)

글 말투는 토스처럼: 짧게, "~해요 / ~하면 돼요", 어려운 말은 풀어서, "무엇을 누르면 → 무슨 일이 생기는지" 순서로.
다른 메뉴도 화면을 바꾸면 `src/helpContent.js` 도움말 센터 설명을 같이 고친다.

## 사용법 이미지 보관 (2026-11-25 사용자 요청, 항상 지킬 것)
업체에 보내려고 사용법 이미지(무엇을 누르면 되는지 알려 주는 그림)를 만들면, 보내 주는 것으로 끝내지 말고 **같은 커밋에서** 보관함에 넣는다.

1. 이미지 → `public/howto/<영문-아이디>.png` (가로 2600px 안팎, 기존 사용법과 같은 모양)
2. 작은 그림 → `public/howto/thumb/<영문-아이디>.jpg` (이미지 위쪽을 640×400 으로 자른 것)
3. `src/guideLibrary.js` 의 `GUIDES` 맨 위에 한 줄(분류 `cat` · 기기 `device` · 날짜 · 제목 · 설명 · 태그 · 업체에 같이 보낼 글 `message`)
4. `node scripts/guideLibrary.test.mjs` 통과 확인(이미지 · 작은 그림이 다 있는지, 목록에 없는 이미지가 없는지 검사)

보는 곳: 관리자센터 › 운영 › 사용법 보관함(`src/adminCenter/GuideLibrary.jsx`). 새 분류가 필요하면 `GUIDE_CATS` 에 추가한다.

## 교육 영상 '바뀐 점' 최신 유지 (2026-11-25 사용자 요청, 항상 지킬 것)
교육 영상(`public/videos/epXX.mp4`)은 찍은 날 화면 그대로다. 영상에 나오는 화면 · 버튼 · 순서를 바꾸면 **같은 커밋에서**

1. `src/helpVideos.js` 의 `VIDEO_SINCE[epXX]` 맨 위에 `{ d: 날짜, t: "무엇이 어떻게 달라졌는지 한 줄" }` 추가(어느 편인지는 각 편 `menus` 로 찾는다)
2. 영상을 새로 만들었으면 그 편 `recorded` 를 새 날짜로 하고 그 편 `VIDEO_SINCE` 목록을 비운다
3. 영상 메뉴에 새 메뉴를 넣으면 `src/helpContent.js` 의 `HELP_DETAIL` 에도 그 메뉴 설명을 만든다
4. `node scripts/helpVideos.test.mjs` 통과 확인(날짜 · 순서 · 길이 · 영상 메뉴에 도움말이 있는지 검사)

보는 곳: 도움말 센터 › 영상으로 배우기 — 카드에 노란 [바뀐 점 N], 재생 화면 아래에 날짜별 목록.
