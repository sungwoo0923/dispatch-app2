// ======================= functions/routeBoardSync.js =======================
// 📋 2026-11-03 배차표 ↔ 구글시트 자동 연동(서버) — 화면(src/RouteBoard.jsx · src/routeBoardSheet.js)과 같은 규칙
//  · 양식(routeBoards)에 시트 주소가 있고 autoSync가 꺼져 있지 않으면, 10분마다(그리고 화면의 [지금 확인]) 최근 날짜 탭을 읽어
//    ① 시트에 새로 생긴 줄 → 오더 자동 생성(새 탭 = 새 날짜도 자동)
//    ② 이미 있는 줄 → "화주가 입력하는 칸"(도착지·시군구·리터 수량·비고 등)만 시트 값으로 맞춤
//       "운송사가 입력하는 칸"(차량번호·기사·운송업체·단가·입차시간)은 프로그램 값을 지킨다(시트로는 화면 저장 때 써 준다)
//    ③ 시트에서 지워진 줄 → ⭐ 2026-11-04 프로그램 오더도 삭제(휴지통에 7일 보관 · 되살리기 가능)
//       안전장치: 시트를 제대로 못 읽은 것 같으면(그 묶음 줄이 하나도 없음 · 한 번에 너무 많이 사라짐) 지우지 않고 "시트에서 삭제됨" 표시만
//  · 줄 맞추기: 같은 묶음 안에서 도착지가 같은 줄끼리 순서대로(같은 도착지가 여러 줄이면 1번째↔1번째)

