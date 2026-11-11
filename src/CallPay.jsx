// ======================= src/CallPay.jsx =======================
// 💳 2026-11-11 오더별 정산 표시(계산서 · 지급 · 입금) — 시험 기능(테스트운송사 + 관리센터에서 켠 운송사만)
//  화물운송은 오더가 두 방향이다.
//   · 올린 콜  : 우리가 오더를 등록(콜에 올림) → 용차 기사가 잡음 → 기사가 우리에게 계산서 발행 → 우리가 기사에게 지급
//   · 잡은 콜  : 우리가 콜 프로그램(24시 · 인성 · 화물맨…)에서 오더를 잡음 → 지입 기사에게 줌 → 우리가 콜 올린 업체(= 거래처)에 계산서 발행 → 그 업체가 우리에게 입금
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

export const BETA_COMPANY = "테스트운송사";
export const CALL_PLATFORMS = ["24시", "인성", "화물맨", "기타"];
const NUM = { fontVariantNumeric: "tabular-nums" };
const today = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.toISOString().slice(0, 10); };
const md = (s) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? `${Number(m[1])}/${Number(m[2])}` : ""; };
const won = (v) => (Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0).toLocaleString("ko-KR");
const coNow = (company) => String(company || getTenant() || "").trim() || (() => { try { return String(localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "").trim(); } catch { return ""; } })();

// 시험 기능이 켜진 운송사인가 — 테스트운송사는 늘 켜짐, 다른 운송사는 관리센터 › 회사별 기능 "정산 표시(시험)"을 켠 곳만
export function useBetaOn(company) {
  const co = coNow(company);
  const f = useCompanyFeatures(co);
  return co === BETA_COMPANY || f.callPay === true;
}

export const isCaughtCall = (r) => r?.콜구분 === "잡은콜";
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
    <button type="button" onClick={onOpen} title={`${caught ? "잡은 콜" : "올린 콜"} · 눌러서 날짜 보기`} data-pay-badge={s.label}
      className="inline-flex items-center gap-1 h-7 px-2 rounded-full text-[12px] font-black whitespace-nowrap hover:brightness-95"
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, ...NUM }}>
      {caught && <span className="text-[10px] font-black px-1 rounded" style={{ background: s.tone === "done" ? "rgba(255,255,255,.18)" : "#1B2B4B", color: "#fff" }}>잡은</span>}
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

