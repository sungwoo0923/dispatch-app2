// ======================= src/FleetDriverExtra.jsx =======================
// 🚚 기사관리 › 기사 수정에서 등급을 "지입/직영"으로 고르면 나오는 지입 기본정보
//  · 기사앱 상태(가입·승인 / 가입 대기 / 미가입) + 가입 안내 문자 복사(앱 받는 주소 포함)
//  · 정산 계좌(은행·계좌·예금주) · 사업자번호·상호 → 지입차관리 정산(일괄 지급명세서)에 그대로 쓰임
//  · 지입 계약(시작일·월 지입료·명의) — 월 지입료는 지급명세서 기사별 공제에 자동 반영
//  · 차량 기본정보(차명·연식·정비 주기·검사/보험 만기)는 기사앱 첫 설정과 같은 마법사로 직접 입력
import React from "react";
import BankAccountInput from "./BankAccountInput";
import { onlyDigits } from "./bankUtil";
import { VehicleSetupWizard } from "./VehicleCarePanel";

export const DRIVER_APK_URL = "https://github.com/sungwoo0923/dispatch-app2/releases/tag/driver-apk-latest";
const lab = "block text-[12px] font-semibold text-[#5B6B85] mb-1";
const inp = "border border-[#DCE3EE] rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#2D4C82] outline-none bg-white";
const fmtBiz = (v) => { const d = onlyDigits(v).slice(0, 10); return d.length > 5 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d; };

// 기사앱 상태 — drivers 문서에 uid(가입 계정)가 있으면 가입, approved면 승인, heartbeat가 최근이면 사용 중
export function appStatusOf(d = {}) {
  const ms = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);
  const seen = Math.max(ms(d.heartbeatAt), ms(d.updatedAt && d.uid ? d.updatedAt : 0));
  if (!d.uid) return { key: "none", label: "앱 미가입", desc: "기사앱 설치·가입 전" };
  if (d.approved === false) return { key: "pending", label: "가입 승인 대기", desc: "지입차관리 › 기사 등록 관리에서 승인" };
  if (seen && Date.now() - seen < 3 * 86400000) return { key: "active", label: "앱 사용 중", desc: `최근 접속 ${new Date(seen).toLocaleDateString("ko-KR")}` };
  return { key: "idle", label: "가입·승인됨", desc: seen ? `마지막 접속 ${new Date(seen).toLocaleDateString("ko-KR")}` : "아직 접속 기록 없음" };
}
export function appInviteText(company, d = {}) {
  return `[${company || "운송사"}] 기사앱 설치 안내\n\n1) 아래 주소에서 앱(APK)을 받아 설치해 주세요\n${DRIVER_APK_URL}\n\n2) 앱에서 [기사 등록]\n· 소속 회사명: ${company || ""}\n· 차량번호: ${d.차량번호 || ""}\n· 이름: ${d.이름 || ""}\n· 정산 받을 계좌도 함께 입력해 주세요\n\n3) 승인되면 차량번호로 로그인됩니다.`;
}
export function AppStatusBadge({ d, company, big = false }) {
  const s = appStatusOf(d);
  const [copied, setCopied] = React.useState(false);
  const copy = async (e) => {
    e.stopPropagation();
    const t = appInviteText(company, d);
    try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt("아래 내용을 복사해 기사에게 보내 주세요", t); }
  };
  const tone = s.key === "active" ? "bg-[#0F1A30] text-white" : s.key === "idle" ? "bg-[#EEF3FC] text-[#1B2B4B] border border-[#C9D6EE]" : "bg-white text-[#5B6B85] border border-[#DCE3EE]";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[12px] font-black whitespace-nowrap ${tone}`} title={s.desc}>
        <span className={`w-1.5 h-1.5 rounded-full ${s.key === "active" ? "bg-[#8FB0F0]" : s.key === "none" ? "bg-[#C9D3E3]" : "bg-[#2D4C82]"}`} />{s.label}
      </span>
      {s.key === "none" && <button type="button" onClick={copy} className={`h-7 px-2.5 rounded-lg border border-[#C9D6EE] text-[12px] font-black text-[#1B2B4B] bg-white whitespace-nowrap ${big ? "" : ""}`}>{copied ? "복사됨 ✓" : "가입 안내 복사"}</button>}
    </span>
  );
}

