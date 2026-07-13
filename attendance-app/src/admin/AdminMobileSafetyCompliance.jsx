import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { FileBarChart, Plus, Trash2 } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import { formatDate, toDateKey } from "../utils/dateUtils";
import { openComplianceReportPreview } from "../utils/reportTemplates";

const TABS = [
  { key: "dashboard", label: "이수율 현황" },
  { key: "report", label: "감사보고서" },
  { key: "log", label: "점검 이력" },
];

const WARN_THRESHOLD = 80;

function monthsAgoKey(dateKey, months) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setMonth(d.getMonth() - months);
  return toDateKey(d);
}

function rate(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

// 감사자료의 모바일 전용 화면 — PC 버전(SafetyCompliance.jsx)과 동일한
// 데이터/기능(이수율 대시보드, 감사보고서 생성, 점검 이력)을 모바일에서
// 가로 스크롤 표 대신 카드 목록으로 보여준다. 이전에는 nav 메뉴에 "감사자료"
// 항목은 있었지만 모바일 라우트가 없어 누르면 홈으로 튕겨나갔다.
export default function AdminMobileSafetyCompliance() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [tab, setTab] = useState("dashboard");
  const [pendingReportRef, setPendingReportRef] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [employees, setEmployees] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [businessEntities, setBusinessEntities] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  useEffect(() => {
    if (!profile?.companyId) return;
    getDoc(doc(db, "companies", profile.companyId)).then((s) => setCompanyName(s.data()?.name || ""));
    const unsubs = [
      onSnapshot(
        query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
        (s) => setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !e.deleted))
      ),
      onSnapshot(query(collection(db, "safetyMaterials"), where("companyId", "==", profile.companyId)), (s) =>
        setMaterials(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "safetyCompletions"), where("companyId", "==", profile.companyId)), (s) =>
        setCompletions(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) =>
        setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (s) =>
        setBusinessEntities(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "complianceAuditLogs"), where("companyId", "==", profile.companyId)), (s) =>
        setAuditLogs(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const activeMaterials = useMemo(() => materials.filter((m) => m.active), [materials]);
  const siteName = (id) => (id ? workSites.find((s) => s.id === id)?.name || "미배정" : "미배정");
  const hasCompleted = (uid, materialId) => completions.some((c) => c.uid === uid && c.materialId === materialId);
  const missingMaterialsFor = (emp) => activeMaterials.filter((m) => !hasCompleted(emp.id, m.id));

  return (
    <div className="space-y-3 px-4 pt-4">
      <div>
        <p className="text-sm font-semibold text-ink">감사자료</p>
        <p className="mt-0.5 text-xs text-muted">근로감독관 방문/정부 감사 대비 이수율·증빙 자료입니다</p>
      </div>

      <div className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              tab === t.key ? "bg-primary text-white" : "bg-white text-muted border border-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <DashboardTab employees={employees} activeMaterials={activeMaterials} completions={completions} siteName={siteName} missingMaterialsFor={missingMaterialsFor} />
      )}
      {tab === "report" && (
        <ReportTab
          companyName={companyName}
          employees={employees}
          activeMaterials={activeMaterials}
          completions={completions}
          workSites={workSites}
          businessEntities={businessEntities}
          siteName={siteName}
          missingMaterialsFor={missingMaterialsFor}
          onReportGenerated={(summaryText) => setPendingReportRef(summaryText)}
          onJumpToLog={() => setTab("log")}
        />
      )}
      {tab === "log" && (
        <LogTab
          companyId={profile.companyId}
          profile={profile}
          confirm={confirm}
          toast={toast}
          auditLogs={auditLogs}
          pendingReportRef={pendingReportRef}
          clearPendingReportRef={() => setPendingReportRef("")}
        />
      )}
    </div>
  );
}

