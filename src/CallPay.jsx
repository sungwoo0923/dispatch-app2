// ======================= src/CallPay.jsx =======================
// 💳 2026-11-11 오더별 정산 표시(계산서 · 지급 · 입금) — 시험 기능(테스트운송사 + 관리센터에서 켠 운송사만)
//  화물운송은 오더가 두 방향이다.
//   · IN  (우리 오더) : 우리가 오더를 등록(콜에 올림) → 용차 기사가 잡음 → 기사가 우리에게 계산서 발행 → 우리가 기사에게 지급
//   · OUT (외부 콜)   : 우리가 콜 프로그램(24시 · 인성 · 화물맨…)에서 오더를 잡음 → 우리 기사에게 줌 → 우리가 콜 올린 업체(= 거래처)에 계산서 발행 → 그 업체가 우리에게 입금
//  ⭐ 2026-11-11 화면 표기는 IN / OUT(예전 "올린 콜 / 잡은 콜"). 저장값 콜구분: "OUT" | "IN" | ""(= IN) — 예전 값 "잡은콜"도 OUT으로 읽는다
//  · OUT 방식(어디서 잡았나) 목록은 회사별로 추가 · 삭제(선택 목록 "아웃콜방식" — 배차방식 목록과 같은 방식)
//  · 계산서 금액 = 운임(공급가액) + 부가세 10% — 정산 창 · 입금 확인에 함께 보여 준다
//  · 모든 창은 바깥을 눌러도 닫히지 않는다(닫기 단추로만)
//  배차현황에 칸을 여러 개 늘리지 않고 [정산] 칸 하나에 지금 단계만 알약으로 보여 주고, 누르면 날짜가 모두 나온다.
//  오더(dispatch 문서)에 적는 값 — 모두 선택 값이라 예전 오더는 그대로 "올린 콜"로 본다
//   콜구분: "잡은콜" | ""          콜플랫폼: "24시" | "인성" | "화물맨" | "기타"
//   계산서일: "YYYY-MM-DD"         (올린 콜 = 기사 계산서 받은 날 · 잡은 콜 = 우리가 발행한 날) — 사무실이 첨부에 [계산서]로 올리면 자동, 여기서 고칠 수 있다
//   입금상태: "입금완료" | ""       입금일 · 입금자명 · 입금처리자   (잡은 콜 — 정산관리 › 입금 확인에서 경리가 처리)
//   지급상태 · 지급일               (올린 콜 — 예전부터 있는 값. 정산관리 › 용차지급관리에서 경리가 처리)
//   입금거래id                      은행 입금 후보를 적용한 경우 그 입금(bankTxns) id — 같은 입금을 두 오더에 쓰지 않는다
//   지급알림: "YYYY-MM-DD"          지급완료 때 기사에게 자동 문자를 보낸 날
//  📩 기사 자동 문자 — 용차지급관리에서 [지급완료] 하면 기사에게 "○월○일 ○○원 입금" 문자(회사 번호 문자 = 팝빌 연결 필요 · 보낸 만큼 청구되므로 스위치를 켠 회사만)
//  🏦 은행 입금 후보 — 은행 입금 연동(팝빌)이 받아 둔 입금 가운데 금액(청구운임 또는 부가세 포함)이 같은 것을 입금 확인 화면에서 제안한다(적용은 사람이 누른다)
//   officeAttach: 숫자              사무실(운송사)이 올린 첨부 수 → 첨부 아이콘을 파란색으로(기사가 올린 것은 초록)
import React from "react";
import { createPortal } from "react-dom";
import { useCompanyFeatures } from "./companyFeatures";
import { getTenant } from "./fsTenant";
import { db } from "./firebase";
import { upsertAutoEntry } from "./ledgerAuto";
import { pdCall } from "./publicDataMain";
import { subscribeBankTxns } from "./popbillAuto";
import CustomDatePicker from "./CustomDatePicker";
import { CompanyOptionPicker } from "./companyOptionPicker";
import { kpConfirm } from "./kpDialog";
import { EvidenceBox, EvidenceViewer } from "./InvoiceEvidence"; // 🧾 2026-11-11 증빙서류 자동 스캔

export const BETA_COMPANY = "테스트운송사";
export const OUT_KEY = "아웃콜방식"; // 회사별 선택 목록(companyDropdownOptions) — 기본: 24시 · 인성 · 화물맨
export const vatOf = (v) => { const a = Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0; const vat = Math.round(a * 0.1); return { supply: a, vat, total: a + vat }; };
// 날짜 글자 다듬기 — 20261111 · 26.11.11 · 11/11 · 11-11 → YYYY-MM-DD (못 알아보면 "")
export function normDate(v, base = "") {
  const t = String(v || "").trim(); if (!t) return "";
  const y0 = (base || new Date(Date.now() + 9 * 3600e3).toISOString()).slice(0, 4);
  let m = /^(\d{4})[-./ ]?(\d{1,2})[-./ ]?(\d{1,2})$/.exec(t) || null;
  if (!m) { const m2 = /^(\d{2})[-./ ](\d{1,2})[-./ ](\d{1,2})$/.exec(t); if (m2) m = [0, `20${m2[1]}`, m2[2], m2[3]]; }
  if (!m) { const m3 = /^(\d{1,2})[-./ ](\d{1,2})$/.exec(t) || /^(\d{2})(\d{2})$/.exec(t); if (m3) m = [0, y0, m3[1], m3[2]]; }
  if (!m) return "";
  const mo = Number(m[2]); const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
// 날짜 칸 — 직접 입력(Enter · 칸을 벗어나면 다듬어 적용) + 프로그램 달력
export function DateField({ value, onChange, disabled = false, placeholder = "날짜", width = 150 }) {
  const [txt, setTxt] = React.useState(value || "");
  React.useEffect(() => { setTxt(value || ""); }, [value]);
  const commit = () => { const t = txt.trim(); if (!t) { if (value) onChange(""); return; } const n = normDate(t, value); if (n) { setTxt(n); if (n !== value) onChange(n); } else setTxt(value || ""); };
  return (
    <span className="inline-flex items-stretch rounded-lg border border-[#DCE3EE] bg-white overflow-hidden focus-within:border-[#1B2B4B]" style={{ width, opacity: disabled ? 0.55 : 1 }} data-date-field>
      <input value={txt} disabled={disabled} placeholder={placeholder} autoComplete="off" inputMode="numeric" onChange={(e) => setTxt(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
        className="flex-1 min-w-0 h-9 pl-2.5 pr-1 text-[13px] font-bold text-[#0F1A30] outline-none bg-transparent" style={NUM} />
      <CustomDatePicker value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} showIcon displayOverride=" " openOnFocus={false}
        className="h-9 w-9 shrink-0 border-l border-[#EEF2F8] text-[#5B6B85] hover:bg-[#F4F6FA] !justify-center" />
    </span>
  );
}
const NUM = { fontVariantNumeric: "tabular-nums" };
const today = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.toISOString().slice(0, 10); };
const md = (s) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? `${Number(m[1])}/${Number(m[2])}` : ""; };
const won = (v) => (Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0).toLocaleString("ko-KR");
const coNow = (company) => String(company || getTenant() || "").trim() || (() => { try { return String(localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "").trim(); } catch { return ""; } })();

