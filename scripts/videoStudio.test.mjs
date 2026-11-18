// 🎬 2026-11-18 홍보팀 영상 작업실 — 자막(SRT) · 음악 큐시트 · 장면 시간 바로잡기 점검 — node scripts/videoStudio.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { srtTime, clock, subtitleCues, toSrt, cueSheetCsv, planText, safeName } from "../src/videoStudio.js";
const require = createRequire(import.meta.url);
const { fixScenes, cleanInput, SCHEMA } = require("../functions/aiVideo.js");

assert.equal(srtTime(0), "00:00:00,000");
assert.equal(srtTime(62.5), "00:01:02,500");
assert.equal(srtTime(3725.04), "01:02:05,040");
assert.equal(clock(65), "1:05");

const scenes = [
  { no: 1, start: 0, end: 4, title: "훅", narration: "", subtitles: ["지게차 상차 전", "이것만 보세요"], bgm: { track: "A", volume: 50, action: "시작" } },
  { no: 2, start: 4, end: 10, title: "첫째", narration: "포크 높이를 확인해요. 그다음 팔레트 상태를 봐요.", subtitles: [], bgm: { track: "A", volume: 20, action: "낮춤" } },
];
const cues = subtitleCues(scenes);
assert.equal(cues.length, 4, "자막 줄 2 + 내레이션 문장 2");
assert.deepEqual(cues[0], { start: 0, end: 2, text: "지게차 상차 전" });
assert.equal(cues[2].start, 4); assert.equal(cues[3].end, 10);
const srt = toSrt(scenes);
assert.ok(srt.startsWith("1\n00:00:00,000 --> 00:00:02,000\n지게차 상차 전\n"));
assert.equal((srt.match(/-->/g) || []).length, 4);

const plan = { title: "지게차/상차: 3가지", hook: "h", summary: "s", format: "9:16", tracks: [{ id: "A", mood: "경쾌", genre: "lo-fi", bpm: 96, keywords: ["upbeat corporate", "lofi"], where: "전체" }], scenes, captions: [{ platform: "유튜브", text: "설명, \"따옴표\"" }], hashtags: ["물류"], thumbnails: ["3가지"], tips: ["밝게"] };
const csv = cueSheetCsv(plan);
assert.ok(csv.startsWith("﻿장면,시작,끝"), "엑셀 BOM + 머리줄");
assert.ok(csv.includes("1,0:00,0:04,훅,A,경쾌 · lo-fi,96,50,시작,upbeat corporate / lofi"));
const txt = planText(plan, { kind: "숏츠", seconds: 10, platform: "유튜브 쇼츠" });
assert.ok(txt.includes("■ 배경음악") && txt.includes("#물류"));
assert.equal(safeName(plan.title), "지게차 상차 3가지");

// 서버 — 장면 시간이 어긋나도 0부터 이어지고 끝이 전체 길이
const fixed = fixScenes([{ start: 0, end: 5, bgm: { volume: 140 } }, { start: 7, end: 20 }, { start: 30, end: 31 }], 30);
assert.deepEqual(fixed.map((s) => [s.start, s.end]), [[0, 5], [5, 18], [18, 30]]);
assert.equal(fixed[0].bgm.volume, 100, "볼륨은 0~100");
assert.equal(cleanInput({ kind: "모름", seconds: 99999 }).kind, "숏츠");
assert.equal(cleanInput({ seconds: 99999 }).seconds, 900);
assert.ok(SCHEMA.required.includes("scenes") && SCHEMA.properties.scenes.items.required.includes("bgm"));
console.log("videoStudio OK");
