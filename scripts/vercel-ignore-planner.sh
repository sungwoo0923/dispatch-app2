#!/bin/bash
# ============================================================================
# Vercel "Ignored Build Step" — kp-planner(KP-Planner) 프로젝트용.
# vercel-ignore-dispatch.sh와 정반대 판단을 한다: 이번 push가 "배차프로그램
# 전용" 파일만 건드렸다면 KP-Planner 쪽은 실제로 바뀔 게 없으니 빌드/배포를
# 건너뛴다.
#
# 사용법(수동 설정 1회 필요):
#   1) https://vercel.com/<계정>/kp-planner/settings/build-and-deployment 로 이동
#   2) "Ignored Build Step" → Project Settings 펼치기 → Behavior를
#      "Run my Bash script"로, Command에 아래 명령어를 붙여넣기:
#        bash scripts/vercel-ignore-planner.sh
#   3) Save
#
# 자세한 배경 설명은 vercel-ignore-dispatch.sh 상단 주석 참고.
# ============================================================================
set -e

PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"
CUR="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

echo "[ignore-planner] PREV=$PREV CUR=$CUR"

if [ -z "$PREV" ]; then
  echo "[ignore-planner] 이전 배포 커밋 정보가 없음(이 설정을 막 켠 직후의 첫 배포일 수 있음) — 안전하게 빌드 진행"
  exit 1
fi

git fetch --depth=200 --no-tags origin "$PREV" >/dev/null 2>&1 || true

if ! git cat-file -e "$PREV^{commit}" 2>/dev/null; then
  echo "[ignore-planner] 직전 배포 커밋($PREV)을 로컬에서 찾을 수 없음(얕은 클론 등) — 안전하게 빌드 진행"
  exit 1
fi

CHANGED=$(git diff --name-only "$PREV" "$CUR" -- . ':!package.json' 2>/dev/null || echo "__DIFF_FAILED__")

if [ "$CHANGED" = "__DIFF_FAILED__" ]; then
  echo "[ignore-planner] diff 계산 실패 — 안전하게 빌드 진행"
  exit 1
fi

if [ -z "$CHANGED" ]; then
  echo "[ignore-planner] 변경 파일 없음(버전 bump만 있었을 수 있음) — 빌드 스킵"
  exit 0
fi

echo "[ignore-planner] 변경된 파일:"
echo "$CHANGED"

# "확실히 배차프로그램 전용"이라고 알려진 경로만 걸러낸다. 이 목록에 없는
# 파일이 하나라도 바뀌었으면(공용 파일 포함) KP-Planner에도 영향이 있을 수
# 있다고 보고 안전하게 빌드한다.
DISPATCH_ONLY_PATTERN='^(src/mobile/|src/shipper/|src/driver/|src/DispatchApp\.jsx$|src/AdminMenu\.jsx$|src/Login\.jsx$|src/TransportLogin\.jsx$|src/Signup\.jsx$|src/StandardFare\.jsx$|src/UploadPage\.jsx$|src/DriverSearchPage\.jsx$|src/ChangePassword\.jsx$|src/NoAccess\.jsx$|src/ShortLinkRedirect\.jsx$|public/icons/sflow-)'

NON_DISPATCH=$(echo "$CHANGED" | grep -Ev "$DISPATCH_ONLY_PATTERN" || true)

if [ -z "$NON_DISPATCH" ]; then
  echo "[ignore-planner] 배차프로그램 전용 파일만 변경됨 — KP-Planner 빌드 스킵"
  exit 0
fi

echo "[ignore-planner] KP-Planner에 영향 있는 변경 있음 — 빌드 진행"
exit 1
