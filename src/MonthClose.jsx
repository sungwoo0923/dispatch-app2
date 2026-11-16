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
import { CLOSE_RULES, CLOSE_STATUS, closeBoard, closeChecks, isMine, canSubmit, canVerify, verifyPatch, submitPatch, unlockPatch, prevYmOf } from "./closeFlow";
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
//  ✅ 2026-11-16 리디자인 3 — 거래처 하나씩 "검토 → 검증 완료 → 1차 마감" (원터치)
//   위: 디지털 진행판(검증 전 → 검증 완료 → 1차 마감 → 경리 승인) · 거래처마다 한 칸씩 상태 띠
//   왼쪽: 거래처 목록(상태 · 고칠 것) / 오른쪽: 고른 거래처 검토(오더 · 확인할 것 · 큰 버튼 하나)
const DIG = "'JetBrains Mono','SFMono-Regular',Menlo,Consolas,'Noto Sans KR',monospace";
const DK = { bg: "linear-gradient(135deg,#0A1224 0%,#13213E 55%,#1B3260 100%)", line: "rgba(143,176,240,.18)", sub: "#9FB2D6", mute: "#6F83A8", hi: "#8FB0F0", ok: "#4ADE80", warn: "#F7B955", bad: "#FF8A80" };
const ST = { // 상태 → 색 · 이름 · 순서(할 일 먼저)
  rejected: { label: "반려 · 다시 검증", c: C.bad, dk: DK.bad, ord: 0 },
  none: { label: "검증 전", c: C.mute, dk: "#7A8DB3", ord: 1 },
  verified: { label: "검증 완료", c: C.blue, dk: DK.hi, ord: 2 },
  submitted: { label: "1차 마감", c: C.warn, dk: DK.warn, ord: 3 },
  approved: { label: "경리 승인", c: C.ok, dk: DK.ok, ord: 4 },
};
const stOf = (g) => (g.changed && g.status !== "none" ? { ...ST.none, label: "바뀜 · 다시 검증", c: C.bad, dk: DK.bad, ord: 0 } : ST[g.status] || ST.none);
const StatusDot = ({ g, size = 10 }) => { const s = stOf(g); const done = g.status === "approved" || g.status === "submitted" || g.status === "verified"; return (
  <span className="inline-grid place-items-center rounded-full shrink-0" style={{ width: size + 8, height: size + 8, border: `2px solid ${s.c}`, background: done && !g.changed ? s.c : "transparent" }}>
    {done && !g.changed && <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>}
  </span>); };

