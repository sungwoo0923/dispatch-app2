// 사내메신저 영상 — 창을 끌어 옮기고, @멘션으로 메시지 보내고, 답장 받고, 자주 쓰는 문구로 답하기
//  node gw-seed.mjs && node gw-msg.mjs   → out/messenger.mp4 · out/messenger.jpg
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
import { createRequire } from "node:module";
import { open, startRec, stopRec, showCursor, glide, typeSlow, OUT } from "./gw-lib.mjs";
import { mkdirSync } from "node:fs";
const require = createRequire(new URL("../../package.json", import.meta.url));
const admin = require("firebase-admin"); admin.initializeApp({ projectId: "demo-kpflow" });
const db = admin.firestore(), auth = admin.auth();
mkdirSync(OUT, { recursive: true });
const only = process.argv[2] || "all";

const openRoom = async (pg) => {
  await pg.locator('[title="메신저"]').first().click();
  await pg.waitForTimeout(2500);
  await pg.locator("button", { hasText: /^채팅/ }).first().click();
  await pg.waitForTimeout(1200);
  await pg.getByText("배차팀").first().click();
  await pg.waitForTimeout(2500);
};

if (only === "all" || only === "pc") {
  const { browser, pg } = await open();
  await openRoom(pg);
  await showCursor(pg, 1100, 620);
  const rec = await startRec(pg);
  await pg.waitForTimeout(900);
  // 1) 창 끌어서 옮기기
  const handle = pg.getByText("끌어서 옮기기").first();
  const hb = await handle.boundingBox();
  if (hb) {
    await pg.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2, { steps: 16 }); await pg.waitForTimeout(250);
    await pg.mouse.down(); await pg.mouse.move(hb.x + hb.width / 2 - 200, hb.y + hb.height / 2 - 120, { steps: 26 }); await pg.mouse.up();
    await pg.waitForTimeout(500);
  }
  // 2) @멘션으로 메시지
  const ta = pg.locator('textarea[placeholder^="메시지 입력"]').first();
  await glide(pg, ta);
  await typeSlow(pg, "@이서연", 90);
  await pg.waitForTimeout(500);
  await pg.keyboard.type(" 대성식품 평택 건 기사님 배정 완료했습니다.", { delay: 45 });
  await pg.waitForTimeout(300);
  await pg.keyboard.press("Enter");
  await pg.waitForTimeout(1300);
  // 3) 답장 도착
  const lee = await auth.getUserByEmail("lee@hangyeol.demo");
  const room = (await db.doc("chat_rooms/demo-room-team").get()).data();
  await db.collection("chat_messages").add({ roomId: "demo-room-team", type: "text", text: "확인했습니다. 인수증 오면 바로 올릴게요.", senderUid: lee.uid, senderName: "이서연", senderPhoto: "", createdAt: admin.firestore.FieldValue.serverTimestamp(), readBy: [lee.uid], totalMembers: room.members.length, memberUids: room.members });
  await db.doc("chat_rooms/demo-room-team").update({ lastMsg: "확인했습니다. 인수증 오면 바로 올릴게요.", lastAt: admin.firestore.FieldValue.serverTimestamp(), lastSenderUid: lee.uid });
  await pg.waitForTimeout(1600);
  // 4) 자주 쓰는 문구
  await glide(pg, pg.locator('[title="자주 쓰는 문구"]').first());
  await pg.waitForTimeout(800);
  const q = pg.getByText("네 알겠습니다. 바로 처리하겠습니다.", { exact: true }).last();
  await glide(pg, q);
  await pg.waitForTimeout(900);
  const send = pg.locator('textarea[placeholder^="메시지 입력"]').first();
  if ((await send.inputValue().catch(() => "")).trim()) await pg.keyboard.press("Enter");
  await pg.waitForTimeout(1800);
  await stopRec(rec, "messenger", { posterAt: 99 });
  await browser.close();
}

process.exit(0);
