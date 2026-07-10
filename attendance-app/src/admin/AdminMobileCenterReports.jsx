import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Search, Plus, Trash2, Copy as CopyIcon, Monitor } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { formatDate } from "../utils/dateUtils";
import { DEFAULT_EXTRA, CONTRACT_FORMAT_OPTIONS, getContractFormatDefaults, isKnownContractWage } from "../utils/reportTemplates";

const DOC_TYPES = ["계약서", "사직서", "안전교육일지", "재직증명서", "퇴직증명서", "급여명세서"];
const FORM_NAMES = {
  계약서: CONTRACT_FORMAT_OPTIONS,
  사직서: ["표준사직서"],
  안전교육일지: ["TBM일지"],
  재직증명서: ["재직증명서"],
  퇴직증명서: ["퇴직증명서"],
  급여명세서: ["급여명세서"],
};
const REQUIRED_FIELDS = [
  { key: "businessEntityId", label: "사업자" },
  { key: "siteId", label: "센터" },
  { key: "templateName", label: "템플릿명" },
  { key: "reportFormat", label: "리포트양식명" },
];

const emptyForm = () => ({ businessEntityId: "", siteId: "", docType: "계약서", templateName: "", reportFormat: "", visibility: "보임", extra: { ...DEFAULT_EXTRA.계약서 } });

function fmtCreatedAt(ts) {
  if (!ts?.seconds) return "-";
  const d = new Date(ts.seconds * 1000);
  return formatDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
}