// 정산 표시 · IN/OUT이 켜진 운송사인가 — ⭐ 2026-11-11 모든 운송사 기본 켜짐(관리센터 › 회사별 기능에서 끈 곳만 꺼짐). 테스트운송사는 늘 켜짐
export function useBetaOn(company) {
  const co = coNow(company);
  const f = useCompanyFeatures(co);
  return co === BETA_COMPANY || f.callPay === true;
}

export const isCaughtCall = (r) => r?.콜구분 === "OUT" || r?.콜구분 === "잡은콜"; // OUT = 외부 콜을 잡은 오더
export const callDir = (r) => (isCaughtCall(r) ? "OUT" : "IN");
// 지금 단계 — { kind, label, tone, date }
export function payStage(r) {
  if (!r) return null;
  if (isCaughtCall(r)) {
    if (r.입금상태 === "입금완료") return { kind: "in", label: "입금완료", tone: "done", date: r.입금일 || "" };
    if (r.계산서일) return { kind: "in", label: "입금대기", tone: "wait", date: r.계산서일 };
    return { kind: "in", label: "계산서 미발행", tone: "todo", date: "" };
  }
  if (r.지급상태 === "지급완료") return { kind: "out", label: "지급완료", tone: "done", date: r.지급일 || "" };
  if (!String(r.차량번호 || "").trim() && !String(r.이름 || r.기사명 || "").trim()) return null; // 아직 기사가 없으면 표시할 게 없다
  if (r.계산서일) return { kind: "out", label: "지급중", tone: "wait", date: r.계산서일 };
  return { kind: "out", label: "계산서 대기", tone: "todo", date: "" };
}
const TONE = {
  done: { bg: "#0F1A30", fg: "#fff", bd: "#0F1A30" },
  wait: { bg: "#EEF3FB", fg: "#1B2B4B", bd: "#C9D6EC" },
  todo: { bg: "#fff", fg: "#7A8AA8", bd: "#DCE3EE" },
};

// 배차현황 [정산] 칸 알약
export function PayBadge({ row, onOpen }) {
  const s = payStage(row);
  const caught = isCaughtCall(row);
  if (!s) return <button type="button" onClick={onOpen} title="정산 정보 보기" className="text-[12px] font-bold text-[#C2CBDB] hover:text-[#1B2B4B] px-2">–</button>;
  const t = TONE[s.tone];
  return (
    <button type="button" onClick={onOpen} title={`${caught ? "OUT · 외부 콜을 잡은 오더" : "IN · 우리 오더"} — 눌러서 정산 정보 보기`} data-pay-badge={s.label}
      className="inline-flex items-center gap-1 h-7 px-2 rounded-full text-[12px] font-black whitespace-nowrap hover:brightness-95"
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, ...NUM }}>
      <span className="text-[9.5px] font-black px-1 rounded tracking-wide" style={caught ? { background: s.tone === "done" ? "rgba(255,255,255,.2)" : "#1B2B4B", color: "#fff" } : { background: s.tone === "done" ? "rgba(255,255,255,.14)" : "#EEF2F8", color: s.tone === "done" ? "#CFE0FF" : "#7A8AA8" }}>{caught ? "OUT" : "IN"}</span>
      {s.label}{s.tone === "done" && s.date ? <span className="font-bold opacity-80">{md(s.date)}</span> : null}
    </button>
  );
}

