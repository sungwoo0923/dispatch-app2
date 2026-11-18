// ======================= src/freight/FreightWorkspace.jsx =======================
// 🚢 2026-11-12 컨테이너 · 해상 · 항공 · 통합 현황 화면 — 상단 메뉴 키("biz:<영역>:<화면>")에 맞는 화면을 그린다
import React from "react";
import { parseBizMenu, bizMenuKey, bizInfo, bizMenuLabel } from "../bizModules";
import { useFreightJobs } from "./freightStore";
import FreightForm from "./FreightForm";
import FreightBoard, { LegDrawer } from "./FreightBoard";
import { DeadlineBoard, PnlPage, GroupOverview, JobTimeline, Clients360 } from "./FreightDash";
import { SettlePage, StaffBizPage } from "./FreightSettle";
import { enrichInland, orderIdOf } from "./freightCore";
import { PageHead } from "./ui";
import FreightStatus, { FreightLive, StatusTable } from "./FreightStatus"; // 🎨 2026-11-18 내륙 배차현황 · 실시간배차현황과 같은 모양
import FreightFarePage from "./FreightFarePage"; // 💰 운임조회
import KpSubNav from "../KpSubNav";
import { PageClock } from "./inlandLook";

const DESC = {
  dash: "진행 · 마감 · 인계 · 이익을 한 화면에서",
  new: "오더 등록과 배차 처리를 한 화면에서",
  live: "어제 · 오늘 · 내일 건을 실시간으로",
  list: "기간별 내역 조회 · 수정",
  fare: "같은 구간 지난 운임 · 구간별 평균",
  deadline: "넘기면 비용이 나가는 마감을 시간순으로",
  pnl: "매출 · 매입 · 수익 분석",
  handoff: "다른 팀이 넘긴 건을 받아 이어서 진행",
  settle: "청구 · 수금 · 지급을 건별로 확인",
  staff: "직원마다 볼 수 있는 업무와 처음 화면",
  overview: "전 사업부 건수 · 마감 · 손익",
  jobs: "화물 하나가 팀을 거쳐 가는 흐름",
  clients: "거래처별 이용 사업부와 영업 기회",
};

