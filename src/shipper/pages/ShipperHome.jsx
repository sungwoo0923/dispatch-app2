import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { doc, getDoc } from "firebase/firestore";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, ComposedChart, Bar, BarChart, Cell } from "recharts";
import { HD_MONO as MONO, HD_C as C, HD_CSS, Clock, Panel, Delta, Tile, DarkTip, Gauge, Seg, hdShort as short } from "../../HomeDeck";

const getTodayKST = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

const getMonthStart = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 7) + "-01";
};

const formatPhoneDisplay = (v) => {
  const d = String(v || "").replace(/[^0-9]/g, "");
  if (!d) return "-";
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return v;
};

export default function ShipperHome() {
  const [orders, setOrders] = useState([]);
  const [userData, setUserData] = useState(null);
  const user = auth.currentUser;
  const today = getTodayKST();
  const monthStart = getMonthStart();

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) setUserData(snap.data());
    });
  }, [user]);

  useEffect(() => {
    if (!user || !userData) return;
    const isMaster = userData?.permissions?.master === true || userData?.isMaster === true;
    const isSubMaster = userData?.permissions?.subMaster === true;
    let q;
    if (isMaster || isSubMaster) {
      q = query(collection(db, "orders"), where("shipperCompany", "==", userData.companyName));
    } else {
      q = query(collection(db, "orders"), where("shipperUid", "==", user.uid));
    }
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user, userData]);

  const toYMD = (d) => {
    if (!d) return "";
    if (d?.toDate) return d.toDate().toISOString().slice(0, 10);
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
  };

  const todayOrders = useMemo(() => orders.filter(o => toYMD(o.상차일) === today), [orders, today]);
  const monthOrders = useMemo(() => orders.filter(o => toYMD(o.상차일) >= monthStart), [orders, monthStart]);

  const kpi = useMemo(() => {
    const active = orders.filter(o => o.상태 !== "취소");
    const todayActive = todayOrders.filter(o => o.상태 !== "취소");
    return {
      전체: active.length,
      배차대기: active.filter(o => !o.차량번호).length,
      배차완료: active.filter(o => o.차량번호).length,
      취소: orders.filter(o => o.상태 === "취소").length,
      당일전체: todayActive.length,
      당일대기: todayActive.filter(o => !o.차량번호).length,
      당일완료: todayActive.filter(o => o.차량번호).length,
      월매출: monthOrders.reduce((s, o) => s + (Number(o.청구운임) || 0), 0),
      전체매출: active.reduce((s, o) => s + (Number(o.청구운임) || 0), 0),
    };
  }, [orders, todayOrders, monthOrders]);

  const recent = useMemo(() => {
    return [...todayOrders].sort((a, b) => {
      const ta = a.createdAt?.toDate?.() ?? new Date(a.createdAt || 0);
      const tb = b.createdAt?.toDate?.() ?? new Date(b.createdAt || 0);
      return tb - ta;
    });
  }, [todayOrders]);

  // 운송목록(ShipperStatus.jsx)과 동일한 상태 판정/색상 규칙을 그대로 따른다.
  const getStatus = (o) => {
    if (["취소", "배차취소", "오더취소", "취소됨"].includes(o.상태)) return { label: "취소", cls: "bg-[#E9EDF3] text-[#7A89A3]" };
    if (o.차량번호 && o.차량번호.trim()) return { label: "배차완료", cls: "bg-[#1B2B4B] text-white" };
    if (o.화주사확인대기 === true) return { label: "요청", cls: "bg-white text-[#1B2B4B] ring-1 ring-inset ring-[#8FB0F0]" };
    return { label: "배차중", cls: "bg-[#DCE6F7] text-[#1B2B4B]" };
  };

  // 이번 달 요일별 건수
  const weekdayData = useMemo(() => {
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const cnt = [0, 0, 0, 0, 0, 0, 0];
    monthOrders.forEach(o => {
      const d = toYMD(o.상차일);
      if (d) { const wd = new Date(d).getDay(); cnt[wd]++; }
    });
    return days.map((d, i) => ({ day: d, count: cnt[i] }));
  }, [monthOrders]);

  const maxWd = Math.max(...weekdayData.map(d => d.count), 1);

  // ⭐ 2026-10-29 리디자인 — 운송사 PC 홈(HomeDeck)과 같은 어두운 네이비 "관제 데크"
  const [range, setRange] = useState("30d");
  const addDay = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const isCancel = (o) => ["취소", "배차취소", "오더취소", "취소됨"].includes(o.상태) || o.배차상태 === "배차취소";
  const fare = (o) => Number(String(o.청구운임 ?? 0).replace(/[^\d-]/g, "")) || 0;
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

  // 일별 [운송료, 건수, 배차완료]
  const days = useMemo(() => {
    const m = {};
    orders.forEach((o) => {
      if (isCancel(o)) return;
      const d = toYMD(o.상차일);
      if (!d) return;
      const e = m[d] || (m[d] = [0, 0, 0]);
      e[0] += fare(o); e[1] += 1; if (o.차량번호 && String(o.차량번호).trim()) e[2] += 1;
    });
    return m;
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps
  const dv = (d) => days[d] || [0, 0, 0];
  const yesterday = addDay(today, -1), tomorrow = addDay(today, 1);
  const t0 = dv(today), t1 = dv(yesterday), tm = dv(tomorrow);
  const last14 = Array.from({ length: 14 }, (_, i) => addDay(today, i - 13));
  const sparkC = last14.map((d) => ({ v: dv(d)[1] }));
  const sparkS = last14.map((d) => ({ v: dv(d)[0] }));
  const sparkD = last14.map((d) => ({ v: dv(d)[2] }));
  const thisMonth = today.slice(0, 7);
  const sumRange = (from, to) => Object.entries(days).reduce((a, [d, v]) => (d >= from && d <= to ? [a[0] + v[0], a[1] + v[1], a[2] + v[2]] : a), [0, 0, 0]);
  const mNow = sumRange(`${thisMonth}-01`, today);
  const prevStart = (() => { const d = new Date(`${thisMonth}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
  const mPrev = sumRange(prevStart, addDay(prevStart, Number(today.slice(8)) - 1));
  const yNow = sumRange(`${today.slice(0, 4)}-01-01`, today);
  const waitingAll = kpi.배차대기;

  const trend = useMemo(() => {
    if (range === "year") {
      const y = today.slice(0, 4);
      return Array.from({ length: 12 }, (_, i) => {
        const ym = `${y}-${String(i + 1).padStart(2, "0")}`;
        const v = Object.entries(days).reduce((a, [d, x]) => (d.startsWith(ym) ? [a[0] + x[0], a[1] + x[1]] : a), [0, 0]);
        return { label: `${i + 1}월`, s: v[0], c: v[1], on: ym === thisMonth };
      });
    }
    const n = range === "7d" ? 7 : 30;
    return Array.from({ length: n }, (_, i) => {
      const d = addDay(today, i - (n - 1));
      const v = dv(d);
      return { label: `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`, s: v[0], c: v[1], on: d === today };
    });
  }, [range, days, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const trendSum = trend.reduce((a, x) => [a[0] + x.s, a[1] + x.c], [0, 0]);
  const peak = trend.reduce((a, x) => (x.s > a.s ? x : a), { s: 0, label: "-" });

  // 최근 30일 노선 / 하차지 / 차종
  const ops = useMemo(() => {
    const from = addDay(today, -29);
    const routes = {}, cars = {};
    orders.forEach((o) => {
      const d = toYMD(o.상차일);
      if (isCancel(o) || !d || d < from || d > today) return;
      const k = `${o.상차지명 || "-"} → ${o.하차지명 || "-"}`;
      const e = routes[k] || (routes[k] = { k, cnt: 0, sale: 0 });
      e.cnt += 1; e.sale += fare(o);
      const c = `${o.차량톤수 || o.톤수 || ""} ${o.차량종류 || ""}`.trim() || "미지정";
      cars[c] = (cars[c] || 0) + 1;
    });
    return {
      routes: Object.values(routes).sort((a, b) => b.cnt - a.cnt || b.sale - a.sale).slice(0, 6),
      cars: Object.entries(cars).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, v]) => ({ name, v })),
    };
  }, [orders, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const routeMax = Math.max(1, ...ops.routes.map((r) => r.cnt));
  const carTotal = ops.cars.reduce((a, c) => a + c.v, 0);
  const CAR_SHADES = ["#CFE0FF", "#8FB0F0", "#6E95E8", "#4B6CB7", "#2D4C82", "#1B2B4B"];

  const now = new Date();
  const dateText = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")} ${["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][now.getDay()]}`;
  const hour = now.getHours();
  const hello = hour < 12 ? "좋은 아침입니다" : hour < 18 ? "오늘도 수고 많으십니다" : "오늘 하루 고생하셨습니다";
  const myName = userData?.name || userData?.이름 || "";
  const company = userData?.companyName || userData?.company || "";
  const todayPct = pct(kpi.당일완료, kpi.당일전체);
  const tomorrowRows = orders.filter((o) => !isCancel(o) && toYMD(o.상차일) === tomorrow);
  const tomorrowDone = tomorrowRows.filter((o) => o.차량번호 && String(o.차량번호).trim()).length;

  const chip = (o) => {
    const st = getStatus(o);
    const style = st.label === "배차완료"
      ? { background: "linear-gradient(135deg,#4B6CB7,#2D4C82)", color: "#fff", border: "1px solid rgba(143,176,240,.45)" }
      : st.label === "취소"
        ? { background: "transparent", color: "rgba(207,224,255,.38)", border: "1px solid rgba(143,176,240,.14)" }
        : st.label === "요청"
          ? { background: "transparent", color: C.hi, border: "1px dashed rgba(143,176,240,.55)" }
          : { background: "rgba(143,176,240,.14)", color: C.hi, border: "1px solid rgba(143,176,240,.25)" };
    return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 8, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", ...style }}>{st.label}</span>;
  };
  const th = { padding: "9px 10px", fontSize: 12, fontWeight: 800, color: C.dim, textAlign: "center", whiteSpace: "nowrap", borderBottom: `1px solid ${C.line}` };
  const td = { padding: "10px 10px", fontSize: 13.5, textAlign: "center", whiteSpace: "nowrap", borderBottom: `1px solid rgba(143,176,240,.07)`, color: C.ink };

  return (
    <section className="hd-deck" style={{ position: "relative", overflow: "hidden", borderRadius: 26, padding: "22px 24px 24px", color: C.ink, minHeight: "calc(100vh - 110px)", fontFeatureSettings: '"tnum"' }}>
      <style>{HD_CSS}</style>
      <div className="hd-scan" />

      {/* ── 머리줄 ── */}
      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, letterSpacing: "0.28em", color: C.glow }}>KP-FLOW · SHIPPER DECK</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 9px", borderRadius: 99, border: "1px solid rgba(143,176,240,.35)", fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", color: C.hi }}>
              <span className="hd-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: C.hi, boxShadow: `0 0 8px ${C.glow}` }} />LIVE
            </span>
            {company && <span style={{ padding: "2px 10px", borderRadius: 99, background: "rgba(143,176,240,.12)", fontSize: 12, fontWeight: 800, color: C.hi }}>{company}</span>}
          </div>
          <h1 style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 900, letterSpacing: "-0.02em", color: "#fff" }}>{myName ? `${myName}님, ${hello}` : hello}</h1>
          <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 600, color: C.sub }}>
            오늘 상차 <b style={{ color: "#fff", fontFamily: MONO }}>{kpi.당일전체}</b>건 · 배차완료 <b style={{ color: "#fff", fontFamily: MONO }}>{kpi.당일완료}</b>건 · 배차 대기 <b style={{ color: "#fff", fontFamily: MONO }}>{kpi.당일대기}</b>건
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <Clock />
          <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", color: C.dim }}>{dateText} · KST</div>
        </div>
      </div>

      {/* ── KPI 타일 ── */}
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 12, marginBottom: 14 }}>
        <Tile primary code="TODAY" label="오늘 상차" value={kpi.당일전체.toLocaleString()} unit="건" spark={sparkC} sparkId="shS1"
          foot={<><Delta cur={t0[1]} prev={t1[1]} /><span>어제 대비</span></>} />
        <Tile code="ASSIGNED" label="오늘 배차완료" value={kpi.당일완료.toLocaleString()} unit="건" spark={sparkD} sparkId="shS2"
          foot={<span>완료율 <b style={{ fontFamily: MONO, color: C.hi }}>{todayPct}%</b></span>} />
        <Tile code="WAITING" label="배차 대기" value={waitingAll.toLocaleString()} unit="건"
          foot={<span>전체 오더의 <b style={{ fontFamily: MONO, color: C.hi }}>{pct(waitingAll, kpi.전체)}%</b> · 차량 미배정</span>} />
        <Tile code="MONTH" label="이번 달 운송료" value={short(mNow[0])} unit="원" spark={sparkS} sparkId="shS3"
          foot={<><Delta cur={mNow[0]} prev={mPrev[0]} /><span>전월 같은 기간 대비</span></>} />
        <Tile code="YEAR" label="올해 운송료" value={short(yNow[0])} unit="원"
          foot={<span>누적 <b style={{ fontFamily: MONO, color: C.hi }}>{yNow[1].toLocaleString()}</b>건 · 건당 <b style={{ fontFamily: MONO, color: C.hi }}>{short(yNow[1] ? yNow[0] / yNow[1] : 0)}</b></span>} />
      </div>

      {/* ── 운송료 추이 + 게이지 ── */}
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0,2.25fr) minmax(0,1fr)", gap: 14, marginBottom: 14 }}>
        <Panel code="TREND" title="운송료 추이" right={<Seg value={range} onChange={setRange} items={[["7d", "7일"], ["30d", "30일"], ["year", "올해"]]} />}>
          <div style={{ display: "flex", gap: 22, marginBottom: 6, flexWrap: "wrap" }}>
            {[["기간 운송료", Math.round(trendSum[0]).toLocaleString() + "원"], ["건수", `${trendSum[1].toLocaleString()}건`], ["건당 평균", short(trendSum[1] ? trendSum[0] / trendSum[1] : 0)], ["최고", `${peak.label} · ${short(peak.s)}`]].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.dim }}>{k}</div>
                <div style={{ fontFamily: MONO, fontSize: 16.5, fontWeight: 800, color: "#fff" }}>{v}</div>
              </div>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center", fontSize: 12, fontWeight: 700, color: C.sub }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: C.glow }} />운송료</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 0, borderTop: `2px dashed ${C.hi}` }} />건수</span>
            </div>
          </div>
          <div style={{ height: "clamp(250px, 32vh, 380px)" }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="shArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.accent} stopOpacity={0.5} /><stop offset="100%" stopColor={C.accent} stopOpacity={0} /></linearGradient>
                  <linearGradient id="shBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.hi} /><stop offset="100%" stopColor="#2D4C82" /></linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(143,176,240,.08)" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11.5, fill: "rgba(207,224,255,.5)", fontFamily: MONO }} interval={range === "30d" ? 3 : 0} dy={6} />
                <YAxis yAxisId="s" axisLine={false} tickLine={false} width={46} tick={{ fontSize: 11, fill: "rgba(207,224,255,.4)", fontFamily: MONO }} tickFormatter={short} />
                <YAxis yAxisId="c" orientation="right" axisLine={false} tickLine={false} width={30} allowDecimals={false} tick={{ fontSize: 11, fill: "rgba(207,224,255,.3)", fontFamily: MONO }} />
                <Tooltip content={<DarkTip />} cursor={{ stroke: "rgba(143,176,240,.35)", strokeDasharray: "3 3" }} />
                {range === "year" ? (
                  <Bar yAxisId="s" dataKey="s" name="운송료" radius={[6, 6, 0, 0]} barSize={22}>
                    {trend.map((x) => <Cell key={x.label} fill={x.on ? "url(#shBar)" : "rgba(110,149,232,.35)"} />)}
                  </Bar>
                ) : (
                  <Area yAxisId="s" type="monotone" dataKey="s" name="운송료" stroke={C.glow} strokeWidth={2.6} fill="url(#shArea)" dot={false} activeDot={{ r: 5, fill: "#fff", stroke: C.glow, strokeWidth: 3 }} animationDuration={800} />
                )}
                <Line yAxisId="c" type="monotone" dataKey="c" name="건수" stroke={C.hi} strokeWidth={1.8} strokeDasharray="5 4" dot={false} animationDuration={800} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel code="DISPATCH" title="오늘 배차 완료율">
          <Gauge value={todayPct} max={100} label={`${todayPct}%`} sub={`${kpi.당일완료} / ${kpi.당일전체}건 차량 배정`} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
            {[["오늘 운송료", short(t0[0])], ["이번 달 건수", `${mNow[1].toLocaleString()}건`], ["월 배차완료", `${mNow[2].toLocaleString()}건`], ["누적 오더", `${kpi.전체.toLocaleString()}건`]].map(([k, v]) => (
              <div key={k} style={{ borderRadius: 11, padding: "9px 11px", background: "rgba(255,255,255,.035)", border: `1px solid ${C.line}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.dim }}>{k}</div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: "#fff", marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
          {[["오늘", kpi.당일완료, kpi.당일전체], ["내일", tomorrowDone, tomorrowRows.length]].map(([l, a, b]) => (
            <div key={l} style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, color: C.sub, marginBottom: 6 }}>
                <span>{l} 배차 진행</span>
                <span style={{ fontFamily: MONO, color: "#fff" }}>{a}/{b} · {pct(a, b)}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 99, background: "rgba(143,176,240,.12)", overflow: "hidden" }}>
                <div style={{ width: `${pct(a, b)}%`, height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#2D4C82,#CFE0FF)", boxShadow: `0 0 10px ${C.glow}`, transition: "width .6s" }} />
              </div>
            </div>
          ))}
        </Panel>
      </div>

      {/* ── 아래 줄 — 오늘 오더판 / 주요 노선 / 요일 · 차종 ── */}
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1.9fr) minmax(0,1fr) minmax(0,1fr)", gap: 14 }}>
        <Panel code="BOARD" title="오늘 오더판" right={<span style={{ fontFamily: MONO, fontSize: 12, color: C.dim }}>{today} · {recent.length}건</span>}>
          {recent.length === 0 ? (
            <div style={{ height: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.dim }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.sub }}>오늘 상차 예정 오더가 없습니다</div>
              <div style={{ fontSize: 12.5, marginTop: 4 }}>운송 › 일반배차등록에서 새 오더를 요청할 수 있습니다</div>
            </div>
          ) : (
            <div className="hd-scroll" style={{ maxHeight: 330, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: "#111F3B" }}>
                  <tr>{["상차시간", "상차지 → 하차지", "차량", "차량번호", "기사", "연락처", "운송료", "상태"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {recent.map((o) => (
                    <tr key={o.id}>
                      <td className="hd-sub" style={{ ...td, fontFamily: MONO }}>{o.상차시간 || "-"}</td>
                      <td style={{ ...td, textAlign: "left", fontWeight: 800, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{o.상차지명 || "-"} <span style={{ color: C.glow }}>→</span> {o.하차지명 || "-"}</td>
                      <td className="hd-sub" style={td}>{`${o.차량톤수 || o.톤수 || ""} ${o.차량종류 || ""}`.trim() || "-"}</td>
                      <td style={{ ...td, fontWeight: 800 }}>{o.차량번호 || "-"}</td>
                      <td style={td}>{o.이름 || "-"}</td>
                      <td className="hd-sub" style={{ ...td, fontFamily: MONO }}>{formatPhoneDisplay(o.전화번호)}</td>
                      <td style={{ ...td, fontFamily: MONO, fontWeight: 800 }}>{fare(o) ? fare(o).toLocaleString() : "-"}</td>
                      <td style={td}>{chip(o)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel code="ROUTES" title="주요 노선" right={<span style={{ fontFamily: MONO, fontSize: 11.5, color: C.dim }}>최근 30일</span>}>
          {ops.routes.length === 0 ? <div style={{ color: C.dim, fontSize: 13, padding: "30px 0", textAlign: "center" }}>데이터 없음</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {ops.routes.map((r, i) => (
                <div key={r.k}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, fontWeight: 700 }}>
                    <span style={{ display: "flex", gap: 8, minWidth: 0 }}>
                      <span style={{ fontFamily: MONO, color: i === 0 ? C.hi : C.dim }}>{String(i + 1).padStart(2, "0")}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.ink }}>{r.k}</span>
                    </span>
                    <span style={{ fontFamily: MONO, color: "#fff", whiteSpace: "nowrap" }}>{r.cnt}건</span>
                  </div>
                  <div style={{ marginTop: 5, height: 6, borderRadius: 99, background: "rgba(143,176,240,.1)", overflow: "hidden" }}>
                    <div style={{ width: `${(r.cnt / routeMax) * 100}%`, height: "100%", borderRadius: 99, background: i === 0 ? "linear-gradient(90deg,#4B6CB7,#CFE0FF)" : "rgba(110,149,232,.55)" }} />
                  </div>
                  <div style={{ marginTop: 3, fontFamily: MONO, fontSize: 11.5, color: C.dim }}>{Math.round(r.sale).toLocaleString()}원</div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <Panel code="WEEKDAY" title="이번 달 요일별">
            <div style={{ height: 130 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayData} margin={{ top: 14, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "rgba(207,224,255,.55)" }} />
                  <Bar dataKey="count" radius={[5, 5, 0, 0]} barSize={18} label={{ position: "top", fill: C.hi, fontSize: 11, fontFamily: MONO }} isAnimationActive={false}>
                    {weekdayData.map((x) => <Cell key={x.day} fill={x.count === maxWd && x.count > 0 ? "#CFE0FF" : "rgba(110,149,232,.45)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel code="FLEET" title="차종 구성" right={<span style={{ fontFamily: MONO, fontSize: 11.5, color: C.dim }}>30일 · {carTotal}건</span>}>
            <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", marginBottom: 10, background: "rgba(143,176,240,.1)" }}>
              {ops.cars.map((c, i) => <div key={c.name} style={{ width: `${(c.v / Math.max(1, carTotal)) * 100}%`, background: CAR_SHADES[i] }} />)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
              {ops.cars.map((c, i) => (
                <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: CAR_SHADES[i], flexShrink: 0 }} />
                  <span style={{ color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  <span style={{ marginLeft: "auto", fontFamily: MONO, fontWeight: 800, color: "#fff" }}>{c.v}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}