const Row = ({ label, children }) => (
  <div className="flex items-center gap-3 py-2.5 border-b border-[#EEF2F8] last:border-b-0">
    <div className="w-[92px] shrink-0 text-[12.5px] font-bold text-[#5B6B85]">{label}</div>
    <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2 text-[13.5px] font-bold text-[#0F1A30]">{children}</div>
  </div>
);
const dateCls = "h-9 px-2.5 rounded-lg border border-[#DCE3EE] text-[13px] font-bold text-[#0F1A30] outline-none focus:border-[#1B2B4B] bg-white";

// 입금완료 처리(잡은 콜) — 오더에 기록 + 수입·지출 장부(수입)에 한 줄(같은 오더는 한 줄만, 취소하면 지운다)
export async function setCallDeposit({ row, done, date, name = "", patchDispatch, company, by = "", txnId = "" }) {
  const id = row?._id || row?.id;
  if (!id || !patchDispatch) return;
  const d = done ? (date || today()) : "";
  await patchDispatch(id, { 입금상태: done ? "입금완료" : "", 입금일: d, 입금자명: done ? String(name || "").trim().slice(0, 40) : "", 입금처리자: done ? by : "", 입금거래id: done ? String(txnId || "") : "", __system: true });
  const amt = done ? Number(String(row.청구운임 ?? "").replace(/[^\d.-]/g, "")) || 0 : 0;
  upsertAutoEntry(db, `calldep_${id}`, {
    company: coNow(company), date: d, type: "수입", account: "운송수입", item: `잡은 콜 입금 · ${row.거래처명 || ""}`, amount: amt, vendor: row.거래처명 || "",
    memo: "정산관리 › 입금 확인 [입금완료] — 자동 반영", auto: "calldep", purpose: "collect",
  }).catch(() => {});
}

// ── 배차방식 고르기: 먼저 IN / OUT → 그다음 방식 ──
//  오더등록 · 오더 복사/수정 패널의 배차방식 칸. 누르면 IN(우리 오더) / OUT(외부 콜을 잡은 오더)부터 고르고,
//  IN이면 배차방식 목록, OUT이면 OUT 방식 목록(24시 · 인성 · 화물맨…)이 이어서 열린다.
//  저장: 배차방식 = 고른 값(필수 칸 그대로) · 콜구분 = "IN" | "OUT" · 콜플랫폼 = OUT일 때 고른 값
//  시험 기능이 꺼진 운송사는 예전 배차방식 선택 그대로다.
export function DispatchWayPicker({ value = "", dir = "", onPick, className = "", placeholder = "선택", noneLabel = "선택", role, userCompany, disabled = false, style, wrapClassName = "" }) {
  const beta = useBetaOn(userCompany);
  const cur = dir === "OUT" || dir === "잡은콜" ? "OUT" : "IN";
  const [pend, setPend] = React.useState(cur); // 방금 고른 IN/OUT(목록을 고르기 전)
  const [ask, setAsk] = React.useState(null); // IN/OUT 고르는 작은 창 위치
  const [sig, setSig] = React.useState(0);
  const armed = React.useRef(false);
  const wrap = React.useRef(null);
  React.useEffect(() => { setPend(cur); }, [cur, value]);
  React.useEffect(() => {
    if (!ask) return undefined;
    const off = (e) => { if (!e.target.closest?.("[data-way-ask]")) setAsk(null); };
    const esc = (e) => { if (e.key === "Escape") setAsk(null); };
    const t = setTimeout(() => { window.addEventListener("mousedown", off, true); window.addEventListener("keydown", esc, true); }, 0);
    return () => { clearTimeout(t); window.removeEventListener("mousedown", off, true); window.removeEventListener("keydown", esc, true); };
  }, [ask]);
  const v = value === "선택없음" ? "" : (value || "");
  if (!beta) return <CompanyOptionPicker optKey="배차방식" placeholder={placeholder} noneLabel={noneLabel} className={wrapClassName ? `${wrapClassName} ${className.replace(/\bw-full\b/, "")}` : className} style={style} value={v} disabled={disabled} role={role} userCompany={userCompany} onChange={(x) => onPick?.({ 배차방식: x })} />;
  const openAsk = (e) => {
    if (disabled) return;
    if (armed.current) { armed.current = false; return; } // IN/OUT을 고른 직후 — 목록이 열리게 둔다
    e.preventDefault(); e.stopPropagation();
    const r = wrap.current?.getBoundingClientRect(); if (!r) return;
    const w = Math.max(r.width, 250); const up = window.innerHeight - r.bottom < 150;
    setAsk({ left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), width: w, ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
  };
  const choose = (d) => { setAsk(null); setPend(d); armed.current = true; setTimeout(() => { setSig((n) => n + 1); setTimeout(() => { armed.current = false; }, 300); }, 0); };
  return (
    <span ref={wrap} className={wrapClassName} style={{ display: "block", minWidth: 0 }} data-way-picker={cur}
      onClickCapture={(e) => { if (e.target.closest?.("button[data-opt-picker]")) openAsk(e); }}
      onKeyDownCapture={(e) => { if ((e.key === "Enter" || e.key === " " || e.key === "ArrowDown") && e.target.closest?.("button[data-opt-picker]") && e.target.getAttribute("aria-expanded") !== "true") openAsk(e); }}>
      <CompanyOptionPicker key={pend} optKey={pend === "OUT" ? OUT_KEY : "배차방식"} title={pend === "OUT" ? "OUT 방식" : "배차방식 (IN)"} placeholder={placeholder} noneLabel={noneLabel} className={className} style={style}
        value={pend === cur ? v : ""} disabled={disabled} role={role} userCompany={userCompany} openSignal={sig}
        labelOf={(x) => `${pend} · ${x}`}
        onChange={(x) => onPick?.({ 배차방식: x, 콜구분: x ? pend : "", 콜플랫폼: x && pend === "OUT" ? x : "" })} />
      {ask && createPortal(
        <div data-way-ask style={{ position: "fixed", zIndex: 2147483000, left: ask.left, width: ask.width, top: ask.top, bottom: ask.bottom, background: "#fff", borderRadius: 14, border: "1px solid #DCE3EE", boxShadow: "0 18px 40px rgba(15,26,48,.22)", padding: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", color: "#7A8AA8", margin: "2px 4px 8px" }}>DISPATCH · 먼저 IN / OUT을 고르세요</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[["IN", "우리가 등록한 오더"], ["OUT", "외부 콜을 잡은 오더"]].map(([d, sub]) => (
              <button key={d} type="button" data-way={d} autoFocus={d === cur} onClick={() => choose(d)}
                style={{ borderRadius: 12, padding: "10px 8px", cursor: "pointer", textAlign: "center", border: `1.5px solid ${d === cur && v ? "#0F1A30" : "#DCE3EE"}`, background: d === cur && v ? "#0F1A30" : "#fff", color: d === cur && v ? "#fff" : "#0F1A30" }}>
                <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "0.06em" }}>{d}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.7, marginTop: 2 }}>{sub}</div>
              </button>
            ))}
          </div>
        </div>, document.body)}
    </span>
  );
}

// ── 🏦 은행 입금 후보 ──
const normName = (v) => String(v || "").replace(/\(주\)|주식회사|㈜|\s|[()（）.,·-]/g, "").toLowerCase();
const toAmt = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
// 입금 대기 오더마다 후보 1건 — 금액이 청구운임(또는 부가세 포함)과 같은 입금. 입금자명이 거래처와 비슷한 것, 날짜가 계산서 뒤인 것을 먼저. 한 입금은 한 오더에만
export function suggestDeposits(waitRows, txns, usedIds = new Set()) {
  const out = new Map(); const taken = new Set(usedIds);
  const list = (txns || []).filter((t) => t && t.id && toAmt(t.amount) > 0 && t.status !== "auto");
  const scored = [];
  (waitRows || []).forEach((r) => {
    const amt = toAmt(r.청구운임); if (!amt) return;
    const vat = Math.round(amt * 1.1); const cn = normName(r.거래처명);
    list.forEach((t) => {
      const ta = toAmt(t.amount); if (ta !== amt && ta !== vat) return;
      const tn = normName(t.name);
      const nameHit = !!cn && !!tn && (cn.includes(tn) || tn.includes(cn) || (tn.length >= 2 && cn.includes(tn.slice(0, 3))));
      const after = !r.계산서일 || !t.date || String(t.date) >= String(r.계산서일);
      scored.push({ r, t, score: (nameHit ? 10 : 0) + (after ? 2 : 0) + (ta === vat ? 1 : 0), nameHit, vat: ta === vat && ta !== amt });
    });
  });
  scored.sort((a, b) => b.score - a.score || String(b.t.date || "").localeCompare(String(a.t.date || "")));
  scored.forEach((x) => { const id = x.r._id || x.r.id; if (out.has(id) || taken.has(x.t.id)) return; taken.add(x.t.id); out.set(id, { txn: x.t, nameHit: x.nameHit, vat: x.vat }); });
  return out;
}

