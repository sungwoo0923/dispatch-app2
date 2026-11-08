// ======================= src/AiTeamPanel.jsx =======================
// 🤖 2026-11-06 AI 팀 — 관리자센터(최고관리자·부관리자) 전용.
//  · AI 팀 개요(ai:hub): 6개 팀 카드 · 이번 달 사용량 · 최근 활동
//  · 팀 화면(ai:<team>): 팀장 AI와 대화. 서버(aiTeamChat)가 Claude + 읽기 전용 조회 도구로 답한다.
//  ⭐ 알록달록 금지 — 네이비 계열만. 줄바꿈 없는 라벨, 숫자는 tabular-nums.
import React from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db, FUNCTIONS_BASE } from "./firebase";
import { ShellIcon } from "./AdminShell";
import { kpConfirm } from "./kpDialog";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const NUM = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };

// ─── 팀 소개(화면용) — 서버 functions/aiTeams.js 의 TEAMS 와 key 를 맞춘다 ───
export const AI_TEAMS = [
  { key: "acct", code: "ACC", name: "경리·회계팀", en: "ACCOUNTING", icon: "receipt", desc: "청구 · 입금 확인 · 미수금 · 요금제 변경 요청",
    access: ["청구서", "요금제", "요금제 변경 요청"],
    quick: ["이번 달 미납·연체 현황 알려줘", "입금 독촉이 필요한 회사를 금액 순으로 정리해줘", "이번 달 예상 청구액(요금제·초과 사용량) 회사별로 보여줘", "연체된 회사와 연체 개월 수 알려줘", "처리 안 된 요금제 변경 요청 있어?", "지난달 대비 이번 달 청구 금액 비교해줘"] },
  { key: "finance", code: "FIN", name: "재무팀", en: "FINANCE", icon: "trend", desc: "매출 추이 · 회수율 · 요금제 구성 분석",
    access: ["청구서", "요금제", "고객사 현황"],
    quick: ["최근 6개월 매출 추이와 회수율 보고해줘", "요금제별 고객사 수와 매출 비중 정리해줘", "재무 위험 신호가 있는지 점검해줘"] },
  { key: "sales", code: "SAL", name: "영업팀", en: "SALES", icon: "star", desc: "도입 문의 → 견적 → 가입 → 요금제 파이프라인",
    access: ["도입 문의", "견적서", "가입 신청", "요금제"],
    quick: ["응대가 필요한 도입 문의를 우선순위로 정리해줘", "견적 후 진행이 멈춘 건 찾아줘", "요금제가 아직 지정 안 된 고객사 있어?", "이번 달 영업 현황 보고서 써줘"] },
  { key: "ops", code: "OPS", name: "운영팀", en: "OPERATIONS", icon: "server", desc: "원격 지원 · 승인 대기 · 고객사 사용 현황 · 공지",
    access: ["원격 지원", "가입 신청", "고객사 현황", "접속 세션", "플랫폼 공지"],
    quick: ["오늘 처리해야 할 대기 건 전부 정리해줘", "승인 대기 중인 직원이 많은 운송사는?", "지금 접속이 없는 고객사(이탈 위험) 찾아줘"] },
  { key: "security", code: "SEC", name: "보안팀", en: "SECURITY", icon: "shield", desc: "로그인 기록 · 접속 세션 · 이상 징후 점검",
    access: ["접속 이력", "접속 세션", "고객사 현황"],
    quick: ["최근 24시간 로그인 이상 징후 점검해줘", "기기를 너무 많이 쓰는 계정 있어?", "최근 7일 새벽 시간대 접속 기록 확인해줘"] },
  { key: "marketing", code: "MKT", name: "홍보팀", en: "MARKETING", icon: "send", desc: "홍보 아이디어 · 홈페이지 문구 · 공지·SNS 초안",
    access: ["도입 문의", "플랫폼 공지", "고객사 현황"],
    quick: ["이번 달 홍보 아이디어 5개 제안해줘", "홈페이지 메인 문구 3가지 버전 써줘", "신규 기능 안내 공지 초안 써줘", "블로그 글 초안: 배차 관리 프로그램을 바꿔야 하는 신호"] },
];
const TEAM_BY_KEY = Object.fromEntries(AI_TEAMS.map((t) => [t.key, t]));
export const AI_TEAM_TABS = [{ key: "ai:hub", label: "AI 팀 개요", en: "OVERVIEW", icon: "spark" }, ...AI_TEAMS.map((t) => ({ key: `ai:${t.key}`, label: t.name, en: t.en, icon: t.icon }))];

// Claude Opus 5.5 단가(USD / 100만 토큰) — 화면 표시용 어림값
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
const costOf = (u) => (u ? ((u.input || 0) * PRICE.input + (u.output || 0) * PRICE.output + (u.cacheRead || 0) * PRICE.cacheRead + (u.cacheWrite || 0) * PRICE.cacheWrite) / 1e6 : 0);
const usd = (n) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
const fmtN = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const msOf = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);
const ago = (ms) => { if (!ms) return "-"; const m = Math.floor((Date.now() - ms) / 60000); if (m < 1) return "방금"; if (m < 60) return `${m}분 전`; const h = Math.floor(m / 60); if (h < 24) return `${h}시간 전`; return `${Math.floor(h / 24)}일 전`; };
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