// 배차현황 [정산] 알약을 누르면 뜨는 창
export function PayPopup({ row, onClose, patchDispatch, canEdit = true, company = "" }) {
  const id = row?._id || row?.id;
  const caught = isCaughtCall(row);
  const [busy, setBusy] = React.useState(false);
  const [inv, setInv] = React.useState(row?.계산서일 || "");
  const [depDate, setDepDate] = React.useState(row?.입금일 || today());
  const [depName, setDepName] = React.useState(row?.입금자명 || "");
  React.useEffect(() => { setInv(row?.계산서일 || ""); setDepDate(row?.입금일 || today()); setDepName(row?.입금자명 || ""); }, [row?.계산서일, row?.입금일, row?.입금자명]);
  const save = async (patch) => {
    if (!canEdit || !id || !patchDispatch) return;
    setBusy(true);
    try { await patchDispatch(id, { ...patch, __system: true }); } catch (e) { window.alert(`저장하지 못했습니다: ${e?.message || e}`); } finally { setBusy(false); }
  };
  const s = payStage(row);
  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/45 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-[460px] bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()} data-pay-popup>
        <div className="px-5 py-4 text-white flex items-center gap-3" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">SETTLE · 정산</div>
            <div className="text-[16px] font-black truncate">{row?.거래처명 || "-"}</div>
            <div className="text-[12px] text-white/60 truncate" style={NUM}>{row?.상차일 || ""} · {row?.상차지명 || ""} → {row?.하차지명 || ""}{row?.이름 || row?.기사명 ? ` · ${row.이름 || row.기사명}` : ""}</div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[16px]">✕</button>
        </div>
        <div className="px-5 py-3">
          <Row label="오더 구분">
            <div className="inline-flex rounded-xl bg-[#F1F4F9] p-1">
              {[["", "올린 콜"], ["잡은콜", "잡은 콜"]].map(([v, l]) => (
                <button key={l} type="button" disabled={!canEdit || busy} onClick={() => save({ 콜구분: v, ...(v ? {} : { 콜플랫폼: "" }) })}
                  className={`px-3.5 h-8 rounded-lg text-[12.5px] font-black whitespace-nowrap ${(row?.콜구분 || "") === v ? "bg-white text-[#0F1A30] shadow-sm" : "text-[#7A8AA8]"}`}>{l}</button>
              ))}
            </div>
            <span className="text-[11.5px] font-semibold text-[#9AA9C3]">{caught ? "콜을 잡아 우리 기사에게 준 오더" : "우리가 등록해 기사가 잡은 오더"}</span>
          </Row>
          {caught && (
            <Row label="잡은 곳">
              {CALL_PLATFORMS.map((p) => (
                <button key={p} type="button" disabled={!canEdit || busy} onClick={() => save({ 콜플랫폼: row?.콜플랫폼 === p ? "" : p })}
                  className={`px-3 h-8 rounded-lg border text-[12.5px] font-black whitespace-nowrap ${row?.콜플랫폼 === p ? "bg-[#0F1A30] border-[#0F1A30] text-white" : "bg-white border-[#DCE3EE] text-[#3A4A66]"}`}>{p}</button>
              ))}
            </Row>
          )}
          <Row label={caught ? "계산서 발행일" : "계산서 받은 날"}>
            <input type="date" value={inv} disabled={!canEdit || busy} onChange={(e) => setInv(e.target.value)} className={dateCls} style={NUM} />
            {canEdit && inv !== (row?.계산서일 || "") && <button type="button" disabled={busy} onClick={() => save({ 계산서일: inv })} className="h-9 px-3 rounded-lg bg-[#1B2B4B] text-white text-[12.5px] font-black">저장</button>}
            {canEdit && !row?.계산서일 && inv === "" && <button type="button" disabled={busy} onClick={() => save({ 계산서일: today() })} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B]">오늘</button>}
            {canEdit && row?.계산서일 && inv === row.계산서일 && <button type="button" disabled={busy} onClick={() => save({ 계산서일: "" })} className="text-[12px] font-bold text-[#9AA9C3] hover:text-red-600">지우기</button>}
          </Row>
          {caught ? (
            <>
              <Row label="받을 금액"><span style={NUM}>{won(row?.청구운임)}원</span><span className="text-[11.5px] font-semibold text-[#9AA9C3]">청구운임</span></Row>
              <Row label="입금">
                {row?.입금상태 === "입금완료" ? (
                  <>
                    <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-[#0F1A30] text-white text-[12px] font-black">입금완료</span>
                    <span style={NUM}>{row.입금일 || ""}</span>
                    {row.입금자명 && <span className="text-[12.5px] font-semibold text-[#5B6B85]">{row.입금자명}</span>}
                    {canEdit && <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await setCallDeposit({ row, done: false, patchDispatch, company }); } finally { setBusy(false); } }} className="text-[12px] font-bold text-[#9AA9C3] hover:text-red-600">취소</button>}
                  </>
                ) : canEdit ? (
                  <>
                    <input type="date" value={depDate} disabled={busy} onChange={(e) => setDepDate(e.target.value)} className={dateCls} style={NUM} />
                    <input value={depName} disabled={busy} onChange={(e) => setDepName(e.target.value)} placeholder="입금자명(선택)" className={`${dateCls} w-[120px]`} />
                    <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await setCallDeposit({ row, done: true, date: depDate, name: depName, patchDispatch, company }); } catch (e) { window.alert(`저장하지 못했습니다: ${e?.message || e}`); } finally { setBusy(false); } }}
                      className="h-9 px-3 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black whitespace-nowrap">입금완료</button>
                  </>
                ) : <span className="text-[#7A8AA8]">아직 입금 전</span>}
              </Row>
            </>
          ) : (
            <>
              <Row label="줄 금액"><span style={NUM}>{won(row?.기사운임)}원</span><span className="text-[11.5px] font-semibold text-[#9AA9C3]">기사운임</span></Row>
              <Row label="기사 지급">
                {row?.지급상태 === "지급완료"
                  ? <><span className="inline-flex items-center h-7 px-2.5 rounded-full bg-[#0F1A30] text-white text-[12px] font-black">지급완료</span><span style={NUM}>{row.지급일 || ""}</span></>
                  : <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-[#EEF3FB] text-[#1B2B4B] text-[12px] font-black border border-[#C9D6EC]">{s ? "지급중" : "기사 미정"}</span>}
                {row?.지급알림 && <span className="text-[12px] font-bold text-[#2D4C82]" style={NUM}>기사 문자 보냄 {md(row.지급알림)}</span>}
                <span className="basis-full text-[11.5px] font-semibold text-[#9AA9C3]">지급 처리는 정산관리 › 용차지급관리에서 합니다.</span>
              </Row>
            </>
          )}
        </div>
        <div className="px-5 py-3 bg-[#F7F9FC] border-t border-[#EEF2F8] text-[11.5px] font-semibold text-[#7A8AA8] leading-relaxed">
          사무실에서 첨부에 [계산서로 올리기]로 올리면 계산서 날짜가 자동으로 들어갑니다(여기서 고칠 수 있어요).
        </div>
      </div>
    </div>,
    document.body,
  );
}

