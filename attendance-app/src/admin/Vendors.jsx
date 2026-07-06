import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { Building, Plus, RefreshCw, FileSpreadsheet } from "lucide-react";
import { db, storage } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import { downloadCsv } from "../utils/exportCsv";
import { formatDate, toDateKey } from "../utils/dateUtils";

const EMPTY_FORM = {
  businessEntityId: "",
  name: "",
  regNumber: "",
  managerName: "",
  managerPhone: "",
  ceoName: "",
  ceoPhone: "",
  address: "",
  businessType: "",
  registeredAt: toDateKey(),
  insuranceYN: "사용",
  memo: "",
  sameAsRegistered: false,
  certCompanyName: "",
  certCeoName: "",
  certRegNumber: "",
  certPhone: "",
  certAddress: "",
  sealImageUrl: "",
};

export default function Vendors() {
  const { profile } = useAuth();
  const [entities, setEntities] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubEntities = onSnapshot(
      query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)),
      (snap) => setEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubVendors = onSnapshot(
      query(collection(db, "vendors"), where("companyId", "==", profile.companyId)),
      (snap) => setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubEntities();
      unsubVendors();
    };
  }, [profile?.companyId]);

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";

  const rows = useMemo(
    () => vendors.filter((v) => !search || v.name?.includes(search)).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [vendors, search]
  );

  const startNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
  };

  const select = (v) => {
    setSelectedId(v.id);
    setForm({ ...EMPTY_FORM, ...v });
  };

  useEffect(() => {
    if (!form.sameAsRegistered) return;
    setForm((f) => ({
      ...f,
      certCompanyName: f.name,
      certCeoName: f.ceoName,
      certRegNumber: f.regNumber,
      certPhone: f.ceoPhone,
      certAddress: f.address,
    }));
  }, [form.sameAsRegistered, form.name, form.ceoName, form.regNumber, form.ceoPhone, form.address]);

  const uploadSeal = async (file) => {
    if (!file || !profile?.companyId) return;
    setUploading(true);
    try {
      const path = `companies/${profile.companyId}/vendorSeals/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setForm((f) => ({ ...f, sealImageUrl: url }));
    } finally {
      setUploading(false);
    }
  };

  const removeSeal = async () => {
    if (form.sealImageUrl) {
      try {
        await deleteObject(ref(storage, form.sealImageUrl));
      } catch {
        /* ignore missing object */
      }
    }
    setForm((f) => ({ ...f, sealImageUrl: "" }));
  };

  const save = async () => {
    if (!form.businessEntityId || !form.name.trim()) return;
    const { sameAsRegistered, ...payload } = form;
    if (selectedId) {
      await updateDoc(doc(db, "vendors", selectedId), payload);
    } else {
      const ref_ = await addDoc(collection(db, "vendors"), {
        companyId: profile.companyId,
        ...payload,
        createdAt: serverTimestamp(),
      });
      setSelectedId(ref_.id);
    }
  };

  const exportCsv = () => {
    const headers = ["사업자", "소속업체", "사업자등록번호", "업체담당자", "업체담당자전화번호", "업체대표자", "업체대표전화번호", "업체등록일", "4대보험"];
    downloadCsv(
      "소속업체",
      headers,
      rows.map((v) => [
        entityName(v.businessEntityId),
        v.name,
        v.regNumber || "-",
        v.managerName || "-",
        v.managerPhone || "-",
        v.ceoName || "-",
        v.ceoPhone || "-",
        v.registeredAt ? formatDate(v.registeredAt) : "-",
        v.insuranceYN || "사용",
      ])
    );
  };

  return (
    <div className="space-y-6">
      <Panel icon={Building} title="소속업체">
        <Card className="mb-4 space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">사업자</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" disabled>
                <option>전체</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">검색어</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="소속업체명 검색"
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50"
                title="새로고침"
                onClick={() => setSearch("")}
              >
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
          <table className="w-full min-w-[860px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-2.5 font-semibold">순번</th>
                <th className="px-3 py-2.5 font-semibold">상세</th>
                <th className="px-3 py-2.5 font-semibold">사업자</th>
                <th className="px-3 py-2.5 font-semibold">소속업체</th>
                <th className="px-3 py-2.5 font-semibold">사업자등록번호</th>
                <th className="px-3 py-2.5 font-semibold">업체담당자</th>
                <th className="px-3 py-2.5 font-semibold">업체담당자전화번호</th>
                <th className="px-3 py-2.5 font-semibold">업체대표</th>
                <th className="px-3 py-2.5 font-semibold">업체등록일</th>
                <th className="px-3 py-2.5 font-semibold">4대보험</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v, i) => (
                <tr key={v.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-2.5 text-muted">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <button className="text-xs text-primary hover:underline" onClick={() => select(v)}>
                      상세
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-muted">{entityName(v.businessEntityId)}</td>
                  <td className="px-3 py-2.5 text-ink">{v.name}</td>
                  <td className="px-3 py-2.5 text-muted">{v.regNumber || "-"}</td>
                  <td className="px-3 py-2.5 text-muted">{v.managerName || "-"}</td>
                  <td className="px-3 py-2.5 text-muted">{v.managerPhone || "-"}</td>
                  <td className="px-3 py-2.5 text-muted">{v.ceoName || "-"}</td>
                  <td className="px-3 py-2.5 text-muted">{v.registeredAt ? formatDate(v.registeredAt) : "-"}</td>
                  <td className="px-3 py-2.5 text-muted">{v.insuranceYN || "사용"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-xs text-muted">
                    등록된 소속업체가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold text-ink">소속업체 &gt; 상세</p>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.businessEntityId}
                    onChange={(e) => setForm((f) => ({ ...f, businessEntityId: e.target.value }))}
                  >
                    <option value="">선택</option>
                    {entities.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">소속업체 *</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">사업자등록번호</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.regNumber}
                    onChange={(e) => setForm((f) => ({ ...f, regNumber: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">업체담당자명</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.managerName}
                    onChange={(e) => setForm((f) => ({ ...f, managerName: e.target.value }))}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">업체담당자전화번호</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.managerPhone}
                    onChange={(e) => setForm((f) => ({ ...f, managerPhone: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">업체대표자명</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.ceoName}
                    onChange={(e) => setForm((f) => ({ ...f, ceoName: e.target.value }))}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">업체대표전화번호</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.ceoPhone}
                    onChange={(e) => setForm((f) => ({ ...f, ceoPhone: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">업체업종명</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.businessType}
                    onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))}
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">업체주소</span>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">업체등록일</span>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.registeredAt}
                    onChange={(e) => setForm((f) => ({ ...f, registeredAt: e.target.value }))}
                  />
                </label>
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted">4대보험사용여부</span>
                  <div className="flex flex-nowrap gap-4 overflow-x-auto text-sm">
                    {["사용", "미사용"].map((v) => (
                      <label key={v} className="flex items-center gap-1.5">
                        <input type="radio" checked={form.insuranceYN === v} onChange={() => setForm((f) => ({ ...f, insuranceYN: v }))} />
                        {v}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">비고</span>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.memo}
                  onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                />
              </label>
            </div>

            <div className="rounded-xl border border-primary-light bg-primary-light/20 p-4">
              <div className="mb-3 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
                <p className="text-sm font-semibold text-ink">증명서 발급용 정보</p>
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={form.sameAsRegistered}
                    onChange={(e) => setForm((f) => ({ ...f, sameAsRegistered: e.target.checked }))}
                  />
                  등록된 업체정보와 동일
                </label>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">직인업체명</span>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      disabled={form.sameAsRegistered}
                      value={form.certCompanyName}
                      onChange={(e) => setForm((f) => ({ ...f, certCompanyName: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">직인업체대표자명</span>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      disabled={form.sameAsRegistered}
                      value={form.certCeoName}
                      onChange={(e) => setForm((f) => ({ ...f, certCeoName: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">직인업체사업자등록번호</span>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      placeholder="대시(-)를 제외하고 입력하세요"
                      disabled={form.sameAsRegistered}
                      value={form.certRegNumber}
                      onChange={(e) => setForm((f) => ({ ...f, certRegNumber: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">직인업체전화번호</span>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      disabled={form.sameAsRegistered}
                      value={form.certPhone}
                      onChange={(e) => setForm((f) => ({ ...f, certPhone: e.target.value }))}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">직인업체주소</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    disabled={form.sameAsRegistered}
                    value={form.certAddress}
                    onChange={(e) => setForm((f) => ({ ...f, certAddress: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">직인이미지 업로드</span>
                  <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
                    <input
                      type="file"
                      accept="image/*"
                      className="w-full flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                      onChange={(e) => uploadSeal(e.target.files?.[0])}
                    />
                    {form.sealImageUrl && (
                      <label className="flex shrink-0 items-center gap-1 text-xs text-danger">
                        <input type="checkbox" onChange={removeSeal} />
                        직인이미지삭제
                      </label>
                    )}
                  </div>
                  {uploading && <p className="mt-1 text-[11px] text-muted">업로드 중...</p>}
                  {form.sealImageUrl && <img src={form.sealImageUrl} alt="직인" className="mt-2 h-14 rounded-lg border border-slate-200 bg-white" />}
                </label>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-nowrap justify-end gap-2 overflow-x-auto border-t border-slate-100 pt-3">
            <Button onClick={save}>저장</Button>
          </div>
        </Card>

        <div className="mt-4 rounded-xl bg-primary-light/40 p-3.5 text-xs leading-relaxed text-primary">
          소속업체는 근로자가 실제로 속한 고용단위로, 도급/파견/자회사/지점/대리점 등 다양한 형태로 등록할 수 있습니다.
          소속업체에서 등록된 4대보험 여부는 근로자 등록 시 자동으로 값이 셋팅되어 빠르고 정확하게 입력할 수 있습니다.
          증명서 발급정보를 등록하면 계약/사직/재직/퇴직/급여 명세서 조회 시 해당 정보가 전자문서 양식에 자동으로 반영됩니다.
        </div>
      </Panel>
    </div>
  );
}
