import { clickText, clickHas, sub, seq, sleep } from "./lib.mjs";
export default { steps: [
  { run: seq(clickText("지입차관리"), sleep(3000), clickText("관제현황"), sleep(5000), clickText("전체 보기")), shot: "c-control.png", after: 6000 },
  { run: seq(clickText("매출관리"), sleep(2500), async (pg) => { const i = pg.locator('input[type="password"]'); if (await i.count()) { await i.first().fill("1234"); await i.first().press("Enter"); } }, sleep(6000), clickText("2026-11"), sleep(800), clickText("2026-10")), shot: "c-revenue10.png", after: 7000 },
  { run: async (pg) => { await pg.mouse.wheel(0, 900); }, shot: "c-revenue10b.png", after: 2500 },
  { run: seq(clickText("운임조회"), sleep(1500), clickText("자사운임표"), sleep(2000), async (pg) => { await pg.fill('input[placeholder="예: 송원"]', "대성식품"); await pg.fill('input[placeholder="예: 유통센터"]', "평택"); await pg.keyboard.press("Enter"); }, sleep(1500), clickText("조회하기"), clickText("조회")), shot: "c-fare.png", after: 6000 },
] };
