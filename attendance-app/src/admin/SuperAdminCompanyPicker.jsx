import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Search, Building2, ArrowRight } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import AuthShell from "../auth/AuthShell";
import Button from "../components/Button";
import { SUPER_ADMIN_PICK_COMPANY_KEY } from "../constants/session";

// Shown right after the super-admin authenticates (see AdminLoginPage +
// App.jsx's SUPER_ADMIN_PICK_COMPANY_KEY handoff): search by company name
// instead of needing to remember a raw 회사코드.
export default function SuperAdminCompanyPicker() {
  const { setActiveCompanyId } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "companies"), (snap) => {
      setCompanies(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // 탈퇴(이용정지)/승인대기/거절된 회사는 여기서 고를 대상이 아니다 —
  // 탈퇴 등 상태 관리는 가입자관리(PlatformCompanies.jsx)에서 별도로
  // 한다. 여기 목록에는 실제로 접속 가능한 승인된 회사만 남긴다.
  const rows = useMemo(() => {
    const approved = companies.filter((c) => (c.status || "approved") === "approved");
    const term = search.trim();
    const filtered = term ? approved.filter((c) => c.name?.includes(term) || c.id.includes(term.toUpperCase())) : approved;
    return filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [companies, search]);

  // A full navigation (not just clearing sessionStorage/state) is needed here:
  // removing the flag alone doesn't change any React state, so nothing would
  // re-render App.jsx past this picker otherwise.
  const dismiss = () => {
    sessionStorage.removeItem(SUPER_ADMIN_PICK_COMPANY_KEY);
    window.location.replace("/");
  };

  const pick = (companyId) => {
    setActiveCompanyId(companyId);
    dismiss();
  };

  return (
    <AuthShell subtitle="최고관리자" title="접속할 회사 선택">
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5">
        <Search size={16} className="text-muted" />
        <input
          autoFocus
          className="w-full text-sm outline-none"
          placeholder="회사명 또는 회사코드로 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mb-4 max-h-80 space-y-1.5 overflow-y-auto">
        {rows.map((c) => (
          <button
            key={c.id}
            onClick={() => pick(c.id)}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-100 px-3.5 py-2.5 text-left hover:border-primary hover:bg-primary-light/40"
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-muted">
                <Building2 size={15} />
              </span>
              <div className="overflow-hidden">
                <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                <p className="font-mono text-[11px] text-muted">{c.id}</p>
              </div>
            </div>
            <ArrowRight size={14} className="shrink-0 text-muted" />
          </button>
        ))}
        {rows.length === 0 && <p className="py-6 text-center text-sm text-muted">일치하는 회사가 없습니다.</p>}
      </div>

      <Button variant="outline" className="w-full" onClick={dismiss}>
        건너뛰고 내 기본 회사로 계속
      </Button>
    </AuthShell>
  );
}
