import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ClipboardList, CalendarCheck, CheckCircle2, MessageSquare, User, FileSignature, ShieldAlert, UserRound, ChevronRight, Check } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import { useOnboardingPending } from "../hooks/useOnboardingPending";
import HeaderIcons from "./HeaderIcons";
import Messenger from "../messenger/Messenger";
import Modal from "../components/Modal";
import Button from "../components/Button";
import OfflineBanner from "../components/OfflineBanner";

const TAB_DEFS = [
  { to: "/work-info", labelKey: "nav.workInfo", icon: ClipboardList },
  { to: "/history", labelKey: "nav.history", icon: CalendarCheck },
  { to: "/", labelKey: "nav.check", icon: CheckCircle2, end: true, center: true },
  { to: "/board", labelKey: "nav.board", icon: MessageSquare },
  { to: "/my-info", labelKey: "nav.myInfo", icon: User },
];

// Routes reachable only through a hub tab still count as that tab active for
// bottom-nav highlighting purposes.
const WORKINFO_ROUTES = ["/work-info", "/contracts", "/payslips", "/leave"];
const MYINFO_ROUTES = ["/my-info", "/documents", "/safety"];

export default function EmployeeLayout() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [showMessenger, setShowMessenger] = useState(false);
  const [messengerUnread, setMessengerUnread] = useState(0);
  const TABS = TAB_DEFS.map((tab) => ({ ...tab, label: t(tab.labelKey) }));

  const { pendingContracts, pendingSafetyCount } = useOnboardingPending(user, profile?.companyId);
  const [onboardingPrompt, setOnboardingPrompt] = useState(false);
  const prevDoneCountRef = useRef(-1);

  // 신규 근로자가 처음 들어왔을 때 뭘 해야 하는지 순서대로 알려주는
  // 체크리스트 — 내 정보 입력 → 근로계약서 서명 → 안전교육 이수 순으로,
  // 완료한 항목은 지우지 않고 체크 표시로 남겨 진행 상황을 보여준다.
  // 나이 있는 사용자도 "어디를 눌러야 하는지" 바로 학습할 수 있게 하기
  // 위한 튜토리얼 성격의 팝업이라, 전부 완료되기 전까지는 계속 안내한다.
  const onboardingSteps = [
    { key: "myInfo", done: Boolean(profile?.basicInfoSubmitted), labelKey: "onboarding.fillMyInfo", icon: UserRound, to: "/my-info" },
    { key: "contract", done: pendingContracts === 0, labelKey: "onboarding.signContract", icon: FileSignature, to: "/contracts" },
    {
      key: "safety",
      done: pendingSafetyCount === 0,
      labelKey: "onboarding.completeSafety",
      labelParams: { count: pendingSafetyCount },
      icon: ShieldAlert,
      to: "/safety",
    },
  ];
  const onboardingAllDone = onboardingSteps.every((s) => s.done);
  const onboardingDoneCount = onboardingSteps.filter((s) => s.done).length;

  const skipTodayKey = user ? `onboarding_skip_${user.uid}_${new Date().toISOString().slice(0, 10)}` : null;
  const skippedToday = () => Boolean(skipTodayKey && localStorage.getItem(skipTodayKey));

  // 예전엔 체크(홈) 탭에서만 이 팝업이 떴다 — 다른 탭에 있는 동안에는
  // 완료해야 할 항목이 있어도 안내를 못 받았다. 레이아웃(모든 탭에서
  // 항상 마운트됨) 레벨로 옮겨 어느 탭에 있든 뜨도록 한다. 또한 한 항목을
  // 완료할 때마다(이수완료 카운트가 늘어날 때마다) 다음 미완료 항목을
  // 자동으로 다시 안내한다 — 완료 → 다음 항목 팝업이 이어지는 흐름.
  useEffect(() => {
    if (onboardingAllDone) return;
    if (skippedToday()) return;
    if (onboardingDoneCount > prevDoneCountRef.current) {
      prevDoneCountRef.current = onboardingDoneCount;
      setOnboardingPrompt(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingAllDone, onboardingDoneCount]);

  const skipOnboardingToday = () => {
    if (skipTodayKey) localStorage.setItem(skipTodayKey, "1");
    setOnboardingPrompt(false);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-surface">
      <header
        className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-2.5 print:hidden"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.625rem)" }}
      >
        <img src="/logo.png" alt="KP-Work" className="h-11 w-auto" />
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] leading-tight text-muted">{t("layout.greeting")}</p>
            <p className="text-xs font-semibold leading-tight text-ink">{t("layout.nameSuffix", { name: profile?.name })}</p>
          </div>
          <HeaderIcons onMessengerClick={() => setShowMessenger(true)} messengerUnread={messengerUnread} />
        </div>
      </header>
      <OfflineBanner />

      {/* 항상 마운트해 안읽음 수를 추적하고, showMessenger로 화면 표시만 전환한다 */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9990, background: "#fff",
          display: "flex", flexDirection: "column", overflow: "hidden",
          visibility: showMessenger ? "visible" : "hidden",
          pointerEvents: showMessenger ? "auto" : "none",
        }}
      >
        <Messenger
          mobileMode
          mobileVisible={showMessenger}
          onClose={() => setShowMessenger(false)}
          onUnreadChange={setMessengerUnread}
        />
      </div>

      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      <Modal
        open={onboardingPrompt}
        onClose={() => setOnboardingPrompt(false)}
        title={t("onboarding.title")}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setOnboardingPrompt(false)}>
              {t("onboarding.later")}
            </Button>
            <Button variant="outline" className="flex-1" onClick={skipOnboardingToday}>
              {t("onboarding.skipToday")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink">{t("onboarding.body")}</p>
          <div className="space-y-2">
            {onboardingSteps.map((step, idx) => {
              const Icon = step.icon;
              const label = step.labelParams ? t(step.labelKey, step.labelParams) : t(step.labelKey);
              if (step.done) {
                return (
                  <div key={step.key} className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check size={15} />
                    </span>
                    <span className="flex-1 text-sm font-medium text-emerald-700 line-through decoration-emerald-400">{label}</span>
                    <span className="shrink-0 text-xs font-semibold text-emerald-600">{t("onboarding.stepDone")}</span>
                  </div>
                );
              }
              return (
                <button
                  key={step.key}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl border border-primary/20 bg-primary-light p-4 text-left"
                  onClick={() => {
                    setOnboardingPrompt(false);
                    navigate(step.to);
                  }}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    {idx + 1}
                  </span>
                  <Icon size={18} className="shrink-0 text-primary" />
                  <span className="flex-1 text-sm text-ink">{label}</span>
                  <ChevronRight size={16} className="shrink-0 text-primary" />
                </button>
              );
            })}
          </div>
        </div>
      </Modal>

      <nav
        id="employee-bottom-nav"
        className="fixed bottom-0 left-1/2 z-40 grid w-full max-w-md -translate-x-1/2 grid-cols-5 border-t border-slate-100 bg-white px-1 py-2 shadow-[0_-2px_10px_rgba(15,23,42,0.06)] print:hidden"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {TABS.map(({ to, label, icon: Icon, end, center }) => {
          const isActive =
            to === "/work-info"
              ? WORKINFO_ROUTES.some((r) => location.pathname.startsWith(r))
              : to === "/my-info"
                ? MYINFO_ROUTES.some((r) => location.pathname.startsWith(r))
                : end
                  ? location.pathname === to
                  : location.pathname.startsWith(to);

          if (center) {
            return (
              <NavLink key={to} to={to} end={end} className="relative flex flex-col items-center gap-1 py-1.5">
                <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30">
                  <Icon size={22} />
                </span>
                <span className={`text-[11px] ${isActive ? "font-semibold text-primary" : "text-muted"}`}>{label}</span>
              </NavLink>
            );
          }

          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] ${
                isActive ? "text-primary" : "text-muted"
              }`}
            >
              <Icon size={20} />
              {label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
