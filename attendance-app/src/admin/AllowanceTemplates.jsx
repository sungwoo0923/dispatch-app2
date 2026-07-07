import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Wallet2, Plus, RefreshCw, FileSpreadsheet, Copy as CopyIcon } from "lucide-react";
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
  { key: "hourlyWage", label: "시급[원/시간] *" },
  { key: "dailyWage", label: "일급[원/일당]" },
  { key: "overtimeWage", label: "연장수당[원/시간]" },
  { key: "holidayWage", label: "휴일수당[원/시간]" },
  { key: "holidayOvertimeWage", label: "휴일연장수당[원/시간]" },
  { key: "dailyEtcAllowance", label: "일기타수당[원/일]" },
  { key: "mealAllowance", label: "식대[원/일]" },
];

const INDIVIDUAL_FIELDS = [
  { key: "weeklyAllowanceRate", label: "주휴수당지급비율[%]" },
  { key: "weeklyAllowanceHours", label: "주휴인정시작시간[시간/주]" },
  { key: "weeklyAllowanceMaxHours", label: "주휴최대인정근무시간[시간/주]" },
  { key: "overtimeRecognitionHours", label: "연장인정시간(최소실근무시간/주)" },
  { key: "baseRecognitionHours", label: "기본급인정시간(최소실근무시간/주)" },
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

export default function AllowanceTemplates() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [entities, setEntities] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyForm, setCopyForm] = useState({ businessEntityId: "", name: "" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubEntities = onSnapshot(
      query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)),
      (snap) => setEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubItems = onSnapshot(query(collection(db, "allowanceTemplates"), where("companyId", "==", profile.companyId)), (snap) =>
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubEntities();
      unsubItems();
    };
  }, [profile?.companyId]);

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";
  const rows = useMemo(
    () => items.filter((t) => !search || t.name?.includes(search)).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [items, search]
  );
  const selected = items.find((t) => t.id === selectedId) || null;

  const openNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setPanelOpen(true);
  };
  const openEdit = (t) => {
    setSelectedId(t.id);
    setForm({ ...EMPTY_FORM, ...t });
    setPanelOpen(true);
  };
  const closePanel = () => setPanelOpen(false);

  const save = async () => {
    const missing = REQUIRED_FIELDS.filter((f) => !String(form[f.key] || "").trim()).map((f) => f.label);
    if (missing.length) {
      toast.error(`다음 필수 항목을 입력/선택해주세요: ${missing.join(", ")}`);
      return;
    }
    if (!(await confirm("저장하시겠습니까?", "save"))) return;
    const payload = { ...form };
    for (const f of NUMBER_FIELDS) payload[f.key] = Number(payload[f.key] || 0);
    if (selectedId) {
      await updateDoc(doc(db, "allowanceTemplates", selectedId), payload);
    } else {
      await addDoc(collection(db, "allowanceTemplates"), { companyId: profile.companyId, ...payload, createdAt: serverTimestamp() });
    }
    toast.success("저장되었습니다");
    closePanel();
  };

  const remove = async () => {
    if (!selectedId) return;
    if (!(await confirm("삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "allowanceTemplates", selectedId));
    toast.success("삭제되었습니다");
    closePanel();
  };

  const openCopy = () => {
    setCopyForm({ businessEntityId: form.businessEntityId, name: `${form.name}(복사)` });
    setCopyOpen(true);
  };
  const doCopy = async () => {
    if (!selected || !copyForm.name.trim()) return;
    const { id, createdAt, ...rest } = selected;
    await addDoc(collection(db, "allowanceTemplates"), {
      ...rest,
      companyId: profile.companyId,
      businessEntityId: copyForm.businessEntityId || selected.businessEntityId,
      name: copyForm.name,
      createdAt: serverTimestamp(),
    });
    toast.success("복사되었습니다");
    setCopyOpen(false);
    closePanel();
  };

  const exportCsv = () => {
    const headers = ["사업자", "템플릿명", "등록일", "급여종류", "시급", "일급", "연장수당", "휴일수당", "휴일연장수당", "주휴수당비율", "주휴인정시작시간", "주휴최대인정시간", "일기타수당", "식대", "숨김여부"];
    downloadCsv(
      "수당템플릿",
      headers,
      rows.map((t) => [
        entityName(t.businessEntityId),
        t.name,
        fmtCreatedAt(t.createdAt),
        t.payType,
        t.hourlyWage,
        t.dailyWage,
        t.overtimeWage,
        t.holidayWage,
        t.holidayOvertimeWage,
        t.weeklyAllowanceRate,
        t.weeklyAllowanceHours,
        t.weeklyAllowanceMaxHours,
        t.dailyEtcAllowance,
        t.mealAllowance,
        t.visibility,
      ])
    );
  };

  return (
    <div className="space-y-6">
      <Panel icon={Wallet2} title="수당">
        <p className="mb-4 text-xs text-muted">
          사업자는 각 업체 근무자의 급여 및 수당 조건을 템플릿으로 설정할 수 있으며, 수당 조건이 동일한 경우 하나의 템플릿을 여러 센터의 근무형태에 적용할 수
          있습니다. 수당 템플릿은 신규 등록하거나 기존 템플릿을 복사해 사용할 수 있습니다.
        </p>
        <div className="mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-1">
          <span className="shrink-0 text-xs font-medium text-muted">검색조건</span>
          <span className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-muted">템플릿명</span>
          <div className="flex shrink-0 flex-nowrap overflow-hidden rounded-xl border border-slate-200">
            <input
              className="w-40 border-0 px-3 py-2 text-sm focus:outline-none"
              placeholder="템플릿명을 입력하세요."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="button" className="border-l border-slate-200 bg-slate-50 px-2.5 text-xs text-muted hover:bg-slate-100" onClick={() => setSearch("")}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="text-xs font-medium text-muted">목록 {rows.length}</p>
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
          <table className="w-full min-w-[1080px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-2.5 font-semibold">순번</th>
                <th className="px-3 py-2.5 font-semibold">상세</th>
                <th className="px-3 py-2.5 font-semibold">사업자</th>
                <th className="px-3 py-2.5 font-semibold">템플릿명</th>
                <th className="px-3 py-2.5 font-semibold">등록일</th>
                <th className="px-3 py-2.5 font-semibold">급여종류</th>
                <th className="px-3 py-2.5 font-semibold">시급[원]</th>
                <th className="px-3 py-2.5 font-semibold">일급[원]</th>
                <th className="px-3 py-2.5 font-semibold">연장수당[원]</th>
                <th className="px-3 py-2.5 font-semibold">휴일수당[원]</th>
                <th className="px-3 py-2.5 font-semibold">휴일연장수당[원]</th>
                <th className="px-3 py-2.5 font-semibold">주휴수당비율[%]</th>
                <th className="px-3 py-2.5 font-semibold">주휴인정시작시간</th>
                <th className="px-3 py-2.5 font-semibold">주휴최대인정시간</th>
                <th className="px-3 py-2.5 font-semibold">일기타수당[원]</th>
                <th className="px-3 py-2.5 font-semibold">식대[원]</th>
                <th className="px-3 py-2.5 font-semibold">숨김여부</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={t.id} onDoubleClick={() => openEdit(t)} className="odd:bg-white even:bg-slate-50/50 cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-100">
                  <td className="px-3 py-2.5 text-muted">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <button className="text-xs text-primary hover:underline" onClick={() => openEdit(t)}>
                      상세
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-muted">{entityName(t.businessEntityId)}</td>
                  <td className="px-3 py-2.5 text-ink">{t.name}</td>
                  <td className="px-3 py-2.5 text-muted">{fmtCreatedAt(t.createdAt)}</td>
                  <td className="px-3 py-2.5 text-muted">{t.payType}</td>
                  <td className="px-3 py-2.5 text-muted">{Number(t.hourlyWage || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-muted">{Number(t.dailyWage || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-muted">{Number(t.overtimeWage || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-muted">{Number(t.holidayWage || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-muted">{Number(t.holidayOvertimeWage || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-muted">{Number(t.weeklyAllowanceRate || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-muted">{Number(t.weeklyAllowanceHours || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-muted">{Number(t.weeklyAllowanceMaxHours || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-muted">{Number(t.dailyEtcAllowance || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-muted">{Number(t.mealAllowance || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-muted">{t.visibility || "보임"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={17} className="px-3 py-6 text-center text-xs text-muted">
                    등록된 수당템플릿이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-xl bg-primary-light/40 p-3.5 text-xs leading-relaxed text-primary">
          ① 주휴수당지급비율: 주휴수당을 일급기준 %로 나누어 지급할지 설정 (주휴수당 지급 비율 = 시급 * 단위시간 * 주휴수당 지급 비율)
          <br />② 연장 인정시간: 주간 시간이 일정 시간 이상 근무했을 때, 그 이후부터 연장근무로 인정되는 시간
          <br />③ 주휴최대인정시간: 주휴시간 계산 시 인정되는 최대 근무시간
          <br />④ 기본급 인정시간: 기본급이 실 근무 시간 기준 기본 인정시간 이상하여야 기본급 발생
          <br />⑤ 일기타수당: 하루 단위로 추가 수당이 붙는 경우 설정
        </div>
      </Panel>

      <SidePanel
        open={panelOpen}
        onClose={closePanel}
        title="수당 > 상세"
        footer={
          <>
            {selectedId && (
              <Button variant="outline" onClick={remove}>
                삭제
              </Button>
            )}
            {selectedId && (
              <Button variant="outline" onClick={openCopy}>
                <CopyIcon size={13} /> 복사
              </Button>
            )}
            <Button onClick={save}>저장</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
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
                템플릿명 <span className="text-danger">필수</span>
              </span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">
                급여종류 <span className="text-danger">필수</span>
              </span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.payType} onChange={(e) => setForm((f) => ({ ...f, payType: e.target.value }))}>
                {PAY_TYPE_OPTIONS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">메모</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} />
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-ink">기본정보</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {BASIC_FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">{f.label}</span>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form[f.key]}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-ink">개별정보</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {INDIVIDUAL_FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">{f.label}</span>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form[f.key]}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </SidePanel>

      <Modal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="수당 템플릿 복사"
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
            복사조건: #사업자 {entityName(form.businessEntityId)} #템플릿 {form.name}
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
