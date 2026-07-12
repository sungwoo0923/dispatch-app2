import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Search, Plus, Trash2, ArrowUp, ArrowDown, ChevronRight } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Badge from "../components/Badge";
import { formatDate, toDateKey } from "../utils/dateUtils";

const TOP_TABS = [
  { key: "templates", label: "휴가템플릿" },
  { key: "types", label: "휴가유형" },
  { key: "sites", label: "센터별설정" },
];

// 휴가설정의 모바일 전용 화면 — PC의 표+SidePanel 대신 카드 목록+모달 폼으로
// 재구성했다. 예전엔 이 경로가 모바일 셸 안에서도 PC 컴포넌트를 그대로
// 렌더링해 표가 가로로 잘려 보였는데, 그 과도기 화면을 대체한다.
export default function AdminMobileLeaveSettings() {
  const [tab, setTab] = useState("templates");
  return (
    <div className="space-y-3 px-4 pt-4">
      <div>
        <p className="text-sm font-semibold text-ink">휴가설정</p>
        <p className="mt-0.5 text-xs text-muted">휴가 발생규칙·유형·센터별 적용을 관리합니다</p>
      </div>
      <div className="flex flex-nowrap overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 bg-white">
        {TOP_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 flex-1 px-3 py-2.5 text-center text-sm font-medium ${tab === t.key ? "bg-primary-dark text-white" : "text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "templates" && <TemplatesTab />}
      {tab === "types" && <TypesTab />}
      {tab === "sites" && <SitesTab />}
    </div>
  );
}

// ── 휴가템플릿 ──────────────────────────────────────────────
const EMPTY_TEMPLATE_FORM = { businessEntityId: "", name: "", cycleStartMonth: "1월", cycleStartDay: "1일", memo: "", visibility: "보임", monthlyRules: [], yearlyRules: [] };
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);
const DAYS = Array.from({ length: 31 }, (_, i) => `${i + 1}일`);

const standardMonthlyRules = () => Array.from({ length: 11 }, (_, i) => ({ key: `month_${i + 1}`, days: 1 }));
const standardYearlyRules = () =>
  Array.from({ length: 21 }, (_, i) => {
    const year = i + 1;
    return { key: `year_${year}`, days: Math.min(15 + Math.floor((year - 1) / 2), 25) };
  });

function TemplatesTab() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [entities, setEntities] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_TEMPLATE_FORM);
  const [open, setOpen] = useState(false);
  const [ruleModal, setRuleModal] = useState(null); // "monthly" | "yearly" | null

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (s) => setEntities(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "leaveTemplates"), where("companyId", "==", profile.companyId)), (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";
  const rows = useMemo(
    () => items.filter((t) => !search || t.name?.includes(search)).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [items, search]
  );

  const startNew = () => {
    setSelectedId(null);
    setForm(EMPTY_TEMPLATE_FORM);
    setOpen(true);
  };
  const select = (t) => {
    setSelectedId(t.id);
    setForm({
      ...EMPTY_TEMPLATE_FORM,
      ...t,
      monthlyRules: t.monthlyRules?.length ? t.monthlyRules : standardMonthlyRules(),
      yearlyRules: t.yearlyRules?.length ? t.yearlyRules : standardYearlyRules(),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("템플릿명을 입력해주세요.");
      return;
    }
    try {
      if (selectedId) {
        await updateDoc(doc(db, "leaveTemplates", selectedId), form);
        toast.success("저장되었습니다");
      } else {
        const monthlyRules = standardMonthlyRules();
        const yearlyRules = standardYearlyRules();
        const ref_ = await addDoc(collection(db, "leaveTemplates"), {
          companyId: profile.companyId,
          ...form,
          monthlyRules,
          yearlyRules,
          createdAt: serverTimestamp(),
        });
        setSelectedId(ref_.id);
        setForm((f) => ({ ...f, monthlyRules, yearlyRules }));
        toast.success("저장되었습니다. 근속월규칙/근속연도규칙을 이어서 설정할 수 있습니다.");
      }
    } catch (err) {
      toast.error(`저장에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    }
  };
  const remove = async () => {
    if (!selectedId) return;
    if (!(await confirm("이 휴가템플릿을 삭제하시겠습니까?", "delete"))) return;
    try {
      await deleteDoc(doc(db, "leaveTemplates", selectedId));
      toast.success("삭제되었습니다");
      setOpen(false);
    } catch (err) {
      toast.error(`삭제에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="템플릿명 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
        </div>
        <Button size="sm" onClick={startNew}>
          <Plus size={13} /> 신규
        </Button>
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">등록된 휴가템플릿이 없습니다.</div>}
        {rows.map((t) => (
          <button key={t.id} type="button" onClick={() => select(t)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{t.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{entityName(t.businessEntityId)}</p>
            </div>
            <Badge tone={t.visibility === "숨김" ? "muted" : "success"}>{t.visibility || "보임"}</Badge>
            <ChevronRight size={16} className="shrink-0 text-slate-300" />
          </button>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={selectedId ? "휴가템플릿 상세" : "휴가템플릿 신규"}
        footer={
          <>
            {selectedId && (
              <Button variant="outline" onClick={remove}>
                삭제
              </Button>
            )}
            <Button onClick={save}>저장</Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.businessEntityId} onChange={(e) => setForm((f) => ({ ...f, businessEntityId: e.target.value }))}>
              <option value="">선택</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">템플릿명 *</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">집계시작일 *</span>
            <div className="flex items-center gap-2">
              <select className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.cycleStartMonth} onChange={(e) => setForm((f) => ({ ...f, cycleStartMonth: e.target.value }))}>
                {MONTHS.map((m) => <option key={m}>{m}</option>)}
              </select>
              <select className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.cycleStartDay} onChange={(e) => setForm((f) => ({ ...f, cycleStartDay: e.target.value }))}>
                {DAYS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">메모</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} />
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">숨김여부</span>
            <div className="flex items-center gap-3 text-sm">
              {["숨김", "보임"].map((v) => (
                <label key={v} className="flex items-center gap-1.5">
                  <input type="radio" checked={form.visibility === v} onChange={() => setForm((f) => ({ ...f, visibility: v }))} />
                  {v}
                </label>
              ))}
            </div>
          </div>
          {selectedId ? (
            <div className="flex gap-2 border-t border-slate-100 pt-3">
              <Button variant="outline" className="flex-1" onClick={() => setRuleModal("monthly")}>근속월규칙</Button>
              <Button variant="outline" className="flex-1" onClick={() => setRuleModal("yearly")}>근속연도규칙</Button>
            </div>
          ) : (
            <p className="text-[11px] text-muted">먼저 저장하면 근속월규칙/근속연도규칙을 설정할 수 있습니다.</p>
          )}
        </div>
      </Modal>

      <RuleListModal
        open={ruleModal === "monthly"}
        onClose={() => setRuleModal(null)}
        title="근속월규칙"
        unitSuffix="개월"
        list={form.monthlyRules}
        setForm={setForm}
        field="monthlyRules"
      />
      <RuleListModal
        open={ruleModal === "yearly"}
        onClose={() => setRuleModal(null)}
        title="근속연도규칙"
        unitSuffix="년"
        list={form.yearlyRules}
        setForm={setForm}
        field="yearlyRules"
      />
    </div>
  );
}

function RuleListModal({ open, onClose, title, unitSuffix, list, setForm, field }) {
  const setDays = (idx, days) => setForm((f) => ({ ...f, [field]: f[field].map((r, i) => (i === idx ? { ...r, days } : r)) }));
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-1.5">
        <p className="mb-2 text-[11px] text-muted">근로기준법에 따른 근속{unitSuffix} 규칙이 기본 세팅되어 있습니다. 값을 바꾸면 자동 저장됩니다(휴가템플릿 저장 버튼을 눌러야 최종 반영됩니다).</p>
        {(list || []).map((r, i) => (
          <div key={r.key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-sm text-ink">근속 {i + 1}{unitSuffix}</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.5"
                className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm"
                value={r.days}
                onChange={(e) => setDays(i, Number(e.target.value))}
              />
              <span className="text-xs text-muted">일</span>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── 휴가유형 ────────────────────────────────────────────────
const EMPTY_TYPE_FORM = { businessEntityId: "", name: "", days: 1, paid: "유급" };

function TypesTab() {
  const { profile } = useAuth();
  const [entities, setEntities] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY_TYPE_FORM);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (s) => setEntities(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "leaveTypes"), where("companyId", "==", profile.companyId)), (s) =>
        setItems(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";

  const removeOne = async (id) => deleteDoc(doc(db, "leaveTypes", id));

  const add = async () => {
    if (!form.businessEntityId || !form.name.trim()) return;
    await addDoc(collection(db, "leaveTypes"), {
      companyId: profile.companyId,
      businessEntityId: form.businessEntityId,
      name: form.name,
      days: Number(form.days),
      paid: form.paid,
      order: items.length,
      createdAt: serverTimestamp(),
    });
    setForm(EMPTY_TYPE_FORM);
    setOpen(false);
  };

  const move = async (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const a = items[idx];
    const b = items[target];
    await updateDoc(doc(db, "leaveTypes", a.id), { order: b.order ?? target });
    await updateDoc(doc(db, "leaveTypes", b.id), { order: a.order ?? idx });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">휴가유형 {items.length}개 · 1(연차)/0.5(반차)/0.25(반반차)</p>
        <Button size="sm" onClick={() => { setForm(EMPTY_TYPE_FORM); setOpen(true); }}>
          <Plus size={13} /> 등록
        </Button>
      </div>

      <div className="space-y-2">
        {items.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">등록된 휴가유형이 없습니다.</div>}
        {items.map((t, i) => (
          <div key={t.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{t.name} <span className="font-normal text-muted">· {t.days}일 · {t.paid}</span></p>
              <p className="mt-0.5 truncate text-xs text-muted">{entityName(t.businessEntityId)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button type="button" onClick={() => move(i, -1)} className="rounded-lg p-1.5 text-muted active:bg-slate-50" aria-label="위로">
                <ArrowUp size={14} />
              </button>
              <button type="button" onClick={() => move(i, 1)} className="rounded-lg p-1.5 text-muted active:bg-slate-50" aria-label="아래로">
                <ArrowDown size={14} />
              </button>
              <button type="button" onClick={() => removeOne(t.id)} className="rounded-lg p-1.5 text-muted active:bg-slate-50" aria-label="삭제">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="휴가유형 신규 등록" footer={<Button className="w-full" onClick={add}>저장</Button>}>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.businessEntityId} onChange={(e) => setForm((f) => ({ ...f, businessEntityId: e.target.value }))}>
              <option value="">선택</option>
              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">휴가유형 *</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="예: 연차" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">휴가일수 *</span>
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}>
              <option value={1}>1 (연차)</option>
              <option value={0.5}>0.5 (반차)</option>
              <option value={0.25}>0.25 (반반차)</option>
              <option value={0}>0 (기타)</option>
            </select>
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">유급여부</span>
            <div className="flex items-center gap-3 text-sm">
              {["유급", "무급"].map((v) => (
                <label key={v} className="flex items-center gap-1.5">
                  <input type="radio" checked={form.paid === v} onChange={() => setForm((f) => ({ ...f, paid: v }))} />
                  {v}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── 센터별설정 ──────────────────────────────────────────────
function SitesTab() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const [entities, setEntities] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [settings, setSettings] = useState([]);

  const [businessEntityId, setBusinessEntityId] = useState("");
  const [siteSearch, setSiteSearch] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({ templateId: "", effectiveFrom: toDateKey(), criteriaType: "회계연도 기준" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (s) => setEntities(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "leaveTemplates"), where("companyId", "==", profile.companyId)), (s) => setTemplates(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "siteLeaveSettings"), where("companyId", "==", profile.companyId)), (s) => setSettings(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";
  const siteName = (id) => workSites.find((s) => s.id === id)?.name || "-";
  const templateName = (id) => templates.find((t) => t.id === id)?.name || "-";

  const rows = useMemo(() => {
    return workSites
      .filter((s) => !businessEntityId || s.businessEntityId === businessEntityId)
      .filter((s) => !siteSearch || s.name?.includes(siteSearch))
      .map((s) => ({ site: s, settings: settings.filter((x) => x.siteId === s.id) }));
  }, [workSites, settings, businessEntityId, siteSearch]);

  const siteSettings = settings.filter((s) => s.siteId === selectedSiteId);

  const openSite = (siteId) => {
    setSelectedSiteId(siteId);
    setForm({ templateId: "", effectiveFrom: toDateKey(), criteriaType: "회계연도 기준" });
    setOpen(true);
  };

  const add = async () => {
    if (!selectedSiteId || !form.templateId || !form.effectiveFrom) return;
    const site = workSites.find((s) => s.id === selectedSiteId);
    await addDoc(collection(db, "siteLeaveSettings"), {
      companyId: profile.companyId,
      businessEntityId: site?.businessEntityId || "",
      siteId: selectedSiteId,
      templateId: form.templateId,
      criteriaType: form.criteriaType,
      effectiveFrom: form.effectiveFrom,
      effectiveTo: "9999-12-31",
      createdAt: serverTimestamp(),
    });
    setForm({ templateId: "", effectiveFrom: toDateKey(), criteriaType: "회계연도 기준" });
  };

  const remove = async (id) => {
    if (!(await confirm("이 설정을 삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "siteLeaveSettings", id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select value={businessEntityId} onChange={(e) => setBusinessEntityId(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">전체 사업자</option>
          {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <div className="relative flex-1">
          <input value={siteSearch} onChange={(e) => setSiteSearch(e.target.value)} placeholder="센터 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
        </div>
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">등록된 센터가 없습니다.</div>}
        {rows.map(({ site, settings: list }) => (
          <button key={site.id} type="button" onClick={() => openSite(site.id)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{site.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {entityName(site.businessEntityId)}
                {list.length > 0 && ` · ${templateName(list[0].templateId)}`}
              </p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-slate-300" />
          </button>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`센터별설정 · ${siteName(selectedSiteId)}`} footer={<Button className="w-full" onClick={add}><Plus size={13} /> 저장</Button>}>
        <div className="space-y-3">
          <div className="space-y-1.5">
            {siteSettings.length === 0 && <p className="py-2 text-center text-xs text-muted">등록된 설정이 없습니다.</p>}
            {siteSettings.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{templateName(s.templateId)} · {s.criteriaType}</p>
                  <p className="mt-0.5 text-muted">{formatDate(s.effectiveFrom)} ~ {s.effectiveTo}</p>
                </div>
                <button type="button" onClick={() => remove(s.id)} className="shrink-0 p-1 text-muted active:text-danger">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="space-y-3 border-t border-slate-100 pt-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">휴가 템플릿 *</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.templateId} onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}>
                <option value="">선택</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">적용시점 *</span>
              <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} />
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">조회기준설정 *</span>
              <div className="flex items-center gap-3 text-sm">
                {["입사일 기준", "회계연도 기준"].map((v) => (
                  <label key={v} className="flex items-center gap-1.5">
                    <input type="radio" checked={form.criteriaType === v} onChange={() => setForm((f) => ({ ...f, criteriaType: v }))} />
                    {v}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
