import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { Building2, FileSignature, Wallet, CalendarClock } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";

const MENU = [
  { to: "/contracts", label: "계약관리", icon: FileSignature, bg: "bg-purple-500" },
  { to: "/payslips", label: "급여관리", icon: Wallet, bg: "bg-primary" },
  { to: "/leave", label: "휴가신청관리", icon: CalendarClock, bg: "bg-emerald-500" },
];

export default function WorkInfoPage() {
  const { profile } = useAuth();
  const [workSite, setWorkSite] = useState(null);
  const [vendor, setVendor] = useState(null);

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

  return (
    <div className="space-y-4 px-4 pt-4">
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Building2 size={16} className="text-primary" />
          출근조직
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
    </div>
  );
}
