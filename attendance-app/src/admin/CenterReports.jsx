import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { FileBadge2, Plus, RefreshCw, FileSpreadsheet, Eye } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import Modal from "../components/Modal";
import { downloadCsv } from "../utils/exportCsv";

const DOC_TYPES = ["계약서", "사직서", "안전교육일지", "재직증명서", "퇴직증명서", "급여명세서"];
const FORM_NAMES = { 계약서: ["표준근로계약서"], 사직서: ["표준사직서"], 안전교육일지: ["TBM일지"], 재직증명서: ["재직증명서"], 퇴직증명서: ["퇴직증명서"], 급여명세서: ["급여명세서"] };

const EMPTY_FORM = { businessEntityId: "", siteId: "", docType: "계약서", templateName: "", reportFormat: "", visibility: "보임" };

export default function CenterReports() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const [entities, setEntities] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyForm, setCopyForm] = useState({ businessEntityId: "", siteId: "", templateName: "" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (s) => setEntities(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "centerReports"), where("companyId", "==", profile.companyId)), (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";
  const siteName = (id) => workSites.find((s) => s.id === id)?.name || "-";

  const rows = useMemo(
    () => items.filter((t) => !search || t.templateName?.includes(search)).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    [items, search]
  );
  const selected = items.find((t) => t.id === selectedId) || null;

  const startNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
  };
  const select = (t) => {
    setSelectedId(t.id);
    setForm({ ...EMPTY_FORM, ...t });
  };

  const save = async () => {
    if (!form.businessEntityId || !form.siteId || !form.templateName.trim()) return;
    if (!(await confirm("저장하시겠습니까?", "save"))) return;
    if (selectedId) {
      await updateDoc(doc(db, "centerReports", selectedId), form);
    } else {
      const ref_ = await addDoc(collection(db, "centerReports"), { companyId: profile.companyId, ...form, createdAt: serverTimestamp() });
      setSelectedId(ref_.id);
    }
  };
  const remove = async () => {
    if (!selectedId) return;
    if (!(await confirm("삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "centerReports", selectedId));
    startNew();
  };

  const openCopy = () => {
    setCopyForm({ businessEntityId: form.businessEntityId, siteId: "", templateName: `${form.templateName}(복사)` });
    setCopyOpen(true);
  };
  const doCopy = async () => {
    if (!selected || !copyForm.siteId || !copyForm.templateName.trim()) return;
    const { id, createdAt, ...rest } = selected;
    await addDoc(collection(db, "centerReports"), {
      ...rest,
      companyId: profile.companyId,
      businessEntityId: copyForm.businessEntityId || selected.businessEntityId,
      siteId: copyForm.siteId,
      templateName: copyForm.templateName,
      createdAt: serverTimestamp(),
    });
    setCopyOpen(false);
  };

  const exportCsv = () => {
    const headers = ["사업자", "센터", "양식유형", "템플릿명", "리포트양식명", "등록구분", "숨김여부"];
    downloadCsv("센터별리포트", headers, rows.map((t) => [entityName(t.businessEntityId), siteName(t.siteId), t.docType, t.templateName, t.reportFormat, "등록완료", t.visibility]));
  };

  return (
    <div className="space-y-6">
      <Panel icon={FileBadge2} title="센터별리포트">
        <div className="mb-4 rounded-xl bg-primary-light/40 p-3.5 text-xs leading-relaxed text-primary">
          센터별 리포트는 전자 문서 양식을 템플릿으로 등록/관리하는 화면 입니다. 관리 가능한 문서 종류는 계약서, 사직서, 안전교육일지, 재직증명서,
          퇴직증명서, 급여명세서 입니다.
          <br />
          [근로자별로 관리되는 문서] 계약서/사직서: 근로자 등록 &gt; 계약관리 에서 템플릿명을 매칭해 사용합니다.
          <br />
          [센터로 관리되는 문서] 안전교육일지: 안전 &gt; 센터별 안전관리 &gt; 안전문서 적용관리 에서 템플릿을 매칭해 사용합니다.
          <br />
          [센터로 1개씩만 등록하면 매칭하지 않아도 자동 연동되는 문서] 재직증명서/퇴직증명서, 급여명세서: 정보 기준으로 자동 연동됩니다.
        </div>

        <Card className="mb-4 space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-muted">검색어</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="템플릿명 검색" />
            </label>
            <div className="flex items-end gap-2">
              <button type="button" className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50" onClick={() => setSearch("")}>
                <RefreshCw size={16} />
              </button>
              <Button>검색</Button>
            </div>
          </div>
        </Card>

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
          <p className="text-xs font-medium text-muted">목록 {rows.length}</p>
          <div className="flex flex-nowrap gap-2 overflow-x-auto">
            <Button size="sm" onClick={startNew}>
              <Plus size={13} /> 신규
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <FileSpreadsheet size={13} /> 엑셀
            </Button>
          </div>
        </div>
        <div className="mb-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-2.5 font-medium">순번</th>
                <th className="px-3 py-2.5 font-medium">사업자</th>
                <th className="px-3 py-2.5 font-medium">센터</th>
                <th className="px-3 py-2.5 font-medium">양식유형</th>
                <th className="px-3 py-2.5 font-medium">템플릿명</th>
                <th className="px-3 py-2.5 font-medium">리포트양식명</th>
                <th className="px-3 py-2.5 font-medium">숨김여부</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr
                  key={t.id}
                  onClick={() => select(t)}
                  className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 ${selectedId === t.id ? "bg-primary-light/40" : ""}`}
                >
                  <td className="px-3 py-2.5 text-muted">{i + 1}</td>
                  <td className="px-3 py-2.5 text-muted">{entityName(t.businessEntityId)}</td>
                  <td className="px-3 py-2.5 text-muted">{siteName(t.siteId)}</td>
                  <td className="px-3 py-2.5 text-muted">{t.docType}</td>
                  <td className="px-3 py-2.5 text-ink">{t.templateName}</td>
                  <td className="px-3 py-2.5 text-muted">{t.reportFormat || "-"}</td>
                  <td className="px-3 py-2.5 text-muted">{t.visibility}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-xs text-muted">
                    등록된 리포트가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card className="space-y-3 p-4">
            <p className="text-sm font-semibold text-ink">센터별리포트 &gt; 상세</p>
            <div className="grid grid-cols-2 gap-3">
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
                <span className="mb-1.5 block text-xs font-medium text-muted">센터 *</span>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.siteId} onChange={(e) => setForm((f) => ({ ...f, siteId: e.target.value }))}>
                  <option value="">선택</option>
                  {workSites.filter((s) => !form.businessEntityId || s.businessEntityId === form.businessEntityId).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">양식유형 *</span>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.docType} onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value, reportFormat: "" }))}>
                  {DOC_TYPES.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">템플릿명 *</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.templateName} onChange={(e) => setForm((f) => ({ ...f, templateName: e.target.value }))} />
              </label>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">숨김여부</span>
              <div className="flex flex-nowrap items-center gap-3 overflow-x-auto text-sm">
                {["숨김", "보임"].map((v) => (
                  <label key={v} className="flex items-center gap-1.5">
                    <input type="radio" checked={form.visibility === v} onChange={() => setForm((f) => ({ ...f, visibility: v }))} />
                    {v}
                  </label>
                ))}
                <Button size="sm" variant="outline" onClick={save}>
                  적용
                </Button>
              </div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">리포트양식명 *</span>
              <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.reportFormat} onChange={(e) => setForm((f) => ({ ...f, reportFormat: e.target.value }))}>
                  <option value="">선택</option>
                  {(FORM_NAMES[form.docType] || []).map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                <Button size="sm" variant="outline" type="button">
                  <Eye size={13} /> 보기
                </Button>
              </div>
            </label>
            <p className="text-[11px] text-muted">문서의 유형과 양식을 선택하여 리포트 템플릿을 생성합니다. 문서 견본은 [보기] 버튼으로 확인할 수 있습니다.</p>
            <div className="flex flex-nowrap items-center justify-end gap-2 overflow-x-auto border-t border-slate-100 pt-3">
              <Button variant="outline" onClick={remove} disabled={!selectedId}>
                삭제
              </Button>
              <Button variant="outline" onClick={openCopy} disabled={!selectedId}>
                복사
              </Button>
              <Button onClick={save}>저장</Button>
            </div>
          </Card>

          <Card className="flex items-center justify-center p-4">
            <div className="flex h-full min-h-[220px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 text-center text-xs text-muted">
              <p className="mb-1 font-semibold text-ink">{form.reportFormat || "문서 미리보기"}</p>
              <p>[보기] 버튼을 눌러 선택한 리포트양식의 문서 견본을 확인하세요.</p>
            </div>
          </Card>
        </div>
      </Panel>

      <Modal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="리포트 복사"
        footer={
          <>
            <Button variant="outline" onClick={() => setCopyOpen(false)}>
              취소
            </Button>
            <Button onClick={doCopy}>복사</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl bg-primary-light/40 px-3.5 py-2.5 text-xs text-primary">
            복사조건: #사업자 {entityName(form.businessEntityId)} #센터 {siteName(form.siteId)} #양식유형 {form.docType} #템플릿명 {form.templateName}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
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
              <span className="mb-1.5 block text-xs font-medium text-muted">센터 *</span>
              <select className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={copyForm.siteId} onChange={(e) => setCopyForm((f) => ({ ...f, siteId: e.target.value }))}>
                <option value="">선택</option>
                {workSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">템플릿명 *</span>
            <input className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={copyForm.templateName} onChange={(e) => setCopyForm((f) => ({ ...f, templateName: e.target.value }))} />
          </label>
          <p className="text-[11px] text-muted">다른 센터에 적용이 필요할 경우 사업자, 센터를 지정하여 복사 할 수 있습니다.</p>
        </div>
      </Modal>
    </div>
  );
}
