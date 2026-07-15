import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Wallet } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Panel from "../components/Panel";
import Card from "../components/Card";
import { toMonthKey } from "../utils/dateUtils";

// 배정완료된 요청장을 월별로 묶어 정산 금액을 보여준다 — 별도 정산승인
// 워크플로우 없이, 배정 시 확정된 totalPrice를 그대로 월합계로 집계하는
// 조회 전용 화면.
export default function AgencySettlement() {
  const { agency } = useAuth();
  const [requests, setRequests] = useState([]);
  const [month, setMonth] = useState(toMonthKey());

  useEffect(() => {
    if (!agency?.id) return;
    const unsub = onSnapshot(
      query(collection(db, "staffingRequests"), where("agencyId", "==", agency.id), where("status", "==", "assigned")),
      (snap) => setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [agency?.id]);

  const monthRows = useMemo(
    () => requests.filter((r) => (r.date || "").startsWith(month)).sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    [requests, month]
  );
  const monthTotal = monthRows.reduce((sum, r) => sum + (r.totalPrice || 0), 0);
  const monthHeadcount = monthRows.reduce((sum, r) => sum + (r.workers?.length || 0), 0);

  return (
    <div className="space-y-6">
      <Panel icon={Wallet} title="정산">
        <div className="mb-3 flex items-center gap-2">
          <input
            type="month"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs text-muted">배정 건수</p>
            <p className="mt-1 text-xl font-bold text-ink">{monthRows.length}건</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted">배정 인원</p>
            <p className="mt-1 text-xl font-bold text-ink">{monthHeadcount}명</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted">정산 합계</p>
            <p className="mt-1 text-xl font-bold text-primary">{monthTotal.toLocaleString()}원</p>
          </Card>
        </div>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-3 font-semibold">날짜</th>
                <th className="px-3 py-3 font-semibold">도급사</th>
                <th className="px-3 py-3 font-semibold">센터</th>
                <th className="px-3 py-3 font-semibold">조</th>
                <th className="px-3 py-3 font-semibold">인원</th>
                <th className="px-3 py-3 font-semibold">금액</th>
              </tr>
            </thead>
            <tbody>
              {monthRows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-3 text-ink">{r.date}</td>
                  <td className="px-3 py-3 text-ink">{r.companyName}</td>
                  <td className="px-3 py-3 text-ink">{r.siteName || "-"}</td>
                  <td className="px-3 py-3 text-ink">{r.shiftLabel || "-"}</td>
                  <td className="px-3 py-3 text-ink">{r.workers?.length || 0}명</td>
                  <td className="px-3 py-3 font-medium text-ink">{(r.totalPrice || 0).toLocaleString()}원</td>
                </tr>
              ))}
              {monthRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs text-muted">해당 월 정산 내역이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </Panel>
    </div>
  );
}
