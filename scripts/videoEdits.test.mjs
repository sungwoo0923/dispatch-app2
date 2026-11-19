// 교육 영상 고치기 — 수정 내용 입히기 검사: node scripts/videoEdits.test.mjs
import fs from "fs";
import assert from "assert/strict";
import { applyEdits, editKey, listItems, setItem, setNote, camAt, pageToFrame, frameToPage, fitCam, editCount } from "../src/videoEdits.js";

const read = (ep) => JSON.parse(fs.readFileSync(new URL(`../public/videos/edit/${ep}/tl.json`, import.meta.url), "utf8"));
let n = 0; const ok = (name, fn) => { fn(); n++; console.log("✓", name); };

// 1) 14편 모두 key 가 겹치지 않고, 수정 없으면 결과가 원본과 같다
for (let i = 1; i <= 14; i++) {
  const ep = `ep${String(i).padStart(2, "0")}`; const T = read(ep);
  ok(`${ep} key 가 겹치지 않는다`, () => {
    const keys = listItems(T).map((x) => x.key);
    assert.equal(new Set(keys).size, keys.length, keys.filter((k, j) => keys.indexOf(k) !== j).join(","));
  });
  ok(`${ep} 수정 없으면 그대로`, () => assert.deepEqual(applyEdits(T, { items: {} }), T));
}

const T = read("ep02");
ok("원본을 바꾸지 않는다", () => {
  const before = JSON.stringify(T);
  const ev = T.events[3]; const h = T.hls[0];
  applyEdits(T, { items: { [editKey("ev", ev)]: { dt: 1.5 }, [editKey("hl", h)]: { b: [1, 2, 3, 4] } } });
  assert.equal(JSON.stringify(T), before);
});
ok("화면 바뀜 시각을 옮기면 같은 장면 클릭 · 카메라 · 커서도 같이 옮겨진다", () => {
  const ev = T.events.find((e) => T.clicks.some((c) => c.seg === e.seg && c.kf === e.id));
  const click = T.clicks.find((c) => c.seg === ev.seg && c.kf === ev.id);
  const cur = T.cursor.find((m) => m.to[0] === click.at[0] && m.to[1] === click.at[1] && click.t - m.t1 >= 0 && click.t - m.t1 < 0.15);
  const R = applyEdits(T, { items: { [editKey("ev", ev)]: { dt: 0.7 } } });
  const ev2 = R.events.find((e) => e.seg === ev.seg && e.id === ev.id);
  assert.ok(Math.abs(ev2.t - (ev.t + 0.7)) < 1e-6);
  const c2 = R.clicks.find((c) => c.seg === click.seg && c.kf === click.kf);
  assert.ok(Math.abs(c2.t - (click.t + 0.7)) < 1e-6);
  if (cur) assert.ok(R.cursor.some((m) => Math.abs(m.t0 - (cur.t0 + 0.7)) < 1e-6 && Math.abs(m.t1 - (cur.t1 + 0.7)) < 1e-6));
  const cam = T.cams.find((k) => k.seg === ev.seg && k.kf === ev.id);
  if (cam) assert.ok(R.cams.some((k) => k.seg === cam.seg && k.kf === cam.kf && Math.abs(k.t - (cam.t + 0.7)) < 1e-6));
  for (const L of ["events", "clicks", "cams"]) for (let i = 1; i < R[L].length; i++) assert.ok(R[L][i].t >= R[L][i - 1].t, `${L} 시간 순`);
});
ok("강조 상자 위치 · 시간 · 끄기", () => {
  const h = T.hls[0]; const k = editKey("hl", h);
  let R = applyEdits(T, { items: { [k]: { b: [10, 20, 300, 40], t0: 5, t1: 9 } } });
  const h2 = R.hls.find((x) => x.name === h.name && x.seg === h.seg);
  assert.deepEqual(h2.b, [10, 20, 300, 40]); assert.equal(h2.t0, 5); assert.equal(h2.t1, 9);
  R = applyEdits(T, { items: { [k]: { off: true } } });
  assert.equal(R.hls.length, T.hls.length - 1);
});
ok("카메라 틀 바꾸기 · 자막 글 바꾸기 · 클릭 · 단축키 · 패널 끄기", () => {
  const cam = T.cams[1]; const cap = T.caps.find((c) => c.seg); const cl = T.clicks[0]; const key = T.keys[0]; const p = T.panels[0];
  const R = applyEdits(T, { items: {
    [editKey("cam", cam)]: { c: [100, 50, 800, 450] }, [editKey("cap", cap)]: { text: "고친 자막" },
    [editKey("click", cl)]: { off: true }, [editKey("key", key)]: { off: true }, [editKey("panel", p)]: { off: true } } });
  assert.deepEqual(R.cams.find((k) => k.seg === cam.seg && k.kf === cam.kf).c, [100, 50, 800, 450]);
  assert.ok(R.caps.some((c) => c.text === "고친 자막"));
  assert.equal(R.clicks.length, T.clicks.length - 1); assert.equal(R.keys.length, T.keys.length - 1); assert.equal(R.panels.length, T.panels.length - 1);
});
ok("seg 없는 인트로 자막도 고칠 수 있다", () => {
  const R = applyEdits(T, { items: { "cap:_:0": { text: "첫 자막" } } });
  assert.equal(R.caps.find((c) => c.seg == null).text, "첫 자막");
});
ok("첫 화면은 끌 수 없고 카메라를 다 꺼도 깨지지 않는다", () => {
  const items = {}; T.cams.forEach((c) => { items[editKey("cam", c)] = { off: true }; }); items[editKey("ev", T.events[0])] = { off: true };
  const R = applyEdits(T, { items });
  assert.equal(R.events[0].file, T.events[0].file); assert.equal(R.cams.length, 1);
});
ok("같은 입력이면 늘 같은 결과", () => {
  const e = { items: { [editKey("ev", T.events[5])]: { dt: -2 }, [editKey("ev", T.events[6])]: { dt: 3 } } };
  assert.equal(JSON.stringify(applyEdits(T, e)), JSON.stringify(applyEdits(T, e)));
});
ok("setItem · setNote 는 빈 수정을 지운다", () => {
  let e = setItem(null, "hl:s1:a", { off: true }); assert.equal(editCount(e), 1);
  e = setItem(e, "hl:s1:a", { off: false }); assert.equal(editCount(e), 0);
  e = setNote(e, "s1", "글자가 잘려요"); assert.equal(e.notes.s1, "글자가 잘려요");
  e = setNote(e, "s1", "  "); assert.equal(e.notes.s1, undefined);
});
ok("카메라 계산이 comp.html 과 같은 식 · 좌표 왕복", () => {
  const c = camAt(T, 0); assert.deepEqual(c, T.cams[0].c);
  const [fx, fy] = pageToFrame([100, 50, 800, 450], 300, 200); const [x, y] = frameToPage([100, 50, 800, 450], fx, fy);
  assert.ok(Math.abs(x - 300) < 1e-9 && Math.abs(y - 200) < 1e-9);
  const f = fitCam([1500, -20, 900, 1]); assert.ok(f[0] + f[2] <= 1600 && f[1] >= 0 && Math.abs(f[2] / f[3] - 16 / 9) < 0.01);
});
console.log(`\n${n}개 통과`);
