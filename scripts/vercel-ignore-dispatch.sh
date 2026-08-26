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
#   1) https://vercel.com/<계정>/dispatch-app2/settings/build-and-deployment 로 이동
#   2) "Ignored Build Step" → Project Settings 펼치기 → Behavior를
#      "Run my Bash script"로, Command에 아래 명령어를 붙여넣기:
#        bash scripts/vercel-ignore-dispatch.sh
#   3) Save
#
# 동작 방식: 이번 push에서 바뀐 파일이 "KP-Planner 전용" 파일들뿐이라면(예:
# src/planner/ 아래, adminPlannerData.js, manifest-planner.json 등) 배차
# 프로그램 쪽은 실제로 바뀔 게 없으므로 빌드/배포를 건너뛴다(exit 0).
# 그 외의 파일이 하나라도 바뀌었으면 안전하게 빌드를 진행한다(exit 1).
#
# ⭐ package.json은 일부러 이 판단에서 제외했다 — git push마다 버전 번호만
# 자동으로 1씩 올리는 훅이 있어서, package.json은 사실상 "매번" 바뀐다.
# 그걸 그대로 포함시키면 이 스크립트가 사실상 항상 "빌드 진행"으로 판정돼서
# 아무 의미가 없어진다.
#
# ⭐ Vercel은 빌드 컨테이너에 저장소를 "얕은(shallow)" 클론으로 받아오는 경우가
# 있어서, 직전 배포 커밋(VERCEL_GIT_PREVIOUS_SHA)이 로컬 히스토리에 아예 없을
# 수 있다 — 그러면 git diff 자체가 실패한다. 그런 경우를 대비해 그 커밋만
# 추가로 fetch를 한 번 시도한 뒤 diff한다. 그래도 실패하면(첫 배포, 또는 너무
# 오래된 커밋 등) 안전하게 "빌드 진행" 쪽으로 처리한다 — 잘못 스킵해서 진짜
# 필요한 배포가 누락되는 것보다는, 가끔 불필요하게 한 번 더 빌드되는 게 낫다.
# ============================================================================
set -e

PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"
CUR="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

echo "[ignore-dispatch] PREV=$PREV CUR=$CUR"

if [ -z "$PREV" ]; then
  echo "[ignore-dispatch] 이전 배포 커밋 정보가 없음(이 설정을 막 켠 직후의 첫 배포일 수 있음) — 안전하게 빌드 진행"
  exit 1
fi

git fetch --depth=200 --no-tags origin "$PREV" >/dev/null 2>&1 || true

if ! git cat-file -e "$PREV^{commit}" 2>/dev/null; then
  echo "[ignore-dispatch] 직전 배포 커밋($PREV)을 로컬에서 찾을 수 없음(얕은 클론 등) — 안전하게 빌드 진행"
  exit 1
fi

CHANGED=$(git diff --name-only "$PREV" "$CUR" -- . ':!package.json' 2>/dev/null || echo "__DIFF_FAILED__")

if [ "$CHANGED" = "__DIFF_FAILED__" ]; then
  echo "[ignore-dispatch] diff 계산 실패 — 안전하게 빌드 진행"
  exit 1
fi

if [ -z "$CHANGED" ]; then
  echo "[ignore-dispatch] 변경 파일 없음(버전 bump만 있었을 수 있음) — 빌드 스킵"
  exit 0
fi

echo "[ignore-dispatch] 변경된 파일:"
echo "$CHANGED"

# KP-Planner 전용 파일만 걸러낸다. 이 목록에 없는 파일이 하나라도 바뀌었으면
# 배차프로그램에도 영향이 있을 수 있다고 보고 안전하게 빌드한다.
NON_PLANNER=$(echo "$CHANGED" | grep -Ev '^(src/planner/|src/adminPlannerData\.js$|public/manifest-planner\.json$|public/icons/kp-planner)' || true)

if [ -z "$NON_PLANNER" ]; then
  echo "[ignore-dispatch] KP-Planner 전용 파일만 변경됨 — 배차프로그램(dispatch-app2) 빌드 스킵"
  exit 0
fi

echo "[ignore-dispatch] 배차프로그램에 영향 있는 변경 있음 — 빌드 진행"
exit 1
