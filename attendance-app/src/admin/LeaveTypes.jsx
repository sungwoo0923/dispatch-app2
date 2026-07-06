import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Tags, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";

const EMPTY_FORM = { businessEntityId: "", name: "", days: 1, paid: "유급" };

export default function LeaveTypes() {
  const { profile } = useAuth();
  const [entities, setEntities] = useState([]);
  const [items, setItems] = useState([]);
  const [checked, setChecked] = useState(() => new Set());
  const [form, setForm] = useState(EMPTY_FORM);

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

  const rows = useMemo(() => items, [items]);

  return (
    <div className="space-y-6">
      <Panel icon={Tags} title="휴가유형설정">
        <p className="mb-4 text-xs text-muted">휴가 유형별로 휴가 일수에 대해 1(연차), 0.5(반차), 0.25(반반차) 설정 및 유급, 무급을 설정할 수 있습니다.</p>

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
          <p className="text-xs font-medium text-muted">휴가유형 목록 {rows.length}</p>
          <Button size="sm" variant="outline" onClick={removeChecked} disabled={checked.size === 0}>
            <Trash2 size={13} /> 삭제
          </Button>
        </div>
        <div className="mb-4 overflow-x-auto rounded-xl border border-slate-100">
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
              {rows.map((t, i) => (
                <tr key={t.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={checked.has(t.id)} onChange={() => toggle(t.id)} />
                  </td>
                  <td className="px-3 py-2.5 text-muted">{i + 1}</td>
                  <td className="px-3 py-2.5 text-muted">{entityName(t.businessEntityId)}</td>
                  <td className="px-3 py-2.5 text-ink">{t.name}</td>
                  <td className="px-3 py-2.5 text-muted">{t.days}</td>
                  <td className="px-3 py-2.5 text-muted">{t.paid}</td>
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
              {rows.length === 0 && (
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
              <div className="flex flex-nowrap items-center gap-3 overflow-x-auto text-sm">
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

        <div className="mt-4 rounded-xl bg-primary-light/40 p-3.5 text-xs leading-relaxed text-primary">
          휴가 유형 신규 시 신규 클릭 &gt; 휴가 유형 &gt; 휴가 일수선택 &gt; 유급여부 선택 후 저장 클릭.
          <br />
          휴가 유형 삭제 시 체크 목록에 1개이상 체크되어야 삭제가 가능합니다.
        </div>
      </Panel>
    </div>
  );
}
