// ======================= src/copySimple.js =======================
// 📋 2026-11-13 기사복사 "간단 목록" — 업체에 짧게 보내는 문구(오더 여러 건을 한 번에)
//  예)  11/13 에이제이-베베숲 평택 야상
//       대전88아8987  김영관  010-5251-7468
//       충북84아1177  이준희  010-6349-7054
//  · 머리말 한 줄(날짜 · 상차지-하차지 · 구분) 아래에 기사 줄을 이어 붙인다. 날짜 · 구간 · 구분이 같은 오더는 한 묶음
//  · 구분은 시간으로 자동 판단(dayTag) — 야상: 전날 18시 이후(또는 새벽 5시 전) 상차 · 당착: 상차한 날 도착 · 익착: 다음 날 도착
//  · 문구 틀은 회사마다 바꿀 수 있다: companySettings/{회사}.copyTemplates.simple = { header, line }
//  ⚠ 다른 파일을 가져오지 않는다(테스트에서 그대로 읽음)
export const SIMPLE_DEFAULT = { header: "{날짜} {상차지}-{하차지} {구분}", line: "{차량번호}  {기사명}  {연락처}" };
export const SIMPLE_VARS = [["날짜", "월/일 (야상은 도착하는 날)"], ["상차지", "상차지명"], ["하차지", "하차지명"], ["구분", "야상 · 당착 · 익착 (시간으로 자동)"], ["거래처", "거래처명"], ["건수", "그 묶음의 오더 수"],
  ["차량번호", "차량번호"], ["기사명", "기사 이름"], ["연락처", "기사 연락처"], ["톤수", "차량톤수"], ["차종", "차량종류"], ["상차시간", "상차시간"], ["하차시간", "하차시간"], ["운임", "청구운임"]];

const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? `${m[1]}-${m[2]}-${m[3]}` : ""; };
const md = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? `${Number(m[2])}/${Number(m[3])}` : ""; };
const dayDiff = (a, b) => { const A = Date.parse(`${ymd(a)}T00:00:00Z`), B = Date.parse(`${ymd(b)}T00:00:00Z`); return Number.isFinite(A) && Number.isFinite(B) ? Math.round((B - A) / 86400000) : null; };
// "18:30" · "오후 6시 30분" · "오후 6:30" → 시(0~23). 못 읽으면 null
export function hourOf(t) {
  const s = String(t || "").trim();
  if (!s) return null;
  let m = /(오전|오후)\s*(\d{1,2})\s*(?:시|:)/.exec(s);
  if (m) { let h = Number(m[2]) % 12; if (m[1] === "오후") h += 12; return h; }
  m = /^(\d{1,2})\s*(?::|시)/.exec(s);
  return m ? Number(m[1]) % 24 : null;
}
// 시간으로 자동 판단 — 야상 / 당착 / 익착 / "M/D착"
export function dayTag(o) {
  const up = ymd(o?.상차일), down = ymd(o?.하차일);
  const d = up && down ? dayDiff(up, down) : null;
  const h = hourOf(o?.상차시간);
  if (d != null && d >= 1 && h != null && (h >= 18 || h < 5)) return "야상";
  if (d === 0) return "당착";
  if (d === 1) return "익착";
  if (d != null && d > 1) return `${md(down)}착`;
  return "";
}
// 머리말에 쓰는 날짜 — 야상은 도착하는 날(하차일), 그 밖에는 상차일
export const headDate = (o) => (dayTag(o) === "야상" ? md(o?.하차일) : md(o?.상차일 || o?.하차일));
const fill = (tpl, vars) => String(tpl || "").replace(/\{([^{}\s]+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? "") : m)).replace(/[ \t]+$/gm, "").replace(/ {3,}/g, "  ");
const fmtPhone = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : String(p || ""); };
const won = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) && n ? n.toLocaleString("ko-KR") : ""; };
export function simpleVars(o) {
  return {
    날짜: headDate(o), 상차지: String(o?.상차지명 || "").trim(), 하차지: String(o?.하차지명 || "").trim(), 구분: dayTag(o), 거래처: String(o?.거래처명 || "").trim(),
    차량번호: String(o?.차량번호 || "").trim() || "(미배차)", 기사명: String(o?.이름 || o?.기사명 || "").trim(), 연락처: fmtPhone(o?.전화번호),
    톤수: String(o?.차량톤수 || "").trim(), 차종: String(o?.차량종류 || "").trim(), 상차시간: String(o?.상차시간 || "").trim(), 하차시간: String(o?.하차시간 || "").trim(), 운임: won(o?.청구운임),
  };
}
// orders: 고른 오더(고른 순서) · tpl: { header, line } (비면 기본 틀)
export function buildSimpleList(orders, tpl = {}) {
  const header = typeof tpl?.header === "string" && tpl.header.trim() ? tpl.header : SIMPLE_DEFAULT.header;
  const line = typeof tpl?.line === "string" && tpl.line.trim() ? tpl.line : SIMPLE_DEFAULT.line;
  const groups = [];
  (orders || []).filter(Boolean).forEach((o) => {
    const v = simpleVars(o);
    const key = [v.날짜, v.상차지, v.하차지, v.구분].join("|");
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, head: v, lines: [] }; groups.push(g); }
    g.lines.push(v);
  });
  return groups.map((g) => [fill(header, { ...g.head, 건수: g.lines.length }).trim(), ...g.lines.map((v) => fill(line, v).trim())].join("\n")).join("\n\n");
}
