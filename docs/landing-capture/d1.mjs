import { clickText, seq, sleep } from "./lib.mjs";
export default { mobile: true, geo: { latitude: 35.85, longitude: 128.55 }, loginPath: "/driver-login", loginFn: async (pg) => {
  await pg.fill('input[placeholder="가입한 운송사명"]', "한결로지스");
  await pg.fill('input[placeholder="예: 경기97가1234"]', "경기82아7712");
  await pg.fill('input[placeholder="이름"]', "이민수");
  await pg.keyboard.press("Enter");
}, steps: [
  { run: clickText("나중에"), shot: "dc-home.png", after: 4000 },
  { run: async (pg) => { await pg.mouse.move(195, 600); await pg.mouse.wheel(0, 500); }, shot: "dc-home2.png", after: 2000 },
  { run: async (pg) => { await pg.mouse.wheel(0, -2000); }, after: 800 },
  { run: clickText("운행기록"), shot: "dc-log.png", after: 4000 },
  { run: clickText("서류함"), shot: "dc-docs.png", after: 4000 },
  { run: clickText("차량"), shot: "dc-car.png", after: 4000 },
] };
