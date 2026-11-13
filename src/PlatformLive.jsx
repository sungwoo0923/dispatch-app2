// ======================= src/PlatformLive.jsx =======================
// ⭐ 2026-11-02 관리자센터 — 실시간 데이터 층 + 운영 위젯
//  문제: 관리센터 숫자가 siteConfig/platformStats(하루 1번 집계)만 읽어서
//   ① 새로 가입한 직원이 다음 날까지 안 보이고 ② 접속 수가 "세션 문서(기기, 오래된 기기 포함)" 개수라 부풀려졌다.
//  해결: 최고관리자 화면에서 users · loginSessions(active==true)를 직접 구독해 회사별
//   직원/관리자/승인대기/기사/지금 접속(10분)/24시간 접속을 "사람(uid)" 기준으로 바로 계산하고 캐시 숫자를 덮어쓴다.
//   오더·운송액은 무거워서 캐시(집계 문서)를 그대로 쓰고, 화면에 "집계 시각 HH:MM · 다시 집계"를 보여 준다.
//  회사명은 앞뒤 공백을 지워(trim) 묶고, 공백·(주)·주식회사만 다른 비슷한 이름은 경고 목록으로 보여 준다.
//  ⭐ 알록달록 금지 — 네이비 계열만.
import React from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { ROLE_LABELS as BASE_ROLE_LABELS } from "./customRoles";

