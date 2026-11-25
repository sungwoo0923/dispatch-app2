// ======================= src/HrFleet.jsx =======================
// 🚛 2026-11-15 인사관리부 › 인사관리 › 지입관리 — 우리 회사 소속 기사(지입 · 직영 · 임대 · 분양)만 인사 쪽에서 본다
//  · 일반 용차(등급 없음)는 인사가 볼 필요가 없어 빼고, 소속 기사의 인적 사항 · 오늘 근무 · 이번 달 근무일 · 발령 이력을 본다
//  · 속메뉴: 전체 / 지입 / 직영 / 임대 → 고른 구분만 보여요
//  · DriverOrderPanel: 인사발령 › [기사] — 구분 변경(지입 → 직영 등) · 채용 · 휴직 · 복직 · 계약 해지를 공문(사내 공지 · 인사발령)으로 남긴다
//  · TeamPicker: 인사발령 왼쪽 목록의 "팀 고르기" — 글자를 넣어 찾거나 ▾ 로 고르는 입력형 드롭다운
import React from "react";
import { addDoc, arrayUnion, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, limit } from "firebase/firestore";
import { db, auth } from "./firebase";
import { BookHero, BookCard, Chip, Sheet, MONO } from "./OfficeBooks";
import { FLEET_GRADES, isFleetGrade } from "./fleetGradesCore";
import { kpConfirm } from "./kpDialog";
import CustomDatePicker from "./CustomDatePicker";
import { CustomSelect } from "./CustomSelect";

const num = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };
const kstDay = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);
const plateOf = (d) => String(d?.차량번호 || d?.carNo || "").replace(/\s/g, "");
const nameOf = (d) => d?.이름 || d?.name || "";
const phoneOf = (d) => d?.전화번호 || d?.phone || "";
const gradeOf = (d) => String(d?.등급 || "").trim();
const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
export const HR_FLEET_KINDS = ["전체", "지입", "직영", "임대"];

// 우리 회사 소속 기사(등급이 지입 · 직영 · 임대 · 분양) — 같은 차량이 둘이면 하나만
export function companyFleet(drivers = []) {
  const seen = new Set();
  return (drivers || []).filter((d) => isFleetGrade(gradeOf(d)) && d.퇴사 !== true).filter((d) => {
    const k = plateOf(d) || d.id; if (seen.has(k)) return false; seen.add(k); return true;
  });
}

// 이번 달 출근 기록(driver_logs) — 회사 조건 색인이 없어도 되게 날짜로 읽고 회사로 거른다(지입차관리와 같은 방식)
function useMonthDutyLogs(company) {
  const [logs, setLogs] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    const d = new Date(Date.now() + 9 * 3600e3); const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 9 * 3600e3;
    return onSnapshot(query(collection(db, "driver_logs"), where("timestamp", ">=", new Date(start)), orderBy("timestamp", "desc"), limit(4000)),
      (s) => setLogs(s.docs.map((x) => x.data()).filter((l) => !l.companyName || l.companyName === company)), () => setLogs([]));
  }, [company]);
  return logs;
}
function dutyOf(d, logs) {
  const p = plateOf(d); const ids = new Set([d.id, d.uid, d.authUid].filter(Boolean));
  const mine = (logs || []).filter((l) => ids.has(l.uid) || (p && String(l.carNo || "").replace(/\s/g, "") === p));
  const ins = mine.filter((l) => l.status === "출근");
  const days = new Set(ins.map((l) => kstDay(tsMs(l.timestamp))));
  const today = kstDay();
  const todayIn = ins.filter((l) => kstDay(tsMs(l.timestamp)) === today).sort((a, b) => tsMs(a.timestamp) - tsMs(b.timestamp))[0];
  const todayOut = mine.find((l) => l.status === "최종퇴근" && kstDay(tsMs(l.timestamp)) === today);
  const lastIn = ins[0];
  return { days: days.size, todayIn: todayIn ? tsMs(todayIn.timestamp) : 0, todayOut: todayOut ? tsMs(todayOut.timestamp) : 0, lastIn: lastIn ? tsMs(lastIn.timestamp) : 0, list: mine.slice(0, 40) };
}
const hm = (ms) => (ms ? new Date(ms + 9 * 3600e3).toISOString().slice(11, 16) : "");
const md = (ms) => (ms ? new Date(ms + 9 * 3600e3).toISOString().slice(5, 10).replace("-", ".") : "");

