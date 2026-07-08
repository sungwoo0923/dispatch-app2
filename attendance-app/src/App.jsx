import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import LoginPage from "./auth/LoginPage";
import AdminLoginPage from "./auth/AdminLoginPage";
import AdminSignupPage from "./auth/AdminSignupPage";
import EmployeeSignupPage from "./auth/EmployeeSignupPage";
import PendingApprovalPage from "./auth/PendingApprovalPage";
import CompanyApprovalPendingPage from "./auth/CompanyApprovalPendingPage";
import AdminLayout from "./admin/AdminLayout";
import SignupSuccessPage from "./admin/SignupSuccessPage";
import SuperAdminCompanyPicker from "./admin/SuperAdminCompanyPicker";
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
import MyInfo from "./admin/MyInfo";
import BusinessEntities from "./admin/BusinessEntities";
import Vendors from "./admin/Vendors";
import Centers from "./admin/Centers";
import Devices from "./admin/Devices";
import PermissionGroups from "./admin/PermissionGroups";
import PermissionGroupMenus from "./admin/PermissionGroupMenus";
import PlatformCompanies from "./admin/PlatformCompanies";
import ShiftTemplates from "./admin/ShiftTemplates";
import AllowanceTemplates from "./admin/AllowanceTemplates";
import InsuranceRateTemplates from "./admin/InsuranceRateTemplates";
import CenterReports from "./admin/CenterReports";
import Schedule from "./admin/Schedule";
import AttendanceBoard from "./admin/AttendanceBoard";
import LeaveApprovals from "./admin/LeaveApprovals";
import LeaveSettings from "./admin/LeaveSettings";
import LeaveManagement from "./admin/LeaveManagement";
import LeaveUsage from "./admin/LeaveUsage";
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
import WorkInfoPage from "./employee/WorkInfoPage";
import MyInfoPage from "./employee/MyInfoPage";
import ContractsPage from "./employee/ContractsPage";
import ContractDetail from "./employee/ContractDetail";
import ResignationPage from "./employee/ResignationPage";
import DocumentsPage from "./employee/DocumentsPage";
import SafetyTrainingsPage from "./employee/SafetyTrainingsPage";
import BoardPage from "./employee/BoardPage";
import { PENDING_INVITE_KEY, SUPER_ADMIN_PICK_COMPANY_KEY } from "./constants/session";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-light border-t-primary" />
    </div>
  );
}

export default function App() {
  const { user, profile, loading, company, companyLoading, isSuperAdmin } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return (
      <Routes>
        <Route path="/admin-login" element={<AdminLoginPage />} />
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

    if (isSuperAdmin && sessionStorage.getItem(SUPER_ADMIN_PICK_COMPANY_KEY)) {
      return <SuperAdminCompanyPicker />;
    }

    if (companyLoading) return <LoadingScreen />;
    // The platform super-admin's own account is never blocked by this gate,
    // even if their company doc somehow ends up pending/rejected.
    if (!isSuperAdmin && company && company.status && company.status !== "approved") {
      return <CompanyApprovalPendingPage status={company.status} />;
    }

    return (
      <Routes>
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          {isSuperAdmin && <Route path="platform/companies" element={<PlatformCompanies />} />}
          <Route path="employees" element={<EmployeeList />} />
          <Route path="employees/status" element={<EmployeeStatus />} />
          <Route path="employees/contracts" element={<Contracts />} />
          <Route path="employees/documents" element={<Documents />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="attendance" element={<AttendanceBoard />} />
          <Route path="leaves" element={<LeaveApprovals />} />
          <Route path="leaves/settings" element={<LeaveSettings />} />
          <Route path="leaves/management" element={<LeaveManagement />} />
          <Route path="leaves/usage" element={<LeaveUsage />} />
          <Route path="safety" element={<SafetyTrainings />} />
          <Route path="safety/settings" element={<SafetySettings />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="payroll/settings" element={<SiteInsuranceRates />} />
          <Route path="stats" element={<Stats />} />
          <Route path="board" element={<Board />} />
          <Route path="settings/admins" element={<AdminAccounts />} />
          <Route path="settings/org" element={<OrgSettings />} />
          <Route path="settings/me" element={<MyInfo />} />
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
  if (profile.deleted) return <PendingApprovalPage />;
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
        <Route path="work-info" element={<WorkInfoPage />} />
        <Route path="my-info" element={<MyInfoPage />} />
        <Route path="contracts" element={<ContractsPage />} />
        <Route path="contracts/:contractId" element={<ContractDetail />} />
        <Route path="resignation" element={<ResignationPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="safety" element={<SafetyTrainingsPage />} />
        <Route path="board" element={<BoardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
