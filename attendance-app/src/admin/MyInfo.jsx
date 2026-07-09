import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { User, Copy, LogOut, Pencil, ShieldCheck, PenLine } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Button from "../components/Button";
import Panel from "../components/Panel";
import Badge from "../components/Badge";
import BiometricSettingsCard from "../components/BiometricSettingsCard";
import { shouldLockInsteadOfSignOut, lockDevice } from "../utils/biometricAuth";
import { formatPhoneNumber } from "../utils/phoneAuth";
import { TEAM_OPTIONS, POSITION_OPTIONS } from "../constants/hr";

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-50 py-2.5 text-sm last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-ink">{value ?? "-"}</span>
    </div>
  );
}

export default function MyInfo() {
  const { user, profile, company, isSuperAdmin, logout } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ phone: profile?.phone || "", team: profile?.team || "", position: profile?.position || "" });
  const [error, setError] = useState("");
  const [, bumpBiometric] = useState(0);

  const copyCode = () => {
    if (!company?.id) return;
    navigator.clipboard?.writeText(company.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const startEdit = () => {
    setForm({ phone: profile?.phone || "", team: profile?.team || "", position: profile?.position || "" });
    setError("");
    setEditing(true);
  };

  const save = async () => {
    if (!(await confirm("수정하시겠습니까?", "edit"))) return;
    setError("");
    try {
      await updateDoc(doc(db, "users", user.uid), form);
      toast.success("수정되었습니다");
      setEditing(false);
    } catch (err) {
      setError(`저장에 실패했습니다: ${err.code || err.message}`);
    }
  };

  const doLogout = async () => {
    const lockOnly = shouldLockInsteadOfSignOut(user?.uid);
    if (!(await confirm(lockOnly ? "잠금 하시겠습니까?" : "로그아웃 하시겠습니까?", "delete"))) return;
    if (lockOnly) {
      lockDevice();
      window.location.href = "/";
      return;
    }
    await logout();
    navigate("/");
  };

  return (
    <div className="space-y-6">
      <Panel icon={User} title="내 정보">
        <div className="flex items-center gap-4 border-b border-slate-100 pb-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-light text-2xl font-bold text-primary">
            {profile?.name?.[0] || "K"}
          </div>
          <div>
            <p className="text-base font-semibold text-ink">{profile?.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone="primary">
                <ShieldCheck size={12} /> {isSuperAdmin ? "최고관리자" : profile?.groupId ? "그룹관리자" : "사이트관리자"}
              </Badge>
              {profile?.team && <Badge tone="muted">{profile.team}</Badge>}
              {profile?.position && <Badge tone="muted">{profile.position}</Badge>}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">기본 정보</p>
            {!editing && (
              <Button size="sm" variant="outline" onClick={startEdit}>
                <Pencil size={13} /> 수정
              </Button>
            )}
          </div>
          {!editing ? (
            <div>
              <InfoRow label="이메일 (로그인ID)" value={user?.email} />
              <InfoRow label="연락처" value={profile?.phone ? formatPhoneNumber(profile.phone) : "-"} />
              <InfoRow label="부서" value={profile?.team} />
              <InfoRow label="직급" value={profile?.position} />
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">연락처</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="010-0000-0000"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">부서</span>
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={form.team}
                    onChange={(e) => setForm((f) => ({ ...f, team: e.target.value }))}
                  >
                    <option value="">선택안함</option>
                    {TEAM_OPTIONS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">직급</span>
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={form.position}
                    onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                  >
                    <option value="">선택안함</option>
                    {POSITION_OPTIONS.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
              </div>
              {error && <p className="text-xs text-danger">{error}</p>}
              <div className="flex flex-nowrap justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(false)}>
                  취소
                </Button>
                <Button onClick={save}>저장</Button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-slate-100 pt-5">
          <p className="mb-2 text-sm font-semibold text-ink">소속 회사</p>
          <InfoRow label="회사명" value={company?.name} />
          <div className="flex items-center justify-between border-b border-slate-50 py-2.5 text-sm last:border-0">
            <span className="text-xs text-muted">회사코드</span>
            <button onClick={copyCode} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-ink hover:bg-slate-200">
              {company?.id} <Copy size={11} />
            </button>
          </div>
          {copied && <p className="mt-1 text-right text-xs text-primary">복사됨</p>}
        </div>

        <div className="mt-5 border-t border-slate-100 pt-5">
          <BiometricSettingsCard uid={user.uid} label={profile?.name} onChange={() => bumpBiometric((n) => n + 1)} />
        </div>

        <div className="mt-5 flex flex-nowrap items-center justify-between border-t border-slate-100 pt-5">
          <button onClick={() => navigate("/settings/admins")} className="flex items-center gap-1.5 text-xs text-muted hover:text-primary">
            <PenLine size={13} /> 내 전자서명 관리하기
          </button>
          <Button variant="danger" size="sm" onClick={doLogout}>
            <LogOut size={13} /> {shouldLockInsteadOfSignOut(user?.uid) ? "잠금" : "로그아웃"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
