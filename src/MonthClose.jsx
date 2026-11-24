// ======================= src/MonthClose.jsx =======================
// ✅ 2026-11-16 월 마감(배차자 1차) — 리디자인 4 "마감표"
//  · 보기: 내 배차 · 담당자별 · 전체 / 달은 늘 당월부터
//  · 위: 4단계 체크리스트(오더 확인 → 거래처 검증 → 1차 마감 → 경리 확인) + 진행 막대
//  · 가운데: 엑셀처럼 한 장의 표(순번 · 거래처 · 담당 · 오더 · 청구 · 기사 · 수수료 · 확인할 것 · 상태). 줄을 누르면 오더가 펼쳐진다(순번 포함)
//  · 오더 줄을 누르면 PC는 배차관리와 같은 오더 패널, 폰은 아래 창에서 고친다. [+ 오더 추가]도 같은 패널(새 오더)
//  · 확인할 것이 있어도 [검증]할 수 있다(한 번 묻는다) → [1차 마감] → 경리팀(arDesk kind "close")
//  계산은 src/closeFlow.js(순수 함수 · scripts/closeFlow.test.mjs) · 경리 2차 화면은 src/CloseFlow.jsx(mode "acct")
import React from "react";
import { runBulkTask } from "./DeleteProgress"; // ⏳ 2026-11-20 일괄 처리 진행 창
import { createPortal } from "react-dom";
import { useArDesk, arDeskId, MonthPicker, FlowTrack, sdCard, sdInp, Ico, IC } from "./SettleDesk";
import { won, kstYm, monthOf, n } from "./settleCore";
import { CLOSE_RULES, closeBoard, closeChecks, isMine, canSubmit, canVerify, verifyPatch, submitPatch, unlockPatch, prevYmOf, isFinalLocked } from "./closeFlow";
import { useLoadOrderRange, monthEnd } from "./orderHistory";
import useNarrow from "./useNarrow";
import { MarginPct } from "./marginPct"; // ⭐ 2026-11-17 합계 줄 수수료 옆 수수료율(수수료 ÷ 청구)
import { orderProfit, paidOut } from "./forkliftCore"; // ⭐ 2026-11-17 수수료 한 식 — 청구 − 기사 − 회사가 따로 준 지게차·특수운임(배차현황 표와 같음)
import { kpConfirm } from "./kpDialog";
const StmtCompareModal = React.lazy(() => import("./StmtCompare")); // ⭐ 2026-11-17 업체 명세서 비교

const NUM = { fontVariantNumeric: "tabular-nums" };
const C = { ink: "#14213D", sub: "#5A6781", mute: "#8D97AB", line: "#E1E6EF", soft: "#F6F8FB", blue: "#2457D6", ok: "#0F7A52", warn: "#B25F00", bad: "#C62F25", track: "#EDF1F7" };
const btn = "h-10 px-4 rounded-xl border border-[#D9E0EC] bg-white text-[14px] font-bold text-[#14213D] hover:border-[#9FB0CC] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";
const btnPri = "h-10 px-5 rounded-xl bg-[#14213D] text-white text-[14px] font-black hover:bg-[#1F3157] disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap";
const inp = "h-10 w-full rounded-xl border border-[#D9E0EC] bg-white px-3 text-[14px] font-semibold text-[#14213D] outline-none focus:border-[#2457D6] focus:ring-2 focus:ring-[#2457D6]/15";
const isCancel = (o) => o?.배차상태 === "배차취소" || ["취소", "배차취소", "오더취소", "취소됨"].includes(o?.상태);
const ymText = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;
const idOf = (o) => o?._id || o?.id;
const IssueText = ({ list }) => list.length
  ? <span className="flex flex-wrap gap-x-2 gap-y-0.5">{list.map((x) => <span key={x.key} className="text-[12.5px] font-black whitespace-nowrap" style={{ color: x.block ? C.bad : C.warn }}>{x.label}</span>)}</span>
  : <span className="text-[12.5px] font-bold" style={{ color: C.ok }}>정상</span>;

