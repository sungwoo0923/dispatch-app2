import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { doc, updateDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { FolderOpen, ShieldCheck, ChevronRight, LogOut, UserRound, Search, Lock, Send, Globe, Bell } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useLanguage } from "../hooks/useLanguage";
import { usePushNotifications } from "../hooks/usePushNotifications";
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
  { to: "/documents", label: "서류함", icon: FolderOpen, badgeKey: "documents" },
  { to: "/safety", label: "안전교육", icon: ShieldCheck, badgeKey: "safety" },
  { to: "/safety/archive", label: "안전교육자료", icon: ShieldCheck, badgeKey: "safetyArchive" },
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

const FIELD_LABELS = {
  residentNumberFront: "주민/외국인번호",
  address: "주소",
  addressDetail: "상세주소",
  bankName: "급여은행",
  bankAccount: "급여계좌",
  accountHolder: "예금주",
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
      toast.success("저장되었습니다. 이후 수정이 필요하면 수정요청을 이용해주세요.");
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
      toast.success("수정요청이 접수되었습니다. 관리자 확인 후 반영됩니다.");
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
            <Bell size={15} className="text-primary" /> 푸시 알림 받기
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={push.enabled}
            disabled={push.loading}
            onClick={async () => {
              if (push.enabled) {
                await push.disable();
                toast.success("푸시 알림을 껐습니다");
              } else {
                const res = await push.enable();
                if (res.ok) toast.success("푸시 알림이 켜졌습니다");
                else if (res.reason === "denied") toast.error("알림 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요.");
                else toast.error("푸시 알림 설정에 실패했습니다.");
              }
            }}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${push.enabled ? "bg-primary" : "bg-slate-200"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${push.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
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
            <UserRound size={15} className="text-primary" /> 기본정보 입력
          </p>
          {locked && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Lock size={11} /> 수정 잠김
              <ChevronRight size={14} className={`transition-transform ${basicExpanded ? "rotate-90" : ""}`} />
            </span>
          )}
        </button>
        {(!locked || basicExpanded) && (
        <>
        <p className="mb-3 mt-1 text-xs leading-relaxed text-muted">
          {locked
            ? "최초 저장 후에는 직접 수정할 수 없습니다. 정보가 변경되었다면 아래 수정요청 버튼으로 관리자에게 요청해주세요."
            : "급여 지급 및 서류 발급에 사용되는 정보입니다. 정확히 입력 후 저장해주세요. 최초 1회만 직접 저장할 수 있고, 이후에는 수정요청을 통해서만 변경됩니다."}
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">ID</span>
            <input disabled className={fieldCls} value={basic.externalId} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">주민/외국인번호</span>
            <input
              disabled={locked}
              className={fieldCls}
              value={basic.residentNumberFront}
              onChange={(e) => setBasic((f) => ({ ...f, residentNumberFront: formatResidentNumber(e.target.value) }))}
              placeholder="주민등록번호 또는 외국인등록번호"
              maxLength={14}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">주소</span>
            <div className="flex flex-nowrap gap-2">
              <input
                readOnly
                disabled={locked}
                onClick={() => !locked && searchAddress(setBasic)}
                className={`${fieldCls} ${!locked ? "cursor-pointer bg-slate-50" : ""}`}
                value={basic.address}
                placeholder="눌러서 주소 검색"
              />
              {!locked && (
                <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => searchAddress(setBasic)}>
                  <Search size={13} />
                </Button>
              )}
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">상세주소</span>
            <input
              disabled={locked}
              className={fieldCls}
              value={basic.addressDetail}
              onChange={(e) => setBasic((f) => ({ ...f, addressDetail: e.target.value }))}
              placeholder="동/호수 등 나머지 주소"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">급여은행</span>
              <select
                disabled={locked}
                className={fieldCls}
                value={basic.bankName}
                onChange={(e) => setBasic((f) => ({ ...f, bankName: e.target.value }))}
              >
                <option value="">선택</option>
                {BANK_OPTIONS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">급여계좌</span>
              <input
                disabled={locked}
                className={fieldCls}
                value={basic.bankAccount}
                onChange={(e) => setBasic((f) => ({ ...f, bankAccount: e.target.value }))}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">예금주</span>
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
              수정요청 처리 대기중입니다
            </div>
          ) : (
            <Button variant="outline" className="mt-4 w-full" onClick={openRequest}>
              <Send size={14} /> 수정요청
            </Button>
          )
        ) : (
          <Button className="mt-4 w-full" onClick={saveBasic} disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        )}
        </>
        )}
      </Card>

      <Card className="p-4">
        <BiometricSettingsCard uid={user.uid} label={profile?.name} onChange={() => bumpBiometric((n) => n + 1)} />
      </Card>

      {ITEMS.map(({ to, label, icon: Icon, badgeKey }) => (
        <Link key={to} to={to} onClick={() => markSubItemSeen(badgeKey)}>
          <Card className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary">
                <Icon size={18} />
              </div>
              <p className="text-sm font-medium text-ink">{label}</p>
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
        <LogOut size={16} /> {shouldLockInsteadOfSignOut(user?.uid) ? "잠금" : "로그아웃"}
      </Button>
      <BuildInfo className="pt-2" />

      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="기본정보 수정요청"
        footer={
          <>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>
              취소
            </Button>
            <Button onClick={submitRequest} disabled={requesting}>
              {requesting ? "요청 중..." : "요청 보내기"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">수정하고 싶은 값으로 바꾼 뒤 요청을 보내면, 관리자가 확인 후 반영 여부를 결정합니다.</p>
          {Object.entries(FIELD_LABELS).map(([key, label]) =>
            key === "bankName" ? (
              <label key={key} className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={requestForm.bankName}
                  onChange={(e) => setRequestForm((f) => ({ ...f, bankName: e.target.value }))}
                >
                  <option value="">선택</option>
                  {BANK_OPTIONS.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
            ) : key === "address" ? (
              <label key={key} className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
                <div className="flex flex-nowrap gap-2">
                  <input
                    readOnly
                    onClick={() => searchAddress(setRequestForm)}
                    className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm"
                    value={requestForm.address}
                    placeholder="눌러서 주소 검색"
                  />
                  <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => searchAddress(setRequestForm)}>
                    <Search size={13} />
                  </Button>
                </div>
              </label>
            ) : (
              <label key={key} className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
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
            <span className="mb-1.5 block text-xs font-medium text-muted">수정 사유(선택)</span>
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
