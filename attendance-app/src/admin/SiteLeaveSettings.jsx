import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { CalendarCog, Plus, RefreshCw, Trash2 } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import { formatDate, toDateKey } from "../utils/dateUtils";

export default function SiteLeaveSettings() {
  const { profile } = useAuth();
  const [entities, setEntities] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [settings, setSettings] = useState([]);

  const [businessEntityId, setBusinessEntityId] = useState("");
  const [siteSearch, setSiteSearch] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState(null);

  const [form, setForm] = useState({ templateId: "", effectiveFrom: toDateKey(), criteriaType: "회계연도 기준" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (s) => setEntities(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "leaveTemplates"), where("companyId", "==", profile.companyId)), (s) => setTemplates(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "siteLeaveSettings"), where("companyId", "==", profile.companyId)), (s) => setSettings(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";
  const siteName = (id) => workSites.find((s) => s.id === id)?.name || "-";
  const templateName = (id) => templates.find((t) => t.id === id)?.name || "-";

  const rows = useMemo(() => {
    return workSites
      .filter((s) => !businessEntityId || s.businessEntityId === businessEntityId)
      .filter((s) => !siteSearch || s.name?.includes(siteSearch))
      .map((s) => [s.id, settings.filter((x) => x.siteId === s.id)]);
  }, [workSites, settings, businessEntityId, siteSearch]);

  const siteSettings = settings.filter((s) => s.siteId === selectedSiteId);

  const add = async () => {
    if (!selectedSiteId || !form.templateId || !form.effectiveFrom) return;
    const site = workSites.find((s) => s.id === selectedSiteId);
    await addDoc(collection(db, "siteLeaveSettings"), {
      companyId: profile.companyId,
      businessEntityId: site?.businessEntityId || "",
      siteId: selectedSiteId,
      templateId: form.templateId,
      criteriaType: form.criteriaType,
      effectiveFrom: form.effectiveFrom,
      effectiveTo: "9999-12-31",
      createdAt: serverTimestamp(),
    });
    setForm({ templateId: "", effectiveFrom: toDateKey(), criteriaType: "회계연도 기준" });
  };

  const remove = (id) => deleteDoc(doc(db, "siteLeaveSettings", id));

  return (
    <div className="space-y-6">
      <Panel icon={CalendarCog} title="센터별휴가설정">
        <p className="mb-4 text-xs text-muted">센터별로 휴가 적용 템플릿 및 조회기준 전체 리스트가 검색됩니다. 상세 클릭 시 템플릿 조회기준 날짜를 설정할 수 있습니다.</p>
        <Card className="mb-4 space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={businessEntityId} onChange={(e) => setBusinessEntityId(e.target.value)}>
                <option value="">전체</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={siteSearch} onChange={(e) => setSiteSearch(e.target.value)} placeholder="센터를 입력하세요" />
            </label>
            <div className="flex items-end gap-2">
              <button type="button" className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50" onClick={() => { setBusinessEntityId(""); setSiteSearch(""); }}>
                <RefreshCw size={16} />
              </button>
              <Button>검색</Button>
            </div>
          </div>
        </Card>

        <p className="mb-2 text-xs font-medium text-muted">목록 {rows.length}</p>
        <div className="mb-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[640px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-2.5 font-semibold">순번</th>
                <th className="px-3 py-2.5 font-semibold">상세</th>
                <th className="px-3 py-2.5 font-semibold">사업자</th>
                <th className="px-3 py-2.5 font-semibold">센터</th>
                <th className="px-3 py-2.5 font-semibold">적용템플릿 / 조회기준</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([siteId, list], i) => (
                <tr key={siteId} onClick={() => setSelectedSiteId(siteId)} className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 ${selectedSiteId === siteId ? "bg-primary-light/40" : ""}`}>
                  <td className="px-3 py-2.5 text-muted">{i + 1}</td>
                  <td className="px-3 py-2.5 text-primary">상세</td>
                  <td className="px-3 py-2.5 text-muted">{entityName(workSites.find((s) => s.id === siteId)?.businessEntityId)}</td>
                  <td className="px-3 py-2.5 text-ink">{siteName(siteId)}</td>
                  <td className="px-3 py-2.5 text-muted">
                    {list.length ? list.map((s) => `[${s.effectiveFrom}] ${templateName(s.templateId)} / ${s.criteriaType}`).join(", ") : "-"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted">
                    등록된 센터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedSiteId && (
          <Card className="space-y-3 p-4">
            <p className="text-sm font-semibold text-ink">{siteName(selectedSiteId)} &gt; 휴가설정</p>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-center text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="px-3 py-2 font-semibold">순번</th>
                    <th className="px-3 py-2 font-semibold">템플릿</th>
                    <th className="px-3 py-2 font-semibold">조회기준설정</th>
                    <th className="px-3 py-2 font-semibold">적용시점</th>
                    <th className="px-3 py-2 font-semibold">적용종료시점</th>
                    <th className="px-3 py-2 font-semibold">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {siteSettings.map((s, i) => (
                    <tr key={s.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-2 text-muted">{i + 1}</td>
                      <td className="px-3 py-2 text-ink">{templateName(s.templateId)}</td>
                      <td className="px-3 py-2 text-muted">{s.criteriaType}</td>
                      <td className="px-3 py-2 text-muted">{formatDate(s.effectiveFrom)}</td>
                      <td className="px-3 py-2 text-muted">{s.effectiveTo}</td>
                      <td className="px-3 py-2">
                        <button className="text-muted hover:text-danger" onClick={() => remove(s.id)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {siteSettings.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-xs text-muted">
                        조회 내역이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">휴가 템플릿 *</span>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.templateId} onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}>
                  <option value="">선택</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">적용시점 *</span>
                <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} />
              </label>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted">조회기준설정 *</span>
                <div className="flex flex-nowrap items-center gap-3 overflow-x-auto text-sm">
                  {["입사일 기준", "회계연도 기준"].map((v) => (
                    <label key={v} className="flex items-center gap-1.5">
                      <input type="radio" checked={form.criteriaType === v} onChange={() => setForm((f) => ({ ...f, criteriaType: v }))} />
                      {v}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end border-t border-slate-100 pt-3">
              <Button onClick={add}>
                <Plus size={13} /> 저장
              </Button>
            </div>
            <p className="text-[11px] text-muted">사업자에 대한 센터별로 휴가템플릿 설정 및 적용시점을 설정할수 있습니다. 근로자휴가관리 화면에서 입사일기준/회계연도기준에 대해서 기본 설정 할 수 있습니다.</p>
          </Card>
        )}
      </Panel>
    </div>
  );
}
