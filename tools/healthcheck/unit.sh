#!/usr/bin/env bash
# 인터넷·에뮬레이터 없이 도는 단위 테스트 묶음. 하나라도 실패하면 종료코드 1.
#   bash tools/healthcheck/unit.sh [결과폴더]
cd "$(dirname "$0")/../.."
OUT="${1:-healthcheck-results}/unit"
mkdir -p "$OUT"
export TZ=Asia/Seoul # payrollCalc 등 날짜 계산은 한국 시간 기준
TESTS=(
  scripts/businessRules.test.mjs
  scripts/payrollCalc.test.mjs
  scripts/aiAssistantCore.test.mjs
  scripts/aiAssistant.test.mjs
  scripts/orderScanAi.test.mjs
  scripts/sheetProfile.test.mjs
  scripts/officeSheet.test.mjs
  scripts/publicData.test.mjs
  scripts/sheetGuard.test.cjs
  scripts/payrollPw.test.cjs
  scripts/hubTests/hub3_unit.test.mjs
  scripts/hubTests/scan_map.test.mjs
)
fail=0
: > "$OUT/summary.txt"
for t in "${TESTS[@]}"; do
  name=$(basename "$t")
  start=$(date +%s)
  if timeout 300 node "$t" > "$OUT/$name.log" 2>&1; then r=통과; else r="실패($?)"; fail=1; fi
  line="$r  $t  ($(( $(date +%s) - start ))초)"
  echo "$line" | tee -a "$OUT/summary.txt"
  [ "$r" = 통과 ] || tail -20 "$OUT/$name.log"
done
exit $fail
