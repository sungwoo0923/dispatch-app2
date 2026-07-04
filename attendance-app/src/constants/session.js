// sessionStorage key used to hand off the freshly-generated company invite
// code from AdminSignupPage to App's post-login routing, since Firebase Auth's
// onAuthStateChanged fires (and swaps the router tree) before the signup
// page's own local state can render a confirmation screen.
export const PENDING_INVITE_KEY = "kpwork_pending_invite";

// Which company's data the super-admin is currently viewing/editing. Only
// ever set for the super-admin account (regular admins are always scoped to
// their own admins/{uid}.companyId and never touch this key) — set at
// admin-login time from the 회사코드 field, cleared on logout.
export const SUPER_ADMIN_ACTIVE_COMPANY_KEY = "kpwork_super_admin_active_company";
