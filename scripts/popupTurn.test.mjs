// 🪟 2026-11-18 접속 팝업 차례 · 알림 브리핑 분류 점검 — node scripts/popupTurn.test.mjs
import assert from "node:assert/strict";
import { setWant, currentTurn, _reset, POPUP_ORDER } from "../src/popupTurn.js";

_reset();
assert.equal(currentTurn(), "");
setWant("birthday", true); assert.equal(currentTurn(), "birthday");
setWant("briefing", true); assert.equal(currentTurn(), "birthday", "생일이 일일 보고보다 먼저");
setWant("notify", true); assert.equal(currentTurn(), "notify", "알림 브리핑이 맨 먼저");
setWant("orderCongrats", true); assert.equal(currentTurn(), "notify");
setWant("notify", false); assert.equal(currentTurn(), "orderCongrats", "알림 브리핑을 닫으면 인사발령 축하");
setWant("orderCongrats", false); setWant("birthday", false); assert.equal(currentTurn(), "briefing");
setWant("briefing", false); assert.equal(currentTurn(), "");
assert.deepEqual(POPUP_ORDER, ["notify", "orderCongrats", "birthday", "briefing"]);
console.log("popupTurn OK");
