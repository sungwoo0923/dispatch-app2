// ======================= src/PopbillAuto.jsx =======================
// 💬🏦 2026-11-08 팝빌 자동화 화면 조각 — 규칙은 functions/alimtalkCore.mjs · arMatchCore.mjs, 연결은 src/popbillAuto.js
//  · AlimtalkSettingsCard: 회사정보 › 카카오 알림톡 배차 알림(전체 기본값 · 받는 사람 · 템플릿 코드 · 발신번호)
//  · BankAccountsCard: 회사정보 › 입금 자동 조회 계좌(팝빌 계좌조회)
//  · AlimtalkOrderToggle: 배차등록(PC · 모바일) "알림톡 보내기" — 처음 값은 회사 기본값, 이 오더만 바꿀 수 있다
//  · AlimtalkOrderPanel · AlimtalkStatusChip: 오더 상세 — 보낸 결과 · [알림톡 보내기]
//  · BankReviewQueue: 거래처정산 › 미수금 — 입금 확인 필요 N건 · 자동 반영 되돌리기
import React from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { kpConfirm } from "./kpDialog";
import {
  useAutoSettings, saveAutoSettings, settingsOfDoc, useAlimtalkDefault, usePopbillLink, popbillLinkLabel,
  subscribeBankTxns, subscribeBankState, bankCall, alimtalkSendNow,
  ALIMTALK_TEMPLATES, ALIMTALK_COST_NOTE, alimtalkChipOf, isAssignedDone,
} from "./popbillAuto";
import { POPBILL_BANKS, bankNameOf, maskAccount } from "./arMatch";
import { SMS_MODES, smsInfo } from "./smsSend";

const TONE = { ok: ["#E9F5EE", "#1F7A4D"], warn: ["#FFF4E0", "#9A5B00"], error: ["#FDECEC", "#B4342A"], muted: ["#F3F5F9", "#6B7A93"], info: ["#EEF3FA", "#2D4C82"] };
export function Chip({ tone = "muted", children, title, testId }) {
  const [bg, fg] = TONE[tone] || TONE.muted;
  return <span title={title} data-testid={testId} className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[12.5px] font-extrabold whitespace-nowrap" style={{ background: bg, color: fg }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: fg }} />{children}</span>;
}
function Switch({ on, onChange, disabled, label, testId }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} data-testid={testId} onClick={() => onChange(!on)}
      className={`relative inline-flex shrink-0 w-11 h-6 rounded-full transition disabled:opacity-50 ${on ? "bg-[#1B2B4B]" : "bg-[#D5DCE7]"}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
const inp = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82] disabled:bg-[#F7F9FC] disabled:text-[#7A879C]";
const btn = "h-9 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-black text-[#1B2B4B] disabled:opacity-50 whitespace-nowrap";
const btnPri = "h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black disabled:opacity-50 whitespace-nowrap";
const won = (n) => (Number(n) || 0).toLocaleString("ko-KR");
const fmtPhone = (v) => { const d = String(v || "").replace(/[^\d]/g, "").slice(0, 11); if (d.length < 4) return d; if (d.startsWith("02")) return d.length <= 5 ? `${d.slice(0, 2)}-${d.slice(2)}` : d.length <= 9 ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}` : `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`; return d.length <= 7 ? `${d.slice(0, 3)}-${d.slice(3)}` : d.length <= 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`; };
const ago = (ms) => { if (!ms) return ""; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "방금" : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`; };

function CardHead({ en, title, sub, right }) {
  return (
    <div className="px-5 py-3 flex items-center gap-3 flex-wrap border-b border-[#EEF1F6]">
      <div className="min-w-0">
        <div className="text-[10px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">{en}</div>
        <div className="text-[15px] font-black text-[#0F1A30]">{title} {sub && <span className="text-[12px] font-bold text-[#8A96AB] ml-1">{sub}</span>}</div>
      </div>
      <span className="ml-auto">{right}</span>
    </div>
  );
}
function LinkChip({ link }) {
  const l = popbillLinkLabel(link);
  return <Chip tone={l.tone} title={l.detail} testId="popbill-link">{l.label}</Chip>;
}
function OffNotice({ link }) {
  const l = popbillLinkLabel(link);
  if (l.tone === "ok" || !link) return null;
  return (
    <div className="rounded-lg bg-[#F7F9FC] px-3 py-2 text-[12.5px] text-[#5B6B85]" data-testid="popbill-off">
      <b className="font-black text-[#0F1A30]">{l.label}</b> · {l.detail || "팝빌이 연결되면 바로 동작해요"}
    </div>
  );
}

