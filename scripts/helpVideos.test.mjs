// 교육 영상 목록 · '영상 만든 뒤 바뀐 점' 검사 — node scripts/helpVideos.test.mjs
//  · 영상 파일 · 표지가 다 있는지 · 영상이 가리키는 메뉴에 도움말 센터 설명이 있는지
//  · 바뀐 점(VIDEO_SINCE)이 있는 편 · 날짜 형식 · 촬영일 뒤 날짜 · 최신이 위 · 한 줄 길이를 본다(CLAUDE.md)
import fs from "fs";
import { HELP_VIDEOS, VIDEO_SINCE, VIDEO_RECORDED, videoRecorded, videoChanges } from "../src/helpVideos.js";
import { HELP_DETAIL } from "../src/helpContent.js";
const has = (f) => fs.existsSync(new URL(`../public${f}`, import.meta.url));
let fails = 0;
const ok = (c, n) => { if (c) console.log("✓", n); else { fails++; console.error("✗", n); } };
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");

ok(isDate(VIDEO_RECORDED), `기본 촬영일 ${VIDEO_RECORDED}`);
const ids = new Set(HELP_VIDEOS.map((v) => v.id));
ok(ids.size === HELP_VIDEOS.length, "영상 id 가 겹치지 않는다");
HELP_VIDEOS.forEach((v, i) => ok(v.no === i + 1, `${v.id} 편 번호가 순서대로다`));
for (const v of HELP_VIDEOS) {
  ok(has(`/videos/${v.id}.mp4`) && has(`/videos/${v.id}.jpg`), `${v.id} 영상 · 표지 파일이 있다`);
  const noHelp = v.menus.filter((m) => m !== "HOME" && !(HELP_DETAIL[m] || []).length);
  ok(!noHelp.length, `${v.id} 영상 메뉴에 도움말 설명이 있다${noHelp.length ? ` (없음: ${noHelp.join(", ")})` : ""}`);
}
for (const ep of Object.keys(VIDEO_SINCE)) ok(ids.has(ep), `바뀐 점 ${ep} 이 영상 목록에 있다`);
for (const v of HELP_VIDEOS) {
  const list = videoChanges(v);
  if (!list.length) continue;
  const rec = videoRecorded(v);
  ok(list.every((x) => isDate(x.d) && x.d >= rec), `${v.id} 바뀐 점 날짜가 촬영일(${rec}) 뒤다`);
  ok(list.every((x, i) => i === 0 || list[i - 1].d >= x.d), `${v.id} 바뀐 점이 최신부터 줄 서 있다`);
  ok(list.every((x) => typeof x.t === "string" && x.t.trim() && x.t.length <= 90), `${v.id} 바뀐 점 한 줄이 90자 안이다`);
  ok(new Set(list.map((x) => x.t)).size === list.length, `${v.id} 바뀐 점이 겹치지 않는다`);
}
if (fails) { console.error(`\n${fails}개 실패 — src/helpVideos.js 를 확인해 주세요`); process.exit(1); }
console.log("\nhelpVideos: 모두 통과");
