import { useEffect, useMemo, useRef, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { FileBadge2, Plus, RefreshCw, FileSpreadsheet, Eye, Search, Upload, Scale, Stamp, Download, Printer } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Button from "../components/Button";
import Panel from "../components/Panel";
import Modal from "../components/Modal";
import SidePanel from "../components/SidePanel";
import { downloadCsv } from "../utils/exportCsv";
import { formatDate } from "../utils/dateUtils";
import { extractTextFromFile, UPLOAD_ACCEPT } from "../utils/fileTextExtract";
import { uploadBusinessEntityStamp } from "../utils/documents";
import { LABOR_LAW_CHAPTERS, LABOR_LAW_DISCLAIMER } from "../utils/laborLawText";
import { DEFAULT_EXTRA, CONTRACT_FORMAT_OPTIONS, getContractFormatDefaults, isKnownContractWage, openReportPreview } from "../utils/reportTemplates";

const DOC_TYPES = ["계약서", "사직서", "안전교육일지", "재직증명서", "퇴직증명서", "급여명세서"];
const FORM_NAMES = {
  계약서: CONTRACT_FORMAT_OPTIONS,
  사직서: ["표준사직서"],
  안전교육일지: ["TBM일지"],
  재직증명서: ["재직증명서"],
  퇴직증명서: ["퇴직증명서"],
  급여명세서: ["급여명세서"],
};
const SEARCH_FIELD_OPTIONS = [
  { value: "templateName", label: "템플릿명" },
  { value: "reportFormat", label: "리포트양식명" },
];

const REQUIRED_FIELDS = [
  { key: "businessEntityId", label: "사업자" },
  { key: "siteId", label: "센터" },
  { key: "templateName", label: "템플릿명" },
  { key: "reportFormat", label: "리포트양식명" },
];

// 업로드한 문서(txt)에서 익숙한 한글 항목명을 기준으로 다음 항목명이 나오기
// 전까지의 텍스트를 그대로 잘라 담는 휴리스틱 매칭이다. 실제 문서 구조를
// 이해하는 것이 아니라 알려진 라벨 텍스트만 인식하므로, 라벨이 다르게 표기된
// 문서(스캔 이미지, 표 구조가 다른 문서 등)는 인식하지 못할 수 있다.
const UPLOAD_SECTION_LABELS = [
  { key: "workContent", pattern: /업\s*무\s*의?\s*내\s*용/ },
  { key: "wage", pattern: /임\s*금/ },
  { key: "insurance", pattern: /사회보험/ },
  { key: "familyConsent", pattern: /가족관계/ },
  { key: "etc", pattern: /^\s*(\d+\s*[.)]\s*)?기\s*타\s*$/ },
];

function parseUploadedContractText(text) {
  const lines = text.split(/\r?\n/);
  const marks = [];
  lines.forEach((line, idx) => {
    for (const s of UPLOAD_SECTION_LABELS) {
      if (s.pattern.test(line) && !marks.some((m) => m.key === s.key)) marks.push({ key: s.key, idx });
    }
  });
  marks.sort((a, b) => a.idx - b.idx);
  const result = {};
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].idx : lines.length;
    const text_ = lines.slice(m.idx + 1, end).join("\n").trim();
    if (text_) result[m.key] = text_;
  });
  return result;
}

const emptyForm = () => ({
  businessEntityId: "",
  siteId: "",
  docType: "계약서",
  templateName: "",
  reportFormat: "",
  visibility: "보임",
  extra: { ...DEFAULT_EXTRA.계약서 },
});

const emptyDraft = () => ({
  businessEntityId: "",
  siteId: "",
  docType: "",
  searchField: "templateName",
  searchText: "",
  dateFrom: "",
  dateTo: "",
});

function fmtCreatedAt(ts) {
  if (!ts?.seconds) return "-";
  const d = new Date(ts.seconds * 1000);
  return formatDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
}

