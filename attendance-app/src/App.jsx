import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import LoginPage from "./auth/LoginPage";
import AdminSignupPage from "./auth/AdminSignupPage";
import EmployeeSignupPage from "./auth/EmployeeSignupPage";
import PendingApprovalPage from "./auth/PendingApprovalPage";
import AdminLayout from "./admin/AdminLayout";
import SignupSuccessPage from "./admin/SignupSuccessPage";
import Dashboard from "./admin/Dashboard";
import EmployeeList from "./admin/EmployeeList";
import Schedule from "./admin/Schedule";
import AttendanceBoard from "./admin/AttendanceBoard";
import LeaveApprovals from "./admin/LeaveApprovals";
import Payroll from "./admin/Payroll";
import Stats from "./admin/Stats";
import EmployeeLayout from "./employee/EmployeeLayout";
import Home from "./employee/Home";
import AttendanceHistory from "./employee/AttendanceHistory";
import SchedulePage from "./employee/SchedulePage";
import PayslipList from "./employee/PayslipList";
import PayslipDetail from "./employee/PayslipDetail";
import LeaveRequestPage from "./employee/LeaveRequestPage";
import { PENDING_INVITE_KEY } from "./constants/session";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-light border-t-primary" />
    </div>
  );
}

export default function App() {
  const { user, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return (
      <Routes>
        <Route path="/admin-signup" element={<AdminSignupPage />} />
        <Route path="/employee-signup" element={<EmployeeSignupPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  if (!profile) return <LoadingScreen />;

  if (profile.role === "admin") {
    const pendingInviteRaw = sessionStorage.getItem(PENDING_INVITE_KEY);
    if (pendingInviteRaw) {
      return (
        <SignupSuccessPage
          payload={JSON.parse(pendingInviteRaw)}
          onDismiss={() => {
            sessionStorage.removeItem(PENDING_INVITE_KEY);
            window.location.replace("/");
          }}
        />
      );
    }
    return (
      <Routes>
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="employees" element={<EmployeeList />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="attendance" element={<AttendanceBoard />} />
          <Route path="leaves" element={<LeaveApprovals />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="stats" element={<Stats />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // employee role
  if (!profile.approved) return <PendingApprovalPage />;
  if (profile.employmentStatus === "퇴사") return <PendingApprovalPage />;

  return (
    <Routes>
      <Route path="/" element={<EmployeeLayout />}>
        <Route index element={<Home />} />
        <Route path="history" element={<AttendanceHistory />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="payslips" element={<PayslipList />} />
        <Route path="payslips/:payrollId" element={<PayslipDetail />} />
        <Route path="leave" element={<LeaveRequestPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
