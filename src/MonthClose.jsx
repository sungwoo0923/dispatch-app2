// ======================= src/MonthClose.jsx =======================
// ✅ 2026-11-16 월 마감(배차자 1차) — 리디자인 4 "마감표"
//  · 보기: 내 배차 · 담당자별 · 전체 / 달은 늘 당월부터
//  · 위: 4단계 체크리스트(오더 확인 → 거래처 검증 → 1차 마감 → 경리 확인) + 진행 막대
//  · 가운데: 엑셀처럼 한 장의 표(순번 · 거래처 · 담당 · 오더 · 청구 · 기사 · 수수료 · 확인할 것 · 상태). 줄을 누르면 오더가 펼쳐진다(순번 포함)
//  · 오더 줄을 누르면 PC는 배차관리와 같은 오더 패널, 폰은 아래 창에서 고친다. [+ 오더 추가]도 같은 패널(새 오더)
//  · 확인할 것이 있어도 [검증]할 수 있다(한 번 묻는다) → [1차 마감] → 경리팀(arDesk kind "close")
//  계산은 src/closeFlow.js(순수 함수 · scripts/closeFlow.test.mjs) · 경리 2차 화면은 src/CloseFlow.jsx(mode "acct")
import React from "react";
import { createPortal } from "react-dom";
import { useArDesk, arDeskId } from "./SettleDesk";
import { won, kstYm, monthOf, n } from "./settleCore";
import { CLOSE_RULES, closeBoard, closeChecks, isMine, canSubmit, canVerify, verifyPatch, submitPatch, unlockPatch, prevYmOf } from "./closeFlow";
import { useLoadOrderRange, monthEnd } from "./orderHistory";
import useNarrow from "./useNarrow";
import { kpConfirm } from "./kpDialog";

const NUM = { fontVariantNumeric: "tabular-nums" };
const C = { ink: "#14213D", sub: "#5A6781", mute: "#8D97AB", line: "#E1E6EF", soft: "#F6F8FB", blue: "#2457D6", ok: "#0F7A52", warn: "#B25F00", bad: "#C62F25", track: "#EDF1F7" };
const btn = "h-10 px-4 rounded-xl border border-[#D9E0EC] bg-white text-[14px] font-bold text-[#14213D] hover:border-[#9FB0CC] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";
const btnPri = "h-10 px-5 rounded-xl bg-[#14213D] text-white text-[14px] font-black hover:bg-[#1F3157] disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap";
const inp = "h-10 w-full rounded-xl border border-[#D9E0EC] bg-white px-3 text-[14px] font-semibold text-[#14213D] outline-none focus:border-[#2457D6] focus:ring-2 focus:ring-[#2457D6]/15";
const isCancel = (o) => o?.배차상태 === "배차취소" || ["취소", "배차취소", "오더취소", "취소됨"].includes(o?.상태);
const ymText = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;
const nextYm = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); };
const idOf = (o) => o?._id || o?.id;
const IssueText = ({ list }) => list.length
  ? <span className="flex flex-wrap gap-x-2 gap-y-0.5">{list.map((x) => <span key={x.key} className="text-[12.5px] font-black whitespace-nowrap" style={{ color: x.block ? C.bad : C.warn }}>{x.label}</span>)}</span>
  : <span className="text-[12.5px] font-bold" style={{ color: C.ok }}>✓ 확인</span>;

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
    if ("청구운임" in patch || "기사운임" in patch) patch.수수료 = n(f.청구운임) - n(f.기사운임);
    if ("이름" in patch) patch.기사명 = patch.이름;
    if (isNew) { patch.배차상태 = String(f.차량번호 || "").trim() ? "배차완료" : "배차중"; patch.등록기기 = "월 마감"; }
    else if ("차량번호" in patch && String(f.차량번호 || "").trim() && (row?.배차상태 || "") !== "배차완료") patch.배차상태 = "배차완료";
    if (!Object.keys(patch).length) { onClose(); return; }
    setBusy("save"); setErr("");
    try { const r = await onSave(patch); if (r === false) { setErr("저장하지 못했어요. 입력값을 확인해 주세요."); setBusy(""); return; } onClose(); }
    catch (e) { setErr(`저장하지 못했어요 — ${e?.message || e}`); setBusy(""); }
  };
  const del = async () => { setBusy("del"); try { await onDelete(); onClose(); } catch (e) { setErr(`지우지 못했어요 — ${e?.message || e}`); setBusy(""); } };
  const profit = n(f.청구운임) - n(f.기사운임);
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
//  ✅ 2026-11-16 리디자인 4 — "마감표": 엑셀 · 구글시트처럼 한 장의 표
//   거래처가 한 줄(순번 · 오더 · 청구 · 기사 · 수수료 · 확인할 것 · 상태 · 버튼) → 누르면 그 자리에서 오더가 펼쳐진다(순번 포함)
//   위: 4단계 체크리스트(오더 확인 → 거래처 검증 → 1차 마감 → 경리 확인) · 체크해서 한 번에 검증 · 1차 마감
//   확인할 것(청구운임 빈칸 · 배차 미완료 · 기사운임 빈칸)이 있어도 검증할 수 있다 — 한 번 묻는다
const ST = { // 상태 → 이름 · 색 · 순서(할 일 먼저)
  rejected: { label: "반려됨", c: C.bad, ord: 0 },
  none: { label: "검증 전", c: C.mute, ord: 1 },
  verified: { label: "검증 완료", c: C.blue, ord: 2 },
  submitted: { label: "1차 마감", c: C.warn, ord: 3 },
  approved: { label: "경리 확인", c: C.ok, ord: 4 },
};
const stOf = (g) => (g.changed && g.status !== "none" ? { label: "바뀜 · 다시 검증", c: C.bad, ord: 0 } : ST[g.status] || ST.none);
const ck = "w-[18px] h-[18px] accent-[#14213D] cursor-pointer";

