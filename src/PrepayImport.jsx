// ======================= src/PrepayImport.jsx =======================
// 💳 2026-11-20 선정산 파일 반영 — 정산관리 › 용차지급관리 [지급 매칭 업로드]에 선정산 마감 파일(국세청승인번호가 있는 양식)을 올리면 열린다.
//  · 파일 한 줄(세금계산서 한 장)을 차량번호 · 계산서 날짜 · 금액으로 미지급 용차 오더와 맞춘다(src/prepayCore.js)
//  · [지급완료 처리] → 그 오더들을 지급완료 + 지급일 + 국세청승인번호 · 계산서일자 기록(같은 파일을 또 올려도 "이미 반영")
//  · 기사관리에 있는 차량이면 사업자번호 · 상호 · 대표자 · 은행 · 계좌 · 예금주를 기사 정보에 채운다(빈 칸만 · 원하면 덮어쓰기)
import React from "react";
import { createPortal } from "react-dom";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { DateField } from "./CallPay";
import { formatAccount } from "./bankUtil";
import { fmtBizNo } from "./formatInput";
import { matchPrepay, normPlate, driverPayDiff, driverPatchFrom } from "./prepayCore";

const won = (n) => Math.round(Number(n) || 0).toLocaleString();
const NUM = { fontVariantNumeric: "tabular-nums" };
const ST = {
  match: { label: "바로 반영", cls: "bg-[#0F1A30] text-white" },
  check: { label: "확인 필요", cls: "bg-white text-[#0F1A30] border border-[#0F1A30]" },
  done: { label: "이미 반영", cls: "bg-[#EEF3FC] text-[#1B2B4B] border border-[#C9D6EE]" },
  fleet: { label: "소속 차량", cls: "bg-[#F4F6FA] text-[#5B6B85] border border-[#DCE3EE]" },
  none: { label: "오더 없음", cls: "bg-[#F4F6FA] text-[#5B6B85] border border-[#DCE3EE]" },
};
const FILTERS = [["all", "전체"], ["match", "바로 반영"], ["check", "확인 필요"], ["done", "이미 반영"], ["fleet", "소속 차량"], ["none", "오더 없음"]];
const dateRange = (os) => {
  const ds = os.map((o) => String(o.상차일 || "").slice(5, 10)).filter(Boolean).sort();
  if (!ds.length) return "";
  return ds[0] === ds[ds.length - 1] ? ds[0] : `${ds[0]}~${ds[ds.length - 1]}`;
};

// 켜고 끄기 — 기사 수정 창의 스위치와 같은 모양
function Switch({ on, set, label, tip }) {
  return (
    <button type="button" role="switch" aria-checked={on} title={tip} onClick={() => set(!on)} className="inline-flex items-center gap-2 text-[13px] font-bold text-[#1B2B4B] whitespace-nowrap">
      <span className={`relative inline-flex h-[22px] w-10 items-center rounded-full transition-colors shrink-0 ${on ? "bg-[#1B2B4B]" : "bg-[#CBD5E1]"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[21px]" : "translate-x-[3px]"}`} />
      </span>
      {label}
    </button>
  );
}

