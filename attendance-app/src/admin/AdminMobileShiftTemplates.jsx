import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Search, Plus, Trash2, Copy as CopyIcon, X } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { formatDate } from "../utils/dateUtils";

const WEEKDAYS = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];
const TABS = [
  { key: "info", label: "기본정보" },
  { key: "break", label: "휴게시간" },
  { key: "overtime", label: "연장시간" },
  { key: "late", label: "지각설정" },
];
const REQUIRED_FIELDS = [
  { key: "businessEntityId", label: "사업자" },
  { key: "name", label: "템플릿명" },
  { key: "baseStartTime", label: "기본근무시작시간" },
  { key: "baseEndTime", label: "기본근무종료시간" },
];

const EMPTY_FORM = {
  businessEntityId: "",
  name: "",
  memo: "",
  workTimeType: "실근무",
  visibility: "보임",
  breakMode: "직접 지정",
  overtimeBaseMode: "근무종료시간 이후부터",
  overtimeBaseHours: "",
  baseStartTime: "07:00",
  baseEndTime: "11:00",
  weekdays: Object.fromEntries(WEEKDAYS.map((w, i) => [w, { holiday: i >= 5, work: i < 5, start: "07:00", end: "11:00" }])),
};

function fmtCreatedAt(ts) {
  if (!ts?.seconds) return "-";
  const d = new Date(ts.seconds * 1000);
  return formatDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
}