export default function MonthClose({ orders = [], company = "", me = null, staffName, isViewer = false, onPatch, onAdd, onRemove, onOpenOrder }) {
  const phone = useNarrow(860);
  const desk = useArDesk(company);
  const [ym, setYm] = React.useState(() => kstYm(0)); // 늘 당월부터
  useLoadOrderRange(`${prevYmOf(ym)}-01`, monthEnd(ym));
  const [scope, setScope] = React.useState("mine"); // mine | staff | all
  const [staff, setStaff] = React.useState("");
  const [tab, setTab] = React.useState("all"); // all | todo | verified | closed
  const [onlyIssue, setOnlyIssue] = React.useState(false);
  const [cq, setCq] = React.useState("");
  const [open, setOpen] = React.useState(() => new Set()); // 펼친 거래처
  const [pick, setPick] = React.useState(() => new Set()); // 체크한 거래처
  const [sheet, setSheet] = React.useState(null);
  const [delAsk, setDelAsk] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [toast, setToast] = React.useState("");
  React.useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(""), 3200); return () => clearTimeout(t); }, [toast]);
  React.useEffect(() => { setPick(new Set()); setOpen(new Set()); }, [ym, scope, staff]);
  const openRow = (o) => (onOpenOrder && !phone ? onOpenOrder(o) : setSheet({ row: o }));
  const addOrder = (client) => {
    const base = { 거래처명: client === "(거래처 없음)" ? "" : client, 상차일: ym === kstYm(0) ? new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) : `${ym}-01` };
    if (onOpenOrder && !phone) window.dispatchEvent(new CustomEvent("kp-open-copy-panel", { detail: { row: base, isNew: true } })); // 배차관리와 같은 입력 패널
    else setSheet({ isNew: true, row: base });
  };

  const staffOf = React.useCallback((o) => (staffName ? staffName(o) : "") || "미지정", [staffName]);
  const month = React.useMemo(() => (orders || []).filter((o) => !isCancel(o) && o?.source !== "transport_transmit" && monthOf(o) === ym), [orders, ym]);
  const staffList = React.useMemo(() => { const m = new Map(); month.forEach((o) => { const s2 = staffOf(o); m.set(s2, (m.get(s2) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [month, staffOf]);
  const mineOf = React.useCallback((o) => isMine(o, me) || (!!me?.name && staffOf(o) === me.name), [me, staffOf]);
  const scoped = React.useMemo(() => month.filter((o) => (scope === "mine" ? mineOf(o) : scope === "staff" ? (!staff || staffOf(o) === staff) : true)), [month, scope, staff, mineOf, staffOf]);

  const checks = React.useMemo(() => closeChecks(month), [month]);
  const issueMap = React.useMemo(() => { const m = new Map(); CLOSE_RULES.forEach((r) => (checks[r.key] || []).forEach((o) => { const id = idOf(o); const l = m.get(id) || []; l.push({ key: r.key, label: r.label, block: r.block }); m.set(id, l); })); return m; }, [checks]);
  const issuesOfRow = React.useCallback((o) => { const l = [...(issueMap.get(idOf(o)) || [])]; if (!String(o.거래처명 || "").trim()) l.unshift({ key: "noClient", label: "거래처 빈칸", block: true }); return l; }, [issueMap]);

  const closeOf = React.useCallback((c, m) => desk.closes.get(`${c}|${m}`) || null, [desk.closes]);
  const board = React.useMemo(() => new Map(closeBoard(orders, ym, { closeOf, me }).map((r) => [r.client, r])), [orders, ym, closeOf, me]);
  const groups = React.useMemo(() => {
    const m = new Map();
    scoped.forEach((o) => { const c = String(o.거래처명 || "").trim() || "(거래처 없음)"; const g = m.get(c) || { client: c, rows: [], sale: 0, buy: 0, issue: 0 }; g.rows.push(o); g.sale += n(o.청구운임); g.buy += n(o.기사운임); if (issuesOfRow(o).length) g.issue += 1; m.set(c, g); });
    return [...m.values()].map((g) => { const b = board.get(g.client); return { ...g, count: g.rows.length, row: b || null, status: b?.status || "none", changed: !!b?.changed, owners: [...new Set(g.rows.map(staffOf))].slice(0, 2).join(", "),
      rows: g.rows.sort((a, b2) => String(a.상차일 || "").localeCompare(String(b2.상차일 || "")) || String(a.상차시간 || "").localeCompare(String(b2.상차시간 || ""))) }; })
      .sort((a, b) => stOf(a).ord - stOf(b).ord || b.sale - a.sale);
  }, [scoped, board, issuesOfRow, staffOf]);
  const bucket = (g) => (g.changed && g.status !== "none") || g.status === "none" || g.status === "rejected" ? "todo" : g.status === "verified" ? "verified" : "closed";
  const cnt = React.useMemo(() => { const c = { todo: 0, verified: 0, submitted: 0, approved: 0 }; groups.forEach((g) => { const b = bucket(g); if (b === "closed") c[g.status] += 1; else c[b] += 1; }); return c; }, [groups]);
  const issueTotal = groups.reduce((a, g) => a + g.issue, 0);
  const list = groups.filter((g) => (tab === "all" || bucket(g) === tab) && (!onlyIssue || g.issue) && (!cq || g.client.replace(/\s/g, "").toLowerCase().includes(cq.replace(/\s/g, "").toLowerCase())));
  const tot = list.reduce((a, g) => ({ count: a.count + g.count, sale: a.sale + g.sale, buy: a.buy + g.buy, issue: a.issue + g.issue }), { count: 0, sale: 0, buy: 0, issue: 0 });
  const picked = list.filter((g) => pick.has(g.client));
  const pickVerify = picked.filter((g) => g.row && canVerify(g.row));
  const pickSubmit = picked.filter((g) => g.row && canSubmit(g.row));
  const allSubmit = groups.filter((g) => g.row && canSubmit(g.row));

  const save = (g, patch) => desk.save(g.row.doc?.id || arDeskId(desk.company, "close", g.client, ym), patch);
  const verifyMany = async (gs) => {
    if (isViewer || busy || !gs.length) return;
    const iss = gs.reduce((a, g) => a + g.issue, 0);
    if (iss && !(await kpConfirm(`${gs.length === 1 ? gs[0].client : `${gs.length}곳`}에 확인할 것이 ${iss}건 있어요.\n(청구운임 빈칸 · 배차 미완료 · 기사운임 빈칸)\n\n맞는 내용이면 그대로 검증 완료할까요?`))) return;
    setBusy("v"); try { for (const g of gs) await save(g, verifyPatch(g.row, me)); setToast(`${gs.length === 1 ? gs[0].client : `${gs.length}곳`} 검증 완료 — 이제 1차 마감할 수 있어요`); setPick(new Set()); } finally { setBusy(""); }
  };
  const submitMany = async (gs) => {
    if (isViewer || busy || !gs.length) return;
    if (gs.length > 1 && !(await kpConfirm(`${gs.length}곳을 1차 마감할까요?\n경리팀 마감 검증으로 넘어가요.`))) return;
    setBusy("s"); try { for (const g of gs) await save(g, submitPatch(g.row, me)); setToast(`${gs.length === 1 ? gs[0].client : `${gs.length}곳`} 1차 마감 — 경리팀 거래처정산으로 넘어갔어요`); setPick(new Set()); } finally { setBusy(""); }
  };
  const unlock = async (g) => { if (isViewer || busy || !g?.row) return; setBusy("u"); try { await save(g, unlockPatch(g.row, me, "월 마감에서")); setToast(g.status === "verified" ? "검증을 취소했어요" : "마감을 풀었어요"); } finally { setBusy(""); } };
  const toggle = (set, setter, k) => setter((p) => { const x = new Set(p); x.has(k) ? x.delete(k) : x.add(k); return x; });

  const action = (g) => {
    if (isViewer || !g.row) return null;
    if (canVerify(g.row)) return <button type="button" disabled={!!busy} onClick={(e) => { e.stopPropagation(); verifyMany([g]); }} className="h-9 px-3.5 rounded-lg border-2 border-[#2457D6] text-[#2457D6] text-[13px] font-black whitespace-nowrap hover:bg-[#EEF3FF]">{g.changed || g.status === "rejected" ? "다시 검증" : "검증"}</button>;
    if (canSubmit(g.row)) return <button type="button" disabled={!!busy} onClick={(e) => { e.stopPropagation(); submitMany([g]); }} className="h-9 px-3.5 rounded-lg bg-[#14213D] text-white text-[13px] font-black whitespace-nowrap hover:bg-[#1F3157]">1차 마감</button>;
    if (g.status === "submitted") return <span className="text-[12.5px] font-bold whitespace-nowrap" style={{ color: C.warn }}>경리 확인 중</span>;
    if (g.status === "approved") return <span className="text-[12.5px] font-bold whitespace-nowrap" style={{ color: C.ok }}>마감 끝</span>;
    return null;
  };
  const steps = [
    { k: "issue", n: "1", label: "오더 확인", v: issueTotal ? `확인할 것 ${issueTotal}건` : "확인할 것 없음", tone: issueTotal ? C.bad : C.ok, on: () => { setOnlyIssue((x) => !x); setTab("all"); }, active: onlyIssue },
    { k: "todo", n: "2", label: "거래처 검증", v: `${cnt.verified + cnt.submitted + cnt.approved} / ${groups.length}곳`, tone: cnt.todo ? C.ink : C.ok, on: () => setTab(tab === "todo" ? "all" : "todo"), active: tab === "todo", sub: cnt.todo ? `남은 곳 ${cnt.todo}` : "모두 검증" },
    { k: "verified", n: "3", label: "1차 마감", v: `${cnt.submitted + cnt.approved} / ${groups.length}곳`, tone: cnt.verified ? C.blue : C.ink, on: () => setTab(tab === "verified" ? "all" : "verified"), active: tab === "verified", sub: cnt.verified ? `마감할 곳 ${cnt.verified}` : "" },
    { k: "closed", n: "4", label: "경리 확인", v: `${cnt.approved} / ${groups.length}곳`, tone: cnt.approved && cnt.approved === groups.length ? C.ok : C.ink, on: () => setTab(tab === "closed" ? "all" : "closed"), active: tab === "closed", sub: cnt.submitted ? `경리 확인 중 ${cnt.submitted}` : "" },
  ];
  const pct = groups.length ? Math.round(((cnt.verified * 0.5 + cnt.submitted * 0.85 + cnt.approved) / groups.length) * 100) : 0;

  const orderRows = (g) => (
    <div className="bg-[#F8FAFD] border-t border-[#E1E6EF] px-3 sm:px-5 py-3">
      {g.status === "rejected" && g.row?.doc?.reason && <div className="mb-2 text-[13px] font-bold" style={{ color: C.bad }}>반려 사유 · {g.row.doc.reason}</div>}
      {g.changed && g.status !== "none" && <div className="mb-2 text-[13px] font-bold" style={{ color: C.bad }}>{g.status === "verified" ? "검증" : "마감"} 뒤에 오더가 바뀌었어요 — 다시 검증해 주세요.</div>}
      {phone ? (
        <div className="space-y-1.5">
          {g.rows.map((o, i) => { const is = issuesOfRow(o); return (
            <button key={idOf(o)} type="button" onClick={() => openRow(o)} className="w-full text-left rounded-xl bg-white border border-[#E1E6EF] px-3 py-2.5" style={{ boxShadow: is.length ? `inset 3px 0 0 ${is.some((x) => x.block) ? C.bad : C.warn}` : undefined }}>
              <div className="flex items-center gap-2 text-[12.5px]" style={{ ...NUM, color: C.mute }}><b style={{ color: C.sub }}>{i + 1}</b><span>{String(o.상차일 || "").slice(5)}</span><span className="truncate">{o.차량번호 || "차량 없음"} {o.이름 || ""}</span><span className="ml-auto font-black text-[14px]" style={{ color: n(o.청구운임) ? C.ink : C.bad }}>{won(n(o.청구운임))}</span></div>
              <div className="mt-0.5 text-[14px] font-black truncate">{o.상차지명 || "-"} → {o.하차지명 || "-"}</div>
              {is.length > 0 && <div className="mt-0.5"><IssueText list={is} /></div>}
            </button>); })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E1E6EF] bg-white">
          <table className="kp-plain w-full min-w-[900px]" style={NUM}>
            <thead><tr className="text-[12px]" style={{ color: C.mute }}>
              {["순번", "상차일", "상차지 → 하차지", "톤수", "차량번호", "기사", "청구", "기사운임", "수수료", "확인", ""].map((h, i) => <th key={i} className={`px-2.5 py-2 font-bold border-b border-[#E1E6EF] ${i >= 6 && i <= 8 ? "text-right" : i === 0 ? "text-center" : "text-left"}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {g.rows.map((o, i) => { const is = issuesOfRow(o); return (
                <tr key={idOf(o)} onClick={() => openRow(o)} className="cursor-pointer border-b border-[#EEF1F6] last:border-b-0 hover:bg-[#F3F6FC]" title="눌러서 고치기" style={{ boxShadow: is.length ? `inset 3px 0 0 ${is.some((x) => x.block) ? C.bad : C.warn}` : undefined }}>
                  <td className="px-2.5 py-2 text-center text-[12.5px]" style={{ color: C.mute }}>{i + 1}</td>
                  <td className="px-2.5 py-2 text-[13px] whitespace-nowrap">{String(o.상차일 || "").slice(5)}</td>
                  <td className="px-2.5 py-2 text-[13px] font-bold max-w-[300px] truncate">{o.상차지명 || "-"} <span style={{ color: C.mute }}>→</span> {o.하차지명 || "-"}</td>
                  <td className="px-2.5 py-2 text-[13px] whitespace-nowrap" style={{ color: C.sub }}>{o.차량톤수 || ""}</td>
                  <td className="px-2.5 py-2 text-[13px] whitespace-nowrap">{o.차량번호 || <span style={{ color: C.bad }}>없음</span>}</td>
                  <td className="px-2.5 py-2 text-[13px] whitespace-nowrap" style={{ color: C.sub }}>{o.이름 || ""}</td>
                  <td className="px-2.5 py-2 text-[13px] font-black text-right whitespace-nowrap" style={{ color: n(o.청구운임) ? C.ink : C.bad }}>{won(n(o.청구운임))}</td>
                  <td className="px-2.5 py-2 text-[13px] text-right whitespace-nowrap" style={{ color: n(o.기사운임) ? C.sub : C.warn }}>{won(n(o.기사운임))}</td>
                  <td className="px-2.5 py-2 text-[13px] text-right whitespace-nowrap" style={{ color: C.sub }}>{won(n(o.청구운임) - n(o.기사운임))}</td>
                  <td className="px-2.5 py-2"><IssueText list={is} /></td>
                  <td className="px-1.5 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    {!isViewer && (delAsk === idOf(o)
                      ? <span className="inline-flex gap-1"><button type="button" className="h-7 px-2 rounded-md text-[12px] font-black text-white" style={{ background: C.bad }} onClick={async () => { setDelAsk(""); await onRemove?.(o); setToast("오더를 지웠어요"); }}>지우기</button><button type="button" className="h-7 px-1.5 text-[12px] font-bold" style={{ color: C.sub }} onClick={() => setDelAsk("")}>취소</button></span>
                      : <button type="button" aria-label="오더 삭제" title="삭제" className="w-7 h-7 rounded-md text-[#A3AEC2] hover:text-[#C62F25]" onClick={() => setDelAsk(idOf(o))}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>)}
                  </td>
                </tr>); })}
            </tbody>
          </table>
        </div>)}
      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        {!isViewer && <button type="button" onClick={() => addOrder(g.client)} className="h-9 px-3.5 rounded-lg border border-[#D9E0EC] bg-white text-[13px] font-bold">+ 오더 추가</button>}
        {g.row?.doc?.log?.[0] && <span className="text-[12px]" style={{ color: C.mute }}>최근 · {g.row.doc.log[0].by} {g.row.doc.log[0].act}</span>}
        <span className="flex-1" />
        {!isViewer && g.row && (g.status === "verified" || g.status === "submitted") && <button type="button" disabled={!!busy} onClick={() => unlock(g)} className="h-9 px-3 text-[13px] font-bold" style={{ color: C.sub }}>{g.status === "verified" ? "검증 취소" : "마감 풀기"}</button>}
        {action(g)}
      </div>
    </div>
  );

  return (
    <div className="space-y-3 pb-6" style={{ color: C.ink }} data-kp="month-close">
      {/* 머리 */}
      <div className="flex items-end gap-x-4 gap-y-2.5 flex-wrap">
        <div className="mr-auto min-w-0">
          <div className="text-[21px] font-black leading-tight">월 마감</div>
          <div className="text-[13.5px]" style={{ color: C.sub }}>거래처별로 오더를 확인하고 [검증] → [1차 마감] 하면 경리팀으로 넘어가요.</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" className={`${btn} px-3`} aria-label="이전 달" onClick={() => setYm(prevYmOf(ym))}>‹</button>
          <span className="w-[112px] text-center text-[16px] font-black" style={NUM}>{ymText(ym)}</span>
          <button type="button" className={`${btn} px-3`} aria-label="다음 달" onClick={() => setYm(nextYm(ym))}>›</button>
        </div>
        <div className="inline-flex rounded-xl border border-[#D9E0EC] bg-white p-1" role="tablist" aria-label="범위">
          {[["mine", "내 배차"], ["staff", "담당자별"], ["all", "전체"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={scope === k} onClick={() => setScope(k)} className={`h-8 px-3.5 rounded-lg text-[13.5px] font-black ${scope === k ? "bg-[#14213D] text-white" : "text-[#5A6781]"}`}>{l}</button>)}
        </div>
        {scope === "staff" && <select id="mc-staff" value={staff} onChange={(e) => setStaff(e.target.value)} className={`${inp} w-auto min-w-[150px]`}><option value="">담당자 전체</option>{staffList.map(([s2, c2]) => <option key={s2} value={s2}>{s2} ({c2})</option>)}</select>}
      </div>

      {/* 4단계 체크리스트 */}
      <section className="rounded-2xl border border-[#E1E6EF] bg-white">
        <div className={`grid ${phone ? "grid-cols-2" : "grid-cols-4"}`}>
          {steps.map((st, i) => (
            <button key={st.k} type="button" onClick={st.on} className={`text-left px-4 py-3 border-[#E1E6EF] ${i % (phone ? 2 : 4) ? "border-l" : ""} ${phone && i >= 2 ? "border-t" : ""} ${st.active ? "bg-[#F3F6FC]" : "hover:bg-[#FAFBFD]"}`}>
              <div className="flex items-center gap-2 text-[12.5px] font-bold" style={{ color: C.mute }}><span className="w-5 h-5 rounded-full grid place-items-center text-[11px] font-black text-white" style={{ background: st.tone === C.ok ? C.ok : "#9AA6BC" }}>{st.tone === C.ok ? "✓" : st.n}</span>{st.label}</div>
              <div className="mt-1 text-[18px] font-black" style={{ ...NUM, color: st.tone }}>{st.v}</div>
              {st.sub && <div className="text-[12px] font-bold" style={{ color: C.sub }}>{st.sub}</div>}
            </button>))}
        </div>
        <div className="px-4 pb-3 pt-1">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.track }}><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? C.ok : C.blue }} /></div>
          <div className="mt-1.5 flex items-center gap-x-4 gap-y-1 flex-wrap text-[12.5px] font-bold" style={{ ...NUM, color: C.sub }}>
            <span>진행 {pct}%</span><span>거래처 {groups.length}곳</span><span>오더 {scoped.length.toLocaleString()}건</span><span>청구 {won(scoped.reduce((a, o) => a + n(o.청구운임), 0))}원</span>
            {!isViewer && allSubmit.length > 0 && <button type="button" disabled={!!busy} onClick={() => submitMany(allSubmit)} className="ml-auto h-8 px-3 rounded-lg bg-[#14213D] text-white text-[12.5px] font-black">검증 완료 {allSubmit.length}곳 모두 1차 마감</button>}
          </div>
        </div>
      </section>

      {/* 도구 줄 */}
      <div className="flex items-center gap-2 flex-wrap">
        <input id="mc-cq" value={cq} onChange={(e) => setCq(e.target.value)} placeholder="거래처 찾기" className={inp} style={phone ? undefined : { width: 240 }} />
        <div className="inline-flex rounded-xl border border-[#D9E0EC] bg-white p-1">
          {[["all", `전체 ${groups.length}`], ["todo", `검증 전 ${cnt.todo}`], ["verified", `검증 완료 ${cnt.verified}`], ["closed", `마감 ${cnt.submitted + cnt.approved}`]].map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={`h-8 px-3 rounded-lg text-[13px] font-black ${tab === k ? "bg-[#EEF3FF] text-[#2457D6]" : "text-[#5A6781]"}`} style={NUM}>{l}</button>)}
        </div>
        <label className="inline-flex items-center gap-1.5 text-[13px] font-bold cursor-pointer" style={{ color: onlyIssue ? C.bad : C.sub }}><input type="checkbox" className={ck} checked={onlyIssue} onChange={(e) => setOnlyIssue(e.target.checked)} />확인할 것 있는 곳만</label>
        <span className="flex-1" />
        <button type="button" className="h-9 px-3 text-[13px] font-bold" style={{ color: C.sub }} onClick={() => setOpen(open.size ? new Set() : new Set(list.map((g) => g.client)))}>{open.size ? "모두 접기" : "모두 펼치기"}</button>
        {!isViewer && picked.length > 0 && (<>
          <span className="text-[13px] font-black" style={NUM}>선택 {picked.length}곳</span>
          <button type="button" disabled={!pickVerify.length || !!busy} onClick={() => verifyMany(pickVerify)} className="h-9 px-3.5 rounded-lg border-2 border-[#2457D6] text-[#2457D6] text-[13px] font-black disabled:opacity-35">검증 {pickVerify.length}</button>
          <button type="button" disabled={!pickSubmit.length || !!busy} onClick={() => submitMany(pickSubmit)} className="h-9 px-3.5 rounded-lg bg-[#14213D] text-white text-[13px] font-black disabled:opacity-35">1차 마감 {pickSubmit.length}</button>
        </>)}
      </div>

      {/* 마감표 */}
      <section className="rounded-2xl border border-[#E1E6EF] bg-white overflow-hidden">
        {!list.length ? (
          <div className="py-16 text-center">
            <div className="text-[15px] font-black">{groups.length ? "조건에 맞는 거래처가 없어요" : `${ymText(ym)}에 ${scope === "mine" ? "내 배차" : "오더"}가 없어요`}</div>
            {scope === "mine" && !groups.length && <div className="text-[13px] mt-1" style={{ color: C.mute }}>위에서 ‘전체’로 바꿔 보세요.</div>}
          </div>
        ) : phone ? (
          <div>
            {list.map((g, i) => { const s2 = stOf(g); const on = open.has(g.client); return (
              <div key={g.client} className="border-b border-[#EEF1F6] last:border-b-0">
                <div className="px-3.5 py-3 flex items-center gap-2.5" onClick={() => toggle(open, setOpen, g.client)}>
                  {!isViewer && <input type="checkbox" className={ck} checked={pick.has(g.client)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(pick, setPick, g.client)} aria-label={`${g.client} 선택`} />}
                  <span className="text-[12px] w-5 text-center" style={{ ...NUM, color: C.mute }}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><span className="truncate text-[15px] font-black">{g.client}</span><span className="text-[12px] font-black whitespace-nowrap" style={{ color: s2.c }}>{s2.label}</span></div>
                    <div className="text-[12.5px]" style={{ ...NUM, color: C.sub }}>{g.count}건 · 청구 {won(g.sale)}{g.issue ? <b className="ml-1.5" style={{ color: C.bad }}>확인 {g.issue}</b> : null}</div>
                  </div>
                  {action(g)}
                  <span className="text-[12px]" style={{ color: C.mute }}>{on ? "▲" : "▼"}</span>
                </div>
                {on && orderRows(g)}
              </div>); })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="kp-plain w-full min-w-[980px]" style={NUM}>
              <thead><tr className="text-[12.5px] bg-[#F6F8FB]" style={{ color: C.sub }}>
                <th className="w-10 px-2 py-2.5 border-b border-[#E1E6EF] text-center">{!isViewer && <input type="checkbox" className={ck} aria-label="모두 선택" checked={list.length > 0 && list.every((g) => pick.has(g.client))} onChange={(e) => setPick(e.target.checked ? new Set(list.map((g) => g.client)) : new Set())} />}</th>
                {["순번", "거래처", "담당", "오더", "청구", "기사", "수수료", "확인할 것", "상태", ""].map((h, i) => <th key={i} className={`px-3 py-2.5 font-bold border-b border-[#E1E6EF] whitespace-nowrap ${i >= 3 && i <= 6 ? "text-right" : i === 0 ? "text-center" : "text-left"}`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {list.map((g, i) => { const s2 = stOf(g); const on = open.has(g.client); return (
                  <React.Fragment key={g.client}>
                    <tr onClick={() => toggle(open, setOpen, g.client)} className={`cursor-pointer border-b border-[#EEF1F6] ${on ? "bg-[#F3F6FC]" : "hover:bg-[#FAFBFD]"}`}>
                      <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>{!isViewer && <input type="checkbox" className={ck} checked={pick.has(g.client)} onChange={() => toggle(pick, setPick, g.client)} aria-label={`${g.client} 선택`} />}</td>
                      <td className="px-3 py-2.5 text-center text-[13px]" style={{ color: C.mute }}>{i + 1}</td>
                      <td className="px-3 py-2.5 text-[14.5px] font-black whitespace-nowrap"><span className="mr-1.5 text-[11px]" style={{ color: C.mute }}>{on ? "▼" : "▶"}</span>{g.client}</td>
                      <td className="px-3 py-2.5 text-[13px] whitespace-nowrap" style={{ color: C.sub }}>{g.owners}</td>
                      <td className="px-3 py-2.5 text-[14px] text-right">{g.count}</td>
                      <td className="px-3 py-2.5 text-[14px] font-black text-right whitespace-nowrap">{won(g.sale)}</td>
                      <td className="px-3 py-2.5 text-[14px] text-right whitespace-nowrap" style={{ color: C.sub }}>{won(g.buy)}</td>
                      <td className="px-3 py-2.5 text-[14px] text-right whitespace-nowrap" style={{ color: g.sale - g.buy < 0 ? C.bad : C.sub }}>{won(g.sale - g.buy)}</td>
                      <td className="px-3 py-2.5 text-[13px] font-black whitespace-nowrap" style={{ color: g.issue ? C.bad : C.ok }}>{g.issue ? `${g.issue}건` : "✓ 없음"}</td>
                      <td className="px-3 py-2.5 text-[13px] font-black whitespace-nowrap" style={{ color: s2.c }}>{s2.label}</td>
                      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>{action(g)}</td>
                    </tr>
                    {on && <tr><td colSpan={11} className="p-0">{orderRows(g)}</td></tr>}
                  </React.Fragment>); })}
                <tr className="bg-[#F6F8FB] font-black">
                  <td /><td /><td className="px-3 py-2.5 text-[13px]">합계 · {list.length}곳</td><td />
                  <td className="px-3 py-2.5 text-right text-[14px]">{tot.count.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-[14px]">{won(tot.sale)}</td>
                  <td className="px-3 py-2.5 text-right text-[14px]" style={{ color: C.sub }}>{won(tot.buy)}</td>
                  <td className="px-3 py-2.5 text-right text-[14px]" style={{ color: C.sub }}>{won(tot.sale - tot.buy)}</td>
                  <td className="px-3 py-2.5 text-[13px]" style={{ color: tot.issue ? C.bad : C.ok }}>{tot.issue ? `${tot.issue}건` : "✓"}</td><td /><td />
                </tr>
              </tbody>
            </table>
          </div>)}
      </section>

      {toast && <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-[100060] px-5 py-3 rounded-2xl bg-[#14213D] text-white text-[14px] font-bold shadow-[0_16px_40px_rgba(10,18,36,.3)]" role="status">{toast}</div>}

      <OrderSheet open={!!sheet} row={sheet?.row} isNew={!!sheet?.isNew} ym={ym} phone={phone} isViewer={isViewer}
        clients={groups.map((g) => g.client).filter((c) => c !== "(거래처 없음)")} issues={sheet?.row && !sheet.isNew ? issuesOfRow(sheet.row) : []}
        onClose={() => setSheet(null)}
        onSave={async (patch) => { if (sheet?.isNew) { const r = await onAdd?.({ ...patch }); if (r !== false) setToast("오더를 추가했어요"); return r; } const r = await onPatch?.(sheet.row, patch); if (r !== false) setToast("저장했어요"); return r; }}
        onDelete={async () => { await onRemove?.(sheet.row); setToast("오더를 지웠어요"); }} />
    </div>
  );
}
