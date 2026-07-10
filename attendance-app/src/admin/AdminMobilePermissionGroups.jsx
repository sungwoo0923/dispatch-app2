import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Search, Plus, LayoutGrid, ChevronRight } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";

// 그룹등록의 모바일 전용 화면 — 권한 그룹 카드 목록 + 등록/수정 모달.
export default function AdminMobilePermissionGroups() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [groups, setGroups] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "permissionGroups"), where("companyId", "==", profile.companyId)), (s) => setGroups(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "admin")), (s) => setAdmins(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => !a.deleted))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const rows = useMemo(() => groups.filter((g) => !search.trim() || g.name?.includes(search.trim())).sort((a, b) => (a.name || "").localeCompare(b.name || "")), [groups, search]);
  const memberCount = (groupId) => admins.filter((a) => a.groupId === groupId).length;
  const members = useMemo(() => admins.filter((a) => a.groupId === editing?.id), [admins, editing]);

  const openNew = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setFormOpen(true);
  };

  const openEdit = (g) => {
    setEditing(g);
    setName(g.name || "");
    setDescription(g.description || "");
    setFormOpen(true);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("그룹명을 입력해주세요.");
    if (editing) {
      await updateDoc(doc(db, "permissionGroups", editing.id), { name, description });
    } else {
      await addDoc(collection(db, "permissionGroups"), { companyId: profile.companyId, name, description, createdAt: serverTimestamp() });
    }
    toast.success("저장되었습니다");
    setFormOpen(false);
  };

  const remove = async () => {
    if (!editing) return;
    if (!(await confirm(`"${editing.name}" 그룹을 삭제하시겠습니까? 이 그룹에 속한 관리자는 그룹이 해제됩니다.`, "delete"))) return;
    await deleteDoc(doc(db, "permissionGroups", editing.id));
    toast.success("삭제되었습니다");
    setFormOpen(false);
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">권한그룹</p>
        <Button size="sm" onClick={openNew}>
          <Plus size={13} /> 등록
        </Button>
      </div>

      <p className="rounded-xl bg-primary-light/40 p-3 text-xs leading-relaxed text-primary">
        그룹을 만든 뒤 그룹별메뉴에서 사용 메뉴를 지정하고, 관리자 계정에서 각 관리자를 그룹에 배정하세요.
      </p>

      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="그룹명 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">등록된 그룹이 없습니다.</div>}
        {rows.map((g) => (
          <button key={g.id} type="button" onClick={() => openEdit(g)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{g.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{g.description || "설명 없음"} · 소속 관리자 {memberCount(g.id)}명</p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-slate-300" />
          </button>
        ))}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "그룹 수정" : "그룹 등록"}>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">그룹명 *</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">설명 (선택)</span>
            <textarea rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="예: 센터 담당자용, 급여만 조회 가능 등" />
          </label>
          {editing && (
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="mb-1.5 text-xs font-medium text-muted">소속 관리자 {members.length}명</p>
              {members.length === 0 ? (
                <p className="text-xs text-muted">설정 &gt; 관리자 계정에서 배정할 수 있습니다.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {members.map((a) => (
                    <Badge key={a.id} tone="muted">{a.name}</Badge>
                  ))}
                </div>
              )}
              <Link to="/permissions/menus" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                <LayoutGrid size={13} /> 메뉴 설정하러 가기
              </Link>
            </div>
          )}
          <div className="flex gap-2">
            {editing && (
              <Button variant="outline" onClick={remove}>
                삭제
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