export const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const TM_EMAIL = "tjddnqkf@naver.com";
export const NOW_MS = 10 * 60 * 1000;
const DAY_MS = 86400000;
export const PLAN_NAMES = { lite: "라이트", basic: "베이직", standard: "스탠다드", pro: "프로" };
export const ROLE_LABELS = { ...BASE_ROLE_LABELS, superadmin: "슈퍼관리자" }; // 역할 이름은 customRoles.js와 같게
const pad = (n) => String(n).padStart(2, "0");
export const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : v?._seconds ? v._seconds * 1000 : typeof v === "number" ? v : 0);
export const normCo = (s) => String(s || "").trim();
// 비슷한 회사명 판단용 — 공백·(주)·㈜·주식회사·유한회사를 지우고 소문자
export const coKey = (s) => normCo(s).replace(/\(\s*주\s*\)|㈜|주식회사|\(\s*유\s*\)|유한회사/g, "").replace(/\s+/g, "").toLowerCase();
export const hhmm = (ms) => { if (!ms) return "--:--"; const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const agoText = (ms, now = Date.now()) => {
  if (!ms) return "기록 없음";
  const m = Math.floor((now - ms) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / 1440)}일 전`;
};
const ymdOf = (ms) => (ms ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 10) : "");
const kstMonth = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
const isTM = (u) => u && (u.role === "totalMaster" || u.email === TM_EMAIL);

// ─── 구독 ───
function useLiveCol(make, deps) {
  const [list, setList] = React.useState(null);
  React.useEffect(() => {
    let q;
    try { q = make(); } catch { setList([]); return undefined; }
    return onSnapshot(q, (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList((v) => v || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return list;
}

const Ctx = React.createContext(null);
export const usePlatformLive = () => React.useContext(Ctx);

// 최고관리자 화면(PlatformCenter) 맨 바깥에 한 번만 — 자식 화면들이 같은 구독을 나눠 쓴다
export function PlatformLiveProvider({ children }) {
  const users = useLiveCol(() => collection(db, "users"), []);
  const sessions = useLiveCol(() => query(collection(db, "loginSessions"), where("active", "==", true)), []);
  const tApps = useLiveCol(() => collection(db, "transportApplications"), []);
  const cApps = useLiveCol(() => collection(db, "companyApplications"), []);
  const planReqs = useLiveCol(() => query(collection(db, "planRequests"), orderBy("createdAt", "desc"), limit(200)), []);
  const inquiries = useLiveCol(() => query(collection(db, "landingInquiries"), orderBy("createdAt", "desc"), limit(300)), []);
  const plans = useLiveCol(() => collection(db, "companyPlans"), []);
  const invoices = useLiveCol(() => collection(db, "platformInvoices"), []);
  // ⭐ 2026-11-02 원격지원 — 직원의 원격 지원 요청(승인 대기 수를 처리 대기·메뉴 배지에)
  const supportReqs = useLiveCol(() => query(collection(db, "supportRequests"), orderBy("createdAt", "desc"), limit(200)), []);
  // 30초마다 "지금/24시간" 경계를 다시 계산
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const value = React.useMemo(() => {
    const ready = !!(users && sessions);
    const userById = {};
    (users || []).forEach((u) => { userById[u.id] = u; });
    const companies = {};
    const shippers = {};
    const blank = (name) => ({ name, staff: 0, admins: 0, pending: 0, drivers: 0, quit: 0, onlineNow: 0, online24h: 0, onlinePc: 0, onlineMobile: 0, lastSeen: 0, staffList: [], lastSignup: 0 });
    const rec = (name) => companies[name] || (companies[name] = blank(name));
    const srec = (name) => shippers[name] || (shippers[name] = { name, users: 0, onlineNow: 0, online24h: 0, lastSeen: 0, pending: 0 });

    // 1) 계정
    (users || []).forEach((u) => {
      if (isTM(u) || u.role === "cafeUser") return;
      const name = normCo(u.companyName) || "돌캐";
      const created = tsMs(u.createdAt);
      if (u.role === "shipper") { const s = srec(name); s.users += 1; if (u.approved === false) s.pending += 1; return; }
      const c = rec(name);
      c.lastSignup = Math.max(c.lastSignup, created);
      if (u.role === "driver") { c.drivers += 1; return; }
      if (u.employmentStatus === "퇴사") { c.quit += 1; return; }
      c.staff += 1;
      if (u.role === "admin") c.admins += 1;
      if (u.approved === false) c.pending += 1;
      c.staffList.push({ uid: u.id, name: u.name || u.email || "-", email: u.email || "", role: u.role || "", team: u.team || "", position: u.position || "", approved: u.approved !== false, createdAt: created, lastSeen: 0, now: false, pc: 0, mobile: 0 });
    });

    // 2) 접속 — 사람(uid) 기준으로 묶는다
    const people = {};
    (sessions || []).forEach((s) => {
      if (s.role === "totalMaster" || s.email === TM_EMAIL) return;
      const u = userById[s.uid];
      if (isTM(u)) return;
      const seen = Math.max(tsMs(s.lastSeen), tsMs(s.createdAt));
      const uid = s.uid || s.id;
      const kind = s.kind === "mobile" ? "mobile" : "pc";
      const p = people[uid] || (people[uid] = {
        uid, name: u?.name || s.name || s.email || "-", email: u?.email || s.email || "",
        company: normCo(u?.companyName || s.companyName) || "돌캐", role: u?.role || s.role || "", team: u?.team || "",
        lastSeen: 0, pc: 0, mobile: 0, devices: [],
      });
      p.lastSeen = Math.max(p.lastSeen, seen);
      p[kind] = Math.max(p[kind], seen);
      // 📍 2026-11-13 지금 보는 화면 — 가장 최근에 화면을 바꾼 기기 기준(src/screenReport.js)
      if (s.screen && Number(s.screenAt || 0) >= (p.screenAt || 0)) { p.screen = s.screen; p.screenAt = Number(s.screenAt || 0); p.screenApp = s.screenApp || kind; p.screenHidden = !!s.screenHidden; p.ver = s.appVer || ""; p.build = s.appBuild || ""; }
      p.devices.push({ kind, device: s.device || "", seen });
    });
    const plist = Object.values(people);
    plist.forEach((p) => {
      p.now = now - p.lastSeen < NOW_MS;
      p.day = now - p.lastSeen < DAY_MS;
      p.isShipper = p.role === "shipper";
      const t = p.isShipper ? srec(p.company) : (companies[p.company] || (p.day ? rec(p.company) : null));
      if (!t) return;
      t.lastSeen = Math.max(t.lastSeen, p.lastSeen);
      if (p.day) t.online24h += 1;
      if (p.now) t.onlineNow += 1;
      if (!p.isShipper) {
        if (now - p.pc < DAY_MS) t.onlinePc += 1;
        if (now - p.mobile < DAY_MS) t.onlineMobile += 1;
        const st = t.staffList.find((x) => x.uid === p.uid);
        if (st) Object.assign(st, { lastSeen: p.lastSeen, now: p.now, pc: p.pc, mobile: p.mobile, screen: p.screen, screenAt: p.screenAt, screenApp: p.screenApp, screenHidden: p.screenHidden });
      }
    });
    const onlineList = plist.filter((p) => p.day).sort((a, b) => b.lastSeen - a.lastSeen);
    const totals = {
      onlineNow: onlineList.filter((p) => p.now).length,
      online24h: onlineList.length,
      pcNow: onlineList.filter((p) => now - p.pc < NOW_MS).length,
      mobileNow: onlineList.filter((p) => now - p.mobile < NOW_MS).length,
      pc24h: onlineList.filter((p) => now - p.pc < DAY_MS).length,
      mobile24h: onlineList.filter((p) => now - p.mobile < DAY_MS).length,
      shipperNow: onlineList.filter((p) => p.now && p.isShipper).length,
      shipper24h: onlineList.filter((p) => p.isShipper).length,
      staff: Object.values(companies).reduce((a, c) => a + c.staff, 0),
      drivers: Object.values(companies).reduce((a, c) => a + c.drivers, 0),
      pendingStaff: Object.values(companies).reduce((a, c) => a + c.pending, 0),
      shipperUsers: Object.values(shippers).reduce((a, s) => a + s.users, 0),
    };

    // 3) 가입 신청 기본정보(회사별)
    const appInfo = {};
    (tApps || []).forEach((a) => {
      const n = normCo(a.companyName); if (!n || a.status === "rejected") return;
      const cur = appInfo[n] || (appInfo[n] = { appliedAt: 0, code: "", rep: "", phone: "" });
      if (a.type === "신규" || !cur.appliedAt) cur.appliedAt = tsMs(a.createdAt) || cur.appliedAt;
      cur.code = cur.code || a.companyCode || ""; cur.rep = cur.rep || a.representative || a.name || ""; cur.phone = cur.phone || a.phone || "";
    });

    // 4) 처리 대기
    const pendingT = (tApps || []).filter((a) => a.status === "pending").sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
    const pendingC = (cApps || []).filter((a) => a.status === "pending").sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
    const openPlanReqs = (planReqs || []).filter((r) => r.status === "요청");
    const newInquiries = (inquiries || []).filter((q) => !q.status || q.status === "신규");
    const pendingSupport = (supportReqs || []).filter((r) => r.status === "pending"); // ⭐ 2026-11-02 원격지원 —
    const pendingStaffByCo = Object.values(companies).filter((c) => c.pending > 0).map((c) => ({ name: c.name, n: c.pending })).sort((a, b) => b.n - a.n);

    // 5) 최근 가입(회사·직원) — 30일
    const since = now - 30 * DAY_MS;
    const signups = [];
    (tApps || []).forEach((a) => { const at = tsMs(a.createdAt); if (at > since && a.type === "신규") signups.push({ id: `t_${a.id}`, kind: "carrier", title: normCo(a.companyName), sub: `운송사 가입 신청 · ${a.name || a.representative || ""}`, status: a.status, at }); });
    (cApps || []).forEach((a) => { const at = tsMs(a.createdAt); if (at > since) signups.push({ id: `c_${a.id}`, kind: "shipper", title: normCo(a.companyName), sub: `화주사 가입 · ${a.name || ""}`, status: a.status, at }); });
    (users || []).forEach((u) => {
      const at = tsMs(u.createdAt); if (at <= since || isTM(u) || u.role === "cafeUser" || u.role === "shipper") return;
      signups.push({ id: `u_${u.id}`, kind: u.role === "driver" ? "driver" : "staff", title: u.name || u.email || "-", sub: `${normCo(u.companyName) || "돌캐"} · ${u.role === "driver" ? "기사" : (ROLE_LABELS[u.role] || "직원")}${u.position ? ` · ${u.position}` : ""}`, status: u.approved === false ? "pending" : "approved", at, company: normCo(u.companyName) });
    });
    signups.sort((a, b) => b.at - a.at);

    // 6) 비슷한 회사명(공백·(주)·주식회사 차이) — 숫자가 갈라진다
    const variants = {};
    const addName = (raw, w = 1) => { if (raw == null || raw === "") return; const k = coKey(raw); if (!k) return; const m = variants[k] || (variants[k] = {}); m[raw] = (m[raw] || 0) + w; };
    (users || []).forEach((u) => { if (!isTM(u) && u.role !== "cafeUser") addName(String(u.companyName || "")); });
    (tApps || []).forEach((a) => { if (a.status !== "rejected") addName(String(a.companyName || "")); });
    (cApps || []).forEach((a) => { if (a.status !== "rejected") addName(String(a.companyName || "")); });
    const dupes = Object.entries(variants).filter(([, m]) => Object.keys(m).length > 1)
      .map(([k, m]) => ({ key: k, names: Object.entries(m).sort((a, b) => b[1] - a[1]).map(([raw, n]) => ({ raw, n })) }));

    // 7) 요금제·청구
    const planMap = {}; (plans || []).forEach((p) => { planMap[p.id] = p; });
    const month = kstMonth();
    const invoiceMap = {}; (invoices || []).forEach((v) => { if (v.month === month) invoiceMap[normCo(v.company)] = v; });
    const planReqMap = {}; openPlanReqs.forEach((r) => { const n = normCo(r.company); (planReqMap[n] || (planReqMap[n] = [])).push(r); });

    // 🛠 2026-11-13 화주사 가입 · 연동 상태는 실시간 문서 기준 — 삭제 · 연동 해제하면 화주사 관제에서 바로 빠진다(집계본은 1시간마다라 늦다)
    const shipperApps = cApps ? {} : null;
    (cApps || []).forEach((a) => { if (!a.companyName || a.status === "rejected") return; const n = normCo(a.companyName); const cur = shipperApps[n];
      const rec = { status: a.status || "pending", code: a.companyCode || "", linked: a.linkedTransportCompany?.companyName || "", linkStatus: a.transportApprovalStatus || "", rep: a.name || "", phone: a.phone || a.phoneNumber || "" };
      if (!cur || (rec.linkStatus === "approved" && cur.linkStatus !== "approved") || (!cur.linked && rec.linked)) shipperApps[n] = rec; });

    return {
      ready, now, companies, shippers, shipperApps, onlineList, totals, appInfo, signups, dupes,
      pending: { transport: pendingT, shipper: pendingC, planReqs: openPlanReqs, inquiries: newInquiries, staffByCo: pendingStaffByCo, support: pendingSupport,
        total: pendingT.length + pendingC.length + openPlanReqs.length + newInquiries.length + pendingSupport.length },
      planMap, invoiceMap, planReqMap, month,
    };
  }, [users, sessions, tApps, cApps, planReqs, inquiries, plans, invoices, supportReqs, now]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ─── 캐시(집계 문서) + 실시간 합치기 ───
const EMPTY_ORDERS = () => ({ m: { cnt: 0, sale: 0, profit: 0 }, pm: { cnt: 0, sale: 0, profit: 0 }, pmSame: { cnt: 0, sale: 0 }, daily: {}, lastOrder: "", totalOrders: 0, places: 0, clients: 0, fleet: 0 });
export function mergeCompanies(statsCompanies, live) {
  const base = (statsCompanies || []).map((c) => ({ ...EMPTY_ORDERS(), onlineNow: 0, quit: 0, ...c, name: normCo(c.name) }));
  if (!live?.ready) return base;
  const map = new Map();
  base.forEach((c) => {
    const prev = map.get(c.name);
    if (!prev) { map.set(c.name, c); return; }
    // 같은 이름(공백만 다름)이 두 줄이면 오더 숫자를 합친다
    ["m", "pm"].forEach((k) => { prev[k] = { cnt: prev[k].cnt + c[k].cnt, sale: prev[k].sale + c[k].sale, profit: (prev[k].profit || 0) + (c[k].profit || 0) }; });
    prev.pmSame = { cnt: prev.pmSame.cnt + c.pmSame.cnt, sale: prev.pmSame.sale + c.pmSame.sale };
    prev.totalOrders += c.totalOrders; prev.lastOrder = prev.lastOrder > c.lastOrder ? prev.lastOrder : c.lastOrder;
  });
  Object.values(live.companies).forEach((l) => {
    if (!map.has(l.name)) {
      if (!l.staff && !l.drivers && !l.pending) return;
      const a = live.appInfo[l.name] || {};
      map.set(l.name, { ...EMPTY_ORDERS(), name: l.name, kind: "transport", appliedAt: a.appliedAt || l.lastSignup || 0, code: a.code || "", rep: a.rep || "", phone: a.phone || "", liveOnly: true });
    }
  });
  return [...map.values()].map((c) => {
    const l = live.companies[c.name] || null;
    return {
      ...c,
      staff: l?.staff || 0, admins: l?.admins || 0, pending: l?.pending || 0, drivers: l?.drivers || 0, quit: l?.quit || 0,
      online: l?.online24h || 0, onlineNow: l?.onlineNow || 0, onlinePc: l?.onlinePc || 0, onlineMobile: l?.onlineMobile || 0,
      lastSeen: Math.max(c.lastSeen || 0, l?.lastSeen || 0), staffList: l?.staffList || [], live: true,
      plan: live.planMap[c.name] || null, invoice: live.invoiceMap[c.name] || null, planReqs: live.planReqMap[c.name] || [],
    };
  });
}
export function mergeShippers(statsShippers, live) {
  let base = (statsShippers || []).map((s) => ({ ...s, name: normCo(s.name) }));
  if (!live?.ready) return base;
  const names = new Set(base.map((s) => s.name));
  Object.values(live.shippers).forEach((s) => { if (!names.has(s.name) && s.users) base.push({ name: s.name, kind: "shipper", status: "approved", users: 0, online: 0, lastSeen: 0 }); });
  // 가입 문서가 지워진 화주사(계정도 없음)는 뺀다 · 연동 상태는 지금 문서 값으로
  const apps = live.shipperApps;
  if (apps) base = base.filter((s) => apps[s.name] || live.shippers[s.name]?.users).map((s) => (apps[s.name] ? { ...s, ...apps[s.name] } : { ...s, linked: "", linkStatus: "" }));
  return base.map((s) => { const l = live.shippers[s.name]; return l ? { ...s, users: l.users, online: l.online24h, onlineNow: l.onlineNow, lastSeen: Math.max(s.lastSeen || 0, l.lastSeen) } : { ...s, users: 0, online: 0, onlineNow: 0 }; });
}

// ═══════════════════════ 작은 부품 ═══════════════════════
export function Panel({ code, title, right, children, bodyClass = "p-4 sm:p-5", className = "" }) {
  return (
    <section className={`bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)] overflow-hidden min-w-0 flex flex-col ${className}`}>
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 min-h-[50px] py-2 bg-[#F7F9FC] border-b border-[#E8EDF4] flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B] shrink-0" />
          {code && <span className="text-[10.5px] font-extrabold tracking-[0.2em] text-[#94A3B8] whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{code}</span>}
          <span className="text-[15px] sm:text-[16px] font-black text-[#0F1A30] truncate whitespace-nowrap">{title}</span>
        </div>
        {right}
      </div>
      <div className={`flex-1 min-h-0 ${bodyClass}`}>{children}</div>
    </section>
  );
}
// 상태 알약 — tone: dark(강조) · solid(네이비) · soft(옅은) · line(테두리) · dash(휴면/주의)
export function Pill({ tone = "soft", children, title }) {
  const cls = {
    dark: "bg-[#0F1A30] text-white border-[#0F1A30]",
    solid: "bg-[#1B2B4B] text-white border-[#1B2B4B]",
    soft: "bg-[#EEF3FB] text-[#1B2B4B] border-[#D5E0F2]",
    line: "bg-white text-[#1B2B4B] border-[#1B2B4B]",
    dash: "bg-white text-[#64748B] border-dashed border-[#94A3B8]",
  }[tone];
  return <span title={title} className={`inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[12px] font-extrabold whitespace-nowrap ${cls}`}>{children}</span>;
}
export function LiveDot({ on, size = 8 }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {on && <span className="absolute inset-0 rounded-full bg-[#6E95E8] opacity-60 animate-ping" />}
      <span className={`relative inline-flex rounded-full ${on ? "bg-[#2D4C82]" : "border-[1.5px] border-[#B6C2D6] bg-white"}`} style={{ width: size, height: size }} />
    </span>
  );
}
// 가벼운 스파크라인(SVG) — 카드가 많아 recharts 대신
export function Spark({ values = [], width = 120, height = 30, stroke = "#2D4C82", fill = true }) {
  const gid = React.useId().replace(/:/g, "");
  const n = values.length;
  if (!n) return <svg width={width} height={height} />;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [n === 1 ? width : (i / (n - 1)) * width, height - 2 - (v / max) * (height - 4)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block", maxWidth: width }}>
      {fill && <defs><linearGradient id={`sp${gid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={stroke} stopOpacity="0.28" /><stop offset="1" stopColor={stroke} stopOpacity="0" /></linearGradient></defs>}
      {fill && <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#sp${gid})`} />}
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
const Avatar = ({ name, on }) => (
  <span className={`relative w-9 h-9 rounded-xl flex items-center justify-center text-[13px] font-black shrink-0 ${on ? "bg-[#1B2B4B] text-white" : "bg-[#EEF2F8] text-[#5B6B85]"}`}>
    {String(name || "?").trim().slice(0, 1)}
    <span className="absolute -right-0.5 -bottom-0.5"><LiveDot on={on} size={9} /></span>
  </span>
);
const KindChips = ({ p, now }) => (
  <span className="inline-flex gap-1">
    {now - p.pc < DAY_MS && <span className={`h-6 px-2 rounded-md text-[10.5px] font-extrabold inline-flex items-center ${now - p.pc < NOW_MS ? "bg-[#1B2B4B] text-white" : "bg-[#EEF2F8] text-[#5B6B85]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>PC</span>}
    {now - p.mobile < DAY_MS && <span className={`h-6 px-2 rounded-md text-[10.5px] font-extrabold inline-flex items-center ${now - p.mobile < NOW_MS ? "bg-[#1B2B4B] text-white" : "bg-[#EEF2F8] text-[#5B6B85]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>MOBILE</span>}
  </span>
);

// 집계 시각 HH:MM · 다시 집계
export function StatsStamp({ updatedAtMs, busy, onRefresh, dark = true }) {
  const stale = updatedAtMs && Date.now() - updatedAtMs > 2 * 3600e3;
  return (
    <span className={`inline-flex items-center gap-2 h-10 pl-3 pr-1 rounded-xl text-[13px] font-bold whitespace-nowrap ${dark ? "bg-white/10 ring-1 ring-white/20 text-white" : "bg-[#F4F7FC] ring-1 ring-[#DCE3EE] text-[#1B2B4B]"}`}>
      <span className={dark ? "text-white/60" : "text-[#7A879C]"}>오더 집계</span>
      <b style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{updatedAtMs ? `${ymdOf(updatedAtMs) === ymdOf(Date.now()) ? "" : `${ymdOf(updatedAtMs).slice(5)} `}${hhmm(updatedAtMs)}` : "집계 전"}</b>
      {stale && <span className={`text-[11px] font-black px-1.5 rounded ${dark ? "bg-white text-[#0F1A30]" : "bg-[#0F1A30] text-white"}`}>오래됨</span>}
      <button type="button" onClick={onRefresh} disabled={busy} className={`h-8 px-3 rounded-lg text-[13px] font-black inline-flex items-center gap-1.5 ${dark ? "bg-white text-[#0F1A30]" : "bg-[#1B2B4B] text-white"} disabled:opacity-60`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={busy ? "pm-spin" : ""}><path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3" /><path d="M5 3v5h5M19 21v-5h-5" /></svg>
        {busy ? "집계 중…" : "다시 집계"}
      </button>
    </span>
  );
}

// 📍 지금 보는 화면 칩 — 접속 중일 때만. "배차현황 · 3분째" / 창을 가리면 "자리 비움"
const stayText = (ms, now) => { const s = Math.max(0, Math.round((now - ms) / 1000)); return s < 60 ? "방금" : s < 3600 ? `${Math.floor(s / 60)}분째` : `${Math.floor(s / 3600)}시간째`; };
export function ScreenChip({ p, now }) {
  if (!p?.screen || !p.now) return null;
  const app = p.screenApp === "mobile" ? "모바일" : p.screenApp === "shipper" ? "화주" : "PC";
  return (
    <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md border border-[#DCE3EE] bg-white text-[12px] font-black whitespace-nowrap max-w-full" title={`${app} · ${p.screen}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${p.screenHidden ? "bg-[#C3CDDD]" : "bg-[#1B2B4B]"}`} />
      <span className={`truncate ${p.screenHidden ? "text-[#94A3B8]" : "text-[#1B2B4B]"}`}>{p.screen}</span>
      <span className="text-[#94A3B8] font-bold">{p.screenHidden ? "자리 비움" : stayText(p.screenAt, now)}</span>
      {p.ver ? <span className="text-[#B6C2D6] font-bold tabular-nums">v{p.ver}</span> : null}
    </span>
  );
}

// ═══════════════════════ 지금 접속 중 ═══════════════════════
export function LiveNowPanel({ compact = false, onMore, onCompany }) {
  const live = usePlatformLive();
  const [mode, setMode] = React.useState("now");
  const [q, setQ] = React.useState("");
  const [who, setWho] = React.useState("all");
  if (!live) return null;
  const { onlineList, now, totals } = live;
  const rows = onlineList.filter((p) => (mode === "now" ? p.now : true) && (who === "all" || (who === "shipper" ? p.isShipper : !p.isShipper))
    && (!q.trim() || [p.name, p.company, p.email].some((v) => String(v || "").includes(q.trim()))));
  const shown = compact ? rows.slice(0, 8) : rows;
  const seg = (k, l, n) => (
    <button key={k} type="button" onClick={() => setMode(k)} className={`h-8 px-3 rounded-lg text-[13px] font-black whitespace-nowrap ${mode === k ? "bg-[#1B2B4B] text-white" : "text-[#5B6B85] hover:bg-white"}`}>{l} <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{n}</span></button>
  );
  return (
    <Panel code="LIVE" title="지금 접속 중" bodyClass="p-0"
      right={<div className="flex items-center gap-1 p-1 rounded-xl bg-[#EEF2F8]">{seg("now", "10분", totals.onlineNow)}{seg("day", "24시간", totals.online24h)}</div>}>
      {!compact && (
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-b border-[#EEF1F6]">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·회사·이메일" className="h-10 w-full sm:w-64 px-3 rounded-xl border border-[#DCE3EE] text-[14px] outline-none" />
          <div className="flex gap-1">{[["all", "전체"], ["carrier", "운송사"], ["shipper", "화주사"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setWho(k)} className={`h-10 px-3.5 rounded-xl text-[13.5px] font-black border ${who === k ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-[#DCE3EE] text-[#3A4A66] bg-white"}`}>{l}</button>))}</div>
          <span className="sm:ml-auto text-[12.5px] text-[#7A879C] font-semibold">한 사람이 PC·휴대폰 둘 다 써도 1명 · 5분마다 활동 기록</span>
        </div>
      )}
      {!live.ready ? <div className="py-12 text-center text-[#9AA9C3]">불러오는 중…</div>
        : shown.length === 0 ? <div className="py-12 text-center text-[#9AA9C3] text-[14px]">{mode === "now" ? "최근 10분 안에 활동한 사람이 없습니다" : "최근 24시간 접속이 없습니다"}</div> : (
          <ul className={`divide-y divide-[#EEF1F6] ${compact ? "" : "max-h-[640px] overflow-y-auto"}`}>
            {shown.map((p) => (
              // ⭐ 2026-11-02 관리자센터2 — 줄 높이 64px · 기기 칩과 "N분 전"을 한 줄에 나란히(세로로 눌려 보이던 문제) · 시간은 고정폭 칸 · 줄바꿈 없음
              <li key={p.uid} className="flex items-center gap-3 px-4 sm:px-5 min-h-[66px] py-3 hover:bg-[#F7F9FC]">
                <Avatar name={p.name} on={p.now} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[15.5px] font-black text-[#0F1A30] truncate leading-tight">{p.name}</span>
                    <span className="text-[13px] font-bold text-[#7A879C] whitespace-nowrap">{ROLE_LABELS[p.role] || p.role || ""}</span>
                  </div>
                  <button type="button" onClick={() => onCompany?.(p.company)} className="block max-w-full mt-0.5 text-left text-[13.5px] font-semibold text-[#5B6B85] truncate hover:underline leading-tight">{p.isShipper ? "화주 · " : ""}{p.company}</button>
                </div>
                <div className="hidden sm:block shrink min-w-0"><ScreenChip p={p} now={now} /></div>
                <div className="shrink-0 flex items-center gap-2.5 sm:gap-3">
                  <KindChips p={p} now={now} />
                  <span className={`min-w-[64px] text-right text-[14.5px] font-black whitespace-nowrap tabular-nums ${p.now ? "text-[#1B2B4B]" : "text-[#94A3B8]"}`}>{agoText(p.lastSeen, now)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      {compact && rows.length > 0 && (
        <button type="button" onClick={onMore} className="w-full h-11 border-t border-[#EEF1F6] text-[13.5px] font-black text-[#1B2B4B] hover:bg-[#F7F9FC]">
          {rows.length > shown.length ? `${rows.length - shown.length}명 더 · ` : ""}전체 접속 현황 보기 ›
        </button>
      )}
    </Panel>
  );
}

// ═══════════════════════ 최근 가입 타임라인 ═══════════════════════
const SIGN_LABEL = { carrier: "운송사", shipper: "화주사", staff: "직원", driver: "기사" };
export function SignupTimeline({ max = 12, onCompany }) {
  const live = usePlatformLive();
  const [kind, setKind] = React.useState("all");
  if (!live) return null;
  const list = live.signups.filter((s) => kind === "all" || (kind === "company" ? ["carrier", "shipper"].includes(s.kind) : ["staff", "driver"].includes(s.kind))).slice(0, max);
  let lastDay = "";
  return (
    <Panel code="SIGNUPS" title="최근 가입 (30일)" bodyClass="p-0"
      right={<div className="flex items-center gap-1 p-1 rounded-xl bg-[#EEF2F8]">{[["all", "전체"], ["company", "회사"], ["people", "직원·기사"]].map(([k, l]) => (
        <button key={k} type="button" onClick={() => setKind(k)} className={`h-8 px-2.5 rounded-lg text-[12.5px] font-black whitespace-nowrap ${kind === k ? "bg-[#1B2B4B] text-white" : "text-[#5B6B85]"}`}>{l}</button>))}</div>}>
      {list.length === 0 ? <div className="py-12 text-center text-[#9AA9C3] text-[14px]">최근 30일 가입이 없습니다</div> : (
        <ol className="px-4 sm:px-5 py-3">
          {list.map((s) => {
            const day = ymdOf(s.at);
            const head = day !== lastDay; lastDay = day;
            const company = s.kind === "carrier" || s.kind === "shipper";
            return (
              <React.Fragment key={s.id}>
                {head && <li className="pt-2 pb-1 text-[11px] font-extrabold tracking-[0.14em] text-[#94A3B8]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{day.slice(5).replace("-", ".")} {["일", "월", "화", "수", "목", "금", "토"][new Date(`${day}T00:00:00`).getDay()]}</li>}
                <li className="relative pl-6 py-1.5">
                  <span className={`absolute left-[5px] top-[13px] w-2.5 h-2.5 ${company ? "rotate-45 bg-[#1B2B4B]" : "rounded-full border-2 border-[#6E8BC4] bg-white"}`} />
                  <span className="absolute left-[9.5px] top-[26px] bottom-[-8px] w-px bg-[#E3E8F0]" />
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[11px] font-extrabold px-1.5 h-5 inline-flex items-center rounded ${company ? "bg-[#0F1A30] text-white" : "bg-[#EEF2F8] text-[#1B2B4B]"}`}>{SIGN_LABEL[s.kind]}</span>
                    <button type="button" onClick={() => onCompany?.(company ? s.title : s.company)} className={`truncate text-left text-[14px] ${company ? "font-black" : "font-bold"} text-[#0F1A30] hover:underline`}>{s.title}</button>
                    {s.status === "pending" && <Pill tone="line">승인 대기</Pill>}
                    <span className="ml-auto text-[11.5px] text-[#94A3B8] font-bold whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{hhmm(s.at)}</span>
                  </div>
                  <div className="text-[12.5px] text-[#7A879C] font-semibold truncate">{s.sub}</div>
                </li>
              </React.Fragment>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

// ═══════════════════════ 처리 대기 ═══════════════════════
export function PendingPanel({ go }) {
  const live = usePlatformLive();
  if (!live) return null;
  const P = live.pending;
  const rows = [
    { k: "APPLY", label: "운송사 가입 승인 대기", n: P.transport.length, sub: P.transport.slice(0, 3).map((a) => `${normCo(a.companyName)}${a.type && a.type !== "신규" ? `(${a.type})` : ""}`).join(" · "), to: "applications" },
    { k: "SHIP", label: "화주사 가입 승인 대기", n: P.shipper.length, sub: P.shipper.slice(0, 3).map((a) => normCo(a.companyName)).join(" · "), to: "applications" },
    { k: "PLAN", label: "요금제 변경 요청", n: P.planReqs.length, sub: P.planReqs.slice(0, 3).map((r) => `${r.company} → ${PLAN_NAMES[r.to] || r.toName || r.to || ""}`).join(" · "), to: "payments" },
    { k: "HELP", label: "원격 지원 요청", n: P.support.length, sub: P.support.slice(0, 3).map((r) => `${normCo(r.companyName)} ${r.name || ""}`).join(" · "), to: "support" }, // ⭐ 2026-11-02 원격지원 —
    { k: "LEAD", label: "미답변 도입 문의", n: P.inquiries.length, sub: P.inquiries.slice(0, 3).map((q) => q.companyName || q.name || "").join(" · "), to: "inquiries" },
  ];
  return (
    <Panel code="QUEUE" title="처리 대기" right={<span className="text-[13px] font-black text-[#1B2B4B]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{P.total}건</span>} bodyClass="p-2">
      {rows.map((r) => (
        <button key={r.k} type="button" onClick={() => go?.(r.to)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F5F8FD] text-left">
          <span className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-[18px] font-black ${r.n ? "bg-[#0F1A30] text-white" : "bg-[#F1F4F9] text-[#B6C2D6]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{r.n}</span>
          <span className="flex-1 min-w-0">
            <span className={`block text-[14px] font-black ${r.n ? "text-[#0F1A30]" : "text-[#94A3B8]"}`}>{r.label}</span>
            <span className="block text-[12px] text-[#7A89A3] truncate">{r.n ? r.sub : "없음"}</span>
          </span>
          <span className="text-[#9AA9C3]">›</span>
        </button>
      ))}
      {P.staffByCo.length > 0 && (
        <div className="mx-2 mt-1 mb-1 px-3 py-2.5 rounded-xl bg-[#F7F9FC] border border-[#E8EDF4]">
          <div className="text-[12px] font-extrabold text-[#5B6B85] mb-1.5">직원 승인 대기 (각 운송사 관리자가 승인)</div>
          <div className="flex flex-wrap gap-1.5">{P.staffByCo.slice(0, 10).map((c) => <Pill key={c.name} tone="soft">{c.name} <b style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{c.n}</b></Pill>)}</div>
        </div>
      )}
    </Panel>
  );
}

// ═══════════════════════ 비슷한 회사명 경고 ═══════════════════════
const showRaw = (s) => `"${String(s).replace(/ /g, "␣")}"`;
export function DupeWarning({ compact = false }) {
  const live = usePlatformLive();
  const [open, setOpen] = React.useState(!compact);
  if (!live || !live.dupes.length) return null;
  return (
    <div className="rounded-[16px] border-[1.5px] border-[#1B2B4B] bg-[#F4F7FC] px-4 py-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 text-left">
        <span className="w-6 h-6 rounded-md bg-[#0F1A30] text-white text-[13px] font-black flex items-center justify-center shrink-0">!</span>
        <span className="flex-1 min-w-0 text-[14px] font-black text-[#0F1A30]" style={{ whiteSpace: "normal" }}>비슷한 회사명 {live.dupes.length}건 — 공백·(주)·주식회사 차이로 직원·오더 숫자가 나뉘어 집계됩니다</span>
        <span className="text-[12.5px] font-bold text-[#5B6B85] whitespace-nowrap">{open ? "접기" : "보기"}</span>
      </button>
      {open && (
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {live.dupes.map((d) => (
            <div key={d.key} className="rounded-xl bg-white border border-[#DCE3EE] px-3 py-2">
              {d.names.map((x) => (
                <div key={x.raw} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="font-bold text-[#0F1A30] truncate" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{showRaw(x.raw)}</span>
                  <span className="text-[#7A879C] font-bold whitespace-nowrap">{x.n}건</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {open && <div className="mt-2 text-[12px] text-[#5B6B85]">␣ = 공백. 회원 정보(회사명)를 한 가지 이름으로 맞추면 합쳐집니다. 접속·직원 수는 앞뒤 공백을 지워 이미 합쳐 보여 줍니다.</div>}
    </div>
  );
}

// ═══════════════════════ 회사별 건강 카드 ═══════════════════════
export function HealthCard({ c, today, onOpen }) {
  const live = usePlatformLive();
  const now = live?.now || Date.now();
  const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (29 - i)); return d.toISOString().slice(0, 10); });
  const series = days.map((d) => c.daily?.[d] || 0);
  const inactiveDays = c.lastSeen ? Math.floor((now - c.lastSeen) / DAY_MS) : null;
  const inactive = inactiveDays == null || inactiveDays >= 7;
  const prev = c.pmSame?.cnt || 0;
  const delta = prev ? Math.round(((c.m.cnt - prev) / prev) * 100) : null;
  const planId = c.plan?.planId;
  const inv = c.invoice?.status;
  return (
    <button type="button" onClick={() => onOpen?.(c)} className={`text-left rounded-[16px] border bg-white p-4 flex flex-col gap-3 min-w-0 transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(16,24,40,0.10)] ${inactive && (c.staff || c.m.cnt) ? "border-[1.5px] border-[#1B2B4B]" : "border-[#E3E8F0]"}`}>
      <div className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="text-[16px] font-black text-[#0F1A30] truncate">{c.name}</div>
          <div className="text-[12.5px] text-[#7A879C] font-bold truncate mt-0.5"><span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{c.code || "-"}</span> · 마지막 접속 {agoText(c.lastSeen, now)}</div>
        </div>
        {c.status && <Pill tone={{ active: "solid", new: "soft", drop: "line", dormant: "dash" }[c.status.key]}>{c.status.label}</Pill>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-[#F4F7FC] px-2.5 py-2 min-w-0">
          <div className="text-[11px] font-bold text-[#7A879C] whitespace-nowrap">지금 접속</div>
          <div className="flex items-center gap-1.5 text-[18px] font-black text-[#0F1A30]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}><LiveDot on={c.onlineNow > 0} />{c.onlineNow || 0}<span className="text-[11px] text-[#94A3B8]">/{c.online || 0}</span></div>
        </div>
        <div className="rounded-xl bg-[#F4F7FC] px-2.5 py-2 min-w-0">
          <div className="text-[11px] font-bold text-[#7A879C] whitespace-nowrap">직원 · 기사</div>
          <div className="text-[18px] font-black text-[#0F1A30] whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{c.staff}<span className="text-[11px] text-[#94A3B8]"> · {c.drivers}</span></div>
        </div>
        <div className="rounded-xl bg-[#F4F7FC] px-2.5 py-2 min-w-0">
          <div className="text-[11px] font-bold text-[#7A879C] whitespace-nowrap">이번 달 오더</div>
          <div className="text-[18px] font-black text-[#1B2B4B] whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{c.m.cnt.toLocaleString()}</div>
        </div>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1 min-w-0"><Spark values={series} width={200} height={34} /></div>
        <div className="text-right shrink-0">
          <div className="text-[10.5px] font-bold text-[#94A3B8] whitespace-nowrap">전월 같은 기간</div>
          <div className={`text-[13px] font-black whitespace-nowrap ${delta == null ? "text-[#94A3B8]" : delta >= 0 ? "text-[#1B2B4B]" : "text-[#64748B]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{delta == null ? "—" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}%`}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {inactive && (c.staff > 0 || c.m.cnt > 0) && <Pill tone="dark">{inactiveDays == null ? "접속 기록 없음" : `${inactiveDays}일째 미접속`}</Pill>}
        {c.pending > 0 && <Pill tone="line">직원 승인 대기 {c.pending}</Pill>}
        {c.planReqs?.length > 0 && <Pill tone="line">요금제 변경 요청</Pill>}
        <Pill tone="soft">{planId ? (PLAN_NAMES[planId] || planId) : "요금제 미지정"}</Pill>
        {inv && <Pill tone={inv === "입금완료" ? "solid" : inv === "연체" ? "dark" : "soft"}>{inv}</Pill>}
      </div>
    </button>
  );
}

// ═══════════════════════ 직원 목록(상세 패널) ═══════════════════════
export function StaffList({ list = [] }) {
  const live = usePlatformLive();
  const now = live?.now || Date.now();
  const rows = [...list].sort((a, b) => (b.now - a.now) || (b.lastSeen - a.lastSeen) || (a.approved - b.approved));
  if (!rows.length) return <div className="py-8 text-center text-[#9AA9C3] text-[14px]">등록된 직원이 없습니다</div>;
  return (
    <ul className="divide-y divide-[#EEF1F6] -mx-1">
      {rows.map((s) => (
        <li key={s.uid} className="flex items-center gap-3 px-1 min-h-[62px] py-3">
          <Avatar name={s.name} on={s.now} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <span className="text-[14.5px] font-black text-[#0F1A30] truncate">{s.name}</span>
              <span className={`h-5 px-1.5 rounded text-[11px] font-extrabold inline-flex items-center ${s.role === "admin" ? "bg-[#1B2B4B] text-white" : "bg-[#EEF2F8] text-[#1B2B4B]"}`}>{ROLE_LABELS[s.role] || s.role || "직원"}</span>
              {!s.approved && <Pill tone="line">승인 대기</Pill>}
            </div>
            <div className="text-[12px] text-[#7A879C] font-semibold truncate">{[s.team, s.position].filter(Boolean).join(" · ") || s.email}{s.createdAt ? ` · 가입 ${ymdOf(s.createdAt).slice(2)}` : ""}</div>
            <div className="mt-1"><ScreenChip p={s} now={now} /></div>
          </div>
          <div className="text-right shrink-0">
            <div className="flex justify-end"><KindChips p={s} now={now} /></div>
            <div className={`mt-1 text-[13.5px] font-black whitespace-nowrap tabular-nums ${s.now ? "text-[#1B2B4B]" : "text-[#94A3B8]"}`}>{s.lastSeen ? agoText(s.lastSeen, now) : "접속 기록 없음"}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// 상단 바용 — 지금 접속 N명
export function HeaderLivePill({ onClick, phone = false }) {
  const live = usePlatformLive();
  if (!live) return null;
  return (
    <button type="button" onClick={onClick} title="지금 접속 중(10분 안 활동) · 클릭하면 실시간 접속"
      className={`shrink-0 inline-flex items-center gap-2 rounded-xl bg-white/[0.08] ring-1 ring-white/15 hover:bg-white/15 font-black whitespace-nowrap ${phone ? "h-9 px-2.5 text-[13px]" : "h-10 px-3.5 text-[14px]"}`}>
      <span className="relative inline-flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-[#8FB0F0] opacity-70 animate-ping" /><span className="relative w-2 h-2 rounded-full bg-[#CFE0FF]" /></span>
      {phone ? "" : <span className="text-white/70 font-bold">지금 접속</span>}
      <span className="inline-flex items-baseline gap-0.5"><span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{live.ready ? live.totals.onlineNow : "-"}</span><span className="text-white/60 font-bold text-[12px]">명</span></span>
    </button>
  );
}
