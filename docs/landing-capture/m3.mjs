import { clickText, clickHas, seq, sleep } from "./lib.mjs";
const menu = async (pg) => { await pg.mouse.click(30, 25); await pg.waitForTimeout(1200); };
export default { mobile: true, steps: [
  { run: seq(clickText("배차완료"), async (pg) => { await pg.mouse.move(195, 600); await pg.mouse.wheel(0, 430); }), shot: "mc-list.png", after: 2500 },
  { run: seq(menu, clickText("지입차관리"), sleep(5000), clickText("지도")), shot: "mc-fleetmap.png", after: 8000 },
] };
