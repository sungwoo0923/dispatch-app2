import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { CalendarCog, Plus, RefreshCw, FileSpreadsheet, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import SidePanel from "../components/SidePanel";
import { downloadCsv } from "../utils/exportCsv";
import { formatDate, toDateKey } from "../utils/dateUtils";

// 휴가템플릿(발생규칙) / 휴가유형(연차·반차 등 라벨) / 센터별설정(어느 템플릿을
// 언제부터 적용할지) 세 화면은 전부 "휴가를 쓰기 전에 관리자가 미리 준비해두는
// 설정"이라는 같은 성격이라, 별도 메뉴 3개 대신 탭 하나로 묶었다.
const TOP_TABS = [
  { key: "templates", label: "휴가템플릿" },
  { key: "types", label: "휴가유형" },
  { key: "sites", label: "센터별설정" },
];

export default function LeaveSettings() {
  const [tab, setTab] = useState("templates");
  return (
    <div className="space-y-6">
      <Panel icon={CalendarCog} title="휴가설정">
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
        {tab === "templates" && <TemplatesTab />}
        {tab === "types" && <TypesTab />}
        {tab === "sites" && <SitesTab />}
      </Panel>
    </div>
  );
}

// ── 휴가템플릿 ──────────────────────────────────────────────
const TEMPLATE_TABS = [
  { key: "info", label: "기본정보" },
  { key: "monthly", label: "근속월규칙" },
  { key: "yearly", label: "근속연도규칙" },
];
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
  const [tab, setTab] = useState("info");
  const [form, setForm] = useState(EMPTY_TEMPLATE_FORM);
  const [panelOpen, setPanelOpen] = useState(false);

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
    setTab("info");
    setPanelOpen(true);
  };
  const select = (t) => {
    setSelectedId(t.id);
    setForm({
      ...EMPTY_TEMPLATE_FORM,
      ...t,
      monthlyRules: t.monthlyRules?.length ? t.monthlyRules : standardMonthlyRules(),
      yearlyRules: t.yearlyRules?.length ? t.yearlyRules : standardYearlyRules(),
    });
    setTab("info");
    setPanelOpen(true);
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
        toast.success("저장되었습니다. 근속월규칙/근속연도규칙 탭에서 세부 조정을 할 수 있습니다.");
      }
    } catch (err) {
      console.error(err);
      toast.error(`저장에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    }
  };
  const remove = async () => {
    if (!selectedId) return;
    if (!(await confirm("이 휴가템플릿을 삭제하시겠습니까?", "delete"))) return;
    try {
      await deleteDoc(doc(db, "leaveTemplates", selectedId));
      toast.success("삭제되었습니다");
      setPanelOpen(false);
    } catch (err) {
      toast.error(`삭제에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    }
  };

  const exportCsv = () => downloadCsv("휴가템플릿", ["사업자", "템플릿명", "숨김여부"], rows.map((t) => [entityName(t.businessEntityId), t.name, t.visibility]));

  const addRule = (field, key) => {
    setForm((f) => {
      const next = [...(f[field] || [])];
      const usedKeys = new Set(next.map((r) => r.key));
      let k = key;
      let n = 1;
      while (usedKeys.has(k)) k = `${key}_${n++}`;
      next.push({ key: k, days: 1 });
      return { ...f, [field]: next };
    });
  };

  return (
    <div>
      <p className="mb-4 text-xs text-muted">
        사업자 및 센터별로 휴가 템플릿을 만들어 근속월/근속연도에 따른 휴가발생일수를 설정합니다. 스케줄 등록과 연계되어 근로자들의 연차 현황을 쉽게 확인할 수 있습니다.
      </p>
      <Card className="mb-4 space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-muted">검색어</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="템플릿명 검색" />
          </label>
          <div className="flex items-end gap-2">
            <button type="button" className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50" onClick={() => setSearch("")}>
              <RefreshCw size={16} />
            </button>
            <Button>검색</Button>
          </div>
        </div>
      </Card>

      <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
        <p className="text-xs font-medium text-muted">목록 {rows.length}</p>
        <div className="flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain">
          <Button size="sm" onClick={startNew}>
            <Plus size={13} /> 신규
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <FileSpreadsheet size={13} /> 엑셀
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
        <table className="w-full min-w-[520px] text-center text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-3 py-2.5 font-semibold">순번</th>
              <th className="px-3 py-2.5 font-semibold">사업자</th>
              <th className="px-3 py-2.5 font-semibold">템플릿명</th>
              <th className="px-3 py-2.5 font-semibold">숨김여부</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.id} onClick={() => select(t)} className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="px-3 py-2.5 text-ink">{i + 1}</td>
                <td className="px-3 py-2.5 text-ink">{entityName(t.businessEntityId)}</td>
                <td className="px-3 py-2.5 text-ink">{t.name}</td>
                <td className="px-3 py-2.5 text-ink">{t.visibility}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-xs text-muted">
                  등록된 휴가템플릿이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={`휴가템플릿 > ${selectedId ? "상세" : "신규"}`}
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
        <div className="flex flex-col lg:flex-row lg:gap-5">
          <div className="mb-4 lg:mb-0 lg:w-40 lg:shrink-0">
            <div className="mb-3 rounded-xl bg-primary-light/40 px-3 py-2 text-center text-sm font-semibold text-primary">{form.name || "신규 템플릿"}</div>
            <div className="flex flex-row gap-1 overflow-x-auto overscroll-x-contain lg:flex-col">
              {(selectedId ? TEMPLATE_TABS : TEMPLATE_TABS.slice(0, 1)).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`shrink-0 rounded-lg px-3 py-2 text-center text-sm font-medium ${tab === t.key ? "bg-primary-light text-primary" : "text-muted hover:bg-slate-50"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {!selectedId && <p className="mt-2 text-[11px] text-muted">먼저 저장하면 근속월규칙/근속연도규칙을 설정할 수 있습니다.</p>}
          </div>
          <div className="flex-1">
            {tab === "info" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
                    <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.businessEntityId} onChange={(e) => setForm((f) => ({ ...f, businessEntityId: e.target.value }))}>
                      <option value="">선택</option>
                      {entities.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">템플릿명 *</span>
                    <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  </label>
                </div>
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted">집계시작일 *</span>
                  <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain">
                    <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.cycleStartMonth} onChange={(e) => setForm((f) => ({ ...f, cycleStartMonth: e.target.value }))}>
                      {MONTHS.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                    <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.cycleStartDay} onChange={(e) => setForm((f) => ({ ...f, cycleStartDay: e.target.value }))}>
                      {DAYS.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">메모</span>
                  <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} />
                </label>
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted">숨김여부</span>
                  <div className="flex flex-nowrap items-center gap-3 overflow-x-auto overscroll-x-contain text-sm">
                    {["숨김", "보임"].map((v) => (
                      <label key={v} className="flex items-center gap-1.5">
                        <input type="radio" checked={form.visibility === v} onChange={() => setForm((f) => ({ ...f, visibility: v }))} />
                        {v}
                      </label>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-muted">저장 후 근속월규칙/근속연도규칙 탭에서 근속 기간별 휴가발생일수를 설정할 수 있습니다 (근로기준법 기준값이 자동으로 채워집니다).</p>
              </div>
            )}
            {tab === "monthly" && selectedId && (
              <RuleTab title="근속월규칙" unitSuffix="개월" list={form.monthlyRules} setForm={setForm} field="monthlyRules" addRule={() => addRule("monthlyRules", "month")} />
            )}
            {tab === "yearly" && selectedId && (
              <RuleTab title="근속연도규칙" unitSuffix="년" list={form.yearlyRules} setForm={setForm} field="yearlyRules" addRule={() => addRule("yearlyRules", "year")} />
            )}
          </div>
        </div>
      </SidePanel>
    </div>
  );
}

function RuleTab({ title, unitSuffix, list, setForm, field, addRule }) {
  const [checked, setChecked] = useState(() => new Set());

  const toggle = (idx) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  const removeChecked = () => {
    setForm((f) => ({ ...f, [field]: f[field].filter((_, i) => !checked.has(i)) }));
    setChecked(new Set());
  };

  const setDays = (idx, days) => setForm((f) => ({ ...f, [field]: f[field].map((r, i) => (i === idx ? { ...r, days } : r)) }));

  return (
    <div className="space-y-3">
      <div className="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <div className="flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain">
          <Button size="sm" variant="outline" onClick={removeChecked} disabled={checked.size === 0}>
            삭제
          </Button>
          <Button size="sm" onClick={addRule}>
            추가
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
        <table className="w-full text-center text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="w-8 px-3 py-2"></th>
              <th className="px-3 py-2 font-semibold">근속{unitSuffix}</th>
              <th className="px-3 py-2 font-semibold">휴가발생일수</th>
            </tr>
          </thead>
          <tbody>
            {(list || []).map((r, i) => (
              <tr key={r.key} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} />
                </td>
                <td className="px-3 py-2 text-ink">
                  {i + 1}
                  {unitSuffix}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="number"
                      step="0.5"
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={r.days}
                      onChange={(e) => setDays(i, Number(e.target.value))}
                    />
                    <span className="text-xs text-muted">일</span>
                  </div>
                </td>
              </tr>
            ))}
            {(!list || list.length === 0) && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-xs text-muted">
                  등록된 규칙이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted">근로기준법에 따른 근속{unitSuffix} 규칙으로 기본 세팅되어 있습니다. 수정이 필요하면 항목을 삭제 후 다시 추가할 수 있습니다.</p>
    </div>
  );
}

// ── 휴가유형 ────────────────────────────────────────────────
const EMPTY_TYPE_FORM = { businessEntityId: "", name: "", days: 1, paid: "유급" };

function TypesTab() {
  const { profile } = useAuth();
  const [entities, setEntities] = useState([]);
  const [items, setItems] = useState([]);
  const [checked, setChecked] = useState(() => new Set());
  const [form, setForm] = useState(EMPTY_TYPE_FORM);

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

  const toggle = (id) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const removeChecked = async () => {
    for (const id of checked) await deleteDoc(doc(db, "leaveTypes", id));
    setChecked(new Set());
  };

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
    setForm((f) => ({ ...f, name: "", days: 1 }));
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
    <div>
      <p className="mb-4 text-xs text-muted">휴가 유형별로 휴가 일수에 대해 1(연차), 0.5(반차), 0.25(반반차) 설정 및 유급, 무급을 설정할 수 있습니다.</p>

      <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
        <p className="text-xs font-medium text-muted">휴가유형 목록 {items.length}</p>
        <Button size="sm" variant="outline" onClick={removeChecked} disabled={checked.size === 0}>
          <Trash2 size={13} /> 삭제
        </Button>
      </div>
      <div className="mb-4 overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
        <table className="w-full min-w-[560px] text-center text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="w-8 px-3 py-2.5"></th>
              <th className="px-3 py-2.5 font-semibold">순번</th>
              <th className="px-3 py-2.5 font-semibold">사업자</th>
              <th className="px-3 py-2.5 font-semibold">휴가유형</th>
              <th className="px-3 py-2.5 font-semibold">휴가일수</th>
              <th className="px-3 py-2.5 font-semibold">유급여부</th>
              <th className="px-3 py-2.5 font-semibold">위로</th>
              <th className="px-3 py-2.5 font-semibold">아래로</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t, i) => (
              <tr key={t.id} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-2.5">
                  <input type="checkbox" checked={checked.has(t.id)} onChange={() => toggle(t.id)} />
                </td>
                <td className="px-3 py-2.5 text-ink">{i + 1}</td>
                <td className="px-3 py-2.5 text-ink">{entityName(t.businessEntityId)}</td>
                <td className="px-3 py-2.5 text-ink">{t.name}</td>
                <td className="px-3 py-2.5 text-ink">{t.days}</td>
                <td className="px-3 py-2.5 text-ink">{t.paid}</td>
                <td className="px-3 py-2.5">
                  <button className="text-muted hover:text-primary" onClick={() => move(i, -1)}>
                    <ArrowUp size={13} />
                  </button>
                </td>
                <td className="px-3 py-2.5">
                  <button className="text-muted hover:text-primary" onClick={() => move(i, 1)}>
                    <ArrowDown size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-xs text-muted">
                  등록된 휴가유형이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold text-ink">휴가유형 신규 등록</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.businessEntityId} onChange={(e) => setForm((f) => ({ ...f, businessEntityId: e.target.value }))}>
              <option value="">선택</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
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
            <div className="flex flex-nowrap items-center gap-3 overflow-x-auto overscroll-x-contain text-sm">
              {["유급", "무급"].map((v) => (
                <label key={v} className="flex items-center gap-1.5">
                  <input type="radio" checked={form.paid === v} onChange={() => setForm((f) => ({ ...f, paid: v }))} />
                  {v}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-100 pt-3">
          <Button onClick={add}>저장</Button>
        </div>
      </Card>
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
  const [panelOpen, setPanelOpen] = useState(false);

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
      .map((s) => [s.id, settings.filter((x) => x.siteId === s.id)]);
  }, [workSites, settings, businessEntityId, siteSearch]);

  const siteSettings = settings.filter((s) => s.siteId === selectedSiteId);

  const openSite = (siteId) => {
    setSelectedSiteId(siteId);
    setForm({ templateId: "", effectiveFrom: toDateKey(), criteriaType: "회계연도 기준" });
    setPanelOpen(true);
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
    <div>
      <p className="mb-4 text-xs text-muted">센터별로 휴가 적용 템플릿 및 조회기준을 설정합니다. 센터를 클릭하면 상세에서 템플릿과 조회기준 날짜를 설정할 수 있습니다.</p>
      <Card className="mb-4 space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={businessEntityId} onChange={(e) => setBusinessEntityId(e.target.value)}>
              <option value="">전체</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={siteSearch} onChange={(e) => setSiteSearch(e.target.value)} placeholder="센터를 입력하세요" />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50"
              onClick={() => {
                setBusinessEntityId("");
                setSiteSearch("");
              }}
            >
              <RefreshCw size={16} />
            </button>
            <Button>검색</Button>
          </div>
        </div>
      </Card>

      <p className="mb-2 text-xs font-medium text-muted">목록 {rows.length}</p>
      <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
        <table className="w-full min-w-[640px] text-center text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-3 py-2.5 font-semibold">순번</th>
              <th className="px-3 py-2.5 font-semibold">사업자</th>
              <th className="px-3 py-2.5 font-semibold">센터</th>
              <th className="px-3 py-2.5 font-semibold">적용템플릿 / 조회기준</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([siteId, list], i) => (
              <tr key={siteId} onClick={() => openSite(siteId)} className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="px-3 py-2.5 text-ink">{i + 1}</td>
                <td className="px-3 py-2.5 text-ink">{entityName(workSites.find((s) => s.id === siteId)?.businessEntityId)}</td>
                <td className="px-3 py-2.5 text-ink">{siteName(siteId)}</td>
                <td className="px-3 py-2.5 text-ink">
                  {list.length ? list.map((s) => `[${s.effectiveFrom}] ${templateName(s.templateId)} / ${s.criteriaType}`).join(", ") : "-"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-xs text-muted">
                  등록된 센터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SidePanel open={panelOpen} onClose={() => setPanelOpen(false)} title={`센터별설정 > ${siteName(selectedSiteId)}`} footer={<Button onClick={add}><Plus size={13} /> 저장</Button>}>
        <div className="space-y-4">
          <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
            <table className="w-full text-center text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-muted">
                  <th className="px-3 py-2 font-semibold">순번</th>
                  <th className="px-3 py-2 font-semibold">템플릿</th>
                  <th className="px-3 py-2 font-semibold">조회기준설정</th>
                  <th className="px-3 py-2 font-semibold">적용시점</th>
                  <th className="px-3 py-2 font-semibold">적용종료시점</th>
                  <th className="px-3 py-2 font-semibold">삭제</th>
                </tr>
              </thead>
              <tbody>
                {siteSettings.map((s, i) => (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-2 text-ink">{i + 1}</td>
                    <td className="px-3 py-2 text-ink">{templateName(s.templateId)}</td>
                    <td className="px-3 py-2 text-ink">{s.criteriaType}</td>
                    <td className="px-3 py-2 text-ink">{formatDate(s.effectiveFrom)}</td>
                    <td className="px-3 py-2 text-ink">{s.effectiveTo}</td>
                    <td className="px-3 py-2">
                      <button className="text-muted hover:text-danger" onClick={() => remove(s.id)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {siteSettings.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-xs text-muted">
                      조회 내역이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">휴가 템플릿 *</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.templateId} onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}>
                <option value="">선택</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">적용시점 *</span>
              <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} />
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">조회기준설정 *</span>
              <div className="flex flex-nowrap items-center gap-3 overflow-x-auto overscroll-x-contain text-sm">
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
      </SidePanel>
    </div>
  );
}
