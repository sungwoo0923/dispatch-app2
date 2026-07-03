import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { ArrowLeft } from "lucide-react";
import { db } from "../firebase";
import Card from "../components/Card";

function Row({ label, value, strong }) {
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${strong ? "font-semibold text-ink" : "text-muted"}`}>
      <span>{label}</span>
      <span className={strong ? "text-ink" : ""}>{typeof value === "number" ? `${value.toLocaleString()}원` : value}</span>
    </div>
  );
}

export default function PayslipDetail() {
  const { payrollId } = useParams();
  const [payroll, setPayroll] = useState(null);

  useEffect(() => {
    getDoc(doc(db, "payrolls", payrollId)).then((snap) => {
      if (snap.exists()) setPayroll({ id: snap.id, ...snap.data() });
    });
  }, [payrollId]);

  if (!payroll) return <p className="px-4 pt-4 text-xs text-muted">불러오는 중...</p>;

  if (payroll.settlementStatus !== "confirmed") {
    return (
      <div className="space-y-4 px-4 pt-4">
        <Link to="/payslips" className="flex items-center gap-1 text-xs text-muted">
          <ArrowLeft size={14} /> 급여명세서 목록
        </Link>
        <p className="text-xs text-muted">아직 정산 확정 전인 명세서입니다.</p>
      </div>
    );
  }

  const d = payroll.deductions || {};

  return (
    <div className="space-y-4 px-4 pt-4">
      <Link to="/payslips" className="flex items-center gap-1 text-xs text-muted">
        <ArrowLeft size={14} /> 급여명세서 목록
      </Link>

      <Card className="p-5 text-center">
        <p className="text-xs text-muted">실수령액</p>
        <p className="mt-1 text-2xl font-bold text-ink">{payroll.netPay?.toLocaleString()}원</p>
        <p className="mt-2 text-xs text-muted">{payroll.month}</p>
      </Card>

      <Card className="p-5">
        <p className="mb-2 text-sm font-semibold text-ink">지급내역</p>
        <Row label="기본급" value={payroll.base} />
        <Row label="연장수당" value={payroll.overtimePay} />
        <Row label="주휴수당" value={payroll.weeklyAllowance} />
        <Row label="기타수당" value={payroll.allowances} />
        <div className="my-2 border-t border-slate-100" />
        <Row label="지급합계" value={payroll.grossPay} strong />
      </Card>

      <Card className="p-5">
        <p className="mb-2 text-sm font-semibold text-ink">공제내역</p>
        <Row label="국민연금" value={d.pension || 0} />
        <Row label="건강보험" value={d.health || 0} />
        <Row label="장기요양보험" value={d.longTermCare || 0} />
        <Row label="고용보험" value={d.employment || 0} />
        <div className="my-2 border-t border-slate-100" />
        <Row label="공제합계" value={d.total || 0} strong />
      </Card>
    </div>
  );
}
