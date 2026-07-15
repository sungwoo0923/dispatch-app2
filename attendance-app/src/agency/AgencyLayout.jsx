import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { LogOut, ClipboardList, Wallet, Users, Building2, User, X } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import BuildInfo from "../components/BuildInfo";
import Button from "../components/Button";
import AgencyNotificationBell from "./AgencyNotificationBell";
import AgencyPendingActionCenter from "./AgencyPendingActionCenter";

const itemClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive ? "bg-primary-light text-primary" : "text-muted hover:bg-slate-50"
  }`;

function MyInfoModal({ agency, onClose }) {
  const toast = useToast();
  const [contactName, setContactName] = useState(agency?.contactName || "");
  const [phone, setPhone] = useState(agency?.phone || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "agencies", agency.id), { contactName, phone });
      toast.success("내 정보가 저장되었습니다");
      onClose();
    } catch (err) {
      toast.error(`저장에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-bold text-ink">내 정보</p>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">인력사무소명</span>
            <p className="text-sm text-ink">{agency?.name}</p>
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">연동코드</span>
            <p className="font-mono text-sm font-semibold text-primary">{agency?.id}</p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">담당자명</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">연락처</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// 외부 인력사무소(에이전시) 전용 화면 껍데기 — 도급사 관리자 화면과 완전히
// 분리되어 있고, 요청장/인원관리/회사관리/정산 메뉴만 볼 수 있다(그 외
// 데이터는 firestore.rules에서도 애초에 읽을 수 없다).
export default function AgencyLayout() {
  const { agency, logout } = useAuth();
  const [myInfoOpen, setMyInfoOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-surface">
      {agency?.id && <AgencyPendingActionCenter agencyId={agency.id} />}
      {myInfoOpen && <MyInfoModal agency={agency} onClose={() => setMyInfoOpen(false)} />}

      <aside className="hidden w-60 shrink-0 border-r border-slate-100 bg-white px-3 py-5 md:flex md:flex-col">
        <div className="mb-6 px-2">
          <img src="/logo.png" alt="KP-Work" className="h-7" />
          <p className="mt-1 truncate text-xs font-medium text-muted">{agency?.name || "인력사무소"}</p>
          {agency?.id && (
            <p className="mt-1 text-[11px] text-muted">
              연동코드 <span className="font-mono font-semibold text-primary">{agency.id}</span>
            </p>
          )}
        </div>
        <nav className="flex-1 space-y-1">
          <NavLink to="/" end className={itemClass}>
            <ClipboardList size={18} /> 요청장
          </NavLink>
          <NavLink to="/workers" className={itemClass}>
            <Users size={18} /> 인원관리
          </NavLink>
          <NavLink to="/business" className={itemClass}>
            <Building2 size={18} /> 회사관리
          </NavLink>
          <NavLink to="/settlement" className={itemClass}>
            <Wallet size={18} /> 정산
          </NavLink>
        </nav>
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted hover:bg-slate-50"
        >
          <LogOut size={18} /> 로그아웃
        </button>
        <BuildInfo className="mt-3 px-2" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3 md:hidden">
          <img src="/logo.png" alt="KP-Work" className="h-6" />
          <button type="button" onClick={logout} className="text-muted">
            <LogOut size={18} />
          </button>
        </header>
        <nav className="flex flex-wrap gap-1 border-b border-slate-100 bg-white px-3 py-2 md:hidden">
          <NavLink to="/" end className={itemClass}>
            <ClipboardList size={16} /> 요청장
          </NavLink>
          <NavLink to="/workers" className={itemClass}>
            <Users size={16} /> 인원관리
          </NavLink>
          <NavLink to="/business" className={itemClass}>
            <Building2 size={16} /> 회사관리
          </NavLink>
          <NavLink to="/settlement" className={itemClass}>
            <Wallet size={16} /> 정산
          </NavLink>
        </nav>
        <div className="flex items-center justify-end gap-1 border-b border-slate-100 bg-white px-4 py-1.5 md:px-6">
          {agency?.id && <AgencyNotificationBell agencyId={agency.id} />}
          <button
            type="button"
            onClick={() => setMyInfoOpen(true)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:bg-slate-50"
          >
            <User size={16} /> 내정보
          </button>
        </div>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
