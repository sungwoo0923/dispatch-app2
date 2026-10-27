// ======================= src/AutomationPanels.jsx =======================
// 🔁 정기오더 / 📨 마감보고 (2026-10-27)
//  - 정기오더: 배차관리 [정기오더] 버튼 — 지금 입력한 오더를 요일·생성 시각과 함께 등록해 두면 서버가 자동으로 만든다.
//    (입력 권한이 있는 누구나 쓴다 · 자동 생성분은 알림을 보내지 않는다 · 같은 날짜로는 한 번만)
//  - 마감보고: 일마감 검증 창 [마감보고 전송] — 그날 실적·검증 결과를 고른 사람들에게 푸시로 보낸다.
import React from "react";
import { db, auth } from "./firebase";
import { collection, doc, onSnapshot, query, where, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { callFn, kstToday, addDays, won } from "./kpApi";
import { isTMUser } from "./staffFilter";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAYS = [1, 2, 3, 4, 5];
const chip = (on, sm) => `${sm ? "h-8 min-w-[34px] text-[12.5px]" : "h-9 min-w-[38px] text-[13px]"} px-2.5 rounded-xl font-black border transition ${on ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE] hover:border-[#4B6CB7]"}`;
const daysLabel = (days = []) => {
  const s = [...days].sort((a, b) => a - b);
  if (s.length === 7) return "매일";
  if (s.join() === WEEKDAYS.join()) return "평일";
  return s.map((d) => DAYS[d]).join("·") || "요일 없음";
};
const dowOf = (ymd) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
// 다음에 만들어질 오더의 상차일
const nextRunDate = (t) => {
  for (let i = 0; i <= 8; i++) {
    const d = addDays(kstToday(), i);
    if (!(t.days || []).includes(dowOf(d))) continue;
    const makeDay = t.createWhen === "same" ? d : addDays(d, -1);
    const hourNow = new Date(Date.now() + 9 * 3600e3).getUTCHours();
    if (makeDay > kstToday() || (makeDay === kstToday() && hourNow < Number(t.createHour ?? 17))) return d;
  }
  return null;
};
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const sel = "h-9 px-2.5 rounded-xl border border-[#DCE3EE] text-[13px] font-bold text-[#0F1A30] bg-white outline-none focus:border-[#4B6CB7]";
const companyNow = () => localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "돌캐";

// 오더 내용만 남긴다(이력·시스템 값·날짜 제외) — 날짜는 만들 때마다 새로 정한다
const SKIP = new Set(["_id", "id", "__col", "history", "createdAt", "updatedAt", "_lastModified", "상차일", "하차일", "등록일", "배차상태", "상태",
  "배차확정일시", "배차확정자", "배차완료일시", "업체전달상태", "업체전달일시", "업체전달방법", "업체전달자", "_gsheetSync", "_gsheetMine", "_gsheetMineSent", "_gsheetMineSentAt",
  "attachCount", "attachViewed", "기사확인상태", "기사확인일시", "기사완료일시", "위치", "위치갱신일시", "위치공유중", "정기오더", "_recurring", "복구일시", "복구자", "블라인드", "_restAck"]);
const orderSnapshot = (o) => {
  const out = {};
  // 배차관리 저장과 같은 방식으로 화물내용을 완성(예: "3" + 화물타입 "파렛트" → "3파렛트")
  const full = String(o?.화물내용 || "");
  if (o?.화물타입 && !full.split("+")[0].endsWith(o.화물타입)) {
    let base = full.split("+")[0];
    for (const sfx of ["파레트", "파렛트", "박스", "통"]) if (base.endsWith(sfx)) { base = base.slice(0, -sfx.length).trim(); break; }
    o = { ...o, 화물내용: `${base}${o.화물타입}${full.replace(/^[^+]*/, "")}` };
  }
  Object.entries(o || {}).forEach(([k, v]) => { if (!SKIP.has(k) && v !== undefined && v !== "" && typeof v !== "function") out[k] = v; });
  return JSON.parse(JSON.stringify(out));
};

function ModalShell({ eyebrow, title, desc, onClose, width = 720, children }) {
  return (
    <div className="fixed inset-0 z-[1000000] bg-[#0F1A30]/45 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-h-[90vh] bg-[#F7F9FC] rounded-[22px] shadow-[0_24px_60px_rgba(15,26,48,0.35)] flex flex-col overflow-hidden" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 bg-gradient-to-r from-[#0F1A30] via-[#1B2B4B] to-[#2D4C82] text-white flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-white/60">{eyebrow}</div>
            <div className="text-[19px] font-black">{title}</div>
            {desc && <div className="text-[12.5px] text-white/70 mt-0.5">{desc}</div>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 text-white text-[16px] shrink-0">✕</button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}
const Box = ({ title, right, children }) => (
  <section className="bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-4 space-y-3">
    {(title || right) && <div className="flex items-center justify-between gap-2"><div className="text-[14.5px] font-black text-[#0F1A30]">{title}</div>{right}</div>}
    {children}
  </section>
);
function ScheduleFields({ days, setDays, hour, setHour, when, setWhen, sm }) {
  const toggle = (d) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort());
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {DAYS.map((d, i) => <button key={d} type="button" onClick={() => toggle(i)} className={chip(days.includes(i), sm)}>{d}</button>)}
        <button type="button" onClick={() => setDays(WEEKDAYS)} className="ml-1 text-[12px] font-bold text-[#4B6CB7]">평일</button>
        <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])} className="text-[12px] font-bold text-[#4B6CB7]">매일</button>
      </div>
      <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#3A4A66]">
        <select value={when} onChange={(e) => setWhen(e.target.value)} className={sel}>
          <option value="prev">전날</option>
          <option value="same">당일</option>
        </select>
        <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={sel}>
          {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}시</option>)}
        </select>
        <span>에 자동 등록</span>
      </div>
    </div>
  );
}

