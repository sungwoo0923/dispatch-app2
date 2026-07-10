import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, doc, serverTimestamp } from "firebase/firestore";
import { Search, Plus, Trash2 } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Button from "../components/Button";
import Modal from "../components/Modal";

const EMPTY_FORM = { type: "BEACON", code: "", password: "", deviceName: "", deviceId: "" };

// 디바이스의 모바일 전용 화면 — 비콘/태블릿 장치 목록을 카드로 보여주고,
// 탭하면 장치 상세 수정 + 센터 등록(1:1 배정)을 한 모달에서 처리한다.
export default function AdminMobileDevices() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [devices, setDevices] = useState([]);
  const [entities, setEntities] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [siteDevices, setSiteDevices] = useState([]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [assignForm, setAssignForm] = useState({ businessEntityId: "", siteId: "" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "devices"), where("companyId", "==", profile.companyId)), (s) => setDevices(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (s) => setEntities(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "siteDevices"), where("companyId", "==", profile.companyId)), (s) => setSiteDevices(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const rows = useMemo(() => devices.filter((d) => !search.trim() || d.deviceName?.includes(search.trim()) || d.code?.includes(search.trim())), [devices, search]);
  const assignFor = (deviceId) => siteDevices.find((s) => s.id === deviceId);
  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setAssignForm({ businessEntityId: "", siteId: "" });
    setFormOpen(true);
  };

  const openEdit = (d) => {
    setEditing(d);
    setForm({ type: d.type || "BEACON", code: d.code || "", password: d.password || "", deviceName: d.deviceName || "", deviceId: d.deviceId || "" });
    const assign = assignFor(d.id);
    setAssignForm({ businessEntityId: assign?.businessEntityId || "", siteId: assign?.siteId || "" });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.deviceName.trim()) return toast.error("장치명을 입력해주세요.");
    if (editing) {
      await updateDoc(doc(db, "devices", editing.id), { ...form });
      toast.success("저장되었습니다");
    } else {
      const ref = await addDoc(collection(db, "devices"), { companyId: profile.companyId, ...form, createdAt: serverTimestamp() });
      setEditing({ id: ref.id });
      toast.success("등록되었습니다");
    }
  };

  const remove = async (d) => {
    if (!(await confirm(`"${d.deviceName}" 장치를 삭제하시겠습니까?`, "delete"))) return;
    await deleteDoc(doc(db, "devices", d.id));
    setFormOpen(false);
    setEditing(null);
    toast.success("삭제되었습니다");
  };

  const saveAssign = async () => {
    if (!editing || !assignForm.siteId) return toast.error("센터를 선택해주세요.");
    await setDoc(doc(db, "siteDevices", editing.id), { companyId: profile.companyId, deviceId: editing.id, ...assignForm, createdAt: serverTimestamp() });
    toast.success("센터에 등록되었습니다");
  };

  const removeAssign = async () => {
    if (!editing) return;
    await deleteDoc(doc(db, "siteDevices", editing.id));
    setAssignForm({ businessEntityId: "", siteId: "" });
    toast.success("등록이 해제되었습니다");
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">디바이스</p>
        <Button size="sm" onClick={openNew}>
          <Plus size={13} /> 등록
        </Button>
      </div>

      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="장치명 또는 코드 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">등록된 디바이스가 없습니다.</div>}
        {rows.map((d) => {
          const assign = assignFor(d.id);
          return (
            <button key={d.id} type="button" onClick={() => openEdit(d)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{d.deviceName} <span className="text-xs font-normal text-muted">({d.type === "BEACON" ? "비콘" : "태블릿"})</span></p>
                <p className="mt-0.5 truncate text-xs text-muted">코드 {d.code} · {assign ? siteName_(assign.siteId) : "센터 미등록"}</p>
              </div>
            </button>
          );
        })}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing?.deviceName ? `${editing.deviceName} 수정` : "디바이스 등록"}>
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex gap-2">
              {[{ key: "BEACON", label: "비콘" }, { key: "TABLET", label: "태블릿" }].map((t) => (
                <button key={t.key} type="button" onClick={() => setForm((f) => ({ ...f, type: t.key }))} className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold ${form.type === t.key ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">장치명 *</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.deviceName} onChange={(e) => setForm((f) => ({ ...f, deviceName: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">코드</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">비밀번호</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">디바이스ID</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.deviceId} onChange={(e) => setForm((f) => ({ ...f, deviceId: e.target.value }))} />
            </label>
            <div className="flex gap-2">
              {editing && (
                <Button variant="outline" onClick={() => remove(editing)}>
                  <Trash2 size={13} /> 삭제
                </Button>
              )}
              <Button className="flex-1" onClick={save}>
                저장
              </Button>
            </div>
          </div>

          {editing && (
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-ink">센터 등록</p>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={assignForm.businessEntityId} onChange={(e) => setAssignForm((f) => ({ ...f, businessEntityId: e.target.value }))}>
                <option value="">사업자 선택</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={assignForm.siteId} onChange={(e) => setAssignForm((f) => ({ ...f, siteId: e.target.value }))}>
                <option value="">센터 선택</option>
                {workSites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={removeAssign}>
                  등록 해제
                </Button>
                <Button className="flex-1" onClick={saveAssign}>
                  센터 등록
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
