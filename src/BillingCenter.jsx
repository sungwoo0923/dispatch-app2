// ======================= src/BillingCenter.jsx =======================
// 💳 운송사(고객사) "구독 · 결제" — 관리자메뉴 › 환경 설정 › 구독 · 결제
//  ⭐ 2026-11-03 개편 — 디지털 대시보드형(지금 요금제·상태 · 사용량 숫자 카드 · 이번 달 오더 추이 · 요금제 카드 · 청구 이력 · 결제 수단)
//  · 보기: 경리팀·재무·임원·대표(+최고관리자) / 바꾸기(요금제 변경 요청·입금 알림): 경리팀·재무(+최고관리자)만 — src/billingAccess.js
//  · 숫자는 이 화면에서 바로 셀 수 있는 것만 보여준다(직원 계정 = 회원 목록, 월 오더 = 불러온 이번 달 오더, 지입차 = 기사 '지입' 등급 수).
//    저장 용량은 서버 집계(관리센터)에서만 셀 수 있어 여기서는 숫자를 지어내지 않고 "집계 후 청구서 반영"으로 안내한다.
//  ① 지금 요금제 + 비교(다른 요금제로 변경 요청 → 관리센터 '오늘 할 일'에 뜸)
//  ② 월 청구서(관리센터 › 청구 › 수납 관리에서 확정한 금액) + "입금했어요" 알림
//  ③ 결제 수단: 무통장 입금(지금 바로) · 카드 자동결제(PG 계약 후 켜짐) · 세금계산서
import React from "react";
import { addDoc, collection, doc, getCountFromServer, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { ResponsiveContainer, ComposedChart, BarChart, Bar, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { db } from "./firebase";
import { PlanMatrix, PLAN_DEFAULTS, PLAN_IDS, planFeatureLines, planIncludes, usePlan, usePublicPricing } from "./plans";
import { kstToday, monthEnd, monthStart, useLoadOrderRange } from "./orderHistory";

const MONO = "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace";
const num = (v) => Number(String(v ?? 0).replace(/[^\d.-]/g, "")) || 0;
const won = (v) => `${Math.round(Number(v) || 0).toLocaleString()}`;
const STATUS_TONE = { 미청구: "bg-[#EEF2F8] text-[#5B6B85]", 청구: "bg-[#2D4C82] text-white", 입금완료: "bg-[#0F1A30] text-white", 연체: "bg-[#0F1A30] text-[#8FB0F0] ring-1 ring-[#8FB0F0]" };
// 카드 자동결제 — 토스페이먼츠 빌링 등 PG 계약 후 VITE_PG_CLIENT_KEY 를 넣으면 버튼이 켜진다
const PG_READY = !!import.meta.env.VITE_PG_CLIENT_KEY;
const isCanceled = (r) => r?.배차상태 === "배차취소" || r?.상태 === "취소";

function Card({ code, title, right, children, className = "", bodyClass = "p-5" }) {
  return (
    <div className={`bg-white rounded-2xl border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)] overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-3 px-5 h-[50px] border-b border-[#EEF1F6] bg-[#F7F9FC]">
        <div className="flex items-center gap-2 min-w-0"><span className="text-[10px] font-extrabold tracking-[0.22em] text-[#4B6CB7] shrink-0" style={{ fontFamily: MONO }}>{code}</span><span className="text-[15.5px] font-black text-[#0F1A30] truncate">{title}</span></div>
        {right}
      </div>
      <div className={bodyClass}>{children}</div>
    </div>
  );
}

// 사용량 막대 — 한도 대비(80% 이상 진하게, 넘으면 "초과" 표시). 색은 남색 계열만
function Meter({ used, limit, dark = false, projected = null }) {
  if (!limit) return <div className={`h-1.5 rounded-full ${dark ? "bg-white/10" : "bg-[#EEF1F6]"}`} />;
  const pct = Math.min(100, (used / limit) * 100);
  const pPct = projected != null ? Math.min(100, (projected / limit) * 100) : null;
  const over = used > limit;
  return (
    <div className={`relative h-1.5 rounded-full overflow-hidden ${dark ? "bg-white/10" : "bg-[#EEF1F6]"}`}>
      {pPct != null && pPct > pct && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pPct}%`, background: dark ? "rgba(143,176,240,0.28)" : "#C9D6EE" }} />}
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: over ? "#0F1A30" : dark ? "#8FB0F0" : pct >= 80 ? "#1B2B4B" : "#4B6CB7" }} />
    </div>
  );
}