// 센터별리포트의 모바일 전용 화면 — 문서양식 카드 목록 + 등록/수정 모달.
// 파일 업로드 자동인식, 도장 업로드, 근로기준법 다운로드/인쇄, 미리보기는
// 인쇄용 문서 처리라 PC 전용으로 안내한다.
export default function AdminMobileCenterReports() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [entities, setEntities] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("전체");

  const [formOpen, setFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm());
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
    () =>
      items
        .filter((t) => docTypeFilter === "전체" || t.docType === docTypeFilter)
        .filter((t) => !search.trim() || t.templateName?.includes(search.trim()) || t.reportFormat?.includes(search.trim()))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    [items, docTypeFilter, search]
  );

  const openNew = () => {
    setSelectedId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };
  const openEdit = (t) => {
    setSelectedId(t.id);
    setForm({ ...emptyForm(), ...t, extra: { ...DEFAULT_EXTRA[t.docType], ...t.extra } });
    setFormOpen(true);
  };

  const setDocType = (docType) => setForm((f) => ({ ...f, docType, reportFormat: "", extra: { ...DEFAULT_EXTRA[docType] } }));

  const setReportFormat = (reportFormat) => {
    setForm((f) => {
      if (f.docType !== "계약서") return { ...f, reportFormat };
      const defaults = getContractFormatDefaults(reportFormat);
      const shouldResetWage = !selectedId || isKnownContractWage(f.extra.wage);
      return {
        ...f,
        reportFormat,
        extra: { ...f.extra, wage: shouldResetWage ? defaults.wage : f.extra.wage, familyConsent: defaults.familyConsent ? f.extra.familyConsent || defaults.familyConsentText : "" },
      };
    });
  };

  const save = async () => {
    const missing = REQUIRED_FIELDS.filter((f) => !String(form[f.key] || "").trim()).map((f) => f.label);
    if (missing.length) return toast.error(`다음 필수 항목을 입력/선택해주세요: ${missing.join(", ")}`);
    if (selectedId) {
      await updateDoc(doc(db, "centerReports", selectedId), form);
    } else {
      await addDoc(collection(db, "centerReports"), { companyId: profile.companyId, ...form, createdAt: serverTimestamp() });
    }
    toast.success("저장되었습니다");
    setFormOpen(false);
  };

  const remove = async () => {
    if (!selectedId) return;
    if (!(await confirm("삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "centerReports", selectedId));
    toast.success("삭제되었습니다");
    setFormOpen(false);
  };

  const openCopy = () => {
    setCopyForm({ businessEntityId: form.businessEntityId, siteId: "", templateName: `${form.templateName}(복사)` });
    setCopyOpen(true);
  };
  const doCopy = async () => {
    const source = items.find((t) => t.id === selectedId);
    if (!source || !copyForm.siteId || !copyForm.templateName.trim()) return toast.error("센터와 템플릿명을 입력해주세요.");
    const { id, createdAt, ...rest } = source;
    await addDoc(collection(db, "centerReports"), {
      ...rest,
      companyId: profile.companyId,
      businessEntityId: copyForm.businessEntityId || source.businessEntityId,
      siteId: copyForm.siteId,
      templateName: copyForm.templateName,
      createdAt: serverTimestamp(),
    });
    toast.success("복사되었습니다");
    setCopyOpen(false);
    setFormOpen(false);
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">센터별리포트</p>
        <Button size="sm" onClick={openNew}>
          <Plus size={13} /> 등록
        </Button>
      </div>

      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="템플릿명 또는 리포트양식명 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain">
        {["전체", ...DOC_TYPES].map((d) => (
          <button key={d} type="button" onClick={() => setDocTypeFilter(d)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${docTypeFilter === d ? "bg-primary text-white" : "bg-white text-muted border border-slate-200"}`}>
            {d}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">등록된 리포트 양식이 없습니다.</div>}
        {rows.map((t) => (
          <button key={t.id} type="button" onClick={() => openEdit(t)} className="flex w-full flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-ink">{t.templateName}</span>
              <Badge tone={t.visibility === "숨김" ? "muted" : "success"}>{t.visibility || "보임"}</Badge>
            </div>
            <p className="truncate text-xs text-muted">{t.docType} · {t.reportFormat}</p>
            <p className="truncate text-[11px] text-muted">{entityName(t.businessEntityId)} · {siteName(t.siteId)} · {fmtCreatedAt(t.createdAt)}</p>
          </button>
        ))}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={selectedId ? "리포트 수정" : "리포트 등록"}>
        <div className="space-y-4">
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.businessEntityId} onChange={(e) => setForm((f) => ({ ...f, businessEntityId: e.target.value, siteId: "" }))}>
            <option value="">사업자 선택 *</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.siteId} onChange={(e) => setForm((f) => ({ ...f, siteId: e.target.value }))}>
            <option value="">센터 선택 *</option>
            {workSites.filter((s) => !form.businessEntityId || s.businessEntityId === form.businessEntityId).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.docType} onChange={(e) => setDocType(e.target.value)}>
            {DOC_TYPES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">템플릿명 *</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.templateName} onChange={(e) => setForm((f) => ({ ...f, templateName: e.target.value }))} />
          </label>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.reportFormat} onChange={(e) => setReportFormat(e.target.value)}>
            <option value="">리포트양식명 선택 *</option>
            {(FORM_NAMES[form.docType] || []).map((f) => (
              <option key={f}>{f}</option>
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

          {form.docType === "계약서" && (
            <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-ink">계약서 상세</p>
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">업무의 내용</span>
                <textarea rows={2} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" value={form.extra.workContent} onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, workContent: e.target.value } }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">임금</span>
                <textarea rows={4} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs" value={form.extra.wage} onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, wage: e.target.value } }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">사회보험</span>
                <input className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" value={form.extra.insurance} onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, insurance: e.target.value } }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">기타</span>
                <textarea rows={2} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" value={form.extra.etc} onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, etc: e.target.value } }))} />
              </label>
            </div>
          )}

          {form.docType === "안전교육일지" && (
            <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-ink">안전교육일지 상세</p>
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">교육시간(분)</span>
                <input className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" value={form.extra.eduMinutes} onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, eduMinutes: e.target.value } }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">교육구분</span>
                <input className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" value={form.extra.eduCategory} onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, eduCategory: e.target.value } }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">교육내용</span>
                <textarea rows={3} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs" value={form.extra.eduContent} onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, eduContent: e.target.value } }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">주요작업</span>
                <textarea rows={2} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs" value={form.extra.mainWork} onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, mainWork: e.target.value } }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">유의사항</span>
                <textarea rows={4} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs" value={form.extra.cautions} onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, cautions: e.target.value } }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">특이사항</span>
                <textarea rows={2} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs" value={form.extra.special} onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, special: e.target.value } }))} />
              </label>
              <p className="text-[11px] text-muted">결재선(4명) 이름/직책은 PC에서 검색 선택으로 지정해주세요.</p>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs text-muted">
            <Monitor size={14} className="shrink-0" />
            문서 업로드 자동인식, 도장 등록, 양식 미리보기·인쇄·근로기준법 다운로드는 PC 화면에서 이용해주세요.
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

      <Modal open={copyOpen} onClose={() => setCopyOpen(false)} title="리포트 복사">
        <div className="space-y-3">
          <select className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={copyForm.businessEntityId} onChange={(e) => setCopyForm((f) => ({ ...f, businessEntityId: e.target.value, siteId: "" }))}>
            <option value="">사업자 선택</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <select className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={copyForm.siteId} onChange={(e) => setCopyForm((f) => ({ ...f, siteId: e.target.value }))}>
            <option value="">센터 선택 *</option>
            {workSites.filter((s) => !copyForm.businessEntityId || s.businessEntityId === copyForm.businessEntityId).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={copyForm.templateName} onChange={(e) => setCopyForm((f) => ({ ...f, templateName: e.target.value }))} />
          <Button className="w-full" onClick={doCopy}>
            복사
          </Button>
        </div>
      </Modal>
    </div>
  );
}
