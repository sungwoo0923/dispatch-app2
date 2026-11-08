// ======================= src/publicDataMain.jsx =======================
// 🏛 2026-11-07 배차 프로그램 쪽 연결 — 국세청 사업자 상태 · 기상청 날씨 · 팝빌 관리(화면 조각은 src/BizStatusBadge.jsx · src/WeatherBadge.jsx)
//  서버 함수: bizStatusCheck · weatherFor · integrationStatus · popbillAdmin (functions/publicData.js · functions/popbill.js)
//  둘러보기(demo=1, 개발 서버에서만)는 src/publicDataDemo.js의 가짜 응답을 쓴다.
import React from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, FUNCTIONS_BASE } from "./firebase";
import { kpConfirm } from "./kpDialog";
import { createBizChecker, BizStatusCheck, BizBulkCheck, bizGuard } from "./BizStatusBadge";
import { createWeatherStore, WeatherBadge, WeatherStrip } from "./WeatherBadge";

const isDemo = () => { try { return new URLSearchParams(window.location.search).get("demo") === "1"; } catch { return false; } };
let demoMod = null;
// 배포 빌드에서는 import.meta.env.DEV가 false라 아래 import가 통째로 빠진다(가짜 응답 파일이 포함되지 않게)
const demo = import.meta.env.DEV ? async () => (demoMod || (demoMod = await import("./publicDataDemo.js"))) : async () => null;

// 호출형 함수(callable) 규약 — { data } 보내고 { result } 받는다
export async function pdCall(name, data, ms = 20000) {
  if (import.meta.env.DEV && isDemo()) return (await demo()).demoCall(name, data);
  const token = await auth.currentUser?.getIdToken().catch(() => "");
  if (!token) throw Object.assign(new Error("로그인이 필요해요"), { code: "unauthenticated" });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ data }), signal: ctl.signal,
    });
    let j = {};
    try { j = await res.json(); } catch { /* 무시 */ }
    if (!res.ok || j.error) throw Object.assign(new Error(j.error?.message || `요청 실패(${res.status})`), { code: String(j.error?.status || res.status).toLowerCase().replace(/_/g, "-") });
    return j.result;
  } finally { clearTimeout(timer); }
}

export const mainBiz = createBizChecker(pdCall);
export const mainWeather = createWeatherStore({
  call: pdCall,
  readDoc: async (key) => {
    if (import.meta.env.DEV && isDemo()) return (await demo()).demoReadDoc(key);
    if (!auth.currentUser) return null;
    const s = await getDoc(doc(db, "weatherCache", key));
    return s.exists() ? s.data() : null;
  },
});

// ─────────────── 사업자 상태 ───────────────
export function BizCheck(props) { return <BizStatusCheck checker={mainBiz} {...props} />; }
export const bizGuardMain = (value, opts) => bizGuard(mainBiz, value, kpConfirm, opts);
export function ClientBizBulkButton({ clients, className = "" }) {
  const [open, setOpen] = React.useState(false);
  const rows = React.useMemo(() => (clients || []).map((c) => ({ id: c.id || c.거래처명, name: c.거래처명 || "", bizNo: c.사업자번호 || "" })), [clients]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} data-testid="biz-bulk-open">사업자 상태 확인</button>
      {open && <BizBulkCheck rows={rows} checker={mainBiz} onClose={() => setOpen(false)} />}
    </>
  );
}

