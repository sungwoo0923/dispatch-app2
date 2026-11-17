// ⭐ 2026-11-17 급여명세서 수령 확인 서명 — 순수 함수 테스트: node scripts/payslipSign.test.mjs
import assert from "node:assert/strict";
import { register } from "node:module";
register("./extResolve.mjs", import.meta.url); // src는 확장자 없이 가져오므로 .js를 붙여 찾게
const { toMs, isSigned, canSign, stampDate, signTimeText, signError, signPatch, employeePatchOk, clearSignPatch, SIGN_KEYS, SIGN_IMG_MAX } = await import("../src/payslipSign.js");
const { payslipHtml } = await import("../src/payslipDoc.js");

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const at = Date.UTC(2026, 10, 17, 5, 5); // 한국 14:05
const slip = { uid: "u1", published: true, status: "confirmed", name: "김소현", ym: "2026-11", result: { net: 100 } };

// 시각 바꾸기
assert.equal(toMs(null), 0);
assert.equal(toMs(at), at);
assert.equal(toMs({ toMillis: () => 5 }), 5);
assert.equal(toMs({ seconds: 2, nanoseconds: 5e6 }), 2005);
assert.equal(toMs(new Date(at)), at);

// 서명 여부 · 할 수 있는가
assert.equal(isSigned(slip), false);
assert.equal(isSigned({ ...slip, signedAt: at, signName: "김소현" }), true);
assert.equal(isSigned({ ...slip, signedAt: null, signName: "김소현" }), true, "서버 시각 오기 전에도 서명으로");
assert.equal(canSign(slip, "u1"), true);
assert.equal(canSign(slip, "u2"), false, "남의 명세서");
assert.equal(canSign({ ...slip, published: false }, "u1"), false, "발행 전");
assert.equal(canSign({ ...slip, status: "draft" }, "u1"), false, "작성 중");
assert.equal(canSign({ ...slip, status: "paid" }, "u1"), true, "지급 완료도 서명");
assert.equal(canSign({ ...slip, signedAt: at, signName: "김" }, "u1"), false, "이미 서명");

// 날짜 글자(한국 시각)
assert.equal(stampDate({ signedAt: at }), "11.17");
assert.equal(signTimeText({ signedAt: at }), "2026.11.17 14:05");
assert.equal(stampDate({}), "");

// 입력 검사
assert.equal(signError("", PNG), "이름을 적어 주세요");
assert.equal(signError("김소현", ""), "", "그림 없이 이름만(확인했어요)");
assert.equal(signError("김소현", PNG), "");
assert.match(signError("김소현", "data:image/jpeg;base64,xx"), /다시 써/);
assert.match(signError("김소현", PNG + "A".repeat(SIGN_IMG_MAX)), /너무 커요/);
assert.match(signError("가".repeat(31), PNG), /30자/);

// 저장 칸
const p = signPatch("  김소현 ", PNG, "TS");
assert.deepEqual(Object.keys(p).sort(), [...SIGN_KEYS].sort());
assert.equal(p.signName, "김소현");
assert.equal(signPatch("김", "bad", 1).signImg, "");

// 직원이 바꿀 수 있는 칸(규칙과 같은 판단)
assert.equal(employeePatchOk(slip, { readAt: 1 }), true);
assert.equal(employeePatchOk(slip, { signedAt: 1, signName: "김소현", signImg: PNG }), true);
assert.equal(employeePatchOk(slip, { signedAt: 1, signName: "김소현", signImg: PNG, readAt: 2 }), true);
assert.equal(employeePatchOk(slip, { signedAt: 1, signName: "김소현", result: { net: 9 } }), false, "금액은 못 고친다");
assert.equal(employeePatchOk(slip, { signName: "김소현" }), false, "시각 없이");
assert.equal(employeePatchOk({ ...slip, signedAt: at, signName: "김" }, { signedAt: 1, signName: "다른" }), false, "서명 덮어쓰기 금지");
assert.equal(employeePatchOk({ ...slip, status: "draft" }, { signedAt: 1, signName: "김" }), false);
assert.equal(employeePatchOk(slip, {}), false);

// 확정 해제 — 서명 칸 지우기
assert.deepEqual(clearSignPatch("DEL"), { signedAt: "DEL", signName: "DEL", signImg: "DEL" });

// 명세서 HTML — 서명하면 도장 · 수령 확인 줄
const h0 = payslipHtml(slip, "테스트운송");
assert.ok(!h0.includes("ps-stamp"), "서명 전에는 도장 없음");
const h1 = payslipHtml({ ...slip, signedAt: at, signName: "김소현", signImg: PNG }, "테스트운송");
assert.ok(h1.includes("ps-stamp") && h1.includes("서명완료") && h1.includes("11.17"), "도장");
assert.ok(h1.includes(PNG) && h1.includes("2026.11.17 14:05"), "서명 그림 · 시각");
const h2 = payslipHtml({ ...slip, signedAt: at, signName: "<b>x</b>", signImg: "javascript:alert(1)" }, "테스트운송");
assert.ok(!h2.includes("<b>x</b>") && !h2.includes("javascript:"), "이름 · 그림 주소 그대로 넣지 않음");

console.log("payslipSign: 모두 통과");
