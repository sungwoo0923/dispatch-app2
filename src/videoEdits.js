// ======================= src/videoEdits.js =======================
// 🎬 2026-11-18 영상 작업실 › 교육 영상 고치기 — 수정 내용(edits)을 영상 타임라인(public/videos/edit/epXX/tl.json)에 입히는 계산
//  ⚠ 화면 · 파이어베이스 없이 순수 계산만(node 테스트 scripts/videoEdits.test.mjs · 오프라인 영상 다시 만들기에서도 그대로 쓴다)
//  저장 위치: Firestore siteConfig/videoEdits { ep01: edits, ep02: edits, … }
//  edits = { ep, items: { [key]: { b?, c?, dt?, t0?, t1?, text?, off? } }, notes: { [seg]: "문제 메모" }, updatedAt, updatedBy }
//  key(배열 순서가 아니라 바뀌지 않는 이름):
//   강조 상자 hl:{seg}:{name} · 카메라 cam:{seg}:{kf} · 화면 바뀜 ev:{seg}:{id} · 자막 cap:{seg}:{n}(seg 없는 인트로 · 정리 자막은 cap:_:{순번})
//   단축키 key:{seg}:{k} · 클릭 click:{seg}:{kf} · 팁 패널 panel:{seg}
//  적용 규칙
//   · ev dt  : 그 화면이 바뀌는 시각을 dt초 옮기고, 같은 seg+kf 인 클릭 · 카메라 · (그 클릭으로 가는) 커서 움직임도 같이 옮긴다
//   · click dt: 그 클릭과 그 클릭으로 가는 커서 움직임만 옮긴다
//   · hl b/t0/t1 · cam c · cap text/t0/t1 · key t0/t1 · panel t0/t1(줄 나타나는 시각도 같이) · off → 그 항목을 뺀다
//   · 시간이 바뀐 목록(events · cams · cursor · clicks)은 시간 순으로 다시 줄 세운다(같은 시각이면 원래 순서 — 결과가 늘 같다)

export const EDIT_KINDS = ["hl", "cam", "ev", "cap", "key", "click", "panel"];
export const SCREEN_W = 1600, SCREEN_H = 900;
export const CAM_RATIO = SCREEN_W / SCREEN_H;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const rect = (r) => (Array.isArray(r) && r.length === 4 && r.every((v) => Number.isFinite(v)) ? r.map((v) => Math.round(v * 10) / 10) : null);

// 항목 하나의 key — capIdx: seg 없는 자막의 순번(captionKeys 가 채워 준다)
export function editKey(kind, item, capIdx = 0) {
  if (!item) return "";
  switch (kind) {
    case "hl": return `hl:${item.seg}:${item.name}`;
    case "cam": return `cam:${item.seg}:${item.kf}`;
    case "ev": return `ev:${item.seg}:${item.id}`;
    case "cap": return item.seg != null && item.n != null ? `cap:${item.seg}:${item.n}` : `cap:_:${capIdx}`;
    case "key": return `key:${item.seg}:${item.k}`;
    case "click": return `click:${item.seg}:${item.kf}`;
    case "panel": return `panel:${item.seg}`;
    default: return "";
  }
}
// 자막 목록 → 각 자막의 key(seg 없는 자막은 등장 순번으로)
export function captionKeys(caps = []) {
  let i = 0;
  return caps.map((c) => (c.seg != null && c.n != null ? editKey("cap", c) : `cap:_:${i++}`));
}
// 타임라인 안 모든 항목의 key → [{ kind, key, item }]
export function listItems(T) {
  if (!T) return [];
  const out = [];
  const add = (kind, arr) => (arr || []).forEach((item) => out.push({ kind, key: editKey(kind, item), item }));
  add("ev", T.events); add("cam", T.cams); add("hl", T.hls); add("click", T.clicks); add("key", T.keys); add("panel", T.panels);
  const ck = captionKeys(T.caps || []);
  (T.caps || []).forEach((item, i) => out.push({ kind: "cap", key: ck[i], item }));
  return out;
}

const stableSortByT = (arr, tf) => arr.map((x, i) => [x, i]).sort((a, b) => tf(a[0]) - tf(b[0]) || a[1] - b[1]).map((p) => p[0]);
const hasItems = (edits) => !!edits && !!edits.items && Object.keys(edits.items).length > 0;
export const editCount = (edits) => (edits?.items ? Object.keys(edits.items).length : 0);
export const noteCount = (edits) => (edits?.notes ? Object.values(edits.notes).filter((s) => String(s || "").trim()).length : 0);
export { hasItems as hasEdits };

// 커서 움직임 m 이 클릭 c 로 가는 움직임인지(도착 지점이 같고 클릭 직전 0.15초 안에 끝남)
const cursorFor = (m, c) => Array.isArray(m.to) && m.to[0] === c.at[0] && m.to[1] === c.at[1] && c.t - m.t1 >= -0.001 && c.t - m.t1 < 0.15;

