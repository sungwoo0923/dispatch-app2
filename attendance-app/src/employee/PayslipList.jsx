import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, orderBy, onSnapshot, doc } from "firebase/firestore";
import { ChevronRight, Wallet, Phone, CalendarClock } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import Card from "../components/Card";
import MonthRangeSearch from "../components/MonthRangeSearch";
import SmsButton from "../components/SmsButton";

export default function PayslipList() {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [payrolls, setPayrolls] = useState([]);
  const [range, setRange] = useState(null);
  const [payrollInfo, setPayrollInfo] = useState(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "payrolls"), where("uid", "==", user.uid), orderBy("month", "desc"));
    const unsub = onSnapshot(q, (snap) =>
      setPayrolls(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.settlementStatus === "confirmed")
      )
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(doc(db, "companies", profile.companyId), (s) => {
      const data = s.data();
      setPayrollInfo({
        payday: data?.payrollPayday || "",
        depositTime: data?.payrollDepositTime || "",
        contactPhone: data?.payrollContactPhone || "",
      });
    });
    return () => unsub();
  }, [profile?.companyId]);

  const filteredPayrolls = useMemo(() => {
    if (!range) return payrolls;
    return payrolls.filter((p) => p.month >= range.startMonth && p.month <= range.endMonth);
  }, [payrolls, range]);

  return (
    <div className="space-y-3 px-4 pt-4">
      <h2 className="text-sm font-semibold text-ink">{t("payslip.title")}</h2>

      {payrollInfo && (payrollInfo.payday || payrollInfo.depositTime || payrollInfo.contactPhone) && (
        <Card className="flex flex-wrap items-center justify-between gap-2 border-primary/15 bg-primary-light p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <CalendarClock size={14} className="shrink-0" />
            <span>
              {payrollInfo.payday ? `매월 ${payrollInfo.payday}일 지급` : "급여일 미정"}
              {payrollInfo.depositTime && ` · ${payrollInfo.depositTime} 입금`}
            </span>
          </div>
          {payrollInfo.contactPhone && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-primary/80">급여 문의</span>
              <a
                href={`tel:${payrollInfo.contactPhone}`}
                className="inline-flex items-center justify-center rounded-lg bg-white/70 p-1.5 text-primary hover:bg-white"
                aria-label="급여 문의 전화"
              >
                <Phone size={14} />
              </a>
              <SmsButton phone={payrollInfo.contactPhone} className="bg-white/70 hover:bg-white" />
            </div>
          )}
        </Card>
      )}

      <MonthRangeSearch onSearch={setRange} />
      {filteredPayrolls.length === 0 && <p className="text-xs text-muted">{t("payslip.empty")}</p>}
      {filteredPayrolls.map((p) => (
        <Link key={p.id} to={`/payslips/${p.id}`}>
          <Card className="flex items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
                <Wallet size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{p.siteName || p.month}</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-ink">{p.month} · {p.netPay?.toLocaleString()}원</p>
              </div>
            </div>
            <ChevronRight size={20} className="shrink-0 text-muted" />
          </Card>
        </Link>
      ))}
    </div>
  );
}
