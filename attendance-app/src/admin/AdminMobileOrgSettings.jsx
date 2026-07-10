import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { Copy, Plus, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { TEAM_OPTIONS, POSITION_OPTIONS } from "../constants/hr";

function RankManagerMobile({ label, collectionName, presetOptions, items, companyId }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [selected, setSelected] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ mode: "preset", preset: presetOptions[0], custom: "", active: true });

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const ao = a.order ?? 9999;
      const bo = b.order ?? 9999;
      if (ao !== bo) return ao - bo;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [items]);

  const openNew = () => {
    setSelected(null);
    setForm({ mode: "preset", preset: presetOptions[0], custom: "", active: true });
    setFormOpen(true);
  };
  const openEdit = (item) => {
    setSelected(item);
    const isPreset = presetOptions.includes(item.name);
    setForm({ mode: isPreset ? "preset" : "custom", preset: isPreset ? item.name : presetOptions[0], custom: isPreset ? "" : item.name, active: item.active !== "미사용" });
    setFormOpen(true);
  };

  const currentName = (form.mode === "preset" ? form.preset : form.custom).trim();

  const save = async () => {
    if (!currentName) return toast.error(`${label}명을 입력해주세요.`);
    try {
      if (selected) {
        await updateDoc(doc(db, collectionName, selected.id), { name: currentName, active: form.active ? "사용" : "미사용" });
      } else {
        await addDoc(collection(db, collectionName), { companyId, name: currentName, active: form.active ? "사용" : "미사용", order: items.length, createdAt: serverTimestamp() });
      }
      toast.success(selected ? "수정되었습니다" : "저장되었습니다");
      setFormOpen(false);
    } catch (err) {
      toast.error(`저장에 실패했습니다: ${err.code || err.message}`);
    }
  };

  const remove = async () => {
    if (!selected) return;
    if (!(await confirm(`'${selected.name}'을(를) 삭제하시겠습니까? 이미 근로자에게 배정된 값이라면 표시가 '-'로 바뀝니다.`, "delete"))) return;
    try {
      await deleteDoc(doc(db, collectionName, selected.id));
      toast.success("삭제되었습니다");
      setFormOpen(false);
    } catch (err) {
      toast.error(`삭제에 실패했습니다: ${err.code || err.message}`);
    }
  };

  const move = async (item, dir) => {
    const idx = sorted.findIndex((i) => i.id === item.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const batch = writeBatch(db);
    sorted.forEach((it, i) => {
      if (it.order !== i) batch.update(doc(db, collectionName, it.id), { order: i });
    });
    batch.update(doc(db, collectionName, sorted[idx].id), { order: swapIdx });
    batch.update(doc(db, collectionName, sorted[swapIdx].id), { order: idx });
    try {
      await batch.commit();
    } catch (err) {
      toast.error(`순서 변경에 실패했습니다: ${err.code || err.message}`);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">목록 {sorted.length}건</p>
        <Button size="sm" onClick={openNew}>
          <Plus size={13} /> 등록
        </Button>
      </div>
      {sorted.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-muted">등록된 {label}이(가) 없습니다.</div>}
      {sorted.map((item, i) => (
        <div key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <button type="button" onClick={() => openEdit(item)} className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium text-ink">{item.name}</span>
              <Badge tone={item.active === "미사용" ? "muted" : "success"}>{item.active === "미사용" ? "미사용" : "사용"}</Badge>
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-0.5">
            <button type="button" onClick={() => move(item, -1)} disabled={i === 0} className="rounded p-1.5 text-muted disabled:opacity-30">
              <ChevronUp size={15} />
            </button>
            <button type="button" onClick={() => move(item, 1)} disabled={i === sorted.length - 1} className="rounded p-1.5 text-muted disabled:opacity-30">
              <ChevronDown size={15} />
            </button>
          </div>
        </div>
      ))}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={selected ? `${label} 수정` : `${label} 등록`}>
        <div className="space-y-3">
          <div className="flex gap-2 text-xs">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={form.mode === "preset"} onChange={() => setForm((f) => ({ ...f, mode: "preset" }))} /> 기본목록
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={form.mode === "custom"} onChange={() => setForm((f) => ({ ...f, mode: "custom" }))} /> 직접입력
            </label>
          </div>
          {form.mode === "preset" ? (
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.preset} onChange={(e) => setForm((f) => ({ ...f, preset: e.target.value }))}>
              {presetOptions.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.custom} onChange={(e) => setForm((f) => ({ ...f, custom: e.target.value }))} placeholder={`${label}명 직접 입력`} />
          )}
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} /> 사용
          </label>
          <div className="flex gap-2">
            {selected && (
              <Button variant="outline" onClick={remove}>
                <Trash2 size={13} /> 삭제
              </Button>
            )}
            <Button className="flex-1" onClick={save} disabled={!currentName}>
              저장
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const TAB_KEY = "kpwork_org_settings_tab";

// 조직설정의 모바일 전용 화면 — 회사코드 카드 + 부서/직급 탭 카드 목록.
export default function AdminMobileOrgSettings() {
  const { profile, company } = useAuth();
  const toast = useToast();
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [tab, setTab] = useState(() => sessionStorage.getItem(TAB_KEY) || "dept");

  useEffect(() => {
    sessionStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "departments"), where("companyId", "==", profile.companyId)), (s) => setDepartments(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "positions"), where("companyId", "==", profile.companyId)), (s) => setPositions(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const copyCode = () => {
    if (!company?.id) return;
    navigator.clipboard?.writeText(company.id);
    toast.success("복사되었습니다");
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="rounded-xl border border-slate-200 bg-white p-3.5">
        <p className="text-sm font-semibold text-ink">{company?.name}</p>
        <p className="mt-0.5 text-xs text-muted">최고관리자 접속용 회사 고유 코드입니다</p>
        <button onClick={copyCode} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary-light px-3.5 py-2 font-mono text-sm font-bold text-primary">
          {company?.id} <Copy size={13} />
        </button>
      </div>

      <div className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain">
        <button type="button" onClick={() => setTab("dept")} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${tab === "dept" ? "bg-primary text-white" : "bg-white text-muted border border-slate-200"}`}>
          부서관리 ({departments.length})
        </button>
        <button type="button" onClick={() => setTab("pos")} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${tab === "pos" ? "bg-primary text-white" : "bg-white text-muted border border-slate-200"}`}>
          직급관리 ({positions.length})
        </button>
      </div>

      {tab === "dept" ? (
        <RankManagerMobile label="부서" collectionName="departments" presetOptions={TEAM_OPTIONS} items={departments} companyId={profile.companyId} />
      ) : (
        <RankManagerMobile label="직급" collectionName="positions" presetOptions={POSITION_OPTIONS} items={positions} companyId={profile.companyId} />
      )}
    </div>
  );
}
