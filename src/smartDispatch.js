// src/smartDispatch.js — 배차를 빠르게: 한 줄 입력 해석 · 지난 노선 찾기 · 기사 추천 · 오늘 할 일 (화면 없는 계산만)
// ⭐ 2026-11-13 — 모든 운송사 공용. 지난 오더에서 "실제로 있었던 것"만 골라 주므로 추측으로 채우지 않는다.
import { isUnassignedOrder } from "./unassignedRule.js";

const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
const nk = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
const CANCELED = ["취소", "배차취소", "오더취소", "취소됨"];
const isCanceled = (r) => CANCELED.includes(String(r?.상태 || "").trim()) || CANCELED.includes(String(r?.배차상태 || "").trim()) || r?.지급방식 === "취소";

export const VEHICLE_WORDS = ["윙바디", "카고", "탑차", "탑", "냉장", "냉동", "리프트", "라보", "다마스", "오토바이", "초장축", "츄레라", "트레일러", "평판"];

// "내일 대한 평택 5톤 35만" → { date, dateWord, ton, kind, fare, words:["대한","평택"] }
export function parseQuickLine(text, today = ymd(new Date())) {
  const out = { date: "", dateWord: "", ton: "", kind: "", fare: 0, words: [] };
  for (const raw of String(text || "").trim().split(/\s+/).filter(Boolean)) {
    const t = raw.replace(/[,]/g, "");
    let m;
    if (t === "오늘") { out.date = today; out.dateWord = t; continue; }
    if (t === "내일") { out.date = addDays(today, 1); out.dateWord = t; continue; }
    if (t === "모레") { out.date = addDays(today, 2); out.dateWord = t; continue; }
    if ((m = t.match(/^(\d{1,2})[/.\-](\d{1,2})$/)) || (m = t.match(/^(\d{1,2})월(\d{1,2})일?$/))) {
      const mo = +m[1], da = +m[2];
      if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
        let y = +today.slice(0, 4);
        let d = `${y}-${pad(mo)}-${pad(da)}`;
        if (d < addDays(today, -60)) d = `${y + 1}-${pad(mo)}-${pad(da)}`; // 연말에 1월을 치면 내년
        out.date = d; out.dateWord = `${mo}/${da}`; continue;
      }
    }
    if ((m = t.match(/^(\d{1,2})일$/))) {
      const da = +m[1];
      if (da >= 1 && da <= 31) {
        let d = `${today.slice(0, 8)}${pad(da)}`;
        if (d < today) { const n = new Date(`${today.slice(0, 8)}01T00:00:00`); n.setMonth(n.getMonth() + 1); d = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(da)}`; }
        out.date = d; out.dateWord = `${da}일`; continue;
      }
    }
    if ((m = t.match(/^(\d+(?:\.\d+)?)(톤|t)$/i))) { out.ton = `${m[1]}톤`; continue; }
    if ((m = t.match(/^(\d+(?:\.\d+)?)만원?$/))) { out.fare = Math.round(parseFloat(m[1]) * 10000); continue; }
    if ((m = t.match(/^(\d{5,8})원$/))) { out.fare = +m[1]; continue; }
    const v = VEHICLE_WORDS.find((w) => w === t);
    if (v) { out.kind = v === "탑" ? "탑차" : v; continue; }
    out.words.push(raw);
  }
  return out;
}

// 지난 오더 → 노선 묶음(거래처+상차지+하차지). 가장 최근 오더를 대표로 둔다.
export function buildRoutes(rows, today = ymd(new Date())) {
  const map = new Map();
  for (const r of rows || []) {
    if (!r || isCanceled(r) || r.배차표Id) continue;
    const a = String(r.상차지명 || "").trim(), b = String(r.하차지명 || "").trim();
    if (!a || !b) continue;
    const c = String(r.거래처명 || "").trim();
    const k = `${nk(c)}|${nk(a)}|${nk(b)}`;
    const d = String(r.상차일 || "");
    let e = map.get(k);
    if (!e) { e = { key: k, client: c, from: a, to: b, count: 0, last: "", row: null, hay: nk(`${c} ${a} ${b} ${r.상차지주소 || ""} ${r.하차지주소 || ""}`) }; map.set(k, e); }
    e.count += 1;
    if (!e.row) e.row = r;
    if (d <= today && d >= e.last) { e.last = d; e.row = r; } // 미리 만들어 둔 앞날 오더는 "최근"으로 치지 않는다
  }
  return [...map.values()];
}

// 낱말이 모두 들어 있는 노선만, 많이·최근에 한 순서로
export function findRoutes(routes, words, today = ymd(new Date()), limit = 6) {
  const ws = (words || []).map(nk).filter(Boolean);
  if (!ws.length) return [];
  const out = [];
  for (const e of routes || []) {
    if (!ws.every((w) => e.hay.includes(w))) continue;
    const head = nk(`${e.client}${e.from}${e.to}`);
    const nameHit = ws.filter((w) => head.includes(w)).length; // 주소보다 이름에 맞은 것 우선
    const days = e.last ? Math.max(0, (new Date(today) - new Date(e.last)) / 86400000) : 999;
    out.push({ ...e, score: nameHit * 100 + Math.min(e.count, 50) * 2 - Math.min(days, 365) / 10 });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}

// 미배차 오더 한 건 → 같은 구간을 뛰어 본 기사(많이·최근 순). busy = 그날 이미 배차된 차량번호 모음
export function suggestDrivers(order, rows, { limit = 3, busy = null, today = "9999" } = {}) {
  if (!order) return [];
  const a = nk(order.상차지명), b = nk(order.하차지명), c = nk(order.거래처명);
  if (!a && !b) return [];
  const map = new Map();
  for (const r of rows || []) {
    const car = String(r?.차량번호 || "").replace(/\s+/g, "");
    if (!car || !String(r.이름 || "").trim() || isCanceled(r)) continue;
    if (r._id && r._id === order._id) continue;
    const ra = nk(r.상차지명), rb = nk(r.하차지명);
    let w = 0;
    if (a && b && ra === a && rb === b) w = 3;              // 같은 상차지 → 같은 하차지
    else if (b && rb === b && c && nk(r.거래처명) === c) w = 2; // 같은 거래처의 같은 하차지
    else if (a && ra === a && c && nk(r.거래처명) === c) w = 1; // 같은 거래처의 같은 상차지
    if (!w) continue;
    let e = map.get(car);
    if (!e) { e = { 차량번호: String(r.차량번호).trim(), 이름: String(r.이름).trim(), 전화번호: r.전화번호 || "", same: 0, near: 0, last: "", ton: r.차량톤수 || "", kind: r.차량종류 || "" }; map.set(car, e); }
    if (w === 3) e.same += 1; else e.near += 1;
    const d = String(r.상차일 || "");
    if (d <= today && d >= e.last) { e.last = d; e.이름 = String(r.이름).trim(); if (r.전화번호) e.전화번호 = r.전화번호; }
  }
  const list = [...map.values()].map((e) => ({ ...e, busy: !!busy?.has?.(e.차량번호.replace(/\s+/g, "")), score: e.same * 10 + e.near * 2 }));
  return list.sort((x, y) => (x.busy - y.busy) || (y.score - x.score) || String(y.last).localeCompare(String(x.last))).slice(0, limit);
}

// 날짜별 이미 배차된 차량 → Map(상차일 → Set(차량번호))
export function busyByDate(rows) {
  const m = new Map();
  for (const r of rows || []) {
    const car = String(r?.차량번호 || "").replace(/\s+/g, ""); const d = String(r?.상차일 || "");
    if (!car || !d || isCanceled(r)) continue;
    if (!m.has(d)) m.set(d, new Set());
    m.get(d).add(car);
  }
  return m;
}

// 홈 "오늘 할 일" 숫자
export function todayTodo(rows, today = ymd(new Date())) {
  const tomorrow = addDays(today, 1), from = addDays(today, -30);
  const t = { unassigned: 0, unassignedToday: 0, overdue: 0, today: 0, todayDone: 0, tomorrow: 0, tomorrowOpen: 0, noFare: 0, noDriverFare: 0 };
  const seen = new Set();
  for (const r of rows || []) {
    if (!r || r.배차표Id) continue;
    const k = `${r.__col || ""}/${r._id || ""}`;
    if (r._id) { if (seen.has(k)) continue; seen.add(k); }
    const d = String(r.상차일 || "");
    const un = isUnassignedOrder(r);
    if (un) { t.unassigned += 1; if (d === today) t.unassignedToday += 1; if (d && d < today) t.overdue += 1; }
    if (isCanceled(r)) continue;
    if (d === today) { t.today += 1; if (!un && String(r.차량번호 || "").trim()) t.todayDone += 1; }
    if (d === tomorrow) { t.tomorrow += 1; if (un) t.tomorrowOpen += 1; }
    if (!un && d >= from && d <= today && String(r.차량번호 || "").trim()) {
      if (!(parseInt(String(r.청구운임 || "").replace(/[^\d-]/g, ""), 10) > 0) && r.지급방식 !== "착불") t.noFare += 1;
      if (!(parseInt(String(r.기사운임 || "").replace(/[^\d-]/g, ""), 10) > 0)) t.noDriverFare += 1;
    }
  }
  return t;
}

// 추천·찾기에 필요한 칸만 남긴다(13개월치를 통째로 들고 있지 않게)
const KEEP = ["_id", "__col", "거래처명", "청구사업자", "상차지명", "상차지주소", "상차지담당자", "상차지담당자번호", "하차지명", "하차지주소", "하차지담당자", "하차지담당자번호",
  "경유상차목록", "경유하차목록", "경유지_상차", "경유지_하차", "화물내용", "차량종류", "차량톤수", "차량번호", "이름", "전화번호", "상차방법", "하차방법", "상차일", "하차일",
  "상차시간", "상차시간기준", "하차시간", "하차시간기준", "지급방식", "배차방식", "메모", "전달사항", "전달사항고정", "운행유형", "긴급", "운임보정", "운임구분", "상태", "배차상태", "배차표Id"];
export const slimOrder = (r) => { const o = {}; for (const k of KEEP) if (r[k] !== undefined && r[k] !== "" && r[k] !== null) o[k] = r[k]; return o; };
