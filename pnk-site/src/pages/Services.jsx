// ======================= pnk-site/src/pages/Services.jsx =======================
// 서비스 현황 — 로지스웹 · 로지스웹 허브 · 공식 홈페이지 · 기사앱 상태(정상/점검/장애) · 현재 버전 · 업데이트 기록 · 진행 업무
//  pnkServices/{key}: { status, version, note }  (관리자만 바꿈)
//  pnkReleases/{id}: { product, version, date, title, body, createdBy, createdByName }  (구성원 누구나 기록)
import React from "react";
import { Link } from "react-router-dom";
import { useMeCtx } from "../App";
import { SERVICES, SERVICE_STATUS, addRow, by, orderBy, limit, loadPlatform, removeRow, saveDoc, useCol, ymd } from "../pnkApi";
import { Btn, Card, Chip, Field, Hero, HeroBtn, Input, Modal, Select, Textarea, cx, fail, DateInput } from "../ui";
import Icon from "../icons";

const stOf = (k) => SERVICE_STATUS.find((s) => s.key === (k || "ok")) || SERVICE_STATUS[0];

export default function Services() {
  const me = useMeCtx();
  const [svc] = useCol("pnkServices", [], []);
  const [rel] = useCol("pnkReleases", [orderBy("date", "desc"), limit(80)], []);
  const [tasks] = useCol("pnkTasks", [], []);
  const [edit, setEdit] = React.useState(null);
  const [relEdit, setRelEdit] = React.useState(null);
  const [filter, setFilter] = React.useState("");
  const [errs, setErrs] = React.useState(null);
  React.useEffect(() => { if (me.owner) loadPlatform().then((d) => setErrs(d ? d.totals.openErrors : null)); }, [me.owner]);
  const map = Object.fromEntries((svc || []).map((s) => [s.id, s]));
  const issues = SERVICES.filter((s) => map[s.key]?.status && map[s.key].status !== "ok");

  return (
    <div>
      <Hero title="서비스 현황" desc={issues.length ? `확인이 필요한 서비스 ${issues.length}개 — ${issues.map((s) => s.label).join(", ")}` : "모든 서비스가 정상입니다."}>
        <HeroBtn icon="plus" onClick={() => setRelEdit({})}>업데이트 기록</HeroBtn>
      </Hero>

      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-4 mb-5">
        {SERVICES.map((s) => {
          const d = map[s.key] || {}; const st = stOf(d.status);
          const open = (tasks || []).filter((t) => t.product === s.key && t.status !== "done");
          const last = (rel || []).find((r) => r.product === s.key);
          return (
            <div key={s.key} className="relative overflow-hidden bg-white rounded-2xl border border-line p-5 flex flex-col">
              <div className={cx("absolute inset-x-0 top-0 h-1", st.key === "ok" ? "bg-emerald-500" : st.key === "issue" ? "bg-rose-500" : "bg-amber-500")} />
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-navy text-white flex items-center justify-center shrink-0"><Icon name={s.icon} size={22} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-black">{s.label}</div>
                  <div className="text-[12.5px] text-[#7A8AA8]">{s.sub}</div>
                </div>
                <Chip tone={st.tone}>{st.label}</Chip>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-navy-50 py-2"><div className="text-[11px] font-bold text-[#7A8AA8]">현재 버전</div><div className="text-[14px] font-black tnum">{d.version ? `v${d.version}` : "-"}</div></div>
                <div className="rounded-xl bg-navy-50 py-2"><div className="text-[11px] font-bold text-[#7A8AA8]">진행 업무</div><div className="text-[14px] font-black tnum">{open.length}</div></div>
                <div className="rounded-xl bg-navy-50 py-2"><div className="text-[11px] font-bold text-[#7A8AA8]">{s.key === "logisweb" && errs != null ? "오류 신고" : "최근 배포"}</div><div className="text-[14px] font-black tnum">{s.key === "logisweb" && errs != null ? errs : last ? last.date.slice(5).replace("-", "/") : "-"}</div></div>
              </div>
              {d.note && <div className="mt-3 text-[12.5px] rounded-xl bg-amber-50 text-amber-800 px-3 py-2 font-semibold">{d.note}</div>}
              <div className="mt-auto pt-4 flex gap-2">
                <a href={s.url} target="_blank" rel="noreferrer" className="flex-1"><Btn kind="ghost" icon="link" className="w-full">열기</Btn></a>
                <Link to="/tasks" className="flex-1"><Btn kind="soft" icon="board" className="w-full">업무</Btn></Link>
                {me.isAdmin && <Btn kind="soft" icon="pen" onClick={() => setEdit({ key: s.key, label: s.label, ...d })} aria-label="상태 바꾸기" />}
              </div>
            </div>
          );
        })}
      </div>

      <Card title="업데이트 기록" right={
        <div className="flex gap-1 overflow-x-auto no-scrollbar">{[{ key: "", label: "전체" }, ...SERVICES].map((s) => <button key={s.key} type="button" onClick={() => setFilter(s.key)} className={cx("h-8 px-3 rounded-lg text-[12px] font-black whitespace-nowrap", filter === s.key ? "bg-navy text-white" : "bg-navy-50 text-[#5A6A86]")}>{s.label}</button>)}</div>}>
        {(rel || []).filter((r) => !filter || r.product === filter).length === 0 ? <div className="py-8 text-center text-[13px] text-[#7A8AA8]">아직 기록이 없습니다. 배포할 때마다 [업데이트 기록]으로 남겨 두면 고객 안내 · 인수인계에 씁니다.</div> : (
          <ol className="relative border-l-2 border-navy-100 ml-3 space-y-5">
            {(rel || []).filter((r) => !filter || r.product === filter).map((r) => (
              <li key={r.id} className="pl-6 relative">
                <span className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-navy ring-4 ring-white" />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12.5px] font-black tnum text-[#5A6A86]">{r.date}</span>
                  <Chip>{SERVICES.find((s) => s.key === r.product)?.label || r.product}</Chip>
                  {r.version && <Chip tone="dark">v{r.version}</Chip>}
                  {(r.createdBy === me.user.uid || me.isAdmin) && <button type="button" onClick={() => window.confirm("이 기록을 지울까요?") && removeRow("pnkReleases", r.id).catch(fail)} className="ml-auto text-[11.5px] text-[#A0ABBE] hover:text-rose-600">지우기</button>}
                </div>
                <div className="mt-1 text-[15px] font-black">{r.title}</div>
                {r.body && <div className="mt-1 text-[13.5px] text-[#3A4A66] whitespace-pre-wrap leading-relaxed">{r.body}</div>}
                <div className="mt-1 text-[11.5px] text-[#A0ABBE]">{r.createdByName}</div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {edit && <StatusEditor s={edit} onClose={() => setEdit(null)} />}
      {relEdit && <ReleaseEditor me={me} onClose={() => setRelEdit(null)} />}
    </div>
  );
}

function StatusEditor({ s, onClose }) {
  const [f, setF] = React.useState({ status: s.status || "ok", version: s.version || "", note: s.note || "" });
  const save = () => saveDoc(`pnkServices/${s.key}`, f).then(onClose).catch(fail);
  return (
    <Modal open title={`${s.label} 상태`} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>취소</Btn><Btn onClick={save}>저장</Btn></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-1.5">{SERVICE_STATUS.map((x) => <button key={x.key} type="button" onClick={() => setF({ ...f, status: x.key })} className={cx("h-10 rounded-xl text-[13px] font-black border", f.status === x.key ? "bg-navy text-white border-navy" : "border-[#DCE3EE]")}>{x.label}</button>)}</div>
        <Field label="현재 버전"><Input value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} placeholder="1.3.506" /></Field>
        <Field label="안내 문구" hint="점검 · 장애 내용(대시보드에 보임)"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function ReleaseEditor({ me, onClose }) {
  const [f, setF] = React.useState({ product: "logisweb", version: "", date: ymd(), title: "", body: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    if (!f.title.trim()) { window.alert("제목을 입력해 주세요."); return; }
    const b = by(me);
    addRow("pnkReleases", { ...f, title: f.title.trim(), createdBy: b.uid, createdByName: b.name }).then(onClose).catch(fail);
  };
  return (
    <Modal open title="업데이트 기록" onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>취소</Btn><Btn onClick={save}>저장</Btn></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="서비스" className="col-span-3 sm:col-span-1"><Select value={f.product} onChange={set("product")} options={SERVICES} /></Field>
          <Field label="버전"><Input value={f.version} onChange={set("version")} placeholder="1.4.0" /></Field>
          <Field label="날짜"><DateInput value={f.date} onChange={set("date")} /></Field>
        </div>
        <Field label="제목"><Input value={f.title} onChange={set("title")} placeholder="예: 정산 화면 속도 2배 개선" autoFocus /></Field>
        <Field label="내용"><Textarea rows={6} value={f.body} onChange={set("body")} placeholder={"- 바뀐 점\n- 고객 안내 필요 여부"} /></Field>
      </div>
    </Modal>
  );
}
