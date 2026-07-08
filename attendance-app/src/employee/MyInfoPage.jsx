import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { FolderOpen, ShieldCheck, ChevronRight, LogOut, UserRound, Search } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Card from "../components/Card";
import Button from "../components/Button";
import BuildInfo from "../components/BuildInfo";
import { BANK_OPTIONS } from "../constants/hr";
import { formatResidentNumber } from "../utils/phoneAuth";
import { openAddressSearch } from "../utils/daumPostcode";

const ITEMS = [
  { to: "/documents", label: "서류함", icon: FolderOpen },
  { to: "/safety", label: "안전교육", icon: ShieldCheck },
  { to: "/safety/archive", label: "안전교육자료", icon: ShieldCheck },
];

const EMPTY_BASIC = { externalId: "", residentNumberFront: "", address: "", bankName: "", bankAccount: "", accountHolder: "" };

export default function MyInfoPage() {
  const { user, profile, logout } = useAuth();
  const toast = useToast();
  const [basic, setBasic] = useState(EMPTY_BASIC);
  const [saving, setSaving] = useState(false);

  // 관리자용 근로자등록 화면의 "KP-Work 앱에 가입을 하지 않은 지원자만
  // 입력합니다" 카드와 동일한 필드 — 이미 가입한 근로자는 여기서 본인이
  // 직접 입력하고, users/{uid} 문서에 그대로 저장되어 PC 화면과 연동된다.
  useEffect(() => {
    if (!profile) return;
    setBasic({
      externalId: profile.externalId || profile.phone || "",
      residentNumberFront: profile.residentNumberFront || "",
      address: profile.address || "",
      bankName: profile.bankName || "",
      bankAccount: profile.bankAccount || "",
      accountHolder: profile.accountHolder || profile.name || "",
    });
  }, [profile]);

  const searchAddress = async () => {
    const result = await openAddressSearch();
    if (result) setBasic((f) => ({ ...f, address: result.address }));
  };

  const saveBasic = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), basic);
      toast.success("저장되었습니다");
    } catch (err) {
      toast.error(`저장에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    } finally {
      setSaving(false);
    }
  };

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

      <Card className="p-5">
        <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <UserRound size={15} className="text-primary" /> 기본정보 입력
        </p>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          급여 지급 및 서류 발급에 사용되는 정보입니다. 정확히 입력 후 저장해주세요. 저장하면 관리자 화면에도 바로 반영됩니다.
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">ID</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={basic.externalId}
              onChange={(e) => setBasic((f) => ({ ...f, externalId: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">주민/외국인번호</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
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
                onClick={searchAddress}
                className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm"
                value={basic.address}
                placeholder="눌러서 주소 검색"
              />
              <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={searchAddress}>
                <Search size={13} />
              </Button>
            </div>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">급여은행</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
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
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={basic.bankAccount}
                onChange={(e) => setBasic((f) => ({ ...f, bankAccount: e.target.value }))}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">예금주</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={basic.accountHolder}
              onChange={(e) => setBasic((f) => ({ ...f, accountHolder: e.target.value }))}
            />
          </label>
        </div>
        <Button className="mt-4 w-full" onClick={saveBasic} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </Button>
      </Card>

      {ITEMS.map(({ to, label, icon: Icon }) => (
        <Link key={to} to={to}>
          <Card className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary">
                <Icon size={18} />
              </div>
              <p className="text-sm font-medium text-ink">{label}</p>
            </div>
            <ChevronRight size={16} className="text-muted" />
          </Card>
        </Link>
      ))}

      <Button variant="outline" className="w-full" onClick={logout}>
        <LogOut size={16} /> 로그아웃
      </Button>
      <BuildInfo className="pt-2" />
    </div>
  );
}
