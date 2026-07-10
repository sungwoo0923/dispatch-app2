import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Search, Plus, Trash2, Copy as CopyIcon, ChevronRight } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";

const RATE_TYPES = ["고용보험요율", "건강보험요율", "소득세", "요양보험요율", "국민연금요율"];
const EMPTY_MASTER = { businessEntityId: "", name: "", visibility: "보임", memo: "" };
const EMPTY_ELEMENT = { businessEntityId: "", rateType: "", ratePercent: "", insuranceApplicable: "대상" };

// 보험요율템플릿의 모바일 전용 화면 — 마스터 템플릿 카드 목록 → 탭하면
// 해당 템플릿의 보험요율요소 목록이 열리는 2단계 드릴다운 구조.
export default function AdminMobileInsuranceRateTemplates() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [entities, setEntities] = useState([]);
  const [masters, setMasters] = useState([]);
  const [elements, setElements] = useState([]);
  const [search, setSearch] = useState("");

  const [masterFormOpen, setMasterFormOpen] = useState(false);
  const [selectedMaster, setSelectedMaster] = useState(null);
  const [masterForm, setMasterForm] = useState(EMPTY_MASTER);

  const [elementsOpen, setElementsOpen] = useState(false);
  const [activeMaster, setActiveMaster] = useState(null);

  const [elementFormOpen, setElementFormOpen] = useState(false);
  const [selectedElement, setSelectedElement] = useState(null);
  const [elementForm, setElementForm] = useState(EMPTY_ELEMENT);

  const [copyOpen, setCopyOpen] = useState(false);
  const [copyForm, setCopyForm] = useState({ businessEntityId: "", name: "" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (s) => setEntities(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "insuranceRateTemplates"), where("companyId", "==", profile.companyId)), (s) => setMasters(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "insuranceRateElements"), where("companyId", "==", profile.companyId)), (s) => setElements(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";
  const rows = useMemo(() => masters.filter((m) => !search.trim() || m.name?.includes(search.trim())).sort((a, b) => (a.name || "").localeCompare(b.name || "")), [masters, search]);
  const elementCount = (masterId) => elements.filter((e) => e.templateId === masterId).length;

  const openNewMaster = () => {
    setSelectedMaster(null);
    setMasterForm(EMPTY_MASTER);
    setMasterFormOpen(true);
  };
  const openEditMaster = (m) => {
    setSelectedMaster(m);
    setMasterForm({ businessEntityId: m.businessEntityId || "", name: m.name || "", visibility: m.visibility || "보임", memo: m.memo || "" });
    setMasterFormOpen(true);
  };

  const saveMaster = async () => {
    if (!masterForm.name.trim()) return toast.error("템플릿명을 입력해주세요.");
    if (selectedMaster) {
      await updateDoc(doc(db, "insuranceRateTemplates", selectedMaster.id), masterForm);
    } else {
      await addDoc(collection(db, "insuranceRateTemplates"), { companyId: profile.companyId, ...masterForm, createdAt: serverTimestamp() });
    }
    toast.success("저장되었습니다");
    setMasterFormOpen(false);
  };

  const removeMaster = async () => {
    if (!selectedMaster) return;
    if (!(await confirm(`"${selectedMaster.name}" 템플릿과 하위 보험요율요소를 모두 삭제하시겠습니까?`, "delete"))) return;
    await deleteDoc(doc(db, "insuranceRateTemplates", selectedMaster.id));
    for (const el of elements.filter((e) => e.templateId === selectedMaster.id)) await deleteDoc(doc(db, "insuranceRateElements", el.id));
    toast.success("삭제되었습니다");
    setMasterFormOpen(false);
  };

  const openCopyMaster = () => {
    setCopyForm({ businessEntityId: masterForm.businessEntityId, name: `${masterForm.name}(복사)` });
    setCopyOpen(true);
  };
  const doCopyMaster = async () => {
    if (!selectedMaster || !copyForm.name.trim()) return;
    const ref_ = await addDoc(collection(db, "insuranceRateTemplates"), {
      companyId: profile.companyId,
      businessEntityId: copyForm.businessEntityId || masterForm.businessEntityId,
      name: copyForm.name,
      visibility: masterForm.visibility,
      memo: masterForm.memo,
      createdAt: serverTimestamp(),
    });
    for (const el of elements.filter((e) => e.templateId === selectedMaster.id)) {
      const { id, templateId, createdAt, ...rest } = el;
      await addDoc(collection(db, "insuranceRateElements"), { ...rest, templateId: ref_.id, companyId: profile.companyId, createdAt: serverTimestamp() });
    }
    toast.success("복사되었습니다");
    setCopyOpen(false);
    setMasterFormOpen(false);
  };

  const openElements = (m) => {
    setActiveMaster(m);
    setElementsOpen(true);
  };
  const activeMasterElements = elements.filter((e) => e.templateId === activeMaster?.id);

  const openNewElement = () => {
    setSelectedElement(null);
    setElementForm({ ...EMPTY_ELEMENT, businessEntityId: activeMaster?.businessEntityId || "" });
    setElementFormOpen(true);
  };
  const openEditElement = (el) => {
    setSelectedElement(el);
    setElementForm({ businessEntityId: el.businessEntityId || "", rateType: el.rateType || "", ratePercent: el.ratePercent ?? "", insuranceApplicable: el.insuranceApplicable || "대상" });
    setElementFormOpen(true);
  };

  const saveElement = async () => {
    if (!activeMaster || !elementForm.rateType) return toast.error("요율종류를 선택해주세요.");
    const payload = { ...elementForm, templateId: activeMaster.id, ratePercent: Number(elementForm.ratePercent || 0) };
    if (selectedElement) {
      await updateDoc(doc(db, "insuranceRateElements", selectedElement.id), payload);
    } else {
      await addDoc(collection(db, "insuranceRateElements"), { companyId: profile.companyId, ...payload, createdAt: serverTimestamp() });
    }
    toast.success("저장되었습니다");
    setElementFormOpen(false);
  };

  const removeElement = async () => {
    if (!selectedElement) return;
    if (!(await confirm("삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "insuranceRateElements", selectedElement.id));
    toast.success("삭제되었습니다");
    setElementFormOpen(false);
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">보험요율템플릿</p>
        <Button size="sm" onClick={openNewMaster}>
          <Plus size={13} /> 등록
        </Button>
      </div>
      <p className="text-xs text-muted">마스터 템플릿을 생성한 뒤 탭하면 보험종류별 요율을 등록할 수 있습니다.</p>

      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="템플릿명 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">등록된 보험요율 템플릿이 없습니다.</div>}
        {rows.map((m) => (
          <div key={m.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3.5">
            <button type="button" onClick={() => openElements(m)} className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-ink">{m.name}</span>
                <Badge tone={m.visibility === "숨김" ? "muted" : "success"}>{m.visibility || "보임"}</Badge>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">{entityName(m.businessEntityId)} · 요율항목 {elementCount(m.id)}개</p>
            </button>
            <button type="button" onClick={() => openEditMaster(m)} className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-muted">
              수정
            </button>
            <ChevronRight size={16} className="shrink-0 text-slate-300" />
          </div>
        ))}
      </div>

      <Modal open={masterFormOpen} onClose={() => setMasterFormOpen(false)} title={selectedMaster ? "보험요율 템플릿 수정" : "보험요율 템플릿 등록"}>
        <div className="space-y-3">
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={masterForm.businessEntityId} onChange={(e) => setMasterForm((f) => ({ ...f, businessEntityId: e.target.value }))}>
            <option value="">사업자 선택 *</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">템플릿명 *</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={masterForm.name} onChange={(e) => setMasterForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">숨김여부</span>
            <div className="flex gap-2">
              {["숨김", "보임"].map((v) => (
                <button key={v} type="button" onClick={() => setMasterForm((f) => ({ ...f, visibility: v }))} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${masterForm.visibility === v ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">비고</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={masterForm.memo} onChange={(e) => setMasterForm((f) => ({ ...f, memo: e.target.value }))} />
          </label>
          <div className="flex gap-2">
            {selectedMaster && (
              <>
                <Button variant="outline" onClick={removeMaster}>
                  <Trash2 size={13} />
                </Button>
                <Button variant="outline" onClick={openCopyMaster}>
                  <CopyIcon size={13} />
                </Button>
              </>
            )}
            <Button className="flex-1" onClick={saveMaster}>
              저장
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={copyOpen} onClose={() => setCopyOpen(false)} title="보험요율 템플릿 복사">
        <div className="space-y-3">
          <select className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={copyForm.businessEntityId} onChange={(e) => setCopyForm((f) => ({ ...f, businessEntityId: e.target.value }))}>
            <option value="">사업자 선택</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <input className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={copyForm.name} onChange={(e) => setCopyForm((f) => ({ ...f, name: e.target.value }))} />
          <Button className="w-full" onClick={doCopyMaster}>
            복사
          </Button>
        </div>
      </Modal>

      <Modal open={elementsOpen} onClose={() => setElementsOpen(false)} title={`${activeMaster?.name || ""} · 보험요율요소`}>
        <div className="space-y-3">
          <Button size="sm" className="w-full" onClick={openNewElement}>
            <Plus size={13} /> 요율항목 등록
          </Button>
          <div className="space-y-1.5">
            {activeMasterElements.length === 0 && <p className="py-4 text-center text-xs text-muted">등록된 보험요율요소가 없습니다.</p>}
            {activeMasterElements.map((el) => (
              <button key={el.id} type="button" onClick={() => openEditElement(el)} className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5 text-left text-sm">
                <span className="text-ink">{el.rateType} <span className="text-muted">({el.insuranceApplicable})</span></span>
                <span className="font-semibold text-primary">{el.ratePercent}%</span>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={elementFormOpen} onClose={() => setElementFormOpen(false)} title={selectedElement ? "보험요율요소 수정" : "보험요율요소 등록"}>
        <div className="space-y-3">
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={elementForm.rateType} onChange={(e) => setElementForm((f) => ({ ...f, rateType: e.target.value }))}>
            <option value="">요율종류 선택 *</option>
            {RATE_TYPES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">요율[%] *</span>
            <input type="number" step="0.01" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={elementForm.ratePercent} onChange={(e) => setElementForm((f) => ({ ...f, ratePercent: e.target.value }))} />
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">4대보험여부</span>
            <div className="flex gap-2">
              {["대상", "미대상"].map((v) => (
                <button key={v} type="button" onClick={() => setElementForm((f) => ({ ...f, insuranceApplicable: v }))} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${elementForm.insuranceApplicable === v ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            {selectedElement && (
              <Button variant="outline" onClick={removeElement}>
                <Trash2 size={13} />
              </Button>
            )}
            <Button className="flex-1" onClick={saveElement}>
              저장
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
