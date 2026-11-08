// ======================= src/CompanyMailSettings.jsx =======================
// ✉️ 2026-11-08 운송사별 발신 메일 화면 조각 — 연결은 src/companyMail.js, 서버는 functions/companyMail.js
//  · CompanyMailSettingsCard: 회사정보 › 메일 설정(메일 서비스 · 발신 이메일 · 이름 · 앱 비밀번호(보이지 않음) · 회신 주소 · 테스트)
//  · MailSenderLine: 메일 보내기 창의 "발신 계정" 줄(등록 전이면 등록 안내 + 버튼)
//  · MailSetupHost: 앱 전체에 한 번 — 보내다가 "설정 없음"이면 안내 창, 예전 공용 계정을 쓰던 회사 관리자에게 등록 안내 띠
import React from "react";
import {
  MAIL_PRESETS, MAIL_SETUP_MSG, LEGACY_MAIL_COMPANIES, presetByKey, presetOfEmail,
  mailSettingsApi, useCompanyMailSettings, openMailSettings, canEditMail,
} from "./companyMail";

const inp = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#8FB0F0]/30 disabled:bg-[#F7F9FC] disabled:text-[#7A879C]";
const lbl = "block text-[12px] font-black text-[#5B6B85] mb-1";
const btn = "h-9 px-3.5 rounded-lg border border-[#DCE3EE] bg-white text-[13.5px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD] disabled:opacity-50 whitespace-nowrap";
const btnPri = "h-9 px-5 rounded-lg bg-[#0F1A30] hover:bg-[#1B2B4B] text-white text-[13.5px] font-black disabled:opacity-50 whitespace-nowrap";
const ymd = (ms) => { if (!ms) return ""; const d = new Date(ms); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`; };
const ymdhm = (ms) => { if (!ms) return ""; const d = new Date(ms); const p = (n) => String(n).padStart(2, "0"); return `${ymd(ms)} ${p(d.getHours())}:${p(d.getMinutes())}`; };

const MailIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" />
  </svg>
);
function StatusChip({ s }) {
  const [bg, fg, text] = !s ? ["#F3F5F9", "#6B7A93", "불러오는 중"]
    : !s.configured ? ["#FFF4E0", "#9A5B00", "등록 필요"]
      : s.lastTestOk === true ? ["#E9F5EE", "#1F7A4D", "연결됨"]
        : s.lastTestOk === false ? ["#FDECEC", "#B4342A", "테스트 실패"]
          : ["#EEF3FA", "#2D4C82", "테스트 전"];
  return <span data-testid="mail-status" className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12.5px] font-extrabold whitespace-nowrap" style={{ background: bg, color: fg }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: fg }} />{text}</span>;
}

const toForm = (s) => {
  const preset = s?.preset || presetOfEmail(s?.fromEmail) || "daum";
  return { preset, fromEmail: s?.fromEmail || "", fromName: s?.fromName || "", replyTo: s?.replyTo || "", host: s?.host || "", port: s?.port || 465, security: s?.security || "ssl", password: "" };
};

// ─────────────── 회사정보 › 메일 설정 ───────────────
export function CompanyMailSettingsCard({ company, role, isMaster = false, myEmail = "" }) {
  const s = useCompanyMailSettings(company);
  const canEdit = canEditMail(role, isMaster);
  const [f, setF] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState({ tone: "", text: "" });
  const [guideOpen, setGuideOpen] = React.useState(false);
  const ref = React.useRef(null);
  const v = f || toForm(s);
  const dirty = !!f;
  const set = (patch) => { setF({ ...v, ...patch }); setMsg({ tone: "", text: "" }); };
  const preset = presetByKey(v.preset) || presetByKey("custom");
  const custom = preset.key === "custom";

  // 다른 화면의 [메일 설정 열기]로 왔으면 이 카드로 스크롤
  React.useEffect(() => {
    const go = () => { try { if (sessionStorage.getItem("kpMailFocus") !== "1") return; sessionStorage.removeItem("kpMailFocus"); } catch { return; } setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120); };
    go(); window.addEventListener("kp-mail-focus", go);
    return () => window.removeEventListener("kp-mail-focus", go);
  }, []);

  const save = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.fromEmail.trim())) return setMsg({ tone: "err", text: "발신 이메일 형식을 확인해 주세요" });
    if (!s?.hasPassword && !v.password.trim()) return setMsg({ tone: "err", text: "앱 비밀번호를 넣어 주세요" });
    if (custom && (!v.host.trim() || !Number(v.port))) return setMsg({ tone: "err", text: "보내는 서버 주소와 포트를 넣어 주세요" });
    setBusy("save");
    try {
      await mailSettingsApi.save(company, { preset: v.preset, fromEmail: v.fromEmail.trim(), fromName: v.fromName.trim(), replyTo: v.replyTo.trim(), host: v.host.trim(), port: Number(v.port) || 0, security: v.security, password: v.password });
      setF(null); setMsg({ tone: "ok", text: "저장했어요. 테스트 메일로 잘 나가는지 확인해 보세요" });
    } catch (e) { setMsg({ tone: "err", text: e?.message || "저장하지 못했어요" }); }
    finally { setBusy(""); }
  };
  const test = async () => {
    setBusy("test");
    try {
      const r = await mailSettingsApi.test(company);
      setMsg(r?.ok ? { tone: "ok", text: `${r.to || "내 메일"}로 테스트 메일을 보냈어요. 받은편지함을 확인해 주세요` } : { tone: "err", text: r?.error || "테스트 메일을 보내지 못했어요" });
    } catch (e) { setMsg({ tone: "err", text: e?.message || "테스트 메일을 보내지 못했어요" }); }
    finally { setBusy(""); }
  };
  const remove = async () => {
    if (!window.confirm("메일 설정을 지울까요? 지우면 이 회사에서 메일을 보낼 수 없어요.")) return;
    setBusy("remove");
    try { await mailSettingsApi.remove(company); setF(null); setMsg({ tone: "ok", text: "메일 설정을 지웠어요" }); }
    catch (e) { setMsg({ tone: "err", text: e?.message || "지우지 못했어요" }); }
    finally { setBusy(""); }
  };

  const dis = !canEdit || !!busy || s === undefined;
  return (
    <div ref={ref} id="company-mail-settings" className="rounded-[20px] border border-[#E3E8F0] bg-white overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04)] scroll-mt-24" data-testid="company-mail-settings">
      <div className="px-5 py-3 flex items-center gap-3 flex-wrap border-b border-[#EEF1F6]">
        <span className="w-8 h-8 rounded-lg bg-[#F1F4F9] grid place-items-center text-[#2D4C82]"><MailIcon size={16} /></span>
        <div className="min-w-0">
          <div className="text-[10px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">MAIL · SENDER</div>
          <div className="text-[15px] font-black text-[#0F1A30]">메일 설정 <span className="text-[12px] font-bold text-[#8A96AB] ml-1">우리 회사 메일 계정으로 보내기</span></div>
        </div>
        <span className="ml-auto"><StatusChip s={s} /></span>
      </div>
      <div className="p-4 space-y-3.5">
        <div className="text-[12.5px] text-[#7A879C]" title="받는 분 화면에도 이 주소가 보이고, 답장도 이 주소(또는 회신 주소)로 와요.">
          거래명세서 · 미수금 · 일반 · 연차 안내 메일이 <b className="text-[#3A4A66]">여기 등록한 우리 회사 메일</b>로 나가요.
          {!canEdit && <span className="ml-1">(회사 관리자 · 경리 관리자만 바꿀 수 있어요)</span>}
        </div>

        <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
          <label className="block sm:col-span-2"><span className={lbl}>메일 서비스</span>
            <select className={inp} value={v.preset} disabled={dis} data-testid="mail-preset" onChange={(e) => { const p = presetByKey(e.target.value); set({ preset: e.target.value, ...(p && p.key !== "custom" ? { host: p.host, port: p.port, security: p.security } : {}) }); }}>
              {MAIL_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}{p.key !== "custom" ? ` (${p.host} · ${p.port} ${p.security === "ssl" ? "SSL" : "STARTTLS"})` : ""}</option>)}
            </select>
          </label>
          <label className="block"><span className={lbl}>발신 이메일</span>
            <input className={inp} type="email" autoComplete="off" value={v.fromEmail} placeholder="billing@daum.net" disabled={dis} data-testid="mail-from"
              onChange={(e) => { const em = e.target.value; const guess = presetOfEmail(em); set({ fromEmail: em, ...(guess && !dirty ? { preset: guess } : {}) }); }} />
          </label>
          <label className="block"><span className={lbl}>보내는 사람 이름</span>
            <input className={inp} value={v.fromName} placeholder={`${company || "우리 회사"} 정산팀`} disabled={dis} maxLength={60} onChange={(e) => set({ fromName: e.target.value })} />
          </label>
          <label className="block"><span className={lbl}>앱 비밀번호</span>
            <input className={inp} type="password" autoComplete="new-password" value={v.password} disabled={dis} data-testid="mail-password"
              placeholder={s?.hasPassword ? "바꿀 때만 새로 입력" : "메일 계정에서 만든 앱 비밀번호"} onChange={(e) => set({ password: e.target.value })} />
            <span className="mt-1 block text-[12px] font-bold" style={{ color: s?.hasPassword ? "#1F7A4D" : "#9AA9C3" }}>
              {s?.hasPassword ? `저장됨 · 마지막 변경 ${ymd(s.passwordUpdatedAt)}` : "저장된 비밀번호가 없어요"}
            </span>
          </label>
          <label className="block"><span className={lbl}>회신 주소 <span className="font-bold text-[#7A879C]">(선택)</span></span>
            <input className={inp} type="email" autoComplete="off" value={v.replyTo} placeholder="답장을 다른 주소로 받을 때만" disabled={dis} onChange={(e) => set({ replyTo: e.target.value })} />
          </label>
          {custom && (
            <div className="sm:col-span-2 grid grid-cols-[1fr_110px_150px] gap-3 max-sm:grid-cols-1">
              <label className="block"><span className={lbl}>보내는 서버(SMTP)</span><input className={inp} value={v.host} placeholder="smtp.hiworks.com" disabled={dis} onChange={(e) => set({ host: e.target.value })} /></label>
              <label className="block"><span className={lbl}>포트</span><input className={inp} inputMode="numeric" value={v.port} disabled={dis} onChange={(e) => set({ port: e.target.value.replace(/[^\d]/g, "").slice(0, 5) })} /></label>
              <label className="block"><span className={lbl}>보안</span>
                <select className={inp} value={v.security} disabled={dis} onChange={(e) => set({ security: e.target.value })}>
                  <option value="ssl">SSL</option><option value="starttls">STARTTLS</option><option value="none">사용 안 함</option>
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[#E8EDF4] bg-[#FAFBFD]">
          <button type="button" className="w-full px-4 py-2 flex items-center gap-2 text-left" onClick={() => setGuideOpen(!guideOpen)} aria-expanded={guideOpen}>
            <span className="text-[13px] font-bold text-[#3A4A66]">{preset.label} 앱 비밀번호 만드는 법</span>
            <span className="ml-auto text-[13px] font-bold text-[#4B6CB7]">{guideOpen ? "접기" : "보기"}</span>
          </button>
          {guideOpen && (
            <ol className="px-4 pb-3.5 space-y-1.5 text-[13.5px] text-[#3A4A66] leading-relaxed list-decimal list-inside" data-testid="mail-guide">
              {preset.guide.map((g) => <li key={g}>{g}</li>)}
            </ol>
          )}
        </div>

        {s?.lastTestAt > 0 && (
          <div className="text-[13px] font-semibold" style={{ color: s.lastTestOk ? "#1F7A4D" : "#B4342A" }}>
            마지막 테스트 {ymdhm(s.lastTestAt)} · {s.lastTestOk ? "잘 보냈어요" : s.lastTestError || "보내지 못했어요"}
          </div>
        )}
        {msg.text && <div role="status" className="rounded-xl px-4 py-2.5 text-[13.5px] font-bold" style={{ background: msg.tone === "err" ? "#FDECEC" : "#E9F5EE", color: msg.tone === "err" ? "#B4342A" : "#1F7A4D" }}>{msg.text}</div>}

        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            {s?.configured && <button type="button" className="text-[13px] font-bold text-[#7A879C] hover:text-[#B4342A] disabled:opacity-50" disabled={!!busy} onClick={remove}>메일 설정 지우기</button>}
            <span className="ml-auto flex gap-2 flex-wrap">
              <button type="button" className={btn} disabled={!!busy || !s?.configured || dirty} title={dirty ? "먼저 저장해 주세요" : ""} onClick={test} data-testid="mail-test">
                {busy === "test" ? "보내는 중..." : `테스트 메일 보내기${myEmail ? ` (${myEmail})` : ""}`}
              </button>
              <button type="button" className={btnPri} disabled={!!busy || (!dirty && s?.configured)} onClick={save} data-testid="mail-save">{busy === "save" ? "저장 중..." : "저장"}</button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────── 메일 보내기 창의 "발신 계정" 줄 ───────────────
export function MailSenderLine({ company, className = "" }) {
  const s = useCompanyMailSettings(company);
  if (s === undefined) return <div className={`px-3 py-2.5 bg-[#F4F6FA] border border-[#D5DDEA] rounded-lg text-[13px] text-[#7A879C] ${className}`}>불러오는 중...</div>;
  if (!s.configured) {
    return (
      <div className={`px-3.5 py-3 bg-[#FFF8EC] border border-[#F2D8A7] rounded-xl ${className}`} data-testid="mail-sender-missing">
        <div className="text-[13.5px] font-black text-[#7A4A00]">발신 메일 등록 필요</div>
        <div className="mt-0.5 text-[13px] text-[#7A5A22] leading-relaxed">{MAIL_SETUP_MSG}</div>
        <button type="button" className="mt-2 h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black" onClick={openMailSettings}>메일 설정 열기</button>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 bg-[#F4F6FA] border border-[#D5DDEA] rounded-lg text-[13px] text-[#0F1A30] font-medium ${className}`} data-testid="mail-sender">
      <span className="truncate">{s.fromName ? `${s.fromName} <${s.fromEmail}>` : s.fromEmail}</span>
      <button type="button" className="ml-auto shrink-0 text-[12.5px] font-bold text-[#4B6CB7]" onClick={openMailSettings}>바꾸기</button>
    </div>
  );
}

// ─────────────── 앱 전체: 등록 안내 창 + 예전 공용 계정 회사 안내 띠 ───────────────
export function MailSetupHost({ company, role, isMaster = false }) {
  const [open, setOpen] = React.useState(false);
  const s = useCompanyMailSettings(company);
  const admin = canEditMail(role, isMaster);
  const dayKey = `kpMailBannerOff_${company}`;
  const [bannerOff, setBannerOff] = React.useState(() => { try { return localStorage.getItem(dayKey) === new Date().toDateString(); } catch { return false; } });
  React.useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener("kp:mail-setup-needed", h);
    return () => window.removeEventListener("kp:mail-setup-needed", h);
  }, []);
  const go = () => { setOpen(false); openMailSettings(); };
  const showBanner = admin && !bannerOff && s && !s.configured && LEGACY_MAIL_COMPANIES.includes(String(company || "").trim());
  return (
    <>
      {showBanner && (
        <div className="fixed left-1/2 -translate-x-1/2 top-[76px] z-[99990] w-[min(560px,calc(100vw-32px))] rounded-2xl bg-[#0F1A30] text-white shadow-[0_18px_40px_rgba(15,26,48,0.35)] px-4 py-3.5 flex items-start gap-3" role="status" data-testid="mail-legacy-banner">
          <span className="mt-0.5 w-9 h-9 shrink-0 rounded-xl bg-white/10 grid place-items-center text-[#8FB0F0]"><MailIcon size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-black">우리 회사 메일을 등록해 주세요</div>
            <div className="mt-0.5 text-[13px] text-white/75 leading-relaxed">이제 메일은 회사마다 자기 메일 계정으로 나가요. 예전 공용 발송 계정은 닫혔어요. 등록하기 전에는 거래명세서 · 미수금 메일을 보낼 수 없어요.</div>
            <div className="mt-2.5 flex gap-2">
              <button type="button" className="h-9 px-3.5 rounded-lg bg-white text-[#0F1A30] text-[13px] font-black" onClick={go}>지금 등록하기</button>
              <button type="button" className="h-9 px-3 rounded-lg text-white/70 text-[13px] font-bold hover:text-white" onClick={() => { setBannerOff(true); try { localStorage.setItem(dayKey, new Date().toDateString()); } catch { /* 무시 */ } }}>오늘은 그만 보기</button>
            </div>
          </div>
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-[99999999] bg-black/40 grid place-items-center px-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="mail-setup-title" className="w-full max-w-[400px] rounded-[22px] bg-white p-6 shadow-[0_24px_60px_rgba(15,26,48,0.3)]" onClick={(e) => e.stopPropagation()} data-testid="mail-setup-needed">
            <span className="w-12 h-12 rounded-2xl bg-[#FFF4E0] text-[#9A5B00] grid place-items-center"><MailIcon size={24} /></span>
            <div id="mail-setup-title" className="mt-4 text-[19px] font-black text-[#0F1A30] tracking-tight">발신 메일을 먼저 등록해 주세요</div>
            <div className="mt-1.5 text-[14px] text-[#5B6B85] leading-relaxed">{MAIL_SETUP_MSG}. 메일은 우리 회사 메일 계정으로 나가요.</div>
            {!admin && <div className="mt-2 text-[13px] text-[#7A879C]">메일 설정은 회사 관리자 · 경리 관리자가 등록할 수 있어요.</div>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" className="h-12 rounded-xl bg-[#F3F5F9] text-[#3A4A66] text-[15px] font-black" onClick={() => setOpen(false)}>닫기</button>
              <button type="button" className="h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black" onClick={go} autoFocus>메일 설정 열기</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
