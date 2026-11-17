// AI 비서 도움말 답변 — node scripts/helpSearch.test.mjs
import { helpAnswer, menuOf } from "../src/helpSearch.js";
let fails = 0;
const ok = (c, m) => { if (c) console.log("✓", m); else { fails++; console.error("✗", m); } };
const a = helpAnswer("전자결재에서는 어떤 기능을 사용할 수 있어?");
ok(a && a.menu === "전자결재" && a.answer.includes("전자결재에서 할 수 있는 일"), "메뉴 기능 질문 → 그 메뉴 요약");
ok(menuOf("거래명세서 어떻게 보내?") === "정산관리", "별칭(거래명세서) → 정산관리");
const b = helpAnswer("비품 등록은 어떻게 해?");
ok(b && b.answer.includes("비품 등록"), "버튼 이름 질문 → 그 항목 설명");
const c = helpAnswer("초성 검색이 뭐야");
ok(c && c.answer.includes("초성"), "공통 도움말에서도 찾음");
ok(helpAnswer("ㅋㅋ") === null, "엉뚱한 글은 null");
console.log(a.answer.slice(0, 300));
if (fails) { console.error(`helpSearch: ${fails}개 실패`); process.exit(1); } else console.log("helpSearch: 모두 통과");
import { execFileSync } from "child_process";
try { execFileSync(process.execPath, [new URL("./genHelpData.mjs", import.meta.url).pathname, "--check"]); console.log("✓ functions/helpData.json 이 도움말과 같다"); }
catch { console.error("✗ functions/helpData.json 이 오래됐어요 — node scripts/genHelpData.mjs"); process.exit(1); }
