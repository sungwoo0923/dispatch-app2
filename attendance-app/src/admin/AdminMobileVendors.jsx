import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { Search, Plus, Trash2, Phone } from "lucide-react";
import { db, storage } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
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

// 소속업체의 모바일 전용 화면 — 카드 목록 + 등록/수정 모달. 직인이미지
// 업로드는 파일 선택창을 그대로 사용해 모바일에서도 카메라/갤러리로
// 등록 가능하다.
export default function AdminMobileVendors() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [entities, setEntities] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (s) => setEntities(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (s) => setVendors(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";
  const rows = useMemo(() => vendors.filter((v) => !search.trim() || v.name?.includes(search.trim())).sort((a, b) => (a.name || "").localeCompare(b.name || "")), [vendors, search]);

  const startNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };
  const select = (v) => {
    setSelectedId(v.id);
    setForm({ ...EMPTY_FORM, ...v });
    setFormOpen(true);
  };

  useEffect(() => {
    if (!form.sameAsRegistered) return;
    setForm((f) => ({ ...f, certCompanyName: f.name, certCeoName: f.ceoName, certRegNumber: f.regNumber, certPhone: f.ceoPhone, certAddress: f.address }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!form.businessEntityId || !form.name.trim()) return toast.error("사업자와 소속업체명을 입력해주세요.");
    const { sameAsRegistered, ...payload } = form;
    if (selectedId) {
      await updateDoc(doc(db, "vendors", selectedId), payload);
    } else {
      await addDoc(collection(db, "vendors"), { companyId: profile.companyId, ...payload, createdAt: serverTimestamp() });
    }
    toast.success("저장되었습니다");
    setFormOpen(false);
  };

  const removeVendor = async () => {
    if (!selectedId) return;
    if (!(await confirm("삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "vendors", selectedId));
    toast.success("삭제되었습니다");
    setFormOpen(false);
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">소속업체</p>
        <Button size="sm" onClick={startNew}>
          <Plus size={13} /> 등록
        </Button>
      </div>

      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="소속업체명 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">등록된 소속업체가 없습니다.</div>}
        {rows.map((v) => {
          const callPhone = v.managerPhone || v.ceoPhone;
          return (
            <button key={v.id} type="button" onClick={() => select(v)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-ink">{v.name}</span>
                  {v.sealImageUrl ? <Badge tone="success">직인등록</Badge> : <Badge tone="muted">직인미등록</Badge>}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">{entityName(v.businessEntityId)} · {v.managerName || "담당자 미입력"} · {v.registeredAt ? formatDate(v.registeredAt) : "-"}</p>
              </div>
              {callPhone && (
                <a
                  href={`tel:${callPhone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 rounded-lg p-1.5 text-primary hover:bg-primary-light"
                  aria-label="전화 걸기"
                >
                  <Phone size={16} />
                </a>
              )}
            </button>
          );
        })}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="소속업체 상세">
        <div className="space-y-4">
          <div className="space-y-3">
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.businessEntityId} onChange={(e) => setForm((f) => ({ ...f, businessEntityId: e.target.value }))}>
              <option value="">사업자 선택 *</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">소속업체 *</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">사업자등록번호</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.regNumber} onChange={(e) => setForm((f) => ({ ...f, regNumber: e.target.value }))} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">업체담당자명</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.managerName} onChange={(e) => setForm((f) => ({ ...f, managerName: e.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">담당자전화번호</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.managerPhone} onChange={(e) => setForm((f) => ({ ...f, managerPhone: e.target.value }))} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">업체대표자명</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.ceoName} onChange={(e) => setForm((f) => ({ ...f, ceoName: e.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">대표전화번호</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.ceoPhone} onChange={(e) => setForm((f) => ({ ...f, ceoPhone: e.target.value }))} />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">업체업종명</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.businessType} onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">업체주소</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">업체등록일</span>
              <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.registeredAt} onChange={(e) => setForm((f) => ({ ...f, registeredAt: e.target.value }))} />
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">4대보험사용여부</span>
              <div className="flex gap-2">
                {["사용", "미사용"].map((v) => (
                  <button key={v} type="button" onClick={() => setForm((f) => ({ ...f, insuranceYN: v }))} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${form.insuranceYN === v ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">비고</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} />
            </label>
          </div>

          <div className="space-y-3 rounded-xl border border-primary-light bg-primary-light/20 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">증명서 발급용 정보</p>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={form.sameAsRegistered} onChange={(e) => setForm((f) => ({ ...f, sameAsRegistered: e.target.checked }))} />
                업체정보와 동일
              </label>
            </div>
            <input disabled={form.sameAsRegistered} placeholder="직인업체명" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.certCompanyName} onChange={(e) => setForm((f) => ({ ...f, certCompanyName: e.target.value }))} />
            <input disabled={form.sameAsRegistered} placeholder="직인업체대표자명" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.certCeoName} onChange={(e) => setForm((f) => ({ ...f, certCeoName: e.target.value }))} />
            <input disabled={form.sameAsRegistered} placeholder="직인업체사업자등록번호" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.certRegNumber} onChange={(e) => setForm((f) => ({ ...f, certRegNumber: e.target.value }))} />
            <input disabled={form.sameAsRegistered} placeholder="직인업체전화번호" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.certPhone} onChange={(e) => setForm((f) => ({ ...f, certPhone: e.target.value }))} />
            <input disabled={form.sameAsRegistered} placeholder="직인업체주소" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.certAddress} onChange={(e) => setForm((f) => ({ ...f, certAddress: e.target.value }))} />
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">직인이미지</span>
              <input type="file" accept="image/*" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" onChange={(e) => uploadSeal(e.target.files?.[0])} />
              {uploading && <p className="mt-1 text-[11px] text-muted">업로드 중...</p>}
              {form.sealImageUrl && (
                <div className="mt-2 flex items-center gap-2">
                  <img src={form.sealImageUrl} alt="직인" className="h-14 rounded-lg border border-slate-200 bg-white" />
                  <button type="button" onClick={removeSeal} className="text-xs text-danger">삭제</button>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {selectedId && (
              <Button variant="outline" onClick={removeVendor}>
                <Trash2 size={13} /> 삭제
              </Button>
            )}
            <Button className="flex-1" onClick={save}>
              저장
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
