// 사내메일 영상 — 받은메일 읽기 → 메일 쓰기(받는 사람 검색 · 제목 · 내용) → 보내기
//  node gw-seed.mjs && node gw-mail.mjs   → out/mail.mp4 · out/mail.jpg
import { open, startRec, stopRec, showCursor, glide, typeSlow, OUT } from "./gw-lib.mjs";
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });

const { browser, pg } = await open();
await pg.locator('[title="사내메일함"]').first().click();
await pg.waitForTimeout(2500);
await showCursor(pg, 900, 600);
const rec = await startRec(pg);
await pg.waitForTimeout(700);
// 1) 중요 메일 열어 읽기
await glide(pg, pg.getByText("11월 정기 차량 점검 일정 안내").first());
await pg.waitForTimeout(2600);
// 2) 메일 쓰기
await glide(pg, pg.getByText("메일 쓰기", { exact: true }).first());
await pg.waitForTimeout(900);
await glide(pg, pg.locator('input[placeholder="이름·부서로 검색"]').first());
await typeSlow(pg, "이서연", 110);
await pg.waitForTimeout(700);
const opt = pg.locator("button, li, [role=option]", { hasText: "이서연" }).last();
if (await opt.count()) await glide(pg, opt); else await pg.keyboard.press("Enter");
await pg.waitForTimeout(600);
await glide(pg, pg.locator('input[placeholder="제목을 입력하세요"]').first());
await pg.keyboard.type("대성식품 11월 운임 변경 적용 안내", { delay: 45 });
await glide(pg, pg.locator('textarea[placeholder="내용을 입력하세요"]').first());
await pg.keyboard.type("서연 대리님, 품의 승인되어 11월 4일 상차분부터 620,000원으로 적용합니다.\n거래처 물류팀에도 공유 부탁드립니다.", { delay: 32 });
await pg.waitForTimeout(700);
await glide(pg, pg.locator("button", { hasText: "보내기" }).last());
await pg.waitForTimeout(2400);
await stopRec(rec, "mail", { posterAt: Number(process.env.GW_POSTER || 3.2) });
await browser.close();
process.exit(0);
