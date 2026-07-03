import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Wallet2, Plus, RefreshCw, FileSpreadsheet, Copy as CopyIcon } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import Modal from "../components/Modal";
import { downloadCsv } from "../utils/exportCsv";
import { PAY_TYPE_OPTIONS } from "../constants/hr";

const EMPTY_FORM = {
  businessEntityId: "",
  name: "",
  payType: "주급",
  hourlyWage: "",
  overtimeWage: "",
  holidayWage: "",
  holidayOvertimeWage: "",
  weeklyAllowanceRate: "",
  weeklyAllowanceHours: "",
  weeklyAllowanceMaxHours: "",
  overtimeRecognitionHours: "0",
  baseRecognitionHours: "0",
  dailyEtcAllowance: "0",
  mealAllowance: "0",
  visibility: "보임",
  memo: "",
};

const NUMBER_FIELDS = [
  { key: "hourlyWage", label: "시급[원/시간] *" },
  { key: "overtimeWage", label: "연장수당[원/시간]" },
  { key: "holidayWage", label: "휴일수당[원/시간]" },
  { key: "holidayOvertimeWage", label: "휴일연장수당[원/시간]" },
  { key: "weeklyAllowanceRate", label: "주휴수당비율[%]" },
  { key: "weeklyAllowanceHours", label: "주휴시간[시간/주]" },
  { key: "weeklyAllowanceMaxHours", label: "주휴최대인정시간[시간/주]" },
  { key: "overtimeRecognitionHours", label: "연장인정시간(최소실근무시간/주)" },
  { key: "baseRecognitionHours", label: "기본급인정시간(최소실근무시간/주)" },
  { key: "dailyEtcAllowance", label: "일기타수당[원/일]" },
  { key: "mealAllowance", label: "식대[원/일]" },
];

