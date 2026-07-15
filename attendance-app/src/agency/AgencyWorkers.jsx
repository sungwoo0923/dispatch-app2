import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Panel from "../components/Panel";
import Card from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { NATIONALITY_OPTIONS, COUNTRY_OPTIONS } from "../constants/hr";
import { formatPhoneNumber, formatResidentNumber } from "../utils/phoneAuth";

const JOB_GROUP_OPTIONS = ["보통인력", "기술인력"];

const EMPTY_FORM = {
  name: "",
  phone: "",
  emergencyContact: "",
  gender: "",
  nationality: "내국인",
  country: "대한민국",
  residentNumber: "",
  address: "",
  jobGroup: "보통인력",
  jobType: "",
  careerYears: "",
};

// 인력사무소가 자체적으로 보유한 인력 풀(로스터) — 여기에 미리 등록해두면
// 요청장 배정 시(AgencyRequests.jsx AssignModal) 이름 검색만으로 불러다
// 쓸 수 있다. 도급사에는 노출되지 않고 해당 인력사무소만 볼 수 있다.
export default function AgencyWorkers() {
  const { agency } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [workers, setWorkers] = useState([]);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agency?.id) return;
    const unsub = onSnapshot(query(collection(db, "agencyWorkers"), where("agencyId", "==", agency.id)), (snap) =>
      setWorkers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [agency?.id]);

  const filtered = useMemo(() => {
    const kw = search.trim();
    const rows = kw ? workers.filter((w) => w.name?.includes(kw) || w.phone?.includes(kw)) : workers;
    return [...rows].sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
  }, [workers, search]);

  const openNew = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };
  const openEdit = (w) => {
    setEditTarget(w);
    setForm({ ...EMPTY_FORM, ...w });
    setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("이름을 입력해주세요.");
    setSaving(true);
    try {
      if (editTarget) {
        await updateDoc(doc(db, "agencyWorkers", editTarget.id), { ...form });
        toast.success("수정되었습니다");
      } else {
        await addDoc(collection(db, "agencyWorkers"), {
          ...form,
          agencyId: agency.id,
          createdAt: serverTimestamp(),
        });
        toast.success("등록되었습니다");
      }
      closeModal();
    } catch (err) {
      toast.error(`저장에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const removeWorker = async (w) => {
    if (!(await confirm(`${w.name}님을 인원관리에서 삭제하시겠습니까?`, "delete"))) return;
    await deleteDoc(doc(db, "agencyWorkers", w.id));
    toast.success("삭제되었습니다");
  };

  return (
    <div className="space-y-6">
      <Panel icon={Users} title="인원관리">
        <p className="mb-3 text-xs text-muted">
          보유 인력을 미리 등록해두면 요청장 배정 시 이름 검색으로 바로 불러올 수 있습니다.
        </p>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <input
            className="w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="이름/연락처 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button onClick={openNew}>
            <Plus size={14} /> 인력 등록
          </Button>
        </div>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-3 font-semibold">이름</th>
                <th className="px-3 py-3 font-semibold">연락처</th>
                <th className="px-3 py-3 font-semibold">성별</th>
                <th className="px-3 py-3 font-semibold">국적</th>
                <th className="px-3 py-3 font-semibold">인력구분</th>
                <th className="px-3 py-3 font-semibold">직종</th>
                <th className="px-3 py-3 font-semibold">경력연차</th>
                <th className="px-3 py-3 font-semibold">거주지</th>
                <th className="px-3 py-3 font-semibold">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr key={w.id} className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50" onDoubleClick={() => openEdit(w)}>
                  <td className="px-3 py-3 text-ink">{w.name}</td>
                  <td className="px-3 py-3 text-ink">{w.phone || "-"}</td>
                  <td className="px-3 py-3 text-ink">{w.gender || "-"}</td>
                  <td className="px-3 py-3 text-ink">{w.country || "-"}</td>
                  <td className="px-3 py-3 text-ink">{w.jobGroup || "-"}</td>
                  <td className="px-3 py-3 text-ink">{w.jobType || "-"}</td>
                  <td className="px-3 py-3 text-ink">{w.careerYears ? `${w.careerYears}년` : "-"}</td>
                  <td className="px-3 py-3 text-ink">{w.address || "-"}</td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-2">
                      <button type="button" onClick={() => openEdit(w)} className="text-primary">
                        <Pencil size={15} />
                      </button>
                      <button type="button" onClick={() => removeWorker(w)} className="text-danger">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-xs text-muted">등록된 인력이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </Panel>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editTarget ? "인력 정보 수정" : "인력 등록"}
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>취소</Button>
            <Button onClick={save} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-primary">기본정보</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">이름 *</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">성별</span>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
                  <option value="">선택</option>
                  <option value="남">남</option>
                  <option value="여">여</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">연락처</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">비상연락망</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.emergencyContact} onChange={(e) => setForm((f) => ({ ...f, emergencyContact: formatPhoneNumber(e.target.value) }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">내/외국인</span>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.nationality}
                  onChange={(e) => {
                    const nationality = e.target.value;
                    setForm((f) => ({ ...f, nationality, country: nationality === "내국인" ? "대한민국" : "" }));
                  }}
                >
                  {NATIONALITY_OPTIONS.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">국적</span>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}>
                  <option value="">선택</option>
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 block">
                <span className="mb-1.5 block text-xs font-medium text-muted">주민등록번호</span>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="000000-0000000"
                  value={form.residentNumber}
                  onChange={(e) => setForm((f) => ({ ...f, residentNumber: formatResidentNumber(e.target.value) }))}
                />
              </label>
              <label className="col-span-2 block">
                <span className="mb-1.5 block text-xs font-medium text-muted">거주지</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              </label>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold text-primary">근무정보</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">인력구분</span>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.jobGroup} onChange={(e) => setForm((f) => ({ ...f, jobGroup: e.target.value }))}>
                  {JOB_GROUP_OPTIONS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">경력연차</span>
                <input type="number" min={0} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="년" value={form.careerYears} onChange={(e) => setForm((f) => ({ ...f, careerYears: e.target.value }))} />
              </label>
              <label className="col-span-2 block">
                <span className="mb-1.5 block text-xs font-medium text-muted">직종</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="예: 지게차, 용접, 포장 등" value={form.jobType} onChange={(e) => setForm((f) => ({ ...f, jobType: e.target.value }))} />
              </label>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
