// node scripts/roadview.test.mjs — 로드뷰 두 번 톡 이동 방향 계산(src/roadview.jsx 의 순수 함수)
import assert from "node:assert/strict";
import fs from "node:fs";
// roadview.jsx 는 JSX 라 계산 함수만 꺼내 검사한다
const src = fs.readFileSync(new URL("../src/roadview.jsx", import.meta.url), "utf8");
const grab = (name) => { const m = src.match(new RegExp(`export function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`)); return new Function(`${m[0].replace("export ", "")}; return ${name};`)(); };
const headingFromTap = grab("headingFromTap"); const offsetLatLng = grab("offsetLatLng");
let n = 0; const t = (name, fn) => { fn(); n++; console.log("  ✓", name); };
t("가운데를 누르면 지금 보는 방향", () => assert.equal(Math.round(headingFromTap(30, 200, 400, 0)), 30));
t("오른쪽 끝은 +45° · 왼쪽 끝은 −45°(0을 지나면 360으로)", () => { assert.equal(Math.round(headingFromTap(0, 400, 400, 0)), 45); assert.equal(Math.round(headingFromTap(10, 0, 400, 0)), 325); });
t("확대하면 시야가 좁아져 덜 꺾인다", () => assert.ok(headingFromTap(0, 400, 400, 2) < 45));
t("북쪽 100m · 동쪽 100m", () => {
  const nN = offsetLatLng(37.5, 127, 0, 100); assert.ok(nN.lat > 37.5 && Math.abs(nN.lon - 127) < 1e-9);
  const nE = offsetLatLng(37.5, 127, 90, 100); assert.ok(nE.lon > 127 && Math.abs(nE.lat - 37.5) < 1e-9);
  assert.ok(Math.abs((nN.lat - 37.5) * 111320 - 100) < 0.5);
});
console.log(`\n로드뷰 이동 테스트 ${n}개 통과`);