function DashboardTab({ employees, activeMaterials, completions, siteName, missingMaterialsFor }) {
  const stats = useMemo(() => {
    const totalTargets = employees.length;
    const activeCount = activeMaterials.length;
    const slots = totalTargets * activeCount;
    let completedSlots = 0;
    let missingEmployees = 0;
    employees.forEach((e) => {
      const missing = missingMaterialsFor(e);
      completedSlots += activeCount - missing.length;
      if (missing.length > 0) missingEmployees += 1;
    });
    const overallRate = rate(completedSlots, slots);

    const siteGroups = new Map();
    employees.forEach((e) => {
      const key = e.workSiteId || "__unassigned";
      if (!siteGroups.has(key)) siteGroups.set(key, { key, name: siteName(e.workSiteId), employees: [] });
      siteGroups.get(key).employees.push(e);
    });
    const bySite = [...siteGroups.values()]
      .map((g) => {
        const slots_ = g.employees.length * activeCount;
        let completed_ = 0;
        let missing_ = 0;
        g.employees.forEach((e) => {
          const missing = missingMaterialsFor(e);
          completed_ += activeCount - missing.length;
          if (missing.length > 0) missing_ += 1;
        });
        return { key: g.key, name: g.name, count: g.employees.length, rate: rate(completed_, slots_), missing: missing_ };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const employeeIds = new Set(employees.map((e) => e.id));
    const byMaterial = activeMaterials.map((m) => {
      const completedCount = completions.filter((c) => c.materialId === m.id && employeeIds.has(c.uid)).length;
      return { id: m.id, title: m.title, target: totalTargets, completed: completedCount, rate: rate(completedCount, totalTargets), missing: totalTargets - completedCount };
    });

    return { totalTargets, activeCount, overallRate, missingEmployees, bySite, byMaterial };
  }, [employees, activeMaterials, completions, siteName, missingMaterialsFor]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-medium text-muted">전체 대상인원</p>
          <p className="mt-1 text-lg font-bold text-ink">{stats.totalTargets}명</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-medium text-muted">활성 교육자료 수</p>
          <p className="mt-1 text-lg font-bold text-ink">{stats.activeCount}건</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-medium text-muted">전사 평균 이수율</p>
          <p className={`mt-1 text-lg font-bold ${stats.overallRate < WARN_THRESHOLD ? "text-danger" : "text-success"}`}>{stats.overallRate}%</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-medium text-muted">미이수 인원</p>
          <p className={`mt-1 text-lg font-bold ${stats.missingEmployees > 0 ? "text-warning" : "text-success"}`}>{stats.missingEmployees}명</p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-ink">센터별 이수현황</p>
        <div className="space-y-1.5">
          {stats.bySite.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-muted">소속 근로자가 없습니다.</div>}
          {stats.bySite.map((s) => (
            <div key={s.key} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{s.name}</p>
                <p className="mt-0.5 text-[11px] text-muted">소속 {s.count}명 · 미이수 {s.missing}명</p>
              </div>
              <Badge tone={s.rate < WARN_THRESHOLD ? "danger" : "success"}>{s.rate}%</Badge>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-ink">안전교육자료별 이수현황</p>
        <div className="space-y-1.5">
          {stats.byMaterial.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-muted">등록된 안전교육자료가 없습니다.</div>
          )}
          {stats.byMaterial.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{m.title}</p>
                <p className="mt-0.5 text-[11px] text-muted">대상 {m.target}명 · 이수 {m.completed}명 · 미이수 {m.missing}명</p>
              </div>
              <Badge tone={m.rate < WARN_THRESHOLD ? "danger" : "success"}>{m.rate}%</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportTab({ companyName, employees, activeMaterials, completions, workSites, businessEntities, siteName, missingMaterialsFor, onReportGenerated, onJumpToLog }) {
  const toast = useToast();
  const today = toDateKey();
  const [filters, setFilters] = useState({ start: monthsAgoKey(today, 12), end: today, siteId: "" });
  const [lastGenerated, setLastGenerated] = useState(null);

  const generate = () => {
    if (!filters.start || !filters.end || filters.start > filters.end) return;
    const scopeEmployees = filters.siteId ? employees.filter((e) => e.workSiteId === filters.siteId) : employees;
    const scopeIds = new Set(scopeEmployees.map((e) => e.id));

    const target = scopeEmployees.length;
    const completed = scopeEmployees.filter((e) => missingMaterialsFor(e).length === 0 && activeMaterials.length > 0).length;
    const summary = { target, completed, rate: rate(completed, target), missing: target - completed };

    const materialRows = activeMaterials.map((m) => {
      const completedCount = completions.filter((c) => c.materialId === m.id && scopeIds.has(c.uid)).length;
      return {
        title: m.title,
        type: m.type === "video" ? "영상" : "지침",
        createdAt: m.createdAt?.toDate ? formatDate(toDateKey(m.createdAt.toDate())) : "-",
        target,
        completed: completedCount,
        rate: rate(completedCount, target),
      };
    });

    const materialById = new Map(activeMaterials.map((m) => [m.id, m]));
    const evidenceRows = completions
      .filter((c) => scopeIds.has(c.uid))
      .filter((c) => {
        const d = c.completedAt?.toDate ? toDateKey(c.completedAt.toDate()) : null;
        return d && d >= filters.start && d <= filters.end;
      })
      .map((c) => {
        const emp = scopeEmployees.find((e) => e.id === c.uid);
        return {
          name: emp?.name || "-",
          center: siteName(emp?.workSiteId),
          materialTitle: materialById.get(c.materialId)?.title || "(삭제된 자료)",
          completedAt: c.completedAt?.toDate ? `${formatDate(toDateKey(c.completedAt.toDate()))} ${c.completedAt.toDate().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : "-",
          signatureDataUrl: c.signatureDataUrl || "",
        };
      })
      .sort((a, b) => a.completedAt.localeCompare(b.completedAt));

    const outstandingRows = scopeEmployees
      .map((e) => ({ name: e.name, center: siteName(e.workSiteId), missing: missingMaterialsFor(e).map((m) => m.title) }))
      .filter((o) => o.missing.length > 0);

    const entityLabelForSite = (siteId) => {
      const site = workSites.find((s) => s.id === siteId);
      const entity = businessEntities.find((b) => b.id === site?.businessEntityId);
      return entity ? `${entity.name}${entity.regNumber ? ` (${entity.regNumber})` : ""}` : "-";
    };
    const businessEntityLabel = filters.siteId ? entityLabelForSite(filters.siteId) : businessEntities.map((b) => b.name).filter(Boolean).join(", ") || "-";
    const scopeLabel = filters.siteId ? siteName(filters.siteId) : "전체 센터";
    const generatedAt = new Date().toLocaleString("ko-KR");

    const opened = openComplianceReportPreview({
      companyName,
      businessEntityLabel,
      scopeLabel,
      periodStart: filters.start,
      periodEnd: filters.end,
      generatedAt,
      summary,
      materialRows,
      evidenceRows,
      outstandingRows,
    });
    if (!opened) {
      toast.error("팝업이 차단되어 보고서를 열 수 없습니다. 브라우저의 팝업 차단을 해제해주세요.");
      return;
    }

    const summaryText = `${filters.start} ~ ${filters.end} · ${scopeLabel} · 생성 ${generatedAt}`;
    setLastGenerated(summaryText);
    onReportGenerated?.(summaryText);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">조회기간 시작</span>
          <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.start} onChange={(e) => setFilters((f) => ({ ...f, start: e.target.value }))} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">조회기간 종료</span>
          <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.end} onChange={(e) => setFilters((f) => ({ ...f, end: e.target.value }))} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.siteId} onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value }))}>
            <option value="">전체</option>
            {workSites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <p className="text-[11px] text-muted">
          보고서에는 회사/사업자 정보, 이수율 요약, 자료별 이수현황, 조회기간 내 서명 증빙, 미이수자 명단이 함께 출력됩니다. 새 창에서
          내용을 먼저 확인한 뒤 상단의 "인쇄 / PDF로 저장" 버튼으로 저장할 수 있습니다.
        </p>
        <button
          type="button"
          onClick={generate}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white active:bg-primary-dark"
        >
          <FileBarChart size={15} /> 보고서 생성
        </button>
        {lastGenerated && (
          <>
            <p className="text-[11px] text-muted">최근 생성: {lastGenerated}</p>
            <button type="button" onClick={onJumpToLog} className="w-full rounded-xl border border-slate-200 py-2 text-xs font-medium text-muted active:bg-slate-50">
              방금 만든 보고서로 점검이력 기록하기
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const EMPTY_LOG_FORM = { visitDate: toDateKey(), org: "", inspector: "", note: "", reportRef: "" };

function LogTab({ companyId, profile, confirm, toast, auditLogs, pendingReportRef, clearPendingReportRef }) {
  const [form, setForm] = useState(EMPTY_LOG_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pendingReportRef) setForm((f) => ({ ...f, reportRef: pendingReportRef }));
  }, [pendingReportRef]);

  const sorted = [...auditLogs].sort((a, b) => (b.visitDate || "").localeCompare(a.visitDate || ""));

  const save = async () => {
    if (!form.visitDate || !form.org.trim()) {
      toast.error("점검일자와 점검기관을 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, "complianceAuditLogs"), {
        companyId,
        visitDate: form.visitDate,
        org: form.org,
        inspector: form.inspector,
        note: form.note,
        reportRef: form.reportRef,
        createdAt: serverTimestamp(),
        createdBy: profile?.id || "",
        createdByName: profile?.name || "관리자",
      });
      toast.success("점검 이력이 등록되었습니다");
      setForm(EMPTY_LOG_FORM);
      clearPendingReportRef();
    } catch (err) {
      toast.error(`등록에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (log) => {
    if (!(await confirm(`${log.visitDate} · ${log.org} 점검 이력을 삭제하시겠습니까?`, "delete"))) return;
    await deleteDoc(doc(db, "complianceAuditLogs", log.id));
    toast.success("삭제되었습니다");
  };

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5">
        <p className="text-sm font-semibold text-ink">신규 점검 이력 등록</p>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">점검일자 *</span>
          <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.visitDate} onChange={(e) => setForm((f) => ({ ...f, visitDate: e.target.value }))} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">점검기관 *</span>
          <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.org} onChange={(e) => setForm((f) => ({ ...f, org: e.target.value }))} placeholder="예: OO지방고용노동청, 내부감사" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">점검자</span>
          <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.inspector} onChange={(e) => setForm((f) => ({ ...f, inspector: e.target.value }))} placeholder="담당 근로감독관/감사자 성명" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">관련 보고서</span>
          <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.reportRef} onChange={(e) => setForm((f) => ({ ...f, reportRef: e.target.value }))} placeholder="감사보고서 탭에서 자동 채움" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">점검결과/메모</span>
          <textarea className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={3} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="점검 결과, 지적사항, 후속조치 내용 등을 자유롭게 기록하세요." />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white active:bg-primary-dark disabled:opacity-60"
        >
          <Plus size={15} /> {saving ? "등록 중..." : "등록"}
        </button>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted">목록 {sorted.length}</p>
        <div className="space-y-1.5">
          {sorted.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-muted">등록된 점검 이력이 없습니다.</div>}
          {sorted.map((log) => (
            <div key={log.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{formatDate(log.visitDate)} · {log.org || "-"}</p>
                  {log.inspector && <p className="mt-0.5 text-xs text-muted">점검자: {log.inspector}</p>}
                </div>
                <button type="button" className="shrink-0 text-muted hover:text-danger" onClick={() => remove(log)}>
                  <Trash2 size={15} />
                </button>
              </div>
              {log.note && <p className="mt-1.5 text-xs text-ink">{log.note}</p>}
              {log.reportRef && <p className="mt-1 text-[11px] text-muted">관련 보고서: {log.reportRef}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