// ─────────────── 회사정보 › 알림톡 설정 ───────────────
export function AlimtalkSettingsCard({ company, canEdit, defaultPhone = "" }) {
  const raw = useAutoSettings(company);
  const link = usePopbillLink(company);
  const cur = settingsOfDoc(raw);
  const [draft, setDraft] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [open, setOpen] = React.useState("");
  const v = draft || cur;
  const set = (patch) => { setDraft({ ...v, ...patch }); setMsg(""); };
  const setTpl = (k, code) => set({ templates: { ...v.templates, [k]: code.trim() } });
  const save = async (next = v) => {
    setBusy(true); setMsg("");
    try { await saveAutoSettings(company, { alimtalk: { ...next, senderNumber: String(next.senderNumber || "").replace(/[^\d]/g, ""), contactPhone: String(next.contactPhone || "").trim() } }); setDraft(null); setMsg("저장했어요"); }
    catch (e) { setMsg(e?.code === "permission-denied" ? "회사 관리자만 바꿀 수 있어요" : e?.message || "저장하지 못했어요"); }
    finally { setBusy(false); }
  };
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); setMsg("템플릿 내용을 복사했어요"); } catch { setMsg("복사하지 못했어요. 직접 선택해 복사해 주세요"); } };
  const dis = !canEdit || busy || raw === null;
  const targets = [
    ["client", "toClient", "거래처 담당자에게", "배차 확정 안내 · 상차일시, 상하차지, 차량번호, 기사명, 기사 연락처"],
    ["driver", "toDriver", "기사에게", "배차 안내 · 상하차지 주소, 담당자 연락처, 일시"],
  ];
  return (
    <div className="rounded-[20px] border border-[#E3E8F0] bg-white overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04)]" data-testid="alimtalk-settings">
      <CardHead en="KAKAO · ALIMTALK" title="카카오 알림톡 배차 알림" sub="배차완료되면 자동으로" right={<LinkChip link={link} />} />
      <div className="p-4 space-y-4">
        <OffNotice link={link} />
        <div className="flex items-start gap-3 rounded-xl border border-[#E3E8F0] px-4 py-3">
          <div className="min-w-0">
            <div className="text-[15px] font-black text-[#0F1A30]">알림톡 자동 전송</div>
            <div className="mt-0.5 text-[13px] text-[#5B6B85] leading-relaxed">켜 두면 새 오더의 "알림톡 보내기"가 처음부터 켜져 있어요. 오더마다 끄고 켤 수 있어요.</div>
          </div>
          <span className="ml-auto pt-0.5"><Switch on={v.enabled} disabled={dis} label="알림톡 자동 전송" testId="alimtalk-global" onChange={(on) => { const n = { ...v, enabled: on }; setDraft(n); save(n); }} /></span>
        </div>
        <div className="grid gap-2">
          {targets.map(([k, field, title, desc]) => (
            <div key={k} className="rounded-xl border border-[#E8EDF4] bg-[#F9FBFD] px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-black text-[#0F1A30]">{title}</div>
                  <div className="text-[12.5px] text-[#5B6B85]">{desc}</div>
                </div>
                <span className="ml-auto"><Switch on={v[field]} disabled={dis} label={title} testId={`alimtalk-${k}`} onChange={(on) => set({ [field]: on })} /></span>
              </div>
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                <label className="text-[12.5px] font-black text-[#3A4A66] whitespace-nowrap">템플릿 코드</label>
                <input className={`${inp} !h-9 !w-auto flex-1 min-w-[160px]`} value={v.templates?.[k] || ""} placeholder="카카오 검수 뒤 받은 코드" disabled={dis} onChange={(e) => setTpl(k, e.target.value)} />
                <button type="button" className={btn} onClick={() => setOpen(open === k ? "" : k)}>{open === k ? "템플릿 닫기" : "등록할 템플릿 보기"}</button>
              </div>
              {open === k && (
                <div className="mt-2.5 rounded-xl border border-[#DCE3EE] bg-white">
                  <div className="px-3 py-2 flex items-center gap-2 border-b border-[#EEF1F6]">
                    <span className="text-[12.5px] font-black text-[#3A4A66]">템플릿 이름: {ALIMTALK_TEMPLATES[k].name}</span>
                    <button type="button" className={`${btn} ml-auto !h-8`} onClick={() => copy(ALIMTALK_TEMPLATES[k].text)}>내용 복사</button>
                  </div>
                  <pre className="px-3 py-2.5 text-[13px] leading-[1.7] text-[#0F1A30] whitespace-pre-wrap font-sans" data-testid={`alimtalk-template-${k}`}>{ALIMTALK_TEMPLATES[k].text}</pre>
                  <div className="px-3 pb-2.5 text-[12px] text-[#7A879C]">팝빌 › 카카오톡 › 템플릿 관리에서 글자 하나까지 똑같이 등록해 주세요. #{"{"}변수{"}"}는 보낼 때 오더 내용으로 채워요.</div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block"><div className="text-[12.5px] font-black text-[#3A4A66] mb-1">발신번호</div>
            <input className={inp} inputMode="tel" value={fmtPhone(v.senderNumber)} placeholder="팝빌에 등록한 회사 번호" disabled={dis} onChange={(e) => set({ senderNumber: e.target.value.replace(/[^\d]/g, "") })} />
            <div className="mt-1 text-[12px] text-[#7A879C]">알림톡이 안 가면 이 번호로 문자를 보내요</div>
          </label>
          <label className="block"><div className="text-[12.5px] font-black text-[#3A4A66] mb-1">안내에 넣을 문의 번호</div>
            <input className={inp} inputMode="tel" value={v.contactPhone || ""} placeholder={defaultPhone || "02-0000-0000"} disabled={dis} onChange={(e) => set({ contactPhone: fmtPhone(e.target.value) })} />
          </label>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-[#E8EDF4] px-4 py-3">
          <div className="min-w-0"><div className="text-[14px] font-black text-[#0F1A30]">못 받으면 문자로 보내기</div><div className="text-[12.5px] text-[#5B6B85]">카카오톡을 안 쓰는 번호이거나 알림톡이 실패하면 같은 내용을 문자로 보내요</div></div>
          <span className="ml-auto"><Switch on={v.smsFallback} disabled={dis} label="문자로 보내기" onChange={(on) => set({ smsFallback: on })} /></span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12.5px] font-semibold text-[#7A879C]">보낸 건수만큼 월말에 로지스웹이 청구해요</span>
          {canEdit && <span className="ml-auto flex gap-1.5">
            {draft && <button type="button" className={btn} onClick={() => { setDraft(null); setMsg(""); }} disabled={busy}>되돌리기</button>}
            <button type="button" className={btnPri} onClick={() => save()} disabled={busy || !draft} data-testid="alimtalk-save">{busy ? "저장 중" : "저장"}</button>
          </span>}
        </div>
        {!canEdit && <div className="text-[12.5px] text-[#7A879C]">회사 관리자만 바꿀 수 있어요</div>}
        {msg && <div className="text-[13px] font-semibold text-[#5B6B85]">{msg}</div>}
      </div>
    </div>
  );
}

// ─────────────── 회사정보 › 문자 보내기(2026-11-10) ───────────────
//  보내는 방식(휴대폰과 연결 · 회사 번호 문자 · 자동) · 발신번호 · 이번 달 사용량과 예상 청구액(로지스웹이 월말 청구)
export function SmsSettingsCard({ company, canEdit }) {
  const raw = useAutoSettings(company);
  const link = usePopbillLink(company);
  const cur = { mode: raw?.sms?.mode || "phone", senderNumber: String(raw?.sms?.senderNumber || raw?.alimtalk?.senderNumber || "").replace(/[^\d]/g, "") };
  const [draft, setDraft] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [info, setInfo] = React.useState(null);
  const v = draft || cur;
  const dis = !canEdit || busy || raw === null;
  React.useEffect(() => { let alive = true; smsInfo().then((r) => { if (alive) setInfo(r); }).catch(() => { if (alive) setInfo({ error: true }); }); return () => { alive = false; }; }, [company]);
  const save = async () => {
    setBusy(true); setMsg("");
    try { await saveAutoSettings(company, { sms: { mode: v.mode, senderNumber: String(v.senderNumber || "").replace(/[^\d]/g, "") } }); setDraft(null); setMsg("저장했어요"); }
    catch (e) { setMsg(e?.code === "permission-denied" ? "회사 관리자만 바꿀 수 있어요" : e?.message || "저장하지 못했어요"); }
    finally { setBusy(false); }
  };
  const u = info?.usage || { sms: 0, lms: 0, alimtalk: 0 };
  const pr = info?.price || null;
  const total = pr ? u.sms * pr.sms + u.lms * pr.lms + u.alimtalk * pr.alimtalk : null;
  const ym = info?.month || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
  return (
    <div className="rounded-[20px] border border-[#E3E8F0] bg-white overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04)]" data-testid="sms-settings">
      <CardHead en="MESSAGE · SMS" title="문자 보내기" sub="PC에서 기사 · 거래처에게 보내는 문자" right={<LinkChip link={link} />} />
      <div className="p-4 space-y-4">
        <div>
          <div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">보내는 방식</div>
          <div className="grid gap-2">
            {SMS_MODES.map(([k, l, d]) => (
              <button key={k} type="button" disabled={dis} onClick={() => { setDraft({ ...v, mode: k }); setMsg(""); }} data-testid={`sms-mode-${k}`}
                className={`text-left rounded-xl border px-4 py-3 flex items-center gap-3 transition disabled:opacity-60 ${v.mode === k ? "border-[#0F1A30] bg-[#F5F8FD]" : "border-[#E3E8F0] bg-white hover:border-[#C9D3E3]"}`}>
                <span className={`w-[18px] h-[18px] rounded-full border-2 shrink-0 flex items-center justify-center ${v.mode === k ? "border-[#0F1A30]" : "border-[#C9D3E3]"}`}>{v.mode === k && <span className="w-2 h-2 rounded-full bg-[#0F1A30]" />}</span>
                <span className="min-w-0"><span className="block text-[14px] font-black text-[#0F1A30]">{l}</span><span className="block text-[12.5px] text-[#5B6B85]">{d}</span></span>
              </button>
            ))}
          </div>
        </div>
        {v.mode !== "phone" && (
          <label className="block"><div className="text-[12.5px] font-black text-[#3A4A66] mb-1">발신번호</div>
            <input className={inp} inputMode="tel" value={fmtPhone(v.senderNumber)} placeholder="팝빌에 등록한 회사 번호" disabled={dis} onChange={(e) => { setDraft({ ...v, senderNumber: e.target.value.replace(/[^\d]/g, "") }); setMsg(""); }} />
            <div className="mt-1 text-[12px] text-[#7A879C]">법에 따라 미리 등록한 번호로만 보낼 수 있어요(팝빌 › 발신번호 등록)</div>
          </label>
        )}
        <div className="rounded-xl bg-[#0F1A30] text-white px-4 py-3" data-testid="sms-usage">
          <div className="flex items-center"><span className="text-[10.5px] font-extrabold tracking-[0.22em] text-[#8FB0F0]">USAGE · {ym.replace("-", ".")}</span><span className="ml-auto text-[12px] text-white/55">월말 로지스웹 청구</span></div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[["단문", u.sms, pr?.sms], ["장문", u.lms, pr?.lms], ["알림톡", u.alimtalk, pr?.alimtalk]].map(([l, n, p]) => (
              <div key={l} className="rounded-lg bg-white/[0.07] border border-white/10 px-2.5 py-2">
                <div className="text-[11.5px] text-white/55 font-bold">{l}{p != null ? ` · ${p}원` : ""}</div>
                <div className="text-[18px] font-black tabular-nums">{Number(n || 0).toLocaleString()}<span className="text-[11px] text-white/50 ml-0.5">건</span></div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-baseline"><span className="text-[12.5px] text-white/60">이번 달 예상 청구액(부가세 별도)</span><span className="ml-auto text-[20px] font-black tabular-nums">{total != null ? `${Math.round(total).toLocaleString()}원` : "-"}</span></div>
          {info?.error && <div className="mt-1 text-[11.5px] text-white/50">서버에서 사용량을 아직 못 읽었어요</div>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12.5px] font-semibold text-[#7A879C]">{v.mode === "phone" ? "휴대폰과 연결은 요금이 청구되지 않아요" : "90자(한글 45자) 넘으면 장문으로 보내요"}</span>
          {canEdit && <span className="ml-auto flex gap-1.5">
            {draft && <button type="button" className={btn} onClick={() => { setDraft(null); setMsg(""); }} disabled={busy}>되돌리기</button>}
            <button type="button" className={btnPri} onClick={save} disabled={busy || !draft} data-testid="sms-save">{busy ? "저장 중" : "저장"}</button>
          </span>}
        </div>
        {!canEdit && <div className="text-[12.5px] text-[#7A879C]">회사 관리자만 바꿀 수 있어요</div>}
        {msg && <div className="text-[13px] font-semibold text-[#5B6B85]">{msg}</div>}
      </div>
    </div>
  );
}

// ─────────────── 회사정보 › 입금 자동 조회 계좌 ───────────────
const newId = () => `acc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export function BankAccountsCard({ company, canEdit }) {
  const raw = useAutoSettings(company);
  const link = usePopbillLink(company);
  const [state, setState] = React.useState(null);
  React.useEffect(() => subscribeBankState(company, setState), [company]);
  const accounts = Array.isArray(raw?.bankAccounts) ? raw.bankAccounts : [];
  const [form, setForm] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [guide, setGuide] = React.useState(false);
  const write = async (list, ok) => {
    setBusy("save"); setMsg("");
    try { await saveAutoSettings(company, { bankAccounts: list }); setMsg(ok); setForm(null); }
    catch (e) { setMsg(e?.code === "permission-denied" ? "회사 관리자만 바꿀 수 있어요" : e?.message || "저장하지 못했어요"); }
    finally { setBusy(""); }
  };
  const add = () => {
    const num = String(form.accountNumber || "").replace(/[^\d]/g, "");
    if (!form.bankCode) return setMsg("은행을 골라 주세요");
    if (num.length < 8) return setMsg("계좌번호를 다시 확인해 주세요");
    if (!String(form.holder || "").trim()) return setMsg("예금주를 넣어 주세요");
    if (accounts.some((a) => a.bankCode === form.bankCode && a.accountNumber === num)) return setMsg("이미 등록한 계좌예요");
    write([...accounts, { id: newId(), bankCode: form.bankCode, bankName: bankNameOf(form.bankCode), accountNumber: num, holder: form.holder.trim(), enabled: true, addedAt: Date.now() }], "계좌를 등록했어요");
  };
  const toggle = (a) => write(accounts.map((x) => (x.id === a.id ? { ...x, enabled: x.enabled === false } : x)), a.enabled === false ? "자동 조회를 켰어요" : "자동 조회를 껐어요");
  const remove = async (a) => { if (await kpConfirm(`${a.bankName || bankNameOf(a.bankCode)} ${maskAccount(a.accountNumber)} 계좌를 뺄까요? 이미 받은 입금 내역은 남아요.`, { title: "계좌 빼기", okText: "빼기", danger: true })) write(accounts.filter((x) => x.id !== a.id), "계좌를 뺐어요"); };
  const syncNow = async () => {
    setBusy("sync"); setMsg("");
    try { const r = await bankCall("syncNow"); setMsg(r?.off ? `${r.reason || "팝빌 연결 전이에요"}. 연결되면 매시간 자동으로 가져와요` : `새 입금 ${r?.new || 0}건 · 자동 반영 ${r?.auto || 0}건 · 확인 필요 ${r?.review || 0}건`); }
    catch (e) { setMsg(e?.message || "조회하지 못했어요"); } finally { setBusy(""); }
  };
  const accStatus = (a) => {
    if (a.enabled === false) return <Chip tone="muted">꺼짐</Chip>;
    const s = state?.accounts?.[a.id];
    if (!link?.popbill?.enabled || state?.status === "off") return <Chip tone="muted" title="사업자 등록 · 팝빌 연동 계약이 끝나면 켜져요">팝빌 연결 전</Chip>;
    if (s?.status === "error") return <Chip tone="error" title={s.lastError}>오류</Chip>;
    if (s?.lastSyncAt) return <Chip tone="ok" title={`마지막 조회 ${ago(s.lastSyncAt)}`}>조회 중 · {ago(s.lastSyncAt)}</Chip>;
    return <Chip tone="info">첫 조회 대기</Chip>;
  };
  return (
    <div className="rounded-[20px] border border-[#E3E8F0] bg-white overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04)]" data-testid="bank-accounts">
      <CardHead en="POPBILL · BANK" title="입금 자동 조회" sub="미수금 자동 매칭" right={<LinkChip link={link} />} />
      <div className="p-4 space-y-3">
        <OffNotice link={link} />
        <div className="text-[12.5px] text-[#7A879C]" title={'입금자명과 금액이 딱 맞으면 바로 입금 처리하고, 애매하면 미수금 화면의 "입금 확인 필요"에 모아 둬요.'}>등록한 계좌의 새 입금을 매시간(오전 8시 ~ 오후 8시) 가져와 미수금과 자동으로 맞춰요.</div>
        <div className="rounded-xl border border-[#E8EDF4] overflow-hidden">
          {!accounts.length && <div className="px-4 py-2.5 text-[13px] text-[#9AA9C3]">아직 등록한 계좌가 없어요</div>}
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 border-[#F0F3F8] flex-wrap" data-testid="bank-account-row">
              <span className="text-[14px] font-black text-[#0F1A30]">{a.bankName || bankNameOf(a.bankCode)}</span>
              <span className="tabular-nums text-[13.5px] text-[#3A4A66]">{maskAccount(a.accountNumber)}</span>
              <span className="text-[13px] text-[#7A879C]">{a.holder}</span>
              <span className="ml-auto flex items-center gap-1.5">{accStatus(a)}
                {canEdit && <><button type="button" className={btn} disabled={!!busy} onClick={() => toggle(a)}>{a.enabled === false ? "켜기" : "끄기"}</button>
                  <button type="button" className={btn} disabled={!!busy} onClick={() => remove(a)}>빼기</button></>}
              </span>
            </div>
          ))}
        </div>
        {form ? (
          <div className="grid sm:grid-cols-[160px_1fr_1fr] gap-2 items-end">
            <label className="block"><div className="text-[12.5px] font-black text-[#3A4A66] mb-1">은행</div>
              <select className={inp} value={form.bankCode} onChange={(e) => setForm((f) => ({ ...f, bankCode: e.target.value }))} data-testid="bank-select">
                <option value="">은행 고르기</option>
                {POPBILL_BANKS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
            </label>
            <label className="block"><div className="text-[12.5px] font-black text-[#3A4A66] mb-1">계좌번호</div>
              <input className={inp} inputMode="numeric" value={form.accountNumber} placeholder="숫자만" onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value.replace(/[^\d-]/g, "") }))} /></label>
            <label className="block"><div className="text-[12.5px] font-black text-[#3A4A66] mb-1">예금주</div>
              <input className={inp} value={form.holder} placeholder="통장에 적힌 이름" onChange={(e) => setForm((f) => ({ ...f, holder: e.target.value }))} /></label>
            <div className="sm:col-span-3 flex gap-2 justify-end">
              <button type="button" className={btn} onClick={() => { setForm(null); setMsg(""); }}>취소</button>
              <button type="button" className={btnPri} disabled={!!busy} onClick={add} data-testid="bank-add-save">{busy === "save" ? "저장 중" : "계좌 등록"}</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && <button type="button" className={btnPri} onClick={() => setForm({ bankCode: "", accountNumber: "", holder: "" })} data-testid="bank-add">계좌 추가</button>}
            <button type="button" className={btn} onClick={() => setGuide((g) => !g)}>{guide ? "조회 방식 닫기" : "조회 방식 안내"}</button>
            {canEdit && !!accounts.length && <button type="button" className={btn} disabled={!!busy} onClick={syncNow}>{busy === "sync" ? "조회 중" : "지금 조회"}</button>}
            {state?.checkedAt && <span className="ml-auto text-[12.5px] text-[#7A879C]">마지막 확인 {ago(state.checkedAt)}</span>}
          </div>
        )}
        {guide && (
          <ol className="rounded-xl bg-[#F7F9FC] border border-[#E8EDF4] px-4 py-3 space-y-1.5 text-[13px] text-[#3A4A66] leading-relaxed list-decimal list-inside" data-testid="bank-guide">
            <li>회사정보 › 팝빌 연동회원에 사업자번호를 등록해요</li>
            <li>은행 인터넷뱅킹에서 "빠른조회"(법인은 "간편조회") 서비스를 신청해요</li>
            <li>팝빌 사이트 › 계좌조회 › 계좌 관리에서 같은 계좌를 빠른조회 아이디로 등록해요. 비밀번호는 팝빌에만 넣고 여기에는 저장하지 않아요</li>
            <li>여기에 같은 은행 · 계좌번호를 등록하면 매시간 새 입금을 가져와요. 계좌마다 팝빌 계좌조회 월 이용료가 있어요</li>
          </ol>
        )}
        {msg && <div className="text-[13px] font-semibold text-[#5B6B85]">{msg}</div>}
      </div>
    </div>
  );
}

// ─────────────── 배차등록 "알림톡 보내기" ───────────────
//  value: 오더에 넣을 값(true/false) · 아직 안 바꿨으면 undefined → 회사 기본값을 보여 준다
export function AlimtalkOrderToggle({ company, value, onChange, compact = false, className = "" }) {
  const def = useAlimtalkDefault(company);
  const on = typeof value === "boolean" ? value : def;
  const changed = typeof value === "boolean" && value !== def;
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-[#E3E8F0] bg-white ${compact ? "px-3 py-2.5" : "px-4 py-3"} ${className}`} data-testid="alimtalk-order-toggle" data-on={on ? "1" : "0"}>
      <span className="inline-flex items-center justify-center min-w-8 h-8 px-1.5 rounded-lg shrink-0 text-[10.5px] font-black tracking-tight" style={{ background: on ? "#FEE500" : "#F1F4F8", color: on ? "#3C1E1E" : "#9AA9C3" }}>TALK</span>
      <div className="min-w-0">
        <div className="text-[13.5px] font-black text-[#0F1A30]">알림톡 보내기 {changed ? <span className="ml-1 text-[11.5px] font-bold text-[#2D4C82]">이 오더만 {on ? "켬" : "끔"}</span> : <span className="ml-1 text-[11.5px] font-bold text-[#9AA9C3]">회사 기본값</span>}</div>
        {!compact && <div className="text-[12px] text-[#7A879C] truncate">배차완료되면 거래처 담당자 · 기사에게 카카오 알림톡 · 건당 약 8~15원</div>}
      </div>
      <span className="ml-auto"><Switch on={on} label="알림톡 보내기" testId="alimtalk-order-switch" onChange={(v) => onChange(v)} /></span>
    </div>
  );
}

// ─────────────── 오더 상세 — 보낸 결과 · 다시 보내기 ───────────────
export function AlimtalkStatusChip({ result }) {
  const c = alimtalkChipOf(result);
  if (!c) return null;
  return <Chip tone={c.tone} title={c.detail} testId="alimtalk-chip">{c.label}{c.detail && c.tone === "error" ? ` · ${c.detail}` : ""}</Chip>;
}
export function AlimtalkOrderPanel({ row, canEdit = true }) {
  const [res, setRes] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [flag, setFlag] = React.useState(row?.알림톡 === true);
  React.useEffect(() => { setFlag(row?.알림톡 === true); setRes(null); setMsg(""); }, [row?._id, row?.알림톡]);
  if (!row) return null;
  const result = res || row.알림톡결과;
  const done = isAssignedDone(row);
  const send = async () => {
    if (!(await kpConfirm("이 오더 알림톡을 지금 보낼까요? 이미 보냈어도 다시 보내요.", { title: "알림톡 보내기", okText: "보내기" }))) return;
    setBusy("send"); setMsg("");
    try { const r = await alimtalkSendNow(row); setRes(r); setMsg(r?.status === "off" ? "팝빌 연결 전이라 아직 보내지 않았어요" : ""); }
    catch (e) { setMsg(e?.message || "보내지 못했어요"); } finally { setBusy(""); }
  };
  const flip = async (v) => {
    setFlag(v); setBusy("flag"); setMsg("");
    try { await updateDoc(doc(db, row.__col || "orders", row._id || row.id), { 알림톡: v }); setMsg(v && done ? "켰어요. 배차완료 오더라 바로 보내요" : v ? "켰어요. 배차완료되면 보내요" : "이 오더는 알림톡을 보내지 않아요"); }
    catch (e) { setFlag(!v); setMsg(e?.message || "바꾸지 못했어요"); } finally { setBusy(""); }
  };
  return (
    <div className="rounded-xl border border-[#E3E8F0] bg-white px-3.5 py-3 flex items-center gap-2.5 flex-wrap" data-testid="alimtalk-order-panel">
      <span className="inline-flex items-center justify-center min-w-7 h-7 px-1 rounded-md shrink-0 text-[10px] font-black tracking-tight" style={{ background: flag ? "#FEE500" : "#F1F4F8", color: flag ? "#3C1E1E" : "#9AA9C3" }}>TALK</span>
      <span className="text-[13.5px] font-black text-[#0F1A30]">알림톡</span>
      {canEdit && <Switch on={flag} disabled={!!busy} label="이 오더 알림톡" onChange={flip} />}
      <AlimtalkStatusChip result={result} />
      {!result && <span className="text-[12.5px] text-[#7A879C]">{flag ? (done ? "보낸 기록이 없어요" : "배차완료되면 보내요") : "보내지 않는 오더예요"}</span>}
      {canEdit && <button type="button" className={`${btn} ml-auto`} disabled={!!busy || !done} title={done ? "" : "배차완료된 오더만 보낼 수 있어요"} onClick={send} data-testid="alimtalk-send">{busy === "send" ? "보내는 중" : "알림톡 보내기"}</button>}
      {msg && <div className="basis-full text-[12.5px] font-semibold text-[#5B6B85]">{msg}</div>}
    </div>
  );
}

// ─────────────── 미수금 — 입금 확인 필요 ───────────────
export function BankReviewQueue({ company, clients = [], isViewer = false }) {
  const [txns, setTxns] = React.useState([]);
  const [state, setState] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [pick, setPick] = React.useState({});
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => subscribeBankTxns(company, setTxns), [company]);
  React.useEffect(() => subscribeBankState(company, setState), [company]);
  const review = txns.filter((t) => t.status === "review" || t.status === "new").sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  const auto = txns.filter((t) => t.status === "auto").sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0)).slice(0, 20);
  if (!review.length && !auto.length && !state) return null;
  const act = async (t, action, extra = {}) => {
    setBusy(`${t.id}:${action}`); setMsg("");
    try {
      const r = await bankCall(action, { id: t.id, ...extra });
      setMsg(action === "confirm" ? `${r.client || ""} ${won(t.amount)}원 반영${r.learned ? ` · 다음부터 "${t.name}" 입금은 이 거래처로 맞춰요` : ""}` : action === "undo" ? "되돌렸어요. 확인 목록으로 옮겼어요" : "넘겼어요");
    } catch (e) { setMsg(e?.message || "처리하지 못했어요"); } finally { setBusy(""); }
  };
  const undo = async (t) => { if (await kpConfirm(`${t.name || "입금"} ${won(t.amount)}원 자동 반영을 되돌릴까요? 입금 기록을 지우고 정산완료 표시도 예전대로 돌려요.`, { title: "자동 반영 되돌리기", okText: "되돌리기", danger: true })) act(t, "undo"); };
  const off = state?.status === "off";
  return (
    <div className="rounded-[18px] border border-[#E3E8F0] bg-white overflow-hidden" data-testid="bank-review">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full px-4 py-3 flex items-center gap-2.5 flex-wrap text-left">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#EEF3FA] text-[#2D4C82] text-[12px] font-black">입금</span>
        <span className="text-[15px] font-black text-[#0F1A30]">{review.length ? <>입금 확인 필요 <span className="text-[#B4342A]" data-testid="bank-review-count">{review.length}건</span></> : "은행 입금 자동 매칭"}</span>
        {!!auto.length && <Chip tone="ok">자동 반영 {auto.length}건</Chip>}
        {off && <Chip tone="muted" title={state?.reason}>팝빌 연결 전</Chip>}
        <span className="ml-auto text-[12.5px] text-[#7A879C]">{state?.checkedAt ? `마지막 확인 ${ago(state.checkedAt)}` : ""} {open ? "접기" : "펼치기"}</span>
      </button>
      {open && (
        <div className="border-t border-[#EEF1F6] p-3 space-y-2">
          {off && <div className="rounded-xl bg-[#F7F9FC] border border-[#E8EDF4] px-3.5 py-2.5 text-[13px] text-[#3A4A66]">팝빌이 연결되면 매시간 새 입금을 가져와 여기에 모아요. 지금은 "입금내역 올리기"(은행 엑셀)로 맞출 수 있어요.</div>}
          {review.map((t) => {
            const sel = pick[t.id] || "";
            return (
              <div key={t.id} className="rounded-xl border border-[#E8EDF4] px-3.5 py-3" data-testid="bank-review-row">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] tabular-nums text-[#7A879C]">{t.date} {t.time}</span>
                  <span className="text-[14.5px] font-black text-[#0F1A30]">{t.name || "입금자명 없음"}</span>
                  <span className="text-[14.5px] font-black tabular-nums text-[#1F7A4D]">+{won(t.amount)}원</span>
                  {t.reason && <span className="text-[12.5px] text-[#9A5B00]">{t.reason}</span>}
                  {t.bankName && <span className="ml-auto text-[12px] text-[#9AA9C3]">{t.bankName} {t.account}</span>}
                </div>
                {!isViewer && <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {(t.suggestions || []).filter((s) => s?.client).map((s) => (
                    <button key={s.client} type="button" disabled={!!busy} onClick={() => act(t, "confirm", { client: s.client })} title={s.reason}
                      className="h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black disabled:opacity-50" data-testid="bank-confirm">{s.client} 확정</button>
                  ))}
                  <select value={sel} onChange={(e) => setPick((p) => ({ ...p, [t.id]: e.target.value }))} className="h-8 px-2 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-bold text-[#1B2B4B] max-w-[200px]">
                    <option value="">다른 거래처</option>
                    {clients.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {sel && <button type="button" disabled={!!busy} onClick={() => act(t, "confirm", { client: sel })} className={`${btn} !h-8`}>이 거래처로 확정</button>}
                  <button type="button" disabled={!!busy} onClick={() => act(t, "ignore")} className={`${btn} !h-8 ml-auto`} data-testid="bank-ignore">무시</button>
                </div>}
              </div>
            );
          })}
          {!review.length && !off && <div className="px-1 text-[13px] text-[#7A879C]">확인할 입금이 없어요</div>}
          {!!auto.length && (
            <div className="pt-1">
              <div className="text-[12.5px] font-black text-[#3A4A66] mb-1 px-1">자동으로 반영한 입금</div>
              {auto.map((t) => (
                <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#F7F9FC] flex-wrap" data-testid="bank-auto-row">
                  <span className="text-[12.5px] tabular-nums text-[#7A879C]">{t.date} {t.time}</span>
                  <span className="text-[13.5px] font-black text-[#0F1A30]">{t.name}</span>
                  <span className="text-[13px] text-[#3A4A66]">→ {t.match?.client}</span>
                  <span className="text-[13.5px] font-black tabular-nums text-[#1F7A4D]">{won(t.amount)}원</span>
                  <Chip tone="ok">{t.match?.kind || "정산완료"}</Chip>
                  {!isViewer && <button type="button" disabled={!!busy} onClick={() => undo(t)} className={`${btn} !h-8 ml-auto`} data-testid="bank-undo">되돌리기</button>}
                </div>
              ))}
            </div>
          )}
          {msg && <div className="px-1 text-[13px] font-semibold text-[#5B6B85]">{msg}</div>}
        </div>
      )}
    </div>
  );
}
