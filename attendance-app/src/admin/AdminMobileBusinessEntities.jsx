import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Search, Plus, Trash2 } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Button from "../components/Button";
import Modal from "../components/Modal";

const EMPTY_FORM = { name: "", regNumber: "", phone: "", address: "", memberDetailYN: "등록", active: "사용" };

// 사업자의 모바일 전용 화면 — 카드 목록 + 등록/수정 모달. 사용 이력이 있는
// 사업자는 데스크톱과 동일하게 삭제를 막고 미사용 처리로 안내한다.
export default function AdminMobileBusinessEntities() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [entities, setEntities] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (s) => setEntities(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (s) => setVendors(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const rows = useMemo(() => entities.filter((e) => !search.trim() || e.name?.includes(search.trim())).sort((a, b) => (a.name || "").localeCompare(b.name || "")), [entities, search]);
  const inUse = (id) => workSites.some((s) => s.businessEntityId === id) || vendors.some((v) => v.businessEntityId === id);

  const startNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };
  const select = (e) => {
    setSelectedId(e.id);
    setForm({ name: e.name || "", regNumber: e.regNumber || "", phone: e.phone || "", address: e.address || "", memberDetailYN: e.memberDetailYN || "등록", active: e.active || "사용" });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.regNumber.trim()) return toast.error("사업자명과 사업자등록번호를 입력해주세요.");
    if (selectedId) {
      await updateDoc(doc(db, "businessEntities", selectedId), { ...form });
    } else {
      await addDoc(collection(db, "businessEntities"), { companyId: profile.companyId, ...form, createdAt: serverTimestamp() });
    }
    toast.success("저장되었습니다");
    setFormOpen(false);
  };

  const remove = async () => {
    if (!selectedId || inUse(selectedId)) return;
    if (!(await confirm("삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "businessEntities", selectedId));
    toast.success("삭제되었습니다");
    setFormOpen(false);
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">사업자</p>
        <Button size="sm" onClick={startNew}>
          <Plus size={13} /> 등록
        </Button>
      </div>

      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="사업자명 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">등록된 사업자가 없습니다.</div>}
        {rows.map((e) => (
          <button key={e.id} type="button" onClick={() => select(e)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{e.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{e.regNumber} · {e.phone || "전화번호 미입력"}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{e.address || "주소 미입력"}</p>
            </div>
          </button>
        ))}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="사업자 상세">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.name} onChange={(ev) => setForm((f) => ({ ...f, name: ev.target.value }))} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사업자등록번호 *</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="대시(-)를 제외하고 입력" value={form.regNumber} onChange={(ev) => setForm((f) => ({ ...f, regNumber: ev.target.value }))} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사업자전화번호</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.phone} onChange={(ev) => setForm((f) => ({ ...f, phone: ev.target.value }))} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사업자주소</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.address} onChange={(ev) => setForm((f) => ({ ...f, address: ev.target.value }))} />
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">회원상세정보등록여부</span>
            <div className="flex gap-2">
              {["등록", "미등록"].map((v) => (
                <button key={v} type="button" onClick={() => setForm((f) => ({ ...f, memberDetailYN: v }))} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${form.memberDetailYN === v ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">사용여부</span>
            <div className="flex gap-2">
              {["사용", "미사용"].map((v) => (
                <button key={v} type="button" onClick={() => setForm((f) => ({ ...f, active: v }))} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${form.active === v ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            {selectedId && (
              <Button variant="outline" onClick={remove} disabled={inUse(selectedId)} title={inUse(selectedId) ? "사용 이력이 있어 삭제할 수 없습니다." : ""}>
                <Trash2 size={13} />
              </Button>
            )}
            <Button className="flex-1" onClick={save}>
              저장
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
