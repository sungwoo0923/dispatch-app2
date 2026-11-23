// ======================= src/SafetyEdu.jsx =======================
// 🦺 2026-11-24 안전교육 화면(디지털 교육 · 전자 서명 · 디지털 이수증)
//  · EduCourseList   — 내 교육 목록(직원 HOME › 사내 게시판 › 안전교육 · 기사앱 홈 카드)
//  · SafetyEduMine   — 내 교육(기록 · 회사 설정을 읽고 EduPlayer 를 연다 · 이수한 교육은 디지털 이수증)
//  · SafetyEduAdmin  — 인사관리부 › 안전교육: 이수 현황판(드롭다운 필터) + 기사 영상 대체 설정
//  보이는 것: 우리 회사 기록만(규칙: eduRecords 는 본인 · 같은 회사 사무 직원만 읽는다)
import React from "react";
import EduPlayer from "./EduPlayer";
import { EduIcon, EduTile } from "./eduIcons";
import { CustomSelect } from "./CustomSelect";
import { MONO, HERO_BG, Sheet } from "./OfficeBooks";
import { coursesFor, courseById, eduPeriod, eduRecordId, eduStatusOf, driverMayPledge, fmtLen, certNo, verifyCode } from "./safetyEdu";

const NAVY = "#1B2B4B";
const INK = "#0F1A30";
const SUB = "#5B6B85";
const MUTE = "#8A97AD";
const LINE = "#E3E8F0";
const EN = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };
const SEL = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-bold text-[#0F1A30] outline-none focus:border-[#2D4C82]";

const ymd = (ts) => {
  const d = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : ts instanceof Date ? ts : null;
  return d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}` : "";
};
const hm = (ts) => { const d = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : null; return d ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : ""; };

// 상태 표시 — 남색 · 회색만
export function StatusPill({ st, small = false }) {
  const base = `inline-flex items-center gap-1 rounded-full font-black whitespace-nowrap ${small ? "h-[22px] px-2 text-[11px]" : "h-[26px] px-2.5 text-[12px]"}`;
  if (st.key === "done") return <span className={base} style={{ background: NAVY, color: "#fff" }}><EduIcon name="check" size={small ? 11 : 12} stroke={3} />{st.label}</span>;
  if (st.key === "pledge") return <span className={base} style={{ background: "#E8ECF3", color: NAVY }}><EduIcon name="pledge" size={small ? 11 : 12} stroke={2.2} />{st.label}</span>;
  return <span className={base} style={{ background: "#fff", color: MUTE, border: `1px solid ${LINE}` }}>{st.label}</span>;
}

// 진행 고리
function Ring({ pct, size = 64, stroke = 7, dark = true }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? "rgba(255,255,255,.14)" : "#E8ECF3"} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? "#8FB0F0" : NAVY} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(c * pct) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill={dark ? "#fff" : INK} fontSize={size * 0.24} fontWeight="900" style={EN}>{Math.round(pct)}%</text>
    </svg>
  );
}

// 교육 목록 — 위 요약(고리) + 교육 카드
export function EduCourseList({ courses, records = {}, onOpen, onCert, mayPledge = false, year = new Date().getFullYear() }) {
  const done = courses.filter((c) => records[c.id]).length;
  const pct = courses.length ? (done / courses.length) * 100 : 0;
  const left = courses.length - done;
  return (
    <div>
      <div className="relative overflow-hidden rounded-[22px] px-5 py-4 text-white shadow-[0_14px_32px_rgba(15,26,48,0.25)]" style={{ background: HERO_BG }}>
        <div className="flex items-center gap-4">
          <Ring pct={pct} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold tracking-[0.1em] text-[#8FB0F0]" style={EN}>SAFETY TRAINING · {year}</div>
            <div className="text-[18px] font-black mt-0.5">{left ? `남은 교육 ${left}개` : "올해 교육 이수 완료"}</div>
            <div className="text-[12.5px] text-white/60 mt-0.5">{left ? (mayPledge ? "영상 교육은 서약서 서명으로 대신할 수 있어요" : "영상을 끝까지 보고 전자 서명하면 이수돼요") : "이수증은 교육을 누르면 볼 수 있어요"}</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[["대상 교육", `${courses.length}개`], ["이수", `${done}개`], ["기한", "12월 31일"]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/[0.07] border border-white/10 px-3 py-2 min-w-0">
              <div className="text-[11px] font-bold text-white/55">{k}</div>
              <div className="text-[15.5px] font-black truncate" style={EN}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 rounded-[20px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_rgba(16,24,40,0.05)] overflow-hidden">
        {courses.map((c, i) => {
          const rec = records[c.id];
          return (
            <button key={c.id} type="button" onClick={() => (rec ? onCert?.(rec) : onOpen(c))} className="w-full text-left px-4 py-3.5 flex items-center gap-3 active:bg-[#F6F8FB] hover:bg-[#FAFBFD]" style={i ? { borderTop: `1px solid ${LINE}` } : null}>
              <EduTile name={c.icon} done={!!rec} />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-extrabold tracking-[0.08em] text-[#4B6CB7]" style={EN}>{c.code} · {c.kind === "video" ? "VIDEO" : "E-DOCUMENT"}</div>
                <div className="text-[14.5px] font-black truncate" style={{ color: INK }}>{c.title}</div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[12px] font-semibold" style={{ color: MUTE }}>
                  <EduIcon name={c.kind === "video" ? "play" : "pledge"} size={11} />
                  <span style={EN}>{fmtLen(c)}</span><span>·</span><span>{rec ? `${ymd(rec.signedAt)} 이수` : c.cycle === "yearly" ? "해마다" : "한 번"}</span>
                </div>
              </div>
              {rec ? (
                <span className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[12px] font-black shrink-0" style={{ background: "#F1F4F9", color: NAVY }}><EduIcon name="cert" size={14} />이수증</span>
              ) : (
                <span className="inline-flex items-center gap-1 h-8 pl-3 pr-2 rounded-lg text-[12.5px] font-black text-white shrink-0" style={{ background: NAVY }}>{c.kind === "video" ? "시청" : "서명"}<EduIcon name="chevron" size={14} stroke={2.4} /></span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 🔏 디지털 이수증
export function EduCertificate({ rec, onClose }) {
  const c = courseById(rec.courseId);
  const st = eduStatusOf(rec);
  const rows = [
    ["이수자", `${rec.name || "-"}${rec.carNo ? ` · ${rec.carNo}` : ""}`],
    ["소속", rec.companyName || "-"],
    ["교육", rec.courseTitle || c?.title || "-"],
    ["이수 방식", rec.mode === "pledge" ? "서약서 서명으로 대체" : rec.mode === "doc" ? "전자 문서 열람 · 서명" : "영상 끝까지 시청 · 서명"],
    ["이수 일시", `${ymd(rec.signedAt)} ${hm(rec.signedAt)}`],
    ["유효 기간", rec.period === "once" ? "기한 없음" : `${rec.period}.12.31 까지`],
  ];
  return (
    <div className="fixed inset-0 z-[100000] bg-[#0F1A30]/55 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
      <div className="w-full md:max-w-[460px] max-h-[94vh] overflow-y-auto bg-[#F4F6FA] rounded-t-[24px] md:rounded-[22px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-4">
          <div className="rounded-[20px] bg-white overflow-hidden border border-[#E3E8F0] shadow-[0_10px_24px_rgba(16,24,40,0.06)]">
            <div className="px-5 pt-5 pb-4 text-white relative" style={{ background: HERO_BG }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10.5px] font-extrabold tracking-[0.12em] text-[#8FB0F0]" style={EN}>CERTIFICATE OF COMPLETION</div>
                  <div className="text-[21px] font-black mt-1">안전교육 이수증</div>
                </div>
                <span className="w-11 h-11 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center"><EduIcon name="cert" size={24} /></span>
              </div>
              <div className="mt-3 inline-flex items-center gap-2 h-7 px-2.5 rounded-lg bg-white/[0.08] border border-white/10 text-[12px] font-bold" style={EN}>
                <span className="text-white/55">No.</span><span>{certNo(rec)}</span>
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="space-y-2">
                {rows.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[84px_1fr] gap-2 text-[13px]">
                    <span className="font-bold" style={{ color: MUTE }}>{k}</span><span className="font-extrabold" style={{ color: INK }}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-[#E3E8F0] bg-[#FAFBFD] px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold tracking-[0.08em] text-[#4B6CB7]" style={EN}>E-SIGNATURE</span>
                  <StatusPill st={st} small />
                </div>
                {rec.signImage ? <img src={rec.signImage} alt="전자 서명" className="mt-1 w-full h-[96px] object-contain" /> : <div className="h-[96px]" />}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5" style={{ background: "#F1F4F9" }}>
                <div className="flex items-center gap-2 min-w-0">
                  <EduIcon name="lock" size={15} style={{ color: NAVY }} />
                  <span className="text-[12px] font-bold" style={{ color: SUB }}>전자 확인 코드</span>
                </div>
                <span className="text-[13.5px] font-black tracking-[0.06em]" style={{ ...EN, color: INK }}>{verifyCode(rec)}</span>
              </div>
              <div className="mt-2.5 text-[11.5px] leading-relaxed" style={{ color: MUTE }}>
                이 이수증은 LogisWeb 전자 교육 기록으로 발급됐어요. 이수 기록은 서명한 뒤에는 고칠 수 없고, 회사 인사 담당자가 같은 번호로 확인할 수 있어요.
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="mt-3 w-full h-12 rounded-xl text-[14.5px] font-black text-white" style={{ background: NAVY }}>닫기</button>
        </div>
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
  const [cert, setCert] = React.useState(null);
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
      <EduCourseList courses={courses} records={records} onOpen={setOpen} onCert={setCert} mayPledge={mayPledge} />
      {open && <EduPlayer course={open} user={{ ...user, companyName: co }} mayPledge={mayPledge && open.kind === "video"} pledgeCourse={pledgeCourse} onClose={() => setOpen(null)} onDone={(rec) => setRecords((m) => ({ ...m, [rec.courseId]: { ...rec, signedAt: { seconds: Math.floor(Date.now() / 1000) } } }))} />}
      {cert && <EduCertificate rec={cert} onClose={() => setCert(null)} />}
    </div>
  );
}

// 미이수 수(기사앱 홈 카드 · 출근 안내 · HOME 배지)
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
  const [courseF, setCourseF] = React.useState("all");
  const [statF, setStatF] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [setOpen, setSetOpen] = React.useState(false);
  const allCourses = coursesFor(aud);
  const courses = courseF === "all" ? allCourses : allCourses.filter((c) => c.id === courseF);
  const list = people.filter((p) => (aud === "driver" ? p.role === "driver" : p.role !== "driver"));
  const recMap = React.useMemo(() => {
    const m = {};
    records.forEach((r) => { const c = courseById(r.courseId); if (c && r.period === eduPeriod(c)) m[`${r.uid}__${r.courseId}`] = r; });
    return m;
  }, [records]);
  const rowsAll = list.map((p) => {
    const recs = courses.map((c) => recMap[`${p.uid}__${c.id}`] || null);
    return { p, recs, doneN: recs.filter(Boolean).length };
  });
  const rows = rowsAll
    .filter((r) => !q || `${r.p.name}${r.p.carNo || ""}${r.p.team || ""}`.includes(q))
    .filter((r) => statF === "all" ? true : statF === "todo" ? r.doneN < courses.length : statF === "done" ? r.doneN === courses.length : r.recs.some((x) => x?.mode === "pledge"))
    .sort((a, b) => a.doneN - b.doneN || String(a.p.name).localeCompare(String(b.p.name), "ko"));
  const total = list.length;
  const allDone = rowsAll.filter((r) => r.doneN === courses.length).length;
  const rate = total ? Math.round((allDone / total) * 100) : 0;
  const pledgeN = rowsAll.filter((r) => r.recs.some((x) => x?.mode === "pledge")).length;
  const mode = settings.driverVideo || "required";
  const modeLabel = { required: "영상 시청 필수", pledgeAll: "모든 기사 서약서 대체", pick: `고른 기사만 서약서 대체 · ${(settings.pledgeUids || []).length}명` }[mode];

  const exportCsv = () => {
    const head = ["이름", aud === "driver" ? "차량번호" : "부서", ...courses.flatMap((c) => [c.title, `${c.title} 이수증 번호`])];
    const lines = rows.map((r) => [r.p.name, aud === "driver" ? r.p.carNo || "" : r.p.team || "", ...r.recs.flatMap((x) => (x ? [`${eduStatusOf(x).label} ${ymd(x.signedAt)}`, certNo(x)] : ["미이수", ""]))]);
    const csv = "﻿" + [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `안전교육_이수현황_${aud === "driver" ? "기사" : "직원"}.csv`; a.click();
  };

  return (
    <div className="space-y-3" style={{ color: INK }}>
      {/* 위 요약 */}
      <div className="relative overflow-hidden rounded-[22px] px-4 py-4 md:px-6 md:py-5 text-white shadow-[0_14px_32px_rgba(15,26,48,0.25)]" style={{ background: HERO_BG }}>
        <div className="flex items-center gap-4 flex-wrap">
          <Ring pct={rate} size={72} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] md:text-[12px] font-extrabold tracking-[0.1em] text-[#8FB0F0]" style={EN}>SAFETY TRAINING · {new Date().getFullYear()}</div>
            <div className="text-[20px] md:text-[23px] font-black mt-0.5">안전교육 이수 현황</div>
            <div className="text-[12.5px] md:text-[13.5px] text-white/60 mt-0.5">{aud === "driver" ? "기사" : "직원"} {total}명 · 교육 {courses.length}개 · 서명 기록은 고칠 수 없어요</div>
          </div>
          {aud === "driver" && canManage && (
            <button type="button" onClick={() => setSetOpen(true)} className="h-10 px-3.5 rounded-xl bg-white/10 border border-white/15 text-[13px] font-black inline-flex items-center gap-2">
              <EduIcon name="sliders" size={16} />영상 대체 설정
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          {[["대상", `${total}명`], ["모두 이수", `${allDone}명`], ["미이수", `${total - allDone}명`], ["서약서 대체", `${pledgeN}명`]].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-white/[0.07] border border-white/10 px-3 md:px-4 py-2.5 min-w-0">
              <div className="text-[11.5px] font-bold text-white/55">{k}</div>
              <div className="text-[18px] md:text-[21px] font-black tabular-nums" style={EN}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 필터 — 드롭다운 */}
      <div className="rounded-[20px] bg-white border border-[#E3E8F0] p-3 grid grid-cols-2 md:grid-cols-[150px_220px_150px_1fr_auto] gap-2 items-center">
        <CustomSelect value={aud} onChange={(e) => { setAud(e.target.value); setCourseF("all"); }} className={SEL}>
          <option value="driver">대상 · 기사</option><option value="staff">대상 · 직원</option>
        </CustomSelect>
        <CustomSelect value={courseF} onChange={(e) => setCourseF(e.target.value)} className={SEL}>
          <option value="all">교육 · 전체</option>{allCourses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </CustomSelect>
        <CustomSelect value={statF} onChange={(e) => setStatF(e.target.value)} className={SEL}>
          <option value="all">상태 · 전체</option><option value="todo">미이수</option><option value="done">모두 이수</option><option value="pledge">서약서 대체</option>
        </CustomSelect>
        <label className="relative block">
          <EduIcon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUTE }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={aud === "driver" ? "이름 · 차량번호" : "이름 · 부서"} className={`${SEL} pl-9`} />
        </label>
        <button type="button" onClick={exportCsv} className="h-10 px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[13px] font-black inline-flex items-center justify-center gap-1.5" style={{ color: NAVY }}>
          <EduIcon name="download" size={15} />엑셀
        </button>
      </div>

      {/* 표 */}
      <div className="rounded-[20px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_rgba(16,24,40,0.05)] overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr style={{ background: "#F6F8FB" }}>
              <th className="text-left px-4 py-3 border-b border-[#E3E8F0]"><span className="text-[10px] font-extrabold tracking-[0.08em] text-[#4B6CB7]" style={EN}>{aud === "driver" ? "DRIVER" : "STAFF"}</span></th>
              {courses.map((c) => (
                <th key={c.id} className="text-left px-3 py-3 border-b border-[#E3E8F0]">
                  <div className="flex items-center gap-2"><EduTile name={c.icon} size={26} done />
                    <div className="min-w-0"><div className="text-[9.5px] font-extrabold tracking-[0.08em] text-[#4B6CB7]" style={EN}>{c.code}</div><div className="text-[12.5px] font-black truncate max-w-[160px]">{c.title}</div></div>
                  </div>
                </th>
              ))}
              <th className="text-right px-4 py-3 border-b border-[#E3E8F0]"><span className="text-[10px] font-extrabold tracking-[0.08em] text-[#4B6CB7]" style={EN}>PROGRESS</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, recs, doneN }) => (
              <tr key={p.uid} className="border-b border-[#EEF1F6] hover:bg-[#FAFBFD]">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-black shrink-0" style={{ background: "#EEF1F6", color: NAVY }}>{String(p.name || "?").slice(0, 1)}</span>
                    <div className="min-w-0">
                      <div className="font-black text-[13.5px] truncate">{p.name}</div>
                      <div className="text-[11.5px] font-semibold flex items-center gap-1.5" style={{ color: MUTE }}>
                        <span style={EN}>{aud === "driver" ? p.carNo || "-" : p.team || "-"}</span>
                        {aud === "driver" && driverMayPledge(settings, p.uid) && <span className="px-1.5 rounded text-[10.5px] font-black" style={{ background: "#EEF1F6", color: NAVY }}>서약서 대체</span>}
                      </div>
                    </div>
                  </div>
                </td>
                {recs.map((r, i) => (
                  <td key={courses[i].id} className="px-3 py-2.5">
                    {r ? (
                      <button type="button" onClick={() => onViewSign?.(r)} className="text-left group">
                        <StatusPill st={eduStatusOf(r)} small />
                        <div className="text-[11px] font-semibold mt-1 group-hover:underline" style={{ ...EN, color: MUTE }}>{ymd(r.signedAt)}</div>
                      </button>
                    ) : <StatusPill st={eduStatusOf(null)} small />}
                  </td>
                ))}
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "#EEF1F6" }}><div className="h-full rounded-full" style={{ width: `${courses.length ? (doneN / courses.length) * 100 : 0}%`, background: NAVY }} /></div>
                    <span className="text-[12.5px] font-black tabular-nums w-8 text-right" style={{ ...EN, color: doneN === courses.length ? NAVY : MUTE }}>{doneN}/{courses.length}</span>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={courses.length + 2} className="px-4 py-12 text-center text-[13px] font-bold" style={{ color: MUTE }}>조건에 맞는 {aud === "driver" ? "기사" : "직원"}가 없어요</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-1.5 text-[12px] font-semibold px-1" style={{ color: MUTE }}>
        <EduIcon name="cert" size={14} />이수 칸을 누르면 디지털 이수증(서명 · 번호 · 확인 코드)을 볼 수 있어요. 해마다 받는 교육은 1월 1일에 다시 미이수로 바뀌어요.
        {aud === "driver" && <span className="ml-auto whitespace-nowrap hidden md:inline">기사 영상: <b style={{ color: NAVY }}>{modeLabel}</b></span>}
      </div>

      {setOpen && <PledgeSettings settings={settings} drivers={list} onClose={() => setSetOpen(false)} onSave={async (v) => { await onSaveSettings?.(v); setSetOpen(false); }} />}
    </div>
  );
}

// 기사 영상 대체 설정 — 방식은 드롭다운, 대상 기사는 검색 + 체크
function PledgeSettings({ settings, drivers, onClose, onSave }) {
  const [mode, setMode] = React.useState(settings.driverVideo || "required");
  const [pick, setPick] = React.useState(new Set(settings.pledgeUids || []));
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const DESC = {
    required: "모든 기사가 영상을 끝까지 보고 서명해야 이수돼요.",
    pick: "아래에서 고른 기사만 영상 없이 서약서 서명으로 이수할 수 있어요.",
    pledgeAll: "모든 기사가 영상 대신 서약서 서명으로 이수할 수 있어요. 영상은 그대로 볼 수 있어요.",
  };
  const shown = drivers.filter((d) => !q || `${d.name}${d.carNo || ""}`.includes(q));
  return (
    <Sheet en="TRAINING SETTINGS" title="기사 영상 대체 설정" onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl text-[14px] font-black bg-[#F1F4F8] text-[#5B6B85]">취소</button>
        <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onSave({ driverVideo: mode, pledgeUids: [...pick] }); } finally { setBusy(false); } }} className="flex-[2] h-11 rounded-xl text-[14px] font-black text-white" style={{ background: NAVY }}>{busy ? "저장하는 중…" : "저장"}</button>
      </>}>
      <div className="rounded-[18px] bg-white border border-[#E3E8F0] p-4">
        <div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">대체 방식</div>
        <CustomSelect value={mode} onChange={(e) => setMode(e.target.value)} className={SEL}>
          <option value="required">영상 시청 필수</option>
          <option value="pick">고른 기사만 서약서로 대체</option>
          <option value="pledgeAll">모든 기사 서약서로 대체</option>
        </CustomSelect>
        <div className="mt-2 text-[12.5px] font-semibold leading-relaxed" style={{ color: SUB }}>{DESC[mode]}</div>
      </div>
      {mode === "pick" && (
        <div className="rounded-[18px] bg-white border border-[#E3E8F0] overflow-hidden">
          <div className="p-3 flex items-center gap-2 border-b border-[#E3E8F0]">
            <span className="text-[13px] font-black">대상 기사</span>
            <span className="h-6 px-2 rounded-full text-[11.5px] font-black inline-flex items-center" style={{ ...EN, background: "#EEF1F6", color: NAVY }}>{pick.size}명</span>
            <label className="relative ml-auto w-[170px]">
              <EduIcon name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: MUTE }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 차량번호" className="h-9 w-full pl-8 pr-2 rounded-lg border border-[#DCE3EE] text-[12.5px] font-semibold outline-none" />
            </label>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {shown.map((d, i) => {
              const on = pick.has(d.uid);
              return (
                <button key={d.uid} type="button" onClick={() => { const n = new Set(pick); if (on) n.delete(d.uid); else n.add(d.uid); setPick(n); }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-[#FAFBFD]" style={i ? { borderTop: `1px solid #EEF1F6` } : null}>
                  <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={on ? { background: NAVY, color: "#fff" } : { border: "1.5px solid #C9D1DE" }}>{on && <EduIcon name="check" size={13} stroke={3} />}</span>
                  <span className="text-[13.5px] font-black">{d.name}</span>
                  <span className="text-[12px] font-semibold" style={{ ...EN, color: MUTE }}>{d.carNo || ""}</span>
                </button>
              );
            })}
            {!shown.length && <div className="px-3.5 py-8 text-center text-[12.5px] font-bold" style={{ color: MUTE }}>기사가 없어요</div>}
          </div>
        </div>
      )}
      <div className="flex items-start gap-2 rounded-xl px-3.5 py-3 text-[12px] font-semibold leading-relaxed bg-white border border-[#E3E8F0]" style={{ color: SUB }}>
        <EduIcon name="pledge" size={15} style={{ color: NAVY, marginTop: 1 }} />서약서로 이수한 기록은 현황판과 이수증에 “서약서 대체”로 따로 표시돼요.
      </div>
    </Sheet>
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
      {view && <EduCertificate rec={view} onClose={() => setView(null)} />}
    </div>
  );
}

export { eduRecordId };
