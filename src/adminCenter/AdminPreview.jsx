// ======================= src/adminCenter/AdminPreview.jsx =======================
// 🛰 2026-11-18 관리자센터 화면 점검용(개발 서버 /preview-admin 전용 — 배포 화면에서는 로그인으로 보낸다)
//  로그인 없이 가짜 숫자로 PC · 모바일 관리자센터를 그려 본다. 서버에는 아무것도 쓰지 않는다.
import React from "react";
import PlatformCenter from "../PlatformCenter";

const NAMES = ["한빛물류", "대성운송", "제일로지스", "서울화물", "동해익스프레스", "세광통운", "미래트랜스", "그린로지텍"];
const rnd = (s) => { const x = Math.sin(s * 9301 + 49297) * 233280; return x - Math.floor(x); };
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

function demoStats() {
  const today = kstToday();
  const daily = (i) => Object.fromEntries(Array.from({ length: 30 }, (_, k) => { const d = new Date(Date.now() - (29 - k) * 86400e3 + 9 * 3600e3).toISOString().slice(0, 10); return [d, Math.round((20 + rnd(i * 31 + k) * 60) * (k % 7 > 4 ? 0.3 : 1))]; }));
  const companies = NAMES.map((name, i) => {
    const cnt = Math.round(600 + rnd(i + 3) * 4200); const sale = cnt * 182000;
    return { name, kind: "carrier", staff: 4 + Math.round(rnd(i) * 22), admins: 1, drivers: 10 + Math.round(rnd(i + 9) * 40), pending: i === 2 ? 2 : 0, quit: 0, online: 6, onlineNow: 3, onlinePc: 4, onlineMobile: 3,
      m: { cnt, sale, profit: sale * 0.11, toDate: cnt, fixed: 0 }, pm: { cnt: Math.round(cnt * 1.05), sale: sale * 1.05, profit: sale * 0.1 }, pmSame: { cnt: Math.round(cnt * 0.92), sale: sale * 0.92 },
      daily: daily(i), lastOrder: today, totalOrders: cnt * 9, places: 120, clients: 40, fleet: 30, fleetJ: i < 3 ? 6 : 0, storageKB: (2 + rnd(i) * 9) * 1048576, storageFiles: 1200 };
  });
  const platformDaily = {};
  companies.forEach((c) => Object.entries(c.daily).forEach(([d, n]) => { const p = platformDaily[d] || (platformDaily[d] = { cnt: 0, sale: 0 }); p.cnt += n; p.sale += n * 182000; }));
  return { updatedAtMs: Date.now() - 18 * 60e3, today, month: today.slice(0, 7), companies, shippers: [{ name: "가온유통", users: 3 }, { name: "한결식품", users: 2 }], platformDaily };
}

function demoLive() {
  const now = Date.now();
  const companies = Object.fromEntries(NAMES.map((name, i) => [name, { name, staff: 4 + Math.round(rnd(i) * 22), admins: 1, pending: i === 2 ? 2 : 0, drivers: 20, quit: 0, onlineNow: Math.round(rnd(i + 5) * 8), online24h: 6 + Math.round(rnd(i + 2) * 14), onlinePc: 5, onlineMobile: 4, lastSeen: now - i * 6e4, staffList: [], lastSignup: 0 }]));
  return {
    ready: true, now, companies, shippers: {}, shipperApps: {}, onlineList: [], appInfo: {}, signups: [], dupes: [],
    totals: { onlineNow: 37, online24h: 118, pcNow: 24, mobileNow: 15, pc24h: 80, mobile24h: 52, shipperNow: 4, shipper24h: 9, staff: 112, drivers: 230, pendingStaff: 2, shipperUsers: 5 },
    pending: { transport: [{ id: "a" }, { id: "b" }], shipper: [], planReqs: [{ id: "p" }], inquiries: [{ id: "q" }, { id: "r" }, { id: "s" }], staffByCo: [{ name: "제일로지스", n: 2 }], support: [{ id: "x" }], total: 7 },
    planMap: {}, invoiceMap: {}, planReqMap: {}, month: kstToday().slice(0, 7),
  };
}

export default function AdminPreview() {
  const [ready] = React.useState(() => {
    try { window.__kpAdminDemo = true; window.__kpAdminDemoStats = demoStats(); } catch { /* 무시 */ }
    try { const t = new URLSearchParams(window.location.search).get("tab"); if (t) localStorage.setItem("pcTab", t); } catch { /* 무시 */ }
    return true;
  });
  const live = React.useMemo(() => demoLive(), []);
  const user = React.useMemo(() => ({ uid: "preview", email: "preview@logisweb.co.kr" }), []);
  return ready ? <PlatformCenter user={user} demoLive={live} /> : null;
}
