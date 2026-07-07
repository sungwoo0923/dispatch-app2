import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { KeyRound, Copy, LogIn, Eye, Pencil } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Panel from "../components/Panel";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Modal from "../components/Modal";

const STATUS_LABEL = { pending: "승인대기", approved: "승인됨", rejected: "거절됨", suspended: "탈퇴처리됨" };
const STATUS_TONE = { pending: "warning", approved: "success", rejected: "danger", suspended: "danger" };
const FILTERS = [
  { key: "pending", label: "승인대기" },
  { key: "approved", label: "승인됨" },
  { key: "suspended", label: "탈퇴처리됨" },
  { key: "rejected", label: "거절됨" },
  { key: "all", label: "전체" },
];
// 회사를 승인할 때 그 신청자(=창업 관리자)에게 부여할 초기 권한. 이 시점엔 아직
// 그 회사의 권한그룹(permissionGroups)이 하나도 없으므로, 세분화된 그룹이 아니라
// 이 정도의 큰 구분만 우선 제공한다 — 이후 그룹 단위 권한은 각 회사의
// 관리자 계정 화면(설정 > 관리자계정)에서 계속 다룰 수 있다.
const AUTH_LEVEL_OPTIONS = ["사이트관리자", "제한관리자"];

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
  const toast = useToast();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [copiedId, setCopiedId] = useState(null);

  const [editing, setEditing] = useState(null); // company being 수정
  const [authLevel, setAuthLevel] = useState(AUTH_LEVEL_OPTIONS[0]);
  const [viewing, setViewing] = useState(null); // company being 상세-viewed
  const [error, setError] = useState("");

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

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code);
    setCopiedId(code);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const switchTo = (companyId) => {
    setActiveCompanyId(companyId);
    navigate("/");
  };

  const openEdit = (c) => {
    setEditing(c);
    setAuthLevel(c.ownerAuthLevel || AUTH_LEVEL_OPTIONS[0]);
    setError("");
  };

  const setStatus = async (status, confirmMsg, extra = {}) => {
    if (!editing) return;
    if (!(await confirm(confirmMsg, status === "rejected" || status === "suspended" ? "delete" : "save"))) return;
    setError("");
    try {
      await updateDoc(doc(db, "companies", editing.id), { status, ...extra });
      toast.success(
        status === "approved" ? "승인되었습니다" : status === "rejected" ? "거절되었습니다" : status === "suspended" ? "탈퇴 처리되었습니다" : "처리되었습니다"
      );
      setEditing(null);
    } catch (err) {
      setError(`처리에 실패했습니다: ${err.code || err.message}`);
    }
  };

  const changeAuthOnly = async () => {
    if (!editing) return;
    if (!(await confirm(`권한을 '${authLevel}'(으)로 변경하시겠습니까?`, "edit"))) return;
    setError("");
    try {
      await updateDoc(doc(db, "companies", editing.id), { ownerAuthLevel: authLevel });
      toast.success("권한이 변경되었습니다");
      setEditing(null);
    } catch (err) {
      setError(`처리에 실패했습니다: ${err.code || err.message}`);
    }
  };

  return (
    <Panel icon={KeyRound} title="가입자(회사) 관리">
      <div className="mb-4 flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key ? "bg-primary text-white" : "bg-slate-100 text-muted hover:bg-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
        <table className="w-full min-w-[900px] text-center text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-3 py-3 font-semibold">회사명</th>
              <th className="px-3 py-3 font-semibold">회사코드</th>
              <th className="px-3 py-3 font-semibold">신청자</th>
              <th className="px-3 py-3 font-semibold">연락처</th>
              <th className="px-3 py-3 font-semibold">이메일</th>
              <th className="px-3 py-3 font-semibold">신청일시</th>
              <th className="px-3 py-3 font-semibold">상태</th>
              <th className="px-3 py-3 font-semibold">처리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-slate-50 odd:bg-white even:bg-slate-50/50">
                <td className="px-3 py-2.5 font-medium text-ink">{c.name}</td>
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => copyCode(c.id)}
                    title="복사"
                    className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-ink hover:bg-slate-200"
                  >
                    {c.id} <Copy size={11} />
                  </button>
                  {copiedId === c.id && <span className="ml-1.5 text-xs text-primary">복사됨</span>}
                </td>
                <td className="px-3 py-2.5">{c.applicant?.name || "-"}</td>
                <td className="px-3 py-2.5">{c.applicant?.phone || "-"}</td>
                <td className="px-3 py-2.5">{c.applicant?.email || "-"}</td>
                <td className="px-3 py-2.5 text-muted">{formatDate(c.createdAt)}</td>
                <td className="px-3 py-2.5">
                  <Badge tone={STATUS_TONE[c.status] || "muted"}>{STATUS_LABEL[c.status] || c.status}</Badge>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-nowrap justify-center gap-1.5">
                    {c.status === "approved" && (
                      <Button size="sm" variant="outline" onClick={() => switchTo(c.id)}>
                        <LogIn size={13} /> 전환
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                      <Pencil size={13} /> 수정
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setViewing(c)}>
                      <Eye size={13} /> 상세
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted">
                  해당하는 회사가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`${editing?.name || ""} · 수정`}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              취소
            </Button>
            {editing?.status === "pending" && (
              <>
                <Button variant="danger" onClick={() => setStatus("rejected", `'${editing.name}'의 개설 신청을 거절하시겠습니까?`)}>
                  거절
                </Button>
                <Button onClick={() => setStatus("approved", `'${editing.name}'의 개설 신청을 승인하시겠습니까? 권한: ${authLevel}`, { ownerAuthLevel: authLevel })}>
                  승인
                </Button>
              </>
            )}
            {editing?.status === "approved" && (
              <>
                <Button
                  variant="danger"
                  onClick={() => setStatus("suspended", `'${editing.name}'을(를) 탈퇴(이용정지) 처리하시겠습니까? 소속 관리자는 즉시 로그인이 제한됩니다.`)}
                >
                  탈퇴
                </Button>
                <Button onClick={changeAuthOnly}>권한변경</Button>
              </>
            )}
            {(editing?.status === "suspended" || editing?.status === "rejected") && (
              <Button onClick={() => setStatus("approved", `'${editing.name}'을(를) 복구하시겠습니까?`)}>복구</Button>
            )}
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
              <div>
                <p className="text-xs text-muted">회사명</p>
                <p className="text-ink">{editing.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted">회사코드</p>
                <p className="font-mono text-ink">{editing.id}</p>
              </div>
              <div>
                <p className="text-xs text-muted">신청자</p>
                <p className="text-ink">{editing.applicant?.name || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted">연락처</p>
                <p className="text-ink">{editing.applicant?.phone || "-"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted">이메일</p>
                <p className="text-ink">{editing.applicant?.email || "-"}</p>
              </div>
            </div>

            {(editing.status === "pending" || editing.status === "approved") && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">
                  권한 {editing.status === "pending" ? "(승인 시 신청자에게 부여됩니다)" : ""}
                </span>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={authLevel}
                  onChange={(e) => setAuthLevel(e.target.value)}
                >
                  {AUTH_LEVEL_OPTIONS.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
            )}
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title="가입 신청 상세"
        footer={<Button onClick={() => setViewing(null)}>닫기</Button>}
      >
        {viewing && (
          <div className="space-y-3 text-sm">
            {[
              ["회사명", viewing.name],
              ["회사코드", viewing.id],
              ["사업자등록번호", viewing.bizRegNo || "-"],
              ["신청자명", viewing.applicant?.name || "-"],
              ["연락처", viewing.applicant?.phone || "-"],
              ["이메일", viewing.applicant?.email || "-"],
              ["신청일시", formatDate(viewing.createdAt)],
              ["현재상태", STATUS_LABEL[viewing.status] || viewing.status],
              ["부여권한", viewing.ownerAuthLevel || "-"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-slate-100 py-2">
                <span className="text-xs text-muted">{label}</span>
                <span className="text-ink">{value}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </Panel>
  );
}
