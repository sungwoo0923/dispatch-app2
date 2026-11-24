// ======================= functions/routePresetCore.mjs =======================
// ⭐ 2026-11-17 노선별 고정 특수운임 — 계산만 하는 부분(화면 · 서버 · 테스트 공용, import 없음)
//  예) 에이제이 → 트레이더스 칠곡 = 지게차비용 35,000원(늘) · 에이제이 → 에브리데이 여주 = 지게차비용 50,000원
//      어떤 노선 = 야상(야간 할증) +20,000원(야간 상차일 때만)
//
//  저장(화면이 씀): forkliftPresets/{회사__rt__거래처__상차지__하차지} — 예전 "상차지 기억"(forkliftPresets/{회사__거래처__상차지})과 같은 컬렉션
//   v2 문서 = { v: 2, kind: "route", 거래처명, 상차지명("" = 모든 상차지), 하차지명("" = 모든 하차지), 사용, items: [항목], 출처, updatedBy }
//     항목 = { 종류: "지게차"|"대기료"|"수작업"|"경유"|"할증"|"통행료"|"기타", 이름, 금액, 부담: "기사"|"회사"|"청구", 받는사람: "기사"|"외부"|"없음", 조건: "항상"|"야간", 메모,
//              지게차기사ID · 지게차기사명 · 지게차기사전화 · 지게차회사(지게차일 때만 · 선택) }
//   v1 문서(예전 상차지 기억) = { 거래처명, 상차지명, 지게차비용, 지게차부담, 지게차기사… } → 읽기만(자동 적용은 안 함 · 화면에서 켜면 v2로 저장)
//
//  찾는 순서(구체적인 것이 먼저 · 항목 칸마다 먼저 찾은 것이 이긴다)
//   ① 거래처 + 상차지 + 하차지 ② 거래처 + 하차지 ③ 거래처 + 상차지
//  자동 적용(planRoutePreset) — 오더의 특수운임 중 사람이 넣은 것은 건드리지 않는다
//   · 자동으로 넣은 항목은 auto: "routePreset"(지게차는 오더.지게차자동 = "routePreset") — 노선이 바뀌면 다시 계산해 빼거나 바꾼다
//   · 사람이 넣은 같은 종류 항목(지게차 · 할증 …)이 있으면 그 종류는 넣지 않는다 · 오더.특수운임수동 === true(팝업에서 직접 적용)면 아무것도 안 한다
//  야간 상차 = 상차시간 18:00 ~ 05:00 · 상차시간/하차시간 칸에 "야상" · 메모 꼬리표 "야상"(구글시트 입고시간 칸 "야상"을 가져온 오더)

export const AUTO = "routePreset";
export const COND = [{ key: "항상", label: "늘" }, { key: "야간", label: "야간 상차일 때만" }, { key: "익착", label: "익착일 때만" }, { key: "월착", label: "월착일 때만" }];
// ⭐ 2026-11-24 도착 구분 조건(익착 · 월착) · 경유 개소당 금액 — JY 에이제이 시트 규칙(야상 · 익착 · 월착 · 경유 · 계근비)
//  조건 "익착" = 상차 다음 날 하차(야간 상차 제외) · "월착" = 금요일 상차 → 월요일 하차(또는 메모 꼬리표 익착 · 월착)
//  단위 "개소" = 경유지 한 곳마다 금액(경유상차목록 + 경유하차목록 수만큼 곱한다 · 경유지가 없으면 넣지 않는다)
export const COND_LABEL = { 항상: "항상", 야간: "야간 상차일 때만", 익착: "익착일 때만", 월착: "월착일 때만" };
// src/forkliftCore.js SPECIAL_TYPES 의 기본값과 같게(서버는 src를 못 읽는다)
const TYPE_DEFAULT = { 지게차: { payee: "외부", mode: "기사" }, 대기료: { payee: "기사", mode: "청구" }, 수작업: { payee: "외부", mode: "청구" }, 경유: { payee: "기사", mode: "청구" }, 할증: { payee: "기사", mode: "청구" }, 통행료: { payee: "기사", mode: "청구" }, 기타: { payee: "기사", mode: "청구" } };
export const TYPE_LABEL = { 지게차: "지게차비용", 대기료: "대기료", 수작업: "수작업·인력", 경유: "경유", 할증: "야간·휴일 할증", 통행료: "통행료·주차비", 기타: "기타" };

