// ======================= functions/dailyReport.js =======================
// 📊 2026-11-06 일일 경영 보고(DAILY REPORT) — 아침 푸시(·요약 메일)
//  · index.js의 dailyReportPush(30분마다, Asia/Seoul)가 부른다. 받는 시간(dailyReportPrefs/{uid}.time, 기본 07:30)이 된 사람에게
//    "오늘의 일일 경영 보고 · 11.05(목)" + 매출·수익률·월 누계 숫자를 FCM으로 보낸다(sendPushAndCleanup 그대로).
//    ⭐ 2026-11-08 "주의가 필요한 일"을 보고서에서 뺀 데 맞춰 푸시 문구의 미배차 안내도 뺐다.
//  · 받는 사람 = 임원 화면 역할(customRoles roleScreen "exec" — 화면 isExec · 규칙 isExecRoleUser와 같은 기준)
//    · dailyReportCompany/{회사}.recipients[uid] === false 면 보내지 않음 · 받는 요일(기본 월~금, 공휴일 제외)
//  · 계산은 src/dailyReportCore.js와 같은 규칙(CommonJS 복사본): 기준 = 직전 영업일 ~ 어제(월요일 → 금·토·일)
//    매출 = 취소·운송사 전송 제외 오더 청구운임, 수익 = 청구운임 − 기사운임(HomeDeck buildPastStats와 같음) + 고정노선 운송업체 설정
//  · 같은 사람에게 같은 날 두 번 보내지 않게 dailyReportLogs/{uid}_{날짜}를 먼저 만든다(create — 있으면 건너뜀)
const HOLIDAYS = new Set(["2025-01-01","2025-01-27","2025-01-28","2025-01-29","2025-01-30","2025-03-01","2025-03-03","2025-05-05","2025-05-06","2025-06-06","2025-08-15","2025-10-03","2025-10-05","2025-10-06","2025-10-07","2025-10-08","2025-10-09","2025-12-25","2026-01-01","2026-02-16","2026-02-17","2026-02-18","2026-03-01","2026-03-02","2026-05-05","2026-05-24","2026-05-25","2026-06-03","2026-06-06","2026-07-17","2026-08-15","2026-08-17","2026-09-24","2026-09-25","2026-09-26","2026-10-03","2026-10-05","2026-10-09","2026-12-25","2027-01-01","2027-02-06","2027-02-07","2027-02-08","2027-02-09","2027-03-01","2027-05-05","2027-05-13","2027-06-06","2027-07-17","2027-08-15","2027-08-16","2027-09-14","2027-09-15","2027-09-16","2027-10-03","2027-10-04","2027-10-09","2027-10-11","2027-12-25","2027-12-27","2028-01-01","2028-01-26","2028-01-27","2028-01-28","2028-03-01","2028-04-12","2028-05-02","2028-05-05","2028-06-06","2028-07-17","2028-08-15","2028-10-02","2028-10-03","2028-10-04","2028-10-05","2028-10-09","2028-12-25"]);
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const TIMES = (() => { const t = []; for (let h = 6; h <= 10; h++) { t.push(`${String(h).padStart(2, "0")}:00`); if (h < 10) t.push(`${String(h).padStart(2, "0")}:30`); } return t; })();
const toWon = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const addDay = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dowOf = (ymd) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
const isBizDay = (d) => { const w = dowOf(d); return w !== 0 && w !== 6 && !HOLIDAYS.has(d); };
const prevBizDay = (ymd) => { let d = addDay(ymd, -1); for (let i = 0; i < 14 && !isBizDay(d); i++) d = addDay(d, -1); return d; };
const md = (ymd) => `${Number(ymd.slice(5, 7))}.${ymd.slice(8, 10)}`;
const range = (a, b) => { const o = []; for (let d = a; d <= b && o.length < 400; d = addDay(d, 1)) o.push(d); return o; };
const fmt = (n) => Math.round(n || 0).toLocaleString("en-US");
const man = (w) => Math.round((w || 0) / 1e4);
const BUILTIN = new Set(["admin", "allMgr", "hrManager", "hrAcct", "hrStaff", "user", "test", "acctStaff", "salesMgr", "salesStaff", "legalMgr", "legalStaff", "devMgr", "devStaff", "viewer", "totalMaster", "driver", "shipper", "cafeUser"]);