export function applyEdits(T, edits) {
  if (!T) return T;
  const items = (edits && edits.items) || {};
  const get = (k) => items[k] || null;
  const R = { ...T };
  // ── 화면 바뀜(event) 시각 이동 → 같은 seg+kf 클릭 · 카메라 · 커서도 같이
  const shift = new Map(); // `${seg}|${kf}` → dt
  let events = (T.events || []).map((e) => {
    const ed = get(editKey("ev", e)); const dt = num(ed?.dt);
    if (!dt) return { ...e };
    shift.set(`${e.seg}|${e.id}`, dt);
    return { ...e, t: (e.t + dt) };
  });
  // 첫 화면은 빼지 않는다(화면이 하나도 없으면 영상이 깨진다)
  events = events.filter((e, i) => i === 0 || !get(editKey("ev", e))?.off);
  R.events = stableSortByT(events, (e) => e.t);

  const clickShift = new Map(); // 원래 클릭 객체 → dt
  const clicks = (T.clicks || []).map((c) => {
    const ed = get(editKey("click", c));
    const dt = (shift.get(`${c.seg}|${c.kf}`) || 0) + (num(ed?.dt) || 0);
    if (dt) clickShift.set(c, dt);
    return { c, out: dt ? { ...c, t: (c.t + dt) } : { ...c }, off: !!ed?.off };
  });
  // 커서: 시간이 옮겨진 클릭으로 가는 움직임은 같이 옮긴다
  R.cursor = stableSortByT((T.cursor || []).map((m) => {
    for (const [c, dt] of clickShift) if (cursorFor(m, c)) return { ...m, t0: (m.t0 + dt), t1: (m.t1 + dt) };
    return { ...m };
  }), (m) => m.t0);
  R.clicks = stableSortByT(clicks.filter((x) => !x.off).map((x) => x.out), (c) => c.t);

  // ── 카메라
  let cams = (T.cams || []).map((k) => {
    const ed = get(editKey("cam", k)); const dt = shift.get(`${k.seg}|${k.kf}`) || 0;
    const o = { ...k, c: rect(ed?.c) || k.c.slice() };
    if (dt) o.t = (k.t + dt);
    return { o, off: !!ed?.off };
  });
  cams = cams.filter((x) => !x.off).map((x) => x.o);
  if (!cams.length) cams = [{ t: 0, c: [0, 0, SCREEN_W, SCREEN_H], d: 0.01, seg: "_", kf: "_" }];
  R.cams = stableSortByT(cams, (k) => k.t);

  // ── 강조 상자
  R.hls = (T.hls || []).filter((h) => !get(editKey("hl", h))?.off).map((h) => {
    const ed = get(editKey("hl", h)); const o = { ...h, b: h.b.slice() };
    if (ed) { const b = rect(ed.b); if (b) o.b = b; if (num(ed.t0) != null) o.t0 = ed.t0; if (num(ed.t1) != null) o.t1 = ed.t1; }
    if (o.t1 < o.t0) o.t1 = o.t0;
    return o;
  });
  // ── 자막
  const ck = captionKeys(T.caps || []);
  R.caps = (T.caps || []).map((c, i) => [c, items[ck[i]]]).filter(([, ed]) => !ed?.off).map(([c, ed]) => {
    const o = { ...c };
    if (ed) { if (typeof ed.text === "string") o.text = ed.text; if (num(ed.t0) != null) o.t0 = ed.t0; if (num(ed.t1) != null) o.t1 = ed.t1; }
    if (o.t1 < o.t0) o.t1 = o.t0;
    return o;
  });
  // ── 단축키 표시
  R.keys = (T.keys || []).filter((k) => !get(editKey("key", k))?.off).map((k) => {
    const ed = get(editKey("key", k)); const o = { ...k };
    if (ed) { if (num(ed.t0) != null) o.t0 = ed.t0; if (num(ed.t1) != null) o.t1 = ed.t1; if (typeof ed.text === "string" && ed.text.trim()) o.label = ed.text; }
    return o;
  });
  // ── 팁 패널
  R.panels = (T.panels || []).filter((p) => !get(editKey("panel", p))?.off).map((p) => {
    const ed = get(editKey("panel", p)); const o = { ...p };
    if (ed) {
      if (num(ed.t0) != null) { const d = ed.t0 - p.t0; o.t0 = ed.t0; if (num(p.vt) != null) o.vt = (p.vt + d); }
      if (num(ed.t1) != null) o.t1 = ed.t1;
    }
    return o;
  });
  return R;
}

