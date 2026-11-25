// ======================= src/adminCenter/OpsScreens.jsx =======================
// 🛰 2026-11-18 관리자센터 리디자인 — 새 화면 4개
//  · CommandDeck   관제 대시보드(첫 화면): 지금 접속 · 트래픽 · 운영자 주머니 · 운송사 사용량 · 초과 · 처리 대기
//  · TrafficView   실시간 트래픽: 분당 읽기/쓰기 · 30일 추이 · 24시간 로그인 · 지금 접속한 사람
//  · CarrierUsageView 운송사 사용량: 계약 금액 없이 사용량 · 한도 · 초과 금액 · 초과 데이터 · 운송사별 원가
//  · WalletView    운영 비용(내 주머니): 무료 기간 동안 운영자가 실제로 내는 서버 · 외부 서비스 비용
import React from "react";
import { G, NUM, AdmHero, AdmPanel, AdmKpi, AdmClock, AdmBtn, AdmEmpty, LivePulse, EstTag, RealTag, Ring, Seg, compact, short, won, kstToday } from "./admUi";
import { TrafficChart, HourBars, CostDonut, CostLegend, WalletStrip, CarrierUsageRows, OverageList, CarrierCostBars, DailyCostBars, FlowGauge, SERIES } from "./OpsWidgets";
import { useOpsData, DEMO_PAYMENTS } from "./useOpsData";
import PaymentsLedger from "../CostLedger";
import { usePlatformLive, LiveNowPanel, SignupTimeline } from "../PlatformLive";


const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const usd = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const agoMin = (ms) => { if (!ms) return "-"; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "방금" : m < 60 ? `${m}분 전` : `${Math.floor(m / 60)}시간 전`; };

function Loading() { return <AdmEmpty>데이터를 모으고 있어요…</AdmEmpty>; }

