// ======================= src/SafetyEdu.jsx =======================
// 🦺 2026-11-24 안전교육 화면
//  · EduCourseList   — 교육 카드 목록(직원 HOME › 사내 게시판 › 안전교육 · 기사앱 › 서류함 › 안전교육 공용)
//  · SafetyEduMine   — 내 교육(기록 · 회사 설정을 읽고 EduPlayer 를 연다)
//  · SafetyEduAdmin  — 인사관리부 › 안전교육: 이수 현황판 + 기사 영상 대체 설정
//  보이는 것: 우리 회사 기록만(규칙: eduRecords 는 본인 · 같은 회사 사무 직원만 읽는다)
import React from "react";
import EduPlayer from "./EduPlayer";
import { coursesFor, courseById, eduPeriod, eduRecordId, eduStatusOf, driverMayPledge } from "./safetyEdu";

const NAVY = "#1B2B4B";
const INK = "#0B1428";
const SUB = "#6B7A93";
const LINE = "#E3E8F0";

const ymd = (ts) => {
  const d = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : ts instanceof Date ? ts : null;
  return d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}` : "";
};

// 상태 표시 — 알록달록하지 않게 남색 · 회색만
function StatusPill({ st }) {
  const sty = st.key === "done" ? { background: NAVY, color: "#fff" }
    : st.key === "pledge" ? { background: "#E8ECF3", color: NAVY }
    : { background: "#fff", color: "#8A97AD", border: `1px solid ${LINE}` };
  return <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[11.5px] font-extrabold whitespace-nowrap" style={sty}>{st.key === "todo" ? st.label : `✓ ${st.label}`}</span>;
}

// 교육 카드 목록
export function EduCourseList({ courses, records = {}, onOpen, mayPledge = false }) {
  const todo = courses.filter((c) => !records[c.id]).length;
  return (
    <div>
      <div className="rounded-2xl px-4 py-3.5 mb-3 flex items-center gap-3" style={{ background: todo ? "#F1F4F9" : NAVY }}>
        <span className="text-[22px] leading-none">{todo ? "🦺" : "✅"}</span>
        <div className="flex-1">
          <div className="text-[14.5px] font-extrabold" style={{ color: todo ? INK : "#fff" }}>{todo ? `아직 안 받은 교육이 ${todo}개 있어요` : "올해 교육을 모두 이수했어요"}</div>
          <div className="text-[12px] font-medium mt-0.5" style={{ color: todo ? SUB : "rgba(255,255,255,0.75)" }}>
            {todo ? (mayPledge ? "영상 교육은 서약서 서명으로 대신할 수 있어요" : "영상을 끝까지 보고 서명하면 이수돼요") : "내년에 다시 받으면 돼요"}
          </div>
        </div>
      </div>
      <div className="space-y-2.5">
        {courses.map((c) => {
          const rec = records[c.id];
          const st = eduStatusOf(rec);
          return (
            <button key={c.id} type="button" onClick={() => onOpen(c)} className="w-full text-left rounded-2xl bg-white px-4 py-3.5 flex items-center gap-3 active:bg-[#F6F8FB]" style={{ border: `1px solid ${LINE}` }}>
              <span className="w-11 h-11 rounded-xl flex items-center justify-center text-[21px] shrink-0" style={{ background: "#F1F4F9" }}>{c.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[14.5px] font-extrabold truncate" style={{ color: INK }}>{c.title}</div>
                <div className="text-[12px] font-medium mt-0.5 truncate" style={{ color: SUB }}>
                  {c.kind === "video" ? `영상 ${c.minutes}분` : `서약서 · ${c.minutes}분`} · {rec ? `${ymd(rec.signedAt)} 이수` : c.summary}
                </div>
              </div>
              <StatusPill st={st} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 내 교육 — user: { uid, name, companyName, role, carNo }
export function SafetyEduMine({ user, audience, title = "안전교육" }) {
  const aud = audience || (user?.role === "driver" ? "driver" : "staff");
  const courses = coursesFor(aud);
  const [records, setRecords] = React.useState({});
  const [settings, setSettings] = React.useState(null);
  const [open, setOpen] = React.useState(null);
  const co = String(user?.companyName || "").trim();
  React.useEffect(() => {
    if (!user?.uid || !co) return undefined;
    let unsub = () => {}; let alive = true;
    (async () => {
      const [{ collection, query, where, onSnapshot, doc, getDoc }, { db }] = await Promise.all([import("./fsTenant"), import("./firebase")]);
      if (!alive) return;
      unsub = onSnapshot(query(collection(db, "eduRecords"), where("companyName", "==", co), where("uid", "==", user.uid)), (snap) => {
        const m = {};
        snap.docs.forEach((d) => { const x = d.data(); const c = courseById(x.courseId); if (c && x.period === eduPeriod(c)) m[x.courseId] = x; });
        setRecords(m);
      }, () => {});
      const s = await getDoc(doc(db, "eduSettings", co)).catch(() => null);
      if (alive) setSettings(s?.exists() ? s.data() : {});
    })();
    return () => { alive = false; unsub(); };
  }, [user?.uid, co]);
  const mayPledge = aud === "driver" && driverMayPledge(settings, user?.uid);
  const pledgeCourse = courses.find((c) => c.kind === "doc") || null;
  return (
    <div>
      {title && <div className="text-[18px] font-black mb-3" style={{ color: INK }}>{title}</div>}
      <EduCourseList courses={courses} records={records} onOpen={setOpen} mayPledge={mayPledge} />
      {open && (
        <EduPlayer course={open} user={{ ...user, companyName: co }} mayPledge={mayPledge && open.kind === "video"} pledgeCourse={pledgeCourse}
          initialStep={records[open.id] ? "done" : undefined} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

// 미이수 수(기사앱 홈 카드 · 출근 안내)
export function useEduPending(user) {
  const [n, setN] = React.useState(0);
  const co = String(user?.companyName || "").trim();
  React.useEffect(() => {
    if (!user?.uid || !co) return undefined;
    let unsub = () => {}; let alive = true;
    const courses = coursesFor(user.role === "driver" ? "driver" : "staff");
    (async () => {
      const [{ collection, query, where, onSnapshot }, { db }] = await Promise.all([import("./fsTenant"), import("./firebase")]);
      if (!alive) return;
      unsub = onSnapshot(query(collection(db, "eduRecords"), where("companyName", "==", co), where("uid", "==", user.uid)), (snap) => {
        const done = new Set(snap.docs.map((d) => d.data()).filter((x) => { const c = courseById(x.courseId); return c && x.period === eduPeriod(c); }).map((x) => x.courseId));
        setN(courses.filter((c) => !done.has(c.id)).length);
      }, () => {});
    })();
    return () => { alive = false; unsub(); };
  }, [user?.uid, user?.role, co]);
  return n;
}

// ── 관리자 현황판 ──
//  people: [{ uid, name, role, team, carNo }] · records: eduRecords 배열 · settings: eduSettings/{회사}
export function EduAdminBoard({ people, records, settings = {}, canManage, onSaveSettings, onViewSign }) {
  const [aud, setAud] = React.useState("driver");
  const [q, setQ] = React.useState("");
  const [onlyTodo, setOnlyTodo] = React.useState(false);
  const [setOpen, setSetOpen] = React.useState(false);
  const courses = coursesFor(aud);
  const list = people.filter((p) => (aud === "driver" ? p.role === "driver" : p.role !== "driver"));
  const recMap = React.useMemo(() => {
    const m = {};
    records.forEach((r) => { const c = courseById(r.courseId); if (c && r.period === eduPeriod(c)) m[`${r.uid}__${r.courseId}`] = r; });
    return m;
  }, [records]);
  const rows = list
    .map((p) => ({ p, recs: courses.map((c) => recMap[`${p.uid}__${c.id}`] || null) }))
    .map((r) => ({ ...r, doneN: r.recs.filter(Boolean).length }))
    .filter((r) => (!q || `${r.p.name}${r.p.carNo || ""}${r.p.team || ""}`.includes(q)) && (!onlyTodo || r.doneN < courses.length))
    .sort((a, b) => a.doneN - b.doneN || String(a.p.name).localeCompare(String(b.p.name), "ko"));
  const total = list.length;
  const allDone = list.filter((p) => courses.every((c) => recMap[`${p.uid}__${c.id}`])).length;
  const rate = total ? Math.round((allDone / total) * 100) : 0;
  const mode = settings.driverVideo || "required";
  const modeLabel = { required: "영상 시청 필수", pledgeAll: "모든 기사 서약서로 대체", pick: "고른 기사만 서약서로 대체" }[mode];

  const exportCsv = () => {
    const head = ["이름", aud === "driver" ? "차량번호" : "부서", ...courses.map((c) => c.title)];
    const lines = rows.map((r) => [r.p.name, aud === "driver" ? r.p.carNo || "" : r.p.team || "", ...r.recs.map((x) => (x ? `${eduStatusOf(x).label} ${ymd(x.signedAt)}` : "미이수"))]);
    const csv = "﻿" + [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `안전교육_이수현황_${aud === "driver" ? "기사" : "직원"}.csv`; a.click();
  };

  return (
    <div className="text-[13px]" style={{ color: INK }}>
      {/* 위 요약 */}
      <div className="grid grid-cols-3 gap-2.5 mb-3">
        {[["대상", `${total}명`], ["모두 이수", `${allDone}명`], ["이수율", `${rate}%`]].map(([k, v], i) => (
          <div key={k} className="rounded-2xl px-4 py-3" style={i === 2 ? { background: NAVY, color: "#fff" } : { background: "#fff", border: `1px solid ${LINE}` }}>
            <div className="text-[12px] font-bold" style={{ color: i === 2 ? "rgba(255,255,255,0.7)" : SUB }}>{k}</div>
            <div className="text-[22px] font-black tabular-nums mt-0.5">{v}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex p-1 rounded-xl" style={{ background: "#EEF1F6" }}>
          {[["driver", "🚚 기사"], ["staff", "🏢 직원"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setAud(k)} className="h-8 px-3.5 rounded-lg text-[13px] font-extrabold"
              style={aud === k ? { background: "#fff", color: INK, boxShadow: "0 1px 2px rgba(11,20,40,0.08)" } : { color: SUB }}>{l}</button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={aud === "driver" ? "이름 · 차량번호" : "이름 · 부서"} className="h-9 px-3 rounded-xl bg-white text-[13px] w-[170px] outline-none" style={{ border: `1px solid ${LINE}` }} />
        <label className="inline-flex items-center gap-1.5 text-[12.5px] font-bold cursor-pointer" style={{ color: SUB }}>
          <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} style={{ accentColor: NAVY }} /> 미이수만
        </label>
        <div className="flex-1" />
        {aud === "driver" && canManage && (
          <button type="button" onClick={() => setSetOpen(true)} className="h-9 px-3 rounded-xl bg-white text-[12.5px] font-extrabold inline-flex items-center gap-1.5" style={{ border: `1px solid ${LINE}`, color: NAVY }}>
            ⚙️ 영상 대체 설정 <span className="font-bold" style={{ color: SUB }}>· {modeLabel}</span>
          </button>
        )}
        <button type="button" onClick={exportCsv} className="h-9 px-3 rounded-xl bg-white text-[12.5px] font-extrabold" style={{ border: `1px solid ${LINE}`, color: NAVY }}>엑셀 내려받기</button>
      </div>

      <div className="rounded-2xl bg-white overflow-x-auto" style={{ border: `1px solid ${LINE}` }}>
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr style={{ background: "#F6F8FB" }}>
              <th className="text-left px-4 py-2.5 text-[12px] font-extrabold" style={{ color: SUB, borderBottom: `1px solid ${LINE}` }}>{aud === "driver" ? "기사" : "직원"}</th>
              {courses.map((c) => (
                <th key={c.id} className="text-left px-3 py-2.5 text-[12px] font-extrabold" style={{ color: SUB, borderBottom: `1px solid ${LINE}` }}>{c.emoji} {c.title}</th>
              ))}
              <th className="text-right px-4 py-2.5 text-[12px] font-extrabold" style={{ color: SUB, borderBottom: `1px solid ${LINE}` }}>진행</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, recs, doneN }) => (
              <tr key={p.uid} style={{ borderBottom: `1px solid ${LINE}` }}>
                <td className="px-4 py-2.5">
                  <div className="font-extrabold text-[13.5px]">{p.name}</div>
                  <div className="text-[11.5px] font-medium" style={{ color: SUB }}>
                    {aud === "driver" ? p.carNo || "-" : p.team || "-"}
                    {aud === "driver" && driverMayPledge(settings, p.uid) && <span className="ml-1.5 px-1.5 py-px rounded text-[10.5px] font-extrabold" style={{ background: "#EEF1F6", color: NAVY }}>서약서 대체</span>}
                  </div>
                </td>
                {recs.map((r, i) => (
                  <td key={courses[i].id} className="px-3 py-2.5">
                    {r ? (
                      <button type="button" onClick={() => onViewSign?.(r)} className="text-left">
                        <StatusPill st={eduStatusOf(r)} />
                        <div className="text-[11px] font-semibold mt-1 tabular-nums" style={{ color: SUB }}>{ymd(r.signedAt)}</div>
                      </button>
                    ) : <StatusPill st={eduStatusOf(null)} />}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right">
                  <span className="text-[13px] font-black tabular-nums" style={{ color: doneN === courses.length ? NAVY : "#A9B5C8" }}>{doneN}/{courses.length}</span>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={courses.length + 2} className="px-4 py-10 text-center text-[13px] font-semibold" style={{ color: SUB }}>{onlyTodo ? "미이수 인원이 없어요" : "대상이 없어요"}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[12px] font-medium" style={{ color: SUB }}>이수 칸을 누르면 서명을 볼 수 있어요. 해마다 받는 교육은 1월 1일에 다시 미이수로 바뀌어요.</div>

      {setOpen && <PledgeSettings settings={settings} drivers={list} onClose={() => setSetOpen(false)} onSave={async (v) => { await onSaveSettings?.(v); setSetOpen(false); }} />}
    </div>
  );
}

// 기사 영상 대체 설정
function PledgeSettings({ settings, drivers, onClose, onSave }) {
  const [mode, setMode] = React.useState(settings.driverVideo || "required");
  const [pick, setPick] = React.useState(new Set(settings.pledgeUids || []));
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const opts = [
    ["required", "영상 시청 필수", "모든 기사가 영상을 끝까지 보고 서명해야 이수돼요"],
    ["pick", "고른 기사만 서약서로 대체", "아래에서 고른 기사만 영상 없이 서약서 서명으로 이수해요"],
    ["pledgeAll", "모든 기사 서약서로 대체", "영상은 볼 수 있지만, 안 봐도 서약서 서명으로 이수해요"],
  ];
  const shown = drivers.filter((d) => !q || `${d.name}${d.carNo || ""}`.includes(q));
  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center" style={{ background: "rgba(11,20,40,0.5)" }} onClick={onClose}>
      <div className="w-full sm:max-w-[480px] max-h-[88vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 flex items-center" style={{ borderBottom: `1px solid ${LINE}` }}>
          <div className="flex-1">
            <div className="text-[16px] font-black" style={{ color: INK }}>기사 영상 대체 설정</div>
            <div className="text-[12px] font-medium mt-0.5" style={{ color: SUB }}>영상 교육을 서약서 서명으로 대신할 수 있게 해요</div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#F1F4F8", color: SUB }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {opts.map(([k, t, d]) => (
              <label key={k} className="flex items-start gap-3 rounded-xl px-3.5 py-3 cursor-pointer" style={{ border: `1.5px solid ${mode === k ? NAVY : LINE}`, background: mode === k ? "#F6F8FB" : "#fff" }}>
                <input type="radio" name="edu-mode" checked={mode === k} onChange={() => setMode(k)} className="mt-0.5" style={{ accentColor: NAVY }} />
                <div>
                  <div className="text-[14px] font-extrabold" style={{ color: INK }}>{t}</div>
                  <div className="text-[12px] font-medium mt-0.5" style={{ color: SUB }}>{d}</div>
                </div>
              </label>
            ))}
          </div>
          {mode === "pick" && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[13px] font-extrabold" style={{ color: INK }}>서약서로 대체할 기사</span>
                <span className="text-[12px] font-bold" style={{ color: SUB }}>{pick.size}명</span>
                <div className="flex-1" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 차량번호" className="h-8 px-2.5 rounded-lg text-[12.5px] w-[130px] outline-none" style={{ border: `1px solid ${LINE}` }} />
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
                {shown.map((d, i) => (
                  <label key={d.uid} className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer" style={i ? { borderTop: `1px solid ${LINE}` } : null}>
                    <input type="checkbox" checked={pick.has(d.uid)} onChange={(e) => { const n = new Set(pick); if (e.target.checked) n.add(d.uid); else n.delete(d.uid); setPick(n); }} style={{ accentColor: NAVY }} className="w-4 h-4" />
                    <span className="text-[13.5px] font-bold" style={{ color: INK }}>{d.name}</span>
                    <span className="text-[12px] font-medium" style={{ color: SUB }}>{d.carNo || ""}</span>
                  </label>
                ))}
                {!shown.length && <div className="px-3.5 py-6 text-center text-[12.5px] font-semibold" style={{ color: SUB }}>기사가 없어요</div>}
              </div>
            </div>
          )}
          <div className="mt-4 rounded-xl px-3.5 py-2.5 text-[12px] font-medium leading-relaxed" style={{ background: "#F6F8FB", color: SUB }}>
            서약서로 이수한 기록은 현황판에 “서약서로 이수”로 따로 표시돼요.
          </div>
        </div>
        <div className="px-5 py-3 flex gap-2" style={{ borderTop: `1px solid ${LINE}` }}>
          <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl text-[14px] font-extrabold" style={{ background: "#F1F4F8", color: SUB }}>취소</button>
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onSave({ driverVideo: mode, pledgeUids: [...pick] }); } finally { setBusy(false); } }}
            className="flex-[2] h-11 rounded-xl text-[14px] font-extrabold text-white" style={{ background: NAVY }}>{busy ? "저장하는 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}

// 서명 보기
function SignView({ rec, onClose }) {
  const c = courseById(rec.courseId);
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center px-4" style={{ background: "rgba(11,20,40,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="text-[15px] font-black" style={{ color: INK }}>{c?.emoji} {rec.courseTitle || c?.title}</div>
        <div className="mt-3 grid grid-cols-[64px_1fr] gap-y-1.5 text-[13px]">
          <span className="font-bold" style={{ color: SUB }}>이름</span><span className="font-extrabold">{rec.name}{rec.carNo ? ` · ${rec.carNo}` : ""}</span>
          <span className="font-bold" style={{ color: SUB }}>방식</span><span className="font-semibold">{eduStatusOf(rec).label}</span>
          <span className="font-bold" style={{ color: SUB }}>서명일</span><span className="font-semibold">{ymd(rec.signedAt)}</span>
        </div>
        {rec.signImage && <img src={rec.signImage} alt="서명" className="mt-3 w-full h-[130px] object-contain rounded-xl" style={{ border: `1px solid ${LINE}`, background: "#FAFBFD" }} />}
        <button type="button" onClick={onClose} className="mt-4 w-full h-11 rounded-xl text-[14px] font-extrabold text-white" style={{ background: NAVY }}>닫기</button>
      </div>
    </div>
  );
}

// 인사관리부 › 안전교육 — Firestore 연결
export function SafetyEduAdmin({ company, canManage }) {
  const co = String(company || "").trim();
  const [people, setPeople] = React.useState([]);
  const [records, setRecords] = React.useState([]);
  const [settings, setSettings] = React.useState({});
  const [view, setView] = React.useState(null);
  React.useEffect(() => {
    if (!co) return undefined;
    let alive = true; const unsubs = [];
    (async () => {
      const [{ collection, query, where, onSnapshot, doc }, { db }] = await Promise.all([import("./fsTenant"), import("./firebase")]);
      if (!alive) return;
      unsubs.push(onSnapshot(query(collection(db, "users"), where("companyName", "==", co)), (s) => {
        setPeople(s.docs.map((d) => ({ uid: d.id, ...d.data() }))
          .filter((u) => u.approved !== false && u.role !== "shipper" && u.role !== "cafeUser" && u.employmentStatus !== "퇴사" && !u.resignedAt)
          .map((u) => ({ uid: u.uid || u.id, name: u.name || u.이름 || u.email || "-", role: u.role, team: u.team || "", carNo: u.carNo || u.차량번호 || "" })));
      }, () => {}));
      unsubs.push(onSnapshot(query(collection(db, "eduRecords"), where("companyName", "==", co)), (s) => setRecords(s.docs.map((d) => d.data())), () => {}));
      unsubs.push(onSnapshot(doc(db, "eduSettings", co), (s) => setSettings(s.exists() ? s.data() : {}), () => {}));
    })();
    return () => { alive = false; unsubs.forEach((u) => u()); };
  }, [co]);
  const save = async (v) => {
    const [{ doc, setDoc, serverTimestamp }, { db }] = await Promise.all([import("./fsTenant"), import("./firebase")]);
    await setDoc(doc(db, "eduSettings", co), { ...v, companyName: co, updatedAt: serverTimestamp() }, { merge: true });
  };
  return (
    <div>
      <EduAdminBoard people={people} records={records} settings={settings} canManage={canManage} onSaveSettings={save} onViewSign={setView} />
      {view && <SignView rec={view} onClose={() => setView(null)} />}
    </div>
  );
}

export { SignView, eduRecordId };
