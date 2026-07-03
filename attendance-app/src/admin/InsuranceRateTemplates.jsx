import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { ShieldPlus, Plus, FileSpreadsheet } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import Modal from "../components/Modal";
import { downloadCsv } from "../utils/exportCsv";

const RATE_TYPES = ["고용보험요율", "건강보험요율", "소득세", "요양보험요율", "국민연금요율"];

export default function InsuranceRateTemplates() {
  const { profile } = useAuth();
  const [entities, setEntities] = useState([]);
  const [masters, setMasters] = useState([]);
  const [elements, setElements] = useState([]);

  const [selectedMasterId, setSelectedMasterId] = useState(null);
  const [masterForm, setMasterForm] = useState({ businessEntityId: "", name: "", visibility: "보임", memo: "" });

  const [selectedElementId, setSelectedElementId] = useState(null);
  const [elementForm, setElementForm] = useState({ businessEntityId: "", templateId: "", rateType: "", ratePercent: "", insuranceApplicable: "대상" });

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
  const masterName = (id) => masters.find((m) => m.id === id)?.name || "-";

  const selectMaster = (m) => {
    setSelectedMasterId(m.id);
    setMasterForm({ businessEntityId: m.businessEntityId || "", name: m.name || "", visibility: m.visibility || "보임", memo: m.memo || "" });
  };
  const startNewMaster = () => {
    setSelectedMasterId(null);
    setMasterForm({ businessEntityId: "", name: "", visibility: "보임", memo: "" });
  };
  const saveMaster = async () => {
    if (!masterForm.name.trim()) return;
    if (selectedMasterId) {
      await updateDoc(doc(db, "insuranceRateTemplates", selectedMasterId), masterForm);
    } else {
      const ref_ = await addDoc(collection(db, "insuranceRateTemplates"), { companyId: profile.companyId, ...masterForm, createdAt: serverTimestamp() });
      setSelectedMasterId(ref_.id);
    }
  };
  const removeMaster = async () => {
    if (!selectedMasterId) return;
    await deleteDoc(doc(db, "insuranceRateTemplates", selectedMasterId));
    for (const el of elements.filter((e) => e.templateId === selectedMasterId)) await deleteDoc(doc(db, "insuranceRateElements", el.id));
    startNewMaster();
  };
  const openCopyMaster = () => {
    setCopyForm({ businessEntityId: masterForm.businessEntityId, name: `${masterForm.name}(복사)` });
    setCopyOpen(true);
  };
  const doCopyMaster = async () => {
    if (!selectedMasterId || !copyForm.name.trim()) return;
    const ref_ = await addDoc(collection(db, "insuranceRateTemplates"), {
      companyId: profile.companyId,
      businessEntityId: copyForm.businessEntityId || masterForm.businessEntityId,
      name: copyForm.name,
      visibility: masterForm.visibility,
      memo: masterForm.memo,
      createdAt: serverTimestamp(),
    });
    for (const el of elements.filter((e) => e.templateId === selectedMasterId)) {
      const { id, templateId, createdAt, ...rest } = el;
      await addDoc(collection(db, "insuranceRateElements"), { ...rest, templateId: ref_.id, companyId: profile.companyId, createdAt: serverTimestamp() });
    }
    setCopyOpen(false);
  };

  const masterElements = elements.filter((e) => e.templateId === selectedMasterId);

  const selectElement = (el) => {
    setSelectedElementId(el.id);
    setElementForm({ businessEntityId: el.businessEntityId || "", templateId: el.templateId, rateType: el.rateType || "", ratePercent: el.ratePercent ?? "", insuranceApplicable: el.insuranceApplicable || "대상" });
  };
  const startNewElement = () => {
    setSelectedElementId(null);
    setElementForm({ businessEntityId: masterForm.businessEntityId, templateId: selectedMasterId, rateType: "", ratePercent: "", insuranceApplicable: "대상" });
  };
  const saveElement = async () => {
    if (!selectedMasterId || !elementForm.rateType) return;
    const payload = { ...elementForm, templateId: selectedMasterId, ratePercent: Number(elementForm.ratePercent || 0) };
    if (selectedElementId) {
      await updateDoc(doc(db, "insuranceRateElements", selectedElementId), payload);
    } else {
      const ref_ = await addDoc(collection(db, "insuranceRateElements"), { companyId: profile.companyId, ...payload, createdAt: serverTimestamp() });
      setSelectedElementId(ref_.id);
    }
  };
  const removeElement = async () => {
    if (!selectedElementId) return;
    await deleteDoc(doc(db, "insuranceRateElements", selectedElementId));
    startNewElement();
  };

  const exportMasters = () => downloadCsv("보험요율", ["사업자", "템플릿명", "숨김여부"], masters.map((m) => [entityName(m.businessEntityId), m.name, m.visibility]));
  const exportElements = () =>
    downloadCsv("보험요율요소", ["사업자", "템플릿명", "보험요율종류", "요율%", "4대보험여부"], elements.map((e) => [entityName(e.businessEntityId), masterName(e.templateId), e.rateType, e.ratePercent, e.insuranceApplicable]));

  return (
    <div className="space-y-6">
      <Panel icon={ShieldPlus} title="보험요율">
        <p className="mb-4 text-xs text-muted">마스터 템플릿을 생성 후 서브상세에서 보험종류별로 요율을 등록할 수 있습니다.</p>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
              <p className="text-xs font-medium text-muted">보험요율 {masters.length}</p>
              <Button size="sm" variant="outline" onClick={exportMasters}>
                <FileSpreadsheet size={13} /> 엑셀
              </Button>
            </div>
            <div className="mb-3 max-h-56 overflow-y-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="px-3 py-2 font-medium">순번</th>
                    <th className="px-3 py-2 font-medium">사업자</th>
                    <th className="px-3 py-2 font-medium">템플릿명</th>
                    <th className="px-3 py-2 font-medium">숨김여부</th>
                  </tr>
                </thead>
                <tbody>
                  {masters.map((m, i) => (
                    <tr
                      key={m.id}
                      onClick={() => selectMaster(m)}
                      className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 ${selectedMasterId === m.id ? "bg-primary-light/40" : ""}`}
                    >
                      <td className="px-3 py-2 text-muted">{i + 1}</td>
                      <td className="px-3 py-2 text-muted">{entityName(m.businessEntityId)}</td>
                      <td className="px-3 py-2 text-ink">{m.name}</td>
                      <td className="px-3 py-2 text-muted">{m.visibility}</td>
                    </tr>
                  ))}
                  {masters.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-xs text-muted">
                        등록된 보험요율 템플릿이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <Card className="space-y-3 p-4">
              <div className="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
                <p className="text-sm font-semibold text-ink">보험요율 상세</p>
                <Button size="sm" variant="outline" onClick={startNewMaster}>
                  <Plus size={13} /> 신규
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
                  <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={masterForm.businessEntityId} onChange={(e) => setMasterForm((f) => ({ ...f, businessEntityId: e.target.value }))}>
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
                  <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={masterForm.name} onChange={(e) => setMasterForm((f) => ({ ...f, name: e.target.value }))} />
                </label>
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted">숨김여부</span>
                <div className="flex flex-nowrap items-center gap-3 overflow-x-auto text-sm">
                  {["숨김", "보임"].map((v) => (
                    <label key={v} className="flex items-center gap-1.5">
                      <input type="radio" checked={masterForm.visibility === v} onChange={() => setMasterForm((f) => ({ ...f, visibility: v }))} />
                      {v}
                    </label>
                  ))}
                  <Button size="sm" variant="outline" onClick={saveMaster}>
                    적용
                  </Button>
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">비고</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={masterForm.memo} onChange={(e) => setMasterForm((f) => ({ ...f, memo: e.target.value }))} />
              </label>
              <div className="flex flex-nowrap items-center justify-end gap-2 overflow-x-auto border-t border-slate-100 pt-3">
                <Button variant="outline" onClick={removeMaster} disabled={!selectedMasterId}>
                  삭제
                </Button>
                <Button variant="outline" onClick={openCopyMaster} disabled={!selectedMasterId}>
                  복사
                </Button>
                <Button onClick={saveMaster}>저장</Button>
              </div>
            </Card>
          </div>

          <div>
            <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
              <p className="text-xs font-medium text-muted">보험요율요소 {masterElements.length}</p>
              <Button size="sm" variant="outline" onClick={exportElements}>
                <FileSpreadsheet size={13} /> 엑셀
              </Button>
            </div>
            <div className="mb-3 max-h-56 overflow-y-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="px-3 py-2 font-medium">순번</th>
                    <th className="px-3 py-2 font-medium">보험요율종류</th>
                    <th className="px-3 py-2 font-medium">요율[%]</th>
                    <th className="px-3 py-2 font-medium">4대보험여부</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedMasterId ? (
                    masterElements.map((el, i) => (
                      <tr
                        key={el.id}
                        onClick={() => selectElement(el)}
                        className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 ${selectedElementId === el.id ? "bg-primary-light/40" : ""}`}
                      >
                        <td className="px-3 py-2 text-muted">{i + 1}</td>
                        <td className="px-3 py-2 text-ink">{el.rateType}</td>
                        <td className="px-3 py-2 text-muted">{el.ratePercent}</td>
                        <td className="px-3 py-2 text-muted">{el.insuranceApplicable}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-xs text-muted">
                        보험요율 템플릿을 먼저 선택하세요.
                      </td>
                    </tr>
                  )}
                  {selectedMasterId && masterElements.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-xs text-muted">
                        등록된 보험요율요소가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <Card className="space-y-3 p-4">
              <div className="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
                <p className="text-sm font-semibold text-ink">보험요율요소 상세</p>
                <Button size="sm" variant="outline" onClick={startNewElement} disabled={!selectedMasterId}>
                  <Plus size={13} /> 신규
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
                  <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={elementForm.businessEntityId} onChange={(e) => setElementForm((f) => ({ ...f, businessEntityId: e.target.value }))}>
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
                  <input className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-muted" disabled value={masterForm.name} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">요율종류 *</span>
                  <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={elementForm.rateType} onChange={(e) => setElementForm((f) => ({ ...f, rateType: e.target.value }))}>
                    <option value="">선택</option>
                    {RATE_TYPES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">요율[%] *</span>
                  <input type="number" step="0.01" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={elementForm.ratePercent} onChange={(e) => setElementForm((f) => ({ ...f, ratePercent: e.target.value }))} />
                </label>
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted">4대보험여부</span>
                <div className="flex flex-nowrap gap-4 overflow-x-auto text-sm">
                  {["대상", "미대상"].map((v) => (
                    <label key={v} className="flex items-center gap-1.5">
                      <input type="radio" checked={elementForm.insuranceApplicable === v} onChange={() => setElementForm((f) => ({ ...f, insuranceApplicable: v }))} />
                      {v}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-nowrap items-center justify-end gap-2 overflow-x-auto border-t border-slate-100 pt-3">
                <Button variant="outline" onClick={removeElement} disabled={!selectedElementId}>
                  삭제
                </Button>
                <Button onClick={saveElement} disabled={!selectedMasterId}>
                  저장
                </Button>
              </div>
            </Card>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-primary-light/40 p-3.5 text-xs leading-relaxed text-primary">
          보험요율등록방법
          <br />
          Step1. 신규혹은 수정할 템플릿 선택(①) Step2. 보험요율 상세에서 템플릿명을 입력(②) Step3. 보험요율요소 신규 혹은 수정할 보험요율요소 선택(③) Step4.
          보험요율요소 상세에서 보험요율 세부정보 등록(④)
        </div>
      </Panel>

      <Modal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="보험요율 템플릿 복사"
        footer={
          <>
            <Button variant="outline" onClick={() => setCopyOpen(false)}>
              취소
            </Button>
            <Button onClick={doCopyMaster}>복사</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl bg-primary-light/40 px-3.5 py-2.5 text-xs text-primary">
            복사조건: #사업자 {entityName(masterForm.businessEntityId)} #템플릿 {masterForm.name}
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
