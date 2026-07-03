import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { Building2, FileSignature, Wallet, CalendarClock } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";

const MENU = [
  { to: "/contracts", label: "계약관리", icon: FileSignature, bg: "bg-purple-500" },
  { to: "/payslips", label: "급여관리", icon: Wallet, bg: "bg-primary" },
  { to: "/leave", label: "휴가신청관리", icon: CalendarClock, bg: "bg-emerald-500" },
];

export default function WorkInfoPage() {
  const { profile, user } = useAuth();
  const [workSite, setWorkSite] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeForm, setChangeForm] = useState({ siteId: "", vendorId: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!profile?.workSiteId) return;
    getDoc(doc(db, "workSites", profile.workSiteId)).then((snap) => {
      if (snap.exists()) setWorkSite({ id: snap.id, ...snap.data() });
    });
  }, [profile?.workSiteId]);

  useEffect(() => {
    if (!profile?.vendorId) return;
    getDoc(doc(db, "vendors", profile.vendorId)).then((snap) => {
      if (snap.exists()) setVendor({ id: snap.id, ...snap.data() });
    });
  }, [profile?.vendorId]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubSites = onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) =>
      setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubVendors = onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (snap) =>
      setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubSites();
      unsubVendors();
    };
  }, [profile?.companyId]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "assignmentChangeRequests"), where("uid", "==", user.uid)),
      (snap) => setChangeRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [user]);

  const pendingRequest = useMemo(() => changeRequests.find((r) => r.status === "pending"), [changeRequests]);

  const openChangeModal = () => {
    setChangeForm({ siteId: profile?.workSiteId || "", vendorId: profile?.vendorId || "", reason: "" });
    setChangeOpen(true);
  };

  const submitChangeRequest = async (e) => {
    e.preventDefault();
    if (!changeForm.siteId) return;
    setSubmitting(true);
    const requestedSite = workSites.find((s) => s.id === changeForm.siteId);
    const requestedVendor = vendors.find((v) => v.id === changeForm.vendorId);
    await addDoc(collection(db, "assignmentChangeRequests"), {
      companyId: profile.companyId,
      uid: user.uid,
      name: profile.name,
      currentSiteId: profile.workSiteId || null,
      currentSiteName: workSite?.name || "",
      requestedSiteId: changeForm.siteId,
      requestedSiteName: requestedSite?.name || "",
      requestedVendorId: changeForm.vendorId || null,
      requestedVendorName: requestedVendor?.name || "",
      reason: changeForm.reason,
      status: "pending",
      createdAt: serverTimestamp(),
    });
    setSubmitting(false);
    setChangeOpen(false);
  };

  return (
    <div className="space-y-4 px-4 pt-4">
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Building2 size={16} className="text-primary" />
            출근조직
          </div>
          {pendingRequest ? (
            <Badge tone="warning">변경 승인대기</Badge>
          ) : (
            <button className="text-xs font-medium text-primary" onClick={openChangeModal}>
              변경
            </button>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-sm text-ink">{workSite?.name || "배정된 근무지가 없습니다"}</p>
          {vendor && <p className="text-xs text-muted">{vendor.name}</p>}
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 p-4">
          <p className="mb-2 text-xs font-semibold text-muted">급여정보</p>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted">예금주</span>
              <span className="text-ink">{profile?.name || "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">은행</span>
              <span className="text-ink">{profile?.bankName || "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">계좌번호</span>
              <span className="text-ink">{profile?.bankAccount || "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">주소</span>
              <span className="text-ink">{workSite?.address || "-"}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {MENU.map(({ to, label, icon: Icon, bg }) => (
          <Link
            key={to}
            to={to}
            className={`flex flex-col items-center justify-center gap-2 rounded-2xl ${bg} p-4 text-center text-white shadow-card`}
          >
            <Icon size={22} />
            <p className="text-xs font-semibold">{label}</p>
          </Link>
        ))}
      </div>

      <Modal
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        title="배정변경 요청"
        footer={
          <>
            <Button variant="outline" onClick={() => setChangeOpen(false)}>
              취소
            </Button>
            <Button onClick={submitChangeRequest} disabled={submitting || !changeForm.siteId}>
              {submitting ? "요청 중..." : "요청"}
            </Button>
          </>
        }
      >
        <form onSubmit={submitChangeRequest} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">희망 근무지</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={changeForm.siteId}
              onChange={(e) => setChangeForm((f) => ({ ...f, siteId: e.target.value }))}
            >
              <option value="">선택</option>
              {workSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">희망 소속업체</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={changeForm.vendorId}
              onChange={(e) => setChangeForm((f) => ({ ...f, vendorId: e.target.value }))}
            >
              <option value="">선택 안 함</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사유</span>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              rows={2}
              value={changeForm.reason}
              onChange={(e) => setChangeForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </label>
        </form>
      </Modal>
    </div>
  );
}
