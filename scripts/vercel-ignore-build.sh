#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# KP-Planner(VITE_PLANNER_SITE=1) 전용 Vercel 프로젝트가, 이번 커밋이
# Planner와 무관한 파일만 건드렸을 때는 빌드/재배포를 건너뛰게 한다.
#
# 예전엔 이 스크립트가 없어서 이 repo에 push가 있으면(예: 배차프로그램/Flow
# 쪽 모바일 코드만 수정) KP-Planner 프로젝트도 항상 같이 재빌드됐고, 빌드마다
# sw.js의 VERSION을 실제 코드 변경 여부와 무관하게 그 순간 타임스탬프로 새로
# 찍기 때문에(vite.config.js의 update-sw-version 플러그인) Planner 사용자에게도
# "새 버전이 준비되었습니다" 배너가 함께 떴다 — Flow와 Planner는 서로 다른
# 제품인데 배포/업데이트 알림이 같이 묶여 보이던 원인.
#
# Vercel은 이 스크립트가 exit 0이면 빌드를 건너뛰고(SKIP), exit 1(또는 그 외
# 0이 아닌 코드)이면 그대로 빌드를 진행한다.
#
# 배차프로그램(Flow) 프로젝트들(VITE_PLANNER_SITE가 없거나 "1"이 아님)은 지금과
# 동일하게 매 push마다 항상 빌드한다 — 여긴 건드리지 않는다.
set -e

if [ "$VITE_PLANNER_SITE" != "1" ]; then
  exit 1
fi

# 히스토리가 얕게 clone돼 이전 커밋을 못 찾으면(최초 배포 등) 안전하게 그냥 빌드한다.
if ! git rev-parse HEAD^ >/dev/null 2>&1; then
  exit 1
fi

# Planner 화면 자체(src/planner/**)뿐 아니라, Planner도 함께 쓰는 공용
# 파일(App.jsx/main.jsx/firebase 초기화/빌드 설정/의존성/index.html 등)이
# 바뀐 경우에도 안전하게 다시 빌드한다.
git diff --quiet HEAD^ HEAD -- \
  src/planner \
  public/manifest-planner.json \
  public/icons \
  src/App.jsx \
  src/main.jsx \
  src/firebase.js \
  src/firebase \
  vite.config.js \
  package.json \
  package-lock.json \
  index.html
