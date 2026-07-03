import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc } from "firebase/firestore";
import { Plus, X, LayoutTemplate } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";

function ShiftTemplates() {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: "", startTime: "09:00", endTime: "18:00" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(query(collection(db, "shiftTemplates"), where("companyId", "==", profile.companyId)), (snap) =>
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await addDoc(collection(db, "shiftTemplates"), { companyId: profile.companyId, ...form });
    setForm({ name: "", startTime: "09:00", endTime: "18:00" });
  };

  const remove = (id) => deleteDoc(doc(db, "shiftTemplates", id));

  return (
    <Card className="p-5">
      <p className="mb-3 text-sm font-semibold text-ink">시간템플릿</p>
      <p className="mb-3 text-xs text-muted">스케줄 등록 시 근무시작/종료 시각을 빠르게 선택할 수 있습니다.</p>
      <form onSubmit={add} className="mb-4 grid grid-cols-[1fr_auto_auto_auto] items-end gap-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">템플릿명</span>
          <input
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="예: 주간조"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">시작</span>
          <input
            type="time"
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            value={form.startTime}
            onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">종료</span>
          <input
            type="time"
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            value={form.endTime}
            onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
          />
        </label>
        <Button size="sm" type="submit">
          <Plus size={14} /> 추가
        </Button>
      </form>
      <div className="space-y-2">
        {items.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
            <span className="text-ink">
              {t.name} <span className="text-muted">({t.startTime} ~ {t.endTime})</span>
            </span>
            <button onClick={() => remove(t.id)} className="text-muted hover:text-danger">
              <X size={14} />
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-muted">등록된 템플릿이 없습니다.</p>}
      </div>
    </Card>
  );
}

function AllowanceTemplates() {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: "", amount: "" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(query(collection(db, "allowanceTemplates"), where("companyId", "==", profile.companyId)), (snap) =>
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.amount) return;
    await addDoc(collection(db, "allowanceTemplates"), {
      companyId: profile.companyId,
      name: form.name,
      amount: Number(form.amount),
    });
    setForm({ name: "", amount: "" });
  };

  const remove = (id) => deleteDoc(doc(db, "allowanceTemplates", id));

  return (
    <Card className="p-5">
      <p className="mb-3 text-sm font-semibold text-ink">수당템플릿</p>
      <p className="mb-3 text-xs text-muted">급여 정산 시 기타수당에 빠르게 반영할 수 있습니다.</p>
      <form onSubmit={add} className="mb-4 grid grid-cols-[1fr_auto_auto] items-end gap-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">수당명</span>
          <input
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="예: 식대"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">금액(원)</span>
          <input
            type="number"
            className="w-32 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="100000"
          />
        </label>
        <Button size="sm" type="submit">
          <Plus size={14} /> 추가
        </Button>
      </form>
      <div className="space-y-2">
        {items.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
            <span className="text-ink">
              {t.name} <span className="text-muted">({t.amount.toLocaleString()}원)</span>
            </span>
            <button onClick={() => remove(t.id)} className="text-muted hover:text-danger">
              <X size={14} />
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-muted">등록된 템플릿이 없습니다.</p>}
      </div>
    </Card>
  );
}

const RATE_FIELDS = [
  { key: "pension", label: "국민연금(%)" },
  { key: "health", label: "건강보험(%)" },
  { key: "longTermCare", label: "장기요양(건보료 대비 %)" },
  { key: "employment", label: "고용보험(%)" },
];

const EMPTY_RATE_FORM = { name: "", pension: "", health: "", longTermCare: "", employment: "" };

function InsuranceRateTemplates() {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY_RATE_FORM);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "insuranceRateTemplates"), where("companyId", "==", profile.companyId)),
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await addDoc(collection(db, "insuranceRateTemplates"), {
      companyId: profile.companyId,
      name: form.name,
      rates: {
        pension: Number(form.pension || 0) / 100,
        health: Number(form.health || 0) / 100,
        longTermCare: Number(form.longTermCare || 0) / 100,
        employment: Number(form.employment || 0) / 100,
      },
    });
    setForm(EMPTY_RATE_FORM);
  };

  const remove = (id) => deleteDoc(doc(db, "insuranceRateTemplates", id));

  return (
    <Card className="p-5">
      <p className="mb-3 text-sm font-semibold text-ink">보험요율템플릿</p>
      <p className="mb-3 text-xs text-muted">센터별 정산설정에서 근무지에 적용하면 급여 정산 시 자동으로 공제됩니다.</p>
      <form onSubmit={add} className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">템플릿명</span>
          <input
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="예: 보험요율1"
          />
        </label>
        {RATE_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">{f.label}</span>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form[f.key]}
              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              placeholder="0"
            />
          </label>
        ))}
        <Button size="sm" type="submit" className="self-end">
          <Plus size={14} /> 추가
        </Button>
      </form>
      <div className="space-y-2">
        {items.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
            <span className="text-ink">
              {t.name}{" "}
              <span className="text-muted">
                (국민연금 {(t.rates?.pension * 100).toFixed(2)}% · 건강보험 {(t.rates?.health * 100).toFixed(2)}% · 장기요양{" "}
                {(t.rates?.longTermCare * 100).toFixed(2)}% · 고용보험 {(t.rates?.employment * 100).toFixed(2)}%)
              </span>
            </span>
            <button onClick={() => remove(t.id)} className="text-muted hover:text-danger">
              <X size={14} />
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-muted">등록된 템플릿이 없습니다.</p>}
      </div>
    </Card>
  );
}

export default function Templates() {
  return (
    <div className="space-y-6">
      <Panel icon={LayoutTemplate} title="템플릿 관리">
        <p className="mb-4 text-xs text-muted">반복되는 근무시간·수당·보험요율을 템플릿으로 저장해두면 스케줄/정산 등록이 빨라집니다.</p>
        <div className="space-y-4">
          <ShiftTemplates />
          <AllowanceTemplates />
          <InsuranceRateTemplates />
        </div>
      </Panel>
    </div>
  );
}
