// ======================= src/mobile/MobileEasyMode.jsx =======================
// 쉬운모드(easyMode) 전용 대체 UI.
// - 100% 자체완결형 UI. Firestore 쓰기는 전혀 하지 않고, 전달받은 콜백(props)만 호출한다.
// - 4개 메뉴(배차등록/배차현황/미배차현황/운임조회) + 배차정보(차량) 입력 화면으로 구성된
//   아주 단순한 화면 전환 앱. 큰 글씨/큰 버튼/최소 입력 항목을 지향한다.
import React, { useMemo, useState } from "react";
import {
  Truck,
  ClipboardList,
  PackageSearch,
  Wallet,
  ChevronLeft,
  CheckCircle2,
  Plus,
  LogOut,
  X,
} from "lucide-react";

const NAVY = "#1B2B4B";
const VEHICLE_TYPES = ["카고", "윙바디", "냉장", "냉동", "탑차"];

// ----------------------------------------------------------------
// 공용 유틸
// ----------------------------------------------------------------
const todayLocal = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

const fmtMoney = (v) => `${(Number(v) || 0).toLocaleString("ko-KR")}원`;

const onlyDigits = (v = "") => String(v).replace(/[^\d]/g, "");

const normalizeText = (s = "") => String(s).toLowerCase().replace(/\s+/g, "");

const getPickupDate = (o = {}) => String(o.상차일 || "").slice(0, 10);

const getCreatedMs = (o = {}) => {
  if (o.createdAt?.seconds) return o.createdAt.seconds * 1000;
  if (o.등록일) return new Date(o.등록일).getTime() || 0;
  return 0;
};

// 상태 뱃지 색상 — 일반모드 TP_FLAT_CLASS와 동일한 3색 체계를 그대로 사용
function getEasyStatusInfo(order = {}) {
  const hasCar = !!String(order.차량번호 || "").trim();
  const isCancelled = order.상태 === "취소" || order.배차상태 === "취소" || order.배차거절 === true;
  if (isCancelled) return { label: "취소", className: "bg-red-100 text-red-700" };
  if (hasCar) return { label: "배차완료", className: "text-white" };
  return { label: "배차중", className: "bg-amber-100 text-amber-800" };
}

function StatusPill({ order }) {
  const { label, className } = getEasyStatusInfo(order);
  const style = label === "배차완료" ? { backgroundColor: NAVY } : undefined;
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-sm font-bold whitespace-nowrap ${className}`}
      style={style}
    >
      {label}
    </span>
  );
}

// ----------------------------------------------------------------
// 공용 뷰 조각
// ----------------------------------------------------------------
function TopBar({ title, onBack, right }) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-4 shrink-0"
      style={{ backgroundColor: NAVY }}
    >
      {onBack ? (
        <button
          onClick={onBack}
          className="w-12 h-12 -ml-2 flex items-center justify-center rounded-full active:bg-white/10"
          aria-label="뒤로가기"
        >
          <ChevronLeft className="w-8 h-8 text-white" />
        </button>
      ) : (
        <div className="w-12 h-12 -ml-2" />
      )}
      <h1 className="flex-1 text-xl font-extrabold text-white truncate">{title}</h1>
      {right}
    </div>
  );
}

function BigMenuButton({ icon, label, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 bg-white rounded-3xl px-5 py-6 shadow-md active:scale-[0.98] transition-transform border border-black/5"
    >
      <div
        className="w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center"
        style={{ backgroundColor: "#EEF1F7" }}
      >
        {icon}
      </div>
      <div className="flex-1 text-left">
        <div className="text-xl font-extrabold" style={{ color: NAVY }}>
          {label}
        </div>
        {sub && <div className="text-sm text-gray-500 mt-0.5">{sub}</div>}
      </div>
    </button>
  );
}

function FieldLabel({ children }) {
  return <div className="text-base font-bold text-gray-700 mb-2">{children}</div>;
}

function BigInput(props) {
  return (
    <input
      {...props}
      className={`w-full text-lg rounded-2xl border-2 border-gray-200 px-4 py-4 focus:outline-none focus:border-[#1B2B4B] ${props.className || ""}`}
      style={{ ...(props.style || {}) }}
    />
  );
}