// ── 오더 고치기 · 추가 창 ─────────────────────────────
const FIELDS = [
  ["상차일", "상차일", "date"], ["하차일", "하차일", "date"], ["거래처명", "거래처", "text", true],
  ["상차지명", "상차지", "text"], ["하차지명", "하차지", "text"], ["화물내용", "화물내용", "text", true],
  ["차량톤수", "톤수", "text"], ["차량종류", "차종", "text"], ["차량번호", "차량번호", "text"], ["이름", "기사명", "text"],
  ["전화번호", "기사 연락처", "text"], ["지급방식", "지급방식", "text"], ["청구운임", "청구운임", "money"], ["기사운임", "기사운임", "money"], ["메모", "메모", "text", true],
];
function OrderSheet({ open, row, isNew, ym, phone, isViewer, clients, issues, onClose, onSave, onDelete }) {
  const [f, setF] = React.useState({});
  const [askDel, setAskDel] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    const base = isNew ? { 상차일: `${ym}-${String(Math.min(new Date(Date.now() + 9 * 3600e3).getUTCDate(), 28)).padStart(2, "0")}`, 하차일: "", 거래처명: row?.거래처명 || "", 지급방식: "" } : row || {};
    const v = {}; FIELDS.forEach(([k, , t]) => { v[k] = t === "money" ? (n(base[k]) ? String(n(base[k])) : "") : String(base[k] ?? ""); });
    setF(v); setAskDel(false); setErr(""); setBusy("");
  }, [open, row, isNew, ym]);
  React.useEffect(() => { if (!open) return undefined; const k = (e) => { if (e.key === "Escape" && !busy) onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open, busy, onClose]);
  if (!open) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!f.상차일 || !f.거래처명.trim() || !f.상차지명.trim() || !f.하차지명.trim()) { setErr("상차일 · 거래처 · 상차지 · 하차지는 꼭 넣어 주세요."); return; }
    if (f.하차일 && f.하차일 < f.상차일) { setErr("하차일이 상차일보다 빨라요."); return; }
    const patch = {};
    FIELDS.forEach(([k, , t]) => { const nv = t === "money" ? n(f[k]) : String(f[k] || "").trim(); const ov = t === "money" ? n(row?.[k]) : String(row?.[k] ?? "").trim(); if (isNew ? (nv !== "" && nv !== 0) : nv !== ov) patch[k] = nv; });
    if ("청구운임" in patch || "기사운임" in patch) patch.수수료 = orderProfit({ ...(row || {}), 청구운임: n(f.청구운임), 기사운임: n(f.기사운임) }); // ⭐ 2026-11-17 회사 지급분(지게차·특수운임) 빼기
    if ("이름" in patch) patch.기사명 = patch.이름;
    if (isNew) { patch.배차상태 = String(f.차량번호 || "").trim() ? "배차완료" : "배차중"; patch.등록기기 = "월 마감"; }
    else if ("차량번호" in patch && String(f.차량번호 || "").trim() && (row?.배차상태 || "") !== "배차완료") patch.배차상태 = "배차완료";
    if (!Object.keys(patch).length) { onClose(); return; }
    setBusy("save"); setErr("");
    try { const r = await onSave(patch); if (r === false) { setErr("저장하지 못했어요. 입력값을 확인해 주세요."); setBusy(""); return; } onClose(); }
    catch (e) { setErr(`저장하지 못했어요. ${e?.message || e}`); setBusy(""); }
  };
  const del = async () => { setBusy("del"); try { await onDelete(); onClose(); } catch (e) { setErr(`지우지 못했어요. ${e?.message || e}`); setBusy(""); } };
  const profit = orderProfit({ ...(row || {}), 청구운임: n(f.청구운임), 기사운임: n(f.기사운임) }); // ⭐ 2026-11-17
  const node = (
    <div className="fixed inset-0 z-[100050] flex" style={{ background: "rgba(14,22,40,.42)" }} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className={phone ? "mt-auto w-full max-h-[92vh] rounded-t-[22px] bg-white flex flex-col" : "ml-auto h-full w-[460px] max-w-full bg-white flex flex-col shadow-[-12px_0_40px_rgba(14,22,40,.18)]"} data-kp="mc-sheet" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 border-b border-[#E1E6EF] flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-bold" style={{ color: C.mute }}>{isNew ? "새 오더" : `${row?.상차일 || ""} · ${row?.거래처명 || ""}`}</div>
            <div className="text-[18px] font-black" style={{ color: C.ink }}>{isNew ? "오더 추가" : "오더 고치기"}</div>
            {!isNew && issues?.length > 0 && <div className="mt-1"><IssueText list={issues} /></div>}
          </div>
          <button type="button" aria-label="닫기" disabled={!!busy} onClick={onClose} className="w-9 h-9 rounded-xl border border-[#D9E0EC] text-[#5A6781] text-[18px] leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <datalist id="mc-clients">{clients.map((c) => <option key={c} value={c} />)}</datalist>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {FIELDS.map(([k, l, t, wide]) => (
              <label key={k} className={wide ? "col-span-2" : ""}>
                <span className="block text-[12.5px] font-bold mb-1" style={{ color: k === "청구운임" && issues?.some((x) => x.key === "blank") ? C.bad : k === "기사운임" && issues?.some((x) => x.key === "noDriver") ? C.warn : C.sub }}>{l}</span>
                <input id={`mc-${k}`} disabled={isViewer} type={t === "date" ? "date" : "text"} inputMode={t === "money" ? "numeric" : undefined} list={k === "거래처명" ? "mc-clients" : undefined}
                  value={t === "money" ? (f[k] ? Number(f[k]).toLocaleString("ko-KR") : "") : f[k] || ""}
                  onChange={(e) => set(k, t === "money" ? e.target.value.replace(/[^\d]/g, "") : e.target.value)}
                  className={`${inp} ${t === "money" ? "text-right" : ""}`} style={t === "money" ? NUM : undefined} />
              </label>))}
          </div>
          <div className="mt-3 text-[13px] font-bold text-right" style={{ ...NUM, color: profit < 0 ? C.bad : C.sub }}>수수료 {won(profit)}원</div>
          {err && <div className="mt-2 text-[13px] font-bold" style={{ color: C.bad }}>{err}</div>}
        </div>
        {!isViewer && (
          <div className="px-5 py-3 border-t border-[#E1E6EF] flex items-center gap-2" style={{ paddingBottom: phone ? "max(12px, env(safe-area-inset-bottom, 0px))" : undefined }}>
            {!isNew && (askDel
              ? <><span className="text-[13px] font-bold" style={{ color: C.bad }}>이 오더를 지울까요?</span><button type="button" className="h-10 px-4 rounded-xl text-[14px] font-black text-white" style={{ background: C.bad }} disabled={!!busy} onClick={del}>{busy === "del" ? "지우는 중…" : "지우기"}</button><button type="button" className={btn} onClick={() => setAskDel(false)}>아니요</button></>
              : <button type="button" className="h-10 px-3 rounded-xl text-[14px] font-bold" style={{ color: C.bad }} onClick={() => setAskDel(true)}>삭제</button>)}
            {!askDel && <><div className="flex-1" /><button type="button" className={btn} disabled={!!busy} onClick={onClose}>취소</button><button type="button" className={btnPri} disabled={!!busy} onClick={save}>{busy === "save" ? "저장 중…" : isNew ? "추가" : "저장"}</button></>}
          </div>)}
      </div>
    </div>
  );
  return createPortal(node, document.body);
}

