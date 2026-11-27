// ======================= src/dispatch/OrderWorkAssist.jsx =======================
// 🧭 2026-11-27 오더등록 아래 "작업 도우미" — 실시간배차현황 전체 표(8천 줄 · 글자 칠 때마다 다시 그려져 입력이 느렸다) 대신
//  ① 오늘 배차 현황 한 줄(누르면 실시간배차현황) ② 오늘 내가 등록한 오더(최근 10건 · [방금] 표시 · 누르면 배차현황에서 그 오더)
//  ③ 위에서 고른 거래처의 최근 90일 노선(같은 노선 · 차종끼리 묶음 · [채우기] → 상하차지 · 차종 · 톤수 · 운임을 폼에)
//  사용자 결정: 시안 반영 · 알록달록하지 않게(남색 한 계열) · 우선 최고관리자만(다른 계정은 예전처럼 전체 표)
//  예전 화면은 머리의 [전체 표]로 돌아간다(이 기기에 기억 — kpOrderAssistMode)
import React from "react";
import { isUnassignedOrder } from "../unassignedRule";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo',sans-serif";
const NUM = { fontVariantNumeric: "tabular-nums" };
const C = { ink: "#0F1A30", navy: "#1B2B4B", mid: "#2D4C82", sub: "#5B6B85", dim: "#8A97AD", line: "#E3E8F0", soft: "#F5F7FB", tint: "#EEF3FB" };
const won = (v) => Math.round(Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0).toLocaleString("ko-KR");
const kst = (off = 0) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(d.getUTCDate() + off); return d.toISOString().slice(0, 10); };
const msOf = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : v ? Date.parse(v) || 0 : 0);
const hhmm = (ms) => { const d = new Date(ms + 9 * 3600e3); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const md = (d) => (d ? `${d.slice(5, 7)}-${d.slice(8, 10)}` : "");
const isCancel = (r) => r?.배차상태 === "배차취소" || ["취소", "배차취소", "오더취소", "취소됨"].includes(r?.상태);
const idOf = (r) => r?._id || r?.id || r?.docId || "";
const short = (s, n) => { const t = String(s || "").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
// 상태 — 색 대신 남색 진하기 · 모양(빈 원 → 반 · 꽉 찬 원)
const stateOf = (r) => (String(r?.배차상태 || "").trim() === "배차완료" ? "done" : isUnassignedOrder(r) ? "todo" : "wait");
const STATE = { todo: { label: "미배차" }, wait: { label: "배차중" }, done: { label: "배차완료" } };
function StateMark({ k }) {
  const fill = k === "done" ? C.navy : k === "wait" ? `linear-gradient(90deg, ${C.navy} 50%, #fff 50%)` : "#fff";
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: k === "done" ? C.ink : k === "wait" ? C.navy : C.sub }}>
      <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 9, border: `1.5px solid ${C.navy}`, background: fill, boxSizing: "border-box" }} />
      {STATE[k].label}
    </span>
  );
}

export const readAssistMode = () => { try { return localStorage.getItem("kpOrderAssistMode") === "table" ? "table" : "assist"; } catch { return "assist"; } };
const saveAssistMode = (v) => { try { localStorage.setItem("kpOrderAssistMode", v); } catch { /* 무시 */ } };