export default function MonthClose({ orders = [], company = "", me = null, staffName, isViewer = false, onPatch, onAdd, onRemove, onOpenOrder }) {
  const phone = useNarrow(860);
  const desk = useArDesk(company);
  const [ym, setYm] = React.useState(() => kstYm(new Date(Date.now() + 9 * 3600e3).getUTCDate() > 20 ? 0 : -1));
  useLoadOrderRange(`${prevYmOf(ym)}-01`, monthEnd(ym));
  const [scope, setScope] = React.useState("mine"); // mine | staff | all
  const [staff, setStaff] = React.useState("");
  const [listTab, setListTab] = React.useState("todo"); // todo | verified | closed | all
  const [cq, setCq] = React.useState("");
  const [sel, setSel] = React.useState("");
  const [only, setOnly] = React.useState("all");
  const [sheet, setSheet] = React.useState(null);
  const [delAsk, setDelAsk] = React.useState("");
  const [ask, setAsk] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [toast, setToast] = React.useState("");
  const panelRef = React.useRef(null);
  React.useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(""), 3200); return () => clearTimeout(t); }, [toast]);
  React.useEffect(() => { setOnly("all"); }, [sel]);
  const openRow = (o) => (onOpenOrder && !phone ? onOpenOrder(o) : setSheet({ row: o }));

  const staffOf = React.useCallback((o) => (staffName ? staffName(o) : "") || "미지정", [staffName]);
  const month = React.useMemo(() => (orders || []).filter((o) => !isCancel(o) && o?.source !== "transport_transmit" && monthOf(o) === ym), [orders, ym]);
  const staffList = React.useMemo(() => { const m = new Map(); month.forEach((o) => { const s = staffOf(o); m.set(s, (m.get(s) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [month, staffOf]);
  const mineOf = React.useCallback((o) => isMine(o, me) || (!!me?.name && staffOf(o) === me.name), [me, staffOf]);
  const scoped = React.useMemo(() => month.filter((o) => (scope === "mine" ? mineOf(o) : scope === "staff" ? (!staff || staffOf(o) === staff) : true)), [month, scope, staff, mineOf, staffOf]);

  // 검사는 이번 달 전체로(다른 담당자 오더와 겹치는 중복도 잡는다)
  const checks = React.useMemo(() => closeChecks(month), [month]);
  const issueMap = React.useMemo(() => { const m = new Map(); CLOSE_RULES.forEach((r) => (checks[r.key] || []).forEach((o) => { const id = idOf(o); const l = m.get(id) || []; l.push({ key: r.key, label: r.label, block: r.block }); m.set(id, l); })); return m; }, [checks]);
  const issuesOfRow = React.useCallback((o) => { const l = [...(issueMap.get(idOf(o)) || [])]; if (!String(o.거래처명 || "").trim()) l.unshift({ key: "noClient", label: "거래처 빈칸", block: true }); return l; }, [issueMap]);

  // 거래처 단위(검증 · 마감은 거래처 전체 기준)
  const closeOf = React.useCallback((c, m) => desk.closes.get(`${c}|${m}`) || null, [desk.closes]);
  const board = React.useMemo(() => new Map(closeBoard(orders, ym, { closeOf, me }).map((r) => [r.client, r])), [orders, ym, closeOf, me]);
  const groups = React.useMemo(() => {
    const m = new Map();
    scoped.forEach((o) => { const c = String(o.거래처명 || "").trim() || "(거래처 없음)"; const g = m.get(c) || { client: c, rows: [], sale: 0, buy: 0, block: 0, warn: 0 }; g.rows.push(o); g.sale += n(o.청구운임); g.buy += n(o.기사운임); const is = issuesOfRow(o); if (is.some((x) => x.block)) g.block += 1; else if (is.length) g.warn += 1; m.set(c, g); });
    return [...m.values()].map((g) => { const b = board.get(g.client); return { ...g, count: g.rows.length, row: b || null, status: b?.status || "none", changed: !!b?.changed, owners: [...new Set(g.rows.map(staffOf))].slice(0, 2).join(", ") }; })
      .sort((a, b) => stOf(a).ord - stOf(b).ord || b.block - a.block || b.sale - a.sale);
  }, [scoped, board, issuesOfRow, staffOf]);
  const cnt = React.useMemo(() => { const c = { none: 0, verified: 0, submitted: 0, approved: 0, rejected: 0, changed: 0 }; groups.forEach((g) => { if (g.changed && g.status !== "none") c.changed += 1; else c[g.status] += 1; }); return c; }, [groups]);
  const todoN = cnt.none + cnt.rejected + cnt.changed;
  const readyGroups = groups.filter((g) => g.row && canSubmit({ ...g.row, block: g.block }));
  const blockTotal = groups.reduce((a, g) => a + g.block, 0);
  const sale = scoped.reduce((a, o) => a + n(o.청구운임), 0);

  const listed = groups.filter((g) => {
    const s = g.changed && g.status !== "none" ? "todo" : g.status === "verified" ? "verified" : g.status === "submitted" || g.status === "approved" ? "closed" : "todo";
    return (listTab === "all" || s === listTab) && (!cq || g.client.replace(/\s/g, "").toLowerCase().includes(cq.replace(/\s/g, "").toLowerCase()));
  });
  // 고른 거래처 — 없으면 할 일이 있는 첫 곳
  const cur = groups.find((g) => g.client === sel) || listed[0] || groups[0] || null;
  React.useEffect(() => { if (cur && cur.client !== sel) setSel(cur.client); }, [cur?.client]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (c) => { setSel(c); if (phone) setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); };

  const curRows = React.useMemo(() => {
    if (!cur) return [];
    const r = cur.rows.map((o) => ({ o, is: issuesOfRow(o) }));
    return r.filter(({ is }) => only === "all" || (only === "need" ? is.length : is.some((x) => x.key === only)))
      .sort((a, b) => (b.is.some((x) => x.block) - a.is.some((x) => x.block)) || (b.is.length - a.is.length) || String(a.o.상차일 || "").localeCompare(String(b.o.상차일 || "")));
  }, [cur, only, issuesOfRow]);
  const curRule = React.useMemo(() => {
    if (!cur) return [];
    const c = new Map(); cur.rows.forEach((o) => issuesOfRow(o).forEach((x) => { const v = c.get(x.key) || { ...x, n: 0 }; v.n += 1; c.set(x.key, v); }));
    return [...c.values()].sort((a, b) => b.block - a.block || b.n - a.n);
  }, [cur, issuesOfRow]);

  const save = (g, patch) => desk.save(g.row.doc?.id || arDeskId(desk.company, "close", g.client, ym), patch);
  const verify = async (g) => { if (isViewer || busy || !g?.row) return; setBusy("v"); try { await save(g, verifyPatch({ ...g.row, block: g.block }, me)); setToast(`${g.client} 검증 완료 — 이제 1차 마감할 수 있어요`); const nx = groups.find((x) => x.client !== g.client && (x.status === "none" || x.status === "rejected" || x.changed)); if (nx) setTimeout(() => setSel(nx.client), 400); } finally { setBusy(""); } };
  const submitOne = async (g) => { if (isViewer || busy || !g?.row) return; setBusy("s"); try { await save(g, submitPatch(g.row, me)); setToast(`${g.client} 1차 마감 — 경리팀으로 넘어갔어요`); } finally { setBusy(""); } };
  const unlock = async (g) => { if (isViewer || busy || !g?.row) return; setBusy("u"); try { await save(g, unlockPatch(g.row, me, "월 마감에서")); setToast(g.status === "verified" ? "검증을 취소했어요" : "마감을 풀었어요"); } finally { setBusy(""); } };
  const submitAll = async () => { if (isViewer || busy || !readyGroups.length) return; setBusy("all"); try { for (const g of readyGroups) await save(g, submitPatch(g.row, me)); setToast(`${readyGroups.length}곳 1차 마감 — 경리팀으로 넘어갔어요`); setAsk(false); } finally { setBusy(""); } };

  const scopes = [["mine", "내 배차"], ["staff", "담당자별"], ["all", "전체"]];
  const pipe = [
    { k: "todo", label: "검증 전", v: todoN, c: todoN ? "#C9D5EE" : DK.mute, sub: cnt.rejected + cnt.changed ? `반려 · 바뀜 ${cnt.rejected + cnt.changed}` : "거래처를 열어 확인" },
    { k: "verified", label: "검증 완료", v: cnt.verified, c: DK.hi, sub: cnt.verified ? "1차 마감 대기" : "검토 끝난 곳" },
    { k: "closed", label: "1차 마감", v: cnt.submitted, c: DK.warn, sub: "경리팀 검증 중" },
    { k: "done", label: "경리 승인", v: cnt.approved, c: DK.ok, sub: "마감 끝" },
  ];
  const nextStep = todoN ? 0 : cnt.verified ? 1 : cnt.submitted ? 2 : 3;
  const allDone = groups.length > 0 && cnt.approved === groups.length;

  // 큰 버튼 하나 — 상태마다 할 일
  const primary = !cur || !cur.row ? null
    : cur.block > 0 && cur.status !== "submitted" && cur.status !== "approved" ? { text: `고칠 것 ${cur.block}건을 먼저 고쳐 주세요`, disabled: true, tone: "bad" }
    : canVerify({ ...cur.row, block: cur.block }) ? { text: cur.changed ? "바뀐 내용 다시 검증 완료" : "검증 완료", on: () => verify(cur), tone: "blue" }
    : canSubmit({ ...cur.row, block: cur.block }) ? { text: "1차 마감하기", on: () => submitOne(cur), tone: "ink", sub: { text: "검증 취소", on: () => unlock(cur) } }
    : cur.status === "submitted" ? { text: "경리팀 검증 중", disabled: true, tone: "warn", sub: { text: "마감 풀기", on: () => unlock(cur) } }
    : cur.status === "approved" ? { text: "경리 승인 · 마감 끝", disabled: true, tone: "ok" } : null;
  const pTone = { blue: { bg: C.blue, fg: "#fff" }, ink: { bg: "#0A1224", fg: "#fff" }, bad: { bg: "#FDECEA", fg: C.bad }, warn: { bg: "#FFF4E0", fg: C.warn }, ok: { bg: "#E6F6EE", fg: C.ok } };

  return (
    <div className="space-y-4" style={{ color: C.ink }} data-kp="month-close">
      {/* ── 디지털 진행판 ── */}
      <section className="rounded-[24px] text-white overflow-hidden shadow-[0_18px_40px_rgba(10,18,36,.28)]" style={{ background: DK.bg }}>
        <div className="px-4 sm:px-6 pt-5 pb-4 flex items-center gap-x-4 gap-y-3 flex-wrap">
          <div className="mr-auto min-w-0">
            <div className="text-[11px] font-extrabold tracking-[0.3em]" style={{ color: DK.hi, fontFamily: DIG }}>MONTH CLOSE · {ym.replace("-", ".")}</div>
            <div className="text-[22px] sm:text-[26px] font-black leading-tight">{Number(ym.slice(5))}월 마감</div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="이전 달" onClick={() => setYm(prevYmOf(ym))} className="w-9 h-9 rounded-xl border text-[16px]" style={{ borderColor: DK.line }}>‹</button>
            <span className="w-[86px] text-center text-[15px] font-black" style={{ fontFamily: DIG }}>{ym.replace("-", ".")}</span>
            <button type="button" aria-label="다음 달" onClick={() => setYm(nextYm(ym))} className="w-9 h-9 rounded-xl border text-[16px]" style={{ borderColor: DK.line }}>›</button>
          </div>
          <div className="inline-flex rounded-xl p-1" style={{ background: "rgba(255,255,255,.06)", border: `1px solid ${DK.line}` }} role="tablist" aria-label="범위">
            {scopes.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={scope === k} onClick={() => setScope(k)} className="h-8 px-3.5 rounded-lg text-[13px] font-black" style={scope === k ? { background: "#fff", color: "#0A1224" } : { color: DK.sub }}>{l}</button>)}
          </div>
          {scope === "staff" && (
            <select id="mc-staff" value={staff} onChange={(e) => setStaff(e.target.value)} className="h-10 rounded-xl px-3 text-[13.5px] font-bold text-[#0A1224]">
              <option value="">담당자 전체</option>{staffList.map(([s2, c2]) => <option key={s2} value={s2}>{s2} ({c2})</option>)}
            </select>)}
        </div>

        {/* 단계 4칸 */}
        <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {pipe.map((p, i) => (
            <div key={p.k} className="relative rounded-2xl px-4 py-3" style={{ background: i === nextStep && !allDone ? "rgba(143,176,240,.14)" : "rgba(255,255,255,.04)", border: `1px solid ${i === nextStep && !allDone ? "rgba(143,176,240,.55)" : DK.line}` }}>
              <div className="flex items-center gap-2 text-[11.5px] font-extrabold tracking-[0.12em]" style={{ color: DK.sub }}>
                <span style={{ fontFamily: DIG, color: p.c }}>0{i + 1}</span>{p.label}
                {i === nextStep && !allDone && <span className="ml-auto text-[10.5px] font-black px-2 py-0.5 rounded-full" style={{ background: DK.hi, color: "#0A1224" }}>지금</span>}
              </div>
              <div className="mt-1 flex items-baseline gap-1"><span className="text-[34px] sm:text-[40px] font-black leading-none" style={{ fontFamily: DIG, color: p.v ? p.c : DK.mute }}>{String(p.v).padStart(2, "0")}</span><span className="text-[13px] font-bold" style={{ color: DK.sub }}>곳</span></div>
              <div className="mt-1 text-[12px] font-bold truncate" style={{ color: DK.mute }}>{p.sub}</div>
              {i < 3 && !phone && <span className="absolute -right-[11px] top-1/2 -translate-y-1/2 z-10 text-[14px]" style={{ color: DK.mute }}>›</span>}
            </div>))}
        </div>

        {/* 거래처마다 한 칸 — 상태 띠 + 합계 + 한꺼번에 1차 마감 */}
        <div className="px-4 sm:px-6 pt-4 pb-5">
          <div className="flex gap-[3px] h-3" title="거래처마다 한 칸 — 눌러서 열기">
            {groups.map((g) => <button key={g.client} type="button" aria-label={`${g.client} · ${stOf(g).label}`} title={`${g.client} · ${stOf(g).label}`} onClick={() => pick(g.client)} className="flex-1 min-w-[3px] rounded-[3px]" style={{ background: stOf(g).dk, opacity: g.status === "none" && !g.changed ? 0.35 : 1, outline: cur?.client === g.client ? "2px solid #fff" : "none", outlineOffset: 1 }} />)}
            {!groups.length && <div className="flex-1 rounded-[3px]" style={{ background: "rgba(255,255,255,.08)" }} />}
          </div>
          <div className="mt-3 flex items-center gap-x-5 gap-y-2 flex-wrap text-[13px] font-bold" style={{ color: DK.sub, fontFamily: DIG }}>
            <span>거래처 <b className="text-white">{groups.length}</b></span>
            <span>오더 <b className="text-white">{scoped.length.toLocaleString()}</b></span>
            <span>청구 <b className="text-white">{won(sale)}</b></span>
            <span>고칠 것 <b style={{ color: blockTotal ? DK.bad : DK.ok }}>{blockTotal.toLocaleString()}</b></span>
            {!isViewer && <button type="button" disabled={!readyGroups.length || !!busy} onClick={() => setAsk(true)} className="ml-auto h-11 px-5 rounded-xl text-[14px] font-black disabled:opacity-30" style={{ background: readyGroups.length ? "#fff" : "rgba(255,255,255,.12)", color: "#0A1224", fontFamily: "inherit" }}>
              {allDone ? "모두 마감했어요" : readyGroups.length ? `검증 완료 ${readyGroups.length}곳 한 번에 1차 마감` : "검증 완료한 곳이 생기면 1차 마감"}
            </button>}
          </div>
        </div>
      </section>

      {/* ── 거래처 목록 | 검토 ── */}
      <div className={phone ? "space-y-3" : "grid gap-4 items-start"} style={phone ? undefined : { gridTemplateColumns: "330px minmax(0,1fr)" }}>
        <aside className={`rounded-[20px] border border-[#E1E6EF] bg-white overflow-hidden ${phone ? "" : "sticky top-2"}`}>
          <div className="p-3 border-b border-[#E1E6EF] space-y-2">
            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#F3F6FB]">
              {[["todo", "검증 전", todoN], ["verified", "검증 완료", cnt.verified], ["closed", "마감", cnt.submitted + cnt.approved], ["all", "전체", groups.length]].map(([k, l, v]) => (
                <button key={k} type="button" onClick={() => setListTab(k)} className={`h-9 rounded-lg text-[12.5px] font-black ${listTab === k ? "bg-white shadow-sm text-[#0A1224]" : "text-[#7A879C]"}`}>{l} <span style={{ fontFamily: DIG }}>{v}</span></button>))}
            </div>
            <input id="mc-cq" value={cq} onChange={(e) => setCq(e.target.value)} placeholder="거래처 찾기" className={inp} />
          </div>
          <div className={phone ? "max-h-[320px] overflow-y-auto" : "max-h-[calc(100vh-330px)] min-h-[300px] overflow-y-auto"}>
            {listed.map((g) => { const s = stOf(g); const on = cur?.client === g.client; return (
              <button key={g.client} type="button" onClick={() => pick(g.client)} className={`w-full px-3.5 py-3 flex items-center gap-3 text-left border-b border-[#EEF1F6] last:border-b-0 transition ${on ? "bg-[#EEF3FF]" : "hover:bg-[#F8FAFD]"}`} style={on ? { boxShadow: `inset 3px 0 0 ${C.blue}` } : undefined}>
                <StatusDot g={g} />
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-[14.5px] font-black">{g.client}</span>
                  <span className="block text-[12px] mt-0.5" style={{ ...NUM, color: C.sub }}>{g.count}건 · {short(g.sale)}원{g.block ? <b className="ml-1.5" style={{ color: C.bad }}>고칠 것 {g.block}</b> : g.warn ? <b className="ml-1.5" style={{ color: C.warn }}>확인 {g.warn}</b> : null}</span>
                </span>
                <span className="text-[12px] font-black whitespace-nowrap" style={{ color: s.c }}>{s.label}</span>
              </button>); })}
            {!listed.length && <div className="px-4 py-10 text-center text-[13.5px]" style={{ color: C.mute }}>{groups.length ? "이 칸에 해당하는 거래처가 없어요" : scope === "mine" ? "이번 달 내 배차가 없어요 — 위에서 ‘전체’로 바꿔 보세요" : "이번 달 오더가 없어요"}</div>}
          </div>
        </aside>

        {/* 검토 */}
        <section ref={panelRef} className="min-w-0 rounded-[20px] border border-[#E1E6EF] bg-white overflow-hidden flex flex-col scroll-mt-3" data-kp="mc-review">
          {!cur ? <div className="py-20 text-center text-[14px]" style={{ color: C.mute }}>거래처를 고르면 여기서 검토해요</div> : (<>
            <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-[#E1E6EF]">
              <div className="flex items-center gap-2.5 flex-wrap">
                <StatusDot g={cur} size={12} />
                <h3 className="text-[20px] font-black min-w-0 truncate">{cur.client}</h3>
                <span className="text-[12.5px] font-black px-2.5 py-1 rounded-full" style={{ color: stOf(cur).c, background: `${stOf(cur).c}14` }}>{stOf(cur).label}</span>
                {cur.owners && <span className="text-[12.5px] font-bold" style={{ color: C.mute }}>담당 {cur.owners}</span>}
                {!isViewer && <button type="button" className="ml-auto h-9 px-3 rounded-lg border border-[#D9E0EC] text-[13px] font-bold" onClick={() => setSheet({ isNew: true, row: { 거래처명: cur.client === "(거래처 없음)" ? "" : cur.client } })}>+ 오더 추가</button>}
              </div>
              {cur.status === "rejected" && cur.row?.doc?.reason && <div className="mt-2 text-[13.5px] font-bold" style={{ color: C.bad }}>반려 사유 · {cur.row.doc.reason}</div>}
              {cur.changed && cur.status !== "none" && <div className="mt-2 text-[13.5px] font-bold" style={{ color: C.bad }}>{cur.status === "verified" ? "검증" : "마감"} 뒤에 오더가 바뀌었어요({cur.row?.doc?.snapshot?.count}건 → {cur.row?.count}건). 다시 검증해 주세요.</div>}
              <div className={`mt-3 grid ${phone ? "grid-cols-2" : "grid-cols-4"} gap-2`} style={NUM}>
                {[["오더", `${cur.count}건`], ["청구", won(cur.sale)], ["기사", won(cur.buy)], ["수수료", won(cur.sale - cur.buy)]].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-[#F6F8FB] px-3 py-2 min-w-0"><div className="text-[11.5px] font-bold" style={{ color: C.mute }}>{l}</div><div className="text-[15px] sm:text-[17px] font-black truncate" style={{ fontFamily: DIG }}>{v}</div></div>))}
              </div>
              <div className="mt-3 flex gap-1.5 flex-wrap">
                <button type="button" onClick={() => setOnly("all")} className={`h-8 px-3 rounded-full border text-[12.5px] font-black ${only === "all" ? "bg-[#0A1224] border-[#0A1224] text-white" : "border-[#D9E0EC]"}`}>전체 {cur.count}</button>
                {curRule.length ? curRule.map((r) => <button key={r.key} type="button" onClick={() => setOnly(only === r.key ? "all" : r.key)} className={`h-8 px-3 rounded-full border text-[12.5px] font-black ${only === r.key ? "text-white" : "bg-white"}`} style={only === r.key ? { background: r.block ? C.bad : C.warn, borderColor: r.block ? C.bad : C.warn } : { color: r.block ? C.bad : C.warn, borderColor: r.block ? "#F3C2BD" : "#F3D9A8" }}>{r.label} {r.n}</button>)
                  : <span className="h-8 px-3 rounded-full inline-flex items-center text-[12.5px] font-black" style={{ color: C.ok, background: "#E6F6EE" }}>✓ 확인할 것 없음</span>}
              </div>
              {/* 원터치 — 상태마다 큰 버튼 하나 */}
              {!isViewer && primary && (
                <div className="mt-3 rounded-2xl border border-[#E1E6EF] bg-[#F8FAFD] px-3.5 py-2.5 flex items-center gap-3 flex-wrap" data-kp="mc-action">
                  <div className="flex-1 min-w-[180px] text-[13px] font-bold" style={{ color: C.sub }}>
                    {cur.status === "none" && !cur.block ? "오더를 다 봤으면 [검증 완료]를 눌러요. 그다음 1차 마감이 열려요." : cur.status === "verified" && !cur.changed ? `${cur.row?.doc?.verifiedByName || ""} 검증 완료 · 1차 마감하면 경리팀으로 넘어가요.` : cur.block ? "빨간 줄을 눌러 고치면 버튼이 열려요." : ""}
                  </div>
                  {primary.sub && <button type="button" disabled={!!busy} onClick={primary.sub.on} className="h-12 px-4 rounded-xl text-[13.5px] font-bold" style={{ color: C.sub }}>{primary.sub.text}</button>}
                  <button type="button" disabled={primary.disabled || !!busy} onClick={primary.on} className="h-12 min-w-[200px] px-6 ml-auto rounded-xl text-[15px] font-black transition disabled:cursor-not-allowed" style={{ background: pTone[primary.tone].bg, color: pTone[primary.tone].fg, boxShadow: primary.disabled ? "none" : "0 10px 24px rgba(36,87,214,.25)" }}>
                    {busy ? "처리 중…" : primary.tone === "blue" ? `✓ ${primary.text}` : primary.text}
                  </button>
                </div>)}
            </div>

            <div className={phone ? "" : "max-h-[calc(100vh-300px)] min-h-[260px] overflow-y-auto"}>
              {phone ? curRows.map(({ o, is }) => (
                <button key={idOf(o)} type="button" onClick={() => openRow(o)} className="w-full text-left px-4 py-3 border-b border-[#EEF1F6]" style={{ boxShadow: is.some((x) => x.block) ? `inset 3px 0 0 ${C.bad}` : is.length ? `inset 3px 0 0 ${C.warn}` : undefined }}>
                  <div className="flex items-center gap-2 text-[12.5px]" style={{ ...NUM, color: C.mute }}><span style={{ fontFamily: DIG }}>{String(o.상차일 || "").slice(5)}</span><span className="truncate" style={{ color: C.sub }}>{o.차량번호 || "차량 없음"} {o.이름 || ""}</span><span className="ml-auto font-black text-[14px]" style={{ color: n(o.청구운임) ? C.ink : C.bad, fontFamily: DIG }}>{won(n(o.청구운임))}</span></div>
                  <div className="mt-0.5 text-[14.5px] font-black truncate">{o.상차지명 || "-"} → {o.하차지명 || "-"}</div>
                  <div className="mt-0.5"><IssueText list={is} /></div>
                </button>))
              : (
                <table className="kp-plain w-full" style={NUM}>
                  <thead className="sticky top-0 bg-white z-[1]"><tr className="text-[12px]" style={{ color: C.mute }}>
                    {["상차일", "구간", "차량 · 기사", "청구", "기사", "확인", ""].map((h, i) => <th key={i} className={`px-3 py-2 font-bold border-b border-[#E1E6EF] ${i === 3 || i === 4 ? "text-right" : "text-left"}`}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {curRows.map(({ o, is }) => (
                      <tr key={idOf(o)} onClick={() => openRow(o)} className="cursor-pointer border-b border-[#EEF1F6] hover:bg-[#F8FAFD]" style={{ boxShadow: is.some((x) => x.block) ? `inset 3px 0 0 ${C.bad}` : is.length ? `inset 3px 0 0 ${C.warn}` : undefined }} title="눌러서 고치기">
                        <td className="px-3 py-2.5 text-[13px] whitespace-nowrap" style={{ fontFamily: DIG }}>{String(o.상차일 || "").slice(5)}</td>
                        <td className="px-3 py-2.5 text-[13.5px] max-w-[320px] truncate font-bold">{o.상차지명 || "-"} <span style={{ color: C.mute }}>→</span> {o.하차지명 || "-"}</td>
                        <td className="px-3 py-2.5 text-[13px] whitespace-nowrap" style={{ color: C.sub }}>{o.차량번호 || <span style={{ color: C.bad }}>차량 없음</span>} {o.이름 || ""}</td>
                        <td className="px-3 py-2.5 text-[13.5px] font-black text-right whitespace-nowrap" style={{ color: n(o.청구운임) ? C.ink : C.bad, fontFamily: DIG }}>{won(n(o.청구운임))}</td>
                        <td className="px-3 py-2.5 text-[13.5px] text-right whitespace-nowrap" style={{ color: n(o.기사운임) ? C.sub : C.warn, fontFamily: DIG }}>{won(n(o.기사운임))}</td>
                        <td className="px-3 py-2.5"><IssueText list={is} /></td>
                        <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          {!isViewer && (delAsk === idOf(o)
                            ? <span className="inline-flex gap-1"><button type="button" className="h-8 px-2.5 rounded-lg text-[12.5px] font-black text-white" style={{ background: C.bad }} onClick={async () => { setDelAsk(""); await onRemove?.(o); setToast("오더를 지웠어요"); }}>지우기</button><button type="button" className="h-8 px-2 rounded-lg text-[12.5px] font-bold" style={{ color: C.sub }} onClick={() => setDelAsk("")}>취소</button></span>
                            : <button type="button" aria-label="오더 삭제" title="삭제" className="w-8 h-8 rounded-lg text-[#9AA6BC] hover:text-[#C62F25]" onClick={() => setDelAsk(idOf(o))}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>)}
                        </td>
                      </tr>))}
                  </tbody>
                </table>)}
              {!curRows.length && <div className="py-10 text-center text-[13.5px]" style={{ color: C.mute }}>해당하는 오더가 없어요</div>}
            </div>

          </>)}
        </section>
      </div>

      {toast && <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-[100060] px-5 py-3 rounded-2xl bg-[#0A1224] text-white text-[14px] font-bold shadow-[0_16px_40px_rgba(10,18,36,.35)]" role="status">{toast}</div>}

      {ask && createPortal(
        <div className="fixed inset-0 z-[100050] flex items-center justify-center p-4" style={{ background: "rgba(10,18,36,.5)" }} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setAsk(false); }}>
          <div className="w-full max-w-[520px] rounded-[22px] bg-white p-5 max-h-[86vh] flex flex-col" role="dialog" aria-label="1차 마감">
            <div className="text-[18px] font-black">검증 완료 {readyGroups.length}곳 1차 마감</div>
            <div className="text-[13.5px] mt-1" style={{ color: C.sub }}>아래 거래처가 경리팀 마감 검증으로 넘어가요.</div>
            <div className="mt-3 flex-1 overflow-y-auto rounded-xl border border-[#E1E6EF]">
              {readyGroups.map((g) => <div key={g.client} className="px-3 py-2 flex items-center gap-2 border-b border-[#EEF1F6] last:border-b-0 text-[14px]" style={NUM}><StatusDot g={g} size={8} /><span className="flex-1 truncate font-bold">{g.client}</span><span style={{ color: C.sub, fontFamily: DIG }}>{g.row.count}건 · {won(g.row.sale)}</span></div>)}
            </div>
            <div className="mt-4 flex justify-end gap-2"><button type="button" className={btn} disabled={!!busy} onClick={() => setAsk(false)}>취소</button><button type="button" className={btnPri} disabled={!!busy} onClick={submitAll}>{busy ? "넘기는 중…" : `${readyGroups.length}곳 1차 마감`}</button></div>
          </div>
        </div>, document.body)}

      <OrderSheet open={!!sheet} row={sheet?.row} isNew={!!sheet?.isNew} ym={ym} phone={phone} isViewer={isViewer}
        clients={groups.map((g) => g.client).filter((c) => c !== "(거래처 없음)")} issues={sheet?.row && !sheet.isNew ? issuesOfRow(sheet.row) : []}
        onClose={() => setSheet(null)}
        onSave={async (patch) => { if (sheet?.isNew) { const r = await onAdd?.({ ...patch }); if (r !== false) setToast("오더를 추가했어요"); return r; } const r = await onPatch?.(sheet.row, patch); if (r !== false) setToast("저장했어요"); return r; }}
        onDelete={async () => { await onRemove?.(sheet.row); setToast("오더를 지웠어요"); }} />
    </div>
  );
}
