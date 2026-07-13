import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { ArrowLeft, Printer, Share2, Receipt } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { formatDate, toDateKey, birthDateFromResident } from "../utils/dateUtils";
import Card from "../components/Card";
import Button from "../components/Button";

// PC 관리자용 급여명세서 미리보기(Payroll.jsx)와 동일한 항목 구성 — 값이
// 없으면(0) 해당 줄을 아예 표시하지 않아, 기본 항목만 쓰는 회사는 예전과
// 같은 간단한 명세서로 보인다.
const PAYMENT_ROWS = [
  ["기본급", "base", false],
  ["상여", "bonus", true],
  ["직책수당", "positionAllowance", true],
  ["연차수당", "annualLeaveAllowance", true],
  ["주휴수당", "weeklyAllowance", false],
  ["기타수당", "allowances", false],
  ["식대", "mealAllowance", false],
  ["특별상여", "specialBonus", true],
  ["연장근로수당", "overtimePay", false],
  ["휴일근로수당", "holidayPay", true],
  ["출장수당", "businessTripAllowance", true],
  ["장기근속수당", "longServiceAllowance", true],
  ["통신비지원금", "commAllowance", true],
  ["지각공제", "lateDeduction", false],
  ["조퇴공제", "earlyLeaveDeduction", false],
];
const DEDUCTION_ROWS = [
  ["국민연금", "pension", false],
  ["건강보험", "health", false],
  ["장기요양보험", "longTermCare", false],
  ["고용보험", "employment", false],
  ["기타공제액", "otherDeduction", true],
  ["건강보험정산", "healthAdjustment", true],
  ["선지급금", "advancePayment", true],
  ["소득세", "incomeTax", true],
  ["지방소득세", "localIncomeTax", true],
  ["연말정산소득세", "yearEndIncomeTax", true],
  ["연말정산지방소득세", "yearEndLocalIncomeTax", true],
];

function birthDateDisplay(residentNumberFront) {
  const key = birthDateFromResident(residentNumberFront);
  return key ? formatDate(key) : "-";
}

function Row({ label, value, strong }) {
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${strong ? "font-bold text-ink" : "font-medium text-muted"}`}>
      <span>{label}</span>
      <span className={strong ? "text-ink" : "font-semibold text-ink"}>{Number(value || 0).toLocaleString()}원</span>
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

  const payDate = company?.payrollPayday ? `${payroll?.month}-${String(company.payrollPayday).padStart(2, "0")}` : toDateKey();

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
  const infoRows = [
    ["회사명", company?.name || "-"],
    ["성명", profile?.name],
    ["생년월일", birthDateDisplay(profile?.residentNumberFront)],
    ["입사일", profile?.hireDate ? formatDate(profile.hireDate) : "-"],
    ["직급", profile?.position || "-"],
    ["부서", profile?.team || "-"],
    ["지급일", payDate],
    ["지급대상기간", payroll.month],
    ["발급일", formatDate(toDateKey())],
    ["비고", payroll.note || "-"],
  ];

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
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-dashed border-slate-200 px-5 py-4 text-sm">
          {infoRows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="text-muted">{label}</span>
              <span className="truncate font-semibold text-ink">{value}</span>
            </div>
          ))}
        </div>
        <div className="p-5 text-center">
          <span className="inline-block rounded-full bg-primary-light px-3 py-1 text-xs font-semibold text-primary">실수령액</span>
          <p className="mt-2 text-3xl font-extrabold text-ink">{payroll.netPay?.toLocaleString()}원</p>
        </div>
      </Card>

      <Card className="p-5">
        <p className="mb-2 text-sm font-bold text-ink">지급내역 {payroll.grossPay?.toLocaleString()}원</p>
        {PAYMENT_ROWS.filter(([, key, optional]) => !optional || Number(payroll[key] || 0)).map(([label, key]) => (
          <Row key={key} label={label} value={payroll[key]} />
        ))}
        <div className="my-2 border-t border-dashed border-slate-200" />
        <Row label="지급합계" value={payroll.grossPay} strong />
      </Card>

      <Card className="p-5">
        <p className="mb-2 text-sm font-semibold text-ink">공제내역</p>
        {DEDUCTION_ROWS.filter(([, key, optional]) => !optional || Number(d[key] || 0)).map(([label, key]) => (
          <Row key={key} label={label} value={d[key]} />
        ))}
        <div className="my-2 border-t border-dashed border-slate-200" />
        <Row label="공제합계" value={d.total || 0} strong />
      </Card>

      <p className="pb-2 text-center text-[11px] text-muted">본 명세서는 시스템에서 자동 생성되었습니다.</p>
    </div>
  );
}
