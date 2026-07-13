import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { Building2, FileSignature, Wallet, CalendarClock, Landmark, MapPin, ChevronRight, Phone, RefreshCw } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import Card from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { distanceMeters } from "../utils/distance";

const MENU = [
  { to: "/contracts", labelKey: "workInfo.menu.contracts", icon: FileSignature, bg: "bg-purple-500" },
  { to: "/payslips", labelKey: "workInfo.menu.payslips", icon: Wallet, bg: "bg-primary" },
  { to: "/leave", labelKey: "workInfo.menu.leave", icon: CalendarClock, bg: "bg-emerald-500" },
];

export default function WorkInfoPage() {
  const { profile, user } = useAuth();
  const { t } = useLanguage();
  const [workSite, setWorkSite] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeForm, setChangeForm] = useState({ siteId: "", vendorId: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [myLocation, setMyLocation] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [locating, setLocating] = useState(false);

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

  const refreshLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("이 기기에서는 위치 확인을 지원하지 않습니다");
      return;
    }
    setLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          updatedAt: new Date(),
        });
        setLocating(false);
      },
      (err) => {
        setLocationError(err.message || "위치를 가져오지 못했습니다");
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  };

  const distanceToSite = useMemo(() => {
    if (!myLocation || !workSite?.lat || !workSite?.lng) return null;
    return distanceMeters(myLocation.lat, myLocation.lng, workSite.lat, workSite.lng);
  }, [myLocation, workSite]);

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
    <div className="space-y-4 px-4 pb-2 pt-4">
      <div className="-mx-4 -mt-4 overflow-hidden rounded-b-[32px] bg-gradient-to-br from-primary via-primary to-primary-dark px-5 pb-8 pt-6 text-white shadow-lg shadow-primary/25">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-white/75">
            <Building2 size={14} /> {t("workInfo.org")}
          </div>
          {pendingRequest ? (
            <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white">
              {t("workInfo.changePending")}
            </span>
          ) : (
            <button className="text-xs font-semibold text-white/90 hover:text-white" onClick={openChangeModal}>
              {t("workInfo.change")}
            </button>
          )}
        </div>
        <div className="mt-2 space-y-1">
          <p className="text-2xl font-bold tracking-tight">{workSite?.name || t("workInfo.noSite")}</p>
          {vendor && <p className="text-sm font-medium text-white/75">{vendor.name}</p>}
        </div>
      </div>

      <Card className="-mt-9 p-5">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold text-muted">
          <Wallet size={13} className="text-primary" /> {t("workInfo.payInfo")}
        </p>
        <div className="divide-y divide-slate-100">
          <div className="flex items-center justify-between py-2.5 text-sm">
            <span className="flex items-center gap-2 text-muted">
              <Landmark size={14} className="text-slate-300" /> {t("workInfo.accountHolder")}
            </span>
            <span className="font-semibold text-ink">{profile?.name || "-"}</span>
          </div>
          <div className="flex items-center justify-between py-2.5 text-sm">
            <span className="flex items-center gap-2 text-muted">
              <Landmark size={14} className="text-slate-300" /> {t("workInfo.bank")}
            </span>
            <span className="font-semibold text-ink">{profile?.bankName || "-"}</span>
          </div>
          <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="flex shrink-0 items-center gap-2 text-muted">
              <Landmark size={14} className="text-slate-300" /> {t("workInfo.accountNumber")}
            </span>
            <span className="min-w-0 flex-1 truncate text-right font-semibold text-ink">{profile?.bankAccount || "-"}</span>
          </div>
          <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="flex shrink-0 items-center gap-2 text-muted">
              <MapPin size={14} className="text-slate-300" /> {t("workInfo.address")}
            </span>
            <span className="min-w-0 flex-1 truncate text-right font-semibold text-ink">{workSite?.address || "-"}</span>
          </div>
          {(workSite?.phone || vendor?.managerPhone || vendor?.ceoPhone) && (
            <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="flex shrink-0 items-center gap-2 text-muted">
                <Phone size={14} className="text-slate-300" /> {t("workInfo.contact")}
              </span>
              <span className="flex flex-wrap justify-end gap-2">
                {workSite?.phone && (
                  <a href={`tel:${workSite.phone}`} className="inline-flex items-center gap-1 rounded-full bg-primary-light px-2.5 py-1 text-xs font-semibold text-primary">
                    <Phone size={11} /> 센터
                  </a>
                )}
                {(vendor?.managerPhone || vendor?.ceoPhone) && (
                  <a
                    href={`tel:${vendor.managerPhone || vendor.ceoPhone}`}
                    className="inline-flex items-center gap-1 rounded-full bg-primary-light px-2.5 py-1 text-xs font-semibold text-primary"
                  >
                    <Phone size={11} /> 소속업체
                  </a>
                )}
              </span>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-xs font-bold text-muted">
            <MapPin size={13} className="text-primary" /> 현재 위치
          </p>
          <button
            type="button"
            onClick={refreshLocation}
            disabled={locating}
            className="inline-flex items-center gap-1 rounded-full bg-primary-light px-2.5 py-1 text-xs font-semibold text-primary disabled:opacity-60"
          >
            <RefreshCw size={12} className={locating ? "animate-spin" : undefined} /> {locating ? "확인 중..." : "위치 갱신"}
          </button>
        </div>
        {myLocation ? (
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-ink">
              위도 {myLocation.lat.toFixed(6)}, 경도 {myLocation.lng.toFixed(6)}
            </p>
            <p className="text-xs text-muted">
              정확도 약 {Math.round(myLocation.accuracy)}m
              {distanceToSite != null && ` · 근무지까지 약 ${Math.round(distanceToSite)}m`}
              {" · "}
              {myLocation.updatedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 기준
            </p>
            {myLocation.accuracy > 300 && (
              <p className="text-xs text-warning">
                위치 정확도가 낮습니다. 실제 거리와 다를 수 있어요 — 휴대폰 설정에서 위치 서비스의 "정확한 위치"를 켜거나 실외로 이동해 다시 갱신해보세요.
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted">{locationError || "위치 갱신 버튼을 눌러 현재 위치를 확인하세요"}</p>
        )}
        {locationError && myLocation && <p className="mt-1 text-xs text-danger">{locationError}</p>}
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {MENU.map(({ to, labelKey, icon: Icon, bg }) => (
          <Link
            key={to}
            to={to}
            className={`group flex flex-col items-center justify-center gap-2 rounded-2xl ${bg} p-4 text-center text-white shadow-lg shadow-black/5 transition-transform active:scale-95`}
          >
            <Icon size={22} />
            <p className="text-sm font-bold">{t(labelKey)}</p>
          </Link>
        ))}
      </div>

      <Card className="flex items-center gap-3 p-4 text-muted">
        <ChevronRight size={14} className="shrink-0" />
        <p className="text-xs">{t("workInfo.hint")}</p>
      </Card>

      <Modal
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        title={t("workInfo.changeModalTitle")}
        footer={
          <>
            <Button variant="outline" onClick={() => setChangeOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitChangeRequest} disabled={submitting || !changeForm.siteId}>
              {submitting ? t("common.requesting") : t("workInfo.request")}
            </Button>
          </>
        }
      >
        <form onSubmit={submitChangeRequest} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">{t("workInfo.requestedSite")}</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={changeForm.siteId}
              onChange={(e) => setChangeForm((f) => ({ ...f, siteId: e.target.value }))}
            >
              <option value="">{t("common.select")}</option>
              {workSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">{t("workInfo.requestedVendor")}</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={changeForm.vendorId}
              onChange={(e) => setChangeForm((f) => ({ ...f, vendorId: e.target.value }))}
            >
              <option value="">{t("workInfo.notSelected")}</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">{t("workInfo.reason")}</span>
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