// ── 배차관리 [정기오더] ──
export function RecurringManagerModal({ form, onClose }) {
  const company = form?.companyName || companyNow();
  const ready = !!(String(form?.거래처명 || "").trim() && String(form?.상차지명 || "").trim() && String(form?.하차지명 || "").trim());
  const [list, setList] = React.useState(null);
  const [name, setName] = React.useState(() => `${form?.거래처명 || ""} ${form?.상차지명 || ""}→${form?.하차지명 || ""}`.trim());
  const [days, setDays] = React.useState(WEEKDAYS);
  const [hour, setHour] = React.useState(17);
  const [when, setWhen] = React.useState("prev");
  const [withDriver, setWithDriver] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [runDate, setRunDate] = React.useState(() => addDays(kstToday(), 1));
  const hasDriver = !!String(form?.차량번호 || "").trim();
  const dropOffset = (() => {
    const a = Date.parse(form?.상차일 || ""); const b = Date.parse(form?.하차일 || "");
    return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86400000)) : 0;
  })();

  React.useEffect(() => onSnapshot(query(collection(db, "recurringOrders"), where("companyName", "==", company)),
    (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))), () => setList([])), [company]);
  const patch = (id, p) => updateDoc(doc(db, "recurringOrders", id), p).catch((e) => setMsg(`⚠ ${e.message}`));

  const add = async () => {
    if (!days.length) { setMsg("⚠ 요일을 하나 이상 골라 주세요."); return; }
    setBusy("add"); setMsg("");
    try {
      await addDoc(collection(db, "recurringOrders"), {
        name: name.trim() || "정기오더", days, createHour: hour, createWhen: when, active: true,
        withDriver: withDriver && hasDriver, dropOffset, order: orderSnapshot({ ...form, companyName: company }), companyName: company,
        createdBy: auth.currentUser?.email || "", createdAt: serverTimestamp(),
      });
      setMsg(`등록했습니다 — ${daysLabel(days)} ${when === "same" ? "당일" : "전날"} ${hour}시에 자동으로 만들어집니다`);
    } catch (e) { setMsg(`⚠ ${e.message}`); } finally { setBusy(""); }
  };
  const run = async () => {
    setBusy("run"); setMsg("");
    try {
      const d = await callFn("automation", { action: "recurringRun", date: runDate, company });
      setMsg(d.created ? `${runDate} 오더 ${d.created}건을 만들었습니다 — ${d.names.join(", ")}` : `${runDate}에 새로 만들 정기오더가 없습니다(요일이 아니거나 이미 만듦)`);
    } catch (e) { setMsg(`⚠ ${e.message}`); } finally { setBusy(""); }
  };

  return (
    <ModalShell eyebrow="RECURRING" title="정기오더" desc="매주 같은 노선은 한 번만 등록해 두면 정한 요일·시각에 자동으로 만들어집니다" onClose={onClose}>
      <Box title="지금 입력한 오더로 등록">
        {!ready ? (
          <div className="text-[13.5px] text-[#7A879C] leading-relaxed">배차관리에 <b className="text-[#0F1A30]">거래처·상차지·하차지</b>를 먼저 입력한 뒤 눌러 주세요. 운임·시간·화물·경유지까지 그대로 등록됩니다.</div>
        ) : (
          <>
            <div className="px-3.5 py-2.5 rounded-xl bg-[#F5F8FD] text-[13px] text-[#3A4A66] leading-relaxed">
              <b className="text-[#0F1A30]">{form.거래처명}</b> · {form.상차지명} → {form.하차지명}{form.상차시간 ? ` · ${form.상차시간}` : ""}{dropOffset ? ` · 하차 ${dropOffset}일 뒤` : ""} · 청구 {won(form.청구운임)}{form.기사운임 ? ` / 기사 ${won(form.기사운임)}` : ""}
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름(예: 펠프렌 매일 김포)"
              className="w-full h-11 px-3.5 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#4B6CB7]" />
            <ScheduleFields days={days} setDays={setDays} hour={hour} setHour={setHour} when={when} setWhen={setWhen} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className={`inline-flex items-center gap-2 text-[13px] font-bold ${hasDriver ? "text-[#0F1A30]" : "text-[#B4BFD0]"}`}>
                <input type="checkbox" checked={withDriver && hasDriver} disabled={!hasDriver} onChange={(e) => setWithDriver(e.target.checked)} />
                고정 기사도 같이{hasDriver ? ` (${form.차량번호} ${form.이름 || ""})` : " — 입력된 기사 없음"}
              </label>
              <button onClick={add} disabled={!!busy} className="h-10 px-6 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-50">
                {busy === "add" ? "등록 중…" : "정기오더 등록"}
              </button>
            </div>
          </>
        )}
      </Box>

      {msg && <div className="px-4 py-2.5 rounded-xl bg-white border border-[#E3E8F0] text-[13px] font-bold text-[#0F1A30]">{msg}</div>}

      <Box title={`등록된 정기오더 ${list ? list.length : ""}`} right={
        <div className="flex items-center gap-1.5">
          <input type="date" value={runDate} onChange={(e) => setRunDate(e.target.value)} className={sel} />
          <button onClick={run} disabled={!!busy} className="h-9 px-3.5 rounded-xl border border-[#0F1A30] text-[#0F1A30] text-[12.5px] font-black disabled:opacity-50">
            {busy === "run" ? "만드는 중…" : "이 날짜로 지금 만들기"}
          </button>
        </div>
      }>
        {list === null ? (
          <div className="py-6 text-center text-[13px] text-[#9AA9C3]">불러오는 중…</div>
        ) : list.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-[#9AA9C3]">아직 등록된 정기오더가 없습니다</div>
        ) : list.map((t) => {
          const o = t.order || {};
          const next = t.active ? nextRunDate(t) : null;
          return (
            <div key={t.id} className={`rounded-2xl border px-4 py-3 space-y-2.5 ${t.active ? "border-[#E3E8F0]" : "border-[#EEF1F6] bg-[#FAFBFD]"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className={`text-[14.5px] font-black truncate ${t.active ? "text-[#0F1A30]" : "text-[#9AA9C3]"}`}>{t.name}</div>
                  <div className="text-[12.5px] text-[#5B6B85] truncate">{o.상차지명} → {o.하차지명}{o.상차시간 ? ` · ${o.상차시간}` : ""} · {won(o.청구운임)}{t.withDriver && o.차량번호 ? ` · 고정기사 ${o.차량번호}` : ""}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[12px] font-bold text-[#7A879C] mr-1">{t.active ? (next ? `다음 ${next.slice(5).replace("-", "/")}(${DAYS[dowOf(next)]})` : "") : "멈춤"}</span>
                  <button onClick={() => patch(t.id, { active: !t.active })} className={`h-8 px-3 rounded-lg text-[12px] font-black border ${t.active ? "border-[#E3E8F0] text-[#0F1A30]" : "bg-[#0F1A30] text-white border-[#0F1A30]"}`}>{t.active ? "멈추기" : "다시 켜기"}</button>
                  <button onClick={() => { if (window.confirm(`"${t.name}" 정기오더를 지울까요?\n(이미 만들어진 오더는 그대로 남습니다)`)) deleteDoc(doc(db, "recurringOrders", t.id)); }} className="h-8 px-3 rounded-lg text-[12px] font-black border border-[#E3E8F0] text-[#7A879C]">삭제</button>
                </div>
              </div>
              <ScheduleFields sm days={t.days || []} setDays={(d) => d.length && patch(t.id, { days: d })}
                hour={Number(t.createHour ?? 17)} setHour={(h) => patch(t.id, { createHour: h })}
                when={t.createWhen || "prev"} setWhen={(w) => patch(t.id, { createWhen: w })} />
            </div>
          );
        })}
      </Box>
    </ModalShell>
  );
}

// ── 일마감 검증 [마감보고 전송] ──
export function CloseReportModal({ result, onClose }) {
  const company = companyNow();
  const date = result?.date || kstToday();
  const [users, setUsers] = React.useState(null);
  const [to, setTo] = React.useState(() => new Set());
  const [memo, setMemo] = React.useState("");
  const [preview, setPreview] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const [sent, setSent] = React.useState(null);
  const myUid = auth.currentUser?.uid;

  React.useEffect(() => onSnapshot(query(collection(db, "users"), where("companyName", "==", company)), (s) => {
    const list = s.docs.map((d) => ({ uid: d.id, ...d.data() }))
      .filter((u) => u.approved !== false && u.employmentStatus !== "퇴사" && !isTMUser(u) && !["driver", "shipper"].includes(u.role) && u.uid !== myUid)
      .sort((a, b) => (a.role !== "admin") - (b.role !== "admin") || String(a.name).localeCompare(String(b.name), "ko"));
    setUsers(list);
    setTo((p) => (p.size ? p : new Set(list.filter((u) => u.role === "admin").map((u) => u.uid)))); // 처음엔 관리자들을 골라 둔다
  }, () => setUsers([])), [company, myUid]);
  React.useEffect(() => {
    callFn("automation", { action: "closeReport", date, company, preview: true }).then(setPreview).catch((e) => setErr(e.message));
  }, [date, company]);

  const send = async () => {
    if (!to.size) { setErr("받을 사람을 골라 주세요."); return; }
    setBusy("send"); setErr("");
    try {
      const d = await callFn("automation", {
        action: "closeReport", date, company, to: [...to], memo,
        check: result ? { total: result.total, passed: result.passed, errors: result.errors?.length || 0, warnings: result.warnings?.length || 0 } : null,
      });
      setSent(d);
    } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };
  const groups = React.useMemo(() => {
    const g = new Map();
    (users || []).forEach((u) => { const t = String(u.team || "").trim() || "미배정"; if (!g.has(t)) g.set(t, []); g.get(t).push(u); });
    return [...g.entries()].sort((a, b) => (a[0] === "미배정") - (b[0] === "미배정") || a[0].localeCompare(b[0], "ko"));
  }, [users]);
  const p = preview;

  return (
    <ModalShell eyebrow="DAILY CLOSE" title="마감보고 전송" desc={`${date} 마감 실적과 검증 결과를 고른 사람들의 휴대폰으로 보냅니다`} onClose={onClose} width={640}>
      {sent ? (
        <Box>
          <div className="py-6 text-center space-y-2">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#0F1A30] text-white flex items-center justify-center text-[24px]">✓</div>
            <div className="text-[17px] font-black text-[#0F1A30]">{sent.recipients}명에게 보냈습니다</div>
            <div className="text-[13px] text-[#7A879C]">{sent.pushed < sent.recipients ? `${sent.recipients - sent.pushed}명은 알림을 켜지 않아 앱 안 기록으로만 남았습니다` : "모두 휴대폰 알림으로 받습니다"}</div>
            <button onClick={onClose} className="mt-3 h-11 px-8 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black">닫기</button>
          </div>
        </Box>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[["오더", p ? `${p.count}건` : "…", p ? `완료 ${p.done} · 미배차 ${p.pending}` : ""], ["매출", p ? won(p.revenue) : "…", ""], ["수익", p ? won(p.profit) : "…", p?.revenue ? `매익률 ${Math.round((p.profit / p.revenue) * 1000) / 10}%` : ""], ["검증", result ? `${result.passed}/${result.total}` : "-", result ? `오류 ${result.errors?.length || 0} · 경고 ${result.warnings?.length || 0}` : ""]].map(([k, v, sub], i) => (
              <div key={k} className={`rounded-2xl px-4 py-3 ${i === 0 ? "bg-gradient-to-br from-[#0F1A30] to-[#2D4C82] text-white" : "bg-white border border-[#E3E8F0]"}`}>
                <div className={`text-[12px] font-bold ${i === 0 ? "text-white/60" : "text-[#7A879C]"}`}>{k}</div>
                <div className={`text-[19px] font-black tabular-nums ${i === 0 ? "" : "text-[#0F1A30]"}`}>{v}</div>
                {sub && <div className={`text-[11.5px] mt-0.5 ${i === 0 ? "text-white/70" : "text-[#5B6B85]"}`}>{sub}</div>}
              </div>
            ))}
          </div>
          {p && <div className="text-[12.5px] text-[#5B6B85] px-1">내일 오더 {p.tomorrowCount}건 중 미배차 <b className="text-[#0F1A30]">{p.tomorrowPending}건</b>도 함께 보냅니다.</div>}

          <Box title="받을 사람" right={users && <span className="text-[12px] font-bold text-[#7A879C]">{to.size}명 선택</span>}>
            {users === null ? <div className="py-4 text-center text-[13px] text-[#9AA9C3]">불러오는 중…</div> : groups.map(([t, list]) => (
              <div key={t}>
                <div className="text-[11.5px] font-black text-[#7A879C] mb-1.5">{t}</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {list.map((u) => {
                    const on = to.has(u.uid);
                    return (
                      <button key={u.uid} type="button" onClick={() => setTo((s) => { const n = new Set(s); if (n.has(u.uid)) n.delete(u.uid); else n.add(u.uid); return n; })}
                        className={`h-9 px-3.5 rounded-xl text-[13px] font-bold border transition ${on ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`}>
                        {u.name || u.email}{u.position ? ` ${u.position}` : ""}{u.role === "admin" ? " · 관리자" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </Box>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} placeholder="전달 메모(선택) — 예: 내일 김포 2건 기사 미정, 오전 중 확정 예정"
            className="w-full px-4 py-3 rounded-2xl border border-[#DCE3EE] bg-white text-[13.5px] text-[#0F1A30] outline-none focus:border-[#4B6CB7] resize-none" />
          {err && <div className="text-[13px] font-bold text-[#0F1A30]">⚠ {err}</div>}
          <button onClick={send} disabled={!!busy || !to.size} className="w-full h-12 rounded-2xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-40 shadow-[0_8px_18px_rgba(15,26,48,0.22)]">
            {busy === "send" ? "보내는 중…" : `마감보고 전송 (${to.size}명)`}
          </button>
        </>
      )}
    </ModalShell>
  );
}
