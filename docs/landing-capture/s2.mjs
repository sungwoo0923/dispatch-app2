import { clickText, sub, seq } from "./lib.mjs";
const KAKAO = "[오더요청] 대성식품 물류팀\n11/4(수) 오전 8시 상차\n상차: 대성식품 1공장 인천 서구 오류동 1546\n하차: 평택 포승 물류센터 3도크 당일 14시까지\n11톤 윙바디 1대 / 냉동만두 14파레트 / 지게차 상하차\n운임 62만 (계산서)\n담당 정과장 010-2281-4410";
export default { steps: [
  { run: seq(clickText("배차관리"), clickText("오더스캔")), shot: "c-scan0.png", after: 2500 },
  { run: async (pg) => { await pg.fill('textarea[data-os-input="1"]', KAKAO); await pg.waitForTimeout(500); await pg.evaluate(() => { const b = document.querySelector('textarea[data-os-input="1"]').parentElement.querySelector("button"); b && b.click(); }); }, shot: "c-scan.png", after: 6000 },
  { run: async (pg) => { await pg.keyboard.press("Escape"); }, after: 1000 },
  { run: seq(clickText("매출관리")), after: 3000 },
  { run: async (pg) => { const i = pg.locator('input[type="password"]').first(); await i.fill("1234"); await i.press("Enter"); }, shot: "c-revenue.png", after: 7000 },
  { run: seq(clickText("HOME"), clickText("결재함")), shot: "c-approval.png", after: 5000 },
  { run: seq(clickText("지입차관리"), clickText("관제현황")), shot: "c-control.png", after: 12000 },
  { run: seq(clickText("운임조회"), sub("FARE LOOKUP", "자사운임표")), shot: "c-fare.png", after: 6000 },
] };
