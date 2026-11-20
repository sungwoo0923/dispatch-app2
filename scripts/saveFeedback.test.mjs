// node scripts/saveFeedback.test.mjs — 짧은 완료 알림만 위쪽 "✓" 알림으로(src/saveFeedback.js)
import assert from "node:assert/strict";
import { isDoneNotice } from "../src/saveFeedback.js";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("  ✓", name); };
t("완료 알림 → 위쪽 알림", () => {
  for (const m of ["저장되었습니다.", "수정 완료", "저장했습니다", "3건 등록 완료!", "권한이 저장되었습니다.", "비밀번호가 변경되었습니다.", "복사되었습니다.", "선택한 2개월을 정산완료 처리했습니다.", "초기화했어요."]) assert.equal(isDoneNotice(m), true, m);
});
t("오류 · 안내 · 질문 · 여러 줄 → 지금처럼 확인창", () => {
  for (const m of ["저장에 실패했습니다.", "저장 중 오류가 발생했습니다: x", "조회전용 권한으로 저장할 수 없습니다.", "결재자를 1명 이상 선택해야 저장할 수 있습니다.",
    "승인할 담당자가 없어 요청만 저장했습니다.", "처리할 건을 먼저 선택해 주세요.", "저장했습니다.\n다음 알림부터 반영됩니다.", "이 기사를 삭제할까요?", "",
    "엑셀 3건 → 배차 2건 처리, 총 금액 1,000,000원이고 나머지는 미매칭으로 남았으며 다시 확인이 필요한 건이 있습니다"]) assert.equal(isDoneNotice(m), false, m);
});
console.log(`\n저장 알림 테스트 ${n}개 통과`);