const HERO_BG = "linear-gradient(rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, radial-gradient(600px 200px at 85% -20%, rgba(75,108,183,.45), transparent 60%), linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)";

// ─── 사용 기록(aiTeamLogs) 구독 ───
function useAiLogs(n = 400) {
  const [list, setList] = React.useState(null);
  React.useEffect(() => onSnapshot(query(collection(db, "aiTeamLogs"), orderBy("at", "desc"), limit(n)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([])), [n]);
  return list;
}

// ─── 공용 부품 ───
function Panel({ code, title, right, children, className = "", bodyClass = "p-5" }) {
  return (
    <div className={`bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)] overflow-hidden min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 h-[46px] sm:h-[50px] bg-[#F7F9FC] border-b border-[#E8EDF4]">
        <div className="flex items-center gap-2 min-w-0"><span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" />
          <span className="text-[10.5px] font-extrabold tracking-[0.2em] text-[#94A3B8] whitespace-nowrap" style={NUM}>{code}</span>
          <span className="text-[15px] sm:text-[16px] font-black text-[#0F1A30] truncate whitespace-nowrap">{title}</span></div>
        {right}
      </div>
      <div className={bodyClass}>{children}</div>
    </div>
  );
}
function TeamMark({ team, size = 44, dark = false }) {
  return (
    <div className={`relative shrink-0 rounded-[14px] flex items-center justify-center ${dark ? "bg-white/10 ring-1 ring-white/20 text-white" : "bg-gradient-to-br from-[#0F1A30] to-[#2D4C82] text-white shadow-[0_6px_16px_rgba(15,26,48,.25)]"}`} style={{ width: size, height: size }}>
      <ShellIcon name={team.icon} size={Math.round(size * 0.45)} />
      <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 rounded-md bg-[#8FB0F0] text-[#0B1428] text-[8.5px] font-black tracking-[0.12em] leading-[14px]" style={NUM}>{team.code}</span>
    </div>
  );
}
function Live({ label = "ONLINE" }) {
  return <span className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold tracking-[0.2em] text-[#8FB0F0] whitespace-nowrap" style={NUM}><span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-[#8FB0F0] animate-ping opacity-60" /><span className="relative w-2 h-2 rounded-full bg-[#8FB0F0]" /></span>{label}</span>;
}

// ─── 아주 작은 마크다운(제목·굵게·목록·표·코드) — HTML 주입 없이 React 요소로 ───
function inline(text, keyBase) {
  const out = []; const re = /(\*\*[^*]+\*\*|`[^`]+`)/g; let last = 0; let m; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith("**") ? <strong key={`${keyBase}-${i++}`} className="font-black text-[#0F1A30]">{t.slice(2, -2)}</strong> : <code key={`${keyBase}-${i++}`} className="px-1.5 py-0.5 rounded-md bg-[#EEF2F8] text-[#1B2B4B] text-[0.92em]">{t.slice(1, -1)}</code>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
function Markdown({ text }) {
  const lines = String(text || "").split("\n");
  const blocks = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i += 1; }
      const cells = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map((r) => r.trim().slice(1, -1).split("|").map((c) => c.trim()));
      const [head, ...body] = cells;
      blocks.push(
        <div key={`t${i}`} className="my-2 overflow-x-auto rounded-xl border border-[#E3E8F0]">
          <table className="w-full text-[13.5px]">
            <thead><tr className="bg-[#1B2B4B] text-white">{(head || []).map((h, k) => <th key={k} className="px-3 py-2 text-left font-extrabold whitespace-nowrap">{inline(h, `h${i}${k}`)}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri} className="border-t border-[#EEF1F6] even:bg-[#F9FAFC]">{r.map((c, k) => <td key={k} className={`px-3 py-2 whitespace-nowrap ${/^[+-]?[$]?[\d,.]+(%|원)?$/.test(c.replace(/\s/g, "")) ? "text-right font-bold" : ""}`} style={NUM}>{inline(c, `c${i}${ri}${k}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) { blocks.push(<div key={i} className={`font-black text-[#0F1A30] ${h[1].length <= 2 ? "text-[16px] mt-3" : "text-[14.5px] mt-2.5"} mb-1`}>{inline(h[2], `g${i}`)}</div>); i += 1; continue; }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const items = []; const ordered = /^\s*\d+[.)]/.test(l);
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, "")); i += 1; }
      blocks.push(
        <div key={`l${i}`} className="my-1.5 space-y-1">
          {items.map((it, k) => (
            <div key={k} className="flex gap-2.5">
              {ordered ? <span className="shrink-0 w-5 h-5 mt-[1px] rounded-md bg-[#1B2B4B] text-white text-[11px] font-black flex items-center justify-center" style={NUM}>{k + 1}</span> : <span className="shrink-0 w-1.5 h-1.5 mt-[9px] rotate-45 bg-[#2D4C82]" />}
              <span className="min-w-0">{inline(it, `i${i}${k}`)}</span>
            </div>
          ))}
        </div>,
      );
      continue;
    }
    if (/^\s*---+\s*$/.test(l)) { blocks.push(<div key={i} className="my-3 h-px bg-[#E8EDF4]" />); i += 1; continue; }
    if (!l.trim()) { blocks.push(<div key={i} className="h-2" />); i += 1; continue; }
    blocks.push(<div key={i}>{inline(l, `p${i}`)}</div>); i += 1;
  }
  return <div className="text-[14.5px] leading-[1.7] text-[#26324A] break-words">{blocks}</div>;
}

// ─── 팀별 대화 상태(탭을 옮겨도 유지, 새로고침해도 이 창에서는 유지) ───
const STORE_KEY = (team) => `aiTeamChat:${team}`;
const memory = {};
function loadChat(team) {
  if (memory[team]) return memory[team];
  try { const v = JSON.parse(sessionStorage.getItem(STORE_KEY(team)) || "null"); if (v && Array.isArray(v.items)) return (memory[team] = v); } catch { /* 무시 */ }
  return (memory[team] = { items: [], history: [], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } });
}
function saveChat(team, v) {
  memory[team] = v;
  try { sessionStorage.setItem(STORE_KEY(team), JSON.stringify(v)); } catch { /* 용량 초과 등 — 메모리에는 남아 있다 */ }
}

const TOOL_LABEL = {
  get_invoices: "청구서", get_company_plans: "요금제", get_plan_requests: "요금제 변경 요청", get_inquiries: "도입 문의", get_sales_quotes: "견적서",
  get_applications: "가입 신청", get_support_requests: "원격 지원", get_companies_overview: "고객사 현황", get_session_logs: "접속 이력", get_active_sessions: "접속 세션", get_platform_notices: "플랫폼 공지",
};

// ═══════════════════════ 팀 대화 화면 ═══════════════════════
// ⭐ 2026-11-09 디자인 개편 — 디지털 콘솔 느낌(남색·시안), PC/모바일 공용.
//  말풍선(사용자 오른쪽 남색 · AI 왼쪽 흰 카드 + 팀 아바타), 조회한 데이터 칩, 분석 단계 표시, 얇은 오류 알림 + 다시 시도,
//  하단 고정 입력(자동 높이 · Enter 보내기 · Shift+Enter 줄바꿈 · 정지), 팀 정보 패널은 PC 오른쪽 / 모바일 아래로 작게.
const GRID_BG = "linear-gradient(rgba(27,43,75,.035) 1px, transparent 1px) 0 0/24px 24px, linear-gradient(90deg, rgba(27,43,75,.035) 1px, transparent 1px) 0 0/24px 24px, linear-gradient(#F8FAFD,#F2F5FA)";
const fmtTok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n || 0)}`);
const modelLabel = (m) => String(m || "").replace(/^claude-/, "").replace(/-(\d+)-(\d+)$/, " $1.$2").replace(/^./, (c) => c.toUpperCase());

export function AiTeamChat({ teamKey }) {
  const team = TEAM_BY_KEY[teamKey] || AI_TEAMS[0];
  const [chat, setChat] = React.useState(() => loadChat(team.key));
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null); // { msg, q, stopped }
  const [elapsed, setElapsed] = React.useState(0);
  const [copied, setCopied] = React.useState(-1);
  const scroller = React.useRef(null);
  const inputRef = React.useRef(null);
  const abortRef = React.useRef(null);
  const logs = useAiLogs(60);

  React.useEffect(() => { setChat(loadChat(team.key)); setErr(null); setText(""); }, [team.key]);
  React.useEffect(() => { const el = scroller.current; if (!el) return; if (!chat.items.length && !busy && !err) { el.scrollTop = 0; return; } el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [chat.items.length, busy, err]); // 빈 화면은 맨 위부터
  React.useEffect(() => { if (!busy) return undefined; const t0 = Date.now(); setElapsed(0); const t = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000); return () => clearInterval(t); }, [busy]);
  // 입력창 자동 높이(사파리는 field-sizing 미지원)
  React.useLayoutEffect(() => { const el = inputRef.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(160, el.scrollHeight)}px`; }, [text]);

  const send = async (q) => {
    const question = String(q ?? text).trim();
    if (!question || busy) return;
    setErr(null); setText("");
    const base = loadChat(team.key);
    const pending = { ...base, items: [...base.items, { role: "user", text: question, at: Date.now() }] };
    setChat(pending); saveChat(team.key, pending);
    setBusy(true);
    const ac = new AbortController(); abortRef.current = ac;
    const t0 = Date.now();
    try {
      const token = await auth.currentUser?.getIdToken();
      const r = await fetch(`${FUNCTIONS_BASE}/aiTeamChat`, { method: "POST", signal: ac.signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ team: team.key, history: base.history, text: question }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `서버 오류(${r.status})`);
      const u = j.usage || {};
      const next = {
        items: [...pending.items, { role: "assistant", text: j.reply, used: j.used || [], cost: costOf(u), tokens: (u.input || 0) + (u.output || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0), model: j.model || "", secs: Math.round((Date.now() - t0) / 1000), at: Date.now() }],
        history: Array.isArray(j.history) ? j.history : base.history,
        usage: { input: base.usage.input + (u.input || 0), output: base.usage.output + (u.output || 0), cacheRead: base.usage.cacheRead + (u.cacheRead || 0), cacheWrite: base.usage.cacheWrite + (u.cacheWrite || 0) },
      };
      setChat(next); saveChat(team.key, next);
    } catch (e) {
      // 실패한 질문은 대화 기록(history)에 넣지 않았으므로 화면에서만 빼고 입력창에 되돌린다
      setChat(base); saveChat(team.key, base); setText(question);
      const stopped = e?.name === "AbortError";
      setErr({ msg: stopped ? "답변을 멈췄습니다." : (e?.message || String(e)), q: question, stopped });
    } finally { abortRef.current = null; setBusy(false); setTimeout(() => inputRef.current?.focus(), 0); }
  };
  const stop = () => { try { abortRef.current?.abort(); } catch { /* 무시 */ } };
  const reset = async () => { if (chat.items.length && !(await kpConfirm("이 팀과의 대화를 지우고 새로 시작할까요?", { okText: "새로 시작" }))) return; const v = { items: [], history: [], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }; setChat(v); saveChat(team.key, v); setErr(null); };
  const copy = (t, i) => { try { navigator.clipboard.writeText(t); setCopied(i); setTimeout(() => setCopied(-1), 1400); } catch { /* 무시 */ } };

  const sessionCost = costOf(chat.usage);
  const sessionTok = chat.usage.input + chat.usage.output + chat.usage.cacheRead + chat.usage.cacheWrite;
  const asked = chat.items.filter((x) => x.role === "user").length;
  const teamLogs = (logs || []).filter((l) => l.team === team.key);
  // 분석 단계(진행 표시) — 질문 이해 → 팀 데이터 하나씩 조회 → 분석 → 정리
  const steps = ["질문 이해", ...team.access.map((a) => `${a} 조회`), "결과 분석", "보고서 정리"];
  const stepIdx = Math.min(steps.length - 1, elapsed < 3 ? 0 : 1 + Math.floor((elapsed - 3) / 4));

  return (
    <div className="kp-ai space-y-3 sm:space-y-4">
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_288px] 2xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── 콘솔(대화) ── */}
        <div className="relative bg-white rounded-[20px] border border-[#DCE3EE] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_14px_34px_rgba(16,24,40,0.07)] overflow-hidden flex flex-col min-w-0 h-[calc(100dvh-230px)] lg:h-[calc(100vh-200px)] min-h-[480px]">
          {/* 머리 */}
          <div className="relative overflow-hidden px-3.5 sm:px-5 py-3 sm:py-3.5 text-white flex items-center gap-3" style={{ background: HERO_BG }}>
            <span className="kp-ai-sweep pointer-events-none absolute inset-y-0 -left-1/3 w-1/3" aria-hidden />
            <TeamMark team={team} size={42} dark />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-[16px] sm:text-[18px] font-black tracking-tight whitespace-nowrap truncate">{team.name} AI</span>
                <Live label={busy ? "ANALYZING" : "ONLINE"} />
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] font-bold text-white/55 whitespace-nowrap overflow-hidden" style={NUM}>
                <span className="tracking-[0.16em]">READ-ONLY</span><span className="text-white/25">|</span>
                <span>데이터 {team.access.length}종 연결</span><span className="hidden sm:inline text-white/25">|</span>
                <span className="hidden sm:inline">질문 {asked} · {fmtTok(sessionTok)} tok · {usd(sessionCost)}</span>
              </div>
            </div>
            <button type="button" onClick={reset} disabled={busy} title="새 대화" className="shrink-0 h-9 px-3 rounded-xl bg-white/10 ring-1 ring-white/15 text-[13px] font-black whitespace-nowrap hover:bg-white/20 disabled:opacity-40 inline-flex items-center gap-1.5"><ShellIcon name="refresh" size={14} /><span className="hidden sm:inline">새 대화</span></button>
          </div>

          {/* 대화 */}
          <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-6 py-4 sm:py-5 space-y-5" style={{ background: GRID_BG }}>
            {!chat.items.length && (
              <div className="min-h-full flex flex-col items-center justify-center text-center py-4">
                <div className="relative">
                  <span className="absolute -inset-3 rounded-[22px] border border-[#8FB0F0]/50 kp-ai-ring" aria-hidden />
                  <TeamMark team={team} size={52} />
                </div>
                <div className="mt-4 sm:mt-6 text-[10.5px] font-extrabold tracking-[0.3em] text-[#4B6CB7]" style={NUM}>AI TEAM · {team.en}</div>
                <div className="mt-1 text-[21px] sm:text-[24px] font-black text-[#0F1A30] tracking-tight">무엇을 도와드릴까요?</div>
                <div className="mt-1.5 text-[12.5px] sm:text-[13.5px] text-[#7A879C] max-w-[460px] leading-relaxed">관리자센터 데이터를 직접 조회해 근거 숫자와 함께 답합니다.<br className="hidden sm:block" /> 데이터는 바꾸지 않고, 필요한 조치는 할 일로 정리합니다.</div>
                <div className="hidden sm:flex mt-3 flex-wrap justify-center gap-1.5">{team.access.map((a) => <span key={a} className="h-6 px-2 rounded-md bg-white border border-[#DCE3EE] text-[11.5px] font-bold text-[#2D4C82] inline-flex items-center gap-1 whitespace-nowrap"><span className="w-1 h-1 rounded-full bg-[#4B6CB7]" />{a}</span>)}</div>
                <div className="mt-4 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-[680px]">
                  {team.quick.map((q, k) => (
                    <button key={q} type="button" onClick={() => send(q)} className="group text-left px-3.5 py-3 rounded-xl bg-white/90 border border-[#E3E8F0] hover:border-[#2D4C82] hover:bg-white hover:shadow-[0_8px_20px_rgba(27,43,75,.10)] transition flex items-center gap-3 min-w-0">
                      <span className="shrink-0 w-8 h-8 rounded-lg bg-[#0F1A30] text-[#8FB0F0] text-[11px] font-black flex items-center justify-center group-hover:bg-[#2D4C82] group-hover:text-white transition" style={NUM}>{String(k + 1).padStart(2, "0")}</span>
                      <span className="text-[13.5px] font-bold text-[#26324A] leading-snug min-w-0">{q}</span>
                      <span className="ml-auto shrink-0 text-[#A3AEC2] group-hover:text-[#2D4C82] transition" aria-hidden>→</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chat.items.map((m, i) => (m.role === "user" ? (
              <div key={i} className="flex justify-end kp-ai-in">
                <div className="max-w-[88%] sm:max-w-[72%]">
                  <div className="px-4 py-2.5 rounded-[18px] rounded-br-[6px] bg-gradient-to-br from-[#0F1A30] to-[#2D4C82] text-white text-[14.5px] leading-relaxed whitespace-pre-wrap break-words shadow-[0_8px_18px_rgba(27,43,75,.22)]">{m.text}</div>
                  <div className="mt-1 text-right text-[10.5px] text-[#9AA9C3]" style={NUM}>{hhmm(m.at)}</div>
                </div>
              </div>
            ) : (
              <div key={i} className="flex gap-2.5 sm:gap-3 kp-ai-in">
                <div className="hidden sm:block pt-0.5"><TeamMark team={team} size={30} /></div>
                <div className="min-w-0 flex-1 max-w-[940px]">
                  <div className="flex items-center gap-2 mb-1.5 min-w-0">
                    <span className="sm:hidden shrink-0 w-6 h-6 rounded-lg bg-gradient-to-br from-[#0F1A30] to-[#2D4C82] text-[#8FB0F0] text-[8px] font-black flex items-center justify-center" style={NUM}>{team.code}</span>
                    <span className="text-[12.5px] font-black text-[#0F1A30] whitespace-nowrap">{team.name} AI</span>
                    <span className="text-[10.5px] text-[#9AA9C3] whitespace-nowrap" style={NUM}>{hhmm(m.at)}{m.secs ? ` · ${m.secs}s` : ""}</span>
                  </div>
                  <div className="relative px-4 sm:px-5 py-3.5 rounded-[18px] rounded-tl-[6px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_6px_16px_rgba(16,24,40,0.04)] overflow-hidden">
                    <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r bg-gradient-to-b from-[#8FB0F0] to-[#2D4C82]" aria-hidden />
                    <Markdown text={m.text} />
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    {!!(m.used || []).length && <span className="text-[10px] font-extrabold tracking-[0.18em] text-[#94A3B8] mr-0.5" style={NUM}>SOURCE</span>}
                    {(m.used || []).map((u) => <span key={u} className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-[#EEF3FB] border border-[#DCE6F5] text-[#2D4C82] text-[11.5px] font-extrabold whitespace-nowrap"><ShellIcon name="check" size={11} strokeWidth={2.6} />{TOOL_LABEL[u] || u}</span>)}
                    <span className="h-6 px-1.5 text-[10.5px] font-bold text-[#A3AEC2] inline-flex items-center whitespace-nowrap" style={NUM}>{m.tokens ? `${fmtTok(m.tokens)} tok · ` : ""}{usd(m.cost || 0)}{m.model ? ` · ${modelLabel(m.model)}` : ""}</span>
                    <button type="button" onClick={() => copy(m.text, i)} className="ml-auto h-7 px-2.5 rounded-lg text-[12px] font-bold text-[#7A879C] hover:bg-[#EEF2F8] hover:text-[#1B2B4B] inline-flex items-center gap-1.5"><ShellIcon name={copied === i ? "check" : "file"} size={13} />{copied === i ? "복사됨" : "복사"}</button>
                  </div>
                </div>
              </div>
            )))}

            {busy && (
              <div className="flex gap-2.5 sm:gap-3 kp-ai-in">
                <div className="hidden sm:block pt-0.5"><TeamMark team={team} size={30} /></div>
                <div className="relative overflow-hidden px-4 py-3.5 rounded-[18px] rounded-tl-[6px] bg-[#0F1A30] text-white w-full max-w-[420px] shadow-[0_10px_24px_rgba(15,26,48,.25)]">
                  <span className="kp-ai-scan pointer-events-none absolute inset-x-0 h-10" aria-hidden />
                  <div className="relative flex items-center gap-2.5">
                    <span className="flex gap-1">{[0, 1, 2].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full bg-[#8FB0F0] animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />)}</span>
                    <span className="text-[13.5px] font-black whitespace-nowrap truncate">{steps[stepIdx]} 중…</span>
                    <span className="ml-auto text-[11px] font-bold text-white/50 whitespace-nowrap" style={NUM}>{String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</span>
                  </div>
                  <div className="relative mt-3 space-y-1">
                    {steps.map((s, k) => (
                      <div key={s} className={`flex items-center gap-2 text-[12px] font-bold ${k < stepIdx ? "text-white/55" : k === stepIdx ? "text-[#CFE0FF]" : "text-white/25"}`}>
                        <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${k < stepIdx ? "bg-[#4B6CB7] text-white" : k === stepIdx ? "ring-2 ring-[#8FB0F0]" : "ring-1 ring-white/20"}`}>{k < stepIdx && <ShellIcon name="check" size={9} strokeWidth={3} />}{k === stepIdx && <span className="w-1.5 h-1.5 rounded-full bg-[#8FB0F0] animate-pulse" />}</span>
                        <span className="whitespace-nowrap">{s}</span>
                      </div>
                    ))}
                  </div>
                  <div className="relative mt-3 h-[3px] rounded-full bg-white/10 overflow-hidden"><div className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-[#8FB0F0] to-transparent animate-[aiScan_1.4s_ease-in-out_infinite]" /></div>
                </div>
              </div>
            )}

            {err && (
              <div className={`kp-ai-in flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-white border ${err.stopped ? "border-[#DCE3EE]" : "border-[#F3B4B4]"} shadow-[0_1px_2px_rgba(16,24,40,0.04)]`}>
                <ShellIcon name="alert" size={16} className={`shrink-0 mt-0.5 ${err.stopped ? "text-[#7A879C]" : "text-[#D64545]"}`} />
                <div className="min-w-0 flex-1">
                  <div className={`text-[10.5px] font-extrabold tracking-[0.16em] ${err.stopped ? "text-[#7A879C]" : "text-[#D64545]"}`} style={NUM}>{err.stopped ? "STOPPED" : "ERROR"}</div>
                  <div className="text-[13px] font-bold text-[#26324A] break-words">{err.msg}</div>
                </div>
                <button type="button" onClick={() => send(err.q)} className="shrink-0 h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black whitespace-nowrap hover:bg-[#1B2B4B] inline-flex items-center gap-1.5"><ShellIcon name="refresh" size={13} />다시 시도</button>
              </div>
            )}
          </div>

          {/* 입력 */}
          <div className="border-t border-[#E8EDF4] bg-white px-3 sm:px-4 pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))]">
            {!!chat.items.length && !busy && (
              <div className="mb-2 flex gap-1.5 overflow-x-auto -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
                {team.quick.map((q) => <button key={q} type="button" onClick={() => send(q)} className="shrink-0 h-8 px-3 rounded-full bg-[#F4F7FB] border border-[#E3E8F0] text-[12.5px] font-bold text-[#3A4A66] hover:border-[#2D4C82] hover:text-[#1B2B4B] whitespace-nowrap">{q}</button>)}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-[16px] border border-[#DCE3EE] focus-within:border-[#2D4C82] focus-within:shadow-[0_0_0_4px_rgba(45,76,130,.10)] bg-[#FBFCFE] pl-3.5 pr-1.5 py-1.5 transition">
              <textarea ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} rows={1} disabled={busy}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
                placeholder={`${team.name} AI에게 질문하기`}
                className="kp-ai-input flex-1 min-w-0 resize-none bg-transparent outline-none text-[16px] lg:text-[14.5px] leading-[1.5] text-[#0F1A30] placeholder:text-[#A3AEC2]"
                style={{ border: 0, outline: "none", boxShadow: "none", background: "transparent", padding: "8px 0", maxHeight: 160 }} />
              {busy ? (
                <button type="button" onClick={stop} aria-label="정지" title="답변 멈추기"
                  className="shrink-0 h-10 w-10 rounded-xl bg-[#0F1A30] text-white flex items-center justify-center hover:bg-[#1B2B4B] transition"><span className="w-3 h-3 rounded-[3px] bg-white" /></button>
              ) : (
                <button type="button" onClick={() => send()} disabled={!text.trim()} aria-label="보내기"
                  className="shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br from-[#0F1A30] to-[#2D4C82] text-white flex items-center justify-center hover:brightness-110 disabled:opacity-30 transition"><ShellIcon name="send" size={17} /></button>
              )}
            </div>
            <div className="hidden sm:flex mt-1.5 px-1 items-center justify-between text-[10.5px] font-bold text-[#A3AEC2]" style={NUM}>
              <span>Enter 보내기 · Shift+Enter 줄바꿈</span><span className="tracking-[0.14em]">READ-ONLY · 데이터는 바뀌지 않습니다</span>
            </div>
          </div>
        </div>

        {/* ── 팀 정보(PC 오른쪽 · 모바일 아래) ── */}
        <div className="space-y-3 min-w-0">
          <div className="bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-4">
            <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" /><span className="text-[10.5px] font-extrabold tracking-[0.2em] text-[#94A3B8]" style={NUM}>PROFILE</span><span className="text-[14px] font-black text-[#0F1A30]">팀 정보</span></div>
            <div className="mt-2 text-[12.5px] text-[#5B6B85] leading-relaxed">{team.desc}</div>
            <div className="mt-3 text-[10px] font-extrabold tracking-[0.2em] text-[#94A3B8]" style={NUM}>DATA ACCESS · 읽기 전용</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{team.access.map((a) => <span key={a} className="h-6 px-2 rounded-md bg-[#F1F4F9] border border-[#E3E8F0] text-[11.5px] font-bold text-[#1B2B4B] inline-flex items-center gap-1 whitespace-nowrap"><span className="w-1 h-1 rotate-45 bg-[#2D4C82]" />{a}</span>)}</div>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {[["질문", `${asked}`], ["토큰", fmtTok(sessionTok)], ["비용", usd(sessionCost)]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-[#0F1A30] px-2.5 py-2 min-w-0">
                  <div className="text-[10px] font-bold text-white/45 whitespace-nowrap">{l}</div>
                  <div className="text-[14px] font-black text-white whitespace-nowrap truncate" style={NUM}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
            <div className="flex items-center gap-2 px-4 pt-3.5 pb-2"><span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" /><span className="text-[10.5px] font-extrabold tracking-[0.2em] text-[#94A3B8]" style={NUM}>ACTIVITY</span><span className="text-[14px] font-black text-[#0F1A30]">최근 질문</span></div>
            {logs == null ? <div className="px-4 pb-3.5 text-[12.5px] text-[#9AA9C3]">불러오는 중…</div>
              : !teamLogs.length ? <div className="px-4 pb-3.5 text-[12.5px] text-[#9AA9C3]">아직 기록이 없습니다.</div>
                : <div className="divide-y divide-[#EEF1F6] border-t border-[#EEF1F6]">{teamLogs.slice(0, 5).map((l) => (
                  <button key={l.id} type="button" onClick={() => { setText(l.question || ""); inputRef.current?.focus(); }} className="w-full text-left px-4 py-2 hover:bg-[#F7F9FC]">
                    <div className="text-[12.5px] font-bold text-[#26324A] truncate">{l.question}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-[#9AA9C3] min-w-0" style={NUM}><span className="shrink-0">{ago(msOf(l.at))}</span><span>·</span><span className="truncate">{l.email}</span></div>
                  </button>))}</div>}
          </div>
          <div className="px-1 text-[11.5px] text-[#9AA9C3] leading-relaxed">AI 답변은 조회한 데이터를 근거로 하지만 틀릴 수 있습니다. 청구·계정 변경처럼 중요한 일은 해당 메뉴에서 확인 후 처리해 주세요.</div>
        </div>
      </div>
      <style>{`
        @keyframes aiScan{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
        @keyframes kpAiSweep{0%{transform:translateX(0)}100%{transform:translateX(450%)}}
        @keyframes kpAiScanY{0%{top:-40px}100%{top:100%}}
        @keyframes kpAiIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        @keyframes kpAiRing{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:.9;transform:scale(1.05)}}
        .kp-ai .kp-ai-sweep{background:linear-gradient(90deg,transparent,rgba(143,176,240,.14),transparent);animation:kpAiSweep 5s linear infinite}
        .kp-ai .kp-ai-scan{background:linear-gradient(180deg,transparent,rgba(143,176,240,.16),transparent);animation:kpAiScanY 2.2s linear infinite}
        .kp-ai .kp-ai-in{animation:kpAiIn .25s ease both}
        .kp-ai .kp-ai-ring{animation:kpAiRing 2.4s ease-in-out infinite}
        textarea.kp-ai-input, textarea.kp-ai-input:focus{border-color:transparent !important;box-shadow:none !important;outline:none !important;background:transparent !important}
        @media (prefers-reduced-motion: reduce){.kp-ai .kp-ai-sweep,.kp-ai .kp-ai-scan,.kp-ai .kp-ai-ring{animation:none}}
      `}</style>
    </div>
  );
}

// ═══════════════════════ AI 팀 개요 ═══════════════════════
export function AiTeamHub({ go }) {
  const logs = useAiLogs(400);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthLogs = (logs || []).filter((l) => msOf(l.at) >= monthStart);
  const by = {};
  AI_TEAMS.forEach((t) => { by[t.key] = { count: 0, cost: 0, last: 0, lastQ: "" }; });
  monthLogs.forEach((l) => { const b = by[l.team]; if (!b) return; b.count += 1; b.cost += costOf(l.usage); });
  (logs || []).forEach((l) => { const b = by[l.team]; if (b && msOf(l.at) > b.last) { b.last = msOf(l.at); b.lastQ = l.question || ""; } });
  const totalCost = monthLogs.reduce((a, l) => a + costOf(l.usage), 0);
  const totalTokens = monthLogs.reduce((a, l) => a + (l.usage?.input || 0) + (l.usage?.output || 0) + (l.usage?.cacheRead || 0) + (l.usage?.cacheWrite || 0), 0);
  const people = new Set(monthLogs.map((l) => l.email).filter(Boolean)).size;

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="relative overflow-hidden rounded-[18px] sm:rounded-[22px] px-4 py-5 sm:px-7 sm:py-6 text-white" style={{ background: HERO_BG }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3"><span className="text-[10px] sm:text-[11px] font-extrabold tracking-[0.28em] text-[#8FB0F0] whitespace-nowrap" style={NUM}>AI TEAMS · OVERVIEW</span><Live label={`${AI_TEAMS.length} TEAMS ONLINE`} /></div>
            <div className="text-[21px] sm:text-[27px] font-black mt-1 tracking-tight whitespace-nowrap">AI 팀 본부</div>
            <div className="hidden sm:block text-[13.5px] text-white/65 mt-1 max-w-[760px]">팀마다 맡은 데이터만 읽고 보고하는 AI 팀장들입니다. 데이터를 바꾸지는 않으며, 필요한 조치는 할 일로 제안합니다.</div>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
            {[["MONTH COST", usd(totalCost), `${ym} 예상`], ["QUESTIONS", fmtN(monthLogs.length), "이번 달 질문"], ["TOKENS", totalTokens >= 1e6 ? `${(totalTokens / 1e6).toFixed(1)}M` : `${fmtN(totalTokens / 1000)}K`, `${people}명 사용`]].map(([c, v, s]) => (
              <div key={c} className="px-3.5 py-2.5 rounded-xl bg-white/[0.06] ring-1 ring-white/10 min-w-[104px]">
                <div className="text-[9.5px] font-extrabold tracking-[0.22em] text-white/50 whitespace-nowrap" style={NUM}>{c}</div>
                <div className="text-[19px] sm:text-[21px] font-black mt-0.5 whitespace-nowrap" style={NUM}>{v}</div>
                <div className="text-[11px] text-white/55 whitespace-nowrap">{s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {AI_TEAMS.map((t) => {
          const b = by[t.key];
          return (
            <button key={t.key} type="button" onClick={() => go(`ai:${t.key}`)}
              className="group text-left bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)] hover:border-[#2D4C82] hover:shadow-[0_14px_34px_rgba(27,43,75,.14)] hover:-translate-y-0.5 transition p-5 flex flex-col min-w-0">
              <div className="flex items-start gap-4">
                <TeamMark team={t} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="text-[10.5px] font-extrabold tracking-[0.2em] text-[#94A3B8]" style={NUM}>{t.en}</div>
                  <div className="text-[17px] font-black text-[#0F1A30] whitespace-nowrap">{t.name}</div>
                  <div className="mt-0.5 text-[12.5px] text-[#7A879C] truncate">{t.desc}</div>
                </div>
                <span className="shrink-0 w-8 h-8 rounded-lg bg-[#F1F4F9] text-[#1B2B4B] flex items-center justify-center group-hover:bg-[#0F1A30] group-hover:text-white transition" aria-hidden>→</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">{t.access.map((a) => <span key={a} className="h-6 px-2 rounded-md bg-[#F1F4F9] text-[11.5px] font-bold text-[#3A4A66] whitespace-nowrap">{a}</span>)}</div>
              <div className="mt-4 pt-3.5 border-t border-[#EEF1F6] grid grid-cols-3 gap-2">
                <MiniStat label="이번 달 질문" value={fmtN(b.count)} />
                <MiniStat label="이번 달 비용" value={usd(b.cost)} />
                <MiniStat label="마지막 사용" value={ago(b.last)} />
              </div>
              {b.lastQ && <div className="mt-3 px-3 py-2 rounded-lg bg-[#F7F9FC] text-[12.5px] text-[#5B6B85] truncate">“{b.lastQ}”</div>}
            </button>
          );
        })}
      </div>

      <Panel code="LOG" title="최근 AI 사용 기록" bodyClass="p-0">
        {logs == null ? <div className="p-5 text-[13px] text-[#9AA9C3]">불러오는 중…</div>
          : !logs.length ? <div className="p-5 text-[13.5px] text-[#7A879C]">아직 사용 기록이 없습니다. 위에서 팀을 골라 첫 질문을 해 보세요.</div>
            : <div className="overflow-x-auto"><table className="w-full text-[13.5px]" style={{ minWidth: 760 }}>
              <thead><tr className="bg-[#1B2B4B] text-white">{["시각", "팀", "질문", "사용자", "조회", "비용"].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>{logs.slice(0, 15).map((l) => (
                <tr key={l.id} className="border-t border-[#EEF1F6] hover:bg-[#F9FAFC]">
                  <td className="px-3 py-2 text-center text-[12.5px] text-[#5B6B85] whitespace-nowrap" style={NUM}>{msOf(l.at) ? new Date(msOf(l.at)).toLocaleString("ko-KR", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap"><span className="px-2 py-0.5 rounded-md bg-[#EEF2F8] text-[#1B2B4B] text-[12px] font-black">{TEAM_BY_KEY[l.team]?.name || l.team}</span></td>
                  <td className="px-3 py-2 max-w-[360px] truncate font-bold text-[#26324A]">{l.question}</td>
                  <td className="px-3 py-2 text-center text-[#5B6B85] whitespace-nowrap">{l.email}</td>
                  <td className="px-3 py-2 text-center text-[12px] text-[#7A89A3] whitespace-nowrap">{(l.tools || []).map((x) => TOOL_LABEL[x] || x).join(" · ") || "-"}</td>
                  <td className="px-3 py-2 text-right font-bold whitespace-nowrap" style={NUM}>{usd(costOf(l.usage))}</td>
                </tr>))}</tbody>
            </table></div>}
      </Panel>
      <div className="text-[12px] text-[#9AA9C3] px-1">비용은 Claude Opus 5.5 표준 단가로 계산한 어림값입니다. 정확한 청구 금액은 Claude Console › 지출에서 확인하세요.</div>
    </div>
  );
}
function MiniStat({ label, value }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold text-[#9AA9C3] whitespace-nowrap">{label}</div>
      <div className="mt-0.5 text-[15px] font-black text-[#0F1A30] whitespace-nowrap truncate" style={NUM}>{value}</div>
    </div>
  );
}