function PrimaryButton({ children, onClick, disabled, className = "" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-5 rounded-2xl text-xl font-extrabold text-white transition-transform active:scale-[0.98] ${
        disabled ? "opacity-40" : ""
      } ${className}`}
      style={{ backgroundColor: NAVY }}
    >
      {children}
    </button>
  );
}

function SuccessOverlay({ text, onDone }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8"
      onClick={onDone}
    >
      <div className="bg-white rounded-3xl px-8 py-10 flex flex-col items-center gap-3 shadow-2xl max-w-xs w-full">
        <CheckCircle2 className="w-16 h-16 text-emerald-500" />
        <div className="text-2xl font-extrabold" style={{ color: NAVY }}>
          {text}
        </div>
        <div className="text-sm text-gray-400 mt-1">화면을 누르면 바로 돌아갑니다</div>
      </div>
    </div>
  );
}

function ErrorBanner({ text }) {
  if (!text) return null;
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 text-base font-semibold rounded-2xl px-4 py-3 mb-4">
      {text}
    </div>
  );
}

function OrderCard({ order, onClick }) {
  const hasCar = !!String(order.차량번호 || "").trim();
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-3xl p-5 shadow-sm border border-black/5 active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center justify-between mb-2">
        <StatusPill order={order} />
        <span className="text-sm font-bold text-gray-400">
          {getPickupDate(order) || "-"}
        </span>
      </div>
      <div className="text-xl font-extrabold text-gray-900 leading-snug break-keep">
        {order.상차지명 || "-"} → {order.하차지명 || "-"}
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-base text-gray-500 truncate">{order.화물내용 || ""}</span>
        <span className="text-2xl font-extrabold" style={{ color: NAVY }}>
          {fmtMoney(order.청구운임)}
        </span>
      </div>
      {hasCar && (
        <div className="mt-2 text-base text-gray-600 font-semibold">
          {order.차량번호} · {order.기사명 || "-"}
        </div>
      )}
    </button>
  );
}

// ==================================================================
// 홈 화면
// ==================================================================
function HomeScreen({ unassignedCount, onNavigate, onExitEasyMode, onLogout }) {
  return (
    <div className="flex-1 flex flex-col">
      <div
        className="px-5 pt-6 pb-8 shrink-0"
        style={{ backgroundColor: NAVY }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-white/60 text-sm font-bold">KP-Flow</div>
            <div className="text-white text-2xl font-extrabold mt-1">쉬운모드</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={onExitEasyMode}
              className="px-4 py-2.5 rounded-full bg-white/15 text-white text-sm font-bold active:bg-white/25"
            >
              일반모드로 전환
            </button>
            {onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-1 px-3 py-1.5 text-white/60 text-sm font-semibold active:text-white/90"
              >
                <LogOut className="w-4 h-4" /> 로그아웃
              </button>
            )}
          </div>
        </div>
        <div className="mt-6 bg-white/10 rounded-2xl px-4 py-3">
          <span className="text-white text-lg font-bold">
            오늘 미배차 {unassignedCount}건
          </span>
        </div>
      </div>

      <div className="flex-1 px-5 py-6 flex flex-col gap-4" style={{ backgroundColor: "#F4F6F9" }}>
        <BigMenuButton
          icon={<Plus className="w-8 h-8" style={{ color: NAVY }} />}
          label="배차등록"
          sub="새 화물을 아주 간단하게 등록해요"
          onClick={() => onNavigate("register")}
        />
        <BigMenuButton
          icon={<ClipboardList className="w-8 h-8" style={{ color: NAVY }} />}
          label="배차현황"
          sub="등록된 배차 목록을 확인해요"
          onClick={() => onNavigate("list")}
        />
        <BigMenuButton
          icon={<Truck className="w-8 h-8" style={{ color: NAVY }} />}
          label="미배차현황"
          sub="차량 배정이 필요한 화물이에요"
          onClick={() => onNavigate("unassigned")}
        />
        <BigMenuButton
          icon={<Wallet className="w-8 h-8" style={{ color: NAVY }} />}
          label="운임조회"
          sub="예전 운임을 간단히 찾아봐요"
          onClick={() => onNavigate("fare")}
        />
      </div>
    </div>
  );
}

// ==================================================================
// 배차등록 화면
// ==================================================================
function RegisterScreen({ clients, role, onSubmitRegister, onBack, onDone }) {
  const [거래처명, set거래처명] = useState("");
  const [상차지명, set상차지명] = useState("");
  const [하차지명, set하차지명] = useState("");
  const [상차일, set상차일] = useState(todayLocal());
  const [화물내용, set화물내용] = useState("");
  const [차량종류, set차량종류] = useState("");
  const [톤수, set톤수] = useState("");
  const [청구운임Digits, set청구운임Digits] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const isViewer = role === "viewer";
  const canSubmit = 상차지명.trim() && 하차지명.trim() && !submitting && !isViewer;

  const clientNames = useMemo(() => {
    const set = new Set();
    (clients || []).forEach((c) => {
      if (c?.거래처명?.trim()) set.add(c.거래처명.trim());
    });
    return Array.from(set).slice(0, 200);
  }, [clients]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    const result = await onSubmitRegister({
      거래처명: 거래처명.trim(),
      상차지명: 상차지명.trim(),
      하차지명: 하차지명.trim(),
      상차일,
      화물내용: 화물내용.trim(),
      차량종류,
      톤수: 톤수.trim(),
      청구운임: 청구운임Digits,
    });
    setSubmitting(false);
    if (result?.ok) {
      setDone(true);
      setTimeout(onDone, 1200);
    } else {
      setError(result?.error || "등록에 실패했습니다. 다시 시도해주세요.");
    }
  };

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: "#F4F6F9" }}>
      <TopBar title="배차등록" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <ErrorBanner text={error} />
        {isViewer && (
          <div className="bg-gray-100 text-gray-500 text-sm font-semibold rounded-2xl px-4 py-3 mb-4">
            조회전용 권한으로는 등록할 수 없습니다.
          </div>
        )}

        <div className="mb-5">
          <FieldLabel>거래처명 (선택)</FieldLabel>
          <BigInput
            list="ez-client-list"
            value={거래처명}
            onChange={(e) => set거래처명(e.target.value)}
            placeholder="거래처명을 입력하세요"
          />
          <datalist id="ez-client-list">
            {clientNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        <div className="mb-5">
          <FieldLabel>상차지 *</FieldLabel>
          <BigInput
            value={상차지명}
            onChange={(e) => set상차지명(e.target.value)}
            placeholder="예: 서울 강남구 물류센터"
          />
        </div>

        <div className="mb-5">
          <FieldLabel>하차지 *</FieldLabel>
          <BigInput
            value={하차지명}
            onChange={(e) => set하차지명(e.target.value)}
            placeholder="예: 부산 사하구 공장"
          />
        </div>

        <div className="mb-5">
          <FieldLabel>상차일</FieldLabel>
          <BigInput type="date" value={상차일} onChange={(e) => set상차일(e.target.value)} />
        </div>

        <div className="mb-5">
          <FieldLabel>화물내용</FieldLabel>
          <BigInput
            value={화물내용}
            onChange={(e) => set화물내용(e.target.value)}
            placeholder="예: 3파레트"
          />
        </div>

        <div className="mb-5">
          <FieldLabel>차량종류</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {VEHICLE_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => set차량종류((prev) => (prev === t ? "" : t))}
                className={`px-5 py-3 rounded-2xl text-lg font-bold border-2 ${
                  차량종류 === t
                    ? "text-white border-transparent"
                    : "bg-white text-gray-600 border-gray-200"
                }`}
                style={차량종류 === t ? { backgroundColor: NAVY } : undefined}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <FieldLabel>톤수</FieldLabel>
          <BigInput
            value={톤수}
            onChange={(e) => set톤수(e.target.value)}
            placeholder="예: 5톤"
            inputMode="decimal"
          />
        </div>

        <div className="mb-6">
          <FieldLabel>청구운임</FieldLabel>
          <div className="relative">
            <BigInput
              value={청구운임Digits ? Number(청구운임Digits).toLocaleString("ko-KR") : ""}
              onChange={(e) => set청구운임Digits(onlyDigits(e.target.value))}
              placeholder="0"
              inputMode="numeric"
              className="pr-14"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lg font-bold text-gray-400">
              원
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 shrink-0 bg-white border-t border-gray-100">
        <PrimaryButton onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? "등록 중..." : "등록하기"}
        </PrimaryButton>
      </div>

      {done && <SuccessOverlay text="등록 완료" onDone={onDone} />}
    </div>
  );
}

// ==================================================================
// 목록 화면 (배차현황 / 미배차현황 공용)
// ==================================================================
function OrderListScreen({
  title,
  orders,
  emptyText,
  onBack,
  onOpenOrder,
  onOpenDetail,
  showAddButton,
  onAdd,
}) {
  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: "#F4F6F9" }}>
      <TopBar title={title} onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {showAddButton && (
          <button
            onClick={onAdd}
            className="w-full flex items-center justify-center gap-2 mb-5 py-4 rounded-2xl text-white text-lg font-extrabold active:scale-[0.98] transition-transform"
            style={{ backgroundColor: NAVY }}
          >
            <Plus className="w-6 h-6" /> 새 배차 등록
          </button>
        )}

        {orders.length === 0 ? (
          <div className="text-center text-gray-400 text-lg font-semibold py-16">
            {emptyText}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map((o) => {
              const hasCar = !!String(o.차량번호 || "").trim();
              return (
                <OrderCard
                  key={o._id || o.id}
                  order={o}
                  onClick={() => (hasCar ? onOpenDetail(o) : onOpenOrder(o))}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderDetailSheet({ order, onClose }) {
  if (!order) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div
        className="bg-white w-full rounded-t-3xl px-6 py-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-xl font-extrabold" style={{ color: NAVY }}>
            배차 상세
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full active:bg-gray-100">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>
        <div className="flex flex-col gap-3 text-lg">
          <Row label="상차지" value={order.상차지명} />
          <Row label="하차지" value={order.하차지명} />
          <Row label="상차일" value={getPickupDate(order)} />
          <Row label="화물내용" value={order.화물내용} />
          <Row label="톤수" value={order.차량톤수 || order.톤수} />
          <Row label="차량번호" value={order.차량번호} />
          <Row label="기사명" value={order.기사명} />
          <Row label="청구운임" value={fmtMoney(order.청구운임)} />
          <Row label="기사운임" value={fmtMoney(order.기사운임)} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
      <span className="text-gray-400 font-semibold">{label}</span>
      <span className="font-bold text-gray-900 text-right">{value || "-"}</span>
    </div>
  );
}

// ==================================================================
// 차량정보 입력(배차완료) 화면
// ==================================================================
function AssignScreen({ order, drivers, role, onAssignVehicle, onBack, onDone }) {
  const [차량번호, set차량번호] = useState("");
  const [기사명, set기사명] = useState("");
  const [전화번호, set전화번호] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const isViewer = role === "viewer";
  const canSubmit = 차량번호.trim() && !submitting && !isViewer;

  const recentDrivers = useMemo(() => {
    const list = [...(drivers || [])];
    list.sort((a, b) => {
      const ta = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
      const tb = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
      return tb - ta;
    });
    const seen = new Set();
    const out = [];
    for (const d of list) {
      const key = normalizeText(d.차량번호);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(d);
      if (out.length >= 3) break;
    }
    return out;
  }, [drivers]);

  const applyDriver = (d) => {
    set차량번호(d.차량번호 || "");
    set기사명(d.이름 || "");
    set전화번호(d.전화번호 || "");
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    const result = await onAssignVehicle(order, {
      차량번호: 차량번호.trim(),
      기사명: 기사명.trim(),
      전화번호: 전화번호.trim(),
    });
    setSubmitting(false);
    if (result?.ok) {
      setDone(true);
      setTimeout(onDone, 1200);
    } else {
      setError(result?.error || "저장에 실패했습니다. 다시 시도해주세요.");
    }
  };

  if (!order) return null;

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: "#F4F6F9" }}>
      <TopBar title="차량정보 입력" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="bg-white rounded-3xl p-5 mb-6 shadow-sm border border-black/5">
          <div className="text-lg font-extrabold text-gray-900 break-keep">
            {order.상차지명 || "-"} → {order.하차지명 || "-"}
          </div>
          <div className="text-base text-gray-500 mt-1">
            상차일 {getPickupDate(order) || "-"}
          </div>
        </div>

        <ErrorBanner text={error} />
        {isViewer && (
          <div className="bg-gray-100 text-gray-500 text-sm font-semibold rounded-2xl px-4 py-3 mb-4">
            조회전용 권한으로는 배차할 수 없습니다.
          </div>
        )}

        <div className="mb-5">
          <FieldLabel>차량번호 *</FieldLabel>
          <BigInput
            value={차량번호}
            onChange={(e) => set차량번호(e.target.value)}
            placeholder="예: 12가3456"
          />
        </div>

        {recentDrivers.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {recentDrivers.map((d) => (
              <button
                key={d.id}
                onClick={() => applyDriver(d)}
                className="px-4 py-2.5 rounded-2xl bg-white border-2 border-gray-200 text-base font-bold text-gray-700 active:scale-95 transition-transform"
              >
                {d.차량번호} {d.이름 ? `· ${d.이름}` : ""}
              </button>
            ))}
          </div>
        )}

        <div className="mb-5">
          <FieldLabel>기사명</FieldLabel>
          <BigInput value={기사명} onChange={(e) => set기사명(e.target.value)} placeholder="기사님 성함" />
        </div>

        <div className="mb-5">
          <FieldLabel>전화번호</FieldLabel>
          <BigInput
            value={전화번호}
            onChange={(e) => set전화번호(onlyDigits(e.target.value))}
            placeholder="01012345678"
            inputMode="tel"
          />
        </div>
      </div>

      <div className="px-5 py-4 shrink-0 bg-white border-t border-gray-100">
        <PrimaryButton onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? "저장 중..." : "배차완료"}
        </PrimaryButton>
      </div>

      {done && <SuccessOverlay text="배차 완료" onDone={onDone} />}
    </div>
  );
}

// ==================================================================
// 운임조회 화면
// ==================================================================
function FareScreen({ orders, onBack }) {
  const [상차지, set상차지] = useState("");
  const [하차지, set하차지] = useState("");
  const [results, setResults] = useState(null);

  const handleSearch = () => {
    const p = normalizeText(상차지);
    const d = normalizeText(하차지);
    if (!p && !d) {
      setResults([]);
      return;
    }
    const matched = (orders || [])
      .filter((o) => (Number(o.청구운임) || 0) > 0)
      .filter((o) => {
        const op = normalizeText(o.상차지명);
        const od = normalizeText(o.하차지명);
        if (p && !op.includes(p)) return false;
        if (d && !od.includes(d)) return false;
        return true;
      })
      .sort((a, b) => getCreatedMs(b) - getCreatedMs(a))
      .slice(0, 15);
    setResults(matched);
  };

  const summary = useMemo(() => {
    if (!results || results.length < 2) return null;
    const fares = results.map((o) => Number(o.청구운임) || 0);
    const min = Math.min(...fares);
    const max = Math.max(...fares);
    const avg = Math.round(fares.reduce((a, b) => a + b, 0) / fares.length);
    return { min, max, avg };
  }, [results]);

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: "#F4F6F9" }}>
      <TopBar title="운임조회" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mb-4">
          <FieldLabel>상차지</FieldLabel>
          <BigInput value={상차지} onChange={(e) => set상차지(e.target.value)} placeholder="예: 서울" />
        </div>
        <div className="mb-5">
          <FieldLabel>하차지</FieldLabel>
          <BigInput value={하차지} onChange={(e) => set하차지(e.target.value)} placeholder="예: 부산" />
        </div>
        <button
          onClick={handleSearch}
          className="w-full py-5 rounded-2xl text-xl font-extrabold text-white active:scale-[0.98] transition-transform mb-6"
          style={{ backgroundColor: NAVY }}
        >
          조회
        </button>

        {results !== null && (
          <>
            {summary && (
              <div className="bg-white rounded-2xl px-5 py-4 mb-4 shadow-sm border border-black/5 flex justify-between text-center">
                <div>
                  <div className="text-xs text-gray-400 font-bold">최저</div>
                  <div className="text-lg font-extrabold" style={{ color: NAVY }}>
                    {fmtMoney(summary.min)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 font-bold">평균</div>
                  <div className="text-lg font-extrabold" style={{ color: NAVY }}>
                    {fmtMoney(summary.avg)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 font-bold">최고</div>
                  <div className="text-lg font-extrabold" style={{ color: NAVY }}>
                    {fmtMoney(summary.max)}
                  </div>
                </div>
              </div>
            )}

            {results.length === 0 ? (
              <div className="text-center text-gray-400 text-lg font-semibold py-16">
                일치하는 운임 기록이 없습니다.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {results.map((o) => (
                  <div
                    key={o._id || o.id}
                    className="bg-white rounded-3xl p-5 shadow-sm border border-black/5"
                  >
                    <div className="flex items-center justify-between mb-2 text-sm font-bold text-gray-400">
                      <span>{getPickupDate(o) || "-"}</span>
                    </div>
                    <div className="text-lg font-extrabold text-gray-900 break-keep">
                      {o.상차지명 || "-"} → {o.하차지명 || "-"}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-base text-gray-500 truncate">
                        {o.화물내용 || ""} {o.차량톤수 || o.톤수 || ""}
                      </span>
                      <span className="text-2xl font-extrabold" style={{ color: NAVY }}>
                        {fmtMoney(o.청구운임)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ==================================================================
// 메인 컴포넌트
// ==================================================================
export default function MobileEasyMode({
  orders = [],
  unassignedOrders = [],
  drivers = [],
  clients = [],
  currentUser,
  userCompany,
  role,
  onExitEasyMode,
  onSubmitRegister,
  onAssignVehicle,
  showToast,
  showSuccess,
  onLogout,
}) {
  const [screen, setScreen] = useState("home");
  const [assignOrder, setAssignOrder] = useState(null);
  const [assignFrom, setAssignFrom] = useState("list");
  const [detailOrder, setDetailOrder] = useState(null);

  const today = todayLocal();
  const todayUnassignedCount = useMemo(
    () => unassignedOrders.filter((o) => getPickupDate(o) === today).length,
    [unassignedOrders, today]
  );

  const sortedListOrders = useMemo(() => {
    return [...orders].sort((a, b) => getCreatedMs(b) - getCreatedMs(a));
  }, [orders]);

  const sortedUnassignedOrders = useMemo(() => {
    return [...unassignedOrders].sort((a, b) => {
      const da = getPickupDate(a) || "9999-99-99";
      const db = getPickupDate(b) || "9999-99-99";
      return da.localeCompare(db);
    });
  }, [unassignedOrders]);

  const goHome = () => setScreen("home");

  const openAssign = (order, from) => {
    setAssignOrder(order);
    setAssignFrom(from);
    setScreen("assign");
  };

  return (
    <div
      className="w-full min-h-screen flex flex-col relative"
      style={{ backgroundColor: "#F4F6F9" }}
    >
      {screen === "home" && (
        <HomeScreen
          unassignedCount={todayUnassignedCount}
          onNavigate={setScreen}
          onExitEasyMode={onExitEasyMode}
          onLogout={onLogout}
        />
      )}

      {screen === "register" && (
        <RegisterScreen
          clients={clients}
          role={role}
          onSubmitRegister={onSubmitRegister}
          onBack={goHome}
          onDone={goHome}
        />
      )}

      {screen === "list" && (
        <OrderListScreen
          title="배차현황"
          orders={sortedListOrders}
          emptyText="등록된 배차가 없습니다."
          onBack={goHome}
          onOpenOrder={(o) => openAssign(o, "list")}
          onOpenDetail={(o) => setDetailOrder(o)}
          showAddButton
          onAdd={() => setScreen("register")}
        />
      )}

      {screen === "unassigned" && (
        <OrderListScreen
          title="미배차현황"
          orders={sortedUnassignedOrders}
          emptyText="미배차 화물이 없습니다."
          onBack={goHome}
          onOpenOrder={(o) => openAssign(o, "unassigned")}
          onOpenDetail={(o) => openAssign(o, "unassigned")}
          showAddButton={false}
        />
      )}

      {screen === "assign" && (
        <AssignScreen
          order={assignOrder}
          drivers={drivers}
          role={role}
          onAssignVehicle={onAssignVehicle}
          onBack={() => setScreen(assignFrom)}
          onDone={() => {
            setAssignOrder(null);
            setScreen(assignFrom);
          }}
        />
      )}

      {screen === "fare" && <FareScreen orders={orders} onBack={goHome} />}

      {detailOrder && (
        <OrderDetailSheet order={detailOrder} onClose={() => setDetailOrder(null)} />
      )}
    </div>
  );
}
