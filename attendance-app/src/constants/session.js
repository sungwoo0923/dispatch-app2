// sessionStorage key used to hand off the freshly-generated company invite
// code from AdminSignupPage to App's post-login routing, since Firebase Auth's
// onAuthStateChanged fires (and swaps the router tree) before the signup
// page's own local state can render a confirmation screen.
export const PENDING_INVITE_KEY = "kpwork_pending_invite";
