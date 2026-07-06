import { useEffect, useState } from "react";
import { doc, updateDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { Building2, Plus } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Button from "../components/Button";
import Modal from "../components/Modal";

// 회사 개설 직후 한 번에 채워둘 최소 정보(사업자등록번호/소속업체/센터)를 모으는
// 단일 화면 팝업. 이전의 4단계 마법사 대신, 회사명은 이미 알고 있으니 나머지
// 항목만 한 화면에서 바로 입력하고 저장할 수 있게 한다.
export default function OnboardingWidget() {
  const { profile } = useAuth();
  const [company, setCompany] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [open, setOpen] = useState(false);

  const [bizRegNo, setBizRegNo] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [siteName, setSiteName] = useState("");

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
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const save = async () => {
    if (bizRegNo.trim()) await updateDoc(doc(db, "companies", profile.companyId), { bizRegNo: bizRegNo.trim() });
    if (vendorName.trim()) {
      await addDoc(collection(db, "vendors"), { companyId: profile.companyId, name: vendorName.trim(), createdAt: serverTimestamp() });
      setVendorName("");
    }
    if (siteName.trim()) {
      await addDoc(collection(db, "workSites"), {
        companyId: profile.companyId,
        name: siteName.trim(),
        lat: null,
        lng: null,
        radiusM: 100,
        createdAt: serverTimestamp(),
      });
      setSiteName("");
    }
    setOpen(false);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Building2 size={16} /> 내 회사 등록하기
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="내 회사 등록하기"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              닫기
            </Button>
            <Button onClick={save}>
              <Plus size={15} /> 저장
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">회사명</span>
            <input disabled className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-muted" value={company?.name || ""} />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사업자등록번호</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={bizRegNo}
              onChange={(e) => setBizRegNo(e.target.value)}
              placeholder="000-00-00000"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">소속업체</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="예: 후레쉬퍼스트1공장"
            />
            {vendors.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {vendors.map((v) => (
                  <span key={v.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-ink">
                    {v.name}
                  </span>
                ))}
              </div>
            )}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">센터명</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="예: 후레쉬2공장"
            />
            {workSites.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {workSites.map((s) => (
                  <span key={s.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-ink">
                    {s.name}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-[11px] text-muted">위치 반경(위경도)은 조직 &gt; 센터에서 나중에 설정할 수 있습니다.</p>
          </label>
        </div>
      </Modal>
    </>
  );
}