export const num = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const cell = (v) => String(v ?? "").trim();
// 이름 견주기 — 띄어쓰기 · 기호 · 대소문자 무시("트레이더스 칠곡" = "트레이더스칠곡")
export const nk = (v) => cell(v).toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
const typeOf = (k) => (TYPE_DEFAULT[k] ? k : "기타");
export const itemPayee = (it) => {
  const t = typeOf(it?.종류);
  if (t === "지게차") return "외부";
  return ["기사", "외부", "없음"].includes(it?.받는사람) ? it.받는사람 : TYPE_DEFAULT[t].payee;
};
export const itemMode = (it) => {
  const t = typeOf(it?.종류);
  const m = ["기사", "회사", "청구"].includes(it?.부담) ? it.부담 : TYPE_DEFAULT[t].mode;
  if (t === "지게차") return m;
  const p = itemPayee(it);
  if (p === "없음") return m === "기사" ? "기사" : "청구"; // 🛠 2026-11-24 지급 없음 + 기사 차감 = 기사운임에서 빼고 회사 몫으로
  return p === "기사" && m === "기사" ? "청구" : m;
};
export const itemName = (it) => cell(it?.이름) || TYPE_LABEL[typeOf(it?.종류)];
// 같은 칸(slot) — 지게차는 하나, 기타는 이름별, 나머지는 종류별
export const slotOf = (it) => { const t = typeOf(it?.종류); return t === "지게차" ? "지게차" : t === "기타" ? `기타|${nk(it?.이름)}` : t; };
export const condOf = (it) => (COND_LABEL[it?.조건] && it.조건 !== "항상" ? it.조건 : "항상");
export const unitOf = (it) => (typeOf(it?.종류) === "경유" && it?.단위 === "개소" ? "개소" : "건");

