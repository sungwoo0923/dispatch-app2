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
const tsDate = (ts) => (ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : null);
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

// 🔏 안전교육 이수 확인서 — 계약서처럼 A4 문서(문서 번호 · 이수자 · 교육 · 확인 문구 · 서명란 · 전자 확인 코드) · PDF 저장 · 인쇄
const DOC_INK = "#111827";
function DocRow({ k, v, k2, v2 }) {
  const th = "w-[118px] px-3 py-2.5 text-left text-[13px] font-bold bg-[#F3F5F9] border border-[#C9D1DE] whitespace-nowrap";
  const td = "px-3 py-2.5 text-[13.5px] font-semibold border border-[#C9D1DE] whitespace-nowrap";
  return (
    <tr>
      <th className={th}>{k}</th><td className={td} colSpan={k2 ? 1 : 3}>{v}</td>
      {k2 && <><th className={th}>{k2}</th><td className={td}>{v2}</td></>}
    </tr>
  );
}
export function EduCertPaper({ rec }) {
  const c = courseById(rec.courseId);
  const signed = tsDate(rec.signedAt);
  const issue = signed ? `${signed.getFullYear()}년 ${signed.getMonth() + 1}월 ${signed.getDate()}일` : "";
  const how = rec.mode === "pledge" ? "서약서 서명으로 대체(관리자 허용)" : rec.mode === "doc" ? "전자 문서 열람 후 서명" : "교육 영상 끝까지 시청 후 서명";
  return (
    <div className="bg-white flex flex-col" style={{ width: 794, minHeight: 1123, padding: "56px 70px 48px", color: DOC_INK, fontFamily: "'Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between">
        <div className="text-[11.5px] leading-[1.7]" style={{ color: "#4B5563" }}>
          <div>문서 번호 <b style={{ ...EN, color: DOC_INK }}>{certNo(rec)}</b></div>
          <div>발급 일자 <b style={{ color: DOC_INK }}>{issue}</b></div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.1em]" style={{ ...EN, color: "#1B2B4B" }}><EduIcon name="shield" size={16} />LOGISWEB E-DOCUMENT</div>
      </div>
      <div className="mt-8 text-center">
        <div className="text-[30px] font-black tracking-[0.35em] pl-[0.35em]">안전교육 이수 확인서</div>
        <div className="mt-2 text-[12px] font-bold tracking-[0.2em]" style={{ ...EN, color: "#6B7280" }}>CERTIFICATE OF SAFETY TRAINING COMPLETION</div>
        <div className="mx-auto mt-5 h-[3px] w-[120px]" style={{ background: "#1B2B4B" }} />
      </div>

      <div className="mt-8 text-[14px] font-black mb-2">1. 이수자</div>
      <table className="w-full border-collapse table-fixed"><tbody>
        <DocRow k="성명" v={rec.name || "-"} k2={rec.carNo ? "차량번호" : "구분"} v2={rec.carNo || (rec.role === "driver" ? "기사" : "직원")} />
        <DocRow k="소속" v={rec.companyName || "-"} />
      </tbody></table>

      <div className="mt-6 text-[14px] font-black mb-2">2. 교육 내용</div>
      <table className="w-full border-collapse table-fixed"><tbody>
        <DocRow k="교육명" v={rec.courseTitle || c?.title || "-"} k2="교육 코드" v2={<span style={EN}>{c?.code || "-"}</span>} />
        <DocRow k="교육 방식" v={c?.kind === "video" ? `영상 교육(${fmtLen(c)})` : "전자 문서 교육"} k2="이수 방식" v2={rec.mode === "pledge" ? "서약서 대체" : "정상 이수"} />
        <DocRow k="이수 일시" v={signed ? `${ymd(rec.signedAt)} ${hm(rec.signedAt)}` : "-"} k2="유효 기간" v2={rec.period === "once" ? "기한 없음" : `${rec.period}.12.31 까지`} />
      </tbody></table>

      <div className="mt-6 text-[14px] font-black mb-2">3. 확인 내용</div>
      <div className="border border-[#C9D1DE] px-5 py-4 text-[13.5px] leading-[1.85] font-medium">
        위 사람은 {rec.companyName || "소속 회사"}이(가) 정한 「{rec.courseTitle || c?.title}」 교육을 이수하였음을 확인합니다(이수 방법: {how}).
        이수자는 교육 내용을 이해하였으며, 업무 중 안전수칙을 성실히 지킬 것을 약속합니다.
        {c?.pledge ? <div className="mt-2 pt-2 border-t border-dashed border-[#C9D1DE] text-[12.5px]" style={{ color: "#374151" }}>서약 · {c.pledge}</div> : null}
      </div>

      <div className="mt-8 text-center text-[15px] font-bold">{issue}</div>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div className="border border-[#C9D1DE]">
          <div className="px-4 py-2 text-[12.5px] font-black bg-[#F3F5F9] border-b border-[#C9D1DE]">이수자</div>
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-[14px] font-bold whitespace-nowrap">성명 {rec.name}</span>
            <span className="relative inline-flex items-center justify-center w-[150px] h-[64px]">
              {!rec.signImage && <span className="absolute text-[12px] font-bold" style={{ color: "#9CA3AF" }}>(서명)</span>}
              {rec.signImage && <img src={rec.signImage} alt="서명" className="relative max-h-[64px] max-w-[150px] object-contain" />}
            </span>
          </div>
        </div>
        <div className="border border-[#C9D1DE]">
          <div className="px-4 py-2 text-[12.5px] font-black bg-[#F3F5F9] border-b border-[#C9D1DE]">확인 기관</div>
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-[14px] font-bold whitespace-nowrap">{rec.companyName}</span>
            <span className="inline-flex items-center justify-center w-[64px] h-[64px] rounded-full border-2 text-[11px] font-black leading-tight text-center" style={{ borderColor: "#A33A2E", color: "#A33A2E" }}>전자<br />확인</span>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-10">
        <div className="flex items-center justify-between gap-4 border-t border-[#C9D1DE] pt-3">
          <div className="text-[10.5px] leading-[1.7]" style={{ color: "#6B7280" }}>
            이 문서는 LogisWeb 전자 교육 기록으로 발급된 전자 문서입니다.<br />이수 기록은 서명 후 고칠 수 없으며, 문서 번호와 전자 확인 코드로 회사가 진위를 확인할 수 있습니다.
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] font-extrabold tracking-[0.1em]" style={{ ...EN, color: "#6B7280" }}>VERIFICATION CODE</div>
            <div className="text-[15px] font-black tracking-[0.08em]" style={EN}>{verifyCode(rec)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
export function EduCertificate({ rec, onClose }) {
  const wrap = React.useRef(null); const paper = React.useRef(null);
  const [scale, setScale] = React.useState(0.6); const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { const fit = () => { const w = wrap.current?.clientWidth || 400; setScale(Math.min(1, (w - 24) / 794)); }; fit(); window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit); }, []);
  const name = `안전교육_이수확인서_${rec.name || ""}_${certNo(rec)}`;
  const pdf = async () => { setSaving(true); try { const { saveElementPdf } = await import("./driver/docSave"); await saveElementPdf(paper.current, name); } catch (e) { const { kpAlert } = await import("./kpDialog"); kpAlert("PDF로 저장하지 못했어요. 다시 눌러 주세요."); console.warn(e); } setSaving(false); };
  const print = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${name}</title>${[...document.querySelectorAll("style,link[rel=stylesheet]")].map((n) => n.outerHTML).join("")}<style>@page{size:A4;margin:0}body{margin:0}</style></head><body>${paper.current.outerHTML}</body></html>`);
    w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 600);
  };
  return (
    <div className="fixed inset-0 z-[100000] bg-[#0F1A30]/60 flex flex-col" onClick={onClose}>
      <div className="shrink-0 px-4 py-3 text-white flex items-center gap-2" style={{ background: HERO_BG, paddingTop: "max(env(safe-area-inset-top,0px),12px)" }} onClick={(e) => e.stopPropagation()}>
        <span className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0"><EduIcon name="cert" size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-extrabold tracking-[0.1em] text-[#8FB0F0] whitespace-nowrap truncate" style={EN}>E-DOCUMENT · {certNo(rec)}</div>
          <div className="text-[15.5px] font-black whitespace-nowrap truncate">안전교육 이수 확인서</div>
        </div>
        <button type="button" onClick={pdf} disabled={saving} className="h-9 px-3 rounded-xl bg-white text-[#0F1A30] text-[12.5px] font-black inline-flex items-center gap-1.5 whitespace-nowrap"><EduIcon name="download" size={14} />{saving ? "저장 중…" : "PDF"}</button>
        <button type="button" onClick={print} className="hidden md:inline-flex h-9 px-3 rounded-xl bg-white/10 border border-white/15 text-[12.5px] font-black items-center whitespace-nowrap">인쇄</button>
        <button type="button" onClick={onClose} aria-label="닫기" className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0"><EduIcon name="close" size={16} stroke={2.4} /></button>
      </div>
      <div ref={wrap} className="flex-1 overflow-auto py-4 flex justify-center" onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 794 * scale, height: 1123 * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", boxShadow: "0 24px 60px -20px rgba(0,0,0,.45)" }}>
            <div ref={paper}><EduCertPaper rec={rec} /></div>
          </div>
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
//  위: 전체 이수율 고리 + 요약 · 가운데: 교육별 이수율 · 최근 8주 이수 추이 · 미이수 인원(기사 알림) · 아래: 인원 × 교육 이수 매트릭스
const CARD = "rounded-[20px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_rgba(16,24,40,0.05)] min-w-0";
function CardHead({ en, title, right }) {
  return (
    <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[9.5px] font-extrabold tracking-[0.08em] text-[#4B6CB7] whitespace-nowrap" style={EN}>{en}</div>
        <div className="text-[14.5px] font-black truncate" style={{ color: INK }}>{title}</div>
      </div>
      {right}
    </div>
  );
}
// 이수 칸(매트릭스) — 이수 = 남색 체크 · 서약서 = 연한 남색 문서 · 미이수 = 점선
function Cell({ rec, onClick }) {
  if (!rec) return <span className="inline-flex w-8 h-8 rounded-[10px] border-[1.5px] border-dashed border-[#C9D1DE]" title="미이수" />;
  const pledge = rec.mode === "pledge";
  return (
    <button type="button" onClick={onClick} title={`${eduStatusOf(rec).label} · ${ymd(rec.signedAt)} · ${certNo(rec)}`}
      className="inline-flex w-8 h-8 rounded-[10px] items-center justify-center transition-transform hover:scale-110"
      style={pledge ? { background: "#DCE3EE", color: NAVY } : { background: NAVY, color: "#fff", boxShadow: "0 4px 10px -4px rgba(11,20,40,.5)" }}>
      <EduIcon name={pledge ? "pledge" : "check"} size={pledge ? 15 : 16} stroke={pledge ? 2.1 : 3} />
    </button>
  );
}
const weekStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

export function EduAdminBoard({ people, records, settings = {}, canManage, onSaveSettings, onViewSign, onRemind, now = new Date() }) {
  const [aud, setAud] = React.useState("driver");
  const [courseF, setCourseF] = React.useState("all");
  const [statF, setStatF] = React.useState("all");
  const [teamF, setTeamF] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [setOpen, setSetOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const allCourses = coursesFor(aud);
  const courses = courseF === "all" ? allCourses : allCourses.filter((c) => c.id === courseF);
  const list = people.filter((p) => (aud === "driver" ? p.role === "driver" : p.role !== "driver"));
  const teams = [...new Set(list.map((p) => p.team).filter(Boolean))].sort();
  const recMap = React.useMemo(() => {
    const m = {};
    records.forEach((r) => { const c = courseById(r.courseId); if (c && r.period === eduPeriod(c, now)) m[`${r.uid}__${r.courseId}`] = r; });
    return m;
  }, [records, now]);
  const rowsAll = list.map((p) => {
    const recs = courses.map((c) => recMap[`${p.uid}__${c.id}`] || null);
    return { p, recs, doneN: recs.filter(Boolean).length };
  });
  const rows = rowsAll
    .filter((r) => teamF === "all" || r.p.team === teamF)
    .filter((r) => !q || `${r.p.name}${r.p.carNo || ""}${r.p.team || ""}`.includes(q))
    .filter((r) => statF === "all" ? true : statF === "todo" ? r.doneN < courses.length : statF === "done" ? r.doneN === courses.length : r.recs.some((x) => x?.mode === "pledge"))
    .sort((a, b) => a.doneN - b.doneN || String(a.p.name).localeCompare(String(b.p.name), "ko"));
  const total = list.length;
  const allDone = rowsAll.filter((r) => r.doneN === courses.length).length;
  const pending = rowsAll.filter((r) => r.doneN < courses.length).sort((a, b) => a.doneN - b.doneN);
  const rate = total ? Math.round((allDone / total) * 100) : 0;
  const pledgeN = rowsAll.filter((r) => r.recs.some((x) => x?.mode === "pledge")).length;
  const dday = Math.max(0, Math.ceil((new Date(now.getFullYear(), 11, 31) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5));
  // 교육별 이수율
  const perCourse = allCourses.map((c) => { const d = list.filter((p) => recMap[`${p.uid}__${c.id}`]).length; return { c, d, pct: total ? (d / total) * 100 : 0 }; });
  // 최근 8주 이수 건수(이 대상 · 올해 기록)
  const uids = new Set(list.map((p) => p.uid));
  const w0 = weekStart(now); const weeks = Array.from({ length: 8 }, (_, i) => { const s = new Date(w0); s.setDate(s.getDate() - (7 - i) * 7); return s; });
  const wCount = weeks.map((s) => { const e = new Date(s); e.setDate(e.getDate() + 7); return records.filter((r) => uids.has(r.uid)).filter((r) => { const d = tsDate(r.signedAt); return d && d >= s && d < e; }).length; });
  const wMax = Math.max(1, ...wCount);
  const mode = settings.driverVideo || "required";
  const modeLabel = { required: "영상 시청 필수", pledgeAll: "모든 기사 서약서 대체", pick: `고른 기사 ${(settings.pledgeUids || []).length}명 서약서 대체` }[mode];
  const lastRemind = settings.lastRemindAt ? tsDate(settings.lastRemindAt) : null;

  const exportCsv = () => {
    const head = ["이름", aud === "driver" ? "차량번호" : "부서", ...courses.flatMap((c) => [c.title, `${c.title} 이수증 번호`])];
    const lines = rows.map((r) => [r.p.name, aud === "driver" ? r.p.carNo || "" : r.p.team || "", ...r.recs.flatMap((x) => (x ? [`${eduStatusOf(x).label} ${ymd(x.signedAt)}`, certNo(x)] : ["미이수", ""]))]);
    const csv = "﻿" + [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `안전교육_이수현황_${aud === "driver" ? "기사" : "직원"}.csv`; a.click();
  };
  const remind = async () => {
    if (!onRemind || !pending.length || busy) return;
    setBusy(true);
    try { await onRemind(pending.map((r) => ({ uid: r.p.uid, name: r.p.name, left: courses.length - r.doneN }))); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3" style={{ color: INK }}>
      {/* 위 요약 */}
      <div className="relative overflow-hidden rounded-[22px] px-4 py-4 md:px-6 md:py-5 text-white shadow-[0_14px_32px_rgba(15,26,48,0.25)]" style={{ background: HERO_BG }}>
        <div className="flex items-center gap-4">
          <Ring pct={rate} size={76} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] md:text-[12px] font-extrabold tracking-[0.1em] text-[#8FB0F0] whitespace-nowrap" style={EN}>SAFETY TRAINING DASHBOARD · {now.getFullYear()}</div>
            <div className="text-[20px] md:text-[23px] font-black mt-0.5 whitespace-nowrap truncate">안전교육 이수 현황</div>
            <div className="text-[12.5px] md:text-[13.5px] text-white/60 mt-0.5 whitespace-nowrap truncate">{aud === "driver" ? "기사" : "직원"} {total}명 · 교육 {courses.length}개 · 전자 서명 기록</div>
          </div>
          <div className="hidden md:inline-flex items-center p-1 rounded-xl bg-white/[0.08] border border-white/10">
            {[["driver", "truck", "기사"], ["staff", "office", "직원"]].map(([k, ic, l]) => (
              <button key={k} type="button" onClick={() => { setAud(k); setCourseF("all"); setTeamF("all"); }} className="h-9 px-3.5 rounded-lg text-[13px] font-black inline-flex items-center gap-1.5 whitespace-nowrap"
                style={aud === k ? { background: "#fff", color: INK } : { color: "rgba(255,255,255,.75)" }}><EduIcon name={ic} size={15} />{l}</button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
          {[["대상", `${total}`, "명"], ["모두 이수", `${allDone}`, "명"], ["미이수", `${total - allDone}`, "명"], ["서약서 대체", `${pledgeN}`, "명"], ["마감까지", `D-${dday}`, ""]].map(([k, v, u]) => (
            <div key={k} className="rounded-2xl bg-white/[0.07] border border-white/10 px-3 md:px-4 py-2.5 min-w-0">
              <div className="text-[11.5px] font-bold text-white/55 whitespace-nowrap">{k}</div>
              <div className="whitespace-nowrap"><span className="text-[19px] md:text-[22px] font-black tabular-nums" style={EN}>{v}</span><span className="text-[12px] font-bold text-white/55 ml-0.5">{u}</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* 가운데 3칸 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className={CARD}>
          <CardHead en="BY COURSE" title="교육별 이수율" />
          <div className="px-4 pb-4 space-y-3">
            {perCourse.map(({ c, d, pct }) => (
              <div key={c.id} className="flex items-center gap-3">
                <EduTile name={c.icon} size={34} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-black truncate">{c.title}</span>
                    <span className="text-[12px] font-black tabular-nums whitespace-nowrap" style={{ ...EN, color: NAVY }}>{Math.round(pct)}%</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full overflow-hidden" style={{ background: "#EEF1F6" }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#1B2B4B,#2D4C82)" }} /></div>
                  <div className="mt-1 text-[11px] font-semibold whitespace-nowrap" style={{ ...EN, color: MUTE }}>{c.code} · {d}/{total}명</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={CARD}>
          <CardHead en="WEEKLY TREND" title="최근 8주 이수" right={<span className="text-[12px] font-black whitespace-nowrap" style={{ ...EN, color: NAVY }}>이번 주 {wCount[7]}건</span>} />
          <div className="px-4 pb-4">
            <div className="h-[132px] flex items-end gap-2">
              {wCount.map((n, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <span className="text-[10.5px] font-black tabular-nums" style={{ ...EN, color: n ? NAVY : "#C9D1DE" }}>{n}</span>
                  <div className="w-full rounded-t-[6px]" style={{ height: `${Math.max(4, (n / wMax) * 96)}px`, background: i === 7 ? "linear-gradient(180deg,#2D4C82,#1B2B4B)" : n ? "#B9C6DD" : "#EEF1F6" }} />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-2">
              {weeks.map((s, i) => <span key={i} className="flex-1 text-center text-[10px] font-bold whitespace-nowrap" style={{ ...EN, color: MUTE }}>{s.getMonth() + 1}/{s.getDate()}</span>)}
            </div>
          </div>
        </div>
        <div className={CARD}>
          <CardHead en="PENDING" title={`미이수 ${pending.length}명`} right={aud === "driver" && canManage && onRemind ? (
            <button type="button" disabled={!pending.length || busy} onClick={remind} className="h-8 px-3 rounded-lg text-[12px] font-black text-white inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40" style={{ background: NAVY }}>
              <EduIcon name="bell" size={14} />{busy ? "보내는 중…" : "알림 보내기"}
            </button>) : null} />
          <div className="px-2 pb-3">
            {pending.slice(0, 5).map((r) => (
              <div key={r.p.uid} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-[#F6F8FB]">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-black shrink-0" style={{ background: "#EEF1F6", color: NAVY }}>{String(r.p.name || "?").slice(0, 1)}</span>
                <span className="text-[13px] font-black truncate">{r.p.name}</span>
                <span className="text-[11.5px] font-semibold truncate" style={{ ...EN, color: MUTE }}>{aud === "driver" ? r.p.carNo : r.p.team}</span>
                <span className="ml-auto flex gap-1 shrink-0">{r.recs.map((x, i) => <span key={i} className="w-2.5 h-2.5 rounded-full" style={x ? { background: NAVY } : { border: "1.5px solid #C9D1DE" }} />)}</span>
              </div>
            ))}
            {!pending.length && <div className="py-8 flex flex-col items-center gap-2" style={{ color: MUTE }}><EduTile name="check" size={36} /><span className="text-[12.5px] font-bold">모두 이수했어요</span></div>}
            {pending.length > 5 && <div className="px-2 pt-1 text-[11.5px] font-bold whitespace-nowrap" style={{ color: MUTE }}>외 {pending.length - 5}명 · 아래 표에서 [미이수]로 볼 수 있어요</div>}
            {lastRemind && aud === "driver" && <div className="px-2 pt-1 text-[11px] font-semibold whitespace-nowrap" style={{ ...EN, color: MUTE }}>마지막 알림 {ymd(lastRemind)} {hm(lastRemind)}</div>}
          </div>
        </div>
      </div>

      {/* 필터 — 드롭다운 */}
      <div className={`${CARD} p-3 flex flex-wrap items-center gap-2`}>
        <div className="md:hidden w-[120px]"><CustomSelect value={aud} onChange={(e) => { setAud(e.target.value); setCourseF("all"); setTeamF("all"); }} className={SEL}><option value="driver">기사</option><option value="staff">직원</option></CustomSelect></div>
        <div className="w-[200px]"><CustomSelect value={courseF} onChange={(e) => setCourseF(e.target.value)} className={SEL}><option value="all">교육 · 전체</option>{allCourses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</CustomSelect></div>
        <div className="w-[150px]"><CustomSelect value={statF} onChange={(e) => setStatF(e.target.value)} className={SEL}><option value="all">상태 · 전체</option><option value="todo">미이수</option><option value="done">모두 이수</option><option value="pledge">서약서 대체</option></CustomSelect></div>
        {aud === "staff" && teams.length > 0 && <div className="w-[150px]"><CustomSelect value={teamF} onChange={(e) => setTeamF(e.target.value)} className={SEL}><option value="all">부서 · 전체</option>{teams.map((t) => <option key={t} value={t}>{t}</option>)}</CustomSelect></div>}
        <label className="relative flex-1 min-w-[160px]">
          <EduIcon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUTE }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={aud === "driver" ? "이름 · 차량번호" : "이름 · 부서"} className={`${SEL} pl-9`} />
        </label>
        {aud === "driver" && canManage && (
          <button type="button" onClick={() => setSetOpen(true)} className="h-10 px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[13px] font-black inline-flex items-center gap-1.5 whitespace-nowrap" style={{ color: NAVY }} title={modeLabel}>
            <EduIcon name="sliders" size={15} />영상 대체
          </button>
        )}
        <button type="button" onClick={exportCsv} className="h-10 px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[13px] font-black inline-flex items-center gap-1.5 whitespace-nowrap" style={{ color: NAVY }}>
          <EduIcon name="download" size={15} />엑셀
        </button>
      </div>

      {/* 매트릭스 */}
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr style={{ background: "#F6F8FB" }}>
              <th className="text-left px-4 py-3 border-b border-[#E3E8F0] whitespace-nowrap"><span className="text-[10px] font-extrabold tracking-[0.08em] text-[#4B6CB7]" style={EN}>{aud === "driver" ? "DRIVER" : "STAFF"} · {rows.length}</span></th>
              {courses.map((c) => (
                <th key={c.id} className="px-2 py-2.5 border-b border-[#E3E8F0] text-center whitespace-nowrap" title={c.title}>
                  <div className="inline-flex flex-col items-center gap-1"><EduTile name={c.icon} size={26} done /><span className="text-[10px] font-extrabold tracking-[0.06em] text-[#4B6CB7]" style={EN}>{c.code}</span></div>
                </th>
              ))}
              <th className="text-left px-4 py-3 border-b border-[#E3E8F0] whitespace-nowrap"><span className="text-[10px] font-extrabold tracking-[0.08em] text-[#4B6CB7]" style={EN}>PROGRESS</span></th>
              <th className="text-left px-4 py-3 border-b border-[#E3E8F0] whitespace-nowrap"><span className="text-[10px] font-extrabold tracking-[0.08em] text-[#4B6CB7]" style={EN}>LAST SIGNED</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, recs, doneN }) => {
              const last = recs.filter(Boolean).map((x) => tsDate(x.signedAt)).filter(Boolean).sort((a, b) => b - a)[0];
              const full = doneN === courses.length;
              return (
                <tr key={p.uid} className="border-b border-[#EEF1F6] hover:bg-[#FAFBFD]">
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-black shrink-0" style={full ? { background: NAVY, color: "#fff" } : { background: "#EEF1F6", color: NAVY }}>{String(p.name || "?").slice(0, 1)}</span>
                      <span className="font-black text-[13.5px]">{p.name}</span>
                      <span className="text-[12px] font-semibold" style={{ ...EN, color: MUTE }}>{aud === "driver" ? p.carNo || "" : p.team || ""}</span>
                      {aud === "driver" && driverMayPledge(settings, p.uid) && <span className="px-1.5 h-5 inline-flex items-center rounded text-[10.5px] font-black" style={{ background: "#EEF1F6", color: NAVY }}>서약서 대체</span>}
                    </div>
                  </td>
                  {recs.map((r, i) => <td key={courses[i].id} className="px-2 py-2 text-center"><Cell rec={r} onClick={() => onViewSign?.(r)} /></td>)}
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: "#EEF1F6" }}><div className="h-full rounded-full" style={{ width: `${courses.length ? (doneN / courses.length) * 100 : 0}%`, background: full ? "linear-gradient(90deg,#1B2B4B,#2D4C82)" : "#8A97AD" }} /></div>
                      <span className="text-[12.5px] font-black tabular-nums" style={{ ...EN, color: full ? NAVY : MUTE }}>{doneN}/{courses.length}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-[12px] font-semibold" style={{ ...EN, color: MUTE }}>{last ? `${ymd(last)} ${hm(last)}` : "—"}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={courses.length + 3} className="px-4 py-12 text-center text-[13px] font-bold" style={{ color: MUTE }}>조건에 맞는 {aud === "driver" ? "기사" : "직원"}가 없어요</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 text-[12px] font-semibold px-1 whitespace-nowrap overflow-x-auto" style={{ color: MUTE }}>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded-[5px] inline-flex items-center justify-center" style={{ background: NAVY, color: "#fff" }}><EduIcon name="check" size={10} stroke={3.4} /></span>이수</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded-[5px]" style={{ background: "#DCE3EE" }} />서약서 대체</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded-[5px] border-[1.5px] border-dashed border-[#C9D1DE]" />미이수</span>
        <span className="inline-flex items-center gap-1.5"><EduIcon name="cert" size={14} />칸을 누르면 디지털 이수증</span>
        {aud === "driver" && <span className="ml-auto">기사 영상 · <b style={{ color: NAVY }}>{modeLabel}</b></span>}
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
  // 미이수 기사에게 알림(기사앱 알림함 · driver_notifications) + 마지막 알림 시각 기록
  const remind = async (list) => {
    const { kpConfirm, kpAlert } = await import("./kpDialog");
    if (!(await kpConfirm(`미이수 기사 ${list.length}명에게 안전교육 알림을 보낼까요?\n기사앱 알림함에 “안전교육을 받아 주세요”가 도착해요.`, { title: "안전교육 알림", okText: "보내기" }))) return;
    const [{ collection, addDoc, doc, setDoc, serverTimestamp }, { db }] = await Promise.all([import("./fsTenant"), import("./firebase")]);
    let ok = 0;
    for (const p of list) {
      try { await addDoc(collection(db, "driver_notifications"), { driverId: p.uid, companyName: co, type: "edu", title: "안전교육을 받아 주세요", body: `아직 안 받은 안전교육이 ${p.left}개 있어요. 홈 화면 [안전교육]에서 받을 수 있어요.`, createdAt: serverTimestamp(), read: false }); ok++; } catch { /* 한 명 실패해도 계속 */ }
    }
    await setDoc(doc(db, "eduSettings", co), { companyName: co, lastRemindAt: serverTimestamp(), lastRemindN: ok }, { merge: true }).catch(() => {});
    kpAlert(`${ok}명에게 알림을 보냈어요.`);
  };
  return (
    <div>
      <EduAdminBoard people={people} records={records} settings={settings} canManage={canManage} onSaveSettings={save} onViewSign={setView} onRemind={remind} />
      {view && <EduCertificate rec={view} onClose={() => setView(null)} />}
    </div>
  );
}

export { eduRecordId };