export default function AllowanceTemplates() {
  const { profile } = useAuth();
  const [entities, setEntities] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyForm, setCopyForm] = useState({ businessEntityId: "", name: "" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubEntities = onSnapshot(
      query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)),
      (snap) => setEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubItems = onSnapshot(query(collection(db, "allowanceTemplates"), where("companyId", "==", profile.companyId)), (snap) =>
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
  };
  const select = (t) => {
    setSelectedId(t.id);
    setForm({ ...EMPTY_FORM, ...t });
  };

  const save = async () => {
    if (!form.name.trim() || !form.hourlyWage) return;
    const payload = { ...form };
    for (const f of NUMBER_FIELDS) payload[f.key] = Number(payload[f.key] || 0);
    if (selectedId) {
      await updateDoc(doc(db, "allowanceTemplates", selectedId), payload);
    } else {
      const ref_ = await addDoc(collection(db, "allowanceTemplates"), { companyId: profile.companyId, ...payload, createdAt: serverTimestamp() });
      setSelectedId(ref_.id);
    }
  };

  const remove = async () => {
    if (!selectedId) return;
    await deleteDoc(doc(db, "allowanceTemplates", selectedId));
    startNew();
  };

  const openCopy = () => {
    setCopyForm({ businessEntityId: form.businessEntityId, name: `${form.name}(복사)` });
    setCopyOpen(true);
  };
  const doCopy = async () => {
    if (!selected || !copyForm.name.trim()) return;
    const { id, createdAt, ...rest } = selected;
    await addDoc(collection(db, "allowanceTemplates"), {
      ...rest,
      companyId: profile.companyId,
      businessEntityId: copyForm.businessEntityId || selected.businessEntityId,
      name: copyForm.name,
      createdAt: serverTimestamp(),
    });
    setCopyOpen(false);
  };

  const exportCsv = () => {
    const headers = ["사업자", "템플릿명", "급여종류", "시급", "연장수당", "휴일수당", "휴일연장수당"];
    downloadCsv(
      "수당템플릿",
      headers,
      rows.map((t) => [entityName(t.businessEntityId), t.name, t.payType, t.hourlyWage, t.overtimeWage, t.holidayWage, t.holidayOvertimeWage])
    );
  };

  return (
    <div className="space-y-6">
      <Panel icon={Wallet2} title="수당">
        <p className="mb-4 text-xs text-muted">
          사업자는 각 업체 근무자의 급여 및 수당 조건을 템플릿으로 설정할 수 있으며, 수당 조건이 동일한 경우 하나의 템플릿을 여러 센터의 근무형태에 적용할 수
          있습니다. 수당 템플릿은 신규 등록하거나 기존 템플릿을 복사해 사용할 수 있습니다.
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

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
          <p className="text-xs font-medium text-muted">목록 {rows.length}</p>
          <div className="flex flex-nowrap gap-2 overflow-x-auto">
            <Button size="sm" onClick={startNew}>
              <Plus size={13} /> 신규
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <FileSpreadsheet size={13} /> 엑셀
            </Button>
          </div>
        </div>
        <div className="mb-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-2.5 font-medium">순번</th>
                <th className="px-3 py-2.5 font-medium">사업자</th>
                <th className="px-3 py-2.5 font-medium">템플릿명</th>
                <th className="px-3 py-2.5 font-medium">급여종류</th>
                <th className="px-3 py-2.5 font-medium">시급[원]</th>
                <th className="px-3 py-2.5 font-medium">연장수당[원]</th>
                <th className="px-3 py-2.5 font-medium">휴일수당[원]</th>
                <th className="px-3 py-2.5 font-medium">휴일연장수당[원]</th>
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
                  <td className="px-3 py-2.5 text-muted">{t.payType}</td>
                  <td className="px-3 py-2.5 text-muted">{Number(t.hourlyWage || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-muted">{Number(t.overtimeWage || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-muted">{Number(t.holidayWage || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-muted">{Number(t.holidayOvertimeWage || 0).toLocaleString()}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-xs text-muted">
                    등록된 수당템플릿이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Card className="space-y-3 p-4">
          <p className="text-sm font-semibold text-ink">수당 &gt; 상세</p>
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
          <label className="block w-48">
            <span className="mb-1.5 block text-xs font-medium text-muted">급여종류 *</span>
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.payType} onChange={(e) => setForm((f) => ({ ...f, payType: e.target.value }))}>
              {PAY_TYPE_OPTIONS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {NUMBER_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">{f.label}</span>
                <input
                  type="number"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form[f.key]}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">숨김여부</span>
            <div className="flex flex-nowrap items-center gap-3 overflow-x-auto text-sm">
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
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">메모</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} />
          </label>
          <div className="flex flex-nowrap items-center justify-end gap-2 overflow-x-auto border-t border-slate-100 pt-3">
            <Button variant="outline" onClick={remove} disabled={!selectedId}>
              삭제
            </Button>
            <Button variant="outline" onClick={openCopy} disabled={!selectedId}>
              <CopyIcon size={13} /> 복사
            </Button>
            <Button onClick={save}>저장</Button>
          </div>
        </Card>

        <div className="mt-4 rounded-xl bg-primary-light/40 p-3.5 text-xs leading-relaxed text-primary">
          ① 주휴수당지급비율: 주휴수당을 일급기준 %로 나누어 지급할지 설정 (주휴수당 지급 비율 = 시급 * 단위시간 * 주휴수당 지급 비율)
          <br />② 연장 인정시간: 주간 시간이 일정 시간 이상 근무했을 때, 그 이후부터 연장근무로 인정되는 시간
          <br />③ 주휴최대인정시간: 주휴시간 계산 시 인정되는 최대 근무시간
          <br />④ 기본급 인정시간: 기본급이 실 근무 시간 기준 기본 인정시간 이상하여야 기본급 발생
          <br />⑤ 일기타수당: 하루 단위로 추가 수당이 붙는 경우 설정
          <br />⑥ 월기타수당: 월 단위로 추가수당이 붙는 경우 설정
        </div>
      </Panel>

      <Modal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="수당 템플릿 복사"
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
            <select className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={copyForm.businessEntityId} onChange={(e) => setCopyForm((f) => ({ ...f, businessEntityId: e.target.value }))}>
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
