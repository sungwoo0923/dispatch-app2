import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Eye, ShieldCheck } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Modal from "../components/Modal";
import Button from "../components/Button";
import Panel from "../components/Panel";
import { toDateKey, formatTime } from "../utils/dateUtils";

export default function SafetyTrainings() {
  const { profile } = useAuth();
  const [date, setDate] = useState(toDateKey());
  const [workSites, setWorkSites] = useState([]);
  const [records, setRecords] = useState([]);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "workSites"), where("companyId", "==", profile.companyId)),
      (snap) => setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("date", "==", date)),
      (snap) => setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId, date]);

  const managedSiteIds = useMemo(
    () => new Set(workSites.filter((s) => s.safetyManaged).map((s) => s.id)),
    [workSites]
  );

  const rows = useMemo(
    () => records.filter((r) => r.status === "출근" && r.siteId && managedSiteIds.has(r.siteId)),
    [records, managedSiteIds]
  );

  return (
    <div className="space-y-6">
      <Panel
        icon={ShieldCheck}
        title={`안전교육현황 (${rows.length}건)`}
        actions={
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        }
      >
        {managedSiteIds.size === 0 && (
          <Card className="mb-4 p-4 text-xs text-warning">
            안전관리가 적용된 근무지가 없습니다. 센터별 안전관리 메뉴에서 먼저 설정해주세요.
          </Card>
        )}

        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-medium">순번</th>
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="px-4 py-3 font-medium">근무지</th>
                <th className="px-4 py-3 font-medium">출근시각</th>
                <th className="px-4 py-3 font-medium">안전교육 서명</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-muted">{i + 1}</td>
                  <td className="px-4 py-3 text-ink">{r.name}</td>
                  <td className="px-4 py-3 text-muted">{r.siteName || "-"}</td>
                  <td className="px-4 py-3 text-muted">{r.checkInTime ? formatTime(r.checkInTime) : "-"}</td>
                  <td className="px-4 py-3">
                    {r.safetySignature ? <Badge tone="success">완료</Badge> : <Badge tone="warning">미서명</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-muted hover:text-primary" title="보기" onClick={() => setViewing(r)}>
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted">
                    해당 일자에 안전관리 근무지 출근 기록이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={`${viewing?.name} · ${viewing?.siteName || ""} 안전교육 서명`}
        footer={<Button onClick={() => setViewing(null)}>닫기</Button>}
      >
        {viewing && (
          <div className="space-y-4">
            {viewing.safetySignature ? (
              <>
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
                    <ShieldCheck size={13} /> 근로자 서명
                  </p>
                  <img
                    src={viewing.safetySignature}
                    alt="근로자 서명"
                    className="h-16 rounded-xl border border-slate-200 bg-white"
                  />
                  {viewing.safetySignedAt && (
                    <p className="mt-1 text-[11px] text-muted">{formatTime(viewing.safetySignedAt)} 서명</p>
                  )}
                </div>
                {viewing.supervisorSignature && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted">안전담당자 확인 ({viewing.supervisorName})</p>
                    <img
                      src={viewing.supervisorSignature}
                      alt="담당자 서명"
                      className="h-16 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted">아직 서명하지 않았습니다.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
