import { clickText, seq, sleep } from "./lib.mjs";
const menu = async (pg) => { await pg.mouse.click(30, 25); await pg.waitForTimeout(1200); };
export default { mobile: true, steps: [
  { run: seq(menu, clickText("지입차관리"), sleep(5000), clickText("지도"), sleep(3000), async (pg) => { await pg.mouse.move(195, 500); await pg.mouse.wheel(0, 520); }, sleep(1500), async (pg) => { for (let i = 0; i < 4; i++) { await pg.locator(".leaflet-control-zoom-out").first().click().catch(() => {}); await pg.waitForTimeout(700); } }), shot: "mc-fleetmap.png", after: 5000 },
] };
