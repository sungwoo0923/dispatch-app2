import { useEffect, useState } from "react";
import {
  doc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Rocket, X, ChevronRight, ChevronLeft, Check, Plus } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";

export default function OnboardingWidget() {
  const { profile, user } = useAuth();
  const [company, setCompany] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [shiftTemplates, setShiftTemplates] = useState([]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);

  const [bizRegNo, setBizRegNo] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [siteForm, setSiteForm] = useState({ name: "", lat: "", lng: "", radiusM: 100, vendorIds: [] });
  const [shiftForm, setShiftForm] = useState({ name: "", startTime: "09:00", endTime: "18:00" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(doc(db, "companies", profile.companyId), (snap) => {
        if (!snap.exists()) return;
        setCompany({ id: snap.id, ...snap.data() });
        setBizRegNo((prev) => (prev ? prev : snap.data().bizRegNo || ""));
      }),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (snap) =>
        setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) =>
        setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "shiftTemplates"), where("companyId", "==", profile.companyId)), (snap) =>
        setShiftTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  if (profile?.onboardingDismissed) return null;

  const steps = [
    { key: "biz", label: "사업자 정보 입력하기", done: Boolean(company?.bizRegNo) },
    { key: "vendor", label: "소속업체 등록하기", done: vendors.length > 0 },
    { key: "site", label: "센터 등록하기", done: workSites.length > 0 },
    { key: "shift", label: "근무시간대 등록하기", done: shiftTemplates.length > 0 },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const dismiss = () => updateDoc(doc(db, "users", user.uid), { onboardingDismissed: true });

  const saveBizRegNo = () => updateDoc(doc(db, "companies", profile.companyId), { bizRegNo: bizRegNo.trim() });

  const addVendor = async () => {
    if (!vendorName.trim()) return;
    await addDoc(collection(db, "vendors"), {
      companyId: profile.companyId,
      name: vendorName.trim(),
      createdAt: serverTimestamp(),
    });
    setVendorName("");
  };

  const toggleSiteVendor = (id) =>
    setSiteForm((f) => ({
      ...f,
      vendorIds: f.vendorIds.includes(id) ? f.vendorIds.filter((v) => v !== id) : [...f.vendorIds, id],
    }));

  const addSite = async () => {
    if (!siteForm.name.trim() || !siteForm.lat || !siteForm.lng) return;
    await addDoc(collection(db, "workSites"), {
      companyId: profile.companyId,
      name: siteForm.name.trim(),
      lat: parseFloat(siteForm.lat),
      lng: parseFloat(siteForm.lng),
      radiusM: Number(siteForm.radiusM) || 100,
      vendorIds: siteForm.vendorIds,
      createdAt: serverTimestamp(),
    });
    setSiteForm({ name: "", lat: "", lng: "", radiusM: 100, vendorIds: [] });
  };

  const addShiftTemplate = async () => {
    if (!shiftForm.name.trim()) return;
    await addDoc(collection(db, "shiftTemplates"), { companyId: profile.companyId, ...shiftForm });
    setShiftForm({ name: "", startTime: "09:00", endTime: "18:00" });
  };

  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "";

  return (
    <>
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light text-primary">
          <Rocket size={20} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink">초간단 시작 가이드</p>
          <p className="text-xs text-muted">회사구조 세팅하기 ({doneCount}/{steps.length})</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setStep(steps.findIndex((s) => !s.done) + 1 || 1);
              setOpen(true);
            }}
          >
            가이드 보기
          </Button>
          <button onClick={dismiss} className="text-muted hover:text-ink" title="닫기">
            <X size={18} />
          </button>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${steps[step - 1].label} [${step}/${steps.length}]`}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between">
            <Button variant="outline" disabled={step === 1} onClick={() => setStep((s) => s - 1)}>
              <ChevronLeft size={15} /> 이전
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                닫기
              </Button>
              {step < steps.length ? (
                <Button onClick={() => setStep((s) => s + 1)}>
                  다음 <ChevronRight size={15} />
                </Button>
              ) : (
                <Button onClick={() => setOpen(false)}>완료</Button>
              )}
            </div>
          </div>
        }
      >
        {step === 1 && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">회사명</span>
              <input disabled className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-muted" value={company?.name || ""} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">사업자등록번호</span>
              <div className="flex gap-2">
                <input
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={bizRegNo}
                  onChange={(e) => setBizRegNo(e.target.value)}
                  placeholder="000-00-00000"
                />
                <Button onClick={saveBizRegNo}>저장</Button>
              </div>
            </label>
            <p className="text-[11px] text-muted">회사는 KP-work 계정당 1개로 관리됩니다. 계열사가 여러 개라면 관리자 계정을 각각 개설해주세요.</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-xs text-muted">소속업체는 근무지(센터)에 소속되는 조직 단위입니다. 파견처럼 소속이 자주 바뀌는 환경에서도 실제 근무지를 기준으로 정확히 관리할 수 있도록 도와줍니다.</p>
            <div className="flex gap-2">
              <input
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="예: 후레쉬퍼스트1공장"
              />
              <Button onClick={addVendor}>
                <Plus size={15} /> 추가
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {vendors.map((v) => (
                <Badge key={v.id} tone="primary">
                  {v.name}
                </Badge>
              ))}
              {vendors.length === 0 && <p className="text-xs text-muted">등록된 소속업체가 없습니다.</p>}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-xs text-muted">센터는 근무지 단위로, 반경 자동출근의 기준이 됩니다.</p>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">센터명</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={siteForm.name}
                onChange={(e) => setSiteForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="예: 후레쉬2공장"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">위도(lat)</span>
                <input
                  type="number"
                  step="any"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={siteForm.lat}
                  onChange={(e) => setSiteForm((f) => ({ ...f, lat: e.target.value }))}
                  placeholder="37.5665"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">경도(lng)</span>
                <input
                  type="number"
                  step="any"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={siteForm.lng}
                  onChange={(e) => setSiteForm((f) => ({ ...f, lng: e.target.value }))}
                  placeholder="126.9780"
                />
              </label>
            </div>
            {vendors.length > 0 && (
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted">센터에 연결할 소속업체</span>
                <div className="flex flex-wrap gap-2">
                  {vendors.map((v) => (
                    <button
                      type="button"
                      key={v.id}
                      onClick={() => toggleSiteVendor(v.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs ${
                        siteForm.vendorIds.includes(v.id) ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"
                      }`}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Button onClick={addSite} className="w-full">
              <Plus size={15} /> 센터 등록
            </Button>
            <div className="space-y-1.5">
              {workSites.map((s) => (
                <div key={s.id} className="rounded-xl bg-slate-50 px-3.5 py-2 text-xs text-ink">
                  {s.name}{" "}
                  {s.vendorIds?.length > 0 && (
                    <span className="text-muted">({s.vendorIds.map(vendorName_).join(", ")})</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <p className="text-xs text-muted">스케줄 등록 시 근무시작/종료 시각을 빠르게 선택할 수 있는 템플릿입니다.</p>
            <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">템플릿명</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={shiftForm.name}
                  onChange={(e) => setShiftForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="예: 주간조"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">시작</span>
                <input
                  type="time"
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  value={shiftForm.startTime}
                  onChange={(e) => setShiftForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">종료</span>
                <input
                  type="time"
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  value={shiftForm.endTime}
                  onChange={(e) => setShiftForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </label>
            </div>
            <Button onClick={addShiftTemplate} className="w-full">
              <Plus size={15} /> 추가
            </Button>
            <div className="space-y-1.5">
              {shiftTemplates.map((t) => (
                <div key={t.id} className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-3.5 py-2 text-xs text-ink">
                  <Check size={13} className="text-primary" />
                  {t.name} ({t.startTime} ~ {t.endTime})
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
