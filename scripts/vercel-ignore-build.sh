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
# 동일하게 매 push마다 항상 빌드한다 — 여긴 건드리지 않는다(대신 dispatch-app2
# 프로젝트 쪽 Vercel 대시보드에 scripts/vercel-ignore-dispatch.sh를 "Ignored
# Build Step"으로 별도 등록해야 그쪽도 같은 방식으로 스킵된다 — 그 파일 상단
# 주석 참고. Claude가 Vercel 대시보드에 직접 접근할 수 없어서 이 등록은 여전히
# 사용자가 수동으로 해야 한다).
#
# ⭐ 2026-08-26 버그 수정: 이전 버전은 git push마다 자동으로 붙는 "chore:
# version x.y.z" 커밋(package.json 1줄만 바꾸는 커밋, .husky/pre-push 참고)
# 하나만 HEAD^ vs HEAD로 비교했다. 그런데 그 버전 커밋은 항상 package.json만
# 바꾸고, package.json이 감시 대상 경로 목록에 포함돼 있었기 때문에 diff가
# 매번 "변경 있음"으로 나와서 사실상 매 push마다 무조건 빌드가 진행됐다 —
# 즉 이 스크립트가 있으나 마나였다. vercel-ignore-dispatch.sh/vercel-ignore-
# planner.sh처럼 Vercel이 넘겨주는 VERCEL_GIT_PREVIOUS_SHA(직전 "배포" 커밋)
# ~ 현재 커밋 전체 범위로 비교하고, package.json/package-lock.json은 버전
# bump 전용이라 판단에서 제외한다.
set -e

if [ "$VITE_PLANNER_SITE" != "1" ]; then
  exit 1
fi

PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"
CUR="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

echo "[ignore-build] PREV=$PREV CUR=$CUR"

if [ -z "$PREV" ]; then
  echo "[ignore-build] 이전 배포 커밋 정보가 없음(첫 배포 등) — 안전하게 빌드 진행"
  exit 1
fi

git fetch --depth=200 --no-tags origin "$PREV" >/dev/null 2>&1 || true

if ! git cat-file -e "$PREV^{commit}" 2>/dev/null; then
  echo "[ignore-build] 직전 배포 커밋($PREV)을 로컬에서 찾을 수 없음(얕은 클론 등) — 안전하게 빌드 진행"
  exit 1
fi

# package.json/package-lock.json은 매 push마다 버전 bump로 항상 바뀌므로
# 판단에서 제외한다 — 그렇지 않으면 아래 diff가 매번 "변경 있음"이 돼서
# 이 스크립트 전체가 무력화된다.
CHANGED=$(git diff --name-only "$PREV" "$CUR" -- . ':!package.json' ':!package-lock.json' 2>/dev/null || echo "__DIFF_FAILED__")

if [ "$CHANGED" = "__DIFF_FAILED__" ]; then
  echo "[ignore-build] diff 계산 실패 — 안전하게 빌드 진행"
  exit 1
fi

if [ -z "$CHANGED" ]; then
  echo "[ignore-build] 변경 파일 없음(버전 bump만 있었을 수 있음) — 빌드 스킵"
  exit 0
fi

echo "[ignore-build] 변경된 파일:"
echo "$CHANGED"

# Planner 화면 자체(src/planner/**)뿐 아니라, Planner도 함께 쓰는 공용
# 파일(App.jsx/main.jsx/firebase 초기화/빌드 설정/index.html 등)이 바뀐
# 경우에도 안전하게 다시 빌드한다. 이 목록에 없는 파일만 바뀌었다면(예:
# 배차프로그램 전용 화면) KP-Planner는 실제로 바뀔 게 없으므로 스킵한다.
PLANNER_RELEVANT_PATTERN='^(src/planner/|public/manifest-planner\.json$|public/icons/kp-planner|src/App\.jsx$|src/main\.jsx$|src/firebase\.js$|src/firebase/|vite\.config\.js$|index\.html$)'

RELEVANT=$(echo "$CHANGED" | grep -E "$PLANNER_RELEVANT_PATTERN" || true)

if [ -z "$RELEVANT" ]; then
  echo "[ignore-build] KP-Planner와 무관한 파일만 변경됨 — 빌드 스킵"
  exit 0
fi

echo "[ignore-build] KP-Planner에 영향 있는 변경 있음 — 빌드 진행"
exit 1
