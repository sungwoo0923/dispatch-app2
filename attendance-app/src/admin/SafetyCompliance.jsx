import { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { FileCheck2, FileBarChart, Plus, Trash2, Printer } from "lucide-react";
import { Link } from "react-router-dom";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Card from "../components/Card";
import Panel from "../components/Panel";
import { formatDate, toDateKey } from "../utils/dateUtils";
import { openComplianceReportPreview } from "../utils/reportTemplates";

const TOP_TABS = [
  { key: "dashboard", label: "이수율 현황" },
  { key: "report", label: "감사보고서 생성" },
  { key: "log", label: "점검 이력" },
];

// 인스펙터가 "제일 먼저" 짚어볼 법한 기준선 — 이 아래로 떨어진 센터는
// 대시보드에서 붉은 배지로 즉시 눈에 띄게 한다.
const WARN_THRESHOLD = 80;

function monthsAgoKey(dateKey, months) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setMonth(d.getMonth() - months);
  return toDateKey(d);
}

function toDateTimeLabel(ts) {
  if (!ts?.toDate) return "-";
  const d = ts.toDate();
  return `${formatDate(toDateKey(d))} ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
}

function rate(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export default function SafetyCompliance() {
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
    <div className="space-y-6">
      <Panel icon={FileCheck2} title="안전교육 리포트">
        <p className="mb-4 text-xs text-muted">
          근로감독관 방문이나 정부 감사 시 안전교육 이수 관리가 제대로 이루어지고 있음을 보여줄 수 있는 자료입니다. 센터/자료별
          이수율을 확인하고, 서명 증빙이 포함된 감사보고서를 출력하며, 점검 이력을 남길 수 있습니다.
        </p>
        <div className="mb-4 flex flex-nowrap overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100 bg-white">
          {TOP_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`shrink-0 px-4 py-3 text-sm font-medium ${tab === t.key ? "bg-primary-dark text-white" : "text-muted hover:bg-slate-50"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "dashboard" && (
          <DashboardTab
            employees={employees}
            activeMaterials={activeMaterials}
            completions={completions}
            workSites={workSites}
            siteName={siteName}
            missingMaterialsFor={missingMaterialsFor}
          />
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
      </Panel>
    </div>
  );
}

// ── 탭 1: 이수율 현황 ──────────────────────────────────────────
function DashboardTab({ employees, activeMaterials, completions, workSites, siteName, missingMaterialsFor }) {
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
      return {
        id: m.id,
        title: m.title,
        type: m.type,
        createdAt: m.createdAt,
        target: totalTargets,
        completed: completedCount,
        rate: rate(completedCount, totalTargets),
        missing: totalTargets - completedCount,
      };
    });

    return { totalTargets, activeCount, overallRate, missingEmployees, bySite, byMaterial };
  }, [employees, activeMaterials, completions, workSites, siteName, missingMaterialsFor]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="전체 대상인원" value={`${stats.totalTargets}명`} />
        <SummaryCard label="활성 교육자료 수" value={`${stats.activeCount}건`} />
        <SummaryCard
          label="전사 평균 이수율"
          value={`${stats.overallRate}%`}
          tone={stats.overallRate < WARN_THRESHOLD ? "danger" : "success"}
        />
        <SummaryCard label="미이수 인원" value={`${stats.missingEmployees}명`} tone={stats.missingEmployees > 0 ? "warning" : "success"} />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-ink">센터별 이수현황</p>
        <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
          <table className="w-full min-w-[560px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-2.5 font-semibold">센터명</th>
                <th className="px-3 py-2.5 font-semibold">소속인원</th>
                <th className="px-3 py-2.5 font-semibold">평균이수율</th>
                <th className="px-3 py-2.5 font-semibold">미이수인원</th>
              </tr>
            </thead>
            <tbody>
              {stats.bySite.map((s) => (
                <tr key={s.key} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-2.5 text-ink">{s.name}</td>
                  <td className="px-3 py-2.5 text-ink">{s.count}명</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={s.rate < WARN_THRESHOLD ? "danger" : "success"}>{s.rate}%</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-ink">{s.missing}명</td>
                </tr>
              ))}
              {stats.bySite.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-xs text-muted">
                    소속 근로자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[11px] text-muted">이수율 {WARN_THRESHOLD}% 미만 센터는 붉은 배지로 표시됩니다 — 우선 점검 대상입니다.</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-ink">안전교육자료별 이수현황</p>
        <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
          <table className="w-full min-w-[640px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-2.5 font-semibold">교육명</th>
                <th className="px-3 py-2.5 font-semibold">등록일</th>
                <th className="px-3 py-2.5 font-semibold">대상인원</th>
                <th className="px-3 py-2.5 font-semibold">이수인원</th>
                <th className="px-3 py-2.5 font-semibold">이수율</th>
                <th className="px-3 py-2.5 font-semibold">미이수인원</th>
              </tr>
            </thead>
            <tbody>
              {stats.byMaterial.map((m) => (
                <tr key={m.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2.5 text-left">
                    <Link to="/safety/materials" className="text-primary hover:underline">
                      {m.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-ink">{m.createdAt?.toDate ? formatDate(toDateKey(m.createdAt.toDate())) : "-"}</td>
                  <td className="px-3 py-2.5 text-ink">{m.target}명</td>
                  <td className="px-3 py-2.5 text-ink">{m.completed}명</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={m.rate < WARN_THRESHOLD ? "danger" : "success"}>{m.rate}%</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-ink">{m.missing}명</td>
                </tr>
              ))}
              {stats.byMaterial.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted">
                    등록된 안전교육자료가 없습니다. 안전 &gt; 안전교육자료에서 먼저 등록해주세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone = "primary" }) {
  const toneClass =
    tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-primary";
  return (
    <Card className="p-4">
      <p className="mb-1.5 text-xs font-medium text-muted">{label}</p>
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
    </Card>
  );
}

// ── 탭 2: 감사보고서 생성 ──────────────────────────────────────
function ReportTab({
  companyName,
  employees,
  activeMaterials,
  completions,
  workSites,
  businessEntities,
  siteName,
  missingMaterialsFor,
  onReportGenerated,
  onJumpToLog,
}) {
  const toast = useToast();
  const today = toDateKey();
  const [filters, setFilters] = useState({ start: monthsAgoKey(today, 12), end: today, siteId: "" });
  const [lastGenerated, setLastGenerated] = useState(null);

  const generate = () => {
    if (!filters.start || !filters.end || filters.start > filters.end) {
      return;
    }
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
          completedAt: toDateTimeLabel(c.completedAt),
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
    const businessEntityLabel = filters.siteId
      ? entityLabelForSite(filters.siteId)
      : businessEntities.map((b) => b.name).filter(Boolean).join(", ") || "-";

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
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">조회기간 시작</span>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={filters.start}
              onChange={(e) => setFilters((f) => ({ ...f, start: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">조회기간 종료</span>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={filters.end}
              onChange={(e) => setFilters((f) => ({ ...f, end: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={filters.siteId}
              onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value }))}
            >
              <option value="">전체</option>
              {workSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-[11px] text-muted">
          보고서에는 회사/사업자 정보, 이수율 요약, 안전교육자료별 이수현황, 조회기간 내 서명 증빙(전자서명 이미지 포함), 미이수자
          명단이 함께 출력됩니다. "보고서 생성"을 누르면 새 창에서 내용을 먼저 확인할 수 있고, 창 상단의 "인쇄 / PDF로 저장"
          버튼을 누르면 인쇄하거나 브라우저 인쇄창에서 PDF 파일로 저장할 수 있습니다.
        </p>
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain border-t border-slate-100 pt-3">
          <Button size="sm" onClick={generate}>
            <FileBarChart size={13} /> 보고서 생성
          </Button>
          {lastGenerated && (
            <Button size="sm" variant="outline" onClick={onJumpToLog}>
              <Printer size={13} /> 방금 만든 보고서로 점검이력 기록하기
            </Button>
          )}
        </div>
        {lastGenerated && <p className="text-[11px] text-muted">최근 생성: {lastGenerated}</p>}
      </Card>
    </div>
  );
}

// ── 탭 3: 점검 이력 ────────────────────────────────────────────
const EMPTY_LOG_FORM = { visitDate: toDateKey(), org: "", inspector: "", note: "", reportRef: "" };

function LogTab({ companyId, profile, confirm, toast, auditLogs, pendingReportRef, clearPendingReportRef }) {
  const [form, setForm] = useState(EMPTY_LOG_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pendingReportRef) {
      setForm((f) => ({ ...f, reportRef: pendingReportRef }));
    }
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
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold text-ink">신규 점검 이력 등록</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">점검일자 *</span>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.visitDate}
              onChange={(e) => setForm((f) => ({ ...f, visitDate: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">점검기관 *</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.org}
              onChange={(e) => setForm((f) => ({ ...f, org: e.target.value }))}
              placeholder="예: OO지방고용노동청, 내부감사"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">점검자</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.inspector}
              onChange={(e) => setForm((f) => ({ ...f, inspector: e.target.value }))}
              placeholder="담당 근로감독관/감사자 성명"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">관련 보고서</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.reportRef}
              onChange={(e) => setForm((f) => ({ ...f, reportRef: e.target.value }))}
              placeholder="감사보고서 생성 탭에서 자동 채움"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">점검결과/메모</span>
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={3}
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="점검 결과, 지적사항, 후속조치 내용 등을 자유롭게 기록하세요."
          />
        </label>
        <div className="flex justify-end border-t border-slate-100 pt-3">
          <Button size="sm" onClick={save} disabled={saving}>
            <Plus size={13} /> {saving ? "등록 중..." : "등록"}
          </Button>
        </div>
      </Card>

      <div>
        <p className="mb-2 text-xs font-medium text-muted">목록 {sorted.length}</p>
        <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
          <table className="w-full min-w-[760px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-2.5 font-semibold">점검일자</th>
                <th className="px-3 py-2.5 font-semibold">점검기관</th>
                <th className="px-3 py-2.5 font-semibold">점검자</th>
                <th className="px-3 py-2.5 font-semibold">점검결과/메모</th>
                <th className="px-3 py-2.5 font-semibold">관련 보고서</th>
                <th className="px-3 py-2.5 font-semibold">삭제</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((log) => (
                <tr key={log.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-2.5 text-ink">{formatDate(log.visitDate)}</td>
                  <td className="px-3 py-2.5 text-ink">{log.org || "-"}</td>
                  <td className="px-3 py-2.5 text-ink">{log.inspector || "-"}</td>
                  <td className="max-w-xs truncate px-3 py-2.5 text-left text-ink" title={log.note}>
                    {log.note || "-"}
                  </td>
                  <td className="px-3 py-2.5 text-ink">{log.reportRef || "-"}</td>
                  <td className="px-3 py-2.5">
                    <button type="button" className="text-muted hover:text-danger" onClick={() => remove(log)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted">
                    등록된 점검 이력이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
