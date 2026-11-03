import { clickText, seq, sleep } from "./lib.mjs";
export default { steps: [
  { run: seq(clickText("매출관리"), sleep(2500), async (pg) => { const i = pg.locator('input[type="password"]'); if (await i.count()) { await i.first().fill("1234"); await i.first().press("Enter"); } }, sleep(30000), clickText("2026-11"), sleep(800), async (pg) => { await pg.getByText("2026-10", { exact: true }).last().click(); }), shot: "c-revenue10.png", after: 10000 },
  { run: async (pg) => { await pg.mouse.move(900, 800); await pg.mouse.wheel(0, 700); }, shot: "c-revenue10b.png", after: 3000 },
] };
