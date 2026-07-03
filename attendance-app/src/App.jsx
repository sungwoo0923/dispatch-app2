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
import EmployeeStatus from "./admin/EmployeeStatus";
import Contracts from "./admin/Contracts";
import Documents from "./admin/Documents";
import SafetyTrainings from "./admin/SafetyTrainings";
import SafetySettings from "./admin/SafetySettings";
import Board from "./admin/Board";
import AdminAccounts from "./admin/AdminAccounts";
import OrgSettings from "./admin/OrgSettings";
import BusinessEntities from "./admin/BusinessEntities";
import Vendors from "./admin/Vendors";
import Centers from "./admin/Centers";
import Devices from "./admin/Devices";
import PermissionGroups from "./admin/PermissionGroups";
import PermissionGroupMenus from "./admin/PermissionGroupMenus";
import ShiftTemplates from "./admin/ShiftTemplates";
import AllowanceTemplates from "./admin/AllowanceTemplates";
import InsuranceRateTemplates from "./admin/InsuranceRateTemplates";
import CenterReports from "./admin/CenterReports";
import Schedule from "./admin/Schedule";
import AttendanceBoard from "./admin/AttendanceBoard";
import LeaveApprovals from "./admin/LeaveApprovals";
import LeaveTemplates from "./admin/LeaveTemplates";
import LeaveTypes from "./admin/LeaveTypes";
import SiteLeaveSettings from "./admin/SiteLeaveSettings";
import LeaveManagement from "./admin/LeaveManagement";
import LeaveUsageStatus from "./admin/LeaveUsageStatus";
import { LeaveMonthlyStats, LeaveAnnualStats } from "./admin/LeavePeriodStats";
import Payroll from "./admin/Payroll";
import SiteInsuranceRates from "./admin/SiteInsuranceRates";
import Stats from "./admin/Stats";
import EmployeeLayout from "./employee/EmployeeLayout";
import Home from "./employee/Home";
import AttendanceHistory from "./employee/AttendanceHistory";
import SchedulePage from "./employee/SchedulePage";
import PayslipList from "./employee/PayslipList";
import PayslipDetail from "./employee/PayslipDetail";
import LeaveRequestPage from "./employee/LeaveRequestPage";
import MorePage from "./employee/MorePage";
import ContractsPage from "./employee/ContractsPage";
import ContractDetail from "./employee/ContractDetail";
import DocumentsPage from "./employee/DocumentsPage";
import SafetyTrainingsPage from "./employee/SafetyTrainingsPage";
import BoardPage from "./employee/BoardPage";
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
          <Route path="employees/status" element={<EmployeeStatus />} />
          <Route path="employees/contracts" element={<Contracts />} />
          <Route path="employees/documents" element={<Documents />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="attendance" element={<AttendanceBoard />} />
          <Route path="leaves" element={<LeaveApprovals />} />
          <Route path="leaves/templates" element={<LeaveTemplates />} />
          <Route path="leaves/types" element={<LeaveTypes />} />
          <Route path="leaves/site-settings" element={<SiteLeaveSettings />} />
          <Route path="leaves/management" element={<LeaveManagement />} />
          <Route path="leaves/usage" element={<LeaveUsageStatus />} />
          <Route path="leaves/monthly" element={<LeaveMonthlyStats />} />
          <Route path="leaves/annual" element={<LeaveAnnualStats />} />
          <Route path="safety" element={<SafetyTrainings />} />
          <Route path="safety/settings" element={<SafetySettings />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="payroll/settings" element={<SiteInsuranceRates />} />
          <Route path="stats" element={<Stats />} />
          <Route path="board" element={<Board />} />
          <Route path="settings/admins" element={<AdminAccounts />} />
          <Route path="settings/org" element={<OrgSettings />} />
          <Route path="org/entities" element={<BusinessEntities />} />
          <Route path="org/vendors" element={<Vendors />} />
          <Route path="org/centers" element={<Centers />} />
          <Route path="org/devices" element={<Devices />} />
          <Route path="permissions/groups" element={<PermissionGroups />} />
          <Route path="permissions/menus" element={<PermissionGroupMenus />} />
          <Route path="templates" element={<Navigate to="/templates/shift" replace />} />
          <Route path="templates/shift" element={<ShiftTemplates />} />
          <Route path="templates/allowance" element={<AllowanceTemplates />} />
          <Route path="templates/insurance" element={<InsuranceRateTemplates />} />
          <Route path="templates/reports" element={<CenterReports />} />
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
        <Route path="more" element={<MorePage />} />
        <Route path="contracts" element={<ContractsPage />} />
        <Route path="contracts/:contractId" element={<ContractDetail />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="safety" element={<SafetyTrainingsPage />} />
        <Route path="board" element={<BoardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