function mergePrefs(p) {
  const x = p || {};
  return {
    time: TIMES.includes(x.time) ? x.time : "07:30",
    days: Array.isArray(x.days) ? x.days : [1, 2, 3, 4, 5],
    weekend: !!x.weekend,
    monday: { merge3: true, weekly: true, ...(x.monday || {}) },
    channels: { popup: true, push: true, email: false, ...(x.channels || {}) },
  };
}
function isReceiveDay(today, p) {
  if (HOLIDAYS.has(today)) return false;
  const w = dowOf(today);
  if (w === 0 || w === 6) return p.weekend && p.days.includes(w);
  return p.days.includes(w);
}
function basisOf(today, p) {
  const start = prevBizDay(today);
  let end = addDay(today, -1);
  if (end < start || p.monday.merge3 === false) end = start;
  const days = range(start, end);
  return { start, end, days, multi: days.length > 1, prev1: days.length > 1 ? days.map((d) => addDay(d, -7)) : [prevBizDay(start)], prev7: days.map((d) => addDay(d, -7)) };
}
// routeCarriers.makeIsCountable 복사본
const carrierKey = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();
function carrierOf(o) {
  const ex = o?.추가정보;
  if (ex && typeof ex === "object") {
    const direct = String(ex.운송업체 ?? "").trim(); if (direct) return direct;
    for (const k of Object.keys(ex)) if (/운송업체|운송사/.test(k)) { const v = String(ex[k] ?? "").trim(); if (v) return v; }
  }
  return String(o?.운송업체 ?? "").trim();
}
function makeIsCountable(setting) {
  if (!setting) return () => true;
  const off = new Set();
  (Array.isArray(setting.removed) ? setting.removed : []).forEach((n) => { const k = carrierKey(n); if (k) off.add(k); });
  (Array.isArray(setting.carriers) ? setting.carriers : []).forEach((c) => { const k = carrierKey(c?.name); if (!k) return; if (c.on === false) off.add(k); else off.delete(k); });
  return (o) => { if (!o?.배차표Id) return true; const c = carrierOf(o); if (!c) return false; return !off.has(carrierKey(c)); };
}
const isCancelled = (r) => r?.배차상태 === "배차취소" || ["취소", "배차취소", "오더취소", "취소됨"].includes(r?.상태);
const dateOf = (r) => String(r?.상차일자 || r?.상차일 || r?.상차 || "").slice(0, 10);

