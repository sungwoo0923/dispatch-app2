// ======================= src/MonthClose.jsx =======================
// ✅ 2026-11-16 월 마감(배차자 1차) 리디자인 — "내가 한 배차를 마감 전에 한 화면에서 확인하고 넘긴다"
//  · 보기: 내 배차 · 담당자별 · 거래처별 · 전체 — 고르면 그 범위의 이번 달 오더가 전부 나온다
//  · 위: 확인율(도넛) · 금액 · 날짜별 오더(막대) · 거래처 마감 상태(띠)
//  · 가운데: 거래처 목록 + 오더 표. 줄을 누르면 옆 창에서 바로 고치고 · 지우고, [+ 오더 추가]로 새로 넣는다(배차현황으로 안 넘어감)
//  · 아래: [1차 마감] — 고칠 것이 없는 거래처만 경리팀 마감 검증으로 넘어간다(거래처 단위 · arDesk kind "close")
//  계산은 src/closeFlow.js(순수 함수 · scripts/closeFlow.test.mjs) · 경리 2차 화면은 src/CloseFlow.jsx(mode "acct")
import React from "react";
import { createPortal } from "react-dom";
import { useArDesk, arDeskId } from "./SettleDesk";
import { won, short, kstYm, monthOf, n } from "./settleCore";
import { CLOSE_RULES, CLOSE_STATUS, closeBoard, closeChecks, isMine, canSubmit, submitPatch, unlockPatch, prevYmOf } from "./closeFlow";
import { useLoadOrderRange, monthEnd } from "./orderHistory";
import useNarrow from "./useNarrow";

const NUM = { fontVariantNumeric: "tabular-nums" };
const C = { ink: "#14213D", sub: "#5A6781", mute: "#8D97AB", line: "#E1E6EF", soft: "#F6F8FB", blue: "#2457D6", ok: "#0F7A52", warn: "#B25F00", bad: "#C62F25", track: "#EDF1F7" };
const TONE = { ok: C.ok, warn: C.warn, bad: C.bad, mute: C.mute };
const btn = "h-10 px-4 rounded-xl border border-[#D9E0EC] bg-white text-[14px] font-bold text-[#14213D] hover:border-[#9FB0CC] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";
const btnPri = "h-10 px-5 rounded-xl bg-[#14213D] text-white text-[14px] font-black hover:bg-[#1F3157] disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap";
const inp = "h-10 w-full rounded-xl border border-[#D9E0EC] bg-white px-3 text-[14px] font-semibold text-[#14213D] outline-none focus:border-[#2457D6] focus:ring-2 focus:ring-[#2457D6]/15";
const isCancel = (o) => o?.배차상태 === "배차취소" || ["취소", "배차취소", "오더취소", "취소됨"].includes(o?.상태);
const ymText = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;
const nextYm = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); };
const idOf = (o) => o?._id || o?.id;
const dayOf = (o) => Number(String(o?.상차일 || "").slice(8, 10)) || 0;