export default function FreightWorkspace({ menuKey, modules = [], me = "", canEdit = true, inlandRows = [], clients = [], drivers = [], places = [], onMenu, onBiz, onCreateInlandOrder = null, bare = false, canManage = false }) {
  const { biz, page } = parseBizMenu(menuKey);
  const info = bizInfo(biz);
  const { jobs: rawJobs, loaded } = useFreightJobs();
  // 배차 오더와 연결된 내륙 구간은 그 오더의 기사 · 금액 · 상태를 따라간다
  const jobs = React.useMemo(() => {
    if (!rawJobs.some((j) => j.dispatchId)) return rawJobs;
    const byId = new Map(); inlandRows.forEach((r) => { const k = orderIdOf(r); if (k) byId.set(k, r); });
    return rawJobs.map((j) => (j.mode === "inland" && j.dispatchId ? enrichInland(j, byId.get(String(j.dispatchId))) : j));
  }, [rawJobs, inlandRows]);
  const [openId, setOpenId] = React.useState("");
  const [edit, setEdit] = React.useState(null);
  const [sub, setSub] = React.useState("");
  React.useEffect(() => { setEdit(null); setOpenId(""); setSub(""); }, [menuKey]);

  const clientNames = React.useMemo(() => {
    const s = new Set();
    clients.forEach((c) => { const n = String(c?.거래처명 || c?.업체명 || "").trim(); if (n) s.add(n); });
    jobs.forEach((j) => { if (j.client) s.add(j.client); });
    return [...s].sort((a, b) => a.localeCompare(b, "ko"));
  }, [clients, jobs]);
  const placeNames = React.useMemo(() => {
    const s = new Set();
    places.forEach((p) => { const n = String(p?.업체명 || p?.하차지명 || "").trim(); if (n) s.add(n); });
    jobs.forEach((j) => { [j.doorPlace, j.dropPlace].forEach((n) => { if (n) s.add(n); }); });
    return [...s].sort((a, b) => a.localeCompare(b, "ko")).slice(0, 500);
  }, [places, jobs]);

  const go = (p) => onMenu?.(bizMenuKey(biz, p));
  const formProps = { jobs, clients: clientNames, drivers, places: placeNames, modules, me };
  const open = openId ? jobs.find((j) => j.id === openId) : null;
  const onOpen = (j) => setOpenId(j.id);
  const drawer = <LegDrawer job={open} jobs={jobs} modules={modules} me={me} canEdit={canEdit} onCreateInlandOrder={onCreateInlandOrder} onClose={() => setOpenId("")} onEdit={(j) => { setOpenId(""); setEdit(j); }} onOpenLeg={onOpen} />;

  // 🎨 2026-11-18 머리말 — 내륙 화면 머리말처럼 오른쪽에 날짜 · 시각(예전 "+ 오더등록" 단추는 뺐다: 상단 배차 › 오더등록)
  const head = bare ? null : (
    <PageHead mode={biz} en={`${info.en} · ${String(page || "").toUpperCase()}`} title={biz === "group" ? bizMenuLabel(menuKey) : biz === "inland" ? "내륙 인계함" : `${info.short} ${bizMenuLabel(menuKey)}`} desc={DESC[page]}
      right={biz === "group" || biz === "inland" ? null : <PageClock />} />
  );
  if (!loaded) return <div>{head}<div className="py-20 text-center text-[13.5px] font-bold text-[#9AA9C3]">불러오는 중…</div></div>;

  // 상세 창에서 [수정]을 누른 경우 — 어느 화면에서든 그 건의 수정 화면으로
  if (edit) {
    return (
      <div>
        {head}
        <h2 className="text-lg font-bold mb-3">{edit.refNo} {edit.status === "인계요청" ? "인계 접수" : "수정"}</h2>
        <FreightForm {...formProps} mode={edit.mode} initial={edit} onDone={() => setEdit(null)} onCancel={() => setEdit(null)} />
      </div>
    );
  }

  let body = null;
  if (biz === "group") {
    if (page === "overview") body = <GroupOverview jobs={jobs} modules={modules} inlandRows={inlandRows} onOpen={onOpen} goBiz={onBiz} />;
    else if (page === "jobs") body = <JobTimeline jobs={jobs} onOpen={onOpen} />;
    else if (page === "deadline") body = <DeadlineBoard jobs={jobs} onOpen={onOpen} />;
    else if (page === "pnl") body = <PnlPage jobs={jobs} inlandRows={modules.includes("inland") ? inlandRows : null} onOpen={onOpen} />;
    else if (page === "staff") body = <StaffBizPage modules={modules} canEdit={canManage} />;
    else body = <Clients360 jobs={jobs} inlandRows={inlandRows} modules={modules} />;
  } else if (biz === "inland") {
    body = <FreightBoard mode="inland" jobs={jobs} allJobs={jobs} modules={modules} me={me} canEdit={canEdit} formProps={formProps} onCreateInlandOrder={onCreateInlandOrder} />;
  } else if (page === "new") {
    // 내륙 오더등록처럼 — 입력 카드 아래에 오늘 건 목록
    body = canEdit ? (<>
      <FreightForm key={biz} {...formProps} mode={biz} onGoList={() => go("list")} />
      {!bare && <div className="mt-6"><StatusTable mode={biz} jobs={jobs} variant="embed" canEdit={canEdit} onOpen={onOpen} onEdit={setEdit} /></div>}
    </>) : <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">조회 전용 계정은 등록할 수 없습니다.</div>;
  } else if (bare && ["live", "list", "pending", "handoff", "dash", "deadline"].includes(page)) {
    // 휴대폰 — 넓은 표 대신 예전 카드 목록(내륙 모바일처럼 카드)
    body = <FreightBoard mode={biz} jobs={jobs} allJobs={jobs} handoffOnly={page === "handoff"} modules={modules} me={me} canEdit={canEdit} formProps={formProps} onNew={() => go("new")} />;
  } else if (page === "live") body = <FreightLive mode={biz} jobs={jobs} canEdit={canEdit} onOpen={onOpen} onEdit={setEdit} onNew={() => go("new")} />;
  else if (["list", "pending", "deadline", "handoff", "dash"].includes(page)) {
    // 예전 메뉴(대시보드 · 마감보드 · 인계함)는 운송현황 안의 탭으로
    const tab = page === "dash" ? "list" : page;
    body = bare
      ? <StatusTable mode={biz} jobs={jobs} tab={tab === "deadline" ? "list" : tab} canEdit={canEdit} onOpen={onOpen} onEdit={setEdit} onNew={() => go("new")} />
      : <FreightStatus mode={biz} jobs={jobs} tab={tab} canEdit={canEdit} onOpen={onOpen} onEdit={setEdit} onNew={() => go("new")} />;
  } else if (page === "fare") body = <FreightFarePage mode={biz} jobs={jobs} places={placeNames} onOpen={onOpen} />;
  else if (page === "pnl") body = bare ? <PnlPage jobs={jobs} mode={biz} onOpen={onOpen} /> : (
    <KpSubNav code={`${info.en} REVENUE`} title="매출관리" icon="chart" items={[{ key: "job", label: "Job별 손익", en: "BY JOB", icon: "chart" }, { key: "client", label: "거래처별 손익", en: "BY CLIENT", icon: "building" }]} active={sub || "job"} onSelect={setSub}>
      <h2 className="text-lg font-bold mb-3">{sub === "client" ? "거래처별 손익" : "Job별 손익"}</h2>
      <PnlPage key={sub} jobs={jobs} mode={biz} onOpen={onOpen} initialView={sub === "client" ? "거래처" : "Job"} hideView />
    </KpSubNav>
  );
  else if (page === "settle") body = bare ? <SettlePage jobs={jobs} mode={biz} me={me} canEdit={canEdit} onOpen={onOpen} /> : (
    <KpSubNav code={`${info.en} SETTLEMENT`} title="정산관리" icon="inbox" items={[{ key: "청구", label: "청구 · 수금", en: "RECEIVABLES", icon: "receipt" }, { key: "지급", label: "지급", en: "PAYABLES", icon: "wallet" }]} active={sub === "지급" ? "지급" : "청구"} onSelect={setSub}>
      <h2 className="text-lg font-bold mb-3">{sub === "지급" ? "지급" : "청구 · 수금"}</h2>
      <SettlePage key={sub} jobs={jobs} mode={biz} me={me} canEdit={canEdit} onOpen={onOpen} initialTab={sub === "지급" ? "지급" : "청구"} hideTab />
    </KpSubNav>
  );

  return <div data-testid={`freight-${biz}-${page}`}>{head}{body}{drawer}</div>;
}
