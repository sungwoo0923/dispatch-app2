// 🛰️ 2026-11-22 관제센터 1단계 — 차량 상태 판정 · 교통 돌발 정리 점검
//  node scripts/controlTower.test.mjs
import assert from "node:assert/strict";
import { classifyVehicle, parseHm, dueMs, updateStopMemo, countLevels, hhmm } from "../src/controlTowerCore.js";
import { incidentsNear, segDistKm, visibleIncidents, isSevere } from "../src/trafficCore.js";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// api/ 폴더는 "type: commonjs" 라 그대로는 못 불러온다 → 같은 내용을 .mjs 로 잠깐 복사해서 불러온다
const apiTmp = join(mkdtempSync(join(tmpdir(), "kp-traffic-")), "traffic.mjs");
writeFileSync(apiTmp, readFileSync(new URL("../api/traffic.js", import.meta.url)));
const { normalizeEvent, eventKind, normalizeCctv } = await import(apiTmp);

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("✓", name); };

t("시간 읽기", () => {
  assert.equal(parseHm("14:00"), 840);
  assert.equal(parseHm("14시30분"), 870);
  assert.equal(parseHm("오후 2시"), 840);
  assert.equal(parseHm("오전 12시"), 0);
  assert.equal(parseHm("당일"), null);
  assert.equal(parseHm(""), null);
  assert.equal(hhmm(dueMs("2026-11-22", "09:05")), "09:05");
});

t("ITS 돌발 정리", () => {
  assert.equal(eventKind("교통사고"), "accident");
  assert.equal(eventKind("공사", "작업"), "work");
  assert.equal(eventKind("기타돌발", "고장차량"), "hazard");
  const ev = normalizeEvent({ type: "고속도로", eventType: "교통사고", eventDetailType: "추돌사고", coordX: "127.1", coordY: "37.3", roadName: "경부선", lanesBlockType: "전면통제", lanesBlocked: "전차로", startDate: "20261122143000" });
  assert.equal(ev.kind, "accident");
  assert.equal(ev.blocked, true);
  assert.equal(ev.start, "2026-11-22T14:30:00+09:00");
  assert.equal(normalizeEvent({ eventType: "공사", coordX: "0", coordY: "0" }), null, "좌표가 이상하면 버린다");
  assert.equal(normalizeCctv({ cctvname: "서울", coordx: 127, coordy: 37.5, cctvurl: "https://x/a.m3u8" }).name, "서울");
  assert.equal(isSevere(ev), true);
  assert.equal(isSevere({ kind: "work" }), false);
});

t("가는 길 · 근처 돌발", () => {
  const pos = { lat: 37.0, lng: 127.0 }, target = { lat: 37.5, lng: 127.0 };
  const ahead = { id: "a", kind: "accident", lat: 37.25, lng: 127.005 };
  const behind = { id: "b", kind: "accident", lat: 36.8, lng: 127.0 };
  const side = { id: "c", kind: "work", lat: 37.25, lng: 127.2 };
  const near = { id: "d", kind: "work", lat: 37.01, lng: 127.01 };
  const r = incidentsNear([ahead, behind, side, near], pos, target);
  assert.deepEqual(r.map((x) => x.ev.id).sort(), ["a", "d"]);
  assert.ok(segDistKm(ahead, pos, target).km < 1);
});

t("지도에 보일 돌발 — 멀리서 보면 공사 숨김", () => {
  const items = [{ id: 1, kind: "work", lat: 37, lng: 127 }, { id: 2, kind: "accident", lat: 37, lng: 127 }, { id: 3, kind: "accident", lat: 35, lng: 129 }];
  const b = { north: 37.5, south: 36.5, east: 127.5, west: 126.5 };
  assert.deepEqual(visibleIncidents(items, b, 8).map((x) => x.id), [2]);
  assert.deepEqual(visibleIncidents(items, b, 12).map((x) => x.id), [1, 2]);
});

const NOW = Date.parse("2026-11-22T13:00:00+09:00");
const base = { entry: { lat: 37.0, lng: 127.0, speed: 60, updatedMs: NOW - 30000 }, live: "live", phase: "운송중", loaded: true, pickupGeo: { lat: 36.9, lng: 127.0 }, dropGeo: { lat: 37.1, lng: 127.0 }, now: NOW };

t("정상", () => {
  const r = classifyVehicle({ ...base, order: { 하차일: "2026-11-22", 하차시간: "15:00" } });
  assert.equal(r.level, "ok");
  assert.ok(r.etaDrop > NOW);
});

t("지연 예상 — 하차 약속보다 늦음", () => {
  const r = classifyVehicle({ ...base, dropGeo: { lat: 38.0, lng: 127.0 }, order: { 하차일: "2026-11-22", 하차시간: "13:30" } });
  assert.equal(r.level, "delay");
  assert.match(r.reasons[0].text, /늦을 듯/);
});

t("문제 — 가는 길 사고가 지연보다 먼저", () => {
  const ev = { id: "x", kind: "accident", lat: 37.05, lng: 127.0, road: "경부선" };
  const r = classifyVehicle({ ...base, dropGeo: { lat: 38.0, lng: 127.0 }, order: { 하차일: "2026-11-22", 하차시간: "13:30" }, events: [ev] });
  assert.equal(r.level, "alert");
  assert.equal(r.reasons[0].ev, ev);
});

t("신호 끊김 — 위치 기반 판단은 하지 않음", () => {
  const ev = { id: "x", kind: "accident", lat: 37.0, lng: 127.0 };
  const r = classifyVehicle({ ...base, live: "stale", entry: { ...base.entry, updatedMs: NOW - 40 * 60000 }, events: [ev], order: {} });
  assert.equal(r.level, "lost");
  assert.equal(r.near.length, 0);
});

t("예정에 없는 정차", () => {
  const memo = new Map();
  const e = { lat: 37, lng: 127, speed: 0 };
  updateStopMemo(memo, "v", e, NOW - 45 * 60000);
  const stop = updateStopMemo(memo, "v", { ...e, lat: 37.0005 }, NOW);
  assert.equal(stop.since, NOW - 45 * 60000, "300m 안에서는 계속 센다");
  const r = classifyVehicle({ ...base, entry: { ...base.entry, speed: 0 }, stop, order: {} });
  assert.equal(r.level, "alert");
  const atSite = classifyVehicle({ ...base, phase: "하차지도착", entry: { ...base.entry, speed: 0 }, stop, order: {} });
  assert.equal(atSite.level, "ok", "상 · 하차지에서 서 있는 건 정상");
  assert.equal(updateStopMemo(memo, "v", { ...e, speed: 40 }, NOW).since, null, "움직이면 초기화");
});

t("상차 시간 지남", () => {
  const r = classifyVehicle({ ...base, loaded: false, order: { 상차일: "2026-11-22", 상차시간: "12:00" } });
  assert.equal(r.level, "delay");
  assert.match(r.reasons.map((x) => x.text).join(), /상차 시간/);
});

t("야간 운행 — 하차일 없이 하차 시간이 더 이르면 다음 날", () => {
  const r = classifyVehicle({ ...base, order: { 상차일: "2026-11-22", 상차시간: "22:00", 하차시간: "06:00" } });
  assert.equal(hhmm(r.dropDue), "06:00");
  assert.ok(r.dropDue > NOW + 12 * 3600e3);
});

t("상태 세기", () => {
  assert.deepEqual(countLevels([{ level: "ok" }, { level: "alert" }, { level: "alert" }]), { alert: 2, delay: 0, lost: 0, ok: 1 });
});

console.log(`\n관제센터 점검 ${n}개 통과`);
