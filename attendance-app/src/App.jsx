import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import UnifiedLoginPage from "./auth/UnifiedLoginPage";
import AdminSignupPage from "./auth/AdminSignupPage";
import AgencySignupPage from "./auth/AgencySignupPage";
import EmployeeSignupPage from "./auth/EmployeeSignupPage";
import PendingApprovalPage from "./auth/PendingApprovalPage";
import CompanyApprovalPendingPage from "./auth/CompanyApprovalPendingPage";
import AdminLayout from "./admin/AdminLayout";
import AdminMobileLayout from "./admin/AdminMobileLayout";
import AdminMobileHome from "./admin/AdminMobileHome";
import AdminMobileMore from "./admin/AdminMobileMore";
import AdminMobileEmployeeList from "./admin/AdminMobileEmployeeList";
import AdminMobileAttendance from "./admin/AdminMobileAttendance";
import AdminMobileSchedule from "./admin/AdminMobileSchedule";
import AdminMobileLeaveApprovals from "./admin/AdminMobileLeaveApprovals";
import AdminMobileLeaveManagement from "./admin/AdminMobileLeaveManagement";
import AdminMobileLeaveUsage from "./admin/AdminMobileLeaveUsage";
import AdminMobileSafetyTrainings from "./admin/AdminMobileSafetyTrainings";
import AdminMobileSafetySettings from "./admin/AdminMobileSafetySettings";
import AdminMobileSafetyMaterials from "./admin/AdminMobileSafetyMaterials";
import AdminMobileSafetyCompliance from "./admin/AdminMobileSafetyCompliance";
import AdminMobilePayroll from "./admin/AdminMobilePayroll";
import AdminMobileSiteInsuranceRates from "./admin/AdminMobileSiteInsuranceRates";
import AdminMobileStatsSummary from "./admin/AdminMobileStatsSummary";
import AdminMobileStatsAttendanceCount from "./admin/AdminMobileStatsAttendanceCount";
import AdminMobileStatsMonthlyGrid from "./admin/AdminMobileStatsMonthlyGrid";
import AdminMobileStatsMonthlyTime from "./admin/AdminMobileStatsMonthlyTime";
import AdminMobileStatsSiteAggregate from "./admin/AdminMobileStatsSiteAggregate";
import AdminMobileBusinessEntities from "./admin/AdminMobileBusinessEntities";
import AdminMobileVendors from "./admin/AdminMobileVendors";
import AdminMobileCenters from "./admin/AdminMobileCenters";
import AdminMobileDevices from "./admin/AdminMobileDevices";
import AdminMobileAdminAccounts from "./admin/AdminMobileAdminAccounts";
import AdminMobileOrgSettings from "./admin/AdminMobileOrgSettings";
import AdminMobilePermissionGroups from "./admin/AdminMobilePermissionGroups";
import AdminMobilePermissionGroupMenus from "./admin/AdminMobilePermissionGroupMenus";
import AdminMobileShiftTemplates from "./admin/AdminMobileShiftTemplates";
import AdminMobileAllowanceTemplates from "./admin/AdminMobileAllowanceTemplates";
import AdminMobileInsuranceRateTemplates from "./admin/AdminMobileInsuranceRateTemplates";
import AdminMobileCenterReports from "./admin/AdminMobileCenterReports";
import SignupSuccessPage from "./admin/SignupSuccessPage";
import SuperAdminCompanyPicker from "./admin/SuperAdminCompanyPicker";
import Dashboard from "./admin/Dashboard";
import EmployeeList from "./admin/EmployeeList";
import EmployeeStatus from "./admin/EmployeeStatus";
import HistoryAccessRequests from "./admin/HistoryAccessRequests";
import Contracts from "./admin/Contracts";
import Documents from "./admin/Documents";
import Inquiries from "./admin/Inquiries";
import SafetyTrainings from "./admin/SafetyTrainings";
import SafetySettings from "./admin/SafetySettings";
import SafetyMaterials from "./admin/SafetyMaterials";
import SafetyCompliance from "./admin/SafetyCompliance";
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
import MobilePreview from "./admin/MobilePreview";
import ShiftTemplates from "./admin/ShiftTemplates";
import AllowanceTemplates from "./admin/AllowanceTemplates";
import InsuranceRateTemplates from "./admin/InsuranceRateTemplates";
import CenterReports from "./admin/CenterReports";
import Schedule from "./admin/Schedule";
import AttendanceBoard from "./admin/AttendanceBoard";
import StaffingAgency from "./admin/StaffingAgency";
import LeaveApprovals from "./admin/LeaveApprovals";
import LeaveManagement from "./admin/LeaveManagement";
import LeaveUsage from "./admin/LeaveUsage";
import Payroll from "./admin/Payroll";
import SiteInsuranceRates from "./admin/SiteInsuranceRates";
import StatsSummary from "./admin/StatsSummary";
import StatsAttendanceCount from "./admin/StatsAttendanceCount";
import StatsMonthlyGrid from "./admin/StatsMonthlyGrid";
import StatsMonthlyTimeGrid from "./admin/StatsMonthlyTimeGrid";
import StatsSiteAggregate from "./admin/StatsSiteAggregate";
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
import SafetyArchivePage from "./employee/SafetyArchivePage";
import BoardPage from "./employee/BoardPage";
import NotificationsPage from "./employee/NotificationsPage";
import AgencyApprovalPendingPage from "./auth/AgencyApprovalPendingPage";
import AgencyLayout from "./agency/AgencyLayout";
import AgencyRequests from "./agency/AgencyRequests";
import AgencyWorkers from "./agency/AgencyWorkers";
import AgencyBusiness from "./agency/AgencyBusiness";
import AgencySettlement from "./agency/AgencySettlement";
import BiometricGate from "./components/BiometricGate";
import { useIsMobile } from "./hooks/useIsMobile";
import { PENDING_INVITE_KEY, SUPER_ADMIN_PICK_COMPANY_KEY } from "./constants/session";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white">
      <img src="/logo.png" alt="KP-Work" className="w-40 sm:w-48" />
      <div className="flex gap-1.5">
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
      </div>
    </div>
  );
}

