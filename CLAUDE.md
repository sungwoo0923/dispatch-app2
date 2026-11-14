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
