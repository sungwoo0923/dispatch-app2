// 출퇴근기록 영상 — 홈에서 [출근하기]를 누르고 → 회사관리 › 출근기록부에서 이번 달 기록 보기
//  node gw-seed.mjs today && node gw-att.mjs   → out/attendance.mp4 · out/attendance.jpg
//  PC는 출근시간 3시간 전부터 자동 출근되므로, 05:50에 로그인(자동 출근 안 됨)한 뒤 시계를 08:52로 옮겨 버튼을 누른다.
import { open, startRec, stopRec, showCursor, glide, OUT } from "./gw-lib.mjs";
import { clickText } from "./lib.mjs";
import { mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
mkdirSync(OUT, { recursive: true });
execSync("node gw-seed.mjs today", { cwd: new URL(".", import.meta.url).pathname, stdio: "ignore" });

const { browser, pg } = await open({ clock: "2026-11-09T05:50:00+09:00" });
await pg.clock.setSystemTime(new Date("2026-11-09T08:52:00+09:00"));
await pg.waitForTimeout(2500);
await showCursor(pg, 1000, 520);
const rec = await startRec(pg);
await pg.waitForTimeout(800);
// 1) 출근하기
await glide(pg, pg.getByText("출근하기", { exact: true }).first(), { steps: 22, pause: 400 });
await pg.waitForTimeout(2200);
// 2) 회사관리 › 출근기록부
await pg.evaluate(() => sessionStorage.setItem("kpHrTab", "attendance"));
await clickText("회사관리")(pg);
await pg.waitForTimeout(1600);
await glide(pg, pg.getByText("출근기록부", { exact: true }).first());
await pg.waitForTimeout(2000);
// 3) 아래로 내려 이번 달 기록
await pg.mouse.move(900, 640, { steps: 14 });
await pg.evaluate(() => { const el = [...document.querySelectorAll("*")].find((e) => e.innerText?.trim() === "MY TODAY"); let p = el; while (p && !(p.scrollHeight > p.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement; p?.scrollTo({ top: 560, behavior: "smooth" }); });
await pg.waitForTimeout(2600);
await stopRec(rec, "attendance", { posterAt: Number(process.env.GW_POSTER || 99) });
await browser.close();
process.exit(0);
