// sessionStorage key used to hand off the freshly-generated company invite
// code from AdminSignupPage to App's post-login routing, since Firebase Auth's
// onAuthStateChanged fires (and swaps the router tree) before the signup
// page's own local state can render a confirmation screen.
export const PENDING_INVITE_KEY = "kpwork_pending_invite";

// Which company's data the super-admin is currently viewing/editing. Only
// ever set for the super-admin account (regular admins are always scoped to
// their own admins/{uid}.companyId and never touch this key) — cleared on
// logout.
export const SUPER_ADMIN_ACTIVE_COMPANY_KEY = "kpwork_super_admin_active_company";

// Set right after the super-admin authenticates, before App's router has
// decided which company to show. Firebase Auth's onAuthStateChanged fires
// (and profile/company data starts loading) before AdminLoginPage's own
// local state can render the company-search step, so this flag — like
// PENDING_INVITE_KEY above — hands off "show the picker next" across that
// remount boundary. Cleared once the super-admin picks a company or skips.
export const SUPER_ADMIN_PICK_COMPANY_KEY = "kpwork_super_admin_pick_company";
