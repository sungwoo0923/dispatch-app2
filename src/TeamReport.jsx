// ======================= src/TeamReport.jsx =======================
// 📑 2026-11-15 팀 실적 보고서 — 대표가 "이번 달 운송팀 실적 가져와 봐" 할 때 바로 내는 보고서(전자결재 › 팀 실적 보고서)
//  · 만드는 사람: 각 팀 관리자(운송 · 경리 · 인사 · 영업 · 법무 · 개발 관리자) · 통합관리자 · 통합인사관리자 · 회사 마스터 · 임원 · 최고관리자
//    팀 관리자는 내 팀만, 통합관리자 · 마스터 · 임원 · 최고관리자는 모든 팀
//  · 순서: 팀 · 기간 고르기 → 그래프 보고서가 바로 만들어짐 → 작성자 의견(칸마다 넣고 빼기) → 인쇄 · PDF · PPT · 전자결재로 올리기
//  · 숫자: src/teamReportCore.js(매출관리 · 일일 경영 보고와 같은 오더 기준) · PPT: src/teamReportPpt.js
//  · 1단계: 매출이 나는 팀(운송 · 운영 · 영업). 경리 · 인사 · 개발 · 법무 보고서는 다음 단계
import React from "react";
import { db } from "./firebase";
import { collection, getDocs, query, where, doc } from "firebase/firestore";
import CustomSelect from "./CustomSelect";
import { useCompanyPeople } from "./dailyReport";
import { useUserNameMap, orderStaffNameRaw, ORDER_MGR_FIXED } from "./detailGetters";
import { useMyProfile } from "./userNames";
import { isExecProfile, TEAM_OPTIONS } from "./hrConstants";
import { getNationalHolidayLabel } from "./attendanceUtils";
import { C } from "./dailyReportCharts";
import { printA4, savePdf, pdfBlobOf } from "./a4Export";
import { uploadApFile } from "./ApprovalFiles";
import { kpAlert } from "./kpDialog";
import { periodOf, buildTeamReport, teamMembers, teamKind, reportText, OPINION_SECTIONS, setHolidayFn } from "./teamReportCore";

