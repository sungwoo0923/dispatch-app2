# 홈페이지 화면 캡처 (가상 운송사 데이터)

`landing-site/img/`의 화면 사진은 **실제 배차 프로그램**을 이 컴퓨터 안의 테스트 서버(Firebase 에뮬레이터)에 연결하고,
가상 운송사 **한결로지스**의 가상 데이터를 넣어서 찍은 것입니다. 실제 서버·실제 데이터는 전혀 건드리지 않습니다.

## 다시 찍는 순서

```bash
# 1) 테스트 서버(에뮬레이터) 켜기 — 저장소 루트에서
firebase emulators:start --only auth,firestore --project demo-kpflow --config firebase.emulators.json

# 2) 프로그램을 테스트 서버 모드로 켜기 (다른 터미널)
VITE_USE_EMULATOR=1 npx vite --port 5173 --host 127.0.0.1

# 3) 가상 데이터 넣기 (docs/landing-capture 에서, 순서대로)
for s in seed fix1 drivers appr bank moving history drvacct nourg; do node $s.mjs; done

# 4) 캡처 (PC: s2 s5 s6 s7 · 직원 모바일: m3 m5 m6 · 기사앱: d1)
node session.mjs ./s5.mjs

# 5) 홈페이지용 jpg로 변환 — "원본.png:이름" 형식
python3 tojpg.py c-board.png:real-board
```

- 로그인: 회사코드 `HG2026` · 회사명 `한결로지스` · `kim@hangyeol.demo` / `demo1234!`
- 기사앱 로그인: 운송사 `한결로지스` · 차량번호 `경기82아7712` · 이름 `이민수`
- 지도 타일(OpenStreetMap)이 막힌 환경에서는 `tiles.mjs`가 `geo/`의 통계청(KOSTAT 2013, 자유 이용) 행정경계로 타일을 그려 넣습니다.
- 에뮬레이터는 한 번에 1만 건 넘게 조회하면 실패하므로 `history.mjs`의 오더 수를 너무 늘리지 마세요.
