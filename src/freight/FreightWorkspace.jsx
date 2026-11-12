// ======================= src/freight/FreightWorkspace.jsx =======================
// 🚢 2026-11-12 컨테이너 · 해상 · 항공 · 통합 현황 화면 — 상단 메뉴 키("biz:<영역>:<화면>")에 맞는 화면을 그린다
import React from "react";
import { parseBizMenu, bizMenuKey, bizInfo, bizMenuLabel } from "../bizModules";
import { useFreightJobs } from "./freightStore";
import FreightForm from "./FreightForm";
import FreightBoard, { LegDrawer } from "./FreightBoard";
import { ModeDashboard, DeadlineBoard, PnlPage, GroupOverview, JobTimeline, Clients360 } from "./FreightDash";
import { PageHead, Btn } from "./ui";

const DESC = {
  dash: "진행 · 마감 · 인계 · 이익을 한 화면에서",
  new: "드롭다운 · 달력으로 빠르게 등록",
  list: "진행 단계와 마감을 줄마다 확인",
  deadline: "넘기면 비용이 나가는 마감을 시간순으로",
  pnl: "Job · 거래처별 매출 · 매입 · 이익",
  handoff: "다른 팀이 넘긴 건을 받아 이어서 진행",
  overview: "전 사업부 건수 · 마감 · 손익",
  jobs: "화물 하나가 팀을 거쳐 가는 흐름",
  clients: "거래처별 이용 사업부와 영업 기회",
};

export default function FreightWorkspace({ menuKey, modules = [], me = "", canEdit = true, inlandRows = [], clients = [], drivers = [], places = [], onMenu, onBiz }) {
  const { biz, page } = parseBizMenu(menuKey);
  const info = bizInfo(biz);
  const { jobs, loaded } = useFreightJobs();
  const [openId, setOpenId] = React.useState("");
  const [edit, setEdit] = React.useState(null);
  React.useEffect(() => { setEdit(null); setOpenId(""); }, [menuKey]);

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
  const drawer = <LegDrawer job={open} jobs={jobs} modules={modules} me={me} canEdit={canEdit} onClose={() => setOpenId("")} onEdit={(j) => { setOpenId(""); setEdit(j); }} onOpenLeg={onOpen} />;

  const head = (
    <PageHead mode={biz} en={`${info.en} · ${String(page || "").toUpperCase()}`} title={biz === "group" ? bizMenuLabel(menuKey) : biz === "inland" ? "내륙 인계함" : `${info.short} ${bizMenuLabel(menuKey)}`} desc={DESC[page]}
      right={biz !== "group" && biz !== "inland" && page !== "new" && canEdit ? <Btn kind="primary" onClick={() => go("new")}>+ {bizMenuLabel(bizMenuKey(biz, "new"))}</Btn> : null} />
  );
  if (!loaded) return <div>{head}<div className="py-20 text-center text-[13.5px] font-bold text-[#9AA9C3]">불러오는 중…</div></div>;

  // 상세 창에서 [수정]을 누른 경우 — 어느 화면에서든 그 건의 수정 화면으로
  if (edit) {
    return (
      <div>
        {head}
        <div className="flex items-center gap-2 mb-4"><Btn size="sm" onClick={() => setEdit(null)}>← 돌아가기</Btn><span className="text-[14px] font-black text-[#0F1A30]">{edit.refNo} 수정</span></div>
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
    else body = <Clients360 jobs={jobs} inlandRows={inlandRows} modules={modules} />;
  } else if (page === "dash") body = <ModeDashboard mode={biz} jobs={jobs} onOpen={onOpen} go={go} canEdit={canEdit} />;
  else if (page === "new") body = canEdit ? <FreightForm key={biz} {...formProps} mode={biz} onGoList={() => go("list")} /> : <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">조회 전용 계정은 등록할 수 없습니다.</div>;
  else if (page === "list") body = <FreightBoard mode={biz} jobs={jobs} allJobs={jobs} modules={modules} me={me} canEdit={canEdit} formProps={formProps} onNew={biz === "inland" ? null : () => go("new")} />;
  else if (page === "handoff" && biz === "inland") body = <FreightBoard mode="inland" jobs={jobs} allJobs={jobs} modules={modules} me={me} canEdit={canEdit} formProps={formProps} />;
  else if (page === "handoff") body = <FreightBoard mode={biz} jobs={jobs} allJobs={jobs} handoffOnly modules={modules} me={me} canEdit={canEdit} formProps={formProps} />;
  else if (page === "deadline") body = <DeadlineBoard jobs={jobs} mode={biz} onOpen={onOpen} />;
  else if (page === "pnl") body = <PnlPage jobs={jobs} mode={biz} onOpen={onOpen} />;

  return <div data-testid={`freight-${biz}-${page}`}>{head}{body}{drawer}</div>;
}
