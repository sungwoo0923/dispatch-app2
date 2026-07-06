import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { CalendarRange, Plus, RefreshCw, FileSpreadsheet } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import { downloadCsv } from "../utils/exportCsv";

const TABS = [
  { key: "info", label: "기본정보" },
  { key: "monthly", label: "근속월규칙" },
  { key: "yearly", label: "근속연도규칙" },
];

const EMPTY_FORM = { businessEntityId: "", name: "", cycleStartMonth: "1월", cycleStartDay: "1일", memo: "", visibility: "보임", monthlyRules: [], yearlyRules: [] };
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);
const DAYS = Array.from({ length: 31 }, (_, i) => `${i + 1}일`);

export default function LeaveTemplates() {
  const { profile } = useAuth();
  const [entities, setEntities] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("info");
  const [form, setForm] = useState(EMPTY_FORM);

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
    setForm(EMPTY_FORM);
    setTab("info");
  };
  const select = (t) => {
    setSelectedId(t.id);
    setForm({ ...EMPTY_FORM, ...t, monthlyRules: t.monthlyRules || [], yearlyRules: t.yearlyRules || [] });
    setTab("info");
  };

  const save = async () => {
    if (!form.name.trim()) return;
    if (selectedId) {
      await updateDoc(doc(db, "leaveTemplates", selectedId), form);
    } else {
      const ref_ = await addDoc(collection(db, "leaveTemplates"), { companyId: profile.companyId, ...form, createdAt: serverTimestamp() });
      setSelectedId(ref_.id);
    }
  };
  const remove = async () => {
    if (!selectedId) return;
    await deleteDoc(doc(db, "leaveTemplates", selectedId));
    startNew();
  };

  const exportCsv = () => downloadCsv("휴가템플릿", ["사업자", "템플릿명", "숨김여부"], rows.map((t) => [entityName(t.businessEntityId), t.name, t.visibility]));

  const addRule = (field, key) => {
    setForm((f) => {
      const next = [...(f[field] || [])];
      const usedKeys = new Set(next.map((r) => r.key));
      let k = key;
      let n = 1;
      while (usedKeys.has(k)) k = `${key}_${n++}`;
      next.push({ key: k, label: field === "monthlyRules" ? `${next.length + 1}` : `${next.length + 1}`, days: 1 });
      return { ...f, [field]: next };
    });
  };

  return (
    <div className="space-y-6">
      <Panel icon={CalendarRange} title="휴가템플릿">
        <p className="mb-4 text-xs text-muted">
          근로자들의 휴가 유형과 연차 확인 및 연차신청 확인을 할 수 있습니다. 사업자 및 센터별로 휴가 템플릿을 이용해 설정을 할 수 있습니다. 휴가 유형별로
          설정해 스케줄 등록에 연계하여 근로자들의 연차 현황을 쉽게 알 수 있습니다.
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
        <div className="mb-4 overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
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
                <tr key={t.id} onClick={() => select(t)} className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 ${selectedId === t.id ? "bg-primary-light/40" : ""}`}>
                  <td className="px-3 py-2.5 text-muted">{i + 1}</td>
                  <td className="px-3 py-2.5 text-muted">{entityName(t.businessEntityId)}</td>
                  <td className="px-3 py-2.5 text-ink">{t.name}</td>
                  <td className="px-3 py-2.5 text-muted">{t.visibility}</td>
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

        <Card className="p-0">
          <div className="flex flex-col lg:flex-row">
            <div className="border-b border-slate-100 p-4 lg:w-40 lg:border-b-0 lg:border-r">
              <div className="mb-3 rounded-xl bg-primary-light/40 px-3 py-2 text-center text-sm font-semibold text-primary">{form.name || "신규 템플릿"}</div>
              <div className="flex flex-row gap-1 overflow-x-auto overscroll-x-contain lg:flex-col">
                {TABS.map((t) => (
                  <button key={t.key} onClick={() => setTab(t.key)} className={`shrink-0 rounded-lg px-3 py-2 text-center text-sm font-medium ${tab === t.key ? "bg-primary-light text-primary" : "text-muted hover:bg-slate-50"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 p-4">
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
                      <Button size="sm" variant="outline" onClick={save}>
                        적용
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-nowrap items-center justify-end gap-2 overflow-x-auto overscroll-x-contain border-t border-slate-100 pt-3">
                    <Button variant="outline" onClick={remove} disabled={!selectedId}>
                      삭제
                    </Button>
                    <Button onClick={save}>저장</Button>
                  </div>
                  <p className="text-[11px] text-muted">사업자에 대한 휴가 템플릿을 만듭니다. 여러 센터에 적용시킬 수 있습니다. 휴가 템플릿명, 근속월규칙, 근속연도규칙을 설정할 수 있습니다. 회계시작일을 설정할수 있습니다.</p>
                </div>
              )}
              {tab === "monthly" && (
                <RuleTab title="근속월규칙" unitLabel="근속월수" list={form.monthlyRules} setForm={setForm} field="monthlyRules" addRule={() => addRule("monthlyRules", "month")} onSave={save} />
              )}
              {tab === "yearly" && (
                <RuleTab title="근속연도규칙" unitLabel="근속연수" list={form.yearlyRules} setForm={setForm} field="yearlyRules" addRule={() => addRule("yearlyRules", "year")} onSave={save} />
              )}
            </div>
          </div>
        </Card>
      </Panel>
    </div>
  );
}

function RuleTab({ title, unitLabel, list, setForm, field, addRule, onSave }) {
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
              <th className="px-3 py-2 font-semibold">{unitLabel}</th>
              <th className="px-3 py-2 font-semibold">휴가발생일수</th>
            </tr>
          </thead>
          <tbody>
            {(list || []).map((r, i) => (
              <tr key={r.key} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} />
                </td>
                <td className="px-3 py-2 text-ink">{i + 1}</td>
                <td className="px-3 py-2">
                  <input type="number" step="0.5" className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={r.days} onChange={(e) => setDays(i, Number(e.target.value))} />
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
      <p className="text-[11px] text-muted">근로기준법에 따른 근속 {unitLabel === "근속월수" ? "월" : "연도"} 규칙으로 세팅 되어있습니다. 수정해야될 경우 항목 삭제 후 추가할 수 있습니다.</p>
      <div className="flex justify-end">
        <Button size="sm" onClick={onSave}>
          저장
        </Button>
      </div>
    </div>
  );
}