function Kpi({ code, label, value, unit, foot, meter, accent = false }) {
  return (
    <div className={`rounded-2xl border px-4 py-4 min-w-0 flex flex-col ${accent ? "bg-[#0F1A30] border-[#0F1A30] text-white shadow-[0_14px_30px_rgba(15,26,48,0.28)]" : "bg-white border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_rgba(16,24,40,0.04)]"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-extrabold tracking-[0.22em] ${accent ? "text-[#8FB0F0]" : "text-[#4B6CB7]"}`} style={{ fontFamily: MONO }}>{code}</span>
      </div>
      <div className={`text-[12.5px] font-bold mt-1 ${accent ? "text-white/65" : "text-[#5B6B85]"}`}>{label}</div>
      <div className="mt-1 text-[24px] leading-none font-black tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{value}{unit && <span className={`text-[12px] font-bold ml-1 ${accent ? "text-white/50" : "text-[#7A89A3]"}`}>{unit}</span>}</div>
      {meter && <div className="mt-3">{meter}</div>}
      {foot && <div className={`mt-auto pt-2 text-[11.5px] font-bold leading-snug ${accent ? "text-white/55" : "text-[#7A89A3]"}`}>{foot}</div>}
    </div>
  );
}

const TT = { borderRadius: 12, border: "1px solid #E3E8F0", fontSize: 12.5, fontWeight: 700, boxShadow: "0 10px 26px rgba(16,24,40,.10)" };

export default function BillingCenter({ userEmail = "", userName = "", canEdit = false, canView = true, users = null, orders = null }) {
  const { planId, company } = usePlan();
  const pricing = usePublicPricing();
  const [invoices, setInvoices] = React.useState(null);
  const [fleet, setFleet] = React.useState(null);
  const [msg, setMsg] = React.useState("");
  const [showMatrix, setShowMatrix] = React.useState(false);
  const today = kstToday();
  const ym = today.slice(0, 7);
  useLoadOrderRange(canView ? monthStart(ym) : null, monthEnd(ym)); // 이번 달 오더 전체를 불러온다(PC는 최근 7일만 실시간)

  React.useEffect(() => {
    if (!company || !canView) return undefined;
    return onSnapshot(query(collection(db, "platformInvoices"), where("company", "==", company)),
      (s) => setInvoices(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.month).localeCompare(String(a.month)))), () => setInvoices([]));
  }, [company, canView]);
  // 지입차 대수 — 관리센터 사용량 집계와 같은 기준(기사 등급 "지입")
  React.useEffect(() => {
    if (!company || !canView) return undefined;
    let alive = true;
    getCountFromServer(query(collection(db, "drivers"), where("companyName", "==", company), where("등급", "==", "지입")))
      .then((r) => { if (alive) setFleet(r.data().count || 0); }).catch(() => { if (alive) setFleet(null); });
    return () => { alive = false; };
  }, [company, canView]);

  const plans = pricing.plans?.length ? pricing.plans : PLAN_DEFAULTS;
  const plan = plans.find((p) => p.id === planId);
  const curRank = PLAN_IDS.indexOf(planId);

  // ── 사용량(이 화면에서 셀 수 있는 것만) ──
  const staff = React.useMemo(() => (Array.isArray(users) ? users.filter((u) => u && !["driver", "shipper", "totalMaster", "cafeUser"].includes(u.role) && u.employmentStatus !== "퇴사" && !["deleted", "withdrawn"].includes(u.status)).length : null), [users]);
  const days = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  const dayNo = Number(today.slice(8, 10));
  const usage = React.useMemo(() => {
    if (!Array.isArray(orders)) return null;
    const daily = {};
    let cnt = 0, toDate = 0;
    const seen = new Set();
    orders.forEach((r) => {
      if (!r || r.source === "transport_transmit" || isCanceled(r)) return;
      if (r.companyName && company && r.companyName !== company) return;
      const id = r._id || r.id; if (id) { if (seen.has(id)) return; seen.add(id); }
      const d = String(r.상차일 || "").slice(0, 10);
      if (!d.startsWith(ym)) return;
      cnt += 1; daily[d] = (daily[d] || 0) + 1;
      if (d <= today) toDate += 1;
    });
    // 월말 예상 = 이번 달에 이미 잡힌 오더(예약 포함)와 오늘까지 속도로 늘린 값 중 큰 쪽 — 7일 전에는 늘리지 않음(관리센터와 같은 기준)
    const projected = Math.max(cnt, dayNo >= 7 ? Math.round((toDate / Math.max(1, dayNo)) * days) : toDate);
    return { daily, cnt, toDate, projected };
  }, [orders, company, ym, today, dayNo, days]);

  const chart = React.useMemo(() => {
    if (!usage) return [];
    const lim = num(plan?.orders);
    const rate = usage.toDate / Math.max(1, dayNo);
    let cum = 0, cumToday = 0;
    return Array.from({ length: days }, (_, i) => {
      const d = i + 1; const key = `${ym}-${String(d).padStart(2, "0")}`;
      const v = usage.daily[key] || 0;
      const past = d <= dayNo;
      if (past) { cum += v; cumToday = cum; }
      return {
        d, label: `${d}일`,
        daily: past ? v : (v || null), // 미래 날짜는 이미 잡힌 예약 오더만
        cum: past ? cum : null,
        proj: d >= dayNo && dayNo >= 7 ? Math.round(cumToday + rate * (d - dayNo)) : null,
        pace: lim ? Math.round((lim * d) / days) : null,
      };
    });
  }, [usage, plan, days, dayNo, ym]);

  // ── 이번 달 예상 청구(VAT 별도) — 공개 요금 단가로 계산. 단가를 모르는 항목은 더하지 않고 "별도"로 표시 ──
  const bill = React.useMemo(() => {
    if (!plan) return null;
    const exSeats = staff == null ? 0 : Math.max(0, staff - num(plan.seats));
    const exOrders = usage ? Math.max(0, usage.projected - num(plan.orders)) : 0;
    const hasFleet = planIncludes(planId, "fleet");
    const fleetRate = pricing.fleetPerVehicle != null ? num(pricing.fleetPerVehicle) : null;
    const rows = [
      { k: "기본료", v: num(plan.price) },
      { k: `직원 계정 추가 ${exSeats}명`, v: exSeats * num(pricing.extraSeat || 15000), hide: !exSeats },
      { k: `오더 초과 ${exOrders.toLocaleString()}건(월말 예상)`, v: exOrders * num(pricing.extraOrder || 50), hide: !exOrders },
      { k: `지입차 관리 ${fleet || 0}대`, v: hasFleet && fleetRate != null ? (fleet || 0) * fleetRate : null, hide: !hasFleet || !fleet },
    ].filter((x) => !x.hide);
    return { rows, total: rows.reduce((a, x) => a + (x.v || 0), 0), unknown: rows.some((x) => x.v == null) };
  }, [plan, planId, staff, usage, fleet, pricing]);

  const unpaid = (invoices || []).filter((v) => v.status === "청구" || v.status === "연체");
  const unpaidSum = unpaid.reduce((a, v) => a + num(v.amount), 0);
  const overdue = unpaid.some((v) => v.status === "연체");
  const status = !plan ? { t: "요금제 미지정", d: "모든 기능 사용 중" } : overdue ? { t: "연체", d: "미납 청구서를 확인해 주세요" } : unpaid.length ? { t: "입금 대기", d: `청구서 ${unpaid.length}건` } : { t: "정상 이용 중", d: "미납 없음" };
  const paidList = (invoices || []).filter((v) => num(v.amount) > 0).slice(0, 6).reverse();

  const request = async (p) => {
    if (!canEdit) return;
    if (!window.confirm(`${p.name} 요금제(월 ${won(p.price)}원)로 변경을 요청할까요?\n확인 후 담당자가 적용해 드립니다.`)) return;
    try {
      await addDoc(collection(db, "planRequests"), { company, from: planId || "", to: p.id, toName: p.name, feature: "", by: userEmail, byName: userName, status: "요청", createdAt: serverTimestamp() });
      setMsg(`${p.name} 요금제로 변경을 요청했습니다. 확인 후 바로 적용해 드립니다.`);
    } catch (e) { setMsg(`요청 실패: ${e.message}`); }
  };
  const notifyPaid = async (v) => {
    if (!canEdit) return;
    const name = window.prompt("입금자명을 입력해 주세요", company);
    if (name == null) return;
    const d = new Date();
    try {
      await updateDoc(doc(db, "platformInvoices", v.id), { payNotice: { name: name.trim() || company, date: `${d.getMonth() + 1}/${d.getDate()}`, by: userEmail, at: d.toISOString() } });
      setMsg("입금 알림을 보냈습니다. 확인되면 상태가 '입금완료'로 바뀝니다.");
    } catch (e) { setMsg(`알림 실패: ${e.message}`); }
  };

  // 🔒 화면 안 가드 — 메뉴가 숨겨져 있어도 탭이 열리면 내용은 보여주지 않는다
  if (!canView) {
    return (
      <div className="rounded-2xl border border-[#E3E8F0] bg-white px-6 py-14 text-center">
        <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>BILLING · RESTRICTED</div>
        <div className="mt-2 text-[18px] font-black text-[#0F1A30]">구독 · 결제는 경리팀 · 재무 · 임원만 볼 수 있습니다</div>
        <div className="mt-1 text-[13px] text-[#7A89A3]">요금제나 청구서 확인이 필요하면 경리팀에 말씀해 주세요.</div>
      </div>
    );
  }

  const seatsLim = num(plan?.seats), ordersLim = num(plan?.orders);
  return (
    <div className="space-y-4">
      {/* ── HERO · 지금 요금제 + 상태 ── */}
      <div className="relative rounded-[24px] overflow-hidden text-white px-5 sm:px-7 py-6" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 58%,#2D4C82 100%)" }}>
        <span className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
        <span className="absolute -right-24 -top-24 w-[340px] h-[340px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle,rgba(143,176,240,0.22),transparent 65%)" }} />
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] items-end">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>SUBSCRIPTION · {company || "-"}</span>
              {!canEdit && <span className="px-2 py-0.5 rounded-md bg-white/10 border border-white/15 text-[10.5px] font-black tracking-wider" style={{ fontFamily: MONO }}>VIEW ONLY</span>}
            </div>
            <div className="mt-2 flex items-end gap-3 flex-wrap">
              <div className="text-[30px] sm:text-[36px] leading-none font-black tracking-[-0.02em]">{plan ? plan.name : "기본 이용"}</div>
              {plan?.en && <div className="text-[13px] font-black tracking-[0.24em] text-white/45 pb-1" style={{ fontFamily: MONO }}>{plan.en} PLAN</div>}
            </div>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/[0.07] border border-white/10 pl-2 pr-3 py-1">
              <span className={`w-2 h-2 rounded-full ${status.t === "정상 이용 중" || status.t === "요금제 미지정" ? "bg-[#8FB0F0] shadow-[0_0_10px_#8FB0F0]" : "bg-white"}`} />
              <span className="text-[12.5px] font-black">{status.t}</span>
              <span className="text-[12px] text-white/55">· {status.d}</span>
            </div>
            <div className="text-[12.5px] text-white/60 mt-3 leading-relaxed">{plan ? `직원 ${plan.seats}명 · 월 오더 ${num(plan.orders).toLocaleString()}건 포함 · 초과 시 계정 ${won(pricing.extraSeat || 15000)}원/명, 오더 ${won(pricing.extraOrder || 50)}원/건` : "요금제가 지정되지 않아 모든 기능을 쓰고 있습니다. 요금제는 관리센터에서 지정됩니다."}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
            {[["MONTHLY", "월 이용료", plan ? won(plan.price) : "-"], ["ESTIMATE", "이번 달 예상", bill ? won(bill.total) : "-"], ["UNPAID", "미납 청구", won(unpaidSum)]].map(([c, l, v]) => (
              <div key={c} className="rounded-2xl bg-white/[0.06] border border-white/10 px-3 sm:px-4 py-3 min-w-0 sm:min-w-[150px]">
                <div className="text-[9.5px] font-extrabold tracking-[0.22em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{c}</div>
                <div className="text-[11.5px] font-bold text-white/55">{l}</div>
                <div className="text-[17px] sm:text-[22px] font-black tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{v}<span className="text-[11px] text-white/45 ml-0.5">원</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {msg && <div className="rounded-2xl bg-[#0F1A30] text-white px-5 py-3 text-[13.5px] font-black flex items-center justify-between gap-3"><span>{msg}</span><button type="button" onClick={() => setMsg("")} className="text-white/60 text-[12px] font-bold shrink-0">닫기</button></div>}

      {/* ── KPI ── */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Kpi accent code="EST. BILL" label="이번 달 예상 청구" value={bill ? won(bill.total) : "-"} unit={bill ? "원" : ""} foot={bill ? `VAT 별도 · 합계 ${won(bill.total * 1.1)}원${bill.unknown ? " · 지입차 관리비 별도" : ""}` : "요금제 지정 후 계산됩니다"} />
        <Kpi code="SEATS" label="직원 계정 사용 / 한도" value={staff == null ? "-" : staff} unit={seatsLim ? `/ ${seatsLim}명` : "명"} meter={<Meter used={staff || 0} limit={seatsLim} />} foot={seatsLim ? (staff > seatsLim ? `한도 초과 ${staff - seatsLim}명 · 1명당 ${won(pricing.extraSeat || 15000)}원/월` : `남은 계정 ${Math.max(0, seatsLim - (staff || 0))}명`) : "퇴사·기사·화주 계정 제외"} />
        <Kpi code="ORDERS" label={`${Number(ym.slice(5))}월 오더 사용 / 한도`} value={usage ? usage.toDate.toLocaleString() : "-"} unit={ordersLim ? `/ ${ordersLim.toLocaleString()}` : "건"} meter={<Meter used={usage?.toDate || 0} limit={ordersLim} projected={usage?.projected} />} foot={usage ? `월말 예상 ${usage.projected.toLocaleString()}건${ordersLim && usage.projected > ordersLim ? ` · 초과 ${(usage.projected - ordersLim).toLocaleString()}건 예상` : ""}` : "오더를 불러오는 중"} />
        <Kpi code="FLEET" label="지입차 대수" value={fleet == null ? "-" : fleet} unit="대" foot={!plan ? "기사 등급 '지입' 기준" : planIncludes(planId, "fleet") ? (pricing.fleetPerVehicle != null ? `관리비 1대 ${won(pricing.fleetPerVehicle)}원/월` : "지입차 관리비는 청구서에 안내") : "지입차관리는 스탠다드부터"} />
        <Kpi code="STORAGE" label="저장 용량" value={pricing.storageGB ? `${num(pricing.storageGB)}` : "-"} unit={pricing.storageGB ? "GB 제공" : ""} foot="사용량은 관리센터 서버 집계 후 청구서에 반영됩니다" />
      </div>

      {/* ── 추이 차트 + 사용 요약 ── */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] items-stretch">
        <Card code="USAGE TREND" title={`${Number(ym.slice(5))}월 오더 추이`} right={<div className="hidden sm:flex items-center gap-3 text-[11px] font-bold text-[#5B6B85]">
          <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-[#B9C8E4]" />일별</span>
          <span className="flex items-center gap-1"><i className="w-3 h-[3px] rounded bg-[#1B2B4B]" />누적</span>
          {dayNo >= 7 && <span className="flex items-center gap-1"><i className="w-3 border-t-2 border-dotted border-[#4B6CB7]" />월말 예상</span>}
          {ordersLim > 0 && <span className="flex items-center gap-1"><i className="w-3 border-t-2 border-dashed border-[#8FB0F0]" />요금제 한도 속도</span>}
        </div>}>
          {!usage ? <div className="h-[260px] grid place-items-center text-[#9AA9C3]">불러오는 중…</div> : (
            <>
              <div className="h-[260px] -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="bcCum" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2D4C82" stopOpacity={0.28} /><stop offset="100%" stopColor="#2D4C82" stopOpacity={0.02} /></linearGradient>
                    </defs>
                    <CartesianGrid stroke="#EEF1F6" vertical={false} />
                    <XAxis dataKey="d" axisLine={false} tickLine={false} interval={days > 20 ? 4 : 1} tick={{ fontSize: 11, fill: "#9AA9C3", fontFamily: MONO }} />
                    <YAxis yAxisId="c" axisLine={false} tickLine={false} width={44} allowDecimals={false} tick={{ fontSize: 11, fill: "#9AA9C3", fontFamily: MONO }} />
                    <YAxis yAxisId="d" orientation="right" hide allowDecimals={false} domain={[0, (m) => Math.max(4, m * 3)]} />
                    <Tooltip contentStyle={TT} labelFormatter={(d) => `${Number(ym.slice(5))}월 ${d}일`} formatter={(v, n) => [`${Number(v).toLocaleString()}건`, { daily: "그날 오더", cum: "누적", proj: "월말 예상", pace: "한도 속도" }[n] || n]} />
                    <Bar yAxisId="d" dataKey="daily" fill="#B9C8E4" radius={[3, 3, 0, 0]} barSize={8} />
                    <Area yAxisId="c" type="monotone" dataKey="cum" stroke="#1B2B4B" strokeWidth={2.4} fill="url(#bcCum)" connectNulls={false} dot={false} />
                    {dayNo >= 7 && <Line yAxisId="c" type="monotone" dataKey="proj" stroke="#4B6CB7" strokeWidth={2} strokeDasharray="2 4" dot={false} />}
                    {ordersLim > 0 && <Line yAxisId="c" type="linear" dataKey="pace" stroke="#8FB0F0" strokeWidth={2} strokeDasharray="6 5" dot={false} />}
                    {ordersLim > 0 && <ReferenceLine yAxisId="c" y={ordersLim} stroke="#0F1A30" strokeOpacity={0.35} strokeDasharray="3 3" label={{ value: `한도 ${ordersLim.toLocaleString()}`, position: "insideBottomRight", fill: "#5B6B85", fontSize: 11, fontWeight: 700 }} />}
                    <ReferenceLine yAxisId="c" x={dayNo} stroke="#0F1A30" strokeOpacity={0.25} label={{ value: "오늘", position: "top", offset: 8, fill: "#0F1A30", fontSize: 11, fontWeight: 800 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[["TODAY", "오늘까지", usage.toDate], ["BOOKED", "예약 포함", usage.cnt], ["PROJECTED", "월말 예상", usage.projected]].map(([c, l, v]) => (
                  <div key={c} className="rounded-xl bg-[#F7F9FC] border border-[#EEF1F6] px-3 py-2.5 min-w-0">
                    <div className="text-[9.5px] font-extrabold tracking-[0.2em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>{c}</div>
                    <div className="text-[11.5px] font-bold text-[#7A89A3]">{l}</div>
                    <div className="text-[18px] font-black tabular-nums text-[#0F1A30]" style={{ fontFamily: MONO }}>{v.toLocaleString()}<span className="text-[11px] text-[#9AA9C3] ml-0.5">건</span></div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11.5px] text-[#9AA9C3]">취소·화주 전송 사본 제외 · 상차일 기준 · 월말 예상은 7일째부터 오늘까지 속도로 계산합니다.</div>
            </>
          )}
        </Card>

        <Card code="BILL BREAKDOWN" title="이번 달 예상 청구 내역">
          {!bill ? <div className="py-10 text-center text-[#9AA9C3] text-[13px]">요금제가 지정되면 예상 청구 금액이 계산됩니다.</div> : (
            <div className="flex flex-col h-full">
              <div className="space-y-2.5">
                {bill.rows.map((x) => (
                  <div key={x.k} className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-bold text-[#1B2B4B] min-w-0 truncate">{x.k}</span>
                    <span className="text-[14px] font-black tabular-nums text-[#0F1A30] whitespace-nowrap" style={{ fontFamily: MONO }}>{x.v == null ? "별도 안내" : `${won(x.v)}원`}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-dashed border-[#DCE3EE] flex items-end justify-between gap-3">
                <div><div className="text-[10px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>TOTAL</div><div className="text-[12px] font-bold text-[#7A89A3]">VAT 별도</div></div>
                <div className="text-right"><div className="text-[24px] font-black tabular-nums text-[#0F1A30]" style={{ fontFamily: MONO }}>{won(bill.total)}<span className="text-[12px] text-[#7A89A3] ml-0.5">원</span></div><div className="text-[11.5px] font-bold text-[#7A89A3] tabular-nums" style={{ fontFamily: MONO }}>VAT 포함 {won(bill.total * 1.1)}원</div></div>
              </div>
              <div className="mt-4 space-y-3">
                <div><div className="flex justify-between text-[11.5px] font-bold text-[#5B6B85] mb-1"><span>직원 계정</span><span className="tabular-nums" style={{ fontFamily: MONO }}>{staff ?? "-"} / {seatsLim}</span></div><Meter used={staff || 0} limit={seatsLim} /></div>
                <div><div className="flex justify-between text-[11.5px] font-bold text-[#5B6B85] mb-1"><span>월 오더(월말 예상)</span><span className="tabular-nums" style={{ fontFamily: MONO }}>{usage ? usage.projected.toLocaleString() : "-"} / {ordersLim.toLocaleString()}</span></div><Meter used={usage?.toDate || 0} limit={ordersLim} projected={usage?.projected} /></div>
              </div>
              <div className="mt-auto pt-4 text-[11.5px] text-[#9AA9C3]">실제 청구 금액은 월말에 관리센터에서 확정한 청구서 기준입니다.</div>
            </div>
          )}
        </Card>
      </div>

      {/* ── 요금제 카드 ── */}
      <Card code="PLANS" title="요금제 비교 · 변경" right={<button type="button" onClick={() => setShowMatrix((v) => !v)} className="h-8 px-3 rounded-xl border border-[#DCE3EE] text-[12px] font-black text-[#1B2B4B] hover:bg-white whitespace-nowrap">{showMatrix ? "기능표 닫기" : "기능 전체 비교"}</button>}>
        {!canEdit && <div className="mb-4 rounded-xl bg-[#EEF3FC] border border-[#C9D6EE] px-4 py-2.5 text-[13px] font-bold text-[#1B2B4B]">요금제 변경 요청은 경리팀 · 재무 담당자만 할 수 있습니다. 변경이 필요하면 경리팀에 말씀해 주세요.</div>}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {plans.filter((p) => PLAN_IDS.includes(p.id)).map((p) => {
            const on = p.id === planId;
            const r = PLAN_IDS.indexOf(p.id);
            const fits = (staff == null || staff <= num(p.seats)) && (!usage || usage.projected <= num(p.orders));
            return (
              <div key={p.id} className={`relative rounded-2xl p-4 flex flex-col border ${on ? "bg-[#0F1A30] border-[#0F1A30] text-white shadow-[0_16px_34px_rgba(15,26,48,0.32)]" : "bg-white border-[#E3E8F0] text-[#0F1A30]"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-extrabold tracking-[0.24em] ${on ? "text-[#8FB0F0]" : "text-[#4B6CB7]"}`} style={{ fontFamily: MONO }}>{p.en}</span>
                  {on ? <span className="px-2 py-0.5 rounded-md bg-white text-[#0F1A30] text-[10.5px] font-black">사용 중</span>
                    : p.recommended ? <span className="px-2 py-0.5 rounded-md bg-[#EEF2F8] text-[#1B2B4B] text-[10.5px] font-black">추천</span> : null}
                </div>
                <div className="text-[19px] font-black mt-1">{p.name}</div>
                <div className={`text-[11.5px] font-bold ${on ? "text-white/55" : "text-[#7A89A3]"}`}>{p.target}</div>
                <div className="mt-3 text-[24px] font-black tabular-nums" style={{ fontFamily: MONO }}>{won(p.price)}<span className={`text-[11px] font-bold ml-1 ${on ? "text-white/50" : "text-[#7A89A3]"}`}>원/월</span></div>
                <div className={`mt-3 grid grid-cols-2 gap-2 text-[11.5px] font-bold ${on ? "text-white/75" : "text-[#1B2B4B]"}`}>
                  <div className={`rounded-xl px-2.5 py-2 ${on ? "bg-white/[0.07]" : "bg-[#F7F9FC]"}`}><div className={`text-[9.5px] tracking-[0.18em] ${on ? "text-[#8FB0F0]" : "text-[#4B6CB7]"}`} style={{ fontFamily: MONO }}>SEATS</div><span className="tabular-nums" style={{ fontFamily: MONO }}>{p.seats}</span>명</div>
                  <div className={`rounded-xl px-2.5 py-2 ${on ? "bg-white/[0.07]" : "bg-[#F7F9FC]"}`}><div className={`text-[9.5px] tracking-[0.18em] ${on ? "text-[#8FB0F0]" : "text-[#4B6CB7]"}`} style={{ fontFamily: MONO }}>ORDERS</div><span className="tabular-nums" style={{ fontFamily: MONO }}>{num(p.orders).toLocaleString()}</span>건</div>
                </div>
                <ul className={`mt-3 space-y-1 text-[12px] font-bold ${on ? "text-white/70" : "text-[#5B6B85]"}`}>
                  {planFeatureLines(p.id).slice(0, 4).map((t) => <li key={t} className="flex gap-1.5"><span className={on ? "text-[#8FB0F0]" : "text-[#2D4C82]"}>✓</span><span className="min-w-0">{t}</span></li>)}
                </ul>
                <div className="mt-auto pt-4">
                  {!on && (staff != null || usage) && <div className={`mb-2 text-[11px] font-bold ${fits ? "text-[#2D4C82]" : "text-[#7A89A3]"}`}>{fits ? "지금 사용량이 포함량 안에 들어갑니다" : "지금 사용량은 포함량을 넘습니다(초과 요금)"}</div>}
                  {on ? <div className="h-10 rounded-xl bg-white/10 text-white text-[12.5px] font-black flex items-center justify-center">현재 요금제</div>
                    : canEdit ? <button type="button" onClick={() => request(p)} className="w-full h-10 rounded-xl bg-[#0F1A30] text-white text-[12.5px] font-black hover:bg-[#1B2B4B]">{curRank >= 0 ? (r > curRank ? "상향 요청" : "하향 요청") : "이 요금제로 요청"}</button>
                      : <div className="h-10 rounded-xl bg-[#F2F5FA] text-[#9AA9C3] text-[12px] font-black flex items-center justify-center">보기 전용</div>}
                </div>
              </div>
            );
          })}
        </div>
        {showMatrix && <div className="mt-5"><PlanMatrix plans={plans} current={planId} onPick={canEdit ? request : undefined} /></div>}
        <div className="mt-3 text-[12px] text-[#7A89A3]">상향은 요청 즉시 적용되고 남은 기간 차액만 청구됩니다. 하향은 다음 결제일부터 적용됩니다.</div>
      </Card>

      {/* ── 청구 이력 + 결제 수단 ── */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
        <Card code="INVOICES" title="청구 · 입금 이력" right={invoices?.length ? <span className="text-[11.5px] font-bold text-[#7A89A3] tabular-nums" style={{ fontFamily: MONO }}>{invoices.length}건</span> : null} bodyClass="">
          {invoices === null ? <div className="py-10 text-center text-[#9AA9C3]">불러오는 중…</div> : invoices.length === 0 ? <div className="py-10 text-center text-[#9AA9C3]">아직 발행된 청구서가 없습니다.</div> : (
            <>
              {paidList.length >= 2 && (
                <div className="h-[130px] px-3 pt-4 border-b border-[#EEF1F6]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={paidList.map((v) => ({ m: String(v.month || "").slice(2), amount: num(v.amount), st: v.status }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <XAxis dataKey="m" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9AA9C3", fontFamily: MONO }} />
                      <YAxis hide />
                      <Tooltip cursor={{ fill: "rgba(27,43,75,.05)" }} contentStyle={TT} formatter={(v) => [`${won(v)}원`, "청구액"]} />
                      <Bar dataKey="amount" fill="#2D4C82" radius={[5, 5, 0, 0]} barSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="divide-y divide-[#EEF1F6]">
                {invoices.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 flex-wrap sm:flex-nowrap">
                    <div className="w-[76px] text-[14.5px] font-black tabular-nums text-[#0F1A30]" style={{ fontFamily: MONO }}>{v.month}</div>
                    <div className="flex-1 min-w-[160px]">
                      <div className="text-[15.5px] font-black tabular-nums text-[#0F1A30]" style={{ fontFamily: MONO }}>{won(v.amount)}원 <span className="text-[11px] font-bold text-[#7A89A3]">VAT 별도 · 합계 {won(num(v.amount) * 1.1)}원</span></div>
                      {v.payNotice && v.status !== "입금완료" && <div className="text-[12px] font-bold text-[#2D4C82]">입금 알림 보냄 · {v.payNotice.name} {v.payNotice.date}</div>}
                      {v.paidAt && <div className="text-[12px] font-bold text-[#7A89A3]">입금일 {v.paidAt}</div>}
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[12px] font-black ${STATUS_TONE[v.status || "미청구"] || STATUS_TONE.미청구}`}>{v.status || "미청구"}</span>
                    {canEdit && (v.status === "청구" || v.status === "연체") && !v.payNotice && <button type="button" onClick={() => notifyPaid(v)} className="h-9 px-3.5 rounded-xl bg-[#0F1A30] text-white text-[12.5px] font-black">입금했어요</button>}
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card code="PAYMENT" title="결제 수단">
          <div className="space-y-3">
            <div className="rounded-2xl p-4 text-white" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}>
              <div className="flex items-center justify-between"><div className="text-[14.5px] font-black">무통장 입금 (계좌이체)</div><span className="px-2 py-0.5 rounded-md bg-white text-[#0F1A30] text-[11px] font-black">사용 가능</span></div>
              <div className="mt-3 text-[15px] font-black tabular-nums tracking-wide" style={{ fontFamily: MONO }}>{pricing.bank || "입금 계좌는 청구서와 함께 안내드립니다"}</div>
              <div className="text-[11.5px] text-white/60 mt-1">예금주 {pricing.supplier || "KP-Flow"} · 입금자명은 회사명으로 해 주세요. 입금 후 청구서의 "입금했어요"를 누르면 더 빨리 확인됩니다.</div>
            </div>
            <div className="rounded-2xl border border-[#DCE3EE] p-4">
              <div className="flex items-center justify-between"><div className="text-[14.5px] font-black text-[#0F1A30]">카드 자동결제</div><span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${PG_READY ? "bg-[#0F1A30] text-white" : "bg-[#EEF2F8] text-[#5B6B85]"}`}>{PG_READY ? "사용 가능" : "준비 중"}</span></div>
              <div className="text-[12px] text-[#7A89A3] mt-1">카드를 한 번 등록하면 매월 결제일에 자동으로 결제되고 영수증이 메일로 갑니다.</div>
              <button type="button" disabled={!PG_READY || !canEdit} className="mt-2.5 w-full h-10 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black disabled:bg-[#CBD5E3]">{canEdit ? "카드 등록하기" : "경리팀만 등록할 수 있습니다"}</button>
            </div>
            <div className="rounded-2xl border border-[#DCE3EE] p-4">
              <div className="text-[14.5px] font-black text-[#0F1A30]">전자세금계산서</div>
              <div className="text-[12px] text-[#7A89A3] mt-1">매월 청구 확정 시 회사관리에 등록된 사업자 정보로 발행됩니다. 담당 이메일이 바뀌면 회사관리에서 수정해 주세요.</div>
              {pricing.supplierEmail && <div className="mt-2 text-[12px] font-bold text-[#1B2B4B]">문의 <span style={{ fontFamily: MONO }}>{pricing.supplierEmail}</span>{pricing.supplierPhone ? <> · <span style={{ fontFamily: MONO }}>{pricing.supplierPhone}</span></> : null}</div>}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