// ── 작은 시각화 ─────────────────────────────────────
function Donut({ pct, size = 112 }) {
  const r = 46; const c = 2 * Math.PI * r; const v = Math.max(0, Math.min(100, pct));
  const color = v >= 100 ? C.ok : C.blue;
  return (
    <svg width={size} height={size} viewBox="0 0 112 112" role="img" aria-label={`확인 완료 ${v}%`}>
      <circle cx="56" cy="56" r={r} fill="none" stroke={C.track} strokeWidth="11" />
      <circle cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} transform="rotate(-90 56 56)" style={{ transition: "stroke-dasharray .5s ease" }} />
      <text x="56" y="54" textAnchor="middle" fontSize="24" fontWeight="900" fill={C.ink} style={NUM}>{v}%</text>
      <text x="56" y="73" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.mute}>확인 끝</text>
    </svg>
  );
}
function DayBars({ ym, rows, issueIds, onPick, picked }) {
  const days = Number(monthEnd(ym).slice(8, 10));
  const cnt = Array.from({ length: days }, () => 0); const bad = Array.from({ length: days }, () => 0);
  rows.forEach((o) => { const d = dayOf(o); if (d >= 1 && d <= days) { cnt[d - 1] += 1; if (issueIds.has(idOf(o))) bad[d - 1] += 1; } });
  const max = Math.max(1, ...cnt); const W = days * 10; const H = 56;
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full h-[78px]" preserveAspectRatio="none" role="img" aria-label="날짜별 오더 수">
      <line x1="0" x2={W} y1={H} y2={H} stroke={C.line} strokeWidth="1" />
      {cnt.map((v, i) => { const h = v ? Math.max(3, (v / max) * (H - 6)) : 0; const on = picked === i + 1; return (
        <g key={i} onClick={() => v && onPick?.(on ? 0 : i + 1)} style={{ cursor: v ? "pointer" : "default" }}>
          <title>{`${i + 1}일 · ${v}건${bad[i] ? ` · 확인 필요 ${bad[i]}건` : ""}`}</title>
          <rect x={i * 10 + 1.5} y={0} width="7" height={H} fill="transparent" />
          {v > 0 && <rect x={i * 10 + 1.5} y={H - h} width="7" height={h} rx="2" fill={on ? C.ink : bad[i] ? "#F2B8B3" : "#B9C8E6"} />}
          {bad[i] > 0 && <circle cx={i * 10 + 5} cy={Math.max(3, H - h - 4)} r="2.2" fill={C.bad} />}
          {(i === 0 || (i + 1) % 5 === 0) && <text x={i * 10 + 5} y={H + 12} textAnchor="middle" fontSize="8" fill={C.mute}>{i + 1}</text>}
        </g>); })}
    </svg>
  );
}
function StatusBand({ counts, total }) {
  const parts = [["approved", "승인", C.ok], ["submitted", "검증 대기", C.warn], ["rejected", "반려", C.bad], ["none", "마감 전", "#C9D2E3"]];
  return (
    <div>
      <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: C.track }}>
        {parts.map(([k, , col]) => counts[k] ? <div key={k} style={{ width: `${(counts[k] / Math.max(1, total)) * 100}%`, background: col }} /> : null)}
      </div>
      <div className="mt-2 flex gap-x-3 gap-y-1 flex-wrap text-[12.5px] font-bold" style={NUM}>
        {parts.map(([k, l, col]) => <span key={k} style={{ color: k === "none" ? C.mute : col }}>{l} {counts[k]}</span>)}
      </div>
    </div>
  );
}
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
export default function MonthClose({ orders = [], company = "", me = null, staffName, isViewer = false, onPatch, onAdd, onRemove, onOpenOrder }) {
  // 🧩 2026-11-16 PC는 오더를 누르면 오더 복사/수정 패널(배차현황 · 미배차현황과 같은 창) · 휴대폰은 아래에서 올라오는 고치기 창
  const openRow = (o) => (onOpenOrder ? onOpenOrder(o) : setSheet({ row: o }));
  const phone = useNarrow(760);
  const desk = useArDesk(company);
  const [ym, setYm] = React.useState(() => kstYm(new Date(Date.now() + 9 * 3600e3).getUTCDate() > 20 ? 0 : -1));
  useLoadOrderRange(`${prevYmOf(ym)}-01`, monthEnd(ym));
  const [scope, setScope] = React.useState("mine"); // mine | staff | client | all
  const [staff, setStaff] = React.useState("");
  const [pickClient, setPickClient] = React.useState("");
  const [focus, setFocus] = React.useState(""); // 왼쪽 거래처 목록에서 고른 곳("" = 범위 전체)
  const [only, setOnly] = React.useState("all"); // all | need | 규칙 key
  const [day, setDay] = React.useState(0);
  const [q, setQ] = React.useState("");
  const [sheet, setSheet] = React.useState(null); // { row } | { isNew: true }
  const [delAsk, setDelAsk] = React.useState(""); // 표에서 바로 지우기 — 확인 중인 오더 id
  const [ask, setAsk] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState("");
  React.useEffect(() => { setFocus(""); setDay(0); }, [ym, scope, staff, pickClient]);
  React.useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(""), 3500); return () => clearTimeout(t); }, [toast]);

  const staffOf = React.useCallback((o) => (staffName ? staffName(o) : "") || "미지정", [staffName]);
  const month = React.useMemo(() => (orders || []).filter((o) => !isCancel(o) && o?.source !== "transport_transmit" && monthOf(o) === ym), [orders, ym]);
  const staffList = React.useMemo(() => { const m = new Map(); month.forEach((o) => { const s = staffOf(o); m.set(s, (m.get(s) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [month, staffOf]);
  const clientList = React.useMemo(() => { const m = new Map(); month.forEach((o) => { const c = String(o.거래처명 || "").trim() || "(거래처 없음)"; m.set(c, (m.get(c) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [month]);
  const mineOf = React.useCallback((o) => isMine(o, me) || (!!me?.name && staffOf(o) === me.name), [me, staffOf]);
  const scoped = React.useMemo(() => month.filter((o) =>
    scope === "mine" ? mineOf(o) : scope === "staff" ? (!staff || staffOf(o) === staff) : scope === "client" ? (!pickClient || (String(o.거래처명 || "").trim() || "(거래처 없음)") === pickClient) : true),
  [month, scope, staff, pickClient, mineOf, staffOf]);

  // 검사는 이번 달 전체로(다른 담당자 오더와 겹치는 중복도 잡는다) → 오더마다 걸린 항목
  const checks = React.useMemo(() => closeChecks(month), [month]);
  const issueMap = React.useMemo(() => { const m = new Map(); CLOSE_RULES.forEach((r) => (checks[r.key] || []).forEach((o) => { const id = idOf(o); const l = m.get(id) || []; l.push({ key: r.key, label: r.label, block: r.block }); m.set(id, l); })); return m; }, [checks]);
  const noClient = (o) => !String(o.거래처명 || "").trim();
  const issuesOfRow = React.useCallback((o) => { const l = [...(issueMap.get(idOf(o)) || [])]; if (noClient(o)) l.unshift({ key: "noClient", label: "거래처 빈칸", block: true }); return l; }, [issueMap]);
  const needIds = React.useMemo(() => new Set(scoped.filter((o) => issuesOfRow(o).length).map(idOf)), [scoped, issuesOfRow]);
  const blockIds = React.useMemo(() => new Set(scoped.filter((o) => issuesOfRow(o).some((x) => x.block)).map(idOf)), [scoped, issuesOfRow]);

  // 거래처 단위 마감 상태(마감은 거래처 전체 기준)
  const closeOf = React.useCallback((c, m) => desk.closes.get(`${c}|${m}`) || null, [desk.closes]);
  const board = React.useMemo(() => new Map(closeBoard(orders, ym, { closeOf, me }).map((r) => [r.client, r])), [orders, ym, closeOf, me]);
  const groups = React.useMemo(() => {
    const m = new Map();
    scoped.forEach((o) => { const c = String(o.거래처명 || "").trim() || "(거래처 없음)"; const g = m.get(c) || { client: c, count: 0, sale: 0, need: 0, block: 0 }; g.count += 1; g.sale += n(o.청구운임); if (needIds.has(idOf(o))) g.need += 1; if (blockIds.has(idOf(o))) g.block += 1; m.set(c, g); });
    return [...m.values()].map((g) => { const b = board.get(g.client); return { ...g, row: b || null, status: b?.status || "none", changed: !!b?.changed }; }).sort((a, b) => b.block - a.block || b.sale - a.sale);
  }, [scoped, needIds, blockIds, board]);
  const counts = React.useMemo(() => { const c = { none: 0, submitted: 0, rejected: 0, approved: 0 }; groups.forEach((g) => { c[g.status] += 1; }); return c; }, [groups]);
  const closable = groups.filter((g) => g.row && g.block === 0 && canSubmit({ ...g.row, block: (g.row.block || 0) }));
  const blockedGroups = groups.filter((g) => g.block > 0 && (g.status === "none" || g.status === "rejected"));

  const sale = scoped.reduce((a, o) => a + n(o.청구운임), 0);
  const buy = scoped.reduce((a, o) => a + n(o.기사운임), 0);
  const pct = scoped.length ? Math.round(((scoped.length - needIds.size) / scoped.length) * 100) : 100;
  const ruleCounts = React.useMemo(() => {
    const out = [{ key: "noClient", label: "거래처 빈칸", block: true, n: scoped.filter(noClient).length }];
    CLOSE_RULES.forEach((r) => { const ids = new Set((checks[r.key] || []).map(idOf)); out.push({ key: r.key, label: r.label, block: r.block, n: scoped.filter((o) => ids.has(idOf(o))).length }); });
    return out.filter((x) => x.n > 0);
  }, [scoped, checks]);

  const rows = React.useMemo(() => {
    const nq = q.replace(/\s/g, "").toLowerCase();
    return scoped.filter((o) => (!focus || (String(o.거래처명 || "").trim() || "(거래처 없음)") === focus)
      && (!day || dayOf(o) === day)
      && (only === "all" || (only === "need" ? needIds.has(idOf(o)) : issuesOfRow(o).some((x) => x.key === only)))
      && (!nq || [o.거래처명, o.상차지명, o.하차지명, o.차량번호, o.이름, o.화물내용].some((v) => String(v || "").replace(/\s/g, "").toLowerCase().includes(nq))))
      .sort((a, b) => String(a.상차일 || "").localeCompare(String(b.상차일 || "")) || String(a.거래처명 || "").localeCompare(String(b.거래처명 || ""), "ko"));
  }, [scoped, focus, day, only, q, needIds, issuesOfRow]);
  const [limit, setLimit] = React.useState(150);
  React.useEffect(() => { setLimit(150); }, [rows.length, focus, only, day]);

  const focusGroup = focus ? groups.find((g) => g.client === focus) : null;
  const submit = async () => {
    if (isViewer || busy || !closable.length) return;
    setBusy(true);
    try {
      for (const g of closable) await desk.save(g.row.doc?.id || arDeskId(desk.company, "close", g.client, ym), submitPatch(g.row, me));
      setToast(`${closable.length}곳을 1차 마감했어요. 경리팀 마감 검증으로 넘어갔어요.`); setAsk(false);
    } finally { setBusy(false); }
  };
  const unlock = async (g) => { if (isViewer || !g?.row) return; await desk.save(g.row.doc?.id || arDeskId(desk.company, "close", g.client, ym), unlockPatch(g.row, me, "월 마감에서 풀기")); setToast(`${g.client} 마감을 풀었어요.`); };

  const scopes = [["mine", "내 배차"], ["staff", "담당자별"], ["client", "거래처별"], ["all", "전체"]];
  const statusText = (g) => { const s = CLOSE_STATUS[g.status]; return <span className="text-[12.5px] font-black whitespace-nowrap" style={{ color: TONE[s.tone] }}>{g.changed ? "금액 바뀜 · 다시 마감" : s.label}</span>; };

  return (
    <div className="space-y-4 pb-24" style={{ color: C.ink }} data-kp="month-close">
      {/* 머리 */}
      <div className="flex items-end gap-x-5 gap-y-3 flex-wrap">
        <div className="min-w-0 mr-auto">
          <div className="text-[22px] font-black leading-tight">월 마감</div>
          <div className="text-[13.5px]" style={{ color: C.sub }}>이번 달 배차를 확인하고 1차 마감하면 경리팀 마감 검증으로 넘어가요.</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" className={`${btn} px-3`} aria-label="이전 달" onClick={() => setYm(prevYmOf(ym))}>‹</button>
          <div className="w-[118px] text-center text-[16px] font-black" style={NUM}>{ymText(ym)}</div>
          <button type="button" className={`${btn} px-3`} aria-label="다음 달" onClick={() => setYm(nextYm(ym))}>›</button>
        </div>
      </div>

      {/* 보기 고르기 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-2xl border border-[#D9E0EC] p-1 bg-white" role="tablist" aria-label="마감 범위">
          {scopes.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={scope === k} onClick={() => setScope(k)}
            className={`h-9 px-4 rounded-xl text-[14px] font-black transition ${scope === k ? "bg-[#14213D] text-white" : "text-[#5A6781] hover:text-[#14213D]"}`}>{l}</button>)}
        </div>
        {scope === "staff" && (
          <select id="mc-staff" value={staff} onChange={(e) => setStaff(e.target.value)} className={`${inp} w-auto min-w-[160px]`}>
            <option value="">담당자 전체</option>{staffList.map(([s, c]) => <option key={s} value={s}>{s} ({c})</option>)}
          </select>)}
        {scope === "client" && (
          <select id="mc-client" value={pickClient} onChange={(e) => setPickClient(e.target.value)} className={`${inp} w-auto min-w-[180px]`}>
            <option value="">거래처 전체</option>{clientList.map(([c, k]) => <option key={c} value={c}>{c} ({k})</option>)}
          </select>)}
        {scope === "mine" && <span className="text-[13px] font-bold" style={{ color: C.sub }}>{me?.name || "나"} 님이 등록 · 담당한 오더</span>}
      </div>

      {/* 한눈에 보기 */}
      <section className="rounded-[22px] border border-[#E1E6EF] bg-white p-4 sm:p-5 grid gap-5" style={{ gridTemplateColumns: phone ? "1fr" : "auto minmax(0,1fr) minmax(0,1.5fr) minmax(0,1fr)" }}>
        <div className="flex items-center gap-4">
          <Donut pct={pct} size={phone ? 96 : 112} />
          {phone && <div style={NUM}><div className="text-[13px] font-bold" style={{ color: C.sub }}>오더 {scoped.length.toLocaleString()}건</div><div className="text-[13px] font-black" style={{ color: needIds.size ? C.bad : C.ok }}>{needIds.size ? `확인 필요 ${needIds.size}건` : "모두 확인 끝"}</div></div>}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-1 gap-2 content-center" style={NUM}>
          {[["청구", sale], ["기사", buy], ["수수료", sale - buy]].map(([l, v]) => (
            <div key={l}><div className="text-[12px] font-bold" style={{ color: C.mute }}>{l}</div><div className="text-[17px] font-black whitespace-nowrap">{short(v)}<span className="text-[12px] font-bold ml-0.5" style={{ color: C.mute }}>원</span></div></div>))}
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline justify-between mb-1"><span className="text-[12.5px] font-black" style={{ color: C.sub }}>날짜별 오더</span>
            <span className="text-[12px]" style={{ color: C.mute }}>{day ? <button type="button" className="font-bold underline" onClick={() => setDay(0)}>{day}일만 보는 중 · 해제</button> : "막대를 누르면 그날만 · 빨간 점은 확인 필요"}</span></div>
          <DayBars ym={ym} rows={scoped} issueIds={needIds} onPick={setDay} picked={day} />
        </div>
        <div className="min-w-0 flex flex-col justify-center">
          <div className="text-[12.5px] font-black mb-2" style={{ color: C.sub }}>거래처 마감 상태 · {groups.length}곳</div>
          <StatusBand counts={counts} total={groups.length} />
        </div>
      </section>

      {/* 확인할 것 */}
      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="확인 항목으로 보기">
        {[{ key: "all", label: "전체", n: scoped.length, tone: C.ink }, { key: "need", label: "확인 필요", n: needIds.size, tone: needIds.size ? C.bad : C.ok }, ...ruleCounts.map((r) => ({ ...r, tone: r.block ? C.bad : C.warn }))].map((c) => (
          <button key={c.key} type="button" aria-pressed={only === c.key} onClick={() => setOnly(c.key)}
            className={`h-9 px-3.5 rounded-full border text-[13.5px] font-black transition ${only === c.key ? "border-[#14213D] bg-[#14213D] text-white" : "border-[#D9E0EC] bg-white hover:border-[#9FB0CC]"}`}
            style={only === c.key ? undefined : { color: c.tone }}>{c.label} <span style={NUM}>{c.n.toLocaleString()}</span></button>))}
        <div className="flex-1" />
        <input id="mc-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처 · 상하차지 · 차량 · 기사 찾기" className={inp} style={phone ? undefined : { width: 260 }} />
        {!isViewer && <button type="button" className={btn} onClick={() => setSheet({ isNew: true, row: { 거래처명: focus && focus !== "(거래처 없음)" ? focus : "" } })}>+ 오더 추가</button>}
      </div>

      <div className={phone ? "space-y-3" : "grid gap-4"} style={phone ? undefined : { gridTemplateColumns: "280px minmax(0,1fr)" }}>
        {/* 거래처 목록 */}
        {phone ? (
          <select id="mc-focus" value={focus} onChange={(e) => setFocus(e.target.value)} className={inp}>
            <option value="">거래처 전체 ({groups.length}곳)</option>
            {groups.map((g) => <option key={g.client} value={g.client}>{g.client} · {g.count}건{g.block ? ` · 고칠 것 ${g.block}` : ""} · {g.changed ? "금액 바뀜" : CLOSE_STATUS[g.status].label}</option>)}
          </select>
        ) : (
          <aside className="rounded-[20px] border border-[#E1E6EF] bg-white overflow-hidden self-start sticky top-2">
            <button type="button" onClick={() => setFocus("")} className={`w-full px-4 py-3 flex items-center gap-2 text-left border-b border-[#E1E6EF] ${!focus ? "bg-[#F3F6FC]" : ""}`}>
              <span className="flex-1 font-black text-[14px]">전체 거래처</span><span className="text-[13px] font-bold" style={{ ...NUM, color: C.sub }}>{groups.length}곳</span>
            </button>
            <div className="max-h-[560px] overflow-y-auto">
              {groups.map((g) => (
                <button key={g.client} type="button" onClick={() => setFocus(g.client === focus ? "" : g.client)} className={`w-full px-4 py-2.5 text-left border-b border-[#EEF1F6] last:border-b-0 ${focus === g.client ? "bg-[#F3F6FC]" : "hover:bg-[#FAFBFD]"}`}>
                  <div className="flex items-center gap-2"><span className="flex-1 min-w-0 truncate text-[14px] font-black">{g.client}</span>{statusText(g)}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[12.5px]" style={NUM}>
                    <span style={{ color: C.sub }}>{g.count}건 · {short(g.sale)}원</span>
                    {g.block > 0 ? <span className="font-black" style={{ color: C.bad }}>고칠 것 {g.block}</span> : g.need > 0 ? <span className="font-black" style={{ color: C.warn }}>확인 {g.need}</span> : null}
                  </div>
                </button>))}
              {!groups.length && <div className="px-4 py-8 text-center text-[13px]" style={{ color: C.mute }}>이 범위에 오더가 없어요</div>}
            </div>
          </aside>
        )}

        {/* 오더 */}
        <section className="min-w-0 rounded-[20px] border border-[#E1E6EF] bg-white overflow-hidden">
          {focusGroup && (
            <div className="px-4 py-3 border-b border-[#E1E6EF] flex items-center gap-3 flex-wrap">
              <span className="text-[15px] font-black">{focusGroup.client}</span>{statusText(focusGroup)}
              {focusGroup.status === "rejected" && focusGroup.row?.doc?.reason && <span className="text-[13px] font-bold" style={{ color: C.bad }}>반려 사유 · {focusGroup.row.doc.reason}</span>}
              {focusGroup.status === "submitted" && !isViewer && <button type="button" className="ml-auto text-[13px] font-bold underline underline-offset-4" style={{ color: C.sub }} onClick={() => unlock(focusGroup)}>마감 풀기</button>}
            </div>)}
          {rows.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-[15px] font-black">{scoped.length ? "조건에 맞는 오더가 없어요" : `${ymText(ym)}에 ${scope === "mine" ? "내가 한 " : ""}오더가 없어요`}</div>
              <div className="text-[13px] mt-1" style={{ color: C.mute }}>{scope === "mine" ? "보기를 ‘담당자별’이나 ‘전체’로 바꿔 보세요." : "위에서 범위나 확인 항목을 바꿔 보세요."}</div>
            </div>
          ) : phone ? (
            <div>
              {rows.slice(0, limit).map((o) => { const is = issuesOfRow(o); return (
                <button key={idOf(o)} type="button" onClick={() => openRow(o)} className="w-full text-left px-4 py-3 border-b border-[#EEF1F6] last:border-b-0" style={{ boxShadow: is.some((x) => x.block) ? `inset 3px 0 0 ${C.bad}` : is.length ? `inset 3px 0 0 ${C.warn}` : undefined }}>
                  <div className="flex items-center gap-2 text-[12.5px]" style={{ ...NUM, color: C.mute }}><span>{String(o.상차일 || "").slice(5)}</span><span className="truncate font-bold" style={{ color: C.sub }}>{o.거래처명 || "거래처 없음"}</span><span className="ml-auto font-black text-[14px]" style={{ color: n(o.청구운임) ? C.ink : C.bad }}>{n(o.청구운임) ? won(n(o.청구운임)) : "청구 0"}</span></div>
                  <div className="mt-0.5 text-[14.5px] font-black truncate">{o.상차지명 || "-"} → {o.하차지명 || "-"}</div>
                  <div className="mt-0.5 flex items-center gap-2"><span className="text-[12.5px] truncate" style={{ color: C.sub }}>{o.차량번호 || "차량 없음"} {o.이름 || ""}</span><span className="ml-auto"><IssueText list={is} /></span></div>
                </button>); })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="kp-plain w-full min-w-[860px]" style={NUM}>
                <thead><tr className="text-[12.5px]" style={{ color: C.mute }}>
                  {["상차일", "거래처", "구간", "차량 · 기사", "청구", "기사", "확인", ""].map((h, i) => <th key={h} className={`px-3 py-2.5 font-bold border-b border-[#E1E6EF] ${i >= 4 && i <= 5 ? "text-right" : "text-left"}`}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {rows.slice(0, limit).map((o) => { const is = issuesOfRow(o); return (
                    <tr key={idOf(o)} onClick={() => openRow(o)} className="cursor-pointer border-b border-[#EEF1F6] last:border-b-0" style={{ boxShadow: is.some((x) => x.block) ? `inset 3px 0 0 ${C.bad}` : is.length ? `inset 3px 0 0 ${C.warn}` : undefined }} title="눌러서 고치기">
                      <td className="px-3 py-2.5 text-[13.5px] whitespace-nowrap">{String(o.상차일 || "").slice(5)}</td>
                      <td className="px-3 py-2.5 text-[13.5px] font-bold max-w-[160px] truncate">{o.거래처명 || <span style={{ color: C.bad }}>빈칸</span>}</td>
                      <td className="px-3 py-2.5 text-[13.5px] max-w-[280px] truncate">{o.상차지명 || "-"} <span style={{ color: C.mute }}>→</span> {o.하차지명 || "-"}</td>
                      <td className="px-3 py-2.5 text-[13px] whitespace-nowrap" style={{ color: C.sub }}>{o.차량번호 || <span style={{ color: C.bad }}>차량 없음</span>} {o.이름 || ""}</td>
                      <td className="px-3 py-2.5 text-[13.5px] font-black text-right whitespace-nowrap" style={{ color: n(o.청구운임) ? C.ink : C.bad }}>{won(n(o.청구운임))}</td>
                      <td className="px-3 py-2.5 text-[13.5px] text-right whitespace-nowrap" style={{ color: n(o.기사운임) ? C.sub : C.warn }}>{won(n(o.기사운임))}</td>
                      <td className="px-3 py-2.5"><IssueText list={is} /></td>
                      <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        {!isViewer && (delAsk === idOf(o)
                          ? <span className="inline-flex gap-1"><button type="button" className="h-8 px-2.5 rounded-lg text-[12.5px] font-black text-white" style={{ background: C.bad }} onClick={async () => { setDelAsk(""); await onRemove?.(o); setToast("오더를 지웠어요."); }}>지우기</button><button type="button" className="h-8 px-2 rounded-lg text-[12.5px] font-bold" style={{ color: C.sub }} onClick={() => setDelAsk("")}>취소</button></span>
                          : <button type="button" aria-label="오더 삭제" title="삭제" className="w-8 h-8 rounded-lg text-[#8D97AB] hover:text-[#C62F25]" onClick={() => setDelAsk(idOf(o))}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>)}
                      </td>
                    </tr>); })}
                </tbody>
              </table>
            </div>)}
          {rows.length > limit && <div className="p-3 text-center border-t border-[#EEF1F6]"><button type="button" className={btn} onClick={() => setLimit((l) => l + 300)}>더 보기 ({(rows.length - limit).toLocaleString()}건 남음)</button></div>}
        </section>
      </div>

      {/* 아래 마감 줄 */}
      {!isViewer && (
        <div className="fixed bottom-0 left-0 right-0 z-[60] pointer-events-none" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="mx-auto max-w-[1100px] px-3 pb-3 pointer-events-auto">
            <div className="rounded-2xl bg-white border border-[#D9E0EC] shadow-[0_12px_36px_rgba(14,22,40,.16)] px-4 py-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0 text-[13.5px]" style={NUM}>
                <b>{scopes.find(([k]) => k === scope)[1]}</b> · 거래처 {groups.length}곳 · 오더 {scoped.length.toLocaleString()}건
                {blockIds.size > 0 ? <span className="ml-2 font-black" style={{ color: C.bad }}>고칠 것 {blockIds.size}건</span> : <span className="ml-2 font-black" style={{ color: C.ok }}>고칠 것 없음</span>}
              </div>
              <button type="button" className={btnPri} disabled={!closable.length || busy} onClick={() => setAsk(true)}>{closable.length ? `1차 마감 · ${closable.length}곳` : counts.submitted + counts.approved === groups.length && groups.length ? "모두 마감했어요" : "마감할 곳 없음"}</button>
            </div>
          </div>
        </div>)}

      {toast && <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[100060] px-4 py-2.5 rounded-xl bg-[#14213D] text-white text-[13.5px] font-bold shadow-lg" role="status">{toast}</div>}

      {ask && createPortal(
        <div className="fixed inset-0 z-[100050] flex items-center justify-center p-4" style={{ background: "rgba(14,22,40,.42)" }} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setAsk(false); }}>
          <div className="w-full max-w-[520px] rounded-[22px] bg-white p-5 max-h-[86vh] flex flex-col" role="dialog" aria-label="1차 마감">
            <div className="text-[18px] font-black">{ymText(ym)} 1차 마감</div>
            <div className="text-[13.5px] mt-1" style={{ color: C.sub }}>아래 거래처가 경리팀 마감 검증으로 넘어가요. 마감은 거래처 단위예요.</div>
            <div className="mt-3 flex-1 overflow-y-auto rounded-xl border border-[#E1E6EF]">
              {closable.map((g) => <div key={g.client} className="px-3 py-2 flex items-center gap-2 border-b border-[#EEF1F6] last:border-b-0 text-[14px]" style={NUM}><span className="flex-1 truncate font-bold">{g.client}</span><span style={{ color: C.sub }}>{(g.row?.count ?? g.count)}건 · {won(g.row?.sale ?? g.sale)}원</span></div>)}
            </div>
            {blockedGroups.length > 0 && <div className="mt-3 text-[13px] font-bold" style={{ color: C.bad }}>고칠 것이 있어 빠지는 곳 {blockedGroups.length}곳 — {blockedGroups.slice(0, 4).map((g) => g.client).join(", ")}{blockedGroups.length > 4 ? " 외" : ""}</div>}
            <div className="mt-4 flex justify-end gap-2"><button type="button" className={btn} disabled={busy} onClick={() => setAsk(false)}>취소</button><button type="button" className={btnPri} disabled={busy} onClick={submit}>{busy ? "넘기는 중…" : `${closable.length}곳 1차 마감`}</button></div>
          </div>
        </div>, document.body)}

      <OrderSheet open={!!sheet} row={sheet?.row} isNew={!!sheet?.isNew} ym={ym} phone={phone} isViewer={isViewer}
        clients={clientList.map(([c]) => c).filter((c) => c !== "(거래처 없음)")} issues={sheet?.row && !sheet.isNew ? issuesOfRow(sheet.row) : []}
        onClose={() => setSheet(null)}
        onSave={async (patch) => { if (sheet?.isNew) { const r = await onAdd?.({ ...patch }); if (r !== false) setToast("오더를 추가했어요."); return r; } const r = await onPatch?.(sheet.row, patch); if (r !== false) setToast("저장했어요."); return r; }}
        onDelete={async () => { await onRemove?.(sheet.row); setToast("오더를 지웠어요."); }} />
    </div>
  );
}
