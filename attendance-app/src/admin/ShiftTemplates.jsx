import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Clock, Plus, RefreshCw, FileSpreadsheet, Copy as CopyIcon, X } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import Modal from "../components/Modal";
import { downloadCsv } from "../utils/exportCsv";

const WEEKDAYS = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];
const TABS = [
  { key: "info", label: "기본정보" },
  { key: "break", label: "휴게시간" },
  { key: "overtime", label: "연장시간" },
  { key: "late", label: "지각설정" },
];

const EMPTY_FORM = {
  businessEntityId: "",
  name: "",
  memo: "",
  workTimeType: "실근무",
  visibility: "보임",
  baseStartTime: "07:00",
  baseEndTime: "11:00",
  weekdays: Object.fromEntries(
    WEEKDAYS.map((w, i) => [w, { holiday: i >= 5, work: i < 5, start: "07:00", end: "11:00" }])
  ),
};

export default function ShiftTemplates() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [entities, setEntities] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("info");
  const [form, setForm] = useState(EMPTY_FORM);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyForm, setCopyForm] = useState({ businessEntityId: "", name: "" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubEntities = onSnapshot(
      query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)),
      (snap) => setEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubItems = onSnapshot(query(collection(db, "shiftTemplates"), where("companyId", "==", profile.companyId)), (snap) =>
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubEntities();
      unsubItems();
    };
  }, [profile?.companyId]);

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";

  const rows = useMemo(
    () => items.filter((t) => !search || t.name?.includes(search)).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [items, search]
  );

  const selected = items.find((t) => t.id === selectedId) || null;

  const startNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setTab("info");
  };

  const select = (t) => {
    setSelectedId(t.id);
    setForm({ ...EMPTY_FORM, ...t, weekdays: t.weekdays || EMPTY_FORM.weekdays });
    setTab("info");
  };

  const applyBaseTime = () =>
    setForm((f) => ({
      ...f,
      weekdays: Object.fromEntries(
        Object.entries(f.weekdays).map(([k, v]) => [k, { ...v, start: f.baseStartTime, end: f.baseEndTime }])
      ),
    }));

  const save = async () => {
    if (!form.name.trim()) return;
    if (!(await confirm("저장하시겠습니까?", "save"))) return;
    const { startTime, endTime, ...rest } = form;
    const payload = { ...rest, startTime: form.baseStartTime, endTime: form.baseEndTime };
    if (selectedId) {
      await updateDoc(doc(db, "shiftTemplates", selectedId), payload);
    } else {
      const ref_ = await addDoc(collection(db, "shiftTemplates"), { companyId: profile.companyId, ...payload, createdAt: serverTimestamp() });
      setSelectedId(ref_.id);
    }
    toast.success("저장되었습니다");
  };

  const remove = async () => {
    if (!selectedId) return;
    if (!(await confirm(`'${selected?.name}' 템플릿을 삭제하시겠습니까?`, "delete"))) return;
    await deleteDoc(doc(db, "shiftTemplates", selectedId));
    toast.success("삭제되었습니다");
    startNew();
  };

  const openCopy = () => {
    setCopyForm({ businessEntityId: form.businessEntityId, name: `${form.name}(복사)` });
    setCopyOpen(true);
  };

  const doCopy = async () => {
    if (!selected || !copyForm.name.trim()) return;
    const { id, createdAt, ...rest } = selected;
    await addDoc(collection(db, "shiftTemplates"), {
      ...rest,
      companyId: profile.companyId,
      businessEntityId: copyForm.businessEntityId || selected.businessEntityId,
      name: copyForm.name,
      createdAt: serverTimestamp(),
    });
    toast.success("복사되었습니다");
    setCopyOpen(false);
  };

  const exportCsv = () => {
    const headers = ["사업자", "템플릿명", "근무시간유형", "기본근무시작시간", "기본근무종료시간", "숨김여부"];
    downloadCsv("시간템플릿", headers, rows.map((t) => [entityName(t.businessEntityId), t.name, t.workTimeType, t.baseStartTime, t.baseEndTime, t.visibility]));
  };

  return (
    <div className="space-y-6">
      <Panel icon={Clock} title="시간템플릿">
        <p className="mb-4 text-xs text-muted">시간 템플릿은 요일별 휴무/근무 여부와 근무시작/종료 시간을 등록합니다. 휴게시간 / 연장 시간 / 지각 시간을 설정하여 유연하게 관리할 수 있습니다.</p>
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
          <table className="w-full min-w-[640px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-2.5 font-semibold">순번</th>
                <th className="px-3 py-2.5 font-semibold">사업자</th>
                <th className="px-3 py-2.5 font-semibold">템플릿명</th>
                <th className="px-3 py-2.5 font-semibold">근무시간유형</th>
                <th className="px-3 py-2.5 font-semibold">근무시작시간</th>
                <th className="px-3 py-2.5 font-semibold">근무종료시간</th>
                <th className="px-3 py-2.5 font-semibold">숨김여부</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr
                  key={t.id}
                  onClick={() => select(t)}
                  className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 ${selectedId === t.id ? "bg-primary-light/40" : ""}`}
                >
                  <td className="px-3 py-2.5 text-muted">{i + 1}</td>
                  <td className="px-3 py-2.5 text-muted">{entityName(t.businessEntityId)}</td>
                  <td className="px-3 py-2.5 text-ink">{t.name}</td>
                  <td className="px-3 py-2.5 text-muted">{t.workTimeType || "-"}</td>
                  <td className="px-3 py-2.5 text-muted">{t.baseStartTime}</td>
                  <td className="px-3 py-2.5 text-muted">{t.baseEndTime}</td>
                  <td className="px-3 py-2.5 text-muted">{t.visibility || "보임"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-xs text-muted">
                    등록된 시간템플릿이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Card className="p-0">
          <div className="flex flex-col lg:flex-row">
            <div className="border-b border-slate-100 p-4 lg:w-40 lg:border-b-0 lg:border-r">
              <div className="mb-3 rounded-xl bg-primary-light/40 px-3 py-2 text-center text-sm font-semibold text-primary">
                {selected ? selected.name : "신규 템플릿"}
              </div>
              <div className="flex flex-row gap-1 overflow-x-auto overscroll-x-contain lg:flex-col">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`shrink-0 rounded-lg px-3 py-2 text-center text-sm font-medium ${tab === t.key ? "bg-primary-light text-primary" : "text-muted hover:bg-slate-50"}`}
                  >
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
                      <select
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={form.businessEntityId}
                        onChange={(e) => setForm((f) => ({ ...f, businessEntityId: e.target.value }))}
                      >
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
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">메모</span>
                    <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="mb-1.5 block text-xs font-medium text-muted">근무시간유형</span>
                      <div className="flex flex-nowrap gap-4 overflow-x-auto overscroll-x-contain text-sm">
                        {["공수", "실근무"].map((v) => (
                          <label key={v} className="flex items-center gap-1.5">
                            <input type="radio" checked={form.workTimeType === v} onChange={() => setForm((f) => ({ ...f, workTimeType: v }))} />
                            {v}
                          </label>
                        ))}
                      </div>
                    </div>
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
                  </div>
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">기본근무시작시간 *</span>
                      <input type="time" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.baseStartTime} onChange={(e) => setForm((f) => ({ ...f, baseStartTime: e.target.value }))} />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">기본근무종료시간 *</span>
                      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain">
                        <input type="time" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.baseEndTime} onChange={(e) => setForm((f) => ({ ...f, baseEndTime: e.target.value }))} />
                        <Button size="sm" variant="outline" onClick={applyBaseTime}>
                          기본시간적용
                        </Button>
                      </div>
                    </label>
                  </div>

                  <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
                    <table className="w-full min-w-[480px] text-center text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs text-muted">
                          <th className="px-3 py-2 font-semibold">휴일여부</th>
                          <th className="px-3 py-2 font-semibold">근무여부</th>
                          <th className="px-3 py-2 font-semibold">근무시작시간</th>
                          <th className="px-3 py-2 font-semibold">근무종료시간</th>
                        </tr>
                      </thead>
                      <tbody>
                        {WEEKDAYS.map((w) => {
                          const v = form.weekdays[w] || {};
                          return (
                            <tr key={w} className="border-b border-slate-50 last:border-0">
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={!!v.holiday}
                                    onChange={(e) => setForm((f) => ({ ...f, weekdays: { ...f.weekdays, [w]: { ...v, holiday: e.target.checked } } }))}
                                  />
                                  {w}
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={!!v.work}
                                    onChange={(e) => setForm((f) => ({ ...f, weekdays: { ...f.weekdays, [w]: { ...v, work: e.target.checked } } }))}
                                  />
                                  {w}
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="time"
                                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                  value={v.start || "07:00"}
                                  onChange={(e) => setForm((f) => ({ ...f, weekdays: { ...f.weekdays, [w]: { ...v, start: e.target.value } } }))}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="time"
                                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                  value={v.end || "11:00"}
                                  onChange={(e) => setForm((f) => ({ ...f, weekdays: { ...f.weekdays, [w]: { ...v, end: e.target.value } } }))}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-nowrap items-center justify-end gap-2 overflow-x-auto overscroll-x-contain border-t border-slate-100 pt-3">
                    <Button variant="outline" onClick={remove} disabled={!selectedId}>
                      삭제
                    </Button>
                    <Button variant="outline" onClick={openCopy} disabled={!selectedId}>
                      <CopyIcon size={13} /> 복사
                    </Button>
                    <Button onClick={save}>저장</Button>
                  </div>
                </div>
              )}
              {tab === "break" && <RangeListTab form={form} setForm={setForm} field="breaks" title="휴게시간" onSave={save} />}
              {tab === "overtime" && <ThresholdListTab form={form} setForm={setForm} field="overtimeRules" fromLabel="분 부터" toLabel="분 연장" onSave={save} />}
              {tab === "late" && <ThresholdListTab form={form} setForm={setForm} field="lateRules" fromLabel="분 지각시" toLabel="분 소급" onSave={save} />}
            </div>
          </div>
        </Card>
      </Panel>

      <Modal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="시간 템플릿 복사"
        footer={
          <>
            <Button variant="outline" onClick={() => setCopyOpen(false)}>
              취소
            </Button>
            <Button onClick={doCopy}>복사</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl bg-primary-light/40 px-3.5 py-2.5 text-xs text-primary">
            복사조건: #사업자 {entityName(form.businessEntityId)} #템플릿 {form.name}
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사업자</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={copyForm.businessEntityId}
              onChange={(e) => setCopyForm((f) => ({ ...f, businessEntityId: e.target.value }))}
            >
              <option value="">선택</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">템플릿명</span>
            <input className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={copyForm.name} onChange={(e) => setCopyForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
        </div>
      </Modal>
    </div>
  );
}

function RangeListTab({ form, setForm, field, title, onSave }) {
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
    <div className="space-y-3">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain">
        <span className="text-xs text-muted">{title} 설정</span>
        <input type="time" className="rounded-lg border border-slate-200 px-2 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-xs text-muted">부터</span>
        <input type="time" className="rounded-lg border border-slate-200 px-2 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        <span className="text-xs text-muted">까지</span>
        <Button size="sm" onClick={add}>
          추가
        </Button>
      </div>
      <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
        <table className="w-full text-center text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-3 py-2 font-semibold">No.</th>
              <th className="px-3 py-2 font-semibold">{title}</th>
              <th className="px-3 py-2 font-semibold">삭제</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-2 text-muted">{i + 1}</td>
                <td className="px-3 py-2 text-ink">
                  {r.from} 부터 {r.to} 까지
                </td>
                <td className="px-3 py-2">
                  <button className="text-muted hover:text-danger" onClick={() => remove(i)}>
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-xs text-muted">
                  조회 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted">저장된 '{title}' 설정은 정산에 자동 반영됩니다. 목록을 한번 더 확인해 주십시오.</p>
      <div className="flex justify-end">
        <Button size="sm" onClick={onSave}>
          저장
        </Button>
      </div>
    </div>
  );
}

function ThresholdListTab({ form, setForm, field, fromLabel, toLabel, onSave }) {
  const list = form[field] || [];
  const [from, setFrom] = useState(5);
  const [to, setTo] = useState(5);

  const add = () => {
    setForm((f) => ({ ...f, [field]: [...(f[field] || []), { from, to }] }));
  };
  const remove = (idx) => setForm((f) => ({ ...f, [field]: f[field].filter((_, i) => i !== idx) }));
  const options = Array.from({ length: 12 }, (_, i) => (i + 1) * 5);

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-ink">{fromLabel.includes("지각") ? "지각설정" : "연장시간"}</p>
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain">
        <select className="rounded-lg border border-slate-200 px-2 py-2 text-sm" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">{fromLabel}</span>
        <select className="rounded-lg border border-slate-200 px-2 py-2 text-sm" value={to} onChange={(e) => setTo(Number(e.target.value))}>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">{toLabel}</span>
        <Button size="sm" onClick={add}>
          추가
        </Button>
      </div>
      <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
        <table className="w-full text-center text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-3 py-2 font-semibold">No.</th>
              <th className="px-3 py-2 font-semibold">설정</th>
              <th className="px-3 py-2 font-semibold">삭제</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-2 text-muted">{i + 1}</td>
                <td className="px-3 py-2 text-ink">
                  {r.from}
                  {fromLabel} {r.to}
                  {toLabel}
                </td>
                <td className="px-3 py-2">
                  <button className="text-muted hover:text-danger" onClick={() => remove(i)}>
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-xs text-muted">
                  조회 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted">저장된 설정은 정산에 자동 반영됩니다. 목록을 한번 더 확인해 주십시오.</p>
      <div className="flex justify-end">
        <Button size="sm" onClick={onSave}>
          저장
        </Button>
      </div>
    </div>
  );
}