// ── 📩 기사 자동 문자(지급완료) ──
const noticeKey = (co) => `kpPayNotice:${coNow(co)}`;
export const payNoticeOn = (co) => { try { return localStorage.getItem(noticeKey(co)) === "1"; } catch { return false; } };
export function PayNoticeToggle({ company }) {
  const [on, setOn] = React.useState(() => payNoticeOn(company));
  return (
    <button type="button" data-pay-notice={on ? "on" : "off"} title="켜 두면 [지급완료] 처리할 때 기사에게 입금 안내 문자를 자동으로 보냅니다(회사 번호 문자 = 팝빌 · 보낸 건수만큼 청구)"
      onClick={() => { const n = !on; try { localStorage.setItem(noticeKey(company), n ? "1" : "0"); } catch { /* 무시 */ } setOn(n); }}
      className="h-10 px-3.5 rounded-xl bg-white/10 border border-white/20 text-white text-[12.5px] font-black inline-flex items-center gap-2 whitespace-nowrap">
      지급 시 기사 문자
      <span className="relative w-9 h-5 rounded-full transition-colors" style={{ background: on ? "#8FB0F0" : "rgba(255,255,255,.25)" }}><span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: on ? "translateX(16px)" : "none" }} /></span>
    </button>
  );
}
export const payNoticeText = ({ company, name, items, date }) => {
  const total = items.reduce((s, r) => s + toAmt(r.기사운임), 0);
  const f = items[0];
  const what = `${md(f.상차일)} ${f.상차지명 || ""}→${f.하차지명 || ""}${items.length > 1 ? ` 외 ${items.length - 1}건` : ""}`.trim();
  return `[${company}] ${name ? `${name} 기사님, ` : ""}${what} 운임 ${won(total)}원이 ${md(date) || "오늘"} 입금되었습니다.`;
};
let noticeQ = []; let noticeT = null; let noticeOffWarned = false;
// [지급완료] 처리 때 부른다 — 한꺼번에 여러 건이면 기사(전화번호)별로 묶어 한 통씩
export function queuePayNotice({ row, date, company, patchDispatch }) {
  const co = coNow(company);
  if (!row || !payNoticeOn(co)) return;
  const phone = String(row.전화번호 || "").replace(/[^\d]/g, "");
  if (phone.length < 10 || !toAmt(row.기사운임) || row.지급알림) return;
  noticeQ.push({ row, date, co, phone, patchDispatch });
  clearTimeout(noticeT);
  noticeT = setTimeout(async () => {
    const q = noticeQ; noticeQ = [];
    const by = new Map();
    q.forEach((x) => { const k = `${x.co}|${x.phone}|${x.date}`; if (!by.has(k)) by.set(k, []); by.get(k).push(x); });
    let sent = 0;
    for (const list of by.values()) {
      const f = list[0];
      const content = payNoticeText({ company: f.co, name: f.row.이름 || f.row.기사명 || "", items: list.map((x) => x.row), date: f.date });
      try {
        const r = await pdCall("smsSend", { to: [{ phone: f.phone, name: f.row.이름 || f.row.기사명 || "" }], content }, 60000);
        if (r?.status === "off") { if (!noticeOffWarned) { noticeOffWarned = true; window.alert(`기사 자동 문자를 보내지 못했어요.\n${r.reason || "회사 번호 문자(팝빌)가 아직 연결되지 않았습니다"}\n회사정보 › 문자 보내기에서 팝빌 연결을 확인해 주세요.`); } return; }
        if (r?.status === "sent" || (r?.sent || 0) > 0) { sent += 1; list.forEach((x) => x.patchDispatch?.(x.row._id || x.row.id, { 지급알림: today(), __system: true })?.catch?.(() => {})); }
      } catch (e) { console.warn("[지급 문자] 실패", e?.message || e); }
    }
    if (sent) try { window.dispatchEvent(new CustomEvent("kp-pay-notice-sent", { detail: { sent } })); } catch { /* 무시 */ }
  }, 1500);
}