// 정산관리 › 입금 확인 — 잡은 콜의 입금을 경리가 확인해 [입금완료] 처리(배차현황 [정산] 칸에 바로 보인다)
export function CallDepositDesk({ orders = [], patchDispatch, isViewer = false, company = "", testTxns = null }) {
  const [filter, setFilter] = React.useState("wait"); // wait | done | all
  const [q, setQ] = React.useState("");
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
  const rows = React.useMemo(() => {
    const k = q.trim();
    return all
      .filter((r) => (filter === "all" ? true : filter === "done" ? r.입금상태 === "입금완료" : r.입금상태 !== "입금완료"))
      .filter((r) => !k || [r.거래처명, r.상차지명, r.하차지명, r.이름, r.기사명, r.차량번호, r.콜플랫폼].some((v) => String(v || "").includes(k)))
      .sort((a, b) => String(b.상차일 || "").localeCompare(String(a.상차일 || "")));
  }, [all, filter, q]);
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
          <div className="text-[10px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">DEPOSIT · 잡은 콜 입금 확인</div>
          <div className="text-[20px] font-black">입금 확인</div>
          <div className="text-[12px] text-white/60">콜을 잡아 우리 기사에게 준 오더 — 콜 올린 업체에서 돈이 들어오면 [입금완료] 처리하세요. 배차현황 [정산] 칸에 바로 보입니다.</div>
          <div className="text-[11.5px] text-white/45">은행 입금 연동(팝빌)을 쓰는 회사는 금액이 같은 입금을 "은행 입금 후보"로 찾아 줍니다.</div>
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
        <div className="inline-flex rounded-xl bg-[#F1F4F9] p-1">
          {[["wait", "입금 대기"], ["done", "입금완료"], ["all", "전체"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setFilter(k); setSel(new Set()); }} className={`px-3.5 h-8 rounded-lg text-[12.5px] font-black ${filter === k ? "bg-white text-[#0F1A30] shadow-sm" : "text-[#7A8AA8]"}`}>{l}</button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처 · 기사 · 상하차지 검색" autoComplete="off" className="h-9 w-[230px] px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-semibold outline-none focus:border-[#1B2B4B]" />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-bold text-[#5B6B85]" style={NUM}>선택 {picked.length}건 · {won(sum(picked))}원</span>
          {filter !== "done" && <><span className="text-[12.5px] font-bold text-[#5B6B85]">입금일</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={dateCls} style={NUM} />
            <button type="button" disabled={busy || isViewer} onClick={() => run(picked.filter((r) => r.입금상태 !== "입금완료"), true)} className="h-9 px-4 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black disabled:opacity-40">{busy ? "처리 중…" : "입금완료"}</button></>}
          {filter !== "done" && sugg.size > 0 && <button type="button" disabled={busy || isViewer} data-sugg-all onClick={() => applySugg(rows.filter((r) => sugg.get(idOf(r))?.nameHit))} title="입금자명까지 맞는 후보만 한 번에 입금완료 처리합니다"
            className="h-9 px-3.5 rounded-lg border border-[#2D4C82] text-[13px] font-black text-[#2D4C82] disabled:opacity-40 whitespace-nowrap">은행 입금 후보 {[...sugg.values()].filter((g) => g.nameHit).length}건 적용</button>}
          {filter !== "wait" && <button type="button" disabled={busy || isViewer} onClick={() => run(picked.filter((r) => r.입금상태 === "입금완료"), false)} className="h-9 px-4 rounded-lg border border-[#DCE3EE] text-[13px] font-black text-[#3A4A66] disabled:opacity-40">입금 취소</button>}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-[#E3E8F0] overflow-x-auto">
        <table className="w-full min-w-max">
          <thead className="bg-[#1B2B4B]"><tr>
            <th className={th}><input type="checkbox" checked={rows.length > 0 && rows.every((r) => sel.has(idOf(r)))} onChange={(e) => setSel(e.target.checked ? new Set(rows.map(idOf)) : new Set())} /></th>
            {["상차일", "잡은 곳", "콜 올린 업체(거래처)", "상차지 → 하차지", "기사", "받을 금액", "계산서 발행일", "입금", "입금일 · 은행 입금 후보"].map((h) => <th key={h} className={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="py-14 text-center text-[13px] font-semibold text-[#9AA9C3]">{all.length ? "해당하는 오더가 없습니다." : "잡은 콜로 표시한 오더가 아직 없습니다. 배차현황 [정산] 칸을 눌러 '잡은 콜'로 바꿔 주세요."}</td></tr>}
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
                  <td className={`${td} font-black`} style={NUM}>{won(r.청구운임)}</td>
                  <td className={td} style={NUM}>{r.계산서일 || <span className="text-[#C2CBDB]">미발행</span>}</td>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