// 한 항목 수정 넣기(빈 수정이면 지운다) — 새 edits 객체를 돌려준다
export function setItem(edits, key, patch) {
  const base = edits || { items: {}, notes: {} };
  const cur = { ...(base.items?.[key] || {}), ...patch };
  for (const k of Object.keys(cur)) if (cur[k] === undefined || cur[k] === null || (k === "dt" && !cur[k]) || (k === "off" && !cur[k])) delete cur[k];
  const items = { ...(base.items || {}) };
  if (Object.keys(cur).length) items[key] = cur; else delete items[key];
  return { ...base, items };
}
export function setNote(edits, seg, text) {
  const base = edits || { items: {}, notes: {} };
  const notes = { ...(base.notes || {}) };
  if (String(text || "").trim()) notes[seg] = text; else delete notes[seg];
  return { ...base, notes };
}

// 원래 항목에 수정을 입힌 값(꺼진 항목도 보여 주려고 — 화면 목록용) → { t0, t1, t, b, c, text, off, edited }
export function effItem(T, edits, kind, item, key) {
  const items = edits?.items || {}; const ed = items[key] || {};
  const evDt = (seg, id) => num(items[`ev:${seg}:${id}`]?.dt) || 0;
  const o = { off: !!ed.off, edited: !!items[key], dt: num(ed.dt) || 0 };
  switch (kind) {
    case "hl": o.b = rect(ed.b) || item.b; o.t0 = num(ed.t0) ?? item.t0; o.t1 = num(ed.t1) ?? item.t1; break;
    case "cap": o.text = typeof ed.text === "string" ? ed.text : item.text; o.t0 = num(ed.t0) ?? item.t0; o.t1 = num(ed.t1) ?? item.t1; break;
    case "key": o.text = typeof ed.text === "string" && ed.text.trim() ? ed.text : item.label; o.t0 = num(ed.t0) ?? item.t0; o.t1 = num(ed.t1) ?? item.t1; break;
    case "panel": o.text = item.title; o.t0 = num(ed.t0) ?? item.t0; o.t1 = num(ed.t1) ?? item.t1; break;
    case "ev": o.t = item.t + (num(ed.dt) || 0); o.t0 = o.t; o.t1 = o.t; break;
    case "click": o.t = item.t + evDt(item.seg, item.kf) + (num(ed.dt) || 0); o.t0 = o.t; o.t1 = o.t + 0.55; break;
    case "cam": o.c = rect(ed.c) || item.c; o.t = item.t + evDt(item.seg, item.kf); o.t0 = o.t; o.t1 = o.t + item.d; break;
    default: break;
  }
  return o;
}

// ── 카메라 계산(public/videos/edit/comp.html 의 camAt2 · toScreen 과 똑같이)
export const WIN = { x: 96, y: 22, w: 1728, h: 972 }; // 1920x1080 화면 안 앱 창 위치
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export function camAt(T, t) {
  const cams = T?.cams || []; if (!cams.length) return [0, 0, SCREEN_W, SCREEN_H];
  let cur = cams[0].c.slice();
  for (const k of cams) {
    if (t < k.t) break;
    const p = ease((t - k.t) / k.d); const from = cur.slice();
    cur = k.c.map((v, i) => from[i] + (v - from[i]) * p);
    if (p < 1) return cur;
  }
  return cur;
}
// 페이지 좌표 → 1920x1080 화면 좌표
export function pageToFrame(cam, x, y) { const s = WIN.w / cam[2]; return [WIN.x + (x - cam[0]) * s, WIN.y + (y - cam[1]) * s]; }
export function frameToPage(cam, fx, fy) { const s = WIN.w / cam[2]; return [(fx - WIN.x) / s + cam[0], (fy - WIN.y) / s + cam[1]]; }
// 지금 시각에 보이는 화면(event)
export function eventAt(T, t) {
  const ev = T?.events || []; let cur = ev[0] || null;
  for (const e of ev) { if (e.t <= t) cur = e; else break; }
  return cur;
}
export function segAt(T, t) { return (T?.segs || []).find((s) => t >= s.t0 && t < s.t1) || null; }
// 지금 시각의 카메라 키(가장 최근에 시작한 것)
export function camKeyAt(T, t) { let cur = T?.cams?.[0] || null; for (const k of T?.cams || []) { if (k.t <= t) cur = k; else break; } return cur; }
// 카메라 틀은 화면 비율(16:9)을 지킨다 · 화면 밖으로 못 나가게
export function fitCam(c, sy = 0) {
  let [x, y, w] = c; w = Math.max(320, Math.min(SCREEN_W, w)); const h = w / CAM_RATIO;
  x = Math.max(0, Math.min(SCREEN_W - w, x)); y = Math.max(sy, Math.min(sy + SCREEN_H - h, y));
  return [x, y, w, h].map((v) => Math.round(v * 10) / 10);
}