// ═════════════ 지입관리 ═════════════
export function HrFleetPanel({ company, drivers = [], kind = "전체", onKind, canManage = false, onOrder }) {
  const fleet = React.useMemo(() => companyFleet(drivers), [drivers]);
  const logs = useMonthDutyLogs(company);
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(null);
  const rows = fleet.filter((d) => (kind === "전체" || gradeOf(d) === kind) && (!q || `${nameOf(d)} ${plateOf(d)} ${phoneOf(d)}`.includes(q.trim())))
    .map((d) => ({ d, u: dutyOf(d, logs) }))
    .sort((a, b) => (b.u.todayIn ? 1 : 0) - (a.u.todayIn ? 1 : 0) || nameOf(a.d).localeCompare(nameOf(b.d), "ko"));
  const cnt = (g) => fleet.filter((d) => gradeOf(d) === g).length;
  const working = fleet.filter((d) => dutyOf(d, logs).todayIn).length;
  const kinds = [...HR_FLEET_KINDS, ...FLEET_GRADES.filter((g) => !HR_FLEET_KINDS.includes(g) && cnt(g) > 0)];
  return (
    <div className="space-y-4" data-kp="hr-fleet">
      <BookHero en={`HR · FLEET · ${kind === "전체" ? "ALL" : kind}`} title={kind === "전체" ? "지입관리" : `지입관리 · ${kind}`}
        desc="우리 회사 소속 기사(지입 · 직영 · 임대)만 모았어요. 일반 용차는 여기 나오지 않아요. 기사를 누르면 인적 사항과 이번 달 근무 기록을 봐요."
        kpis={[["소속 기사", `${fleet.length}명`, `지입 ${cnt("지입")} · 직영 ${cnt("직영")} · 임대 ${cnt("임대")}`], ["오늘 출근", `${logs ? working : "-"}명`, "기사앱 출근 기준"], ["이번 달 평균 근무", `${logs && fleet.length ? (fleet.reduce((s, d) => s + dutyOf(d, logs).days, 0) / fleet.length).toFixed(1) : "-"}일`, "출근한 날 수"], ["지금 보는 구분", kind, `${rows.length}명`]]} />
      <BookCard flush>
        <div className="px-4 py-3 border-b border-[#EEF1F6] flex items-center gap-2 flex-wrap">
          {kinds.map((k) => <Chip key={k} on={kind === k} onClick={() => onKind?.(k)}>{k}{k !== "전체" ? ` ${cnt(k)}` : ` ${fleet.length}`}</Chip>)}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 차량번호 · 연락처" className="w-full md:w-auto md:ml-auto md:min-w-[220px] h-9 px-3 rounded-xl border border-[#DCE3EE] bg-[#F8FAFD] text-[13.5px] outline-none focus:border-[#2D4C82]" />
        </div>
        {!rows.length ? <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3] leading-relaxed">{fleet.length ? "해당하는 기사가 없어요." : <>소속 기사가 없어요.<br />기사관리에서 기사 등급을 지입 · 직영 · 임대로 정하면 여기에 보여요.</>}</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px] border-collapse" style={{ minWidth: 880 }}>
              <thead><tr className="bg-[#0F1A30] text-white">{["구분", "이름", "차량", "차종 · 톤수", "연락처", "오늘 근무", "이번 달 근무", "마지막 출근"].map((h) => <th key={h} className="px-3 py-2.5 text-center text-[12.5px] font-black whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(({ d, u }, i) => (
                  <tr key={d.id} onClick={() => setOpen(d)} className={`cursor-pointer border-t border-[#EEF2F8] hover:bg-[#F2F6FD] ${i % 2 ? "bg-[#FBFCFE]" : "bg-white"}`}>
                    <td className="px-3 py-2.5 text-center"><span className={`inline-block px-2 py-0.5 rounded-md text-[12px] font-black ${gradeOf(d) === "지입" ? "bg-[#0F1A30] text-white" : "bg-[#EEF3FC] text-[#2D4C82]"}`}>{gradeOf(d)}</span></td>
                    <td className="px-3 py-2.5 text-center font-black text-[#0F1A30]">{nameOf(d) || "-"}</td>
                    <td className="px-3 py-2.5 text-center font-bold tabular-nums" style={num}>{plateOf(d) || "-"}</td>
                    <td className="px-3 py-2.5 text-center text-[#3A4A66]">{[d.차량종류, d.톤수 || d.차량톤수].filter(Boolean).join(" · ") || "-"}</td>
                    <td className="px-3 py-2.5 text-center text-[#3A4A66] tabular-nums" style={num}>{phoneOf(d) || "-"}</td>
                    <td className="px-3 py-2.5 text-center">{u.todayIn ? <span className="font-black text-[#0F7A43]">{hm(u.todayIn)} 출근{u.todayOut ? <span className="text-[#7A879C] font-bold"> · {hm(u.todayOut)} 퇴근</span> : ""}</span> : <span className="text-[#9AA9C3] font-bold">{logs ? "출근 전" : "…"}</span>}</td>
                    <td className="px-3 py-2.5 text-center font-black tabular-nums" style={num}>{logs ? `${u.days}일` : "…"}</td>
                    <td className="px-3 py-2.5 text-center text-[#5B6B85] tabular-nums" style={num}>{u.lastIn ? md(u.lastIn) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BookCard>
      {open && (() => { const u = dutyOf(open, logs); const hist = Array.isArray(open.hrOrders) ? [...open.hrOrders].sort((a, b) => String(b.date).localeCompare(String(a.date))) : []; return (
        <Sheet en="HR · DRIVER" title={`${nameOf(open)} 기사`} onClose={() => setOpen(null)}
          footer={<>{canManage && onOrder && <button type="button" onClick={() => { setOpen(null); onOrder(open); }} className="h-12 px-5 rounded-xl bg-[#0F1A30] text-white text-[14.5px] font-black">인사발령 작성</button>}<button type="button" onClick={() => setOpen(null)} className="flex-1 h-12 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">닫기</button></>}>
          <div className="grid grid-cols-2 gap-2">
            {[["구분", gradeOf(open)], ["차량번호", plateOf(open) || "-"], ["차종 · 톤수", [open.차량종류, open.톤수 || open.차량톤수].filter(Boolean).join(" · ") || "-"], ["연락처", phoneOf(open) || "-"], ["이번 달 근무", `${u.days}일`], ["오늘", u.todayIn ? `${hm(u.todayIn)} 출근` : "출근 전"]].map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-white border border-[#E3E8F0] px-3.5 py-2.5"><div className="text-[11.5px] font-bold text-[#7A879C]">{l}</div><div className="text-[15px] font-black text-[#0F1A30]">{v}</div></div>
            ))}
          </div>
          <div>
            <div className="text-[13.5px] font-black text-[#0F1A30] mb-1.5">이번 달 출퇴근 기록</div>
            {!u.list.length ? <div className="text-[13px] text-[#9AA9C3]">기록이 없어요.</div> : (
              <div className="rounded-xl border border-[#E3E8F0] divide-y divide-[#EEF1F6] max-h-[240px] overflow-y-auto">
                {u.list.map((l, i) => <div key={i} className="flex items-center gap-3 px-3 py-2 text-[13px]"><span className="tabular-nums text-[#5B6B85] w-[92px]" style={num}>{md(tsMs(l.timestamp))} {hm(tsMs(l.timestamp))}</span><span className="font-black text-[#0F1A30]">{l.status}</span>{l.auto && <span className="text-[11.5px] text-[#7A879C]">{l.autoReason || "자동"}</span>}</div>)}
              </div>)}
          </div>
          <div>
            <div className="text-[13.5px] font-black text-[#0F1A30] mb-1.5">인사발령 이력</div>
            {!hist.length ? <div className="text-[13px] text-[#9AA9C3]">발령 이력이 없어요.</div> : hist.map((h, i) => <div key={i} className="text-[13px] py-1"><b className="tabular-nums" style={num}>{h.date}</b> · {h.type}{h.from || h.to ? ` (${h.from || "-"} → ${h.to || "-"})` : ""}{h.memo ? ` · ${h.memo}` : ""}</div>)}
          </div>
        </Sheet>); })()}
    </div>
  );
}

// ═════════════ 인사발령 › 기사 ═════════════
export const DRIVER_ORDER_KINDS = ["구분 변경", "채용", "휴직", "복직", "계약 해지"];
export function DriverOrderPanel({ company, driver, myName = "", onDone }) {
  const [f, setF] = React.useState(() => ({ type: "구분 변경", to: gradeOf(driver), date: kstDay(), memo: "" }));
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState("");
  React.useEffect(() => { setF({ type: "구분 변경", to: gradeOf(driver), date: kstDay(), memo: "" }); setDone(""); }, [driver?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!driver) return null;
  const from = gradeOf(driver);
  const changes = f.type === "구분 변경" && f.to && f.to !== from;
  const text = `${company} 인사발령\n\n대상: ${nameOf(driver)} 기사 (${plateOf(driver) || "-"} · ${from})\n발령: ${f.type}${changes ? ` — ${from} → ${f.to}` : ""}\n발령일: ${f.date}${f.memo ? `\n사유: ${f.memo}` : ""}`;
  const send = async () => {
    if (f.type === "구분 변경" && !changes) return alert("바꿀 구분을 골라 주세요.");
    if (!(await kpConfirm(`${nameOf(driver)} 기사 인사발령을 낼까요?\n\n· 사내 공지(인사발령)에 올라가요${changes ? `\n· 기사관리의 구분이 ${from} → ${f.to} 로 바뀌어요` : ""}${f.type === "계약 해지" ? "\n· 지입관리 목록에서 빠져요" : ""}`))) return;
    setBusy(true);
    try {
      const rec = { type: f.type, from, to: changes ? f.to : "", date: f.date, memo: f.memo, by: myName, at: Date.now() };
      await updateDoc(doc(db, "drivers", driver.id), { hrOrders: arrayUnion(rec), ...(changes ? { 등급: f.to } : {}), ...(f.type === "계약 해지" ? { 퇴사: true, 퇴사일: f.date } : {}), ...(f.type === "휴직" ? { 휴직: true } : {}), ...(f.type === "복직" ? { 휴직: false } : {}) });
      await addDoc(collection(db, "notices"), {
        title: `${f.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (m, y, mo, d) => `${y}년 ${Number(mo)}월 ${Number(d)}일`)} 인사발령(기사)`, category: "인사발령", author: myName, content: text,
        audience: "internal", audiences: ["internal"], authorUid: auth.currentUser?.uid || "", createdAt: serverTimestamp(), companyName: company,
        hrOrder: { kind: "driver", driverId: driver.id, name: nameOf(driver), from, to: rec.to, date: f.date, type: f.type },
      });
      setDone("발령을 냈어요. 사내 공지(인사발령)에 올라갔어요.");
      onDone?.();
    } catch (e) { alert(`발령하지 못했어요: ${e?.message || e}`); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4" data-kp="driver-order">
      <div className="rounded-[20px] bg-white border border-[#E3E8F0] p-5 space-y-3">
        <div className="text-[16px] font-black text-[#0F1A30]">기사 인사발령</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">발령 구분</div><div className="flex flex-wrap gap-1.5">{DRIVER_ORDER_KINDS.map((k) => <Chip key={k} on={f.type === k} onClick={() => setF((p) => ({ ...p, type: k }))}>{k}</Chip>)}</div></div>
          <div><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">발령일</div><CustomDatePicker value={f.date} onChange={(e) => setF((p) => ({ ...p, date: e.target.value }))} className={inp} showIcon /></div>
          {f.type === "구분 변경" && <div><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">구분 ({from} →)</div><CustomSelect value={f.to} onChange={(e) => setF((p) => ({ ...p, to: e.target.value }))} className={inp}>{FLEET_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}</CustomSelect></div>}
          <div className={f.type === "구분 변경" ? "" : "sm:col-span-2"}><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">사유 · 메모</div><input value={f.memo} onChange={(e) => setF((p) => ({ ...p, memo: e.target.value }))} className={inp} placeholder="예) 직영 전환 계약" /></div>
        </div>
        <pre className="whitespace-pre-wrap rounded-xl bg-[#F5F8FD] border border-[#DCE3EE] px-4 py-3 text-[13.5px] leading-[1.7] text-[#1F2D47]" style={{ fontFamily: "inherit" }}>{text}</pre>
        <div className="flex items-center gap-3">
          <button type="button" disabled={busy} onClick={send} className="h-11 px-5 rounded-xl bg-[#0F1A30] text-white text-[14.5px] font-black disabled:opacity-50">{busy ? "보내는 중…" : "발령 공문 올리기"}</button>
          {done && <span className="text-[13.5px] font-bold text-[#0F7A43]">{done}</span>}
        </div>
      </div>
    </div>
  );
}

// ═════════════ 팀 고르기(입력형 드롭다운) ═════════════
export function TeamPicker({ value = "전체", onChange, teams = [] }) {
  const [text, setText] = React.useState(value === "전체" ? "" : value);
  const [open, setOpen] = React.useState(false);
  const box = React.useRef(null);
  React.useEffect(() => { setText(value === "전체" ? "" : value); }, [value]);
  React.useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (box.current && !box.current.contains(e.target)) { setOpen(false); setText(value === "전체" ? "" : value); } };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open, value]);
  const all = ["전체", ...teams];
  const k = text.trim();
  const list = k && k !== value ? all.filter((t) => t.includes(k)) : all;
  const pick = (t) => { onChange?.(t); setText(t === "전체" ? "" : t); setOpen(false); };
  return (
    <div ref={box} className="relative" data-kp="team-picker">
      <div className="flex items-center h-10 rounded-xl border border-[#DCE3EE] bg-white focus-within:border-[#4B6CB7] focus-within:ring-4 focus-within:ring-[#4B6CB7]/10">
        <span className="pl-3 pr-1 text-[12px] font-black text-[#7A879C] shrink-0">팀</span>
        <input value={text} onFocus={() => setOpen(true)} onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); pick(list[0] || "전체"); } if (e.key === "Escape") setOpen(false); }}
          placeholder="전체: 팀 이름을 적거나 고르세요" className="flex-1 min-w-0 h-full px-1.5 text-[13px] font-bold text-[#0F1A30] outline-none bg-transparent placeholder:text-[#A7B3C6] placeholder:font-semibold" autoComplete="off" />
        {value !== "전체" && <button type="button" onClick={() => pick("전체")} className="px-1.5 text-[#9AA9C3] hover:text-[#0F1A30] text-[14px]" aria-label="팀 지우기">×</button>}
        <button type="button" tabIndex={-1} onClick={() => setOpen((v) => !v)} className="h-full px-3 text-[#5B6B85] text-[12px]" aria-label="팀 목록">▾</button>
      </div>
      {open && (
        <div className="absolute z-40 left-0 right-0 top-full mt-1 rounded-xl border border-[#DCE3EE] bg-white shadow-[0_18px_40px_rgba(15,26,48,.18)] max-h-[260px] overflow-y-auto overscroll-contain">
          {!list.length && <div className="px-3.5 py-3 text-[13px] text-[#9AA9C3]">맞는 팀이 없어요</div>}
          {list.map((t) => (
            <button key={t} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(t)}
              className={`w-full text-left px-3.5 py-2.5 border-b border-[#EEF1F6] last:border-0 text-[13.5px] font-bold ${t === value ? "bg-[#EEF3FC] text-[#0F1A30]" : "text-[#1B2B4B] hover:bg-[#F5F8FD]"}`}>{t === value ? "✓ " : ""}{t}</button>
          ))}
        </div>
      )}
    </div>
  );
}