// ── 야간 상차 ────────────────────────────────────────────
export function loadHour(t0) {
  const t = cell(t0);
  if (!t) return null;
  let m = /^(\d{1,2})\s*:\s*(\d{2})/.exec(t);
  if (m) return Number(m[1]) % 24;
  m = /(오전|오후|밤|새벽|저녁)?\s*(\d{1,2})\s*시/.exec(t);
  if (m) { let h = Number(m[2]); if ((m[1] === "오후" || m[1] === "저녁" || m[1] === "밤") && h < 12) h += 12; if (m[1] === "오전" && h === 12) h = 0; return h % 24; }
  return null;
}
export function isNightLoad(o) {
  const h = loadHour(o?.상차시간);
  if (h != null && (h >= 18 || h < 5)) return true;
  if (/야상|야간\s*상차/.test(`${cell(o?.상차시간)} ${cell(o?.하차시간)}`)) return true;
  // 구글시트에서 가져온 오더 — 입고시간 칸 "야상"은 메모 꼬리표로 남는다(carrierMigrateCore)
  return /(^|[\s·/,])야상($|[\s·/,+(])/.test(cell(o?.메모));
}

// ── 도착 구분(당착 · 야상 · 익착 · 월착) · 경유지 수 ─────────────
const ymd = (v) => { const m = /(\d{4})\D?(\d{1,2})\D?(\d{1,2})/.exec(cell(v)); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
export function arrivalOf(o) {
  if (isNightLoad(o)) return "야상";
  const memo = cell(o?.메모);
  if (/(^|[\s·/,])월착($|[\s·/,])/.test(memo)) return "월착";
  if (/(^|[\s·/,])익착($|[\s·/,])/.test(memo)) return "익착";
  const a = ymd(o?.상차일), b = ymd(o?.하차일);
  if (a == null || b == null || b <= a) return "당착";
  const d = Math.round((b - a) / 86400000);
  if (d === 3 && new Date(a).getUTCDay() === 5) return "월착";
  return d === 1 ? "익착" : "당착";
}
const condHit = (cond, o) => (cond === "야간" ? isNightLoad(o) : cond === "익착" || cond === "월착" ? arrivalOf(o) === cond : true);
const viaList = (v) => (Array.isArray(v) ? v.filter((x) => x && (typeof x !== "object" || cell(x.업체명) || cell(x.주소))) : []);
export function stopCount(o) {
  const up = viaList(o?.경유상차목록).length ? viaList(o?.경유상차목록) : viaList(o?.경유지_상차);
  const down = viaList(o?.경유하차목록).length ? viaList(o?.경유하차목록) : viaList(o?.경유지_하차);
  return up.length + down.length;
}

// ── 프리셋 문서 읽기 ─────────────────────────────────────
export function cleanItem(x = {}) {
  const t = typeOf(x.종류);
  const it = { 종류: t, 이름: t === "지게차" ? "" : cell(x.이름), 금액: Math.max(0, num(x.금액)), 부담: "", 받는사람: "", 조건: condOf(x), 메모: cell(x.메모) };
  if (unitOf(x) === "개소") it.단위 = "개소";
  it.받는사람 = itemPayee({ ...x, 종류: t }); it.부담 = itemMode({ ...x, 종류: t });
  if (t === "지게차") ["지게차기사ID", "지게차기사명", "지게차기사전화", "지게차회사"].forEach((k) => { if (cell(x[k])) it[k] = cell(x[k]); });
  return it;
}
// 저장된 문서 → { id, v, legacy, 거래처명, 상차지명, 하차지명, 사용, items }
export function parsePresetDoc(d = {}, id = "") {
  if (Number(d.v) >= 2 || d.kind === "route") {
    return { id, v: 2, legacy: false, 거래처명: cell(d.거래처명), 상차지명: cell(d.상차지명), 하차지명: cell(d.하차지명), 사용: d.사용 !== false,
      items: (Array.isArray(d.items) ? d.items : []).map(cleanItem).filter((x) => x.금액 > 0), 출처: cell(d.출처), 메모: cell(d.메모), updatedBy: cell(d.updatedBy), updatedAt: d.updatedAt || null };
  }
  // 예전 상차지 기억(거래처 + 상차지 → 지게차 기본값) — 자동 적용 안 함(사용 false)
  const amt = num(d.지게차비용);
  return { id, v: 1, legacy: true, 거래처명: cell(d.거래처명), 상차지명: cell(d.상차지명), 하차지명: "", 사용: false,
    items: amt > 0 ? [cleanItem({ 종류: "지게차", 금액: amt, 부담: d.지게차부담 || "기사", 지게차기사ID: d.지게차기사ID, 지게차기사명: d.지게차기사명, 지게차기사전화: d.지게차기사전화, 지게차회사: d.지게차회사 })] : [], 출처: "상차지 기억", 메모: "", updatedBy: "", updatedAt: d.updatedAt || null };
}
// 문서 ID — 회사 + rt + 거래처 + 상차지 + 하차지(공백 · 기호 무시)
export function presetDocId(co, p = {}) {
  const k = (v) => nk(v) || "_";
  return `${String(co || "_").replace(/[/#?[\]\s]/g, "_")}__rt__${k(p.거래처명)}__${k(p.상차지명)}__${k(p.하차지명)}`.slice(0, 600);
}
// 저장할 모양(v2)
export function presetDocData(p = {}) {
  return { v: 2, kind: "route", 거래처명: cell(p.거래처명), 상차지명: cell(p.상차지명), 하차지명: cell(p.하차지명), 사용: p.사용 !== false,
    items: (p.items || []).map(cleanItem).filter((x) => x.금액 > 0), 출처: cell(p.출처) || "직접", 메모: cell(p.메모) };
}
export function presetError(p = {}) {
  if (!cell(p.거래처명)) return "거래처를 입력해 주세요";
  if (!cell(p.상차지명) && !cell(p.하차지명)) return "상차지나 하차지 중 하나는 입력해 주세요";
  const items = (p.items || []).map(cleanItem).filter((x) => x.금액 > 0);
  if (!items.length) return "금액이 있는 항목을 하나 이상 넣어 주세요";
  const slots = items.map(slotOf);
  if (new Set(slots).size !== slots.length) return "같은 종류 항목이 두 번 들어 있어요";
  return "";
}
// 노선 단계 — 0 거래처+상차지+하차지 · 1 거래처+하차지 · 2 거래처+상차지
export const levelOf = (p) => (cell(p.상차지명) && cell(p.하차지명) ? 0 : cell(p.하차지명) ? 1 : 2);
export const LEVEL_LABEL = ["거래처 · 상차지 · 하차지", "거래처 · 하차지", "거래처 · 상차지"];
export const routeLabel = (p) => `${cell(p.거래처명) || "?"} · ${cell(p.상차지명) || "모든 상차지"} → ${cell(p.하차지명) || "모든 하차지"}`;

// ── 이 오더에 맞는 프리셋 항목 ──────────────────────────────
export function presetsFor(order, presets = []) {
  const c = nk(order?.거래처명), f = nk(order?.상차지명), t = nk(order?.하차지명);
  if (!c || (!f && !t)) return [];
  return (presets || []).filter((p) => p && p.사용 !== false && !p.legacy && nk(p.거래처명) === c
    && (cell(p.상차지명) || cell(p.하차지명))
    && (!cell(p.상차지명) || nk(p.상차지명) === f) && (!cell(p.하차지명) || nk(p.하차지명) === t))
    .sort((a, b) => levelOf(a) - levelOf(b));
}
export function matchRoutePreset(order, presets = []) {
  const night = isNightLoad(order);
  const stops = stopCount(order);
  const taken = new Set(); const items = []; const from = [];
  for (const p of presetsFor(order, presets)) {
    let used = false;
    for (const it0 of p.items || []) {
      const it = cleanItem(it0);
      if (!(it.금액 > 0) || taken.has(slotOf(it))) continue;
      if (!condHit(it.조건, order)) continue;
      if (it.단위 === "개소") { if (!stops) continue; taken.add(slotOf(it)); items.push({ ...it, 금액: it.금액 * stops, 메모: `경유 ${stops}곳 × ${it.금액.toLocaleString("ko-KR")}` }); used = true; continue; }
      taken.add(slotOf(it)); items.push(it); used = true;
    }
    if (used) from.push(p);
  }
  return { items, presets: from, night };
}

// ── 자동 적용 계획 ────────────────────────────────────────
//  → null(바꿀 것 없음) | { fork(지게차 칸 값 또는 null), forkAuto, items(지게차 외 · 자동 항목은 auto 표시), added, removed }
//  strict: 사람이(또는 시트가) 넣은 지게차 외 항목이 하나라도 있으면 지게차 외 자동 항목은 넣지 않는다(서버 · 구글시트 가져오기)
const sigOf = (it) => `${slotOf(it)}|${num(it.금액)}|${itemPayee(it)}|${itemMode(it)}|${cell(it.이름)}`;
export function planRoutePreset(order, presets = [], { strict = false } = {}) {
  if (!order || order.특수운임수동 === true) return null;
  const all = (Array.isArray(order.특수운임) ? order.특수운임 : []).filter((x) => x && num(x.금액) > 0);
  const manual = all.filter((x) => x.auto !== AUTO);
  const autoNow = all.filter((x) => x.auto === AUTO);
  const F = Math.max(0, num(order.지게차비용));
  const forkAutoNow = F > 0 && order.지게차자동 === AUTO;
  const forkManual = F > 0 && !forkAutoNow;
  const want = matchRoutePreset(order, presets);
  const blocked = new Set(manual.map(slotOf));
  const manualTypes = new Set(manual.map((x) => typeOf(x.종류)).filter((t) => t !== "기타"));
  const wantItems = want.items.filter((it) => it.종류 !== "지게차" && !blocked.has(slotOf(it)) && !manualTypes.has(it.종류) && !(strict && manual.length));
  const wf = forkManual ? null : want.items.find((it) => it.종류 === "지게차") || null;
  const forkSig = (amt, mode) => (amt > 0 ? `${amt}|${mode}` : "");
  const curSig = [...autoNow.map(sigOf).sort(), forkSig(forkAutoNow ? F : 0, ["기사", "회사", "청구"].includes(order.지게차부담) ? order.지게차부담 : "기사")].join("§");
  const newSig = [...wantItems.map(sigOf).sort(), forkSig(wf ? wf.금액 : 0, wf ? wf.부담 : "")].join("§");
  if (curSig === newSig) return null;
  const fork = forkManual
    ? { 지게차비용: F, 지게차부담: order.지게차부담 || "기사", 지게차기사ID: order.지게차기사ID || "", 지게차기사명: order.지게차기사명 || "", 지게차기사전화: order.지게차기사전화 || "", 지게차회사: order.지게차회사 || "" }
    : wf ? { 지게차비용: wf.금액, 지게차부담: wf.부담, 지게차기사ID: wf.지게차기사ID || "", 지게차기사명: wf.지게차기사명 || "", 지게차기사전화: wf.지게차기사전화 || "", 지게차회사: wf.지게차회사 || "" } : null;
  const items = [...manual, ...wantItems.map((it) => ({ 종류: it.종류, 이름: it.이름, 금액: it.금액, 부담: it.부담, 받는사람: it.받는사람, 메모: it.메모 || "노선 고정", auto: AUTO }))];
  const added = [...wantItems.filter((it) => !autoNow.some((a) => sigOf(a) === sigOf(it))), ...(wf && !(forkAutoNow && F === wf.금액) ? [wf] : [])];
  const removed = [...autoNow.filter((a) => !wantItems.some((it) => sigOf(a) === sigOf(it))), ...(forkAutoNow && !wf ? [{ 종류: "지게차", 금액: F }] : [])];
  return { fork, forkAuto: !!wf, items, added, removed, presets: want.presets };
}

// ── 서버(구글시트 가져오기)용 적용 — src/forkliftCore.js forkliftApply("__special")와 같은 계산 ──
//  rec: 시트에서 읽은 오더(금액 칸은 문자열) · plan: planRoutePreset 결과
export function applyPlanToRec(rec, plan) {
  if (!plan) return rec;
  const out = { ...rec };
  const pD = num(rec.지게차기사차감) + num(rec.특수기사차감);
  const pC = num(rec.지게차청구추가) + num(rec.특수청구추가);
  const F = plan.fork ? Math.max(0, num(plan.fork.지게차비용)) : 0;
  const fm = plan.fork && ["기사", "회사", "청구"].includes(plan.fork.지게차부담) ? plan.fork.지게차부담 : "기사";
  let D = 0, C = 0, ext = 0;
  const items = (plan.items || []).filter((x) => num(x.금액) > 0).map((x) => ({ 종류: x.종류 || "기타", 이름: cell(x.이름), 금액: num(x.금액), 부담: itemMode(x), 받는사람: itemPayee(x), 메모: cell(x.메모), ...(x.auto ? { auto: x.auto } : {}) }));
  for (const it of items) {
    const a = it.금액;
    if (it.받는사람 === "없음") { if (it.부담 === "기사") D += a; else C += a; continue; }
    if (it.받는사람 === "기사") D -= a; else { ext += a; if (it.부담 === "기사") D += a; }
    if (it.부담 === "청구") C += a;
  }
  const fD = F && fm === "기사" ? F : 0, fC = F && fm === "청구" ? F : 0;
  out.기사운임 = String(num(rec.기사운임) + pD - (fD + D));
  out.청구운임 = String(num(rec.청구운임) - pC + (fC + C));
  if (F) Object.assign(out, { 지게차비용: F, 지게차부담: fm, 지게차기사ID: plan.fork.지게차기사ID || "", 지게차기사명: plan.fork.지게차기사명 || "", 지게차기사전화: plan.fork.지게차기사전화 || "", 지게차회사: plan.fork.지게차회사 || "" });
  else { delete out.지게차비용; delete out.지게차부담; }
  out.지게차기사차감 = fD; out.지게차청구추가 = fC;
  if (items.length) out.특수운임 = items; else delete out.특수운임;
  out.특수기사차감 = D; out.특수청구추가 = C; out.외부지급합 = F + ext;
  out.수수료 = String(num(out.청구운임) - num(out.기사운임) - F - ext);
  if (plan.forkAuto) out.지게차자동 = AUTO; else delete out.지게차자동;
  return out;
}

// ── 오더 → 이 노선 고정으로 저장할 항목(팝업 [이 노선 고정으로 저장]) ──
export function itemsFromOrder(o = {}) {
  const out = [];
  const night = isNightLoad(o);
  const F = Math.max(0, num(o.지게차비용));
  if (F > 0) out.push(cleanItem({ 종류: "지게차", 금액: F, 부담: o.지게차부담 || "기사", 지게차기사ID: o.지게차기사ID, 지게차기사명: o.지게차기사명, 지게차기사전화: o.지게차기사전화, 지게차회사: o.지게차회사 }));
  (Array.isArray(o.특수운임) ? o.특수운임 : []).filter((x) => x && num(x.금액) > 0).forEach((x) => {
    const yasang = typeOf(x.종류) === "할증" && /야상|야간/.test(`${cell(x.이름)} ${cell(x.메모)}`);
    out.push(cleanItem({ ...x, 조건: yasang && night ? "야간" : "항상", 메모: "" }));
  });
  // 같은 칸이 두 번이면 금액을 더한다
  const m = new Map();
  out.forEach((it) => { const k = slotOf(it); const p = m.get(k); if (p) p.금액 += it.금액; else m.set(k, { ...it }); });
  return [...m.values()];
}
// 기존 프리셋 + 새 항목 합치기(같은 칸은 새 값으로)
export function mergeItems(oldItems = [], newItems = []) {
  const m = new Map((oldItems || []).map((x) => [slotOf(x), cleanItem(x)]));
  (newItems || []).forEach((x) => m.set(slotOf(x), cleanItem(x)));
  return [...m.values()].filter((x) => x.금액 > 0);
}

// ── 기존 자료로 자동 설정(지난 오더 분석) ───────────────────────
//  노선(거래처 + 하차지 → 거래처 + 상차지 + 하차지 → 거래처 + 상차지) 마다 오더가 minCount 건 이상이고,
//  같은 항목(종류 · 이름 · 금액 · 부담 · 받는사람)이 그 노선 오더의 minShare 이상에 있으면 제안 — 조건 "항상"
//  아니면 야간 상차 오더만 보고 minShare 이상이고, 낮 오더에는 거의 없으면(10% 이하) — 조건 "야간"
const CANCELED = /취소/;
function orderItems(o, stops = 0) {
  const out = [];
  const F = Math.max(0, num(o?.지게차비용));
  if (F > 0) out.push(cleanItem({ 종류: "지게차", 금액: F, 부담: ["기사", "회사", "청구"].includes(o.지게차부담) ? o.지게차부담 : "기사" }));
  const m = new Map();
  (Array.isArray(o?.특수운임) ? o.특수운임 : []).filter((x) => x && num(x.금액) > 0).forEach((x) => {
    const it = cleanItem(x); it.메모 = ""; const k = `${slotOf(it)}|${it.받는사람}|${it.부담}|${it.이름}`;
    const p = m.get(k); if (p) p.금액 += it.금액; else m.set(k, it);
  });
  // 경유 금액이 경유지 수로 나누어떨어지면 개소당 금액으로 본다(경유 1곳 30,000 · 2곳 60,000 → 개소당 30,000)
  return [...out, ...[...m.values()].map((it) => (it.종류 === "경유" && stops > 0 && it.금액 % stops === 0 ? { ...it, 금액: it.금액 / stops, 단위: "개소" } : it))];
}
const itemKey = (it) => `${slotOf(it)}|${it.이름}|${it.금액}|${it.부담}|${it.받는사람}`;
const topName = (vals) => { const m = new Map(); vals.forEach((v) => { const s = cell(v); if (s) m.set(s, (m.get(s) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ""; };
export function seedProposals(orders = [], { minCount = 3, minShare = 0.7, dayMax = 0.1, existing = [] } = {}) {
  const rows = (orders || []).filter((o) => o && nk(o.거래처명) && (nk(o.상차지명) || nk(o.하차지명)) && !CANCELED.test(cell(o.배차상태)) && !CANCELED.test(cell(o.상태)))
    .map((o) => { const arr = arrivalOf(o); const stops = stopCount(o); return { o, night: isNightLoad(o), arr, stops, items: orderItems(o, stops) }; });
  const LEVELS = [
    { level: 1, key: (o) => (nk(o.하차지명) ? `${nk(o.거래처명)}||${nk(o.하차지명)}` : "") },
    { level: 0, key: (o) => (nk(o.상차지명) && nk(o.하차지명) ? `${nk(o.거래처명)}|${nk(o.상차지명)}|${nk(o.하차지명)}` : "") },
    { level: 2, key: (o) => (nk(o.상차지명) ? `${nk(o.거래처명)}|${nk(o.상차지명)}|` : "") },
  ];
  const out = []; const covered = new Set(); // `${거래처}|${하차지}|${slot}` — 거래처 + 하차지로 이미 제안한 칸은 상차지까지 같은 노선에서 또 제안하지 않는다
  const coveredRows = new Map(); // 항목 → 이미 제안한 노선이 설명하는 오더들(넓은 노선 — 거래처 + 상차지 — 이 같은 오더만으로 또 제안되지 않게)
  for (const L of LEVELS) {
    const groups = new Map();
    rows.forEach((r) => { const k = L.key(r.o); if (!k) return; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    for (const [, g] of groups) {
      const n = g.length; if (n < minCount) continue;
      const nightN = g.filter((r) => r.night).length; const dayN = n - nightN;
      const condN = { 야간: nightN, 익착: g.filter((r) => r.arr === "익착").length, 월착: g.filter((r) => r.arr === "월착").length };
      const viaN = g.filter((r) => r.stops > 0).length;
      const inCond = (cond, r) => (cond === "야간" ? r.night : r.arr === cond);
      const c = nk(g[0].o.거래처명), f = L.level === 1 ? "" : nk(g[0].o.상차지명), t = L.level === 2 ? "" : nk(g[0].o.하차지명);
      const stat = new Map();
      g.forEach((r) => { const seen = new Set(); r.items.forEach((it) => { const k = itemKey(it); if (seen.has(k)) return; seen.add(k); const s = stat.get(k) || { it, all: 0, night: 0, cnt: { 야간: 0, 익착: 0, 월착: 0 }, rows: [] }; s.all += 1; if (r.night) s.night += 1; ["야간", "익착", "월착"].forEach((c) => { if (inCond(c, r)) s.cnt[c] += 1; }); s.rows.push(r); stat.set(k, s); }); });
      const bySlot = new Map();
      for (const s of stat.values()) {
        let cond = "";
        // 개소당 경유 금액 = 경유지가 있는 오더 중에서 본다(경유 없는 오더에는 원래 붙지 않는다)
        if (s.it.단위 === "개소") { if (viaN >= minCount && s.all / viaN >= minShare) cond = "항상"; }
        else if (s.all / n >= minShare) cond = "항상";
        else {
          for (const c of ["야간", "익착", "월착"]) {
            const cn = condN[c]; const other = n - cn;
            if (cn >= minCount && s.cnt[c] / cn >= minShare && (s.all - s.cnt[c]) <= Math.floor(other * dayMax)) { cond = c; break; }
          }
        }
        if (!cond) continue;
        const slot = slotOf(s.it);
        const prev = bySlot.get(slot);
        if (!prev || s.all > prev.s.all) bySlot.set(slot, { s, cond });
      }
      for (const [slot, { s, cond }] of bySlot) {
        if (L.level === 0 && covered.has(`${c}|${t}|${slot}`)) continue;
        const ik = itemKey(s.it); const cr = coveredRows.get(ik) || new Set();
        if (s.rows.every((r) => cr.has(r))) continue; // 이 항목이 있는 오더가 모두 이미 다른(좁은) 노선 제안으로 설명된다
        s.rows.forEach((r) => cr.add(r)); coveredRows.set(ik, cr);
        if (L.level === 1) covered.add(`${c}|${t}|${slot}`);
        const p = { 거래처명: topName(g.map((r) => r.o.거래처명)), 상차지명: L.level === 1 ? "" : topName(g.map((r) => r.o.상차지명)), 하차지명: L.level === 2 ? "" : topName(g.map((r) => r.o.하차지명)) };
        const item = { ...s.it, 조건: cond, 메모: "" };
        const same = (existing || []).find((e) => !e.legacy && nk(e.거래처명) === c && nk(e.상차지명) === f && nk(e.하차지명) === t);
        const hit = same && (same.items || []).find((x) => slotOf(x) === slot);
        const status = !hit ? "new" : hit.금액 === item.금액 && hit.부담 === item.부담 && condOf(hit) === cond && unitOf(hit) === unitOf(item) ? "same" : "diff";
        const total = cond !== "항상" ? condN[cond] : item.단위 === "개소" ? viaN : n;
        const count = cond !== "항상" ? s.cnt[cond] : s.all;
        out.push({ id: `${L.level}|${c}|${f}|${t}|${slot}`, level: L.level, ...p, item, count, total, routeCount: n, nightCount: nightN, condCount: total,
          share: total ? count / total : 0, status, current: hit || null });
      }
    }
  }
  return out.sort((a, b) => a.거래처명.localeCompare(b.거래처명, "ko") || a.하차지명.localeCompare(b.하차지명, "ko") || a.상차지명.localeCompare(b.상차지명, "ko") || a.level - b.level);
}
// 제안 → 저장할 프리셋 문서들(같은 노선은 한 문서로 · 기존 문서 항목과 합친다)
export function proposalsToPresets(list = [], existing = []) {
  const m = new Map();
  (list || []).forEach((p) => {
    const k = `${nk(p.거래처명)}|${nk(p.상차지명)}|${nk(p.하차지명)}`;
    const cur = m.get(k) || (() => { const e = (existing || []).find((x) => !x.legacy && `${nk(x.거래처명)}|${nk(x.상차지명)}|${nk(x.하차지명)}` === k); return { 거래처명: e?.거래처명 || p.거래처명, 상차지명: e?.상차지명 || p.상차지명, 하차지명: e?.하차지명 || p.하차지명, 사용: true, items: e ? [...e.items] : [], 출처: e?.출처 || "기존 자료" }; })();
    cur.items = mergeItems(cur.items, [p.item]);
    m.set(k, cur);
  });
  return [...m.values()];
}