const cell = (v) => String(v ?? "").replace(/ /g, " ").trim();
const nm = (s) => String(s || "").toLowerCase().replace(/[\s()（）[\]]/g, "");
// ⭐ 2026-11-03 프로그램에서 지운 줄 열쇠(src/DispatchApp.jsx rbTombKey 와 같은 규칙) — 시트에 남아 있어도 다시 만들지 않는다
const tombKey = (date, group, name) => [date, group || "", name].map((x) => nm(x).replace(/[^0-9a-z가-힣_-]/g, "_")).join("__");
const DATE_RE = /(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/;
const pad = (n) => String(n).padStart(2, "0");
const sparse = (row) => row.filter(Boolean).length <= 2;
const isNoise = (row) => row.some((c) => DATE_RE.test(c) || /배차\s*내역/.test(c));
const toInt = (v) => parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10) || 0;
const normPlate = (s = "") => String(s).replace(/\s+/g, "").toUpperCase();
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const rid = () => Math.random().toString(36).slice(2, 10);
const parseHM = (v) => {
  const s = String(v || "").trim(); if (!s) return "";
  let m = s.match(/(오전|오후)\s*(\d{1,2})(?::(\d{2}))?/);
  if (m) { let h = +m[2] % 12; if (m[1] === "오후") h += 12; return `${pad(h)}:${m[3] || "00"}`; }
  m = s.match(/^(\d{1,2})(?::|시\s*)?(\d{2})?분?$/) || s.match(/^(\d{2})(\d{2})$/);
  if (m && +m[1] < 24) return `${pad(+m[1])}:${m[2] || "00"}`;
  return "";
};
const korTime = (hm) => { if (!hm) return ""; const [h, m] = hm.split(":").map(Number); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${pad(m)}`; };
const TIME_FIELDS = new Set(["상차시간", "하차시간"]);
const MONEY_FIELDS = new Set(["청구운임", "기사운임"]);

function tabDate(title, year, loose = false) {
  const t = cell(title);
  let m = t.match(/^(\d{2,4})[-./](\d{1,2})[-./](\d{1,2})\s*(\(?[월화수목금토일](요일)?\)?)?$/); // ⭐ 2026-11-03 날짜만(요일까지) — "26-11-03(테스트)" 같은 탭은 날짜 탭이 아님
  if (!m && loose) m = t.match(/^(\d{2,4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return `${m[1].length === 2 ? 2000 + +m[1] : m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = t.match(/^(\d{1,2})[-./월]\s*(\d{1,2})일?$/) || t.match(/^(\d{2})(\d{2})$/);
  if (m && +m[1] <= 12 && +m[2] <= 31) return `${year}-${pad(m[1])}-${pad(m[2])}`;
  return "";
}
// 칸을 누가 입력하나 — 화면(routeBoardSheet.ownerOf)과 같은 기준
const CARRIER_FIELDS = new Set(["차량번호", "이름", "전화번호", "상차시간", "하차시간", "청구운임", "기사운임", "차량톤수", "차량종류"]);
function ownerOf(c) {
  if (c.owner === "화주" || c.owner === "운송사") return c.owner;
  if (c.kind === "qty") return "화주";
  if (c.kind === "field") return CARRIER_FIELDS.has(c.field) ? "운송사" : "화주";
  if (c.kind === "extra") return /운송업체|운송사|단가|운임|차량|기사/.test(String(c.label || "")) ? "운송사" : "화주";
  return "";
}
// 🔗 2026-11-08 머리줄 자동 대조(functions/boardHeaderMatch.mjs) — syncBoard가 처음에 불러 둔다(ESM이라 동적 import)
let HM = null;
const loadHM = async () => { if (!HM) HM = await import("./boardHeaderMatch.mjs"); return HM; };
function headerRows(rows, cols) {
  if (HM) return HM.headerRowsOf(rows, cols);
  const set = new Set(cols.map((c) => nm(c.label)));
  const need = Math.max(2, Math.min(3, Math.ceil(set.size / 2)));
  return rows.map((r, i) => ({ i, n: new Set(r.map(nm).filter((x) => set.has(x))).size })).filter((x) => x.n >= need).map((x) => x.i);
}
const colIdx = (c, hr) => (HM ? HM.colIndexes(c, hr) : hr.map((h, i) => (nm(h) === nm(c.label) ? i : -1)).filter((i) => i >= 0));
const isEnum = (c) => c.kind === "field" && ["배차상태", "지급방식", "배차방식"].includes(c.field);
const enumVal = (c, v) => (HM && isEnum(c) ? HM.enumValue(c.field, v) : cell(v));
function parseBoardTab(form, rawRows) {
  const rows = (rawRows || []).map((r) => (r || []).map(cell));
  const cols = form.columns.filter((c) => c.kind !== "no" && c.kind !== "sum");
  const heads = headerRows(rows, cols);
  const out = {}; form.groups.forEach((g) => { out[g.name] = []; });
  const meta = {}; // ⭐ 2026-11-03 묶음별 표 위치(프로그램에서 추가한 오더를 시트 줄로 넣을 때)
  let date = ""; let date2 = "";
  heads.forEach((hi, k) => {
    const end = k + 1 < heads.length ? heads[k + 1] : rows.length;
    const above = rows.slice(Math.max(0, hi - 4), hi).filter(sparse);
    // ⭐ 2026-11-03 제목 위 날짜 두 개 — 왼쪽 = 발주일(상차일), 오른쪽 = 입고일(하차일 · 탭 이름 날짜)
    if (!date) for (const r of above) {
      const ds = r.filter((x) => DATE_RE.test(x)).map((x) => { const m = x.match(DATE_RE); return `${m[1]}-${pad(m[2])}-${pad(m[3])}`; });
      if (ds.length) { date = ds[0]; if (ds[1]) date2 = ds[1]; break; }
    }
    const title = above.flat().join(" ");
    const g = form.groups.find((x) => x.name && nm(title).includes(nm(x.name))) || form.groups[Math.min(k, form.groups.length - 1)];
    const data = rows.slice(hi + 1, end);
    const idx = {};
    cols.forEach((c) => {
      const cand = colIdx(c, rows[hi]);
      if (cand.length) idx[c.id] = cand.map((i) => ({ i, n: data.filter((r) => cell(r[i])).length })).sort((a, b) => b.n - a.n || b.i - a.i)[0].i;
    });
    if (!meta[g.name]) {
      const allIdx = { ...idx };
      form.columns.filter((c) => c.kind === "no" || c.kind === "sum").forEach((c) => { const i = colIdx(c, rows[hi])[0]; if (i != null && i >= 0) allIdx[c.id] = i; });
      meta[g.name] = { hi, end, idx: allIdx, lastRi: hi };
    }
    data.forEach((r) => {
      if (!r.some(Boolean) || isNoise(r)) return;
      const v = {};
      cols.forEach((c) => { if (idx[c.id] != null) v[c.id] = cell(r[idx[c.id]]); });
      if (!cols.some((c) => (c.kind === "qty" || ["하차지명", "차량번호"].includes(c.field)) && v[c.id])) return;
      Object.defineProperty(v, "__pos", { value: { ri: rows.indexOf(r), idx }, enumerable: false }); // 시트에 다시 쓸 때 칸 위치
      const nameCol = cols.find((c) => c.field === "하차지명");
      if (nameCol && /^(합계|소계|총계|계)$/.test(String(v[nameCol.id] || "").replace(/\s/g, ""))) return;
      out[g.name].push(v);
      if (meta[g.name] && meta[g.name].hi === hi) meta[g.name].lastRi = Math.max(meta[g.name].lastRi, rows.indexOf(r));
    });
  });
  return { date, date2, groups: out, headers: heads.length, meta, rows };
}

// 시트 한 줄 값 → 오더 칸(only: "화주"|"운송사"|"" = 전부)
function fieldsOf(form, v, only = "") {
  const rec = {}; const qty = {}; const extra = {};
  let touchedQty = false;
  form.columns.forEach((c) => {
    if (c.kind === "no" || c.kind === "sum" || c.kind === "calc" || c.kind === "date") return;
    if (only && ownerOf(c) !== only) return;
    const val = cell(v[c.id]);
    if (c.kind === "field") rec[c.field] = TIME_FIELDS.has(c.field) ? (parseHM(val) ? korTime(parseHM(val)) : val) : MONEY_FIELDS.has(c.field) ? String(toInt(val) || "") : isEnum(c) ? enumVal(c, val) : val;
    else if (c.kind === "qty") { touchedQty = true; if (toInt(val)) qty[c.label] = toInt(val); }
    else if (c.kind === "extra") extra[c.label] = val;
  });
  return { rec, qty, extra, touchedQty };
}
// ── 양방향: 칸 하나의 "시트 모양" 값(비교·시트에 쓰기용) ──
const colLetter = (i) => { let s = ""; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const sheetForm = (c, o) => { // 오더 값 → 시트에 적는 모양
  if (c.kind === "qty") { const n = o.품목수량?.[c.label]; return n ? String(n) : ""; }
  if (c.kind === "extra") return cell(o.추가정보?.[c.label]);
  let v = cell(o[c.field]);
  if (!v && c.autoFrom === "extra") v = cell(o.추가정보?.[c.label]); // 🔗 2026-11-08 예전엔 참고 칸(추가정보)에 있던 값 — 빈 값으로 시트를 지우지 않게
  if (TIME_FIELDS.has(c.field)) { const h = parseHM(v); return h ? h.replace(/^0(\d)/, "$1") : v; }
  if (MONEY_FIELDS.has(c.field)) return v ? String(toInt(v)) : "";
  return v;
};
const same = (c, a, b) => {
  if (c.kind === "qty" || (c.kind === "field" && MONEY_FIELDS.has(c.field))) return toInt(a) === toInt(b);
  if (c.kind === "field" && TIME_FIELDS.has(c.field)) return (parseHM(a) || cell(a)) === (parseHM(b) || cell(b));
  if (c.kind === "field" && c.field === "차량번호") return normPlate(a) === normPlate(b);
  if (c.kind === "field" && c.field === "전화번호") return String(a || "").replace(/\D/g, "") === String(b || "").replace(/\D/g, "");
  if (isEnum(c)) return enumVal(c, a) === enumVal(c, b); // 🔗 2026-11-08 "24시콜" = "24시" · "배차완료(자동)" = "배차완료"
  return cell(a).replace(/\s+/g, "") === cell(b).replace(/\s+/g, "");
};
const NO_PUSH = new Set(["하차지명", "하차지주소"]); // 프로그램은 풀주소라 시트(시군구)로 되돌려 쓰지 않음
const NO_PUSH_FIELD = new Set(["배차상태"]); // 🔗 2026-11-08 시트 배차상태는 보통 수식(차량번호로 자동) — 읽기만

// ── 💰 단가표(청구운임) — 화면(src/routeBoardSheet.js rateFor)과 같은 계산 ──
const numOf = (v) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };
const SIDO_SHORT = [["서울특별시", "서울"], ["부산광역시", "부산"], ["대구광역시", "대구"], ["인천광역시", "인천"], ["광주광역시", "광주"], ["대전광역시", "대전"], ["울산광역시", "울산"], ["세종특별자치시", "세종"], ["경기도", "경기"], ["강원특별자치도", "강원"], ["강원도", "강원"], ["충청북도", "충북"], ["충청남도", "충남"], ["전북특별자치도", "전북"], ["전라북도", "전북"], ["전라남도", "전남"], ["경상북도", "경북"], ["경상남도", "경남"], ["제주특별자치도", "제주"]];
const SIDO = new Set(SIDO_SHORT.map((x) => x[1]));
const METRO_CITY = new Set(["서울시", "부산시", "대구시", "인천시", "대전시", "울산시"]); // "대구시" → 주소 "대구 …"도 같은 곳(광주시는 경기 광주라 제외)
const normAddr = (a) => { let s = String(a || ""); SIDO_SHORT.forEach(([l, sh]) => { s = s.split(l).join(sh); }); return s.replace(/\s+/g, ""); };
function rateFor(table, addr, pallets) {
  const n = Math.round(numOf(pallets));
  if (!Array.isArray(table) || !table.length || n <= 0) return null;
  const a = normAddr(addr); if (!a) return null;
  const aSido = [...SIDO].find((sd) => a.startsWith(sd)) || "";
  let best = null;
  table.forEach((t) => {
    const toks = String(t.region || "").trim().split(/\s+/).filter(Boolean);
    const sido = toks.find((x) => SIDO.has(x)) || "";
    const rest = toks.filter((x) => !SIDO.has(x));
    if (!rest.length) return;
    const ok = rest.every((x) => a.includes(x) || (METRO_CITY.has(x) && a.includes(x.slice(0, -1))));
    if (!ok) return;
    if (sido && aSido && sido !== aSido && !rest.some((x) => METRO_CITY.has(x))) return; // 시·도가 다르면 다른 곳(예: 대구 남구 ≠ 광주 남구)
    const score = (sido && sido === aSido ? 10 : 0) + rest.join("").length;
    if (!best || score > best.score) best = { t, score };
  });
  if (!best) return null;
  const { t } = best;
  // ⭐ 2026-11-03 단가표는 12P·18P 딱 그 수량일 때만(나머지 파레트 수는 직접 입력)
  const per = n === 18 ? t.r18 : n === 12 ? t.r12 : 0;
  if (!per) return null;
  return { region: t.region, per, pallets: n, total: per * n, tier: n };
}
// 오더에 단가표 청구운임 적용(직접 고친 운임 = 운임수동이면 그대로)
function rateFieldsOf(form, o, qty, addr) {
  if (!Array.isArray(form.rateTable) || !form.rateTable.length || o.운임수동) return null;
  const n = Object.values(qty || {}).reduce((x, y) => x + toInt(y), 0);
  const r = rateFor(form.rateTable, addr, n);
  if (!r) return null;
  const sale = r.total; const drv = toInt(o.기사운임);
  return { 청구운임: String(sale), 수수료: String(sale - drv), 단가표지역: r.region, 파렛단가: r.per };
}

const cargoText = (qty) => { const total = Object.values(qty).reduce((a, n) => a + n, 0); return { 화물내용: Object.keys(qty).length ? `${Object.entries(qty).map(([k, n]) => `${k} ${n}`).join(" · ")} (총 ${total})` : "", 화물수량: total ? String(total) : "" }; };

async function syncBoard({ db, FieldValue, form: form0, readTabs, readTab, writeCells, insertRows, daysBack = 0, daysAhead = 14, range = null }) { // ⭐ 2026-11-03 오늘 탭부터(어제 탭은 안 가져옴) · range={from,to}면 그 기간(입고일=탭 날짜)
  // 🔗 2026-11-08 머리줄 자동 대조 — 예전 "참고" 칸 중 프로그램 칸(업체명=거래처명 · 기사님요금=기사운임 · 배차상태 …)은 프로그램 칸으로, 수수료·매익율은 계산 칸으로
  await loadHM();
  const form = HM.normalizeBoardForm(form0);
  const nameCol = form.columns.find((c) => c.kind === "field" && c.field === "하차지명");
  if (!form.sheetUrl || !nameCol) return { skipped: "no-sheet" };
  const today = kstToday();
  const M0 = await import("./routeBoardMonth.mjs");
  // 📅 월별 탭 양식은 한 탭에 한 달이 다 있어 — 자동 맞춤도 지난 7일까지(시트에서 어제 줄을 고쳐도 반영)
  const back = !range && M0.isMonthBoard(form) ? Math.max(daysBack, 7) : daysBack;
  // range.soft = 프로그램에서 고친 오더의 날짜만 맞추기(지운 줄 기억은 그대로)
  const soft = !!range?.soft;
  const from = range?.from || addDays(today, -back); const to = range?.to || addDays(today, daysAhead);
  const newClients = new Set(); // 🔗 2026-11-08 시트에서 들어온 거래처명 → 기본거래처에 없으면 자동 등록
  const y = +today.slice(0, 4);
  // ⭐ 2026-11-03 양식에서 탭 하나를 고정했으면(테스트용) 그 탭만, 아니면 날짜 이름 탭(최근~2주 뒤)
  const allTabs = await readTabs();
  // 📅 2026-11-07 월별 탭(25년1월) · 한 탭 양식(시트 프로필로 만든 양식) — 탭 안의 날짜 칸으로 날짜를 나눈다(functions/routeBoardMonth.mjs)
  const M = await import("./routeBoardMonth.mjs");
  const monthMode = M.isMonthBoard(form);
  let tabs = form.fixedTab ? allTabs.filter((t) => t === form.fixedTab)
    : monthMode ? M.boardTabsInRange(form, allTabs, from, to)
    : allTabs.filter((t) => { const d = tabDate(t, y) || tabDate(t, y + 1); return d && d >= from && d <= to; }); // 탭 이름 날짜 = 입고일
  // 🔗 2026-11-08 월별 탭 양식인데 이번 달 탭이 아직 없으면(지난해 시트 · 달 바뀜 직후) 가장 최근 달 탭의 마지막 7일치를 맞춘다
  //  (예전엔 아무 탭도 안 읽어서 "시트를 고쳐도 프로그램에 안 들어오고, 프로그램에서 고쳐도 시트에 안 써지는" 상태였다)
  let lastDays = 0;
  if (monthMode && !range && !tabs.length && form.tabMode === "monthly") {
    const { tabMonth } = await import("./sheetProfileCore.mjs");
    const latest = allTabs.map((t) => ({ t, x: tabMonth(t, y) })).filter((a) => a.x && (!form.tabPattern?.kind || a.x.kind === form.tabPattern.kind))
      .sort((a, b) => (b.x.y * 12 + b.x.m) - (a.x.y * 12 + a.x.m) || a.t.length - b.t.length)[0];
    if (latest) { tabs = [latest.t]; lastDays = 7; }
  }
  const co = form.companyName;
  // 💸 2026-11-09 운송업체별 수수료율(routeCarrierSettings/{회사}.carriers[].rate) → 비어 있는 기사운임 자동 계산(functions/carrierFareCore.mjs)
  const CF = await import("./carrierFareCore.mjs");
  let carrierSet = null;
  try { const cs = await db.collection("routeCarrierSettings").doc(co).get(); carrierSet = cs.exists ? cs.data() || null : null; } catch { carrierSet = null; }
  const rateMap = CF.rateMapOf(carrierSet);
  const farePatchOf = (o, patch) => (rateMap.size || o?.기사운임자동 ? CF.carrierFarePatch(CF.mergedOrder(o, patch), carrierSet, rateMap) : null);
  let places = null; let drivers = null;
  const loadLookups = async () => {
    if (places) return;
    const [p, d] = await Promise.all([db.collection("places").where("companyName", "==", co).get(), db.collection("drivers").where("companyName", "==", co).get()]);
    places = p.docs.map((x) => x.data()); drivers = d.docs.map((x) => x.data()).filter((x) => x.차량번호);
  };
  const sum = { tabs: 0, created: 0, updated: 0, gone: 0, dates: [] };
  const hashes = { ...(form.syncHash || {}) };
  // 탭 하나(월별 탭이면 그 탭의 하루치) 맞추기 → { inserted }
  const runUnit = async (tab, rows, hash, mDate) => {
    const p = parseBoardTab(form, rows);
    if (!p.headers) return {};
    let inDate; let date;
    if (mDate) { date = mDate; inDate = addDays(mDate, toInt(form.dropOffset)); }
    else {
      const tabD = tabDate(tab, y, !!form.fixedTab) || tabDate(tab, y + 1, !!form.fixedTab);
      inDate = p.date2 || tabD || ""; // 입고일(하차일)
      date = p.date || (tabD ? addDays(tabD, -toInt(form.dropOffset)) : ""); // 발주일(상차일)
      const chk = inDate || date;
      if (!date || (!form.fixedTab && (chk < from || chk > to))) return {};
    }
    let inserted = false;
    sum.tabs += 1;
    // ⭐ 2026-11-03 운송사 분리 — 이 양식 회사의 오더만(다른 회사에 남은 같은 양식 오더는 절대 건드리지 않음)
    const ex = await db.collection("orders").where("배차표Id", "==", form.id).where("상차일", "==", date).where("companyName", "==", co).get();
    const allOrders = ex.docs.map((d) => ({ ref: d.ref, ...d.data() }));
    const orders = allOrders.filter((o) => o.배차상태 !== "배차취소");
    const cancelled = allOrders.filter((o) => o.배차상태 === "배차취소"); // 취소한 줄은 시트에 남아 있어도 다시 만들지 않음
    const tomb = range && !soft ? {} : (form.삭제한줄 || {}); const tombUsed = {}; // ⭐ [기간 가져오기](range)는 지운 줄까지 다시 가져온다
    hashes[tab] = hash; // (양방향이라 시트가 그대로여도 프로그램에서 바뀐 값을 시트에 써야 해서 건너뛰지 않음 — 바뀐 칸만 씀)
    sum.dates.push(date);
    const batch = db.batch(); let ops = 0; const pushes = []; const appends = []; const goneAll = [];
    for (const g of form.groups) {
      const mine = orders.filter((o) => (o.배차표묶음 || form.groups[0].name) === g.name).sort((a, b) => (a.배차표순번 || 0) - (b.배차표순번 || 0));
      const pool = {}; mine.forEach((o) => { const k = nm(o.하차지명); (pool[k] = pool[k] || []).push(o); });
      const matched = new Set();
      let seq = mine.reduce((a, o) => Math.max(a, o.배차표순번 || 0), 0);
      for (const v of p.groups[g.name] || []) {
        const k = nm(v[nameCol.id]); if (!k) continue;
        const o = (pool[k] || []).shift();
        if (!o) {
          const ci = cancelled.findIndex((x) => (x.배차표묶음 || form.groups[0].name) === g.name && nm(x.하차지명) === k);
          if (ci >= 0) { cancelled.splice(ci, 1); continue; }
          const tk = tombKey(date, g.name, v[nameCol.id]);
          const tk2 = tombKey(date, "", v[nameCol.id]);
          const useKey = (tomb[tk] || 0) > (tombUsed[tk] || 0) ? tk : (tomb[tk2] || 0) > (tombUsed[tk2] || 0) ? tk2 : null;
          if (useKey) { tombUsed[useKey] = (tombUsed[useKey] || 0) + 1; sum.skipped = (sum.skipped || 0) + 1; continue; }
        }
        if (o) {
          matched.add(o.ref.path);
          // ⭐ 양방향(칸마다): 지난번에 본 시트 값(시트기준값)과 비교
          //  · 시트가 바뀌었으면 → 시트 값을 프로그램에(누가 입력하는 칸이든 — 업체가 차량번호를 바꿔도 반영)
          //  · 시트는 그대로인데 프로그램 값이 다르면 → 프로그램 값을 시트에 써 준다(도착지·주소 칸 제외)
          //  · 처음 맞출 때(기준값 없음): 화주 칸은 시트 우선, 운송사 칸은 프로그램 값이 있으면 프로그램 우선
          const base0 = o.시트기준값 || null; const nextBase = {}; const patch = {};
          const qtyNow = { ...(o.품목수량 || {}) }; let qtyChanged = false; let plateChanged = false;
          for (const c of form.columns) {
            if (c.kind === "no" || c.kind === "sum" || c.kind === "date" || c.kind === "calc" || (c.kind === "field" && c.field === "하차지명")) continue;
            const pos = v.__pos; const ci = pos?.idx?.[c.id]; if (ci == null) continue;
            const sv = cell(v[c.id]); const pv = sheetForm(c, o);
            // 🔗 2026-11-08 예전 "참고" 칸(추가정보)에만 있던 값 → 프로그램 칸으로 옮겨 담기(기사님요금 → 기사운임 등)
            if (c.autoFrom === "extra" && c.kind === "field" && !cell(o[c.field]) && pv) { const { rec } = fieldsOf({ columns: [c] }, { [c.id]: pv }, ""); if (rec[c.field]) patch[c.field] = rec[c.field]; }
            const sheetChanged = base0 ? !same(c, sv, base0[c.id] ?? "") : null;
            let pull = false; let push = false;
            if (sheetChanged === true) pull = !same(c, sv, pv);
            else if (sheetChanged === false) push = !same(c, sv, pv) && !(c.kind === "field" && NO_PUSH.has(c.field));
            else if (ownerOf(c) === "화주" || !pv) pull = !same(c, sv, pv) && (ownerOf(c) === "화주" || !!sv);
            else push = !same(c, sv, pv) && !(c.kind === "field" && NO_PUSH.has(c.field));
            if (push && (NO_PUSH_FIELD.has(c.field) || (!pv && c.autoFrom === "extra"))) push = false; // 🔗 2026-11-08 배차상태(시트 수식) · 예전 참고 칸 빈 값은 시트에 쓰지 않음
            if (push && o.기사운임자동 === true && c.kind === "field" && (c.field === "기사운임" || c.field === "수수료")) push = false; // 💸 2026-11-09 수수료율로 자동 계산한 기사운임은 시트에 쓰지 않음(시트 칸·수식 보호)
            if (pull) {
              if (c.kind === "qty") { if (toInt(sv)) qtyNow[c.label] = toInt(sv); else delete qtyNow[c.label]; qtyChanged = true; }
              else if (c.kind === "extra") patch[`추가정보.${c.label}`] = sv;
              else if (c.field === "하차지주소") { if (sv && !nm(o.하차지주소 || "").includes(nm(sv))) patch.하차지주소 = sv; }
              else { const { rec } = fieldsOf({ columns: [c] }, v, ""); patch[c.field] = rec[c.field] ?? sv; if (c.field === "차량번호") plateChanged = true; if (c.field === "배차상태" && !patch.배차상태) delete patch.배차상태; if (c.field === "기사운임" && toInt(patch.기사운임)) patch.기사운임자동 = false; /* 💸 시트에서 들어온 기사운임 = 사람이 넣은 값 */ }
              nextBase[c.id] = sv;
            } else if (push) {
              pushes.push({ a1: `${colLetter(ci)}${pos.ri + 1}`, value: pv });
              nextBase[c.id] = pv;
            } else nextBase[c.id] = sv;
          }
          if (qtyChanged) Object.assign(patch, { 품목수량: qtyNow, ...cargoText(qtyNow) });
          { // 수량·주소가 바뀌었거나 아직 단가표 운임이 없으면 단가표로 청구운임
            const addr = patch.하차지주소 || o.하차지주소 || "";
            const rf = (qtyChanged || "하차지주소" in patch || !toInt(o.청구운임)) ? rateFieldsOf(form, o, qtyNow, addr) : null;
            if (rf && String(rf.청구운임) !== String(o.청구운임 || "")) Object.assign(patch, rf);
            else if (!rf && qtyChanged && o.단가표지역 && !o.운임수동) Object.assign(patch, { 청구운임: "", 수수료: String(-toInt(o.기사운임)), 단가표지역: "", 파렛단가: 0 }); // 12·18P가 아니게 바뀌면 자동 운임 지움(직접 입력)
          }
          if (plateChanged) { // 차량이 바뀌면 배차상태·기사 정보도
            await loadLookups();
            const plate = patch.차량번호;
            const drv = plate ? drivers.find((d) => normPlate(d.차량번호) === normPlate(plate)) : null;
            if (drv && !("이름" in patch)) patch.이름 = drv.이름 || "";
            if (drv && !("전화번호" in patch)) patch.전화번호 = drv.전화번호 || "";
            if (!plate && !("이름" in patch)) patch.이름 = "";
            if (!plate && !("전화번호" in patch)) patch.전화번호 = "";
            if (plate && (o.배차상태 === "배차중" || !o.배차상태)) patch.배차상태 = "배차완료";
            if (!plate && o.배차상태 === "배차완료") patch.배차상태 = "배차중";
          }
          { const fp = farePatchOf(o, patch); if (fp) Object.assign(patch, fp); } // 💸 2026-11-09 운송업체 수수료율 → 기사운임·수수료 자동
          if (("청구운임" in patch || "기사운임" in patch) && !("수수료" in patch)) { // 🔗 2026-11-08 수수료 = 청구 − 기사(프로그램 계산)
            const sale = toInt("청구운임" in patch ? patch.청구운임 : o.청구운임); const drv = toInt("기사운임" in patch ? patch.기사운임 : o.기사운임);
            patch.수수료 = sale || drv ? String(sale - drv) : "";
          }
          if (patch.거래처명) newClients.add(patch.거래처명);
          if (JSON.stringify(base0 || {}) !== JSON.stringify(nextBase)) patch.시트기준값 = nextBase;
          if (o.시트삭제됨) patch.시트삭제됨 = false;
          if (v.__pos && o.시트줄 !== v.__pos.ri) patch.시트줄 = v.__pos.ri; // ⭐ 시트 줄 위치(화면을 시트 순서대로)
          if (o.발주일 !== date) patch.발주일 = date;
          if (inDate && (o.입고일 !== inDate || o.하차일 !== inDate)) { patch.입고일 = inDate; patch.하차일 = inDate; }
          if (Object.keys(patch).length) { patch.시트동기화 = Date.now(); batch.update(o.ref, patch); ops += 1; sum.updated += 1; }
        } else {
          await loadLookups();
          const { rec, qty, extra } = fieldsOf(form, v, "");
          const pl = places.filter((x) => nm(x.업체명) === k);
          const place = pl.length === 1 ? pl[0] : pl.find((x) => rec.하차지주소 && nm(x.주소).includes(nm(rec.하차지주소))) || null;
          const pc = place ? ((place.contacts || []).find((c) => c.isPrimary) || (place.contacts || [])[0]) : null;
          const drv = rec.차량번호 ? drivers.find((d) => normPlate(d.차량번호) === normPlate(rec.차량번호)) : null;
          seq += 1;
          const id = `rb_${form.id}_${date}_${rid()}`;
          const rfNew = rateFieldsOf(form, {}, qty, place?.주소 || rec.하차지주소 || "");
          // 🔗 2026-11-08 시트 줄의 거래처명(업체명)·상차지·배차상태가 우선 · 수수료는 프로그램 계산
          const clientName = rec.거래처명 || form.client || "";
          if (clientName) newClients.add(clientName);
          const plateNow = drv?.차량번호 || rec.차량번호 || "";
          const st0 = rec.배차상태 && ["배차중", "배차완료", "배차취소"].includes(rec.배차상태) ? rec.배차상태 : "";
          const fee = rec.청구운임 || rec.기사운임 ? { 수수료: String(toInt(rec.청구운임) - toInt(rec.기사운임)) } : {};
          const nd = {
            ...rec, 품목수량: qty, 추가정보: extra, ...cargoText(qty),
            ...(place?.주소 ? { 하차지주소: place.주소 } : {}),
            ...(pc ? { 하차지담당자: pc.name || "", 하차지담당자번호: pc.phone || "" } : {}),
            ...(drv ? { 차량번호: drv.차량번호, 이름: rec.이름 || drv.이름 || "", 전화번호: rec.전화번호 || drv.전화번호 || "" } : {}),
            ...fee, ...(rfNew && !rec.청구운임 ? rfNew : {}),
            거래처명: clientName, 상차일: date, 하차일: inDate || addDays(date, toInt(form.dropOffset)), 발주일: date, 입고일: inDate || addDays(date, toInt(form.dropOffset)),
            상차지명: rec.상차지명 || g.상차지명 || g.name || "", 상차지주소: rec.상차지주소 || g.상차지주소 || "", ...(form.payMethod && !rec.지급방식 ? { 지급방식: form.payMethod } : {}),
            배차상태: st0 || (plateNow ? "배차완료" : "배차중"), 배차표Id: form.id, 배차표명: form.name || "", 배차표묶음: g.name, 배차표순번: seq,
            companyName: co, _id: id, 등록일: kstToday(), 작성자: "배차표 자동", 등록기기: "배차표", _autoSheet: true, 시트동기화: Date.now(), 시트줄: v.__pos?.ri ?? null,
            시트기준값: Object.fromEntries(form.columns.filter((x) => !["no", "sum", "date", "calc"].includes(x.kind) && !(x.kind === "field" && x.field === "하차지명") && v.__pos?.idx?.[x.id] != null).map((x) => [x.id, cell(v[x.id])])),
            경유지_상차: [], 경유상차목록: [], 경유지_하차: [], 경유하차목록: [], 근무일자목록: [], 운행유형: "편도", 혼적여부: "독차",
            createdAt: FieldValue.serverTimestamp(), _lastModified: Date.now(),
          };
          { const fp = farePatchOf(nd, {}); if (fp) Object.assign(nd, fp); } // 💸 2026-11-09 운송업체 수수료율 → 기사운임·수수료 자동
          batch.set(db.collection("orders").doc(id), nd);
          ops += 1; sum.created += 1;
        }
      }
      // ⭐ 2026-11-03 프로그램(고정노선현황)에서 추가한 오더 — 아직 시트에 없으면 그 묶음 표 맨 아래에 새 줄로 넣는다
      const mt = p.meta?.[g.name];
      const pend = mine.filter((o) => !matched.has(o.ref.path) && o.시트추가대기 && !o.시트삭제됨);
      if (pend.length && mt && insertRows) {
        const noCol = form.columns.find((c) => c.kind === "no"); const sumCol = form.columns.find((c) => c.kind === "sum");
        let no = 0;
        if (noCol && mt.idx[noCol.id] != null) for (let ri = mt.hi + 1; ri < mt.end; ri++) no = Math.max(no, toInt((p.rows[ri] || [])[mt.idx[noCol.id]]));
        pend.forEach((o) => {
          const vals = []; const base = {};
          const total = Object.values(o.품목수량 || {}).reduce((a, n) => a + toInt(n), 0);
          form.columns.forEach((c) => {
            const ci = mt.idx[c.id]; if (ci == null) return;
            let v = "";
            if (c.kind === "no") { if (no) { no += 1; v = String(no); } }
            else if (c.kind === "sum") v = total ? String(total) : "";
            else if (c.kind === "date") v = M.sheetDayOf(form, date); // 월별 탭: 날짜 칸
            else if (c.kind === "calc") return; // 수수료·매익율은 시트 수식 그대로

            else if (c.kind === "field" && c.field === "하차지명") v = cell(o.하차지명);
            else v = o.시트추가값?.[c.id] != null ? cell(o.시트추가값[c.id]) : sheetForm(c, o);
            if (o.기사운임자동 === true && c.kind === "field" && (c.field === "기사운임" || c.field === "수수료")) v = ""; // 💸 자동 계산 기사운임은 시트에 안 씀
            if (v) vals.push({ ci, value: v });
            if (c.kind !== "no" && c.kind !== "sum" && c.kind !== "date" && !(c.kind === "field" && c.field === "하차지명")) base[c.id] = v;
          });
          appends.push({ g: g.name, afterRi: mt.lastRi, vals, base, ref: o.ref });
        });
      }
      // 시트에서 지워진 줄 — 모아 두었다가 아래에서 삭제(프로그램에서 추가해 시트에 넣을 줄·"유지"로 남긴 줄은 제외)
      const sheetRows = (p.groups[g.name] || []).filter((v) => nm(v[nameCol.id])).length;
      mine.forEach((o) => {
        if (matched.has(o.ref.path) || o.시트유지 || o.시트추가대기) return;
        goneAll.push({ o, safe: sheetRows > 0 }); // 그 묶음에 시트 줄이 하나도 없으면(못 읽었을 수 있음) 지우지 않는다
      });
    }
    // ⭐ 2026-11-04 시트에서 지운 줄 → 오더 삭제(서버가 휴지통에 7일 보관) — 한 탭에서 너무 많이 사라지면(시트 읽기 문제일 수 있음) 표시만
    if (goneAll.length) {
      const tooMany = goneAll.length > Math.max(5, Math.ceil(orders.length * 0.5));
      for (const { o, safe } of goneAll) {
        if (safe && !tooMany) {
          batch.delete(o.ref);
          batch.set(db.collection("deletedOrders").doc(`orders_${o.ref.id}`), { col: "orders", id: o.ref.id, at: FieldValue.serverTimestamp(), by: "구글시트 연동(시트에서 삭제)", companyName: co });
          ops += 2; sum.deleted = (sum.deleted || 0) + 1;
        } else if (!o.시트삭제됨) { batch.update(o.ref, { 시트삭제됨: true }); ops += 1; sum.gone += 1; }
      }
      if (tooMany) sum.goneHeld = (sum.goneHeld || 0) + goneAll.length;
    }
    if (ops) await batch.commit();
    if (pushes.length && writeCells) { await writeCells(tab, pushes); sum.pushed = (sum.pushed || 0) + pushes.length; hashes[tab] = ""; } // 시트를 고쳤으니 다음에 다시 읽기
    if (appends.length && writeCells && insertRows) {
      // 아래쪽 묶음부터 줄을 끼워 넣어야 위쪽 줄 번호가 안 밀린다
      const byPos = {}; appends.forEach((a) => { (byPos[a.afterRi] = byPos[a.afterRi] || []).push(a); });
      const done = [];
      for (const ri of Object.keys(byPos).map(Number).sort((a, b) => b - a)) {
        const list = byPos[ri];
        try {
          await insertRows(tab, ri + 1, list.length);
          const ups = []; list.forEach((a, k) => a.vals.forEach((x) => ups.push({ a1: `${colLetter(x.ci)}${ri + 2 + k}`, value: x.value })));
          if (ups.length) await writeCells(tab, ups);
          done.push(...list);
        } catch (e) { sum.appendFail = String(e?.message || e); }
      }
      if (done.length) {
        const b2 = db.batch();
        done.forEach((a) => b2.update(a.ref, { 시트추가대기: false, 시트기준값: a.base, 시트동기화: Date.now(), 시트줄: a.afterRi + 1 }));
        await b2.commit();
        sum.appended = (sum.appended || 0) + done.length; hashes[tab] = ""; inserted = true;
      }
    }
    return { inserted };
  };
  for (const tab of tabs) {
    let rows = await readTab(tab);
    const hash = require("crypto").createHash("md5").update(JSON.stringify(rows)).digest("hex");
    if (!monthMode) { await runUnit(tab, rows, hash, null); continue; }
    const ds = lastDays ? M.boardDatesIn(form, rows, tab).slice(-lastDays) : M.boardDatesIn(form, rows, tab, from, to);
    for (const d of ds) {
      const r = await runUnit(tab, M.boardRowsFor(form, rows, d, tab), hash, d);
      if (r.inserted) rows = await readTab(tab); // 줄을 끼워 넣었으면 줄 번호가 밀렸으니 다시 읽는다
    }
  }
  await db.collection("routeBoards").doc(form.id).set({ syncHash: hashes, syncedAt: Date.now() }, { merge: true });
  // 🔗 2026-11-08 시트의 거래처명(업체명) → 기본거래처(clients)에 없으면 자동 등록(같은 회사 · 이름만, 나머지는 거래처관리에서)
  if (newClients.size) {
    try {
      const snap = await db.collection("clients").where("companyName", "==", co).get();
      const have = new Set(snap.docs.map((d) => nm(d.data().거래처명 || d.data().업체명 || "")).filter(Boolean));
      const add = [...newClients].map((x) => cell(x)).filter((x) => x && x.length <= 60 && !have.has(nm(x)) && !/^#|정보\s*없음/.test(x));
      const seen = new Set();
      const b3 = db.batch(); let n3 = 0;
      for (const name of add) {
        if (seen.has(nm(name)) || n3 >= 200) continue; seen.add(nm(name));
        const key = name.replace(/[/\\#?[\]]/g, "_");
        const id = co && co !== "돌캐" ? `${co}__${key}` : key; // src/coKey.js coDocKey와 같은 규칙
        b3.set(db.collection("clients").doc(id), { id, 거래처명: name, companyName: co, 등록경로: "구글시트 배차표", 배차표Id: form.id, createdAt: FieldValue.serverTimestamp() }, { merge: true });
        n3 += 1;
      }
      if (n3) { await b3.commit(); sum.clientsAdded = n3; }
    } catch (e) { console.warn("[배차표 연동] 기본거래처 자동 등록 실패:", e?.message || e); }
  }
  // ⭐ 2026-11-03 [기간 가져오기]로 다시 가져온 날짜의 "지운 줄" 기억은 지운다(이후 자동 연동도 정상)
  if (range && !soft && form.삭제한줄 && sum.dates.length) {
    const ds = new Set(sum.dates.map((d) => nm(d).replace(/[^0-9a-z가-힣_-]/g, "_")));
    const next = Object.fromEntries(Object.entries(form.삭제한줄).filter(([k]) => !ds.has(k.split("__")[0])));
    if (Object.keys(next).length !== Object.keys(form.삭제한줄).length) await db.collection("routeBoards").doc(form.id).update({ 삭제한줄: next });
  }
  return sum;
}

module.exports = { syncBoard, parseBoardTab, ownerOf, tabDate, loadHM };