export default function FleetExtraFields({ value: v, onChange, company }) {
  const set = (patch) => onChange((p) => ({ ...p, ...patch }));
  const [wizard, setWizard] = React.useState(false);
  const fee = (v.공제항목 || []).find((x) => x.label === "지입료")?.amount || "";
  const setFee = (amt) => {
    const rest = (v.공제항목 || []).filter((x) => x.label !== "지입료");
    set({ 공제항목: amt ? [{ label: "지입료", amount: Number(onlyDigits(amt)) || 0 }, ...rest] : rest });
  };
  const veh = v.vehicle || {};
  return (
    <>
      <div className="col-span-2 mt-1 rounded-2xl border border-[#DCE3EE] overflow-hidden">
        <div className="px-4 py-2.5 text-white flex items-center justify-between gap-2" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
          <div>
            <div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">FLEET · 지입 기본정보</div>
            <div className="text-[13.5px] font-black">정산 · 계약 · 차량 · 기사앱</div>
          </div>
          <AppStatusBadge d={v} company={company} />
        </div>
        <div className="p-4 grid grid-cols-2 gap-3 bg-[#F7F9FC]">
          <div className="col-span-2"><BankAccountInput value={v.정산계좌 || { bank: "", acct: "", holder: "" }} onChange={(b) => set({ 정산계좌: b })} noFav /></div>
          <div><label className={lab}>사업자등록번호</label><input inputMode="numeric" className={inp} value={fmtBiz(v.사업자번호 || "")} onChange={(e) => set({ 사업자번호: onlyDigits(e.target.value).slice(0, 10) })} placeholder="000-00-00000" /></div>
          <div><label className={lab}>상호</label><input className={inp} value={v.사업자상호 || ""} onChange={(e) => set({ 사업자상호: e.target.value })} placeholder="사업자등록증 상호" /></div>
          <div><label className={lab}>지입 계약 시작일</label><input type="date" className={inp} value={v.지입계약일 || ""} onChange={(e) => set({ 지입계약일: e.target.value })} /></div>
          <div><label className={lab}>월 지입료 <span className="font-normal text-[#9AA9C3]">(명세서 자동 공제)</span></label><input inputMode="numeric" className={`${inp} text-right`} value={fee ? Number(fee).toLocaleString() : ""} onChange={(e) => setFee(e.target.value)} placeholder="0" /></div>
          <div className="col-span-2 flex items-center justify-between gap-3 rounded-xl bg-white border border-[#E3E8F0] px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="text-[13px] font-black text-[#0F1A30]">차량 기본정보</div>
              <div className="text-[12px] text-[#5B6B85] truncate">{veh.모델 ? `${veh.제조사 ? `${veh.제조사} ` : ""}${veh.모델}${veh.연식 ? ` · ${veh.연식}년식` : ""}${v.care?.dates?.inspection ? ` · 검사 ${v.care.dates.inspection}` : ""}${v.care?.dates?.insurance ? ` · 보험 ${v.care.dates.insurance}` : ""}` : "입력된 내용이 없어요 · 기사님이 앱에서 작성하시거나 관리자가 여기서 직접 입력"}</div>
            </div>
            <button type="button" onClick={() => setWizard(true)} disabled={!v.id} className="shrink-0 h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black disabled:opacity-40">{v.care?.setupDone ? "수정" : "입력"}</button>
          </div>
        </div>
      </div>
      {wizard && v.id && (
        <div className="fixed inset-0 z-[100000]" onClick={(e) => e.stopPropagation()}>
          <VehicleSetupWizard driverId={v.id} drv={v} by="직원(기사관리)" onClose={() => setWizard(false)} />
        </div>
      )}
    </>
  );
}