export default function PrepayImportModal({ fileName = "", items, pool, allOrders, fleetPlates, drivers = [], defaultPayDate, patchDispatch, onPaid, onClose }) {
  const results = React.useMemo(() => matchPrepay(items, pool, { allOrders, fleetPlates }), [items, pool, allOrders, fleetPlates]);
  const driverByPlate = React.useMemo(() => {
    const m = new Map();
    (drivers || []).forEach((d) => { const k = normPlate(d.차량번호 || d.carNo || ""); if (k && !m.has(k)) m.set(k, d); });
    return m;
  }, [drivers]);
  const [checked, setChecked] = React.useState(() => new Set(results.filter((r) => r.status === "match").map((r) => r.key)));
  const [payDate, setPayDate] = React.useState(defaultPayDate || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
  const [useHint, setUseHint] = React.useState(true);
  const [fillDrivers, setFillDrivers] = React.useState(true);
  const [overwrite, setOverwrite] = React.useState(false);
  const [filter, setFilter] = React.useState("all");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(null);

  React.useEffect(() => {
    const k = (e) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [busy, onClose]);

  const cnt = (s) => results.filter((r) => r.status === s).length;
  const shown = results.filter((r) => filter === "all" || r.status === filter);
  const picked = results.filter((r) => checked.has(r.key) && (r.status === "match" || r.status === "check"));
  const pickedOrders = [...new Map(picked.flatMap((r) => r.orders).map((o) => [o._id, o])).values()];
  const pickedAmt = picked.reduce((s, r) => s + r.amount, 0);

  // 기사관리 정산정보 — 차량번호가 기사관리에 있는 줄(같은 기사는 계산서 날짜가 가장 늦은 줄 값으로)
  const driverPlan = React.useMemo(() => {
    const byDriver = new Map();
    [...results].sort((a, b) => String(a.invoiceDate).localeCompare(String(b.invoiceDate))).forEach((r) => {
      const d = driverByPlate.get(r.plateKey); if (!d?.id) return;
      byDriver.set(d.id, { d, r });
    });
    return [...byDriver.values()].map(({ d, r }) => ({ d, r, ...driverPayDiff(d, r) }));
  }, [results, driverByPlate]);
  const drvFillN = driverPlan.filter((p) => Object.keys(p.fill).length || (overwrite && p.conflicts.length)).length;
  const drvConflictN = driverPlan.filter((p) => p.conflicts.length).length;
  const drvInfo = (r) => {
    const p = driverPlan.find((x) => x.r.plateKey === r.plateKey);
    if (!driverByPlate.get(r.plateKey)) return { t: "미등록", c: "text-[#9AA9C3]" };
    if (!p) return { t: "-", c: "text-[#9AA9C3]" };
    const f = Object.keys(p.fill).length;
    if (p.conflicts.length) return { t: `다른 값 ${p.conflicts.length}칸${f ? ` · 채움 ${f}칸` : ""}`, c: "text-[#0F1A30] font-black underline decoration-dotted underline-offset-2", title: p.conflicts.map((c) => `${c.label}: 지금 ${c.cur} → 파일 ${c.next}`).join("\n") };
    if (f) return { t: `채움 ${f}칸`, c: "text-[#1B2B4B] font-black" };
    return { t: "같음", c: "text-[#5B6B85]" };
  };

  const toggle = (k) => setChecked((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    let orderN = 0, amt = 0, drvN = 0;
    const seen = new Set();
    try {
      for (const r of picked) {
        const date = (useHint && r.payDateHint) || payDate;
        for (const o of r.orders) {
          if (seen.has(o._id)) continue; seen.add(o._id);
          await patchDispatch(o._id, { 지급상태: "지급완료", 지급일: date, 국세청승인번호: r.approvalNo, 계산서일자: r.invoiceDate, __system: true });
          onPaid?.(o, date);
          orderN++;
        }
        amt += r.amount;
      }
      if (fillDrivers) {
        for (const p of driverPlan) {
          const entries = { ...p.fill };
          if (overwrite) p.conflicts.forEach((c) => { entries[c.path] = c.next; });
          if (!Object.keys(entries).length) continue;
          await updateDoc(doc(db, "drivers", p.d.id), { ...driverPatchFrom(p.d, entries), 정산정보출처: `선정산 파일 ${p.r.invoiceDate || ""}`.trim() });
          drvN++;
        }
      }
      setDone({ rows: picked.length, orderN, amt, drvN });
    } catch (e) {
      window.alert(`처리 중 오류가 났어요: ${e.message}\n여기까지 처리한 오더 ${orderN}건은 지급완료로 바뀌었어요.`);
    } finally { setBusy(false); }
  };

  const chk = "w-4 h-4 accent-[#1B2B4B]";
  const body = (
    <div className="fixed inset-0 z-[99999] bg-[#0B1428]/60 flex items-center justify-center p-3" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="bg-white rounded-[22px] shadow-[0_40px_100px_rgba(0,0,0,0.45)] w-[1320px] max-w-[98vw] h-[88vh] max-h-[920px] flex flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="shrink-0 px-6 py-4 flex items-center gap-3 text-white" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]">PREPAY · IMPORT</div>
            <div className="text-[17px] font-black truncate">선정산 파일 반영 <span className="text-white/50 text-[13px] font-bold ml-1">{fileName}</span></div>
          </div>
          <button type="button" disabled={busy} onClick={onClose} className="h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-[13px] font-bold">닫기 ✕</button>
        </div>

        {done ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-14 px-6 text-center">
            <div className="text-[20px] font-black text-[#0F1A30]">반영했어요</div>
            <div className="text-[14.5px] text-[#3A4A66] leading-relaxed" style={NUM}>
              계산서 {done.rows}장 · 오더 <b>{done.orderN}건</b> 지급완료 · 파일 금액 {won(done.amt)}원<br />
              {fillDrivers ? <>기사관리 정산정보 <b>{done.drvN}명</b> 채웠어요</> : "기사관리 정산정보는 건드리지 않았어요"}
            </div>
            <div className="text-[12.5px] text-[#7A89A3]">지급한 오더에는 국세청승인번호가 남아서, 같은 파일을 다시 올려도 두 번 처리되지 않아요.</div>
            <button type="button" onClick={onClose} className="mt-2 h-11 px-8 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black">확인</button>
          </div>
        ) : (
          <>
            {/* 🎨 2026-11-20 사용자 요청 — 용차지급관리와 같은 모양(영문 작은 제목 + KPI 카드 · 네이비 머리글 표), 모든 칸 가운데 · 한 줄 */}
            <div className="shrink-0 px-6 pt-5 pb-4 border-b border-[#EEF1F6] space-y-4 bg-[#F7F9FC]">
              <div className="grid grid-cols-5 gap-3" style={NUM}>
                {[["FILE", "파일", `${results.length}장`, `${won(results.reduce((s, r) => s + r.amount, 0))}원`],
                  ["READY", "바로 반영", `${cnt("match")}장`, "차량 · 금액 일치", true],
                  ["CHECK", "확인 필요", `${cnt("check")}장`, "금액 다름"],
                  ["DONE", "이미 반영", `${cnt("done")}장`, "같은 승인번호"],
                  ["SKIP", "소속 · 오더 없음", `${cnt("fleet") + cnt("none")}장`, cnt("fleet") ? `소속 ${cnt("fleet")} · 없음 ${cnt("none")}` : "미지급 오더 없음"]].map(([en, l, v, sub, hot]) => (
                  <div key={en} className={`rounded-2xl px-4 py-3 border text-center ${hot ? "bg-[#0F1A30] border-[#0F1A30]" : "bg-white border-[#E3E8F0]"}`}>
                    <div className={`text-[9.5px] font-extrabold tracking-[0.22em] ${hot ? "text-[#8FB0F0]" : "text-[#9AA9C3]"}`}>{en}</div>
                    <div className={`text-[12px] font-bold whitespace-nowrap ${hot ? "text-white/70" : "text-[#5B6B85]"}`}>{l}</div>
                    <div className={`text-[19px] font-black leading-tight whitespace-nowrap ${hot ? "text-white" : "text-[#0F1A30]"}`}>{v}</div>
                    <div className={`text-[11px] font-semibold whitespace-nowrap ${hot ? "text-white/50" : "text-[#9AA9C3]"}`}>{sub}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-5 whitespace-nowrap">
                <div className="flex items-center gap-5">
                  <span className="inline-flex items-center gap-2 text-[13px] font-bold text-[#1B2B4B]">지급일 <DateField value={payDate} onChange={setPayDate} width={150} /></span>
                  <Switch on={useHint} set={setUseHint} label="파일에 적힌 지급일 우선" tip="파일 지급예정일 칸에 날짜가 있으면(예: 11/10 선정산 지급완료) 그 날짜로 넣어요" />
                  <Switch on={fillDrivers} set={setFillDrivers} label={`기사 정산정보 채우기 ${driverPlan.length}대`} tip="기사관리에 있는 차량이면 사업자번호 · 상호 · 대표자 · 은행 · 계좌 · 예금주를 빈 칸에 채워요" />
                  {fillDrivers && drvConflictN > 0 && <Switch on={overwrite} set={setOverwrite} label={`다른 값 덮어쓰기 ${drvConflictN}명`} tip="기사관리에 이미 적힌 값이 파일과 다르면 파일 값으로 바꿔요" />}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 whitespace-nowrap">
                <div className="inline-flex rounded-xl border border-[#DCE3EE] bg-white p-0.5">
                  {FILTERS.map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setFilter(k)} className={`h-8 px-3 rounded-[9px] text-[12.5px] font-black whitespace-nowrap transition ${filter === k ? "bg-[#0F1A30] text-white" : "text-[#5B6B85] hover:text-[#0F1A30]"}`}>
                      {l} <span className={filter === k ? "text-white/60" : "text-[#9AA9C3]"} style={NUM}>{k === "all" ? results.length : cnt(k)}</span>
                    </button>
                  ))}
                </div>
                <span className="text-[12px] font-semibold text-[#9AA9C3]">줄을 누르면 체크돼요 · 마우스를 올리면 맞춘 오더와 계좌가 보여요</span>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              <table className="min-w-full text-[13px] whitespace-nowrap" style={NUM}>
                <thead className="sticky top-0 z-[1]">
                  <tr className="bg-[#0B1428]">
                    {["", "상태", "계산서일", "차량번호", "차주(상호 · 대표)", "파일 금액", "맞춘 오더", "기사운임+부가세", "차이", "기사관리", "국세청승인번호"].map((h, i) => <th key={i} className="px-3 py-3 text-center text-white font-bold border-b border-white/10">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 && <tr><td colSpan={11} className="py-16 text-center text-[13px] text-[#9AA9C3]">해당하는 줄이 없어요</td></tr>}
                  {shown.map((r, i) => {
                    const can = r.status === "match" || r.status === "check";
                    const st = ST[r.status];
                    const di = drvInfo(r);
                    const on = can && checked.has(r.key);
                    const td = "px-3 py-2.5 text-center border-b border-[#EEF1F6]";
                    return (
                      <tr key={r.key} onClick={() => can && toggle(r.key)} className={`${can ? "cursor-pointer" : ""} ${on ? "bg-[#EEF3FC]" : i % 2 ? "bg-[#FAFBFD]" : "bg-white"} hover:bg-[#EEF3FC]/60 transition`}>
                        <td className={td}><input type="checkbox" className={chk} disabled={!can} checked={on} onClick={(e) => e.stopPropagation()} onChange={() => toggle(r.key)} /></td>
                        <td className={td}><span className={`inline-flex h-6 px-2 items-center rounded-md text-[11.5px] font-black ${st.cls}`} title={r.reason}>{st.label}</span></td>
                        <td className={`${td} text-[#3A4A66]`}>{r.invoiceDate ? r.invoiceDate.slice(5).replace("-", "/") : "-"}</td>
                        <td className={`${td} font-bold text-[#0F1A30]`}>{r.plate || "-"}</td>
                        <td className={`${td} text-[#0F1A30]`} title={`${fmtBizNo(r.bizNo)} · ${r.bank} ${formatAccount(r.bank, r.acct)} ${r.holder}${r.payNote ? `\n지급예정일 칸: ${r.payNote}` : ""}`}>
                          <span className="font-semibold">{r.company || "-"}</span>{r.ceo && <span className="text-[#7A89A3]"> · {r.ceo}</span>}
                        </td>
                        <td className={`${td} font-black text-[#0F1A30]`}>{won(r.amount)}</td>
                        <td className={`${td} max-w-[260px] overflow-hidden text-ellipsis`} title={r.orders.map((o) => `${o.상차일} ${o.거래처명 || ""} ${o.상차지명 || ""}→${o.하차지명 || ""} ${won(o.기사운임)}원`).join("\n") || r.reason}>
                          {r.orders.length
                            ? <><b className="text-[#0F1A30]">{r.orders.length}건</b>{dateRange(r.orders) && <span className="text-[#5B6B85]"> · {dateRange(r.orders).replace(/-/g, "/")}</span>}<span className="text-[#9AA9C3]"> · {r.status === "done" ? "반영 완료" : r.how}</span></>
                            : <span className="text-[#9AA9C3]">{r.reason}</span>}
                        </td>
                        <td className={`${td} text-[#3A4A66]`}>{r.orders.length && r.status !== "done" ? won(r.sum * 1.1) : "-"}</td>
                        <td className={`${td} ${r.status === "check" ? "font-black text-[#0F1A30]" : "text-[#9AA9C3]"}`}>{r.orders.length && r.status !== "done" ? won(r.diff) : "-"}</td>
                        <td className={`${td} text-[12.5px] ${di.c}`} title={di.title}>{di.t}</td>
                        <td className={`${td} text-[12px] text-[#7A89A3]`}>{r.approvalNo || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="shrink-0 px-6 py-3.5 border-t border-[#EEF1F6] flex items-center gap-3 whitespace-nowrap bg-white">
              <div className="text-[13.5px] text-[#3A4A66] flex-1 min-w-0 truncate" style={NUM}>
                선택 <b className="text-[#0F1A30]">{picked.length}장</b> → 오더 <b className="text-[#0F1A30]">{pickedOrders.length}건</b> 지급완료 · 파일 금액 <b className="text-[#0F1A30]">{won(pickedAmt)}원</b>
                {fillDrivers && <span className="text-[#7A89A3]"> · 기사 정산정보 {drvFillN}명</span>}
              </div>
              <button type="button" disabled={busy} onClick={onClose} className="h-11 px-5 rounded-xl border border-[#DCE3EE] text-[14px] font-bold text-[#3A4A66]">취소</button>
              <button type="button" disabled={busy || (!picked.length && !(fillDrivers && drvFillN))} onClick={apply}
                className="h-11 px-6 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-40">
                {busy ? "반영하는 중…" : picked.length ? `${pickedOrders.length}건 지급완료 처리` : "기사 정산정보만 채우기"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
  return createPortal(body, document.body);
}
