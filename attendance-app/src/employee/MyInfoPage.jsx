import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { doc, updateDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { FolderOpen, ShieldCheck, ChevronRight, LogOut, UserRound, Search, Lock, Send, Globe, Bell } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useLanguage } from "../hooks/useLanguage";
import { usePushNotifications, describePushFailure } from "../hooks/usePushNotifications";
import { useMyInfoBadges } from "../hooks/useMyInfoBadges";
import Card from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import BuildInfo from "../components/BuildInfo";
import BiometricSettingsCard from "../components/BiometricSettingsCard";
import { shouldLockInsteadOfSignOut, lockDevice } from "../utils/biometricAuth";
import { BANK_OPTIONS } from "../constants/hr";
import { formatResidentNumber } from "../utils/phoneAuth";
import { openAddressSearch } from "../utils/daumPostcode";

const ITEMS = [
  { to: "/documents", labelKey: "myInfo.documents", icon: FolderOpen, badgeKey: "documents" },
  { to: "/safety", labelKey: "myInfo.safety", icon: ShieldCheck, badgeKey: "safety" },
  { to: "/safety/archive", labelKey: "myInfo.safetyArchive", icon: ShieldCheck, badgeKey: "safetyArchive" },
];

const EMPTY_BASIC = {
  externalId: "",
  residentNumberFront: "",
  address: "",
  addressDetail: "",
  bankName: "",
  bankAccount: "",
  accountHolder: "",
};

const FIELD_LABEL_KEYS = {
  residentNumberFront: "myInfo.residentNumber",
  address: "myInfo.address",
  addressDetail: "myInfo.addressDetail",
  bankName: "myInfo.bankName",
  bankAccount: "myInfo.bankAccount",
  accountHolder: "myInfo.accountHolder",
};