// ── 화면 ──────────────────────────────────────────
//  ✅ 2026-11-16 리디자인 5 — 2분할(거래처정산 › 거래명세서와 같은 모양)
//   왼쪽: 달 · 범위(전체 · 내 배차 · 담당자) · 검색 · 거래처 목록(상태 뱃지 · 건수 · 청구)
//   오른쪽: 고른 거래처 미리보기 — 진행 선(검증 → 1차 마감 → 경리 확인) · 합계 · 버튼 · 오더 표(순번)
//   상태 이름(배차 쪽): 검증 전 → 검증 완료 → 마감 완료(경리 확인 대기) → 경리 확인 완료 · 반려 · 마감 후 변경
const ST = { // 상태 → 이름 · 뱃지 모양 · 순서(할 일 먼저)
  rejected: { label: "반려", cls: "bg-white text-[#C62F25] border border-[#F1B5AF]", ord: 0 },
  none: { label: "검증 전", cls: "bg-white text-[#5B6B85] border border-dashed border-[#B8C4D8]", ord: 1 },
  verified: { label: "검증 완료", cls: "bg-[#EEF3FB] text-[#1B2B4B] border border-[#CFE0FF]", ord: 2 },
  submitted: { label: "마감 완료", cls: "bg-[#2D4C82] text-white", ord: 3 },
  approved: { label: "최종마감", cls: "bg-[#0F1A30] text-white", ord: 4 },
};
const stOf = (g) => (g.changed && g.status !== "none" ? { label: "마감 후 변경", cls: "bg-white text-[#C62F25] border border-[#F1B5AF]", ord: 0 }
  : g.status === "approved" && g.row?.doc?.unlocked ? { label: "일시해제", cls: "bg-white text-[#B25F00] border border-[#F2C98A]", ord: 1 } : ST[g.status] || ST.none);
const lockedOf = (g) => !!g && isFinalLocked(g.row?.doc); // 최종마감 — 배차 쪽 고치기 · 추가 · 삭제 잠금
// ⓘ TIP — 누르면 짧은 안내가 열린다(긴 문장을 화면에 늘어놓지 않게)
function TipButton({ text }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="h-6 px-2 rounded-md border border-[#D5DDEA] bg-white text-[11.5px] font-black tracking-wider text-[#2D4C82] hover:bg-[#F4F6FA]">TIP</button>
      {open && <span role="note" className="absolute left-0 top-full mt-1.5 z-30 w-[300px] rounded-xl border border-[#DCE3EE] bg-white px-3.5 py-2.5 text-[13px] font-bold text-[#1B2B4B] leading-snug shadow-[0_12px_30px_rgba(15,26,48,0.16)]">{text}</span>}
    </span>
  );
}
const Badge = ({ g, small }) => { const s2 = stOf(g); return <span className={`inline-flex items-center ${small ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-[12.5px]"} rounded-lg font-black whitespace-nowrap ${s2.cls}`}>{s2.label}</span>; };

