import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { ArrowLeft, Printer, Share2, Receipt } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { formatDate, toDateKey } from "../utils/dateUtils";
import Card from "../components/Card";
import Button from "../components/Button";

function Row({ label, value, strong, negative }) {
  const display =
    typeof value === "number" ? `${negative && value > 0 ? "-" : ""}${value.toLocaleString()}원` : value;
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${strong ? "font-bold text-ink" : "font-medium text-muted"}`}>
      <span>{label}</span>
      <span className={strong ? "text-ink" : "font-semibold text-ink"}>{display}</span>
    </div>
  );
}

export default function PayslipDetail() {
  const { payrollId } = useParams();
  const { profile, company } = useAuth();
  const [payroll, setPayroll] = useState(null);
  const toast = useToast();

  useEffect(() => {
    getDoc(doc(db, "payrolls", payrollId)).then((snap) => {
      if (snap.exists()) setPayroll({ id: snap.id, ...snap.data() });
    });
  }, [payrollId]);

  const share = async () => {
    const text = `[급여명세서] ${payroll.month} · 실수령액 ${payroll.netPay?.toLocaleString()}원`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "급여명세서", text });
      } catch {
        // 사용자가 공유를 취소한 경우이므로 별도 처리하지 않는다.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("클립보드에 복사했습니다");
    } catch {
      toast.error("공유하기를 지원하지 않는 환경입니다.");
    }
  };

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
      <div className="flex items-center justify-between print:hidden">
        <Link to="/payslips" className="flex items-center gap-1 text-xs text-muted">
          <ArrowLeft size={14} /> 급여명세서 목록
        </Link>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer size={13} /> PDF 저장
          </Button>
          <Button size="sm" variant="outline" onClick={share}>
            <Share2 size={13} /> 공유
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="space-y-1 bg-ink px-5 py-4 text-center text-white">
          <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-white/70">
            <Receipt size={13} /> 급여명세서
          </p>
          <p className="text-lg font-bold">{company?.name || ""}</p>
        </div>
        <div className="space-y-1 border-b border-dashed border-slate-200 px-5 py-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">성명</span>
            <span className="font-semibold text-ink">{profile?.name}{profile?.position ? ` (${profile.position})` : ""}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">지급대상기간</span>
            <span className="font-semibold text-ink">{payroll.month}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">발급일</span>
            <span className="font-semibold text-ink">{formatDate(toDateKey())}</span>
          </div>
        </div>
        <div className="p-5 text-center">
          <span className="inline-block rounded-full bg-primary-light px-3 py-1 text-xs font-semibold text-primary">실수령액</span>
          <p className="mt-2 text-3xl font-extrabold text-ink">{payroll.netPay?.toLocaleString()}원</p>
        </div>
      </Card>

      <Card className="p-5">
        <p className="mb-2 text-sm font-bold text-ink">지급내역 {payroll.grossPay?.toLocaleString()}원</p>
        <Row label="기본급" value={payroll.base} />
        <Row label="연장수당" value={payroll.overtimePay} />
        <Row label="주휴수당" value={payroll.weeklyAllowance} />
        <Row label="기타수당" value={payroll.allowances} />
        <Row label="식대" value={payroll.mealAllowance || 0} />
        <Row label="지각공제" value={payroll.lateDeduction || 0} negative />
        <Row label="조퇴공제" value={payroll.earlyLeaveDeduction || 0} negative />
        <div className="my-2 border-t border-dashed border-slate-200" />
        <Row label="지급합계" value={payroll.grossPay} strong />
      </Card>

      <Card className="p-5">
        <p className="mb-2 text-sm font-semibold text-ink">공제내역</p>
        <Row label="국민연금" value={d.pension || 0} />
        <Row label="건강보험" value={d.health || 0} />
        <Row label="장기요양보험" value={d.longTermCare || 0} />
        <Row label="고용보험" value={d.employment || 0} />
        <div className="my-2 border-t border-dashed border-slate-200" />
        <Row label="공제합계" value={d.total || 0} strong />
      </Card>

      <p className="pb-2 text-center text-[11px] text-muted">본 명세서는 시스템에서 자동 생성되었습니다.</p>
    </div>
  );
}