function summarizeSchedule(weekdays) {
  const workDays = WEEKDAYS.filter((w) => weekdays?.[w]?.work);
  if (workDays.length === 0) return "휴무";
  const groups = new Map();
  workDays.forEach((w) => {
    const key = `${weekdays[w].start || "-"}~${weekdays[w].end || "-"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w[0]);
  });
  return [...groups.entries()].map(([time, days]) => `${days.join("")} ${time}`).join(", ");
}

// 시간템플릿의 모바일 전용 화면 — 카드 목록 + 4탭(기본정보/휴게시간/
// 연장시간/지각설정) 모달. 요일별 근무시간표는 가로 스크롤 미니표로
// 압축했다.
export default function AdminMobileShiftTemplates() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [entities, setEntities] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("info");
  const [form, setForm] = useState(EMPTY_FORM);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyForm, setCopyForm] = useState({ businessEntityId: "", name: "" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (s) => setEntities(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "shiftTemplates"), where("companyId", "==", profile.companyId)), (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";
  const rows = useMemo(() => items.filter((t) => !search.trim() || t.name?.includes(search.trim())).sort((a, b) => (a.name || "").localeCompare(b.name || "")), [items, search]);
  const selected = items.find((t) => t.id === selectedId) || null;

  const openNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setTab("info");
    setFormOpen(true);
  };
  const openEdit = (t) => {
    setSelectedId(t.id);
    setForm({ ...EMPTY_FORM, ...t, weekdays: t.weekdays || EMPTY_FORM.weekdays });
    setTab("info");
    setFormOpen(true);
  };

  const applyBaseTime = () =>
    setForm((f) => ({ ...f, weekdays: Object.fromEntries(Object.entries(f.weekdays).map(([k, v]) => [k, { ...v, start: f.baseStartTime, end: f.baseEndTime }])) }));

  const save = async () => {
    const missing = REQUIRED_FIELDS.filter((f) => !String(form[f.key] || "").trim()).map((f) => f.label);
    if (missing.length) return toast.error(`다음 필수 항목을 입력/선택해주세요: ${missing.join(", ")}`);
    const { startTime, endTime, ...rest } = form;
    const payload = { ...rest, startTime: form.baseStartTime, endTime: form.baseEndTime };
    if (selectedId) {
      await updateDoc(doc(db, "shiftTemplates", selectedId), payload);
    } else {
      await addDoc(collection(db, "shiftTemplates"), { companyId: profile.companyId, ...payload, createdAt: serverTimestamp() });
    }
    toast.success("저장되었습니다");
    setFormOpen(false);
  };

  const remove = async () => {
    if (!selectedId) return;
    if (!(await confirm(`'${selected?.name}' 템플릿을 삭제하시겠습니까?`, "delete"))) return;
    await deleteDoc(doc(db, "shiftTemplates", selectedId));
    toast.success("삭제되었습니다");
    setFormOpen(false);
  };

  const openCopy = () => {
    setCopyForm({ businessEntityId: form.businessEntityId, name: `${form.name}(복사)` });
    setCopyOpen(true);
  };
  const doCopy = async () => {
    if (!selected || !copyForm.name.trim()) return;
    const { id, createdAt, ...rest } = selected;
    await addDoc(collection(db, "shiftTemplates"), { ...rest, companyId: profile.companyId, businessEntityId: copyForm.businessEntityId || selected.businessEntityId, name: copyForm.name, createdAt: serverTimestamp() });
    toast.success("복사되었습니다");
    setCopyOpen(false);
    setFormOpen(false);
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">시간템플릿</p>
        <Button size="sm" onClick={openNew}>
          <Plus size={13} /> 등록
        </Button>
      </div>

      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="템플릿명 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">등록된 시간템플릿이 없습니다.</div>}
        {rows.map((t) => (
          <button key={t.id} type="button" onClick={() => openEdit(t)} className="flex w-full flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-ink">{t.name}</span>
              <span className="shrink-0 text-[11px] text-muted">{fmtCreatedAt(t.createdAt)}</span>
            </div>
            <p className="truncate text-xs text-muted">{entityName(t.businessEntityId)} · {t.workTimeType || "-"}</p>
            <div className="flex items-center gap-1">
              {WEEKDAYS.map((w) => {
                const isWork = !!t.weekdays?.[w]?.work;
                return (
                  <span key={w} className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${isWork ? "bg-primary text-white" : "bg-slate-100 text-muted"}`}>
                    {w[0]}
                  </span>
                );
              })}
            </div>
            <p className="truncate text-[11px] text-muted">{summarizeSchedule(t.weekdays)}</p>
          </button>
        ))}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={selected ? selected.name : "시간템플릿 등록"}>
        <div className="space-y-4">
          <div className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain">
            {TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${tab === t.key ? "bg-primary text-white" : "bg-white text-muted border border-slate-200"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "info" && (
            <div className="space-y-3">
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.businessEntityId} onChange={(e) => setForm((f) => ({ ...f, businessEntityId: e.target.value }))}>
                <option value="">사업자 선택 *</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">템플릿명 *</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">메모</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} />
              </label>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted">근무시간유형</span>
                <div className="flex gap-2">
                  {["공수", "실근무", "일급수"].map((v) => (
                    <button key={v} type="button" onClick={() => setForm((f) => ({ ...f, workTimeType: v }))} className={`flex-1 rounded-xl border px-2 py-2 text-xs font-semibold ${form.workTimeType === v ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted">숨김여부</span>
                <div className="flex gap-2">
                  {["숨김", "보임"].map((v) => (
                    <button key={v} type="button" onClick={() => setForm((f) => ({ ...f, visibility: v }))} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${form.visibility === v ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted">휴게시간구분</span>
                <div className="flex gap-2">
                  {["직접 지정", "근무시간 내 포함"].map((v) => (
                    <button key={v} type="button" onClick={() => setForm((f) => ({ ...f, breakMode: v }))} className={`flex-1 rounded-xl border px-2 py-2 text-xs font-semibold ${form.breakMode === v ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                <span className="mb-1.5 block text-xs font-medium text-muted">연장시간설정</span>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={form.overtimeBaseMode === "근무종료시간 이후부터"} onChange={() => setForm((f) => ({ ...f, overtimeBaseMode: "근무종료시간 이후부터" }))} />
                  근무종료시간 이후부터
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={form.overtimeBaseMode === "근무시작시간 기준"} onChange={() => setForm((f) => ({ ...f, overtimeBaseMode: "근무시작시간 기준" }))} />
                  근무시작시간 기준
                  <input type="number" className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm" value={form.overtimeBaseHours} onChange={(e) => setForm((f) => ({ ...f, overtimeBaseHours: e.target.value }))} disabled={form.overtimeBaseMode !== "근무시작시간 기준"} />
                  시간 초과부터
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">기본근무시작시간 *</span>
                  <input type="time" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.baseStartTime} onChange={(e) => setForm((f) => ({ ...f, baseStartTime: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">기본근무종료시간 *</span>
                  <input type="time" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.baseEndTime} onChange={(e) => setForm((f) => ({ ...f, baseEndTime: e.target.value }))} />
                </label>
              </div>
              <Button size="sm" variant="outline" className="w-full" onClick={applyBaseTime}>
                기본시간 전체 요일 적용
              </Button>

              <div className="-mx-4 overflow-x-auto overscroll-x-contain">
                <table className="w-full min-w-[420px] text-center text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-muted">
                      <th className="px-2 py-2 font-semibold">휴일</th>
                      <th className="px-2 py-2 font-semibold">근무</th>
                      <th className="px-2 py-2 font-semibold">시작</th>
                      <th className="px-2 py-2 font-semibold">종료</th>
                    </tr>
                  </thead>
                  <tbody>
                    {WEEKDAYS.map((w) => {
                      const v = form.weekdays[w] || {};
                      return (
                        <tr key={w} className={v.work ? "border-b border-slate-50 bg-primary-light/20 last:border-0" : "border-b border-slate-50 last:border-0"}>
                          <td className="px-2 py-1.5">
                            <label className="flex items-center gap-1">
                              <input type="checkbox" checked={!!v.holiday} onChange={(e) => setForm((f) => ({ ...f, weekdays: { ...f.weekdays, [w]: { ...v, holiday: e.target.checked } } }))} />
                              {w[0]}
                            </label>
                          </td>
                          <td className="px-2 py-1.5">
                            <label className="flex items-center gap-1">
                              <input type="checkbox" checked={!!v.work} onChange={(e) => setForm((f) => ({ ...f, weekdays: { ...f.weekdays, [w]: { ...v, work: e.target.checked } } }))} />
                              {w[0]}
                            </label>
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="time" className="w-24 rounded-lg border border-slate-200 px-1 py-1 text-xs" value={v.start || "07:00"} onChange={(e) => setForm((f) => ({ ...f, weekdays: { ...f.weekdays, [w]: { ...v, start: e.target.value } } }))} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="time" className="w-24 rounded-lg border border-slate-200 px-1 py-1 text-xs" value={v.end || "11:00"} onChange={(e) => setForm((f) => ({ ...f, weekdays: { ...f.weekdays, [w]: { ...v, end: e.target.value } } }))} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {tab === "break" && <RangeListTab form={form} setForm={setForm} field="breaks" title="휴게시간" />}
          {tab === "overtime" && <ThresholdListTab form={form} setForm={setForm} field="overtimeRules" title="연장시간" fromLabel="분 부터" toLabel="분 연장" />}
          {tab === "late" && <ThresholdListTab form={form} setForm={setForm} field="lateRules" title="지각설정" fromLabel="분 지각시" toLabel="분 소급" />}

          <div className="flex gap-2">
            {selectedId && (
              <>
                <Button variant="outline" onClick={remove}>
                  <Trash2 size={13} />
                </Button>
                <Button variant="outline" onClick={openCopy}>
                  <CopyIcon size={13} />
                </Button>
              </>
            )}
            <Button className="flex-1" onClick={save}>
              저장
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={copyOpen} onClose={() => setCopyOpen(false)} title="시간 템플릿 복사">
        <div className="space-y-3">
          <select className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={copyForm.businessEntityId} onChange={(e) => setCopyForm((f) => ({ ...f, businessEntityId: e.target.value }))}>
            <option value="">사업자 선택</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <input className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={copyForm.name} onChange={(e) => setCopyForm((f) => ({ ...f, name: e.target.value }))} />
          <Button className="w-full" onClick={doCopy}>
            복사
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function RangeListTab({ form, setForm, field, title }) {
  const list = form[field] || [];
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const add = () => {
    if (!from || !to) return;
    setForm((f) => ({ ...f, [field]: [...(f[field] || []), { from, to }] }));
    setFrom("");
    setTo("");
  };
  const remove = (idx) => setForm((f) => ({ ...f, [field]: f[field].filter((_, i) => i !== idx) }));
  return (
    <div className="space-y-2">
      <div className="flex flex-nowrap items-center gap-1.5">
        <input type="time" className="flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-xs text-muted">~</span>
        <input type="time" className="flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button size="sm" onClick={add}>추가</Button>
      </div>
      <div className="space-y-1.5">
        {list.length === 0 && <p className="py-3 text-center text-xs text-muted">등록된 {title}이 없습니다.</p>}
        {list.map((r, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
            <span className="text-ink">{r.from} ~ {r.to}</span>
            <button onClick={() => remove(i)} className="text-muted hover:text-danger"><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThresholdListTab({ form, setForm, field, title, fromLabel, toLabel }) {
  const list = form[field] || [];
  const [from, setFrom] = useState(5);
  const [to, setTo] = useState(5);
  const options = Array.from({ length: 12 }, (_, i) => (i + 1) * 5);
  const add = () => setForm((f) => ({ ...f, [field]: [...(f[field] || []), { from, to }] }));
  const remove = (idx) => setForm((f) => ({ ...f, [field]: f[field].filter((_, i) => i !== idx) }));
  return (
    <div className="space-y-2">
      <div className="flex flex-nowrap items-center gap-1.5">
        <select className="rounded-lg border border-slate-200 px-2 py-2 text-sm" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <span className="shrink-0 text-[11px] text-muted">{fromLabel}</span>
        <select className="rounded-lg border border-slate-200 px-2 py-2 text-sm" value={to} onChange={(e) => setTo(Number(e.target.value))}>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <span className="shrink-0 text-[11px] text-muted">{toLabel}</span>
        <Button size="sm" onClick={add}>추가</Button>
      </div>
      <div className="space-y-1.5">
        {list.length === 0 && <p className="py-3 text-center text-xs text-muted">등록된 {title}이 없습니다.</p>}
        {list.map((r, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
            <span className="text-ink">{r.from}{fromLabel} {r.to}{toLabel}</span>
            <button onClick={() => remove(i)} className="text-muted hover:text-danger"><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