export default function MonthClose({ orders = [], company = "", me = null, staffName, isViewer = false, onPatch, onAdd, onRemove, onOpenOrder }) {
  const phone = useNarrow(860);
  const desk = useArDesk(company);
  const [ym, setYm] = React.useState(() => kstYm(0)); // 늘 당월부터
  useLoadOrderRange(`${prevYmOf(ym)}-01`, monthEnd(ym));
  const [scope, setScope] = React.useState("all"); // all | mine | staff — 🛠 2026-11-16 기본 = 전체(내 배차만 보려면 고른다)
  const [staff, setStaff] = React.useState("");
  const [route, setRoute] = React.useState(""); // 📍 2026-11-16 노선(담당노선구분 · 시트 탭)으로 거르기 — 목록은 거래처별
  const [tab, setTab] = React.useState("all"); // all | todo | verified | closed
  const [cq, setCq] = React.useState("");
  const [sel, setSel] = React.useState("");
  const [sheet, setSheet] = React.useState(null);
  const [delAsk, setDelAsk] = React.useState("");
  const [oq, setOq] = React.useState(""); // 오더 검색
  const [onlyBad, setOnlyBad] = React.useState(false); // 확인 필요만
  const [osort, setOsort] = React.useState("date"); // date | status
  const [busy, setBusy] = React.useState("");
  const [toast, setToast] = React.useState("");
  const [cmpOpen, setCmpOpen] = React.useState(false); // ⭐ 2026-11-17 업체 명세서 비교(고른 거래처)
  React.useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(""), 3200); return () => clearTimeout(t); }, [toast]);
  const openRow = (o) => { if (lockedOf(groupsRef.current.find((g) => g.client === (String(o.거래처명 || "").trim() || "(거래처 없음)")))) { setToast("최종마감 이후 수정이 불가합니다. 필요 시 경리팀에 해제요청 해주세요."); return; } return onOpenOrder && !phone ? onOpenOrder(o) : setSheet({ row: o }); };
  const groupsRef = React.useRef([]);
  const addOrder = (client) => {
    const base = { 거래처명: client === "(거래처 없음)" ? "" : client, 상차일: ym === kstYm(0) ? new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) : `${ym}-01` };
    if (onOpenOrder && !phone) window.dispatchEvent(new CustomEvent("kp-open-copy-panel", { detail: { row: base, isNew: true } })); // 배차관리와 같은 입력 패널
    else setSheet({ isNew: true, row: base });
  };

  const staffOf = React.useCallback((o) => (staffName ? staffName(o) : "") || "미지정", [staffName]);
  const month = React.useMemo(() => (orders || []).filter((o) => !isCancel(o) && o?.source !== "transport_transmit" && monthOf(o) === ym), [orders, ym]);
  const staffList = React.useMemo(() => { const m = new Map(); month.forEach((o) => { const s2 = staffOf(o); m.set(s2, (m.get(s2) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [month, staffOf]);
  const mineOf = React.useCallback((o) => isMine(o, me) || (!!me?.name && staffOf(o) === me.name), [me, staffOf]);
  const routeList = React.useMemo(() => { const m = new Map(); month.forEach((o) => { const r = String(o.담당노선구분 || "").trim(); if (r) m.set(r, (m.get(r) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [month]);
  const scoped = React.useMemo(() => month.filter((o) => (scope === "mine" ? mineOf(o) : scope === "staff" ? (!staff || staffOf(o) === staff) : true) && (!route || String(o.담당노선구분 || "").trim() === route)), [month, scope, staff, route, mineOf, staffOf]);

  const checks = React.useMemo(() => closeChecks(month), [month]);
  const issueMap = React.useMemo(() => { const m = new Map(); CLOSE_RULES.forEach((r) => (checks[r.key] || []).forEach((o) => { const id = idOf(o); const l = m.get(id) || []; l.push({ key: r.key, label: r.label, block: r.block }); m.set(id, l); })); return m; }, [checks]);
  const issuesOfRow = React.useCallback((o) => { const l = [...(issueMap.get(idOf(o)) || [])]; if (!String(o.거래처명 || "").trim()) l.unshift({ key: "noClient", label: "거래처 빈칸", block: true }); return l; }, [issueMap]);

  const closeOf = React.useCallback((c, m) => desk.closes.get(`${c}|${m}`) || null, [desk.closes]);
  const board = React.useMemo(() => new Map(closeBoard(orders, ym, { closeOf, me }).map((r) => [r.client, r])), [orders, ym, closeOf, me]);
  const groups = React.useMemo(() => {
    const m = new Map();
    scoped.forEach((o) => { const c = String(o.거래처명 || "").trim() || "(거래처 없음)"; const g = m.get(c) || { client: c, rows: [], sale: 0, buy: 0, paid: 0, issue: 0 }; g.rows.push(o); g.sale += n(o.청구운임); g.buy += n(o.기사운임); g.paid += paidOut(o); /* ⭐ 2026-11-17 회사 지급분 */ if (issuesOfRow(o).length) g.issue += 1; m.set(c, g); });
    return [...m.values()].map((g) => { const b = board.get(g.client); return { ...g, count: g.rows.length, row: b || null, status: b?.status || "none", changed: !!b?.changed, owners: [...new Set(g.rows.map(staffOf))].slice(0, 2).join(", "),
      rows: g.rows.sort((a, b2) => String(a.상차일 || "").localeCompare(String(b2.상차일 || "")) || String(a.상차시간 || "").localeCompare(String(b2.상차시간 || ""))) }; })
      .sort((a, b) => stOf(a).ord - stOf(b).ord || b.sale - a.sale);
  }, [scoped, board, issuesOfRow, staffOf]);
  groupsRef.current = groups;
  const bucket = (g) => (g.changed && g.status !== "none") || g.status === "none" || g.status === "rejected" ? "todo" : g.status === "verified" ? "verified" : "closed";
  const cnt = React.useMemo(() => { const c = { todo: 0, verified: 0, submitted: 0, approved: 0 }; groups.forEach((g) => { const b = bucket(g); if (b === "closed") c[g.status] += 1; else c[b] += 1; }); return c; }, [groups]);
  const list = groups.filter((g) => (tab === "all" || bucket(g) === tab) && (!cq || g.client.replace(/\s/g, "").toLowerCase().includes(cq.replace(/\s/g, "").toLowerCase())));
  const allSubmit = groups.filter((g) => g.row && canSubmit(g.row));
  const cur = groups.find((g) => g.client === sel) || list[0] || null;
  React.useEffect(() => { if (cur && cur.client !== sel) setSel(cur.client); }, [cur?.client]); // eslint-disable-line react-hooks/exhaustive-deps
  const idx = cur ? list.findIndex((g) => g.client === cur.client) : -1;
  // 오더 목록 거르기 · 정렬 — 확인 필요만 · 검색(차량 · 기사 · 상하차지 · 전화) · 날짜순 / 상태순
  const shownRows = (g) => {
    const q = oq.replace(/\s/g, "").toLowerCase();
    let rows = g.rows.filter((o) => (!onlyBad || issuesOfRow(o).length) && (!q || [o.차량번호, o.이름, o.기사명, o.상차지명, o.하차지명, o.전화번호, o.차량톤수].some((v) => String(v || "").replace(/\s/g, "").toLowerCase().includes(q))));
    if (osort === "status") rows = [...rows].sort((a, b) => { const A = issuesOfRow(a), B = issuesOfRow(b); const w = (l) => (l.some((x) => x.block) ? 0 : l.length ? 1 : 2); return w(A) - w(B) || String(a.상차일 || "").localeCompare(String(b.상차일 || "")); });
    return rows;
  };

  const save = (g, patch) => desk.save(g.row.doc?.id || arDeskId(desk.company, "close", g.client, ym), patch);
  const verifyMany = async (gs) => {
    if (isViewer || busy || !gs.length) return;
    // 🛠 2026-11-16 입력 안 된 칸(청구운임 · 기사운임 · 차량번호 · 기사)이 있으면 꼭 한 번 묻는다
    const rows = gs.flatMap((g) => g.rows);
    const miss = [["청구운임", rows.filter((o) => !n(o.청구운임)).length], ["기사운임", rows.filter((o) => n(o.청구운임) && !n(o.기사운임)).length], ["차량번호", rows.filter((o) => !String(o.차량번호 || "").trim()).length], ["기사 이름", rows.filter((o) => !String(o.이름 || o.기사명 || "").trim()).length], ["배차 미완료", rows.filter((o) => (o.배차상태 || "") !== "배차완료").length]].filter(([, c]) => c > 0);
    if (miss.length && !(await kpConfirm(`${gs.length === 1 ? gs[0].client : `${gs.length}곳`}에 입력 안 된 칸이 있어요.\n\n${miss.map(([k, c]) => `· ${k} 빈칸 ${c}건`).join("\n")}\n\n그래도 검증 완료할까요?`, { title: "입력 안 된 칸이 있어요", okText: "그대로 검증 완료" }))) return;
    setBusy("v"); try { await runBulkTask({ count: (gs).length, label: "거래처", verb: "검증", unitWord: "곳", task: async (progress) => { let _k = 0; for (const g of gs) { await save(g, verifyPatch(g.row, me)); progress(++_k); } } }); setToast(`${gs.length === 1 ? gs[0].client : `${gs.length}곳`} 검증 완료: [1차 마감]을 누르면 경리팀으로 넘어가요`); } finally { setBusy(""); }
  };
  const submitMany = async (gs) => {
    if (isViewer || busy || !gs.length) return;
    if (gs.length > 1 && !(await kpConfirm(`${gs.length}곳을 1차 마감할까요?\n경리팀 거래처정산에 ‘배차마감’으로 넘어가요.`))) return;
    setBusy("s"); try { await runBulkTask({ count: (gs).length, label: "거래처", verb: "1차 마감", unitWord: "곳", task: async (progress) => { let _k = 0; for (const g of gs) { await save(g, submitPatch(g.row, me)); progress(++_k); } } }); setToast(`${gs.length === 1 ? gs[0].client : `${gs.length}곳`} 마감 완료: 경리팀 확인을 기다려요`); } finally { setBusy(""); }
  };
  const unlock = async (g) => { if (isViewer || busy || !g?.row) return; setBusy("u"); try { await save(g, unlockPatch(g.row, me, "월 마감에서")); setToast(g.status === "verified" ? "검증을 취소했어요" : "마감을 풀었어요"); } finally { setBusy(""); } };

  // 고른 거래처 — 진행 선 · 버튼
  const flow = (g) => {
    const s = g.status; const ch = g.changed && s !== "none";
    const d = g.row?.doc || {};
    const day = (t) => { if (!t) return ""; const x = new Date(Number(t) + 9 * 3600e3); return `${x.getUTCMonth() + 1}/${x.getUTCDate()}`; };
    return [
      { label: "오더 확인", done: !g.issue || s !== "none", text: g.issue ? `확인할 것 ${g.issue}` : "이상 없음" },
      { label: "검증", done: !ch && ["verified", "submitted", "approved"].includes(s), text: ch ? "다시 검증" : s === "rejected" ? "반려됨" : ["verified", "submitted", "approved"].includes(s) ? day(d.verifiedAt) || "완료" : "검증 전", bad: ch || s === "rejected" },
      { label: "1차 마감", done: !ch && ["submitted", "approved"].includes(s), text: ["submitted", "approved"].includes(s) ? day(d.submittedAt) || "완료" : "마감 전" },
      { label: "최종마감", done: !ch && s === "approved", text: s === "approved" ? (d.unlocked ? "일시해제 중" : day(d.approvedAt) || "완료") : s === "submitted" ? "경리 확인 대기" : "-" },
    ];
  };
  const actions = (g) => {
    if (isViewer || !g?.row) return null;
    const out = [];
    if (canVerify(g.row)) out.push(<button key="v" type="button" disabled={!!busy} onClick={() => verifyMany([g])} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black whitespace-nowrap hover:bg-[#1B2B4B]">{g.changed || g.status === "rejected" ? "다시 검증" : "검증 완료"}</button>);
    if (canSubmit(g.row)) out.push(<button key="s" type="button" disabled={!!busy} onClick={() => submitMany([g])} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black whitespace-nowrap hover:bg-[#1B2B4B]">1차 마감 → 경리팀</button>);
    if (g.status === "verified" || g.status === "submitted") out.push(<button key="u" type="button" disabled={!!busy} onClick={() => unlock(g)} className="h-10 px-4 rounded-xl border border-[#D5DDEA] bg-white text-[14px] font-bold text-[#1B2B4B] whitespace-nowrap">{g.status === "verified" ? "검증 취소" : "마감 풀기"}</button>);
    return out;
  };
  const stateLine = (g) => {
    const s = g.status;
    if (g.changed && s !== "none") return { t: `${s === "verified" ? "검증" : "마감"} 뒤에 오더가 바뀌었어요. 다시 검증해 주세요.`, c: C.bad };
    if (s === "rejected") return { t: `경리팀 반려 · ${g.row?.doc?.reason || "사유 없음"}${g.row?.doc?.rejectedByName ? ` (${g.row.doc.rejectedByName})` : ""} · 고친 뒤 다시 검증해 주세요.`, c: C.bad };
    if (s === "approved" && g.row?.doc?.unlocked) return { t: "경리팀이 일시해제했어요. 지금은 고치거나 추가 · 삭제할 수 있어요. 끝나면 경리팀이 다시 잠가요.", c: C.warn };
    if (s === "approved") return { t: "최종마감: 경리팀 확인 완료", c: C.ink, tip: "최종마감 이후 수정이 불가합니다. 필요 시 경리팀에 해제요청 해주세요." };
    if (s === "submitted") return { t: "1차 마감 완료: 경리팀 거래처정산에 ‘배차마감’으로 넘어갔어요. 경리팀이 명세서를 작성하면 최종마감돼요.", c: "#2D4C82" };
    if (s === "verified") return { t: "검증 완료: [1차 마감 → 경리팀]을 누르면 경리팀으로 넘어가요.", c: "#2D4C82" };
    return { t: "오더를 확인하고 [검증 완료]를 눌러 주세요. 확인할 것이 있어도 맞는 내용이면 그대로 검증할 수 있어요.", c: C.sub };
  };

  const rail = (
    <div className={`${sdCard} p-3 min-w-0 xl:sticky xl:top-3`} data-kp="mc-rail">
      <MonthPicker ym={ym} onChange={(v) => { setYm(v); setSel(""); }} label="MONTH CLOSE" />
      <div className="mt-2.5 grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#F4F6FA]" role="tablist" aria-label="범위">
        {[["all", "전체"], ["mine", "내 배차"], ["staff", "담당자"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={scope === k} onClick={() => { setScope(k); setSel(""); }} className={`h-8 rounded-lg text-[13px] font-black ${scope === k ? "bg-white text-[#0F1A30] shadow-sm" : "text-[#5B6B85]"}`}>{l}</button>)}
      </div>
      {scope === "staff" && <select id="mc-staff" value={staff} onChange={(e) => { setStaff(e.target.value); setSel(""); }} className={`${sdInp} mt-2 !h-9`}><option value="">담당자 전체</option>{staffList.map(([s2, c2]) => <option key={s2} value={s2}>{s2} ({c2})</option>)}</select>}
      {routeList.length > 1 && (
        <select id="mc-route" value={route} onChange={(e) => { setRoute(e.target.value); setSel(""); }} className={`${sdInp} mt-2 !h-9`} title="노선(시트 탭)으로 거르기: 목록은 거래처별로 나와요">
          <option value="">노선 전체 ({routeList.length}개)</option>
          {routeList.map(([r, c]) => <option key={r} value={r}>{r} ({c})</option>)}
        </select>)}
      <div className="mt-2 relative">
        <Ico d={IC.search} size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA9C3] pointer-events-none" />
        <input id="mc-cq" value={cq} onChange={(e) => setCq(e.target.value)} placeholder="거래처 찾기" className={`${sdInp} pl-8 !h-9`} />
      </div>
      <div className="mt-2 flex gap-1 flex-wrap" style={NUM}>
        {[["all", `전체 ${groups.length}`], ["todo", `검증 전 ${cnt.todo}`], ["verified", `검증 완료 ${cnt.verified}`], ["closed", `마감 ${cnt.submitted + cnt.approved}`]].map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={`h-7 px-2.5 rounded-lg text-[12px] font-black ${tab === k ? "bg-[#0F1A30] text-white" : "border border-[#DCE3EE] text-[#5B6B85] bg-white"}`}>{l}</button>)}
      </div>
      {!isViewer && allSubmit.length > 1 && <button type="button" disabled={!!busy} onClick={() => submitMany(allSubmit)} className="mt-2 w-full h-9 rounded-lg border border-[#0F1A30] text-[13px] font-black text-[#0F1A30] hover:bg-[#F4F6FA]">검증 완료 {allSubmit.length}곳 모두 1차 마감</button>}
      <div className="mt-2 flex xl:flex-col gap-1.5 overflow-x-auto xl:overflow-x-visible xl:max-h-[calc(100vh-360px)] xl:overflow-y-auto no-scrollbar">
        {!list.length && <div className="px-2 py-8 text-center text-[13px] font-bold text-[#9AA9C3] w-full">{groups.length ? "조건에 맞는 거래처가 없어요" : `${ymText(ym)} 오더가 없어요`}</div>}
        {list.map((g, i) => { const on = cur?.client === g.client; return (
          <button key={g.client} type="button" onClick={() => setSel(g.client)} data-on={on ? "1" : "0"}
            className={`shrink-0 xl:shrink text-left rounded-xl px-3 py-2 border transition min-w-[200px] xl:min-w-0 ${on ? "bg-[#0F1A30] border-[#0F1A30] text-white" : "bg-white border-[#E3E8F0] hover:border-[#B8C4D8] hover:bg-[#F8FAFD]"}`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-[11.5px] w-5 shrink-0 ${on ? "text-white/60" : "text-[#9AA9C3]"}`} style={NUM}>{i + 1}</span>
              <span className={`text-[14px] font-black truncate flex-1 ${on ? "text-white" : "text-[#0F1A30]"}`}>{g.client}</span>
              {on ? <span className="h-6 px-2 rounded-lg bg-white/15 text-white text-[11.5px] font-black inline-flex items-center whitespace-nowrap">{stOf(g).label}</span> : <Badge g={g} small />}
            </div>
            <div className={`mt-0.5 pl-7 flex items-center justify-between gap-2 text-[12px] font-bold ${on ? "text-white/70" : "text-[#5B6B85]"}`} style={NUM}>
              <span className="truncate">{g.count}건{g.issue ? <span className={on ? "text-white" : "text-[#C62F25]"}> · 확인 {g.issue}</span> : null}</span>
              <span className={`whitespace-nowrap font-black ${on ? "text-white" : "text-[#0F1A30]"}`}>{won(g.sale)}</span>
            </div>
          </button>); })}
      </div>
    </div>
  );

  const preview = !cur ? (
    <div className={`${sdCard} py-20 text-center`}>
      <div className="text-[16px] font-black">{groups.length ? "왼쪽에서 거래처를 고르세요" : `${ymText(ym)}에 ${scope === "mine" ? "내 배차" : "오더"}가 없어요`}</div>
      {scope === "mine" && !groups.length && <div className="text-[13.5px] mt-1 text-[#9AA9C3]">왼쪽 위에서 ‘전체’로 바꿔 보세요.</div>}
    </div>
  ) : (() => { const g = cur; const line = stateLine(g); return (
    <div className="space-y-3 min-w-0">
      {/* 머리 — 거래처 · 상태 · 이전/다음 · 버튼 */}
      <div className={`${sdCard} px-4 py-3 flex items-center gap-3 flex-wrap`}>
        <div className="min-w-0 mr-auto">
          <div className="text-[13px] font-bold text-[#5B6B85]" style={NUM}>{ymText(ym)} 월 마감{g.owners ? ` · 담당 ${g.owners}` : ""}</div>
          <div className="flex items-center gap-2 min-w-0"><span className="text-[19px] font-black text-[#0F1A30] truncate">{g.client}</span><Badge g={g} /></div>
        </div>
        {list.length > 1 && idx >= 0 && (
          <div className="flex items-center gap-1">
            <button type="button" disabled={idx <= 0} onClick={() => setSel(list[idx - 1].client)} className="w-10 h-10 rounded-xl border border-[#D5DDEA] text-[#1B2B4B] flex items-center justify-center disabled:opacity-30" aria-label="이전 거래처"><Ico d={IC.back} /></button>
            <span className="text-[13px] font-bold text-[#5B6B85] w-12 text-center" style={NUM}>{idx + 1}/{list.length}</span>
            <button type="button" disabled={idx >= list.length - 1} onClick={() => setSel(list[idx + 1].client)} className="w-10 h-10 rounded-xl border border-[#D5DDEA] text-[#1B2B4B] flex items-center justify-center disabled:opacity-30" aria-label="다음 거래처"><Ico d={IC.next} /></button>
          </div>)}
        {actions(g)}
      </div>
      {/* 진행 선 + 안내 */}
      <div className={`${sdCard} ${phone ? "px-3 py-3" : "px-5 py-4"}`}>
        <FlowTrack steps={flow(g)} compact={phone} />
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-[13.5px] font-bold" style={{ color: line.c }}>{line.t}</span>
          {line.tip && <TipButton text={line.tip} />}
        </div>
      </div>
      {/* 오더 미리보기 */}
      <div className={`${sdCard} overflow-hidden`}>
        {/* 합계 — 오더 목록 바로 위(칸으로 나눈 한 줄) · [확인 필요]를 누르면 확인 필요만 */}
        <div className="grid grid-cols-2 sm:grid-cols-5 border-b border-[#E3E8F0] bg-[#F8FAFD]" style={NUM} data-kp="mc-totals">
          {[["오더", `${g.count.toLocaleString()}건`, C.ink], ["청구", `${won(g.sale)}원`, C.ink], ["기사운임", `${won(g.buy)}원`, C.sub], ["수수료", `${won(g.sale - g.buy - g.paid)}원`, g.sale - g.buy - g.paid < 0 ? "#2457D6" : "#D92D20"], ["확인 필요", g.issue ? `${g.issue}건` : "없음", g.issue ? C.bad : C.ok]].map(([l, v, c], i) => (
            <button key={l} type="button" disabled={l !== "확인 필요" || !g.issue} onClick={() => setOnlyBad((x) => !x)} className={`px-4 py-2.5 text-center border-[#E3E8F0] ${i ? "sm:border-l" : ""} ${l === "확인 필요" && g.issue ? "hover:bg-[#FFF5F4] cursor-pointer" : "cursor-default"}`}>
              <div className="text-[12px] font-bold text-[#9AA9C3]">{l}</div>
              <div className="text-[16px] font-black whitespace-nowrap" style={{ color: c }}>{v}{l === "수수료" && <MarginPct profit={g.sale - g.buy - g.paid} sales={g.sale} hideZero />}</div>{/* ⭐ 2026-11-17 수수료율 */}
            </button>))}
        </div>
        <div className="px-4 py-2.5 border-b border-[#E3E8F0] flex items-center gap-2 flex-wrap">
          <div className="text-[14.5px] font-black mr-auto">오더 <span className="text-[12.5px] font-bold text-[#9AA9C3]">{shownRows(g).length !== g.rows.length ? `${shownRows(g).length}/${g.rows.length}건 · ` : ""}오더를 누르면 수정할 수 있습니다</span></div>
          <div className="relative w-full sm:w-auto">
            <Ico d={IC.search} size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9AA9C3] pointer-events-none" />
            <input id="mc-oq" value={oq} onChange={(e) => setOq(e.target.value)} placeholder="차량 · 기사 · 상하차지 검색" className="h-10 sm:h-9 w-full sm:w-[210px] rounded-lg border border-[#D5DDEA] bg-white pl-8 pr-2 text-[14px] sm:text-[13px] font-semibold outline-none focus:border-[#1B2B4B]" />
          </div>
          <div className="inline-flex p-0.5 rounded-lg bg-[#F4F6FA]" role="tablist" aria-label="보기">
            {[[false, "전체"], [true, `확인 필요 ${g.issue}`]].map(([k, l]) => <button key={String(k)} type="button" role="tab" aria-selected={onlyBad === k} onClick={() => setOnlyBad(k)} className={`h-8 px-3 rounded-md text-[12.5px] font-black ${onlyBad === k ? "bg-white text-[#0F1A30] shadow-sm" : "text-[#5B6B85]"}`}>{l}</button>)}
          </div>
          {phone ? (
            <div className="inline-flex p-0.5 rounded-lg bg-[#F4F6FA]" role="tablist" aria-label="정렬">
              {[["date", "날짜순"], ["status", "확인 필요 먼저"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={osort === k} onClick={() => setOsort(k)} className={`h-8 px-3 rounded-md text-[12.5px] font-black ${osort === k ? "bg-white text-[#0F1A30] shadow-sm" : "text-[#5B6B85]"}`}>{l}</button>)}
            </div>
          ) : (
          <select id="mc-sort" value={osort} onChange={(e) => setOsort(e.target.value)} className="h-9 rounded-lg border border-[#D5DDEA] bg-white px-2 text-[13px] font-bold text-[#1B2B4B]" title="정렬">
            <option value="date">날짜순</option><option value="status">상태순(확인 필요 먼저)</option>
          </select>)}
          <button type="button" onClick={() => setCmpOpen(true)} className={`${phone ? "flex-1 h-11 rounded-xl" : "h-9 rounded-lg"} px-3.5 border border-[#D5DDEA] bg-white text-[13px] font-bold text-[#1B2B4B]`} data-kp="mc-stmt-compare" title="업체가 보낸 거래명세서(엑셀 · 캡처)를 올려 우리 오더와 맞춰 봐요">업체 명세서 비교</button>
          {lockedOf(g) ? <span className="h-9 px-3 inline-flex items-center rounded-lg border border-[#0F1A30] text-[12.5px] font-black text-[#0F1A30]">최종마감 · 수정 잠금</span>
            : !isViewer && <button type="button" onClick={() => addOrder(g.client)} className={`${phone ? "flex-1 h-11 rounded-xl bg-[#0F1A30] text-white border-[#0F1A30] font-black" : "h-9 rounded-lg bg-white text-[#1B2B4B] border-[#D5DDEA] font-bold"} px-3.5 border text-[13px]`}>+ 오더 추가</button>}
        </div>
        {phone ? (
          <div className="p-2.5 space-y-1.5">
            {shownRows(g).map((o, i) => { const is = issuesOfRow(o); return (
              <button key={idOf(o)} type="button" onClick={() => openRow(o)} className="w-full text-left rounded-xl bg-white border border-[#E1E6EF] px-3 py-2.5" style={{ boxShadow: is.length ? `inset 3px 0 0 ${is.some((x) => x.block) ? C.bad : C.warn}` : undefined }}>
                <div className="flex items-center gap-2 text-[12.5px]" style={{ ...NUM, color: C.mute }}><b style={{ color: C.sub }}>{i + 1}</b><span>{String(o.상차일 || "").slice(5)}</span><span className="truncate">{o.차량번호 || "차량 없음"} {o.이름 || ""}</span><span className="ml-auto font-black text-[14px]" style={{ color: n(o.청구운임) ? C.ink : C.bad }}>{won(n(o.청구운임))}</span></div>
                <div className="mt-0.5 text-[14px] font-black truncate">{o.상차지명 || "-"} → {o.하차지명 || "-"}</div>
                {is.length > 0 && <div className="mt-0.5"><IssueText list={is} /></div>}
              </button>); })}
          </div>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-430px)] min-h-[200px]">
            <table className="kp-sd kp-grid w-full" style={{ ...NUM, minWidth: 900 }}>
              <thead><tr className="text-[12.5px] text-[#5B6B85]">
                {["순번", "상차일", "상차지 → 하차지", "톤수", "차량번호", "기사", "청구", "기사운임", "수수료", "확인", ""].map((h, i) => <th key={i} className="px-2.5 py-2 font-black sticky top-0 bg-[#F8FAFD] z-[1] whitespace-nowrap text-center">{h}</th>)}
              </tr></thead>
              <tbody>
                {shownRows(g).map((o, i) => { const is = issuesOfRow(o); return (
                  <tr key={idOf(o)} onClick={() => openRow(o)} className="cursor-pointer border-t border-[#EEF2F8] hover:bg-[#F8FAFD]" title="눌러서 수정" style={{ boxShadow: is.length ? `inset 3px 0 0 ${is.some((x) => x.block) ? C.bad : C.warn}` : undefined }}>
                    <td className="px-2.5 py-2 text-center text-[12.5px] text-[#9AA9C3]">{i + 1}</td>
                    <td className="px-2.5 py-2 text-[13px] whitespace-nowrap text-center">{String(o.상차일 || "").slice(5)}</td>
                    <td className="px-2.5 py-2 text-[13px] font-bold max-w-[280px] truncate text-center">{o.상차지명 || "-"} <span className="text-[#9AA9C3]">→</span> {o.하차지명 || "-"}</td>
                    <td className="px-2.5 py-2 text-[13px] whitespace-nowrap text-[#5B6B85] text-center">{o.차량톤수 || ""}</td>
                    <td className="px-2.5 py-2 text-[13px] whitespace-nowrap text-center">{o.차량번호 || <span style={{ color: C.bad }}>없음</span>}</td>
                    <td className="px-2.5 py-2 text-[13px] whitespace-nowrap text-[#5B6B85] text-center">{o.이름 || ""}</td>
                    <td className="px-2.5 py-2 text-[13px] font-black text-center whitespace-nowrap" style={{ color: n(o.청구운임) ? C.ink : C.bad }}>{won(n(o.청구운임))}</td>
                    <td className="px-2.5 py-2 text-[13px] text-center whitespace-nowrap" style={{ color: n(o.기사운임) ? C.sub : C.warn }}>{won(n(o.기사운임))}</td>
                    <td className="px-2.5 py-2 text-[13px] text-center whitespace-nowrap" style={{ color: orderProfit(o) < 0 ? "#2457D6" : C.sub }}>{won(orderProfit(o))}</td>{/* ⭐ 2026-11-17 수수료 = 청구 − 기사 − 회사 지급분 */}
                    <td className="px-2.5 py-2"><div className="flex justify-center"><IssueText list={is} /></div></td>
                    <td className="px-1.5 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      {!isViewer && !lockedOf(g) && (delAsk === idOf(o)
                        ? <span className="inline-flex gap-1"><button type="button" className="h-7 px-2 rounded-md text-[12px] font-black text-white" style={{ background: C.bad }} onClick={async () => { setDelAsk(""); await onRemove?.(o); setToast("오더를 삭제했습니다"); }}>삭제</button><button type="button" className="h-7 px-1.5 text-[12px] font-bold" style={{ color: C.sub }} onClick={() => setDelAsk("")}>취소</button></span>
                        : <button type="button" aria-label="오더 삭제" title="삭제" className="w-7 h-7 rounded-md text-[#A3AEC2] hover:text-[#C62F25]" onClick={() => setDelAsk(idOf(o))}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>)}
                    </td>
                  </tr>); })}
              </tbody>
            </table>
          </div>)}
        {g.row?.doc?.log?.length > 0 && (
          <div className="px-4 py-2 border-t border-[#E3E8F0] bg-[#F8FAFD] text-[12.5px] text-[#5B6B85] flex gap-x-4 gap-y-0.5 flex-wrap" style={NUM}>
            <b className="text-[#9AA9C3]">기록</b>
            {g.row.doc.log.slice(0, 4).map((x, i) => { const t = new Date(Number(x.at) + 9 * 3600e3); return <span key={i}>{`${t.getUTCMonth() + 1}/${t.getUTCDate()} ${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`} {x.by} · {x.act}{x.note ? ` (${x.note})` : ""}</span>; })}
          </div>)}
      </div>
    </div>); })();

  return (
    <div className="pb-6" style={{ color: C.ink }} data-kp="month-close">
      <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] min-[1800px]:grid-cols-[300px_minmax(0,1fr)] gap-3 items-start">
        {rail}
        {preview}
      </div>

      {toast && <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-[100060] px-5 py-3 rounded-2xl bg-[#14213D] text-white text-[14px] font-bold shadow-[0_16px_40px_rgba(10,18,36,.3)]" role="status">{toast}</div>}

      {/* ⭐ 2026-11-17 업체 명세서 비교 — 고른 거래처의 이 달 오더 전체(보기 · 노선 거르기와 상관없이)와 맞춘다 */}
      {cmpOpen && cur && (
        <React.Suspense fallback={null}>
          <StmtCompareModal client={cur.client} ym={ym} where="월 마감" canEdit={!isViewer && !lockedOf(cur)} onClose={() => setCmpOpen(false)} onEdit={openRow}
            orders={month.filter((o) => (String(o.거래처명 || "").trim() || "(거래처 없음)") === cur.client)} />
        </React.Suspense>)}
      <OrderSheet open={!!sheet} row={sheet?.row} isNew={!!sheet?.isNew} ym={ym} phone={phone} isViewer={isViewer}
        clients={groups.map((g) => g.client).filter((c) => c !== "(거래처 없음)")} issues={sheet?.row && !sheet.isNew ? issuesOfRow(sheet.row) : []}
        onClose={() => setSheet(null)}
        onSave={async (patch) => { if (sheet?.isNew) { const r = await onAdd?.({ ...patch }); if (r !== false) setToast("오더를 추가했습니다"); return r; } const r = await onPatch?.(sheet.row, patch); if (r !== false) setToast("저장했습니다"); return r; }}
        onDelete={async () => { await onRemove?.(sheet.row); setToast("오더를 삭제했습니다"); }} />
    </div>
  );
}