// 배차현황 [정산] 알약 · 입금 확인 [입금처리]를 누르면 뜨는 창 — 고친 내용은 아래 [저장] / [입금완료]를 눌러야 반영된다
export function PayPopup({ row, onClose, patchDispatch, canEdit = true, company = "", evidenceApi }) {
  const id = row?._id || row?.id;
  const init = () => ({ dir: callDir(row), platform: row?.콜플랫폼 || "", inv: row?.계산서일 || "", depDate: row?.입금일 || row?.입금증빙?.date || today(), depName: row?.입금자명 || row?.입금증빙?.payer || row?.계산서스캔?.payer || "" });
  const [f, setF] = React.useState(init);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setF(init()); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const out = f.dir === "OUT";
  const deposited = row?.입금상태 === "입금완료";
  const basePatch = () => ({ 콜구분: f.dir, 콜플랫폼: out ? f.platform : "", 계산서일: f.inv });
  const dirty = f.dir !== callDir(row) || (out ? f.platform : "") !== (row?.콜플랫폼 || "") || f.inv !== (row?.계산서일 || "")
    || (deposited && out && (f.depDate !== (row?.입금일 || "") || f.depName !== (row?.입금자명 || "")));
  const run = async (fn) => { if (!canEdit || !id || !patchDispatch) return; setBusy(true); try { await fn(); } catch (e) { window.alert(`저장하지 못했습니다: ${e?.message || e}`); } finally { setBusy(false); } };
  const save = () => run(async () => {
    if (deposited && !out) { await setCallDeposit({ row, done: false, patchDispatch, company }); } // IN으로 바꾸면 입금 기록도 지운다
    await patchDispatch(id, { ...basePatch(), ...(deposited && out ? { 입금일: f.depDate || today(), 입금자명: f.depName.trim().slice(0, 40) } : {}), __system: true });
    if (deposited && out && f.depDate !== (row?.입금일 || "")) await setCallDeposit({ row, done: true, date: f.depDate, name: f.depName, txnId: row?.입금거래id || "", patchDispatch, company }); // 장부 날짜도 맞춘다
  });
  const deposit = () => run(async () => {
    await patchDispatch(id, { ...basePatch(), ...(f.inv ? {} : { 계산서일: f.depDate || today() }), __system: true });
    await setCallDeposit({ row, done: true, date: f.depDate, name: f.depName, patchDispatch, company });
    onClose?.();
  });
  const undo = () => run(async () => { if (!(await kpConfirm("입금완료를 취소할까요? 수입·지출 장부에 자동으로 들어간 줄도 함께 지워집니다."))) return; await setCallDeposit({ row, done: false, patchDispatch, company }); });
  const amt = vatOf(out ? row?.청구운임 : row?.기사운임);
  // 🧾 증빙서류 스캔 결과 → 정산 창에 바로 반영 + 오더에 저장(계산서 발행일 · 계산서스캔 / 이체확인증이면 입금일 · 입금자명)
  const onScanned = async (scan) => {
    const keep = { kind: scan.kind, date: scan.date || "", supply: scan.supply || 0, vat: scan.vat || 0, total: scan.total || 0, supplier: scan.supplier || "", buyer: scan.buyer || "", payer: scan.payer || "", at: today() };
    const transfer = scan.kind === "이체확인증";
    setF((p) => ({
      ...p,
      ...(!transfer && scan.date ? { inv: scan.date } : {}),
      ...(transfer && scan.date ? { depDate: scan.date } : {}),
      ...(out && scan.payer && (!deposited || !p.depName) ? { depName: scan.payer.slice(0, 40) } : {}),
    }));
    if (!canEdit || !id || !patchDispatch) return;
    try {
      await patchDispatch(id, transfer ? { 입금증빙: keep, __system: true } : { ...(scan.date ? { 계산서일: scan.date } : {}), 계산서스캔: keep, __system: true });
    } catch (e) { console.warn("[증빙 스캔] 저장 실패:", e?.message || e); }
  };
  const s = payStage(row);
  const seg = "px-4 h-9 rounded-lg text-[13px] font-black tracking-wide whitespace-nowrap";
  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/45 flex items-center justify-center p-4">
      <div className="w-full max-w-[540px] max-h-[92vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" data-pay-popup>
        <div className="px-5 py-4 text-white flex items-center gap-3 shrink-0" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">SETTLE · 정산</div>
            <div className="text-[16px] font-black truncate">{row?.거래처명 || "-"}</div>
            <div className="text-[12px] text-white/60 truncate" style={NUM}>{row?.상차일 || ""} · {row?.상차지명 || ""} → {row?.하차지명 || ""}{row?.이름 || row?.기사명 ? ` · ${row.이름 || row.기사명}` : ""}{row?.차량번호 ? ` · ${row.차량번호}` : ""}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[16px] shrink-0">✕</button>
        </div>
        <div className="px-5 py-3 overflow-y-auto">
          <Row label="오더 구분">
            <div className="inline-flex rounded-xl bg-[#F1F4F9] p-1">
              {[["IN", "IN"], ["OUT", "OUT"]].map(([v, l]) => (
                <button key={v} type="button" disabled={!canEdit || busy} onClick={() => set("dir", v)} data-dir={v}
                  className={`${seg} ${f.dir === v ? "bg-[#0F1A30] text-white shadow-sm" : "text-[#7A8AA8]"}`}>{l}</button>
              ))}
            </div>
            <span className="text-[11.5px] font-semibold text-[#9AA9C3]">{out ? "외부 콜을 잡아 우리 기사에게 준 오더" : "우리가 등록해 기사가 잡은 오더"}</span>
          </Row>
          {out && (
            <Row label="OUT 방식">
              <CompanyOptionPicker optKey={OUT_KEY} title="OUT 방식" placeholder="선택" noneLabel="선택 안 함" disabled={!canEdit || busy} userCompany={company}
                className="h-9 min-w-[150px] px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-bold text-[#0F1A30] bg-white" value={f.platform} onChange={(v) => set("platform", v)} />
              <span className="text-[11.5px] font-semibold text-[#9AA9C3]">목록에서 추가 · 삭제할 수 있어요</span>
            </Row>
          )}
          <Row label={out ? "계산서 발행일" : "계산서 받은 날"}>
            <DateField value={f.inv} onChange={(v) => set("inv", v)} disabled={!canEdit || busy} placeholder="미발행" />
            {canEdit && !f.inv && <button type="button" disabled={busy} onClick={() => set("inv", today())} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B]">오늘</button>}
            {canEdit && f.inv && <button type="button" disabled={busy} onClick={() => set("inv", "")} className="text-[12px] font-bold text-[#9AA9C3] hover:text-red-600">지우기</button>}
          </Row>
          <Row label={out ? "받을 금액" : "줄 금액"}>
            <div className="w-full rounded-xl border border-[#E3E8F0] bg-[#F7F9FC] px-3.5 py-2.5 grid grid-cols-3 gap-2 text-center" style={NUM} data-vat>
              {[[out ? "운임(청구운임)" : "운임(기사운임)", amt.supply, false], ["부가세 10%", amt.vat, false], ["계산서 합계", amt.total, true]].map(([l, v, strong]) => (
                <div key={l}><div className="text-[11px] font-bold text-[#7A8AA8]">{l}</div><div className={`${strong ? "text-[15px] font-black text-[#0F1A30]" : "text-[13.5px] font-bold text-[#3A4A66]"}`}>{won(v)}</div></div>
              ))}
            </div>
            <span className="text-[11.5px] font-semibold text-[#9AA9C3]">세금계산서는 운임에 부가세 10%를 더한 금액으로 발행합니다(간이 · 면세는 운임만).</span>
          </Row>
          {out ? (
            <Row label="입금">
              {deposited && <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-[#0F1A30] text-white text-[12px] font-black">입금완료</span>}
              <DateField value={f.depDate} onChange={(v) => set("depDate", v || today())} disabled={!canEdit || busy} placeholder="입금일" />
              <input value={f.depName} disabled={!canEdit || busy} onChange={(e) => set("depName", e.target.value)} placeholder="입금자명(선택)" autoComplete="off"
                className="h-9 w-[130px] px-2.5 rounded-lg border border-[#DCE3EE] text-[13px] font-bold text-[#0F1A30] outline-none focus:border-[#1B2B4B] bg-white" />
              {!deposited && <span className="basis-full text-[11.5px] font-semibold text-[#9AA9C3]">입금일은 오늘로 들어가 있습니다. 직접 입력하거나 달력에서 고르세요.</span>}
            </Row>
          ) : (
            <Row label="기사 지급">
              {row?.지급상태 === "지급완료"
                ? <><span className="inline-flex items-center h-7 px-2.5 rounded-full bg-[#0F1A30] text-white text-[12px] font-black">지급완료</span><span style={NUM}>{row.지급일 || ""}</span></>
                : <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-[#EEF3FB] text-[#1B2B4B] text-[12px] font-black border border-[#C9D6EC]">{s ? "지급중" : "기사 미정"}</span>}
              {row?.지급알림 && <span className="text-[12px] font-bold text-[#2D4C82]" style={NUM}>기사 문자 보냄 {md(row.지급알림)}</span>}
              <span className="basis-full text-[11.5px] font-semibold text-[#9AA9C3]">지급 처리 · 지급일 수정은 정산관리 › 용차지급관리에서 합니다.</span>
            </Row>
          )}
          {/* 🧾 증빙서류 — 올리면 자동 스캔(오더 스캔과 같은 정밀 인식) */}
          <EvidenceBox row={row} {...(evidenceApi ? { api: evidenceApi } : {})} canEdit={canEdit} expect={out ? row?.청구운임 : row?.기사운임} onScanned={onScanned} known={[coNow(company), row?.거래처명, row?.이름 || row?.기사명].filter(Boolean)} self={coNow(company)} selfIs={out ? "supplier" : "buyer"} />
        </div>
        <div className="px-5 py-3.5 bg-[#F7F9FC] border-t border-[#EEF2F8] flex items-center gap-2 shrink-0">
          <span className="flex-1 min-w-0 text-[11.5px] font-semibold text-[#7A8AA8] leading-snug">{dirty ? <b className="text-[#B54708]">저장하지 않은 변경이 있습니다</b> : "아래 증빙서류에 계산서를 올리면 발행일 · 금액 · 입금자명이 자동으로 들어갑니다."}</span>
          {canEdit && out && deposited && <button type="button" disabled={busy} onClick={undo} className="h-10 px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[13px] font-black text-[#9A1F15] whitespace-nowrap">입금 취소</button>}
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[13px] font-black text-[#3A4A66]">닫기</button>
          {canEdit && <button type="button" disabled={busy || !dirty} onClick={save} data-pay-save className="h-10 px-5 rounded-xl border border-[#1B2B4B] bg-white text-[13px] font-black text-[#1B2B4B] disabled:opacity-40">{busy ? "저장 중…" : "저장"}</button>}
          {canEdit && out && !deposited && <button type="button" disabled={busy} onClick={deposit} data-pay-deposit className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black disabled:opacity-40 whitespace-nowrap">입금완료</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// 정산관리 › 입금 확인 — 잡은 콜의 입금을 경리가 확인해 [입금완료] 처리(배차현황 [정산] 칸에 바로 보인다)
export function CallDepositDesk({ orders = [], patchDispatch, isViewer = false, company = "", testTxns = null, onAttach = null, evidenceApi }) {
  const [popId, setPopId] = React.useState(""); // 목록에서 [입금처리]를 누른 오더
  const [filter, setFilter] = React.useState("wait"); // wait | done | all
  // 🔎 2026-11-11 검색 — 입력만으로는 안 바뀌고 [조회](또는 Enter)를 눌러야 적용된다 · 기간(시작일 ~ 종료일, 프로그램 달력) · 기준 날짜
  const [qd, setQd] = React.useState(""); const [fromD, setFromD] = React.useState(""); const [toD, setToD] = React.useState(""); const [basisD, setBasisD] = React.useState("상차일");
  const [ap, setAp] = React.useState({ q: "", from: "", to: "", basis: "상차일" });
  const q = ap.q;
  const search = () => { if (fromD && toD && fromD > toD) { window.alert("시작일이 종료일보다 늦습니다."); return; } setAp({ q: qd.trim(), from: fromD, to: toD, basis: basisD }); setSel(new Set()); };
  const quick = (k) => {
    const t = today(); const [y, m] = t.split("-").map(Number);
    const ymd = (yy, mm, dd) => `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    const last = (yy, mm) => new Date(yy, mm, 0).getDate();
    if (k === "this") { setFromD(ymd(y, m, 1)); setToD(t); }
    if (k === "prev") { const py = m === 1 ? y - 1 : y; const pm = m === 1 ? 12 : m - 1; setFromD(ymd(py, pm, 1)); setToD(ymd(py, pm, last(py, pm))); }
    if (k === "3m") { const d = new Date(y, m - 1 - 2, 1); setFromD(ymd(d.getFullYear(), d.getMonth() + 1, 1)); setToD(t); }
    if (k === "all") { setFromD(""); setToD(""); }
  };
  const [evRow, setEvRow] = React.useState(null); // 증빙서류 보기
  const [sel, setSel] = React.useState(() => new Set());
  const [date, setDate] = React.useState(today());
  const [busy, setBusy] = React.useState(false);
  const all = React.useMemo(() => (orders || []).filter(isCaughtCall), [orders]);
  // 🏦 은행 입금 후보(팝빌 은행 연동이 받아 둔 입금 — 아직 거래처정산에 쓰이지 않은 것)
  const [txns, setTxns] = React.useState(testTxns || []);
  React.useEffect(() => { if (testTxns) return undefined; return subscribeBankTxns(coNow(company), setTxns); }, [company, testTxns]);
  const sugg = React.useMemo(() => suggestDeposits(all.filter((r) => r.입금상태 !== "입금완료"), txns, new Set((orders || []).map((r) => r.입금거래id).filter(Boolean))), [all, txns, orders]);
  const applySugg = async (list) => {
    if (isViewer) return window.alert("조회전용 권한으로는 처리할 수 없습니다.");
    setBusy(true);
    try { for (const r of list) { const g = sugg.get(r._id || r.id); if (g) await setCallDeposit({ row: r, done: true, date: g.txn.date || today(), name: g.txn.name || "", txnId: g.txn.id, patchDispatch, company }); } }
    catch (e) { window.alert(`처리하지 못했습니다: ${e?.message || e}`); } finally { setBusy(false); }
  };
  // 조회 조건(검색어 · 기간)에 맞는 오더 — 상태 단추 숫자도 이걸로 센다
  const found = React.useMemo(() => {
    const k = q.trim();
    const dOf = (r) => String((ap.basis === "계산서일" ? r.계산서일 : ap.basis === "입금일" ? r.입금일 : r.상차일) || "").slice(0, 10);
    return all
      .filter((r) => !k || [r.거래처명, r.상차지명, r.하차지명, r.이름, r.기사명, r.차량번호, r.콜플랫폼, r.입금자명].some((v) => String(v || "").includes(k)))
      .filter((r) => { if (!ap.from && !ap.to) return true; const d = dOf(r); if (!d) return false; return (!ap.from || d >= ap.from) && (!ap.to || d <= ap.to); });
  }, [all, q, ap]);
  const counts = React.useMemo(() => { const done = found.filter((r) => r.입금상태 === "입금완료").length; return { wait: found.length - done, done, all: found.length }; }, [found]);
  const rows = React.useMemo(() => found
    .filter((r) => (filter === "all" ? true : filter === "done" ? r.입금상태 === "입금완료" : r.입금상태 !== "입금완료"))
    .sort((a, b) => String(b.상차일 || "").localeCompare(String(a.상차일 || ""))), [found, filter]);
  const idOf = (r) => r._id || r.id;
  const sum = (list) => list.reduce((s, r) => s + (Number(String(r.청구운임 ?? "").replace(/[^\d.-]/g, "")) || 0), 0);
  const waitAll = all.filter((r) => r.입금상태 !== "입금완료");
  const old = waitAll.filter((r) => r.계산서일 && (Date.now() - new Date(r.계산서일).getTime()) / 86400e3 > 30);
  const run = async (list, done) => {
    if (isViewer) return window.alert("조회전용 권한으로는 처리할 수 없습니다.");
    if (!list.length) return window.alert("오더를 골라 주세요.");
    setBusy(true);
    try { for (const r of list) await setCallDeposit({ row: r, done, date, patchDispatch, company }); setSel(new Set()); }
    catch (e) { window.alert(`처리하지 못했습니다: ${e?.message || e}`); } finally { setBusy(false); }
  };
  const picked = rows.filter((r) => sel.has(idOf(r)));
  const th = "px-3 py-2.5 text-[12.5px] font-bold text-white whitespace-nowrap text-center";
  const td = "px-3 py-2.5 text-[13px] text-[#0F1A30] whitespace-nowrap text-center border-t border-[#EEF2F8]";
  return (
    <div className="p-4 space-y-3" data-call-deposit>
      <div className="rounded-2xl px-5 py-4 text-white flex flex-wrap items-center gap-4" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
        <div className="min-w-0">
          <div className="text-[10px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">DEPOSIT · OUT 오더 입금 확인</div>
          <div className="text-[20px] font-black">입금 확인</div>
          <div className="text-[12px] text-white/60">외부 콜을 잡아 우리 기사에게 준 오더 목록입니다. 업체 입금 완료 시 입금처리 하시면 배차현황 정산에 적용됩니다.</div>
        </div>
        <div className="ml-auto flex gap-2" style={NUM}>
          {[["입금 대기", `${waitAll.length}건`, `${won(sum(waitAll))}원`], ["30일 넘음", `${old.length}건`, `${won(sum(old))}원`]].map(([l, a, b]) => (
            <div key={l} className="rounded-xl bg-white/10 border border-white/15 px-4 py-2 text-right">
              <div className="text-[11px] font-bold text-white/60">{l}</div>
              <div className="text-[15px] font-black">{a} <span className="text-[12px] font-bold text-white/70">{b}</span></div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-[#E3E8F0] px-4 py-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-[#F1F4F9] p-1" data-dep-filter>
          {[["wait", "입금 대기"], ["done", "입금완료"], ["all", "전체"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setFilter(k); setSel(new Set()); }} data-filter={k} className={`px-3 h-8 rounded-lg text-[12.5px] font-black inline-flex items-center gap-1.5 ${filter === k ? "bg-white text-[#0F1A30] shadow-sm" : "text-[#7A8AA8]"}`}>
              {l}<span className={`min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-black inline-flex items-center justify-center ${filter === k ? (k === "wait" ? "bg-[#C2453D] text-white" : "bg-[#0F1A30] text-white") : "bg-[#DCE3EE] text-[#5B6B85]"}`} style={NUM}>{counts[k]}</span>
            </button>
          ))}
        </div>
        {/* 기간 — 기준 날짜 · 시작일 ~ 종료일(프로그램 달력) */}
        <div className="inline-flex items-center gap-1.5" data-dep-range>
          <select value={basisD} onChange={(e) => setBasisD(e.target.value)} className="h-9 px-2 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B] bg-white outline-none">
            {["상차일", "계산서일", "입금일"].map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <DateField value={fromD} onChange={setFromD} placeholder="시작일" width={138} />
          <span className="text-[#9AA9C3] font-black">~</span>
          <DateField value={toD} onChange={setToD} placeholder="종료일" width={138} />
          <span className="inline-flex rounded-lg border border-[#DCE3EE] overflow-hidden">
            {[["this", "이번 달"], ["prev", "지난 달"], ["3m", "3개월"], ["all", "전체"]].map(([k, l]) => <button key={k} type="button" onClick={() => quick(k)} className="h-9 px-2 text-[11.5px] font-black text-[#5B6B85] hover:bg-[#F4F6FA] border-l first:border-l-0 border-[#EEF2F8]">{l}</button>)}
          </span>
        </div>
        {/* 검색창 — 안에 [조회] */}
        <div className="inline-flex items-center h-9 w-[300px] rounded-lg border border-[#DCE3EE] bg-white overflow-hidden focus-within:border-[#1B2B4B]" data-dep-search>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9AA9C3" strokeWidth="2.2" strokeLinecap="round" className="ml-2.5 shrink-0"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={qd} onChange={(e) => setQd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} placeholder="거래처 · 기사 · 상하차지 · 입금자" autoComplete="off" className="flex-1 min-w-0 h-full px-2 text-[13px] font-semibold outline-none bg-transparent" />
          <button type="button" onClick={search} data-dep-search-go className="h-7 mr-1 px-3.5 rounded-md bg-[#0F1A30] text-white text-[12.5px] font-black shrink-0 hover:bg-[#1B2B4B]">조회</button>
        </div>
        {(ap.q || ap.from || ap.to) && <span className="text-[11.5px] font-bold text-[#2D4C82]" style={NUM}>조회 중: {ap.q ? `"${ap.q}" ` : ""}{ap.from || ap.to ? `${ap.basis} ${ap.from || "처음"} ~ ${ap.to || "오늘"}` : ""} <button type="button" onClick={() => { setQd(""); setFromD(""); setToD(""); setAp({ q: "", from: "", to: "", basis: basisD }); }} className="ml-1 text-[#9AA9C3] hover:text-red-600">✕</button></span>}
        <div className="basis-full h-0" />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-bold text-[#5B6B85]" style={NUM}>선택 {picked.length}건 · {won(sum(picked))}원</span>
          {filter !== "done" && <><span className="text-[12.5px] font-bold text-[#5B6B85]">선택 건 입금일</span><DateField value={date} onChange={(v) => setDate(v || today())} />
            <button type="button" disabled={busy || isViewer} onClick={() => run(picked.filter((r) => r.입금상태 !== "입금완료"), true)} className="h-9 px-4 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black disabled:opacity-40 whitespace-nowrap">{busy ? "처리 중…" : "선택 건 입금완료"}</button></>}
          {filter !== "done" && sugg.size > 0 && <button type="button" disabled={busy || isViewer} data-sugg-all onClick={() => applySugg(rows.filter((r) => sugg.get(idOf(r))?.nameHit))} title="입금자명까지 맞는 후보만 한 번에 입금완료 처리합니다"
            className="h-9 px-3.5 rounded-lg border border-[#2D4C82] text-[13px] font-black text-[#2D4C82] disabled:opacity-40 whitespace-nowrap">은행 입금 후보 {[...sugg.values()].filter((g) => g.nameHit).length}건 적용</button>}
          {filter !== "wait" && <button type="button" disabled={busy || isViewer} onClick={() => run(picked.filter((r) => r.입금상태 === "입금완료"), false)} className="h-9 px-4 rounded-lg border border-[#DCE3EE] text-[13px] font-black text-[#3A4A66] disabled:opacity-40 whitespace-nowrap">선택 건 입금 취소</button>}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-[#E3E8F0] overflow-x-auto">
        <table className="w-full min-w-max">
          <thead className="bg-[#1B2B4B]"><tr>
            <th className={th}><input type="checkbox" checked={rows.length > 0 && rows.every((r) => sel.has(idOf(r)))} onChange={(e) => setSel(e.target.checked ? new Set(rows.map(idOf)) : new Set())} /></th>
            {["상차일", "OUT 방식", "업체(거래처)", "상차지 → 하차지", "기사", "운임", "부가세 포함", "계산서 발행일", "증빙", "첨부", "입금", "입금일 · 은행 입금 후보", "처리"].map((h) => <th key={h} className={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={14} className="py-14 text-center text-[13px] font-semibold text-[#9AA9C3]">{all.length ? "해당하는 오더가 없습니다." : "OUT 오더가 아직 없습니다. 배차현황 [정산] 칸을 누르거나 선택수정에서 IN/OUT을 OUT으로 바꿔 주세요."}</td></tr>}
            {rows.map((r) => {
              const done = r.입금상태 === "입금완료";
              return (
                <tr key={idOf(r)} className={sel.has(idOf(r)) ? "bg-[#F5F8FD]" : ""}>
                  <td className={td}><input type="checkbox" checked={sel.has(idOf(r))} onChange={() => setSel((p) => { const n = new Set(p); if (n.has(idOf(r))) n.delete(idOf(r)); else n.add(idOf(r)); return n; })} /></td>
                  <td className={td} style={NUM}>{r.상차일 || ""}</td>
                  <td className={td}>{r.콜플랫폼 || "-"}</td>
                  <td className={`${td} font-bold`}>{r.거래처명 || "-"}</td>
                  <td className={td}>{r.상차지명 || ""} → {r.하차지명 || ""}</td>
                  <td className={td}>{r.이름 || r.기사명 || "-"}</td>
                  <td className={td} style={NUM}>{won(r.청구운임)}</td>
                  <td className={`${td} font-black`} style={NUM}>{won(vatOf(r.청구운임).total)}</td>
                  <td className={td} style={NUM}>{r.계산서일 || <span className="text-[#C2CBDB]">미발행</span>}</td>
                  <td className={td}>
                    {r.계산서스캔 || r.입금증빙 ? (() => { const sc = r.계산서스캔 || r.입금증빙; const okAmt = [vatOf(r.청구운임).supply, vatOf(r.청구운임).total].some((v) => v && (Math.abs(v - (sc.supply || 0)) <= 10 || Math.abs(v - (sc.total || 0)) <= 10)); return (
                      <button type="button" onClick={() => setEvRow(r)} data-desk-evidence title={`${sc.kind || "증빙"} · ${sc.date || ""} · 합계 ${won(sc.total)}원${sc.payer ? ` · ${sc.payer}` : ""}`}
                        className={`inline-flex items-center gap-1 h-7 px-2 rounded-full text-[11.5px] font-black border ${okAmt ? "bg-[#ECFDF3] text-[#067647] border-[#ABEFC6]" : "bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]"}`}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2h16v20l-3-2-3 2-3-2-3 2-4-2z" /><path d="M8 7h8M8 11h8M8 15h5" /></svg>
                        {sc.kind === "이체확인증" ? "이체" : "계산서"} {okAmt ? "✓" : "!"}
                      </button>); })()
                      : <button type="button" onClick={() => setPopId(idOf(r))} className="text-[11.5px] font-bold text-[#C2CBDB] hover:text-[#1B2B4B]" title="정산 창에서 증빙서류를 올립니다">+ 올리기</button>}
                  </td>
                  <td className={td}>
                    <button type="button" onClick={() => onAttach?.(r)} disabled={!onAttach} title="첨부 보기 · 올리기(배차현황 첨부와 같은 파일)" data-desk-attach
                      className="relative inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[#F1F4F9]">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={(r.attachCount || 0) > 0 ? ((r.officeAttach || 0) > 0 ? "#2563EB" : "#059669") : "#cbd5e1"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                      {(r.attachCount || 0) > 0 && <span className={`absolute -top-1 -right-1 min-w-[16px] h-[16px] ${(r.officeAttach || 0) > 0 ? "bg-blue-600" : "bg-emerald-500"} text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none`}>{r.attachCount}</span>}
                    </button>
                  </td>
                  <td className={td}>{done ? <span className="inline-flex items-center h-6 px-2 rounded-full bg-[#0F1A30] text-white text-[11.5px] font-black">입금완료</span> : <span className="inline-flex items-center h-6 px-2 rounded-full bg-[#EEF3FB] text-[#1B2B4B] text-[11.5px] font-black border border-[#C9D6EC]">대기</span>}</td>
                  <td className={td} style={NUM}>
                    {r.입금일 || ""}{r.입금자명 ? <span className="ml-1 text-[12px] text-[#7A8AA8]">{r.입금자명}</span> : null}
                    {!done && sugg.get(idOf(r)) && (() => { const g = sugg.get(idOf(r)); return (
                      <span className="inline-flex items-center gap-1.5" data-sugg>
                        <span className={`inline-flex items-center h-6 px-2 rounded-full text-[11.5px] font-black border ${g.nameHit ? "bg-[#EEF3FB] text-[#1B2B4B] border-[#C9D6EC]" : "bg-white text-[#7A8AA8] border-[#DCE3EE]"}`} title={g.nameHit ? "금액 · 입금자명이 맞습니다" : "금액만 같습니다 — 입금자명을 확인해 주세요"}>
                          {md(g.txn.date)} {g.txn.name || "입금자 없음"} {won(g.txn.amount)}{g.vat ? " (부가세 포함)" : ""}{g.nameHit ? "" : " · 금액만"}
                        </span>
                        <button type="button" disabled={busy || isViewer} onClick={() => applySugg([r])} className="h-6 px-2 rounded-md bg-[#0F1A30] text-white text-[11.5px] font-black disabled:opacity-40">적용</button>
                      </span>
                    ); })()}
                  </td>
                  <td className={td}>
                    {done
                      ? <span className="inline-flex gap-1.5"><button type="button" onClick={() => setPopId(idOf(r))} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#3A4A66] whitespace-nowrap">수정</button>
                        <button type="button" disabled={busy || isViewer} data-row-undo onClick={async () => { if (await kpConfirm(`${r.거래처명 || "이 오더"} 입금완료를 취소할까요?`)) run([r], false); }} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#9A1F15] whitespace-nowrap disabled:opacity-40">입금 취소</button></span>
                      : <button type="button" disabled={isViewer} data-row-deposit onClick={() => setPopId(idOf(r))} className="h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[12px] font-black whitespace-nowrap disabled:opacity-40">입금처리</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {popId && (() => { const pr = (orders || []).find((x) => idOf(x) === popId); return pr ? <PayPopup row={pr} onClose={() => setPopId("")} patchDispatch={patchDispatch} canEdit={!isViewer} company={company} evidenceApi={evidenceApi} /> : null; })()}
      {evRow && <EvidenceViewer row={evRow} expect={evRow.청구운임} onClose={() => setEvRow(null)} {...(evidenceApi ? { api: evidenceApi } : {})} />}
    </div>
  );
}