module.exports = function makeDailyReport({ db, FieldValue, sendPushAndCleanup, userTokens, sendMail, validMail, defaultCompany = "돌캐" }) {
  async function companyNumbers(co, today, p) {
    const b = basisOf(today, p);
    const ym = b.end.slice(0, 7);
    const from = [`${ym}-01`, b.prev7[0], b.prev1[0]].sort()[0];
    const setting = (await db.collection("routeCarrierSettings").doc(co).get().catch(() => null))?.data() || null;
    const countable = makeIsCountable(setting);
    const rows = [];
    for (const col of ["orders", "dispatch"]) {
      let q = db.collection(col).where("상차일", ">=", from).where("상차일", "<=", today);
      if (co !== defaultCompany) q = db.collection(col).where("companyName", "==", co).where("상차일", ">=", from).where("상차일", "<=", today);
      const snap = await q.get().catch((e) => { console.warn(`일일 경영 보고 ${co} ${col} 조회 실패:`, e?.message || e); return { docs: [] }; });
      snap.docs.forEach((d) => { const r = d.data() || {}; if ((r.companyName || defaultCompany) === co) rows.push(r); });
    }
    const byDay = {};
    rows.forEach((r) => {
      if (r.source === "transport_transmit" || isCancelled(r) || !countable(r)) return;
      const d = dateOf(r); if (!d) return;
      const e = byDay[d] || (byDay[d] = [0, 0, 0]); const s = toWon(r.청구운임); e[0] += s; e[1] += s - toWon(r.기사운임); e[2] += 1;
    });
    const sum = (days) => days.reduce((a, d) => { const v = byDay[d]; return v ? [a[0] + v[0], a[1] + v[1], a[2] + v[2]] : a; }, [0, 0, 0]);
    const cur = sum(b.days); const p7 = sum(b.prev7);
    const mtd = range(`${ym}-01`, b.end).reduce((s, d) => s + (byDay[d]?.[0] || 0), 0);
    const cs = (await db.collection("companySettings").doc(co).get().catch(() => null))?.data() || {};
    const target = (Number(cs?.매출목표?.순수매출목표) || 0) / 12;
    return { b, cur, p7, mtd, target };
  }
  function message(co, today, n) {
    const { b, cur, p7, mtd, target } = n;
    const lbl = b.multi ? `${md(b.start)}~${md(b.end)} ${b.days.length}일` : `${md(b.start)}(${DOW[dowOf(b.start)]})`;
    const d7 = p7[0] ? ((cur[0] - p7[0]) / Math.abs(p7[0])) * 100 : null;
    const margin = cur[0] ? (cur[1] / cur[0]) * 100 : 0;
    const title = `오늘의 일일 경영 보고 · ${lbl}`;
    const body = `매출 ${fmt(man(cur[0]))}만원${d7 == null ? "" : ` (${d7 >= 0 ? "▲" : "▼"}${Math.abs(d7).toFixed(1)}% 전주비)`} · 수익률 ${margin.toFixed(1)}% · 월 누계 ${fmt(man(mtd))}만원${target > 0 ? ` (목표 ${((mtd / target) * 100).toFixed(1)}%)` : ""}`;
    return { title, body, lbl };
  }

  async function run({ now = Date.now(), force = false, onlyUid = "", dryRun = false } = {}) {
    const k = new Date(now + 9 * 3600e3);
    const today = k.toISOString().slice(0, 10);
    const slot = `${String(k.getUTCHours()).padStart(2, "0")}:${k.getUTCMinutes() < 30 ? "00" : "30"}`;
    if (!force && !TIMES.includes(slot)) return { today, slot, sent: 0, skipped: "발송 시간대 아님" };
    // 임원 화면 역할 — 공통 역할(customRoles) + 운송사별 덮어쓰기(companyRoleOverrides/{회사}.roles)
    const roleSnap = await db.collection("customRoles").get().catch(() => ({ docs: [] }));
    const roles = {}; roleSnap.docs.forEach((d) => { roles[d.id] = d.data() || {}; });
    const ovCache = new Map();
    const overrideOf = async (co) => { if (!ovCache.has(co)) ovCache.set(co, (await db.collection("companyRoleOverrides").doc(co).get().catch(() => null))?.data()?.roles || {}); return ovCache.get(co); };
    const isExecRole = async (u) => {
      const r = String(u.role || ""); if (!r || BUILTIN.has(r)) return false;
      const g = roles[r]; const o = (await overrideOf(String(u.companyName || defaultCompany)))[r] || null;
      if (!g && !o) return false;
      const scr = o && "screen" in o ? o.screen : g?.screen;
      const lbl = (o?.label || g?.label || r);
      return typeof scr === "string" ? scr === "exec" : /임원/.test(String(lbl));
    };
    const prefSnap = await db.collection("dailyReportPrefs").get().catch(() => ({ docs: [] }));
    const prefs = {}; prefSnap.docs.forEach((d) => { prefs[d.id] = d.data() || {}; });
    const users = await db.collection("users").get();
    const coRecip = new Map();
    const recipOf = async (co) => { if (!coRecip.has(co)) coRecip.set(co, (await db.collection("dailyReportCompany").doc(co).get().catch(() => null))?.data()?.recipients || {}); return coRecip.get(co); };
    const numCache = new Map();
    const out = [];
    for (const d of users.docs) {
      const uid = d.id; const u = d.data() || {};
      if (onlyUid && uid !== onlyUid) continue;
      if (u.approved === false || u.employmentStatus === "퇴사") continue;
      const p = mergePrefs(prefs[uid]);
      if (!force && (p.time !== slot || !isReceiveDay(today, p))) continue;
      if (!p.channels.push && !p.channels.email) continue;
      if (!(await isExecRole(u))) continue;
      const co = String(u.companyName || defaultCompany).trim();
      if ((await recipOf(co))[uid] === false) continue;
      const tokens = p.channels.push ? userTokens(u) : [];
      const mail = p.channels.email && validMail(u.email) ? String(u.email).trim() : "";
      if (!tokens.length && !mail) continue;
      if (!dryRun) {
        try { await db.collection("dailyReportLogs").doc(`${uid}_${today}`).create({ uid, companyName: co, date: today, slot, at: FieldValue.serverTimestamp() }); }
        catch { out.push({ uid, skipped: "이미 보냄" }); continue; }
      }
      const key = `${co}|${p.monday.merge3 === false ? 1 : 3}`;
      if (!numCache.has(key)) numCache.set(key, await companyNumbers(co, today, p));
      const msg = message(co, today, numCache.get(key));
      if (dryRun) { out.push({ uid, co, ...msg, tokens: tokens.length, mail }); continue; }
      if (tokens.length) await sendPushAndCleanup(tokens, { notification: { title: msg.title, body: msg.body }, data: { type: "daily_report", date: today }, android: { priority: "high" } }, "일일 경영 보고").catch((e) => console.error("일일 경영 보고 푸시 실패:", e));
      if (mail) {
        const html = `<div style="font-family:'Noto Sans KR','Malgun Gothic',sans-serif;max-width:560px;margin:0 auto;border:1px solid #E3E8F0;border-radius:16px;overflow:hidden"><div style="background:linear-gradient(135deg,#0B1428,#1B2B4B);color:#fff;padding:20px 24px"><div style="font-size:12px;letter-spacing:.24em;color:#8FB0F0;font-weight:800">DAILY REPORT</div><div style="font-size:21px;font-weight:900;margin-top:4px">${msg.title}</div><div style="font-size:13px;color:#B9C6E0;margin-top:4px">${co}</div></div><div style="padding:22px 24px;font-size:15px;line-height:1.75;color:#1B2B4B">${msg.body}<br><br><span style="color:#5B6B85;font-size:13px">전체 보고서는 LogisWeb › 일일 경영 보고에서 볼 수 있습니다.</span></div></div>`;
        await sendMail([mail], `[LogisWeb] ${msg.title} (${co})`, html).catch((e) => console.error("일일 경영 보고 메일 실패:", e?.message || e));
      }
      out.push({ uid, co, push: tokens.length, mail: !!mail });
    }
    console.log(`📊 일일 경영 보고 ${today} ${slot}: ${out.length}명`, JSON.stringify(out).slice(0, 1500));
    return { today, slot, sent: out.filter((x) => !x.skipped).length, results: out };
  }
  return { run };
};
