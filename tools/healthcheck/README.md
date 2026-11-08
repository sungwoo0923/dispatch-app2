# 매일 점검 (healthcheck)

매일 새벽 05:13(한국 시간)에 GitHub Actions가 자동으로 LogisWeb을 점검합니다.

## 무엇을 보나

- **본 프로그램** 미리보기 데모(`/preview?co=테스트운송&plan=pro&demo=1`)를 역할 14개(admin · exec · test · hrManager · hrAcct · allMgr · acctStaff · hrStaff · legalMgr · legalStaff · devMgr · devStaff · user · viewer)로 PC(1440)와 모바일(iPhone 13)에서 열어 모든 메뉴 · 하위 메뉴 · 탭을 눌러 봅니다. 자동으로 뜨는 팝업은 닫습니다.
- **주요 창**: 관리자 PC에서 오더복사 · 오더스캔 · 세부검색 · 기사 등록 같은 대화상자를 열어 봅니다.
- **허브**(cafe-site) 공개 화면(로그인 · 가입 · 교환소)과 **홈페이지**(landing-site)를 1440 / 390 폭으로 엽니다.
- 잡는 문제: 화면 오류(pageerror) · React 오류/경고 · 콘솔 오류 · 실패한 요청 · 가로 넘침 · 15초 넘게 "불러오는 중" · 오류 화면("문제가 발생했…").
- **단위 테스트**(`unit.sh`): 인터넷 · 에뮬레이터 없이 도는 테스트 12개(업무 규칙 · 급여 계산 · AI 도우미 · 오더 스캔 · 구글시트 · 공공데이터 · 허브 등).

## 결과 보기

GitHub › **Actions** › **매일 점검** › 실행 하나를 누르면

- 화면 아래 요약(Summary)에 문제 목록이 나옵니다.
- **Artifacts › healthcheck-results**를 받으면 `summary.md`(요약) · `report.json`(전체) · `shots/`(문제 화면 캡처) · `unit/`(테스트 기록)이 들어 있습니다.
- 실패하면 GitHub가 저장소 주인에게 메일을 보냅니다. **Run workflow** 버튼으로 언제든 직접 돌릴 수 있습니다(역할을 골라 일부만도 가능).

## 내 컴퓨터에서 돌리기

```bash
npx vite --port 5236 --strictPort --host 127.0.0.1 &                       # 본 프로그램
(cd cafe-site && npx vite --port 5237 --strictPort --host 127.0.0.1 &)     # 허브
python3 -m http.server 5238 --bind 127.0.0.1 -d landing-site &             # 홈페이지
bash tools/healthcheck/unit.sh
node tools/healthcheck/run.cjs --app http://127.0.0.1:5236 --hub http://127.0.0.1:5237 --home http://127.0.0.1:5238
#   --roles admin,viewer   일부 역할만   --only app-pc,app-m,dialogs,hub,home   일부 구역만
#   HC_OFFLINE=1           외부 인터넷이 막힌 곳(allowlist.json의 offline 항목 적용)
```

결과는 `healthcheck-results/`에 생깁니다. 끝나면 서버는 `kill $(lsof -ti:5236)` 처럼 포트로 끕니다.

## 오탐이 나면

진짜 오류가 아닌 것(막힌 외부 주소 · 무해한 경고)만 `allowlist.json`에 정규식과 이유(note)를 적어 넣습니다. 진짜 오류는 넣지 말고 고칩니다.