export default function CenterReports() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [entities, setEntities] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [items, setItems] = useState([]);
  const [lawOpen, setLawOpen] = useState(false);
  const fileInputRef = useRef(null);
  const stampInputRef = useRef(null);

  const [draft, setDraft] = useState(emptyDraft());
  const [applied, setApplied] = useState(emptyDraft());

  const [panelOpen, setPanelOpen] = useState(false);
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
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "admin")), (s) => setAdmins(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (s) => setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";
  const siteName = (id) => workSites.find((s) => s.id === id)?.name || "-";

  const rows = useMemo(() => {
    const a = applied;
    return items
      .filter((t) => !a.businessEntityId || t.businessEntityId === a.businessEntityId)
      .filter((t) => !a.siteId || t.siteId === a.siteId)
      .filter((t) => !a.docType || t.docType === a.docType)
      .filter((t) => !a.searchText.trim() || (t[a.searchField] || "").includes(a.searchText.trim()))
      .filter((t) => !a.dateFrom || (t.createdAt?.seconds && new Date(t.createdAt.seconds * 1000) >= new Date(a.dateFrom)))
      .filter((t) => !a.dateTo || (t.createdAt?.seconds && new Date(t.createdAt.seconds * 1000) <= new Date(a.dateTo + "T23:59:59")))
      .sort((a2, b2) => (b2.createdAt?.seconds || 0) - (a2.createdAt?.seconds || 0));
  }, [items, applied]);

  const runSearch = () => setApplied(draft);
  const resetSearch = () => {
    setDraft(emptyDraft());
    setApplied(emptyDraft());
  };

  const openNew = () => {
    setSelectedId(null);
    setForm(emptyForm());
    setPanelOpen(true);
  };
  const openEdit = (t) => {
    setSelectedId(t.id);
    setForm({ ...emptyForm(), ...t, extra: { ...DEFAULT_EXTRA[t.docType], ...t.extra } });
    setPanelOpen(true);
  };
  const closePanel = () => setPanelOpen(false);

  const setDocType = (docType) => {
    setForm((f) => ({
      ...f,
      docType,
      reportFormat: "",
      extra: { ...DEFAULT_EXTRA[docType] },
    }));
  };

  const setReportFormat = (reportFormat) => {
    setForm((f) => {
      if (f.docType !== "계약서") return { ...f, reportFormat };
      const defaults = getContractFormatDefaults(reportFormat);
      const shouldResetWage = !selectedId || isKnownContractWage(f.extra.wage);
      return {
        ...f,
        reportFormat,
        extra: {
          ...f.extra,
          wage: shouldResetWage ? defaults.wage : f.extra.wage,
          familyConsent: defaults.familyConsent ? f.extra.familyConsent || defaults.familyConsentText : "",
        },
      };
    });
  };

  const save = async () => {
    const missing = REQUIRED_FIELDS.filter((f) => !String(form[f.key] || "").trim()).map((f) => f.label);
    if (missing.length) {
      toast.error(`다음 필수 항목을 입력/선택해주세요: ${missing.join(", ")}`);
      return;
    }
    if (!(await confirm("저장하시겠습니까?", "save"))) return;
    if (selectedId) {
      await updateDoc(doc(db, "centerReports", selectedId), form);
    } else {
      await addDoc(collection(db, "centerReports"), { companyId: profile.companyId, ...form, createdAt: serverTimestamp() });
    }
    toast.success("저장되었습니다");
    closePanel();
  };
  const remove = async () => {
    if (!selectedId) return;
    if (!(await confirm("삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "centerReports", selectedId));
    toast.success("삭제되었습니다");
    closePanel();
  };

  const openCopy = () => {
    setCopyForm({ businessEntityId: form.businessEntityId, siteId: "", templateName: `${form.templateName}(복사)` });
    setCopyOpen(true);
  };
  const doCopy = async () => {
    const source = items.find((t) => t.id === selectedId);
    if (!source || !copyForm.siteId || !copyForm.templateName.trim()) return;
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
    closePanel();
  };

  const preview = (t) => {
    if (!t.reportFormat) return;
    const stampUrl = entities.find((e) => e.id === t.businessEntityId)?.stampUrl || null;
    openReportPreview(t.docType, t.reportFormat, { siteName: siteName(t.siteId), stampUrl, ...(t.extra || {}) });
  };

  const triggerUpload = () => fileInputRef.current?.click();
  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await extractTextFromFile(file);
    if (!text.trim()) {
      toast.error("이 파일 형식(한글/워드 등)에서는 텍스트를 읽어올 수 없습니다. txt/csv/pdf/엑셀 형식을 이용해주세요.");
      return;
    }
    const parsed = parseUploadedContractText(text);
    const fieldCount = Object.keys(parsed).length;
    if (fieldCount === 0) {
      toast.error("문서에서 업무의 내용/임금/사회보험/기타 등의 항목을 인식하지 못했습니다.");
      return;
    }
    setForm((f) => ({ ...f, extra: { ...f.extra, ...parsed } }));
    toast.success(`업로드한 문서에서 ${fieldCount}개 항목을 불러와 반영했습니다.`);
  };

  const triggerStampUpload = () => stampInputRef.current?.click();
  const handleUploadStamp = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !form.businessEntityId) {
      if (!form.businessEntityId) toast.error("사업자를 먼저 선택해주세요.");
      return;
    }
    try {
      const url = await uploadBusinessEntityStamp({ companyId: profile.companyId, entityId: form.businessEntityId, file });
      await updateDoc(doc(db, "businessEntities", form.businessEntityId), { stampUrl: url });
      toast.success(
        form.docType === "사직서"
          ? "도장이 등록되었습니다. 이 사업자의 사직서 대표 결재란에 자동으로 반영됩니다."
          : "도장이 등록되었습니다. 이 사업자의 계약서 문서에 자동으로 반영됩니다."
      );
    } catch (err) {
      toast.error("도장 업로드에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const downloadLaborLaw = () => {
    const text = LABOR_LAW_CHAPTERS.map(
      (ch) => `${ch.title}\n\n${ch.articles.map((a) => `${a.no} (${a.title})\n${a.text}`).join("\n\n")}`
    ).join("\n\n" + "=".repeat(40) + "\n\n");
    const blob = new Blob(["﻿" + LABOR_LAW_DISCLAIMER + "\n\n" + text], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "근로기준법.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const headers = ["사업자", "센터", "양식유형", "템플릿명", "리포트양식명", "보고서등록일", "숨김여부", "리포트종류"];
    downloadCsv(
      "센터별리포트",
      headers,
      rows.map((t) => [entityName(t.businessEntityId), siteName(t.siteId), t.docType, t.templateName, t.reportFormat, fmtCreatedAt(t.createdAt), t.visibility, "기본형"])
    );
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

        <div className="mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-1">
          <select className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={draft.businessEntityId} onChange={(e) => setDraft((f) => ({ ...f, businessEntityId: e.target.value, siteId: "" }))}>
            <option value="">사업자 전체</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <select className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={draft.siteId} onChange={(e) => setDraft((f) => ({ ...f, siteId: e.target.value }))}>
            <option value="">센터 전체</option>
            {workSites.filter((s) => !draft.businessEntityId || s.businessEntityId === draft.businessEntityId).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={draft.docType} onChange={(e) => setDraft((f) => ({ ...f, docType: e.target.value }))}>
            <option value="">양식유형 전체</option>
            {DOC_TYPES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={draft.searchField} onChange={(e) => setDraft((f) => ({ ...f, searchField: e.target.value }))}>
            {SEARCH_FIELD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="flex shrink-0 flex-nowrap overflow-hidden rounded-xl border border-slate-200">
            <input
              className="w-32 border-0 px-3 py-2 text-sm focus:outline-none"
              placeholder="검색어"
              value={draft.searchText}
              onChange={(e) => setDraft((f) => ({ ...f, searchText: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
            />
            <button type="button" onClick={runSearch} className="flex items-center gap-1 border-l border-slate-200 bg-slate-50 px-2.5 text-xs text-muted hover:bg-slate-100">
              <Search size={13} /> 조회
            </button>
          </div>
          <span className="ml-2 shrink-0 text-xs font-medium text-muted">등록일자</span>
          <input type="date" className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={draft.dateFrom} onChange={(e) => setDraft((f) => ({ ...f, dateFrom: e.target.value }))} />
          <span className="shrink-0 text-muted">~</span>
          <input type="date" className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={draft.dateTo} onChange={(e) => setDraft((f) => ({ ...f, dateTo: e.target.value }))} />
          <button type="button" className="shrink-0 rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50" onClick={resetSearch}>
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="text-xs font-medium text-muted">
            목록 {rows.length}
            <span className="ml-2 text-[11px] text-muted">* 계약서, 사직서, 안전교육일지 등의 각종 증명 문서 양식을 등록할 수 있습니다.</span>
          </p>
          <div className="flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain">
            <Button size="sm" onClick={openNew}>
              <Plus size={13} /> 신규
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <FileSpreadsheet size={13} /> 엑셀
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
          <table className="w-full min-w-[920px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-2.5 font-semibold">순번</th>
                <th className="px-3 py-2.5 font-semibold">상세</th>
                <th className="px-3 py-2.5 font-semibold">보기</th>
                <th className="px-3 py-2.5 font-semibold">사업자</th>
                <th className="px-3 py-2.5 font-semibold">센터</th>
                <th className="px-3 py-2.5 font-semibold">양식유형</th>
                <th className="px-3 py-2.5 font-semibold">템플릿명</th>
                <th className="px-3 py-2.5 font-semibold">리포트양식명</th>
                <th className="px-3 py-2.5 font-semibold">보고서등록일</th>
                <th className="px-3 py-2.5 font-semibold">숨김여부</th>
                <th className="px-3 py-2.5 font-semibold">리포트종류</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={t.id} onDoubleClick={() => openEdit(t)} className="odd:bg-white even:bg-slate-50/50 border-b border-slate-50 last:border-0 hover:bg-slate-100 cursor-pointer">
                  <td className="px-3 py-2.5 text-ink">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <button className="text-xs text-primary hover:underline" onClick={() => openEdit(t)}>
                      상세
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button className="text-xs text-primary hover:underline disabled:text-muted disabled:no-underline" disabled={!t.reportFormat} onClick={() => preview(t)}>
                      보기
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-ink">{entityName(t.businessEntityId)}</td>
                  <td className="px-3 py-2.5 text-ink">{siteName(t.siteId)}</td>
                  <td className="px-3 py-2.5 text-ink">{t.docType}</td>
                  <td className="px-3 py-2.5 text-ink">{t.templateName}</td>
                  <td className="px-3 py-2.5 text-ink">{t.reportFormat || "-"}</td>
                  <td className="px-3 py-2.5 text-ink">{fmtCreatedAt(t.createdAt)}</td>
                  <td className="px-3 py-2.5 text-ink">{t.visibility}</td>
                  <td className="px-3 py-2.5 text-ink">기본형</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-xs text-muted">
                    등록된 리포트가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <SidePanel
        open={panelOpen}
        onClose={closePanel}
        title="센터별리포트 > 상세"
        footer={
          <>
            {selectedId && (
              <Button variant="outline" onClick={remove}>
                삭제
              </Button>
            )}
            {selectedId && (
              <Button variant="outline" onClick={openCopy}>
                복사
              </Button>
            )}
            <Button onClick={save}>저장</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">
                사업자 <span className="text-danger">필수</span>
              </span>
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
              <span className="mb-1.5 block text-xs font-medium text-muted">
                센터 <span className="text-danger">필수</span>
              </span>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">리포트 종류</span>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-muted">기본리포트</div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">
                양식유형 <span className="text-danger">필수</span>
              </span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.docType} onChange={(e) => setDocType(e.target.value)}>
                {DOC_TYPES.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">
                템플릿명 <span className="text-danger">필수</span>
              </span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.templateName} onChange={(e) => setForm((f) => ({ ...f, templateName: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">
                리포트양식명 <span className="text-danger">필수</span>
              </span>
              <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain">
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.reportFormat} onChange={(e) => setReportFormat(e.target.value)}>
                  <option value="">선택</option>
                  {(FORM_NAMES[form.docType] || []).map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  disabled={!form.reportFormat}
                  onClick={() =>
                    openReportPreview(form.docType, form.reportFormat, {
                      siteName: siteName(form.siteId),
                      stampUrl: entities.find((e) => e.id === form.businessEntityId)?.stampUrl || null,
                      ...form.extra,
                    })
                  }
                >
                  <Eye size={13} /> 보기
                </Button>
              </div>
            </label>
          </div>

          {(form.docType === "계약서" || form.docType === "사직서") && (
            <div>
              <input ref={stampInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadStamp} />
              {form.docType === "계약서" && (
                <input ref={fileInputRef} type="file" accept={UPLOAD_ACCEPT} className="hidden" onChange={handleUploadFile} />
              )}
              <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain">
                {form.docType === "계약서" && (
                  <Button size="sm" variant="outline" type="button" onClick={triggerUpload}>
                    <Upload size={13} /> 양식 업로드
                  </Button>
                )}
                <Button size="sm" variant="outline" type="button" onClick={triggerStampUpload}>
                  <Stamp size={13} /> 도장 업로드
                </Button>
                {form.docType === "계약서" && (
                  <Button size="sm" variant="outline" type="button" onClick={() => setLawOpen(true)}>
                    <Scale size={13} /> 근로기준법
                  </Button>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                {form.docType === "계약서" ? (
                  <>
                    txt/csv/pdf/엑셀 형식의 다른 표준근로계약서 문서를 업로드하면 업무의 내용/임금/사회보험/기타 항목을 인식해 아래 내용에 반영합니다. (한글(hwp)·워드 문서는 이 앱에서 텍스트 추출을 지원하지 않습니다)
                    <br />
                    도장 업로드는 선택한 사업자의 인감으로 등록되어, 이 사업자의 계약서 문서에서 대표자 서명란에 자동으로 표시됩니다.
                  </>
                ) : (
                  "도장 업로드는 선택한 사업자의 인감으로 등록되어, 사직서 결재 시 대표 결재란에 자동으로 표시되고 대표 결재가 자동 승인 처리됩니다. 도장을 등록하지 않으면 기존처럼 대표가 직접 결재해야 합니다."
                )}
              </p>
            </div>
          )}

          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">숨김여부</span>
            <div className="flex flex-nowrap items-center gap-3 overflow-x-auto overscroll-x-contain text-sm">
              {["숨김", "보임"].map((v) => (
                <label key={v} className="flex items-center gap-1.5">
                  <input type="radio" checked={form.visibility === v} onChange={() => setForm((f) => ({ ...f, visibility: v }))} />
                  {v}
                </label>
              ))}
            </div>
          </div>

          {form.docType === "계약서" && (
            <>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">업무의 내용</span>
                <textarea
                  rows={2}
                  maxLength={300}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.extra.workContent}
                  onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, workContent: e.target.value } }))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">임금</span>
                <textarea
                  rows={6}
                  maxLength={2000}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.extra.wage}
                  onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, wage: e.target.value } }))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">사회보험 적용여부</span>
                <textarea
                  rows={2}
                  maxLength={100}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.extra.insurance}
                  onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, insurance: e.target.value } }))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">기타</span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.extra.etc}
                  onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, etc: e.target.value } }))}
                />
              </label>
              {getContractFormatDefaults(form.reportFormat).familyConsent && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">가족관계증명서 및 동의서</span>
                  <textarea
                    rows={3}
                    maxLength={1000}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.extra.familyConsent}
                    onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, familyConsent: e.target.value } }))}
                  />
                </label>
              )}
            </>
          )}

          {form.docType === "안전교육일지" && (
            <>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">교육시간(분단위)</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.extra.eduMinutes} onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, eduMinutes: e.target.value } }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">주의사항</span>
                <textarea rows={5} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.extra.cautions} onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, cautions: e.target.value } }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">교육구분</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.extra.eduCategory} onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, eduCategory: e.target.value } }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">특이사항</span>
                <textarea rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.extra.special} onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, special: e.target.value } }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">교육내용</span>
                <textarea rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.extra.eduContent} onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, eduContent: e.target.value } }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">금일 주요작업</span>
                <textarea rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.extra.mainWork} onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, mainWork: e.target.value } }))} />
              </label>
              <div className="border-t border-slate-100 pt-3">
                <p className="mb-2 text-sm font-semibold text-ink">결재자 정보</p>
                <p className="mb-1.5 text-xs font-medium text-muted">결재 순서 선택</p>
                <div className="grid grid-cols-4 gap-3">
                  {[0, 1, 2, 3].map((idx) => (
                    <ApproverPicker
                      key={idx}
                      index={idx}
                      value={form.extra.approvers[idx] || ""}
                      people={[...admins, ...employees]}
                      onChange={(name) =>
                        setForm((f) => {
                          const approvers = [...f.extra.approvers];
                          approvers[idx] = name;
                          return { ...f, extra: { ...f.extra, approvers } };
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </SidePanel>

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

      <Modal
        open={lawOpen}
        onClose={() => setLawOpen(false)}
        title="근로기준법"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={downloadLaborLaw}>
              <Download size={14} /> 다운로드
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer size={14} /> 인쇄
            </Button>
            <Button onClick={() => setLawOpen(false)}>닫기</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-primary-light/40 px-3.5 py-2.5 text-xs leading-relaxed text-primary">{LABOR_LAW_DISCLAIMER}</p>
          {LABOR_LAW_CHAPTERS.map((ch) => (
            <div key={ch.title}>
              <p className="mb-2 text-sm font-bold text-ink">{ch.title}</p>
              <div className="space-y-2.5">
                {ch.articles.map((a) => (
                  <div key={a.no} className="rounded-lg border border-slate-100 p-3">
                    <p className="mb-1 text-xs font-semibold text-ink">
                      {a.no} ({a.title})
                    </p>
                    <p className="whitespace-normal text-xs leading-relaxed text-muted">{a.text}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

// 이름을 입력하고 조회하면 관리자/근로자 중 일치하는 사람의 이름/직급/부서를
// 보여주는 팝업에서 적용을 눌러 결재자로 지정한다. 직접입력도 가능하도록
// 입력창 값 자체를 그대로 onChange로 흘려보낸다.
function ApproverPicker({ index, value, onChange, people }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState(null);

  useEffect(() => setQuery(value || ""), [value]);

  const doSearch = () => {
    const q = query.trim();
    if (!q) return;
    setMatches(people.filter((p) => p.name?.includes(q)));
    setOpen(true);
  };

  const apply = (person) => {
    onChange(person.name);
    setQuery(person.name);
    setOpen(false);
  };

  return (
    <div className="relative">
      <span className="mb-1 block text-xs text-muted">{index + 1}순위</span>
      <div className="flex flex-nowrap overflow-hidden rounded-lg border border-slate-200">
        <input
          className="w-full min-w-0 border-0 px-2.5 py-2 text-sm focus:outline-none"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
          }}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          placeholder="이름 입력"
        />
        <button type="button" className="shrink-0 border-l border-slate-200 bg-slate-50 px-2 text-muted hover:bg-slate-100" onClick={doSearch}>
          <Search size={13} />
        </button>
      </div>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-2.5 shadow-lg">
          {(matches || []).length === 0 ? (
            <>
              <p className="py-2 text-center text-xs text-muted">조회결과가 없습니다.</p>
              <div className="flex justify-end">
                <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs text-muted hover:bg-slate-50" onClick={() => setOpen(false)}>
                  닫기
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              {matches.map((p) => (
                <div key={p.id} className="rounded-lg border border-slate-100 p-2 text-xs">
                  <p className="font-semibold text-ink">{p.name}</p>
                  <p className="text-muted">
                    {p.position || "-"} · {p.team || "-"}
                  </p>
                  <div className="mt-1.5 flex justify-end gap-1.5">
                    <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-muted hover:bg-slate-50" onClick={() => setOpen(false)}>
                      취소
                    </button>
                    <button type="button" className="rounded-md bg-primary px-2 py-1 text-white hover:bg-primary-dark" onClick={() => apply(p)}>
                      적용
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
