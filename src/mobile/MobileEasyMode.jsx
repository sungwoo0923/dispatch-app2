// ======================= src/mobile/MobileEasyMode.jsx =======================
// 쉬운모드(easyMode) 전용 대체 UI.
// - 100% 자체완결형 UI. Firestore 쓰기는 전혀 하지 않고, 전달받은 콜백(props)만 호출한다.
// - 4개 메뉴(배차등록/배차현황/미배차현황/운임조회) + 배차정보(차량) 입력 화면으로 구성된
//   단순한 화면 전환 앱이지만, 일반모드에 있는 핵심 기능(스마트검색/자동완성/담당자 등)은
//   큰 글씨/큰 버튼 톤에 맞춰 그대로 제공한다.
import React, { useMemo, useState } from "react";
import {
  Truck,
  ClipboardList,
  Wallet,
  ChevronLeft,
  CheckCircle2,
  Plus,
  LogOut,
  X,
  Scale,
  Package,
  Snowflake,
  Car,
  Bike,
  Forklift,
  StickyNote,
} from "lucide-react";

const NAVY = "#1B2B4B";

const VEHICLE_TYPES = [
  "카고", "윙바디", "탑차", "냉장탑", "냉동탑", "냉장윙", "냉동윙",
  "냉장/냉동탑", "냉장/냉동윙", "라보/다마스", "리프트", "오토바이", "기타",
];

// 차량종류 구분 아이콘 — 알록달록한 색 이모지 대신 프로그램 아이콘과 동일한
// 단색 라인 아이콘(lucide)으로 구분한다.
function VehicleTypeIcon({ type = "", className = "" }) {
  const s = String(type);
  if (s.includes("냉동") || s.includes("냉장")) return <Snowflake className={className} />;
  if (s.includes("라보") || s.includes("다마스")) return <Car className={className} />;
  if (s.includes("오토바이")) return <Bike className={className} />;
  if (s.includes("리프트")) return <Forklift className={className} />;
  return <Truck className={className} />;
}

const TON_PRESETS = ["1톤", "1.4톤", "2.5톤", "3.5톤", "5톤", "8톤", "11톤", "15톤", "18톤", "25톤"];
const PALLET_PRESETS = Array.from({ length: 18 }, (_, i) => `${i + 1}파레트`);
const PAYMENT_METHODS = ["계산서", "착불", "선불", "개인", "손실", "취소"];
const DISPATCH_METHODS = ["24시", "직접배차", "인성", "고정기사"];
const LOAD_METHODS = ["지게차", "크레인", "수작업", "직접수작업", "수도움"];

// ----------------------------------------------------------------
// 공용 유틸
// ----------------------------------------------------------------
const todayLocal = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

const tomorrowLocal = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);
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

const fmtDateHeader = (dateStr, todayStr, tomorrowStr) => {
  if (!dateStr || dateStr === "9999-99-99") return "날짜 미정";
  const tag = dateStr === todayStr ? " (오늘)" : dateStr === tomorrowStr ? " (내일)" : "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${Number(parts[1])}/${Number(parts[2])}${tag}`;
};

const buildHalfHourTimes = () => {
  const list = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? "오전" : "오후";
      list.push(m === 0 ? `${ampm} ${hour12}시` : `${ampm} ${hour12}시 ${m}분`);
    }
  }
  return list;
};
const TIME_OPTIONS = buildHalfHourTimes();