// ═══════════════════════ 관제 대시보드 ═══════════════════════
export function CommandDeck({ go, openCompany }) {
  const d = useOpsData();
  const live = usePlatformLive();
  const today = kstToday();
  const dstr = `${today.replace(/-/g, ".")} ${DOW[new Date(`${today}T00:00:00Z`).getUTCDay()]}요일`;
  if (!d) return <><DeckHead dstr={dstr} /><Loading /></>;
  const { traffic: t, opsCost: c, carriers, ai } = d;
  const overCos = carriers.filter((x) => x.over > 0);
  const sumOver = overCos.reduce((a, x) => a + x.over, 0);
  const P = live?.pending;
  const queue = [
    ["가입 승인", P ? P.transport.length + P.shipper.length : 0, "applications"],
    ["원격 지원", P?.support?.length || 0, "support"],
    ["요금제 요청", P?.planReqs?.length || 0, "payments"],
    ["도입 문의", P?.inquiries?.length || 0, "inquiries"],
    ["직원 승인", (P?.staffByCo || []).reduce((a, x) => a + x.n, 0), "companies"],
  ];
  const queueTotal = queue.reduce((a, q) => a + q[1], 0);
  const brief = `지금 ${t.onlineNow}명이 쓰고 있어요. 오늘 서버 읽기는 ${t.today ? `${compact(t.today.reads)}건(분당 ${Math.round(t.readsPerMin)}건)` : "아직 집계 전"}이고, 이번 달 운영비는 월말 기준 약 ${short(c.totalMonth)}원이에요.${c.free ? " 무료 기간이라 모두 운영자가 부담해요." : ""}${overCos.length ? ` 한도를 넘은 운송사가 ${overCos.length}곳 있어요.` : ""}`;
  return (
    <div className="space-y-3 sm:space-y-4">
      <DeckHead dstr={dstr} brief={brief} />
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-2 sm:gap-3">
        <AdmKpi code="LIVE" label="지금 접속" value={t.onlineNow} unit="명" foot={`PC ${t.pcNow} · 모바일 ${t.mobileNow} · 24시간 ${t.online24h}명`} onClick={() => go("live")}><div className="absolute right-3 top-9"><LivePulse /></div></AdmKpi>
        <AdmKpi code="READS" label="오늘 서버 읽기" tag={t.measured ? null : <EstTag />} value={t.today ? compact(t.today.reads) : "-"} unit="건" foot={t.today ? `분당 ${Math.round(t.readsPerMin).toLocaleString()}건 · ${agoMin(t.today.updatedAtMs)} 집계` : "1시간마다 모여요"} onClick={() => go("live")} />
        <AdmKpi code="WRITES" label="오늘 서버 쓰기" value={t.today ? compact(t.today.writes) : "-"} unit="건" foot={t.today ? `분당 ${Math.round(t.writesPerMin).toLocaleString()}건 · 함수 ${compact(t.today.fn)}회` : "-"} onClick={() => go("live")} />
        <AdmKpi primary code="BURN" label="이번 달 운영비" value={short(c.totalMonth)} unit="원" foot={`지금까지 ${short(c.mtd)}원 · 하루 ${short(c.perDay)}원`} onClick={() => go("cost")} />
        <AdmKpi code="OVER" label="한도 초과" value={overCos.length} unit="곳" valueColor={overCos.length ? G.bad : undefined} foot={overCos.length ? `초과 금액 ${won(sumOver)}` : "모두 한도 안이에요"} onClick={() => go("usage")} />
        <AdmKpi code="AI" label="AI 사용(이번 달)" tag={<EstTag />} value={usd(ai.usd)} foot={`약 ${short(ai.krw)}원 · AI 팀 ${ai.teamQs}회`} onClick={() => go("ai:hub")} />
      </div>

      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <AdmPanel code="TRAFFIC · 30D" title="서버 트래픽" right={<span className="flex items-center gap-3 text-[12px] font-bold" style={{ color: G.sub }}><Legend c={G.gold} l="읽기" /><Legend c={G.ice} l="쓰기" />{t.measured ? <RealTag>구글 클라우드 실측</RealTag> : <EstTag>실측 연결 전</EstTag>}</span>}>
          <TrafficChart days={t.days} free={t.free} height={240} />
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <FlowGauge label="읽기" perMin={t.readsPerMin} total={t.today?.reads || 0} free={t.free.read} />
            <FlowGauge label="쓰기" perMin={t.writesPerMin} total={t.today?.writes || 0} free={t.free.write} />
            <MiniStat label="오늘 로그인" value={`${t.loginsToday}회`} sub="접속 이력 기준" />
            <MiniStat label="저장 데이터" value={`${t.storageGb.toFixed(1)}GB`} sub="DB + 파일" />
          </div>
        </AdmPanel>
        <AdmPanel code="WALLET" title="운영자 주머니" right={<AdmBtn className="!h-8 !px-3 !text-[12.5px]" onClick={() => go("cost")}>자세히 ›</AdmBtn>}>
          <WalletStrip c={c} ai={ai} />
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)] gap-3 items-center">
            <CostDonut byGroup={c.byGroup} total={c.totalMonth} size={176} />
            <CostLegend byGroup={c.byGroup} total={c.totalMonth} max={7} />
          </div>
        </AdmPanel>
      </div>

      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <AdmPanel code="CARRIERS" title="운송사별 사용량" right={<span className="flex items-center gap-2"><span className="hidden sm:inline text-[12px] font-bold" style={{ color: G.dim }}>계약 금액 제외 · 원가 높은 순</span><AdmBtn className="!h-8 !px-3 !text-[12.5px]" onClick={() => go("usage")}>전체 ›</AdmBtn></span>} bodyClass="px-3 sm:px-4 pb-3 pt-2">
          <CarrierUsageRowsResponsive carriers={carriers} max={6} onOpen={openCompany} />
        </AdmPanel>
        <div className="grid gap-3 sm:gap-4 content-start min-w-0">
          <AdmPanel code="OVERAGE" title="초과 금액 · 초과 데이터" right={<span className="text-[13px] font-black" style={{ ...NUM, color: sumOver ? G.bad : G.dim }}>{sumOver ? `+${won(sumOver)}` : "없음"}</span>}>
            <OverageList carriers={carriers} max={4} />
          </AdmPanel>
          <AdmPanel code="24H" title="시간대별 로그인" right={<span className="text-[12px] font-bold" style={{ ...NUM, color: G.dim }}>최근 24시간</span>}>
            <HourBars hourly={t.hourly} height={92} />
          </AdmPanel>
        </div>
      </div>

      <AdmPanel code="QUEUE" title={`처리 대기 ${queueTotal}건`} right={<AdmBtn className="!h-8 !px-3 !text-[12.5px]" onClick={() => go("todo")}>오늘 할 일 ›</AdmBtn>}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {queue.map(([l, n, to]) => (
            <button key={l} type="button" onClick={() => go(to)} className="adm-row text-left rounded-[14px] px-3.5 py-3 min-w-0" style={{ border: `1px solid ${n ? "rgba(215,188,130,.38)" : G.line}`, background: n ? "rgba(215,188,130,.07)" : "rgba(255,255,255,.02)" }}>
              <div className="text-[12.5px] font-bold" style={{ color: G.sub }}>{l}</div>
              <div className="mt-0.5 text-[24px] font-black leading-none" style={{ ...NUM, color: n ? G.goldHi : G.dim }}>{n}<span className="text-[12px] ml-0.5" style={{ color: G.dim }}>건</span></div>
            </button>
          ))}
        </div>
      </AdmPanel>
    </div>
  );
}
function DeckHead({ dstr, brief }) {
  return (
    <div className="adm-hero relative overflow-hidden rounded-[22px] sm:rounded-[26px] px-4 py-4 sm:px-7 sm:py-6 text-white">
      <span className="adm-scan" aria-hidden />
      <div className="relative flex flex-col lg:flex-row lg:items-end gap-3 lg:gap-8">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2"><LivePulse /><span className="text-[11px] sm:text-[12px] font-extrabold tracking-[0.34em]" style={{ ...NUM, color: G.gold }}>OPERATIONS · COMMAND</span><span className="h-px flex-1 max-w-[160px]" style={{ background: `linear-gradient(90deg, ${G.gold}, transparent)` }} /></div>
          <div className="mt-1.5 text-[23px] sm:text-[32px] font-black tracking-tight leading-tight">플랫폼 관제</div>
          {brief && <p className="mt-1.5 text-[13.5px] sm:text-[15.5px] leading-relaxed max-w-[900px]" style={{ color: G.sub }}>{brief}</p>}
        </div>
        <div className="shrink-0 lg:text-right">
          <AdmClock big />
          <div className="mt-1.5 text-[12px] font-bold tracking-[0.12em]" style={{ ...NUM, color: G.dim }}>{dstr} · KST</div>
        </div>
      </div>
    </div>
  );
}
const Legend = ({ c, l }) => <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><i className="w-2.5 h-2.5 rounded-[3px] inline-block" style={{ background: c }} />{l}</span>;
function MiniStat({ label, value, sub }) {
  return (
    <div className="rounded-[14px] p-3 min-w-0" style={{ background: "rgba(255,255,255,.035)", border: `1px solid ${G.line}` }}>
      <div className="text-[12.5px] font-bold" style={{ color: G.sub }}>{label}</div>
      <div className="mt-1 text-[22px] font-black leading-none whitespace-nowrap" style={{ ...NUM, color: "#fff" }}>{value}</div>
      <div className="mt-2 text-[11.5px] font-bold truncate" style={{ color: G.dim }}>{sub}</div>
    </div>
  );
}
function usePhoneW() {
  const [p, setP] = React.useState(() => typeof window !== "undefined" && window.innerWidth < 900);
  React.useEffect(() => { const f = () => setP(window.innerWidth < 900); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  return p;
}
function CarrierUsageRowsResponsive(props) { const narrow = usePhoneW(); return <CarrierUsageRows {...props} compactMode={narrow} />; }

// ═══════════════════════ 실시간 트래픽 ═══════════════════════
export function TrafficView({ openCompany }) {
  const d = useOpsData();
  const live = usePlatformLive();
  const head = <AdmHero en="COMMAND · LIVE TRAFFIC" title="실시간 트래픽" desc="지금 접속한 사람과 서버에 오가는 데이터(읽기 · 쓰기 · 함수 실행)를 봐요. 서버 숫자는 구글 클라우드에서 1시간마다 가져와요." right={<AdmClock />} />;
  if (!d) return <>{head}<Loading /></>;
  const t = d.traffic;
  const coRows = Object.values(live?.companies || {}).filter((c) => c.online24h > 0).sort((a, b) => (b.onlineNow - a.onlineNow) || (b.online24h - a.online24h)).slice(0, 10);
  const maxCo = Math.max(1, ...coRows.map((c) => c.online24h));
  return (
    <div className="space-y-3 sm:space-y-4">
      {head}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <AdmKpi primary code="NOW" label="지금 접속(10분)" value={t.onlineNow} unit="명" foot={`운송사 ${t.onlineNow - t.shipperNow} · 화주 ${t.shipperNow}`}><div className="absolute right-3 top-9"><LivePulse /></div></AdmKpi>
        <AdmKpi code="24H" label="24시간 접속" value={t.online24h} unit="명" foot={`오늘 로그인 ${t.loginsToday}회`} />
        <AdmKpi code="PC" label="PC 사용자" value={t.pcNow} unit="명" foot="지금 기준" />
        <AdmKpi code="MOBILE" label="모바일 사용자" value={t.mobileNow} unit="명" foot="지금 기준" />
      </div>
      <AdmPanel code="DATA FLOW" title="지금 오가는 데이터" right={<span className="flex items-center gap-2 text-[12px] font-bold" style={{ color: G.dim }}>{t.today ? `${agoMin(t.today.updatedAtMs)} 집계` : "집계 전"}{t.measured ? <RealTag /> : <EstTag />}</span>}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <FlowGauge label="문서 읽기" perMin={t.readsPerMin} total={t.today?.reads || 0} free={t.free.read} />
          <FlowGauge label="문서 쓰기" perMin={t.writesPerMin} total={t.today?.writes || 0} free={t.free.write} />
          <MiniStat label="함수 실행(오늘)" value={`${compact(t.today?.fn || 0)}회`} sub="알림 · 시트 · 보관 등 서버 작업" />
          <MiniStat label="파일 내려받기(오늘)" value={`${(t.today?.egressGb || 0).toFixed(2)}GB`} sub="사진 · 첨부 송신" />
        </div>
        <div className="mt-2 text-[11.5px] font-bold leading-relaxed" style={{ color: G.dim }}>분당 값은 오늘 집계량 ÷ 지난 시간으로 낸 평균이에요 <EstTag />. 구글 클라우드가 하루 단위로만 남겨서 분 단위 실측은 없어요.</div>
      </AdmPanel>
      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <AdmPanel code="TRAFFIC · 30D" title="일별 읽기 · 쓰기" right={<span className="flex items-center gap-3 text-[12px] font-bold" style={{ color: G.sub }}><Legend c={G.gold} l="읽기" /><Legend c={G.ice} l="쓰기" /></span>}>
          <TrafficChart days={t.days} free={t.free} height={260} />
        </AdmPanel>
        <AdmPanel code="24H" title="시간대별 로그인">
          <HourBars hourly={t.hourly} height={150} />
          <div className="mt-4 text-[10.5px] font-extrabold tracking-[0.2em]" style={{ ...NUM, color: G.goldDim }}>BY COMPANY · 24H</div>
          <div className="mt-2 space-y-2">
            {coRows.length === 0 ? <div className="text-[13px] font-bold" style={{ color: G.dim }}>최근 24시간 접속이 없어요</div> : coRows.map((c) => (
              <button key={c.name} type="button" onClick={() => openCompany?.(c.name)} className="adm-row w-full text-left rounded-lg px-1 py-0.5">
                <div className="flex items-center gap-2 text-[13px]"><span className="font-black truncate" style={{ color: G.ink }}>{c.name}</span><span className="ml-auto font-black" style={{ ...NUM, color: G.goldHi }}>{c.onlineNow}</span><span className="font-bold" style={{ ...NUM, color: G.dim }}>/ {c.online24h}명</span></div>
                <div className="mt-1 h-1.5 rounded-full overflow-hidden flex" style={{ background: "rgba(255,255,255,.06)" }}><div style={{ width: `${(c.onlineNow / maxCo) * 100}%`, background: G.gold }} /><div style={{ width: `${((c.online24h - c.onlineNow) / maxCo) * 100}%`, background: "rgba(143,176,240,.45)" }} /></div>
              </button>
            ))}
          </div>
        </AdmPanel>
      </div>
      {!d.demo && (
        <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start">
          <LiveNowPanel onCompany={openCompany} />
          <SignupTimeline max={12} onCompany={openCompany} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════ 운송사 사용량(계약 금액 제외) ═══════════════════════
export function CarrierUsageView({ openCompany }) {
  const d = useOpsData();
  const [sort, setSort] = React.useState("cost");
  const head = (r) => <AdmHero en="USAGE · CARRIERS" title="운송사 사용량" desc="계약 금액은 빼고, 운송사마다 실제로 얼마나 쓰는지(직원 · 오더 · 저장 · 서버 읽기/쓰기 · 문자)와 요금제 한도를 넘은 양 · 금액을 봐요." right={r} />;
  if (!d) return <>{head()}<Loading /></>;
  const cs = [...d.carriers].sort((a, b) => sort === "over" ? b.over - a.over : sort === "orders" ? b.orders - a.orders : sort === "reads" ? b.reads - a.reads : b.costTotal - a.costTotal);
  const overCos = cs.filter((c) => c.over > 0);
  const sum = cs.reduce((a, c) => ({ over: a.over + c.over, orders: a.orders + (c.extra?.orders || 0), gb: a.gb + (c.extra?.storageGB || 0), seats: a.seats + (c.extra?.seats || 0), reads: a.reads + c.reads, writes: a.writes + c.writes, cost: a.cost + c.costTotal, msgs: a.msgs + c.sms + c.lms + c.alimtalk }), { over: 0, orders: 0, gb: 0, seats: 0, reads: 0, writes: 0, cost: 0, msgs: 0 });
  const msgRows = cs.filter((c) => c.sms + c.lms + c.alimtalk > 0).sort((a, b) => (b.sms + b.lms + b.alimtalk) - (a.sms + a.lms + a.alimtalk)).slice(0, 8);
  const msgMax = Math.max(1, ...msgRows.map((c) => c.sms + c.lms + c.alimtalk));
  return (
    <div className="space-y-3 sm:space-y-4">
      {head(<Seg value={sort} onChange={setSort} items={[["cost", "원가순"], ["over", "초과순"], ["orders", "오더순"], ["reads", "읽기순"]]} />)}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <AdmKpi code="CARRIERS" label="사용 중인 운송사" value={cs.length} unit="곳" foot={`요금제 지정 ${cs.filter((c) => c.planId).length}곳`} />
        <AdmKpi code="OVER" label="한도 초과 운송사" value={overCos.length} unit="곳" valueColor={overCos.length ? G.bad : undefined} foot={overCos.slice(0, 3).map((c) => c.name).join(" · ") || "없음"} />
        <AdmKpi primary code="OVER FEE" label="이번 달 초과 금액" value={short(sum.over)} unit="원" foot="부가세 별도 · 월말 예상" />
        <AdmKpi code="OVER DATA" label="초과 데이터" value={`${sum.orders.toLocaleString()}`} unit="건" foot={`저장 +${sum.gb}GB · 직원 +${sum.seats}명`} />
      </div>
      <AdmPanel code="MATRIX" title="운송사별 사용량 · 한도" right={<span className="text-[12px] font-bold" style={{ color: G.dim }}>눌러서 운송사 상세 보기</span>} bodyClass="px-3 sm:px-4 pb-3 pt-2">
        <CarrierUsageRowsResponsive carriers={cs} max={60} onOpen={openCompany} />
      </AdmPanel>
      <div className="grid gap-3 sm:gap-4 xl:grid-cols-2">
        <AdmPanel code="OVERAGE" title="초과 금액 · 초과 데이터" right={<span className="text-[13px] font-black" style={{ ...NUM, color: sum.over ? G.bad : G.dim }}>{sum.over ? `+${won(sum.over)}` : "없음"}</span>}>
          <OverageList carriers={cs} max={10} />
        </AdmPanel>
        <AdmPanel code="COST SHARE" title="운송사별 운영 원가" right={<span className="flex items-center gap-2 text-[12px] font-bold" style={{ color: G.sub }}><Legend c={G.gold} l="서버" /><Legend c={G.ice} l="문자 · 세금계산서" /><EstTag /></span>}>
          <CarrierCostBars carriers={[...d.carriers].sort((a, b) => b.costTotal - a.costTotal)} max={10} />
          <div className="mt-2 text-[11.5px] font-bold" style={{ color: G.dim }}>서버비는 앱 표본(읽기 · 쓰기)과 활동량 비율로 나눈 값이에요. 합계 {won(sum.cost)}.</div>
        </AdmPanel>
      </div>
      <AdmPanel code="MESSAGES" title="문자 · 알림톡 사용량" right={<span className="text-[13px] font-black" style={{ ...NUM, color: G.goldHi }}>{sum.msgs.toLocaleString()}건</span>}>
        {msgRows.length === 0 ? <AdmEmpty>이번 달 보낸 문자 · 알림톡이 없어요</AdmEmpty> : (
          <div className="space-y-2.5">
            {msgRows.map((c) => { const tot = c.sms + c.lms + c.alimtalk; return (
              <div key={c.name}>
                <div className="flex items-baseline gap-2 text-[13px]"><span className="font-black truncate" style={{ color: G.ink }}>{c.name}</span><span className="ml-auto font-bold" style={{ ...NUM, color: G.dim }}>단문 {c.sms} · 장문 {c.lms} · 알림톡 {c.alimtalk}</span><span className="w-[84px] text-right font-black" style={{ ...NUM, color: G.goldHi }}>{won(c.msgCost)}</span></div>
                <div className="mt-1 h-2 rounded-full overflow-hidden flex" style={{ width: `${(tot / msgMax) * 100}%`, minWidth: 6 }}>
                  <div style={{ flex: c.alimtalk, background: SERIES[0] }} /><div style={{ flex: c.sms, background: SERIES[1] }} /><div style={{ flex: c.lms, background: SERIES[3] }} />
                </div>
              </div>); })}
            <div className="flex gap-3 text-[12px] font-bold pt-1" style={{ color: G.sub }}><Legend c={SERIES[0]} l="알림톡" /><Legend c={SERIES[1]} l="단문" /><Legend c={SERIES[3]} l="장문" /><span className="ml-auto" style={{ color: G.dim }}>금액은 원가 단가 기준</span></div>
          </div>
        )}
      </AdmPanel>
    </div>
  );
}

// ═══════════════════════ 운영 비용(내 주머니) ═══════════════════════
export function WalletView({ openSettings }) {
  const d = useOpsData();
  const head = <AdmHero en="COST · OUT OF POCKET" title="운영 비용" desc="지금은 모든 운송사가 무료 기간이라 서버 · 외부 서비스 비용이 운영자 주머니에서 나가요. 실측이 없는 항목은 '추정'으로 표시해요." right={openSettings ? <AdmBtn gold onClick={openSettings}>비용 기준 · 손익 상세 ›</AdmBtn> : null} />;
  if (!d) return <>{head}<Loading /></>;
  const { opsCost: c, ai, traffic: t } = d;
  const rows = [...(c.payRows || []), ...(c.varRows || []).filter((r) => r.krw > 0.5 || r.usage > 0 || r.replaced), ...(c.aiRow ? [c.aiRow] : []), ...(c.fixRows || []).map((r) => ({ ...r, fixed: true }))]
    .sort((a, b) => (b.actual ? 1 : 0) - (a.actual ? 1 : 0) || (b.krw || b.modelKrw || 0) - (a.krw || a.modelKrw || 0));
  const top = c.byGroup[0];
  return (
    <div className="space-y-3 sm:space-y-4">
      {head}
      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <AdmPanel code="WALLET" title="이번 달 운영자 부담">
          <WalletStrip c={c} ai={ai} />
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MiniStat label="서버(변동)" value={`${short(c.server)}원`} sub="Firestore · 함수 · 저장 등" />
            <MiniStat label="고정비(예상)" value={`${short(c.fixed)}원`} sub="호스팅 · 도구 · 앱 마켓" />
            <MiniStat label="AI(Claude API)" value={`${short(c.aiRow?.replaced ? 0 : ai.krw)}원`} sub={c.aiRow?.replaced ? "이달은 충전 금액으로 셈" : `${usd(ai.usd)} · 지금까지`} />
            <MiniStat label="실제 결제" value={`${short(c.paid || 0)}원`} sub={c.payRows?.length ? `${c.payRows.length}건 · 아래 결제 내역` : "아래에서 넣어요"} />
          </div>
          {top && <div className="mt-3 rounded-[12px] px-3.5 py-2.5 text-[13px] font-bold leading-relaxed" style={{ background: "rgba(215,188,130,.07)", border: `1px solid ${G.line}`, color: G.sub }}>가장 많이 나가는 곳은 <b style={{ color: G.goldHi }}>{top.group}</b>이에요. 한 달에 {won(top.krw)}({c.totalMonth ? Math.round((top.krw / c.totalMonth) * 100) : 0}%)이 나가요.</div>}
        </AdmPanel>
        <AdmPanel code="BREAKDOWN" title="어디에 나가나요">
          <div className="grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)] gap-3 items-center">
            <CostDonut byGroup={c.byGroup} total={c.totalMonth} size={196} />
            <CostLegend byGroup={c.byGroup} total={c.totalMonth} max={10} />
          </div>
        </AdmPanel>
      </div>
      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <AdmPanel code="DAILY" title="일별 서버 변동비" right={t.measured ? <RealTag>사용량 실측 × 단가</RealTag> : <EstTag />}>
          {t.days.length ? <DailyCostBars days={t.days} height={190} /> : <AdmEmpty>실측 사용량이 쌓이면 일별로 보여요</AdmEmpty>}
        </AdmPanel>
        <AdmPanel code="AI" title="AI 사용 비용" right={<EstTag>표준 단가 어림값</EstTag>}>
          <div className="flex items-center gap-4">
            <Ring value={ai.usd ? ai.chatUsd / ai.usd : 0} size={92} label={usd(ai.usd)} sub="이번 달" />
            <div className="flex-1 space-y-2 min-w-0">
              {[["AI 비서(운송사 직원)", ai.chatUsd, `${ai.chatTurns.toLocaleString()}회 대화`], ["오더 사진 인식", ai.scanUsd, `${ai.scanCalls.toLocaleString()}건`], ["AI 팀(관리자센터)", ai.teamUsd, `${ai.teamQs}회 질문`]].map(([l, v, s]) => (
                <div key={l} className="min-w-0">
                  <div className="flex items-baseline gap-2 text-[13px]"><span className="font-bold truncate" style={{ color: G.sub }}>{l}</span><span className="ml-auto font-black" style={{ ...NUM, color: G.ink }}>{usd(v)}</span></div>
                  <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.06)" }}><div className="h-full rounded-full" style={{ width: `${ai.usd ? (v / ai.usd) * 100 : 0}%`, background: G.gold }} /></div>
                  <div className="text-[11px] font-bold" style={{ color: G.dim }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 text-[11.5px] font-bold" style={{ color: G.dim }}>정확한 금액은 Claude Console › 지출에서 확인해 주세요.</div>
        </AdmPanel>
      </div>
      {rows.length > 0 && (
        <AdmPanel code="LINE ITEMS" title="항목별 월 비용" bodyClass="p-0">
          <div className="overflow-x-auto adm-scroll">
            <table className="w-full text-[13.5px]" style={{ minWidth: 720 }}>
              <thead><tr>{["구분", "항목", "이번 달 사용", "단가", "월 비용"].map((h, i) => <th key={h} className={`px-4 py-2.5 text-[12px] font-extrabold whitespace-nowrap ${i >= 2 ? "text-right" : "text-left"}`} style={{ color: G.goldDim, borderBottom: `1px solid ${G.line}` }}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.key} className="adm-row" style={{ borderBottom: "1px solid rgba(215,188,130,.07)" }}>
                  <td className="px-4 py-2.5 whitespace-nowrap font-bold" style={{ color: G.sub }}>{r.group}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap font-black" style={{ color: G.ink }}>{r.label} {r.actual ? <RealTag>실제 결제</RealTag> : r.replaced ? <span className="text-[11px] font-bold" style={{ color: G.dim }}>실제 결제로 대체</span> : <EstTag>{r.fixed ? "예상 · 고정" : "예상"}</EstTag>}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap" style={{ ...NUM, color: G.sub }}>{r.actual ? (r.date || "-") : r.usage != null ? `${Number(r.usage).toLocaleString(undefined, { maximumFractionDigits: 1 })}${r.usageUnit || ""}` : "-"}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-[12.5px]" style={{ ...NUM, color: G.dim }}>{r.unit || "-"}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap font-black" style={{ ...NUM, color: r.replaced ? G.dim : G.goldHi }}>{r.replaced ? <s>{won(r.modelKrw)}</s> : won(r.krw)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </AdmPanel>
      )}
      <AdmPanel code="PAYMENTS" title="결제 내역" right={<span className="text-[12px] font-bold" style={{ color: G.dim }}>실제로 낸 돈 · 바로 반영돼요</span>}>
        <PaymentsLedger tone="dark" model={c.model} ym={c.ym} demo={d.demo} demoPayments={d.demo ? DEMO_PAYMENTS(c.ym) : null} />
      </AdmPanel>
      <div className="px-1 text-[12px] font-bold leading-relaxed" style={{ color: G.dim }}>
        · 구독 업그레이드 · API 충전처럼 실제로 낸 돈은 위 [결제 내역]에 넣으면 '실제 결제'로 잡혀요. 같은 항목의 예상 금액은 그 달만 빠져서 두 번 세지 않아요.<br />
        · Vercel 사용량, 카카오 · 네이버 · Tmap 지도 호출 수, 각 업체 실제 청구서는 프로그램에 기록되지 않아요. 그래서 단가 × 사용량(또는 활동량)으로 계산한 값을 보여 줘요.<br />
        · 단가 · 환율 · 고정비는 [비용 기준 · 손익 상세] › 비용 기준 설정에서 고쳐요.
      </div>
    </div>
  );
}


