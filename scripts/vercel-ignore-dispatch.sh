#!/bin/bash
# ============================================================================
# Vercel "Ignored Build Step" — dispatch-app2(배차프로그램) 프로젝트용.
#
# 이 저장소는 배차프로그램(dispatch-app2)과 KP-Planner를 코드 하나로 같이
# 관리하고, Vercel 프로젝트만 2개(dispatch-app2 / kp-planner)로 나눠서 같은
# GitHub 저장소·같은 main 브랜치를 각각 바라보게 배포하는 구조다. 그래서
# 지금까지는 어느 쪽 코드를 고쳐서 push하든, 두 프로젝트가 항상 동시에 다시
# 배포됐다(버전 번호도 같이 올라감) — 서로 다른 프로그램인데 매번 같이 배포
# 되는 게 불편하다는 요청으로 이 스크립트를 추가한다.
#
# 사용법(수동 설정 1회 필요 — Claude가 Vercel 대시보드에 직접 접근할 수 없어서
# 이 부분만은 사용자가 직접 넣어줘야 한다):
#   1) https://vercel.com/<계정>/dispatch-app2/settings/git 로 이동
#   2) "Ignored Build Step" 항목에 아래 명령어를 붙여넣기:
#        bash scripts/vercel-ignore-dispatch.sh
#   3) 저장
#
# 동작 방식: 이번 push에서 바뀐 파일이 "KP-Planner 전용" 파일들뿐이라면(예:
# src/planner/ 아래, adminPlannerData.js, manifest-planner.json 등) 배차
# 프로그램 쪽은 실제로 바뀔 게 없으므로 빌드/배포를 건너뛴다(exit 0).
# 그 외의 파일이 하나라도 바뀌었으면 안전하게 빌드를 진행한다(exit 1).
#
# ⭐ package.json은 일부러 이 판단에서 제외했다 — git push마다 버전 번호만
# 자동으로 1씩 올리는 훅이 있어서, package.json은 사실상 "매번" 바뀐다.
# 그걸 그대로 포함시키면 이 스크립트가 사실상 항상 "빌드 진행"으로 판정돼서
# 아무 의미가 없어진다. (진짜 의존성 변경처럼 package.json 내용이 크게
# 바뀌는 경우는 흔치 않고, 그런 배포 없이 하루이틀 지나가도 치명적이지
# 않다고 보고 이렇게 단순하게 갔다 — 더 정교하게 하고 싶으면 "버전 필드만
# 바뀐 diff인지"까지 검사하도록 다듬을 수 있다.)
# ============================================================================
set -e

PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"
CUR="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

if [ -z "$PREV" ]; then
  echo "이전 배포 커밋 정보가 없음 — 안전하게 빌드 진행"
  exit 1
fi

CHANGED=$(git diff --name-only "$PREV" "$CUR" -- . ':!package.json' || true)

if [ -z "$CHANGED" ]; then
  echo "변경 파일 없음(버전 bump만 있었을 수 있음) — 빌드 스킵"
  exit 0
fi

# KP-Planner 전용 파일만 걸러낸다. 이 목록에 없는 파일이 하나라도 바뀌었으면
# 배차프로그램에도 영향이 있을 수 있다고 보고 안전하게 빌드한다.
NON_PLANNER=$(echo "$CHANGED" | grep -Ev '^(src/planner/|src/adminPlannerData\.js$|public/manifest-planner\.json$|public/icons/kp-planner)' || true)

if [ -z "$NON_PLANNER" ]; then
  echo "KP-Planner 전용 파일만 변경됨 — 배차프로그램(dispatch-app2) 빌드 스킵"
  exit 0
fi

echo "배차프로그램에 영향 있는 변경 있음 — 빌드 진행"
exit 1