export default function MyInfoPage() {
  const { user, profile, logout } = useAuth();
  const toast = useToast();
  const { lang, setLang, languages, t } = useLanguage();
  const push = usePushNotifications(user?.uid);
  const { counts: subItemCounts, markSeen: markSubItemSeen } = useMyInfoBadges(user?.uid, profile?.companyId);
  const [basic, setBasic] = useState(EMPTY_BASIC);
  const [saving, setSaving] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestForm, setRequestForm] = useState(EMPTY_BASIC);
  const [requestReason, setRequestReason] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [, bumpBiometric] = useState(0);
  const [basicExpanded, setBasicExpanded] = useState(false);

  // 관리자용 근로자등록 화면의 "KP-Work 앱에 가입을 하지 않은 지원자만
  // 입력합니다" 카드와 동일한 필드 — 이미 가입한 근로자는 여기서 본인이
  // 직접 입력하고, users/{uid} 문서에 그대로 저장되어 PC 화면과 연동된다.
  useEffect(() => {
    if (!profile) return;
    setBasic({
      externalId: profile.externalId || profile.phone || "",
      residentNumberFront: profile.residentNumberFront || "",
      address: profile.address || "",
      addressDetail: profile.addressDetail || "",
      bankName: profile.bankName || "",
      bankAccount: profile.bankAccount || "",
      accountHolder: profile.accountHolder || profile.name || "",
    });
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "infoChangeRequests"), where("uid", "==", user.uid), where("status", "==", "pending")),
      (snap) => setPendingRequest(snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null)
    );
    return () => unsub();
  }, [user]);

  const locked = Boolean(profile?.basicInfoSubmitted);

  const searchAddress = async (setter) => {
    const result = await openAddressSearch();
    if (result) setter((f) => ({ ...f, address: result.address }));
  };

  const saveBasic = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { ...basic, basicInfoSubmitted: true });
      toast.success(t("myInfo.basicSaved"));
      setBasicExpanded(false);
    } catch (err) {
      toast.error(`저장에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    } finally {
      setSaving(false);
    }
  };

  const openRequest = () => {
    setRequestForm(basic);
    setRequestReason("");
    setRequestOpen(true);
  };

  const submitRequest = async () => {
    setRequesting(true);
    try {
      await addDoc(collection(db, "infoChangeRequests"), {
        companyId: profile.companyId,
        uid: user.uid,
        name: profile.name,
        currentValues: basic,
        requestedValues: requestForm,
        reason: requestReason,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      toast.success(t("myInfo.requestSubmitted"));
      setRequestOpen(false);
    } catch (err) {
      toast.error(`요청에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    } finally {
      setRequesting(false);
    }
  };

  const fieldCls = "w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm disabled:bg-slate-50 disabled:text-muted";

  return (
    <div className="space-y-3 px-4 pb-2 pt-4">
      <div className="-mx-4 -mt-4 rounded-b-[32px] bg-gradient-to-br from-primary via-primary to-primary-dark px-5 pb-7 pt-6 text-white shadow-lg shadow-primary/25">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-lg font-semibold backdrop-blur">
            {profile?.name?.[0] || "K"}
          </div>
          <div>
            <p className="text-base font-bold">{profile?.name}님</p>
            <p className="text-xs text-white/75">{profile?.phone}</p>
          </div>
        </div>
      </div>

      <Card className="p-4">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Globe size={15} className="text-primary" /> {t("myInfo.language")}
        </div>
        <div className="flex overflow-hidden rounded-xl border border-slate-200">
          {languages.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                lang === l.code ? "bg-primary text-white" : "bg-white text-muted hover:bg-slate-50"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </Card>

      {push.supported && (
        <Card className="flex items-center justify-between p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Bell size={15} className="text-primary" /> {t("myInfo.push")}
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={push.enabled}
            disabled={push.loading}
            onClick={async () => {
              if (push.enabled) {
                await push.disable();
                toast.success(t("myInfo.pushOff"));
              } else {
                const res = await push.enable();
                if (res.ok) toast.success(t("myInfo.pushOn"));
                else if (res.reason === "denied") toast.error(t("myInfo.pushDenied"));
                else toast.error(describePushFailure(res.reason));
              }
            }}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${push.enabled ? "bg-primary" : "bg-slate-200"}`}
          >
            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${push.enabled ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </Card>
      )}

      <Card className="p-5">
        <button
          type="button"
          onClick={() => locked && setBasicExpanded((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <UserRound size={15} className="text-primary" /> {t("myInfo.basicInfo")}
          </p>
          {locked && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Lock size={11} /> {t("myInfo.locked")}
              <ChevronRight size={14} className={`transition-transform ${basicExpanded ? "rotate-90" : ""}`} />
            </span>
          )}
        </button>
        {(!locked || basicExpanded) && (
        <>
        <p className="mb-3 mt-1 text-xs leading-relaxed text-muted">
          {locked ? t("myInfo.lockedDesc") : t("myInfo.unlockedDesc")}
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">{t("myInfo.id")}</span>
            <input disabled className={fieldCls} value={basic.externalId} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">{t("myInfo.residentNumber")}</span>
            <input
              disabled={locked}
              className={fieldCls}
              value={basic.residentNumberFront}
              onChange={(e) => setBasic((f) => ({ ...f, residentNumberFront: formatResidentNumber(e.target.value) }))}
              placeholder={t("myInfo.residentNumberPlaceholder")}
              maxLength={14}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">{t("myInfo.address")}</span>
            <div className="flex flex-nowrap gap-2">
              <input
                readOnly
                disabled={locked}
                onClick={() => !locked && searchAddress(setBasic)}
                className={`${fieldCls} ${!locked ? "cursor-pointer bg-slate-50" : ""}`}
                value={basic.address}
                placeholder={t("myInfo.addressPlaceholder")}
              />
              {!locked && (
                <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => searchAddress(setBasic)}>
                  <Search size={13} />
                </Button>
              )}
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">{t("myInfo.addressDetail")}</span>
            <input
              disabled={locked}
              className={fieldCls}
              value={basic.addressDetail}
              onChange={(e) => setBasic((f) => ({ ...f, addressDetail: e.target.value }))}
              placeholder={t("myInfo.addressDetailPlaceholder")}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">{t("myInfo.bankName")}</span>
              <select
                disabled={locked}
                className={fieldCls}
                value={basic.bankName}
                onChange={(e) => setBasic((f) => ({ ...f, bankName: e.target.value }))}
              >
                <option value="">{t("common.select")}</option>
                {BANK_OPTIONS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">{t("myInfo.bankAccount")}</span>
              <input
                disabled={locked}
                className={fieldCls}
                value={basic.bankAccount}
                onChange={(e) => setBasic((f) => ({ ...f, bankAccount: e.target.value }))}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">{t("myInfo.accountHolder")}</span>
            <input
              disabled={locked}
              className={fieldCls}
              value={basic.accountHolder}
              onChange={(e) => setBasic((f) => ({ ...f, accountHolder: e.target.value }))}
            />
          </label>
        </div>

        {locked ? (
          pendingRequest ? (
            <div className="mt-4 rounded-xl bg-slate-50 py-2.5 text-center text-xs font-medium text-muted">
              {t("myInfo.requestPending")}
            </div>
          ) : (
            <Button variant="outline" className="mt-4 w-full" onClick={openRequest}>
              <Send size={14} /> {t("myInfo.requestEdit")}
            </Button>
          )
        ) : (
          <Button className="mt-4 w-full" onClick={saveBasic} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        )}
        </>
        )}
      </Card>

      <Card className="p-4">
        <BiometricSettingsCard uid={user.uid} label={profile?.name} onChange={() => bumpBiometric((n) => n + 1)} />
      </Card>

      {ITEMS.map(({ to, labelKey, icon: Icon, badgeKey }) => (
        <Link key={to} to={to} onClick={() => markSubItemSeen(badgeKey)}>
          <Card className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary">
                <Icon size={18} />
              </div>
              <p className="text-sm font-medium text-ink">{t(labelKey)}</p>
              {subItemCounts[badgeKey] > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                  {subItemCounts[badgeKey]}
                </span>
              )}
            </div>
            <ChevronRight size={16} className="text-muted" />
          </Card>
        </Link>
      ))}

      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          if (shouldLockInsteadOfSignOut(user?.uid)) {
            lockDevice();
            window.location.href = "/";
          } else {
            logout();
          }
        }}
      >
        <LogOut size={16} /> {shouldLockInsteadOfSignOut(user?.uid) ? t("myInfo.lock") : t("myInfo.logout")}
      </Button>
      <BuildInfo className="pt-2" />

      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title={t("myInfo.requestModalTitle")}
        footer={
          <>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitRequest} disabled={requesting}>
              {requesting ? t("common.requesting") : t("common.send")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">{t("myInfo.requestModalDesc")}</p>
          {Object.entries(FIELD_LABEL_KEYS).map(([key, labelKey]) =>
            key === "bankName" ? (
              <label key={key} className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">{t(labelKey)}</span>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={requestForm.bankName}
                  onChange={(e) => setRequestForm((f) => ({ ...f, bankName: e.target.value }))}
                >
                  <option value="">{t("common.select")}</option>
                  {BANK_OPTIONS.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
            ) : key === "address" ? (
              <label key={key} className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">{t(labelKey)}</span>
                <div className="flex flex-nowrap gap-2">
                  <input
                    readOnly
                    onClick={() => searchAddress(setRequestForm)}
                    className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm"
                    value={requestForm.address}
                    placeholder={t("myInfo.addressPlaceholder")}
                  />
                  <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => searchAddress(setRequestForm)}>
                    <Search size={13} />
                  </Button>
                </div>
              </label>
            ) : (
              <label key={key} className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">{t(labelKey)}</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={requestForm[key]}
                  onChange={(e) =>
                    setRequestForm((f) => ({
                      ...f,
                      [key]: key === "residentNumberFront" ? formatResidentNumber(e.target.value) : e.target.value,
                    }))
                  }
                />
              </label>
            )
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">{t("myInfo.requestReason")}</span>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              rows={2}
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
