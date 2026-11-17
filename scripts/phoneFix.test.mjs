// 구글시트 전화번호(앞의 0 빠짐) 되살리기 — node scripts/phoneFix.test.mjs
import { fmtPhone } from "../functions/carrierMigrateCore.mjs";
let fails = 0;
const eq = (a, b, m) => { if (a === b) console.log("✓", m); else { fails++; console.error("✗", m, a, "≠", b); } };
eq(fmtPhone("1092880431"), "010-9288-0431", "숫자가 된 휴대폰 번호(10자리)");
eq(fmtPhone(1092880431), "010-9288-0431", "숫자 값 그대로");
eq(fmtPhone("010-7144-0066"), "010-7144-0066", "정상 번호는 그대로");
eq(fmtPhone("01071440066"), "010-7144-0066", "하이픈 없는 번호");
eq(fmtPhone("312345678"), "031-234-5678", "지역번호(031) 0 빠짐");
eq(fmtPhone("21234567"), "02-123-4567", "서울(02) 0 빠짐");
eq(fmtPhone("15881234"), "15881234", "대표번호는 건드리지 않음");
eq(fmtPhone("미정"), "미정", "글자는 그대로");
if (fails) { console.error(`phoneFix: ${fails}개 실패`); process.exit(1); } else console.log("phoneFix: 모두 통과");