export default function App() {
  const { user, profile, loading, company, companyLoading, agency, agencyLoading, isSuperAdmin } = useAuth();
  const isMobile = useIsMobile();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return (
      <Routes>
        <Route path="/admin-login" element={<UnifiedLoginPage initialTab="admin" />} />
        <Route path="/agency-login" element={<UnifiedLoginPage initialTab="agency" />} />
        <Route path="/admin-signup" element={<AdminSignupPage />} />
        <Route path="/agency-signup" element={<AgencySignupPage />} />
        <Route path="/employee-signup" element={<EmployeeSignupPage />} />
        <Route path="*" element={<UnifiedLoginPage initialTab="employee" />} />
      </Routes>
    );
  }

  if (!profile) return <LoadingScreen />;

  return <BiometricGate>{renderAuthedContent()}</BiometricGate>;

  function renderAuthedContent() {
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

    // 아래 하위 라우트 목록은 PC(AdminLayout)와 모바일(AdminMobileLayout)
    // 트리가 완전히 동일하게 공유한다 — 화면별로 모바일 전용 컴포넌트를
    // 새로 만들면 여기서 그 컴포넌트로 교체해나간다(순차 전환). 아직
    // 교체되지 않은 화면은 과도기적으로 PC 컴포넌트를 그대로 재사용한다.
    const sharedAdminChildRoutes = (
      <>
        {isSuperAdmin && <Route path="platform/companies" element={<PlatformCompanies />} />}
        {isSuperAdmin && <Route path="platform/mobile-preview" element={<MobilePreview />} />}
        <Route path="employees/status" element={<EmployeeStatus />} />
        <Route path="employees/history-access" element={<HistoryAccessRequests />} />
        <Route path="employees/contracts" element={<Contracts />} />
        <Route path="employees/documents" element={<Documents />} />
        <Route path="employees/inquiries" element={<Inquiries />} />
        <Route path="board" element={<Board />} />
        <Route path="staffing" element={<StaffingAgency />} />
        <Route path="settings/me" element={<MyInfo />} />
        <Route path="templates" element={<Navigate to="/templates/shift" replace />} />
      </>
    );

    if (isMobile) {
      return (
        <Routes>
          <Route path="/" element={<AdminMobileLayout />}>
            <Route index element={<AdminMobileHome />} />
            <Route path="more" element={<AdminMobileMore />} />
            <Route path="employees" element={<AdminMobileEmployeeList />} />
            <Route path="schedule" element={<AdminMobileSchedule />} />
            <Route path="attendance" element={<AdminMobileAttendance />} />
            <Route path="leaves" element={<AdminMobileLeaveApprovals />} />
            <Route path="leaves/management" element={<AdminMobileLeaveManagement />} />
            <Route path="leaves/usage" element={<AdminMobileLeaveUsage />} />
            <Route path="safety" element={<AdminMobileSafetyTrainings />} />
            <Route path="safety/settings" element={<AdminMobileSafetySettings />} />
            <Route path="safety/materials" element={<AdminMobileSafetyMaterials />} />
            <Route path="safety/compliance" element={<AdminMobileSafetyCompliance />} />
            <Route path="payroll" element={<AdminMobilePayroll />} />
            <Route path="payroll/settings" element={<AdminMobileSiteInsuranceRates />} />
            <Route path="stats" element={<AdminMobileStatsSummary />} />
            <Route path="stats/attendance-count" element={<AdminMobileStatsAttendanceCount />} />
            <Route path="stats/monthly-grid" element={<AdminMobileStatsMonthlyGrid />} />
            <Route path="stats/monthly-time" element={<AdminMobileStatsMonthlyTime />} />
            <Route path="stats/site-aggregate" element={<AdminMobileStatsSiteAggregate />} />
            <Route path="org/entities" element={<AdminMobileBusinessEntities />} />
            <Route path="org/vendors" element={<AdminMobileVendors />} />
            <Route path="org/centers" element={<AdminMobileCenters />} />
            <Route path="org/devices" element={<AdminMobileDevices />} />
            <Route path="settings/admins" element={<AdminMobileAdminAccounts />} />
            <Route path="settings/org" element={<AdminMobileOrgSettings />} />
            <Route path="permissions/groups" element={<AdminMobilePermissionGroups />} />
            <Route path="permissions/menus" element={<AdminMobilePermissionGroupMenus />} />
            <Route path="templates/shift" element={<AdminMobileShiftTemplates />} />
            <Route path="templates/allowance" element={<AdminMobileAllowanceTemplates />} />
            <Route path="templates/insurance" element={<AdminMobileInsuranceRateTemplates />} />
            <Route path="templates/reports" element={<AdminMobileCenterReports />} />
            <Route path="notifications" element={<NotificationsPage />} />
            {sharedAdminChildRoutes}
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
          <Route path="leaves/management" element={<LeaveManagement />} />
          <Route path="leaves/usage" element={<LeaveUsage />} />
          <Route path="safety" element={<SafetyTrainings />} />
          <Route path="safety/settings" element={<SafetySettings />} />
          <Route path="safety/materials" element={<SafetyMaterials />} />
          <Route path="safety/compliance" element={<SafetyCompliance />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="payroll/settings" element={<SiteInsuranceRates />} />
          <Route path="stats" element={<StatsSummary />} />
          <Route path="stats/attendance-count" element={<StatsAttendanceCount />} />
          <Route path="stats/monthly-grid" element={<StatsMonthlyGrid />} />
          <Route path="stats/monthly-time" element={<StatsMonthlyTimeGrid />} />
          <Route path="stats/site-aggregate" element={<StatsSiteAggregate />} />
          <Route path="org/entities" element={<BusinessEntities />} />
          <Route path="org/vendors" element={<Vendors />} />
          <Route path="org/centers" element={<Centers />} />
          <Route path="org/devices" element={<Devices />} />
          <Route path="settings/admins" element={<AdminAccounts />} />
          <Route path="settings/org" element={<OrgSettings />} />
          <Route path="permissions/groups" element={<PermissionGroups />} />
          <Route path="permissions/menus" element={<PermissionGroupMenus />} />
          <Route path="templates/shift" element={<ShiftTemplates />} />
          <Route path="templates/allowance" element={<AllowanceTemplates />} />
          <Route path="templates/insurance" element={<InsuranceRateTemplates />} />
          <Route path="templates/reports" element={<CenterReports />} />
          {sharedAdminChildRoutes}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (profile.role === "agency") {
    if (agencyLoading) return <LoadingScreen />;
    if (!agency || agency.status !== "approved") return <AgencyApprovalPendingPage />;
    return (
      <Routes>
        <Route path="/" element={<AgencyLayout />}>
          <Route index element={<AgencyRequests />} />
          <Route path="workers" element={<AgencyWorkers />} />
          <Route path="business" element={<AgencyBusiness />} />
          <Route path="settlement" element={<AgencySettlement />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // employee role
  if (profile.deleted) return <PendingApprovalPage />;
  if (!profile.approved) return <PendingApprovalPage />;
  if (profile.employmentStatus === "퇴사") return <PendingApprovalPage />;
  if (companyLoading) return <LoadingScreen />;
  if (company && company.status && company.status !== "approved") {
    return <CompanyApprovalPendingPage status={company.status} />;
  }

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
        <Route path="safety/archive" element={<SafetyArchivePage />} />
        <Route path="board" element={<BoardPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
  }
}