// props: rows(실시간 오더) · history(불러온 지난 오더 포함) · client(폼의 거래처명) · myEmail · myName · onFill(order) · mode · onMode(v)
export default function OrderWorkAssist({ rows = [], history = [], client = "", myEmail = "", myName = "", onFill, mode = "assist", onMode }) {
  const today = kst(0), tomorrow = kst(1);
  const [scope, setScope] = React.useState("me"); // me | team
  const live = React.useMemo(() => (rows || []).filter((r) => !isCancel(r) && r.source !== "transport_transmit"), [rows]);

  // ① 오늘 배차 현황(상차일 기준)
  const kpi = React.useMemo(() => {
    const t = live.filter((r) => String(r.상차일 || "").slice(0, 10) === today);
    const k = { all: t.length, todo: 0, wait: 0, done: 0, tomorrow: live.filter((r) => String(r.상차일 || "").slice(0, 10) === tomorrow).length };
    t.forEach((r) => { k[stateOf(r)] += 1; });
    return k;
  }, [live, today, tomorrow]);

  // ② 오늘 등록한 오더(등록 시각 기준) — 내 것 / 팀 전체
  const mineOf = React.useCallback((r) => {
    const e = String(r.createdByEmail || "").trim().toLowerCase();
    if (e && myEmail) return e === String(myEmail).toLowerCase();
    const n = String(r.등록자 || r.작성자 || "").trim();
    return !!n && (n === myName || n === myEmail);
  }, [myEmail, myName]);
  const todayRows = React.useMemo(() => live
    .map((r) => ({ r, at: msOf(r.createdAt) }))
    .filter((x) => x.at && kst(0) === new Date(x.at + 9 * 3600e3).toISOString().slice(0, 10))
    .sort((a, b) => b.at - a.at), [live]);
  const mine = React.useMemo(() => todayRows.filter((x) => mineOf(x.r)), [todayRows, mineOf]);
  const list = (scope === "me" ? mine : todayRows).slice(0, 10);
  const freshId = list[0] && Date.now() - list[0].at < 10 * 60e3 ? idOf(list[0].r) : "";

  // ③ 거래처 최근 노선(90일) — 상차지 · 하차지 · 차종 · 톤수가 같은 오더끼리
  const cName = String(client || "").trim();
  const routes = React.useMemo(() => {
    if (!cName) return { list: [], n: 0 };
    const from = kst(-90);
    const m = new Map(); let n = 0;
    (history || []).forEach((r) => {
      if (isCancel(r) || String(r.거래처명 || "").trim() !== cName) return;
      const d = String(r.상차일 || "").slice(0, 10); if (!d || d < from) return;
      n += 1;
      const k = [r.상차지명, r.하차지명, r.차량종류, r.차량톤수].map((v) => String(v || "").trim()).join("|");
      const g = m.get(k) || { k, cnt: 0, last: "", r: null };
      g.cnt += 1; if (d >= g.last) { g.last = d; g.r = r; }
      m.set(k, g);
    });
    return { list: [...m.values()].filter((g) => g.r?.상차지명 && g.r?.하차지명).sort((a, b) => b.cnt - a.cnt || b.last.localeCompare(a.last)).slice(0, 4), n };
  }, [history, cName]);

  const go = (tab) => { try { window.__setMainTab?.(tab); } catch { /* 무시 */ } };
  const open = (r) => { const id = idOf(r); if (id && window.__selectOrder) window.__selectOrder(id); };
  const setMode = (v) => { saveAssistMode(v); onMode?.(v); };

  const card = "bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)]";
  const eyebrow = "text-[10.5px] font-extrabold tracking-[0.24em] text-[#8A97AD]";
  const th = "px-2 pb-2.5 text-[12px] font-extrabold text-[#5B6B85] border-b-[1.5px] border-[#E3E8F0] whitespace-nowrap";
  const td = "px-2 py-[11px] border-b border-[#EEF2F8] whitespace-nowrap overflow-hidden text-ellipsis";

  return (
    <section className={`${card} mt-4 overflow-hidden`} style={{ fontFamily: MONO, color: C.ink }} data-kp="order-assist">
      {/* 머리 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-[22px] pt-[18px] pb-4 border-b border-[#EEF2F8]">
        <div className="flex items-center gap-2"><span aria-hidden="true" className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" /><span className={eyebrow}>WORK ASSIST</span></div>
        <h2 className="m-0 text-[18px] font-black">작업 도우미</h2>
        <span className="text-[13px] text-[#8A97AD]">방금 넣은 오더 확인 · 같은 노선 다시 넣기 · 오늘 배차 현황</span>
        <div className="ml-auto flex items-center gap-2.5">
          <div role="group" aria-label="아래 화면 고르기" className="flex p-[3px] rounded-xl bg-[#F1F4F9] border border-[#E3E8F0]">
            {[["assist", "작업 도우미"], ["table", "전체 표(예전 화면)"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k}
                className={`h-8 px-3.5 rounded-[9px] text-[13px] ${mode === k ? "bg-[#0F1A30] text-white font-extrabold" : "text-[#5B6B85] font-bold hover:text-[#0F1A30]"}`}>{l}</button>
            ))}
          </div>
          <button type="button" onClick={() => go("실시간배차현황")} className="h-[38px] inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-[#DCE3EE] text-[13px] font-extrabold text-[#1B2B4B] hover:bg-[#F5F7FB]">
            실시간배차현황 전체 보기 <kbd className="text-[11px] font-bold bg-[#EEF2F8] rounded-md px-1.5 text-[#5B6B85]" style={{ fontFamily: "inherit" }}>F2</kbd>
          </button>
        </div>
      </div>

      {/* ① 오늘 배차 현황 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 px-[22px] py-3.5 border-b border-[#EEF2F8]">
        {[["ORDERS", "오늘 상차", kpi.all], ["PENDING", "미배차", kpi.todo, true], ["ASSIGNING", "배차중", kpi.wait], ["DONE", "배차완료", kpi.done], ["TOMORROW", "내일 상차", kpi.tomorrow]].map(([en, label, n, hot]) => {
          const on = hot && n > 0;
          return (
            <button key={en} type="button" onClick={() => go("실시간배차현황")} title={`${label} — 실시간배차현황에서 보기`}
              className="flex items-center justify-between gap-2.5 px-4 py-3 rounded-[14px] text-left transition hover:border-[#8FB0F0]"
              style={{ border: `1px solid ${on ? C.navy : C.line}`, background: on ? C.tint : "#fff" }}>
              <span className="flex flex-col gap-0.5"><span className={eyebrow}>{en}</span><span className="text-[13.5px] font-extrabold text-[#3A4A66]">{label}</span></span>
              <span className="text-[26px] font-black leading-none" style={{ ...NUM, color: C.ink }}>{n}<span className="text-[13px] font-bold text-[#8A97AD] ml-0.5">건</span></span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* ② 오늘 등록한 오더 */}
        <div className="px-[22px] pt-[18px] pb-[22px] min-w-0 xl:border-r border-[#EEF2F8]">
          <div className="flex items-center gap-2.5 mb-3">
            <span className={eyebrow}>RECENT</span>
            <h3 className="m-0 text-[15.5px] font-black">오늘 {scope === "me" ? "내가" : "팀이"} 등록한 오더</h3>
            <div role="group" aria-label="보기" className="ml-auto flex gap-1.5">
              {[["me", `내 오더 ${mine.length}`], ["team", `팀 전체 ${todayRows.length}`]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setScope(k)} aria-pressed={scope === k}
                  className={`h-[30px] px-3 rounded-[9px] text-[12.5px] border ${scope === k ? "bg-[#0F1A30] border-[#0F1A30] text-white font-extrabold" : "bg-white border-[#DCE3EE] text-[#3A4A66] font-bold"}`} style={NUM}>{l}</button>
              ))}
            </div>
          </div>
          {list.length === 0 ? (
            <div className="py-12 text-center text-[13.5px] text-[#8A97AD] border border-dashed border-[#DCE3EE] rounded-[14px]">오늘 {scope === "me" ? "내가" : ""} 등록한 오더가 아직 없어요. 위에서 저장하면 여기에 바로 보여요.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]" style={{ ...NUM, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", minWidth: 800 }}>
                <colgroup><col style={{ width: 64 }} /><col style={{ width: 58 }} /><col style={{ width: 128 }} /><col /><col style={{ width: 100 }} /><col style={{ width: 96 }} /><col style={{ width: 168 }} /><col style={{ width: 92 }} /><col style={{ width: 44 }} /></colgroup>
                <thead><tr>
                  <th className={`${th} text-left pl-2.5`}>등록</th><th className={`${th} text-left`}>상차일</th><th className={`${th} text-left`}>거래처</th>
                  <th className={`${th} text-left`}>구간 (상차 → 하차)</th><th className={`${th} text-left`}>차종 · 톤</th><th className={`${th} text-right`}>청구</th>
                  <th className={`${th} text-left pl-4`}>기사</th><th className={`${th} text-left`}>상태</th><th className={th}><span className="sr-only">수정</span></th>
                </tr></thead>
                <tbody>
                  {list.map(({ r, at }, i) => {
                    const fresh = idOf(r) && idOf(r) === freshId;
                    const drv = [r.차량번호, r.이름 || r.기사명].map((v) => String(v || "").trim()).filter(Boolean).join(" ");
                    return (
                      <tr key={idOf(r) || i} onDoubleClick={() => open(r)} className="cursor-default" style={{ background: fresh ? "#F3F7FF" : i % 2 ? "#FBFCFE" : "#fff" }}>
                        <td className={`${td} pl-2.5`}>{fresh ? <span className="inline-block text-[11px] font-black text-white bg-[#1B2B4B] rounded-md px-1.5 py-0.5">방금</span> : <span className="font-bold text-[#8A97AD]">{hhmm(at)}</span>}</td>
                        <td className={`${td} font-bold`}>{md(String(r.상차일 || ""))}</td>
                        <td className={`${td} font-extrabold`} title={r.거래처명 || ""}>{r.거래처명 || "-"}</td>
                        <td className={td} title={`${r.상차지명 || ""} → ${r.하차지명 || ""}`}><span className="font-bold">{short(r.상차지명, 14)}</span><span className="text-[#AEBBD0] mx-1.5">→</span><span className="font-bold">{short(r.하차지명, 14)}</span></td>
                        <td className={`${td} text-[#3A4A66]`}>{[r.차량톤수, r.차량종류].filter(Boolean).join(" ") || "-"}</td>
                        <td className={`${td} text-right font-extrabold`}>{won(r.청구운임)}</td>
                        <td className={`${td} pl-4 font-bold`} style={{ color: drv ? C.ink : C.dim }} title={drv}>{drv || "기사 미배정"}</td>
                        <td className={td}><StateMark k={stateOf(r)} /></td>
                        <td className="py-2 border-b border-[#EEF2F8] text-right">
                          <button type="button" onClick={() => open(r)} aria-label="배차현황에서 이 오더 수정" title="배차현황에서 이 오더 수정"
                            className="w-8 h-8 rounded-[9px] border border-[#DCE3EE] bg-white inline-grid place-items-center hover:border-[#1B2B4B]">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3A4A66" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 text-[12.5px] text-[#8A97AD]">줄을 두 번 누르거나 ✎를 누르면 배차현황에서 그 오더가 열려요 · 오늘 등록한 것 중 최근 10건</div>
        </div>

        {/* ③ 거래처 최근 노선 */}
        <div className="px-[22px] pt-[18px] pb-[22px] bg-[#FAFBFD] border-t xl:border-t-0 border-[#EEF2F8]">
          <div className="flex items-center gap-2.5 mb-1.5"><span className={eyebrow}>CLIENT ROUTES</span><h3 className="m-0 text-[15.5px] font-black">거래처 최근 노선</h3></div>
          {!cName ? (
            <div className="mt-3 py-10 text-center text-[13.5px] text-[#8A97AD] border border-dashed border-[#DCE3EE] rounded-[14px] bg-white">위에서 거래처를 고르면<br />자주 가는 노선과 운임이 나와요</div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3.5">
                <span className="h-7 inline-flex items-center px-2.5 rounded-lg bg-[#0F1A30] text-white text-[13px] font-extrabold max-w-[220px] truncate">{cName}</span>
                <span className="text-[12.5px] text-[#8A97AD]" style={NUM}>최근 90일 · {routes.n}건</span>
              </div>
              {routes.list.length === 0 ? (
                <div className="py-8 text-center text-[13px] text-[#8A97AD] border border-dashed border-[#DCE3EE] rounded-[14px] bg-white">최근 90일 이 거래처 오더가 없어요</div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {routes.list.map((g) => (
                    <div key={g.k} className="bg-white border border-[#E3E8F0] rounded-[14px] px-3.5 py-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 items-center">
                      <div className="min-w-0">
                        <div className="text-[14px] font-extrabold truncate" title={`${g.r.상차지명} → ${g.r.하차지명}`}>{g.r.상차지명}<span className="text-[#AEBBD0] mx-1.5">→</span>{g.r.하차지명}</div>
                        <div className="text-[12.5px] text-[#5B6B85] mt-0.5 truncate">{[[g.r.차량톤수, g.r.차량종류].filter(Boolean).join(" "), g.r.화물내용].filter(Boolean).join(" · ") || "차종 미입력"}</div>
                      </div>
                      <button type="button" onClick={() => onFill?.(g.r)} title="상하차지 · 주소 · 담당자 · 차종 · 톤수 · 운임을 위 폼에 넣어요(상차일 · 시간 · 메모는 그대로)"
                        className="h-[34px] px-3.5 rounded-[10px] bg-[#0F1A30] text-white text-[12.5px] font-extrabold whitespace-nowrap hover:bg-[#1B2B4B]">채우기</button>
                      <div className="col-span-2 grid grid-cols-3 gap-2 pt-2 border-t border-dashed border-[#E3E8F0] text-[12.5px]" style={NUM}>
                        <div><div className="text-[#8A97AD] font-bold">횟수 · 최근</div><div className="font-extrabold">{g.cnt}회 · {md(g.last).replace("-", "/")}</div></div>
                        <div className="text-right"><div className="text-[#8A97AD] font-bold">청구</div><div className="font-extrabold">{won(g.r.청구운임)}</div></div>
                        <div className="text-right"><div className="text-[#8A97AD] font-bold">기사</div><div className="font-extrabold">{won(g.r.기사운임)}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 text-[12.5px] text-[#8A97AD] leading-relaxed">[채우기]를 누르면 상하차지 · 주소 · 담당자 · 차종 · 톤수 · 운임이 위 폼에 들어가요. 상차일 · 시간 · 메모는 그대로 둬요.</div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