// 상태 뱃지 색상 — 일반모드 TP_FLAT_CLASS와 동일한 3색 체계를 그대로 사용
function getEasyStatusInfo(order = {}) {
  const hasCar = !!String(order.차량번호 || "").trim();
  const isCancelled = order.상태 === "취소" || order.배차상태 === "취소" || order.배차거절 === true;
  if (isCancelled) return { label: "취소", className: "bg-red-100 text-red-700" };
  if (hasCar) return { label: "배차완료", className: "text-white" };
  return { label: "배차중", className: "bg-gray-100 text-gray-600" };
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

// 상/하 구분 뱃지 — 일반모드 cardVersionA와 동일한 색(파랑=상, 회색=하)
function DirBadge({ dir }) {
  const isPickup = dir === "상";
  return (
    <span
      className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[11px] font-bold text-white shrink-0 ${
        isPickup ? "bg-blue-500" : "bg-gray-500"
      }`}
    >
      {dir}
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

// 선택 드롭다운 (차량종류/지급방식/배차방식/상하차방법 공용) — 버튼 나열 대신
// 프로그램 톤에 맞는 단정한 select 드롭다운으로 통일한다.
function SelectField({ label, value, onChange, options, optional = true, placeholder = "선택 안함" }) {
  return (
    <div className="mb-5">
      <FieldLabel>{optional ? `${label} (선택)` : label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-lg rounded-2xl border-2 border-gray-200 px-4 py-4 focus:outline-none focus:border-[#1B2B4B] bg-white"
      >
        <option value="">{placeholder}</option>
        {options.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  );
}

// 프리셋 드롭다운 + 직접입력 전환 (톤수/화물내용 등)
function PresetOrCustomField({ label, value, onChange, presets, placeholder }) {
  const [mode, setMode] = useState(() => (value && !presets.includes(value) ? "custom" : "preset"));
  return (
    <div className="mb-5">
      <FieldLabel>{label}</FieldLabel>
      <select
        value={mode === "preset" ? value : "__custom__"}
        onChange={(e) => {
          if (e.target.value === "__custom__") {
            setMode("custom");
            onChange("");
          } else {
            setMode("preset");
            onChange(e.target.value);
          }
        }}
        className="w-full text-lg rounded-2xl border-2 border-gray-200 px-4 py-4 focus:outline-none focus:border-[#1B2B4B] mb-2 bg-white"
      >
        <option value="">선택 안함</option>
        {presets.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value="__custom__">직접입력</option>
      </select>
      {mode === "custom" && (
        <BigInput value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}

// 날짜 + 반시간 단위 시간 select + 이전/이후 버튼
function TimeField({ label, date, onDate, time, onTime, basis, onBasis }) {
  return (
    <div className="mb-5">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-2">
        <BigInput type="date" value={date} onChange={(e) => onDate(e.target.value)} className="flex-1" />
        <select
          value={time}
          onChange={(e) => onTime(e.target.value)}
          className="flex-1 text-lg rounded-2xl border-2 border-gray-200 px-3 py-4 focus:outline-none focus:border-[#1B2B4B] bg-white"
        >
          <option value="">시간선택</option>
          {TIME_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {time && (
        <div className="flex gap-2 mt-2">
          {["이전", "이후"].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onBasis(basis === v ? null : v)}
              className={`flex-1 py-2.5 rounded-xl text-base font-bold border-2 ${
                basis === v ? "text-white border-transparent" : "bg-white text-[#1B2B4B] border-[#1B2B4B]/30"
              }`}
              style={basis === v ? { backgroundColor: NAVY } : undefined}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 거래처명/상하차지명 유사도 검색 드롭다운 입력
function SearchDropdownInput({ value, onChange, onSelect, candidates, placeholder }) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = normalizeText(value);
    if (!q) return [];
    return candidates.filter((c) => normalizeText(c.거래처명).includes(q)).slice(0, 8);
  }, [candidates, value]);

  return (
    <div className="relative">
      <BigInput
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-50 w-full bg-white border-2 border-gray-200 rounded-2xl shadow-lg mt-1 max-h-64 overflow-y-auto">
          {matches.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 active:bg-gray-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(c);
                setOpen(false);
              }}
            >
              <div className="text-lg font-bold text-gray-900">{c.거래처명}</div>
              {c.주소 && <div className="text-sm text-gray-400 mt-0.5 truncate">{c.주소}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 담당자가 여러 명일 때 선택하는 팝업
function ContactPickerModal({ contacts, onSelect, onClose }) {
  if (!contacts || contacts.length === 0) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end" onClick={onClose}>
      <div
        className="bg-white w-full rounded-t-3xl px-6 py-6 max-h-[70vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-xl font-extrabold" style={{ color: NAVY }}>담당자 선택</div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full active:bg-gray-100">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {contacts.map((c, i) => (
            <button
              key={i}
              onClick={() => onSelect(c)}
              className="w-full text-left px-4 py-3 rounded-2xl border-2 border-gray-200 active:bg-gray-50"
            >
              <div className="text-lg font-bold text-gray-900 flex items-center gap-2">
                {c.name || "-"}
                {c.isPrimary && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">주담당</span>
                )}
              </div>
              <div className="text-base text-gray-500 mt-0.5">{c.phone || "-"}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function OrderCard({ order, onClick, variant, onOpenFare }) {
  const hasCar = !!String(order.차량번호 || "").trim();
  const showExtra = variant === "unassigned";
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className="w-full text-left bg-white rounded-3xl p-5 shadow-sm border border-black/5 active:scale-[0.98] transition-transform cursor-pointer"
    >
      <div className="flex items-center justify-between mb-2">
        <StatusPill order={order} />
        <div className="flex items-center gap-2">
          {onOpenFare && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenFare(order); }}
              className="text-sm font-bold px-3 py-1 rounded-full border-2"
              style={{ borderColor: NAVY, color: NAVY }}
            >
              운임조회
            </button>
          )}
          <span className="text-sm font-bold text-gray-400">
            {getPickupDate(order) || "-"}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1 mb-1">
        <div className="flex items-center gap-1.5 text-xl font-extrabold text-gray-900 leading-snug break-keep">
          <DirBadge dir="상" />
          <span>{order.상차지명 || "-"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xl font-extrabold text-gray-900 leading-snug break-keep">
          <DirBadge dir="하" />
          <span>{order.하차지명 || "-"}</span>
        </div>
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-base text-gray-700 font-semibold truncate inline-flex items-center gap-1">
          <Package className="w-4 h-4 shrink-0" /> {order.화물내용 || "-"}
        </span>
        <span className="text-2xl font-extrabold" style={{ color: NAVY }}>
          {fmtMoney(order.청구운임)}
        </span>
      </div>
      {showExtra && (order.차량종류 || order.차량톤수 || order.톤수 || order.메모) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-base text-gray-900 font-bold">
          {order.차량종류 && (
            <span className="inline-flex items-center gap-1">
              <VehicleTypeIcon type={order.차량종류} className="w-4 h-4 text-gray-500 shrink-0" /> {order.차량종류}
            </span>
          )}
          {(order.차량톤수 || order.톤수) && (
            <span className="inline-flex items-center gap-1">
              <Scale className="w-4 h-4 text-gray-500 shrink-0" /> {order.차량톤수 || order.톤수}
            </span>
          )}
          {order.메모 && (
            <span className="text-gray-500 font-semibold truncate inline-flex items-center gap-1">
              <StickyNote className="w-4 h-4 shrink-0" /> {order.메모}
            </span>
          )}
        </div>
      )}
      {hasCar && (
        <div className="mt-2 text-base text-gray-600 font-semibold inline-flex items-center gap-1">
          <Truck className="w-4 h-4 shrink-0" /> {order.차량번호} · {order.기사명 || "-"}
        </div>
      )}
    </div>
  );
}

// ==================================================================
// 홈 화면
// ==================================================================
function HomeScreen({ unassignedCount, onNavigate, onExitEasyMode, onLogout, easyScale, onChangeEasyScale }) {
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

        <div className="mt-5 flex items-center justify-between bg-white/10 rounded-2xl px-4 py-3 gap-3">
          <span className="text-white text-sm font-bold shrink-0">글자 크기</span>
          <div className="flex gap-1.5">
            {[{ v: 1, l: "기본" }, { v: 1.15, l: "크게" }, { v: 1.3, l: "아주크게" }].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => onChangeEasyScale(v)}
                className={`px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${
                  easyScale === v ? "bg-white text-[#1B2B4B]" : "bg-white/15 text-white active:bg-white/25"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 bg-white/10 rounded-2xl px-4 py-3">
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
function RegisterScreen({ clients, places, role, onSubmitRegister, onBack, onDone }) {
  const [거래처명, set거래처명] = useState("");
  const [상차지명, set상차지명] = useState("");
  const [상차지주소, set상차지주소] = useState("");
  const [상차지담당자, set상차지담당자] = useState("");
  const [상차지담당자번호, set상차지담당자번호] = useState("");
  const [하차지명, set하차지명] = useState("");
  const [하차지주소, set하차지주소] = useState("");
  const [하차지담당자, set하차지담당자] = useState("");
  const [하차지담당자번호, set하차지담당자번호] = useState("");
  const [상차일, set상차일] = useState(todayLocal());
  const [상차시간, set상차시간] = useState("");
  const [상차시간기준, set상차시간기준] = useState(null);
  const [하차일, set하차일] = useState(todayLocal());
  const [하차시간, set하차시간] = useState("");
  const [하차시간기준, set하차시간기준] = useState(null);
  const [상차방법, set상차방법] = useState("");
  const [하차방법, set하차방법] = useState("");
  const [지급방식, set지급방식] = useState("");
  const [배차방식, set배차방식] = useState("");
  const [화물내용, set화물내용] = useState("");
  const [차량종류, set차량종류] = useState("");
  const [톤수, set톤수] = useState("");
  const [청구운임Digits, set청구운임Digits] = useState("");
  const [기사운임Digits, set기사운임Digits] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [contactPickerFor, setContactPickerFor] = useState(null); // "pickup" | "drop" | null
  const [pendingContacts, setPendingContacts] = useState([]);

  const isViewer = role === "viewer";
  const canSubmit = 상차지명.trim() && 하차지명.trim() && !submitting && !isViewer;
  const 수수료 = Math.max(0, (Number(청구운임Digits) || 0) - (Number(기사운임Digits) || 0));

  // 거래처(clients) + 저장된 장소(places)를 이름 기준으로 합쳐 자동완성 후보로 사용
  const placeCandidates = useMemo(() => {
    const map = new Map();
    [...(clients || []), ...(places || [])].forEach((c) => {
      const name = (c?.거래처명 || "").trim();
      if (!name || map.has(name)) return;
      map.set(name, c);
    });
    return Array.from(map.values());
  }, [clients, places]);

  const applyPlace = (c, side) => {
    const contacts = Array.isArray(c.contacts) ? c.contacts : [];
    const primary = contacts.find((x) => x.isPrimary) || contacts[0] || null;
    if (side === "pickup") {
      set상차지명(c.거래처명 || "");
      set상차지주소(c.주소 || "");
      set상차지담당자(primary?.name || c.담당자 || "");
      set상차지담당자번호(primary?.phone || c.담당자번호 || "");
    } else {
      set하차지명(c.거래처명 || "");
      set하차지주소(c.주소 || "");
      set하차지담당자(primary?.name || c.담당자 || "");
      set하차지담당자번호(primary?.phone || c.담당자번호 || "");
    }
    if (contacts.length > 1) {
      setPendingContacts(contacts);
      setContactPickerFor(side);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    const result = await onSubmitRegister({
      거래처명: 거래처명.trim(),
      상차지명: 상차지명.trim(),
      상차지주소: 상차지주소.trim(),
      상차지담당자: 상차지담당자.trim(),
      상차지담당자번호: 상차지담당자번호.trim(),
      하차지명: 하차지명.trim(),
      하차지주소: 하차지주소.trim(),
      하차지담당자: 하차지담당자.trim(),
      하차지담당자번호: 하차지담당자번호.trim(),
      상차일,
      상차시간,
      상차시간기준,
      하차일,
      하차시간,
      하차시간기준,
      상차방법,
      하차방법,
      지급방식,
      배차방식,
      화물내용: 화물내용.trim(),
      차량종류,
      톤수: 톤수.trim(),
      청구운임: 청구운임Digits,
      기사운임: 기사운임Digits,
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
          <SearchDropdownInput
            value={거래처명}
            onChange={set거래처명}
            onSelect={(c) => set거래처명(c.거래처명 || "")}
            candidates={placeCandidates}
            placeholder="거래처명을 입력하세요"
          />
        </div>

        <div className="mb-5">
          <FieldLabel>상차지 *</FieldLabel>
          <SearchDropdownInput
            value={상차지명}
            onChange={set상차지명}
            onSelect={(c) => applyPlace(c, "pickup")}
            candidates={placeCandidates}
            placeholder="예: 서울 강남구 물류센터"
          />
          {상차지주소 && <div className="text-sm text-gray-400 mt-1.5 px-1">{상차지주소}</div>}
        </div>
        <div className="mb-5">
          <FieldLabel>상차지 담당자 (선택)</FieldLabel>
          <div className="flex gap-2">
            <BigInput
              className="flex-[1.2]"
              value={상차지담당자}
              onChange={(e) => set상차지담당자(e.target.value)}
              placeholder="담당자명"
            />
            <BigInput
              className="flex-[1.5]"
              value={상차지담당자번호}
              onChange={(e) => set상차지담당자번호(onlyDigits(e.target.value))}
              placeholder="연락처"
              inputMode="tel"
            />
          </div>
        </div>

        <div className="mb-5">
          <FieldLabel>하차지 *</FieldLabel>
          <SearchDropdownInput
            value={하차지명}
            onChange={set하차지명}
            onSelect={(c) => applyPlace(c, "drop")}
            candidates={placeCandidates}
            placeholder="예: 부산 사하구 공장"
          />
          {하차지주소 && <div className="text-sm text-gray-400 mt-1.5 px-1">{하차지주소}</div>}
        </div>
        <div className="mb-5">
          <FieldLabel>하차지 담당자 (선택)</FieldLabel>
          <div className="flex gap-2">
            <BigInput
              className="flex-[1.2]"
              value={하차지담당자}
              onChange={(e) => set하차지담당자(e.target.value)}
              placeholder="담당자명"
            />
            <BigInput
              className="flex-[1.5]"
              value={하차지담당자번호}
              onChange={(e) => set하차지담당자번호(onlyDigits(e.target.value))}
              placeholder="연락처"
              inputMode="tel"
            />
          </div>
        </div>

        <TimeField
          label="상차일시"
          date={상차일}
          onDate={set상차일}
          time={상차시간}
          onTime={set상차시간}
          basis={상차시간기준}
          onBasis={set상차시간기준}
        />
        <TimeField
          label="하차일시"
          date={하차일}
          onDate={set하차일}
          time={하차시간}
          onTime={set하차시간}
          basis={하차시간기준}
          onBasis={set하차시간기준}
        />

        <SelectField label="상차방법" value={상차방법} onChange={set상차방법} options={LOAD_METHODS} />
        <SelectField label="하차방법" value={하차방법} onChange={set하차방법} options={LOAD_METHODS} />
        <SelectField label="지급방식" value={지급방식} onChange={set지급방식} options={PAYMENT_METHODS} />
        <SelectField label="배차방식" value={배차방식} onChange={set배차방식} options={DISPATCH_METHODS} />

        <div className="mb-5">
          <FieldLabel>화물내용</FieldLabel>
          <BigInput
            value={화물내용}
            onChange={(e) => set화물내용(e.target.value)}
            placeholder="예: 3파레트"
          />
        </div>

        <SelectField label="차량종류" value={차량종류} onChange={set차량종류} options={VEHICLE_TYPES} />

        <PresetOrCustomField label="톤수" value={톤수} onChange={set톤수} presets={TON_PRESETS} placeholder="예: 5톤" />

        <div className="mb-5">
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

        <div className="mb-5">
          <FieldLabel>기사운임 (선택)</FieldLabel>
          <div className="relative">
            <BigInput
              value={기사운임Digits ? Number(기사운임Digits).toLocaleString("ko-KR") : ""}
              onChange={(e) => set기사운임Digits(onlyDigits(e.target.value))}
              placeholder="0"
              inputMode="numeric"
              className="pr-14"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lg font-bold text-gray-400">
              원
            </span>
          </div>
        </div>

        <div className="mb-6">
          <FieldLabel>수수료 (자동계산)</FieldLabel>
          <div className="w-full text-lg rounded-2xl border-2 border-gray-100 bg-gray-50 px-4 py-4 text-gray-500 font-bold">
            {fmtMoney(수수료)}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 shrink-0 bg-white border-t border-gray-100">
        <PrimaryButton onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? "등록 중..." : "등록하기"}
        </PrimaryButton>
      </div>

      {done && <SuccessOverlay text="등록 완료" onDone={onDone} />}
      {contactPickerFor && (
        <ContactPickerModal
          contacts={pendingContacts}
          onClose={() => setContactPickerFor(null)}
          onSelect={(c) => {
            if (contactPickerFor === "pickup") {
              set상차지담당자(c.name || "");
              set상차지담당자번호(c.phone || "");
            } else {
              set하차지담당자(c.name || "");
              set하차지담당자번호(c.phone || "");
            }
            setContactPickerFor(null);
          }}
        />
      )}
    </div>
  );
}

// ==================================================================
// 목록 화면 (배차현황 / 미배차현황 공용)
// ==================================================================
function DateToggle({ mode, onChange, todayStr, tomorrowStr }) {
  return (
    <div className="flex gap-2 mb-5">
      {[["today", "당일", todayStr], ["tomorrow", "내일", tomorrowStr]].map(([v, label, d]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 py-3.5 rounded-2xl text-lg font-extrabold border-2 transition ${
            mode === v ? "text-white border-transparent" : "bg-white text-gray-500 border-gray-200"
          }`}
          style={mode === v ? { backgroundColor: NAVY } : undefined}
        >
          {label}
          <span className="ml-1.5 text-sm font-semibold opacity-70">
            ({Number(d.slice(5, 7))}/{Number(d.slice(8, 10))})
          </span>
        </button>
      ))}
    </div>
  );
}

function OrderListScreen({
  title,
  orders,
  emptyText,
  onBack,
  onOpenOrder,
  onOpenDetail,
  showAddButton,
  onAdd,
  headerExtra,
  grouped,
  todayStr,
  tomorrowStr,
  cardVariant,
  onOpenFare,
}) {
  const groups = useMemo(() => {
    if (!grouped) return null;
    const map = new Map();
    orders.forEach((o) => {
      const k = getPickupDate(o) || "9999-99-99";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(o);
    });
    return Array.from(map.entries());
  }, [orders, grouped]);

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: "#F4F6F9" }}>
      <TopBar title={title} onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {headerExtra}
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
        ) : grouped ? (
          <div className="flex flex-col gap-5">
            {groups.map(([dateKey, list]) => (
              <div key={dateKey}>
                <div className="text-base font-extrabold mb-2 px-1 flex items-center gap-2" style={{ color: NAVY }}>
                  {fmtDateHeader(dateKey, todayStr, tomorrowStr)}
                  <span className="text-sm font-bold text-gray-400">{list.length}건</span>
                </div>
                <div className="flex flex-col gap-3">
                  {list.map((o) => {
                    const hasCar = !!String(o.차량번호 || "").trim();
                    return (
                      <OrderCard
                        key={o._id || o.id}
                        order={o}
                        variant={cardVariant}
                        onClick={() => (hasCar ? onOpenDetail(o) : onOpenOrder(o))}
                        onOpenFare={onOpenFare}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map((o) => {
              const hasCar = !!String(o.차량번호 || "").trim();
              return (
                <OrderCard
                  key={o._id || o.id}
                  order={o}
                  variant={cardVariant}
                  onClick={() => (hasCar ? onOpenDetail(o) : onOpenOrder(o))}
                  onOpenFare={onOpenFare}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderDetailSheet({ order, onClose, onOpenFare }) {
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
          <Row label="차량종류" value={order.차량종류} />
          <Row label="톤수" value={order.차량톤수 || order.톤수} />
          <Row label="메모" value={order.메모} />
          <Row label="차량번호" value={order.차량번호} />
          <Row label="기사명" value={order.기사명} />
          <Row label="청구운임" value={fmtMoney(order.청구운임)} />
          <Row label="기사운임" value={fmtMoney(order.기사운임)} />
        </div>
        {onOpenFare && (
          <button
            onClick={() => onOpenFare(order)}
            className="w-full mt-5 py-4 rounded-2xl text-white text-lg font-extrabold active:scale-[0.98] transition-transform"
            style={{ backgroundColor: NAVY }}
          >
            운임조회
          </button>
        )}
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
// 운임조회 결과 팝업 — 일반모드 오더상세의 "운임조회"와 동일하게, 현재 오더와
// 같은 노선의 과거 운송 기록을 자동으로 찾아 청구운임 참고자료로 보여준다.
// ==================================================================
function FareMatchModal({ order, orders, onClose }) {
  const matches = useMemo(() => {
    if (!order) return [];
    const selfId = order._id || order.id;
    const pName = normalizeText(order.상차지명);
    const dName = normalizeText(order.하차지명);
    const cargo = normalizeText(order.화물내용);
    const ton = normalizeText(order.차량톤수 || order.톤수);
    if (!pName || !dName) return [];

    return (orders || [])
      .filter((o) => (o._id || o.id) !== selfId)
      .filter((o) => (Number(o.청구운임) || 0) > 0)
      .map((o) => {
        const routeMatch = normalizeText(o.상차지명) === pName && normalizeText(o.하차지명) === dName;
        if (!routeMatch) return null;
        const cargoMatch = !!cargo && normalizeText(o.화물내용) === cargo;
        const tonMatch = !!ton && normalizeText(o.차량톤수 || o.톤수) === ton;
        const tagLabel = cargoMatch && tonMatch ? "완전일치" : (cargoMatch || tonMatch) ? "부분일치" : "노선일치";
        return { order: o, tagLabel };
      })
      .filter(Boolean)
      .sort((a, b) => getCreatedMs(b.order) - getCreatedMs(a.order))
      .slice(0, 15);
  }, [order, orders]);

  const summary = useMemo(() => {
    if (matches.length < 2) return null;
    const fares = matches.map((m) => Number(m.order.청구운임) || 0);
    return {
      min: Math.min(...fares),
      max: Math.max(...fares),
      avg: Math.round(fares.reduce((a, b) => a + b, 0) / fares.length),
    };
  }, [matches]);

  if (!order) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end" onClick={onClose}>
      <div
        className="bg-white w-full rounded-t-3xl px-6 py-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="text-xl font-extrabold" style={{ color: NAVY }}>운임조회 결과</div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full active:bg-gray-100">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>
        <div className="text-base text-gray-400 font-semibold mb-4 inline-flex items-center gap-1.5">
          <DirBadge dir="상" /><span>{order.상차지명 || "-"}</span>
          <span className="text-gray-300">→</span>
          <DirBadge dir="하" /><span>{order.하차지명 || "-"}</span>
        </div>

        {summary && (
          <div className="bg-gray-50 rounded-2xl px-4 py-4 mb-4 flex justify-between text-center">
            <div>
              <div className="text-xs text-gray-400 font-bold mb-0.5">최저</div>
              <div className="text-lg font-extrabold" style={{ color: NAVY }}>{fmtMoney(summary.min)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 font-bold mb-0.5">평균</div>
              <div className="text-lg font-extrabold" style={{ color: NAVY }}>{fmtMoney(summary.avg)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 font-bold mb-0.5">최고</div>
              <div className="text-lg font-extrabold" style={{ color: NAVY }}>{fmtMoney(summary.max)}</div>
            </div>
          </div>
        )}

        {matches.length === 0 ? (
          <div className="text-center text-gray-400 text-lg font-semibold py-16">
            동일 노선의 과거 운송 기록이 없습니다.
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-2">
            {matches.map((m, i) => {
              const o = m.order;
              const tagStyle = m.tagLabel === "완전일치"
                ? { backgroundColor: NAVY, color: "#fff" }
                : m.tagLabel === "부분일치"
                  ? { backgroundColor: "#d1fae5", color: "#047857" }
                  : { backgroundColor: "#f3f4f6", color: "#6b7280" };
              return (
                <div key={o._id || o.id || i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={tagStyle}>{m.tagLabel}</span>
                    <span className="text-xs text-gray-400 font-semibold">{getPickupDate(o) || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base text-gray-700 font-semibold truncate inline-flex items-center gap-1">
                      <Package className="w-4 h-4 text-amber-500 shrink-0" /> {o.화물내용 || "-"}
                    </span>
                    <span className="text-xl font-extrabold shrink-0" style={{ color: NAVY }}>{fmtMoney(o.청구운임)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================================================================
// 차량정보 입력(배차완료) 화면
// ==================================================================
function AssignScreen({ order, drivers, role, onAssignVehicle, onBack, onDone, onOpenFare }) {
  const [차량번호, set차량번호] = useState("");
  const [기사명, set기사명] = useState("");
  const [전화번호, set전화번호] = useState("");
  const [showPlateList, setShowPlateList] = useState(false);
  const [showNameList, setShowNameList] = useState(false);
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

  // 스마트검색: 차량번호/이름 입력 시 기사 목록에서 유사한 항목을 드롭다운으로 보여준다
  const plateMatches = useMemo(() => {
    const q = normalizeText(차량번호);
    if (!q) return [];
    return (drivers || []).filter((d) => normalizeText(d.차량번호).includes(q)).slice(0, 8);
  }, [drivers, 차량번호]);

  const nameMatches = useMemo(() => {
    const q = normalizeText(기사명);
    if (!q) return [];
    return (drivers || []).filter((d) => d.이름 && normalizeText(d.이름).includes(q)).slice(0, 8);
  }, [drivers, 기사명]);

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
          <div className="flex items-center justify-between mb-1">
            <div className="flex flex-col gap-1 text-lg font-extrabold text-gray-900 break-keep">
              <div className="flex items-center gap-1.5"><DirBadge dir="상" /><span>{order.상차지명 || "-"}</span></div>
              <div className="flex items-center gap-1.5"><DirBadge dir="하" /><span>{order.하차지명 || "-"}</span></div>
            </div>
            {onOpenFare && (
              <button
                onClick={() => onOpenFare(order)}
                className="text-sm font-bold px-3 py-1.5 rounded-full border-2 shrink-0"
                style={{ borderColor: NAVY, color: NAVY }}
              >
                운임조회
              </button>
            )}
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
          <FieldLabel>차량번호 * (스마트검색)</FieldLabel>
          <div className="relative">
            <BigInput
              value={차량번호}
              onChange={(e) => { set차량번호(e.target.value); setShowPlateList(true); }}
              onFocus={() => setShowPlateList(true)}
              onBlur={() => setTimeout(() => setShowPlateList(false), 150)}
              placeholder="예: 12가3456"
            />
            {showPlateList && plateMatches.length > 0 && (
              <div className="absolute z-50 w-full bg-white border-2 border-gray-200 rounded-2xl shadow-lg mt-1 max-h-60 overflow-y-auto">
                {plateMatches.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 active:bg-gray-50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { applyDriver(d); setShowPlateList(false); }}
                  >
                    <div className="text-lg font-bold text-gray-900">{d.차량번호}</div>
                    <div className="text-sm text-gray-400 mt-0.5">{d.이름 || "-"} · {d.전화번호 || "-"}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
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
          <FieldLabel>기사명 (스마트검색)</FieldLabel>
          <div className="relative">
            <BigInput
              value={기사명}
              onChange={(e) => { set기사명(e.target.value); setShowNameList(true); }}
              onFocus={() => setShowNameList(true)}
              onBlur={() => setTimeout(() => setShowNameList(false), 150)}
              placeholder="기사님 성함"
            />
            {showNameList && nameMatches.length > 0 && (
              <div className="absolute z-50 w-full bg-white border-2 border-gray-200 rounded-2xl shadow-lg mt-1 max-h-60 overflow-y-auto">
                {nameMatches.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 active:bg-gray-50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { applyDriver(d); setShowNameList(false); }}
                  >
                    <div className="text-lg font-bold text-gray-900">{d.이름}</div>
                    <div className="text-sm text-gray-400 mt-0.5">{d.차량번호 || "-"} · {d.전화번호 || "-"}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
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
function FareScreen({ orders, clients, places, onBack }) {
  const [거래처, set거래처] = useState("");
  const [상차지, set상차지] = useState("");
  const [하차지, set하차지] = useState("");
  const [차량종류, set차량종류] = useState("");
  const [톤수, set톤수] = useState("");
  const [화물내용, set화물내용] = useState("");
  const [results, setResults] = useState(null);
  const [showClientList, setShowClientList] = useState(false);

  const placeCandidates = useMemo(() => {
    const map = new Map();
    [...(clients || []), ...(places || [])].forEach((c) => {
      const name = (c?.거래처명 || "").trim();
      if (!name || map.has(name)) return;
      map.set(name, c);
    });
    return Array.from(map.values());
  }, [clients, places]);

  const clientMatches = useMemo(() => {
    const q = normalizeText(거래처);
    if (!q) return [];
    return placeCandidates.filter((c) => normalizeText(c.거래처명).includes(q)).slice(0, 8);
  }, [placeCandidates, 거래처]);

  const handleSearch = () => {
    const c = normalizeText(거래처);
    const p = normalizeText(상차지);
    const d = normalizeText(하차지);
    if (!c && !p && !d && !차량종류 && !톤수 && !화물내용) {
      setResults([]);
      return;
    }
    const matched = (orders || [])
      .filter((o) => (Number(o.청구운임) || 0) > 0)
      .filter((o) => {
        if (c && !normalizeText(o.거래처명).includes(c)) return false;
        // 지명뿐 아니라 주소 문자열도 함께 검사 — "인천"/"서울" 같은 지역명으로도 찾을 수 있게
        const op = normalizeText(o.상차지명) + normalizeText(o.상차지주소);
        const od = normalizeText(o.하차지명) + normalizeText(o.하차지주소);
        if (p && !op.includes(p)) return false;
        if (d && !od.includes(d)) return false;
        if (차량종류 && o.차량종류 !== 차량종류) return false;
        if (톤수 && normalizeText(o.차량톤수 || o.톤수) !== normalizeText(톤수)) return false;
        if (화물내용 && !normalizeText(o.화물내용).includes(normalizeText(화물내용))) return false;
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
          <FieldLabel>거래처 (선택)</FieldLabel>
          <div className="relative">
            <BigInput
              value={거래처}
              onChange={(e) => { set거래처(e.target.value); setShowClientList(true); }}
              onFocus={() => setShowClientList(true)}
              onBlur={() => setTimeout(() => setShowClientList(false), 150)}
              placeholder="거래처명 입력 또는 선택"
            />
            {showClientList && clientMatches.length > 0 && (
              <div className="absolute z-50 w-full bg-white border-2 border-gray-200 rounded-2xl shadow-lg mt-1 max-h-60 overflow-y-auto">
                {clientMatches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 active:bg-gray-50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { set거래처(c.거래처명 || ""); setShowClientList(false); }}
                  >
                    <div className="text-lg font-bold text-gray-900">{c.거래처명}</div>
                    {c.주소 && <div className="text-sm text-gray-400 mt-0.5 truncate">{c.주소}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mb-4">
          <FieldLabel>상차지</FieldLabel>
          <BigInput value={상차지} onChange={(e) => set상차지(e.target.value)} placeholder="예: 인천, 서울" />
        </div>
        <div className="mb-4">
          <FieldLabel>하차지</FieldLabel>
          <BigInput value={하차지} onChange={(e) => set하차지(e.target.value)} placeholder="예: 부산, 대전" />
        </div>

        <div className="mb-4">
          <FieldLabel>차량종류 (선택)</FieldLabel>
          <select
            value={차량종류}
            onChange={(e) => set차량종류(e.target.value)}
            className="w-full text-lg rounded-2xl border-2 border-gray-200 px-4 py-4 focus:outline-none focus:border-[#1B2B4B] bg-white"
          >
            <option value="">전체</option>
            {VEHICLE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <PresetOrCustomField label="톤수 (선택)" value={톤수} onChange={set톤수} presets={TON_PRESETS} placeholder="예: 5톤" />
        <PresetOrCustomField label="화물내용 (선택)" value={화물내용} onChange={set화물내용} presets={PALLET_PRESETS} placeholder="예: 냉동식품" />

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
                    <div className="flex flex-col gap-1 text-lg font-extrabold text-gray-900 break-keep">
                      <div className="flex items-center gap-1.5"><DirBadge dir="상" /><span>{o.상차지명 || "-"}</span></div>
                      <div className="flex items-center gap-1.5"><DirBadge dir="하" /><span>{o.하차지명 || "-"}</span></div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-base text-gray-700 font-semibold truncate inline-flex items-center gap-1 flex-wrap">
                        <Package className="w-4 h-4 shrink-0" /> {o.화물내용 || "-"}
                        {(o.차량톤수 || o.톤수) && (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-gray-300">·</span>
                            <Scale className="w-4 h-4 text-gray-500 shrink-0" /> {o.차량톤수 || o.톤수}
                          </span>
                        )}
                        {o.차량종류 && (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-gray-300">·</span>
                            <VehicleTypeIcon type={o.차량종류} className="w-4 h-4 text-gray-500 shrink-0" /> {o.차량종류}
                          </span>
                        )}
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
  places = [],
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
  const [fareMatchOrder, setFareMatchOrder] = useState(null);
  const [listDateMode, setListDateMode] = useState("today");
  // 쉬운모드 자체 글자크기 배율(기본/크게/아주크게) — 일반모드의 fontScale과는 별도로
  // 관리하며, 이 화면트리 전체(모든 화면 공통)에 zoom으로 적용해 "모든 글씨"가 함께 커진다.
  const [easyScale, setEasyScale] = useState(() => Number(localStorage.getItem("easyModeScale") || "1"));
  const onChangeEasyScale = (v) => {
    setEasyScale(v);
    localStorage.setItem("easyModeScale", String(v));
  };

  const today = todayLocal();
  const tomorrow = tomorrowLocal();
  const todayUnassignedCount = useMemo(
    () => unassignedOrders.filter((o) => getPickupDate(o) === today).length,
    [unassignedOrders, today]
  );

  const sortedListOrders = useMemo(() => {
    return [...orders].sort((a, b) => getCreatedMs(b) - getCreatedMs(a));
  }, [orders]);

  // 배차현황: 항상 당일(또는 내일) 기준으로만 보여준다 — 전체 데이터를 한번에 보여주지 않는다.
  const filteredListOrders = useMemo(() => {
    const target = listDateMode === "tomorrow" ? tomorrow : today;
    return sortedListOrders.filter((o) => getPickupDate(o) === target);
  }, [sortedListOrders, listDateMode, today, tomorrow]);

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
      style={{ backgroundColor: "#F4F6F9", zoom: easyScale }}
    >
      {screen === "home" && (
        <HomeScreen
          easyScale={easyScale}
          onChangeEasyScale={onChangeEasyScale}
          unassignedCount={todayUnassignedCount}
          onNavigate={setScreen}
          onExitEasyMode={onExitEasyMode}
          onLogout={onLogout}
        />
      )}

      {screen === "register" && (
        <RegisterScreen
          clients={clients}
          places={places}
          role={role}
          onSubmitRegister={onSubmitRegister}
          onBack={goHome}
          onDone={goHome}
        />
      )}

      {screen === "list" && (
        <OrderListScreen
          title="배차현황"
          orders={filteredListOrders}
          emptyText={listDateMode === "tomorrow" ? "내일 등록된 배차가 없습니다." : "오늘 등록된 배차가 없습니다."}
          onBack={goHome}
          onOpenOrder={(o) => openAssign(o, "list")}
          onOpenDetail={(o) => setDetailOrder(o)}
          showAddButton
          onAdd={() => setScreen("register")}
          headerExtra={<DateToggle mode={listDateMode} onChange={setListDateMode} todayStr={today} tomorrowStr={tomorrow} />}
          onOpenFare={setFareMatchOrder}
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
          grouped
          todayStr={today}
          tomorrowStr={tomorrow}
          cardVariant="unassigned"
          onOpenFare={setFareMatchOrder}
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
          onOpenFare={setFareMatchOrder}
        />
      )}

      {screen === "fare" && <FareScreen orders={orders} clients={clients} places={places} onBack={goHome} />}

      {detailOrder && (
        <OrderDetailSheet order={detailOrder} onClose={() => setDetailOrder(null)} onOpenFare={setFareMatchOrder} />
      )}

      {fareMatchOrder && (
        <FareMatchModal order={fareMatchOrder} orders={orders} onClose={() => setFareMatchOrder(null)} />
      )}
    </div>
  );
}
