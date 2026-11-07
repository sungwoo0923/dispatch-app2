// ======================= src/BizStatusBadge.jsx =======================
// 🏛 2026-11-07 국세청 사업자 상태(계속 · 휴업 · 폐업) — 배차 프로그램과 허브(cafe-site)가 같이 쓰는 화면 조각.
//  Firebase를 직접 부르지 않는다: 각 화면이 createBizChecker(call)로 만든 checker를 넘긴다(call = 서버 bizStatusCheck 호출).
//   · <BizStatusBadge result />                 계속 / 휴업 / 폐업 / 미등록 / 번호 오류
//   · <BizStatusCheck value checker />          [상태 확인] 버튼 + 결과(번호 검증식은 화면에서 먼저)
//   · bizGuard(checker, value, confirm)         저장 전 — 휴업 · 폐업이면 확인창(취소하면 false)
//   · <BizBulkCheck rows checker onClose />     거래처 사업자 상태 일괄 확인(결과 표)
//  키가 아직 없으면 "국세청 조회 키가 아직 없어요"만 보이고 저장은 막지 않는다.
import React from "react";
import { bizNoDigits, bizNoValid, fmtBizNoDigits, bizWarnText, BIZ_STATE_LABEL } from "../functions/publicDataCore.mjs";
import { createBizChecker, bizGuard, NO_KEY_TEXT } from "./publicDataClient.js";

export { bizNoValid, bizNoDigits, bizWarnText, createBizChecker, bizGuard, NO_KEY_TEXT };

function useChecker(checker) {
  return React.useSyncExternalStore(checker?.subscribe || (() => () => {}), checker?.version || (() => 0), checker?.version || (() => 0));
}

// ─────────────── 배지 ───────────────
const TONE = {
  active: { bg: "#E9F5EE", fg: "#1F7A4D", ring: "#BFE3CF" },
  suspended: { bg: "#FFF4E0", fg: "#9A5B00", ring: "#F4D9A6" },
  closed: { bg: "#FDECEC", fg: "#B4342A", ring: "#F3C4C0" },
  unregistered: { bg: "#FDECEC", fg: "#B4342A", ring: "#F3C4C0" },
  invalid: { bg: "#F3F5F9", fg: "#7A879C", ring: "#DCE3EE" },
  unknown: { bg: "#F3F5F9", fg: "#7A879C", ring: "#DCE3EE" },
};
export function BizStatusBadge({ result, size = "md", title }) {
  if (!result) return null;
  const t = TONE[result.state] || TONE.unknown;
  const label = result.label || BIZ_STATE_LABEL[result.state] || "확인 불가";
  const tip = title || [label, result.taxType, result.endDt && `${result.state === "closed" ? "폐업일" : "기준일"} ${result.endDt}`].filter(Boolean).join(" · ");
  return (
    <span title={tip} data-testid="biz-badge" data-state={result.state}
      className={`inline-flex items-center gap-1 rounded-full font-extrabold whitespace-nowrap ${size === "sm" ? "h-[22px] px-2 text-[12px]" : "h-[26px] px-2.5 text-[13px]"}`}
      style={{ background: t.bg, color: t.fg, boxShadow: `inset 0 0 0 1px ${t.ring}` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.fg }} />
      {label}{result.state === "closed" && result.endDt ? <span className="font-bold opacity-80">{result.endDt.slice(2).replace(/-/g, ".")}</span> : null}
    </span>
  );
}

// ─────────────── 버튼 + 배지 ───────────────
//  value: 사업자번호(하이픈 있어도 됨) · onResult(결과) · tone: "light"(흰 바탕) | "dark"(진한 바탕)
export function BizStatusCheck({ value, checker, onResult, size = "md", className = "", hideButtonWhenDone = false }) {
  useChecker(checker);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const d = bizNoDigits(value);
  const res = checker?.get(d) || null;
  React.useEffect(() => { setErr(""); }, [d]);
  if (!checker || d.length < 10) return null;
  const valid = bizNoValid(d);
  const run = async () => {
    if (!valid) return;
    setBusy(true); setErr("");
    try {
      const r = await checker.check([d]);
      const one = r.results[d];
      if (r.disabled && (!one || one.state === "unknown")) setErr(NO_KEY_TEXT);
      onResult?.(one || null, r);
    } catch (e) {
      setErr(e?.code === "resource-exhausted" ? "오늘 조회를 다 썼어요" : e?.code === "unauthenticated" ? "로그인 후 확인할 수 있어요" : "조회가 잠시 안 돼요");
    } finally { setBusy(false); }
  };
  const btn = size === "sm" ? "h-[26px] px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]";
  return (
    <span className={`inline-flex items-center gap-1.5 flex-wrap ${className}`} data-testid="biz-check">
      {!valid ? <span className="text-[12.5px] font-bold text-[#B4342A]">번호를 다시 확인해 주세요</span> : <>
        {res && res.state !== "unknown" && <BizStatusBadge result={res} size={size} />}
        {!(hideButtonWhenDone && res && res.state !== "unknown") && (
          <button type="button" onClick={run} disabled={busy}
            className={`${btn} inline-flex items-center rounded-lg border border-[#DCE3EE] bg-white font-bold text-[#2D4C82] hover:bg-[#F3F6FB] disabled:opacity-60 whitespace-nowrap`}>
            {busy ? "확인 중" : res && res.state !== "unknown" ? "다시 확인" : "상태 확인"}
          </button>
        )}
        {err && <span className="text-[12.5px] font-semibold text-[#7A879C]">{err}</span>}
      </>}
    </span>
  );
}

