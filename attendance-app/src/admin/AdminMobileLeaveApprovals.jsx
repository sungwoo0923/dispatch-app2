import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { Search, ChevronRight } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Modal from "../components/Modal";
import Badge from "../components/Badge";
import Button from "../components/Button";
import ApprovalBox from "../components/ApprovalBox";
import { formatDate } from "../utils/dateUtils";

const STATUS_MAP = { pending: "승인대기", approved: "승인완료", rejected: "반려" };
const STATUS_MAP_REV = { 승인대기: "pending", 승인완료: "approved", 반려: "rejected" };
const STATUS_TONE = { 승인대기: "warning", 승인완료: "success", 반려: "danger" };
const TABS = ["전체", "승인대기", "승인완료", "반려"];

// 근로자휴가신청현황의 모바일 전용 화면 — PC의 다중필터 표 대신, 상태탭+검색으로
// 빠르게 훑고 탭 한 번으로 승인/반려까지 처리할 수 있는 카드 목록으로 재구성했다.
export default function AdminMobileLeaveApprovals() {
  const { profile } = useAuth();
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [statusTab, setStatusTab] = useState("승인대기");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null); // { leave, emp }
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (s) => setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "leaves"), where("companyId", "==", profile.companyId)), (s) => setLeaves(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const employeeByUid = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";

  const rows = useMemo(() => {
    return leaves
      .map((lv) => ({ leave: lv, emp: employeeByUid.get(lv.uid) }))
      .filter(({ emp }) => Boolean(emp))
      .filter(({ leave }) => statusTab === "전체" || (STATUS_MAP[leave.status] || "승인대기") === statusTab)
      .filter(({ leave }) => !search.trim() || leave.name?.includes(search.trim()))
      .sort((a, b) => b.leave.startDate.localeCompare(a.leave.startDate));
  }, [leaves, employeeByUid, statusTab, search]);

  const counts = useMemo(() => {
    const out = { 전체: leaves.length, 승인대기: 0, 승인완료: 0, 반려: 0 };
    leaves.forEach((lv) => {
      const s = STATUS_MAP[lv.status] || "승인대기";
      out[s] = (out[s] || 0) + 1;
    });
    return out;
  }, [leaves]);

  const openDetail = (leave, emp) => {
    setDetail({ leave, emp });
    setNote(leave.adminNote || "");
  };

  const applyStatus = async (statusKor) => {
    if (!detail) return;
    setSaving(true);
    try {
      const nextStatus = STATUS_MAP_REV[statusKor];
      await updateDoc(doc(db, "leaves", detail.leave.id), { status: nextStatus, adminNote: note || null });
      if (nextStatus !== "pending") {
        await addDoc(collection(db, "notifications"), {
          companyId: profile.companyId,
          uid: detail.leave.uid,
          title: nextStatus === "approved" ? `${detail.leave.type} 신청이 승인되었습니다` : `${detail.leave.type} 신청이 반려되었습니다`,
          message: nextStatus === "rejected" ? note || "" : "",
          link: "/leave",
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      toast.success("처리되었습니다");
      setDetail(null);
    } catch (err) {
      toast.error(`처리에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div>
        <p className="text-sm font-semibold text-ink">휴가신청현황</p>
        <p className="mt-0.5 text-xs text-muted">근로자의 휴가 신청을 확인하고 승인·반려할 수 있습니다</p>
      </div>

      <div className="relative">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="신청자 이름 검색"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm"
        />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain">
        {TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusTab(s)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              statusTab === s ? "bg-primary text-white" : "bg-white text-muted border border-slate-200"
            }`}
          >
            {s} {counts[s] || 0}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {rows.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">해당하는 휴가 신청이 없습니다.</div>
        )}
        {rows.map(({ leave: lv, emp }) => (
          <button
            key={lv.id}
            type="button"
            onClick={() => openDetail(lv, emp)}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-ink">{lv.name}</span>
                <Badge tone={STATUS_TONE[STATUS_MAP[lv.status] || "승인대기"]}>{STATUS_MAP[lv.status] || "승인대기"}</Badge>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">
                {lv.type} · {formatDate(lv.startDate)} ({lv.days || 1}일) · {siteName_(emp.workSiteId)}
              </p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-slate-300" />
          </button>
        ))}
      </div>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="휴가신청서">
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-ink">{detail.leave.name}</p>
              <ApprovalBox
                steps={[
                  {
                    role: "결재",
                    name: "",
                    signatureDataUrl: null,
                    result: detail.leave.status === "approved" ? "approved" : detail.leave.status === "rejected" ? "rejected" : null,
                  },
                ]}
              />
            </div>
            <div className="rounded-xl bg-slate-50 p-3.5">
              <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
                <span className="text-xs text-muted">근무지</span>
                <span className="text-ink">{siteName_(detail.emp.workSiteId)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
                <span className="text-xs text-muted">휴가유형</span>
                <span className="text-ink">{detail.leave.type}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
                <span className="text-xs text-muted">휴가일자</span>
                <span className="text-ink">{formatDate(detail.leave.startDate)} ({detail.leave.days || 1}일)</span>
              </div>
              <div className="flex items-center justify-between py-2 text-sm">
                <span className="text-xs text-muted">사유</span>
                <span className="text-ink">{detail.leave.reason || "-"}</span>
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">관리자비고</span>
              <textarea
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            <div className="flex gap-2">
              <Button className="flex-1" variant="outline" disabled={saving} onClick={() => applyStatus("승인대기")}>
                대기
              </Button>
              <Button className="flex-1" variant="danger" disabled={saving} onClick={() => applyStatus("반려")}>
                반려
              </Button>
              <Button className="flex-1" disabled={saving} onClick={() => applyStatus("승인완료")}>
                승인
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