// ─────────────── 날씨 ───────────────
const pad = (n) => String(n).padStart(2, "0");
const kstYmd = (off = 0) => { const d = new Date(Date.now() + 9 * 3600e3 + off * 86400e3); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
// 예보가 있는 날(오늘 ~ 모레)만
const inRange = (ymd) => { const d = String(ymd || "").slice(0, 10); return !!d && d >= kstYmd(0) && d <= kstYmd(2); };
export const OrderWeather = React.memo(function OrderWeather({ order, side = "pickup" }) {
  if (!order) return null;
  const drop = side === "drop";
  const ymd = drop ? (order.하차일 || order.상차일) : order.상차일;
  if (!inRange(ymd)) return null;
  const addr = drop ? order.하차지주소 : order.상차지주소;
  if (!addr) return null;
  return <WeatherBadge store={mainWeather} address={addr} ymd={ymd} time={drop ? order.하차시간 : order.상차시간} />;
});
// 홈 · 경영 보고 — 그날 오더의 상하차지
export function OrdersWeatherStrip({ orders, ymd = kstYmd(0), title, dark, large }) {
  const addrs = React.useMemo(() => {
    const out = [];
    (orders || []).forEach((o) => {
      if (!o || o.배차상태 === "배차취소") return;
      if (String(o.상차일 || "").slice(0, 10) === ymd && o.상차지주소) out.push(o.상차지주소);
      if (String(o.하차일 || o.상차일 || "").slice(0, 10) === ymd && o.하차지주소) out.push(o.하차지주소);
    });
    return out;
  }, [orders, ymd]);
  return <WeatherStrip store={mainWeather} addresses={addrs} ymd={ymd} title={title} dark={dark} large={large} />;
}

// ─────────────── 팝빌 연동회원(회사정보) ───────────────
//  운송사마다 팝빌 연동회원 사업자번호를 하나 등록한다(세금계산서 · 알림톡 · 계좌조회 · 홈택스 수집에 쓴다).
//  저장 위치 companyPopbill/{회사} — 서버만 읽고 쓴다(popbillAdmin). 서버 함수가 아직 없으면 안내만.
const PB_TONE = { 연동됨: ["#E9F5EE", "#1F7A4D"], 신청중: ["#EEF3FA", "#2D4C82"], 오류: ["#FDECEC", "#B4342A"], 미등록: ["#F3F5F9", "#7A879C"] };
export function PopbillStatusChip({ status }) {
  const s = status || "미등록";
  const [bg, fg] = PB_TONE[s] || PB_TONE.미등록;
  return <span className="inline-flex items-center h-6 px-2 rounded-md text-[12.5px] font-extrabold whitespace-nowrap" style={{ background: bg, color: fg }}>{s}</span>;
}
const fmtCorp = (v) => { const d = String(v || "").replace(/[^\d]/g, "").slice(0, 10); return d.length <= 3 ? d : d.length <= 5 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`; };
export function PopbillMemberCard({ company, canEdit }) {
  const [m, setM] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [state, setState] = React.useState("loading"); // loading | ready | unavailable
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => {
    let off = false;
    if (!company) return undefined;
    pdCall("popbillAdmin", { action: "getMember", company })
      .then((r) => { if (!off) { setM(r?.member || null); setState("ready"); } })
      .catch((e) => { if (!off) setState(e?.code === "permission-denied" ? "ready" : "unavailable"); });
    return () => { off = true; };
  }, [company]);
  const save = async () => {
    setBusy("save"); setMsg("");
    try {
      const r = await pdCall("popbillAdmin", { action: "saveMember", company, ...form });
      setM(r.member); setForm(null); setMsg("저장했어요. 팝빌 연동이 열리면 바로 쓸 수 있어요");
    } catch (e) { setMsg(e?.message || "저장하지 못했어요"); } finally { setBusy(""); }
  };
  const check = async () => {
    setBusy("check"); setMsg("");
    try {
      const r = await pdCall("popbillAdmin", { action: "checkMember", company });
      setM(r.member);
      setMsg(r.result?.disabled ? "팝빌 연동이 아직 꺼져 있어요" : r.result?.ok ? (r.member?.status === "연동됨" ? "팝빌 연동회원으로 확인됐어요" : "팝빌에 아직 가입되지 않았어요") : (r.result?.error || "확인하지 못했어요"));
    } catch (e) { setMsg(e?.message || "확인하지 못했어요"); } finally { setBusy(""); }
  };
  const inp = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
  return (
    <div className="rounded-[20px] border border-[#E3E8F0] bg-white overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04)]" data-testid="popbill-card">
      <div className="px-5 py-3 flex items-center gap-3 flex-wrap border-b border-[#EEF1F6]">
        <div>
          <div className="text-[10px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">POPBILL · E-TAX</div>
          <div className="text-[15px] font-black text-[#0F1A30]">팝빌 연동회원 <span className="text-[12px] font-bold text-[#8A96AB] ml-1">세금계산서 · 알림톡 · 계좌조회</span></div>
        </div>
        <span className="ml-auto"><PopbillStatusChip status={m?.status} /></span>
      </div>
      <div className="p-4 space-y-3">
        {state === "unavailable" ? <div className="text-[14px] text-[#5B6B85]">팝빌 연동을 준비하고 있어요. 열리면 여기서 사업자번호를 등록해요.</div> : <>
          <div className="text-[12.5px] text-[#7A879C]">세금계산서 · 알림톡 · 계좌조회를 쓰려면 우리 회사 사업자번호로 연동회원 등록이 필요해요.</div>
          {!form ? (
            <div className="flex items-center gap-3 flex-wrap rounded-xl border border-[#E8EDF4] bg-[#F7F9FC] px-4 py-2">
              <span className={`text-[13.5px] font-black tabular-nums ${m?.corpNum ? "text-[#0F1A30]" : "text-[#9AA9C3]"}`}>{m?.corpNum ? fmtCorp(m.corpNum) : "등록 전"}</span>
              {m?.corpName && <span className="text-[13.5px] text-[#5B6B85]">{[m.corpName, m.ceo && `대표 ${m.ceo}`].filter(Boolean).join(" · ")}</span>}
              {m?.corpNum && <BizCheck value={m.corpNum} size="sm" />}
              {canEdit && <span className="ml-auto flex gap-1.5">
                {m?.corpNum && <button type="button" onClick={check} disabled={!!busy} className="h-9 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-black text-[#1B2B4B] disabled:opacity-60">{busy === "check" ? "확인 중" : "연동 확인"}</button>}
                <button type="button" onClick={() => setForm({ corpNum: fmtCorp(m?.corpNum), corpName: m?.corpName || company || "", ceo: m?.ceo || "", userId: m?.userId || "", contact: m?.contact || "" })} className="h-9 px-3 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black">{m?.corpNum ? "수정" : "등록"}</button>
              </span>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {[["corpNum", "사업자등록번호", "000-00-00000"], ["corpName", "상호"], ["ceo", "대표자"], ["userId", "팝빌 아이디", "가입 후 받은 아이디"], ["contact", "담당자 연락처"]].map(([k, l, ph]) => (
                <label key={k} className="block"><div className="text-[12.5px] font-black text-[#3A4A66] mb-1">{l}</div>
                  <input className={inp} value={form[k] || ""} placeholder={ph || ""} inputMode={k === "corpNum" ? "numeric" : undefined}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: k === "corpNum" ? fmtCorp(e.target.value) : e.target.value }))} />
                  {k === "corpNum" && <div className="mt-1.5"><BizCheck value={form.corpNum} size="sm" /></div>}
                </label>
              ))}
              <div className="col-span-2 flex gap-2">
                <button type="button" onClick={() => setForm(null)} className="flex-1 h-11 rounded-xl border border-[#E3E8F0] text-[#3A4A66] text-[14px] font-extrabold">취소</button>
                <button type="button" onClick={save} disabled={!!busy} className="flex-1 h-11 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-60">{busy === "save" ? "저장 중" : "저장"}</button>
              </div>
            </div>
          )}
          {msg && <div className="text-[13px] font-semibold text-[#5B6B85]">{msg}</div>}
        </>}
      </div>
    </div>
  );
}
