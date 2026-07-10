import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Search, Plus, Trash2, Copy as CopyIcon } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Button from "../components/Button";
import Modal from "../components/Modal";
import CurrencyInput from "../components/CurrencyInput";
import { formatDate } from "../utils/dateUtils";
import { PAY_TYPE_OPTIONS } from "../constants/hr";

const EMPTY_FORM = {
  businessEntityId: "",
  name: "",
  payType: "주급",
  hourlyWage: "",
  dailyWage: "",
  overtimeWage: "",
  holidayWage: "",
  holidayOvertimeWage: "",
  dailyEtcAllowance: "0",
  mealAllowance: "0",
  weeklyAllowanceRate: "",
  weeklyAllowanceHours: "",
  weeklyAllowanceMaxHours: "",
  overtimeRecognitionHours: "0",
  baseRecognitionHours: "0",
  visibility: "보임",
  memo: "",
};

const BASIC_FIELDS = [
  { key: "hourlyWage", label: "시급 *" },
  { key: "dailyWage", label: "일급" },
  { key: "overtimeWage", label: "연장수당" },
  { key: "holidayWage", label: "휴일수당" },
  { key: "holidayOvertimeWage", label: "휴일연장수당" },
  { key: "dailyEtcAllowance", label: "일기타수당" },
  { key: "mealAllowance", label: "식대" },
];
const INDIVIDUAL_FIELDS = [
  { key: "weeklyAllowanceRate", label: "주휴수당비율[%]" },
  { key: "weeklyAllowanceHours", label: "주휴인정시작시간" },
  { key: "weeklyAllowanceMaxHours", label: "주휴최대인정시간" },
  { key: "overtimeRecognitionHours", label: "연장인정시간" },
  { key: "baseRecognitionHours", label: "기본급인정시간" },
];
const NUMBER_FIELDS = [...BASIC_FIELDS, ...INDIVIDUAL_FIELDS];
const REQUIRED_FIELDS = [
  { key: "businessEntityId", label: "사업자" },
  { key: "name", label: "템플릿명" },
  { key: "hourlyWage", label: "시급" },
];

function fmtCreatedAt(ts) {
  if (!ts?.seconds) return "-";
  const d = new Date(ts.seconds * 1000);
  return formatDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
}

// 수당템플릿의 모바일 전용 화면 — 카드 목록 + 등록/수정 모달(기본정보/
// 개별정보 그룹 필드).
export default function AdminMobileAllowanceTemplates() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [entities, setEntities] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyForm, setCopyForm] = useState({ businessEntityId: "", name: "" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (s) => setEntities(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "allowanceTemplates"), where("companyId", "==", profile.companyId)), (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";
  const rows = useMemo(() => items.filter((t) => !search.trim() || t.name?.includes(search.trim())).sort((a, b) => (a.name || "").localeCompare(b.name || "")), [items, search]);
  const selected = items.find((t) => t.id === selectedId) || null;

  const openNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };
  const openEdit = (t) => {
    setSelectedId(t.id);
    setForm({ ...EMPTY_FORM, ...t });
    setFormOpen(true);
  };

  const save = async () => {
    const missing = REQUIRED_FIELDS.filter((f) => !String(form[f.key] || "").trim()).map((f) => f.label);
    if (missing.length) return toast.error(`다음 필수 항목을 입력/선택해주세요: ${missing.join(", ")}`);
    const payload = { ...form };
    for (const f of NUMBER_FIELDS) payload[f.key] = Number(payload[f.key] || 0);
    if (selectedId) {
      await updateDoc(doc(db, "allowanceTemplates", selectedId), payload);
    } else {
      await addDoc(collection(db, "allowanceTemplates"), { companyId: profile.companyId, ...payload, createdAt: serverTimestamp() });
    }
    toast.success("저장되었습니다");
    setFormOpen(false);
  };

  const remove = async () => {
    if (!selectedId) return;
    if (!(await confirm("삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "allowanceTemplates", selectedId));
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
    await addDoc(collection(db, "allowanceTemplates"), { ...rest, companyId: profile.companyId, businessEntityId: copyForm.businessEntityId || selected.businessEntityId, name: copyForm.name, createdAt: serverTimestamp() });
    toast.success("복사되었습니다");
    setCopyOpen(false);
    setFormOpen(false);
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">수당템플릿</p>
        <Button size="sm" onClick={openNew}>
          <Plus size={13} /> 등록
        </Button>
      </div>

      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="템플릿명 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">등록된 수당템플릿이 없습니다.</div>}
        {rows.map((t) => (
          <button key={t.id} type="button" onClick={() => openEdit(t)} className="flex w-full flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-ink">{t.name}</span>
              <span className="shrink-0 text-[11px] text-muted">{fmtCreatedAt(t.createdAt)}</span>
            </div>
            <p className="truncate text-xs text-muted">{entityName(t.businessEntityId)} · {t.payType}</p>
            <p className="truncate text-xs font-semibold text-primary">시급 {Number(t.hourlyWage || 0).toLocaleString()}원</p>
          </button>
        ))}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={selected ? selected.name : "수당템플릿 등록"}>
        <div className="space-y-4">
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
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.payType} onChange={(e) => setForm((f) => ({ ...f, payType: e.target.value }))}>
            {PAY_TYPE_OPTIONS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
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
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">메모</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} />
          </label>

          <div>
            <p className="mb-2 text-sm font-semibold text-ink">기본정보</p>
            <div className="grid grid-cols-2 gap-2">
              {BASIC_FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-1 block text-[11px] font-medium text-muted">{f.label}</span>
                  <CurrencyInput className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" value={form[f.key]} onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))} />
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-ink">개별정보</p>
            <div className="grid grid-cols-2 gap-2">
              {INDIVIDUAL_FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-1 block text-[11px] font-medium text-muted">{f.label}</span>
                  <CurrencyInput className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" value={form[f.key]} onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))} />
                </label>
              ))}
            </div>
          </div>

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

      <Modal open={copyOpen} onClose={() => setCopyOpen(false)} title="수당 템플릿 복사">
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
