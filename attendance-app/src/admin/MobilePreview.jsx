import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Smartphone, RefreshCw, ExternalLink } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useIsMobile } from "../hooks/useIsMobile";
import Panel from "../components/Panel";
import Card from "../components/Card";
import Button from "../components/Button";

const TABS = [
  { key: "admin", label: "관리자 모바일", path: "/" },
  // 직원 모바일은 별도 로그인이 필요하다 — iframe이 이 관리자 세션의
  // localStorage/IndexedDB를 그대로 공유하므로, 이미 로그인된 상태에서는
  // "/login"으로 이동해도 곧바로 지금 로그인된 화면으로 되돌아간다(정상
  // 동작 — 로그인된 사용자를 로그인 화면에 그대로 두지 않는 보호 로직과
  // 동일). 완전히 로그아웃된 상태의 화면을 보려면 이 관리자 계정에서
  // 로그아웃한 뒤 새로고침해서 확인한다.
  { key: "employee", label: "직원 모바일 (로그인 화면)", path: "/login" },
];

// 최고관리자 전용 — 실제 배포된 페이지를 좁은 폭의 iframe에 그대로 띄워서
// PC에서도 모바일 전용 화면(관리자 모바일 하단탭 UI, 직원 모바일 UI)을
// 별도 기기 없이 바로 확인할 수 있게 한다. 앱의 모바일/PC 분기는 뷰포트
// 폭 기준(useIsMobile, 768px 미만)이라 iframe 자체를 좁게 만들면 그 안에서
// 자동으로 모바일 전용 화면이 렌더링된다 — 관리자 모바일 쪽은 지금
// 로그인되어 있는 이 세션을 그대로 공유해서 실제 데이터로 보인다.
export default function MobilePreview() {
  const { isSuperAdmin } = useAuth();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("admin");
  const [reloadKey, setReloadKey] = useState(0);

  const activeTab = useMemo(() => TABS.find((t) => t.key === tab) || TABS[0], [tab]);

  if (!isSuperAdmin) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <Panel icon={Smartphone} title="모바일 미리보기">
        {isMobile ? (
          <Card className="p-8 text-center text-sm text-muted">이 기능은 PC 화면에서만 사용할 수 있습니다.</Card>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                      tab === t.key ? "bg-primary text-white" : "border border-slate-200 bg-white text-muted"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
                  <RefreshCw size={13} /> 새로고침
                </Button>
                <a href={activeTab.path} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline">
                    <ExternalLink size={13} /> 새 탭에서 열기
                  </Button>
                </a>
              </div>
            </div>

            <p className="text-xs text-muted">
              {tab === "admin"
                ? "지금 로그인된 관리자 계정 그대로, 실제 화면 폭이 좁을 때(모바일)와 동일한 하단탭 UI가 표시됩니다."
                : "직원 계정은 별도 로그인이 필요합니다. 지금 로그인되어 있는 상태라면 로그인 화면 대신 그 계정의 모바일 화면이 보일 수 있습니다 — 로그아웃 후 새로고침하면 실제 로그인 화면을 확인할 수 있습니다."}
            </p>

            <div className="flex justify-center">
              <div className="rounded-[2.5rem] border-[10px] border-slate-900 bg-slate-900 p-0 shadow-2xl" style={{ width: 390 + 20 }}>
                <div className="relative overflow-hidden rounded-[1.75rem] bg-white" style={{ width: 390, height: 844 }}>
                  <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-slate-900" />
                  <iframe
                    key={`${tab}-${reloadKey}`}
                    src={activeTab.path}
                    title="모바일 미리보기"
                    className="h-full w-full border-0"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
