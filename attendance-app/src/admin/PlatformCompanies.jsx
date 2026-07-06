import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { KeyRound, Check, X, UserX, RotateCcw, Copy, LogIn } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import Panel from "../components/Panel";
import Button from "../components/Button";
import Badge from "../components/Badge";

const STATUS_LABEL = { pending: "승인대기", approved: "승인됨", rejected: "거절됨", suspended: "탈퇴처리됨" };
const STATUS_TONE = { pending: "warning", approved: "success", rejected: "danger", suspended: "danger" };
const FILTERS = [
  { key: "pending", label: "승인대기" },
  { key: "approved", label: "승인됨" },
  { key: "suspended", label: "탈퇴처리됨" },
  { key: "rejected", label: "거절됨" },
  { key: "all", label: "전체" },
];

function formatDate(ts) {
  if (!ts?.toDate) return "-";
  return ts.toDate().toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// 최고관리자 전용: 회사(관리자) 가입 신청을 검토(승인/거절)하고, 이미 승인된
// 회사도 필요 시 탈퇴(이용정지)/복구시킬 수 있는 관리 화면. 각 회사의 고유
// 회사코드(=Firestore 문서ID)를 그대로 노출해, 관리자 로그인 화면에서 요구하는
// 회사코드를 최고관리자가 확인할 수 있게 한다.
//
// firestore.rules 상 companies list는 isSuperAdmin()에게만 허용되므로, 여기 진입한
// 일반 관리자는 화면은 렌더링되지만 목록 쿼리 자체가 비어 온다 — 아래 Navigate 가드는
// 그 전에 UI 노출 자체를 막기 위한 추가 방어선이다.
export default function PlatformCompanies() {
  const { isSuperAdmin, setActiveCompanyId } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const unsub = onSnapshot(collection(db, "companies"), (snap) => {
      setCompanies(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [isSuperAdmin]);

  const rows = useMemo(() => {
    const withStatus = companies.map((c) => ({ ...c, status: c.status || "approved" }));
    const filtered = filter === "all" ? withStatus : withStatus.filter((c) => c.status === filter);
    return filtered.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  }, [companies, filter]);

  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const setStatus = async (companyId, status, confirmMsg) => {
    if (confirmMsg && !(await confirm(confirmMsg, status === "rejected" || status === "suspended" ? "delete" : "save"))) return;
    await updateDoc(doc(db, "companies", companyId), { status });
  };

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code);
    setCopiedId(code);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const switchTo = (companyId) => {
    setActiveCompanyId(companyId);
    navigate("/");
  };

  return (
    <Panel icon={KeyRound} title="가입자(회사) 관리">
      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key ? "bg-primary text-white" : "bg-slate-100 text-muted hover:bg-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-center text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="py-2 pr-3 font-medium">회사명</th>
              <th className="py-2 pr-3 font-medium">회사코드</th>
              <th className="py-2 pr-3 font-medium">신청자</th>
              <th className="py-2 pr-3 font-medium">연락처</th>
              <th className="py-2 pr-3 font-medium">이메일</th>
              <th className="py-2 pr-3 font-medium">신청일시</th>
              <th className="py-2 pr-3 font-medium">상태</th>
              <th className="py-2 pr-3 font-medium">처리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-slate-50">
                <td className="py-2.5 pr-3 font-medium text-ink">{c.name}</td>
                <td className="py-2.5 pr-3">
                  <button
                    onClick={() => copyCode(c.id)}
                    title="복사"
                    className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-ink hover:bg-slate-200"
                  >
                    {c.id} <Copy size={11} />
                  </button>
                  {copiedId === c.id && <span className="ml-1.5 text-xs text-primary">복사됨</span>}
                </td>
                <td className="py-2.5 pr-3">{c.applicant?.name || "-"}</td>
                <td className="py-2.5 pr-3">{c.applicant?.phone || "-"}</td>
                <td className="py-2.5 pr-3">{c.applicant?.email || "-"}</td>
                <td className="py-2.5 pr-3 text-muted">{formatDate(c.createdAt)}</td>
                <td className="py-2.5 pr-3">
                  <Badge tone={STATUS_TONE[c.status] || "muted"}>{STATUS_LABEL[c.status] || c.status}</Badge>
                </td>
                <td className="py-2.5 pr-3">
                  <div className="flex gap-1.5">
                    {c.status === "pending" && (
                      <>
                        <Button size="sm" variant="success" onClick={() => setStatus(c.id, "approved", `'${c.name}'의 개설 신청을 승인하시겠습니까?`)}>
                          <Check size={14} /> 승인
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setStatus(c.id, "rejected", "이 회사의 개설 신청을 거절하시겠습니까?")}>
                          <X size={14} /> 거절
                        </Button>
                      </>
                    )}
                    {c.status === "approved" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => switchTo(c.id)}>
                          <LogIn size={14} /> 전환
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setStatus(c.id, "suspended", `'${c.name}'을(를) 탈퇴(이용정지) 처리하시겠습니까? 소속 관리자는 즉시 로그인이 제한됩니다.`)}
                        >
                          <UserX size={14} /> 탈퇴
                        </Button>
                      </>
                    )}
                    {(c.status === "suspended" || c.status === "rejected") && (
                      <Button size="sm" variant="outline" onClick={() => setStatus(c.id, "approved", `'${c.name}'을(를) 복구하시겠습니까?`)}>
                        <RotateCcw size={14} /> 복구
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-muted">
                  해당하는 회사가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