// ─────────────── 일괄 확인 ───────────────
// rows: [{ id, name, bizNo }]
export function BizBulkCheck({ rows, checker, onClose, title = "거래처 사업자 상태 일괄 확인" }) {
  useChecker(checker);
  const list = React.useMemo(() => (rows || []).map((r) => ({ ...r, d: bizNoDigits(r.bizNo) })).filter((r) => r.d.length === 10), [rows]);
  const noNum = (rows || []).length - list.length;
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(0);
  const [err, setErr] = React.useState("");
  const [onlyBad, setOnlyBad] = React.useState(false);
  const run = async () => {
    setBusy(true); setErr(""); setDone(0);
    try {
      const nums = [...new Set(list.map((r) => r.d))];
      for (let i = 0; i < nums.length; i += 100) {
        const r = await checker.check(nums.slice(i, i + 100));
        setDone(Math.min(nums.length, i + 100));
        if (r.disabled) { setErr(NO_KEY_TEXT); break; }
      }
    } catch (e) { setErr(e?.code === "resource-exhausted" ? "오늘 조회를 다 썼어요. 내일 다시 해 주세요" : "조회가 잠시 안 돼요. 잠시 뒤 다시 해 주세요"); }
    finally { setBusy(false); }
  };
  const withRes = list.map((r) => ({ ...r, res: checker.get(r.d) }));
  const count = (s) => withRes.filter((r) => r.res?.state === s).length;
  const bad = (r) => ["suspended", "closed", "unregistered", "invalid"].includes(r.res?.state);
  const shown = onlyBad ? withRes.filter(bad) : withRes;
  const checkedN = withRes.filter((r) => r.res && r.res.state !== "unknown").length;
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[760px] max-w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} data-testid="biz-bulk">
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-[10.5px] font-extrabold tracking-[0.22em] text-[#8FB0F0]">NTS · BUSINESS STATUS</div>
            <h3 className="text-white font-black text-[16px]">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white text-[14px] font-bold">닫기</button>
        </div>
        <div className="px-6 py-4 flex flex-wrap items-center gap-2 border-b border-[#E8EDF4]">
          <span className="text-[13.5px] text-[#3A4A66]">사업자번호가 있는 거래처 <b className="text-[#0F1A30] tabular-nums">{list.length}</b>곳{noNum > 0 && <span className="text-[#9AA9C3]"> · 번호 없음 {noNum}곳</span>}</span>
          {checkedN > 0 && <span className="flex items-center gap-1.5 text-[13px] text-[#5B6B85]">
            <BizStatusBadge result={{ state: "active", label: `계속 ${count("active")}` }} size="sm" />
            <BizStatusBadge result={{ state: "suspended", label: `휴업 ${count("suspended")}` }} size="sm" />
            <BizStatusBadge result={{ state: "closed", label: `폐업 ${count("closed")}` }} size="sm" />
            {count("unregistered") + count("invalid") > 0 && <BizStatusBadge result={{ state: "invalid", label: `확인 필요 ${count("unregistered") + count("invalid")}` }} size="sm" />}
          </span>}
          <span className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[13px] font-bold text-[#3A4A66] cursor-pointer"><input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} />휴업 · 폐업만</label>
            <button type="button" onClick={run} disabled={busy || !list.length} className="h-10 px-4 rounded-xl bg-[#1B2B4B] text-white text-[13.5px] font-black disabled:opacity-50 whitespace-nowrap">
              {busy ? `확인 중 ${done}/${list.length}` : checkedN ? "다시 확인" : "확인 시작"}
            </button>
          </span>
        </div>
        {err && <div className="mx-6 mt-3 px-3 py-2 rounded-lg bg-[#F3F5F9] text-[13px] font-semibold text-[#5B6B85]">{err}</div>}
        <div className="flex-1 overflow-auto px-6 py-3">
          <table className="w-full text-[13.5px]">
            <thead><tr className="text-left text-[12.5px] text-[#7A879C] border-b border-[#E8EDF4]">
              <th className="py-2 pr-2 font-bold">거래처명</th><th className="py-2 pr-2 font-bold">사업자번호</th><th className="py-2 pr-2 font-bold">상태</th><th className="py-2 font-bold">과세 유형</th>
            </tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id || r.d} className="border-b border-[#F0F3F8]">
                  <td className="py-2 pr-2 font-bold text-[#0F1A30] max-w-[240px] truncate">{r.name}</td>
                  <td className="py-2 pr-2 tabular-nums text-[#3A4A66] whitespace-nowrap">{fmtBizNoDigits(r.d)}</td>
                  <td className="py-2 pr-2">{r.res ? <BizStatusBadge result={r.res} size="sm" /> : <span className="text-[#B0BACB]">-</span>}</td>
                  <td className="py-2 text-[#5B6B85] text-[12.5px]">{r.res?.taxType || ""}</td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={4} className="py-10 text-center text-[#9AA9C3]">{onlyBad ? "휴업 · 폐업 거래처가 없어요" : "사업자번호가 있는 거래처가 없어요"}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 text-[12px] text-[#9AA9C3] border-t border-[#E8EDF4]">국세청 사업자등록 상태조회 기준 · 같은 번호는 하루 동안 저장해 둔 결과를 씁니다</div>
      </div>
    </div>
  );
}