setHolidayFn((d) => !!getNationalHolidayLabel(d));
const FONT = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',system-ui,sans-serif";
const MGR_ROLES = ["admin", "test", "hrManager", "salesMgr", "legalMgr", "devMgr", "allMgr", "hrAcct", "totalMaster"];
const ALL_TEAM_ROLES = ["allMgr", "hrAcct", "totalMaster"];
const PERIODS = [["thisMonth", "이번 달"], ["lastMonth", "지난달"], ["thisQuarter", "이번 분기"], ["lastQuarter", "지난 분기"], ["custom", "직접 고르기"]];
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const man = (won) => Math.round((won || 0) / 1e4).toLocaleString("ko-KR");
const wonTxt = (won) => `${man(won)}만원`;
const safeName = (s) => String(s || "").replace(/[\\/:*?"<>|]/g, "_");

// 증감 — 글자색만(▲ 빨강 · ▼ 파랑 · 변화 없음 회색) — 일일 경영 보고와 같은 규칙
function Delta({ v, unit = "%", size = 15 }) {
  if (v == null || !Number.isFinite(v)) return <span style={{ color: C.flat, fontWeight: 700, fontSize: size }}>–</span>;
  const r = Number(v.toFixed(1));
  const col = r > 0 ? C.up : r < 0 ? C.down : C.flat;
  return <span style={{ color: col, fontWeight: 800, fontSize: size, whiteSpace: "nowrap" }}>{r > 0 ? "▲ " : r < 0 ? "▼ " : ""}{Math.abs(r).toFixed(1)}{unit}</span>;
}
function Card({ title, sub, right, children, style }) {
  return (
    <section className="tr-card" style={style}>
      {(title || right) && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <div><h2 className="tr-h2">{title}</h2>{sub && <div className="tr-sub">{sub}</div>}</div>{right}</div>}
      {children}
    </section>
  );
}
function useWidth() {
  const ref = React.useRef(null); const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const upd = () => setW(Math.floor(el.getBoundingClientRect().width)); upd();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", upd); return () => window.removeEventListener("resize", upd); }
    const ro = new ResizeObserver(upd); ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ── 그래프(SVG) ──
function DailyChart({ daily }) {
  const [ref, W] = useWidth();
  const H = 240; const L = 46; const R = 12; const T = 14; const B = 30;
  const max = Math.max(1, ...daily.map((x) => x.sale));
  const step = (() => { const raw = max / 4; const p = 10 ** Math.floor(Math.log10(raw)); return Math.ceil(raw / p) * p; })();
  const top = step * 4;
  const iw = Math.max(1, W - L - R); const bw = iw / Math.max(1, daily.length);
  const y = (v) => T + (H - T - B) * (1 - Math.max(0, v) / top);
  const every = Math.max(1, Math.ceil(daily.length / Math.max(1, Math.floor(iw / 38)))); // 글자가 겹치지 않게(좁은 화면은 며칠 건너 표시)
  const pts = daily.map((x, i) => `${L + bw * i + bw / 2},${y(x.profit)}`).join(" ");
  return (
    <div ref={ref} style={{ width: "100%" }}>
      {W > 0 && <svg width={W} height={H} style={{ display: "block" }} role="img" aria-label="일별 매출 · 수익">
        {[0, 1, 2, 3, 4].map((k) => <g key={k}><line x1={L} x2={W - R} y1={y(step * k)} y2={y(step * k)} stroke={C.grid} /><text x={L - 6} y={y(step * k) + 4} fontSize="11" fill={C.t3} textAnchor="end">{man(step * k)}</text></g>)}
        {daily.map((x, i) => <rect key={x.d} x={L + bw * i + bw * 0.15} y={y(x.sale)} width={Math.max(1, bw * 0.7)} height={Math.max(0, H - B - y(x.sale))} rx={Math.min(3, bw * 0.2)} fill={x.off ? "#B9C6DD" : C.n2}><title>{`${x.d} 매출 ${wonTxt(x.sale)} · 수익 ${wonTxt(x.profit)} · ${x.cnt}건`}</title></rect>)}
        <polyline points={pts} fill="none" stroke={C.sky} strokeWidth="2.5" strokeLinejoin="round" />
        {daily.map((x, i) => (i % every === 0 ? <text key={`l${x.d}`} x={L + bw * i + bw / 2} y={H - 10} fontSize="11" fill={C.t3} textAnchor="middle">{`${Number(x.d.slice(5, 7))}/${Number(x.d.slice(8, 10))}`}</text> : null))}
      </svg>}
      <div style={{ display: "flex", gap: 16, fontSize: 13.5, color: C.t2, marginTop: 6 }}>
        <span><i style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: C.n2, marginRight: 6, verticalAlign: -1 }} />매출(만원)</span>
        <span><i style={{ display: "inline-block", width: 14, height: 3, background: C.sky, marginRight: 6, verticalAlign: 3 }} />수익</span>
        <span><i style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: "#B9C6DD", marginRight: 6, verticalAlign: -1 }} />주말 · 공휴일</span>
      </div>
    </div>
  );
}
function MemberBars({ members }) {
  const max = Math.max(1, ...members.map((m) => m.sale));
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {members.map((m, i) => (
        <div key={m.name} style={{ display: "grid", gridTemplateColumns: "84px 1fr auto", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i === 0 && m.sale > 0 ? "🏅 " : ""}{m.name}</div>
          <div style={{ position: "relative", height: 24, background: C.grid, borderRadius: 6, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(m.sale / max) * 100}%`, background: C.n2, borderRadius: 6 }} />
            <div style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: `${(Math.max(0, m.profit) / max) * 100}%`, background: C.sky, borderRadius: 4 }} />
          </div>
          <div style={{ textAlign: "right", fontSize: 14.5, fontWeight: 800, color: C.t1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{man(m.sale)}만 <span style={{ color: C.t3, fontWeight: 600 }}>· {m.share.toFixed(0)}%</span></div>
        </div>
      ))}
    </div>
  );
}

const CSS = `
.tr{font-family:${FONT};color:${C.t1};background:${C.page};font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;letter-spacing:-0.01em}
.tr *{box-sizing:border-box}
.tr h1,.tr h2,.tr p{margin:0}
.tr .tr-card{background:#fff;border:1px solid ${C.line};border-radius:20px;padding:24px 26px;box-shadow:0 1px 2px rgba(15,26,48,.04),0 6px 20px rgba(15,26,48,.05);min-width:0}
.tr .tr-h2{font-size:20px;font-weight:800;color:${C.t1};letter-spacing:-0.025em}
.tr .tr-sub{font-size:14px;color:${C.t2};margin-top:4px}
.tr .tr-num{font-variant-numeric:tabular-nums;font-weight:800;letter-spacing:-0.02em}
.tr table{width:100%;border-collapse:collapse;font-size:14.5px}
.tr th{background:${C.n2};color:#fff;font-weight:800;padding:9px 10px;white-space:nowrap}
.tr td{border-bottom:1px solid ${C.line};padding:9px 10px;white-space:nowrap}
.tr .tr-btn{height:42px;padding:0 16px;border-radius:12px;font-size:14.5px;font-weight:800;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
.tr .tr-chip{height:34px;padding:0 13px;border-radius:999px;font-size:14px;font-weight:800;border:1px solid ${C.line};background:#fff;color:${C.t2}}
.tr .tr-chip.on{background:${C.n2};border-color:${C.n2};color:#fff}
.tr textarea{width:100%;border:1px solid #DCE3EE;border-radius:12px;padding:12px 14px;font-size:15px;line-height:1.6;font-family:${FONT};color:${C.t1};resize:vertical}
.tr .tr-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:18px}
@media (max-width:640px){.tr .tr-card{padding:18px 16px;border-radius:16px}}
`;

export default function TeamReport({ company, me }) {
  const profile = useMyProfile(me?.uid);
  const realRole = profile?.role || me?.role || "";
  const isMaster = profile?.isMaster === true || me?.isMaster === true;
  const exec = isExecProfile(profile || me);
  const canMake = MGR_ROLES.includes(realRole) || isMaster || exec;
  const anyTeam = ALL_TEAM_ROLES.includes(realRole) || isMaster || exec;
  const myTeam = String(profile?.team || me?.team || "");
  const people = useCompanyPeople(company);
  const nameMap = useUserNameMap();
  const teams = React.useMemo(() => {
    const have = [...new Set((people || []).map((u) => String(u.team || "")).filter(Boolean))];
    const list = [...TEAM_OPTIONS.filter((t) => have.includes(t)), ...have.filter((t) => !TEAM_OPTIONS.includes(t))].filter((t) => t !== "임원");
    return anyTeam ? list : list.filter((t) => t === myTeam);
  }, [people, anyTeam, myTeam]);
  const [team, setTeam] = React.useState("");
  React.useEffect(() => { if (!team && teams.length) setTeam(teams.includes(myTeam) ? myTeam : teams.find((t) => teamKind(t) === "sales") || teams[0]); }, [teams, team, myTeam]);
  const [pk, setPk] = React.useState("thisMonth");
  const today = kstToday();
  const [custom, setCustom] = React.useState({ from: `${today.slice(0, 7)}-01`, to: today });
  const period = React.useMemo(() => periodOf(pk, today, custom), [pk, today, custom]);
  // 오더 — 비교 기간 처음부터 이번 기간 끝까지(오더 · 예전 dispatch 둘 다 · 회사는 앱이 거른다)
  const [rows, setRows] = React.useState(null);
  const [loadErr, setLoadErr] = React.useState("");
  React.useEffect(() => {
    if (!canMake || !company) return undefined;
    let alive = true; setRows(null); setLoadErr("");
    const q = (col) => getDocs(query(collection(db, col), where("상차일", ">=", period.prevFrom), where("상차일", "<=", period.to)))
      .then((s) => s.docs.map((d) => ({ _id: d.id, __col: col, ...d.data() }))).catch((e) => { if (col === "orders") throw e; return []; });
    Promise.all([q("orders"), q("dispatch")]).then(([a, b]) => { if (alive) setRows([...a, ...b]); }).catch((e) => { if (alive) { setRows([]); setLoadErr(e?.message || String(e)); } });
    return () => { alive = false; };
  }, [canMake, company, period.prevFrom, period.to]);
  const staffOf = React.useCallback((r) => { const n = orderStaffNameRaw(r, nameMap); return (n && n !== ORDER_MGR_FIXED ? n : "") || String(r?.배차확정자 || "").trim() || n || ""; }, [nameMap]);
  const members = React.useMemo(() => teamMembers(people, team), [people, team]);
  const rep = React.useMemo(() => (rows && team && teamKind(team) === "sales" ? buildTeamReport({ rows, members, period, staffOf }) : null), [rows, members, period, staffOf, team]);
  // 작성자 의견 — 칸마다 넣고 빼기(처음엔 요약 · 잘된 점 · 문제점 · 다음 계획)
  const [onSecs, setOnSecs] = React.useState(["summary", "good", "issue", "plan"]);
  const [ops, setOps] = React.useState(() => Object.fromEntries(OPINION_SECTIONS.map(([k, , t]) => [k, t])));
  const opinionList = OPINION_SECTIONS.filter(([k]) => onSecs.includes(k)).map(([k, l]) => [l, ops[k] || ""]);
  const author = `${profile?.name || me?.name || ""}${profile?.position || me?.position ? ` ${profile?.position || me?.position}` : ""}`;
  const made = today.replace(/-/g, ".");
  const paperRef = React.useRef(null);
  const [busy, setBusy] = React.useState("");
  const fileBase = `${team}_실적보고서_${safeName(period.label)}`;

  const doPrint = async () => { setBusy("print"); try { await printA4(paperRef.current, `${team} 실적 보고서`); } catch (e) { kpAlert(`인쇄하지 못했어요: ${e?.message || e}`); } finally { setBusy(""); } };
  const doPdf = async () => { setBusy("pdf"); try { await savePdf(paperRef.current, fileBase); } catch (e) { kpAlert(`PDF로 저장하지 못했어요: ${e?.message || e}`); } finally { setBusy(""); } };
  const doPpt = async () => { setBusy("ppt"); try { const m = await import("./teamReportPpt"); await m.saveTeamReportPpt(rep, { team, author, made, opinion: opinionList }, `${fileBase}.pptx`); } catch (e) { kpAlert(`PPT를 만들지 못했어요: ${e?.message || e}`); } finally { setBusy(""); } };
  // 전자결재로 올리기 — 보고서 PDF · PPT를 첨부로 먼저 올리고, 숫자 요약 · 작성자 의견이 채워진 「팀 실적 보고서」 작성 화면을 연다(결재선: 대표)
  const doApproval = async () => {
    setBusy("ap");
    try {
      const docId = doc(collection(db, "approvals")).id;
      const meU = { uid: me?.uid, name: profile?.name || me?.name || "" };
      const pdf = await pdfBlobOf(paperRef.current);
      const files = [await uploadApFile(new File([pdf], `${fileBase}.pdf`, { type: "application/pdf" }), { company, docId, me: meU, count: 0 })];
      try {
        const m = await import("./teamReportPpt");
        const pb = await m.teamReportPptBlob(rep, { team, author, made, opinion: opinionList });
        files.push(await uploadApFile(new File([pb], `${fileBase}.pptx`, { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }), { company, docId, me: meU, count: 1 }));
      } catch { /* PPT를 못 만들어도 PDF는 첨부 */ }
      const ceo = (people || []).find((u) => ["대표이사", "대표", "사장"].includes(String(u.position || "")) && (u.uid || u.id) !== me?.uid && u.employmentStatus !== "퇴사");
      const preset = {
        cat: "report", form: "teamreport", docId, files,
        title: `${made} ${team} 실적 보고서(${period.label})_${author}`,
        data: { team, periodLabel: `${period.label} (비교 ${period.prevLabel})`, body: reportText(rep, team), opinion: opinionList.map(([l, t]) => `【${l}】\n${t}`).join("\n\n") },
        ...(ceo ? { line: [{ uid: ceo.uid || ceo.id, name: ceo.name || "", position: ceo.position || "", team: ceo.team || "", kind: "결재" }] } : {}),
      };
      try { sessionStorage.setItem("kpApPreset", JSON.stringify(preset)); } catch { /* 무시 */ }
      window.dispatchEvent(new Event("kp-ap-preset"));
    } catch (e) { kpAlert(`전자결재로 올릴 준비를 하지 못했어요: ${e?.message || e}`); } finally { setBusy(""); }
  };

  if (!canMake) return (
    <div className="tr" style={{ padding: 24, borderRadius: 20 }}><style>{CSS}</style>
      <Card title="팀 실적 보고서"><p style={{ fontSize: 15.5, color: C.t2 }}>팀 실적 보고서는 각 팀 관리자 · 통합관리자 · 임원이 만들 수 있어요. 필요하면 팀 관리자에게 요청해 주세요.</p></Card>
    </div>
  );
  const kind = teamKind(team);
  const c = rep?.cur;
  return (
    <div className="tr" data-team-report style={{ padding: "4px 0 24px" }}>
      <style>{CSS}</style>
      {/* 고르기 · 내보내기(인쇄에는 안 나온다) */}
      <div className="tr-card" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: C.t2 }}>팀</span>
          <CustomSelect value={team} onChange={(e) => setTeam(e.target.value)} disabled={teams.length < 2} className="h-[42px] px-3 rounded-xl border border-[#DCE3EE] bg-white text-[15px] font-black text-[#0F1A30] min-w-[140px]">
            {teams.length ? teams.map((t) => <option key={t} value={t}>{t}</option>) : <option value="">팀 없음</option>}
          </CustomSelect>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PERIODS.map(([k, l]) => <button key={k} type="button" className={`tr-chip ${pk === k ? "on" : ""}`} onClick={() => setPk(k)}>{l}</button>)}
        </div>
        {pk === "custom" && <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((p) => ({ ...p, from: e.target.value }))} className="h-[42px] px-3 rounded-xl border border-[#DCE3EE] bg-white text-[15px] font-bold" />
          <span style={{ color: C.t2, fontWeight: 800 }}>~</span>
          <input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((p) => ({ ...p, to: e.target.value }))} className="h-[42px] px-3 rounded-xl border border-[#DCE3EE] bg-white text-[15px] font-bold" />
        </div>}
        <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="tr-btn" disabled={!rep || !!busy} onClick={doPrint} style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.n2 }}>{busy === "print" ? "준비 중…" : "인쇄"}</button>
          <button type="button" className="tr-btn" disabled={!rep || !!busy} onClick={doPdf} style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.n2 }}>{busy === "pdf" ? "저장 중…" : "PDF 저장"}</button>
          <button type="button" className="tr-btn" disabled={!rep || !!busy} onClick={doPpt} style={{ border: `1px solid ${C.n2}`, background: "#fff", color: C.n2 }}>{busy === "ppt" ? "만드는 중…" : "PPT 만들기"}</button>
          <button type="button" className="tr-btn" disabled={!rep || !!busy} onClick={doApproval} style={{ background: C.n2, color: "#fff" }} data-tr-approval>{busy === "ap" ? "첨부 올리는 중…" : "전자결재로 올리기"}</button>
        </div>
      </div>

      {kind !== "sales" ? (
        <Card title={`${team || "팀"} 보고서는 준비 중이에요`}><p style={{ fontSize: 15.5, color: C.t2 }}>지금은 매출이 나는 팀(운송 · 운영 · 영업) 보고서를 먼저 만들 수 있어요. 경리 · 인사 · 개발 · 법무 팀 보고서는 다음 단계에서 붙여요.</p></Card>
      ) : !rep ? (
        <Card title="보고서를 만드는 중…"><p style={{ fontSize: 15.5, color: C.t2 }}>{loadErr ? `오더를 읽지 못했어요: ${loadErr}` : `${period.prevLabel} ~ ${period.label} 오더를 불러오고 있어요.`}</p></Card>
      ) : (
        <div ref={paperRef} style={{ display: "grid", gap: 16, background: C.page }}>
          {/* 머리말 */}
          <section style={{ borderRadius: 20, padding: "26px 28px", color: "#fff", background: `linear-gradient(120deg, ${C.n0} 0%, ${C.n2} 62%, ${C.n3} 100%)` }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.24em", color: C.sky }}>TEAM PERFORMANCE REPORT</div>
            <h1 style={{ fontSize: 30, fontWeight: 900, marginTop: 6, letterSpacing: "-0.03em" }}>{team} 실적 보고서</h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginTop: 10, fontSize: 15, color: "rgba(255,255,255,.85)" }}>
              <span>기간 <b style={{ color: "#fff" }}>{period.label}</b> ({period.from.replace(/-/g, ".")} ~ {period.to.replace(/-/g, ".")})</span>
              <span>비교 {period.prevLabel}</span><span>작성 {author}</span><span>작성일 {made}</span><span>팀원 {members.length}명</span>
            </div>
          </section>

          {/* 핵심 숫자 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12 }}>
            {[["매출", `${man(c.sale)}`, "만원", <Delta key="a" v={rep.d.sale} />], ["수익", `${man(c.profit)}`, "만원", <Delta key="b" v={rep.d.profit} />], ["수익률", c.margin.toFixed(1), "%", <Delta key="c" v={rep.d.margin} unit="%p" />],
              ["건수", c.cnt.toLocaleString("ko-KR"), "건", <Delta key="d" v={rep.d.cnt} />], ["건당 수익", Math.round(c.perOrder).toLocaleString("ko-KR"), "원", <Delta key="e" v={rep.d.perOrder} />]].map(([l, v, u, d]) => (
              <div key={l} className="tr-card" style={{ padding: "18px 20px" }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: C.t2 }}>{l}</div>
                <div style={{ marginTop: 4 }}><span className="tr-num" style={{ fontSize: 30 }}>{v}</span><span style={{ fontSize: 15, fontWeight: 700, color: C.t2, marginLeft: 3 }}>{u}</span></div>
                <div style={{ marginTop: 4, fontSize: 13.5, color: C.t3 }}>전기 대비 {d}</div>
              </div>
            ))}
          </div>
          <div className="tr-card" style={{ padding: "16px 22px", fontSize: 15.5, color: C.t1, display: "flex", flexWrap: "wrap", gap: "6px 22px" }}>
            <span>회사 전체 매출 중 <b className="tr-num">{rep.companyShare.toFixed(1)}%</b></span>
            <span>영업일 평균 매출 <b className="tr-num">{man(rep.avgPerBizDay)}만원</b></span>
            {rep.best && <span>가장 많이 한 팀원 <b>{rep.best.name}</b> ({man(rep.best.sale)}만원)</span>}
            <span>거래처 <b className="tr-num">{rep.clients.count}</b>곳 · 새 거래처 <b className="tr-num">{rep.clients.newClients.length}</b>곳</span>
          </div>

          <Card title="일별 매출 · 수익" sub="막대 = 매출 · 선 = 수익 (만원)"><DailyChart daily={rep.daily} /></Card>

          <div className="tr-grid2">
            <Card title="팀원별 실적" sub="막대 = 매출 · 안쪽 하늘색 = 수익 · % = 팀 매출 중 비중">{rep.members.length ? <MemberBars members={rep.members} /> : <p style={{ color: C.t2 }}>팀원이 없어요. 회원관리에서 부서를 정해 주세요.</p>}</Card>
            <Card title="팀원별 표">
              <div style={{ overflowX: "auto" }}><table>
                <thead><tr><th>이름</th><th>매출</th><th>수익</th><th>수익률</th><th>건수</th><th>{period.prevLabel} 대비</th></tr></thead>
                <tbody>{rep.members.map((m) => <tr key={m.name}><td style={{ fontWeight: 800 }}>{m.name}{m.position ? <span style={{ color: C.t3, fontWeight: 600 }}> {m.position}</span> : null}</td><td className="tr-num" style={{ textAlign: "right" }}>{man(m.sale)}만</td><td className="tr-num" style={{ textAlign: "right" }}>{man(m.profit)}만</td><td className="tr-num" style={{ textAlign: "right" }}>{m.margin.toFixed(1)}%</td><td className="tr-num" style={{ textAlign: "right" }}>{m.cnt}</td><td style={{ textAlign: "right" }}><Delta v={m.d} size={14} /></td></tr>)}</tbody>
              </table></div>
            </Card>
          </div>

          <div className="tr-grid2">
            <Card title="거래처 TOP 8">
              <div style={{ overflowX: "auto" }}><table>
                <thead><tr><th>#</th><th style={{ textAlign: "left" }}>거래처</th><th>매출</th><th>수익률</th><th>증감</th></tr></thead>
                <tbody>{rep.clients.top.map((x, i) => <tr key={x.n}><td className="tr-num" style={{ textAlign: "center" }}>{i + 1}</td><td style={{ fontWeight: 700 }}>{x.n}</td><td className="tr-num" style={{ textAlign: "right" }}>{man(x.sale)}만</td><td className="tr-num" style={{ textAlign: "right" }}>{x.margin.toFixed(1)}%</td><td style={{ textAlign: "right" }}>{x.prevSale ? <Delta v={x.d} size={14} /> : <b style={{ color: C.n3 }}>신규</b>}</td></tr>)}</tbody>
              </table></div>
            </Card>
            <Card title="늘어난 · 줄어든 거래처" sub={`${period.prevLabel} 대비 매출 차이`}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {[["늘어난 곳", rep.clients.up, C.up], ["줄어든 곳", rep.clients.down, C.down]].map(([t, list, col]) => (
                  <div key={t}><div style={{ fontSize: 15, fontWeight: 800, color: col, marginBottom: 6 }}>{t}</div>
                    {list.length ? list.map((x) => <div key={x.n} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14.5, padding: "5px 0", borderBottom: `1px solid ${C.grid}` }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.n}</span><b className="tr-num" style={{ color: col, whiteSpace: "nowrap" }}>{x.diff > 0 ? "+" : "−"}{man(Math.abs(x.diff))}만</b></div>) : <div style={{ color: C.t3, fontSize: 14.5 }}>없음</div>}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card title="확인할 점" sub="손실 · 수익률 5% 미만 · 아직 배차 안 된 오더">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: rep.risks.loss.length ? 14 : 0 }}>
              {[["손실 오더", rep.risks.lossCount], ["수익률 5% 미만", rep.risks.lowCount], ["미배차", rep.risks.unassigned]].map(([l, v]) => <div key={l} style={{ background: C.page, borderRadius: 14, padding: "12px 16px" }}><div style={{ fontSize: 14, fontWeight: 700, color: C.t2 }}>{l}</div><div className="tr-num" style={{ fontSize: 24, color: v ? C.t1 : C.t3 }}>{v}<span style={{ fontSize: 14, color: C.t2 }}>건</span></div></div>)}
            </div>
            {rep.risks.loss.length > 0 && <div style={{ overflowX: "auto" }}><table>
              <thead><tr><th>날짜</th><th style={{ textAlign: "left" }}>거래처</th><th style={{ textAlign: "left" }}>구간</th><th>매출</th><th>손익</th><th>담당</th></tr></thead>
              <tbody>{rep.risks.loss.map((x, i) => <tr key={i}><td>{x.d.slice(5).replace("-", "/")}</td><td>{x.client}</td><td>{x.route}</td><td className="tr-num" style={{ textAlign: "right" }}>{man(x.sale)}만</td><td className="tr-num" style={{ textAlign: "right", color: C.down }}>{man(x.profit)}만</td><td>{x.who}</td></tr>)}</tbody>
            </table></div>}
          </Card>

          {/* 작성자 의견 — 화면에서는 고치고, 인쇄 · PDF에는 글만 */}
          <Card title="작성자 의견" sub="넣을 칸을 고르고 생각을 적어 주세요. 비워 둔 칸은 보고서에서 빠져요."
            right={<div data-html2canvas-ignore="true" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{OPINION_SECTIONS.map(([k, l]) => <button key={k} type="button" className={`tr-chip ${onSecs.includes(k) ? "on" : ""}`} onClick={() => setOnSecs((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))}>{l}</button>)}</div>}>
            <div style={{ display: "grid", gap: 14 }}>
              {OPINION_SECTIONS.filter(([k]) => onSecs.includes(k)).map(([k, l]) => (
                <div key={k}>
                  <div style={{ fontSize: 15.5, fontWeight: 800, color: C.n2, marginBottom: 6 }}>{l}</div>
                  <textarea rows={Math.max(3, String(ops[k] || "").split("\n").length + 1)} value={ops[k] || ""} onChange={(e) => setOps((p) => ({ ...p, [k]: e.target.value }))} />
                </div>
              ))}
              {!onSecs.length && <p style={{ color: C.t3 }}>위에서 넣을 칸을 골라 주세요.</p>}
            </div>
          </Card>
          <div style={{ textAlign: "right", fontSize: 13, color: C.t3, padding: "0 6px" }}>숫자 기준: 배차 오더(취소 · 운송사 전송 제외) · 매출 = 청구운임 · 수익 = 청구운임 − 기사운임 − 외부 지급 · 담당 = 오더를 등록한 직원</div>
        </div>
      )}
    </div>
  );
}
